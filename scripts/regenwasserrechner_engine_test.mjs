// Node-Test der DOM-freien Regenwasserrechner-Engine (sb_regenwasserrechner.html /*ENGINE-START*/-Block)
// Validiert 1:1 gegen die Beispielwerte des AWEL-Regenwasserrechners 2022 (Kanton Zürich):
//   Blatt «Entwässerungsplanung» (Beispiel Oberdorfingen, 6 Teilflächen → Ψa = 28.95 %),
//   Blatt «Retention für Versickerung» (Ared,S 1000 / AV 90 / AG 60 / Sspez 2 / z 1 → VRet 12.57 m³ @ TR 30, hÜ 0.169 m),
//   Blatt «Retention vor Einleitung» (Ared,S 9000 / r1 0.014 / Q347 4 → QE,1 126 l/s, VRet 80.95 m³ @ TR 20).
// Aufruf: node scripts/regenwasserrechner_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../sb_regenwasserrechner.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {RW_OFL_GRP, RW_OBERFLAECHEN, RW_ENTWART, RW_TR, rwNum, rwOfl, rwArtById,
          rwFlaechenCalc, rwPsi, rwPsiCheck, rwAB, rwRegen, rwRetVersickerung,
          rwEinleitBeurteilung, rwRetEinleitung, rwVretStufe};
