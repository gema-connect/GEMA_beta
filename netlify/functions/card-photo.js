/**
 * card-photo.js — Profilbild einer Karte ausliefern
 * ═══════════════════════════════════════════════════════════════════════
 * ÖFFENTLICHER ENDPOINT – KEIN JWT. Feld-Whitelist zwingend.
 * Nie `select *` durchreichen.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   GET /api/card-photo?slug=<slug>[&v=klein]
 *
 * Der Bucket «card-photos» ist PRIVAT — es gibt keine oeffentliche
 * Storage-URL. Das Bild kommt ausschliesslich hier heraus, adressiert
 * ueber den Slug (nie ueber den Storage-Pfad): so laesst sich der Bucket
 * nicht durchsuchen und ein geloeschtes Profil nimmt sein Bild mit.
 *
 * Cache-Control 300 s (Konzept §4.3) — das Bild aendert sich selten und
 * die Kartenseite soll in unter 1 s stehen. Der Datensatz selbst
 * (card-public) bleibt bewusst ungecacht.
 */
'use strict';

const C = require('./_card');

const LIMIT_PRO_MIN = 120;   // pro Karte faellt genau 1 Bildabruf an

// 1x1 transparentes GIF — wird statt eines 404 geliefert, damit ein
// fehlendes Bild im <img> keinen Broken-Image-Rahmen erzeugt.
const LEER = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (event.httpMethod !== 'GET') return C.resp(405, { error: 'Method not allowed' });
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });

  if (!C.memLimit('foto', C.clientIp(event), LIMIT_PRO_MIN, 60000)) {
    return C.resp(429, { error: 'Zu viele Anfragen' });
  }

  const qs = event.queryStringParameters || {};
  const slug = String(qs.slug || '').trim();
  if (!C.slugOk(slug)) return C.resp(400, { error: 'Ungültiger Link' });

  function leer() {
    return {
      statusCode: 200,
      headers: Object.assign({ 'Content-Type': 'image/gif', 'Cache-Control': 'public, max-age=60' }, C.CORS),
      body: LEER.toString('base64'),
      isBase64Encoded: true
    };
  }

  try {
    const p = await C.profilBySlug(slug);
    if (!p) return leer();
    const pfad = (qs.v === 'klein' && p.photo_vcard_path) ? p.photo_vcard_path : (p.photo_path || p.photo_vcard_path);
    if (!pfad) return leer();
    const f = await C.storageGet(pfad);
    if (!f) return leer();
    return {
      statusCode: 200,
      headers: Object.assign({
        'Content-Type': f.type || 'image/jpeg',
        'Cache-Control': 'public, max-age=300'
      }, C.CORS),
      body: f.buf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (e) {
    return leer();
  }
};
