// Klassencode-Registrierung — Sperre + Brute-Force-Drossel (04.08.2026)
//
// Vor dem Pilotbetrieb einer Schulklasse wird die Studierenden-
// Registrierung geoeffnet, die Firmen-Registrierung bleibt zu. Der
// 6-stellige Klassencode ist damit die EINZIGE Tuer (31^6 ≈ 887 Mio) —
// er muss serverseitig gegen Durchprobieren geschuetzt sein.
//
// Abgesichert:
//   A) sys_login.html: die beiden Einstiege sind GETRENNT schaltbar und
//      es gibt keinen Client-Fallback, der die Server-Sperre umgeht.
//   B) gema-auth.js: class_info folgt derselben Sperre wie
//      register_student; FALSCHE Codes werden pro IP gedrosselt, RICHTIGE
//      kosten nichts (eine Klasse sitzt hinter EINER Schul-IP und darf
//      sich nicht selbst aussperren); Massen-Konten sind gedeckelt.
//
// Aufruf: node scripts/schule_registrierung_gate_test.mjs   (kein Browser)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const FN = join(ROOT, 'netlify/functions/gema-auth.js');

let pass = 0, fail = 0;
const ok = (c, n, info) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};

// ═══ A) sys_login.html — getrennte Schalter, kein Client-Fallback ═══════
console.log('■ A: Login-Seite — Firmen- und Klassen-Einstieg getrennt schaltbar');
{
  const html = readFileSync(join(ROOT, 'sys_login.html'), 'utf8');

  ok(/var\s+REGISTRATION_OPEN\s*=/.test(html), 'REGISTRATION_OPEN (Firma) existiert');
  ok(/var\s+STUDENT_REGISTRATION_OPEN\s*=/.test(html), 'STUDENT_REGISTRATION_OPEN (Klassencode) existiert');
  ok(html.indexOf('id="regEntry"') >= 0 && html.indexOf('id="studEntry"') >= 0,
    'zwei getrennte Einstiegs-Bloecke im Markup');

  // Der Firmen-Block darf den Klassen-Knopf NICHT mehr enthalten (sonst
  // oeffnet ein Schalter beide Tueren).
  const regBlock = html.slice(html.indexOf('id="regEntry"'), html.indexOf('id="studEntry"'));
  ok(regBlock.indexOf('_showStudent(') < 0, 'Klassen-Knopf steckt NICHT im Firmen-Block');
  const studBlock = html.slice(html.indexOf('id="studEntry"'), html.indexOf('id="regClosedNote"'));
  ok(studBlock.indexOf('_showStudent(') >= 0, 'Klassen-Knopf steckt im Klassen-Block');
  ok(studBlock.indexOf('_showRegister(') < 0, 'Firmen-Knopf steckt NICHT im Klassen-Block');

  // Sichtbarkeit: jeder Block folgt SEINEM Schalter.
  ok(/regEntry'\);[^\n]*REGISTRATION_OPEN\s*\?/.test(html), 'regEntry folgt REGISTRATION_OPEN');
  ok(/studEntry'\);[^\n]*STUDENT_REGISTRATION_OPEN\s*\?/.test(html), 'studEntry folgt STUDENT_REGISTRATION_OPEN');
  ok(/regClosedNote[\s\S]{0,220}REGISTRATION_OPEN\s*\|\|\s*STUDENT_REGISTRATION_OPEN/.test(html),
    'Hinweis «Wende dich an den Administrator» nur, wenn BEIDE zu sind');

  // Deep-Link ?klasse=CODE haengt am Studierenden-Schalter, nicht am Firmen-Schalter.
  ok(/klassenCode\s*&&\s*STUDENT_REGISTRATION_OPEN/.test(html),
    '?klasse=-Deeplink folgt STUDENT_REGISTRATION_OPEN');
  ok(!/klassenCode\s*&&\s*REGISTRATION_OPEN\b/.test(html),
    '?klasse=-Deeplink haengt NICHT mehr am Firmen-Schalter');

  // KRITISCH: kein Client-Fallback, der Sperre und Drossel umgeht.
  const studCheck = html.slice(html.indexOf('function _studCodeCheck'), html.indexOf('function _studSubmit'));
  ok(studCheck.length > 100, '_studCodeCheck gefunden');
  ok(studCheck.indexOf("loadCollection('schule'") < 0 && studCheck.indexOf('loadCollection("schule"') < 0,
    'kein direkter Klassen-Pool-Read als Fallback (umginge Sperre + Drossel)');
  ok(/res\.status\s*===\s*429/.test(studCheck), 'Drossel-Antwort (429) wird dem Nutzer erklaert');
  ok(/res\.status\s*===\s*403/.test(studCheck), 'geschlossene Registrierung (403) wird erklaert');
  ok(/res\.status\s*===\s*404\s*&&\s*code\.length\s*>=\s*6/.test(studCheck),
    'unbekannter Code erst beim vollstaendigen Code gemeldet (kein Flackern beim Tippen)');

  // Die Registrierung selbst darf ebenfalls keinen Client-Weg haben.
  const studSubmit = html.slice(html.indexOf('function _studSubmit'), html.indexOf('window._showStudent='));
  ok(studSubmit.indexOf('GemaAuth.register') < 0 && studSubmit.indexOf("saveRecord('auth'") < 0,
    'Registrierung legt kein Konto im Client an');
}

// ═══ B) gema-auth.js — Sperre + Drossel ════════════════════════════════
// Der Handler wird mit gestubbtem globalem fetch gegen eine In-Memory-
// «Datenbank» gefahren. Env wird beim Laden ausgewertet → pro Szenario
// wird das Modul frisch aus dem require-Cache geholt.
function ladeHandler(env) {
  Object.assign(process.env, {
    SUPABASE_SERVICE_KEY: 'testkey', GEMA_JWT_SECRET: 'testsecret',
    SUPABASE_URL: 'https://stub.invalid',
    GEMA_REGISTRATION_OPEN: '0', GEMA_STUDENT_REGISTRATION_OPEN: '0',
    GEMA_CLASSCODE_MAX_FAILS: '3', GEMA_STUDENT_REG_MAX_PER_HOUR: '2'
  }, env || {});
  delete require.cache[require.resolve(FN)];
  return require(FN).handler;
}

// Minimale gema_data-Tabelle: Map «module|key» → payload.data
function stubDb(seed) {
  const db = new Map(seed || []);
  globalThis.fetch = async (url, opts) => {
    opts = opts || {};
    const u = String(url);
    const qs = u.slice(u.indexOf('/rest/v1/') + 9);
    const val = (re) => { const m = qs.match(re); return m ? decodeURIComponent(m[1]) : null; };
    const json = (b) => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });

    if (opts.method === 'POST') {
      for (const row of JSON.parse(opts.body || '[]')) db.set(row.module_key + '|' + row.data_key, row.payload.data);
      return { ok: true, status: 201, text: async () => '' };
    }
    if (opts.method === 'DELETE') {
      const mk = val(/module_key=eq\.([^&]+)/), dk = val(/data_key=eq\.([^&]+)/);
      db.delete(mk + '|' + dk);
      return { ok: true, status: 204, text: async () => '' };
    }
    const mk = val(/module_key=eq\.([^&]+)/);
    const eq = val(/data_key=eq\.([^&]+)/);
    const like = val(/data_key=like\.([^&]+)/);
    const out = [];
    for (const [k, data] of db) {
      const [m, dk] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
      if (mk && m !== mk) continue;
      if (eq && dk !== eq) continue;
      if (like && dk.indexOf(like.replace(/\*/g, '')) !== 0) continue;
      out.push({ data_key: dk, payload: { data: data } });
    }
    return json(out);
  };
  return db;
}

