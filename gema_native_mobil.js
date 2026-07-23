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
      '.gn--page{position:fixed;inset:0;z-index:900;height:auto}' +
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
      '.gn .gn-sheet-cta .gn-btn{flex:1}' +
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
      '.gn .gn-check{display:flex;align-items:center;gap:11px;margin:0 16px 14px;background:var(--gn-card);border-radius:12px;padding:12px 14px;box-shadow:var(--gn-shadow-card);cursor:pointer}' +
      '.gn .gn-check input{width:24px;height:24px;accent-color:var(--gn-accent);flex:none}' +
      '.gn .gn-check span{font-size:15px;color:var(--gn-ink)}';
    document.head.appendChild(st);
  }

  function mount(opts) {
    ensureCss();
    var root = document.createElement('div');
    root.className = 'gn gn--page';
    root.setAttribute('data-gn-app', '');
    root.style.display = 'none';
    document.body.appendChild(root);

    var lastOn = null;
    function apply(force) {
      var on = enabled();
      if (on) {
        var sc = root.querySelector('[data-gn-scroll]');
        var st = sc ? sc.scrollTop : 0;
        try { opts.render(root); } catch (e) { console.warn('[GemaNativeMobil] render:', e && e.message); }
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
            + (o.onDelete ? '<button class="gn-btn gn-btn-danger" data-gn-del style="flex:0 0 auto;min-width:58px">🗑</button>' : '')
            + '<button class="gn-btn gn-btn-ghost" data-gn-cancel style="flex:0 0 auto">Abbrechen</button>'
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
    return { refresh: apply, root: root, enabled: enabled, sheet: sheet, closeSheet: closeSheet };
  }

  window.GemaNativeMobil = { phone: phone, enabled: enabled, pref: pref, setPref: setPref, mount: mount, esc: esc };
})();
