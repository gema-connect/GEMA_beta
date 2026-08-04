/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test el_kurzschluss (Node, kein Browser)
   ════════════════════════════════════════════════════════════════════════
   Prüft den /*ENGINE-START*​/-Block von el_kurzschluss.html gegen
   UNABHÄNGIG gerechnete Werte: die Referenzen unten sind aus den Formeln
   der IEC 60909-0 bzw. SN EN 60364-4-41 hier ausgeschrieben und rufen
   NICHT die Funktionen des Moduls auf. Läuft der Test grün, stimmen die
   Formelketten — nicht bloss die Implementierung mit sich selbst überein.

   Fachlich abgesichert wird vor allem der Punkt, an dem eine
   Kurzschlussberechnung typischerweise falsch wird:
     • I_k max rechnet mit dem KALTEN Leiter (20 °C) — sonst fällt der
       Strom zu klein aus und ein zu schwaches Gerät gilt als ausreichend.
     • I_k min rechnet mit dem WARMEN Leiter — sonst ist die Abschaltung
       nur auf dem Papier nachgewiesen (κ₂₀ liegt rund 20 % zu hoch).

   AUSFÜHREN:  node scripts/kurzschluss_engine_test.mjs
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

/* ── Fachbasis + Engine laden ──────────────────────────────────────────
   gema_elektro.js ist DOM-frei und lässt sich mit einem Mini-window laden;
   der ENGINE-Block wird aus der Seite geschnitten und bekommt GemaElektro
   als Parameter (der `typeof`-Guard im Modul greift dann). */
const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;

const html = readFileSync(join(ROOT, 'el_kurzschluss.html'), 'utf8');
const A_MARK = '/*ENGINE-' + 'START*/', E_MARK = '/*ENGINE-' + 'END*/';
const von = html.indexOf(A_MARK), bis = html.indexOf(E_MARK);
t('ENGINE-Block in el_kurzschluss.html gefunden', von >= 0 && bis > von);
const engineSrc = html.slice(von + A_MARK.length, bis);
const { kzCalc } = new Function('GemaElektro', engineSrc + '\nreturn { kzCalc: kzCalc };')(E);
t('kzCalc ist eine Funktion', typeof kzCalc === 'function');

/* ── Referenzfall ──────────────────────────────────────────────────────
   400/230 V · Trafo 630 kVA, u_k 4 %, P_k 6500 W · Netz S_k″ 250 MVA
   Leitung 50 m, 16 mm² Cu, PE = 16 mm², x′ 0.08 mΩ/m · LS C 32 A        */
const BASIS = {
  netz: '3p400', cFaktor: 'c110', speiseModus: 'trafo',
  sTrafo: 630, uk: 4, pk: 6500, nTrafo: 1, skQ: 250,
  ikSpeise: 0, rxSpeise: 0.1,
  laenge: 50, querschnitt: 16, qPE: 0, material: 'cu',
  nPar: 1, xBelag: 0.08, tempMin: 70,
  schutzTyp: 'C', inSchutz: 32, iaManuell: 0, tAbschalt: 't04', icn: 6
};

/* ── Unabhängige Referenzrechnung (Formeln ausgeschrieben) ──────────── */
const S3 = Math.sqrt(3);
const UN = 400, U0 = 230, C_MAX = 1.10, C_MIN = 0.95;

// κ(t) = κ₂₀ / (1 + α·(t−20)); Cu: κ₂₀ = 56, α = 0.00393
const K_KALT = 56;
const K_WARM = 56 / (1 + 0.00393 * (70 - 20));

// Netz: Z_Q = c·U²/S_k″ ; R_Q/X_Q = 0.1  →  X_Q = Z_Q/√1.01
const Z_Q = C_MAX * UN * UN / 250e6;
const X_Q = Z_Q / Math.sqrt(1.01);
const R_Q = 0.1 * X_Q;

// Trafo: Z_T = u_k/100·U²/S_rT ; R_T = P_k·U²/S_rT² ; X_T = √(Z_T²−R_T²)
const Z_T = (4 / 100) * UN * UN / 630e3;
const R_T = 6500 * UN * UN / (630e3 * 630e3);
const X_T = Math.sqrt(Z_T * Z_T - R_T * R_T);