const KLASSE = {
  id: 'kl_test', name: 'Kaltwasser HF_GT', lehrgang: 'HF Gebaeudetechnik',
  code: 'K7M2XA', orgId: 'org_schule', archiviert: false,
  dozentIds: ['u_doz'], studentIds: [], module: ['lu_tabelle']
};
const SEED = () => [
  ['schule|sklasse:kl_test', JSON.parse(JSON.stringify(KLASSE))],
  ['auth|org:org_schule', { id: 'org_schule', name: 'HF Gebaeudetechnik Testschule' }],
  ['auth|user:u_doz', { id: 'u_doz', username: 'doz@test.ch', roleIds: ['role_dozent'], orgId: 'org_schule', active: true }]
];
const ruf = (h, body, ip) => h({
  httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': ip || '198.51.100.7' },
  body: JSON.stringify(body)
}).then(r => ({ status: r.statusCode, j: JSON.parse(r.body || '{}') }));

console.log('■ B1: Geschlossene Registrierung sperrt BEIDE Endpunkte');
{
  const h = ladeHandler({ GEMA_STUDENT_REGISTRATION_OPEN: '0' });
  stubDb(SEED());
  const ci = await ruf(h, { action: 'class_info', code: 'K7M2XA' });
  ok(ci.status === 403, 'class_info mit RICHTIGEM Code → 403 (war frueher offen)', ci);
  const rs = await ruf(h, { action: 'register_student', code: 'K7M2XA', name: 'A', email: 'a@t.ch', password: 'geheim1' });
  ok(rs.status === 403, 'register_student → 403', rs.status);
}

