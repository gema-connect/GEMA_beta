/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test el_belastbarkeit (Strombelastbarkeit & Kabelwahl)
   ════════════════════════════════════════════════════════════════════════
   Prüft den /*ENGINE-START*​/-Block von el_belastbarkeit.html sowie die
   Iz-Ergänzung in gema_elektro.js gegen UNABHÄNGIGE Werte:

     · Umgebungstemperatur-Faktoren gegen die publizierte Tabelle der
       SN EN 60364-5-52 / IEC 60364-5-52 Tab. B.52.14 (nicht gegen die
       eigene Formel — die Formel MUSS die Tabelle reproduzieren).
     · Rechenketten von Hand nachgerechnet (im Kommentar jeweils die
       vollständige Zahlenkette, damit ein Fehler auffällt und nicht die
       Implementierung sich selbst bestätigt).
     · Der Nachweis I_B ≤ I_n ≤ I_z und I₂ ≤ 1.45·I_z inkl. des Unterschieds
       zwischen Leitungsschutzschalter (k₂ 1.45) und gG-Sicherung (k₂ 1.6).
     · «Kein stiller Deckel»: Häufung über 4 Kreisen, Umgebung ≥ θmax,
       fehlender Tabellenwert, kein ausreichender Querschnitt.

   AUSFÜHREN:  node scripts/belastbarkeit_engine_test.mjs
   Kein Browser nötig — der Kern ist DOM-frei.
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const nah = (a, b, eps, m) => ok(Math.abs(a - b) <= eps, `${m} (ist ${a}, erwartet ${b} ±${eps})`);

/* ── Fachbasis laden (DOM-frei, Mini-window) ──────────────────────────── */
const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;

/* ── ENGINE-Block aus dem Modul herausschneiden und ausführen ─────────── */
const html = readFileSync(join(ROOT, 'el_belastbarkeit.html'), 'utf8');
const von = html.indexOf('/*ENGINE-START*/');
const bis = html.indexOf('/*ENGINE-END*/');
ok(von >= 0 && bis > von, 'ENGINE-Block in el_belastbarkeit.html gefunden');
const engineSrc = html.slice(von, bis);
/* Kommentare vor der Prüfung entfernen — im Merksatz «keine getElementById»
   stehen die verbotenen Namen selbst drin. Geprüft wird der CODE. */
const engineCode = engineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/getElementById|innerHTML|document\.|window\./.test(engineCode),
   'ENGINE-Block ist DOM-frei (kein getElementById/innerHTML/document/window)');
const blCalc = new Function('GemaElektro', engineSrc + '\nreturn blCalc;')(E);

/* ═══ A — Fachbasis: Tabellenwerte und Faktoren ═══════════════════════ */
console.log('── A: Tabellen & Korrekturfaktoren ──');

/* Stichproben aus den hinterlegten Tabellen (NIN 5.2.3 / SN EN 60364-5-52).
   Einadrig im Dreieck (F) muss über Mehrleiter (E) liegen — bessere
   Wärmeabgabe; ein vertauschtes Tabellenpaar fiele hier auf. */
ok(E.elIzBasis('xlpe', 'F', 95) === 328, 'XLPE, Verlegeart F, 95 mm² = 328 A');
ok(E.elIzBasis('xlpe', 'E', 95) === 298, 'XLPE, Verlegeart E, 95 mm² = 298 A');
ok(E.elIzBasis('pvc',  'E', 50) === 153, 'PVC, Verlegeart E, 50 mm² = 153 A');
ok(E.elIzBasis('pvc',  'F', 50) === 167, 'PVC, Verlegeart F, 50 mm² = 167 A');
ok(E.elIzBasis('cfw',  'E', 25) === 138, 'CFW, 25 mm² = 138 A');
ok(E.elIzBasis('xlpe', 'F', 16) === null, '16 mm² nicht hinterlegt → null (kein Ersatzwert)');
ok(E.elIzBasis('xlpe', 'F', 400) === null, '400 mm² nicht hinterlegt → null');

