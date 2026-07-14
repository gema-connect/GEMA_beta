// Playwright-Smoke-Test für sb_saugpumpe.html (Saugpumpe — maximale Saughöhe).
// Prüft Laden/Gating, Live-Berechnung im DOM, pv-Automatik + Override,
// Negativ-Warnung, Dampfdruck-Tafel und den AutoSave-Roundtrip.
// Aufruf: CHROME=<chromium> node scripts/saugpumpe_smoke_test.mjs
// (nutzt das rolematrix-Harness: lokaler Server, externe Hosts gemockt)
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

async function openAsPlaner() {
  // Objekt seeden: AutoSave speichert/restored per Objekt (gema_saugpumpe__obj_t1)
  const s = seed(['role_planer']);
  s.gema_objekte_v1 = { objekte: [{ id: 'obj_t1', name: 'Testobjekt', ort: 'Basel', orgId: 'org_test' }], beteiligte: [], activeObjektId: 'obj_t1' };
  s.gema_active_objekt_v1 = 'obj_t1';
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/sb_saugpumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._sgLast != null, null, { timeout: 8000 });
  return { ctx, page };
}
async function setVal(page, id, v) {
  await page.fill('#' + id, String(v));
  await page.dispatchEvent('#' + id, 'input');
}
const kpi = (page, id) => page.$eval('#' + id, el => el.textContent.trim());

console.log('■ Laden & Default-Berechnung (Planer)');
{
  const { ctx, page } = await openAsPlaner();
  ok((await page.title()).includes('Saugpumpe'), 'Seite lädt mit Titel «Saugpumpe»');
  ok(await page.$eval('.gema-hero-title', el => el.textContent.includes('maximale Saughöhe')), 'Hero-Titel vorhanden');
  // Defaults: h=0, T=10, pf=0, NPSH=0, Hs=0.5, pv=auto (1228.1 Pa) → hmax ≈ 9.67 m
  const r = await page.evaluate(() => window._sgLast);
  ok(Math.abs(r.hmax - 9.6712) < 0.001, 'Default hmax ≈ 9.671 m (T=10, Hs=0.5, pv aus Tafel)');
  ok(Math.abs(r.pvAuto - 1228.1) < 0.01 && r.pvManuell === false, 'pv automatisch aus Tafel (1228.1 Pa bei 10 °C)');
  ok((await kpi(page, 'sg_kpi_hmax')) === '9.67', 'KPI hmax zeigt 9.67');
  ok((await kpi(page, 'sg_out_pluft')).includes('Pa'), 'Luftdruck-Ausgabe gerendert');
  // Dampfdruck-Tafel: 35 Zeilen, Stützpunkt 10 °C markiert
  ok(await page.$$eval('#sg_ddtable tbody tr', trs => trs.length === 35), 'Dampfdruck-Tafel mit 35 Zeilen gerendert');
  ok(await page.$$eval('#sg_ddtable tbody tr.hit', trs => trs.length >= 1 && trs.some(tr => tr.textContent.includes('10'))), 'Tafel markiert Stützpunkt bei 10 °C');
  ok(await page.$('#sgAnlagenWahl') != null, 'Anlagenwahl-Container vorhanden');

  console.log('■ Excel-Referenzfall (h=0, T=0, pv=0 manuell, Hs=0.5)');
  await setVal(page, 'sg_t', 0);
  await setVal(page, 'sg_pv', 0);
  let rr = await page.evaluate(() => window._sgLast);
  ok(Math.abs(rr.Hb - 10.267143317465239) < 1e-9, 'Hb = 10.2671 m (wie Referenz)');
  ok(Math.abs(rr.hmax - 9.767143317465239) < 1e-9, 'hmax = 9.7671 m (wie Referenz)');
  ok(rr.pvManuell === true && rr.pv === 0, 'pv=0 manuell respektiert (kein Auto-Tafelwert)');
  ok((await kpi(page, 'sg_out_pvauto')).includes('überschrieben'), 'Tafelwert-Zeile zeigt «überschrieben»');

  console.log('■ pv-Override zurück auf Automatik');
  await setVal(page, 'sg_pv', '');
  rr = await page.evaluate(() => window._sgLast);
  ok(rr.pvManuell === false && Math.abs(rr.pv - 611.73) < 0.01, 'pv leer → Tafelwert 611.73 Pa (0 °C geklemmt)');

  console.log('■ Negativ-Fall & Warnung');
  await setVal(page, 'sg_npsh', 20);
  rr = await page.evaluate(() => window._sgLast);
  ok(rr.hmax < 0 && rr.warnNeg === true, 'NPSH=20 → hmax negativ');
  ok(await page.$eval('#sg_warn', el => el.style.display !== 'none' && el.textContent.includes('nicht positiv')), 'Warnbox sichtbar');
  ok(await page.$eval('#sg_kpi_hmax_box', el => el.classList.contains('bad')), 'KPI-Box rot markiert');
  await setVal(page, 'sg_npsh', 0);
  ok(await page.$eval('#sg_warn', el => el.style.display === 'none'), 'Warnbox verschwindet wieder');

  console.log('■ AutoSave-Roundtrip (Objekt aktiv → Reload stellt Eingaben wieder her)');
  ok(await page.$eval('#metaObjektDropdown', el => el.value === 'obj_t1'), 'Aktives Objekt im Dropdown vorgewählt');
  await setVal(page, 'sg_h', 500);
  await setVal(page, 'sg_npsh', 3.2);
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' }); // beforeunload → _save(true)
  await page.waitForFunction(() => window._sgLast != null, null, { timeout: 8000 });
  await page.waitForTimeout(900); // Restore + change-Recalc
  const after = await page.evaluate(() => ({
    h: document.getElementById('sg_h').value,
    npsh: document.getElementById('sg_npsh').value,
    last: window._sgLast
  }));
  ok(after.h === '500' && after.npsh === '3.2', 'Werte nach Reload wiederhergestellt (h=500, NPSH=3.2)');
  ok(Math.abs(after.last.pLuft - 95458.80752610574) < 1e-6, 'Recalc nach Restore: pLuft(500) korrekt');
  ok(Math.abs(after.last.npsh - 3.2) < 1e-9, 'Recalc nach Restore: NPSH übernommen');
  await ctx.close();
}

console.log('■ Gating: Monteur ohne saugpumpe-Permission');
{
  const { ctx, page } = await newPage(browser, seed(['role_monteur']));
  await page.goto(BASE + '/sb_saugpumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const body = await page.evaluate(() => document.body.textContent || '');
  ok(body.includes('Kein Zugriff'), 'Monteur sieht «Kein Zugriff»');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail === 0 ? `✅ ${pass}/${pass + fail} Smoke-Checks grün` : `❌ ${fail}/${pass + fail} rot`));
process.exit(fail === 0 ? 0 : 1);
