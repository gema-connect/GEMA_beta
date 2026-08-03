#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   Drift-Guard — Rechenkern el_spannungsfall (Node, kein Browser nötig)

   Prüft den ENGINE-Block gegen UNABHÄNGIG gerechnete Werte:
   jede Referenz steht als ausgeschriebene Formel im Test und wird NICHT
   von sfCalc geholt. Läuft die Engine auseinander, failt der Test — auch
   dann, wenn sie in sich konsistent bleibt.

   Ausführen:  node scripts/spannungsfall_engine_test.mjs
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(b, t) { if (b) { pass++; } else { fail++; console.log('  ✕ ' + t); } }
/* Float-Vergleich: relative Toleranz, absolute Schranke für Werte um 0. */
function nahe(a, b, tol, t) {
  const d = Math.abs(a - b), s = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  ok(d <= (tol || 1e-9) * s || d < 1e-12, t + ' — ist ' + a + ', soll ' + b);
}

/* ── Engine + Fachbasis laden ──────────────────────────────────────────── */
const html = readFileSync(join(ROOT, 'el_spannungsfall.html'), 'utf8');
const engQuelle = html.split('/*ENGINE-START*/')[1];
if (!engQuelle) { console.log('✕ ENGINE-START-Block nicht gefunden'); process.exit(1); }
const eng = engQuelle.split('/*ENGINE-END*/')[0];

const w = {};
new Function('window', readFileSync(join(ROOT, 'gema_elektro.js'), 'utf8'))(w);
const E = w.GemaElektro;
const { sfCalc, sfLeitung } =
  new Function('GemaElektro', eng + '\n; return { sfCalc: sfCalc, sfLeitung: sfLeitung };')(E);

/* DOM-Freiheit: der Rechenkern darf die Oberfläche nicht anfassen.
   Geprüft wird der CODE — die Kommentare des Blocks nennen die verbotenen
   Namen bewusst als Merksatz und dürfen den Test nicht auslösen. */
console.log('── Rechenkern ist DOM-frei ──');
const engCode = eng.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
for (const verbot of ['document', 'getElementById', 'innerHTML', 'querySelector', 'window.']) {
  ok(engCode.indexOf(verbot) < 0, 'ENGINE-Block ohne «' + verbot + '» im Code');
}
ok(/keine getElementById/.test(eng), 'der Merksatz steht weiterhin im Kommentar');

/* Eingabe-Vorlage — jeder Fall überschreibt nur, was er braucht. */
const BASIS = {
  systemId: '3p400', u: 400, modus: 'strom', strom: 16, leistung: 0, cosPhi: 1,
  laenge: 100, querschnitt: 2.5, parallel: 1, material: 'cu', temp: 70,
  xBelag: 0, maxDu: 5, stunden: 2000, auslastung: 100, preis: 0.25
};
const mit = (o) => sfCalc(Object.assign({}, BASIS, o));

/* Unabhängige Referenz-Rechnungen (bewusst ausgeschrieben). */
const W3 = Math.sqrt(3);
const kappaRef = (k20, alpha, t) => k20 / (1 + alpha * (t - 20));
const KAPPA_CU70 = kappaRef(56, 0.00393, 70);   // 46.8031759…
const KAPPA_CU20 = 56;
const KAPPA_AL70 = kappaRef(36, 0.00403, 70);

/* ══ 1. Leitfähigkeit bei Betriebstemperatur ═════════════════════════════ */
console.log('── κ bei Betriebstemperatur ──');
nahe(mit({}).kappa, KAPPA_CU70, 1e-12, 'κ Cu bei 70 °C');
nahe(mit({ temp: 20 }).kappa, KAPPA_CU20, 1e-12, 'κ Cu bei 20 °C = κ₂₀');
nahe(mit({ material: 'al', temp: 70 }).kappa, KAPPA_AL70, 1e-12, 'κ Al bei 70 °C');
ok(mit({}).kappa < 47 && mit({}).kappa > 46, 'κ Cu 70 °C liegt bei rund 46.8');
/* Der Kern der κ-Regel: mit κ₂₀ fällt der Spannungsfall rund 20 % zu klein aus. */
{
  const warm = mit({ temp: 70 }).du, kalt = mit({ temp: 20 }).du;
  nahe(warm / kalt, 1 + 0.00393 * 50, 1e-12, 'ΔU(70 °C)/ΔU(20 °C) = 1 + α·50');
  ok(warm > kalt * 1.19, 'κ₂₀ rechnet den Spannungsfall spürbar zu günstig');
}

