/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test el_belastbarkeit (Node, ohne Browser)
   ════════════════════════════════════════════════════════════════════════
   Prüft den ENGINE-Block von el_belastbarkeit.html gegen UNABHÄNGIG
   gerechnete Werte — die Erwartungen stehen als Zahl mit Herleitung im
   Test, nie als Aufruf derselben Funktion.

     node scripts/belastbarkeit_engine_test.mjs

   Teil 1  Fachdaten in gema_elektro.js (Tabellenform, Plausibilität)
   Teil 2  Iz-Kette: Referenzwert · Temperatur · Häufung · parallel
   Teil 3  Kabelwahl + Nachweis nach NIN 4.3.3 (Bedingung 1 und 2)
   Teil 4  Grenzen werden GEMELDET, nicht stillschweigend gedeckelt
   Teil 5  Spannungsfall-Gegencheck (κ bei Betriebstemperatur)
   Teil 6  Vergleichstabelle (Verlegeart D mit eigener Temperaturbasis)
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
/* Toleranz relativ — die Erwartungen sind von Hand gerechnet. */
const nah = (a, b, tol, m) => ok(a !== null && a !== undefined && Math.abs(a - b) <= tol,
  m + ' (erwartet ' + b + ', erhalten ' + a + ')');

/* ── Laden: Fachbasis + ENGINE-Block ─────────────────────────────────── */
const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;

const html = readFileSync(join(ROOT, 'el_belastbarkeit.html'), 'utf8');
const mm = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
ok(!!mm, 'ENGINE-Block in el_belastbarkeit.html gefunden');
ok(!/getElementById|innerHTML|document\./.test(mm[1]),
   'ENGINE-Block ist DOM-frei (kein getElementById / innerHTML / document.)');
const { blCalc, blVergleich } =
  new Function('GemaElektro', mm[1] + '\nreturn {blCalc:blCalc, blVergleich:blVergleich};')(E);

/* Basis-Eingabe: mehradrig, 3 belastete Leiter, PVC, Kupfer, Verlegeart C,
   30 °C Luft, keine Häufung, 1 Leiter je Aussenleiter. */
const B = {
  modus:'iz', bauart:'meh', belastet:3, isolation:'pvc', material:'cu',
  verlegeId:'C', parallel:1, tUmg:30, haeufModus:'keine', n:1, nGering:0,
  fManuell:0.7, A:16, ib:0, inNenn:0, schutz:'mcb',
  systemId:'3p400', laenge:0, duMax:0
};
const mit = o => Object.assign({}, B, o);
const hatTyp = (r, t) => r.meldungen.some(m => m.typ === t);
const enthaelt = (r, s) => r.meldungen.some(m => m.text.indexOf(s) >= 0);

/* ══ TEIL 1 — Fachdaten ═══════════════════════════════════════════════ */
console.log('── Teil 1: Fachdaten (gema_elektro.js) ──');

/* Spaltenzahl jeder Tabelle muss zur Zahl der Verlegearten passen —
   sonst zeigt eine Spalte den Wert einer anderen Verlegeart. */
for (const [key, tab] of Object.entries(E.EL_IZ)) {
  const bauart = key.split('|')[0];
  const soll = E.elVerlegearten(bauart).length;
  const falsch = Object.entries(tab.werte).filter(([, r]) => r.length !== soll);
  ok(falsch.length === 0, key + ': jede Zeile hat ' + soll + ' Spalten');
  ok(tab.quelle === 'norm' || tab.quelle === 'naeherung', key + ': Herkunft deklariert');
}
ok(E.EL_IZ['meh|2|90'].quelle === 'naeherung' && E.EL_IZ['ein|2|90'].quelle === 'naeherung',
   '2 Leiter / 90 °C sind als Näherung deklariert (hochgerechnet, nicht entnommen)');
