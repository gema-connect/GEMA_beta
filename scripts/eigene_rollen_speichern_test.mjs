// Node-Test der Netlify-Function gema-auth.js → persist_auth (Selbst-Update)
//
// Bugreport 27.08.2026: «wenn ich bei mir selber eine Rolle hinzufüge oder
// entferne wird dies nicht gespeichert.»
//
// Ursache: der Selbst-Update-Zweig in actionPersistAuth (Security-Review S5)
// friert ALLE Felder ausser {name,profile,avatar,einstellungen,password} auf
// dem DB-Stand ein — auch roleIds. Ein Org-Admin, der in sys_admin die
// eigenen Rollen ändert, bekommt darum HTTP 200 (grüner Toast «gespeichert»),
// während der Server die Rollen stillschweigend verwirft. Beim nächsten
// Cloud-Pull ist die Änderung weg.
//
// Regel nach dem Fix: der Selbst-Update-Zweig richtet sich nach der
// Berechtigung des Requesters —
//   • GEMA-Admin  : alles (läuft schon vorher über `if (admin) continue`)
//   • Org-Admin   : darf an sich selbst dieselben Rollen setzen wie an
//                   Mitarbeitenden der eigenen Org (role_admin bleibt tabu)
//   • alle anderen: roleIds bleiben eingefroren
// Die S5-Eskalationsfelder (planerPremium/abo/lieferantId/gastZugaenge,
// orgId, active) bleiben in JEDEM Selbst-Update eingefroren.
//
// Ausführen: node scripts/eigene_rollen_speichern_test.mjs
import { createRequire } from 'module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);

process.env.SUPABASE_SERVICE_KEY = 'eyJtest_service_key';
process.env.SUPABASE_URL = 'https://mock.supabase.local';
process.env.GEMA_JWT_SECRET = 'test_jwt_secret_fuer_den_node_test';

let n = 0, fail = 0;
function t(name, cond, extra) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ ' + name + (extra != null ? ' — ' + String(extra).slice(0, 300) : '')); }
}

// ── In-Memory-Tabelle (gema_data, module_key=auth) ──────────────────────
let tabelle = {};   // data_key → data
function setzeStand(users, orgs) {
  tabelle = {};
  users.forEach(u => { tabelle['user:' + u.id] = JSON.parse(JSON.stringify(u)); });
  (orgs || []).forEach(o => { tabelle['org:' + o.id] = JSON.parse(JSON.stringify(o)); });
}

global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  const ok = body => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });

  if (method === 'GET') {
    const eq = u.match(/data_key=eq\.([^&]+)/);
    if (eq) {
      const key = decodeURIComponent(eq[1]);
      const d = tabelle[key];
      return ok(d ? [{ data_key: key, payload: { data: JSON.parse(JSON.stringify(d)) } }] : []);
    }
    const like = u.match(/data_key=like\.([^&]+)/);
    if (like) {
      const pre = decodeURIComponent(like[1]).replace(/\*$/, '');
      return ok(Object.keys(tabelle).filter(k => k.indexOf(pre) === 0)
        .map(k => ({ data_key: k, payload: { data: JSON.parse(JSON.stringify(tabelle[k])) } })));
    }
    return ok([]);
  }
  if (method === 'POST') {
    JSON.parse(opts.body).forEach(r => { tabelle[r.data_key] = r.payload.data; });
    return ok([]);
  }
  if (method === 'DELETE') {
    const eq = u.match(/data_key=eq\.([^&]+)/);
    if (eq) delete tabelle[decodeURIComponent(eq[1])];
    return ok([]);
  }
  return ok([]);
};

const { handler } = require('../netlify/functions/gema-auth.js');

// JWT exakt wie mintToken() der Function (HS256, dasselbe Secret)
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function token(user) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'gema', role: 'authenticated', sub: String(user.id), uid: String(user.id),
    org: String(user.orgId || ''), adm: (user.roleIds || []).indexOf('role_admin') >= 0 ? '1' : '0',
    iat: now, exp: now + 3600
  };
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64url(JSON.stringify(claims));
  const s = b64url(crypto.createHmac('sha256', process.env.GEMA_JWT_SECRET).update(h + '.' + p).digest());
  return h + '.' + p + '.' + s;
}
async function persist(alsUser, records, deletes) {
  const r = await handler({
    httpMethod: 'POST',
    headers: { authorization: 'Bearer ' + token(alsUser) },
    body: JSON.stringify({ action: 'persist_auth', records: records, deletes: deletes || [] })
  });
  return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
}
const rollenIn_DB = id => (tabelle['user:' + id] || {}).roleIds || [];