/* ══ 2. Referenzfall 400 V · 2.5 mm² · 16 A · 100 m ══════════════════════ */
console.log('── Referenzfall dreiphasig ──');
{
  const r = mit({});
  /* ΔU = √3 · I · L / (κ · A)   — rein ohmsch, cos φ = 1 */
  const duRef = W3 * 16 * 100 / (KAPPA_CU70 * 2.5);
  nahe(r.du, duRef, 1e-12, 'ΔU dreiphasig');
  nahe(r.du, 23.6845580, 1e-7, 'ΔU numerisch (23.68 V)');
  nahe(r.duProz, duRef / 400 * 100, 1e-12, 'ΔU in %');
  nahe(r.uv, 400 - duRef, 1e-12, 'Spannung am Verbraucher U − ΔU');
  /* P = 3 · I² · L / (κ · A)  UND die Gegenprobe P = 3 · I² · R_Leiter */
  const pvRef = 3 * 16 * 16 * 100 / (KAPPA_CU70 * 2.5);
  const rLeiter = 100 / (KAPPA_CU70 * 2.5);
  nahe(r.pv, pvRef, 1e-12, 'Verlustleistung P = fP · I² · L/(κ·A)');
  nahe(r.pv, 3 * 16 * 16 * rLeiter, 1e-12, 'Gegenprobe P = 3 · I² · R_Leiter');
  nahe(r.rw, 3 * rLeiter, 1e-12, 'R_w = fP · L/(κ·A·n)');
  nahe(r.pv, 16 * 16 * r.rw, 1e-12, 'P_v = I² · R_w (Definition von R_w)');
  nahe(r.rBelag, 1 / (KAPPA_CU70 * 2.5), 1e-12, 'Widerstandsbelag R′ = 1/(κ·A)');
  /* Verlustanteil: P_nutz = √3 · U · I · cos φ */
  nahe(r.pvAnteil, pvRef / (W3 * 400 * 16 * 1) * 100, 1e-12, 'Verlustanteil an P_nutz');
  ok(r.status === 'err', 'Referenzfall überschreitet 5 % → Status err');
}

/* ══ 3. Einphasig — Faktor 2 statt √3 ═══════════════════════════════════ */
console.log('── Einphasig 230 V ──');
{
  const r = mit({ systemId: '1p230', u: 230 });
  const duRef = 2 * 16 * 100 / (KAPPA_CU70 * 2.5);
  nahe(r.du, duRef, 1e-12, 'ΔU einphasig = 2·I·L/(κ·A)');
  nahe(r.pv, 2 * 16 * 16 * 100 / (KAPPA_CU70 * 2.5), 1e-12, 'P_v einphasig = 2·I²·L/(κ·A)');
  nahe(r.duProz, duRef / 230 * 100, 1e-12, 'ΔU% bezieht sich auf 230 V');
  /* Der Faktor ist der einzige Unterschied — Verhältnis exakt 2/√3. */
  nahe(r.du / mit({}).du, 2 / W3, 1e-12, 'ΔU einphasig / dreiphasig = 2/√3');
}