ok(E.EL_IZ['meh|3|70'].quelle === 'norm' && E.EL_IZ['ein|3|70'].quelle === 'norm',
   '3 Leiter / 70 °C sind als Normwerte deklariert');

/* Plausibilität: innerhalb einer Spalte muss Iz mit dem Querschnitt steigen. */
for (const [key, tab] of Object.entries(E.EL_IZ)) {
  const A = Object.keys(tab.werte).map(Number).sort((a, b) => a - b);
  const sp = E.elVerlegearten(key.split('|')[0]).length;
  let mono = true;
  for (let c = 0; c < sp; c++) {
    let prev = 0;
    for (const a of A) {
      const v = tab.werte[a][c];
      if (v === null) continue;
      if (v < prev) mono = false;
      prev = v;
    }
  }
  ok(mono, key + ': Iz steigt in jeder Spalte mit dem Querschnitt');
}

/* Bekannte Auffälligkeit: in den belegten Tabellen ist C ≥ B1/B2 (die
   direkt verlegte Leitung trägt mehr als die im Rohr). Wo das verletzt ist,
   MUSS es eine Näherungstabelle sein — genau das ist im Modul der Grund
   für die Marke «hochgerechnet». */
for (const [key, tab] of Object.entries(E.EL_IZ)) {
  const verletzt = Object.entries(tab.werte)
    .filter(([, r]) => r[1] !== null && r[2] !== null && r[1] > r[2])
    .map(([a]) => a);
  if (tab.quelle === 'norm') ok(verletzt.length === 0, key + ': Normtabelle erfüllt C ≥ B (' + verletzt + ')');
}
ok(Object.entries(E.EL_IZ['ein|2|90'].werte).some(([, r]) => r[1] > r[2]),
   'ein|2|90: die dokumentierte Auffälligkeit B1 > C ist noch da (Marke «Näherung» begründet)');

/* Temperaturfaktoren — Stützwerte und Interpolation von Hand geprüft. */
nah(E.elKorrTemp(70, 40, false).f, 0.87, 1e-9, 'kϑ Luft PVC 40 °C = 0.87');
nah(E.elKorrTemp(90, 50, false).f, 0.82, 1e-9, 'kϑ Luft XLPE 50 °C = 0.82');
nah(E.elKorrTemp(70, 25, true).f,  0.95, 1e-9, 'kϑ Boden PVC 25 °C = 0.95 (Bezug 20 °C)');
/* 32.5 °C liegt mittig zwischen 30 (1.00) und 35 (0.94) → 0.97 */
nah(E.elKorrTemp(70, 32.5, false).f, 0.97, 1e-9, 'kϑ Luft PVC 32.5 °C interpoliert = 0.97');
/* 42 °C: 0.87 + (0.79-0.87)·(2/5) = 0.87 − 0.032 = 0.838 */
nah(E.elKorrTemp(70, 42, false).f, 0.838, 1e-9, 'kϑ Luft PVC 42 °C interpoliert = 0.838');
ok(E.elKorrTemp(70, 30, false).f === 1 && E.elKorrTemp(70, 20, true).f === 1,
   'Referenzbedingungen liefern Faktor 1.00 (Luft 30 °C / Erdreich 20 °C)');
ok(E.elKorrTemp(70, 61, false).f === null && E.elKorrTemp(70, 61, false).lage === 'ueber',
   'über dem Tabellenbereich gibt es KEINEN Faktor (nicht extrapolieren)');
ok(E.elKorrTemp(70, 5, false).lage === 'unter' && E.elKorrTemp(70, 5, false).f === 1.22,
   'unter dem Tabellenbereich wird auf den kleinsten Stützwert geklemmt (sichere Seite)');

/* Häufung: konservativ = kleinerer Wert der beiden Quellen. */
const h4 = E.elHaeufung(4, false);
ok(h4.nin === 0.70 && h4.iec === 0.65 && h4.f === 0.65,
   'n=4: NIN 0.70 ⇄ EN 0.65 → gerechnet wird 0.65');
