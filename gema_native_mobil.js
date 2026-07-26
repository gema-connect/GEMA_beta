/* ============================================================
   GEMA Native Mobil — Mount-Helper für die iPhone-Ansicht
   Bindet einen GEMA-Native-Screen (gema-native.css/js) als
   Vollbild-Overlay in eine bestehende Modulseite ein:
   - NUR auf Phones aktiv (≤740px), Desktop/Tablet unverändert
   - Ein-/Ausschalten über die User-Einstellung (sys_profil →
     user.profile.nativeAnsicht, Standard AN) — KEIN In-Modul-
     Umschalter mehr (früher [data-gn-classic] + 📱-Pill)
   - Re-Render erhält die Scroll-Position der .gn-screen
   Reines UI-Overlay: die Modul-Logik (Modals, Storage, Sync)
   läuft unverändert darunter weiter — Modals (z-index ≥10500)
   erscheinen ÜBER dem Native-Screen.
   ============================================================ */
(function () {
  "use strict";
  var KEY = 'gema_native_view_v1';
  var MQ = '(max-width: 740px)';

  function phone() { try { return window.matchMedia(MQ).matches; } catch (e) { return false; } }
  function pref() {
    try {
      var q = new URLSearchParams(location.search).get('native');   // Debug/Test-Override
      if (q === '0') return 'klassisch';
      if (q === '1') return 'native';
    } catch (e) {}
    // Primär die User-Einstellung (sys_profil → user.profile.nativeAnsicht), Standard AN.
    try {
      var u = (typeof GemaAuth !== 'undefined' && GemaAuth.getCurrentUser) ? GemaAuth.getCurrentUser() : null;
      if (u && u.profile && typeof u.profile.nativeAnsicht === 'boolean') return u.profile.nativeAnsicht ? 'native' : 'klassisch';
    } catch (e) {}
    // Fallback: lokaler Cache (Profil noch nicht geladen), sonst Standard aktiv.
    try { return localStorage.getItem(KEY) || 'native'; } catch (e) { return 'native'; }
  }
  function setPref(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function enabled() { return phone() && pref() !== 'klassisch'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]; }); }

  var cssDone = false;
  function ensureCss() {
    if (cssDone) return; cssDone = true;
    var st = document.createElement('style');
    st.id = '_gnMobilCss';
    st.textContent =
      '.gn--page{position:fixed;inset:0;z-index:900;height:auto;overflow-x:hidden;max-width:100vw}' +
      /* Seitliches Scrollen gibt es im Native-Screen nirgends: die einzige
         horizontale Fläche ist die Chip-Leiste, die scrollt in sich selbst.
         Läuft doch einmal ein Inhalt über, wird er geklippt statt den ganzen
         Screen verschiebbar zu machen (Feedback 26.07.2026). */
      '.gn [data-gn-scroll]{overflow-x:hidden}' +
      '.gn .gn-sheet{max-width:100vw;overflow-x:hidden}' +
      '.gn .gn-sheet-form,.gn .gn-sheet-body{overflow-x:hidden}' +
      'html.gn-native-on,html.gn-native-on body{overflow:hidden;overscroll-behavior:none}' +
      /* GEMA-Nav + Safe-Area-Streifen unter dem Native-Screen ausblenden */
      'html.gn-native-on .g-nav{display:none!important}' +
      /* Sicherheitsnetz: klassische Modul-Modals (.modal-bg) liegen teils bei
         z-index 900 = gleich wie .gn--page → im Native-Modus über den Screen
         heben, damit selten genutzte Sub-Dialoge (Auftrag-Suche, Einstellungen)
         trotzdem bedienbar sind. Die Haupt-Formulare laufen über native Sheets. */
      'html.gn-native-on .modal-bg{z-index:10600!important}' +
      /* if_fahrzeug nutzt .modal-overlay (z-index 500 — läge UNTER dem Screen) */
      'html.gn-native-on .modal-overlay{z-index:10600!important}' +
      /* Native Bottom-Sheet (Formular-Layer) — z-index über dem Screen-Inhalt.
         .gn-sheet aus dem Kit hat height:80%; hier passt es sich dem Inhalt an. */
      '.gn .gn-sheet.gn-sheet--form{height:auto;max-height:92%}' +
      '.gn .gn-sheet-form{flex:1;overflow-y:auto;padding:2px 0 10px;scrollbar-width:none}' +
      '.gn .gn-sheet-form::-webkit-scrollbar{display:none}' +
      '.gn .gn-sheet-cta{flex-shrink:0;padding:10px 16px calc(var(--gn-safe-bottom) + 14px);border-top:1px solid var(--gn-hair);display:flex;gap:9px}' +
      /* KRITISCH: .gn-btn ist width:100% — in einer Flex-Zeile MUSS das
         zurückgesetzt werden, sonst beansprucht schon «Abbrechen» die volle
         Breite und schiebt «Speichern» aus dem Bild (Feedback 26.07.2026).
         Speichern wächst, Abbrechen/🗑 bleiben inhaltsbreit und dürfen
         schrumpfen — nichts verlässt den Bildschirm. */
      '.gn .gn-sheet-cta .gn-btn{flex:1 1 0;width:auto;min-width:0;padding-left:12px;padding-right:12px;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.gn .gn-sheet-cta [data-gn-cancel]{flex:0 1 auto}' +
      '.gn .gn-sheet-cta [data-gn-del]{flex:0 0 auto}' +
      '.gn .gn-btn-ghost{background:var(--gn-fill);color:var(--gn-ink);box-shadow:none}' +
      '.gn .gn-btn-danger{background:var(--gn-danger);box-shadow:0 6px 16px -4px rgba(220,38,38,.5)}' +
      '.gn .gn-seg-chips{display:flex;gap:7px;flex-wrap:wrap;padding:0 16px 14px}' +
      '.gn .gn-chip-sel{flex:none;padding:9px 14px;border-radius:11px;border:1.5px solid var(--gn-hair);background:var(--gn-card);' +
      'font:600 13.5px var(--gn-font);color:var(--gn-ink-2);cursor:pointer}' +
      '.gn .gn-chip-sel.is-active{border-color:var(--gn-accent);background:#eff4ff;color:var(--gn-accent)}' +
      '.gn .gn-native-select{width:100%;background:var(--gn-card);border:1px solid var(--gn-hair);border-radius:12px;padding:12px 14px;' +
      'font:400 16px var(--gn-font);color:var(--gn-ink);outline:none;box-shadow:var(--gn-shadow-card);-webkit-appearance:none;appearance:none;' +
      'background-image:url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\'><path d=\'M1 1.5 6 6.5 11 1.5\'/></svg>");background-repeat:no-repeat;background-position:right 14px center}' +
      '.gn .gn-timepair{display:flex;gap:9px}' +
      /* ── Chat als VOLLBILD-Overlay im Native-Modus ──
         Das Panel beginnt normal bei top:72px (Platz für die .g-nav) — die ist
         hier ausgeblendet, dort schaut also der Screen durch. Auf dem Home-
         Screen liegt genau da der Avatar: ein Tap neben/nach dem Schliessen
         landete in sys_profil («ich lande in den Einstellungen»). Vollbild +
         eigener Safe-Area-Abstand; Schliessen bringt einen an dieselbe Stelle
         zurück, weil nichts navigiert wird. */
      'html.gn-native-on .gc-panel{top:0!important;left:0;right:0;width:100vw!important;max-width:none;' +
      'border-left:none!important;z-index:10800!important;padding-top:env(safe-area-inset-top,0px)}' +
      /* ── Bottom-Navbar: auf JEDEM nativen Screen (zentral injiziert) ──
         Aussehen kommt aus dem Kit (.gn-pill); hier nur die Lage über allen
         Screen-Inhalten und der Freiraum, damit nichts darunter endet. */
      '.gn .gn-navbar{z-index:24}' +
      '.gn .gn-pill-btn--plus{background:var(--gn-accent);box-shadow:0 4px 12px -2px rgba(37,99,235,.7)}' +
      '.gn .gn-pill-btn--plus + .gn-pill-btn--primary{background:rgba(255,255,255,.16);box-shadow:none}' +
      '.gn [data-gn-scroll]{padding-bottom:calc(var(--gn-safe-bottom) + 96px)}' +
      /* ── Firmenlogo oben links (Home-Header + Modul-Toolbar) ── */
      '.gn .gn-orglogo{height:26px;max-width:132px;width:auto;object-fit:contain;object-position:left center;display:block;flex:none}' +
      /* Höhe = der ersetzte Gruss-/Namensblock (13px + 23px + Zeilenhöhen) */
      '.gn .gn-header .gn-orglogo{height:46px;max-width:calc(100vw - 108px);margin:0}' +
      /* ── Zurück-Taste (Toolbar + Kompakt-Leiste, zentral injiziert) ── */
      '.gn .gn-back{flex:none}' +
      '.gn .gn-back svg{stroke:var(--gn-accent)}' +
      '.gn .gn-back-c{position:absolute;left:6px;bottom:2px;width:38px;height:38px;border:none;background:transparent;' +
      'display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.gn .gn-back-c svg{width:21px;height:21px;stroke:var(--gn-accent);fill:none}' +
      '.gn .gn-back-c:active,.gn .gn-back:active{transform:scale(.92)}' +
      /* ── Natives Autocomplete (Vorschlags-Liste im Formularfluss) ── */
      '.gn .gn-ac{display:none;margin-top:6px;background:var(--gn-card);border:1px solid var(--gn-hair);border-radius:12px;' +
      'box-shadow:var(--gn-shadow-card);overflow:hidden;max-height:226px;overflow-y:auto;scrollbar-width:none}' +
      '.gn .gn-ac::-webkit-scrollbar{display:none}' +
      '.gn .gn-ac.is-open{display:block}' +
      '.gn .gn-ac-it{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;' +
      'border:none;background:none;font:500 15px var(--gn-font);color:var(--gn-ink);text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.gn .gn-ac-it + .gn-ac-it{border-top:1px solid var(--gn-hair)}' +
      '.gn .gn-ac-it:active{background:var(--gn-fill)}' +
      '.gn .gn-ac-l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.gn .gn-ac-h{flex:none;font-size:12px;color:var(--gn-ink-2);max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      /* ── Horizontale Chip-Leiste (Kategorie-/Typ-Filter der Listen-Screens) ── */
      '.gn .gn-chipbar{display:flex;gap:7px;overflow-x:auto;padding:0 16px 12px;scrollbar-width:none;-webkit-overflow-scrolling:touch}' +
      '.gn .gn-chipbar::-webkit-scrollbar{display:none}' +
      '.gn .gn-chipbar .gn-chip-sel{white-space:nowrap}' +
      '.gn .gn-chip-ct{font-size:11px;font-weight:800;opacity:.55;margin-left:3px}' +
      /* Filter-Punkt auf Icon-Buttons (aktiver erweiterter Filter) */
      '.gn .gn-icon-btn{position:relative}' +
      '.gn .gn-icon-btn .gn-dot{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;' +
      'background:var(--gn-accent);color:#fff;font:800 11px/17px var(--gn-font);text-align:center}' +
      '.gn .gn-check{display:flex;align-items:center;gap:11px;margin:0 16px 14px;background:var(--gn-card);border-radius:12px;padding:12px 14px;box-shadow:var(--gn-shadow-card);cursor:pointer}' +
      '.gn .gn-check input{width:24px;height:24px;accent-color:var(--gn-accent);flex:none}' +
      '.gn .gn-check span{font-size:15px;color:var(--gn-ink)}';
    document.head.appendChild(st);
  }

  /* Zurück-Navigation: die Native-Ansicht blendet die .g-nav aus — ohne
     eigene Zurück-Taste gäbe es keinen Weg zur vorherigen Seite. Gleiche
     Origin + Verlauf vorhanden → history.back(), sonst zur Modulübersicht. */
  function goBack() {
    try {
      var ref = document.referrer;
      if (history.length > 1 && ref && new URL(ref).origin === location.origin && ref !== location.href) { history.back(); return; }
    } catch (e) {}
    location.href = 'index.html';
  }
  var SVG_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  function injectBack(root) {
    var tb = root.querySelector('.gn-toolbar');
    if (tb && !tb.querySelector('[data-gn-back]')) {
      var b = document.createElement('button');
      b.className = 'gn-icon-btn gn-back';
      b.setAttribute('data-gn-back', '');
      b.title = 'Zurück';
      b.innerHTML = SVG_BACK;
      tb.insertBefore(b, tb.firstChild);
    }
    var cp = root.querySelector('[data-gn-compact]');
    if (cp && !cp.querySelector('[data-gn-back]')) {
      var c = document.createElement('button');
      c.className = 'gn-back-c';
      c.setAttribute('data-gn-back', '');
      c.title = 'Zurück';
      c.innerHTML = SVG_BACK;
      cp.appendChild(c);
    }
  }

  /* ── Firmenlogo oben links ──────────────────────────────────────────
     Quelle wie überall in GEMA: org.logoVector (SVG, gestochen) vor
     org.logo (JPEG-Raster). Ohne hinterlegtes Logo passiert nichts —
     KEIN Platzhalter, damit der Kopf sauber bleibt. */
  function orgLogoSrc() {
    try {
      if (typeof GemaAuth === 'undefined' || !GemaAuth.getCurrentOrg) return '';
      var o = GemaAuth.getCurrentOrg();
      return (o && (o.logoVector || o.logo)) || '';
    } catch (e) { return ''; }
  }
  function injectLogo(root) {
    var src = orgLogoSrc();
    if (!src) return;
    if (root.querySelector('.gn-orglogo')) return;
    var img = document.createElement('img');
    img.className = 'gn-orglogo';
    img.alt = '';
    img.src = src;
    // NUR der Startbildschirm trägt das Firmenlogo (User-Entscheid
    // 26.07.2026): Auf einem Modul-Screen sass es zwischen Zurück-Taste und
    // Titel und wirkte verloren — dort zählt der Modul-Titel, nicht die Marke.
    var head = root.querySelector('.gn-header');
    if (!head) return;
    // Das Logo ERSETZT Gruss + Name (Feedback 26.07.2026) und ist so hoch wie
    // dieser Textblock war. Ohne hinterlegtes Logo bleibt der Gruss stehen —
    // der Kopf wäre sonst leer.
    var txt = head.querySelector('.gn-hello');
    txt = txt ? txt.parentNode : head.firstElementChild;
    if (txt && txt !== head && txt.parentNode === head) head.replaceChild(img, txt);
    else head.insertBefore(img, head.firstChild);
  }

  /* ── Bottom-Navbar auf JEDEM nativen Screen ─────────────────────────
     Mitteilungen und Chat sitzen sonst in der .g-nav, die die Native-
     Ansicht ausblendet — ohne diese Leiste wären sie auf allen Modul-
     Screens unerreichbar. Die Knöpfe tragen dieselben data-Attribute wie
     die frühere Home-eigene Leiste, damit deren Zähler-Sync weiterläuft. */
  var SVG_GLOCKE = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  var SVG_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.9-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/></svg>';
  var SVG_RASTER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>';
  var SVG_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  function istHome() {
    var p = (location.pathname || '').split('/').pop() || '';
    return p === '' || p === 'index.html';
  }
  function unreadCount() { try { return GemaNotify.getUnreadCount() || 0; } catch (e) { return 0; } }
  /* Der «＋»-Knopf ist die Haupt-Aktion des Screens und gehört auf dem
     Handy an den Daumen — nicht oben rechts in die Toolbar (User-Entscheid
     26.07.2026). Das Modul liefert ihn über mount({plus:{title,items}});
     `items` ist eine Liste {label, hint, fn} und öffnet ein Aktions-Sheet.
     Genau EIN Eintrag → direkt ausführen, ohne Zwischen-Sheet. */
  function injectNavbar(root, plus) {
    // Der Home-Screen bringt seine Leiste selbst mit (.gn-pill) — dort nicht
    // doppelt injizieren.
    if (root.querySelector('.gn-navbar')) return;
    var n = unreadCount();
    var ziel = istHome() ? 'sys_workspace.html' : 'index.html';
    var bar = document.createElement('div');
    // Beide Klassen: .gn-pill trägt das bestehende Aussehen aus dem Kit,
    // .gn-navbar markiert die zentral injizierte Leiste.
    bar.className = 'gn-pill gn-navbar';
    bar.innerHTML =
      '<button class="gn-pill-btn" data-nat-notify title="Mitteilungen">' + SVG_GLOCKE
      + (n ? '<i class="gn-pill-dot">' + (n > 99 ? '99+' : n) + '</i>' : '') + '</button>'
      + '<button class="gn-pill-btn" data-nat-chat title="Chat">' + SVG_CHAT + '</button>'
      + (plus ? '<button class="gn-pill-btn gn-pill-btn--plus" data-nat-nav-plus title="' + esc(plus.title || 'Neu') + '">' + SVG_PLUS + '</button>' : '')
      + '<button class="gn-pill-btn gn-pill-btn--primary" data-nat-nav-home title="' + (istHome() ? 'Workspace' : 'Übersicht') + '">' + SVG_RASTER + '</button>';
    bar.querySelector('[data-nat-nav-home]').addEventListener('click', function () { location.href = ziel; });
    root.appendChild(bar);
  }
  /* Glocke und Chat aus der ausgeblendeten .g-nav bedienbar machen.
     stopPropagation: beide Panels schliessen bei jedem Klick ausserhalb —
     der eigene Auslöser-Klick würde sie sonst sofort wieder zumachen. */
  function wireNavbar(root) {
    if (root.__gnNavWired) return; root.__gnNavWired = true;
    root.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      if (e.target.closest('[data-nat-notify]')) {
        e.stopPropagation();
        var b = document.querySelector('.g-nav .gn-btn'); if (b) b.click();
        return;
      }
      if (e.target.closest('[data-nat-chat]')) {
        e.stopPropagation();
        try { if (typeof GemaChat !== 'undefined') GemaChat.open(); } catch (err) {}
        return;
      }
      if (e.target.closest('[data-nat-nav-plus]')) {
        e.stopPropagation();
        if (root.__gnPlusOpen) root.__gnPlusOpen();
      }
    });
  }
  function navbarBadge(root) {
    var host = root && root.querySelector('[data-nat-notify]');
    if (!host) return;
    var n = unreadCount();
    var b = host.querySelector('.gn-pill-dot');
    if (n) {
      if (!b) { b = document.createElement('i'); b.className = 'gn-pill-dot'; host.appendChild(b); }
      b.textContent = n > 99 ? '99+' : String(n);
    } else if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function mount(opts) {
    ensureCss();
    var root = document.createElement('div');
    root.className = 'gn gn--page';
    root.setAttribute('data-gn-app', '');
    root.style.display = 'none';
    document.body.appendChild(root);
    // Delegiert: die Zurück-Taste überlebt jedes Re-Render (Injektion in apply)
    root.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-gn-back]')) goBack();
    });

    var lastOn = null, pendingRefresh = false;
    function apply(force) {
      var on = enabled();
      if (on) {
        // Offenes Sheet → Re-Render AUFSCHIEBEN: render() ersetzt root.innerHTML
        // und würde das Sheet (samt halb getippter Eingabe) wegwischen — z.B.
        // wenn ein Cloud-Pull/Signatur-Poll mitten im Ausfüllen refresht.
        if (curSheet && lastOn === true) { pendingRefresh = true; return; }
        var sc = root.querySelector('[data-gn-scroll]');
        var st = sc ? sc.scrollTop : 0;
        try { opts.render(root); } catch (e) { console.warn('[GemaNativeMobil] render:', e && e.message); }
        try { injectBack(root); } catch (e) {}
        try { injectLogo(root); } catch (e) {}
        try { injectNavbar(root, opts.plus); wireNavbar(root); } catch (e) {}
        root.__gnInit = false;
        if (window.GemaNative) { try { GemaNative.init(root); } catch (e) {} }
        var sc2 = root.querySelector('[data-gn-scroll]');
        if (sc2 && st) sc2.scrollTop = st;
        root.style.display = '';
        document.documentElement.classList.add('gn-native-on');
      } else {
        root.style.display = 'none';
        document.documentElement.classList.remove('gn-native-on');
      }
      lastOn = on;
    }

    /* «＋» der Bottom-Navbar: Aktions-Sheet aus opts.plus.
       items darf eine Funktion sein (Rechte/Zustand erst beim Tippen prüfen).
       Genau ein Eintrag → direkt ausführen statt ein Sheet mit einer Zeile. */
    function plusItems() {
      var p = opts.plus; if (!p) return [];
      var it = typeof p.items === 'function' ? p.items() : p.items;
      return (it || []).filter(Boolean);
    }
    function openPlus() {
      var items = plusItems();
      if (!items.length) return;
      if (items.length === 1) { try { items[0].fn(); } catch (e) {} return; }
      var html = '<div class="gn-list">' + items.map(function (x, i) {
        return '<button class="gn-select" data-nat-plus-i="' + i + '"><span class="k">' + esc(x.label || '')
          + (x.hint ? '<small style="display:block;font-weight:400;color:var(--gn-ink-3)">' + esc(x.hint) + '</small>' : '')
          + '</span><span class="v">›</span></button>';
      }).join('') + '</div>';
      var sh = sheet({ title: (opts.plus && opts.plus.title) || 'Neu', html: html });
      if (!sh) return;
      sh.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-nat-plus-i]'); if (!b) return;
        var i = parseInt(b.getAttribute('data-nat-plus-i'), 10);
        closeSheet();
        setTimeout(function () { try { if (items[i]) items[i].fn(); } catch (err) {} }, 420);
      });
    }
    root.__gnPlusOpen = openPlus;

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (enabled() !== lastOn) apply(); }, 200);
    });

    /* ── Natives Bottom-Sheet als Formular-Layer ──
       sheet({title, html, saveLabel, onSave, deleteLabel, onDelete}) baut ein
       .gn-sheet in den Screen, öffnet es animiert (.is-open), verdrahtet
       Speichern/Löschen/Abbrechen + Zieh-zu-schliessen + Escape. onSave/onDelete
       bekommen das Sheet-Root-Element (zum Auslesen der Felder). Rückgabe true
       (oder kein Rückgabewert) schliesst das Sheet; false lässt es offen. */
    var curSheet = null;
    function closeSheet() {
      if (!curSheet) return;
      var s = curSheet, bg = s._bg; curSheet = null;
      s.classList.remove('is-open'); if (bg) bg.classList.remove('is-open');
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); if (bg && bg.parentNode) bg.parentNode.removeChild(bg); }, 380);
      // Während des offenen Sheets aufgeschobene Re-Renders jetzt nachholen
      // (nach der Schliess-Animation, damit sie nicht hart abreisst). Ist bis
      // dahin schon das NÄCHSTE Sheet offen (Detail → Aktion), bleibt der
      // Refresh vorgemerkt und läuft nach dessen Schliessen.
      if (pendingRefresh) {
        pendingRefresh = false;
        setTimeout(function () { if (curSheet) { pendingRefresh = true; return; } apply(); }, 400);
      }
    }
    function sheet(o) {
      closeSheet();
      var bg = document.createElement('div');
      bg.className = 'gn-backdrop gn-sheet-backdrop';
      var s = document.createElement('div');
      s.className = 'gn-sheet gn-sheet--form';
      // Detail-/Info-Sheets ohne onSave/onDelete kommen OHNE CTA-Zeile
      // (Schliessen via ✕ / Backdrop / Zieh-zu-schliessen).
      var hasCta = !!(o.onSave || o.onDelete);
      s.innerHTML =
        '<div class="gn-grab" data-gn-grab><i></i></div>'
        + '<div class="gn-sheet-head"><h2>' + esc(o.title || '') + '</h2>'
        + '<button class="gn-x" data-gn-x><svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5 5 19"/></svg></button></div>'
        + '<div class="gn-sheet-form">' + (o.html || '') + '</div>'
        + (hasCta
          ? ('<div class="gn-sheet-cta">'
            + (o.onDelete ? '<button class="gn-btn gn-btn-danger" data-gn-del>🗑</button>' : '')
            + '<button class="gn-btn gn-btn-ghost" data-gn-cancel>Abbrechen</button>'
            + (o.onSave ? '<button class="gn-btn" data-gn-save>' + esc(o.saveLabel || 'Speichern') + '</button>' : '')
            + '</div>')
          : '');
      root.appendChild(bg); root.appendChild(s);
      s._bg = curSheet && curSheet._bg; curSheet = s; s._bg = bg;
      // Öffnen im nächsten Frame (Transition greift)
      requestAnimationFrame(function () { requestAnimationFrame(function () { s.classList.add('is-open'); bg.classList.add('is-open'); }); });
      var doSave = function () { var r = o.onSave ? o.onSave(s) : true; if (r !== false) closeSheet(); };
      var saveBtn = s.querySelector('[data-gn-save]');
      if (saveBtn) saveBtn.addEventListener('click', doSave);
      var cancelBtn = s.querySelector('[data-gn-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', closeSheet);
      s.querySelector('[data-gn-x]').addEventListener('click', closeSheet);
      var del = s.querySelector('[data-gn-del]');
      if (del) del.addEventListener('click', function () { if (o.onDelete) o.onDelete(s); });
      bg.addEventListener('click', closeSheet);
      // Zieh-zu-schliessen am Griff
      var grab = s.querySelector('[data-gn-grab]'), gy = null;
      grab.addEventListener('pointerdown', function (e) { gy = e.clientY; s.style.transition = 'none'; grab.setPointerCapture && grab.setPointerCapture(e.pointerId); });
      window.addEventListener('pointermove', function (e) { if (gy == null) return; var dy = Math.max(0, e.clientY - gy); s.style.transform = 'translateY(' + dy + 'px)'; });
      window.addEventListener('pointerup', function (e) { if (gy == null) return; s.style.transition = ''; s.style.transform = ''; if ((e.clientY || gy) - gy > 90) closeSheet(); gy = null; });
      return s;
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && curSheet) closeSheet(); });

    apply();
    // Ungelesen-Zähler der Navbar IM DOM nachführen (kein Re-Render — der
    // würde ein offenes Overlay/eine Eingabe wegwischen).
    try { if (typeof GemaNotify !== 'undefined' && GemaNotify.onChange) GemaNotify.onChange(function () { navbarBadge(root); }); } catch (e) {}
    return { refresh: apply, root: root, enabled: enabled, sheet: sheet, closeSheet: closeSheet, sheetOpen: function () { return !!curSheet; } };
  }

  /* ── Natives Autocomplete für Sheet-/Screen-Inputs ──
     ac(inputEl, getSugg, onSelect): rendert die Vorschläge als Liste IM
     Formularfluss direkt unter dem Feld (kein position:fixed-Drop — der
     Sheet-Container ist während des Zieh-Schliessens transformiert und
     scrollt selbst; ein Flow-Element bleibt immer korrekt platziert).
     getSugg(q) liefert [{label, value?, hint?, …}] (derselbe Item-Kontrakt
     wie _wzInitAC in if_werkzeug); onSelect(item) läuft nach der Übernahme. */
  function ac(inp, getSugg, onSelect) {
    if (!inp || inp.__gnAc) return; inp.__gnAc = true;
    var wrap = document.createElement('div');
    wrap.className = 'gn-ac';
    inp.insertAdjacentElement('afterend', wrap);
    var items = [];
    function hide() { wrap.classList.remove('is-open'); wrap.innerHTML = ''; }
    function show() {
      var q = (inp.value || '').trim();
      items = []; try { items = getSugg(q) || []; } catch (e) { items = []; }
      if (!items.length) { hide(); return; }
      wrap.innerHTML = items.slice(0, 8).map(function (it, i) {
        return '<button type="button" class="gn-ac-it" data-i="' + i + '">'
          + '<span class="gn-ac-l">' + esc(it.label) + '</span>'
          + (it.hint ? '<span class="gn-ac-h">' + esc(it.hint) + '</span>' : '')
          + '</button>';
      }).join('');
      wrap.classList.add('is-open');
    }
    inp.addEventListener('input', show);
    // Auch bei Fokus/Tap SOFORT zeigen — «erst beim Tippen» ist auf dem
    // Phone nicht akzeptabel (gleiches Verhalten wie _wzInitAC).
    inp.addEventListener('focus', show);
    inp.addEventListener('click', function () { if (!wrap.classList.contains('is-open')) show(); });
    inp.addEventListener('blur', function () { setTimeout(hide, 200); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    wrap.addEventListener('mousedown', function (e) { e.preventDefault(); });  // kein Blur vor dem Tap
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.gn-ac-it'); if (!b) return;
      var it = items[+b.getAttribute('data-i')]; if (!it) return;
      inp.value = it.value != null ? it.value : it.label;
      hide();
      if (onSelect) { try { onSelect(it); } catch (err) {} }
      try { inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (err) {}
    });
  }

  window.GemaNativeMobil = { phone: phone, enabled: enabled, pref: pref, setPref: setPref, mount: mount, esc: esc, ac: ac, goBack: goBack,
    orgLogoSrc: orgLogoSrc, istHome: istHome };
})();
