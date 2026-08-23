// Drift-Guard: Feedback 23.08.2026 · Runde 2
//   E1  «man soll benutzer verschiedenen orgs hinzufügen können, zb firma und schule»
//   E2  «wenn man eine klasse erstellt, soll man wählen können, wo diese erstellt wird»
//   E3  «ebenso sollen die eimer, die automatisiert erstellt werden mit allen
//        klassenmitgliedern auch wieder gelöscht werden können»
//   F   «foto von profil soll avatar mit buchstaben oben links im workspace ersetzen»
//
// Ausfuehren:  CHROME=<chromium> node scripts/feedback_20260823_1_test.mjs
import { readFileSync } from 'fs';
import { join } from 'path';
import { startServer, ROOT, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';

let ok = 0, fail = 0;
const t = (name, cond, info) => { if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? ' — ' + info : '')); } };
const R = f => readFileSync(join(ROOT, f), 'utf8');

// ══ Teil A — statisch ═══════════════════════════════════════════════════
console.log('\n── A · Statisch ──');
const admin = R('sys_admin.html');
const auth  = R('gema_auth.js');
const unt   = R('sys_unternehmen.html');
const klass = R('ab_klassen.html');
const ws    = R('sys_workspace.html');

// E1 — Mehrfach-Org im Benutzer-Modal
t('A1 sys_admin: Gast-Block im Benutzer-Modal', /id="u_gast_wrap"/.test(admin) && /id="u_gast_list"/.test(admin));
t('A2 sys_admin: _renderUserGastListe + _gastZugaengeSetzen',
  /function _renderUserGastListe/.test(admin) && /function _gastZugaengeSetzen/.test(admin));
