/**
 * gema_verknuepfung.js — Werte-Verknuepfungen zwischen Berechnungen erfassen
 *
 * KERNPRINZIP VON GEMA: «Daten einmal erfassen, ueberall verknuepfen.» Dieses
 * Werkzeug ist die Erfassungsstelle dafuer. Der Knopf «🔗 Verknüpfung» steht in
 * der Navigation JEDER Berechnung — wie der Feedback-Knopf, aber NUR fuer den
 * GEMA-Admin (User-Entscheid 08/2026).
 *
 * ABLAUF (bewusst im ZIELMODUL, nicht im Quellmodul):
 *   1. Im Modul, das den Wert BEKOMMEN soll, den Knopf druecken.
 *   2. «＋ Wert hier vorschlagen lassen» → das Zielfeld direkt anklicken.
 *   3. Quelle waehlen: welcher Wert aus welcher anderen Berechnung.
 *      MEHRERE Quellen sind der Normalfall, nicht die Ausnahme — eine
 *      Druckerhoehung wird fuer Kaltwasser ODER fuer Regenwasser ausgelegt;
 *      der Planer waehlt spaeter, welche Quelle gilt (Feld «Gilt wenn»).
 *   4. Speichern → die Verknuepfung bekommt eine kurze Nummer (VK-0007).
 *
 * WAS DAS WERKZEUG TUT UND WAS NICHT (User-Entscheid 08/2026):
 * Es DOKUMENTIERT nur und exportiert Markdown fuer Claude Code. Es schlaegt
 * selbst KEINE Werte vor — das programmiert Claude Code danach sauber ins
 * Modul (mit Herkunfts-Chip, ueberschreibbar, Muster sb_saugpumpe). So kann
 * das Erfassen nie eine laufende Berechnung verfaelschen.
 *
 * IDs (User-Entscheid 08/2026):
 *   · WERTE tragen sprechende, stabile IDs: «druckerhoehung.vfd_LU»
 *     (aus gema_werte_katalog.js, erzeugt von scripts/werte_katalog_gen.mjs)
 *   · VERKNUEPFUNGEN tragen kurze Nummern: «VK-0007» — geaendert wird immer
 *     eine Verknuepfung, nie ein Wert. «VK-0007 streichen» genuegt als Ansage.
 *
 * Speicherung: per-Record in der Cloud (moduleKey «verknuepfungen», prefix
 * «vk:», Pool-Cache «gema_vk_pool_v1») — NIE persistCollection, der Pool ist
 * org-uebergreifend lesbar. Gebunden wird ERST beim Oeffnen des Werkzeugs;
 * der Katalog (~250 KB) wird ebenfalls erst dann nachgeladen. Fuer alle
 * anderen Nutzer kostet der Helfer damit nichts ausser dem Rollen-Check.
 */
