// Drift-Guard: offene Eimer-Tabs gehören dem BENUTZER (Bugreport 05.08.2026)
//
// Gemeldet: «wenn ich den Account wechsle, sehe ich im neu eingeloggten
// Workspace den offenen Eimer als Tab vom vorherigen Nutzer».
//
// Zwei eigenständige Fehler steckten dahinter:
//   1. Der Tab-Zustand lag unter dem festen sessionStorage-Schlüssel
//      `ws_tabs` — ohne jeden Benutzer-Bezug. Nach einem Konto-Wechsel (auch
//      per Admin-Benutzerwechsel, der die Session im laufenden Tab tauscht)
//      stellte der neue Nutzer die Tabs des vorherigen wieder her.
//   2. `activeTab`/`openTabs` wurden über den GANZEN (cross-org) Pool
//      aufgelöst — `_canSeeBucket` blieb aussen vor. Der fremde Eimer kam
//      damit nicht nur als Tab-Beschriftung zurück, sondern MIT INHALT.
//
// Aufruf: CHROME=<chromium> node scripts/workspace_tab_konto_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ Teil A — statisch ═══════════════════════════════════════════════════ */
console.log('■ A: Verdrahtung in sys_workspace.html');
const WS = readFileSync('sys_workspace.html', 'utf8');
ok('Tab-Schlüssel trägt die User-ID', /function _tabsKey\(\)\{[^}]*'ws_tabs'\+\(u\?'_'\+u:''\)/.test(WS));
ok('alter ungescopter Schlüssel wird abgeräumt', /_tabsAltWeg[\s\S]{0,260}removeItem\('ws_tabs'\)/.test(WS));
ok('Wiederherstellung filtert über bucketSichtbar',
  /openTabs=openTabs\.filter\(function\(id\)\{return !!bucketSichtbar\(id\);\}\)/.test(WS));
ok('bucketSichtbar prüft _canSeeBucket', /function bucketSichtbar\(id\)\{[\s\S]{0,220}_canSeeBucket\(b\)/.test(WS));
ok('kein roher Pool-Zugriff mehr über activeTab',
  !/buckets\.find\(function\(x\)\{return x\.id===activeTab;\}\)/.test(WS));
ok('Tab-Leiste rendert nur sichtbare Eimer',
  /var b=bucketSichtbar\(id\);if\(!b\)return '';/.test(WS));
/* Die Provisionierung MUSS ungefiltert bleiben — sie legt Eimer an bzw. zieht
   sie nach, bevor der Nutzer darin steht. */
ok('Provisionierung sucht bewusst weiter ungefiltert',
  /var alt=buckets\.find\(function\(x\)\{return x\.id==='ws_kl_'/.test(WS));

/* ═══ Teil B — im Browser: der gemeldete Ablauf ═══════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

/* Zwei Nutzer in ZWEI Organisationen, jeder mit einem eigenen Org-Eimer.
   Der Pool ist cross-org — beide Eimer liegen also im lokalen Cache. */
const EIMER = [
  {
    id: 'ws_a', name: 'Eimer von Anna', type: 'project', ownerType: 'org', ownerOrgId: 'org_a',
    createdBy: 'u_anna', modules: [], notes: [], activity: [], beteiligte: [], members: [],
    accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] }, createdAt: '2026-08-01'
  },
  {
    id: 'ws_b', name: 'Eimer von Bruno', type: 'project', ownerType: 'org', ownerOrgId: 'org_b',
    createdBy: 'u_bruno', modules: [], notes: [], activity: [], beteiligte: [], members: [],
    accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] }, createdAt: '2026-08-01'
  }
];

/* seed() liefert die Werte als OBJEKTE (das addInitScript stringify't sie
   erst beim Schreiben) — hier also nie JSON.parse darauf anwenden. */
function konto(userId, name, orgId) {
  const s = seed(['role_planer']);
  s['gema_users_v1'] = (s['gema_users_v1'] || []).concat([{
    id: userId, name: name, username: name.toLowerCase() + '@gema.ch', active: true,
    orgId: orgId, roleIds: ['role_planer']
  }]);
  s['gema_session_v1'] = Object.assign({}, s['gema_session_v1'], { userId: userId, orgId: orgId });
  const orgs = (s['gema_orgs_v1'] || []).slice();
  ['org_a', 'org_b'].forEach(o => {
    if (!orgs.find(x => x.id === o)) orgs.push({ id: o, name: 'Firma ' + o, admins: [], kategorien: [] });
  });
  s['gema_orgs_v1'] = orgs;
  s['gema_ws_pool_v1'] = JSON.stringify(EIMER);
  s['gema_coachmarks_done_sys_workspace_v2'] = '1';
  return s;
}

/* EIN Browser-Kontext = EIN Browser-Tab: nur so ist der sessionStorage
   derselbe und der gemeldete Fall wird wirklich nachgestellt. */
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
await wireRoutes(ctx);
/* Der Harness-Mock antwortet auf JEDEN Cloud-GET mit [] — bindCollection
   würde den geseedeten Pool-Cache damit sofort leeren. Diese Route liegt
   NACH wireRoutes und gewinnt deshalb: sie liefert die beiden Eimer als
   echte per-Record-Rows. */
