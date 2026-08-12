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
 *   3. Quelle waehlen — in ZWEI Schritten (User-Entscheid 12.08.2026):
 *      erst die BERECHNUNG, dann der WERT daraus. Vorerst sind nur die
 *      Sanitaer-Berechnungen waehlbar (sb_/sa_), gewerkuebergreifend kommt
 *      spaeter (ERLAUBTE_KATEGORIEN).
 *      MEHRERE Quellen sind der Normalfall, nicht die Ausnahme — eine
 *      Druckerhoehung wird fuer Kaltwasser ODER fuer Regenwasser ausgelegt;
 *      der Planer waehlt spaeter, welche Quelle gilt (Feld «Gilt wenn»).
 *   4. Speichern → die Verknuepfung bekommt eine kurze Nummer (VK-0007).
 *
 * OBJEKTBEZUG: eine Verknuepfung gilt IMMER innerhalb desselben Projekts —
 * der Wert kommt aus derselben objektId, auf der das Zielmodul rechnet (im
 * Workspace also aus demselben Eimer). Das steckt bereits in jedem Lesekanal
 * des Katalogs («gema_<modul>__<objektId>» bzw. «…(objektId)»); der Export
 * sagt es zusaetzlich ausdruecklich, damit die Umsetzung es nicht raten muss.
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

  /* GEWERK-BESCHRAENKUNG (User-Entscheid 12.08.2026)
     Vorerst NUR Sanitaer: eine Verknuepfung soll erst innerhalb des eigenen
     Gewerks entstehen, gewerkuebergreifend (Heizung/Lueftung/Elektro/
     Brandschutz) kommt spaeter. Die Kategorien vergibt
     scripts/werte_katalog_gen.mjs aus dem Datei-Praefix (sb_ → «Sanitär»,
     sa_ → «Sanitäranlagen») — fuer ein weiteres Gewerk hier ergaenzen, mehr
     braucht es nicht.
     Die Beschraenkung gilt NUR fuer die AUSWAHL. Eine bereits erfasste
     Quelle aus einem anderen Gewerk bleibt sichtbar und wird markiert
     (kein stiller Verlust — Muster der ⚠-Optionen in sys_admin/pm_objekte). */
  var ERLAUBTE_KATEGORIEN = ['Sanitär', 'Sanitäranlagen'];

  var STATUS = {
    offen:     { label: 'offen',     farbe: '#b45309', bg: '#fef3c7' },
    umgesetzt: { label: 'umgesetzt', farbe: '#15803d', bg: '#dcfce7' },
    verworfen: { label: 'verworfen', farbe: '#64748b', bg: '#f1f5f9' }
  };

  var _modulKey = '', _modulLabel = '';
  var _offen = false, _zielModus = false, _katalogGeladen = false, _gebunden = false;
  var _entwurf = null;          /* die Verknuepfung im Dialog */
  var _suchIndex = -1;          /* welche Quelle gerade ihre Auswahl offen hat */
  /* Auswahl in ZWEI Schritten (User-Entscheid 12.08.2026): erst die
     Berechnung, dann der Wert daraus. Eine flache Liste ueber ~1400 Werte
     zwingt zum Raten des richtigen Suchworts; wer verknuepft, weiss zuerst,
     WELCHE Berechnung den Wert liefert. */
  var _suchModul = '';          /* leer = Schritt 1 (Modul), sonst Schritt 2 */
  var _modulSuche = '';         /* Suchtext in Schritt 1 */
  var _quellSuche = '';         /* Suchtext in Schritt 2 */
  /* Mehrfachauswahl der ZIELFELDER (User-Entscheid 12.08.2026): dasselbe
     Vorschlags-Set fuer mehrere Felder auf einmal erfassen. Gespeichert wird
     weiterhin EINE Verknuepfung pro Feld (eigene Nummer) — das Schema und
     damit Export, Karten und Altbestand bleiben unveraendert. */
  var _zielFelder = [];

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
  function neueId() { return 'vk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

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

  /* ── Gewerk-Filter ───────────────────────────────────────────
     waehlbar = erlaubtes Gewerk UND nicht das eigene Modul (der eigene
     Wert als Quelle ergibt keine Verknuepfung). */
  function katErlaubt(kat) { return ERLAUBTE_KATEGORIEN.indexOf(String(kat || '')) >= 0; }

  function modulWaehlbar(mk) {
    var k = katalog();
    var m = k && k.module[mk];
    return !!(m && mk !== _modulKey && katErlaubt(m.kategorie));
  }

  /* Alle waehlbaren Module — Reihenfolge wie ERLAUBTE_KATEGORIEN, darin
     alphabetisch (modulListe sortiert bereits kategorie/label). */
  function waehlbareModule() {
    var k = katalog();
    if (!k) return [];
    return k.modulListe().filter(function (m) {
      return m.key !== _modulKey && katErlaubt(m.kategorie);
    }).sort(function (a, b) {
      var ia = ERLAUBTE_KATEGORIEN.indexOf(a.kategorie), ib = ERLAUBTE_KATEGORIEN.indexOf(b.kategorie);
      return ia - ib || a.label.localeCompare(b.label);
    });
  }

  /* Gewerk eines bereits erfassten Quellwerts — fuer den ⚠-Vermerk an
     Altbestand aus einem (noch) nicht freigegebenen Gewerk. */
  function fremdesGewerk(q) {
    var k = katalog();
    var t = q && q.wertId && k ? k.byId(q.wertId) : null;
    if (!t) return '';                       /* unbekannt → nicht behaupten */
    var m = k.module[t.modul];
    return (m && !katErlaubt(m.kategorie)) ? m.kategorie : '';
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
      /* bereits gewaehltes Zielfeld — deutlich anders als der Hover */
      'html.gvk-zielmodus .gvk-ziel-aktiv{outline:3px solid #0e7490!important;outline-offset:2px;',
      'background:#cffafe!important;box-shadow:0 0 0 4px rgba(14,116,144,.18)!important}',

      /* Feedback-Ebenen ueber unser Werkzeug heben, solange es offen ist.
         gema_feedback.js setzt seine z-index INLINE (9000/9050/9100) — das
         liegt UNTER Panel (11700) und Dialog (11900), der Ausschnitt waere
         nicht aufziehbar. Inline schlaegt Stylesheet, darum !important;
         und nur mit .gvk-auf, damit Feedback sonst unveraendert bleibt.
         Unter GemaDialog (12800) — dessen Meldungen muessen oben bleiben. */
      'html.gvk-auf #gfb-overlay{z-index:12100!important}',
      'html.gvk-auf #gfb-annot{z-index:12150!important}',
      'html.gvk-auf #gfb-modal{z-index:12200!important}',

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
      '.gvk-leer{text-align:center;padding:26px 14px;color:#64748b;font-size:13px;line-height:1.6}',
      /* Zwei-Schritt-Auswahl: Kopfzeile + Kategorie-Trenner in der Liste */
      '.gvk-schritt{display:flex;align-items:center;gap:8px;margin:2px 0 6px;font-size:12px;color:#334155}',
      '.gvk-gruppe{position:sticky;top:0;background:#f1f5f9;color:#475569;font-size:10px;font-weight:800;',
      'text-transform:uppercase;letter-spacing:.5px;padding:5px 10px;border-bottom:1px solid #e0e4ef;z-index:1}',
      '.gvk-warn{margin-top:5px;font-size:11.5px;line-height:1.5;color:#92400e;background:#fef3c7;',
      'border:1px solid #fcd34d;border-radius:7px;padding:5px 8px}'
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
    ebenen();
    Promise.all([binden(), katalogLaden()]).then(function () { if (_offen) panelZeichnen(false); });
  }

  function schliessen() {
    _offen = false;
    zielModusAus();
    var p = el('gvkPanel');
    if (p) p.remove();
    ebenen();
  }

  /* Markiert, dass das Werkzeug offen ist — daran haengt die Anhebung der
     Feedback-Ebenen (siehe Stil). */
  function ebenen() {
    d.documentElement.classList.toggle('gvk-auf', !!(el('gvkPanel') || el('gvkDlg')));
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
      + '<button class="gvk-x" title="Feedback zu dieser Ansicht"'
      + ' style="border-color:#fca5a5;color:#dc2626" onclick="GemaVerknuepfung.feedback()">🔴</button>'
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
        + (fremdesGewerk(q) ? '<div class="gvk-warn">⚠ Gewerk «' + esc(fremdesGewerk(q)) + '» — heute nicht mehr wählbar</div>' : '')
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
    _zielFelder = [];
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
      d.body.appendChild(b);
    }
    zielBarZeichnen();
    d.addEventListener('click', zielKlick, true);
    d.addEventListener('keydown', zielTaste, true);
  }

  function zielModusAus() {
    _zielModus = false;
    _zielFelder = [];
    d.documentElement.classList.remove('gvk-zielmodus');
    markerWeg();
    var pnl = el('gvkPanel');
    if (pnl) pnl.style.display = '';
    var b = el('gvkZielBar');
    if (b) b.remove();
    d.removeEventListener('click', zielKlick, true);
    d.removeEventListener('keydown', zielTaste, true);
  }

  function markerWeg() {
    var n = d.querySelectorAll('.gvk-ziel-aktiv');
    for (var i = 0; i < n.length; i++) n[i].classList.remove('gvk-ziel-aktiv');
  }

  /* Escape bricht ab, Enter uebernimmt die Auswahl — der haeufige Fall ist
     EIN Feld, das soll ohne Mausweg zum Knopf weitergehen. */
  function zielTaste(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); zielModusAus(); return; }
    if (ev.key === 'Enter' && _zielFelder.length) { ev.preventDefault(); ev.stopPropagation(); zielFertig(); }
  }

  function zielKlick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    /* Klicks im Werkzeug selbst nicht abfangen. GemaDialog (.gema-dlg-bg)
       gehoert dazu: der Hinweis «Feld ohne ID» laeuft darueber und waere
       sonst nicht wegklickbar, weil wir hier preventDefault machen. */
    if (t.closest('#gvkPanel, #gvkZielBar, .gvk-dlg-bg, .gema-dlg-bg')) return;
    var feld = t.closest('input,select,textarea');
    ev.preventDefault();
    ev.stopPropagation();
    if (!feld) return;   /* daneben geklickt — Modus bleibt an */
    zielUmschalten(feld);
  }

  /* Mehrfachauswahl (User-Entscheid 12.08.2026): dasselbe Vorschlags-Set
     gilt oft fuer mehrere Felder. Jeder Klick nimmt ein Feld dazu bzw. wieder
     heraus; «Weiter» oeffnet den Dialog fuer ALLE gewaehlten Felder. */
  function zielUmschalten(feld) {
    var id = feld.id || '';
    if (!id) {
      /* Ohne feste id kann Claude Code das Feld nicht sicher ansprechen.
         Ehrlich melden statt eine unbrauchbare Verknuepfung zu erfassen.
         Der Zielmodus bleibt an — die uebrige Auswahl geht nicht verloren. */
      meldung('Dieses Feld hat keine feste ID — es wird vom Modul zur Laufzeit erzeugt '
        + '(z.B. eine Tabellenzeile). Solche Felder taugen nicht als Verknüpfungsziel. '
        + 'Bitte ein Feld mit fester Beschriftung wählen.');
      return;
    }
    var drin = -1;
    _zielFelder.forEach(function (z, i) { if (z.feld === id) drin = i; });
    if (drin >= 0) {
      _zielFelder.splice(drin, 1);
      feld.classList.remove('gvk-ziel-aktiv');
    } else {
      _zielFelder.push({ feld: id, label: feldLabel(feld), einheit: feldEinheit(feld) });
      feld.classList.add('gvk-ziel-aktiv');
    }
    zielBarZeichnen();
  }

  function zielBarZeichnen() {
    var b = el('gvkZielBar');
    if (!b) return;
    var n = _zielFelder.length;
    var namen = _zielFelder.map(function (z) { return z.label || z.feld; });
    b.innerHTML = '<span>' + (n
      ? '<b>' + n + ' Feld' + (n === 1 ? '' : 'er') + '</b> gewählt'
        + '<div style="font-size:11px;font-weight:600;opacity:.9;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
        + esc(namen.join(' · ')) + '</div>'
        + '<div style="font-size:11px;font-weight:600;opacity:.75">Weitere Felder anklicken oder «Weiter»</div>'
      : '👆 Felder anklicken, die den Wert bekommen sollen'
        + '<div style="font-size:11px;font-weight:600;opacity:.75">Mehrere möglich — sie bekommen denselben Vorschlag</div>')
      + '</span>'
      + (n ? '<button class="gvk-b klein" id="gvkZielOk" style="background:#fff;border-color:#fff;color:#0e7490;font-weight:800" '
        + 'onclick="GemaVerknuepfung.zielFertig()">✓ Weiter (' + n + ')</button>' : '')
      + '<button class="gvk-b klein" style="background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.5);color:#fff" '
      + 'onclick="GemaVerknuepfung.zielAbbrechen()">✕ Abbrechen</button>';
  }

  function zielFertig() {
    if (!_zielFelder.length) return;
    var ziele = _zielFelder.map(function (z) {
      return { feld: z.feld, wertId: _modulKey + '.' + z.feld, label: z.label, einheit: z.einheit };
    });
    zielModusAus();
    dialogOeffnen({
      id: neueId(),
      nr: naechsteNummer(),
      zielModul: _modulKey,
      ziele: ziele,
      quellen: [],
      modus: 'vorschlag',
      hinweis: '',
      status: 'offen',
      neu: true
    });
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

  /* ═══════════════════════════════════════════════════════════
     Dialog
     ═══════════════════════════════════════════════════════════ */

  function dialogOeffnen(entwurf) {
    _entwurf = entwurf;
    _suchIndex = -1; _suchModul = ''; _modulSuche = ''; _quellSuche = '';
    /* Ein gespeicherter Datensatz traegt EIN Ziel in flachen Feldern — der
       Dialog rechnet intern immer mit einer Liste. */
    if (!Array.isArray(_entwurf.ziele) || !_entwurf.ziele.length) {
      _entwurf.ziele = [{
        feld: _entwurf.zielFeld,
        wertId: _entwurf.zielWertId || (_entwurf.zielModul + '.' + _entwurf.zielFeld),
        label: _entwurf.zielLabel,
        einheit: _entwurf.zielEinheit
      }];
    }
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
    ebenen();
  }
  function dialogSchliessen() {
    _entwurf = null;
    _suchIndex = -1; _suchModul = ''; _modulSuche = ''; _quellSuche = '';
    var x = el('gvkDlg');
    if (x) x.remove();
    ebenen();
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
            + '<button class="gvk-b klein" style="margin-left:4px" onclick="GemaVerknuepfung._qSuchen(' + i + ')">ändern</button></div>'
            + (fremdesGewerk(q)
              ? '<div class="gvk-warn">⚠ Aus dem Gewerk «' + esc(fremdesGewerk(q)) + '» — bleibt erfasst, '
                + 'wäre heute aber nicht mehr wählbar (vorerst nur Sanitär).</div>' : '')
            + '</div>'
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
      + '<span class="gvk-nr">' + esc(e.ziele.length > 1 ? e.ziele.length + '×' : e.nr) + '</span>'
      + '<b style="flex:1">' + (e.neu
        ? (e.ziele.length > 1 ? 'Neue Verknüpfungen' : 'Neue Verknüpfung') : 'Verknüpfung bearbeiten') + '</b>'
      /* Der Dialog liegt ueber der Navigation — ohne eigenen Knopf gaebe es
         hier keinen Weg zum Feedback (GEMA-Regel: aus JEDER Ansicht). */
      + '<button class="gvk-x" title="Feedback zu dieser Ansicht"'
      + ' style="border-color:#fca5a5;color:#dc2626" onclick="GemaVerknuepfung.feedback()">🔴</button>'
      + '<button class="gvk-x" onclick="GemaVerknuepfung._dlgZu()">✕</button>'
      + '</div>'
      + '<div class="gvk-dlg-bd">'

      /* Ziel(e) */
      + '<div style="background:#ecfeff;border:1.5px solid #a5f3fc;border-radius:11px;padding:11px">'
      + '<div class="gvk-hint" style="color:#0e7490;font-weight:800;text-transform:uppercase;font-size:10px;letter-spacing:.5px">'
      + (e.ziele.length > 1 ? 'Hier sollen die Werte erscheinen · ' + e.ziele.length + ' Felder' : 'Hier soll der Wert erscheinen') + '</div>'
      + e.ziele.map(function (z, i) {
        return '<div style="display:flex;align-items:flex-start;gap:8px;margin-top:' + (i ? 8 : 3) + 'px">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:14px;font-weight:800">' + esc(z.label || z.feld)
          + (z.einheit ? ' <span class="gvk-hint">[' + esc(z.einheit) + ']</span>' : '') + '</div>'
          + '<div style="margin-top:2px"><span class="gvk-wid">' + esc(z.wertId) + '</span></div>'
          + '</div>'
          + (e.ziele.length > 1
            ? '<button class="gvk-b klein rot" title="Dieses Feld nicht verknüpfen"'
              + ' onclick="GemaVerknuepfung._zielWeg(' + i + ')">✕</button>' : '')
          + '</div>';
      }).join('')
      + '<div class="gvk-hint" style="margin-top:6px">' + esc(_modulLabel)
      + (e.ziele.length > 1
        ? ' · es entstehen <b>' + e.ziele.length + ' Verknüpfungen</b> mit denselben Quellen — je eine eigene Nummer' : '')
      + '</div>'
      + '</div>'

      /* Quellen */
      + '<label class="gvk-lbl">Woher kommt der Wert?</label>'
      + '<div class="gvk-hint" style="margin-bottom:8px">Mehrere Quellen erfassen, wenn der Planer wählen soll — '
      + 'z.B. Kaltwasser <b>oder</b> Regenwasser. Die Bedingung sagt, wann welche gilt.<br>'
      + 'Der Wert kommt <b>immer aus demselben Projekt</b> (Objekt/Eimer) — projektübergreifend fliesst nichts.</div>'
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

  /* ── Quellen-Auswahl: erst die Berechnung, dann der Wert ── */
  function sucheHtml() {
    var k = katalog();
    if (!k) return '<div class="gvk-hint">Werte-Katalog nicht geladen — '
      + '<code>gema_werte_katalog.js</code> fehlt. Erzeugen mit '
      + '<code>node scripts/werte_katalog_gen.mjs</code>.</div>';
    return _suchModul ? wertWahlHtml(k) : modulWahlHtml(k);
  }

  /* Schritt 1 — Berechnung waehlen.
     Die Suche greift auf BEIDES: Modulname und die Werte darin. Wer «Permeat»
     tippt, ohne zu wissen, dass das die Osmose ist, findet die Berechnung
     trotzdem — der Suchtext wandert dann in Schritt 2 mit. */
  function modulWahlHtml(k) {
    var s = String(_modulSuche || '').toLowerCase().trim();
    var liste = waehlbareModule().map(function (m) {
      var wt = 0;
      if (s) {
        m.werte.forEach(function (v) {
          if ((v.label + ' ' + v.id + ' ' + (v.einheit || '')).toLowerCase().indexOf(s) >= 0) wt++;
        });
      }
      var name = !s || (m.label + ' ' + m.key + ' ' + m.kategorie).toLowerCase().indexOf(s) >= 0;
      return { m: m, wt: wt, zeigen: name || wt > 0 };
    }).filter(function (x) { return x.zeigen; });

    var zeilen = '', kat = '';
    liste.forEach(function (x) {
      if (x.m.kategorie !== kat) {
        kat = x.m.kategorie;
        zeilen += '<div class="gvk-gruppe">' + esc(kat) + '</div>';
      }
      zeilen += '<div class="gvk-tr" onclick="GemaVerknuepfung._qModul(\'' + esc(x.m.key) + '\')">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<div style="flex:1;min-width:0"><b>' + esc(x.m.label) + '</b>'
        + '<div class="gvk-tr-m">' + x.m.werte.length + ' Werte'
        + (x.wt ? ' · <span style="color:#0e7490">' + x.wt + ' passend</span>' : '')
        + (x.m.datei ? ' · ' + esc(x.m.datei) + '.html' : '') + '</div></div>'
        + '<span class="gvk-hint">›</span></div></div>';
    });

    var gesamt = waehlbareModule().length;
    return '<div class="gvk-schritt"><b>Schritt 1 von 2</b> · Aus welcher Berechnung kommt der Wert?</div>'
      + '<input class="gvk-inp" id="gvkSuche" placeholder="Berechnung oder Wert suchen: Osmose, Volumenstrom, Härte …"'
      + ' value="' + esc(_modulSuche) + '" oninput="GemaVerknuepfung._sucheAendern(this.value)">'
      + '<div class="gvk-treffer">'
      + (zeilen || '<div class="gvk-leer" style="padding:16px">Keine Berechnung für «' + esc(_modulSuche) + '»</div>')
      + '</div>'
      + '<div class="gvk-hint" style="margin-top:4px">'
      + (s ? liste.length + ' von ' + gesamt + ' Berechnungen · ' : gesamt + ' Berechnungen · ')
      + 'Vorerst nur <b>Sanitär</b> — Heizung, Lüftung, Elektro und Brandschutz folgen später.</div>';
  }

  /* Schritt 2 — Wert aus der gewaehlten Berechnung */
  function wertWahlHtml(k) {
    var m = k.module[_suchModul];
    if (!m) { _suchModul = ''; return modulWahlHtml(k); }
    var alleWerte = k.werte(_suchModul);
    var treffer = k.suche(_quellSuche, { modul: _suchModul });

    return '<div class="gvk-schritt">'
      + '<button class="gvk-b klein" onclick="GemaVerknuepfung._qModulZurueck()">‹ andere Berechnung</button>'
      + '<div style="flex:1;min-width:0"><b>' + esc(m.label) + '</b>'
      + '<div class="gvk-tr-m">Schritt 2 von 2 · Wert wählen</div></div></div>'
      + '<input class="gvk-inp" id="gvkSuche" placeholder="Wert suchen in «' + esc(m.label) + '» …"'
      + ' value="' + esc(_quellSuche) + '" oninput="GemaVerknuepfung._sucheAendern(this.value)">'
      + '<div class="gvk-treffer">'
      + (treffer.length
        ? treffer.map(function (t) {
          return '<div class="gvk-tr" onclick="GemaVerknuepfung._qNimm(\'' + esc(t.wert.id) + '\')">'
            + '<div class="gvk-tr-m">' + (t.wert.art === 'ergebnis' ? 'Ergebnis' : 'Eingabe') + '</div>'
            + esc(t.wert.label) + (t.wert.einheit ? ' <span class="gvk-hint">[' + esc(t.wert.einheit) + ']</span>' : '')
            + '</div>';
        }).join('')
        : '<div class="gvk-leer" style="padding:16px">Kein Wert für «' + esc(_quellSuche) + '» in dieser Berechnung</div>')
      + '</div>'
      + '<div class="gvk-hint" style="margin-top:4px">'
      + (_quellSuche ? treffer.length + ' von ' + alleWerte.length + ' Werten · ' : alleWerte.length + ' Werte · ')
      + 'Ergebniswerte stehen zuoberst — sie sind der typische Fall.</div>';
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
    z.push('**Objektbezug (gilt für JEDE Verknüpfung):** der Wert kommt immer aus **demselben');
    z.push('Projekt/Objekt** — genau der `objektId`, auf der das Zielmodul gerade rechnet');
    z.push('(im Workspace also aus demselben Eimer). Das steckt bereits in jedem Lesekanal');
    z.push('(`gema_<modul>__<objektId>` bzw. `…(objektId)`). Liefert das Quellmodul für dieses');
    z.push('Objekt nichts, erscheint **kein** Vorschlag — nie ein Wert aus einem anderen Projekt,');
    z.push('nie ein Standardwert.');
    z.push('');
    z.push('**Gewerk:** erfasst wird vorerst nur innerhalb von **Sanitär** (`sb_` + `sa_`);');
    z.push('gewerkübergreifende Verknüpfungen kommen später.');
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
          var fremd = fremdesGewerk(q);
          z.push('| ' + (i + 1)
            + ' | ' + md(t ? (t.modulLabel + ' · ' + wert.label + (wert.einheit ? ' [' + wert.einheit + ']' : '')) : (q.label || q.wertId))
            + (fremd ? ' ⚠ _Gewerk ' + md(fremd) + '_' : '')
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

  /* Feedback aus dem Werkzeug heraus (GEMA-Regel: aus JEDER Ansicht).
     Der Dialog liegt ueber der Navigation — der Nav-Knopf ist von hier aus
     nicht erreichbar. Der Zielmodus wird vorher beendet: sein Klick-Fang
     (capture + preventDefault) wuerde sonst das Aufziehen des Ausschnitts
     verschlucken. Panel und Dialog bleiben stehen und sind damit IM Bild —
     genau darum geht es beim Feedback zu dieser Ansicht. */
  function feedback() {
    if (_zielModus) zielModusAus();
    if (w.GemaFeedback && GemaFeedback.start) { GemaFeedback.start(); return; }
    meldung('Der Feedback-Helfer ist auf dieser Seite nicht geladen.');
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
    zielFertig: zielFertig,
    feedback: feedback,

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
      _suchModul = ''; _modulSuche = ''; _quellSuche = '';
      dialogZeichnen();
      setTimeout(function () { var s = el('gvkSuche'); if (s) s.focus(); }, 30);
    },
    _qWeg: function (i) {
      if (!_entwurf) return;
      _entwurf.quellen.splice(i, 1);
      if (_suchIndex >= _entwurf.quellen.length) { _suchIndex = -1; _suchModul = ''; }
      dialogZeichnen();
    },
    _qSuchen: function (i) {
      if (_suchIndex === i) { _suchIndex = -1; dialogZeichnen(); return; }
      _suchIndex = i;
      _modulSuche = ''; _quellSuche = '';
      /* Beim «ändern» direkt in der bisherigen Berechnung beginnen — der
         haeufige Fall ist «ein anderer Wert aus derselben Berechnung».
         Stammt die alte Wahl aus einem gesperrten Gewerk, faengt die
         Auswahl regulaer bei Schritt 1 an. */
      var q = _entwurf && _entwurf.quellen[i];
      var k = katalog();
      var t = (q && q.wertId && k) ? k.byId(q.wertId) : null;
      _suchModul = (t && modulWaehlbar(t.modul)) ? t.modul : '';
      dialogZeichnen();
      setTimeout(function () { var s = el('gvkSuche'); if (s) s.focus(); }, 30);
    },
    /* EIN Suchfeld, zwei Schritte — es schreibt in den Suchtext des
       Schritts, der gerade sichtbar ist. */
    _sucheAendern: function (v) {
      if (_suchModul) _quellSuche = v; else _modulSuche = v;
      var box = el('gvkSuche');
      var pos = box ? box.selectionStart : null;
      dialogZeichnen();
      var neu = el('gvkSuche');
      if (neu) { neu.focus(); if (pos != null) { try { neu.setSelectionRange(pos, pos); } catch (e) {} } }
    },
    _qModul: function (mk) {
      if (!modulWaehlbar(mk)) return;   /* fail-closed, auch bei Direktaufruf */
      _suchModul = mk;
      /* Suchtext mitnehmen: wer «Permeat» gesucht und darüber die Osmose
         gefunden hat, sieht den Wert sofort — der Modulname selbst steht im
         Suchraum des Katalogs, «Osmose» zeigt darum weiterhin alles. */
      _quellSuche = _modulSuche;
      dialogZeichnen();
      setTimeout(function () { var s = el('gvkSuche'); if (s) { s.focus(); s.select(); } }, 30);
    },
    _qModulZurueck: function () {
      _suchModul = '';
      dialogZeichnen();
      setTimeout(function () { var s = el('gvkSuche'); if (s) s.focus(); }, 30);
    },
    _qNimm: function (wertId) {
      if (!_entwurf || _suchIndex < 0) return;
      var k = katalog();
      var t = k && k.byId(wertId);
      if (!t || !modulWaehlbar(t.modul)) return;   /* fail-closed */
      _entwurf.quellen[_suchIndex].wertId = wertId;
      _entwurf.quellen[_suchIndex].label = t.modulLabel + ' · ' + t.wert.label;
      _entwurf.quellen[_suchIndex].modul = t.modul;
      _suchIndex = -1;
      _suchModul = ''; _modulSuche = ''; _quellSuche = '';
      dialogZeichnen();
    },
    _zielWeg: function (i) {
      if (!_entwurf || _entwurf.ziele.length <= 1) return;   /* eines muss bleiben */
      _entwurf.ziele.splice(i, 1);
      dialogZeichnen();
    },
    _speichern: function () {
      if (!_entwurf) return;
      var e = _entwurf;
      var quellen = (e.quellen || []).filter(function (q) { return q.wertId; });
      if (!quellen.length) { meldung('Bitte mindestens eine Quelle wählen — sonst ist nicht klar, woher der Wert kommen soll.'); return; }
      if (!e.ziele.length) { meldung('Bitte mindestens ein Zielfeld wählen.'); return; }
      var u = user();
      var vonWem = e.erstelltVon || (u ? { userId: u.id, name: u.name || u.username || '' } : null);
      /* Pro Zielfeld EINE Verknuepfung mit eigener Nummer — das Schema
         bleibt einfeldrig, Export/Karten/Altbestand aendern sich nicht.
         sichern() schreibt den Pool sofort, naechsteNummer() zaehlt darum
         beim naechsten Durchlauf korrekt weiter. */
      e.ziele.forEach(function (z, i) {
        sichern({
          id: i === 0 ? e.id : neueId(),
          nr: i === 0 ? e.nr : naechsteNummer(),
          orgId: orgId(),
          zielModul: e.zielModul, zielFeld: z.feld, zielWertId: z.wertId,
          zielLabel: z.label, zielEinheit: z.einheit,
          /* Tiefe Kopie: sonst teilen sich die Verknuepfungen EIN
             Quellen-Array und ein spaeteres Bearbeiten wuerde alle aendern. */
          quellen: JSON.parse(JSON.stringify(quellen)),
          modus: e.modus || 'vorschlag',
          hinweis: e.hinweis || '', status: e.status || 'offen',
          erstelltAm: e.erstelltAm || jetzt(),
          erstelltVon: vonWem,
          geaendertAm: jetzt()
        });
      });
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
