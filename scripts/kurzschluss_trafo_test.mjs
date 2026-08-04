#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   Drift-Guard — Transformator-Betriebskennwerte in el_kurzschluss (Node)

   Das Modul rechnet zwei Dinge, die sauber getrennt bleiben müssen:
     · die FEHLERSCHLEIFE (Z_Q, Z_T, Z_S, I_k) — von einem anderen Chat
       gebaut und durch scripts/kurzschluss_engine_test.mjs abgesichert;
     · die BETRIEBSKENNWERTE des Transformators (ü, I_1N, I_2N, I_0,
       Laststrom, Klemmen-Kurzschlussstrom) — dieser Test.

   Der wichtigste Teil ist Abschnitt 7: er beweist, dass die neuen Felder
   die bestehende Kurzschlussrechnung NICHT verändern.

   Referenzen sind ausgeschrieben und werden nicht von der Engine geholt.

   Ausführen:  node scripts/kurzschluss_trafo_test.mjs
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(b, t) { if (b) { pass++; } else { fail++; console.log('  ✕ ' + t); } }
function nahe(a, b, tol, t) {
  const d = Math.abs(a - b), s = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  ok(d <= (tol || 1e-9) * s || d < 1e-12, t + ' — ist ' + a + ', soll ' + b);
}

/* ── Engine laden ──────────────────────────────────────────────────────── */
const html = readFileSync(join(ROOT, 'el_kurzschluss.html'), 'utf8');
const teil = html.split('/*ENGINE-START*/')[1];
if (!teil) { console.log('✕ ENGINE-Block nicht gefunden'); process.exit(1); }
const eng = teil.split('/*ENGINE-END*/')[0];

const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;
const { kzCalc, kzTrafoKennwerte } = new Function('GemaElektro',
  eng + '\n; return { kzCalc: kzCalc, kzTrafoKennwerte: kzTrafoKennwerte };')(E);

const S3 = Math.sqrt(3);

/* ══ 0. DOM-Freiheit ════════════════════════════════════════════════════ */
console.log('── Rechenkern ist DOM-frei ──');
{
  /* Kommentare weg — sie nennen die verbotenen Namen als Merksatz. */
  const code = eng.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  for (const verbot of ['document', 'getElementById', 'innerHTML', 'querySelector']) {
    ok(code.indexOf(verbot) < 0, 'ENGINE-Block ohne «' + verbot + '» im Code');
  }
}

/* ══ 1. Referenzfall aus der Vorlage ════════════════════════════════════
   250 kVA · 16 000/420 V · u_k 4 % · i_0 1.5 % · 80 % Auslastung */
console.log('── Referenzfall 250 kVA, 16 kV / 420 V ──');
const REF = { sTrafo: 250, u1: 16000, u2n: 420, uk: 4, i0: 1.5, last: 80, nTrafo: 1 };
{
  const r = kzTrafoKennwerte(REF);
  const i1n = 250e3 / (S3 * 16000);
  const i2n = 250e3 / (S3 * 420);

  nahe(r.ue, 16000 / 420, 1e-12, 'Übersetzung ü = U1N/U2N');
  nahe(r.ue, 38.0952381, 1e-7, 'ü numerisch (38.1 : 1)');
  nahe(r.i1n, i1n, 1e-12, 'I1N = S/(√3·U1N)');
  nahe(r.i1n, 9.0211, 1e-4, 'I1N numerisch (9.02 A)');
  nahe(r.i2n, i2n, 1e-12, 'I2N = S/(√3·U2N)');
  nahe(r.i2n, 343.6607, 1e-4, 'I2N numerisch (343.7 A)');
  /* I0 bezieht sich auf den PRIMÄREN Nennstrom — i0 ist so definiert. */
  nahe(r.i0, i1n * 1.5 / 100, 1e-12, 'I0 = i0 · I1N');
  nahe(r.i0, 0.13532, 1e-4, 'I0 numerisch (0.14 A)');
  nahe(r.iLast, i2n * 0.8, 1e-12, 'Laststrom = Auslastung · I2N');
  nahe(r.iLast, 274.9286, 1e-4, 'Laststrom numerisch (274.9 A)');
  /* Klemmen-Kurzschlussstrom: I2N / u_k — Kennwert ohne c und ohne Netz. */
  nahe(r.ikKlemmen, i2n / 0.04, 1e-12, 'Ik,Klemmen = I2N / uk');
  nahe(r.ikKlemmenGes / 1000, 8.59152, 1e-5, 'Ik,Klemmen numerisch (8.592 kA)');
  /* Gegenprobe über die Leistung: Ik = S/(√3·U2N·uk) */
  nahe(r.ikKlemmen, 250e3 / (S3 * 420 * 0.04), 1e-12, 'Gegenprobe Ik = S/(√3·U2N·uk)');
}