// Leitung: R = L/(κ·A·n) ; X = x′·L/n
const R_L20 = 50 / (K_KALT * 16 * 1);
const R_LW = 50 / (K_WARM * 16 * 1);
const X_L = 0.08e-3 * 50;

// I_k max — dreipolig, Leiter KALT
const R_K = R_Q + R_T + R_L20, X_K = X_Q + X_T + X_L;
const Z_GES = Math.sqrt(R_K * R_K + X_K * X_K);
const IK_MAX = C_MAX * UN / (S3 * Z_GES);

// I_k min — Schleife L-PE am Leitungsende, Leiter WARM
const R_S = R_Q + R_T + R_LW + R_LW, X_S = X_Q + X_T + X_L + X_L;
const Z_S = Math.sqrt(R_S * R_S + X_S * X_S);
const IK_MIN = C_MIN * U0 / Z_S;

const r = kzCalc(BASIS);

console.log('— Leitfähigkeit: kalt für I_k max, warm für I_k min —');
near('κ kalt = 56 (Katalogwert 20 °C)', r.kappaKalt, K_KALT);
near('κ warm bei 70 °C = 46.799', r.kappaWarm, K_WARM);
t('κ warm liegt rund 20 % unter κ₂₀', r.kappaWarm / r.kappaKalt > 0.82 && r.kappaWarm / r.kappaKalt < 0.85);

console.log('— Einzelimpedanzen —');
near('Z_Q = c·U²/S_k″ = 0.000704 Ω', r.zQ, Z_Q, 1e-9);
near('R_Q = 0.1·X_Q', r.rQ, R_Q, 1e-9);
near('Z_T = u_k/100·U²/S_rT = 0.0101587 Ω', r.zT, Z_T, 1e-9);
near('R_T = P_k·U²/S_rT² = 0.0026203 Ω', r.rT, R_T, 1e-9);
near('X_T = √(Z_T²−R_T²)', r.xT, X_T, 1e-9);
near('R Leitung kalt = L/(κ₂₀·A) = 0.0558036 Ω', r.rL20, R_L20, 1e-9);
near('X Leitung = x′·L = 0.004 Ω', r.xL, X_L, 1e-9);
near('Z Leitung = √(R²+X²)', r.zLeitung, Math.sqrt(R_L20 * R_L20 + X_L * X_L), 1e-9);

console.log('— Kurzschlussströme —');
near('Z gesamt (Weg von I_k max) = 0.060268 Ω', r.zGesamt, Z_GES, 1e-9);
near('I_k max = c_max·U_n/(√3·Z) = 4215 A', r.ikMax, IK_MAX, 1e-9);
near('Z_S (Schleife, warm) = 0.137486 Ω', r.zSchleife, Z_S, 1e-9);
/* Der Leitungsanteil wird eigenständig gerechnet, NICHT als Z_S minus
   Vorimpedanz — die Summe ist vektoriell, eine Betrags-Subtraktion wäre
   falsch (Schema und Anteils-Balken zeigen diesen Wert). */
near('Leitungsanteil der Schleife = √((2R)²+(2X)²)',
  r.zLtgS, Math.sqrt((2 * R_LW) ** 2 + (2 * X_L) ** 2), 1e-9);
t('Betrags-Summe der Glieder ≠ Z_S (vektorielle Addition)',
  Math.abs((r.zQ + r.zT + r.zLtgS) - r.zSchleife) > 1e-6);
near('I_k min = c_min·U0/Z_S = 1589 A', r.ikMin, IK_MIN, 1e-9);
t('I_k min ist kleiner als I_k max', r.ikMin < r.ikMax);

console.log('— Vektorielle Addition (skalar würde Z überschätzen) —');
t('Z gesamt < R-Summe + X-Summe (komplex addiert)', r.zGesamt < (R_K + X_K) - 1e-12);
near('Z gesamt = √(ΣR² + ΣX²)', r.zGesamt, Math.sqrt(r.rK * r.rK + r.xK * r.xK), 1e-12);

