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

  // ════════════════════════════════════════════════════════════════
  // PER-RECORD CLOUD-SYNC (ersetzt den alten Blob-Ansatz)
  // ----------------------------------------------------------------
  // Frueher wurde der gesamte {objekte, beteiligte, activeObjektId}-
  // Blob als EINE Cloud-Row gespeichert (Last-Write-Wins) und nur dann
  // aus der Cloud geholt, wenn lokal noch gar nichts existierte. Folge:
  // Objekte von Kollegen erschienen nie ("Objekt nicht gefunden") und
  // jeder Save konnte fremde Objekte aus der Cloud loeschen.
  //
  // Jetzt: pro Objekt/Beteiligtem eine eigene Row (wie Dachbericht/
  // Werkzeug), Diff-Saves, und bei JEDEM Laden frisch aus der Cloud.
  // activeObjektId ist reine Geraete-UI und bleibt NUR lokal.
  // ════════════════════════════════════════════════════════════════
  var MODULE      = 'objekte';
  var OBJ_PREFIX  = 'objekt:';
  var BET_PREFIX  = 'bet:';
  var OBJ_POOL    = 'gema_objpool_v1';   // Diff-Cache der Objekt-Records
  var BET_POOL    = 'gema_betpool_v1';   // Diff-Cache der Beteiligte-Records
  var ACTIVE_KEY  = 'gema_active_objekt_v1'; // activeObjektId NUR lokal/Geraet

  function _hasSync(){ return typeof w.GemaSync !== 'undefined' && w.GemaSync.persistCollection; }
  function _readActiveLocal(){ try { return localStorage.getItem(ACTIVE_KEY) || null; } catch(e){ return null; } }
  function _writeActiveLocal(id){ try { if(id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch(e){} }

  // Schreibt den lokalen Blob (gema_objekte_v1) aus objekte/bet/active,
  // damit ALLE bestehenden Leser unveraendert funktionieren.
  function _writeLocalBlob(objekte, beteiligte, activeId){
    var blob = { objekte: objekte || [], beteiligte: beteiligte || [], activeObjektId: activeId || null };
    _cache = blob;
    try { localStorage.setItem(KEY, JSON.stringify(blob)); } catch(e){}
    return blob;
  }

  // Holt den alten Blob (Cloud-Row module_key=objekte,data_key=gema_objekte_v1
  // ODER localStorage) fuer die einmalige Migration auf Per-Record.
  function _fetchLegacyCloudBlob(){
    var url = SB_URL + '/rest/v1/gema_data?module_key=eq.objekte&data_key=eq.' + KEY + '&select=payload';
    return fetch(url, { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } })
      .then(function(r){ return r.json(); })
      .then(function(rows){
        if (rows && rows.length && rows[0].payload && rows[0].payload.v){
          var v = rows[0].payload.v;
          try { return typeof v === 'string' ? JSON.parse(v) : v; } catch(e){ return null; }
        }
        return null;
      }).catch(function(){ return null; });
  }
  function _migrateLegacyBlob(){
    return _fetchLegacyCloudBlob().then(function(cloudBlob){
      var blob = cloudBlob;
      if (!blob || !((blob.objekte||[]).length || (blob.beteiligte||[]).length)){
        try { var lb = JSON.parse(localStorage.getItem(KEY) || 'null'); if (lb) blob = lb; } catch(e){}
      }
      var objekte = (blob && Array.isArray(blob.objekte)) ? blob.objekte : [];
      var bet     = (blob && Array.isArray(blob.beteiligte)) ? blob.beteiligte : [];
      if (!objekte.length && !bet.length) return { objekte: [], beteiligte: [] };
      var ops = [];
      if (objekte.length) ops.push(w.GemaSync.persistCollection(MODULE, OBJ_POOL, OBJ_PREFIX, 'id', objekte));
      if (bet.length)     ops.push(w.GemaSync.persistCollection(MODULE, BET_POOL, BET_PREFIX, 'id', bet));
      return Promise.all(ops).then(function(){
        try { console.info('[GemaObjekte] Migration Blob→Per-Record:', objekte.length, 'Objekte,', bet.length, 'Beteiligte'); } catch(e){}
        return { objekte: objekte, beteiligte: bet };
      }).catch(function(){ return { objekte: objekte, beteiligte: bet }; });
    });
  }

  // Faedelt das Cloud-Ergebnis in den lokalen Blob + feuert Event.
  function _finishPull(objekte, beteiligte){
    var active = _readActiveLocal();
    if (!active){ try { var b = JSON.parse(localStorage.getItem(KEY)||'{}'); active = b.activeObjektId || null; } catch(e){} }
    _writeLocalBlob(objekte, beteiligte, active);
    _healActive(_cache);
    _writeActiveLocal(_cache.activeObjektId);
    _loaded = true;
    try { w.dispatchEvent(new Event('gema-objekte-loaded')); } catch(e){}
    return _cache;
  }

  // Laedt Objekte + Beteiligte per-Record frisch aus der Cloud. Bei
  // leerer Cloud: einmalige Migration aus dem alten Blob. Bei Offline/
  // ohne GemaSync: lokaler Blob als Fallback.
  function _pullFromCloud(){
    if (typeof w.GemaSync === 'undefined' || !w.GemaSync.bindCollection){
      _load(); _loaded = true; return Promise.resolve(_cache);
    }
    return Promise.all([
      w.GemaSync.bindCollection(MODULE, OBJ_POOL, OBJ_PREFIX, 'id'),
      w.GemaSync.bindCollection(MODULE, BET_POOL, BET_PREFIX, 'id')
    ]).then(function(res){
      var objekte = res[0] || [];
      var bet     = res[1] || [];
      if (!objekte.length && !bet.length){
        return _migrateLegacyBlob().then(function(m){ return _finishPull(m.objekte, m.beteiligte); });
      }
      return _finishPull(objekte, bet);
    }).catch(function(e){
      try { console.warn('[GemaObjekte] Cloud-Pull fehlgeschlagen, lokaler Stand:', e && e.message); } catch(_e){}
      _load(); _loaded = true; return _cache;
    });
  }
  // Oeffentlicher Re-Pull (z.B. periodisch / bei Tab-Wechsel).
  function reload(){ return _pullFromCloud(); }

  // Speichert den vollen Blob: lokal sofort (alle Leser frisch) und die
  // Cloud per-Record (Diff). activeObjektId bleibt rein lokal.
  // Das ist auch die (frueher fehlende) _save-Implementierung.
  function _save(data){
    data = data || _cache || { objekte: [], beteiligte: [], activeObjektId: null };
    var objekte = Array.isArray(data.objekte) ? data.objekte : [];
    var bet     = Array.isArray(data.beteiligte) ? data.beteiligte : [];
    var active  = (data.activeObjektId != null) ? data.activeObjektId : _readActiveLocal();
    _writeLocalBlob(objekte, bet, active);
    _writeActiveLocal(active);
    if (_hasSync()){
      try {
        w.GemaSync.persistCollection(MODULE, OBJ_POOL, OBJ_PREFIX, 'id', objekte).catch(function(){});
        w.GemaSync.persistCollection(MODULE, BET_POOL, BET_PREFIX, 'id', bet).catch(function(){});
      } catch(e){}
    }
    return Promise.resolve();
  }
  // Oeffentlicher Save fuer den vollen Stand (pm_objekte ist autoritativ,
  // Loeschungen erwuenscht).
  function persistBlob(blob){ return _save(blob); }

  // ADD-ONLY Upsert eines einzelnen Objekts — fuer Quick-Add aus den
  // Bericht-/Workspace-Modulen. Nutzt saveRecord (kein Diff, KEINE
  // Loeschung), damit ein evtl. noch unvollstaendig geladener lokaler
  // Blob NICHT versehentlich fremde Objekte aus der Cloud entfernt.
  function upsertObjekt(obj){
    if (!obj || !obj.id) return Promise.resolve();
    var data = _load() || { objekte: [], beteiligte: [], activeObjektId: null };
    var arr = Array.isArray(data.objekte) ? data.objekte.slice() : [];
    var idx = -1;
    for (var i = 0; i < arr.length; i++){ if (arr[i] && arr[i].id === obj.id){ idx = i; break; } }
    if (idx >= 0) arr[idx] = obj; else arr.push(obj);
    var bet = Array.isArray(data.beteiligte) ? data.beteiligte : [];
    _writeLocalBlob(arr, bet, _readActiveLocal());
    if (typeof w.GemaSync !== 'undefined' && w.GemaSync.saveRecord){
      try { w.GemaSync.saveRecord(MODULE, OBJ_PREFIX + obj.id, obj).catch(function(){}); } catch(e){}
      // Pool-Diff-Cache mitziehen, damit ein spaeterer persistCollection-
      // Diff diesen Record nicht als "neu" doppelt sieht.
      try {
        var pool = JSON.parse(localStorage.getItem(OBJ_POOL) || '[]');
        if (!Array.isArray(pool)) pool = [];
        var p = -1;
        for (var j = 0; j < pool.length; j++){ if (pool[j] && pool[j].id === obj.id){ p = j; break; } }
        if (p >= 0) pool[p] = obj; else pool.push(obj);
        localStorage.setItem(OBJ_POOL, JSON.stringify(pool));
      } catch(e){}
    }
    return Promise.resolve();
  }


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
    // activeObjektId ist reine Geraete-UI — NUR lokal, nie in die Cloud.
    var data = _load();
    var oldId = data.activeObjektId;
    data.activeObjektId = objektId;
    _cache = data;
    _writeActiveLocal(objektId);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e){}
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
    refresh: refresh, reload: reload, ready: _readyPromise,
    persistBlob: persistBlob, upsertObjekt: upsertObjekt,
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

  // Auto-init: lokalen Blob sofort fuer sync-Leser, dann IMMER frisch
  // per-Record aus der Cloud nachladen (sonst erscheinen Kollegen-Objekte
  // nie). _readyResolve erst nach dem Cloud-Pull.
  _load();
  _pullFromCloud().then(function(){ _readyResolve(); });

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
  // Stylt das injizierte SIA-Phase-<select> wie die .pf input-Felder der
  // Berechnungsmodule. Hintergrund: die Module definieren '.pf input', aber
  // KEIN '.pf select' — das injizierte Dropdown sah daher unformatiert
  // (Browser-Default) neben den Eingabefeldern aus. Einmal pro Seite.
  function _ensurePhaseStyle() {
    if (document.getElementById('gema-phase-style')) return;
    var st = document.createElement('style');
    st.id = 'gema-phase-style';
    st.textContent =
      '.gema-phase-pf select{width:100%;border:1.5px solid var(--border2,#cdd4e4);border-radius:8px;outline:none;'
      + 'font-size:13px;font-weight:600;color:var(--text,#0f172a);font-family:inherit;padding:7px 30px 7px 10px;'
      + 'height:auto;line-height:1.3;cursor:pointer;-webkit-appearance:none;-moz-appearance:none;appearance:none;'
      + 'background-color:var(--surface,#fff);'
      + "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\");"
      + 'background-repeat:no-repeat;background-position:right 10px center;background-size:11px;}'
      + '.gema-phase-pf select:focus{border-color:var(--accent,var(--acc,#2563eb));box-shadow:0 0 0 2px rgba(37,99,235,.12);}';
    (document.head || document.documentElement).appendChild(st);
  }
  function _injectPhaseSelector() {
    try {
      var bar = document.querySelector('.project-bar');
      if (!bar || bar.querySelector('.gema-phase-pf')) return;
      _ensurePhaseStyle();
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
