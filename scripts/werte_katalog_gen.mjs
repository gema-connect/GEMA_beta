#!/usr/bin/env node
/**
 * scripts/werte_katalog_gen.mjs — Generator fuer gema_werte_katalog.js
 *
 * Scannt alle Berechnungsmodule und schreibt jeden erfassbaren Wert mit einer
 * STABILEN ID in einen Katalog. Der Katalog ist die Auswahlliste des
 * Verknuepfungs-Werkzeugs (gema_verknuepfung.js): dort waehlt man im
 * ZIELMODUL ein Feld an und sagt, welcher Wert aus welcher anderen
 * Berechnung dort vorgeschlagen werden soll.
 *
 * ID-SCHEMA (User-Entscheid 08/2026): sprechend und stabil —
 *   <modulKey>.<feldId>            z.B. druckerhoehung.vfd_LU
 *   <modulKey>.<ergebnisKey>_out   z.B. lu_tabelle.q_kw_out
 * Sprechend, damit Claude Code am Namen sieht, worum es geht, ohne
 * nachzuschlagen. Die kurzen Nummern (VK-0007) tragen die VERKNUEPFUNGEN,
 * nicht die Werte — geaendert wird ja immer eine Verknuepfung.
 *
 * WAS GESCANNT WIRD (und was bewusst nicht):
 *  · NUR statisches Markup ausserhalb von <script>-Bloecken. Felder, die ein
 *    Modul zur Laufzeit in JS-Strings zusammenbaut (Teilstrecken-Zeilen,
 *    Verbraucher-Tabellen), haben keine stabile ID und taugen nicht als
 *    Verknuepfungsziel — sie wuerden den Katalog nur zumuellen.
 *  · Ergebniswerte kommen aus getBerechnungswerte() (der Payload, den ein
 *    Modul heute schon fuer Offertanfragen liefert) und aus Ausgabe-
 *    Elementen mit id (out/res/erg im Namen).
 *
 * Aufruf:  node scripts/werte_katalog_gen.mjs [--check]
 *          --check schreibt nichts, meldet nur Abweichungen (fuer Drift-Guard)
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL = join(ROOT, 'gema_werte_katalog.js');
const NUR_PRUEFEN = process.argv.includes('--check');

/* ─────────────────────────────────────────────────────────────
   Welche Dateien sind Berechnungsmodule?
   ───────────────────────────────────────────────────────────── */
const PRAEFIXE = ['sb_', 'sa_', 'hz_', 'lt_', 'el_', 'br_'];
/* Keine Berechnungen — Hubs, Formular-Renderer, Referenzlisten */
const AUSNAHMEN = new Set([
  'el_index', 'br_index', 'sb_index', 'el_angaben',
  'br_vkf_formular', 'br_vkf_formulare'
]);

function modulDateien() {
  return readdirSync(ROOT)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace(/\.html$/, ''))
    .filter(n => PRAEFIXE.some(p => n.startsWith(p)))
    .filter(n => !AUSNAHMEN.has(n))
    .sort();
}

/* ─────────────────────────────────────────────────────────────
   FILE_MAP aus gema_auth.js lesen (Datei -> Modul-Key).
   Der Modul-Key ist die eine Wahrheit im ganzen Repo (Permissions,
   AutoSave, Workspace) — der Katalog benutzt denselben.
   ───────────────────────────────────────────────────────────── */
