// Node-Test: Handelsregister-Normalisierung (netlify/functions/zefix.js)
//   - LINDAS SPARQL (Open Data, Default-Quelle): Bindings → GEMA-Schema,
//     Gruppierung mehrerer Zeilen pro Firma, Abfrage-Bau + Literal-Escaping
//   - Zefix REST (Fallback): JSON → GEMA-Schema
//   - gemeinsam: UID-Format, Adress-Zusammenbau, Status→aktiv, Container
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

console.log('■ Status → aktiv');
ok(Z._istAktiv('') === true, 'fehlender Status → aktiv (nie fälschlich als gelöscht)');
ok(Z._istAktiv('ACTIVE') === true, 'ACTIVE');
ok(Z._istAktiv('CANCELLED') === false, 'CANCELLED');
ok(Z._istAktiv('https://schema.ld.admin.ch/Deleted') === false, 'Status als URI (…Deleted)');
ok(Z._istAktiv('gelöscht') === false, 'deutsche Schreibweise');
ok(Z._istAktiv('IN LIQUIDATION') === false, 'in Liquidation');

// ═══════════════════ LINDAS SPARQL (Open Data, Default) ═══════════════════
const L = (b) => ({ results: { bindings: b } });
const lit = (v) => ({ type: 'literal', value: v });
const uri = (v) => ({ type: 'uri', value: v });

console.log('■ LINDAS: Literal-Escaping (kein Injection-Pfad)');
eq(Z._sparqlLit('Muster'), 'Muster', 'harmloser Text unverändert');
eq(Z._sparqlLit('Anführungs"zeichen'), 'Anführungs\\"zeichen', 'Anführungszeichen escapt');
eq(Z._sparqlLit('Back\\slash'), 'Back\\\\slash', 'Backslash escapt');
eq(Z._sparqlLit('mehr\nzeilig'), 'mehr zeilig', 'Zeilenumbruch entschärft');
ok(Z._sparqlLit('a" } INSERT DATA { <x> <y> "z').indexOf('\\"') > 0, 'Ausbruchsversuch wird escapt');

