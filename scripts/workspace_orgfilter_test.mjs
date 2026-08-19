// Drift-Guard: Org-Wechsel + private Eimer je Organisation (Feedback 19.08.2026)
//
// Gewünscht: die Org-Kürzel-Pills oben im Workspace WECHSELN die Organisation —
// gewählt zeigt die Liste NUR die Eimer dieser Org; «Alle» alles. Die Wahl ist
// die «Standard-Organisation» (persistiert PRO USER auf dem Gerät). Private
// Eimer bleiben grundsätzlich IMMER sichtbar, sind aber pro Organisation
// abschaltbar (Rechtsklick aufs Kürzel ODER Einstellungen → Eimer & Vorlagen).
//
// Regeln, die dieser Test festhält:
//   1. EINE Sicht-Wahrheit (_wsSichtListen) für Sidebar, Mobile-Drawer und
//      nativen Handy-Screen — sonst driften die drei Listen auseinander.
//   2. Pool-Filter-Regel: eine gespeicherte Org, die (noch) nicht auflösbar
//      ist, RENDERT wie «Alle», die Wahl wird aber NIE zurückgesetzt.
//   3. No-silent-Regel: ausgeblendete private Eimer hinterlassen einen
//      Hinweis mit «einblenden»-Link — nichts verschwindet stillschweigend.
//   4. Der Filter ist Geräte-UI PRO USER (Muster _tabsKey) — ein
//      Konto-Wechsel erbt weder Filter noch Privat-Einstellung.
//   5. Unter «Alle» sind private Eimer IMMER sichtbar (privatAus wirkt nur,
//      solange genau diese Org gewählt ist).
//
// Aufruf: CHROME=<chromium> node scripts/workspace_orgfilter_test.mjs
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
ok('Org-Schlüssel trägt die User-ID (Muster _tabsKey)',
  /function _wsOrgKey\(\)\{[^}]*'gema_ws_org_v1'\+\(u\?'_'\+u:''\)/.test(WS));
ok('_wsSetOrg persistiert die Wahl', /localStorage\.setItem\(_wsOrgKey\(\),id\)/.test(WS));
ok('Boot lädt die gespeicherte Org-Wahl VOR dem ersten Render',
  /load\(\);loadTabs\(\);_wsOrgLoad\(\);_wsDeepLink\(\);render\(\)/.test(WS));