console.log('■ B2: Offene Registrierung — richtiger Code funktioniert und kostet nichts');
{
  const h = ladeHandler({ GEMA_STUDENT_REGISTRATION_OPEN: '1' });
  stubDb(SEED());
  const ci = await ruf(h, { action: 'class_info', code: 'k7m2xa' });   // klein geschrieben
  ok(ci.status === 200 && ci.j.klasse && ci.j.klasse.name === 'Kaltwasser HF_GT',
    'class_info liefert die Klasse (Code case-insensitiv)', ci);
  ok(ci.j.klasse.org === 'HF Gebaeudetechnik Testschule', 'Schulname wird mitgeliefert');
  ok(ci.j.klasse.code === undefined && ci.j.klasse.studentIds === undefined,
    'Antwort enthaelt NUR Name/Lehrgang/Schule — kein Code, keine Mitgliederliste');

  // Eine ganze Klasse hinter EINER IP: viele RICHTIGE Lookups duerfen nie sperren.
  let alleOk = true;
  for (let i = 0; i < 12; i++) {
    const r = await ruf(h, { action: 'class_info', code: 'K7M2XA' });
    if (r.status !== 200) { alleOk = false; break; }
  }
  ok(alleOk, '12 richtige Lookups von derselben IP bleiben erlaubt (NAT-Schulklasse)');
}

console.log('■ B3: Falsche Codes werden gedrosselt (Brute-Force-Schutz)');
{
  const h = ladeHandler({ GEMA_STUDENT_REGISTRATION_OPEN: '1' });
  stubDb(SEED());
  const IP = '203.0.113.9';
  const s = [];
  for (let i = 0; i < 5; i++) s.push((await ruf(h, { action: 'class_info', code: 'ZZZZZ' + i }, IP)).status);
  ok(s.slice(0, 3).every(x => x === 404), 'erste 3 Fehlversuche → 404', s);
  ok(s.slice(3).every(x => x === 429), 'ab dem 4. Fehlversuch → 429 gesperrt', s);

  // Gesperrt heisst gesperrt — auch fuer register_student und den richtigen Code.
  const rs = await ruf(h, { action: 'register_student', code: 'K7M2XA', name: 'B', email: 'b@t.ch', password: 'geheim1' }, IP);
  ok(rs.status === 429, 'Sperre gilt auch fuer register_student', rs.status);
  const ci = await ruf(h, { action: 'class_info', code: 'K7M2XA' }, IP);
  ok(ci.status === 429, 'Sperre gilt auch fuer den richtigen Code (gleiche IP)', ci.status);

  // Andere IP ist unbetroffen.
  const andere = await ruf(h, { action: 'class_info', code: 'K7M2XA' }, '192.0.2.55');
  ok(andere.status === 200, 'andere IP ist nicht mitgesperrt', andere.status);

  // Auch register_student selbst zaehlt Fehlversuche hoch.
  const IP2 = '203.0.113.44';
  const t = [];
  for (let i = 0; i < 5; i++) {
    t.push((await ruf(h, { action: 'register_student', code: 'QQQQQ' + i, name: 'C', email: 'c' + i + '@t.ch', password: 'geheim1' }, IP2)).status);
  }
  ok(t.slice(0, 3).every(x => x === 404) && t.slice(3).every(x => x === 429),
    'register_student drosselt falsche Codes ebenfalls', t);
}

