/**
 * gema_sync.js — GEMA Cloud-First Sync v1
 *
 * Single source of truth: Supabase.
 * Pro Datensatz eine eigene Row in `gema_data`:
 *   module_key='<modul>'  data_key='<entity>:<id>'  payload={ data, _lm, _id }
 *
 * Saves gehen IMMER zuerst gegen die Cloud. Bei Erfolg wird der lokale
 * In-Memory-Cache aktualisiert. Bei Misserfolg (offline / Netz-Fehler)
 * wird der Aufrufer per Reject benachrichtigt — der Save findet NICHT
 * statt, weder lokal noch remote. localStorage wird fuer diese
 * Datenklassen NICHT mehr beschrieben.
 *
 * Der Aufrufer sieht eine Promise-API. Module die synchron auf Daten
 * zugreifen, halten ihren eigenen In-Memory-Snapshot, der nach jedem
 * erfolgreichen Save aktualisiert wird.
 */
(function(w){
  'use strict';

  var SB_URL = 'https://fjhbqjvaygvhievjgdtm.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGJxanZheWd2aGlldmpnZHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODk5OTUsImV4cCI6MjA4ODI2NTk5NX0.n3AbrEKTWWhI2tnDaf7-Z-QI9o9pJiP1E7BsHVuZY9k';
  var SB_TABLE = 'gema_data';

  var _online = (typeof navigator !== 'undefined' && 'onLine' in navigator) ? navigator.onLine : true;
  var _lastReachable = _online; // Echte Cloud-Erreichbarkeit (nicht nur navigator.onLine)
  var _connListeners = [];
  var _failStreak = 0;          // aufeinanderfolgende echte Netz-/Server-Fehler
  function _setReachable(state){
    if(state === _lastReachable) return;
    _lastReachable = state;
    _connListeners.forEach(function(cb){ try{ cb(state); }catch(e){} });
    _broadcastBanner(state);
    // Verbindung zurueck → die Outbox (nicht synchronisierte Saves) leeren.
    if(state) _scheduleFlush(400);
  }
  // Erfolgreiche Cloud-Antwort: Fehlerzaehler zuruecksetzen, online.
  function _noteSuccess(){ _failStreak = 0; _setReachable(true); }
  // Fehlerklassifikation (Punkt E): Ein 4xx (ausser 408/429) ist KEIN
  // Verbindungsproblem, sondern eine abgelehnte Anfrage — typisch 413
  // (Payload zu gross, bei bildlastigen Records). Das darf NICHT auf
  // "offline" schalten, sonst sieht der User faelschlich "Offline", obwohl
  // das Internet einwandfrei laeuft. Echte Netz-/Server-Fehler (fetch wirft,
  // 5xx, 408, 429) schalten erst nach ZWEI Fehlern in Folge auf offline —
  // ein einzelner Aussetzer soll das Banner nicht ausloesen.
  function _noteFailure(e){
    var msg = (e && e.message) || '';
    var m = /HTTP (\d+)/.exec(msg);
    if(m){
      var code = +m[1];
      if(code >= 400 && code < 500 && code !== 408 && code !== 429) return;
    }
    _failStreak++;
    if(_failStreak >= 2) _setReachable(false);
  }
  if(typeof window !== 'undefined'){
    window.addEventListener('online',  function(){ _online = true;  _probeOnce(); });
    window.addEventListener('offline', function(){ _online = false; _setReachable(false); });
  }

  function _hdrs(extra){
    var h = {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json'
    };
    if(extra) for(var k in extra) h[k] = extra[k];
    return h;
  }

  function _now(){ return new Date().toISOString(); }

  // Sichtbares Banner wenn die Verbindung weg ist (eine Zeile oben).
  // Nur beim ersten Verbindungsverlust gerendert; verschwindet bei Online.
  var _banner = null;
  function _broadcastBanner(reachable){
    if(typeof document === 'undefined') return;
    if(reachable){
      if(_banner){ try{ _banner.remove(); }catch(e){} _banner = null; }
      return;
    }
    if(_banner) return;
    _banner = document.createElement('div');
    _banner.id = 'gema-sync-offline-banner';
    _banner.textContent = '⚠ Offline — Aenderungen werden nicht gespeichert.';
    Object.assign(_banner.style, {
      position:'fixed', top:'0', left:'0', right:'0', zIndex:'10000',
      background:'#b45309', color:'#fff', textAlign:'center',
      padding:'8px 14px', paddingTop:'calc(8px + env(safe-area-inset-top, 0px))',
      fontFamily:'DM Sans,system-ui,sans-serif',
      fontSize:'13px', fontWeight:'600',
      boxShadow:'0 2px 6px rgba(0,0,0,.18)'
    });
    if(document.body) document.body.appendChild(_banner);
    else document.addEventListener('DOMContentLoaded', function(){ if(_banner && !_banner.parentNode) document.body.appendChild(_banner); });
  }

  // Einmaliger Reachability-Check via leichter HEAD-Anfrage
  var _probing = false;
  function _probeOnce(){
    if(_probing) return Promise.resolve(_lastReachable);
    _probing = true;
    return fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?select=module_key&limit=1', {
      headers: _hdrs(), method: 'GET'
    }).then(function(r){
      if(r.ok){ _noteSuccess(); } else { _setReachable(false); }
      return r.ok;
    }).catch(function(){
      _setReachable(false);
      return false;
    }).finally(function(){ _probing = false; });
  }

  /**
   * Lädt alle Records eines Moduls mit gegebenem data_key-Prefix.
   * Liefert Array<{key, data, lm}>. Reject bei Netz-Fehler.
   */
  function loadCollection(moduleKey, prefix){
    var url = SB_URL + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=like.' + encodeURIComponent(prefix) + '*'
      + '&select=data_key,payload';
    return fetch(url, { headers: _hdrs() })
      .then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        _noteSuccess();
        return r.json();
      })
      .then(function(rows){
        if(!Array.isArray(rows)) return [];
        return rows.map(function(row){
          var p = row.payload || {};
          return { key: row.data_key, data: p.data, lm: p._lm || null };
        });
      })
      .catch(function(e){
        _noteFailure(e);
        throw e;
      });
  }

  /**
   * Lädt eine einzelne Record-Row (key inklusive Prefix).
   */
  function loadRecord(moduleKey, dataKey){
    var url = SB_URL + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=eq.' + encodeURIComponent(dataKey)
      + '&select=payload';
    return fetch(url, { headers: _hdrs() })
      .then(function(r){
        if(!r.ok) throw new Error('HTTP ' + r.status);
        _noteSuccess();
        return r.json();
      })
      .then(function(rows){
        if(!Array.isArray(rows) || !rows.length) return null;
        var p = rows[0].payload || {};
        return { key: dataKey, data: p.data, lm: p._lm || null };
      })
      .catch(function(e){
        _noteFailure(e);
        throw e;
      });
  }

  /**
   * Schreibt einen einzelnen Record. Reject bei Netz-Fehler / non-2xx.
   * Setzt automatisch _lm = jetzt.
   */
  // Low-Level: schreibt ein fertiges Body-Array (jeder Eintrag traegt sein
  // eigenes payload inkl. _lm). Wird von saveRecord/saveRecords UND vom
  // Outbox-Flush genutzt. Zentrale Stelle fuer Reachability-Buchhaltung.
  function _postRecords(body, opts){
    return fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?on_conflict=module_key%2Cdata_key', {
      method: 'POST',
      headers: _hdrs({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body),
      keepalive: !!(opts && opts.keepalive)
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      _noteSuccess();
      return true;
    }).catch(function(e){
      _noteFailure(e);
      throw e;
    });
  }

  function saveRecord(moduleKey, dataKey, data, opts){
    var lm = _now();
    var body = [{ module_key: moduleKey, data_key: dataKey, payload: { data: data, _lm: lm } }];
    return _postRecords(body, opts).then(function(){ return { ok:true, lm: lm }; });
  }

  /**
   * Schreibt mehrere Records in einer einzigen POST-Anfrage. Reject bei
   * Netz-Fehler. Atomar im Sinne der Anfrage; bei Teilversagen
   * (sehr selten) gibt PostgREST einen Status zurueck.
   */
  function saveRecords(moduleKey, records, opts){
    if(!records || !records.length) return Promise.resolve({ ok:true, count:0 });
    var lm = _now();
    var body = records.map(function(rec){
      return {
        module_key: moduleKey,
        data_key: rec.key,
        payload: { data: rec.data, _lm: lm }
      };
    });
    return _postRecords(body, opts).then(function(){
      return { ok:true, count: records.length, lm: lm };
    });
  }

  /**
   * Hartes Loeschen einer einzelnen Record-Row.
   */
  function deleteRecord(moduleKey, dataKey, opts){
    var url = SB_URL + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=eq.' + encodeURIComponent(dataKey);
    return fetch(url, { method:'DELETE', headers: _hdrs(), keepalive: !!(opts && opts.keepalive) })
      .then(function(r){
        if(!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
        _noteSuccess();
        return { ok:true };
      })
      .catch(function(e){
        _noteFailure(e);
        throw e;
      });
  }

  /**
   * Hartes Loeschen mehrerer Rows (eine Anfrage pro Key — PostgREST kann
   * keine Bulk-Deletes ueber mehrere Schluessel in einer Anfrage).
   */
  function deleteRecords(moduleKey, dataKeys, opts){
    if(!dataKeys || !dataKeys.length) return Promise.resolve({ ok:true, count:0 });
    return Promise.all(dataKeys.map(function(k){ return deleteRecord(moduleKey, k, opts); }))
      .then(function(){ return { ok:true, count: dataKeys.length }; });
  }

  /**
   * Diff zweier Arrays nach idField. Gibt zurueck welche Records neu/
   * geaendert sind (ohne deep-equal — alle die im neuen Array sind und
   * sich vom alten unterscheiden) und welche entfernt wurden.
   */
  function diffArrays(oldArr, newArr, idField){
    oldArr = Array.isArray(oldArr) ? oldArr : [];
    newArr = Array.isArray(newArr) ? newArr : [];
    var oldMap = {};
    oldArr.forEach(function(o){ if(o && o[idField] != null) oldMap[o[idField]] = o; });
    var newIds = {};
    var toUpsert = [];
    newArr.forEach(function(n){
      if(!n || n[idField] == null) return;
      newIds[n[idField]] = true;
      var prev = oldMap[n[idField]];
      if(!prev || JSON.stringify(prev) !== JSON.stringify(n)){
        toUpsert.push(n);
      }
    });
    var toDelete = [];
    oldArr.forEach(function(o){
      if(o && o[idField] != null && !newIds[o[idField]]) toDelete.push(o[idField]);
    });
    return { toUpsert: toUpsert, toDelete: toDelete };
  }

  // Eine Promise-Variante des Diff-Saves: bekommt altes/neues Array,
  // schreibt nur die geaenderten Records, loescht die entfernten.
  // Liefert { upserted, deleted } oder reject bei Fehler.
  function saveDiff(moduleKey, prefix, oldArr, newArr, idField, opts){
    var d = diffArrays(oldArr, newArr, idField);
    if(!d.toUpsert.length && !d.toDelete.length){
      return Promise.resolve({ upserted:0, deleted:0 });
    }
    var upserts = d.toUpsert.map(function(it){
      return { key: prefix + it[idField], data: it };
    });
    return saveRecords(moduleKey, upserts, opts).then(function(){
      if(!d.toDelete.length) return { upserted: upserts.length, deleted: 0 };
      var keys = d.toDelete.map(function(id){ return prefix + id; });
      return deleteRecords(moduleKey, keys, opts).then(function(){
        return { upserted: upserts.length, deleted: keys.length };
      });
    });
  }

  // ── Collection-Helper (wiederverwendbar fuer Module) ─────────────
  // bindCollection: laedt eine Collection aus der Cloud, schreibt sie
  //                 in localStorage[storageKey] als sync-Cache. Migriert
  //                 alte Blob-Rows automatisch. Liefert Promise<Array>.
  // persistCollection: nimmt newArr, vergleicht mit localStorage[storageKey],
  //                    pusht nur geaenderte Records, loescht entfernte.
  //                    Bei Erfolg wird der Cache aktualisiert. Bei Offline:
  //                    KEIN Save, Reject mit klarer Fehlermeldung.
  function _legacyBlobFetch(moduleKey, storageKey){
    var url = SB_URL + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=eq.' + encodeURIComponent(storageKey)
      + '&select=payload';
    return fetch(url, { headers: _hdrs() })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(rows){
        if(!Array.isArray(rows) || !rows.length) return null;
        var p = rows[0].payload;
        if(!p) return null;
        // Alte Blob-Form: { v: '<json>' } oder { v: <object> }
        if(p.v != null){
          try{
            var v = typeof p.v === 'string' ? JSON.parse(p.v) : p.v;
            return Array.isArray(v) ? v : null;
          }catch(e){ return null; }
        }
        return null;
      })
      .catch(function(){ return null; });
  }

  // In-Memory-Spiegel der Collection-Caches. Schluessel: storageKey ->
  // JSON-String des zuletzt synchronisierten Arrays. Ueberlebt einen
  // fehlgeschlagenen localStorage-Write (Quota). Wird ueber getCached()
  // bereitgestellt, damit Module ihre Diff-Baseline / fremde Records
  // verlaesslich beziehen koennen (opts.baseline) — auch wenn der
  // localStorage-Cache bei bildlastigen Berichten am Quota gescheitert ist.
  // OHNE diese verlaessliche Baseline wuerde der naechste Save ALLE Records
  // statt nur der geaenderten in EINEM riesigen POST hochladen und an der
  // Server-Groessengrenze scheitern (413 → "Speichern fehlgeschlagen").
  var _memCache = {};
  function _writeCache(storageKey, arr){
    var json;
    try{ json = JSON.stringify(arr||[]); }catch(e){ json = '[]'; }
    _memCache[storageKey] = json;
    if(typeof localStorage === 'undefined') return;
    try{ localStorage.setItem(storageKey, json); }
    catch(e){
      // Haeufigster Fall: QuotaExceededError, wenn die Collection grosse
      // Base64-Bilder enthaelt (Dach-/Schadensberichte). Der In-Memory-
      // Spiegel haelt den aktuellen Stand fuer diese Sitzung. Den (evtl.
      // veralteten, nur teilweise passenden) localStorage-Eintrag JETZT
      // entfernen, damit er nicht weiter das knappe Quota belegt — sonst
      // koennen andere localStorage-Nutzer auf derselben Seite (Feedback,
      // Auth, kleinere Module) ebenfalls nicht mehr schreiben. Beim
      // naechsten Seitenstart laedt bindCollection ohnehin frisch aus der
      // Cloud (Single Source of Truth), der Cache ist nur Beschleuniger.
      try{ localStorage.removeItem(storageKey); }catch(_e){}
      try{ console.warn('[GemaSync] _writeCache('+storageKey+') fehlgeschlagen (Quota?) — localStorage-Cache entfernt, In-Memory-Spiegel aktiv:', e && e.name); }catch(_e2){}
    }
  }
  // KANONISCHER Lese-Pfad fuer Collection-Caches (auch als
  // GemaSync.getCached exponiert — Module sollen NIE direkt
  // localStorage.getItem fuer Cloud-Collections nutzen):
  //   1. localStorage zuerst — kann von anderen Tabs aktualisiert worden
  //      sein und ist im Normalfall identisch mit dem Spiegel.
  //   2. In-Memory-Spiegel als Fallback — greift, wenn der localStorage-
  //      Eintrag fehlt (z.B. nach Quota-Fehler von _writeCache entfernt).
  //      Der Spiegel haelt immer den zuletzt synchronisierten Cloud-Stand.
  // Da _writeCache bei Quota-Fehler den localStorage-Eintrag ENTFERNT
  // (statt ihn veraltet stehen zu lassen), ist localStorage entweder
  // frisch oder abwesend — diese Reihenfolge ist daher immer korrekt.
  // Dient auch als Diff-Baseline in _doPersist.
  function _readCache(storageKey){
    if(typeof localStorage !== 'undefined'){
      try{
        var raw = localStorage.getItem(storageKey);
        if(raw != null){
          var arr = JSON.parse(raw);
          if(Array.isArray(arr)) return arr;
        }
      }catch(e){ /* fallthrough zum Spiegel */ }
    }
    if(_memCache[storageKey] != null){
      try{
        var m = JSON.parse(_memCache[storageKey]);
        if(Array.isArray(m)) return m;
      }catch(e){ /* noop */ }
    }
    return [];
  }

  function bindCollection(moduleKey, storageKey, prefix, idField){
    if(!idField) idField = 'id';
    return loadCollection(moduleKey, prefix).then(function(rows){
      if(rows && rows.length){
        var arr = rows.map(function(r){ return r.data; }).filter(function(d){ return d && d[idField] != null; });
        // Noch nicht synchronisierte (Outbox-)Aenderungen ueberlagern den
        // Cloud-Stand → lokal gesicherte Eintraege bleiben nach Reload sichtbar.
        arr = _outboxApplyTo(moduleKey, prefix, idField, arr);
        _writeCache(storageKey, arr);
        return arr;
      }
      // Keine Per-Record-Daten — pruefe ob alte Blob-Row da ist
      return _legacyBlobFetch(moduleKey, storageKey).then(function(blob){
        if(!Array.isArray(blob) || !blob.length){
          // loadCollection war erfolgreich (Cloud erreichbar) und liefert
          // 0 Per-Record-Rows, und es gibt keine alte Blob-Row → die
          // Collection ist in der Cloud WIRKLICH leer (z.B. der letzte
          // Datensatz wurde geloescht). Den lokalen Cache JETZT leeren,
          // sonst zeigt das Geraet geloeschte/veraltete Datensaetze
          // dauerhaft weiter (Cloud gewinnt). Bei Offline laeuft dieser
          // Pfad nicht — dann rejected loadCollection und der aeussere
          // .catch behaelt den Cache.
          var emptied = _outboxApplyTo(moduleKey, prefix, idField, []);
          _writeCache(storageKey, emptied);
          return emptied;
        }
        var records = blob.filter(function(it){ return it && it[idField] != null; })
                          .map(function(it){ return { key: prefix + it[idField], data: it }; });
        if(!records.length){ _writeCache(storageKey, []); return []; }
        return saveRecords(moduleKey, records).then(function(){
          return deleteRecord(moduleKey, storageKey).then(function(){
            _writeCache(storageKey, blob);
            console.info('[GemaSync] Migration: '+moduleKey+'/'+storageKey+' → '+records.length+' Records');
            return blob;
          });
        });
      });
    }).catch(function(e){
      console.warn('[GemaSync] bindCollection('+moduleKey+'/'+storageKey+') fehlgeschlagen:', e && e.message);
      return _readCache(storageKey);
    });
  }

  // ── Outbox: verlustfreie Warteschlange fuer nicht synchronisierte Saves ──
  // Jeder fehlgeschlagene Cloud-Push landet hier dauerhaft (localStorage) und
  // wird automatisch nachgesendet — bei Reconnect, periodisch, beim Seiten-
  // start und vor dem Entladen. Schluessel: moduleKey|dataKey, neueste
  // Operation gewinnt. Dadurch geht eine Aenderung NIE verloren, selbst wenn
  // der Cloud-POST scheitert (Netz, 413, Timeout) oder die Seite neu laedt.
  var OUTBOX_KEY = 'gema_sync_outbox_v1';
  var _outboxMem = null;
  function _outboxLoad(){
    if(_outboxMem) return _outboxMem;
    _outboxMem = {};
    try{
      if(typeof localStorage !== 'undefined'){
        var raw = localStorage.getItem(OUTBOX_KEY);
        if(raw){ var o = JSON.parse(raw); if(o && o.ops) _outboxMem = o.ops; }
      }
    }catch(e){ _outboxMem = {}; }
    return _outboxMem;
  }
  function _outboxPersist(){
    if(typeof localStorage === 'undefined') return;
    try{ localStorage.setItem(OUTBOX_KEY, JSON.stringify({ ops: _outboxMem || {} })); }
    catch(e){ /* In-Memory-Spiegel haelt den Stand fuer diese Sitzung */ }
  }
  function _outboxEnqueue(moduleKey, upserts, delKeys){
    var ob = _outboxLoad();
    var lm = _now();
    (upserts || []).forEach(function(rec){
      ob[moduleKey + '|' + rec.key] = { m: moduleKey, key: rec.key, type: 'up', data: rec.data, lm: lm };
    });
    (delKeys || []).forEach(function(k){
      ob[moduleKey + '|' + k] = { m: moduleKey, key: k, type: 'del', lm: lm };
    });
    _outboxPersist();
  }
  function _outboxCount(){ return Object.keys(_outboxLoad()).length; }
  // Entfernt Eintraege fuer bereits erfolgreich gepushte Records — sonst
  // koennte ein spaeter geflushter, veralteter Outbox-Eintrag den frischen
  // Cloud-Stand desselben Records ueberschreiben (Regression).
  function _outboxClear(moduleKey, keys){
    var ob = _outboxLoad(), changed = false;
    (keys || []).forEach(function(k){ var kk = moduleKey + '|' + k; if(ob[kk]){ delete ob[kk]; changed = true; } });
    if(changed) _outboxPersist();
  }

  var _flushTimer = null, _flushing = false;
  function _scheduleFlush(delay){
    if(_flushTimer || _flushing) return;
    if(typeof setTimeout === 'undefined') return;
    if(!_outboxCount()) return;
    _flushTimer = setTimeout(function(){ _flushTimer = null; _outboxFlush(); }, delay || 4000);
  }
  // Sendet alle eingereihten Operationen, gruppiert nach Modul. Erfolgreich
  // gesendete Eintraege werden aus der Outbox entfernt; fehlgeschlagene
  // bleiben fuer den naechsten Versuch. opts.keepalive fuer den Unload-Pfad.
  function _outboxFlush(opts){
    if(_flushing) return Promise.resolve();
    var ob = _outboxLoad();
    var keys = Object.keys(ob);
    if(!keys.length) return Promise.resolve();
    _flushing = true;
    var byModule = {};
    keys.forEach(function(k){ var op = ob[k]; (byModule[op.m] = byModule[op.m] || []).push(op); });
    var chain = Promise.resolve();
    Object.keys(byModule).forEach(function(m){
      chain = chain.then(function(){
        var ops = byModule[m];
        var ups = ops.filter(function(o){ return o.type === 'up'; });
        var dels = ops.filter(function(o){ return o.type === 'del'; });
        var step = Promise.resolve();
        if(ups.length){
          var body = ups.map(function(o){ return { module_key: m, data_key: o.key, payload: { data: o.data, _lm: o.lm } }; });
          step = step.then(function(){ return _postRecords(body, opts); }).then(function(){
            ups.forEach(function(o){ delete _outboxMem[m + '|' + o.key]; });
          });
        }
        if(dels.length){
          step = step.then(function(){ return deleteRecords(m, dels.map(function(o){ return o.key; }), opts); }).then(function(){
            dels.forEach(function(o){ delete _outboxMem[m + '|' + o.key]; });
          });
        }
        return step;
      });
    });
    return chain.then(function(){
      _flushing = false; _outboxPersist();
    }, function(e){
      // Teilerfolg moeglich — bereits gesendete Eintraege sind raus.
      _flushing = false; _outboxPersist();
      if(_outboxCount()) _scheduleFlush(15000); // spaeter erneut versuchen
    });
  }
  // Legt ausstehende (noch nicht synchronisierte) Outbox-Operationen ueber ein
  // frisch aus der Cloud geladenes Array — so bleiben lokal gespeicherte, aber
  // noch nicht hochgeladene Aenderungen nach einem Reload sichtbar, bis der
  // Flush sie in die Cloud bringt.
  function _outboxApplyTo(moduleKey, prefix, idField, arr){
    var ob = _outboxLoad();
    var keys = Object.keys(ob).filter(function(k){ return ob[k].m === moduleKey; });
    if(!keys.length) return arr || [];
    var byId = {};
    (arr || []).forEach(function(it){ if(it && it[idField] != null) byId[it[idField]] = it; });
    keys.forEach(function(k){
      var op = ob[k];
      var id = (op.key.indexOf(prefix) === 0) ? op.key.slice(prefix.length) : op.key;
      if(op.type === 'del'){ delete byId[id]; }
      else if(op.type === 'up' && op.data){ byId[id] = op.data; }
    });
    return Object.keys(byId).map(function(id){ return byId[id]; });
  }

  function persistCollection(moduleKey, storageKey, prefix, idField, newArr, opts){
    if(!idField) idField = 'id';
    // opts.baseline: explizite Diff-Baseline (voller zuletzt-synchronisierter
    // Satz). Module, die aus dem Cloud-Array rendern, uebergeben sie, damit
    // der Diff nicht den (evtl. leeren) localStorage-Cache als Baseline nimmt.
    var oldArr = (opts && Array.isArray(opts.baseline)) ? opts.baseline : _readCache(storageKey);
    var d = diffArrays(oldArr, newArr, idField);

    // ── A: Lokale Persistenz IMMER zuerst ──────────────────────────────
    // Der neue Stand ist sofort dauerhaft (localStorage + In-Memory-Spiegel),
    // unabhaengig davon ob der Cloud-Push gleich klappt. Damit geht bei einem
    // fehlgeschlagenen POST (Netz, 413, Timeout) oder einem Reload NIE etwas
    // verloren — die fehlenden Records holt die Outbox spaeter nach.
    _writeCache(storageKey, newArr);

    if(!d.toUpsert.length && !d.toDelete.length){
      return Promise.resolve({ upserted:0, deleted:0, queued:false });
    }
    var upserts = d.toUpsert.map(function(it){ return { key: prefix + it[idField], data: it }; });
    var delKeys = d.toDelete.map(function(id){ return prefix + id; });

    function _push(){
      return saveRecords(moduleKey, upserts, opts).then(function(){
        if(!delKeys.length) return null;
        return deleteRecords(moduleKey, delKeys, opts);
      }).then(function(){
        // Erfolgreich in der Cloud → evtl. aeltere Outbox-Eintraege fuer
        // dieselben Records verwerfen, damit sie den frischen Stand nicht
        // spaeter ueberschreiben.
        _outboxClear(moduleKey, upserts.map(function(r){ return r.key; }).concat(delKeys));
        return { upserted: upserts.length, deleted: delKeys.length, queued:false };
      });
    }
    // ── B: Cloud-Push scheitert → in die Outbox (verlustfrei nachsenden) ──
    function _queueAndReject(e){
      _outboxEnqueue(moduleKey, upserts, delKeys);
      _scheduleFlush(2000);
      var err = new Error('Sync verzoegert — lokal gespeichert, wird automatisch nachgeholt');
      err.queued = true; err.cause = e;
      return Promise.reject(err);
    }

    // keepalive-Saves (Seite wird entladen) nicht durch einen Probe verzoegern.
    if(!_lastReachable && !(opts && opts.keepalive)){
      return _probeOnce().then(function(reachable){
        if(!reachable) return _queueAndReject(new Error('offline'));
        return _push().catch(_queueAndReject);
      });
    }
    return _push().catch(_queueAndReject);
  }

  // Public API
  w.GemaSync = {
    SB_URL: SB_URL,
    SB_KEY: SB_KEY,
    SB_TABLE: SB_TABLE,

    isOnline: function(){ return _online && _lastReachable; },
    isReachable: function(){ return _lastReachable; },
    probe: _probeOnce,
    onConnectivityChange: function(cb){ if(typeof cb === 'function') _connListeners.push(cb); },

    loadCollection: loadCollection,
    loadRecord: loadRecord,
    saveRecord: saveRecord,
    saveRecords: saveRecords,
    deleteRecord: deleteRecord,
    deleteRecords: deleteRecords,
    diffArrays: diffArrays,
    saveDiff: saveDiff,

    // Wiederverwendbar fuer Module
    bindCollection: bindCollection,
    persistCollection: persistCollection,
    // Liefert den zuletzt synchronisierten Stand einer Collection aus dem
    // In-Memory-Spiegel (Fallback: localStorage). Wird gebraucht, wenn ein
    // Modul beim Persistieren fremde Records (z.B. andere Orgs) aus dem
    // vollen Cloud-Satz erhalten muss — verlaesslich auch wenn der
    // localStorage-Cache am Quota gescheitert/entfernt wurde.
    getCached: function(storageKey){ return _readCache(storageKey); },

    // Outbox: nicht synchronisierte Saves manuell nachsenden / Anzahl abfragen.
    flushOutbox: function(opts){ return _outboxFlush(opts); },
    pendingCount: _outboxCount
  };

  // ── C: Flush-Ausloeser ──────────────────────────────────────────────
  // Outbox bei jeder Gelegenheit leeren, damit nicht synchronisierte Saves
  // verlaesslich in die Cloud kommen — Webhooks/Events decken nicht alles ab.
  if(typeof window !== 'undefined'){
    // Beim Verlassen/Verstecken der Seite: keepalive-Flush, damit der letzte
    // Save eine Navigation ueberlebt (fetch keepalive laeuft nach Unload weiter).
    var _flushOnHide = function(){ try{ _outboxFlush({ keepalive:true }); }catch(e){} };
    window.addEventListener('pagehide', _flushOnHide);
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'hidden') _flushOnHide();
    });
    // Sichtbar/aktiv geworden → erneut versuchen.
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'visible') _scheduleFlush(800);
    });
    // Periodisches Sicherheitsnetz.
    if(typeof setInterval !== 'undefined'){
      setInterval(function(){ if(_outboxCount() && (_online || _lastReachable)) _outboxFlush(); }, 60000);
    }
    // Seitenstart: evtl. liegt noch etwas aus einer fruerheren Sitzung herum.
    _scheduleFlush(2500);
  }

})(window);
