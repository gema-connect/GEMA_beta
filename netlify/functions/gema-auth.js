/**
 * gema-auth.js — Server-seitige Auth + geschuetzte Auth-Collection-Writes
 * ═══════════════════════════════════════════════════════════════════════
 * Herzstueck von «GEMA Secure v1» (siehe SECURITY_RLS_ANLEITUNG.md):
 *
 *  - login:    prueft Zugangsdaten SERVER-seitig und stellt ein Supabase-
 *              kompatibles JWT (HS256, role=authenticated) aus. Damit
 *              greifen die RLS-Policies; der anon-Key allein kann nach
 *              Aktivierung von RLS keine Daten mehr lesen/schreiben.
 *  - persist_auth: alle Writes auf user:/org:/role:-Records laufen hier
 *              durch (Client-Interception in gema_sync.js). Die Function
 *              prueft die Berechtigung gegen den ECHTEN Datenbankstand
 *              (nicht gegen manipulierbare Client-Daten) und schreibt mit
 *              dem Service-Key. Passwort-Felder werden in geschuetzte
 *              cred:-Records verschoben (fuer die es KEINE RLS-Policy
 *              gibt → nur der Service-Key kommt heran).
 *  - register: Self-Service-Onboarding (neue Org + Admin-User) ohne Login.
 *  - activate: Einladungs-Aktivierung (User ohne Passwort setzt seines).
 *
 * Passwoerter: Der Client hasht historisch mit djb2 (schwach). Die Function
 * akzeptiert djb2-Werte als Transport, speichert aber scrypt-Hashes in
 * cred:-Records; bestehende User werden beim ersten Login lazy migriert
 * (djb2-Hash verschwindet aus dem user:-Payload).
 *
 * ENV (Netlify → Site settings → Environment variables):
 *   SUPABASE_SERVICE_KEY  service_role-Key (Settings → API)   [PFLICHT]
 *   GEMA_JWT_SECRET       Legacy JWT Secret (Settings → API)  [PFLICHT]
 *   SUPABASE_URL          optional (Default: Projekt-URL unten)
 *   GEMA_TOKEN_DAYS       optional, Token-Laufzeit (Default 30)
 *
 * Keine npm-Dependencies — nur node:crypto.
 */
'use strict';

const crypto = require('crypto');

const SB_URL = process.env.SUPABASE_URL || 'https://fjhbqjvaygvhievjgdtm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const JWT_SECRET = process.env.GEMA_JWT_SECRET || '';
const TOKEN_DAYS = parseInt(process.env.GEMA_TOKEN_DAYS || '30', 10) || 30;
const TABLE = 'gema_data';

// Rollen, die ein NICHT-Admin per Einladung in einer FREMDEN Org anlegen
// darf (Partner-Einladungen: Lieferanten, Pruefer, Garagisten, Unternehmer,
// Architekt/Bauherrschaft fuer Freigaben). role_admin ist NIE erlaubt.
const INVITE_ROLE_PREFIXES = [
  'role_lieferant', 'role_produktlieferant', 'role_pruefer',
  'role_leiterpruefer', 'role_garagist', 'role_unternehmer',
  'role_architekt', 'role_bauherrschaft'
];

// ── Supabase REST (Service-Key, umgeht RLS) ─────────────────────────────
async function sb(pathQs, opts) {
  const res = await fetch(SB_URL + '/rest/v1/' + pathQs, Object.assign({
    headers: Object.assign({
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    }, (opts && opts.headers) || {})
  }, opts || {}));
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Supabase ' + res.status + ': ' + t.slice(0, 200));
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
function q(s) { return encodeURIComponent(s); }

async function getRecord(dataKey) {
  const rows = await sb(TABLE + '?module_key=eq.auth&data_key=eq.' + q(dataKey) + '&select=payload');
  if (!rows || !rows.length) return null;
  const p = rows[0].payload || {};
  if (p.data != null) return p.data;
  if (p.v != null) { try { return typeof p.v === 'string' ? JSON.parse(p.v) : p.v; } catch (e) { return null; } }
  return null;
}
async function putRecord(dataKey, data) {
  await sb(TABLE + '?on_conflict=module_key%2Cdata_key', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ module_key: 'auth', data_key: dataKey, payload: { data: data, _lm: Date.now() } }])
  });
}
async function deleteRecordKey(dataKey) {
  await sb(TABLE + '?module_key=eq.auth&data_key=eq.' + q(dataKey), { method: 'DELETE' });
}
async function loadUsers() {
  const rows = await sb(TABLE + '?module_key=eq.auth&data_key=like.' + q('user:') + '*&select=data_key,payload');
  return (rows || []).map(r => (r.payload && r.payload.data) || null).filter(Boolean);
}