ok('_wsOrgAktiv fällt auf «all» zurück, ohne die Wahl zu löschen (Pool-Filter-Regel)',
  /function _wsOrgAktiv\(\)\{\s*if\(activeOrg==='all'\)return 'all';\s*return _getOrgs\(\)\.some\(/.test(WS));
ok('Org-Pills tragen das Rechtsklick-Menü (_wsCtxOrg)',
  /class="ws-org-pill'[\s\S]{0,160}oncontextmenu="return _wsCtxOrg\(event/.test(WS));
ok('renderSidebar liest die geteilte Sicht (_wsSichtListen)',
  /function renderSidebar\(\)\{\s*var L=_wsSichtListen\(\);/.test(WS));
ok('renderDrawer liest DIESELBE Sicht (eine Wahrheit)',
  /function renderDrawer\(\)\{[\s\S]{0,400}var L=_wsSichtListen\(\);/.test(WS));
ok('nativer Handy-Screen läuft über den sichtListen-Hook',
  /sichtListen:_wsSichtListen/.test(WS) && /data-nat-org/.test(WS));
ok('Privat-Ausblendung wirkt NICHT unter «Alle»',
  /function _wsPrivatSichtbar\(orgId\)\{\s*if\(!orgId\|\|orgId==='all'\)return true;/.test(WS));
ok('Klassen-Anfügung (subOf) läuft VOR der Privat-Ausblendung',
  /var angehaengt=personalAll\.filter[\s\S]{0,300}if\(!privatAn\)personal=\[\];/.test(WS));
ok('No-silent: Hinweis mit «einblenden»-Link statt stillem Verschwinden',
  /Private Eimer sind hier ausgeblendet[\s\S]{0,120}_wsPrivatToggle\(\\''\+L\.af\+'\\',true\)/.test(WS));
ok('Einstellungen haben die Sektion «Private Eimer je Organisation»',
  /Private Eimer je Organisation/.test(WS) && /_wsPrivatToggle\(\\''\+o\.id\+'\\'/.test(WS));
ok('neuer Eimer folgt der gewählten Organisation',
  /_newOrg=\(af!=='all'&&orgs\.some\(function\(o\)\{return o\.id===af;\}\)\)\?af:orgs\[0\]\.id;/.test(WS));
ok('Deep-Link/aktive Org fliesst in _resolveOrg',
  /function _resolveOrg\(\)\{[\s\S]{0,120}_wsOrgAktiv\(\)/.test(WS));

/* ═══ Teil B — im Browser ═════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

/* u_test in org_test; org_b ist eine FREMDE Org, in deren Eimer u_test
   eingeladen ist (Gast) — daraus muss auch die org_b-Pille entstehen. */
const EIMER = [
  {
    id: 'ws_eigen', name: 'Neubau Sonnenweg', type: 'project', ownerType: 'org', ownerOrgId: 'org_test',
    createdBy: 'u_test', modules: [], notes: [], activity: [], beteiligte: [], members: [],
    accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] }, createdAt: '2026-08-01'
  },
  {
    id: 'ws_gast', name: 'Umbau Bahnhofstrasse', type: 'project', ownerType: 'org', ownerOrgId: 'org_b',
    createdBy: 'u_fremd', modules: [], notes: [], activity: [], beteiligte: [], members: [],
    accessControl: { orgVisible: true, invitedUsers: ['u_test'], revokedUsers: [] }, createdAt: '2026-08-02'
  },
  {
    id: 'ws_priv', name: 'Mein Privater Eimer', type: 'private', ownerType: 'personal', ownerOrgId: '',
    createdBy: 'u_test', modules: [], notes: [], activity: [], beteiligte: [], members: [],
    accessControl: { orgVisible: false, invitedUsers: [], revokedUsers: [] }, createdAt: '2026-08-03'
  }
];

function konto(userId) {
  const s = seed(['role_planer']);
  if (userId && userId !== 'u_test') {
    s['gema_users_v1'] = (s['gema_users_v1'] || []).concat([{
      id: userId, name: 'Zweitnutzer', username: userId + '@gema.ch', active: true,
      orgId: 'org_test', roleIds: ['role_planer']
    }]);
    s['gema_session_v1'] = Object.assign({}, s['gema_session_v1'], { userId: userId });
  }
  const orgs = (s['gema_orgs_v1'] || []).slice();
  if (!orgs.find(x => x.id === 'org_b')) orgs.push({ id: 'org_b', name: 'Fremdfirma Basel AG', admins: [], kategorien: [] });
  s['gema_orgs_v1'] = orgs;
  s['gema_ws_pool_v1'] = JSON.stringify(EIMER);
  s['gema_coachmarks_done_sys_workspace_v2'] = '1';
  return s;
}

const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
await wireRoutes(ctx);
/* Der Harness-Mock liefert auf JEDEN Cloud-GET [] — bindCollection würde den
   geseedeten Pool-Cache leeren. Diese Route liegt NACH wireRoutes und gewinnt. */
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

async function laden(userId) {
  await page.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, konto(userId || 'u_test'));
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
}
const zustand = () => page.evaluate(() => ({
  pills: [...document.querySelectorAll('.ws-org-pills .ws-org-pill')].map(e => ({
    t: e.textContent.trim(), active: e.classList.contains('active'), title: e.getAttribute('title') || ''
  })),
  label: (document.getElementById('wsOrgLabel') || {}).textContent || '',
  org: (document.getElementById('wsOrgBuckets') || {}).textContent || '',
  pers: (document.getElementById('wsPersonal') || {}).textContent || '',
  guestText: (document.getElementById('wsGuestBuckets') || {}).textContent || '',
  guestSichtbar: (() => { const s = document.getElementById('wsGuestSection'); return !!s && s.style.display !== 'none'; })(),
  af: window._wsHooks && _wsHooks.orgAktiv ? _wsHooks.orgAktiv() : null
}));

console.log('\n■ B1: Default «Alle» — alles sichtbar, Pills aus Org + Gast-Eimer abgeleitet');
await laden();
{
  const z = await zustand();
  ok('«Alle» ist aktiv', z.pills.some(p => p.t === 'Alle' && p.active), z.pills);
  ok('eigene Org hat eine Pille', z.pills.some(p => /Testfirma|org_test/i.test(p.title)), z.pills);
  ok('Gast-Org-Pille aus dem Eimer abgeleitet (Fremdfirma Basel AG)',
    z.pills.some(p => /Fremdfirma Basel AG/.test(p.title)), z.pills);
  ok('Org-Eimer sichtbar', /Neubau Sonnenweg/.test(z.org), z.org);
  ok('privater Eimer sichtbar', /Mein Privater Eimer/.test(z.pers), z.pers);
  ok('Gast-Eimer in der Gast-Sektion', z.guestSichtbar && /Umbau Bahnhofstrasse/.test(z.guestText));
}

console.log('\n■ B2: Klick auf die eigene Org-Pille filtert die Liste');
await page.evaluate(() => _wsSetOrg('org_test'));
await page.waitForTimeout(300);
{
  const z = await zustand();
  ok('Org-Pille ist aktiv, «Alle» nicht',
    z.pills.some(p => /Testfirma|org_test/i.test(p.title) && p.active) && !z.pills.some(p => p.t === 'Alle' && p.active), z.pills);
  ok('eigener Org-Eimer bleibt', /Neubau Sonnenweg/.test(z.org));
  ok('Gast-Eimer der fremden Org ist WEG', !/Umbau Bahnhofstrasse/.test(z.org + z.guestText) && !z.guestSichtbar);
  ok('privater Eimer bleibt (Default: immer sichtbar)', /Mein Privater Eimer/.test(z.pers), z.pers);
}

console.log('\n■ B3: auch eine GAST-Org ist wählbar — ihre Eimer stehen dann in der Org-Sektion');
await page.evaluate(() => _wsSetOrg('org_b'));
await page.waitForTimeout(300);
{
  const z = await zustand();
  ok('Sektion trägt den Namen der Gast-Org', /Fremdfirma Basel AG/.test(z.label), z.label);
  ok('Gast-Eimer steht in der Org-Sektion', /Umbau Bahnhofstrasse/.test(z.org), z.org);
  ok('eigener Org-Eimer ist weg', !/Neubau Sonnenweg/.test(z.org));
}

console.log('\n■ B4: die Wahl überlebt den Reload (Standard-Organisation, Key pro User)');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);
{
  const z = await zustand();
  ok('nach Reload weiterhin die Gast-Org gewählt', z.af === 'org_b', z.af);
  const key = await page.evaluate(() => localStorage.getItem('gema_ws_org_v1_u_test'));
  ok('Wahl liegt im per-User-Schlüssel gema_ws_org_v1_u_test', key === 'org_b', key);
}

console.log('\n■ B5: private Eimer pro Org ausblenden — Hinweis statt stilles Verschwinden');
await page.evaluate(() => { _wsSetOrg('org_test'); _wsPrivatToggle('org_test', false); });
await page.waitForTimeout(300);
{
  const z = await zustand();
  ok('privater Eimer ist ausgeblendet', !/Mein Privater Eimer/.test(z.pers), z.pers);
  ok('Hinweis «Private Eimer sind hier ausgeblendet» steht da', /Private Eimer sind hier ausgeblendet/.test(z.pers), z.pers);
  const hatLink = await page.evaluate(() => !!document.querySelector('#wsPersonal .ws-linkbtn'));
  ok('«einblenden»-Link vorhanden (No-silent-Regel)', hatLink);
}
console.log('\n■ B6: unter «Alle» bleibt der private Eimer TROTZ Einstellung sichtbar');
await page.evaluate(() => _wsSetOrg('all'));
await page.waitForTimeout(300);
{
  const z = await zustand();
  ok('privatAus wirkt nur bei gewählter Org', /Mein Privater Eimer/.test(z.pers), z.pers);
}
console.log('\n■ B7: «einblenden»-Link stellt die privaten Eimer wieder her');
await page.evaluate(() => _wsSetOrg('org_test'));
await page.waitForTimeout(200);
await page.click('#wsPersonal .ws-linkbtn');
await page.waitForTimeout(300);
{
  const z = await zustand();
  ok('privater Eimer ist wieder da', /Mein Privater Eimer/.test(z.pers), z.pers);
}

console.log('\n■ B8: Rechtsklick auf die Org-Pille öffnet das Kontextmenü');
{
  const pill = page.locator('.ws-org-pills .ws-org-pill', { hasText: /^(?!Alle)/ }).first();
  await pill.click({ button: 'right' });
  await page.waitForTimeout(250);
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.ws-ctx');
    return m ? [...m.querySelectorAll('button')].map(b => b.textContent.trim()) : null;
  });
  ok('Kontextmenü offen', !!menu, menu);
  ok('Eintrag «Nur … anzeigen»', !!menu && menu.some(t => /^Nur «.+» anzeigen$/.test(t)), menu);
  ok('Eintrag «Private Eimer hier ausblenden»', !!menu && menu.some(t => /Private Eimer hier ausblenden/.test(t)), menu);
  ok('Eintrag «Einstellungen …»', !!menu && menu.some(t => /Einstellungen/.test(t)), menu);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}

console.log('\n■ B9: Einstellungen «Eimer & Vorlagen» führen die Privat-Schalter pro Org');
await page.evaluate(() => { _wsOpenSettings(); _wsSettingsTab('eimer'); });
await page.waitForTimeout(400);
{
  const s = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('.ws-settings-section')]
      .find(x => /Private Eimer je Organisation/.test(x.textContent));
    return sec ? {
      da: true,
      zeilen: [...sec.querySelectorAll('.ws-settings-row')].map(r => r.textContent.trim().slice(0, 60)),
      toggles: sec.querySelectorAll('.ws-toggle').length
    } : { da: false };
  });
  ok('Sektion «Private Eimer je Organisation» vorhanden', s.da);
  ok('eine Schalter-Zeile pro Organisation (eigene + Gast-Org)', s.da && s.toggles >= 2, s);
  ok('Fremdfirma erscheint in den Zeilen', s.da && s.zeilen.some(z => /Fremdfirma Basel AG/.test(z)), s.zeilen);
  // Schalter aus den Einstellungen wirkt sofort auf die Sidebar
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('.ws-settings-section')]
      .find(x => /Private Eimer je Organisation/.test(x.textContent));
    const row = [...sec.querySelectorAll('.ws-settings-row')].find(r => !/Fremdfirma/.test(r.textContent));
    row.querySelector('.ws-toggle').click();
  });
  await page.waitForTimeout(300);
  const pers = await page.evaluate(() => (document.getElementById('wsPersonal') || {}).textContent || '');
  ok('Einstellungs-Schalter blendet die privaten Eimer der gewählten Org aus',
    /Private Eimer sind hier ausgeblendet/.test(pers), pers.slice(0, 80));
  await page.evaluate(() => _wsPrivatToggle('org_test', true));
}

console.log('\n■ B10: der Filter gehört dem BENUTZER — ein Konto-Wechsel erbt nichts');
await laden('u_zwei');
{
  const z = await zustand();
  ok('Zweitnutzer startet auf «Alle» (kein geerbter Filter)', z.af === 'all', z.af);
  ok('sein privater Bereich ist nicht ausgeblendet', !/ausgeblendet/.test(z.pers), z.pers.slice(0, 80));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 3));
}

await ctx.close();
await browser.close();
server.close();
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
