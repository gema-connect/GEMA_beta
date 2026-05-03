/**
 * gema_coachmarks.js — GEMA Onboarding Coachmarks v1
 *
 * Kontextuelle Coachmarks (Overlay-Tooltips) für Erstbesucher einer Seite.
 * Zeigt eine Abfolge von Erklärungs-Karten, die auf DOM-Elemente zeigen,
 * und speichert den "abgeschlossen"-Status pro Seiten-Key im localStorage.
 *
 * Nutzung pro Seite:
 *   GemaCoachmarks.init('pm_objekte', [
 *     {selector:'.btn-primary', title:'Objekt anlegen',
 *      text:'Hier erfasst du dein erstes Bauvorhaben…', placement:'bottom'},
 *     {selector:'.tab-btn:nth-child(2)', title:'Beteiligte',
 *      text:'Architekt, Bauherr, Unternehmer …', placement:'bottom'}
 *   ]);
 *
 * Manueller Start (z.B. über "? Onboarding wiederholen"-Link):
 *   GemaCoachmarks.restart('pm_objekte');
 *
 * Placement: 'top' | 'right' | 'bottom' | 'left' (Fallback: 'bottom')
 * Wenn ein Step-Selector kein Element findet, wird der Step übersprungen.
 */
(function(w){
  'use strict';

  var KEY_PREFIX = 'gema_coachmarks_done_';
  var Z_BASE     = 9000;

  // Styles einmalig in den DOM einfügen
  function _injectStyles(){
    if (document.getElementById('gema-coachmarks-styles')) return;
    var css = [
      '.gcm-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:' + Z_BASE + ';pointer-events:auto;backdrop-filter:blur(1px)}',
      '.gcm-spotlight{position:fixed;border-radius:10px;box-shadow:0 0 0 9999px rgba(15,23,42,.55),0 0 0 3px #fbbf24,0 8px 24px rgba(0,0,0,.25);z-index:' + (Z_BASE + 1) + ';pointer-events:none;transition:all .25s ease}',
      '.gcm-card{position:fixed;max-width:min(340px, calc(100vw - 24px));background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);z-index:' + (Z_BASE + 2) + ';font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;color:#111827;overflow:hidden;transition:all .25s ease}',
      '.gcm-card-hd{padding:14px 16px 10px;display:flex;align-items:flex-start;gap:10px}',
      '.gcm-card-hd .gcm-ic{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#fbbf24,#d97706);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}',
      '.gcm-card-hd h3{font-size:14px;font-weight:800;line-height:1.3;margin:0 0 2px;color:#111827}',
      '.gcm-card-hd .gcm-step-lbl{font-size:10px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:.6px}',
      '.gcm-card-bd{padding:0 16px 12px;font-size:13px;line-height:1.55;color:#374151}',
      '.gcm-card-ft{padding:10px 16px;border-top:1px solid #e5e7eb;background:#f9fafb;display:flex;align-items:center;gap:8px}',
      '.gcm-dots{display:flex;gap:4px;flex:1}',
      '.gcm-dot{width:6px;height:6px;border-radius:50%;background:#d1d5db}',
      '.gcm-dot.active{background:#d97706;transform:scale(1.3)}',
      '.gcm-btn{font-family:inherit;font-size:12px;font-weight:700;padding:6px 12px;border-radius:7px;border:1.5px solid transparent;cursor:pointer;transition:.15s;white-space:nowrap}',
      '.gcm-btn-g{background:#fff;border-color:#d1d5db;color:#374151}',
      '.gcm-btn-g:hover{background:#f3f4f6}',
      '.gcm-btn-p{background:#d97706;color:#fff}',
      '.gcm-btn-p:hover{background:#b45309}',
      '.gcm-btn-skip{background:transparent;color:#6b7280;font-size:11px;font-weight:600;padding:4px 8px}',
      '.gcm-btn-skip:hover{color:#111827;text-decoration:underline}',
      '.gcm-arrow{position:fixed;width:0;height:0;z-index:' + (Z_BASE + 2) + ';pointer-events:none}',
      '.gcm-arrow.t{border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:10px solid #fff}',
      '.gcm-arrow.b{border-left:10px solid transparent;border-right:10px solid transparent;border-top:10px solid #fff}',
      '.gcm-arrow.l{border-top:10px solid transparent;border-bottom:10px solid transparent;border-right:10px solid #fff}',
      '.gcm-arrow.r{border-top:10px solid transparent;border-bottom:10px solid transparent;border-left:10px solid #fff}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = 'gema-coachmarks-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  var _active = null; // { pageKey, steps, index, nodes }

  function _clampRect(r){
    return {
      top: Math.max(0, r.top),
      left: Math.max(0, r.left),
      width: r.width,
      height: r.height
    };
  }

  function _positionCard(card, spotlight, arrow, rect, placement){
    var margin = 14;
    var cw = card.offsetWidth;
    var ch = card.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var top, left, arrowCls = 'b', ax, ay;
    var p = placement || 'bottom';

    // Primary placement, mit Fallback wenn kein Platz
    function tryPlace(pl){
      switch(pl){
        case 'top':
          if (rect.top - ch - margin < 10) return false;
          top  = rect.top - ch - margin;
          left = Math.min(Math.max(10, rect.left + rect.width/2 - cw/2), vw - cw - 10);
          arrowCls = 'b';
          ax = rect.left + rect.width/2 - 10;
          ay = top + ch;
          return true;
        case 'bottom':
          if (rect.top + rect.height + ch + margin > vh - 10) return false;
          top  = rect.top + rect.height + margin;
          left = Math.min(Math.max(10, rect.left + rect.width/2 - cw/2), vw - cw - 10);
          arrowCls = 't';
          ax = rect.left + rect.width/2 - 10;
          ay = top - 10;
          return true;
        case 'right':
          if (rect.left + rect.width + cw + margin > vw - 10) return false;
          left = rect.left + rect.width + margin;
          top  = Math.min(Math.max(10, rect.top + rect.height/2 - ch/2), vh - ch - 10);
          arrowCls = 'l';
          ax = left - 10;
          ay = rect.top + rect.height/2 - 10;
          return true;
        case 'left':
          if (rect.left - cw - margin < 10) return false;
          left = rect.left - cw - margin;
          top  = Math.min(Math.max(10, rect.top + rect.height/2 - ch/2), vh - ch - 10);
          arrowCls = 'r';
          ax = left + cw;
          ay = rect.top + rect.height/2 - 10;
          return true;
      }
      return false;
    }

    var order = [p, 'bottom', 'top', 'right', 'left'];
    var ok = false;
    for (var i = 0; i < order.length; i++){
      if (tryPlace(order[i])) { ok = true; break; }
    }
    if (!ok){
      // Fallback: Mitte
      top  = Math.max(10, vh/2 - ch/2);
      left = Math.max(10, vw/2 - cw/2);
      arrow.style.display = 'none';
    } else {
      arrow.style.display = '';
      arrow.className = 'gcm-arrow ' + arrowCls;
      arrow.style.top  = ay + 'px';
      arrow.style.left = ax + 'px';
    }

    card.style.top  = top + 'px';
    card.style.left = Math.max(12, Math.min(left, vw - cw - 12)) + 'px';

    // Spotlight um das Ziel-Element
    spotlight.style.top    = (rect.top - 6) + 'px';
    spotlight.style.left   = (rect.left - 6) + 'px';
    spotlight.style.width  = (rect.width + 12) + 'px';
    spotlight.style.height = (rect.height + 12) + 'px';
  }

  function _render(){
    if (!_active) return;
    var step = _active.steps[_active.index];
    var target = document.querySelector(step.selector);
    if (!target){
      // Step überspringen wenn Ziel nicht existiert
      return _next();
    }

    // Ziel ins Viewport scrollen
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch(e) {}

    // Kurze Verzögerung, damit Scroll abgeschlossen ist, bevor wir Positionen berechnen
    setTimeout(function(){
      if (!_active) return;
      var r = _clampRect(target.getBoundingClientRect());
      var card = _active.nodes.card;
      var ic = (step.icon || '💡');
      var total = _active.steps.length;
      card.innerHTML =
        '<div class="gcm-card-hd">'
      +   '<div class="gcm-ic">' + ic + '</div>'
      +   '<div style="flex:1;min-width:0">'
      +     '<div class="gcm-step-lbl">Schritt ' + (_active.index + 1) + ' / ' + total + '</div>'
      +     '<h3>' + _escapeHtml(step.title || '') + '</h3>'
      +   '</div>'
      + '</div>'
      + '<div class="gcm-card-bd">' + (step.html || _escapeHtml(step.text || '')) + '</div>'
      + '<div class="gcm-card-ft">'
      +   '<div class="gcm-dots">' + _active.steps.map(function(_, i){ return '<span class="gcm-dot' + (i === _active.index ? ' active' : '') + '"></span>'; }).join('') + '</div>'
      +   (_active.index > 0 ? '<button class="gcm-btn gcm-btn-g" data-gcm="prev">← Zurück</button>' : '')
      +   '<button class="gcm-btn gcm-btn-skip" data-gcm="skip">Überspringen</button>'
      +   '<button class="gcm-btn gcm-btn-p" data-gcm="next">' + (_active.index === total - 1 ? '✓ Fertig' : 'Weiter →') + '</button>'
      + '</div>';

      // Button-Handler
      card.querySelectorAll('[data-gcm]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var act = btn.getAttribute('data-gcm');
          if (act === 'prev') _prev();
          else if (act === 'next') _next();
          else if (act === 'skip') _skip();
        });
      });

      _positionCard(card, _active.nodes.spotlight, _active.nodes.arrow, r, step.placement);
    }, 120);
  }

  function _next(){
    if (!_active) return;
    if (_active.index >= _active.steps.length - 1){
      _finish();
      return;
    }
    _active.index++;
    _render();
  }
  function _prev(){
    if (!_active) return;
    if (_active.index > 0){ _active.index--; _render(); }
  }
  function _skip(){
    _finish();
  }
  function _finish(){
    if (!_active) return;
    try { localStorage.setItem(KEY_PREFIX + _active.pageKey, '1'); } catch(e) {}
    _teardown();
  }
  function _teardown(){
    if (!_active) return;
    ['backdrop','spotlight','card','arrow'].forEach(function(n){
      var el = _active.nodes[n];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    window.removeEventListener('resize', _onResize);
    window.removeEventListener('scroll', _onResize, true);
    document.removeEventListener('keydown', _onKey);
    _active = null;
  }

  function _onResize(){
    if (!_active) return;
    // Position neu berechnen (Spotlight folgt dem Ziel)
    var step = _active.steps[_active.index];
    var target = document.querySelector(step.selector);
    if (!target) return;
    var r = _clampRect(target.getBoundingClientRect());
    _positionCard(_active.nodes.card, _active.nodes.spotlight, _active.nodes.arrow, r, step.placement);
  }
  function _onKey(e){
    if (!_active) return;
    if (e.key === 'Escape') _skip();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') _next();
    else if (e.key === 'ArrowLeft') _prev();
  }

  function _escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]);
    });
  }

  function _start(pageKey, steps){
    if (!steps || !steps.length) return;
    if (_active) return; // Bereits aktiv
    _injectStyles();

    var backdrop  = document.createElement('div');
    backdrop.className = 'gcm-backdrop';
    backdrop.addEventListener('click', _skip);

    var spotlight = document.createElement('div');
    spotlight.className = 'gcm-spotlight';

    var card = document.createElement('div');
    card.className = 'gcm-card';

    var arrow = document.createElement('div');
    arrow.className = 'gcm-arrow';

    document.body.appendChild(backdrop);
    document.body.appendChild(spotlight);
    document.body.appendChild(arrow);
    document.body.appendChild(card);

    _active = {
      pageKey: pageKey,
      steps: steps,
      index: 0,
      nodes: { backdrop: backdrop, spotlight: spotlight, card: card, arrow: arrow }
    };

    window.addEventListener('resize', _onResize);
    window.addEventListener('scroll', _onResize, true);
    document.addEventListener('keydown', _onKey);

    _render();
  }

  // ── Public API ────────────────────────────────────────────────
  // init(): startet die Steps automatisch beim ersten Seitenbesuch
  function init(pageKey, steps, opts){
    opts = opts || {};
    try {
      if (localStorage.getItem(KEY_PREFIX + pageKey) && !opts.force) return false;
    } catch(e) {}
    // Kurze Verzögerung, damit die Seite fertig gerendert ist
    var delay = typeof opts.delay === 'number' ? opts.delay : 600;
    setTimeout(function(){ _start(pageKey, steps); }, delay);
    return true;
  }

  // restart(): löscht den Abgeschlossen-Flag und startet sofort
  function restart(pageKey, steps){
    try { localStorage.removeItem(KEY_PREFIX + pageKey); } catch(e) {}
    if (steps) _start(pageKey, steps);
  }

  // isDone(): true wenn Coachmarks für diese Seite schon abgeschlossen
  function isDone(pageKey){
    try { return !!localStorage.getItem(KEY_PREFIX + pageKey); } catch(e) { return false; }
  }

  // markDone(): manuell als erledigt markieren (ohne zu zeigen)
  function markDone(pageKey){
    try { localStorage.setItem(KEY_PREFIX + pageKey, '1'); } catch(e) {}
  }

  w.GemaCoachmarks = {
    init: init,
    restart: restart,
    isDone: isDone,
    markDone: markDone
  };
})(window);
