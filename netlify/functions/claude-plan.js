/**
 * netlify/functions/claude-plan.js
 *
 * Proxy für die Anthropic Claude API — Plan-Analyse (pm_plaene.html).
 * Die KI liefert NUR Semantik + Seed-Punkte (Raumlabels, Bemassungen,
 * Geschosshöhen) — die Geometrie (Polygone/Flächen) rechnet der Browser
 * deterministisch via Flood-Fill. Der API-Key bleibt serverseitig.
 *
 * Zwei Modi (erzwungenes Tool-Use → immer valides JSON):
 *  (a) modus='grundriss' (Pass 1): Plantyp, Geschoss, Massstab, Bemassungs-
 *      ketten mit Endpunkten (normalisiert 0..1), Raumliste mit Label-
 *      Positionen (Seed-Punkte für den Flood-Fill) + angeschriebenen m².
 *  (b) modus='schnitt' (Pass 3): Geschosshöhen (licht + Konstruktion),
 *      Dachneigung, Dachform, Kniestock.
 *
 * Browser-Aufruf via gema_claude.js:
 *   POST /.netlify/functions/claude-plan
 *   { imageBase64, mediaType, text?, modus:'grundriss'|'schnitt' }
 *
 * Antwort: { ok:true, data:{...}, usage }
 */

const { requireAuth } = require('./_jwt');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Plan-Lesen (Bemassungsketten, Label-Koordinaten) ist eine anspruchsvolle
// Vision-Aufgabe → leistungsfähiges Default-Modell; pro Projekt nur wenige
// Aufrufe (idempotent gecacht). Per Env übersteuerbar.
const MODEL = process.env.ANTHROPIC_PLAN_MODEL || 'claude-sonnet-5';
const MAX_TOKENS = 8000;
const MAX_B64 = 4500000; // ~3.3 MB

const SYSTEM_GRUNDRISS =
  'Du bist ein Bauplan-Analyst für ein Schweizer Gebäudetechnik-Planungsbüro. ' +
  'Du bekommst EINE gerenderte Planseite (Architektenplan) als Bild, optional den extrahierten PDF-Textlayer als Kontext. ' +
  'Gib dein Ergebnis AUSSCHLIESSLICH über das Tool «grundriss_analysieren» zurück. Regeln: ' +
  '(1) plantyp: klassifiziere die Seite (grundriss/schnitt/ansicht/situationsplan/detail/legende). ' +
  '(2) geschoss: die Geschossbezeichnung aus dem Plankopf (z.B. «1. OG», «EG», «UG»); geschoss_index: UG=-1, EG=0, 1.OG=1 usw. ' +
  '(3) massstab: aus dem Plankopf (z.B. «1:50»). ' +
  '(4) bemassungen: lies Massketten ab — NUR eindeutige, gerade Einzelmasse zwischen zwei Massbegrenzungen. wert_mm = die angeschriebene Zahl in Millimetern (Schweizer Pläne bemassen in cm oder mm — «425» an einer Raumkette heisst meist 4250 mm; entscheide anhand der Grössenordnung, ein Wohnraum ist 3–6 m breit). p1/p2 = die BILDKOORDINATEN der beiden Massbegrenzungen, normalisiert auf 0..1 (x = Anteil der Bildbreite, y = Anteil der Bildhöhe). Nur Bemassungen, deren Endpunkte du sicher verorten kannst — lieber 3 sichere als 10 geratene. ' +
  '(5) raeume: JEDES Raumlabel im Grundriss. label_position = normalisierte Bildposition MITTEN IM RAUM (auf dem Label, nie auf einer Wand). angeschriebene_flaeche_m2 nur, wenn die m²-Zahl wirklich beim Label steht. typ: beheizt (Wohn-/Arbeitsräume, Bad, Küche, Flur innerhalb Wohnung), unbeheizt (Keller, Estrich, Garage, Technik, Treppenhaus kalt, Windfang kalt), aussen (Balkon, Terrasse, Sitzplatz, Attika). nutzung: kurzes Stichwort (wohnen/schlafen/bad/kueche/verkehr/technik/lager/aussen). konfidenz: hoch/mittel/niedrig. ' +
  '(6) fenster: Öffnungen in den AUSSENwänden des Gebäudes — Fenster (im Plan als dünne Doppel-/Dreifachlinie in der Wand) und Aussentüren. p1/p2 = die beiden ENDPUNKTE der Öffnung entlang der Wand, normalisiert 0..1. typ: fenster oder tuer. nutzung = Nutzungs-Stichwort des dahinterliegenden Raums (für die Fensterhöhen-Annahme). NUR Öffnungen in Aussenwänden, keine Innentüren; nur sicher verortbare — lieber weniger als geratene. ' +
  '(7) Erfinde NICHTS: keine Räume ohne Label, keine Bemassungen ohne ablesbare Zahl. Antworte auf Deutsch mit echten Umlauten.';