t('A3 sys_admin: nur GEMA-Admin (org-uebergreifender Gast-Pool)',
  /_gastZugaengeSetzen[\s\S]{0,200}?if\(!_isSuper/.test(admin));
t('A4 sys_admin: bei Org-Wechsel im Modal neu rendern',
  /orgSel\.onchange[\s\S]{0,220}?_renderUserGastListe/.test(admin));
t('A5 sys_admin: saveUser schreibt die Gastzugaenge',
  (admin.match(/_gastZugaengeSetzen\(/g) || []).length >= 3);
t('A6 gema_auth: Gast-Aktionen liefern das Server-Promise',
  /bewilligeGast[\s\S]{0,900}?return Promise\.resolve\(w\.GemaAuth\.saveUsers/.test(auth) &&
  /deaktivierGast[\s\S]{0,900}?return Promise\.resolve\(w\.GemaAuth\.saveUsers/.test(auth));
t('A7 gema_auth: requestGastZugang gibt weiter das Gast-Objekt zurueck',
  /gast\.gespeichert=Promise\.resolve/.test(auth) && /requestGastZugang[\s\S]{0,1600}?return gast;/.test(auth));
t('A8 sys_unternehmen: Erfolg erst nach Server-Antwort (_gastFertig)',
  /function _gastFertig/.test(unt) && /res\.ok===false/.test(unt));
t('A9 sys_unternehmen: keine nativen prompt() mehr im Gast-Flow',
  !/\bwindow\.prompt\(|[^.\w]prompt\(/.test(unt.slice(unt.indexOf('function addGast'), unt.indexOf('function addGast') + 2600)));

// E2 — Org-Wahl bei der Klasse
t('A10 ab_klassen: klOrgs (Haupt-Org + Gastzugaenge)',
  /function klOrgs\(\)/.test(klass) && /GemaAuth\.getGastOrgs/.test(klass));
t('A11 ab_klassen: Org-Wahl als eigener Schritt in klNeu',
  /klNeu=function[\s\S]{0,700}?klOrgWaehlen\(/.test(klass));
t('A12 ab_klassen: Namens-Prompt bleibt (schule_klasse_persistenz_test)',
  /klNeu=function\(\)\{\s*GemaDialog\.prompt\(/.test(klass));
t('A13 ab_klassen: bei nur EINER Org kein zweiter Schritt',
  /function klOrgWaehlen[\s\S]{0,320}?if\(liste\.length<2\)return Promise\.resolve/.test(klass));
t('A14 ab_klassen: Org in den Stammdaten sichtbar + wechselbar',
  /function klOrgZeileHtml/.test(klass) && /klOrgWechseln=function/.test(klass));
t('A15 sys_workspace: _wsOrgAdresse nimmt die Klassen-Org',
  /function _wsOrgAdresse\(orgId\)/.test(ws) &&
  /_wsUebungsEimer[\s\S]{0,400}?var adr=_wsOrgAdresse\(oid\)/.test(ws));
t('A16 gema-auth: Studierende landen in der Org der KLASSE',
  /orgId: klasse\.orgId/.test(R('netlify/functions/gema-auth.js')));

// E3 — Auto-Eimer entfernen
t('A17 sys_workspace: Loeschbarkeit nur fuer Dozenten der Klasse',
  /function _wsKlassenEimerLoeschbar[\s\S]{0,600}?k\.dozentIds/.test(ws));
t('A18 sys_workspace: Paket = Klassen-Eimer + Uebungs-Eimer',
  /function _wsKlassenPaket[\s\S]{0,300}?ws_ue_/.test(ws));
t('A19 sys_workspace: Wiederauferstehungs-Schutz via wsEimer===false',
  /if\(k\.wsEimer===false\)return false;/.test(ws));
t('A20 sys_workspace: Flag NUR per saveRecord (Pool org-uebergreifend)',
  /function _wsKlasseFlag[\s\S]{0,700}?GemaSync\.saveRecord\('schule','sklasse:'/.test(ws) &&
  !/_wsKlasseFlag[\s\S]{0,700}?persistCollection/.test(ws));
t('A21 sys_workspace: Uebungs-Eimer allein bleibt gesperrt',
  /if\(b\.autoTyp==='uebung'\)\{toast\(/.test(ws));
t('A22 sys_workspace: Auto-Objekte werden NICHT geloescht',
  !/_wsDoDeleteKlasse[\s\S]{0,900}?deleteRecord\('objekte'/.test(ws) &&
  /_wsDoDeleteKlasse/.test(ws));
t('A23 ab_klassen: Rueckweg «Wieder anlegen»',
  /klWsEimer=function/.test(klass) && /function klWsEimerZeileHtml/.test(klass));
t('A24 ab_klassen: Klassen-Loeschen raeumt die Eimer weg (nur deleteRecord)',
  /function klWsEimerWeg[\s\S]{0,900}?GemaSync\.deleteRecord\('workspace','ws:'/.test(klass) &&
  /klWsEimerWeg\(k\.id\);/.test(klass));

// F — Profilbild
t('A25 sys_workspace: _wsAvatarIch liest user.avatar || profile.avatar',
  /function _wsFotoVon[\s\S]{0,200}?u\.avatar\|\|\(u\.profile&&u\.profile\.avatar\)/.test(ws));
t('A26 sys_workspace: renderUser nutzt _wsAvatarIch',
  /_wsAvatarIch\(u,initials,40/.test(ws));
t('A27 sys_workspace: Initialen bleiben als Fallback im Kreis',
  /_wsAvatarIch[\s\S]{0,700}?esc\(initials\)[\s\S]{0,300}?<img src=/.test(ws));
t('A28 sys_workspace: gema_avatar.js wird NICHT geladen (Kanon Feld-Lesen)',
  !/src="gema_avatar\.js"/.test(ws));

// ══ Teil B — Browser ════════════════════════════════════════════════════
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('\n⚠ playwright-core fehlt — Teil B übersprungen'); report(); }
const exe = process.env.CHROME;
if (!exe) { console.log('\n⚠ CHROME nicht gesetzt — Teil B übersprungen'); report(); }

console.log('\n── B · Browser ──');
const server = await startServer();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

const KLASSE = {
  id: 'kl_1', name: 'Kaltwasser HF 2026', code: 'ABC234', orgId: 'org_schule',
  dozentIds: ['u_test'], studentIds: ['u_stud1', 'u_stud2'], module: [], archiviert: false,
  erstelltAm: '2026-08-01T08:00:00.000Z'
};

function baseSeed(extra) {
  const s = seed(['role_dozent']);
  s.gema_orgs_v1 = [
    { id: 'org_test', name: 'Testfirma AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_test'], active: true },
    { id: 'org_schule', name: 'Berufsschule Nord', kategorie: 'schule', kategorien: ['schule'], admins: [], active: true,
      adresse: { strasse: 'Schulweg 3', plz: '4600', ort: 'Olten' } }
  ];
  s.gema_users_v1 = [
    { id: 'u_test', username: 'd@test.ch', name: 'Dora Dozentin', roleIds: ['role_dozent'], orgId: 'org_test', active: true,
      profile: { email: 'd@test.ch' },
      gastZugaenge: [{ orgId: 'org_schule', orgName: 'Berufsschule Nord', status: 'aktiv', gueltigBis: null, erstelltAm: '2026-08-01' }] },
    { id: 'u_stud1', username: 's1@test.ch', name: 'Sam Student', roleIds: ['role_student'], orgId: 'org_schule', active: true, profile: { email: 's1@test.ch' } },
    { id: 'u_stud2', username: 's2@test.ch', name: 'Tara Test', roleIds: ['role_student'], orgId: 'org_schule', active: true, profile: { email: 's2@test.ch' } }
  ];
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  s.gema_coachmarks_done_ab_klassen = '1';
  return Object.assign(s, extra || {});
}

// Collection-Routen NACH wireRoutes (wireRoutes liefert sonst auf jeden GET [])
async function coll(ctx, map) {
  await ctx.route('**/rest/v1/gema_data*', route => {
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const u = route.request().url();
    for (const [needle, rows] of Object.entries(map)) {
      if (u.indexOf(needle) >= 0) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });
}

async function openPage(url, seedObj, routeMap) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await wireRoutes(ctx);
  if (routeMap) await coll(ctx, routeMap);
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seedObj);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 140)));
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}

// ── B1 · Profilbild im Workspace (F) ───────────────────────────────────
{
  const FOTO = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  const s = baseSeed();
  s.gema_users_v1[0].avatar = FOTO;
  const { ctx, page } = await openPage('/sys_workspace.html', s);
  const r = await page.evaluate(() => {
    const box = document.querySelector('#wsUser .ws-avatar');
    const img = box && box.querySelector('img');
    return { hatBox: !!box, hatImg: !!img, txt: box ? box.textContent.trim() : '',
      w: img ? Math.round(img.getBoundingClientRect().width) : 0 };
  });
  t('B1 Profilbild ersetzt die Initialen im User-Block', r.hatBox && r.hatImg && r.w > 20, JSON.stringify(r));
  t('B2 Initialen bleiben als Fallback im Kreis stehen', r.txt.length > 0 && r.txt.length <= 3, 'txt=' + r.txt);
  await ctx.close();
}
// Gegenprobe: ohne Foto weiter Initialen
{
  const { ctx, page } = await openPage('/sys_workspace.html', baseSeed());
  const r = await page.evaluate(() => {
    const box = document.querySelector('#wsUser .ws-avatar');
    return { txt: box ? box.textContent.trim() : '', img: !!(box && box.querySelector('img')) };
  });
  t('B3 Ohne Foto weiterhin Initialen (kein leerer Kreis)', !r.img && r.txt.length >= 1, JSON.stringify(r));
  await ctx.close();
}

// ── B4 · Org-Wahl beim Klassen-Anlegen (E2) ────────────────────────────
{
  const { ctx, page } = await openPage('/ab_klassen.html', baseSeed(), { 'sklasse': [] });
  const orgs = await page.evaluate(() => (window._klHooks ? window._klHooks.orgs() : null));
  t('B4 klOrgs liefert Haupt-Org UND Gast-Org', Array.isArray(orgs) && orgs.length === 2 &&
    orgs.some(o => o.id === 'org_test' && o.haupt) && orgs.some(o => o.id === 'org_schule'), JSON.stringify(orgs));

  await page.click('#btnNeueKlasse');
  await page.waitForTimeout(250);
  await page.fill('.gema-dlg-input', 'Testklasse A');
  await page.click('.gema-dlg-confirm');
  await page.waitForTimeout(350);
  const opts = await page.$$eval('.klorg-opt', els => els.map(e => e.getAttribute('data-oid')));
  t('B5 Org-Wahl erscheint nach dem Namen', opts.length === 2, JSON.stringify(opts));
  await page.click('.klorg-opt[data-oid="org_schule"]');
  await page.waitForTimeout(600);
  const gespeichert = await page.evaluate(() => {
    const raw = localStorage.getItem('gema_schule_klassen_pool_v1');
    const arr = raw ? JSON.parse(raw) : [];
    const k = arr.find(x => x && x.name === 'Testklasse A');
    return k ? { orgId: k.orgId } : null;
  });
  t('B6 Klasse liegt in der gewaehlten Org', gespeichert && gespeichert.orgId === 'org_schule', JSON.stringify(gespeichert));
  await ctx.close();
}
// Gegenprobe: nur EINE Org → kein zweiter Schritt
{
  const s = baseSeed();
  delete s.gema_users_v1[0].gastZugaenge;
  const { ctx, page } = await openPage('/ab_klassen.html', s, { 'sklasse': [] });
  await page.click('#btnNeueKlasse');
  await page.waitForTimeout(250);
  await page.fill('.gema-dlg-input', 'Nur eine Org');
  await page.click('.gema-dlg-confirm');
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const raw = localStorage.getItem('gema_schule_klassen_pool_v1');
    const arr = raw ? JSON.parse(raw) : [];
    return { picker: document.querySelectorAll('.klorg-opt').length, angelegt: arr.some(x => x && x.name === 'Nur eine Org') };
  });
  t('B7 Eine Org → keine Rueckfrage, Klasse direkt angelegt', r.picker === 0 && r.angelegt, JSON.stringify(r));
  await ctx.close();
}

// ── B8 · Klassen-Eimer entfernen (E3) ──────────────────────────────────
const wsRow = (id, payload) => ({ module_key: 'workspace', data_key: 'ws:' + id, payload: { data: payload }, last_modified: '2026-08-20T10:00:00Z' });
const klRow = k => ({ module_key: 'schule', data_key: 'sklasse:' + k.id, payload: { data: k }, last_modified: '2026-08-20T10:00:00Z' });

{
  const { ctx, page } = await openPage('/sys_workspace.html', baseSeed(), { 'sklasse': [klRow(KLASSE)] });
  await page.waitForTimeout(1500);
  const vor = await page.evaluate(() => {
    const b = window._wsHooks.buckets();
    return { kl: b.filter(x => x.autoTyp === 'klasse').map(x => x.id),
             ue: b.filter(x => x.autoTyp === 'uebung').map(x => x.id) };
  });
  t('B8 Klassen-Eimer wird automatisch angelegt', vor.kl.indexOf('ws_kl_kl_1') >= 0, JSON.stringify(vor));
  const darf = await page.evaluate(() => {
    const b = window._wsHooks.buckets().find(x => x.id === 'ws_kl_kl_1');
    return b ? window._wsHooks.klEimerLoeschbar(b) : null;
  });
  t('B9 Dozentin darf das Paket entfernen', darf === true, String(darf));

  await page.evaluate(() => window._wsConfirmDelete('ws_kl_kl_1'));
  await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => {
    const m = document.querySelector('.ws-modal, #wsModal');
    return m ? m.textContent : '';
  });
  t('B10 Dialog erklaert, dass die Projekte bleiben', /Projekte samt Berechnungen bleiben erhalten/.test(dlg), dlg.slice(0, 120));

  await page.evaluate(() => window._wsDoDeleteKlasse('ws_kl_kl_1'));
  await page.waitForTimeout(600);
  const nach = await page.evaluate(() => {
    const b = window._wsHooks.buckets();
    const raw = localStorage.getItem('gema_schule_klassen_pool_v1');
    const arr = raw ? JSON.parse(raw) : [];
    const k = arr.find(x => x && x.id === 'kl_1');
    return { kl: b.filter(x => x.autoTyp === 'klasse').length,
             ue: b.filter(x => x.autoTyp === 'uebung').length,
             flag: k ? k.wsEimer : 'keine-klasse' };
  });
  t('B11 Klassen-Eimer entfernt', nach.kl === 0, JSON.stringify(nach));
  t('B12 Uebungs-Eimer der Mitglieder gehen mit', nach.ue === 0, JSON.stringify(nach));
  t('B13 Klasse traegt wsEimer:false (Wiederauferstehungs-Schutz)', nach.flag === false, String(nach.flag));
  await ctx.close();
}
// Wiederauferstehung: Reload mit wsEimer:false legt nichts neu an
{
  const kAus = Object.assign({}, KLASSE, { wsEimer: false });
  const { ctx, page } = await openPage('/sys_workspace.html', baseSeed(), { 'sklasse': [klRow(kAus)] });
  await page.waitForTimeout(1600);
  const r = await page.evaluate(() => window._wsHooks.buckets().filter(x => x.autoTyp === 'klasse' || x.autoTyp === 'uebung').length);
  t('B14 Nach dem Entfernen kommen die Eimer nicht zurueck', r === 0, 'auto-Eimer=' + r);
  await ctx.close();
}
// Studierende duerfen NICHT loeschen
{
  const s = baseSeed();
  s.gema_session_v1 = Object.assign({}, s.gema_session_v1, { userId: 'u_stud1' });
  s.gema_users_v1[0].roleIds = ['role_dozent'];
  s.gema_student_mods_v1 = { userId: 'u_stud1', mods: [], exams: {}, ts: Date.now() };
  const { ctx, page } = await openPage('/sys_workspace.html', s, { 'sklasse': [klRow(KLASSE)] });
  await page.waitForTimeout(1600);
  const r = await page.evaluate(() => {
    const b = window._wsHooks.buckets().find(x => x.id === 'ws_kl_kl_1');
    return b ? window._wsHooks.klEimerLoeschbar(b) : 'kein-eimer';
  });
  t('B15 Studierende duerfen den Klassen-Eimer NICHT entfernen', r === false, String(r));
  await ctx.close();
}

// ── B16 · Mehrfach-Org im Benutzer-Modal (E1) ──────────────────────────
{
  const s = baseSeed();
  s.gema_users_v1[0].roleIds = ['role_admin'];
  const { ctx, page } = await openPage('/sys_admin.html', s);
  await page.evaluate(() => { if (window.openUserModal) window.openUserModal(1); });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const wrap = document.getElementById('u_gast_wrap');
    const boxes = Array.from(document.querySelectorAll('#u_gast_list input[type=checkbox]'));
    const sicht = wrap ? getComputedStyle(wrap).display !== 'none' && wrap.getBoundingClientRect().height > 0 : false;
    return { sicht: sicht, n: boxes.length, orgs: boxes.map(b => b.getAttribute('data-oid') || b.value) };
  });
  t('B16 Gast-Block sichtbar fuer den GEMA-Admin', r.sicht === true, JSON.stringify(r));
  t('B17 Haupt-Org steht NICHT als Gast zur Wahl', r.n >= 1 && r.orgs.indexOf('org_schule') >= 0 && r.orgs.indexOf('org_test') < 0, JSON.stringify(r));
  await ctx.close();
}
// Gegenprobe: Org-Admin sieht den Block nicht
{
  const s = baseSeed();
  s.gema_users_v1[0].roleIds = ['role_sanitaerplaner'];
  s.gema_orgs_v1[0].admins = ['u_test'];
  const { ctx, page } = await openPage('/sys_admin.html', s);
  await page.evaluate(() => { if (window.openUserModal) window.openUserModal(1); });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const wrap = document.getElementById('u_gast_wrap');
    if (!wrap) return 'kein-wrap';
    return getComputedStyle(wrap).display !== 'none' && wrap.getBoundingClientRect().height > 0;
  });
  t('B18 Org-Admin sieht die Mehrfach-Org-Zuordnung NICHT', r === false || r === 'kein-wrap', String(r));
  await ctx.close();
}

await browser.close();
server.close();
report();

function report() {
  console.log('\n' + '─'.repeat(52));
  console.log(fail === 0 ? `✅ ${ok} Checks OK` : `❌ ${fail} von ${ok + fail} fehlgeschlagen`);
  process.exit(fail === 0 ? 0 : 1);
}
