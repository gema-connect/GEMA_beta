// Node-Test der DOM-freien Arbeitskleider-Engine (if_arbeitskleider.html /*ENGINE-START*/-Block)
// Perioden-Logik (jährlich/halbjährlich/quartalsweise + Startmonat), Budget-Overrides,
// Saldo mit/ohne Kumulation, Storno-Ausschluss, CHF-Formatierung.
// Aufruf: node scripts/arbeitskleider_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../if_arbeitskleider.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const g = {};
new Function('window', m[1])(g);
const { akParams, akPeriodeVon, akPeriodeLabel, akNaechstePeriode, akBudgetFor, akSaldo, akFmtChf, akKat, AK_KATS } = g;

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function eq(name, a, b) { t(name + ' (' + JSON.stringify(a) + ' = ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b)); }
function near(name, a, b) { t(name + ' (' + a + ' ≈ ' + b + ')', Math.abs(a - b) < 1e-9); }

console.log('— akParams (Defaults + Merge) —');
const d = akParams(null);
eq('Default-Budget 300', d.budget, 300);
eq('Default-Periode jahr', d.periode, 'jahr');
t('Default mitarbeiterSicht true', d.mitarbeiterSicht === true);
t('Default kumulierbar false', d.kumulierbar === false);
const p2 = akParams({ budget: '500', periode: 'halbjahr', startMonat: '7', mitarbeiterSicht: false, kumulierbar: 1 });
eq('budget als String → Number 500', p2.budget, 500);
eq('periode halbjahr übernommen', p2.periode, 'halbjahr');
eq('startMonat String → 7', p2.startMonat, 7);
t('mitarbeiterSicht false übernommen', p2.mitarbeiterSicht === false);
t('kumulierbar truthy → true', p2.kumulierbar === true);
eq('ungültige Periode → jahr', akParams({ periode: 'monat' }).periode, 'jahr');
eq('startMonat 0 → 1', akParams({ startMonat: 0 }).startMonat, 1);
eq('startMonat 15 → 12', akParams({ startMonat: 15 }).startMonat, 12);

console.log('— Perioden (Zeitachse + Startmonat) —');
const cfgJ = akParams({ budget: 300, periode: 'jahr', startMonat: 1 });
const cfgH = akParams({ budget: 300, periode: 'halbjahr', startMonat: 1 });
const cfgQ = akParams({ budget: 300, periode: 'quartal', startMonat: 1 });
eq('jährlich: 15.07.2026 → Kalenderjahr', akPeriodeVon(cfgJ, '2026-07-15'), { von: '2026-01-01', bis: '2026-12-31', key: '2026-01' });
eq('jährlich: Randtag 01.01.', akPeriodeVon(cfgJ, '2026-01-01').von, '2026-01-01');
eq('jährlich: Randtag 31.12.', akPeriodeVon(cfgJ, '2026-12-31').bis, '2026-12-31');
eq('halbjährlich: Jul → H2', akPeriodeVon(cfgH, '2026-07-15'), { von: '2026-07-01', bis: '2026-12-31', key: '2026-07' });
eq('halbjährlich: 30.06. → H1', akPeriodeVon(cfgH, '2026-06-30'), { von: '2026-01-01', bis: '2026-06-30', key: '2026-01' });
eq('quartalsweise: Jul → Q3', akPeriodeVon(cfgQ, '2026-07-15'), { von: '2026-07-01', bis: '2026-09-30', key: '2026-07' });
eq('quartalsweise: 01.10. → Q4', akPeriodeVon(cfgQ, '2026-10-01'), { von: '2026-10-01', bis: '2026-12-31', key: '2026-10' });
const cfgGJ = akParams({ periode: 'jahr', startMonat: 4 });
eq('Geschäftsjahr April: Feb 2026 → GJ 2025', akPeriodeVon(cfgGJ, '2026-02-10'), { von: '2025-04-01', bis: '2026-03-31', key: '2025-04' });
eq('Geschäftsjahr April: 01.04. startet neu', akPeriodeVon(cfgGJ, '2026-04-01').von, '2026-04-01');
const cfgH7 = akParams({ periode: 'halbjahr', startMonat: 7 });
eq('halbjährlich ab Juli: März → Jan–Jun', akPeriodeVon(cfgH7, '2026-03-01'), { von: '2026-01-01', bis: '2026-06-30', key: '2026-01' });
const cfgQ2 = akParams({ periode: 'quartal', startMonat: 2 });
eq('quartalsweise ab Feb: Jan 2026 → Nov–Jan (Jahreswechsel)', akPeriodeVon(cfgQ2, '2026-01-15'), { von: '2025-11-01', bis: '2026-01-31', key: '2025-11' });

console.log('— Labels + Folgeperiode —');
eq('Label Kalenderjahr = Jahreszahl', akPeriodeLabel(cfgJ, akPeriodeVon(cfgJ, '2026-07-15')), '2026');
eq('Label Halbjahr = Monatsspanne', akPeriodeLabel(cfgH, akPeriodeVon(cfgH, '2026-07-15')), 'Jul 2026 – Dez 2026');
eq('Folgeperiode H1 → H2', akNaechstePeriode(cfgH, akPeriodeVon(cfgH, '2026-03-01')), { von: '2026-07-01', bis: '2026-12-31', key: '2026-07' });

console.log('— Budget-Overrides —');
const cfgOv = akParams({ budget: 300, budgets: { u1: { betrag: 100 }, u2: { betrag: 0 }, u3: { ab: '2025-01-01' } } });
eq('ohne Override → Standard 300', akBudgetFor(cfgOv, 'ux'), 300);
eq('Override 100', akBudgetFor(cfgOv, 'u1'), 100);
eq('Override 0 ist gültig (kein Budget)', akBudgetFor(cfgOv, 'u2'), 0);
eq('nur ab-Datum, kein Betrag → Standard', akBudgetFor(cfgOv, 'u3'), 300);

console.log('— Saldo ohne Kumulation —');
const bez = [
  { id: 'b1', userId: 'u1', datum: '2026-03-01', total: 50 },
  { id: 'b2', userId: 'u1', datum: '2026-07-15', total: 25.5 },
  { id: 'b3', userId: 'u1', datum: '2025-12-31', total: 99 },
  { id: 'b4', userId: 'u1', datum: '2026-05-01', total: 40, storniert: { am: 'x' } },
  { id: 'b5', userId: 'u2', datum: '2026-06-01', total: 70 },
  { id: 'b6', userId: 'u1', datum: '2026-01-01', total: 10 },
  { id: 'b7', userId: 'u1', datum: '2026-12-31', total: 5 }
];
const s1 = akSaldo(cfgJ, 'u1', bez, '2026-07-15');
near('u1 verbraucht 90.5 (Randtage zählen, Storno + Vorjahr + Fremde nicht)', s1.verbraucht, 90.5);
near('u1 verfügbar = Budget (kein Übertrag)', s1.verfuegbar, 300);
near('u1 Rest 209.5', s1.rest, 209.5);
t('u1 nicht negativ', s1.negativ === false);
eq('Übertrag 0 ohne Kumulation', s1.uebertrag, 0);
const s2 = akSaldo(cfgJ, 'u2', bez, '2026-07-15');
near('u2 verbraucht 70', s2.verbraucht, 70);
const s3 = akSaldo(cfgJ, 'u3', [{ userId: 'u3', datum: '2026-02-02', total: 500 }], '2026-07-15');
near('u3 Rest −200 bei Überschreitung', s3.rest, -200);
t('u3 negativ-Flag gesetzt', s3.negativ === true);

console.log('— Saldo mit Kumulation —');
const cfgK = akParams({ budget: 300, periode: 'jahr', startMonat: 1, kumulierbar: true, budgetAb: '2024-01-01' });
const bezK = [
  { userId: 'u1', datum: '2024-06-01', total: 200 },
  { userId: 'u1', datum: '2025-03-01', total: 350 },
  { userId: 'u1', datum: '2026-02-01', total: 75.5 }
];
const sk = akSaldo(cfgK, 'u1', bezK, '2026-07-15');
near('Übertrag = (300−200) + (300−350) = 50', sk.uebertrag, 50);
eq('2 abgeschlossene Perioden gezählt', sk.uebertragPerioden, 2);
near('verfügbar 350', sk.verfuegbar, 350);
near('Rest 274.5', sk.rest, 274.5);
const cfgK0 = akParams({ budget: 300, kumulierbar: true });
eq('kumulierbar OHNE Anker → Übertrag 0 (nur aktuelle Periode)', akSaldo(cfgK0, 'u1', bezK, '2026-07-15').uebertrag, 0);
const cfgKab = akParams({ budget: 300, periode: 'jahr', startMonat: 1, kumulierbar: true, budgetAb: '2024-01-01', budgets: { u1: { ab: '2025-01-01' } } });
const skab = akSaldo(cfgKab, 'u1', bezK, '2026-07-15');
near('User-Eintritt 2025 → nur 2025 kumuliert (−50)', skab.uebertrag, -50);
eq('1 Periode gezählt', skab.uebertragPerioden, 1);
const cfgKov = akParams({ budget: 300, periode: 'jahr', startMonat: 1, kumulierbar: true, budgetAb: '2024-01-01', budgets: { u1: { betrag: 100 } } });
const skov = akSaldo(cfgKov, 'u1', bezK, '2026-07-15');
near('Override 100 kumuliert: (100−200)+(100−350) = −350', skov.uebertrag, -350);
t('überzogen über Perioden → negativ', skov.negativ === true);
const cfgHK = akParams({ budget: 100, periode: 'halbjahr', startMonat: 1, kumulierbar: true, budgetAb: '2025-07-01' });
const shk = akSaldo(cfgHK, 'u1', [{ userId: 'u1', datum: '2025-08-01', total: 30 }], '2026-07-15');
near('halbjährlich kumuliert über Jahreswechsel: 70 + 100', shk.uebertrag, 170);
near('verfügbar 270', shk.verfuegbar, 270);

console.log('— Formatierung + Kategorien —');
eq("CHF 1234.5 → 1'234.50", akFmtChf(1234.5), "1'234.50");
eq('CHF 0 → 0.00', akFmtChf(0), '0.00');
eq('CHF −5 → −5.00', akFmtChf(-5), '−5.00');
eq("CHF 1 Mio mit Apostrophen", akFmtChf(1000000), "1'000'000.00");
eq('akKat schuhe → 👟', akKat('schuhe').icon, '👟');
eq('akKat unbekannt → sonstiges', akKat('gibtsnicht').id, 'sonstiges');
t('10 Kategorien definiert', AK_KATS.length === 10);

console.log('\n' + (n - fail) + '/' + n + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
