// Drift-Guard (Browser): Thermostatische Regulierventile in sb_zirkulation.html
// Feedback 06.08.2026 — Ventil-Auswahl, per-Strang wirksamer KV(T), dynamisches
// Kennlinien-/Druckverlust-Diagramm (#zkVentilCard), Kemper pending.
// Ausführen: CHROME=<chromium> node scripts/zirkulation_regventil_smoke_test.mjs
import { startServer, seed, wireRoutes, BASE } from './rolematrix_harness.mjs';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
await wireRoutes(ctx);
const errors = [];
await ctx.addInitScript((st) => {
  for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
}, seed(['role_planer']));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE + '/sb_zirkulation.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof zkRenderTable === 'function');
await page.waitForTimeout(900);

console.log('■ Boot & Auswahl');
t('Boot ohne pageerrors', errors.length === 0, errors.join(' | ').slice(0, 300));
t('Select #zk_regventil mit 5 Optionen (manuell + 4 Ventile)',
  await page.locator('#zk_regventil option').count() === 5);
t('Nussbaum-Optionen wählbar', await page.$eval('#zk_regventil option[value="nb15"]', o => !o.disabled) &&
  await page.$eval('#zk_regventil option[value="nb20"]', o => !o.disabled));
t('Kemper-Optionen pending → disabled («Kennlinie folgt»)',
  await page.$eval('#zk_regventil option[value="ke15"]', o => o.disabled && /Kennlinie folgt/.test(o.textContent)) &&
  await page.$eval('#zk_regventil option[value="ke20"]', o => o.disabled));
t('Default: fester Kvs → Kvs-Zeile sichtbar, Hinweis versteckt',
  await page.evaluate(() => document.getElementById('zkKvsRow').style.display !== 'none' &&
    document.getElementById('zkRegHint').style.display === 'none'));
t('Karte #zkVentilCard vorhanden + offen',
  await page.evaluate(() => !!document.getElementById('zkVentilCard') &&
    document.getElementById('bd_zkVentilC').style.display !== 'none'));

// Netz mit ZWEI Strängen unterschiedlicher Ventiltemperatur:
// TS1 (Root) → TS2 → TS3 (Strang A) und TS1 → TS4 (Strang B)
await page.evaluate(() => {
  zkRows = [1, 2, 3, 4].map(n => zkDefaultRow(n));
  zkRows[0].len = 50; zkRows[0].e = 2; zkRows[0].f = 4;
  zkRows[1].len = 30; zkRows[1].e = 3;
  zkRows[2].len = 20;
  zkRows[3].len = 25;
  zkPersist(); zkRenderTable(); zkRecalc();
});
await page.waitForTimeout(300);

console.log('■ Fester Kvs (Bestandsschutz)');
{
  const st = await page.evaluate(() => _zkLast.straenge.map(s => ({ m: s.m, kv: s.kvEff, dp: s.dpRO, t: s.tVentil })));
  t('2 Stränge mit Volumenstrom', st.length === 2 && st.every(s => s.m > 0), JSON.stringify(st).slice(0, 200));
  t('kvEff = fester Kvs 1.3 auf beiden Strängen', st.every(s => Math.abs(s.kv - 1.3) < 1e-12));
  t('Δp_Reg = (m/1.3)²/1000', st.every(s => Math.abs(s.dp - Math.pow(s.m / 1.3, 2) / 1000) < 1e-9));
  t('Diagramm: 2 SVG-Panels (Kennlinie + Δp)', await page.locator('#zkVentilDiag svg').count() === 2);
  t('manuell: EINE gemeinsame Betriebslinie (gleicher KV dedupliziert)',
    await page.locator('#zkVentilDiag .zkv-line').count() === 1);
  t('4 Betriebspunkte (2 Stränge × 2 Panels)', await page.locator('#zkVentilDiag .zkv-pt').count() === 4);
}

