#!/usr/bin/env node
/* Osmose — Tagesablauf-Simulation (Tank-SVG): Playwright-Smoke
 * Deckt ab: Tank-Visualisierung in der Tankoptimierung (Wasserstand im
 * Grössenverhältnis, Marker Tankgrösse/Reserve), lineare Interpolation
 * zwischen den Stundenwerten (osmSimLevel, ENGINE), Zulauf-/Ablauf-
 * Aktivierung je Stunde, Slider-Scrubbing + Uhrzeit, Play/Pause
 * (Zeit läuft), Warnzustände (Reserve unterschritten) und Leerzustand
 * ohne Tankgrösse.
 * Ausführen: CHROME=<chromium> node scripts/osmose_tanksim_smoke_test.mjs (aus scripts/)
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
await page.goto(BASE + '/sa_osmose.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof recalc === 'function' && typeof osmSimLevel === 'function' && window._otSimHooks, null, { timeout: 12000 });

async function setInp(sel, val) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, String(val)]);
}

// Offline-Szenario wie im Tankopt-Test: 200 l/h × 4 h ab 06, VA 100, Tank 450
await setInp('#va', 100);
await page.evaluate(() => {
  const tr = document.querySelectorAll('#consumerBody tr')[0];
  const inps = tr.querySelectorAll('input');
  inps[0].value = 'Labor'; inps[1].value = '200'; inps[2].value = '4';
  inps[2].dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => otVerteileBedarf(document.querySelector('#otTbl tr[data-key]').getAttribute('data-key')));
await page.evaluate(() => otVerteileProd());
await page.evaluate(() => otVorschlag());   // optimierte Tankgrösse 450 l

console.log('■ Engine — osmSimLevel (lineare Interpolation)');
{
  const e = await page.evaluate(() => {
    const f = [];
    for (let h = 0; h < 24; h++) f.push(h < 6 ? 450 : null);
    // echte Werte aus dem Modul-Zustand holen
    const d = _otSimHooks.state().data;
    return {
      t0: osmSimLevel(450, d.fuell, 0),
      t6: osmSimLevel(450, d.fuell, 6),
      t65: osmSimLevel(450, d.fuell, 6.5),
      t10: osmSimLevel(450, d.fuell, 10),
      f5: d.fuell[5], f6: d.fuell[6], f9: d.fuell[9]
    };
  });
  ok(Math.abs(e.t0 - 450) < 1e-9, 'Level um 00:00 = Startfüllung (450 l)');
  ok(Math.abs(e.t6 - e.f5) < 1e-9, 'Level um 06:00 = Stand Ende Stunde 5');
  ok(Math.abs(e.t65 - (e.f5 + (e.f6 - e.f5) * 0.5)) < 1e-9, 'Level um 06:30 = Mittelwert (lineare Interpolation)');
  ok(Math.abs(e.t10 - e.f9) < 1e-9, 'Level um 10:00 = Stand Ende Stunde 9 (Minimum 50 l)');
  ok(Math.abs(e.f9 - 50) < 1e-9, 'Tiefpunkt exakt auf der 50-l-Reserve (Vorschlag 450)');
}

console.log('■ Tank-SVG — Aufbau + Grössenverhältnis');
{
  const z = await page.evaluate(() => {
    const svg = document.querySelector('#otSimWrap svg');
    if (!svg) return null;
    _otSimHooks.setT(6);   // 06:00 → Level 450 = Tankgrösse
    const water = svg.querySelector('[data-sim="water"]');
    return {
      txt: svg.textContent,
      h450: parseFloat(water.getAttribute('height')),
      cap: _otSimHooks.cap()
    };
  });
  ok(!!z, 'Simulation-SVG gerendert');
  // Feedback 31.07.2026: «Verbraucher» in EINER Zeile (vorher «Verbrau-»/«cher»)
  ok(z.txt.includes('Reinwassertank') && z.txt.includes('Osmose-') && z.txt.includes('Verbraucher'), 'Beschriftungen Tank/Zulauf/Ablauf (Verbraucher einzeilig)');
  ok(z.txt.includes('Tankgrösse') && z.txt.includes('Reserve 50 l'), 'Marker-Linien Tankgrösse + Reserve beschriftet');
  const expH = 450 / z.cap * 280;
  ok(Math.abs(z.h450 - expH) < 1.5, 'Wasserhöhe proportional (450 l → ' + z.h450.toFixed(1) + ' px ≈ ' + expH.toFixed(1) + ')');
  const t10 = await page.evaluate(() => {
    _otSimHooks.setT(10);
    const svg = document.querySelector('#otSimWrap svg');
    return {
      h: parseFloat(svg.querySelector('[data-sim="water"]').getAttribute('height')),
      lvl: svg.querySelector('[data-sim="lvlTxt"]').textContent,
      cap: _otSimHooks.cap()
    };
  });
  ok(Math.abs(t10.h - 50 / t10.cap * 280) < 1.5, 'um 10:00 Wasserhöhe = 50-l-Reserve');
  ok(t10.lvl.includes('50 l'), 'Füllstand-Chip zeigt 50 l');
}

console.log('■ Zulauf/Ablauf-Aktivierung je Stunde');
{
  const a = await page.evaluate(() => {
    const svg = document.querySelector('#otSimWrap svg');
    const q = k => svg.querySelector('[data-sim="' + k + '"]');
    _otSimHooks.setT(7.5);   // 07:xx — Produktion läuft (ab 06) UND Bedarf läuft
    const beide = { p: q('prodGrp').getAttribute('opacity'), b: q('bedGrp').getAttribute('opacity'),
                    pt: q('prodTxt').textContent, bt: q('bedTxt').textContent };
    _otSimHooks.setT(2);     // 02:xx — nichts aktiv
    const nix = { p: q('prodGrp').getAttribute('opacity'), b: q('bedGrp').getAttribute('opacity') };
    _otSimHooks.setT(12);    // 12:xx — nur Produktion (bis 14)
    const nurP = { p: q('prodGrp').getAttribute('opacity'), b: q('bedGrp').getAttribute('opacity') };
    return { beide, nix, nurP };
  });
  ok(a.beide.p === '1' && a.beide.b === '1', '07:30 — Zulauf UND Ablauf aktiv');
  ok(a.beide.pt.includes('+100') && a.beide.bt.includes('200'), 'Raten-Chips: +100 l/h Zulauf, −200 l/h Ablauf');
  ok(a.nix.p === '0.28' && a.nix.b === '0.28', '02:00 — beides inaktiv (abgeblendet)');
  ok(a.nurP.p === '1' && a.nurP.b === '0.28', '12:00 — nur der Zulauf aktiv');
}

console.log('■ Slider + Uhrzeit + Play/Pause');
{
  await page.evaluate(() => otSimScrub('13.5'));
  /* Feedback 03.08.2026 (Sandro) «Zeitangabe nach oben schieben»: Die Uhr steht
     in der KOPFZEILE (#otSimZeit, Zahl + Tag/Nacht-Symbol) — im SVG gibt es
     keine zweite Uhr mehr. */
  ok(await page.evaluate(() => document.getElementById('otSimZeit').textContent).then(t => t.startsWith('13:30')), 'Scrub auf 13.5 → Uhrzeit 13:30');
  ok(await page.evaluate(() => document.getElementById('otSimTag').textContent) === '☀️', 'Tag/Nacht-Symbol in der Kopfzeile (13:30 = Tag)');
  ok(await page.evaluate(() => !document.querySelector('#otSimWrap [data-sim="clock"]')), 'keine Uhr mehr im Schema');
  await page.evaluate(() => otSimToggle());
  ok(await page.evaluate(() => _otSimHooks.state().playing === true), 'Play gestartet');
  ok(await page.evaluate(() => document.getElementById('otSimPlayBtn').textContent.includes('Pause')), 'Button zeigt Pause');
  const t1 = await page.evaluate(() => _otSimHooks.state().t);
  await page.waitForTimeout(420);
  const t2 = await page.evaluate(() => _otSimHooks.state().t);
  ok(t2 > t1 + 0.3, 'Zeit läuft während Play (' + t1.toFixed(2) + ' → ' + t2.toFixed(2) + ' h)');
  await page.evaluate(() => otSimToggle());
  ok(await page.evaluate(() => _otSimHooks.state().playing === false), 'Pause stoppt die Simulation');
}

console.log('■ Warnzustand + Leerzustand');
{
  await setInp('#otOptTank', 100);   // zu klein → Level fällt unter die Reserve
  const w = await page.evaluate(() => {
    _otSimHooks.setT(10);
    const svg = document.querySelector('#otSimWrap svg');
    return { pill: svg.querySelector('[data-sim="pillTxt"]').textContent,
             fill: svg.querySelector('[data-sim="water"]').getAttribute('fill') };
  });
  ok(w.pill.includes('Reserve unterschritten'), 'Status-Pill warnt bei Unterschreitung');
  ok(w.fill === '#fecaca', 'Wasser färbt sich rot');
  await setInp('#otOptTank', '');
  ok(await page.evaluate(() => document.getElementById('otSimWrap').textContent.includes('sobald die optimierte Tankgrösse')), 'ohne Tankgrösse: Hinweis statt Tank');
  await page.evaluate(() => otVorschlag());
}

if (errors.length) console.log('  [pageerrors]', errors.slice(0, 5));
ok(errors.length === 0, 'Keine JS-Fehler auf der Seite');

await ctx.close();
await browser.close();
server.close();
console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
