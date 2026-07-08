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
 *
 * opts = { signal? }   AbortSignal optional
 *
 * Bei Fehler wird das Promise gerejected mit Error(message).
 */
(function(w){
  'use strict';

  var ENDPOINT = '/.netlify/functions/claude-rewrite';
  var EXTRACT_ENDPOINT = '/.netlify/functions/claude-extract';

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

  w.GemaClaude = {
    isConfigured: isConfigured,
    rewrite: function(t, o){ return _call('rewrite', t, o); },
    bulletpointsToText: function(t, o){ return _call('bulletpoints', t, o); },
    fix: function(t, o){ return _call('fix', t, o); },
    shorten: function(t, o){ return _call('shorten', t, o); },
    expand: function(t, o){ return _call('expand', t, o); },
    extractPositions: extractPositions
  };
})(typeof window !== 'undefined' ? window : this);
