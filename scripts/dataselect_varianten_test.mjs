// Playwright-Smoke: DataSelect-Ausführungen (gleiches Produkt, versch. Farbe) (07/2026)
//   Artikel mit gleichem Basis-Produktcode (vor dem ersten «/») + verschiedener
//   Ausführung (AF/AFZ) werden zu EINEM Eintrag gruppiert. Aktivieren öffnet die
//   Ausführungs-Auswahl (Dialog) VOR der Stückzahl; die gewählte Variante wird
//   eingefügt. Einzelartikel (ohne Varianten) fügen wie bisher direkt ein.
// Ausführen: CHROME=<chromium> node scripts/dataselect_varianten_test.mjs
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

// Mock: 3 Ausführungen desselben Produkts (Basiscode 6130#1313116) + 1 Einzelartikel.
// Dazu ein doppelter Datensatz (gleicher Code) — muss zusammengefasst werden.
await ctx.route('**/api/dataselect**', route => {
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, anzahl: 5, artikel: [
    { artnr: '6130#1313116/143/183', bezeichnung: 'Duschwanne Kaldewei Duschplan 80x90/Pergamon/Antislip', preis: 1222, einheit: 'PCE', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Pergamon · Gleitschutz Antislip', hatBild: false, bildUrl: '' },
    { artnr: '6130#1313116/153/0',   bezeichnung: 'Duschwanne Kaldewei Duschplan 80x90/Pergamon Cleaneffekt', preis: 1163, einheit: 'PCE', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Pergamon Cleaneffekt', hatBild: false, bildUrl: '' },
    { artnr: '6130#1313116/153/0',   bezeichnung: 'Duschwanne Kaldewei Duschplan 80x90/Pergamon Cleaneffekt', preis: 1163, einheit: 'PCE', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Pergamon Cleaneffekt', hatBild: false, bildUrl: '' },
    { artnr: '6130#1313116/133/183', bezeichnung: 'Duschwanne Kaldewei Duschplan 80x90/Manhattan/Antislip', preis: 1290, einheit: 'PCE', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Manhattan · Gleitschutz Antislip', hatBild: false, bildUrl: '' },
    { artnr: '620.020.00.1', bezeichnung: 'Spülkasten Sigma UP320', preis: 289.5, einheit: 'Stk', waehrung: 'CHF', hersteller: 'Geberit', ausfuehrung: '', hatBild: false, bildUrl: '' }
  ] }) });
});

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof _dsRenderGrouped === 'function', null, { timeout: 12000 });
await page.waitForTimeout(300);

await page.evaluate(() => {
  erpNeu('offerte'); cur.titel = 'Bad MFH'; cur.kundeSnapshot = { firma: 'Immo AG' };
  erpSaveCur(true); erpOpenEditor(); erpSideTool('kataloge');
  document.getElementById('dsq_1900').value = 'Duschwanne';
  erpDsSearch('1900');
});
await page.waitForTimeout(300);

console.log('■ Gruppierung: 4 Treffer → 2 Produkte (1 Gruppe + 1 Einzel)');
ok(await page.evaluate(() => document.querySelectorAll('#dsRes_1900 .side-art').length === 2), 'zwei Zeilen (Gruppe + Einzelartikel)');
ok(await page.evaluate(() => document.querySelectorAll('#dsRes_1900 .side-art[data-dsgroup]').length === 1), 'genau eine Gruppen-Zeile');
ok(await page.evaluate(() => document.querySelector('#dsRes_1900 .side-art[data-dsgroup]').textContent.indexOf('3 Ausführungen') >= 0),
  'Gruppe zeigt «3 Ausführungen» (Duplikat zusammengefasst)');
ok(await page.evaluate(() => { const t = document.querySelector('#dsRes_1900 .side-art[data-dsgroup] .sa-n').textContent; return /Duschwanne Kaldewei Duschplan 80x90/.test(t) && !/Pergamon|Manhattan/.test(t); }),
  'Gruppen-Titel = Basisname ohne Farbe');
ok(await page.evaluate(() => document.querySelector('#dsRes_1900 .side-art[data-dsgroup]').textContent.indexOf('CHF 1’163–1’290') >= 0 || /1['’]163/.test(document.querySelector('#dsRes_1900 .side-art[data-dsgroup]').textContent)),
  'Preisspanne im Gruppen-Sub');

console.log('■ Aktivieren öffnet die Ausführungs-Auswahl (vor der Menge)');
await page.evaluate(() => { const g = document.querySelector('#dsRes_1900 .side-art[data-dsgroup]'); erpArtGoEl(g); });
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.getElementById('erpVarModal').classList.contains('open')), 'Ausführungs-Dialog offen');
ok(await page.evaluate(() => document.getElementById('erpQtyModal').classList.contains('open') === false), 'Mengendialog noch NICHT offen');
ok(await page.evaluate(() => document.querySelectorAll('#erpVarModal .ev-opt').length === 3), 'drei Ausführungen zur Auswahl');
ok(await page.evaluate(() => document.querySelector('#erpVarModal .ev-opt .ev-lab').textContent.indexOf('Pergamon') >= 0), 'Ausführungs-Label = Farbe/Oberfläche');

console.log('■ Ausführung wählen → Menge → Position eingefügt');
await page.evaluate(() => { erpVarPick(1); erpVarConfirm(); });   // «Pergamon Cleaneffekt»
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.getElementById('erpVarModal').classList.contains('open') === false && document.getElementById('erpQtyModal').classList.contains('open')),
  'nach Ausführungswahl öffnet der Mengendialog');
await page.evaluate(() => { document.getElementById('eq_menge').value = '2'; erpQtyConfirm(); });
await page.waitForTimeout(120);
{
  const p = await page.evaluate(() => cur.positionen[cur.positionen.length - 1]);
  ok(p && p.dsArtnr === '6130#1313116/153/0', 'eingefügte Position trägt den Ausführungs-Code der Wahl');
  ok(p && /Pergamon Cleaneffekt/.test(p.bez) && /Duschwanne Kaldewei/.test(p.bez), 'Bezeichnung = Basis — Ausführung');
  ok(p && Math.abs(p.ep - 1163) < 1e-6 && Math.abs(p.menge - 2) < 1e-6, 'Preis der Ausführung + Menge (2)');
  ok(p && p._afLabel === undefined && p._dsAnb === undefined, 'transiente Hinweise (_afLabel/_ds*) NICHT gespeichert');
}

console.log('■ Einzelartikel fügt weiterhin direkt ein (kein Ausführungs-Dialog)');
await page.evaluate(() => {
  const rows = document.querySelectorAll('#dsRes_1900 .side-art');
  const single = [].find.call(rows, r => !r.dataset.dsgroup);
  erpArtGoEl(single);
});
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.getElementById('erpVarModal').classList.contains('open') === false && document.getElementById('erpQtyModal').classList.contains('open')),
  'Einzelartikel → direkt Mengendialog (kein Ausführungs-Dialog)');
await page.evaluate(() => erpQtyCancel());

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden');
process.exit(fail ? 1 : 0);
