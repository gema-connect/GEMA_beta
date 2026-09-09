// Drift-Guard — ERP-Migration: der Datei-Parser gegen echte Export-Formate
//
// Das Export-Paket (erp_export/export.ps1) liefert `mysql --batch`-Dateien:
// Tab-getrennt, nie gequotet, NULL als Wort, Tab/Zeilenumbruch/Backslash als
// \t \n \\ escapt. Der Parser kannte das nicht — «NULL» wäre als E-Mail
// angekommen, ein Zoll-Zeichen («Rohr 1/2"») hätte als öffnendes
// Anführungszeichen den Rest der Datei geschluckt.
//
// Absicht, nicht Wortlaut: geprüft wird, was aus einer Datei herauskommt.
//
// Aufruf:  node scripts/erp_parser_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
let n = 0, fail = 0;
function t(name, cond) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } }
function eq(name, a, b) { const ok = JSON.stringify(a) === JSON.stringify(b); t(name + (ok ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), ok); }

// Engine-Block ohne Browser laden
const src = fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8');
const m = /\/\*[^\n]*ENGINE-START[^\n]*\*\/([\s\S]*?)\/\*[^\n]*ENGINE-END[^\n]*\*\//.exec(src);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + '\nreturn {parseCsv:parseCsv, s:s};')();
const rows = (text, opts) => E.parseCsv(text, opts).sheets[0].rows;

// ═══ 1 — mysql --batch: NULL, Escapes, Zoll-Zeichen ═══
{
  console.log('\n═══ 1 — mysql --batch (.tsv) ═══');
  const tsv = 'id\tname\temail\tbemerkung\n'
    + '1\tRohr 1/2" verzinkt\tNULL\tZeile 1\\nZeile 2\n'
    + '2\tMüller AG\tinfo@mueller.ch\tPfad C:\\\\daten\\tTab\n'
    + '3\t"Spezial" Ventil\tNULL\tNULL\n';
  const r = rows(tsv, { mysql: true });
  eq('vier Zeilen (Kopf + 3), nichts verschluckt', r.length, 4);
  eq('Zoll-Zeichen bleibt Text', r[1][1], 'Rohr 1/2" verzinkt');
  eq('NULL wird leer', r[1][2], '');
  eq('\\n wird zum Zeilenumbruch', r[1][3], 'Zeile 1\nZeile 2');
  eq('\\\\ wird zum Backslash, \\t zum Tab', r[2][3], 'Pfad C:\\daten\tTab');
  eq('Umlaute unverändert', r[2][1], 'Müller AG');
  eq('Anführungszeichen am Feldanfang bleiben im mysql-Modus Text', r[3][1], '"Spezial" Ventil');
  eq('mehrere NULL in einer Zeile', [r[3][2], r[3][3]], ['', '']);
}

// ═══ 2 — Gegenprobe: dieselbe Datei OHNE mysql-Modus ═══
{
  console.log('\n═══ 2 — Gegenprobe: .csv/.txt kennt keine mysql-Regeln ═══');
  const tsv = 'id\tname\temail\n1\tRohr 1/2"\tNULL\n2\tX\tNULL\n';
  const r = rows(tsv, {});
  eq('NULL bleibt ohne mysql-Modus das Wort NULL', r[1][2], 'NULL');
  eq('Zoll-Zeichen mitten im Feld schluckt trotzdem nichts', r.length, 3);
  eq('… und bleibt Text', r[1][1], 'Rohr 1/2"');
}

// ═══ 3 — RFC-CSV: Quotes, "" , eingebettete Umbrüche, Trennzeichen ═══
{
  console.log('\n═══ 3 — CSV aus Excel/LibreOffice ═══');
  const csv = '\uFEFFnr;text;betrag\r\n1;"Zeile 1\r\nZeile 2";10,5\r\n2;"sagt ""hallo""";3\r\n3;Rohr 1/2";4\r\n';
  const r = rows(csv, {});
  eq('BOM entfernt', r[0][0], 'nr');
  eq('eingebetteter Umbruch im Quote', r[1][1], 'Zeile 1\nZeile 2');
  eq('"" → "', r[2][1], 'sagt "hallo"');
  eq('Zoll-Zeichen ohne Quote bleibt Text', r[3][1], 'Rohr 1/2"');
  eq('Semikolon erkannt, drei Spalten', r.map(x => x.length), [3, 3, 3, 3]);
  const komma = rows('a,b\n1,"x,y"\n', {});
  eq('Komma-CSV mit Quote', komma[1], ['1', 'x,y']);
}

// ═══ 4 — mysql-Modus greift nur bei Tab-Dateien ═══
{
  console.log('\n═══ 4 — mysql-Regeln nur, wenn die Datei Tab-getrennt ist ═══');
  const r = rows('a;b\n1;NULL\n', { mysql: true });
  eq('Semikolon-Datei: NULL bleibt Wort', r[1][1], 'NULL');
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen' : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
