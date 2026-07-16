/**
 * netlify/functions/claude-rewrite.js
 *
 * Proxy für die Anthropic Claude API. Hält den API-Key serverseitig
 * (ANTHROPIC_API_KEY in Netlify-Env), validiert minimal und ruft
 * Anthropic Messages API.
 *
 * Browser-Aufruf via gema_claude.js:
 *   POST /.netlify/functions/claude-rewrite
 *   { mode: 'rewrite'|'bulletpoints'|'fix'|'shorten'|'expand', text: '...' }
 *
 * Antwort:
 *   { ok:true, text: '...' }   bei Erfolg
 *   { ok:false, error:'...' }  bei Fehler
 */

const { requireAuth } = require('./_jwt');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-haiku-4-5-20251001';  // schnell + günstig für Textüberarbeitung
const MAX_TOKENS = 1024;

const PROMPTS = {
  rewrite: 'Du bist ein professioneller Bauberichts-Redakteur. Formuliere den folgenden Text klar, sachlich und in vollständigen Sätzen für einen Spengler-Inspektionsbericht. Behalte alle Fakten bei, korrigiere Rechtschreib- und Grammatikfehler, mache die Sprache präzise und fachlich. Antworte NUR mit dem überarbeiteten Text, keine Einleitung oder Kommentare. Schreibe in Schweizer Hochdeutsch (keine ß).',
  bulletpoints: 'Wandle den folgenden Stichpunkt-Text in einen fliessenden, sachlichen Berichtstext um. Vollständige Sätze, fachlich präzise, kein Listenformat, keine Aufzählungspunkte. Schweizer Hochdeutsch (keine ß). Antworte NUR mit dem Text.',
  fix: 'Korrigiere Rechtschreib- und Grammatikfehler im folgenden Text, ohne den Inhalt zu verändern. Schweizer Hochdeutsch (keine ß). Antworte NUR mit dem korrigierten Text.',
  shorten: 'Kürze den folgenden Text auf das Wesentliche, ohne wichtige Fakten zu verlieren. Sachlich, präzise. Schweizer Hochdeutsch. Antworte NUR mit dem gekürzten Text.',
  expand: 'Erweitere den folgenden knappen Text zu einem ausführlichen, fachlich präzisen Berichtsabschnitt. Behalte alle Fakten und erfinde keine neuen. Schweizer Hochdeutsch. Antworte NUR mit dem erweiterten Text.'
};

exports.handler = async function(event) {
  // CORS Preflight
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

  const mode = String(body.mode || 'rewrite').toLowerCase();
  const text = String(body.text || '').trim();

  if (!text) return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Kein Text übergeben' }) };
  if (text.length > 8000) return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Text zu lang (max 8000 Zeichen)' }) };

  // Anonymisierungs-Platzhalter (gema_claude.js ersetzt Kundennamen/-adressen
  // client-seitig durch [NAME_n]/[ADRESSE_n] und setzt sie danach wieder ein)
  // müssen die Überarbeitung unverändert überleben.
  const systemPrompt = (PROMPTS[mode] || PROMPTS.rewrite) +
    ' Platzhalter in eckigen Klammern wie [NAME_1] oder [ADRESSE_2] sind anonymisierte Angaben — übernimm sie EXAKT unverändert an der passenden Stelle.';

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
        system: systemPrompt,
        messages: [{ role: 'user', content: text }]
      })
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return { statusCode: resp.status, headers: cors, body: JSON.stringify({ ok: false, error: 'Anthropic-Fehler: ' + resp.status + ' ' + errBody.slice(0, 500) }) };
    }

    const data = await resp.json();
    const out = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text.trim() : '';

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        ok: true,
        text: out,
        usage: data.usage || null
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'Proxy-Fehler: ' + (e.message || String(e)) }) };
  }
};
