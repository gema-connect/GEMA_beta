// Node-Drift-Guard: Wärmepumpen-Engine (hz_waermepumpe.html)
//
// Die Engine (WPesti-Methode, SIA 384/3 auf Klimastations-BINs) wird aus dem
// /*ENGINE-START*/…/*ENGINE-END*/-Block des Moduls extrahiert und gegen die
// Excel-Cached-Werte der Original-Mappe «WPesti_de_99.xlsx» validiert:
//   1) Gebäudephysik-Kern (Blatt «Berechnungen») — auf volle Float-Präzision
//   2) Bedarfsseite (Blatt «Grafik») — Heiz-/WW-/Total-Bedarf exakt
//   3) Klimadaten-Integrität (32 SIA-2028-Stationen, je ~8760 h)
//   4) JAZ-Kette — interne Energie-Konsistenz + Plausibilität je Wärmequelle
//
// Ausführen:  node scripts/waermepumpe_engine_test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'hz_waermepumpe.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/[\s\S]*?\/\*ENGINE-END\*\//);
if (!m) { console.error('✗ ENGINE-Block nicht gefunden'); process.exit(1); }
const sandbox = {};
new Function('exports', m[0] + '\nexports.WPE_STATIONEN=WPE_STATIONEN;exports.WPE_KATEGORIEN=WPE_KATEGORIEN;exports.WPE_BIN_TA=WPE_BIN_TA;exports.wpeGebaeudeBins=wpeGebaeudeBins;exports.wpeCalc=wpeCalc;exports.wpeLuftMap=wpeLuftMap;exports.wpeMapInterp=wpeMapInterp;')(sandbox);
const { WPE_STATIONEN, WPE_KATEGORIEN, wpeGebaeudeBins, wpeCalc } = sandbox;

let pass = 0, fail = 0;
function chk(name, got, exp, tol) {
  tol = (typeof tol === 'number') ? tol : 1e-6;
  const ok = Math.abs(got - exp) <= Math.abs(exp) * tol + tol;
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name + ' — got ' + got + ' exp ' + exp); }
}
function truthy(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } }

const ZH = WPE_STATIONEN.findIndex(s => s.name === 'Zürich SMA');

// ═══ 1) Gebäudephysik-Kern gegen Excel-Cached (Blatt «Berechnungen»,
//        Beispiel «Anbau MFH» / Zürich SMA / EBF 368.4 / Qh 26.4 / QT 39 / QV 20.6 / VV 0) ═══
console.log('■ Gebäudemodell SIA 384/3 gegen Excel-Cached');
const geb = wpeGebaeudeBins({ ebf: 368.4, qhMJ: 26.4 * 3.6, qtMJ: 39 * 3.6, qvMJ: 20.6 * 3.6, vv: 0, kat: 0, station: ZH });
chk('Σ ΔT·h (B21)', geb.kh, 95615, 1e-6);
chk('Qtot kWh (B28)', geb.qtotKWh, 21956.64, 1e-6);
chk('Heizwärmebedarf QH kWh (B29)', geb.qhKWh, 9725.76, 1e-6);
chk('Genutzte freie Wärme kWh (B30)', geb.qug, 12230.88, 1e-6);
chk('Fg,ev kW (B44)', geb.fgEv, 1.14204, 1e-6);
chk('Leistungsvorschlag kW (B36)', geb.vorschlag, 6.429806201955759, 1e-9);
chk('Spez. Leistung kW/K (B39)', geb.specP, 0.22963593578413427, 1e-9);
const sumQhB = geb.qhB.reduce((a, b) => a + b, 0);
chk('Σ QH über BINs (=B29, B75)', sumQhB, 9725.76, 1e-4);
chk('Ta,min Zürich', geb.taMin, -8);
chk('HGT Zürich', geb.st.hgt, 2959);

// Andere Station (Davos): Leistungsformel Qtot·(20−Ta,min)/Σ ΔT·h gilt stationsübergreifend
const gebDavos = wpeGebaeudeBins({ ebf: 368.4, qhMJ: 26.4 * 3.6, qtMJ: 39 * 3.6, qvMJ: 20.6 * 3.6, vv: 0, kat: 0, station: WPE_STATIONEN.findIndex(s => s.name === 'Davos') });
chk('Davos: Vorschlag = Qtot·(20−Ta,min)/Σ ΔT·h', gebDavos.vorschlag, gebDavos.qtotKWh * (20 - gebDavos.taMin) / gebDavos.kh, 1e-9);
truthy('Davos (Ta,min −13) → kälteres Klima, mehr Heizstunden (Σ ΔT·h grösser)', gebDavos.kh > geb.kh);

