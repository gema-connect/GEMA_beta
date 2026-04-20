/* gema_notify.js — Generisches Notifikations-System fuer GEMA
   ------------------------------------------------------------
   - localStorage-Storage (Cross-Tab via storage-Event)
   - 4 Typen: info / aktion / erfolg / warnung
   - Empfaenger: userId + roleId + orgId (alle optional, mind. 1)
   - Auto-Glocke in .g-nav-actions/.g-nav-right auf allen Modul-Seiten
   - Polling 30s + storage-Event fuer Live-Updates
   - User-Preferences: pro Event-Key einzeln abonnieren
   - Retention: gelesene Notifikationen nach 30 Tagen auto-cleanup
*/
(function(w,d){
  'use strict';

  var STORAGE_KEY       = 'gema_notifications_v1';
  var STORAGE_PREFS_KEY = 'gema_notify_prefs_v1';
  var POLL_MS           = 30000;
  var RETENTION_DAYS    = 30;

  // ── bekannte Event-Keys (Modul-uebergreifend) ────────────────
  // Jeder Aufrufer kann eigene Keys nutzen; diese hier werden im
  // Settings-Panel als vorbereitete Toggles angezeigt.
  var EVENT_KEYS = {
    ausschreibung_einladung: {
      label:'Einladung zu einer Ausschreibung',
      modul:'ausschreibung',
      defaultOn:true
    },
    ausschreibung_offerte_neu: {
      label:'Neue Offerte eingereicht',
      modul:'ausschreibung',
      defaultOn:true
    },
    ausschreibung_vergabe: {
      label:'Auftragsvergabe / Absage',
      modul:'ausschreibung',
      defaultOn:true
    },
    ausschreibung_crbx_bestaetigt: {
      label:'CRBX-Abgleich bestätigt',
      modul:'ausschreibung',
      defaultOn:false
    },
    werkzeug_defekt: {
      label:'Defektmeldung eines Werkzeugs',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_zuweisung: {
      label:'Werkzeug wurde dir zugewiesen',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_pruefung_faellig: {
      label:'Werkzeug-Prüfung wird fällig',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_pruefung_anfrage: {
      label:'Prüfungs-Anfrage an Lieferant',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_defekt_lieferant: {
      label:'Defektmeldung an Lieferant',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_ersatz_anfrage: {
      label:'Ersatz-/Nachfolger-Anfrage',
      modul:'werkzeug',
      defaultOn:true
    }
  };

  // ── Storage-Helper ────────────────────────────────────────────
  function _readAll(){
    try{ var r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):[]; }
    catch(e){ return []; }
  }
  function _writeAll(arr){
    try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(arr)); }catch(e){}
  }
  function _readPrefs(){
    try{ var r=localStorage.getItem(STORAGE_PREFS_KEY); return r?JSON.parse(r):{}; }
    catch(e){ return {}; }
  }
  function _writePrefs(o){
    try{ localStorage.setItem(STORAGE_PREFS_KEY,JSON.stringify(o)); }catch(e){}
  }
  function _uid(){ return 'n_'+Date.now().toString(36)+'_'+Math.random().toString(36).substr(2,6); }
  function _now(){ return new Date().toISOString(); }

  // ── Current-User-Helper ───────────────────────────────────────
  function _me(){
    if(typeof w.GemaAuth==='undefined')return null;
    try{ return w.GemaAuth.getCurrentUser(); }catch(e){ return null; }
  }

  // Prueft, ob eine Notifikation fuer den aktuellen User bestimmt ist.
  // Matching: userId ODER eine der roleIds ODER orgId
  function _matchesUser(n,u){
    if(!u)return false;
    if(n.empfaengerUserId && n.empfaengerUserId===u.id) return true;
    if(n.empfaengerRoleId && u.roleIds && u.roleIds.indexOf(n.empfaengerRoleId)>=0) return true;
    if(n.empfaengerOrgId  && n.empfaengerOrgId===u.orgId) return true;
    return false;
  }

  // ── Retention: alte gelesene Notifikationen aufraeumen ────────
  function _cleanup(arr){
    var cutoff=Date.now()-RETENTION_DAYS*24*3600*1000;
    return arr.filter(function(n){
      if(!n.gelesen)return true;                 // ungelesen bleibt
      var t=n.gelesenAt?Date.parse(n.gelesenAt):Date.parse(n.ts);
      return isNaN(t) || t>cutoff;
    });
  }

  // ── Public API ────────────────────────────────────────────────
  var GemaNotify = {
    EVENT_KEYS: EVENT_KEYS,

    /**
     * Neue Notifikation erstellen.
     * @param {Object} opts
     *   - eventKey:          'ausschreibung_einladung' etc. (optional, fuer Prefs-Check)
     *   - empfaengerUserId:  Ziel-User-ID
     *   - empfaengerRoleId:  Ziel-Rolle (z.B. 'role_unternehmer')
     *   - empfaengerOrgId:   Ziel-Organisation
     *   - modul:             Modul-Kennung (z.B. 'ausschreibung')
     *   - typ:               'info'|'aktion'|'erfolg'|'warnung'
     *   - titel:             Kurz-Titel
     *   - text:              Beschreibung
     *   - link:              Klick-Ziel (URL, optional)
     *   - objektId:          Optional, Projekt-Bezug
     */
    push: function(opts){
      if(!opts)return null;
      // Preferences-Check (nur wenn eventKey gesetzt ist und der
      // Ziel-User Preferences hat — sonst standard-on)
      var arr=_readAll();
      var n={
        id: _uid(),
        ts: _now(),
        eventKey: opts.eventKey || '',
        empfaengerUserId: opts.empfaengerUserId || '',
        empfaengerRoleId: opts.empfaengerRoleId || '',
        empfaengerOrgId:  opts.empfaengerOrgId  || '',
        absenderUserId:   opts.absenderUserId   || (function(){var u=_me();return u?u.id:'';})(),
        modul: opts.modul || '',
        typ:   opts.typ   || 'info',
        titel: opts.titel || '',
        text:  opts.text  || '',
        link:  opts.link  || '',
        objektId: opts.objektId || '',
        gelesen: false,
        gelesenAt: null
      };
      // Preferences-Filter: wenn User das Event deaktiviert hat,
      // erstellen wir die Notifikation erst gar nicht (spart Storage).
      if(n.eventKey && n.empfaengerUserId){
        var prefs=_readPrefs()[n.empfaengerUserId]||{};
        var def=(EVENT_KEYS[n.eventKey]||{}).defaultOn!==false;
        if(prefs[n.eventKey]===false || (prefs[n.eventKey]===undefined && !def && def!==undefined)){
          return null;
        }
      }
      arr.push(n);
      _writeAll(_cleanup(arr));
      _notifyListeners();
      return n;
    },

    /** Alle Notifikationen fuer den aktuellen User. */
    getForCurrentUser: function(){
      var u=_me(); if(!u)return [];
      return _readAll().filter(function(n){return _matchesUser(n,u);})
        .sort(function(a,b){return b.ts.localeCompare(a.ts);});
    },

    /** Anzahl ungelesener Notifikationen fuer aktuellen User. */
    getUnreadCount: function(){
      return this.getForCurrentUser().filter(function(n){return !n.gelesen;}).length;
    },

    markRead: function(id){
      var arr=_readAll();
      var hit=arr.find(function(n){return n.id===id;});
      if(hit && !hit.gelesen){
        hit.gelesen=true; hit.gelesenAt=_now();
        _writeAll(arr); _notifyListeners();
      }
    },

    markAllRead: function(){
      var u=_me(); if(!u)return;
      var arr=_readAll(),ch=false;
      arr.forEach(function(n){
        if(!n.gelesen && _matchesUser(n,u)){
          n.gelesen=true; n.gelesenAt=_now(); ch=true;
        }
      });
      if(ch){ _writeAll(arr); _notifyListeners(); }
    },

    remove: function(id){
      var arr=_readAll().filter(function(n){return n.id!==id;});
      _writeAll(arr); _notifyListeners();
    },

    clearForCurrentUser: function(){
      var u=_me(); if(!u)return;
      var arr=_readAll().filter(function(n){return !_matchesUser(n,u);});
      _writeAll(arr); _notifyListeners();
    },

    // ── User-Preferences ───────────────────────────────────────
    getPrefs: function(){
      var u=_me(); if(!u)return {};
      return _readPrefs()[u.id]||{};
    },
    setPref: function(eventKey, enabled){
      var u=_me(); if(!u)return;
      var all=_readPrefs();
      if(!all[u.id])all[u.id]={};
      all[u.id][eventKey]=!!enabled;
      _writePrefs(all);
    },
    isEventEnabled: function(eventKey){
      var p=this.getPrefs();
      if(p[eventKey]===false)return false;
      if(p[eventKey]===true)return true;
      return (EVENT_KEYS[eventKey]||{}).defaultOn!==false;
    },

    // Listener-Registrierung (fuer UI-Updates)
    _listeners: [],
    onChange: function(fn){ this._listeners.push(fn); },

    // Debug/Testing
    _getAll: _readAll,
    _writeAll: _writeAll
  };

  function _notifyListeners(){
    GemaNotify._listeners.forEach(function(fn){ try{fn();}catch(e){} });
  }

  // Cross-Tab-Sync via storage-Event
  w.addEventListener('storage', function(e){
    if(e.key===STORAGE_KEY) _notifyListeners();
  });

  // ── Demo-Daten (einmalig beim ersten Laden) ─────────────────
  // 3-5 Beispiel-Notifikationen pro Demo-Rolle, damit die UI beim
  // ersten Klick auf die Glocke sofort lebt. Migration laeuft genau
  // einmal (Flag in localStorage).
  var DEMO_FLAG='gema_notify_demo_v1';
  function _seedDemo(){
    try{
      if(localStorage.getItem(DEMO_FLAG)==='done') return;
      var existing=_readAll();
      if(existing.length>0){ localStorage.setItem(DEMO_FLAG,'done'); return; }
      var now=Date.now();
      function t(minutesAgo){ return new Date(now-minutesAgo*60000).toISOString(); }
      var demo=[
        // Planer (role_planer) — eingehende Offerten & Infos
        {id:_uid(),ts:t(12),eventKey:'ausschreibung_offerte_neu',empfaengerRoleId:'role_planer',modul:'ausschreibung',typ:'info',titel:'Neue Offerte: Meier Sanitär AG',text:'Eingegangen für Ausschreibung «Neubau Musterstrasse» · CHF 142\'500.00',link:'pm_ausschreibungsunterlagen.html',gelesen:false,gelesenAt:null},
        {id:_uid(),ts:t(90),eventKey:'ausschreibung_offerte_neu',empfaengerRoleId:'role_planer',modul:'ausschreibung',typ:'info',titel:'Neue Offerte: Steiner Sanitär GmbH',text:'Eingegangen für Ausschreibung «Neubau Musterstrasse» · CHF 138\'900.00',link:'pm_ausschreibungsunterlagen.html',gelesen:false,gelesenAt:null},
        {id:_uid(),ts:t(240),eventKey:'ausschreibung_crbx_bestaetigt',empfaengerRoleId:'role_planer',modul:'ausschreibung',typ:'erfolg',titel:'CRBX-Abgleich bestätigt',text:'Ausschreibung «Umbau Schulhaus» wurde freigegeben — Unternehmer können Offerten einreichen.',link:'pm_ausschreibungsunterlagen.html',gelesen:true,gelesenAt:t(200)},
        {id:_uid(),ts:t(1440),eventKey:'',empfaengerRoleId:'role_planer',modul:'objekte',typ:'info',titel:'Willkommen in GEMA',text:'Deine Benachrichtigungen erscheinen hier. Klick auf ⚙ oben rechts, um zu wählen, welche Events dich erreichen.',link:'',gelesen:true,gelesenAt:t(1400)},

        // Unternehmer (role_unternehmer) — Einladungen und Vergaben
        {id:_uid(),ts:t(30),eventKey:'ausschreibung_einladung',empfaengerRoleId:'role_unternehmer',modul:'ausschreibung',typ:'aktion',titel:'Neue Ausschreibung: Neubau Musterstrasse',text:'Sie wurden zu einer Offertanfrage eingeladen (Frist: 15.05.2026)',link:'pm_ausschreibungsunterlagen.html',gelesen:false,gelesenAt:null},
        {id:_uid(),ts:t(180),eventKey:'ausschreibung_einladung',empfaengerRoleId:'role_unternehmer',modul:'ausschreibung',typ:'aktion',titel:'Neue Ausschreibung: Umbau Schulhaus',text:'Sie wurden zu einer Offertanfrage eingeladen (Frist: 22.05.2026)',link:'pm_ausschreibungsunterlagen.html',gelesen:false,gelesenAt:null},
        {id:_uid(),ts:t(4320),eventKey:'ausschreibung_vergabe',empfaengerRoleId:'role_unternehmer',modul:'ausschreibung',typ:'erfolg',titel:'🏆 Zuschlag erhalten: Sanierung Wohnhaus',text:'Sie haben den Zuschlag erhalten. Herzlichen Glückwunsch!',link:'pm_ausschreibungsunterlagen.html',gelesen:true,gelesenAt:t(4200)},
        {id:_uid(),ts:t(1440),eventKey:'',empfaengerRoleId:'role_unternehmer',modul:'objekte',typ:'info',titel:'Willkommen in GEMA',text:'Deine Benachrichtigungen erscheinen hier. Klick auf ⚙ oben rechts, um zu wählen, welche Events dich erreichen.',link:'',gelesen:true,gelesenAt:t(1400)},

        // Bauherrschaft / Architekt (role_architekt)
        {id:_uid(),ts:t(60),eventKey:'',empfaengerRoleId:'role_architekt',modul:'ausschreibung',typ:'info',titel:'Ausschreibung freigegeben',text:'Die Ausschreibung «Neubau Musterstrasse» ist nun aktiv.',link:'pm_ausschreibungsunterlagen.html',gelesen:false,gelesenAt:null},
        {id:_uid(),ts:t(720),eventKey:'',empfaengerRoleId:'role_architekt',modul:'objekte',typ:'info',titel:'Willkommen in GEMA',text:'Deine Benachrichtigungen erscheinen hier.',link:'',gelesen:true,gelesenAt:t(700)}
      ];
      _writeAll(demo);
      localStorage.setItem(DEMO_FLAG,'done');
    }catch(e){ /* ignore */ }
  }
  _seedDemo();

  w.GemaNotify = GemaNotify;
})(window, document);