/* ══ 4. Strom aus Leistung ══════════════════════════════════════════════ */
console.log('── Strom aus der Wirkleistung ──');
{
  /* dreiphasig: I = P / (√3 · U · cos φ) */
  const r = mit({ modus: 'leistung', leistung: 10, cosPhi: 0.9, xBelag: 0 });
  nahe(r.strom, 10000 / (W3 * 400 * 0.9), 1e-12, 'I dreiphasig aus P');
  nahe(r.strom, 16.0375, 1e-4, 'I numerisch (16.04 A bei 10 kW / 0.9)');
  /* einphasig: I = P / (U · cos φ) */
  const r1 = mit({ systemId: '1p230', u: 230, modus: 'leistung', leistung: 3.68, cosPhi: 1 });
  nahe(r1.strom, 3680 / 230, 1e-12, 'I einphasig aus P');
  nahe(r1.strom, 16, 1e-9, 'I numerisch (3.68 kW / 230 V = 16 A)');
  /* Bei cos φ = 1 muss der Leistungsweg denselben ΔU liefern wie der Stromweg. */
  const a = mit({ modus: 'leistung', leistung: W3 * 400 * 16 / 1000, cosPhi: 1 });
  nahe(a.du, mit({}).du, 1e-9, 'Leistungs- und Stromweg führen zum selben ΔU');
  ok(mit({}).ausLeistung === false && a.ausLeistung === true, 'Modus wird gemeldet');
}

/* ══ 5. cos φ und Reaktanz ══════════════════════════════════════════════ */
console.log('── cos φ und induktiver Anteil ──');
{
  /* Ohne Reaktanz skaliert ΔU linear mit cos φ. */
  nahe(mit({ cosPhi: 0.8 }).du, mit({ cosPhi: 1 }).du * 0.8, 1e-12, 'ΔU ∝ cos φ (rein ohmsch)');
  /* Mit Reaktanz: ΔU = fU·I·L·(R′·cos φ + X′·sin φ)/n */
  const cos = 0.8, sin = Math.sqrt(1 - 0.8 * 0.8), Xs = 0.08 / 1000;
  const A = 150;
  const r = mit({ querschnitt: A, cosPhi: cos, xBelag: 0.08 });
  const Rs = 1 / (KAPPA_CU70 * A);
  const duRef = W3 * 16 * 100 * (Rs * cos + Xs * sin) / 1;
  nahe(r.du, duRef, 1e-12, 'ΔU mit Reaktanzanteil');
  nahe(r.duR, W3 * 16 * 100 * Rs * cos, 1e-12, 'ohmscher Teilbetrag ΔU_R');
  nahe(r.duX, W3 * 16 * 100 * Xs * sin, 1e-12, 'induktiver Teilbetrag ΔU_X');
  nahe(r.duR + r.duX, r.du, 1e-12, 'ΔU_R + ΔU_X = ΔU');
  /* Verhältnis der Anteile = (X′·sin φ)/(R′·cos φ) — genau das macht den
     induktiven Anteil bei grossem Querschnitt unverzichtbar. */
  nahe(r.duX / r.duR, (Xs * sin) / (Rs * cos), 1e-12, 'Anteilsverhältnis X′sinφ / R′cosφ');
  ok(r.duX / r.du > 0.25, 'bei 150 mm² steckt über ein Viertel des ΔU im induktiven Anteil');
  /* Gegenprobe klein: bei 2.5 mm² ist der Anteil vernachlässigbar. */
  const klein = mit({ querschnitt: 2.5, cosPhi: cos, xBelag: 0.08 });
  ok(klein.duX / klein.du < 0.02, 'bei 2.5 mm² ist der induktive Anteil unter 2 %');
  /* Die Verlustleistung ist stromabhängig und darf cos φ NICHT enthalten. */
  nahe(mit({ cosPhi: 0.5 }).pv, mit({ cosPhi: 1 }).pv, 1e-12, 'P_v hängt nicht von cos φ ab');
  /* X′ = 0 muss exakt die rein ohmsche Rechnung ergeben. */
  nahe(mit({ xBelag: 0 }).duX, 0, 1e-12, 'X′ = 0 → kein induktiver Anteil');
}

/* ══ 6. Parallele Leiter ════════════════════════════════════════════════ */
console.log('── Parallele Leiter ──');
{
  for (const n of [2, 3, 4]) {
    nahe(mit({ parallel: n }).du, mit({ parallel: 1 }).du / n, 1e-12, 'ΔU geteilt durch n=' + n);
    nahe(mit({ parallel: n }).pv, mit({ parallel: 1 }).pv / n, 1e-12, 'P_v geteilt durch n=' + n);
  }
  /* Auch der induktive Anteil wird geteilt. */
  const a = mit({ querschnitt: 150, cosPhi: 0.8, xBelag: 0.08, parallel: 2 });
  const b = mit({ querschnitt: 150, cosPhi: 0.8, xBelag: 0.08, parallel: 1 });
  nahe(a.duX, b.duX / 2, 1e-12, 'ΔU_X geteilt durch n');
  ok(mit({ parallel: 2 }).hinweise.some(h => /parallel/i.test(h)),
     'parallele Leiter werden mit Bedingungen gemeldet');
}

