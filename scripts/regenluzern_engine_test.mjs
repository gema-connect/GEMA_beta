// Node-Test der DOM-freien Engine der Regenwasserberechnung Stadt Luzern
// (sb_regenwasser_luzern.html /*ENGINE-START*/-Block).
// Validiert 1:1 gegen die Werte des Deklarationsformulars der Stadt Luzern
// (Berechnungstabelle Regenabwasser mit Kolmationsgrad):
//   Beispiel EFH   (Parzelle 797.57 m²): Σ gebührenrelevant 450.30 m² → C 0.564;
//                  Retention Qab-Total 11.509 l/s → C_äquiv 0.4810027124055987 ≤ GEP 0.5
//   Beispiel Areal (Parzelle 14'527 m², linkes Seeufer): Σ 7'006.40 m² → C 0.482;
//                  Abfluss 210.06042 l/s, Qmax 152.5335 l/s (GEP 0.35) → Retention nötig;
//                  Retention Qab-Total 165.305 l/s → C_äquiv 0.3793052018081273 (> GEP)
// Aufruf: node scripts/regenluzern_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../sb_regenwasser_luzern.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = new Function(m[1] + `
  return {RL_STADTTEILE, RL_KATALOG, rlKat, rlNum, rlRounddown, rlRowC,
          rlFlaechenCalc, rlAvCheck, rlAbfluss, rlNoetig, rlRetRow, rlRetCalc,
          rlVersickerung, RL_BSP_EFH, RL_BSP_AREAL};
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

console.log('— Zahlen-Parsing & Abrunden —');
t('rlNum("") = null (leer ≠ 0 — steuert die Qab-Semantik)', E.rlNum('') === null);
t('rlNum("0") = 0 (echte Null)', E.rlNum('0') === 0);
near('rlNum("2,5") = 2.5 (Komma-Dezimal)', E.rlNum('2,5'), 2.5);
near("rlNum(\"14'527\") = 14527 (Apostroph-Tausender)", E.rlNum("14'527"), 14527);
t('rlRounddown(0.5649, 3) = 0.564 (abrunden, nie kaufmännisch)', E.rlRounddown(0.5649, 3) === 0.564);
t('rlRounddown(0.9999, 3) = 0.999', E.rlRounddown(0.9999, 3) === 0.999);
t('rlRounddown(0.482, 3) = 0.482 (glatter Wert bleibt)', E.rlRounddown(0.482, 3) === 0.482);

console.log('— Katalog (19 Flächenarten, Abflussbeiwerte SN 592 000) —');
t('19 Katalog-Zeilen', E.RL_KATALOG.length === 19);
t('3 Stadtteile', E.RL_STADTTEILE.length === 3 && E.RL_STADTTEILE[0] === 'linkes Seeufer');
const FIX = [
  ['schulter', 0], ['dach', 1], ['dach_kies', 0.8],
  ['gruen50', 0.1], ['gruen25', 0.2], ['gruen15', 0.3], ['gruen10', 0.4], ['gruen0', 0.7],
  ['hart', 1], ['versickerung', 0], ['gewaesser', 0], ['gruenflaeche', 0]
];
FIX.forEach(([id, c]) => {
  t(id + ': C ' + c + ' (fix)', E.rlKat(id) && E.rlRowC(E.rlKat(id)) === c);
});
const KOL = [
  ['kies',        0.4, 0.6, 0.8],
  ['kies_locker', 0.2, 0.3, 0.4],
  ['oeko36',      0.6, 0.8, 0.9],
  ['oeko612',     0.2, 0.4, 0.6],
  ['sickerstein', 0.2, 0.4, 0.8],
  ['sickerbelag', 0.2, 0.5, 0.8],
  ['rasengitter', 0.2, 0.4, 0.6]
];
KOL.forEach(([id, k1, k2, k3]) => {
  const k = E.rlKat(id);
  t(id + ': Kolmationsgrad 1→' + k1 + ' 2→' + k2 + ' 3→' + k3,
    !!k && E.rlRowC(k, 1) === k1 && E.rlRowC(k, 2) === k2 && E.rlRowC(k, 3) === k3);
});
t('Kolmationsgrad-Default = 3 (ohne Angabe)', E.rlRowC(E.rlKat('kies')) === 0.8);
t('genau 7 Beläge mit Kolmationsgrad', E.RL_KATALOG.filter(k => k.kol).length === 7);

