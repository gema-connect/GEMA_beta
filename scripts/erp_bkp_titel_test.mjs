// Playwright-Smoke: ERP — BKP-Titel in Offerten (07/2026)
//   - gema_bkp_katalog.js: kompletter Standard-BKP als GemaBKP (flat/level/byId)
//   - «🧱 BKP-Titel»-Picker: Suche, eingerückte Liste, Mehrfachauswahl → Einfügen
//     als Titelzeilen in Baumreihenfolge (2 < 25 < 251 < 251.0 < 3)
//   - Titelzeilen im Editor: BKP-Nr-Feld + Einrückung nach Ebene, Nummer und
//     Text bleiben frei anpassbar (eigene Nummern erlaubt)
//   - PDF: BKP-Nummer als Kapitel-Label (eingerückt), Zusammenfassung mit
//     Teilbaum-Rollup (25 = Σ 251…), Buchstaben-Kapitel ohne BKP unverändert
//   - Vorlagen behalten die BKP-Struktur
// Ausführen: CHROME=<chromium> node scripts/erp_bkp_titel_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

console.log('■ Boot + Katalog');
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof GemaBKP !== 'undefined', null, { timeout: 12000 });
await page.waitForTimeout(400);

ok(await page.evaluate(() => GemaBKP.flat().length > 300), 'Kompletter BKP-Katalog geladen (' + await page.evaluate(() => GemaBKP.flat().length) + ' Einträge)');
ok(await page.evaluate(() => GemaBKP.level('2') === 0 && GemaBKP.level('25') === 1 && GemaBKP.level('254') === 2 && GemaBKP.level('254.0') === 3), 'Ebenen: 2→0, 25→1, 254→2, 254.0→3');
ok(await page.evaluate(() => GemaBKP.byId('254').titel === 'Sanitärleitungen' && GemaBKP.byId('25').titel === 'Sanitäranlagen'), 'byId liefert die Standard-Titel');

console.log('■ Picker: Suche, Einrückung, Einfügen in Baumreihenfolge');
await page.evaluate(() => { erpNeu('offerte'); cur.titel = 'Testofferte'; erpBkpOpen(); });
ok(await page.evaluate(() => document.getElementById('bkpModal').classList.contains('open')), 'Picker öffnet');
ok(await page.evaluate(() => document.querySelectorAll('#bkpListe .bkp-item').length > 300), 'Liste zeigt den ganzen Katalog');
{
  const pads = await page.evaluate(() => {
    const find = id => [...document.querySelectorAll('#bkpListe .bkp-chk')].find(c => c.dataset.bkp === id).closest('.bkp-item');
    return { e0: find('2').style.paddingLeft, e2: find('254').style.paddingLeft, e3: find('254.0').style.paddingLeft };
  });
  ok(pads.e0 === '12px' && pads.e2 === '52px' && pads.e3 === '72px', 'Einrückung nach Ebene (wie BKP-Checkliste): 2=' + pads.e0 + ' · 254=' + pads.e2 + ' · 254.0=' + pads.e3);
}
await page.evaluate(() => { document.getElementById('bkpSuche').value = 'Sanitärleitungen'; erpBkpRenderList(); });
ok(await page.evaluate(() => {
  const items = [...document.querySelectorAll('#bkpListe .bkp-chk')].map(c => c.dataset.bkp);
  return items.indexOf('254') >= 0 && items.length < 10;
}), 'Suche filtert (Text «Sanitärleitungen» → 254)');
await page.evaluate(() => { document.getElementById('bkpSuche').value = ''; erpBkpRenderList(); });
// bewusst in "falscher" Klick-Reihenfolge wählen → Einfügen sortiert baumkonform
await page.evaluate(() => {
  ['254.0', '2', '254', '25'].forEach(id => {
    const cb = [...document.querySelectorAll('#bkpListe .bkp-chk')].find(c => c.dataset.bkp === id);
    cb.click();
  });
});
ok(await page.evaluate(() => document.getElementById('bkpInsBtn').textContent.indexOf('4 Titel') >= 0 && !document.getElementById('bkpInsBtn').disabled), 'Zähler-Button: «＋ 4 Titel einfügen»');
await page.evaluate(() => erpBkpInsert());
{
  const titel = await page.evaluate(() => cur.positionen.filter(p => p.art === 'titel').map(p => p.bkp + '|' + p.bez));
  ok(titel.join(';') === '2|Gebäude;25|Sanitäranlagen;254|Sanitärleitungen;254.0|Kalt- und Warmwasser', 'Eingefügt in Baumreihenfolge mit Standard-Texten');
  ok(await page.evaluate(() => !document.getElementById('bkpModal').classList.contains('open')), 'Picker schliesst nach dem Einfügen');
}

