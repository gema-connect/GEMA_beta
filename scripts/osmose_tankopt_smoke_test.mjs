#!/usr/bin/env node
/* Osmose — Tankoptimierung: Playwright-Smoke
 * Deckt ab: Sichtbarkeits-Regel (online → Hinweis, offline/Tank → aktiv),
 * Excel-Checks AC49/AC51 in der Ergebnis-Karte, Auto-Verteilen (Bedarf +
 * Produktion), Zeilen-Status «✓/zu viel», Füllstand-Warnzellen, Vorschlag
 * (osmTankMin) + Übernahme in die gewählte Tankgrösse, Persistenz-Roundtrip
 * über das hidden Textarea (#os_tankopt, zk_rows-Muster).
 * Ausführen: CHROME=<chromium> node scripts/osmose_tankopt_smoke_test.mjs (aus scripts/)
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
await page.goto(BASE + '/sa_osmose.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof recalc === 'function' && document.querySelectorAll('#consumerBody tr').length >= 1, null, { timeout: 9000 });

async function setInp(sel, val) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, String(val)]);
}
async function setConsumer(row, name, flow, hours) {
  await page.evaluate(([r, n, f, h]) => {
    const tr = document.querySelectorAll('#consumerBody tr')[r];
    const inps = tr.querySelectorAll('input');
    inps[0].value = n; inps[1].value = f; inps[2].value = h;
    inps[2].dispatchEvent(new Event('input', { bubbles: true }));
  }, [row, name, String(flow), String(hours)]);
}

console.log('■ Online-Fall — Hinweis statt Profil');
{
  await setInp('#va', 200);
  await setConsumer(0, 'Labor', 100, 8);          // vb=100 < va=200 → online möglich
  ok(await page.evaluate(() => document.getElementById('tankZwingend').textContent) === 'NEIN', 'AC49: Reinwassertank zwingend = NEIN');
  ok(await page.evaluate(() => document.getElementById('onlineMoeglich').textContent) === 'JA', 'AC51: Online-Anlage möglich = JA');
  ok(await page.evaluate(() => document.getElementById('tankoptSection').style.display !== 'none'), 'Sektion sichtbar (Daten vorhanden)');
  ok(await page.evaluate(() => document.getElementById('otOnlineHint').style.display !== 'none'), 'Online-Hinweis eingeblendet');
  ok(await page.evaluate(() => document.getElementById('otBody').style.display === 'none'), '24-h-Profil ausgeblendet (nicht nötig)');
}

console.log('■ Offline-Fall — Profil aktiv, Auto-Verteilen, Warnungen');
{
  await setConsumer(0, 'Labor', 200, 4);          // vb=200 ≥ va=100 → Tank zwingend
  await setInp('#va', 100);
  ok(await page.evaluate(() => document.getElementById('tankZwingend').textContent) === 'JA', 'AC49: Tank zwingend = JA');
  ok(await page.evaluate(() => document.getElementById('onlineMoeglich').textContent) === 'NEIN', 'AC51: Online möglich = NEIN');
  ok(await page.evaluate(() => document.getElementById('otBody').style.display !== 'none'), '24-h-Profil eingeblendet');
  ok(await page.evaluate(() => document.querySelectorAll('#otTbl input[data-kind="b"]').length) === 4 * 24, '4 Verbraucher-Zeilen × 24 Stundenfelder gerendert');
  ok(await page.evaluate(() => document.getElementById('otLaufzeit').textContent) === '8.00', 'Laufzeit = Tagesbedarf 800 / VA 100 = 8 h');

  // Bedarf auto-verteilen: 200 l/h × 4 h ab 06
  await page.evaluate(() => otVerteileBedarf(document.querySelector('#otTbl tr[data-key]').getAttribute('data-key')));
  const b = await page.evaluate(() => {
    const tr = document.querySelector('#otTbl tr[data-key]');
    const key = tr.getAttribute('data-key');
    const raster = document.querySelector('#otTbl tr.ot-hrow[data-hkey="' + key + '"]');
    const vals = [...raster.querySelectorAll('input[data-kind="b"]')].map(i => i.value);
    return { h6: vals[6], h9: vals[9], h10: vals[10], sum: tr.querySelector('[data-sum]').textContent, pill: tr.querySelector('[data-warn]').textContent };
  });
  ok(b.h6 === '200' && b.h9 === '200' && b.h10 === '', 'Auto-Verteilen Bedarf: 06–09 je 200 l, danach leer');
  ok(/800\s*\/\s*800/.test(b.sum.replace(/’|'/g, '')), 'Zeilen-Σ = Soll (800/800)');
  ok(b.pill.includes('✓'), 'Status-Pill ✓ (Soll exakt verteilt)');

  // Produktion auto-verteilen: VA 100 × 8 h ab 06
  await page.evaluate(() => otVerteileProd());
  const p = await page.evaluate(() => ({
    diff: document.getElementById('otDiff').textContent,
    kpi: document.getElementById('otDiffKpi').className,
    psum: document.querySelector('#otTbl [data-psum]').textContent
  }));
  ok(/^0/.test(p.diff.trim()), 'Differenz zu vergeben = 0 (Produktion = produzierbar)');
  ok(p.kpi.includes('good'), 'Differenz-KPI grün');

  // Füllstand ohne Startfüllung: Defizit → rote «zu wenig»-Zellen
  ok(await page.evaluate(() => document.querySelectorAll('#otTbl .ot-low').length) > 0, 'Füllstand-Warnzellen (< 50 l Reserve) vorhanden');
  ok(await page.evaluate(() => document.getElementById('otMinHint').textContent).then(t => t.includes('450')), 'min. erforderlich = 450 l (max. Defizit 400 + 50 Reserve)');
}

console.log('■ Vorschlag + Übernahme');
{
  await page.evaluate(() => otVorschlag());
  ok(await page.evaluate(() => document.getElementById('otOptTank').value) === '450', 'Vorschlag übernimmt 450 l als optimierte Tankgrösse');
  ok(await page.evaluate(() => document.querySelectorAll('#otTbl td.ot-low').length) === 0, 'mit 450 l Startfüllung keine «zu wenig»-Zellen mehr');
  ok(await page.evaluate(() => document.querySelectorAll('#otTbl td.ot-over').length) === 0, 'kein Überlauf (Produktion folgt dem Bedarf)');
  await page.evaluate(() => otUebernehmen());
  ok(await page.evaluate(() => document.getElementById('tankSelected').value) === '450', 'Übernahme schreibt 450 in «Gewählte Tankgrösse»');
  ok(await page.evaluate(() => document.getElementById('vnSelected').textContent).then(t => t.includes('450')), 'Ergebnis-Karte zeigt den gewählten Tank');
  ok(await page.evaluate(() => document.getElementById('otTankVergleich').textContent).then(t => t.includes('deckt')), 'Vergleichstext: gewählte Grösse deckt die optimierte');
}

console.log('■ Produktions-Warnung (Stundenwert > VA)');
{
  await page.evaluate(() => {
    const inp = document.querySelector('#otTbl input[data-kind="p"][data-h="6"]');
    inp.value = '250';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  ok(await page.evaluate(() => document.querySelector('#otTbl input[data-kind="p"][data-h="6"]').classList.contains('warn')), 'Stundenproduktion 250 > VA 100 → Feld markiert');
  ok(await page.evaluate(() => document.querySelector('#otTbl [data-pwarn]').textContent).then(t => t.includes('zu viel')), 'Σ Produktion > produzierbar → «zu viel»');
  await page.evaluate(() => {
    const inp = document.querySelector('#otTbl input[data-kind="p"][data-h="6"]');
    inp.value = '100';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

console.log('■ Persistenz-Roundtrip (#os_tankopt, zk_rows-Muster)');
{
  const ta = await page.evaluate(() => JSON.parse(document.getElementById('os_tankopt').value));
  ok(ta && ta.prod && ta.prod[6] === 100 && ta.optTank !== '', 'Textarea trägt den vollen Zustand (Produktion + optimierter Tank)');
  // Restore simulieren: fremder Zustand → change-Event → UI übernimmt
  await page.evaluate(() => {
    const st = { bedarf: {}, ab: {}, prod: Array(24).fill(0), abProd: 3, optTank: '777' };
    st.prod[3] = 55;
    const el = document.getElementById('os_tankopt');
    el.value = JSON.stringify(st);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok(await page.evaluate(() => document.getElementById('otOptTank').value) === '777', 'Restore setzt optimierte Tankgrösse');
  ok(await page.evaluate(() => document.querySelector('#otTbl input[data-kind="p"][data-h="3"]').value) === '55', 'Restore füllt die Stundenfelder neu');
}

await ctx.close();
await browser.close();
server.close();
console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
