// Drift-Guard — ERP-Migration: das Export-Paket passt zum Importer
//
// Der Weg Altsystem → GEMA ist: SQL (Konzept, Kapitel 8) → erp_export/sql/
// (generiert) → export.ps1 → .tsv → Import-Assistent. Dieser Guard prüft die
// Nahtstellen, an denen bisher nur der Mensch gelesen hat:
//   1. Das Generat ist aktuell (node scripts/erp_export_gen.mjs).
//   2. JEDE Spalte jeder Abfrage wird vom Importer einem Feld zugeordnet —
//      eine unzugeordnete Spalte wäre Datenverlust ohne Meldung.
//   3. Alle Pflichtfelder der Ziel-Sektion sind gedeckt, und die Automatik
//      erkennt die Sektion sicher (Mehrdatei-Import).
//   4. Jede Sektion der Import-Reihenfolge hat einen Export (Ausnahme
//      dokumentiert), Jahresscheiben haben ihre Jahresliste.
//   5. Der Runner hält die Regeln ein, die den Parser voraussetzen.
//
// Aufruf:  node scripts/erp_export_test.mjs
import fs from 'fs';
import path from 'path';
import { generiere, ROOT, KONZEPT, ZIEL, NAME_RE } from './erp_export_gen.mjs';

let n = 0, fail = 0;
function t(name, cond, detail) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name + (detail ? ' → ' + detail : '')); } }

// ── Importer ohne Browser laden (wie erp_stunden_writer_test) ────────────
const AUTH = { getCurrentUser: () => ({ id: 'u', orgId: 'org1', name: 'A' }), getUsers: () => [], getCurrentOrg: () => ({ id: 'org1', settings: {} }), updateOrgSettings: () => true };
const win = {};
['gema_erp_adressen.js', 'gema_erp_import.js'].forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(win, { getItem: () => null, setItem() {}, removeItem() {} }, undefined, AUTH, undefined, undefined);
  if (win.GemaAdressen) globalThis.GemaAdressen = win.GemaAdressen;
});
const I = win.GemaErpImport;

/* Spaltennamen (Aliasse) des äussersten SELECT — kommagetrennt auf Tiefe 0,
   bis zum FROM auf Tiefe 0. Bei UNION zählt der erste Zweig. */
export function spaltenAusSql(sqlRoh) {
  const sql = sqlRoh.replace(/--[^\n]*/g, ' ');
  const sel = sql.search(/\bSELECT\b/i);
  if (sel < 0) return [];
  let i = sel + 6, depth = 0, start = i, teile = [];
  for (; i < sql.length; i++) {
    const c = sql[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0) {
      if (c === ',') { teile.push(sql.slice(start, i)); start = i + 1; }
      else if (/\s/.test(c) && /^FROM\b/i.test(sql.slice(i + 1))) { teile.push(sql.slice(start, i)); break; }
    }
  }
  return teile.map(x => x.trim().replace(/^DISTINCT\s+/i, '')).filter(Boolean).map(x => {
    const m = /\s+AS\s+`?([A-Za-z_][\w]*)`?\s*$/i.exec(x);
    if (m) return m[1];
    const m2 = /([A-Za-z_][\w]*)\s*$/.exec(x);
    return m2 ? m2[1] : x;
  });
}

// ═══ 1 — Generat aktuell ═══
console.log('\n═══ 1 — erp_export/sql ist generiert und aktuell ═══');
const soll = generiere(fs.readFileSync(KONZEPT, 'utf8'));
const ist = {};
if (fs.existsSync(ZIEL)) for (const f of fs.readdirSync(ZIEL)) if (/\.sql$/.test(f)) ist[f] = fs.readFileSync(path.join(ZIEL, f), 'utf8');
const fehlt = Object.keys(soll).filter(k => !(k in ist));
const zuviel = Object.keys(ist).filter(k => !(k in soll));
const anders = Object.keys(soll).filter(k => k in ist && ist[k] !== soll[k]);
t('alle markierten Blöcke liegen als Datei vor', fehlt.length === 0, fehlt.join(', '));
t('keine verwaisten Dateien', zuviel.length === 0, zuviel.join(', '));
t('Inhalt identisch mit dem Konzept (sonst: node scripts/erp_export_gen.mjs)', anders.length === 0, anders.join(', '));
t('mindestens 15 Export-Abfragen', Object.keys(soll).length >= 15, String(Object.keys(soll).length));

