// GEMA Native — iPhone-Ansicht der 6 vorbereiteten Screens (gema_native_mobil.js).
//  Prüft pro Modul: Native-Overlay erscheint auf Phone-Viewport (390×844) mit ECHTEN
//  Daten aus den geseedeten Pools, Aktionen/Filter funktionieren, Umschalter
//  «Klassische Ansicht» + 📱-Rückkehr-Pill, Desktop (1280×800) bleibt klassisch.
//  Module: if_werkzeug, if_fahrzeug, pm_stunden, pm_einsatzplan, sys_workspace,
//  sb_druckdispositiv (DOM-Proxy auf die echte Berechnung).
//
// Aufruf:  CHROME=<chromium> node scripts/native_screens_smoke_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8895;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const MFK_BALD = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const ORG = { id: 'org_t', name: 'Muster Haustechnik AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'Robin Muster', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

const SEED = {
  gema_orgs_v1: JSON.stringify([ORG]),
  gema_users_v1: JSON.stringify(USERS),
  gema_session_v1: JSON.stringify(SESSION),
  gema_werkzeug: JSON.stringify([
    { id: 'w1', orgId: 'org_t', name: 'Bohrschrauber Hilti TE 6', internKennung: 'W-0421', cat: 'maschine', bought: '2024-01-01' },
    { id: 'w2', orgId: 'org_t', name: 'Kernbohrgerät Weka DK32', internKennung: 'W-0113', cat: 'maschine', bought: '2024-01-01', ausgeliehenAn: { userId: 'u1', name: 'M. Keller' } },
    { id: 'w3', orgId: 'org_t', name: 'Leiter 3-teilig Alu', internKennung: 'W-0088', cat: 'leiter', bought: '2023-01-01', hasLeiter: true, leiterInterval: 12, lastLeiter: '2025-01-10' }
  ]),
  gema_vehicles: JSON.stringify([
    { id: 'v1', orgId: 'org_t', model: 'VW Crafter', plate: 'BS 12345', nr: 'BS-4', driver: 'M. Keller', km: 84200, status: 'aktiv' },
    { id: 'v2', orgId: 'org_t', model: 'Renault Master', plate: 'BS 45677', nr: 'BS-7', km: 122400, status: 'aktiv', mfk: MFK_BALD }
  ]),
  gema_std_pool_v1: JSON.stringify([
    { id: 'std1', orgId: 'org_t', userId: 'u1', userName: 'Robin Muster', datum: TODAY, status: 'offen', spesen: {},
      eintraege: [
        { id: 'e1', von: '07:00', bis: '11:30', pauseMin: 15, objektName: 'Lindenpark', taetigkeit: 'Montage' },
        { id: 'e2', von: '13:00', bis: '17:00', pauseMin: 0, objektName: 'Büro', taetigkeit: 'Rapporte' }
      ] }
  ]),
  gema_einsatz_pool_v1: JSON.stringify([
    { id: 'ev1', orgId: 'org_t', typ: 'frei', titel: 'Montage Sanitär · Lindenpark', objektName: 'Lindenpark',
      monteurUserId: 'u1', monteurName: 'Robin Muster', datum: TODAY, dauerTage: 1, zeitVon: '07:30', zeitBis: '11:00', erstelltVon: { userId: 'u1', name: 'Robin Muster' } }
  ]),
  gema_regie_pool_v1: JSON.stringify([
    { id: 'r1', orgId: 'org_t', status: 'eingereicht', nr: 'R-001', objektName: 'Lindenpark' }
  ]),
  gema_workspace_v1: JSON.stringify([
    { id: 'b1', name: 'Wohnüberbauung Lindenpark', type: 'bauprojekt', shared: false, members: [], activity: [], beteiligte: [], notes: [],
      modules: [{ mod: 'sb_druckdispositiv', status: '' }], createdAt: '2026-07-01' }
  ]),
  gema_recent_v1: JSON.stringify([{ key: 'sb_druckdispositiv', ts: Date.now() }]),
  gema_coachmarks_done_sys_workspace_v2: '1'
};

