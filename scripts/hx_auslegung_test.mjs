#!/usr/bin/env node
/* h,x-Diagramm — Auslegungs-Engine (Lüftungskomponenten): Node-Test
 * Extrahiert den /*ENGINE-START*​/-Block aus lt_hx_diagramm.html (DOM-frei)
 * und prüft die Auslegungsformeln gegen unabhängig berechnete Werte:
 * Mischen (Massenbilanz x/h, Hebelgesetz, Nebel), Lufterhitzer/-kühler
 * (Φ=ṁ·Δh/3600, Zustand nach bei x konstant, erforderlicher ṁ, Kondensat),
 * Kaltwasserseite (ṁW, θ0), WRG (ηθ/ηx mit Massenströmen, Bilanz Fortluft,
 * Kondensat-Erkennung, η-Inverse), Dampf-/adiabate Befeuchtung (hD 2676,
 * Kühlgrenze, ηBef, Roundtrips), Abschlämmung und Ventilatorerwärmung.
 * Ausführen: node scripts/hx_auslegung_test.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'lt_hx_diagramm.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }

const E = new Function(m[1] + `;return {hxDruck,hxPs,hxXs,hxH,hxSolve,hxCalc,hxTfromHX,
  axState,axMisch,axMischanteil,axRegister,axRegisterNach,axRegisterMdot,axKaltwasser,
  axWrg,axWrgEta,axDampf,axDampfNach,axAdiabat,axAdiabatEta,axAbschlaemm,axVentilator};`)();

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}
function near(a, b, tol) { return isFinite(a) && Math.abs(a - b) <= tol; }

const p = E.hxDruck(540);           // Referenzdruck 540 m ü. M. (~950 mbar)
ok(near(p / 100, 950, 2), 'Rechendruck 540 müM ≈ 950 mbar (' + (p / 100).toFixed(1) + ')');

console.log('— axState —');
{
  const s = E.hxSolve('t_phi', 20, 50, p);
  const s2 = E.axState(s.t, s.x, p);
  ok(near(s2.phi, 50, 0.01), 'Roundtrip t+φ → axState: φ = 50 %');
  ok(near(s2.h, s.h, 1e-9), 'Roundtrip: h identisch');
  ok(E.axState(NaN, 0.005, p) === null && E.axState(20, -0.001, p) === null, 'Guards: NaN/negatives x → null');
}

console.log('— Mischen (Massenbilanz + Hebelgesetz) —');
{
  const s1 = E.hxSolve('t_phi', -8, 90, p), s2 = E.hxSolve('t_phi', 22, 50, p);
  const mix = E.axMisch(s1, 1000, s2, 1000, p);
  ok(near(mix.x, (s1.x + s2.x) / 2, 1e-12), '1:1 — xm = (x1+x2)/2 exakt');
  ok(near(mix.h, (s1.h + s2.h) / 2, 1e-9), '1:1 — hm = (h1+h2)/2 exakt');
  ok(near(mix.thetaLinear, 7, 1e-9), '1:1 — lineare Mischformel θm = 7 °C');
  ok(near(mix.t, 7, 0.6), 'θm aus (h,x) nahe der linearen Formel (' + mix.t.toFixed(2) + ' °C)');
  ok(mix.mt === 2000, 'ṁtot = ṁ1+ṁ2');
  const mix31 = E.axMisch(s1, 3000, s2, 1000, p);
  ok(near(mix31.x, (3 * s1.x + s2.x) / 4, 1e-12), '3:1 — Gewichtung über die Massenströme');
  // Nebel: gesättigt warm + gesättigt kalt → Mischpunkt übersättigt
  const w = E.hxSolve('t_phi', 30, 100, p), k = E.hxSolve('t_phi', 0, 100, p);
  ok(E.axMisch(w, 1000, k, 1000, p).uebersaettigt === true, 'gesättigt 30° + 0° → Mischpunkt im Nebelgebiet');
  ok(E.axMisch(null, 1000, s2, 1000, p) === null && E.axMisch(s1, 0, s2, 0, p) === null, 'Guards Mischen');
  ok(near(E.axMischanteil(-8, 22, 7), 0.5, 1e-12), 'Hebelgesetz: θm 7 °C zwischen −8/22 → Anteil 1 = 50 %');
  ok(near(E.axMischanteil(-8, 22, 22), 0, 1e-12) && near(E.axMischanteil(-8, 22, -8), 1, 1e-12), 'Grenzen: θm = θ2 → 0 · θm = θ1 → 1');
  ok(E.axMischanteil(-8, 22, 25) === null && E.axMischanteil(10, 10, 10) === null, 'Ziel ausserhalb / θ1 = θ2 → null');
}

console.log('— Lufterhitzer (Register) —');
{
  const s1 = E.hxSolve('t_phi', 5, 80, p);
  const s2 = E.axState(25, s1.x, p);                        // reine Erwärmung, x konstant
  const r = E.axRegister(s1, s2, 3600);                     // ṁ 3600 kg/h → Φ [kW] = Δh
  const dhSoll = 1.006 * 20 + s1.x * 1.86 * 20;             // Δh = cL·Δθ + x·cD·Δθ
  ok(near(r.phi, dhSoll, 1e-9), 'Φ = ṁ·Δh/3600 (' + r.phi.toFixed(3) + ' kW bei 3600 kg/h)');
  ok(near(r.phiSens, 20.12, 1e-9), 'sensibler Anteil = ṁ·cL·Δθ/3600 = 20.12 kW');
  ok(r.kondensat === 0 && r.wasser === 0 && near(r.dTheta, 20, 1e-9), 'x konstant: kein Kondensat/Wasser, Δθ 20 K');
  const st = E.axRegisterNach(s1, 20, 3600, p);
  ok(near(st.h - s1.h, 20, 1e-9) && st.x === s1.x, 'Zustand nach: Δh = Φ·3600/ṁ, x konstant');
  ok(near(E.axRegister(s1, st, 3600).phi, 20, 1e-9), 'Roundtrip: Register(vor, nach) → Φ = 20 kW');
  const md = E.axRegisterMdot(s1, s2, 10);
  ok(near(md, 10 * 3600 / (s2.h - s1.h), 1e-9), 'erforderlicher ṁ = Φ·3600/Δh');
  ok(near(E.axRegister(s1, s2, md).phi, 10, 1e-9), 'Roundtrip: mit ṁerf → Φ = 10 kW');
  ok(E.axRegisterNach(s1, 0, 3600, p) === null && E.axRegisterMdot(s1, s2, 0) === null, 'Guards Register');
}

console.log('— Luftkühler (nass) + Kaltwasser —');
{
  const s1 = E.hxSolve('t_phi', 32, 60, p), s2 = E.hxSolve('t_phi', 14, 95, p);
  ok(s2.x < s1.x, 'Testfall entfeuchtet (x2 < x1)');
  const r = E.axRegister(s1, s2, 3600);
  ok(r.phi < 0 && r.phiLat < 0, 'Kühlleistung + latenter Anteil negativ');
  ok(near(r.kondensat, 3600 * (s1.x - s2.x), 1e-9) && r.kondensat > 20, 'Kondensat = ṁ·Δx (' + r.kondensat.toFixed(1) + ' kg/h)');
  const kw = E.axKaltwasser(50, 6, 12);
  ok(near(kw.mW, 50 * 3600 / (6 * 4.187), 0.01), 'ṁW = Φ·3600/(ΔθW·cW) = ' + kw.mW.toFixed(0) + ' kg/h');
  ok(near(kw.lMin, kw.mW / 60, 1e-9), 'Umrechnung l/min');
  ok(near(kw.theta0, 10.5, 1e-12), 'θ0 = (6+12)/2 + 1.5 = 10.5 °C');
  ok(E.axKaltwasser(50, 12, 12) === null && E.axKaltwasser(0, 6, 12) === null, 'Guards Kaltwasser');
}

console.log('— Wärmerückgewinnung —');
{
  const sA = E.hxSolve('t_phi', -8, 90, p), sB = E.hxSolve('t_phi', 22, 45, p);
  const w = E.axWrg(sA, sB, 1200, 1200, 75, 0, p);
  ok(near(w.aul2.t, -8 + 0.75 * 30, 1e-9), 'gleiche ṁ: θAUL2 = θAUL1 + ηθ·(θABL1−θAUL1) = 14.5 °C');
  ok(near(w.aul2.x, sA.x, 1e-12), 'ηx = 0 → x konstant');
  ok(near(w.abl2.t, 22 - 22.5, 1e-9), 'Bilanz: θABL2 = −0.5 °C');
  ok(near(w.phi, 1200 * (w.aul2.h - sA.h) / 3600, 1e-9), 'Φ = ṁAUL·Δh/3600');
  ok(w.abl2.uebersaettigt === true, 'Fortluft übersättigt → Kondensat im WRG erkannt');
  const e = E.axWrgEta(sA, w.aul2, sB, 1200, 1200);
  ok(near(e.etaT, 75, 1e-6), 'η-Inverse: ηθ = 75 %');
  ok(near(e.etaX, 0, 1e-6), 'η-Inverse: ηx = 0 %');
  const w2 = E.axWrg(sA, sB, 2000, 1000, 75, 0, p);
  ok(near(w2.aul2.t, -8 + 0.75 * 0.5 * 30, 1e-9), 'ṁAUL 2:1 — θAUL2 = 3.25 °C (Massenstrom-Faktor)');
  ok(near(w2.abl2.t, 22 - 2 * (3.25 + 8), 1e-9), 'Bilanz 2:1 — θABL2 = −0.5 °C');
  ok(near(E.axWrgEta(sA, w2.aul2, sB, 2000, 1000).etaT, 75, 1e-6), 'η-Inverse mit ungleichen ṁ');
  ok(E.axWrg(sA, sB, 0, 1000, 75, 0, p) === null, 'Guard WRG ohne Massenstrom');
}

console.log('— Befeuchtung Dampf —');
{
  const s1 = E.hxSolve('t_phi', 20, 40, p);
  const d = E.axDampfNach(s1, 15, 5000, p);
  ok(near(d.dxG, 3, 1e-9), 'Δx = ṁDampf/ṁL = 3 g/kg');
  ok(near(d.nach.h - s1.h, 2676 * 0.003, 1e-9), 'Δh = hD·Δx (hD = 2676 kJ/kg)');
  ok(Math.abs(d.nach.t - s1.t) < 1, 'Dampf: θ bleibt annähernd konstant (Δ ' + (d.nach.t - s1.t).toFixed(2) + ' K)');
  ok(near(d.phiBef, 5000 * 2676 * 0.003 / 3600, 1e-6), 'ΦBef = ṁ·Δh/3600 = ' + d.phiBef.toFixed(2) + ' kW');
  const r = E.axDampf(s1, d.nach, 5000);
  ok(near(r.mDampf, 15, 1e-6), 'Roundtrip: ṁDampf = ṁL·Δx = 15 kg/h');
  ok(E.axDampfNach(s1, 0, 5000, p) === null, 'Guard Dampfmenge 0');
}

console.log('— Befeuchtung adiabat + Abschlämmung —');
{
  const s1 = E.hxSolve('t_phi', 28, 30, p);
  const a100 = E.axAdiabat(s1, 100, 6000, p);
  ok(near(a100.kuehlgrenze, s1.tw, 1e-9), 'Kühlgrenze = Feuchtkugeltemperatur');
  ok(near(a100.nach.t, s1.tw, 0.05), 'ηBef 100 % → Austritt auf der Kühlgrenze (' + a100.nach.t.toFixed(2) + ' ≈ ' + s1.tw.toFixed(2) + ' °C)');
  ok(near(a100.nach.x, E.hxXs(s1.tw, p), 1e-9), 'ηBef 100 % → x = x bei 100 % i.F.');
  ok(near(a100.dxEffG, a100.dxMaxG, 1e-9), 'Δxeff = Δxmax bei 100 %');
  const a50 = E.axAdiabat(s1, 50, 6000, p);
  ok(near(a50.dxEffG, a100.dxMaxG / 2, 1e-9), 'Δxeff = ηBef·Δxmax (50 %)');
  ok(near(a50.mV, 6000 * a50.dxEffG / 1000, 1e-9), 'Verdunstung ṁV = ṁL·Δxeff');
  const eta = E.axAdiabatEta(s1, a50.nach, p);
  ok(near(eta.eta, 50, 0.01), 'η-Inverse: ηBef = 50 %');
  const ab = E.axAbschlaemm(20, 15, 45);
  ok(near(ab.mA, 10, 1e-9), 'Abschlämmung ṁA = ṁV·Csp/(CA−Csp) = 20·15/30 = 10 kg/h');
  ok(near(ab.mSpeise, 30, 1e-9), 'Speisewasser = ṁV + ṁA = 30 kg/h');
  ok(E.axAbschlaemm(20, 15, 15) === null && E.axAbschlaemm(0, 15, 45) === null, 'Guards Abschlämmung (CA ≤ Csp / ṁV 0)');
}

console.log('— Ventilator —');
{
  const r = E.axVentilator({ vdot: 3000, dp: 1200, eta: 65 });
  ok(near(r.pven, 3000 * 1200 / (0.65 * 3.6e6), 1e-9), 'Pven = V̇·Δp/(η·3.6·10⁶) = ' + r.pven.toFixed(3) + ' kW');
  ok(near(r.mdot, 3600, 1e-9), 'ρ-Standard 1.20 → ṁ = 3600 kg/h');
  ok(near(r.dTheta, r.pven * 3600 / (3600 * 1.006), 1e-9), 'θAbw = Pven·3600/(ṁ·cL)');
  const r2 = E.axVentilator({ vdot: 3000, pven: 2, rho: 1.15 });
  ok(near(r2.pven, 2, 1e-12) && near(r2.mdot, 3450, 1e-9), 'Leistung direkt vorgegeben + eigene Dichte');
  ok(E.axVentilator({ vdot: 0, dp: 1200, eta: 65 }) === null && E.axVentilator({ vdot: 3000, dp: 0, eta: 65 }) === null, 'Guards Ventilator');
}

console.log('— hxCalc (Bestand unverändert) —');
{
  const res = E.hxCalc({ hoehe: 540, volumenstrom: 3000, punkte: [
    { combo: 't_phi', w1: '-8', w2: '90' }, { combo: 't_phi', w1: '21', w2: '40' }
  ] });
  ok(res.punkte.length === 2 && res.prozesse.length === 1, 'Punkte + Prozesse wie bisher');
  ok(res.sumHeiz > 0 && res.sumKuehl === 0, 'Σ Heizleistung > 0');
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
