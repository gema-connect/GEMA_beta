#!/usr/bin/env node
/* Warmwasser — Speicherschema: Playwright-Smoke
 * Deckt ab: Schema-Rendering in Tab ④ mit allen Beschriftungen der Vorlage
 * (Warmwasserausgang, Kaltwassereingang, Fühler/Fühler Ein, Bereitschafts-
 * volumen, Wärmeerzeuger, Totales Speichervolumen) + Ergänzungen (Misch- &
 * Reservevolumen, %-Anteile, Ladezeit/Umsatz-Chips), Zonen-Höhen im
 * Grössenverhältnis der berechneten Volumen, Umschalter «2 in Serie»
 * (zwei Behälter, Verbindung «vorgewärmt», Volumenerhalt), Persistenz des
 * Umschalters über das hidden Input (AutoSave-Restore-Pfad) und Chip-Klick.
 * Ausführen: CHROME=<chromium> node scripts/warmwasser_speicherschema_smoke_test.mjs (aus scripts/)
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
await page.waitForFunction(() => typeof wwRecalc === 'function' && typeof window._wwSpSchemaDraw === 'function', null, { timeout: 12000 });

// Bedarf in der Feinplanung seeden (50 P Mehrfamilienhaus) → Tab ④ liefert Volumen
await page.evaluate(() => {
  wwState.fein.push({ ne: 3, n: '50', profil: 'wohnbau' });
  wwRenderTables();
  wwRecalc();
});
await page.evaluate(() => { document.querySelector('[data-tab="wt4"]').click(); });

const zoneColors = { pk: '#dbeafe', ctrl: '#dcfce7', misch: '#ede9fe' };
function readZones() {
  return page.evaluate((cols) => {
    const svg = document.querySelector('#wwSpSchemaWrap svg');
    if (!svg) return null;
    const out = { txt: svg.textContent, tanks: 0, zones: {} };
    svg.querySelectorAll('rect').forEach(r => {
      const f = r.getAttribute('fill'), st = r.getAttribute('stroke');
      if (st === '#111827') out.tanks++;
      Object.keys(cols).forEach(k => {
        if (f === cols[k]) out.zones[k] = (out.zones[k] || 0) + parseFloat(r.getAttribute('height'));
      });
    });
    return out;
  }, zoneColors);
}

console.log('■ Schema mit 1 Speicher — Beschriftungen + Grössenverhältnis');
{
  const last = await page.evaluate(() => ({ pk: _wwLast.spitze, ctrl: _wwLast.ctrlEffektiv, vtot: _wwLast.vstoEff }));
  ok(last.vtot > 0 && last.pk > 0 && last.ctrl > 0, 'Berechnung liefert Volumen (Vtot ' + Math.round(last.vtot) + ' l)');
  const z = await readZones();
  ok(!!z, 'Schema-SVG gerendert');
  ok(z.tanks === 1, 'ein Behälter');
  ['Warmwasserausgang', 'Kaltwassereingang', 'Fühler', 'Fühler Ein', 'Bereitschaftsvolumen', 'Wärmeerzeuger', 'Totales Speichervolumen'].forEach(t => {
    ok(z.txt.includes(t), 'Beschriftung «' + t + '» vorhanden');
  });
  ok(z.txt.includes('Misch- & Reservevolumen') && z.txt.includes('fsto-Zuschlag'), 'unbenannte Vorlage-Zone ergänzt: «Misch- & Reservevolumen (fsto-Zuschlag)»');
  ok(z.txt.includes('Spitzendeckungsvolumen') && z.txt.includes('Steuervolumen'), 'Zonen-Beschriftungen vorhanden');
  ok(z.txt.includes('%'), '%-Anteile ausgewiesen');
  ok(z.txt.includes('50') && z.txt.includes('kW'), 'Wärmeerzeuger zeigt die gewählte Leistung (50 kW)');
  ok(z.txt.includes('Ladezeit') && z.txt.includes('Umsatz'), 'Kennwerte-Chips Ladezeit + Umsatz');
  // Höhen proportional zu den Volumen
  const misch = last.vtot - last.pk - last.ctrl;
  const hSum = z.zones.pk + z.zones.ctrl + z.zones.misch;
  ok(Math.abs(hSum - 300) < 1.5, 'Zonen-Höhen füllen den Behälter (Σ ' + hSum.toFixed(1) + ' px = 300)');
  const ratioPx = z.zones.pk / z.zones.ctrl, ratioVol = last.pk / last.ctrl;
  ok(Math.abs(ratioPx - ratioVol) < 0.02, 'pk/ctrl-Höhenverhältnis = Volumenverhältnis (' + ratioPx.toFixed(3) + ' ≈ ' + ratioVol.toFixed(3) + ')');
  const ratioPx2 = z.zones.misch / (z.zones.pk + z.zones.ctrl), ratioVol2 = misch / (last.pk + last.ctrl);
  ok(Math.abs(ratioPx2 - ratioVol2) < 0.02, 'Misch-Anteil proportional (fsto-Zuschlag)');
}

console.log('■ Umschalten auf 2 Speicher in Serie');
{
  await page.evaluate(() => wwSpSetAnzahl(2));
  const z = await readZones();
  ok(z.tanks === 2, 'zwei Behälter gezeichnet');
  ok(z.txt.includes('Speicher 1 — Bereitschaft') && z.txt.includes('Speicher 2 — Vorwärmung'), 'Behälter beschriftet (Bereitschaft / Vorwärmung)');
  ok(z.txt.includes('vorgewärmt'), 'Serie-Verbindung «vorgewärmt» beschriftet');
  ok(z.txt.includes('Serie: Kaltwasser'), 'Fliessweg-Chip (KW → Speicher 2 → Speicher 1 → WW)');
  const hSum = z.zones.pk + z.zones.ctrl + z.zones.misch;
  ok(Math.abs(hSum - 600) < 2, 'Zonen füllen beide Behälter (Σ ' + hSum.toFixed(1) + ' px = 600)');
  const last = await page.evaluate(() => ({ pk: _wwLast.spitze, ctrl: _wwLast.ctrlEffektiv, vtot: _wwLast.vstoEff }));
  const pxProL = 600 / last.vtot;
  ok(Math.abs(z.zones.pk - last.pk * pxProL) < 2, 'Spitzendeckung volumen-erhalten über beide Behälter');
  ok(await page.evaluate(() => document.getElementById('ww_sp_anzahl').value) === '2', 'hidden Input trägt «2» (AutoSave-Persistenz)');
  ok(await page.evaluate(() => document.querySelector('#wwSpSeg .g-seg[data-anz="2"]').classList.contains('active')), 'Segment-Button «2 in Serie» aktiv');
}

console.log('■ Restore-Pfad (AutoSave setzt das hidden Input + change)');
{
  await page.evaluate(() => {
    const inp = document.getElementById('ww_sp_anzahl');
    inp.value = '1';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const z = await readZones();
  ok(z.tanks === 1, 'Restore auf «1» → wieder ein Behälter');
  ok(await page.evaluate(() => document.querySelector('#wwSpSeg .g-seg[data-anz="1"]').classList.contains('active')), 'Segment folgt dem Restore');
}

console.log('■ Chip-Klick springt zum Eingabefeld');
{
  await page.evaluate(() => {
    const el = document.querySelector('#wwSpSchemaWrap [data-wwziel="ww_leistung"]');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'ww_leistung'), 'Wärmeerzeuger-Box fokussiert «Gewählte Wärmeerzeugerleistung»');
}

console.log('■ Leerzustand');
{
  await page.evaluate(() => { wwState.fein = []; wwRenderTables(); wwRecalc(); });
  ok(await page.evaluate(() => document.getElementById('wwSpSchemaWrap').textContent.includes('sobald die Feinplanung')), 'ohne Bedarf: Hinweis statt Schema');
}

if (errors.length) console.log('  [pageerrors]', errors.slice(0, 5));
ok(errors.length === 0, 'Keine JS-Fehler auf der Seite');

await ctx.close();
await browser.close();
server.close();
console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