await ctx.route(/rest\/v1\/gema_data/, route => {
  const u = route.request().url();
  if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
  const rows = /module_key=eq\.workspace/.test(u)
    ? EIMER.map(b => ({ data_key: 'ws:' + b.id, payload: { data: b } }))
    : [];
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

async function alsBenutzer(userId, name, orgId) {
  await page.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, konto(userId, name, orgId));
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
}
const zustand = () => page.evaluate(() => ({
  tabs: [...document.querySelectorAll('#wsTabBar .ws-tab-name')].map(e => e.textContent.trim()),
  inhalt: (document.querySelector('#wsContentArea') || {}).textContent || '',
  sichtbar: [...document.querySelectorAll('.ws-bucket-row')].map(e => e.textContent.trim()).join(' | ')
}));

console.log('\n■ B: Anna öffnet ihren Eimer, danach meldet sich Bruno an');
await alsBenutzer('u_anna', 'Anna', 'org_a');
await page.evaluate(() => { const b = window._wsHooks.buckets().find(x => x.id === 'ws_a'); _wsOpen(b.id); });
await page.waitForTimeout(600);
{
  const z = await zustand();
  ok('Anna sieht ihren Eimer als Tab', z.tabs.includes('Eimer von Anna'), z.tabs);
  ok('Anna sieht Brunos Eimer NICHT in der Liste', !/Bruno/.test(z.sichtbar), z.sichtbar);
}

/* Konto-Wechsel im SELBEN Browser-Tab (Muster Admin-Benutzerwechsel/Logout) */
await alsBenutzer('u_bruno', 'Bruno', 'org_b');
{
  const z = await zustand();
  ok('Bruno sieht KEINEN Tab von Anna', !z.tabs.some(t => /Anna/.test(t)), z.tabs);
  ok('Brunos Inhaltsbereich zeigt Annas Eimer nicht', !/Eimer von Anna/.test(z.inhalt));
  ok('Bruno sieht Annas Eimer nicht in der Liste', !/Anna/.test(z.sichtbar), z.sichtbar);
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
}

console.log('\n■ B2: Bruno öffnet seinen Eimer — Anna bekommt ihn nicht zu sehen');
await page.evaluate(() => { const b = window._wsHooks.buckets().find(x => x.id === 'ws_b'); _wsOpen(b.id); });
await page.waitForTimeout(600);
{
  const z = await zustand();
  ok('Bruno sieht seinen eigenen Eimer als Tab', z.tabs.includes('Eimer von Bruno'), z.tabs);
}
await alsBenutzer('u_anna', 'Anna', 'org_a');
{
  const z = await zustand();
  ok('Anna sieht KEINEN Tab von Bruno', !z.tabs.some(t => /Bruno/.test(t)), z.tabs);
  ok('Annas eigener Tab ist wieder da (Zustand pro Benutzer)',
    z.tabs.includes('Eimer von Anna'), z.tabs);
}

console.log('\n■ B3: der ALTE, ungescopte Tab-Zustand (genau der gemeldete Fall)');
/* So sah es bis 05.08.2026 aus: EIN Schlüssel `ws_tabs` für alle Konten.
   Nach dem Konto-Wechsel stellte der neue Nutzer die Tabs des vorherigen
   wieder her — und zwar MIT Inhalt, weil `activeTab` über den ganzen
   (cross-org) Pool aufgelöst wurde. */
await page.evaluate(() => {
  sessionStorage.setItem('ws_tabs', JSON.stringify({ open: ['ws_b'], active: 'ws_b' }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);
{
  const z = await zustand();
  ok('Anna erbt den alten Tab-Zustand NICHT', !z.tabs.some(t => /Bruno/.test(t)), z.tabs);
  ok('Brunos Eimer wird auch nicht im Inhalt gerendert', !/Eimer von Bruno/.test(z.inhalt));
  const weg = await page.evaluate(() => sessionStorage.getItem('ws_tabs'));
  ok('der ungescopte Schlüssel ist abgeräumt', weg === null, weg);
}

console.log('\n■ B4: ein untergeschobener Eintrag im EIGENEN Schlüssel wird verworfen');
await page.evaluate(() => {
  const u = JSON.parse(localStorage.getItem('gema_session_v1')).userId;
  sessionStorage.setItem('ws_tabs_' + u, JSON.stringify({ open: ['ws_b'], active: 'ws_b' }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);
{
  const z = await zustand();
  ok('fremder Eimer erscheint trotz Tab-Eintrag NICHT', !z.tabs.some(t => /Bruno/.test(t)), z.tabs);
  ok('sein Inhalt wird auch nicht gerendert', !/Eimer von Bruno/.test(z.inhalt));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
}

await ctx.close();
await browser.close();
server.close();
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
