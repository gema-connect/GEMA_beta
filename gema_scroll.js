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
  /* Zwei Verfahren, bewusst getrennt:
   *
   *  (a) SANFT (Desktop, Android, alles ausser iOS) — overflow-y:hidden auf
   *      <html>. Die Scroll-Position bleibt dabei UNVERAENDERT: beim Oeffnen
   *      bewegt sich nichts, beim Schliessen ist nichts wiederherzustellen.
   *      Das ist der Normalfall und das gewuenschte Verhalten («Dialog auf,
   *      Dialog zu — die Seite steht einfach still»).
   *
   *  (b) FIXED (nur iOS Safari) — dort ignoriert die Engine overflow:hidden
   *      auf dem Scroll-Container, nur position:fixed friert zuverlaessig
   *      ein. Preis: das Dokument steht waehrend des Locks real auf 0 und
   *      muss beim Schliessen zurueckgesetzt werden.
   *
   *  KRITISCH beim Zurueckscrollen (b): mehrere Module setzen
   *  `html{scroll-behavior:smooth}` (if_werkzeug, if_fahrzeug, ab_*, …).
   *  Ein blosses scrollTo() wird dadurch ANIMIERT — man sah die Seite nach
   *  dem Schliessen sichtbar von oben zurueckfahren. _instantScrollTo()
   *  schaltet das Smooth-Verhalten fuer diesen einen Sprung ab.
   */
  var _scrollY = 0;
  var _lockCount = 0;
  var _padSaved = null;
  var _usedFixed = false;

  var _iOS = (function() {
    try {
      var ua = w.navigator.userAgent || '';
      if (/iP(ad|hone|od)/.test(ua)) return true;
      // iPadOS meldet sich seit 13 als "MacIntel" mit Touch
      return w.navigator.platform === 'MacIntel' && (w.navigator.maxTouchPoints || 0) > 1;
    } catch (e) { return false; }
  })();

  function _instantScrollTo(y) {
    var de = document.documentElement;
    var prev = de.style.scrollBehavior;
    de.style.scrollBehavior = 'auto';
    w.scrollTo(0, y);
    de.style.scrollBehavior = prev;
  }

  function _lock() {
    _lockCount++;
    if (_lockCount > 1) return;
    _scrollY = w.scrollY || w.pageYOffset || 0;
    var b = document.body, de = document.documentElement;
    if (_iOS) {
      _usedFixed = true;
      b.style.top = '-' + _scrollY + 'px';
      b.classList.add('gema-modal-open');
    } else {
      _usedFixed = false;
      // Scrollbalken-Breite ausgleichen, sonst rutscht der Inhalt beim
      // Sperren um ~15px nach rechts (sichtbarer Sprung am Desktop).
      var sw = w.innerWidth - de.clientWidth;
      if (sw > 0) {
        _padSaved = b.style.paddingRight;
        var cur = parseFloat(w.getComputedStyle(b).paddingRight) || 0;
        b.style.paddingRight = (cur + sw) + 'px';
      }
      de.classList.add('gema-modal-soft');
    }
  }
  function _release() {
    var b = document.body, de = document.documentElement;
    var wasFixed = _usedFixed || b.classList.contains('gema-modal-open');
    b.classList.remove('gema-modal-open');
    de.classList.remove('gema-modal-soft');
    b.style.top = '';
    if (_padSaved !== null) { b.style.paddingRight = _padSaved; _padSaved = null; }
    _usedFixed = false;
    // Nur der fixed-Weg hat die Seite real bewegt — nur dort zurueckspringen.
    if (wasFixed) _instantScrollTo(_scrollY);
  }
  function _unlock() {
    if (_lockCount <= 0) return;
    _lockCount--;
    if (_lockCount > 0) return;
    _release();
  }
  function _reset() {
    _lockCount = 0;
    _release();
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