const h6 = E.elHaeufung(6, false);
ok(h6.nin === 0.55 && h6.iec === 0.57 && h6.f === 0.55, 'n=6: 0.55 ⇄ 0.57 → 0.55');
ok(E.elHaeufung(1, false).f === 1, 'n=1 → Faktor 1.00');
ok(E.elHaeufung(2, false).f === 0.80 && E.elHaeufung(9, false).f === 0.50,
   'n=2 → 0.80, n=9 → 0.50 (beide Quellen gleich)');
ok(E.elHaeufung(40, false).ueberReihe === true, 'weit über der Reihe wird als solches gemeldet');
ok(E.elHaeufung(4, true).f === 0.65 && E.elHaeufung(6, true).f === 0.60,
   'Erdreich läuft über die eigene Tabelle (n=4 → 0.65, n=6 → 0.60)');
/* NIN 5.2.3.5 Anm. 1 — gering belastete Kreise fallen aus der Zählung. */
ok(E.elHaeufungAnzahl(5, 2) === 3, '5 Kreise, 2 davon <30 % → 3 wirksame Kreise');
ok(E.elHaeufungAnzahl(3, 9) === 1, 'nie weniger als 1 wirksamer Kreis');
ok(E.elHaeufungAnzahl(4, 0) === 4, 'ohne Abzug bleibt die Zahl unverändert');

/* ══ TEIL 2 — Iz-Kette ════════════════════════════════════════════════ */
console.log('\n── Teil 2: Iz = Iz,Tab · kϑ · kh · n ──');

/* NIN mehradrig, 3 belastete Leiter, PVC, Verlegeart C, 16 mm² → 76 A. */
let r = blCalc(mit({}));
nah(r.izRef, 76, 1e-9, 'Referenzwert C / 16 mm² / PVC / 3 Leiter = 76 A');
nah(r.iz, 76, 1e-9, 'bei Referenzbedingungen ist Iz = Iz,Tab');
ok(r.quelle === 'norm', 'Herkunft «norm» wird durchgereicht');

/* 40 °C → 76 · 0.87 = 66.12 */
r = blCalc(mit({ tUmg:40 }));
nah(r.kTemp.f, 0.87, 1e-9, '40 °C → kϑ 0.87');
nah(r.iz, 66.12, 1e-9, '76 · 0.87 = 66.12 A');

/* 40 °C + 3 gehäufte Kreise → 76 · 0.87 · 0.70 = 46.284 */
r = blCalc(mit({ tUmg:40, haeufModus:'tabelle', n:3 }));
nah(r.kHaeuf.f, 0.70, 1e-9, '3 Kreise → kh 0.70');
nah(r.kGes, 0.609, 1e-9, 'kges = 0.87 · 0.70 = 0.609');
nah(r.iz, 46.284, 1e-6, '76 · 0.87 · 0.70 = 46.284 A');

/* Interpolierte Temperatur: 76 · 0.97 = 73.72 */
r = blCalc(mit({ tUmg:32.5 }));
nah(r.iz, 73.72, 1e-9, '32.5 °C → 76 · 0.97 = 73.72 A');

/* 30 %-Regel wirkt auf den Faktor: 5 Kreise, 2 gering → wie 3 Kreise (0.70),
   NICHT wie 5 Kreise (0.60). */
r = blCalc(mit({ haeufModus:'tabelle', n:5, nGering:2 }));
ok(r.nEff === 3, '5 Kreise − 2 gering belastete = 3 wirksame');
nah(r.kHaeuf.f, 0.70, 1e-9, 'Faktor folgt den 3 wirksamen Kreisen');
nah(r.iz, 53.2, 1e-9, '76 · 0.70 = 53.2 A');
ok(enthaelt(r, '5.2.3.5'), 'der Abzug wird als Annahme ausgewiesen (Nachweis-Pflicht)');
/* Gegenprobe ohne Abzug: 5 Kreise → 0.60 → 45.6 A */
r = blCalc(mit({ haeufModus:'tabelle', n:5, nGering:0 }));
nah(r.iz, 45.6, 1e-9, 'ohne Abzug: 76 · 0.60 = 45.6 A');