// ═══ 2) Bedarfsseite gegen Excel-Cached (Blatt «Grafik») ═══
console.log('■ Bedarfsseite gegen Excel-Cached (Grafik)');
const rDem = wpeCalc({ station: ZH, kat: 0, ebf: 368.4, einheit: 'kWh', qh: 26.4, qt: 39, qv: 20.6,
  verteilverluste: 0, sperrzeit: 2, wwVerluste: 0, wpArt: 2, einsatz: 4, speicherSel: 3, betriebsweise: 2,
  kennlinie: { q35: [0, 0, 3.91, 3.35, 0], cop35: [0, 0, 3.79, 4.88, 0], q55: [0, 0, 0], cop55: [0, 0, 0] },
  tiSoll: 20, tvl: 35, trl: 28, tww: 55, wwZusatzSel: 2, wwVerteilSel: 2, solarSel: 1 });
chk('Warmwasserbedarf Qww MJ/m²a (H15)', rDem.qwwMJ, 75, 1e-9);
chk('Heizwärmebedarf kWh (Grafik F7)', rDem.energie.heizbedarf + rDem.energie.verteil, 9725.76, 1e-6);
chk('Warmwasserbedarf kWh (Grafik F9)', rDem.energie.wwBedarf, 7675, 1e-6);
chk('Nutzwärmebedarf total kWh (Grafik F11)', rDem.energie.total, 17400.76, 1e-6);

// WW-Zirkulation erzwingt EtaWW ≥ 20 % (WPesti-Regel J16)
const rZirk = wpeCalc(Object.assign({}, { station: ZH, kat: 0, ebf: 368.4, einheit: 'kWh', qh: 26.4, qt: 39, qv: 20.6,
  verteilverluste: 0, sperrzeit: 2, wwVerluste: 0, wpArt: 2, einsatz: 4, speicherSel: 3, betriebsweise: 2,
  kennlinie: { q35: [0, 0, 3.91, 3.35, 0], cop35: [0, 0, 3.79, 4.88, 0], q55: [0, 0, 0], cop55: [0, 0, 0] },
  tiSoll: 20, tvl: 35, trl: 28, tww: 55, wwZusatzSel: 2, wwVerteilSel: 3, solarSel: 1 }));
chk('WW-Zirkulation → EtaWW = 0.20', rZirk.etaWW, 0.2, 1e-9);
chk('WW-Zirkulation → Qww = 75·1.2', rZirk.qwwMJ, 90, 1e-9);

// ═══ 3) Klimadaten-Integrität ═══
console.log('■ Klimadaten (SIA 2028)');
chk('32 Klimastationen', WPE_STATIONEN.length, 32);
chk('12 Gebäudekategorien', WPE_KATEGORIEN.length, 12);
let hoursOk = true;
for (const s of WPE_STATIONEN) {
  const sum = s.h.reduce((a, b) => a + b, 0);
  if (s.h.length !== 66) hoursOk = false;
  if (sum < 8700 || sum > 8760) hoursOk = false;
}
truthy('Alle Stationen 66 BIN-Klassen, 8700..8760 h', hoursOk);
truthy('MFH: Fg,ev 3.1 W/m² · Qww 75 MJ', WPE_KATEGORIEN[0].fg === 3.1 && WPE_KATEGORIEN[0].qww === 75);

// ═══ 4) JAZ-Kette (Luft-WP, MFH Zürich, H+WW, el. Notheizung) ═══
console.log('■ JAZ-Kette: Luft-Wasser-WP');
const A = { station: ZH, kat: 0, ebf: 368.4, einheit: 'kWh', qh: 26.4, qt: 39, qv: 20.6,
  verteilverluste: 0, sperrzeit: 2, wwVerluste: 0.05, wpArt: 2, einsatz: 4, speicherSel: 3, betriebsweise: 3, ladungElSel: 3,
  kennlinie: { q35: [4.34, 5.41, 3.91, 3.35, 2.68], cop35: [2.5, 3.08, 3.79, 4.88, 6.81], q55: [4.67, 2.75, 2.25], cop55: [2.06, 2.78, 3.49] },
  tiSoll: 20, tvl: 35, trl: 28, tww: 55, wwZusatzSel: 2, wwVerteilSel: 2, solarSel: 1 };
