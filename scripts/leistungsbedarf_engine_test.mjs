/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test el_leistungsbedarf (Anschlussleistung & Bemessungsstrom)
   ════════════════════════════════════════════════════════════════════════
   Prüft den /*ENGINE-START*​/-Block von el_leistungsbedarf.html sowie die
   Leistungs-Ergänzung in gema_elektro.js gegen UNABHÄNGIGE Werte:

     · Gleichzeitigkeit gegen die publizierte Tabelle 101 der EN 61439-1
       (Normwert — nicht gegen die eigene Implementierung).
     · Das Leistungsdreieck von Hand nachgerechnet: Wirk- und Blindleistung
       getrennt summiert, erst dann zur Scheinleistung zusammengesetzt.
       Die Gegenprobe zeigt, dass ein blosses Addieren der Scheinleistungen
       ein ANDERES (zu hohes) Ergebnis liefert.
     · Strom je Phase in beiden Fällen (gleichmässig / ungünstigst) —
       die vollständige Zahlenkette steht jeweils im Kommentar.
     · Ohmsches Gesetz: alle sechs Kombinationen zweier bekannter Grössen,
       gegeneinander konsistent geprüft.
     · «Kein stiller Deckel»: ungültige Zeilen fliessen NICHT in die Summen,
       Strom über der Sicherungsreihe wird gemeldet.

   AUSFÜHREN:  node scripts/leistungsbedarf_engine_test.mjs
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

/* ── ENGINE-Block herausschneiden und ausführen ───────────────────────── */
const html = readFileSync(join(ROOT, 'el_leistungsbedarf.html'), 'utf8');
const von = html.indexOf('/*ENGINE-START*/');
const bis = html.indexOf('/*ENGINE-END*/');
ok(von >= 0 && bis > von, 'ENGINE-Block in el_leistungsbedarf.html gefunden');
const engineSrc = html.slice(von, bis);
/* Kommentare vor der Prüfung entfernen — im Merksatz «keine getElementById»
   stehen die verbotenen Namen selbst drin. Geprüft wird der CODE. */
const engineCode = engineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/getElementById|innerHTML|document\.|window\./.test(engineCode),
   'ENGINE-Block ist DOM-frei (kein getElementById/innerHTML/document/window)');
const [lbCalc, lbAc] = new Function('GemaElektro', engineSrc + '\nreturn [lbCalc, lbAc];')(E);

/* ═══ A — Fachbasis ═══════════════════════════════════════════════════ */
console.log('── A: Gleichzeitigkeit, Leistungsdreieck, Ohm ──');

/* EN 61439-1 Tabelle 101 — publizierte Werte als unabhängige Quelle. */
const NORM_GZ = {1:1.00, 2:0.90, 3:0.90, 4:0.80, 5:0.80, 6:0.70, 7:0.70, 8:0.70, 9:0.70,
                 10:0.60, 15:0.60, 40:0.60};
let gzOk = true;
for (const [n, soll] of Object.entries(NORM_GZ)) {
  if (E.elGzEn61439(+n) !== soll) { gzOk = false; console.log('    n=' + n + ': ' + E.elGzEn61439(+n)); }
}
ok(gzOk, 'Gleichzeitigkeit trifft ALLE Stützstellen der EN 61439-1 Tab. 101');
ok(E.elGzEn61439(0) === null && E.elGzEn61439(-2) === null, 'Anzahl < 1 → null');

/* Leistungsdreieck — von Hand: cos φ 0.8 ⇒ tan φ = 0.6/0.8 = 0.75 */
nah(E.elScheinleistung(10, 0.8), 12.5, 1e-12, 'S = 10 / 0.8 = 12.5');
nah(E.elBlindleistung(10, 0.8), 7.5, 1e-12, 'Q = 10 · tan φ = 7.5 (3-4-5-Dreieck)');
nah(Math.sqrt(10*10 + 7.5*7.5), 12.5, 1e-12, 'Gegenprobe √(P²+Q²) = S');
ok(E.elBlindleistung(10, 1) === 0, 'cos φ = 1 → keine Blindleistung');
ok(E.elScheinleistung(10, 0) === null && E.elScheinleistung(10, 1.2) === null,
   'cos φ ausserhalb (0…1] → null statt Unsinnswert');

