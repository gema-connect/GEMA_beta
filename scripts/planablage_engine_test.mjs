#!/usr/bin/env node
/* Planablage — Engine-Test (Node, ohne Browser)
 * Prüft den /*ENGINE-START*​/-Block aus pm_planablage.html:
 *   pabNormMail, pabKannLesen, pabKannBearbeiten, pabPendUebergang, pabFmtSize
 * Ausführen: node scripts/planablage_engine_test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'pm_planablage.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const g = {};
new Function(m[1])();          // ENGINE hängt an globalThis (kein window in Node)
const { pabNormMail, pabKannLesen, pabKannBearbeiten, pabPendUebergang, pabFmtSize,
        PAB_LAYER, pabLayerById, pabGewerkVonText, pabLayerSicht, pabShapeFarbe } = globalThis;

let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}
function eq(a, b, label) { ok(Object.is(a, b), label + ' (' + JSON.stringify(a) + ' == ' + JSON.stringify(b) + ')'); }

console.log('■ pabNormMail');
eq(pabNormMail('  Hans.Muster@Firma.CH '), 'hans.muster@firma.ch', 'trim + lowercase');
eq(pabNormMail(null), '', 'null → leer');
eq(pabNormMail(undefined), '', 'undefined → leer');

console.log('■ pabKannLesen');
const dok = { id: 'd1', orgId: 'org_a', freigaben: [
  { email: 'Extern@Partner.ch', recht: 'lesen' },
  { email: 'chef@partner.ch', recht: 'bearbeiten' }
] };
const uEigen  = { id: 'u1', orgId: 'org_a', profile: { email: 'ich@firma.ch' } };
const uExtern = { id: 'u2', orgId: 'org_b', profile: { email: 'extern@partner.ch' } };
const uChef   = { id: 'u3', orgId: 'org_b', profile: { email: 'chef@partner.ch' } };
const uFremd  = { id: 'u4', orgId: 'org_b', profile: { email: 'niemand@anders.ch' } };
const uUser   = { id: 'u5', orgId: 'org_b', username: 'EXTERN@partner.ch' };   // E-Mail nur im username

eq(pabKannLesen(dok, uEigen, true),  true,  'eigene Org + modulRead → lesen');
eq(pabKannLesen(dok, uEigen, false), false, 'eigene Org OHNE modulRead → kein Zugriff');
eq(pabKannLesen(dok, uExtern, true),  true, 'fremde Org, Freigabe «lesen» (case-insensitive) → lesen');
eq(pabKannLesen(dok, uChef, false),  true,  'fremde Org, Freigabe «bearbeiten» → lesen impliziert (modulRead egal)');
eq(pabKannLesen(dok, uFremd, true), false,  'fremde Org ohne Freigabe → kein Zugriff');
eq(pabKannLesen(dok, uUser, false),  true,  'E-Mail-Match über username-Fallback');
eq(pabKannLesen({ id: 'd2', orgId: 'org_a' }, uExtern, true), false, 'Dokument ohne freigaben-Array → extern kein Zugriff');
eq(pabKannLesen(null, uEigen, true), false, 'null-Dokument → false');
eq(pabKannLesen(dok, null, true),   false,  'null-User → false');
eq(pabKannLesen(dok, { id: 'u9', orgId: 'org_b' }, true), false, 'User ohne E-Mail/username → false');

console.log('■ pabKannBearbeiten');
eq(pabKannBearbeiten(dok, uEigen, true),  true,  'eigene Org + modulWrite → bearbeiten');
eq(pabKannBearbeiten(dok, uEigen, false), false, 'eigene Org ohne write (z.B. Monteur) → nein');
eq(pabKannBearbeiten(dok, uExtern, true), false, 'externe Freigabe nur «lesen» → NICHT bearbeiten (auch mit eigenem write)');
eq(pabKannBearbeiten(dok, uChef, false),  true,  'externe Freigabe «bearbeiten» → bearbeiten (modulWrite egal)');
eq(pabKannBearbeiten(dok, uFremd, true), false,  'fremde Org ohne Freigabe → nein');
eq(pabKannBearbeiten(null, uEigen, true), false, 'null-Dokument → false');

console.log('■ pabPendUebergang (Statusmaschine)');
eq(pabPendUebergang('offen', 'erledigen'), 'erledigt', 'offen —erledigen→ erledigt');
eq(pabPendUebergang(undefined, 'erledigen'), 'erledigt', 'fehlender Status zählt als offen');
eq(pabPendUebergang('erledigt', 'pruefen'), 'geprueft', 'erledigt —pruefen→ geprueft');
eq(pabPendUebergang('erledigt', 'zurueckweisen'), 'offen', 'erledigt —zurueckweisen→ offen');
eq(pabPendUebergang('geprueft', 'zurueckweisen'), 'offen', 'geprueft —zurueckweisen→ offen (Fehlklick-Korrektur)');
eq(pabPendUebergang('offen', 'pruefen'), null, 'offen kann nicht direkt geprüft werden');
eq(pabPendUebergang('erledigt', 'erledigen'), null, 'doppelt erledigen → ungültig');
eq(pabPendUebergang('geprueft', 'pruefen'), null, 'geprueft nochmals prüfen → ungültig');
eq(pabPendUebergang('offen', 'zurueckweisen'), null, 'offen zurückweisen → ungültig');
eq(pabPendUebergang('offen', 'quatsch'), null, 'unbekannte Aktion → null');

console.log('■ Gewerk-Layer (PAB_LAYER / pabLayerById / pabGewerkVonText)');
ok(PAB_LAYER.length === 7, '7 feste Gewerk-Layer (inkl. Klima + Spenglerei)');
ok(new Set(PAB_LAYER.map(l => l.farbe)).size === 7, 'alle Layer-Farben eindeutig');
// Standardfarben (User-Vorgabe): Sanitär grün, Heizung rot, Lüftung blau,
// Klima violett, Elektro amber, Allgemein grau
eq(pabLayerById('sanitaer').farbe, '#16a34a', 'Sanitär = grün');
eq(pabLayerById('heizung').farbe, '#dc2626', 'Heizung = rot');
eq(pabLayerById('lueftung').farbe, '#2563eb', 'Lüftung = blau');
eq(pabLayerById('klima').farbe, '#7c3aed', 'Klima = violett');
eq(pabLayerById('elektro').farbe, '#d97706', 'Elektro = amber');
eq(pabLayerById('allgemein').farbe, '#475569', 'Allgemein = grau');
eq(pabLayerById('elektro').label, 'Elektro', 'Lookup nach id');
eq(pabLayerById('gibtsnicht').id, 'allgemein', 'unbekannte id → allgemein (Altdaten-Fallback)');
eq(pabLayerById(undefined).id, 'allgemein', 'fehlendes layer-Feld → allgemein');
eq(pabGewerkVonText('Sanitärplaner'), 'sanitaer', 'Org-Kategorie sanitaerplaner');
eq(pabGewerkVonText('heizungsinstallateur'), 'heizung', 'Kategorie heizungsinstallateur');
eq(pabGewerkVonText('Lüftung / Klima AG'), 'lueftung', 'Freitext Lüftung (Lüftung gewinnt vor Klima)');
eq(pabGewerkVonText('Kälte & Klima GmbH'), 'klima', 'Freitext Klima/Kälte → klima');
eq(pabGewerkVonText('Elektro Muster GmbH'), 'elektro', 'Beteiligten-Firma Elektro');
eq(pabGewerkVonText('Spenglerei & Bedachungen'), 'spenglerei', 'Spenglerei-Text');
eq(pabGewerkVonText('Architekturbüro XY'), 'allgemein', 'kein Treffer → allgemein');

console.log('■ pabLayerSicht (wer sieht welche Layer)');
const dokL = { id: 'dl', orgId: 'org_a', freigaben: [
  { email: 'elektriker@firma.ch', recht: 'bearbeiten', gewerk: 'elektro' },
  { email: 'architekt@gp.ch', recht: 'lesen', gewerk: 'allgemein', layers: 'alle' },
  { email: 'bauleiter@gp.ch', recht: 'lesen', gewerk: 'heizung', layers: ['sanitaer', 'lueftung'] },
  { email: 'alt@partner.ch', recht: 'lesen' }
] };
const uOwner = { id: 'o1', orgId: 'org_a', profile: { email: 'pl@firma.ch' } };
const uElektro = { id: 'e1', orgId: 'org_x', profile: { email: 'elektriker@firma.ch' } };
const uArch = { id: 'a1', orgId: 'org_y', profile: { email: 'architekt@gp.ch' } };
const uBL = { id: 'b1', orgId: 'org_z', profile: { email: 'bauleiter@gp.ch' } };
const uAlt = { id: 'x1', orgId: 'org_z', profile: { email: 'alt@partner.ch' } };
const uNix = { id: 'n1', orgId: 'org_z', profile: { email: 'nix@partner.ch' } };
eq(pabLayerSicht(dokL, uOwner), null, 'Eigentümer-Org → null (= alle Layer, Projekt-Owner)');
ok(JSON.stringify(pabLayerSicht(dokL, uElektro)) === JSON.stringify(['elektro','allgemein']), 'Default: eigenes Gewerk + Allgemein (Elektriker sieht Sanitär NICHT)');
eq(pabLayerSicht(dokL, uArch), null, 'Freigabe «alle» → null (Architekt sieht alles)');
ok(JSON.stringify(pabLayerSicht(dokL, uBL)) === JSON.stringify(['sanitaer','lueftung','heizung']), 'explizite Auswahl ∪ eigenes Gewerk (eigenes immer enthalten)');
ok(JSON.stringify(pabLayerSicht(dokL, uAlt)) === JSON.stringify(['allgemein']), 'Alt-Freigabe ohne gewerk → nur Allgemein');
ok(JSON.stringify(pabLayerSicht(dokL, uNix)) === JSON.stringify([]), 'ohne Freigabe → leer');
ok(JSON.stringify(pabLayerSicht(null, uOwner)) === JSON.stringify([]), 'null-Dokument → leer');

console.log('■ pabShapeFarbe (frei vs. Gewerkfarbe bei mehreren Layern)');
const shpFrei = { farbe: '#111827', layer: 'sanitaer' };
eq(pabShapeFarbe(shpFrei, false), '#111827', 'EIN Layer aktiv → frei gewählte Farbe');
eq(pabShapeFarbe(shpFrei, true), pabLayerById('sanitaer').farbe, 'mehrere Layer aktiv → Gewerkfarbe');
eq(pabShapeFarbe({ layer: 'elektro' }, false), pabLayerById('elektro').farbe, 'ohne eigene Farbe → Layer-Farbe');
eq(pabShapeFarbe({ farbe: '#16a34a' }, true), pabLayerById('allgemein').farbe, 'Altdaten ohne layer → allgemein-Farbe im Multi-Blick');

console.log('■ pabFmtSize');
eq(pabFmtSize(0), '0 B', '0 B');
eq(pabFmtSize(512), '512 B', 'Bytes');
eq(pabFmtSize(2048), '2 KB', 'KB gerundet');
eq(pabFmtSize(5 * 1024 * 1024), '5.0 MB', 'MB mit einer Nachkommastelle');
eq(pabFmtSize(1.5 * 1024 * 1024 * 1024), '1.50 GB', 'GB mit zwei Nachkommastellen');
eq(pabFmtSize('abc'), '0 B', 'nicht-numerisch → 0 B');

console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
