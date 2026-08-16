/**
 * gema_sektion.js — Einheitliche ein-/ausklappbare Sektionen für ALLE Module
 *
 * Feedback 05.08.2026 (Sandro), vier Punkte in einem Helfer:
 *  · Einklappbare Sektionen soll es in ALLEN Berechnungen geben.
 *  · Der Pfeil ist deutlicher — ein echter Knopf statt eines blassen ▾.
 *  · Der Pfeil steht IMMER ganz rechts, also NACH allfälligen Bedienelementen
 *    im Kopf; nur so stehen die Pfeile aller Karten sauber untereinander.
 *  · Ist eine Sektion zugeklappt, verschwinden die Bedienelemente ihres Kopfes
 *    mit (sie gehören zum Inhalt, nicht zur Überschrift).
 *  · Sektionsnummern sehen überall gleich aus und tragen die Akzentfarbe des
 *    Moduls.
 *
 * BEWUSST KOOPERATIV statt ersetzend (KRITISCH): 19 Module haben bereits eine
 * eigene Fold-Mechanik, an der Drift-Guards mit ihren Klassennamen hängen
 * (`dd-foldhd`, `hx-fold-cx`, `de-zu`, `gema_el_fold_v1` …). Dieser Helfer
 * REISST DIE NICHT HERAUS, sondern
 *   (a) hebt den vorhandenen Pfeil ans Kopf-Ende und gibt ihm die einheitliche
 *       Knopf-Optik,
 *   (b) markiert jede zugeklappte Sektion zusätzlich mit `gsek-zu` — daran
 *       hängen die gemeinsamen Regeln (Kopf-Knöpfe weg, Druck-Verhalten),
 *       unabhängig davon, WELCHE Mechanik sie zugeklappt hat,
 *   (c) installiert eine EIGENE Fold-Mechanik nur dort, wo es noch keine gibt.
 * Damit greift die neue Optik überall und kein bestehender Test bricht.
 *
 * Der Fold-Zustand ist reine GERÄTE-UI (localStorage pro Seite) und gehört NIE
 * in einen AutoSave-Snapshot.
 *
 * API:  GemaSektion.init() · .sektionen() · .hatWerte(sec) · .setzeAlle(bool)
 *       .zustand() · .wiederherstellen(snapshot) · .sync()
 */
