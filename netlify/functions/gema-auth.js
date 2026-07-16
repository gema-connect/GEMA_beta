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

// Selbst-Registrierung (Pilot-Sperre): standardmaessig AUS. Konten legt der
// GEMA-Administrator an; Einladungs-Aktivierung (activate) ist NICHT betroffen.
// Zum Oeffnen die jeweilige Env auf '1' setzen (Netlify → Environment).
const REGISTRATION_OPEN = process.env.GEMA_REGISTRATION_OPEN === '1';
const STUDENT_REGISTRATION_OPEN = process.env.GEMA_STUDENT_REGISTRATION_OPEN === '1';

// Rollen, die ein NICHT-Admin per Einladung in einer FREMDEN Org anlegen
// darf (Partner-Einladungen: Lieferanten, Pruefer, Garagisten, Unternehmer,
// Architekt/Bauherrschaft fuer Freigaben). role_admin ist NIE erlaubt.
const INVITE_ROLE_PREFIXES = [
  'role_lieferant', 'role_produktlieferant', 'role_pruefer',
  'role_leiterpruefer', 'role_garagist', 'role_unternehmer',
  'role_architekt', 'role_bauherrschaft'
];

// ── Supabase REST (Service-Key, umgeht RLS) ─────────────────────────────
// Akzeptiert BEIDE Supabase-Key-Formate: den Legacy-service_role-JWT
// (eyJ…) und die neuen «Secret keys» (sb_secret_…). Neue Keys sind keine
// JWTs — sie duerfen NICHT als Authorization: Bearer gesendet werden
// (PostgREST wuerde 401 werfen), der apikey-Header allein genuegt.
function sbHeaders() {
  const h = { 'apikey': SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.indexOf('eyJ') === 0) h['Authorization'] = 'Bearer ' + SERVICE_KEY;
  return h;
}
async function sb(pathQs, opts) {
  opts = opts || {};
  // KRITISCH — Header-Merge ZULETZT: frueher ueberschrieb Object.assign(
  // {headers: merged}, opts) die gemergten Header wieder mit opts.headers,
  // sobald ein Aufrufer eigene Header mitgab (putRecord: Prefer). Der
  // apikey fiel weg → Supabase 401 «No API key found in request» — ALLE
  // Schreib-Aktionen (Login-Cred-Migration, Registrierung, persist_auth)
  // schlugen fehl, Lese-Aktionen liefen normal.
  const fo = Object.assign({}, opts, {
    headers: Object.assign(sbHeaders(), opts.headers || {})
  });
  const res = await fetch(SB_URL + '/rest/v1/' + pathQs, fo);
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
  // Beide Payload-Formen tolerieren: {data} (per-Record) und {v} (Alt-Blob)
  return (rows || []).map(r => {
    const p = (r && r.payload) || {};
    if (p.data != null) return p.data;
    if (p.v != null) { try { return typeof p.v === 'string' ? JSON.parse(p.v) : p.v; } catch (e) { return null; } }
    return null;
  }).filter(Boolean);
}
// Generische Modul-Records (fuer register_student: Klassen-Pool 'schule',
// Notifikationen 'notify') — gleiche Payload-Form wie putRecord.
async function loadModuleCollection(moduleKey, prefix) {
  const rows = await sb(TABLE + '?module_key=eq.' + q(moduleKey) + '&data_key=like.' + q(prefix) + '*&select=data_key,payload');
  return (rows || []).map(r => ((r && r.payload) || {}).data).filter(Boolean);
}
async function putModuleRecord(moduleKey, dataKey, data) {
  await sb(TABLE + '?on_conflict=module_key%2Cdata_key', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ module_key: moduleKey, data_key: dataKey, payload: { data: data, _lm: Date.now() } }])
  });
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
async function actionLogin(body, event) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) return resp(400, { error: 'username/password fehlen' });

  // Brute-Force-Drossel: pro IP UND pro Benutzername ein gleitendes Fenster
  // (nur FEHLversuche zaehlen — erfolgreiche Logins nicht, damit ein Buero
  // hinter EINER IP nie ausgesperrt wird). FAIL-OPEN. Vorab-Pruefung ohne
  // Hochzaehlen; der Zaehler steigt nur bei falschem Passwort.
  const ip = clientIp(event);
  if (await throttleOver('login_ip', ip, LOGIN_MAX_IP, LOGIN_WINDOW_MS) ||
      await throttleOver('login_user', username, LOGIN_MAX_USER, LOGIN_WINDOW_MS)) {
    return resp(429, { error: 'Zu viele Anmeldeversuche — bitte in einigen Minuten erneut versuchen.' });
  }

  const users = await loadUsers();
  const user = users.find(u => u && u.active !== false && (
    (u.username && String(u.username).toLowerCase() === username) ||
    (u.profile && u.profile.email && String(u.profile.email).toLowerCase() === username)
  ));
  let ok = false, user2 = user;
  if (user) {
    const cred = await getRecord('cred:' + user.id);
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
  }
  if (!ok) {
    // Fehlversuch aufzeichnen (IP + Benutzername).
    await throttleBump('login_ip', ip, LOGIN_WINDOW_MS);
    await throttleBump('login_user', username, LOGIN_WINDOW_MS);
    return resp(401, { error: 'Zugangsdaten ungueltig' });
  }
  // Erfolg → Benutzer-Zaehler leeren, damit ein legitimer User nach ein
  // paar Tippfehlern nicht gesperrt bleibt.
  await throttleClear('login_user', username);
  const t = mintToken(user2);
  return resp(200, { ok: true, token: t.token, exp: t.exp, user: stripPassword(user2) });
}

