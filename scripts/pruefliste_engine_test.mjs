// Node-Test der DOM-freien Prüflisten-Engine (pm_pruefliste.html /*ENGINE-START*/-Block)
// Antworttypen + Auto-Bewertung, Bewertungs-Zusammenzug, Duplikat-/Ähnlichkeits-
// erkennung, effektive Prüfpunktliste (global+org+objekt-Merge inkl. Overrides),
// Default-Katalog (stabile ids). Aufruf: node scripts/pruefliste_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../pm_pruefliste.html', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const g = {};
new Function('window', m[1])(g);
const E = g._prEngine;
if (!E) { console.error('window._prEngine wurde nicht gesetzt'); process.exit(1); }

let n = 0, fail = 0;
function t(name, cond) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } }
function eq(name, a, b) { t(name + ' (' + JSON.stringify(a) + ' = ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b)); }

console.log('— Antworttypen —');
t('6 Antworttypen', Object.keys(E.PR_ANTWORTTYPEN).length === 6);
eq('Default = ja_nein_nb', E.PR_ANTWORTTYP_DEFAULT, 'ja_nein_nb');
t('ja_nein_nb hat 3 Optionen', E.PR_ANTWORTTYPEN.ja_nein_nb.optionen.length === 3);
t('zahl kind=zahl', E.PR_ANTWORTTYPEN.zahl.kind === 'zahl');
t('text kind=text', E.PR_ANTWORTTYPEN.text.kind === 'text');
t('zustand hat 4 Optionen', E.PR_ANTWORTTYPEN.zustand.optionen.length === 4);

console.log('— Auto-Bewertung (item 3 Beispiel: Nein → schlecht) —');
eq('ja → gut', E.prAutoBewertung('ja_nein_nb', 'ja'), 'gut');
eq('nein → schlecht', E.prAutoBewertung('ja_nein_nb', 'nein'), 'schlecht');
eq('nb → nicht_bewertet', E.prAutoBewertung('ja_nein_nb', 'nb'), 'nicht_bewertet');
eq('vorhanden → gut', E.prAutoBewertung('vorhanden_nb', 'vorhanden'), 'gut');
eq('nicht_vorhanden → schlecht', E.prAutoBewertung('vorhanden_nb', 'nicht_vorhanden'), 'schlecht');
eq('zustand maessig → maessig', E.prAutoBewertung('zustand', 'maessig'), 'maessig');
eq('auffaellig vorhanden → schlecht', E.prAutoBewertung('auffaellig', 'vorhanden'), 'schlecht');
eq('unbekannte Antwort → nicht_bewertet', E.prAutoBewertung('ja_nein_nb', 'xxx'), 'nicht_bewertet');
eq('zahl-Typ ohne Optionen → nicht_bewertet', E.prAutoBewertung('zahl', '42'), 'nicht_bewertet');

console.log('— Antwort-Labels (Bericht) —');
eq('nein → Nein', E.prAntwortLabel('ja_nein_nb', 'nein'), 'Nein');
eq('nicht_vorhanden → nicht vorhanden', E.prAntwortLabel('vorhanden_nb', 'nicht_vorhanden'), 'nicht vorhanden');
eq('zahl 42 → 42', E.prAntwortLabel('zahl', '42'), '42');
eq('text frei → frei', E.prAntwortLabel('text', 'frei'), 'frei');
eq('leer → leer-String', E.prAntwortLabel('zahl', null), '');

console.log('— prIstNegativ —');
t('schlecht negativ', E.prIstNegativ('schlecht'));
t('maessig negativ', E.prIstNegativ('maessig'));
t('gut nicht negativ', !E.prIstNegativ('gut'));

console.log('— Bewertungs-Zusammenzug —');
const z1 = E.prBegehungBewertung([
  { antwort: 'ja', bewertung: 'gut' },
  { antwort: 'nein', bewertung: 'schlecht' },
  { antwort: 'maessig', bewertung: 'maessig' },
  { antwort: null, bewertung: 'nicht_bewertet' },
  { antwort: '', bewertung: 'nicht_bewertet' }
]);
eq('total 5', z1.total, 5);
eq('gut 1', z1.gut, 1);
eq('schlecht 1', z1.schlecht, 1);
eq('maessig 1', z1.maessig, 1);
eq('offen 2 (null + leer)', z1.offen, 2);
eq('gesamt = schlecht (schlecht>0 dominiert)', z1.gesamt, 'schlecht');
eq('gesamt maessig ohne schlecht', E.prBegehungBewertung([{ antwort: 'x', bewertung: 'maessig' }, { antwort: 'y', bewertung: 'gut' }]).gesamt, 'maessig');
eq('gesamt gut', E.prBegehungBewertung([{ antwort: 'x', bewertung: 'gut' }]).gesamt, 'gut');
eq('gesamt nicht_bewertet (nur offen)', E.prBegehungBewertung([{ antwort: null }]).gesamt, 'nicht_bewertet');
eq('leere Liste total 0', E.prBegehungBewertung([]).total, 0);

console.log('— Normalisierung + Ähnlichkeit (Duplikat, item 6) —');
eq('Umlaute → ae/oe/ue', E.prNorm('Prüfung Öl Ärger'), 'pruefung oel aerger');
t('identisch = 1', E.prAehnlichkeit('Pendelgasleitung vorhanden?', 'Pendelgasleitung vorhanden?') === 1);
t('sehr ähnlich ≥ 0.6', E.prAehnlichkeit('Pendelgasleitung vorhanden', 'Pendelgasleitung vorhanden?') >= 0.6);
t('unähnlich < 0.6', E.prAehnlichkeit('Filter sauber', 'Fluchtwege frei') < 0.6);
t('Teilstring-Bonus', E.prAehnlichkeit('Absperrung', 'Absperrung Gaszufuhr zugänglich') >= 0.25);

console.log('— prFindeAehnliche —');
const pool = [
  { id: 'a', bezeichnung: 'Pendelgasleitung vorhanden?', anlagenart: 'gas' },
  { id: 'b', bezeichnung: 'Fluchtwege frei?', anlagenart: 'brandschutz' },
  { id: 'c', bezeichnung: 'Pendel Gasleitung vorhanden', anlagenart: 'gas' }
];
const hits = E.prFindeAehnliche('Pendelgasleitung vorhanden?', 'gas', pool, 0.6);
t('mindestens 1 Treffer', hits.length >= 1);
eq('bester Treffer = a', hits[0].punkt.id, 'a');
t('Fluchtwege nicht als Treffer', !hits.some(h => h.punkt.id === 'b'));

console.log('— Default-Katalog —');
const defs = E.prDefaultRecords();
t('mind. 20 Default-Punkte', defs.length >= 20);
t('stabile ids prstd_def_0', defs[0].id === 'prstd_def_0');
t('alle global scope', defs.every(d => d.scope === 'global'));
t('alle aktiv + status aktiv', defs.every(d => d.aktiv === true && d.status === 'aktiv'));
t('Pendelgasleitung enthalten', defs.some(d => /Pendelgasleitung/.test(d.bezeichnung)));
t('Pflicht-Flag existiert (Sicherheitsventil)', defs.some(d => d.pflicht === true));

console.log('— Effektive Prüfpunktliste (global + org + objekt Merge) —');
const glob = [
  { id: 'g1', scope: 'global', bezeichnung: 'Absperrung vorhanden?', anlagenart: 'gas', untergruppe: '', aktiv: true, status: 'aktiv', reihenfolge: 10 },
  { id: 'g2', scope: 'global', bezeichnung: 'Korrosion?', anlagenart: 'gas', untergruppe: '', aktiv: true, status: 'aktiv', reihenfolge: 20 },
  { id: 'g3', scope: 'global', bezeichnung: 'Inaktiv-Punkt', anlagenart: 'gas', untergruppe: '', aktiv: false, status: 'aktiv', reihenfolge: 5 }
];
const orgP = [
  { id: 'o1', scope: 'org', orgId: 'X', bezeichnung: 'Absperrung vorhanden?', anlagenart: 'gas', untergruppe: '', aktiv: true, status: 'aktiv', reihenfolge: 1 },
  { id: 'o2', scope: 'org', orgId: 'X', bezeichnung: 'Firmen-Spezialpunkt', anlagenart: 'gas', untergruppe: '', aktiv: true, status: 'aktiv', reihenfolge: 15 }
];
const objP = [
  { id: 'j1', bezeichnung: 'Spezielle Pumpensteuerung prüfen', anlagenart: 'gas', objektId: 'OBJ1', aktiv: true, status: 'aktiv', reihenfolge: 30 }
];
const eff = E.prEffektivePunkte('gas', { global: glob, org: orgP, objekt: objP, overrides: {}, objektId: 'OBJ1' });
t('Inaktiver globaler Punkt fehlt', !eff.some(p => p.id === 'g3'));
t('Objekt-Punkt enthalten', eff.some(p => p.bezeichnung === 'Spezielle Pumpensteuerung prüfen' && p.quelle === 'objekt'));
t('Org gewinnt bei Namensgleichheit (o1 statt g1)', eff.some(p => p.id === 'o1') && !eff.some(p => p.id === 'g1'));
t('Korrosion (global, ohne org-Pendant) enthalten', eff.some(p => p.id === 'g2' && p.quelle === 'global'));
t('Firmen-Spezialpunkt enthalten', eff.some(p => p.id === 'o2' && p.quelle === 'org'));
// Sortierung nach reihenfolge
const rf = eff.map(p => p.reihenfolge);
t('nach Reihenfolge sortiert', rf.slice().sort((a, b) => a - b).join(',') === rf.join(','));
// Overrides blenden globalen Punkt aus
const eff2 = E.prEffektivePunkte('gas', { global: glob, org: [], objekt: [], overrides: { g2: { aktiv: false } }, objektId: 'OBJ1' });
t('Override blendet g2 aus', !eff2.some(p => p.id === 'g2'));
// Vorschlag-Status wird nicht geladen
const eff3 = E.prEffektivePunkte('gas', { global: [{ id: 'v1', bezeichnung: 'Vorschlag', anlagenart: 'gas', status: 'vorschlag', aktiv: true }], org: [], objekt: [], overrides: {}, objektId: '' });
t('Vorschlag-Status nicht in effektiver Liste', eff3.length === 0);
// falsche Anlagenart wird gefiltert
const eff4 = E.prEffektivePunkte('heizung', { global: glob, org: orgP, objekt: objP, overrides: {}, objektId: 'OBJ1' });
t('andere Anlagenart → leer', eff4.length === 0);

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + n + ' fehlgeschlagen') : ('✓ Alle ' + n + ' Checks bestanden')));
process.exit(fail ? 1 : 0);
