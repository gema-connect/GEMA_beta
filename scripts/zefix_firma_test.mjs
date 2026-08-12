// Drift-Guard: Firmen-Vorschlaege aus dem Schweizer Handelsregister
// (netlify/functions/zefix.js + gema_zefix.js + die Anbindung in den
// Modulen, in denen ein Unternehmen erfasst wird).
//
// Teil A  Node  — Engine der Function: Abfrage-Bau, Quellen-Kaskade,
//                 Selbsttest, Normalisierung. Braucht KEINEN Browser und
//                 KEIN Netz (fetch wird gestubbt).
// Teil B  Node  — statische Anbindungs-Pruefung aller Module: Script-
//                 Include + GemaZefix.firma-Aufruf je Firma-Feld.
// Teil C  Playwright — echter Boot: Vorschlag mit Adresse, Auswahl fuellt
//                 Name + Adresse, Bestaetigungszeile, Umtippen loest den
//                 Bezug. Ohne playwright-core wird Teil C mit Hinweis
//                 uebersprungen — nie still.
//
// Ausfuehren:  node scripts/zefix_firma_test.mjs
//              CHROME=<chromium> node scripts/zefix_firma_test.mjs
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const FN = join(ROOT, 'netlify/functions/zefix.js');

let pass = 0, fail = 0;
const ok = (b, t) => { if (b) { pass++; console.log('  ✓ ' + t); } else { fail++; console.log('  ✗ ' + t); } };

// Frische Instanz der Function — die Kurzzeit-Sperre je Quelle lebt im
// Modul-Scope und darf nicht von einem Szenario ins naechste lecken.
function frisch() { delete require.cache[require.resolve(FN)]; return require(FN); }

// SPARQL-Antwort im Format der SELECT-Ergebnisse
const sparql = rows => JSON.stringify({ head: { vars: [] }, results: { bindings: rows } });
const lit = v => ({ type: 'literal', value: v });
const uri = v => ({ type: 'uri', value: v });

const NAME_ROWS = [
  { company: uri('https://ld.admin.ch/company/1'), name: lit('Muster AG') },
  { company: uri('https://ld.admin.ch/company/2'), name: lit('Muster Bau GmbH') }
];
const DETAIL_ROWS = [
  { company: uri('https://ld.admin.ch/company/1'), name: lit('Muster AG'), uid: lit('CHE123456789'),
    legalFormShort: lit('AG'), street: lit('Bahnhofstrasse 1'), zip: lit('8001'), locality: lit('Zürich') },
  { company: uri('https://ld.admin.ch/company/2'), name: lit('Muster Bau GmbH'), uid: lit('CHE987654321'),
    legalFormShort: lit('GmbH'), street: lit('Baugasse 7'), zip: lit('4051'), locality: lit('Basel') }
];

// fetch-Stub: entscheidet anhand des Abfrage-Texts, was zurueckkommt.
function stubFetch(plan) {
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = decodeURIComponent(String((opts && opts.body) || ''));
    const istDetail = /VALUES \?company/.test(body);
    const eintrag = { url: String(url), istDetail, body };
    calls.push(eintrag);
    const r = await plan(eintrag);
    if (r instanceof Error) throw r;
    return { status: r.status, text: async () => r.text };
  };
  return calls;
}

console.log('\n═══ Teil A — Function-Engine (Node, ohne Netz) ═══');