console.log('■ Editor: Einrückung + Nummer/Text einzeln anpassbar');
{
  const row = await page.evaluate(() => {
    const trs = [...document.querySelectorAll('#posBody tr.titel')];
    return trs.map(tr => {
      const div = tr.querySelector('td div');
      return { pad: div.style.paddingLeft, nr: div.querySelectorAll('input')[0].value };
    });
  });
  ok(row.length === 4 && row[0].pad === '0px' && row[1].pad === '20px' && row[2].pad === '40px' && row[3].pad === '60px', 'Titelzeilen eingerückt nach Ebene (0/20/40/60px)');
  ok(row[3].nr === '254.0', 'BKP-Nr-Feld vorbefüllt');
}
// eigene Nummer + eigener Text
await page.evaluate(() => {
  const i = cur.positionen.findIndex(p => p.bkp === '254.0');
  cur.positionen[i].bkp = '254.9';
  cur.positionen[i].bez = 'Eigene Unterkategorie';
  erpRenderPos();
});
ok(await page.evaluate(() => {
  const tr = [...document.querySelectorAll('#posBody tr.titel')][3];
  const inp = tr.querySelectorAll('input');
  return inp[0].value === '254.9' && inp[1].value === 'Eigene Unterkategorie' && tr.querySelector('td div').style.paddingLeft === '60px';
}), 'Eigene Nummer + Text anpassbar (Einrückung folgt der Nummer)');

console.log('■ PDF: BKP-Kapitel + Zusammenfassungs-Rollup');
// Positionen: 200 CHF unter 254, 100 CHF unter 254.9; dazu Buchstaben-Kapitel ohne BKP mit 50 CHF
await page.evaluate(() => {
  const at = bkp => cur.positionen.findIndex(p => p.bkp === bkp);
  cur.positionen.splice(at('254') + 1, 0, { id: 'p1', art: 'frei', bez: 'Leitungen EG', menge: 2, einheit: 'h', ep: 100 });
  cur.positionen.splice(at('254.9') + 1, 0, { id: 'p2', art: 'frei', bez: 'KW-Verteiler', menge: 1, einheit: 'Stk', ep: 100 });
  cur.positionen.push({ id: 't9', art: 'titel', bez: 'Diverses' });
  cur.positionen.push({ id: 'p3', art: 'frei', bez: 'Kleinmaterial', menge: 1, einheit: 'pausch.', ep: 50 });
  window._pdfHtml = '';
  const origOpen = window.open;
  window.open = function () {
    return { document: { write: s => { window._pdfHtml += s; }, close: () => {} }, close: () => {} };
  };
  erpPdf();
  window.open = origOpen;
});
{
  const html = await page.evaluate(() => window._pdfHtml);
  ok(html.indexOf('<td class="grpltr">254</td>') >= 0 && html.indexOf('<td class="grpltr">254.9</td>') >= 0, 'Positionsteil: BKP-Nummern als Kapitel-Label');
  ok(html.indexOf('padding-left:12mm') >= 0 && html.indexOf('padding-left:17mm') >= 0, 'Kapitel-Titel im PDF eingerückt (Ebene 2/3)');
  ok(html.indexOf('<td class="grpltr">A</td>') >= 0, 'Kapitel ohne BKP behält den Buchstaben (A)');
  // Rollup: 254.9=100 · 254=200+100=300 · 25=300 · 2=300 · A(Diverses)=50
  const zus = html.slice(html.indexOf('Zusammenfassung'));
  const sumOf = lbl => {
    const i = zus.indexOf('<td class="grpltr">' + lbl + '</td>');
    if (i < 0) return null;
    const m = zus.slice(i).match(/<td class="num">([\d'.,]+)<\/td>/);
    return m ? m[1] : null;
  };
  ok(sumOf('254.9') === '100.00', 'Zusammenfassung: 254.9 = 100.00 (Direktsumme)');
  ok(sumOf('254') === '300.00', 'Zusammenfassung: 254 = 300.00 (Rollup inkl. 254.9)');
  ok(sumOf('25') === '300.00' && sumOf('2') === '300.00', 'Zusammenfassung: Ober-Titel 25 + 2 rollen den Teilbaum auf');
  ok(sumOf('A') === '50.00', 'Buchstaben-Kapitel bleibt Direktsumme');
  ok(html.indexOf('350.00') >= 0, 'Gesamttotal 350.00 (Positionen einfach gezählt — kein Doppelzählen)');
}

console.log('■ Vorlage behält die BKP-Struktur');
await page.evaluate(() => {
  window._origPrompt = GemaDialog.prompt;
  GemaDialog.prompt = () => Promise.resolve('BKP-Standardofferte');
  erpVorlSpeichern();
});
await page.waitForTimeout(400);
{
  const v = await page.evaluate(() => (GemaSync.getCached('gema_erp_vorl_pool_v1') || [])[0]);
  ok(v && v.positionen.some(p => p.art === 'titel' && p.bkp === '254'), 'Vorlage speichert bkp auf den Titelzeilen');
  await page.evaluate(() => { GemaDialog.prompt = window._origPrompt; });
}

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
