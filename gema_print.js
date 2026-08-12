/**
 * gema_print.js — A4-Druckansicht für die Berechnungsmodule
 *
 * Löst den Screenshot-PDF-Weg (GemaPDF/html2canvas) in den Berechnungsmodulen
 * ab: statt die Seite abzufotografieren und als Bild in ein PDF zu legen, wird
 * der Inhalt in ein echtes A4-Dokument überführt — scharfer, kopierbarer Text,
 * saubere Seitenumbrüche, und der Nutzer sieht das Ergebnis VOR dem Speichern.
 *
 * Ablauf (Feedback 05.08.2026, Sandro):
 *   PDF-Knopf → Vorschaufenster → «Drucken / Als PDF speichern» oder schliessen.
 * Der frühere separate «Drucken»-Knopf ist damit entfallen — es gibt nur noch
 * EINEN Weg und EIN Ergebnis.
 *
 * LAYOUT NACH KUNDEN-VORLAGE (12.08.2026, «PDF_Export_Vorlage_Schmutz_Partner»):
 *   Der Bericht besteht aus FESTEN A4-Blättern (210×297 mm), die per JS
 *   paginiert werden — nicht mehr aus einem fliessenden Dokument, das erst der
 *   Druckdialog umbricht. Nur so trägt JEDES Blatt die volle Kopfzeile
 *   (Logo links · Projekt + Modul-Titel · Firma/Datum/Bearbeitung rechts,
 *   darunter die Trennlinie in der Firmenfarbe) und die Fusszeile
 *   (Firma · gema-connect.ch · «Seite X / Y») — und die Vorschau zeigt EXAKT
 *   die Seiten, die aus dem Druckdialog kommen.
 *   Die Sektionen erscheinen als nummerierte Karten (01, 02, …); passt eine
 *   Karte nicht auf das Blatt, wird sie GETEILT: der erste Teil endet mit
 *   «Fortsetzung auf der nächsten Seite», auf dem Folgeblatt wiederholt sich
 *   der Kartenkopf (mit «Fortsetzung»-Marke), Tabellen nehmen ihre Kopfzeile
 *   mit. Nichts wird stillschweigend abgeschnitten.
 *
 * Was im Export NICHT erscheint (bewusst):
 *   Hero-Kopf, Norm-Untertitel, Projektleiste (Objekt/Bearbeiter/Datum/SIA),
 *   der «Zugeordnet zu»-Hinweis, sämtliche Knöpfe inkl. der ✕ zum Löschen.
 *
 * Sektionen: die mit Werten kommen aufgeklappt, leere erscheinen nur noch als
 * Titelzeile mit «— keine Angaben» (nichts wird stillschweigend weggelassen —
 * man sieht, dass es sie gibt und dass sie leer sind).
 *
 * Die Vorschau-Leiste hat BEWUSST keinen Feedback-Knopf (User-Entscheid
 * 05.08.2026): die Druckansicht ist ein erzeugtes Dokument — Feedback gehört
 * aufs Modul selbst, wo GemaFeedback samt Snip zur Verfügung steht.
 *
 * API:  GemaPrint.open({title, color}) · GemaPrint.meta()
 */
