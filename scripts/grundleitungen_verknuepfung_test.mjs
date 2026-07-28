#!/usr/bin/env node
/* Grundleitungen — Verknüpfungs-Test (Cross-Modul-Kette)
 * (1) sb_du_zusammenstellung: save() schreibt die additiven totals
 *     {qzu,duMax,qww,qc,qtot,k} — Lesekanal für sb_grundleitungen.
 * (2) sb_niederschlag: getState() trägt straengeSummary (additiv, Roundtrip-fest).
 * (3) sb_grundleitungen: «⇩ DU-Zusammenstellung» übernimmt totals (inkl.
 *     K-Übernahme-Dialog), «⇩ Niederschlag» öffnet den Strang-Picker und
 *     übernimmt Q + Schlammsammler-Marker (Cloud via Route-Mock).
 * Ausführen: CHROME=<chromium> node scripts/grundleitungen_verknuepfung_test.mjs
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

console.log('■ DU-Zusammenstellung: save() liefert totals');
{
  const { page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/sb_du_zusammenstellung.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof save === 'function' && typeof GROUPS !== 'undefined', null, { timeout: 9000 });
  const cap = await page.evaluate(() => {
    const grp = GROUPS.find(g => !g.variable);
    const it = grp.items[0];
    qty[it.id] = 4;                                   // 4 × DU der ersten Gruppe
    document.getElementById('qc1').value = '0.3';
    _GemaDB.save = function(k, v) { window.__cap = { k, v }; };
    save();
    return { cap: window.__cap, du: grp.du };
  });
  const d = JSON.parse(cap.cap.v);
  ok(!!d.totals, 'totals im Save-Payload');
  ok(Math.abs(d.totals.qzu - 4 * cap.du) < 1e-9, 'totals.qzu = 4 × DU (' + d.totals.qzu + ')');
  ok(Math.abs(d.totals.duMax - cap.du) < 1e-9, 'totals.duMax = DU der Gruppe');
  ok(Math.abs(d.totals.qww - 0.5 * Math.sqrt(4 * cap.du)) < 1e-9, 'totals.qww = K·√(ΣDU)');
  ok(Math.abs(d.totals.qc - 0.3) < 1e-9, 'totals.qc = 0.3');
  ok(Math.abs(d.totals.qtot - (Math.max(d.totals.qww, d.totals.duMax) + 0.3)) < 1e-9, 'totals.qtot = max(Qww, DUmax) + Qc');
  ok(d.totals.k === 0.5, 'totals.k = K');
  ok(!!d.qty && !!d.qc, 'Bestehende Felder (qty, qc) unverändert dabei');
  await page.context().close();
}

console.log('■ Niederschlag: getState() trägt straengeSummary (additiv)');
{
  const { page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/sb_niederschlag.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._strHooks && typeof _strHooks.getState === 'function', null, { timeout: 9000 });
  const r = await page.evaluate(() => {
    const st = _strHooks.getState();
    let round = true;
    try { _strHooks.setState(JSON.parse(JSON.stringify(st))); } catch (e) { round = false; }
    const st2 = _strHooks.getState();
    return { hat: Array.isArray(st.straengeSummary), round, hat2: Array.isArray(st2.straengeSummary) };
  });
  ok(r.hat, 'straengeSummary vorhanden (Array)');
  ok(r.round, 'setState(getState()) Roundtrip ohne Fehler');
  ok(r.hat2, 'straengeSummary auch nach Roundtrip');
  await page.context().close();
}

console.log('■ Grundleitungen: Übernahme aus beiden Modulen (Cloud-Mock)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const duState = JSON.stringify({ qty: {}, varDU: {}, K: 0.7, meta: {}, qc: {},
    totals: { qzu: 42.5, duMax: 2.5, qww: 0.7 * Math.sqrt(42.5), qc: 0.4, qtot: 0.7 * Math.sqrt(42.5) + 0.4, k: 0.7 } });
  const nbState = JSON.stringify({ v: 1, straenge: [], ss: [],
    straengeSummary: [
      { id: 1, name: 'WAR-R 1', warType: 'WAR-R', qLps: 4.812, areaM2: 240.0, ssId: '2', ssName: 'SS 2' },
      { id: 2, name: 'WAR-S 1', warType: 'WAR-S', qLps: 1.25, areaM2: 60.0, ssId: '', ssName: '' }
    ] });
  await ctx.route('**/rest/v1/gema_data?module_key=eq.du_zusammenstellung*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ payload: { v: duState } }]) }));
  await ctx.route('**/rest/v1/gema_data?module_key=eq.niederschlagsanfall*', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ payload: { v: nbState } }]) }));

  await page.goto(BASE + '/sb_grundleitungen.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof glRecalc === 'function' && document.querySelectorAll('#glQBody tr').length >= 1, null, { timeout: 9000 });

  // ⇩ DU-Zusammenstellung → totals übernehmen, K-Dialog erscheint (0.7 ≠ 0.5)
  await page.click('#glQBody tr button.gl-linkbtn');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /K übernehmen/.test(b.textContent)), null, { timeout: 6000 });
  ok(true, 'K-Abweichungs-Dialog erscheint (DU-Modul K = 0.7)');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /K übernehmen/.test(b.textContent)).click(); });
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr')[0].querySelectorAll('input[type="text"]')[1].value === '42.5', null, { timeout: 6000 });
  const du = await page.evaluate(() => {
    const inps = document.querySelectorAll('#glQBody tr')[0].querySelectorAll('input[type="text"]');
    return { du: inps[1].value, duMax: inps[2].value, qc: inps[3].value,
             k: document.querySelector('#glkRow .glk-opt.sel .kv').textContent,
             chip: document.querySelector('#glQBody .gl-chip.link') ? document.querySelector('#glQBody .gl-chip.link').textContent : '' };
  });
  ok(du.du === '42.5' && du.duMax === '2.5' && du.qc === '0.4', 'ΣDU/gr. DU/Dauer übernommen (42.5 / 2.5 / 0.4)');
  ok(du.k === '0.7', 'K = 0.7 übernommen');
  ok(/DU-Zus/.test(du.chip), 'Herkunfts-Chip «⇩ DU-Zus.»');
  const qww = await page.evaluate(() => document.querySelector('#glResBody tr .qtot').textContent);
  ok(/4\.9[6-7]/.test(qww), 'Qtot = 0.7·√42.5 + 0.4 ≈ 4.96 l/s (' + qww.trim() + ')');

  // ⇩ Niederschlag → Picker mit 2 Strängen, Übernahme inkl. SS-Marker
  await page.click('button.gl-add:has-text("＋ Regenwasser")');
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 2);
  await page.evaluate(() => { [...document.querySelectorAll('#glQBody tr')[1].querySelectorAll('button')].find(b => /Niederschlag/.test(b.textContent)).click(); });
  await page.waitForFunction(() => document.getElementById('glPickBg').classList.contains('open'), null, { timeout: 6000 });
  ok(await page.evaluate(() => document.querySelectorAll('#glPickList .gl-pick-item').length) === 2, 'Picker zeigt 2 Stränge');
  ok(await page.evaluate(() => /SS 2/.test(document.querySelectorAll('#glPickList .gl-pick-item')[0].textContent)), 'Strang-Karte nennt den Schlammsammler');
  await page.click('#glPickList .gl-pick-item');
  await page.waitForFunction(() => !document.getElementById('glPickBg').classList.contains('open'));
  const rw = await page.evaluate(() => {
    const inps = document.querySelectorAll('#glQBody tr')[1].querySelectorAll('input[type="text"]');
    return { name: inps[0].value, q: inps[1].value, ss: inps[2].value };
  });
  ok(rw.name === 'WAR-R 1' && rw.q === '4.81' && rw.ss === 'SS 2', 'Strang übernommen: Name + Q 4.81 l/s + SS-Marker');
  ok(await page.evaluate(() => /SS/.test(document.querySelector('#glSchema svg').innerHTML)), 'SVG: SS-Kreis am Regenwasser-Stub');
  await page.context().close();
}

await browser.close();
server.close();
console.log('');
console.log(failCount === 0 ? '✅ ' + okCount + '/' + okCount + ' Checks grün' : '❌ ' + failCount + ' von ' + (okCount + failCount) + ' Checks rot');
process.exit(failCount === 0 ? 0 : 1);
