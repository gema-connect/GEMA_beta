/* ═══════════════════════════════════════════════════════════════════
   GEMA Foto-Warteschlange (gema_fotoqueue.js) — geteilte OFFLINE-Ablage
   für Baustellen-Fotos in INDEXEDDB statt im Datensatz/localStorage.

   Problem (Prüfbericht-Feedback 30.07.2026, Bericht 3 — galt genauso für
   Schadensbericht, Dachbericht, Abnahmeprotokoll, Regierapport, Stunden,
   Plandialog): Scheitert der GemaStorage-Upload (offline), blieb das Foto
   als Base64 IM RECORD — der localStorage-Pool-Cache (~5 MB auf iOS,
   geteilt über ALLE Module) lief nach wenigen Fotos voll und die Erfassung
   blockierte («Speicher voll»). IndexedDB fasst hunderte MB.

   Muster (Kanon pm_pruefliste, hier generalisiert):
   - Der Record trägt statt `dataUrl` nur ein kleines `pendingId`
     (Foto-Objekte) bzw. den String `idbfoto:<pid>` (String-Felder wie
     m.foto im Schadensbericht oder pin.fotos[] in der Abnahme).
   - Das Bild liegt lokal in EINER IndexedDB (`gema_fotoqueue_v1`, Store
     `fotos`, Keys `<scope>|<pid>` — alle Module teilen die DB, jedes hat
     seinen Scope).
   - KRITISCH — synchroner Memory-Spiegel: die Render-Pfade lesen die
     Queue SYNCHRON (`get`/`src`), IndexedDB ist async. `scope()` startet
     das Laden des Spiegels sofort; `put` schreibt den Spiegel synchron
     (kann nicht scheitern → die Erfassung blockiert nie) + IDB async.
   - Nachsenden: der generische `upload()`-Runner lädt wartende Bilder
     nach GemaStorage, setzt die URL im Record (Modul-Setter) und räumt
     verwaiste Einträge ab; `auto()` verdrahtet online-Event + Intervall.
   - Cross-Device: ein fremdes Gerät sieht `pendingId` ohne lokales Bild →
     `src()` liefert den PLATZHALTER («Foto wird übertragen») statt eines
     toten Bildes. Das Foto erreicht die Cloud erst, wenn das
     Erfasser-Gerät online war — wie beim früheren Base64-in-Record-Weg
     (auch der ging erst mit der Outbox online raus).
   - Ohne IndexedDB (exotisch): `verfuegbar()` = false → die Module gehen
     ihren bisherigen dataUrl-Weg (Fallback bleibt).
   Altdaten mit `dataUrl` im Record bleiben unangetastet lesbar; die
   bestehenden Upload-Läufe der Module lagern sie weiter aus.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if (window.GemaFotoQueue) return;

  var DB_NAME = 'gema_fotoqueue_v1', STORE = 'fotos';
  var _dbP = null;

  var PLATZHALTER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
    + '<rect width="400" height="300" fill="#f1f5f9"/>'
    + '<rect x="6" y="6" width="388" height="288" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="8 6" rx="10"/>'
    + '<text x="200" y="140" font-family="sans-serif" font-size="40" text-anchor="middle">⏳</text>'
    + '<text x="200" y="180" font-family="sans-serif" font-size="16" fill="#64748b" text-anchor="middle">Foto wird übertragen …</text>'
    + '<text x="200" y="202" font-family="sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">(wartet auf dem Aufnahme-Gerät auf Internet)</text>'
    + '</svg>');

  function verfuegbar(){ return !!window.indexedDB; }

  function _open(){
    if (_dbP) return _dbP;
    _dbP = new Promise(function(res){
      if (!window.indexedDB) return res(null);
      try {
        var rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = function(){ try { rq.result.createObjectStore(STORE); } catch(e){} };
        rq.onsuccess = function(){ res(rq.result); };
        rq.onerror = function(){ res(null); };
        rq.onblocked = function(){ res(null); };
      } catch(e){ res(null); }
    });
    return _dbP;
  }
  function _idb(mode, fn){   // fn(store); Promise<ok:bool>
    return _open().then(function(db){
      if (!db) return false;
      return new Promise(function(res){
        try {
          var tx = db.transaction(STORE, mode);
          fn(tx.objectStore(STORE));
          tx.oncomplete = function(){ res(true); };
          tx.onerror = tx.onabort = function(){ res(false); };
        } catch(e){ res(false); }
      });
    });
  }

  var _scopes = {};
  function scope(name){
    if (_scopes[name]) return _scopes[name];
    var mem = null, initP = null, warned = false, lauft = false;
    var prefix = name + '|';

    function init(){
      if (initP) return initP;
      initP = _open().then(function(db){
        if (!db){ mem = mem || {}; return; }
        return new Promise(function(res){
          var out = {};
          try {
            var rq = db.transaction(STORE, 'readonly').objectStore(STORE)
              .openCursor(IDBKeyRange.bound(prefix, prefix + '￿'));
            rq.onsuccess = function(){
              var c = rq.result;
              if (c){ out[String(c.key).slice(prefix.length)] = c.value; c['continue'](); }
              else res(out);
            };
            rq.onerror = function(){ res(out); };
          } catch(e){ res(out); }
        }).then(function(idbMap){
          /* Frühe Puts (vor Init-Abschluss) behalten — nie überschreiben */
          var m = mem || {};
          Object.keys(idbMap).forEach(function(k){ if (!(k in m)) m[k] = idbMap[k]; });
          mem = m;
        });
      }).catch(function(){ mem = mem || {}; });
      return initP;
    }

    var api = {
      name: name,
      init: init,
      /* Bild ablegen → pendingId (synchron; blockiert nie) */
      put: function(dataUrl){
        var pid = 'pf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        if (mem === null) mem = {};
        mem[pid] = dataUrl;
        _idb('readwrite', function(st){ st.put(dataUrl, prefix + pid); }).then(function(ok){
          if (!ok && !warned){
            warned = true;
            try { console.warn('[GemaFotoQueue] IndexedDB nicht verfügbar (' + name + ') — Foto nur im Sitzungsspeicher; Upload läuft, sobald online.'); } catch(e){}
          }
        });
        return pid;
      },
      get: function(pid){ return (pid && mem && mem[pid]) || ''; },
      del: function(pid){
        if (!pid) return;
        if (mem) delete mem[pid];
        _idb('readwrite', function(st){ st['delete'](prefix + pid); });
      },
      ids: function(){ return mem ? Object.keys(mem) : []; },
      /* Standard-Resolver für {url | pendingId | dataUrl}-Foto-Objekte */
      src: function(f){
        if (!f) return '';
        if (f.url) return f.url;
        if (f.pendingId) return api.get(f.pendingId) || PLATZHALTER;
        return f.dataUrl || '';
      },
      /* Resolver für String-Felder (Konvention `idbfoto:<pid>`) */
      srcStr: function(s){
        if (typeof s !== 'string' || s.indexOf('idbfoto:') !== 0) return s || '';
        return api.get(s.slice(8)) || PLATZHALTER;
      },
      wartet: function(f){ return !!(f && !f.url && f.pendingId); },
      /* Tiefe Kopie eines Records für EXPORTE (Print/jsPDF/Word): pendingId-
         Objekte und idbfoto:-Strings werden mit dem lokalen Bild materialisiert
         (fehlt es — fremdes Gerät — steht der Platzhalter statt eines toten
         Bildes). Der Original-Record bleibt unangetastet (nie re-bloaten). */
      materialize: function(rec){
        var kopie;
        try { kopie = JSON.parse(JSON.stringify(rec)); } catch(e){ return rec; }
        (function walk(o){
          if (!o || typeof o !== 'object') return;
          if (Array.isArray(o)){
            o.forEach(function(v, i){
              if (typeof v === 'string' && v.indexOf('idbfoto:') === 0) o[i] = api.srcStr(v);
              else walk(v);
            });
            return;
          }
          if (o.pendingId && !o.url && !o.dataUrl){
            o.dataUrl = api.get(o.pendingId) || PLATZHALTER;
            delete o.pendingId;
          }
          Object.keys(o).forEach(function(k){
            var v = o[k];
            if (typeof v === 'string' && v.indexOf('idbfoto:') === 0) o[k] = api.srcStr(v);
            else walk(v);
          });
        })(kopie);
        return kopie;
      },
      /* Generischer Nachsende-Runner.
         opts.pfad    : GemaStorage-Pfad (String oder Funktion)
         opts.stellen : fn(pid) → Array von Setter-Funktionen set(url).
                        Leere Liste = Eintrag ist verwaist → wird gelöscht.
         opts.fertig  : fn(n) — läuft nach ≥1 erfolgreichem Upload
                        (Modul speichert die geänderten Records + re-rendert). */
      upload: function(opts){
        if (lauft) return Promise.resolve(0);
        if (typeof window.GemaStorage === 'undefined' || !window.GemaStorage.isConfigured || !window.GemaStorage.isConfigured()) return Promise.resolve(0);
        lauft = true;
        return init().then(function(){
          var ids = api.ids(), n = 0;
          if (!ids.length) return 0;
          return ids.reduce(function(p, pid){
            return p.then(function(){
              var stellen = [];
              try { stellen = opts.stellen(pid) || []; } catch(e){}
              if (!stellen.length){
                /* Verwaist → aufräumen, aber NUR wenn der Eintrag älter als
                   48 h ist (Alter steckt in der pid): ein zweiter Tab darf
                   nie das Bild eines noch UNGESPEICHERTEN Dialogs/Rapports
                   wegräumen, das sein Scan nicht sehen kann. */
                var ts = 0;
                try { ts = parseInt(String(pid).split('_')[1], 36) || 0; } catch(e){}
                if (ts && (Date.now() - ts) > 48 * 3600 * 1000) api.del(pid);
                return;
              }
              var du = api.get(pid);
              if (!du) return;
              var pfad = (typeof opts.pfad === 'function') ? opts.pfad() : opts.pfad;
              return window.GemaStorage.uploadDataUrl(du, pfad).then(function(res){
                if (!res || !res.url) return;
                stellen.forEach(function(set){ try { set(res.url); } catch(e){} });
                api.del(pid); n++;
              }).catch(function(){ /* offline/Bucket weg → bleibt in der Queue */ });
            });
          }, Promise.resolve()).then(function(){ return n; });
        }).then(function(n){
          lauft = false;
          if (n && opts.fertig){ try { opts.fertig(n); } catch(e){} }
          return n;
        }).catch(function(){ lauft = false; return 0; });
      },
      /* online-Event + 90-s-Intervall + Sofort-Lauf für den Nachsende-Runner */
      auto: function(laufFn){
        try { window.addEventListener('online', function(){ laufFn(); }); } catch(e){}
        try { setInterval(function(){ laufFn(); }, 90000); } catch(e){}
        init().then(function(){ laufFn(); });
      }
    };
    /* Spiegel sofort laden — bis der User etwas öffnet, ist er längst da */
    init();
    _scopes[name] = api;
    return api;
  }

  window.GemaFotoQueue = { scope: scope, verfuegbar: verfuegbar, PLATZHALTER: PLATZHALTER };
})();
