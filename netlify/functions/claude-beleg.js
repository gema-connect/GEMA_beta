/**
 * claude-beleg.js — Anthropic-Proxy für die Beleg-Analyse im Fahrzeugmanagement
 *
 * Liest Garagen-Rechnungen, Service-Belege und Quittungen (PDF/Bild/Text) und
 * liefert die Angaben strukturiert zurück: welches Fahrzeug (Kennzeichen +
 * Modell zur Gegenprüfung), was gemacht wurde, was es gekostet hat.
 *
 * POST  { text?, fileBase64?, mediaType?, filename?, fahrzeuge? }
 *   text        Belegtext (bevorzugt — schnell, kein Vision-Durchlauf)
 *   fileBase64  PDF/Bild als Base64 (mit oder ohne data:-Präfix)
 *   fahrzeuge   [{nr,kennzeichen,modell}] — die Flotte der eigenen Org.
 *               Nur diese drei Felder, damit die Zuordnung serverseitig
 *               gegengeprüft werden kann; KEINE Fahrer-/Adressdaten.
 *
 * Antwort { ok:true, data:{…}, usage } bzw. { ok:false, error }
 *
 * ⚠ Auth: JWT-Pflicht (requireAuth) — kein offener, kostenpflichtiger Proxy.
 *
 * Modell: bewusst claude-haiku-4-5 (Default). Ein Beleg-Stapel sind bis zu
 * 50 Einzel-Calls; Haiku ist für diese Struktur-Extraktion schnell und
 * günstig genug und hält das Netlify-Function-Limit (~10 s) ein. Für
 * schwierige Scans lässt sich das Modell per ANTHROPIC_BELEG_MODEL ohne
 * Deploy-Änderung hochziehen.
 */
const { requireAuth } = require('./_jwt');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = process.env.ANTHROPIC_BELEG_MODEL || 'claude-haiku-4-5';
const MAX_TOKENS = 4000;
// Netlify-Sync-Functions haben ~6 MB Request-Limit → Base64 begrenzen.
const MAX_B64 = 4500000; // ~3.3 MB Datei
const MAX_FLOTTE = 400;  // Kennzeichen-Liste im Prompt deckeln

const SYSTEM_PROMPT = [
  'Du bist ein Extraktions-Assistent für Fahrzeug-Belege eines Schweizer Gebäudetechnik-Betriebs.',
  'Du erhältst eine Garagen-Rechnung, einen Service-Beleg, eine Quittung oder eine Gutschrift.',
  'Extrahiere die Angaben SACHLICH und erfinde nichts. Regeln:',
  '1. Kennzeichen: Schweizer Format «ZH 123456» / «BE 12345» (Kanton-Kürzel + Nummer).',
  '   Gib es normalisiert als «KANTON NUMMER» in Grossbuchstaben zurück, ohne Punkte.',
  '   Steht kein Kennzeichen auf dem Beleg, lass das Feld leer — rate NIE.',
  '2. fahrzeugModell: Marke/Modell so wie es auf dem Beleg steht (z. B. «VW Caddy Cargo»).',
  '   Dient der Gegenprüfung gegen die Fahrzeugliste — auch hier nicht raten.',
  '3. fahrgestellNr: falls vorhanden (VIN, 17 Zeichen).',
  '4. datum: Rechnungs-/Leistungsdatum als ISO YYYY-MM-DD. Schweizer Schreibweise',
  '   (31.12.2025) umrechnen. Kein Datum erkennbar → leer lassen.',
  '5. art: eine von service | reparatur | mfk | pneuwechsel | sonstiges.',
  '   MFK/Motorfahrzeugkontrolle/Prüfung → mfk. Reifen/Pneu/Räder → pneuwechsel.',
  '   Wartung/Inspektion/Servicearbeit → service. Defektbehebung/Ersatzteil → reparatur.',
  '6. beschreibung: 1–3 Sätze, WAS gemacht wurde (die Arbeitspositionen zusammengefasst).',
  '   Keine Preise in die Beschreibung, keine Werbefloskeln, keine Adressen.',
  '7. kosten: Endbetrag der Rechnung inkl. MwSt als Zahl (Punkt als Dezimaltrennzeichen,',
  '   ohne Währung, ohne Tausendertrennzeichen). Bei einer Gutschrift negativ.',
  '   Steht nur ein Netto-Betrag da, nimm diesen und setze mwstEnthalten auf false.',
  '8. werkstatt: Firmenname des Ausstellers (Garage/Werkstatt), ohne Adresse.',
  '9. km: Kilometerstand, falls auf dem Beleg vermerkt, als Zahl ohne Trennzeichen.',
  '10. rechnungsNr: Rechnungs-/Belegnummer, falls vorhanden.',
  '11. positionen: die einzelnen Arbeits-/Materialpositionen mit Betrag, falls',
  '    erkennbar (max. 25). Ohne klare Positionen leeres Array.',
  '12. sicherheit: wie sicher die Zuordnung zum Fahrzeug ist — «hoch» nur, wenn ein',
  '    eindeutiges Kennzeichen auf dem Beleg steht, «mittel» bei Fahrgestell-Nr. oder',
  '    eindeutigem Modell, «tief» wenn du raten müsstest.',
  '13. hinweis: kurzer Klartext, falls etwas unklar/widersprüchlich ist (z. B.',
  '    «Kennzeichen unleserlich», «zwei Fahrzeuge auf einem Beleg»). Sonst leer.',
  'Antworte AUSSCHLIESSLICH über das Tool.'
].join('\n');

