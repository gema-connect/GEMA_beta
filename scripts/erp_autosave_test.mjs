// Playwright-Smoke: ERP-Auto-Speichern mit Status-Indikator (07/2026)
//   - Offerte/Rechnung/Auftrag speichern automatisch (wie die Berichte):
//     jede Änderung an Position/Titel/Grunddaten persistiert ohne Klick.
//   - Statusanzeige unten rechts (#saveStatus): pending → saving → saved.
//   - Kein manueller «💾 Speichern»-Button mehr im Editor-Footer.
//   - Reines Öffnen/Zell-Bearbeiten-Öffnen speichert NICHT (Signatur-Diff).
// Ausführen: CHROME=<chromium> node scripts/erp_autosave_test.mjs
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
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpTouch === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

// Offerte anlegen + öffnen (noch NICHT im Pool — erpNeu persistiert nicht)
await page.evaluate(() => {
  erpNeu('offerte');
  cur.kundeSnapshot = { firma: 'Muster AG' };
  cur.positionen = [{ id: 'p1', art: 'frei', bez: 'Pos A', menge: 1, einheit: 'Stk', ep: 100, rabattPct: '' }];
  window._docId = cur.id;
  erpOpenEditor();
});

console.log('■ Reines Öffnen speichert nicht (Signatur-Diff)');
ok(await page.evaluate(() => { erpRenderPos(); return _erpSavePending === false; }),
  'erpRenderPos ohne Änderung plant keinen Save');

console.log('■ Positionswert ändern → Auto-Save persistiert');
ok(await page.evaluate(() => {
  erpCellSet('p1', 'ep', 250);   // wie das oninput im Bearbeitungsfeld
  erpRenderPos();                // Chokepoint → erpTouch erkennt Änderung
  return _erpSavePending === true;
}), 'geänderte Position markiert den Save als ausstehend (pending)');
ok(await page.evaluate(() => {
  const el = document.getElementById('saveStatus');
  return !!el && el.classList.contains('pending') && !el.classList.contains('hidden');
}), 'Status-Indikator unten rechts zeigt «pending»');
// Debounce abwarten → persistiert lokal in den Pool
await page.waitForTimeout(1500);
ok(await page.evaluate(() => {
  const stored = poolRead(DOK_POOL).find(x => x.id === window._docId);
  return !!stored && Number(stored.positionen[0].ep) === 250;
}), 'nach dem Debounce liegt der geänderte Wert im Pool (automatisch gespeichert)');

console.log('■ Titel-Feld ändern → Auto-Save');
ok(await page.evaluate(() => { cur.titel = 'Neuer Titel'; erpTouch(); return _erpSavePending === true; }),
  'Titeländerung plant einen Save');
await page.waitForTimeout(1500);
ok(await page.evaluate(() => { const s = poolRead(DOK_POOL).find(x => x.id === window._docId); return s && s.titel === 'Neuer Titel'; }),
  'Titel automatisch im Pool gespeichert');

console.log('■ Sofort-Flush beim Schliessen des Editors');
ok(await page.evaluate(() => {
  cur.titel = 'Vor dem Schliessen';
  erpTouch();                 // pending, Timer läuft
  erpCloseEditor();           // flush
  const s = poolRead(DOK_POOL).find(x => x.id === window._docId);
  return s && s.titel === 'Vor dem Schliessen' && _erpSavePending === false;
}), 'erpCloseEditor sichert ausstehende Änderungen sofort');

console.log('■ Kein manueller Speichern-Button mehr');
ok(await page.evaluate(() => {
  erpOpen(window._docId);
  const ft = document.getElementById('edFt').textContent || '';
  return ft.indexOf('Speichern') < 0;
}), 'Editor-Footer enthält keinen «Speichern»-Button');

console.log('■ Zell-Bearbeitung öffnen speichert nicht');
ok(await page.evaluate(() => {
  _erpSavePending = false;
  erpCellEdit('p1', 'bez');   // öffnet Eingabefeld, keine Wertänderung → erpRenderPos → erpTouch skip
  return _erpSavePending === false;
}), 'Doppelklick-Bearbeitung öffnen plant keinen Save');

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden');
process.exit(fail ? 1 : 0);