for (const t of ['xlpe', 'pvc']) {
  const qs = E.elIzQuerschnitte(t, 'F');
  let mono = true, groesser = true;
  for (let i = 1; i < qs.length; i++) {
    if (E.elIzBasis(t, 'F', qs[i]) <= E.elIzBasis(t, 'F', qs[i - 1])) mono = false;
    if (E.elIzBasis(t, 'F', qs[i]) < E.elIzBasis(t, 'E', qs[i])) groesser = false;
  }
  ok(mono, t + ': Iz steigt streng monoton mit dem Querschnitt');
  ok(groesser, t + ': Dreieck (F) trägt mindestens so viel wie Mehrleiter (E)');
}
ok(E.elIzQuerschnitte('xlpe', 'F').join(',') === '25,35,50,70,95,120,150,185,240,300',
   'Querschnittsreihe 25 – 300 mm² vollständig und sortiert');

/* Temperaturfaktor gegen die PUBLIZIERTE Tabelle (IEC 60364-5-52 B.52.14).
   Quelle unabhängig von der Implementierung — die Formel muss sie treffen. */
const NORM_70 = {10:1.22, 15:1.17, 20:1.12, 25:1.06, 30:1.00, 35:0.94, 40:0.87, 45:0.79, 50:0.71, 55:0.61};
const NORM_90 = {10:1.15, 15:1.12, 20:1.08, 25:1.04, 30:1.00, 35:0.96, 40:0.91, 45:0.87,
                 50:0.82, 55:0.76, 60:0.71, 65:0.65, 70:0.58, 75:0.50, 80:0.41};
let t70 = true, t90 = true;
for (const [tu, soll] of Object.entries(NORM_70)) {
  if (Math.round(E.elIzTempFaktor(70, +tu) * 100) / 100 !== soll) { t70 = false; console.log('    70°C @' + tu + ': ' + E.elIzTempFaktor(70, +tu)); }
}
for (const [tu, soll] of Object.entries(NORM_90)) {
  if (Math.round(E.elIzTempFaktor(90, +tu) * 100) / 100 !== soll) { t90 = false; console.log('    90°C @' + tu + ': ' + E.elIzTempFaktor(90, +tu)); }
}
ok(t70, 'f_θ (70 °C) reproduziert ALLE 10 Norm-Tabellenwerte auf 2 Stellen');
ok(t90, 'f_θ (90 °C) reproduziert ALLE 15 Norm-Tabellenwerte auf 2 Stellen');
nah(E.elIzTempFaktor(70, 40), Math.sqrt(30 / 40), 1e-12, 'f_θ PVC bei 40 °C = √(30/40)');
ok(E.elIzTempFaktor(70, 30) === 1, 'f_θ bei 30 °C = 1 (Bezugstemperatur der Tabellen)');
ok(E.elIzTempFaktor(70, 70) === 0, 'θu = θmax → 0 (Leitung nicht belastbar)');
ok(E.elIzTempFaktor(70, 85) === 0, 'θu über θmax → 0, nie negativ');
ok(E.elIzTempFaktor(90, 25) > 1, 'kühler als 30 °C → Faktor über 1 (zulässige Erhöhung)');

/* Häufung — Werte und der wichtige null-Fall */
ok(E.elIzHaeufung(1) === 1.00 && E.elIzHaeufung(2) === 0.90 &&
   E.elIzHaeufung(3) === 0.80 && E.elIzHaeufung(4) === 0.75, 'Häufungsfaktoren 1–4 korrekt');
ok(E.elIzHaeufung(5) === null, 'Häufung über 4 Kreisen → null (KEIN Rückfall auf 1.00)');
ok(E.elIzHaeufung(0) === null && E.elIzHaeufung(-1) === null, 'Häufung < 1 → null');

