/**
 * gema_dataflow.js — GEMA Datenfluss-Pille v1
 *
 * Fuegt in jedem LU-/Osmose-verknuepften Modul automatisch einen
 * einheitlichen Status-Pin im Hero ein:
 *   - 🟢 "LU verknüpft · 5 Verbraucher" wenn Daten vorhanden
 *   - 🟡 "Teilweise manuell" bei Override-Persistenz
 *   - ⚪ "Kein Objekt" oder "Keine LU-Daten" wenn nichts geladen
 *
 * Aktivierung: Modul setzt vor dem Laden des Skripts:
 *   window.GemaDataflowConfig = { sources: ['lu','osmose'], modul: 'druckverlust' };
 *
 * Pille klickbar:
 *   - bei "LU verknüpft" → springt zur LU
 *   - bei "Kein Objekt" → springt zu pm_objekte.html
 *   - bei "Keine LU-Daten" → springt zur LU
 *
 * Update-Trigger:
 *   - DOMContentLoaded
 *   - gema-objekt-changed
 *   - gema-osmose-updated
 *   - storage-Event (cross-tab Sync)
 */
(function(w) {
  'use strict';

  function getCfg() { return w.GemaDataflowConfig || { sources: ['lu'] }; }

  function ensurePill() {
    var pill = document.getElementById('gemaDataflowPill');
    if (pill) return pill;
    // Hero-Container finden — typische Klassen
    var host = document.querySelector('.gema-hero-in')
            || document.querySelector('.hero-in')
            || document.querySelector('.hero');
    if (!host) return null;
    pill = document.createElement('a');
    pill.id = 'gemaDataflowPill';
    pill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;'
      + 'padding:5px 11px;border-radius:999px;font-size:11.5px;'
      + 'font-weight:700;letter-spacing:.2px;background:rgba(255,255,255,.16);'
      + 'border:1.5px solid rgba(255,255,255,.28);color:#fff;'
      + 'text-decoration:none;cursor:pointer;margin-left:auto;'
      + 'transition:background .15s,transform .12s;flex-shrink:0';
    pill.addEventListener('mouseenter', function() { pill.style.background = 'rgba(255,255,255,.24)'; });
    pill.addEventListener('mouseleave', function() { pill.style.background = 'rgba(255,255,255,.16)'; });
    host.appendChild(pill);
    return pill;
  }

  function getActiveObjektId() {
    try { if (typeof GemaObjekte !== 'undefined') return GemaObjekte.getActiveId() || ''; }
    catch(e) {}
    return '';
  }

  function buildText(state) {
    if (!state.oid) return { icon: '⚪', text: 'Kein Objekt', color: '#fbbf24', href: 'pm_objekte.html' };
    if (!state.luOk) return { icon: '⚪', text: 'Keine LU-Daten', color: '#fbbf24', href: 'sb_lu_tabelle.html' };
    var parts = [];
    if (state.kwLs > 0) parts.push('KW ' + state.kwLs.toFixed(2));
    if (state.wwLs > 0) parts.push('WW ' + state.wwLs.toFixed(2));
    var counter = state.verbraucher ? (' · ' + state.verbraucher + ' Verbraucher') : '';
    var label = parts.length ? parts.join(' / ') + ' l/s' + counter : ('LU verknüpft' + counter);
    if (state.osmoseOk) label = '💧 ' + label;
    return { icon: '📊', text: label, color: '#a7f3d0', href: 'sb_lu_tabelle.html' };
  }

  function refresh() {
    var pill = ensurePill();
    if (!pill) return;
    var cfg = getCfg();
    var oid = getActiveObjektId();
    var luOk = false, kwLs = 0, wwLs = 0, verbraucher = 0, osmoseOk = false;
    if (oid && typeof GemaLU !== 'undefined') {
      try {
        if (GemaLU.hasData(oid)) {
          luOk = true;
          var s = GemaLU.getSummary(oid);
          kwLs = (s.kw && s.kw.flow_ls) || 0;
          wwLs = (s.ww && s.ww.flow_ls) || 0;
          verbraucher = ((s.kw && s.kw.verbraucher) || 0) + ((s.ww && s.ww.verbraucher) || 0);
        }
      } catch(e) {}
    }
    if (cfg.sources && cfg.sources.indexOf('osmose') >= 0 && typeof GemaOsmose !== 'undefined') {
      try { if (oid && GemaOsmose.hasData(oid)) osmoseOk = true; } catch(e) {}
    }
    var info = buildText({ oid: oid, luOk: luOk, kwLs: kwLs, wwLs: wwLs, verbraucher: verbraucher, osmoseOk: osmoseOk });
    pill.innerHTML = '<span aria-hidden="true">' + info.icon + '</span><span>' + info.text + '</span>';
    pill.href = info.href;
    pill.title = oid
      ? (luOk ? 'Daten aus LU-Zusammenstellung. Klick öffnet die LU.' : 'Keine LU-Daten für dieses Objekt — LU öffnen.')
      : 'Kein Objekt aktiv — Objekt wählen.';
  }

  // Trigger
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  w.addEventListener('gema-objekt-changed', refresh);
  w.addEventListener('gema-osmose-updated', refresh);
  w.addEventListener('storage', function(ev) {
    if (!ev || !ev.key) return;
    if (ev.key.indexOf('lu_spitzenvolumenstrom') === 0 ||
        ev.key.indexOf('gema_osmose_results') === 0 ||
        ev.key.indexOf('gema_objekte') === 0) refresh();
  });

  w.GemaDataflow = { refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
