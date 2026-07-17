// Playwright-Smoke: ERP — Abweichende Zustelladresse vs. Rechnungsempfänger (07/2026)
//   - Kunde bleibt Rechnungsempfänger & Zahler (QR-Zahlteil lautet IMMER auf ihn)
//   - Optional pro Dokument: zustellSnapshot (Verwaltung/Architekt/c/o) — Modal mit
//     Kundenstamm-Prefill; PDF-Fensteradresse = Zustelladresse, Meta-Zeile weist den
//     Kunden als «Auftraggeber:»/«Rechnungsempfänger:» aus
//   - Vererbung Offerte → Auftrag → Rechnung; entfernen jederzeit möglich
// Ausführen: CHROME=<chromium> node scripts/erp_zustelladresse_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};
const pdfHtml = async (page) => page.evaluate(() => {
  window._pdfHtml = '';
  const orig = window.open;
  window.open = function () { return { document: { write: s => { window._pdfHtml += s; }, close: () => {} }, close: () => {} }; };
  erpPdf();
  window.open = orig;
  return window._pdfHtml;
});

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpZustellOpen === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

console.log('■ Offerte: Zustelladresse setzen (Modal)');
await page.evaluate(() => {
  // Kundenstamm-Eintrag für den Prefill-Test
  poolSave(KUN_POOL, KUN_PREFIX, { id: 'kd_verw', orgId: 'org_test', firma: 'Liegenschaftsverwaltung Beispiel AG', kontakt: 'Frau Beispiel', strasse: 'Postfach 99', plz: '4001', ort: 'Basel' });
  erpNeu('offerte');
  cur.titel = 'Boiler ersetzen';
  cur.kundeSnapshot = { firma: 'Muster Immobilien AG', strasse: 'Bahnhofstrasse 1', plz: '4132', ort: 'Muttenz' };
  cur.mwstPct = 8.1;
  cur.positionen = [{ id: 'p1', art: 'frei', bez: 'Boiler 300 l', menge: 1, einheit: 'Stk', ep: 2400 }];
  erpOpenEditor();
});
ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('Abweichende Zustelladresse …') >= 0), 'Editor bietet «✉️ Abweichende Zustelladresse …»');
ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('Kunde (Rechnungsempfänger/Zahler)') >= 0), 'Kunden-Box benennt die Rolle (Rechnungsempfänger/Zahler)');
await page.evaluate(() => {
  erpZustellOpen();
  erpZustellPrefill('kd_verw');   // aus Kundenstamm übernehmen
});
ok(await page.evaluate(() => document.getElementById('z_firma').value === 'Liegenschaftsverwaltung Beispiel AG' && document.getElementById('z_plz').value === '4001'), 'Kundenstamm-Prefill füllt die Felder');
await page.evaluate(() => erpZustellSave());
{
  const zu = await page.evaluate(() => cur.zustellSnapshot);
  ok(zu && zu.firma === 'Liegenschaftsverwaltung Beispiel AG' && zu.strasse === 'Postfach 99', 'zustellSnapshot gespeichert');
  ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('Zustelladresse (abweichend)') >= 0), 'Editor zeigt die blaue Zustelladresse-Box');
}

console.log('■ PDF Offerte: Fenster = Zustelladresse, Meta = Auftraggeber');
{
  const html = await pdfHtml(page);
  const adr = html.slice(html.indexOf('class="adr-r"'), html.indexOf('class="adr-r"') + 300);
  ok(adr.indexOf('Liegenschaftsverwaltung Beispiel AG') >= 0 && adr.indexOf('Postfach 99') >= 0, 'Fensteradresse = Zustelladresse (Verwaltung, Postfach)');
  ok(adr.indexOf('Muster Immobilien') < 0, 'Kunde steht nicht im Fenster');
  ok(html.indexOf('Auftraggeber:') >= 0 && html.indexOf('Muster Immobilien AG') >= 0, 'Meta-Zeile «Auftraggeber: Muster Immobilien AG»');
}

console.log('■ Vererbung: Offerte → Auftrag → Akontorechnung');
await page.evaluate(() => { erpSaveCur(true); erpZuAuftrag(); });
await page.waitForTimeout(300);
ok(await page.evaluate(() => cur.typ === 'auftrag' && cur.zustellSnapshot && cur.zustellSnapshot.firma === 'Liegenschaftsverwaltung Beispiel AG'), 'Auftrag erbt die Zustelladresse');
await page.evaluate(() => {
  const re = _erpNeueRechnung(cur, 'akonto', [{ id: 'a1', art: 'akonto', bez: 'Akonto', menge: 1, einheit: 'pausch.', ep: 800 }], 'Akonto');
  window._reId = re.id;
});
ok(await page.evaluate(() => {
  const re = (GemaSync.getCached('gema_erp_dok_pool_v1') || []).find(x => x.id === window._reId);
  return re.zustellSnapshot && re.zustellSnapshot.firma === 'Liegenschaftsverwaltung Beispiel AG';
}), 'Rechnung erbt die Zustelladresse');

console.log('■ PDF Rechnung: Fenster = Zustellung, QR-Zahlteil = Kunde');
await page.evaluate(() => {
  // IBAN für den QR-Zahlteil setzen
  const org = GemaAuth.getOrgs()[0];
  const st = org.settings || {};
  st.erp = Object.assign({}, st.erp, { iban: 'CH9300762011623852957', name: 'Testfirma AG', strasse: 'Weg 1', plz: '4000', ort: 'Basel' });
  GemaAuth.updateOrgSettings(org.id, st);
  erpOpen(window._reId);
});
{
  const html = await pdfHtml(page);
  ok(html.indexOf('Rechnungsempfänger:') >= 0, 'Rechnung: Meta-Zeile «Rechnungsempfänger:» (Kunde bleibt ausgewiesen)');
  const payload = await page.evaluate(() => erpQrPayload(cur, erpSettings(), erpDocTotals(cur)));
  ok(payload.indexOf('Muster Immobilien AG') >= 0, 'QR-Zahlteil: Zahlungspflichtiger = Kunde');
  ok(payload.indexOf('Liegenschaftsverwaltung') < 0, 'QR-Zahlteil: Zustelladresse taucht NICHT als Zahler auf');
}

console.log('■ Entfernen + ohne Zustelladresse unverändert');
await page.evaluate(() => erpZustellRemove());
ok(await page.evaluate(() => cur.zustellSnapshot === null), 'Zustelladresse entfernt');
{
  const html = await pdfHtml(page);
  const adr = html.slice(html.indexOf('class="adr-r"'), html.indexOf('class="adr-r"') + 300);
  ok(adr.indexOf('Muster Immobilien AG') >= 0 && html.indexOf('Rechnungsempfänger:') < 0, 'Ohne Zustelladresse: Fenster = Kunde, keine Extra-Meta-Zeile');
}

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
