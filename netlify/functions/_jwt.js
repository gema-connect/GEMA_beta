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

module.exports = { verifyJwt, requireAuth, timingSafeEq };
