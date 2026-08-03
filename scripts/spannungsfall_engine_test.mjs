/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test Spannungsfall & Verlustleistung (el_spannungsfall.html)
   ════════════════════════════════════════════════════════════════════════
   Prüft den ENGINE-Block gegen UNABHÄNGIG gerechnete Werte — die
   Erwartungen stehen als ausgeschriebene Formel im Test, nicht als Kopie der
   Implementierung. Kein Browser nötig.

     node scripts/spannungsfall_engine_test.mjs

   Referenzfall (von Hand nachgerechnet, κ = 58 für die Vergleichbarkeit mit
   veröffentlichten Rechnern):
     400 V / 2.5 mm² / 16 A / 100 m / cos φ 1
       ΔU  = √3 · 16 · 100 / (58 · 2.5) = 2771.2813 / 145 = 19.1123 V
       Δu  = 19.1123 / 400 · 100        = 4.7781 %
       P_V = 3 · 256 · 100 / 145        = 529.6552 W
       R   = 100 / 145                  = 0.689655 Ω
       L_max bei 3 % = 12 · 145 / (√3 · 16) = 62.79 m
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const nah = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' — ist ' + a + ', erwartet ' + b);

/* Fachbasis + Engine in denselben Kontext laden (die Engine ruft GemaElektro). */
const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const html = readFileSync(join(ROOT, 'el_spannungsfall.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const sfCalc = new Function('GemaElektro', m[1] + '; return sfCalc;')(w.GemaElektro);

const basis = {
  system: '3p400', strom: 16, laenge: 100, quer: 2.5, parallel: 1,
  material: 'cu58', temp: 20, cosPhi: 1, grenz: 3,
  hTag: 8, tage: 250, jahre: 1, auslast: 100, preis: 0.25
};
const K58 = 58, A = 2.5, I = 16, L = 100;

/* ── Referenzfall dreiphasig ─────────────────────────────────────────── */
{
  const r = sfCalc(basis);
  ok(r.leer === false, 'vollständige Eingabe → gerechnet');
  nah(r.kappa, K58, 1e-9, 'κ = 58 bei 20 °C');
  nah(r.aEff, A, 1e-9, 'A_eff = 2.5 mm² (ohne Parallelschaltung)');
  nah(r.dU, Math.sqrt(3) * I * L / (K58 * A), 1e-9, 'ΔU nach Formel');
  nah(r.dU, 19.1123, 0.001, 'ΔU ≈ 19.11 V');
  nah(r.dUPct, 19.1123 / 400 * 100, 0.001, 'Δu ≈ 4.78 %');
  nah(r.pV, 3 * I * I * L / (K58 * A), 1e-9, 'P_V nach Formel');
  nah(r.pV, 529.6552, 0.001, 'P_V ≈ 529.66 W');
  nah(r.r, L / (K58 * A), 1e-9, 'R (eine Ader) = L/(κ·A)');
  nah(r.r, 0.689655, 1e-5, 'R ≈ 0.6897 Ω');
  /* Gegenprobe: die Faktoren fU/fP müssen zueinander passen */
  nah(r.pV, 3 * I * I * r.r, 1e-9, 'Gegenprobe P_V = 3 · I² · R');
  ok(r.ampel === 'err', '4.78 % über 3 % → rot');
  nah(r.ausnutzung, 4.7781 / 3, 0.001, 'Ausnutzung ≈ 159 %');
  nah(r.duZul, 12, 1e-9, 'ΔU_zul = 400 · 3 % = 12 V');
  nah(r.lMax, 12 * K58 * A / (Math.sqrt(3) * I), 1e-9, 'L_max nach Formel');
  nah(r.lMax, 62.79, 0.01, 'L_max ≈ 62.8 m');
}

/* Rückprobe: bei L = L_max muss Δu exakt den Grenzwert treffen */
{
  const r0 = sfCalc(basis);
  const r1 = sfCalc({ ...basis, laenge: r0.lMax });
  nah(r1.dUPct, 3, 1e-9, 'bei L = L_max ist Δu genau der Grenzwert');
}

/* Querschnitts-Vorschlag: erforderlich 3.98 mm² → 4 mm², danach eingehalten */
{
  const r = sfCalc(basis);
  nah(r.reqA, Math.sqrt(3) * I * L / (K58 * 12), 1e-9, 'erforderlicher Querschnitt nach Formel');
  nah(r.reqA, 3.9817, 0.001, 'erforderlich ≈ 3.98 mm²');
  ok(r.empfQ === 4, 'Vorschlag = 4 mm² (nächste Normgrösse)');
  const r4 = sfCalc({ ...basis, quer: 4 });
  ok(r4.dUPct <= 3, 'mit 4 mm² wird der Grenzwert eingehalten — ist ' + r4.dUPct.toFixed(3) + ' %');
  ok(r4.ampel !== 'err', 'mit 4 mm² keine Grenzwert-Überschreitung');
}

/* ── Einphasig 230 V ─────────────────────────────────────────────────── */
{
  const r = sfCalc({ ...basis, system: '1p230' });
  nah(r.dU, 2 * I * L / (K58 * A), 1e-9, 'einphasig: ΔU = 2·I·L/(κ·A)');
  nah(r.dU, 22.069, 0.001, 'einphasig ΔU ≈ 22.07 V');
  nah(r.dUPct, 22.069 / 230 * 100, 0.001, 'einphasig Δu ≈ 9.60 %');
  nah(r.pV, 2 * I * I * L / (K58 * A), 1e-9, 'einphasig: P_V = 2·I²·L/(κ·A)');
  nah(r.r, 2 * L / (K58 * A), 1e-9, 'einphasig: R ist die Schleife (2·L)');
  nah(r.pV, I * I * r.r, 1e-9, 'Gegenprobe einphasig P_V = I² · R_schleife');
  ok(r.einphasig === true, 'einphasig erkannt');
  /* Praxis-Faustregel: 2.5 mm² bei 16 A und 3 % reicht rund 31 m weit */
  nah(r.lMax, 6.9 * K58 * A / (2 * I), 1e-9, 'einphasig L_max nach Formel');
  nah(r.lMax, 31.27, 0.01, 'einphasig L_max ≈ 31.3 m');
}

/* ── Temperaturabhängigkeit ──────────────────────────────────────────── */
{
  const kalt = sfCalc({ ...basis, temp: 20 });
  const warm = sfCalc({ ...basis, temp: 70 });
  ok(warm.dU > kalt.dU, 'bei 70 °C ist der Spannungsfall grösser als bei 20 °C');
  nah(warm.dU / kalt.dU, 1 + 0.00393 * 50, 1e-9, 'Verhältnis entspricht (1 + α·ΔT)');
  ok(warm.dU / kalt.dU > 1.19, 'rund 20 % Unterschied — κ₂₀ rechnet zu günstig');
  ok(kalt.hinweise.some(h => h.typ === 'warn' && /20 °C/.test(h.text)),
     'bei 20 °C wird auf die zu günstige Rechnung hingewiesen');
  ok(!warm.hinweise.some(h => /20 °C/.test(h.text)),
     'bei 70 °C entfällt dieser Hinweis');
}

/* ── Parallele Leiter ────────────────────────────────────────────────── */
{
  const einer = sfCalc({ ...basis, quer: 25, parallel: 1 });
  const zwei  = sfCalc({ ...basis, quer: 25, parallel: 2 });
  nah(zwei.aEff, 50, 1e-9, '2 × 25 mm² → A_eff 50 mm²');
  nah(zwei.dU, einer.dU / 2, 1e-9, 'doppelter Querschnitt → halber Spannungsfall');
  ok(zwei.hinweise.some(h => /Parallel/i.test(h.text)),
     'Parallelschaltung unter 70 mm² wird gemeldet');
  const gross = sfCalc({ ...basis, quer: 95, parallel: 2 });
  ok(!gross.hinweise.some(h => /Parallel/i.test(h.text)),
     'ab 70 mm² je Leiter kein Parallel-Hinweis');
  const alu = sfCalc({ ...basis, quer: 70, parallel: 2, material: 'al' });
  ok(alu.hinweise.some(h => /Parallel/i.test(h.text)),
     'Aluminium: Hinweis bis 95 mm²');
}

/* ── Material ────────────────────────────────────────────────────────── */
{
  const cu = sfCalc({ ...basis, material: 'cu' });
  const al = sfCalc({ ...basis, material: 'al' });
  nah(cu.kappa, 56, 1e-9, 'Cu-Rechenwert κ₂₀ = 56');
  nah(al.dU / cu.dU, 56 / 36, 1e-9, 'Aluminium: Spannungsfall im Verhältnis der Leitfähigkeiten');
}

/* ── cos φ ───────────────────────────────────────────────────────────── */
{
  const r = sfCalc({ ...basis, cosPhi: 0.8 });
  nah(r.dU, Math.sqrt(3) * I * L * 0.8 / (K58 * A), 1e-9, 'cos φ geht linear in ΔU ein');
  const p1 = sfCalc(basis);
  nah(r.pV, p1.pV, 1e-9, 'cos φ ändert die Verlustleistung NICHT (Strom bleibt gleich)');
  const ungueltig = sfCalc({ ...basis, cosPhi: 0 });
  nah(ungueltig.cosPhi, 1, 1e-9, 'cos φ 0 ist unzulässig → Fallback 1');
  const zuGross = sfCalc({ ...basis, cosPhi: 1.4 });
  nah(zuGross.cosPhi, 1, 1e-9, 'cos φ > 1 → Fallback 1');
}

/* ── Reaktanz-Hinweis ab 50 mm² ──────────────────────────────────────── */
{
  const klein = sfCalc({ ...basis, quer: 35 });
  const gross = sfCalc({ ...basis, quer: 50 });
  ok(!klein.hinweise.some(h => /Reaktanz/.test(h.text)), 'unter 50 mm² kein Reaktanz-Hinweis');
  ok(gross.hinweise.some(h => /Reaktanz/.test(h.text)), 'ab 50 mm² Reaktanz-Hinweis');
}

/* ── Kein stiller Deckel über der Normreihe ──────────────────────────── */
{
  const r = sfCalc({ ...basis, laenge: 4000, strom: 200, grenz: 1 });
  ok(r.empfQ === null, 'Bedarf über 630 mm² → kein Vorschlag');
  ok(r.ueberReihe === true, 'ueberReihe gesetzt');
  ok(r.hinweise.some(h => h.typ === 'err' && /grösste genormte/.test(h.text)),
     'Überschreitung der Normreihe wird ausdrücklich gemeldet');
}

/* ── Belastbarkeits-Hinweis immer ────────────────────────────────────── */
{
  const r = sfCalc(basis);
  const h = r.hinweise.find(x => /Strombelastbarkeit/.test(x.text));
  ok(!!h, 'Hinweis auf die Strombelastbarkeit ist immer da');
  ok(h && h.link === 'el_belastbarkeit.html', 'Hinweis verlinkt auf das Belastbarkeits-Modul');
}

/* ── Ampel-Schwellen ─────────────────────────────────────────────────── */
{
  /* 4 mm² → 2.99 % bei Grenzwert 3 % ⇒ über 80 % Ausnutzung ⇒ amber */
  const warn = sfCalc({ ...basis, quer: 4 });
  ok(warn.ampel === 'warn', '2.99 % bei Grenzwert 3 % → amber (' + warn.dUPct.toFixed(2) + ' %)');
  const gut = sfCalc({ ...basis, quer: 16 });
  ok(gut.ampel === 'ok', '16 mm² → grün (' + gut.dUPct.toFixed(2) + ' %)');
  const rot = sfCalc({ ...basis, quer: 2.5 });
  ok(rot.ampel === 'err', '2.5 mm² → rot');
}

/* ── Energie & Kosten ────────────────────────────────────────────────── */
{
  const r = sfCalc(basis);
  nah(r.hGesamt, 2000, 1e-9, 't = 8 · 250 · 1 = 2000 h');
  nah(r.energie, 529.6552 / 1000 * 2000, 0.001, 'E = P_V/1000 · t bei 100 % Auslastung');
  nah(r.energie, 1059.31, 0.01, 'E ≈ 1059.3 kWh');
  nah(r.kosten, 1059.31 * 0.25, 0.01, 'K = E · 0.25 CHF ≈ 264.83');
  /* Die Verluste steigen quadratisch — 50 % Auslastung ⇒ ein Viertel */
  const halb = sfCalc({ ...basis, auslast: 50 });
  nah(halb.energie, r.energie / 4, 1e-9, '50 % Auslastung → ein Viertel der Verlustenergie');
  const leer = sfCalc({ ...basis, auslast: 0 });
  nah(leer.energie, 0, 1e-9, '0 % Auslastung → keine Verlustenergie');
}

/* ── Unvollständige Eingaben ─────────────────────────────────────────── */
{
  ok(sfCalc({ ...basis, strom: 0 }).leer === true, 'ohne Strom wird nicht gerechnet');
  ok(sfCalc({ ...basis, laenge: 0 }).leer === true, 'ohne Länge wird nicht gerechnet');
  ok(sfCalc({ ...basis, quer: 0 }).leer === true, 'ohne Querschnitt wird nicht gerechnet');
  const l = sfCalc({ ...basis, strom: 0 });
  ok(l.dU === undefined && l.kosten === undefined,
     'im Leer-Fall werden keine Zahlen geliefert (statt Werten aus einer 0)');
  ok(isFinite(l.kappa), 'κ steht auch im Leer-Fall zur Verfügung');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