(function (w, d) {
  'use strict';
  if (w.GemaSektion) return;

  var SEITE = (location.pathname.split('/').pop() || 'seite').replace(/\.html?$/, '');
  var KEY = 'gema_fold_' + SEITE + '_v1';

  /* Karten-Muster im Repo: [Karte, Kopf, Rumpf] */
  var MUSTER = [
    ['.g-card', '.g-card-hd', '.g-card-bd'],
    ['.el-card', '.el-card-hd', '.el-card-bd'],
    ['.g-section', '.g-section-hd', '.g-section-bd'],
    ['.card', '.card-hd', '.card-bd']
  ];
  /* Pfeile der modul-eigenen Fold-Mechaniken. NUR innerhalb eines Kopfes
     gesucht — `.zk-cx` (Teilstrecken-Zeile) und andere Zellen-Pfeile dürfen
     NIE als Sektions-Pfeil gelten. */
  var FREMD_CX = '.lu-fold-cx,.hx-fold-cx,.fw-fold-cx,.de-fold-cx,.sp-fold-cx,.sg-fold-cx,' +
    '.dd-fold-cx,.osm-fold-cx,.enth-fold-cx,.du-fold-cx,.dv-fold-cx,.bra-fold-cx,' +
    '.fold-cx,.el-cx,.lb-cx';
  /* Bestehende Sektionsnummer-Klassen der Module (werden eingesammelt) */
  var NR_KLASSEN = '.sp-secnum,.el-secnum,.de-stepnum,.bra-secnum,.lu-stepnum,.sec-num,.secnum,.g-secnum,.g-section-num';
  /* Kreisziffern ①..⑳ am Titelanfang */
  var KREIS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

  function slug(t) {
    return String(t || '').toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  }
  function lies() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function schreibe(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }

  /* ── Styles: zur Laufzeit injiziert, damit sie NACH dem Modul-CSS greifen ── */
  function css() {
    if (d.getElementById('gsek-css')) return;
    var s = d.createElement('style');
    s.id = 'gsek-css';
    s.textContent = [
      /* Kopf trägt den Pfeil rechts → muss ein Flex-Container sein */
      '.gsek-hd{display:flex!important;align-items:center;gap:8px;cursor:pointer;user-select:none}',
      '.gsek-hd > h2,.gsek-hd > h3,.gsek-hd > .el-card-tt,.gsek-hd > .g-section-title,',
      '.gsek-hd > .card-hd-title{flex:1 1 auto;min-width:0}',
      /* Pfeil — deutlich, immer ganz rechts, ÜBERALL IDENTISCH (Feedback
         05.08.2026 Teil 2: «Pfeil grösser» + «Pfeil und Button überall
         gleich»). Der Pfeil wird als CSS-Mask gezeichnet und die Text-/SVG-
         Inhalte des Knopfs ausgeblendet — so sieht auch ein modul-eigener
         Pfeil (dessen Code sein «▾/▸» bei jedem Klick neu setzt) exakt gleich
         aus wie unser eigener Knopf. */
      '.gsek-cx{flex:0 0 auto!important;order:99;margin:0 0 0 auto!important;',
      '  display:inline-flex!important;align-items:center;justify-content:center;',
      '  width:36px;height:36px;min-width:36px;padding:0;border-radius:10px;',
      '  border:1.5px solid var(--border,var(--brd,#e2e8f0));',
      '  background:var(--surface,var(--sur,#fff));color:var(--accent,var(--el,#2563eb))!important;',
      '  cursor:pointer;transition:background .15s,border-color .15s,color .15s;',
      '  font-size:0!important;line-height:0!important;text-align:center}',
      '.gsek-cx > *{display:none!important}',
      '.gsek-cx::before{content:"";display:block;width:18px;height:18px;background:currentColor;',
      '  -webkit-mask:' + MASK + ' center/contain no-repeat;',
      '  mask:' + MASK + ' center/contain no-repeat;',
      '  transition:transform .18s ease}',
      '.gsek-cx.zu::before{transform:rotate(-90deg)}',
      '.gsek-hd:hover .gsek-cx{background:var(--accent,var(--el,#2563eb));',
      '  border-color:var(--accent,var(--el,#2563eb));color:#fff!important}',
      /* Zugeklappt: die Bedienelemente des Kopfes gehen mit dem Inhalt weg */
      '.gsek-zu > .gsek-hd button:not(.gsek-cx),.gsek-zu > .gsek-hd a,',
      '.gsek-zu > .gsek-hd input,.gsek-zu > .gsek-hd select,.gsek-zu > .gsek-hd textarea,',
      '.gsek-zu > .gsek-hd label,.gsek-zu > .gsek-hd .g-btn,.gsek-zu > .gsek-hd .btn{display:none!important}',
      /* … und zwar KOMPLETT: auch Label-Texte/Wrapper wie «Härte-Einheit»
         (Feedback 05.08.2026 Teil 2). sync() markiert jedes Kopf-Kind, das
         weder Titel noch Nummer noch Pfeil ist — CSS allein könnte den
         anonymen Wrapper um den Titel nicht vom Einheiten-Wrapper
         unterscheiden. */
      '.gsek-zu > .gsek-hd > .gsek-hd-weg{display:none!important}',
      '.gsek-zu > .gsek-bd{display:none!important}',
      /* Sektionsnummer — überall identisch, Farbe vom Modul */
      '.gsek-nr{display:inline-flex!important;align-items:center;justify-content:center;',
      '  width:22px!important;height:22px!important;min-width:22px;flex:0 0 auto;',
      '  margin:0 8px 0 0!important;padding:0!important;',
      '  border-radius:7px!important;background:var(--accent,var(--el,#2563eb))!important;',
      '  color:#fff!important;font-family:inherit!important;font-size:11.5px!important;',
      '  font-weight:900!important;line-height:1!important;vertical-align:middle;letter-spacing:0}',
      /* Mehrstellige Kapitel-Nummern («3.1» — sb_warmwasser-Muster, Feedback
         15.08.2026 #20/#32): der Chip wächst mit dem Inhalt, bleibt sonst
         formgleich. Eigene Modifier-Klasse, damit einstellige Chips exakt
         wie bisher aussehen. */
      '.gsek-nr--lang{width:auto!important;padding:0 6px!important}',
      /* Im Ausdruck: alles offen, Pfeil und Kopf-Knöpfe weg */
      '@media print{.gsek-zu > .gsek-bd{display:block!important}',
      '  .gsek-cx{display:none!important}',
      '  .gsek-hd button,.gsek-hd .g-btn,.gsek-hd .btn{display:none!important}}'
    ].join('');
    d.head.appendChild(s);
  }

  /* Der EINE Pfeil (Chevron nach unten) als URL-codierte SVG-Maske — gefärbt
     über currentColor des Knopfs, gedreht über die .zu-Klasse. */
  var MASK = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' ' +
    'viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'black\' stroke-width=\'3.4\' ' +
    'stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")';

  /* ── Sektionsnummer vereinheitlichen ───────────────────────────────────── */
  function nummerNormieren(hd, titel) {
    var vorhanden = (titel && titel.querySelector(NR_KLASSEN)) || hd.querySelector(NR_KLASSEN);
    if (vorhanden) {
      vorhanden.classList.add('gsek-nr');
      /* Inline-Styles der Module würden die einheitliche Form aushebeln */
      vorhanden.removeAttribute('style');
      return true;
    }
    if (!titel) return false;
    /* Kreisziffer am Anfang → echter Nummern-Chip */
    var kn = titel.firstChild;
    while (kn && kn.nodeType === 3 && !kn.nodeValue.trim()) kn = kn.nextSibling;
    if (kn && kn.nodeType === 3) {
      var m = /^\s*([①-⑳])[.\s]*/.exec(kn.nodeValue);
      if (m) {
        var sp = d.createElement('span');
        sp.className = 'gsek-nr';
        sp.textContent = String(KREIS.indexOf(m[1]) + 1);
        kn.nodeValue = kn.nodeValue.slice(m[0].length);
        titel.insertBefore(sp, titel.firstChild);
        return true;
      }
      /* «1.1» / «4.3» als Klartext am Titelanfang (sb_warmwasser-Kapitel,
         Feedback 15.08.2026 #20/#32) — VOR dem Einzel-Nummern-Muster prüfen,
         der Chip trägt die volle Kapitel-Nummer. */
      var mK = /^\s*(\d{1,2}\.\d{1,2})\s+/.exec(kn.nodeValue);
      if (mK) {
        var spK = d.createElement('span');
        spK.className = 'gsek-nr gsek-nr--lang';
        spK.textContent = mK[1];
        kn.nodeValue = kn.nodeValue.slice(mK[0].length);
        titel.insertBefore(spK, titel.firstChild);
        return true;
      }
      /* «1.» / «2.» als Klartext am Titelanfang (sb_druckerhoehung-Muster) */
      var m2 = /^\s*(\d{1,2})\.\s+/.exec(kn.nodeValue);
      if (m2) {
        var sp2 = d.createElement('span');
        sp2.className = 'gsek-nr';
        sp2.textContent = m2[1];
        kn.nodeValue = kn.nodeValue.slice(m2[0].length);
        titel.insertBefore(sp2, titel.firstChild);
        return true;
      }
    }
    return false;
  }

  /* ── Sektionen einsammeln ──────────────────────────────────────────────── */
  var _secs = [];
  function sektionen() { return _secs.slice(); }

  function titelVon(hd) {
    return hd.querySelector('h2') || hd.querySelector('h3') || hd.querySelector('.el-card-tt') ||
      hd.querySelector('.g-section-title') || hd.querySelector('.card-hd-title') ||
      hd.querySelector('.section-title');
  }

  /* KRITISCH: `gsek-zu` ist UNSER Marker — er darf hier nur bei EIGENEN
     Sektionen zählen. Bei fremden Mechaniken wäre er eine Rückkopplung:
     sync() setzt ihn, istOffen() läse ihn, und die Sektion käme nie wieder
     auf (genau dieser Fehler liess lt_hx_diagramm zugeklappt hängen). */
  function istOffen(sec) {
    if (sec.eigen) return !sec.karte.classList.contains('gsek-zu');
    if (sec.bd.style.display === 'none') return false;
    /* Die modul-eigenen «zu»-Klassen sitzen auf der Karte */
    if (/(^|\s)(sp|de|du|fw|osm|enth|bra|zk)-zu(\s|$)/.test(sec.karte.className)) return false;
    if (sec.karte.classList.contains('zu')) return false;   /* el_*-Muster */
    /* Sonst messen — dafür unseren eigenen Marker kurz beiseitelegen */
    var hatte = sec.karte.classList.contains('gsek-zu');
    if (hatte) sec.karte.classList.remove('gsek-zu');
    var offen = getComputedStyle(sec.bd).display !== 'none';
    if (hatte) sec.karte.classList.add('gsek-zu');
    return offen;
  }

  /* Kopf-Kinder klassifizieren: alles, was weder Titel(-Wrapper) noch Nummer
     noch Pfeil ist, gehört zum INHALT des Kopfes (Einheiten-Umschalter,
     Label-Texte …) und verschwindet zugeklappt mit (Feedback 05.08.2026:
     «wenn zugeklappt auch solche Texte entfernen, überall»). Per CSS allein
     ginge das nicht — der Titel sitzt oft in einem anonymen Wrapper-<div>,
     das sich von einem Kontroll-Wrapper nicht per Selektor unterscheiden
     lässt. */
  function kopfKinderMarkieren(sec) {
    var kids = sec.hd.children, i, k, bleibt;
    for (i = 0; i < kids.length; i++) {
      k = kids[i];
      bleibt = (k === sec.cx) ||
        (sec.titel && (k === sec.titel || k.contains(sec.titel))) ||
        k.classList.contains('gsek-nr') ||
        (k.matches && k.matches(NR_KLASSEN)) ||
        !!k.querySelector('.gsek-nr');
      k.classList.toggle('gsek-hd-weg', !bleibt);
    }
  }

  /* `gsek-zu` nachziehen — egal WELCHE Mechanik die Sektion zugeklappt hat.
     Daran hängen die gemeinsamen Regeln (Kopf-Knöpfe weg, Druck). */
  function sync() {
    _secs.forEach(function (sec) {
      var offen = istOffen(sec);
      sec.karte.classList.toggle('gsek-zu', !offen);
      kopfKinderMarkieren(sec);
      if (sec.cx) {
        sec.cx.classList.toggle('zu', !offen);
        sec.cx.setAttribute('aria-expanded', offen ? 'true' : 'false');
        sec.cx.title = offen ? 'Sektion einklappen' : 'Sektion aufklappen';
      }
    });
  }

  function anwenden(sec, offen) {
    if (sec.eigen) {
      sec.karte.classList.toggle('gsek-zu', !offen);
      if (offen && sec.bd.style.display === 'none') sec.bd.style.display = '';
    } else if (istOffen(sec) !== !!offen) {
      /* Fremde Mechanik: über ihren eigenen Weg schalten (Klick auf den Pfeil),
         damit ihr localStorage-Zustand stimmig bleibt. */
      klickeFremd(sec);
    }
    sync();
  }

  function klickeFremd(sec) {
    var ziel = sec.cx || sec.hd;
    try { ziel.click(); } catch (e) { }
  }

  function init() {
    css();
    var st = lies();
    var nummern = !!w.GEMA_SEKTION_NUMMERN, nr = 0;
    MUSTER.forEach(function (m) {
      d.querySelectorAll(m[0]).forEach(function (karte) {
        if (karte.__gsek) return;
        var hd = karte.querySelector(':scope > ' + m[1]);
        var bd = karte.querySelector(':scope > ' + m[2]);
        if (!hd || !bd) return;
        var t = titelVon(hd);
        if (!t) return;
        var k = slug(t.textContent);
        if (!k) return;
        karte.__gsek = true;

        hd.classList.add('gsek-hd');
        bd.classList.add('gsek-bd');
        nummerNormieren(hd, t);
        if (nummern) {
          nr++;
          if (!hd.querySelector('.gsek-nr')) {
            var num = d.createElement('span');
            num.className = 'gsek-nr'; num.textContent = String(nr);
            t.insertBefore(num, t.firstChild);
          }
        }

        /* Hat das Modul schon einen Pfeil? Dann übernehmen wir NUR die Optik
           und die Position — die Mechanik bleibt beim Modul. */
        var fremd = hd.querySelector(FREMD_CX);
        var sec;
        if (fremd) {
          fremd.classList.add('gsek-cx');
          fremd.removeAttribute('style');
          hd.appendChild(fremd);          /* ans Kopf-Ende = ganz rechts */
          sec = { karte: karte, hd: hd, bd: bd, titel: t, key: k, cx: fremd, eigen: false };
        } else {
          var cx = d.createElement('button');
          cx.type = 'button';
          cx.className = 'gsek-cx no-print';
          cx.setAttribute('aria-label', 'Sektion ein-/aufklappen');
          hd.appendChild(cx);
          sec = { karte: karte, hd: hd, bd: bd, titel: t, key: k, cx: cx, eigen: true };
          var offen = (k in st) ? !!st[k] : true;   /* Default: offen */
          sec.karte.classList.toggle('gsek-zu', !offen);
          hd.addEventListener('click', function (e) {
            if (e.target.closest('input,select,textarea')) return;
            if (e.target.closest('button,a') && !e.target.closest('.gsek-cx')) return;
            umschalten(sec);
          });
        }
        _secs.push(sec);
      });
    });
    /* Module mit eigenem Karten-Aufbau (z.B. sb_du_zusammenstellung: .tbl-card,
       .formula-card, .kpi-card mit je eigenem Rumpf) fallen durch das Raster
       oben. Ihre Fold-Mechanik bleibt unangetastet — aber der PFEIL bekommt
       dieselbe Optik und Position, damit die Pfeile überall gleich aussehen
       und untereinander stehen. */
    d.querySelectorAll(FREMD_CX).forEach(function (cx) {
      if (cx.classList.contains('gsek-cx')) return;
      var hd = cx.parentElement;
      while (hd && hd !== d.body && !/-hd$|-head$|hd$/.test(hd.className || '') &&
        !/^H[1-6]$/.test(hd.tagName)) hd = hd.parentElement;
      if (!hd || hd === d.body) hd = cx.parentElement;
      /* Sitzt der Pfeil in einer Überschrift, gehört er in deren Kopf */
      if (/^H[1-6]$/.test(hd.tagName) && hd.parentElement) hd = hd.parentElement;
      if (!hd) return;
      cx.classList.add('gsek-cx');
      cx.removeAttribute('style');
      hd.classList.add('gsek-hd');
      hd.appendChild(cx);
    });
    sync();
    /* Fremde Mechaniken schalten in ihrem eigenen Klick-Handler; unser Sync
       läuft danach (Bubble-Phase + Tick), damit `gsek-zu` immer stimmt. */
    if (!d.__gsekClick) {
      d.__gsekClick = true;
      d.addEventListener('click', function (e) {
        if (!e.target.closest('.gsek-hd,.gsek-cx')) return;
        setTimeout(sync, 0);
      });
    }
  }

  function umschalten(sec) {
    if (!sec.eigen) { klickeFremd(sec); setTimeout(sync, 0); return; }
    var s = lies();
    var neu = !((sec.key in s) ? !!s[sec.key] : true);
    s[sec.key] = neu; schreibe(s);
    if (neu && sec.bd.style.display === 'none') sec.bd.style.display = '';
    sec.karte.classList.toggle('gsek-zu', !neu);
    sync();
    if (neu) neuZeichnen();
  }

  /* Canvas/SVG zeichnen nur sichtbar sauber — beim Aufklappen einmal nachrechnen.
     Die Module heissen ihre Recalc-Funktion unterschiedlich; wir probieren die
     im Repo vorkommenden Namen der Reihe nach (jede in try/catch). */
  var RECALC = ['recalc', 'calcAndRender', 'recalcAll', 'hxRecalc', 'fwkRecalc',
    'zkRenderCalc', 'sgRecalc', 'heRecalc', 'glRecalc', 'kpRecalc', 'rwRecalc',
    'wpeRecalc', 'hlRecalc', 'lbRecalc', 'braRecalc', 'sfRecalc', 'paRecalc',
    'spRecalc', 'egRecalc', 'mgRecalc', 'gsRecalc', 'wwRenderCalc', 'render'];
  function neuZeichnen() {
    for (var i = 0; i < RECALC.length; i++) {
      var fn = w[RECALC[i]];
      if (typeof fn === 'function') { try { fn(); } catch (e) { } return; }
    }
  }

  /* ── «Hat diese Sektion Werte?» ────────────────────────────────────────────
     Für den Export: Sektionen mit Inhalt kommen aufgeklappt, leere zugeklappt.
     Bewusst grosszügig — im Zweifel gilt eine Sektion als gefüllt, damit nie
     etwas stillschweigend aus dem Bericht fällt. */
  var LEER = /^(|–|—|-|0|0\.0|0\.00|0,0|0,00|n\/a|\.\.\.)$/i;
  function hatWerte(sec) {
    var bd = (sec && sec.bd) || sec;
    if (!bd) return false;
    var f, i;
    var felder = bd.querySelectorAll('input,select,textarea');
    for (i = 0; i < felder.length; i++) {
      f = felder[i];
      if (f.type === 'checkbox' || f.type === 'radio') { if (f.checked) return true; continue; }
      if (f.type === 'hidden' || f.type === 'range' || f.type === 'button' || f.type === 'submit') continue;
      if (f.tagName === 'SELECT') { if (f.value && f.selectedIndex > 0) return true; continue; }
      if (String(f.value || '').trim() !== '') return true;
    }
    /* Ergebniswerte (berechnet, keine Eingabe) */
    var res = bd.querySelectorAll('.g-result-val,.el-res-val,.kpi-val,.res-val,.g-badge,[id^="out"]');
    for (i = 0; i < res.length; i++) {
      if (!LEER.test(String(res[i].textContent || '').trim())) return true;
    }
    /* Datenzeilen einer Tabelle */
    if (bd.querySelector('tbody tr')) return true;
    /* Gezeichnete Schemata */
    if (bd.querySelector('svg,canvas,img')) return true;
    /* Reiner Fliesstext (z.B. «So funktioniert's») zählt NICHT als Wert */
    return false;
  }

  function setzeAlle(offen) { _secs.forEach(function (s) { anwenden(s, offen); }); }
  function zustand() { return _secs.map(function (s) { return istOffen(s); }); }
  function wiederherstellen(snap) {
    if (!snap) return;
    _secs.forEach(function (s, i) { anwenden(s, snap[i] !== false); });
  }

  w.GemaSektion = {
    init: init, sektionen: sektionen, hatWerte: hatWerte, sync: sync,
    setzeAlle: setzeAlle, zustand: zustand, wiederherstellen: wiederherstellen,
    umschalten: umschalten, istOffen: istOffen, KEY: KEY
  };

  /* Manche Module bauen ihre Karten erst zur Laufzeit (sb_du_zusammenstellung
     rendert die Apparate-Gruppen nach dem Laden). Ein gedrosselter Beobachter
     zieht die Pfeile dort nach; init() ist idempotent (`karte.__gsek`), es
     entsteht also keine Schleife. */
  function beobachten() {
    if (!w.MutationObserver || d.__gsekObs) return;
    var timer = null, laeuft = false;
    var obs = new MutationObserver(function () {
      if (laeuft) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        laeuft = true;
        try { init(); } catch (e) { }
        laeuft = false;
      }, 250);
    });
    try {
      obs.observe(d.querySelector('.g-page') || d.body, { childList: true, subtree: true });
      d.__gsekObs = obs;
    } catch (e) { }
  }

  function boot() { init(); beobachten(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
