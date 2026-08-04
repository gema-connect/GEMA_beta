#!/usr/bin/env node
/**
 * Drift-Guard — Rechenkern «Brandlast im Fluchtweg» (br_brandlast.html)
 *
 * Prüft den /*ENGINE-START*​/-Block gegen UNABHÄNGIG von Hand gerechnete Werte
 * (die Erwartungen stehen als Literale im Test, nie als Aufruf der Engine selbst).
 *
 * Grundlage: VKF-Brandschutzrichtlinie BSR 14-15 — max. Brandlast je Laufmeter
 * horizontaler Fluchtweg (Vorgabe 200 MJ/m); CPR-Klassen nach SN EN 13501-6.
 *
 *   node scripts/brandlast_engine_test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'br_brandlast.html'), 'utf8');

let pass = 0, fail = 0;
const fehler = [];
function ok(name, bed, info) {
  if (bed) { pass++; return true; }
  fail++; fehler.push(name + (info ? '  → ' + info : ''));
  return false;
}
function nah(name, ist, soll, tol = 1e-9) {
  const gut = Number.isFinite(ist) && Math.abs(ist - soll) <= tol;
  return ok(name, gut, `erwartet ${soll}, erhalten ${ist}`);
}

/* ── ENGINE-Block extrahieren und in eigenem Kontext auswerten ── */
const m = HTML.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('❌ Kein ENGINE-Block in br_brandlast.html gefunden.'); process.exit(1); }
const CODE = m[1];

/* Der Rechenkern muss DOM-frei sein (Kommentare vorher entfernen, damit die
   Prüfung nicht über die eigenen Erklärtexte stolpert). */
const CODE_OHNE_KOMMENTAR = CODE
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
for (const verboten of ['document', 'window', 'getElementById', 'innerHTML', 'querySelector', 'localStorage']) {
  ok(`ENGINE ist DOM-frei (kein «${verboten}»)`, !CODE_OHNE_KOMMENTAR.includes(verboten));
}

const ctx = vm.createContext({});
vm.runInContext(CODE, ctx);
const { braCalc, braNum, braCprFluchtweg, braZeileMjProM, braCpr, braWerkstoff,
        BRA_CPR, BRA_WERKSTOFFE, BRA_LIMIT_DEFAULT } = ctx;

ok('braCalc exportiert', typeof braCalc === 'function');
ok('braNum exportiert', typeof braNum === 'function');
ok('braCprFluchtweg exportiert', typeof braCprFluchtweg === 'function');
ok('braZeileMjProM exportiert', typeof braZeileMjProM === 'function');

/* ══════════════════════════════════════════════════════════
   A · Zahlen-Helfer
   ══════════════════════════════════════════════════════════ */
nah('braNum: «12.5» → 12.5', braNum('12.5'), 12.5);
nah('braNum: Komma «12,5» → 12.5', braNum('12,5'), 12.5);
nah('braNum: Apostroph «1’500» → 1500', braNum('1’500'), 1500);
nah('braNum: Zahl 7 → 7', braNum(7), 7);
ok('braNum: leer → NaN', Number.isNaN(braNum('')));
ok('braNum: «abc» → NaN', Number.isNaN(braNum('abc')));
ok('braNum: null → NaN', Number.isNaN(braNum(null)));
nah('braNum: negativ bleibt negativ', braNum('-3'), -3);

/* ══════════════════════════════════════════════════════════
   B · CPR-Klassen (SN EN 13501-6) — Eca/Fca = cr
   ══════════════════════════════════════════════════════════ */
for (const cls of ['Aca', 'B1ca', 'B2ca', 'Cca', 'Dca']) {
  ok(`CPR ${cls} im Fluchtweg zulässig`, braCprFluchtweg(cls) === 'ja', braCprFluchtweg(cls));
}
ok('CPR Eca = cr → nicht zulässig', braCprFluchtweg('Eca') === 'nein');
ok('CPR Fca = cr → nicht zulässig', braCprFluchtweg('Fca') === 'nein');
ok('CPR leer → «offen» (nie stillschweigend zulässig)', braCprFluchtweg('') === 'offen');
ok('CPR unbekannt → «offen»', braCprFluchtweg('Xca') === 'offen');
ok('CPR-Liste enthält genau die 7 Klassen + Leereintrag', BRA_CPR.length === 8, String(BRA_CPR.length));
ok('braCpr(Cca) liefert Eintrag', braCpr('Cca') && braCpr('Cca').label === 'Cca');
nah('Grenzwert-Vorgabe BSR 14-15 = 200 MJ/m', BRA_LIMIT_DEFAULT, 200);

