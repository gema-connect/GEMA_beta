/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test el_leistungsbedarf (Node, kein Browser)
   ════════════════════════════════════════════════════════════════════════
   Prüft den /*ENGINE-START*​/-Block von el_leistungsbedarf.html gegen
   UNABHÄNGIG gerechnete Werte: die Referenzen unten sind aus den Formeln
   hier ausgeschrieben und rufen NICHT die Funktionen des Moduls auf.

   Besonderes Augenmerk auf die Stellen, an denen die zugrunde liegende
   Vorlage falsch lag:
     • Wirk- und Blindleistung werden GETRENNT summiert — die Schein-
       leistungen der Gruppen zu addieren überschätzt S.
     • Beurteilt wird der VORHANDENE cos φ, nicht der eingestellte
       Zielwert (die Vorlage bewertete den Zielwert und meldete damit
       eine gesunde Anlage als «dringend kompensationsbedürftig»).
     • Q_C wird nie negativ ausgegeben.
     • Kondensatoren gibt es nur in ganzen Stufen; das Aufrunden kann
       überkompensieren und muss gemeldet werden.

   AUSFÜHREN:  node scripts/leistungsbedarf_engine_test.mjs
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, fail = 0;
const t = (name, cond) => { n++; if (!cond) { fail++; console.error('  ✗ FAIL: ' + name); } };
const near = (name, a, b, eps) => {
  eps = eps == null ? 1e-9 : eps;
  const d = Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
  t(`${name} (${a} ≈ ${b})`, isFinite(a) && d <= eps);
};

/* ── Fachbasis + Engine laden ────────────────────────────────────────── */
const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;

const html = readFileSync(join(ROOT, 'el_leistungsbedarf.html'), 'utf8');
const A_MARK = '/*ENGINE-' + 'START*/', E_MARK = '/*ENGINE-' + 'END*/';
const von = html.indexOf(A_MARK), bis = html.indexOf(E_MARK);
t('ENGINE-Block gefunden', von >= 0 && bis > von);
const engineSrc = html.slice(von + A_MARK.length, bis);
const M = new Function('GemaElektro', engineSrc +
  '\nreturn { lbCalc, lbTyp, lbTanPhi, LB_TYPEN, LB_VERDROSSELUNG, lbVerdrosselung };')(E);
const { lbCalc, lbTanPhi, LB_TYPEN } = M;
t('lbCalc ist eine Funktion', typeof lbCalc === 'function');

/* ── Referenzfall ──────────────────────────────────────────────────────
   400 V · Beleuchtung 12 kW (g 1.0, cos 0.95) · Steckdosen 40 kW
   (g 0.30, cos 0.90) · Motoren 55 kW (g 0.70, cos 0.80)
   Ziel-cos φ 0.95 · Stufen 12.5 kvar · 15 % nichtlinear, unverdrosselt   */
const BASIS = {
  netz: '3p400',
  gruppen: [
    { p: 12, g: 1.00, cos: 0.95 },
    { p: 40, g: 0.30, cos: 0.90 },
    { p: 55, g: 0.70, cos: 0.80 }
  ],
  cosZiel: 0.95, stufe: 12.5, nichtlinear: 15, verdrosselung: 'p0',
  verlAnteil: 2, stunden: 2000, preis: 0.28
};

/* ── Unabhängige Referenzrechnung ─────────────────────────────────────
   tan φ = sin φ / cos φ mit sin φ = √(1 − cos²φ) — bewusst ohne acos,
   damit die Referenz nicht denselben Weg geht wie die Implementierung. */
const TAN = (c) => Math.sqrt(1 - c * c) / c;
const S3 = Math.sqrt(3), UN = 400, NENNER = S3 * UN;

const PB1 = 12 * 1.00, QB1 = PB1 * TAN(0.95);
const PB2 = 40 * 0.30, QB2 = PB2 * TAN(0.90);
const PB3 = 55 * 0.70, QB3 = PB3 * TAN(0.80);
const P_INST = 12 + 40 + 55;
const P_B = PB1 + PB2 + PB3;
const Q_B = QB1 + QB2 + QB3;
const S_B = Math.sqrt(P_B * P_B + Q_B * Q_B);
const COS_GES = P_B / S_B;
const I_B = S_B * 1000 / NENNER;

