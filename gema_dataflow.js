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

  function getActivePhaseLabel() {
    try {
      if (typeof GemaObjekte === 'undefined') return '';
      var ph = GemaObjekte.getActivePhase ? GemaObjekte.getActivePhase() : '';
      if (!ph) return '';
      var phases = GemaObjekte.getPhases ? GemaObjekte.getPhases() : [];
      var pdef = phases.find(function(p){return p.id===ph;});
      return pdef ? (pdef.kurz || pdef.label || ph) : ph;
    } catch(e) { return ''; }
  }

  function buildText(state) {
    if (!state.oid) return { icon: '⚪', text: 'Kein Objekt', color: '#fbbf24', href: 'pm_objekte.html' };
    if (!state.luOk) return { icon: '⚪', text: 'Keine LU-Daten', color: '#fbbf24', href: 'sb_lu_tabelle.html' };
    var parts = [];
    if (state.kwLs > 0) parts.push('KW ' + state.kwLs.toFixed(2));
    if (state.wwLs > 0) parts.push('WW ' + state.wwLs.toFixed(2));
    var counter = state.verbraucher ? (' · ' + state.verbraucher + ' Verbraucher') : '';
    var phLabel = state.phaseLabel ? (' · ' + state.phaseLabel) : '';
    var label = parts.length ? parts.join(' / ') + ' l/s' + counter + phLabel : ('LU verknüpft' + counter + phLabel);
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
    var info = buildText({ oid: oid, luOk: luOk, kwLs: kwLs, wwLs: wwLs, verbraucher: verbraucher, osmoseOk: osmoseOk, phaseLabel: getActivePhaseLabel() });
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
  w.addEventListener('gema-lu-updated', function(ev) {
    refresh();
    // Sanfter Toast, dass die LU-Daten sich geaendert haben — der
    // Planer weiss dann, dass evtl. ein Recalc/Re-Prefill noetig ist.
    showLUUpdatedToast();
  });
  w.addEventListener('gema-phase-changed', function(ev) {
    refresh();
    showPhaseChangedToast(ev && ev.detail && ev.detail.phase);
  });
  w.addEventListener('storage', function(ev) {
    if (!ev || !ev.key) return;
    if (ev.key.indexOf('lu_spitzenvolumenstrom') === 0) {
      refresh(); showLUUpdatedToast();
    } else if (ev.key.indexOf('gema_osmose_results') === 0 ||
               ev.key.indexOf('gema_objekte') === 0) {
      refresh();
    }
  });

  function showPhaseChangedToast(phaseId){
    var lbl = '';
    try {
      if (typeof GemaObjekte !== 'undefined' && GemaObjekte.getPhases) {
        var phases = GemaObjekte.getPhases();
        var p = phases.find(function(x){return x.id===phaseId;});
        lbl = p ? (p.label || p.kurz || phaseId) : (phaseId || 'Keine Phase');
      }
    } catch(e) { lbl = phaseId || ''; }
    if (document.getElementById('gema-phase-changed-toast')) return;
    var t = document.createElement('div');
    t.id = 'gema-phase-changed-toast';
    t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);'
      + 'z-index:1500;background:#7c3aed;color:#fff;padding:10px 16px;border-radius:12px;'
      + 'font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(124,58,237,.3);'
      + 'display:flex;align-items:center;gap:10px;max-width:calc(100% - 32px)';
    t.innerHTML = '<span>🔄 Phase gewechselt: <b>' + (lbl || '—') + '</b></span>'
      + '<button style="background:#a78bfa;color:#fff;border:none;padding:5px 11px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px" '
      + 'onclick="location.reload()">Modul neu laden</button>'
      + '<button style="background:transparent;color:#ddd6fe;border:none;padding:5px;cursor:pointer;font-size:14px" '
      + 'onclick="this.parentNode.remove()">✕</button>';
    document.body.appendChild(t);
    setTimeout(function(){
      var el = document.getElementById('gema-phase-changed-toast');
      if (el) { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(function(){el.remove();},350); }
    }, 8000);
  }

  function showLUUpdatedToast(){
    // Nur zeigen, wenn das aktuelle Modul LU-verknuepft ist (nicht in
    // der LU selbst).
    var cfg = getCfg();
    if (cfg.modul === 'lu' || cfg.modul === 'lu_tabelle') return;
    if (document.getElementById('gema-lu-updated-toast')) return;
    var t = document.createElement('div');
    t.id = 'gema-lu-updated-toast';
    t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);'
      + 'z-index:1500;background:#1e293b;color:#fff;padding:10px 16px;border-radius:12px;'
      + 'font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.2);'
      + 'display:flex;align-items:center;gap:10px;max-width:calc(100% - 32px)';
    t.innerHTML = '<span>📊 LU-Zusammenstellung wurde aktualisiert.</span>'
      + '<button style="background:#60a5fa;color:#fff;border:none;padding:5px 11px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:12px" '
      + 'onclick="location.reload()">Neu laden</button>'
      + '<button style="background:transparent;color:#cbd5e1;border:none;padding:5px;cursor:pointer;font-size:14px" '
      + 'onclick="this.parentNode.remove()">✕</button>';
    document.body.appendChild(t);
    setTimeout(function(){
      var el = document.getElementById('gema-lu-updated-toast');
      if (el) { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(function(){el.remove();},350); }
    }, 8000);
  }

  w.GemaDataflow = { refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