/* ══ 2. Bezugsspannung U2N ══════════════════════════════════════════════ */
console.log('── Bemessungs-Unterspannung ──');
{
  const a420 = kzTrafoKennwerte({ ...REF, u2n: 420 });
  const a400 = kzTrafoKennwerte({ ...REF, u2n: 400 });
  /* Der Unterschied ist kein Rundungsfehler: 420/400 = 5 % weniger Strom. */
  nahe(a420.i2n / a400.i2n, 400 / 420, 1e-12, 'I2N skaliert mit 1/U2N');
  ok(a400.i2n > a420.i2n, 'mit 400 V fällt I2N grösser aus als mit 420 V');
  ok(Math.abs(a400.i2n - a420.i2n) > 15, 'der Unterschied ist mit über 15 A relevant');
  /* Der Primärstrom hängt NICHT von U2N ab. */
  nahe(a420.i1n, a400.i1n, 1e-12, 'I1N ist von U2N unabhängig');
  /* Die Übersetzung dagegen schon. */
  nahe(a400.ue, 16000 / 400, 1e-12, 'ü folgt U2N');
}

/* ══ 3. Parallele Transformatoren ═══════════════════════════════════════ */
console.log('── Trafos parallel ──');
{
  for (const n of [2, 3]) {
    const r = kzTrafoKennwerte({ ...REF, nTrafo: n });
    const eins = kzTrafoKennwerte(REF);
    nahe(r.i2n, eins.i2n, 1e-12, 'I2N je Trafo bleibt gleich bei n=' + n);
    nahe(r.i2nGes, eins.i2n * n, 1e-12, 'I2N gesamt = n · I2N bei n=' + n);
    nahe(r.ikKlemmenGes, eins.ikKlemmen * n, 1e-12, 'Ik gesamt = n · Ik bei n=' + n);
    nahe(r.iLast, eins.i2n * n * 0.8, 1e-12, 'Laststrom gesamt bei n=' + n);
    nahe(r.i1n, eins.i1n, 1e-12, 'I1N je Trafo bleibt gleich bei n=' + n);
  }
  /* Bruchzahlen werden gerundet, 0 fällt auf 1 zurück. */
  ok(kzTrafoKennwerte({ ...REF, nTrafo: 0 }).n === 1, 'n = 0 fällt auf 1 zurück');
  ok(kzTrafoKennwerte({ ...REF, nTrafo: 2.4 }).n === 2, 'n wird gerundet');
}

/* ══ 4. Fehlende Angaben → null, nicht 0 ════════════════════════════════ */
console.log('── Fehlende Angaben ──');
{
  const ohneU1 = kzTrafoKennwerte({ sTrafo: 250, u2n: 420, uk: 4, nTrafo: 1 });
  ok(ohneU1.ue  === null, 'ohne U1N keine Übersetzung');
  ok(ohneU1.i1n === null, 'ohne U1N kein Primärstrom');
  ok(ohneU1.i0  === null, 'ohne U1N kein Leerlaufstrom');
  ok(ohneU1.i2n !== null, 'I2N bleibt trotzdem rechenbar');

  const ohneI0 = kzTrafoKennwerte({ ...REF, i0: 0 });
  ok(ohneI0.i0 === null, 'ohne i0 kein Leerlaufstrom (null statt 0)');

  const ohneLast = kzTrafoKennwerte({ ...REF, last: 0 });
  ok(ohneLast.iLast === null, 'ohne Auslastung kein Laststrom');

  const ohneUk = kzTrafoKennwerte({ ...REF, uk: 0 });
  ok(ohneUk.ikKlemmen === null, 'ohne uk kein Klemmen-Kurzschlussstrom');
  ok(ohneUk.i2n !== null, 'I2N hängt nicht von uk ab');

  const ohneS = kzTrafoKennwerte({ u1: 16000, u2n: 420, uk: 4, nTrafo: 1 });
  ok(ohneS.i2n === null && ohneS.i1n === null && ohneS.ue === null,
     'ohne Bemessungsleistung gar keine Kennwerte');

  /* Ein leeres Objekt darf nicht werfen. */
  let warf = false;
  try { kzTrafoKennwerte({}); } catch(e) { warf = true; }
  ok(!warf, 'leere Eingabe wirft nicht');
}

