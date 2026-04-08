/**
 * gema_offerten_tab.js — Offerten-Tab für Berechnungsmodule
 * Zeigt eingegangene Lieferanten-Offerten pro aktivem Objekt.
 * Wird in sa_enthaertung.html, sa_osmose.html etc. eingebunden.
 *
 * Voraussetzung: gema_produktkatalog_api.js geladen (GemaProdukte)
 *                gema_objekte_api.js geladen (GemaObjekte)
 */
(function(w) {
  'use strict';

  var _tabId = 'gema-offerten-tab';
  var _panelId = 'gema-offerten-panel';

  function _getObjektId() {
    var sel = document.getElementById('metaObjektDropdown');
    if (sel && sel.value) return sel.value;
    if (typeof GemaObjekte !== 'undefined') return GemaObjekte.getActiveId() || '';
    return '';
  }

  function _esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function _fC(v) { if (!v || v === 0) return '–'; return Number(v).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function render() {
    var panel = document.getElementById(_panelId);
    if (!panel) return;
    if (typeof GemaProdukte === 'undefined') { panel.innerHTML = '<p style="color:#6b7280;font-size:13px">Produktkatalog nicht geladen.</p>'; return; }

    var objektId = _getObjektId();
    var alle = GemaProdukte.getOffertanfragen();
    // Filtere nach aktivem Objekt
    var filtered = objektId ? alle.filter(function(oa) { return oa.projekt && oa.projekt.objektId === objektId; }) : alle;
    // Sortiere: neueste zuerst
    filtered.sort(function(a, b) { return (b.erstelltAm || '').localeCompare(a.erstelltAm || ''); });

    if (!filtered.length) {
      panel.innerHTML = '<div style="text-align:center;padding:32px 16px;color:#6b7280">'
        + '<div style="font-size:32px;margin-bottom:8px">📨</div>'
        + '<div style="font-size:14px;font-weight:700;margin-bottom:4px">Keine Offertanfragen</div>'
        + '<div style="font-size:12px">' + (objektId ? 'Für dieses Projekt wurden noch keine Offertanfragen gesendet.' : 'Bitte Projekt wählen.') + '</div>'
        + '</div>';
      return;
    }

    var h = '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">' + filtered.length + ' Offertanfrage' + (filtered.length !== 1 ? 'n' : '') + '</div>';
    h += '<div style="display:flex;flex-direction:column;gap:8px">';

    filtered.forEach(function(oa) {
      var statusColor = '#6b7280'; var statusLabel = 'Offen'; var statusBg = '#f4f6fb';
      if (oa.status === 'beantwortet') { statusColor = '#16a34a'; statusLabel = '✓ Beantwortet'; statusBg = '#f0fdf4'; }
      else if (oa.status === 'abgelehnt') { statusColor = '#dc2626'; statusLabel = '✕ Abgelehnt'; statusBg = '#fef2f2'; }
      else if (oa.status === 'offen') { statusColor = '#d97706'; statusLabel = '⟳ Offen'; statusBg = '#fffbeb'; }

      h += '<div style="border:1.5px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fff">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
      h += '<div style="font-size:13px;font-weight:700">' + _esc(oa.lieferantFirma) + '</div>';
      h += '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;background:' + statusBg + ';color:' + statusColor + '">' + statusLabel + '</span>';
      h += '</div>';
      h += '<div style="font-size:12px;color:#6b7280">' + _esc(oa.produktName || '') + ' · ' + _esc(oa.kategorie || '') + '</div>';

      if (oa.status === 'beantwortet' && oa.antwort) {
        h += '<div style="margin-top:8px;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:12px">';
        if (oa.antwort.bruttoPreis) h += '<div style="font-weight:700;color:#15803d;font-size:14px">CHF ' + _fC(oa.antwort.bruttoPreis) + ' (brutto)</div>';
        if (oa.antwort.nachricht) h += '<div style="color:#374151;margin-top:4px">' + _esc(oa.antwort.nachricht) + '</div>';
        if (oa.antwort.pdfName) h += '<div style="margin-top:4px;color:#2563eb;font-weight:600">📄 ' + _esc(oa.antwort.pdfName) + '</div>';
        h += '</div>';
      }

      h += '<div style="font-size:10px;color:#9ca3af;margin-top:6px">Gesendet: ' + (oa.erstelltAm ? new Date(oa.erstelltAm).toLocaleDateString('de-CH') : '–') + (oa.frist ? ' · Frist: ' + oa.frist : '') + '</div>';
      h += '</div>';
    });

    h += '</div>';
    panel.innerHTML = h;
  }

  function inject() {
    // Finde den Tab-Container (project-bar oder ähnlich)
    // Strategie: Suche nach bestehendem Tab-System oder erstelle eigenes
    var existing = document.getElementById(_panelId);
    if (existing) return; // bereits injected

    // Panel nach dem Hauptinhalt einfügen (vor dem Footer oder am Ende von .g-page)
    var page = document.querySelector('.g-page');
    if (!page) return;

    // Tab-Button im Bereich der Projektangaben hinzufügen
    var tabBtn = document.createElement('div');
    tabBtn.id = _tabId;
    tabBtn.style.cssText = 'margin:16px 0 0;padding:10px 16px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:.15s';
    tabBtn.innerHTML = '<span style="font-size:16px">📨</span><span style="font-size:13px;font-weight:700">Offerten</span><span id="gema-offerten-count" style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:#fffbeb;color:#d97706;display:none">0</span>';
    tabBtn.addEventListener('click', function() {
      var panel = document.getElementById(_panelId);
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        tabBtn.style.borderColor = '#2563eb';
        tabBtn.style.background = '#eff4ff';
        render();
      } else {
        panel.style.display = 'none';
        tabBtn.style.borderColor = '#e2e8f0';
        tabBtn.style.background = '#fff';
      }
    });

    var panel = document.createElement('div');
    panel.id = _panelId;
    panel.style.cssText = 'display:none;margin:8px 0 16px;padding:16px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px';

    page.appendChild(tabBtn);
    page.appendChild(panel);

    // Badge updaten
    _updateBadge();

    // Bei Objektwechsel neu rendern
    var sel = document.getElementById('metaObjektDropdown');
    if (sel) {
      sel.addEventListener('change', function() {
        setTimeout(function() { render(); _updateBadge(); }, 300);
      });
    }
  }

  function _updateBadge() {
    var badge = document.getElementById('gema-offerten-count');
    if (!badge) return;
    if (typeof GemaProdukte === 'undefined') return;
    var objektId = _getObjektId();
    var alle = GemaProdukte.getOffertanfragen();
    var count = objektId ? alle.filter(function(oa) { return oa.projekt && oa.projekt.objektId === objektId && oa.status === 'beantwortet'; }).length : 0;
    if (count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
    else { badge.style.display = 'none'; }
  }

  // Auto-inject nach DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(inject, 500); });
  } else {
    setTimeout(inject, 500);
  }

  w.GemaOffertenTab = { render: render, inject: inject };
})(window);