console.log('— KERN: Temperatur wirkt NUR auf I_k min —');
{
  const kalt = kzCalc({ ...BASIS, tempMin: 20 });
  const warm = kzCalc({ ...BASIS, tempMin: 90 });
  near('I_k max bleibt bei tempMin 20 °C unverändert', kalt.ikMax, r.ikMax, 1e-12);
  near('I_k max bleibt bei tempMin 90 °C unverändert', warm.ikMax, r.ikMax, 1e-12);
  t('I_k min sinkt mit steigender Leitertemperatur', warm.ikMin < r.ikMin && r.ikMin < kalt.ikMin);
  /* Gegenprobe: mit κ₂₀ gerechnet käme I_k min rund 15–20 % zu hoch heraus —
     genau der Fehler, den elKappa verhindert. */
  t('I_k min mit κ₂₀ wäre >10 % zu hoch', kalt.ikMin / r.ikMin > 1.10);
}

console.log('— Spannungsfaktor c (IEC 60909-0 Tab. 1) —');
{
  const c105 = kzCalc({ ...BASIS, cFaktor: 'c105' });
  t('c_max 1.05 liefert kleineres I_k max als 1.10', c105.ikMax < r.ikMax);
  near('c_min bleibt 0.95 → I_k min praktisch gleich', c105.ikMin, r.ikMin, 0.02);
}

console.log('— Querschnitt, Parallelleiter, PE —');
{
  const par = kzCalc({ ...BASIS, nPar: 2 });
  near('2 parallele Aussenleiter halbieren R der Leitung', par.rL20, R_L20 / 2, 1e-12);
  t('parallele Leiter erhöhen I_k max', par.ikMax > r.ikMax);

  const pe = kzCalc({ ...BASIS, qPE: 6 });                 // PE kleiner als L
  t('kleinerer PE erhöht die Schleifenimpedanz', pe.zSchleife > r.zSchleife);
  t('kleinerer PE senkt I_k min', pe.ikMin < r.ikMin);
  const rPE6 = 50 / (K_WARM * 6);
  near('R des PE = L/(κ_warm·A_PE)', pe.rS - (R_Q + R_T + R_LW), rPE6, 1e-9);
}

console.log('— Trafo: parallel und ohne P_k —');
{
  const zwei = kzCalc({ ...BASIS, nTrafo: 2 });
  near('2 Trafos halbieren Z_T', zwei.zT, Z_T / 2, 1e-9);
  t('2 Trafos erhöhen I_k max', zwei.ikMax > r.ikMax);

  const ohnePk = kzCalc({ ...BASIS, pk: 0 });
  near('ohne P_k: X_T = Z_T (rein induktiv)', ohnePk.xT, Z_T, 1e-9);
  t('ohne P_k: R_T = 0', ohnePk.rT === 0);
  t('ohne P_k wird das als Annahme gemeldet', ohnePk.hinweise.some(h => /rein induktiv/.test(h)));

  const krummPk = kzCalc({ ...BASIS, pk: 900000 });        // unplausibel gross
  t('unplausibles P_k wird gemeldet statt still verworfen',
    krummPk.hinweise.some(h => /passt nicht zu/.test(h)));
  t('unplausibles P_k → R_T = 0 (Rückfall, aber sichtbar)', krummPk.rT === 0);
}

console.log('— Vorgelagertes Netz —');
{
  const ohneNetz = kzCalc({ ...BASIS, skQ: 0 });
  t('ohne S_k″ ist Z_Q = 0', ohneNetz.zQ === 0);
  t('ohne S_k″ steigt I_k max (Z kleiner)', ohneNetz.ikMax > r.ikMax);
  t('fehlendes S_k″ wird gemeldet', ohneNetz.hinweise.some(h => /Vorgelagertes Netz nicht erfasst/.test(h)));
}