const TOOL = {
  name: 'beleg_extrahieren',
  description: 'Gibt die aus dem Fahrzeug-Beleg extrahierten Angaben strukturiert zurück.',
  input_schema: {
    type: 'object',
    properties: {
      kennzeichen:    { type: 'string', description: 'Kennzeichen normalisiert «ZH 123456», leer wenn nicht erkennbar' },
      fahrzeugModell: { type: 'string', description: 'Marke/Modell laut Beleg, leer wenn nicht erkennbar' },
      fahrgestellNr:  { type: 'string', description: 'VIN/Fahrgestellnummer, leer wenn nicht vorhanden' },
      datum:          { type: 'string', description: 'ISO YYYY-MM-DD, leer wenn nicht erkennbar' },
      art:            { type: 'string', enum: ['service', 'reparatur', 'mfk', 'pneuwechsel', 'sonstiges'] },
      beschreibung:   { type: 'string', description: 'Was wurde gemacht (1–3 Sätze, ohne Preise)' },
      kosten:         { type: 'number', description: 'Endbetrag inkl. MwSt, Punkt als Dezimaltrennzeichen' },
      mwstEnthalten:  { type: 'boolean', description: 'true wenn der Betrag inkl. MwSt ist' },
      werkstatt:      { type: 'string', description: 'Firmenname des Ausstellers' },
      km:             { type: 'number', description: 'Kilometerstand laut Beleg' },
      rechnungsNr:    { type: 'string', description: 'Rechnungs-/Belegnummer' },
      positionen: {
        type: 'array',
        description: 'Einzelpositionen, falls erkennbar (max. 25)',
        items: {
          type: 'object',
          properties: {
            bezeichnung: { type: 'string' },
            betrag:      { type: 'number' }
          },
          required: ['bezeichnung']
        }
      },
      sicherheit: { type: 'string', enum: ['hoch', 'mittel', 'tief'] },
      hinweis:    { type: 'string', description: 'Klartext-Hinweis bei Unklarheiten, sonst leer' }
    },
    required: ['art', 'sicherheit']
  }
};

function _stripDataUrl(b64) {
  if (typeof b64 !== 'string') return '';
  const i = b64.indexOf('base64,');
  return i >= 0 ? b64.slice(i + 7) : b64;
}