const TAN1 = Q_B / P_B, TAN2 = TAN(0.95);
const Q_C = P_B * (TAN1 - TAN2);
const N_STUFEN = Math.ceil(Q_C / 12.5);
const Q_CIST = N_STUFEN * 12.5;
const Q_2 = Q_B - Q_CIST;
const S_2 = Math.sqrt(P_B * P_B + Q_2 * Q_2);
const COS_2 = P_B / S_2;
const I_2 = S_2 * 1000 / NENNER;

const r = lbCalc(BASIS);

console.log('— Gruppen: P_b = P_inst · g, Q = P_b · tan φ —');
near('Gruppe 1 P_b = 12.0 kW', r.zeilen[0].pb, PB1);
near('Gruppe 1 Q_b (cos 0.95)', r.zeilen[0].qb, QB1);
near('Gruppe 2 P_b = 12.0 kW (g 0.30)', r.zeilen[1].pb, PB2);
near('Gruppe 2 Q_b (cos 0.90)', r.zeilen[1].qb, QB2);
near('Gruppe 3 P_b = 38.5 kW (g 0.70)', r.zeilen[2].pb, PB3);
near('Gruppe 3 Q_b (cos 0.80) = 28.875 kvar', r.zeilen[2].qb, 28.875);
near('tan φ bei cos 0.80 = 0.75', lbTanPhi(0.80), 0.75, 1e-12);

console.log('— Summen —');
near('Σ P_inst = 107 kW', r.pInst, P_INST);
near('Σ P_b = 62.5 kW', r.pB, P_B);
near('Σ Q_b = 38.631 kvar', r.qB, Q_B);
near('S = √(P² + Q²) = 73.475 kVA', r.sB, S_B);
near('cos φ = P/S = 0.8506', r.cosGes, COS_GES);
near('I_b = S / (√3 · U_n) = 106.05 A', r.iB, I_B);

console.log('— KERN: P und Q getrennt summieren, nicht Σ S —');
{
  /* Die Vorlage-Falle: Scheinleistungen der Gruppen addieren. Das ergibt
     einen grösseren Wert, weil die Gruppen unterschiedliche Phasenlagen
     haben — S darf erst aus den Komponenten gebildet werden. */
  const summeS = r.zeilen.reduce((s, z) => s + z.sb, 0);
  t('Σ S der Gruppen ist grösser als das korrekte S', summeS > r.sB + 0.1);
  t('S entspricht NICHT der Summe der Gruppen-Scheinleistungen',
    Math.abs(summeS - r.sB) > 0.1);
  near('S bleibt √(ΣP² + ΣQ²)', r.sB, Math.sqrt(r.pB ** 2 + r.qB ** 2), 1e-12);
}

console.log('— Kompensation —');
near('tan φ₁ = Q/P (ohne Umweg über acos)', r.tan1, TAN1, 1e-12);
near('Q_C = P_b · (tan φ₁ − tan φ₂) = 18.09 kvar', r.qC, Q_C);
t('Kompensation ist nötig', r.noetig === true);
t('2 Stufen à 12.5 kvar', r.nStufen === N_STUFEN && r.nStufen === 2);
near('installiert 25 kvar', r.qCist, Q_CIST);
near('Q₂ nach Kompensation', r.q2, Q_2);
near('S₂ = 63.968 kVA', r.s2, S_2);
near('erreichter cos φ = 0.9772', r.cos2, COS_2);
near('I₂ = 92.33 A', r.i2, I_2);
near('ΔI = 13.72 A', r.dI, I_B - I_2);
near('ΔI = 12.94 %', r.dIpct, (I_B - I_2) / I_B * 100);
t('erreichter cos φ liegt über dem Ziel (aufgerundete Stufung)', r.cos2 > 0.95);

console.log('— KERN: beurteilt wird der VORHANDENE cos φ, nicht das Ziel —');
{
  /* Die Vorlage bewertete den ZIELWERT. Eine gesunde Anlage mit einem
     bewusst tief gesetzten Ziel wurde dort als «dringend kompensations-
     bedürftig» gemeldet — genau umgekehrt. */
  const gutIstSchlechtZiel = lbCalc({
    ...BASIS, gruppen: [{ p: 50, g: 1, cos: 0.98 }], cosZiel: 0.5, verdrosselung: 'p7'
  });
  t('guter Ist-cos-φ mit tiefem Ziel → Status ok', gutIstSchlechtZiel.status === 'ok');
  t('und keine Kompensation nötig', gutIstSchlechtZiel.noetig === false);

  const schlechtIst = lbCalc({
    ...BASIS, gruppen: [{ p: 50, g: 1, cos: 0.65 }], cosZiel: 0.95, verdrosselung: 'p7', stufe: 0
  });
  t('schlechter Ist-cos-φ → Status err', schlechtIst.status === 'err');
  t('und Kompensation nötig', schlechtIst.noetig === true);
}