/* ══════════════════════════════════════════════════════════
   C · MJ/m je Zeile — Datenblatt vs. Herleitung aus der Masse
   ══════════════════════════════════════════════════════════ */
{
  const r = braZeileMjProM({ mjProM: '3.2' });
  nah('Datenblatt: 3.2 MJ/m', r.mjProM, 3.2);
  ok('Datenblatt: Quelle «direkt»', r.quelle === 'direkt');
  ok('Datenblatt: kein Fehler', r.fehler === null);
}
{
  /* von Hand: 0.35 kg/m × 18 MJ/kg (PVC) = 6.30 MJ/m */
  const r = braZeileMjProM({ masse: '0.35', werkstoff: 'pvc' });
  nah('Herleitung PVC: 0.35 × 18 = 6.30 MJ/m', r.mjProM, 6.3, 1e-9);
  ok('Herleitung: Quelle «masse»', r.quelle === 'masse');
}
{
  /* von Hand: 0.35 × 46 = 16.10 MJ/m (PE/VPE) */
  const r = braZeileMjProM({ masse: '0.35', werkstoff: 'pe' });
  nah('Herleitung PE/VPE: 0.35 × 46 = 16.10 MJ/m', r.mjProM, 16.1, 1e-9);
}
{
  /* eigener Hu übersteuert den Werkstoff-Richtwert: 0.35 × 25 = 8.75 */
  const r = braZeileMjProM({ masse: '0.35', werkstoff: 'pvc', hu: '25' });
  nah('Eigener Hu gewinnt über Richtwert: 0.35 × 25 = 8.75', r.mjProM, 8.75, 1e-9);
}
{
  /* Masse gewinnt über den direkt eingetragenen Wert — sonst zwei Wahrheiten je Zeile */
  const r = braZeileMjProM({ masse: '0.5', hu: '20', mjProM: '99' });
  nah('Masse übersteuert Direkteingabe: 0.5 × 20 = 10', r.mjProM, 10, 1e-9);
  ok('Masse-Modus meldet Quelle «masse»', r.quelle === 'masse');
}
{
  const r = braZeileMjProM({ masse: '0.5' });
  ok('Masse ohne Hu → Fehler «kein_hu»', r.fehler === 'kein_hu', r.fehler);
  ok('Masse ohne Hu → kein Zahlenwert', Number.isNaN(r.mjProM));
}
{
  const r = braZeileMjProM({});
  ok('Weder MJ/m noch Masse → Fehler «kein_wert»', r.fehler === 'kein_wert', r.fehler);
}
{
  const r = braZeileMjProM({ mjProM: '-2' });
  ok('Negative Brandlast → Fehler', r.fehler === 'negativ', r.fehler);
}
ok('Werkstoff-Richtwerte sind als solche markiert',
   BRA_WERKSTOFFE.filter(w => w.hu != null).every(w => w.richtwert === true));
nah('Hu PVC = 18 MJ/kg (Richtwert)', braWerkstoff('pvc').hu, 18);
nah('Hu PE/VPE = 46 MJ/kg (Richtwert)', braWerkstoff('pe').hu, 46);

/* ══════════════════════════════════════════════════════════
   D · Referenzfall (von Hand gerechnet)
       L = 20 m, Grenzwert 200 MJ/m
       A: 6 × 3.2 MJ/m über die ganze Länge (20 m) = 3.2·6·20 = 384 MJ
       B: 2 × 12.5 MJ/m über  8 m               = 12.5·2·8 = 200 MJ
       Σ = 584 MJ ; q = 584 / 20 = 29.2 MJ/m
       Reserve = 200 − 29.2 = 170.8 ; Auslastung = 14.6 %
   ══════════════════════════════════════════════════════════ */
