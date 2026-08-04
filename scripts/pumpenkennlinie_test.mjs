// Drift-Guard Pumpenkennlinie (gema_pumpenkennlinie.js)
//
// Teil A (reines Node): Prüfbericht-Parser + Engine gegen eine Zeilen-Replik
//   des BIRAL-Prüfberichts WILLY1003CS (Werte 1:1 aus der Original-Excel) —
//   Kopfdaten, 12 Kennlinien-Punkte, ISO-9906-Toleranzen, Schema-Mapping mit
//   Einheiten-Umrechnung je Pumpen-Kategorie, Betriebspunkt-Umrechnung aus
//   den Anlagenwahl-Payloads, Interpolation, Guards.
// Teil B (Chromium): die ECHTE Fixture-Datei scripts/fixtures/
//   WILLY1003CS_pruefbericht.xlsx durch den ECHTEN XLSX-Reader
//   (GemaErpImport.leseXlsx) → parse → zuDaten → SVG-Diagramm mit
//   Betriebspunkt (inkl. GemaPDF-Farbregel).
//
// Aufruf:  node scripts/pumpenkennlinie_test.mjs
//          (Teil B braucht playwright-core + CHROME; fehlt beides, wird er
//           mit klarem Hinweis übersprungen — nie still.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
const require = createRequire(import.meta.url);
const P = require(path.join(ROOT, 'gema_pumpenkennlinie.js'));

let n = 0, fail = 0;
function t(name, cond, info) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
}
function eq(name, a, b) {
  t(name + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)),
    JSON.stringify(a) === JSON.stringify(b));
}
function near(a, b, tol) { return typeof a === 'number' && Math.abs(a - b) <= (tol == null ? 1e-9 : tol); }

// ── Zeilen-Replik des echten Prüfberichts (leseXlsx liefert STRING-Zellen,
//    dichte Arrays, Datums-Serials als ISO) ───────────────────────────────
const ROWS = [
  [],
  ['Prüfbericht'],
  [],
  ['Pumpentyp :', 'WILLY1003CS'],
  ['Rev.Nr. :', '1000', '', '', 'Seite', '1'],
  ['Prüfer :', '', '', '', 'Datum :', '2023-11-29'],
  [],
  ['Motorbezeichnung :', '0', '', '', 'Saugstutzen Ø :', '45', 'mm'],
  ['Leistungsaufnahme P1 :', '0.75', 'kW (P1)', '', 'Druckstutzen Ø :', '33', 'mm'],
  ['Nennstrom :', '3.5', 'A', '', 'cos φ :', '0.99'],
  ['Laufradtyp :', 'V', '', '', 'Drehzahl :', '2850', 'min¹'],
  ['Laufraddurchgang :', '100', 'mm', '', 'Flügelhöhe :', '16', 'mm'],
  ['ɳ - Motor :', '50', '%', '', 'Laufraddurchgang :', '20', 'mm'],
  ['Nennspannung :', '230', 'V', '', 'Frequenz :', '50', 'Hz'],
  ['Artikel Nr. :', '', '', '', 'Rohrleitung Ø :', '0', 'mm'],
  [],
  ['', 'H', 'Htotal', 'Q', 'Q', 'P1', 'P2', 'I', 'cos φ', 'ɳ Pumpe', 'ɳ gesamt', 'V eff1', 'V eff2'],
  ['', '[m]', '[m]', '[m³/h]', '[l/s]', '[kW]', '[kW]', '[A]', '', '[%]', '[%]', '[mm/s]', '[mm/s]'],
  [],
  ['1', '10.5', '10.5', '0', '0', '0.4', '0.2', '2.1', '0', '0', '0'],
  ['2', '10', '10', '1.4', '0.4', '0.42', '0.21', '2.3', '0', '18.2', '9.1'],
  ['3', '9', '9', '3.1', '0.9', '0.47', '0.24', '2.4', '0', '29.4', '16.2'],
  ['4', '8', '8', '4.3', '1.2', '0.52', '0.26', '2.6', '0', '34.8', '18.1'],
  ['5', '7', '7', '5.5', '1.5', '0.55', '0.28', '2.7', '0', '36.6', '19.3'],
  ['7', '6', '6', '6.6', '1.8', '0.6', '0.3', '2.9', '0', '36', '18'],
  ['8', '5', '5', '7.6', '2.1', '0.63', '0.32', '3', '0', '32.8', '16.4'],
  ['9', '4', '4', '8.5', '2.4', '0.67', '0.34', '3.1', '0', '27.6', '13.8'],
  ['10', '3', '3', '9.3', '2.6', '0.69', '0.35', '3.1', '0', '22', '11'],
  ['11', '2', '2', '10.1', '2.8', '0.71', '0.36', '3.4', '0', '15.6', '7.8'],
  ['12', '1', '1', '10.8', '3', '0.74', '0.37', '3.5', '0', '8', '4'],
  ['13', '0.5', '0.5', '11', '3.1', '0.74', '0.37', '3.5', '0', '4', '2'],
  [], [], [], [],
  ['Testnorm :', 'ISO 9906 Sect.4.4.2'],
  ['Q±', '10', '%', 'H±', '8', '%', 'ɳ -', '16.6', '%'],
  [],
  ['1.Betriebspunkt :', '0', 'm³/h', '0', 'm', '0', '%'],
  ['2.Betriebspunkt :', '0', 'm³/h', '0', 'm', '0', '%'],
  ['3.Betriebspunkt :', '0', 'm³/h', '0', 'm', '0', '%'],
  [],
  ['Einsatzgrenze :', 'Qmin :', ' m³/h'],
  ['', 'Qmax :', '11,0 m³/h'],
  [],
  ['Kunde :', 'BIRAL Standardkennlinie'],
  ['Betr.Auftr.Nr. :', '0', '', 'Pumpen Nr. :', '0']
];

