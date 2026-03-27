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
    return _cache;
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

  // ── Tenant-Filter ─────────────────────────────────────────────────
  // Admin sieht alle Objekte; andere User nur die ihrer eigenen Org.
  function _filterByOrg(list) {
    if (typeof GemaAuth === 'undefined') return list;
    if (GemaAuth.isAdmin()) return list;
    var user = GemaAuth.getCurrentUser();
    if (!user) return [];
    var orgId = user.orgId || 'org_default';
    return list.filter(function(o) { return (o.orgId || 'org_default') === orgId; });
  }

  // API
  function getAll() { return _filterByOrg(_load().objekte || []); }
  function getAktive() { return getAll().filter(function(o){ return !o.status || o.status === 'aktiv'; }); }
  function setObjektStatus(objektId, status) {
    var data = _load();
    var obj = (data.objekte || []).find(function(o){ return o.id === objektId; });
    if (!obj) return;
    obj.status = status;
    _save(data);
    _invalidate();
  }
  function setActiveId(objektId) {
    var data = _load();
    data.activeObjektId = objektId;
    _save(data);
    _invalidate();
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

  w.GemaObjekte = {
    getAll: getAll, getAktive: getAktive, getActive: getActive, getActiveId: getActiveId,
    setObjektStatus: setObjektStatus, setActiveId: setActiveId,
    getBeteiligte: getBeteiligte, getByRolle: getByRolle, getBeteiligterById: getBeteiligterById,
    getBauherrschaft: getBauherrschaft, getArchitekt: getArchitekt, getPlaner: getPlaner, getUnternehmer: getUnternehmer,
    formatKurz: formatKurz, formatAdresse: formatAdresse,
    renderObjektSelect: renderObjektSelect, renderBeteiligteSelect: renderBeteiligteSelect,
    refresh: refresh, ready: _readyPromise
  };

  // Auto-init: try sync first, then async Supabase if needed
  _load();
  if (!_loaded) _fetchFromSupabase();
  else _readyResolve();

})(window);
