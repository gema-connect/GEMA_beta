/**
 * card-vcard.js — vCard, bei JEDEM Abruf frisch generiert
 * ═══════════════════════════════════════════════════════════════════════
 * ÖFFENTLICHER ENDPOINT – KEIN JWT. Feld-Whitelist zwingend.
 * Nie `select *` durchreichen.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   GET /v/<slug>.vcf      (Redirect → ?slug=<slug>.vcf)
 *
 * KERNANFORDERUNG (UMSETZUNG_GEMA_Card.md §5, Grundprinzip 2):
 * Die vCard wird NIE vorgeneriert, NIE gecacht, NIE in der Datenbank
 * gespeichert. Jeder Abruf baut sie aus dem aktuellen Datenstand —
 * inklusive aktuellem Profilbild. Deshalb `Cache-Control: no-store`.
 *
 * Format vCard 3.0 (maximale Kompatibilitaet iOS / Android / Outlook).
 * REV wird auf updated_at gesetzt, damit Adressbuecher die neuere
 * Fassung erkennen. Umlaute bleiben echte Umlaute (UTF-8); nur der
 * DATEINAME wird auf ae/oe/ue transliteriert (GEMA-Konvention).
 */
'use strict';

const C = require('./_card');

const LIMIT_PRO_MIN = 60;
// Obergrenze fuer das eingebettete Bild. Die kleine vCard-Fassung
// (photo_vcard_path) liegt bei ~15 KB; faellt sie aus und nur das
// Anzeigebild existiert, wird es bis zu dieser Groesse noch eingebettet.
// Darueber lieber GAR KEIN Bild als eine vCard, die Clients ablehnen.
const FOTO_MAX_BYTES = 40 * 1024;