// ── Passwort-Hashing ─────────────────────────────────────────────────────
// Legacy-djb2 des Clients (gema_auth.js _hash) — nur zur Verifikation/als
// Transportformat akzeptiert, nie neu gespeichert.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) + str.charCodeAt(i); h = h & 0xffffffff; }
  return 'gh_' + Math.abs(h).toString(16) + '_' + str.length;
}
function looksLikeDjb2(v) { return typeof v === 'string' && /^gh_[0-9a-f]+_\d+$/.test(v); }
function scryptHash(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(secret, salt, 32).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}
function verifyCred(cred, passwordPlainOrDjb2) {
  if (!cred || !cred.hash) return false;
  if (cred.alg === 'djb2') {
    // cred.hash ist der djb2-Wert; Client schickt beim Login das Klartext-PW
    const asDjb2 = looksLikeDjb2(passwordPlainOrDjb2) ? passwordPlainOrDjb2 : djb2(passwordPlainOrDjb2);
    return timingSafeEq(cred.hash, asDjb2);
  }
  const parts = String(cred.hash).split('$'); // scrypt$salt$hash
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  // scrypt-Basis ist das, was der Client als «Passwort» uebergibt. Beim
  // Login ist das der Klartext; bei per Admin-UI gesetzten Passwoertern
  // kommt bereits djb2 an — dann wurde die cred auch AUS diesem djb2-Wert
  // erzeugt (cred.src==='djb2') und wir hashen denselben Wert.
  const base = cred.src === 'djb2' && !looksLikeDjb2(passwordPlainOrDjb2)
    ? djb2(passwordPlainOrDjb2) : passwordPlainOrDjb2;
  const test = crypto.scryptSync(base, parts[1], 32).toString('hex');
  return timingSafeEq(parts[2], test);
}
function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── JWT (HS256, Supabase-kompatibel) ─────────────────────────────────────
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest();
  return header + '.' + payload + '.' + b64url(sig);
}
function verifyJwt(token) {
  try {
    const [h, p, s] = String(token || '').split('.');
    if (!h || !p || !s) return null;
    const expect = b64url(crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest());
    if (!timingSafeEq(s, expect)) return null;
    const claims = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch (e) { return null; }
}
function mintToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const isAdmin = Array.isArray(user.roleIds) && user.roleIds.indexOf('role_admin') >= 0;
  return {
    token: signJwt({
      iss: 'gema', role: 'authenticated', sub: String(user.id),
      uid: String(user.id), org: String(user.orgId || ''), adm: isAdmin ? '1' : '0',
      iat: now, exp: now + TOKEN_DAYS * 86400
    }),
    exp: new Date((now + TOKEN_DAYS * 86400) * 1000).toISOString()
  };
}

function stripPassword(user) {
  const u = Object.assign({}, user);
  delete u.password;
  return u;
}
function isGemaAdmin(user) { return !!(user && Array.isArray(user.roleIds) && user.roleIds.indexOf('role_admin') >= 0); }
function hasAdminSubrole(user) {
  return !!(user && (user.roleIds || []).some(r => r === 'role_lieferant_admin' || r === 'role_produktlieferant_admin'));
}
function inviteRolesOk(roleIds) {
  return (roleIds || []).every(r => r !== 'role_admin' && INVITE_ROLE_PREFIXES.some(p => String(r).indexOf(p) === 0));
}
function noAdminRole(roleIds) { return (roleIds || []).indexOf('role_admin') < 0; }

