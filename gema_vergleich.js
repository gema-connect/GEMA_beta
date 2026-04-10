/**
 * gema_vergleich.js — Produkt-Vergleichskorb v1 (#32)
 *
 * Liefert einen globalen Vergleichskorb (max. 4 Produkte pro Kategorie),
 * einen sticky Badge unten rechts, der erscheint sobald mind. 1 Produkt
 * im Korb ist, und ein Side-by-Side-Vergleichsmodal mit Tabelle.
 *
 * Die Vergleichstabelle wird dynamisch aus `GemaProdukte.KATEGORIEN[kat].felder`
 * aufgebaut — jedes Feld bekommt eine eigene Zeile. Unterschiede werden
 * hervorgehoben (alle Produkte mit gleichem Wert sind neutral, abweichende
 * Werte werden farbig markiert).
 *
 * Nutzung:
 *   GemaVergleich.toggle(produktId, kategorie)    // add/remove
 *   GemaVergleich.has(produktId, kategorie)       // bool
 *   GemaVergleich.count(kategorie)                // int (je Kategorie)
 *   GemaVergleich.open(kategorie)                 // Modal öffnen
 *   GemaVergleich.clear(kategorie)                // Korb für Kategorie leeren
 *   GemaVergleich.onChange(cb)                    // Callback bei Änderungen
 *
 * Speicherung: localStorage-Key `gema_vergleich_korb_v1` als Map { [kat]: [id...] }.
 * Max. 4 Produkte pro Kategorie (darüber: ältester fällt raus).
 */