/* Strom aus Scheinleistung */
nah(E.elStromAusS(50000, '3p400'), 50000 / (Math.sqrt(3) * 400), 1e-9, 'I dreiphasig aus S');
nah(E.elStromAusS(50000, '3p400'), 72.169, 1e-3, 'I dreiphasig = 72.17 A');
nah(E.elStromAusS(3680, '1p230'), 16, 1e-9, 'I einphasig: 3680 VA / 230 V = 16 A');
ok(Math.abs(E.elAcFaktor('3p400') - Math.sqrt(3)) < 1e-12 && E.elAcFaktor('1p230') === 1,
   'AC-Faktor √3 bzw. 1 — NICHT der Verlustleistungs-Faktor fP');
ok(E.elSystem('3p400').fP === 3 && E.elAcFaktor('3p400') !== 3,
   'AC-Faktor ist bewusst verschieden von EL_SYSTEME.fP');

/* Ohmsches Gesetz — alle sechs Paare müssen denselben Satz liefern.
   Referenz: U 230 V · I 10 A · R 23 Ω · P 2300 W */
const REF = {u:230, i:10, r:23, p:2300};
for (const [a, b] of [['u','i'], ['u','r'], ['u','p'], ['i','r'], ['i','p'], ['p','r']]) {
  const res = E.elOhm({[a]: REF[a], [b]: REF[b]});
  const stimmt = res.fehler === null && ['u','i','r','p'].every(k => Math.abs(res[k] - REF[k]) < 1e-9);
  ok(stimmt, `elOhm aus ${a.toUpperCase()}+${b.toUpperCase()} liefert U 230 / I 10 / R 23 / P 2300`);
}
ok(E.elOhm({u:230}).fehler === 'zu_wenig', 'eine Angabe → zu_wenig');
ok(E.elOhm({}).fehler === 'zu_wenig', 'keine Angabe → zu_wenig');
ok(E.elOhm({u:230, i:10, r:23}).fehler === 'zu_viel', 'drei Angaben → zu_viel (Funktion rät nicht)');
ok(E.elOhm({u:230, r:0}).fehler === 'ungueltig', 'R = 0 → ungueltig statt Infinity');
ok(E.elOhm({p:2300, i:0}).fehler === 'ungueltig', 'I = 0 → ungueltig');
ok(E.elOhm({p:-100, r:23}).fehler === 'ungueltig', 'negative Leistung → ungueltig (keine Wurzel aus < 0)');
{
  const r = E.elOhm({u:230, i:0});
  ok(r.fehler === null && r.r === null && r.p === 0, 'I = 0 bei U+I: R bleibt null, P = 0 (kein NaN)');
}

/* ═══ B — Leistungsbedarf, Referenz von Hand ══════════════════════════ */
console.log('── B: Referenzanlage ──');

/* Zwei Verbraucher am 400-V-Netz:
     Wärmepumpe   1 × 12 kW · cos φ 0.85 · g 1.00 · 3-phasig
     Steckdosen   1 × 10 kW · cos φ 0.95 · g 0.30 · 1-phasig

   P_inst = 12 + 10                         = 22 kW
   P_bed  = 12·1.00 + 10·0.30               = 15 kW
   tan φ(0.85) = √(1−0.7225)/0.85 = 0.6197443
   tan φ(0.95) = √(1−0.9025)/0.95 = 0.3286841
   Q      = 12·0.6197443 + 3·0.3286841      = 8.4229839 kvar
   S      = √(15² + 8.4229839²)             = 17.203103 kVA
   cos φ  = 15 / 17.203103                  = 0.871939
   S_3ph  = 12/0.85 = 14.117647 kVA · S_1ph = 3/0.95 = 3.1578947 kVA
   U_LN   = 400/√3 = 230.94011 V
   I_sym  = 17203.103 / (√3·400)            = 24.83046 A
   I_worst= (14117.647/3 + 3157.8947)/230.94011 = 34.05125 A                */