// PostgREST-Mock: bindCollection-Pulls liefern die geseedeten Pools als Rows —
// sonst würde der (leere) Cloud-Pull die localStorage-Seeds wieder wegwischen.
const POOL_ROWS = {
  'tool:': JSON.parse(SEED.gema_werkzeug),
  'vehicle:': JSON.parse(SEED.gema_vehicles),
  'std:': JSON.parse(SEED.gema_std_pool_v1),
  'einsatz:': JSON.parse(SEED.gema_einsatz_pool_v1),
  'regie:': JSON.parse(SEED.gema_regie_pool_v1)
};
function sbMock(u, method) {
  if (method !== 'GET') return '[]';
  const m = /data_key=like\.([^&]+)/.exec(u);
  if (m) {
    const prefix = decodeURIComponent(m[1]).replace(/\*$/, '');
    const arr = POOL_ROWS[prefix];
    if (arr) return JSON.stringify(arr.map(r => ({ data_key: prefix + r.id, payload: { data: r, _lm: 1 } })));
  }
  return '[]';
}
function routeAll(c) {
  return c.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0)
      return route.fulfill({ contentType: 'application/json', body: sbMock(u, route.request().method()) });
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
}
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await routeAll(ctx);
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, SEED);

async function openPage(path) {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  return { page, errs };
}
const natVisible = p => p.evaluate(() => { const r = document.querySelector('.gn--page'); return !!r && r.style.display !== 'none'; });

/* ════════ 1 · Werkzeug ════════ */
console.log('— Werkzeug (Liste/Badges/Filter/Toggle) —');
{
  const { page, errs } = await openPage('/if_werkzeug.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar (Phone)');
  const w = await page.evaluate(() => ({
    sub: document.querySelector('.gn--page .gn-large-title p').textContent,
    rows: document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length,
    badges: Array.from(document.querySelectorAll('.gn--page .gn-badge')).map(b => b.textContent)
  }));
  ok(w.sub.indexOf('3 Geräte') >= 0 && w.sub.indexOf('1 Prüfungen fällig') >= 0, 'Zähler echt («' + w.sub + '»)');
  ok(w.rows === 3, 'alle 3 Werkzeuge gelistet');
  ok(w.badges.some(b => /Ausgeliehen/.test(b)) && w.badges.some(b => /Prüfung überfällig/.test(b)) && w.badges.some(b => /Verfügbar/.test(b)), 'Status-Badges (Verfügbar/Ausgeliehen/Prüfung)');
  await page.click('.gn--page [data-nat-seg] [data-value="aus"]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 1, 'Segment «Ausgeliehen» filtert auf 1');
  await page.fill('.gn--page [data-nat-q]', 'Leiter');
  await page.click('.gn--page [data-nat-seg] [data-value="alle"]');
  await page.waitForTimeout(200);
  const s1 = await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length);
  ok(s1 === 1, 'Suche «Leiter» filtert auf 1');
  // Zeile öffnet das ECHTE Detail-Modal des Moduls
  await page.click('.gn--page [data-nat-list] .gn-row');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const m = document.getElementById('viewModal'); return !!m && getComputedStyle(m).display !== 'none'; }) ||
     await page.evaluate(() => !!document.querySelector('.wz-modal-bg,.modal-bg') && Array.from(document.querySelectorAll('.wz-modal-bg,.modal-bg')).some(x => getComputedStyle(x).display !== 'none')),
     'Zeilen-Tap öffnet Modul-Detail (klassisches Modal über dem Screen)');
  await page.keyboard.press('Escape');
  // Klassisch-Toggle + Rückkehr-Pill
  await page.click('.gn--page [data-gn-classic]');
  await page.waitForTimeout(250);
  ok(!(await natVisible(page)), 'Umschalter → klassische Ansicht (Overlay weg)');
  ok(await page.evaluate(() => { const p = document.querySelector('.gn-return-pill'); return !!p && p.style.display !== 'none'; }), '📱-Rückkehr-Pill sichtbar');
  await page.click('.gn-return-pill');
  await page.waitForTimeout(250);
  ok(await natVisible(page), 'Pill → Native-Ansicht wieder aktiv');
  await page.evaluate(() => localStorage.setItem('gema_native_view_v1', 'native'));
  await page.close();
}