/* ══ 7. Mindestquerschnitt — kein stiller Deckel ════════════════════════ */
console.log('── Mindestquerschnitt ──');
{
  const r = mit({});
  /* A_min = fU · I · L · cos φ / (κ · n · ΔU_zul) */
  const duZul = 400 * 5 / 100;
  const aRef = W3 * 16 * 100 * 1 / (KAPPA_CU70 * 1 * duZul);
  nahe(r.duZulV, duZul, 1e-12, 'ΔU_zul in Volt');
  nahe(r.aMin, aRef, 1e-12, 'A_min rein ohmsch');
  nahe(r.aMin, 2.9605698, 1e-6, 'A_min numerisch (2.96 mm²)');
  ok(r.aNorm === 4, 'nächster genormter Querschnitt = 4 mm²');
  /* Gegenprobe: mit A_min liegt ΔU exakt auf dem Grenzwert. */
  nahe(mit({ querschnitt: r.aMin }).duProz, 5, 1e-9, 'bei A_min ist ΔU% exakt der Grenzwert');
  ok(mit({ querschnitt: 4 }).status !== 'err', 'mit 4 mm² ist der Grenzwert eingehalten');

  /* Über der Reihe: aNorm MUSS null sein und gemeldet werden.
     √3·630·400/(46.803·1·8) ≈ 1’166 mm² — die Reihe endet bei 630. */
  const gross = mit({ strom: 630, laenge: 400, maxDu: 2 });
  ok(gross.aMin > 630, 'Bedarf liegt rechnerisch über 630 mm²');
  ok(gross.aNorm === null, 'aNorm ist null statt eines stillen Deckels');
  ok(gross.hinweise.some(h => /630/.test(h)), 'über 630 mm² wird ausdrücklich gemeldet');

  /* Reaktanz-Sperre: der induktive Anteil allein reisst den Grenzwert. */
  const sperre = mit({ strom: 250, laenge: 400, cosPhi: 0.6, xBelag: 0.15, maxDu: 1, querschnitt: 240 });
  ok(sperre.reaktanzSperre === true, 'Reaktanz-Sperre erkannt');
  ok(sperre.aMin === null, 'kein A_min, wenn kein Querschnitt genügt');
  ok(sperre.hinweise.some(h => /induktiv/i.test(h)), 'Reaktanz-Sperre wird gemeldet');
  /* Gegenprobe: derselbe Fall ohne Reaktanz hat sehr wohl eine Lösung. */
  ok(mit({ strom: 250, laenge: 400, cosPhi: 0.6, xBelag: 0, maxDu: 1, querschnitt: 240 })
       .reaktanzSperre === false, 'ohne Reaktanz keine Sperre');
}

/* ══ 8. Verlustkosten — b², nicht b ═════════════════════════════════════ */
console.log('── Verlustkosten ──');
{
  const r = mit({});
  nahe(r.pvMittel, r.pv, 1e-12, 'bei 100 % Auslastung volle Verlustleistung');
  nahe(r.wv, r.pv / 1000 * 2000, 1e-12, 'Energieverlust = P_v · h');
  nahe(r.kosten, r.wv * 0.25, 1e-12, 'Kosten = W_v · Preis');
  /* Halbe Auslastung → ein VIERTEL der Verluste (quadratisch). */
  const halb = mit({ auslastung: 50 });
  nahe(halb.pvMittel, r.pv * 0.25, 1e-12, 'b = 50 % → b² = 25 % der Verluste');
  nahe(halb.kosten, r.kosten * 0.25, 1e-12, 'Kosten folgen b²');
  ok(Math.abs(halb.kosten - r.kosten * 0.5) > 1, 'ein linearer Faktor wäre klar daneben');
  nahe(mit({ auslastung: 0 }).kosten, 0, 1e-12, 'ohne Auslastung keine Kosten');
  nahe(mit({ stunden: 0 }).wv, 0, 1e-12, 'ohne Betriebsstunden kein Energieverlust');
}