(function (w, d) {
  'use strict';
  if (w.GemaPrint) return;

  /* ── Farben: Firmenfarbe mit Kontrastschutz (Kanon gema_schaden_pdf) ─────── */
  function hexRgb(h) {
    h = String(h || '').trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lum(c) {
    var a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function kontrast(c) { return (1.05) / (lum(c) + 0.05); }
  function hex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join(''); }
  /** Richtung Schwarz skalieren, bis der Kontrast gegen Weiss reicht — der Ton
      dient als Text AUF Weiss und als Fläche UNTER weisser Schrift. */
  function lesbar(h, ziel) {
    var c = hexRgb(h); if (!c) return null;
    ziel = ziel || 4.5;
    for (var i = 0; i < 24 && kontrast(c) < ziel; i++) c = c.map(function (v) { return v * 0.9; });
    return hex(c);
  }
  function hell(h, anteil) {
    var c = hexRgb(h); if (!c) return '#f1f5f9';
    anteil = anteil == null ? 0.92 : anteil;
    return hex(c.map(function (v) { return v + (255 - v) * anteil; }));
  }
  function marke() {
    var prim = '', org = null;
    try { if (w.GemaAuth) org = GemaAuth.getCurrentOrg(); } catch (e) { }
    try { if (org && org.settings && org.settings.pdfFarben) prim = org.settings.pdfFarben.primary || ''; } catch (e) { }
    if (!prim) {
      /* sonst die Akzentfarbe des Moduls */
      try { prim = getComputedStyle(d.documentElement).getPropertyValue('--accent').trim(); } catch (e) { }
    }
    var acc = lesbar(prim || '#2563eb', 4.5) || '#1d4ed8';
    /* Der Titel steht in einem DUNKLEREN Ton derselben Farbe (Vorlage:
       brand → brand-dark) — gleiche Familie, mehr Gewicht. */
    var dunkel = lesbar(prim || '#2563eb', 7) || acc;
    return { acc: acc, dunkel: dunkel, tint: hell(prim || '#2563eb', 0.93), org: org };
  }

  /* ── Meta: Titel, Eimer, Bearbeiter, Datum, Firma, Kategorie ────────────── */
  function feld(id) { var e = d.getElementById(id); return e ? String(e.value || '').trim() : ''; }

  /** Eimer-Name (User-Entscheid 05.08.2026): der Workspace-Eimer, aus dem das
      Modul geöffnet wurde. Aufgelöst über das zugeordnete Objekt; ohne Eimer
      steht der Objekt-/Projektname da, sonst nichts. */
  function eimerName(objektId) {
    if (objektId) {
      try {
        var pool = JSON.parse(localStorage.getItem('gema_ws_pool_v1') || '[]');
        for (var i = 0; i < pool.length; i++) {
          if (pool[i] && pool[i].objektId === objektId && pool[i].name) return pool[i].name;
        }
      } catch (e) { }
    }
    return '';
  }

  function meta(opts) {
    opts = opts || {};
    var m = { titel: '', eimer: '', bearbeiter: '', datum: '', firma: '', logo: '', adresse: '', kategorie: '' };
    m.titel = opts.title || '';
    if (!m.titel) {
      var h = d.querySelector('.gema-hero-title,.hero-title,.g-hero-title');
      m.titel = h ? h.textContent.trim() : (d.title || 'GEMA').replace(/\s*[–—-]\s*GEMA\s*$/i, '').replace(/^\s*GEMA\s*[–—-]\s*/i, '').trim();
    }
    var obj = null, oid = '';
    try { if (w.GemaObjekte) { obj = GemaObjekte.getActive(); oid = GemaObjekte.getActiveId() || ''; } } catch (e) { }
    m.eimer = eimerName(oid);
    if (!m.eimer && obj) {
      try { m.eimer = GemaObjekte.displayName(obj) || obj.name || ''; } catch (e) { m.eimer = obj.name || ''; }
    }
    m.bearbeiter = feld('metaBearbeiter');
    var dt = feld('metaDatum');
    if (dt) {
      var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dt);
      m.datum = p ? (p[3] + '.' + p[2] + '.' + p[1]) : dt;
    } else {
      var n = new Date();
      m.datum = ('0' + n.getDate()).slice(-2) + '.' + ('0' + (n.getMonth() + 1)).slice(-2) + '.' + n.getFullYear();
    }
    try {
      var org = GemaAuth && GemaAuth.getCurrentOrg();
      if (org) {
        m.firma = org.name || '';
        m.logo = org.logoVector || org.logo || '';
        m.adresse = [org.strasse, [org.plz, org.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      }
    } catch (e) { }
    /* Kategorie-Zeile («Kicker» der Vorlage) aus dem Breadcrumb des Moduls —
       z.B. «Sanitärberechnungen», «Heizung & Wärmeerzeugung». */
    try {
      var bc = d.querySelector('.g-nav-bc a.bc-cat, a.bc-cat');
      m.kategorie = bc ? bc.textContent.trim() : '';
    } catch (e) { }
    return m;
  }

  /* ── Inhalt aufbereiten ─────────────────────────────────────────────────── */
  /* Was im Ausdruck nichts zu suchen hat */
  var WEG = [
    '.g-nav', 'nav', '.gema-hero', '.hero', '.g-hero', '.g-ph',
    '.project-bar', '.pb-row', '.obj-combo-toggle', '.gema-obj-pill', '#gemaObjPill',
    '.no-print', '.gema-feedback-btn', '#gfb-root', '#gToast', '.gsek-cx',
    '.gema-hamburger', '.gema-menu-overlay', '.gema-menu-panel',
    '.footer-bar', '.act-bar', '.toolbar', '.tb-search-toggle',
    '#pwaInstallBanner', '.save-status', '.gema-dlg-bg', '.modal-bg', '.modal-overlay',
    'script', 'link[rel="import"]'
  ].join(',');
  /* Bedienelemente — im Bericht nutzlos, «✕ löschen» sogar irreführend */
  var KNOEPFE = 'button,.g-btn,.btn,.row-del,.del,.x,.close,[role="button"],a.g-nav-btn,input[type="button"],input[type="submit"],input[type="file"],input[type="range"]';

  /* Segmentierte Umschalter: der AKTIVE Knopf TRÄGT den Wert (3/5 grösster LU,
     «Verschlossen/Gelocht», «Einadrig/Mehradrig», Härte-Einheit …). Sie müssen
     VOR dem Knopf-Kahlschlag zu Text werden, sonst löscht KNOEPFE die Angabe
     ersatzlos. NUR echte Bedien-Gruppen listen — `.bseg` (Balken-Segment der
     Reduktions-Charts) und das nackte `.seg` (Kollisionsgefahr) gehören NICHT
     hierher. */
  var SEGMENT = ['.lumax-toggle', '.g-seg-group', '.g-chip-group', '.eh-seg',
    '.bl-seg', '.unit-toggle', '.nb-src-seg', '.sp-seg', '.wpe-seg'].join(',');
  /* Aktiv-Marker der Module: .active (Kanon) · .an (el_belastbarkeit) ·
     .act (hz_waermepumpe) · .on (sb_niederschlag) */
  var AKTIV = '.active,.sel,.is-active,.on,.an,.act,[aria-pressed="true"],[aria-selected="true"]';

  /* Karten-Köpfe/-Rümpfe der vier Karten-Muster des Repos (gema_sektion-Kanon) */
  var HD_SEL = '.gsek-hd,.g-card-hd,.el-card-hd,.g-section-hd,.card-hd';
  var BD_SEL = '.gsek-bd,.g-card-bd,.el-card-bd,.g-section-bd,.card-bd';

  function stempeln() {
    /* Werte auf die LIVE-Elemente stempeln — der Klon trägt property-Werte
       (input.value, selectedIndex, checked) sonst nicht mit. */
    d.querySelectorAll('input,select,textarea').forEach(function (f) {
      /* Versteckte Felder tragen den ZUSTAND der Seite (JSON-Blobs wie
         #zk_rows/#enth_straenge, Einheiten-Merker), nicht eine Angabe des
         Planers — sie gehören nicht in den Bericht. Ohne diese Marke landete
         der rohe JSON als sichtbarer Text im PDF. */
      var versteckt = false;
      try {
        versteckt = f.type === 'hidden' || f.hidden ||
          getComputedStyle(f).display === 'none' || getComputedStyle(f).visibility === 'hidden';
      } catch (e) { versteckt = f.type === 'hidden'; }
      if (versteckt) { f.setAttribute('data-gp-hide', '1'); return; }
      /* Ausrichtung mitnehmen, damit Zahlen im Bericht stehen wie am Bildschirm */
      try { f.setAttribute('data-gp-ta', getComputedStyle(f).textAlign || ''); } catch (e) { }
      if (f.type === 'checkbox' || f.type === 'radio') { f.setAttribute('data-gp-chk', f.checked ? '1' : '0'); return; }
      if (f.tagName === 'SELECT') {
        var o = f.options[f.selectedIndex];
        f.setAttribute('data-gp-val', o ? o.textContent.trim() : '');
        return;
      }
      f.setAttribute('data-gp-val', String(f.value == null ? '' : f.value));
    });
    /* Canvas → Bild (ein geklontes Canvas ist leer) */
    d.querySelectorAll('canvas').forEach(function (c) {
      try { if (c.width && c.height) c.setAttribute('data-gp-img', c.toDataURL('image/png')); } catch (e) { }
    });
    /* Leere Sektionen markieren */
    if (w.GemaSektion) {
      GemaSektion.sektionen().forEach(function (s) {
        s.karte.setAttribute('data-gp-leer', GemaSektion.hatWerte(s) ? '0' : '1');
      });
    }
  }
  function entstempeln() {
    d.querySelectorAll('[data-gp-val],[data-gp-chk],[data-gp-img],[data-gp-leer],[data-gp-hide],[data-gp-ta]').forEach(function (e) {
      e.removeAttribute('data-gp-val'); e.removeAttribute('data-gp-chk');
      e.removeAttribute('data-gp-img'); e.removeAttribute('data-gp-leer');
      e.removeAttribute('data-gp-hide'); e.removeAttribute('data-gp-ta');
    });
  }

  /** Einheiten-Umschalter (l/s ⇄ m³/h, bar ⇄ kPa, mm ⇄ cm): sie stellen nur die
      ANZEIGE um — im Bericht steht die Einheit ohnehin bei jedem Wert, der
      Schalter wäre dort ein toter Knopf.
      Erkennung ohne Modul-Wissen: ein Schalter mit Beschriftung auf BEIDEN
      Seiten ist ein Umschalter zwischen zwei Einheiten; einer mit Text nur auf
      EINER Seite ist eine echte Ja/Nein-Angabe (z.B. «Herleitung anzeigen»)
      und bleibt als ☑/☐ erhalten. */
  function istEinheitenSchalter(wrap) {
    var sw = wrap.querySelector('.g-switch,input[type="checkbox"]');
    if (!sw) return false;
    var vor = '', nach = '', gesehen = false;
    Array.prototype.forEach.call(wrap.childNodes, function (n) {
      if (n === sw || (n.contains && n.contains(sw))) { gesehen = true; return; }
      var t = (n.textContent || '').trim();
      if (!t) return;
      if (gesehen) nach += t; else vor += t;
    });
    return !!vor && !!nach;
  }

  /** Hülsen, die nach dem Entfernen eines Bedienelements leer zurückbleiben
      (die Einheiten-Toolbar der Berechnungsmodule besteht NUR aus Schaltern).
      KRITISCH — nur von den BERÜHRTEN Eltern aus aufräumen, nie generisch
      über den ganzen Klon: leere Divs sind sonst oft Grafik (die farbigen
      `.bseg`-Balken der Reduktions-Charts, Farbpunkte in Legenden) und würden
      mit verschwinden. Eine Toolbar mit Beschriftung + Wert
      (sa_schlammsammler: «Deckel: Verschlossen») bleibt ohnehin — sie hat
      Text. */
  function leereHuelsenWeg(beruehrt) {
    var TAGS = { DIV: 1, SPAN: 1, P: 1, SECTION: 1, LABEL: 1 };
    beruehrt.forEach(function (p) {
      while (p && TAGS[p.tagName] &&
        !(p.textContent || '').trim() &&
        !p.querySelector('img,svg,canvas,table,hr,input,select,textarea,.gp-val,.gp-chk')) {
        var el = p; p = p.parentNode;
        if (el.parentNode) el.parentNode.removeChild(el); else break;
      }
    });
  }

  /** Karten-Nummern wie die Vorlage: ALLE Top-Level-Karten fortlaufend
      01, 02, … — unabhängig von den Schritt-Nummern des Moduls (die zählen am
      Bildschirm pro Arbeitsweg und starten teils mehrfach; im Bericht zählt
      die Lesereihenfolge). Die Bildschirm-Nummern (.gsek-nr) blendet die
      Druck-CSS aus. */
  function nummerieren(klon) {
    var nr = 0;
    klon.querySelectorAll('.g-card,.el-card,.g-section,.card').forEach(function (k) {
      /* nur Top-Level — verschachtelte Karten zählen nicht mit */
      if (k.parentElement && k.parentElement.closest('.g-card,.el-card,.g-section,.card')) return;
      var kopf = null;
      for (var i = 0; i < k.children.length; i++) {
        if (k.children[i].matches(HD_SEL)) { kopf = k.children[i]; break; }
      }
      if (!kopf) return;
      nr++;
      var sp = d.createElement('span');
      sp.className = 'gp-num';
      sp.textContent = (nr < 10 ? '0' : '') + nr;
      kopf.insertBefore(sp, kopf.firstChild);
    });
  }

  function aufbereiten(klon) {
    /* Eltern entfernter Bedienelemente — nur DIESE Hülsen werden am Schluss
       aufgeräumt (siehe leereHuelsenWeg). */
    var beruehrt = [];
    function raus(e) { if (e.parentNode) { beruehrt.push(e.parentNode); e.parentNode.removeChild(e); } }
    /* 1) Chrome raus */
    klon.querySelectorAll(WEG).forEach(function (e) { e.remove(); });
    /* 1a) Segmentierte Umschalter → ihr aktiver Wert als Text.
           MUSS vor Schritt 2 laufen — sonst nimmt der Knopf den Wert mit. */
    klon.querySelectorAll(SEGMENT).forEach(function (g) {
      var a = g.querySelector(AKTIV), sp = d.createElement('span');
      var t = a ? (a.textContent || '').trim() : '';
      sp.className = 'gp-solo gp-val' + (t ? '' : ' leer');
      sp.textContent = t || '—';
      if (g.parentNode) g.parentNode.replaceChild(sp, g);
    });
    /* 1b) Einheiten-Umschalter raus (die Einheit steht bei jedem Wert) */
    klon.querySelectorAll('.g-switch-wrap').forEach(function (e) {
      if (istEinheitenSchalter(e)) raus(e);
    });
    /* 2) Knöpfe raus (inkl. der ✕ zum Löschen) */
    klon.querySelectorAll(KNOEPFE).forEach(function (e) { raus(e); });
    /* 3) Canvas → Bild */
    klon.querySelectorAll('canvas').forEach(function (c) {
      var src = c.getAttribute('data-gp-img');
      if (!src) { c.remove(); return; }
      var img = d.createElement('img');
      img.src = src; img.className = 'gp-canvas';
      img.style.width = '100%'; img.style.height = 'auto';
      c.parentNode.replaceChild(img, c);
    });
    /* 4) Eingaben → statischer Text */
    klon.querySelectorAll('input,select,textarea').forEach(function (f) {
      /* Versteckte Zustands-Felder ersatzlos raus (siehe stempeln) */
      if (f.getAttribute('data-gp-hide') === '1') { f.remove(); return; }
      var sp = d.createElement('span');
      if (f.hasAttribute('data-gp-chk')) {
        sp.className = 'gp-chk';
        sp.textContent = f.getAttribute('data-gp-chk') === '1' ? '☑' : '☐';
      } else {
        var v = f.getAttribute('data-gp-val') || '';
        /* KRITISCH — die Klassen des Feldes MITNEHMEN: die Seite legt darüber
           die Breite fest (.g-inp{width:100%}, Raster-/Tabellen-Regeln). Ein
           nackter Span fällt auf seine Mindestbreite zusammen, der Wert klebt
           dann links neben der Einheiten-Box und ein Teil des Feldes fehlt. */
        sp.className = (f.className ? f.className + ' ' : 'gp-solo ') + 'gp-val' + (v ? '' : ' leer');
        sp.textContent = v || '—';
        var ta = f.getAttribute('data-gp-ta');
        if (ta && ta !== 'start') sp.style.textAlign = ta;
      }
      f.parentNode.replaceChild(sp, f);
    });
    /* 5) Leere Sektionen zuklappen (Kopf bleibt sichtbar) */
    klon.querySelectorAll('[data-gp-leer="1"]').forEach(function (k) {
      k.classList.add('gp-zu');
      var bd = k.querySelector('.gsek-bd,.g-card-bd,.el-card-bd,.g-section-bd');
      if (bd) bd.remove();
    });
    klon.querySelectorAll('[data-gp-leer]').forEach(function (k) { k.removeAttribute('data-gp-leer'); });
    /* 6) Fold-Zustand der Bildschirm-Ansicht aufheben — im Export entscheidet
          allein, ob Werte drinstehen. */
    klon.querySelectorAll('.gsek-zu').forEach(function (k) { k.classList.remove('gsek-zu'); });
    /* 7) Aufgeräumte Reste */
    klon.querySelectorAll('[onclick],[oninput],[onchange]').forEach(function (e) {
      e.removeAttribute('onclick'); e.removeAttribute('oninput'); e.removeAttribute('onchange');
    });
    /* 8) Was durch das Entfernen eines Bedienelements leer wurde */
    leereHuelsenWeg(beruehrt);
    /* 9) Karten-Nummern der Vorlage (01, 02, …) */
    nummerieren(klon);
    return klon;
  }

  /* ── Stile der Seite mitnehmen, damit der Bericht aussieht wie das Modul ── */
  function seitenStile() {
    var out = '';
    d.querySelectorAll('style').forEach(function (s) {
      if (s.id === 'gsek-css') return;           /* Chevron/Fold gehört nicht in den Druck */
      out += s.textContent + '\n';
    });
    return out;
  }
  function stylesheetLinks() {
    var out = '';
    d.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
      if (!l.href) return;
      out += '<link rel="stylesheet" href="' + esc(l.href) + '">';
    });
    return out;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ── Druck-Stylesheet (Layout nach Kunden-Vorlage) ──────────────────────── */
  function druckCss(m, b) {
    return [
      '@page{size:A4 portrait;margin:0}',
      /* Grundschrift — opsz-Kanon gegen das «zu dicke l» (CLAUDE.md) */
      'body{font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;font-optical-sizing:auto;',
      '  font-variation-settings:"opsz" 14;font-size:9.5pt;line-height:1.45;color:#1d2633;background:#fff;margin:0}',
      '*{box-sizing:border-box}',

      /* ── Das A4-Blatt: feste Grösse, Kopf/Inhalt/Fuss absolut positioniert ── */
      '.gp-blatt{width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff}',
      /* Kopfzeile auf JEDEM Blatt: drei Spalten — Logo links, Projekt + Titel
         MITTIG auf dem Blatt (Grid 1fr auto 1fr zentriert die Mittelspalte
         unabhängig von den Seitenbreiten), rechts Firma/Datum/Bearbeitung.
         Die Seitenspalten sind minmax(0,1fr): sie dürfen schrumpfen, ein
         sehr breites Logo bläht die Spalte damit nie auf. */
      '.gp-kopf{position:absolute;top:12mm;left:14mm;right:14mm;height:26mm;',
      '  --gp-kopftext:13.6mm;',                                 /* Höhe von Projektzeile + Titel (10.5pt·1.45 + 2mm + 16.5pt·1.08) */
      '  display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:5mm}',
      /* Logo so HOCH wie der Text daneben (Projektname + Berechnungsname);
         die Breite folgt dem Seitenverhältnis und wird nur von der Spalte
         begrenzt — object-fit:contain verzerrt dabei nie. Das Script misst
         den Textblock nach und setzt die exakte Höhe (auch bei 2-zeiligem
         Titel); der mm-Wert hier gilt, solange es nicht gelaufen ist. */
      '.gp-logo{justify-self:start;height:var(--gp-kopftext);width:auto;max-width:100%;',
      '  object-fit:contain;object-position:left center}',
      '.gp-logo-leer{display:block;height:var(--gp-kopftext)}',
      '.gp-kopf-l{min-width:0;max-width:86mm;text-align:center}',
      '.gp-eimer{color:' + b.acc + ';font-weight:700;font-size:10.5pt;letter-spacing:.01em;margin:0 0 2mm}',
      '.gp-titel{font-size:16.5pt;font-weight:800;line-height:1.08;color:' + b.dunkel + ';margin:0}',
      '.gp-meta{justify-self:end;max-width:55mm;text-align:right;font-size:8.4pt;line-height:1.45;color:#667085}',
      '.gp-meta strong{color:#1d2633;font-weight:700}',
      '.gp-linie{position:absolute;top:40mm;left:14mm;right:14mm;height:.55mm;background:' + b.acc + ';border-radius:2mm}',
      /* Inhaltsbereich mit fester Höhe — die Paginierung füllt ihn blattweise */
      '.gp-body{position:absolute;top:46mm;left:14mm;right:14mm;bottom:20mm;overflow:hidden}',
      /* Fusszeile auf JEDEM Blatt */
      '.gp-fusslinie{position:absolute;left:14mm;right:14mm;bottom:15mm;height:.25mm;background:#cbd5df}',
      '.gp-fuss{position:absolute;left:14mm;right:14mm;bottom:8mm;display:grid;',
      '  grid-template-columns:1fr 1fr 1fr;align-items:center;font-size:7.7pt;color:#667085}',
      '.gp-fuss strong{color:#475467}',
      '.gp-fuss-c{text-align:center;color:#98a2b3}',
      '.gp-fuss-r{text-align:right}',

      /* Kategorie-Zeile («Kicker») auf dem ersten Blatt */
      '.gp-kicker{min-height:11.5mm;border:1px solid #dce3ea;background:#fbfcfd;border-radius:3mm;',
      '  display:flex;align-items:center;padding:2mm 5mm;font-size:9.2pt;font-weight:700;',
      '  letter-spacing:.03em;text-transform:uppercase;margin:0 0 5mm;color:#1d2633}',

      /* ── Sektionen als Karten der Vorlage ── */
      '.gp-body .g-card,.gp-body .el-card,.gp-body .g-section,.gp-body .card{',
      '  border:1px solid #dce3ea!important;border-radius:3mm!important;box-shadow:none!important;',
      '  margin:0 0 4.5mm!important;background:#fff!important;overflow:hidden}',
      '.gp-body .gsek-hd,.gp-body .g-card-hd,.gp-body .el-card-hd,.gp-body .g-section-hd,.gp-body .card-hd{',
      '  display:flex!important;align-items:center;gap:3mm;min-height:9mm;padding:2mm 4mm!important;',
      '  border-bottom:1px solid #dce3ea!important;background:#fcfdfe!important;break-after:avoid;page-break-after:avoid}',
      '.gp-body .gsek-hd h2,.gp-body .gsek-hd h3,.gp-body .g-card-hd h2,.gp-body .g-card-hd h3,',
      '.gp-body .el-card-tt,.gp-body .g-section-title{font-size:10.5pt!important;font-weight:700!important;',
      '  color:#1d2633!important;margin:0!important;flex:1 1 auto;min-width:0}',
      '.gp-body .gsek-bd,.gp-body .g-card-bd,.gp-body .el-card-bd,.gp-body .g-section-bd,.gp-body .card-bd{',
      '  padding:3.5mm 4mm 4mm!important}',
      /* Karten-Nummer der Vorlage; die Bildschirm-Schrittnummern weichen ihr */
      '.gp-num{flex:0 0 auto;min-width:5mm;color:#98a2b3;font-size:8.8pt;font-weight:700}',
      '.gp-body .gsek-nr{display:none!important}',
      /* Fortsetzungs-Mechanik */
      /* absolut am Blatt (nicht im Fluss) — siehe weiterHinweis() */
      '.gp-weiter{position:absolute;left:14mm;right:14mm;bottom:16mm;font-size:7.5pt;color:#98a2b3;text-align:right}',
      '.gp-fortpill{flex:0 0 auto;border:1px solid #cbd5df;border-radius:999px;padding:1mm 3mm;',
      '  font-size:8pt;color:#475467;background:#fff;font-weight:700}',
      /* Leere Sektion: Titelzeile bleibt, Status sagt es (Vorlage: «- keine Angaben») */
      '.gp-zu{opacity:.62}',
      '.gp-zu .gsek-hd::after,.gp-zu .g-card-hd::after,.gp-zu .el-card-hd::after,.gp-zu .g-section-hd::after{',
      '  content:"— keine Angaben";margin-left:auto;font-size:8pt;font-weight:600;color:#98a2b3}',

      /* Werte statt Eingabefeldern — der Span trägt die Klassen des Feldes:
         Breite, Rahmen und Ausrichtung kommen von der Seite (WYSIWYG), hier
         nur noch die Optik. Keine erzwungene Ausrichtung — der Wert steht,
         wo er am Bildschirm steht. */
      '.gp-val{display:inline-block;font-weight:700;color:#1d2633;',
      '  background:#fff!important;box-shadow:none!important;overflow-wrap:break-word}',
      '.gp-val.leer{color:#cbd5e1;font-weight:400}',
      /* Im Raster/Feldverbund die volle Slot-Breite einnehmen — sonst klebt der
         Wert links an der Einheiten-Box und das Feld wirkt abgeschnitten. */
      '.gp-body .g-inp-group>.gp-val,.gp-body td>.gp-val,.gp-body th>.gp-val{width:100%;flex:1 1 auto}',
      /* Feld ohne eigene Klassen: dezente Linie, damit man den Wert als Angabe erkennt */
      '.gp-val.gp-solo{border-bottom:1px solid #cbd5df;min-width:10mm}',
      '.gp-val.gp-solo.leer{border-bottom-style:dotted}',
      '.gp-chk{font-size:11pt;line-height:1}',

      /* ── Tabellen im Vorlagen-Stil: Kopf klein + versal auf sanfter Fläche,
            danach nur feine Zeilenlinien (keine Gitter-Rahmen) ── */
      '.gp-body table{width:100%!important;border-collapse:collapse!important;font-size:8.2pt!important;',
      '  table-layout:auto!important}',
      '.gp-body table th{text-transform:uppercase;letter-spacing:.02em;color:#475467!important;',
      '  font-size:7pt!important;font-weight:700!important;background:#f5f7f9!important;',
      '  border:none!important;border-bottom:1px solid #dce3ea!important;padding:2.2mm 2mm!important}',
      '.gp-body table td{border:none!important;border-bottom:1px solid #edf1f4!important;',
      '  padding:2mm!important;vertical-align:middle;background:transparent!important}',
      '.gp-body table tr:last-child td{border-bottom:none!important}',
      '.gp-body thead{display:table-header-group}',
      '.gp-body tr{break-inside:avoid;page-break-inside:avoid}',
      '.gp-body svg,.gp-body img{max-width:100%!important;height:auto!important}',
      '.gp-body .gp-canvas{break-inside:avoid;page-break-inside:avoid}',
      /* KEIN horizontaler Scrollbalken im Bericht: was am Bildschirm scrollt,
         wird im Druck ganz gezeigt — und die Mindestbreiten, die den Inhalt
         breit halten, gelten hier nicht (gescrollt werden kann auf Papier
         nicht; was nicht passt, verkleinert das Einpass-Script). */
      '.gp-body [style*="overflow"],.gp-body .lu-scroll,.gp-body .ot-wrap,',
      '.gp-body .g-table-wrap,.gp-body .pos-wrap,.gp-body .tbl-wrap{overflow:visible!important;max-height:none!important}',
      '.gp-body table th,.gp-body table td,.gp-body table .gp-val,',
      '.gp-body table select,.gp-body table input{min-width:0!important}',
      /* Schemata tragen eine Mindestbreite, damit sie am Bildschirm im
         Scroll-Rahmen lesbar bleiben — auf Papier hält sie den Bericht breiter
         als das Blatt. */
      '.gp-body svg,.gp-body img,.gp-body .gp-canvas{min-width:0!important}',
      /* KEIN Umbruch mitten im Wort: er drückt die Mindestbreite einer Spalte
         auf EIN Zeichen — die Tabelle verteilt dann so eng, dass «120» als
         1/2/0 untereinander steht. */
      '.gp-body table .gp-val{padding:0 2px;white-space:normal;word-break:normal;overflow-wrap:normal}',
      /* Einpassen: was breiter/höher ist als das Blatt, wird als Ganzes
         verkleinert. Der Rahmen behält die verkleinerte Höhe, damit nichts
         überlappt. */
      '.gp-fit{overflow:visible!important}',
      '.gp-fit>*{transform-origin:left top}',

      /* ── Mess-Container der Paginierung: trägt die .gp-body-Klasse, damit
            alle Inhalts-Regeln beim Messen exakt gelten — liegt aber
            unsichtbar ausserhalb des Blatts. ── */
      '.gp-mess{position:absolute!important;left:-9999px!important;top:0!important;',
      '  right:auto!important;bottom:auto!important;width:182mm!important;height:auto!important;',
      '  overflow:visible!important;visibility:hidden;pointer-events:none}',

      /* ── Bühne (nur Bildschirm): graue Fläche, Blätter mit Schatten ── */
      '@media screen{',
      'body{background:#e9edf1;padding:58px 10px 70px}',
      '.gp-stage{transform-origin:top center}',
      '.gp-blatt{margin:0 auto 10mm;box-shadow:0 3px 24px rgba(15,23,42,.22);border-radius:2px}',
      '}',
      '@media print{',
      'body{background:#fff;padding:0;margin:0}',
      '.gp-stage{transform:none!important}',
      '.gp-blatt{margin:0;box-shadow:none;border-radius:0;page-break-after:always}',
      '.gp-blatt:last-child{page-break-after:auto}',
      '.gp-mess{display:none!important}',
      '.gp-bar{display:none!important}',
      '}',
      /* Roh-Blatt (Fallback, bevor das Paginier-Script gelaufen ist): fliesst */
      '.gp-roh{height:auto;min-height:297mm}',
      '.gp-roh .gp-body{position:static;margin:46mm 14mm 20mm;overflow:visible}',
      '.gp-roh .gp-fusslinie,.gp-roh .gp-fuss{display:none}',

      /* Bedienleiste der Vorschau (nur Bildschirm) */
      '.gp-bar{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;gap:8px;',
      '  padding:8px 12px;background:#0f172a;color:#fff;font-size:12.5px;font-weight:600;',
      '  box-shadow:0 2px 14px rgba(0,0,0,.25)}',
      '.gp-bar .sp{flex:1}',
      '.gp-bar button{font:inherit;font-weight:700;padding:7px 14px;border-radius:8px;border:none;cursor:pointer}',
      '.gp-bar .prim{background:' + b.acc + ';color:#fff}',
      '.gp-bar .sec{background:#334155;color:#fff}'
    ].join('');
  }

  /** Script im Druckfenster: Breiten-Einpassung + Paginierung in A4-Blätter.
      Auf Papier lässt sich nicht scrollen — eine breite Tabelle wäre sonst
      rechts abgeschnitten; erst nimmt die Druck-CSS den Inhalten ihre
      Mindestbreiten, was danach noch über das Blatt hinausragt, wird als
      Ganzes proportional verkleinert. Anschliessend verteilt gemaPaginate den
      Inhalt auf feste Blätter: Karten, die nicht auf das Blatt passen, werden
      geteilt (Kartenkopf wiederholt sich, Tabellen nehmen ihre Kopfzeile mit),
      und jedes Blatt bekommt «Seite X / Y».
      Läuft bei load, kurz danach (Bilder/Schriften) und vor jedem Druck. */
  function paginierScript() {
    return [
      /* ── Breiten-Einpassung (unverändertes Verfahren, jetzt parametrisiert) ── */
      'function gemaFit(wurzel){',
      ' var body=wurzel||document.querySelector(".gp-mess")||document.querySelector(".gp-body"); if(!body) return;',
      ' var max=body.clientWidth; if(!(max>0)) return;',
      /* Zuerst alle früheren Anpassungen zurücknehmen — sonst misst der zweite
         Lauf die bereits verkleinerte Breite und schrumpft weiter. */
      ' body.querySelectorAll(".gp-fit").forEach(function(w){',
      '  if(w.getAttribute("data-gp-hoch")) return;',              /* Höhen-Fit der Paginierung — bleibt */
      '  w.classList.remove("gp-fit"); w.style.height=""; w.firstElementChild&&(w.firstElementChild.style.transform="");});',
      /* Von INNEN nach AUSSEN: zuerst den engsten Block einpassen (die breite
         Tabelle), dann erst grössere. Andersherum würde eine ganze Sektion
         samt Text verkleinert, obwohl nur die Tabelle zu breit ist.
         Umgekehrte Dokumentreihenfolge = Kinder vor ihren Eltern. */
      ' var kand=[body].concat(Array.prototype.slice.call(body.querySelectorAll("*"))).reverse();',
      ' kand.forEach(function(e){',
      '  if(e.closest(".gp-fit")&&e!==body) return;',                    /* schon in einem verkleinerten Block */
      '  var k=e.firstElementChild; if(!k) return;',
      /* Mehrere Kinder: sie kommen in EINEN Rahmen, der als Ganzes verkleinert
         wird. Nur bei block-Containern — in einem Flex-/Grid-Container würde
         ein zusätzlicher Rahmen das Layout verändern. */
      '  if(e.children.length!==1){',
      '   if(e===body||getComputedStyle(e).display!=="block") return;',
      '   if(!(e.scrollWidth>e.clientWidth+2)) return;',
      '   var w=document.createElement("div");',
      '   while(e.firstChild) w.appendChild(e.firstChild);',
      '   e.appendChild(w); k=w;',
      '  }',
      '  var breit=Math.max(k.scrollWidth,k.getBoundingClientRect().width);',
      '  var platz=e.clientWidth||max;',
      '  if(!(breit>platz+2)||!(platz>0)) return;',
      '  var f=platz/breit; if(!(f>0.28&&f<1)) return;',                 /* < 28 % wäre unlesbar — dann lieber lassen */
      '  e.classList.add("gp-fit");',
      '  k.style.transform="scale("+f.toFixed(4)+")";',
      '  e.style.height=Math.ceil(k.getBoundingClientRect().height)+"px";',
      ' });',
      '}',

      /* ── Paginierung in feste A4-Blätter (Layout der Kunden-Vorlage) ── */
      'var GP={flow:null,sig:"",teil:false};',
      'var GP_HD=".gsek-hd,.g-card-hd,.el-card-hd,.g-section-hd,.card-hd";',
      'var GP_BD=".gsek-bd,.g-card-bd,.el-card-bd,.g-section-bd,.card-bd";',
      'function gpKind(el,sel){for(var i=0;i<el.children.length;i++){if(el.children[i].matches(sel))return el.children[i];}return null;}',
      'function gemaPaginate(){',
      ' var stage=document.querySelector(".gp-stage");',
      ' var tplEl=document.getElementById("gpBlattTpl");',
      ' if(!stage||!tplEl) return;',
      ' gemaKopfLogo();',                                        /* auch auf dem Roh-Blatt + im Kein-Neuaufbau-Fall */
      /* Der Fluss-Inhalt kommt EINMAL aus dem Roh-Blatt (Fallback-Ansicht) —
         jeder weitere Lauf baut aus dieser unveränderten Quelle neu auf
         (idempotent; Teilungen des Vorlaufs sammeln sich nie an). */
      ' if(GP.flow==null){var roh=stage.querySelector(".gp-roh .gp-body");GP.flow=roh?roh.innerHTML:"";}',
      ' var mess=document.getElementById("gpMess");',
      ' if(!mess){mess=document.createElement("div");mess.id="gpMess";mess.className="gp-body gp-mess";document.body.appendChild(mess);}',
      ' mess.style.display="";',
      ' mess.innerHTML=GP.flow;',
      ' gemaFit(mess);',
      /* Unverändert? Dann steht die Ansicht schon richtig — kein Neuaufbau
         (die Nachfass-Läufe wegen Schriften/Bildern wären sonst Flackern). */
      ' var sig=mess.scrollHeight+"/"+mess.childElementCount+"/"+GP.flow.length;',
      ' if(sig===GP.sig&&stage.querySelector(".gp-blatt:not(.gp-roh)")){mess.innerHTML="";mess.style.display="none";return;}',
      ' GP.sig=sig;',
      ' var tpl=tplEl.innerHTML;',
      ' stage.innerHTML="";',
      ' var body=null;',
      ' function neuesBlatt(){stage.insertAdjacentHTML("beforeend",tpl);body=stage.lastElementChild.querySelector(".gp-body");}',
      ' function passt(){return body.scrollHeight<=body.clientHeight+2;}',
      ' function leerIst(){',
      '  if(!body.childElementCount) return true;',
      '  return body.childElementCount===1&&body.firstElementChild.classList.contains("gp-kicker");',
      ' }',
      /* Der Hinweis sitzt ABSOLUT in der Zone zwischen Inhalt und Fusslinie —
         im Fluss wäre nach dem randvollen Füllen fast nie mehr Platz für ihn
         (die Lücke ist kleiner als eine Tabellenzeile), er fiele still weg. */
      ' function weiterHinweis(){',
      '  var blatt=body.parentNode;',
      '  if(blatt.querySelector(".gp-weiter")) return;',
      '  var h=document.createElement("div");h.className="gp-weiter";h.textContent="Fortsetzung auf der nächsten Seite";',
      '  blatt.appendChild(h);',
      ' }',
      /* Fortsetzungs-Karte: gleicher Rahmen, gleicher Kopf (samt Nummer),
         dazu die «Fortsetzung»-Marke — wie in der Vorlage wiederholt sich der
         Kartenkopf auf dem Folgeblatt. */
      ' function fortsetzung(karte){',
      '  var f=karte.cloneNode(false);',
      '  var kopf=gpKind(karte,GP_HD);',
      '  if(kopf){var kk=kopf.cloneNode(true);',
      /* Läuft die Karte über 3+ Blätter, trägt der geklonte Kopf die Marke
         der Vorrunde bereits — erst entfernen, sonst steht sie doppelt. */
      '   var alt=kk.querySelector(".gp-fortpill");if(alt)alt.parentNode.removeChild(alt);',
      '   var pill=document.createElement("span");pill.className="gp-fortpill";pill.textContent="Fortsetzung";',
      '   kk.appendChild(pill);f.appendChild(kk);}',
      '  var bd=gpKind(karte,GP_BD);',
      '  f.appendChild(bd?bd.cloneNode(false):document.createElement("div"));',
      '  return f;',
      ' }',
      /* Monolithischer, zu hoher Block (grosses Schema): auf den freien Platz
         einpassen statt abschneiden — kleiner gesetzt ist er noch lesbar,
         abgeschnitten wäre stiller Datenverlust. */
      ' function skaliere(el,container){',
      '  var w=document.createElement("div");w.className="gp-fit";w.setAttribute("data-gp-hoch","1");',
      '  container.appendChild(w);w.appendChild(el);',
      '  var h=el.offsetHeight||1;',
      '  var ueber=body.scrollHeight-body.clientHeight;',
      '  var ziel=h-ueber-6;',
      '  var f=ziel/h;',
      '  if(!(f<1)) return;',
      '  if(f<0.2){f=0.2;try{console.warn("GemaPrint: Block höher als das Blatt — auf 20 % verkleinert");}catch(e){}}',
      '  el.style.transform="scale("+f.toFixed(4)+")";',
      '  w.style.height=Math.ceil(h*f)+"px";w.style.overflow="hidden";',
      ' }',
      /* Liefert die grosse Tabelle NUR, wenn sie im Kind praktisch allein
         steht: das Kind IST die Tabelle, oder eine Ein-Kind-Kette
         (Scroll-Hülle) führt direkt zu ihr. Ein blosses «enthält eine
         Tabelle» reichte nicht — tabelleTeilen klont die Hülle LEER, alles
         NEBEN der Tabelle (die Karten davor im selben Wrapper) verschwand
         stillschweigend aus dem Bericht (vom Drift-Guard gefunden). */
      ' function alsTabelle(k){',
      '  if(k.tagName==="TABLE") return k;',
      '  var n=k;',
      '  while(n.tagName!=="TABLE"&&n.childElementCount===1)n=n.firstElementChild;',
      '  if(n.tagName==="TABLE"&&n.querySelectorAll("tr").length>4) return n;',
      '  return null;',
      ' }',
      /* Tabelle blattweise: der erste Teil bekommt geklonte colgroup + thead
         und so viele Zeilen, wie passen; der REST bleibt im Original (behält
         damit auch eine allfällige Fusszeile/tfoot GENAU EINMAL, am Schluss). */
      ' function tabelleTeilen(container,huelle,tab){',
      '  var zeilen=Array.prototype.slice.call(tab.querySelectorAll("tr")).filter(function(r){return !r.closest("thead")&&!r.closest("tfoot");});',
      '  if(!zeilen.length){skaliere(huelle,container);return null;}',
      /* Trägt die Hülle einen Breiten-Fit aus der Vorlauf-Messung, wird er
         ABGELÖST: die geklonte fixe Höhe + der Transform würden jede
         Teil-Messung verfälschen. Die Teile stehen dann unskaliert — der
         Blatt-Nachlauf (gemaFit je Blatt) passt zu breite Teile wieder ein. */
      '  if(huelle.classList&&huelle.classList.contains("gp-fit")){huelle.classList.remove("gp-fit");huelle.style.height="";}',
      '  if(tab.style&&tab.style.transform)tab.style.transform="";',
      '  var shellTab=tab.cloneNode(false);',
      '  Array.prototype.forEach.call(tab.children,function(c){',
      '   if(c.tagName==="COLGROUP"||c.tagName==="THEAD"||c.tagName==="CAPTION") shellTab.appendChild(c.cloneNode(true));',
      '  });',
      '  var tb=document.createElement("tbody");',
      '  var quelleTb=tab.querySelector("tbody");',
      '  if(quelleTb&&quelleTb.className) tb.className=quelleTb.className;',
      '  shellTab.appendChild(tb);',
      '  var mount=shellTab;',
      '  if(huelle!==tab){mount=huelle.cloneNode(false);mount.appendChild(shellTab);}',
      '  container.appendChild(mount);',
      '  if(!passt()){container.removeChild(mount);skaliere(huelle,container);return null;}',
      '  var i=0;',
      '  for(;i<zeilen.length;i++){',
      '   tb.appendChild(zeilen[i]);',
      /* KRITISCH — die nicht passende Zeile gehört ZURÜCK in die Quelle:
         appendChild hat sie aus dem Original bewegt, ein blosses removeChild
         liesse sie im Nichts hängen — eine verlorene Zeile pro Blattgrenze
         (stiller Datenverlust, vom Drift-Guard gefunden). */
      '   if(!passt()){tb.removeChild(zeilen[i]);',
      '    if(i+1<zeilen.length)zeilen[i+1].parentNode.insertBefore(zeilen[i],zeilen[i+1]);',
      '    else (tab.querySelector("tbody")||tab).appendChild(zeilen[i]);',
      '    break;}',
      '  }',
      '  if(i===0){tb.appendChild(zeilen[0]);i=1;try{console.warn("GemaPrint: Tabellenzeile höher als das Blatt");}catch(e){}}',
      '  if(i>=zeilen.length){',
      /* alle Zeilen umgezogen — nur noch tfoot im Original? Dann mitnehmen.
         Passt sie nicht, geht sie ZURÜCK ins Original (gleiche Falle). */
      '   var tf=tab.querySelector("tfoot");',
      '   if(tf&&passt()){shellTab.appendChild(tf);if(!passt()){shellTab.removeChild(tf);tab.appendChild(tf);}else return null;}',
      '   else if(!tf) return null;',
      '  }',
      '  return huelle;',                                       /* Original = Rest (thead klont der nächste Lauf neu) */
      ' }',
      /* Rumpf-Kinder in einen Karten-Rumpf füllen; liefert die übrigen zurück */
      /* GP.teil sagt dem Aufrufer, ob die Grenze MITTEN in einem Element
         liegt (Tabelle/Karte geteilt → Fortsetzungs-Hinweis) oder sauber
         ZWISCHEN zwei Elementen (kein Hinweis — dort geht nichts weiter). */
      ' function rumpfFuellen(rumpf,kinder){',
      '  GP.teil=false;',
      '  while(kinder.length){',
      '   var k=kinder[0];',
      '   rumpf.appendChild(k);',
      '   if(passt()){kinder.shift();continue;}',
      /* Stil-Messung VOR dem Aushängen — dieselbe Falle wie in platziere */
      '   var kst=stapelt(k);',
      '   rumpf.removeChild(k);',
      '   if(!rumpf.childElementCount){',
      /* Verschachtelte KARTE (Karte in einem Wrapper wie .g-main-grid): mit
         eigenem Kopf teilen — der Tabellen-Weg würde ihr den Kopf nehmen
         (mount klont die Hülle ohne Kinder). Rekursion: derselbe Füll-Weg,
         eine Ebene tiefer. */
      '    var kkopf=gpKind(k,GP_HD),krumpf=gpKind(k,GP_BD);',
      '    if(kkopf&&krumpf&&krumpf.childElementCount){',
      '     rumpf.appendChild(k);',
      '     var kk=Array.prototype.slice.call(krumpf.children);',
      '     kk.forEach(function(c){krumpf.removeChild(c);});',
      '     kk=rumpfFuellen(krumpf,kk);',
      '     if(!kk.length){GP.teil=false;kinder.shift();continue;}',
      '     var fk=fortsetzung(k),fb=gpKind(fk,GP_BD)||fk.lastElementChild;',
      '     kk.forEach(function(c){fb.appendChild(c);});',
      '     kinder[0]=fk;GP.teil=true;return kinder;',
      '    }',
      /* Verschachtelter WRAPPER ohne Kartenkopf (der innere Spalten-Block
         der .g-main-grid): an den Kindergrenzen aufteilen — sonst nähme
         der Tabellen-Weg unten den Wrapper und würfe alles neben der
         Tabelle weg. Fortsetzung = nackte Hülle (kein Kopf, keine Marke);
         GP.teil trägt den Zustand der INNEREN Teilung an den Aufrufer
         weiter (Hinweis nur, wenn wirklich MITTEN in einem Element). */
      '    if(kst&&(k.tagName==="DIV"||k.tagName==="SECTION"||k.tagName==="MAIN")&&k.childElementCount>1){',
      '     rumpf.appendChild(k);',
      '     var wk=Array.prototype.slice.call(k.children);',
      '     wk.forEach(function(c){k.removeChild(c);});',
      '     wk=rumpfFuellen(k,wk);',
      '     if(!wk.length){GP.teil=false;kinder.shift();continue;}',
      '     var wf=k.cloneNode(false);',
      '     wk.forEach(function(c){wf.appendChild(c);});',
      '     kinder[0]=wf;return kinder;',
      '    }',
      '    var tab=alsTabelle(k);',
      '    if(tab){var rest=tabelleTeilen(rumpf,k,tab);',
      '     if(rest){kinder[0]=rest;GP.teil=true;return kinder;}',
      '     kinder.shift();continue;}',
      '    skaliere(k,rumpf);kinder.shift();continue;',
      '   }',
      '   GP.teil=false;return kinder;',
      '  }',
      '  return kinder;',
      ' }',
      /* Karte über mehrere Blätter */
      ' function karteFuellen(karte,rumpf){',
      '  var kinder=Array.prototype.slice.call(rumpf.children);',
      '  kinder.forEach(function(k){rumpf.removeChild(k);});',
      '  body.appendChild(karte);',
      '  if(!passt()){body.removeChild(karte);if(!leerIst())neuesBlatt();body.appendChild(karte);}',
      '  for(;;){',
      '   kinder=rumpfFuellen(rumpf,kinder);',
      '   if(!kinder.length) return;',
      '   weiterHinweis();',
      '   var f=fortsetzung(karte);',
      '   neuesBlatt();body.appendChild(f);',
      '   karte=f;rumpf=gpKind(f,GP_BD)||f.lastElementChild;',
      '  }',
      ' }',
      /* Loser Block-Container (ohne Kartenkopf) über mehrere Blätter */
      ' function containerFuellen(bl){',
      '  var kinder=Array.prototype.slice.call(bl.children);',
      '  kinder.forEach(function(k){bl.removeChild(k);});',
      '  body.appendChild(bl);',
      '  if(!passt()){body.removeChild(bl);if(!leerIst())neuesBlatt();body.appendChild(bl);}',
      '  for(;;){',
      '   kinder=rumpfFuellen(bl,kinder);',
      '   if(!kinder.length) return;',
      /* Grenze ZWISCHEN zwei Karten des Wrappers = kein «Fortsetzung»-Hinweis
         (nichts wird fortgeführt — die nächste Karte beginnt neu). */
      '   if(GP.teil)weiterHinweis();',
      '   var f=bl.cloneNode(false);',
      '   neuesBlatt();body.appendChild(f);',
      '   bl=f;',
      '  }',
      ' }',
      ' function nackteTabelle(tab){',
      '  var offen=tab;',
      '  for(var s=0;s<60&&offen;s++){',
      '   var t=alsTabelle(offen)||offen;',
      '   offen=tabelleTeilen(body,offen,t);',
      '   if(offen){weiterHinweis();neuesBlatt();}',
      '  }',
      ' }',
      /* Stapelt der Container seine Kinder VERTIKAL? Dann lässt er sich an
         den Kindergrenzen aufteilen. Deckt auch .g-main-grid ab (die
         Flex-SPALTE, die in ~30 Modulen ALLE Karten hält) — ohne diesen
         Zweig würde der ganze Modul-Inhalt als EIN Block aufs Blatt
         geschrumpft (vom Drift-Guard gefunden: 52 %). Mehrspaltige
         Grids/Flex-Zeilen bleiben beim Einpassen — sie lassen sich nicht
         eindeutig teilen. */
      ' function stapelt(bl){',
      '  var cs;try{cs=getComputedStyle(bl);}catch(e){return false;}',
      '  if(cs.display==="block") return true;',
      '  if(cs.display==="flex") return cs.flexDirection==="column"&&cs.flexWrap!=="wrap";',
      '  if(cs.display==="grid"){var t=String(cs.gridTemplateColumns||"");return !t||t==="none"||t.indexOf(" ")<0;}',
      '  return false;',
      ' }',
      ' function teile(bl,st){',
      '  var kopf=gpKind(bl,GP_HD),rumpf=gpKind(bl,GP_BD);',
      '  if(kopf&&rumpf){karteFuellen(bl,rumpf);return;}',
      '  if(bl.tagName==="TABLE"){nackteTabelle(bl);return;}',
      '  if((bl.tagName==="DIV"||bl.tagName==="SECTION"||bl.tagName==="MAIN")&&bl.childElementCount>1&&st){',
      '   containerFuellen(bl);return;',
      '  }',
      '  body.appendChild(bl);skaliere2(bl);',
      ' }',
      /* skaliere() erwartet das Element noch NICHT im Ziel — hier ist es schon
         platziert: Wrapper darum herum bauen. */
      ' function skaliere2(bl){',
      '  var p=bl.parentNode;var w=document.createElement("div");w.className="gp-fit";w.setAttribute("data-gp-hoch","1");',
      '  p.replaceChild(w,bl);w.appendChild(bl);',
      '  var h=bl.offsetHeight||1;',
      '  var ueber=body.scrollHeight-body.clientHeight;',
      '  var f=(h-ueber-6)/h;',
      '  if(!(f<1)) return;',
      '  if(f<0.2)f=0.2;',
      '  bl.style.transform="scale("+f.toFixed(4)+")";',
      '  w.style.height=Math.ceil(h*f)+"px";w.style.overflow="hidden";',
      ' }',
      ' function platziere(bl){',
      '  body.appendChild(bl);',
      '  if(passt()) return;',
      /* KRITISCH — Stil-Messung VOR dem Aushängen: getComputedStyle liefert
         an losgelösten Elementen leere Werte, stapelt() wäre immer false und
         jeder Wrapper fiele aufs Ganz-Verkleinern zurück (genau so lief der
         display:block-Zweig der Vorfassung nachweislich NIE). */
      '  var st=stapelt(bl);',
      '  body.removeChild(bl);',
      '  if(!leerIst()){neuesBlatt();return platziere(bl);}',
      '  teile(bl,st);',
      ' }',
      ' neuesBlatt();',
      ' Array.prototype.slice.call(mess.children).forEach(platziere);',
      /* leeres Schluss-Blatt (Randfall nach einer Teilung) entfernen */
      ' var seiten=stage.querySelectorAll(".gp-blatt");',
      ' if(seiten.length>1){var l=seiten[seiten.length-1],lb=l.querySelector(".gp-body");',
      '  if(lb&&!lb.childElementCount){l.parentNode.removeChild(l);seiten=stage.querySelectorAll(".gp-blatt");}}',
      /* Breiten-Nachlauf je Blatt: beim Teilen abgelöste Fits neu anwenden —
         nur Verkleinern, kann nie einen Überlauf ERZEUGEN. */
      ' Array.prototype.forEach.call(seiten,function(s){var bd=s.querySelector(".gp-body");if(bd)gemaFit(bd);});',
      /* Seitenzahlen «Seite X / Y» in die Fusszeile jedes Blatts */
      ' Array.prototype.forEach.call(seiten,function(s,i){',
      '  var z=s.querySelector(".gp-seite");if(z)z.textContent="Seite "+(i+1)+" / "+seiten.length;});',
      ' gemaKopfLogo();',                                        /* frisch gestempelte Blatt-Köpfe */
      ' mess.innerHTML="";mess.style.display="none";',
      ' gemaStageFit();',
      '}',
      /* Das Logo bekommt GENAU die Höhe des Textblocks daneben (Projektname +
         Berechnungsname) — der mm-Wert im CSS deckt den Normalfall ab, hier
         wird nachgemessen (2-zeiliger Titel, andere Schriftgrösse). Keine
         Rückkopplung: die Blatt-Kopfhöhe steht fest (26 mm), das Logo geht
         nie in die Zeilenhöhe ein. */
      'function gemaKopfLogo(){',
      ' var t=document.querySelector(".gp-kopf-l");if(!t)return;',
      ' var h=t.getBoundingClientRect().height;if(!(h>0))return;',
      ' Array.prototype.forEach.call(document.querySelectorAll(".gp-logo,.gp-logo-leer"),function(l){l.style.height=h.toFixed(2)+"px";});',
      '}',
      /* Bühne auf schmale Fenster einpassen (nur Anzeige — die Blätter behalten
         ihre exakte Geometrie; transform ändert keine Layout-Masse). */
      'function gemaStageFit(){',
      ' var st=document.querySelector(".gp-stage");if(!st)return;',
      ' var vb=document.documentElement.clientWidth||window.innerWidth;',
      ' var f=Math.min(1,(vb-16)/794);',                        /* 794 px = 210 mm */
      ' st.style.transform=f<1?"scale("+f.toFixed(4)+")":"";',
      '}',
      /* Mehrfach nachfassen: Bilder und Schriften ändern die Höhen noch.
         Bewusst NICHT nur am load-Ereignis — hängt ein Stylesheet, kommt es
         nie, und der Bericht bliebe unpaginiert. Dank Signatur-Vergleich sind
         Nachfass-Läufe ohne Änderung No-Ops (kein Flackern). */
      'window.addEventListener("load",function(){gemaPaginate();gemaStageFit();});',
      'window.addEventListener("resize",gemaStageFit);',
      'window.addEventListener("beforeprint",gemaPaginate);',
      'if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){gemaPaginate();});}',
      '[80,400,1200,2600].forEach(function(t){setTimeout(gemaPaginate,t);});',
      'gemaPaginate();gemaStageFit();'
    ].join('\n');
  }

  /* ── Öffnen ─────────────────────────────────────────────────────────────── */
  function open(opts) {
    opts = opts || {};
    var m = meta(opts), b = marke();

    /* Fenster SYNCHRON im Klick öffnen — sonst greift der Popup-Blocker */
    var win = w.open('', '_blank');
    if (!win) { alert('Bitte Pop-ups für GEMA erlauben — die Druckansicht öffnet in einem neuen Fenster.'); return; }

    var behaelter = d.querySelector('.g-page') || d.querySelector('main') || d.body;
    var klon;
    try {
      stempeln();
      klon = aufbereiten(behaelter.cloneNode(true));
    } finally {
      entstempeln();
    }

    /* Blatt-Kopf (auf JEDEM Blatt): Logo ZUERST → immer links oben, in jedem
       Bericht an derselben Stelle; Mitte Projekt (Eimer) + Modul-Titel;
       rechts Firma / Datum / Bearbeitung.
       OHNE Logo steht eine leere Spalte — sonst rutschte der Titel im
       Drei-Spalten-Grid in die Logo-Spalte und stünde nicht mehr mittig. */
    var kopf = ''
      + '<header class="gp-kopf">'
      + (m.logo ? '<img class="gp-logo" src="' + esc(m.logo) + '" alt="">' : '<span class="gp-logo-leer"></span>')
      + '<div class="gp-kopf-l">'
      + (m.eimer ? '<div class="gp-eimer">' + esc(m.eimer) + '</div>' : '')
      + '<div class="gp-titel">' + esc(m.titel) + '</div>'
      + '</div>'
      + '<div class="gp-meta">'
      + (m.firma ? '<strong>' + esc(m.firma) + '</strong><br>' : '')
      + esc(m.datum)
      + (m.bearbeiter ? '<br>Bearbeitung: ' + esc(m.bearbeiter) : '')
      + '</div>'
      + '</header>'
      + '<div class="gp-linie"></div>';

    /* Blatt-Fuss (auf JEDEM Blatt): Firma · gema-connect.ch · Seite X / Y */
    var fuss = ''
      + '<div class="gp-fusslinie"></div>'
      + '<footer class="gp-fuss">'
      + '<div><strong>' + esc(m.firma || 'GEMA') + '</strong></div>'
      + '<div class="gp-fuss-c">gema-connect.ch</div>'
      + '<div class="gp-fuss-r gp-seite"></div>'
      + '</footer>';

    /* Kategorie-Zeile («Kicker») nur auf dem ersten Blatt — sie ist Teil des
       Inhaltsflusses und wandert mit der Paginierung nie auf ein Folgeblatt. */
    var kicker = m.kategorie ? '<div class="gp-kicker">' + esc(m.kategorie) + '</div>' : '';

    /* BEWUSST KEIN Feedback-Knopf (User-Entscheid 05.08.2026): die Druckansicht
       ist ein erzeugtes Dokument — Feedback gehört aufs Modul selbst. */
    var bar = ''
      + '<div class="gp-bar no-print">'
      + '<span>Druckansicht — bitte prüfen</span><span class="sp"></span>'
      + '<button class="sec" onclick="window.close()">✕ Schliessen</button>'
      + '<button class="prim" onclick="window.print()">🖨 Drucken / Als PDF speichern</button>'
      + '</div>';

    /* Blatt-Vorlage für die Paginierung (inert im <template>) + Roh-Blatt als
       Fallback: läuft das nachgelegte Script nicht (sehr alter Browser),
       bleibt ein fliessendes, vollständiges Dokument stehen. */
    var blattTpl = '<template id="gpBlattTpl">'
      + '<section class="gp-blatt">' + kopf + '<div class="gp-body"></div>' + fuss + '</section>'
      + '</template>';

    var html = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
      + '<title>' + esc(m.titel + (m.eimer ? ' – ' + m.eimer : '')) + '</title>'
      + '<link rel="preconnect" href="https://fonts.googleapis.com">'
      + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet">'
      /* opsz-Kanon direkt am Fonts-Link (druckCss trägt ihn ebenfalls im
         body-Grundstil): DM Sans ist eine Variable Font — ohne die Text-
         Optische-Grösse wirken schmale Glyphen fett («ll zu dick»); hier
         zusätzlich, damit Link und Kanon beieinanderstehen (Sichtfenster
         des Drift-Guards pdf_opsz_test). */
      + '<style>body{font-optical-sizing:auto;font-variation-settings:"opsz" 14}</style>'
      + stylesheetLinks()
      + '<style>' + seitenStile() + '</style>'
      + '<style>' + druckCss(m, b) + '</style>'
      + '</head><body>'
      + bar
      + blattTpl
      + '<div class="gp-stage">'
      + '<section class="gp-blatt gp-roh">' + kopf
      + '<div class="gp-body">' + kicker + klon.innerHTML + '</div>'
      + fuss + '</section>'
      + '</div>'
      + '</body></html>';

    win.document.open();
    win.document.write(html);
    win.document.close();

    /* KRITISCH — das Script wird NACHGELEGT, nicht mitgeschrieben.
       Ein <script> im geschriebenen HTML wartet auf die noch ladenden
       Stylesheets (Fonts-Link!); bleibt einer hängen, läuft es NIE. Ein
       programmatisch angehängtes Script führt sofort aus, unabhängig davon,
       wie weit der Parser ist. Nebeneffekt: im geschriebenen HTML steht kein
       Script mehr, das etwas Nachfolgendes verschlucken könnte (CLAUDE.md). */
    try {
      var sc = win.document.createElement('script');
      sc.textContent = paginierScript();
      (win.document.body || win.document.documentElement).appendChild(sc);
    } catch (e) { }

    try { win.focus(); } catch (e) { }
    return win;
  }

  w.GemaPrint = { open: open, meta: meta, marke: marke, lesbar: lesbar };
})(window, document);