console.log('■ Abfrage-Bau');
{
  const z = frisch();
  ok(JSON.stringify(z._praefixVarianten('muster')) === '["Muster","muster"]',
     'Praefix: getippte UND gross geschriebene Schreibweise');
  ok(JSON.stringify(z._praefixVarianten('GEMA')) === '["GEMA"]',
     'Praefix: schon gross geschrieben ⇒ nur eine Variante (kein doppelter Bereich)');

  const q1 = z._lindasNamenQuery('muster', 20, 'range');
  ok(!/OPTIONAL/.test(q1), 'Stufe 1 hat KEINE OPTIONALs (der Join macht den Scan teuer)');
  ok(!/schema:address|schema:identifier/.test(q1), 'Stufe 1 holt weder Adresse noch Identifier');
  ok(/LIMIT 20/.test(q1), 'Stufe 1 ist limitiert');
  ok(/\?name >= "Muster" && \?name < "Muster\\uFFFF"/.test(q1), 'Bereichsfilter statt STRSTARTS(LCASE(…))');
  ok(/UNION/.test(q1), 'Beide Schreibweisen als UNION');
  ok(!/LCASE/.test(q1), 'Kein LCASE im Bereichs-Zweig (waere pro Zeile auszuwerten)');

  const q1b = z._lindasNamenQuery('muster', 20, 'strstarts');
  ok(/STRSTARTS\(LCASE/.test(q1b) && !/OPTIONAL/.test(q1b),
     'Textsuche-Strategie bleibt erhalten — ebenfalls ohne OPTIONALs');

  const q2 = z._lindasDetailsQuery(['https://ld.admin.ch/company/1']);
  ok(/VALUES \?company \{ <https:\/\/ld\.admin\.ch\/company\/1> \}/.test(q2), 'Stufe 2 steigt ueber die URIs ein');
  ok(/schema:address/.test(q2) && /schema:identifier/.test(q2), 'Stufe 2 holt Adresse + UID');
  ok(/OPTIONAL \{ \?company schema:address/.test(q2), 'Adresse ist OPTIONAL (Modell-Abweichung killt nicht die Liste)');

  const boese = z._lindasDetailsQuery(['http://x/1> } . ?s ?p ?o . VALUES ?y {<http://y']);
  ok(!/\} \. \?s \?p \?o/.test(boese), 'URIs werden entschaerft (kein Ausbruch aus VALUES)');
  ok(z._sparqlLit('a"b\\c') === 'a\\"b\\\\c', 'Literale werden escapt');
}

console.log('■ Zweistufige Suche');
{
  const z = frisch();
  const calls = stubFetch(async c => ({ status: 200, text: sparql(c.istDetail ? DETAIL_ROWS : NAME_ROWS) }));
  const r = await z._kaskade('suche', { name: 'Muster', sprache: 'de' }, {});
  ok(calls.length === 2, 'Genau zwei Abfragen: Namen, dann Details');
  ok(!calls[0].istDetail && calls[1].istDetail, 'Reihenfolge stimmt (erst Namen, dann Details)');
  ok(r.firmen.length === 2, 'Zwei Firmen');
  ok(r.firmen[0].name === 'Muster AG', 'Name aus Stufe 1');
  ok(r.firmen[0].strasse === 'Bahnhofstrasse 1' && r.firmen[0].plz === '8001' && r.firmen[0].ort === 'Zürich',
     'ADRESSE kommt mit der Trefferliste (der eigentliche Zweck)');
  ok(r.firmen[0].uidFormatted === 'CHE-123.456.789', 'UID formatiert');
  ok(r.quelle === 'lindas-range', 'Bereichs-Strategie hat geliefert');
}

console.log('■ Teilausfall: Stufe 2 tot ⇒ Namen kommen trotzdem');
{
  const z = frisch();
  stubFetch(async c => c.istDetail ? new Error('boom') : ({ status: 200, text: sparql(NAME_ROWS) }));
  const r = await z._kaskade('suche', { name: 'Muster', sprache: 'de' }, {});
  ok(r.firmen.length === 2, 'Trefferliste bleibt erhalten');
  ok(r.firmen[0].name === 'Muster AG', 'Name da');
  ok(r.firmen[0].strasse === '', 'Adresse fehlt (wird beim Auswaehlen nachgeladen) — statt gar keine Vorschlaege');
}

console.log('■ Kaskade: faellt auf die naechste Quelle');
{
  const z = frisch();
  let sparqlVersuche = 0;
  const calls = stubFetch(async c => {
    if (/lindas/.test(c.url)) { sparqlVersuche++; return new Error('LINDAS tot'); }
    return { status: 200, text: JSON.stringify({ list: [{ name: 'Muster AG', uid: 'CHE123456789',
      legalSeat: 'Zürich', address: { street: 'Bahnhofstrasse', houseNumber: '1', swissZipCode: '8001', town: 'Zürich' } }] }) };
  });
  const r = await z._kaskade('suche', { name: 'Muster', sprache: 'de' }, {});
  ok(sparqlVersuche >= 2, 'Beide LINDAS-Strategien wurden probiert');
  ok(r.quelle === 'zefix-rest-offen', 'Danach greift die REST-Quelle');
  ok(r.firmen.length === 1 && r.firmen[0].strasse === 'Bahnhofstrasse 1', 'REST-Adresse normalisiert');
  ok(r.versuche.filter(v => !v.ok).length >= 2, 'Die gescheiterten Versuche werden ausgewiesen, nicht verschluckt');
  ok(calls.some(c => /zefix/.test(c.url)), 'REST-Endpunkt wurde wirklich gerufen');
}

console.log('■ Kaskade: technisch ok, aber 0 Treffer ⇒ naechste Quelle fragen');
{
  const z = frisch();
  let restGefragt = false;
  stubFetch(async c => {
    if (/lindas/.test(c.url)) return { status: 200, text: sparql([]) };
    restGefragt = true;
    return { status: 200, text: JSON.stringify({ list: [] }) };
  });
  const r = await z._kaskade('suche', { name: 'Gibtsnicht', sprache: 'de' }, {});
  ok(restGefragt, 'Eine leere Antwort beendet die Suche nicht');
  ok(!r.fehler, '«Nichts gefunden» ist KEIN Fehler');
  ok(r.firmen.length === 0, 'Leere Liste');
}

console.log('■ Kaskade: alles tot ⇒ Grund nennen');
{
  const z = frisch();
  stubFetch(async () => new Error('Netz weg'));
  const r = await z._kaskade('suche', { name: 'Muster', sprache: 'de' }, {});
  ok(!!r.fehler, 'Fehler wird gemeldet');
  ok(/LINDAS/.test(r.fehler) && /Zefix/.test(r.fehler), 'Fehlertext nennt die probierten Quellen');
  ok(r.versuche.length >= 3, 'Alle Versuche protokolliert');
}

console.log('■ Kurzzeit-Sperre: tote Quelle frisst nicht jedes Mal das Zeitbudget');
{
  const z = frisch();
  stubFetch(async c => /lindas/.test(c.url) ? new Error('tot') : ({ status: 200, text: JSON.stringify({ list: [{ name: 'X AG', uid: 'CHE123456789' }] }) }));
  await z._kaskade('suche', { name: 'Muster', sprache: 'de' }, {});
  const reihe = z._reihenfolge('suche').map(q => q.id);
  ok(reihe[0] === 'zefix-rest-offen', 'Die erfolgreiche Quelle steht beim naechsten Mal zuoberst');
  ok(reihe.indexOf('lindas-range') > 0, 'Die gescheiterte rutscht nach hinten');
}

console.log('■ Selbsttest');
{
  const z = frisch();
  stubFetch(async c => {
    if (/lindas/.test(c.url)) return c.istDetail ? { status: 200, text: sparql(DETAIL_ROWS) } : { status: 200, text: sparql(NAME_ROWS) };
    return { status: 503, text: 'Service Unavailable' };
  });
  const s = await z._selftest('Muster', 'de');
  ok(s.ok === true, 'Selbsttest antwortet');
  ok(Array.isArray(s.quellen) && s.quellen.length === z.QUELLEN.length, 'Jede Quelle wird einzeln geprueft');
  const range = s.quellen.find(q => q.quelle === 'lindas-range');
  ok(range && range.ok === true && range.treffer === 2, 'Funktionierende Quelle meldet Treffer');
  ok(range && range.mitAdresse === 2, 'Selbsttest weist aus, wie viele Treffer eine Adresse haben');
  ok(range && range.beispiel && /Bahnhofstrasse 1, 8001 Zürich/.test(range.beispiel.adresse), 'Beispiel-Adresse im Selbsttest');
  const rest = s.quellen.find(q => q.quelle === 'zefix-rest-offen');
  ok(rest && rest.ok === false && /503/.test(rest.fehler), 'Kaputte Quelle nennt ihren HTTP-Status');
  const konto = s.quellen.find(q => q.quelle === 'zefix-rest-konto');
  ok(konto && konto.aktiv === false && /Zugangsdaten/.test(konto.hinweis), 'Fehlende Zugangsdaten werden als Grund genannt');
  ok(/funktioniert/.test(s.zusammenfassung), 'Zusammenfassung in Klartext');
  ok(s.konfiguration && s.konfiguration.ZEFIX_KONTO === 'nicht gesetzt', 'Konfiguration wird gemeldet …');
}
{
  // Mit hinterlegtem Konto: gemeldet wird «gesetzt», NIE der Wert.
  process.env.ZEFIX_USER = 'gema-test';
  process.env.ZEFIX_PASSWORD = 'streng-geheim-4711';
  const z = frisch();
  stubFetch(async () => ({ status: 200, text: sparql([]) }));
  const s = await z._selftest('Muster', 'de');
  const roh = JSON.stringify(s);
  ok(s.konfiguration.ZEFIX_KONTO === 'gesetzt', 'Hinterlegtes Konto wird als «gesetzt» gemeldet');
  ok(roh.indexOf('streng-geheim-4711') < 0, '… aber NIE das Passwort selbst');
  ok(roh.indexOf('gema-test') < 0, '… und nie der Benutzername');
  delete process.env.ZEFIX_USER; delete process.env.ZEFIX_PASSWORD;
}

console.log('■ Normalisierung (unveraendertes Verhalten)');
{
  const z = frisch();
  ok(z._fmtUid('CHE123456789') === 'CHE-123.456.789', 'UID-Format');
  ok(z._uidDigits('CHE-123.456.789') === 'CHE123456789', 'UID-Ziffern');
  ok(z._istAktiv('') === true, 'Ohne Status gilt eine Firma als aktiv');
  ok(z._istAktiv('CANCELLED') === false, 'Geloescht erkannt');
  ok(z._normAdresse({ street: 'Bahnhofstrasse', houseNumber: '1', swissZipCode: '8001', town: 'Zürich' }).strasse === 'Bahnhofstrasse 1',
     'Strasse + Hausnummer zusammengesetzt');
  ok(z._normAdresse({ poBox: '123', town: 'Bern' }).strasse === 'Postfach 123', 'Postfach als Strasse');
  const f = z._normBindings({ results: { bindings: DETAIL_ROWS } });
  ok(f.length === 2 && f[0].rechtsformKurz === 'AG', 'Bindings gruppiert');
}

console.log('\n═══ Teil B — Anbindung in den Modulen (statisch) ═══');

// Wo ein Unternehmen erfasst wird, muss der Vorschlag hAngen. Neue Module
// hier eintragen — sonst faellt die Anbindung beim naechsten Umbau still weg.
const ANBINDUNG = [
  ['sys_admin.html', ['o_name'], 'Neues Unternehmen'],
  ['sys_unternehmen.html', ['orgName'], 'Firmendaten der eigenen Firma'],
  ['pm_objekte.html', ['betFirma'], 'Beteiligte'],
  ['sys_lieferanten.html', ['edFirma'], 'Lieferant erfassen'],
  ['sys_lieferant_dashboard.html', ['pFirma'], 'Firmenprofil'],
  ['iv_immobilien.html', ['af_hwFirma'], 'Externer Handwerker'],
  ['pm_besprechung.html', ['f_firma', 'newTeilnFirma'], 'Teilnehmer'],
  ['pm_schnellausschreibung.html', ['invFirma'], 'Unternehmer einladen'],
  ['pm_ausschreibungsunterlagen.html', ['pfFirma'], 'Firmenprofil Unternehmer'],
  ['pm_abnahme.html', ['bauherrFirma', 'bauleitungFirma', 'unternehmerFirma'], 'Abnahme-Beteiligte'],
  ['hy_legionellen.html', ['se_planerFirma', 'se_technikerFirma'], 'Externer Planer/Sanierer'],
  ['pm_erp.html', ['k_firma', 'z_firma', 's_name'], 'Adressstamm / Zustelladresse / Absender'],
  ['sys_card_editor.html', ['fFirma'], 'GEMA Card']
];
for (const [datei, felder, was] of ANBINDUNG) {
  const s = readFileSync(join(ROOT, datei), 'utf8');
  ok(/<script src="gema_zefix\.js"><\/script>/.test(s), datei + ': gema_zefix.js eingebunden');
  for (const f of felder) {
    // Das Feld muss es im Markup auch wirklich geben — sonst zeigt die
    // Anbindung ins Leere, ohne dass jemand etwas merkt.
    ok(new RegExp('id="' + f + '"').test(s), datei + ': Feld ' + f + ' existiert im Markup');
  }
  for (const f of felder) {
    ok(new RegExp("firma:'" + f + "'").test(s) || new RegExp("GemaZefix\\.attach\\(\\s*(el|\\$\\('" + f + "'\\))").test(s) || s.indexOf("'" + f + "'") >= 0,
       datei + ': ' + f + ' angebunden (' + was + ')');
  }
}
{
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  ok(/'\/gema_zefix\.js'/.test(sw), 'sw.js cached gema_zefix.js');
  ok(/pfad\.indexOf\('\/\.netlify\/functions\/'\) === 0/.test(sw),
     'sw.js liefert Function-Antworten NIE aus dem Cache (sonst alte Firmensuche)');
  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  ok(/from = "\/api\/zefix"/.test(toml), 'netlify.toml: /api/zefix ist umgeleitet');
  const cl = readFileSync(join(ROOT, 'gema_zefix.js'), 'utf8');
  ok(/selftest/.test(cl) && /firma:\s*_firma/.test(cl), 'gema_zefix.js exportiert firma() + selftest()');
  ok(/_adrText\(f\) \|\| f\.sitz/.test(cl), 'Vorschlagszeile zeigt die Adresse (Sitz nur als Rueckfall)');
}

console.log('\n═══ Teil C — Browser ═══');
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) {}
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if (!chromium || !existsSync(CHROME)) {
  console.log('  ⓘ UEBERSPRUNGEN — playwright-core/Chromium nicht verfuegbar.');
  console.log('     Nachholen mit:  CHROME=<chromium> node scripts/zefix_firma_test.mjs');
} else {
  const { startServer, BASE, seed, newPage } = await import('./rolematrix_harness.mjs');
  const TREFFER = { ok: true, quelle: 'lindas-range', anzahl: 2, firmen: [
    { name: 'Muster AG', uid: 'CHE123456789', uidFormatted: 'CHE-123.456.789', chid: '', sitz: 'Zürich',
      rechtsform: 'Aktiengesellschaft', rechtsformKurz: 'AG', status: 'ACTIVE', aktiv: true,
      zefixUrl: 'https://www.zefix.ch/x', strasse: 'Bahnhofstrasse 1', plz: '8001', ort: 'Zürich' },
    { name: 'Muster Bau GmbH', uid: 'CHE987654321', uidFormatted: 'CHE-987.654.321', chid: '', sitz: 'Basel',
      rechtsform: 'GmbH', rechtsformKurz: 'GmbH', status: 'CANCELLED', aktiv: false,
      zefixUrl: '', strasse: 'Baugasse 7', plz: '4051', ort: 'Basel' }
  ] };
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let gefragt = 0;
  await page.route('**/functions/zefix*', route => {
    gefragt++;
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(TREFFER) });
  });

  console.log('■ sys_admin — «Neues Unternehmen»');
  await page.goto(BASE + '/sys_admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof openOrgModal === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => typeof GemaZefix !== 'undefined' && typeof GemaZefix.firma === 'function'),
     'gema_zefix.js geladen');
  await page.evaluate(() => openOrgModal());
  ok(await page.evaluate(() => !!document.getElementById('o_name')._gzAttached), 'o_name ist angebunden');

  await page.click('#o_name');
  await page.type('#o_name', 'Muster', { delay: 12 });
  await page.waitForSelector('.gema-hr-drop.open .gema-hr-item', { timeout: 6000 });
  ok(gefragt > 0, 'Handelsregister wurde abgefragt');
  {
    const items = await page.$$eval('.gema-hr-drop .gema-hr-item', els => els.map(e => e.textContent));
    ok(items.length === 2, 'Zwei Vorschlaege');
    ok(/Muster AG/.test(items[0]), 'Firmenname im Vorschlag');
    ok(/Bahnhofstrasse 1, 8001 Zürich/.test(items[0]), 'ADRESSE steht im Vorschlag (der Kern des Auftrags)');
    ok(/gelöscht/i.test(items[1]), 'Geloeschte Firma ist markiert');
  }
  await page.$eval('.gema-hr-drop .gema-hr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await page.waitForFunction(() => document.getElementById('o_strasse').value !== '', null, { timeout: 6000 });
  {
    const v = await page.evaluate(() => ({
      name: document.getElementById('o_name').value,
      str: document.getElementById('o_strasse').value,
      plz: document.getElementById('o_plz').value,
      ort: document.getElementById('o_ort').value,
      such: document.getElementById('o_adrSearch').value,
      hint: (document.querySelector('.gema-hr-hint') || {}).textContent || ''
    }));
    ok(v.name === 'Muster AG', 'Offizieller Firmenname uebernommen');
    ok(v.str === 'Bahnhofstrasse 1' && v.plz === '8001' && v.ort === 'Zürich', 'Adresse in die Firmenfelder uebernommen');
    ok(/Bahnhofstrasse 1/.test(v.such), 'Adress-Suchfeld zieht mit (sonst stuende dort die alte Adresse)');
    ok(/CHE-123\.456\.789/.test(v.hint) && /AG/.test(v.hint), 'Bestaetigungszeile nennt UID + Rechtsform');
  }
  console.log('■ Umtippen loest den Registerbezug');
  await page.click('#o_name');
  await page.keyboard.type('X');
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => !document.querySelector('.gema-hr-hint') || !document.querySelector('.gema-hr-hint').textContent),
     'Siegel verschwindet, sobald der Name von Hand geaendert wird');
  ok(await page.evaluate(() => document.getElementById('o_strasse').value === 'Bahnhofstrasse 1'),
     'Die bereits erfasste Adresse bleibt stehen (sie ist erfasst, nicht falsch)');

  console.log('■ pm_objekte — Beteiligte');
  await page.goto(BASE + '/pm_objekte.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof openBetModal === 'function', null, { timeout: 12000 });
  await page.evaluate(() => openBetModal());
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!document.getElementById('betFirma')._gzAttached), 'betFirma ist angebunden');
  await page.click('#betFirma');
  await page.type('#betFirma', 'Muster', { delay: 12 });
  await page.waitForSelector('#betModal .gema-hr-drop.open .gema-hr-item', { timeout: 6000 });
  await page.$eval('#betModal .gema-hr-drop .gema-hr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await page.waitForFunction(() => document.getElementById('betStrasse').value !== '', null, { timeout: 6000 });
  {
    const v = await page.evaluate(() => ({
      str: document.getElementById('betStrasse').value,
      plz: document.getElementById('betPlz').value,
      such: document.getElementById('betAdrSearch').value
    }));
    ok(v.str === 'Bahnhofstrasse 1' && v.plz === '8001', 'Versteckte Adressfelder gefuellt');
    ok(/Bahnhofstrasse 1, 8001 Zürich/.test(v.such), 'Sichtbares Adressfeld gefuellt');
  }

  // sys_unternehmen: Strasse/PLZ/Ort sind HIDDEN — sichtbar ist nur das
  // Adress-Suchfeld darueber. Es muss mitziehen, sonst sieht der Nutzer von
  // der uebernommenen Adresse nichts (Feedback 11.08.2026).
  console.log('■ sys_unternehmen — Firmendaten');
  await page.goto(BASE + '/sys_unternehmen.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const el = document.getElementById('orgName');
    return !!(el && el._gzAttached);
  }, null, { timeout: 12000 });
  ok(true, 'orgName ist angebunden');
  await page.click('#orgName');
  await page.evaluate(() => { document.getElementById('orgName').value = ''; });
  await page.type('#orgName', 'Muster', { delay: 12 });
  await page.waitForSelector('.gema-hr-drop.open .gema-hr-item', { timeout: 6000 });
  await page.$eval('.gema-hr-drop .gema-hr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await page.waitForFunction(() => document.getElementById('orgStrasse').value !== '', null, { timeout: 6000 });
  {
    const v = await page.evaluate(() => ({
      name: document.getElementById('orgName').value,
      str: document.getElementById('orgStrasse').value,
      plz: document.getElementById('orgPlz').value,
      ort: document.getElementById('orgOrt').value,
      rf: document.getElementById('orgRechtsform').value,
      such: document.getElementById('orgAdrSearch').value,
      hint: (document.querySelector('.gema-hr-hint') || {}).textContent || ''
    }));
    ok(v.name === 'Muster AG', 'Offizieller Firmenname uebernommen');
    ok(v.str === 'Bahnhofstrasse 1' && v.plz === '8001' && v.ort === 'Zürich', 'Adresse in die versteckten Firmenfelder uebernommen');
    ok(/Bahnhofstrasse 1, 8001 Zürich/.test(v.such), 'Sichtbares Adress-Suchfeld zieht mit');
    ok(v.rf === 'AG', 'Rechtsform uebernommen');
    ok(/CHE-123\.456\.789/.test(v.hint), 'Bestaetigungszeile nennt die UID');
  }

  ok(errors.length === 0, 'Keine JS-Fehler in sys_admin/pm_objekte/sys_unternehmen' + (errors.length ? ' — ' + errors[0] : ''));

  // Boot jeder angebundenen Seite: die Anbindung darf keine Seite
  // zerreissen, und die im statischen Markup liegenden Firma-Felder
  // muessen nach dem Laden gebunden sein.
  console.log('■ Boot aller angebundenen Module');
  const BOOT = [
    ['sys_unternehmen.html', ['orgName']],
    ['iv_immobilien.html', ['af_hwFirma']],
    ['pm_besprechung.html', ['f_firma', 'newTeilnFirma']],
    ['pm_schnellausschreibung.html', ['invFirma']],
    ['pm_ausschreibungsunterlagen.html', ['pfFirma']],
    ['pm_abnahme.html', ['bauherrFirma', 'bauleitungFirma', 'unternehmerFirma']],
    ['hy_legionellen.html', ['se_planerFirma', 'se_technikerFirma']],
    ['sys_lieferanten.html', []],            // bindet erst beim Oeffnen des Editors
    ['sys_lieferant_dashboard.html', []]     // bindet erst in fillProfil()
  ];
  for (const [datei, felder] of BOOT) {
    const bootFehler = [];
    const p2 = await ctx.newPage();
    p2.on('pageerror', e => bootFehler.push(e.message));
    await p2.route('**/functions/zefix*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(TREFFER) }));
    await p2.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(700);
    ok(bootFehler.length === 0, datei + ': bootet ohne JS-Fehler' + (bootFehler.length ? ' — ' + bootFehler[0] : ''));
    for (const f of felder) {
      const gebunden = await p2.evaluate(id => {
        const el = document.getElementById(id);
        return !!(el && el._gzAttached);
      }, f);
      ok(gebunden, datei + ': ' + f + ' ist nach dem Laden gebunden');
    }
    // Die beiden Lieferanten-Seiten binden erst beim Oeffnen des Editors —
    // sonst waere die Anbindung nur «vorhanden», aber nie wirksam.
    if (datei === 'sys_lieferanten.html') {
      const geb = await p2.evaluate(() => {
        try { clearEditor(); } catch (e) { return 'clearEditor: ' + e.message; }
        const el = document.getElementById('edFirma');
        return !!(el && el._gzAttached);
      });
      ok(geb === true, 'sys_lieferanten: edFirma wird beim Oeffnen des Editors gebunden' + (typeof geb === 'string' ? ' — ' + geb : ''));
    }
    if (datei === 'sys_lieferant_dashboard.html') {
      // Das Firmenprofil darf nur der Org-Admin des Lieferanten bearbeiten —
      // ohne dieses Recht sind die Felder gesperrt, dann waeren Vorschlaege
      // eine Sackgasse. Beide Seiten der Regel pruefen.
      const ohne = await p2.evaluate(() => {
        window._liefIsAdmin = function () { return false; };
        try { _profilHrInit(); } catch (e) { return 'err:' + e.message; }
        const el = document.getElementById('pFirma');
        return !!(el && el._gzAttached);
      });
      ok(ohne === false, 'sys_lieferant_dashboard: OHNE Bearbeitungsrecht wird nicht angebunden');
      // Die Profil-Sektion rendert das Dashboard erst mit einem echten
      // Lieferanten-Profil ins DOM. Statt den halben Dashboard-Zustand zu
      // simulieren, wird hier nur die Anbindungs-Regel geprueft: liegt das
      // Feld vor und besteht das Recht, muss gebunden werden. Dass das Feld
      // wirklich «pFirma» heisst, sichert Teil B statisch ab.
      const mit = await p2.evaluate(() => {
        window._liefIsAdmin = function () { return true; };
        if (!document.getElementById('pFirma')) {
          ['pFirma', 'pStrasse', 'pPlz', 'pOrt', 'pRechtsform'].forEach(id => {
            const i = document.createElement('input'); i.id = id; document.body.appendChild(i);
          });
        }
        try { _profilHrInit(); } catch (e) { return 'err:' + e.message; }
        const el = document.getElementById('pFirma');
        return !!(el && el._gzAttached);
      });
      ok(mit === true, 'sys_lieferant_dashboard: MIT Bearbeitungsrecht wird pFirma gebunden' + (typeof mit === 'string' ? ' — ' + mit : ''));
    }
    await p2.close();
  }

  await ctx.close(); await browser.close(); server.close();
}

console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' Checks ok, ' + fail + ' fehlgeschlagen\n');
process.exit(fail ? 1 : 0);