/* ══ 9. Status-Ampel ════════════════════════════════════════════════════ */
console.log('── Status ──');
{
  ok(mit({ querschnitt: 2.5 }).status === 'err', 'über dem Grenzwert → err');
  ok(mit({ querschnitt: 16 }).status === 'ok', 'deutlich darunter → ok');
  /* warn = zwischen 90 % und 100 % des Grenzwerts. ΔU steigt linear mit I —
     den Strom so wählen, dass ΔU% bei 4.7 % landet. */
  const bei4 = mit({ querschnitt: 4 });
  ok(bei4.status === 'ok', '4 mm² bei 16 A liegt komfortabel im grünen Bereich');
  const w1 = mit({ querschnitt: 4, strom: 16 * 4.7 / bei4.duProz });
  nahe(w1.duProz, 4.7, 1e-9, 'konstruierter Fall liegt bei 4.7 %');
  ok(w1.status === 'warn', 'zwischen 90 % und 100 % des Grenzwerts → warn');
  const w2 = mit({ querschnitt: 4, strom: 16 * 4.4 / bei4.duProz });
  ok(w2.status === 'ok', 'bei 4.4 % (unter 90 % des Grenzwerts) noch ok');
  ok(mit({ strom: 0 }).status === 'leer', 'ohne Strom → leer');
  ok(mit({ laenge: 0 }).status === 'leer', 'ohne Länge → leer');
  ok(mit({ querschnitt: 0 }).status === 'leer', 'ohne Querschnitt → leer');
  /* Genau auf dem Grenzwert gilt als eingehalten. */
  ok(mit({ querschnitt: mit({}).aMin }).status !== 'err', 'ΔU exakt am Grenzwert ist nicht err');
}

/* ══ 10. Hinweise — jede Vereinfachung wird benannt ═════════════════════ */
console.log('── Hinweise ──');
{
  ok(mit({ querschnitt: 95, xBelag: 0 }).hinweise.some(h => /induktiv/i.test(h)),
     'ab 50 mm² ohne X′ wird der fehlende induktive Anteil gemeldet');
  ok(!mit({ querschnitt: 16, cosPhi: 1, xBelag: 0 }).hinweise.some(h => /induktiv/i.test(h)),
     'bei kleinem Querschnitt und cos φ = 1 kein Reaktanz-Hinweis');
  ok(mit({ cosPhi: 0.8, xBelag: 0 }).hinweise.some(h => /cos/i.test(h)),
     'cos φ < 1 ohne Reaktanz wird als zu günstig gemeldet');
  ok(mit({ temp: 20 }).hinweise.some(h => /20 °C/.test(h)),
     'Rechnung bei 20 °C wird gemeldet');
  ok(mit({ temp: 70 }).hinweise.every(h => !/20 °C/.test(h)),
     'bei 70 °C kein 20-°C-Hinweis');
}

/* ══ 11. Vergleichstabelle ══════════════════════════════════════════════ */
console.log('── Vergleichstabelle ──');
{
  const r = mit({});
  ok(r.varianten.length === E.EL_QUERSCHNITTE.length, 'eine Zeile je genormtem Querschnitt');
  ok(r.varianten.filter(v => v.gewaehlt).length === 1, 'genau eine Zeile als gewählt markiert');
  ok(r.varianten.find(v => v.gewaehlt).a === 2.5, 'die gewählte Zeile ist 2.5 mm²');
  ok(r.varianten.find(v => v.empfohlen).a === r.aNorm, 'die empfohlene Zeile ist aNorm');
  /* Die Tabelle MUSS dieselbe Rechnung zeigen wie das Hauptergebnis. */
  nahe(r.varianten.find(v => v.gewaehlt).du, r.du, 1e-12, 'Tabellenzeile = Hauptergebnis');
  /* Monotonie: grösserer Querschnitt → kleinerer Spannungsfall. */
  let mono = true;
  for (let i = 1; i < r.varianten.length; i++) if (r.varianten[i].du >= r.varianten[i - 1].du) mono = false;
  ok(mono, 'ΔU sinkt mit wachsendem Querschnitt');
  /* Alle Zeilen ab aNorm halten den Grenzwert ein. */
  ok(r.varianten.filter(v => v.a >= r.aNorm).every(v => v.erfuellt),
     'ab dem empfohlenen Querschnitt ist der Grenzwert überall eingehalten');
  ok(r.varianten.filter(v => v.a < r.aNorm).every(v => !v.erfuellt),
     'darunter ist er überall überschritten');
}

