/* ═══════════════════════════════════════════════════
   GEMA Mobile Menu — Hamburger → Slide-In Panel
   Automatically converts .g-nav-right to mobile menu
   ═══════════════════════════════════════════════════ */
(function() {
  'use strict';

  var BREAKPOINT = 768;
  var menuOpen = false;
  var hamburgerBtn = null;
  var overlay = null;
  var panel = null;
  var navRight = null;
  var navContainer = null;
  var originalItems = [];

  function init() {
    navRight = document.querySelector('.g-nav-right');
    // Fallback: find last flex container in nav with buttons
    if (!navRight) {
      var navInner = document.querySelector('.g-nav-inner') || document.querySelector('.g-nav');
      if (navInner) {
        var divs = navInner.querySelectorAll('div');
        for (var d = 0; d < divs.length; d++) {
          var hasBtn = divs[d].querySelector('.g-nav-btn, .gema-feedback-btn');
          if (hasBtn && divs[d].children.length >= 2) {
            navRight = divs[d];
            break;
          }
        }
      }
    }
    if (!navRight) return;

    // Collect original nav items info
    var children = navRight.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (el.classList.contains('no-print') || el.tagName === 'BUTTON' || el.tagName === 'A') {
        originalItems.push({
          element: el,
          html: el.outerHTML,
          isAdmin: el.classList.contains('gema-admin-only'),
          isFeedback: el.classList.contains('gema-feedback-btn'),
          isHidden: el.style.display === 'none' || el.id === 'navOrgAdmin'
        });
      }
    }

    // Find the nav container for inserting hamburger
    navContainer = navRight.parentNode;

    createHamburger();
    createPanel();
    handleResize();
    window.addEventListener('resize', handleResize);
  }

  function createHamburger() {
    hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'gema-hamburger no-print';
    hamburgerBtn.setAttribute('aria-label', 'Menü öffnen');
    hamburgerBtn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
        '<line x1="3" y1="5" x2="17" y2="5"/>' +
        '<line x1="3" y1="10" x2="17" y2="10"/>' +
        '<line x1="3" y1="15" x2="17" y2="15"/>' +
      '</svg>';
    hamburgerBtn.addEventListener('click', toggleMenu);

    // Insert hamburger in the nav container (replaces nav-right position)
    navContainer.appendChild(hamburgerBtn);
  }

  function createPanel() {
    // Overlay (blurred backdrop)
    overlay = document.createElement('div');
    overlay.className = 'gema-menu-overlay';
    overlay.addEventListener('click', closeMenu);

    // Panel
    panel = document.createElement('div');
    panel.className = 'gema-menu-panel';

    // Panel header
    var header = document.createElement('div');
    header.className = 'gema-menu-header';
    header.innerHTML =
      '<span class="gema-menu-title">Menü</span>' +
      '<button class="gema-menu-close" aria-label="Menü schliessen">' +
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
          '<line x1="5" y1="5" x2="15" y2="15"/>' +
          '<line x1="15" y1="5" x2="5" y2="15"/>' +
        '</svg>' +
      '</button>';
    header.querySelector('.gema-menu-close').addEventListener('click', closeMenu);
    panel.appendChild(header);

    // Menu items
    var list = document.createElement('div');
    list.className = 'gema-menu-list';

    for (var i = 0; i < originalItems.length; i++) {
      var item = originalItems[i];
      var el = item.element;

      var menuItem = document.createElement('button');
      menuItem.className = 'gema-menu-item';

      // Transfer special classes
      if (item.isAdmin) menuItem.classList.add('gema-admin-only');
      if (item.isHidden) menuItem.style.display = 'none';
      if (el.id) menuItem.setAttribute('data-mirror-id', el.id);

      // Icon + Label
      var icon = extractIcon(el);
      var label = extractLabel(el);

      // Special styling for feedback
      if (item.isFeedback) {
        menuItem.classList.add('gema-menu-item--feedback');
      }

      // Special styling for logout
      if (label === 'Abmelden') {
        menuItem.classList.add('gema-menu-item--logout');
      }

      menuItem.innerHTML =
        '<span class="gema-menu-icon">' + icon + '</span>' +
        '<span class="gema-menu-label">' + label + '</span>';

      // Copy action
      (function(origEl) {
        menuItem.addEventListener('click', function() {
          closeMenu();
          if (origEl.tagName === 'A') {
            window.location.href = origEl.href;
          } else if (origEl.onclick) {
            origEl.onclick.call(origEl);
          } else {
            origEl.click();
          }
        });
      })(el);

      list.appendChild(menuItem);
    }

    panel.appendChild(list);

    // Abmelden-Button immer hinzufügen (falls nicht schon vorhanden)
    var hasLogout = false;
    for (var j = 0; j < originalItems.length; j++) {
      if (extractLabel(originalItems[j].element) === 'Abmelden') { hasLogout = true; break; }
    }
    if (!hasLogout) {
      var logoutItem = document.createElement('button');
      logoutItem.className = 'gema-menu-item gema-menu-item--logout';
      logoutItem.innerHTML = '<span class="gema-menu-icon">🚪</span><span class="gema-menu-label">Abmelden</span>';
      logoutItem.addEventListener('click', function() {
        closeMenu();
        if (typeof GemaAuth !== 'undefined') GemaAuth.logout();
        else window.location.href = 'sys_login.html';
      });
      list.appendChild(logoutItem);
    }

    // Version info
    var footer = document.createElement('div');
    footer.className = 'gema-menu-footer';
    footer.textContent = 'GEMA Beta';
    panel.appendChild(footer);

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Sync visibility of mirrored items (e.g. navOrgAdmin)
    syncMirrors();
  }

  function extractIcon(el) {
    var text = el.textContent.trim();
    // Check for emoji at start
    var emojiMatch = text.match(/^([\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F300}-\u{1F9FF}]|[\u{2702}-\u{27B0}]|🔴|📄|🖨|⚙️|👥|🏢|🔒)/u);
    if (emojiMatch) return emojiMatch[0];

    // Fallback icons by title/content
    var title = (el.title || '').toLowerCase();
    if (title.indexOf('abmelden') >= 0 || text.indexOf('Abmelden') >= 0) return '🚪';
    if (title.indexOf('einstellung') >= 0) return '⚙️';
    if (title.indexOf('admin') >= 0 || title.indexOf('benutzer') >= 0) return '👥';
    if (title.indexOf('unternehmen') >= 0) return '🏢';
    if (el.classList.contains('gema-feedback-btn')) return '🔴';
    return '•';
  }

  function extractLabel(el) {
    var text = el.textContent.trim();
    // Remove leading emoji
    text = text.replace(/^([\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F300}-\u{1F9FF}]|[\u{2702}-\u{27B0}]|🔴|📄|🖨|⚙️|👥|🏢|🔒)\s*/u, '');
    if (!text) text = el.title || 'Aktion';
    return text;
  }

  function syncMirrors() {
    // Watch for visibility changes on original items (e.g. navOrgAdmin shown by auth)
    if (typeof MutationObserver !== 'undefined') {
      for (var i = 0; i < originalItems.length; i++) {
        (function(item) {
          var obs = new MutationObserver(function() {
            var mirror = panel.querySelector('[data-mirror-id="' + item.element.id + '"]');
            if (mirror) {
              mirror.style.display = (item.element.style.display === 'none') ? 'none' : '';
            }
          });
          if (item.element.id) {
            obs.observe(item.element, { attributes: true, attributeFilter: ['style'] });
          }
        })(originalItems[i]);
      }
    }
  }

  function toggleMenu() {
    if (menuOpen) closeMenu();
    else openMenu();
  }

  function openMenu() {
    menuOpen = true;
    overlay.classList.add('open');
    panel.classList.add('open');
    hamburgerBtn.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    menuOpen = false;
    overlay.classList.remove('open');
    panel.classList.remove('open');
    hamburgerBtn.classList.remove('active');
    document.body.style.overflow = '';
  }

  function handleResize() {
    var isMobile = window.innerWidth <= BREAKPOINT;
    if (hamburgerBtn) {
      hamburgerBtn.style.display = isMobile ? 'flex' : 'none';
    }
    if (navRight) {
      navRight.style.display = isMobile ? 'none' : '';
    }
    if (!isMobile && menuOpen) {
      closeMenu();
    }
  }

  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
