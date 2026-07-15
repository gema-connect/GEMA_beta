#!/usr/bin/env node
/* Osmose — Tankoptimierung (24-h-Profil): Engine-Test (Node, ohne Browser)
 *
 * Prüft den /*ENGINE-START*​/-Block aus sa_osmose.html:
 *   osmVerteil24, osmTankProfil, osmTankMin
 * Die Excel-Vorlage «Berechnung_Gegenosmose.xlsm / Bedarf-Tankoptimierung»
 * enthält keine Beispieldaten (alle Cached-Werte 0) — geprüft wird gegen
 * unabhängig berechnete Formelwerte UND gegen eine 1:1-Nachbildung der
 * Excel-Zellkette (Zeilen 14/15/26/27/16): mit prod[0]=0 ist die (auf
 * User-Entscheid) korrigierte GEMA-Rechnung zellidentisch mit der Vorlage;
 * der Korrektur-Fall (Produktion 00–01 zählt im Füllstand) ist separat belegt.
 *
 * Ausführen: node scripts/osmose_tankopt_test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'sa_osmose.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
new Function(m[1])();
const { osmVerteil24, osmTankProfil, osmTankMin } = globalThis;

let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}
function eq(a, b, label) {
  const pass = Math.abs(a - b) < 1e-9;
  ok(pass, label + ' (' + a + (pass ? ' == ' : ' != ') + b + ')');
}
const sum = arr => arr.reduce((s, v) => s + v, 0);

// Excel-Zellkette 1:1 (Bedarf-Tankoptimierung):
//   Zeile 14 = Σ Bedarf je Stunde · Zeile 15 = kumuliert
//   Zeile 26: D26 = D23 (Startfüllung), ab E26 = Produktion der Stunde
//   Zeile 27 = kumuliert · Zeile 16 (Füllstand) = Zeile27 − Zeile15
function excelKette(bedarfRows, prod, startTank) {
  const r14 = [], r15 = [], r26 = [], r27 = [], r16 = [];
  let kb = 0, kp = 0;
  for (let h = 0; h < 24; h++) {
    let b = 0; bedarfRows.forEach(r => { b += r[h] || 0; });
    r14.push(b); kb += b; r15.push(kb);
    r26.push(h === 0 ? startTank : (prod[h] || 0));
    kp += r26[h]; r27.push(kp);
    r16.push(r27[h] - r15[h]);
  }
  return { r14, r15, r16, r27 };
}

console.log('■ osmVerteil24 — Verteil-Helfer');
{
  const a = osmVerteil24(100, 3, 6);
  ok(a[6] === 100 && a[7] === 100 && a[8] === 100 && a[5] === 0 && a[9] === 0, '100 l/h × 3 h ab 06 → Stunden 06/07/08');
  eq(sum(a), 300, 'Summe = 300 l');
}
{
  const a = osmVerteil24(100, 2.5, 22);
  ok(a[22] === 100 && a[23] === 100 && Math.abs(a[0] - 50) < 1e-9, '2.5 h ab 22 → 22/23 voll, 00 halbe Stunde (zirkulär über Mitternacht)');
  eq(sum(a), 250, 'Summe = 250 l');
}
{
  const a = osmVerteil24(10, 30, 0);
  ok(a.every(v => Math.abs(v - 10) < 1e-9), 'Stunden > 24 werden auf 24 gekappt (alle Stunden 10 l)');
  eq(sum(a), 240, 'Summe = 240 l');
}
eq(sum(osmVerteil24(0, 8, 6)), 0, 'Wert 0 → leeres Profil');
eq(sum(osmVerteil24(100, 0, 6)), 0, 'Stunden 0 → leeres Profil');
{
  const a = osmVerteil24(50, 2, 30);   // ab ausserhalb → geklemmt auf 23
  ok(a[23] === 50 && a[0] === 50, 'Startstunde 30 → geklemmt auf 23 (wrap in Stunde 00)');
}

console.log('■ osmTankProfil — Handfall (unabhängig berechnet)');
// Verbraucher: 100 l/h von 08–16 (8 h = 800 l/d) · Produktion: 200 l/h von 02–06 (4 h = 800 l)
const BED = [osmVerteil24(100, 8, 8)];
const PROD = osmVerteil24(200, 4, 2);
{
  const p = osmTankProfil(BED, PROD, 0);
  eq(p.bedarfH[8], 100, 'Bedarf Stunde 08 = 100');
  eq(p.kumBedarf[23], 800, 'kum. Bedarf Tagesende = 800');
  eq(p.kumProd[5], 800, 'kum. Produktion nach 06 Uhr = 800');
  eq(p.fuellstand[1], 0, 'Füllstand 01 (vor Produktion) = 0');
  eq(p.fuellstand[5], 800, 'Füllstand 06 Uhr = 800 (voll produziert)');
  eq(p.fuellstand[11], 800 - 400, 'Füllstand 12 Uhr = 800 − 4×100');
  eq(p.fuellstand[23], 0, 'Füllstand Tagesende = 0 (Produktion = Bedarf)');
  eq(p.maxStand, 800, 'maxStand = 800');
  eq(p.minStand, 0, 'minStand = 0');
}

console.log('■ Excel-Parität — prod[0]=0 ⇒ zellidentisch mit der Vorlage (D26=D23)');
{
  const start = 450;
  const p = osmTankProfil(BED, PROD, start);            // PROD hat prod[0]=0
  const xl = excelKette(BED, PROD, start);
  let all = true;
  for (let h = 0; h < 24; h++) if (Math.abs(p.fuellstand[h] - xl.r16[h]) > 1e-9) all = false;
  ok(all, 'alle 24 Füllstände identisch mit Excel-Zeile 16');
  let all15 = true;
  for (let h = 0; h < 24; h++) if (Math.abs(p.kumBedarf[h] - xl.r15[h]) > 1e-9) all15 = false;
  ok(all15, 'kumulierter Bedarf identisch mit Excel-Zeile 15');
}

console.log('■ Korrektur (User-Entscheid) — Produktion 00–01 zählt im Füllstand');
{
  const prod0 = PROD.slice(); prod0[0] = 120;           // Produktion in Stunde 00–01
  const p = osmTankProfil(BED, prod0, 100);
  const xl = excelKette(BED, prod0, 100);               // Vorlage verschluckt die 120 l
  eq(p.fuellstand[0] - xl.r16[0], 120, 'GEMA-Füllstand liegt exakt um die Stunde-0-Produktion über der Excel-Kette');
  eq(p.fuellstand[0], 100 + 120 - 0, 'Füllstand 00 = Start + Produktion − Bedarf');
}

console.log('■ Warn-Grenzen (Vorlage: >Tank «zu viel», <50 «zu wenig»)');
{
  // Überlauf: Tank startet voll — jede Netto-Mehrproduktion überschreitet die Tankgrösse
  const p = osmTankProfil([osmVerteil24(50, 4, 8)], osmVerteil24(100, 4, 2), 200);
  ok(p.maxStand > 200, 'Netto-Überschuss → Füllstand über Tankgrösse (Überlauf-Warnung)');
  // Reserve: ohne Produktion fällt der Stand unter 50
  const q = osmTankProfil([osmVerteil24(100, 4, 8)], [], 300);
  ok(q.minStand < 50, 'ohne Produktion sinkt der Stand unter die 50-l-Reserve');
}

console.log('■ osmTankMin — minimal nötige Startfüllung (Reserve 50 l)');
{
  // Bedarf 800 l ab 06 (200×4), Produktion 100 l/h ab 06 über 8 h:
  // grösstes kumuliertes Defizit = 400 (um 10 Uhr) → min = 450
  const rows = [osmVerteil24(200, 4, 6)];
  const prod = osmVerteil24(100, 8, 6);
  eq(osmTankMin(rows, prod), 450, 'max. Defizit 400 + Reserve 50 = 450 l');
  const p = osmTankProfil(rows, prod, 450);
  eq(p.minStand, 50, 'mit 450 l Startfüllung fällt der Stand exakt auf die 50-l-Reserve');
  // Produktion VOR dem Bedarf → kein Defizit → nur Reserve
  eq(osmTankMin(rows, osmVerteil24(200, 4, 0)), 50, 'Produktion komplett vor dem Bedarf → min = Reserve 50 l');
  // eigene Reserve
  eq(osmTankMin(rows, prod, 100), 500, 'Reserve-Parameter 100 l → 500 l');
  eq(osmTankMin([], [], 50), 50, 'leeres Profil → Reserve');
}

console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
