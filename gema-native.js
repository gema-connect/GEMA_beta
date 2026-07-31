/* ============================================================
   GEMA Native — Interaktionen (Variante 1c)
   Vanilla JS, keine Abhängigkeiten. Einbinden am Seitenende:
     <script src="gema-native.js" defer></script>
   Verdrahtet sich selbst über data-Attribute (siehe README).
   Reines UI — kein Einfluss auf Supabase/Netlify/deine Logik.
   ============================================================ */
(function () {
  "use strict";

  function haptic() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  function on(el, ev, fn) { el && el.addEventListener(ev, fn); }
  function all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function initApp(app) {
    if (app.__gnInit) return; app.__gnInit = true;

    /* ---- Command-Palette ---- */
    var cmd = app.querySelector("[data-gn-cmd]");
    var cmdBg = app.querySelector("[data-gn-cmd-backdrop]");
    if (cmd) {
      var openCmd = function () {
        cmd.classList.add("is-open"); cmdBg && cmdBg.classList.add("is-open");
        var input = cmd.querySelector(".gn-cmd-input"); if (input) setTimeout(function(){ input.focus(); }, 60);
      };
      var closeCmd = function () { cmd.classList.remove("is-open"); cmdBg && cmdBg.classList.remove("is-open"); };
      all(app, "[data-gn-cmd-open]").forEach(function (b) { on(b, "click", openCmd); });
      all(app, "[data-gn-cmd-close]").forEach(function (b) { on(b, "click", closeCmd); });
      on(cmdBg, "click", closeCmd);
      app.__gnCloseCmd = closeCmd;
    }

    /* ---- Bottom-Sheet (+ Ziehen zum Schliessen) ---- */
    var sheet = app.querySelector("[data-gn-sheet]");
    var sheetBg = app.querySelector("[data-gn-sheet-backdrop]");
    if (sheet) {
      var openSheet = function () { sheet.classList.add("is-open"); sheetBg && sheetBg.classList.add("is-open"); };
      var closeSheet = function () { sheet.classList.remove("is-open"); sheetBg && sheetBg.classList.remove("is-open"); };
      all(app, "[data-gn-sheet-open]").forEach(function (b) { on(b, "click", openSheet); });
      all(app, "[data-gn-sheet-close]").forEach(function (b) { on(b, "click", closeSheet); });
      on(sheetBg, "click", closeSheet);
      var grab = sheet.querySelector("[data-gn-grab]"), gy = null;
      if (grab) {
        on(grab, "pointerdown", function (e) { gy = e.clientY; sheet.style.transition = "none"; grab.setPointerCapture && grab.setPointerCapture(e.pointerId); });
        on(window, "pointermove", function (e) { if (gy == null) return; var dy = Math.max(0, e.clientY - gy); sheet.style.transform = "translateY(" + dy + "px)"; });
        on(window, "pointerup", function (e) { if (gy == null) return; sheet.style.transition = ""; sheet.style.transform = ""; if ((e.clientY || gy) - gy > 90) closeSheet(); gy = null; });
      }
    }

    /* ---- Push / Pop (native Navigation) ---- */
    all(app, "[data-gn-push]").forEach(function (el) {
      on(el, "click", function () {
        if (el.__gnCtxFired) { el.__gnCtxFired = false; return; }   // Long-Press hat Vorrang
        var d = app.querySelector('[data-gn-detail="' + el.getAttribute("data-gn-push") + '"]');
        if (d) { d.classList.add("is-open"); app.__gnCloseCmd && app.__gnCloseCmd(); }
      });
    });
    all(app, "[data-gn-pop]").forEach(function (el) {
      on(el, "click", function () {
        var d = app.querySelector('[data-gn-detail="' + el.getAttribute("data-gn-pop") + '"]');
        if (d) d.classList.remove("is-open");
      });
    });

    /* ---- Stepper (−  Wert  +) ---- */
    all(app, "[data-gn-stepper]").forEach(function (st) {
      var v = st.querySelector(".gn-stepper-v");
      var step = parseFloat(st.getAttribute("data-gn-step") || "1");
      var min = st.hasAttribute("data-gn-min") ? parseFloat(st.getAttribute("data-gn-min")) : -Infinity;
      var max = st.hasAttribute("data-gn-max") ? parseFloat(st.getAttribute("data-gn-max")) : Infinity;
      all(st, "[data-step]").forEach(function (b) {
        on(b, "click", function () {
          var n = parseFloat(String(v.textContent).replace(",", ".")) || 0;
          n += b.getAttribute("data-step") === "+" ? step : -step;
          if (n < min) n = min; if (n > max) n = max;
          v.textContent = (step % 1 ? n.toFixed(1) : String(n)).replace(".", ",");
          st.dispatchEvent(new CustomEvent("gn:step", { detail: { value: n } }));
        });
      });
    });

    /* ---- Wochenstreifen (Kalender) ---- */
    all(app, ".gn-weekstrip").forEach(function (strip) {
      var days = all(strip, ".gn-day");
      days.forEach(function (d) {
        on(d, "click", function () {
          days.forEach(function (x) { x.classList.remove("is-active"); });
          d.classList.add("is-active");
          strip.dispatchEvent(new CustomEvent("gn:day", { detail: { value: d.getAttribute("data-value") || d.textContent.trim() } }));
        });
      });
    });

    /* ---- Segmented Controls ---- */
    all(app, ".gn-seg").forEach(function (seg) {
      var opts = all(seg, ".gn-seg-opt");
      opts.forEach(function (opt) {
        on(opt, "click", function () {
          opts.forEach(function (o) { o.classList.remove("is-active"); });
          opt.classList.add("is-active");
          seg.dispatchEvent(new CustomEvent("gn:segment", { detail: { value: opt.getAttribute("data-value") || opt.textContent.trim() } }));
        });
      });
    });

    /* ---- Kontextmenü per Long-Press ---- */
    var ctxBg = app.querySelector("[data-gn-ctx-backdrop]");
    if (ctxBg) {
      var titleEl = ctxBg.querySelector("[data-gn-ctx-title]");
      var showCtx = function (row) {
        if (titleEl) titleEl.textContent = row.getAttribute("data-gn-ctx") || "";
        ctxBg.classList.add("is-open"); row.__gnCtxFired = true; haptic();
        ctxBg.dispatchEvent(new CustomEvent("gn:context", { detail: { title: row.getAttribute("data-gn-ctx"), row: row } }));
      };
      var hideCtx = function () { ctxBg.classList.remove("is-open"); };
      all(app, "[data-gn-ctx]").forEach(function (row) {
        var t = null, sx = 0, sy = 0;
        on(row, "pointerdown", function (e) { sx = e.clientX; sy = e.clientY; t = setTimeout(function () { showCtx(row); }, 430); });
        on(row, "pointerup", function () { clearTimeout(t); });
        on(row, "pointerleave", function () { clearTimeout(t); });
        on(row, "pointermove", function (e) { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) clearTimeout(t); });
        on(row, "contextmenu", function (e) { e.preventDefault(); showCtx(row); });   // Desktop-Rechtsklick
      });
      on(ctxBg, "click", hideCtx);
    }

    /* ---- Grosser Titel -> kompakte Leiste beim Scrollen ---- */
    var scroll = app.querySelector("[data-gn-scroll]");
    var compact = app.querySelector("[data-gn-compact]");
    if (scroll && compact) {
      on(scroll, "scroll", function () {
        if (scroll.scrollTop > 26) compact.classList.add("is-visible");
        else compact.classList.remove("is-visible");
      });
    }

    /* ---- Pull-to-Refresh ----
       Touch-Events statt Pointer-Events (KRITISCH): Beim Runterziehen an
       scrollTop 0 übernimmt der Browser die Geste (Overscroll/Rubber-Band)
       und feuert pointercancel — die Pointer-Variante brach damit auf
       echten Geräten sofort ab. touchmove ist non-passiv registriert und
       ruft preventDefault NUR während eines aktiven Zugs nach unten; die
       normale Scroll-Geste (hochwischen / Liste nicht oben) bleibt nativ.
       Maus-Fallback für Desktop-Demos; Hook: list.__gnRefresh = () => Promise. */
    all(app, "[data-gn-ptr]").forEach(function (list) {
      var host = list.parentElement;
      var spin = host.querySelector(".gn-ptr-spinner");
      var sy = null, dy = 0, busy = false, mode = null;
      var start = function (y, m) {
        if (list.scrollTop > 2 || busy || sy != null) return;
        sy = y; dy = 0; mode = m; list.style.transition = "none";
      };
      var move = function (y) {
        if (sy == null) return false;
        dy = y - sy;
        if (dy < 0) { sy = null; mode = null; list.style.transition = "transform .25s"; list.style.transform = ""; return false; }
        var p = Math.min(dy, 90); list.style.transform = "translateY(" + p + "px)";
        if (spin) { spin.style.opacity = Math.min(1, p / 55); spin.querySelector("svg").style.transform = "rotate(" + (p * 3) + "deg)"; }
        return dy > 6;   // ab hier gehört die Geste uns (preventDefault)
      };
      var end = function () {
        if (sy == null) return; list.style.transition = "transform .25s";
        if (dy > 55) {
          busy = true; list.style.transform = "translateY(42px)"; spin && spin.classList.add("is-busy");
          var done = function () { list.style.transform = ""; if (spin) { spin.style.opacity = "0"; spin.classList.remove("is-busy"); } busy = false; };
          // Hier echten Refresh einhängen (z. B. Supabase-Query); Promise zurückgeben.
          var hook = list.__gnRefresh ? list.__gnRefresh() : null;
          if (hook && hook.then) hook.then(done, done); else setTimeout(done, 900);
        } else { list.style.transform = ""; if (spin) spin.style.opacity = "0"; }
        sy = null; mode = null;
      };
      list.addEventListener("touchstart", function (e) { start(e.touches[0].clientY, "t"); }, { passive: true });
      list.addEventListener("touchmove", function (e) {
        if (mode !== "t") return;
        if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
      }, { passive: false });
      on(list, "touchend", end); on(list, "touchcancel", end);
      // Maus (Desktop): nur wenn keine Touch-Geste läuft
      on(list, "mousedown", function (e) { if (mode !== "t") start(e.clientY, "m"); });
      on(list, "mousemove", function (e) { if (mode === "m") move(e.clientY); });
      on(list, "mouseup", function () { if (mode === "m") end(); });
      on(list, "mouseleave", function () { if (mode === "m") end(); });
    });
  }

  /* Esc schliesst offene Overlays */
  on(document, "keydown", function (e) {
    if (e.key !== "Escape") return;
    all(document, ".gn-cmd.is-open,.gn-sheet.is-open,.gn-detail.is-open,.gn-ctx-backdrop.is-open").forEach(function (el) { el.classList.remove("is-open"); });
    all(document, ".gn-backdrop.is-open").forEach(function (el) { el.classList.remove("is-open"); });
  });

  function boot() {
    var apps = all(document, "[data-gn-app]");
    (apps.length ? apps : [document.querySelector(".gn")].filter(Boolean)).forEach(initApp);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* Öffentliche Mini-API für dynamisch nachgeladene Screens */
  window.GemaNative = { init: initApp, boot: boot };
})();
