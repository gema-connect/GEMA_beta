/**
 * gema_editlock.js — Gleichzeitig-Bearbeiten-Warnung (GemaEditLock)
 *
 * Zeigt einen amber Warn-Banner, wenn ZWEI Personen denselben Datensatz
 * (gleiches Modul + gleiches Projekt/Dokument) gleichzeitig bearbeiten.
 * Die Sync-Schicht ist Last-Write-Wins — der Banner verhindert nichts
 * (bewusst nicht-blockierend), macht den Konflikt aber sichtbar, BEVOR
 * sich zwei Leute gegenseitig ueberschreiben.
 *
 * Mechanik: Heartbeat-Locks als eigene Cloud-Rows
 *   moduleKey 'editlock', data_key 'lock:<datensatz-key>__<userId>'
 *   {key, userId, userName, label, ts}
 * Jede bearbeitende Person schreibt alle HEARTBEAT_MS ihren eigenen
 * Lock-Record (eine Row PRO USER → keine Schreibkonflikte, Muster
 * chatread:) und liest die Locks der anderen. Ein Lock gilt als aktiv,
 * solange sein ts juenger als TTL_MS ist — Tab zu / Absturz / Standby
 * loesen sich damit von selbst auf. Beim Verlassen (pagehide/stop) wird
 * der eigene Lock best-effort geloescht (keepalive-DELETE).
 *
 * Integration:
 *   GemaEditLock.watch({ key:'gema_druckdispositiv__obj_1', label:'…' })
 *   GemaEditLock.stop()
 * Es laeuft immer genau EIN Watch pro Seite (watch ersetzt den vorigen).
 * Verdrahtet: gema_autosave.js (alle Berechnungsmodule, Key = AutoSave-
 * Storage-Key pro Objekt/Phase) und pm_erp.html (pro Dokument).
 *
 * KRITISCH:
 *  - Alle Cloud-Calls mit {noQueue:true} — Locks sind ephemer und duerfen
 *    NIE in der Outbox landen (ein nachgesendeter alter Heartbeat waere
 *    ein Geister-Lock).
 *  - Bei verstecktem Tab (document.hidden) pausiert der Heartbeat — der
 *    eigene Lock laeuft via TTL ab, die Person "bearbeitet" ja nicht.
 *  - Offline/Fehler beim Check aendern den Banner-Zustand NICHT
 *    (kein Flackern; der Offline-Banner von gema_sync uebernimmt).
 */