/* ═══ B — Rechenkette I_z ════════════════════════════════════════════ */
console.log('── B: Rechenkette Iz ──');

/* Von Hand: XLPE F 95 mm² = 328 A · θu 40 °C → f_θ = √(50/60) = 0.9128709
   · 2 gehäufte Kreise → f_h = 0.90
   ⇒ I_z = 328 · 0.9128709 · 0.90 = 269.4796 A */
{
  const r = E.elIz('xlpe', 'F', 95, 40, 2);
  nah(r.fTemp, 0.9128709291752769, 1e-12, 'f_θ XLPE bei 40 °C');
  nah(r.iz, 328 * Math.sqrt(50 / 60) * 0.90, 1e-9, 'Iz XLPE 95 mm² / 40 °C / 2 Kreise');
  nah(r.iz, 269.4796, 1e-3, 'Iz von Hand nachgerechnet ≈ 269.48 A');
  ok(r.fehler === null, 'gültige Kombination meldet keinen Fehler');
}
{
  const r = E.elIz('pvc', 'E', 50, 40, 1);
  nah(r.iz, 153 * Math.sqrt(30 / 40), 1e-9, 'Iz PVC 50 mm² bei 40 °C');
  nah(r.iz, 132.5019, 1e-3, 'Iz PVC ≈ 132.50 A (Norm-Faktor 0.87 gäbe 133.11 — < 0.5 % Differenz)');
}
ok(E.elIz('xlpe', 'F', 95, 30, 5).fehler === 'haeufung_unbekannt', 'Häufung 5 → Fehlerkennung');
ok(E.elIz('xlpe', 'F', 95, 30, 5).iz === null, 'Häufung 5 → KEIN Iz-Wert');
ok(E.elIz('pvc', 'F', 95, 70, 1).fehler === 'umgebung_zu_warm', 'θu = θmax → Fehlerkennung');
ok(E.elIz('xlpe', 'F', 16, 30, 1).fehler === 'kein_tabellenwert', 'fehlender Querschnitt → Fehlerkennung');

/* ═══ C — Nachweis Überlastschutz ═══════════════════════════════════ */
console.log('── C: Nachweis IB ≤ In ≤ Iz und I2 ≤ 1.45·Iz ──');

const basis = { typ:'xlpe', verlegeart:'F', q:95, nPar:1, nHaeuf:1, tempU:30,
                ib:250, schutz:'ls', inWahl:'auto' };

/* Referenz A — von Hand:
   Iz30 = 328 A · f_θ(30) = 1 · f_h(1) = 1 ⇒ Iz,ges = 328 A
   In automatisch = nächste Sicherung ≥ 250 A = 250 A
   (1) 250 ≤ 250 ≤ 328              → erfüllt
   (2) I2 = 1.45·250 = 362.5 ≤ 1.45·328 = 475.6 → erfüllt
   Auslastung = 250/328 = 76.22 %
   kleinster Querschnitt mit Iz,ges ≥ 250 A: 25→135, 35→169, 50→207, 70→268 ⇒ 70 mm² */
{
  const r = blCalc(basis);
  nah(r.izGes, 328, 1e-9, 'A: Iz,ges = 328 A');
  ok(r.inNenn === 250, 'A: In automatisch = 250 A');
  ok(r.b1 === true, 'A: Bedingung 1 erfüllt');
  ok(r.b2 === true, 'A: Bedingung 2 erfüllt');
  nah(r.i2, 362.5, 1e-9, 'A: I2 = 1.45 · 250 = 362.5 A');
  nah(r.i2Max, 475.6, 1e-9, 'A: 1.45 · Iz,ges = 475.6 A');
  nah(r.auslastung * 100, 76.2195, 1e-3, 'A: Auslastung 76.22 %');
  ok(r.vorschlagQ === 70, 'A: kleinster ausreichender Querschnitt = 70 mm²');
  ok(r.status === 'ok', 'A: Status ok');
  ok(r.meldungen.length === 0, 'A: keine Meldungen');
}

