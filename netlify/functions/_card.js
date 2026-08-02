/**
 * _card.js — geteilte Bausteine der GEMA-Card-Functions
 * ═══════════════════════════════════════════════════════════════════════
 * Referenz: UMSETZUNG_GEMA_Card.md
 *
 * Alle Karten-Tabellen (card_profiles, project_participants,
 * card_contacts, card_reports, card_events) haben RLS aktiv und BEWUSST
 * keine einzige Policy — es gibt keinen anon-/authenticated-Zugriff.
 * Jeder Zugriff laeuft ueber diese Functions mit dem Service-Key. Damit
 * ist die Feld-Whitelist unumgehbar und die Profile sind nicht
 * enumerierbar (Konzept Grundprinzip 6 + §8). Begruendung im Kopf von
 * supabase/gema_card_v1.sql.
 *
 * Keine npm-Dependencies — nur node:crypto (GEMA-Konvention).
 *
 * ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */
'use strict';

const crypto = require('crypto');

const SB_URL = process.env.SUPABASE_URL || 'https://fjhbqjvaygvhievjgdtm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = 'card-photos';

/* ── HTTP-Geruest ────────────────────────────────────────────────────── */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
function resp(status, obj, extraHeaders) {
  return {
    statusCode: status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS, extraHeaders || {}),
    body: JSON.stringify(obj)
  };
}
function preflight() { return { statusCode: 204, headers: CORS, body: '' }; }
function configured() { return !!SERVICE_KEY; }

/* ── Supabase REST (Service-Key, umgeht RLS) ─────────────────────────── */
// Akzeptiert beide Key-Formate: Legacy-service_role-JWT (eyJ…) und die
// neuen sb_secret_-Keys. Letztere sind KEINE JWTs und duerfen nicht als
// Authorization: Bearer gesendet werden (PostgREST wuerde 401 werfen).
function sbHeaders(extra) {
  const h = Object.assign({ 'apikey': SERVICE_KEY, 'Content-Type': 'application/json' }, extra || {});
  if (SERVICE_KEY.indexOf('eyJ') === 0) h['Authorization'] = 'Bearer ' + SERVICE_KEY;
  return h;
}
async function sb(pathQs, opts) {
  opts = opts || {};
  const res = await fetch(SB_URL + '/rest/v1/' + pathQs, Object.assign({}, opts, {
    headers: Object.assign(sbHeaders(), opts.headers || {})
  }));
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('Supabase ' + res.status + ': ' + t.slice(0, 200));
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}
function q(s) { return encodeURIComponent(String(s == null ? '' : s)); }

async function sbSelect(table, qs) { return (await sb(table + '?' + qs)) || []; }

/**
 * Zeilen ZAEHLEN statt laden.
 *
 * KRITISCH: PostgREST deckelt jede Antwort auf db-max-rows (Hosted-Default
 * 1000). Wer zaehlen will, indem er die Zeilen laedt und `.length` nimmt,
 * bekommt ab Zeile 1001 stillschweigend eine falsche Zahl. `Prefer:
 * count=exact` liefert die echte Gesamtzahl im Content-Range-Header —
 * unabhaengig davon, wie viele Zeilen wirklich uebertragen werden.
 * Rueckgabe null = Zahl nicht ermittelbar (nie als 0 ausgeben!).
 */
async function sbCount(table, qs) {
  const res = await fetch(SB_URL + '/rest/v1/' + table + '?' + qs + '&select=id&limit=1', {
    headers: Object.assign(sbHeaders(), { 'Prefer': 'count=exact' })
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  const cr = res.headers.get('content-range') || '';      // z.B. «0-0/1234»
  const m = /\/(\d+)$/.exec(cr);
  return m ? parseInt(m[1], 10) : null;
}
async function sbInsert(table, rows, opts) {
  return await sb(table + ((opts && opts.onConflict) ? '?on_conflict=' + q(opts.onConflict) : ''), {
    method: 'POST',
    headers: { 'Prefer': (opts && opts.upsert ? 'resolution=merge-duplicates,' : '') + ((opts && opts.returning) ? 'return=representation' : 'return=minimal') },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
  });
}
async function sbUpdate(table, qs, patch) {
  return await sb(table + '?' + qs, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(patch)
  });
}
async function sbDelete(table, qs) {
  return await sb(table + '?' + qs, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
}

/* ── Storage (privater Bucket card-photos) ───────────────────────────── */
async function storageGet(path) {
  const res = await fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + String(path).split('/').map(encodeURIComponent).join('/'), {
    headers: sbHeaders()
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf: buf, type: res.headers.get('content-type') || 'image/jpeg' };
}
async function storagePut(path, buf, contentType) {
  const url = SB_URL + '/storage/v1/object/' + BUCKET + '/' + String(path).split('/').map(encodeURIComponent).join('/');
  const h = sbHeaders({ 'Content-Type': contentType || 'image/jpeg' });
  h['x-upsert'] = 'true';
  const res = await fetch(url, { method: 'POST', headers: h, body: buf });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('Storage ' + res.status + ': ' + t.slice(0, 160)); }
  return true;
}
async function storageDelete(path) {
  try {
    await fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + String(path).split('/').map(encodeURIComponent).join('/'), {
      method: 'DELETE', headers: sbHeaders()
    });
  } catch (e) { /* best-effort */ }
}

