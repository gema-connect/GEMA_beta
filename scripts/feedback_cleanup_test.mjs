// Drift-Guard: «Feedback aufräumen» im Beta-Board (sys_beta.html).
//
// Anlass: das Board konnte das Feedback nicht mehr anzeigen. `_GemaDB.init`
// holt ALLE `feedback_*`-Zeilen in EINER Anfrage und bricht nach 4 s hart ab
// (AbortController in gema_db.js) — schwer sind die Zeilen wegen der
// Screenshots, die gema_feedback.js als Base64 IN den Eintrag legt.
//
// Die Fallen, die dieser Guard festhält:
//   1. Der Zeitstempel ist ein de-CH-ANZEIGESTRING («07.08.26, 14:32»), kein
//      ISO-Datum — mit zweistelligem Jahr. Wer ihn `new Date()` vorwirft,
//      bekommt Unsinn.
//   2. Board-Kommentare tragen einen Zeitstempel OHNE Jahr («07.08., 14:32»,
//      nowStr) — sie sind grundsätzlich nicht datierbar und dürfen NIE
//      gelöscht werden.
//   3. Was sich nicht datieren lässt, BLEIBT. Ein unlesbares Feld darf nie
//      zu einer Löschung führen.
//   4. Nur `cStatus === 'erledigt'` fliegt raus — offen/in Arbeit nie.
//   5. Zurückgeschrieben wird ein ARRAY, nicht `JSON.stringify` — sonst
//      startet gema_feedback.js beim nächsten Absenden mit einer leeren
//      Liste und die Modul-Historie ist weg.
//   6. Die Bereinigung darf NICHT am kaputten Bulk-Load hängen (sonst hätte
//      sie nichts zu putzen): Schlüssel via `select=data_key` OHNE payload,
//      danach Zeile für Zeile.
//
// Aufruf: node scripts/feedback_cleanup_test.mjs   (kein Browser nötig)
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
const ok = (c, n, info) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 220) : '')); }
};

const beta = readFileSync(new URL('../sys_beta.html', import.meta.url), 'utf8');
const fbjs = readFileSync(new URL('../gema_feedback.js', import.meta.url), 'utf8');