console.log('■ B4: Registrierung mit richtigem Code legt das Konto an');
{
  const h = ladeHandler({ GEMA_STUDENT_REGISTRATION_OPEN: '1' });
  const db = stubDb(SEED());
  const r = await ruf(h, { action: 'register_student', code: 'K7M2XA', name: 'Lea Muster', email: 'Lea@Test.CH', password: 'geheim1' });
  ok(r.status === 200 && r.j.ok && r.j.token, 'Registrierung erfolgreich, Token zurueck', r.status);
  ok(r.j.user && r.j.user.roleIds.join() === 'role_student', 'Rolle role_student', r.j.user && r.j.user.roleIds);
  ok(r.j.user.orgId === 'org_schule', 'Konto liegt in der Org der Klasse');
  ok(r.j.user.username === 'lea@test.ch', 'E-Mail normalisiert (klein)');
  ok(r.j.user.password === undefined, 'kein Passwort im User-Record');
  const cred = db.get('auth|cred:' + r.j.user.id);
  ok(cred && cred.alg === 'scrypt', 'Passwort liegt als scrypt im geschuetzten cred:-Record', cred && cred.alg);
  const kl = db.get('schule|sklasse:kl_test');
  ok(kl && kl.studentIds.indexOf(r.j.user.id) >= 0, 'in die Klasse eingetragen', kl && kl.studentIds);
  ok(kl.code === 'K7M2XA' && kl.module.join() === 'lu_tabelle', 'Klasse sonst unveraendert (Code/Module)');
  const notif = [...db.keys()].filter(k => k.indexOf('notify|notif:') === 0);
  ok(notif.length === 1, 'Dozent wird benachrichtigt', notif.length);

  // Zweite Registrierung mit derselben Mail + richtigem Passwort = nur Beitritt.
  const r2 = await ruf(h, { action: 'register_student', code: 'K7M2XA', name: 'Lea', email: 'lea@test.ch', password: 'geheim1' });
  ok(r2.status === 200 && r2.j.user.id === r.j.user.id, 'bestehendes Konto: kein Zweitkonto', r2.status);
  // …mit falschem Passwort NICHT.
  const r3 = await ruf(h, { action: 'register_student', code: 'K7M2XA', name: 'Fremd', email: 'lea@test.ch', password: 'falsch99' });
  ok(r3.status === 409, 'fremdes Passwort wird abgewiesen (kein Konto-Uebernahme)', r3.status);
}

console.log('■ B5: Massen-Konten mit geleaktem Code sind gedeckelt');
{
  const h = ladeHandler({ GEMA_STUDENT_REGISTRATION_OPEN: '1', GEMA_STUDENT_REG_MAX_PER_HOUR: '2' });
  stubDb(SEED());
  const IP = '198.51.100.200';
  const st = [];
  for (let i = 0; i < 4; i++) {
    st.push((await ruf(h, { action: 'register_student', code: 'K7M2XA', name: 'S' + i, email: 's' + i + '@t.ch', password: 'geheim1' }, IP)).status);
  }
  ok(st.slice(0, 2).every(x => x === 200), 'erste 2 Registrierungen gehen durch', st);
  ok(st.slice(2).every(x => x === 429), 'danach 429 (Massen-Anlage gedeckelt)', st);
  const frei = await ruf(h, { action: 'register_student', code: 'K7M2XA', name: 'X', email: 'x@t.ch', password: 'geheim1' }, '192.0.2.77');
  ok(frei.status === 200, 'andere IP kann weiterhin registrieren', frei.status);
}

console.log('■ B6: Router reicht das event durch (sonst greift keine Drossel)');
{
  const src = readFileSync(FN, 'utf8');
  ok(/case 'class_info':\s*return await actionClassInfo\(body,\s*event\)/.test(src), 'class_info bekommt event');
  ok(/case 'register_student':\s*return await actionRegisterStudent\(body,\s*event\)/.test(src), 'register_student bekommt event');
  ok(/GEMA_CLASSCODE_MAX_FAILS/.test(src) && /GEMA_STUDENT_REG_MAX_PER_HOUR/.test(src),
    'beide Limits sind per Env einstellbar');
}

console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
