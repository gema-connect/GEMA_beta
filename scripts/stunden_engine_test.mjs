// Node-Test der DOM-freien Stunden-Engine (pm_stunden.html /*ENGINE-START*/-Block)
// Deckt die Erweiterungen 07/2026 ab:
//   - stdParams: kmAktiv / maxTagessoll (nullt Vorholzeit) / autoKompensation /
//     absenzRegeln / indikatoren / feiertagAutoSel — plus Rückwärtskompatibilität
//   - Absenz-Regeln pro Typ (fuelltAuf / keineVorholzeit) inkl. Defaults Schule/ÜK
//   - stdTagAbzugH / stdTagCapH + Kappung in Wochen-/Monatsauswertung (ist/istRoh/gekappt)
//   - stunden-basierte Absenzen (Auto-Kompensation) inkl. Topf-A-Bezug im Jahr
//   - stdAutoKompGap (Lücke bis zum Tagessoll)
//   - Feiertags-Generator: stdOstern (Gauss/Butcher) + stdFeiertageJahr
//   - Kontroll-Indikatoren stdIndikatoren (maxH/maxPct/minH/minPct)
// Aufruf: node scripts/stunden_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../pm_stunden.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const g = new Function(m[1] + `;return {STD_DEFAULTS,stdParams,STD_ABSENZ,STD_ABSENZ_REGEL_DEFAULTS,stdAbsenzRegel,
  stdAbsenzAnteil,stdTagSollH,stdTagAbzugH,stdTagCapH,stdEintragMin,stdTagTyp,stdTagStunden,stdAddTage,
  stdWochenStart,stdWochenSoll,stdWochenAktivTage,stdWochenSollEff,stdWochenAuswertung,stdMonatsAuswertung,
  stdJahresAuswertung,stdFmtH,stdOstern,STD_FEIERTAG_DEFS,stdFeiertageJahr,stdIndikatoren,stdAutoKompGap,
  stdParamsFuerMitarbeiter,stdEigeneAbsenz,stdEigeneAbsenzenFuer,stdAbsenzDef,stdAbsenzLimit,stdAbsenzBezogen,
  stdJahresMonatswerte,stdAbsenzTageProTyp,stdProjektStunden};`)();

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function eq(name, a, b) { t(name + ' (' + JSON.stringify(a) + ' = ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b)); }
function near(name, a, b) { t(name + ' (' + a + ' ≈ ' + b + ')', Math.abs(a - b) < 1e-9); }

// Woche Mo 2026-07-13 … So 2026-07-19, Tagessoll 8 h (40-h-Woche)
const WS = '2026-07-13';
const ein = (von, bis) => ({ von, bis, pauseMin: 0 });
const tag = (datum, stunden, absenz) => {
  const t0 = { datum, eintraege: [], spesen: {} };
  if (stunden) t0.eintraege.push(ein('07:00', String(7 + Math.floor(stunden)).padStart(2, '0') + ':' + String(Math.round((stunden % 1) * 60)).padStart(2, '0')));
  if (absenz) t0.absenz = absenz;
  return t0;
};

console.log('— stdParams: neue Felder + Rückwärtskompatibilität —');
const pDef = g.stdParams(null);
t('Default kmAktiv true', pDef.kmAktiv === true);
t('Default maxTagessoll false', pDef.maxTagessoll === false);
t('Default autoKompensation false', pDef.autoKompensation === false);
eq('Default indikatoren alles 0', pDef.indikatoren, { maxH: 0, maxPct: 0, minH: 0, minPct: 0 });
t('Default feiertagAutoSel null', pDef.feiertagAutoSel === null);
const pKm = g.stdParams({ kmAktiv: false });
t('kmAktiv false bleibt false', pKm.kmAktiv === false);
const pMax = g.stdParams({ maxTagessoll: true, vorholProWocheH: 2.5 });
t('maxTagessoll true übernommen', pMax.maxTagessoll === true);
near('maxTagessoll nullt Vorholzeit', pMax.vorholProWocheH, 0);
const pInd = g.stdParams({ indikatoren: { maxH: '50', maxPct: -3, minH: 'x', minPct: 80 } });
eq('indikatoren normalisiert (Strings/negativ/NaN)', pInd.indikatoren, { maxH: 50, maxPct: 0, minH: 0, minPct: 80 });
t('feiertagAutoSel Nicht-Array → null', g.stdParams({ feiertagAutoSel: 'x' }).feiertagAutoSel === null);
eq('feiertagAutoSel Array bleibt', g.stdParams({ feiertagAutoSel: ['auffahrt'] }).feiertagAutoSel, ['auffahrt']);

console.log('— Absenz-Regeln (Defaults + Override) —');
t('STD_ABSENZ hat schule + uek', !!g.STD_ABSENZ.schule && !!g.STD_ABSENZ.uek);
eq('Default-Regel krank: alles aus (Bestandsschutz)', g.stdAbsenzRegel(pDef, 'krank'), { fuelltAuf: false, keineVorholzeit: false });
eq('Default-Regel schule: beide an', g.stdAbsenzRegel(pDef, 'schule'), { fuelltAuf: true, keineVorholzeit: true });
eq('Default-Regel uek: beide an', g.stdAbsenzRegel(pDef, 'uek'), { fuelltAuf: true, keineVorholzeit: true });
const pKrankRegel = g.stdParams({ absenzRegeln: { krank: { fuelltAuf: true, keineVorholzeit: true }, schule: { fuelltAuf: false, keineVorholzeit: false } } });
eq('Override krank: beide an', g.stdAbsenzRegel(pKrankRegel, 'krank'), { fuelltAuf: true, keineVorholzeit: true });
eq('Override schule: Vorholzeit erlaubt', g.stdAbsenzRegel(pKrankRegel, 'schule'), { fuelltAuf: false, keineVorholzeit: false });

console.log('— stdTagAbzugH / stdTagCapH —');
near('Tagessoll 8 h', g.stdTagSollH(pDef), 8);
near('Abzug ½ krank ohne Regel = 4 h', g.stdTagAbzugH(tag(WS, 0, { typ: 'krank', anteil: 0.5 }), pDef), 4);
near('Abzug ½ krank + 6 h Arbeit, fuelltAuf = 2 h (Lücke)', g.stdTagAbzugH(tag(WS, 6, { typ: 'krank', anteil: 0.5 }), pKrankRegel), 2);
near('Abzug ½ krank + 9 h Arbeit, fuelltAuf = 0 h', g.stdTagAbzugH(tag(WS, 9, { typ: 'krank', anteil: 0.5 }), pKrankRegel), 0);
near('Abzug stunden-basiert (Auto-Komp 3 h) = 3 h', g.stdTagAbzugH(tag(WS, 5, { typ: 'kompensation', anteil: 1, stunden: 3, quelle: 'auto' }), pDef), 3);
near('Abzug am Samstag = 0 (kein Werktag)', g.stdTagAbzugH(tag('2026-07-18', 0, { typ: 'krank', anteil: 1 }), pDef), 0);
t('Keine Kappung ohne Regeln/maxTagessoll', g.stdTagCapH(tag(WS, 10), WS, pDef) === null);
near('Kappung maxTagessoll: 8 h', g.stdTagCapH(tag(WS, 10), WS, g.stdParams({ maxTagessoll: true })), 8);
near('Kappung krank-Regel: Tagessoll − Abzug = 6 h', g.stdTagCapH(tag(WS, 6, { typ: 'krank', anteil: 0.5 }), WS, pKrankRegel), 6);
t('Keine Kappung am Samstag (Zuschlagsarbeit zählt)', g.stdTagCapH(tag('2026-07-18', 4), '2026-07-18', g.stdParams({ maxTagessoll: true })) === null);

console.log('— Woche: Bestandsverhalten unverändert (Regeln aus) —');
const wAlt = g.stdWochenAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 4, { typ: 'krank', anteil: 0.5 }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], WS, pDef);
near('Ist 36 h', wAlt.ist, 36);
near('istRoh = ist (keine Kappung)', wAlt.istRoh, 36);
near('gekappt 0', wAlt.gekappt, 0);
near('Soll 36 h (½ Tag Abzug)', wAlt.soll, 36);
near('Saldo 0', wAlt.saldo, 0);

console.log('— Woche: Regel «halbtags krank → keine Vorholzeit, füllt bis Tagessoll» —');
const wKrank = g.stdWochenAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 6, { typ: 'krank', anteil: 0.5 }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], WS, pKrankRegel);
near('Gutschrift füllt zur Lücke: Soll 38 h', wKrank.soll, 38);
near('Ist 38 h (6 h + Gutschrift 2 h → genau Tagessoll)', wKrank.ist, 38);
near('Saldo 0 — keine Überstunden am Krank-Tag', wKrank.saldo, 0);
near('Keine Überstunden', wKrank.ueberstunden, 0);
const wKrank2 = g.stdWochenAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 9, { typ: 'krank', anteil: 0.5 }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], WS, pKrankRegel);
near('9 h trotz ½ krank: 1 h gekappt', wKrank2.gekappt, 1);
near('Saldo 0 (Kappung greift)', wKrank2.saldo, 0);
near('istRoh 41 h ausgewiesen', wKrank2.istRoh, 41);

console.log('— Woche: maxTagessoll (nie über Tagessoll, Sa zählt weiter) —');
const pMax2 = g.stdParams({ maxTagessoll: true });
const wMax = g.stdWochenAuswertung([
  tag('2026-07-13', 10), tag('2026-07-14', 8), tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8),
  tag('2026-07-18', 4)
], WS, pMax2);
near('Mo auf 8 h gekappt → ist 44 h', wMax.ist, 44);
near('gekappt 2 h', wMax.gekappt, 2);
near('Samstag zählt voll (4 h, zuschlagsrelevant)', wMax.samstag, 4);
near('Überstunden nur aus Sa-Arbeit', wMax.ueberstunden, 4);

console.log('— Woche: Lehrling Berufsschule/ÜK —');
const wSchule = g.stdWochenAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 2, { typ: 'schule', anteil: 1 }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], WS, pDef);
near('Schultag + 2 h Arbeit: Saldo 0 (Default: keine Vorholzeit)', wSchule.saldo, 0);
const wSchuleFrei = g.stdWochenAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 2, { typ: 'schule', anteil: 1 }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], WS, pKrankRegel); // schule-Regeln dort deaktiviert
near('Org erlaubt Vorholzeit an Schultagen: Saldo +2 h', wSchuleFrei.saldo, 2);

console.log('— stunden-basierte Absenz (Auto-Kompensation) —');
const wAuto = g.stdWochenAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 5, { typ: 'kompensation', anteil: 1, stunden: 3, quelle: 'auto' }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], WS, pDef);
near('Soll um 3 h reduziert (37 h)', wAuto.soll, 37);
near('Saldo 0 (5 h + 3 h Kompensation = Tagessoll)', wAuto.saldo, 0);
const jAuto = g.stdJahresAuswertung([
  tag('2026-07-14', 5, { typ: 'kompensation', anteil: 1, stunden: 3, quelle: 'auto' }),
  tag('2026-03-02', 0, { typ: 'kompensation', anteil: 0.5 })
], 2026, pDef, {});
near('Jahres-Topf-A-Bezug: 3 h (stunden) + 4 h (½ Tag) = 7 h', jAuto.kompensiertH, 7);

console.log('— stdAutoKompGap —');
const pAuto = g.stdParams({ autoKompensation: true });
near('5 h gearbeitet → Lücke 3 h', g.stdAutoKompGap(tag(WS, 5), WS, pAuto), 3);
near('8 h gearbeitet → 0', g.stdAutoKompGap(tag(WS, 8), WS, pAuto), 0);
near('Ohne Einträge → 0 (reine Absenz-Tage unangetastet)', g.stdAutoKompGap(tag(WS, 0), WS, pAuto), 0);
near('Manuelle Absenz blockiert Auto-Komp', g.stdAutoKompGap(tag(WS, 5, { typ: 'ferien', anteil: 0.5 }), WS, pAuto), 0);
near('Eigene Auto-Absenz wird nachgeführt (Lücke neu 3 h)', g.stdAutoKompGap(tag(WS, 5, { typ: 'kompensation', anteil: 1, stunden: 2, quelle: 'auto' }), WS, pAuto), 3);
near('Samstag → 0', g.stdAutoKompGap(tag('2026-07-18', 5), '2026-07-18', pAuto), 0);
near('Einstellung aus → 0', g.stdAutoKompGap(tag(WS, 5), WS, pDef), 0);

console.log('— Feiertags-Generator —');
eq('Ostern 2024', g.stdOstern(2024), '2024-03-31');
eq('Ostern 2025', g.stdOstern(2025), '2025-04-20');
eq('Ostern 2026', g.stdOstern(2026), '2026-04-05');
eq('Ostern 2027', g.stdOstern(2027), '2027-03-28');
const ft26 = g.stdFeiertageJahr(2026, null);
eq('Default-Auswahl 2026 (NW-CH, 9 Feiertage)', ft26,
  ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-08-01', '2026-12-25', '2026-12-26']);
t('Liste sortiert', ft26.every((d, i) => i === 0 || ft26[i - 1] <= d));
eq('Nur Auffahrt', g.stdFeiertageJahr(2026, ['auffahrt']), ['2026-05-14']);
eq('Fronleichnam 2026 (Ostern +60)', g.stdFeiertageJahr(2026, ['fronleichnam']), ['2026-06-04']);
eq('Ungültiges Jahr → leer', g.stdFeiertageJahr('abc', null), []);
t('Jede Definition hat id + Name', g.STD_FEIERTAG_DEFS.every(d => d.id && d.n && (d.fix || typeof d.ostern === 'number')));

console.log('— Kontroll-Indikatoren —');
const pIndAll = g.stdParams({ indikatoren: { maxH: 50, maxPct: 120, minH: 35, minPct: 80 } });
const indHoch = g.stdIndikatoren({ ist: 52, soll: 40 }, pIndAll);
eq('52 h / 40 h Soll → max_h + max_pct (beide rot)', indHoch.map(i => i.typ + ':' + i.stufe), ['max_h:rot', 'max_pct:rot']);
const indTief = g.stdIndikatoren({ ist: 30, soll: 40 }, pIndAll);
eq('30 h / 40 h Soll → min_h + min_pct (amber)', indTief.map(i => i.typ + ':' + i.stufe), ['min_h:amber', 'min_pct:amber']);
eq('Normale Woche → keine Indikatoren', g.stdIndikatoren({ ist: 41, soll: 40 }, pIndAll), []);
eq('Alles aus → keine Indikatoren', g.stdIndikatoren({ ist: 80, soll: 40 }, pDef), []);
t('Indikator-Text nennt Grenze', indHoch[0].text.includes('50.00'));

console.log('— Monatsauswertung: Kappung + Abzug regel-aware —');
const mKrank = g.stdMonatsAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 6, { typ: 'krank', anteil: 0.5 }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], 2026, 7, pKrankRegel);
near('Monat: Ist 38 h (Kappung)', mKrank.ist, 38);
t('Monat: istRoh + gekappt vorhanden', typeof mKrank.istRoh === 'number' && typeof mKrank.gekappt === 'number');
// Juli 2026: 23 Werktage × 8 h = 184 h Soll − 2 h Gutschrift
near('Monatssoll 184 − 2 = 182 h', mKrank.soll, 182);

console.log('— Eigene (Admin-definierte) Absenz-Typen —');
const pEigen = g.stdParams({ eigeneAbsenzen: [
  { id: 'ea_arzt', name: 'Arzttermin', ic: '🩺', fuelltAuf: true, keineVorholzeit: true, beantragbar: true, nurUserIds: null },
  { id: 'ea_schulung', name: 'Interne Schulung', fuelltAuf: 'true', keineVorholzeit: false, nurUserIds: ['u_a', 'u_b'] },
  { id: '', name: 'ohne id → verworfen' }, null, 'müll', { id: 'ea_x' /* ohne Name → verworfen */ }
] });
eq('Normalisierung: 2 gültige Typen bleiben', pEigen.eigeneAbsenzen.map(e => e.id), ['ea_arzt', 'ea_schulung']);
t('Icon-Fallback 📌 + String-Boolean gecoerced', pEigen.eigeneAbsenzen[1].ic === '📌' && pEigen.eigeneAbsenzen[1].fuelltAuf === true);
t('nurUserIds leer/null → alle', pEigen.eigeneAbsenzen[0].nurUserIds === null);
eq('stdEigeneAbsenz findet Typ', g.stdEigeneAbsenz(pEigen, 'ea_arzt').name, 'Arzttermin');
t('stdEigeneAbsenz unbekannt → null', g.stdEigeneAbsenz(pEigen, 'ea_nix') === null);
eq('Sichtbar für alle: ea_arzt', g.stdEigeneAbsenzenFuer(pEigen, 'u_z').map(e => e.id), ['ea_arzt']);
eq('Sichtbar für u_a: beide', g.stdEigeneAbsenzenFuer(pEigen, 'u_a').map(e => e.id), ['ea_arzt', 'ea_schulung']);
eq('stdAbsenzDef built-in', g.stdAbsenzDef(pEigen, 'ferien').n, 'Ferien');
eq('stdAbsenzDef eigener Typ', g.stdAbsenzDef(pEigen, 'ea_arzt'), { n: 'Arzttermin', ic: '🩺', cls: 'b-vio' });
eq('stdAbsenzDef gelöschter Typ → Altdaten-Fallback', g.stdAbsenzDef(pEigen, 'ea_geloescht').ic, '📌');
eq('Regel aus eigener Definition (fuelltAuf+kv)', g.stdAbsenzRegel(pEigen, 'ea_arzt'), { fuelltAuf: true, keineVorholzeit: true });
eq('Regel eigener Typ ohne kv', g.stdAbsenzRegel(pEigen, 'ea_schulung'), { fuelltAuf: true, keineVorholzeit: false });
const wEigen = g.stdWochenAuswertung([
  tag('2026-07-13', 8), tag('2026-07-14', 2, { typ: 'ea_arzt', anteil: 1 }),
  tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8)
], WS, pEigen);
near('Woche mit eigenem Typ (füllt+kv): Saldo 0', wEigen.saldo, 0);
near('Gutschrift = Lücke zum Tagessoll (8−2=6 h → Soll 34 h)', wEigen.soll, 34);

console.log('— Jahres-Limits (stdAbsenzLimit / stdAbsenzBezogen) —');
const pLim = g.stdParams({
  eigeneAbsenzen: [{ id: 'ea_pflege', name: 'Pflege Angehörige', maxTageProJahr: 3 }],
  absenzRegeln: { militaer: { maxTageProJahr: 10 }, ferien: { maxTageProJahr: 99 } }
});
near('Limit eigener Typ: 3 Tage/Jahr', g.stdAbsenzLimit(pLim, 'ea_pflege'), 3);
near('Limit Built-in via Regel: Militär 10', g.stdAbsenzLimit(pLim, 'militaer'), 10);
t('Ferien ausgenommen (Feriensaldo) → null trotz Eintrag', g.stdAbsenzLimit(pLim, 'ferien') === null);
t('Kompensation/Brückentag ausgenommen (eigene Konten)', g.stdAbsenzLimit(pLim, 'kompensation') === null && g.stdAbsenzLimit(pLim, 'brueckentag') === null);
t('Ohne Eintrag → null', g.stdAbsenzLimit(pLim, 'krank') === null);
t('maxTageProJahr 0 → null (normalisiert)', g.stdParams({ eigeneAbsenzen: [{ id: 'ea_x', name: 'X', maxTageProJahr: 0 }] }).eigeneAbsenzen[0].maxTageProJahr === null);
const bezTage = [
  tag('2026-02-02', 0, { typ: 'ea_pflege', anteil: 1 }),
  tag('2026-02-03', 0, { typ: 'ea_pflege', anteil: 0.5 }),
  tag('2025-12-30', 0, { typ: 'ea_pflege', anteil: 1 }),             // anderes Jahr
  tag('2026-02-04', 0, { typ: 'krank', anteil: 1 }),                 // anderer Typ
  tag('2026-02-05', 5, { typ: 'ea_pflege', anteil: 1, stunden: 4 })  // stunden-basiert: 4 h / 8 h = 0.5 Tage
];
near('Bezogen 2026: 1 + ½ + ½ (stunden) = 2 Tage', g.stdAbsenzBezogen(bezTage, 'ea_pflege', 2026, pLim), 2);
near('Bezogen 2025: 1 Tag (Jahres-Filter)', g.stdAbsenzBezogen(bezTage, 'ea_pflege', 2025, pLim), 1);

console.log('— Auswertungen: Jahr / Absenzen / Projekte —');
{
  const jt = [
    tag('2026-07-13', 8), tag('2026-07-14', 8), tag('2026-07-15', 8), tag('2026-07-16', 8), tag('2026-07-17', 8), // KW29: 40/40
    tag('2026-08-03', 10),                                                                                        // Aug: 10 h
    tag('2026-08-04', 0, { typ: 'krank', anteil: 0.5 })
  ];
  const mon = g.stdJahresMonatswerte(jt, 2026, pDef);
  t('12 Monatswerte', mon.length === 12);
  t('Monate ohne Erfassung: hatDaten=false (Jan)', mon[0].hatDaten === false && mon[0].soll === 0);
  near('Juli: Ist 40 / Soll 168 (voller Monat)', mon[6].ist, 40);
  near('Juli-Soll = Monatssoll (23 Werktage × 8)', mon[6].soll, 184);
  near('August: Absenz-Tage 0.5', mon[7].absenzTage, 0.5);
  near('kum. Saldo läuft nur über Daten-Monate', mon[11].kumSaldo, mon[6].saldo + mon[7].saldo);
  const apt = g.stdAbsenzTageProTyp([
    tag('2026-03-02', 0, { typ: 'ferien', anteil: 1 }),
    tag('2026-03-03', 0, { typ: 'ferien', anteil: 0.5 }),
    tag('2026-03-04', 5, { typ: 'kompensation', anteil: 1, stunden: 3, quelle: 'auto' }),
    tag('2025-03-04', 0, { typ: 'ferien', anteil: 1 })
  ], 2026, pDef);
  near('Absenz-Matrix: Ferien 1.5 Tage', apt.ferien, 1.5);
  near('Absenz-Matrix: stunden-basierte Kompensation 3/8 Tage', apt.kompensation, 0.375);
  t('Anderes Jahr ausgefiltert', Object.keys(apt).length === 2);
  const pj = g.stdProjektStunden([
    { userName: 'A', eintraege: [ { von: '07:00', bis: '12:00', pauseMin: 0, objektId: 'o1', objektName: 'MFH Muster' }, { von: '13:00', bis: '17:00', pauseMin: 0 } ] },
    { userName: 'B', eintraege: [ { von: '07:00', bis: '15:00', pauseMin: 60, objektId: 'o1', objektName: 'MFH Muster' } ] }
  ]);
  t('Projekte sortiert nach Stunden (o1 zuerst)', pj[0].objektId === 'o1' && pj.length === 2);
  near('o1: 5 h (A) + 7 h (B) = 12 h', pj[0].stunden, 12);
  near('Ohne-Projekt-Sammler: 4 h', pj[1].stunden, 4);
  t('Ohne-Projekt-Name gesetzt', pj[1].name === 'Ohne Projekt' && pj[1].objektId === '');
  near('User-Split am Projekt', pj[0].users.B, 7);
}

console.log('— Pensum-Skalierung bleibt kompatibel —');
const p80 = g.stdParamsFuerMitarbeiter(pDef, { pensum: 80 });
near('80 %: Tagessoll 6.4 h', g.stdTagSollH(p80), 6.4);
near('80 %: ½ krank Abzug 3.2 h', g.stdTagAbzugH(tag(WS, 0, { typ: 'krank', anteil: 0.5 }), p80), 3.2);
t('kmAktiv wandert durch die Pensum-Skalierung', p80.kmAktiv === true);

console.log('');
if (fail) { console.error('✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen'); process.exit(1); }
console.log('✓ Alle ' + n + ' Checks bestanden');
