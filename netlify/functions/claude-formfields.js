/**
 * netlify/functions/claude-formfields.js
 *
 * Proxy für die Anthropic Claude API — Analyse von Behörden-/Formular-PDFs.
 * Erkennt die auszufüllenden Felder eines Formulars und schlägt pro Feld eine
 * Zuordnung zu GEMA-Projektdaten vor (Objekt-Stammdaten, Beteiligte, eigene
 * Firma). Der API-Key bleibt serverseitig (ANTHROPIC_API_KEY).
 *
 * Zwei Modi:
 *  (a) AcroForm bereits clientseitig via pdf-lib gelesen → fieldNames[] wird
 *      mitgeschickt; die KI ordnet nur zu (label + gemaMap + behoerde).
 *  (b) Flaches/gescanntes PDF → fileBase64; die KI liest die sichtbaren
 *      Feldbezeichnungen heraus und schlägt Feld + Zuordnung vor.
 *
 * Browser-Aufruf via gema_claude.js:
 *   POST /.netlify/functions/claude-formfields
 *   { fileBase64?, mediaType?, filename?, fieldNames?:[{name,label,type}], text? }
 *
 * Antwort: { ok:true, data:{ behoerde, felder:[{name,label,typ,gemaMap}] }, usage }
 */

const { requireAuth } = require('./_jwt');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = process.env.ANTHROPIC_FORMFIELDS_MODEL || process.env.ANTHROPIC_EXTRACT_MODEL || 'claude-haiku-4-5';
const MAX_TOKENS = 8000;
const MAX_B64 = 4500000; // ~3.3 MB

// Erlaubte gemaMap-Schlüssel (die KI MUSS einen davon oder '' wählen).
const GEMA_KEYS = [
  'objekt.name','objekt.strasse','objekt.plz','objekt.ort','objekt.plzort','objekt.kanton','objekt.gemeinde','objekt.projektnummer','objekt.bauvorhaben',
  'bauherr.firma','bauherr.name','bauherr.strasse','bauherr.plzort','bauherr.telefon','bauherr.email',
  'architekt.firma','architekt.name','architekt.strasse','architekt.plzort','architekt.telefon','architekt.email',
  'planer.firma','planer.name','planer.strasse','planer.plzort','planer.telefon','planer.email',
  'unternehmer.firma','unternehmer.name','unternehmer.strasse','unternehmer.plzort','unternehmer.telefon','unternehmer.email',
  'org.name','org.strasse','org.plzort','org.telefon','org.email',
  'user.name','user.email','datum.heute',''
];

const SYSTEM_PROMPT =
  'Du bist ein Assistent für ein Schweizer Gebäudetechnik-Planungsbüro. ' +
  'Analysiere ein Behörden-/Amtsformular (z.B. Baugesuch, Feuerpolizei, Gewässerschutz, VKF, SUVA, Kaminfeger, Installationsanzeige) ' +
  'und gib die auszufüllenden Felder AUSSCHLIESSLICH über das Tool «formular_analysieren» zurück. ' +
  'Für JEDES Feld: ' +
  '(1) name = technischer Feldname (bei AcroForm exakt der übergebene Feldname; sonst eine kurze eindeutige ID). ' +
  '(2) label = die menschenlesbare Beschriftung des Feldes im Formular (Deutsch, echte Umlaute). ' +
  '(3) typ = "text", "checkbox" oder "dropdown". ' +
  '(4) gemaMap = die GEMA-Datenquelle, aus der das Feld sinnvoll vorbefüllt werden kann, ODER "" wenn keine passt. ' +
  'Erlaubte gemaMap-Werte (WÄHLE GENAU EINEN DAVON oder ""): ' + GEMA_KEYS.filter(function(k){return k;}).join(', ') + '. ' +
  'Zuordnungs-Hilfe: Bauobjekt/Baustelle/Standort/Bauadresse → objekt.strasse bzw. objekt.plzort; Parzelle/Projekt-Nr → objekt.projektnummer; ' +
  'Bauherr/Eigentümer/Gesuchsteller → bauherr.*; Architekt/Projektverfasser → architekt.*; Sanitär-/Fachplaner/Ingenieur → planer.*; ' +
  'ausführende Firma/Installateur/Unternehmer → unternehmer.*; Absender/eigene Firma → org.*; Sachbearbeiter/Kontaktperson → user.* oder planer.name; Datum/Ort und Datum → datum.heute. ' +
  'Wähle bei Adresszeilen objekt.strasse für Strasse+Nr und objekt.plzort für «PLZ Ort». Erfinde keine Felder, die nicht existieren.';

function _tool(){
  return {
    name: 'formular_analysieren',
    description: 'Gibt die erkannten Formularfelder mit Beschriftung, Typ und GEMA-Zuordnung zurück.',
    input_schema: {
      type: 'object',
      properties: {
        behoerde: { type: 'string', description: 'Erkannte Behörde/Amt bzw. Formular-Titel (z.B. «Feuerpolizei Baugesuch»), falls erkennbar' },
        felder: {
          type: 'array',
          description: 'Alle auszufüllenden Felder des Formulars.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Technischer Feldname (bei AcroForm exakt der übergebene Name)' },
              label: { type: 'string', description: 'Menschenlesbare Feldbeschriftung' },
              typ: { type: 'string', enum: ['text','checkbox','dropdown'], description: 'Feldtyp' },
              gemaMap: { type: 'string', enum: GEMA_KEYS, description: 'GEMA-Datenquelle zum Vorbefüllen oder leer' }
            },
            required: ['name','label','typ','gemaMap']
          }
        }
      },
      required: ['felder']
    }
  };
}