console.log('— Q_C wird nie negativ —');
{
  const zielUnterIst = lbCalc({ ...BASIS, cosZiel: 0.70 });
  t('Ziel unter Ist-Wert: Q_C = 0 statt negativ', zielUnterIst.qC === 0);
  t('noetig = false', zielUnterIst.noetig === false);
  t('und es wird gesagt, dass nichts nötig ist',
    zielUnterIst.hinweise.some(h => /keine Kompensation nötig/.test(h.text)));
  t('ΔI bleibt bei 0 (kein negativer Gewinn)', zielUnterIst.dI === 0);
}

console.log('— Stufung und Überkompensation —');
{
  const ohneStufung = lbCalc({ ...BASIS, stufe: 0 });
  t('ohne Stufengrösse: keine Stückzahl', ohneStufung.nStufen === null);
  near('ohne Stufung wird der Idealwert installiert', ohneStufung.qCist, Q_C);
  near('und der Ziel-cos-φ exakt getroffen', ohneStufung.cos2, 0.95, 1e-9);

  const grob = lbCalc({ ...BASIS, stufe: 50 });
  t('grobe Stufung überkompensiert', grob.kapazitiv === true);
  t('Q₂ wird negativ (kapazitiv)', grob.q2 < 0);
  t('Überkompensation wird gemeldet',
    grob.hinweise.some(h => /überkompensiert/i.test(h.text)));
  t('und der Status auf warn gesetzt', grob.status === 'warn');
}

console.log('— Ziel-cos φ = 1.0 wird abgeraten —');
{
  const voll = lbCalc({ ...BASIS, cosZiel: 1.0, stufe: 0 });
  near('Q_C entspricht der ganzen Blindleistung', voll.qC, Q_B);
  t('Vollkompensation wird als Warnung gemeldet',
    voll.hinweise.some(h => /nicht angestrebt/.test(h.text)));
}

console.log('— Vorsicherung —');
{
  t('vor der Kompensation 125 A', r.sichVor === 125);
  t('nach der Kompensation 100 A', r.sichNach === 100);
  t('die Kompensation erlaubt eine Stufe kleiner', r.sichNach < r.sichVor);

  const riesig = lbCalc({ ...BASIS, gruppen: [{ p: 5000, g: 1, cos: 0.9 }] });
  t('über der Sicherungsreihe: null statt stiller Deckel', riesig.sichVor === null);
  t('und es wird gemeldet',
    riesig.hinweise.some(h => h.typ === 'err' && /Nennstrom/.test(h.text)));
}

console.log('— Verdrosselung und Resonanz —');
{
  t('unverdrosselt: keine Resonanzfrequenz', r.fRes === null);
  t('15 % nichtlineare Last unverdrosselt → nicht empfohlen', r.verdrosselungPasst === false);
  t('und es wird gemeldet', r.hinweise.some(h => /verdrosselt werden/.test(h.text)));

  const p7 = lbCalc({ ...BASIS, verdrosselung: 'p7' });
  near('f_r = 50 / √0.07 = 189 Hz', p7.fRes, 50 / Math.sqrt(0.07), 1e-12);
  near('entspricht der 3.78. Ordnung', p7.ordnung, 50 / Math.sqrt(0.07) / 50, 1e-12);
  t('f_r liegt unter der 5. Harmonischen (250 Hz)', p7.fRes < 250);
  t('mit Verdrosselung passt es', p7.verdrosselungPasst === true);

  const p567 = lbCalc({ ...BASIS, verdrosselung: 'p567' });
  near('f_r bei 5.67 % = 210 Hz', p567.fRes, 50 / Math.sqrt(0.0567), 1e-12);
  t('stärkere Verdrosselung senkt die Resonanzfrequenz', p567.fRes > p7.fRes);

  const viel = lbCalc({ ...BASIS, nichtlinear: 40, verdrosselung: 'p7' });
  t('über 25 % nichtlinear: Messung verlangt',
    viel.hinweise.some(h => /Oberschwingungen messen/.test(h.text)));
}

