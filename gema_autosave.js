/**
 * gema_autosave.js — GEMA Universal Auto-Save v2
 * Speichert Formularfelder automatisch pro Objekt nach Supabase.
 * Komplett unabhängig von _GemaDB — nutzt Supabase REST direkt.
 *
 * Einbindung (nach gema_objekte_api.js):
 *   <script src="gema_autosave.js"></script>
 *   <script>GemaAutoSave.init('druckdispositiv');</script>
 */
(function(w) {
  'use strict';

  var SB_URL = 'https://fjhbqjvaygvhievjgdtm.supabase.co';
  // Laufzeit-Basis: folgt GemaSync.SB_URL (automatischer Proxy-Fallback /sb)
  function _sbBase(){ try{ return (window.GemaSync && window.GemaSync.SB_URL) || SB_URL; }catch(e){ return SB_URL; } }
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGJxanZheWd2aGlldmpnZHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODk5OTUsImV4cCI6MjA4ODI2NTk5NX0.n3AbrEKTWWhI2tnDaf7-Z-QI9o9pJiP1E7BsHVuZY9k';
  var TABLE = 'gema_data';

  var _module = '';     // e.g. 'druckdispositiv'
  var _baseKey = '';    // e.g. 'gema_druckdispositiv'
  var _objId = '';      // current objektId
  var _timer = null;
  var _loading = false;
  var _initialized = false;
  var _badge = null;
  var _badgeTimer = null;
  var _lockOff = false;     // opts.editLock:false — Modul lockt selbst pro Datensatz
  var _lockArmed = false;   // erst nach der ersten ECHTEN Eingabe

  // IDs to never save (UI controls)
  var SKIP = {};
  ['metaObjektDropdown','objComboBtn','objComboSelect','objComboManual',
   'objSearch','objSort','objBauvorhabenFilter','betObjFilter','betRolleFilter',
   'filterCategory','filterOwner','filterCategory2','filterOwner2',
   'search','search2','viewMode','windowSpan','windowStart','zoomPreset',
   'contractorStamm','protoSelect'
  ].forEach(function(id){ SKIP[id]=1; });

  // ── Key (phase-aware) ──
  // Pattern: baseKey + '__' + objektId + ('@' + phase, optional)
  function _activePhase() {
    try {
      if (typeof GemaObjekte !== 'undefined' && GemaObjekte.getActivePhase) {
        return GemaObjekte.getActivePhase() || '';
      }
    } catch(e) {}
    return '';
  }
  function _key(objId) {
    var id = objId !== undefined ? objId : _objId;
    if (!id) return _baseKey;
    var ph = _activePhase();
    return ph ? (_baseKey + '__' + id + '@' + ph) : (_baseKey + '__' + id);
  }

  // ── Collect ──
  function _collect() {
    var st = {};
    document.querySelectorAll('input[id],select[id],textarea[id]').forEach(function(el) {
      if (SKIP[el.id]) return;
      if (el.closest('.modal-bg,.modal,#gfb-root')) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        st[el.id] = el.checked;
      } else {
        st[el.id] = el.value;
      }
    });
    st._ts = Date.now();
    return st;
  }

  // ── Restore ──
  function _restore(st) {
    if (!st || typeof st !== 'object') return;
    _loading = true;
    var keys = Object.keys(st);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      if (id.charAt(0) === '_') continue;
      var el = document.getElementById(id);
      if (!el) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = !!st[id];
      } else {
        el.value = st[id] != null ? st[id] : '';
      }
    }
    // Fire events AFTER all values are set
    for (var j = 0; j < keys.length; j++) {
      var id2 = keys[j];
      if (id2.charAt(0) === '_') continue;
      var el2 = document.getElementById(id2);
      if (!el2) continue;
      try {
        el2.dispatchEvent(new Event('input', {bubbles: true}));
        el2.dispatchEvent(new Event('change', {bubbles: true}));
      } catch(e) {}
    }
    setTimeout(function() { _loading = false; }, 200);
  }

  // ── Clear ──
  function _clear() {
    _loading = true;
    document.querySelectorAll('input[id],select[id],textarea[id]').forEach(function(el) {
      if (SKIP[el.id]) return;
      if (el.closest('.modal-bg,.modal,#gfb-root')) return;
      if (el.id === 'metaProjekt' || el.id === 'metaBearbeiter') return; // keep meta
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
      } else if (el.type === 'date') {
        el.value = new Date().toISOString().slice(0, 10);
      } else if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
      } else {
        el.value = '';
      }
    });
    setTimeout(function() { _loading = false; }, 200);
  }

  // Sicherheitsnetz: Wurde das Objekt-Dropdown erst NACH init() befuellt
  // (Cloud-Pull, programmatische Auswahl ohne onObjektSelect), stuende
  // _objId auf '' und die Eingaben landeten unter dem BASIS-Schluessel,
  // waehrend die Seite ein Objekt anzeigt — beim naechsten Besuch waeren
  // sie «weg». Nur der leere Fall wird nachgezogen: ein bereits gesetztes
  // _objId gehoert zu wiederhergestellten Daten und darf nie umgehaengt
  // werden (das mischte zwei Projekte).
  function _syncObjFromDropdown() {
    if (_objId) return;
    try {
      var sel = document.getElementById('metaObjektDropdown');
      if (sel && sel.value) _objId = sel.value;
    } catch(e) {}
  }

  // ── Eingefrorene Phasen-Ansicht (?eingefroren=1, 08/2026) ──
  // In der eingefrorenen Ansicht eines Phasen-Ordners (Workspace) darf
  // AutoSave NIE schreiben — sonst würde der eingefrorene Stand (inkl.
  // Datums-Stempel) beim blossen Anschauen überschrieben. Lazy geprüft
  // (kein Init-Reihenfolge-Problem), fail-open bei fehlendem GemaObjekte.
  function _isFrozen() {
    try {
      return typeof GemaObjekte !== 'undefined' && GemaObjekte.isEingefroren && GemaObjekte.isEingefroren();
    } catch(e) { return false; }
  }

  // ── Save to Supabase + localStorage ──
  function _save(silent) {
    if (_isFrozen() || _loading || !_initialized) return;
    _syncObjFromDropdown();
    var key = _key();
    var json = JSON.stringify(_collect());

    // localStorage cache
    try { localStorage.setItem(key, json); } catch(e) {}

    // Supabase upsert
    try {
      fetch(_sbBase() + '/rest/v1/' + TABLE + '?on_conflict=module_key%2Cdata_key', {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + ((window.GemaSync && GemaSync.getAuthToken && GemaSync.getAuthToken()) || SB_KEY),
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          module_key: _module,
          data_key: key,
          payload: { v: json }
        })
      });
    } catch(e) {}

    if (!silent) _showBadge();

    // P04: Berechnungs-Index aktualisieren (nur wenn Objekt gewählt)
    try {
      if (typeof GemaObjekte !== 'undefined' && GemaObjekte.registerBerechnung && _objId) {
        GemaObjekte.registerBerechnung({
          modul: _module,
          objektId: _objId,
          storageKey: key
        });
      }
    } catch(e) {}
  }

  // ── Load ──
  function _load(objId, cb) {
    var key = _key(objId);

    // 1. localStorage
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d._ts) { cb(d); return; }
      }
    } catch(e) {}

    // 2. Supabase
    fetch(_sbBase() + '/rest/v1/' + TABLE + '?module_key=eq.' + encodeURIComponent(_module) +
          '&data_key=eq.' + encodeURIComponent(key) + '&select=payload', {
      headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + ((window.GemaSync && GemaSync.getAuthToken && GemaSync.getAuthToken()) || SB_KEY) }
    }).then(function(r) { return r.json(); })
    .then(function(rows) {
      if (rows && rows.length && rows[0].payload && rows[0].payload.v) {
        var val = rows[0].payload.v;
        var parsed = typeof val === 'string' ? JSON.parse(val) : val;
        try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch(e) {}
        cb(parsed);
      } else {
        cb(null);
      }
    }).catch(function() { cb(null); });
  }

  // ── Badge ──
  function _showBadge() {
    if (!_badge) {
      _badge = document.createElement('div');
      Object.assign(_badge.style, {
        position:'fixed',bottom:'14px',right:'14px',zIndex:'9999',
        padding:'5px 14px',borderRadius:'20px',fontSize:'11px',
        fontWeight:'700',fontFamily:'system-ui,sans-serif',
        background:'#15803d',color:'#fff',
        boxShadow:'0 2px 8px rgba(0,0,0,.18)',
        opacity:'0',transition:'opacity .3s',pointerEvents:'none'
      });
      document.body.appendChild(_badge);
    }
    _badge.textContent = '\u2713 Gespeichert';
    _badge.style.opacity = '1';
    clearTimeout(_badgeTimer);
    _badgeTimer = setTimeout(function() { _badge.style.opacity = '0'; }, 1500);
  }

  // ── Debounce ──
  function _onChange(ev) {
    if (_loading || _isFrozen()) return;
    // Erste ECHTE Eingabe → ab jetzt bearbeitet diese Person den Datensatz
    if (ev && ev.isTrusted) _lockArm();
    clearTimeout(_timer);
    _timer = setTimeout(function() { _save(false); }, 5000);
  }

  // ── Gleichzeitig-Bearbeiten-Warnung (GemaEditLock) ──
  // GRANULARITAET (KRITISCH): Der Lock gilt dem DATENSATZ, nie dem Modul.
  // Zwei Bedingungen, sonst wird gar nichts gelockt:
  //  (a) Die Seite hat ein Objekt-Dropdown (#metaObjektDropdown). NUR dort
  //      IST der AutoSave-Snapshot der fachliche Datensatz (Berechnung des
  //      Projekts). Listen-/Pool-Module (Werkzeug, Fahrzeug, Objekte,
  //      Terminplan …) rufen init() ebenfalls auf, speichern hier aber nur
  //      Seiten-UI unter EINEM modulweiten Key — ein Lock darauf hiess
  //      faelschlich «jemand arbeitet im ganzen Modul».
  //  (b) Der Nutzer hat wirklich etwas geaendert (_lockArm bei der ersten
  //      isTrusted-Eingabe). Reines Oeffnen/Anschauen erzeugt keinen Lock
  //      und keinen Banner.
  // gema_editlock.js wird lazy nachgeladen, damit kein Modul-HTML angefasst
  // werden muss. Best-effort: ohne Script/Cloud aendert sich nichts am AutoSave.
  function _lockEligible() {
    if (_lockOff) return false;
    return !!document.getElementById('metaObjektDropdown');
  }
  function _lockLabel() {
    var t = (document.title || _module).replace(/\s*[—–-]\s*GEMA.*$/i, '').trim();
    try {
      var sel = document.getElementById('metaObjektDropdown');
      if (sel && sel.value && sel.selectedIndex >= 0) {
        var o = (sel.options[sel.selectedIndex].text || '').trim();
        if (o) t += ' · ' + o;
      }
    } catch(e) {}
    return t;
  }
  function _lockWatch() {
    try {
      if (!w.GemaEditLock || !_lockArmed || !_lockEligible()) return;
      w.GemaEditLock.watch({ key: _key(), label: _lockLabel() });
    } catch(e) {}
  }
  // Datensatz gewechselt (Objekt/Phase) → alten Lock loesen; der neue
  // entsteht erst wieder mit der ersten Eingabe im neuen Datensatz.
  function _lockRelease() {
    _lockArmed = false;
    try { if (w.GemaEditLock) w.GemaEditLock.stop(); } catch(e) {}
  }
  function _lockArm() {
    if (_lockArmed || !_lockEligible()) return;
    _lockArmed = true;
    if (w.GemaEditLock) { _lockWatch(); return; }
    try {
      var s = document.createElement('script');
      s.src = 'gema_editlock.js';
      s.onload = _lockWatch;
      document.head.appendChild(s);
    } catch(e) {}
  }

  // ── Objekt-Wechsel ──
  function _switchObjekt(newId) {
    // Save current
    _save(true);
    _objId = newId || '';
    _lockRelease();

    if (!newId) return;

    _load(newId, function(data) {
      if (data) {
        _restore(data);
      } else {
        _clear();
        // Re-fill project name from Stammdaten
        if (typeof GemaObjekte !== 'undefined') {
          var o = GemaObjekte.getAll().find(function(x) { return x.id === newId; });
          if (o) {
            var inp = document.getElementById('metaProjekt');
            if (inp) {
              var p = [o.name];
              if (o.strasse) p.push(o.strasse);
              if (o.plz || o.ort) p.push([o.plz, o.ort].filter(Boolean).join(' '));
              inp.value = p.join(', ');
            }
          }
        }
      }
    });
  }

  // ── Init ──
  function init(moduleName, opts) {
    if (_initialized) return;
    _module = moduleName;
    _baseKey = 'gema_' + moduleName;
    opts = opts || {};

    // Extra skip IDs
    if (opts.skipIds) opts.skipIds.forEach(function(id) { SKIP[id] = 1; });
    // Module, deren fachliche Daten NICHT im AutoSave-Snapshot liegen
    // (eigene per-Record-Pools), setzen den Lock selbst pro Datensatz.
    if (opts.editLock === false) _lockOff = true;

    // Patch onObjektSelect
    var _origFn = w.onObjektSelect;
    w.onObjektSelect = function() {
      var sel = document.getElementById('metaObjektDropdown');
      var newId = sel ? sel.value : '';

      // Save before switch
      _save(true);
      _objId = newId;
      _lockRelease();

      // Call original (fills project name, saves meta)
      if (typeof _origFn === 'function') _origFn();

      // Load new project data (or clear)
      if (newId) {
        _load(newId, function(data) {
          if (data) {
            _restore(data);
          } else {
            _clear();
            // Re-set project name
            if (typeof GemaObjekte !== 'undefined') {
              var o = GemaObjekte.getAll().find(function(x) { return x.id === newId; });
              if (o) {
                var inp = document.getElementById('metaProjekt');
                if (inp) {
                  var p = [o.name];
                  if (o.strasse) p.push(o.strasse);
                  if (o.plz || o.ort) p.push([o.plz, o.ort].filter(Boolean).join(' '));
                  inp.value = p.join(', ');
                }
              }
            }
          }
        });
      }
    };

    // Listen for changes
    document.addEventListener('input', function(e) {
      if (e.target.id && !SKIP[e.target.id] && !e.target.closest('.modal-bg,.modal')) _onChange(e);
    }, true);
    document.addEventListener('change', function(e) {
      if (e.target.id && !SKIP[e.target.id] && !e.target.closest('.modal-bg,.modal')) _onChange(e);
    }, true);

    // Save on page leave.
    // KRITISCH: `beforeunload` allein genuegt NICHT — iOS-Safari und die
    // installierte PWA feuern es beim App-Wechsel/Schliessen oft gar nicht.
    // Zusammen mit der 5-Sekunden-Entprellung war damit alles verloren, was
    // in den letzten Sekunden getippt wurde («die Eingaben bleiben nicht»).
    // `pagehide` und `visibilitychange` sind die verlaesslichen Signale.
    function _flush() {
      if (!_initialized || _loading) return;
      clearTimeout(_timer);
      _save(true);
    }
    w.addEventListener('beforeunload', _flush);
    w.addEventListener('pagehide', _flush);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') _flush();
    });

    // Phase-Change: aktuelle Daten unter ALTEM Key speichern, dann unter NEUEM Key laden
    var _prevKey = _key();
    w.addEventListener('gema-objekt-changed', function(ev) {
      if (!ev || !ev.detail || !ev.detail.phaseChange) return;
      // Speichere unter altem Key — NICHT in der eingefrorenen Ansicht
      // (dieser Pfad schreibt am _save()-Guard vorbei direkt in localStorage)
      if (!_isFrozen()) try {
        var json = JSON.stringify(_collect());
        try { localStorage.setItem(_prevKey, json); } catch(e){}
      } catch(e){}
      // Lade mit neuem Key
      _prevKey = _key();
      _lockRelease();
      _load(_objId, function(data) {
        if (data) _restore(data);
        else _clear();
      });
    });

    // Initial load for current object
    var sel = document.getElementById('metaObjektDropdown');
    if (sel && sel.value) {
      _objId = sel.value;
      _load(sel.value, function(data) {
        if (data) _restore(data);
      });
    }

    // Die Gleichzeitig-Bearbeiten-Warnung wird NICHT beim Oeffnen gesetzt,
    // sondern erst mit der ersten echten Eingabe (_lockArm in _onChange).

    _initialized = true;
  }

  w.GemaAutoSave = { init: init, save: function() { _save(false); } };
})(window);