function _stripDataUrl(b64){ if(typeof b64!=='string')return ''; var i=b64.indexOf('base64,'); return i>=0?b64.slice(i+7):b64; }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS' }, body: '' };
  }
  const cors = { 'Access-Control-Allow-Origin':'*','Content-Type':'application/json' };
  if (event.httpMethod !== 'POST') return { statusCode:405, headers:cors, body:JSON.stringify({ok:false,error:'Method not allowed'}) };
  // Auth-Gate (Review S3): nur eingeloggte GEMA-User — kein offener Proxy.
  if (!requireAuth(event)) return { statusCode:401, headers:cors, body:JSON.stringify({ok:false,error:'Nicht angemeldet'}) };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { statusCode:500, headers:cors, body:JSON.stringify({ok:false,error:'ANTHROPIC_API_KEY ist nicht konfiguriert.'}) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e){ return { statusCode:400, headers:cors, body:JSON.stringify({ok:false,error:'Ungültiges JSON'}) }; }

  let fileBase64 = _stripDataUrl(body.fileBase64 || '');
  let mediaType = String(body.mediaType || '').toLowerCase();
  const filename = String(body.filename || '').toLowerCase();
  const fieldNames = Array.isArray(body.fieldNames) ? body.fieldNames.slice(0, 400) : null;
  const text = String(body.text || '').trim();

  if (!fileBase64 && !(fieldNames && fieldNames.length) && !text) {
    return { statusCode:400, headers:cors, body:JSON.stringify({ok:false,error:'Kein PDF, keine Feldnamen und kein Text übergeben'}) };
  }
  if (fileBase64 && fileBase64.length > MAX_B64) {
    return { statusCode:413, headers:cors, body:JSON.stringify({ok:false,error:'Datei zu gross (max ~3 MB). Bitte kleineres PDF.'}) };
  }

  const content = [];
  // AcroForm-Feldnamen (bevorzugt — genauer und billiger)
  if (fieldNames && fieldNames.length) {
    var fnTxt = fieldNames.map(function(f){ return '- name="'+String(f.name||'')+'"'+(f.label?(' label="'+String(f.label)+'"'):'')+(f.type?(' typ='+String(f.type)):''); }).join('\n');
    content.push({ type:'text', text:'Dieses PDF ist ein ausfüllbares Formular (AcroForm). Ordne JEDEN der folgenden Feldnamen einer Beschriftung, einem Typ und einer GEMA-Datenquelle zu. Verwende die name-Werte EXAKT:\n\n'+fnTxt+(text?('\n\nZusatzkontext:\n'+text):'') });
    if (fileBase64 && mediaType==='application/pdf') {
      // Das PDF zusätzlich mitgeben hilft der KI, die Labels/Kontext zu erkennen
      content.unshift({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:fileBase64 } });
    }
  } else {
    // Flaches PDF / Bild / Text
    if (fileBase64) {
      if (!mediaType) mediaType = filename.endsWith('.pdf')?'application/pdf':(filename.endsWith('.png')?'image/png':(filename.endsWith('.webp')?'image/webp':'image/jpeg'));
      if (mediaType==='application/pdf') content.push({ type:'document', source:{ type:'base64', media_type:'application/pdf', data:fileBase64 } });
      else if (mediaType.indexOf('image/')===0) content.push({ type:'image', source:{ type:'base64', media_type:mediaType, data:fileBase64 } });
      else return { statusCode:400, headers:cors, body:JSON.stringify({ok:false,error:'Nicht unterstützter Dateityp: '+mediaType}) };
      content.push({ type:'text', text:'Erkenne die auszufüllenden Felder dieses Formulars (Beschriftung, Typ) und schlage je Feld eine GEMA-Zuordnung vor.'+(text?('\n\nZusatzkontext:\n'+text):'') });
    } else {
      content.push({ type:'text', text:'Erkenne die auszufüllenden Felder aus diesem Formulartext:\n\n'+text });
    }
  }

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method:'POST',
      headers:{ 'x-api-key':key, 'anthropic-version':ANTHROPIC_VERSION, 'content-type':'application/json' },
      body: JSON.stringify({ model:MODEL, max_tokens:MAX_TOKENS, system:SYSTEM_PROMPT, tools:[_tool()], tool_choice:{type:'tool',name:'formular_analysieren'}, messages:[{role:'user',content:content}] })
    });
    if (!resp.ok) { const errBody = await resp.text(); return { statusCode:resp.status, headers:cors, body:JSON.stringify({ok:false,error:'Anthropic-Fehler: '+resp.status+' '+errBody.slice(0,500)}) }; }
    const data = await resp.json();
    const tb = (data.content||[]).find(function(b){ return b && b.type==='tool_use' && b.name==='formular_analysieren'; });
    if (!tb || !tb.input) return { statusCode:200, headers:cors, body:JSON.stringify({ok:false,error:'Keine strukturierte Antwort erhalten.'}) };
    const out = tb.input;
    out.felder = Array.isArray(out.felder) ? out.felder : [];
    return { statusCode:200, headers:cors, body:JSON.stringify({ok:true, data:out, usage:data.usage||null}) };
  } catch(e) {
    return { statusCode:500, headers:cors, body:JSON.stringify({ok:false,error:'Proxy-Fehler: '+(e.message||String(e))}) };
  }
};
