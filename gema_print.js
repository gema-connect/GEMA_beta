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
 * Was im Export NICHT erscheint (bewusst):
 *   Hero-Kopf, Norm-Untertitel, Projektleiste (Objekt/Bearbeiter/Datum/SIA),
 *   der «Zugeordnet zu»-Hinweis, sämtliche Knöpfe inkl. der ✕ zum Löschen.
 * Statt dessen steht oben der Modul-Titel und darunter der Eimer-Name.
 *
 * Sektionen: die mit Werten kommen aufgeklappt, leere erscheinen nur noch als
 * Titelzeile (nichts wird stillschweigend weggelassen — man sieht, dass es sie
 * gibt und dass sie leer sind).
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
    return { acc: acc, tint: hell(prim || '#2563eb', 0.93), org: org };
  }

  /* ── Meta: Titel, Eimer, Bearbeiter, Datum, Firma ───────────────────────── */
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
    var m = { titel: '', eimer: '', bearbeiter: '', datum: '', firma: '', logo: '', adresse: '' };
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
  /** Für CSS-content: Anführungszeichen und Backslash escapen */
  function cssStr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

  /* ── Druck-Stylesheet ───────────────────────────────────────────────────── */
  function druckCss(m, b) {
    var laufzeile = cssStr(m.titel + (m.eimer ? ' · ' + m.eimer : ''));
    var fussLinks = cssStr(m.firma || 'GEMA');
    return [
      '@page{size:A4 portrait;margin:16mm 13mm 15mm;',
      '  @top-right{content:"' + laufzeile + '";font-family:"DM Sans",sans-serif;font-size:7.5pt;color:#94a3b8}',
      '  @bottom-left{content:"' + fussLinks + '";font-family:"DM Sans",sans-serif;font-size:7.5pt;color:#94a3b8}',
      '  @bottom-right{content:"Seite " counter(page) " / " counter(pages);font-family:"DM Sans",sans-serif;font-size:7.5pt;color:#94a3b8}}',
      '@page:first{@top-right{content:none}}',
      /* Grundschrift — opsz-Kanon gegen das «zu dicke l» (CLAUDE.md) */
      'body{font-family:"DM Sans",ui-sans-serif,system-ui,sans-serif;font-optical-sizing:auto;',
      '  font-variation-settings:"opsz" 14;font-size:9.5pt;line-height:1.45;color:#000;background:#fff;margin:0}',
      '*{box-sizing:border-box}',
      /* Kopf des Berichts — Logo IMMER links oben und IMMER gleich gross:
         feste Box + object-fit:contain, damit ein breites und ein hohes Logo
         denselben Platz einnehmen und jeder Bericht gleich beginnt. */
      '.gp-kopf{display:flex;align-items:flex-start;gap:10px;border-bottom:2px solid ' + b.acc + ';padding-bottom:9px;margin-bottom:14px}',
      '.gp-kopf-l{flex:1;min-width:0}',
      '.gp-logo{flex:0 0 auto;width:34mm;height:13mm;object-fit:contain;object-position:left center}',
      '.gp-titel{font-size:17pt;font-weight:800;color:' + b.acc + ';line-height:1.15;margin:0}',
      '.gp-eimer{font-size:11pt;font-weight:600;color:#0f172a;margin-top:3px}',
      '.gp-meta{text-align:right;font-size:8pt;color:#475569;flex:0 0 auto;line-height:1.5}',
      /* Sektionen */
      '.gp-body .g-card,.gp-body .el-card,.gp-body .g-section{break-inside:auto;page-break-inside:auto;',
      '  border:1px solid #e2e8f0!important;border-radius:6px!important;box-shadow:none!important;margin:0 0 9px!important;background:#fff!important}',
      '.gp-body .g-card-hd,.gp-body .el-card-hd,.gp-body .g-section-hd{background:' + b.tint + '!important;',
      '  border-bottom:1px solid #e2e8f0!important;padding:6px 10px!important;break-after:avoid;page-break-after:avoid}',
      '.gp-body .g-card-hd h2,.gp-body .g-card-hd h3,.gp-body .el-card-tt{font-size:10.5pt!important;font-weight:800!important;color:#0f172a!important;margin:0!important}',
      '.gp-body .g-card-bd,.gp-body .el-card-bd,.gp-body .g-section-bd{padding:9px 10px!important}',
      '.gp-body .gsek-nr{background:' + b.acc + '!important}',
      '.gp-zu{opacity:.62}',
      '.gp-zu .g-card-hd::after{content:" — keine Angaben";font-size:8pt;font-weight:600;color:#94a3b8}',
      /* Werte statt Eingabefeldern — der Span trägt die Klassen des Feldes:
         Breite, Rahmen und Ausrichtung kommen von der Seite (WYSIWYG), hier
         nur noch die Optik. Keine erzwungene Ausrichtung — der Wert steht,
         wo er am Bildschirm steht. */
      '.gp-val{display:inline-block;font-weight:700;color:#0f172a;',
      '  background:#fff!important;box-shadow:none!important;overflow-wrap:break-word}',
      '.gp-val.leer{color:#cbd5e1;font-weight:400}',
      /* Im Raster/Feldverbund die volle Slot-Breite einnehmen — sonst klebt der
         Wert links an der Einheiten-Box und das Feld wirkt abgeschnitten. */
      '.gp-body .g-inp-group>.gp-val,.gp-body td>.gp-val,.gp-body th>.gp-val{width:100%;flex:1 1 auto}',
      /* Feld ohne eigene Klassen: dezente Linie, damit man den Wert als Angabe erkennt */
      '.gp-val.gp-solo{border-bottom:1px solid #cbd5e1;min-width:10mm}',
      '.gp-val.gp-solo.leer{border-bottom-style:dotted}',
      '.gp-chk{font-size:11pt;line-height:1}',
      /* Tabellen + Schemata */
      '.gp-body table{width:100%!important;border-collapse:collapse!important;font-size:8.5pt!important;',
      '  table-layout:auto!important}',
      '.gp-body table th,.gp-body table td{border:1px solid #e2e8f0!important;padding:3px 5px!important}',
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
      /* Einpassen: was breiter ist als das Blatt, wird als Ganzes verkleinert.
         Der Rahmen behält die verkleinerte Höhe, damit nichts überlappt. */
      '.gp-fit{overflow:visible!important}',
      '.gp-fit>*{transform-origin:left top}',
      /* Bedienleiste der Vorschau (nur Bildschirm) */
      '.gp-bar{position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;gap:8px;',
      '  padding:8px 12px;background:#0f172a;color:#fff;font-size:12.5px;font-weight:600;',
      '  box-shadow:0 2px 14px rgba(0,0,0,.25)}',
      '.gp-bar .sp{flex:1}',
      '.gp-bar button{font:inherit;font-weight:700;padding:7px 14px;border-radius:8px;border:none;cursor:pointer}',
      '.gp-bar .prim{background:' + b.acc + ';color:#fff}',
      '.gp-bar .sec{background:#334155;color:#fff}',
      '.gp-bar .fb{background:#dc2626;color:#fff}',
      '@media print{.gp-bar{display:none!important}}'
    ].join('');
  }

  /** A4-Blatt-Bühne (Muster gema_print_a4.js, hier bewusst INLINE):
      die Berechnungsmodule laden gema_print_a4.js nicht, und der Aufbau des
      Fensters liegt ohnehin komplett in unserer Hand — Bedienleiste ausserhalb
      des Blatts, Kopf und Inhalt darauf. Im Druck fällt die Bühne weg, es
      gelten allein die @page-Regeln. */
  function blattCss() {
    return '@media screen{' +
      'body{background:#e4e8ee;margin:0;padding:58px 10px 70px}' +
      '.gp-blatt{width:210mm;max-width:calc(100vw - 20px);min-height:297mm;margin:0 auto;' +
      '  background:#fff;box-shadow:0 3px 24px rgba(15,23,42,.22);border-radius:2px;' +
      '  padding:16mm 13mm;box-sizing:border-box}' +
      '}' +
      '@media print{body{background:none;margin:0;padding:0}' +
      '.gp-blatt{width:auto;max-width:none;min-height:0;margin:0;background:none;' +
      '  box-shadow:none;border-radius:0;padding:0}}';
  }

  /** Script im Druckfenster: Einpassen.
      Auf Papier lässt sich nicht scrollen — eine breite Tabelle wäre sonst
      rechts abgeschnitten (gemeldet 05.08.2026). Erst nimmt die Druck-CSS den
      Inhalten ihre Mindestbreiten, was den meisten Tabellen schon genügt; was
      danach immer noch über das Blatt hinausragt, wird als Ganzes proportional
      verkleinert — nichts wird weggelassen, nur kleiner gesetzt.
      Läuft bei load, kurz danach (Bilder/Schriften) und vor jedem Druck. */
  function fitScript() {
    return [
      'function gemaFit(){',
      ' var body=document.querySelector(".gp-body"); if(!body) return;',
      ' var max=body.clientWidth; if(!(max>0)) return;',
      /* Zuerst alle früheren Anpassungen zurücknehmen — sonst misst der zweite
         Lauf die bereits verkleinerte Breite und schrumpft weiter. */
      ' body.querySelectorAll(".gp-fit").forEach(function(w){',
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
      /* Mehrfach nachfassen: Bilder und Schriften ändern die Breiten noch.
         Bewusst NICHT nur am load-Ereignis — hängt ein Stylesheet, kommt es
         nie, und der Bericht bliebe ungepasst. */
      'window.addEventListener("load",gemaFit);',
      'window.addEventListener("resize",gemaFit);',
      'window.addEventListener("beforeprint",gemaFit);',
      '[60,300,900,2000].forEach(function(t){setTimeout(gemaFit,t);});',
      'gemaFit();'
    ].join('');
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

    /* Logo ZUERST → immer links oben, in jedem Bericht an derselben Stelle */
    var kopf = ''
      + '<div class="gp-kopf">'
      + (m.logo ? '<img class="gp-logo" src="' + esc(m.logo) + '" alt="">' : '')
      + '<div class="gp-kopf-l">'
      + '<div class="gp-titel">' + esc(m.titel) + '</div>'
      + (m.eimer ? '<div class="gp-eimer">' + esc(m.eimer) + '</div>' : '')
      + '</div>'
      + '<div class="gp-meta">'
      + (m.bearbeiter ? esc(m.bearbeiter) + '<br>' : '')
      + esc(m.datum)
      + (m.firma ? '<br>' + esc(m.firma) : '')
      + '</div>'
      + '</div>';

    /* BEWUSST KEIN Feedback-Knopf (User-Entscheid 05.08.2026): die Druckansicht
       ist ein erzeugtes Dokument — Feedback gehört aufs Modul selbst. */
    var bar = ''
      + '<div class="gp-bar no-print">'
      + '<span>Druckansicht — bitte prüfen</span><span class="sp"></span>'
      + '<button class="sec" onclick="window.close()">✕ Schliessen</button>'
      + '<button class="prim" onclick="window.print()">🖨 Drucken / Als PDF speichern</button>'
      + '</div>';

    var html = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
      + '<title>' + esc(m.titel + (m.eimer ? ' – ' + m.eimer : '')) + '</title>'
      + '<link rel="preconnect" href="https://fonts.googleapis.com">'
      + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet">'
      + stylesheetLinks()
      + '<style>' + seitenStile() + '</style>'
      + '<style>' + druckCss(m, b) + blattCss() + '</style>'
      + '</head><body>'
      + bar
      + '<div class="gp-blatt">' + kopf + '<div class="gp-body">' + klon.innerHTML + '</div></div>'
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
      sc.textContent = fitScript();
      (win.document.body || win.document.documentElement).appendChild(sc);
    } catch (e) { }

    try { win.focus(); } catch (e) { }
    return win;
  }

  w.GemaPrint = { open: open, meta: meta, marke: marke, lesbar: lesbar };
})(window, document);