/* ── Slug ────────────────────────────────────────────────────────────── */
// base58 (ohne 0/O/I/l — unverwechselbar beim Abtippen). 10 Zeichen aus
// 58 Symbolen ≈ 58^10 ≈ 4.3e17 Moeglichkeiten → nicht erratbar, nicht
// enumerierbar (Konzept §8). Der Slug gehoert der PERSON und bleibt bei
// einem Firmenwechsel unveraendert (Grundprinzip 1).
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function slugNeu(len) {
  len = len || 10;
  const bytes = crypto.randomBytes(len * 2);
  let out = '';
  for (let i = 0; out.length < len && i < bytes.length; i++) {
    // Modulo-Bias vermeiden: Werte am oberen Rand verwerfen
    if (bytes[i] >= 232) continue;              // 232 = 4 * 58
    out += B58[bytes[i] % 58];
  }
  while (out.length < len) out += B58[crypto.randomBytes(1)[0] % 58];
  return out;
}
function slugOk(s) { return typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{6,24}$/.test(s); }
function tokenNeu() { return crypto.randomBytes(24).toString('hex'); }   // 48 hex, wie rev-share/goodel
function tokenOk(t) { return typeof t === 'string' && /^[a-f0-9]{32,64}$/.test(t); }

async function slugFrei() {
  // Kollisionen sind bei 58^10 praktisch ausgeschlossen, aber ein Retry
  // kostet nichts und macht das Anlegen deterministisch sicher.
  for (let i = 0; i < 5; i++) {
    const s = slugNeu(10);
    const hit = await sbSelect('card_profiles', 'slug=eq.' + q(s) + '&select=id&limit=1');
    if (!hit.length) return s;
  }
  return slugNeu(14);
}

/* ── Feld-Whitelist (Grundprinzip 6) ─────────────────────────────────── */
// IMMER sichtbar: Name, Funktion, Bild — das ist der Zweck der Karte.
const FELDER_IMMER = ['display_name', 'first_name', 'last_name', 'role_title'];
// Nur wenn fields_public[<feld>] === true:
const FELDER_OPTIONAL = ['company', 'company_uid', 'phone', 'phone_office', 'email', 'website', 'address', 'zip', 'city'];
// Default konservativ (Konzept §8): website/address standardmaessig AUS.
const FIELDS_PUBLIC_DEFAULT = { company: true, role_title: true, phone: true, email: true, website: false, address: false };

function fieldsPublic(p) {
  const fp = (p && p.fields_public && typeof p.fields_public === 'object') ? p.fields_public : {};
  return Object.assign({}, FIELDS_PUBLIC_DEFAULT, fp);
}
// Ein Feld ist oeffentlich, wenn sein eigener Schalter true ist. Adresse
// wird ueber EINEN Schalter (address) gesteuert — zip/city gehoeren dazu.
function feldOeffentlich(p, feld) {
  const fp = fieldsPublic(p);
  if (feld === 'zip' || feld === 'city') return fp.address === true;
  if (feld === 'company_uid') return fp.company === true;
  return fp[feld] === true;
}

/**
 * Oeffentliche Sicht auf ein Profil. NIE `select *` durchreichen —
 * nicht-oeffentliche Felder verlassen den Server gar nicht erst
 * (Konzept §2.1: «wird serverseitig nicht ausgeliefert, nicht
 * clientseitig ausgeblendet»).
 *
 * opts.voll = true  → Inhaber/Admin sieht alles (Editor, eigene Karte)
 */