// ── Ausgangslage ────────────────────────────────────────────────────────
const ORG_A = { id: 'org_a', name: 'Muster Haustechnik AG', admins: ['u_orga'] };
const ORG_B = { id: 'org_b', name: 'Fremde AG', admins: [] };
const GEMA_ADMIN = { id: 'u_super', username: 'admin@gema.ch', name: 'GEMA Admin', roleIds: ['role_admin'], active: true, orgId: 'org_a' };
const ORG_ADMIN  = { id: 'u_orga',  username: 'chef@muster.ch', name: 'Chefin',     roleIds: ['role_planer'], active: true, orgId: 'org_a' };
const MONTEUR    = { id: 'u_mont',  username: 'mario@muster.ch', name: 'Mario',     roleIds: ['role_monteur'], active: true, orgId: 'org_a' };
const alleUser = () => [GEMA_ADMIN, ORG_ADMIN, MONTEUR];
const kopie = id => JSON.parse(JSON.stringify(tabelle['user:' + id]));
const reset = () => setzeStand(alleUser(), [ORG_A, ORG_B]);

console.log('\n═══ persist_auth: eigene Rollen ändern ═══\n');

// ── 1) GEMA-Admin an sich selbst (Regressionsschutz) ────────────────────
console.log('— GEMA-Admin —');
{
  reset();
  const me = kopie('u_super'); me.roleIds = ['role_admin', 'role_spengler'];
  const r = await persist(GEMA_ADMIN, [{ key: 'user:u_super', data: me }]);
  t('Rolle hinzufügen → HTTP 200', r.status === 200, r.status + ' ' + JSON.stringify(r.body));
  t('Rolle steht in der Datenbank', rollenIn_DB('u_super').indexOf('role_spengler') >= 0, rollenIn_DB('u_super'));
}
{
  reset();
  const me = kopie('u_super'); me.roleIds = ['role_admin'];
  tabelle['user:u_super'].roleIds = ['role_admin', 'role_spengler'];
  await persist(GEMA_ADMIN, [{ key: 'user:u_super', data: me }]);
  t('Rolle entfernen greift', rollenIn_DB('u_super').indexOf('role_spengler') < 0, rollenIn_DB('u_super'));
}

// ── 2) Org-Admin an sich selbst (der gemeldete Fall) ────────────────────
console.log('\n— Org-Admin an sich selbst —');
{
  reset();
  const me = kopie('u_orga'); me.roleIds = ['role_planer', 'role_magaziner'];
  const r = await persist(ORG_ADMIN, [{ key: 'user:u_orga', data: me }]);
  t('Rolle hinzufügen → HTTP 200', r.status === 200, r.status + ' ' + JSON.stringify(r.body));
  t('Rolle steht in der Datenbank', rollenIn_DB('u_orga').indexOf('role_magaziner') >= 0, rollenIn_DB('u_orga'));
}
{
  reset();
  tabelle['user:u_orga'].roleIds = ['role_planer', 'role_magaziner'];
  const me = kopie('u_orga'); me.roleIds = ['role_planer'];
  await persist(ORG_ADMIN, [{ key: 'user:u_orga', data: me }]);
  t('Rolle entfernen greift', rollenIn_DB('u_orga').join() === 'role_planer', rollenIn_DB('u_orga'));
}
{
  reset();
  const me = kopie('u_orga'); me.name = 'Chefin neu'; me.profile = { email: 'chef@muster.ch', telefon: '079' };
  await persist(ORG_ADMIN, [{ key: 'user:u_orga', data: me }]);
  t('Profilfelder weiterhin änderbar', (tabelle['user:u_orga'].name === 'Chefin neu'
    && tabelle['user:u_orga'].profile.telefon === '079'), JSON.stringify(tabelle['user:u_orga']));
}