// ── Drosseln (Review S1.4 + Login-Brute-Force) ─────────────────────────
// Kurzlebige Zaehler-Records im auth-Modul; ALLE Throttle-Helfer sind
// FAIL-OPEN — ein Fehler im Throttle-Store blockiert NIE eine legitime
// Aktion. Schluessel werden gehasht, damit keine IPs/Benutzernamen im
// (fuer authenticated lesbaren) Record-Key stehen.
const REG_MAX_PER_HOUR = parseInt(process.env.GEMA_REG_MAX_PER_HOUR || '8', 10) || 8;
const LOGIN_MAX_IP = parseInt(process.env.GEMA_LOGIN_MAX_IP || '20', 10) || 20;
const LOGIN_MAX_USER = parseInt(process.env.GEMA_LOGIN_MAX_USER || '8', 10) || 8;
const LOGIN_WINDOW_MS = (parseInt(process.env.GEMA_LOGIN_WINDOW_MIN || '15', 10) || 15) * 60000;

function clientIp(event) {
  const h = (event && event.headers) || {};
  const raw = h['x-nf-client-connection-ip'] || h['X-Nf-Client-Connection-Ip'] ||
    (h['x-forwarded-for'] || h['X-Forwarded-For'] || '').split(',')[0] || '';
  return String(raw).trim().replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45);
}
function _thKey(ns, id) { return 'throttle:' + ns + ':' + crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 32); }
// Ueber-Limit? (nur lesen, zaehlt nicht hoch) — FAIL-OPEN.
async function throttleOver(ns, id, maxN, windowMs) {
  try {
    if (!id) return false;
    const now = Date.now();
    const rec = await getRecord(_thKey(ns, id));
    const hits = (rec && Array.isArray(rec.hits) ? rec.hits : []).filter(t => now - t < windowMs);
    return hits.length >= maxN;
  } catch (e) { return false; }
}
// Einen Treffer aufzeichnen (Fenster beschneiden) — FAIL-OPEN.
async function throttleBump(ns, id, windowMs) {
  try {
    if (!id) return;
    const now = Date.now();
    const key = _thKey(ns, id);
    const rec = await getRecord(key);
    const hits = (rec && Array.isArray(rec.hits) ? rec.hits : []).filter(t => now - t < windowMs);
    hits.push(now);
    await putRecord(key, { hits: hits, _lm: now });
  } catch (e) { /* FAIL-OPEN */ }
}
async function throttleClear(ns, id) { try { if (id) await deleteRecordKey(_thKey(ns, id)); } catch (e) { /* egal */ } }

async function registerThrottleOk(event) {
  const ip = clientIp(event);
  if (!ip) return true; // keine IP ermittelbar → nicht blockieren
  if (await throttleOver('reg', ip, REG_MAX_PER_HOUR, 3600000)) return false;
  await throttleBump('reg', ip, 3600000);
  return true;
}

