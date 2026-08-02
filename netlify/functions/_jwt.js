/**
 * _jwt.js — geteilter JWT-Check fuer Netlify-Functions (GEMA Secure v1).
 *
 * Verifiziert das von gema-auth.js ausgestellte HS256-Token (gleiches
 * GEMA_JWT_SECRET). Eingesetzt als Auth-Gate der claude-*-Proxies,
 * form-watch und stripe-checkout — diese Functions sind sonst ein
 * offener, kostenpflichtiger Proxy fuer jeden im Internet
 * (Sicherheits-Review 2026-07, Befund S3).
 *
 * requireAuth(event) → Claims-Objekt ({uid, org, adm, exp, …}) oder null.
 * Fail-closed: ohne GEMA_JWT_SECRET (Fehlkonfiguration) wird NICHTS
 * akzeptiert — dieselbe Env-Variable braucht bereits der Login
 * (gema-auth.js), sie ist auf einer funktionierenden Installation
 * zwingend gesetzt.
 */
'use strict';
const crypto = require('crypto');

const JWT_SECRET = process.env.GEMA_JWT_SECRET || '';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function verifyJwt(token) {
  try {
    if (!JWT_SECRET) return null;
    const [h, p, s] = String(token || '').split('.');
    if (!h || !p || !s) return null;
    const expect = b64url(crypto.createHmac('sha256', JWT_SECRET).update(h + '.' + p).digest());
    if (!timingSafeEq(s, expect)) return null;
    const claims = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch (e) { return null; }
}
function requireAuth(event) {
  const a = (event && event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  return verifyJwt(a.replace(/^Bearer\s+/i, ''));
}

/* ── Token ausstellen + Passwort-Hash ───────────────────────────────────
 * Kanonische Implementierung ist gema-auth.js (dort inline). Hier
 * bereitgestellt fuer Functions, die ebenfalls Konten anlegen duerfen —
 * aktuell card-claim.js (GEMA Card: Karte uebernehmen / Gratis-Konto).
 * Die Claim-Form MUSS mit gema-auth.js identisch bleiben, sonst passt das
 * Token nicht zu den Supabase-RLS-Policies (role=authenticated).
 */
const TOKEN_DAYS = parseInt(process.env.GEMA_TOKEN_DAYS || '30', 10) || 30;

function signJwt(claims) {
  if (!JWT_SECRET) throw new Error('GEMA_JWT_SECRET fehlt');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify(claims));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest();
  return header + '.' + payload + '.' + b64url(sig);
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
// Passwoerter liegen ausschliesslich in geschuetzten cred:-Records
// (keine RLS-Policy → nur der Service-Key kommt heran).
function scryptHash(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(secret, salt, 32).toString('hex');
}
function looksLikeDjb2(v) { return typeof v === 'string' && /^gh_[0-9a-f]+_\d+$/.test(v); }

module.exports = { verifyJwt, requireAuth, timingSafeEq, signJwt, mintToken, scryptHash, looksLikeDjb2, TOKEN_DAYS };
