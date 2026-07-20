// Workspace → Plandialog: Das Eimer-Objekt ist im Plandialog direkt
// vorausgewählt (Feedback 07/2026).
//  1) Workspace-Modul-Kacheln tragen ?objekt=<eimer-objekt> im href.
//  2) pm_planablage liest ?objekt= und startet mit gesetztem Objekt-Filter
//     (Dokumente + Upload-Preset auf dem Projekt).
//  3) Ohne Param greift das aktive GEMA-Objekt (das der Workspace beim
//     Öffnen des Eimers setzt); ohne beides bleibt «Alle Objekte».
//  4) Eine manuelle Filter-Wahl wird nie überschrieben.
//
// Aufruf:  CHROME=<chromium> node scripts/workspace_plandialog_objekt_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8893;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/sys_workspace.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST ──────────────────────────────────────────────
const store = new Map();
function likeToRe(p) {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*/g, '.*').replace(/_/g, '.') + '$');
}
function handleSb(route) {
  const req = route.request();
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mkEq = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
  const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|');
      const m = k.slice(0, i), d = k.slice(i + 1);
      if (mkEq && m !== mkEq) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike && !likeToRe(dkLike).test(d)) continue;
      rows.push({ module_key: m, data_key: d, payload: v });
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
  if (method === 'DELETE') {
    if (mkEq && dkEq) store.delete(mkEq + '|' + dkEq);
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

// ── Seeds ────────────────────────────────────────────────────────────
const OBJ_A = { id: 'obj_a', name: 'Neubau Alpha', orgId: 'org_t', status: 'aktiv' };
const OBJ_B = { id: 'obj_b', name: 'Umbau Beta', orgId: 'org_t', status: 'aktiv' };
function seedStore() {
  store.clear();
  [OBJ_A, OBJ_B].forEach(o => store.set('objekte|objekt:' + o.id, { data: o, _lm: '2026-07-01T00:00:00Z' }));
  store.set('planablage|pabd:dok_a', { data: { id: 'dok_a', orgId: 'org_t', objektId: 'obj_a', objektName: 'Neubau Alpha', name: 'Grundriss Alpha', kategorie: 'plan', datei: { name: 'a.pdf', url: 'x', size: 10, mime: 'application/pdf' }, freigaben: [], kommentare: [], hochgeladenAm: '2026-07-01T00:00:00Z' }, _lm: '2026-07-01T00:00:00Z' });
  store.set('planablage|pabd:dok_b', { data: { id: 'dok_b', orgId: 'org_t', objektId: 'obj_b', objektName: 'Umbau Beta', name: 'Grundriss Beta', kategorie: 'plan', datei: { name: 'b.pdf', url: 'x', size: 10, mime: 'application/pdf' }, freigaben: [], kommentare: [], hochgeladenAm: '2026-07-01T00:00:00Z' }, _lm: '2026-07-01T00:00:00Z' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const BUCKET = { id: 'ws_1', name: 'Eimer Alpha', type: 'project', ownerType: 'org', ownerOrgId: 'org_t', createdBy: 'u1', org: 'org_t', objektId: 'obj_a', members: ['UA'], modules: [{ mod: 'pm_planablage', status: 'offen' }, { mod: 'sa_enthaertung', status: 'offen' }], activity: [], beteiligte: [], notes: [{ id: 'n1', title: 'S.1', body: '' }], accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] }, createdAt: '2026-07-01T00:00:00.000Z' };
const OBJ_BLOB = { objekte: [OBJ_A, OBJ_B], beteiligte: [], activeObjektId: null };

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(path, extraLs) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    Object.assign({ gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: { token: 'x.y.z', userId: 'u1', expires: FUTURE } }, extraLs || {}));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1100);
  return { ctx, page };
}

