// Node-Test der DOM-freien Höhen-Engine (gema_hoehe.js /*ENGINE-START*/-Block):
// WGS84→LV95 (swisstopo-Näherung), barometrische mbar-Umrechnung, Distanz, Format.
// Referenzen: Bern-Anker (LV95-Nullpunkt 2'600'000/1'200'000) + unabhängig
// (Python) berechnete Formelwerte + Konsistenz mit der RK-Engine (sb_niederschlag).
// Aufruf: node scripts/hoehe_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../gema_hoehe.js', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {ghWgs84ToLV95, ghLuftdruckMbar, ghDistM, ghFmtCoord, ghInCH};
`)();

// RK-Engine (LV95→WGS84) für den Roundtrip-Check
const nb = fs.readFileSync(new URL('../sb_niederschlag.html', import.meta.url), 'utf8');
const mrk = nb.match(/\/\*RK-ENGINE-START\*\/([\s\S]*?)\/\*RK-ENGINE-END\*\//);
const RK = mrk ? new Function(mrk[1] + ' return {rkLV95, rkWGS84toLV95};')() : null;

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function near(name, a, b, absEps) {
  t(name + ' (' + a + ' ≈ ' + b + ' ±' + absEps + ')', isFinite(a) && Math.abs(a - b) <= absEps);
}

console.log('— WGS84 → LV95 (Anker + unabhängige Formelwerte) —');
const bern = E.ghWgs84ToLV95(46.951082877, 7.438632495);
near('Bern (alte Sternwarte) E = 2600000', bern.E, 2600000, 1.5);
near('Bern (alte Sternwarte) N = 1200000', bern.N, 1200000, 1.5);
const zh = E.ghWgs84ToLV95(47.378177, 8.540192);
near('Zürich HB E (Formelwert)', zh.E, 2683188.1658499255, 0.01);
near('Zürich HB N (Formelwert)', zh.N, 1248065.9637886526, 0.01);
const bs = E.ghWgs84ToLV95(47.556614, 7.592055);
near('Basel E (Formelwert)', bs.E, 2611548.536629305, 0.01);
near('Basel N (Formelwert)', bs.N, 1267333.45848611, 0.01);
const lug = E.ghWgs84ToLV95(46.005458, 8.951052);
near('Lugano E (Formelwert)', lug.E, 2717153.4451724226, 0.01);
near('Lugano N (Formelwert)', lug.N, 1096006.7700025034, 0.01);

if (RK) {
  console.log('— Konsistenz mit RK-Engine (sb_niederschlag) —');
  const f = RK.rkWGS84toLV95(47.378177, 8.540192);
  near('identische Formeln wie rkWGS84toLV95 (E)', zh.E, f.E, 1e-9);
  near('identische Formeln wie rkWGS84toLV95 (N)', zh.N, f.N, 1e-9);
  const back = RK.rkLV95(zh.E, zh.N);
  near('Roundtrip LV95→WGS84→zurück: lat', back.lat, 47.378177, 0.0001);
  near('Roundtrip LV95→WGS84→zurück: lng', back.lng, 8.540192, 0.0001);
} else {
  t('RK-Engine gefunden (Konsistenz-Check)', false);
}

console.log('— Höhe → Luftdruck [mbar] (barometrische Höhenformel) —');
near('mbar(0) = 1013.25', E.ghLuftdruckMbar(0), 1013.25, 1e-9);
near('mbar(400) = 966.09 (Medizinalgas-Default 966 ≈ 400 m ü.M.)', E.ghLuftdruckMbar(400), 966.0946902035298, 1e-9);
near('mbar(500) = 954.5880752610574', E.ghLuftdruckMbar(500), 954.5880752610574, 1e-9);
near('mbar(540) = 950.02 (Referenz h,x-Diagramm: 540 m → 950 mbar)', E.ghLuftdruckMbar(540), 950.0166175709105, 1e-9);
near('mbar(1000) = 898.7069018279419', E.ghLuftdruckMbar(1000), 898.7069018279419, 1e-9);
near('mbar(2000) = 794.8815108829896', E.ghLuftdruckMbar(2000), 794.8815108829896, 1e-8);
t('mbar() ohne Argument = Meereshöhe', E.ghLuftdruckMbar() === 1013.25);

console.log('— Distanz (Korrektur-Erkennung) —');
near('1 Breitengrad-Sekunde ≈ 30.9 m', E.ghDistM(47, 8, 47 + 1 / 3600, 8), 30.9, 0.2);
near('Distanz 0 bei identischem Punkt', E.ghDistM(47.5, 8.5, 47.5, 8.5), 0, 1e-9);
const d20 = E.ghDistM(47.5, 8.5, 47.5 + 0.00018, 8.5); // ~20 m nach Norden
t('~20-m-Verschiebung wird erkannt (> 1.5 m Schwelle)', d20 > 15 && d20 < 25);

console.log('— Format & Plausibilität —');
t("ghFmtCoord(2611234.4) = 2'611'234", E.ghFmtCoord(2611234.4) === "2'611'234");
t("ghFmtCoord(1096006.77) = 1'096'007", E.ghFmtCoord(1096006.77) === "1'096'007");
t('ghInCH(Bern) = true', E.ghInCH(46.95, 7.44) === true);
t('ghInCH(Paris) = false', E.ghInCH(48.86, 2.35) === false);
t('ghInCH(NaN) = false', E.ghInCH(NaN, 8) === false);

console.log('\n' + (fail === 0 ? `✅ ${n}/${n} Tests grün` : `❌ ${fail}/${n} Tests rot`));
process.exit(fail === 0 ? 0 : 1);