/* Referenz B — dieselbe Anlage mit gG-Sicherung auf 70 mm²:
   Iz,ges = 268 A · (1) 250 ≤ 268 erfüllt
   (2) I2 = 1.6·250 = 400 A > 1.45·268 = 388.6 A ⇒ VERLETZT
   Das ist der Praxis-Klassiker: In ≤ Iz reicht bei Schmelzsicherungen nicht.
   kleinster Querschnitt: Iz,ges ≥ 400/1.45 = 275.86 A ⇒ 95 mm² (328 A) */
{
  const r = blCalc({ ...basis, q:70, schutz:'gg' });
  nah(r.izGes, 268, 1e-9, 'B: Iz,ges = 268 A');
  ok(r.b1 === true, 'B: Bedingung 1 erfüllt (In ≤ Iz)');
  ok(r.b2 === false, 'B: Bedingung 2 VERLETZT — gG-Sicherung, I2 = 1.6·In');
  nah(r.i2, 400, 1e-9, 'B: I2 = 1.6 · 250 = 400 A');
  nah(r.i2Max, 388.6, 1e-9, 'B: 1.45 · 268 = 388.6 A');
  ok(r.status === 'err', 'B: Status err');
  ok(r.vorschlagQ === 95, 'B: Vorschlag 95 mm² (berücksichtigt Bedingung 2)');
  ok(r.meldungen.some(m => m.typ === 'err' && /Bedingung 2/.test(m.text)),
     'B: Verletzung wird als Fehler benannt');
}
/* Gegenprobe: derselbe Fall mit LS-Schalter ist zulässig — der Unterschied
   liegt ausschliesslich an k₂. */
{
  const r = blCalc({ ...basis, q:70, schutz:'ls' });
  ok(r.b1 === true && r.b2 === true, 'B-Gegenprobe: mit LS-Schalter ist 70 mm² zulässig');
  ok(r.status !== 'err', 'B-Gegenprobe: kein Fehlerstatus');
  ok(r.vorschlagQ === 70, 'B-Gegenprobe: Vorschlag 70 mm²');
  /* 250/268 = 93.3 % — zulässig, aber knapp: das MUSS als Vorbehalt
     erscheinen und nicht als grünes «alles gut». */
  ok(r.status === 'warn', 'B-Gegenprobe: 93 % Auslastung → warn statt grün');
}

/* Referenz C — parallele Leiter + Häufung, von Hand:
   XLPE F 240 mm² = 607 A · f_θ(30) = 1 · f_h(2) = 0.90 ⇒ Iz = 546.3 A je Kreis
   n_par = 2 ⇒ Iz,ges = 1092.6 A */
{
  const r = blCalc({ ...basis, q:240, nPar:2, nHaeuf:2, ib:0, inWahl:'auto' });
  nah(r.izKreis, 546.3, 1e-9, 'C: Iz je Kreis = 607 · 0.90 = 546.3 A');
  nah(r.izGes, 1092.6, 1e-9, 'C: Iz,ges = 2 · 546.3 = 1092.6 A');
  ok(r.status === 'nurIz', 'C: ohne IB/In nur Iz — kein grüner Nachweis');
  ok(r.b1 === null && r.b2 === null, 'C: Bedingungen bleiben ungeprüft (null)');
}

/* Häufung wird auf die Zahl der eigenen Parallelkreise angehoben — zwei
   parallele Kabel liegen zwangsläufig nebeneinander. */
{
  const r = blCalc({ ...basis, q:240, nPar:3, nHaeuf:1, ib:0 });
  ok(r.nHaeuf === 3, 'D: n_häuf wird auf n_par angehoben');
  nah(r.fHaeuf, 0.80, 1e-9, 'D: f_h folgt der angehobenen Häufung');
  ok(r.meldungen.some(m => m.typ === 'warn' && /Häufung/.test(m.text)),
     'D: Anhebung wird gemeldet, nicht still vorgenommen');
}

