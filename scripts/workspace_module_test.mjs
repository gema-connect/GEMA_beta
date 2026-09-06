// Workspace-Modulkatalog (sys_workspace.html): Der Eimer-Modul-Picker muss
// ALLE aktuellen GEMA-Module anbieten (Drift-Guard gegen «Workspace wurde
// nicht nachgeführt») und nach Modul-Permission filtern.
//
// Layer A (statisch, ohne Browser): MODULES aus sys_workspace.html parsen —
//   jede href-Datei existiert, id = Datei-Basename, id ist in GemaAuth.FILE_MAP
//   (ausser Hub-Whitelist), Pflicht-Module vorhanden, keine Duplikate.
// Layer B (Playwright): Picker zeigt die neuen Module + Kategorien, Modul
//   hinzufügen erzeugt eine Kachel, Permission-Filter blendet verbotene aus.
//
// Aufruf:  CHROME=<chromium> node scripts/workspace_module_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8898;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// ── Layer A: statische Katalog-Prüfung ───────────────────────────────
console.log('— A) Statischer Modul-Katalog —');
const wsHtml = readFileSync(join(ROOT, 'sys_workspace.html'), 'utf8');
const modRe = /\{id:'([a-z0-9_]+)',name:'([^']+)',icon:'([a-z-]+)',desc:'([^']*)',href:'([^']+)',cat:'([a-z]+)'\}/g;
const mods = [];
let mm;
while ((mm = modRe.exec(wsHtml))) mods.push({ id: mm[1], name: mm[2], icon: mm[3], href: mm[5], cat: mm[6] });
ok(mods.length >= 60, 'Katalog umfasst >= 60 Module (' + mods.length + ')');
const ids = mods.map(m => m.id);
ok(new Set(ids).size === ids.length, 'keine doppelten Modul-IDs');
let filesOk = true, hrefOk = true;
mods.forEach(m => {
  if (!existsSync(join(ROOT, m.href))) { filesOk = false; console.log('    fehlt:', m.href); }
  if (m.href !== m.id + '.html') { hrefOk = false; console.log('    id≠href:', m.id, m.href); }
});
ok(filesOk, 'jede href-Datei existiert im Repo');
ok(hrefOk, 'id = Datei-Basename (Permission-Gating via FILE_MAP)');
// FILE_MAP-Abdeckung (Hub-Seiten ohne Modul-Key sind ok)
const authJs = readFileSync(join(ROOT, 'gema_auth.js'), 'utf8');
const fmSrc = authJs.slice(authJs.indexOf('var FILE_MAP'), authJs.indexOf('};', authJs.indexOf('var FILE_MAP')));
const HUBS = ['pm_ausschreibung'];
let fmOk = true;
mods.forEach(m => {
  if (HUBS.indexOf(m.id) >= 0) return;
  if (fmSrc.indexOf("'" + m.id + "'") < 0) { fmOk = false; console.log('    fehlt in FILE_MAP:', m.id); }
});
ok(fmOk, 'jede Modul-ID (ausser Hubs) in GemaAuth.FILE_MAP');
// Pflicht-Module: die neuen Bereiche muessen im Katalog sein
['sb_zirkulation', 'sb_druckanstieg', 'sb_saugpumpe', 'sb_mischkreuz', 'sb_summenlinien', 'sa_frischwasserstation', 'sb_grundleitungen', 'sb_regenwasserrechner', 'sb_regenwasser_luzern', 'sb_kreisprofil',
 'sb_fluessiggas', 'sb_druckverlust_erdgas', 'sb_druckverlust_medizinalgas',
 'hz_ausdehnungsgefaess', 'hz_heizungsleitungen', 'hz_waermegruppen', 'hz_heizlast',
 'lt_hx_diagramm', 'br_gasloeschung', 'br_vkf_formulare',
 'el_spannungsfall', 'el_belastbarkeit', 'el_kurzschluss', 'el_leistungsbedarf',
 'el_beleuchtung', 'el_photovoltaik', 'el_potenzialausgleich', 'el_poe', 'el_angaben',
 'pm_erp', 'pm_einsatzplan', 'pm_stunden', 'pm_regierapport', 'pm_bestellungen',
 'pm_revisionsunterlagen', 'pm_behoerden_formulare', 'pm_plaene', 'pm_planablage',
 'pm_ausschreibungsunterlagen', 'pm_schnellausschreibung', 'pm_goodel', 'pm_wirtschaftlichkeit',
 'pm_machbarkeitsstudie', 'pm_zustandsanalyse', 'pm_lebensdauer',
 'hy_legionellen', 'hy_spuelmanager', 'sv_service',
 'sd_schadensbericht', 'if_trocknung', 'sp_dachbericht',
 'if_wareneingang', 'if_arbeitskleider', 'iv_immobilien',
 'sys_lieferant_dashboard'
].forEach(id => ok(ids.indexOf(id) >= 0, 'Modul im Katalog: ' + id));
// Jede cat existiert in MODULE_CATS
const catRe = /\{id:'([a-z]+)',label:'([^']+)',icon:'[a-z-]+'\}/g;
const cats = []; let cm;
const catSrc = wsHtml.slice(wsHtml.indexOf('var MODULE_CATS'), wsHtml.indexOf('var MODULES='));
while ((cm = catRe.exec(catSrc))) cats.push(cm[1]);
ok(cats.length >= 10, 'Kategorien vorhanden (' + cats.length + ')');
let catOk = true;
mods.forEach(m => { if (cats.indexOf(m.cat) < 0) { catOk = false; console.log('    unbekannte cat:', m.id, m.cat); } });
ok(catOk, 'jede Modul-cat existiert in MODULE_CATS');
// Alle Icons existieren im ICONS-Set
const iconSrc = wsHtml.slice(wsHtml.indexOf('var ICONS'), wsHtml.indexOf('function icon('));
let icoOk = true;
mods.forEach(m => { if (iconSrc.indexOf("'" + m.icon + "'") < 0 && iconSrc.indexOf(m.icon + ":'") < 0) { icoOk = false; console.log('    unbekanntes Icon:', m.id, m.icon); } });
ok(icoOk, 'jedes Modul-Icon existiert im ICONS-Set');

