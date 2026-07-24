// Node-Test: Zefix-Normalisierung (netlify/functions/zefix.js)
// Prüft die Abbildung der Handelsregister-Antwort auf das GEMA-Schema —
// inkl. mehrsprachiger Felder, UID-Formatierung, Adress-Zusammenbau und
// der Container-Varianten (Array / {list:[…]} / Einzelobjekt).
// Ausführen: node scripts/zefix_norm_test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Z = require('../netlify/functions/zefix.js');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};
const eq = (a, b, name) => ok(a === b, name + (a === b ? '' : ` — erwartet «${b}», erhalten «${a}»`));

console.log('■ UID-Formatierung');
eq(Z._fmtUid('CHE123456789'), 'CHE-123.456.789', 'CHE123456789 → CHE-123.456.789');
eq(Z._fmtUid('CHE-123.456.789'), 'CHE-123.456.789', 'bereits formatiert bleibt gleich');
eq(Z._fmtUid('che 123 456 789'), 'CHE-123.456.789', 'Kleinschreibung + Leerzeichen');
eq(Z._fmtUid(''), '', 'leer bleibt leer');
eq(Z._fmtUid('Muster AG'), 'Muster AG', 'Nicht-UID wird unverändert durchgereicht');
eq(Z._uidDigits('CHE-123.456.789'), 'CHE123456789', 'Ziffern-Normalisierung für den API-Aufruf');
eq(Z._uidDigits('CHE-12.34'), '', 'unvollständige UID → leer (Guard)');
eq(Z._uidDigits('<script>'), '', 'Müll → leer (kein Pfad-Injection-Vektor)');

console.log('■ Mehrsprachige Texte');
eq(Z._txt({ de: 'Aktiengesellschaft', fr: 'Société anonyme' }), 'Aktiengesellschaft', 'de gewinnt');
eq(Z._txt({ fr: 'Société anonyme' }), 'Société anonyme', 'fr als Fallback');
eq(Z._txt('Einzelfirma'), 'Einzelfirma', 'reiner String');
eq(Z._txt(null), '', 'null → leer');

console.log('■ Adresse');
{
  const a = Z._normAdresse({ street: 'Musterstrasse', houseNumber: '12', swissZipCode: 4051, town: 'Basel', country: 'Schweiz' });
  eq(a.strasse, 'Musterstrasse 12', 'Strasse + Hausnummer zusammengesetzt');
  eq(a.plz, '4051', 'PLZ als String');
  eq(a.ort, 'Basel', 'Ort');
}
{
  const a = Z._normAdresse({ street: 'Bahnhofstrasse', swissZipCode: 8001, town: 'Zürich' });
  eq(a.strasse, 'Bahnhofstrasse', 'ohne Hausnummer kein Leerzeichen-Rest');
}
{
  const a = Z._normAdresse({ poBox: '1234', swissZipCode: 3000, town: 'Bern' });
  eq(a.strasse, 'Postfach 1234', 'nur Postfach → «Postfach …»');
}
{
  const a = Z._normAdresse({ poBox: 'Postfach 99', swissZipCode: 3000, town: 'Bern' });
  eq(a.strasse, 'Postfach 99', 'bereits «Postfach …» wird nicht verdoppelt');
}
{
  const a = Z._normAdresse(null);
  ok(a.strasse === '' && a.plz === '' && a.ort === '', 'fehlende Adresse → leere Felder statt Absturz');
}

console.log('■ Firma (Suchtreffer ohne Adresse)');
{
  const f = Z._normFirma({
    name: 'Muster AG', uid: 'CHE123456789', chidFormatted: 'CH-270.3.014.395-4',
    legalSeat: 'Zürich', status: 'ACTIVE',
    legalForm: { id: 4, name: { de: 'Aktiengesellschaft' }, shortName: { de: 'AG' } }
  });
  eq(f.name, 'Muster AG', 'Name');
  eq(f.uid, 'CHE123456789', 'UID normalisiert (Ziffern)');
  eq(f.uidFormatted, 'CHE-123.456.789', 'UID formatiert für die Anzeige');
  eq(f.chid, 'CH-270.3.014.395-4', 'CHID');
  eq(f.sitz, 'Zürich', 'Sitz');
  eq(f.rechtsform, 'Aktiengesellschaft', 'Rechtsform (de)');
  eq(f.rechtsformKurz, 'AG', 'Rechtsform kurz');
  ok(f.aktiv === true, 'ACTIVE → aktiv');
  ok(f.strasse === '' && f.plz === '' && f.ort === '', 'Suchtreffer trägt keine Adresse');
  ok(/zefix\.ch/.test(f.zefixUrl), 'Zefix-Link als Fallback erzeugt');
}

console.log('■ Firma (Detail mit Adresse)');
{
  const f = Z._normFirma({
    name: 'Beispiel GmbH', uid: 'CHE987654321', legalSeat: 'Basel', status: 'ACTIVE',
    legalForm: { name: { de: 'Gesellschaft mit beschränkter Haftung' }, shortName: { de: 'GmbH' } },
    address: { street: 'Musterstrasse', houseNumber: '12', swissZipCode: 4051, town: 'Basel' },
    cantonalExcerptWeb: 'https://bs.chregister.ch/cr-portal/auszug/auszug.xhtml?uid=CHE987654321'
  });
  eq(f.strasse, 'Musterstrasse 12', 'Adresse aus dem Detail');
  eq(f.plz, '4051', 'PLZ aus dem Detail');
  eq(f.ort, 'Basel', 'Ort aus dem Detail');
  ok(f.zefixUrl.indexOf('chregister.ch') > 0, 'kantonaler Auszug-Link bevorzugt');
}

console.log('■ Gelöschte Firma');
{
  const f = Z._normFirma({ name: 'Alt AG', uid: 'CHE111222333', status: 'CANCELLED', legalSeat: 'Bern' });
  ok(f.aktiv === false, 'CANCELLED → aktiv:false (wird im Dropdown markiert)');
  eq(f.status, 'CANCELLED', 'Status durchgereicht');
}

console.log('■ Robustheit');
ok(Z._normFirma(null) === null, 'null → null');
ok(Z._normFirma({}) === null, 'leeres Objekt → null (kein Geister-Eintrag)');
ok(Z._normFirma({ name: 'Nur Name' }) !== null, 'Name allein reicht');
{
  const f = Z._normFirma({ name: 'Ohne Status AG', uid: 'CHE111222333' });
  ok(f.aktiv === true, 'fehlender Status → aktiv (nicht fälschlich als gelöscht markieren)');
}

console.log('■ Container-Varianten');
eq(Z._extractList([{ name: 'A' }, { name: 'B' }]).length, 2, 'Array direkt');
eq(Z._extractList({ list: [{ name: 'A' }] }).length, 1, '{list:[…]}');
eq(Z._extractList({ data: [{ name: 'A' }, { name: 'B' }] }).length, 2, '{data:[…]}');
eq(Z._extractList({ name: 'Einzel AG' }).length, 1, 'Einzelobjekt (Detail-Antwort)');
eq(Z._extractList(null).length, 0, 'null → leere Liste');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
