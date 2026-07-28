// Playwright-Smoke: DataSelect-Integration im ERP (07/2026)
//   - DataSelect ist in die «Kataloge»-Seitenleiste des Positions-Editors
//     integriert (kein separater Dialog): je Lieferant eine aufklappbare Gruppe
//     (org.settings.dataselect.anbieter, Default Geberit 1900) mit Inline-Suche
//     → Ergebnis-Artikel mit Thumbnail → markieren + Enter/Doppelklick →
//     Stückzahl-Dialog → Position inkl. Bild ÜBER der markierten Zeile
//   - /api/dataselect gemockt (Function im Test nicht erreichbar): Request-
//     Params geprüft, Fehler-/Leer-Zustände, Client-Normalisierung
//   - GemaDataSelect.addAnbieter persistiert in org.settings
// Ausführen: CHROME=<chromium> node scripts/dataselect_test.mjs
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

// /api/dataselect mocken — Params in _dsReq festhalten, kanonische debim-Antwort
let lastReq = null;
await ctx.route('**/api/dataselect**', route => {
  const u = new URL(route.request().url());
  lastReq = Object.fromEntries(u.searchParams.entries());
  // Sidebar-Suche schickt Zahl-artige Eingaben als artnr, sonst als bez
  const key = u.searchParams.get('artnr') || u.searchParams.get('bez') || '';
  if (key === 'LEER') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, artikel: [], anzahl: 0 }) });
  if (key === 'FEHLER') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'DataSelect-Fehler (HTTP 500)' }) });
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, anzahl: 2, artikel: [
    { artnr: '620.020.00.1', bezeichnung: 'Spülkasten Sigma UP320', ean: '7612345678901', preis: 289.5, waehrung: 'CHF', einheit: 'Stk', hersteller: 'Geberit', serie: 'Sigma', bildUrl: 'https://www.dataselect.ch/img/620020.jpg' },
    { artnr: '115.770.00.5', bezeichnung: 'Betätigungsplatte Sigma50', ean: '', preis: 145, waehrung: 'CHF', einheit: 'Stk', hersteller: 'Geberit', serie: 'Sigma', bildUrl: '' }
  ] }) });
});

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof GemaDataSelect !== 'undefined' && typeof erpDsOpen === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

console.log('■ Helper: Anbieter-Liste + Client-Normalizer');
ok(await page.evaluate(() => GemaDataSelect.anbieter().some(a => a.id === '1900' && a.name === 'Geberit')), 'Default-Anbieter Geberit 1900 vorhanden');
ok(await page.evaluate(() => {
  const n = GemaDataSelect.normArtikel({ ArtNr: 'X-1', Bezeichnung: 'Test', Bruttopreis: "12.50", BildUrl: 'https://x/y.jpg' });
  return n.artnr === 'X-1' && Math.abs(n.preis - 12.5) < 1e-6 && n.bildUrl === 'https://x/y.jpg';
}), 'normArtikel: Rohschema → normalisiert (Fallback)');
ok(await page.evaluate(() => { const s = GemaDataSelect.fmtPreis(1234.5); return /234[.,]50$/.test(s) && s.length >= 8; }), "fmtPreis Schweizer Format (Tausender + 2 Dezimalen)");

console.log('■ addAnbieter persistiert in org.settings');
ok(await page.evaluate(() => {
  const r = GemaDataSelect.addAnbieter('1801', 'R. Nussbaum');
  const org = GemaAuth.getOrgs()[0];
  const own = (org.settings.dataselect && org.settings.dataselect.anbieter) || [];
  return r && own.some(a => a.id === '1801' && a.name === 'R. Nussbaum') && GemaDataSelect.anbieter().some(a => a.id === '1801');
}), 'neuer Lieferant landet in org.settings + Liste');

console.log('■ Kataloge-Seitenleiste öffnen (Dokument nötig)');
await page.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Sanitärinstallation MFH';
  cur.kundeSnapshot = { firma: 'Immo Basel AG' };
  erpSaveCur(true);
  erpOpenEditor();
  erpSideTool('kataloge');
});
ok(await page.evaluate(() => _sideTool === 'kataloge'), 'Seitenleiste zeigt «Kataloge» (kein separater DataSelect-Dialog)');
ok(await page.evaluate(() => document.getElementById('edSideBody').innerHTML.indexOf('DataSelect') >= 0), 'Kataloge-Panel enthält die DataSelect-Sektion');
ok(await page.evaluate(() => !!document.getElementById('dsq_1900') && !!document.getElementById('dsRes_1900')), 'DataSelect-Gruppe für Geberit (1900) mit Inline-Suche');