console.log('\n═══ A1 — Parser: Kopfdaten des Prüfberichts ═══');
const p = P.parse({ typ: 'xlsx', sheets: [{ name: 'Import aus ABAS', rows: ROWS }] });
eq('Pumpentyp', p.kopf.typ, 'WILLY1003CS');
eq('Leistungsaufnahme P1 [kW]', p.kopf.p1KW, 0.75);
eq('Nennstrom [A]', p.kopf.nennstromA, 3.5);
eq('Drehzahl [min⁻¹]', p.kopf.drehzahl, 2850);
eq('cos φ (aus dem Kopf, NICHT aus der Tabellen-Kopfzeile)', p.kopf.cosphi, 0.99);
eq('Nennspannung [V] (nicht vom Nennstrom geschluckt)', p.kopf.spannungV, 230);
eq('Frequenz [Hz]', p.kopf.frequenzHz, 50);
eq('Saugstutzen [mm]', p.kopf.saugstutzenMm, 45);
eq('Druckstutzen [mm]', p.kopf.druckstutzenMm, 33);
eq('Laufradtyp', p.kopf.laufradtyp, 'V');
eq('Laufraddurchgang [mm] (ERSTES Vorkommen gewinnt)', p.kopf.laufraddurchgang, 100);
eq('η Motor [%] («ɳ - Motor» trotz Sonderzeichen)', p.kopf.etaMotorPct, 50);
eq('Flügelhöhe [mm]', p.kopf.fluegelhoeheMm, 16);
eq('Datum (ISO aus leseXlsx)', p.kopf.datum, '2023-11-29');
eq('Testnorm', p.kopf.testnorm, 'ISO 9906 Sect.4.4.2');
eq('Kunde', p.kopf.kunde, 'BIRAL Standardkennlinie');
eq('Qmax aus «11,0 m³/h» (CH-Komma)', p.kopf.qmaxM3h, 11);
t('Qmin ohne Wert bleibt leer (Einheiten-Zelle « m³/h» ist keine Zahl)', p.kopf.qminM3h == null, p.kopf.qminM3h);
t('Prüfer ohne Wert bleibt leer (keine Nachbarzelle verschluckt)', p.kopf.pruefer == null, p.kopf.pruefer);
eq('keine Warnungen bei vollständigem Bericht', p.warn, []);

console.log('\n═══ A2 — Kennlinien-Tabelle ═══');
eq('12 Kennlinien-Punkte', p.punkte.length, 12);
eq('1. Punkt (Nullförderung)', { q: p.punkte[0].q, h: p.punkte[0].h, p1: p.punkte[0].p1 }, { q: 0, h: 10.5, p1: 0.4 });
eq('letzter Punkt (Qmax)', { q: p.punkte[11].q, h: p.punkte[11].h, p1: p.punkte[11].p1 }, { q: 11, h: 0.5, p1: 0.74 });
eq('Q [l/s] aus eigener Spalte', p.punkte[4].qLs, 1.5);
eq('η Pumpe aus «ɳ Pumpe»-Spalte', p.punkte[4].etaP, 36.6);
eq('P2 gelesen', p.punkte[4].p2, 0.28);
t('Punkte nach Q sortiert', p.punkte.every((x, i) => i === 0 || x.q >= p.punkte[i - 1].q));
eq('ISO-9906-Toleranzen Q±10 / H±8 / η−16.6', p.tol, { q: 10, h: 8, eta: 16.6 });
eq('Betriebspunkte mit 0/0 werden NICHT übernommen', p.betriebspunkte, []);