/* Erdverlegung nimmt die Boden-, nicht die Lufttabelle:
   Verlegeart D / 16 mm² = 64 A · kϑ(Boden, 25 °C) 0.95 = 60.8 A.
   Mit der Lufttabelle wären es 64 · 1.06 = 67.84 A — also zu viel. */
r = blCalc(mit({ verlegeId:'D', tUmg:25 }));
ok(r.erd === true, 'Verlegeart D ist als Erdverlegung erkannt');
nah(r.izRef, 64, 1e-9, 'Referenzwert D / 16 mm² = 64 A');
nah(r.kTemp.f, 0.95, 1e-9, '25 °C Erdreich → 0.95 (nicht 1.06 wie in Luft)');
nah(r.iz, 60.8, 1e-9, '64 · 0.95 = 60.8 A');

/* Parallele Leiter verdoppeln die Belastbarkeit. */
r = blCalc(mit({ parallel:2 }));
nah(r.iz, 152, 1e-9, '2 parallele Leiter → 2 · 76 = 152 A');
ok(hatTyp(r, 'warn') && enthaelt(r, 'eigene Stromkreise'),
   'parallel ohne Häufung wird als Warnung gemeldet');
ok(enthaelt(r, '5.2.3.7'), 'die Bedingungen für Parallelverlegung stehen als Hinweis da');

/* Manueller Faktor überschreibt die Tabelle. */
r = blCalc(mit({ haeufModus:'manuell', fManuell:0.5 }));
nah(r.iz, 38, 1e-9, 'manueller Faktor 0.50 → 76 · 0.50 = 38 A');
ok(r.kHaeuf.modus === 'manuell' && enthaelt(r, 'von Hand'), 'manueller Faktor wird ausgewiesen');

/* Einadrig / 2 belastete Leiter greift auf die richtige Tabelle:
   ein|2|70, Verlegeart B1, 10 mm² = 57 A. */
r = blCalc(mit({ bauart:'ein', belastet:2, verlegeId:'B1', A:10 }));
nah(r.izRef, 57, 1e-9, 'einadrig / 2 Leiter / B1 / 10 mm² = 57 A');

/* ══ TEIL 3 — Kabelwahl und Nachweis NIN 4.3.3 ════════════════════════ */
console.log('\n── Teil 3: Kabelwahl + Nachweis ──');

/* Ohne eigenen Nennstrom schlägt GEMA den nächstgrösseren vor. */
r = blCalc(mit({ ib:38 }));
ok(r.inAuto === true && r.inNenn === 40, 'Ib 38 A → vorgeschlagen In 40 A');

/* Modus «Strom → Querschnitt», Leitungsschutzschalter (I₂ = 1.45·In):
   Bedingung 2 verlangt nichts über Bedingung 1 hinaus → Iz ≥ 40 A.
   meh|3|70 / C: 6 mm² = 41 A ist der erste Wert ≥ 40. */
r = blCalc(mit({ modus:'a', ib:40, schutz:'mcb' }));
ok(r.A === 6, 'LS-Schalter, Ib 40 A → 6 mm²');
nah(r.iz, 41, 1e-9, 'Iz des gewählten Kabels = 41 A');
ok(r.b1.ok && r.b2.ok, 'beide Bedingungen erfüllt');
nah(r.b2.i2, 58, 1e-9, 'I₂ = 1.45 · 40 = 58 A');
nah(r.b2.grenze, 59.45, 1e-9, '1.45 · Iz = 1.45 · 41 = 59.45 A');

