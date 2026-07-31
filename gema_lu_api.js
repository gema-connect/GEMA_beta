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
  // FACHLICHE REGEL (K2): Osmosewasser wird IMMER vorenthärtet. Verbraucher,
  // deren Wasser durch die Osmose laeuft, werden als eigenes Medium 'ow'
  // ("Enthärtetes Wasser für Osmose") erfasst — getrennt von 'bw'
  // ("Enthärtetes Wasser", Apparate die NUR enthärtetes Wasser brauchen).
  // Datenfluss: ow → Osmoseberechnung → Permeat+Konzentrat → Enthärtung.
  // Die Enthärtung holt sich 'enthaertet' (bw) direkt UND das Osmose-
  // Ergebnis via GemaOsmose — die ow-Verbraucher gehen also NICHT nochmal
  // direkt in die Enthärtung (sonst Doppelzählung).
  // gw hiess historisch faelschlich «Grauwasser», meinte aber immer das
  // Regenwasser-Netz (Alias 'regenwasser'). Die ID bleibt 'gw'
  // (Bestandsschutz gespeicherter Daten), nur das Label ist korrigiert.
  // Grauwasser ist seit 07/2026 ein EIGENES Medium ('grau').
  var MEDIA = {
    kw:   { id: 'kw',   label: 'Kaltwasser (KW)',                     alias: 'trinkwasser',  color: '#16a34a' },
    ww:   { id: 'ww',   label: 'Warmwasser (WW)',                     alias: 'warmwasser',   color: '#dc2626' },
    nd:   { id: 'nd',   label: 'Netzdruck (ND)',                      alias: 'netzdruck',    color: '#2563eb' },
    bw:   { id: 'bw',   label: 'Enthärtetes Wasser (BW)',             alias: 'enthaertet',   color: '#7c3aed' },
    ow:   { id: 'ow',   label: 'Osmose (OW)',                         alias: 'osmose',       color: '#0d9488' },
    gw:   { id: 'gw',   label: 'Regenwasser (RW)',                    alias: 'regenwasser',  color: '#0891b2' },
    grau: { id: 'grau', label: 'Grauwasser (GW)',                     alias: 'grauwasser',   color: '#64748b' },
    frei: { id: 'frei', label: 'Freie Eingabe',                       alias: 'frei',         color: '#374151' }
  };

  // Alias → internes Medium (für Zielmodule die z.B. 'trinkwasser' sagen)
  var ALIAS_MAP = {};
  Object.keys(MEDIA).forEach(function(k) {
    ALIAS_MAP[k] = k;
    ALIAS_MAP[MEDIA[k].alias] = k;
  });
  // Zusätzliche Alias ('grau' zeigte frueher auf gw — jetzt eigenes Medium)
  ALIAS_MAP['behandelt'] = 'bw';
  ALIAS_MAP['regen'] = 'gw';

  function _resolveMedium(medium) {
    if (!medium) return null;
    return ALIAS_MAP[medium.toLowerCase()] || null;
  }

  // ── Volumenstrom-Einheit der Spezial-/Dauer-Zeilen ──
  // Seit 07/2026 koennen Zeilen in l/s, l/min oder l/h erfasst sein
  // (row.flowUnit) — gespeichert wird der EINGEGEBENE Wert, gerechnet
  // wird immer in l/s. Identische Faktoren wie sb_lu_tabelle.html.
  var FLOW_UNIT_FACTOR = { ls: 1, lmin: 1/60, lh: 1/3600 };
  function _rowFlowLs(r) {
    var flow = Math.max(0, Number(r && r.flow) || 0);
    var f = FLOW_UNIT_FACTOR[(r && r.flowUnit) || 'ls'];
    return flow * (f || 1);
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

  // ── W3 Diagramm 1 Berechnung ──
  // Identische Logik wie sb_lu_tabelle.html (Quelle der Wahrheit), dort
  // qDiagramm1() + _qMed():
  //   LU <= 0 → 0
  //   LU <= 3 → direkt LU/10
  //   sonst   → Kurve A/B mit x = LU/10, useA = (maxLU <= 3) || (x > 15)
  //             A: 0.459 · x^0.353    B: 0.598 · x^0.257
  // WICHTIG: Bei Aenderungen IMMER mit sb_lu_tabelle.html abgleichen —
  // hier standen frueher abweichende Exponenten (0.0847·x^0.677 /
  // 0.113·x^0.637), die den Zielmodulen (Druckverlust, Grobauslegung,
  // Warmwasser, Workspace) massiv falsche l/s-Werte lieferten.
  function _qDiagramm1(totalLU, maxLU) {
    if (totalLU <= 0) return 0;
    if (totalLU <= 3) return totalLU / 10;
    var x = totalLU / 10;
    var useA = (maxLU <= 3) || (x > 15);
    return useA ? (Math.pow(x, 0.353) * 0.459) : (Math.pow(x, 0.257) * 0.598);
  }

  // Default-maxLU pro Medium — identisch zur Tabelle (calc():
  // maxLU.kw||3, maxLU.ww||3, maxLU.nd||5).
  function _defaultMaxLU(med) {
    return med === 'nd' ? 5 : 3;
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
      var flow = _rowFlowLs(r);
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
      var flow = _rowFlowLs(r);
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
    var maxLU = (state.maxLU && state.maxLU[med]) || _defaultMaxLU(med);

    // 1. Spezial-Flow (vor dem LU-Flow — die Einzelapparat-Regel
    //    braucht die Information, ob weitere Verbraucher existieren)
    var specialFlow = 0;
    (state.special || []).forEach(function(r) {
      if ((r.medium || 'kw') !== med) return;
      var qty = Math.max(0, Number(r.qty) || 0);
      specialFlow += _rowFlowLs(r) * qty;
    });

    // 2. Dauer-Flow
    var dauerFlow = 0;
    (state.dauer || []).forEach(function(r) {
      if ((r.medium || 'kw') !== med) return;
      var qty = Math.max(0, Number(r.qty) || 0);
      dauerFlow += _rowFlowLs(r) * qty;
    });

    // 3. LU-basierter Flow (nur für kw, ww, nd)
    var luFlow = 0;
    if (med === 'kw' || med === 'ww' || med === 'nd') {
      var totalLU = 0;
      var units = 0; // Apparate-Stueckzahl in diesem Medium
      (state.devices || []).forEach(function(r) {
        if (!r.deviceName) return;
        var qty = Math.max(0, Number(r.qty) || 0);
        if (qty <= 0) return;
        var d = deviceLU[r.deviceName];
        if (!d) return;
        var lu = (med === 'kw') ? d.lu_kw : (med === 'ww') ? d.lu_ww : d.lu_nd;
        if (lu > 0) { totalLU += lu * qty; units += qty; }
      });
      // Einzelapparat-Regel (W3, identisch _qMed in sb_lu_tabelle.html):
      // genau 1 Apparat im Medium ohne weitere Verbraucher → direkt LU/10
      // (gilt auch fuer 5-LU-Apparate).
      if (units === 1 && specialFlow <= 0 && dauerFlow <= 0) {
        luFlow = totalLU / 10;
      } else {
        luFlow = _qDiagramm1(totalLU, maxLU);
      }
    }

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
   * Seit Feedback Sandro 31.07.2026 («Belastung Hausanschlussleitung muss
   * sich auf die Gesamt-LU beziehen»): W3 Diagramm 1 über die GESAMT-LU
   * aller Apparate (Gleichzeitigkeit über den ganzen Anschluss, inkl.
   * Apparate auf alternativen Netzen EW/OW/RW/GW) + Spezial-/Dauer-
   * verbraucher ALLER Medien 1:1.
   * EINE WAHRHEIT mit calc() → qHausanschluss in sb_lu_tabelle.html —
   * bei Änderungen dort IMMER hier nachziehen.
   * (Früher: max(KW, WW) + Summe der übrigen Medien-Spitzenströme — das
   * unterschätzte die Gleichzeitigkeit über den Gesamtanschluss nicht,
   * sondern summierte die W3-reduzierten Teilströme.)
   */
  function getHausanschluss(objektId) {
    var state = _load(objektId);
    if (!state) return 0;
    var deviceLU = _getDeviceLU(state);

    // Leitungsnetz des Apparats → Berechnungsmedium (wie sb_lu_tabelle)
    var NETZ_ZU_MEDIUM = { enthaertet: 'bw', osmose: 'ow', regenwasser: 'gw', grauwasser: 'grau' };

    // Gesamt-LU + Stückzahl über ALLE Apparate; LU je Medium für die Kurvenwahl
    var luTotal = 0, totalUnits = 0;
    var mediaLU = {};
    (state.devices || []).forEach(function(r) {
      if (!r.deviceName) return;
      var qty = Math.max(0, Number(r.qty) || 0);
      if (qty <= 0) return;
      var d = deviceLU[r.deviceName];
      if (!d) return;
      var luTot = ((d.lu_kw || 0) + (d.lu_ww || 0) + (d.lu_nd || 0)) * qty;
      luTotal += luTot;
      totalUnits += qty;
      var altMed = NETZ_ZU_MEDIUM[r.medium || 'trinkwasser'];
      if (altMed) {
        mediaLU[altMed] = (mediaLU[altMed] || 0) + luTot;
      } else {
        if (d.lu_kw > 0) mediaLU.kw = (mediaLU.kw || 0) + d.lu_kw * qty;
        if (d.lu_ww > 0) mediaLU.ww = (mediaLU.ww || 0) + d.lu_ww * qty;
        if (d.lu_nd > 0) mediaLU.nd = (mediaLU.nd || 0) + d.lu_nd * qty;
      }
    });

    // Spezial + Dauer aller Medien 1:1
    var qOther = 0;
    ['special', 'dauer'].forEach(function(listKey) {
      (state[listKey] || []).forEach(function(r) {
        var qty = Math.max(0, Number(r.qty) || 0);
        qOther += _rowFlowLs(r) * qty;
      });
    });

    // Kurvenwahl: grösster wirksamer Einzel-LU über die Medien mit LU
    // (identisch grHA in sb_lu_tabelle calc())
    var stMax = state.maxLU || {};
    var grHA = 0;
    Object.keys(mediaLU).forEach(function(mid) {
      if (mediaLU[mid] > 0) grHA = Math.max(grHA, stMax[mid] || _defaultMaxLU(mid));
    });
    if (!grHA) grHA = 3;

    // Einzelapparat-Regel (wie _qMed): genau 1 Apparat ohne weitere
    // Verbraucher → direkt LU/10; sonst W3 (deckt LU≤3 → /10 mit ab)
    var luFlow;
    if (totalUnits === 1 && !(qOther > 0)) {
      luFlow = luTotal / 10;
    } else {
      luFlow = _qDiagramm1(luTotal, grHA);
    }

    return luFlow + qOther;
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
