/* ═══════════════════════════════════════════════════════════════
   GEMA Mobile Menu v2 — Hamburger → Slide-In Panel (iOS-Feel)
   Konvertiert .g-nav-right zu einem strukturierten Mobile-Menü.

   Struktur des geöffneten Menüs:
   ┌──────────────────────────────────┐
   │ [Avatar] Name              ›  ✕  │  ← tappbar → sys_profil.html
   ├──────────────────────────────────┤
   │ NAVIGATION                       │
   │   🏠 Startseite                › │
   │   📋 Projekte & Objekte        › │
   ├──────────────────────────────────┤
   │ ZULETZT VERWENDET (GemaRecent)   │
   │   🧮 Frischwasserstation       › │
   │   🔧 Werkzeugmanagement        › │
   ├──────────────────────────────────┤
   │ AKTIONEN (page-spezifisch)       │
   │   📄 PDF · 🖨 Drucken (o. Chevron)│
   ├──────────────────────────────────┤
   │ VERWALTUNG (admin-only)          │
   ├──────────────────────────────────┤
   │ KONTO                            │
   │   ⚙️ Einstellungen · 🔴 Feedback │
   │   🚪 Abmelden (destruktiv)       │
   └──────────────────────────────────┘
   Footer: «📱 Als App installieren» (wenn GemaPWA bereit) sonst Version.

   Die Notify-Glocke (.gn-btn aus gema_notify_ui.js) wird auf Mobile
   NICHT ins Menü gespiegelt, sondern aus .g-nav-right NEBEN den
   Hamburger verschoben (Badge bleibt sichtbar — iOS-Pattern); beim
   Zurückwechseln auf Desktop wandert sie an ihren Platz zurück.

   Fokus: Robustheit gegenüber inkonsistenten Nav-Strukturen.
   Label-Extraktion priorisiert aria-label/title vor textContent.
   ═══════════════════════════════════════════════════════════════ */
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

  // Icon je Modul-Präfix für «Zuletzt verwendet»
  var PREFIX_ICONS = {
    sb: '🧮', sa: '🚰', hz: '🔥', lt: '💨', br: '🧯', el: '⚡',
    pm: '📋', hy: '💧', if: '🔧', sd: '📷', sv: '🛠', sp: '🏠',
    ab: '🎓', sys: '⚙️', index: '🏠'
  };

  function currentPageKey() {
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }

  function init() {
    navRight = document.querySelector('.g-nav-right') || document.querySelector('.g-nav-actions');
    // Fallback: erster div mit nav-buttons im g-nav-inner / g-nav
    if (!navRight) {
      var navInner = document.querySelector('.g-nav-inner') || document.querySelector('.g-nav');
      if (navInner) {
        var divs = navInner.querySelectorAll('div');
        for (var d = 0; d < divs.length; d++) {
          var hasBtn = divs[d].querySelector('.g-nav-btn, .gema-feedback-btn');
          if (hasBtn && divs[d].children.length >= 1) {
            navRight = divs[d];
            break;
          }
        }
      }
    }
    if (!navRight) return;

    // Sammle Original-Nav-Items (sichtbare Buttons + Links).
    // Die Notify-Glocke wird NICHT gespiegelt — sie bleibt auf Mobile
    // als eigenes Nav-Element sichtbar (relocateBell).
    var children = navRight.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (el.tagName !== 'BUTTON' && el.tagName !== 'A') continue;
      if (el.classList.contains('gn-btn')) continue;
      // Hidden via inline style: aufnehmen mit isHidden-Flag (kann sich
      // dynamisch ändern, z.B. via auth-Permissions)
      var isHidden = el.style.display === 'none';
      originalItems.push({
        element: el,
        isAdmin: el.classList.contains('gema-admin-only') || el.id === 'navOrgAdmin' || el.id === 'navBtnUsers',
        isFeedback: el.classList.contains('gema-feedback-btn'),
        isLogout: /abmelden|logout/i.test((el.textContent || '') + ' ' + (el.title || '') + ' ' + (el.getAttribute('aria-label') || '')) ||
                  /logout/i.test(el.getAttribute('onclick') || ''),
        isSettings: /einstellung|profil|settings/i.test((el.title || '') + ' ' + (el.getAttribute('aria-label') || '')) ||
                    /sys_profil|sys_settings/i.test(el.getAttribute('href') || ''),
        isHidden: isHidden
      });
    }

    navContainer = navRight.parentNode;

    createHamburger();
    createPanel();
    handleResize();
    window.addEventListener('resize', handleResize);
    watchBellInjection();
  }

  function createHamburger() {
    hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'gema-hamburger no-print';
    hamburgerBtn.setAttribute('aria-label', 'Menü öffnen');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    // Drei Linien, animieren beim Öffnen zu X
    hamburgerBtn.innerHTML =
      '<span class="gema-hamburger-bars" aria-hidden="true">' +
        '<span></span><span></span><span></span>' +
      '</span>';
    hamburgerBtn.addEventListener('click', toggleMenu);
    navContainer.appendChild(hamburgerBtn);
  }

  // ─────────────────────────────────────────────────────────────
  // Notify-Glocke: auf Mobile neben den Hamburger, auf Desktop
  // zurück in die Nav-Right (vor den Feedback-Button, wie
  // gema_notify_ui.js sie einsetzt). Badge/Panel bleiben unberührt.
  // ─────────────────────────────────────────────────────────────
  function relocateBell(isMobile) {
    var bell = document.querySelector('.gn-btn');
    if (!bell || !hamburgerBtn) return;
    if (isMobile) {
      if (bell.parentNode !== navContainer) {
        bell.classList.add('gn-btn--nav');
        navContainer.insertBefore(bell, hamburgerBtn);
      }
    } else {
      if (bell.parentNode === navContainer && navRight) {
        bell.classList.remove('gn-btn--nav');
        var fb = navRight.querySelector('#feedbackBtn') || navRight.querySelector('.gema-feedback-btn');
        if (fb) navRight.insertBefore(bell, fb);
        else navRight.appendChild(bell);
      }
    }
  }

  // gema_notify_ui.js injiziert die Glocke u.U. NACH dem Menü-Init
  // (retry-Pfad) — childList-Observer holt sie dann auf Mobile nach.
  function watchBellInjection() {
    if (typeof MutationObserver === 'undefined' || !navRight) return;
    var obs = new MutationObserver(function() {
      if (window.innerWidth <= BREAKPOINT) relocateBell(true);
    });
    obs.observe(navRight, { childList: true });
  }

  function createPanel() {
    overlay = document.createElement('div');
    overlay.className = 'gema-menu-overlay';
    overlay.addEventListener('click', closeMenu);

    panel = document.createElement('div');
    panel.className = 'gema-menu-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Hauptmenü');

    // ─── Header mit tappbarem User-Block (→ Profil, iOS-Pattern) ───
    var header = document.createElement('div');
    header.className = 'gema-menu-header';
    header.appendChild(buildUserBlock());

    var closeBtn = document.createElement('button');
    closeBtn.className = 'gema-menu-close';
    closeBtn.setAttribute('aria-label', 'Menü schliessen');
    closeBtn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
        '<line x1="5" y1="5" x2="15" y2="15"/>' +
        '<line x1="15" y1="5" x2="5" y2="15"/>' +
      '</svg>';
    closeBtn.addEventListener('click', closeMenu);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // ─── Items in Sektionen einordnen ───
    var actionItems = [];
    var adminItems = [];
    var accountItems = [];
    for (var i = 0; i < originalItems.length; i++) {
      var item = originalItems[i];
      var bucket = item.isAdmin ? adminItems
                : (item.isLogout || item.isFeedback || item.isSettings) ? accountItems
                : actionItems;
      bucket.push(item);
    }

    var content = document.createElement('div');
    content.className = 'gema-menu-content';

    // 1) Navigation (app-weite Ziele)
    var navSec = buildNavigationSection();
    if (navSec) content.appendChild(navSec);

    // 2) Zuletzt verwendet (GemaRecent)
    var recentSec = buildRecentSection();
    if (recentSec) content.appendChild(recentSec);

    // 3) Seiten-Aktionen (PDF, Drucken, …)
    if (actionItems.length) content.appendChild(buildSection('Aktionen', actionItems));

    // 4) Verwaltung (admin-only)
    if (adminItems.length) content.appendChild(buildSection('Verwaltung', adminItems));

    // 5) Konto: existierende Items + Standard-Fallbacks (Einstellungen,
    //    Logout), falls die Seite sie nicht in der Nav hat
    var accountSec = buildSection('Konto', accountItems);
    ensureStandardAccountItems(accountSec, accountItems);
    content.appendChild(accountSec);

    panel.appendChild(content);

    // ─── Footer: App-Installation (falls möglich) sonst Version ───
    panel.appendChild(buildFooter());

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    setupMutationObservers();
    setupSwipeToClose();
  }

  // ─────────────────────────────────────────────────────────────
  // User-Block: Avatar + Name + Rolle + Org — tappbar → Profil
  // ─────────────────────────────────────────────────────────────
  function buildUserBlock() {
    var block = document.createElement('button');
    block.className = 'gema-menu-user';
    block.setAttribute('aria-label', 'Profil & Einstellungen öffnen');
    var u = null;
    try { if (typeof GemaAuth !== 'undefined') u = GemaAuth.getCurrentUser(); } catch (e) {}
    if (!u) {
      block.innerHTML = '<div class="gema-menu-title">Menü</div>';
      return block;
    }
    var name = u.name || u.username || 'Benutzer';
    var rolle = '';
    try {
      var roles = (GemaAuth.getRoles && GemaAuth.getRoles()) || [];
      var primary = (u.roleIds || [])[0] || '';
      var rdef = roles.find(function(r) { return r.id === primary; });
      rolle = rdef ? rdef.name : primary.replace('role_', '').replace(/_/g, ' ');
    } catch (e) {}
    var orgName = '';
    try {
      var orgs = (GemaAuth.getOrgs && GemaAuth.getOrgs()) || [];
      var org = orgs.find(function(o) { return o.id === u.orgId; });
      if (org) orgName = org.name || '';
    } catch (e) {}
    var meta = [rolle, orgName].filter(Boolean).join(' · ');
    // Avatar: Bild aus user.avatar / user.profile.avatar, sonst
    // Initialen. Inline gerechnet, damit das Mobile-Menu auf Seiten
    // ohne gema_avatar.js ebenfalls Bilder anzeigt.
    var avatarSrc = u.avatar || (u.profile && u.profile.avatar) || '';
    var avatarHtml;
    if (avatarSrc) {
      avatarHtml = '<div class="gema-menu-avatar" style="overflow:hidden;padding:0;background:#e2e7f0"><img src="' + escapeHtml(avatarSrc) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>';
    } else {
      var initials = (name.match(/\b[A-Z]/g) || [name.charAt(0).toUpperCase()]).slice(0, 2).join('');
      avatarHtml = '<div class="gema-menu-avatar">' + escapeHtml(initials) + '</div>';
    }
    block.innerHTML =
      avatarHtml +
      '<div class="gema-menu-user-info">' +
        '<div class="gema-menu-user-name">' + escapeHtml(name) + '</div>' +
        (meta ? '<div class="gema-menu-user-meta">' + escapeHtml(meta) + '</div>' : '') +
      '</div>' +
      chevronHtml();
    block.addEventListener('click', function() {
      closeMenu();
      window.location.href = 'sys_profil.html';
    });
    return block;
  }

  // ─────────────────────────────────────────────────────────────
  // Navigation: Startseite + Projekte & Objekte (permission-guarded)
  // ─────────────────────────────────────────────────────────────
  function buildNavigationSection() {
    var page = currentPageKey();
    var items = [];
    if (page !== 'index.html') {
      items.push({ icon: '🏠', label: 'Startseite', href: 'index.html' });
    }
    if (page !== 'pm_objekte.html' && canRead('objekte')) {
      items.push({ icon: '📋', label: 'Projekte & Objekte', href: 'pm_objekte.html' });
    }
    if (!items.length) return null;
    var sec = sectionShell('Navigation');
    var list = sec.querySelector('.gema-menu-list');
    items.forEach(function(it) { list.appendChild(buildLinkItem(it)); });
    return sec;
  }

  function canRead(mkey) {
    try {
      if (typeof GemaAuth !== 'undefined' && GemaAuth.can) return !!GemaAuth.can('read', mkey);
    } catch (e) {}
    return true; // ohne Auth-Kontext nicht verstecken
  }

  // ─────────────────────────────────────────────────────────────
  // Zuletzt verwendet — aus gema_recent.js (window.GemaRecent)
  // ─────────────────────────────────────────────────────────────
  function buildRecentSection() {
    var R = window.GemaRecent;
    if (!R || !R.list) return null;
    var current = currentPageKey().replace('.html', '');
    var items = [];
    try {
      items = (R.list() || []).filter(function(x) { return x.key !== current; }).slice(0, 4);
    } catch (e) { return null; }
    if (!items.length) return null;
    var sec = sectionShell('Zuletzt verwendet');
    var list = sec.querySelector('.gema-menu-list');
    items.forEach(function(item) {
      var prefix = item.key === 'index' ? 'index' : item.key.split('_')[0];
      list.appendChild(buildLinkItem({
        icon: PREFIX_ICONS[prefix] || '🕘',
        label: (R.label ? R.label(item.key) : item.key),
        href: item.key + '.html'
      }));
    });
    return sec;
  }

  function sectionShell(title) {
    var sec = document.createElement('div');
    sec.className = 'gema-menu-section';
    sec.dataset.sectionTitle = title;
    var head = document.createElement('div');
    head.className = 'gema-menu-section-title';
    head.textContent = title;
    sec.appendChild(head);
    var list = document.createElement('div');
    list.className = 'gema-menu-list';
    sec.appendChild(list);
    return sec;
  }

  function chevronHtml() {
    return '<span class="gema-menu-chevron" aria-hidden="true">' +
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="5,3 9,7 5,11"/></svg>' +
    '</span>';
  }

  // Navigations-Item (eigenes Ziel, mit Chevron)
  function buildLinkItem(it) {
    var btn = document.createElement('button');
    btn.className = 'gema-menu-item';
    btn.innerHTML =
      '<span class="gema-menu-icon">' + it.icon + '</span>' +
      '<span class="gema-menu-label">' + escapeHtml(it.label) + '</span>' +
      chevronHtml();
    btn.addEventListener('click', function() {
      closeMenu();
      window.location.href = it.href;
    });
    return btn;
  }

  function buildSection(title, items) {
    var sec = sectionShell(title);
    var list = sec.querySelector('.gema-menu-list');
    items.forEach(function(item) { list.appendChild(buildMenuItem(item)); });
    return sec;
  }

  function buildMenuItem(item) {
    var btn = document.createElement('button');
    btn.className = 'gema-menu-item';
    if (item.isAdmin) btn.classList.add('gema-menu-item--admin');
    if (item.isFeedback) btn.classList.add('gema-menu-item--feedback');
    if (item.isLogout) btn.classList.add('gema-menu-item--logout');
    if (item.isHidden) btn.style.display = 'none';
    if (item.element.id) btn.setAttribute('data-mirror-id', item.element.id);

    var icon = pickIcon(item);
    var label = pickLabel(item);
    // iOS-Semantik: Chevron nur bei Navigation (Links), nicht bei
    // Aktions-Buttons (PDF, Drucken, Feedback, Abmelden …)
    var isNavLink = item.element.tagName === 'A' && !!item.element.getAttribute('href') && !item.isLogout;

    btn.innerHTML =
      '<span class="gema-menu-icon">' + icon + '</span>' +
      '<span class="gema-menu-label">' + escapeHtml(label) + '</span>' +
      (isNavLink ? chevronHtml() : '');

    var origEl = item.element;
    btn.addEventListener('click', function() {
      closeMenu();
      // Original-Element triggern
      if (origEl.tagName === 'A' && origEl.href) {
        window.location.href = origEl.href;
      } else if (origEl.onclick) {
        origEl.onclick.call(origEl);
      } else {
        origEl.click();
      }
    });
    return btn;
  }

  // Stellt sicher, dass „Einstellungen" und „Abmelden" immer im
  // Konto-Block stehen, auch wenn die aktuelle Seite sie nicht in der
  // Nav hat. Greift z. B. bei if_werkzeug.html, wo nur Feedback in der
  // Nav-Right liegt.
  function ensureStandardAccountItems(section, existingItems) {
    var list = section.querySelector('.gema-menu-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'gema-menu-list';
      section.appendChild(list);
    }
    var hasSettings = existingItems.some(function(it) { return it.isSettings; });
    var hasLogout = existingItems.some(function(it) { return it.isLogout; });

    if (!hasSettings) {
      var settingsBtn = buildLinkItem({ icon: '⚙️', label: 'Einstellungen', href: 'sys_profil.html' });
      list.insertBefore(settingsBtn, list.firstChild);
    }
    if (!hasLogout) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'gema-menu-item gema-menu-item--logout';
      logoutBtn.innerHTML =
        '<span class="gema-menu-icon">🚪</span>' +
        '<span class="gema-menu-label">Abmelden</span>';
      logoutBtn.addEventListener('click', function() {
        closeMenu();
        try { if (typeof GemaAuth !== 'undefined' && GemaAuth.logout) { GemaAuth.logout(); return; } } catch (e) {}
        window.location.href = 'sys_login.html';
      });
      list.appendChild(logoutBtn);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Footer: PWA-Install-Hinweis (wenn Helper geladen + möglich),
  // sonst dezente Versions-Zeile.
  // ─────────────────────────────────────────────────────────────
  function buildFooter() {
    var footer = document.createElement('div');
    footer.className = 'gema-menu-footer';
    var status = '';
    try { if (window.GemaPWA && GemaPWA.getStatus) status = GemaPWA.getStatus(); } catch (e) {}
    if (status === 'ready') {
      var btn = document.createElement('button');
      btn.className = 'gema-menu-install';
      btn.innerHTML = '📱 Als App installieren';
      btn.addEventListener('click', function() {
        try { GemaPWA.install(); } catch (e) {}
        closeMenu();
      });
      footer.appendChild(btn);
    } else if (status === 'manual_ios') {
      var hint = document.createElement('button');
      hint.className = 'gema-menu-install';
      hint.innerHTML = '📱 Als App installieren';
      hint.addEventListener('click', function() {
        closeMenu();
        window.location.href = 'sys_profil.html';
      });
      footer.appendChild(hint);
    } else {
      footer.innerHTML = '<span>GEMA Beta</span>';
    }
    return footer;
  }

  // ─────────────────────────────────────────────────────────────
  // Label/Icon-Extraktion — robust mit klarer Priorität
  // ─────────────────────────────────────────────────────────────
  var EMOJI_RE = /([\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F300}-\u{1F9FF}]|[\u{2702}-\u{27B0}]|🔴|📄|🖨|⚙️|👥|🏢|🔒|🚪)/u;

  function pickLabel(item) {
    var el = item.element;
    // Priorität: data-label > aria-label > title > textContent (clean)
    var dataLabel = el.getAttribute('data-label');
    if (dataLabel) return dataLabel.trim();
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    var title = el.title;
    if (title && title.trim()) return title.trim();
    // textContent: Emoji entfernen, dann trimmen
    var text = (el.textContent || '').trim().replace(EMOJI_RE, '').trim();
    if (text) return text;
    // Last resort: aus class oder href ableiten
    if (el.classList.contains('gema-feedback-btn')) return 'Feedback';
    var href = el.getAttribute('href') || '';
    if (/profil/i.test(href)) return 'Einstellungen';
    if (/admin/i.test(href)) return 'Benutzerverwaltung';
    if (/unternehmen/i.test(href)) return 'Unternehmen';
    return 'Menü-Item';
  }

  function pickIcon(item) {
    var el = item.element;
    // Erste Quelle: Emoji im textContent
    var text = (el.textContent || '').trim();
    var m = text.match(EMOJI_RE);
    if (m) return m[0];
    // Klassen-/ID-/Href-Heuristik
    if (item.isFeedback) return '🔴';
    if (item.isLogout) return '🚪';
    if (item.isSettings) return '⚙️';
    var idLow = (el.id || '').toLowerCase();
    if (idLow.indexOf('orgadmin') >= 0) return '🏢';
    if (idLow.indexOf('users') >= 0) return '👥';
    var href = (el.getAttribute('href') || '').toLowerCase();
    if (/unternehmen/i.test(href)) return '🏢';
    if (/admin/i.test(href)) return '👥';
    if (/profil/i.test(href)) return '⚙️';
    var title = (el.title || '').toLowerCase();
    if (title.indexOf('admin') >= 0 || title.indexOf('benutzer') >= 0) return '👥';
    if (title.indexOf('einstellung') >= 0) return '⚙️';
    if (title.indexOf('unternehmen') >= 0) return '🏢';
    return '•';
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ─────────────────────────────────────────────────────────────
  // MutationObserver: Sichtbarkeit der Mirror-Items aktuell halten,
  // wenn Auth oder andere Module das Original ein-/ausblenden.
  // Beobachtet sowohl style als auch class.
  // ─────────────────────────────────────────────────────────────
  function setupMutationObservers() {
    if (typeof MutationObserver === 'undefined') return;
    originalItems.forEach(function(item) {
      if (!item.element.id) return;
      var obs = new MutationObserver(function() {
        var mirror = panel.querySelector('[data-mirror-id="' + item.element.id + '"]');
        if (!mirror) return;
        var hidden = item.element.style.display === 'none' ||
                     window.getComputedStyle(item.element).display === 'none';
        mirror.style.display = hidden ? 'none' : '';
      });
      obs.observe(item.element, { attributes: true, attributeFilter: ['style', 'class'] });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Swipe-to-close (iOS-Geste): Panel nach rechts ziehen schliesst.
  // Greift erst ab deutlich horizontaler Bewegung (kein Konflikt mit
  // vertikalem Scrollen im Panel); passive Listener.
  // ─────────────────────────────────────────────────────────────
  function setupSwipeToClose() {
    var startX = null, startY = null, dx = 0, dragging = false;
    panel.addEventListener('touchstart', function(e) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0; dragging = false;
    }, { passive: true });
    panel.addEventListener('touchmove', function(e) {
      if (startX == null) return;
      dx = e.touches[0].clientX - startX;
      var dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (dx > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) dragging = true;
        else if (Math.abs(dy) > 12) { startX = null; return; } // vertikal scrollen
      }
      if (dragging && dx > 0) {
        panel.style.transition = 'none';
        panel.style.transform = 'translateX(' + dx + 'px)';
      }
    }, { passive: true });
    panel.addEventListener('touchend', function() {
      if (startX == null) return;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dragging && dx > 70) closeMenu();
      startX = null; dragging = false;
    });
  }

  function toggleMenu() { if (menuOpen) closeMenu(); else openMenu(); }

  function openMenu() {
    menuOpen = true;
    overlay.classList.add('open');
    panel.classList.add('open');
    hamburgerBtn.classList.add('active');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    // Body-Scroll-Lock: GemaScroll (iOS-tauglich) bevorzugen
    try {
      if (window.GemaScroll && GemaScroll.lock) GemaScroll.lock();
      else document.body.style.overflow = 'hidden';
    } catch (e) { document.body.style.overflow = 'hidden'; }
  }

  function closeMenu() {
    menuOpen = false;
    overlay.classList.remove('open');
    panel.classList.remove('open');
    hamburgerBtn.classList.remove('active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    try {
      if (window.GemaScroll && GemaScroll.unlock) GemaScroll.unlock();
      else document.body.style.overflow = '';
    } catch (e) { document.body.style.overflow = ''; }
  }

  function handleResize() {
    var isMobile = window.innerWidth <= BREAKPOINT;
    if (hamburgerBtn) hamburgerBtn.style.display = isMobile ? 'flex' : 'none';
    if (navRight) navRight.style.display = isMobile ? 'none' : '';
    relocateBell(isMobile);
    if (!isMobile && menuOpen) closeMenu();
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && menuOpen) closeMenu();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