const REF = braCalc({
  laenge: '20', limit: '200',
  zeilen: [
    { bez: 'Steigleitung UV 3.1', cpr: 'Cca', anzahl: '6', laenge: '',  mjProM: '3.2' },
    { bez: 'Sammelleitung EDV',   cpr: 'B2ca', anzahl: '2', laenge: '8', mjProM: '12.5' }
  ]
});
nah('Referenz: Fluchtweglänge L = 20 m', REF.L, 20);
nah('Referenz: Grenzwert 200 MJ/m', REF.limit, 200);
nah('Referenz: Zeile A = 384 MJ', REF.gezaehlt[0].mj, 384, 1e-9);
nah('Referenz: Zeile B = 200 MJ', REF.gezaehlt[1].mj, 200, 1e-9);
nah('Referenz: Σ = 584 MJ', REF.summeMj, 584, 1e-9);
nah('Referenz: q = 29.2 MJ/m', REF.proM, 29.2, 1e-9);
nah('Referenz: Reserve = 170.8 MJ/m', REF.reserveProM, 170.8, 1e-9);
nah('Referenz: Auslastung = 14.6 %', REF.auslastung, 14.6, 1e-9);
nah('Referenz: keine Überschreitung', REF.ueberProM, 0);
nah('Referenz: 8 Kabel gezählt', REF.anzahlKabel, 8);
nah('Referenz: 2 Typen', REF.anzahlTypen, 2);
ok('Referenz: Status ok', REF.status === 'ok', REF.status);
ok('Referenz: keine Meldungen', REF.meldungen.length === 0, JSON.stringify(REF.meldungen));

/* Leere Länge = ganze Fluchtweglänge (Worst Case) — Gegenprobe mit gesetzter Länge */
{
  const a = braCalc({ laenge: '20', limit: '200',
    zeilen: [{ bez: 'X', cpr: 'Cca', anzahl: '1', laenge: '', mjProM: '10' }] });
  const b = braCalc({ laenge: '20', limit: '200',
    zeilen: [{ bez: 'X', cpr: 'Cca', anzahl: '1', laenge: '20', mjProM: '10' }] });
  nah('Länge leer = ganze Fluchtweglänge: 10·1·20 = 200 MJ', a.summeMj, 200, 1e-9);
  nah('Gegenprobe mit explizit 20 m identisch', b.summeMj, 200, 1e-9);
}

/* Reihenfolge der Zeilen darf das Total nicht ändern */
{
  const z = [
    { bez: 'A', cpr: 'Cca', anzahl: '3', laenge: '5',  mjProM: '2.4' },  /* 2.4·3·5  = 36 */
    { bez: 'B', cpr: 'Cca', anzahl: '1', laenge: '12', mjProM: '7.5' },  /* 7.5·1·12 = 90 */
    { bez: 'C', cpr: 'Cca', anzahl: '2', laenge: '4',  mjProM: '1.25' }  /* 1.25·2·4 = 10 */
  ];
  const v = braCalc({ laenge: '15', limit: '200', zeilen: z });
  const r = braCalc({ laenge: '15', limit: '200', zeilen: z.slice().reverse() });
  nah('Drei Zeilen: Σ = 136 MJ', v.summeMj, 136, 1e-9);
  nah('Reihenfolge-unabhängig', r.summeMj, 136, 1e-9);
  /* 136 / 15 = 9.0666… */
  nah('q = 136/15 MJ/m', v.proM, 136 / 15, 1e-12);
}

/* ══════════════════════════════════════════════════════════
   E · Überschreitung des Grenzwerts
       L = 10 m, 30 Kabel à 8 MJ/m über die ganze Länge
       Σ = 8·30·10 = 2400 MJ ; q = 240 MJ/m ; über = 40 MJ/m ; 120 %
   ══════════════════════════════════════════════════════════ */
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Trasse Nord', cpr: 'Cca', anzahl: '30', laenge: '', mjProM: '8' }] });
  nah('Überschreitung: Σ = 2400 MJ', r.summeMj, 2400, 1e-9);
  nah('Überschreitung: q = 240 MJ/m', r.proM, 240, 1e-9);
  nah('Überschreitung: über Grenzwert = 40 MJ/m', r.ueberProM, 40, 1e-9);
  nah('Überschreitung: Reserve = −40 MJ/m', r.reserveProM, -40, 1e-9);
  nah('Überschreitung: Auslastung 120 %', r.auslastung, 120, 1e-9);
  ok('Überschreitung: Status err', r.status === 'err', r.status);
  ok('Überschreitung wird gemeldet',
     r.meldungen.some(x => x.typ === 'err' && /überschreitet den Grenzwert/i.test(x.text)),
     JSON.stringify(r.meldungen));
}

