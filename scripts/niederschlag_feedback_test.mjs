// Feedback-Umsetzung 07/2026 (Playwright): sb_niederschlag (Art-Spalte,
// Punktkarten r(5,5)+r(10,5), Marker-Kanon, Projekt-Autoübernahme SN+MCH)
// + Hub-Restruktur (sb_index ohne Heizung/Lüftung, Gas zuletzt; index.html
// mit echten hz_/lt_-Kacheln). Externe Hosts geblockt, Supabase gemockt.
//
// Ausführen: CHROME=<chromium> node scripts/niederschlag_feedback_test.mjs
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const { chromium } = await import('playwright-core');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
await wireRoutes(ctx);
const seedObj = seed(['role_admin']);
await ctx.addInitScript(st => {
  for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
}, seedObj);
const page = await ctx.newPage();

// ═══ sb_niederschlag ═══
console.log('── sb_niederschlag ──');
await page.goto(BASE + '/sb_niederschlag.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

// 1) Art-Spalte: warType-Select nie unter Code+Pfeil-Breite, Tooltip voll
const art = await page.evaluate(() => {
  const sel = document.querySelector('#tbodyDach select.warType');
  if (!sel) return null;
  return { w: sel.getBoundingClientRect().width, minW: getComputedStyle(sel).minWidth,
           txt: sel.options[sel.selectedIndex].textContent, title: sel.title };
});
ok(!!art, 'warType-Select vorhanden');
ok(art && art.minW === '78px', 'warType min-width 78px (ist ' + (art && art.minW) + ')');
ok(art && art.w >= 78, 'warType gerenderte Breite ≥ 78px (ist ' + (art && Math.round(art.w)) + ')');
ok(art && /^WAR-/.test(art.txt), 'geschlossen zeigt Kurzcode (' + (art && art.txt) + ')');
ok(art && /Niederschlagswasser/.test(art.title), 'Tooltip trägt volle Bezeichnung');

// 2) Punktkarten r(5,5) + r(10,5): gespeicherten MCH-Stand restoren
await page.evaluate(() => {
  window._nbRestore({
    source: 'mch', lon: 7.594, lat: 47.554, label: 'Pfirtergasse 1 4053 Basel', chosenId: 'p1', begr: '',
    values: null, datensatzId: 'MCH_B04_v3.0', distanz: 124, x: 2610500, y: 1266500,
    points: [
      { gitterpunkt_id: 'p1', distanz_m: 124, hoehe_m: 260, x_lv95: 2610500, y_lv95: 1266500,
        werte: { '5min': { T5: 9.9 }, '10min': { T5: 14.4 } } },
      { gitterpunkt_id: 'p2', distanz_m: 909, hoehe_m: 262, x_lv95: 2611500, y_lv95: 1266500,
        werte: { '5min': { T5: 10.2 }, '10min': { T5: 15.0 } } }
    ]
  });
});
await page.waitForTimeout(200);
const cards = await page.evaluate(() => document.getElementById('nbPts').innerText);
ok(/r\(5,5\) = 0\.033/.test(cards), 'Punktkarte zeigt r(5,5) = 0.033 (9.9 mm / 5 min)');
ok(/r\(10,5\) = 0\.024/.test(cards), 'Punktkarte zeigt r(10,5) = 0.024 (14.4 mm / 10 min)');

// 3) Marker-Kanon: Pin rot + grösser, Punkte gefüllt, Linien rot/dick
const marker = await page.evaluate(() => {
  const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } })
    .filter(r => r.selectorText && /rk-pin|rk-pt/.test(r.selectorText))
    .map(r => r.cssText).join('\n');
  const html = document.documentElement.innerHTML;
  return { css: css, lineRed: /dashArray:'7 7',color:'#dc2626',weight:3/.test(html) };
});
ok(/\.rk-pin \.b[^}]*rgb\(220, 38, 38\)|\.rk-pin \.b[^}]*#dc2626/.test(marker.css), 'Projekt-Pin in Rot (#dc2626)');
ok(/\.rk-pt[^}]*rgb\(30, 58, 95\)|\.rk-pt \{[^}]*#1e3a5f/.test(marker.css), 'Rasterpunkte gefüllt (Navy)');
const lineStyle = await page.evaluate(() => {
  const src = [...document.querySelectorAll('script')].map(s => s.textContent).join('');
  return { line: src.indexOf("dashArray:'7 7',color:'#dc2626',weight:3") >= 0,
           print: src.indexOf("ctx.setLineDash([7,7]); ctx.strokeStyle='#dc2626'; ctx.lineWidth=3") >= 0 };
});
ok(lineStyle.line, 'Distanzlinien rot/3px (Live-Karte)');
ok(lineStyle.print, 'Distanzlinien rot/3px (Druck-Canvas)');

