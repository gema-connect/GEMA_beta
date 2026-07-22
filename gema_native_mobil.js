/* ============================================================
   GEMA Native Mobil — Mount-Helper für die iPhone-Ansicht
   Bindet einen GEMA-Native-Screen (gema-native.css/js) als
   Vollbild-Overlay in eine bestehende Modulseite ein:
   - NUR auf Phones aktiv (≤740px), Desktop/Tablet unverändert
   - Umschalter «Klassische Ansicht» (persistiert pro Gerät,
     [data-gn-classic] im Screen-Markup) + 📱-Rückkehr-Pill
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
      var q = new URLSearchParams(location.search).get('native');
      if (q === '0') return 'klassisch';
      if (q === '1') return 'native';
    } catch (e) {}
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
      '.gn-return-pill{position:fixed;left:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:899;' +
      'display:flex;align-items:center;gap:7px;background:rgba(28,28,30,.9);color:#fff;border:none;border-radius:22px;' +
      'padding:10px 15px;font:600 13px "DM Sans",system-ui,sans-serif;box-shadow:0 10px 26px -8px rgba(0,0,0,.5);cursor:pointer}' +
      '@media (min-width: 741px){.gn-return-pill{display:none}}';
    document.head.appendChild(st);
  }

  function mount(opts) {
    ensureCss();
    var root = document.createElement('div');
    root.className = 'gn gn--page';
    root.setAttribute('data-gn-app', '');
    root.style.display = 'none';
    document.body.appendChild(root);

    var pill = null;
    function ensurePill() {
      if (pill) return pill;
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'gn-return-pill no-print';
      pill.innerHTML = '📱 Native Ansicht';
      pill.addEventListener('click', function () { setPref('native'); apply(true); });
      document.body.appendChild(pill);
      return pill;
    }

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
        if (pill) pill.style.display = 'none';
      } else {
        root.style.display = 'none';
        document.documentElement.classList.remove('gn-native-on');
        if (phone()) { ensurePill().style.display = ''; }
        else if (pill) { pill.style.display = 'none'; }
      }
      lastOn = on;
    }

    /* «Klassische Ansicht» aus dem Screen heraus (Button mit data-gn-classic) */
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-gn-classic]');
      if (b) { setPref('klassisch'); apply(true); }
    });

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (enabled() !== lastOn) apply(); }, 200);
    });

    apply();
    return { refresh: apply, root: root, enabled: enabled };
  }

  window.GemaNativeMobil = { phone: phone, enabled: enabled, pref: pref, setPref: setPref, mount: mount, esc: esc };
})();
