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
 *
 * opts = { signal? }   AbortSignal optional
 *
 * Bei Fehler wird das Promise gerejected mit Error(message).
 */
(function(w){
  'use strict';

  var ENDPOINT = '/.netlify/functions/claude-rewrite';
  var EXTRACT_ENDPOINT = '/.netlify/functions/claude-extract';
  var FORMFIELDS_ENDPOINT = '/.netlify/functions/claude-formfields';
  var PLAN_ENDPOINT = '/.netlify/functions/claude-plan';

  function _call(mode, text, opts) {
    opts = opts || {};
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: mode, text: text }),
      signal: opts.signal
    }).then(function(r){
      return r.json().then(function(data){
        if (!r.ok || !data.ok) {
          throw new Error(data && data.error ? data.error : ('HTTP ' + r.status));
        }
        return data.text || '';
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
      if (r.status === 404) {
        throw new Error('KI-Analyse ist nicht verfügbar (Function nicht deployed).');
      }
      return r.json().then(function(data){
        if (!r.ok || !data.ok) {
          throw new Error(data && data.error ? data.error : ('HTTP ' + r.status));
        }
        var d = data.data || {};
        d.positionen = Array.isArray(d.positionen) ? d.positionen : [];
        return d;
      }).catch(function(err){
        // JSON-Parse-Fehler o.ä. → sauberer Error
        if (err instanceof Error) throw err;
        throw new Error('Unerwartete Antwort der KI-Analyse.');
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
      if (r.status === 404) throw new Error('KI-Formularanalyse ist nicht verfügbar (Function nicht deployed).');
      return r.json().then(function(data){
        if (!r.ok || !data.ok) throw new Error(data && data.error ? data.error : ('HTTP ' + r.status));
        var d = data.data || {};
        d.felder = Array.isArray(d.felder) ? d.felder : [];
        return d;
      }).catch(function(err){ if (err instanceof Error) throw err; throw new Error('Unerwartete Antwort der KI-Formularanalyse.'); });
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
      if (r.status === 404) throw new Error('KI-Plananalyse ist nicht verfügbar (Function nicht deployed, 404).');
      return r.json().then(function(data){
        if (!r.ok || !data.ok) throw new Error(data && data.error ? data.error : ('HTTP ' + r.status));
        var d = data.data || {};
        if (payload.modus === 'schnitt') d.geschosse = Array.isArray(d.geschosse) ? d.geschosse : [];
        else { d.raeume = Array.isArray(d.raeume) ? d.raeume : []; d.bemassungen = Array.isArray(d.bemassungen) ? d.bemassungen : []; d.fenster = Array.isArray(d.fenster) ? d.fenster : []; }
        return d;
      }).catch(function(err){ if (err instanceof Error) throw err; throw new Error('Unerwartete Antwort der KI-Plananalyse.'); });
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
    analyzePlan: analyzePlan
  };
})(typeof window !== 'undefined' ? window : this);