/* ════════ 2 · Fahrzeuge ════════ */
console.log('— Fahrzeuge (Liste/MFK/Fahrer-Chip) —');
{
  const { page, errs } = await openPage('/if_fahrzeug.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const f = await page.evaluate(() => ({
    sub: document.querySelector('.gn--page .gn-large-title p').textContent,
    rows: document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length,
    badges: Array.from(document.querySelectorAll('.gn--page .gn-badge')).map(b => b.textContent),
    ava: (document.querySelector('.gn--page .gn-ava-sm') || {}).textContent
  }));
  ok(f.sub.indexOf('2 Fahrzeuge') >= 0 && f.sub.indexOf('1 MFK fällig') >= 0, 'Zähler echt («' + f.sub + '»)');
  ok(f.rows === 2 && f.badges.some(b => /MFK fällig/.test(b)), '2 Fahrzeuge + MFK-Badge');
  ok(f.ava === 'MK', 'Fahrer-Initialen-Chip («' + f.ava + '»)');
  await page.close();
}

/* ════════ 3 · Stunden ════════ */
console.log('— Stunden (Wochen-Summe/Tages-Gruppen) —');
{
  const { page, errs } = await openPage('/pm_stunden.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const s = await page.evaluate(() => ({
    sub: document.querySelector('.gn--page .gn-large-title p').textContent,
    rows: Array.from(document.querySelectorAll('.gn--page .gn-row .gn-row-title')).map(x => x.textContent),
    vals: Array.from(document.querySelectorAll('.gn--page .gn-row-val')).map(x => x.textContent)
  }));
  ok(/Woche \d+ · 8,3 h erfasst/.test(s.sub), 'Wochen-Summe echt («' + s.sub + '»)');
  ok(s.rows.some(r => r.indexOf('Lindenpark') >= 0) && s.rows.some(r => r.indexOf('Büro') >= 0), 'Tages-Einträge aus dem Pool');
  ok(s.vals.some(v => v === '4,3 h') && s.vals.some(v => v === '4,0 h'), 'Eintrags-Stunden berechnet (4,3 / 4,0)');
  // ＋ Zeit erfassen öffnet das echte Modul-Modal
  await page.click('.gn--page [data-nat-act="neu"]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const m = document.getElementById('einModal'); return !!m && Array.from(document.querySelectorAll('.modal-bg')).some(x => getComputedStyle(x).display !== 'none'); }), '＋ Zeit erfassen öffnet das Erfassungs-Modal');
  await page.close();
}

/* ════════ 4 · Einsatzplan ════════ */
console.log('— Einsatzplan (Weekstrip/Agenda) —');
{
  const { page, errs } = await openPage('/pm_einsatzplan.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const e = await page.evaluate(() => ({
    days: document.querySelectorAll('.gn--page .gn-day').length,
    dot: !!document.querySelector('.gn--page .gn-day.is-active.has-dot'),
    ev: (document.querySelector('.gn--page .gn-event-title') || {}).textContent,
    zeit: (document.querySelector('.gn--page .gn-event-time') || {}).textContent
  }));
  ok(e.days === 7, 'Wochenstreifen mit 7 Tagen');
  ok(e.dot, 'Heute aktiv + Event-Punkt');
  ok(e.ev === 'Montage Sanitär · Lindenpark', 'Agenda zeigt den echten Einsatz');
  ok(e.zeit && e.zeit.indexOf('07:30') >= 0, 'Einsatz-Zeit aus dem Record');
  await page.close();
}