// Passwort-Feld eines eingehenden user-Records in cred: verschieben.
async function absorbPassword(userData) {
  const pw = userData && userData.password;
  if (!pw) return stripPassword(userData || {});
  // Client schickt djb2 (Admin-UI/Profil) — als scrypt(djb2) speichern,
  // src merken, damit der Login den Klartext zuerst djb2-transformiert.
  const cred = looksLikeDjb2(pw)
    ? { alg: 'scrypt', src: 'djb2', hash: scryptHash(pw), setAt: new Date().toISOString() }
    : { alg: 'scrypt', src: 'plain', hash: scryptHash(pw), setAt: new Date().toISOString() };
  await putRecord('cred:' + userData.id, cred);
  return stripPassword(userData);
}

// ── Aktionen ─────────────────────────────────────────────────────────────
async function actionLogin(body) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) return resp(400, { error: 'username/password fehlen' });
  const users = await loadUsers();
  const user = users.find(u => u && u.active !== false && (
    (u.username && String(u.username).toLowerCase() === username) ||
    (u.profile && u.profile.email && String(u.profile.email).toLowerCase() === username)
  ));
  if (!user) return resp(401, { error: 'Zugangsdaten ungueltig' });

  const cred = await getRecord('cred:' + user.id);
  let ok = false;
  if (cred) {
    ok = verifyCred(cred, password);
  } else if (user.password) {
    // Legacy: djb2-Hash liegt noch im user-Payload → verifizieren und
    // lazy auf cred:(scrypt) migrieren, Hash aus dem Payload entfernen.
    ok = timingSafeEq(user.password, djb2(password));
    if (ok) {
      await putRecord('cred:' + user.id, { alg: 'scrypt', src: 'plain', hash: scryptHash(password), setAt: new Date().toISOString() });
      await putRecord('user:' + user.id, stripPassword(user));
    }
  }
  if (!ok) return resp(401, { error: 'Zugangsdaten ungueltig' });
  const t = mintToken(user);
  return resp(200, { ok: true, token: t.token, exp: t.exp, user: stripPassword(user) });
}

async function actionRegister(body) {
  const org = body.org, user = body.user;
  if (!org || !org.id || !user || !user.id || !user.username) return resp(400, { error: 'org/user unvollstaendig' });
  if (!user.password) return resp(400, { error: 'Passwort fehlt' });
  if (!noAdminRole(user.roleIds)) return resp(403, { error: 'role_admin nicht erlaubt' });
  const users = await loadUsers();
  const uname = String(user.username).toLowerCase();
  if (users.some(u => u && ((u.username && String(u.username).toLowerCase() === uname) ||
      (u.profile && u.profile.email && String(u.profile.email).toLowerCase() === uname)))) {
    return resp(409, { error: 'Benutzername bereits vergeben' });
  }
  if (await getRecord('org:' + org.id)) return resp(409, { error: 'Org-ID bereits vergeben' });
  if (user.orgId !== org.id) return resp(400, { error: 'user.orgId muss der neuen Org entsprechen' });
  org.admins = [user.id];
  await putRecord('org:' + org.id, org);
  await putRecord('user:' + user.id, await absorbPassword(user));
  const saved = stripPassword(user);
  const t = mintToken(saved);
  return resp(200, { ok: true, token: t.token, exp: t.exp, user: saved });
}