const SYSTEM_SCHNITT =
  'Du bist ein Bauplan-Analyst für ein Schweizer Gebäudetechnik-Planungsbüro. ' +
  'Du bekommst EINEN Gebäudeschnitt (Architektenplan) als Bild, optional den PDF-Textlayer als Kontext. ' +
  'Gib dein Ergebnis AUSSCHLIESSLICH über das Tool «schnitt_analysieren» zurück. Regeln: ' +
  '(1) geschosse: pro im Schnitt sichtbarem Geschoss die Bezeichnung (z.B. «UG», «EG», «1. OG», «DG»), geschoss_index (UG=-1, EG=0, 1.OG=1 …), lichte_hoehe_m (lichte Raumhöhe in Metern, aus den Höhenketten des Schnitts) und konstruktionsstaerke_m (Deckenstärke inkl. Bodenaufbau in Metern, typisch 0.25–0.40). Lies die Werte aus den Bemassungen/Höhenkoten — Schweizer Schnitte bemassen in cm oder m (z.B. «250» = 2.50 m lichte Höhe). ' +
  '(2) dachneigung_grad: die Dachneigung in Grad, falls angeschrieben oder eindeutig ablesbar (Flachdach = 0). ' +
  '(3) dachform: flachdach/satteldach/walmdach/pultdach/mansarddach/andere. ' +
  '(4) kniestock_m: Kniestockhöhe in Metern, falls ablesbar. ' +
  '(5) fenster_hoehe_m: die typische Fensterhöhe in Metern, falls im Schnitt bemasst (Brüstung bis Sturz). ' +
  '(6) Erfinde NICHTS — lieber ein Feld weglassen als raten. Antworte auf Deutsch mit echten Umlauten.';

function _toolGrundriss(){
  return {
    name: 'grundriss_analysieren',
    description: 'Gibt Plantyp, Geschoss, Massstab, Bemassungsketten und die Raumliste mit Seed-Punkten zurück.',
    input_schema: {
      type: 'object',
      properties: {
        plantyp: { type:'string', enum:['grundriss','schnitt','ansicht','situationsplan','detail','legende'], description:'Klassifikation der Planseite' },
        geschoss: { type:'string', description:'Geschossbezeichnung aus dem Plankopf, z.B. «1. OG» (leer wenn nicht erkennbar)' },
        geschoss_index: { type:'integer', description:'UG=-1, EG=0, 1.OG=1, 2.OG=2 …' },
        massstab: { type:'string', description:'Massstab aus dem Plankopf, z.B. «1:50» (leer wenn nicht erkennbar)' },
        massstab_konfidenz: { type:'string', enum:['hoch','mittel','niedrig'] },
        bemassungen: {
          type:'array',
          description:'Eindeutig ablesbare Einzelmasse mit sicher verortbaren Endpunkten (max. 12).',
          items: {
            type:'object',
            properties: {
              wert_mm: { type:'number', description:'Angeschriebener Wert in Millimetern' },
              p1: { type:'array', items:{type:'number'}, minItems:2, maxItems:2, description:'Erster Endpunkt [x,y], normalisiert 0..1' },
              p2: { type:'array', items:{type:'number'}, minItems:2, maxItems:2, description:'Zweiter Endpunkt [x,y], normalisiert 0..1' }
            },
            required: ['wert_mm','p1','p2']
          }
        },
        raeume: {
          type:'array',
          description:'Alle beschrifteten Räume des Grundrisses.',
          items: {
            type:'object',
            properties: {
              nummer: { type:'string', description:'Raumnummer falls angeschrieben (z.B. «1.03»), sonst leer' },
              name: { type:'string', description:'Raumname wie angeschrieben (z.B. «Wohnen/Essen»)' },
              angeschriebene_flaeche_m2: { type:'number', description:'Die beim Label angeschriebene Fläche in m² (weglassen wenn keine steht)' },
              label_position: { type:'array', items:{type:'number'}, minItems:2, maxItems:2, description:'[x,y] normalisiert 0..1 — MITTEN im Raum auf dem Label' },
              typ: { type:'string', enum:['beheizt','unbeheizt','aussen'] },
              nutzung: { type:'string', description:'Kurzes Nutzungs-Stichwort (wohnen/schlafen/bad/kueche/verkehr/technik/lager/aussen)' },
              konfidenz: { type:'string', enum:['hoch','mittel','niedrig'] }
            },
            required: ['name','label_position','typ']
          }
        },
        fenster: {
          type:'array',
          description:'Fenster-/Türöffnungen in den Aussenwänden (max. 40).',
          items: {
            type:'object',
            properties: {
              p1: { type:'array', items:{type:'number'}, minItems:2, maxItems:2, description:'Erster Endpunkt der Öffnung [x,y], normalisiert 0..1' },
              p2: { type:'array', items:{type:'number'}, minItems:2, maxItems:2, description:'Zweiter Endpunkt der Öffnung [x,y], normalisiert 0..1' },
              typ: { type:'string', enum:['fenster','tuer'] },
              nutzung: { type:'string', description:'Nutzungs-Stichwort des dahinterliegenden Raums (wohnen/bad/…)' }
            },
            required: ['p1','p2','typ']
          }
        },
        aussenkontur_hinweis: { type:'string', description:'Kurzer Hinweis zur Gebäudeform (z.B. «rechteckig, Anbau Süd»)' }
      },
      required: ['plantyp','raeume']
    }
  };
}

