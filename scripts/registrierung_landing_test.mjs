// Nach der Registrierung direkt in den Workspace (05.08.2026)
//
// Bugreport: «wenn man sich mit dem Klassencode registriert, kommt die
// Meldung Willkommen XY, aber man landet dann zuerst wieder im Login-Screen
// und erst nach dem Anmelden im Workspace.»
//
// URSACHE: Die Registrierung schrieb NUR `gema_session_v1`. Der Boot-Check
// in gema_auth.js prueft aber SYNCHRON gegen den lokalen Benutzer-Cache
// (`gema_users_v1`) — der Cloud-Pull kommt erst danach. Der frisch angelegte
// Benutzer stand dort nicht, also wurde die Sitzung sofort wieder geloescht
// und die Zielseite warf einen auf den Login. Nach dem manuellen Login
// klappte es, weil `loginAsync` den Benutzer in den Cache mergt.
//
// FIX: `GemaAuth.adoptSession(user, opts)` ist die eine Wahrheit fuer
// «Sitzung eroeffnen» (Login, Einladungs-Aktivierung, beide Registrierungen)
// und schreibt Sitzung UND Benutzer-Cache. Studierende landen zudem auf der
// Startseite ihrer Rolle (Workspace) statt fix in ab_klassen.html.
//
// Abgesichert:
//   A) Statisch: Helfer vorhanden, beide Registrierungen nutzen ihn, kein
//      roher Sitzungs-Write mehr, kein hart verdrahtetes Redirect-Ziel.
//   B) Browser: Klassencode-Registrierung → Workspace, OHNE zweiten Login.
//   C) Browser: leere UND fremd-gefuellte Cloud-Antwort entwerten die
//      frische Sitzung nicht (Empty-Read-Guard + _reassertAdopted).
//   D) Browser: Firmen-Registrierung landet ebenfalls auf der Rollen-Startseite.
//
// Aufruf: CHROME=<chromium> node scripts/registrierung_landing_test.mjs
import { readFileSync } from 'node:fs';
import { startServer, BASE, ROOT } from './rolematrix_harness.mjs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, n, info) => {
  if (c) { pass++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};

