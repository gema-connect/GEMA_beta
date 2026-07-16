#!/usr/bin/env node
/* Enthärtung — Multistrang-Engine: Node-Test gegen die Excel-Vorlage
 * «Enthaertung_23_Straenge_Berechnung_V2.1.xlsx» (Blatt «Enthärtung 2-3 Stränge»).
 *
 * Beispiel der Vorlage (Cached-Werte):
 *   HR = 39 °fr = 3.9 mmol/l · Strang 1 leer ·
 *   Strang 2: 68 LU (grösster Einzel-LU 3), HW 1 mmol/l, Tagesbedarf 900 l/d ·
 *   Strang 3: 0.19 l/s spez. (Gegenosmose), HW 0, Tagesbedarf 5337 l/d.
 * Erwartet (Zellkette):
 *   N7  Q_W3 Strang 2      = 0.9030012088864853 l/s
 *   P17 V'E Strang 2       = 0.6714624373771301 l/s
 *   K13 Umgehung Strang 2  = 0.2315387715093552 l/s
 *   Z9  Q_D gesamt         = 1.0930012088864853 l/s
 *   Z10 Q_D gesamt m³/h    = 3.9348043519913474
 *   I17 V'E total          = 0.86146243737713   l/s
 *   I24 V'E total m³/h     = 3.1012647745576682
 *   D15 Umgehung total     = 0.2315387715093553 l/s
 *   Z21 CB Strang 2        = 2.61    mol/d
 *   Z24 CB Strang 3        = 20.8143 mol/d
 *   I32 CB total           = 23.4243 mol/d
 *
 * Ausführen: node scripts/enthaertung_multistrang_test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'sa_enthaertung.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const engine = {};
new Function('window', m[1] + '; window.enthW3 = enthW3; window.enthMultistrang = enthMultistrang;')(engine);
const { enthW3, enthMultistrang } = engine;

let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}
function eq(a, b, label, tol) {
  const t = tol == null ? 1e-12 : tol;
  const pass = isFinite(a) && Math.abs(a - b) <= t;
  ok(pass, label + ' (' + a + (pass ? ' ≈ ' : ' ≠ ') + b + ')');
}

console.log('■ enthW3 — W3 Diagramm 1 (LU → l/s)');
eq(enthW3(68, 3), 0.9030012088864853, '68 LU · Einzel-LU 3 → Kurve A (Excel N7)');
eq(enthW3(68, 5), 0.598 * Math.pow(6.8, 0.257), '68 LU · Einzel-LU 5 → Kurve B');
eq(enthW3(2, 3), 0.2, 'LU ≤ 3 → QT = LU/10 (linear)');
eq(enthW3(3, 5), 0.3, 'LU = 3 → 0.3 (Grenze)');
eq(enthW3(200, 5), 0.459 * Math.pow(20, 0.353), 'x > 15 l/s → immer Kurve A (auch Einzel-LU 5)');
eq(enthW3(0, 3), 0, 'LU 0 → 0');
eq(enthW3(-5, 3), 0, 'negativ → 0');

console.log('■ Excel-Parität — Beispiel der Vorlage (3 Stränge, Cached-Werte)');
{
  const r = enthMultistrang({
    hr: 3.9,
    straenge: [
      { luSum: 0, maxLu: 3, sp: 0, hw: 0, tb: 0 },          // Strang 1 (leer)
      { luSum: 68, maxLu: 3, sp: 0, hw: 1, tb: 900 },       // Strang 2
      { luSum: 0, maxLu: 3, sp: 0.19, hw: 0, tb: 5337 }     // Strang 3 (Gegenosmose)
    ]
  });
  eq(r.straenge[1].qdw, 0.9030012088864853, 'Q_W3 Strang 2 (N7)');
  eq(r.straenge[1].ve, 0.6714624373771301, "V'E Strang 2 (P17)", 1e-12);
  eq(r.straenge[1].umg, 0.2315387715093552, 'Umgehung Strang 2 (K13)', 1e-12);
  eq(r.straenge[2].ve, 0.19, "V'E Strang 3 = voll (HW 0, R17=Q9)");
  eq(r.qdwTot, 0.9030012088864853, 'Q_W3 gesamt = W3(Σ LU) (Z7)');
  eq(r.qdTot, 1.0930012088864853, 'Q_D gesamt (Z9)');
  eq(r.qdTot * 3.6, 3.9348043519913474, 'Q_D gesamt m³/h (Z10)', 1e-12);
  eq(r.veTot, 0.86146243737713, "V'E total (I17)", 1e-12);
  eq(r.veTot * 3.6, 3.1012647745576682, "V'E total m³/h (I24)", 1e-12);
  eq(r.umgTot, 0.2315387715093553, 'Umgehung total (D15)', 1e-12);
  eq(r.straenge[1].cb, 2.61, 'CB Strang 2 (Z21)', 1e-12);
  eq(r.straenge[2].cb, 20.8143, 'CB Strang 3 (Z24)', 1e-12);
  eq(r.cbTot, 23.4243, 'CB total (I32)', 1e-12);
  // Im 1-LU-Strang-Fall ist die konservative Summe identisch mit I17
  eq(r.veSum, r.veTot, 'veSum = veTot (nur ein LU-Strang)', 1e-12);
}

console.log('■ Gesamt-Gleichzeitigkeit — zwei LU-Stränge (Kernnutzen der Vorlage)');
{
  const r = enthMultistrang({
    hr: 3.9,
    straenge: [
      { luSum: 40, maxLu: 3, sp: 0, hw: 1, tb: 0 },
      { luSum: 28, maxLu: 3, sp: 0, hw: 1, tb: 0 }
    ]
  });
  const qd1 = enthW3(40, 3), qd2 = enthW3(28, 3);
  eq(r.straenge[0].qd, qd1, 'Q_D Strang 1 = W3(40)');
  eq(r.straenge[1].qd, qd2, 'Q_D Strang 2 = W3(28)');
  eq(r.qdwTot, enthW3(68, 3), 'Q_W3 gesamt = W3(68) < W3(40)+W3(28)');
  ok(r.qdwTot < qd1 + qd2, 'Gleichzeitigkeit: Gesamt-QD kleiner als Summe (' + r.qdwTot.toFixed(4) + ' < ' + (qd1 + qd2).toFixed(4) + ')');
  const f = (3.9 - 1) / 3.9;
  eq(r.fMix, f, 'f_mix = Verschnittfaktor (beide Stränge gleiches HW)', 1e-12);
  eq(r.veTot, f * enthW3(68, 3), "V'E total = f · W3(ΣLU)", 1e-12);
  eq(r.veSum, f * (qd1 + qd2), 'konservative Summe = f · (QD1+QD2)', 1e-12);
  ok(r.veTot < r.veSum, "V'E mit Gleichzeitigkeit < konservative Summe");
}

console.log('■ I17-Generalisierung — Direktlasten in LU-Strängen (Excel L8/N8)');
{
  // Nachbau der Excel-Formel I17 von Hand:
  // ((M17+P17)/(L9+N9))·Z7 + L8·f1 + N8·f2 + Q8·f3
  const hr = 3.9, hw1 = 2, hw2 = 1, hw3 = 0;
  const f1 = (hr - hw1) / hr, f2 = (hr - hw2) / hr, f3 = 1;
  const qdw1 = enthW3(20, 3), qdw2 = enthW3(35, 5);
  const sp1 = 0.3, sp2 = 0.1, sp3 = 0.25;
  const qd1 = qdw1 + sp1, qd2 = qdw2 + sp2;
  const z7 = enthW3(55, 5);   // grösster Einzel-LU gesamt = 5
  const i17 = ((qd1 * f1 + qd2 * f2) / (qd1 + qd2)) * z7 + sp1 * f1 + sp2 * f2 + sp3 * f3;
  const r = enthMultistrang({
    hr: hr,
    straenge: [
      { luSum: 20, maxLu: 3, sp: sp1, hw: hw1, tb: 0 },
      { luSum: 35, maxLu: 5, sp: sp2, hw: hw2, tb: 0 },
      { luSum: 0, maxLu: 3, sp: sp3, hw: hw3, tb: 0 }
    ]
  });
  eq(r.veTot, i17, "V'E total = Excel-I17-Kette (Verschnitt-gewichtete Skalierung + Σ Direkt·f)", 1e-12);
  eq(r.maxLuTot, 5, 'grösster Einzel-LU gesamt = 5 (ein Strang mit 5)');
  eq(r.qdwTot, z7, 'W3 gesamt über Kurve B');
  eq(r.qdTot, z7 + sp1 + sp2 + sp3, 'Q_D gesamt = W3(ΣLU) + Σ Direktlasten');
}

console.log('■ Randfälle');
{
  const r0 = enthMultistrang({ hr: 0, straenge: [{ luSum: 68, maxLu: 3, sp: 0.2, hw: 1, tb: 900 }] });
  eq(r0.veTot, 0, 'HR 0 → V\'E 0 (kein Verschnitt definierbar)');
  eq(r0.cbTot, 0, 'HR 0 → CB 0');
  const r1 = enthMultistrang({ hr: 3.9, straenge: [{ luSum: 0, maxLu: 3, sp: 0.5, hw: 0, tb: 0 }] });
  eq(r1.veTot, 0.5, 'nur Direktlast HW 0 → voll über Enthärter');
  eq(r1.qdwTot, 0, 'keine LU → W3 gesamt 0');
  const r2 = enthMultistrang({ hr: 2, straenge: [{ luSum: 10, maxLu: 3, sp: 0, hw: 5, tb: 1000 }] });
  eq(r2.straenge[0].f, 0, 'HW > HR → Faktor 0 geklemmt (keine negative Enthärtung)');
  eq(r2.cbTot, 0, 'HW > HR → CB 0 geklemmt');
  const r3 = enthMultistrang({ hr: 3.9, straenge: [] });
  eq(r3.qdTot, 0, 'leer → alles 0');
  const r4 = enthMultistrang({
    hr: 3.9,
    straenge: [{ luSum: 68, maxLu: 5, sp: 0, hw: 1, tb: 0 }, { luSum: 2, maxLu: 3, sp: 0, hw: 1, tb: 0 }]
  });
  eq(r4.maxLuTot, 5, 'maxLu gesamt: 5 dominiert');
  // Strang ohne LU aber mit maxLu 5 zählt NICHT für den Gesamt-Einzel-LU
  const r5 = enthMultistrang({
    hr: 3.9,
    straenge: [{ luSum: 68, maxLu: 3, sp: 0, hw: 1, tb: 0 }, { luSum: 0, maxLu: 5, sp: 0.1, hw: 0, tb: 0 }]
  });
  eq(r5.maxLuTot, 3, 'LU-loser Strang beeinflusst grössten Einzel-LU nicht');
}

console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