function _toolSchnitt(){
  return {
    name: 'schnitt_analysieren',
    description: 'Gibt die Geschosshöhen, Dachneigung und Dachform aus einem Gebäudeschnitt zurück.',
    input_schema: {
      type: 'object',
      properties: {
        geschosse: {
          type:'array',
          description:'Pro sichtbarem Geschoss eine Zeile.',
          items: {
            type:'object',
            properties: {
              bezeichnung: { type:'string', description:'z.B. «UG», «EG», «1. OG», «DG»' },
              geschoss_index: { type:'integer', description:'UG=-1, EG=0, 1.OG=1 …' },
              lichte_hoehe_m: { type:'number', description:'Lichte Raumhöhe in Metern' },
              konstruktionsstaerke_m: { type:'number', description:'Deckenstärke inkl. Bodenaufbau in Metern' }
            },
            required: ['bezeichnung','lichte_hoehe_m']
          }
        },
        dachneigung_grad: { type:'number', description:'Dachneigung in Grad (Flachdach = 0); weglassen wenn nicht ablesbar' },
        dachform: { type:'string', enum:['flachdach','satteldach','walmdach','pultdach','mansarddach','andere'] },
        kniestock_m: { type:'number', description:'Kniestockhöhe in Metern; weglassen wenn nicht ablesbar' },
        fenster_hoehe_m: { type:'number', description:'Typische Fensterhöhe in Metern (Brüstung bis Sturz), falls bemasst' }
      },
      required: ['geschosse']
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

  const imageBase64 = _stripDataUrl(body.imageBase64 || '');
  let mediaType = String(body.mediaType || 'image/jpeg').toLowerCase();
  const text = String(body.text || '').slice(0, 20000);
  const modus = body.modus === 'schnitt' ? 'schnitt' : 'grundriss';

  if (!imageBase64) return { statusCode:400, headers:cors, body:JSON.stringify({ok:false,error:'Kein Planbild übergeben (imageBase64)'}) };
  if (imageBase64.length > MAX_B64) return { statusCode:413, headers:cors, body:JSON.stringify({ok:false,error:'Bild zu gross (max ~3 MB). Bitte kleinere Auflösung.'}) };
  if (mediaType.indexOf('image/') !== 0) mediaType = 'image/jpeg';

  const tool = modus === 'schnitt' ? _toolSchnitt() : _toolGrundriss();
  const system = modus === 'schnitt' ? SYSTEM_SCHNITT : SYSTEM_GRUNDRISS;
  const content = [
    { type:'image', source:{ type:'base64', media_type:mediaType, data:imageBase64 } },
    { type:'text', text: (modus==='schnitt'
        ? 'Analysiere diesen Gebäudeschnitt (Geschosshöhen, Dachneigung, Dachform).'
        : 'Analysiere diese Planseite (Plantyp, Geschoss, Massstab, Bemassungen mit Endpunkten, alle Raumlabels mit Position).')
      + (text ? ('\n\nExtrahierter PDF-Textlayer als Kontext:\n' + text) : '') }
  ];

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method:'POST',
      headers:{ 'x-api-key':key, 'anthropic-version':ANTHROPIC_VERSION, 'content-type':'application/json' },
      body: JSON.stringify({ model:MODEL, max_tokens:MAX_TOKENS, system:system, tools:[tool], tool_choice:{type:'tool',name:tool.name}, messages:[{role:'user',content:content}] })
    });
    if (!resp.ok) { const errBody = await resp.text(); return { statusCode:resp.status, headers:cors, body:JSON.stringify({ok:false,error:'Anthropic-Fehler: '+resp.status+' '+errBody.slice(0,500)}) }; }
    const data = await resp.json();
    const tb = (data.content||[]).find(function(b){ return b && b.type==='tool_use' && b.name===tool.name; });
    if (!tb || !tb.input) return { statusCode:200, headers:cors, body:JSON.stringify({ok:false,error:'Keine strukturierte Antwort erhalten.'}) };
    const out = tb.input;
    if (modus === 'schnitt') out.geschosse = Array.isArray(out.geschosse) ? out.geschosse : [];
    else { out.raeume = Array.isArray(out.raeume) ? out.raeume : []; out.bemassungen = Array.isArray(out.bemassungen) ? out.bemassungen : []; out.fenster = Array.isArray(out.fenster) ? out.fenster : []; }
    return { statusCode:200, headers:cors, body:JSON.stringify({ok:true, data:out, usage:data.usage||null}) };
  } catch(e) {
    return { statusCode:500, headers:cors, body:JSON.stringify({ok:false,error:'Proxy-Fehler: '+(e.message||String(e))}) };
  }
};