console.log('■ LINDAS: Abfrage-Bau');
{
  const q = Z._lindasSearchQuery('Muster AG', 20);
  ok(/FROM <https:\/\/lindas\.admin\.ch\/foj\/zefix>/.test(q), 'Zefix-Graph des Bundesamts für Justiz');
  ok(/schema:legalName \?name/.test(q), 'sucht über schema:legalName');
  ok(/STRSTARTS\(LCASE\(STR\(\?name\)\), "muster ag"\)/.test(q), 'Prefix-Match, kleingeschrieben');
  ok(/LIMIT 20/.test(q), 'LIMIT gesetzt');
  // Seit 08/2026 ist die Suche ZWEISTUFIG: Stufe 1 sucht NUR den Namen.
  // Die OPTIONAL-Joins in derselben Abfrage liessen den Namens-Scan über
  // den ganzen Graphen zuverlässig in den Timeout laufen.
  ok(!/OPTIONAL/.test(q), 'Stufe 1 hat KEINE OPTIONALs (sonst Timeout beim Namens-Scan)');
  ok(!/schema:(identifier|address|additionalType|organizationStatus)/.test(q), 'Stufe 1 holt weder Identifier noch Adresse');
}
{
  // Stufe 2 — Details zu den gefundenen URIs. Hier gehören die OPTIONALs hin:
  // Einstieg über den Subjekt-Index, darum billig.
  const q = Z._lindasDetailsQuery(['https://ld.admin.ch/company/1', 'https://ld.admin.ch/company/2']);
  ok(/VALUES \?company \{ <https:\/\/ld\.admin\.ch\/company\/1> <https:\/\/ld\.admin\.ch\/company\/2> \}/.test(q), 'Stufe 2 steigt über die URIs ein');
  ok((q.match(/OPTIONAL \{ \?company schema:identifier/g) || []).length === 2, 'beide Identifier optional');
  ok(/OPTIONAL \{ \?company schema:address/.test(q), 'Adresse optional');
  ok(/OPTIONAL \{ \?company schema:additionalType/.test(q), 'Rechtsform optional');
  ok(/OPTIONAL \{ \?company schema:organizationStatus/.test(q), 'Status optional');
}
{
  const q = Z._lindasDetailQuery('CHE-123.456.789', 'CHE123456789');
  ok(/VALUES \?uidGesucht \{ "CHE-123\.456\.789" "CHE123456789" \}/.test(q), 'Detail fragt beide UID-Schreibweisen ab');
  ok(/\?company schema:identifier \?idGesucht/.test(q), 'Einstieg über den Identifier-Wert');
}
{
  process.env.ZEFIX_LINDAS_QUERY = 'SELECT * WHERE { ?s ?p "{{Q}}" } LIMIT {{LIMIT}}';
  const q = Z._lindasSearchQuery('Muster', 5);
  eq(q, 'SELECT * WHERE { ?s ?p "muster" } LIMIT 5', 'ZEFIX_LINDAS_QUERY überschreibt die Abfrage (Notausgang ohne Deploy)');
  delete process.env.ZEFIX_LINDAS_QUERY;
}

console.log('■ LINDAS: Bindings → GEMA-Schema');
{
  const f = Z._normBindings(L([{
    company: uri('https://ld.admin.ch/company/CHE123456789'),
    name: lit('Muster AG'), uid: lit('CHE-123.456.789'), chid: lit('CH-270.3.014.395-4'),
    legalFormName: lit('Aktiengesellschaft'), legalFormShort: lit('AG'),
    street: lit('Bahnhofstrasse 1'), zip: lit('8001'), locality: lit('Zürich')
  }]))[0];
  eq(f.name, 'Muster AG', 'Name');
  eq(f.uid, 'CHE123456789', 'UID auf Ziffernform normalisiert');
  eq(f.uidFormatted, 'CHE-123.456.789', 'UID formatiert');
  eq(f.chid, 'CH-270.3.014.395-4', 'CHID');
  eq(f.rechtsform, 'Aktiengesellschaft', 'Rechtsform');
  eq(f.rechtsformKurz, 'AG', 'Rechtsform kurz');
  eq(f.strasse, 'Bahnhofstrasse 1', 'Strasse');
  eq(f.plz, '8001', 'PLZ');
  eq(f.ort, 'Zürich', 'Ort');
  eq(f.sitz, 'Zürich', 'Sitz fällt auf den Ort zurück');
  eq(f.lindasUri, 'https://ld.admin.ch/company/CHE123456789', 'LINDAS-URI mitgeführt');
  ok(f.aktiv === true, 'ohne Status aktiv');
  ok(/zefix\.ch/.test(f.zefixUrl), 'Zefix-Link erzeugt');
}

console.log('■ LINDAS: mehrere Zeilen pro Firma werden gruppiert');
{
  // Realistisch: je Identifier eine Zeile, Adresse nur auf einer davon
  const list = Z._normBindings(L([
    { company: uri('c1'), name: lit('Muster AG'), uid: lit('CHE-123.456.789') },
    { company: uri('c1'), name: lit('Muster AG'), chid: lit('CH-270.3.014.395-4'), street: lit('Bahnhofstrasse 1'), zip: lit('8001'), locality: lit('Zürich') },
    { company: uri('c2'), name: lit('Zweite GmbH'), uid: lit('CHE-987.654.321') }
  ]));
  eq(list.length, 2, 'zwei Firmen statt drei Zeilen');
  eq(list[0].uid, 'CHE123456789', 'UID aus Zeile 1');
  eq(list[0].strasse, 'Bahnhofstrasse 1', 'Adresse aus Zeile 2 ergänzt');
  eq(list[0].chid, 'CH-270.3.014.395-4', 'CHID aus Zeile 2 ergänzt');
  eq(list[1].name, 'Zweite GmbH', 'Reihenfolge bleibt erhalten');
}
{
  // Erster nicht-leerer Wert gewinnt (z.B. mehrsprachige Rechtsform)
  const f = Z._normBindings(L([
    { company: uri('c1'), name: lit('Muster AG'), legalFormName: lit('Aktiengesellschaft') },
    { company: uri('c1'), name: lit('Muster AG'), legalFormName: lit('Société anonyme') }
  ]))[0];
  eq(f.rechtsform, 'Aktiengesellschaft', 'erste Sprachvariante gewinnt');
}

console.log('■ LINDAS: Robustheit');
eq(Z._normBindings(L([])).length, 0, 'keine Treffer → leere Liste');
eq(Z._normBindings(null).length, 0, 'null → leere Liste');
eq(Z._normBindings({}).length, 0, 'Antwort ohne results → leere Liste');
eq(Z._normBindings(L([{ company: uri('c1') }])).length, 0, 'Zeile ohne Namen wird verworfen');
{
  // Fehlen alle OPTIONAL-Felder (Modell weicht ab), bleibt die Trefferliste
  const f = Z._normBindings(L([{ name: lit('Nur Name AG') }]))[0];
  eq(f.name, 'Nur Name AG', 'nur legalName reicht — Suche funktioniert weiter');
  eq(f.uid, '', 'UID leer statt Absturz');
  ok(f.aktiv === true, 'ohne Status aktiv');
}
{
  const f = Z._normBindings(L([{ company: uri('c1'), name: lit('Alt AG'), status: uri('https://schema.ld.admin.ch/Cancelled') }]))[0];
  ok(f.aktiv === false, 'Status-URI wird als gelöscht erkannt');
}
{
  const list = Z._normBindings(L(Array.from({ length: 40 }, (_, i) => ({ company: uri('c' + i), name: lit('Firma ' + i) }))));
  eq(list.length, 20, 'auf MAX_ENTRIES begrenzt');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
