// Playwright-Smoke: ERP-Feedback (Liste-Default, IGH-Fokus, Ausführungs-Tastatur,
// Undo/Redo, Seitenwechsel-Vorschau + break-inside:avoid im PDF).
// Ausführen: CHROME=<chromium> node scripts/erp_feedback3_test.mjs
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

// DataSelect-Mock: ein Produkt mit 2 Ausführungen + ein Einzelartikel
await ctx.route('**/api/dataselect**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, anzahl: 3, artikel: [
  { artnr: '1313116/143/183', bezeichnung: 'Duschwanne Kaldewei 80x90', bezeichnungLang: 'Duschwanne Kaldewei 80x90', preis: 1222, einheit: 'Stk', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Pergamon', hatBild: false, bildUrl: '' },
  { artnr: '1313116/100/0', bezeichnung: 'Duschwanne Kaldewei 80x90', bezeichnungLang: 'Duschwanne Kaldewei 80x90', preis: 806, einheit: 'Stk', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Weiss', hatBild: false, bildUrl: '' },
  { artnr: '990.111.0', bezeichnung: 'WC-Sitz', bezeichnungLang: 'WC-Sitz', preis: 89, einheit: 'Stk', waehrung: 'CHF', hersteller: 'Geberit', ausfuehrung: '', hatBild: false, bildUrl: '' }
] }) }));

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpSetDocView === 'function' && typeof erpUndo === 'function', null, { timeout: 12000 });
await page.waitForTimeout(300);

// Ein paar Offerten anlegen, damit die Liste etwas zeigt
await page.evaluate(() => {
  ['A AG', 'B GmbH', 'C AG'].forEach(function (f, i) { erpNeu('offerte'); cur.kundeSnapshot = { firma: f }; cur.titel = 'Projekt ' + i; erpSaveCur(true); });
  erpCloseEditor && erpCloseEditor();
  _tab = 'offerte'; erpRenderAll();
});
await page.waitForTimeout(200);

console.log('■ Dokumentliste standardmässig als Liste');
ok(await page.evaluate(() => _erpDocView === 'liste'), 'Default-Ansicht = Liste');
// Seit 26.07.2026 ist die Listenansicht eine Tabelle mit frei anordenbaren Spalten
ok(await page.evaluate(() => !!document.querySelector('#docList table.dtbl') && document.querySelectorAll('#docList table.dtbl tbody tr.dtr').length >= 3), 'Listenansicht als Tabelle mit Zeilen');
ok(await page.evaluate(() => !!document.querySelector('.viewseg .vsg.on')), 'Ansicht-Umschalter vorhanden');
await page.evaluate(() => erpSetDocView('karten'));
ok(await page.evaluate(() => document.getElementById('docList').className === 'cards' && document.querySelectorAll('#docList .card').length >= 3), 'Umschalten auf Karten → .card');
ok(await page.evaluate(() => localStorage.getItem('gema_erp_docview_v1') === 'karten'), 'Ansicht persistiert (localStorage)');
await page.evaluate(() => erpSetDocView('liste'));

console.log('■ Ausführungs-Dialog: öffnet, Option fokussiert, Pfeil + Enter');
await page.evaluate(() => { erpNeu('offerte'); cur.kundeSnapshot = { firma: 'X AG' }; cur.positionen = []; erpSaveCur(true); erpOpenEditor(); erpSideTool('kataloge'); document.getElementById('dsq_1900').value = 'Duschwanne'; erpDsSearch('1900'); });
await page.waitForTimeout(350);
await page.evaluate(() => erpArtGoEl(document.querySelector('#dsRes_1900 .side-art[data-dsgroup]')));
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.getElementById('erpVarModal').classList.contains('open')), 'Ausführungs-Dialog offen');
ok(await page.evaluate(() => { const a = document.activeElement; return a && a.classList && a.classList.contains('ev-opt'); }), 'eine Ausführungs-Option ist fokussiert (Tastatur bereit)');
ok(await page.evaluate(() => _varSel === 0), 'Start bei erster Ausführung');
await page.evaluate(() => { const o = document.querySelector('#evList .ev-opt.sel'); o.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); });
ok(await page.evaluate(() => _varSel === 1), 'ArrowDown wählt die zweite Ausführung');
await page.evaluate(() => { const o = document.querySelector('#evList .ev-opt.sel'); o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.getElementById('erpQtyModal').classList.contains('open') && !document.getElementById('erpVarModal').classList.contains('open')), 'Enter bestätigt die Ausführung → Mengendialog');

