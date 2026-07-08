/**
 * netlify/functions/claude-extract.js
 *
 * Proxy für die Anthropic Claude API — Dokument-Analyse (Wareneingang).
 * Analysiert Rechnungen / Lieferscheine / Auftragsbestätigungen (Text, PDF
 * oder Bild) und extrahiert die Artikelpositionen als strukturiertes JSON
 * (erzwungenes Tool-Use, damit die Antwort immer valides JSON gegen das
 * Schema ist). Der API-Key bleibt serverseitig (ANTHROPIC_API_KEY).
 *
 * Browser-Aufruf via gema_claude.js:
 *   POST /.netlify/functions/claude-extract
 *   { text?: '...', fileBase64?: '<base64>', mediaType?: 'application/pdf'|'image/png'|..., filename?: '...' }
 *
 * Antwort:
 *   { ok:true, data:{ lieferant, bestellnummer, bestelldatum, positionen:[{artikelNr,bezeichnung,menge}] }, usage }
 *   { ok:false, error:'...' }
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Günstiges, vision-fähiges Modell für die Massen-Extraktion (Review-Grid im
// Modul fängt Fehler ab). Per Env übersteuerbar (z.B. auf claude-sonnet-5
// oder claude-opus-4-8 für schwierige Scans).
const MODEL = process.env.ANTHROPIC_EXTRACT_MODEL || 'claude-haiku-4-5';
const MAX_TOKENS = 8000;
// Netlify-Sync-Functions haben ~6 MB Request-Limit → Base64 begrenzen.
const MAX_B64 = 4500000; // ~3.3 MB Datei

const SYSTEM_PROMPT =
  'Du bist ein Extraktions-Assistent für ein Schweizer Sanitär-Lager. ' +
  'Analysiere das übergebene Dokument (Rechnung, Lieferschein oder Auftragsbestätigung) ' +
  'und extrahiere ALLE bestellten bzw. gelieferten Artikelpositionen. ' +
  'Gib die Daten AUSSCHLIESSLICH über das Tool «positionen_extrahieren» zurück. ' +
  'Regeln: ' +
  '(1) menge = Stückzahl als reine Zahl, ohne Einheit (Schweizer Format 1\'000.5 → 1000.5). ' +
  '(2) artikelNr = Artikel-/Bestellnummer des Lieferanten (leer lassen, wenn keine vorhanden). ' +
  '(3) bezeichnung = Artikelbezeichnung/Beschreibung. ' +
  '(4) Ignoriere ALLE Nicht-Artikel-Zeilen — sie duerfen NICHT als Position erscheinen: ' +
  'Summen/Zwischensummen/Total, MwSt/Steuer, Rabatte/Skonto, sowie saemtliche Nebenkosten ' +
  'wie Fracht-/Frachtkosten, Versand-/Liefer-/Transportkosten, Porto, Verpackung/Verpackungskosten, ' +
  'Paket-/Kleinpaket-/Paketpauschale (z.B. «Paket klein», «Kleinpaket»), Mindermengen-/Kleinmengenzuschlag, ' +
  'Palettenpfand/Gebindepfand, Bearbeitungs-/Handling-/Verwaltungsgebuehr, vorgezogene Entsorgungsgebuehr (VEG/vRG), ' +
  'Zuschlaege/Gebuehren jeder Art sowie reine Kopf-/Fusszeilen. Nur echte bestellte/gelieferte Sanitaerartikel zaehlen. ' +
  '(5) Wenn erkennbar, gib zusätzlich lieferant (Firmenname), bestellnummer und bestelldatum an ' +
  '(bestelldatum als ISO YYYY-MM-DD, wenn möglich). ' +
  'Erfinde keine Positionen. Wenn keine Positionen erkennbar sind, gib eine leere Liste zurück.';

const TOOL = {
  name: 'positionen_extrahieren',
  description: 'Gibt die aus dem Dokument extrahierten Artikelpositionen und Kopfdaten strukturiert zurück.',
  input_schema: {
    type: 'object',
    properties: {
      lieferant: { type: 'string', description: 'Firmenname des Lieferanten, falls erkennbar' },
      bestellnummer: { type: 'string', description: 'Bestell-/Auftragsnummer, falls erkennbar' },
      bestelldatum: { type: 'string', description: 'Bestell-/Lieferdatum, ISO YYYY-MM-DD falls möglich' },
      positionen: {
        type: 'array',
        description: 'Nur echte bestellte/gelieferte Sanitaerartikel. KEINE Nebenkosten wie Fracht/Versand/Porto, Verpackung, «Paket klein»/Kleinpaket, Mindermengenzuschlag, Gebuehren, Rabatte, MwSt oder Summenzeilen.',
        items: {
          type: 'object',
          properties: {
            artikelNr: { type: 'string', description: 'Lieferanten-Artikelnummer (leer wenn keine)' },
            bezeichnung: { type: 'string', description: 'Artikelbezeichnung' },
            menge: { type: 'number', description: 'Stückzahl als Zahl' }
          },
          required: ['bezeichnung']
        }
      }
    },
    required: ['positionen']
  }
};

function _stripDataUrl(b64) {
  if (typeof b64 !== 'string') return '';
  const i = b64.indexOf('base64,');
  return i >= 0 ? b64.slice(i + 7) : b64;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'ANTHROPIC_API_KEY ist nicht konfiguriert.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Ungültiges JSON' }) }; }

  const text = String(body.text || '').trim();
  let fileBase64 = _stripDataUrl(body.fileBase64 || '');
  let mediaType = String(body.mediaType || '').toLowerCase();
  const filename = String(body.filename || '').toLowerCase();

  if (!fileBase64 && !text) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Kein Text und keine Datei übergeben' }) };
  }
  if (fileBase64 && fileBase64.length > MAX_B64) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ ok: false, error: 'Datei zu gross (max ~3 MB). Bitte kleineres PDF/Bild oder Text einfügen.' }) };
  }
  if (text && !fileBase64 && text.length > 60000) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ ok: false, error: 'Text zu lang (max 60000 Zeichen).' }) };
  }

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
      return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Nicht unterstützter Dateityp: ' + mediaType } ) };
    }
    content.push({ type: 'text', text: 'Extrahiere alle Artikelpositionen aus diesem Dokument.' + (text ? ('\n\nZusätzlicher Text:\n' + text) : '') });
  } else {
    content.push({ type: 'text', text: 'Extrahiere alle Artikelpositionen aus dem folgenden Dokumenttext:\n\n' + text });
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
        tool_choice: { type: 'tool', name: 'positionen_extrahieren' },
        messages: [{ role: 'user', content: content }]
      })
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return { statusCode: resp.status, headers: cors, body: JSON.stringify({ ok: false, error: 'Anthropic-Fehler: ' + resp.status + ' ' + errBody.slice(0, 500) }) };
    }

    const data = await resp.json();
    const toolBlock = (data.content || []).find(function (b) { return b && b.type === 'tool_use' && b.name === 'positionen_extrahieren'; });
    if (!toolBlock || !toolBlock.input) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'Keine strukturierte Antwort erhalten.' }) };
    }
    const out = toolBlock.input;
    out.positionen = Array.isArray(out.positionen) ? out.positionen : [];

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, data: out, usage: data.usage || null })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'Proxy-Fehler: ' + (e.message || String(e)) }) };
  }
};