console.log('\n═══ A3 — kennlinieVon + kenn ═══');
const kl = P.kennlinieVon(p);
eq('Kennlinie: Quelle + Typ', { quelle: kl.quelle, typ: kl.typ }, { quelle: 'pruefbericht', typ: 'WILLY1003CS' });
eq('Kennlinie: 12 kompakte Punkte {q,h,p1,eta}', kl.punkte.length, 12);
eq('Kennlinie: Punkt-Schema kompakt', Object.keys(kl.punkte[0]).sort(), ['eta', 'h', 'p1', 'q']);
eq('Kennlinie: Drehzahl + Qmax + Norm', { n: kl.drehzahl, q: kl.qmax, norm: kl.norm }, { n: 2850, q: 11, norm: 'ISO 9906 Sect.4.4.2' });
const w = P.kenn(p);
t('Hmax 10.5 m', near(w.hMax, 10.5), w.hMax);
t('Qmax 11 m³/h = 3.06 l/s', near(w.qMaxM3h, 11) && near(w.qMaxLs, 3.06), w);
t('P1max 0.74 kW', near(w.p1MaxKW, 0.74), w.p1MaxKW);
t('Bestpunkt (η 36.6 %) bei Q 5.5 / H 7', w.nenn && near(w.nenn.q, 5.5) && near(w.nenn.h, 7), w.nenn);

console.log('\n═══ A4 — Schema-Mapping mit Einheiten-Umrechnung ═══');
eq('5 Pumpen-Kategorien', P.PUMPEN_KATEGORIEN, ['hebeanlage', 'zirkulationspumpe', 'heizungspumpe', 'druckerhoehung', 'saugpumpe']);
const dHeb = P.zuDaten(p, 'hebeanlage');
t('Hebeanlage: H 10.5 m · Q 3.06 l/s', near(dHeb.foerderhoehe, 10.5) && near(dHeb.foerdermenge, 3.06), dHeb);
t('Hebeanlage: Motorleistung 0.75 kW / 750 W', near(dHeb.motorleistung, 0.75) && dHeb.leistung === 750, dHeb);
t('Hebeanlage: Freikugel = Laufraddurchgang 100 mm', dHeb.freikugel === 100, dHeb.freikugel);
eq('Hebeanlage: Spannung 230 V', dHeb.spannung, '230 V');
eq('Hebeanlage: Serie/Typ aus Pumpentyp (Pflichtfeld der Erfassung)', dHeb.serie, 'WILLY1003CS');
t('Hebeanlage: Kennlinie eingebettet', dHeb.kennlinie && dHeb.kennlinie.punkte.length === 12);
const dZirk = P.zuDaten(p, 'zirkulationspumpe');
t('Zirkulationspumpe: 10.5 m → 1030 mbar', dZirk.foerderhoeheMax === 1030, dZirk.foerderhoeheMax);
t('Zirkulationspumpe: 11 m³/h → 11000 l/h', dZirk.volumenstromMax === 11000, dZirk.volumenstromMax);
t('Zirkulationspumpe: P1 → 750 W', dZirk.leistungMax === 750, dZirk.leistungMax);
eq('Zirkulationspumpe: Spannung 230V/50Hz', dZirk.spannung, '230V/50Hz');
const dHz = P.zuDaten(p, 'heizungspumpe');
t('Heizungspumpe: 10.5 m → 103 kPa', near(dHz.foerderhoeheMax, 103, 0.01), dHz.foerderhoeheMax);
t('Heizungspumpe: 11 m³/h bleibt m³/h', near(dHz.volumenstromMax, 11), dHz.volumenstromMax);
const dDe = P.zuDaten(p, 'druckerhoehung');
t('Druckerhöhung: 10.5 m → 1.03 bar', near(dDe.druckMax, 1.03, 0.001), dDe.druckMax);
t('Druckerhöhung: 3.06 l/s', near(dDe.volumenstromMax, 3.06), dDe.volumenstromMax);
const dSg = P.zuDaten(p, 'saugpumpe');
t('Saugpumpe: Bestpunkt 5.5 m³/h / 7 m', near(dSg.foerdermenge, 5.5) && near(dSg.foerderhoehe, 7), dSg);

