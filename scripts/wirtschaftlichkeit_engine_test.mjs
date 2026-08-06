// Wirtschaftlichkeitsrechnung — Engine-Test gegen die Excel-Cached-Werte der
// Vorlage «Wirtschaftlichkeitsrechnung_neu_SP.xlsm» (Beispiel Wettsteinallee 48,
// Basel: Variante 1 Erdsonden-WP 132'000/16'325 vs. Variante 2 Luft/Wasser-WP
// 97'000/6'125, Zins 3 %, 25 Jahre, Teuerung 1 %) plus unabhängig in Python
// nachgerechnete Formelwerte (PMT/PV-Semantik).
//
// KRITISCH — Kalkulationszins der Rückzahlfrist: Die Excel führt in
// Zusammenstellung!B36 den Wert 0.03 und setzt ihn in -PMT(B3/100, n, 1) ein —
// gemeint waren 3 %, gerechnet wurden 0.03 % (Faktor 100 daneben). Mit der
// Roh-Semantik amortisiert das Beispiel nach 14 Jahren (so steht es auch als
// Begründung im Blatt), mit korrekt 3 % nach 17 Jahren. Der Test prüft BEIDE:
// die Roh-Semantik als Excel-Parität (Cached-Werte), die korrigierte als
// fachliche Referenz (unabhängig berechnet).
//
//   node scripts/wirtschaftlichkeit_engine_test.mjs
//
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function engineOf(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
  if (!m) throw new Error('ENGINE-Block fehlt in ' + file);
  return m[1];
}

const scope = {};
new Function('S', engineOf('pm_wirtschaftlichkeit.html') + `
S.WIRT_TRAEGER=WIRT_TRAEGER; S.WIRT_KOSTENARTEN=WIRT_KOSTENARTEN;
S.wirtNum=wirtNum; S.wirtAnnuitaet=wirtAnnuitaet; S.wirtMittelwert=wirtMittelwert;
S.wirtVariante=wirtVariante; S.wirtStatik=wirtStatik;
S.wirtZusammenstellung=wirtZusammenstellung; S.wirtAutoPaar=wirtAutoPaar;
S.wirtDifferenzen=wirtDifferenzen; S.wirtRueckzahlfrist=wirtRueckzahlfrist;
`)(scope);
const E = scope;

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}
function near(a, b, tol) { return typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= tol; }

console.log('— Zahlen-Helfer & Referenzlisten —');
t("wirtNum: Apostroph + Komma «1'234,5» → 1234.5", E.wirtNum("1'234,5") === 1234.5);
t('wirtNum: leer/Strich/undefined → 0', E.wirtNum('') === 0 && E.wirtNum('-') === 0 && E.wirtNum(undefined) === 0);
t('wirtNum: Unsinn → 0', E.wirtNum('abc') === 0);
t('WIRT_TRAEGER = 7 Energieträger', E.WIRT_TRAEGER.length === 7);
t('WIRT_TRAEGER ids (Vorlage-Reihenfolge)', ['elektro_ht','elektro_nt','heizoel','erdgas','fluessiggas','holz','pellet'].every((id,i)=>E.WIRT_TRAEGER[i].id===id));
t('WIRT_KOSTENARTEN = 5 Kostenarten', E.WIRT_KOSTENARTEN.length === 5 && E.WIRT_KOSTENARTEN[0].id==='grob20' && E.WIRT_KOSTENARTEN[4].id==='effektiv');