`)();

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function near(name, a, b, eps) {
  eps = eps == null ? 1e-9 : eps;
  const d = Math.abs(a - b) / Math.max(1, Math.abs(b));
  t(name + ' (' + a + ' ≈ ' + b + ')', a != null && isFinite(a) && d <= eps);
}

console.log('— Zahlen-Parsing —');
near('rwNum("2,5") = 2.5 (Komma-Dezimal)', E.rwNum('2,5'), 2.5);
near("rwNum(\"1'000\") = 1000 (Apostroph-Tausender)", E.rwNum("1'000"), 1000);
t('rwNum("") = 0', E.rwNum('') === 0);
t('rwNum(null) = 0', E.rwNum(null) === 0);

console.log('— Oberflächentypen-Katalog (Ca/CS nach SN 592 000 Ziffer 7.3.6) —');
t('15 Oberflächentypen', E.RW_OBERFLAECHEN.length === 15);
const KAT = [
  ['schraegdach', 0.9, 1.0], ['flachdach_kies', 0.7, 0.8], ['flachdach_gruen_10', 0.5, 0.7],
  ['flachdach_gruen_25', 0.3, 0.4], ['flachdach_gruen_50', 0.2, 0.2], ['flachdach_gruen_50p', 0.1, 0.1],
  ['hartbelag', 0.9, 1.0], ['sickerbelag', 0.2, 0.6], ['kiesbelag', 0.4, 0.6], ['schotterrasen', 0.1, 0.3],
  ['platten_ohne_fugen', 0.2, 0.6], ['platten_mit_fugen', 0.1, 0.6], ['sickersteine', 0.1, 0.2],
  ['rasengitter', 0.1, 0.2], ['gruenflaeche', 0.0, 0.0]
];
KAT.forEach(([id, ca, cs]) => {
  const o = E.rwOfl(id);
  t(id + ': Ca ' + ca + ' / CS ' + cs, !!o && o.ca === ca && o.cs === cs);
});
t('6 Entwässerungsarten (2 Versickerung + 4 Ableitung)',
  E.RW_ENTWART.length === 6 &&
  E.RW_ENTWART.filter(a => a.grp === 'vers').length === 2 &&
  E.RW_ENTWART.filter(a => a.grp === 'abl').length === 4);
t('21 Regendauern 5…420 min', E.RW_TR.length === 21 && E.RW_TR[0] === 5 && E.RW_TR[20] === 420);

console.log('— Blatt «Entwässerungsplanung»: Beispiel Oberdorfingen (6 Teilflächen) —');
const FL = [
  { bez: 'Dach',                 ofl: 'flachdach_kies',      art: 'rw_kanal',       a: '480' },
  { bez: 'Hauszugänge',          ofl: 'platten_ohne_fugen',  art: 'vers_dezentral', a: '130' },
  { bez: 'Tiefgarageneinfahrt',  ofl: 'hartbelag',           art: 'mw_kanal',       a: '100' },
  { bez: 'Besucherparkplätze',   ofl: 'hartbelag',           art: 'rw_kanal',       a: '90'  },
  { bez: 'Fläche über Tiefgarage', ofl: 'flachdach_gruen_50', art: 'rw_kanal',      a: '360' },
  { bez: 'Grünfläche',           ofl: 'gruenflaeche',        art: 'vers_dezentral', a: '840' }
];
const f = E.rwFlaechenCalc(FL);
near('Zeile 1 (Flachdach mit Kies, 480 m²): Ared,S = 384', f.rows[0].aredS, 384);
near('Zeile 1: Ared,a = 336', f.rows[0].aredA, 336);
near('Zeile 2 (Platten ohne Sickerfugen, 130 m²): Ared,S = 78', f.rows[1].aredS, 78);
near('Zeile 2: Ared,a = 26', f.rows[1].aredA, 26);
near('Zeile 5 (Flachdach begrünt > 25–50, 360 m²): Ared,S = 72', f.rows[4].aredS, 72);
near('Σ Teilflächen = 2000 (Kontrollfeld)', f.sumA, 2000);
near('Dezentrale Versickerung: Ared,S = 78', f.byArt.vers_dezentral.aredS, 78);
near('Dezentrale Versickerung: Ared,a = 26', f.byArt.vers_dezentral.aredA, 26);
near('RW-Kanalisation: Ared,S = 546', f.byArt.rw_kanal.aredS, 546);
near('RW-Kanalisation: Ared,a = 489', f.byArt.rw_kanal.aredA, 489);
near('MW-Kanalisation: Ared,S = 100', f.byArt.mw_kanal.aredS, 100);
near('MW-Kanalisation: Ared,a = 90', f.byArt.mw_kanal.aredA, 90);
near('Σ Ableitung Ared,a = 579', f.sumAAbl, 579);
t('Versickerung zählt NICHT in die Ableitungs-Summe (579, nicht 605)', Math.abs(f.sumAAbl - 605) > 1);
near('Ψa = 579/2000 = 0.2895', E.rwPsi(f.sumAAbl, 2000), 0.2895);
t('Zeile ohne Oberflächentyp: Ared null, zählt nur in ΣA',
  (() => { const g = E.rwFlaechenCalc([{ ofl: '', art: 'rw_kanal', a: '50' }]); return g.rows[0].aredS === null && g.sumA === 50 && g.byArt.rw_kanal.aredS === 0; })());

console.log('— Ψa-Prüfung (kantonal 15 % / kommunal übersteuert) —');
t('Ψa 0.2895 > 15 % kantonal → nicht erfüllt', E.rwPsiCheck(0.2895, 0).erfuellt === false);
t('Ψa 0.15 = 15 % kantonal → erfüllt (Grenze inklusiv)', E.rwPsiCheck(0.15, 0).erfuellt === true);
t('kommunal 30 %: Ψa 0.2895 → erfüllt', E.rwPsiCheck(0.2895, 30).erfuellt === true && E.rwPsiCheck(0.2895, 30).kommunal === true);
t('kommunal 10 %: Ψa 0.12 → nicht erfüllt', E.rwPsiCheck(0.12, 10).erfuellt === false);
t('Ψa null (keine Perimeterfläche) → erfuellt null', E.rwPsiCheck(null, 0).erfuellt === null);
t('rwPsi ohne Perimeterfläche → null', E.rwPsi(579, 0) === null);

console.log('— Regenintensitäts-Parameter az/bz (SN 640 350) —');
const p1 = E.rwAB(1);
near('z = 1: az = 23.621', p1.a, 23.621);
near('z = 1: bz = 0.2162', p1.b, 0.2162);
near('z = 5: az = 23.621 + 9.5684·ln(5)', E.rwAB(5).a, 23.621 + 9.5684 * Math.log(5));
near('z = 0.2: bz = 0.2162 + 0.0133·ln(0.2)', E.rwAB(0.2).b, 0.2162 + 0.0133 * Math.log(0.2));

console.log('— Blatt «Retention für Versickerung» (Ared,S 1000 · AV 90 · AG 60 · Sspez 2 · z 1) —');
const v = E.rwRetVersickerung({ aredS: 1000, av: 90, ag: 60, sspez: 2, z: 1 });
near('QS = AV·Sspez/60 = 3 l/s', v.qs, 3);
near('TR 5: rz = 78.85933674604941 mm/h', v.rows[0].rz, 78.85933674604941);
near('TR 5: 219.0537131834706 l/(s·ha)', v.rows[0].rlsha, 219.0537131834706);
near('TR 5: Regensumme = 6.571611395504117 mm', v.rows[0].hsum, 6.571611395504117);
near('TR 5: Qzu = r·(Ared,S+AV)/10⁴ = 23.876854736998293 l/s', v.rows[0].qzu, 23.876854736998293);
near('TR 5: Vzu = 7.163056421099489 m³', v.rows[0].vzu, 7.163056421099489);
near('TR 5: VS = 0.9 m³', v.rows[0].vs, 0.8999999999999999);
near('TR 5: VRet = 6.263056421099488 m³', v.rows[0].vret, 6.263056421099488);
near('TR 5: hÜ = 0.08407362970285223 m', v.rows[0].hue, 0.08407362970285223);
near('TR 30: VRet = 12.57465093549288 m³', v.rows[5].vret, 12.57465093549288);
near('TR 420: VRet = −50.62449627227626 m³ (negativ zulässig)', v.rows[20].vret, -50.62449627227626);
near('VRet,max = 12.57465093549288 m³', v.vretMax, 12.57465093549288);
t('massgebende Regendauer = 30 min', v.trMass === 30);
near('hÜ,max = 0.1687988220626089 m', v.hueMax, 0.1687988220626089);
t('AV = AG = 0 → hÜ null (kein Geometrie-Bezug)',
  E.rwRetVersickerung({ aredS: 100, av: 0, ag: 0, sspez: 0, z: 1 }).hueMax === null);
t('Sickerleistung deckt alles (Sspez gross) → VRet,max ≤ 0',
  E.rwRetVersickerung({ aredS: 10, av: 100, ag: 80, sspez: 20, z: 1 }).vretMax <= 0);

console.log('— Blatt «Retention vor Einleitung»: Beurteilung (APer 10000 · ΣAred,a 7250 · ΣAred,S 9000 · r1 0.014 · Q347 4) —');
const b = E.rwEinleitBeurteilung({ aper: 10000, aredA: 7250, aredS: 9000, r1: 0.014, q347: 4 });
near('Ψa = 0.725', b.psi, 0.725);
t('Frage 1: Ψa > 15 % → Ja', b.f1 === true);
near('QE,1 = 0.014·9000 = 126 l/s', b.qe1, 126);
t('Frage 2: QE,1 > 20 l/s → Ja', b.f2 === true);
near('QDrossel = 10·Q347 = 40 l/s', b.qdrossel, 40);
t('Frage 3: QE,1 > QDrossel → Ja', b.f3 === true);
t('alle drei Fragen Ja → Retention erforderlich', b.alleJa === true);
t('Ψa 10 % → Frage 1 Nein → alleJa false',
  E.rwEinleitBeurteilung({ aper: 10000, aredA: 1000, aredS: 9000, r1: 0.014, q347: 4 }).alleJa === false);
t('QE,1 = 14 l/s (klein) → Frage 2 Nein',
  E.rwEinleitBeurteilung({ aper: 10000, aredA: 7250, aredS: 1000, r1: 0.014, q347: 4 }).f2 === false);
t('Q347 gross (QDrossel 200 > QE,1 126) → Frage 3 Nein',
  E.rwEinleitBeurteilung({ aper: 10000, aredA: 7250, aredS: 9000, r1: 0.014, q347: 20 }).f3 === false);

console.log('— Retentionsvolumen vor Einleitung (Ared,E 9000 · Drossel 40 l/s · z 1) —');
const e = E.rwRetEinleitung({ aredE: 9000, drosselKom: 0, qdrossel: 40, z: 1 });
t('ohne kommunale Drossel gilt QDrossel = 40 l/s', e.drossel === 40);
near('TR 5: Qzu = 197.14834186512354 l/s', e.rows[0].qzu, 197.14834186512354);
near('TR 5: Vzu = 59.14450255953706 m³', e.rows[0].vzu, 59.14450255953706);
near('TR 5: Vab = 12 m³', e.rows[0].vab, 12);
near('TR 5: VRet = 47.14450255953706 m³', e.rows[0].vret, 47.14450255953706);
near('TR 20: VRet = 80.95123134781028 m³', e.rows[3].vret, 80.95123134781028);
near('TR 80: VRet = −9.072667039538771 m³', e.rows[13].vret, -9.072667039538771);
near('VRet,max = 80.95123134781028 m³', e.vretMax, 80.95123134781028);
t('massgebende Regendauer = 20 min', e.trMass === 20);
const e2 = E.rwRetEinleitung({ aredE: 9000, drosselKom: 25, qdrossel: 40, z: 1 });
t('kommunale Drossel 25 l/s gewinnt über QDrossel 40', e2.drossel === 25);
near('kommunale Drossel: TR 5 Vab = 7.5 m³', e2.rows[0].vab, 7.5);
t('kleinere Drossel → grösseres VRet', e2.vretMax > e.vretMax);

console.log('— Regel VRet (< 5 verzichtbar · 5–10 → 10 m³ · sonst voll) —');
t('VRet 4.9 → verzicht', E.rwVretStufe(4.9) === 'verzicht');
t('VRet 5.0 → zehn', E.rwVretStufe(5.0) === 'zehn');
t('VRet 10.0 → zehn', E.rwVretStufe(10.0) === 'zehn');
t('VRet 80.95 → voll', E.rwVretStufe(80.95) === 'voll');
t('VRet ≤ 0 → keine', E.rwVretStufe(-3) === 'keine' && E.rwVretStufe(0) === 'keine');

console.log('');
console.log(fail === 0 ? '✅ ' + n + '/' + n + ' Checks grün' : '❌ ' + fail + ' von ' + n + ' Checks rot');
process.exit(fail === 0 ? 0 : 1);
