/**
 * card-public.js — oeffentliche Kartendaten fuer sys_card.html
 * ═══════════════════════════════════════════════════════════════════════
 * ÖFFENTLICHER ENDPOINT – KEIN JWT. Feld-Whitelist zwingend.
 * Nie `select *` durchreichen.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   GET /api/card-public?slug=<slug>[&claim=<token>]
 *     → GENAU eine Karte, serverseitig auf die oeffentlichen Felder
 *       reduziert (_card.sanitizePublic). Kein Listing, keine Suche,
 *       kein LIKE — nur exakter Slug-Match (Konzept §8 «Enumeration»).
 *
 * Rate-Limit 60/min/IP (Konzept §4.3). Ein Treffer liefert zusaetzlich
 * das Event «view»; der Slug selbst ist der Zugangsschluessel.
 */
'use strict';

const C = require('./_card');

const LIMIT_PRO_MIN = 60;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (event.httpMethod !== 'GET') return C.resp(405, { error: 'Method not allowed' });
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });

  const qs = event.queryStringParameters || {};
  const ip = C.clientIp(event);
  if (!C.memLimit('pub', ip, LIMIT_PRO_MIN, 60000)) {
    return C.resp(429, { error: 'Zu viele Anfragen — bitte kurz warten.' });
  }

  try {
    let profil = null;
    let claimOk = false;

    // Zwei Einstiege: ueber den Slug (/p/<slug>) oder ueber einen
    // Claim-Token (/c/<token>) — letzterer identifiziert das
    // Schattenprofil, das uebernommen werden soll.
    const claim = String(qs.claim || '').trim();
    if (claim) {
      if (!C.tokenOk(claim)) return C.resp(400, { error: 'Ungültiger Link' });
      profil = await C.profilByClaimToken(claim);
      // Ein bereits uebernommenes Profil hat keinen Token mehr — der alte
      // Link darf dann nichts mehr freischalten.
      claimOk = !!(profil && !profil.user_id && !profil.claimed_at);
    } else {
      const slug = String(qs.slug || '').trim();
      if (!C.slugOk(slug)) return C.resp(400, { error: 'Ungültiger Link' });
      profil = await C.profilBySlug(slug);
    }

    if (!profil) return C.resp(404, { error: 'Karte nicht gefunden' });

    const out = C.sanitizePublic(profil);
    // Der Claim-Token verlaesst den Server NIE — der Client hat ihn
    // ohnehin aus der URL, und in der normalen Slug-Ansicht darf er
    // keinesfalls mitgeliefert werden.
    out.claim_moeglich = claimOk;

    await C.logEvent({ slug: profil.slug, event: claim ? 'claim_start' : 'view', uaHash: C.uaHash(event) });

    // Kurzer CDN-Cache waere verlockend (Ladezeit), ist hier aber falsch:
    // die Karte ist der LEBENDE Zeiger auf die aktuellen Daten. Eine
    // Aenderung im Editor muss sofort sichtbar sein (Grundprinzip 2).
    return C.resp(200, { karte: out });
  } catch (e) {
    if (C.istFehlendeTabelle(e)) return C.fehlerAntwort(e, 'card-public');
    console.error('[card-public]', e && e.message);
    return C.resp(502, { error: 'Karte konnte nicht geladen werden' });
  }
};