console.log('— Annuitätsfaktor a(i,n) (Excel C9 + Rückzahlfrist-Zeile 5) —');
t('a(3 %, 25) = 0.0574278710391278 (Excel C9)', near(E.wirtAnnuitaet(3, 25), 0.0574278710391278, 1e-12), E.wirtAnnuitaet(3, 25));
t('a(0.03 %, 1) = 1.0003 (Excel C5)', near(E.wirtAnnuitaet(0.03, 1), 1.0003000000000002, 1e-12));
t('a(0.03 %, 14) = 0.07158939016287405 (Excel P5)', near(E.wirtAnnuitaet(0.03, 14), 0.07158939016287405, 1e-12));
t('a(0.03 %, 20) = 0.05015764960247078 (Excel V5)', near(E.wirtAnnuitaet(0.03, 20), 0.05015764960247078, 1e-12));
t('a(0, n) → Grenzwert 1/n', E.wirtAnnuitaet(0, 25) === 1 / 25);
t('a bei n=0 → 0', E.wirtAnnuitaet(3, 0) === 0);
t('a(i,1) = 1+i (Sofort-Rückzahlung)', near(E.wirtAnnuitaet(3, 1), 1.03, 1e-12));

console.log('— Mittelwertfaktor m(i,n,g) (Excel E29/E30 + Rückzahlfrist-Zeilen 6–8) —');
t('m(3 %, 25, 1 %) = 1.1238013289988595 (Excel E29)', near(E.wirtMittelwert(3, 25, 1), 1.1238013289988595, 1e-9), E.wirtMittelwert(3, 25, 1));
t('m(0.03 %, 1, 1.3 %) = 1.013 (Excel C6)', near(E.wirtMittelwert(0.03, 1, 1.3), 1.0129999999999961, 1e-9));
t('m(0.03 %, 17, 1.3 %) = 1.1254177013582425 (Excel S6)', near(E.wirtMittelwert(0.03, 17, 1.3), 1.1254177013582425, 1e-9));
t('m(0.03 %, 20, 1 %) = 1.1118494264182004 (Excel V8)', near(E.wirtMittelwert(0.03, 20, 1), 1.1118494264182004, 1e-9));
t('m(i, n, 0) = 1 (keine Teuerung → heutige Kosten)', near(E.wirtMittelwert(3, 25, 0), 1, 1e-12));
t('m(i, n, g) mit i=g → a·n (r→0-Grenzwert)', near(E.wirtMittelwert(3, 10, 3), E.wirtAnnuitaet(3, 10) * 10, 1e-12));
t('m bei n=0 → 0', E.wirtMittelwert(3, 0, 1) === 0);

// ───────────────────────── Beispiel-Varianten der Vorlage ─────────────────────────
const V1 = { name: 'Erdsonden Wärmepumpe', kostenart: 'grob20',
  inv: 132000, foerder: 16325, zins: 3, dauer: 25, teuerBK: 1, teuerEK: 1,
  bk: [{ art: 'pct', wert: 0.5 }, { art: 'chf', wert: 0 }, { art: 'chf', wert: 0 }],
  ek: [{ traeger: 'elektro_nt', menge: 11714, preis: 0.25, umwelt: 0 }],
  grundgeb: 0 };
const V2 = { name: 'Luft/Wasser Wärmepumpe', kostenart: 'grob20',
  inv: 97000, foerder: 6125, zins: 3, dauer: 25, teuerBK: 1, teuerEK: 1,
  bk: [{ art: 'pct', wert: 1.25 }],
  ek: [{ traeger: 'elektro_nt', menge: 15769, preis: 0.25, umwelt: 0 }],
  grundgeb: 0 };