function fileMap() {
  const src = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
  const start = src.indexOf('var FILE_MAP');
  if (start < 0) throw new Error('FILE_MAP in gema_auth.js nicht gefunden');
  const block = src.slice(start, src.indexOf('};', start));
  const map = {};
  for (const m of block.matchAll(/'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g)) map[m[1]] = m[2];
  return map;
}

/* ─────────────────────────────────────────────────────────────
   HTML-Helfer
   ───────────────────────────────────────────────────────────── */
const ENTITIES = {
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü',
  szlig: 'ß', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', middot: '·', deg: '°', sup2: '²', sup3: '³', times: '×',
  minus: '−', ndash: '–', mdash: '—', hellip: '…', rarr: '→', darr: '↓',
  laquo: '«', raquo: '»', shy: '', sbquo: '‚', bdquo: '„'
};
function entities(s) {
  return String(s || '')
    .replace(/&([a-zA-Z]+);/g, (all, n) => (n in ENTITIES ? ENTITIES[n] : all))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
/* Tags weg, Whitespace normalisieren. <br> und Hint-Spans trennen den
   eigentlichen Beschriftungstext von seinem Zusatztext ab. */
function nurText(html) {
  return entities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\u0001')
      /* Hint-/Badge-Elemente samt Inhalt weg — sonst klebt der Zusatztext
         am Label («Dauer-/Spezialverbraucher» + «LU ↗») */
      .replace(/<(span|div|small|a)\b[^>]*class\s*=\s*["'][^"']*\b(lbl-hint|hint|g-hint|fg-hint|badge|tag|pill|no-print)\b[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, ' ')
      /* Block-Ende trennt wie ein <br> — ein Label endet dort */
      .replace(/<\/(div|p|label|li)>/gi, '')
      .replace(/<[^>]*>/g, '')
  ).replace(/[ \t]+/g, ' ').trim();
}
function ersteZeile(html) {
  const t = nurText(html);
  return t.split('\u0001')[0].replace(/\s+/g, ' ').replace(/[\s\u00b7\u2014\u2013>\u2192:*]+$/g, '').trim();
}
/* <script>-Bloecke und Kommentare durch Leerzeichen gleicher Laenge
   ersetzen — so bleiben alle Byte-Offsets erhalten und die Rueckwaerts-
   Suche nach dem Label springt nie in ein Skript hinein. */
function nurMarkup(src) {
  return src
    .replace(/<script\b[\s\S]*?<\/script>/gi, m => ' '.repeat(m.length))
    .replace(/<style\b[\s\S]*?<\/style>/gi, m => ' '.repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
}
function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'))
    || tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : '';
}

/* ─────────────────────────────────────────────────────────────
   Beschriftung eines Feldes finden
   Reihenfolge: <label for> → naechstes vorangehendes Label-Element →
   title → placeholder (nur wenn es kein Beispielwert ist) → Feld-ID.
   ───────────────────────────────────────────────────────────── */
const LABEL_KLASSEN = /class\s*=\s*["'][^"']*\b(fg-lbl|g-label|g-inp-lbl|lbl|label|f-lbl|el-lbl|feld-lbl|inp-lbl|g-result-lbl|out-card-label)\b/i;

function labelFuer(markup, pos, tag, id) {
  /* 1) <label for="id"> irgendwo in der Datei */
  const fuer = markup.match(new RegExp('<label[^>]*for\\s*=\\s*["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>([\\s\\S]{0,300}?)<\\/label>', 'i'));
  if (fuer) {
    const t = ersteZeile(fuer[1]);
    if (t) return t;
  }
  /* 2) Rueckwaerts das naechstliegende Beschriftungs-Element suchen.
        Beschriftungen stehen im Repo unmittelbar vor dem Feld
        (.fg-lbl / .g-label), max. ein paar hundert Zeichen entfernt.
        KRITISCH: liegt zwischen Beschriftung und Feld ein ANDERES Feld,
        gehoert die Beschriftung zu jenem — sonst erbt ein Toggle-Knopf
        die Beschriftung der Projektleiste («Datum»). */
  const vor = markup.slice(Math.max(0, pos - 700), pos);
  const oeffner = [...vor.matchAll(/<(label|div|span|td|th)\b[^>]*>/gi)];
  for (let i = oeffner.length - 1; i >= 0; i--) {
    const o = oeffner[i];
    const tagText = o[0];
    if (!(LABEL_KLASSEN.test(tagText) || /^<label/i.test(tagText))) continue;
    const ab = o.index + tagText.length;
    const rest = vor.slice(ab);
    const zu = rest.search(new RegExp('</' + o[1] + '>', 'i'));
    const inhalt = zu >= 0 ? rest.slice(0, zu) : rest;
    /* Fremdes Feld dazwischen? Dann ist diese Beschriftung nicht unsere. */
    const danach = zu >= 0 ? rest.slice(zu) : '';
    if (/<(input|select|textarea)\b/i.test(danach)) return '';
    const t = ersteZeile(inhalt);
    if (t && t.length <= 90) return t;
  }
  /* 3) title, 4) placeholder ohne Beispielwerte */
  const titel = ersteZeile(attr(tag, 'title'));
  if (titel && titel.length <= 90) return titel;
  const ph = ersteZeile(attr(tag, 'placeholder'));
  if (ph && !/^(z\.?\s?b\.?|bsp|beispiel|0[.,]0|—|-|\d)/i.test(ph) && ph.length <= 60) return ph;
  return '';
}

/* Einheit: die angeschlossene Einheiten-Box direkt nach dem Feld */
function einheitNach(markup, posEnde) {
  const nach = markup.slice(posEnde, posEnde + 320);
  const m = nach.match(/<(span|div)[^>]*class\s*=\s*["'][^"']*\b(fg-unit|g-inp-unit|inpu|el-unit|unit|einheit)\b[^"']*["'][^>]*>([\s\S]{0,40}?)<\/\1>/i);
  if (m) {
    const t = nurText(m[3]).replace(/\u0001/g, ' ').trim();
    if (t && t.length <= 14) return t;
  }
  return '';
}

/* ─────────────────────────────────────────────────────────────
   Eingabefelder eines Moduls
   ───────────────────────────────────────────────────────────── */
const FELD_UEBERSPRINGEN = /^(meta|gfb-|gn-|gc-|ws-|_)/;   /* Projektleiste, Overlays, Helfer */
const TYP_UEBERSPRINGEN = new Set(['hidden', 'button', 'submit', 'reset', 'file', 'image', 'search']);

function eingabenVon(markup) {
  const werte = [];
  const gesehen = new Set();
  for (const m of markup.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = m[0];
    const id = attr(tag, 'id');
    if (!id || gesehen.has(id)) continue;
    const typ = (attr(tag, 'type') || 'text').toLowerCase();
    if (TYP_UEBERSPRINGEN.has(typ)) continue;
    if (FELD_UEBERSPRINGEN.test(id)) continue;
    gesehen.add(id);
    const label = labelFuer(markup, m.index, tag, id);
    werte.push({
      feld: id,
      label: label || id,
      einheit: einheitNach(markup, m.index + tag.length),
      art: 'eingabe',
      typ: m[1].toLowerCase() === 'select' ? 'auswahl' : (typ === 'checkbox' ? 'ja_nein' : 'zahl'),
      unsicher: label ? undefined : true    /* Beschriftung nicht gefunden */
    });
  }
  return werte;
}

/* ─────────────────────────────────────────────────────────────
   Ergebniswerte
   a) getBerechnungswerte() — der Payload, den das Modul heute schon
      fuer Offertanfragen liefert. Das sind per Definition die
      fachlich relevanten Ausgabewerte.
   b) Ausgabe-Elemente mit id (out/res/erg) im statischen Markup.
   ───────────────────────────────────────────────────────────── */
function ergebnisseVon(src, markup) {
  const werte = [];
  const gesehen = new Set();

  const gb = src.indexOf('getBerechnungswerte');
  if (gb >= 0) {
    /* Nur den return-Block der Funktion ansehen (bis zur schliessenden
       Klammer der naechsten Zeile mit '},' auf Funktionsebene) */
    const block = src.slice(gb, gb + 4000);
    for (const r of block.matchAll(/return\s*\{([\s\S]{0,1200}?)\}/g)) {
      for (const k of r[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) {
        const key = k[1];
        if (gesehen.has(key)) continue;
        gesehen.add(key);
        werte.push({ feld: key + '_out', label: lesbar(key), einheit: '', art: 'ergebnis', typ: 'zahl' });
      }
      break;   /* nur das erste return — spaetere gehoeren anderen Funktionen */
    }
  }

  /* Ausgabe-Elemente: <span id="vfd_out_vz">, <div id="out-fliessdruck"> */
  for (const m of markup.matchAll(/<(span|div|b|strong|td)\b[^>]*\bid\s*=\s*["']([a-zA-Z0-9_\-]*(?:out|res|erg)[a-zA-Z0-9_\-]*)["'][^>]*>/gi)) {
    const id = m[2];
    if (gesehen.has(id) || FELD_UEBERSPRINGEN.test(id)) continue;
    gesehen.add(id);
    const label = labelFuer(markup, m.index, m[0], id);
    werte.push({
      feld: id, label: label || lesbar(id), einheit: einheitNach(markup, m.index + m[0].length),
      art: 'ergebnis', typ: 'zahl', unsicher: label ? undefined : true
    });
  }
  return werte;
}

function lesbar(key) {
  return String(key)
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(out|res|erg)\b/gi, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ').trim()
    .replace(/^./, c => c.toUpperCase());
}

/* Modul-Beschriftung + Norm aus dem Hero */
function modulLabel(src, datei) {
  const hero = src.match(/class\s*=\s*["'][^"']*\b(gema-hero-title|hero-title)\b[^"']*["'][^>]*>([\s\S]{0,120}?)<\//i);
  if (hero) { const t = ersteZeile(hero[2]); if (t) return t; }
  const titel = src.match(/<title>([\s\S]{0,160}?)<\/title>/i);
  if (titel) return ersteZeile(titel[1]).replace(/\s*[·—|]\s*GEMA.*$/i, '').trim();
  return datei;
}

const KATEGORIE = { sb_: 'Sanitär', sa_: 'Sanitäranlagen', hz_: 'Heizung', lt_: 'Lüftung', el_: 'Elektro', br_: 'Brandschutz' };

/* AutoSave-Name des Moduls = der LESEKANAL fuer jedes Eingabefeld:
   der Snapshot liegt unter gema_<name>__<objektId>[@phase], darin steht
   jedes Feld unter seiner id. Claude Code kann eine Verknuepfung damit
   umsetzen, ohne im Modul suchen zu muessen. */
function autosaveName(src) {
  const m = src.match(/GemaAutoSave\.init\(\s*['"]([a-z0-9_]+)['"]/i);
  return m ? m[1] : '';
}

/* Handgepflegte Ergaenzungen (Cross-Modul-APIs, die nicht im Markup stehen) */
function manuelleWerte() {
  try {
    const roh = JSON.parse(readFileSync(join(ROOT, 'scripts', 'werte_katalog_manuell.json'), 'utf8'));
    delete roh._hinweis;
    return roh;
  } catch (e) {
    console.warn('  (keine werte_katalog_manuell.json gefunden — nur Markup-Werte)');
    return {};
  }
}

/* ─────────────────────────────────────────────────────────────
   Katalog bauen
   ───────────────────────────────────────────────────────────── */
function katalogBauen() {
  const map = fileMap();
  const manuell = manuelleWerte();
  const module = {};
  let anzahlWerte = 0, ohneLabel = 0, anzahlApi = 0;

  for (const datei of modulDateien()) {
    const src = readFileSync(join(ROOT, datei + '.html'), 'utf8');
    const markup = nurMarkup(src);
    const key = map[datei] || datei;
    const werte = [...eingabenVon(markup), ...ergebnisseVon(src, markup)];

    /* Handgepflegte API-Werte dazu — sie stehen ZUERST, weil sie der
       fachlich gemeinte Ausgabewert sind (die LU-Tabelle etwa baut ihre
       Ergebnisse komplett in JS und haette sonst gar keine). */
    (manuell[key] || []).forEach(m => {
      werte.unshift({ feld: m.feld, label: m.label, einheit: m.einheit || '', art: m.art || 'ergebnis', typ: 'zahl', api: m.api || '' });
      anzahlApi++;
    });

    if (!werte.length) continue;
    const asName = autosaveName(src);
    werte.forEach(w => {
      w.id = key + '.' + w.feld;
      /* Lesekanal: API wenn dokumentiert, sonst der AutoSave-Snapshot */
      if (!w.api && w.art === 'eingabe' && asName) w.quelle = 'gema_' + asName + '__<objektId>';
      if (w.unsicher) ohneLabel++;
    });
    anzahlWerte += werte.length;
    module[key] = {
      key,
      datei,
      label: modulLabel(src, datei),
      kategorie: KATEGORIE[datei.slice(0, 3)] || 'Sonstige',
      autosave: asName,
      werte
    };
  }

  /* Manuelle Eintraege fuer Module ohne eigene Datei (z.B. objekte) */
  Object.keys(manuell).forEach(key => {
    if (module[key]) return;
    const werte = manuell[key].map(m => ({
      id: key + '.' + m.feld, feld: m.feld, label: m.label,
      einheit: m.einheit || '', art: m.art || 'ergebnis', typ: 'zahl', api: m.api || ''
    }));
    anzahlWerte += werte.length; anzahlApi += werte.length;
    module[key] = { key, datei: '', label: lesbar(key), kategorie: 'Projekt', autosave: '', werte };
  });

  return { module, anzahlWerte, ohneLabel, anzahlApi };
}

function dateiInhalt(k) {
  const module = {};
  Object.keys(k.module).sort().forEach(key => {
    const m = k.module[key];
    module[key] = {
      key: m.key, datei: m.datei, label: m.label, kategorie: m.kategorie,
      autosave: m.autosave || '',
      werte: m.werte.map(w => {
        const o = { id: w.id, feld: w.feld, label: w.label, art: w.art, typ: w.typ };
        if (w.einheit) o.einheit = w.einheit;
        if (w.api) o.api = w.api;          /* dokumentierter Lesekanal */
        if (w.quelle) o.quelle = w.quelle; /* AutoSave-Snapshot-Key */
        if (w.unsicher) o.unsicher = true;
        return o;
      })
    };
  });

  return `/**
 * gema_werte_katalog.js — Katalog aller erfassbaren Werte der Berechnungen
 *
 * AUTOMATISCH ERZEUGT von scripts/werte_katalog_gen.mjs — NICHT VON HAND
 * BEARBEITEN. Neu erzeugen mit:  node scripts/werte_katalog_gen.mjs
 *
 * Zweck: Auswahlliste des Verknuepfungs-Werkzeugs (gema_verknuepfung.js).
 * Im Zielmodul waehlt man ein Feld an und sagt, welcher Wert aus welcher
 * anderen Berechnung dort vorgeschlagen werden soll.
 *
 * WERT-ID = <modulKey>.<feldId>  (sprechend + stabil, z.B.
 * druckerhoehung.vfd_LU). Ergebniswerte tragen das Suffix _out.
 *
 * Die Datei wird BEWUSST NUR BEI BEDARF geladen (der Helper injiziert sie,
 * wenn der Admin das Werkzeug oeffnet) — sie ist zu gross, um auf jeder
 * Berechnungsseite mitzulaufen.
 *
 * Stand: ${k.anzahlWerte} Werte in ${Object.keys(k.module).length} Modulen.
 */
(function (w) {
  'use strict';
  var MODULE = ${JSON.stringify(module, null, 1)};

  var _index = null;
  function index() {
    if (_index) return _index;
    _index = {};
    Object.keys(MODULE).forEach(function (mk) {
      MODULE[mk].werte.forEach(function (v) {
        _index[v.id] = { modul: mk, modulLabel: MODULE[mk].label, wert: v };
      });
    });
    return _index;
  }

  w.GemaWerteKatalog = {
    module: MODULE,
    /* Alle Werte eines Moduls */
    werte: function (modulKey) { return (MODULE[modulKey] || {}).werte || []; },
    /* Einen Wert ueber seine ID aufloesen — liefert auch Modul + Modul-Label */
    byId: function (id) { return index()[id] || null; },
    /* Beschriftung fuer die Anzeige: «Modul · Wert (Einheit)» */
    label: function (id) {
      var t = index()[id];
      if (!t) return id;
      return t.modulLabel + ' · ' + t.wert.label + (t.wert.einheit ? ' [' + t.wert.einheit + ']' : '');
    },
    /* Volltextsuche ueber alle Module — fuer die Quellen-Auswahl */
    suche: function (q, opts) {
      opts = opts || {};
      var s = String(q || '').toLowerCase().trim();
      var treffer = [];
      Object.keys(MODULE).forEach(function (mk) {
        if (opts.modul && mk !== opts.modul) return;
        MODULE[mk].werte.forEach(function (v) {
          if (opts.art && v.art !== opts.art) return;
          if (s) {
            var heu = (v.label + ' ' + v.id + ' ' + MODULE[mk].label + ' ' + (v.einheit || '')).toLowerCase();
            if (heu.indexOf(s) < 0) return;
          }
          treffer.push({ modul: mk, modulLabel: MODULE[mk].label, kategorie: MODULE[mk].kategorie, wert: v });
        });
      });
      /* Ergebniswerte zuerst — sie sind der typische Fall einer
         Verknuepfung («Ergebnis der einen Berechnung speist die naechste») */
      treffer.sort(function (a, b) {
        if ((a.wert.art === 'ergebnis') !== (b.wert.art === 'ergebnis')) return a.wert.art === 'ergebnis' ? -1 : 1;
        return a.modulLabel.localeCompare(b.modulLabel) || a.wert.label.localeCompare(b.wert.label);
      });
      return treffer;
    },
    modulListe: function () {
      return Object.keys(MODULE).map(function (k) { return MODULE[k]; })
        .sort(function (a, b) { return a.kategorie.localeCompare(b.kategorie) || a.label.localeCompare(b.label); });
    }
  };
})(typeof window !== 'undefined' ? window : this);
`;
}

/* ─────────────────────────────────────────────────────────────
   Lauf
   ───────────────────────────────────────────────────────────── */
const k = katalogBauen();
const inhalt = dateiInhalt(k);

if (NUR_PRUEFEN) {
  let alt = '';
  try { alt = readFileSync(ZIEL, 'utf8'); } catch (e) { /* noch nicht erzeugt */ }
  const gleich = alt.trim() === inhalt.trim();
  console.log(gleich
    ? `✓ Katalog aktuell (${k.anzahlWerte} Werte, ${Object.keys(k.module).length} Module)`
    : `✗ Katalog VERALTET — neu erzeugen mit: node scripts/werte_katalog_gen.mjs`);
  process.exit(gleich ? 0 : 1);
}

writeFileSync(ZIEL, inhalt, 'utf8');
console.log(`✓ gema_werte_katalog.js geschrieben`);
console.log(`  ${Object.keys(k.module).length} Module · ${k.anzahlWerte} Werte`
  + ` · ${k.anzahlApi} davon mit dokumentiertem API-Lesekanal`
  + (k.ohneLabel ? ` · ${k.ohneLabel} ohne gefundene Beschriftung (zeigen ihre Feld-ID)` : ''));
