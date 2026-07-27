/**
 * gema_db.js  —  GEMA Supabase Adapter v2
 * ─────────────────────────────────────────────────────────────────────
 * Konfiguration: Nur die zwei Zeilen unten anpassen.
 * ─────────────────────────────────────────────────────────────────────
 */
(function (w) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     KONFIGURATION  —  hier deine Supabase-Werte eintragen
     ══════════════════════════════════════════════════════════════════ */
  const SUPABASE_URL = 'https://fjhbqjvaygvhievjgdtm.supabase.co';    // z.B. https://abcxyz.supabase.co
  // Laufzeit-Basis: folgt GemaSync.SB_URL (automatischer Proxy-Fallback /sb)
  const _sbBase = () => { try{ return (window.GemaSync && window.GemaSync.SB_URL) || SUPABASE_URL; }catch(e){ return SUPABASE_URL; } };
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGJxanZheWd2aGlldmpnZHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODk5OTUsImV4cCI6MjA4ODI2NTk5NX0.n3AbrEKTWWhI2tnDaf7-Z-QI9o9pJiP1E7BsHVuZY9k';  // Settings → API → anon / public
  /* ══════════════════════════════════════════════════════════════════ */

  const TABLE = 'gema_data';

  /* ── Supabase REST Headers ─────────────────────────────────────── */
  const hdrs = (extra) => Object.assign({
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + ((window.GemaSync && GemaSync.getAuthToken && GemaSync.getAuthToken()) || SUPABASE_KEY),
    'Content-Type':  'application/json',
  }, extra || {});

  /* ── Status-Anzeige (kleines Badge unten rechts) ───────────────── */
  let _badge = null;
  let _badgeTimer = null;
  function showBadge(text, color) {
    if (!_badge) {
      _badge = document.createElement('div');
      Object.assign(_badge.style, {
        position:'fixed', bottom:'14px', right:'14px', zIndex:'9999',
        padding:'5px 12px', borderRadius:'20px', fontSize:'11px',
        fontWeight:'700', fontFamily:'system-ui,sans-serif',
        boxShadow:'0 2px 8px rgba(0,0,0,.18)', transition:'opacity .3s',
        pointerEvents:'none'
      });
      document.body.appendChild(_badge);
    }
    _badge.textContent = text;
    _badge.style.background = color==='green' ? '#15803d' :
                               color==='red'   ? '#dc2626' :
                               color==='yellow'? '#b45309' : '#1d4ed8';
    _badge.style.color   = '#fff';
    _badge.style.opacity = '1';
    clearTimeout(_badgeTimer);
    if (color === 'green') {
      _badgeTimer = setTimeout(() => { if (_badge) _badge.style.opacity = '0'; }, 1800);
    } else if (color === 'yellow') {
      /* Sicherheitsnetz: das gelbe "Speichert…"-Badge darf nie dauerhaft
         haengen bleiben (z.B. wenn flush() ohne _module frueh returnt oder
         ein fetch nie zurueckkommt). flush() ueberschreibt es normal mit
         gruen/rot; dieser Fallback blendet es sonst nach 8s aus. */
      _badgeTimer = setTimeout(() => { if (_badge) _badge.style.opacity = '0'; }, 8000);
    }
  }

  /* ── Per-Seite State ───────────────────────────────────────────── */
  let _module  = null;
  let _cache   = {};
  let _pending = {};
  let _timer   = null;

  /* ── Outbox: fehlgeschlagene Pushes ueberleben Offline + Reload ──
     Muster GemaSync-Outbox: schlaegt ein Cloud-Push fehl (offline,
     Timeout, 5xx), landet der Wert persistent in der Outbox und wird
     beim naechsten flush()/init() nachgesendet. Ohne das war ein
     offline gespeicherter Blob-Stand (sb_druckverlust, pm_crbx,
     Ausschreibungs-Vorlagen …) endgueltig verloren UND der naechste
     Online-Boot haette ihn mit dem aelteren Cloud-Stand ueberschrieben
     (stale-while-revalidate-Adopt liest _cache). init()/ensure() legen
     offene Outbox-Werte deshalb UEBER den Cloud-Stand (lokal gewinnt,
     bis der Push durch ist). Eintrag: «<module>|<dataKey>» → {v:wert}
     (v:null = ausstehendes Delete). */
  const OUTBOX_KEY = 'gema_db_outbox_v1';
  let _obMem = {};                    // Fallback, falls localStorage-Write scheitert (Quota)
  function _obRead() {
    try {
      const s = localStorage.getItem(OUTBOX_KEY);
      if (s != null) return JSON.parse(s) || {};
    } catch (e) {}
    return _obMem;
  }
  function _obWrite(o) {
    _obMem = o;
    try {
      if (Object.keys(o).length) {
        try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(o)); }
        catch (e) { localStorage.removeItem(OUTBOX_KEY); }  // Quota → Read faellt auf _obMem
      } else {
        localStorage.removeItem(OUTBOX_KEY);
      }
    } catch (e) {}
  }
  function _obSetOne(mod, key, val) {
    const o = Object.assign({}, _obRead());
    o[mod + '|' + key] = { v: val };
    _obWrite(o);
  }
  function _obClearOne(mod, key) {
    const o = _obRead(), ck = mod + '|' + key;
    if (!(ck in o)) return;
    const n = Object.assign({}, o); delete n[ck];
    _obWrite(n);
  }
  /* Offene Outbox-Werte des aktuellen Moduls in den Cache legen (lokal
     gewinnt ueber Cloud) + Nachsenden planen. keysFilter (optional)
     beschraenkt auf bestimmte dataKeys (ensure-Pfad). Ein Key, der mit
     einem ABWEICHENDEN Wert frisch in _pending liegt (echte neuere
     Eingabe dieser Sitzung), wird nie ueberschrieben — ein blosses
     Boot-Echo desselben Werts (AutoSave-Restore feuert change-Events →
     Modul-Save mit identischem Stand) blockiert den Overlay dagegen
     NICHT, sonst wuerde der stale-while-revalidate-Adopt den Offline-
     Stand doch noch mit dem aelteren Cloud-Stand ueberschreiben. */
  function _obOverlay(keysFilter) {
    if (!_module) return;
    const ob = _obRead(); let n = 0;
    for (const ck of Object.keys(ob)) {
      const i = ck.indexOf('|');
      if (i <= 0 || ck.slice(0, i) !== _module) continue;
      const k = ck.slice(i + 1);
      if (keysFilter && keysFilter.indexOf(k) < 0) continue;
      const v = (ob[ck] && 'v' in ob[ck]) ? ob[ck].v : null;
      if (k in _pending) {
        let same = false;
        try { same = JSON.stringify(_pending[k]) === JSON.stringify(v); } catch (e) {}
        if (!same) continue;           // echte neuere Eingabe gewinnt
      }
      if (v === null) delete _cache[k]; else _cache[k] = v;
      n++;
    }
    if (n) { clearTimeout(_timer); _timer = setTimeout(() => flush(), 1500); }
  }

  /* ── Debounced Flush → Supabase ────────────────────────────────── */
  function schedule(key, val) {
    _pending[key] = val;
    clearTimeout(_timer);
    /* Kein Cloud-Modul (init() nie aufgerufen) → save() ist rein lokal
       (localStorage), es gibt keinen Cloud-Roundtrip. Dann KEIN
       "Speichert…"-Badge zeigen, sonst haengt es (flush() returnt frueh).
       Betrifft z.B. sys_workspace, das _GemaDB.save() als localStorage-
       Ersatz nutzt ohne init(). */
    if (_module) showBadge('● Speichert…', 'yellow');
    _timer = setTimeout(() => flush(), 700);
  }

  async function flush() {
    if (!_module) return;
    const batch = Object.assign({}, _pending);
    _pending = {};
    /* Outbox-Eintraege des aktuellen Moduls mitnehmen (Retry) —
       frische _pending-Werte gewinnen ueber gequeue-te. */
    const ob = _obRead();
    for (const ck of Object.keys(ob)) {
      const i = ck.indexOf('|');
      if (i > 0 && ck.slice(0, i) === _module) {
        const k = ck.slice(i + 1);
        if (!(k in batch)) batch[k] = (ob[ck] && 'v' in ob[ck]) ? ob[ck].v : null;
      }
    }
    if (!Object.keys(batch).length) return;
    let errors = 0;

    for (const [k, v] of Object.entries(batch)) {
      try {
        if (v === null) {
          /* DELETE */
          const r = await fetch(
            `${_sbBase()}/rest/v1/${TABLE}` +
            `?module_key=eq.${encodeURIComponent(_module)}` +
            `&data_key=eq.${encodeURIComponent(k)}`,
            { method: 'DELETE', headers: hdrs() }
          );
          if (!r.ok) { errors++; _obSetOne(_module, k, v); console.warn('[GemaDB] DELETE Fehler', k, r.status); }
          else _obClearOne(_module, k);

        } else {
          /* UPSERT — on_conflict im URL-Parameter ist PFLICHT!
             Ohne diesen Parameter schlägt der 2. Speichervorgang
             mit einem Unique-Constraint-Fehler fehl. */
          const r = await fetch(
            `${_sbBase()}/rest/v1/${TABLE}?on_conflict=module_key%2Cdata_key`,
            {
              method:  'POST',
              headers: hdrs({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
              body: JSON.stringify({
                module_key: _module,
                data_key:   k,
                payload:    { v: v }
              })
            }
          );
          if (!r.ok) {
            errors++;
            _obSetOne(_module, k, v);
            console.warn('[GemaDB] UPSERT Fehler', k, r.status, await r.text());
          } else {
            _obClearOne(_module, k);
          }
        }
      } catch (e) {
        errors++;
        _obSetOne(_module, k, v);
        console.warn('[GemaDB] Netzwerk-Fehler', k, e.message);
      }
    }

    if (errors === 0) {
      showBadge('✓ Gespeichert', 'green');
    } else {
      /* Lokal ist der Stand gesichert (Cache + Outbox) — nur der Upload
         steht aus. Automatischer Retry in 30 s (ein Timer, kein Sturm). */
      showBadge('⚠ Cloud nicht erreichbar — lokal gesichert', 'yellow');
      clearTimeout(_timer);
      _timer = setTimeout(() => flush(), 30000);
    }
  }

  /* ── PUBLIC API ────────────────────────────────────────────────── */
  const GDB = {

    /* Cache-Zugriff: _GemaDB.c['key'] ersetzt localStorage.getItem */
    get c() { return _cache; },

    /* Aktueller Modulname */
    get module() { return _module; },

    /**
     * MUSS zuerst aufgerufen werden (await _GemaDB.init(...)).
     * Lädt alle Modul-Daten aus Supabase in den lokalen Cache.
     */
    async init(moduleName, dataKeys) {
      _module = moduleName;
      _cache  = {};
      if (!Array.isArray(dataKeys) || !dataKeys.length) { _obOverlay(); return; }

      showBadge('⟳ Lade Daten…', 'blue');
      try {
        const csv = dataKeys.map(k => `"${k}"`).join(',');
        const url =
          `${_sbBase()}/rest/v1/${TABLE}` +
          `?module_key=eq.${encodeURIComponent(moduleName)}` +
          `&data_key=in.(${csv})` +
          `&select=data_key,payload`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const r = await fetch(url, { headers: hdrs(), signal: controller.signal });
        clearTimeout(timeoutId);
        if (!r.ok) {
          console.warn('[GemaDB] Lade-Fehler', r.status, await r.text());
          showBadge('⚠ Ladefehler', 'red');
          _obOverlay();
          return;
        }
        const rows = await r.json();
        rows.forEach(row => {
          _cache[row.data_key] = (row.payload && row.payload.v != null)
            ? row.payload.v : null;
        });
        showBadge('✓ Daten geladen', 'green');
      } catch (e) {
        console.warn('[GemaDB] Verbindungsfehler:', e.message);
        showBadge('⚠ Keine Verbindung', 'red');
      }
      /* Offene Outbox-Werte (offline gespeicherte Aenderungen frueherer
         Sitzungen) UEBER den Cloud-Stand legen + Nachsenden planen —
         sonst wuerde der stale-while-revalidate-Adopt der Blob-Module
         den neueren lokalen Stand mit dem aelteren Cloud-Stand
         ueberschreiben (Datenverlust). */
      _obOverlay();
    },

    /**
     * Wert speichern — sofort im Cache, debounced nach Supabase.
     * Ersetzt: localStorage.setItem(key, value)
     */
    save(key, value) {
      _cache[key] = value;
      schedule(key, value);
    },

    /**
     * Wert löschen — aus Cache und Supabase.
     * Ersetzt: localStorage.removeItem(key)
     */
    remove(key) {
      delete _cache[key];
      schedule(key, null);
    },

    /**
     * Fehlende data_keys des AKTUELLEN Moduls in den Cache nachladen.
     * KRITISCH fuer per-Objekt-Keys (BASE__<objektId>): init() laedt nur
     * die beim Boot angefragten Keys — wechselt der Nutzer das Objekt zur
     * Laufzeit, MUSS der neue Key vor dem Lesen nachgeladen werden, sonst
     * liest das Modul ins Leere und wirkt leer, obwohl Cloud-Daten da sind.
     * Bereits gecachte Keys werden nicht erneut geladen (kein Ueberschreiben
     * ungespeicherter lokaler Aenderungen).
     */
    async ensure(dataKeys) {
      if (!_module || !Array.isArray(dataKeys)) return;
      const missing = dataKeys.filter(k => k && !(k in _cache));
      if (!missing.length) return;
      try {
        const csv = missing.map(k => `"${k}"`).join(',');
        const url =
          `${_sbBase()}/rest/v1/${TABLE}` +
          `?module_key=eq.${encodeURIComponent(_module)}` +
          `&data_key=in.(${csv})` +
          `&select=data_key,payload`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const r = await fetch(url, { headers: hdrs(), signal: controller.signal });
        clearTimeout(timeoutId);
        if (!r.ok) { _obOverlay(missing); return; }
        const rows = await r.json();
        rows.forEach(row => {
          if (!(row.data_key in _cache)) {
            _cache[row.data_key] = (row.payload && row.payload.v != null) ? row.payload.v : null;
          }
        });
      } catch (e) {
        console.warn('[GemaDB] ensure Fehler:', e.message);
      }
      /* Offene Outbox-Werte der nachgeladenen Keys gewinnen ueber Cloud
         (nur die missing-Keys — bereits gecachte bleiben unangetastet). */
      _obOverlay(missing);
    },

    /**
     * Wert in einem ANDEREN Modul lesen (direkt aus Supabase, kein Cache).
     * Wird z.B. von gema_feedback.js genutzt um bestehende Einträge zu lesen.
     */
    async loadFromModule(moduleKey, dataKey) {
      try {
        const url =
          `${_sbBase()}/rest/v1/${TABLE}` +
          `?module_key=eq.${encodeURIComponent(moduleKey)}` +
          `&data_key=eq.${encodeURIComponent(dataKey)}` +
          `&select=payload`;
        const r = await fetch(url, { headers: hdrs() });
        if (!r.ok) return null;
        const rows = await r.json();
        if (!rows.length) return null;
        return (rows[0].payload && rows[0].payload.v != null) ? rows[0].payload.v : null;
      } catch (e) {
        console.warn('[GemaDB] loadFromModule Fehler:', e.message);
        return null;
      }
    },

    /**
     * Wert in einem ANDEREN Modul speichern — umgeht den aktuellen Modul-Kontext.
     * Wird von gema_feedback.js genutzt um Feedback unter beta_pruefungen zu speichern.
     */
    async saveToModule(moduleKey, dataKey, value) {
      try {
        showBadge('● Speichert…', 'yellow');
        const r = await fetch(
          `${_sbBase()}/rest/v1/${TABLE}?on_conflict=module_key%2Cdata_key`,
          {
            method:  'POST',
            headers: hdrs({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify({
              module_key: moduleKey,
              data_key:   dataKey,
              payload:    { v: value }
            })
          }
        );
        if (r.ok) {
          showBadge('✓ Gespeichert', 'green');
          return true;
        } else {
          const t = await r.text();
          console.warn('[GemaDB] saveToModule Fehler', r.status, t);
          showBadge('⚠ Fehler beim Speichern', 'red');
          return false;
        }
      } catch (e) {
        console.warn('[GemaDB] saveToModule Netzwerk-Fehler:', e.message);
        showBadge('⚠ Keine Verbindung', 'red');
        return false;
      }
    }
  };

  w._GemaDB = GDB;

})(window);
