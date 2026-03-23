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
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqaGJxanZheWd2aGlldmpnZHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODk5OTUsImV4cCI6MjA4ODI2NTk5NX0.n3AbrEKTWWhI2tnDaf7-Z-QI9o9pJiP1E7BsHVuZY9k';  // Settings → API → anon / public
  /* ══════════════════════════════════════════════════════════════════ */

  const TABLE = 'gema_data';

  /* ── Supabase REST Headers ─────────────────────────────────────── */
  const hdrs = (extra) => Object.assign({
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
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
    }
  }

  /* ── Per-Seite State ───────────────────────────────────────────── */
  let _module  = null;
  let _cache   = {};
  let _pending = {};
  let _timer   = null;

  /* ── Debounced Flush → Supabase ────────────────────────────────── */
  function schedule(key, val) {
    _pending[key] = val;
    clearTimeout(_timer);
    showBadge('● Speichert…', 'yellow');
    _timer = setTimeout(() => flush(), 700);
  }

  async function flush() {
    if (!_module) return;
    const batch = Object.assign({}, _pending);
    _pending = {};
    let errors = 0;

    for (const [k, v] of Object.entries(batch)) {
      try {
        if (v === null) {
          /* DELETE */
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/${TABLE}` +
            `?module_key=eq.${encodeURIComponent(_module)}` +
            `&data_key=eq.${encodeURIComponent(k)}`,
            { method: 'DELETE', headers: hdrs() }
          );
          if (!r.ok) { errors++; console.warn('[GemaDB] DELETE Fehler', k, r.status); }

        } else {
          /* UPSERT — on_conflict im URL-Parameter ist PFLICHT!
             Ohne diesen Parameter schlägt der 2. Speichervorgang
             mit einem Unique-Constraint-Fehler fehl. */
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=module_key%2Cdata_key`,
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
            console.warn('[GemaDB] UPSERT Fehler', k, r.status, await r.text());
          }
        }
      } catch (e) {
        errors++;
        console.warn('[GemaDB] Netzwerk-Fehler', k, e.message);
      }
    }

    if (errors === 0) showBadge('✓ Gespeichert', 'green');
    else showBadge(`⚠ ${errors} Fehler beim Speichern`, 'red');
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
      if (!Array.isArray(dataKeys) || !dataKeys.length) return;

      showBadge('⟳ Lade Daten…', 'blue');
      try {
        const csv = dataKeys.map(k => `"${k}"`).join(',');
        const url =
          `${SUPABASE_URL}/rest/v1/${TABLE}` +
          `?module_key=eq.${encodeURIComponent(moduleName)}` +
          `&data_key=in.(${csv})` +
          `&select=data_key,payload`;

        const r = await fetch(url, { headers: hdrs() });
        if (!r.ok) {
          console.warn('[GemaDB] Lade-Fehler', r.status, await r.text());
          showBadge('⚠ Ladefehler', 'red');
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
     * Wert in einem ANDEREN Modul lesen (direkt aus Supabase, kein Cache).
     * Wird z.B. von gema_feedback.js genutzt um bestehende Einträge zu lesen.
     */
    async loadFromModule(moduleKey, dataKey) {
      try {
        const url =
          `${SUPABASE_URL}/rest/v1/${TABLE}` +
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
          `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=module_key%2Cdata_key`,
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
