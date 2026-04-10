/**
 * gema_lu_api.js — GEMA LU-Zusammenstellung API v1
 * Cross-Modul-Schnittstelle für Verbraucher-Daten aus der LU-Tabelle.
 * Liest aus localStorage / _GemaDB (gleicher Storage wie sb_lu_tabelle.html).
 * Unterstützt objekt-spezifische Keys (BASE_KEY + '__' + objektId).
 *
 * Verwendung in Zielmodulen:
 *   GemaLU.getVerbraucher(objektId)
 *   GemaLU.getByMedium(objektId, 'kw')
 *   GemaLU.getSpitzenvolumenstrom(objektId, 'kw')
 */
(function(w) {
  'use strict';

  var BASE_KEY = 'lu_spitzenvolumenstrom_dropdown_v3';

  // ── Medium-Mapping ──
  // LU-intern → lesbare Bezeichnung + Zielmodul-Alias
  var MEDIA = {
    kw:   { id: 'kw',   label: 'Kaltwasser (KW)',         alias: 'trinkwasser',  color: '#16a34a' },
    ww:   { id: 'ww',   label: 'Warmwasser (WW)',         alias: 'warmwasser',   color: '#dc2626' },
    nd:   { id: 'nd',   label: 'Netzdruck (ND)',          alias: 'netzdruck',    color: '#2563eb' },
    bw:   { id: 'bw',   label: 'Behandeltes Wasser (BW)', alias: 'enthaertet',   color: '#7c3aed' },
    gw:   { id: 'gw',   label: 'Grauwasser (GW)',         alias: 'regenwasser',  color: '#0891b2' },
    frei: { id: 'frei', label: 'Freie Eingabe',           alias: 'frei',         color: '#374151' }
  };

  // Alias → internes Medium (für Zielmodule die z.B. 'trinkwasser' sagen)
  var ALIAS_MAP = {};
  Object.keys(MEDIA).forEach(function(k) {
    ALIAS_MAP[k] = k;
    ALIAS_MAP[MEDIA[k].alias] = k;
  });
  // Zusätzliche Alias
  ALIAS_MAP['osmose'] = 'bw';
  ALIAS_MAP['behandelt'] = 'bw';
  ALIAS_MAP['grau'] = 'gw';
  ALIAS_MAP['regen'] = 'gw';

  function _resolveMedium(medium) {
    if (!medium) return null;
    return ALIAS_MAP[medium.toLowerCase()] || null;
  }

  // ── Storage Key (phase-aware) ──
  // Pattern: BASE_KEY + '__' + objektId + ('@' + phase, optional)
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

  // ── Load from Storage ──
  // Reihenfolge: phase-spezifisch → phasenlos (Objekt) → flach (BASE_KEY)
  function _load(objektId, phase) {
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

  // ── W3 Diagramm 1 Berechnung (identisch mit sb_lu_tabelle.html) ──
  function _qDiagramm1(totalLU, maxLU) {
    var x = totalLU / 10;
    if (x <= 0) return 0;
    if (totalLU <= 3) return totalLU / 10;
    var useA = (maxLU <= 3) || (x > 15);
    if (useA) return 0.0847 * Math.pow(x, 0.677);
    return 0.113 * Math.pow(x, 0.637);
  }

  // ── Stammverbraucher-LU-Daten lesen ──
  // Die LU speichert auch die Stammdaten-Snapshot im State
  function _getDeviceLU(state) {
    var stamp = (state && state._stammdaten && state._stammdaten.devices) || [];
    var byName = {};
    stamp.forEach(function(d) { byName[d.name] = d; });
    return byName;
  }

  // ══════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════

  /**
   * Alle Verbraucher eines Projekts als flache Liste.
   * Jeder Eintrag: { name, medium, flow, qty, typ, luKw, luWw, luNd }
   */
  function getVerbraucher(objektId) {
    var state = _load(objektId);
    if (!state) return [];
    var result = [];
    var deviceLU = _getDeviceLU(state);

    // Standard-Apparate (aus LU-Stammdaten)
    (state.devices || []).forEach(function(r) {
      if (!r.deviceName) return;
      var qty = Math.max(0, Number(r.qty) || 0);
      if (qty <= 0) return;
      var d = deviceLU[r.deviceName];
      result.push({
        name: r.deviceName,
        typ: 'standard',
        medium: 'kw', // Standard-Apparate verteilen auf kw/ww/nd via LU
        qty: qty,
        flow: 0, // Flow wird via LU-Diagramm berechnet, nicht direkt
        luKw: d ? d.lu_kw * qty : 0,
        luWw: d ? d.lu_ww * qty : 0,
        luNd: d ? d.lu_nd * qty : 0,
        luTotal: d ? (d.lu_kw + d.lu_ww + d.lu_nd) * qty : 0
      });
    });

    // Spezial-Verbraucher
    (state.special || []).forEach(function(r) {
      var qty = Math.max(0, Number(r.qty) || 0);
      var flow = Math.max(0, Number(r.flow) || 0);
      if (qty <= 0 && flow <= 0) return;
      result.push({
        name: r.freiName || r.label || 'Spezial',
        typ: 'spezial',
        medium: r.medium || 'kw',
        qty: qty,
        flow: flow * qty,
        luKw: 0, luWw: 0, luNd: 0, luTotal: 0
      });
    });

    // Dauerverbraucher
    (state.dauer || []).forEach(function(r) {
      var qty = Math.max(0, Number(r.qty) || 0);
      var flow = Math.max(0, Number(r.flow) || 0);
      if (qty <= 0 && flow <= 0) return;
      result.push({
        name: r.freiName || r.label || 'Dauerverbraucher',
        typ: 'dauer',
        medium: r.medium || 'kw',
        qty: qty,
        flow: flow * qty,
        luKw: 0, luWw: 0, luNd: 0, luTotal: 0
      });
    });

    return result;
  }

  /**
   * Verbraucher gefiltert nach Medium.
   * Akzeptiert LU-interne IDs (kw, ww, bw) und Aliase (trinkwasser, enthaertet, osmose).
   */
  function getByMedium(objektId, medium) {
    var med = _resolveMedium(medium);
    if (!med) return [];
    var all = getVerbraucher(objektId);

    // Standard-Apparate liefern LU pro Medium — filter nach luKw/luWw/luNd > 0
    if (med === 'kw' || med === 'ww' || med === 'nd') {
      return all.filter(function(v) {
        if (v.typ === 'standard') {
          if (med === 'kw') return v.luKw > 0;
          if (med === 'ww') return v.luWw > 0;
          if (med === 'nd') return v.luNd > 0;
        }
        return v.medium === med;
      });
    }

    // Andere Medien: nur Spezial- und Dauerverbraucher
    return all.filter(function(v) { return v.medium === med; });
  }

  /**
   * Berechneter Spitzenvolumenstrom in l/s für ein Medium.
   * Kombiniert LU-Diagramm-Flow + Spezial + Dauer.
   */
  function getSpitzenvolumenstrom(objektId, medium) {
    var med = _resolveMedium(medium);
    if (!med) return 0;
    var state = _load(objektId);
    if (!state) return 0;

    var deviceLU = _getDeviceLU(state);
    var maxLU = (state.maxLU && state.maxLU[med]) || 3;

    // 1. LU-basierter Flow (nur für kw, ww, nd)
    var luFlow = 0;
    if (med === 'kw' || med === 'ww' || med === 'nd') {
      var totalLU = 0;
      (state.devices || []).forEach(function(r) {
        if (!r.deviceName) return;
        var qty = Math.max(0, Number(r.qty) || 0);
        if (qty <= 0) return;
        var d = deviceLU[r.deviceName];
        if (!d) return;
        if (med === 'kw') totalLU += d.lu_kw * qty;
        else if (med === 'ww') totalLU += d.lu_ww * qty;
        else if (med === 'nd') totalLU += d.lu_nd * qty;
      });
      luFlow = _qDiagramm1(totalLU, maxLU);
    }

    // 2. Spezial-Flow
    var specialFlow = 0;
    (state.special || []).forEach(function(r) {
      if ((r.medium || 'kw') !== med) return;
      var qty = Math.max(0, Number(r.qty) || 0);
      var flow = Math.max(0, Number(r.flow) || 0);
      specialFlow += flow * qty;
    });

    // 3. Dauer-Flow
    var dauerFlow = 0;
    (state.dauer || []).forEach(function(r) {
      if ((r.medium || 'kw') !== med) return;
      var qty = Math.max(0, Number(r.qty) || 0);
      var flow = Math.max(0, Number(r.flow) || 0);
      dauerFlow += flow * qty;
    });

    return luFlow + specialFlow + dauerFlow;
  }

  /**
   * Zusammenfassung aller Medien mit jeweiligem Spitzenvolumenstrom.
   * Gibt ein Objekt zurück: { kw: {label, flow_ls, flow_m3h}, ww: {...}, ... }
   */
  function getSummary(objektId) {
    var summary = {};
    Object.keys(MEDIA).forEach(function(med) {
      var flow = getSpitzenvolumenstrom(objektId, med);
      summary[med] = {
        id: med,
        label: MEDIA[med].label,
        alias: MEDIA[med].alias,
        color: MEDIA[med].color,
        flow_ls: flow,
        flow_m3h: flow * 3.6,
        flow_lmin: flow * 60,
        verbraucher: getByMedium(objektId, med).length
      };
    });
    return summary;
  }

  /**
   * Gesamtvolumenstrom (Hausanschluss-Dimensionierung).
   * max(KW, WW) + Summe aller anderen Medien.
   */
  function getHausanschluss(objektId) {
    var s = getSummary(objektId);
    var qKw = s.kw ? s.kw.flow_ls : 0;
    var qWw = s.ww ? s.ww.flow_ls : 0;
    var qOther = 0;
    Object.keys(s).forEach(function(k) {
      if (k !== 'kw' && k !== 'ww') qOther += s[k].flow_ls;
    });
    return Math.max(qKw, qWw) + qOther;
  }

  /**
   * Prüft ob LU-Daten für ein Objekt vorhanden sind.
   */
  function hasData(objektId) {
    var state = _load(objektId);
    if (!state) return false;
    var hasDevices = (state.devices || []).some(function(d) { return d.deviceName && (Number(d.qty) || 0) > 0; });
    var hasSpecial = (state.special || []).some(function(s) { return (Number(s.flow) || 0) > 0; });
    var hasDauer = (state.dauer || []).some(function(s) { return (Number(s.flow) || 0) > 0; });
    return hasDevices || hasSpecial || hasDauer;
  }

  // ── Expose ──
  w.GemaLU = {
    getVerbraucher: getVerbraucher,
    getByMedium: getByMedium,
    getSpitzenvolumenstrom: getSpitzenvolumenstrom,
    getSummary: getSummary,
    getHausanschluss: getHausanschluss,
    hasData: hasData,
    MEDIA: MEDIA,
    BASE_KEY: BASE_KEY
  };

})(window);