// ═══ A) Statisch ═══════════════════════════════════════════════════════
console.log('■ A: Sitzungs-Uebernahme ist eine Wahrheit');
const AUTH = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
const LOGIN = readFileSync(join(ROOT, 'sys_login.html'), 'utf8');
{
  ok(/adoptSession\s*:\s*function/.test(AUTH), 'GemaAuth.adoptSession exportiert');
  ok(/warmCaches\s*:\s*function/.test(AUTH), 'GemaAuth.warmCaches exportiert');

  const helper = AUTH.slice(AUTH.indexOf('function _adoptSession'), AUTH.indexOf('function _reassertAdopted'));
  ok(helper.length > 200, '_adoptSession gefunden');
  ok(helper.indexOf('STORAGE_SESSION') >= 0, '_adoptSession schreibt die Sitzung');
  ok(helper.indexOf('_mergeIntoCache(STORAGE_USERS') >= 0,
    '_adoptSession mergt den Benutzer in den lokalen Cache (Kern des Fixes)');

  // Login + Aktivierung laufen ueber denselben Helfer (sonst driften sie auseinander).
  const loginFn = AUTH.slice(AUTH.indexOf('loginAsync:function'), AUTH.indexOf('lastLoginError:'));
  ok(/_adoptSession\(/.test(loginFn), 'loginAsync nutzt _adoptSession');
  const actFn = AUTH.slice(AUTH.indexOf('activateInvitationAsync:function'), AUTH.indexOf('activateInvitationAsync:function') + 2200);
  ok(/_adoptSession\(/.test(actFn), 'activateInvitationAsync nutzt _adoptSession');

  // Der Rettungsanker gegen einen Cloud-Refresh ohne den neuen Benutzer.
  ok(/_reassertAdopted\s*\(\s*\)/.test(AUTH), 'warmCaches mergt den Benutzer noetigenfalls zurueck');

  // sys_login: beide Registrierungen ueber den Wrapper, kein roher Write mehr.
  const regBlock = LOGIN.slice(LOGIN.indexOf('function _regSubmit'), LOGIN.indexOf('window._showRegister='));
  ok(/_adoptSession\(res\.j\.user/.test(regBlock), 'Firmen-Registrierung uebernimmt die Sitzung ueber den Helfer');
  ok(regBlock.indexOf("localStorage.setItem('gema_session_v1'") < 0,
    'Firmen-Registrierung schreibt die Sitzung nicht mehr roh');
  ok(/_landingFor\(/.test(regBlock), 'Firmen-Registrierung leitet auf die Rollen-Startseite');

  const studBlock = LOGIN.slice(LOGIN.indexOf('function _studSubmit'), LOGIN.indexOf('window._showStudent='));
  ok(/_adoptSession\(user/.test(studBlock), 'Klassen-Registrierung uebernimmt die Sitzung ueber den Helfer');
  ok(studBlock.indexOf("localStorage.setItem('gema_session_v1'") < 0,
    'Klassen-Registrierung schreibt die Sitzung nicht mehr roh');
  ok(studBlock.indexOf("'ab_klassen.html'") < 0,
    'kein fix verdrahtetes ab_klassen.html mehr (Studierende gehoeren in den Workspace)');
  ok(/_landingFor\(user\)/.test(studBlock), 'Ziel kommt aus GemaAuth.getLandingPage');
  ok(/done\(res\.j\.user\s*,/.test(studBlock), 'done() bekommt den ganzen Benutzer-Record, nicht nur die id');

  // Der Wrapper darf ohne GemaAuth nicht crashen (alter SW-Cache).
  const wrap = LOGIN.slice(LOGIN.indexOf('function _adoptSession'), LOGIN.indexOf('function _landingFor'));
  ok(/GemaAuth\.adoptSession/.test(wrap) && /localStorage\.setItem\('gema_session_v1'/.test(wrap),
    'Wrapper hat einen Fallback fuer eine alte gema_auth.js aus dem SW-Cache');

  // role_student landet laut Rollen-Redirect im Workspace.
  ok(/role_student'\)\s*>=\s*0\s*\)\s*return\s*'sys_workspace\.html'/.test(AUTH),
    'Rollen-Redirect: role_student → sys_workspace.html');
}

// ═══ B–D) Browser ══════════════════════════════════════════════════════
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('\n(playwright-core fehlt — Browser-Teil uebersprungen)'); finish(); }

const KLASSE = { id: 'kl_test', name: 'HF Gebaeudetechnik 2026', lehrgang: 'HF', org: 'Schule Testdorf' };
const STUD = {
  id: 'user_stud_neu', username: 'lea@schule.ch', name: 'Lea Muster',
  roleIds: ['role_student'], orgId: 'org_schule', active: true,
  profile: { email: 'lea@schule.ch' }
};
const PLANER = {
  id: 'user_neu_planer', username: 'chef@firma.ch', name: 'Chef Muster',
  roleIds: ['role_planer'], orgId: 'org_neu', active: true,
  profile: { email: 'chef@firma.ch' }
};
const EXP = new Date(Date.now() + 30 * 86400000).toISOString();
function jwt(uid, org) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' +
    b64({ iat: now, exp: now + 30 * 86400, uid, org, role: 'authenticated' }) + '.testsig';
}

// cloudUsers: was ein REST-GET auf die auth-Collection liefert (Rows-Format).
async function neueSeite(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.indexOf('gema-auth') >= 0) {
      let body = {};
      try { body = JSON.parse(route.request().postData() || '{}'); } catch { }
      if (body.action === 'class_info') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, klasse: KLASSE }) });
      }
      if (body.action === 'register_student') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, token: jwt(STUD.id, STUD.orgId), exp: EXP, user: STUD, klasse: { id: KLASSE.id, name: KLASSE.name } })
        });
      }
      if (body.action === 'register') {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, token: jwt(PLANER.id, PLANER.orgId), exp: EXP, user: PLANER })
        });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    }
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
      if (route.request().method() === 'GET') {
        const rows = (opts.cloudUsers || []).map(d => ({ data_key: 'user:' + d.id, payload: { data: d } }));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(u.indexOf('user') >= 0 ? rows : []) });
      }
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/Cannot read|null|undefined/.test(e.message)) console.log('  [pageerror]', e.message.slice(0, 120)); });
  return { ctx, page };
}