// ═══ 2/3 — jede Spalte findet ihr Feld, Pflichtfelder gedeckt, Sektion erkannt ═══
console.log('\n═══ 2 — Spalten ↔ Importer-Felder ═══');
const OHNE_EXPORT = { zahlungen: 'rechnungen.zahlungsdatum/zahlungsbetrag sind im Bestand durchweg leer (Konzept 8.8)' };
const gesehen = {};
for (const name of Object.keys(soll).sort()) {
  const m = NAME_RE.exec(name.replace(/\.sql$/, ''));
  const sekId = m[2], istJahre = !!m[4];
  const sql = soll[name];
  if (istJahre) {
    const cols = spaltenAusSql(sql);
    t(name + ': Jahresliste liefert genau die Spalte «jahr» ohne Platzhalter', cols.length === 1 && cols[0] === 'jahr' && !/\{\{/.test(sql), cols.join(','));
    continue;
  }
  gesehen[sekId] = 1;
  t(name + ': Sektion «' + sekId + '» existiert im Importer', !!I.sektion(sekId));
  if (!I.sektion(sekId)) continue;
  const cols = spaltenAusSql(sql);
  t(name + ': Spalten gelesen (' + cols.length + ')', cols.length >= 3, cols.join(','));
  const map = I.erkenneMapping(cols, sekId);
  const g = I.mappingGuete(map, sekId);
  t(name + ': Pflichtfelder gedeckt', g.pflichtOk, 'fehlt: ' + g.fehlendePflicht.join(', '));
  const zugeordnet = new Set(Object.values(map));
  const offen = cols.filter((c, idx) => !zugeordnet.has(idx));
  t(name + ': jede Spalte hat ein Feld (kein stiller Verlust)', offen.length === 0, 'ohne Feld: ' + offen.join(', '));
  // So kommt die Datei im Assistenten an: mit dem Namen des Pakets. Der Name
  // ordnet zu, sobald die Pflichtfelder passen — die Kopfzeile allein reicht
  // bei merkmalsarmen Exporten (Stunden aus dem Stundenmodul) nicht.
  const erk = I.erkenneSektion(cols, name.replace(/\.sql$/, '.tsv'));
  t(name + ': Automatik erkennt «' + sekId + '» sicher', !!(erk.beste && erk.beste.sekId === sekId && erk.sicher),
    erk.beste ? (erk.beste.sekId + (erk.sicher ? '' : ' (unsicher)')) : 'nichts');
  const erkK = I.erkenneSektion(cols);
  t(name + ': auch ohne Dateiname ist «' + sekId + '» die beste Vermutung', !!(erkK.beste && erkK.beste.sekId === sekId), erkK.beste && erkK.beste.sekId);
  if (/\{\{JAHR\}\}/.test(sql)) t(name + ': Jahresscheiben haben ihre Jahresliste', !!soll[name.replace(/\.sql$/, '.jahre.sql')]);
}

// ═══ 4 — Reihenfolge vollständig ═══
console.log('\n═══ 4 — jede Sektion der Import-Reihenfolge hat einen Export ═══');
for (const sek of I.IMPORT_REIHENFOLGE) {
  if (OHNE_EXPORT[sek]) { t('«' + sek + '» bewusst ohne Export: ' + OHNE_EXPORT[sek], true); continue; }
  t('Export für «' + sek + '» vorhanden', !!gesehen[sek]);
}
const nummern = Object.keys(soll).filter(k => !/\.jahre\.sql$/.test(k)).map(k => ({ nr: parseInt(k.slice(0, 2), 10), sek: NAME_RE.exec(k.replace(/\.sql$/, ''))[2] }));
const reihenfolgeOk = nummern.every(x => I.IMPORT_REIHENFOLGE[x.nr - 1] === x.sek);
t('Dateinummern entsprechen der Import-Reihenfolge', reihenfolgeOk, nummern.filter(x => I.IMPORT_REIHENFOLGE[x.nr - 1] !== x.sek).map(x => x.nr + '≠' + x.sek).join(', '));

// ═══ 4b — der Schlüssel, an dem die halbe Migration hängt ═══
//
// Gemessen (Konzept 8.18): `obj.knummer` (int) trifft in 4 381 von 4 417
// Fällen die `adressen.id`; `oknummer` ist im Bestand fast überall NULL.
// Liefert der Adress-Export wieder `oknummer` als Kundennummer, zeigen die
// drei Adress-Slots am Objekt und der Kunde an der Offerte ins Leere und
// jede Adresse entsteht ein zweites Mal — ohne dass irgendetwas rot wird.
// Darum diese eine Prüfung auf die Quelle der Spalte.
console.log('\n═══ 4b — Kundennummer im Adress-Export kommt aus adressen.id ═══');
{
  const adr = soll['05_adressen.sql'] || '';
  t('«knummer» wird aus a.id gebildet (nicht aus oknummer)',
    /\ba\.id\s+AS\s+knummer\b/i.test(adr) && !/\ba\.oknummer\s+AS\s+knummer\b/i.test(adr),
    (/AS\s+knummer/i.exec(adr) || ['—'])[0]);
  t('die alte «oknummer» geht trotzdem nicht verloren', /\boknummer\b/i.test(adr));
}

// ═══ 5 — Runner ═══
console.log('\n═══ 5 — export.ps1 hält die Parser-Voraussetzungen ein ═══');
const ps = fs.readFileSync(path.join(ROOT, 'erp_export', 'export.ps1'), 'utf8');
t('mysql --batch (Tab, Kopfzeile, NULL als Wort, Escapes)', /--batch/.test(ps));
t('UTF-8 aus dem Client (--default-character-set=utf8)', /--default-character-set=utf8/.test(ps));
t('Bytes unverändert in die Datei (cmd.exe-Umleitung, keine PowerShell-Textpipeline)', /cmd\.exe\s+\/c/.test(ps) && !/Out-File[^\n]*\.tsv/.test(ps));
t('Dateien enden auf .tsv (Kennung für den mysql-Modus des Parsers)', /\.tsv/.test(ps));
t('Jahresscheiben: {{JAHR}} wird je Jahr ersetzt', /\{\\\{JAHR\\\}\}/.test(ps) || /JAHR/.test(ps));
t('liest nur die Kopie: kein Live-Host, Bind auf 127.0.0.1', /127\.0\.0\.1/.test(ps) && !/--host=(?!127)/.test(ps));
t('Server wird am Ende beendet (finally)', /finally/.test(ps) && /shutdown/.test(ps));
t('Fehler je Abfrage werden protokolliert, nicht verschluckt', /\.err/.test(ps) && /FEHLER/.test(ps));

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen' : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