/* ═══ D — Kein stiller Deckel ════════════════════════════════════════ */
console.log('── D: Grenzfälle werden gemeldet ──');

{
  const r = blCalc({ ...basis, nHaeuf:5 });
  ok(r.izGes === null, 'Häufung 5: kein Iz-Wert');
  ok(r.status === 'err', 'Häufung 5: Status err');
  ok(r.meldungen.some(m => m.typ === 'err' && /1\.00/.test(m.text)),
     'Häufung 5: Meldung begründet, warum NICHT auf 1.00 zurückgefallen wird');
}
{
  const r = blCalc({ ...basis, typ:'pvc', tempU:75 });
  ok(r.status === 'err', 'θu über θmax: Status err');
  ok(r.izGes === 0, 'θu über θmax: Iz = 0');
  ok(r.meldungen.some(m => /nicht belastet/.test(m.text)), 'θu über θmax: klare Meldung');
}
{
  const r = blCalc({ ...basis, q:16 });
  ok(r.status === 'err' && r.meldungen.some(m => /kein Tabellenwert/.test(m.text)),
     'Querschnitt ausserhalb der Tabelle wird benannt');
}
/* PVC E 300 mm² = 497 A · f_h(4) = 0.75 ⇒ 372.75 A < In 400 A
   ⇒ kein Querschnitt der Reihe reicht — das MUSS gemeldet werden. */
{
  const r = blCalc({ ...basis, typ:'pvc', verlegeart:'E', q:300, nHaeuf:4, ib:390, inWahl:400 });
  nah(r.izGes, 372.75, 1e-9, 'Reihen-Ende: Iz,ges = 497 · 0.75 = 372.75 A');
  ok(r.vorschlagQ === null, 'Reihen-Ende: kein ausreichender Querschnitt');
  ok(r.meldungen.some(m => m.typ === 'err' && /grösste hinterlegte Querschnitt/.test(m.text)),
     'Reihen-Ende: wird als Fehler gemeldet statt leer zu bleiben');
}
/* Betriebsstrom über der Sicherungsreihe (max. 400 A) */
{
  const r = blCalc({ ...basis, q:300, ib:600, inWahl:'auto' });
  ok(r.inAuto === null, 'IB 600 A: kein Nennstrom in der Reihe');
  ok(r.meldungen.some(m => /von Hand/.test(m.text)), 'IB 600 A: Hinweis auf manuelle Wahl');
}
/* Betriebsstrom über dem Nennstrom */
{
  const r = blCalc({ ...basis, ib:300, inWahl:250 });
  ok(r.b1 === false, 'IB > In: Bedingung 1 verletzt');
  ok(r.meldungen.some(m => m.typ === 'err' && /Normalbetrieb/.test(m.text)),
     'IB > In: als Fehler benannt');
}
/* NIN 5.2.3.7 — Parallelschaltung erst ab 70 mm² Cu */
{
  const r = blCalc({ ...basis, q:50, nPar:2, nHaeuf:2, ib:0 });
  ok(r.meldungen.some(m => m.typ === 'warn' && /5\.2\.3\.7/.test(m.text)),
     'Parallel mit 50 mm²: NIN 5.2.3.7 wird gemeldet');
}
/* CFW im Dreieck: konservative Gleichsetzung wird offengelegt */
{
  const r = blCalc({ ...basis, typ:'cfw', verlegeart:'F', ib:0 });
  ok(r.meldungen.some(m => m.typ === 'info' && /Mehrleiter/.test(m.text)),
     'CFW im Dreieck: Annahme wird ausgewiesen');
}
/* Randbereich der Temperaturtabelle */
{
  const r = blCalc({ ...basis, typ:'pvc', q:95, tempU:60, ib:0 });
  ok(r.meldungen.some(m => m.typ === 'warn' && /55 °C/.test(m.text)),
     'PVC über 55 °C: Randbereich der Tabelle wird gemeldet');
}
{
  const r = blCalc({ ...basis, tempU:5, ib:0 });
  ok(r.meldungen.some(m => m.typ === 'warn' && /10 °C/.test(m.text)),
     'unter 10 °C: ausserhalb des tabellierten Bereichs wird gemeldet');
}
/* Hohe Auslastung → amber statt grün.
   95 mm² → Iz,ges 328 A · IB 310 A · In 315 A
   (1) 310 ≤ 315 ≤ 328 erfüllt · (2) 1.45·315 = 456.75 ≤ 475.6 erfüllt
   Auslastung = 310/328 = 94.5 % ⇒ zulässig, aber ohne Reserve. */
{
  const r = blCalc({ ...basis, ib:310, inWahl:315 });
  ok(r.b1 === true && r.b2 === true, 'hohe Auslastung: beide Bedingungen erfüllt');
  nah(r.auslastung * 100, 94.5122, 1e-3, 'Auslastung 94.51 %');
  ok(r.status === 'warn', 'hohe Auslastung → Status warn (nicht grün)');
  ok(r.meldungen.some(m => m.typ === 'warn' && /Reserve/.test(m.text)),
     'hohe Auslastung: fehlende Reserve wird benannt');
}