const anlage = {
  system:'3p400', reserve:'0', verteilung:'ideal',
  zeilen:[
    {bez:'Wärmepumpe', kat:'waermepumpe', anzahl:'1', p:'12', cos:'0.85', g:'1',   phase:'3'},
    {bez:'Steckdosen', kat:'steckdosen',  anzahl:'1', p:'10', cos:'0.95', g:'0.3', phase:'1'}
  ]
};
{
  const r = lbCalc(anlage);
  nah(r.pInst, 22, 1e-12, 'P installiert = 22 kW');
  nah(r.pBed, 15, 1e-12, 'P Bedarf = 15 kW');
  const qSoll = 12 * Math.tan(Math.acos(0.85)) + 3 * Math.tan(Math.acos(0.95));
  const sSoll = Math.sqrt(15*15 + qSoll*qSoll);
  nah(r.qBed, qSoll, 1e-9, 'Q über Math.tan(Math.acos) — anderer Rechenweg als die Engine');
  nah(r.qBed, 8.4230, 1e-3, 'Q = 8.423 kvar (getrennt summiert)');
  nah(r.sBed, sSoll, 1e-9, 'S = √(P²+Q²) unabhängig nachgerechnet');
  nah(r.sBed, 17.2031, 1e-3, 'S = 17.203 kVA');
  nah(r.cosRes, 15 / sSoll, 1e-12, 'resultierender cos φ = P/S');
  nah(r.cosRes, 0.8719, 1e-3, 'cos φ = 0.872');
  nah(r.gzEff, 15/22, 1e-12, 'wirksame Gleichzeitigkeit = 15/22 = 0.682');
  nah(r.uLN, 400/Math.sqrt(3), 1e-9, 'U_LN = 400/√3 = 230.94 V');
  nah(r.iSym, 24.83046, 1e-4, 'I gleichmässig verteilt = 24.83 A');
  nah(r.iWorst, 34.05125, 1e-4, 'I in der höchstbelasteten Phase = 34.05 A');
  ok(r.iMass === r.iSym, 'Vorgabe «ideal» ⇒ der gleichmässige Wert ist massgebend');
  nah(r.iMitReserve, 24.83046, 1e-4, 'ohne Reserve unverändert');
  ok(r.inNenn === 25, 'nächster Nennstrom = 25 A');
  nah(r.sAnschluss, Math.sqrt(3) * 400 * 25 / 1000, 1e-9, 'Anschlussleistung = 17.32 kVA');
  ok(r.nKreise === 2, '2 Stromkreise gezählt');
  ok(r.gzNorm === 0.90, 'EN-61439-Gegenprobe für 2 Kreise = 0.90');
  ok(r.status === 'warn', 'Status warn (cos φ unter 0.90)');
  ok(r.meldungen.some(m => m.typ === 'warn' && /Kompensation/.test(m.text)),
     'niedriger cos φ wird als Vorbehalt gemeldet');
  ok(r.meldungen.some(m => m.typ === 'info' && /Reserve/.test(m.text)),
     'fehlende Reserve wird ausgewiesen, nicht unterstellt');
  ok(r.meldungen.some(m => m.typ === 'info' && /L1\/L2\/L3/.test(m.text)),
     'Schieflast durch einphasige Lasten wird benannt');
}

