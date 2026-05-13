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
  function _setReachable(state){
    if(state === _lastReachable) return;
    _lastReachable = state;
    _connListeners.forEach(function(cb){ try{ cb(state); }catch(e){} });
    _broadcastBanner(state);
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
      padding:'8px 14px', fontFamily:'DM Sans,system-ui,sans-serif',
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
      _setReachable(r.ok);
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
        _setReachable(true);
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
        _setReachable(false);
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
        _setReachable(true);
        return r.json();
      })
      .then(function(rows){
        if(!Array.isArray(rows) || !rows.length) return null;
        var p = rows[0].payload || {};
        return { key: dataKey, data: p.data, lm: p._lm || null };
      })
      .catch(function(e){
        _setReachable(false);
        throw e;
      });
  }

  /**
   * Schreibt einen einzelnen Record. Reject bei Netz-Fehler / non-2xx.
   * Setzt automatisch _lm = jetzt.
   */
  function saveRecord(moduleKey, dataKey, data){
    var lm = _now();
    var body = { module_key: moduleKey, data_key: dataKey, payload: { data: data, _lm: lm } };
    return fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?on_conflict=module_key%2Cdata_key', {
      method: 'POST',
      headers: _hdrs({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body)
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      _setReachable(true);
      return { ok:true, lm: lm };
    }).catch(function(e){
      _setReachable(false);
      throw e;
    });
  }

  /**
   * Schreibt mehrere Records in einer einzigen POST-Anfrage. Reject bei
   * Netz-Fehler. Atomar im Sinne der Anfrage; bei Teilversagen
   * (sehr selten) gibt PostgREST einen Status zurueck.
   */
  function saveRecords(moduleKey, records){
    if(!records || !records.length) return Promise.resolve({ ok:true, count:0 });
    var lm = _now();
    var body = records.map(function(rec){
      return {
        module_key: moduleKey,
        data_key: rec.key,
        payload: { data: rec.data, _lm: lm }
      };
    });
    return fetch(SB_URL + '/rest/v1/' + SB_TABLE + '?on_conflict=module_key%2Cdata_key', {
      method: 'POST',
      headers: _hdrs({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body)
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      _setReachable(true);
      return { ok:true, count: records.length, lm: lm };
    }).catch(function(e){
      _setReachable(false);
      throw e;
    });
  }

  /**
   * Hartes Loeschen einer einzelnen Record-Row.
   */
  function deleteRecord(moduleKey, dataKey){
    var url = SB_URL + '/rest/v1/' + SB_TABLE
      + '?module_key=eq.' + encodeURIComponent(moduleKey)
      + '&data_key=eq.' + encodeURIComponent(dataKey);
    return fetch(url, { method:'DELETE', headers: _hdrs() })
      .then(function(r){
        if(!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
        _setReachable(true);
        return { ok:true };
      })
      .catch(function(e){
        _setReachable(false);
        throw e;
      });
  }

  /**
   * Hartes Loeschen mehrerer Rows (eine Anfrage pro Key — PostgREST kann
   * keine Bulk-Deletes ueber mehrere Schluessel in einer Anfrage).
   */
  function deleteRecords(moduleKey, dataKeys){
    if(!dataKeys || !dataKeys.length) return Promise.resolve({ ok:true, count:0 });
    return Promise.all(dataKeys.map(function(k){ return deleteRecord(moduleKey, k); }))
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
  function saveDiff(moduleKey, prefix, oldArr, newArr, idField){
    var d = diffArrays(oldArr, newArr, idField);
    if(!d.toUpsert.length && !d.toDelete.length){
      return Promise.resolve({ upserted:0, deleted:0 });
    }
    var upserts = d.toUpsert.map(function(it){
      return { key: prefix + it[idField], data: it };
    });
    return saveRecords(moduleKey, upserts).then(function(){
      if(!d.toDelete.length) return { upserted: upserts.length, deleted: 0 };
      var keys = d.toDelete.map(function(id){ return prefix + id; });
      return deleteRecords(moduleKey, keys).then(function(){
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

  function _writeCache(storageKey, arr){
    if(typeof localStorage === 'undefined') return;
    try{ localStorage.setItem(storageKey, JSON.stringify(arr||[])); }catch(e){}
  }
  function _readCache(storageKey){
    if(typeof localStorage === 'undefined') return [];
    try{ return JSON.parse(localStorage.getItem(storageKey) || '[]'); }catch(e){ return []; }
  }

  function bindCollection(moduleKey, storageKey, prefix, idField){
    if(!idField) idField = 'id';
    return loadCollection(moduleKey, prefix).then(function(rows){
      if(rows && rows.length){
        var arr = rows.map(function(r){ return r.data; }).filter(function(d){ return d && d[idField] != null; });
        _writeCache(storageKey, arr);
        return arr;
      }
      // Keine Per-Record-Daten — pruefe ob alte Blob-Row da ist
      return _legacyBlobFetch(moduleKey, storageKey).then(function(blob){
        if(!Array.isArray(blob) || !blob.length) return _readCache(storageKey);
        var records = blob.filter(function(it){ return it && it[idField] != null; })
                          .map(function(it){ return { key: prefix + it[idField], data: it }; });
        if(!records.length){ return _readCache(storageKey); }
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

  function persistCollection(moduleKey, storageKey, prefix, idField, newArr){
    if(!idField) idField = 'id';
    if(!_lastReachable){
      return _probeOnce().then(function(reachable){
        if(!reachable) return Promise.reject(new Error('Offline — Save blockiert'));
        return _doPersist(moduleKey, storageKey, prefix, idField, newArr);
      });
    }
    return _doPersist(moduleKey, storageKey, prefix, idField, newArr);
  }
  function _doPersist(moduleKey, storageKey, prefix, idField, newArr){
    var oldArr = _readCache(storageKey);
    return saveDiff(moduleKey, prefix, oldArr, newArr, idField).then(function(res){
      _writeCache(storageKey, newArr);
      return res;
    });
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
    persistCollection: persistCollection
  };

})(window);
