/**
 * gema_auth.js — GEMA Auth & Rollenverwaltung v2
 * Multi-Tenant: Unternehmen → Benutzer → Rollen → Berechtigungen
 * Profil-Einstellungen, Logo-Swap, zentrale Auth für alle Module.
 */
(function(w) {
  'use strict';

  var STORAGE_ORGS    = 'gema_orgs_v1';
  var STORAGE_USERS   = 'gema_users_v1';
  var STORAGE_ROLES   = 'gema_roles_v1';
  var STORAGE_SESSION = 'gema_session_v1';
  var STORAGE_ORG_CATS= 'gema_org_cats_v1';
  var SESSION_DAYS    = 30;

  // ── Cloud-Sync (per-Record) ──────────────────────────────────────
  // Single source of truth: Supabase. Pro Org/User/Rolle eine eigene
  // Row in `gema_data` mit data_key='<entity>:<id>'. localStorage bleibt
  // als sekundaerer In-Memory-Cache fuer synchrone Reads — wird nach
  // jedem Cloud-Sync mit dem Cloud-Stand UEBERSCHRIEBEN (gewinnt Cloud).
  // Saves laufen pro geaendertem Record, nie als ganzes Blob.
  // Detail siehe gema_sync.js + CLAUDE.md.
  function _S(){ return typeof window!=='undefined' && window.GemaSync; }

  // Mapping STORAGE_KEY -> Cloud-Prefix + idField
  var _COLL = {};
  _COLL[STORAGE_ORGS]  = { prefix: 'org:',  idField: 'id', legacyKey: STORAGE_ORGS  };
  _COLL[STORAGE_USERS] = { prefix: 'user:', idField: 'id', legacyKey: STORAGE_USERS };
  _COLL[STORAGE_ROLES] = { prefix: 'role:', idField: 'id', legacyKey: STORAGE_ROLES };

  // In-Memory-Spiegel der Collections. Ueberlebt, auch wenn
  // localStorage.setItem am Quota scheitert — auf iPhone-Safari ist das
  // Limit streng, und grosse Base64-Bilder anderer Module (z.B.
  // gema_werkzeug Kaufbelege) koennen den Storage fuellen. Reads
  // bevorzugen diesen Spiegel, damit der frische Cloud-Stand (Orgs mit
  // Kategorie-Settings, User, Rollen) nicht hinter veraltetem localStorage
  // verschwindet. Schluessel: STORAGE_KEY -> JSON-String.
  var _memCache = {};
  function _writeLocalCache(storageKey, arr){
    var json;
    try{ json = JSON.stringify(arr||[]); }catch(e){ json = '[]'; }
    _memCache[storageKey] = json;
    try{ localStorage.setItem(storageKey, json); }catch(e){}
  }
  // Liest die Collection: erst der In-Memory-Spiegel (frischer Cloud-
  // Stand, quota-sicher), sonst localStorage.
  function _readCache(storageKey){
    if(_memCache[storageKey] != null) return _memCache[storageKey];
    try{ return localStorage.getItem(storageKey); }catch(e){ return null; }
  }

  // Lade alle Records einer Collection aus der Cloud, schreibe Cache.
  // Liefert Promise<Array> oder reject bei Netz-Fehler.
  // Mergt DEFAULTS rein: System-Eintraege (DEFAULT_ROLES, DEFAULT_ORGS,
  // DEFAULT_USERS), deren ID NICHT in der Cloud existiert, bleiben lokal
  // erhalten. Cloud-Versionen einer ID gewinnen (Override moeglich).
  function _loadCollectionFromCloud(storageKey){
    var def = _COLL[storageKey];
    if(!def || !_S()) return Promise.resolve(null);
    return _S().loadCollection('auth', def.prefix).then(function(rows){
      var cloudArr = (rows||[]).map(function(r){ return r.data; })
                                .filter(function(d){ return d && d[def.idField]; });
      var merged = _mergeWithDefaults(storageKey, cloudArr);
      _writeLocalCache(storageKey, merged);
      return merged;
    });
  }

  // Mergt Cloud-Daten mit den lokalen DEFAULTS. Cloud-IDs gewinnen;
  // DEFAULT-IDs, die NICHT in der Cloud sind, werden lokal ergaenzt.
  function _mergeWithDefaults(storageKey, cloudArr){
    cloudArr = Array.isArray(cloudArr) ? cloudArr.slice() : [];
    var defaults = storageKey === STORAGE_ROLES ? DEFAULT_ROLES
                : storageKey === STORAGE_ORGS  ? DEFAULT_ORGS
                : storageKey === STORAGE_USERS ? DEFAULT_USERS
                : null;
    if(!defaults || !defaults.length) return cloudArr;
    var have = {};
    cloudArr.forEach(function(it){ if(it && it.id != null) have[it.id] = true; });
    defaults.forEach(function(d){
      if(d && d.id != null && !have[d.id]) cloudArr.push(d);
    });
    // System-Rollen-Labels folgen IMMER den DEFAULTS (idempotent, kein
    // Cloud-Write noetig): Cloud-Records aus der Zeit vor der Umbenennung
    // «Lieferant» → «Anlagenlieferant» tragen sonst dauerhaft alte Namen.
    if(storageKey === STORAGE_ROLES){
      var defById = {};
      defaults.forEach(function(d){ if(d && d.id) defById[d.id] = d; });
      cloudArr = cloudArr.map(function(r){
        if(!(r && r.id && defById[r.id])) return r;
        var d = defById[r.id];
        var out = r;
        if(/^role_(lieferant|produktlieferant|leiterpruefer)/.test(r.id)){
          out = Object.assign({}, out, { name: d.name, color: d.color });
        }
        // Fehlende Modul-Permissions aus den DEFAULTS ergaenzen (idempotent,
        // kein Cloud-Write): Cloud-Rollen aus der Zeit VOR einem neuen Modul
        // kennen dessen Key nicht — ohne Backfill zeigt das neue Modul fuer
        // bestehende Installationen «Kein Zugriff». Vorhandene (auch bewusst
        // deaktivierte) Eintraege werden NIE ueberschrieben.
        if(d.permissions && out.permissions){
          var missing = null;
          Object.keys(d.permissions).forEach(function(k){
            if(!out.permissions[k]){ (missing = missing || {})[k] = d.permissions[k]; }
          });
          if(missing){
            if(out === r) out = Object.assign({}, r);
            out.permissions = Object.assign({}, out.permissions, missing);
          }
        }
        return out;
      });
    }
    return cloudArr;
  }

  // Holt die alte Blob-Row direkt mit Roh-Fetch (alte Payload-Struktur
  // war {v: '<json-string>'} statt {data: ...}).
  function _legacyBlobFetch(storageKey){
    if(!_S()) return Promise.resolve(null);
    var url = _S().SB_URL + '/rest/v1/' + _S().SB_TABLE
      + '?module_key=eq.auth&data_key=eq.' + encodeURIComponent(storageKey)
      + '&select=payload';
    return fetch(url, { headers: { 'apikey': _S().SB_KEY, 'Authorization': 'Bearer '+_S().SB_KEY } })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(rows){
        if(!Array.isArray(rows) || !rows.length) return null;
        var p = rows[0].payload;
        if(!p) return null;
        // Alt: { v: '<json>' } oder { v: <object> }
        if(p.v != null){
          try{ return typeof p.v === 'string' ? JSON.parse(p.v) : p.v; }catch(e){ return null; }
        }
        // Neu: { data: <object>, _lm: ... } — sollte hier nicht vorkommen,
        // weil das die Per-Record-Form ist.
        if(p.data != null) return p.data;
        return null;
      })
      .catch(function(){ return null; });
  }

  // Migration: alte Blob-Row in einzelne Per-Record-Rows aufsplitten.
  // Idempotent: wenn Cloud schon Records hat, geschieht nichts.
  // User-Wahl 'Auto-Migration ohne Backup' → alte Blob-Row wird nach
  // erfolgreichem Aufsplitten geloescht.
  function _migrateBlobToRecordsIfNeeded(storageKey){
    var def = _COLL[storageKey];
    if(!def || !_S()) return Promise.resolve({migrated:false});
    return _S().loadCollection('auth', def.prefix).then(function(existing){
      if(existing && existing.length) return {migrated:false, reason:'records-exist'};
      return _legacyBlobFetch(storageKey).then(function(arr){
        if(!Array.isArray(arr) || !arr.length) return {migrated:false, reason:'no-blob'};
        var records = arr.filter(function(it){ return it && it[def.idField]; })
                         .map(function(it){ return { key: def.prefix + it[def.idField], data: it }; });
        if(!records.length) return {migrated:false, reason:'no-valid-records'};
        return _S().saveRecords('auth', records).then(function(){
          return _S().deleteRecord('auth', storageKey).then(function(){
            _writeLocalCache(storageKey, arr);
            console.info('[GemaAuth] Migration: '+storageKey+' → '+records.length+' Records');
            return {migrated:true, count: records.length};
          });
        });
      });
    });
  }

  // Per-Record-Save: Diff zwischen aktuellem lokalem Cache und neuem Array,
  // schreibt nur geaenderte Records, loescht entfernte.
  // Offline-Verhalten (User-Wahl: 'Read-only weiter, Saves blockiert'):
  // wenn die Cloud unerreichbar ist, wird gar nicht gespeichert — weder
  // lokal noch remote. Aufrufer bekommt einen GemaDialog-Alert.
  function _persistCollection(storageKey, newArr){
    var def = _COLL[storageKey];
    if(!def) return Promise.resolve(false);
    if(!_S()){
      console.warn('[GemaAuth] gema_sync.js fehlt — Save blockiert');
      _showOfflineAlert();
      return Promise.resolve(false);
    }
    if(!_S().isReachable()){
      // Probe einmal aktiv — vielleicht ist die Verbindung wieder da
      return _S().probe().then(function(reachable){
        if(!reachable){ _showOfflineAlert(); return false; }
        return _doPersist(storageKey, newArr);
      });
    }
    return _doPersist(storageKey, newArr);
  }
  function _doPersist(storageKey, newArr){
    var def = _COLL[storageKey];
    var oldArr = JSON.parse(localStorage.getItem(storageKey) || '[]');
    // Optimistisch den In-Memory-Spiegel sofort setzen, damit synchrone
    // Reads direkt nach dem Save (z.B. getCurrentOrg nach updateOrg) den
    // neuen Stand sehen — sonst zeigte die UI bis zur Cloud-Antwort den
    // alten Stand. Die Diff-Baseline (oldArr) liest weiter localStorage,
    // bleibt also unberuehrt; localStorage folgt nach Cloud-Erfolg.
    try{ _memCache[storageKey] = JSON.stringify(newArr || []); }catch(e){}
    return _S().saveDiff('auth', def.prefix, oldArr, newArr, def.idField)
      .then(function(res){
        // Erst nach erfolgreichem Cloud-Save den lokalen Cache aktualisieren.
        _writeLocalCache(storageKey, newArr);
        return res;
      })
      .catch(function(e){
        console.warn('[GemaAuth] Cloud-Save fehlgeschlagen ('+storageKey+'):', e && e.message);
        _showOfflineAlert();
        return false;
      });
  }
  var _offlineAlertShown = false;
  function _showOfflineAlert(){
    if(_offlineAlertShown) return;
    _offlineAlertShown = true;
    setTimeout(function(){ _offlineAlertShown = false; }, 6000);
    if(typeof window !== 'undefined' && window.GemaDialog && window.GemaDialog.alert){
      window.GemaDialog.alert({
        title:'Offline',
        message:'Aenderungen koennen nicht gespeichert werden. Bitte Verbindung pruefen und erneut versuchen.'
      });
    } else if(typeof alert === 'function'){
      try{ alert('Offline — Aenderungen koennen nicht gespeichert werden.'); }catch(e){}
    }
  }

  // ── Modul-Definitionen ─────────────────────────────────────────────
  var MODULES = [
    {key:'druckverlust',            label:'Druckverlust',              cat:'Sanitärberechnungen'},
    {key:'druckdispositiv',         label:'Druckdispositiv',           cat:'Sanitärberechnungen'},
    {key:'lu_tabelle',              label:'LU-Tabelle',                cat:'Sanitärberechnungen'},
    {key:'ausstosszeiten',          label:'Ausstosszeiten',            cat:'Sanitärberechnungen'},
    {key:'du_zusammenstellung',     label:'DU-Zusammenstellung',       cat:'Sanitärberechnungen'},
    {key:'enthaertungsanlage',      label:'Enthärtungsanlage',         cat:'Sanitärberechnungen'},
    {key:'druckerhoehung',          label:'Druckerhöhung',             cat:'Sanitärberechnungen'},
    {key:'zirkulation',             label:'Zirkulationsberechnung',    cat:'Sanitärberechnungen'},
    {key:'druckanstieg',            label:'Druckanstieg Temperatur',   cat:'Sanitärberechnungen'},
    {key:'osmose',                  label:'Osmose',                    cat:'Sanitärberechnungen'},
    {key:'frischwasserstation',     label:'Frischwasserstation',       cat:'Sanitärberechnungen'},
    {key:'laengenausdehnung',       label:'Längenausdehnung',          cat:'Sanitärberechnungen'},
    {key:'thermische_solaranlage',  label:'Thermische Solaranlage',    cat:'Sanitärberechnungen'},
    {key:'warmwasser_sia385',       label:'Warmwasser SIA 385',        cat:'Sanitärberechnungen'},
    {key:'niederschlagsanfall',     label:'Niederschlagsanfall',       cat:'Sanitärberechnungen'},
    {key:'fettabscheider',          label:'Fettabscheider',            cat:'Sanitärberechnungen'},
    {key:'oelabscheider',           label:'Ölabscheider',              cat:'Sanitärberechnungen'},
    {key:'schlammsammler',          label:'Schlammsammler',            cat:'Sanitärberechnungen'},
    {key:'abwasserhebeanlage',      label:'Abwasserhebeanlage',        cat:'Sanitärberechnungen'},
    {key:'grobauslegung',           label:'Grobauslegung',             cat:'Sanitärberechnungen'},
    {key:'fluessiggas',             label:'Flüssiggas LPG',            cat:'Sanitärberechnungen'},
    {key:'druckverlust_erdgas',     label:'Druckverlust Erdgas',       cat:'Sanitärberechnungen'},
    {key:'druckverlust_medizinalgas', label:'Druckverlust Medizinalgase', cat:'Sanitärberechnungen'},
    {key:'vonroll_tabellen',        label:'Von Roll Tabellen',         cat:'Sanitärberechnungen'},
    {key:'ausdehnungsgefaess',      label:'Ausdehnungsgefäss HE301',   cat:'Heizungsberechnungen'},
    {key:'heizungsleitungen',       label:'Heizungsleitungen',         cat:'Heizungsberechnungen'},
    {key:'waermegruppen',           label:'Wärmegruppen SIA 384',      cat:'Heizungsberechnungen'},
    {key:'heizlast_verbrauch',      label:'Heizlast aus Verbrauch',    cat:'Heizungsberechnungen'},
    {key:'hx_diagramm',             label:'h,x-Diagramm',              cat:'Lüftungsberechnungen'},
    {key:'objekte',                 label:'Objekte & Beteiligte',      cat:'Projektmanagement'},
    {key:'terminplan',              label:'Terminplan',                cat:'Projektmanagement'},
    {key:'besprechungsprotokoll',   label:'Besprechungsprotokoll',     cat:'Projektmanagement'},
    {key:'kostenkontrolle',         label:'Kostenkontrolle',           cat:'Projektmanagement'},
    {key:'planungshonorar',         label:'Planungshonorar SIA 108',   cat:'Projektmanagement'},
    {key:'abnahme_sia',             label:'Abnahme SIA 118',           cat:'Projektmanagement'},
    {key:'baustellencheckliste',    label:'Baustellencheckliste',      cat:'Projektmanagement'},
    {key:'ausschreibungsunterlagen',label:'Ausschreibungsunterlagen',  cat:'Projektmanagement'},
    {key:'crbx_offertvergleich',    label:'CRBX Offertvergleich',      cat:'Projektmanagement'},
    {key:'schnellausschreibung',    label:'Schnellausschreibung',      cat:'Projektmanagement'},
    {key:'regierapport',            label:'Regierapporte',             cat:'Projektmanagement'},
    {key:'erp',                     label:'Offerten/Aufträge/Rechnungen', cat:'Projektmanagement'},
    {key:'apparateliste',           label:'Apparateliste',             cat:'Projektmanagement'},
    {key:'inspektion_wartung',      label:'Inspektion & Wartung',      cat:'Projektmanagement'},
    {key:'elektroangaben',          label:'Elektroangaben',            cat:'Projektmanagement'},
    {key:'berufsschule',            label:'Berufsschule',              cat:'Ausbildung'},
    {key:'sephir',                  label:'SEPHIR Handlungskompetenzen', cat:'Ausbildung'},
    {key:'quiz',                    label:'Quiz',                      cat:'Ausbildung'},
    {key:'spuelmanager',            label:'Spülmanager',               cat:'Hygiene'},
    {key:'w12',                     label:'Selbstkontrolle W12',       cat:'Hygiene'},
    {key:'werkzeugmanagement',      label:'Werkzeugmanagement',        cat:'Sonstiges'},
    {key:'fahrzeugmanagement',      label:'Fahrzeugmanagement',        cat:'Sonstiges'},
    {key:'vkf_formulare',           label:'VKF-Formulare',             cat:'Brandschutz'},
    {key:'gasloeschung',            label:'Gaslöschanlagen',           cat:'Brandschutz'},
    {key:'vkf_formular',            label:'VKF-Formular',              cat:'Brandschutz'},
    {key:'schadensbericht',         label:'Schadensberichte',          cat:'Schadensdokumentation'},
    {key:'dachbericht',             label:'Dachinspektion',            cat:'Spenglerei'},
    {key:'trocknungsgeraete',       label:'Trocknungsgeräte',          cat:'Infrastruktur'},
    {key:'lieferantenverwaltung',   label:'Lieferantenverwaltung',     cat:'System'},
    {key:'produktkatalog',          label:'Produktkatalog',            cat:'System'},
    {key:'workspace',               label:'Workspace',                 cat:'System'},
  ];

  // ── Filename → Modul-Key ──────────────────────────────────────────
  var FILE_MAP = {
    'sb_druckverlust':'druckverlust','sb_druckdispositiv':'druckdispositiv',
    'sb_lu_tabelle':'lu_tabelle','sb_ausstosszeiten':'ausstosszeiten',
    'sb_du_zusammenstellung':'du_zusammenstellung','sa_enthaertung':'enthaertungsanlage',
    'sb_druckerhoehung':'druckerhoehung','sb_zirkulation':'zirkulation','sb_druckanstieg':'druckanstieg','sb_fluessiggas':'fluessiggas','sb_druckverlust_erdgas':'druckverlust_erdgas','sb_druckverlust_medizinalgas':'druckverlust_medizinalgas','sa_osmose':'osmose',
    'sa_frischwasserstation':'frischwasserstation','sb_laengenausdehnung':'laengenausdehnung',
    'sa_solaranlage':'thermische_solaranlage','sb_warmwasser':'warmwasser_sia385',
    'sb_niederschlag':'niederschlagsanfall','sa_fettabscheider':'fettabscheider',
    'sa_oelabscheider':'oelabscheider','sa_schlammsammler':'schlammsammler',
    'sa_abwasserhebeanlage':'abwasserhebeanlage','hz_ausdehnungsgefaess':'ausdehnungsgefaess','hz_heizungsleitungen':'heizungsleitungen','hz_waermegruppen':'waermegruppen','hz_heizlast':'heizlast_verbrauch','lt_hx_diagramm':'hx_diagramm','pm_objekte':'objekte',
    'pm_terminplan':'terminplan','pm_besprechung':'besprechungsprotokoll',
    'pm_kostenkontrolle':'kostenkontrolle','pm_honorar':'planungshonorar',
    'pm_abnahme':'abnahme_sia','pm_baustelle':'baustellencheckliste',
    'pm_ausschreibungsunterlagen':'ausschreibungsunterlagen','sb_apparateliste':'apparateliste',
    'hy_inspektion':'inspektion_wartung','el_angaben':'elektroangaben',
    'ab_berufsschule':'berufsschule','hy_spuelmanager':'spuelmanager','hy_w12':'w12',
    'if_werkzeug':'werkzeugmanagement','if_fahrzeug':'fahrzeugmanagement',
    'br_vkf_formulare':'vkf_formulare','br_gasloeschung':'gasloeschung','br_vkf_formular':'vkf_formular',
    'sb_grobauslegung':'grobauslegung','sb_vonroll':'vonroll_tabellen',
    'pm_goodel':'kostenkontrolle','ab_sephir':'sephir','ab_quiz':'quiz',
    'sd_schadensbericht':'schadensbericht',
    'sp_dachbericht':'dachbericht',
    'if_trocknung':'trocknungsgeraete',
    'pm_crbx':'crbx_offertvergleich','pm_schnellausschreibung':'schnellausschreibung','pm_regierapport':'regierapport','pm_erp':'erp',
    'sys_lieferanten':'lieferantenverwaltung','sys_produktkatalog':'produktkatalog',
    'sys_workspace':'workspace',
  };

  // ── Hash ───────────────────────────────────────────────────────────
  function _hash(str) {
    var h=5381;for(var i=0;i<str.length;i++){h=((h<<5)+h)+str.charCodeAt(i);h=h&0xffffffff;}
    return 'gh_'+Math.abs(h).toString(16)+'_'+str.length;
  }

  // ── Default Permissions ────────────────────────────────────────────
  function _allPerms(r,wr,a){var p={};MODULES.forEach(function(m){p[m.key]={read:!!r,write:!!wr,admin:!!a};});return p;}
  function _somePerms(keys,r,wr,a){var p=_allPerms(false,false,false);keys.forEach(function(k){p[k]={read:!!r,write:!!wr,admin:!!a};});return p;}

  var DEFAULT_ROLES = [
    {id:'role_admin',name:'Administrator',color:'#1d4ed8',permissions:_allPerms(true,true,true)},
    {id:'role_planer',name:'Sanitärplaner',color:'#16a34a',gewerke:['sanitaer'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_hlkk_planer',name:'Heizungsplaner',color:'#dc2626',gewerke:['hlkk'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_lueftung_planer',name:'Lüftungsplaner',color:'#2563eb',gewerke:['lueftung'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_elektro_planer',name:'Elektroplaner',color:'#d97706',gewerke:['elektro'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_spengler',name:'Spengler',color:'#0891b2',gewerke:['spenglerei'],permissions:(function(){var p=_somePerms(['dachbericht','objekte','baustellencheckliste','werkzeugmanagement'],true,true,false);p['dachbericht']={read:true,write:true,admin:true};p['objekte']={read:true,write:true,admin:true};p['regierapport']={read:true,write:true,admin:false};return p;})()},
    {id:'role_architekt',name:'Architekt / GP',color:'#7c3aed',permissions:(function(){var p=_somePerms(['terminplan','besprechungsprotokoll','objekte','abnahme_sia'],true,false,false);p['regierapport']={read:true,write:true,admin:false};return p;})()},
    {id:'role_unternehmer',name:'Unternehmer',color:'#d97706',permissions:_somePerms(['terminplan','abnahme_sia','werkzeugmanagement','baustellencheckliste','inspektion_wartung','ausschreibungsunterlagen','crbx_offertvergleich','schnellausschreibung'],true,true,false)},
    // ── Lieferanten-Rollen: ZWEI Typen (User-Entscheid) ──
    // ANLAGENLIEFERANT (role_lieferant*): liefert Anlagen fuer die
    // Berechnungsmodule (Enthaertung, Druckerhoehung, Osmose, …) —
    // mit Verifizierungs-Workflow.
    // PRODUKTLIEFERANT (role_produktlieferant*): liefert Werkzeuge/
    // Maschinen fuers Werkzeugmanagement — KEINE Verifizierung.
    // Beide kombinierbar mit role_leiterpruefer (z.B. Produktlieferant,
    // der auch EKAS-Leiterpruefungen macht).
    {id:'role_lieferant',name:'Anlagenlieferant',color:'#16a34a',permissions:_somePerms(['ausschreibungsunterlagen','produktkatalog'],true,true,false)},
    // Unterrollen (feinere Rechte innerhalb einer Lieferanten-Org).
    // Der Org-Admin (role_lieferant_admin oder Legacy role_lieferant) vergibt
    // sie im Lieferanten-Dashboard. Die Modul-Permission gibt nur Dashboard-
    // Zugang frei; die FEINE Abgrenzung (erfassen/verifizieren/Offerten)
    // passiert im Dashboard via roleId-Helfer.
    {id:'role_lieferant_admin',   name:'Anlagenlieferant · Admin',         color:'#15803d', permissions:_somePerms(['ausschreibungsunterlagen','produktkatalog'],true,true,false)},
    {id:'role_lieferant_produkte',name:'Anlagenlieferant · Produktpflege', color:'#16a34a', permissions:_somePerms(['produktkatalog'],true,true,false)},
    {id:'role_lieferant_verify',  name:'Anlagenlieferant · Verifizierung', color:'#0891b2', permissions:_somePerms(['produktkatalog'],true,true,false)},
    {id:'role_lieferant_offerten',name:'Anlagenlieferant · Offerten',      color:'#7c3aed', permissions:_somePerms(['ausschreibungsunterlagen','produktkatalog'],true,true,false)},
    {id:'role_lieferant_intern',  name:'Anlagenlieferant · Intern (nur Lesen)', color:'#64748b', permissions:_somePerms(['produktkatalog'],true,false,false)},
    // Produktlieferant (Werkzeugmanagement) — keine Verifizierungs-Unterrolle
    {id:'role_produktlieferant_admin',   name:'Produktlieferant · Admin',         color:'#b45309', permissions:_somePerms(['produktkatalog'],true,true,false)},
    {id:'role_produktlieferant_produkte',name:'Produktlieferant · Produktpflege', color:'#d97706', permissions:_somePerms(['produktkatalog'],true,true,false)},
    {id:'role_produktlieferant_offerten',name:'Produktlieferant · Offerten',      color:'#9333ea', permissions:_somePerms(['produktkatalog'],true,true,false)},
    {id:'role_produktlieferant_intern',  name:'Produktlieferant · Intern (nur Lesen)', color:'#64748b', permissions:_somePerms(['produktkatalog'],true,false,false)},
    {id:'role_pruefer',name:'Prüfer',color:'#0891b2',permissions:_somePerms(['werkzeugmanagement','fahrzeugmanagement'],true,true,false)},
    // Leiternpruefer (EKAS): externe Fachperson fuer Leiterpruefungen.
    // Kombinierbar mit Produktlieferant-Rollen (derselbe Account kann
    // Werkzeuge liefern UND Leitern pruefen).
    {id:'role_leiterpruefer',name:'Leiternprüfer (EKAS)',color:'#0e7490',permissions:_somePerms(['werkzeugmanagement'],true,true,false)},
    // Garagist: externe Werkstatt mit eigener Org. Kunden-Firmen verknuepfen
    // einzelne Fahrzeuge mit dem Garagist-Account. Sieht nur diese Fahrzeuge,
    // darf km, Service, MFK, Reifen pflegen und Service-Historie ergaenzen.
    // Kaufbelege, Tankkarten und (per Default) Versicherungsdaten bleiben
    // verborgen — Versicherung kann pro Fahrzeug freigeschaltet werden.
    {id:'role_garagist',name:'Garagist',color:'#0d9488',permissions:_somePerms(['fahrzeugmanagement'],true,true,false)},
    // Magaziner: verwaltet das Werkzeuglager einer Organisation. Darf
    // Attribute aendern, Berichte hinzufuegen, Pruefungen anfordern und
    // Werkzeug Personen zuweisen. Sieht nur Werkzeuge der eigenen Org.
    {id:'role_magaziner',name:'Magaziner',color:'#ea580c',permissions:(function(){var p=_somePerms(['werkzeugmanagement','fahrzeugmanagement','inspektion_wartung'],true,true,true);p['trocknungsgeraete']={read:true,write:true,admin:true};return p;})()},
    // Monteur: Read-only-Zugriff aufs Werkzeuglager. Kann Defekte melden,
    // aber nichts selbst aendern oder zuweisen. Sieht Werkzeuge der
    // eigenen Organisation.
    {id:'role_monteur',name:'Monteur',color:'#64748b',permissions:(function(){var p=_somePerms(['werkzeugmanagement','baustellencheckliste','inspektion_wartung'],true,false,false);p['schadensbericht']={read:true,write:true,admin:false};p['trocknungsgeraete']={read:true,write:false,admin:false};p['regierapport']={read:true,write:true,admin:false};p['objekte']={read:true,write:false,admin:false};return p;})()},
    {id:'role_abteilungsleiter',name:'Abteilungsleiter',color:'#6d28d9',permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:true,admin:false};p['objekte']={read:true,write:true,admin:true};return p;})()},
    {id:'role_bauherrschaft',name:'Bauherrschaft',color:'#0284c7',permissions:(function(){var p=_somePerms(['objekte','terminplan','kostenkontrolle','besprechungsprotokoll','abnahme_sia'],true,false,false);p['regierapport']={read:true,write:true,admin:false};return p;})()},
    {id:'role_behoerde',name:'Behörde',color:'#475569',permissions:_somePerms(['w12','objekte','inspektion_wartung'],true,false,false)},
  ];

  // ── Default Org + User ─────────────────────────────────────────────
  var DEFAULT_ORGS = [{
    id:'org_default', name:'GEMA', logo:null, kategorie:'sanitaerplaner', kategorien:['sanitaerplaner','heizungsplaner','lueftungsplaner'],
    rechtsform:'GmbH',
    adresse:{strasse:'',plz:'',ort:'',kanton:'',land:'CH'},
    kontakt:{email:'',telefon:'',website:''},
    settings:{waehrung:'CHF',land:'CH',sichtbarkeit:'organisation',abteilungenAktiv:false},
    abteilungen:[],
    lizenzen:{typ:'pool',maxUser:50,aktiveUser:1,aboStart:'2025-01-01',aboEnde:'2030-12-31',gewerke:['sanitaer','hlkk','lueftung','elektro']},
    admins:['user_admin'],
    active:true,
    createdAt:'2025-01-01T08:00:00Z'
  }];

  // Unternehmens-Kategorien. Jede Kategorie gehoert einer Gruppe an:
  //   - 'gebaeudetechnik' = Planer / Installateure aller Gewerke. Beliebig
  //     untereinander kombinierbar (ein Installateur kann auch Planer sein).
  //   - 'lieferant'       = Lieferanten / Hersteller. Exklusiv gegenueber
  //     'gebaeudetechnik' (wer liefert, plant/fuehrt nicht aus).
  //   - 'bau'             = Architekt, GU, Bauherr. Kombinierbar mit allen.
  //   - 'andere'          = Behoerde, Immobilien, Sonstiges. Kombinierbar.
  var DEFAULT_ORG_CATS = [
    // ── Planung & Ausführung (Gebäudetechnik) ──
    {id:'sanitaerplaner',       name:'Sanitärplaner',          icon:'💧', gruppe:'gebaeudetechnik'},
    {id:'sanitaerinstallateur', name:'Sanitärinstallateur',    icon:'🔧', gruppe:'gebaeudetechnik'},
    {id:'heizungsplaner',       name:'Heizungsplaner',         icon:'🔥', gruppe:'gebaeudetechnik'},
    {id:'heizungsinstallateur', name:'Heizungsinstallateur',   icon:'♨️', gruppe:'gebaeudetechnik'},
    {id:'lueftungsplaner',      name:'Lüftungsplaner',         icon:'🌀', gruppe:'gebaeudetechnik'},
    {id:'lueftungsinstallateur',name:'Lüftungsinstallateur',   icon:'💨', gruppe:'gebaeudetechnik'},
    {id:'klima_kaeltetechnik',  name:'Klima-/Kältetechnik',    icon:'❄️', gruppe:'gebaeudetechnik'},
    {id:'elektroplaner',        name:'Elektroplaner',          icon:'⚡', gruppe:'gebaeudetechnik'},
    {id:'elektroinstallateur',  name:'Elektroinstallateur',    icon:'🔌', gruppe:'gebaeudetechnik'},
    {id:'msr_gebaeudeautomation',name:'MSR / Gebäudeautomation',icon:'🎛️', gruppe:'gebaeudetechnik'},
    {id:'brandschutz',          name:'Brandschutz / Sprinkler',icon:'🚒', gruppe:'gebaeudetechnik'},
    {id:'aufzugsbau',           name:'Aufzugsbau / Lifttechnik',icon:'🛗', gruppe:'gebaeudetechnik'},
    // ── Bau / Projektbeteiligte ──
    {id:'architekt',            name:'Architekt / Generalplaner',icon:'🏛', gruppe:'bau'},
    {id:'bauherr',              name:'Bauherr / Investor',     icon:'🏗', gruppe:'bau'},
    {id:'generalunternehmer',   name:'Generalunternehmer',     icon:'👷', gruppe:'bau'},
    // ── Lieferanten (exklusiv gegenueber Gebaeudetechnik) ──
    // ZWEI Typen: Anlagenlieferant (Berechnungsmodule, mit Verifizierung)
    // und Produktlieferant (Werkzeuge/Maschinen, ohne Verifizierung).
    {id:'lieferant',            name:'Anlagenlieferant / Hersteller', icon:'🏭', gruppe:'lieferant'},
    {id:'produktlieferant',     name:'Produktlieferant (Werkzeuge)',  icon:'🔧', gruppe:'lieferant'},
    // ── Andere ──
    {id:'garagist',             name:'Garagist / Werkstatt',   icon:'🚗', gruppe:'andere'},
    {id:'immobilien',           name:'Immobilienverwaltung',   icon:'🏢', gruppe:'andere'},
    {id:'behoerde',             name:'Behörde / Fachstelle',   icon:'🏛', gruppe:'andere'},
    {id:'sonstiges',            name:'Sonstiges',              icon:'📦', gruppe:'andere'}
  ];

  // ── Firmen-Kategorie → erlaubte Mitarbeiter-Rollen (User-Entscheid) ──
  // Die Kategorie der Firma bestimmt STRIKT, welche Rollen ihren Usern
  // zugewiesen werden koennen (sys_admin filtert die Rollen-Checkboxen).
  // null = alle Rollen erlaubt (Fallback fuer 'sonstiges' / ohne Kategorie).
  // role_admin wird separat behandelt (nur Super-Admin vergibt sie).
  var KATEGORIE_ROLLEN = {
    sanitaerplaner:       ['role_planer','role_abteilungsleiter','role_magaziner','role_monteur','role_spengler'],
    heizungsplaner:       ['role_hlkk_planer','role_abteilungsleiter','role_magaziner','role_monteur'],
    lueftungsplaner:      ['role_lueftung_planer','role_abteilungsleiter','role_magaziner','role_monteur'],
    elektroplaner:        ['role_elektro_planer','role_abteilungsleiter','role_magaziner','role_monteur'],
    sanitaerinstallateur: ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur','role_spengler'],
    heizungsinstallateur: ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur'],
    lueftungsinstallateur:['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur'],
    elektroinstallateur:  ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur'],
    klima_kaeltetechnik:  ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur'],
    msr_gebaeudeautomation:['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur'],
    brandschutz:          ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur'],
    aufzugsbau:           ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_monteur'],
    architekt:            ['role_architekt'],
    bauherr:              ['role_bauherrschaft'],
    generalunternehmer:   ['role_unternehmer','role_architekt'],
    lieferant:            ['role_lieferant','role_lieferant_admin','role_lieferant_produkte','role_lieferant_verify','role_lieferant_offerten','role_lieferant_intern','role_pruefer'],
    produktlieferant:     ['role_produktlieferant_admin','role_produktlieferant_produkte','role_produktlieferant_offerten','role_produktlieferant_intern','role_leiterpruefer','role_pruefer'],
    garagist:             ['role_garagist'],
    immobilien:           ['role_bauherrschaft'],
    behoerde:             ['role_behoerde'],
    sonstiges:            null
  };

  var DEFAULT_USERS = [
    {id:'user_admin', username:'admin@gema.ch', name:'Administrator',
     password:_hash('gema2025'), roleIds:['role_admin'], orgId:'org_default',
     active:true, createdAt:'2025-01-01T08:00:00Z',
     profile:{email:'admin@gema.ch',telefon:'',sprache:'de',benachrichtigungen:true,standardObjekt:'',einheiten:'metrisch'}}
  ];

  // ── Storage ────────────────────────────────────────────────────────
  function _getOrgs()    {try{var r=_readCache(STORAGE_ORGS);   return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getOrgCats() {try{var r=localStorage.getItem(STORAGE_ORG_CATS);return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getUsers()   {try{var r=_readCache(STORAGE_USERS);  return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getRoles()   {try{var r=_readCache(STORAGE_ROLES);  return r?JSON.parse(r):null;}catch(e){return null;}}
  function _getSession() {
    try{
      var r=localStorage.getItem(STORAGE_SESSION);if(!r)return null;
      var s=JSON.parse(r);
      if(s.expires&&new Date(s.expires)<new Date()){localStorage.removeItem(STORAGE_SESSION);return null;}
      return s;
    }catch(e){return null;}
  }

  function _initDefaults() {
    // DEFAULTS werden NUR lokal befuellt (als Cache, falls keine Cloud-
    // Verbindung). Sie werden NIE nach Cloud gepusht — die Per-Record-
    // Saves arbeiten mit Diff: ein Default-Eintrag, der schon in der Cloud
    // existiert, erzeugt keinen Save (Cache stimmt nach _loadCollectionFromCloud).
    if(!_getOrgs()) _writeLocalCache(STORAGE_ORGS, DEFAULT_ORGS);
    if(!_getOrgCats()) try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(DEFAULT_ORG_CATS));}catch(e){}
    if(!_getUsers()) _writeLocalCache(STORAGE_USERS, DEFAULT_USERS);
    if(!_getRoles()) _writeLocalCache(STORAGE_ROLES, DEFAULT_ROLES);
    // ── Migration: org.kategorie (Einzel) -> org.kategorien (Array) ──
    // Die Unternehmens-Kategorien sind jetzt Mehrfach-Auswahl. Alte Orgs
    // haben noch das Einzel-Feld 'kategorie' — wir spiegeln es einmalig
    // in ein Array 'kategorien', ohne das Legacy-Feld zu loeschen.
    // Ebenfalls werden die neuen Kategorien (inkl. gruppe-Metadaten)
    // nachgepflegt, falls im localStorage noch die alte Liste steht.
    try {
      var MIGFLAG2='gema_auth_org_kategorien_v1';
      if(!localStorage.getItem(MIGFLAG2)){
        // 1. Alle Orgs: kategorien aus kategorie befuellen
        var orgs2=_getOrgs()||[];
        var anyChange=false;
        orgs2.forEach(function(o){
          if(!o.kategorien || !o.kategorien.length){
            o.kategorien = o.kategorie ? [o.kategorie] : [];
            anyChange=true;
          }
        });
        if(anyChange){
          _writeLocalCache(STORAGE_ORGS, orgs2);
        }
        // 2. Kategorien-Liste: neue Kategorien + gruppe-Metadaten
        //    nachpflegen, falls die alte Liste ohne gruppe drin ist
        var cats=_getOrgCats()||[];
        var newCats = cats.slice();
        var updatedExisting=false;
        // Fuer jede Default-Kategorie: wenn fehlt → hinzufuegen; wenn da
        // aber ohne 'gruppe' → gruppe ergaenzen.
        DEFAULT_ORG_CATS.forEach(function(defCat){
          var ex = newCats.find(function(c){return c.id===defCat.id;});
          if(!ex){
            newCats.push(defCat);
            updatedExisting=true;
          } else if(!ex.gruppe && defCat.gruppe){
            ex.gruppe = defCat.gruppe;
            if(!ex.icon && defCat.icon) ex.icon = defCat.icon;
            updatedExisting=true;
          }
        });
        if(updatedExisting){
          try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(newCats));}catch(e){}
        }
        try{localStorage.setItem(MIGFLAG2,'1');}catch(e){}
      }
    } catch(e) {}
    // ── Migration: Org-Kategorien Lieferanten-Typen + Garagist ──
    // Neue Kategorien 'produktlieferant' + 'garagist' nachziehen und die
    // System-Kategorie 'lieferant' auf das neue Label «Anlagenlieferant /
    // Hersteller» umbenennen (idempotent, einmalig pro Geraet).
    try {
      var MIGFLAG_LIEFTYP='gema_auth_orgcats_lieftypen_v1';
      if(!localStorage.getItem(MIGFLAG_LIEFTYP)){
        var catsL=_getOrgCats();
        if(catsL && catsL.length){
          ['produktlieferant','garagist'].forEach(function(cid){
            if(!catsL.find(function(c){return c.id===cid;})){
              var defC=DEFAULT_ORG_CATS.find(function(c){return c.id===cid;});
              if(defC)catsL.push(defC);
            }
          });
          var exL=catsL.find(function(c){return c.id==='lieferant';});
          if(exL && exL.name==='Lieferant / Hersteller') exL.name='Anlagenlieferant / Hersteller';
          try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(catsL));}catch(e){}
        }
        try{localStorage.setItem(MIGFLAG_LIEFTYP,'1');}catch(e){}
      }
    } catch(e) {}
    // ── Migration: Rollen role_magaziner + role_monteur ──
    // Bestehende Installationen haben die Rollen evtl. noch nicht.
    // Wir ziehen sie einmalig nach (nur Rollen, KEINE Demo-User mehr).
    try {
      var MIGFLAG3='gema_auth_magaziner_monteur_v2';
      if(!localStorage.getItem(MIGFLAG3)){
        var roles3=_getRoles()||[];
        ['role_magaziner','role_monteur'].forEach(function(rid){
          if(!roles3.find(function(r){return r.id===rid;})){
            var def=DEFAULT_ROLES.find(function(r){return r.id===rid;});
            if(def)roles3.push(def);
          }
        });
        _writeLocalCache(STORAGE_ROLES, roles3);
        try{localStorage.setItem(MIGFLAG3,'1');}catch(e){}
      }
    } catch(e) {}
    // ── Migration: Rolle role_garagist ──
    // Externe Werkstaetten als eigene Rolle. Wird einmalig in bestehende
    // Installationen nachgezogen.
    try {
      var MIGFLAG_GARAGIST='gema_auth_garagist_v1';
      if(!localStorage.getItem(MIGFLAG_GARAGIST)){
        var rolesG=_getRoles()||[];
        if(!rolesG.find(function(r){return r.id==='role_garagist';})){
          var defG=DEFAULT_ROLES.find(function(r){return r.id==='role_garagist';});
          if(defG)rolesG.push(defG);
          _writeLocalCache(STORAGE_ROLES, rolesG);
        }
        try{localStorage.setItem(MIGFLAG_GARAGIST,'1');}catch(e){}
      }
    } catch(e) {}

    // ── Cloud-First Bootstrap (per-Record) ─────────────────────────
    // Strategie:
    //   1. Falls Cloud alte Blob-Rows (gema_*_v1) hat: in einzelne
    //      Records aufsplitten, alte Row loeschen.
    //   2. Per-Record Collection laden — bei Erfolg gewinnt Cloud
    //      und ueberschreibt den lokalen Cache (kein additiver Merge mehr,
    //      sonst blieben veraltete User-/Org-Daten im Cache).
    //   3. Bei Veraenderung: einmaliger Reload, damit die UI den neuen
    //      Stand sieht (Permissions, Org-Admin, etc.).
    var _initialOrgsHash    = _hashArr(_getOrgs());
    var _initialUsersHash   = _hashArr(_getUsers());
    var _initialRolesHash   = _hashArr(_getRoles());
    function _maybeReloadAfterSync(beforeHash, afterArr){
      if(!afterArr) return false;
      var afterHash = _hashArr(afterArr);
      if(afterHash === beforeHash) return false;
      try{
        if(sessionStorage.getItem('gema_auth_auto_reloaded')==='1') return false;
        sessionStorage.setItem('gema_auth_auto_reloaded','1');
      }catch(e){}
      console.info('[GemaAuth] Cloud-Stand abweichend vom Cache — Seite wird neu geladen.');
      setTimeout(function(){ try{ location.reload(); }catch(e){} }, 250);
      return true;
    }

    if(_S()){
      // Migration zuerst (jede Collection einzeln, idempotent).
      Promise.all([
        _migrateBlobToRecordsIfNeeded(STORAGE_ORGS),
        _migrateBlobToRecordsIfNeeded(STORAGE_USERS),
        _migrateBlobToRecordsIfNeeded(STORAGE_ROLES)
      ]).then(function(){
        // Danach: per-Record laden, Cache ueberschreiben.
        return Promise.all([
          _loadCollectionFromCloud(STORAGE_ORGS),
          _loadCollectionFromCloud(STORAGE_USERS),
          _loadCollectionFromCloud(STORAGE_ROLES)
        ]);
      }).then(function(res){
        var changed = false;
        if(res[0] && _maybeReloadAfterSync(_initialOrgsHash,  res[0])) changed=true;
        if(!changed && res[1] && _maybeReloadAfterSync(_initialUsersHash, res[1])) changed=true;
        if(!changed && res[2] && _maybeReloadAfterSync(_initialRolesHash, res[2])) changed=true;
      }).catch(function(e){
        console.warn('[GemaAuth] Cloud-Bootstrap fehlgeschlagen:', e && e.message);
      });
    }
  }

  function _hashArr(arr){
    if(!Array.isArray(arr)) return '';
    try{
      var s=JSON.stringify(arr);
      var h=5381;
      for(var i=0;i<s.length;i++){h=((h<<5)+h)+s.charCodeAt(i);h=h&0xffffffff;}
      return h.toString(16);
    }catch(e){ return ''; }
  }
  function _getPerms(user,roles,mkey){
    var p={read:false,write:false,admin:false};
    if(!user||!user.roleIds)return p;
    user.roleIds.forEach(function(rid){
      var role=roles.find(function(r){return r.id===rid;});
      if(!role||!role.permissions||!role.permissions[mkey])return;
      var rp=role.permissions[mkey];
      if(rp.read)p.read=true;if(rp.write)p.write=true;if(rp.admin)p.admin=true;
    });return p;
  }
  function _detectModuleKey(){var f=location.pathname.split('/').pop().replace('.html','').toLowerCase();return FILE_MAP[f]||f;}
  function _isAdmin(user){return user&&user.roleIds&&user.roleIds.indexOf('role_admin')>=0;}

  // ── UI: Permissions ────────────────────────────────────────────────
  function _applyUI(perms){
    if(!perms.write){
      document.querySelectorAll('.gema-write-only,button[onclick*="openAdd"],button[onclick*="openObjektModal"],button[onclick*="submitForm"],button[onclick*="addItem"],button[onclick*="addTask"],button[onclick*="addMilestone"],button[onclick*="saveTool"],button[onclick*="saveAdd"],button[id="btnSave"],button[id="btnAddTask"],button[id="btnAddMilestone"],button[onclick*="newProtocol"],button[id="btnAddContractor"]').forEach(function(el){if(!el.classList.contains('gema-read-ok'))el.style.display='none';});
    }
    if(!perms.admin){
      document.querySelectorAll('.gema-admin-only,button[onclick*="delete"],button[onclick*="Delete"],button[onclick*="deleteTool"],button[onclick*="deleteTask"],button.pl-del,.tc-act-del,button[id="btnSettings"],button[onclick*="resetBtn"]').forEach(function(el){if(!el.classList.contains('gema-read-ok'))el.style.display='none';});
    }
  }

  // ── Login-Light Einschränkungen ─────────────────────────────────
  function _applyLoginLight(user){
    if(!user||user.kontotyp!=='login_light')return;
    var aboTyp=user.abo?user.abo.typ:'light';
    var isTest=aboTyp==='testphase';
    var testExpired=isTest&&user.abo.testphaseEnde&&user.abo.testphaseEnde<new Date().toISOString().split('T')[0];
    if(isTest&&!testExpired)return; // Testphase aktiv → voller Zugang

    // Copy-Schutz: kein Textmarkieren auf geschützten Bereichen
    var css=document.createElement('style');
    css.textContent='.gema-protected{user-select:none!important;-webkit-user-select:none!important}.gema-blur{filter:blur(5px)!important;pointer-events:none!important;user-select:none!important}';
    document.head.appendChild(css);

    // Projektdaten + Planerdaten schützen
    setTimeout(function(){
      document.querySelectorAll('.project-bar,.pf,#metaProjekt,#metaBearbeiter').forEach(function(el){el.classList.add('gema-protected');});
      // Download-Buttons verstecken
      document.querySelectorAll('button[onclick*="PDF"],button[onclick*="export"],a[download]').forEach(function(el){
        el.style.display='none';
      });
    },500);

    // Upgrade-Banner anzeigen
    var banner=document.createElement('div');
    banner.style.cssText='position:fixed;bottom:0;left:0;right:0;background:linear-gradient(135deg,#1e3a5f,#0f172a);color:#fff;padding:14px 24px;font-size:13px;z-index:9998;display:flex;align-items:center;justify-content:center;gap:16px;font-family:system-ui';
    banner.innerHTML='<span>🔒 <strong>Login-Light</strong> — PDF-Download und Textkopiermöglichkeit mit Abo freigeschaltet</span>'
      +'<button onclick="location.href=\'sys_lieferant_dashboard.html\'" style="background:#f59e0b;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap">Abo wählen →</button>';
    document.body.appendChild(banner);
  }

  // ── Logo Swap ──────────────────────────────────────────────────────
  function _swapLogo(org) {
    if (!org || !org.logo) return;
    // Find GEMA logo SVG in nav and replace with org logo (full nav height)
    var nav = document.querySelector('.g-nav');
    var navH = nav ? nav.offsetHeight : 52;
    var imgH = navH - 8; // 4px padding top+bottom
    var marks = document.querySelectorAll('.g-nav-mark');
    marks.forEach(function(mark) {
      var svg = mark.querySelector('svg') || mark.querySelector('img');
      if (svg) {
        var img = document.createElement('img');
        img.src = org.logo;
        img.style.cssText = 'height:'+imgH+'px;width:auto;max-width:120px;object-fit:contain';
        img.alt = org.name || 'Logo';
        mark.style.cssText = 'width:auto;height:'+imgH+'px;display:flex;align-items:center';
        mark.innerHTML = '';
        mark.appendChild(img);
      }
    });
    // Swap or hide brand text based on org settings
    var brands = document.querySelectorAll('.g-nav-brand');
    if (org.settings && org.settings.hideName) {
      brands.forEach(function(b) { b.style.display = 'none'; });
    } else if (org.name && org.name !== 'Mein Unternehmen') {
      brands.forEach(function(b) { b.textContent = org.name; });
    }
  }

  // ── Nav Badge + Admin User-Switcher ─────────────────────────────
  function _injectBadge(user, roles, org) {
    if (document.getElementById('_gemaAuthBadge')) return;
    var roleNames = (user.roleIds||[]).map(function(rid){
      var r=roles.find(function(x){return x.id===rid;}); return r?r.name:'';
    }).filter(Boolean).join(', ');
    var roleColor='#6b7280';
    if(user.roleIds&&user.roleIds.length){
      var fr=roles.find(function(r){return r.id===user.roleIds[0];});
      if(fr) roleColor=fr.color;
    }
    var badge=document.createElement('div');
    badge.id='_gemaAuthBadge';
    badge.style.cssText='display:flex;align-items:center;gap:6px;margin-left:16px;padding-right:12px;flex-shrink:0;position:relative';

    var isAdmin=_isAdmin(user);
    var isImpersonating=false;
    try{isImpersonating=!!localStorage.getItem('_gemaAdminOrigin');}catch(e){}
    var showSwitcher=isAdmin||isImpersonating;
    badge.innerHTML=
      '<div style="text-align:right;cursor:'+(showSwitcher?'pointer':'default')+'" '+(showSwitcher?'onclick="document.getElementById(\'_gemaSwitcher\').style.display=document.getElementById(\'_gemaSwitcher\').style.display===\'none\'?\'block\':\'none\'"':'')+'>'+
        '<div style="font-size:12px;font-weight:700;color:#111827;line-height:1.2">'+_esc(user.name||user.username)+(showSwitcher?' <span style="font-size:9px;color:#9ca3af">▼</span>':'')+'</div>'+
        '<div style="font-size:10px;font-weight:600;color:'+roleColor+'">'+_esc(roleNames)+'</div>'+
      '</div>';

    // Admin User-Switcher Dropdown (auch bei Impersonation)
    if(showSwitcher){
      var allUsers=_getUsers()||[];
      var dd=document.createElement('div');
      dd.id='_gemaSwitcher';
      dd.style.cssText='display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:280px;max-height:400px;overflow-y:auto;background:#fff;border:1.5px solid #c8cfdf;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.15);z-index:600;padding:6px 0';
      dd.innerHTML=(isImpersonating?'<div onclick="GemaAuth._stopImpersonating()" style="padding:10px 14px;cursor:pointer;background:#1d4ed8;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;border-bottom:1px solid #e2e7f0" onmouseover="this.style.background=\'#1e40af\'" onmouseout="this.style.background=\'#1d4ed8\'">← Zurück zu Admin</div>':'')+
        '<div style="padding:6px 14px;font-size:10px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Als Benutzer anmelden</div>'+
        allUsers.map(function(u){
          var uRoles=(u.roleIds||[]).map(function(rid){var r=roles.find(function(x){return x.id===rid;});return r?r.name:'';}).filter(Boolean).join(', ');
          var uColor=(roles.find(function(r){return u.roleIds&&u.roleIds.indexOf(r.id)>=0;})||{color:'#6b7280'}).color;
          var isCurrent=u.id===user.id;
          var lightBadge=u.kontotyp==='login_light'?' <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#fef3c7;color:#92400e;font-weight:700">Light</span>':'';
          return '<div onclick="GemaAuth._switchUser(\''+u.id+'\')" style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:.1s;'+(isCurrent?'background:#eff4ff;':'')+'font-size:12px" onmouseover="this.style.background=\'#f3f5fb\'" onmouseout="this.style.background=\''+(isCurrent?'#eff4ff':'')+'\'">'+
            '<div style="width:28px;height:28px;border-radius:50%;background:'+uColor+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">'+_esc((u.name||u.username).split(' ').map(function(s){return s[0];}).join('').substring(0,2).toUpperCase())+'</div>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_esc(u.name||u.username)+(isCurrent?' ✓':'')+lightBadge+'</div>'+
              '<div style="font-size:10px;color:#9ca3af">'+_esc(uRoles)+'</div>'+
            '</div>'+
          '</div>';
        }).join('')+
        '<div style="border-top:1px solid #e2e7f0;padding:8px 14px;margin-top:4px"><a href="sys_admin.html" style="font-size:11px;font-weight:700;color:#2563eb;text-decoration:none">👥 Benutzerverwaltung →</a></div>';
      badge.appendChild(dd);

      // Close on outside click
      document.addEventListener('click',function(e){
        if(!badge.contains(e.target)){dd.style.display='none';}
      });
    }

    var inner=document.querySelector('.g-nav-inner');
    if(inner) inner.appendChild(badge);
  }

  function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function _unblock(){var s=document.getElementById('_gaBlock');if(s)s.remove();}
  function _redirectLogin(){_unblock();location.href='sys_login.html?r='+encodeURIComponent(location.href);}

  // ── Auto-fill Bearbeiter field ──────────────────────────────────────
  function _autoFillBearbeiter(user) {
    // Runs slightly delayed to let module-specific loadMeta() execute first
    setTimeout(function() {
      var el = document.getElementById('metaBearbeiter');
      if (!el) return;
      var userName = user.name || user.username || '';
      // Only auto-fill if empty (no prior save) or if it matches current user
      if (!el.value || !el.value.trim()) {
        el.value = userName;
        // Trigger input event so saveMeta picks it up
        el.dispatchEvent(new Event('input', {bubbles:true}));
      }
    }, 150);
  }

  // ── Enhance Objekt dropdown format ─────────────────────────────────
  var _objDropdownEnhanced = false;
  function _enhanceObjektDropdown() {
    setTimeout(function() {
      var sel = document.getElementById('metaObjektDropdown');
      if (!sel || typeof GemaObjekte === 'undefined') return;
      var objs = GemaObjekte.getAll();
      var activeId = GemaObjekte.getActiveId();
      var currentVal = sel.value;
      sel.innerHTML = '<option value="">\u2013 Objekt w\u00e4hlen \u2013</option>' +
        objs.map(function(o) {
          var parts = [o.name || '\u2013'];
          if (o.strasse) parts.push(o.strasse);
          if (o.plz || o.ort) parts.push([o.plz, o.ort].filter(Boolean).join(' '));
          var label = parts.join(' \u00b7 ');
          var selected = (currentVal && o.id === currentVal) || (!currentVal && o.id === activeId);
          return '<option value="' + o.id + '"' + (selected ? ' selected' : '') + '>' + label + '</option>';
        }).join('');
      if (!_objDropdownEnhanced) {
        _objDropdownEnhanced = true;
        window.addEventListener('gema-objekte-loaded', function() { _enhanceObjektDropdown(); });
      }
    }, 200);
  }

  // ── Page detection ─────────────────────────────────────────────────
  var thisFile=location.pathname.split('/').pop()||'';
  var thisFileLower=thisFile.toLowerCase().replace('.html','');
  function _isSkip(){return thisFileLower==='sys_login';}
  function _isLoginOnly(){return ['index','sb_index','pm_ausschreibung','ab_index','sys_admin','sys_profil','sys_preise','sys_beta','sys_lieferant_dashboard','sys_garagist_dashboard','sys_workspace','sys_unternehmen',''].indexOf(thisFileLower)>=0;}

  // ── Rollenspezifische Zielseite ─────────────────────────────────
  function _getRedirectForUser(u){
    if(!u||!u.roleIds)return'sys_workspace.html';
    // Anlagen-/Produktlieferant + alle Unterrollen, Pruefer + Leiternpruefer
    if(u.roleIds.some(function(r){return typeof r==='string'&&(r.indexOf('role_lieferant')===0||r.indexOf('role_produktlieferant')===0);}))return'sys_lieferant_dashboard.html';
    if(u.roleIds.indexOf('role_pruefer')>=0||u.roleIds.indexOf('role_leiterpruefer')>=0)return'sys_lieferant_dashboard.html';
    if(u.roleIds.indexOf('role_garagist')>=0)return'sys_garagist_dashboard.html';
    if(u.roleIds.indexOf('role_magaziner')>=0)return'index.html';
    if(u.roleIds.indexOf('role_monteur')>=0)return'index.html';
    return'sys_workspace.html';
  }

  // ── INIT ───────────────────────────────────────────────────────────
  _initDefaults();

  if(_isSkip()){
    // login — no auth, just expose API
  } else {
    // FRUEHER haben wir hier ein <style id="_gaBlock">body{visibility:
    // hidden!important}</style> injiziert, damit der Modul-Inhalt
    // waehrend des Permission-Checks nicht aufblitzt. Das war aber
    // die Wurzel von "Modul haengt sich beim Anklicken auf, weisser
    // Bildschirm": wenn irgendein Code-Pfad das _unblock() ueberspringt
    // (Exception, async-Race, Edge-Case), bleibt der Body permanent
    // unsichtbar. Mehrere Schutzschichten (try/catch, setTimeout-Safety-
    // Net) haben das Problem nicht zuverlaessig behoben.
    //
    // Neue Strategie: KEIN Block mehr. Beim Login-Redirect oder Access-
    // Denied blitzt fuer ~30ms der Modul-Inhalt auf, bevor _redirectLogin
    // bzw. der "Kein Zugriff"-Screen rendert. Das ist akzeptabel — ein
    // kurzer FOUC ist allemal besser als ein permanent weisser Bildschirm.
    //
    // _unblock() ist noch da fuer Backward-Compat (falls irgendwer das
    // _gaBlock-Element manuell anlegt) — macht aber nichts, wenn es
    // kein Element zu entfernen gibt.

    // Auth-Init in try/catch — wenn hier etwas crasht, soll trotzdem
    // _unblock() laufen, damit die Page sichtbar bleibt.
    try {

    var session=_getSession();
    if(!session){
      _redirectLogin();
    } else {
      var users=_getUsers()||DEFAULT_USERS;
      var roles=_getRoles()||DEFAULT_ROLES;
      var orgs=_getOrgs()||DEFAULT_ORGS;
      var user=users.find(function(u){return u.id===session.userId&&u.active;});
      if(!user){localStorage.removeItem(STORAGE_SESSION);_redirectLogin();}
      else {
        // KEIN ||orgs[0]-Fallback: wenn die Org des Users nicht aufloesbar
        // ist, zeigte die Nav sonst Logo+Name einer FREMDEN Firma (der
        // ersten im Pool — «bwt aqua»-Bug). Ohne Org bleibt das GEMA-Logo.
        var userOrg=orgs.find(function(o){return o.id===user.orgId;})||null;

        if(_isLoginOnly()){
          // Rollenspezifische Weiterleitung: Lieferant/Prüfer/Magaziner/Monteur
          // sollen nicht auf der Modulübersicht landen, sondern auf ihrem Dashboard
          var roleDest=_getRedirectForUser(user);
          var curPage=thisFileLower||'index';
          var destPage=roleDest.replace('.html','').toLowerCase();
          if(!_isAdmin(user)&&destPage!==curPage&&destPage!=='index'){
            location.href=roleDest;
            return;
          }
          _unblock();
          document.addEventListener('DOMContentLoaded',function(){
            _injectBadge(user,roles,userOrg);
            _swapLogo(userOrg);
          });
        } else {
          var mkey=_detectModuleKey();
          var perms=_getPerms(user,roles,mkey);
          if(!_isAdmin(user)&&!perms.read){
            _unblock();
            document.addEventListener('DOMContentLoaded',function(){
              document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><div style="font-size:48px">🔒</div><h2 style="margin:16px 0 8px">Kein Zugriff</h2><p style="color:#6b7280">Sie haben keine Berechtigung für dieses Modul.</p><a href="index.html" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">← Zurück zur Übersicht</a></div></div>';
            });
          } else {
            _unblock();
            document.addEventListener('DOMContentLoaded',function(){
              if(!_isAdmin(user)) _applyUI(perms);
              _applyLoginLight(user);
              // Org-Admin Button sichtbar machen
              if(w.GemaAuth.isOrgAdmin(user.id)){
                var oab=document.getElementById('navOrgAdmin');
                if(oab)oab.style.display='';
              }
              _injectBadge(user,roles,userOrg);
              _swapLogo(userOrg);
              _autoFillBearbeiter(user);
              _enhanceObjektDropdown();
            });
          }
        }
      }
    }
    } catch (e) {
      // Auth-Init hat einen Fehler geworfen. Damit der Bildschirm
      // nicht weiss bleibt: unblock + Fehler in Console werfen.
      try{ console.error('[GemaAuth] Init-Fehler:', e); }catch(_){}
      _unblock();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────
  // ── Kategorie-Helpers ────────────────────────────────────────────────
  // Gibt die Gruppe einer Kategorie zurueck ('gebaeudetechnik', 'lieferant',
  // 'bau', 'andere'). Unbekannte Kategorien landen in 'andere'.
  function _kategorieGruppe(catId){
    var cats = _getOrgCats() || [];
    var c = cats.find(function(x){return x.id===catId;});
    return (c && c.gruppe) || 'andere';
  }
  // Prueft, ob eine Kategorie zu einer aktuellen Auswahl (Array of IDs)
  // hinzugefuegt werden darf. Regeln:
  //   - 'lieferant' ist exklusiv gegenueber 'gebaeudetechnik' (und umge-
  //     kehrt). Wer liefert, plant/fuehrt nicht aus.
  //   - Innerhalb 'gebaeudetechnik' sind beliebig viele Kategorien
  //     kombinierbar (ein Installateur kann auch Planer sein).
  //   - 'bau' und 'andere' sind mit allem kompatibel.
  function _isKategorieKompatibel(catId, currentIds){
    var ownGruppe = _kategorieGruppe(catId);
    var selected = currentIds || [];
    if(ownGruppe === 'lieferant'){
      // Lieferant darf nicht mit Gebaeudetechnik kombiniert werden
      return !selected.some(function(id){return _kategorieGruppe(id)==='gebaeudetechnik';});
    }
    if(ownGruppe === 'gebaeudetechnik'){
      // Gebaeudetechnik darf nicht mit Lieferant kombiniert werden
      return !selected.some(function(id){return _kategorieGruppe(id)==='lieferant';});
    }
    return true;
  }

  w.GemaAuth={
    getModules:function(){return MODULES;},
    getOrgs:_getOrgs,
    getOrgCats:_getOrgCats,
    getKategorieGruppe:_kategorieGruppe,
    isKategorieKompatibel:_isKategorieKompatibel,
    getUsers:_getUsers,
    getRoles:_getRoles,
    getSession:_getSession,
    hash:_hash,

    // ── Firmen-Kategorie → erlaubte Mitarbeiter-Rollen ──────────────
    // Liefert die Rollen-IDs, die fuer User dieser Org zulaessig sind
    // (Union ueber alle Kategorien der Org). null = keine Einschraenkung
    // (Org ohne Kategorie, Kategorie 'sonstiges' oder org_default).
    // role_admin ist NIE enthalten — die vergibt nur der Super-Admin.
    getAssignableRoleIdsForOrg:function(orgId){
      if(!orgId||orgId==='org_default')return null;
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return null;
      var kats=(org.kategorien&&org.kategorien.length)?org.kategorien:(org.kategorie?[org.kategorie]:[]);
      if(!kats.length)return null;
      var out={},unrestricted=false;
      kats.forEach(function(k){
        if(!(k in KATEGORIE_ROLLEN)){unrestricted=true;return;} // unbekannte/eigene Kategorie → nicht einschraenken
        var list=KATEGORIE_ROLLEN[k];
        if(list===null){unrestricted=true;return;}              // 'sonstiges'
        list.forEach(function(rid){out[rid]=true;});
      });
      if(unrestricted)return null;
      return Object.keys(out);
    },

    getCurrentUser:function(){
      var s=_getSession();if(!s)return null;
      var u=_getUsers()||[];return u.find(function(x){return x.id===s.userId;})||null;
    },
    getCurrentOrg:function(){
      // KEIN ||orgs[0]-Fallback (siehe userOrg im Init): eine nicht
      // aufloesbare Org darf nie stillschweigend zur ersten fremden
      // Firma werden — Konsumenten behandeln null korrekt.
      var user=w.GemaAuth.getCurrentUser();if(!user)return null;
      var orgs=_getOrgs()||[];
      return orgs.find(function(o){return o.id===user.orgId;})||null;
    },
    can:function(action,mkey){
      var user=w.GemaAuth.getCurrentUser();if(!user)return false;
      if(_isAdmin(user))return true;
      var roles=_getRoles()||[];
      return !!_getPerms(user,roles,mkey||_detectModuleKey())[action];
    },
    login:function(username,password,remember){
      var users=_getUsers()||DEFAULT_USERS;
      var h=_hash(password);
      var input=username.toLowerCase();
      var user=users.find(function(u){
        if(!u.active||u.password!==h)return false;
        if(u.username&&u.username.toLowerCase()===input)return true;
        if(u.profile&&u.profile.email&&u.profile.email.toLowerCase()===input)return true;
        return false;
      });
      if(!user)return null;
      var exp=new Date();exp.setDate(exp.getDate()+(remember?SESSION_DAYS:1));
      var s={userId:user.id,expires:exp.toISOString()};
      try{localStorage.setItem(STORAGE_SESSION,JSON.stringify(s));}catch(e){}
      return user;
    },
    loginAsync:function(username,password,remember){
      var self=this;
      return new Promise(function(resolve){
        var resolved=false;
        function done(u){if(!resolved){resolved=true;resolve(u);}}
        // Cloud first — User-Wahl: Login braucht Verbindung, kein Offline-Fallback.
        // Wir laden die User-Collection per Record und ersetzen den lokalen
        // Cache, bevor wir den Login-Versuch machen.
        _loadCollectionFromCloud(STORAGE_USERS).then(function(){
          done(self.login(username,password,remember));
        }).catch(function(){
          // Cloud nicht erreichbar → kein Login moeglich (User-Wahl).
          done(null);
        });
        // Hard-Timeout
        setTimeout(function(){done(null);},6000);
      });
    },
    logout:function(){localStorage.removeItem(STORAGE_SESSION);location.href='sys_login.html';},

    // Admin-Impersonation: als anderer User anmelden, Admin-Zugang bleibt
    _switchUser:function(userId){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user)return;
      // Merke den originalen Admin-User
      var curSession=_getSession();
      var origAdmin=null;
      try{origAdmin=localStorage.getItem('_gemaAdminOrigin');}catch(e){}
      if(!origAdmin&&curSession){
        var curUser=users.find(function(u){return u.id===curSession.userId;});
        if(curUser&&_isAdmin(curUser)){
          try{localStorage.setItem('_gemaAdminOrigin',curUser.id);}catch(e){}
        }
      }
      var exp=new Date();exp.setDate(exp.getDate()+1);
      var s={userId:user.id,expires:exp.toISOString()};
      try{localStorage.setItem(STORAGE_SESSION,JSON.stringify(s));}catch(e){}
      var dest=_getRedirectForUser(user);
      location.href=dest;
    },
    _isImpersonating:function(){
      try{return !!localStorage.getItem('_gemaAdminOrigin');}catch(e){return false;}
    },
    _getAdminOriginId:function(){
      try{return localStorage.getItem('_gemaAdminOrigin');}catch(e){return null;}
    },
    _stopImpersonating:function(){
      var origId=w.GemaAuth._getAdminOriginId();
      if(!origId)return;
      try{localStorage.removeItem('_gemaAdminOrigin');}catch(e){}
      w.GemaAuth._switchUser(origId);
    },

    // Gewerke des aktuellen Users ermitteln (aus allen Rollen zusammengeführt)
    getGewerke:function(){
      var user=w.GemaAuth.getCurrentUser();if(!user)return['sanitaer'];
      if(_isAdmin(user))return['sanitaer','hlkk','lueftung','elektro'];
      var roles=_getRoles()||DEFAULT_ROLES;
      var gewerke=[];
      (user.roleIds||[]).forEach(function(rid){
        var role=roles.find(function(r){return r.id===rid;});
        if(role&&role.gewerke)role.gewerke.forEach(function(g){if(gewerke.indexOf(g)<0)gewerke.push(g);});
      });
      return gewerke.length?gewerke:['sanitaer'];
    },

    saveOrgs:function(o){
      _persistCollection(STORAGE_ORGS, o);
      return true;
    },
    saveOrgCats:function(c){try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(c));return true;}catch(e){return false;}},
    saveUsers:function(u){
      _persistCollection(STORAGE_USERS, u);
      return true;
    },
    saveRoles:function(r){
      _persistCollection(STORAGE_ROLES, r);
      return true;
    },

    /**
     * Notfall-Recovery: holt orgs + users aus Supabase und merged sie
     * ins localStorage. Wird gebraucht, wenn der Browser-Cache
     * geleert wurde — _initDefaults() schreibt dann nur DEFAULTS rein,
     * und der bestehende async-Merge greift erst, wenn die Seite neu
     * geladen wird (UI sieht das nicht reaktiv).
     *
     * Optionen:
     *   { overwrite: true }  -> Supabase-Daten ersetzen lokale komplett
     *                           (NUR wenn lokal aktuell NUR DEFAULTS sind
     *                            oder der User es explizit bestaetigt)
     *   { overwrite: false } -> Merge-Modus: nur fehlende IDs hinzufuegen
     *                           (Default — sicher, kann nichts kaputt machen)
     *
     * Returns: Promise<{ok, addedOrgs, addedUsers, totalOrgs, totalUsers, error?}>
     */
    restoreFromCloud:function(opts){
      opts = opts || {};
      // Per-Record-Architektur: jedes Bootstrap holt automatisch alle
      // Cloud-Records und ueberschreibt den lokalen Cache (Cloud gewinnt).
      // restoreFromCloud loest das jetzt explizit aus, fuer Notfall-Buttons.
      return Promise.all([
        _migrateBlobToRecordsIfNeeded(STORAGE_ORGS),
        _migrateBlobToRecordsIfNeeded(STORAGE_USERS),
        _migrateBlobToRecordsIfNeeded(STORAGE_ROLES)
      ]).then(function(){
        return Promise.all([
          _loadCollectionFromCloud(STORAGE_ORGS),
          _loadCollectionFromCloud(STORAGE_USERS),
          _loadCollectionFromCloud(STORAGE_ROLES)
        ]);
      }).then(function(res){
        var orgs = res[0] || _getOrgs() || [];
        var users = res[1] || _getUsers() || [];
        return {
          ok:true,
          addedOrgs: orgs.length, addedUsers: users.length,
          totalOrgs: orgs.length, totalUsers: users.length
        };
      }).catch(function(e){
        return { ok:false, error: String(e && e.message || e) };
      });
    },

    /**
     * Versionierte Backups gibt es seit dem Per-Record-Umbau nicht mehr.
     * Single-Record-Saves koennen nicht mehr die ganze Liste ueberschreiben,
     * darum sind die Hourly-Snapshots ueberfluessig. Stub bleibt fuer
     * Aufrufer in sys_admin.html — liefert leeres Array.
     */
    listBackups:function(){ return Promise.resolve([]); },
    restoreFromBackup:function(){ return Promise.resolve({ok:false, error:'Backups nicht mehr verfuegbar (per-Record-Architektur)'}); },

    /**
     * Erkennt, ob der lokale Storage nur DEFAULTS enthaelt — also der
     * User vermutlich nach Cache-Clear oder auf neuem Geraet sitzt
     * und sich wundert, wo seine Firma hin ist. Wird vom Auto-Recovery-
     * Hook aufgerufen, um stillschweigend Supabase nachzuladen.
     */
    _isOnlyDefaults:function(){
      var orgs = _getOrgs() || [];
      var users = _getUsers() || [];
      // DEFAULTS: 1 default-Org + 5 Demo-Orgs (siehe DEFAULT_ORGS)
      var defaultOrgIds = DEFAULT_ORGS.map(function(o){return o.id;});
      var defaultUserIds = DEFAULT_USERS.map(function(u){return u.id;});
      var nonDefaultOrgs = orgs.filter(function(o){ return defaultOrgIds.indexOf(o.id) < 0; });
      var nonDefaultUsers = users.filter(function(u){ return defaultUserIds.indexOf(u.id) < 0; });
      return nonDefaultOrgs.length === 0 && nonDefaultUsers.length === 0;
    },

    // ── Einladungssystem ──
    // Sucht eine existierende Org anhand des Firmennamens (case-
    // insensitive, Trimming) oder legt eine neue mit minimalen Default-
    // Werten an. Verhindert, dass Fremdfirmen bei inviteLieferant/
    // inviteBeteiligter in 'org_default' einsortiert werden.
    //
    // kategorie: 'lieferant'|'architekt'|'sanitaerinstallateur'|...
    // kontakt:   { email, telefon } — wird beim Neu-Anlegen uebernommen
    // adminUserId: wird beim Neu-Anlegen als erster Org-Admin gesetzt
    //
    // Gibt immer eine gueltige orgId zurueck.
    ensureOrgForFirma:function(firma, kategorie, kontakt, adminUserId){
      firma = (firma||'').trim();
      if(!firma) return 'org_default';
      var orgs = _getOrgs() || [];
      var norm = firma.toLowerCase();
      // Suche in bestehenden Orgs (ignoriere org_default, um Treffer auf
      // "Jaeggi Vollmer GmbH" aus Versehen zu vermeiden).
      var found = orgs.find(function(o){
        return o.id!=='org_default' && o.name && o.name.toLowerCase().trim()===norm;
      });
      if(found) return found.id;
      // Neue Org anlegen mit minimalen Default-Werten.
      var newId = 'org_'+Date.now()+'_'+Math.random().toString(36).substring(2,6);
      var k = kontakt || {};
      orgs.push({
        id:newId,
        name:firma,
        logo:null,
        kategorie:kategorie||'sonstiges',
        rechtsform:'',
        adresse:{strasse:'',plz:'',ort:'',kanton:'',land:'CH'},
        kontakt:{email:k.email||'',telefon:k.telefon||'',website:''},
        settings:{waehrung:'CHF',land:'CH',sichtbarkeit:'organisation',abteilungenAktiv:false},
        abteilungen:[],
        lizenzen:{typ:'pool',maxUser:5,aktiveUser:1,aboStart:new Date().toISOString().split('T')[0],aboEnde:'',gewerke:[]},
        admins:adminUserId?[adminUserId]:[],
        active:true,
        autoCreated:true, // Marker: wurde per Einladung angelegt
        createdAt:new Date().toISOString()
      });
      _writeLocalCache(STORAGE_ORGS, orgs);
      return newId;
    },

    inviteLieferant:function(opts){
      // Erstellt einen Login-Light User für einen Lieferanten.
      // Wenn opts.orgId gesetzt ist, wird dieser genutzt; sonst wird
      // anhand opts.firma eine existierende Org gefunden oder eine
      // neue Lieferanten-Org angelegt. Nur als absoluter Fallback (kein
      // opts.orgId, kein opts.firma) wird org_default genommen.
      var users=_getUsers()||[];
      var token='inv_'+Date.now()+'_'+Math.random().toString(36).substring(2,8);
      var userId='user_lief_'+Date.now();
      var resolvedOrgId = opts.orgId
        || (opts.firma
            ? w.GemaAuth.ensureOrgForFirma(opts.firma, 'lieferant', {email:opts.email, telefon:opts.tel}, userId)
            : 'org_default');
      var user={
        id:userId,
        username:opts.email||token,
        name:opts.firma||opts.person||'Lieferant',
        password:null, // Wird beim ersten Login gesetzt
        roleIds:(opts.roleIds&&opts.roleIds.length)?opts.roleIds:['role_lieferant'],
        orgId:resolvedOrgId,
        // Explizite Verknuepfung zum GemaProdukte-Lieferant-Datensatz —
        // sonst muss findMyLieferant() auf die fragile Heuristik zurueckfallen.
        lieferantId:opts.lieferantId||'',
        active:true,
        createdAt:new Date().toISOString(),
        profile:{
          email:opts.email||'',
          telefon:opts.tel||'',
          firma:opts.firma||'',
          person:opts.person||'',
          sprache:'de',
          benachrichtigungen:true
        },
        kontotyp:'login_light', // 'login_light' oder 'vollzugang'
        einladung:{
          token:token,
          eingeladenVon:opts.eingeladenVon||'',
          eingeladenAm:new Date().toISOString(),
          angenommenAm:null,
          passwortGesetzt:false
        },
        abo:{typ:'light',testphaseEnde:null}
      };
      users.push(user);
      w.GemaAuth.saveUsers(users);
      return{user:user,token:token,loginUrl:'sys_login.html?invite='+token};
    },

    // Generische Einladung für alle Rollen (aus Beteiligte)
    inviteBeteiligter:function(opts){
      // opts: {email, firma, person, rolle, roleId, orgId, eingeladenVon, beteiligterObjektId}
      var users=_getUsers()||[];
      // Prüfe ob Email bereits existiert
      var existing=users.find(function(u){
        return u.username&&u.username.toLowerCase()===(opts.email||'').toLowerCase()
          ||u.profile&&u.profile.email&&u.profile.email.toLowerCase()===(opts.email||'').toLowerCase();
      });
      if(existing){
        return{user:existing,token:null,loginUrl:'sys_login.html',existingAccount:true};
      }
      var token='inv_'+Date.now()+'_'+Math.random().toString(36).substring(2,8);
      var roleId=opts.roleId||'role_unternehmer';
      var userId='user_'+roleId.replace('role_','')+'_'+Date.now();
      // Kategorie fuer die Org automatisch aus der Rolle ableiten, damit
      // die neue Firma im Produktkatalog/Unternehmensfilter richtig
      // einsortiert wird.
      var ROLE_TO_KATEGORIE = {
        'role_lieferant':'lieferant',
        'role_produktlieferant_admin':'lieferant',
        'role_leiterpruefer':'lieferant',
        'role_architekt':'architekt',
        'role_unternehmer':'sanitaerinstallateur',
        'role_hlkk_planer':'heizungsplaner',
        'role_planer':'sanitaerplaner',
        'role_garagist':'garagist'
      };
      var kategorie = ROLE_TO_KATEGORIE[roleId] || 'sonstiges';
      var resolvedOrgId = opts.orgId
        || (opts.firma
            ? w.GemaAuth.ensureOrgForFirma(opts.firma, kategorie, {email:opts.email, telefon:opts.tel}, userId)
            : 'org_default');
      var user={
        id:userId,
        username:opts.email||token,
        name:opts.person||opts.firma||'Eingeladener',
        password:null,
        roleIds:[roleId],
        orgId:resolvedOrgId,
        active:true,
        createdAt:new Date().toISOString(),
        profile:{
          email:opts.email||'',
          telefon:opts.tel||'',
          firma:opts.firma||'',
          person:opts.person||'',
          sprache:'de',
          benachrichtigungen:true
        },
        kontotyp:'login_light',
        einladung:{
          token:token,
          eingeladenVon:opts.eingeladenVon||'',
          eingeladenAm:new Date().toISOString(),
          angenommenAm:null,
          passwortGesetzt:false,
          beteiligterObjektId:opts.beteiligterObjektId||null
        },
        abo:{typ:'light',testphaseEnde:null}
      };
      users.push(user);
      w.GemaAuth.saveUsers(users);
      return{user:user,token:token,loginUrl:'sys_login.html?invite='+token,existingAccount:false};
    },

    // Email-Prüfung: existiert bereits ein Account?
    findUserByEmail:function(email){
      if(!email)return null;
      var users=_getUsers()||[];
      var e=email.toLowerCase();
      return users.find(function(u){
        return (u.username&&u.username.toLowerCase()===e)
          ||(u.profile&&u.profile.email&&u.profile.email.toLowerCase()===e);
      })||null;
    },

    // Token-basiertes Erstlogin (erweitert mit Registrierungsfeldern)
    activateInvitation:function(token,password,regData){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.einladung&&u.einladung.token===token;});
      if(!user)return null;
      user.password=_hash(password);
      user.einladung.angenommenAm=new Date().toISOString();
      user.einladung.passwortGesetzt=true;
      // Registrierungsdaten übernehmen
      if(regData){
        if(regData.name)user.name=regData.name;
        if(regData.firma&&user.profile)user.profile.firma=regData.firma;
        if(regData.person&&user.profile)user.profile.person=regData.name||regData.person;
      }
      // 30-Tage Testphase starten
      var testEnde=new Date();testEnde.setDate(testEnde.getDate()+30);
      user.abo={typ:'testphase',testphaseEnde:testEnde.toISOString().split('T')[0]};
      w.GemaAuth.saveUsers(users);
      return user;
    },

    // Rollenspezifische Weiterleitung nach Login/Aktivierung
    getRedirectForUser:_getRedirectForUser,

    // Prüfe ob User Login-Light ist
    isLoginLight:function(user){
      if(!user)user=w.GemaAuth.getCurrentUser();
      return user&&user.kontotyp==='login_light'&&(!user.abo||user.abo.typ==='light'||user.abo.typ==='testphase');
    },

    // Abo upgraden
    upgradeAbo:function(userId,aboTyp){
      var users=_getUsers()||[];
      var idx=users.findIndex(function(u){return u.id===userId;});
      if(idx<0)return false;
      users[idx].abo={typ:aboTyp};
      users[idx].kontotyp='vollzugang';
      return w.GemaAuth.saveUsers(users);
    },

    // Eindeutige Verknuepfung eingeloggter User -> Lieferant-Datensatz
    // (GemaProdukte-Lieferant-ID). Loest die fragile Heuristik
    // (E-Mail/Org/Firma) ab; das Dashboard self-healt beim ersten
    // Heuristik-Treffer. userId optional (Default: aktueller User).
    linkUserToLieferant:function(lieferantId, userId){
      if(!lieferantId) return false;
      var users=_getUsers()||[];
      var uid=userId;
      if(!uid){ var cu=w.GemaAuth.getCurrentUser(); uid=cu&&cu.id; }
      if(!uid) return false;
      var idx=users.findIndex(function(u){return u.id===uid;});
      if(idx<0) return false;
      if(users[idx].lieferantId===lieferantId) return true;
      users[idx].lieferantId=lieferantId;
      return w.GemaAuth.saveUsers(users);
    },

    // ── Werkzeug-Mandate ──
    // Mandat = Beziehung zwischen Unternehmer-Firma und Lieferant/Prüfer
    // {id, unternehmerOrgId, unternehmerFirma, lieferantUserId, lieferantFirma,
    //  typ:'pruefer'|'lieferant'|'beides', zugang:'werkzeuge'|'kategorien'|'alle',
    //  kategorien:[], aktiv:true, erstelltAm, deaktiviertVon:null}
    getMandate:function(){
      try{var r=localStorage.getItem('gema_werkzeug_mandate');return r?JSON.parse(r):[];}catch(e){return[];}
    },
    saveMandate:function(mandate){
      try{localStorage.setItem('gema_werkzeug_mandate',JSON.stringify(mandate));}catch(e){}
    },
    createMandat:function(opts){
      var mandate=w.GemaAuth.getMandate();
      var m={
        id:'wm_'+Date.now(),
        unternehmerOrgId:opts.unternehmerOrgId||'',
        unternehmerFirma:opts.unternehmerFirma||'',
        lieferantUserId:opts.lieferantUserId||'',
        lieferantFirma:opts.lieferantFirma||'',
        typ:opts.typ||'pruefer',
        zugang:opts.zugang||'alle',
        kategorien:opts.kategorien||[],
        aktiv:true,
        erstelltAm:new Date().toISOString(),
        deaktiviertVon:null
      };
      mandate.push(m);
      w.GemaAuth.saveMandate(mandate);
      return m;
    },
    deaktivierMandat:function(mandatId,vonWem){
      var mandate=w.GemaAuth.getMandate();
      var m=mandate.find(function(x){return x.id===mandatId;});
      if(m){m.aktiv=false;m.deaktiviertVon=vonWem||'';w.GemaAuth.saveMandate(mandate);}
    },
    aktivierMandat:function(mandatId){
      var mandate=w.GemaAuth.getMandate();
      var m=mandate.find(function(x){return x.id===mandatId;});
      if(m){m.aktiv=true;m.deaktiviertVon=null;w.GemaAuth.saveMandate(mandate);}
    },
    getMeineMandate:function(userId,firma){
      // Mandate wo ich Lieferant/Prüfer bin
      return w.GemaAuth.getMandate().filter(function(m){
        return m.aktiv&&(m.lieferantUserId===userId||m.lieferantFirma===firma);
      });
    },
    getMandateFuerUnternehmer:function(orgId,firma){
      // Mandate die ein Unternehmer vergeben hat
      return w.GemaAuth.getMandate().filter(function(m){
        return m.unternehmerOrgId===orgId||m.unternehmerFirma===firma;
      });
    },

    // ── Unternehmens-Verwaltung ──
    isOrgAdmin:function(userId){
      var user=userId?(_getUsers()||[]).find(function(u){return u.id===userId;}):w.GemaAuth.getCurrentUser();
      if(!user)return false;
      if(_isAdmin(user))return true;
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===user.orgId;});
      return org&&org.admins&&org.admins.indexOf(user.id)>=0;
    },
    getOrgUsers:function(orgId){
      var users=_getUsers()||[];
      return users.filter(function(u){return u.orgId===orgId&&u.active;});
    },
    getOrgAbteilungen:function(orgId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      return org?org.abteilungen||[]:[];
    },
    createAbteilung:function(orgId,name,farbe,gewerke){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return null;
      if(!org.abteilungen)org.abteilungen=[];
      var abt={id:'abt_'+Date.now(),name:name,farbe:farbe||'#6b7280',gewerke:gewerke||[],leiter:null};
      org.abteilungen.push(abt);
      w.GemaAuth.saveOrgs(orgs);
      return abt;
    },
    removeAbteilung:function(orgId,abtId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return;
      org.abteilungen=(org.abteilungen||[]).filter(function(a){return a.id!==abtId;});
      // User in dieser Abteilung: abteilungId auf null setzen
      var users=_getUsers()||[];
      users.forEach(function(u){if(u.orgId===orgId&&u.abteilungId===abtId)u.abteilungId=null;});
      w.GemaAuth.saveOrgs(orgs);w.GemaAuth.saveUsers(users);
    },
    setUserAbteilung:function(userId,abtId){
      var users=_getUsers()||[];
      var idx=users.findIndex(function(u){return u.id===userId;});
      if(idx<0)return false;
      users[idx].abteilungId=abtId;
      return w.GemaAuth.saveUsers(users);
    },
    ernennOrgAdmin:function(orgId,userId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return;
      if(!org.admins)org.admins=[];
      if(org.admins.indexOf(userId)<0)org.admins.push(userId);
      w.GemaAuth.saveOrgs(orgs);
    },
    entferneOrgAdmin:function(orgId,userId){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return;
      org.admins=(org.admins||[]).filter(function(id){return id!==userId;});
      w.GemaAuth.saveOrgs(orgs);
    },
    updateOrgSettings:function(orgId,settings){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return false;
      org.settings=Object.assign(org.settings||{},settings);
      return w.GemaAuth.saveOrgs(orgs);
    },
    updateOrgInfo:function(orgId,info){
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return false;
      Object.keys(info).forEach(function(k){org[k]=info[k];});
      // Kategorie <-> Kategorien synchron halten: wenn der Aufrufer nur
      // das Einzel-Feld setzt (Legacy), spiegeln wir es in das Array,
      // damit alle Konsumenten (Multi-Kategorie-Filter) konsistent
      // bleiben. Wenn der Aufrufer kategorien explizit setzt, ist das
      // die Quelle der Wahrheit und kategorie wird aufs erste Element
      // aktualisiert.
      if(info.kategorien && info.kategorien.length){
        org.kategorie = info.kategorien[0];
      } else if(info.kategorie !== undefined){
        org.kategorien = info.kategorie ? [info.kategorie] : [];
      }
      return w.GemaAuth.saveOrgs(orgs);
    },
    // Generischer Patch: setzt beliebige Top-Level-Felder einer Org und
    // persistiert per-Record in die Cloud (saveOrgs aktualisiert auch den
    // In-Memory-Spiegel, sonst saehe getCurrentOrg die Aenderung nicht).
    // Genutzt u.a. fuer org.spengler_templates (Dachbericht-Vorlagen) und
    // org.lizenzen. WICHTIG: NICHT durch einen direkten localStorage-Write
    // ersetzen — der wuerde vom In-Memory-Spiegel ueberschattet.
    updateOrg:function(orgId,patch){
      if(!patch) return false;
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      if(!org)return false;
      Object.keys(patch).forEach(function(k){org[k]=patch[k];});
      return w.GemaAuth.saveOrgs(orgs);
    },

    // ── Gastzugang ──
    requestGastZugang:function(userId,orgId){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user)return null;
      if(!user.gastZugaenge)user.gastZugaenge=[];
      var orgs=_getOrgs()||[];
      var org=orgs.find(function(o){return o.id===orgId;});
      var gast={orgId:orgId,orgName:org?org.name:'',status:'angefragt',gueltigBis:null,erstelltAm:new Date().toISOString(),bewilligtVon:null};
      user.gastZugaenge.push(gast);
      w.GemaAuth.saveUsers(users);
      return gast;
    },
    bewilligeGast:function(userId,orgId,gueltigBis,bewilligtVon){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return;
      var g=user.gastZugaenge.find(function(x){return x.orgId===orgId;});
      if(g){g.status='aktiv';g.gueltigBis=gueltigBis||null;g.bewilligtVon=bewilligtVon||'';}
      w.GemaAuth.saveUsers(users);
    },
    deaktivierGast:function(userId,orgId){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return;
      var g=user.gastZugaenge.find(function(x){return x.orgId===orgId;});
      if(g)g.status='deaktiviert';
      w.GemaAuth.saveUsers(users);
    },
    getGastOrgs:function(userId){
      // Alle Orgs wo dieser User aktiver Gast ist
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return[];
      var heute=new Date().toISOString().split('T')[0];
      return user.gastZugaenge.filter(function(g){
        return g.status==='aktiv'&&(!g.gueltigBis||g.gueltigBis>=heute);
      });
    },

    updateProfile:function(userId,profile){
      var users=_getUsers()||[];
      var idx=users.findIndex(function(u){return u.id===userId;});
      if(idx<0)return false;
      users[idx].profile=Object.assign(users[idx].profile||{},profile);
      return w.GemaAuth.saveUsers(users);
    },
    updateOrgLogo:function(orgId,base64){
      var orgs=_getOrgs()||[];
      var idx=orgs.findIndex(function(o){return o.id===orgId;});
      if(idx<0)return false;
      orgs[idx].logo=base64;
      return w.GemaAuth.saveOrgs(orgs);
    },

    defaultRoles:DEFAULT_ROLES,
    defaultModules:MODULES,
    isAdmin:function(){var u=w.GemaAuth.getCurrentUser();return _isAdmin(u);},
  };
})(window);