// ── Layer B: Picker im Browser ───────────────────────────────────────
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/sys_workspace.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'x.y.z', userId: 'u1', expires: FUTURE };

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return route.fulfill({ contentType: 'application/json', body: '[]' });
  if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
  { gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: SESSION });
const page = await ctx.newPage();
page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);

console.log('— B) Picker im Browser (Admin) —');
ok(page.errs.length === 0, 'sys_workspace bootet ohne pageerrors');
const hook = await page.evaluate(() => {
  if (!window._wsModulesHook) return null;
  const h = window._wsModulesHook();
  return { mods: h.modules.length, cats: h.cats.length, statusKeys: Object.keys(h.statusCfg).length };
});
ok(!!hook, '_wsModulesHook vorhanden');
ok(hook && hook.mods === mods.length, 'Hook liefert denselben Katalog wie das Markup (' + (hook && hook.mods) + ')');
ok(hook && hook.statusKeys >= 30, '_WS_STATUS_CFG deckt die Berechnungsmodule ab (' + (hook && hook.statusKeys) + ' Einträge)');

// Eimer anlegen + Picker öffnen
await page.evaluate(() => window._wsQuickCreate('project'));
await page.waitForTimeout(300);
await page.evaluate(() => window._wsOpenModulePicker());
await page.waitForTimeout(300);
const picker = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('.ws-modpicker .ws-modpicker-item .ws-modpicker-name')).map(n => n.textContent.trim());
  const cats = Array.from(document.querySelectorAll('.ws-modpicker .ws-modpicker-cat')).map(n => n.textContent.trim());
  return { items, cats };
});
ok(picker.items.length >= 60, 'Picker zeigt >= 60 Module (' + picker.items.length + ')');
['Offerten / Aufträge / Rechnungen', 'Termine', 'Stundenerfassung', 'Zirkulation', 'Ausdehnungsgefäss', 'h,x-Diagramm', 'Gaslöschanlagen', 'Hygienemanagement', 'Immobilienverwaltung', 'Wareneingang', 'Arbeitskleider', 'Plandialog', 'Pläne & Flächen', 'Dachbericht']
  .forEach(n => ok(picker.items.indexOf(n) >= 0, 'Picker enthält «' + n + '»'));