/* ══ 5. Einbindung in kzCalc ════════════════════════════════════════════ */
console.log('── Einbindung in kzCalc ──');
/* Vorlage im Zuschnitt des bestehenden Engine-Tests — plus meine Felder. */
const BASIS = {
  netz: '3p400', cFaktor: 'c110', speiseModus: 'trafo',
  sTrafo: 630, uk: 4, pk: 6500, nTrafo: 1, skQ: 250,
  laenge: 30, querschnitt: 16, qPE: 16, material: 'cu', nPar: 1,
  xBelag: 0.08, tempMin: 70, schutzTyp: 'C', inSchutz: 25,
  iaManuell: 0, tAbschalt: 't04', icn: 10
};
{
  const r = kzCalc({ ...BASIS, u1: 16000, u2n: 400, i0: 1.5, last: 80 });
  ok(r.trafoKw !== null && typeof r.trafoKw === 'object', 'kzCalc liefert trafoKw');
  nahe(r.trafoKw.i2n, 630e3 / (S3 * 400), 1e-12, 'I2N aus kzCalc');
  nahe(r.trafoKw.ue, 40, 1e-12, 'ü = 16000/400 = 40');

  /* Bei bekanntem I_k″ ist gar kein Trafo erfasst — dann auch keine Kennwerte. */
  const ik = kzCalc({ ...BASIS, speiseModus: 'ik', ikSpeise: 10, rxSpeise: 0.1,
                      u1: 16000, u2n: 400, i0: 1.5, last: 80 });
  ok(ik.trafoKw === null, 'Speisung «Ik bekannt» liefert keine Trafo-Kennwerte');

  /* Ohne die neuen Felder (Vorlage des bestehenden Tests) darf nichts brechen. */
  const alt = kzCalc(BASIS);
  ok(alt.trafoKw !== null, 'auch ohne die neuen Felder gibt es ein trafoKw-Objekt');
  ok(alt.trafoKw.ue === null && alt.trafoKw.i1n === null,
     'ohne U1N bleiben die davon abhängigen Werte null');
  ok(alt.trafoKw.i2n === null, 'ohne U2N kein I2N — es wird nichts unterstellt');
}

/* ══ 6. Hinweis bei abweichender Bemessungsspannung ═════════════════════ */
console.log('── Hinweis U2N ≠ Un ──');
{
  const ab = kzCalc({ ...BASIS, u1: 16000, u2n: 420, i0: 1.5, last: 80 });
  ok(ab.hinweise.some(h => /U<sub>2N<\/sub>/.test(h) && /420/.test(h)),
     'abweichende U2N wird gemeldet');
  ok(ab.hinweise.some(h => /60909/.test(h)),
     'der Hinweis erklärt, warum die Kurzschlussrechnung trotzdem mit Un rechnet');

  const gleich = kzCalc({ ...BASIS, u1: 16000, u2n: 400, i0: 1.5, last: 80 });
  ok(!gleich.hinweise.some(h => /U<sub>2N<\/sub>/.test(h)),
     'bei U2N = Un kein Hinweis');
}

/* ══ 7. REGRESSION — die Fehlerschleife bleibt unberührt ════════════════
   Der Kern dieses Tests: die neuen Felder dürfen die bestehende
   Kurzschlussrechnung an KEINER Stelle verändern. */
