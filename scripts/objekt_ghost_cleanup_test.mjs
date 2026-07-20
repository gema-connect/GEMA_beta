// Ghost-Objekte aufräumen (pm_objekte.html): Test-Objekte, die in Dropdowns
// erscheinen (Workspace-Eimer referenzieren sie / nur lokal), in der normalen
// Objektliste aber fehlen, lassen sich über das Wartungs-Panel «🧹 Aufräumen»
// überall entfernen — Cloud-Row, Pool-Cache und der referenzierende
// Workspace-Eimer werden entkoppelt (Resurrection-Loop gebrochen).
//
// Playwright mit In-Memory-PostgREST-Mock (LIKE + DELETE-Tracking),
// Muster scripts/objekt_loeschen_datencheck_test.mjs.
//
// Aufruf:  CHROME=<chromium> node scripts/objekt_ghost_cleanup_test.mjs
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
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/pm_objekte.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST (Map «mk|dk» → payload) + DELETE-Tracking ─────
const store = new Map();
const deletes = [];               // ['mk|dk', …] — jeder DELETE-Aufruf
function likeToRe(pattern) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*/g, '.*').replace(/_/g, '.') + '$');
}
function handleSb(route) {
  const req = route.request();
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mkEq = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
  const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
  const jObjektId = (url.match(/payload->data->>objektId=eq\.([^&]+)/) || [])[1];
  const jProjObjektId = (url.match(/payload->data->projekt->>objektId=eq\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|'); const m = k.slice(0, i), d = k.slice(i + 1);
      if (mkEq && m !== mkEq) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike && !likeToRe(dkLike).test(d)) continue;
      if (jObjektId && !(v && v.data && v.data.objektId === jObjektId)) continue;
      if (jProjObjektId && !(v && v.data && v.data.projekt && v.data.projekt.objektId === jProjObjektId)) continue;
      rows.push({ module_key: m, data_key: d, payload: v });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(row => { if (row && row.module_key && row.data_key) store.set(row.module_key + '|' + row.data_key, row.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') {
    if (mkEq && dkEq) { deletes.push(mkEq + '|' + dkEq); store.delete(mkEq + '|' + dkEq); }
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

// ── Seeds ────────────────────────────────────────────────────────────
function seedStore() {
  store.clear(); deletes.length = 0;
  const put = (mk, dk, payload) => store.set(mk + '|' + dk, payload);
  // Echtes Objekt (in Liste + Cloud)
  put('objekte', 'objekt:obj_real',  { data: { id: 'obj_real',  name: 'Neubau Alpha', strasse: 'Bahnhofstrasse 4', plz: '8000', ort: 'Zürich', orgId: 'org_t' }, _lm: '2026-07-01T00:00:00Z' });
  // Cloud-Objekt, das ein Workspace-Eimer referenziert (soll löschbar sein)
  put('objekte', 'objekt:obj_stale', { data: { id: 'obj_stale', name: 'Alt-Test',    orgId: 'org_t' }, _lm: '2026-07-01T00:00:00Z' });
  // obj_ghost existiert NUR im Workspace-Eimer — nicht in der Cloud
}

// Workspace-Eimer (geräte-lokal) — referenzieren obj_ghost (nicht in Cloud)
// und obj_stale (in Cloud), plus ein Eimer ohne Objekt.
const WS = JSON.stringify([
  { id: 'b_ghost', name: 'Test-Eimer A', objektId: 'obj_ghost' },
  { id: 'b_stale', name: 'Stale-Eimer',  objektId: 'obj_stale' },
  { id: 'b_none',  name: 'Leerer Eimer', objektId: null }
]);

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

const browser = await chromium.launch({ executablePath: CHROME });
async function open(extraLs) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    Object.assign({ gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: SESSION, gema_workspace_v1: WS }, extraLs || {}));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/pm_objekte.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return { ctx, page };
}

console.log('— 1) Wartungs-Panel listet Workspace-Ghost + Cloud-Objekte —');
{
  seedStore();
  const { ctx, page } = await open();
  ok(page.errs.length === 0, 'pm_objekte bootet ohne pageerrors');
  const hooks = await page.evaluate(() => !!(window._objDelHooks && window._objDelHooks.wartungRows && window._objDelHooks.wsRefs && window._objDelHooks.scrub));
  ok(hooks, 'Test-Hooks (wartungRows/wsRefs/scrub) vorhanden');
  const refs = await page.evaluate(() => window._objDelHooks.wsRefs());
  ok(refs.obj_ghost && refs.obj_ghost[0] === 'Test-Eimer A', 'wsRefs mappt obj_ghost → Eimer-Name');
  ok(refs.obj_stale && refs.obj_stale.length === 1, 'wsRefs mappt obj_stale (in Cloud)');
  ok(!refs.obj_real, 'obj_real ohne Workspace-Referenz nicht in wsRefs');
  const rows = await page.evaluate(() => window._objDelHooks.wartungRows(null));
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  ok(!!byId.obj_ghost, 'wartungRows enthält den Workspace-only-Ghost obj_ghost');
  ok(byId.obj_ghost.wsOnly === true, 'obj_ghost ist wsOnly (nur im Eimer)');
  ok(byId.obj_ghost.ws && byId.obj_ghost.ws[0] === 'Test-Eimer A', 'obj_ghost trägt die Eimer-Herkunft');
  ok(byId.obj_ghost.inList === false, 'obj_ghost NICHT in der normalen Liste (inList=false)');
  ok(byId.obj_ghost.inCloud === null, 'ohne cloudIds ist inCloud unbestimmt (null)');
  ok(!!byId.obj_real && byId.obj_real.inList === true, 'obj_real ist in der Liste');
  ok(!!byId.obj_stale && byId.obj_stale.ws, 'obj_stale (Cloud) trägt ebenfalls die Eimer-Herkunft');
  await ctx.close();
}

console.log('— 2) inCloud-Flag aus den Cloud-IDs («nur lokal») —');
{
  seedStore();
  const { ctx, page } = await open();
  // Simuliere die Cloud-ID-Nachladung: nur obj_real + obj_stale sind in der Cloud
  const rows = await page.evaluate(() => window._objDelHooks.wartungRows({ obj_real: true, obj_stale: true }));
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  ok(byId.obj_ghost.inCloud === false, 'obj_ghost: inCloud=false → «nur lokal»-Marker');
  ok(byId.obj_real.inCloud === true, 'obj_real: inCloud=true');
  ok(byId.obj_stale.inCloud === true, 'obj_stale: inCloud=true');
  await ctx.close();
}

console.log('— 3) Panel «🧹 Aufräumen» rendert Ghost-Zeile + Badges —');
{
  seedStore();
  const { ctx, page } = await open();
  await page.evaluate(() => window._objWartungOpen());
  await page.waitForTimeout(400);
  const html = await page.evaluate(() => { var b = document.getElementById('objWartungBody'); return b ? b.innerHTML : ''; });
  ok(/Test-Eimer A|Workspace-Eimer/.test(html), 'Panel zeigt die Workspace-Eimer-Herkunft');
  ok(html.indexOf('obj_ghost') >= 0, 'Panel listet obj_ghost');
  ok(/nicht in Liste/.test(html), 'Badge «nicht in Liste» vorhanden');
  ok(page.errs.length === 0, 'keine pageerrors beim Öffnen');
  await ctx.close();
}

console.log('— 4) Ghost löschen → Cloud-Delete + Workspace-Eimer entkoppelt —');
{
  seedStore();
  const { ctx, page } = await open();
  await page.evaluate(() => window.deleteObjektById('obj_ghost'));
  await page.waitForSelector('.gema-dlg', { timeout: 8000 });
  const btn = await page.evaluate(() => { var b = document.querySelector('.gema-dlg-danger'); return b ? b.textContent : ''; });
  ok(/Löschen/.test(btn), 'Dialog erscheint auch für einen Ghost (kein «Objekt nicht gefunden»)');
  await page.click('.gema-dlg-danger');
  await page.waitForTimeout(1200);
  ok(deletes.indexOf('objekte|objekt:obj_ghost') >= 0, 'GemaSync.deleteRecord(objekt:obj_ghost) ausgelöst');
  const ws = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_workspace_v1') || '[]'));
  const bg = ws.find(b => b.id === 'b_ghost');
  ok(bg && bg.objektId === null, 'Workspace-Eimer «Test-Eimer A» entkoppelt (objektId=null) — Resurrection-Loop gebrochen');
  ok(ws.find(b => b.id === 'b_stale').objektId === 'obj_stale', 'anderer Eimer unberührt');
  await ctx.close();
}

console.log('— 5) Cloud-Objekt mit Eimer-Bezug löschen → Row weg + Eimer entkoppelt —');
{
  seedStore();
  const { ctx, page } = await open();
  ok(store.has('objekte|objekt:obj_stale'), 'obj_stale liegt vor dem Löschen in der Cloud');
  await page.evaluate(() => window.deleteObjektById('obj_stale'));
  await page.waitForSelector('.gema-dlg', { timeout: 8000 });
  await page.click('.gema-dlg-danger');
  await page.waitForTimeout(1200);
  ok(!store.has('objekte|objekt:obj_stale'), 'Cloud: objekt:obj_stale gelöscht');
  ok(store.has('objekte|objekt:obj_real'), 'obj_real bleibt bestehen');
  const ws = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_workspace_v1') || '[]'));
  ok(ws.find(b => b.id === 'b_stale').objektId === null, 'Stale-Eimer entkoppelt (objektId=null)');
  await ctx.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