console.log('■ Nussbaum 36010 DN 15 gewählt');
await page.selectOption('#zk_regventil', 'nb15');
await page.waitForTimeout(300);
{
  t('Kvs-Zeile versteckt (Kennlinie übernimmt)',
    await page.evaluate(() => document.getElementById('zkKvsRow').style.display === 'none'));
  t('Hinweis nennt das Ventil + Einstellbereich',
    await page.evaluate(() => { const h = document.getElementById('zkRegHint'); return h.style.display !== 'none' && /Nussbaum 36010/.test(h.textContent) && /52–65/.test(h.textContent); }));
  const chk = await page.evaluate(() => {
    const v = zkRegVentilById('nb15');
    return _zkLast.straenge.map(s => ({
      name: s.name, t: s.tVentil, kv: s.kvEff, exp: zkRegKv(v, s.tVentil), m: s.m, dp: s.dpRO
    }));
  });
  t('kvEff je Strang = zkRegKv(Kennlinie, T am Ventil)',
    chk.every(s => s.kv != null && Math.abs(s.kv - s.exp) < 1e-12), JSON.stringify(chk).slice(0, 260));
  t('unterschiedliche Ventiltemperaturen → unterschiedliche KV je Strang',
    chk.length === 2 && Math.abs(chk[0].t - chk[1].t) > 0.01 && Math.abs(chk[0].kv - chk[1].kv) > 1e-6);
  t('Δp_Reg = (m/kvEff)²/1000 je Strang',
    chk.every(s => Math.abs(s.dp - Math.pow(s.m / s.kv, 2) / 1000) < 1e-9));
  t('Strang-Tabelle weist den wirksamen KV aus',
    await page.evaluate(() => /KV\s/.test(document.getElementById('zkStrangBody').textContent)));
  t('Kennlinien-Polyline gezeichnet (Herstellerkurve)',
    await page.locator('#zkVentilDiag polyline.zkv-curve').count() === 1);
  t('2 Betriebslinien (unterschiedliche KV)', await page.locator('#zkVentilDiag .zkv-line').count() === 2);
  t('Notiz: Quelle Nussbaum + Kemper-pending-Hinweis',
    await page.evaluate(() => { const n = document.getElementById('zkVentilNote').textContent; return /R\. Nussbaum 36010/.test(n) && /Kemper MULTI-THERM/.test(n); }));
}

console.log('■ Dynamik: Werte ändern → Diagramm folgt');
{
  const vor = await page.evaluate(() => ({
    kv: _zkLast.straenge[0].kvEff,
    cy: document.querySelector('#zkVentilDiag .zkv-pt circle').getAttribute('cy')
  }));
  // 58 → 56 °C (bleibt unter der Max. Netz-Temperatur 60 °C — bei höherem
  // T WW würde I = tref − T_RL negativ und die Stränge fielen auf m = 0)
  await page.selectOption('#zk_tww', '56');
  await page.waitForTimeout(300);
  const nach = await page.evaluate(() => ({
    kv: _zkLast.straenge[0].kvEff,
    t: _zkLast.straenge[0].tVentil,
    cy: document.querySelector('#zkVentilDiag .zkv-pt circle') ? document.querySelector('#zkVentilDiag .zkv-pt circle').getAttribute('cy') : null
  }));
  t('T WW 58→56 °C: wirksamer KV ändert sich', nach.cy != null && Math.abs(vor.kv - nach.kv) > 1e-6, vor.kv + ' → ' + nach.kv);
  t('Betriebspunkt wandert im Diagramm (cy ändert)', vor.cy !== nach.cy);
  t('neuer KV folgt weiter der Kennlinie', await page.evaluate(() =>
    _zkLast.straenge.every(s => Math.abs(s.kvEff - zkRegKv(zkRegVentilById('nb15'), s.tVentil)) < 1e-12)));
  await page.selectOption('#zk_tww', '58');
  await page.waitForTimeout(200);
  const laenge = await page.evaluate(() => {
    const alt = _zkLast.straenge[0].dpRO;
    zkRows[2].len = 40; zkPersist(); zkRenderTable(); zkRecalc();
    return { alt, neu: _zkLast.straenge[0].dpRO, m: _zkLast.straenge[0].m };
  });
  t('Teilstrecken-Änderung (Länge 20→40 m) verschiebt den Betriebspunkt',
    Math.abs(laenge.alt - laenge.neu) > 1e-9, JSON.stringify(laenge));
}

console.log('■ DN 20 + Fold + Rechte');
{
  await page.selectOption('#zk_regventil', 'nb20');
  await page.waitForTimeout(250);
  t('DN 20: kvEff folgt der 1.6er-Kennlinie', await page.evaluate(() =>
    _zkLast.straenge.every(s => Math.abs(s.kvEff - zkRegKv(zkRegVentilById('nb20'), s.tVentil)) < 1e-12)));
  await page.evaluate(() => zkFold('zkVentilC'));
  t('Karte einklappbar', await page.evaluate(() => document.getElementById('bd_zkVentilC').style.display === 'none'));
  await page.evaluate(() => zkFold('zkVentilC'));
  await page.waitForTimeout(250);
  t('Aufklappen zeichnet neu (2 SVGs wieder da)', await page.locator('#zkVentilDiag svg').count() === 2);
  t('zurück auf «fester Kvs»: Kvs-Zeile wieder sichtbar', await page.evaluate(() => {
    const el = document.getElementById('zk_regventil'); el.value = '';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return document.getElementById('zkKvsRow').style.display !== 'none';
  }));
  t('keine pageerrors über den ganzen Lauf', errors.length === 0, errors.join(' | ').slice(0, 300));
}

await ctx.close();
await browser.close();
server.close();
console.log('\nErgebnis: ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