['Heizung & Wärmeerzeugung', 'Lüftung & Klimatisierung', 'Gas', 'Brandschutz & Sprinkler', 'Immobilien']
  .forEach(c => ok(picker.cats.some(x => x.indexOf(c) >= 0), 'Kategorie «' + c + '» sichtbar'));

// Modul hinzufügen → Kachel erscheint
await page.evaluate(() => window._wsPickModule('pm_erp'));
await page.waitForTimeout(300);
const tile = await page.evaluate(() => {
  // href kann das Eimer-Objekt als ?objekt=<id> tragen
  const t = Array.from(document.querySelectorAll('.ws-mod-tile')).find(x => (x.getAttribute('href') || '').indexOf('pm_erp.html') === 0);
  return t ? t.textContent : '';
});
ok(/Offerten \/ Aufträge \/ Rechnungen/.test(tile), 'Modul hinzugefügt → Kachel «pm_erp» im Eimer');

// Permission-Filter: can() verweigern → Modul verschwindet aus dem Picker
const gated = await page.evaluate(() => {
  const h = window._wsModulesHook();
  const before = h.allowed({ id: 'pm_stunden' });
  const origCan = window.GemaAuth.can;
  window.GemaAuth.can = function (a, mod) { if (mod === 'stundenerfassung') return false; return origCan.apply(window.GemaAuth, arguments); };
  const after = h.allowed({ id: 'pm_stunden' });
  // Hub folgt seinen Unter-Modulen (HUB_SUBMODS): sichtbar, solange eines lesbar ist …
  const hub = h.allowed({ id: 'pm_ausschreibung' });
  // … und ausgeblendet, wenn ALLE Ausschreibungs-Unter-Module gesperrt sind
  // (Nur-Prüfliste-Rolle sah sonst die Ausschreibungs-Kachel).
  window.GemaAuth.can = function (a, mod) {
    if (['stundenerfassung', 'ausschreibungsunterlagen', 'schnellausschreibung', 'crbx_offertvergleich'].indexOf(mod) >= 0) return false;
    return origCan.apply(window.GemaAuth, arguments);
  };
  const hubDenied = h.allowed({ id: 'pm_ausschreibung' });
  window._wsOpenModulePicker();
  const names = Array.from(document.querySelectorAll('.ws-modpicker .ws-modpicker-name')).map(n => n.textContent.trim());
  window.GemaAuth.can = origCan;
  return { before, after, hub, hubDenied, hidden: names.indexOf('Stundenerfassung') < 0, other: names.indexOf('Termine') >= 0 };
});
ok(gated.before === true, '_wsModAllowed: erlaubt mit read-Permission');
ok(gated.after === false, '_wsModAllowed: verweigert ohne read-Permission');
ok(gated.hub === true, 'Hub sichtbar, solange ein Ausschreibungs-Unter-Modul lesbar ist');
ok(gated.hubDenied === false, 'Hub ausgeblendet, wenn ALLE Unter-Module gesperrt sind');
ok(gated.hidden, 'Picker blendet verbotenes Modul aus');
ok(gated.other, 'übrige Module bleiben im Picker');
ok(page.errs.length === 0, 'keine pageerrors nach Picker-Interaktionen');

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
