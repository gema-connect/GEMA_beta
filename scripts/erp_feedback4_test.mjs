// Playwright-Smoke: ERP-Feedback 24.07.2026 (vier Punkte)
//   1. Feedback-Knopf auch im Vollbild-Editor (die Nav ist dort verdeckt)
//   2. BKP-Liste rechts: Einrückung nach Stellenzahl der Nummer
//   3. Kein ✕-Knopf mehr an den Positionen (Delete-Taste + Rechtsklick bleiben)
//   4. Doppelklick auf die Endsumme → Betrag eingeben → automatische
//      Schluss-Korrektur (Rabatt/Zuschlag), damit die Summe stimmt
// Ausführen: CHROME=<chromium> node scripts/erp_feedback4_test.mjs
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
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpTotalKorrektur === 'function', null, { timeout: 12000 });
await page.waitForTimeout(500);

await page.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Testofferte';
  cur.mwstPct = 8.1;
  cur.positionen = [
    { id: 'p1', art: 'frei', bez: 'Boiler', menge: 1, einheit: 'Stk', ep: 231.82 },
    { id: 'p2', art: 'frei', bez: 'Montage', menge: 2, einheit: 'h', ep: 0 }
  ];
  erpOpenEditor();
});
await page.waitForTimeout(400);

console.log('■ 1) Feedback-Knopf im Editor');
ok(await page.evaluate(() => !!document.querySelector('#edFt .gema-feedback-btn')),
   'Aktionsleiste des Editors trägt den 🔴-Feedback-Knopf');
ok(await page.evaluate(() => {
  const b = document.querySelector('#edFt .gema-feedback-btn');
  const r = b.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}), 'Knopf ist sichtbar');
ok(await page.evaluate(() => {
  // GemaFeedback.init muss gelaufen sein, sonst tut der Knopf nichts
  return typeof GemaFeedback !== 'undefined' && !!document.getElementById('gfb-root');
}), 'GemaFeedback ist initialisiert (Overlay-DOM vorhanden)');