// ── A: Engine aus der Seite ziehen und ausführen ──────────────
console.log('■ A: Engine-Block');
const blk = (beta.match(/\/\*FBCLEAN-ENGINE-START\*\/([\s\S]*?)\/\*FBCLEAN-ENGINE-END\*\//) || [])[1];
ok(!!blk, 'FBCLEAN-ENGINE-Block vorhanden (DOM-frei, Node-testbar)');
if (!blk) { console.log('\n' + pass + ' ok, ' + fail + ' fail'); process.exit(1); }

const E = new Function(blk + '; return {fbTsDate,fbAlterTage,fbAufraeumbar,fbCleanArray,fbParseRoh,fbCleanGroesse,FBCLEAN_TAGE};')();
ok(E.FBCLEAN_TAGE === 3, 'Vorgabe: 3 Tage', E.FBCLEAN_TAGE);
ok(!/document\.|getElementById|window\./.test(blk), 'Engine ist DOM-frei');

// ── B: Zeitstempel lesen ──────────────────────────────────────
console.log('■ B: Zeitstempel (de-CH-Anzeigestring)');
{
  const d = E.fbTsDate('07.08.26, 14:32');
  ok(!!d && d.getFullYear() === 2026 && d.getMonth() === 7 && d.getDate() === 7 && d.getHours() === 14 && d.getMinutes() === 32,
    'zweistelliges Jahr: «07.08.26, 14:32» → 07.08.2026 14:32', d && d.toString());
}
{
  const d = E.fbTsDate('07.08.2026, 14:32');
  ok(!!d && d.getFullYear() === 2026 && d.getDate() === 7, 'vierstelliges Jahr wird auch genommen', d && d.toString());
}
{
  const d = E.fbTsDate('07.08.26');
  ok(!!d && d.getHours() === 0 && d.getMinutes() === 0, 'ohne Uhrzeit → 00:00', d && d.toString());
}
ok(E.fbTsDate('07.08., 14:32') === null,
  'Board-Zeitstempel OHNE Jahr ist NICHT datierbar (nowStr) → null');
ok(E.fbTsDate('31.02.26, 10:00') === null,
  'ungültiges Datum (31.02.) → null statt still auf den 03.03. zu rollen');
ok(E.fbTsDate('') === null && E.fbTsDate(null) === null && E.fbTsDate(undefined) === null && E.fbTsDate(42) === null,
  'leer/null/undefined/Zahl → null');
ok(E.fbTsDate('gestern') === null, 'Freitext → null');

/* Gegenprobe — der Grund, warum es den eigenen Parser gibt: `new Date()`
   liest «07.08.26» als US-Format (Monat/Tag) und macht daraus den 8. JULI
   statt den 7. AUGUST. Tag und Monat sind vertauscht, ohne dass irgendetwas
   auffällt — und ein um Wochen danebenliegendes Alter löscht die falschen
   Einträge. Diese Prüfung failt bewusst, sollte jemand den Parser gegen
   `new Date(ts)` eintauschen. */
{
  const JETZT_PROBE = new Date(2026, 7, 10, 12, 0);   // 10.08.2026 12:00
  const naiv = new Date('07.08.26, 14:32');
  const echt = E.fbTsDate('07.08.26, 14:32');
  ok(!isNaN(naiv.getTime()) && naiv.getMonth() !== echt.getMonth(),
    'Gegenprobe: new Date() vertauscht Tag/Monat (8. Juli statt 7. August)',
    { naiv: naiv.toDateString(), echt: echt.toDateString() });
  ok(Math.abs(E.fbAlterTage('07.08.26, 14:32', JETZT_PROBE) - 2.894444) < 1e-4,
    'der eigene Parser datiert korrekt (2.89 Tage statt 33)',
    E.fbAlterTage('07.08.26, 14:32', JETZT_PROBE));
}

// ── C: Alter + Auswahlregel ───────────────────────────────────
console.log('■ C: Wer darf weg?');
const JETZT = new Date(2026, 7, 10, 12, 0);           // 10.08.2026 12:00
const erl = (ts) => ({ cStatus: 'erledigt', ts });

ok(Math.abs(E.fbAlterTage('07.08.26, 12:00', JETZT) - 3) < 1e-9, 'Alter exakt in Tagen');
ok(E.fbAlterTage('07.08., 12:00', JETZT) === null, 'nicht datierbar → null');

ok(E.fbAufraeumbar(erl('06.08.26, 10:00'), JETZT) === true, 'erledigt + 4 Tage alt → weg');
ok(E.fbAufraeumbar(erl('07.08.26, 11:00'), JETZT) === true, 'erledigt + 3 Tage 1 h → weg (Grenze überschritten)');
ok(E.fbAufraeumbar(erl('07.08.26, 13:00'), JETZT) === false, 'erledigt + 2 Tage 23 h → BLEIBT (Grenze nicht erreicht)');
ok(E.fbAufraeumbar(erl('10.08.26, 11:00'), JETZT) === false, 'erledigt, heute → bleibt');
ok(E.fbAufraeumbar({ cStatus: 'offen', ts: '01.01.20, 08:00' }, JETZT) === false, 'OFFEN bleibt, egal wie alt');
ok(E.fbAufraeumbar({ cStatus: 'bearbeitung', ts: '01.01.20, 08:00' }, JETZT) === false, 'IN ARBEIT bleibt, egal wie alt');
ok(E.fbAufraeumbar({ ts: '01.01.20, 08:00' }, JETZT) === false, 'ohne cStatus = offen → bleibt');
ok(E.fbAufraeumbar(erl('07.08., 10:00'), JETZT) === false, 'erledigt, aber Datum ohne Jahr → BLEIBT');
ok(E.fbAufraeumbar(erl(undefined), JETZT) === false, 'erledigt ohne Zeitstempel → BLEIBT');
ok(E.fbAufraeumbar(erl('31.12.99, 10:00'), JETZT) === false, 'erledigt mit Zukunftsdatum (verstellte Uhr) → bleibt');
ok(E.fbAufraeumbar(null, JETZT) === false && E.fbAufraeumbar(undefined, JETZT) === false, 'null/undefined → false');
ok(E.fbAufraeumbar(erl('09.08.26, 10:00'), JETZT, 1) === true, 'Frist ist parametrierbar (1 Tag)');

// ── D: Aufteilen + Gewicht messen ─────────────────────────────
console.log('■ D: Aufteilen');
{
  const arr = [
    { cStatus: 'offen',       ts: '01.01.26, 08:00', text: 'bleibt-offen' },
    { cStatus: 'erledigt',    ts: '01.08.26, 08:00', text: 'weg-1', screenshot: 'x'.repeat(1000) },
    { cStatus: 'erledigt',    ts: '10.08.26, 08:00', text: 'bleibt-frisch' },
    { cStatus: 'bearbeitung', ts: '01.01.26, 08:00', text: 'bleibt-arbeit' },
    { cStatus: 'erledigt',    ts: '07.08.,  08:00',  text: 'bleibt-undatierbar' },
    { cStatus: 'erledigt',    ts: '02.08.26, 08:00', text: 'weg-2' }
  ];
  const r = E.fbCleanArray(arr, JETZT);
  ok(r.entfernt.length === 2 && r.entfernt.every(e => /^weg-/.test(e.text)), 'genau die zwei alten erledigten fliegen raus',
    r.entfernt.map(e => e.text));
  ok(r.behalten.length === 4 && r.behalten.every(e => /^bleibt-/.test(e.text)), 'alle übrigen bleiben',
    r.behalten.map(e => e.text));
  ok(r.bytes > 1000, 'Gewicht der Entfernten wird gemessen (Screenshot zählt)', r.bytes);
  ok(arr.length === 6, 'Eingabe-Array wird nicht mutiert');
  ok(r.behalten[0].text === 'bleibt-offen' && r.behalten[3].text === 'bleibt-undatierbar', 'Reihenfolge bleibt erhalten');
}
ok(E.fbCleanArray(null, JETZT).behalten.length === 0, 'null-Array → leer, kein Wurf');

// ── E: Gespeicherte Form deuten ───────────────────────────────
console.log('■ E: Array ODER JSON-String (beide Formen liegen im Bestand)');
ok(Array.isArray(E.fbParseRoh([{ a: 1 }])), 'Array wird durchgereicht');
ok(E.fbParseRoh('[{"a":1}]').length === 1, 'JSON-String wird geparst');
ok(E.fbParseRoh(null) === null && E.fbParseRoh(undefined) === null, 'leer → null (Zeile wird übersprungen)');
ok(E.fbParseRoh('kein json') === null, 'kaputter String → null statt leerem Array');
ok(E.fbParseRoh('{"a":1}') === null, 'Objekt-JSON (kein Array) → null');
ok(E.fbParseRoh(42) === null, 'Zahl → null');
ok(E.fbCleanGroesse(500) === '500 B' && /kB$/.test(E.fbCleanGroesse(2048)) && /MB$/.test(E.fbCleanGroesse(3 * 1048576)),
  'Grössen lesbar (B/kB/MB)');

// ── F: Cloud-Teil — die Konstruktionsregeln ───────────────────
console.log('■ F: Cloud-Teil');
{
  const fn = (beta.match(/async function _fbCleanKeys\(\)\{[\s\S]*?\n\}/) || [''])[0];
  ok(/select=data_key/.test(fn) && !/payload/.test(fn),
    'Schlüssel-Abfrage holt NUR data_key, kein payload (läuft auch wenn der Bulk-Load erstickt)', fn.slice(0, 200));
}
{
  const fn = (beta.match(/async function _fbCleanScan\(onProgress\)\{[\s\S]*?\n\}/) || [''])[0];
  ok(/loadFromModule\(SK, k\)/.test(fn), 'Scan liest Zeile für Zeile (loadFromModule), nicht in einem Rutsch');
  ok(/i \+= 4/.test(fn), 'in kleinen Bündeln — Speicher bleibt begrenzt');
  ok(/res\.fehler\.push/.test(fn), 'unlesbare Zeilen werden gesammelt, nicht verschluckt');
}
{
  const fn = (beta.match(/async function _fbCleanApply\(scan, onProgress\)\{[\s\S]*?\n\}/) || [''])[0];
  ok(/loadFromModule\(SK, m\.key\)/.test(fn),
    'vor dem Schreiben wird frisch geladen (zwischenzeitlich eingetroffenes Feedback darf nicht verloren gehen)');
  ok(/saveToModule\(SK, m\.key, c\.behalten\)/.test(fn) && !/JSON\.stringify\(c\.behalten\)/.test(fn),
    'zurückgeschrieben wird ein ARRAY, nicht stringify (sonst wischt gema_feedback die Historie)', fn.slice(0, 300));
  ok(/if\(!ok\)\{ out\.fehler\.push/.test(fn), 'fehlgeschlagener Schreibvorgang wird gemeldet');
  ok(/_GemaDB\.c\[m\.key\] = c\.behalten/.test(fn), 'lokaler Cache wird nachgezogen (Board zeigt den Stand ohne Reload)');
}
ok(/function _fbCleanDarf\(\)\{[\s\S]*?GemaAuth\.isAdmin\(\)/.test(beta), 'Aufräumen ist GEMA-Admin-only');
ok(/id="btnFbClean" class="g-nav-btn gnav-weg"/.test(beta),
  'Knopf startet versteckt (fail-closed) und nutzt .gnav-weg — Inline-display:none griffe an der Nav nicht');
ok(/bClean\.classList\.toggle\('gnav-weg', !_fbCleanDarf\(\)\)/.test(beta), 'Boot schaltet den Knopf nur für Admins frei');
ok(/if\(_fbCleanBusy\) return;/.test(beta), 'Dialog lässt sich während des Schreibens nicht wegklicken');
ok(/_fbCleanFehlerHtml/.test(beta) && /übersprungen/.test(beta), 'übersprungene Zeilen werden im Dialog BENANNT');

// ── G: Die Wipe-Falle in gema_feedback.js ─────────────────────
console.log('■ G: gema_feedback — String-Payload darf die Historie nicht löschen');
{
  const fn = (fbjs.match(/var existing = await _GemaDB\.loadFromModule\(BETA_KEY, dataKey\)[\s\S]*?if \(!Array\.isArray\(existing\)\) existing = \[\];/) || [''])[0];
  ok(/typeof existing === 'string'/.test(fn) && /JSON\.parse\(existing\)/.test(fn),
    'ein gespeicherter JSON-String wird geparst statt verworfen', fn.slice(0, 260));
}
{
  // Verhalten nachspielen: Board schreibt stringify → nächstes Absenden darf
  // die bestehenden Punkte NICHT verlieren.
  const gespeichert = JSON.stringify([{ text: 'alt-1' }, { text: 'alt-2' }]);
  let existing = gespeichert || [];
  if (typeof existing === 'string') { try { const p = JSON.parse(existing); existing = Array.isArray(p) ? p : []; } catch (e) { existing = []; } }
  if (!Array.isArray(existing)) existing = [];
  existing.unshift({ text: 'neu' });
  ok(existing.length === 3, 'String-Stand + neuer Punkt = 3 (vorher: 1, Historie weg)', existing.length);
}

// ── H: Durchlauf mit gestubbter Cloud ─────────────────────────
// Die Regeln oben prüfen den Bauplan; hier läuft die Kette wirklich durch:
// Schlüssel holen → Zeile für Zeile prüfen → schreiben.
console.log('■ H: Scan + Anwenden (Cloud gestubbt)');
{
  const grab = (re) => { const m = beta.match(re); if (!m) throw new Error('Funktion nicht gefunden: ' + re); return m[0]; };
  const src = [
    blk,
    grab(/function _fbCleanHdrs\(\)\{[\s\S]*?\n\}/),
    grab(/async function _fbCleanKeys\(\)\{[\s\S]*?\n\}/),
    grab(/async function _fbCleanScan\(onProgress\)\{[\s\S]*?\n\}/),
    grab(/async function _fbCleanApply\(scan, onProgress\)\{[\s\S]*?\n\}/)
  ].join('\n');

  // Zeitstempel im Produktions-Format erzeugen (de-CH, zweistelliges Jahr).
  const stamp = (d) => d.toLocaleString('de-CH', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
  const vorTagen = (n) => stamp(new Date(Date.now() - n * 86400000));

  const cloud = {
    'feedback_alpha': [
      { cStatus:'erledigt', ts: vorTagen(30), text:'alt-1', screenshot:'x'.repeat(5000) },
      { cStatus:'offen',    ts: vorTagen(30), text:'offen-bleibt' },
      { cStatus:'erledigt', ts: vorTagen(0.5), text:'frisch-bleibt' },
      { cStatus:'erledigt', ts: vorTagen(10), text:'alt-2' }
    ],
    'feedback_beta': [ { cStatus:'offen', ts: vorTagen(99), text:'nur-offen' } ],
    // String-Payload (so schreibt das Board) — muss trotzdem funktionieren
    'feedback_gamma': JSON.stringify([{ cStatus:'erledigt', ts: vorTagen(7), text:'alt-3' }]),
    'feedback_kaputt': 'kein json',
    'feedback_boom': null                 // Laden wirft
  };
  const geschrieben = {};

  const _GemaDB = {
    c: {},
    async loadFromModule(mod, key){
      if (key === 'feedback_boom') throw new Error('Netzfehler');
      return cloud[key];
    },
    async saveToModule(mod, key, wert){ geschrieben[key] = wert; cloud[key] = wert; return true; }
  };
  const GemaSync = { SB_URL: 'https://x.test', SB_KEY: 'k', getAuthToken: () => 't' };
  let keyAbfrage = '';
  const fakeFetch = async (url) => {
    keyAbfrage = url;
    return { ok: true, json: async () => Object.keys(cloud).map(k => ({ data_key: k })) };
  };

  const F = new Function('SK', 'GemaSync', '_GemaDB', 'fetch',
    src + '; return {_fbCleanKeys,_fbCleanScan,_fbCleanApply};'
  )('gema_beta_pruefungen_v1', GemaSync, _GemaDB, fakeFetch);

  const scan = await F._fbCleanScan();
  ok(/select=data_key/.test(keyAbfrage) && !/payload/.test(keyAbfrage), 'Schlüssel-Abfrage lädt keine Nutzlast', keyAbfrage);
  ok(scan.weg === 3, 'Scan findet genau die 3 alten erledigten Punkte', scan.weg);
  ok(scan.module.length === 2 && scan.module.map(m => m.id).sort().join(',') === 'alpha,gamma',
    'nur alpha + gamma sind betroffen (beta ist sauber)', scan.module.map(m => m.id));
  ok(scan.fehler.length === 2 && scan.fehler.sort().join(',') === 'feedback_boom,feedback_kaputt',
    'unlesbare/unerreichbare Zeilen werden gemeldet, nicht verschluckt', scan.fehler);
  ok(scan.bytes > 5000, 'Screenshot-Gewicht ist in der Vorschau sichtbar', scan.bytes);
  ok(Object.keys(geschrieben).length === 0, 'Der Scan schreibt NICHTS (erst nach Bestätigung)');

  const out = await F._fbCleanApply(scan);
  ok(out.weg === 3 && out.module === 2, 'Anwenden entfernt 3 Punkte über 2 Module', { weg: out.weg, module: out.module });
  ok(Array.isArray(geschrieben['feedback_alpha']),
    'zurückgeschrieben wird ein ARRAY (nicht stringify) — sonst wischt gema_feedback die Historie',
    typeof geschrieben['feedback_alpha']);
  ok(geschrieben['feedback_alpha'].map(e => e.text).join(',') === 'offen-bleibt,frisch-bleibt',
    'alpha behält offen + frisch, in ursprünglicher Reihenfolge',
    geschrieben['feedback_alpha'].map(e => e.text));
  ok(Array.isArray(geschrieben['feedback_gamma']) && geschrieben['feedback_gamma'].length === 0,
    'gamma war ein String-Payload und ist jetzt ein leeres ARRAY');
  ok(!('feedback_beta' in geschrieben), 'saubere Module werden gar nicht angefasst');
  ok(!('feedback_kaputt' in geschrieben) && !('feedback_boom' in geschrieben),
    'unlesbare Zeilen werden NICHT überschrieben');
  ok(_GemaDB.c['feedback_alpha'] && _GemaDB.c['feedback_alpha'].length === 2,
    'lokaler Cache ist nachgezogen — das Board zeigt den Stand ohne Reload');

  // Zweiter Lauf: nichts mehr zu tun (idempotent).
  const scan2 = await F._fbCleanScan();
  ok(scan2.weg === 0, 'zweiter Durchgang findet nichts mehr (idempotent)', scan2.weg);
}

console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
