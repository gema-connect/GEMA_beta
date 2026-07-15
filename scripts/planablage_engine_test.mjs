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
const { pabNormMail, pabKannLesen, pabKannBearbeiten, pabPendUebergang, pabFmtSize } = globalThis;

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

console.log('■ pabFmtSize');
eq(pabFmtSize(0), '0 B', '0 B');
eq(pabFmtSize(512), '512 B', 'Bytes');
eq(pabFmtSize(2048), '2 KB', 'KB gerundet');
eq(pabFmtSize(5 * 1024 * 1024), '5.0 MB', 'MB mit einer Nachkommastelle');
eq(pabFmtSize(1.5 * 1024 * 1024 * 1024), '1.50 GB', 'GB mit zwei Nachkommastellen');
eq(pabFmtSize('abc'), '0 B', 'nicht-numerisch → 0 B');

console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
