/* gema_scroll.js – Scroll-Helfer für GEMA
 *
 * Zwei Aufgaben:
 *   1) Scroll-Position wiederherstellen bei Browser-Zurück (Original)
 *   2) Body-Scroll-Lock fuer Modal-Dialoge (NEU): wenn ein Modal offen
 *      ist, kann die Hauptseite nicht mehr scrollen — der Modal-Body
 *      selber bleibt scrollbar. iOS-Safari-tauglich (position:fixed-
 *      Trick statt nur overflow:hidden).
 *
 * Auto-Hook: Ein MutationObserver beobachtet alle `.modal-bg`-Elemente.
 * Sobald eines sichtbar wird (`.open` gesetzt oder `.hidden` entfernt),
 * lockt der Helper den Body. Sobald keines mehr sichtbar ist, gibt er
 * den Body frei. So funktioniert es ohne Aenderungen in den einzelnen
 * Modulen.
 */
(function(w) {
  // ── 1) Scroll-Position wiederherstellen ──────────────────────────
  var key = 'gema_scroll__' + location.pathname;
  var tid;
  window.addEventListener('scroll', function() {
    clearTimeout(tid);
    tid = setTimeout(function() {
      try { sessionStorage.setItem(key, String(window.scrollY)); } catch(e) {}
    }, 150);
  }, { passive: true });

  window.addEventListener('pageshow', function(e) {
    if (e.persisted) {
      var pos = sessionStorage.getItem(key);
      if (pos) window.scrollTo(0, parseInt(pos, 10));
    }
  });

  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  var isBack = nav && nav.type === 'back_forward';
  if (!isBack && window.performance && window.performance.navigation) {
    isBack = window.performance.navigation.type === 2;
  }
  if (isBack) {
    var pos = sessionStorage.getItem(key);
    if (pos) {
      requestAnimationFrame(function() {
        window.scrollTo(0, parseInt(pos, 10));
      });
    }
  }

  // ── 2) Body-Scroll-Lock fuer Modals ──────────────────────────────
  var _scrollY = 0;
  var _lockCount = 0;

  function _lock() {
    _lockCount++;
    if (_lockCount > 1) return;
    _scrollY = w.scrollY || w.pageYOffset || 0;
    var b = document.body;
    // iOS Safari ignoriert overflow:hidden auf body; position:fixed
    // mit negativem top friert die Seite zuverlaessig ein. Position
    // wird im unlock() wiederhergestellt.
    b.style.top = '-' + _scrollY + 'px';
    b.classList.add('gema-modal-open');
  }
  function _unlock() {
    if (_lockCount <= 0) return;
    _lockCount--;
    if (_lockCount > 0) return;
    var b = document.body;
    b.classList.remove('gema-modal-open');
    b.style.top = '';
    w.scrollTo(0, _scrollY);
  }
  function _reset() {
    _lockCount = 0;
    var b = document.body;
    b.classList.remove('gema-modal-open');
    b.style.top = '';
  }

  w.GemaScroll = {
    lock: _lock,
    unlock: _unlock,
    reset: _reset,
    isLocked: function() { return _lockCount > 0; }
  };

  // ── Auto-Hook fuer .modal-bg ─────────────────────────────────────
  // Erkennt sichtbare Modals nach drei gaengigen Patterns:
  //   - <div class="modal-bg open">         (sys_admin)
  //   - <div class="modal-bg">              (sys_unternehmen, defaul: visible)
  //   - <div class="modal-bg hidden">       (if_trocknung, if_werkzeug, if_fahrzeug)
  // Sichtbar wenn: 'open' gesetzt ODER ('hidden' nicht gesetzt UND computed display !== 'none')
  function _isModalVisible(el) {
    if (!el || !el.classList) return false;
    if (el.classList.contains('open')) return true;
    if (el.classList.contains('hidden')) return false;
    try {
      var d = w.getComputedStyle(el).display;
      return d && d !== 'none';
    } catch (e) { return false; }
  }
  function _checkModals() {
    var modals = document.querySelectorAll('.modal-bg');
    var anyOpen = false;
    for (var i = 0; i < modals.length; i++) {
      if (_isModalVisible(modals[i])) { anyOpen = true; break; }
    }
    if (anyOpen && _lockCount === 0) _lock();
    else if (!anyOpen && _lockCount > 0) _reset();
  }
  function _setupAutoLock() {
    if (!w.MutationObserver) return;
    var obs = new MutationObserver(function(mutations) {
      var relevant = false;
      for (var i = 0; i < mutations.length; i++) {
        var t = mutations[i].target;
        if (t && t.classList && t.classList.contains('modal-bg')) { relevant = true; break; }
      }
      if (relevant) _checkModals();
    });
    obs.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class', 'style']
    });
    _checkModals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _setupAutoLock);
  } else {
    _setupAutoLock();
  }
})(window);