console.log('— Speisung aus gemeldetem I_k″ —');
{
  const ik = kzCalc({ ...BASIS, speiseModus: 'ik', ikSpeise: 10, rxSpeise: 0.1 });
  // Z_V = c·U/(√3·I_k) — Umkehrung der Kurzschlussformel
  const Z_V = C_MAX * UN / (S3 * 10000);
  near('Z der Speisung aus I_k″ = 0.0254 Ω', ik.zT, Z_V, 1e-9);
  near('R/X = 0.1 eingehalten', ik.rT / ik.xT, 0.1, 1e-9);
  t('R/X-Annahme wird gemeldet', ik.hinweise.some(h => /R\/X = 0\.1/.test(h)));
  /* Gegenprobe: ohne Leitung muss exakt der gemeldete Strom herauskommen. */
  const amPunkt = kzCalc({ ...BASIS, speiseModus: 'ik', ikSpeise: 10, laenge: 0 });
  near('ohne Leitung ergibt sich wieder I_k″ = 10 kA', amPunkt.ikMax, 10000, 1e-9);
}

console.log('— Abschaltbedingung (SN EN 60364-4-41) —');
{
  t('I_a = 10 × I_n für Typ C (obere Bandgrenze IEC 60898-1)', r.ia === 320);
  near('Z_zul = c_min·U0/I_a', r.zZul, C_MIN * U0 / 320, 1e-12);
  t('Nachweis erfüllt (1589 A ≥ 320 A)', r.erfuellt === true);
  near('Reserve-Faktor = I_k min / I_a', r.reserve, IK_MIN / 320, 1e-12);
  t('Status ok bei klarer Reserve', r.status === 'ok');

  const b = kzCalc({ ...BASIS, schutzTyp: 'B' });
  t('Typ B löst bei 5 × I_n aus', b.ia === 160);
  const d = kzCalc({ ...BASIS, schutzTyp: 'D' });
  t('Typ D löst bei 20 × I_n aus', d.ia === 640);

  const man = kzCalc({ ...BASIS, schutzTyp: 'manuell', iaManuell: 250 });
  t('manueller I_a wird übernommen (Sicherungs-Kennlinie)', man.ia === 250);

  // Lange, dünne Leitung → Nachweis muss kippen
  const lang = kzCalc({ ...BASIS, laenge: 400, querschnitt: 2.5 });
  t('400 m auf 2.5 mm²: Abschaltbedingung nicht erfüllt', lang.erfuellt === false);
  t('nicht erfüllt → Status err', lang.status === 'err');
  t('I_k min liegt dort unter I_a', lang.ikMin < lang.ia);

  // Knapper Fall muss als «knapp» gemeldet werden, nicht als grün
  const knapp = kzCalc({ ...BASIS, laenge: 246, querschnitt: 16 });
  t('knapp erfüllter Nachweis (<10 % Reserve) → Status warn',
    knapp.erfuellt === true && knapp.reserve < 1.1 && knapp.status === 'warn');
}

console.log('— Maximale Leitungslänge —');
{
  t('L_max ist berechnet', r.lMax > 0);
  /* Selbstprüfung über die Engine: bei genau L_max muss I_k min exakt auf
     I_a fallen. Das prüft die Umkehrformel gegen die Vorwärtsrechnung. */
  const amLimit = kzCalc({ ...BASIS, laenge: r.lMax });
  near('bei L_max fällt I_k min exakt auf I_a', amLimit.ikMin, r.ia, 1e-9);
  const knappDrueber = kzCalc({ ...BASIS, laenge: r.lMax * 1.02 });
  t('2 % über L_max ist der Nachweis verletzt', knappDrueber.erfuellt === false);

  /* Unabhängige Gegenrechnung der quadratischen Lösung. */
  const a_ = (1 / K_WARM) * (1 / 16 + 1 / 16);
  const b_ = 0.08e-3 * 2;
  const R0 = R_Q + R_T, X0 = X_Q + X_T, Zz = C_MIN * U0 / 320;
  const qa = a_ * a_ + b_ * b_, qb = 2 * (R0 * a_ + X0 * b_), qc = R0 * R0 + X0 * X0 - Zz * Zz;
  const LMAX = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
  near('L_max = 253.9 m (unabhängig gerechnet)', r.lMax, LMAX, 1e-9);

  /* Kein stiller Deckel: reicht schon die Speisung nicht, wird das gemeldet. */
  const hoffnungslos = kzCalc({ ...BASIS, schutzTyp: 'manuell', iaManuell: 200000 });
  t('unerreichbarer I_a → L_max = 0 mit Begründung',
    hoffnungslos.lMax === 0 && hoffnungslos.lMaxGrund === 'speisung');
}

