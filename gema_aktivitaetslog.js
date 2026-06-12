// gema_aktivitaetslog.js
// Zentraler Aktivitaetenlog fuer die Infrastruktur-Module
// (Werkzeug, Fahrzeug, Trocknung). Speichert pro Aktion einen Eintrag
// in einer eigenen Cloud-Collection (gema_aktivitaetslog_v1) via
// gema_sync.js — single source of truth Supabase, lokal nur als Cache.
//
// Schema pro Eintrag:
//   {
//     id,           // 'log_<ts>_<rand>'
//     ts,           // ISO-Timestamp
//     orgId,        // Org des Users, der die Aktion ausgeloest hat
//     modul,        // 'werkzeug' | 'fahrzeug' | 'trocknung'
//     modulRecordId,// id des betroffenen Datensatzes (kann leer sein)
//     modulRecordName, // Anzeigename (Werkzeug, Kennzeichen, Geraet)
//     aktion,       // 'erfasst'|'geaendert'|'geloescht'|'zuweisung'|
//                   //  'ausleihe'|'rueckgabe'|'einsatz'|'einsatz_ende'|
//                   //  'pruefung'|'service'|'defekt'|'defekt_erledigt'|
//                   //  'ersatzanfrage'|'pruefanfrage'|...
//     beschreibung, // Freitext, kurz
//     userId, userName, // wer hat die Aktion ausgeloest
//     details       // optionales Objekt mit zusaetzlichen Feldern
//   }
//
// Public API:
//   GemaActivityLog.log({modul, modulRecordId, modulRecordName,
//                        aktion, beschreibung, details}) → Promise<entry>
//   GemaActivityLog.getForModul(modul, orgId?)  → Array (neuste zuerst)
//   GemaActivityLog.getAll(orgId?)              → Array (neuste zuerst)
//   GemaActivityLog.bootstrap()                 → Promise — beim Seitenstart
//   GemaActivityLog.clear()                     → Test-Helper (löscht local)
(function(){
  var STORAGE_KEY = 'gema_aktivitaetslog_v1';
  var MODULE_KEY  = 'aktivitaetslog';
  var PREFIX      = 'log:';
  var MAX_LOCAL   = 2000; // weicher Cap; aelteste werden lokal getrimmt

  function _now(){ return new Date().toISOString(); }
  function _rand(){ return Math.random().toString(36).slice(2,8); }
  function _newId(){ return 'log_' + Date.now() + '_' + _rand(); }

  function _readLocal(){
    // Kanonischer Lese-Pfad: GemaSync.getCached (localStorage-first mit
    // In-Memory-Spiegel-Fallback bei Quota-Fehler).
    if (typeof window.GemaSync !== 'undefined' && window.GemaSync.getCached){
      try { var c = window.GemaSync.getCached(STORAGE_KEY); if (Array.isArray(c)) return c; } catch(e){}
    }
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null && typeof _GemaDB !== 'undefined' && _GemaDB.c) raw = _GemaDB.c[STORAGE_KEY];
      var arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch(e){ return []; }
  }
  function _writeLocal(arr){
    try {
      // Lokales Trimming (Cloud bleibt vollstaendig). Sortierung nach ts
      // absteigend, dann die juengsten MAX_LOCAL behalten.
      if (arr.length > MAX_LOCAL){
        arr.sort(function(a,b){ return (b.ts||'').localeCompare(a.ts||''); });
        arr = arr.slice(0, MAX_LOCAL);
      }
      var json = JSON.stringify(arr);
      // KEIN _GemaDB.save(STORAGE_KEY, ...) mehr: das schrieb bei JEDEM log()
      // den ganzen Aktivitaets-Blob ueber _GemaDB in die Cloud, zeigte das
      // '● Speichert…'-Badge (gema_db.js) und konnte bei grossem Blob haengen
      // — sah aus wie 'Werkzeug-Speichern haengt'. Der Cloud-Sync laeuft
      // per-Record ueber GemaSync.saveRecord (siehe log()); hier nur noch der
      // lokale Cache.
      try { localStorage.setItem(STORAGE_KEY, json); } catch(e){}
    } catch(e){ console.warn('[ActLog] writeLocal', e); }
  }

  function _currentUser(){
    try {
      if (typeof GemaAuth !== 'undefined' && GemaAuth.getCurrentUser) return GemaAuth.getCurrentUser();
    } catch(e){}
    return null;
  }

  // Bootstrap — laedt die Collection aus der Cloud in den lokalen Cache.
  // Sollte einmalig pro Seite im DOMContentLoaded aufgerufen werden,
  // damit getForModul / getAll synchron antworten koennen.
  var _bootPromise = null;
  function bootstrap(){
    if (_bootPromise) return _bootPromise;
    if (typeof window.GemaSync === 'undefined' || !window.GemaSync.bindCollection){
      // Kein Cloud-Sync verfuegbar — auf lokal beschraenken
      _bootPromise = Promise.resolve();
      return _bootPromise;
    }
    _bootPromise = window.GemaSync.bindCollection(MODULE_KEY, STORAGE_KEY, PREFIX, 'id')
      .catch(function(e){ console.warn('[ActLog] bind', e); });
    return _bootPromise;
  }

  // Schreibt einen Eintrag. Liefert ein Promise mit dem persistierten
  // Eintrag — Aufrufer koennen das ignorieren (fire-and-forget).
  function log(opts){
    opts = opts || {};
    var u = _currentUser();
    var entry = {
      id: _newId(),
      ts: _now(),
      orgId: opts.orgId || (u && u.orgId) || null,
      modul: opts.modul || 'unknown',
      modulRecordId: opts.modulRecordId || null,
      modulRecordName: opts.modulRecordName || '',
      aktion: opts.aktion || 'aktion',
      beschreibung: opts.beschreibung || '',
      userId: opts.userId || (u && u.id) || null,
      userName: opts.userName || (u && (u.name || u.email)) || 'System',
      details: opts.details || null
    };

    // Lokal sofort eintragen (optimistic), Cloud asynchron pushen.
    var arr = _readLocal();
    arr.unshift(entry);
    _writeLocal(arr);
    try {
      window.dispatchEvent(new CustomEvent('gema-activitylog-changed', { detail:{entry:entry} }));
    } catch(e){}

    if (typeof window.GemaSync !== 'undefined' && window.GemaSync.saveRecord){
      return window.GemaSync.saveRecord(MODULE_KEY, PREFIX + entry.id, entry)
        .then(function(){ return entry; })
        .catch(function(e){ console.warn('[ActLog] saveRecord', e); return entry; });
    }
    return Promise.resolve(entry);
  }

  function getAll(orgId){
    var arr = _readLocal().slice();
    if (orgId) arr = arr.filter(function(e){ return e.orgId === orgId; });
    arr.sort(function(a,b){ return (b.ts||'').localeCompare(a.ts||''); });
    return arr;
  }

  function getForModul(modul, orgId){
    return getAll(orgId).filter(function(e){ return e.modul === modul; });
  }

  function clear(){
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
    try { if (typeof _GemaDB !== 'undefined' && _GemaDB.c) delete _GemaDB.c[STORAGE_KEY]; } catch(e){}
  }

  window.GemaActivityLog = {
    bootstrap: bootstrap,
    log: log,
    getAll: getAll,
    getForModul: getForModul,
    clear: clear,
    openModal: openModal,
    STORAGE_KEY: STORAGE_KEY,
    MODULE_KEY: MODULE_KEY,
    PREFIX: PREFIX
  };

  // ────────────────────────────────────────────────────────────────
  // UI-Modal — einheitlich fuer alle Module
  // ────────────────────────────────────────────────────────────────

  var AKTION_LABEL = {
    erfasst: { l:'Erfasst', c:'#0c4a2e', bg:'#dcfce7' },
    geaendert: { l:'Geändert', c:'#1e3a5f', bg:'#dbeafe' },
    geloescht: { l:'Gelöscht', c:'#991b1b', bg:'#fee2e2' },
    zuweisung: { l:'Zuweisung', c:'#7c2d12', bg:'#ffedd5' },
    ausleihe: { l:'Ausleihe', c:'#7c2d12', bg:'#ffedd5' },
    rueckgabe: { l:'Rückgabe', c:'#065f46', bg:'#d1fae5' },
    einsatz: { l:'Einsatz', c:'#7c2d12', bg:'#ffedd5' },
    einsatz_ende: { l:'Einsatz-Ende', c:'#065f46', bg:'#d1fae5' },
    pruefung: { l:'Prüfung', c:'#1e3a5f', bg:'#dbeafe' },
    service: { l:'Service', c:'#1e3a5f', bg:'#dbeafe' },
    pruefanfrage: { l:'Prüfanfrage', c:'#3730a3', bg:'#e0e7ff' },
    defekt: { l:'Defekt', c:'#991b1b', bg:'#fee2e2' },
    defekt_erledigt: { l:'Defekt erledigt', c:'#065f46', bg:'#d1fae5' },
    ersatzanfrage: { l:'Ersatzanfrage', c:'#3730a3', bg:'#e0e7ff' }
  };

  function _esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _fmtTs(iso){
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var pad = function(n){ return n<10 ? '0'+n : ''+n; };
      return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + '.' + d.getFullYear()
        + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch(e){ return iso; }
  }

  function _aktionPill(aktion){
    var info = AKTION_LABEL[aktion] || { l: aktion || '—', c:'#374151', bg:'#f3f4f6' };
    return '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;'
      + 'background:' + info.bg + ';color:' + info.c + '">' + _esc(info.l) + '</span>';
  }

  // Oeffnet das Aktivitaeten-Modal fuer ein bestimmtes Modul.
  // opts: { modul:'werkzeug'|'fahrzeug'|'trocknung', titel?:string }
  function openModal(opts){
    opts = opts || {};
    var modul = opts.modul || 'werkzeug';
    var titel = opts.titel || 'Aktivitäten';
    var u = _currentUser();
    var orgId = u && u.orgId;

    // Existierendes Modal entfernen (falls noch da)
    var prev = document.getElementById('gema-actlog-modal');
    if (prev) prev.parentNode.removeChild(prev);

    var bg = document.createElement('div');
    bg.id = 'gema-actlog-modal';
    bg.className = 'modal-bg';
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);'
      + 'display:flex;align-items:center;justify-content:center;z-index:9000;padding:16px';
    bg.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:980px;width:100%;max-height:88vh;'
        + 'display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(15,23,42,0.35);overflow:hidden">'
        + '<div style="padding:18px 22px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px">'
          + '<div style="font-size:18px;font-weight:800;color:#0f172a;flex:1">📋 ' + _esc(titel) + '</div>'
          + '<button id="actlogClose" style="border:none;background:#f3f4f6;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px">✕</button>'
        + '</div>'
        + '<div style="padding:14px 22px;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;flex-wrap:wrap">'
          + '<input type="text" id="actlogSearch" placeholder="Suche (Datensatz, User, Beschreibung) …" '
            + 'style="flex:1;min-width:220px;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px">'
          + '<select id="actlogAktionFilter" style="padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;background:#fff">'
            + '<option value="">Alle Aktionen</option>'
            + '<option value="erfasst">Erfasst</option>'
            + '<option value="geaendert">Geändert</option>'
            + '<option value="geloescht">Gelöscht</option>'
            + '<option value="zuweisung">Zuweisung</option>'
            + '<option value="ausleihe">Ausleihe</option>'
            + '<option value="rueckgabe">Rückgabe</option>'
            + '<option value="einsatz">Einsatz</option>'
            + '<option value="einsatz_ende">Einsatz-Ende</option>'
            + '<option value="pruefung">Prüfung</option>'
            + '<option value="service">Service</option>'
            + '<option value="pruefanfrage">Prüfanfrage</option>'
            + '<option value="defekt">Defekt</option>'
            + '<option value="defekt_erledigt">Defekt erledigt</option>'
            + '<option value="ersatzanfrage">Ersatzanfrage</option>'
          + '</select>'
          + '<button id="actlogExport" class="nbtn" style="padding:9px 14px;border:1.5px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;font-weight:700">CSV-Export</button>'
        + '</div>'
        + '<div id="actlogBody" style="flex:1;overflow:auto;padding:8px 0"></div>'
        + '<div style="padding:10px 22px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b" id="actlogFooter"></div>'
      + '</div>';
    document.body.appendChild(bg);

    function close(){ if (bg.parentNode) bg.parentNode.removeChild(bg); }
    bg.querySelector('#actlogClose').addEventListener('click', close);
    bg.addEventListener('click', function(e){ if (e.target === bg) close(); });

    function render(){
      var q = (bg.querySelector('#actlogSearch').value || '').toLowerCase().trim();
      var aktion = bg.querySelector('#actlogAktionFilter').value || '';
      var entries = getForModul(modul, orgId);
      if (aktion) entries = entries.filter(function(e){ return e.aktion === aktion; });
      if (q) entries = entries.filter(function(e){
        return (e.modulRecordName||'').toLowerCase().indexOf(q) >= 0
            || (e.beschreibung||'').toLowerCase().indexOf(q) >= 0
            || (e.userName||'').toLowerCase().indexOf(q) >= 0;
      });
      var body = bg.querySelector('#actlogBody');
      var footer = bg.querySelector('#actlogFooter');
      if (!entries.length){
        body.innerHTML = '<div style="padding:60px 22px;text-align:center;color:#94a3b8;font-size:14px">'
          + 'Keine Aktivitäten vorhanden.</div>';
        footer.textContent = '0 Einträge';
        return;
      }
      var html = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead>'
        + '<tr style="background:#f8fafc;color:#475569;text-align:left">'
          + '<th style="padding:10px 14px;border-bottom:1px solid #e5e7eb;white-space:nowrap">Datum</th>'
          + '<th style="padding:10px 14px;border-bottom:1px solid #e5e7eb">Aktion</th>'
          + '<th style="padding:10px 14px;border-bottom:1px solid #e5e7eb">Datensatz</th>'
          + '<th style="padding:10px 14px;border-bottom:1px solid #e5e7eb">Beschreibung</th>'
          + '<th style="padding:10px 14px;border-bottom:1px solid #e5e7eb;white-space:nowrap">User</th>'
        + '</tr></thead><tbody>';
      entries.forEach(function(e, i){
        html += '<tr style="background:' + (i%2 ? '#fff' : '#fcfcfd') + ';border-bottom:1px solid #f1f5f9">'
          + '<td style="padding:10px 14px;color:#475569;white-space:nowrap;font-variant-numeric:tabular-nums">' + _esc(_fmtTs(e.ts)) + '</td>'
          + '<td style="padding:10px 14px">' + _aktionPill(e.aktion) + '</td>'
          + '<td style="padding:10px 14px;font-weight:600;color:#0f172a">' + _esc(e.modulRecordName || '—') + '</td>'
          + '<td style="padding:10px 14px;color:#334155">' + _esc(e.beschreibung || '') + '</td>'
          + '<td style="padding:10px 14px;color:#64748b;white-space:nowrap">' + _esc(e.userName || '—') + '</td>'
        + '</tr>';
      });
      html += '</tbody></table>';
      body.innerHTML = html;
      footer.textContent = entries.length + ' Einträge';
    }

    function exportCsv(){
      var entries = getForModul(modul, orgId);
      var header = ['Datum','Aktion','Datensatz','Beschreibung','User'];
      var rows = entries.map(function(e){
        return [_fmtTs(e.ts), (AKTION_LABEL[e.aktion]||{l:e.aktion}).l, e.modulRecordName||'', e.beschreibung||'', e.userName||''];
      });
      var csv = [header].concat(rows).map(function(r){
        return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(',');
      }).join('\n');
      var blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'aktivitaeten_' + modul + '_' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    bg.querySelector('#actlogSearch').addEventListener('input', render);
    bg.querySelector('#actlogAktionFilter').addEventListener('change', render);
    bg.querySelector('#actlogExport').addEventListener('click', exportCsv);

    // Bei neuen Eintraegen waehrend das Modal offen ist neu rendern
    var listener = function(){ render(); };
    window.addEventListener('gema-activitylog-changed', listener);
    bg.addEventListener('DOMNodeRemoved', function(){
      window.removeEventListener('gema-activitylog-changed', listener);
    });

    render();
  }
})();
