// Playwright-Smoke: DataSelect-Integration im ERP (07/2026)
//   - «🔎 DataSelect»-Picker im Positions-Editor: Lieferant-Select
//     (org.settings.dataselect.anbieter, Default Geberit 1900) + Suche nach
//     Artnr/Bez/EAN → Ergebnisliste mit Thumbnail → Position inkl. Bild
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
  const artnr = u.searchParams.get('artnr') || '';
  if (artnr === 'LEER') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, artikel: [], anzahl: 0 }) });
  if (artnr === 'FEHLER') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'DataSelect-Fehler (HTTP 500)' }) });
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

console.log('■ Picker öffnen (Dokument nötig)');
await page.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Sanitärinstallation MFH';
  cur.kundeSnapshot = { firma: 'Immo Basel AG' };
  erpSaveCur(true);
  erpOpenEditor();
});
ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('🔎 DataSelect') >= 0), 'Toolbar: «🔎 DataSelect»-Button im Positions-Editor');
await page.evaluate(() => erpDsOpen());
ok(await page.evaluate(() => document.getElementById('dsModal').classList.contains('open')), 'DataSelect-Modal öffnet');
ok(await page.evaluate(() => {
  const opts = [...document.getElementById('ds_anbieter').options].map(o => o.textContent);
  return opts.some(t => t.indexOf('Geberit') >= 0 && t.indexOf('1900') >= 0);
}), 'Lieferant-Select zeigt Geberit (1900)');

console.log('■ Suche: Request-Params + Ergebnisliste');
await page.evaluate(() => {
  document.getElementById('ds_anbieter').value = '1900';
  document.getElementById('ds_artnr').value = '620.020';
  document.getElementById('ds_sprache').value = 'de';
  erpDsSearch();
});
await page.waitForTimeout(400);
ok(lastReq && lastReq.anbieter === '1900' && lastReq.artnr === '620.020' && lastReq.sprache === 'de', 'Request trägt anbieter/artnr/sprache: ' + JSON.stringify(lastReq));
{
  const html = await page.evaluate(() => document.getElementById('ds_list').innerHTML);
  ok(html.indexOf('Spülkasten Sigma UP320') >= 0 && html.indexOf('620.020.00.1') >= 0, 'Ergebnis: Bezeichnung + Artnr');
  ok(html.indexOf('CHF 289.50') >= 0 && html.indexOf('EAN 7612345678901') >= 0, 'Preis + EAN gerendert');
  ok(html.indexOf('dataselect.ch/img/620020.jpg') >= 0, 'Thumbnail-Bild im Ergebnis');
}

console.log('■ Artikel einfügen → Position inkl. Bild');
await page.evaluate(() => erpDsTake(0));
{
  const p = await page.evaluate(() => cur.positionen[cur.positionen.length - 1]);
  ok(p && p.bez === 'Spülkasten Sigma UP320', 'Position: Bezeichnung übernommen');
  ok(Math.abs(p.ep - 289.5) < 1e-6 && p.einheit === 'Stk', 'Position: Preis (EP) + Einheit');
  ok(p.produktId === 'ds:620.020.00.1' && p.dsArtnr === '620.020.00.1', 'Position: produktId/dsArtnr verknüpft');
  ok(p.bildUrl === 'https://www.dataselect.ch/img/620020.jpg', 'Position trägt das Bild (bildUrl)');
  ok((p.lieferantFirma || '').indexOf('Geberit') >= 0, 'Position: Lieferant Geberit');
  // Bild erscheint im Positions-Editor
  const posHtml = await page.evaluate(() => document.getElementById('posBody').innerHTML);
  ok(posHtml.indexOf('620020.jpg') >= 0, 'Bild im Positions-Editor sichtbar (pos-bild)');
}
// Zweiter Artikel ohne Bild
await page.evaluate(() => erpDsTake(1));
ok(await page.evaluate(() => {
  const p = cur.positionen[cur.positionen.length - 1];
  return p.bez === 'Betätigungsplatte Sigma50' && !p.bildUrl && Math.abs(p.ep - 145) < 1e-6;
}), 'Artikel ohne Bild: Position ohne bildUrl, Preis korrekt');

console.log('■ Leer- und Fehlerzustände');
await page.evaluate(() => { document.getElementById('ds_artnr').value = 'LEER'; document.getElementById('ds_bez').value = ''; document.getElementById('ds_ean').value = ''; erpDsSearch(); });
await page.waitForTimeout(300);
ok(await page.evaluate(() => document.getElementById('ds_list').innerHTML.indexOf('Keine Artikel gefunden') >= 0), 'leere Antwort → «Keine Artikel gefunden»');
await page.evaluate(() => { document.getElementById('ds_artnr').value = 'FEHLER'; erpDsSearch(); });
await page.waitForTimeout(300);
ok(await page.evaluate(() => /DataSelect-Fehler/.test(document.getElementById('ds_list').innerHTML)), 'Server-Fehler → Fehlermeldung im Panel');
// Ohne Suchkriterium
await page.evaluate(() => {
  document.getElementById('ds_artnr').value = ''; document.getElementById('ds_bez').value = ''; document.getElementById('ds_ean').value = '';
  erpDsSearch();
});
await page.waitForTimeout(250);
ok(await page.evaluate(() => document.getElementById('ds_list').innerHTML.indexOf('Artikelnummer, Bezeichnung oder EAN') >= 0), 'ohne Suchkriterium → Hinweis (kein Request)');

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
await ctx.close();

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