console.log('— Wirtschaftlichkeit (Verlustanteil ist EINGABE) —');
{
  near('P_V vorher = 2 % von P_b', r.pV1, P_B * 0.02, 1e-12);
  /* Verluste steigen quadratisch mit dem Strom. */
  near('P_V nachher = P_V1 · (I₂/I₁)²', r.pV2, (P_B * 0.02) * Math.pow(I_2 / I_B, 2), 1e-9);
  near('eingesparte Energie', r.energie, (P_B * 0.02 - r.pV2) * 2000, 1e-9);
  near('eingesparte Kosten', r.kosten, r.energie * 0.28, 1e-12);

  const ohneAnnahme = lbCalc({ ...BASIS, verlAnteil: 0 });
  t('ohne Verlustannahme keine erfundene Einsparung', ohneAnnahme.kosten === 0);
  const doppelt = lbCalc({ ...BASIS, verlAnteil: 4 });
  near('doppelter Verlustanteil → doppelte Einsparung', doppelt.kosten, r.kosten * 2, 1e-9);
}

console.log('— Einphasig 230 V —');
{
  const ein = lbCalc({ ...BASIS, netz: '1p230' });
  t('einphasig erkannt', ein.dreiphasig === false);
  near('I_b = S / U_n (ohne √3)', ein.iB, S_B * 1000 / 230, 1e-9);
  t('einphasig ergibt einen deutlich höheren Strom', ein.iB > r.iB * 2);
  near('P, Q und S bleiben unverändert', ein.sB, S_B, 1e-12);
}

console.log('— Leere und unvollständige Eingaben —');
{
  const leer = lbCalc({ ...BASIS, gruppen: [] });
  t('ohne Gruppen: leer gesetzt', leer.leer === true);
  t('ohne Gruppen: Status leer (keine Scheinaussage)', leer.status === 'leer');
  t('ohne Gruppen: kein Strom', leer.iB === null);
  t('ohne Gruppen: keine Sicherung behauptet', leer.sichVor === null);

  const nullLeistung = lbCalc({ ...BASIS, gruppen: [{ p: 0, g: 1, cos: 0.9 }] });
  t('Gruppe mit 0 kW ergibt ebenfalls leer', nullLeistung.leer === true);

  const ohneCos = lbCalc({ ...BASIS, gruppen: [{ p: 10, g: 1, cos: 0 }] });
  t('cos φ = 0 läuft nicht ins Unendliche', isFinite(ohneCos.qB) && isFinite(ohneCos.sB));
}

console.log('— Gleichzeitigkeit wirkt —');
{
  const ohneG = lbCalc({ ...BASIS, gruppen: BASIS.gruppen.map(g => ({ ...g, g: 1 })) });
  near('ohne Gleichzeitigkeit ist P_b = P_inst', ohneG.pB, P_INST, 1e-12);
  t('Gleichzeitigkeit senkt die bezogene Leistung', r.pB < ohneG.pB);
  t('und damit den Bemessungsstrom', r.iB < ohneG.iB);
}

console.log('— Verbrauchertypen sind Startwerte —');
{
  t('Katalog vorhanden', Array.isArray(LB_TYPEN) && LB_TYPEN.length >= 10);
  t('«Eigene Angabe» steht zuoberst', LB_TYPEN[0].id === 'frei');
  t('ohmsche Verbraucher mit cos φ = 1',
    LB_TYPEN.filter(x => x.id === 'ww' || x.id === 'herd').every(x => x.cos === 1));
  t('jeder Typ hat cos φ und g', LB_TYPEN.every(x => x.cos > 0 && x.cos <= 1 && x.g > 0 && x.g <= 1));
}

console.log('— Abgrenzungen werden immer ausgewiesen —');
t('Gleichzeitigkeit als Richtwert benannt',
  r.hinweise.some(h => /Richtwerte/.test(h.text)));
t('Strombelastbarkeit wird abgegrenzt und verlinkt',
  r.hinweise.some(h => /Strombelastbarkeit/.test(h.text) && /el_belastbarkeit\.html/.test(h.text)));
t('Wirkung nur vor der Kondensatorbatterie erklärt',
  r.hinweise.some(h => /Endstromkreisen/.test(h.text)));

console.log(`\n${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
