// Node-Test der DOM-freien Saugpumpen-Engine (sb_saugpumpe.html /*ENGINE-START*/-Block)
// Validiert gegen die Cached-Werte der Arbeitsvorlage (Blatt Berechnung_Saughöhe)
// und gegen unabhängig (Python) berechnete Formelwerte.
// Aufruf: node scripts/saugpumpe_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../sb_saugpumpe.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {SG_DAMPFDRUCK, sgLuftdruck, sgDichte, sgDampfdruck, sgCalc};
`)();

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
// relative Abweichung < 1e-12 (Excel-Cached exakt) bzw. eps für Formelwerte
function near(name, a, b, eps) {
  eps = eps == null ? 1e-12 : eps;
  const d = Math.abs(a - b) / Math.max(1, Math.abs(b));
  t(name + ' (' + a + ' ≈ ' + b + ')', isFinite(a) && d <= eps);
}

console.log('— Excel-Cached-Werte (Defaults der Vorlage: h=0, T=0, pf=0, NPSH=0, Hs=0.5, pv=0) —');
near('Luftdruck pLuft(0) = 101325 Pa (AB13)', E.sgLuftdruck(0), 101325);
near('Dichte ρ(0) = 1006 kg/m³ (AB25)', E.sgDichte(0), 1006);
const r0 = E.sgCalc({ h: 0, t: 0, pf: 0, npsh: 0, hs: 0.5, pv: 0 });
near('Hb = 10.267143317465239 m (AB30)', r0.Hb, 10.267143317465239);
near('Hf = 0 m (AB41)', r0.Hf, 0);
near('Hv = 0 m (AB59)', r0.Hv, 0);
near('hmax = 9.767143317465239 m (AB66)', r0.hmax, 9.767143317465239);
t('hmax positiv → keine Warnung', r0.warnNeg === false);

console.log('— Unabhängige Formelwerte (Python-Referenz) —');
near('pLuft(500) = 95458.80752610574 Pa', E.sgLuftdruck(500), 95458.80752610574);
near('pLuft(1000) = 89870.69018279419 Pa', E.sgLuftdruck(1000), 89870.69018279419);
near('pLuft(2000) = 79488.15108829895 Pa', E.sgLuftdruck(2000), 79488.15108829895);
near('ρ(10) = 1003.18', E.sgDichte(10), 1003.18);
near('ρ(20) = 999.92', E.sgDichte(20), 999.92);
near('ρ(60) = 982.48', E.sgDichte(60), 982.48);

console.log('— Beispiel h=400, T=20, pf=12000 Pa, NPSH=3.2, Hs=0.5, pv=2338.8 Pa —');
const r1 = E.sgCalc({ h: 400, t: 20, pf: 12000, npsh: 3.2, hs: 0.5, pv: 2338.8 });
near('pLuft = 96609.46902035298 Pa', r1.pLuft, 96609.46902035298);
near('ρ = 999.92 kg/m³', r1.rho, 999.92);
near('Hb = 9.84884795068549 m', r1.Hb, 9.84884795068549);
near('Hf = 1.2233394573706569 m', r1.Hf, 1.2233394573706569);
near('Hv = 0.23842886024154103 m', r1.Hv, 0.23842886024154103);
near('hmax = 4.687079633073293 m', r1.hmax, 4.687079633073293);
near('NPSH-Budget = hmax + NPSH', r1.npshBudget, r1.hmax + 3.2);
t('pv manuell übernommen (pvManuell=true)', r1.pvManuell === true && r1.pv === 2338.8);

console.log('— Negativ-Fall (Saugbetrieb nicht möglich) —');
const r2 = E.sgCalc({ h: 2000, t: 90, pf: 25000, npsh: 6, hs: 0.5, pv: 70000 });
near('ρ(90) = 964.78', r2.rho, 964.78);
near('Hb = 8.398565159969705 m', r2.Hb, 8.398565159969705);
near('Hf = 2.6414519160975978 m', r2.Hf, 2.6414519160975978);
near('Hv = 7.396065365073273 m', r2.Hv, 7.396065365073273);
near('hmax = -8.138952121201166 m', r2.hmax, -8.138952121201166);
t('hmax negativ → warnNeg', r2.warnNeg === true);

console.log('— Dampfdruck-Tafel (NBS/NRC) + Interpolation —');
near('pv(20) = 2338.8 Pa (Stützpunkt)', E.sgDampfdruck(20), 2338.8);
near('pv(0.01) = 611.73 Pa (erster Punkt)', E.sgDampfdruck(0.01), 611.73);
near('pv(0) → auf ersten Punkt geklemmt (611.73)', E.sgDampfdruck(0), 611.73);
near('pv(0.5) = 634.2155555555555 Pa (interpoliert)', E.sgDampfdruck(0.5), 634.2155555555555);
near('pv(21) = 2491.75 Pa (interpoliert)', E.sgDampfdruck(21), 2491.75);
near('pv(39) = 7060.937264935397 Pa (interpoliert 38↔45.817)', E.sgDampfdruck(39), 7060.937264935397, 1e-9);
near('pv(99.632) = 100000 Pa (letzter Punkt)', E.sgDampfdruck(99.632), 100000);
t('pv(-5) = null (ausserhalb)', E.sgDampfdruck(-5) === null);
t('pv(120) = null (ausserhalb)', E.sgDampfdruck(120) === null);
t('pv(NaN) = null', E.sgDampfdruck(NaN) === null);
t('Tafel monoton steigend (T und pv)', E.SG_DAMPFDRUCK.every((row, i, a) => i === 0 || (row[0] > a[i - 1][0] && row[1] > a[i - 1][1])));

console.log('— pv-Automatik (leer = Tafelwert, manuell überschreibt — auch 0) —');
const rAuto = E.sgCalc({ h: 0, t: 20, pf: 0, npsh: 0, hs: 0.5, pv: null });
near('pv leer → Tafelwert 2338.8 Pa', rAuto.pv, 2338.8);
t('pvManuell=false', rAuto.pvManuell === false);
const rNull = E.sgCalc({ h: 0, t: 20, pf: 0, npsh: 0, hs: 0.5, pv: 0 });
t('pv=0 manuell wird respektiert (nicht auto)', rNull.pvManuell === true && rNull.pv === 0 && rNull.Hv === 0);
const rOut = E.sgCalc({ h: 0, t: 150, pf: 0, npsh: 0, hs: 0.5, pv: null });
t('T ausserhalb Tafel + pv leer → pv=0 (pvAuto=null)', rOut.pvAuto === null && rOut.pv === 0);

console.log('— Robustheit —');
const rEmpty = E.sgCalc({});
near('leere Eingabe = Vorlage-Default ohne Hs (hmax = Hb)', rEmpty.hmax, 10.267143317465239 - E.sgDampfdruck(0) / (1006 * 9.81));
t('sgCalc() ohne Argument wirft nicht', (() => { try { E.sgCalc(); return true; } catch (e) { return false; } })());

console.log('\n' + (fail === 0 ? `✅ ${n}/${n} Tests grün` : `❌ ${fail}/${n} Tests rot`));
process.exit(fail === 0 ? 0 : 1);