async function actionActivate(body) {
  const inviteToken = String(body.inviteToken || '');
  const password = String(body.password || '');
  if (!inviteToken || !password) return resp(400, { error: 'inviteToken/password fehlen' });
  // Matching wie GemaAuth.activateInvitation: user.einladung.token
  const users = await loadUsers();
  const user = users.find(u => u && u.einladung && u.einladung.token === inviteToken);
  if (!user || user.active === false) return resp(404, { error: 'Einladung ungueltig oder abgelaufen' });
  const cred = await getRecord('cred:' + user.id);
  if (cred || user.password || (user.einladung && user.einladung.passwortGesetzt)) {
    return resp(403, { error: 'Konto ist bereits aktiviert — bitte normal anmelden' });
  }
  // Legacy-Semantik replizieren (einladung-Status, Testphase, regData)
  const upd = Object.assign({}, user);
  upd.einladung = Object.assign({}, user.einladung, {
    angenommenAm: new Date().toISOString(), passwortGesetzt: true
  });
  const extra = (body.extra && typeof body.extra === 'object') ? body.extra : {};
  if (extra.name) upd.name = extra.name;
  if (upd.profile) {
    upd.profile = Object.assign({}, upd.profile);
    if (extra.firma) upd.profile.firma = extra.firma;
    if (extra.person || extra.name) upd.profile.person = extra.name || extra.person;
  }
  const testEnde = new Date(); testEnde.setDate(testEnde.getDate() + 30);
  upd.abo = { typ: 'testphase', testphaseEnde: testEnde.toISOString().split('T')[0] };
  await putRecord('cred:' + user.id, { alg: 'scrypt', src: looksLikeDjb2(password) ? 'djb2' : 'plain', hash: scryptHash(password), setAt: new Date().toISOString() });
  await putRecord('user:' + user.id, stripPassword(upd));
  const saved = stripPassword(upd);
  const t = mintToken(saved);
  return resp(200, { ok: true, token: t.token, exp: t.exp, user: saved });
}