/* Gegenprobe zur Modellierung: die Scheinleistungen einfach zu addieren
   ergäbe 14.1176 + 3.1579 = 17.2755 kVA — MEHR als die korrekten 17.2031.
   Der Test hält fest, dass die Engine den Vektorweg geht. */
{
  const r = lbCalc(anlage);
  const naiv = 12/0.85 + 3/0.95;
  nah(naiv, 17.275542, 1e-6, 'Kontrollwert: naive Summe der Scheinleistungen = 17.276 kVA');
  ok(r.sBed < naiv - 0.05, 'Engine rechnet über P und Q, nicht über die Summe der S');
}

/* Reserve wirkt multiplikativ auf den massgebenden Strom. */
{
  const r = lbCalc({ ...anlage, reserve:'20' });
  nah(r.iMitReserve, 24.83046 * 1.2, 1e-4, '20 % Reserve: 29.80 A');
  ok(r.inNenn === 32, 'mit Reserve springt der Nennstrom auf 32 A');
}
/* Ungünstigste Phase als Vorgabe. */
{
  const r = lbCalc({ ...anlage, verteilung:'worst' });
  nah(r.iMass, 34.05125, 1e-4, 'Vorgabe «worst» ⇒ 34.05 A massgebend');
  ok(r.inNenn === 40, 'ungünstigste Phase ⇒ Nennstrom 40 A');
}
/* Rein dreiphasige Anlage: beide Ströme müssen zusammenfallen. */
{
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
    zeilen:[{kat:'motor', anzahl:'2', p:'15', cos:'0.85', g:'1', phase:'3'}] });
  nah(r.iSym, r.iWorst, 1e-9, 'ohne einphasige Lasten: gleichmässig = ungünstigst');
  nah(r.pBed, 30, 1e-12, '2 × 15 kW = 30 kW');
  nah(r.sBed, 30/0.85, 1e-9, 'S = 30/0.85 = 35.29 kVA');
}
/* Einphasiges Netz: U_LN ist die Systemspannung selbst. */
{
  const r = lbCalc({ system:'1p230', reserve:'0', verteilung:'ideal',
    zeilen:[{kat:'haushalt', anzahl:'1', p:'3.68', cos:'1', g:'1', phase:'1'}] });
  nah(r.uLN, 230, 1e-9, '230-V-Netz: U_LN = 230 V');
  nah(r.iWorst, 16, 1e-6, '3.68 kW bei 230 V und cos φ 1 = 16 A');
}

