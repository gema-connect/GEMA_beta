/**
 * gema_berechnungs_tabs.js — Mehrere Berechnungen pro Objekt (Feedback 12.08.2026)
 * =============================================================================
 * Eine Berechnung ist selten die einzige: derselbe Planer rechnet fuer dasselbe
 * Projekt eine Variante «Drehzahlreguliert» und eine «mit Windkessel», einen
 * Strang Nord und einen Strang Sued. Bisher gab es pro Objekt genau EINEN
 * Datensatz — die zweite Variante ueberschrieb die erste.
 *
 * Diese Leiste haengt sich in JEDE Berechnung: Tabs anlegen (＋), umbenennen
 * (Rechtsklick bzw. langer Tipp auf dem Touchgeraet), loeschen (rotes ✕ mit
 * Rueckfrage, Vorauswahl «Nein»).
 *
 * EINBINDUNG (mehr braucht es nicht):
 *   <script src="gema_berechnungs_tabs.js"></script>   im <head>, NACH gema_autosave.js
 * Kein init(), keine Konfiguration, kein Markup — die Leiste und ihr Speicher-
 * Feld werden selbst eingehaengt.
 *
 * ── SO FUNKTIONIERT ES ───────────────────────────────────────────────────────
 * Muster «Anlagen-Verwaltung» aus lt_hx_diagramm (#hx_anlagen): der AKTIVE Tab
 * lebt in den DOM-Feldern und damit im normalen GemaAutoSave. Die INAKTIVEN
 * liegen als Feld-Schnappschuesse in einem versteckten <textarea>, das AutoSave
 * ebenfalls mitsichert — also automatisch pro Objekt UND Phase. Beim Wechsel:
 * aktuelle Felder einfrieren → aktiv umsetzen → Ziel-Schnappschuss anwenden.
 *
 * WARUM DAS OHNE MODUL-WISSEN GEHT (der Kern des Ganzen):
 *  1. Ein Schnappschuss ist EXAKT das, was GemaAutoSave speichert, minus der
 *     Projektleiste (Projekt/Bearbeiter/Datum gehoeren dem Projekt, nicht der
 *     Variante). Es braucht also keine Feldliste pro Modul.
 *  2. Angewendet wird wie GemaAutoSave._restore: Werte setzen, DANACH `input`
 *     und `change` feuern. Damit laufen die modul-eigenen Wiederherstellungen
 *     (die JSON-Textareas #zk_rows, #gl_rows, #enth_straenge …), die Einheiten-
 *     Beschriftungen und die Neuberechnungen von selbst — jedes Modul bringt
 *     diese Kette fuer den AutoSave-Restore ohnehin schon mit.
 *  3. Die gefeuerten Ereignisse sind synthetisch (isTrusted === false). Module,
 *     die beim Einheiten-Wechsel Werte UMRECHNEN, pruefen genau darauf
 *     (`ev.isTrusted`, siehe sa_enthaertung/sb_kreisprofil/hz_heizungsleitungen)
 *     und rechnen deshalb hier korrekterweise NICHT nochmals um.
 *     KRITISCH fuer neue Module: wer beim Umschalten einer Einheit die erfassten
 *     Werte umrechnet, MUSS das an eine echte Benutzer-Aktion binden — sonst
 *     verfaelscht schon der normale AutoSave-Restore die Zahlen (genau dieser
 *     Fehler steckte in sb_druckerhoehung und multiplizierte den Druck bei
 *     jedem Neuladen mit 100).
 *
 * ISOLATION: angewendet wird `Vorgabewerte ∪ Schnappschuss`. Ohne die Vorgaben
 * bliebe ein Feld, das nur in Tab A ausgefuellt ist, beim Wechsel nach B stehen.
 *
 * NEUE BERECHNUNG startet leer: die Vorgabewerte werden beim DOMContentLoaded
 * aus dem unberuehrten DOM gezogen — VOR dem AutoSave-Restore. Das klappt,
 * weil ein <script> im <head> seinen Listener frueher registriert als der
 * Boot-Block des Moduls (Registrier-Reihenfolge = Dokument-Reihenfolge).
 *
 * SOFORT SICHER: nach jeder Aktion laeuft GemaAutoSave.save() — der Wechsel
 * ueberlebt damit auch ein sofortiges Schliessen (die 5-Sekunden-Entprellung
 * wuerde ihn sonst verschlucken) und ein spaeter zuschlagender Snapshot-Fallback
 * (glSnapshotLoad & Co.) liest bereits den neuen Stand.
 *
 * GRENZE (bewusst): eingehaengt wird nur auf Seiten mit Projektleiste UND
 * #metaObjektDropdown — nur dort IST der AutoSave-Schnappschuss die fachliche
 * Berechnung des Projekts (dieselbe Regel wie beim Gleichzeitig-Bearbeiten-
 * Schloss). Module mit eigener Varianten-Verwaltung (lt_hx_diagramm) binden
 * diese Datei nicht ein.
 */