/* ═══ E — Kabelwahl-Tabelle ══════════════════════════════════════════ */
console.log('── E: Kabelwahl-Tabelle ──');
{
  const r = blCalc(basis);
  ok(r.tabelle.length === 10, 'Tabelle enthält alle 10 Querschnitte');
  ok(r.tabelle.every(z => z.izGes > 0), 'jede Zeile trägt einen Iz-Wert');
  ok(r.tabelle.filter(z => z.aktuell).length === 1, 'genau eine Zeile ist die gewählte');
  ok(r.tabelle.find(z => z.aktuell).q === 95, 'die gewählte Zeile ist 95 mm²');
  const erste = r.tabelle.find(z => z.passt);
  ok(erste && erste.q === r.vorschlagQ, 'erste passende Zeile = Vorschlag');
  let steigend = true;
  for (let i = 1; i < r.tabelle.length; i++) if (r.tabelle[i].izGes <= r.tabelle[i-1].izGes) steigend = false;
  ok(steigend, 'Iz,ges steigt über die Reihe');
  ok(r.tabelle.every(z => z.passt === false || z.q >= r.vorschlagQ),
     'unterhalb des Vorschlags passt keine Zeile');
}
/* Ohne Nennstrom bleibt die Spalte «Nachweis» leer statt grün */
{
  const r = blCalc({ ...basis, ib:0, inWahl:'auto' });
  ok(r.tabelle.every(z => z.passt === null), 'ohne In: Nachweis-Spalte bleibt ungeprüft (null)');
}

/* ═══ F — Robustheit ═════════════════════════════════════════════════ */
console.log('── F: Robustheit ──');
ok(blCalc({}).status === 'err' || blCalc({}).status === 'leer', 'leere Eingabe stürzt nicht ab');
{
  const r = blCalc({ ...basis, tempU:NaN });
  ok(isFinite(r.izGes), 'ungültige Temperatur → endlicher Wert (Rückfall auf 30 °C)');
  nah(r.izGes, 328, 1e-9, 'NaN-Temperatur rechnet mit dem Bezugswert 30 °C');
}
{
  const r = blCalc({ ...basis, ib:-50 });
  ok(r.ib === 0, 'negativer Betriebsstrom wird auf 0 geklemmt');
}
ok(blCalc({ ...basis, verlegeart:'X' }).izGes === 328,
   'unbekannte Verlegeart fällt auf F zurück statt zu crashen');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