console.log('\n═══ A5 — Betriebspunkt aus Berechnungswerten + Interpolation ═══');
const b1 = P.betriebspunktAus('zirkulationspumpe', { volumenstrom: 5500, foerderhoehe: 490 });
t('Zirkulation: 5500 l/h → 5.5 m³/h · 490 mbar → ~5 m', near(b1.q, 5.5) && near(b1.h, 4.997, 0.01), b1);
const b2 = P.betriebspunktAus('heizungspumpe', { volumenstrom: 5.5, foerderhoehe: 49 });
t('Heizung: 5.5 m³/h · 49 kPa → ~5 m', near(b2.q, 5.5) && near(b2.h, 4.997, 0.01), b2);
const b3 = P.betriebspunktAus('hebeanlage', { foerdermenge: 1.5, foerderhoehe: 6 });
t('Hebeanlage: 1.5 l/s → 5.4 m³/h · 6 m', near(b3.q, 5.4) && near(b3.h, 6), b3);
const b4 = P.betriebspunktAus('druckerhoehung', { volumenstrom: 2 });
t('Druckerhöhung: 2 l/s → 7.2 m³/h, H unbekannt', near(b4.q, 7.2) && b4.h == null, b4);
t('ohne verwertbare Werte → null', P.betriebspunktAus('heizungspumpe', {}) === null);
t('Interpolation exakt auf Punkt (Q 5.5 → H 7)', near(P.interpoliere(kl, 5.5), 7));
t('Interpolation zwischen Punkten (Q 2.25 → H 9.5)', near(P.interpoliere(kl, 2.25), 9.5), P.interpoliere(kl, 2.25));
t('Interpolation ausserhalb → null', P.interpoliere(kl, 12) === null && P.interpoliere(kl, -1) === null);

console.log('\n═══ A6 — Guards ═══');
const leer = P.parse([]);
t('leere Eingabe → beide Warnungen (Pumpentyp + Tabelle)', leer.warn.length === 2
  && leer.warn.some(x => /Pumpentyp/.test(x)) && leer.warn.some(x => /Kennlinien-Tabelle/.test(x)), leer.warn);
