#!/usr/bin/env node
/* Schadensbericht — Drift-Guard: Tage-Zählung Modul ⇄ PDF-Vorlage
 *
 * Der Vorlage-Export (gema_schaden_pdf.js) zeigte pro Gerät einen Tag
 * WENIGER als die Berichtserfassung (sd_schadensbericht.html): das Modul
 * zählt Tag-INKLUSIV (Start- und End-Tag, 10.07.–15.07. = 6 Tage), der
 * Export zählte nur die Differenz (5) und liess bei laufenden Geräten den
 * «bis heute»-Fallback weg. Dieser Test extrahiert die Helfer aus BEIDEN
 * Dateien und failt bei jeder künftigen Abweichung (Tage, Stunden, kWh).
 *
 * Ausführen: node scripts/schaden_tage_konsistenz_test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const modHtml = readFileSync(join(ROOT, 'sd_schadensbericht.html'), 'utf8');
const pdfJs = readFileSync(join(ROOT, 'gema_schaden_pdf.js'), 'utf8');

let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}

// Funktion per Namen aus Quelltext schneiden (top-level bzw. 2-Spaces-IIFE)
function grab(src, name, indent) {
  const pad = indent || '';
  const re = new RegExp('(^|\\n)' + pad + 'function ' + name + '\\s*\\(([\\s\\S]*?)\\n' + pad + '\\}', '');
  const m = src.match(re);
  if (!m) throw new Error('Funktion nicht gefunden: ' + name);
  return m[0];
}

// ── Modul-Seite (Referenz) ───────────────────────────────────────────
const modSrc = [
  'function sdToday(){ return globalThis.__TODAY__; }',
  grab(modHtml, 'sdDaysBetween'),
  grab(modHtml, 'sdGeraetStart'),
  grab(modHtml, 'sdGeraetEnde'),
  grab(modHtml, 'sdComputeKwh'),
  grab(modHtml, 'sdComputeHours'),
  grab(modHtml, 'sdGeraetTage'),
  'return { sdDaysBetween, sdGeraetTage, sdComputeHours, sdComputeKwh };'
].join('\n');
const MOD = new Function(modSrc)();

// ── PDF-Vorlage ──────────────────────────────────────────────────────
const pdfSrc = [
  grab(pdfJs, 'daysBetween', '  '),
  'function todayIso(){ return globalThis.__TODAY__; }',   // deterministisch
  grab(pdfJs, 'geraetStart', '  '),
  grab(pdfJs, 'geraetTage', '  '),
  grab(pdfJs, 'computeKwh', '  '),
  grab(pdfJs, 'computeHours', '  '),
  'return { daysBetween, geraetTage, computeHours, computeKwh };'
].join('\n');
const PDF = new Function(pdfSrc)();

globalThis.__TODAY__ = '2026-07-15';

console.log('■ Tageszählung: Datumspaare Modul == PDF (Tag-inklusiv)');
const PAARE = [
  ['2026-07-10', '2026-07-15', 6, '10.07.–15.07. = 6 Tage (inklusiv)'],
  ['2026-07-10', '2026-07-10', 1, 'gleicher Tag = 1 Tag'],
  ['2026-07-10', '2026-07-11', 2, 'Folgetag = 2 Tage'],
  ['2026-06-28', '2026-07-03', 6, 'über Monatswechsel'],
  ['2025-12-30', '2026-01-02', 4, 'über Jahreswechsel'],
  ['2026-03-28', '2026-03-30', 3, 'über Sommerzeit-Umstellung (CH 29.03.)'],
];
PAARE.forEach(([a, b, soll, label]) => {
  const m = MOD.sdDaysBetween(a, b);
  const p = PDF.daysBetween(a, b);
  ok(m === soll && p === soll, label + ' — Modul ' + m + ' / PDF ' + p);
});
ok(MOD.sdDaysBetween('2026-07-10T08:23:11.000Z', '2026-07-15T17:02:00.000Z') === 6, 'Modul: volle ISO-Timestamps → datumsstabil 6 Tage');
ok(PDF.daysBetween('2026-07-10T08:23:11.000Z', '2026-07-15T17:02:00.000Z') === 6, 'PDF: volle ISO-Timestamps → datumsstabil 6 Tage');

console.log('■ Geräte-Tage: alle Fallback-Ketten identisch');
const TR = { gestartetAm: '2026-07-08', beendetAm: '2026-07-14' };
const TR_LAUFEND = { gestartetAm: '2026-07-10', beendetAm: null };
const GERAETE = [
  [{ id: 'g1', eingesetztAm: '2026-07-10', entferntAm: '2026-07-15' }, TR, 6, 'explizite Start/Ende-Daten'],
  [{ id: 'g2', einsatz: { eingesetztAm: '2026-07-09' }, zurueckAm: '2026-07-12' }, TR, 4, 'Einsatz-Datum + zurueckAm (TG-Modul)'],
  [{ id: 'g3' }, TR, 7, 'ohne Geräte-Daten → Trocknungs-Start bis -Ende'],
  [{ id: 'g4', eingesetztAm: '2026-07-12' }, TR_LAUFEND, 4, 'laufendes Gerät → bis HEUTE (nicht «—»)'],
  [{ id: 'g5' }, TR_LAUFEND, 6, 'laufend ohne Geräte-Daten → Trocknungs-Start bis heute'],
  [{ id: 'dev_1783500000000_x' }, {}, null, 'dev_<ts>-Fallback ohne Phase (bis heute)'],
];
GERAETE.forEach(([g, tr, _soll, label]) => {
  const m = MOD.sdGeraetTage(g, tr);
  const p = PDF.geraetTage(g, tr);
  ok(m === p && (_soll == null || m === _soll), label + ' — Modul ' + m + ' / PDF ' + p);
});

console.log('■ Laufzeit-Geräte (Ventilator): Stunden + kWh identisch');
{
  const g = { id: 'v1', zaehlerTyp: 'laufzeit', kw: '0.5', stundenProTag: '8', eingesetztAm: '2026-07-10', entferntAm: '2026-07-15' };
  const tM = MOD.sdGeraetTage(g, TR), tP = PDF.geraetTage(g, TR);
  const hM = MOD.sdComputeHours(g, TR), hP = PDF.computeHours(g, tP);
  const kM = MOD.sdComputeKwh(g, TR), kP = PDF.computeKwh(g, tP);
  ok(tM === 6 && tP === 6, 'Tage 6/6 (inklusiv)');
  ok(hM === 48 && hP === 48, 'Stunden 6 Tage × 8 h = 48 h beidseitig');
  ok(kM === 24 && kP === 24, 'Energie 48 h × 0.5 kW = 24 kWh beidseitig');
  const g2 = { id: 'v2', zaehlerTyp: 'laufzeit', kw: '0.5', stundenTotal: '30' };
  ok(MOD.sdComputeKwh(g2, TR) === 15 && PDF.computeKwh(g2, PDF.geraetTage(g2, TR)) === 15, 'stundenTotal-Override 30 h × 0.5 kW = 15 kWh beidseitig');
}
{
  // Stunden-Zähler bleibt zählerbasiert (Tage spielen keine Rolle)
  const g = { id: 's1', zaehlerTyp: 'stunden', kw: '1.2', zaehlerStart: 100, zaehlerEnde: 150 };
  ok(MOD.sdComputeKwh(g, TR) === 60 && PDF.computeKwh(g, PDF.geraetTage(g, TR)) === 60, 'Stunden-Zähler: 50 h × 1.2 kW = 60 kWh beidseitig');
}

console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