// ── 3) Grenzen des Org-Admins ───────────────────────────────────────────
console.log('\n— Grenzen (Org-Admin) —');
{
  reset();
  const me = kopie('u_orga'); me.roleIds = ['role_planer', 'role_admin'];
  const r = await persist(ORG_ADMIN, [{ key: 'user:u_orga', data: me }]);
  t('role_admin an sich selbst → 403', r.status === 403, r.status + ' ' + JSON.stringify(r.body));
  t('role_admin NICHT in der Datenbank', rollenIn_DB('u_orga').indexOf('role_admin') < 0, rollenIn_DB('u_orga'));
}
{
  reset();
  const me = kopie('u_orga'); me.orgId = 'org_b'; me.roleIds = ['role_planer', 'role_magaziner'];
  await persist(ORG_ADMIN, [{ key: 'user:u_orga', data: me }]);
  t('Wechsel in fremde Org greift nicht', String(tabelle['user:u_orga'].orgId) === 'org_a', tabelle['user:u_orga'].orgId);
}
{
  reset();
  const me = kopie('u_orga'); me.active = false;
  await persist(ORG_ADMIN, [{ key: 'user:u_orga', data: me }]);
  t('Selbst-Deaktivierung greift nicht (kein Aussperren)', tabelle['user:u_orga'].active !== false, tabelle['user:u_orga'].active);
}
{
  reset();
  const me = kopie('u_orga');
  me.roleIds = ['role_planer', 'role_magaziner'];
  me.planerPremium = true; me.abo = { typ: 'premium' };
  me.lieferantId = 'lief_fremd'; me.gastZugaenge = [{ orgId: 'org_b', status: 'aktiv' }];
  await persist(ORG_ADMIN, [{ key: 'user:u_orga', data: me }]);
  const db = tabelle['user:u_orga'];
  t('Rollen greifen, Eskalationsfelder bleiben eingefroren (S5)',
    db.roleIds.indexOf('role_magaziner') >= 0 && !db.planerPremium && !db.abo && !db.lieferantId && !db.gastZugaenge,
    JSON.stringify(db));
}
{
  reset();
  const ziel = kopie('u_mont'); ziel.roleIds = ['role_monteur', 'role_spengler'];
  await persist(ORG_ADMIN, [{ key: 'user:u_mont', data: ziel }]);
  t('Rollen von Mitarbeitenden weiterhin änderbar', rollenIn_DB('u_mont').indexOf('role_spengler') >= 0, rollenIn_DB('u_mont'));
}

// ── 4) Benutzer OHNE Admin-Rechte (S5 bleibt) ───────────────────────────
console.log('\n— Benutzer ohne Admin-Rechte —');
{
  reset();
  const me = kopie('u_mont'); me.roleIds = ['role_monteur', 'role_planer']; me.name = 'Mario neu';
  const r = await persist(MONTEUR, [{ key: 'user:u_mont', data: me }]);
  t('Selbst-Save → HTTP 200 (Profil geht durch)', r.status === 200, r.status);
  t('eigene Rollen bleiben eingefroren', rollenIn_DB('u_mont').join() === 'role_monteur', rollenIn_DB('u_mont'));
  t('Name wurde übernommen', tabelle['user:u_mont'].name === 'Mario neu', tabelle['user:u_mont'].name);
}
{
  reset();
  const me = kopie('u_mont'); me.planerPremium = true; me.abo = { typ: 'premium' }; me.lieferantId = 'lief_x';
  await persist(MONTEUR, [{ key: 'user:u_mont', data: me }]);
  const db = tabelle['user:u_mont'];
  t('planerPremium/abo/lieferantId bleiben eingefroren', !db.planerPremium && !db.abo && !db.lieferantId, JSON.stringify(db));
}
{
  reset();
  const fremd = kopie('u_orga'); fremd.roleIds = ['role_planer', 'role_admin'];
  const r = await persist(MONTEUR, [{ key: 'user:u_orga', data: fremd }]);
  t('fremder Benutzer → 403', r.status === 403, r.status + ' ' + JSON.stringify(r.body));
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks bestanden') + '\n');
process.exit(fail ? 1 : 0);