/* ══ 12. Robustheit ═════════════════════════════════════════════════════ */
console.log('── Robustheit ──');
{
  for (const fall of [
    { querschnitt: 0 }, { laenge: 0 }, { strom: 0 }, { u: 0 },
    { cosPhi: 0 }, { parallel: 0 }, { maxDu: 0 }, { temp: 0 },
    { modus: 'leistung', leistung: 0, cosPhi: 0 }
  ]) {
    const r = mit(fall);
    const werte = [r.du, r.duProz, r.pv, r.rw, r.kosten, r.wv];
    ok(werte.every(v => Number.isFinite(v)),
       'keine NaN/Infinity bei ' + JSON.stringify(fall) + ' — ' + werte.join('|'));
  }
  /* cos φ ausserhalb 0…1 fällt auf 1 zurück statt zu kippen. */
  nahe(mit({ cosPhi: 1.7 }).du, mit({ cosPhi: 1 }).du, 1e-12, 'cos φ > 1 wird auf 1 geklemmt');
  /* u = 0 nimmt die Nennspannung des Systems. */
  nahe(mit({ u: 0 }).u, 400, 1e-12, 'ohne Spannungseingabe gilt die Systemspannung');
  /* sfLeitung ist der geteilte Baustein — bei A = 0 kein Absturz. */
  const leer = sfLeitung(0, { kappa: 46.8, u: 400, cos: 1, sin: 0, n: 1, l: 100, xs: 0, fU: W3, fP: 3, i: 16 });
  ok(Number.isFinite(leer.du) && leer.du === 0, 'sfLeitung(0) liefert 0 statt Infinity');
}

/* ══ 13. Reaktanz-Fachdaten in der geteilten Basis ══════════════════════ */
console.log('── EL_REAKTANZ in gema_elektro.js ──');
{
  ok(Array.isArray(E.EL_REAKTANZ) && E.EL_REAKTANZ.length >= 2, 'EL_REAKTANZ vorhanden');
  ok(E.EL_REAKTANZ[0].x === 0, 'erster Eintrag ist «vernachlässigen» (X′ = 0)');
  ok(E.EL_REAKTANZ.every(r => typeof r.id === 'string' && typeof r.label === 'string'
        && Number.isFinite(r.x) && r.x >= 0), 'jeder Eintrag hat id, label und X′ ≥ 0');
  ok(E.EL_REAKTANZ.every(r => r.x < 1), 'X′ in mΩ/m — Werte deutlich unter 1');
  ok(E.elReaktanz('mehr').x === 0.08, 'Mehraderkabel 0.08 mΩ/m');
  ok(E.elReaktanz('gibtsnicht').x === 0, 'unbekannte id fällt auf «vernachlässigen» zurück');
  ok(E.EL_REAKTANZ_AB_MM2 === 50, 'Schwelle für den Reaktanz-Hinweis bei 50 mm²');
  /* Die bestehenden Werte der Fachbasis dürfen NICHT verändert worden sein. */
  ok(E.elMaterial('cu').kappa20 === 56 && E.elMaterial('al').kappa20 === 36,
     'bestehende κ₂₀-Werte unverändert');
  ok(E.EL_QUERSCHNITTE.length === 19 && E.EL_QUERSCHNITTE[18] === 630,
     'Querschnittsreihe unverändert (bis 630 mm²)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