/* ── vCard-Bausteine ─────────────────────────────────────────────────── */
// RFC 2426: \ ; , und Zeilenumbrueche im Wert maskieren.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
/**
 * Zeilen auf 75 Oktette falten, Folgezeilen mit EINEM Leerzeichen
 * einruecken (RFC 2426 «folding»). Ohne das weigern sich manche Clients,
 * die lange Base64-Zeile des Fotos zu lesen.
 * KRITISCH: es wird nach OKTETTEN gemessen, aber nur an Zeichengrenzen
 * umbrochen — sonst zerreisst ein Umlaut mitten im UTF-8-Bytepaar und
 * die ganze Karte wird unlesbar.
 */
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;                       // Folgezeilen: 1 Byte geht fuer das Leerzeichen drauf
  for (const ch of line) {              // iteriert Code-Points, nie halbe Zeichen
    const n = Buffer.byteLength(ch, 'utf8');
    if (curBytes + n > limit) { out.push(cur); cur = ''; curBytes = 0; limit = 74; }
    cur += ch; curBytes += n;
  }
  if (cur) out.push(cur);
  return out[0] + out.slice(1).map(s => '\r\n ' + s).join('');
}
function rev(ts) {
  const d = ts ? new Date(ts) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
// Dateiname: GEMA-Konvention — keine Umlaute in Dateinamen.
function dateiname(p) {
  const roh = [p.first_name, p.last_name].filter(Boolean).join('_') || p.display_name || 'Kontakt';
  const ascii = String(roh)
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss').replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (ascii || 'Kontakt') + '.vcf';
}
function basisUrl(event) {
  if (process.env.GEMA_SITE_URL) return String(process.env.GEMA_SITE_URL).replace(/\/+$/, '');
  if (process.env.URL) return String(process.env.URL).replace(/\/+$/, '');
  const h = (event.headers || {});
  const host = h['x-forwarded-host'] || h['host'] || h['Host'] || '';
  return host ? 'https://' + host : '';
}

/**
 * Baut die vCard. `p` ist der ROHE Datensatz; welche Felder hinein
 * duerfen, entscheidet ausschliesslich C.feldOeffentlich() — dieselbe
 * Whitelist wie in card-public.js.
 */
function buildVCard(p, opts) {
  opts = opts || {};
  const kartenUrl = opts.basis ? opts.basis + '/p/' + p.slug : '';
  const oeff = f => C.feldOeffentlich(p, f);
  const L = [];
  L.push('BEGIN:VCARD');
  L.push('VERSION:3.0');
  // N: Nachname;Vorname;;;  — fehlt die Aufteilung, wird der Anzeigename
  // als Nachname gefuehrt (besser als ein leeres N, das iOS ablehnt).
  const ln = p.last_name || (p.first_name ? '' : (p.display_name || ''));
  L.push('N:' + esc(ln) + ';' + esc(p.first_name || '') + ';;;');
  L.push('FN:' + esc(p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Kontakt'));
  if (p.company && oeff('company')) L.push('ORG:' + esc(p.company));
  if (p.role_title) L.push('TITLE:' + esc(p.role_title));
  if (p.phone && oeff('phone')) L.push('TEL;TYPE=CELL:' + esc(p.phone));
  if (p.phone_office && oeff('phone_office')) L.push('TEL;TYPE=WORK:' + esc(p.phone_office));
  if (p.email && oeff('email')) L.push('EMAIL;TYPE=WORK:' + esc(p.email));
  if (p.website && oeff('website')) L.push('URL;TYPE=WORK:' + esc(p.website));
  // Der Kartenlink ist IMMER dabei — er ist der lebende Zeiger auf die
  // aktuellen Daten (Grundprinzip 1) und macht die vCard zum Snapshot.
  if (kartenUrl) L.push('URL:' + esc(kartenUrl));
  if (oeff('address') && (p.address || p.zip || p.city)) {
    // ADR: PostBox;Erweiterung;Strasse;Ort;Region;PLZ;Land
    L.push('ADR;TYPE=WORK:;;' + esc(p.address || '') + ';' + esc(p.city || '') + ';;' + esc(p.zip || '') + ';' + esc(p.land || 'Schweiz'));
  }
  if (opts.fotoB64) L.push('PHOTO;ENCODING=b;TYPE=' + (opts.fotoTyp || 'JPEG') + ':' + opts.fotoB64);
  if (kartenUrl) L.push('NOTE:' + esc('Immer aktuelle Kontaktdaten: ' + kartenUrl.replace(/^https?:\/\//, '')));
  L.push('REV:' + rev(p.updated_at));
  L.push('END:VCARD');
  return L.map(fold).join('\r\n') + '\r\n';
}

/* ── Foto laden (best-effort — nie den ganzen Abruf scheitern lassen) ── */
async function fotoLaden(p) {
  const pfad = p.photo_vcard_path || p.photo_path;
  if (!pfad) return null;
  try {
    const f = await C.storageGet(pfad);
    if (!f || !f.buf || !f.buf.length) return null;
    if (f.buf.length > FOTO_MAX_BYTES) return null;
    const typ = /png/i.test(f.type) ? 'PNG' : 'JPEG';
    return { b64: f.buf.toString('base64'), typ: typ };
  } catch (e) { return null; }
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (event.httpMethod !== 'GET') return C.resp(405, { error: 'Method not allowed' });
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });

  if (!C.memLimit('vcf', C.clientIp(event), LIMIT_PRO_MIN, 60000)) {
    return C.resp(429, { error: 'Zu viele Anfragen — bitte kurz warten.' });
  }

  // Der Redirect liefert den Splat inkl. Endung: «abc123XyZ9.vcf»
  const qs = event.queryStringParameters || {};
  const slug = String(qs.slug || '').trim().replace(/\.vcf$/i, '');
  if (!C.slugOk(slug)) return C.resp(400, { error: 'Ungültiger Link' });

  try {
    const p = await C.profilBySlug(slug);
    if (!p) return C.resp(404, { error: 'Karte nicht gefunden' });

    const foto = await fotoLaden(p);
    const vcf = buildVCard(p, {
      basis: basisUrl(event),
      fotoB64: foto ? foto.b64 : null,
      fotoTyp: foto ? foto.typ : null
    });

    await C.logEvent({ slug: p.slug, event: 'vcard', uaHash: C.uaHash(event) });

    const name = dateiname(p);
    return {
      statusCode: 200,
      headers: Object.assign({
        'Content-Type': 'text/vcard; charset=utf-8',
        // filename (ASCII) + filename* (UTF-8) — aeltere Clients nehmen
        // das erste, moderne das zweite.
        'Content-Disposition': 'attachment; filename="' + name + '"; filename*=UTF-8\'\'' + encodeURIComponent(name),
        // KRITISCH: no-store. Die vCard MUSS jedes Mal frisch entstehen.
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }, C.CORS),
      body: vcf
    };
  } catch (e) {
    return C.resp(502, { error: 'vCard konnte nicht erzeugt werden' });
  }
};

// Fuer den Drift-Guard (scripts/card_vcard_test.mjs) exportiert.
exports._intern = { buildVCard, fold, esc, dateiname, rev };