console.log('── Regression: Fehlerschleife unverändert ──');
{
  const ohne = kzCalc(BASIS);
  const mit  = kzCalc({ ...BASIS, u1: 16000, u2n: 420, i0: 1.5, last: 80 });
  const felder = ['un','u0','cMax','cMin','kappaKalt','kappaWarm',
                  'rQ','xQ','zQ','rT','xT','zT','rL20','xL','zLeitung',
                  'rS','xS','zSchleife','rK','xK','zGesamt',
                  'ikMax','ikMin','ia','zZul','erfuellt','reserve'];
  felder.forEach(function(f){
    ok(ohne[f] === mit[f] || (typeof ohne[f] === 'number' && Math.abs(ohne[f] - mit[f]) < 1e-12),
       'unverändert: ' + f + ' (' + ohne[f] + ' → ' + mit[f] + ')');
  });
  /* Auch die Auslastung darf den Kurzschlussstrom nicht anfassen. */
  const last30 = kzCalc({ ...BASIS, u1: 16000, u2n: 420, i0: 1.5, last: 30 });
  nahe(last30.ikMin, mit.ikMin, 1e-12, 'Auslastung ändert I_k min nicht');
  nahe(last30.ikMax, mit.ikMax, 1e-12, 'Auslastung ändert I_k max nicht');
  ok(last30.trafoKw.iLast < mit.trafoKw.iLast, 'sie ändert nur den Laststrom');
}

/* ══ 8. Kennwert gegen Rechenwert ═══════════════════════════════════════
   Beide Kurzschlussströme stehen auf derselben Seite — sie müssen sich
   plausibel zueinander verhalten, sonst ist einer davon falsch. */
console.log('── Klemmen-Kennwert gegenüber IEC-60909-Rechenwert ──');
{
  /* Trafonah: kurze, dicke Leitung, damit die Leitung nicht dominiert. */
  const nah = kzCalc({ ...BASIS, laenge: 1, querschnitt: 240, qPE: 240,
                       u1: 16000, u2n: 400, i0: 1.5, last: 80 });
  const kennwert = nah.trafoKw.ikKlemmenGes;
  ok(kennwert > 0 && nah.ikMax > 0, 'beide Ströme liegen vor');
  /* Der Rechenwert liegt höher (c = 1.10) und tiefer (Netz + R_T) —
     unter dem Strich in derselben Grössenordnung. */
  const q = nah.ikMax / kennwert;
  ok(q > 0.8 && q < 1.2, 'Rechenwert und Kennwert liegen um weniger als 20 % auseinander — ' + q.toFixed(3));
  /* Ohne vorgelagertes Netz und ohne R_T muss der Rechenwert exakt um den
     Spannungsfaktor über dem Kennwert liegen — das prüft die Herleitung. */
  const rein = kzCalc({ ...BASIS, laenge: 0, querschnitt: 0, skQ: 0, pk: 0,
                        cFaktor: 'c100', u1: 16000, u2n: 400, i0: 1.5, last: 80 });
  if (rein.ikMax > 0 && rein.trafoKw.ikKlemmenGes > 0) {
    nahe(rein.ikMax / rein.trafoKw.ikKlemmenGes, rein.cMax, 1e-6,
         'ohne Netz, ohne R_T und ohne Leitung ist der Quotient genau c_max');
  } else {
    ok(false, 'Grenzfall ohne Leitung liefert keine Ströme');
  }
}

/* ══ 9. Robustheit ═════════════════════════════════════════════════════ */
console.log('── Robustheit ──');
{
  const faelle = [
    { u1: 0 }, { u2n: 0 }, { i0: 0 }, { last: 0 }, { uk: 0 },
    { sTrafo: 0 }, { nTrafo: 0 }, { u1: -5 }, { u2n: -1 }, { last: -20 }
  ];
  faelle.forEach(function(f){
    const r = kzTrafoKennwerte({ ...REF, ...f });
    const werte = [r.ue, r.i1n, r.i2n, r.i2nGes, r.i0, r.iLast, r.ikKlemmen, r.ikKlemmenGes];
    ok(werte.every(v => v === null || Number.isFinite(v)),
       'null oder endlich bei ' + JSON.stringify(f) + ' — ' + werte.join('|'));
  });
  /* Und der volle Durchlauf darf ebenfalls nicht kippen. */
  const voll = kzCalc({ ...BASIS, sTrafo: 0, uk: 0, u1: 0, u2n: 0, i0: 0, last: 0 });
  ok(Number.isFinite(voll.ikMax) && Number.isFinite(voll.ikMin),
     'kzCalc bleibt bei leerer Speisung endlich');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
