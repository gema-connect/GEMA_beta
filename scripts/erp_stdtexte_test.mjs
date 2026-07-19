// Playwright-Smoke: ERP-Standardtexte — Vorgabetexte ab Werk, editierbar,
// in Dokument + PDF übernommen (Einleitung/Schluss/Konditionen).
// Ausführen: CHROME=<chromium> node scripts/erp_stdtexte_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpSettings === 'function' && typeof ERP_TXT_DEFAULTS === 'object', null, { timeout: 12000 });
await page.waitForTimeout(300);

console.log('■ Vorgabetexte ab Werk (ohne Konfiguration)');
ok(await page.evaluate(() => { const s = erpSettings(); return /Wir danken für Ihre Anfrage/.test(s.txtOfferteIntro) && s.txtOfferteIntro === ERP_TXT_DEFAULTS.txtOfferteIntro; }), 'Offert-Einleitung ist ab Werk gefüllt');
ok(await page.evaluate(() => { const s = erpSettings(); return s.txtRechnungIntro === ERP_TXT_DEFAULTS.txtRechnungIntro && s.txtKonditionen === ERP_TXT_DEFAULTS.txtKonditionen && s.txtOfferte && s.txtRechnung && s.txtAuftrag && s.txtAuftragIntro; }), 'alle 7 Standardtexte sind vorbelegt');

console.log('■ Neue Offerte / Rechnung stempeln die Standardtexte');
ok(await page.evaluate(() => { erpNeu('offerte'); return cur.einleitung === ERP_TXT_DEFAULTS.txtOfferteIntro && cur.schlusstext === ERP_TXT_DEFAULTS.txtOfferte; }), 'neue Offerte: Einleitung + Schlusstext vorbefüllt');
ok(await page.evaluate(() => { erpNeu('rechnung'); return cur.einleitung === ERP_TXT_DEFAULTS.txtRechnungIntro && cur.schlusstext === ERP_TXT_DEFAULTS.txtRechnung; }), 'neue Rechnung: Einleitung + Schlusstext vorbefüllt');
ok(await page.evaluate(() => { erpNeu('auftrag'); return cur.einleitung === ERP_TXT_DEFAULTS.txtAuftragIntro; }), 'neuer Auftrag: Einleitung vorbefüllt');

console.log('■ Einstellungs-Dialog zeigt die Texte + «Standardtexte einsetzen»');
ok(await page.evaluate(() => { erpOpenSettings(); return document.getElementById('s_txtOfferteIntro').value === ERP_TXT_DEFAULTS.txtOfferteIntro && document.getElementById('s_txtKonditionen').value === ERP_TXT_DEFAULTS.txtKonditionen; }), 'Settings-Textfelder mit Defaults vorgefüllt');
ok(await page.evaluate(() => typeof erpTxtDefaults === 'function'), 'erpTxtDefaults vorhanden');
ok(await page.evaluate(() => { document.getElementById('s_txtOfferte').value = ''; erpTxtDefaults(); return document.getElementById('s_txtOfferte').value === ERP_TXT_DEFAULTS.txtOfferte; }), '«Standardtexte einsetzen» füllt geleertes Feld wieder');

console.log('■ Eigener Text wird respektiert; leeres Feld fällt auf Default zurück');
ok(await page.evaluate(() => {
  const org = GemaAuth.getCurrentOrg();
  const st = Object.assign({}, org.settings || {});
  st.erp = Object.assign({}, st.erp || {}, { txtOfferteIntro: 'Mein eigener Intro-Text', txtRechnung: '' });
  GemaAuth.updateOrgSettings(org.id, st);
  const s = erpSettings();
  return s.txtOfferteIntro === 'Mein eigener Intro-Text' && s.txtRechnung === ERP_TXT_DEFAULTS.txtRechnung;
}), 'eigener Text bleibt, geleertes Feld → Default');

console.log('■ PDF enthält Einleitung, Schlusstext und Konditionen');
{
  const html = await page.evaluate(() => {
    const org = GemaAuth.getCurrentOrg(); const st = Object.assign({}, org.settings || {}); st.erp = {}; GemaAuth.updateOrgSettings(org.id, st);   // wieder Defaults
    erpNeu('offerte'); cur.kundeSnapshot = { firma: 'Muster AG' }; cur.titel = 'Testofferte'; erpSaveCur(true); erpOpen(cur.id);
    let cap = ''; const orig = window.open;
    window.open = function () { return { document: { write(s) { cap += s; }, close() {}, title: '' }, focus() {}, print() {}, closed: false }; };
    try { erpPdf(); } catch (e) { cap += ' ERR:' + e.message; }
    window.open = orig;
    return cap;
  });
  ok(/Wir danken für Ihre Anfrage/.test(html), 'PDF: Standard-Einleitung');
  ok(/für Rückfragen jederzeit gerne/.test(html), 'PDF: Standard-Schlusstext');
  ok(/Zahlbar innert 30 Tagen/.test(html), 'PDF: Konditionen / Kleingedrucktes');
}

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