console.log('■ Suche: Request-Params + Ergebnisliste');
await page.evaluate(() => {
  document.getElementById('dsq_1900').value = '620.020';
  erpDsSearch('1900');
});
await page.waitForTimeout(400);
ok(lastReq && lastReq.anbieter === '1900' && lastReq.artnr === '620.020' && lastReq.sprache === 'de', 'Request trägt anbieter/artnr/sprache: ' + JSON.stringify(lastReq));
{
  const html = await page.evaluate(() => document.getElementById('dsRes_1900').innerHTML);
  ok(html.indexOf('Spülkasten Sigma UP320') >= 0 && html.indexOf('620.020.00.1') >= 0, 'Ergebnis: Bezeichnung + Artnr');
  ok(html.indexOf('CHF 289.50') >= 0 && html.indexOf('EAN 7612345678901') >= 0, 'Preis + EAN gerendert');
  // Suche OHNE Thumbnails (schnell) — Bild lädt erst beim Einfügen; 🖼-Hinweis
  ok(html.indexOf('<img') < 0 && html.indexOf('🖼') >= 0, 'Trefferliste ohne Thumbnails (Bild lädt beim Einfügen)');
  ok(await page.evaluate(() => document.querySelectorAll('#dsRes_1900 .side-art').length === 2), 'zwei Artikel als auswählbare Zeilen (.side-art)');
}

