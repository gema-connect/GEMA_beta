// Workspace-Eimer: per-Record-Cloud-Sync über alle Geräte (Bugreport
// 27.07.2026: «Eimer auf dem iPad nicht sichtbar» — der alte Blob
// gema_workspace_v1 war gerätelokal, der _GemaDB-Push ein No-Op ohne init).
//
// In-Memory-PostgREST-Mock über mehrere Browser-Kontexte = «mehrere Geräte»
// (Muster favoriten_sync_test). Deckt ab:
//  1) Gerät A erstellt Eimer → Record `ws:<id>` in der Cloud.
//  2) Gerät B (gleicher User, leerer Cache) sieht den Eimer ← der Bugfall.
//  3) Sichtbarkeit: Org-Kollege sieht Org-Eimer, NICHT den persönlichen;
//     fremde Org sieht gar nichts (Pool ist cross-org).
//  4) Migration: Alt-Blob → Records + Blob entfernt (keine Resurrection).
//  5) Löschen auf A → Cloud-Delete → B nach Reload ohne Eimer.
//  6) index.html-Chips lesen den Pool mit Sichtbarkeits-Filter.
//
// Aufruf:  CHROME=<chromium> node scripts/workspace_sync_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8894;
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

// ── In-Memory-PostgREST (GET eq/like + POST batch + DELETE eq) ──
const store = new Map(); // «mk|dk» → payload
function handleSb(route) {
  const req = route.request(), url = req.url(), method = req.method();
  const mkм = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const mk = mkм ? decodeURIComponent(mkм) : null;
  if (method === 'GET') {
    const rows = [];
    const eq = url.match(/data_key=eq\.([^&]+)/);
    const like = url.match(/data_key=like\.([^&]+)/);
    if (mk && eq) {
      const dk = decodeURIComponent(eq[1]);
      if (store.has(mk + '|' + dk)) rows.push({ data_key: dk, payload: store.get(mk + '|' + dk) });
    } else if (mk && like) {
      const pf = decodeURIComponent(like[1]).replace(/\*$/, '');
      for (const [k, v] of store) { const i = k.indexOf('|'); if (k.slice(0, i) === mk && k.slice(i + 1).startsWith(pf)) rows.push({ data_key: k.slice(i + 1), payload: v }); }
      rows.sort((a, b) => a.data_key < b.data_key ? -1 : 1);
    } else if (mk) {
      for (const [k, v] of store) { const i = k.indexOf('|'); if (k.slice(0, i) === mk) rows.push({ data_key: k.slice(i + 1), payload: v }); }
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = [];
    try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(r => { if (r && r.module_key && r.data_key) store.set(r.module_key + '|' + r.data_key, r.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') {
    const eq = url.match(/data_key=eq\.([^&]+)/);
    if (mk && eq) store.delete(mk + '|' + decodeURIComponent(eq[1]));
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfYSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig';
const ORGS = [
  { id: 'org_a', name: 'Planer AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true },
  { id: 'org_b', name: 'Fremd GmbH', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u3'], active: true }
];
const USERS = [
  { id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_planer'], orgId: 'org_a', active: true, profile: { email: 'a@t.ch' } },
  { id: 'u2', username: 'k@t.ch', name: 'Kollege', roleIds: ['role_planer'], orgId: 'org_a', active: true, profile: { email: 'k@t.ch' } },
  { id: 'u3', username: 'f@x.ch', name: 'Fremder', roleIds: ['role_planer'], orgId: 'org_b', active: true, profile: { email: 'f@x.ch' } },
  // Admin bleibt auf index.html (der Rollen-Redirect schickt Planer auf den
  // Workspace) — für den Chip-Test der Modulübersicht.
  { id: 'u9', username: 'adm@t.ch', name: 'Admin', roleIds: ['role_admin'], orgId: 'org_a', active: true, profile: { email: 'adm@t.ch' } }
];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function device(userId, opts) {
  opts = opts || {};
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    Object.assign({
      gema_orgs_v1: ORGS, gema_users_v1: USERS,
      gema_session_v1: { token: JWT, userId, expires: FUTURE },
      gema_coachmarks_done_sys_workspace_v2: 'done', gema_coachmarks_done_sys_workspace: 'done'
    }, opts.ls || {}));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/' + (opts.file || 'sys_workspace.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);   // Boot + Cloud-Pull (Mock antwortet sofort)
  return { ctx, page };
}
const wsKeys = () => [...store.keys()].filter(k => k.startsWith('workspace|'));

console.log('— 1) Gerät A: Eimer erstellen → Cloud-Record —');
let orgBucketId = null;
{
  const { ctx, page } = await device('u1');
  await page.evaluate(() => window._wsOpenNewModal());
  await page.fill('#wsNewName', 'Neubau Musterstrasse');
  await page.evaluate(() => window._wsDoCreate());
  // Debounce (900 ms) + Push abwarten, dann Flush erzwingen
  await page.evaluate(() => window._wsHooks.flush());
  await page.waitForTimeout(500);
  const keys = wsKeys();
  ok(keys.length === 1, 'genau ein ws:-Record in der Cloud (' + keys.join(',') + ')');
  const rec = store.get(keys[0]);
  orgBucketId = rec && rec.data && rec.data.id;
  ok(rec && rec.data && rec.data.name === 'Neubau Musterstrasse', 'Record trägt den Eimer-Namen');
  ok(rec && rec.data.createdBy === 'u1' && rec.data.ownerOrgId === 'org_a', 'Besitz-Stempel createdBy + ownerOrgId');
  ok(page.errs.length === 0, 'keine pageerrors (A): ' + page.errs.join(' | '));
  await ctx.close();
}

console.log('— 2) Gerät B (iPad, gleicher User, leerer Cache): Eimer sichtbar — der Bugfall —');
{
  const { ctx, page } = await device('u1');
  const st = await page.evaluate(() => {
    const vis = window._wsHooks.pool().filter(window._wsHooks.canSee);
    return { n: vis.length, names: vis.map(b => b.name), sidebar: document.body.textContent.indexOf('Neubau Musterstrasse') >= 0 };
  });
  ok(st.n === 1 && st.names[0] === 'Neubau Musterstrasse', 'Eimer aus der Cloud geladen');
  ok(st.sidebar, 'Eimer erscheint im UI (Sidebar/Liste)');
  ok(page.errs.length === 0, 'keine pageerrors (B)');
  await ctx.close();
}

console.log('— 3) Sichtbarkeit: Kollege / fremde Org / persönlicher Eimer —');
{
  // persönlichen Eimer von u1 direkt in die Cloud legen
  store.set('workspace|ws:pers1', { data: { id: 'ws_pers1', name: 'Privater Eimer', type: 'private', ownerType: 'personal', ownerOrgId: null, createdBy: 'u1', accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] }, org: 'org_a', members: [], modules: [], activity: [], beteiligte: [], notes: [], objektId: null }, _lm: 1 });
  const { ctx, page } = await device('u2');   // Kollege, gleiche Org
  const st = await page.evaluate(() => {
    const vis = window._wsHooks.pool().filter(window._wsHooks.canSee);
    return { names: vis.map(b => b.name).sort(), poolN: window._wsHooks.pool().length };
  });
  ok(st.poolN === 2, 'Pool enthält beide Records (cross-org Cache)');
  ok(st.names.length === 1 && st.names[0] === 'Neubau Musterstrasse', 'Kollege sieht den Org-Eimer, NICHT den persönlichen');
  await ctx.close();

  const d3 = await device('u3');              // fremde Org
  const st3 = await d3.page.evaluate(() => window._wsHooks.pool().filter(window._wsHooks.canSee).length);
  ok(st3 === 0, 'fremde Org sieht keinen der Eimer');
  // Fremder erstellt+löscht nichts — sein save() darf fremde Records NICHT anfassen
  await d3.page.evaluate(() => { window._wsHooks.save(); window._wsHooks.flush(); });
  await d3.page.waitForTimeout(400);
  ok(wsKeys().length === 2, 'save() einer fremden Sitzung löscht keine fremden Records');
  await d3.ctx.close();
}

console.log('— 4) Migration: Alt-Blob → Records, Blob weg, keine Resurrection —');
{
  const legacy = [{ id: 'ws_alt1', name: 'Alter Eimer', type: 'project', shared: false, members: ['XY'], modules: [], activity: [], beteiligte: [], notes: [{ id: 'n1', title: 'S.1', body: 'Notiz' }], objektId: null, createdAt: '2026-01-01T00:00:00Z' }];
  const { ctx, page } = await device('u1', { ls: { gema_workspace_v1: legacy } });
  await page.waitForTimeout(400);
  const rec = store.get('workspace|ws:ws_alt1');
  ok(!!rec && rec.data && rec.data.name === 'Alter Eimer', 'Alt-Eimer als Record in der Cloud');
  ok(rec && rec.data.createdBy === 'u1', 'Migration stempelt createdBy (Cross-Device desselben Kontos)');
  ok(!(rec && rec.data.ownerOrgId), 'Migration stempelt ownerOrgId bewusst NICHT (bleibt privat)');
  const blobWeg = await page.evaluate(() => localStorage.getItem('gema_workspace_v1') === null);
  ok(blobWeg, 'Alt-Blob nach der Migration entfernt (Resurrection-Schutz)');
  const visN = await page.evaluate(() => window._wsHooks.pool().filter(window._wsHooks.canSee).length);
  ok(visN === 3, 'migrierter Eimer sofort sichtbar (Org + persönlich + Alt)');
  // Alt-Eimer löschen → darf auf einem frischen Gerät nicht wiederkommen
  // (der Blob ist real vom Gerät entfernt; ein page.reload würde ihn über
  // den addInitScript-Seed künstlich wieder anlegen — Test-Artefakt)
  await page.evaluate(() => { window._wsDoDelete('ws_alt1'); window._wsHooks.flush(); });
  await page.waitForTimeout(400);
  ok(!store.has('workspace|ws:ws_alt1'), 'Löschen entfernt den Cloud-Record');
  await ctx.close();
  const frisch = await device('u1');
  const nachReload = await frisch.page.evaluate(() => window._wsHooks.pool().some(b => b.id === 'ws_alt1'));
  ok(!nachReload, 'gelöschter Alt-Eimer ersteht auf frischem Gerät NICHT wieder auf');
  await frisch.ctx.close();
}

console.log('— 5) Löschen auf A → B sieht ihn nach Reload nicht mehr —');
{
  const a = await device('u1');
  await a.page.evaluate(id => { window._wsDoDelete(id); window._wsHooks.flush(); }, orgBucketId);
  await a.page.waitForTimeout(400);
  ok(!store.has('workspace|ws:' + orgBucketId), 'Cloud-Record nach Löschen weg');
  await a.ctx.close();
  const b = await device('u1');
  const noch = await b.page.evaluate((id) => window._wsHooks.pool().some(x => x.id === id), orgBucketId);
  ok(!noch, 'Gerät B sieht den gelöschten Eimer nicht mehr');
  await b.ctx.close();
}

console.log('— 6) index.html-Chips: Pool-Leser mit Sichtbarkeits-Filter —');
{
  store.set('workspace|ws:chip1', { data: { id: 'ws_chip1', name: 'Chip-Eimer', type: 'project', ownerType: 'org', ownerOrgId: 'org_a', createdBy: 'u1', accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] }, org: 'org_a', modules: [], notes: [], objektId: null }, _lm: 1 });
  store.set('workspace|ws:chipX', { data: { id: 'ws_chipX', name: 'Fremd-Eimer', type: 'project', ownerType: 'org', ownerOrgId: 'org_b', createdBy: 'u3', accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] }, org: 'org_b', modules: [], notes: [], objektId: null }, _lm: 1 });
  // Pool-Cache lokal vorlegen (index.html bindet den Pool nicht selbst).
  // Planer werden vom Rollen-Redirect auf den Workspace geschickt — der
  // Chip-Test läuft darum als Admin (bleibt auf index, workspace-read ok).
  const poolLs = [store.get('workspace|ws:chip1').data, store.get('workspace|ws:chipX').data, store.get('workspace|ws:pers1').data];
  const { ctx, page } = await device('u9', { file: 'index.html', ls: { gema_ws_pool_v1: JSON.stringify(poolLs) } });
  await page.waitForTimeout(700);
  const chips = await page.evaluate(() => {
    const el = document.getElementById('wsRecentBuckets');
    return { txt: el ? el.textContent : '', page: location.pathname };
  });
  ok(chips.page.indexOf('index') >= 0, 'Admin bleibt auf index.html (' + chips.page + ')');
  ok(chips.txt.indexOf('Chip-Eimer') >= 0, 'index-Chip zeigt den eigenen Org-Eimer');
  ok(chips.txt.indexOf('Fremd-Eimer') < 0, 'index-Chip zeigt fremde Org NICHT');
  ok(chips.txt.indexOf('Privater Eimer') < 0, 'index-Chip zeigt den persönlichen Eimer eines ANDEREN Users nicht');
  await ctx.close();
}

await browser.close(); server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' Checks bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
