/**
 * gema_schaden_api.js — GEMA Schadensbericht Cross-Modul-API v1
 *
 * Liest Schadensberichte und liefert sie als Liste offener Schäden
 * pro Objekt + aggregierte Energie-Summen (kWh aus manueller Geräte-
 * Liste plus Trocknungsmodul-Historie).
 *
 * Wird verwendet von:
 *   - sys_workspace.html (Bucket-Kachel-KPI: "2 offene Schäden ·
 *     1.2 kWh Energie")
 *   - if_trocknung.html (Schaden-Auswahl beim Geräte-Einsatz)
 *
 * Public API:
 *   GemaSchaden.getOpenForObjekt(objektId)
 *      → [{id, titel, typ, phase, gestartetAm}]
 *   GemaSchaden.getEnergyForSchaden(schadenId)
 *      → { kwh_manuell, kwh_trocknung, kwh_total }
 *   GemaSchaden.getCountsForObjekt(objektId)
 *      → { offen, abgeschlossen, total }
 *   GemaSchaden.hasData(objektId) → bool
 */
(function(w) {
  'use strict';

  var BASE_KEY = 'gema_schadensbericht_v1';

  function _read() {
    var raw = null;
    try {
      if (typeof _GemaDB !== 'undefined' && _GemaDB.c && _GemaDB.c[BASE_KEY]) raw = _GemaDB.c[BASE_KEY];
    } catch(e) {}
    if (!raw) {
      try { raw = localStorage.getItem(BASE_KEY); } catch(e) {}
    }
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch(e) { return []; }
  }

  function getAll() {
    return _read();
  }

  function getById(id) {
    var all = _read();
    return all.find(function(s) { return s && s.id === id; }) || null;
  }

  /**
   * Offene Schaeden eines Objekts: alle, deren phase !== 'abschluss'.
   */
  function getOpenForObjekt(objektId) {
    if (!objektId) return [];
    return _read().filter(function(s) {
      if (!s || s.objektId !== objektId) return false;
      return s.phase !== 'abschluss';
    }).map(function(s) {
      return {
        id: s.id,
        titel: s.titel || '—',
        typ: s.typ || 'sonstiges',
        phase: s.phase || 'erfasst',
        gestartetAm: s.erstelltAm || null,
        objektId: s.objektId || ''
      };
    });
  }

  /**
   * Counts: offene vs. abgeschlossene Schaeden eines Objekts.
   */
  function getCountsForObjekt(objektId) {
    if (!objektId) return { offen: 0, abgeschlossen: 0, total: 0 };
    var list = _read().filter(function(s) { return s && s.objektId === objektId; });
    var offen = 0, abg = 0;
    list.forEach(function(s) {
      if (s.phase === 'abschluss') abg++; else offen++;
    });
    return { offen: offen, abgeschlossen: abg, total: list.length };
  }

  /**
   * Energie-Summe eines Schadens. Kombiniert:
   *   - manuelle Geraete in s.trocknung.geraete[] mit Zaehler-Diff × kW
   *   - Historie aus GemaTrocknung.getHistoryForSchaden(id) (kWhTotal)
   * Aktive Geraete (im Einsatz, ohne Zaehler-Ende) zaehlen NICHT mit,
   * weil keine endgueltige Bilanz moeglich.
   */
  function getEnergyForSchaden(schadenId) {
    var s = getById(schadenId);
    if (!s) return { kwh_manuell: 0, kwh_trocknung: 0, kwh_total: 0 };

    var manuell = 0;
    if (s.trocknung && Array.isArray(s.trocknung.geraete)) {
      s.trocknung.geraete.forEach(function(g) {
        if (g && g.zaehlerEnde != null && g.zaehlerEnde !== '' && g.kw) {
          var diff = (parseFloat(g.zaehlerEnde) - parseFloat(g.zaehlerStart || 0));
          if (diff > 0) manuell += diff * parseFloat(g.kw);
        }
      });
    }

    var trocknung = 0;
    try {
      if (typeof GemaTrocknung !== 'undefined') {
        var hist = GemaTrocknung.getHistoryForSchaden(schadenId) || [];
        hist.forEach(function(h) { if (h.kwhTotal != null) trocknung += Number(h.kwhTotal) || 0; });
      }
    } catch(e) {}

    return {
      kwh_manuell: Math.round(manuell * 10) / 10,
      kwh_trocknung: Math.round(trocknung * 10) / 10,
      kwh_total: Math.round((manuell + trocknung) * 10) / 10
    };
  }

  /**
   * Energie-Summe ueber ALLE Schaeden eines Objekts. Praktisch fuer
   * Workspace-KPI: "Total 18.4 kWh ueber alle Schaeden".
   */
  function getTotalEnergyForObjekt(objektId) {
    if (!objektId) return 0;
    var list = _read().filter(function(s) { return s && s.objektId === objektId; });
    var total = 0;
    list.forEach(function(s) {
      var e = getEnergyForSchaden(s.id);
      total += e.kwh_total;
    });
    return Math.round(total * 10) / 10;
  }

  function hasData(objektId) {
    if (!objektId) return false;
    return getCountsForObjekt(objektId).total > 0;
  }

  // ── Expose ─────────────────────────────────────────────────
  w.GemaSchaden = {
    getAll: getAll,
    getById: getById,
    getOpenForObjekt: getOpenForObjekt,
    getCountsForObjekt: getCountsForObjekt,
    getEnergyForSchaden: getEnergyForSchaden,
    getTotalEnergyForObjekt: getTotalEnergyForObjekt,
    hasData: hasData,
    BASE_KEY: BASE_KEY
  };
})(typeof window !== 'undefined' ? window : this);