console.log('— Schaltvermögen —');
{
  t('I_cn 6 kA reicht für I_k max 4.2 kA', r.icnOk === true);
  const klein = kzCalc({ ...BASIS, icn: 3 });
  t('I_cn 3 kA reicht nicht', klein.icnOk === false);
  t('zu kleines I_cn setzt den Status auf err', klein.status === 'err');
  const ohne = kzCalc({ ...BASIS, icn: 0 });
  t('ohne I_cn wird nicht geprüft (null statt falscher Freigabe)', ohne.icnOk === null);
}

console.log('— Einphasig 230 V —');
{
  const ein = kzCalc({ ...BASIS, netz: '1p230' });
  t('U0 = 230 V', ein.u0 === 230);
  /* Z_T ist eine STRANG-Impedanz und hängt an der Aussenleiterspannung des
     speisenden Netzes (400 V) — nicht an der 230 V des Stromkreises. Mit
     230 V gerechnet käme Z_T um den Faktor 3 zu klein heraus. */
  near('Z_T einphasig unverändert (auf 400 V bezogen)', ein.zT, Z_T, 1e-12);
  near('Z_Q einphasig unverändert (auf 400 V bezogen)', ein.zQ, Z_Q, 1e-12);
  t('Bezug auf 400 V wird als Annahme gemeldet',
    ein.hinweise.some(h => /Aussenleiterspannung 400 V/.test(h)));
  const einIk = kzCalc({ ...BASIS, netz: '1p230', speiseModus: 'ik', ikSpeise: 10 });
  near('I_k″-Rückrechnung einphasig ebenfalls über √3·400 V',
    einIk.zT, C_MAX * UN / (S3 * 10000), 1e-12);
  /* Einphasig läuft schon I_k max über Hin- und Rückleiter → Schleife. */
  const R_K1 = R_Q + R_T + R_L20 + R_L20, X_K1 = X_Q + X_T + X_L + X_L;
  const Z1 = Math.sqrt(R_K1 * R_K1 + X_K1 * X_K1);
  near('I_k max einphasig = c_max·U0/Z (L-N-Schleife)', ein.ikMax, C_MAX * U0 / Z1, 1e-9);
  t('einphasig ist I_k max kleiner als dreiphasig', ein.ikMax < r.ikMax);
}

console.log('— Unvollständige Eingaben —');
{
  const leer = kzCalc({ ...BASIS, sTrafo: 0, uk: 0 });
  t('ohne Trafo-Daten: speiseFehlt gesetzt', leer.speiseFehlt === true);
  t('ohne Trafo-Daten: Status leer (keine Scheinfreigabe)', leer.status === 'leer');
  const ohneLtg = kzCalc({ ...BASIS, laenge: 0, querschnitt: 0 });
  t('ohne Leitung: leitungFehlt gesetzt', ohneLtg.leitungFehlt === true);
  t('ohne Leitung: Status leer', ohneLtg.status === 'leer');
  const ohneSchutz = kzCalc({ ...BASIS, inSchutz: 0 });
  t('ohne Nennstrom: I_a null, kein Nachweis behauptet',
    ohneSchutz.ia === null && ohneSchutz.erfuellt === null);
}

console.log('— Annahmen werden immer ausgewiesen —');
t('Schleifenimpedanz-Verfahren wird benannt', r.hinweise.some(h => /Schleifenimpedanz/.test(h)));
t('TT-System wird abgegrenzt', r.hinweise.some(h => /TT-System/.test(h)));
t('Nullimpedanz-Vereinfachung wird benannt', r.hinweise.some(h => /Nullimpedanz/.test(h)));

/* ══════════════════════════════════════════════════════════════════════
   SELEKTIVITÄT & BACKUP-SCHUTZ
   ══════════════════════════════════════════════════════════════════════
   Referenzen sind hier ausgeschrieben: die Bandgrenzen kommen aus
   IEC 60898-1 (B 3…5, C 5…10, D 10…20 × In; I_nf 1.13 · In, I_2 1.45 · In)
   bzw. IEC 60947-2 (K 8…14 × In; 1.05 / 1.30 · In).                     */
