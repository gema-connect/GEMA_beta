// Drift-Guard: token-lose Session (GEMA Secure v1) — Auto-Logout zum Login,
// leerer anon-Read darf gefüllte Caches nicht leeren, Banner als Fallback
// (Praxisfall «keine Daten mehr» 17.07.)
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

let n = 0, fail = 0;
function ok(cond, label) { n++; if (cond) console.log('  ok ' + n + ' — ' + label); else { fail++; console.log('  FAIL ' + n + ' — ' + label); } }

const server = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME });

const TOOLS = [
  { id: 'wz1', name: 'Bohrhammer Hilti TE 30', cat: 'elektro', orgId: 'org_test', bought: '2024-03-01' },
  { id: 'wz2', name: 'Pressmaschine REMS', cat: 'maschine', orgId: 'org_test', bought: '2023-06-01' }
];

// ── A: Session OHNE Token + Function deployed → AUTO-LOGOUT zum Login, Cache bleibt ──
{
  const s = seed(['role_magaziner'], { tokenlos: true });
  s.gema_werkzeug = JSON.stringify(TOOLS);
  const { ctx, page } = await newPage(browser, s);
  await ctx.route('**/gema-auth*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  let redirected = true;
  await page.waitForURL(/sys_login\.html/, { timeout: 9000 }).catch(() => { redirected = false; });
  ok(redirected, 'A: token-lose Session wird automatisch ausgeloggt → sys_login');
  ok(redirected && /[?&]r=/.test(page.url()), 'A: Redirect trägt Rücksprung-URL (?r=)');
  // Hinweis: das Harness-InitScript re-seedet localStorage bei jeder Navigation —
  // die Session-Entfernung selbst ist daher über den gesetzten Logout-Marker belegt.
  const st = await page.evaluate(() => ({
    ts: parseInt(localStorage.getItem('gema_sync_relogin_ts_v1') || '0', 10),
    cache: JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').length
  }));
  ok(st.ts > 0, 'A: Auto-Logout vollzogen (Session geräumt, Loop-Bremse gesetzt)');
  ok(st.cache === 2, 'A: Werkzeug-Cache bleibt unangetastet (Daten überleben den Logout)');
  await ctx.close();
}

// ── A2: Loop-Bremse — Auto-Logout lief gerade erst → kein Redirect, Banner + Cache-Schutz ──
{
  const s = seed(['role_magaziner'], { tokenlos: true });
  s.gema_werkzeug = JSON.stringify(TOOLS);
  s.gema_sync_relogin_ts_v1 = String(Date.now());
  const { ctx, page } = await newPage(browser, s);
  await ctx.route('**/gema-auth*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  ok(/if_werkzeug\.html/.test(page.url()), 'A2: Loop-Bremse — kein zweiter Auto-Logout innert 10 min');
  ok(await page.evaluate(() => !!document.getElementById('gema-sync-relogin-banner')), 'A2: stattdessen «Neu anmelden»-Banner');
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').length);
  ok(cache === 2, 'A2: Cache nicht durch leeren anon-Read geleert');
  ok(await page.evaluate(() => document.body.textContent.indexOf('Bohrhammer Hilti TE 30') >= 0), 'A2: Werkzeuge bleiben sichtbar');
  await ctx.close();
}

// ── A3: gema-auth-Function NICHT deployed (404 = Legacy) → kein Logout, Banner + Cache-Schutz ──
{
  const s = seed(['role_magaziner'], { tokenlos: true });
  s.gema_werkzeug = JSON.stringify(TOOLS);
  const { ctx, page } = await newPage(browser, s);
  await ctx.route('**/gema-auth*', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  ok(/if_werkzeug\.html/.test(page.url()), 'A3: Legacy (Function 404) — kein Auto-Logout (keine Redirect-Schleife)');
  ok(await page.evaluate(() => !!document.getElementById('gema-sync-relogin-banner')), 'A3: Banner als Hinweis');
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').length);
  ok(cache === 2, 'A3: Cache bleibt geschützt');
  await ctx.close();
}

// ── B: Session MIT Token + Cloud leer → Cloud gewinnt (wie bisher), kein Logout/Banner ──
{
  const s = seed(['role_magaziner']);
  s.gema_werkzeug = JSON.stringify(TOOLS);
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  ok(/if_werkzeug\.html/.test(page.url()), 'B: mit Token kein Auto-Logout');
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').length);
  ok(cache === 0, 'B: Cloud gewinnt — Cache geleert (echtes «Collection leer»)');
  ok(await page.evaluate(() => !document.getElementById('gema-sync-relogin-banner')), 'B: kein Banner bei gültigem Token');
  await ctx.close();
}

// ── C: token-lose Session auf frischem Gerät (leerer Cache) → ebenfalls Auto-Logout ──
{
  const s = seed(['role_magaziner'], { tokenlos: true });
  const { ctx, page } = await newPage(browser, s);
  await ctx.route('**/gema-auth*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  let redirected = true;
  await page.waitForURL(/sys_login\.html/, { timeout: 9000 }).catch(() => { redirected = false; });
  ok(redirected, 'C: frisches Gerät ohne Token → Auto-Logout zum Login');
  await ctx.close();
}

// ── D: Harness-Default trägt ein Token (Secure-v1-Realität) — Module booten normal ──
{
  const s = seed(['role_planer']);
  ok(!!s.gema_session_v1.token && s.gema_session_v1.token.split('.').length === 3, 'D: seed() liefert Session mit Fake-JWT');
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/sb_lu_tabelle.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  ok(/sb_lu_tabelle\.html/.test(page.url()), 'D: kein Auto-Logout mit Token');
  ok(await page.evaluate(() => !!document.querySelector('.device-row')), 'D: Modul bootet normal mit Token-Session');
  await ctx.close();
}

await browser.close();
server.close();
console.log(fail ? ('\n' + fail + ' von ' + n + ' ROT') : ('\nAlle ' + n + ' Tokenless-Guard-Checks gruen'));
process.exit(fail ? 1 : 0);