// persist_auth: {records:[{key,data}...], deletes:[key...]} — nur mit Token.
async function actionPersistAuth(body, claims) {
  if (!claims) return resp(401, { error: 'Nicht angemeldet' });
  const requester = await getRecord('user:' + claims.uid);
  if (!requester || requester.active === false) return resp(401, { error: 'Konto inaktiv' });
  const admin = isGemaAdmin(requester);

  const records = Array.isArray(body.records) ? body.records : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes : [];
  if (records.length + deletes.length === 0) return resp(400, { error: 'Nichts zu speichern' });
  if (records.length + deletes.length > 200) return resp(400, { error: 'Zu viele Records' });

  // Org-Admin-Status des Requesters (fuer Regeln unten)
  let requesterOrgAdmins = [];
  if (requester.orgId) {
    const ro = await getRecord('org:' + requester.orgId);
    requesterOrgAdmins = (ro && ro.admins) || [];
  }
  const isOrgAdmin = admin || requesterOrgAdmins.indexOf(requester.id) >= 0 || hasAdminSubrole(requester);

  // ── Autorisierung pro Record ──
  for (const rec of records) {
    const key = String(rec.key || '');
    const data = rec.data;
    if (!data || typeof data !== 'object') return resp(400, { error: 'Record ohne Daten: ' + key });
    if (key.indexOf('cred:') === 0) return resp(403, { error: 'cred:-Records sind geschuetzt' });

    if (key.indexOf('user:') === 0) {
      const targetId = key.slice(5);
      if (String(data.id) !== targetId) return resp(400, { error: 'user.id passt nicht zum Key' });
      const existing = await getRecord(key);
      if (admin) continue;
      if (existing) {
        if (targetId === requester.id) {
          // Selbst-Update: Rechte/Org/Aktiv-Status bleiben wie in der DB
          if (JSON.stringify(data.roleIds || []) !== JSON.stringify(existing.roleIds || []) ||
              String(data.orgId || '') !== String(existing.orgId || '') ||
              (data.active === false) !== (existing.active === false)) {
            return resp(403, { error: 'Eigene Rollen/Org/Status koennen nicht geaendert werden' });
          }
        } else if (isOrgAdmin && String(existing.orgId) === String(requester.orgId)) {
          // Org-Admin verwaltet die eigene Org — role_admin bleibt tabu
          if (!noAdminRole(data.roleIds)) return resp(403, { error: 'role_admin kann nur der GEMA-Admin vergeben' });
          if (String(data.orgId) !== String(requester.orgId)) return resp(403, { error: 'User kann nicht in fremde Org verschoben werden' });
        } else {
          return resp(403, { error: 'Keine Berechtigung fuer ' + key });
        }
      } else {
        // Neuer User
        if (isOrgAdmin && String(data.orgId) === String(requester.orgId)) {
          if (!noAdminRole(data.roleIds)) return resp(403, { error: 'role_admin kann nur der GEMA-Admin vergeben' });
        } else if (inviteRolesOk(data.roleIds)) {
          // Partner-Einladung in fremde/neue Org (Lieferant, Pruefer, …)
        } else {
          return resp(403, { error: 'Keine Berechtigung, diesen User anzulegen' });
        }
      }
    } else if (key.indexOf('org:') === 0) {
      const targetId = key.slice(4);
      if (String(data.id) !== targetId) return resp(400, { error: 'org.id passt nicht zum Key' });
      const existing = await getRecord(key);
      if (admin) continue;
      if (existing) {
        const targetAdmins = (existing.admins || []);
        const may = String(requester.orgId) === targetId && (targetAdmins.indexOf(requester.id) >= 0 || hasAdminSubrole(requester));
        if (!may) return resp(403, { error: 'Keine Berechtigung fuer ' + key });
      }
      // Neue Orgs sind erlaubt (Partner-Einladung legt die Firma des
      // Partners an) — additive Operation, bestehende Daten unberuehrt.
    } else if (key.indexOf('role:') === 0) {
      if (!admin) return resp(403, { error: 'Rollen kann nur der GEMA-Admin aendern' });
    } else {
      // Legacy-Keys (alte Blob-Rows wie gema_users_v1) — nur GEMA-Admin
      if (!admin) return resp(403, { error: 'Unbekannter Auth-Key: ' + key });
    }
  }
  for (const key of deletes) {
    const k = String(key);
    if (!admin) return resp(403, { error: 'Loeschen in der Auth-Collection kann nur der GEMA-Admin' });
    if (k.indexOf('cred:') === 0) return resp(403, { error: 'cred:-Records sind geschuetzt' });
  }

  // ── Schreiben (Passwoerter absorbieren) ──
  for (const rec of records) {
    const key = String(rec.key);
    let data = rec.data;
    if (key.indexOf('user:') === 0) data = await absorbPassword(data);
    await putRecord(key, data);
  }
  for (const key of deletes) {
    await deleteRecordKey(String(key));
    if (String(key).indexOf('user:') === 0) await deleteRecordKey('cred:' + String(key).slice(5));
  }
  return resp(200, { ok: true, written: records.length, deleted: deletes.length });
}

// ── HTTP-Geruest ─────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
function resp(status, obj) {
  return { statusCode: status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify(obj) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return resp(405, { error: 'POST only' });
  if (!SERVICE_KEY || !JWT_SECRET) {
    return resp(500, { error: 'Function nicht konfiguriert: SUPABASE_SERVICE_KEY / GEMA_JWT_SECRET als Netlify-Env-Variablen setzen (siehe SECURITY_RLS_ANLEITUNG.md)' });
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { error: 'Ungueltiges JSON' }); }
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const claims = verifyJwt(auth.replace(/^Bearer\s+/i, ''));
  try {
    switch (body.action) {
      case 'login': return await actionLogin(body);
      case 'register': return await actionRegister(body);
      case 'activate': return await actionActivate(body);
      case 'persist_auth': return await actionPersistAuth(body, claims);
      case 'whoami': return claims ? resp(200, { ok: true, claims }) : resp(401, { error: 'Kein gueltiges Token' });
      default: return resp(400, { error: 'Unbekannte action' });
    }
  } catch (e) {
    console.error('[gema-auth]', e);
    return resp(500, { error: 'Serverfehler: ' + (e.message || 'unbekannt') });
  }
};
