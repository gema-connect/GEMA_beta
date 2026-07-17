// Drift-Guard: token-lose Session (GEMA Secure v1) — leerer anon-Read darf gefüllte
// Caches nicht leeren + Neu-anmelden-Banner (Praxisfall «keine Daten mehr» 17.07.)
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

// ── A: Session OHNE Token + gefüllter Cache → Daten bleiben + Banner ──
{
  const s = seed(['role_magaziner'], { tokenlos: true });
  s.gema_werkzeug = JSON.stringify(TOOLS);
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const cards = await page.evaluate(() => document.body.textContent.indexOf('Bohrhammer Hilti TE 30') >= 0 && document.body.textContent.indexOf('Pressmaschine REMS') >= 0);
  ok(cards, 'A: Werkzeuge bleiben sichtbar (Cache nicht durch leeren anon-Read geleert)');
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').length);
  ok(cache === 2, 'A: localStorage-Cache unangetastet (2 Werkzeuge)');
  ok(await page.evaluate(() => !!document.getElementById('gema-sync-relogin-banner')), 'A: «Neu anmelden»-Banner sichtbar');
  const btn = await page.evaluate(() => { const b = document.getElementById('gema-sync-relogin-btn'); return b ? b.textContent : ''; });
  ok(/Neu anmelden/.test(btn), 'A: Banner trägt Neu-anmelden-Button');
  await ctx.close();
}

// ── B: Session MIT Token + gefüllter Cache + Cloud leer → Cloud gewinnt (wie bisher), kein Banner ──
{
  const s = seed(['role_magaziner']);
  s.gema_werkzeug = JSON.stringify(TOOLS);
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').length);
  ok(cache === 0, 'B: mit Token gewinnt die Cloud — Cache geleert (echtes «Collection leer»)');
  ok(await page.evaluate(() => !document.getElementById('gema-sync-relogin-banner')), 'B: kein Banner bei gültigem Token');
  await ctx.close();
}

// ── C: Session OHNE Token, LEERER Cache (frisches Gerät) → wie bisher, kein Banner ──
{
  const s = seed(['role_magaziner'], { tokenlos: true });
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  ok(await page.evaluate(() => !document.getElementById('gema-sync-relogin-banner')), 'C: frisches Gerät ohne Cache — kein Banner (nichts zu schützen)');
  await ctx.close();
}

// ── D: Harness-Default trägt jetzt ein Token (Secure-v1-Realität) ──
{
  const s = seed(['role_planer']);
  ok(!!s.gema_session_v1.token && s.gema_session_v1.token.split('.').length === 3, 'D: seed() liefert Session mit Fake-JWT');
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/sb_lu_tabelle.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const errs = await page.evaluate(() => !!document.querySelector('.device-row'));
  ok(errs, 'D: Modul bootet normal mit Token-Session');
  await ctx.close();
}

await browser.close();
server.close();
console.log(fail ? ('\n' + fail + ' von ' + n + ' ROT') : ('\nAlle ' + n + ' Relogin-Guard-Checks gruen'));
process.exit(fail ? 1 : 0);
