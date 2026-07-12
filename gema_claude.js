/**
 * gema_claude.js — Client-Helper für die Claude-Rewrite-Function
 *
 * Ruft /.netlify/functions/claude-rewrite und gibt einen ueberarbeiteten
 * Text zurueck. Verwendung in Modulen mit "Verbessern"-Buttons (z.B.
 * Spengler-Dachbericht).
 *
 * Public API:
 *   GemaClaude.isConfigured()                  Promise<bool>  — pingt die Function
 *   GemaClaude.rewrite(text, opts)             Promise<string>
 *   GemaClaude.bulletpointsToText(text, opts)  Promise<string>
 *   GemaClaude.fix(text, opts)                 Promise<string>
 *   GemaClaude.shorten(text, opts)             Promise<string>
 *   GemaClaude.expand(text, opts)              Promise<string>
 *   GemaClaude.extractPositions(opts)          Promise<{lieferant,bestellnummer,
 *                                                       bestelldatum,positionen[]}>
 *     opts = { text?, fileBase64?, mediaType?, filename?, signal? }
 *     — Dokument-Analyse (Rechnung/Lieferschein/Auftragsbestätigung) via
 *       /.netlify/functions/claude-extract. Wareneingang-Modul.
 *   GemaClaude.analyzePlan(opts)               Promise<{plantyp,geschoss,massstab,
 *                                                       bemassungen[],raeume[],…}>
 *     opts = { imageBase64, mediaType?, text?, modus:'grundriss'|'schnitt', signal? }
 *     — Plan-Analyse (Grundriss Pass 1 / Schnitt Pass 3) via
 *       /.netlify/functions/claude-plan. Pläne-Modul (pm_plaene.html).
 *   GemaClaude.createRedactor(extraTerms?)     → {redactText,matchesTerm,restore,count}
 *     — Anonymisierung: Kundennamen/-adressen (Objekt-Stammdaten,
 *       Beteiligte, generische Adressmuster) werden vor dem API-Aufruf
 *       durch [NAME_n]/[ADRESSE_n] ersetzt und via restore() wieder
 *       eingesetzt. Die Text-Modi (rewrite/fix/…) nutzen das automatisch
 *       (abschaltbar mit opts.anonymize === false); matchesTerm() dient
 *       der Bild-Schwärzung in pm_plaene.
 *
 * opts = { signal?, anonymize?, extraTerms? }   AbortSignal optional
 *
 * Bei Fehler wird das Promise gerejected mit Error(message).
 */
