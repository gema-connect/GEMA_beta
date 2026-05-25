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

  // Self-Healing: prueft, ob activeObjektId auf ein existierendes Objekt
  // zeigt. Wenn nicht (geloescht, archiviert, falsche Org via Workspace-
  // Eimer), wird die verwaiste ID geleert. Sonst zeigen Berechnungsmodule
  // den Status «Zugeordnet zu: <unbekannt>» und Cross-Modul-APIs liefern
  // keine Daten — Symptome aus dem Workspace-Bug.
  function _healActive(cache) {
    if (!cache || !cache.activeObjektId) return;
    var exists = (cache.objekte || []).some(function(o){
      return o && o.id === cache.activeObjektId;
    });
    if (!exists) {
      try { console.info('[GemaObjekte] Verwaiste activeObjektId bereinigt:', cache.activeObjektId); } catch(e) {}
      cache.activeObjektId = null;
    }
  }

  function _load() {
    if (_cache) return _cache;
    // 1. localStorage
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { _cache = JSON.parse(raw); _loaded = true; _healActive(_cache); return _cache; }
    } catch(e) {}
    // 2. GemaDB cache
    try {
      if (typeof _GemaDB !== 'undefined' && _GemaDB.c) {
        var raw2 = _GemaDB.c[KEY] || null;
        if (raw2) {
          _cache = JSON.parse(raw2);
          _loaded = true;
          try { localStorage.setItem(KEY, raw2); } catch(e) {}
          _healActive(_cache);
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
    _cache.objekte = [];
    _cache.beteiligte = [];
    _cache.activeObjektId = null;
    _save();
  }

  // ── Async: fetch from Supabase if empty ──
  var _readyResolve;
  var _readyPromise = new Promise(function(resolve) { _readyResolve = resolve; });

  function _fetchFromSupabase() {
    if (_loaded) { _readyResolve(); return; }
    var url = SB_URL + '/rest/v1/gema_data?module_key=eq.objekte&data_key=eq.' + KEY + '&select=payload';
    var timeout = setTimeout(function(){ _readyResolve(); }, 3000);
    fetch(url, {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
    }).then(function(r) { return r.json(); })
    .then(function(rows) {
      clearTimeout(timeout);
      if (rows && rows.length && rows[0].payload && rows[0].payload.v) {
        var data = rows[0].payload.v;
        try {
          var parsed = typeof data === 'string' ? JSON.parse(data) : data;
          _cache = parsed;
          _loaded = true;
          localStorage.setItem(KEY, typeof data === 'string' ? data : JSON.stringify(data));
          w.dispatchEvent(new Event('gema-objekte-loaded'));
        } catch(e) { console.warn('[GemaObjekte] Parse error', e); }
      }
      _readyResolve();
    }).catch(function(e) {
      clearTimeout(timeout);
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
  // ── Team-Zuweisung (P08) ──
  // Projektleiter, Abteilungsleiter (Prüfer) und Team am Objekt.
  // User-IDs zeigen auf GemaAuth-User der gleichen Organisation.
  function getAssignedUserIds(obj) {
    if (!obj) return [];
    var ids = [];
    if (obj.projektLeiterId) ids.push(obj.projektLeiterId);
    if (obj.abteilungsLeiterId && ids.indexOf(obj.abteilungsLeiterId) < 0) ids.push(obj.abteilungsLeiterId);
    (obj.teamUserIds || []).forEach(function(uid){ if (ids.indexOf(uid) < 0) ids.push(uid); });
    return ids;
  }
  function isAssignedToCurrentUser(obj) {
    try {
      if (!w.GemaAuth || !w.GemaAuth.getCurrentUser) return false;
      var me = w.GemaAuth.getCurrentUser();
      if (!me) return false;
      return getAssignedUserIds(obj).indexOf(me.id) >= 0;
    } catch(e) { return false; }
  }
  function canEditTeam(obj) {
    try {
      if (!w.GemaAuth || !w.GemaAuth.getCurrentUser) return false;
      var me = w.GemaAuth.getCurrentUser();
      if (!me) return false;
      // Admins dürfen immer
      if (me.roleIds && me.roleIds.indexOf('role_admin') >= 0) return true;
      // Projektleiter darf
      if (obj && obj.projektLeiterId === me.id) return true;
      // Ersteller darf (vor erster Zuweisung)
      if (obj && (!obj.projektLeiterId) && obj.erstelltVon === me.id) return true;
      return false;
    } catch(e) { return false; }
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

  // ── Parent-Child-Hierarchie ──
  // Gibt das Parent-Objekt zurück (oder null). Respektiert Org-Filter.
  function getParent(objektId) {
    var obj = getAllUnfiltered().find(function(o){ return o.id === objektId; });
    if (!obj || !obj.parentObjektId) return null;
    return getAllUnfiltered().find(function(o){ return o.id === obj.parentObjektId; }) || null;
  }
  // Direkte Kinder (erste Ebene) eines Objekts.
  function getChildren(objektId) {
    return getAllUnfiltered().filter(function(o){ return o.parentObjektId === objektId; });
  }
  // Alle Nachkommen (rekursiv, beliebig tief).
  function getDescendants(objektId) {
    var all = getAllUnfiltered();
    var out = [];
    var stack = [objektId];
    var seen = {};
    while (stack.length) {
      var cur = stack.pop();
      all.forEach(function(o){
        if (o.parentObjektId === cur && !seen[o.id]) {
          seen[o.id] = true;
          out.push(o);
          stack.push(o.id);
        }
      });
    }
    return out;
  }
  // Breadcrumb vom Root bis zum Objekt: ['Spital', 'Etappe 2 Rohbau', 'Sub-Los A']
  function getBreadcrumb(objektId) {
    var all = getAllUnfiltered();
    var names = [];
    var cur = all.find(function(o){ return o.id === objektId; });
    var guard = 0;
    while (cur && guard < 10) {
      names.unshift(cur.name || '–');
      if (!cur.parentObjektId) break;
      cur = all.find(function(o){ return o.id === cur.parentObjektId; });
      guard++;
    }
    return names;
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

  // ── Berechnungs-Index (P04) ──
  // Zentraler Index aller Berechnungen pro Projekt. Module registrieren
  // sich via registerBerechnung() bei jedem Auto-Save. Der Index macht
  // Berechnungen im pm_objekte «Berechnungen»-Tab auffindbar.
  var _BK_IDX = 'gema_berechnungen_index_v1';
  function _loadBerIndex(){
    try { var r = localStorage.getItem(_BK_IDX); return r ? (JSON.parse(r) || []) : []; } catch(e){ return []; }
  }
  function _saveBerIndex(arr){
    try { localStorage.setItem(_BK_IDX, JSON.stringify(arr || [])); } catch(e){}
  }
  function _currentOrgId(){
    try { return (w.GemaAuth && w.GemaAuth.getCurrentUser && w.GemaAuth.getCurrentUser()) ? w.GemaAuth.getCurrentUser().orgId : null; } catch(e){ return null; }
  }
  function _currentUserId(){
    try { return (w.GemaAuth && w.GemaAuth.getCurrentUser && w.GemaAuth.getCurrentUser()) ? w.GemaAuth.getCurrentUser().id : null; } catch(e){ return null; }
  }
  // registerBerechnung({modul, objektId?, titel?, storageKey?})
  // Erstellt oder aktualisiert den Index-Eintrag (modul+objektId ist Key).
  function registerBerechnung(entry){
    if (!entry || !entry.modul) return;
    var objektId = entry.objektId || getActiveId();
    if (!objektId) return; // Keine Zuordnung, kein Index-Eintrag
    var idx = _loadBerIndex();
    var key = entry.modul + '__' + objektId;
    var now = new Date().toISOString();
    var existing = idx.find(function(e){ return e.key === key; });
    var orgId = entry.orgId || _currentOrgId();
    var userId = entry.userId || _currentUserId();
    if (existing) {
      existing.lastModified = now;
      existing.lastUserId = userId;
      if (entry.titel) existing.titel = entry.titel;
      if (entry.storageKey) existing.storageKey = entry.storageKey;
    } else {
      idx.push({
        key: key,
        modul: entry.modul,
        objektId: objektId,
        titel: entry.titel || entry.modul,
        storageKey: entry.storageKey || null,
        orgId: orgId,
        createdAt: now,
        createdBy: userId,
        lastModified: now,
        lastUserId: userId
      });
    }
    _saveBerIndex(idx);
  }
  function getBerechnungenForObjekt(objektId){
    if (!objektId) objektId = getActiveId();
    if (!objektId) return [];
    return _loadBerIndex().filter(function(e){ return e.objektId === objektId; })
      .sort(function(a,b){ return (b.lastModified||'').localeCompare(a.lastModified||''); });
  }
  function getBerechnungenForCurrentOrg(){
    var orgId = _currentOrgId();
    if (!orgId) return _loadBerIndex();
    return _loadBerIndex().filter(function(e){ return !e.orgId || e.orgId === orgId; })
      .sort(function(a,b){ return (b.lastModified||'').localeCompare(a.lastModified||''); });
  }
  function removeBerechnung(modul, objektId){
    var idx = _loadBerIndex();
    var key = modul + '__' + objektId;
    _saveBerIndex(idx.filter(function(e){ return e.key !== key; }));
  }

  w.GemaObjekte = {
    getAll: getAll, getAllUnfiltered: getAllUnfiltered, getAktive: getAktive, getActive: getActive, getActiveId: getActiveId,
    setObjektStatus: setObjektStatus, setActiveId: setActiveId,
    getBeteiligte: getBeteiligte, getByRolle: getByRolle, getBeteiligterById: getBeteiligterById,
    getParent: getParent, getChildren: getChildren, getDescendants: getDescendants, getBreadcrumb: getBreadcrumb,
    getBauherrschaft: getBauherrschaft, getArchitekt: getArchitekt, getPlaner: getPlaner, getUnternehmer: getUnternehmer,
    formatKurz: formatKurz, formatAdresse: formatAdresse,
    renderObjektSelect: renderObjektSelect, renderBeteiligteSelect: renderBeteiligteSelect,
    refresh: refresh, ready: _readyPromise,
    storageKey: storageKey, savePerObjekt: savePerObjekt, loadPerObjekt: loadPerObjekt,
    // SIA-Phase
    getPhases: getPhases, getActivePhase: getActivePhase, setActivePhase: setActivePhase,
    // Berechnungs-Index (P04)
    registerBerechnung: registerBerechnung,
    getBerechnungenForObjekt: getBerechnungenForObjekt,
    getBerechnungenForCurrentOrg: getBerechnungenForCurrentOrg,
    removeBerechnung: removeBerechnung,
    // Team-Zuweisung (P08)
    getAssignedUserIds: getAssignedUserIds,
    isAssignedToCurrentUser: isAssignedToCurrentUser,
    canEditTeam: canEditTeam
  };

  // Auto-init: try sync first, then async Supabase if needed
  _load();
  if (!_loaded) _fetchFromSupabase();
  else _readyResolve();

  // P04: URL-Parameter ?objekt=ID setzt das aktive Objekt beim Seitenaufruf
  try {
    if (typeof location !== 'undefined' && location.search) {
      var params = new URLSearchParams(location.search);
      var urlObj = params.get('objekt');
      if (urlObj) {
        _readyPromise.then(function(){
          if (getAllUnfiltered().find(function(o){ return o.id === urlObj; })) {
            setActiveId(urlObj);
          }
        });
      }
    }
  } catch(e) {}

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
      var mo = new MutationObserver(function(){
        // Wichtig: NUR re-injecten wenn etwas fehlt. Wenn beide Pills
        // schon da sind, gar nichts tun — sonst feuert _renderZuordnungsPill
        // einen DOM-Write (textContent etc.), der den Observer wieder
        // triggert → Endlosschleife, Browser-Tab haengt sich auf.
        var bar = document.querySelector('.project-bar');
        if (!bar) return;
        var hasPhase = bar.querySelector('.gema-phase-pf');
        var hasPill = bar.querySelector('.gema-zuordnung-pill');
        if (hasPhase && hasPill) return;  // alles drin, kein Update noetig
        if (!hasPhase) _injectPhaseSelector();
        if (!hasPill)  _renderZuordnungsPill();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      // Auto-disconnect after 2s (frueher 5s — der Loop unten konnte
      // die Page so lange einfrieren, das ist viel zu lang).
      setTimeout(function(){ try { mo.disconnect(); } catch(e){} }, 2000);
    } catch(e){}
  }
  _initPhaseInjector();

  // ── Zuordnungs-Pill (P04) ───────────────────────────────────
  // Injiziert einen kleinen Status-Chip in die .project-bar:
  //  • Grün/gedeckt: «📋 Zugeordnet zu: <Objekt>»
  //  • Amber:       «⚠ Nicht zugeordnet — bitte Projekt wählen»
  // Bleibt weich (keine Pflicht), aber Planer sieht den Status sofort.
  function _renderZuordnungsPill(){
    try {
      var bar = document.querySelector('.project-bar');
      if (!bar) return;
      var existing = bar.querySelector('.gema-zuordnung-pill');
      var active = getActive();
      var text, bg, bd, col;
      if (active) {
        var label = (active.nummer ? active.nummer + ' · ' : '') + (active.name || active.projekt || active.id);
        text = '📋 Zugeordnet zu: ' + label;
        bg = '#ecfdf5'; bd = '#bbf7d0'; col = '#166534';
      } else {
        text = '⚠ Nicht zugeordnet — bitte Projekt wählen';
        bg = '#fffbeb'; bd = '#fde68a'; col = '#92400e';
      }
      if (existing) {
        // Nur ueberschreiben wenn sich was geaendert hat. Sonst
        // triggert die DOM-Mutation einen MutationObserver der diese
        // Funktion erneut aufruft → Endlosschleife.
        if (existing.textContent !== text) existing.textContent = text;
        if (existing.style.background !== bg) existing.style.background = bg;
        if (existing.style.borderColor !== bd) existing.style.borderColor = bd;
        if (existing.style.color !== col) existing.style.color = col;
        return;
      }
      var pill = document.createElement('div');
      pill.className = 'gema-zuordnung-pill';
      pill.textContent = text;
      pill.style.cssText = 'grid-column:1/-1;padding:6px 12px;border-radius:8px;font-size:11.5px;font-weight:700;background:'+bg+';border:1.5px solid '+bd+';color:'+col+';margin-top:6px;text-align:center;letter-spacing:.2px';
      bar.appendChild(pill);
    } catch(e) {}
  }
  // Re-render pill bei Objektwechsel
  try {
    w.addEventListener('gema-objekt-changed', _renderZuordnungsPill);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _renderZuordnungsPill);
    } else {
      setTimeout(_renderZuordnungsPill, 200);
    }
  } catch(e) {}

})(window);