console.log('— Variante 1 (Erdsonden-WP, Excel-Cached Blatt «Variante 1») —');
const r1 = E.wirtVariante(V1);
t('Netto-Investition = 115675 (A9)', r1.nettoInv === 115675);
t('Annuitätsfaktor (C9)', near(r1.af, 0.0574278710391278, 1e-12));
t('Kapitalkosten = 6642.968982451108 (J9)', near(r1.kapK, 6642.968982451108, 1e-6), r1.kapK);
t('BK heute = 578.375 (J15: 0.5 % von 115675)', near(r1.bkHeute, 578.375, 1e-9), r1.bkHeute);
t('EK heute = 2928.5 (J22: 11714 × 0.25)', near(r1.ekHeute, 2928.5, 1e-9));
t('Total heutige Kosten = 10149.843982451108 (J24)', near(r1.totalHeute, 10149.843982451108, 1e-6), r1.totalHeute);
t('Mittelwertfaktor BK = EK (Teuerung je 1 %)', near(r1.mwfBK, 1.1238013289988595, 1e-9) && r1.mwfBK === r1.mwfEK);
t('BK zukünftig = 649.9785936597153 (J29)', near(r1.bkZuk, 649.9785936597153, 1e-6), r1.bkZuk);
t('EK zukünftig = 3291.05219197316 (J30)', near(r1.ekZuk, 3291.05219197316, 1e-6), r1.ekZuk);
t('Umweltkosten = 0 (J34)', r1.umwelt === 0);
t('Total zukünftig = 10583.999768083984 (J36)', near(r1.totalZuk, 10583.999768083984, 1e-6), r1.totalZuk);
t('EK je Träger: elektro_nt heute = 2928.5', near(r1.ekProTraeger.elektro_nt, 2928.5, 1e-9));
t('EK je Träger: elektro_nt zukünftig = EK zukünftig', near(r1.ekZukProTraeger.elektro_nt, r1.ekZuk, 1e-9));
t('Variante aktiv', r1.aktiv === true);

console.log('— Variante 2 (Luft/Wasser-WP, Excel-Cached Blatt «Variante 2») —');
const r2 = E.wirtVariante(V2);
t('Netto-Investition = 90875 (A9)', r2.nettoInv === 90875);
t('Kapitalkosten = 5218.7577806807385 (J9)', near(r2.kapK, 5218.7577806807385, 1e-6), r2.kapK);
t('BK heute = 1135.9375 (J15: 1.25 % von 90875)', near(r2.bkHeute, 1135.9375, 1e-9), r2.bkHeute);
t('EK heute = 3942.25 (J22: 15769 × 0.25)', near(r2.ekHeute, 3942.25, 1e-9));
t('Total heutige Kosten = 10296.945280680739 (J24)', near(r2.totalHeute, 10296.945280680739, 1e-6));
t('BK zukünftig = 1276.568072159642 (J29)', near(r2.bkZuk, 1276.568072159642, 1e-6));
t('EK zukünftig = 4430.305789245754 (J30)', near(r2.ekZuk, 4430.305789245754, 1e-6));
t('Total zukünftig = 10925.631642086133 (J36)', near(r2.totalZuk, 10925.631642086133, 1e-6), r2.totalZuk);

console.log('— Statische Methode (Zusammenstellung B8–C13) —');
const s1 = E.wirtStatik(r1), s2 = E.wirtStatik(r2);
t('V1 Abschreibung = 4627 (B8: 115675/25)', near(s1.abschreibung, 4627, 1e-9));
t('V1 Verzinsung = 1735.125 (B9: ½·115675·3 %)', near(s1.verzinsung, 1735.125, 1e-9));
t('V1 statisches Total = 9869 (B12)', near(s1.statTotal, 9869, 1e-9), s1.statTotal);
t('V2 Abschreibung = 3635 (C8)', near(s2.abschreibung, 3635, 1e-9));
t('V2 Verzinsung = 1363.125 (C9)', near(s2.verzinsung, 1363.125, 1e-9));
t('V2 statisches Total = 10076.3125 (C12)', near(s2.statTotal, 10076.3125, 1e-9), s2.statTotal);

console.log('— Zusammenstellung & Vergleichs-% (B13/C13 + B21/C21) —');
const zus = E.wirtZusammenstellung([V1, V2, {}]);
t('Basis = Variante 1 (erste aktive)', zus.basisIdx === 0);
t('V1 Vergleich statisch = 100 %', near(zus.rows[0].vglStat, 100, 1e-9));
t('V1 Vergleich dynamisch = 100 %', near(zus.rows[0].vglDyn, 100, 1e-9));
t('V2 Vergleich statisch = 102.10064342891884 (C13)', near(zus.rows[1].vglStat, 102.10064342891884, 1e-9), zus.rows[1].vglStat);
t('V2 Vergleich dynamisch = 103.2278144509445 (C21)', near(zus.rows[1].vglDyn, 103.2278144509445, 1e-9), zus.rows[1].vglDyn);
t('Leere Variante 3: inaktiv, kein Vergleich', zus.rows[2].res.aktiv === false && zus.rows[2].vglStat === null);

