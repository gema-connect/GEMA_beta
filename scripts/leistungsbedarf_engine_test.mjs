/* ════════════════════════════════════════════════════════════════════════
   GEMA — Engine-Test el_leistungsbedarf (Node, ohne Browser)
   ════════════════════════════════════════════════════════════════════════
   Prüft den ENGINE-Block von el_leistungsbedarf.html gegen UNABHÄNGIG
   gerechnete Werte — die Erwartungen stehen als Zahl mit Herleitung im
   Test, nie als Aufruf derselben Funktion.

     node scripts/leistungsbedarf_engine_test.mjs

   Teil 1  Motor-Fachdaten in gema_elektro.js
   Teil 2  Nennstrom, Scheinleistung, Anlaufstrom (ein Motor)
   Teil 3  Drehmoment und Motorschutzschalter
   Teil 4  Anlaufarten — Stern-Dreieck koppelt an den Direktfaktor
   Teil 5  Summierung, Gleichzeitigkeit, Zuleitung
   Teil 6  Anlauf der Zuleitung + Spannungsfall (κ bei Betriebstemperatur)
   Teil 7  Grenzen werden GEMELDET, nicht stillschweigend gedeckelt
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const nah = (a, b, tol, m) => ok(a !== null && a !== undefined && Math.abs(a - b) <= tol,
  m + ' (erwartet ' + b + ', erhalten ' + a + ')');

const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;

const html = readFileSync(join(ROOT, 'el_leistungsbedarf.html'), 'utf8');
const mm = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
ok(!!mm, 'ENGINE-Block gefunden');
ok(!/getElementById|innerHTML|document\./.test(mm[1]), 'ENGINE-Block ist DOM-frei');
const { lbCalc } = new Function('GemaElektro', mm[1] + '\nreturn {lbCalc:lbCalc};')(E);

const B = {
  systemId:'3p400', u:'', gGlobal:1, bauart:'meh', isolation:'pvc',
  verlegeart:'C', material:'cu', tUmg:30, laenge:0, duAnlaufMax:10, rows:[]
};
const mit = o => Object.assign({}, B, o);
const motor = o => Object.assign({ art:'motor', bez:'', anz:'1', pkw:'7.5',
  cosphi:'', eta:'', g:'', anlaufart:'direkt', fStrom:'', pole:'4', nNenn:'', maMn:'' }, o || {});
const allg  = o => Object.assign({ art:'allg', bez:'', anz:'1', pkw:'10',
  cosphi:'0.9', g:'' }, o || {});
const hatTyp = (r, t) => r.meldungen.some(m => m.typ === t);
const enthaelt = (r, s) => r.meldungen.some(m => m.text.indexOf(s) >= 0);

/* Von Hand gerechnete Konstanten (einmal, damit die Erwartungen lesbar bleiben):
   √3 · 400 V                    = 692.8203  (Nenner dreiphasig ohne cosφ·η)
   η IE3 7.5 kW                  = 0.904
   I_N(7.5 kW) = 7500 / (692.8203 · 0.85 · 0.904) = 14.0885 A
   κ Cu bei 70 °C = 56 / 1.1965  = 46.803176 m/(Ω·mm²)                        */
const W3U   = Math.sqrt(3) * 400;
const IN75  = 7500 / (W3U * 0.85 * 0.904);
const KAPPA = 56 / 1.1965;

/* ══ TEIL 1 — Motor-Fachdaten ═════════════════════════════════════════ */
console.log('── Teil 1: Motor-Fachdaten ──');
ok(E.elMotorEta(7.5) === 0.904 && E.elMotorEta(0.75) === 0.825,
   'IE3-Wirkungsgrade 7.5 kW = 0.904 / 0.75 kW = 0.825');
ok(E.elMotorEta(8) === null, 'Leistung ausserhalb der IE3-Reihe → null (Typenschild nötig)');
ok(E.EL_MOTOR_PN.every(p => E.elMotorEta(p) !== null),
   'zu jeder Normleistung gibt es einen IE3-Wirkungsgrad');
let vorher = 0, steigend = true;
E.EL_MOTOR_PN.forEach(p => { const e = E.elMotorEta(p); if (e < vorher) steigend = false; vorher = e; });
ok(steigend, 'der Wirkungsgrad steigt mit der Motorleistung (Plausibilität)');