console.log('■ IGH-Einfügen: Fokus zurück ins Suchfeld');
await page.evaluate(() => { window._dsqFocused = false; const si = document.getElementById('dsq_1900'); si.focus = function () { window._dsqFocused = true; }; document.getElementById('eq_menge').value = '1'; erpQtyConfirm(); });
await page.waitForTimeout(80);
ok(await page.evaluate(() => window._dsqFocused === true), 'nach dem Einfügen wird das Suchfeld fokussiert (direkt weitertippbar)');

console.log('■ Undo / Redo');
ok(await page.evaluate(() => { erpNeu('offerte'); cur.kundeSnapshot = { firma: 'U AG' }; cur.positionen = [{ id: 'p1', art: 'frei', bez: 'Start', menge: 1, einheit: 'Stk', ep: 5 }]; erpSaveCur(true); erpOpenEditor(); return _erpUndo.length === 0 && document.getElementById('edUndo').disabled === true; }), 'frisch geöffnet: Undo-Stack leer, ↶ deaktiviert');
await page.evaluate(() => { cur.positionen.push({ id: 'p2', art: 'frei', bez: 'Neu', menge: 1, einheit: 'Stk', ep: 9 }); erpRenderPos(); });
await page.evaluate(() => erpUndo());
await page.waitForTimeout(60);
ok(await page.evaluate(() => cur.positionen.length === 1 && cur.positionen[0].id === 'p1'), 'Undo entfernt die hinzugefügte Position');
ok(await page.evaluate(() => _erpRedo.length === 1 && document.getElementById('edRedo').disabled === false), 'Redo-Stack gefüllt, ↷ aktiv');
await page.evaluate(() => erpRedo());
await page.waitForTimeout(60);
ok(await page.evaluate(() => cur.positionen.length === 2 && cur.positionen.some(p => p.id === 'p2')), 'Redo stellt die Position wieder her');
// Tastatur Ctrl+Z (Fokus nicht im Feld)
await page.evaluate(() => { document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); });
await page.waitForTimeout(60);
ok(await page.evaluate(() => cur.positionen.length === 1), 'Ctrl+Z (ausserhalb Feld) macht rückgängig');

console.log('■ Seitenwechsel-Vorschau + Positionen nie splitten (PDF)');
await page.evaluate(() => {
  erpNeu('offerte'); cur.kundeSnapshot = { firma: 'V AG' };
  cur.positionen = [];
  for (let i = 0; i < 70; i++) cur.positionen.push({ id: 'r' + i, art: 'frei', bez: 'Position ' + i + ' — ein etwas längerer Beschreibungstext, der über mehrere Wörter geht und Platz braucht.', menge: 1, einheit: 'Stk', ep: 10 });
  erpSaveCur(true); erpOpenEditor();
});
await page.waitForTimeout(400);   // > 160ms Debounce der Vorschau
ok(await page.evaluate(() => document.querySelectorAll('#posBody tr.pos-pbtop').length >= 1), 'mind. eine Position ist als Seitenwechsel markiert (gestrichelte Linie)');
ok(await page.evaluate(() => { const tr = document.querySelector('#posBody tr.pos-pbtop'); return tr && getComputedStyle(tr.querySelector('td')).borderTopStyle === 'dashed'; }), 'Marker-Zeile hat eine gestrichelte obere Linie');
// PDF: break-inside:avoid pro Positionszeile
{
  const html = await page.evaluate(() => {
    let cap = '';
    const orig = window.open;
    window.open = function () { return { document: { write(s) { cap += s; }, close() {}, title: '' }, focus() {}, print() {}, closed: false }; };
    try { erpPdf(); } catch (e) { cap += ' ERR:' + e.message; }
    window.open = orig;
    return cap;
  });
  ok(/table\.pos tbody tr\{[^}]*break-inside:avoid/.test(html), 'PDF-CSS: Positionszeile break-inside:avoid (nie getrennt)');
  ok(/table\.pos tbody tr\.hasimg\{[^}]*break-after:avoid/.test(html), 'PDF-CSS: Bildzeile bleibt bei der Position (break-after:avoid)');
}

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