console.log('— Beispiel Areal (Parzelle 14\'527 m²) — Befestigte Flächen —');
const A = E.RL_BSP_AREAL;
const fa = E.rlFlaechenCalc(A.flaechen, A.kol);
t('Σ Flächen = 14527', fa.sumFlaeche === 14527);
near('Σ gebührenrelevante Fläche = 7006.40', fa.sumGebuehr, 7006.400000000001);
near('Kiesbelag 142 m² @ Grad 3 → 113.60', fa.rows.kies.gebuehr, 113.60000000000001);
near('sickerfähiger Belag 971 m² @ Grad 3 → 776.80', fa.rows.sickerbelag.gebuehr, 776.8000000000001);
near('Dächer 3384 m² → 3384', fa.rows.dach.gebuehr, 3384);
near('Begrünt >15–25 cm: 1573 → 471.9', fa.rows.gruen15.gebuehr, 471.9);
t('Grünflächen 4152 m² → 0 (C 0)', fa.rows.gruenflaeche.gebuehr === 0);
t('Abflussbeiwert der Parzelle = 0.482 (abgerundet)', fa.cParzelle === 0.482);
t('AV-Kontrolle: 14527 = 14527 → ok', E.rlAvCheck(fa.sumFlaeche, 14527) === true);
t('AV-Kontrolle: Abweichung 0.01 → rot', E.rlAvCheck(14527.01, 14527) === false);
t('AV-Kontrolle: Abweichung 0.005 → ok (Grenze 0.01)', E.rlAvCheck(14527.005, 14527) === true);
t('AV-Kontrolle: ohne AV-Fläche → null', E.rlAvCheck(14527, null) === null);

console.log('— Beispiel Areal — Abflussbeiwerte (300 l/(s·ha)) —');
near('Berechneter Abfluss = 14527 · 0.482 / 10⁴ · 300 = 210.06042 l/s', E.rlAbfluss(14527, 0.482), 210.06042);
near('Maximale Wassermenge (GEP 0.35) = 152.5335 l/s', E.rlAbfluss(14527, 0.35), 152.5335);
t('Retention notwendig: 0.482 > 0.35 → Ja', E.rlNoetig(0.482, 0.35) === 'Ja');
t('Retention notwendig: 0.3 ≤ 0.35 → Nein', E.rlNoetig(0.3, 0.35) === 'Nein');
t('ohne GEP-Wert → Unbekannt', E.rlNoetig(0.482, null) === 'Unbekannt');
t('Abfluss ohne AV-Fläche → null', E.rlAbfluss(null, 0.482) === null);

console.log('— Beispiel Areal — äquivalente Abflussbeiwerte mit Retention —');
// gedrosseltes Dach Trakt B: 478 m², C 1, Qab 1.43 l/s
const rB = E.rlRetRow({ flaeche: '478', c: '1', qab: '1.43' });
near('Trakt B Dach: resultierender C = 0.0997210…', rB.e, 0.099721059972106);
near('Trakt B Dach: Qab = 1.43 l/s', rB.f, 1.43);
// Kiesbelag 142 m² mit Qab 0 (vollständiger Rückhalt): 0 ist eine ECHTE Angabe
const rK = E.rlRetRow({ flaeche: '142', c: '0.8', qab: '0' });
t('Qab 0 (vollständiger Rückhalt) → resultierender C 0, Qab 0', rK.e === 0 && rK.f === 0);
// Fläche ohne Retention (Qab leer) → C gilt
const rO = E.rlRetRow({ flaeche: '2644', c: '1', qab: '' });
t('ohne Qab-Angabe gilt C (E = 1)', rO.e === 1);
near('Qab = 2644 · 1 / 10⁴ · 300 = 79.32 l/s', rO.f, 79.32000000000001);
// Fläche 0 mit C gesetzt → E = C, Qab 0 (wie die Deklaration leerer Bestandszeilen)
const r0 = E.rlRetRow({ flaeche: '0', c: '0.8', qab: '' });
t('Fläche 0: E = C, Qab = 0', r0.e === 0.8 && r0.f === 0);
// leere Zeile → keine Werte
const rleer = E.rlRetRow({ flaeche: '', c: '', qab: '' });
t('leere Zeile → E/Qab null', rleer.e === null && rleer.f === null);
const ra = E.rlRetCalc(A.ret);
t('Σ Flächen Retention = 14527', ra.sumFlaeche === 14527);
near('Qab Total = 165.305 l/s', ra.qabTotal, 165.30499999999998);
near('Äquivalenter Abflussbeiwert mit Retention = 0.3793052…', ra.cAequiv, 0.3793052018081273);
t('GEP-Vergleich: 0.3793 > 0.35 → nicht eingehalten', ra.cAequiv > 0.35);

