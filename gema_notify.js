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
    ausschreibung_interesse: {
      label:'Antwort auf Interesse-Anfrage (Unternehmer)',
      modul:'ausschreibung',
      defaultOn:true
    },
    ausschreibung_vergabeantrag: {
      label:'Vergabeantrag eingereicht / entschieden',
      modul:'ausschreibung',
      defaultOn:true
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
    },
    werkzeug_offerte_lieferant: {
      label:'Offerte vom Lieferanten (Werkzeug)',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_reparatur: {
      label:'Reparatur-Status durch Lieferant',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_koffer_fehlteil: {
      label:'Koffer unvollständig zurückgegeben',
      modul:'werkzeug',
      defaultOn:true
    },
    werkzeug_einbuchung: {
      label:'Werkzeug-Einbuchung durch Lieferant',
      modul:'werkzeug',
      defaultOn:true
    },
    fahrzeug_service_faellig: {
      label:'Fahrzeug-Service oder MFK fällig',
      modul:'fahrzeug',
      defaultOn:true
    },
    fahrzeug_service_erledigt: {
      label:'Service-Eintrag wurde erfasst',
      modul:'fahrzeug',
      defaultOn:true
    },
    fahrzeug_garagist_zugewiesen: {
      label:'Werkstatt wurde dir zugewiesen',
      modul:'fahrzeug',
      defaultOn:true
    },
    fahrzeug_garage: {
      label:'Fahrzeug in Garage ein-/ausgebucht',
      modul:'fahrzeug',
      defaultOn:true
    },
    lu_updated: {
      label:'LU-Zusammenstellung aktualisiert',
      modul:'lu',
      defaultOn:false
    },
    schaden_neu: {
      label:'Neuer Schadensbericht erfasst',
      modul:'schadensbericht',
      defaultOn:true
    },
    schaden_phase_geaendert: {
      label:'Schaden-Phase gewechselt',
      modul:'schadensbericht',
      defaultOn:true
    },
    trockner_zurueckgegeben: {
      label:'Trocknungsgerät zurückgegeben',
      modul:'trocknung',
      defaultOn:true
    },
    trockner_defekt: {
      label:'Trocknungsgerät: Defektmeldung',
      modul:'trocknung',
      defaultOn:true
    },
    regie_eingereicht: {
      label:'Regierapport eingereicht (zur Freigabe)',
      modul:'regierapport',
      defaultOn:true
    },
    regie_freigegeben: {
      label:'Regierapport freigegeben',
      modul:'regierapport',
      defaultOn:true
    },
    regie_abgelehnt: {
      label:'Regierapport zurückgewiesen',
      modul:'regierapport',
      defaultOn:true
    },
    einsatz_geplant: {
      label:'Einsatz eingeplant / verschoben',
      modul:'einsatzplan',
      defaultOn:true
    },
    goodel_neu: {
      label:'Neue Terminabstimmung (Goodel)',
      modul:'goodel',
      defaultOn:true
    },
    goodel_abgestimmt: {
      label:'Antwort auf meine Terminabstimmung',
      modul:'goodel',
      defaultOn:true
    },
    abnahme_freigabe_anfrage: {
      label:'Abnahme zur Freigabe erhalten',
      modul:'abnahme',
      defaultOn:true
    },
    abnahme_freigabe_entscheid: {
      label:'Abnahme-Freigabe entschieden',
      modul:'abnahme',
      defaultOn:true
    },
    abnahme_maengel_zugewiesen: {
      label:'Mängelliste zugewiesen / Punkt zurückgewiesen',
      modul:'abnahme',
      defaultOn:true
    },
    abnahme_maengel_abgearbeitet: {
      label:'Mängelliste abgearbeitet / freigegeben',
      modul:'abnahme',
      defaultOn:true
    },
    hy_schlauchwechsel: {
      label:'Schlauchwechsel vor Probenahme (Dusche/Badewanne)',
      modul:'legionellen',
      defaultOn:true
    },
    hy_labor_probe: {
      label:'Probe dem Labor zugewiesen',
      modul:'legionellen',
      defaultOn:true
    },
    hy_befund_positiv: {
      label:'Positiver Legionellen-Befund',
      modul:'legionellen',
      defaultOn:true
    },
    hy_plan_erstellt: {
      label:'Sanierungsplan erstellt (Ausführung fällig)',
      modul:'legionellen',
      defaultOn:true
    },
    hy_sanierung_delegiert: {
      label:'Sanierung delegiert / übernommen',
      modul:'legionellen',
      defaultOn:true
    },
    hy_arbeit_abgeschlossen: {
      label:'Sanierung ausgeführt (Freigabe ausstehend)',
      modul:'legionellen',
      defaultOn:true
    },
    spuel_faellig: {
      label:'Spülstellen fällig (Spülmanager)',
      modul:'spuelmanager',
      defaultOn:true
    },
    spuel_aktiviert: {
      label:'Spülregime aktiviert',
      modul:'spuelmanager',
      defaultOn:true
    },
    immo_auftrag_neu: {
      label:'Neuer Handwerker-Auftrag (Immobilien)',
      modul:'immobilien',
      defaultOn:true
    },
    immo_auftrag_status: {
      label:'Handwerker-Auftrag: Statusänderung',
      modul:'immobilien',
      defaultOn:true
    },
    service_faellig: {
      label:'Wartungen fällig (Service & Wartung)',
      modul:'service',
      defaultOn:true
    },
    service_erledigt: {
      label:'Wartung erledigt',
      modul:'service',
      defaultOn:true
    },
    stunden_eingereicht: {
      label:'Stundenrapport eingereicht (Freigabe)',
      modul:'stundenerfassung',
      defaultOn:true
    },
    stunden_entscheid: {
      label:'Stundenrapport genehmigt/zurückgewiesen',
      modul:'stundenerfassung',
      defaultOn:true
    },
    stunden_topfb: {
      label:'Topf B überschritten (Überstunden-Auszahlung fällig)',
      modul:'stundenerfassung',
      defaultOn:true
    },
    stunden_auszahlung: {
      label:'Überstunden-Auszahlung erfasst (Topf B)',
      modul:'stundenerfassung',
      defaultOn:true
    },
    ferien_antrag: {
      label:'Ferienantrag eingereicht (Freigabe)',
      modul:'stundenerfassung',
      defaultOn:true
    },
    ferien_entscheid: {
      label:'Ferienantrag genehmigt/abgelehnt',
      modul:'stundenerfassung',
      defaultOn:true
    },
    offertanfrage_neu: {
      label:'Neue Offertanfrage (Lieferant)',
      modul:'produktkatalog',
      defaultOn:true
    },
    offertanfrage_beantwortet: {
      label:'Offerte vom Lieferanten erhalten',
      modul:'produktkatalog',
      defaultOn:true
    },
    offertanfrage_abgelehnt: {
      label:'Offertanfrage abgelehnt',
      modul:'produktkatalog',
      defaultOn:true
    },
    // ── Bestellungen (Anlagen — Gewinner-Unternehmer → Lieferant) ──
    bestellung_neu: {
      label:'Neue Bestellung eingegangen (Lieferant)',
      modul:'bestellungen',
      defaultOn:true
    },
    bestellung_bestaetigt: {
      label:'Bestellung bestätigt (Liefertermin/AB)',
      modul:'bestellungen',
      defaultOn:true
    },
    bestellung_abgelehnt: {
      label:'Bestellung abgelehnt',
      modul:'bestellungen',
      defaultOn:true
    },
    bestellung_geliefert: {
      label:'Bestellung geliefert',
      modul:'bestellungen',
      defaultOn:true
    },
    bestellung_empfangen: {
      label:'Wareneingang bestätigt (Lieferant)',
      modul:'bestellungen',
      defaultOn:true
    },
    bestellung_storniert: {
      label:'Bestellung storniert (Lieferant)',
      modul:'bestellungen',
      defaultOn:true
    },
    revision_unterlagen_anfrage: {
      label:'Anfrage: Unterlagen für Revisionsdossier',
      modul:'revisionsunterlagen',
      defaultOn:true
    },
    revision_unterlagen_erhalten: {
      label:'Revisions-Unterlagen vom Lieferant erhalten',
      modul:'revisionsunterlagen',
      defaultOn:true
    },
    revision_projektabschluss: {
      label:'Projekt abgeschlossen — Revisionsunterlagen erstellen',
      modul:'revisionsunterlagen',
      defaultOn:true
    },
    revision_freigabe_erstellt: {
      label:'Revisionsunterlagen freigegeben (Link/QR)',
      modul:'revisionsunterlagen',
      defaultOn:false
    },
    behoerde_formular_geaendert: {
      label:'Behördenformular unter Quell-URL geändert',
      modul:'behoerden_formulare',
      defaultOn:true
    },
    abo_bestellung: {
      label:'Neue Abo-Bestellung / Token-Zukauf (GEMA-Admin)',
      modul:'abos',
      defaultOn:true
    },
    abo_status: {
      label:'Abo-Status geändert (aktiviert / gesperrt / beendet)',
      modul:'abos',
      defaultOn:true
    },
    abo_tokens_knapp: {
      label:'Token-Budget fast aufgebraucht',
      modul:'abos',
      defaultOn:true
    },
    chat_nachricht: {
      label:'Neue Chat-Nachricht',
      modul:'chat',
      defaultOn:true
    },
    schule_pruefung_geplant: {
      label:'Prüfung aufgeschaltet',
      modul:'schule',
      defaultOn:true
    },
    schule_pruefung_erinnerung: {
      label:'Erinnerung vor Prüfungsbeginn',
      modul:'schule',
      defaultOn:true
    },
    schule_abgabe_eingegangen: {
      label:'Prüfungs-Abgabe eingegangen (Dozent)',
      modul:'schule',
      defaultOn:true
    },
    schule_resultate_publiziert: {
      label:'Prüfungs-Resultate veröffentlicht',
      modul:'schule',
      defaultOn:true
    },
    schule_lernmittel_neu: {
      label:'Neues Lernmittel in der Klasse',
      modul:'schule',
      defaultOn:true
    },
    schule_klasse_beitritt: {
      label:'Neues Klassenmitglied (Dozent)',
      modul:'schule',
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

  // ── Cloud-Sync (per-Record via gema_sync.js, best-effort) ────────
  // Notifikationen lagen bisher NUR im localStorage — sie erreichten damit
  // nie ein anderes Geraet (z.B. Planer → Lieferant). Jetzt wird jede
  // Notifikation zusaetzlich als eigene Cloud-Row gespiegelt
  // (moduleKey 'notify', prefix 'notif:') und periodisch gemerged.
  // Faellt gema_sync.js/Cloud aus, funktioniert alles lokal weiter.
  var SYNC_MODULE = 'notify';
  var SYNC_PREFIX = 'notif:';
  var CLOUD_PULL_MS = 60000;

  function _syncApi(){
    return (typeof w.GemaSync !== 'undefined' && w.GemaSync.saveRecord) ? w.GemaSync : null;
  }
  function _cloudSave(n){
    var s=_syncApi(); if(!s || !n || !n.id) return;
    try{ s.saveRecord(SYNC_MODULE, SYNC_PREFIX+n.id, n).catch(function(){}); }catch(e){}
  }
  function _cloudSaveMany(list){
    var s=_syncApi(); if(!s || !list || !list.length) return;
    try{
      s.saveRecords(SYNC_MODULE, list.map(function(n){ return {key:SYNC_PREFIX+n.id, data:n}; })).catch(function(){});
    }catch(e){}
  }
  function _cloudDelete(id){
    var s=_syncApi(); if(!s || !id) return;
    try{ s.deleteRecord(SYNC_MODULE, SYNC_PREFIX+id).catch(function(){}); }catch(e){}
  }
  function _cloudPull(){
    var s=_syncApi(); if(!s || !s.loadCollection) return;
    try{
      s.loadCollection(SYNC_MODULE, SYNC_PREFIX).then(function(recs){
        if(!recs || !recs.length) return;
        var arr=_readAll(), byId={}, changed=false;
        arr.forEach(function(n){ byId[n.id]=n; });
        recs.forEach(function(r){
          var n = r && r.data;
          if(!n || !n.id) return;
          var loc = byId[n.id];
          if(!loc){ arr.push(n); byId[n.id]=n; changed=true; }
          else if(!loc.gelesen && n.gelesen){
            // Auf einem anderen Geraet gelesen — Status uebernehmen.
            loc.gelesen=true; loc.gelesenAt=n.gelesenAt||loc.gelesenAt; changed=true;
          }
        });
        if(changed){ _writeAll(_cleanup(arr)); _notifyListeners(); }
      }).catch(function(){});
    }catch(e){}
  }
  // Initial-Pull (verzoegert, damit gema_sync.js sein Bootstrap machen kann)
  // + periodischer Merge + Pull beim Tab-Fokus.
  setTimeout(_cloudPull, 2500);
  setInterval(_cloudPull, CLOUD_PULL_MS);
  d.addEventListener('visibilitychange', function(){
    if(d.visibilityState==='visible') _cloudPull();
  });

  // ── Current-User-Helper ───────────────────────────────────────
  function _me(){
    if(typeof w.GemaAuth==='undefined')return null;
    try{ return w.GemaAuth.getCurrentUser(); }catch(e){ return null; }
  }

  // Prueft, ob eine Notifikation fuer den aktuellen User bestimmt ist.
  // Matching: userId ODER Rolle ODER Org. WICHTIG: Sind Rolle UND Org
  // gesetzt (z.B. 'alle Magaziner der Org X'), muessen BEIDE passen —
  // sonst saehe jeder Magaziner jeder Org die Notifikation (seit dem
  // Cloud-Sync waeren Rollen-Pushes org-uebergreifend geleakt).
  function _matchesUser(n,u){
    if(!u)return false;
    if(n.empfaengerUserId && n.empfaengerUserId===u.id) return true;
    var roleOk = !!(n.empfaengerRoleId && u.roleIds && u.roleIds.indexOf(n.empfaengerRoleId)>=0);
    var orgOk  = !!(n.empfaengerOrgId && n.empfaengerOrgId===u.orgId);
    if(n.empfaengerRoleId && n.empfaengerOrgId) return roleOk && orgOk;
    if(n.empfaengerRoleId) return roleOk;
    if(n.empfaengerOrgId)  return orgOk;
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
      _cloudSave(n);
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
        _writeAll(arr); _cloudSave(hit); _notifyListeners();
      }
    },

    markAllRead: function(){
      var u=_me(); if(!u)return;
      var arr=_readAll(),ch=[],changed=false;
      arr.forEach(function(n){
        if(!n.gelesen && _matchesUser(n,u)){
          n.gelesen=true; n.gelesenAt=_now(); ch.push(n); changed=true;
        }
      });
      if(changed){ _writeAll(arr); _cloudSaveMany(ch); _notifyListeners(); }
    },

    remove: function(id){
      var all=_readAll();
      var hit=all.find(function(n){return n.id===id;});
      var arr=all.filter(function(n){return n.id!==id;});
      _writeAll(arr);
      // Cloud-Delete nur bei persoenlich adressierten Notifikationen —
      // Rollen-/Org-Notifikationen haben mehrere Empfaenger und duerfen
      // durch einen einzelnen User nicht global geloescht werden.
      var u=_me();
      if(hit && u && hit.empfaengerUserId===u.id) _cloudDelete(id);
      _notifyListeners();
    },

    clearForCurrentUser: function(){
      var u=_me(); if(!u)return;
      var all=_readAll();
      var mine=all.filter(function(n){return _matchesUser(n,u);});
      var arr=all.filter(function(n){return !_matchesUser(n,u);});
      _writeAll(arr);
      mine.forEach(function(n){ if(n.empfaengerUserId===u.id) _cloudDelete(n.id); });
      _notifyListeners();
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
