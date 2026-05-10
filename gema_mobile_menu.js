/* ═══════════════════════════════════════════════════════════════
   GEMA Mobile Menu — Hamburger → Slide-In Panel
   Konvertiert .g-nav-right zu einem strukturierten Mobile-Menü.

   Struktur des geöffneten Menüs:
   ┌──────────────────────────────────┐
   │ [Avatar] Name                    │
   │          Rolle · Werkstatt       │
   ├──────────────────────────────────┤
   │ AKTIONEN                         │
   │   [icon] Page-spezifischer Btn 1 │
   │   [icon] Page-spezifischer Btn 2 │
   ├──────────────────────────────────┤
   │ VERWALTUNG (admin-only)          │
   │   [icon] Unternehmen             │
   │   [icon] Benutzer                │
   ├──────────────────────────────────┤
   │ KONTO                            │
   │   [icon] Profil / Einstellungen  │
   │   [icon] Feedback                │
   │   [icon] Abmelden                │
   └──────────────────────────────────┘

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

    // Sammle Original-Nav-Items (sichtbare Buttons + Links)
    var children = navRight.children;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (el.tagName !== 'BUTTON' && el.tagName !== 'A') continue;
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

  function createPanel() {
    overlay = document.createElement('div');
    overlay.className = 'gema-menu-overlay';
    overlay.addEventListener('click', closeMenu);

    panel = document.createElement('div');
    panel.className = 'gema-menu-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Hauptmenü');

    // ─── Header mit User-Block (statt nur "Menü"-Title) ───
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
      // Skip Items, die a priori versteckt sind. MutationObserver kann
      // sie später aktivieren.
      var bucket = item.isAdmin ? adminItems
                : (item.isLogout || item.isFeedback || item.isSettings) ? accountItems
                : actionItems;
      bucket.push(item);
    }

    var content = document.createElement('div');
    content.className = 'gema-menu-content';

    if (actionItems.length) content.appendChild(buildSection('Aktionen', actionItems));
    if (adminItems.length) content.appendChild(buildSection('Verwaltung', adminItems));

    // Account-Sektion: existierende Items + Standard-Fallbacks (Profil,
    // Logout) hinzufügen, falls nicht schon vorhanden
    var accountSec = buildSection('Konto', accountItems);
    ensureStandardAccountItems(accountSec, accountItems);
    content.appendChild(accountSec);

    panel.appendChild(content);

    // ─── Footer ───
    var footer = document.createElement('div');
    footer.className = 'gema-menu-footer';
    footer.innerHTML = '<span>GEMA Beta</span>';
    panel.appendChild(footer);

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    setupMutationObservers();
  }

  // ─────────────────────────────────────────────────────────────
  // User-Block: Avatar + Name + Rolle + Werkstatt/Org
  // ─────────────────────────────────────────────────────────────
  function buildUserBlock() {
    var block = document.createElement('div');
    block.className = 'gema-menu-user';
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
      '</div>';
    return block;
  }

  function buildSection(title, items) {
    var sec = document.createElement('div');
    sec.className = 'gema-menu-section';
    sec.dataset.sectionTitle = title;
    var head = document.createElement('div');
    head.className = 'gema-menu-section-title';
    head.textContent = title;
    sec.appendChild(head);
    var list = document.createElement('div');
    list.className = 'gema-menu-list';
    items.forEach(function(item) { list.appendChild(buildMenuItem(item)); });
    sec.appendChild(list);
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

    btn.innerHTML =
      '<span class="gema-menu-icon">' + icon + '</span>' +
      '<span class="gema-menu-label">' + escapeHtml(label) + '</span>' +
      '<span class="gema-menu-chevron" aria-hidden="true">' +
        '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="5,3 9,7 5,11"/></svg>' +
      '</span>';

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

  // Stellt sicher, dass „Profil/Einstellungen" und „Abmelden" immer im
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
      var settingsBtn = document.createElement('button');
      settingsBtn.className = 'gema-menu-item';
      settingsBtn.innerHTML =
        '<span class="gema-menu-icon">⚙️</span>' +
        '<span class="gema-menu-label">Einstellungen</span>' +
        '<span class="gema-menu-chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="5,3 9,7 5,11"/></svg></span>';
      settingsBtn.addEventListener('click', function() {
        closeMenu();
        window.location.href = 'sys_profil.html';
      });
      list.appendChild(settingsBtn);
    }
    if (!hasLogout) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'gema-menu-item gema-menu-item--logout';
      logoutBtn.innerHTML =
        '<span class="gema-menu-icon">🚪</span>' +
        '<span class="gema-menu-label">Abmelden</span>' +
        '<span class="gema-menu-chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="5,3 9,7 5,11"/></svg></span>';
      logoutBtn.addEventListener('click', function() {
        closeMenu();
        try { if (typeof GemaAuth !== 'undefined' && GemaAuth.logout) { GemaAuth.logout(); return; } } catch (e) {}
        window.location.href = 'sys_login.html';
      });
      list.appendChild(logoutBtn);
    }
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

  function toggleMenu() { if (menuOpen) closeMenu(); else openMenu(); }

  function openMenu() {
    menuOpen = true;
    overlay.classList.add('open');
    panel.classList.add('open');
    hamburgerBtn.classList.add('active');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    menuOpen = false;
    overlay.classList.remove('open');
    panel.classList.remove('open');
    hamburgerBtn.classList.remove('active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function handleResize() {
    var isMobile = window.innerWidth <= BREAKPOINT;
    if (hamburgerBtn) hamburgerBtn.style.display = isMobile ? 'flex' : 'none';
    if (navRight) navRight.style.display = isMobile ? 'none' : '';
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
