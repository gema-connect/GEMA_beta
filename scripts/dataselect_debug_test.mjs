// Playwright-Smoke: DataSelect-Diagnose «Rohantwort prüfen» (07/2026)
//   Ohne IGH-Wissen sichtbar machen, WAS ein Lieferant zurückgibt.
//   - GemaDataSelect.debug({anbieter,…}) ruft /api/dataselect?...&debug=1
//   - erpDsDebug(anbId) zeigt HTTP-Status/Format/Auszug + Deutung im Dialog
//     (Zugang verweigert 403 · XML statt JSON · JSON ok · Netzwerkfehler)
// Ausführen: CHROME=<chromium> node scripts/dataselect_debug_test.mjs
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

// /api/dataselect mocken: bei debug=1 je nach eingegebener «bez» ein Szenario.
let lastReq = null;
await ctx.route('**/api/dataselect**', route => {
  const u = new URL(route.request().url());
  lastReq = Object.fromEntries(u.searchParams.entries());
  const dbg = u.searchParams.get('debug') === '1';
  const key = (u.searchParams.get('artnr') || u.searchParams.get('bez') || '').toUpperCase();
  const fmt = u.searchParams.get('format') || '';
  if (dbg) {
    let d;
    if (key === 'ACCESS') d = { httpStatus: 403, httpStatusText: 'Forbidden', contentType: 'text/html', erkanntesFormat: 'HTML/XML', jsonParsebar: false, laenge: 40, auszug: '<html><body>Login required</body></html>', format: fmt || 'bexio', triedUrl: 'https://www.dataselect.ch/api/Artikel/Get?id_anbieter=1900' };
    else if (key === 'XML') d = { httpStatus: 200, httpStatusText: 'OK', contentType: 'application/xml', erkanntesFormat: 'XML', jsonParsebar: false, laenge: 30, auszug: '<?xml version="1.0"?><Artikel/>', format: fmt || 'debim', triedUrl: 'https://www.dataselect.ch/…' };
    else if (key === 'NETZ') d = { netzwerkFehler: 'Zeitüberschreitung (dataselect.ch antwortet nicht rechtzeitig).', format: fmt || 'bexio', triedUrl: 'https://www.dataselect.ch/…', keyGesetzt: false };
    else d = { httpStatus: 200, httpStatusText: 'OK', contentType: 'application/json', erkanntesFormat: 'JSON', jsonParsebar: true, laenge: 55, auszug: '[{"intern_code":"620.020","intern_name":"Sigma"}]', format: fmt || 'bexio', triedUrl: 'https://www.dataselect.ch/…' };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, debug: d }) });
  }
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, anzahl: 0, artikel: [] }) });
});

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof GemaDataSelect !== 'undefined' && typeof erpDsDebug === 'function', null, { timeout: 12000 });
await page.waitForTimeout(300);

console.log('■ Client GemaDataSelect.debug');
ok(await page.evaluate(async () => { const r = await GemaDataSelect.debug({ anbieter: '1900', bez: 'JSONOK' }); return r && r.debug && r.debug.erkanntesFormat === 'JSON' && r.debug.jsonParsebar === true; }),
  'debug() liefert das Diagnose-Objekt (JSON erkannt)');
ok(lastReq && lastReq.debug === '1' && lastReq.anbieter === '1900', 'Request trägt debug=1 + Lieferant-ID');
ok(await page.evaluate(async () => { const r = await GemaDataSelect.debug({ anbieter: '1900' }); return r && r.debug != null; }),
  'debug() ohne Suchbegriff schickt einen Platzhalter (kein 400)');
ok(await page.evaluate(async () => { const r = await GemaDataSelect.debug({ anbieter: '1900', bez: 'X', format: 'debim' }); return r; }) && lastReq.format === 'debim',
  'debug() reicht ein Test-Zielformat durch (format=debim)');

console.log('■ UI erpDsDebug — Dialog mit Deutung');
async function debugDialogText(bezValue) {
  await page.evaluate(() => { document.querySelectorAll('.gema-dlg-bg').forEach(e => e.remove()); });
  await page.evaluate((v) => {
    // Suchfeld für Lieferant 1900 simulieren (erpDsDebug liest #dsq_<id>)
    let inp = document.getElementById('dsq_1900');
    if (!inp) { inp = document.createElement('input'); inp.id = 'dsq_1900'; document.body.appendChild(inp); }
    inp.value = v;
    erpDsDebug('1900');
  }, bezValue);
  await page.waitForTimeout(250);
  // Der zuletzt geöffnete Dialog (das «wird geprüft»-Alert wird durch das Ergebnis ersetzt)
  return await page.evaluate(() => {
    const dlgs = document.querySelectorAll('.gema-dlg-bg');
    const last = dlgs[dlgs.length - 1];
    return last ? (last.textContent || '') : '';
  });
}
ok(/Zugang verweigert/.test(await debugDialogText('ACCESS')), '403 → Deutung «Zugang verweigert» (Vertrag nötig)');
ok(/XML|kein JSON/i.test(await debugDialogText('XML')), 'XML-Antwort → Hinweis auf JSON-Format');
ok(/JSON/.test(await debugDialogText('JSONOK')), 'JSON-Antwort → «passt»-Deutung');
ok(/erreichbar|Netzwerk/i.test(await debugDialogText('NETZ')), 'Netzwerkfehler → klarer Hinweis');
await debugDialogText('ACCESS');   // hat einen Roh-Auszug
ok(await page.evaluate(() => !!document.querySelector('.gema-dlg-msg pre')), 'Dialog zeigt den Roh-Auszug in einer <pre>-Box');

console.log('■ Sucheingabe-Klassifizierung (EAN / Artikel-Nr / Bezeichnung)');
ok(await page.evaluate(() => { const o = {}; _erpDsClassify('7630054958625', o); return o.ean === '7630054958625' && !o.artnr && !o.bez; }),
  '13-stellige Zahl → EAN');
ok(await page.evaluate(() => { const o = {}; _erpDsClassify('620.020.00.1', o); return o.artnr === '620.020.00.1' && !o.ean; }),
  'Artikelnummer (mit Punkten) → artnr');
ok(await page.evaluate(() => { const o = {}; _erpDsClassify('Spülkasten', o); return o.bez === 'Spülkasten' && !o.artnr && !o.ean; }),
  'Text → bez');

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden');
process.exit(fail ? 1 : 0);