(function (w, d) {
  'use strict';
  if (w.GemaVerknuepfung) return;

  var POOL_KEY = 'gema_vk_pool_v1';
  var MODUL_KEY = 'verknuepfungen';
  var PREFIX = 'vk:';
  var KATALOG_DATEI = 'gema_werte_katalog.js';

  var STATUS = {
    offen:     { label: 'offen',     farbe: '#b45309', bg: '#fef3c7' },
    umgesetzt: { label: 'umgesetzt', farbe: '#15803d', bg: '#dcfce7' },
    verworfen: { label: 'verworfen', farbe: '#64748b', bg: '#f1f5f9' }
  };

  var _modulKey = '', _modulLabel = '';
  var _offen = false, _zielModus = false, _katalogGeladen = false, _gebunden = false;
  var _entwurf = null;          /* die Verknuepfung im Dialog */
  var _quellSuche = '';
  var _suchIndex = -1;          /* welche Quelle gerade ihre Suche offen hat */

  /* ═══════════════════════════════════════════════════════════
     Kleinkram
     ═══════════════════════════════════════════════════════════ */

  /* Voll-Escaper (GEMA-Kanon: &<>"' — Texte landen auch in Attributen) */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return d.getElementById(id); }
  function jetzt() { return new Date().toISOString(); }

  function user() {
    try { return (w.GemaAuth && GemaAuth.getCurrentUser && GemaAuth.getCurrentUser()) || null; }
    catch (e) { return null; }
  }
  function istAdmin() {
    var u = user();
    return !!(u && u.roleIds && u.roleIds.indexOf('role_admin') >= 0);
  }
  function orgId() { var u = user(); return (u && u.orgId) || ''; }

  /* Modul-Key dieser Seite — dieselbe Wahrheit wie Permissions/AutoSave */
  function seiteModulKey() {
    var datei = (location.pathname.split('/').pop() || '').replace(/\.html?$/, '').toLowerCase();
    try {
      var map = (w.GemaAuth && GemaAuth.getFileMap && GemaAuth.getFileMap()) || {};
      return map[datei] || datei;
    } catch (e) { return datei; }
  }
  function seiteModulLabel() {
    var h = d.querySelector('.gema-hero-title, .hero-title, h1');
    var t = h ? (h.textContent || '').trim() : '';
    return t || _modulKey;
  }

  /* ═══════════════════════════════════════════════════════════
     Speicher (per-Record, lazy gebunden)
     ═══════════════════════════════════════════════════════════ */

  function poolLesen() {
    try {
      if (w.GemaSync && GemaSync.getCached) {
        var a = GemaSync.getCached(POOL_KEY);
        if (Array.isArray(a)) return a;
      }
      return JSON.parse(localStorage.getItem(POOL_KEY) || '[]');
    } catch (e) { return []; }
  }
  function poolSchreiben(liste) {
    try { localStorage.setItem(POOL_KEY, JSON.stringify(liste)); } catch (e) {}
  }
  function binden() {
    if (_gebunden) return Promise.resolve();
    _gebunden = true;
    if (!(w.GemaSync && GemaSync.bindCollection)) return Promise.resolve();
    return GemaSync.bindCollection(MODUL_KEY, POOL_KEY, PREFIX, 'id')
      .catch(function () { /* offline: der lokale Cache genuegt */ });
  }
  function sichern(rec) {
    var liste = poolLesen();
    var i = -1;
    liste.forEach(function (x, n) { if (x && x.id === rec.id) i = n; });
    if (i >= 0) liste[i] = rec; else liste.push(rec);
    poolSchreiben(liste);   /* lokal zuerst — durable, auch offline */
    if (w.GemaSync && GemaSync.saveRecord) {
      GemaSync.saveRecord(MODUL_KEY, PREFIX + rec.id, rec).catch(function () {
        /* Fehlschlag geht in die Outbox von gema_sync und wird nachgesendet */
      });
    }
  }
  function loeschen(id) {
    poolSchreiben(poolLesen().filter(function (x) { return x && x.id !== id; }));
    if (w.GemaSync && GemaSync.deleteRecord) {
      GemaSync.deleteRecord(MODUL_KEY, PREFIX + id).catch(function () {});
    }
  }

  /* Alle Verknuepfungen, neueste zuerst */
  function alle() {
    return poolLesen().filter(Boolean).sort(function (a, b) {
      return String(b.erstelltAm || '').localeCompare(String(a.erstelltAm || ''));
    });
  }
  function fuerModul(mk) {
    return alle().filter(function (v) { return v.zielModul === mk; });
  }

  /* Naechste freie Nummer. BEWUSST global fortlaufend (nicht pro Modul):
     «VK-0007» soll ohne Modulangabe eindeutig ansagbar sein. */
  function naechsteNummer() {
    var max = 0;
    poolLesen().forEach(function (v) {
      var m = /^VK-(\d+)$/.exec(String((v && v.nr) || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'VK-' + String(max + 1).padStart(4, '0');
  }

  /* ═══════════════════════════════════════════════════════════
     Werte-Katalog (lazy)
     ═══════════════════════════════════════════════════════════ */

  function katalogLaden() {
    if (w.GemaWerteKatalog) { _katalogGeladen = true; return Promise.resolve(true); }
    return new Promise(function (fertig) {
      var s = d.createElement('script');
      s.src = KATALOG_DATEI;
      s.onload = function () { _katalogGeladen = !!w.GemaWerteKatalog; fertig(_katalogGeladen); };
      s.onerror = function () { _katalogGeladen = false; fertig(false); };
      d.head.appendChild(s);
    });
  }
  function katalog() { return w.GemaWerteKatalog || null; }

  /* Beschriftung eines Quellwerts fuer die Anzeige */
  function quellLabel(q) {
    var k = katalog();
    if (k && k.byId(q.wertId)) return k.label(q.wertId);
    return q.label || q.wertId;
  }

  /* ═══════════════════════════════════════════════════════════
     Stil
     ═══════════════════════════════════════════════════════════ */

  function stilEinbauen() {
    if (el('gvk-stil')) return;
    var s = d.createElement('style');
    s.id = 'gvk-stil';
    s.textContent = [
      /* Knopf in der Nav — Metriken kommen zentral aus gema_responsive.css */
      '.gvk-nav-btn{background:#0891b2;color:#fff;border:none}',
      '.gvk-nav-btn:hover{background:#0e7490}',

      /* Panel */
      '.gvk-panel{position:fixed;top:calc(72px + env(safe-area-inset-top,0px));right:0;bottom:0;width:min(520px,100vw);',
      'background:#fff;border-left:1.5px solid #e0e4ef;box-shadow:-8px 0 32px rgba(0,0,0,.12);z-index:11700;',
      'display:flex;flex-direction:column;font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;color:#0f172a}',
      '@media(max-width:640px){.gvk-panel{width:100vw;top:calc(60px + env(safe-area-inset-top,0px))}}',
      '.gvk-kopf{padding:14px 16px;border-bottom:1.5px solid #e0e4ef;background:#f7f8fc;display:flex;align-items:center;gap:10px;flex-shrink:0}',
      '.gvk-kopf b{font-size:14.5px;font-weight:800;flex:1;min-width:0}',
      '.gvk-kopf .gvk-sub{font-size:11.5px;color:#64748b;font-weight:600}',
      '.gvk-body{flex:1;overflow-y:auto;padding:14px 16px}',
      '.gvk-fuss{padding:12px 16px;border-top:1.5px solid #e0e4ef;background:#f7f8fc;display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0}',

      /* Knoepfe */
      '.gvk-b{padding:8px 14px;border-radius:9px;border:1.5px solid #c8cfdf;background:#fff;color:#334155;',
      'font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s}',
      '.gvk-b:hover{background:#f1f5f9}',
      '.gvk-b.prim{background:#0891b2;border-color:#0891b2;color:#fff}',
      '.gvk-b.prim:hover{background:#0e7490}',
      '.gvk-b.rot{background:#fff;border-color:#fca5a5;color:#b91c1c}',
      '.gvk-b.rot:hover{background:#fef2f2}',
      '.gvk-b.klein{padding:5px 10px;font-size:11.5px}',
      '.gvk-x{width:32px;height:32px;border-radius:8px;border:1.5px solid #c8cfdf;background:#fff;cursor:pointer;font-size:14px;font-family:inherit;flex-shrink:0}',

      /* Karte einer Verknuepfung */
      '.gvk-karte{border:1.5px solid #e0e4ef;border-radius:12px;padding:12px;margin-bottom:10px;background:#fff}',
      '.gvk-karte-kopf{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
      '.gvk-nr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;font-weight:800;',
      'background:#0f172a;color:#fff;padding:2px 7px;border-radius:6px;letter-spacing:.3px}',
      '.gvk-pill{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.3px}',
      '.gvk-ziel{font-size:13.5px;font-weight:800;flex:1;min-width:0}',
      '.gvk-wid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#0891b2;background:#ecfeff;',
      'padding:1px 6px;border-radius:5px;border:1px solid #a5f3fc;display:inline-block}',
      '.gvk-q{display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-top:1px dashed #e0e4ef;font-size:12.5px}',
      '.gvk-q-nr{width:18px;height:18px;border-radius:50%;background:#e0f2fe;color:#0369a1;font-size:10.5px;',
      'font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}',
      '.gvk-q-wenn{font-size:11.5px;color:#b45309;font-weight:700}',
      '.gvk-hint{font-size:11.5px;color:#64748b;line-height:1.55}',

      /* Zielwahl-Modus */
      '.gvk-zielbar{position:fixed;top:calc(72px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);',
      'z-index:11750;background:#0891b2;color:#fff;padding:10px 18px;border-radius:0 0 12px 12px;font-size:13px;',
      'font-weight:700;box-shadow:0 8px 24px rgba(8,145,178,.35);display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px)}',
      'html.gvk-zielmodus input:not([type=hidden]):not([type=button]):not([type=submit]),',
      'html.gvk-zielmodus select,html.gvk-zielmodus textarea{outline:2px dashed #22d3ee!important;outline-offset:2px;cursor:crosshair!important}',
      'html.gvk-zielmodus input:hover,html.gvk-zielmodus select:hover,html.gvk-zielmodus textarea:hover{outline:3px solid #0891b2!important;background:#ecfeff!important}',
      'html.gvk-zielmodus .gvk-panel input,html.gvk-zielmodus .gvk-panel select,html.gvk-zielmodus .gvk-panel textarea{outline:none!important;cursor:auto!important}',

      /* Dialog */
      '.gvk-dlg-bg{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:11900;display:flex;',
      'align-items:center;justify-content:center;padding:16px}',
      '.gvk-dlg{background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:calc(100vh - 40px);',
      'display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.25);',
      'font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;color:#0f172a;overflow:hidden}',
      '.gvk-dlg-bd{padding:16px 18px;overflow-y:auto;flex:1}',
      '.gvk-lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;display:block;margin:12px 0 5px}',
      '.gvk-inp{width:100%;padding:8px 11px;border:1.5px solid #c8cfdf;border-radius:9px;font-size:13px;',
      'background:#fff;color:#0f172a;outline:none;font-family:inherit;box-sizing:border-box}',
      '.gvk-inp:focus{border-color:#0891b2}',
      '.gvk-qbox{border:1.5px solid #e0e4ef;border-radius:11px;padding:10px;margin-bottom:9px;background:#fafbff}',
      '.gvk-treffer{max-height:230px;overflow-y:auto;border:1.5px solid #e0e4ef;border-radius:9px;margin-top:5px;background:#fff}',
      '.gvk-tr{padding:7px 10px;border-bottom:1px solid #eef1f7;cursor:pointer;font-size:12.5px}',
      '.gvk-tr:last-child{border-bottom:none}',
      '.gvk-tr:hover{background:#ecfeff}',
      '.gvk-tr-m{font-size:11px;color:#64748b;font-weight:700}',
      '.gvk-leer{text-align:center;padding:26px 14px;color:#64748b;font-size:13px;line-height:1.6}'
    ].join('');
    d.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════
     Knopf in der Navigation
     ═══════════════════════════════════════════════════════════ */

  function knopfEinbauen() {
    if (el('gvkBtn')) return;
    var host = d.querySelector('.g-nav-actions') || d.querySelector('.g-nav-right');
    if (!host) return;
    var b = d.createElement('button');
    b.id = 'gvkBtn';
    b.type = 'button';
    b.className = 'g-nav-btn gvk-nav-btn no-print';
    b.title = 'Werte-Verknüpfungen dokumentieren (nur GEMA-Admin)';
    b.textContent = '🔗 Verknüpfung';
    b.addEventListener('click', function () { oeffnen(); });
    /* Vor den Feedback-Knopf — der bleibt der letzte in der Reihe */
    var fb = host.querySelector('.gema-feedback-btn');
    if (fb) host.insertBefore(b, fb); else host.appendChild(b);
  }

  /* ═══════════════════════════════════════════════════════════
     Panel
     ═══════════════════════════════════════════════════════════ */

  function oeffnen() {
    stilEinbauen();
    if (!el('gvkPanel')) {
      var p = d.createElement('div');
      p.id = 'gvkPanel';
      p.className = 'gvk-panel';
      d.body.appendChild(p);
    }
    _offen = true;
    panelZeichnen(true);
    Promise.all([binden(), katalogLaden()]).then(function () { if (_offen) panelZeichnen(false); });
  }

  function schliessen() {
    _offen = false;
    zielModusAus();
    var p = el('gvkPanel');
    if (p) p.remove();
  }

  function panelZeichnen(laedt) {
    var p = el('gvkPanel');
    if (!p) return;
    var liste = fuerModul(_modulKey);
    var gesamt = alle().length;

    var karten = liste.length
      ? liste.map(karteHtml).join('')
      : '<div class="gvk-leer">Für <b>' + esc(_modulLabel) + '</b> ist noch nichts erfasst.<br><br>'
        + 'Mit <b>＋ Wert hier vorschlagen lassen</b> klickst du direkt das Feld an,<br>'
        + 'das einen Wert aus einer anderen Berechnung bekommen soll.</div>';

    p.innerHTML =
      '<div class="gvk-kopf">'
      + '<span style="font-size:18px">🔗</span>'
      + '<b>Werte-Verknüpfungen<div class="gvk-sub">' + esc(_modulLabel)
      + ' · <span style="font-family:ui-monospace,monospace">' + esc(_modulKey) + '</span></div></b>'
      + '<button class="gvk-x" onclick="GemaVerknuepfung.schliessen()" title="Schliessen">✕</button>'
      + '</div>'
      + '<div class="gvk-body">'
      + (laedt && !_katalogGeladen ? '<div class="gvk-leer">Werte-Katalog wird geladen …</div>' : '')
      + '<button class="gvk-b prim" style="width:100%;margin-bottom:12px;padding:11px" onclick="GemaVerknuepfung.zielWaehlen()">'
      + '＋ Wert hier vorschlagen lassen</button>'
      + karten
      + '</div>'
      + '<div class="gvk-fuss">'
      + '<button class="gvk-b" onclick="GemaVerknuepfung.exportKopieren()">📋 Markdown kopieren</button>'
      + '<button class="gvk-b" onclick="GemaVerknuepfung.exportDatei()">⬇ Export (' + gesamt + ')</button>'
      + '<span style="flex:1"></span>'
      + '<span class="gvk-hint" style="align-self:center">' + liste.length + ' hier · ' + gesamt + ' gesamt</span>'
      + '</div>';
  }

  function karteHtml(v) {
    var st = STATUS[v.status] || STATUS.offen;
    var quellen = (v.quellen || []).map(function (q, i) {
      return '<div class="gvk-q">'
        + '<span class="gvk-q-nr">' + (i + 1) + '</span>'
        + '<div style="flex:1;min-width:0">'
        + esc(quellLabel(q))
        + '<div><span class="gvk-wid">' + esc(q.wertId) + '</span></div>'
        + (q.bedingung ? '<div class="gvk-q-wenn">gilt wenn: ' + esc(q.bedingung) + '</div>' : '')
        + (q.umrechnung ? '<div class="gvk-hint">Umrechnung: ' + esc(q.umrechnung) + '</div>' : '')
        + '</div></div>';
    }).join('');

    return '<div class="gvk-karte">'
      + '<div class="gvk-karte-kopf">'
      + '<span class="gvk-nr">' + esc(v.nr) + '</span>'
      + '<span class="gvk-pill" style="background:' + st.bg + ';color:' + st.farbe + '">' + st.label + '</span>'
      + '<span style="flex:1"></span>'
      + '<button class="gvk-b klein" onclick="GemaVerknuepfung.bearbeiten(\'' + esc(v.id) + '\')">✏️</button>'
      + '<button class="gvk-b klein rot" onclick="GemaVerknuepfung.entfernen(\'' + esc(v.id) + '\')">🗑</button>'
      + '</div>'
      + '<div class="gvk-ziel">Feld «' + esc(v.zielLabel || v.zielFeld) + '»'
      + (v.zielEinheit ? ' <span class="gvk-hint">[' + esc(v.zielEinheit) + ']</span>' : '') + '</div>'
      + '<div style="margin:3px 0 6px"><span class="gvk-wid">' + esc(v.zielWertId) + '</span>'
      + ' <span class="gvk-hint">· ' + (v.modus === 'fest' ? 'fest übernehmen' : 'Vorschlag, überschreibbar') + '</span></div>'
      + ((v.quellen || []).length > 1
        ? '<div class="gvk-hint" style="margin-bottom:2px"><b>' + v.quellen.length + ' Quellen zur Auswahl</b> — der Planer entscheidet</div>' : '')
      + quellen
      + (v.hinweis ? '<div class="gvk-hint" style="margin-top:7px;padding-top:7px;border-top:1px dashed #e0e4ef">' + esc(v.hinweis) + '</div>' : '')
      + '</div>';
  }

  /* ═══════════════════════════════════════════════════════════
     Zielwahl — Feld im Modul anklicken
     ═══════════════════════════════════════════════════════════ */

  function zielWaehlen() {
    if (_zielModus) { zielModusAus(); return; }
    _zielModus = true;
    d.documentElement.classList.add('gvk-zielmodus');
    /* Das Panel deckt die rechte Seite ab — Felder darunter waeren nicht
       anklickbar. Waehrend der Feldwahl tritt es beiseite und kommt danach
       zurueck (der Dialog liegt ohnehin darueber). */
    var pnl = el('gvkPanel');
    if (pnl) pnl.style.display = 'none';
    if (!el('gvkZielBar')) {
      var b = d.createElement('div');
      b.id = 'gvkZielBar';
      b.className = 'gvk-zielbar';
      b.innerHTML = '<span>👆 Klicke das Feld an, das den Wert bekommen soll</span>'
        + '<button class="gvk-b klein" style="background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.5);color:#fff" '
        + 'onclick="GemaVerknuepfung.zielAbbrechen()">✕ Abbrechen</button>';
      d.body.appendChild(b);
    }
    d.addEventListener('click', zielKlick, true);
    d.addEventListener('keydown', zielEsc, true);
  }

  function zielModusAus() {
    _zielModus = false;
    d.documentElement.classList.remove('gvk-zielmodus');
    var pnl = el('gvkPanel');
    if (pnl) pnl.style.display = '';
    var b = el('gvkZielBar');
    if (b) b.remove();
    d.removeEventListener('click', zielKlick, true);
    d.removeEventListener('keydown', zielEsc, true);
  }

  function zielEsc(ev) { if (ev.key === 'Escape') { ev.preventDefault(); zielModusAus(); } }

  function zielKlick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    /* Klicks im Werkzeug selbst nicht abfangen */
    if (t.closest('#gvkPanel, #gvkZielBar, .gvk-dlg-bg')) return;
    var feld = t.closest('input,select,textarea');
    ev.preventDefault();
    ev.stopPropagation();
    if (!feld) return;   /* daneben geklickt — Modus bleibt an */
    zielModusAus();
    zielUebernehmen(feld);
  }

  /* Beschriftung LIVE aus dem DOM lesen — genauer als der Katalog, weil hier
     der echte Aufbau der Seite vorliegt (der Katalog raet beim Scannen).
     KRITISCH: Beschriftungen tragen im Repo Zusatztexte im selben Element
     (Hint-Spans, Einheiten-Badges, Sprung-Links) und eine zweite Zeile nach
     <br>. Ungefiltert kaeme «Total LULU ↗Summe aller Lasteinheiten» heraus. */
  function labelText(node) {
    if (!node) return '';
    /* Direkt auf dem Original arbeiten (nicht auf einem Klon): nur so ist
       sichtbar, was wirklich sichtbar IST. Die Herkunfts-Tags der Module
       («LU ↗») stehen als display:none im Label und heissen je nach Modul
       anders — eine Klassenliste wuerde sie nie alle erwischen. */
    var teile = [], kinder = node.childNodes;
    for (var i = 0; i < kinder.length; i++) {
      var n = kinder[i];
      if (n.nodeName === 'BR') break;               /* zweite Zeile = Erklaertext */
      if (n.nodeType === 3) { teile.push(n.nodeValue || ''); continue; }
      if (n.nodeType !== 1) continue;
      if (/^(A|BUTTON|SELECT|INPUT|TEXTAREA|SUP)$/.test(n.nodeName)) continue;
      var kl = String(n.className || '');
      if (/lbl-hint|hint|badge|pill|no-print|-tag\b|\btag\b/.test(kl)) continue;
      var st = null;
      try { st = w.getComputedStyle(n); } catch (e) {}
      if (st && (st.display === 'none' || st.visibility === 'hidden')) continue;
      teile.push(n.textContent || '');
    }
    var t = teile.join(' ');
    if (!t.replace(/\s+/g, '')) t = node.textContent || '';
    return kurz(t);
  }

  function feldLabel(feld) {
    var id = feld.id || '';
    if (id) {
      var lab = d.querySelector('label[for="' + (w.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      var t0 = labelText(lab);
      if (t0) return t0;
    }
    var box = feld.closest('.fg,.g-field,.g-inp-group,.el-field,.field,td');
    if (box) {
      var t1 = labelText(box.querySelector('.fg-lbl,.g-label,.g-inp-lbl,label,.lbl'));
      if (t1) return t1;
      /* .g-inp-group traegt die Beschriftung meist im Eltern-Container */
      var t2 = box.parentElement ? labelText(box.parentElement.querySelector('.g-label,label,.fg-lbl')) : '';
      if (t2) return t2;
    }
    return kurz(feld.getAttribute('title') || feld.getAttribute('placeholder') || id);
  }
  function kurz(t) {
    return String(t || '').replace(/\s+/g, ' ').trim()
      .replace(/[\s·—–>→:*]+$/g, '').trim().slice(0, 80);
  }
  function feldEinheit(feld) {
    var box = feld.closest('.fg,.g-field,.g-inp-group,.el-field,.field');
    if (!box) return '';
    var u = box.querySelector('.fg-unit,.g-inp-unit,.inpu,.unit');
    return u ? String(u.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14) : '';
  }

  function zielUebernehmen(feld) {
    var id = feld.id || '';
    if (!id) {
      /* Ohne feste id kann Claude Code das Feld nicht sicher ansprechen.
         Ehrlich melden statt eine unbrauchbare Verknuepfung zu erfassen. */
      meldung('Dieses Feld hat keine feste ID — es wird vom Modul zur Laufzeit erzeugt '
        + '(z.B. eine Tabellenzeile). Solche Felder taugen nicht als Verknüpfungsziel. '
        + 'Bitte ein Feld mit fester Beschriftung wählen.');
      return;
    }
    dialogOeffnen({
      id: 'vk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      nr: naechsteNummer(),
      zielModul: _modulKey,
      zielFeld: id,
      zielWertId: _modulKey + '.' + id,
      zielLabel: feldLabel(feld),
      zielEinheit: feldEinheit(feld),
      quellen: [],
      modus: 'vorschlag',
      hinweis: '',
      status: 'offen',
      neu: true
    });
  }

  /* ═══════════════════════════════════════════════════════════
     Dialog
     ═══════════════════════════════════════════════════════════ */

  function dialogOeffnen(entwurf) {
    _entwurf = entwurf;
    _quellSuche = '';
    if (!_entwurf.quellen.length) _entwurf.quellen.push({ wertId: '', label: '', bedingung: '', umrechnung: '' });
    stilEinbauen();
    if (!el('gvkDlg')) {
      var bg = d.createElement('div');
      bg.id = 'gvkDlg';
      bg.className = 'gvk-dlg-bg';
      bg.addEventListener('click', function (ev) { if (ev.target === bg) dialogSchliessen(); });
      d.body.appendChild(bg);
    }
    dialogZeichnen();
  }
  function dialogSchliessen() {
    _entwurf = null;
    var x = el('gvkDlg');
    if (x) x.remove();
  }

  function dialogZeichnen() {
    var bg = el('gvkDlg');
    if (!bg || !_entwurf) return;
    var e = _entwurf;

    var quellenHtml = e.quellen.map(function (q, i) {
      return '<div class="gvk-qbox">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        + '<span class="gvk-q-nr">' + (i + 1) + '</span>'
        + '<b style="font-size:12.5px;flex:1">Quelle ' + (i + 1) + (e.quellen.length > 1 ? ' von ' + e.quellen.length : '') + '</b>'
        + (e.quellen.length > 1
          ? '<button class="gvk-b klein rot" onclick="GemaVerknuepfung._qWeg(' + i + ')">✕</button>' : '')
        + '</div>'
        + (q.wertId
          ? '<div style="margin-bottom:6px"><b style="font-size:13px">' + esc(quellLabel(q)) + '</b>'
            + '<div><span class="gvk-wid">' + esc(q.wertId) + '</span> '
            + '<button class="gvk-b klein" style="margin-left:4px" onclick="GemaVerknuepfung._qSuchen(' + i + ')">ändern</button></div></div>'
          : '<button class="gvk-b" style="width:100%;margin-bottom:6px" onclick="GemaVerknuepfung._qSuchen(' + i + ')">'
            + '🔍 Wert aus einer anderen Berechnung wählen …</button>')
        + (i === _suchIndex ? sucheHtml() : '')
        + '<label class="gvk-lbl" style="margin-top:6px">Gilt wenn (Bedingung, optional)</label>'
        + '<input class="gvk-inp" value="' + esc(q.bedingung) + '" placeholder="z.B. Anlage für Regenwasser"'
        + ' oninput="GemaVerknuepfung._qSet(' + i + ',\'bedingung\',this.value)">'
        + '<label class="gvk-lbl">Umrechnung (optional)</label>'
        + '<input class="gvk-inp" value="' + esc(q.umrechnung) + '" placeholder="z.B. l/s → m³/h (×3.6)"'
        + ' oninput="GemaVerknuepfung._qSet(' + i + ',\'umrechnung\',this.value)">'
        + '</div>';
    }).join('');

    bg.innerHTML = '<div class="gvk-dlg">'
      + '<div class="gvk-kopf">'
      + '<span class="gvk-nr">' + esc(e.nr) + '</span>'
      + '<b style="flex:1">' + (e.neu ? 'Neue Verknüpfung' : 'Verknüpfung bearbeiten') + '</b>'
      + '<button class="gvk-x" onclick="GemaVerknuepfung._dlgZu()">✕</button>'
      + '</div>'
      + '<div class="gvk-dlg-bd">'

      /* Ziel */
      + '<div style="background:#ecfeff;border:1.5px solid #a5f3fc;border-radius:11px;padding:11px">'
      + '<div class="gvk-hint" style="color:#0e7490;font-weight:800;text-transform:uppercase;font-size:10px;letter-spacing:.5px">Hier soll der Wert erscheinen</div>'
      + '<div style="font-size:14px;font-weight:800;margin-top:3px">' + esc(e.zielLabel || e.zielFeld)
      + (e.zielEinheit ? ' <span class="gvk-hint">[' + esc(e.zielEinheit) + ']</span>' : '') + '</div>'
      + '<div style="margin-top:4px"><span class="gvk-wid">' + esc(e.zielWertId) + '</span></div>'
      + '<div class="gvk-hint" style="margin-top:4px">' + esc(_modulLabel) + '</div>'
      + '</div>'

      /* Quellen */
      + '<label class="gvk-lbl">Woher kommt der Wert?</label>'
      + '<div class="gvk-hint" style="margin-bottom:8px">Mehrere Quellen erfassen, wenn der Planer wählen soll — '
      + 'z.B. Kaltwasser <b>oder</b> Regenwasser. Die Bedingung sagt, wann welche gilt.</div>'
      + quellenHtml
      + '<button class="gvk-b" style="width:100%" onclick="GemaVerknuepfung._qNeu()">＋ Weitere Quelle (Auswahl-Variante)</button>'

      /* Verhalten */
      + '<label class="gvk-lbl">Verhalten im Zielmodul</label>'
      + '<select class="gvk-inp" onchange="GemaVerknuepfung._set(\'modus\',this.value)">'
      + '<option value="vorschlag"' + (e.modus !== 'fest' ? ' selected' : '') + '>Vorschlag — vorbefüllt, Planer kann überschreiben</option>'
      + '<option value="fest"' + (e.modus === 'fest' ? ' selected' : '') + '>Fest — immer aus der Quelle, nicht überschreibbar</option>'
      + '</select>'

      + '<label class="gvk-lbl">Hinweis für die Umsetzung (optional)</label>'
      + '<textarea class="gvk-inp" style="min-height:64px;resize:vertical" placeholder="Fachliche Besonderheit, Sonderfall, Norm-Bezug …"'
      + ' oninput="GemaVerknuepfung._set(\'hinweis\',this.value)">' + esc(e.hinweis) + '</textarea>'

      + (e.neu ? '' :
        '<label class="gvk-lbl">Status</label>'
        + '<select class="gvk-inp" onchange="GemaVerknuepfung._set(\'status\',this.value)">'
        + Object.keys(STATUS).map(function (k) {
          return '<option value="' + k + '"' + (e.status === k ? ' selected' : '') + '>' + STATUS[k].label + '</option>';
        }).join('')
        + '</select>')

      + '</div>'
      + '<div class="gvk-fuss">'
      + '<button class="gvk-b" onclick="GemaVerknuepfung._dlgZu()">Abbrechen</button>'
      + '<span style="flex:1"></span>'
      + '<button class="gvk-b prim" onclick="GemaVerknuepfung._speichern()">✓ Speichern</button>'
      + '</div>'
      + '</div>';
  }

  /* ── Quellen-Suche im Katalog ── */
  function sucheHtml() {
    var k = katalog();
    if (!k) return '<div class="gvk-hint">Werte-Katalog nicht geladen — '
      + '<code>gema_werte_katalog.js</code> fehlt. Erzeugen mit '
      + '<code>node scripts/werte_katalog_gen.mjs</code>.</div>';

    var treffer = k.suche(_quellSuche).filter(function (t) {
      /* Das eigene Modul als Quelle ergibt keinen Sinn */
      return t.modul !== _modulKey;
    }).slice(0, 60);

    return '<input class="gvk-inp" id="gvkSuche" placeholder="Suchen: Volumenstrom, Druck, Härte, Modulname …"'
      + ' value="' + esc(_quellSuche) + '" oninput="GemaVerknuepfung._sucheAendern(this.value)">'
      + '<div class="gvk-treffer">'
      + (treffer.length
        ? treffer.map(function (t) {
          return '<div class="gvk-tr" onclick="GemaVerknuepfung._qNimm(\'' + esc(t.wert.id) + '\')">'
            + '<div class="gvk-tr-m">' + esc(t.modulLabel)
            + (t.wert.art === 'ergebnis' ? ' · Ergebnis' : ' · Eingabe') + '</div>'
            + esc(t.wert.label) + (t.wert.einheit ? ' <span class="gvk-hint">[' + esc(t.wert.einheit) + ']</span>' : '')
            + '</div>';
        }).join('')
        : '<div class="gvk-leer" style="padding:16px">Kein Treffer für «' + esc(_quellSuche) + '»</div>')
      + '</div>'
      + '<div class="gvk-hint" style="margin-top:4px">Ergebniswerte stehen zuoberst — sie sind der typische Fall.</div>';
  }

  /* ═══════════════════════════════════════════════════════════
     Markdown-Export — die Arbeitsanweisung für Claude Code
     ═══════════════════════════════════════════════════════════ */

  function markdown(opts) {
    opts = opts || {};
    var liste = alle().filter(function (v) { return v.status !== 'verworfen' || opts.mitVerworfenen; });
    var k = katalog();
    var heute = new Date().toLocaleDateString('de-CH');

    var zaehl = { offen: 0, umgesetzt: 0, verworfen: 0 };
    alle().forEach(function (v) { zaehl[v.status] = (zaehl[v.status] || 0) + 1; });

    var z = [];
    z.push('# GEMA — Werte-Verknüpfungen zwischen den Berechnungen');
    z.push('');
    z.push('Export vom ' + heute + ' · ' + liste.length + ' Verknüpfungen'
      + ' (offen ' + (zaehl.offen || 0) + ' · umgesetzt ' + (zaehl.umgesetzt || 0)
      + ' · verworfen ' + (zaehl.verworfen || 0) + ')');
    z.push('');
    z.push('## Was hier steht');
    z.push('');
    z.push('Jede Verknüpfung sagt: **im Zielmodul soll das genannte Feld einen Wert aus einer');
    z.push('anderen Berechnung vorgeschlagen bekommen** (GEMA-Kernprinzip «Daten einmal erfassen,');
    z.push('überall verknüpfen»).');
    z.push('');
    z.push('* **Vorschlag** = Feld vorbefüllen, Herkunfts-Chip zeigen, beim Übertippen löst sich');
    z.push('  der Bezug (Muster `sb_saugpumpe` / `sb_druckdispositiv`).');
    z.push('* **Fest** = Wert kommt immer aus der Quelle, Feld gesperrt, Herkunft ausgewiesen.');
    z.push('* **Mehrere Quellen** = der Planer wählt (z.B. Druckerhöhung für Kaltwasser *oder*');
    z.push('  für Regenwasser). Die Spalte «Gilt wenn» sagt, wann welche Quelle greift.');
    z.push('* **Lesekanal** = genau der Aufruf bzw. Speicher-Schlüssel, der den Wert liefert.');
    z.push('  Bei Eingabefeldern ist es der AutoSave-Snapshot des Quellmoduls, dort steht der');
    z.push('  Wert unter seiner Feld-ID.');
    z.push('');
    z.push('Verknüpfungen tragen kurze Nummern (`VK-0007`) — Änderungen bitte darüber ansagen');
    z.push('(«VK-0007 streichen»). Werte tragen sprechende IDs (`modul.feldId`) aus');
    z.push('`gema_werte_katalog.js`.');
    z.push('');

    /* Nach Zielmodul gruppieren */
    var gruppen = {};
    liste.forEach(function (v) { (gruppen[v.zielModul] = gruppen[v.zielModul] || []).push(v); });

    Object.keys(gruppen).sort().forEach(function (mk) {
      var m = k && k.module[mk];
      z.push('---');
      z.push('');
      z.push('## ' + (m ? m.label : mk) + '  `' + mk + '`');
      if (m && m.datei) z.push('');
      if (m && m.datei) z.push('Datei: `' + m.datei + '.html`'
        + (m.autosave ? ' · AutoSave-Snapshot: `gema_' + m.autosave + '__<objektId>`' : ''));
      z.push('');

      gruppen[mk].sort(function (a, b) { return String(a.nr).localeCompare(String(b.nr)); }).forEach(function (v) {
        z.push('### ' + v.nr + ' · Feld «' + (v.zielLabel || v.zielFeld) + '»'
          + (v.zielEinheit ? ' [' + v.zielEinheit + ']' : '') + ' — ' + (STATUS[v.status] || STATUS.offen).label);
        z.push('');
        z.push('* **Ziel-Feld-ID:** `' + v.zielFeld + '`  ·  **Wert-ID:** `' + v.zielWertId + '`');
        z.push('* **Verhalten:** ' + (v.modus === 'fest'
          ? 'Fest — Wert immer aus der Quelle, Feld gesperrt'
          : 'Vorschlag — vorbefüllen, überschreibbar, Bezug löst sich beim Übertippen'));
        if ((v.quellen || []).length > 1) {
          z.push('* **Auswahl:** ' + v.quellen.length + ' Quellen — der Planer entscheidet (siehe «Gilt wenn»)');
        }
        z.push('');
        z.push('| # | Quelle | Wert-ID | Lesekanal | Gilt wenn | Umrechnung |');
        z.push('|---|--------|---------|-----------|-----------|------------|');
        (v.quellen || []).forEach(function (q, i) {
          var t = k && k.byId(q.wertId);
          var wert = t && t.wert;
          var kanal = (wert && (wert.api || wert.quelle)) || '';
          if (kanal && wert && !wert.api) kanal = '`' + kanal + '` → Feld `' + wert.feld + '`';
          else if (kanal) kanal = '`' + kanal + '`';
          z.push('| ' + (i + 1)
            + ' | ' + md(t ? (t.modulLabel + ' · ' + wert.label + (wert.einheit ? ' [' + wert.einheit + ']' : '')) : (q.label || q.wertId))
            + ' | `' + md(q.wertId) + '`'
            + ' | ' + (kanal || '_nicht dokumentiert_')
            + ' | ' + (q.bedingung ? md(q.bedingung) : '—')
            + ' | ' + (q.umrechnung ? md(q.umrechnung) : '—')
            + ' |');
        });
        z.push('');
        if (v.hinweis) {
          z.push('> **Hinweis:** ' + v.hinweis.replace(/\n+/g, ' '));
          z.push('');
        }
        z.push('<sub>erfasst ' + (v.erstelltAm || '').slice(0, 10)
          + (v.erstelltVon && v.erstelltVon.name ? ' von ' + v.erstelltVon.name : '') + '</sub>');
        z.push('');
      });
    });

    if (!liste.length) {
      z.push('---');
      z.push('');
      z.push('_Noch keine Verknüpfungen erfasst._');
      z.push('');
    }

    return z.join('\n');
  }
  /* Pipe und Zeilenumbruch würden die Markdown-Tabelle zerreissen */
  function md(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n+/g, ' '); }

  function exportKopieren() {
    var t = markdown();
    var fertig = function (ok) {
      meldung(ok ? '📋 Markdown kopiert — direkt bei Claude Code einfügen.'
        : 'Kopieren nicht möglich. Nutze «⬇ Export» und öffne die Datei.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { fertig(true); }, function () { fertig(false); });
    } else { fertig(false); }
  }

  function exportDatei() {
    var t = markdown({ mitVerworfenen: true });
    var b = new Blob([t], { type: 'text/markdown;charset=utf-8' });
    var a = d.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'GEMA_Verknuepfungen_' + new Date().toISOString().slice(0, 10) + '.md';
    d.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function meldung(text) {
    if (w.GemaDialog && GemaDialog.alert) { GemaDialog.alert({ title: 'Verknüpfungen', message: text }); return; }
    alert(text);
  }

  /* ═══════════════════════════════════════════════════════════
     Aktionen aus dem Markup
     ═══════════════════════════════════════════════════════════ */

  var api = {
    /* Panel */
    oeffnen: oeffnen,
    schliessen: schliessen,
    zielWaehlen: zielWaehlen,
    zielAbbrechen: zielModusAus,

    bearbeiten: function (id) {
      var v = poolLesen().filter(function (x) { return x && x.id === id; })[0];
      if (!v) return;
      katalogLaden().then(function () {
        dialogOeffnen(JSON.parse(JSON.stringify(v)));
      });
    },
    entfernen: function (id) {
      var v = poolLesen().filter(function (x) { return x && x.id === id; })[0];
      if (!v) return;
      var frage = 'Verknüpfung ' + v.nr + ' wirklich löschen?';
      var weiter = function (ok) { if (!ok) return; loeschen(id); panelZeichnen(false); };
      if (w.GemaDialog && GemaDialog.confirm) {
        GemaDialog.confirm({ title: 'Löschen', message: frage, confirmLabel: 'Löschen', danger: true }).then(weiter);
      } else { weiter(confirm(frage)); }
    },

    /* Dialog */
    _dlgZu: dialogSchliessen,
    _set: function (feld, wert) { if (_entwurf) _entwurf[feld] = wert; },
    _qSet: function (i, feld, wert) { if (_entwurf && _entwurf.quellen[i]) _entwurf.quellen[i][feld] = wert; },
    _qNeu: function () {
      if (!_entwurf) return;
      _entwurf.quellen.push({ wertId: '', label: '', bedingung: '', umrechnung: '' });
      _suchIndex = _entwurf.quellen.length - 1;
      dialogZeichnen();
      setTimeout(function () { var s = el('gvkSuche'); if (s) s.focus(); }, 30);
    },
    _qWeg: function (i) {
      if (!_entwurf) return;
      _entwurf.quellen.splice(i, 1);
      if (_suchIndex >= _entwurf.quellen.length) _suchIndex = -1;
      dialogZeichnen();
    },
    _qSuchen: function (i) {
      _suchIndex = (_suchIndex === i ? -1 : i);
      _quellSuche = '';
      dialogZeichnen();
      setTimeout(function () { var s = el('gvkSuche'); if (s) s.focus(); }, 30);
    },
    _sucheAendern: function (v) {
      _quellSuche = v;
      var box = el('gvkSuche');
      var pos = box ? box.selectionStart : null;
      dialogZeichnen();
      var neu = el('gvkSuche');
      if (neu) { neu.focus(); if (pos != null) { try { neu.setSelectionRange(pos, pos); } catch (e) {} } }
    },
    _qNimm: function (wertId) {
      if (!_entwurf || _suchIndex < 0) return;
      var k = katalog();
      var t = k && k.byId(wertId);
      _entwurf.quellen[_suchIndex].wertId = wertId;
      _entwurf.quellen[_suchIndex].label = t ? (t.modulLabel + ' · ' + t.wert.label) : wertId;
      _entwurf.quellen[_suchIndex].modul = t ? t.modul : '';
      _suchIndex = -1;
      dialogZeichnen();
    },
    _speichern: function () {
      if (!_entwurf) return;
      var e = _entwurf;
      var quellen = (e.quellen || []).filter(function (q) { return q.wertId; });
      if (!quellen.length) { meldung('Bitte mindestens eine Quelle wählen — sonst ist nicht klar, woher der Wert kommen soll.'); return; }
      var u = user();
      var rec = {
        id: e.id, nr: e.nr, orgId: orgId(),
        zielModul: e.zielModul, zielFeld: e.zielFeld, zielWertId: e.zielWertId,
        zielLabel: e.zielLabel, zielEinheit: e.zielEinheit,
        quellen: quellen, modus: e.modus || 'vorschlag',
        hinweis: e.hinweis || '', status: e.status || 'offen',
        erstelltAm: e.erstelltAm || jetzt(),
        erstelltVon: e.erstelltVon || (u ? { userId: u.id, name: u.name || u.username || '' } : null),
        geaendertAm: jetzt()
      };
      sichern(rec);
      dialogSchliessen();
      panelZeichnen(false);
    },

    /* Export */
    exportKopieren: exportKopieren,
    exportDatei: exportDatei,
    markdown: markdown,

    /* Fuer Tests / andere Module */
    alle: alle,
    fuerModul: fuerModul,
    naechsteNummer: naechsteNummer,
    istAdmin: istAdmin,
    modulKey: function () { return _modulKey; }
  };
  w.GemaVerknuepfung = api;

  /* ═══════════════════════════════════════════════════════════
     Start — nur fuer den GEMA-Admin (User-Entscheid 08/2026)
     ═══════════════════════════════════════════════════════════ */

  function start() {
    _modulKey = seiteModulKey();
    _modulLabel = seiteModulLabel();
    if (!istAdmin()) return;      /* kein Knopf, kein Overhead */
    stilEinbauen();
    knopfEinbauen();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();

  /* Die Session kann nach dem ersten Rendern kommen (Cloud-Bootstrap) —
     dann den Knopf nachtragen, statt ihn stumm fehlen zu lassen. */
  w.addEventListener('gema-auth-ready', start);
  setTimeout(start, 1500);

})(window, document);
