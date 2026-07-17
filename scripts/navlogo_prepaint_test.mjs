// Firmenlogo ohne GEMA-Logo-Flash: der Pre-Paint-Fix in gema_auth.js blendet
// das gecachte Firmenlogo synchron im <head> ein (vor dem ersten Paint) und
// versteckt das statische GEMA-SVG. Playwright.
//
// Deckt ab:
//  A) Pre-Paint aktiv (Cache passt zur Org): #_gaNavLogo-Style VOR dem Swap da,
//     GEMA-SVG display:none, ::before trägt das Logo — gemessen in einem
//     DOMContentLoaded-Listener, der VOR dem _swapLogo-Handler feuert.
//  B) Cache-Schreiben: Org mit Logo, kein Cache → nach dem Swap liegt der
//     Cache (orgId+src) für die nächste Seite vor.
//  C) Cross-Org-Guard: Cache gehört zu einer FREMDEN Org → kein Pre-Paint
//     (kein fremdes Logo), GEMA-SVG bleibt bis zum Swap sichtbar.
//  D) Self-Heal: Cache da, aber Org hat KEIN Logo → nach dem Swap ist der
//     Cache gelöscht, der Pre-Paint-Style entfernt und das GEMA-SVG sichtbar.
//
// Aufruf:  CHROME=<chromium> node scripts/navlogo_prepaint_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8898;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const USER = { id: 'u1', username: 'a@t.ch', name: 'Admin', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } };
function orgWith(logo) { return { id: 'org_t', name: 'Muster AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true, logo: logo || undefined }; }

const browser = await chromium.launch({ executablePath: CHROME });

// Kontext mit Seed + einem DOMContentLoaded-Listener, der VOR gema_auth's
// Swap-Handler feuert (addInitScript registriert vor allen Seiten-Scripten).
async function load(extraLs) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
    Object.assign({ gema_users_v1: [USER], gema_session_v1: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig', userId: 'u1', expires: FUTURE } }, extraLs || {}));
  // Pre-Swap-Zustand einfangen (dieser DCL-Listener ist vor dem von gema_auth registriert)
  await ctx.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      var mark = document.querySelector('.g-nav-mark');
      var svg = mark && mark.querySelector('svg');
      window.__prepaint = {
        style: !!document.getElementById('_gaNavLogo'),
        svgDisplay: svg ? getComputedStyle(svg).display : 'no-svg',
        beforeBg: mark ? getComputedStyle(mark, '::before').backgroundImage : ''
      };
    });
  });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return { ctx, page };
}

const cacheFor = (orgId) => ({ gema_nav_logo_v1: { orgId, src: LOGO, ratio: 2.2, name: 'Muster AG', hideName: false } });

console.log('— A) Pre-Paint aktiv (Cache passt zur Org) —');
{
  const { ctx, page } = await load(Object.assign({ gema_orgs_v1: [orgWith(LOGO)] }, cacheFor('org_t')));
  const pp = await page.evaluate(() => window.__prepaint);
  ok(pp && pp.style === true, 'Pre-Paint-Style #_gaNavLogo im <head> (vor dem Swap)');
  ok(pp && pp.svgDisplay === 'none', 'GEMA-SVG ist ausgeblendet (display:none) — kein Flash');
  ok(pp && /data:image/.test(pp.beforeBg || ''), 'Firmenlogo als ::before-Hintergrund gerendert');
  // Endzustand: echtes <img> mit dem Firmenlogo (Swap ersetzt den Pre-Paint)
  const fin = await page.evaluate(() => {
    var img = document.querySelector('.g-nav-mark img');
    return { hasImg: !!img, src: img ? img.getAttribute('src') : '', styleGone: !document.getElementById('_gaNavLogo') };
  });
  ok(fin.hasImg && fin.src === LOGO, 'Endzustand: Firmenlogo als <img> im Nav');
  ok(fin.styleGone, 'Pre-Paint-Style nach dem Swap entfernt (kein doppeltes Logo)');
  ok(page.errs.length === 0, 'keine pageerrors (A)');
  await ctx.close();
}

console.log('— B) Cache wird nach dem Swap geschrieben (erste Seite) —');
{
  const { ctx, page } = await load({ gema_orgs_v1: [orgWith(LOGO)] }); // kein Cache
  const pp = await page.evaluate(() => window.__prepaint);
  ok(pp && pp.style === false, 'ohne Cache kein Pre-Paint (einmaliger GEMA-Flash auf der ersten Seite, ok)');
  await page.waitForTimeout(300);
  const cache = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gema_nav_logo_v1') || 'null'); } catch (e) { return null; } });
  ok(cache && cache.orgId === 'org_t' && cache.src === LOGO, 'Logo-Cache nach dem Swap geschrieben (orgId+src)');
  ok(typeof (cache && cache.ratio) === 'number' && cache.ratio > 0, 'Seitenverhältnis im Cache');
  await ctx.close();
}

console.log('— C) Cross-Org-Guard: fremder Cache → kein Pre-Paint —');
{
  const { ctx, page } = await load(Object.assign({ gema_orgs_v1: [orgWith(LOGO)] }, cacheFor('org_FREMD')));
  const pp = await page.evaluate(() => window.__prepaint);
  ok(pp && pp.style === false, 'kein Pre-Paint bei fremder Org-Zuordnung');
  ok(pp && pp.svgDisplay !== 'none', 'GEMA-SVG bleibt sichtbar (kein fremdes Logo)');
  // Swap schreibt danach den korrekten Cache (org_t)
  const cache = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gema_nav_logo_v1') || 'null'); } catch (e) { return null; } });
  ok(cache && cache.orgId === 'org_t', 'Cache nach dem Swap auf die eigene Org korrigiert');
  await ctx.close();
}

console.log('— D) Self-Heal: Org ohne Logo → Cache + Pre-Paint entfernt —');
{
  const { ctx, page } = await load(Object.assign({ gema_orgs_v1: [orgWith(null)] }, cacheFor('org_t')));
  // Pre-Paint lief zwar am head (Cache passte), aber der Swap (Org ohne Logo)
  // heilt: Cache weg, Style weg, SVG sichtbar.
  const fin = await page.evaluate(() => ({
    cache: localStorage.getItem('gema_nav_logo_v1'),
    styleGone: !document.getElementById('_gaNavLogo'),
    svgVisible: (function () { var s = document.querySelector('.g-nav-mark svg'); return s ? getComputedStyle(s).display !== 'none' : false; })()
  }));
  ok(fin.cache === null, 'veralteter Logo-Cache gelöscht (Org hat kein Logo)');
  ok(fin.styleGone, 'Pre-Paint-Style entfernt');
  ok(fin.svgVisible, 'GEMA-SVG wieder sichtbar (kein Logo verschwindet)');
  ok(page.errs.length === 0, 'keine pageerrors (D)');
  await ctx.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
