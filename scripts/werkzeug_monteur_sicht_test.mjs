// Monteur-Sicht in if_werkzeug: Berechtigungs-Meldung statt leerer Liste
// (User-Wunsch 27.07.2026) + native Handy-Ansicht mit derselben Rollen-Sicht
// wie die klassische Liste (natTools filterte vorher NICHT auf eigene Geräte).
//
// Abgedeckt:
//  A) Desktop-Karten + Tabelle: 🔒-Meldung erklärt die Rollen-Sicht, nennt den
//     Org-Gesamtbestand und den Weg zur Magaziner-Rolle
//  B) Monteur MIT Zuweisung: normale Karte, keine Meldung
//  C) Magaziner: unverändert voller Bestand
//  D) Native Phone-Ansicht: Meldung + nur eigene Geräte (Leck behoben)
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_monteur_sicht_test.mjs
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

const store = new Map();
function handleSb(route) {
  const req = route.request(), url = req.url(), method = req.method();
  const mkm = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const mk = mkm ? decodeURIComponent(mkm) : null;
  if (method === 'GET') {
    const rows = [];
    const eq = url.match(/data_key=eq\.([^&]+)/);
    const like = url.match(/data_key=like\.([^&]+)/);
    const inm = url.match(/data_key=in\.\(([^)]*)\)/);
    if (mk && eq) { const dk = decodeURIComponent(eq[1]); if (store.has(mk + '|' + dk)) rows.push({ data_key: dk, payload: store.get(mk + '|' + dk) }); }
    else if (mk && inm) { decodeURIComponent(inm[1]).split(',').map(s => s.replace(/^"|"$/g, '')).forEach(dk => { if (store.has(mk + '|' + dk)) rows.push({ data_key: dk, payload: store.get(mk + '|' + dk) }); }); }
    else if (mk && like) { const pf = decodeURIComponent(like[1]).replace(/\*$/, ''); for (const [k, v] of store) { const i = k.indexOf('|'); if (k.slice(0, i) === mk && k.slice(i + 1).startsWith(pf)) rows.push({ data_key: k.slice(i + 1), payload: v }); } rows.sort((a,b)=>a.data_key<b.data_key?-1:1); }
    else if (mk) { for (const [k, v] of store) { const i = k.indexOf('|'); if (k.slice(0, i) === mk) rows.push({ data_key: k.slice(i + 1), payload: v }); } }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(r => { if (r && r.module_key && r.data_key) store.set(r.module_key + '|' + r.data_key, r.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') { const eq = url.match(/data_key=eq\.([^&]+)/); if (mk && eq) { const dk = decodeURIComponent(eq[1]); store.delete(mk + '|' + dk); } return route.fulfill({ status: 204, contentType: 'application/json', body: '' }); }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTUiLCJvcmciOiJvcmdfYSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig';
const ORGS = [{ id: 'org_a', name: 'Jäggi Vollmer GmbH', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u8'], active: true }];
const USERS = [
  { id: 'u5', username: 'k@t.ch', name: 'Kaspar Fluck', roleIds: ['role_monteur'], orgId: 'org_a', active: true, profile: { email: 'k@t.ch' } },
  { id: 'u8', username: 'm@t.ch', name: 'Martina Müller', roleIds: ['role_magaziner'], orgId: 'org_a', active: true, profile: { email: 'm@t.ch' } }
];
function mkTool(id, name, extra) {
  return Object.assign({ id, name, cat: 'elektro', brand: 'Hilti', model: 'X', bought: '2025-01-01', orgId: 'org_a' }, extra || {});
}
function seedTools(assigned) {
  store.clear();
  const tools = [mkTool('t1', 'Bohrhammer', assigned ? { zugewiesenAn: { typ: 'user', userId: 'u5', name: 'Kaspar Fluck', seit: '2026-07-01' } } : null), mkTool('t2', 'Sauger'), mkTool('t3', 'Laser')];
  tools.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: t, _lm: 1 }));
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
async function device(userId, opts) {
  const ctx = await browser.newContext(Object.assign({}, opts && opts.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  // Die App-Ansicht ist seit 24.08.2026 NICHT mehr der Phone-Standard — wer sie
  // testen will, muss sie wie ein echter Nutzer in sys_profil einschalten:
  // profile.nativeAnsicht am User + der von sys_profil mitgeschriebene Cache.
  const nativ = !!(opts && opts.nativ);
  const users = nativ
    ? USERS.map(u => u.id === userId ? Object.assign({}, u, { profile: Object.assign({}, u.profile, { nativeAnsicht: true }) }) : u)
    : USERS;
  const seed = { gema_orgs_v1: ORGS, gema_users_v1: users, gema_session_v1: { token: JWT, userId, expires: FUTURE }, gema_coachmarks_done_if_werkzeug: 'done' };
  if (nativ) seed.gema_native_view_v1 = 'native';
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html' + (opts && opts.q ? opts.q : ''), { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}

console.log('— A) Desktop: Monteur ohne Zuweisung → Berechtigungs-Meldung —');
{
  seedTools(false);
  const a = await device('u5');
  await a.page.waitForTimeout(2200);
  const grid = await a.page.evaluate(() => (document.getElementById('cardGrid') || {}).innerHTML || '');
  ok(grid.indexOf('Deine Rolle zeigt nur Werkzeuge') >= 0, 'Karten-Ansicht erklärt die Rollen-Sicht');
  ok(grid.indexOf('3 Geräte') >= 0, 'Gesamtbestand der Firma wird genannt (3 Geräte)');
  ok(grid.indexOf('Magaziner-Rolle zuzuweisen') >= 0, 'Hinweis auf Rollen-Zuweisung');
  ok(grid.indexOf('🔒') >= 0, 'Schloss-Icon statt generischem Leerzustand');
  // Tabellen-Ansicht
  await a.page.evaluate(() => { if (typeof setView === 'function') setView('table'); else { currentView = 'table'; renderList(); } });
  await a.page.waitForTimeout(300);
  const tb = await a.page.evaluate(() => (document.getElementById('toolTbody') || {}).innerHTML || '');
  ok(tb.indexOf('Deine Rolle zeigt nur Werkzeuge') >= 0, 'Tabellen-Ansicht zeigt dieselbe Meldung');
  ok(a.page.errs.length === 0, 'keine pageerrors (Desktop): ' + a.page.errs.join('|').slice(0, 120));
  await a.ctx.close();
}

console.log('— B) Desktop: mit Zuweisung → normale Karte, keine Meldung —');
{
  seedTools(true);
  const a = await device('u5');
  await a.page.waitForTimeout(2200);
  const r = await a.page.evaluate(() => ({
    grid: (document.getElementById('cardGrid') || {}).innerHTML || '',
    n: (typeof getFiltered === 'function') ? getFiltered().length : -1
  }));
  ok(r.n === 1, 'Monteur sieht genau sein zugewiesenes Werkzeug (1)');
  ok(r.grid.indexOf('Bohrhammer') >= 0 && r.grid.indexOf('Deine Rolle zeigt nur') < 0, 'Karte statt Meldung');
  await a.ctx.close();
}

console.log('— C) Magaziner: unverändert voller Bestand —');
{
  seedTools(false);
  const a = await device('u8');
  await a.page.waitForTimeout(2200);
  const n = await a.page.evaluate(() => (typeof getFiltered === 'function') ? getFiltered().length : -1);
  ok(n === 3, 'Magaziner sieht alle 3 Geräte');
  await a.ctx.close();
}

console.log('— D) Handy (native Ansicht eingeschaltet): Monteur-Sicht + Meldung —');
{
  seedTools(false);
  const a = await device('u5', { phone: true, nativ: true });
  await a.page.waitForTimeout(2600);
  const html = await a.page.evaluate(() => document.body.innerHTML);
  const nativeOn = await a.page.evaluate(() => document.documentElement.classList.contains('gn-native-on'));
  ok(nativeOn, 'native Ansicht aktiv (Phone, in den Einstellungen eingeschaltet)');
  ok(html.indexOf('Deine Rolle zeigt nur Werkzeuge') >= 0, 'native Liste erklärt die Rollen-Sicht');
  ok(html.indexOf('data-nat-id="t2"') < 0 && html.indexOf('data-nat-id="t3"') < 0, 'fremde Geräte erscheinen NICHT in der nativen Liste (Leck behoben)');
  if (html.indexOf('Sauger') >= 0) { const i = html.indexOf('Sauger'); console.log('KONTEXT:', html.slice(Math.max(0,i-300), i+80).replace(/\s+/g,' ')); }
  await a.ctx.close();

  seedTools(true);
  const b = await device('u5', { phone: true, nativ: true });
  await b.page.waitForTimeout(2600);
  const h2 = await b.page.evaluate(() => document.body.innerHTML);
  ok(h2.indexOf('data-nat-id="t1"') >= 0, 'zugewiesenes Gerät erscheint in der nativen Liste');
  ok(h2.indexOf('data-nat-id="t2"') < 0, 'nicht zugewiesene Geräte bleiben ausgeblendet');
  ok(b.page.errs.length === 0, 'keine pageerrors (Phone): ' + b.page.errs.join('|').slice(0, 120));
  await b.ctx.close();
}

await browser.close(); server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' Checks bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