(function(w){
  'use strict';

  var SK  = 'gema_vergleich_korb_v1';
  var MAX = 4;
  var Z   = 8500;
  var _korb = _load();
  var _listeners = [];

  function _load(){
    try { var r = localStorage.getItem(SK); if (r) return JSON.parse(r) || {}; } catch(e) {}
    return {};
  }
  function _save(){
    try { localStorage.setItem(SK, JSON.stringify(_korb)); } catch(e) {}
  }
  function _notify(){
    _listeners.forEach(function(fn){ try { fn(); } catch(e) {} });
    _renderBadge();
  }

  function _list(kat){ return (_korb[kat] || []).slice(); }

  function has(produktId, kat){
    return _list(kat).indexOf(produktId) >= 0;
  }
  function count(kat){
    return _list(kat).length;
  }
  function countAll(){
    var n = 0;
    Object.keys(_korb).forEach(function(k){ n += (_korb[k] || []).length; });
    return n;
  }
  function kategorieWithItems(){
    // Gibt die erste Kategorie mit Items zurück (für Single-Page Badge-Click)
    var keys = Object.keys(_korb);
    for (var i = 0; i < keys.length; i++){
      if ((_korb[keys[i]] || []).length) return keys[i];
    }
    return null;
  }
  function add(produktId, kat){
    if (!produktId || !kat) return false;
    var list = _list(kat);
    if (list.indexOf(produktId) >= 0) return true;
    if (list.length >= MAX){
      // Ältesten (ersten) entfernen
      list.shift();
    }
    list.push(produktId);
    _korb[kat] = list;
    _save();
    _notify();
    return true;
  }
  function remove(produktId, kat){
    var list = _list(kat);
    var i = list.indexOf(produktId);
    if (i < 0) return false;
    list.splice(i, 1);
    _korb[kat] = list;
    _save();
    _notify();
    return true;
  }
  function toggle(produktId, kat){
    if (has(produktId, kat)) { remove(produktId, kat); return false; }
    add(produktId, kat);
    return true;
  }
  function clear(kat){
    if (kat) delete _korb[kat];
    else _korb = {};
    _save();
    _notify();
  }
  function onChange(cb){
    if (typeof cb === 'function') _listeners.push(cb);
  }

  // ═══════════════════════════════════════════════
  // UI: Sticky Badge
  // ═══════════════════════════════════════════════
  function _ensureStyles(){
    if (document.getElementById('gema-vergleich-styles')) return;
    var css = [
      '.gvgl-badge{position:fixed;bottom:24px;right:24px;z-index:' + Z + ';background:#2563eb;color:#fff;border:none;border-radius:999px;padding:12px 20px 12px 16px;box-shadow:0 10px 30px rgba(37,99,235,.4);font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all .2s}',
      '.gvgl-badge:hover{background:#1d4ed8;transform:translateY(-2px);box-shadow:0 14px 36px rgba(37,99,235,.5)}',
      '.gvgl-badge .gvgl-ic{font-size:18px}',
      '.gvgl-badge .gvgl-count{background:#fff;color:#2563eb;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:800;min-width:22px;text-align:center}',
      '.gvgl-badge .gvgl-close{background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;font-weight:700;margin-left:4px;padding:0}',
      '.gvgl-badge .gvgl-close:hover{background:rgba(255,255,255,.3)}',
      '.gvgl-overlay{display:none;position:fixed;inset:0;z-index:' + (Z + 10) + ';background:rgba(15,23,42,.55);backdrop-filter:blur(4px);padding:40px 20px;overflow-y:auto}',
      '.gvgl-overlay.open{display:flex;align-items:flex-start;justify-content:center}',
      '.gvgl-modal{background:#fff;border-radius:16px;box-shadow:0 25px 60px rgba(0,0,0,.3);max-width:1100px;width:100%;max-height:calc(100vh - 80px);display:flex;flex-direction:column;overflow:hidden;font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;color:#111827}',
      '.gvgl-hd{padding:16px 22px;border-bottom:1.5px solid #e2e7f0;display:flex;align-items:center;gap:12px;flex-shrink:0}',
      '.gvgl-hd h2{font-size:17px;font-weight:800;flex:1;margin:0}',
      '.gvgl-hd .gvgl-kat{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700}',
      '.gvgl-hd button{background:#fff;border:1.5px solid #cdd4e4;border-radius:8px;width:32px;height:32px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
      '.gvgl-hd button:hover{background:#fef2f2;color:#dc2626;border-color:#fecaca}',
      '.gvgl-bd{flex:1;overflow:auto;padding:0}',
      '.gvgl-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.gvgl-table th,.gvgl-table td{padding:10px 14px;border-bottom:1px solid #e2e7f0;text-align:left;vertical-align:top}',
      '.gvgl-table thead th{background:#f8faff;position:sticky;top:0;z-index:2;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#374151;border-bottom:2px solid #cdd4e4}',
      '.gvgl-table thead th .gvgl-prod-name{font-size:14px;font-weight:800;color:#111827;text-transform:none;letter-spacing:0;margin-bottom:2px}',
      '.gvgl-table thead th .gvgl-prod-lief{font-size:11px;font-weight:600;color:#6b7280;text-transform:none;letter-spacing:0}',
      '.gvgl-table thead th .gvgl-prod-rm{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;cursor:pointer;margin-top:4px}',
      '.gvgl-table thead th .gvgl-prod-rm:hover{background:#dc2626;color:#fff}',
      '.gvgl-table tbody tr.gvgl-group td{background:#f4f6fb;font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;padding:6px 14px}',
      '.gvgl-table td.gvgl-label{font-weight:700;color:#374151;white-space:nowrap;width:180px}',
      '.gvgl-table td.gvgl-diff{background:#fffbeb;font-weight:700;color:#92400e}',
      '.gvgl-table td.gvgl-same{color:#6b7280}',
      '.gvgl-empty{padding:60px 20px;text-align:center;color:#6b7280}',
      '.gvgl-empty h3{font-size:16px;font-weight:700;margin:8px 0 4px;color:#374151}',
      '.gvgl-ft{padding:12px 22px;border-top:1.5px solid #e2e7f0;background:#f8faff;display:flex;align-items:center;gap:10px;flex-shrink:0}',
      '.gvgl-ft button{font-family:inherit;font-size:13px;font-weight:700;padding:8px 16px;border-radius:8px;border:1.5px solid transparent;cursor:pointer;transition:.15s}',
      '.gvgl-btn-g{background:#fff;border-color:#cdd4e4;color:#374151}',
      '.gvgl-btn-g:hover{background:#f4f6fb}',
      '.gvgl-btn-d{background:#fef2f2;border-color:#fecaca;color:#dc2626}',
      '.gvgl-btn-d:hover{background:#dc2626;color:#fff}',
      '@media(max-width:700px){.gvgl-badge{bottom:16px;right:16px;padding:10px 14px;font-size:12px}}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'gema-vergleich-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  var _badge = null;
  function _renderBadge(){
    _ensureStyles();
    var total = countAll();
    if (!total){
      if (_badge && _badge.parentNode) _badge.parentNode.removeChild(_badge);
      _badge = null;
      return;
    }
    if (!_badge){
      _badge = document.createElement('div');
      _badge.className = 'gvgl-badge';
      _badge.innerHTML = '<span class="gvgl-ic">⚖</span><span>Vergleichen</span><span class="gvgl-count">0</span><button class="gvgl-close" title="Korb leeren">✕</button>';
      _badge.addEventListener('click', function(e){
        if (e.target && (e.target.classList.contains('gvgl-close') || e.target.closest('.gvgl-close'))) return;
        var kat = kategorieWithItems();
        if (kat) open(kat);
      });
      _badge.querySelector('.gvgl-close').addEventListener('click', function(e){
        e.stopPropagation();
        clear();
      });
      document.body.appendChild(_badge);
    }
    _badge.querySelector('.gvgl-count').textContent = total;
  }

  // ═══════════════════════════════════════════════
  // UI: Vergleichsmodal
  // ═══════════════════════════════════════════════
  var _overlay = null;
  function _ensureOverlay(){
    if (_overlay) return _overlay;
    _overlay = document.createElement('div');
    _overlay.className = 'gvgl-overlay';
    _overlay.innerHTML = '<div class="gvgl-modal">'
      + '<div class="gvgl-hd"><h2>Produktvergleich</h2><span class="gvgl-kat" id="gvglKat">–</span><button class="gvgl-close-modal" title="Schliessen">✕</button></div>'
      + '<div class="gvgl-bd" id="gvglBody"></div>'
      + '<div class="gvgl-ft"><div style="flex:1;font-size:11px;color:#6b7280">Abweichende Werte sind <strong style="color:#92400e">gelb markiert</strong>. Max. ' + MAX + ' Produkte pro Vergleich.</div><button class="gvgl-btn-d" id="gvglClear">Korb leeren</button><button class="gvgl-btn-g" id="gvglClose">Schliessen</button></div>'
      + '</div>';
    _overlay.addEventListener('click', function(e){
      if (e.target === _overlay) _closeOverlay();
    });
    _overlay.querySelector('.gvgl-close-modal').addEventListener('click', _closeOverlay);
    _overlay.querySelector('#gvglClose').addEventListener('click', _closeOverlay);
    _overlay.querySelector('#gvglClear').addEventListener('click', function(){
      if (_currentKat) clear(_currentKat);
      _closeOverlay();
    });
    document.body.appendChild(_overlay);
    return _overlay;
  }
  function _closeOverlay(){
    if (_overlay) _overlay.classList.remove('open');
    _currentKat = null;
  }

  var _currentKat = null;
  function open(kat){
    _ensureStyles();
    _ensureOverlay();
    _currentKat = kat;
    _renderModalContent(kat);
    _overlay.classList.add('open');
  }

  function _escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]);
    });
  }

  function _renderModalContent(kat){
    if (typeof GemaProdukte === 'undefined'){
      _overlay.querySelector('#gvglBody').innerHTML = '<div class="gvgl-empty"><div style="font-size:36px">⚠</div><h3>GemaProdukte nicht verfügbar</h3></div>';
      return;
    }
    var kategorie = GemaProdukte.getKategorie ? GemaProdukte.getKategorie(kat) : (GemaProdukte.KATEGORIEN || {})[kat];
    var katName = (kategorie && kategorie.name) || kat;
    var katLabel = _overlay.querySelector('#gvglKat');
    if (katLabel) katLabel.textContent = (kategorie && kategorie.icon ? kategorie.icon + ' ' : '') + katName;

    var ids = _list(kat);
    var produkte = ids.map(function(id){ return GemaProdukte.getProdukt ? GemaProdukte.getProdukt(id) : null; }).filter(Boolean);

    var body = _overlay.querySelector('#gvglBody');
    if (!produkte.length){
      body.innerHTML = '<div class="gvgl-empty"><div style="font-size:42px">⚖</div><h3>Kein Produkt im Vergleich</h3><p style="font-size:13px">Füge Produkte über den «Vergleichen»-Button hinzu.</p></div>';
      return;
    }
    if (produkte.length === 1){
      body.innerHTML = '<div class="gvgl-empty"><div style="font-size:42px">⚖</div><h3>Nur 1 Produkt im Vergleich</h3><p style="font-size:13px">Füge mindestens ein weiteres Produkt hinzu, um zu vergleichen.</p></div>';
      return;
    }

    var felder = (kategorie && kategorie.felder) || [];
    if (!felder.length){
      body.innerHTML = '<div class="gvgl-empty"><div style="font-size:36px">ℹ</div><h3>Keine Vergleichsfelder definiert</h3><p style="font-size:13px">Für diese Kategorie sind noch keine technischen Felder registriert.</p></div>';
      return;
    }

    // Gruppieren nach `gruppe`-Feld
    var gruppen = [];
    var gMap = {};
    felder.forEach(function(f){
      var g = f.gruppe || 'Allgemein';
      if (!gMap[g]) { gMap[g] = { name: g, felder: [] }; gruppen.push(gMap[g]); }
      gMap[g].felder.push(f);
    });

    function fmt(val, feld){
      if (val == null || val === '') return '<span style="color:#cbd5e1">–</span>';
      var s = String(val);
      if (feld && feld.einheit) s += ' <span style="color:#6b7280;font-weight:500">' + _escapeHtml(feld.einheit) + '</span>';
      return s;
    }

    var head = '<thead><tr><th></th>' + produkte.map(function(p){
      var serie = (p.daten && p.daten.serie) || '–';
      var modell = (p.daten && p.daten.modell) || '';
      var lief = p.lieferantFirma || '–';
      return '<th>'
        + '<div class="gvgl-prod-name">' + _escapeHtml(serie) + ' ' + _escapeHtml(modell) + '</div>'
        + '<div class="gvgl-prod-lief">' + _escapeHtml(lief) + '</div>'
        + '<button class="gvgl-prod-rm" data-rm="' + _escapeHtml(p.id) + '">✕ Entfernen</button>'
        + '</th>';
    }).join('') + '</tr></thead>';

    var rows = '';
    gruppen.forEach(function(grp){
      rows += '<tr class="gvgl-group"><td colspan="' + (produkte.length + 1) + '">' + _escapeHtml(grp.name) + '</td></tr>';
      grp.felder.forEach(function(f){
        var values = produkte.map(function(p){ return (p.daten && p.daten[f.id] != null) ? p.daten[f.id] : null; });
        var distinct = {};
        values.forEach(function(v){ if (v != null && v !== '') distinct[String(v)] = true; });
        var isDiff = Object.keys(distinct).length > 1;
        rows += '<tr>'
          + '<td class="gvgl-label">' + _escapeHtml(f.label || f.id) + '</td>'
          + values.map(function(v){ return '<td class="' + (isDiff ? 'gvgl-diff' : 'gvgl-same') + '">' + fmt(v, f) + '</td>'; }).join('')
          + '</tr>';
      });
    });

    body.innerHTML = '<table class="gvgl-table">' + head + '<tbody>' + rows + '</tbody></table>';

    // Remove-Buttons in Header verdrahten
    body.querySelectorAll('[data-rm]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-rm');
        remove(id, kat);
        if (!_list(kat).length) _closeOverlay();
        else _renderModalContent(kat);
      });
    });
  }

  // Render Badge sofort (falls Korb nicht leer nach Reload)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _renderBadge);
  } else {
    _renderBadge();
  }

  // ── Public API ──
  w.GemaVergleich = {
    add: add,
    remove: remove,
    toggle: toggle,
    has: has,
    count: count,
    countAll: countAll,
    clear: clear,
    open: open,
    onChange: onChange,
    MAX: MAX
  };
})(window);