const multi = P.parse({ sheets: [{ name: 'Deckblatt', rows: [['Nur Text']] }, { name: 'Import aus ABAS', rows: ROWS }] });
t('Mehrblatt-Datei: Blatt MIT Kennlinien-Tabelle gewinnt', multi.punkte.length === 12);
const mitBp = ROWS.map(r => r.slice());
mitBp[39] = ['1.Betriebspunkt :', '4', 'm³/h', '6.5', 'm', '35', '%'];
const pb = P.parse(mitBp);
eq('erfasster Betriebspunkt wird übernommen', pb.betriebspunkte, [{ q: 4, h: 6.5, eta: 35 }]);
t('kennlinieVon ohne Punkte → null', P.kennlinieVon({ kopf: {}, punkte: [] }) === null);
const src = fs.readFileSync(path.join(ROOT, 'gema_pumpenkennlinie.js'), 'utf8');
t('SVG nutzt nur literale Farben (GemaPDF-Regel)', !/var\(--/.test(src));
t('Export für window UND Node (module.exports)', /window\.GemaPumpenkennlinie=api/.test(src) && /module\.exports=api/.test(src));

// ═══ Teil B — ECHTE Fixture durch den ECHTEN XLSX-Reader (Chromium) ═══
console.log('\n═══ B — WILLY1003CS_pruefbericht.xlsx durch GemaErpImport.leseXlsx ═══');
const FIX = path.join(ROOT, 'scripts', 'fixtures', 'WILLY1003CS_pruefbericht.xlsx');
let pw = null;
try { pw = (await import('playwright-core')).chromium; } catch (e) { pw = null; }
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!pw || !CHROME || !fs.existsSync(FIX)) {
  console.log('  ⏭  ÜBERSPRUNGEN — playwright-core/CHROME/Fixture nicht verfügbar.');
  console.log('     Der Weg Original-Excel → leseXlsx → parse ist damit NICHT geprüft.');
  console.log('     Zum Nachholen: CHROME=<chromium> node scripts/pumpenkennlinie_test.mjs');
} else {
  const browser = await pw.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => { fail++; console.error('  ✗ pageerror: ' + e.message); });
  await page.goto('about:blank');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'gema_pumpenkennlinie.js'), 'utf8') });

  const res = await page.evaluate(async (bytes) => {
    const buf = new Uint8Array(bytes).buffer;
    const wb = await window.GemaErpImport.leseXlsx(buf);
    const GP = window.GemaPumpenkennlinie;
    const p = GP.parse(wb);
    const kl = GP.kennlinieVon(p);
    const daten = GP.zuDaten(p, 'hebeanlage');
    const host = document.createElement('div'); document.body.appendChild(host);
    const info = GP.zeichnen(host, kl, { betriebspunkt: { q: 5.5, h: 5 } });
    return {
      sheet: wb.sheets[0] && wb.sheets[0].name, kopf: p.kopf, warn: p.warn,
      nPts: p.punkte.length, first: p.punkte[0], last: p.punkte[p.punkte.length - 1],
      tol: p.tol, nBp: p.betriebspunkte.length,
      kl: { typ: kl.typ, qmax: kl.qmax, drehzahl: kl.drehzahl, n: kl.punkte.length },
      daten: daten,
      svg: {
        da: /<svg/.test(host.innerHTML), var_: /var\(--/.test(host.innerHTML),
        bp: /Betriebspunkt/.test(host.innerHTML), qmax: /Q max/.test(host.innerHTML),
        p1: /P1 \[kW\]/.test(host.innerHTML), eta: /η \[%\]/.test(host.innerHTML),
        fuss: /2[’']850/.test(host.innerHTML) && /ISO 9906/.test(host.innerHTML)
      },
      info: info
    };
  }, Array.from(fs.readFileSync(FIX)));

  eq('Blattname «Import aus ABAS»', res.sheet, 'Import aus ABAS');
  eq('Pumpentyp aus dem Original', res.kopf.typ, 'WILLY1003CS');
  t('Kopfdaten aus dem Original (P1/n/U/f/cosφ/Stutzen/η)',
    res.kopf.p1KW === 0.75 && res.kopf.drehzahl === 2850 && res.kopf.spannungV === 230
    && res.kopf.frequenzHz === 50 && res.kopf.cosphi === 0.99 && res.kopf.saugstutzenMm === 45
    && res.kopf.druckstutzenMm === 33 && res.kopf.etaMotorPct === 50, res.kopf);
  eq('Prüfdatum aus dem Datums-Serial', res.kopf.datum, '2023-11-29');
  eq('Qmax 11 m³/h aus «11,0 m³/h»', res.kopf.qmaxM3h, 11);
  eq('Testnorm', res.kopf.testnorm, 'ISO 9906 Sect.4.4.2');
  eq('keine Warnungen', res.warn, []);
  eq('12 Kennlinien-Punkte aus dem Original', res.nPts, 12);
  t('erster Punkt 0 m³/h / 10.5 m / 0.4 kW', res.first.q === 0 && res.first.h === 10.5 && res.first.p1 === 0.4, res.first);
  t('letzter Punkt 11 m³/h / 0.5 m', res.last.q === 11 && res.last.h === 0.5, res.last);
  eq('Toleranzen ISO 9906', res.tol, { q: 10, h: 8, eta: 16.6 });
  eq('leere Betriebspunkte nicht übernommen', res.nBp, 0);
  t('Kennlinie kompakt (Typ/Qmax/n/12 Punkte)', res.kl.typ === 'WILLY1003CS' && res.kl.qmax === 11
    && res.kl.drehzahl === 2850 && res.kl.n === 12, res.kl);
  t('zuDaten hebeanlage: 10.5 m · 3.06 l/s · 0.75 kW · Freikugel 100 · 230 V',
    res.daten.foerderhoehe === 10.5 && res.daten.foerdermenge === 3.06
    && res.daten.motorleistung === 0.75 && res.daten.leistung === 750
    && res.daten.freikugel === 100 && res.daten.spannung === '230 V', res.daten);
  t('SVG-Diagramm gezeichnet (H-Q + η + P1-Panel + Qmax-Grenze + Fussnote)',
    res.svg.da && res.svg.bp && res.svg.qmax && res.svg.p1 && res.svg.eta && res.svg.fuss, res.svg);
  t('SVG ohne var(--…) (GemaPDF-Regel)', !res.svg.var_);
  t('Betriebspunkt 5.5/5 liegt UNTER der Kennlinie (H(5.5)=7 → ok)',
    res.info && near(res.info.hBei, 7, 0.01) && res.info.ok === true, res.info);

  await browser.close();
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks bestanden'));
process.exit(fail ? 1 : 0);