/* Genau auf dem Grenzwert ist noch zulässig: 200 MJ/m bei L = 10 → 2000 MJ */
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Genau', cpr: 'Cca', anzahl: '25', laenge: '', mjProM: '8' }] });
  nah('Grenzfall: q = 200.0 MJ/m', r.proM, 200, 1e-9);
  nah('Grenzfall: keine Überschreitung', r.ueberProM, 0);
  ok('Grenzfall: kein Fehler-Status', r.status !== 'err', r.status);
  ok('Grenzfall: Auslastung 100 % wird als Warnung gemeldet',
     r.meldungen.some(x => x.typ === 'warn' && /Auslastung/.test(x.text)));
}

/* Auslastungs-Warnschwelle 90 %: q = 180 MJ/m bei L = 10 → 1800 MJ */
{
  const knapp = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Knapp', cpr: 'Cca', anzahl: '18', laenge: '', mjProM: '10' }] });
  nah('90-%-Schwelle: q = 180 MJ/m', knapp.proM, 180, 1e-9);
  ok('90-%-Schwelle: Warnung', knapp.status === 'warn', knapp.status);

  const locker = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Locker', cpr: 'Cca', anzahl: '17', laenge: '', mjProM: '10' }] });
  nah('Unter der Schwelle: q = 170 MJ/m (85 %)', locker.proM, 170, 1e-9);
  ok('Unter der Schwelle: Status ok', locker.status === 'ok', locker.status);
}

/* ══════════════════════════════════════════════════════════
   F · cr-Kabel (Eca/Fca) — gesperrt, NICHT weggerechnet
   ══════════════════════════════════════════════════════════ */
{
  const r = braCalc({ laenge: '10', limit: '200', zeilen: [
    { bez: 'Zulässig', cpr: 'Cca', anzahl: '5', laenge: '', mjProM: '4' },  /* 4·5·10 = 200 MJ */
    { bez: 'Alt-Kabel', cpr: 'Eca', anzahl: '5', laenge: '', mjProM: '4' }  /* gesperrt        */
  ]});
  nah('cr: Σ nur aus der zulässigen Zeile = 200 MJ', r.summeMj, 200, 1e-9);
  nah('cr: q = 20 MJ/m', r.proM, 20, 1e-9);
  ok('cr: genau eine gesperrte Zeile', r.gesperrt.length === 1, String(r.gesperrt.length));
  ok('cr: genau eine gezählte Zeile', r.gezaehlt.length === 1, String(r.gezaehlt.length));
  nah('cr: gezählte Kabel = 5 (gesperrte zählen nicht mit)', r.anzahlKabel, 5);
  ok('cr: Zeile ist als gesperrt markiert', r.zeilen[1].gesperrt === true);
  ok('cr: Status err trotz eingehaltenem Grenzwert', r.status === 'err', r.status);
  ok('cr: Meldung nennt die Unzulässigkeit',
     r.meldungen.some(x => x.typ === 'err' && /nicht zulässig/i.test(x.text) && /Alt-Kabel/.test(x.text)),
     JSON.stringify(r.meldungen));
  /* Gegenprobe: dieselbe Zeile als Cca zählt mit → 400 MJ */
  const g = braCalc({ laenge: '10', limit: '200', zeilen: [
    { bez: 'Zulässig',  cpr: 'Cca', anzahl: '5', laenge: '', mjProM: '4' },
    { bez: 'Alt-Kabel', cpr: 'Cca', anzahl: '5', laenge: '', mjProM: '4' }
  ]});
  nah('Gegenprobe ohne cr: Σ = 400 MJ', g.summeMj, 400, 1e-9);
  ok('Gegenprobe ohne cr: Status ok', g.status === 'ok', g.status);
}
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Fca-Leitung', cpr: 'Fca', anzahl: '2', laenge: '', mjProM: '5' }] });
  ok('Fca ebenfalls gesperrt', r.gesperrt.length === 1);
  nah('Fca: Σ bleibt 0 MJ', r.summeMj, 0);
  ok('Fca: Status err', r.status === 'err', r.status);
}