console.log('— Automatisches Vergleichspaar (Zusammenstellung B30/B31) —');
const paar = E.wirtAutoPaar(zus.rows);
t('Oben = V2 (günstigere Netto-Investition 90875)', paar && paar.oben === 1);
t('Unten = V1 (teurere Investition 115675)', paar && paar.unten === 0);
t('Nur 1 aktive Variante → kein Paar', E.wirtAutoPaar(E.wirtZusammenstellung([V1, {}]).rows) === null);

console.log('— Differenzen oben−unten (Zusammenstellung C32/D32/E32) —');
const d = E.wirtDifferenzen(zus.rows[paar.oben].res, zus.rows[paar.unten].res);
t('ΔInvestition = −24800 (C32)', near(d.dInv, -24800, 1e-9), d.dInv);
t('ΔBK zukünftig = +626.5894784999267 (D32)', near(d.dBK, 626.5894784999267, 1e-6), d.dBK);
t('ΔEK zukünftig = +1139.2535972725937 (E32)', near(d.dEK, 1139.2535972725937, 1e-6), d.dEK);
t('ΔUmwelt = 0 (F32)', d.dUmwelt === 0);
t('ΔTräger elektro_nt = ΔEK (einziger Träger)', near(d.dTraeger.elektro_nt, d.dEK, 1e-9));
t('ΔTräger heizoel = 0', d.dTraeger.heizoel === 0);

console.log('— Rückzahlfrist: Excel-Parität (Roh-Semantik 0.03 → 0.03 %) —');
// Zeilen exakt wie das Blatt: BK-Einsparung 626.589478 @ 1.3 % Teuerung,
// Elektrizität NT von Hand gerundet 1139 @ 1 % (Zusammenstellung C35/C38).
const rzZeilen = [{ betrag: 626.5894784999267, teuerPct: 1.3 }, { betrag: 1139, teuerPct: 1 }];
const rzRoh = E.wirtRueckzahlfrist({ dInv: -24800, kalkZinsPct: 0.03, maxJahre: 20, zeilen: rzZeilen });
t('20 Jahreszeilen', rzRoh.jahre.length === 20 && rzRoh.maxJahre === 20);
t('Kapital n=1 = −24807.44 (C17)', near(rzRoh.jahre[0].kap, -24807.440000000006, 1e-6), rzRoh.jahre[0].kap);
t('Bilanz n=1 = −23022.314858279584 (C26)', near(rzRoh.jahre[0].summe, -23022.314858279584, 1e-6), rzRoh.jahre[0].summe);
t('Bilanz n=14 = +143.9820037423026 (P26)', near(rzRoh.jahre[13].summe, 143.9820037423026, 1e-6), rzRoh.jahre[13].summe);
t('Bilanz n=15 = +272.9712003988435 (Q26)', near(rzRoh.jahre[14].summe, 272.9712003988435, 1e-6));
t('Bilanz n=17 = +489.5081800653644 (S26)', near(rzRoh.jahre[16].summe, 489.5081800653644, 1e-6));
t('Amortisation nach 14 Jahren (erstes «X», P28 — Begründung im Blatt)', rzRoh.amortJahr === 14, rzRoh.amortJahr);