console.log('— Beispiel EFH (Parzelle 797.57 m²) —');
const B = E.RL_BSP_EFH;
const fb = E.rlFlaechenCalc(B.flaechen, B.kol);
near('Σ Flächen = 797.57', fb.sumFlaeche, 797.5699999999999);
near('Σ gebührenrelevante Fläche = 450.30', fb.sumGebuehr, 450.29999999999995);
near('Kiesbelag 42.1 m² @ Grad 1 → C 0.4 → 16.84', fb.rows.kies.gebuehr, 16.84);
t('Kiesbelag: wirksamer C bei Grad 1 = 0.4', fb.rows.kies.c === 0.4);
near('Dächer 286.33 → 286.33', fb.rows.dach.gebuehr, 286.33);
near('Flachdach Kies 25.14 → 20.112', fb.rows.dach_kies.gebuehr, 20.112000000000002);
t('Abflussbeiwert der Parzelle = 0.564', fb.cParzelle === 0.564);
t('Retention notwendig (GEP 0.5): 0.564 > 0.5 → Ja', E.rlNoetig(fb.cParzelle, 0.5) === 'Ja');
// Retention: gedrosseltes Dach 200 m² @ 4 l/s
const rE = E.rlRetRow({ flaeche: '200', c: '1', qab: '4' });
near('Dach mit Retention: resultierender C = 0.6667', rE.e, 0.6666666666666666);
near('Dach mit Retention: Qab = 4 l/s', rE.f, 3.999999999999999);
const rb = E.rlRetCalc(B.ret);
near('Σ Flächen Retention = 797.57', rb.sumFlaeche, 797.5699999999999);
near('Qab Total = 11.509 l/s', rb.qabTotal, 11.509);
near('Äquivalenter Abflussbeiwert = 0.4810027…', rb.cAequiv, 0.4810027124055987);
t('GEP-Vergleich: 0.481 ≤ 0.5 → eingehalten', rb.cAequiv <= 0.5);

console.log('— Versickerung (0.03 l/(s·m²) · 15-Minuten-Speicher) —');
const v1 = E.rlVersickerung('500', '2');
near('Qzu = 0.03 · 500 = 15 l/s', v1.qzu, 15);
near('V = (15 − 2) · 15 · 60 / 1000 = 11.7 m³', v1.volumen, 11.7);
const v0 = E.rlVersickerung('', '');
t('ohne Fläche/Sickerleistung → Qzu 0, V 0', v0.qzu === 0 && v0.volumen === 0);
const vneg = E.rlVersickerung('100', '5');
near('Sickerleistung > Zufluss → rechnerisch negativ (Formel unverändert)', vneg.volumen, (3 - 5) * 0.9);

console.log('— Leerzustand & Grenzfälle —');
const f0 = E.rlFlaechenCalc({}, {});
t('leere Deklaration: Σ 0, C Parzelle 0', f0.sumFlaeche === 0 && f0.sumGebuehr === 0 && f0.cParzelle === 0);
const rEmpty = E.rlRetCalc([]);
t('leere Retention: Qab Total null, C äquiv null', rEmpty.qabTotal === null && rEmpty.cAequiv === null);
const rNur0 = E.rlRetCalc([{ flaeche: '100', c: '0', qab: '' }]);
t('nur C-0-Flächen: Qab Total 0 → C äquiv null (keine Aussage)', rNur0.qabTotal === 0 && rNur0.cAequiv === null);

console.log('');
if (fail) { console.error('✗ ' + fail + ' von ' + n + ' Checks FEHLGESCHLAGEN'); process.exit(1); }
console.log('✓ Alle ' + n + ' Checks bestanden');
