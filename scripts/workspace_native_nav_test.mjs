// ═══════════════════════════════════════════════════════════════════════════
// Drift-Guard: Workspace auf dem iPhone (Feedback 29.07.2026)
//   1. Eimer-Tap wechselt NICHT mehr heimlich auf die Desktop-Ansicht
//      (der frühere setPref('klassisch')-Trap) — er öffnet ein NATIVES
//      Eimer-Detail: Module öffnen (?objekt=), Modul hinzufügen (Sheet),
//      zurück zur Übersicht, neuer Eimer via ＋ (Sheet Name+Typ).
//   2. Coachmark-Tour startet auf ≤740px NICHT (der Spotlight-Backdrop lag
//      als unbedienbarer Schleier über der Seite — «verschwommene Ansicht»).
//   3. Heilung: ein vom alten Trap gesetzter 'klassisch'-Geräte-Cache wird
//      bei eingeloggtem User OHNE Profil-Flag verworfen (gema_native_mobil).
//   4. Pro-User-Einstellung bleibt: user.profile.nativeAnsicht=false →
//      klassische Ansicht (sys_profil-Toggle), true/unset → nativ.
// Ausführen: CHROME=<chromium> node scripts/workspace_native_nav_test.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okN = 0, failN = 0;
function ok(name, cond, extra) {
  if (cond) { okN++; console.log('  ✓ ' + name); }
  else { failN++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

const bucket = {
  id: 'ws_test1', name: 'Neubau Sonnenhalde', type: 'project', ownerType: 'org', ownerOrgId: 'org_test',
  createdBy: 'u_test', accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] },
  org: 'org_test', members: ['TU'], modules: [{ mod: 'sb_druckverlust', status: 'offen' }],
  activity: [], beteiligte: [], notes: [{ id: 'n1', title: 'n.Seite 1', body: '' }],
  objektId: 'obj_ws_test1', createdAt: '2026-07-28T10:00:00Z'
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function phoneCtx(extraSeed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await wireRoutes(ctx);
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (r.request().method() === 'GET' && /data_key=like\.ws/.test(u)) {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { data_key: 'ws:ws_test1', payload: { data: bucket }, last_modified: new Date().toISOString() }
      ]) });
    }
    if (r.request().method() === 'GET') return r.fulfill({ contentType: 'application/json', body: '[]' });
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
  const sd = Object.assign(seed(['role_planer']), extraSeed || {});
  await ctx.addInitScript(o => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, sd);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  return { ctx, page, errs };
}