console.log('— 1) Workspace-Kachel trägt ?objekt=<eimer-objekt> —');
{
  seedStore();
  const { ctx, page } = await openPage('/sys_workspace.html', { gema_workspace_v1: [BUCKET], gema_objekte_v1: OBJ_BLOB });
  await page.evaluate(() => window._wsOpen('ws_1'));
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('#wsModGrid a.ws-mod-tile')).map(a => a.getAttribute('href'));
    return { links };
  });
  ok(st.links.length >= 2, 'Modul-Kacheln gerendert (' + st.links.length + ')');
  ok(st.links.indexOf('pm_planablage.html?objekt=obj_a') >= 0, 'Plandialog-Kachel: pm_planablage.html?objekt=obj_a');
  ok(st.links.indexOf('sa_enthaertung.html?objekt=obj_a') >= 0, 'auch Berechnungs-Kacheln tragen das Objekt');
  ok(page.errs.length === 0, 'keine pageerrors (Workspace)');
  await ctx.close();
}

console.log('— 2) Plandialog mit ?objekt= startet auf dem Projekt —');
{
  seedStore();
  const { ctx, page } = await openPage('/pm_planablage.html?objekt=obj_a', { gema_objekte_v1: OBJ_BLOB });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({
    filter: window._pabHooks.objFilter(),
    text: document.getElementById('pabHost') ? document.getElementById('pabHost').textContent : document.body.textContent,
    selVal: (function(){ var s = document.getElementById('pabObjFilter'); return s ? s.value : null; })()
  }));
  ok(st.filter === 'obj_a', 'Objekt-Filter = obj_a (' + st.filter + ')');
  ok(st.selVal === 'obj_a', 'Dropdown zeigt das Projekt vorausgewählt');
  ok(/Grundriss Alpha/.test(st.text), 'Dokument des Projekts sichtbar');
  ok(!/Grundriss Beta/.test(st.text), 'Dokumente anderer Projekte ausgefiltert');
  ok(page.errs.length === 0, 'keine pageerrors (?objekt=)');
  await ctx.close();
}

console.log('— 3) Ohne Param: aktives GEMA-Objekt greift —');
{
  seedStore();
  const blob = JSON.parse(JSON.stringify(OBJ_BLOB)); blob.activeObjektId = 'obj_b';
  const { ctx, page } = await openPage('/pm_planablage.html', { gema_objekte_v1: blob, gema_active_objekt_v1: 'obj_b' });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({ filter: window._pabHooks.objFilter(), text: document.body.textContent }));
  ok(st.filter === 'obj_b', 'Filter folgt dem aktiven Objekt (' + st.filter + ')');
  ok(/Grundriss Beta/.test(st.text) && !/Grundriss Alpha/.test(st.text), 'nur Dokumente des aktiven Objekts');
  await ctx.close();
}

console.log('— 4) Ohne Param + ohne aktives Objekt: «Alle Objekte» —');
{
  seedStore();
  const { ctx, page } = await openPage('/pm_planablage.html', { gema_objekte_v1: OBJ_BLOB });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({ filter: window._pabHooks.objFilter(), text: document.body.textContent }));
  ok(st.filter === '', 'kein Vorfilter gesetzt');
  ok(/Grundriss Alpha/.test(st.text) && /Grundriss Beta/.test(st.text), 'alle Dokumente sichtbar');
  await ctx.close();
}

console.log('— 5) Manuelle Wahl wird nie überschrieben —');
{
  seedStore();
  const { ctx, page } = await openPage('/pm_planablage.html?objekt=obj_a', { gema_objekte_v1: OBJ_BLOB });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => {
    window.pabObjChanged('');                 // Nutzer wählt bewusst «Alle Objekte»
    const again = window._pabHooks.objFilterInit();  // z.B. GemaObjekte.ready-Nachlauf
    return { again, filter: window._pabHooks.objFilter() };
  });
  ok(st.again === false && st.filter === '', 'objFilterInit überschreibt die manuelle Wahl nicht');
  // Unbekanntes Objekt im Param → kein Filter auf eine unsichtbare ID
  const { ctx: c2, page: p2 } = await openPage('/pm_planablage.html?objekt=obj_fremd', { gema_objekte_v1: OBJ_BLOB });
  await p2.waitForTimeout(600);
  const f2 = await p2.evaluate(() => window._pabHooks.objFilter());
  ok(f2 === '', 'unbekannte/unsichtbare Objekt-ID wird ignoriert');
  await ctx.close(); await c2.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