/* Dieselbe Aufgabe mit Schmelzsicherung gG (I₂ = 1.6·In):
   nötig ist Iz ≥ 1.6/1.45 · 40 = 44.14 A → 6 mm² (41 A) reicht NICHT,
   es wird 10 mm² (57 A). Genau dieser Schritt fehlt, wenn man nur auf
   Ib ≤ Iz dimensioniert. */
r = blCalc(mit({ modus:'a', ib:40, schutz:'gg' }));
nah(r.izSoll, 44.1379310344, 1e-6, 'gG verlangt Iz ≥ 1.6/1.45 · 40 = 44.14 A');
ok(r.A === 10, 'Schmelzsicherung gG, Ib 40 A → 10 mm² statt 6 mm²');
nah(r.iz, 57, 1e-9, 'Iz = 57 A');
ok(r.b1.ok && r.b2.ok, 'beide Bedingungen erfüllt');
ok(enthaelt(r, 'Bedingung 2'), 'der massgebende Grund wird benannt');

/* Bedingung 1 erfüllt, Bedingung 2 verletzt — der Fall, den eine reine
   «Ib ≤ Iz»-Prüfung durchgehen liesse.
   6 mm² = 41 A, In 40 A gG: 40 ≤ 41 ✓, aber I₂ 64 > 1.45·41 = 59.45 ✗ */
r = blCalc(mit({ A:6, ib:40, inNenn:40, schutz:'gg' }));
ok(r.b1.ok === true, 'Bedingung 1 (40 ≤ 40 ≤ 41) ist erfüllt');
ok(r.b2.ok === false, 'Bedingung 2 (64 ≤ 59.45) ist verletzt');
ok(r.status === 'err' && enthaelt(r, 'Bedingung 2 ist verletzt'),
   'die Auslegung wird als unzulässig gemeldet');

/* Auslastung */
r = blCalc(mit({ A:16, ib:70, inNenn:63, schutz:'mcb' }));
nah(r.auslastung, 70 / 76 * 100, 1e-9, 'Auslastung = Ib / Iz');
ok(hatTyp(r, 'warn') && enthaelt(r, '90 %'), 'über 90 % Auslastung wird gewarnt');

/* Nennstrom unter Betriebsstrom */
r = blCalc(mit({ ib:50, inNenn:32 }));
ok(hatTyp(r, 'err') && enthaelt(r, 'liegt unter dem Betriebsstrom'),
   'In < Ib wird als Fehler gemeldet');

/* ══ TEIL 4 — Grenzen werden GEMELDET ═════════════════════════════════ */
console.log('\n── Teil 4: kein stiller Deckel ──');

/* Auch der grösste Querschnitt reicht nicht: 9 gehäufte Kreise (0.50),
   In 400 A, gG → nötig 400·1.1034/0.50 = 882.8 A Referenzwert.
   Grösster Wert in meh|3|70 / C ist 464 A. */
r = blCalc(mit({ modus:'a', ib:380, schutz:'gg', haeufModus:'tabelle', n:9 }));
ok(r.A === null && r.reichtNicht === true, 'kein Querschnitt reicht → kein stiller Deckel');
ok(hatTyp(r, 'err') && enthaelt(r, 'reicht nicht'), 'der Fall wird ausdrücklich gemeldet');

/* Temperatur über dem Tabellenbereich → kein Ergebnis, aber eine Meldung. */
r = blCalc(mit({ tUmg:70 }));
ok(r.kTemp.f === null && r.iz === null, '70 °C Luft: kein Faktor, kein Iz');
ok(hatTyp(r, 'err') && enthaelt(r, 'über dem Tabellenbereich'), 'die Grenze wird benannt');

/* Verlegeart F ist erst ab 25 mm² tabelliert. */
r = blCalc(mit({ bauart:'ein', verlegeId:'F', A:16 }));
ok(r.izRef === null && hatTyp(r, 'err') && enthaelt(r, 'erst ab 25 mm²'),
   'F / 16 mm²: fehlender Tabellenwert wird begründet gemeldet');