console.log('— Auslösebereiche —');
{
  /* danach C 32 A → I4 = 5·32 = 160 A, I5 = 10·32 = 320 A
     davor  C 63 A → I4 = 5·63 = 315 A, I5 = 10·63 = 630 A               */
  const s = kzCalc({ ...BASIS, vorTyp: 'C', inVor: 63 }).sel;
  t('Selektivitäts-Auswertung ist aktiv', s.aktiv === true);
  near('I4 danach = 5 · 32 A', s.nach.i4, 160);
  near('I5 danach = 10 · 32 A', s.nach.i5, 320);
  near('I4 davor = 5 · 63 A', s.vor.i4, 315);
  near('I5 davor = 10 · 63 A', s.vor.i5, 630);
  near('I_nf danach = 1.13 · 32 A', s.nach.inf, 1.13 * 32);
  near('I_2 danach = 1.45 · 32 A', s.nach.i2, 1.45 * 32);

  /* I5 danach 320 A liegt ÜBER I4 davor 315 A → keine Magnetstaffelung.
     Genau dieser knappe Fall ist der Grund, warum die Staffelung über die
     Bandgrenzen und nicht über das Nennstromverhältnis geprüft wird:
     63/32 = 1.97 sähe nach der 1.6er-Faustregel gut aus. */
  t('C63 über C32: Kurzschlussbereich überschneidet sich', s.magnetOk === false);
  near('Nennstromverhältnis 63/32', s.verhaeltnis, 63 / 32);
  t('Überlastbereich gestaffelt (1.13·63 > 1.45·32)', s.thermischOk === true);
  near('rechnerische Grenze = I4 davor', s.grenzeRechnerisch, 315);
  t('ohne Katalogwert wird die Quelle als rechnerisch ausgewiesen',
    s.grenzeQuelle === 'rechnerisch');
  t('die rechnerische Untergrenze wird als solche benannt',
    s.hinweise.some(h => /Untergrenze/.test(h)));
}
{
  /* D 125 A davor: I4 = 10·125 = 1250 A > I5 danach 320 A → gestaffelt. */
  const s = kzCalc({ ...BASIS, vorTyp: 'D', inVor: 125 }).sel;
  t('D125 über C32: Kurzschlussbereich gestaffelt', s.magnetOk === true);
  near('Grenze = I4 davor = 10 · 125 A', s.grenze, 1250);
}
{
  /* Überlast NICHT gestaffelt: 1.13·40 = 45.2 < 1.45·32 = 46.4          */
  const s = kzCalc({ ...BASIS, vorTyp: 'C', inVor: 40 }).sel;
  t('C40 über C32: Überlastbereich überschneidet sich', s.thermischOk === false);
}
{
  /* Norm-Unterschied: K folgt IEC 60947-2 (1.05/1.30 statt 1.13/1.45).  */
  const s = kzCalc({ ...BASIS, vorTyp: 'K', inVor: 63 }).sel;
  near('I4 davor K63 = 8 · 63 A', s.vor.i4, 504);
  near('I5 davor K63 = 14 · 63 A', s.vor.i5, 882);
  near('I_nf davor = 1.05 · 63 A', s.vor.inf, 1.05 * 63);
  t('unterschiedliche Normen werden gemeldet',
    s.hinweise.some(h => /unterschiedlichen Normen/.test(h)));
}

