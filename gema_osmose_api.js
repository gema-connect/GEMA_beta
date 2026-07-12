/**
 * gema_osmose_api.js — GEMA Osmose-Berechnung Cross-Modul-API v1
 *
 * Liest die zuletzt berechneten Osmose-Output-Werte (Permeat,
 * Konzentrat, Recovery) eines Objekts. Wird verwendet von:
 *   - sa_enthaertung.html (Eingangsstrom = Permeat + Konzentrat
 *     der Osmose, falls Osmose-Verbraucher in der LU vorhanden)
 *   - sb_grobauslegung.html (zusaetzlicher Volumenstrom in den
 *     Hausanschluss, falls Osmose betrieben wird)
 *
 * Schreibt wird die Daten von sa_osmose.html via GemaOsmose._save.
 *
 * Verwendung in Lese-Modulen:
 *   if (typeof GemaOsmose !== 'undefined' && GemaOsmose.hasData(objektId)) {
 *     var r = GemaOsmose.getResults(objektId);
 *     // r.permeat_lh, r.konzentrat_lh, r.recovery_pct
 *   }
 */
(function(w) {
  'use strict';

  var BASE_KEY = 'gema_osmose_results_v1';

  function _activePhase() {
    try {
      if (typeof GemaObjekte !== 'undefined' && GemaObjekte.getActivePhase) {
        return GemaObjekte.getActivePhase() || '';
      }
    } catch(e) {}
    return '';
  }
  function _storageKey(objektId, phase) {
    if (!objektId) return BASE_KEY;
    var ph = (phase != null) ? phase : _activePhase();
    return ph ? (BASE_KEY + '__' + objektId + '@' + ph) : (BASE_KEY + '__' + objektId);
  }
  function _read(objektId, phase) {
    var keys = [];
    var primary = _storageKey(objektId, phase);
    keys.push(primary);
    if (objektId) {
      var noPhase = BASE_KEY + '__' + objektId;
      if (keys.indexOf(noPhase) < 0) keys.push(noPhase);
    }
    if (keys.indexOf(BASE_KEY) < 0) keys.push(BASE_KEY);
    var raw = null;
    for (var i = 0; i < keys.length && !raw; i++) {
      var k = keys[i];
      try {
        if (typeof _GemaDB !== 'undefined' && _GemaDB.c && _GemaDB.c[k]) raw = _GemaDB.c[k];
      } catch(e) {}
      if (!raw) {
        try { raw = localStorage.getItem(k); } catch(e) {}
      }
    }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  }
  function _write(objektId, data) {
    try {
      var k = _storageKey(objektId);
      var s = JSON.stringify(data);
      // KRITISCH: localStorage IMMER schreiben — das ist der Kanal, ueber
      // den die Zielseiten (sa_enthaertung, sb_grobauslegung) via _read
      // lesen. _GemaDB.save allein legt den Wert nur in den SEITENLOKALEN
      // Cache (+ Cloud nur, wenn die Seite _GemaDB.init aufgerufen hat —
      // sa_osmose tut das nicht): der Wert war nach einem Reload bzw. auf
      // der Zielseite unsichtbar und die Kette Osmose→Enthaertung brach.
      try { localStorage.setItem(k, s); } catch(e) {}
      if (typeof _GemaDB !== 'undefined' && _GemaDB.save) _GemaDB.save(k, s);
    } catch(e) {}
  }

  // ── PUBLIC API ────────────────────────────────────────────

  /**
   * Liefert die letzte gespeicherte Osmose-Berechnung fuer ein Objekt.
   * Returns { permeat_lh, permeat_ls, konzentrat_lh, konzentrat_ls,
   *           weichwasser_lh, recovery_pct, phi_factor, ts } oder null.
   */
  function getResults(objektId) {
    var d = _read(objektId);
    if (!d) return null;
    return d;
  }

  /**
   * Prueft, ob Osmose-Daten fuer ein Objekt vorhanden sind und Permeat > 0.
   */
  function hasData(objektId) {
    var d = _read(objektId);
    return !!(d && Number(d.permeat_lh) > 0);
  }

  /**
   * Schreibt die aktuelle Berechnung in den Storage. Wird von
   * sa_osmose.html nach jedem Recalc aufgerufen.
   * results: { permeat_lh, weichwasser_lh, recovery_pct, phi_factor }
   * — Konzentrat wird automatisch berechnet (weichwasser - permeat).
   */
  function save(objektId, results) {
    if (!objektId || !results) return false;
    var pH = Number(results.permeat_lh) || 0;
    var wH = Number(results.weichwasser_lh) || 0;
    var phi = Number(results.phi_factor) || 0;
    var rec = Number(results.recovery_pct) || (phi > 0 ? phi * 100 : 0);
    var konz = Math.max(0, wH - pH);
    var data = {
      permeat_lh: pH,
      permeat_ls: pH / 3600,
      konzentrat_lh: konz,
      konzentrat_ls: konz / 3600,
      weichwasser_lh: wH,
      weichwasser_ls: wH / 3600,
      recovery_pct: rec,
      phi_factor: phi,
      ts: new Date().toISOString()
    };
    _write(objektId, data);
    // Notif an Folge-Module (Enthaertung), dass Osmose-Daten neu sind
    try {
      w.dispatchEvent(new CustomEvent('gema-osmose-updated', { detail: { objektId: objektId, data: data } }));
    } catch(e) {}
    return true;
  }

  /**
   * Loescht die Osmose-Daten fuer ein Objekt. Wird genutzt, wenn der
   * User die Berechnung zurueckgesetzt oder das Objekt ohne Osmose
   * neu konfiguriert hat.
   */
  function clear(objektId) {
    try {
      var k = _storageKey(objektId);
      try { localStorage.removeItem(k); } catch(e) {}
      if (typeof _GemaDB !== 'undefined' && _GemaDB.save) _GemaDB.save(k, '');
    } catch(e) {}
  }

  // ── Expose ────────────────────────────────────────────────
  w.GemaOsmose = {
    getResults: getResults,
    hasData: hasData,
    save: save,
    clear: clear,
    BASE_KEY: BASE_KEY
  };
})(typeof window !== 'undefined' ? window : this);