r = blCalc(mit({ bauart:'ein', verlegeId:'F', A:25 }));
nah(r.izRef, 110, 1e-9, 'F / 25 mm² = 110 A (ab hier tabelliert)');

/* Mehradrig gibt es über 300 mm² nicht. */
r = blCalc(mit({ A:400 }));
ok(r.izRef === null && hatTyp(r, 'err'), 'mehradrig 400 mm²: gemeldet statt still leer');

/* Aluminium: gemeldet, nicht still mit Kupferwerten gerechnet. */
r = blCalc(mit({ material:'al' }));
ok(r.izRef === null && r.iz === null, 'Aluminium liefert kein Iz aus der Kupfertabelle');
ok(hatTyp(r, 'err') && enthaelt(r, 'Kupferleiter'), 'der Grund steht in der Meldung');
nah(r.kappa, 36 / (1 + 0.00403 * 50), 1e-9, 'κ rechnet trotzdem mit Aluminium weiter');

/* Näherungstabelle wird als solche gemeldet. */
r = blCalc(mit({ belastet:2, isolation:'xlpe' }));
ok(r.quelle === 'naeherung' && hatTyp(r, 'warn') && enthaelt(r, 'hochgerechnete'),
   '2 Leiter / 90 °C: Näherung wird ausgewiesen, nicht als Normwert getarnt');

/* Ungültiger manueller Faktor */
r = blCalc(mit({ haeufModus:'manuell', fManuell:1.4 }));
ok(r.kHaeuf.f === null && r.iz === null && hatTyp(r, 'err'), 'Faktor > 1 wird abgelehnt');

/* Betriebsstrom über der Sicherungsreihe */
r = blCalc(mit({ modus:'a', ib:500 }));
ok(r.inNenn === null && hatTyp(r, 'err') && enthaelt(r, '400 A'),
   'kein Schutzorgan in der Reihe → gemeldet');

/* ══ TEIL 5 — Spannungsfall-Gegencheck ════════════════════════════════ */
console.log('\n── Teil 5: Spannungsfall (κ bei Betriebstemperatur) ──');

/* κ Cu bei 70 °C = 56 / (1 + 0.00393·50) = 56 / 1.1965 = 46.803176 m/(Ω·mm²)
   ΔU = √3 · 40 A · 50 m / (46.803176 · 10 mm²) = 3464.1016 / 468.03176
      = 7.401424 V  →  7.401424 / 400 · 100 = 1.850356 % */
const KAPPA70 = 56 / 1.1965;
r = blCalc(mit({ A:10, ib:40, inNenn:40, laenge:50, systemId:'3p400', duMax:5 }));
nah(r.kappa, 46.803176, 1e-5, 'κ Cu bei 70 °C = 46.803 (NICHT 56)');
nah(r.du, 7.401424, 1e-5, 'ΔU = 7.401 V');
nah(r.duProz, 1.850356, 1e-5, 'ΔU = 1.850 %');
ok(r.duOk === true, '1.85 % liegt unter den zugelassenen 5 %');

/* Mit κ₂₀ käme 6.186 V heraus — rund 16 % zu günstig. Der Test hält fest,
   dass die Engine NICHT so rechnet. */
ok(Math.abs(r.du - (Math.sqrt(3) * 40 * 50 / (56 * 10))) > 1,
   'es wird nicht mit κ₂₀ gerechnet (das wäre zu günstig)');

/* Parallele Leiter halbieren den Spannungsfall. */
const r1 = blCalc(mit({ A:10, ib:40, inNenn:40, laenge:50 }));
const r2 = blCalc(mit({ A:10, ib:40, inNenn:40, laenge:50, parallel:2 }));
nah(r2.du, r1.du / 2, 1e-9, '2 parallele Leiter → halber Spannungsfall');