// Flottenliste als kompakte Prompt-Zeilen. Bewusst NUR Nummer/Kennzeichen/
// Modell — die Zuordnung braucht nicht mehr, und Fahrernamen oder Adressen
// haben in einem externen Aufruf nichts verloren.
function _flottenText(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const zeilen = [];
  for (let i = 0; i < list.length && zeilen.length < MAX_FLOTTE; i++) {
    const f = list[i] || {};
    const kz = String(f.kennzeichen || '').trim();
    const mo = String(f.modell || '').trim();
    const nr = String(f.nr || '').trim();
    if (!kz && !mo) continue;
    zeilen.push('- ' + (kz || '(ohne Kennzeichen)') + (mo ? ' — ' + mo : '') + (nr ? ' [' + nr + ']' : ''));
  }
  if (!zeilen.length) return '';
  return '\n\nFahrzeuge dieses Betriebs (Kennzeichen — Modell [interne Nr.]):\n' + zeilen.join('\n') +
    '\n\nPrüfe das erkannte Kennzeichen gegen diese Liste. Passt das Modell auf dem Beleg' +
    ' nicht zum Modell des Fahrzeugs mit diesem Kennzeichen, vermerke das in «hinweis»' +
    ' und setze «sicherheit» auf «mittel» oder «tief». Erfinde KEIN Kennzeichen aus der Liste,' +
    ' wenn auf dem Beleg keines steht.';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  // Auth-Gate (Review S3): nur eingeloggte GEMA-User — kein offener Proxy.
  if (!requireAuth(event)) {
    return { statusCode: 401, headers: cors, body: JSON.stringify({ ok: false, error: 'Nicht angemeldet' }) };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY ist nicht konfiguriert.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Ungültiges JSON' }) }; }

  const text = String(body.text || '').trim();
  const fileBase64 = _stripDataUrl(body.fileBase64 || '');
  let mediaType = String(body.mediaType || '').toLowerCase();
  const filename = String(body.filename || '').toLowerCase();

  if (!fileBase64 && !text) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Kein Text und keine Datei übergeben' }) };
  }
  if (fileBase64 && fileBase64.length > MAX_B64) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ ok: false, error: 'Datei zu gross (max ~3 MB). Bitte kleineres PDF/Foto wählen.' }) };
  }
  if (text && !fileBase64 && text.length > 60000) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ ok: false, error: 'Text zu lang (max 60000 Zeichen).' }) };
  }

  const flotte = _flottenText(body.fahrzeuge);

  // Content-Blöcke: Dokument/Bild VOR dem Instruktions-Text (API-Empfehlung).
  const content = [];
  if (fileBase64) {
    if (!mediaType) {
      mediaType = filename.endsWith('.pdf') ? 'application/pdf'
        : (filename.endsWith('.png') ? 'image/png'
          : (filename.endsWith('.webp') ? 'image/webp'
            : (filename.endsWith('.gif') ? 'image/gif' : 'image/jpeg')));
    }
    if (mediaType === 'application/pdf') {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } });
    } else if (mediaType.indexOf('image/') === 0) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } });
    } else {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Nicht unterstützter Dateityp: ' + mediaType }) };
    }
    content.push({ type: 'text', text: 'Extrahiere die Beleg-Angaben aus diesem Dokument.' + (text ? ('\n\nZusätzlicher Text:\n' + text) : '') + flotte });
  } else {
    content.push({ type: 'text', text: 'Extrahiere die Beleg-Angaben aus dem folgenden Belegtext:\n\n' + text + flotte });
  }

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'beleg_extrahieren' },
        messages: [{ role: 'user', content: content }]
      })
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return { statusCode: resp.status, headers: cors, body: JSON.stringify({ ok: false, error: 'Anthropic-Fehler: ' + resp.status + ' ' + errBody.slice(0, 500) }) };
    }

    const data = await resp.json();
    const toolBlock = (data.content || []).find(function (b) { return b && b.type === 'tool_use' && b.name === 'beleg_extrahieren'; });
    if (!toolBlock || !toolBlock.input) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'Keine strukturierte Antwort erhalten.' }) };
    }
    const out = toolBlock.input;
    out.positionen = Array.isArray(out.positionen) ? out.positionen : [];
    if (['hoch', 'mittel', 'tief'].indexOf(out.sicherheit) < 0) out.sicherheit = 'tief';

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, data: out, usage: data.usage || null })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'Proxy-Fehler: ' + (e.message || String(e)) }) };
  }
};