async function actionRegister(body, event) {
  if (!REGISTRATION_OPEN) {
    return resp(403, { error: 'Selbst-Registrierung ist deaktiviert — bitte wende dich an deinen GEMA-Administrator.' });
  }
  if (!(await registerThrottleOk(event))) {
    return resp(429, { error: 'Zu viele Registrierungen von dieser Verbindung — bitte spaeter erneut versuchen.' });
  }
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

// ── Schule: Klassencode-Registrierung (Studierende) ─────────────────────
// Der Dozent teilt den Klassencode; Studierende registrieren sich damit
// selbst und landen als role_student in der Schul-Org + Klasse.
function normCode(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
async function findKlasseByCode(code) {
  const c = normCode(code);
  if (!c) return null;
  const klassen = await loadModuleCollection('schule', 'sklasse:');
  return klassen.find(k => k && !k.archiviert && normCode(k.code) === c) || null;
}

// class_info: oeffentlicher Lookup VOR der Registrierung (zeigt dem
// Studierenden, welcher Klasse er beitritt). Der Code ist das Geheimnis.
async function actionClassInfo(body) {
  const klasse = await findKlasseByCode(body.code);
  if (!klasse) return resp(404, { error: 'Klassencode ungueltig' });
  const org = await getRecord('org:' + klasse.orgId);
  return resp(200, {
    ok: true,
    klasse: { name: klasse.name || '', lehrgang: klasse.lehrgang || '', org: (org && org.name) || '' }
  });
}

async function actionRegisterStudent(body) {
  if (!STUDENT_REGISTRATION_OPEN) {
    return resp(403, { error: 'Selbst-Registrierung ist deaktiviert — bitte wende dich an deinen GEMA-Administrator.' });
  }
  const code = normCode(body.code);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!code || !name || !email || !password) return resp(400, { error: 'Angaben unvollstaendig' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resp(400, { error: 'E-Mail ungueltig' });
  const klasse = await findKlasseByCode(code);
  if (!klasse) return resp(404, { error: 'Klassencode ungueltig' });

  const users = await loadUsers();
  const exists = users.find(u => u && (
    (u.username && String(u.username).toLowerCase() === email) ||
    (u.profile && u.profile.email && String(u.profile.email).toLowerCase() === email)
  ));
  if (exists) {
    // Bestehendes Konto: Passwort verifizieren und NUR den Klassen-Beitritt
    // machen (kein Org-Wechsel, keine Rollen-Aenderung — der User behaelt
    // sein Konto und erscheint zusaetzlich in der Klasse).
    if (exists.active === false) return resp(403, { error: 'Dieses Konto ist deaktiviert.' });
    const cred = await getRecord('cred:' + exists.id);
    let ok = false;
    if (cred) ok = verifyCred(cred, password);
    else if (exists.password) ok = timingSafeEq(exists.password, djb2(password));
    if (!ok) return resp(409, { error: 'E-Mail bereits registriert — bitte mit dem bestehenden Passwort anmelden.' });
    klasse.studentIds = klasse.studentIds || [];
    if (klasse.studentIds.indexOf(exists.id) < 0) {
      klasse.studentIds.push(exists.id);
      await putModuleRecord('schule', 'sklasse:' + klasse.id, klasse);
      await notifyBeitritt(klasse, exists);
    }
    const tEx = mintToken(exists);
    return resp(200, { ok: true, token: tEx.token, exp: tEx.exp, user: stripPassword(exists), klasse: { id: klasse.id, name: klasse.name } });
  }

  const uid = 'user_stud_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const user = {
    id: uid, username: email, name: name,
    roleIds: ['role_student'], orgId: klasse.orgId, active: true,
    createdAt: new Date().toISOString(),
    profile: { email: email, telefon: '', sprache: 'de', benachrichtigungen: true }
  };
  await putRecord('cred:' + uid, { alg: 'scrypt', src: looksLikeDjb2(password) ? 'djb2' : 'plain', hash: scryptHash(password), setAt: new Date().toISOString() });
  await putRecord('user:' + uid, user);
  klasse.studentIds = klasse.studentIds || [];
  if (klasse.studentIds.indexOf(uid) < 0) klasse.studentIds.push(uid);
  await putModuleRecord('schule', 'sklasse:' + klasse.id, klasse);
  await notifyBeitritt(klasse, user);
  const t = mintToken(user);
  return resp(200, { ok: true, token: t.token, exp: t.exp, user: user, klasse: { id: klasse.id, name: klasse.name } });
}
async function notifyBeitritt(klasse, user) {
  // Dozenten der Klasse benachrichtigen (Notif-Record wie GemaNotify.push)
  for (const did of (klasse.dozentIds || [])) {
    const nid = 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    try {
      await putModuleRecord('notify', 'notif:' + nid, {
        id: nid, ts: new Date().toISOString(), eventKey: 'schule_klasse_beitritt',
        empfaengerUserId: did, empfaengerRoleId: '', empfaengerOrgId: '',
        absenderUserId: user.id, modul: 'schule', typ: 'info',
        titel: 'Neues Klassenmitglied',
        text: (user.name || user.username || '') + ' ist der Klasse «' + (klasse.name || '') + '» beigetreten.',
        link: 'ab_klassen.html?k=' + klasse.id, objektId: '', gelesen: false, gelesenAt: null
      });
    } catch (e) { /* Benachrichtigung ist best-effort */ }
  }
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
          // Selbst-Update (Review S5): NUR unkritische Profilfelder duerfen
          // sich selbst geaendert werden. Alle uebrigen Felder werden aus
          // dem DB-Stand uebernommen (nie vom Client) — sonst liesse sich
          // per gecraftetem persist_auth-Request z.B. planerPremium/abo
          // (Bezahl-Bypass), lieferantId (fremdes Lieferanten-Dashboard)
          // oder gastZugaenge (fremde Org-Objekte) selbst freischalten.
          // Der bisherige Guard fror nur roleIds/orgId/active ein.
          const SELF_EDITABLE = { name: 1, profile: 1, avatar: 1, einstellungen: 1, password: 1 };
          const merged = Object.assign({}, existing);
          for (const fk of Object.keys(data)) { if (SELF_EDITABLE[fk]) merged[fk] = data[fk]; }
          merged.id = existing.id;
          rec.data = merged; // die Schreib-Schleife nutzt rec.data
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

// refresh: gleitendes Sitzungsfenster — ein noch gueltiges Token wird gegen
// ein frisches getauscht (Client macht das automatisch im Hintergrund).
// Deaktivierte/geloeschte Konten bekommen KEIN neues Token mehr → weiche
// Revocation innerhalb der Token-Laufzeit.
async function actionRefresh(claims) {
  if (!claims) return resp(401, { error: 'Kein gueltiges Token' });
  const user = await getRecord('user:' + claims.uid);
  if (!user || user.active === false) return resp(401, { error: 'Konto inaktiv oder geloescht' });
  const t = mintToken(user);
  return resp(200, { ok: true, token: t.token, exp: t.exp, user: stripPassword(user) });
}

// diag: Selbst-Diagnose ohne Geheimnisse — im Browser aufrufbar:
//   /.netlify/functions/gema-auth?action=diag
// Zeigt, ob die Env-Variablen plausibel sind und ob die Function die
// Datenbank lesen kann (haeufigste Fehlkonfigurationen sofort sichtbar).
async function actionDiag() {
  const out = {
    ok: true,
    serviceKey: !SERVICE_KEY ? 'FEHLT'
      : SERVICE_KEY.indexOf('eyJ') === 0 ? 'gesetzt (Legacy-JWT-Format)'
      : SERVICE_KEY.indexOf('sb_secret_') === 0 ? 'gesetzt (neues sb_secret-Format)'
      : 'gesetzt (unbekanntes Format — pruefen!)',
    jwtSecret: !JWT_SECRET ? 'FEHLT'
      : JWT_SECRET.indexOf('eyJ') === 0 ? 'VERDAECHTIG: sieht wie ein API-Key aus (eyJ…) — das JWT-Secret hat KEINE Punkte und beginnt nicht mit eyJ!'
      : 'gesetzt (plausibles Format)',
    tokenDays: TOKEN_DAYS
  };
  try {
    const rows = await sb(TABLE + '?module_key=eq.auth&data_key=like.' + q('user:') + '*&select=data_key&limit=100');
    out.datenbank = 'lesbar — ' + ((rows && rows.length) || 0) + ' Benutzer-Record(s) gefunden';
    if (!rows || !rows.length) out.hinweis = 'Keine user:-Records lesbar — Service-Key falsch oder Daten fehlen.';
  } catch (e) {
    out.ok = false;
    out.datenbank = 'FEHLER: ' + (e.message || 'unbekannt');
    out.hinweis = 'Die Function kann die Datenbank nicht lesen → Logins schlagen fehl. Meist ist der SUPABASE_SERVICE_KEY falsch (anon-Key oder Tippfehler).';
  }
  return resp(200, out);
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
  // diag ist bewusst auch per GET erreichbar (Browser-URL) — gibt keine
  // Geheimwerte preis, nur Konfigurations-Plausibilitaet.
  if (event.httpMethod === 'GET') {
    const qs = event.queryStringParameters || {};
    if (qs.action === 'diag') {
      if (!SERVICE_KEY || !JWT_SECRET) {
        return resp(200, { ok: false, serviceKey: SERVICE_KEY ? 'gesetzt' : 'FEHLT', jwtSecret: JWT_SECRET ? 'gesetzt' : 'FEHLT', hinweis: 'Env-Variablen in Netlify setzen und neu deployen (SECURITY_RLS_ANLEITUNG.md Schritt 2).' });
      }
      return await actionDiag();
    }
    return resp(405, { error: 'POST only' });
  }
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
      case 'login': return await actionLogin(body, event);
      case 'register': return await actionRegister(body, event);
      case 'register_student': return await actionRegisterStudent(body);
      case 'class_info': return await actionClassInfo(body);
      case 'activate': return await actionActivate(body);
      case 'persist_auth': return await actionPersistAuth(body, claims);
      case 'refresh': return await actionRefresh(claims);
      case 'whoami': return claims ? resp(200, { ok: true, claims }) : resp(401, { error: 'Kein gueltiges Token' });
      default: return resp(400, { error: 'Unbekannte action' });
    }
  } catch (e) {
    console.error('[gema-auth]', e);
    return resp(500, { error: 'Serverfehler: ' + (e.message || 'unbekannt') });
  }
};
