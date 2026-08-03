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
/**
 * Obergrenze fuer das eingebettete Bild.
 *
 * KRITISCH — die Grenze war 40 KB und hat das Foto in der Praxis
 * verschluckt: die kleine vCard-Fassung liegt zwar bei ~15 KB, das
 * Anzeigebild (512 px, q 0.85) aber bei 40–90 KB. Sobald die kleine
 * Fassung fehlte (Altbestand, Merge aus einem Duplikat, fehlgeschlagener
 * Teil-Upload) fiel die Kette auf das Anzeigebild zurueck — und genau das
 * lag ueber der Grenze. Ergebnis: Foto auf der Karte sichtbar, im
 * gespeicherten Kontakt fehlt es, ohne jede Meldung.
 *
 * 256 KB deckt beide Fassungen sicher ab (base64 ≈ 341 KB, unkritisch
 * fuer iOS/Android/Outlook und weit unter dem Netlify-Antwortlimit) und
 * weist nur noch wirklich absurde Bilder ab.
 */
const FOTO_MAX_BYTES = 256 * 1024;

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

/**
 * Foto laden (best-effort — nie den ganzen Abruf scheitern lassen).
 *
 * KANDIDATEN-KETTE statt EINEM Versuch: zuerst die kleine vCard-Fassung
 * (~15 KB, von Adressbuechern am zuverlaessigsten akzeptiert), danach das
 * Anzeigebild. Vorher wurde genau EIN Pfad gewaehlt und bei jedem Problem
 * aufgegeben — ein fehlendes/unlesbares `foto_s.jpg` liess den Kontakt
 * dauerhaft ohne Bild, obwohl das Anzeigebild daneben lag und auf der
 * Kartenseite einwandfrei erschien.
 *
 * `laden` ist injizierbar, damit der Drift-Guard die Kette ohne Netz
 * pruefen kann.
 */
async function fotoLaden(p, laden) {
  const get = laden || C.storageGet;
  const kandidaten = [];
  [p.photo_vcard_path, p.photo_path].forEach(function (pfad) {
    if (pfad && kandidaten.indexOf(pfad) < 0) kandidaten.push(pfad);
  });
  if (!kandidaten.length) return null;

  const gruende = [];
  for (const pfad of kandidaten) {
    let f = null;
    try { f = await get(pfad); } catch (e) { f = null; }
    if (!f || !f.buf || !f.buf.length) { gruende.push(pfad + ': nicht ladbar'); continue; }
    if (f.buf.length > FOTO_MAX_BYTES) { gruende.push(pfad + ': ' + Math.round(f.buf.length / 1024) + ' KB > Limit'); continue; }
    const typ = /png/i.test(f.type) ? 'PNG' : 'JPEG';
    return { b64: f.buf.toString('base64'), typ: typ, pfad: pfad };
  }
  // Nie wieder still: wenn ein Bild hinterlegt ist, aber keines in die
  // vCard kommt, MUSS der Grund im Log stehen.
  console.warn('[card-vcard] kein Foto eingebettet —', gruende.join(' | '));
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return C.preflight();
  if (event.httpMethod !== 'GET') return C.resp(405, { error: 'Method not allowed' });
  if (!C.configured()) return C.resp(500, { error: 'Server nicht konfiguriert' });

  if (!C.memLimit('vcf', C.clientIp(event), LIMIT_PRO_MIN, 60000)) {
    return C.resp(429, { error: 'Zu viele Anfragen — bitte kurz warten.' });
  }

  // Der Redirect liefert den Splat inkl. Endung: «abc123XyZ9.vcf» — und
  // je nach Plattform gar nicht (siehe C.slugAusEvent), darum auch aus dem
  // Pfad lesen.
  const slug = C.slugAusEvent(event, 'v').replace(/\.vcf$/i, '');
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
    if (C.istFehlendeTabelle(e)) return C.fehlerAntwort(e, 'card-vcard');
    console.error('[card-vcard]', e && e.message);
    return C.resp(502, { error: 'vCard konnte nicht erzeugt werden' });
  }
};

// Fuer den Drift-Guard (scripts/card_test.mjs) exportiert.
exports._intern = { buildVCard, fold, esc, dateiname, rev, fotoLaden, FOTO_MAX_BYTES };
