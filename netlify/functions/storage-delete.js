/**
 * netlify/functions/storage-delete.js
 *
 * Loescht Dateien im Storage-Bucket «gema-fotos» — der einzige Weg, auf dem
 * in GEMA ueberhaupt geloescht werden kann.
 *
 * WARUM eine Function: Die Bucket-Policies erlauben bewusst nur INSERT
 * (eingeloggte User) und SELECT (oeffentlich) — es gibt KEINE DELETE-Policy.
 * Der Browser kann also mit anon-/authenticated-Key nichts loeschen, auch
 * nicht versehentlich oder boeswillig. Diese Function laeuft serverseitig mit
 * dem SUPABASE_SERVICE_KEY, der RLS per Definition umgeht (gleiches Muster
 * wie gema-auth.js fuer die Auth-Collection).
 *
 * Genutzt beim Loeschen eines Datensatzes: das Modul sammelt die Storage-
 * Pfade des Records (GemaStorage.collectFiles) und ruft nach dem Loeschen
 * des Records diese Function — sonst blieben die Bilder als «Leichen» fuer
 * immer im Bucket liegen (der Record, der sie referenziert, ist ja weg).
 *
 * SICHERHEITSGRENZEN (fail-closed):
 *   • JWT-Pflicht (requireAuth) — anonyme Aufrufe kommen nicht durch.
 *   • Nur der Bucket «gema-fotos», nie ein anderer.
 *   • Pfad-Whitelist: [a-zA-Z0-9_.-/], kein «..», kein fuehrender «/».
 *   • ORG-GRENZE: geloescht werden darf nur im eigenen Firmen-Ordner —
 *     GEMA legt Uploads als «<bereich>/<orgId>/<datei>» ab (schaden/…,
 *     dach/…, abnahme/…, regierapport/…, erp/…, stunden/… usw.), das zweite
 *     Segment muss also der Org aus dem Token entsprechen. GEMA-Admins
 *     (claims.adm) duerfen ueberall loeschen.
 *     → Module mit ABWEICHENDEM Pfadschema (pruefliste/<objektId>,
 *       produkte|offerten|armaturen|bestellungen/<lieferantId>) sind damit
 *       bewusst NICHT loeschbar; wer sie nachziehen will, gleicht entweder
 *       das Pfadschema an oder erweitert die Regel hier gezielt.
 *   • Max. 300 Pfade pro Aufruf.
 *
 * ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMA_JWT_SECRET.
 * Ohne Service-Key antwortet die Function mit 501 — der Aufrufer behandelt
 * das Loeschen ohnehin als best-effort (der Datensatz ist dann bereits weg).
 */
'use strict';
const { requireAuth } = require('./_jwt');

const SB_URL = process.env.SUPABASE_URL || 'https://fjhbqjvaygvhievjgdtm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET = 'gema-fotos';
const MAX_PATHS = 300;

function json(status, obj) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

// Ein Pfad ist loeschbar, wenn er sauber aussieht UND im Ordner der eigenen
// Org liegt. Liefert null (= abgelehnt) oder den normalisierten Pfad.
function pruefePfad(p, orgId, istAdmin) {
  if (typeof p !== 'string') return null;
  const pfad = p.trim().replace(/^\/+/, '');
  if (!pfad || pfad.length > 400) return null;
  if (!/^[a-zA-Z0-9_.\-/]+$/.test(pfad)) return null;   // keine Sonderzeichen, kein Query
  if (pfad.indexOf('..') >= 0 || pfad.indexOf('//') >= 0) return null;
  const seg = pfad.split('/');
  if (seg.length < 3) return null;            // <bereich>/<orgId>/<datei>
  if (istAdmin) return pfad;
  if (!orgId || seg[1] !== orgId) return null;
  return pfad;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Nur POST' });

  const claims = requireAuth(event);
  if (!claims) return json(401, { error: 'Nicht angemeldet' });
  if (!SERVICE_KEY) return json(501, { error: 'Storage-Loeschung nicht konfiguriert (SUPABASE_SERVICE_KEY fehlt)' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Ungueltiger Body' }); }

  const eingang = Array.isArray(body.paths) ? body.paths : [];
  if (!eingang.length) return json(400, { error: 'Keine Pfade uebergeben' });
  if (eingang.length > MAX_PATHS) return json(400, { error: 'Zu viele Pfade (max. ' + MAX_PATHS + ')' });

  const istAdmin = !!claims.adm;
  const orgId = claims.org || '';
  const erlaubt = [];
  const abgelehnt = [];
  eingang.forEach(function (p) {
    const ok = pruefePfad(p, orgId, istAdmin);
    if (ok) erlaubt.push(ok); else abgelehnt.push(String(p).slice(0, 120));
  });

  if (!erlaubt.length) return json(403, { error: 'Keiner der Pfade gehoert zur eigenen Firma', abgelehnt: abgelehnt });

  // Supabase-Storage-Bulk-Delete (dasselbe, was supabase-js .remove() macht)
  let r;
  try {
    r = await fetch(SB_URL + '/storage/v1/object/' + BUCKET, {
      method: 'DELETE',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefixes: erlaubt })
    });
  } catch (e) {
    return json(502, { error: 'Storage nicht erreichbar: ' + ((e && e.message) || e) });
  }

  const txt = await r.text().catch(function () { return ''; });
  if (!r.ok) {
    let detail = txt.slice(0, 200);
    try { const j = JSON.parse(txt); detail = j.message || j.error || detail; } catch (e) {}
    return json(502, { error: 'Storage HTTP ' + r.status + (detail ? ' — ' + detail : '') });
  }

  // Antwort ist ein Array der wirklich entfernten Objekte.
  let entfernt = erlaubt.length;
  try { const j = JSON.parse(txt); if (Array.isArray(j)) entfernt = j.length; } catch (e) {}

  return json(200, { ok: true, geloescht: entfernt, abgelehnt: abgelehnt.length });
};