ok(E.elMss(14.09) === 16, 'Motorschutzschalter: 14.09 A → Nenngrösse 16 A');
ok(E.elMss(16) === 16, 'exakter Treffer bleibt 16 A');
ok(E.elMss(126) === null, 'über der Reihe → null (KEIN stiller Deckel)');
ok(E.elMss(0) === null && E.elMss(-2) === null, 'nicht-positiver Strom → null');

ok(E.elPole(4).nSync === 1500 && E.elPole(2).nSync === 3000,
   'Synchrondrehzahl 4-polig 1500 / 2-polig 3000 1/min');
ok(E.elPole(4).nTyp < E.elPole(4).nSync, 'die Nenndrehzahl liegt unter der Synchrondrehzahl (Schlupf)');

/* Stern-Dreieck ist über `teiler` an den Direktanlauf gekoppelt. */
const aD = E.elAnlaufart('direkt'), aS = E.elAnlaufart('stern');
ok(aD.teiler === 1 && aS.teiler === 3, 'Stern-Dreieck teilt den Direktanlauf durch 3');
nah(aS.fMoment, 1 / 3, 1e-12, 'Sternstufe: Moment auf 1/3');
ok(E.elAnlaufart('sanft').einstellbar && E.elAnlaufart('umr').einstellbar,
   'Sanftanlauf und Umrichter sind als einstellbar markiert');
ok(!aD.einstellbar && !aS.einstellbar, 'Direkt und Stern-Dreieck sind nicht einstellbar');

/* Grundformeln — gegen von Hand gerechnete Werte. */
nah(E.elNennstrom(7.5, 400, 0.85, 0.904, 3), IN75, 1e-9, 'I_N dreiphasig 7.5 kW = 14.0885 A');
/* einphasig 230 V, 2.2 kW, cos 0.85, η 0.867 → 2200 / (230·0.85·0.867) = 12.9794 A */
nah(E.elNennstrom(2.2, 230, 0.85, 0.867, 1), 2200 / (230 * 0.85 * 0.867), 1e-9,
   'I_N einphasig 2.2 kW = 12.9794 A (ohne √3)');
ok(E.elNennstrom(0, 400, 0.85, 0.9, 3) === null, 'ohne Leistung kein Strom');
nah(E.elScheinleistung(IN75, 400, 3), W3U * IN75 / 1000, 1e-9, 'S = √3 · U · I / 1000');
/* M_N = 9550 · 7.5 / 1450 = 49.3966 Nm */
nah(E.elNennmoment(7.5, 1450), 49.396551724, 1e-6, 'M_N = 9550 · P / n = 49.40 Nm');
ok(E.elNennmoment(7.5, 0) === null, 'ohne Drehzahl kein Moment');

/* ══ TEIL 2 — ein Motor ═══════════════════════════════════════════════ */
console.log('\n── Teil 2: Nennstrom, Scheinleistung, Anlaufstrom ──');
let r = lbCalc(mit({ rows:[motor({ bez:'Pumpe 1' })] }));
let z = r.zeilen[0];
ok(z.etaQ === 'ie3', 'η kommt aus der IE3-Reihe, wenn nichts eingegeben ist');
nah(z.eta, 0.904, 1e-12, 'η 7.5 kW = 0.904');
nah(z.iN, IN75, 1e-9, 'I_N = 14.0885 A');
nah(z.s, W3U * IN75 / 1000, 1e-9, 'S = 9.7607 kVA');
nah(z.iA, IN75 * 6, 1e-9, 'I_A = 6 · I_N = 84.53 A (Vorgabe Direktanlauf)');
ok(z.fDirektQ === 'vorgabe', 'der Anlauffaktor ist als Vorgabe markiert');

/* Eigener η vom Typenschild gewinnt über den Katalogwert — im Quell-Script
   wurde eine eigene Eingabe bei Katalogleistungen stillschweigend ignoriert. */
r = lbCalc(mit({ rows:[motor({ eta:'0.88' })] }));
ok(r.zeilen[0].etaQ === 'eigen', 'eigener Wirkungsgrad wird als «eigen» geführt');
nah(r.zeilen[0].eta, 0.88, 1e-12, 'eigener η 0.88 wird verwendet, nicht 0.904');
nah(r.zeilen[0].iN, 7500 / (W3U * 0.85 * 0.88), 1e-9, 'I_N folgt dem eigenen η');

/* cos φ frei wählbar */
r = lbCalc(mit({ rows:[motor({ cosphi:'0.8' })] }));
nah(r.zeilen[0].iN, 7500 / (W3U * 0.8 * 0.904), 1e-9, 'I_N folgt dem eigenen cos φ');