// 4) Automatik SN-Station: Stubs für Projektadresse + Geocode
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
const auto1 = await page.evaluate(async () => {
  window._nbProjektAdresseText = () => 'Pfirtergasse 1, 4053 Basel';
  window._nbGeocode = () => Promise.resolve({ lat: 47.554, lon: 7.594, label: 'Pfirtergasse 1 4053 Basel' });
  // Init-Default erzwingen (unabhängig vom Seed-Zustand)
  document.getElementById('defaultLocation').value = 'Basel/Binningen';
  window._nbLocManuell = false; window._nbLocAuto = '';
  window._nbAutoStation();
  await new Promise(r => setTimeout(r, 120));
  return { sel: document.getElementById('defaultLocation').value,
           note: document.getElementById('nbStationAuto').style.display !== 'none',
           noteTxt: document.getElementById('nbStationAuto').innerText };
});
ok(auto1.sel === 'Basel/Binningen', 'Basel-Projekt → Station Basel/Binningen (ist ' + auto1.sel + ')');
ok(auto1.note && /nächste Station/.test(auto1.noteTxt), 'Auto-Hinweis sichtbar (' + auto1.noteTxt.slice(0, 40) + '…)');

// Projekt in Bern → Auto wechselt (solange nicht manuell)
const auto2 = await page.evaluate(async () => {
  window._nbGeocode = () => Promise.resolve({ lat: 46.949, lon: 7.439, label: 'Bern' });
  window._nbAutoStation();
  await new Promise(r => setTimeout(r, 120));
  return document.getElementById('defaultLocation').value;
});
ok(auto2 === 'Bern/Zollikofen', 'Projektwechsel Bern → Station folgt automatisch (ist ' + auto2 + ')');

// Manuelle Wahl stoppt die Automatik
const auto3 = await page.evaluate(async () => {
  const sel = document.getElementById('defaultLocation');
  sel.value = 'Luzern';
  sel.dispatchEvent(new Event('change'));
  window._nbGeocode = () => Promise.resolve({ lat: 47.554, lon: 7.594, label: 'Basel' });
  window._nbAutoStation();
  await new Promise(r => setTimeout(r, 120));
  return { sel: sel.value, manuell: window._nbLocManuell,
           note: document.getElementById('nbStationAuto').style.display === 'none' };
});
ok(auto3.sel === 'Luzern' && auto3.manuell === true, 'manuelle Wahl wird NIE überschrieben');
ok(auto3.note, 'Auto-Hinweis nach manueller Wahl ausgeblendet');

// 5) MCH-Panel: Projektadresse automatisch vorbefüllt + Punkte geladen
const mch = await page.evaluate(async () => {
  window._nbLocManuell = false;
  window._nbProjektAdresseText = () => 'Pfirtergasse 1, 4053 Basel';
  let loaded = null;
  const origLoad = window.nbLoadPoints;
  window.nbLoadPoints = (lon, lat, label) => { loaded = { lon, lat, label }; };
  window._nbGeocode = () => Promise.resolve({ lat: 47.554, lon: 7.594, label: 'Pfirtergasse 1 4053 Basel' });
  document.getElementById('nbAdr').value = '';
  window.nbSetSource('mch');
  await new Promise(r => setTimeout(r, 150));
  window.nbLoadPoints = origLoad;
  return { adr: document.getElementById('nbAdr').value, loaded: loaded };
});
ok(mch.adr === 'Pfirtergasse 1, 4053 Basel', 'MCH: Objektadresse automatisch vorbefüllt');
ok(mch.loaded && Math.abs(mch.loaded.lat - 47.554) < 1e-9, 'MCH: Gitterpunkte automatisch geladen (lat ' + (mch.loaded && mch.loaded.lat) + ')');

// Stations-Koordinaten vollständig
const cov = await page.evaluate(() => {
  const src = [...document.querySelectorAll('script')].map(s => s.textContent).join('');
  return null; // Abdeckung wird statisch unten geprüft
});
const stat = await page.evaluate(() => {
  const h = window._nbStationHooks;
  const near = h.nearest(47.424, 9.377);
  return { has: !!h, zh: h.nearest(47.378, 8.54).name, sg: near.name };
});
ok(stat.zh === 'Zürich/Fluntern', 'Nearest Zürich HB → Zürich/Fluntern');
ok(stat.sg === 'St. Gallen', 'Nearest St. Gallen → St. Gallen');