// ── 1) Native Navigation: Übersicht → Detail → Modul → zurück → neuer Eimer ──
console.log('■ Native Eimer-Navigation (iPhone 390px)');
{
  const { ctx, page, errs } = await phoneCtx();
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gn--page', { timeout: 12000 });
  await page.waitForTimeout(1400);
  ok('nativer Screen aktiv (gn-native-on)', await page.evaluate(() => document.documentElement.classList.contains('gn-native-on')));
  await page.waitForSelector('[data-nat-bucket]', { timeout: 8000 });
  ok('Eimer erscheint in der Übersicht', (await page.textContent('.gn--page')).includes('Neubau Sonnenhalde'));

  // Eimer öffnen → Detail, KEIN Ansichts-Wechsel
  await page.evaluate(() => document.querySelector('[data-nat-bucket]').click());
  await page.waitForTimeout(300);
  ok('Eimer-Tap öffnet das NATIVE Detail (kein setPref-Trap)',
    await page.evaluate(() => document.documentElement.classList.contains('gn-native-on') && !!document.querySelector('[data-nat-zurueck]')));
  ok('Geräte-Cache NICHT auf klassisch gestellt', await page.evaluate(() => localStorage.getItem('gema_native_view_v1') !== 'klassisch'));
  const detTxt = await page.textContent('.gn--page');
  ok('Detail zeigt Eimer-Name + Modul', detTxt.includes('Neubau Sonnenhalde') && detTxt.includes('Druckverlust'));
  ok('Modul-Zeile trägt ?objekt=-Link', await page.evaluate(() => {
    const r = [...document.querySelectorAll('[data-nat-href]')].find(x => (x.getAttribute('data-nat-href') || '').indexOf('sb_druckverlust') === 0);
    return !!r && r.getAttribute('data-nat-href').includes('?objekt=obj_ws_test1');
  }));

  // Modul hinzufügen via Sheet
  await page.evaluate(() => document.querySelector('[data-nat-addmod]').click());
  await page.waitForSelector('.gn-sheet [data-nat-addpick]', { timeout: 6000 });
  const sheetTxt = await page.textContent('.gn-sheet');
  ok('Modul-Sheet zeigt Kategorien + Module', sheetTxt.includes('Sanitärberechnungen') && sheetTxt.includes('bereits hinzugefügt'));
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-nat-addpick]')].find(x => x.getAttribute('data-nat-addpick') === 'sb_zirkulation'); if (b) b.click(); });
  await page.waitForTimeout(700);
  ok('Modul wurde dem Eimer hinzugefügt', (await page.textContent('.gn--page')).includes('Zirkulation'));
  ok('Eimer-Datensatz trägt das neue Modul', await page.evaluate(() =>
    (window._wsHooks.pool().find(b => b.id === 'ws_test1').modules || []).some(m => m.mod === 'sb_zirkulation')));

  // zurück zur Übersicht — eigener ‹-Knopf UND die injizierte Toolbar-Taste
  await page.evaluate(() => document.querySelector('[data-nat-zurueck]').click());
  await page.waitForTimeout(250);
  ok('‹ Eimer führt zur Übersicht', !!(await page.$('[data-nat-bucket]')));
  await page.evaluate(() => document.querySelector('[data-nat-bucket]').click());
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('[data-gn-back]').click());
  await page.waitForTimeout(250);
  ok('injizierte ‹-Toolbar-Taste bleibt im Workspace (Übersicht statt history.back)',
    !!(await page.$('[data-nat-bucket]')) && page.url().includes('sys_workspace'));

  // neuer Eimer via ＋ (Navbar) → Sheet → Erstellen → Detail
  await page.evaluate(() => document.querySelector('[data-nat-nav-plus]').click());
  await page.waitForSelector('#wsNatNeuName', { timeout: 6000 });
  await page.fill('#wsNatNeuName', 'Testeimer Handy');
  await page.evaluate(() => { const c = [...document.querySelectorAll('[data-nat-typ]')].find(x => x.getAttribute('data-nat-typ') === 'training'); if (c) c.click(); });
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-gn-save]')].pop(); if (b) b.click(); });
  await page.waitForTimeout(800);
  const neuTxt = await page.textContent('.gn--page');
  ok('neuer Eimer erstellt + direkt geöffnet', neuTxt.includes('Testeimer Handy') && neuTxt.includes('Übung'));
  ok('neuer Eimer im Pool persistiert', await page.evaluate(() =>
    window._wsHooks.pool().some(b => b.name === 'Testeimer Handy' && b.type === 'training')));
  ok('keine pageerrors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ── 2) Coachmarks: auf dem Phone still, auf dem Desktop unverändert ──
console.log('■ Coachmark-Tour');
{
  const { ctx, page } = await phoneCtx({ 'gema_native_view_v1': 'klassisch',
    // Profil-Flag bewusst klassisch → klassische Ansicht auf dem Phone (der frühere Crash-Kontext)
  });
  // klassische Ansicht erzwingen über das PROFIL (bewusste Wahl)
  await page.goto(BASE + '/sys_workspace.html?native=0', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);   // Tour-Delay ist 900ms — danach dürfte sie stehen
  ok('Phone: keine Coachmark-Tour (kein Backdrop/Karte)', await page.evaluate(() =>
    !document.querySelector('.gcm-backdrop') && !document.querySelector('.gcm-card')));
  await ctx.close();

  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await wireRoutes(dctx);
  await dctx.addInitScript(o => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed(['role_planer']));
  const dpage = await dctx.newPage();
  await dpage.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await dpage.waitForTimeout(2200);
  ok('Desktop: Tour startet weiterhin', await dpage.evaluate(() => !!document.querySelector('.gcm-card')));
  await dctx.close();
}

// ── 3) Heilung des alten setPref-Traps + Pro-User-Einstellung ──
console.log('■ Ansicht-Einstellung pro User');
{
  // Altlast: Cache 'klassisch' OHNE Profil-Flag (nur der entfernte Trap schrieb das)
  const { ctx, page } = await phoneCtx({ 'gema_native_view_v1': 'klassisch' });
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  ok('Trap-Altlast geheilt: native Ansicht wieder aktiv', await page.evaluate(() => document.documentElement.classList.contains('gn-native-on')));
  ok('Geräte-Cache bereinigt', await page.evaluate(() => localStorage.getItem('gema_native_view_v1') !== 'klassisch'));
  await ctx.close();

  // Bewusste Wahl (sys_profil): profile.nativeAnsicht=false → klassisch bleibt
  const s2 = seed(['role_planer']);
  const users = JSON.parse(JSON.stringify(s2.gema_users_v1));
  users[0].profile = Object.assign({}, users[0].profile, { nativeAnsicht: false });
  const { ctx: c2, page: p2 } = await phoneCtx({ gema_users_v1: users, 'gema_native_view_v1': 'klassisch' });
  await p2.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1500);
  ok('Profil-Wahl «klassisch» wird respektiert (pro User)', await p2.evaluate(() =>
    !document.documentElement.classList.contains('gn-native-on') && localStorage.getItem('gema_native_view_v1') === 'klassisch'));
  await c2.close();
}

await browser.close(); server.close();
console.log('');
console.log(failN === 0 ? '✓ alle ' + okN + ' Checks grün' : '✗ ' + failN + ' von ' + (okN + failN) + ' Checks ROT');
process.exit(failN === 0 ? 0 : 1);
