// pm_abnahme: Tab-Buttons (Mängelliste / Prüfliste / Pläne) müssen die
// Ansicht wechseln. Regression: die Pläne-Tab-Erweiterung deklarierte ein
// ZWEITES `function setTab` im selben IIFE-Scope — Hoisting liess
// `_origSetTab` auf die eigene Wrapper-Funktion zeigen → endlose Rekursion
// (RangeError) bei jedem Tab-Klick; Mängelliste/Prüfliste waren tot.
//
// Aufruf:  CHROME=<chromium> node scripts/abnahme_tabs_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8895;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/pm_abnahme.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return route.fulfill({ contentType: 'application/json', body: '[]' });
  if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  { gema_orgs_v1: JSON.stringify([ORG]), gema_users_v1: JSON.stringify(USERS), gema_session_v1: JSON.stringify(SESSION) });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/pm_abnahme.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

console.log('— Boot —');
ok(errs.length === 0, 'keine pageerrors beim Boot (' + errs.slice(0, 2).join(' | ') + ')');
const boot = await page.evaluate(() => ({
  abnahmeVisible: document.getElementById('view_abnahme').style.display !== 'none',
  hasTabs: !!(document.getElementById('tab_maengel') && document.getElementById('tab_pruefliste') && document.getElementById('tab_plaene'))
}));
ok(boot.abnahmeVisible, 'Start-Tab «Abnahme» sichtbar');
ok(boot.hasTabs, 'alle Tab-Buttons vorhanden');

console.log('— 🔍 Mängelliste —');
errs.length = 0;
await page.click('#tab_maengel');
await page.waitForTimeout(300);
let v = await page.evaluate(() => ({
  maengel: document.getElementById('view_maengel').style.display !== 'none',
  abnahme: document.getElementById('view_abnahme').style.display !== 'none',
  active: document.getElementById('tab_maengel').classList.contains('active')
}));
ok(errs.length === 0, 'kein JS-Fehler beim Klick (' + errs.slice(0, 1).join('') + ')');
ok(v.maengel, 'Mängelliste-Ansicht sichtbar');
ok(!v.abnahme, 'Abnahme-Ansicht ausgeblendet');
ok(v.active, 'Tab-Button markiert (active)');

console.log('— ✅ Prüfliste —');
errs.length = 0;
await page.click('#tab_pruefliste');
await page.waitForTimeout(300);
v = await page.evaluate(() => ({
  pruef: document.getElementById('view_pruefliste').style.display !== 'none',
  maengel: document.getElementById('view_maengel').style.display !== 'none',
  active: document.getElementById('tab_pruefliste').classList.contains('active')
}));
ok(errs.length === 0, 'kein JS-Fehler beim Klick');
ok(v.pruef, 'Prüfliste-Ansicht sichtbar');
ok(!v.maengel, 'Mängelliste-Ansicht ausgeblendet');
ok(v.active, 'Tab-Button markiert (active)');

console.log('— 📐 Pläne —');
errs.length = 0;
await page.click('#tab_plaene');
await page.waitForTimeout(300);
v = await page.evaluate(() => ({
  plaene: document.getElementById('view_plaene').style.display !== 'none',
  active: document.getElementById('tab_plaene').classList.contains('active')
}));
ok(errs.length === 0, 'kein JS-Fehler beim Klick (inkl. _planRenderList)');
ok(v.plaene, 'Pläne-Ansicht sichtbar');
ok(v.active, 'Tab-Button markiert (active)');

console.log('— «🔍 Zur Mängelliste →»-Button (Abnahme-Tab) —');
errs.length = 0;
await page.click('#tab_abnahme');
await page.waitForTimeout(200);
await page.evaluate(() => { const btns = Array.from(document.querySelectorAll('#view_abnahme .act-btn')); const b = btns.find(x => /Mängelliste/.test(x.textContent)); if (b) b.click(); });
await page.waitForTimeout(300);
v = await page.evaluate(() => document.getElementById('view_maengel').style.display !== 'none');
ok(errs.length === 0, 'kein JS-Fehler beim Klick');
ok(v, 'Sprung-Button öffnet die Mängelliste');

console.log('— Zurück zur Abnahme —');
errs.length = 0;
await page.click('#tab_abnahme');
await page.waitForTimeout(300);
v = await page.evaluate(() => document.getElementById('view_abnahme').style.display !== 'none');
ok(errs.length === 0 && v, 'Abnahme-Tab wieder sichtbar, kein Fehler');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