console.log('— Rückzahlfrist: korrigierter Kalkulationszins 3 % (unabhängig gerechnet) —');
const rzKorr = E.wirtRueckzahlfrist({ dInv: -24800, kalkZinsPct: 3, maxJahre: 20, zeilen: rzZeilen });
t('Bilanz n=1 = −23758.8748582796', near(rzKorr.jahre[0].summe, -23758.8748582796, 1e-6), rzKorr.jahre[0].summe);
t('Bilanz n=16 = −46.3422306417 (noch negativ)', near(rzKorr.jahre[15].summe, -46.3422306417, 1e-6));
t('Bilanz n=17 = +53.6372588853 (erstes positives Jahr)', near(rzKorr.jahre[16].summe, 53.6372588853, 1e-6));
t('Bilanz n=20 = +297.8329221104', near(rzKorr.jahre[19].summe, 297.8329221104, 1e-6));
t('Amortisation nach 17 Jahren (mit echtem 3 %-Zins)', rzKorr.amortJahr === 17, rzKorr.amortJahr);
t('Bilanz monoton steigend über n', rzKorr.jahre.every((j, i, a) => i === 0 || j.summe > a[i - 1].summe));

console.log('— Rückzahlfrist: Grenzfälle —');
t('Keine Mehrinvestition (dInv 0) + Einsparung → Amortisation Jahr 1',
  E.wirtRueckzahlfrist({ dInv: 0, kalkZinsPct: 3, maxJahre: 5, zeilen: [{ betrag: 100, teuerPct: 0 }] }).amortJahr === 1);
t('Nie positiv → amortJahr null',
  E.wirtRueckzahlfrist({ dInv: -1e9, kalkZinsPct: 3, maxJahre: 20, zeilen: rzZeilen }).amortJahr === null);
t('maxJahre-Default 20', E.wirtRueckzahlfrist({ dInv: -1000, kalkZinsPct: 3, zeilen: [] }).jahre.length === 20);
t('maxJahre min. 1', E.wirtRueckzahlfrist({ dInv: -1000, kalkZinsPct: 3, maxJahre: 0.4, zeilen: [] }).jahre.length === 1);

console.log('— Varianten-Grenzfälle —');
const rEdge = E.wirtVariante({ name: 'X', inv: 10000, foerder: 0, zins: 0, dauer: 20,
  bk: [{ art: 'chf', wert: 250 }], ek: [{ traeger: 'heizoel', menge: 1000, preis: 1.1, umwelt: 0.05 }],
  grundgeb: 120, teuerBK: 0, teuerEK: 0 });
t('Zins 0 → Annuitätsfaktor 1/n', near(rEdge.af, 1 / 20, 1e-12));
t('BK-Zeile «effektiv CHF» zählt 1:1', near(rEdge.bkHeute, 250, 1e-9));
t('Grundgebühr zählt zu den EK (Excel H21 in J22)', near(rEdge.ekHeute, 1000 * 1.1 + 120, 1e-9));
t('Umweltkosten = Menge × Satz (1000 × 0.05)', near(rEdge.umwelt, 50, 1e-9));
t('Umweltkosten fliessen 1:1 (ohne Mittelwertfaktor) ins zukünftige Total',
  near(rEdge.totalZuk, rEdge.kapK + rEdge.bkZuk + rEdge.ekZuk + 50, 1e-9));
t('Teuerung 0 → zukünftig = heute', near(rEdge.totalZuk - 50, rEdge.totalHeute, 1e-9));
t('Grundgebühr zukünftig = grundgeb × mwfEK', near(rEdge.grundgebZuk, 120 * rEdge.mwfEK, 1e-12));
const rNull = E.wirtVariante({ inv: 5000, dauer: 0, zins: 3 });
t('Dauer 0 → af 0, Kapitalkosten 0', rNull.af === 0 && rNull.kapK === 0);
t('Statik bei Dauer 0 → Abschreibung 0', E.wirtStatik(rNull).abschreibung === 0);
t('String-Eingaben (Formularwerte) rechnen wie Zahlen',
  near(E.wirtVariante({ inv: '132000', foerder: '16325', zins: '3', dauer: '25', teuerBK: '1', teuerEK: '1',
    bk: [{ art: 'pct', wert: '0.5' }], ek: [{ traeger: 'elektro_nt', menge: '11714', preis: '0.25' }] }).totalZuk,
    10583.999768083984, 1e-6));

console.log('');
console.log('Ergebnis: ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
if (fail > 0) process.exit(1);
