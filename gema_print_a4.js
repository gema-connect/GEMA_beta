/* gema_print_a4.js — A4-Blatt-Vorschau für Druckfenster
 *
 * Druckfenster (window.open + document.write) zeigten den Inhalt bisher als
 * Voll-Breite-HTML. GemaPrintA4.apply(win) legt den Inhalt auf ein weisses
 * A4-Blatt auf grauer Bühne (Bildschirm), OHNE den Druck zu verändern:
 * im Print wird das Blatt auf einen neutralen Block zurückgesetzt — die
 * @page-Regeln des jeweiligen Fensters gelten unverändert.
 *
 * Verwendung im Parent nach dem Aufbau des Fensters:
 *   w.document.close();
 *   if (window.GemaPrintA4) GemaPrintA4.apply(w);
 *
 * position:fixed-Elemente (Drucken-Buttons, fixe Fusszeilen) bleiben bewusst
 * ausserhalb des Blatts — fixed ist viewport-bezogen und funktioniert weiter.
 * NICHT anwenden auf Etiketten-Druckfenster (eigene @page-Grössen 49×23 mm
 * u.ä.) — dort wäre die A4-Bühne falsch.
 */
(function (w) {
  'use strict';
  var CSS = ''
    + '@media screen{'
    + 'body{background:#e4e8ee!important;margin:0!important;padding:26px 10px 70px!important}'
    + '.gpa4-sheet{width:210mm;max-width:calc(100vw - 20px);min-height:297mm;margin:0 auto;background:#fff;'
    + 'box-shadow:0 3px 24px rgba(15,23,42,.22);border-radius:2px;padding:14mm 13mm;box-sizing:border-box;overflow:hidden}'
    + '}'
    + '@media print{'
    + 'body{background:none!important;padding:0!important}'
    + '.gpa4-sheet{width:auto;max-width:none;min-height:0;margin:0;background:none;box-shadow:none;border-radius:0;padding:0;overflow:visible}'
    + '}';
  var API = {
    css: function () { return CSS; },
    /**
     * KRITISCH — erst wrappen, wenn das Fenster fertig geparst ist.
     * Der Aufrufer ruft apply() direkt nach document.close(). Ist der Parser
     * zu diesem Zeitpunkt noch nicht durch (typisch beim ERSTEN Öffnen: ein
     * Stylesheet-Link ist noch unterwegs und haelt den Parser an), lagen erst
     * ein paar Knoten im Dokument — apply() legte NUR die aufs Blatt, alles
     * spaeter Geparste landete daneben. Genau das sah der Nutzer: eine leere
     * A4-Seite und Inhalt, der nicht auf dem Blatt sitzt; beim zweiten Mal
     * (alles im Cache) war es korrekt.
     */
    apply: function (win) {
      try {
        var d = win && win.document;
        if (!d) return;
        if (d.readyState === 'loading') {
          var fertig = false;
          var nachher = function () { if (fertig) return; fertig = true; try { API._wrap(win); } catch (e) {} };
          d.addEventListener('DOMContentLoaded', nachher, { once: true });
          win.addEventListener('load', nachher, { once: true });
          // Sicherheitsnetz: bleibt der Parser an einer nie eintreffenden
          // Ressource haengen (readyState kommt dann nie ueber «loading»
          // hinaus), wird gewrappt, sobald der Inhalt nicht mehr waechst.
          var letzte = -1, ruhig = 0;
          var puls = function () {
            if (fertig) return;
            try {
              if (!d.body) { setTimeout(puls, 120); return; }
              var n = d.body.childNodes.length;
              ruhig = (n === letzte && n > 0) ? ruhig + 1 : 0;
              letzte = n;
              if (ruhig >= 3 || d.readyState !== 'loading') { nachher(); return; }
            } catch (e) { nachher(); return; }
            setTimeout(puls, 120);
          };
          setTimeout(puls, 120);
          return;
        }
        API._wrap(win);
      } catch (e) {}
    },
    _wrap: function (win) {
      try {
        var d = win && win.document;
        if (!d || !d.body || d.getElementById('gpa4Style')) return;
        var st = d.createElement('style');
        st.id = 'gpa4Style';
        st.textContent = CSS;
        (d.head || d.documentElement).appendChild(st);
        var sheet = d.createElement('div');
        sheet.className = 'gpa4-sheet';
        var kids = [].slice.call(d.body.childNodes);
        kids.forEach(function (c) {
          try {
            if (c.nodeType === 1) {
              var cs = win.getComputedStyle(c);
              if (cs && cs.position === 'fixed') return;   // Bedienleisten bleiben draussen
            }
          } catch (e) {}
          sheet.appendChild(c);
        });
        d.body.appendChild(sheet);
      } catch (e) {}
    }
  };
  w.GemaPrintA4 = API;
})(window);