/* ═══ C — Kein stiller Deckel ════════════════════════════════════════ */
console.log('── C: Grenzfälle werden gemeldet ──');
{
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
    zeilen:[
      {kat:'motor', anzahl:'1', p:'10', cos:'0.85', g:'1', phase:'3'},
      {kat:'motor', anzahl:'1', p:'99', cos:'1.5',  g:'1', phase:'3'}
    ]});
  nah(r.pInst, 10, 1e-12, 'ungültige Zeile fliesst NICHT in P installiert ein');
  ok(r.zeilen[1].fehler === 'cos', 'ungültiger cos φ wird an der Zeile markiert');
  ok(r.status === 'err', 'Status err');
  ok(r.meldungen.some(m => m.typ === 'err' && /Zeile 2/.test(m.text) && /NICHT/.test(m.text)),
     'Meldung nennt die Zeile und sagt, dass sie nicht mitzählt');
}
{
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
    zeilen:[{kat:'motor', anzahl:'1', p:'10', cos:'0.9', g:'1.4', phase:'3'}] });
  ok(r.zeilen[0].fehler === 'g', 'Gleichzeitigkeitsfaktor über 1 wird abgewiesen');
  ok(r.pBed === 0, 'die Zeile zählt nicht mit');
  /* Nur ungültige Zeilen ⇒ P_inst ist 0. Der Status muss trotzdem «err»
     bleiben — «leer» würde die Fehlermeldung neutral übertönen. */
  ok(r.status === 'err', 'nur ungültige Zeilen ⇒ Status err, nicht «leer»');
}
/* Strom über der Sicherungsreihe (bis 400 A):
   300 kW bei cos φ 1 ⇒ S = 300 kVA ⇒ I = 300000/(√3·400) = 433.01 A       */
{
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
    zeilen:[{kat:'elektroheiz', anzahl:'1', p:'300', cos:'1', g:'1', phase:'3'}] });
  nah(r.iSym, 433.0127, 1e-3, 'I = 433.01 A');
  ok(r.inNenn === null, 'über der Reihe → kein Nennstrom');
  ok(r.sAnschluss === null, 'ohne Nennstrom auch keine Anschlussleistung');
  ok(r.meldungen.some(m => m.typ === 'warn' && /gesondert auszulegen/.test(m.text)),
     'wird gemeldet statt leer zu bleiben');
}
{
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal', zeilen:[] });
  ok(r.status === 'leer', 'keine Zeilen → Status leer');
  ok(r.iSym === null && r.inNenn === null, 'leer: keine erfundenen Werte');
}
{
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
    zeilen:[{kat:'beleuchtung', anzahl:'0', p:'0', cos:'', g:'', phase:'1'}] });
  ok(r.status === 'leer', 'Zeile ohne Leistung zählt nicht als Anlage');
}
/* Leere cos-φ-/g-Felder greifen auf den Kategorie-Richtwert zurück. */
{
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
    zeilen:[{kat:'steckdosen', anzahl:'1', p:'10', cos:'', g:'', phase:'1'}] });
  const kat = E.elVerbraucherKat('steckdosen');
  nah(r.zeilen[0].cos, kat.cosPhi, 1e-12, 'leeres cos-φ-Feld nimmt den Richtwert der Kategorie');
  nah(r.zeilen[0].g, kat.g, 1e-12, 'leeres g-Feld nimmt den Richtwert der Kategorie');
  nah(r.pBed, 10 * kat.g, 1e-12, 'Bedarfsleistung folgt dem Richtwert');
}
/* Die Katalogwerte sind als Richtwerte gekennzeichnet — das trägt das
   Modul sichtbar weiter, damit sie niemand für Normwerte hält. */
ok(E.EL_VERBRAUCHER_KAT.every(k => k.richtwert === true),
   'alle Verbraucher-Kategorien sind als Richtwert markiert');
ok(E.EL_VERBRAUCHER_KAT.every(k => k.cosPhi > 0 && k.cosPhi <= 1 && k.g > 0 && k.g <= 1),
   'alle Richtwerte liegen im gültigen Bereich');

/* Gleichzeitigkeit über dem Normwert wird als Hinweis ausgewiesen. */
{
  const zeilen = [];
  for (let i = 0; i < 12; i++) zeilen.push({kat:'motor', anzahl:'1', p:'5', cos:'0.9', g:'1', phase:'3'});
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal', zeilen });
  ok(r.nKreise === 12 && r.gzNorm === 0.60, '12 Kreise → Normwert 0.60');
  ok(r.gzEff === 1, 'erfasste Gleichzeitigkeit = 1.00');
  ok(r.meldungen.some(m => m.typ === 'info' && /EN 61439-1/.test(m.text)),
     'Abweichung zur Norm-Annahme wird benannt (konservativ, aber sichtbar)');
}