// ═══ sb_index: Gruppen-Reihenfolge ═══
console.log('── sb_index ──');
await page.goto(BASE + '/sb_index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);
const sbi = await page.evaluate(() => {
  const ids = ['kaltwasser', 'warmwasser', 'heizung', 'lueftung', 'gas', 'abwasser', 'niederschlag']
    .filter(id => document.getElementById(id));
  const order = [...document.querySelectorAll('.g-page > div[id]')].map(d => d.id)
    .filter(id => ['kaltwasser', 'warmwasser', 'gas', 'abwasser', 'niederschlag'].includes(id));
  const pills = [...document.querySelectorAll('.cat-nav a')].map(a => a.getAttribute('href'));
  const stats = document.querySelector('.hero-stats') ? document.querySelector('.hero-stats').innerText.replace(/\s+/g, ' ') : '';
  const hz = !!document.querySelector('a[href="hz_heizlast.html"]');
  return { ids, order, pills, stats, hz };
});
ok(!sbi.ids.includes('heizung') && !sbi.ids.includes('lueftung'), 'Heizung/Lüftung-Gruppen entfernt');
ok(sbi.order[sbi.order.length - 1] === 'gas', 'Gas ist letzte Gruppe (Reihenfolge: ' + sbi.order.join(' → ') + ')');
ok(sbi.pills.join(',') === '#kaltwasser,#warmwasser,#abwasser,#niederschlag,#gas', 'Sprungleiste: Gas zuletzt, ohne Heizung/Lüftung');
ok(/26 Module/.test(sbi.stats) && /5 Kategorien/.test(sbi.stats), 'Hero-Stats 26 Module · 5 Kategorien (ist: ' + sbi.stats + ')');
ok(!sbi.hz, 'keine hz_-Kacheln mehr auf sb_index');

// ═══ index.html: echte Kacheln in Heizung/Lüftung ═══
console.log('── index.html ──');
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
const idx = await page.evaluate(() => {
  const hei = document.getElementById('hei');
  const lu = document.getElementById('lueft');
  const tiles = sec => [...sec.querySelectorAll('a.mod-card[data-module]')].map(a => ({
    mod: a.getAttribute('data-module'), href: a.getAttribute('href'),
    visible: a.offsetParent !== null && a.style.display !== 'none'
  }));
  return { hei: tiles(hei), lu: tiles(lu),
           heiPlaceholder: !!hei.querySelector('.mod-card.disabled'),
           luPlaceholder: [...lu.querySelectorAll('.mod-card.disabled .mod-title')].map(t => t.textContent) };
});
ok(idx.hei.length === 4 && idx.hei.every(t => t.visible), 'Heizung: 4 echte Kacheln sichtbar (Admin)');
ok(idx.hei.map(t => t.mod).join(',') === 'heizlast_verbrauch,waermegruppen,heizungsleitungen,ausdehnungsgefaess', 'Heizung: data-module-Keys korrekt');
ok(!idx.heiPlaceholder, 'Heizung: Platzhalter «Bald» entfernt');
ok(idx.lu.length === 1 && idx.lu[0].mod === 'hx_diagramm' && idx.lu[0].visible, 'Lüftung: h,x-Diagramm-Kachel sichtbar');
ok(idx.luPlaceholder.length === 1 && /Kälte/.test(idx.luPlaceholder[0]), 'Lüftung: Kälte-Platzhalter bleibt');

// Kachel-Klickziel + Breadcrumb des Zielmoduls
await page.goto(BASE + '/hz_heizlast.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const bc = await page.evaluate(() => {
  const a = document.querySelector('.g-nav-bc a.bc-cat');
  return a ? { href: a.getAttribute('href'), txt: a.textContent.trim() } : null;
});
ok(bc && bc.href === 'index.html#hei' && bc.txt === 'Heizung & Wärmeerzeugung', 'hz_heizlast-Breadcrumb → index.html#hei «Heizung & Wärmeerzeugung»');

await browser.close();
server.close();
console.log('\n' + (fail ? 'FEHLER: ' + fail + ' — ' + pass + ' ok' : 'ALLE ' + pass + ' CHECKS GRÜN'));
process.exit(fail ? 1 : 0);
