/**
 * gema_apparate_api.js — GEMA Apparateliste Cross-Modul-API v1
 *
 * Liest die Apparateliste eines Objekts (sb_apparateliste.html) und
 * liefert sie als aggregierte Apparate-Mengen oder Raum-Liste.
 * Wird verwendet von:
 *   - sb_lu_tabelle.html (Vorschlag: aus Apparateliste-Mengen
 *     LU-Verbraucher-Anzahl uebernehmen)
 *   - Workspace (KPI-Anzeige "12 Räume / 47 Apparate")
 *
 * Storage: gleicher Key wie sb_apparateliste.html — also
 * gema_apparateliste_v6 mit objekt-spezifischem Suffix via
 * GemaObjekte.storageKey().
 *
 * Verwendung:
 *   if (typeof GemaApparate !== 'undefined' && GemaApparate.hasData(objektId)) {
 *     var agg = GemaApparate.getAggregated(objektId);
 *     // agg = { 'WC': 4, 'Waschtisch': 5, 'Dusche': 2, ... }
 *   }
 */
(function(w) {
  'use strict';

  var BASE_KEY = 'gema_apparateliste_v6';

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
    var keys = [_storageKey(objektId, phase)];
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

  // Portierte Logik aus sb_apparateliste.html buildRows() — liefert die
  // konkreten Apparate-Eintraege pro Raum. Vereinfachte Version:
  // wir brauchen nur {app, menge} fuer die Aggregation, keine
  // Detail-Strings.
  function _expandRoom(room) {
    var rows = [];
    var m = room.qty || 1;
    var rt = room.roomType || '';
    if (rt === 'Küche') {
      rows.push({ app: 'Spüle', menge: 1 * m });
      rows.push({ app: 'Küchenarmatur', menge: 1 * m });
      if (room.kitchenHasGS) rows.push({ app: 'GS-Anschluss', menge: 1 * m });
      return rows;
    }
    if (rt === 'Waschküche') {
      var s = Math.max(1, room.laundrySets || 1);
      rows.push({ app: 'Waschtrog', menge: s * m });
      rows.push({ app: 'Anschluss-Set', menge: s * m });
      return rows;
    }
    if (rt === 'Umgebung') {
      var v = Math.max(0, room.gardenVents || 0);
      if (v > 0) rows.push({ app: 'Gartenventil', menge: v * m });
      return rows;
    }
    if (room.hasBathtub)   rows.push({ app: 'Badewanne',  menge: 1 * m });
    if (room.hasWashbasin) rows.push({ app: 'Waschtisch', menge: 1 * m });
    if (room.hasWC)        rows.push({ app: 'WC',         menge: 1 * m });
    if (room.hasShower)    rows.push({ app: 'Dusche',     menge: 1 * m });
    if (room.hasBidet)     rows.push({ app: 'Bidet',      menge: 1 * m });
    return rows;
  }

  // ── PUBLIC API ──────────────────────────────────────────────

  /** Rohe Raumliste eines Objekts (wie in sb_apparateliste.html). */
  function getRooms(objektId) {
    var data = _read(objektId);
    if (!data || !Array.isArray(data.rooms)) return [];
    return data.rooms.slice();
  }

  /**
   * Aggregierte Apparate-Mengen ueber alle Raeume.
   * Returns { 'WC': 4, 'Waschtisch': 5, 'Dusche': 2, ... }
   */
  function getAggregated(objektId) {
    var rooms = getRooms(objektId);
    var agg = {};
    rooms.forEach(function(r) {
      _expandRoom(r).forEach(function(row) {
        if (!row.app) return;
        agg[row.app] = (agg[row.app] || 0) + row.menge;
      });
    });
    return agg;
  }

  /**
   * Komplette Apparate-Zeilen pro Raum (wie buildRows in apparateliste).
   * Praktisch fuer Lieferanten-Anfragen, Stueckliste-PDFs etc.
   */
  function getRows(objektId) {
    var rooms = getRooms(objektId);
    var rows = [];
    rooms.forEach(function(r) {
      _expandRoom(r).forEach(function(row) {
        rows.push({ raum: r.roomType + (r.roomName ? ' – ' + r.roomName : ''), floor: r.floor || '-', app: row.app, menge: row.menge });
      });
    });
    return rows;
  }

  /**
   * Anzahl Räume + Anzahl Apparate als Schnellindikator
   * fuer Workspace-KPI etc.
   */
  function getCounts(objektId) {
    var rooms = getRooms(objektId);
    var totalApp = 0;
    var agg = getAggregated(objektId);
    Object.keys(agg).forEach(function(k) { totalApp += agg[k]; });
    return { rooms: rooms.length, apparate: totalApp };
  }

  /** True wenn fuer das Objekt mind. ein Raum mit mind. einem Apparat existiert. */
  function hasData(objektId) {
    var counts = getCounts(objektId);
    return counts.apparate > 0;
  }

  // ── Expose ───────────────────────────────────────────────────
  w.GemaApparate = {
    getRooms: getRooms,
    getAggregated: getAggregated,
    getRows: getRows,
    getCounts: getCounts,
    hasData: hasData,
    BASE_KEY: BASE_KEY
  };
})(typeof window !== 'undefined' ? window : this);