/* Einphasig rechnet mit Faktor 2 und 230 V:
   ΔU = 2 · 20 A · 30 m / (46.803176 · 4 mm²) = 1200 / 187.2127 = 6.409821 V
   → 6.409821 / 230 · 100 = 2.786879 % */
r = blCalc(mit({ belastet:2, A:4, ib:20, inNenn:20, laenge:30, systemId:'1p230', duMax:3 }));
nah(r.du, 1200 / (KAPPA70 * 4), 1e-9, 'einphasig: ΔU = 6.410 V (Faktor 2, nicht √3)');
nah(r.duProz, 2.786879, 1e-5, 'einphasig: ΔU = 2.787 % von 230 V');

/* Grenzwert überschritten → Warnung, und der Grund wird benannt. */
r = blCalc(mit({ A:10, ib:40, inNenn:40, laenge:200, duMax:3 }));
ok(r.duOk === false && hatTyp(r, 'warn') && enthaelt(r, 'Spannungsfall massgebend'),
   'über dem Grenzwert wird auf den Spannungsfall als massgebende Grösse hingewiesen');

/* Ohne Länge kein Gegencheck — und keine erfundene Zahl. */
r = blCalc(mit({ laenge:0 }));
ok(r.du === null, 'ohne Länge kein Spannungsfall-Ergebnis');

/* ══ TEIL 6 — Vergleichstabelle ═══════════════════════════════════════ */
console.log('\n── Teil 6: Vergleich der Verlegearten ──');

let v = blVergleich(mit({ tUmg:30 }));
ok(v.spalten.length === 5, 'mehradrig: 5 Verlegearten (A2 B2 C D E)');
ok(v.zeilen.length === E.EL_QUERSCHNITTE.length, 'eine Zeile je genormtem Querschnitt');
/* 30 °C: Luft 1.00, Erdreich (Spalte D) 0.89 — die Spalte rechnet mit
   ihrer EIGENEN Temperaturbasis. */
nah(v.faktoren[2], 1.00, 1e-9, 'Spalte C (Luft) bei 30 °C → 1.00');
nah(v.faktoren[3], 0.89, 1e-9, 'Spalte D (Erdreich) bei 30 °C → 0.89');
{
  const z16 = v.zeilen.find(z => z.A === 16);
  nah(z16.zellen[2].iz, 76, 1e-9, '16 mm² Spalte C = 76 A');
  nah(z16.zellen[3].iz, 64 * 0.89, 1e-9, '16 mm² Spalte D = 64 · 0.89 = 56.96 A');
  ok(z16.zellen[2].aktiv === true && z16.zellen[3].aktiv === false, 'aktive Spalte markiert');
}
v = blVergleich(mit({ bauart:'ein' }));
ok(v.spalten.length === 8, 'einadrig: 8 Verlegearten (A1 B1 C D F F-eben G-h G-v)');
{
  const z16 = v.zeilen.find(z => z.A === 16);
  ok(z16.zellen[4].ref === null, 'einadrig 16 mm² Spalte F: kein Wert (erst ab 25 mm²)');
  const z25 = v.zeilen.find(z => z.A === 25);
  nah(z25.zellen[4].iz, 110, 1e-9, 'einadrig 25 mm² Spalte F = 110 A');
}
/* Häufung wirkt in allen Spalten, im Erdreich mit der eigenen Tabelle:
   n=4 → Luft 0.65, Erdreich 0.65 (hier zufällig gleich); n=6 → 0.55 ⇄ 0.60 */
v = blVergleich(mit({ haeufModus:'tabelle', n:6 }));
nah(v.faktoren[2], 0.55, 1e-9, 'Spalte C mit 6 Kreisen → 0.55');
nah(v.faktoren[3], 0.89 * 0.60, 1e-9, 'Spalte D mit 6 Kreisen → 0.89 · 0.60 (Erd-Tabelle)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
