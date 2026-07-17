// Harness für den Rollen×Modul-Matrix-Test (scripts/rolematrix_test.mjs).
// Server (Repo-Root), Route-Blocking externer Hosts, Supabase-REST-Mock (→ []),
// synthetische Testseite /__rmtest.html (lädt nur gema_sync.js + gema_auth.js).
//
// Benötigt: playwright-core + Chromium. Ausführung siehe rolematrix_test.mjs.
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // scripts/.. = Repo-Root
export const PORT = 8899;
export const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Minimalseite: nicht login-only (Key __rmtest), nicht in FILE_MAP → für
// Nicht-Admins greift das Modul-Gating (Body wird zu "Kein Zugriff"), aber
// window.GemaAuth bleibt definiert → can() ist in jedem Fall abfragbar.
// KEIN Redirect (Redirect passiert nur auf _isLoginOnly-Seiten).
const RMTEST_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>rmtest</title></head>
<body><div id="app">rmtest</div>
<script src="/gema_sync.js"></script>
<script src="/gema_auth.js"></script>
</body></html>`;

export function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = req.url.split('?')[0];
      if (p === '/') p = '/index.html';
      const data = await readFile(join(ROOT, p));
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) { res.writeHead(404); res.end('nf'); }
  });
  return new Promise(r => server.listen(PORT, () => r(server)));
}

// Route-Setup: eigene Seiten durchlassen, /__rmtest.html fulfillen,
// Supabase/Functions/externe Hosts mocken bzw. blocken.
export async function wireRoutes(ctx) {
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.indexOf(BASE + '/__rmtest.html') === 0) {
      return route.fulfill({ contentType: 'text/html', body: RMTEST_HTML });
    }
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    }
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
      if (route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: '[]' });
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();

// Fake-JWT für die Test-Session (GEMA Secure v1: echte Logins tragen ein
// Token; ohne Token behandelt gema_sync leere Cloud-Antworten als nicht
// vertrauenswürdig und zeigt den Neu-anmelden-Banner). iat = jetzt →
// _maybeRefreshToken bleibt still (Token jünger als 24h).
function _testJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' +
         b64({ iat: now, exp: now + 30 * 86400, uid: 'u_test', org: 'org_test', role: 'authenticated' }) + '.testsig';
}

// localStorage-Seed für einen Test-User mit gegebenen roleIds.
// opts: { roles? (überschreibt gema_roles_v1), studentMods?, orgKat?, orgAdmins?, tokenlos? }
export function seed(roleIds, opts) {
  opts = opts || {};
  const s = {
    gema_orgs_v1: [{ id: 'org_test', name: 'Testfirma AG', kategorie: opts.orgKat || 'sanitaerplaner', kategorien: [opts.orgKat || 'sanitaerplaner'], admins: opts.orgAdmins || ['u_test'], active: true }],
    gema_users_v1: [{ id: 'u_test', username: 'u@test.ch', name: 'Test User', roleIds: roleIds, orgId: 'org_test', active: true, profile: { email: 'u@test.ch' } }],
    gema_session_v1: opts.tokenlos ? { userId: 'u_test', expires: FUTURE } : { userId: 'u_test', expires: FUTURE, token: _testJwt() }
  };
  if (opts.roles) s.gema_roles_v1 = opts.roles;
  if (opts.studentMods) s.gema_student_mods_v1 = { userId: 'u_test', mods: opts.studentMods, exams: {}, ts: Date.now() };
  return s;
}

export async function newPage(browser, seedObj) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seedObj);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/Cannot read|null|undefined/.test(e.message)) console.log('  [pageerror]', e.message.slice(0, 120)); });
  return { ctx, page };
}
