/**
 * gema_auth.js — GEMA Auth & Rollenverwaltung v2
 * Multi-Tenant: Unternehmen → Benutzer → Rollen → Berechtigungen
 * Profil-Einstellungen, Logo-Swap, zentrale Auth für alle Module.
 */
/* ─────────────────────────────────────────────────────────────────
   SICHERHEITSNETZ: dynamisch erzeugte Datei-Dialoge (iOS)

   Ein per document.createElement('input') erzeugter File-Input, der NICHT
   im DOM haengt, wird von WebKit weggeraeumt, waehrend der Auswahl-Dialog
   offen ist — sein change-Event feuert danach NIE. Symptom auf dem iPad:
   «man waehlt ein Foto aus der Mediathek und es passiert einfach nichts»,
   waehrend die Kamera-Aufnahme zufaellig funktioniert (die Seite bleibt
   dabei eher im Speicher; der Fotos-Picker laeuft als eigener Prozess und
   ist laenger offen).

   Der Patch haengt einen losgeloesten File-Input unsichtbar in den Body,
   BEVOR der Dialog aufgeht, und raeumt ihn danach wieder ab. Inputs, die
   der Aufrufer selbst korrekt einhaengt, bleiben unberuehrt.

   gema_auth.js ist die einzige Datei, die auf JEDER Modulseite liegt —
   darum steht das Netz hier. Neue Datei-Dialoge sollen den Input trotzdem
   selbst einhaengen; das hier faengt nur ab, was vergessen geht.
   ───────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (typeof HTMLInputElement === 'undefined') return;
  var proto = HTMLInputElement.prototype;
  if (proto.__gemaFileClickFix) return;   // idempotent (SW-Reload, doppeltes Script)
  var nativeClick = proto.click;
  proto.click = function () {
    var el = this;
    if (el.type !== 'file' || el.isConnected || !document.body) return nativeClick.call(el);
    el.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(el);
    var weg = function () {
      if (el.parentNode) { try { el.parentNode.removeChild(el); } catch (e) { } }
    };
    // Nach der Auswahl abraeumen — und auch dann, wenn der Nutzer abbricht
    // (kein change-Event): der naechste Fokus auf dem Fenster raeumt auf.
    el.addEventListener('change', function () { setTimeout(weg, 0); }, { once: true });
    window.addEventListener('focus', function () { setTimeout(weg, 2000); }, { once: true });
    return nativeClick.call(el);
  };
  proto.__gemaFileClickFix = true;
})();

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
  // Mergt DEFAULTS rein: System-Eintraege (DEFAULT_ROLES, DEFAULT_ORGS),
  // deren ID NICHT in der Cloud existiert, bleiben lokal erhalten.
  // Cloud-Versionen einer ID gewinnen (Override moeglich). Fuer BENUTZER
  // gibt es bewusst keine Defaults.
  function _loadCollectionFromCloud(storageKey){
    var def = _COLL[storageKey];
    if(!def || !_S()) return Promise.resolve(null);
    return _S().loadCollection('auth', def.prefix).then(function(rows){
      var cloudArr = (rows||[]).map(function(r){ return r.data; })
                                .filter(function(d){ return d && d[def.idField]; });
      // GEMA Secure v1 — Guard: Unter RLS liefert ein Read OHNE gueltiges
      // Token eine LEERE Liste (HTTP 200). Ein leeres Ergebnis darf einen
      // gefuellten lokalen Cache nie ueberschreiben — sonst verschwinden
      // User/Orgs/Rollen aus der UI, bis neu eingeloggt wird.
      if(!cloudArr.length){
        var local = null;
        try{ local = JSON.parse(_readCache(storageKey) || 'null'); }catch(e){}
        if(Array.isArray(local) && local.length){
          console.warn('[GemaAuth] Cloud-Read fuer ' + storageKey + ' leer (kein Token?) — lokaler Cache bleibt');
          return local;
        }
      }
      var merged = _mergeWithDefaults(storageKey, cloudArr);
      _writeLocalCache(storageKey, merged);
      return merged;
    });
  }

  // Mergt Cloud-Daten mit den lokalen DEFAULTS. Cloud-IDs gewinnen;
  // DEFAULT-IDs, die NICHT in der Cloud sind, werden lokal ergaenzt.
  function _mergeWithDefaults(storageKey, cloudArr){
    cloudArr = Array.isArray(cloudArr) ? cloudArr.slice() : [];
    // Benutzer haben KEINE Defaults (siehe oben) — sie kommen ausschliesslich
    // aus der Cloud bzw. über die gema-auth-Function.
    var defaults = storageKey === STORAGE_ROLES ? DEFAULT_ROLES
                : storageKey === STORAGE_ORGS  ? DEFAULT_ORGS
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
  // Liefert IMMER ein Ergebnis-Objekt {ok, error, denied} — nie eine
  // Rejection (viele Aufrufer ignorieren den Rueckgabewert; eine Rejection
  // waere ein unhandled promise rejection). Aufrufer, die dem Benutzer eine
  // Rueckmeldung geben (sys_admin), pruefen .ok — siehe saveUsers/saveOrgs/
  // saveRoles, die dieses Promise durchreichen.
  function _persistCollection(storageKey, newArr){
    var def = _COLL[storageKey];
    if(!def) return Promise.resolve({ ok:false, error:'Unbekannte Collection' });
    if(!_S()){
      console.warn('[GemaAuth] gema_sync.js fehlt — Save blockiert');
      var e0 = { ok:false, error:'Speicher-Modul nicht geladen (gema_sync.js fehlt).' };
      _showSaveAlert(e0);
      return Promise.resolve(e0);
    }
    if(!_S().isReachable()){
      // Probe einmal aktiv — vielleicht ist die Verbindung wieder da
      return _S().probe().then(function(reachable){
        if(!reachable){
          var e1 = { ok:false, error:'Keine Verbindung zur Cloud.', offline:true };
          _showSaveAlert(e1); return e1;
        }
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
        return { ok:true, res:res };
      })
      .catch(function(e){
        console.warn('[GemaAuth] Cloud-Save fehlgeschlagen ('+storageKey+'):', e && e.message);
        // In-Memory-Spiegel zuruecksetzen: der optimistische Stand oben darf
        // nach einem gescheiterten Save nicht als gespeichert gelten, sonst
        // zeigt die UI bis zum Reload eine Aenderung, die es nicht gibt.
        try{ _memCache[storageKey] = localStorage.getItem(storageKey) || '[]'; }catch(_e){}
        var out = {
          ok:false,
          // KRITISCH: den ECHTEN Grund durchreichen. Eine abgelehnte
          // Berechtigung (403 aus der gema-auth-Function, z.B. «role_admin
          // kann nur der GEMA-Admin vergeben») ist KEIN Verbindungsproblem —
          // frueher stand hier pauschal «Bitte Verbindung pruefen», und die
          // eigentliche Ursache war nirgends sichtbar.
          error: (e && e.message) || 'Speichern fehlgeschlagen',
          denied: !!(e && e.denied),
          offline: !(e && e.denied)
        };
        _showSaveAlert(out);
        return out;
      });
  }
  var _saveAlertShown = false;
  function _showSaveAlert(info){
    if(_saveAlertShown) return;
    _saveAlertShown = true;
    setTimeout(function(){ _saveAlertShown = false; }, 6000);
    var titel = (info && info.denied) ? 'Keine Berechtigung' : 'Nicht gespeichert';
    var text = (info && info.denied)
      ? ((info.error || 'Diese Aenderung ist nicht erlaubt.') + '\n\nDie Aenderung wurde NICHT gespeichert.')
      : ('Die Aenderung konnte nicht in der Cloud gespeichert werden'
         + (info && info.error ? ' (' + info.error + ')' : '')
         + '.\n\nBitte Verbindung pruefen und erneut versuchen.');
    if(typeof window !== 'undefined' && window.GemaDialog && window.GemaDialog.alert){
      window.GemaDialog.alert({ title: titel, message: text });
    } else if(typeof alert === 'function'){
      try{ alert(titel + ' — ' + text); }catch(e){}
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
    {key:'saugpumpe',               label:'Saugpumpe (Saughöhe)',      cat:'Sanitärberechnungen'},
    {key:'mischkreuz',              label:'Mischkreuz',                cat:'Sanitärberechnungen'},
    {key:'osmose',                  label:'Osmose',                    cat:'Sanitärberechnungen'},
    {key:'frischwasserstation',     label:'Frischwasserstation',       cat:'Sanitärberechnungen'},
    {key:'laengenausdehnung',       label:'Längenausdehnung',          cat:'Sanitärberechnungen'},
    {key:'thermische_solaranlage',  label:'Thermische Solaranlage',    cat:'Sanitärberechnungen'},
    {key:'warmwasser_sia385',       label:'Warmwasser SIA 385',        cat:'Sanitärberechnungen'},
    {key:'niederschlagsanfall',     label:'Niederschlagsanfall',       cat:'Sanitärberechnungen'},
    {key:'regenwasserrechner',      label:'Regenwasserrechner AWEL',   cat:'Sanitärberechnungen'},
    {key:'regenwasser_luzern',      label:'Regenwasser Luzern',        cat:'Sanitärberechnungen'},
    {key:'fettabscheider',          label:'Fettabscheider',            cat:'Sanitärberechnungen'},
    {key:'oelabscheider',           label:'Ölabscheider',              cat:'Sanitärberechnungen'},
    {key:'schlammsammler',          label:'Schlammsammler',            cat:'Sanitärberechnungen'},
    {key:'abwasserhebeanlage',      label:'Abwasserhebeanlage',        cat:'Sanitärberechnungen'},
    {key:'grundleitungen',          label:'Grundleitungen',            cat:'Sanitärberechnungen'},
    {key:'kreisprofil',             label:'Hydraulik Kreisprofil',     cat:'Sanitärberechnungen'},
    {key:'grobauslegung',           label:'Grobauslegung',             cat:'Sanitärberechnungen'},
    {key:'fluessiggas',             label:'Flüssiggas LPG',            cat:'Sanitärberechnungen'},
    {key:'druckverlust_erdgas',     label:'Druckverlust Erdgas',       cat:'Sanitärberechnungen'},
    {key:'druckverlust_medizinalgas', label:'Druckverlust Medizinalgase', cat:'Sanitärberechnungen'},
    {key:'vonroll_tabellen',        label:'Von Roll Tabellen',         cat:'Sanitärberechnungen'},
    {key:'ausdehnungsgefaess',      label:'Ausdehnungsgefäss HE301',   cat:'Heizungsberechnungen'},
    {key:'heizungsleitungen',       label:'Heizungsleitungen',         cat:'Heizungsberechnungen'},
    {key:'waermegruppen',           label:'Wärmegruppen SIA 384',      cat:'Heizungsberechnungen'},
    {key:'heizlast_verbrauch',      label:'Heizlast aus Verbrauch',    cat:'Heizungsberechnungen'},
    {key:'waermepumpe',             label:'Wärmepumpe / JAZ',          cat:'Heizungsberechnungen'},
    {key:'hx_diagramm',             label:'h,x-Diagramm',              cat:'Lüftungsberechnungen'},
    /* ── Elektroberechnungen (el_) ────────────────────────────────────────
       Hub el_index.html. Fachbasis für alle: gema_elektro.js.
       NEUES el_-Modul: Zeile hier ergänzen UND in FILE_MAP — dann laufen
       Permission-Gating und der Workspace-Picker automatisch mit. */
    {key:'spannungsfall',           label:'Spannungsfall & Verlustleistung', cat:'Elektroberechnungen'},
    {key:'belastbarkeit',           label:'Strombelastbarkeit',        cat:'Elektroberechnungen'},
    {key:'kurzschluss',             label:'Kurzschluss & Abschaltung', cat:'Elektroberechnungen'},
    {key:'poe',                     label:'PoE — Leistung & RP',       cat:'Elektroberechnungen'},
    {key:'leistungsbedarf',         label:'Anschlussleistung',         cat:'Elektroberechnungen'},
    {key:'beleuchtung',             label:'Beleuchtungsberechnung',    cat:'Elektroberechnungen'},
    {key:'potenzialausgleich',      label:'Potenzialausgleich',        cat:'Elektroberechnungen'},
    {key:'photovoltaik',            label:'Photovoltaik',              cat:'Elektroberechnungen'},
    {key:'elektroangaben',          label:'Elektroangaben HLKS',       cat:'Elektroberechnungen'},
    {key:'objekte',                 label:'Objekte & Beteiligte',      cat:'Projektmanagement'},
    {key:'terminplan',              label:'Terminplan',                cat:'Projektmanagement'},
    {key:'besprechungsprotokoll',   label:'Besprechungsprotokoll',     cat:'Projektmanagement'},
    {key:'kostenkontrolle',         label:'Kostenkontrolle',           cat:'Projektmanagement'},
    {key:'wirtschaftlichkeit',      label:'Wirtschaftlichkeitsrechnung', cat:'Projektmanagement'},
    {key:'goodel',                  label:'Goodel (Terminabstimmung)', cat:'Projektmanagement'},
    {key:'planungshonorar',         label:'Planungshonorar SIA 108',   cat:'Projektmanagement'},
    {key:'abnahme_sia',             label:'Abnahme SIA 118',           cat:'Projektmanagement'},
    {key:'baustellencheckliste',    label:'Baustellencheckliste',      cat:'Projektmanagement'},
    {key:'ausschreibungsunterlagen',label:'Ausschreibungsunterlagen',  cat:'Projektmanagement'},
    {key:'crbx_offertvergleich',    label:'CRBX Offertvergleich',      cat:'Projektmanagement'},
    {key:'schnellausschreibung',    label:'Schnellausschreibung',      cat:'Projektmanagement'},
    {key:'bestellungen',            label:'Bestellungen (Anlagen)',    cat:'Projektmanagement'},
    {key:'revisionsunterlagen',     label:'Revisionsunterlagen',       cat:'Projektmanagement'},
    {key:'behoerden_formulare',     label:'Behörden & Formulare',      cat:'Projektmanagement'},
    {key:'plaene',                  label:'Pläne einlesen',            cat:'Projektmanagement'},
    {key:'planablage',              label:'Plandialog',                cat:'Projektmanagement'},
    {key:'regierapport',            label:'Regierapporte',             cat:'Projektmanagement'},
    {key:'erp',                     label:'Offerten/Aufträge/Rechnungen', cat:'Projektmanagement'},
    {key:'einsatzplan',             label:'Termine',                   cat:'Projektmanagement'},
    {key:'pruefliste',              label:'Prüfliste',                 cat:'Projektmanagement'},
    {key:'stundenerfassung',        label:'Stundenerfassung',          cat:'Projektmanagement'},
    {key:'apparateliste',           label:'Apparateliste',             cat:'Projektmanagement'},
    {key:'machbarkeitsstudie',      label:'Machbarkeitsstudie',        cat:'Projektmanagement'},
    {key:'zustandsanalyse',         label:'Zustandsanalyse',           cat:'Projektmanagement'},
    {key:'lebensdauer',             label:'Lebensdauer-Katalog',       cat:'Projektmanagement'},
    {key:'berufsschule',            label:'Berufsschule',              cat:'Ausbildung'},
    {key:'sephir',                  label:'SEPHIR Handlungskompetenzen', cat:'Ausbildung'},
    {key:'quiz',                    label:'Quiz',                      cat:'Ausbildung'},
    {key:'klassen',                 label:'Klassen & Lernmittel',      cat:'Ausbildung'},
    {key:'pruefungen',              label:'Prüfungen (Schule)',        cat:'Ausbildung'},
    {key:'spuelmanager',            label:'Spülmanager',               cat:'Hygiene'},
    {key:'service',                 label:'Service & Wartung',         cat:'Hygiene'},
    {key:'w12',                     label:'Selbstkontrolle W12',       cat:'Hygiene'},
    {key:'legionellen',             label:'Hygienemanagement',         cat:'Hygiene'},
    {key:'werkzeugmanagement',      label:'Werkzeugmanagement',        cat:'Sonstiges'},
    {key:'fahrzeugmanagement',      label:'Fahrzeugmanagement',        cat:'Sonstiges'},
    {key:'vkf_formulare',           label:'VKF-Formulare',             cat:'Brandschutz'},
    {key:'gasloeschung',            label:'Gaslöschanlagen',           cat:'Brandschutz'},
    {key:'vkf_formular',            label:'VKF-Formular',              cat:'Brandschutz'},
    {key:'brandlast',               label:'Brandlast Fluchtweg',       cat:'Brandschutz'},
    {key:'schadensbericht',         label:'Schadensberichte',          cat:'Schadensdokumentation'},
    {key:'dachbericht',             label:'Dachinspektion',            cat:'Spenglerei'},
    {key:'trocknungsgeraete',       label:'Trocknungsgeräte',          cat:'Infrastruktur'},
    {key:'wareneingang',            label:'Wareneingang',              cat:'Infrastruktur'},
    {key:'arbeitskleider',          label:'Arbeitskleider',            cat:'Infrastruktur'},
    {key:'immobilien',              label:'Immobilienverwaltung',      cat:'Immobilien'},
    {key:'lieferant_dashboard',     label:'Lieferanten-Dashboard',     cat:'Lieferanten'},
    {key:'lieferantenverwaltung',   label:'Lieferantenverwaltung',     cat:'System'},
    {key:'produktkatalog',          label:'Produktkatalog',            cat:'System'},
    {key:'workspace',               label:'Workspace',                 cat:'System'},
    {key:'visitenkarte',            label:'GEMA Card',                 cat:'System'},
    {key:'kontakte',                label:'Kontaktbuch',               cat:'System'},
  ];

  // ── Filename → Modul-Key ──────────────────────────────────────────
  var FILE_MAP = {
    'sb_druckverlust':'druckverlust','sb_druckdispositiv':'druckdispositiv',
    'sb_lu_tabelle':'lu_tabelle','sb_ausstosszeiten':'ausstosszeiten',
    'sb_du_zusammenstellung':'du_zusammenstellung','sa_enthaertung':'enthaertungsanlage',
    'sb_druckerhoehung':'druckerhoehung','sb_zirkulation':'zirkulation','sb_druckanstieg':'druckanstieg','sb_saugpumpe':'saugpumpe','sb_mischkreuz':'mischkreuz','sb_fluessiggas':'fluessiggas','sb_druckverlust_erdgas':'druckverlust_erdgas','sb_druckverlust_medizinalgas':'druckverlust_medizinalgas','sa_osmose':'osmose',
    'sa_frischwasserstation':'frischwasserstation','sb_laengenausdehnung':'laengenausdehnung',
    'sa_solaranlage':'thermische_solaranlage','sb_warmwasser':'warmwasser_sia385',
    'sb_niederschlag':'niederschlagsanfall','sb_regenwasserrechner':'regenwasserrechner','sb_regenwasser_luzern':'regenwasser_luzern','sb_grundleitungen':'grundleitungen','sb_kreisprofil':'kreisprofil','sa_fettabscheider':'fettabscheider',
    'sa_oelabscheider':'oelabscheider','sa_schlammsammler':'schlammsammler',
    'sa_abwasserhebeanlage':'abwasserhebeanlage','hz_ausdehnungsgefaess':'ausdehnungsgefaess','hz_heizungsleitungen':'heizungsleitungen','hz_waermegruppen':'waermegruppen','hz_heizlast':'heizlast_verbrauch','hz_waermepumpe':'waermepumpe','lt_hx_diagramm':'hx_diagramm','pm_objekte':'objekte',
    'pm_terminplan':'terminplan','pm_besprechung':'besprechungsprotokoll',
    'pm_kostenkontrolle':'kostenkontrolle','pm_honorar':'planungshonorar',
    'pm_wirtschaftlichkeit':'wirtschaftlichkeit',
    'pm_abnahme':'abnahme_sia','pm_baustelle':'baustellencheckliste',
    'pm_ausschreibungsunterlagen':'ausschreibungsunterlagen','sb_apparateliste':'apparateliste',
    'pm_machbarkeitsstudie':'machbarkeitsstudie','pm_zustandsanalyse':'zustandsanalyse','pm_lebensdauer':'lebensdauer',
    'el_angaben':'elektroangaben',
    'el_spannungsfall':'spannungsfall','el_belastbarkeit':'belastbarkeit',
    'el_kurzschluss':'kurzschluss','el_leistungsbedarf':'leistungsbedarf',
    'el_beleuchtung':'beleuchtung','el_photovoltaik':'photovoltaik',
    'el_potenzialausgleich':'potenzialausgleich','el_poe':'poe',
    'ab_berufsschule':'berufsschule','hy_spuelmanager':'spuelmanager','hy_w12':'w12','hy_legionellen':'legionellen','sv_service':'service','pm_stunden':'stundenerfassung',
    'if_werkzeug':'werkzeugmanagement','if_fahrzeug':'fahrzeugmanagement',
    'br_vkf_formulare':'vkf_formulare','br_gasloeschung':'gasloeschung','br_vkf_formular':'vkf_formular','br_brandlast':'brandlast',
    'sb_grobauslegung':'grobauslegung','sb_vonroll':'vonroll_tabellen',
    'pm_goodel':'goodel','ab_sephir':'sephir','ab_quiz':'quiz',
    'ab_klassen':'klassen','ab_pruefungen':'pruefungen','ab_pruefung_live':'pruefungen',
    'sd_schadensbericht':'schadensbericht',
    'sp_dachbericht':'dachbericht',
    'if_trocknung':'trocknungsgeraete','if_wareneingang':'wareneingang','if_arbeitskleider':'arbeitskleider','iv_immobilien':'immobilien',
    'pm_crbx':'crbx_offertvergleich','pm_schnellausschreibung':'schnellausschreibung','pm_bestellungen':'bestellungen','pm_revisionsunterlagen':'revisionsunterlagen','pm_behoerden_formulare':'behoerden_formulare','pm_plaene':'plaene','pm_planablage':'planablage','pm_regierapport':'regierapport','pm_erp':'erp','pm_einsatzplan':'einsatzplan','pm_pruefliste':'pruefliste',
    'sys_lieferanten':'lieferantenverwaltung','sys_produktkatalog':'produktkatalog',
    'sys_lieferant_dashboard':'lieferant_dashboard',
    'sys_workspace':'workspace',
    // GEMA Card. sys_card.html steht BEWUSST nicht hier — die oeffentliche
    // Kartenseite bindet gema_auth.js gar nicht ein (Besucher haben kein
    // Login) und erkennt eine Session nur passiv aus dem localStorage.
    'sys_card_editor':'visitenkarte','sys_card_reports':'visitenkarte',
    'sys_kontakte':'kontakte',
  };

  // ── Schule: Berechnungs-Kategorien (Klassen-Freischaltung) ─────────
  // Module dieser Kategorien können Dozenten pro Klasse für Studierende
  // freischalten (harte Sperre, siehe _studentModAllowed weiter unten).
  var CALC_CATS=['Sanitärberechnungen','Heizungsberechnungen','Lüftungsberechnungen','Brandschutz'];

  // ── Lieferanten: Sortiment → Berechnungsmodule ────────────────────
  // Ein Lieferant soll die Berechnung sehen, fuer die er die Anlage
  // liefert — damit er selbst pruefen kann, ob die Auslegung zu seinem
  // Produkt passt. Schluessel = Produkt-/Firmenkategorie-ID (KATEGORIEN
  // bzw. LIEF_KATEGORIEN in gema_produktkatalog_api.js, Alt-IDs via
  // _liefNormKat), Wert = Liste der MODULES-Keys.
  //
  // Diese Map lebt BEWUSST hier und nicht im Produktkatalog: gema_auth.js
  // ist auf JEDER Seite geladen und muss synchron entscheiden koennen —
  // gema_produktkatalog_api.js ist es nicht. Konsumenten lesen sie ueber
  // GemaAuth.getLieferantKatModule().
  //
  // BEI EINER NEUEN ANLAGEN-KATEGORIE HIER NACHFUEHREN — sonst bekommt
  // der Lieferant die zugehoerige Berechnung nie zu sehen.
  var LIEF_KAT_MODUL = {
    enthaertung:           ['enthaertungsanlage'],
    osmose:                ['osmose'],
    druckerhoehung:        ['druckerhoehung'],
    zirkulation:           ['zirkulation'],
    zirkulationspumpe:     ['zirkulation'],
    saugpumpe:             ['saugpumpe'],
    sicherheitsventil:     ['druckanstieg'],
    ausdehnungsgefaess:    ['ausdehnungsgefaess'],
    heizungspumpe:         ['heizungsleitungen'],
    // Waermeerzeuger speisen drei Auslegungen (Leistung, Heizlast, JAZ)
    waermeerzeuger:        ['waermegruppen','heizlast_verbrauch','waermepumpe'],
    lueftungsgeraet:       ['hx_diagramm'],
    fluessiggasanlage:     ['fluessiggas'],
    gasloeschanlage:       ['gasloeschung'],
    fettabscheider:        ['fettabscheider'],
    oelabscheider:         ['oelabscheider'],
    schlammsammler:        ['schlammsammler'],
    hebeanlage:            ['abwasserhebeanlage'],
    frischwasserstation:   ['frischwasserstation'],
    thermische_solaranlage:['thermische_solaranlage'],
    warmwasser_boiler:     ['warmwasser_sia385'],
    // Rohre/Armaturen fliessen als Rechenwerte in die Druckberechnungen
    rohrsysteme:           ['druckverlust','druckanstieg'],
    rohrsystem:            ['druckverlust','druckanstieg'],
    armaturen:             ['druckverlust'],
    'formstücke':          ['druckverlust']
    // werkzeuge / elektropruefung / leiterpruefung / servicepruefung /
    // fahrzeuge haben bewusst KEINE Berechnung (Werkzeug-/Fahrzeugsicht).
  };
  // Alt-IDs der Firmenprofil-Kategorien (Spiegel von normKatId im Katalog)
  var _LIEF_KAT_ALIAS={abwasserhebeanlage:'hebeanlage',solaranlage:'thermische_solaranlage'};
  function _liefNormKat(id){var k=String(id||'');return _LIEF_KAT_ALIAS[k]||k;}

  var _calcKeysMemo=null;
  function _calcKeySet(){
    if(_calcKeysMemo)return _calcKeysMemo;
    _calcKeysMemo={};
    MODULES.forEach(function(m){if(CALC_CATS.indexOf(m.cat)>=0)_calcKeysMemo[m.key]=1;});
    return _calcKeysMemo;
  }

  // ── Hash ───────────────────────────────────────────────────────────
  // NUR Transportformat fuer Passwort-Aenderungen: sys_admin/sys_profil
  // legen den Wert als user.password in den persist_auth-Payload, die
  // gema-auth-Function erkennt ihn (looksLikeDjb2), speichert scrypt im
  // geschuetzten cred:-Record und entfernt das Feld aus dem User.
  // Im Client wird NIE ein Passwort verglichen (kein Client-Login mehr).
  function _hash(str) {
    var h=5381;for(var i=0;i<str.length;i++){h=((h<<5)+h)+str.charCodeAt(i);h=h&0xffffffff;}
    return 'gh_'+Math.abs(h).toString(16)+'_'+str.length;
  }

  // ── Default Permissions ────────────────────────────────────────────
  function _allPerms(r,wr,a){var p={};MODULES.forEach(function(m){p[m.key]={read:!!r,write:!!wr,admin:!!a};});return p;}
  function _somePerms(keys,r,wr,a){var p=_allPerms(false,false,false);keys.forEach(function(k){p[k]={read:!!r,write:!!wr,admin:!!a};});return p;}

  var DEFAULT_ROLES = [
    {id:'role_admin',name:'Administrator',color:'#1d4ed8',permissions:_allPerms(true,true,true)},
    {id:'role_planer',name:'Sanitärplaner',color:'#16a34a',gewerke:['sanitaer'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};p['lieferant_dashboard']={read:false,write:false,admin:false};return p;})()},
    {id:'role_hlkk_planer',name:'Heizungsplaner',color:'#dc2626',gewerke:['hlkk'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};p['lieferant_dashboard']={read:false,write:false,admin:false};return p;})()},
    {id:'role_lueftung_planer',name:'Lüftungsplaner',color:'#2563eb',gewerke:['lueftung'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};p['lieferant_dashboard']={read:false,write:false,admin:false};return p;})()},
    {id:'role_elektro_planer',name:'Elektroplaner',color:'#d97706',gewerke:['elektro'],permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:false,admin:false};p['objekte']={read:true,write:true,admin:true};p['lieferant_dashboard']={read:false,write:false,admin:false};return p;})()},
    {id:'role_spengler',name:'Spengler',color:'#0891b2',gewerke:['spenglerei'],permissions:(function(){var p=_somePerms(['dachbericht','objekte','baustellencheckliste','werkzeugmanagement'],true,true,false);p['goodel']={read:true,write:true,admin:false};p['dachbericht']={read:true,write:true,admin:true};p['objekte']={read:true,write:true,admin:true};p['regierapport']={read:true,write:true,admin:false};p['einsatzplan']={read:true,write:false,admin:false};p['abnahme_sia']={read:true,write:false,admin:false};p['stundenerfassung']={read:true,write:true,admin:false};p['arbeitskleider']={read:true,write:false,admin:false};p['planablage']={read:true,write:false,admin:false};return p;})()},
    {id:'role_architekt',name:'Architekt / GP',color:'#7c3aed',permissions:(function(){var p=_somePerms(['terminplan','besprechungsprotokoll','objekte','abnahme_sia'],true,false,false);p['goodel']={read:true,write:true,admin:false};p['regierapport']={read:true,write:true,admin:false};p['revisionsunterlagen']={read:true,write:false,admin:false};p['behoerden_formulare']={read:true,write:true,admin:false};p['plaene']={read:true,write:true,admin:false};p['planablage']={read:true,write:true,admin:false};return p;})()},
    {id:'role_unternehmer',name:'Unternehmer',color:'#d97706',permissions:(function(){var p=_somePerms(['terminplan','abnahme_sia','werkzeugmanagement','baustellencheckliste','ausschreibungsunterlagen','crbx_offertvergleich','schnellausschreibung','bestellungen'],true,true,false);p['goodel']={read:true,write:true,admin:false};p['legionellen']={read:true,write:true,admin:false};p['spuelmanager']={read:true,write:true,admin:false};p['revisionsunterlagen']={read:true,write:true,admin:false};p['immobilien']={read:true,write:true,admin:false};p['erp']={read:true,write:true,admin:false};p['planablage']={read:true,write:true,admin:false};return p;})()},
    // ── Lieferanten-Rollen: ZWEI Typen (User-Entscheid) ──
    // ANLAGENLIEFERANT (role_lieferant*): liefert Anlagen fuer die
    // Berechnungsmodule (Enthaertung, Druckerhoehung, Osmose, …) —
    // mit Verifizierungs-Workflow.
    // PRODUKTLIEFERANT (role_produktlieferant*): liefert Werkzeuge/
    // Maschinen fuers Werkzeugmanagement — KEINE Verifizierung.
    // Beide kombinierbar mit role_leiterpruefer (z.B. Produktlieferant,
    // der auch EKAS-Leiterpruefungen macht).
    {id:'role_lieferant',name:'Anlagenlieferant',color:'#16a34a',permissions:_somePerms(['ausschreibungsunterlagen','produktkatalog','lieferant_dashboard'],true,true,false)},
    // Unterrollen (feinere Rechte innerhalb einer Lieferanten-Org).
    // Der Org-Admin (role_lieferant_admin oder Legacy role_lieferant) vergibt
    // sie im Lieferanten-Dashboard. Die Modul-Permission gibt nur Dashboard-
    // Zugang frei; die FEINE Abgrenzung (erfassen/verifizieren/Offerten)
    // passiert im Dashboard via roleId-Helfer.
    {id:'role_lieferant_admin',   name:'Anlagenlieferant · Admin',         color:'#15803d', permissions:_somePerms(['ausschreibungsunterlagen','produktkatalog','lieferant_dashboard'],true,true,false)},
    {id:'role_lieferant_produkte',name:'Anlagenlieferant · Produktpflege', color:'#16a34a', permissions:_somePerms(['produktkatalog','lieferant_dashboard'],true,true,false)},
    {id:'role_lieferant_verify',  name:'Anlagenlieferant · Verifizierung', color:'#0891b2', permissions:_somePerms(['produktkatalog','lieferant_dashboard'],true,true,false)},
    {id:'role_lieferant_offerten',name:'Anlagenlieferant · Offerten',      color:'#7c3aed', permissions:_somePerms(['ausschreibungsunterlagen','produktkatalog','lieferant_dashboard'],true,true,false)},
    {id:'role_lieferant_intern',  name:'Anlagenlieferant · Intern (nur Lesen)', color:'#64748b', permissions:_somePerms(['produktkatalog','lieferant_dashboard'],true,false,false)},
    // Produktlieferant (Werkzeugmanagement) — keine Verifizierungs-Unterrolle
    {id:'role_produktlieferant_admin',   name:'Produktlieferant · Admin',         color:'#b45309', permissions:_somePerms(['produktkatalog','lieferant_dashboard'],true,true,false)},
    {id:'role_produktlieferant_produkte',name:'Produktlieferant · Produktpflege', color:'#d97706', permissions:_somePerms(['produktkatalog','lieferant_dashboard'],true,true,false)},
    {id:'role_produktlieferant_offerten',name:'Produktlieferant · Offerten',      color:'#9333ea', permissions:_somePerms(['produktkatalog','lieferant_dashboard'],true,true,false)},
    {id:'role_produktlieferant_intern',  name:'Produktlieferant · Intern (nur Lesen)', color:'#64748b', permissions:_somePerms(['produktkatalog','lieferant_dashboard'],true,false,false)},
    {id:'role_pruefer',name:'Prüfer',color:'#0891b2',permissions:_somePerms(['werkzeugmanagement','fahrzeugmanagement','lieferant_dashboard'],true,true,false)},
    // Leiternpruefer (EKAS): externe Fachperson fuer Leiterpruefungen.
    // Kombinierbar mit Produktlieferant-Rollen (derselbe Account kann
    // Werkzeuge liefern UND Leitern pruefen).
    {id:'role_leiterpruefer',name:'Leiternprüfer (EKAS)',color:'#0e7490',permissions:_somePerms(['werkzeugmanagement','lieferant_dashboard'],true,true,false)},
    // Garagist: externe Werkstatt mit eigener Org. Kunden-Firmen verknuepfen
    // einzelne Fahrzeuge mit dem Garagist-Account. Sieht nur diese Fahrzeuge,
    // darf km, Service, MFK, Reifen pflegen und Service-Historie ergaenzen.
    // Kaufbelege, Tankkarten und (per Default) Versicherungsdaten bleiben
    // verborgen — Versicherung kann pro Fahrzeug freigeschaltet werden.
    {id:'role_garagist',name:'Garagist',color:'#0d9488',permissions:_somePerms(['fahrzeugmanagement'],true,true,false)},
    // Magaziner: verwaltet das Werkzeuglager einer Organisation. Darf
    // Attribute aendern, Berichte hinzufuegen, Pruefungen anfordern und
    // Werkzeug Personen zuweisen. Sieht nur Werkzeuge der eigenen Org.
    {id:'role_magaziner',name:'Magaziner',color:'#ea580c',permissions:(function(){var p=_somePerms(['werkzeugmanagement','fahrzeugmanagement'],true,true,true);p['goodel']={read:true,write:true,admin:false};p['trocknungsgeraete']={read:true,write:true,admin:true};p['einsatzplan']={read:true,write:true,admin:false};p['spuelmanager']={read:true,write:true,admin:false};p['service']={read:true,write:true,admin:false};p['stundenerfassung']={read:true,write:true,admin:false};p['arbeitskleider']={read:true,write:true,admin:true};return p;})()},
    // Lagerist: nimmt Sanitärapparate/Material im Wareneingang an — bestellte
    // Lieferungen importieren (HTML/PDF), Wareneingang kontrollieren (was ist
    // angekommen), Regal-Etiketten drucken. Sieht Projekte (Objekte) zum
    // Zuordnen der Lieferadresse. Zielperson im Alltag laut Handoff ist der
    // Projektleiter — die Planer-Rollen erhalten den Zugriff automatisch über
    // _allPerms, der Lagerist ist die dedizierte Lager-Rolle.
    {id:'role_lagerist',name:'Lagerist',color:'#4d7c0f',permissions:(function(){var p=_somePerms(['objekte'],true,true,false);p['wareneingang']={read:true,write:true,admin:true};return p;})()},
    // Immobilienverwalter: verwaltet Liegenschaften/Wohnungen/Mietverhaeltnisse
    // und vergibt Handwerker-Auftraege (iv_immobilien). spuelmanager r/w fuer
    // die Leerwohnungs-Spuelregimes (Protokoll einsehen, Objekte pflegen).
    {id:'role_immoverwalter',name:'Immobilienverwalter',color:'#4338ca',permissions:(function(){var p=_somePerms(['immobilien'],true,true,true);p['spuelmanager']={read:true,write:true,admin:false};return p;})()},
    // Monteur: Read-only-Zugriff aufs Werkzeuglager. Kann Defekte melden,
    // aber nichts selbst aendern oder zuweisen. Sieht Werkzeuge der
    // eigenen Organisation.
    {id:'role_monteur',name:'Monteur',color:'#64748b',permissions:(function(){var p=_somePerms(['werkzeugmanagement','baustellencheckliste'],true,false,false);p['goodel']={read:true,write:true,admin:false};p['schadensbericht']={read:true,write:true,admin:false};p['trocknungsgeraete']={read:true,write:false,admin:false};p['regierapport']={read:true,write:true,admin:false};p['objekte']={read:true,write:false,admin:false};p['einsatzplan']={read:true,write:false,admin:false};p['abnahme_sia']={read:true,write:false,admin:false};p['legionellen']={read:true,write:true,admin:false};p['spuelmanager']={read:true,write:true,admin:false};p['service']={read:true,write:true,admin:false};p['stundenerfassung']={read:true,write:true,admin:false};p['arbeitskleider']={read:true,write:false,admin:false};p['planablage']={read:true,write:false,admin:false};return p;})()},
    {id:'role_abteilungsleiter',name:'Abteilungsleiter',color:'#6d28d9',permissions:(function(){var p=_allPerms(true,true,false);p['werkzeugmanagement']={read:true,write:true,admin:false};p['objekte']={read:true,write:true,admin:true};p['lieferant_dashboard']={read:false,write:false,admin:false};return p;})()},
    {id:'role_bauherrschaft',name:'Bauherrschaft',color:'#0284c7',permissions:(function(){var p=_somePerms(['objekte','terminplan','kostenkontrolle','besprechungsprotokoll','abnahme_sia'],true,false,false);p['goodel']={read:true,write:true,admin:false};p['regierapport']={read:true,write:true,admin:false};p['revisionsunterlagen']={read:true,write:false,admin:false};p['planablage']={read:true,write:false,admin:false};return p;})()},
    {id:'role_behoerde',name:'Behörde',color:'#475569',permissions:_somePerms(['w12','objekte','legionellen'],true,false,false)},
    // ── Schule (Org-Kategorie 'schule') ──
    // Dozent: Klassen-/Prüfungs-Cockpit (admin) + alle Berechnungsmodule
    // (Unterricht/Vorbereitung) + Objekte für Übungsprojekte.
    {id:'role_dozent',name:'Dozent',color:'#0f766e',permissions:(function(){
      var p=_allPerms(false,false,false);
      MODULES.forEach(function(m){if(CALC_CATS.indexOf(m.cat)>=0)p[m.key]={read:true,write:true,admin:false};});
      ['klassen','pruefungen'].forEach(function(k){p[k]={read:true,write:true,admin:true};});
      ['quiz','berufsschule','sephir'].forEach(function(k){p[k]={read:true,write:true,admin:false};});
      p['objekte']={read:true,write:true,admin:false};
      return p;})()},
    // Studierende: Klassen-Portal + Prüfungen + WORKSPACE (Landing seit
    // 08/2026 — dort liegen die auto-provisionierten Klassen-/Übungs-Eimer,
    // eigene/private Eimer sind erwünscht). Berechnungsmodule
    // ausschliesslich über die Klassen-Freischaltung des Dozenten
    // (harte Sperre — _studentModAllowed prüft den Klassen-Cache).
    // Eigene Prüfungs-Abgaben schreiben sie als eigene sabg:-Records,
    // dafür braucht es KEIN write auf 'pruefungen'.
    {id:'role_student',name:'Studierende',color:'#0ea5e9',permissions:(function(){
      var p=_somePerms(['klassen','pruefungen'],true,false,false);
      p['quiz']={read:true,write:true,admin:false};
      p['workspace']={read:true,write:true,admin:false};
      return p;})()},
    // ── GEMA Card: Gratis-Konto ──
    // Entsteht beim Erstellen einer Karte bzw. beim Uebernehmen eines
    // Schattenprofils (UMSETZUNG_GEMA_Card.md §0.3: «Karte erstellen =
    // Free-Account erstellen»). Darf NUR die eigene Karte, das Kontaktbuch
    // und die Projekte lesen, in denen die Person als Beteiligte gefuehrt
    // wird — keine Fachmodule, keine eigenen Projekte (objekte ist bewusst
    // read-only, das ist der Upsell-Punkt). Die Fachmodul-Kacheln bleiben
    // auf index.html sichtbar, aber gesperrt (Wert zeigen statt verstecken).
    {id:'role_free',name:'GEMA Card (gratis)',color:'#0891b2',permissions:(function(){
      var p=_somePerms(['visitenkarte','kontakte'],true,true,true);
      p['objekte']={read:true,write:false,admin:false};
      return p;})()},
  ];

  // ── GEMA Card: gehört zur PERSON, nicht zum Gewerk ────────────────
  // Die eigene Kontaktkarte und das Kontaktbuch soll JEDES Login haben —
  // gerade der Monteur auf der Baustelle tauscht Kontakte. Die Fach-Rollen
  // oben bauen ihre Rechte teils mit _somePerms auf; die neuen Modul-Keys
  // stünden dort sonst auf «kein Zugriff». Ein Admin kann den Zugriff im
  // Rolleneditor weiterhin entziehen: _mergeWithDefaults ergänzt beim
  // Cloud-Load nur FEHLENDE Keys und überschreibt nie einen gespeicherten
  // Wert — eine bewusste Entziehung bleibt also bestehen.
  DEFAULT_ROLES.forEach(function(r){
    // AUSNAHME Studierende (User-Entscheid 08/2026): GEMA Card ist für
    // Studierenden-Konten NICHT verfügbar — weder Karte noch Kontaktbuch,
    // auch nicht in den Einstellungen sichtbar (sys_profil gated die
    // QR-Karte auf can('read','visitenkarte'), das Notify-Panel über
    // MODUL_ZUGRIFF). Serverseitig lehnt card-api role_student zusätzlich
    // hart ab (Defense-in-Depth — die UI-Sperre allein wäre umgehbar).
    if(r.id==='role_student'){
      r.permissions['visitenkarte']={read:false,write:false,admin:false};
      r.permissions['kontakte']={read:false,write:false,admin:false};
      return;
    }
    ['visitenkarte','kontakte'].forEach(function(k){
      var p=r.permissions&&r.permissions[k];
      if(!p||(!p.read&&!p.write))r.permissions[k]={read:true,write:true,admin:false};
    });
  });

  // ── Default Org + User ─────────────────────────────────────────────
  var DEFAULT_ORGS = [{
    id:'org_default', name:'GEMA', logo:null, kategorie:'sanitaerplaner', kategorien:['sanitaerplaner','heizungsplaner','lueftungsplaner'],
    rechtsform:'GmbH',
    adresse:{strasse:'',plz:'',ort:'',kanton:'',land:'CH'},
    kontakt:{email:'',telefon:'',website:''},
    settings:{waehrung:'CHF',land:'CH',sichtbarkeit:'organisation',abteilungenAktiv:false},
    abteilungen:[],
    lizenzen:{typ:'pool',maxUser:50,aktiveUser:1,aboStart:'2025-01-01',aboEnde:'2030-12-31',gewerke:['sanitaer','hlkk','lueftung','elektro']},
    admins:[],                 // kein Default-Benutzer mehr (s. unten)
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
    {id:'schule',               name:'Schule / Bildungsinstitution', icon:'🎓', gruppe:'andere'},
    {id:'sonstiges',            name:'Sonstiges',              icon:'📦', gruppe:'andere'}
  ];

  // ── Firmen-Kategorie → erlaubte Mitarbeiter-Rollen (User-Entscheid) ──
  // Die Kategorie der Firma bestimmt STRIKT, welche Rollen ihren Usern
  // zugewiesen werden koennen (sys_admin filtert die Rollen-Checkboxen).
  // null = alle Rollen erlaubt (Fallback fuer 'sonstiges' / ohne Kategorie).
  // role_admin wird separat behandelt (nur Super-Admin vergibt sie).
  var KATEGORIE_ROLLEN = {
    sanitaerplaner:       ['role_planer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur','role_spengler'],
    heizungsplaner:       ['role_hlkk_planer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    lueftungsplaner:      ['role_lueftung_planer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    elektroplaner:        ['role_elektro_planer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    sanitaerinstallateur: ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur','role_spengler'],
    heizungsinstallateur: ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    lueftungsinstallateur:['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    elektroinstallateur:  ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    klima_kaeltetechnik:  ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    msr_gebaeudeautomation:['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    brandschutz:          ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    aufzugsbau:           ['role_unternehmer','role_abteilungsleiter','role_magaziner','role_lagerist','role_monteur'],
    architekt:            ['role_architekt'],
    bauherr:              ['role_bauherrschaft'],
    generalunternehmer:   ['role_unternehmer','role_architekt'],
    lieferant:            ['role_lieferant','role_lieferant_admin','role_lieferant_produkte','role_lieferant_verify','role_lieferant_offerten','role_lieferant_intern','role_pruefer'],
    produktlieferant:     ['role_produktlieferant_admin','role_produktlieferant_produkte','role_produktlieferant_offerten','role_produktlieferant_intern','role_leiterpruefer','role_pruefer'],
    garagist:             ['role_garagist'],
    immobilien:           ['role_immoverwalter','role_bauherrschaft'],
    behoerde:             ['role_behoerde'],
    schule:               ['role_dozent','role_student'],
    sonstiges:            null
  };

  // Default-Kategorien einer (System-)Rolle = alle Kategorien, in deren
  // KATEGORIE_ROLLEN-Liste die Rolle vorkommt. Dient als Startwert, solange
  // die Rolle KEIN eigenes `kategorien`-Feld traegt (rueckwaertskompatibel).
  function _defaultKatsForRole(roleId){
    var out=[];
    Object.keys(KATEGORIE_ROLLEN).forEach(function(cat){
      var list=KATEGORIE_ROLLEN[cat];
      if(Array.isArray(list) && list.indexOf(roleId)>=0) out.push(cat);
    });
    return out;
  }
  // Wirksame Kategorien einer Rolle: das gespeicherte `kategorien`-Array
  // (Admin-editierbar, autoritativ) ODER — falls (noch) nicht gesetzt — die
  // Default-Ableitung aus KATEGORIE_ROLLEN. So braucht es KEINE Migration:
  // eine unveraenderte System-Rolle verhaelt sich exakt wie bisher, eine im
  // Rolleneditor bearbeitete Rolle folgt ihrer eigenen Auswahl.
  function _roleKats(role){
    if(!role) return [];
    return Array.isArray(role.kategorien) ? role.kategorien : _defaultKatsForRole(role.id);
  }

  // KEIN Default-Benutzer (Sicherheits-Bereinigung 27.07.2026).
  // Hier stand bis dahin ein fest eingebauter Administrator mit einem im
  // Quelltext lesbaren Passwort. Da gema_auth.js an jeden Browser
  // ausgeliefert wird, war diese Zugangsdatei öffentlich einsehbar — und
  // über den Legacy-Login-Pfad (greift, wenn die gema-auth-Function nicht
  // erreichbar ist) ein funktionierender Admin-Zugang.
  // Benutzer entstehen ausschliesslich über die Netlify-Function
  // `netlify/functions/gema-auth.js`: `register` (Erstinstallation, nur
  // solange GEMA_REGISTRATION_OPEN=1), `activate` (Einladung) und
  // `persist_auth` (Anlage durch einen Admin). Das Passwort liegt dabei
  // immer im geschützten `cred:`-Record, nie im Code.

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
    // ── Migration: Rolle role_lagerist (Wareneingang) ──
    // Lager-Rolle fuer das Wareneingangsmodul. Wird einmalig in bestehende
    // Installationen nachgezogen (_mergeWithDefaults deckt den Cloud-Pull ab,
    // diese lokale Nachziehung greift schon vor dem naechsten Pull).
    try {
      var MIGFLAG_LAGERIST='gema_auth_lagerist_v1';
      if(!localStorage.getItem(MIGFLAG_LAGERIST)){
        var rolesL=_getRoles()||[];
        if(!rolesL.find(function(r){return r.id==='role_lagerist';})){
          var defL=DEFAULT_ROLES.find(function(r){return r.id==='role_lagerist';});
          if(defL)rolesL.push(defL);
          _writeLocalCache(STORAGE_ROLES, rolesL);
        }
        try{localStorage.setItem(MIGFLAG_LAGERIST,'1');}catch(e){}
      }
    } catch(e) {}
    // ── Migration: Schule (role_dozent + role_student + Org-Kategorie) ──
    // Dozenten-/Klassen-Modul: Rollen und die Org-Kategorie 'schule'
    // einmalig in bestehende Installationen nachziehen.
    try {
      var MIGFLAG_SCHULE='gema_auth_schule_v1';
      if(!localStorage.getItem(MIGFLAG_SCHULE)){
        var rolesS=_getRoles()||[];
        var chgS=false;
        ['role_dozent','role_student'].forEach(function(rid){
          if(!rolesS.find(function(r){return r.id===rid;})){
            var defS=DEFAULT_ROLES.find(function(r){return r.id===rid;});
            if(defS){rolesS.push(defS);chgS=true;}
          }
        });
        if(chgS)_writeLocalCache(STORAGE_ROLES, rolesS);
        var catsS=_getOrgCats();
        if(catsS&&catsS.length&&!catsS.find(function(c){return c.id==='schule';})){
          var defCS=DEFAULT_ORG_CATS.find(function(c){return c.id==='schule';});
          if(defCS){
            catsS.push(defCS);
            try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(catsS));}catch(e){}
          }
        }
        try{localStorage.setItem(MIGFLAG_SCHULE,'1');}catch(e){}
      }
    } catch(e) {}
    // ── Migration: Rolle role_immoverwalter (Immobilienverwaltung) ──
    // Verwalter-Rolle fuer iv_immobilien. Wird einmalig in bestehende
    // Installationen nachgezogen (die Org-Kategorie 'immobilien' existiert
    // bereits; _mergeWithDefaults ergaenzt den immobilien-Permission-Key
    // bestehender Rollen beim Cloud-Pull).
    try {
      var MIGFLAG_IMMO='gema_auth_immo_v1';
      if(!localStorage.getItem(MIGFLAG_IMMO)){
        var rolesI=_getRoles()||[];
        if(!rolesI.find(function(r){return r.id==='role_immoverwalter';})){
          var defI=DEFAULT_ROLES.find(function(r){return r.id==='role_immoverwalter';});
          if(defI)rolesI.push(defI);
          _writeLocalCache(STORAGE_ROLES, rolesI);
        }
        try{localStorage.setItem(MIGFLAG_IMMO,'1');}catch(e){}
      }
    } catch(e) {}
    // ── Migration: Rolle role_free (GEMA Card, Gratis-Konto) ──
    // Wird einmalig in bestehende Installationen nachgezogen; die neuen
    // Modul-Keys visitenkarte/kontakte ergaenzt _mergeWithDefaults beim
    // Cloud-Pull ohnehin bei allen Rollen mit Default-Pendant.
    try {
      var MIGFLAG_FREE='gema_auth_card_free_v1';
      if(!localStorage.getItem(MIGFLAG_FREE)){
        var rolesF=_getRoles()||[];
        if(!rolesF.find(function(r){return r.id==='role_free';})){
          var defF=DEFAULT_ROLES.find(function(r){return r.id==='role_free';});
          if(defF)rolesF.push(defF);
          _writeLocalCache(STORAGE_ROLES, rolesF);
        }
        try{localStorage.setItem(MIGFLAG_FREE,'1');}catch(e){}
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
        // Frisch angelegter Benutzer, den der Cloud-Read (noch) nicht
        // kennt: zurueckmergen, sonst wirft der naechste Seitenaufruf die
        // eben eroeffnete Sitzung raus.
        _reassertAdopted();
        var changed = false;
        if(res[0] && _maybeReloadAfterSync(_initialOrgsHash,  res[0])) changed=true;
        if(!changed && res[1] && _maybeReloadAfterSync(_initialUsersHash, res[1])) changed=true;
        if(!changed && res[2] && _maybeReloadAfterSync(_initialRolesHash, res[2])) changed=true;
      }).catch(function(e){
        console.warn('[GemaAuth] Cloud-Bootstrap fehlgeschlagen:', e && e.message);
      });
    }
  }

  // ── Sitzung eroeffnen (EINE Wahrheit fuer Login, Aktivierung, Registrierung)
  //
  // KRITISCH: Der Boot-Check (unten, `users.find(...)`) laeuft SYNCHRON und
  // wirft eine Sitzung raus, deren Benutzer NICHT im lokalen Cache steht —
  // der Cloud-Pull kommt erst danach. Wer also eine Sitzung schreibt, MUSS
  // den Benutzer im selben Zug in den Cache mergen, sonst landet die
  // Zielseite sofort wieder im Login («Willkommen …» und dann Login-Screen,
  // Bugreport 05.08.2026 zur Klassencode-Registrierung).
  function _mergeIntoCache(storageKey, rec){
    if(!rec || !rec.id) return;
    try{
      var arr = JSON.parse(_readCache(storageKey)||'[]');
      if(!Array.isArray(arr)) arr=[];
      var i=-1;
      for(var k=0;k<arr.length;k++){ if(arr[k]&&arr[k].id===rec.id){i=k;break;} }
      if(i>=0)arr[i]=rec;else arr.push(rec);
      _writeLocalCache(storageKey, arr);
    }catch(e){}
  }
  // Zuletzt uebernommener Benutzer (Login/Aktivierung/Registrierung). Dient
  // als Rettungsanker: ein Cloud-Refresh, der ihn (noch) nicht kennt, darf
  // die frische Sitzung nicht entwerten — siehe warmCaches().
  //
  // Der Anker ueberlebt bewusst auch den Seitenwechsel (sessionStorage, 3
  // Minuten): ein soeben angelegter Benutzer erscheint im Cloud-Read
  // manchmal erst mit Verzoegerung, und der Bootstrap der ZIELSEITE wuerde
  // ihn sonst aus dem Cache werfen — der naechste Klick landete im Login.
  // Kurz befristet, damit ein wirklich geloeschtes Konto normal ausgeloggt
  // wird (das ist die Aufgabe des Cloud-Reads, nicht des Ankers).
  var FRESH_KEY = 'gema_auth_fresh_user';
  var FRESH_MS  = 3 * 60 * 1000;
  var _adoptedUser = null;
  function _freshUser(){
    if(_adoptedUser && _adoptedUser.id) return _adoptedUser;
    try{
      var r=JSON.parse(sessionStorage.getItem(FRESH_KEY)||'null');
      if(r && r.u && r.u.id && r.ts && (Date.now()-r.ts) < FRESH_MS) return r.u;
      if(r) sessionStorage.removeItem(FRESH_KEY);
    }catch(e){}
    return null;
  }
  // user  = vollstaendiger Benutzer-Record der Function
  // opts  = {token, tokenExp, expires, remember, org}
  function _adoptSession(user, opts){
    opts = opts || {};
    if(!user || !user.id) return null;
    var remember = opts.remember !== false;
    var tokenExp = opts.tokenExp || '';
    var expIso = opts.expires;
    if(!expIso){
      // «Angemeldet bleiben»: Sitzungsende folgt dem Token (der Auto-Refresh
      // erneuert es laufend) — sonst 1 Tag.
      if(remember && tokenExp) expIso = tokenExp;
      else { var d=new Date(); d.setDate(d.getDate()+(remember?SESSION_DAYS:1)); expIso=d.toISOString(); }
    }
    try{
      localStorage.setItem(STORAGE_SESSION, JSON.stringify({
        userId:user.id, expires:expIso, token:opts.token||'',
        tokenExp:tokenExp, remember:remember
      }));
    }catch(e){}
    // Der Auto-Reload des Cloud-Bootstraps (_maybeReloadAfterSync) darf eine
    // eben eroeffnete Sitzung nicht stoeren: er wuerde die «Willkommen …»-
    // Karte samt anstehender Weiterleitung wegreissen und die Login-Seite
    // neu laden. Die Caches sind hier ohnehin frisch — Reload-Budget des
    // Tabs also bewusst verbraucht.
    try{ sessionStorage.setItem('gema_auth_auto_reloaded','1'); }catch(e){}
    _adoptedUser = user;
    try{ sessionStorage.setItem(FRESH_KEY, JSON.stringify({u:user, ts:Date.now()})); }catch(e){}
    _mergeIntoCache(STORAGE_USERS, user);
    if(opts.org) _mergeIntoCache(STORAGE_ORGS, opts.org);
    return user;
  }
  // Nach einem Cloud-Refresh: kennt die frisch geladene Benutzerliste den
  // eben angelegten Benutzer noch nicht (Replikations-Verzoegerung), waere
  // die Sitzung beim naechsten Seitenaufruf tot. Also zurueckmergen.
  function _reassertAdopted(){
    var u=_freshUser();
    if(!u) return;
    var users=null;
    try{ users = JSON.parse(_readCache(STORAGE_USERS)||'null'); }catch(e){}
    if(!Array.isArray(users)) return;
    for(var i=0;i<users.length;i++){ if(users[i]&&users[i].id===u.id) return; }
    _mergeIntoCache(STORAGE_USERS, u);
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
  function _hasRoleId(user,rid){return !!(user&&user.roleIds&&user.roleIds.indexOf(rid)>=0);}

  // ── Schule: Studierenden-Gating (harte Sperre mit Klassen-Freischaltung) ──
  // Studierende (role_student) haben KEINE Berechnungs-Permissions in der
  // Rolle. Der Dozent schaltet Module pro Klasse frei; ab_klassen.html /
  // ab_pruefung_live.html schreiben die erlaubten Modul-Keys in den Cache
  // 'gema_student_mods_v1' ({userId, mods:[], exams:{key:untilTs}, ts}) —
  // exams = pro Prüfungs-Aufgabe freigeschaltete Tools bis Prüfungsende.
  // Dieser Check ist rein ADDITIV (erweitert nie-erlaubte Module), fail-
  // closed: ohne Cache bleibt das Modul gesperrt, der Init macht dann
  // eine async Nachprüfung gegen den Klassen-Pool.
  function _studentModCache(user){
    try{
      var raw=localStorage.getItem('gema_student_mods_v1');
      if(!raw)return null;
      var c=JSON.parse(raw);
      if(!c||c.userId!==user.id)return null;
      return c;
    }catch(e){return null;}
  }
  function _studentModAllowed(user,mkey){
    if(!_hasRoleId(user,'role_student'))return false;
    if(!_calcKeySet()[mkey])return false;
    var c=_studentModCache(user);
    if(!c)return false;
    if(c.mods&&c.mods.indexOf(mkey)>=0)return true;
    var until=c.exams&&c.exams[mkey];
    return !!(until&&Date.now()<until);
  }
  // Async-Nachprüfung: Klassen-Pool frisch laden (evtl. hat der Dozent das
  // Modul gerade erst freigeschaltet und der lokale Cache ist alt).
  function _studentModsRefresh(user,mkey,cb){
    if(typeof w.GemaSync==='undefined'||!w.GemaSync.loadCollection){cb(false);return;}
    w.GemaSync.loadCollection('schule','sklasse:').then(function(rows){
      var mods={};
      (rows||[]).forEach(function(r){
        var k=r&&r.data;
        if(!k||k.archiviert)return;
        if((k.studentIds||[]).indexOf(user.id)<0)return;
        (k.module||[]).forEach(function(m){mods[m]=1;});
      });
      var cur=_studentModCache(user)||{};
      var exams={};
      var oldEx=cur.exams||{};
      Object.keys(oldEx).forEach(function(k){if(oldEx[k]>Date.now())exams[k]=oldEx[k];});
      try{
        localStorage.setItem('gema_student_mods_v1',JSON.stringify({userId:user.id,mods:Object.keys(mods),exams:exams,ts:Date.now()}));
      }catch(e){}
      cb(!!mods[mkey]||!!(exams[mkey]&&Date.now()<exams[mkey]));
    }).catch(function(){cb(false);});
  }
  // ── Lieferanten: Berechnungs-Freischaltung nach Sortiment ─────────
  // Ein Lieferant, der eine Enthaertungsanlage im Katalog fuehrt, soll die
  // Enthaertungs-BERECHNUNG oeffnen und selbst durchrechnen koennen — nur so
  // sieht er, ob die Auslegung zu seinem Produkt passt. Die Freischaltung
  // ist rein ADDITIV (erweitert nie-erlaubte Module) und leitet sich aus
  // ZWEI Quellen ab (User-Entscheid, Vereinigung):
  //   (a) den erfassten PRODUKTEN seines Katalogs (produkt.kategorie)
  //   (b) den Kategorien seines FIRMENPROFILS (lieferant.lieferantKategorien)
  // (b) greift schon, bevor das erste Produkt erfasst ist.
  //
  // Muster wie das Studierenden-Gating: synchroner Cache + async Nachpruefung.
  // Fail-CLOSED — ohne Cache bleibt das Modul zu, der Init prueft dann nach
  // und laedt die Seite bei einem Treffer neu.
  var LIEF_MOD_CACHE_KEY='gema_lief_mods_v1';
  var LIEF_MOD_TTL=12*3600*1000; // Cache-Alter, ab dem im Hintergrund erneuert wird
  function _isLieferantUser(user){
    if(!user||!user.roleIds)return false;
    return user.roleIds.some(function(r){
      return typeof r==='string'&&(r.indexOf('role_lieferant')===0||r.indexOf('role_produktlieferant')===0);
    });
  }
  function _liefModCache(user){
    try{
      var raw=localStorage.getItem(LIEF_MOD_CACHE_KEY);
      if(!raw)return null;
      var c=JSON.parse(raw);
      if(!c||c.userId!==user.id)return null;
      return c;
    }catch(e){return null;}
  }
  function _liefModAllowed(user,mkey){
    if(!mkey||!_isLieferantUser(user))return false;
    if(!_calcKeySet()[mkey])return false;   // nur Berechnungsmodule
    var c=_liefModCache(user);
    return !!(c&&c.mods&&c.mods.indexOf(mkey)>=0);
  }
  // Kategorien → Modul-Keys (dedupliziert, nur existierende MODULES-Keys —
  // ein Tippfehler in LIEF_KAT_MODUL schaltet so nie ein Phantom-Modul frei)
  var _liefKnownMemo=null;
  function _liefKnownKeys(){
    if(_liefKnownMemo)return _liefKnownMemo;
    _liefKnownMemo={};MODULES.forEach(function(m){_liefKnownMemo[m.key]=1;});
    return _liefKnownMemo;
  }
  function _liefModsAusKats(kats){
    var out={},known=_liefKnownKeys();
    (kats||[]).forEach(function(k){
      (LIEF_KAT_MODUL[_liefNormKat(k)]||[]).forEach(function(mk){if(known[mk])out[mk]=1;});
    });
    return Object.keys(out);
  }
  // Async-Nachpruefung: Lieferanten-Profil + Produkte frisch aus der Cloud.
  // Die Zuordnung User → Lieferant laeuft ueber user.lieferantId (kanonisch),
  // Fallback ueber die Org (Muster findMyLieferant im Dashboard).
  function _liefModsRefresh(user,cb){
    cb=cb||function(){};
    if(!_isLieferantUser(user)){cb([]);return;}
    if(typeof w.GemaSync==='undefined'||!w.GemaSync.loadCollection){cb(null);return;}
    var meOrg=user.orgId||'';
    w.GemaSync.loadCollection('produktkatalog','lieferant:').then(function(rows){
      // EMPTY-READ-GUARD (KRITISCH, gleiche Falle wie beim users/orgs-Cache):
      // Eine LEERE Collection ist kein Beweis dafuer, dass der Lieferant kein
      // Sortiment hat — sie kommt genauso bei Offline, noch nicht geladener
      // Cloud oder RLS-Ablehnung (HTTP 200 + []). Den bestehenden Cache in dem
      // Fall zu leeren, wuerde dem Lieferanten seine Berechnungen unter den
      // Fuessen wegziehen. Also: nichts anfassen, spaeter erneut versuchen.
      if(!rows||!rows.length){cb(null);return;}
      var meine={},kats={};
      rows.forEach(function(r){
        var l=r&&r.data;if(!l||!l.id)return;
        var treffer=(user.lieferantId&&l.id===user.lieferantId)
          ||(!user.lieferantId&&meOrg&&meOrg!=='org_default'&&l.orgId===meOrg);
        if(!treffer)return;
        meine[l.id]=1;
        (l.lieferantKategorien||[]).forEach(function(k){kats[_liefNormKat(k)]=1;});
      });
      // Records da, aber keiner gehoert mir → echtes «kein Profil» (schreiben)
      if(!Object.keys(meine).length){_liefModsWrite(user,[]);cb([]);return;}
      return w.GemaSync.loadCollection('produktkatalog','produkt:').then(function(prows){
        (prows||[]).forEach(function(r){
          var p=r&&r.data;
          if(p&&p.kategorie&&meine[p.lieferantId])kats[_liefNormKat(p.kategorie)]=1;
        });
        var mods=_liefModsAusKats(Object.keys(kats));
        _liefModsWrite(user,mods);
        cb(mods);
      });
    }).catch(function(){cb(null);});
  }
  function _liefModsWrite(user,mods){
    try{
      localStorage.setItem(LIEF_MOD_CACHE_KEY,JSON.stringify({userId:user.id,mods:mods||[],ts:Date.now()}));
    }catch(e){}
  }

  // Ist der AKTUELLE Session-User ein Admin? (für den _switchUser-Guard)
  function _sessionUserIsAdmin(){
    var s=_getSession();if(!s)return false;
    var users=_getUsers()||[];
    var u=users.find(function(x){return x.id===s.userId;});
    return !!(u&&_isAdmin(u));
  }
  // Zeigt der Impersonations-Marker auf einen ECHTEN Admin? Ein von Hand
  // gesetzter Marker auf einen Nicht-Admin-User gewährt keine Rechte.
  function _adminOriginIsAdmin(){
    var id=null;try{id=localStorage.getItem('_gemaAdminOrigin');}catch(e){}
    if(!id)return false;
    var users=_getUsers()||[];
    var u=users.find(function(x){return x.id===id;});
    return !!(u&&_isAdmin(u));
  }

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
  // Pre-Paint-Cache: das zuletzt gerenderte Firmenlogo (Quelle + Seitenverhältnis
  // + Org) — damit _navLogoPrepaint() beim NÄCHSTEN Seitenaufruf das Firmenlogo
  // SCHON VOR dem ersten Paint zeigen kann (kein kurzes GEMA-Logo mehr).
  var NAV_LOGO_CACHE = 'gema_nav_logo_v1';
  function _cacheNavLogo(org, img) {
    try {
      var ratio = (img && img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : null;
      var prev = null; try { prev = JSON.parse(localStorage.getItem(NAV_LOGO_CACHE) || 'null'); } catch (e) {}
      localStorage.setItem(NAV_LOGO_CACHE, JSON.stringify({
        orgId: org.id || '',
        src: org.logo,
        ratio: (ratio && ratio > 0) ? ratio : ((prev && prev.ratio) || 2.2),
        name: org.name || '',
        hideName: !!(org.settings && org.settings.hideName)
      }));
    } catch (e) {}
  }

  // Head-Zeit (synchron, VOR dem Nav-Parsing): wenn ein Firmenlogo für die Org
  // des eingeloggten Users gecacht ist, blende das statische GEMA-SVG per
  // injiziertem <style> aus und rendere das Firmenlogo als ::before-Hintergrund.
  // So erscheint auf jeder Folgeseite sofort das richtige Logo. Der Guard
  // (orgId-Vergleich) verhindert ein FREMDES Logo nach User-/Org-Wechsel.
  function _navLogoPrepaint() {
    try {
      if (typeof document === 'undefined' || !document.head) return;
      if (document.getElementById('_gaNavLogo')) return;
      var raw = null; try { raw = localStorage.getItem(NAV_LOGO_CACHE); } catch (e) {}
      if (!raw) return;
      var c; try { c = JSON.parse(raw); } catch (e) { return; }
      if (!c || !c.src) return;
      // Guard: Cache muss zur Org des eingeloggten Users gehören.
      var s = _getSession();
      if (!s || !s.userId) return;
      if (c.orgId) {
        var us = _getUsers() || [];
        var u = us.find(function (x) { return x.id === s.userId; });
        if (!u || u.orgId !== c.orgId) return;
      }
      var H = 40; // gema_responsive.css rendert das Nav-Logo global 40px hoch
      var ratio = (typeof c.ratio === 'number' && c.ratio > 0.2 && c.ratio < 12) ? c.ratio : 2.2;
      var W = Math.max(24, Math.min(120, Math.round(H * ratio)));
      var st = document.createElement('style');
      st.id = '_gaNavLogo';
      st.textContent =
        '.g-nav-mark svg{display:none!important}' +
        '.g-nav-mark{width:auto!important;height:' + H + 'px;display:inline-flex;align-items:center}' +
        '.g-nav-mark::before{content:"";display:block;height:' + H + 'px;width:' + W + 'px;' +
        'background:url("' + c.src + '") left center/contain no-repeat}';
      document.head.appendChild(st);
    } catch (e) {}
  }

  function _swapLogo(org) {
    if (!org || !org.logo) {
      // Diese Org hat KEIN Logo → evtl. veralteten Pre-Paint entfernen +
      // Cache leeren (Self-Heal nach Logo-Entfernung / Org-Wechsel), sonst
      // bliebe das GEMA-SVG verborgen und es erschiene gar kein Logo.
      if (org && !org.logo) {
        try { localStorage.removeItem(NAV_LOGO_CACHE); } catch (e) {}
        var p0 = document.getElementById('_gaNavLogo');
        if (p0 && p0.parentNode) p0.parentNode.removeChild(p0);
      }
      return;
    }
    // Pre-Paint-Style entfernen — wir rendern gleich das echte <img> (gleiches
    // Bild an gleicher Stelle → kein sichtbarer Wechsel, alles in EINEM Sync-Task).
    var pre = document.getElementById('_gaNavLogo');
    if (pre && pre.parentNode) pre.parentNode.removeChild(pre);
    // Find GEMA logo SVG in nav and replace with org logo (full nav height)
    var nav = document.querySelector('.g-nav');
    var navH = nav ? nav.offsetHeight : 52;
    var imgH = navH - 8; // 4px padding top+bottom
    var lastImg = null;
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
        lastImg = img;
      }
    });
    // Logo für den Pre-Paint der nächsten Seite cachen (Seitenverhältnis via
    // onload — dataURL lädt praktisch sofort).
    if (lastImg) {
      lastImg.onload = function(){ _cacheNavLogo(org, lastImg); };
      _cacheNavLogo(org, lastImg); // sofort (mit letztem bekannten Ratio) — Fallback
    }
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
    var allRoles = (user.roleIds||[]).map(function(rid){
      var r=roles.find(function(x){return x.id===rid;}); return r?r.name:'';
    }).filter(Boolean);
    // Kompakt: erste Rolle + «+N» — die volle Kommaliste sprengt bei
    // Mehrfach-Rollen die Nav (v.a. auf dem Smartphone). Die komplette
    // Aufzaehlung bleibt als Tooltip; im Admin-Switcher steht sie ohnehin.
    var roleLabel = allRoles[0]||'';
    if (allRoles.length>1) roleLabel += ' +'+(allRoles.length-1);
    var roleColor='#6b7280';
    if(user.roleIds&&user.roleIds.length){
      var fr=roles.find(function(r){return r.id===user.roleIds[0];});
      if(fr) roleColor=fr.color;
    }
    var badge=document.createElement('div');
    badge.id='_gemaAuthBadge';
    badge.style.cssText='display:flex;align-items:center;gap:6px;margin-left:16px;padding-right:12px;flex-shrink:0;position:relative;min-width:0';

    var isAdmin=_isAdmin(user);
    // Switcher nur für echte Admins bzw. eine ECHTE Admin-Impersonation —
    // ein manuell gesetzter _gemaAdminOrigin-Marker auf einen Nicht-Admin
    // blendet das Dropdown NICHT ein.
    var isImpersonating=_adminOriginIsAdmin();
    var showSwitcher=isAdmin||isImpersonating;
    badge.innerHTML=
      '<div style="text-align:right;cursor:'+(showSwitcher?'pointer':'default')+';min-width:0;max-width:230px" '+(showSwitcher?'onclick="document.getElementById(\'_gemaSwitcher\').style.display=document.getElementById(\'_gemaSwitcher\').style.display===\'none\'?\'block\':\'none\'"':'')+' title="'+_esc(allRoles.join(', '))+'">'+
        '<div style="font-size:12px;font-weight:700;color:#111827;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_esc(user.name||user.username)+(showSwitcher?' <span style="font-size:9px;color:#9ca3af">▼</span>':'')+'</div>'+
        '<div style="font-size:10px;font-weight:600;color:'+roleColor+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_esc(roleLabel)+'</div>'+
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

  function _esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

  /* ── Eimer-Pfad in der Navigation ──────────────────────────────────
     Feedback 05.08.2026: «wenn ich im Eimer bin, soll es den Pfad aus dem
     Eimer anzeigen — ‹Eimer-Name› › ‹Modul-Name›. Übersichtsseiten sind
     nicht einzublenden. Pfad ist klickbar und das Modul speichert
     automatisch.»

     KRITISCH — woher der Eimer-Name kommt: den Kontext schreibt der
     WORKSPACE beim Klick auf die Modul-Kachel (`gema_ws_ctx_v1`), denn
     dort ist der Eimer bereits auf Sichtbarkeit geprüft. Die Modul-Seite
     löst NIE selbst eine Eimer-id aus der URL im (org-übergreifenden)
     Pool auf — Eimer-Namen sind Projektnamen, das wäre ein Leck.
     Der Kontext gilt nur, solange er dem eingeloggten Konto gehört UND
     das Modul auf dem Eimer-Objekt steht; sonst bleibt der normale
     Breadcrumb stehen. */
  function _aktivesObjekt(){
    try{
      var q=new URLSearchParams(location.search).get('objekt');
      if(q) return q;
    }catch(e){}
    try{ var a=localStorage.getItem('gema_active_objekt_v1'); if(a) return a; }catch(e){}
    try{
      var d=JSON.parse(localStorage.getItem('gema_objekte_v1')||'{}');
      if(d&&d.activeObjektId) return d.activeObjektId;
    }catch(e){}
    return '';
  }
  function _eimerPfad(){
    try{
      var bc=document.querySelector('.g-nav-bc'); if(!bc) return;
      var cur=bc.querySelector('.bc-cur'); if(!cur) return;
      var ctx=null;
      try{ ctx=JSON.parse(localStorage.getItem('gema_ws_ctx_v1')||'null'); }catch(e){}
      if(!ctx||!ctx.bucketId||!ctx.name||!ctx.objektId) return;
      var s=_getSession();
      if(ctx.userId&&(!s||ctx.userId!==s.userId)) return;   // fremdes Konto
      if(_aktivesObjekt()!==ctx.objektId) return;           // anderes Projekt offen
      var modName=cur.textContent||'';
      bc.innerHTML='<a class="bc-cat bc-eimer" href="sys_workspace.html?eimer='+encodeURIComponent(ctx.bucketId)+'" title="Zurück in den Eimer">'
        +_esc(ctx.name)+'</a><span class="bc-sep">›</span><span class="bc-cur">'+_esc(modName)+'</span>';
      var a=bc.querySelector('.bc-eimer');
      // Vor dem Verlassen sichern — AutoSave läuft sonst erst nach seiner
      // Verzögerung (Muster: der pagehide-Flush deckt den Rest ab).
      if(a) a.addEventListener('click',function(){
        try{ if(w.GemaAutoSave&&w.GemaAutoSave.save) w.GemaAutoSave.save(); }catch(e){}
      });
    }catch(e){}
  }
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
  // sys_lieferant_dashboard ist seit 08/2026 ein normales MODUL (FILE_MAP →
  // 'lieferant_dashboard') und steht darum NICHT mehr in dieser Liste: es
  // laeuft ueber die Modul-Permission wie jede andere Modulseite (Rollen ohne
  // Recht sehen den «Kein Zugriff»-Screen statt der Seite).
  function _isLoginOnly(){return ['index','sb_index','el_index','pm_ausschreibung','ab_index','sys_admin','sys_profil','sys_preise','sys_beta','sys_garagist_dashboard','sys_workspace','sys_unternehmen',''].indexOf(thisFileLower)>=0;}
  /* Persönliche Konto-Seiten: der Rollen-Redirect gilt NUR für Hub-/Landing-
     Seiten, NICHT für Seiten, die jemand bewusst aufruft. Vorher sprang jeder
     Aufruf von sys_profil bei einem Projektleiter (Landing = sys_workspace)
     sofort in den Workspace zurück — die EIGENEN Einstellungen (Profilbild,
     App-Ansicht, Benachrichtigungen) waren damit für alle Nicht-GEMA-Admins
     unerreichbar (Feedback 30.07.2026 «Menü für Einstellungen»); in
     notify_prefs_gating_test war das als Quirk umschifft.
     sys_unternehmen darf rein, weil es sich selbst guardet
     (GemaAuth.isOrgAdmin → «Nur Unternehmens-Admins»).
     sys_admin ebenfalls (07.08.2026): die Seite hat entgegen der früheren
     Notiz hier sehr wohl einen harten In-Page-Guard (init() ersetzt den Body
     durch «Kein Zugriff», wenn der User weder role_admin noch Org-Admin der
     eigenen Firma ist). Solange sie draussen stand, warf der Rollen-Redirect
     jeden ORG-ADMIN hinaus, dessen Landing nicht index.html ist — also genau
     die Gruppe, für die die Seite gebaut ist: er kam gar nie an die
     Benutzerverwaltung seiner eigenen Firma. Der Schutz wird dadurch nicht
     schwächer, er verschiebt sich nur vom Redirect auf den Guard der Seite
     (für Rollen mit Landing index.html — Monteur, Magaziner — griff ohnehin
     seit je nur dieser Guard).
     Neue Seite hier nur aufnehmen, wenn sie entweder für JEDEN offen ist oder
     einen eigenen In-Page-Guard hat. */
  var _KONTO_SEITEN=['sys_profil','sys_preise','sys_beta','sys_unternehmen','sys_admin'];

  // ── Rollenspezifische Zielseite ─────────────────────────────────
  function _getRedirectForUser(u){
    if(!u||!u.roleIds)return'sys_workspace.html';
    // Lieferanten (Anlagen + Produkt), Pruefer und Leiternpruefer starten
    // seit 08/2026 im WORKSPACE wie alle anderen — ihr Dashboard ist ein
    // normales Modul, das sie sich dort in einen Eimer legen (User-Entscheid:
    // «alle starten gleich, nur die verfuegbaren Module unterscheiden sich»).
    // Sie fallen darum bewusst auf den sys_workspace-Default am Ende durch.
    if(u.roleIds.indexOf('role_garagist')>=0)return'sys_garagist_dashboard.html';
    // Schule: Dozent landet auf der Modulübersicht (freies Arbeiten mit den
    // Berechnungsmodulen), Studierende im WORKSPACE (User-Entscheid 08/2026):
    // dort liegen ihre auto-provisionierten Eimer — der hervorgehobene
    // Klassen-Eimer (Modul ab_klassen) und der Übungs-Eimer mit den vom
    // Dozenten freigeschalteten Modulen (sys_workspace._wsStudentProvision).
    if(u.roleIds.indexOf('role_dozent')>=0)return'index.html';
    if(u.roleIds.indexOf('role_student')>=0)return'sys_workspace.html';
    if(u.roleIds.indexOf('role_magaziner')>=0)return'index.html';
    if(u.roleIds.indexOf('role_monteur')>=0)return'index.html';
    // GEMA Card (gratis): Modulübersicht ist das Free-Dashboard — eigene
    // Karte + Kontaktbuch oben, Fachmodule als gesperrte Kacheln darunter.
    // NICHT sys_workspace: darauf hat role_free bewusst keine Permission,
    // der Redirect liefe sonst direkt in den «Kein Zugriff»-Screen.
    if(u.roleIds.indexOf('role_free')>=0)return'index.html';
    return'sys_workspace.html';
  }
  // Gratis-Konto? (Fachmodule gesperrt, Karte + Kontaktbuch offen)
  function _isFreeUser(u){
    u=u||(w.GemaAuth&&w.GemaAuth.getCurrentUser&&w.GemaAuth.getCurrentUser())||null;
    return !!(u&&u.roleIds&&u.roleIds.indexOf('role_free')>=0&&u.roleIds.indexOf('role_admin')<0);
  }

  // ── GEMA Secure v1: Gleitendes Sitzungsfenster («angemeldet bleiben») ──
  // Erneuert das JWT automatisch im Hintergrund (fruehestens nach 24h
  // Token-Alter, gedrosselt auf 1x/6h), solange «Angemeldet bleiben»
  // gewaehlt wurde. Aktive Nutzer bleiben damit DAUERHAFT angemeldet —
  // nur wer laenger als die Token-Laufzeit (GEMA_TOKEN_DAYS, Default 30
  // Tage) gar nicht reinschaut, muss sich neu anmelden. Deaktivierte
  // Konten bekommen beim Refresh kein neues Token mehr.
  function _tokenClaims(tok){
    try{
      var p=String(tok).split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(atob(p));
    }catch(e){return null;}
  }
  function _maybeRefreshToken(){
    try{
      var s=_getSession();
      if(!s||!s.token||s.remember===false)return;
      var last=parseInt(localStorage.getItem('gema_token_refresh_ts')||'0',10);
      if(Date.now()-last<6*3600*1000)return; // Drossel: max. 1x pro 6h
      var c=_tokenClaims(s.token);if(!c||!c.iat)return;
      if((Date.now()/1000)-c.iat<24*3600)return; // Token juenger als 24h
      try{localStorage.setItem('gema_token_refresh_ts',String(Date.now()));}catch(e){}
      var fnUrl=(w.GemaSync&&w.GemaSync.authFnUrl)||'/.netlify/functions/gema-auth';
      fetch(fnUrl,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.token},
        body:JSON.stringify({action:'refresh'})
      }).then(function(r){
        if(!r.ok)return null;
        return r.json().catch(function(){return null;});
      }).then(function(j){
        if(!j||!j.ok||!j.token)return;
        var cur=_getSession();if(!cur)return;
        cur.token=j.token;cur.tokenExp=j.exp;cur.expires=j.exp;
        try{localStorage.setItem(STORAGE_SESSION,JSON.stringify(cur));}catch(e){}
        if(j.user){
          try{
            var users=_getUsers()||[];
            var i=users.findIndex(function(x){return x&&x.id===j.user.id;});
            if(i>=0)users[i]=j.user;else users.push(j.user);
            _writeLocalCache(STORAGE_USERS,users);
          }catch(e){}
        }
      }).catch(function(){});
    }catch(e){}
  }

  // ── INIT ───────────────────────────────────────────────────────────
  _initDefaults();
  _maybeRefreshToken();

  if(_isSkip()){
    // login — no auth, just expose API
  } else {
    // Firmenlogo VOR dem ersten Paint einblenden (aus dem Cache, synchron im
    // <head> — verhindert das kurze Aufblitzen des GEMA-Logos beim Seitenwechsel).
    _navLogoPrepaint();
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
      var users=_getUsers()||[];
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
          if(!_isAdmin(user)&&destPage!==curPage&&destPage!=='index'&&_KONTO_SEITEN.indexOf(curPage)<0){
            // Chat-Deep-Link (?chat=<threadId>, gema_chat.js) über den
            // Rollen-Redirect hinweg erhalten — sonst verpufft der Klick
            // auf eine Chat-Benachrichtigung auf der Modulübersicht.
            try{
              var _chatParam=new URLSearchParams(location.search).get('chat');
              if(_chatParam)roleDest+=(roleDest.indexOf('?')>=0?'&':'?')+'chat='+encodeURIComponent(_chatParam);
            }catch(e){}
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
          // Schule: Klassen-Freischaltung für Studierende (additiv)
          if(!perms.read&&_studentModAllowed(user,mkey)){
            perms={read:true,write:true,admin:false};
          }
          // Lieferanten: Berechnungen des eigenen Sortiments (additiv)
          if(!perms.read&&_liefModAllowed(user,mkey)){
            perms={read:true,write:true,admin:false};
          }
          if(!_isAdmin(user)&&!perms.read){
            // Studierende fail-closed + async Nachprüfung: hat der Dozent
            // das Modul gerade erst freigeschaltet, ist der lokale Cache
            // alt → Klassen-Pool frisch laden und bei Treffer neu laden.
            var _studRetry=_hasRoleId(user,'role_student')&&_calcKeySet()[mkey];
            if(_studRetry){
              _studentModsRefresh(user,mkey,function(ok){if(ok)location.reload();});
            }
            // Lieferanten gleiches Muster: hat er die Anlage gerade erst
            // erfasst (oder auf einem anderen Geraet), ist der lokale Cache
            // alt → Katalog frisch laden und bei Treffer neu laden.
            var _liefRetry=!_studRetry&&_isLieferantUser(user)&&_calcKeySet()[mkey];
            if(_liefRetry){
              _liefModsRefresh(user,function(mods){
                if(mods&&mods.indexOf(mkey)>=0)location.reload();
              });
            }
            _unblock();
            document.addEventListener('DOMContentLoaded',function(){
              var hint=_studRetry?'Dieses Modul ist für deine Klasse (noch) nicht freigeschaltet.':'Sie haben keine Berechtigung für dieses Modul.';
              var back=_studRetry?'sys_workspace.html':'index.html';
              var backLabel=_studRetry?'← Zum Workspace':'← Zurück zur Übersicht';
              if(_liefRetry){
                hint='Diese Berechnung gehört zu einem Sortiment, das Sie (noch) nicht führen. Erfassen Sie eine passende Anlage oder haken Sie die Kategorie im Firmenprofil an — dann steht Ihnen die Berechnung offen.';
                back='sys_lieferant_dashboard.html';
                backLabel='← Zum Lieferanten-Dashboard';
              }
              document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui"><div style="text-align:center"><div style="font-size:48px">🔒</div><h2 style="margin:16px 0 8px">Kein Zugriff</h2><p style="color:#6b7280">'+hint+'</p><a href="'+back+'" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">'+backLabel+'</a></div></div>';
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
              _eimerPfad();
              _autoFillBearbeiter(user);
              _enhanceObjektDropdown();
            });
          }
        }
        // Lieferanten: Sortiment-Cache im Hintergrund frisch halten, damit
        // Modulübersicht und Workspace-Picker die richtigen Berechnungs-
        // Kacheln zeigen. Gedrosselt ueber LIEF_MOD_TTL — der Erst-Lauf
        // (kein Cache) laeuft immer, danach hoechstens alle 12h.
        if(_isLieferantUser(user)){
          var _lc=_liefModCache(user);
          if(!_lc||(Date.now()-(_lc.ts||0))>LIEF_MOD_TTL){
            setTimeout(function(){_liefModsRefresh(user,function(){});},1500);
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
    getFileMap:function(){return FILE_MAP;},
    getCalcCats:function(){return CALC_CATS.slice();},
    // ── Lieferanten: Berechnungen des eigenen Sortiments ──
    // Kanonische Map Produkt-/Firmenkategorie → Berechnungsmodule.
    getLieferantKatModule:function(){
      var out={};Object.keys(LIEF_KAT_MODUL).forEach(function(k){out[k]=LIEF_KAT_MODUL[k].slice();});
      return out;
    },
    // Modul-Keys, die dem eingeloggten Lieferanten aktuell offen stehen
    // (aus dem Cache — synchron, fuer Kachel-Rendering).
    getLieferantModule:function(user){
      var u=user||w.GemaAuth.getCurrentUser();
      if(!u||!_isLieferantUser(u))return [];
      var c=_liefModCache(u);
      return (c&&c.mods)?c.mods.slice():[];
    },
    // Sortiment-Cache neu aufbauen (Promise mit den Modul-Keys). Aufrufen,
    // wenn sich Produkte oder Firmenkategorien geaendert haben.
    refreshLieferantModule:function(user){
      var u=user||w.GemaAuth.getCurrentUser();
      return new Promise(function(res){
        if(!u){res([]);return;}
        _liefModsRefresh(u,function(mods){res(mods||[]);});
      });
    },
    // Sortiment-Cache DIREKT aus bekannten Kategorien setzen. Das Dashboard
    // hat sein Lieferanten-Profil samt Produkten bereits aufgeloest (inkl.
    // Auto-Provisionierung) — es kennt die Wahrheit besser als ein zweiter
    // Cloud-Roundtrip und meldet sie hier. Liefert die Modul-Keys.
    setLieferantModuleAusKategorien:function(kats,user){
      var u=user||w.GemaAuth.getCurrentUser();
      if(!u||!_isLieferantUser(u))return [];
      var mods=_liefModsAusKats(kats||[]);
      _liefModsWrite(u,mods);
      return mods;
    },
    isLieferantUser:function(user){return _isLieferantUser(user||w.GemaAuth.getCurrentUser());},
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
      // Rollen-getrieben: eine Rolle ist fuer eine Kategorie waehlbar, wenn
      // ihre wirksamen Kategorien (_roleKats: gespeichertes `kategorien`-Array
      // oder Default aus KATEGORIE_ROLLEN) diese Kategorie enthalten. Damit
      // sind neu erstellte Rollen ueber den Rolleneditor direkt einer
      // Kategorie zuweisbar (frueher nur ueber die harte KATEGORIE_ROLLEN-Map,
      // weshalb Custom-Rollen nur unter 'sonstiges' auftauchten).
      var roles=_getRoles()||[];
      if(!roles.length)return null;   // Rollen noch nicht geladen → nicht einschraenken
      var out={},unrestricted=false;
      kats.forEach(function(k){
        if(k==='sonstiges'){unrestricted=true;return;}   // Sammelkategorie: alle Rollen
        var claimed=false;
        roles.forEach(function(r){
          if(!r||!r.id)return;
          if(_roleKats(r).indexOf(k)>=0){out[r.id]=true;claimed=true;}
        });
        // Kategorie, die KEINE Rolle beansprucht UND nicht im Default-Map
        // steht → unbekannte/eigene Kategorie, nicht einschraenken.
        if(!claimed && !(k in KATEGORIE_ROLLEN))unrestricted=true;
      });
      if(unrestricted)return null;
      return Object.keys(out);
    },
    // Wirksame Unternehmenskategorien einer Rolle (fuer den Rolleneditor):
    // gespeichertes `kategorien`-Array oder Default aus KATEGORIE_ROLLEN.
    getRoleKategorien:function(role){ return _roleKats(role).slice(); },

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
      var key=mkey||_detectModuleKey();
      if(_getPerms(user,roles,key)[action])return true;
      // Schule: Klassen-Freischaltung für Studierende (read+write additiv —
      // damit zeigen auch index/sb_index genau die freigeschalteten Kacheln)
      if((action==='read'||action==='write')&&_studentModAllowed(user,key))return true;
      // Lieferanten: Berechnungen ihres Sortiments (read+write — ohne write
      // koennte er nichts durchrechnen, AutoSave wuerde nicht speichern).
      // Die Berechnungen landen in seiner EIGENEN Org.
      if((action==='read'||action==='write')&&_liefModAllowed(user,key))return true;
      return false;
    },
    // KEIN client-seitiger Login mehr (Sicherheits-Bereinigung 27.07.2026).
    // Hier stand ein Fallback, der das Passwort im Browser gegen den
    // djb2-Hash im lokalen Benutzer-Cache prueft. Er erzeugte eine Sitzung
    // OHNE JWT — unter RLS also ohnehin unbrauchbar (der Tokenless-Guard in
    // gema_sync.js meldet sie sofort wieder ab) — war aber der letzte Weg,
    // auf dem ein Passwort-Vergleich im Browser stattfand. Anmelden laeuft
    // ausschliesslich ueber die gema-auth Netlify Function.
    loginAsync:function(username,password,remember){
      var self=this;
      // GEMA Secure v1: Login laeuft ueber die gema-auth Netlify Function —
      // sie prueft die Zugangsdaten SERVER-seitig und stellt das JWT aus,
      // mit dem alle weiteren Supabase-Calls unter RLS laufen. Ist sie nicht
      // erreichbar, ist keine Anmeldung moeglich (kein stiller Ausweg).
      var fnUrl=(w.GemaSync&&w.GemaSync.authFnUrl)||'/.netlify/functions/gema-auth';
      return fetch(fnUrl,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'login',username:username,password:password})
      }).then(function(r){
        if(r.status===404){var e=new Error('fn-missing');e.fnMissing=true;throw e;}
        return r.json().catch(function(){return {};}).then(function(j){return {status:r.status,j:j};});
      }).then(function(res){
        if(!res.j||!res.j.ok||!res.j.token){
          // 401 = falsche Zugangsdaten. Alles andere ist ein SERVER-Problem
          // (Fehlkonfiguration, Supabase-Ausfall, kaputte Antwort) — das
          // wird als solches gemeldet, nicht stillschweigend umgangen.
          if(res.status===401){w.GemaAuth.lastLoginError='';return null;}
          var msg=(res.j&&res.j.error)||('HTTP '+res.status);
          w.GemaAuth.lastLoginError='Anmeldedienst antwortet nicht: '+msg;
          console.warn('[GemaAuth] '+w.GemaAuth.lastLoginError);
          return null;
        }
        w.GemaAuth.lastLoginError='';
        var u=res.j.user;
        // Sitzung + User in den lokalen Cache (eine Wahrheit, _adoptSession):
        // getCurrentUser klappt direkt und der Boot-Check der Zielseite
        // findet den Benutzer. Danach Collections MIT Token frisch ziehen.
        _adoptSession(u,{token:res.j.token,tokenExp:res.j.exp,remember:!!remember});
        // Collections MIT Token frisch ziehen — aber den Login NICHT daran
        // aufhaengen: haengende/langsame Cloud-Reads (Netz, Proxy, AV)
        // machten den Login sonst beliebig langsam. Max. 2.5s warten
        // (frische Caches im Normalfall), danach weiterleiten — die Pulls
        // laufen im Hintergrund fertig und die Zielseite pullt beim Boot
        // ohnehin erneut. User-Record ist bereits im Cache (oben gemerged).
        return Promise.race([
          Promise.all([
            _loadCollectionFromCloud(STORAGE_USERS),
            _loadCollectionFromCloud(STORAGE_ORGS),
            _loadCollectionFromCloud(STORAGE_ROLES)
          ]),
          new Promise(function(res){ setTimeout(res, 2500); })
        ]).catch(function(){}).then(function(){
          return self.getCurrentUser()||u;
        });
      }).catch(function(e){
        // Function fehlt (404) oder Netzfehler → keine Anmeldung. Die
        // Login-Seite zeigt `lastLoginError` an, damit man «falsches
        // Passwort» von «Dienst nicht erreichbar» unterscheiden kann.
        w.GemaAuth.lastLoginError=(e&&e.fnMissing)
          ? 'Anmeldedienst nicht erreichbar (gema-auth Function fehlt).'
          : 'Anmeldedienst nicht erreichbar — bitte Verbindung pruefen.';
        console.warn('[GemaAuth] '+w.GemaAuth.lastLoginError);
        return null;
      });
    },

    // GEMA Secure v1: letzter Server-Login-Fehler (fuer die Login-Seite —
    // unterscheidet «falsches Passwort» von «Function fehlkonfiguriert»)
    lastLoginError:'',

    // Sitzung aus einer Server-Antwort uebernehmen (Registrierung ueber die
    // gema-auth Function). Schreibt Sitzung UND mergt den Benutzer in den
    // lokalen Cache — ohne den Merge wirft der synchrone Boot-Check der
    // Zielseite die frische Sitzung sofort wieder raus (Login-Screen).
    // user = Benutzer-Record der Function, opts = {token,tokenExp,expires,remember,org}
    adoptSession:function(user,opts){ return _adoptSession(user,opts); },

    // Users/Orgs/Rollen MIT dem frischen Token nachziehen (nur lesen, keine
    // Migration, keine Writes). Nach einer Registrierung kennt der lokale
    // Cache nur den eigenen Benutzer — ohne diesen Zug rendert die Zielseite
    // einmal ohne Firma und laedt sich danach selbst neu.
    warmCaches:function(){
      return Promise.all([
        _loadCollectionFromCloud(STORAGE_USERS),
        _loadCollectionFromCloud(STORAGE_ORGS),
        _loadCollectionFromCloud(STORAGE_ROLES)
      ]).catch(function(){ return null; }).then(function(r){ _reassertAdopted(); return r; });
    },

    // GEMA Secure v1: JWT der aktuellen Sitzung (jede Anmeldung liefert eines)
    getToken:function(){
      try{var s=JSON.parse(localStorage.getItem(STORAGE_SESSION)||'null');return (s&&s.token)||'';}catch(e){return '';}
    },

    // Einladungs-Aktivierung ueber die Function (Server prueft: Konto hat
    // noch kein Passwort) — ohne erreichbare Function keine Aktivierung.
    // Gibt den User zurueck oder null.
    activateInvitationAsync:function(inviteToken,password,regData){
      var self=this;
      var fnUrl=(w.GemaSync&&w.GemaSync.authFnUrl)||'/.netlify/functions/gema-auth';
      return fetch(fnUrl,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'activate',inviteToken:inviteToken,password:password,extra:regData||{}})
      }).then(function(r){
        if(r.status===404){var e=new Error('fn-missing');e.fnMissing=true;throw e;}
        return r.json().catch(function(){return {};}).then(function(j){return {status:r.status,j:j};});
      }).then(function(res){
        if(!res.j||!res.j.ok||!res.j.token){
          if(res.status===500&&res.j&&/nicht konfiguriert/i.test(res.j.error||'')){
            var e=new Error('fn-unconfigured');e.fnMissing=true;throw e;
          }
          // Token ungueltig/abgelaufen: kein Dienst-Problem — die Login-Seite
          // soll ihre eigene Meldung zeigen, nicht einen alten Fehlertext.
          w.GemaAuth.lastLoginError='';
          return null;
        }
        var u=res.j.user;
        _adoptSession(u,{token:res.j.token,tokenExp:res.j.exp,expires:res.j.exp,remember:true});
        return u;
      }).catch(function(e){
        w.GemaAuth.lastLoginError=(e&&e.fnMissing)
          ? 'Anmeldedienst nicht erreichbar (gema-auth Function fehlt).'
          : 'Anmeldedienst nicht erreichbar — bitte Verbindung pruefen.';
        console.warn('[GemaAuth] Aktivierung fehlgeschlagen: '+w.GemaAuth.lastLoginError);
        return null;
      });
    },
    logout:function(){
      localStorage.removeItem(STORAGE_SESSION);
      try{localStorage.removeItem('_gemaAdminOrigin');}catch(e){}
      try{localStorage.removeItem(NAV_LOGO_CACHE);}catch(e){}
      _adoptedUser=null;
      try{sessionStorage.removeItem(FRESH_KEY);}catch(e){}
      location.href='sys_login.html';
    },

    // Admin-Impersonation: als anderer User anmelden, Admin-Zugang bleibt
    _switchUser:function(userId){
      // GUARD (KRITISCH): Wechseln darf NUR ein Admin — entweder ist der
      // aktuelle Session-User Admin, oder es läuft eine Impersonation, deren
      // Ursprung ein Admin ist. Ohne diesen Check konnte JEDER eingeloggte
      // User per Konsolen-Aufruf GemaAuth._switchUser('<admin-id>') die
      // Session auf einen Admin umschreiben (ohne Passwort).
      if(!_sessionUserIsAdmin()&&!_adminOriginIsAdmin()){
        try{localStorage.removeItem('_gemaAdminOrigin');}catch(e){}
        return;
      }
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
      // Rückkehr zum Ursprungs-Admin beendet die Impersonation
      try{if(localStorage.getItem('_gemaAdminOrigin')===user.id)localStorage.removeItem('_gemaAdminOrigin');}catch(e){}
      var exp=new Date();exp.setDate(exp.getDate()+1);
      var s={userId:user.id,expires:exp.toISOString()};
      try{localStorage.setItem(STORAGE_SESSION,JSON.stringify(s));}catch(e){}
      var dest=_getRedirectForUser(user);
      location.href=dest;
    },
    _isImpersonating:function(){
      // Nur eine ECHTE Admin-Impersonation zählt — ein von Hand gesetzter
      // Marker auf einen Nicht-Admin ist wirkungslos.
      return _adminOriginIsAdmin();
    },
    _getAdminOriginId:function(){
      try{return localStorage.getItem('_gemaAdminOrigin');}catch(e){return null;}
    },
    _stopImpersonating:function(){
      var origId=w.GemaAuth._getAdminOriginId();
      if(!origId)return;
      // Zurückwechseln nur, wenn der hinterlegte Ursprungs-User wirklich
      // Admin ist — sonst wäre der Marker ein Passwort-loser Admin-Login.
      if(!_adminOriginIsAdmin()){
        try{localStorage.removeItem('_gemaAdminOrigin');}catch(e){}
        return;
      }
      // Marker bleibt bis zum Wechsel gesetzt (Guard in _switchUser braucht
      // ihn) — _switchUser räumt ihn bei der Rückkehr zum Ursprung selbst ab.
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

    // Liefern das Persist-Promise ({ok,error,denied}) — Aufrufer, die dem
    // Benutzer «gespeichert» melden, MUESSEN darauf warten und .ok pruefen.
    // Frueher gaben sie synchron `true` zurueck; ein serverseitig
    // abgelehnter Save (403) oder ein Netzfehler blieb dadurch unsichtbar,
    // die UI meldete Erfolg und die Aenderung war nach dem Reload weg.
    // Aufrufer, die den Rueckgabewert ignorieren, sind unveraendert.
    saveOrgs:function(o){
      return _persistCollection(STORAGE_ORGS, o);
    },
    saveOrgCats:function(c){try{localStorage.setItem(STORAGE_ORG_CATS,JSON.stringify(c));return true;}catch(e){return false;}},
    saveUsers:function(u){
      return _persistCollection(STORAGE_USERS, u);
    },
    saveRoles:function(r){
      return _persistCollection(STORAGE_ROLES, r);
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
      // DEFAULTS gibt es nur fuer Orgs (siehe DEFAULT_ORGS) — Benutzer
      // kommen immer aus der Cloud, jeder vorhandene zaehlt also als «echt».
      var defaultOrgIds = DEFAULT_ORGS.map(function(o){return o.id;});
      var nonDefaultOrgs = orgs.filter(function(o){ return defaultOrgIds.indexOf(o.id) < 0; });
      return nonDefaultOrgs.length === 0 && users.length === 0;
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

    // Token-basiertes Erstlogin laeuft ausschliesslich ueber
    // activateInvitationAsync -> gema-auth-Function (action 'activate'):
    // das Passwort landet dort im geschuetzten cred:-Record. Die frueher
    // hier stehende Client-Variante (schrieb user.password direkt) ist
    // entfallen - sie erzeugte eine Session ohne Token, die unter RLS
    // ohnehin nichts lesen kann.

    // Rollenspezifische Weiterleitung nach Login/Aktivierung
    getRedirectForUser:_getRedirectForUser,
    isFreeUser:_isFreeUser,

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
    /* Eigene Startseite der Rolle (Landing nach dem Login). Nötig, damit die
       Navigation nicht in eine Sackgasse zeigt: ein Projektleiter startet im
       Workspace und wird von index.html dorthin zurückgeworfen — ein
       «Übersicht»-Knopf auf index.html wäre für ihn ein No-Op. */
    getLandingPage:function(user){
      var u=user||w.GemaAuth.getCurrentUser();
      if(!u)return'index.html';
      if(_isAdmin(u))return'index.html';
      return _getRedirectForUser(u);
    },
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
      // Das Promise haengt am Gast-Objekt (gast.gespeichert) statt es zu
      // ersetzen — bestehende Aufrufer lesen weiter den Datensatz, neue
      // koennen auf die Server-Antwort warten (Auth-Writes laufen ueber die
      // gema-auth-Function mit serverseitiger Rechtepruefung und koennen
      // abgelehnt werden; ein Org-Admin darf z.B. keinen User einer FREMDEN
      // Org schreiben).
      gast.gespeichert=Promise.resolve(w.GemaAuth.saveUsers(users));
      return gast;
    },
    bewilligeGast:function(userId,orgId,gueltigBis,bewilligtVon){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return;
      var g=user.gastZugaenge.find(function(x){return x.orgId===orgId;});
      if(g){g.status='aktiv';g.gueltigBis=gueltigBis||null;g.bewilligtVon=bewilligtVon||'';}
      return Promise.resolve(w.GemaAuth.saveUsers(users));
    },
    deaktivierGast:function(userId,orgId){
      var users=_getUsers()||[];
      var user=users.find(function(u){return u.id===userId;});
      if(!user||!user.gastZugaenge)return;
      var g=user.gastZugaenge.find(function(x){return x.orgId===orgId;});
      if(g)g.status='deaktiviert';
      return Promise.resolve(w.GemaAuth.saveUsers(users));
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