(function (w) {
  'use strict';
  if (w.GemaBerechnungsTabs) return;              /* doppelte Einbindung */

  var LEISTE_ID = 'gbtLeiste';
  var TA_ID     = 'gbt_tabs';                     /* AutoSave sichert es als textarea[id] */
  var STIL_ID   = 'gbtStil';

  function leer() { return { aktiv: 'b1', list: [{ id: 'b1', name: 'Berechnung 1' }], snaps: {} }; }
  var S = leer();
  var _vorgabe = null;      /* Felder des unberuehrten DOM */
  var _intern  = false;     /* eigener Schreibvorgang → Restore-Listener ignorieren */

  /* ── Felder ────────────────────────────────────────────────────────────── */
  /* Spiegelt die SKIP-Liste von gema_autosave.js (Bedien-Elemente) und nimmt
     zusaetzlich die Projektleiste aus: die gehoert dem Projekt, nicht der
     einzelnen Berechnung. Alles mit meta-Praefix ist per GEMA-Konvention
     Projektleiste (metaProjekt/-Bearbeiter/-Datum/-Objekt…). */
  var WEG = {};
  ['metaObjektDropdown', 'objComboBtn', 'objComboSelect', 'objComboManual',
    'objSearch', 'objSort', 'objBauvorhabenFilter', 'betObjFilter', 'betRolleFilter',
    'filterCategory', 'filterOwner', 'filterCategory2', 'filterOwner2',
    'search', 'search2', 'viewMode', 'windowSpan', 'windowStart', 'zoomPreset',
    'contractorStamm', 'protoSelect',
    'mProjekt', 'mPlaner', 'mDatum'                       /* Altbestand sa_oelabscheider */
  ].forEach(function (id) { WEG[id] = 1; });

  function istFeld(el) {
    var id = el && el.id;
    if (!id || id === TA_ID || WEG[id]) return false;
    if (/^meta/.test(id)) return false;
    try { if (el.closest('.modal-bg,.modal,#gfb-root,#' + LEISTE_ID)) return false; } catch (e) {}
    return true;
  }

  /* ── Module mit eigenem _GemaDB-Blob ──────────────────────────────────── */
  /* Neun Berechnungen halten ihren fachlichen Zustand NICHT im AutoSave-
     Schnappschuss, sondern als JSON-Blob in _GemaDB unter dem per-Objekt-
     Schluessel (Apparateliste, DU-Zusammenstellung, LU-Tabelle …). Ohne diese
     Schluessel wuerden die Tabs nur die Kopf-Felder trennen und die Zeilen
     gemeinsam nutzen — beim naechsten Laden gewaenne der zuletzt gespeicherte
     Blob und die andere Variante waere ueberschrieben. Deshalb wandert der
     Blob mit in den Schnappschuss; neu gezeichnet wird ueber die
     GEMA-Konvention `window._objReload`. */
  function blobSchluessel() {
    if (!w._GemaDB || !_GemaDB.c) return [];
    var suffix = '';
    try {
      if (typeof GemaObjekte !== 'undefined' && GemaObjekte.storageKey) {
        suffix = String(GemaObjekte.storageKey('')).slice(1);   /* '__obj_1@phase' bzw. '' */
      }
    } catch (e) {}
    return Object.keys(_GemaDB.c).filter(function (k) {
      return suffix ? (k.length > suffix.length && k.slice(-suffix.length) === suffix)
                    : k.indexOf('__') < 0;
    });
  }

  function blobLesen() {
    var db = null;
    blobSchluessel().forEach(function (k) {
      var v = _GemaDB.c[k];
      if (v == null) return;
      if (!db) db = {};
      db[k] = v;
    });
    return db;
  }

  function blobSetzen(db) {
    if (!w._GemaDB) return false;
    var alt = blobSchluessel(), neu = db || {}, beruehrt = false;
    alt.forEach(function (k) {
      if (!(k in neu)) { try { _GemaDB.remove(k); beruehrt = true; } catch (e) {} }
    });
    Object.keys(neu).forEach(function (k) {
      if (_GemaDB.c[k] === neu[k]) return;
      try { _GemaDB.save(k, neu[k]); beruehrt = true; } catch (e) {}
    });
    if (beruehrt && typeof w._objReload === 'function') { try { w._objReload(); } catch (e) {} }
    return beruehrt;
  }

  function felderLesen() {
    var f = {};
    document.querySelectorAll('input[id],select[id],textarea[id]').forEach(function (el) {
      if (!istFeld(el)) return;
      f[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : el.value;
    });
    /* Modul-eigener Unter-Tab (.g-tab[data-tab] ist der GEMA-Kanon) — er
       gehoert zur Variante, nicht zur Seite (Drehzahlreguliert ⇄ Windkessel). */
    try {
      var akt = document.querySelector('.g-tab.active[data-tab]');
      if (akt) f._modus = akt.dataset.tab;
    } catch (e) {}
    var db = blobLesen();
    if (db) f._db = db;
    return f;
  }

  function felderSetzen(f) {
    if (!f) return;
    /* Vorgaben zuerst, Schnappschuss darueber: ein Feld, das nur in der
       anderen Berechnung gefuellt war, bleibt sonst stehen. */
    var voll = {}, k;
    if (_vorgabe) for (k in _vorgabe) voll[k] = _vorgabe[k];
    for (k in f) voll[k] = f[k];

    var ids = Object.keys(voll).filter(function (x) { return x.charAt(0) !== '_'; });
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !istFeld(el)) return;
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!voll[id];
      else el.value = (voll[id] == null) ? '' : String(voll[id]);
    });
    /* Ereignisse ERST nach allen Werten — sonst rechnet ein Modul mit einem
       halb gesetzten Stand (Muster GemaAutoSave._restore). */
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || !istFeld(el)) return;
      try {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    });
    /* Unter-Tab: den Knopf des Moduls KLICKEN statt Klassen zu setzen — so
       laeuft die Umschalt-Logik des Moduls, wie sie auch immer aussieht. */
    if (f._modus) {
      try {
        document.querySelectorAll('.g-tab[data-tab]').forEach(function (b) {
          if (b.dataset.tab === f._modus && !b.classList.contains('active')) b.click();
        });
      } catch (e) {}
    }
    /* Zuletzt der _GemaDB-Blob: er zeichnet ueber _objReload neu und wuerde
       sonst von den Feld-Ereignissen wieder ueberschrieben. */
    blobSetzen(f._db || null);
  }

  /* ── Speichern ─────────────────────────────────────────────────────────── */
  function speichern(sofort) {
    var ta = document.getElementById(TA_ID);
    if (ta) {
      _intern = true;
      try {
        ta.value = JSON.stringify(S);
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
      _intern = false;
    }
    /* Ohne das haengt der Wechsel an der 5-Sekunden-Entprellung von AutoSave. */
    if (sofort !== false) { try { if (w.GemaAutoSave && GemaAutoSave.save) GemaAutoSave.save(); } catch (e) {} }
  }

  function einlesen() {
    var ta = document.getElementById(TA_ID);
    if (!ta) return;
    try {
      var st = JSON.parse(ta.value || '');
      if (st && Array.isArray(st.list) && st.list.length) {
        S = st;
        if (!S.snaps) S.snaps = {};
        if (!S.list.some(function (t) { return t.id === S.aktiv; })) S.aktiv = S.list[0].id;
      } else S = leer();
    } catch (e) { S = leer(); }
    zeichnen();
  }

  function eingefroren() {
    try { return typeof GemaObjekte !== 'undefined' && GemaObjekte.isEingefroren && GemaObjekte.isEingefroren(); }
    catch (e) { return false; }
  }

  /* ── Leiste ────────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function zeichnen() {
    var host = document.getElementById(LEISTE_ID);
    if (!host) return;
    var mehrere = S.list.length > 1;
    var frozen  = eingefroren();
    host.innerHTML = S.list.map(function (t) {
      var akt = t.id === S.aktiv;
      /* Das ✕ ist ein <span> IM Tab-Knopf — ein <button> im <button> ist
         ungueltiges Markup und wird vom Browser zerlegt. */
      return '<button type="button" class="gbt-tab' + (akt ? ' active' : '') + '" data-gbt="' + esc(t.id) + '"'
        + ' title="' + esc(t.name) + (frozen ? '' : ' — Rechtsklick: umbenennen') + '">'
        + '<span class="gbt-name">' + esc(t.name) + '</span>'
        + (akt && mehrere && !frozen ? '<span class="gbt-x" data-gbt-x="1" title="Berechnung löschen">✕</span>' : '')
        + '</button>';
    }).join('')
      + (frozen ? '' : '<button type="button" class="gbt-add" data-gbt-add="1" title="Weitere Berechnung anlegen">＋</button>')
      + (frozen ? '<span class="gbt-hint">nur Lesen — eingefrorener Stand</span>' : '');
  }

  /* ── Aktionen ──────────────────────────────────────────────────────────── */
  function wechseln(id) {
    if (!id || id === S.aktiv) return;
    if (!S.list.some(function (t) { return t.id === id; })) return;
    S.snaps[S.aktiv] = felderLesen();
    S.aktiv = id;
    felderSetzen(S.snaps[id] || null);
    speichern(); zeichnen();
  }

  function neu() {
    var vorschlag = 'Berechnung ' + (S.list.length + 1);
    frage({
      titel: 'Neue Berechnung',
      text: 'Bezeichnung des Tabs (z.B. «Variante 2» oder «Strang Nord»). Die neue Berechnung startet leer.',
      wert: vorschlag
    }, function (name) {
      if (name === null) return;
      S.snaps[S.aktiv] = felderLesen();
      var id = 'b' + Date.now().toString(36);
      S.list.push({ id: id, name: (name || vorschlag).trim() || vorschlag });
      S.aktiv = id;
      felderSetzen(_vorgabe ? JSON.parse(JSON.stringify(_vorgabe)) : null);
      speichern(); zeichnen();
    });
  }

  function umbenennen(id) {
    var t = S.list.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    frage({ titel: 'Berechnung umbenennen', wert: t.name }, function (name) {
      if (name === null) return;
      t.name = (name || '').trim() || t.name;
      speichern(); zeichnen();
    });
  }

  function loeschen() {
    if (S.list.length <= 1) return;
    var t = S.list.filter(function (x) { return x.id === S.aktiv; })[0];
    var weg = function (ok) {
      if (!ok) return;
      S.list = S.list.filter(function (x) { return x.id !== S.aktiv; });
      delete S.snaps[S.aktiv];
      S.aktiv = S.list[0].id;
      felderSetzen(S.snaps[S.aktiv] || null);
      speichern(); zeichnen();
    };
    if (w.GemaDialog) {
      GemaDialog.confirm({
        title: 'Berechnung löschen',
        message: 'Berechnung «' + (t ? t.name : '') + '» mit allen Eingaben löschen?',
        confirmLabel: 'Ja, löschen', cancelLabel: 'Nein, behalten',
        danger: true, focusCancel: true            /* Vorauswahl «Nein» (Feedback-Vorgabe) */
      }).then(weg);
    } else weg(w.confirm('Berechnung wirklich löschen?'));
  }

  /* GemaDialog ist nicht auf jeder Berechnung eingebunden — bei Bedarf
     nachladen (Muster: gema_autosave laedt gema_editlock nach). */
  function frage(opt, cb) {
    if (w.GemaDialog) {
      GemaDialog.prompt({ title: opt.titel, message: opt.text || '', defaultValue: opt.wert || '' }).then(cb);
      return;
    }
    var s = document.createElement('script');
    s.src = 'gema_dialog.js';
    s.onload = function () {
      if (w.GemaDialog) GemaDialog.prompt({ title: opt.titel, message: opt.text || '', defaultValue: opt.wert || '' }).then(cb);
      else cb(w.prompt(opt.titel, opt.wert || ''));
    };
    s.onerror = function () { cb(w.prompt(opt.titel, opt.wert || '')); };
    try { document.head.appendChild(s); } catch (e) { cb(w.prompt(opt.titel, opt.wert || '')); }
  }

  /* ── Einhaengen ────────────────────────────────────────────────────────── */
  function stil() {
    if (document.getElementById(STIL_ID)) return;
    var st = document.createElement('style');
    st.id = STIL_ID;
    /* Eigene Klassen (.gbt-*), NIE .g-tab — mehrere Module haengen einen
       globalen .g-tab-Klick-Listener ein, der dataset.tab erwartet und an
       einem fremden Knopf stolpert. Farben mit Rueckfall, weil die Module
       unterschiedliche Variablen-Namen fuehren (--accent/--acc/--aw). */
    st.textContent =
      '#' + LEISTE_ID + '{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px}' +
      '#' + LEISTE_ID + ' .gbt-tab{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;' +
      'border:1.5px solid var(--border,var(--brd,#e2e8f0));border-radius:10px;background:var(--surface,var(--sur,#fff));' +
      'color:var(--muted,var(--mut,#64748b));font-size:12.5px;font-weight:600;font-family:inherit;' +
      'cursor:pointer;transition:.15s;max-width:260px}' +
      '#' + LEISTE_ID + ' .gbt-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#' + LEISTE_ID + ' .gbt-tab:hover{border-color:var(--accent,var(--acc,var(--aw,#1d4ed8)));color:var(--accent,var(--acc,var(--aw,#1d4ed8)))}' +
      '#' + LEISTE_ID + ' .gbt-tab.active{border-color:var(--accent,var(--acc,var(--aw,#1d4ed8)));' +
      'color:var(--accent,var(--acc,var(--aw,#1d4ed8)));background:#eff6ff;box-shadow:0 1px 3px rgba(0,0,0,.06)}' +
      '#' + LEISTE_ID + ' .gbt-x{display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;' +
      'color:#dc2626;font-size:11.5px;font-weight:800;line-height:1;cursor:pointer}' +
      '#' + LEISTE_ID + ' .gbt-x:hover{background:#fee2e2}' +
      '#' + LEISTE_ID + ' .gbt-add{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:10px;' +
      'border:1.5px dashed var(--border,var(--brd,#e2e8f0));background:transparent;' +
      'color:var(--accent,var(--acc,var(--aw,#1d4ed8)));font-size:16px;font-weight:800;cursor:pointer;' +
      'font-family:inherit;transition:.15s}' +
      '#' + LEISTE_ID + ' .gbt-add:hover{border-color:var(--accent,var(--acc,var(--aw,#1d4ed8)));background:#eff6ff}' +
      '#' + LEISTE_ID + ' .gbt-hint{font-size:11.5px;font-weight:600;color:var(--muted,var(--mut,#64748b))}' +
      '@media print{#' + LEISTE_ID + '{display:none!important}}';
    try { document.head.appendChild(st); } catch (e) {}
  }

  function einhaengen() {
    if (document.getElementById(LEISTE_ID)) return true;
    /* Ohne GemaAutoSave gaebe es keinen Speicherkanal: die Tab-Leiste waere
       nach dem naechsten Laden weg, die Daten des zuletzt aktiven Tabs blieben
       im modul-eigenen Speicher liegen. Ein halbes Feature ist schlechter als
       keines — solche Module (z.B. sb_vonroll, das rein ueber _GemaDB laeuft)
       bleiben bewusst aussen vor. */
    if (!w.GemaAutoSave || !GemaAutoSave.save) return false;
    /* Nur wo der AutoSave-Schnappschuss wirklich die Berechnung EINES Projekts
       ist (gleiche Regel wie beim Gleichzeitig-Bearbeiten-Schloss). */
    if (!document.getElementById('metaObjektDropdown')) return false;
    var anker = document.querySelector('.project-bar, .proj-bar');
    if (!anker || !anker.parentNode) return false;

    stil();
    var leiste = document.createElement('div');
    leiste.id = LEISTE_ID;
    leiste.className = 'no-print';
    anker.parentNode.insertBefore(leiste, anker.nextSibling);

    var ta = document.createElement('textarea');
    ta.id = TA_ID;
    ta.style.display = 'none';
    /* Zustand {aktiv,list:[{id,name}],snaps:{id:{feldId:wert}}} — von
       GemaAutoSave als textarea[id] automatisch pro Objekt+Phase gesichert. */
    leiste.parentNode.insertBefore(ta, leiste.nextSibling);

    ta.addEventListener('change', function () { if (!_intern) einlesen(); });
    ta.addEventListener('input',  function () { if (!_intern) einlesen(); });

    /* EIN delegierter Listener auf der Leiste — sie wird bei jeder Aenderung
       neu gezeichnet, Listener an den Knoepfen wuerden sich summieren. */
    leiste.addEventListener('click', function (ev) {
      var x = ev.target.closest ? ev.target.closest('[data-gbt-x]') : null;
      if (x) { ev.stopPropagation(); loeschen(); return; }
      if (ev.target.closest('[data-gbt-add]')) { neu(); return; }
      var t = ev.target.closest('[data-gbt]');
      if (t) wechseln(t.getAttribute('data-gbt'));
    });
    leiste.addEventListener('contextmenu', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-gbt]') : null;
      if (!t || eingefroren()) return;
      ev.preventDefault();
      umbenennen(t.getAttribute('data-gbt'));
    });
    /* Touch: langer Tipp = umbenennen (es gibt dort keinen Rechtsklick) */
    var lpTimer = null;
    leiste.addEventListener('touchstart', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-gbt]') : null;
      if (!t || eingefroren()) return;
      clearTimeout(lpTimer);
      lpTimer = setTimeout(function () { lpTimer = null; umbenennen(t.getAttribute('data-gbt')); }, 550);
    }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach(function (e) {
      leiste.addEventListener(e, function () { clearTimeout(lpTimer); }, { passive: true });
    });
    return true;
  }

  /* ── Start ─────────────────────────────────────────────────────────────── */
  function start() {
    if (!einhaengen()) return;
    /* Vorgabewerte aus dem unberuehrten DOM — VOR dem AutoSave-Restore.
       Dieser Listener wurde als <head>-Script vor dem Boot-Block des Moduls
       registriert und laeuft deshalb zuerst. */
    _vorgabe = felderLesen();
    einlesen();

    /* Objekt- bzw. Phasen-Wechsel: GemaAutoSave._clear() setzt die Felder
       zurueck, feuert dabei aber keine Ereignisse — die Leiste zeigt sonst
       noch die Tabs des vorherigen Projekts. Mehrfach nachlesen, weil das
       Laden aus der Cloud asynchron ist. */
    function nachlesen() { [0, 500, 1500].forEach(function (ms) { setTimeout(einlesen, ms); }); }
    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'metaObjektDropdown') nachlesen();
    }, true);
    w.addEventListener('gema-objekt-changed', nachlesen);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  w.GemaBerechnungsTabs = {
    zustand: function () { return S; },
    felder: felderLesen,
    anwenden: felderSetzen,
    zeichnen: zeichnen,
    wechseln: wechseln,
    neu: neu,
    umbenennen: umbenennen,
    loeschen: loeschen,
    vorgabe: function () { return _vorgabe; }
  };
})(window);