/* Einphasiges Netz rechnet ohne √3 */
r = lbCalc(mit({ systemId:'1p230', rows:[motor({ pkw:'2.2' })] }));
ok(r.phasen === 1 && r.u === 230, 'einphasig erkannt, 230 V aus dem Netzsystem');
nah(r.zeilen[0].iN, 2200 / (230 * 0.85 * 0.867), 1e-9, 'I_N einphasig = 12.98 A');

/* Freie Netzspannung übersteuert das Netzsystem */
r = lbCalc(mit({ u:'500', rows:[motor({})] }));
ok(r.u === 500 && r.uAuto === false, 'eigene Netzspannung wird übernommen');
nah(r.zeilen[0].iN, 7500 / (Math.sqrt(3) * 500 * 0.85 * 0.904), 1e-9, 'I_N bei 500 V');

/* Ohmscher Verbraucher: η = 1, kein Anlaufstrom */
r = lbCalc(mit({ rows:[allg()] }));
ok(r.zeilen[0].eta === 1 && r.zeilen[0].etaQ === 'ohmsch', 'Verbraucher rechnet mit η = 1');
nah(r.zeilen[0].iN, 10000 / (W3U * 0.9), 1e-9, 'I_N = 16.04 A');
ok(r.zeilen[0].iA === undefined, 'ein Verbraucher hat keinen Anlaufstrom');

/* ══ TEIL 3 — Moment und Motorschutzschalter ══════════════════════════ */
console.log('\n── Teil 3: Drehmoment und Motorschutz ──');
r = lbCalc(mit({ rows:[motor({ pole:'4' })] }));
z = r.zeilen[0];
nah(z.n, 1450, 1e-9, 'Nenndrehzahl aus der Polzahl: 1450 1/min');
nah(z.mN, 9550 * 7.5 / 1450, 1e-9, 'M_N = 49.40 Nm');
nah(z.maMn, 2.0, 1e-12, 'M_A/M_N Vorgabe 2.0');
nah(z.mA, (9550 * 7.5 / 1450) * 2.0, 1e-9, 'M_A = 98.79 Nm (Direktanlauf)');
ok(z.mss === 16, 'Motorschutzschalter-Nenngrösse 16 A');

/* Eigene Drehzahl und eigenes M_A/M_N vom Typenschild */
r = lbCalc(mit({ rows:[motor({ nNenn:'1470', maMn:'2.4' })] }));
z = r.zeilen[0];
ok(z.nQ === 'eigen' && z.maMnQ === 'eigen', 'Typenschild-Werte werden als «eigen» geführt');
nah(z.mN, 9550 * 7.5 / 1470, 1e-9, 'M_N mit 1470 1/min = 48.72 Nm');
nah(z.mA, (9550 * 7.5 / 1470) * 2.4, 1e-9, 'M_A = 116.94 Nm');

/* 2-polig dreht schneller → kleineres Moment bei gleicher Leistung */
r = lbCalc(mit({ rows:[motor({ pole:'2' })] }));
nah(r.zeilen[0].mN, 9550 * 7.5 / 2900, 1e-9, '2-polig: M_N = 24.70 Nm bei 2900 1/min');

/* ══ TEIL 4 — Anlaufarten ═════════════════════════════════════════════ */
console.log('\n── Teil 4: Anlaufarten ──');
/* Stern-Dreieck: Strom UND Moment auf 1/3 des Direktanlaufs. */
r = lbCalc(mit({ rows:[motor({ anlaufart:'stern' })] }));
z = r.zeilen[0];
nah(z.fStrom, 2, 1e-12, 'Stern-Dreieck: I_A/I_N = 6/3 = 2');
nah(z.iA, IN75 * 2, 1e-9, 'I_A = 28.18 A');
nah(z.mA, (9550 * 7.5 / 1450) * 2.0 / 3, 1e-9, 'M_A = 1/3 des Direktanlaufs = 32.93 Nm');

/* Der Datenblattwert gilt für den Direktanlauf — die Sternstufe MUSS
   mitwandern. Das ist der Grund, warum der Sternfaktor gerechnet und nicht
   fest hinterlegt ist. */
