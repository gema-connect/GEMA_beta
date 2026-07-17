// Favoriten auf der Übersichtsseite (index.html): pro User + Cloud-synchron
// über alle Geräte. Playwright mit In-Memory-PostgREST-Mock (ein gemeinsamer
// Store über mehrere Browser-Kontexte = «mehrere Geräte»).
//
// Deckt ab:
//  1) Gerät A markiert Favorit → landet in der Cloud (fav_<userId>).
//  2) Gerät B (gleicher User, leerer lokaler Cache) zieht die Favoriten beim
//     Start aus der Cloud → Stern aktiv + Favoriten-Sektion sichtbar.
//  3) Entfernen auf A → nach Reload auf B verschwunden (Cloud gewinnt).
//  4) Cross-User-Isolation: User B sieht die Favoriten von User A NICHT.
//  5) Migration: alter geräteweiter Key `gema_favourites` wird beim ersten
//     Start übernommen und in die Cloud gehoben.
//
// Aufruf:  CHROME=<chromium> node scripts/favoriten_sync_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8896;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── Gemeinsamer In-Memory-PostgREST-Store (Map «mk|dk» → payload) ──
const store = new Map();
function handleSb(route) {
  const req = route.request();
  const url = req.url();
  const method = req.method();
  if (method === 'GET') {
    // module_key=eq.X & data_key=eq.Y
    const mk = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
    const dkm = url.match(/data_key=eq\.([^&]+)/);
    const rows = [];
    if (mk) {
      const mkD = decodeURIComponent(mk);
      if (dkm) {
        const dk = decodeURIComponent(dkm[1]);
        const key = mkD + '|' + dk;
        if (store.has(key)) rows.push({ data_key: dk, payload: store.get(key) });
      } else {
        for (const [k, v] of store) { const [m, d] = k.split('|'); if (m === mkD) rows.push({ data_key: d, payload: v }); }
      }
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = [];
    try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(row => { if (row && row.module_key && row.data_key) store.set(row.module_key + '|' + row.data_key, row.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
// role_admin bleibt auf index.html (die anderen Rollen werden von gema_auth
// rollenspezifisch weitergeleitet). Die Per-User-Favoriten-Sync-Logik ist
// rollenunabhängig — Admin sieht zudem alle Kacheln (Stern immer vorhanden).
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1', 'u2'], active: true };
const USERS = [
  { id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } },
  { id: 'u2', username: 'b@t.ch', name: 'User B', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'b@t.ch' } }
];

const browser = await chromium.launch({ executablePath: CHROME });

async function device(userId, extraLs) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
    Object.assign({ gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig', userId, expires: FUTURE } }, extraLs || {}));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  return { ctx, page };
}

// Ein garantiert vorhandener Modul-Key (Card-href) auf index.html
const FAVKEY = 'pm_objekte.html';

console.log('— 1) Gerät A markiert Favorit → Cloud —');
{
  const { ctx, page } = await device('u1');
  // Über den echten Stern-Button togglen (UI-Pfad), Hook als Fallback
  const clicked = await page.evaluate(k => {
    var star = document.querySelector('.fav-btn[data-key="' + k + '"]');
    if (star) { star.click(); return 'click'; }
    if (window._favHooks) { window._favHooks.toggle(k); return 'hook'; }
    return 'none';
  }, FAVKEY);
  ok(clicked !== 'none', 'Favorit gesetzt (' + clicked + ')');
  await page.waitForTimeout(600);
  const cloud = store.get('favoriten|fav_u1');
  ok(!!cloud && Array.isArray(cloud.data.keys) && cloud.data.keys.indexOf(FAVKEY) >= 0, 'Favorit in der Cloud gespeichert (fav_u1)');
  ok(cloud && cloud.data.userId === 'u1', 'Record trägt userId');
  const uiA = await page.evaluate((k) => {
    var star = document.querySelector('.fav-btn[data-key="' + k + '"]');
    return { starActive: star ? star.classList.contains('active') : false, favVisible: getComputedStyle(document.getElementById('fav')).display !== 'none' };
  }, FAVKEY);
  ok(uiA.starActive, 'Stern auf Gerät A aktiv');
  ok(uiA.favVisible, 'Favoriten-Sektion sichtbar');
  ok(page.errs.length === 0, 'keine pageerrors (A)');
  await ctx.close();
}

console.log('— 2) Gerät B (gleicher User, leerer Cache) zieht Favoriten aus der Cloud —');
{
  const { ctx, page } = await device('u1'); // frischer Kontext = anderes Gerät, kein lokaler Fav-Cache
  await page.waitForTimeout(1900); // Cloud-Pull (sofort + 1500ms-Fallback)
  const st = await page.evaluate((k) => {
    var star = document.querySelector('.fav-btn[data-key="' + k + '"]');
    var favGrid = document.getElementById('favGrid');
    return {
      hasFav: window._favHooks.has(k),
      starActive: star ? star.classList.contains('active') : false,
      inGrid: favGrid ? favGrid.querySelector('a.mod-card[href="' + k + '"]') != null : false,
      favBtnVisible: getComputedStyle(document.getElementById('favFilterBtn')).display !== 'none'
    };
  }, FAVKEY);
  ok(st.hasFav, 'favs-Set enthält den Cloud-Favoriten');
  ok(st.starActive, 'Stern auf Gerät B aktiv (aus der Cloud)');
  ok(st.inGrid, 'Modul erscheint in der Favoriten-Sektion');
  ok(st.favBtnVisible, '⭐-Filter-Button sichtbar');
  ok(page.errs.length === 0, 'keine pageerrors (B)');
  await ctx.close();
}

console.log('— 3) Entfernen auf A → nach Reload auf B weg (Cloud gewinnt) —');
{
  const a = await device('u1');
  await a.page.waitForTimeout(1900); // Cloud-Pull (Favorit ist gesetzt)
  await a.page.evaluate(k => { if (window._favHooks.has(k)) window._favHooks.toggle(k); }, FAVKEY); // entfernen
  await a.page.waitForTimeout(500);
  ok(!(store.get('favoriten|fav_u1').data.keys.indexOf(FAVKEY) >= 0), 'Cloud-Record ohne den entfernten Favoriten');
  await a.ctx.close();

  const b = await device('u1');
  await b.page.waitForTimeout(1900);
  const gone = await b.page.evaluate(k => !window._favHooks.has(k), FAVKEY);
  ok(gone, 'Gerät B hat den Favoriten nach Reload nicht mehr');
  await b.ctx.close();
}

console.log('— 4) Cross-User-Isolation —');
{
  // User A legt wieder einen Favoriten an
  const a = await device('u1');
  await a.page.evaluate(k => { if (!window._favHooks.has(k)) window._favHooks.toggle(k); }, FAVKEY);
  await a.page.waitForTimeout(500);
  await a.ctx.close();
  // User B (anderer User) darf ihn nicht sehen
  const b = await device('u2');
  await b.page.waitForTimeout(1900);
  const isol = await b.page.evaluate(k => ({ hasFav: window._favHooks.has(k), size: window._favHooks.size() }), FAVKEY);
  ok(!isol.hasFav && isol.size === 0, 'User B sieht die Favoriten von User A nicht (' + isol.size + ' Favoriten)');
  ok(!store.has('favoriten|fav_u2'), 'kein leerer fav_u2-Record erzeugt');
  await b.ctx.close();
}

console.log('— 5) Migration: alter geräteweiter Key wird übernommen + hochgeladen —');
{
  store.delete('favoriten|fav_u1'); // frischer Start für die Migration
  const LEGACY = 'sd_schadensbericht.html';
  const { ctx, page } = await device('u1', { gema_favourites: [LEGACY] });
  await page.waitForTimeout(1900);
  const st = await page.evaluate(k => {
    var star = document.querySelector('.fav-btn[data-key="' + k + '"]');
    return { hasFav: window._favHooks.has(k), starActive: star ? star.classList.contains('active') : false };
  }, LEGACY);
  ok(st.hasFav, 'Legacy-Favorit als Startwert übernommen');
  ok(st.starActive, 'Stern aktiv (migrierter Favorit)');
  const cloud = store.get('favoriten|fav_u1');
  ok(!!cloud && cloud.data.keys.indexOf(LEGACY) >= 0, 'migrierter Favorit in die Cloud gehoben');
  ok(page.errs.length === 0, 'keine pageerrors (Migration)');
  await ctx.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