/* ════════ 5 · Workspace ════════ */
console.log('— Workspace (Cockpit-KPIs) —');
{
  const { page, errs } = await openPage('/sys_workspace.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const w = await page.evaluate(() => {
    const st = Array.from(document.querySelectorAll('.gn--page .gn-stat')).map(x => ({ k: x.querySelector('.gn-stat-k').textContent, v: x.querySelector('.gn-stat-v').textContent }));
    return { st, bucket: (document.querySelector('.gn--page [data-nat-bucket] .gn-row-title') || {}).textContent,
      recent: (document.querySelector('.gn--page [data-nat-href] .gn-row-title') || {}).textContent };
  });
  const kv = k => (w.st.find(x => x.k === k) || {}).v;
  ok(kv('Stunden Woche') === '8,3', 'KPI Stunden Woche aus dem Pool (8,3)');
  ok(kv('Einsätze heute') === '1', 'KPI Einsätze heute (1)');
  ok(kv('Prüfungen fällig') === '1', 'KPI Prüfungen fällig (1 — Leiter überfällig)');
  ok(kv('Offene Rapporte') === '1', 'KPI offene Rapporte (1)');
  ok(w.bucket === 'Wohnüberbauung Lindenpark', 'Eimer-Liste echt');
  ok(w.recent === 'Druckdispositiv', 'Zuletzt verwendet via GemaRecent');
  await page.close();
}

/* ════════ 6 · Druckdispositiv (DOM-Proxy) ════════ */
console.log('— Druckdispositiv (Eingabe→echte Berechnung→Ergebnis) —');
{
  const { page, errs } = await openPage('/sb_druckdispositiv.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  // Modus «Netzdruck», Versorgungsdruck 4.5 bar + höchste Stelle 10 m
  await page.click('.gn--page [data-nat-mode] [data-value="direkt"]');
  await page.waitForTimeout(250);
  await page.fill('.gn--page [data-nat-proxy="versorgungsdruck"]', '4.5');
  await page.fill('.gn--page [data-nat-proxy="hHoechste"]', '10');
  await page.waitForTimeout(250);
  const d = await page.evaluate(() => ({
    klassisch: document.getElementById('versorgungsdruck').value,
    out: document.getElementById('out-fliessdruck').textContent
  }));
  ok(d.klassisch === '4.5', 'Proxy schreibt in den klassischen Input');
  ok(d.out !== '—' && Math.abs(parseFloat(d.out.replace(',', '.')) - 3.52) < 0.02, 'Echte Berechnung läuft (Fliessdruck ≈ 3.52, ist «' + d.out + '»)');
  await page.click('.gn--page [data-nat-seg] [data-value="ergebnis"]');
  await page.waitForTimeout(250);
  const erg = await page.evaluate(() => ({
    val: (document.querySelector('.gn--page .gn-result .gn-val') || {}).textContent,
    note: (document.querySelector('.gn--page .gn-result .gn-note') || {}).textContent,
    kv: document.querySelectorAll('.gn--page [data-nat-ergebnis] .gn-kv').length
  }));
  ok(erg.val && erg.val.replace(',', '.').indexOf('3.52') >= 0, 'Ergebnis-Karte zeigt den Modul-Wert («' + erg.val + '»)');
  ok(/Erhöht|Norm|tief/.test(erg.note), 'Normstatus übernommen («' + erg.note + '»)');
  ok(erg.kv === 5, 'Zwischenwerte-Liste (5 kv-Zeilen)');
  await page.close();
}

/* ════════ Desktop-Gegenprobe ════════ */
console.log('— Desktop bleibt klassisch —');
{
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await routeAll(dctx);
  await dctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, SEED);
  const page = await dctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  ok(errs.length === 0, 'Desktop-Boot ohne pageerrors');
  ok(!(await natVisible(page)), 'Native-Overlay auf Desktop unsichtbar');
  ok(await page.evaluate(() => !document.querySelector('.gn-return-pill') || document.querySelector('.gn-return-pill').style.display === 'none' || getComputedStyle(document.querySelector('.gn-return-pill')).display === 'none'), 'keine Rückkehr-Pill auf Desktop');
  ok(await page.evaluate(() => !!document.querySelector('.g-nav') && getComputedStyle(document.querySelector('.g-nav')).display !== 'none'), 'GEMA-Nav auf Desktop sichtbar');
  await dctx.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