/* ═══ D — Umrechnung Wechselstrom ════════════════════════════════════ */
console.log('── D: Umrechnung Typenschild ──');
/* 3-phasig · 400 V · 16 A · cos φ 0.9
   S = √3·400·16 = 11085.125 VA · P = S·0.9 = 9976.613 W
   Q = S·sin φ = 11085.125·0.4358899 = 4831.870 var
   φ = arccos(0.9) = 25.8419°                                              */
{
  const r = lbAc({u:400, i:16, cos:0.9, phase:3});
  nah(r.s, 11085.1252, 1e-3, 'S = √3 · 400 · 16 = 11085.1 VA');
  nah(r.p, 9976.6127, 1e-3, 'P = S · cos φ = 9976.6 W');
  /* S² = 3·6400² = 122'880'000 exakt · P² = 0.81·S² ⇒ Q = S·√0.19 */
  nah(r.q, Math.sqrt(3) * 6400 * Math.sqrt(0.19), 1e-6, 'Q = S · √(1−cos²φ), unabhängig gerechnet');
  nah(r.q, 4831.894, 1e-3, 'Q = 4831.9 var');
  nah(r.phi, 25.8419, 1e-3, 'φ = 25.84°');
  nah(r.sinPhi, 0.4358899, 1e-6, 'sin φ = 0.4359');
  nah(Math.sqrt(r.p*r.p + r.q*r.q), r.s, 1e-6, 'Gegenprobe: P² + Q² = S²');
}
{
  const r = lbAc({u:230, i:16, cos:1, phase:1});
  nah(r.s, 3680, 1e-9, 'einphasig: S = 230 · 16 = 3680 VA');
  nah(r.p, 3680, 1e-9, 'cos φ = 1 ⇒ P = S');
  nah(r.q, 0, 1e-9, 'cos φ = 1 ⇒ Q = 0');
  nah(r.phi, 0, 1e-9, 'cos φ = 1 ⇒ φ = 0°');
}
ok(lbAc({u:400, i:16, cos:1.4, phase:3}).fehler === 'cos', 'cos φ über 1 → Fehler statt P > S');
ok(lbAc({u:400, i:0, cos:0.9, phase:3}).fehler === 'unvollstaendig', 'ohne Strom → unvollstaendig');
ok(lbAc({u:0, i:16, cos:0.9, phase:3}).fehler === 'unvollstaendig', 'ohne Spannung → unvollstaendig');
ok(lbAc({u:400, i:16, cos:0.9, phase:'3'}).s === lbAc({u:400, i:16, cos:0.9, phase:3}).s,
   'Phase als String oder Zahl liefert dasselbe');

/* ═══ E — Robustheit ═════════════════════════════════════════════════ */
console.log('── E: Robustheit ──');
ok(lbCalc({}).status === 'leer', 'leere Eingabe stürzt nicht ab');
ok(lbCalc({system:'3p400', zeilen:null}).status === 'leer', 'zeilen = null wird abgefangen');
{
  const r = lbCalc({ system:'3p400', reserve:'-30', verteilung:'ideal',
    zeilen:[{kat:'motor', anzahl:'1', p:'10', cos:'0.9', g:'1', phase:'3'}] });
  ok(r.reserve === 0, 'negative Reserve wird auf 0 geklemmt');
}
{
  /* Schweizer Schreibweise darf die Rechnung nie zerschiessen. */
  const r = lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
    zeilen:[{kat:'motor', anzahl:'1', p:'1’250,5', cos:'0,9', g:'1', phase:'3'}] });
  nah(r.pInst, 1250.5, 1e-9, 'Apostroph und Komma werden korrekt gelesen');
  nah(r.zeilen[0].cos, 0.9, 1e-12, 'Komma im cos φ wird korrekt gelesen');
}
ok(lbCalc({ system:'gibtsnicht', reserve:'0', verteilung:'ideal',
  zeilen:[{kat:'motor', anzahl:'1', p:'10', cos:'0.9', g:'1', phase:'3'}] }).uLL === 400,
  'unbekanntes Netzsystem fällt auf den Standard zurück statt zu crashen');
ok(lbCalc({ system:'3p400', reserve:'0', verteilung:'ideal',
  zeilen:[{kat:'gibtsnicht', anzahl:'1', p:'10', cos:'', g:'', phase:'3'}] }).zeilen[0].kat === 'sonstiges',
  'unbekannte Kategorie fällt auf «Sonstiges» zurück');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
