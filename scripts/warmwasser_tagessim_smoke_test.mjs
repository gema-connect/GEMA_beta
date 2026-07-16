#!/usr/bin/env node
/* Warmwasser — Tagesablauf-Simulation (Tab ⑤): Playwright-Smoke
 * Deckt ab: animierter Speicher-Ladezustand aus wwSlSim (eingeschwungener
 * Tag, Diagrammstart 05:00) — Warm-Schicht im Grössenverhältnis des
 * Speicherinhalts, Uhrzeit-Mapping (t=0 → 05:00), Verbrauchs-/Lade-
 * Aktivierung je Schritt, Slider + Play/Pause, Unterdeckungs-Warnung
 * bei zu kleinem Anzeige-Speicher, Leerzustand ohne Leistung.
 * Ausführen: CHROME=<chromium> node scripts/warmwasser_tagessim_smoke_test.mjs (aus scripts/)
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
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/sb_warmwasser.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof wwRecalc === 'function' && window._wwSimHooks && window._wwSimSync, null, { timeout: 12000 });

// Bedarf seeden (50 P Mehrfamilienhaus) → Tab ⑤ hat Tagesbedarf + Leistung (50 kW aus Tab ④)
await page.evaluate(() => {
  wwState.fein.push({ ne: 3, n: '50', profil: 'wohnbau' });
  wwRenderTables();
  wwRecalc();
  document.querySelector('[data-tab="wt5"]').click();
});

console.log('■ Aufbau + Grössenverhältnis der Warm-Schicht');
{
  const z = await page.evaluate(() => {
    const svg = document.querySelector('#wwSimWrap svg');
    if (!svg) return null;
    _wwSimHooks.setT(2);
    const D = _wwSimHooks.data();   // inkl. SIA-Fallback-Kapazität bei cap 0
    const k = Math.floor(2 / D.A.dt);
    const inhalt = D.sim.s[k + 1];
    return {
      txt: svg.textContent,
      warmH: parseFloat(svg.querySelector('[data-sim="warm"]').getAttribute('height')),
      exp: Math.max(0, Math.min(1, inhalt / D.cap)) * 280,
      lvl: svg.querySelector('[data-sim="lvlTxt"]').textContent,
      quelle: D.quelle
    };
  });
  ok(!!z, 'Simulation-SVG gerendert');
  ok(z.txt.includes('Warmwasserausgang') && z.txt.includes('Wärmeerzeuger') && z.txt.includes('Kaltwasser'), 'Beschriftungen WW-Ausgang / Wärmeerzeuger / Kaltwasser');
  ok(z.txt.includes('Speicher (Darstellung)'), 'Anzeige-Speichervolumen beschriftet');
  ok(z.quelle.includes('SIA'), 'cap 0 (durchgehende Ladung deckt alles) → Fallback auf eff. SIA-Speicher Tab ④');
  ok(Math.abs(z.warmH - z.exp) < 1.5, 'Warm-Schicht proportional zum Speicherinhalt (' + z.warmH.toFixed(1) + ' px ≈ ' + z.exp.toFixed(1) + ')');
  ok(/\d/.test(z.lvl) && z.lvl.includes('%'), 'Inhalt-Chip mit Litern + %');
}

console.log('■ Uhrzeit-Mapping (Diagrammstart 05:00)');
{
  const c = await page.evaluate(() => {
    const out = {};
    _wwSimHooks.setT(0); out.t0 = document.getElementById('wwSimZeit').textContent;
    _wwSimHooks.setT(12); out.t12 = document.getElementById('wwSimZeit').textContent;
    _wwSimHooks.setT(19); out.t19 = document.getElementById('wwSimZeit').textContent;
    return out;
  });
  ok(c.t0 === '05:00', 't=0 → 05:00');
  ok(c.t12 === '17:00', 't=12 → 17:00');
  ok(c.t19 === '00:00', 't=19 → 00:00 (über Mitternacht)');
}

console.log('■ Verbrauch/Ladung je Schritt');
{
  const a = await page.evaluate(() => {
    const svg = document.querySelector('#wwSimWrap svg');
    const q = k => svg.querySelector('[data-sim="' + k + '"]');
    // Morgenspitze (t=1 → 06:00): Verbrauch aktiv, durchgehende Ladung aktiv
    _wwSimHooks.setT(1);
    const morgen = { ww: q('wwGrp').getAttribute('opacity'), verb: q('verbTxt').textContent, lad: q('ladTxt').textContent };
    // Nacht (t=21 → 02:00): Wohnbau-Profil hat 0 % → Verbrauch aus
    _wwSimHooks.setT(21);
    const nacht = { ww: q('wwGrp').getAttribute('opacity') };
    return { morgen, nacht };
  });
  ok(a.morgen.ww === '1' && a.morgen.verb.includes('l/h'), '06:00 — Warmwasserausgang aktiv mit Rate');
  ok(a.morgen.lad === 'AUS' || a.morgen.lad.includes('l/h') || a.morgen.lad === 'bereit', 'Ladungs-Status angezeigt (' + a.morgen.lad + ')');
  ok(a.nacht.ww === '0.3', '02:00 nachts — Warmwasserausgang abgeblendet (kein Verbrauch)');
}

console.log('■ Play/Pause + Slider');
{
  await page.evaluate(() => wwSimScrub('6.5'));
  ok(await page.evaluate(() => document.getElementById('wwSimZeit').textContent) === '11:30', 'Scrub 6.5 → 11:30 Uhr');
  await page.evaluate(() => wwSimToggle());
  const t1 = await page.evaluate(() => _wwSimHooks.state().t);
  await page.waitForTimeout(420);
  const t2 = await page.evaluate(() => _wwSimHooks.state().t);
  ok(await page.evaluate(() => _wwSimHooks.state().playing) === true, 'Play läuft');
  ok(t2 > t1 + 0.3, 'Zeit läuft (' + t1.toFixed(2) + ' → ' + t2.toFixed(2) + ' h)');
  await page.evaluate(() => wwSimToggle());
  ok(await page.evaluate(() => _wwSimHooks.state().playing) === false, 'Pause');
  ok(await page.evaluate(() => document.getElementById('wwSimPlayBtn').textContent.includes('Abspielen')), 'Button zurück auf Abspielen');
}

console.log('■ Unterdeckung (Speicher + Leistung zu klein)');
{
  await page.evaluate(() => {
    // 2 kW (34 l/h) deckt die Morgenspitze nicht, 100 l Speicher ist sofort leer
    const p = document.getElementById('wwsl_leistung');
    p.value = '2';
    p.dispatchEvent(new Event('input', { bubbles: true }));
    const el = document.getElementById('wwsl_speicher');
    el.value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const u = await page.evaluate(() => {
    const D = _wwSimHooks.data();
    const segs = D.sim.unmetSegs;
    if (!segs.length) return { none: true };
    _wwSimHooks.setT(segs[0][0] * D.A.dt + 0.01);
    const svg = document.querySelector('#wwSimWrap svg');
    return { pill: svg.querySelector('[data-sim="pillTxt"]').textContent };
  });
  ok(!u.none && u.pill.includes('Unterdeckung'), 'Status-Pill warnt in der Unterdeckungs-Phase');
  await page.evaluate(() => {
    ['wwsl_leistung', 'wwsl_speicher'].forEach(id => {
      const el = document.getElementById(id);
      el.value = '0';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

console.log('■ Leerzustand ohne Ladeleistung');
{
  await page.evaluate(() => {
    document.getElementById('ww_leistung').value = '0';
    document.getElementById('wwsl_leistung').value = '0';
    wwRecalc();
  });
  ok(await page.evaluate(() => document.getElementById('wwSimWrap').textContent.includes('sobald Tagesbedarf und Ladeleistung')), 'ohne Leistung: Hinweis statt Tank');
}

if (errors.length) console.log('  [pageerrors]', errors.slice(0, 5));
ok(errors.length === 0, 'Keine JS-Fehler auf der Seite');

await ctx.close();
await browser.close();
server.close();
console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