r = lbCalc(mit({ rows:[motor({ anlaufart:'stern', fStrom:'7' })] }));
nah(r.zeilen[0].fStrom, 7 / 3, 1e-12, 'Typenschild I_A/I_N = 7 → Sternstufe 2.333');
nah(r.zeilen[0].iA, IN75 * 7 / 3, 1e-9, 'I_A folgt dem Datenblattwert');
r = lbCalc(mit({ rows:[motor({ anlaufart:'direkt', fStrom:'7' })] }));
nah(r.zeilen[0].fStrom, 7, 1e-12, 'Direktanlauf nimmt den Datenblattwert unverändert');

/* Sanftanlauf und Umrichter sind eingestellte Geräte — Wert direkt. */
r = lbCalc(mit({ rows:[motor({ anlaufart:'sanft' })] }));
nah(r.zeilen[0].fStrom, 3, 1e-12, 'Sanftanlauf: Richtwert 3 · I_N');
ok(hatTyp(r, 'info') && enthaelt(r, 'am Gerät eingestellt'),
   'bei einstellbaren Geräten steht der Vorbehalt als Meldung da');
r = lbCalc(mit({ rows:[motor({ anlaufart:'umr', fStrom:'1.5' })] }));
nah(r.zeilen[0].fStrom, 1.5, 1e-12, 'Umrichter: eigener Wert wird direkt verwendet');
nah(r.zeilen[0].iA, IN75 * 1.5, 1e-9, 'I_A = 21.13 A');

/* ══ TEIL 5 — Summierung und Zuleitung ════════════════════════════════ */
console.log('\n── Teil 5: Anschlussleistung ──');
/* 2 × 10 kW ohmsch, g = 0.7, global 0.8:
   I_N     = 10000 / (692.8203 · 0.9)      = 16.0375 A
   I_Bed   = 16.0375 · 2 · 0.7             = 22.4525 A
   I_B     = 22.4525 · 0.8                 = 17.9620 A
   P_inst  = 20 kW   ·   P_bed = 20 · 0.7 · 0.8 = 11.2 kW                    */
const IN10 = 10000 / (W3U * 0.9);
r = lbCalc(mit({ gGlobal:0.8, rows:[allg({ anz:'2', g:'0.7' })] }));
nah(r.zeilen[0].iN, IN10, 1e-9, 'I_N je Verbraucher = 16.04 A');
nah(r.zeilen[0].iBed, IN10 * 2 * 0.7, 1e-9, 'I_Bed = I_N · n · g');
nah(r.summe.pInst, 20, 1e-9, 'installierte Leistung 20 kW');
nah(r.summe.pBed, 20 * 0.7 * 0.8, 1e-9, 'Leistungsbedarf 11.2 kW');
nah(r.summe.ib, IN10 * 2 * 0.7 * 0.8, 1e-9, 'I_B = 17.96 A');
nah(r.summe.sBed, W3U * (IN10 * 2 * 0.7 * 0.8) / 1000, 1e-9, 'S aus I_B');
ok(r.summe.inNenn === 20, 'Schutzorgan-Vorschlag: 20 A (nächstgrösser ≥ 17.96 A)');

/* Zuleitung: I_n 20 A, mehradrig / PVC / C bei 30 °C.
   Iz-Tabelle: 2.5 mm² = 24 A ≥ 20 → 2.5 mm². 1.5 mm² (17.5 A) reicht nicht. */
ok(r.zuleitung.A === 2.5, 'Querschnitt der Zuleitung: 2.5 mm²');
nah(r.zuleitung.iz, 24, 1e-9, 'Iz = 24 A bei 30 °C');

/* Bei 40 °C sinkt Iz um den Faktor 0.87 → 2.5 mm² trägt nur noch 20.88 A;
   das reicht knapp, 4 mm² erst bei mehr Strom. */
r = lbCalc(mit({ tUmg:40, gGlobal:0.8, rows:[allg({ anz:'2', g:'0.7' })] }));
nah(r.kTemp.f, 0.87, 1e-9, 'kϑ bei 40 °C = 0.87');
nah(r.zuleitung.iz, 24 * 0.87, 1e-9, 'Iz = 24 · 0.87 = 20.88 A');
ok(r.zuleitung.A === 2.5, 'Querschnitt bleibt 2.5 mm² (20.88 A ≥ 20 A)');

/* Gemischte Anlage: Motor + Verbraucher summieren sich */
r = lbCalc(mit({ rows:[motor({}), allg({})] }));
nah(r.summe.ib, IN75 + IN10, 1e-9, 'I_B = Summe der Bedarfsströme');
nah(r.summe.pInst, 17.5, 1e-9, 'installierte Leistung 7.5 + 10 = 17.5 kW');