console.log('■ 3) Kein ✕-Knopf mehr an den Positionen');
ok(await page.evaluate(() => document.querySelectorAll('#posBody .pos-del').length === 0),
   'Positionszeilen haben keinen Lösch-Knopf mehr');
{
  const spalten = await page.evaluate(() => ({
    kopf: document.querySelectorAll('.pos thead th').length,
    zeile: document.querySelector('#posBody tr') ? document.querySelector('#posBody tr').children.length : 0
  }));
  ok(spalten.kopf === spalten.zeile, 'Kopf- und Datenzeile haben gleich viele Spalten (' + spalten.kopf + ')');
}
ok(await page.evaluate(() => {
  // Delete-Taste löscht weiterhin die Markierung
  const vorher = cur.positionen.length;
  erpPosSelClick({ shiftKey: false, ctrlKey: false, metaKey: false, stopPropagation: () => {} }, 1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  return cur.positionen.length === vorher - 1;
}), 'Delete-Taste löscht die markierte Position weiterhin');

console.log('■ 4) Endsumme per Doppelklick setzen');
{
  const vor = await page.evaluate(() => erpDocTotals(cur).brutto);
  ok(vor > 0, 'Ausgangstotal ' + vor.toFixed(2));
  await page.evaluate(() => erpTotEdit());
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !!document.getElementById('erpTotInp')), 'Eingabefeld erscheint');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'erpTotInp'), 'Feld ist fokussiert');
  await page.evaluate(() => { const i = document.getElementById('erpTotInp'); i.value = '200.00'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await page.waitForTimeout(350);
  const nach = await page.evaluate(() => erpDocTotals(cur).brutto);
  ok(Math.abs(nach - 200.00) < 0.005, 'Endsumme ist exakt 200.00 (ist ' + nach.toFixed(2) + ')');
  const s = await page.evaluate(() => cur.schluss || []);
  ok(s.length === 1 && s[0].art === 'rabatt' && s[0].modus === 'chf', 'genau eine pauschale Rabattzeile eingetragen');
  ok(s[0].autoTotal === true, 'als Auto-Korrektur markiert');
  ok(await page.evaluate(() => document.getElementById('sumBlock').textContent.indexOf('200.00') >= 0),
     'Summenblock zeigt die neue Endsumme');
}
console.log('■ 4b) Erneutes Setzen ersetzt die Korrektur');
{
  await page.evaluate(() => erpTotEdit());
  await page.waitForTimeout(120);
  await page.evaluate(() => { const i = document.getElementById('erpTotInp'); i.value = '350.00'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  await page.waitForTimeout(350);
  const nach = await page.evaluate(() => erpDocTotals(cur).brutto);
  const s = await page.evaluate(() => cur.schluss || []);
  ok(Math.abs(nach - 350.00) < 0.005, 'Endsumme jetzt 350.00 (ist ' + nach.toFixed(2) + ')');
  ok(s.filter(x => x.autoTotal).length === 1, 'weiterhin nur EINE Auto-Zeile');
  ok(s[0].art === 'zuschlag', 'aus dem Rabatt wurde ein Zuschlag');
}
console.log('■ 4c) Escape bricht ab');
{
  const vor = await page.evaluate(() => erpDocTotals(cur).brutto);
  await page.evaluate(() => erpTotEdit());
  await page.waitForTimeout(120);
  await page.evaluate(() => { const i = document.getElementById('erpTotInp'); i.value = '9999'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await page.waitForTimeout(250);
  const nach = await page.evaluate(() => erpDocTotals(cur).brutto);
  ok(Math.abs(nach - vor) < 0.005, 'Escape lässt die Summe unverändert');
}

console.log('■ 2) BKP-Liste: Einrückung nach Stellenzahl');
await page.evaluate(() => erpSideTool('bkp'));
await page.waitForTimeout(400);
{
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#bkpListe > .bkp-node > .bkp-row')).slice(0, 6).map(r => ({
    nr: (r.querySelector('.bkp-nr') || {}).textContent || '',
    pad: parseFloat(getComputedStyle(r).paddingLeft) || 0
  })));
  ok(rows.length > 0, 'BKP-Baum gerendert (' + rows.length + ' sichtbare Knoten)');
  ok(rows.every(r => /^\d/.test(r.nr)), 'jede Zeile trägt eine BKP-Nummer');
  ok(rows.every(r => r.pad === rows[0].pad), 'oberste Ebene (direkte Kinder der Liste) alle gleich eingerückt');
}
{
  // Ein Hauptkapitel aufklappen und die Kinder vergleichen
  const tief = await page.evaluate(() => {
    const ersteNr = document.querySelector('#bkpListe .bkp-nr').textContent.trim();
    erpBkpNodeToggle({ stopPropagation: () => {} }, ersteNr);
    const alle = Array.from(document.querySelectorAll('#bkpListe .bkp-row')).map(r => ({
      nr: (r.querySelector('.bkp-nr') || {}).textContent.trim(),
      pad: parseFloat(getComputedStyle(r).paddingLeft) || 0
    })).filter(x => x.nr);
    const eins = alle.find(x => x.nr.length === 1);
    const zwei = alle.find(x => x.nr.length === 2);
    const drei = alle.find(x => x.nr.length === 3);
    return { eins: eins, zwei: zwei, drei: drei };
  });
  ok(tief.eins && tief.zwei, 'ein- und zweistellige Nummern sichtbar');
  ok(tief.zwei.pad > tief.eins.pad, '2-stellig ist tiefer eingerückt als 1-stellig (' + tief.eins.pad + ' → ' + tief.zwei.pad + ')');
  if (tief.drei) ok(tief.drei.pad > tief.zwei.pad, '3-stellig noch tiefer (' + tief.drei.pad + ')');
  else ok(true, '3-stellige Ebene in dieser Auswahl nicht sichtbar — übersprungen');
}

console.log('■ Keine JS-Fehler');
ok(errors.length === 0, 'Keine pageerror-Meldungen' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
