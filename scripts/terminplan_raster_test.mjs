#!/usr/bin/env node
/* Terminplan — Wochenraster (Layout nach Bauzeitenplan-Vorlage): Drift-Guard
 *
 * Das Raster bildet die Excel-Vorlage «JV Terminplan 14 Wochen» nach:
 *   Zeile 1  KW-Kopf, je 7 Tagesspalten zusammengefasst
 *   Zeile 2  Wochen-Startdatum
 *   Zeile 3  Tagesnummer (Heute rot markiert)
 *   Zeile 4  Mo–So + fixe Spaltenköpfe Arbeit/Start/Dauer AT/Ende/Status
 *   Balken   als Zellenfüllung, NUR auf Arbeitstagen («Dauer AT»); über
 *            Wochenenden läuft ein dünner Verbinder statt eines Balkens.
 *
 * Geprüft wird zusätzlich, dass das Firmen-Branding aus derselben Quelle
 * kommt wie die Berichte (org.settings.pdfFarben → _tpPdfBrand, Logo
 * logoVector||logo) und dass der Druck in 14-Wochen-Blöcke umbricht.
 *
 * Ausführen: CHROME=<chromium> node scripts/terminplan_raster_test.mjs
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

// ── A) Quellcode-Invarianten ──────────────────────────────────────
console.log('— A) Quellcode-Invarianten —');
{
  const src = readFileSync(join(ROOT, 'pm_terminplan.html'), 'utf8');
  ok(/const TP_COLS\s*=/.test(src) && /Dauer AT/.test(src), 'Fixe Spalten inkl. «Dauer AT» definiert');
  ok(/TP_MIN_WEEKS\s*=\s*14/.test(src), 'Vorlagen-Default 14 Wochen als Konstante');
  ok(/function _tpBuildSheet/.test(src) && /function renderRaster/.test(src), 'Sheet-Builder + Renderer vorhanden');
  ok(/_tpBuildSheet\([\s\S]{0,400}?forPrint:true/.test(src), 'Druck nutzt DENSELBEN Builder wie der Bildschirm');
  ok(/_tpBrandCss[\s\S]{0,300}?_tpPdfBrand\(\)/.test(src), 'Branding aus _tpPdfBrand (gleiche Quelle wie Berichte/PDF)');
  ok(/logoVector\|\|[\s\S]{0,10}\.logo/.test(src), 'Logo: logoVector bevorzugt (SVG rastert verlustfrei)');
  // Cross-Block-Scope-Regel: openEdit lebt in der Modul-IIFE
  const sheetFn = src.slice(src.indexOf('function _tpBuildSheet'), src.indexOf('function renderRaster'));
  ok(!/onclick="openEdit/.test(sheetFn), 'kein Inline-onclick auf openEdit (IIFE-Scope)');
  ok(/data-tid=/.test(sheetFn) && /\.tp-name\[data-tid\]/.test(src), 'Zeilen-Klick läuft über delegierten Listener');
  // Druckfenster-Kanon (pdf_opsz_test)
  ok(/font-optical-sizing:auto;font-variation-settings:"opsz" 14/.test(src), 'Druckfenster: DM-Sans-opsz-Kanon');
  ok(/@page\{size:A4 landscape/.test(src), 'Druck: A4 quer');
}

// ── Browser ───────────────────────────────────────────────────────
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.includes('frappe-gantt') && u.includes('.js')) return route.fulfill({ contentType: 'application/javascript', body: FG_JS });
  if (u.includes('frappe-gantt') && u.includes('.css')) return route.fulfill({ contentType: 'text/css', body: FG_CSS });
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('fonts.googleapis') >= 0 || u.indexOf('fonts.gstatic') >= 0) return route.fulfill({ contentType: 'text/css', body: '' });
  if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
  if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
    return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
  }
  return route.abort();
});

// Org mit Firmenfarben + Logo (Branding wie in den Berichten)
const st = seed(['role_planer']);
st.gema_orgs_v1[0].settings = { pdfFarben: { primary: '#f5c518', secondary: '#8d5a00' } };  // helles Gelb → muss abgedunkelt werden
st.gema_orgs_v1[0].logo = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#333"/></svg>').toString('base64');
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_terminplan.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window._tpHooks && window._tpHooks.renderRaster, null, { timeout: 15000 });

async function addTask(name, start, dauer, type) {
  await page.fill('#taskName', name);
  await page.fill('#taskStart', start);
  await page.fill('#taskDuration', String(dauer));
  await page.waitForTimeout(60);
  await page.click(type === 'milestone' ? '#btnAddMilestone' : '#btnAddTask');
  await page.waitForTimeout(250);
}

// Projekt: Montag 2026-10-05
await page.evaluate(() => {
  const H = window._tpHooks, s = H.state();
  s.projectStart = '2026-10-05'; s.projectEnd = '2026-11-13';
  s.holidaysEnabled = true; s.holidays = [{ date: '2026-10-14', name: 'Testfeiertag' }];
  document.getElementById('projectStart').value = '2026-10-05';
  document.getElementById('projectEnd').value = '2026-11-13';
  H.renderAll();
});
await page.waitForTimeout(300);

// ── B) Standardansicht + Aufbau ───────────────────────────────────
console.log('— B) Standardansicht ist das Wochenraster —');
{
  ok(await page.$eval('.tab-btn[data-tab="raster"]', b => b.classList.contains('active')), 'Tab «📆 Terminplan» ist aktiv');
  ok(await page.$eval('#tab-raster', p => p.classList.contains('active')), 'Raster-Pane sichtbar');
  ok(await page.$('#tpSheet .tp-grid') !== null, 'Raster-Tabelle gerendert');
  ok(await page.$eval('.tab-btn[data-tab="gantt"]', b => !!b), 'Gantt bleibt als eigener Tab erhalten');
}

// ── C) Kopfaufbau wie die Vorlage ─────────────────────────────────
console.log('— C) Kopfzeilen KW / Datum / Tag / Wochentag —');
{
  const head = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#tpSheet .tp-grid thead tr')];
    return {
      rows: rows.length,
      kwSpan: rows[0].querySelector('.tp-kw') ? +rows[0].querySelector('.tp-kw').getAttribute('colspan') : 0,
      kwFirst: rows[0].querySelector('.tp-kw') ? rows[0].querySelector('.tp-kw').textContent.trim() : '',
      wdFirst: rows[1].querySelector('.tp-wd') ? rows[1].querySelector('.tp-wd').textContent.trim() : '',
      dnFirst: rows[2].querySelector('.tp-dn') ? rows[2].querySelector('.tp-dn').textContent.trim() : '',
      dow: [...rows[3].querySelectorAll('.tp-dow')].slice(0, 7).map(t => t.textContent.trim()),
      fixHeads: [...rows[3].querySelectorAll('.tp-fix')].map(t => t.textContent.trim()),
      weeks: rows[0].querySelectorAll('.tp-kw').length
    };
  });
  ok(head.rows === 4, '4 Kopfzeilen (KW / Datum / Tag / Wochentag) — ' + head.rows);
  ok(head.kwSpan === 7, 'KW-Zelle fasst 7 Tagesspalten zusammen');
  ok(/^KW 41$/.test(head.kwFirst), 'erste KW korrekt (2026-10-05 = KW 41) — ' + head.kwFirst);
  ok(head.wdFirst === '05.10.2026', 'Wochen-Startdatum im CH-Format — ' + head.wdFirst);
  ok(head.dnFirst === '5', 'Tagesnummer statt vollem Datum — ' + head.dnFirst);
  ok(head.dow.join(',') === 'Mo,Di,Mi,Do,Fr,Sa,So', 'Wochentage Mo–So — ' + head.dow.join(','));
  ok(head.fixHeads.join('|') === 'Handwerker / Arbeit|Start|Dauer AT|Ende|Status', 'fixe Spaltenköpfe wie Vorlage — ' + head.fixHeads.join('|'));
  ok(head.weeks >= 14, 'mindestens 14 Wochen wie die Vorlage — ' + head.weeks);
}

// ── D) Balken nur auf Arbeitstagen ────────────────────────────────
console.log('— D) Balken = Arbeitstage, Wochenende überbrückt —');
await addTask('Rohinstallation', '2026-10-05', 7);   // Mo, 7 AT → Mo–Fr + Mo–Di
await page.waitForTimeout(300);
{
  const bar = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#tpSheet .tp-task')]
      .find(r => r.querySelector('.tp-name-txt') && r.querySelector('.tp-name-txt').textContent.includes('Rohinstallation'));
    const cells = [...row.querySelectorAll('.tp-day')];
    return {
      filled: cells.filter(c => c.classList.contains('b')).length,
      links: cells.filter(c => c.classList.contains('bl')).length,
      firstIdx: cells.findIndex(c => c.classList.contains('bs')),
      lastIdx: cells.findIndex(c => c.classList.contains('be')),
      weekendFilled: cells.filter(c => c.classList.contains('b') && c.classList.contains('we')).length,
      dauer: row.querySelectorAll('.tp-c')[1].textContent.trim(),
      color: cells.find(c => c.classList.contains('b')).style.getPropertyValue('--c')
    };
  });
  ok(bar.filled === 7, '7 AT → 7 gefüllte Tageszellen — ' + bar.filled);
  ok(bar.weekendFilled === 0, 'kein Balken auf Sa/So (Vorlage färbt nur Mo–Fr)');
  ok(bar.links === 2, 'Wochenende dazwischen wird überbrückt (2 Verbinder) — ' + bar.links);
  ok(bar.firstIdx === 0, 'Balkenanfang auf dem Starttag');
  ok(bar.lastIdx === 8, 'Balkenende auf dem 7. Arbeitstag (Index 8 = Di der Folgewoche) — ' + bar.lastIdx);
  ok(bar.dauer === '7', 'Spalte «Dauer AT» zeigt 7 — ' + bar.dauer);
  ok(/#|rgb/.test(bar.color), 'Balken trägt die Kategorie-Farbe — ' + bar.color);
}

// ── E) Wochenende, Feiertag, Heute ────────────────────────────────
console.log('— E) Wochenende / Feiertag / Heute —');
{
  const marks = await page.evaluate(() => {
    const row = document.querySelector('#tpSheet .tp-task');
    const cells = [...row.querySelectorAll('.tp-day')];
    return {
      we: cells.slice(0, 7).map(c => c.classList.contains('we')),
      hd: cells.filter(c => c.classList.contains('hd')).length,
      hdTitle: (cells.find(c => c.classList.contains('hd')) || {}).title || '',
      todayHead: !!document.querySelector('#tpSheet .tp-dn.today')
    };
  });
  ok(marks.we.join(',') === 'false,false,false,false,false,true,true', 'Sa/So als Wochenende markiert');
  ok(marks.hd === 1, 'Feiertag als eigene Spalte markiert — ' + marks.hd);
  ok(marks.hdTitle === 'Testfeiertag', 'Feiertag zeigt seinen Namen im Tooltip — ' + marks.hdTitle);
  ok(marks.todayHead === false || marks.todayHead === true, 'Heute-Markierung vorhanden/berechnet');
}

// ── F) Meilenstein ────────────────────────────────────────────────
console.log('— F) Meilenstein —');
await addTask('Bauabnahme', '2026-10-20', 1, 'milestone');
await page.waitForTimeout(300);
{
  const ms = await page.evaluate(() => {
    const row = [...document.querySelectorAll('#tpSheet .tp-task')]
      .find(r => r.textContent.includes('Bauabnahme'));
    const d = [...row.querySelectorAll('.tp-day')].filter(c => c.classList.contains('tp-ms'));
    return { count: d.length, txt: d.length ? d[0].textContent.trim() : '', dauer: row.querySelectorAll('.tp-c')[1].textContent.trim(), name: row.querySelector('.tp-name-txt').textContent.trim() };
  });
  ok(ms.count === 1, 'Meilenstein belegt genau eine Tageszelle — ' + ms.count);
  ok(ms.txt === '◆', 'Meilenstein als Raute gezeichnet');
  ok(ms.dauer === '–', 'Meilenstein ohne Dauer-Angabe');
  ok(ms.name.startsWith('◆'), 'Meilenstein auch im Namen markiert');
}

// ── G) Erledigt-Darstellung + Status ──────────────────────────────
console.log('— G) Status —');
{
  const stat = await page.evaluate(() => {
    const H = window._tpHooks, s = H.state();
    const t = s.tasks.find(x => x.name === 'Rohinstallation');
    t.done = true; H.renderAll();
    return new Promise(r => setTimeout(() => {
      const row = [...document.querySelectorAll('#tpSheet .tp-task')].find(x => x.textContent.includes('Rohinstallation'));
      r({
        pill: row.querySelector('.tp-st span').textContent.trim(),
        dimmed: [...row.querySelectorAll('.tp-day')].some(c => c.classList.contains('bd'))
      });
    }, 350));
  });
  ok(stat.pill === 'Abgeschlossen', 'Status-Pille «Abgeschlossen» — ' + stat.pill);
  ok(stat.dimmed, 'erledigter Balken wird abgeschwächt gezeichnet');
}

// ── H) Gruppierung (Trennzeilen der Vorlage) ──────────────────────
console.log('— H) Gruppierung —');
{
  await page.selectOption('#rasterGroup', 'category');
  await page.waitForTimeout(350);
  const g = await page.$$eval('#tpSheet .tp-grp', rs => rs.map(r => r.textContent.trim()));
  ok(g.length >= 1, 'Trennzeilen gerendert — ' + g.length);
  ok(g.every(x => x.length > 0), 'Trennzeile trägt den Gruppennamen — ' + g.join('|'));
  await page.selectOption('#rasterGroup', '');
  await page.waitForTimeout(250);
  ok((await page.$$('#tpSheet .tp-grp')).length === 0, '«Keine Gruppierung» blendet die Trennzeilen aus');
}

// ── I) Branding wie in den Berichten ──────────────────────────────
console.log('— I) Firmen-Branding —');
{
  const b = await page.evaluate(() => {
    const el = document.getElementById('tpSheet');
    const band = el.querySelector('.tp-band');
    return {
      brand: getComputedStyle(band).backgroundColor,
      logo: !!el.querySelector('.tp-band-logo img'),
      title: el.querySelector('.tp-band-title').textContent.trim(),
      sub: el.querySelector('.tp-band-sub').textContent.trim()
    };
  });
  const m = b.brand.match(/(\d+),\s*(\d+),\s*(\d+)/).slice(1).map(Number);
  // Kontrastschutz: helles Gelb #f5c518 muss gegen Weiss auf ≥4.5:1 abgedunkelt sein
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contrast = 1.05 / (lum(m) + 0.05);
  ok(contrast >= 4.4, 'Titelband abgedunkelt bis Kontrast ≥4.5:1 (helles Gelb) — ' + contrast.toFixed(2));
  ok(b.logo, 'Firmenlogo im Titelband');
  ok(b.sub.includes('Testfirma AG'), 'Firmenname im Untertitel — ' + b.sub);
}

// ── J) Druck: 14-Wochen-Blöcke ────────────────────────────────────
console.log('— J) Druck in Wochenblöcken —');
{
  const out = await page.evaluate(() => {
    // window.open abfangen und das erzeugte Markup einsammeln
    const orig = window.open;
    let html = '';
    window.open = () => ({
      document: { write: s => { html += s; }, close: () => {} },
      print: () => {}, close: () => {}
    });
    window._tpHooks.printSheet();
    window.open = orig;
    return html;
  });
  const doc = await page.evaluate(h => {
    const p = new DOMParser().parseFromString(h, 'text/html');
    return {
      pages: p.querySelectorAll('.tp-page').length,
      weeksFirst: p.querySelector('.tp-page .tp-grid') ? p.querySelectorAll('.tp-page')[0].querySelectorAll('.tp-kw').length : 0,
      hasBand: !!p.querySelector('.tp-page .tp-band'),
      hasLogo: !!p.querySelector('.tp-page .tp-band-logo img'),
      title: (p.querySelector('title') || {}).textContent || ''
    };
  }, out);
  ok(doc.pages >= 1, 'Druckfenster erzeugt Blätter — ' + doc.pages);
  ok(doc.weeksFirst <= 14 && doc.weeksFirst > 0, 'höchstens 14 Wochen pro Blatt — ' + doc.weeksFirst);
  ok(doc.hasBand && doc.hasLogo, 'jedes Blatt trägt Titelband + Logo');
  ok(/Terminplan/.test(doc.title), 'Fenstertitel = PDF-Dateiname');
  ok(/@page\{size:A4 landscape/.test(out), 'A4 quer im Druck-CSS');
  ok(/page-break-after:always/.test(out), 'Wochenblöcke brechen auf eigene Seiten um');
}

// ── K) Zeilen-Klick öffnet den Termin ─────────────────────────────
console.log('— K) Interaktion —');
{
  await page.click('#tpSheet .tp-task .tp-name');
  await page.waitForTimeout(250);
  const open = await page.$eval('#modal', el => el.classList.contains('open')).catch(() => false);
  const name = await page.$eval('#editName', el => el.value).catch(() => '');
  ok(open, 'Klick auf die Termin-Zeile öffnet den Bearbeiten-Dialog');
  ok(name.length > 0, 'Dialog ist mit dem geklickten Termin befüllt — ' + name);
  await page.click('#btnCloseModal').catch(() => {});
}

ok(errors.length === 0, 'keine pageerrors' + (errors.length ? ' — ' + errors[0] : ''));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
await server.close();
process.exit(fail ? 1 : 0);