const rA = wpeCalc(A);
truthy('Berechnung ok', rA.ok);
truthy('JAZh plausibel (3.5..4.5 für Luft-WP)', rA.jazh > 3.5 && rA.jazh < 4.5);
truthy('JAZww plausibel (2..3.5)', rA.jazww > 2 && rA.jazww < 3.5);
truthy('JAZh+ww zwischen JAZww und JAZh', typeof rA.jazTot === 'number' && rA.jazTot > rA.jazww && rA.jazTot < rA.jazh);
truthy('Laufzeit 3000..6000 h/a', rA.laufzeit > 3000 && rA.laufzeit < 6000);
truthy('Strombedarf 3000..8000 kWh/a', rA.energie.strom > 3000 && rA.energie.strom < 8000);
// Energie-Konsistenz
chk('AF128 (Heizenergie WP-Seite) = QH/η_h', rA.sums.AF128, geb.qhKWh / rA.etah, 1e-6);
chk('e_WP + e_EL = 1 (Energieerhaltung Heizung)', rA.eWP_H + rA.eEL_H, 1, 1e-9);
truthy('η_h < 1 (Verluste Heizbetrieb)', rA.etah < 1 && rA.etah > 0.85);
truthy('η_w < 1 (Verluste WW-Betrieb)', rA.etaw < 1 && rA.etaw > 0.9);
truthy('Gewichtung wh + www = 1', Math.abs(rA.wh + rA.www - 1) < 1e-9);
// JAZ inkl. el. Zusatz ≤ JAZ exkl. (el. Zusatz drückt die Zahl)
truthy('JAZh+ww inkl. el. Zusatz ≤ exkl.', typeof rA.jazTotEl === 'number' && rA.jazTotEl <= rA.jazTot + 1e-9);

// ═══ 5) JAZ-Kette: Erdsonden-WP (höhere JAZ als Luft) ═══
console.log('■ JAZ-Kette: Erdsonden-WP');
const B = { station: WPE_STATIONEN.findIndex(s => s.name === 'Bern-Liebefeld'), kat: 1, ebf: 210, einheit: 'kWh',
  qh: 48, qt: 52, qv: 18, verteilverluste: 0, sperrzeit: 2, wwVerluste: 0, wpArt: 3, einsatz: 4, speicherSel: 2, betriebsweise: 2,
  qB035: 10.5, copB035: 4.8, qB055: 9.8, copB055: 3.1, solepumpeW: 150, sondenAnzahl: 1, sondenLaenge: 180,
  tiSoll: 20, tvl: 35, trl: 28, tww: 55, wwZusatzSel: 2, wwVerteilSel: 3, solarSel: 1 };
const rB = wpeCalc(B);
truthy('Erdsonde: Berechnung ok', rB.ok);
truthy('Erdsonde JAZh > Luft-WP JAZh', rB.jazh > rA.jazh);
truthy('Erdsonde JAZh plausibel (3.5..6)', rB.jazh > 3.5 && rB.jazh < 6);
truthy('Quellentemperatur Heizung gesetzt', typeof rB.wp.tqH === 'number' && rB.wp.tqH > -5 && rB.wp.tqH < 15);

// ═══ 6) Bivalenter Betrieb + Warnungen ═══
console.log('■ Betriebsweisen & Warnungen');
const und = wpeCalc(Object.assign({}, A, { betriebsweise: 2, kennlinie: { q35: [1.0, 1.2, 1.4, 1.5, 1.6], cop35: [2.5, 3.08, 3.79, 4.88, 6.81], q55: [1.0, 1.2, 1.3], cop55: [2.06, 2.78, 3.49] } }));
truthy('Zu kleine WP monovalent → Ungedeckt-Warnung', und.warnungen.some(w => /ungenügend/i.test(w)) || und.f57 > 0.01);
const biv = wpeCalc(Object.assign({}, A, { betriebsweise: 4 }));
truthy('Fossil bivalent → keine JAZh+ww (Original H66 leer)', biv.jazTot === '');
truthy('Fossil bivalent: bivalent-Flag gesetzt', biv.bivalent === true);

// ═══ Ergebnis ═══
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' waermepumpe_engine: ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