/* ══ TEIL 6 — Anlauf der Zuleitung ════════════════════════════════════ */
console.log('\n── Teil 6: Anlauf + Spannungsfall ──');
/* Zwei Motoren: 7.5 kW (I_A 84.53 A) und 3 kW.
   η IE3 3 kW = 0.877 → I_N,3 = 3000 / (692.8203 · 0.85 · 0.877) = 5.8085 A
   I_B      = 14.0885 + 5.8085 = 19.8970 A
   I_Anlauf = I_B − I_N,gross + I_A,gross = 19.8970 − 14.0885 + 84.5308 = 90.3393 A */
const IN3 = 3000 / (W3U * 0.85 * 0.877);
r = lbCalc(mit({ rows:[motor({ bez:'Gross' }), motor({ bez:'Klein', pkw:'3' })] }));
nah(r.summe.ib, IN75 + IN3, 1e-9, 'I_B = 19.90 A');
ok(r.anlauf.motor.bez === 'Gross', 'massgebend ist der Motor mit dem grössten Anlaufstrom');
nah(r.anlauf.iAnlauf, (IN75 + IN3) - IN75 + IN75 * 6, 1e-9, 'I_Anlauf = 90.34 A');

/* Spannungsfall beim Anlauf, 30 m auf dem gewählten Querschnitt.
   Zuleitung: I_n zu 19.90 A → 20 A → 2.5 mm² (24 A).
   κ Cu bei 70 °C = 46.803176
   ΔU = √3 · 90.3393 · 30 / (46.803176 · 2.5) = 4693.29 / 117.008 = 40.11 V
   → 40.11 / 400 · 100 = 10.03 %  (knapp über dem Richtwert von 10 %)         */
r = lbCalc(mit({ laenge:30, duAnlaufMax:10,
  rows:[motor({ bez:'Gross' }), motor({ bez:'Klein', pkw:'3' })] }));
ok(r.zuleitung.A === 2.5, 'Zuleitung 2.5 mm²');
nah(r.kappa, 46.803176, 1e-5, 'κ Cu bei 70 °C = 46.803 (NICHT 56)');
const DU = Math.sqrt(3) * ((IN75 + IN3) - IN75 + IN75 * 6) * 30 / (KAPPA * 2.5);
nah(r.anlauf.du, DU, 1e-6, 'ΔU beim Anlauf = 40.11 V');
nah(r.anlauf.duProz, DU / 400 * 100, 1e-9, 'ΔU = 10.03 %');
ok(r.anlauf.ok === false && hatTyp(r, 'warn') && enthaelt(r, 'Spannungsfall beim Anlauf'),
   'über dem Richtwert wird gewarnt');
/* Es wird nicht mit κ₂₀ gerechnet — das wäre rund 16 % zu günstig. */
ok(Math.abs(r.anlauf.du - (Math.sqrt(3) * 90.3393 * 30 / (56 * 2.5))) > 3,
   'es wird nicht mit κ₂₀ gerechnet');

/* Sanfteres Anlaufverfahren löst das Problem — der Nutzen wird sichtbar.
   Mit Stern-Dreieck zieht der grosse Motor nur noch 14.0885 · 2 = 28.18 A;
   damit ist NICHT mehr er massgebend, sondern der kleine 3-kW-Motor am
   Direktanlauf mit 5.8087 · 6 = 34.85 A.
   I_Anlauf = 19.8973 − 5.8087 + 34.8525 = 48.9406 A
   ΔU = √3 · 48.9406 · 30 / (46.803176 · 2.5) = 21.73 V = 5.43 %          */
r = lbCalc(mit({ laenge:30, duAnlaufMax:10,
  rows:[motor({ bez:'Gross', anlaufart:'stern' }), motor({ bez:'Klein', pkw:'3' })] }));
ok(r.anlauf.motor.bez === 'Klein',
   'mit Stern-Dreieck wird der kleine Motor am Direktanlauf massgebend');
const IA3 = IN3 * 6;
nah(r.anlauf.iAnlauf, (IN75 + IN3) - IN3 + IA3, 1e-9, 'I_Anlauf = 48.94 A');
nah(r.anlauf.duProz, Math.sqrt(3) * ((IN75 + IN3) - IN3 + IA3) * 30 / (KAPPA * 2.5) / 400 * 100,
    1e-9, 'ΔU beim Anlauf sinkt von 10.03 % auf 5.43 %');