async function studRegistrieren(page) {
  await page.goto(BASE + '/sys_login.html?klasse=TEST12', { waitUntil: 'domcontentloaded' });
  // Der Cloud-Bootstrap von gema_auth.js laedt die Seite auf einem frischen
  // Geraet einmal selbst neu (_maybeReloadAfterSync). Das abwarten — ein
  // echter Nutzer tippt ohnehin sekundenlang.
  await page.waitForTimeout(1400);
  await page.waitForSelector('#studentView', { state: 'visible', timeout: 8000 });
  await page.fill('#studName', 'Lea Muster');
  await page.fill('#studEmail', 'lea@schule.ch');
  await page.fill('#studPw', 'geheim123');
  await page.fill('#studPw2', 'geheim123');
  await page.click('#studSubmit');
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });

// ── B) Klassencode-Registrierung landet im Workspace ───────────────────
console.log('\n■ B: Klassencode-Registrierung → Workspace (ohne zweiten Login)');
{
  const { ctx, page } = await neueSeite(browser);
  await studRegistrieren(page);

  await page.waitForSelector('#loginSuccess', { state: 'visible', timeout: 8000 });
  const willk = await page.textContent('#successTxt');
  ok(/Willkommen/.test(willk) && /Lea Muster/.test(willk), 'Willkommens-Meldung erscheint', willk);
  ok(/HF Gebaeudetechnik 2026/.test(willk), 'Klassenname steht in der Meldung');

  // Sitzung + Benutzer-Cache VOR der Weiterleitung — genau das fehlte.
  const st = await page.evaluate(() => ({
    sess: JSON.parse(localStorage.getItem('gema_session_v1') || 'null'),
    users: JSON.parse(localStorage.getItem('gema_users_v1') || '[]')
  }));
  ok(!!(st.sess && st.sess.userId === 'user_stud_neu'), 'Sitzung zeigt auf den neuen Benutzer');
  ok(!!(st.sess && st.sess.token), 'Sitzung traegt das JWT');
  ok(st.users.some(u => u && u.id === 'user_stud_neu'),
    'neuer Benutzer steht im lokalen Cache (sonst wirft der Boot-Check die Sitzung raus)');

  await page.waitForURL('**/sys_workspace.html', { timeout: 8000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  ok(url.indexOf('sys_workspace.html') >= 0, 'Landung im Workspace', url);
  ok(url.indexOf('sys_login') < 0, 'KEIN Rueckwurf auf den Login-Screen', url);

  const nachher = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_session_v1') || 'null'));
  ok(!!(nachher && nachher.userId === 'user_stud_neu'),
    'Sitzung ueberlebt den Boot der Zielseite');
  ok(await page.evaluate(() => !!document.querySelector('#wsSidebar, .ws-sidebar, [data-gn-app], .layout')),
    'Workspace ist gerendert (kein Kein-Zugriff-Screen)');
  await ctx.close();
}

// ── C) Cloud-Antworten duerfen die frische Sitzung nicht entwerten ─────
console.log('\n■ C: Cloud-Refresh entwertet die frische Sitzung nicht');
{
  // C1: leere Cloud (Empty-Read-Guard)
  const a = await neueSeite(browser, { cloudUsers: [] });
  await studRegistrieren(a.page);
  await a.page.waitForURL('**/sys_workspace.html', { timeout: 8000 });
  await a.page.waitForTimeout(1200);
  ok(a.page.url().indexOf('sys_login') < 0, 'leere Cloud-Antwort: kein Rueckwurf auf den Login');
  ok(await a.page.evaluate(() => (JSON.parse(localStorage.getItem('gema_users_v1') || '[]')).some(u => u && u.id === 'user_stud_neu')),
    'leere Cloud-Antwort loescht den Benutzer nicht aus dem Cache');
  await a.ctx.close();

  // C2: Cloud kennt den neuen Benutzer (noch) nicht, liefert aber andere —
  // ohne Rettungsanker haette der Refresh die Sitzung entwertet.
  const b = await neueSeite(browser, {
    cloudUsers: [{ id: 'u_fremd', username: 'x@y.ch', name: 'Fremd', roleIds: ['role_planer'], orgId: 'org_schule', active: true }]
  });
  await studRegistrieren(b.page);
  await b.page.waitForURL('**/sys_workspace.html', { timeout: 8000 });
  await b.page.waitForTimeout(1200);
  ok(b.page.url().indexOf('sys_login') < 0, 'fremd gefuellte Cloud-Antwort: kein Rueckwurf auf den Login');
  ok(await b.page.evaluate(() => (JSON.parse(localStorage.getItem('gema_users_v1') || '[]')).some(u => u && u.id === 'user_stud_neu')),
    'Rettungsanker: neuer Benutzer bleibt im Cache');
  // Der eigentliche Beweis: der NAECHSTE Seitenaufruf (jeder Klick auf ein
  // Modul) darf die Sitzung nicht verlieren.
  await b.page.goto(BASE + '/ab_klassen.html', { waitUntil: 'domcontentloaded' });
  await b.page.waitForTimeout(1500);
  ok(b.page.url().indexOf('sys_login') < 0, 'zweiter Seitenaufruf bleibt angemeldet', b.page.url());
  await b.ctx.close();
}

// ── D) Firmen-Registrierung landet ebenfalls richtig ───────────────────
console.log('\n■ D: Firmen-Registrierung → Rollen-Startseite');
{
  const { ctx, page } = await neueSeite(browser);
  await page.goto(BASE + '/sys_login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  // Der Einstieg ist im Pilot geschlossen (REGISTRATION_OPEN=false) — der
  // Code-Pfad muss trotzdem stimmen, sonst faellt es beim Oeffnen auf.
  await page.evaluate(() => { _showRegister(); _regNext(); });   // Schritt 1 → 2
  await page.fill('#regName', 'Chef Muster');
  await page.fill('#regEmail', 'chef@firma.ch');
  await page.fill('#regPw', 'geheim123');
  await page.fill('#regPw2', 'geheim123');
  await page.evaluate(() => { _regNext(); });                    // Schritt 2 → 3
  await page.fill('#regFirma', 'Muster Engineering GmbH');
  await page.evaluate(() => { _regSubmit(); });

  await page.waitForSelector('#loginSuccess', { state: 'visible', timeout: 8000 });
  ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('gema_users_v1') || '[]')).some(u => u && u.id === 'user_neu_planer')),
    'neuer Firmen-Benutzer steht im lokalen Cache');
  ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('gema_orgs_v1') || '[]')).some(o => o && o.name === 'Muster Engineering GmbH')),
    'die neue Firma steht im lokalen Cache (Nav zeigt sofort den richtigen Namen)');

  await page.waitForURL('**/sys_workspace.html', { timeout: 10000 });
  await page.waitForTimeout(1200);
  ok(page.url().indexOf('sys_login') < 0, 'kein Rueckwurf auf den Login', page.url());
  await ctx.close();
}

await browser.close();
server.close();
finish();

function finish() {
  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks bestanden');
  process.exit(fail === 0 ? 0 : 1);
}
