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
// Feedback 28.07.2026: + sichtbar_nb + geruch
t('8 Antworttypen', Object.keys(E.PR_ANTWORTTYPEN).length === 8);
t('Antworttyp «sichtbar / nicht sichtbar / k.A.»', !!E.PR_ANTWORTTYPEN.sichtbar_nb);
t('Antworttyp «Geruchsemission» mit Prüfart', !!(E.PR_ANTWORTTYPEN.geruch && E.PR_ANTWORTTYPEN.geruch.pruefart));
t('«nicht sichtbar» → Zustand entfällt', E.prZustandEntfaellt({antworttyp:'sichtbar_nb',antwort:'nicht_sichtbar'}));
t('«k.A.» → Zustand entfällt', E.prZustandEntfaellt({antworttyp:'sichtbar_nb',antwort:'ka'}));
t('«nicht beurteilbar» → Zustand entfällt', E.prZustandEntfaellt({antworttyp:'ja_nein_nb',antwort:'nb'}));
t('«ja» → Zustand entfällt NICHT', !E.prZustandEntfaellt({antworttyp:'ja_nein_nb',antwort:'ja'}));
t('5 Arten (Begehung/Kontrolle/Zustandsanalyse/Einschätzung/eigene)', E.PR_ARTEN.length === 5);
t('«frei» = eigene Bezeichnung', E.PR_ARTEN.some(a => a.id === 'frei'));
t('prArtLabel nimmt den Freitext', E.prArtLabel('frei', 'Zustandsaufnahme vor Umbau') === 'Zustandsaufnahme vor Umbau');
t('prArtLabel ohne Freitext faellt auf das Label zurueck', /Bezeichnung|Begehung/.test(E.prArtLabel('frei', '')));
t('prArtLabel fällt auf Begehung zurück', E.prArtLabel('') === 'Begehung' && E.prArtLabel('kontrolle') === 'Kontrolle');
t('6 Nutzungen', E.PR_NUTZUNGEN.length === 6);
t('prNutzungenText mit Freitext', E.prNutzungenText({nutzungen:['wohnungen','andere'],nutzungFrei:'Arztpraxis'}) === 'Wohnungen · Arztpraxis');
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
// «nicht vorhanden» ist KEIN Mangel: Zustand entfällt (grau) statt schlecht (User-Entscheid 07/2026)
eq('nicht_vorhanden → nicht_bewertet (entfällt)', E.prAutoBewertung('vorhanden_nb', 'nicht_vorhanden'), 'nicht_bewertet');
t('prZustandEntfaellt: vorhanden_nb + nicht_vorhanden', E.prZustandEntfaellt({ antworttyp: 'vorhanden_nb', antwort: 'nicht_vorhanden' }));
t('prZustandEntfaellt: vorhanden_nb + vorhanden → false', !E.prZustandEntfaellt({ antworttyp: 'vorhanden_nb', antwort: 'vorhanden' }));
t('prZustandEntfaellt: ja_nein_nb + nein → false', !E.prZustandEntfaellt({ antworttyp: 'ja_nein_nb', antwort: 'nein' }));
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
// nicht_vorhanden zählt NIE als schlecht — auch Altdaten mit gespeicherter
// Bewertung «schlecht» werden in der Aggregation neutralisiert; seit dem
// Prüfbericht-Feedback 30.07.2026 zählen sie als eigene Kategorie «entfaellt»
const zNv = E.prBegehungBewertung([
  { antwort: 'nicht_vorhanden', antworttyp: 'vorhanden_nb', bewertung: 'schlecht' },
  { antwort: 'vorhanden', antworttyp: 'vorhanden_nb', bewertung: 'gut' }
]);
eq('nicht_vorhanden (Altdaten schlecht) → nicht schlecht', zNv.schlecht, 0);
eq('nicht_vorhanden zählt als entfaellt', zNv.entfaellt, 1);
eq('gesamt bleibt gut trotz nicht_vorhanden', zNv.gesamt, 'gut');

