// Drift-Guard: Lieferanten-Zuordnung im Benutzer-Modal (sys_admin.html)
//
// Hintergrund (Bugreport 05.08.2026, «ich bin als bwt eingeloggt, sehe aber
// keine Produkte»): Die Verknuepfung Konto ↔ Lieferanten-Datensatz lief bis
// dahin AUSSCHLIESSLICH ueber eine Heuristik im Dashboard (E-Mail → Org-Id →
// Firma → Org-NAME). Heisst die Firma nicht exakt wie im Lieferanten-Record
// («BWT» statt «BWT AQUA AG»), trifft keine davon — die Auto-Provisionierung
// legt daraufhin ein LEERES Profil an und schreibt dessen Id fest in
// user.lieferantId. Diese Zuordnung hat danach absoluten Vorrang und verdeckt
// die echten Produkte dauerhaft, auch wenn der Firmenname spaeter stimmt.
//
// Der Guard sichert beides ab: das neue Admin-Feld UND den Beweis, dass eine
// gesetzte Zuordnung die Produkte wirklich sichtbar macht (Teil C).
//
// Aufruf: CHROME=<chromium> node scripts/admin_lieferant_zuordnung_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, wireRoutes } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ Teil A — statisch ═══════════════════════════════════════════════════ */
console.log('■ A: Verdrahtung in sys_admin.html');
const AD = readFileSync('sys_admin.html', 'utf8');
ok('Feld im Benutzer-Modal vorhanden', /id="u_lief_wrap"[\s\S]{0,400}id="u_lieferantId"/.test(AD));
ok('Laden nur fuer den GEMA-Admin', /function _liefLaden\(\)\{\s*if\(!_isSuper\) return/.test(AD));
ok('Rendern nur fuer den GEMA-Admin', /if\(!_isSuper\|\|\(!istLief&&!cur\)\)\{ wrap\.style\.display='none'; return; \}/.test(AD));
ok('nur die Lieferanten-Rows werden geladen (kein voller Produktkatalog)',
  /loadCollection\('produktkatalog','lieferant:'\)/.test(AD));
ok('bestehende, unbekannte Zuordnung bleibt als ⚠-Option', /if\(cur&&!gefunden\)\{[\s\S]{0,200}⚠/.test(AD));
ok('_liefIdSetzen taste einen Wert bei verstecktem Feld NICHT an',
  /function _liefIdSetzen\(user\)\{[\s\S]{0,320}wrap\.style\.display==='none'\) return;/.test(AD));
ok('Speichern laeuft ueber _liefIdSetzen (Edit + Neuanlage)',
  (AD.match(/_liefIdSetzen\((users\[idx\]|neu)\)/g) || []).length === 2);
ok('esc deckt & < > " \' ab', /function esc\(s\)\{[\s\S]{0,180}\[&<>"'\]/.test(AD));

/* ═══ Browser ═════════════════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

/* Lieferanten- und Produkt-Pool wie nach dem Ausfuehren von
   supabase/gema_lieferanten_seed_v1.sql: orgId 'org_default', KEINE E-Mail —
   genau darum greift die Heuristik nur bei exaktem Firmennamen. */
const LIEF = [
  { id: 'lief_seed_bwt', orgId: 'org_default', firma: 'BWT AQUA AG', email: '', plz: '4147', ort: 'Aesch', status: 'aktiv', lieferantKategorien: ['enthaertung', 'osmose'] },
  { id: 'lief_seed_gruenbeck', orgId: 'org_default', firma: 'Grünbeck Wasseraufbereitung', email: '', plz: '8154', ort: 'Oberglatt', status: 'aktiv', lieferantKategorien: ['enthaertung'] }
];
const PROD = [
  { id: 'prod_seed_01_bwt_enthaertung', kategorie: 'enthaertung', lieferantId: 'lief_seed_bwt', lieferantFirma: 'BWT AQUA AG', status: 'nicht_verifiziert', dokumente: [], daten: { serie: 'Rondomat Duo', modell: 'DUO 2', nenndurchfluss: 40 } },
  { id: 'prod_seed_02_bwt_osmose', kategorie: 'osmose', lieferantId: 'lief_seed_bwt', lieferantFirma: 'BWT AQUA AG', status: 'nicht_verifiziert', dokumente: [], daten: { serie: 'Bewamat Osmo', modell: 'OSMO 300', permeatleistung: 300 } },
  { id: 'prod_seed_03_gruenbeck_enth', kategorie: 'enthaertung', lieferantId: 'lief_seed_gruenbeck', lieferantFirma: 'Grünbeck Wasseraufbereitung', status: 'nicht_verifiziert', dokumente: [], daten: { serie: 'softliQ', modell: 'SD18', nenndurchfluss: 30 } }
];

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
function jwt(uid, org) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iat: now, exp: now + 30 * 86400, uid, org, role: 'authenticated' }) + '.sig';
}

/* Cloud-Mock: liefert je module_key/Prefix echte per-Record-Rows. Liegt NACH
   wireRoutes und gewinnt deshalb gegen dessen pauschales []. */
async function cloud(ctx, gesendet) {
  await ctx.route(/rest\/v1\/gema_data/, route => {
    const u = route.request().url();
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    let rows = [];
    if (/module_key=eq\.produktkatalog/.test(u)) {
      if (/data_key=like\.lieferant/.test(u)) rows = LIEF.map(l => ({ data_key: 'lieferant:' + l.id, payload: { data: l } }));
      else if (/data_key=like\.produkt/.test(u)) rows = PROD.map(p => ({ data_key: 'produkt:' + p.id, payload: { data: p } }));
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  // gema-auth-Function: Erfolg melden UND den persist_auth-Payload mitschneiden.
  await ctx.route(/gema-auth/, route => {
    try {
      const b = JSON.parse(route.request().postData() || '{}');
      if (b.action === 'persist_auth') gesendet.push(...(b.records || []));
    } catch (e) { /* egal — der Test prueft den Mitschnitt separat */ }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

function konto(userId, name, orgId, orgName, roleIds, extra) {
  return Object.assign({
    gema_orgs_v1: [
      { id: 'org_gema', name: 'GEMA', kategorien: ['sanitaerplaner'], admins: [], active: true },
      { id: orgId, name: orgName, kategorien: ['lieferant'], admins: [userId], active: true }
    ],
    gema_users_v1: [{ id: userId, username: name.toLowerCase() + '@test.ch', name, roleIds, orgId, active: true, profile: { email: name.toLowerCase() + '@test.ch' } }],
    gema_session_v1: { userId, expires: FUTURE, token: jwt(userId, orgId) },
    gema_pk_lief_pool_v1: JSON.stringify(LIEF),
    gema_pk_prod_pool_v1: JSON.stringify(PROD)
  }, extra || {});
}

async function seite(url, st, gesendet) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await wireRoutes(ctx);
  await cloud(ctx, gesendet || []);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  return { ctx, page, errs };
}

/* Zustand des Zuordnungs-Feldes im offenen Benutzer-Modal. */
const feld = p => p.evaluate(() => {
  const w = document.getElementById('u_lief_wrap'), s = document.getElementById('u_lieferantId');
  return {
    sichtbar: !!w && w.style.display !== 'none',
    wert: s ? s.value : null,
    optionen: s ? [...s.options].map(o => o.textContent.trim()) : []
  };
});

/* ═══ Teil B — das Admin-Feld ═════════════════════════════════════════════ */
console.log('\n■ B: Zuordnung im Benutzer-Modal (GEMA-Admin)');
{
  const gesendet = [];
  const st = konto('u_adm', 'Admin', 'org_gema', 'GEMA', ['role_admin']);
  st.gema_users_v1.push(
    { id: 'u_bwt', username: 'info@bwt.ch', name: 'BWT Konto', roleIds: ['role_lieferant_admin'], orgId: 'org_bwt', active: true, profile: { email: 'info@bwt.ch' } },
    { id: 'u_planer', username: 'p@buero.ch', name: 'Planer Konto', roleIds: ['role_planer'], orgId: 'org_bwt', active: true, profile: { email: 'p@buero.ch' } },
    { id: 'u_alt', username: 'alt@bwt.ch', name: 'Alt-Zuordnung', roleIds: ['role_lieferant_admin'], orgId: 'org_bwt', active: true, lieferantId: 'lief_geist_123', profile: { email: 'alt@bwt.ch' } }
  );
  st.gema_orgs_v1.push({ id: 'org_bwt', name: 'BWT', kategorien: ['lieferant'], admins: [], active: true });
  const { ctx, page, errs } = await seite('/sys_admin.html', st, gesendet);

  // B1 — Lieferanten-Rolle: Feld sichtbar, echte Firmen zur Auswahl
  await page.evaluate(() => openUserModal('u_bwt'));
  await page.waitForTimeout(900);
  {
    const f = await feld(page);
    ok('Feld erscheint bei einer Lieferanten-Rolle', f.sichtbar);
    ok('keine Zuordnung vorausgewaehlt', f.wert === '', f.wert);
    ok('beide Seed-Firmen stehen zur Auswahl',
      f.optionen.some(o => /BWT AQUA AG/.test(o)) && f.optionen.some(o => /Grünbeck/.test(o)), f.optionen);
    ok('Ort steht zur Unterscheidung dabei', f.optionen.some(o => /4147 Aesch/.test(o)), f.optionen);
  }

  // B2 — setzen + speichern
  await page.selectOption('#u_lieferantId', 'lief_seed_bwt');
  await page.evaluate(() => saveUser());
  await page.waitForTimeout(900);
  {
    const rec = gesendet.filter(r => r.key === 'user:u_bwt').pop();
    ok('Zuordnung landet im gespeicherten Datensatz', rec && rec.data.lieferantId === 'lief_seed_bwt', rec && rec.data.lieferantId);
    const zu = await page.evaluate(() => document.getElementById('userModal').classList.contains('show') === false || document.getElementById('userModal').style.display === 'none');
    ok('Modal ist nach dem Speichern zu', zu);
  }

  // B3 — Zuordnung wieder entfernen
  gesendet.length = 0;
  await page.evaluate(() => openUserModal('u_bwt'));
  await page.waitForTimeout(900);
  {
    const f = await feld(page);
    ok('gesetzte Zuordnung ist beim erneuten Oeffnen vorgewaehlt', f.wert === 'lief_seed_bwt', f.wert);
  }
  await page.selectOption('#u_lieferantId', '');
  await page.evaluate(() => saveUser());
  await page.waitForTimeout(900);
  {
    const rec = gesendet.filter(r => r.key === 'user:u_bwt').pop();
    ok('«keine Zuordnung» entfernt das Feld wirklich',
      rec && !Object.prototype.hasOwnProperty.call(rec.data, 'lieferantId'), rec && rec.data.lieferantId);
  }

  // B4 — Konto ohne Lieferanten-Rolle: Feld bleibt weg
  await page.evaluate(() => openUserModal('u_planer'));
  await page.waitForTimeout(700);
  ok('Planer-Konto zeigt das Feld nicht', !(await feld(page)).sichtbar);

  // B5 — unbekannte Alt-Zuordnung (typisch: auto-angelegtes Leer-Profil)
  gesendet.length = 0;
  await page.evaluate(() => openUserModal('u_alt'));
  await page.waitForTimeout(900);
  {
    const f = await feld(page);
    ok('unbekannte Zuordnung bleibt ausgewaehlt', f.wert === 'lief_geist_123', f.wert);
    ok('und wird als ⚠ ausgewiesen', f.optionen.some(o => /⚠.*lief_geist_123/.test(o)), f.optionen);
  }
  // Speichern aus einem GANZ ANDEREN Grund (Name korrigiert) darf die
  // Zuordnung nicht nebenbei verlieren.
  await page.fill('#u_name', 'Alt-Zuordnung (korrigiert)');
  await page.evaluate(() => saveUser());
  await page.waitForTimeout(900);
  {
    const rec = gesendet.filter(r => r.key === 'user:u_alt').pop();
    ok('Speichern aus anderem Grund verliert sie nicht', rec && rec.data.lieferantId === 'lief_geist_123', rec && rec.data.lieferantId);
    ok('und der eigentliche Grund ist mitgespeichert', rec && /korrigiert/.test(rec.data.name || ''), rec && rec.data.name);
  }

  // B6 — auf die echte Firma umbiegen (der eigentliche Anwendungsfall)
  gesendet.length = 0;
  await page.evaluate(() => openUserModal('u_alt'));
  await page.waitForTimeout(900);
  await page.selectOption('#u_lieferantId', 'lief_seed_bwt');
  await page.evaluate(() => saveUser());
  await page.waitForTimeout(900);
  {
    const rec = gesendet.filter(r => r.key === 'user:u_alt').pop();
    ok('Umbiegen auf die echte Firma wird gespeichert', rec && rec.data.lieferantId === 'lief_seed_bwt', rec && rec.data.lieferantId);
  }
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

/* ═══ Org-Admin: das Feld gibt es fuer ihn NICHT ══════════════════════════ */
console.log('\n■ B7: Org-Admin sieht das Feld nie (Pool ist org-uebergreifend)');
{
  const gesendet = [];
  // Rolle mit Landing «index» — sonst wirft der Rollen-Redirect den
  // Org-Admin von sys_admin.html direkt in seinen Workspace.
  const st = konto('u_oadm', 'OrgAdmin', 'org_bwt', 'BWT', ['role_magaziner']);
  st.gema_orgs_v1[1].admins = ['u_oadm'];
  st.gema_users_v1.push({ id: 'u_mit', username: 'm@bwt.ch', name: 'Mitarbeiter', roleIds: ['role_lieferant_produkte'], orgId: 'org_bwt', active: true, lieferantId: 'lief_seed_gruenbeck', profile: { email: 'm@bwt.ch' } });
  const { ctx, page, errs } = await seite('/sys_admin.html', st, gesendet);
  await page.evaluate(() => openUserModal('u_mit'));
  await page.waitForTimeout(900);
  {
    const f = await feld(page);
    ok('Feld bleibt fuer den Org-Admin verborgen', !f.sichtbar);
  }
  await page.fill('#u_name', 'Mitarbeiter (umbenannt)');
  await page.evaluate(() => saveUser());
  await page.waitForTimeout(900);
  {
    const rec = gesendet.filter(r => r.key === 'user:u_mit').pop();
    ok('bestehende Zuordnung bleibt beim Speichern unangetastet',
      rec && rec.data.lieferantId === 'lief_seed_gruenbeck', rec && (rec.data.lieferantId || '(fehlt)'));
  }
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

/* ═══ Teil C — der Beweis: Zuordnung macht die Produkte sichtbar ══════════ */
console.log('\n■ C: Wirkung im Lieferanten-Dashboard');
{
  /* C1 — der gemeldete Zustand: Org heisst «BWT», der Lieferanten-Record
     «BWT AQUA AG». Keine Heuristik trifft → leeres Auto-Profil, 0 Produkte. */
  const st1 = konto('u_bwt', 'BWT Konto', 'org_bwt', 'BWT', ['role_lieferant_admin']);
  const s1 = await seite('/sys_lieferant_dashboard.html', st1, []);
  await s1.page.waitForTimeout(1200);
  {
    const t = await s1.page.evaluate(() => (document.getElementById('prodList') || {}).textContent || '');
    ok('ohne Zuordnung: keine Produkte (das gemeldete Symptom)', /Keine Produkte gefunden/.test(t), t.slice(0, 80));
  }
  await s1.ctx.close();

  /* C2 — mit gesetzter Zuordnung sieht dasselbe Konto seine echten Produkte. */
  const st2 = konto('u_bwt', 'BWT Konto', 'org_bwt', 'BWT', ['role_lieferant_admin']);
  st2.gema_users_v1[0].lieferantId = 'lief_seed_bwt';
  const s2 = await seite('/sys_lieferant_dashboard.html', st2, []);
  await s2.page.waitForTimeout(1200);
  {
    const t = await s2.page.evaluate(() => (document.getElementById('prodList') || {}).textContent || '');
    ok('mit Zuordnung: die BWT-Produkte erscheinen', /Rondomat Duo/.test(t) && /Bewamat Osmo/.test(t), t.slice(0, 140));
    ok('und NUR die eigenen (keine fremde Firma)', !/softliQ/.test(t), t.slice(0, 140));
    const firma = await s2.page.evaluate(() => (document.getElementById('navFirma') || {}).textContent || '');
    ok('das Dashboard nennt die richtige Firma', /BWT AQUA AG/.test(firma), firma);
  }
  ok('keine JS-Fehler', s2.errs.length === 0, s2.errs.slice(0, 2));
  await s2.ctx.close();
}

await browser.close();
server.close();
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