console.log('■ Artikel einfügen (markieren + Enter → Menge) + Bild wird nachgeladen');
// ersten Treffer markieren + Enter → Mengendialog, Menge 3, bestätigen
await page.evaluate(() => {
  const row = document.querySelector('#dsRes_1900 .side-art');
  erpArtSel(row);
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
});
await page.waitForTimeout(60);
ok(await page.evaluate(() => document.getElementById('erpQtyModal').classList.contains('open')), 'Enter öffnet den Stückzahl-Dialog');
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'eq_menge'), 'Fokus liegt direkt auf dem Mengenfeld');
await page.evaluate(() => { document.getElementById('eq_menge').value = '3'; erpQtyConfirm(); });
await page.waitForTimeout(60);
{
  const p = await page.evaluate(() => cur.positionen[cur.positionen.length - 1]);
  // Der Beschrieb trägt seit Feedback 18.07.2026 zusätzlich Ausführung/Artikel-Nr
  // auf eigenen Zeilen (_dsPosBez) — auf den Produktnamen prüfen, nicht auf Gleichheit
  ok(p && p.bez.indexOf('Spülkasten Sigma UP320') === 0 && Math.abs(p.menge - 3) < 1e-6, 'Position: Bezeichnung + Menge (3) aus dem Dialog');
  ok(Math.abs(p.ep - 289.5) < 1e-6 && p.einheit === 'Stk', 'Position: Preis (EP) + Einheit');
  ok(p.produktId === 'ds:620.020.00.1' && p.dsArtnr === '620.020.00.1', 'Position: produktId/dsArtnr verknüpft');
  ok(!p._dsAnb && !p._dsBild && p._dsHat === undefined, 'transiente Bild-Hinweise NICHT in der Position gespeichert');
  ok((p.lieferantFirma || '').indexOf('Geberit') >= 0, 'Position: Lieferant Geberit');
}
// Bild lädt ASYNCHRON nach (externe Bild-URL im Test blockiert → Fallback auf Roh-URL)
await page.waitForFunction(() => { const p = cur.positionen[cur.positionen.length - 1]; return p && (p.bildUrl || p.bildDataUrl); }, null, { timeout: 4000 });
{
  const p = await page.evaluate(() => cur.positionen[cur.positionen.length - 1]);
  ok(p.bildUrl === 'https://www.dataselect.ch/img/620020.jpg' || (p.bildDataUrl || '').indexOf('data:image') === 0, 'Bild nach dem Einfügen nachgeladen (komprimiert bzw. Fallback-URL)');
  const posHtml = await page.evaluate(() => document.getElementById('posBody').innerHTML);
  ok(posHtml.indexOf('620020.jpg') >= 0 || posHtml.indexOf('data:image') >= 0, 'Bild im Positions-Editor sichtbar (pos-bild)');
  // Bild ohne Rahmen + ~4×4 cm gross (max 150px) — schon bei der Erfassung sichtbar
  ok(await page.evaluate(() => { const im = document.querySelector('#posBody .pos-bild img'); if (!im) return false; const cs = getComputedStyle(im); return cs.borderTopWidth === '0px' && cs.borderStyle === 'none' && parseInt(cs.maxWidth) >= 140; }), 'Positionsbild ohne Rahmen + ~4 cm gross (max-width 150px)');
}
// Einfügen ÜBER der markierten Positionszeile
ok(await page.evaluate(() => {
  cur.positionen = [{ id: 'a', art: 'frei', bez: 'A', menge: 1, einheit: 'Stk', ep: 1 }, { id: 'b', art: 'frei', bez: 'B', menge: 1, einheit: 'Stk', ep: 1 }];
  erpPosSelReset(); erpRenderPos();
  erpPosSelClick({ stopPropagation() {}, preventDefault() {} }, 1);  // b markieren
  erpArtGo({ art: 'frei', bez: 'X', menge: 1, einheit: 'Stk', ep: 5 });
  return true;
}), 'Artikel markiert → Mengendialog offen');
await page.evaluate(() => { document.getElementById('eq_menge').value = '2'; erpQtyConfirm(); });
ok(await page.evaluate(() => { const i = cur.positionen.findIndex(p => p.id === 'b'); return cur.positionen[i - 1].bez === 'X' && Math.abs(cur.positionen[i - 1].menge - 2) < 1e-6; }), 'Einfügen DIREKT ÜBER der markierten Zeile (b)');
// Zweiter Artikel ohne Bild (Doppelklick → Menge 1) — Auswahl zurücksetzen, damit ans Ende
await page.evaluate(() => {
  cur.positionen = []; erpPosSelReset(); erpRenderPos();
  document.getElementById('dsq_1900').value = '620.020'; erpDsSearch('1900');
});
await page.waitForTimeout(300);
await page.evaluate(() => { document.querySelectorAll('#dsRes_1900 .side-art')[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
await page.waitForTimeout(60);
await page.evaluate(() => erpQtyConfirm());
ok(await page.evaluate(() => {
  const p = cur.positionen[cur.positionen.length - 1];
  return p.bez.indexOf('Betätigungsplatte Sigma50') === 0 && !p.bildUrl && Math.abs(p.ep - 145) < 1e-6;
}), 'Artikel ohne Bild: Position ohne bildUrl, Preis korrekt');

console.log('■ Live-Suche (0.5 s Debounce) markiert den obersten Treffer, Enter fügt ein');
await page.evaluate(() => { cur.positionen = []; erpPosSelReset(); erpRenderPos(); const i = document.getElementById('dsq_1900'); i.value = '620.020'; i.focus(); i.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(750);   // > 500 ms Debounce
ok(await page.evaluate(() => document.querySelectorAll('#dsRes_1900 .side-art').length === 2), 'Tippen löst die Suche automatisch aus (Debounce)');
ok(await page.evaluate(() => { const rows = document.querySelectorAll('#dsRes_1900 .side-art'); return rows[0].classList.contains('sel') && document.querySelectorAll('#dsRes_1900 .side-art.sel').length === 1; }), 'oberster Treffer ist automatisch markiert');
// Auto-Markierung darf den Fokus NICHT in die Trefferliste ziehen (sonst bricht das
// Weitertippen im Suchfeld). erpArtMark markiert ohne focus() — kein .side-art aktiv.
ok(await page.evaluate(() => { const a = document.activeElement; return !(a && a.classList && a.classList.contains('side-art')); }), 'Auto-Markierung stiehlt den Fokus NICHT (Weitertippen bleibt möglich)');
await page.evaluate(() => { document.getElementById('dsq_1900').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
await page.waitForTimeout(60);
ok(await page.evaluate(() => document.getElementById('erpQtyModal').classList.contains('open')), 'Enter im Suchfeld öffnet den Stückzahl-Dialog (obersten Treffer)');
await page.evaluate(() => { document.getElementById('eq_menge').value = '1'; erpQtyConfirm(); });
await page.waitForTimeout(60);
ok(await page.evaluate(() => { const p = cur.positionen[cur.positionen.length - 1]; return p && p.bez.indexOf('Spülkasten Sigma UP320') === 0; }), 'eingefügt = oberster Treffer');
// zu kurze Eingabe (<2 Zeichen) löst noch keine Suche aus
await page.evaluate(() => { const i = document.getElementById('dsq_1900'); i.value = '6'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(650);
ok(await page.evaluate(() => document.getElementById('dsRes_1900').innerHTML.indexOf('eingeben') >= 0), 'unter 2 Zeichen: Hinweis statt Suche');

console.log('■ Leer- und Fehlerzustände');
await page.evaluate(() => { document.getElementById('dsq_1900').value = 'LEER'; erpDsSearch('1900'); });
await page.waitForTimeout(300);
ok(await page.evaluate(() => document.getElementById('dsRes_1900').innerHTML.indexOf('Keine Artikel gefunden') >= 0), 'leere Antwort → «Keine Artikel gefunden»');
await page.evaluate(() => { document.getElementById('dsq_1900').value = 'FEHLER'; erpDsSearch('1900'); });
await page.waitForTimeout(300);
ok(await page.evaluate(() => /DataSelect-Fehler/.test(document.getElementById('dsRes_1900').innerHTML)), 'Server-Fehler → Fehlermeldung im Panel');
// Ohne Suchkriterium
await page.evaluate(() => { document.getElementById('dsq_1900').value = ''; erpDsSearch('1900'); });
await page.waitForTimeout(250);
ok(await page.evaluate(() => document.getElementById('dsRes_1900').innerHTML.indexOf('Artikelnummer, Bezeichnung oder EAN') >= 0), 'ohne Suchkriterium → Hinweis (kein Request)');

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
await ctx.close();

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