console.log('— KPI-Zahlen gehen IMMER auf (Prüfbericht-Feedback 30.07.2026) —');
// Bericht 1 (BEG-2026-011): 7 Punkte — Anzeige zeigte nur 4 («die Zahlen stimmen nicht»)
const zB1 = E.prBegehungBewertung([
  { antwort: 'keine', antworttyp: 'geruch' },                                   // beantwortet, Zustand offen
  { antwort: 'vorhanden', antworttyp: 'vorhanden_nb', bewertung: 'gut' },       // Fettabscheider
  { antwort: null, antworttyp: 'zahl' },                                        // Hausanschluss offen
  { antwort: 'nicht_vorhanden', antworttyp: 'vorhanden_nb' },                   // Hebeanlage → entfällt
  { antwort: 'nb', antworttyp: 'vorhanden_nb' },                                // Rückstauklappe → entfällt
  { antwort: 'vorhanden', antworttyp: 'vorhanden_nb', bewertung: 'gut' },       // Schlammsammler
  { antwort: null, antworttyp: 'auffaellig' }                                   // Grundleitung offen
]);
eq('B1: gut 2', zB1.gut, 2);
eq('B1: entfällt 2', zB1.entfaellt, 2);
eq('B1: offen 2', zB1.offen, 2);
eq('B1: nicht bewertet 1 (beantwortet ohne Zustand)', zB1.nicht_bewertet, 1);
t('B1: Invariante gut+mässig+schlecht+entfällt+nicht_bewertet+offen = total',
  zB1.gut + zB1.maessig + zB1.schlecht + zB1.entfaellt + zB1.nicht_bewertet + zB1.offen === zB1.total);
// Bericht 2 (BEG-2026-012): Zustand OHNE Antwort (Hausanschluss «schlecht» bei
// leerer Antwort) wurde früher als «offen» verschluckt — der Zustand zählt.
const zB2 = E.prBegehungBewertung([{ antwort: null, antworttyp: 'zahl', bewertung: 'schlecht' }]);
eq('B2: Zustand ohne Antwort zählt beim Zustand', zB2.schlecht, 1);
eq('B2: … und nicht als offen', zB2.offen, 0);
eq('B2: gesamt schlecht', zB2.gesamt, 'schlecht');

console.log('— «nicht beurteilbar» bei auffaellig + zahl/text (30.07.2026) —');
t('auffaellig hat 3 Optionen (nb ergänzt)', E.PR_ANTWORTTYPEN.auffaellig.optionen.length === 3);
eq('auffaellig nb → nicht_bewertet', E.prAutoBewertung('auffaellig', 'nb'), 'nicht_bewertet');
t('auffaellig nb → Zustand entfällt', E.prZustandEntfaellt({ antworttyp: 'auffaellig', antwort: 'nb' }));
t('auffaellig-Bestand unangetastet (keine/vorhanden zuerst)',
  E.PR_ANTWORTTYPEN.auffaellig.optionen[0].v === 'keine' && E.PR_ANTWORTTYPEN.auffaellig.optionen[1].v === 'vorhanden');
eq('zahl nb → Label «nicht beurteilbar»', E.prAntwortLabel('zahl', 'nb'), 'nicht beurteilbar');
eq('text nb → Label «nicht beurteilbar»', E.prAntwortLabel('text', 'nb'), 'nicht beurteilbar');
t('zahl nb → Zustand entfällt', E.prZustandEntfaellt({ antworttyp: 'zahl', antwort: 'nb' }));

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

