// Generator — Export-Paket der ERP-Migration aus dem Konzept
//
// Die Export-Abfragen stehen EINMAL im Konzept (KONZEPT_ERP_Migration_
// Altsystem.md, Kapitel 8), dort mit Herleitung und Fallen. Damit sie
// ausführbar werden, ohne dass jemand 16 Blöcke von Hand in PowerShell
// kopiert, schreibt dieses Script jeden markierten Block als Datei nach
// erp_export/sql/. Der Runner erp_export/export.ps1 arbeitet diese Dateien ab.
//
// Markierung im Konzept, unmittelbar vor dem ```sql-Zaun:
//     <!-- export: 07_offerten -->
// Name = NN_<sektion>[_<variante>][.jahre]. NN ist die Import-Reihenfolge,
// <sektion> die Sektions-ID des Importers (gema_erp_import.js, SEKTIONEN),
// «.jahre» kennzeichnet die Hilfsabfrage, die für eine Abfrage mit dem
// Platzhalter {{JAHR}} die Liste der Jahre liefert (Jahresscheiben).
//
// Aufruf:  node scripts/erp_export_gen.mjs          (schreibt erp_export/sql/)
// Guard:   scripts/erp_export_test.mjs prüft, dass das Generat aktuell ist
//          und jede Spalte der Abfragen vom Importer erkannt wird.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
export const KONZEPT = path.join(ROOT, 'KONZEPT_ERP_Migration_Altsystem.md');
export const ZIEL = path.join(ROOT, 'erp_export', 'sql');
export const NAME_RE = /^(\d{2})_([a-z]+)((?:_[a-z0-9]+)*)(\.jahre)?$/;

/* Liest alle markierten Blöcke: [{name, sql, zeile}] in Dokumentreihenfolge. */
export function bloeckeLesen(text) {
  const zeilen = String(text).split('\n');
  const out = [];
  for (let i = 0; i < zeilen.length; i++) {
    const m = /^<!--\s*export:\s*([^\s>]+)\s*-->\s*$/.exec(zeilen[i]);
    if (!m) continue;
    const name = m[1];
    if (!NAME_RE.test(name)) throw new Error(`Zeile ${i + 1}: ungültiger Export-Name «${name}» (erwartet NN_sektion[_variante][.jahre])`);
    let j = i + 1;
    while (j < zeilen.length && zeilen[j].trim() === '') j++;
    if (!/^```sql\s*$/.test(zeilen[j] || '')) throw new Error(`Zeile ${i + 1}: auf die Markierung «${name}» folgt kein \`\`\`sql-Block`);
    const start = j + 1;
    let k = start;
    while (k < zeilen.length && !/^```\s*$/.test(zeilen[k])) k++;
    if (k >= zeilen.length) throw new Error(`Zeile ${start}: der SQL-Block «${name}» wird nicht geschlossen`);
    const sql = zeilen.slice(start, k).join('\n').trim();
    if (!sql) throw new Error(`Block «${name}» ist leer`);
    if (out.some(b => b.name === name)) throw new Error(`Export-Name «${name}» kommt doppelt vor`);
    out.push({ name, sql, zeile: i + 1 });
    i = k;
  }
  return out;
}

/* Dateiinhalt je Block — der Kopf sagt, woher die Datei stammt. */
export function dateiInhalt(b) {
  let sql = b.sql;
  if (!/;\s*$/.test(sql)) sql += ';';
  return [
    `-- GEMA ERP-Migration — Export «${b.name}»`,
    `-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile ${b.zeile}) durch scripts/erp_export_gen.mjs.`,
    '-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.',
    '-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).',
    '',
    sql,
    ''
  ].join('\n');
}

/* Erzeugt {dateiname → inhalt} aus dem Konzepttext. */
export function generiere(text) {
  const dateien = {};
  for (const b of bloeckeLesen(text)) dateien[b.name + '.sql'] = dateiInhalt(b);
  return dateien;
}

function main() {
  const dateien = generiere(fs.readFileSync(KONZEPT, 'utf8'));
  fs.mkdirSync(ZIEL, { recursive: true });
  const soll = new Set(Object.keys(dateien));
  let neu = 0, gleich = 0, weg = 0;
  for (const n of Object.keys(dateien).sort()) {
    const p = path.join(ZIEL, n);
    const alt = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (alt === dateien[n]) { gleich++; continue; }
    fs.writeFileSync(p, dateien[n]);
    neu++;
    console.log('  ' + (alt == null ? '+ ' : '~ ') + n);
  }
  for (const n of fs.readdirSync(ZIEL)) {
    if (/\.sql$/.test(n) && !soll.has(n)) { fs.unlinkSync(path.join(ZIEL, n)); weg++; console.log('  - ' + n + ' (im Konzept nicht mehr markiert)'); }
  }
  console.log(`erp_export/sql: ${Object.keys(dateien).length} Abfragen — ${neu} geschrieben, ${gleich} unverändert, ${weg} entfernt`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