function sanitizePublic(p, opts) {
  if (!p) return null;
  const voll = !!(opts && opts.voll);
  const out = {
    slug: p.slug,
    display_name: p.display_name || '',
    first_name: p.first_name || '',
    last_name: p.last_name || '',
    role_title: p.role_title || '',
    hat_foto: !!(p.photo_path || p.photo_vcard_path),
    updated_at: p.updated_at || null,
    // Schattenprofil = noch niemand hat die Karte uebernommen. Das Frontend
    // blendet daraufhin das «Das bist du?»-Banner ein (Konzept §2.1).
    schatten: !p.user_id
  };
  FELDER_OPTIONAL.forEach(function (f) {
    if (voll || feldOeffentlich(p, f)) { if (p[f]) out[f] = p[f]; }
  });
  if (voll) {
    out.id = p.id;
    out.user_id = p.user_id || null;
    out.fields_public = fieldsPublic(p);
    out.field_origin = p.field_origin || {};
    out.created_at = p.created_at || null;
  }
  return out;
}

/* ── Events (nDSG: kein Klartext-UA, keine IP) ───────────────────────── */
function clientIp(event) {
  const h = (event && event.headers) || {};
  const raw = h['x-nf-client-connection-ip'] || h['X-Nf-Client-Connection-Ip'] ||
    (h['x-forwarded-for'] || h['X-Forwarded-For'] || '').split(',')[0] || '';
  return String(raw).trim().replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45);
}
// Tages-Salt: derselbe Besucher ist innerhalb eines Tages wiedererkennbar
// (Funnel-Auswertung), darueber hinaus nicht mehr verknuepfbar und aus dem
// Hash nicht rueckrechenbar (Konzept §8 «Tracking»).
function uaHash(event) {
  try {
    const h = (event && event.headers) || {};
    const ua = h['user-agent'] || h['User-Agent'] || '';
    const tag = new Date().toISOString().slice(0, 10);
    return crypto.createHash('sha256').update(tag + '|' + clientIp(event) + '|' + ua).digest('hex').slice(0, 32);
  } catch (e) { return null; }
}
const EVENTS_OK = ['scan', 'view', 'vcard', 'contact_saved', 'claim_start', 'claim_done', 'invite_sent', 'join_project', 'report'];
async function logEvent(ev) {
  // Immer best-effort: eine fehlgeschlagene Statistik darf NIE den
  // eigentlichen Abruf scheitern lassen.
  try {
    if (!ev || EVENTS_OK.indexOf(ev.event) < 0) return;
    await sbInsert('card_events', {
      profile_slug: ev.slug || null,
      event: ev.event,
      project_id: ev.projectId || null,
      ref_user: ev.refUser || null,
      ua_hash: ev.uaHash || null
    });
  } catch (e) { /* egal */ }
}

/* ── Rate-Limit ──────────────────────────────────────────────────────── */
// Zwei Stufen, bewusst getrennt:
//  • memLimit   — Sliding Window IM Lambda-Container. Kostet keinen
//                 DB-Roundtrip und haelt damit das <1s-Ziel der
//                 Kartenseite. Netlify recycelt Container, ein Angreifer
//                 kann das Fenster also theoretisch umgehen — fuer
//                 Lese-Endpoints (Konzept: 60/min/IP) ist das der richtige
//                 Kompromiss, weil die Daten ohnehin oeffentlich sind und
//                 der Slug nicht erratbar ist.
//  • dbLimit    — persistent ueber card_events, fuer schreibende bzw.
//                 missbrauchsanfaellige Endpoints (Meldungen: 5/h/IP).
// Beide FAIL-OPEN: ein Fehler im Limiter blockiert nie eine legitime
// Anfrage (Muster gema-auth.js).
const _mem = new Map();
function memLimit(bucket, id, maxN, windowMs) {
  try {
    if (!id) return true;
    const key = bucket + '|' + id;
    const now = Date.now();
    const hits = (_mem.get(key) || []).filter(t => now - t < windowMs);
    if (hits.length >= maxN) { _mem.set(key, hits); return false; }
    hits.push(now);
    _mem.set(key, hits);
    if (_mem.size > 5000) _mem.clear();   // simple Notbremse gegen Wachstum
    return true;
  } catch (e) { return true; }
}
async function dbLimit(eventName, hash, maxN, windowMs) {
  try {
    if (!hash) return true;
    const seit = new Date(Date.now() - windowMs).toISOString();
    const rows = await sbSelect('card_events',
      'event=eq.' + q(eventName) + '&ua_hash=eq.' + q(hash) + '&created_at=gte.' + q(seit) + '&select=id&limit=' + (maxN + 1));
    return rows.length < maxN;
  } catch (e) { return true; }
}

