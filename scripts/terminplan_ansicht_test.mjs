#!/usr/bin/env node
/* Terminplan (pm_terminplan) — Ansicht, Balkenlänge, Drag: Drift-Guard
 *
 * Deckt die vier Feedback-Punkte 27.07.2026 ab:
 *  1) Balkenlänge: 1 Tag Dauer = 1 Spalte (frappe hängt selbst 24 h an —
 *     der frühere Zuschlag in taskToFrappe zeichnete jede Bar eine Spalte
 *     zu lang), Bars sitzen exakt auf der Tagesspalte (kein 14-px-Versatz
 *     durch options.padding, das in frappe VERTIKAL ist).
 *  2) Scroll-Position bleibt beim Bearbeiten/Filtern erhalten und springt
 *     nur bei bewusster Änderung von Fenster-Start/Spanne/Zoom.
 *  3) Drag & Drop verschiebt, ohne die Dauer zu verändern (auch über
 *     Wochenenden hinweg).
 *  4) Zeichenfläche beginnt am Projektstart statt einen Monat davor;
 *     Toolbar-Knopf «⌖ Projektstart» setzt die Ansicht dorthin.
 *
 * frappe-gantt kommt aus scripts/fixtures/ (CDN ist im Test geblockt).
 * Ausführen: CHROME=<chromium> node scripts/terminplan_ansicht_test.mjs
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed } from './rolematrix_harness.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FG_JS = readFileSync(join(ROOT, 'scripts/fixtures/frappe-gantt-0.6.1.min.js'), 'utf8');
const FG_CSS = readFileSync(join(ROOT, 'scripts/fixtures/frappe-gantt-0.6.1.min.css'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// ── A) Statische Verdrahtung ──────────────────────────────────────
console.log('— A) Quellcode-Invarianten —');
{
  const src = readFileSync(join(ROOT, 'pm_terminplan.html'), 'utf8');
  const t2f = src.slice(src.indexOf('function taskToFrappe'), src.indexOf('function taskToFrappe') + 600);
  ok(!/setDate\(ed\.getDate\(\)\s*\+\s*1\)/.test(t2f), 'taskToFrappe: kein eigenes +1 auf das Enddatum');
  const iOdc = src.indexOf('on_date_change:(task,start,end)=>{');
  const odc = src.slice(iOdc, iOdc + 900);
  ok(!/getDate\(\)\s*-\s*1/.test(odc), 'on_date_change: kein Tagesabzug (frappe meldet bereits 23:59:59)');
  ok(/verschoben/.test(odc) && /countWorkingDays/.test(odc), 'on_date_change: Verschieben erhält die Arbeitstag-Dauer');
  const snapFn = src.slice(src.indexOf('function snapBarsToGrid'), src.indexOf('function snapBarsToGrid') + 900);
  ok(!/pad\s*\+\s*snappedStart|\(x\s*-\s*pad\)/.test(snapFn), 'snapBarsToGrid: kein horizontaler padding-Versatz mehr');
  ok(/setup_gantt_dates\s*=\s*function/.test(src), 'setup_gantt_dates gepatcht (Zeichenfläche am Projektstart)');
  ok(/TP_PAD_VOR\s*=\s*\d+/.test(src), 'Padding der Zeichenfläche als Konstante');
  ok(/goToProjektStart/.test(src) && /⌖ Projektstart/.test(src), 'Toolbar-Knopf «⌖ Projektstart» vorhanden');
  ok(/_tpCaptureScroll/.test(src) && /applyViewport\(true\)/.test(src), 'Scroll-Anker + bewusster Sprung (force)');
  ok(/window\._tpHooks/.test(src), 'Test-Hooks exponiert (Modul ist async-IIFE)');
}

// ── Browser ───────────────────────────────────────────────────────
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.includes('frappe-gantt') && u.includes('.js')) return route.fulfill({ contentType: 'application/javascript', body: FG_JS });
  if (u.includes('frappe-gantt') && u.includes('.css')) return route.fulfill({ contentType: 'text/css', body: FG_CSS });
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
  if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
    return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
  }
  return route.abort();
});
await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed(['role_planer']));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_terminplan.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof Gantt !== 'undefined' && window._tpHooks && window._tpHooks.gantt !== undefined, null, { timeout: 15000 });

async function addTask(name, start, dauer) {
  await page.fill('#taskName', name);
  await page.fill('#taskStart', start);
  await page.fill('#taskDuration', String(dauer));
  await page.waitForTimeout(60);
  await page.click('#btnAddTask');
  await page.waitForTimeout(250);
}
const snap = () => page.evaluate(() => {
  const H = window._tpHooks, g = H.gantt(), st = H.state();
  return {
    gs: g ? [g.gantt_start.getFullYear(), g.gantt_start.getMonth() + 1, g.gantt_start.getDate()].join('-') : null,
    cw: g ? g.options.column_width : null,
    sl: H.scroller() ? H.scroller().scrollLeft : null,
    bars: [...document.querySelectorAll('#ganttEl .bar-wrapper')].map(w => ({
      id: w.getAttribute('data-id'),
      x: +w.querySelector('.bar').getAttribute('x'),
      w: +w.querySelector('.bar').getAttribute('width')
    })),
    tasks: st.tasks.map(t => ({ id: t.id, name: t.name, start: t.start, end: t.end, type: t.type }))
  };
});
const spalten = (s, id) => s.bars.find(b => b.id === id).w / s.cw;
const at = (s, e) => page.evaluate(([a, b]) => {
  // Arbeitstage über den Modul-Rechner (Wochenenden/Feiertage)
  const el = document.getElementById('editStart'), el2 = document.getElementById('editEnd');
  const os = el.value, oe = el2.value;
  el.value = a; el2.value = b; window.calcEditDuration();
  const d = +document.getElementById('editDuration').value;
  el.value = os; el2.value = oe;
  return d;
}, [s, e]);

// Projekt Oktober 2026
await page.fill('#projectStart', '2026-10-01');
await page.waitForTimeout(250);
await addTask('Baumeister', '2026-10-05', 5);     // Mo–Fr
await addTask('Eintagsfliege', '2026-10-12', 1);  // 1 Tag
await addTask('Spaeter', '2026-11-02', 15);
await page.evaluate(() => { document.getElementById('windowStart').value = '2026-10-01'; document.getElementById('windowSpan').value = '30'; window._tpHooks.gantt() && renderGantt(); });
await page.waitForTimeout(500);

console.log('— B) Zeichenfläche beginnt am Projektstart —');
{
  const s = await snap();
  ok(s.gs === '2026-9-29', 'Canvas startet 2 Tage vor Projektstart statt im Vormonat (' + s.gs + ')');
  const septemberSpalten = await page.evaluate(() => {
    const g = window._tpHooks.gantt();
    return g.dates.filter(d => d.getMonth() === 8).length;   // September
  });
  ok(septemberSpalten <= 2, 'höchstens 2 September-Spalten sichtbar (war: der ganze Monat) — ' + septemberSpalten);
}

console.log('— C) Balkenlänge = erfasste Dauer —');
{
  const s = await snap();
  const b5 = s.tasks.find(t => t.name === 'Baumeister'), b1 = s.tasks.find(t => t.name === 'Eintagsfliege');
  ok(b1.start === b1.end, '1-Tages-Termin: start = end im Datensatz');
  ok(Math.abs(spalten(s, b1.id) - 1) < 0.01, '1 Tag Dauer → 1 Spalte (war 2) — ' + spalten(s, b1.id).toFixed(2));
  ok(Math.abs(spalten(s, b5.id) - 5) < 0.01, '5 Arbeitstage → 5 Spalten (war 6) — ' + spalten(s, b5.id).toFixed(2));
  const versatz = s.bars.map(b => Math.abs(b.x / s.cw - Math.round(b.x / s.cw)));
  ok(Math.max(...versatz) < 0.02, 'Bars sitzen exakt auf der Tagesspalte (kein 14-px-Versatz)');
  // Raster/Wochenend-Schattierung müssen auf denselben x-Werten sitzen
  const raster = await page.evaluate(() => {
    const svg = document.querySelector('#ganttEl svg');
    const cw = window._tpHooks.gantt().options.column_width;
    const lines = [...svg.querySelectorAll('line.week-border, line.day-line')].map(l => +l.getAttribute('x1'));
    const shade = [...svg.querySelectorAll('rect')].map(r => r.getAttribute('class') || '')
      .map((c, i) => c).filter(c => /weekend|holiday/.test(c)).length;
    return { max: lines.length ? Math.max(...lines.map(x => Math.abs(x / cw - Math.round(x / cw)))) : 1, lines: lines.length, shade };
  });
  ok(raster.lines > 0 && raster.max < 0.02, 'Tagesraster liegt auf denselben Spalten wie die Bars');
}

console.log('— D) Bearbeiten: Dauer 1 bleibt 1 (auch beim zweiten Mal) —');
{
  const id = (await snap()).tasks.find(t => t.name === 'Baumeister').id;
  for (const runde of [1, 2]) {
    await page.evaluate(i => window._tpHooks.openEdit(i), id);
    await page.waitForTimeout(120);
    await page.fill('#editDuration', '1');
    await page.waitForTimeout(80);
    await page.evaluate(() => window._tpHooks.updateTask());
    await page.waitForTimeout(400);
    const s = await snap();
    const t = s.tasks.find(x => x.id === id);
    ok(t.start === t.end && Math.abs(spalten(s, id) - 1) < 0.01,
      'Durchgang ' + runde + ': Dauer 1 → 1 Spalte (' + t.start + '→' + t.end + ')');
  }
}

console.log('— E) Ansicht bleibt beim Bearbeiten stehen —');
{
  await page.evaluate(() => { window._tpHooks.scroller().scrollLeft = 900; });
  await page.waitForTimeout(150);
  const vorher = (await snap()).sl;
  const id = (await snap()).tasks.find(t => t.name === 'Spaeter').id;
  await page.evaluate(i => window._tpHooks.openEdit(i), id);
  await page.waitForTimeout(120);
  await page.fill('#editName', 'Spaeter (geändert)');
  await page.evaluate(() => window._tpHooks.updateTask());
  await page.waitForTimeout(450);
  const nachher = (await snap()).sl;
  ok(Math.abs(nachher - vorher) < 1, 'Scroll-Position nach dem Bearbeiten unverändert (' + vorher + ' → ' + nachher + ')');
  // Filterwechsel darf ebenfalls nicht springen
  await page.selectOption('#filterCategory', { index: 0 });
  await page.waitForTimeout(400);
  ok(Math.abs((await snap()).sl - vorher) < 1, 'Filterwechsel scrollt die Ansicht nicht zurück');
  // Fenster-Start ändern = bewusster Sprung
  await page.evaluate(() => { const el = document.getElementById('windowStart'); el.value = '2026-11-16'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(450);
  const s = await snap();
  const maxScroll = await page.evaluate(() => { const sc = window._tpHooks.scroller(); return sc.scrollWidth - sc.clientWidth; });
  const soll = Math.min(maxScroll, Math.round((new Date(2026, 10, 16) - new Date(2026, 8, 29)) / 86400000) * s.cw);
  ok(Math.abs(s.sl - soll) < 2 && s.sl > vorher, 'Fenster-Start geändert → Ansicht springt bewusst dorthin (' + Math.round(s.sl) + ')');
}

console.log('— F) Drag & Drop: Dauer bleibt gleich —');
{
  let s = await snap();
  const t0 = s.tasks.find(x => x.name.indexOf('Spaeter') === 0);
  const dauerVorher = await at(t0.start, t0.end);
  await page.evaluate(id => {
    const bar = document.querySelector(`#ganttEl .bar-wrapper[data-id="${id}"] .bar`);
    window._tpHooks.scroller().scrollLeft = Math.max(0, +bar.getAttribute('x') - 200);
  }, t0.id);
  await page.waitForTimeout(250);
  const slVorDrag = (await snap()).sl;
  const geo = await page.evaluate(id => {
    const r = document.querySelector(`#ganttEl .bar-wrapper[data-id="${id}"] .bar`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, cw: window._tpHooks.gantt().options.column_width };
  }, t0.id);
  await page.mouse.move(geo.x, geo.y);
  await page.mouse.down();
  await page.mouse.move(geo.x + geo.cw * 3, geo.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  s = await snap();
  const t1 = s.tasks.find(x => x.id === t0.id);
  ok(t1.start !== t0.start, 'Termin wurde verschoben (' + t0.start + ' → ' + t1.start + ')');
  const dauerNachher = await at(t1.start, t1.end);
  ok(dauerNachher === dauerVorher, 'Dauer bleibt exakt gleich: ' + dauerVorher + ' → ' + dauerNachher + ' Arbeitstage');
  ok(Math.abs((await snap()).sl - slVorDrag) < 2, 'Ansicht springt beim Verschieben nicht');
}

console.log('— G) Verschieben auf ein Wochenende —');
{
  const s0 = await snap();
  const t0 = s0.tasks.find(x => x.name === 'Eintagsfliege');
  const dauerVorher = await at(t0.start, t0.end);
  await page.evaluate(id => {
    const bar = document.querySelector(`#ganttEl .bar-wrapper[data-id="${id}"] .bar`);
    window._tpHooks.scroller().scrollLeft = Math.max(0, +bar.getAttribute('x') - 200);
  }, t0.id);
  await page.waitForTimeout(250);
  const geo = await page.evaluate(id => {
    const r = document.querySelector(`#ganttEl .bar-wrapper[data-id="${id}"] .bar`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, cw: window._tpHooks.gantt().options.column_width };
  }, t0.id);
  await page.mouse.move(geo.x, geo.y);
  await page.mouse.down();
  await page.mouse.move(geo.x + geo.cw * 4, geo.y, { steps: 10 });   // Mo → Fr/Sa
  await page.mouse.up();
  await page.waitForTimeout(600);
  const t1 = (await snap()).tasks.find(x => x.id === t0.id);
  const wt = new Date(t1.start + 'T00:00').getDay();
  ok(wt !== 0 && wt !== 6, 'Start landet nie auf dem Wochenende (' + t1.start + ')');
  ok(await at(t1.start, t1.end) === dauerVorher, 'Dauer auch beim Wochenend-Snap unverändert (' + dauerVorher + ' AT)');
}

console.log('— H) Meilenstein + Projektstart-Knopf —');
{
  await page.fill('#taskName', 'Bauabnahme');
  await page.fill('#taskStart', '2026-12-04');
  await page.click('#btnAddMilestone');
  await page.waitForTimeout(400);
  const s = await snap();
  const ms = s.tasks.find(t => t.name === 'Bauabnahme');
  ok(ms && ms.start === ms.end && ms.type === 'milestone', 'Meilenstein: start = end');
  ok(Math.abs(spalten(s, ms.id) - 1) < 0.01, 'Meilenstein bleibt 1 Spalte');

  await page.evaluate(() => { window._tpHooks.scroller().scrollLeft = 1200; });
  await page.waitForTimeout(150);
  await page.click('.gtb-btn');
  await page.waitForTimeout(400);
  const s2 = await snap();
  ok(await page.$eval('#windowStart', el => el.value) === '2026-10-01', '⌖ Projektstart setzt den Fenster-Start auf den Projektstart');
  const soll = Math.round((new Date(2026, 9, 1) - new Date(2026, 8, 29)) / 86400000) * s2.cw;
  ok(Math.abs(s2.sl - soll) < 2, '⌖ Projektstart scrollt die Ansicht dorthin (' + Math.round(s2.sl) + ' ≈ ' + Math.round(soll) + ')');
}

ok(errors.length === 0, 'keine pageerrors' + (errors.length ? ' — ' + errors[0] : ''));
console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