console.log('— Firmen-Anpassung eines GEMA-Punkts (basisId, 31.07.2026) —');
// Org-Anpassung ersetzt das GEMA-Original per ID — auch bei UMBENENNUNG
// (Namens-Dedup allein würde dann beide zeigen)
const anpOrg = [
  { id: 'oa1', scope: 'org', orgId: 'X', basisId: 'g2', bezeichnung: 'Korrosion + Beschichtung prüfen', anlagenart: 'gas', untergruppe: '', aktiv: true, status: 'aktiv', reihenfolge: 10 }
];
const effA = E.prEffektivePunkte('gas', { global: glob, org: anpOrg, objekt: [], overrides: {}, objektId: '' });
t('Anpassung ersetzt das GEMA-Original (g2 weg)', !effA.some(p => p.id === 'g2'));
t('Anpassung selbst in der Liste (umbenannt)', effA.some(p => p.id === 'oa1' && p.bezeichnung === 'Korrosion + Beschichtung prüfen' && p.quelle === 'org'));
t('übrige GEMA-Punkte unberührt (g1 bleibt)', effA.some(p => p.id === 'g1'));
// deaktivierte Anpassung = Punkt bewusst aus → GEMA-Original kommt NICHT zurück
const anpInaktiv = [{ id: 'oa1', scope: 'org', orgId: 'X', basisId: 'g2', bezeichnung: 'Korrosion + Beschichtung prüfen', anlagenart: 'gas', aktiv: false, status: 'aktiv', reihenfolge: 10 }];
const effB = E.prEffektivePunkte('gas', { global: glob, org: anpInaktiv, objekt: [], overrides: {}, objektId: '' });
t('deaktivierte Anpassung: weder Original noch Anpassung', !effB.some(p => p.id === 'g2') && !effB.some(p => p.id === 'oa1'));
// Anpassung mit GEÄNDERTER Anlagenart unterdrückt das Original trotzdem
const anpArt = [{ id: 'oa2', scope: 'org', orgId: 'X', basisId: 'g2', bezeichnung: 'Korrosion (Heizung)', anlagenart: 'heizung', aktiv: true, status: 'aktiv', reihenfolge: 10 }];
const effC = E.prEffektivePunkte('gas', { global: glob, org: anpArt, objekt: [], overrides: {}, objektId: '' });
t('umkategorisierte Anpassung: Original in alter Anlagenart weg', !effC.some(p => p.id === 'g2'));
const effC2 = E.prEffektivePunkte('heizung', { global: glob, org: anpArt, objekt: [], overrides: {}, objektId: '' });
t('umkategorisierte Anpassung erscheint in der neuen Anlagenart', effC2.some(p => p.id === 'oa2'));
// Entfernen der Anpassung (Record weg) → GEMA-Original wieder da
const effD = E.prEffektivePunkte('gas', { global: glob, org: [], objekt: [], overrides: {}, objektId: '' });
t('ohne Anpassungs-Record: GEMA-Original wieder in der Liste', effD.some(p => p.id === 'g2'));

console.log('— prSyncPunkte: Anpassung erreicht offene Begehungen ohne Duplikat —');
const anlage = { punkte: [
  { key: 'k1', punktId: 'g2', bezeichnung: 'Gasleitungen frei von Korrosion?', untergruppe: '', antworttyp: 'auffaellig', pflicht: false, standardbewertung: 'schlecht', empfehlungVorlage: '', bauteil: false, bauteilFelder: null, antwort: null, bewertung: 'nicht_bewertet', bemerkung: '', empfehlung: '', fotos: [] }
] };
const effSync = [{ id: 'oa1', basisId: 'g2', quelle: 'org', bezeichnung: 'Korrosion + Beschichtung prüfen', untergruppe: 'Leitungen', antworttyp: 'zustand', pflicht: true, standardbewertung: 'schlecht', empfehlung: 'Neu beschichten.', bauteil: false, bauteilFelder: null }];
const resSync = E.prSyncPunkte(anlage, effSync);
t('KEIN Duplikat angehängt (Zeile via basisId gefunden)', anlage.punkte.length === 1 && resSync.neu === 0);
t('Felder der Anpassung nachgezogen', anlage.punkte[0].bezeichnung === 'Korrosion + Beschichtung prüfen' && anlage.punkte[0].pflicht === true && resSync.aktualisiert === 1);
t('Zeile behält ihre punktId (GEMA-Id)', anlage.punkte[0].punktId === 'g2');
// Neue Begehung (keine bestehende Zeile): Anpassung wird normal angehängt
const anlage2 = { punkte: [] };
const resSync2 = E.prSyncPunkte(anlage2, effSync);
t('ohne bestehende Zeile: Anpassung wird angehängt', resSync2.neu === 1 && anlage2.punkte[0].punktId === 'oa1');

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + n + ' fehlgeschlagen') : ('✓ Alle ' + n + ' Checks bestanden')));
process.exit(fail ? 1 : 0);
