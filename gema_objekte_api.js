/**
 * gema_objekte_api.js — GEMA Stammdaten-API v3
 * Liest Objekte/Beteiligte aus localStorage.
 * Falls leer → holt automatisch aus Supabase und cached lokal.
 * Funktioniert lokal + Netlify.
 */
(function(w) {
  'use strict';
  var KEY = 'gema_objekte_v1';
  var _cache = null;
  var _loaded = false;

  // ── Supabase config (same as gema_db.js) ──
  var SB_URL = 'https://fjhbqjvaygvhievjgdtm.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGJxanZheWd2aGlldmpnZHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODk5OTUsImV4cCI6MjA4ODI2NTk5NX0.n3AbrEKTWWhI2tnDaf7-Z-QI9o9pJiP1E7BsHVuZY9k';

  function _load() {
    if (_cache) return _cache;
    // 1. localStorage
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { _cache = JSON.parse(raw); _loaded = true; return _cache; }
    } catch(e) {}
    // 2. GemaDB cache
    try {
      if (typeof _GemaDB !== 'undefined' && _GemaDB.c) {
        var raw2 = _GemaDB.c[KEY] || null;
        if (raw2) {
          _cache = JSON.parse(raw2);
          _loaded = true;
          try { localStorage.setItem(KEY, raw2); } catch(e) {}
          return _cache;
        }
      }
    } catch(e) {}
    _cache = { objekte: [], beteiligte: [], activeObjektId: null };
    // Demo-Daten initialisieren wenn leer
    _seedDemoObjekte();
    return _cache;
  }

  function _seedDemoObjekte() {
    if (_cache.objekte && _cache.objekte.length) return;
    _cache.objekte = [
      {id:'obj_demo_1',name:'Neubau MFH Musterstrasse',strasse:'Musterstrasse 12',plz:'4053',ort:'Basel',gemeinde:'Basel',kanton:'BS',
       bauvorhaben:'Neubau',status:'aktiv',orgId:'org_default',abteilungId:'abt_sanitaer',erstelltVon:'user_planer_1',createdAt:'2025-06-01T08:00:00Z'},
      {id:'obj_demo_2',name:'Sanierung Schulhaus Reinach',strasse:'Schulstrasse 5',plz:'4153',ort:'Reinach',gemeinde:'Reinach',kanton:'BL',
       bauvorhaben:'Sanierung',status:'aktiv',orgId:'org_default',abteilungId:'abt_sanitaer',erstelltVon:'user_planer_2',createdAt:'2025-09-01T08:00:00Z'},
      {id:'obj_demo_3',name:'Umbau Bürogebäude Liestal',strasse:'Rathausstrasse 8',plz:'4410',ort:'Liestal',gemeinde:'Liestal',kanton:'BL',
       bauvorhaben:'Umbau',status:'aktiv',orgId:'org_default',abteilungIds:['abt_sanitaer','abt_hlkk'],erstelltVon:'user_planer_1',createdAt:'2026-01-15T08:00:00Z'}
    ];
    _cache.beteiligte = [
      // Objekt 1: Neubau MFH — alle Rollen besetzt
      {id:'bet_1_bh',objektId:'obj_demo_1',rolle:'Bauherrschaft',firma:'Immobilien Bâle AG',vorname:'Marc',name:'Brunner',funktion:'Geschäftsführer',
       strasse:'Aeschenvorstadt 4',plz:'4051',ort:'Basel',kanton:'BS',telefon:'061 201 30 40',email:'brunner@immobale.ch',bkp:[],entscheidungsinstanz:'bauherr',createdAt:'2025-06-02T08:00:00Z'},
      {id:'bet_1_ar',objektId:'obj_demo_1',rolle:'Architekt / Generalplaner',firma:'Architektur Muster AG',vorname:'Sarah',name:'Müller',funktion:'Projektleiterin',
       strasse:'Steinenvorstadt 50',plz:'4051',ort:'Basel',kanton:'BS',telefon:'061 555 66 77',email:'mueller@archmuster.ch',bkp:[],entscheidungsinstanz:'bh_vertretung',createdAt:'2025-06-02T08:00:00Z'},
      {id:'bet_1_pl',objektId:'obj_demo_1',rolle:'Sanitärplaner',firma:'Jäggi Vollmer GmbH',vorname:'Felix',name:'Jäggi',funktion:'Projektleiter Sanitär',
       strasse:'Rheinfelderstrasse 10',plz:'4058',ort:'Basel',kanton:'BS',telefon:'061 692 03 11',email:'felix@jaeggivollmer.ch',bkp:['25'],createdAt:'2025-06-02T08:00:00Z'},
      {id:'bet_1_un1',objektId:'obj_demo_1',rolle:'Unternehmer / Installateur',firma:'Meier Sanitär AG',vorname:'Peter',name:'Meier',funktion:'Geschäftsführer',
       strasse:'Industriestrasse 22',plz:'4142',ort:'Münchenstein',kanton:'BL',telefon:'061 333 44 55',email:'meier@meiersanitaer.ch',bkp:['25','251','253'],createdAt:'2025-06-05T08:00:00Z'},
      {id:'bet_1_un2',objektId:'obj_demo_1',rolle:'Unternehmer / Installateur',firma:'Steiner Sanitär GmbH',vorname:'Thomas',name:'Steiner',funktion:'Projektleiter',
       strasse:'Gewerbestrasse 15',plz:'8005',ort:'Zürich',kanton:'ZH',telefon:'044 222 33 44',email:'steiner@steinersanitaer.ch',bkp:['25','251','253'],createdAt:'2025-06-05T08:00:00Z'},
      // Objekt 2: Schulhaus — BH direkt
      {id:'bet_2_bh',objektId:'obj_demo_2',rolle:'Bauherrschaft',firma:'Gemeinde Reinach',vorname:'Andrea',name:'Fischer',funktion:'Leiterin Hochbau',
       strasse:'Hauptstrasse 10',plz:'4153',ort:'Reinach',kanton:'BL',telefon:'061 511 22 33',email:'fischer@reinach.bl.ch',bkp:[],entscheidungsinstanz:'bauherr',createdAt:'2025-09-02T08:00:00Z'},
      {id:'bet_2_pl',objektId:'obj_demo_2',rolle:'Sanitärplaner',firma:'Jäggi Vollmer GmbH',vorname:'Felix',name:'Jäggi',funktion:'Projektleiter Sanitär',
       strasse:'Rheinfelderstrasse 10',plz:'4058',ort:'Basel',kanton:'BS',telefon:'061 692 03 11',email:'felix@jaeggivollmer.ch',bkp:['25'],createdAt:'2025-09-02T08:00:00Z'},
      {id:'bet_2_un1',objektId:'obj_demo_2',rolle:'Unternehmer / Installateur',firma:'Meier Sanitär AG',vorname:'Peter',name:'Meier',funktion:'',
       strasse:'Industriestrasse 22',plz:'4142',ort:'Münchenstein',kanton:'BL',telefon:'061 333 44 55',email:'meier@meiersanitaer.ch',bkp:['25'],createdAt:'2025-09-05T08:00:00Z'},
      // Objekt 3: Büro Liestal — mit Architekt als BH-Vertretung
      {id:'bet_3_bh',objektId:'obj_demo_3',rolle:'Bauherrschaft',firma:'Roth Immobilien AG',vorname:'Daniel',name:'Roth',funktion:'Eigentümer',
       strasse:'Bahnhofstrasse 20',plz:'4410',ort:'Liestal',kanton:'BL',telefon:'061 901 22 33',email:'roth@rothimmo.ch',bkp:[],entscheidungsinstanz:'',createdAt:'2026-01-16T08:00:00Z'},
      {id:'bet_3_ar',objektId:'obj_demo_3',rolle:'Architekt / Generalplaner',firma:'Architektur Muster AG',vorname:'Sarah',name:'Müller',funktion:'Projektleiterin',
       strasse:'Steinenvorstadt 50',plz:'4051',ort:'Basel',kanton:'BS',telefon:'061 555 66 77',email:'mueller@archmuster.ch',bkp:[],entscheidungsinstanz:'bh_vertretung',createdAt:'2026-01-16T08:00:00Z'},
      {id:'bet_3_pl',objektId:'obj_demo_3',rolle:'Sanitärplaner',firma:'Jäggi Vollmer GmbH',vorname:'Felix',name:'Jäggi',funktion:'Projektleiter Sanitär',
       strasse:'Rheinfelderstrasse 10',plz:'4058',ort:'Basel',kanton:'BS',telefon:'061 692 03 11',email:'felix@jaeggivollmer.ch',bkp:['25'],createdAt:'2026-01-16T08:00:00Z'}
    ];
    _cache.activeObjektId = 'obj_demo_1';
    _save();
  }

  // ── Async: fetch from Supabase if empty ──
  var _readyResolve;
  var _readyPromise = new Promise(function(resolve) { _readyResolve = resolve; });

  function _fetchFromSupabase() {
    if (_loaded) { _readyResolve(); return; }
    var url = SB_URL + '/rest/v1/gema_data?module_key=eq.objekte&data_key=eq.' + KEY + '&select=payload';
    fetch(url, {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
    }).then(function(r) { return r.json(); })
    .then(function(rows) {
      if (rows && rows.length && rows[0].payload && rows[0].payload.v) {
        var data = rows[0].payload.v;
        // data is the JSON string stored by gema_db.js
        try {
          var parsed = typeof data === 'string' ? JSON.parse(data) : data;
          _cache = parsed;
          _loaded = true;
          localStorage.setItem(KEY, typeof data === 'string' ? data : JSON.stringify(data));
          // Notify dropdowns to re-populate
          w.dispatchEvent(new Event('gema-objekte-loaded'));
        } catch(e) { console.warn('[GemaObjekte] Parse error', e); }
      }
      _readyResolve();
    }).catch(function(e) {
      console.warn('[GemaObjekte] Supabase fetch failed (offline?)', e);
      _readyResolve();
    });
  }

  function _invalidate() { _cache = null; _loaded = false; }

  // ── Tenant-Filter mit Abteilungen + Gastzugang ─────────────────
  function _filterByOrg(list) {
    if (typeof GemaAuth === 'undefined') return list;
    if (GemaAuth.isAdmin()) return list;
    var user = GemaAuth.getCurrentUser();
    if (!user) return [];
    var orgId = user.orgId || 'org_default';

    // Eigene Org + Gast-Orgs
    var sichtbareOrgs = [orgId];
    if (typeof GemaAuth.getGastOrgs === 'function') {
      GemaAuth.getGastOrgs(user.id).forEach(function(g) { sichtbareOrgs.push(g.orgId); });
    }

    // Filter nach Org
    var orgFiltered = list.filter(function(o) {
      return sichtbareOrgs.indexOf(o.orgId || 'org_default') >= 0;
    });

    // Abteilungs-Filter (wenn aktiviert)
    var org = null;
    try { org = GemaAuth.getCurrentOrg(); } catch(e) {}
    if (org && org.settings && org.settings.sichtbarkeit === 'abteilung' && org.settings.abteilungenAktiv && user.abteilungId) {
      // Unternehmens-Admin sieht alles in seiner Org
      if (typeof GemaAuth.isOrgAdmin === 'function' && GemaAuth.isOrgAdmin(user.id)) return orgFiltered;
      // Normaler User: nur Projekte seiner Abteilung (oder ohne Abteilung)
      return orgFiltered.filter(function(o) {
        if ((o.orgId || 'org_default') !== orgId) return true; // Gast-Orgs: keine Abt-Filterung
        return !o.abteilungId || o.abteilungId === user.abteilungId
          || (Array.isArray(o.abteilungIds) && o.abteilungIds.indexOf(user.abteilungId) >= 0);
      });
    }

    return orgFiltered;
  }

  // API
  function getAllUnfiltered() { return _filterByOrg(_load().objekte || []); }
  function getAll() {
    // Standardmässig nur aktive Objekte (kein Status = aktiv)
    return getAllUnfiltered().filter(function(o){ return !o.status || o.status === 'aktiv'; });
  }
  function getAktive() { return getAll(); }
  function setObjektStatus(objektId, status) {
    var data = _load();
    var obj = (data.objekte || []).find(function(o){ return o.id === objektId; });
    if (!obj) return;
    obj.status = status;
    _save(data);
    _invalidate();
  }
  function setActiveId(objektId) {
    var oldId = _load().activeObjektId;
    var data = _load();
    data.activeObjektId = objektId;
    _save(data);
    _invalidate();
    // Event feuern damit alle Module reagieren können
    try {
      window.dispatchEvent(new CustomEvent('gema-objekt-changed', {
        detail: { oldId: oldId, newId: objektId }
      }));
    } catch(e) {}
  }
  function getActive() {
    var data = _load();
    if (!data.activeObjektId) return null;
    // getAll() already applies org filter
    return getAll().find(function(o) { return o.id === data.activeObjektId; }) || null;
  }
  function getActiveId() { return _load().activeObjektId || null; }
  function getBeteiligte(objektId) {
    var id = objektId || getActiveId();
    if (!id) return [];
    return (_load().beteiligte || []).filter(function(b) { return b.objektId === id; });
  }
  function getByRolle(rolle, objektId) {
    return getBeteiligte(objektId).filter(function(b) { return b.rolle === rolle; });
  }
  function getBeteiligterById(id) {
    return (_load().beteiligte || []).find(function(b) { return b.id === id; }) || null;
  }
  function getBauherrschaft(objektId) { return getByRolle('Bauherrschaft', objektId)[0] || null; }
  function getArchitekt(objektId) { return getByRolle('Architekt / Generalplaner', objektId)[0] || null; }
  function getPlaner(objektId) { return getByRolle('Sanitärplaner', objektId)[0] || null; }
  function getUnternehmer(objektId) { return getByRolle('Unternehmer / Installateur', objektId); }
  function formatKurz(b) {
    if (!b) return '\u2013';
    var parts = [];
    if (b.firma) parts.push(b.firma);
    var fullname = [b.vorname, b.name].filter(Boolean).join(' ');
    if (fullname) parts.push(fullname);
    return parts.join(' \u00b7 ') || '\u2013';
  }
  function formatAdresse(b) {
    if (!b) return '';
    return [b.strasse, [b.plz, b.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  function renderObjektSelect(selectId, includeEmpty) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var objekte = getAll();
    var activeId = getActiveId();
    sel.innerHTML = (includeEmpty !== false ? '<option value="">\u2013 Objekt w\u00e4hlen \u2013</option>' : '') +
      objekte.map(function(o) {
        return '<option value="' + o.id + '"' + (o.id === activeId ? ' selected' : '') + '>' + (o.name || 'Ohne Name') + (o.ort ? ' \u00b7 ' + o.ort : '') + '</option>';
      }).join('');
  }
  function renderBeteiligteSelect(selectId, rolle, objektId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var list = rolle ? getByRolle(rolle, objektId) : getBeteiligte(objektId);
    sel.innerHTML = '<option value="">\u2013 w\u00e4hlen \u2013</option>' +
      list.map(function(b) { return '<option value="' + b.id + '">' + formatKurz(b) + '</option>'; }).join('');
  }
  function refresh() { _invalidate(); }

  // ── SIA-Phase Support (optional) ──
  // Phasen: '' (keine), 'vorprojekt', 'bauprojekt', 'ausschreibung', 'ausfuehrung'
  // Wird per-Objekt gespeichert (objekt.aktivePhase) ODER global im sessionStorage
  // (falls kein Objekt aktiv).
  var PHASES = [
    { id: '',             label: '— Keine Phase —',        kurz: '' },
    { id: 'vorprojekt',   label: 'SIA 32 · Vorprojekt',    kurz: 'VP' },
    { id: 'bauprojekt',   label: 'SIA 33 · Bauprojekt',    kurz: 'BP' },
    { id: 'ausschreibung',label: 'SIA 41 · Ausschreibung', kurz: 'AS' },
    { id: 'ausfuehrung',  label: 'SIA 51-53 · Ausführung', kurz: 'AF' }
  ];
  function getPhases() { return PHASES.slice(); }
  function getActivePhase() {
    var obj = getActive();
    if (obj && obj.aktivePhase) return obj.aktivePhase;
    try { return sessionStorage.getItem('gema_active_phase') || ''; } catch(e) { return ''; }
  }
  function setActivePhase(phase) {
    var obj = getActive();
    if (obj) {
      obj.aktivePhase = phase || '';
      _save(_load());
      _invalidate();
    }
    try { sessionStorage.setItem('gema_active_phase', phase || ''); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent('gema-phase-changed', { detail: { phase: phase || '' } })); } catch(e) {}
  }

  // ── Per-Object Storage Helper ──
  // Zentrale Funktionen für objekt-spezifische Speicherung.
  // Pattern: baseKey + '__' + objektId          (ohne Phase)
  //          baseKey + '__' + objektId + '@' + phase  (mit Phase)
  // Ohne aktives Objekt: nur baseKey (globaler Fallback)
  function storageKey(baseKey) {
    var oid = getActiveId();
    if (!oid) return baseKey;
    var ph = getActivePhase();
    return ph ? (baseKey + '__' + oid + '@' + ph) : (baseKey + '__' + oid);
  }
  function savePerObjekt(baseKey, data) {
    var key = storageKey(baseKey);
    var json = typeof data === 'string' ? data : JSON.stringify(data);
    try { localStorage.setItem(key, json); } catch(e) {}
    if (typeof _GemaDB !== 'undefined') {
      try { _GemaDB.put(key, json).catch(function(){}); } catch(e) {}
    }
  }
  function loadPerObjekt(baseKey) {
    var key = storageKey(baseKey);
    try {
      var r = localStorage.getItem(key);
      if (r) return JSON.parse(r);
    } catch(e) {}
    // Fallback 1: phasenloser Key (gleiches Objekt, ohne Phase)
    var oid = getActiveId();
    if (oid) {
      var noPhase = baseKey + '__' + oid;
      if (key !== noPhase) {
        try {
          var n = localStorage.getItem(noPhase);
          if (n) return JSON.parse(n);
        } catch(e) {}
      }
    }
    // Fallback 2: globaler Key (Migration für Altdaten)
    if (key !== baseKey) {
      try {
        var g = localStorage.getItem(baseKey);
        if (g) return JSON.parse(g);
      } catch(e) {}
    }
    return null;
  }

  w.GemaObjekte = {
    getAll: getAll, getAllUnfiltered: getAllUnfiltered, getAktive: getAktive, getActive: getActive, getActiveId: getActiveId,
    setObjektStatus: setObjektStatus, setActiveId: setActiveId,
    getBeteiligte: getBeteiligte, getByRolle: getByRolle, getBeteiligterById: getBeteiligterById,
    getBauherrschaft: getBauherrschaft, getArchitekt: getArchitekt, getPlaner: getPlaner, getUnternehmer: getUnternehmer,
    formatKurz: formatKurz, formatAdresse: formatAdresse,
    renderObjektSelect: renderObjektSelect, renderBeteiligteSelect: renderBeteiligteSelect,
    refresh: refresh, ready: _readyPromise,
    storageKey: storageKey, savePerObjekt: savePerObjekt, loadPerObjekt: loadPerObjekt,
    // SIA-Phase
    getPhases: getPhases, getActivePhase: getActivePhase, setActivePhase: setActivePhase
  };

  // Auto-init: try sync first, then async Supabase if needed
  _load();
  if (!_loaded) _fetchFromSupabase();
  else _readyResolve();

  // ── Phase-Selector Auto-Inject ───────────────────────────────
  // F\u00fcgt automatisch ein SIA-Phase Dropdown in die .project-bar
  // jedes Berechnungsmoduls ein, falls vorhanden. Speichert Auswahl
  // im aktiven Objekt (objekt.aktivePhase) bzw. in sessionStorage.
  function _injectPhaseSelector() {
    try {
      var bar = document.querySelector('.project-bar');
      if (!bar || bar.querySelector('.gema-phase-pf')) return;
      var pf = document.createElement('div');
      pf.className = 'pf gema-phase-pf';
      pf.style.minWidth = '170px';
      var current = getActivePhase();
      var options = PHASES.map(function(p){
        return '<option value="'+p.id+'"'+(p.id===current?' selected':'')+'>'+p.label+'</option>';
      }).join('');
      pf.innerHTML = '<label>SIA-Phase <span title="Optional: Berechnungen werden separat pro Phase gespeichert" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#e2e8f0;color:#475569;font-size:10px;line-height:14px;text-align:center;font-weight:700;cursor:help;margin-left:4px">?</span></label>'
                    + '<select id="metaSiaPhase">'+options+'</select>';
      bar.appendChild(pf);
      var sel = pf.querySelector('#metaSiaPhase');
      if (sel) {
        sel.addEventListener('change', function(){
          var newPhase = sel.value;
          var oldPhase = getActivePhase();
          if (newPhase === oldPhase) return;
          setActivePhase(newPhase);
          // Module sollen ihre Daten neu laden — Event feuern
          // (Module die loadPerObjekt nutzen, h\u00f6ren auf gema-objekt-changed)
          try { window.dispatchEvent(new CustomEvent('gema-objekt-changed', { detail: { oldId: getActiveId(), newId: getActiveId(), phaseChange: true } })); } catch(e){}
          // Visuelles Feedback
          try {
            var t = document.createElement('div');
            t.textContent = '✓ Phase gewechselt: ' + (PHASES.find(function(p){return p.id===newPhase;})?.label || 'Keine');
            Object.assign(t.style,{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',background:'#0f172a',color:'#fff',padding:'10px 18px',borderRadius:'10px',fontSize:'13px',fontWeight:'600',zIndex:'9999',boxShadow:'0 4px 20px rgba(0,0,0,.3)'});
            document.body.appendChild(t);
            setTimeout(function(){ t.remove(); }, 2200);
          } catch(e){}
        });
      }
    } catch(e) { /* silent */ }
  }
  function _initPhaseInjector() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _injectPhaseSelector);
    } else {
      _injectPhaseSelector();
    }
    // Re-inject if .project-bar appears later (some modules build it dynamically)
    try {
      var mo = new MutationObserver(function(){ _injectPhaseSelector(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // Auto-disconnect after 5s
      setTimeout(function(){ try { mo.disconnect(); } catch(e){} }, 5000);
    } catch(e){}
  }
  _initPhaseInjector();

})(window);