/* ══════════════════════════════════════════════════════════
   G · Kein stiller Deckel — jeder Grenzfall wird GEMELDET
   ══════════════════════════════════════════════════════════ */
{
  const r = braCalc({ laenge: '', limit: '200',
    zeilen: [{ bez: 'X', cpr: 'Cca', anzahl: '1', laenge: '', mjProM: '5' }] });
  ok('Fehlende Fluchtweglänge → Fehler',
     r.meldungen.some(x => x.typ === 'err' && /Länge des Fluchtwegs/i.test(x.text)),
     JSON.stringify(r.meldungen));
  ok('Fehlende Fluchtweglänge → kein q', !Number.isFinite(r.proM));
  ok('Fehlende Fluchtweglänge → Status err', r.status === 'err', r.status);
}
{
  const r = braCalc({ laenge: '0', limit: '200', zeilen: [] });
  ok('Länge 0 wird abgelehnt (keine Division durch null)',
     r.meldungen.some(x => x.typ === 'err' && /Länge des Fluchtwegs/i.test(x.text)));
}
{
  const r = braCalc({ laenge: '10', limit: '0', zeilen: [] });
  ok('Grenzwert 0 wird gemeldet',
     r.meldungen.some(x => x.typ === 'err' && /Grenzwert/i.test(x.text)));
}
{
  /* Kabel-Länge 30 m in einem 10-m-Fluchtweg: MELDEN, nicht kappen. */
  const r = braCalc({ laenge: '10', limit: '5000',
    zeilen: [{ bez: 'Zu lang', cpr: 'Cca', anzahl: '1', laenge: '30', mjProM: '2' }] });
  nah('Zu lange Strecke wird ungekappt gerechnet: 2·1·30 = 60 MJ', r.summeMj, 60, 1e-9);
  ok('Zu lange Strecke wird gemeldet',
     r.meldungen.some(x => x.typ === 'warn' && /grösser als der Fluchtweg/i.test(x.text)),
     JSON.stringify(r.meldungen));
}
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Ohne Anzahl', cpr: 'Cca', anzahl: '0', laenge: '', mjProM: '5' }] });
  ok('Anzahl 0 → Fehler', r.meldungen.some(x => x.typ === 'err' && /Anzahl/i.test(x.text)));
  ok('Anzahl 0 → Zeile zählt nicht', r.gezaehlt.length === 0);
  ok('Anzahl 0 → Status err', r.status === 'err', r.status);
}
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Krumm', cpr: 'Cca', anzahl: '2.5', laenge: '', mjProM: '4' }] });
  ok('Nicht-ganzzahlige Anzahl wird gemeldet',
     r.meldungen.some(x => x.typ === 'warn' && /keine ganze Zahl/i.test(x.text)));
  nah('… wird aber gerechnet: 4·2.5·10 = 100 MJ', r.summeMj, 100, 1e-9);
}
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Ohne Wert', cpr: 'Cca', anzahl: '1', laenge: '', mjProM: '' }] });
  ok('Fehlende Brandlast → Fehler', r.meldungen.some(x => x.typ === 'err' && /Brandlast/i.test(x.text)));
  ok('Fehlende Brandlast → Status err', r.status === 'err', r.status);
}
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Ohne CPR', cpr: '', anzahl: '1', laenge: '', mjProM: '5' }] });
  ok('Fehlende CPR-Klasse → Warnung (Nachweis unvollständig)',
     r.meldungen.some(x => x.typ === 'warn' && /CPR/i.test(x.text)), JSON.stringify(r.meldungen));
  nah('Fehlende CPR-Klasse: Zeile wird trotzdem gerechnet', r.summeMj, 50, 1e-9);
  ok('Fehlende CPR-Klasse → Status warn', r.status === 'warn', r.status);
}
{
  const r = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Negativ', cpr: 'Cca', anzahl: '1', laenge: '-4', mjProM: '5' }] });
  ok('Negative Länge → Fehler', r.meldungen.some(x => x.typ === 'err' && /Länge im Fluchtweg/i.test(x.text)));
}

