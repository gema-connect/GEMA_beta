/**
 * netlify/functions/claude-offertcheck.js
 *
 * Proxy für die Anthropic Claude API — Offert-PDF-Gegencheck (Ausschreibung).
 * Vergleicht das vom Unternehmer hochgeladene Original-Offert-PDF mit den in
 * GEMA erfassten Preisen (Positionen/Beträge aus der Einreichung) und meldet
 * Abweichungen als strukturiertes JSON (erzwungenes Tool-Use). Die KI-Antwort
 * ist eine EINSCHÄTZUNG — massgebend bleibt immer das Original-PDF; der
 * Planer entscheidet selbst. Der API-Key bleibt serverseitig.
 *
 * Browser-Aufruf via gema_claude.js:
 *   POST /.netlify/functions/claude-offertcheck
 *   { fileBase64:'<base64>', mediaType:'application/pdf', filename?:'...', erfasst:'<Text der erfassten Preise>' }
 *
 * Antwort:
 *   { ok:true, data:{ gesamtbetrag_pdf, uebereinstimmung:'ok'|'abweichung'|'unklar', abweichungen:[{position,pdf_wert,erfasst_wert,hinweis}], fazit }, usage }
 *   { ok:false, error:'...' }
 */

const { requireAuth } = require('./_jwt');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Vision-fähiges Standard-Modell; per Env übersteuerbar (z.B. claude-sonnet-5
// für komplexe, mehrseitige Offerten).
const MODEL = process.env.ANTHROPIC_OFFERTCHECK_MODEL || 'claude-haiku-4-5';
const MAX_TOKENS = 8000;
// Netlify-Sync-Functions haben ~6 MB Request-Limit → Base64 begrenzen.
const MAX_B64 = 4500000; // ~3.3 MB Datei

const SYSTEM_PROMPT =
  'Du bist ein Prüf-Assistent für Bau-Ausschreibungen in der Schweiz (Gebäudetechnik). ' +
  'Du erhältst das Original-Offert-PDF eines Unternehmers UND die im System erfassten Preise derselben Offerte. ' +
  'Vergleiche beides und melde das Ergebnis AUSSCHLIESSLICH über das Tool «offerte_pruefen». ' +
  'Regeln: ' +
  '(1) gesamtbetrag_pdf = der im PDF ausgewiesene Offert-Gesamtbetrag als reine Zahl in CHF ' +
  '(Schweizer Format 1\'000.50 → 1000.50); nimm den NETTO-Endbetrag inkl. MwSt, wenn mehrere Totale stehen — ' +
  'sonst den prominentesten Endbetrag. 0, wenn kein Betrag erkennbar. ' +
  '(2) uebereinstimmung = «ok», wenn die erfassten Beträge (insbesondere das Total) mit dem PDF übereinstimmen ' +
  '(Rundungsdifferenzen bis 5 Rappen zählen als ok); «abweichung», wenn Beträge oder Positionen erkennbar abweichen; ' +
  '«unklar», wenn das PDF keine vergleichbaren Beträge zeigt (z.B. gescannt/unleserlich oder nur Beschrieb). ' +
  '(3) abweichungen = eine Zeile pro festgestellter Differenz: position = betroffene Position/Ebene ' +
  '(z.B. «Total», «BKP 254.0 Leitungen», Positionstext), pdf_wert und erfasst_wert als Text ' +
  '(mit Einheit/Währung, wie ausgewiesen), hinweis = kurze Einordnung. ' +
  'Melde auch Positionen, die NUR im PDF oder NUR in der Erfassung vorkommen. ' +
  '(4) fazit = 1–3 Sätze auf Deutsch (Schweizer Hochdeutsch, kein ß): Was stimmt überein, was weicht ab, ' +
  'worauf soll der Planer schauen. ' +
  'Erfinde keine Beträge. Wenn du etwas nicht lesen kannst, sage das im fazit und setze uebereinstimmung auf «unklar».';

const TOOL = {
  name: 'offerte_pruefen',
  description: 'Gibt das Ergebnis des Vergleichs Original-Offert-PDF gegen die erfassten Preise strukturiert zurück.',
  input_schema: {
    type: 'object',
    properties: {
      gesamtbetrag_pdf: { type: 'number', description: 'Offert-Gesamtbetrag laut PDF in CHF als Zahl (0 wenn nicht erkennbar)' },
      uebereinstimmung: { type: 'string', enum: ['ok', 'abweichung', 'unklar'], description: 'Gesamturteil des Vergleichs' },
      abweichungen: {
        type: 'array',
        description: 'Eine Zeile pro festgestellter Differenz (leer, wenn alles übereinstimmt)',
        items: {
          type: 'object',
          properties: {
            position: { type: 'string', description: 'Betroffene Position/Ebene (z.B. «Total», BKP-Gruppe, Positionstext)' },
            pdf_wert: { type: 'string', description: 'Wert laut PDF (mit Einheit/Währung)' },
            erfasst_wert: { type: 'string', description: 'Wert laut Erfassung (mit Einheit/Währung)' },
            hinweis: { type: 'string', description: 'Kurze Einordnung der Differenz' }
          },
          required: ['position']
        }
      },
      fazit: { type: 'string', description: '1–3 Sätze Zusammenfassung für den Planer (Schweizer Hochdeutsch)' }
    },
    required: ['uebereinstimmung', 'fazit']
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  // Auth-Gate: nur eingeloggte GEMA-User — kein offener, kostenpflichtiger Proxy.
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

  const erfasst = String(body.erfasst || '').trim();
  let fileBase64 = _stripDataUrl(body.fileBase64 || '');
  let mediaType = String(body.mediaType || '').toLowerCase();
  const filename = String(body.filename || '').toLowerCase();

  if (!fileBase64) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Kein Offert-PDF übergeben' }) };
  }
  if (!erfasst) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Keine erfassten Preise übergeben' }) };
  }
  if (fileBase64.length > MAX_B64) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ ok: false, error: 'PDF zu gross (max ~3 MB) — Vergleich bitte von Hand gegen das Original.' }) };
  }
  if (erfasst.length > 60000) {
    return { statusCode: 413, headers: cors, body: JSON.stringify({ ok: false, error: 'Erfasste Preise zu umfangreich (max 60000 Zeichen).' }) };
  }

  // Content-Blöcke: Dokument/Bild VOR dem Instruktions-Text (API-Empfehlung).
  const content = [];
  if (!mediaType) {
    mediaType = filename.endsWith('.pdf') ? 'application/pdf'
      : (filename.endsWith('.png') ? 'image/png'
        : (filename.endsWith('.webp') ? 'image/webp'
          : (filename.endsWith('.gif') ? 'image/gif' : 'application/pdf')));
  }
  if (mediaType === 'application/pdf') {
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } });
  } else if (mediaType.indexOf('image/') === 0) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } });
  } else {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Nicht unterstützter Dateityp: ' + mediaType }) };
  }
  content.push({
    type: 'text',
    text: 'Das ist das Original-Offert-PDF des Unternehmers. Vergleiche es mit den folgenden im System erfassten Preisen und melde Abweichungen über das Tool.\n\n=== IM SYSTEM ERFASSTE PREISE ===\n' + erfasst
  });

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
        tool_choice: { type: 'tool', name: 'offerte_pruefen' },
        messages: [{ role: 'user', content: content }]
      })
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return { statusCode: resp.status, headers: cors, body: JSON.stringify({ ok: false, error: 'Anthropic-Fehler: ' + resp.status + ' ' + errBody.slice(0, 500) }) };
    }

    const data = await resp.json();
    const toolBlock = (data.content || []).find(function (b) { return b && b.type === 'tool_use' && b.name === 'offerte_pruefen'; });
    if (!toolBlock || !toolBlock.input) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: false, error: 'Keine strukturierte Antwort erhalten.' }) };
    }
    const out = toolBlock.input;
    out.abweichungen = Array.isArray(out.abweichungen) ? out.abweichungen : [];
    if (['ok', 'abweichung', 'unklar'].indexOf(out.uebereinstimmung) < 0) out.uebereinstimmung = 'unklar';

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ ok: true, data: out, usage: data.usage || null })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'Proxy-Fehler: ' + (e.message || String(e)) }) };
  }
};