(function(w){
  'use strict';
  if (w.GemaEditLock) return;
  var d = w.document;

  var MK = 'editlock';
  var PREFIX = 'lock:';
  // Test-Hooks: window._GEMA_EDITLOCK_HB_MS / _TTL_MS VOR watch() setzen.
  function HB_MS(){ return (typeof w._GEMA_EDITLOCK_HB_MS === 'number' && w._GEMA_EDITLOCK_HB_MS > 0) ? w._GEMA_EDITLOCK_HB_MS : 30000; }
  function TTL_MS(){ return (typeof w._GEMA_EDITLOCK_TTL_MS === 'number' && w._GEMA_EDITLOCK_TTL_MS > 0) ? w._GEMA_EDITLOCK_TTL_MS : 75000; }
  var STALE_CLEAN_MS = 10 * 60 * 1000;   // uralte Lock-Leichen mit abraeumen

  var cur = null;          // { key, label, timer }
  var banner = null;
  var dismissedSig = '';   // ✕ gedrueckt fuer DIESE Konstellation anderer Bearbeiter

  function _sync(){ return (w.GemaSync && w.GemaSync.saveRecord && w.GemaSync.loadCollection) ? w.GemaSync : null; }
  function _me(){
    try{ return (typeof w.GemaAuth !== 'undefined') ? w.GemaAuth.getCurrentUser() : null; }catch(e){ return null; }
  }
  function _esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  // data_key-tauglich machen (Key kann @-Phase, __ etc. enthalten — ok;
  // nur Whitespace/Steuerzeichen raus, damit like-Prefix-Queries sauber sind)
  function _san(s){ return String(s || '').replace(/[^\w@.:\-]/g, '_'); }
  function _lockKey(key, uid){ return PREFIX + _san(key) + '__' + _san(uid); }

  // ── Banner ────────────────────────────────────────────────────
  function _sig(others){
    return others.map(function(o){ return o.userId; }).sort().join('|');
  }
  function _showBanner(others){
    var sig = _sig(others);
    if (sig === dismissedSig) return;   // fuer diese Konstellation weggeklickt
    var names = [];
    others.forEach(function(o){
      var n = o.userName || 'Unbekannte Person';
      if (names.indexOf(n) < 0) names.push(n);
    });
    var txt = '<b>' + names.map(_esc).join(', ') + '</b> bearbeitet '
      + (names.length > 1 ? 'bearbeiten ' : '')
      + (cur && cur.label ? '«' + _esc(cur.label) + '»' : 'diesen Datensatz')
      + ' gerade ebenfalls — gleichzeitige Änderungen können sich gegenseitig überschreiben.';
    if (!banner){
      banner = d.createElement('div');
      banner.id = 'gema-editlock-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9997;'
        + 'padding:9px 46px 9px 14px;padding-top:calc(9px + env(safe-area-inset-top,0px));'
        + 'background:#fef3c7;color:#92400e;border-bottom:1.5px solid #f59e0b;'
        + 'font:600 13px/1.45 "DM Sans",system-ui,sans-serif;text-align:center;'
        + 'box-shadow:0 2px 10px rgba(146,64,14,.15)';
      var x = d.createElement('button');
      x.textContent = '✕';
      x.setAttribute('aria-label', 'Hinweis ausblenden');
      x.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);'
        + 'margin-top:calc(env(safe-area-inset-top,0px)/2);'
        + 'border:none;background:transparent;color:#92400e;font-size:15px;'
        + 'font-weight:700;cursor:pointer;padding:4px 8px';
      x.onclick = function(){ dismissedSig = banner.getAttribute('data-sig') || ''; _hideBanner(); };
      var span = d.createElement('span');
      span.id = 'gema-editlock-msg';
      banner.appendChild(span);
      banner.appendChild(x);
      (d.body || d.documentElement).appendChild(banner);
    }
    banner.setAttribute('data-sig', sig);
    banner.querySelector('#gema-editlock-msg').innerHTML = '⚠ ' + txt;
    banner.style.display = '';
  }
  function _hideBanner(){
    if (banner) banner.style.display = 'none';
  }

  // ── Heartbeat + Check ─────────────────────────────────────────
  function _beat(){
    var s = _sync(), u = _me();
    if (!cur || !s || !u || !u.id) return;
    if (d.hidden) return;   // Tab im Hintergrund: nicht "am Bearbeiten"
    var myKey = _lockKey(cur.key, u.id);
    try{
      s.saveRecord(MK, myKey, {
        key: cur.key,
        userId: u.id,
        userName: u.name || u.username || 'Unbekannt',
        label: cur.label || '',
        ts: new Date().toISOString()
      }, { noQueue: true }).catch(function(){});
    }catch(e){}
    try{
      s.loadCollection(MK, PREFIX + _san(cur.key) + '__').then(function(recs){
        if (!cur) return;   // inzwischen gestoppt
        var now = Date.now(), others = [], stale = [];
        (recs || []).forEach(function(r){
          var it = r && r.data;
          if (!it || !it.userId || it.userId === u.id) return;
          var age = now - (Date.parse(it.ts) || 0);
          if (age < TTL_MS()) others.push(it);
          else if (age > STALE_CLEAN_MS && r.key) stale.push(r.key);
        });
        if (others.length) _showBanner(others);
        else { _hideBanner(); dismissedSig = ''; }
        // Housekeeping: uralte Leichen fremder Sessions gleich mit abraeumen
        if (stale.length){
          try{ s.deleteRecords(MK, stale.slice(0, 20), { noQueue: true }).catch(function(){}); }catch(e){}
        }
      }).catch(function(){ /* offline/Fehler: Banner-Zustand unveraendert */ });
    }catch(e){}
  }

  function _releaseOwn(){
    var s = _sync(), u = _me();
    if (!cur || !s || !u || !u.id) return;
    try{ s.deleteRecord(MK, _lockKey(cur.key, u.id), { noQueue: true, keepalive: true }).catch(function(){}); }catch(e){}
  }

  // ── Public API ────────────────────────────────────────────────
  function watch(opts){
    // Gleicher Key erneut (z.B. Editor-Rebuild) → weiterlaufen lassen,
    // kein Delete/Save-Zyklus pro Re-Render.
    if (cur && opts && String(opts.key) === cur.key){
      cur.label = opts.label || cur.label;
      return;
    }
    stop();
    if (!opts || !opts.key) return;
    if (!_me()) return;   // ohne Login keine Locks (z.B. sys_login)
    cur = { key: String(opts.key), label: opts.label || '' };
    dismissedSig = '';
    _beat();
    cur.timer = setInterval(_beat, HB_MS());
  }
  function stop(){
    if (!cur) return;
    if (cur.timer) clearInterval(cur.timer);
    _releaseOwn();
    cur = null;
    _hideBanner();
    dismissedSig = '';
  }

  d.addEventListener('visibilitychange', function(){
    if (d.visibilityState === 'visible' && cur) _beat();
  });
  w.addEventListener('pagehide', function(){
    // best-effort: eigenen Lock sofort loesen (keepalive ueberlebt die
    // Navigation); scheitert das, laeuft er via TTL von selbst ab.
    if (cur){ if (cur.timer) clearInterval(cur.timer); _releaseOwn(); cur = null; }
  });

  w.GemaEditLock = {
    watch: watch,
    stop: stop,
    active: function(){ return cur ? cur.key : null; },
    _beat: _beat   // Test-Hook (Suite triggert Zyklen ohne Timer-Wartezeit)
  };
})(window);