/* ══════════════════════════════════════════════════════════
   H · «leer» vs. «Fehler» — ein Fehler darf nie als Leerzustand erscheinen
   ══════════════════════════════════════════════════════════ */
{
  const leer = braCalc({ laenge: '10', limit: '200', zeilen: [] });
  ok('Ohne Zeilen: Status «leer»', leer.status === 'leer', leer.status);
  ok('Ohne Zeilen: keine Fehlermeldung', !leer.meldungen.some(x => x.typ === 'err'));
  nah('Ohne Zeilen: q = 0 MJ/m', leer.proM, 0);

  const default_zeile = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: '', cpr: '', anzahl: '1', laenge: '', masse: '', hu: '', mjProM: '' }] });
  ok('Unberührte Default-Zeile zählt nicht als Erfassung', default_zeile.status === 'leer', default_zeile.status);

  const kaputt = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'Nur Name', cpr: 'Cca', anzahl: '1', laenge: '', mjProM: '' }] });
  ok('Erfasste, aber fehlerhafte Zeile → err statt «leer»', kaputt.status === 'err', kaputt.status);
}

/* ══════════════════════════════════════════════════════════
   I · Vollbild-Fall aus der Praxis (von Hand gerechnet)
       L = 25 m, Grenzwert 200 MJ/m
       1) 12 × 2.8 MJ/m, ganze Länge   → 2.8·12·25 = 840 MJ
       2)  4 × 9.6 MJ/m, 15 m          → 9.6·4·15  = 576 MJ
       3)  1 × (0.6 kg/m × 46) = 27.6 MJ/m, 10 m → 27.6·1·10 = 276 MJ
       Σ = 1692 MJ ; q = 1692 / 25 = 67.68 MJ/m ; Auslastung 33.84 %
   ══════════════════════════════════════════════════════════ */
{
  const r = braCalc({ laenge: '25', limit: '200', zeilen: [
    { bez: 'Beleuchtung',  cpr: 'Cca',  anzahl: '12', laenge: '',   mjProM: '2.8' },
    { bez: 'Steigzone',    cpr: 'B2ca', anzahl: '4',  laenge: '15', mjProM: '9.6' },
    { bez: 'Hauptzuleitung', cpr: 'Cca', anzahl: '1', laenge: '10', masse: '0.6', werkstoff: 'pe' }
  ]});
  nah('Praxis: Zeile 1 = 840 MJ', r.gezaehlt[0].mj, 840, 1e-9);
  nah('Praxis: Zeile 2 = 576 MJ', r.gezaehlt[1].mj, 576, 1e-9);
  nah('Praxis: Zeile 3 hergeleitet 27.6 MJ/m', r.gezaehlt[2].mjProM, 27.6, 1e-9);
  nah('Praxis: Zeile 3 = 276 MJ', r.gezaehlt[2].mj, 276, 1e-9);
  nah('Praxis: Σ = 1692 MJ', r.summeMj, 1692, 1e-9);
  nah('Praxis: q = 67.68 MJ/m', r.proM, 67.68, 1e-9);
  nah('Praxis: Auslastung 33.84 %', r.auslastung, 33.84, 1e-9);
  nah('Praxis: 17 Kabel', r.anzahlKabel, 17);
  ok('Praxis: Status ok', r.status === 'ok', r.status);
  ok('Praxis: Zeile 3 trägt Quelle «masse»', r.gezaehlt[2].quelle === 'masse');
}

/* ══════════════════════════════════════════════════════════
   J · Grenzwert frei wählbar (kein hart verdrahtetes 200)
   ══════════════════════════════════════════════════════════ */
{
  const r = braCalc({ laenge: '10', limit: '100',
    zeilen: [{ bez: 'X', cpr: 'Cca', anzahl: '15', laenge: '', mjProM: '10' }] });
  nah('Eigener Grenzwert 100: q = 150 MJ/m', r.proM, 150, 1e-9);
  nah('Eigener Grenzwert 100: über = 50 MJ/m', r.ueberProM, 50, 1e-9);
  ok('Eigener Grenzwert 100: Status err', r.status === 'err', r.status);
  /* derselbe Fall gegen 200 MJ/m wäre zulässig */
  const g = braCalc({ laenge: '10', limit: '200',
    zeilen: [{ bez: 'X', cpr: 'Cca', anzahl: '15', laenge: '', mjProM: '10' }] });
  ok('Gegenprobe bei 200 MJ/m: kein Fehler', g.status !== 'err', g.status);
}

/* ── Ergebnis ── */
console.log('');
console.log('══════════════════════════════════════════════');
console.log(`  Brandlast — Rechenkern: ${pass} ok, ${fail} Fehler`);
console.log('══════════════════════════════════════════════');
if (fail) {
  console.log('');
  fehler.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('  ✓ alle Prüfungen bestanden');