console.log('— Selektivitätsgrenze und Katalogwert —');
{
  /* I_k max des Referenzfalls ist rund 4.2 kA — deutlich über I4 davor. */
  const a = kzCalc({ ...BASIS, vorTyp: 'D', inVor: 125 });
  t('I_k max über der Staffelgrenze ⇒ nicht selektiv', a.sel.selektiv === false);
  t('fehlende Selektivität ist kein Fehler, sondern eine Warnung', a.status === 'warn');
  t('die Abschaltbedingung bleibt davon unberührt', a.erfuellt === true);

  /* Katalogwert 6 kA hebt die Grenze über I_k max → selektiv.           */
  const b = kzCalc({ ...BASIS, vorTyp: 'D', inVor: 125, isKat: 6 });
  near('Katalogwert gewinnt: Grenze 6 kA', b.sel.grenze, 6000);
  t('Quelle ist der Katalog', b.sel.grenzeQuelle === 'katalog');
  t('mit Katalogwert selektiv', b.sel.selektiv === true);
  t('Status wieder ok', b.status === 'ok');

  /* Katalogwert UNTER der rechnerischen Grenze: der gemessene Wert gilt
     trotzdem — und der Widerspruch wird gemeldet, nicht verschluckt.   */
  const c = kzCalc({ ...BASIS, vorTyp: 'D', inVor: 125, isKat: 0.5 });
  near('Katalogwert 0.5 kA gilt auch unterhalb der Bandgrenze', c.sel.grenze, 500);
  t('Widerspruch Katalog ↔ Bandgrenze wird gemeldet',
    c.sel.hinweise.some(h => /Katalogwert/.test(h) && /Staffelgrenze/.test(h)));
}

console.log('— Backup-Schutz (Kaskadierung) —');
{
  /* Ohne Backup gilt weiterhin I_cn ≥ I_k max. I_k max ≈ 4.2 kA.        */
  const ohne = kzCalc({ ...BASIS, icn: 3 });
  t('ohne Backup: I_cn 3 kA reicht für 4.2 kA nicht', ohne.icnOk === false);
  t('ohne Backup: Status err', ohne.status === 'err');

  /* Mit geprüfter Kombination bis 25 kA DARF I_cn kleiner sein — genau
     dafür gibt es die Kaskadierung. Eine eigenständige I_cn-Prüfung wäre
     hier fachlich falsch. */
  const mit = kzCalc({ ...BASIS, icn: 3, vorTyp: 'D', inVor: 125, iBackup: 25 });
  t('mit Backup 25 kA: Nachweis über die Kombination', mit.icnOk === true);
  t('das wird als Backup-Deckung markiert', mit.icnUeberBackup === true);
  t('Backup selbst ist erfüllt', mit.sel.backupOk === true);
  t('der Verzicht auf I_cn ≥ I_k max wird begründet',
    mit.hinweise.some(h => /Backup-Kombination/.test(h)));

  /* Backup-Grenze unter I_k max: dann schützt auch die Kombination nicht. */
  const zuKlein = kzCalc({ ...BASIS, icn: 10, vorTyp: 'D', inVor: 125, iBackup: 2 });
  t('Backup-Grenze unter I_k max ⇒ nicht geschützt', zuKlein.sel.backupOk === false);
  t('und der Nachweis fällt durch, obwohl I_cn gross genug wäre',
    zuKlein.icnOk === false && zuKlein.status === 'err');

  /* Backup und Selektivität sind unabhängig. */
  t('backup-geschützt und trotzdem unselektiv ist möglich',
    mit.sel.backupOk === true && mit.sel.selektiv === false);
}

console.log('— Vorgelagertes Gerät ohne GEMA-Kennlinie —');
{
  const s = kzCalc({ ...BASIS, vorTyp: 'manuell', iaVor: 900 }).sel;
  t('Ansprechstrom von Hand wird übernommen', s.aktiv === true && s.vor.fest === true);
  near('Grenze = abgelesener Ansprechstrom', s.grenze, 900);
  t('ohne Band bleibt der Überlastvergleich offen', s.thermischOk === null);
  t('das Fehlen des Bandes wird benannt',
    s.hinweise.some(h => /Auslöseband/.test(h)));
}

console.log('— Leere Eingaben behaupten keine Selektivität —');
{
  const s = kzCalc({ ...BASIS }).sel;      // kein I_n davor erfasst
  t('ohne Gerät davor: Auswertung inaktiv', s.aktiv === false);
  t('ohne Gerät davor: keine Selektivitätsaussage', s.selektiv === null);
  t('ohne Gerät davor: kein Backup behauptet', s.backupAktiv === false);
  t('und der Gesamtstatus bleibt unverändert ok', kzCalc({ ...BASIS }).status === 'ok');
}

console.log(`\n${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