/* ── Profile laden ───────────────────────────────────────────────────── */
const PROFILE_COLS = 'id,user_id,slug,display_name,first_name,last_name,company,company_uid,role_title,'
  + 'phone,phone_office,email,website,address,zip,city,photo_path,photo_vcard_path,fields_public,'
  + 'field_origin,claim_token,claimed_at,created_by,updated_at,created_at';

// EXAKTER Slug-Match — kein LIKE, keine Suche, kein Listing (Konzept §8).
async function profilBySlug(slug) {
  if (!slugOk(slug)) return null;
  const rows = await sbSelect('card_profiles', 'slug=eq.' + q(slug) + '&select=' + PROFILE_COLS + '&limit=1');
  return rows[0] || null;
}
async function profilById(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const rows = await sbSelect('card_profiles', 'id=eq.' + q(id) + '&select=' + PROFILE_COLS + '&limit=1');
  return rows[0] || null;
}
async function profilByUser(userId) {
  if (!userId) return null;
  const rows = await sbSelect('card_profiles', 'user_id=eq.' + q(userId) + '&select=' + PROFILE_COLS + '&order=created_at.asc&limit=1');
  return rows[0] || null;
}
async function profilByMail(email) {
  const m = String(email || '').trim().toLowerCase();
  if (!m) return [];
  return await sbSelect('card_profiles', 'email=ilike.' + q(m) + '&select=' + PROFILE_COLS + '&order=created_at.asc');
}
async function profilByClaimToken(token) {
  if (!tokenOk(token)) return null;
  const rows = await sbSelect('card_profiles', 'claim_token=eq.' + q(token) + '&select=' + PROFILE_COLS + '&limit=1');
  return rows[0] || null;
}

/* ── Notifikation (Muster goodel-share.js) ───────────────────────────── */
async function notify(n) {
  try {
    if (!n || !n.empfaengerUserId) return;
    const now = new Date().toISOString();
    const id = 'n_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
    await sb('gema_data?on_conflict=module_key%2Cdata_key', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        module_key: 'notify', data_key: 'notif:' + id,
        payload: {
          data: {
            id: id, ts: now, eventKey: n.eventKey || 'card_info',
            empfaengerUserId: n.empfaengerUserId, empfaengerRoleId: '', empfaengerOrgId: '',
            absenderUserId: n.absenderUserId || '', modul: 'visitenkarte', typ: n.typ || 'info',
            titel: n.titel || '', text: n.text || '', link: n.link || '',
            objektId: n.objektId || '', gelesen: false, gelesenAt: null
          }, _lm: now
        }
      }])
    });
  } catch (e) { /* Benachrichtigung ist best-effort */ }
}

/* ── GEMA-User (auth-Collection in gema_data) ────────────────────────── */
async function gemaUser(userId) {
  try {
    const rows = await sb('gema_data?module_key=eq.auth&data_key=eq.' + q('user:' + userId) + '&select=payload');
    const p = (rows && rows[0] && rows[0].payload) || null;
    return (p && p.data) || null;
  } catch (e) { return null; }
}

module.exports = {
  SB_URL, SERVICE_KEY, BUCKET,
  CORS, resp, preflight, configured,
  sb, sbSelect, sbCount, sbInsert, sbUpdate, sbDelete, q,
  storageGet, storagePut, storageDelete,
  slugNeu, slugOk, slugFrei, tokenNeu, tokenOk,
  FELDER_IMMER, FELDER_OPTIONAL, FIELDS_PUBLIC_DEFAULT,
  fieldsPublic, feldOeffentlich, sanitizePublic,
  clientIp, uaHash, logEvent, EVENTS_OK,
  memLimit, dbLimit,
  PROFILE_COLS, profilBySlug, profilById, profilByUser, profilByMail, profilByClaimToken,
  notify, gemaUser
};