(function(w){
  'use strict';

  var ENDPOINT = '/.netlify/functions/claude-rewrite';
  var EXTRACT_ENDPOINT = '/.netlify/functions/claude-extract';
  var FORMFIELDS_ENDPOINT = '/.netlify/functions/claude-formfields';
  var PLAN_ENDPOINT = '/.netlify/functions/claude-plan';

  // ── Anonymisierung (Datenschutz): Kundennamen und Adressen verlassen
  //    GEMA nicht — sie werden VOR dem API-Aufruf durch Platzhalter
  //    ([NAME_n]/[ADRESSE_n]) ersetzt bzw. im Planbild geschwärzt und in
  //    der Antwort via restore() wieder eingesetzt.
  //    Begriffs-Quellen: Objekt-Stammdaten + Beteiligte (lokaler Cache,
  //    GemaObjekte) + aufrufer-spezifische extraTerms + generische
  //    Adressmuster (Strasse + Nr, PLZ + Ort). Best-effort: unbekannte
  //    Namen ohne Stammdaten-Bezug können nicht erkannt werden.
  var GENERIC_PATTERNS = [
    /\b[A-ZÄÖÜ][A-Za-zäöüéèàß.\-]{2,}(?:strasse|straße|str\.|weg|gasse|platz|allee|ring|rain|halde|matte|acker|feld|steig|weid)\s*\d+[a-z]?\b/g,
    /\b\d{4}\s+[A-ZÄÖÜ][A-Za-zäöüéèà\-]{2,}\b/g
  ];
  function _redEsc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function _redWordIn(hay, needle){
    return new RegExp('(^|[^0-9a-zäöüéèà])' + _redEsc(needle) + '($|[^0-9a-zäöüéèà])').test(hay);
  }
  function _redTerms(extra){
    var terms = [];
    function add(v){
      v = String(v == null ? '' : v).trim();
      if (v.length < 3 || /^\d+$/.test(v)) return;
      terms.push(v);
    }
    function addObj(o){ if(!o) return; add(o.name); add(o.firma); add(o.strasse); add(o.ort); if (o.plz && o.ort) add(o.plz + ' ' + o.ort); }
    try {
      if (w.GemaObjekte && w.GemaObjekte.getAll) (w.GemaObjekte.getAll() || []).forEach(addObj);
    } catch(e) {}
    try {
      var blob = JSON.parse((w.localStorage && localStorage.getItem('gema_objekte_v1')) || '{}');
      (blob.objekte || []).forEach(addObj);
      (blob.beteiligte || []).forEach(addObj);
    } catch(e) {}
    (extra || []).forEach(add);
    var seen = {}, out = [];
    terms.forEach(function(t){ var k = t.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(t); });
    out.sort(function(a, b){ return b.length - a.length; }); // längste zuerst («Musterstrasse 12» vor «Musterstrasse»)
    return out;
  }
  // createRedactor(extraTerms?) → { redactText, matchesTerm, restore, count }
  function createRedactor(extraTerms){
    var terms = _redTerms(extraTerms);
    var map = {}, inv = {}, n = 0;
    function isAdr(t){ return /\d/.test(t) || /(strasse|straße|str\.|weg|gasse|platz|allee)/i.test(t); }
    function tokenFor(orig){
      var k = orig.toLowerCase();
      if (inv[k]) return inv[k];
      n++;
      var tok = '[' + (isAdr(orig) ? 'ADRESSE' : 'NAME') + '_' + n + ']';
      map[tok] = orig; inv[k] = tok;
      return tok;
    }
    function redactText(text){
      var out = String(text == null ? '' : text);
      terms.forEach(function(t){
        out = out.replace(new RegExp(_redEsc(t), 'gi'), function(){ return tokenFor(t); });
      });
      GENERIC_PATTERNS.forEach(function(re){
        out = out.replace(re, function(m){ return tokenFor(m); });
      });
      return out;
    }
    // Für Bild-Schwärzung: ist dieses Text-Fragment (pdf.js-Textitem) sensibel?
    // Reine Zahlen/Masse werden NIE geschwärzt (Bemassungen braucht die Analyse).
    function matchesTerm(str){
      var s = String(str == null ? '' : str).trim();
      if (s.length < 3) return false;
      if (/^[\d\s.,:;\/\-–—×x°%m²'"()]+$/.test(s)) return false;
      for (var g = 0; g < GENERIC_PATTERNS.length; g++){
        GENERIC_PATTERNS[g].lastIndex = 0;
        if (GENERIC_PATTERNS[g].test(s)) return true;
      }
      var low = s.toLowerCase();
      for (var i = 0; i < terms.length; i++){
        var t = terms[i].toLowerCase();
        if (low === t) return true;
        if (low.length >= 4 && _redWordIn(t, low)) return true; // Fragment = Wort(folge) im Begriff
        if (t.length >= 4 && _redWordIn(low, t)) return true;   // Begriff steckt als Wort im Fragment
      }
      return false;
    }
    function restore(x){
      if (typeof x === 'string'){
        var s = x;
        Object.keys(map).forEach(function(tok){ s = s.split(tok).join(map[tok]); });
        return s;
      }
      if (Array.isArray(x)) return x.map(restore);
      if (x && typeof x === 'object'){
        var o = {};
        Object.keys(x).forEach(function(k){ o[k] = restore(x[k]); });
        return o;
      }
      return x;
    }
    return { redactText: redactText, matchesTerm: matchesTerm, restore: restore, count: function(){ return n; }, terms: terms };
  }

  // ── Antwort robust parsen (alle Functions) ──────────────────────────
  // Die Functions antworten in JEDEM Fall mit JSON. Kommt stattdessen eine
  // HTML-/Text-Seite zurück, hat der Request die Function nie erreicht:
  // Plattform-Payload-Limit (Body zu gross → Fehlerseite VOR der Function),
  // Firewall/Virenscanner-Blockseite oder ein Deploy ohne Functions.
  // Früher endete das als kryptisches «Unexpected token '<' … is not valid
  // JSON» — hier wird daraus eine klare, handlungsleitende Meldung.
  function _parseJson(r, was) {
    if (r.status === 404) {
      return Promise.reject(new Error(was + ' ist nicht verfügbar (Function nicht deployed).'));
    }
    return r.text().then(function(txt){
      var data = null;
      try { data = JSON.parse(txt); } catch (e) {}
      if (data === null) {
        var kopf = String(txt || '').trim().slice(0, 300);
        if (r.status === 504 || r.status === 502 && /time/i.test(kopf)) {
          // Netlify bricht synchrone Functions nach ~10 s ab — die Vision-
          // Analyse mehrseitiger PDFs kann länger dauern (Gateway Timeout).
          throw new Error(was + ': Zeitüberschreitung (HTTP ' + r.status + ') — die Analyse dauerte länger als das Netlify-Function-Limit (~10 s). PDFs mit Textebene werden automatisch als schneller Text analysiert; bei gescannten, mehrseitigen Belegen: weniger Seiten fotografieren/hochladen oder den Belegtext direkt einfügen.');
        }
        if (r.status === 413 || /too large|entity too large|payload/i.test(kopf)) {
          throw new Error('Anfrage zu gross (HTTP ' + r.status + ') — die Datei überschreitet das Upload-Limit (~3 MB). Bitte kleinere Datei wählen oder den Text einfügen.');
        }
        var art = /^</.test(kopf) ? 'eine HTML-Seite' : 'eine unerwartete Antwort';
        throw new Error(was + ': Der Server hat statt JSON ' + art + ' geliefert (HTTP ' + r.status + '). Mögliche Ursachen: Datei zu gross fürs Upload-Limit (~3 MB), Firewall/Virenscanner blockiert den Aufruf, oder die Netlify-Function fehlt in diesem Deploy.');
      }
      if (!r.ok || !data.ok) {
        throw new Error(data && data.error ? data.error : ('HTTP ' + r.status));
      }
      return data;
    });
  }

  function _call(mode, text, opts) {
    opts = opts || {};
    // Anonymisierung default AN: Platzhalter rein → Antwort → Platzhalter
    // zurück (die Rewrite-Prompts sind angewiesen, sie exakt zu erhalten).
    var red = (opts.anonymize === false) ? null : createRedactor(opts.extraTerms);
    var sendText = red ? red.redactText(text) : text;
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: mode, text: sendText }),
      signal: opts.signal
    }).then(function(r){
      return _parseJson(r, 'KI-Texthilfe').then(function(data){
        var out = data.text || '';
        return red ? red.restore(out) : out;
      });
    });
  }

  function isConfigured(){
    // Ein leerer POST → bekommt 400 "Kein Text" zurueck wenn Function da,
    // 500 "ANTHROPIC_API_KEY..." wenn Key fehlt, 404 wenn Function nicht
    // deployed. Wir interpretieren: deploy ok wenn Status NICHT 404.
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'rewrite', text: 'ping' })
    }).then(function(r){
      if (r.status === 404) return false;
      return r.json().then(function(data){
        // Wenn Key fehlt: configured=false, aber Function ist da
        if (data && data.error && /API_KEY/.test(data.error)) return false;
        return true;
      }).catch(function(){ return true; });
    }).catch(function(){ return false; });
  }

  // ── Dokument-Analyse (Wareneingang): Positionen aus Rechnung/Lieferschein/
  //    Auftragsbestätigung extrahieren. Nimmt Text ODER eine Datei (PDF/Bild
  //    als Base64) entgegen und liefert strukturierte Kopf- + Positionsdaten.
  function extractPositions(opts) {
    opts = opts || {};
    var payload = {};
    if (opts.text) payload.text = String(opts.text);
    if (opts.fileBase64) payload.fileBase64 = opts.fileBase64;
    if (opts.mediaType) payload.mediaType = opts.mediaType;
    if (opts.filename) payload.filename = opts.filename;
    return fetch(EXTRACT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts.signal
    }).then(function(r){
      return _parseJson(r, 'KI-Analyse').then(function(data){
        var d = data.data || {};
        d.positionen = Array.isArray(d.positionen) ? d.positionen : [];
        return d;
      });
    });
  }

  // ── Formular-Analyse (Behörden & Formulare): erkennt die Felder eines
  //    Behörden-PDF und schlägt je Feld eine GEMA-Zuordnung vor. Nimmt die
  //    AcroForm-Feldnamen (bevorzugt) und/oder das PDF/Bild entgegen.
  //    opts = { fileBase64?, mediaType?, filename?, fieldNames?:[{name,label,type}], text?, signal? }
  function analyzeForm(opts) {
    opts = opts || {};
    var payload = {};
    if (opts.fileBase64) payload.fileBase64 = opts.fileBase64;
    if (opts.mediaType) payload.mediaType = opts.mediaType;
    if (opts.filename) payload.filename = opts.filename;
    if (opts.fieldNames) payload.fieldNames = opts.fieldNames;
    if (opts.text) payload.text = String(opts.text);
    return fetch(FORMFIELDS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts.signal
    }).then(function(r){
      return _parseJson(r, 'KI-Formularanalyse').then(function(data){
        var d = data.data || {};
        d.felder = Array.isArray(d.felder) ? d.felder : [];
        return d;
      });
    });
  }

  // ── Plan-Analyse (Pläne einlesen, pm_plaene.html): liefert Semantik +
  //    Seed-Punkte (Raumlabels, Bemassungen bzw. Geschosshöhen) — die
  //    Geometrie rechnet der Browser deterministisch (Flood-Fill).
  //    opts = { imageBase64, mediaType?, text?, modus:'grundriss'|'schnitt', signal? }
  function analyzePlan(opts) {
    opts = opts || {};
    var payload = {
      imageBase64: opts.imageBase64 || '',
      mediaType: opts.mediaType || 'image/jpeg',
      modus: opts.modus === 'schnitt' ? 'schnitt' : 'grundriss'
    };
    if (opts.text) payload.text = String(opts.text);
    return fetch(PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts.signal
    }).then(function(r){
      return _parseJson(r, 'KI-Plananalyse').then(function(data){
        var d = data.data || {};
        if (payload.modus === 'schnitt') d.geschosse = Array.isArray(d.geschosse) ? d.geschosse : [];
        else { d.raeume = Array.isArray(d.raeume) ? d.raeume : []; d.bemassungen = Array.isArray(d.bemassungen) ? d.bemassungen : []; d.fenster = Array.isArray(d.fenster) ? d.fenster : []; }
        return d;
      });
    });
  }

  w.GemaClaude = {
    isConfigured: isConfigured,
    rewrite: function(t, o){ return _call('rewrite', t, o); },
    bulletpointsToText: function(t, o){ return _call('bulletpoints', t, o); },
    fix: function(t, o){ return _call('fix', t, o); },
    shorten: function(t, o){ return _call('shorten', t, o); },
    expand: function(t, o){ return _call('expand', t, o); },
    extractPositions: extractPositions,
    analyzeForm: analyzeForm,
    analyzePlan: analyzePlan,
    createRedactor: createRedactor
  };
})(typeof window !== 'undefined' ? window : this);