ok(r.anlauf.ok === true, 'damit ist der Richtwert eingehalten');

/* Ohne Motor gibt es keine Anlauf-Betrachtung — und keine erfundene Zahl. */
r = lbCalc(mit({ laenge:30, rows:[allg()] }));
ok(r.anlauf === null, 'ohne Motor keine Anlauf-Betrachtung');
/* Ohne Länge kein Spannungsfall */
r = lbCalc(mit({ rows:[motor({})] }));
ok(r.anlauf.du === null, 'ohne Länge kein Spannungsfall-Ergebnis');

/* ══ TEIL 7 — Grenzen werden gemeldet ═════════════════════════════════ */
console.log('\n── Teil 7: kein stiller Deckel ──');

/* Leistung ausserhalb der IE3-Reihe → geschätzter η, aber MIT Meldung. */
r = lbCalc(mit({ rows:[motor({ pkw:'8' })] }));
ok(r.zeilen[0].etaQ === 'schaetzung' && hatTyp(r, 'warn') && enthaelt(r, 'IE3-Reihe'),
   '8 kW: geschätzter Wirkungsgrad wird als solcher gemeldet');

/* Motor über der Motorschutzschalter-Reihe (125 A) */
r = lbCalc(mit({ rows:[motor({ pkw:'75' })] }));
ok(r.zeilen[0].iN > 125, 'Kontrolle: 75 kW zieht mehr als 125 A');
ok(r.zeilen[0].mss === null && hatTyp(r, 'err') && enthaelt(r, '125 A'),
   'kein Motorschutzschalter in der Reihe → gemeldet');

/* Bemessungsstrom über der Sicherungsreihe (400 A) */
r = lbCalc(mit({ rows:[allg({ pkw:'300', anz:'1' })] }));
ok(r.summe.ib > 400 && r.summe.inNenn === null && hatTyp(r, 'err') && enthaelt(r, '400 A'),
   'kein Schutzorgan in der Reihe → gemeldet');

/* Kein Querschnitt reicht — mehradrig auf C endet die Tabelle bei
   300 mm² / 464 A; 400 kW ziehen 400000/(692.8203·0.9) = 641.5 A. */
r = lbCalc(mit({ verlegeart:'C', rows:[allg({ pkw:'400' })] }));
ok(r.summe.ib > 464, 'Kontrolle: der Bedarf liegt über dem grössten Tabellenwert');
ok(r.zuleitung.A === null && r.zuleitung.reichtNicht === true && hatTyp(r, 'err'),
   'kein tabellierter Querschnitt reicht → gemeldet, kein stiller Deckel');

/* Temperatur über dem Tabellenbereich */
r = lbCalc(mit({ tUmg:70, rows:[motor({})] }));
ok(r.kTemp.f === null && r.zuleitung.A === null && hatTyp(r, 'err') && enthaelt(r, 'Tabellenbereich'),
   '70 °C: kein Faktor, kein Querschnitt, aber eine Meldung');

/* Aluminium — die Iz-Tabellen sind Kupfer */
r = lbCalc(mit({ material:'al', rows:[motor({})] }));
ok(r.zuleitung.A === null && hatTyp(r, 'err') && enthaelt(r, 'Kupferleiter'),
   'Aluminium: gemeldet statt still mit Kupferwerten gerechnet');
nah(r.kappa, 36 / (1 + 0.00403 * 50), 1e-9, 'κ rechnet trotzdem mit Aluminium');

/* Gleichzeitigkeit über 1 */
r = lbCalc(mit({ gGlobal:1.2, rows:[allg()] }));
ok(hatTyp(r, 'warn') && enthaelt(r, 'grösser als 1'), 'g > 1 wird gemeldet');

/* Leere Liste */
r = lbCalc(mit({ rows:[] }));
ok(r.status === 'leer' && r.summe === null, 'ohne Verbraucher kein Ergebnis');

/* Verlegeart im Erdreich rechnet mit der Bodentemperatur (Bezug 20 °C):
   bei 25 °C ist der Faktor 0.95, nicht 1.06 wie in Luft. */
r = lbCalc(mit({ verlegeart:'D', tUmg:25, rows:[allg()] }));
ok(r.verlege.erd === true, 'Verlegeart D ist als Erdverlegung erkannt');
nah(r.kTemp.f, 0.95, 1e-9, '25 °C Erdreich → 0.95');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
