// Drift-Guard: Feedback 05.08.2026 (zweite Runde, Sandro Caso)
//
//  lu_tabelle #1  rot    Pfad aus dem Eimer statt der Übersichtsseite,
//                        klickbar, Modul speichert automatisch
//                 orange «Variante» und «Vergleich» können gelöscht werden
//  workspace  #1  rot    «Modul hinzufügen» nach links + Mehrfachauswahl
//                        im Dialogfenster
//                 orange Kachel «Vorlagen»
//                 grün   Kachel «Zuletzt verwendete Module (5 Stück)»
//  workspace  #2         Einladen: Dozent UND Student ergänzen
//  workspace  #3         die vier Eimer-Karten alle nebeneinander
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260805_1_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';
import { readFileSync, existsSync, readdirSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};

const WS = readFileSync('sys_workspace.html', 'utf8');
const AUTH = readFileSync('gema_auth.js', 'utf8');

/* ═══ A — statisch ════════════════════════════════════════════════════ */
console.log('■ A: Verdrahtung');
ok('gema_varianten.js ist entfernt', !existsSync('gema_varianten.js'));
{
  const rest = readdirSync('.').filter(f => f.endsWith('.html') && readFileSync(f, 'utf8').includes('gema_varianten.js'));
  ok('kein Modul bindet die Datei noch ein', rest.length === 0, rest);
}
ok('vier Eimer-Karten nebeneinander', /\.ws-empty-cards\{[^}]*repeat\(4,minmax\(0,1fr\)\)/.test(WS));
ok('Leerzustand: drei Einstiege in einer Reihe',
  /_wsHeroAdd\(\)\+_wsHeroVorlagen\(b\)\+_wsHeroZuletzt\(b\)/.test(WS));
ok('«Modul hinzufügen» steht zuerst', WS.indexOf('function _wsHeroAdd') < WS.indexOf('function _wsHeroVorlagen'));
ok('Zuletzt-verwendet liest GemaRecent', /_wsZuletztModule[\s\S]{0,700}GemaRecent\.list\(\)/.test(WS));
ok('Mehrfachauswahl im Picker', /_wsPickToggle/.test(WS) && /_wsPickCommit/.test(WS));
ok('Einzel-API _wsPickModule bleibt bestehen', /window\._wsPickModule=function/.test(WS));
ok('Picker prüft die Berechtigung auch beim Sammel-Hinzufügen',
  /_wsPickCommit=function[\s\S]{0,900}_wsModAllowed\(mod\)/.test(WS));
ok('Klassen-Kandidaten liefern Dozent UND Studierende',
  /\[\['dozentIds','Dozent'\],\['studentIds','Studierende'\]\]/.test(WS));
ok('Einladen-Dialog zeigt die Klassen-Sektion', /Aus meinen Klassen/.test(WS));
ok('_wsDozKandidaten ist nur noch die Dozenten-Sicht',
  /function _wsDozKandidaten\(\)\{\s*return _wsKlassenKandidaten\(\)\.filter/.test(WS));
ok('Eimer-Pfad wird beim Kachel-Klick gemerkt', /window\._wsMerkPfad=function/.test(WS));
ok('Der Merker läuft über bucketSichtbar (kein fremder Eimer)',
  /_wsMerkPfad=function\(bucketId\)\{\s*var b=bucketSichtbar\(bucketId\)/.test(WS));
ok('Rückweg ?eimer= öffnet den Eimer', /function _wsDeepLink\(\)/.test(WS) && /get\('eimer'\)/.test(WS));
ok('gema_auth schreibt den Eimer-Pfad', /function _eimerPfad\(\)/.test(AUTH));
ok('… und ruft ihn beim Seitenstart auf', /_swapLogo\(userOrg\);\s*_eimerPfad\(\);/.test(AUTH));
ok('Pfad NUR aus dem gemerkten Kontext (kein Pool-Lookup über die URL)',
  /_eimerPfad[\s\S]{0,1400}gema_ws_ctx_v1/.test(AUTH) && !/_eimerPfad[\s\S]{0,1400}gema_ws_pool_v1/.test(AUTH));
ok('Kontext gilt nur für das eigene Konto', /ctx\.userId!==s\.userId/.test(AUTH));
ok('… und nur beim passenden Objekt', /_aktivesObjekt\(\)!==ctx\.objektId/.test(AUTH));
ok('Klick auf den Pfad speichert zuerst', /GemaAutoSave\.save\(\)/.test(AUTH));
ok('_esc deckt alle fünf Zeichen ab',
  /function _esc\(s\)\{[^}]*&quot;[^}]*&#39;/.test(AUTH));

/* ═══ B — im Browser ══════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

function basis(extra) {
  const s = seed(['role_planer']);
  s['gema_coachmarks_done_sys_workspace_v2'] = '1';
  Object.assign(s, extra || {});
  return s;
}
/* Der Harness-Mock beantwortet JEDEN Cloud-GET mit [] — `bindCollection`
   leert damit den geseedeten Cache. Wo eine Collection wirklich gebraucht
   wird (Klassen), liefert diese Route sie als echte per-Record-Rows. */
async function cloud(ctx, rows) {
  await ctx.route(/rest\/v1\/gema_data/, route => {
    const u = route.request().url();
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const mk = (/module_key=eq\.([^&]+)/.exec(u) || [])[1];
    const key = mk ? decodeURIComponent(mk) : '';
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows[key] || []) });
  });
}

async function seite(st, url, rows) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await wireRoutes(ctx);
  if (rows) await cloud(ctx, rows);
  await ctx.addInitScript(o => {
    for (const [k, v] of Object.entries(o)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + (url || '/sys_workspace.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}

console.log('\n■ B1: die vier Eimer-Karten stehen nebeneinander');
{
  const { ctx, page, errs } = await seite(basis());
  const box = await page.evaluate(() => [...document.querySelectorAll('.ws-empty-card')]
    .map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }));
  ok('vier Karten vorhanden', box.length === 4, box.length);
  ok('alle auf derselben Höhe (eine Reihe)', box.length === 4 && new Set(box.map(b => b.y)).size === 1, box.map(b => b.y));
  ok('… und nach links versetzt (vier Spalten)', new Set(box.map(b => b.x)).size === 4, box.map(b => b.x));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B2: leerer Eimer — Hinzufügen links, Vorlagen, Zuletzt verwendet');
{
  const { ctx, page, errs } = await seite(basis({
    gema_recent_v1: [{ key: 'sb_druckverlust', ts: Date.now() }, { key: 'pm_erp', ts: Date.now() - 1 }],
    gema_ws_templates_v1: [{ name: 'Sanitär Standard', modules: ['sb_lu_tabelle', 'sb_druckverlust'] }]
  }));
  await page.evaluate(() => window._wsNatCreate('Meine Lerngruppe', 'lerngruppe'));
  await page.waitForTimeout(700);
  const heroes = await page.evaluate(() => [...document.querySelectorAll('.ws-mod-hero')]
    .map(e => ({ t: (e.querySelector('.ws-mod-hero-title') || {}).textContent || '', x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y) })));
  ok('drei Kacheln', heroes.length === 3, heroes.map(h => h.t));
  ok('«Modul hinzufügen» ganz links', heroes[0] && /Modul hinzufügen/.test(heroes[0].t) && heroes[0].x < heroes[1].x, heroes.map(h => h.t));
  ok('daneben «Vorlagen»', heroes[1] && /Vorlagen/.test(heroes[1].t));
  ok('daneben «Zuletzt verwendet»', heroes[2] && /Zuletzt verwendet/.test(heroes[2].t));
  ok('alle in einer Reihe', new Set(heroes.map(h => h.y)).size === 1, heroes.map(h => h.y));
  const zuletzt = await page.evaluate(() => [...document.querySelectorAll('.ws-mod-hero')][2]
    .querySelectorAll('.ws-mod-hero-item').length);
  ok('zuletzt verwendete Module werden gelistet', zuletzt === 2, zuletzt);
  ok('höchstens fünf', await page.evaluate(() => _wsHooks.zuletzt({ modules: [] }, 5).length <= 5));
  // Klick auf ein zuletzt verwendetes Modul fügt es hinzu
  await page.evaluate(() => [...document.querySelectorAll('.ws-mod-hero')][2].querySelector('.ws-mod-hero-item').click());
  await page.waitForTimeout(500);
  ok('Klick fügt das Modul hinzu',
    await page.evaluate(() => (_wsHooks.buckets()[0].modules || []).length === 1));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B3: Vorlagen-Kachel setzt alle Module der Vorlage');
{
  const { ctx, page, errs } = await seite(basis({
    gema_ws_templates_v1: [{ name: 'Sanitär Standard', modules: ['sb_lu_tabelle', 'sb_druckverlust'] }]
  }));
  await page.evaluate(() => window._wsNatCreate('Neubau', 'project'));
  await page.waitForTimeout(600);
  await page.evaluate(() => [...document.querySelectorAll('.ws-mod-hero')][1].querySelector('.ws-mod-hero-item').click());
  await page.waitForTimeout(600);
  ok('beide Module der Vorlage sind da',
    await page.evaluate(() => (_wsHooks.buckets()[0].modules || []).length === 2));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B4: Mehrfachauswahl im Modul-Dialog');
{
  const { ctx, page, errs } = await seite(basis());
  await page.evaluate(() => window._wsNatCreate('Neubau', 'project'));
  await page.waitForTimeout(600);
  await page.evaluate(() => window._wsOpenModulePicker());
  await page.waitForTimeout(400);
  const btn0 = await page.evaluate(() => (document.getElementById('wsPickAdd') || {}).disabled);
  ok('Knopf startet deaktiviert', btn0 === true);
  await page.evaluate(() => { _wsPickToggle('sb_lu_tabelle', document.querySelector('.ws-modpicker-item')); });
  await page.evaluate(() => { _wsPickToggle('sb_druckverlust'); });
  await page.evaluate(() => { _wsPickToggle('pm_erp'); });
  const lbl = await page.evaluate(() => (document.getElementById('wsPickAdd') || {}).textContent);
  ok('Knopf nennt die Anzahl', /3 Module/.test(lbl || ''), lbl);
  ok('markierte Zeile ist sichtbar markiert',
    await page.evaluate(() => document.querySelector('.ws-modpicker-item.sel') !== null));
  await page.evaluate(() => window._wsPickCommit());
  await page.waitForTimeout(600);
  const mods = await page.evaluate(() => (_wsHooks.buckets()[0].modules || []).map(m => m.mod));
  ok('alle drei in einem Rutsch hinzugefügt', mods.length === 3, mods);
  ok('Aktivität fasst zusammen',
    await page.evaluate(() => /3 Module/.test((_wsHooks.buckets()[0].activity[0] || {}).text || '')));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B5: Einladen — Dozent UND Studierende aus den eigenen Klassen');
{
  const st = basis();
  st['gema_users_v1'] = st['gema_users_v1'].concat([
    { id: 'u_doz', name: 'Dora Dozentin', username: 'dora@hf.ch', active: true, orgId: 'org_test', roleIds: ['role_dozent'] },
    { id: 'u_stud', name: 'Sven Student', username: 'sven@hf.ch', active: true, orgId: 'org_test', roleIds: ['role_student'] },
    { id: 'u_weg', name: 'Weg Gewesen', username: 'weg@hf.ch', active: false, orgId: 'org_test', roleIds: ['role_student'] }
  ]);
  const KL = {
    id: 'kl_1', name: 'HF25', orgId: 'org_test', archiviert: false,
    dozentIds: ['u_doz'], studentIds: ['u_test', 'u_stud', 'u_weg'], module: []
  };
  st['gema_schule_klassen_pool_v1'] = [KL];
  const { ctx, page, errs } = await seite(st, null,
    { schule: [{ data_key: 'sklasse:kl_1', payload: { data: KL } }] });
  /* Mit einer echten Klasse legt der Workspace zusätzlich die Auto-Eimer an
     — die Lerngruppe darum über ihre id ansprechen, nicht über buckets()[0]. */
  const gid = await page.evaluate(() => window._wsNatCreate('Meine Lerngruppe', 'lerngruppe'));
  await page.waitForTimeout(700);
  const kand = await page.evaluate(() => _wsHooks.klassenKandidaten().map(k => k.name + '|' + k.rolle));
  ok('Dozentin wird angeboten', kand.some(k => /Dora/.test(k) && /Dozent/.test(k)), kand);
  ok('Mitstudent wird angeboten', kand.some(k => /Sven/.test(k) && /Studierende/.test(k)), kand);
  ok('man selbst nicht', !kand.some(k => /Test User/.test(k)), kand);
  ok('ein deaktiviertes Konto nicht', !kand.some(k => /Weg Gewesen/.test(k)), kand);
  await page.evaluate(() => window._wsInvite());
  await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => (document.querySelector('.ws-modal') || document.body).textContent);
  ok('Dialog zeigt die Klassen-Sektion', /Aus meinen Klassen/.test(dlg));
  ok('… mit beiden Personen', /Dora Dozentin/.test(dlg) && /Sven Student/.test(dlg));
  await page.evaluate(() => window._wsKlasseAdd('u_stud', 'Studierende'));
  await page.waitForTimeout(500);
  const bet = await page.evaluate(id => ((_wsHooks.buckets().find(b => b.id === id) || {}).beteiligte || [])
    .map(p => p.name + '|' + p.role), gid);
  ok('Studierender ist als Beteiligter erfasst', bet.some(b => /Sven Student\|Studierende/.test(b)), bet);
  ok('… und im Zugriff freigeschaltet',
    await page.evaluate(id => (((_wsHooks.buckets().find(b => b.id === id) || {}).accessControl || {}).nurUserIds || []).indexOf('u_stud') >= 0, gid));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B6: Eimer-Pfad im Modul + Rückweg');
{
  const { ctx, page, errs } = await seite(basis());
  await page.evaluate(() => window._wsNatCreate('Neubau Musterstrasse', 'project'));
  await page.waitForTimeout(500);
  await page.evaluate(() => window._wsPickModule('sb_lu_tabelle'));
  await page.waitForTimeout(700);
  await page.click('.ws-mod-tile');
  await page.waitForTimeout(2200);
  const bc = await page.evaluate(() => {
    const b = document.querySelector('.g-nav-bc');
    return { text: b ? b.textContent.trim() : '', href: (b && b.querySelector('.bc-eimer')) ? b.querySelector('.bc-eimer').getAttribute('href') : '' };
  });
  ok('Pfad zeigt den Eimer', /^Neubau Musterstrasse/.test(bc.text), bc.text);
  ok('… und danach das Modul', /LU-Tabelle/.test(bc.text), bc.text);
  ok('die Übersichtsseite steht NICHT mehr im Pfad', !/Sanitärberechnungen/.test(bc.text), bc.text);
  ok('Pfad ist klickbar', /^sys_workspace\.html\?eimer=ws_/.test(bc.href), bc.href);
  await page.click('.bc-eimer');
  await page.waitForTimeout(2000);
  ok('Rückweg öffnet den Eimer',
    (await page.evaluate(() => [...document.querySelectorAll('.ws-tab-name')].map(e => e.textContent.trim())))
      .includes('Neubau Musterstrasse'));
  ok('keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B7: der Pfad erscheint NUR im passenden Zusammenhang');
{
  /* Ein untergeschobener Kontext eines FREMDEN Kontos darf keinen Eimer-Namen
     zeigen — Eimer-Namen sind Projektnamen. */
  const st = basis({
    gema_ws_ctx_v1: { bucketId: 'ws_fremd', name: 'Geheimprojekt Bank', objektId: 'obj_ws_ws_fremd', userId: 'u_anderer', ts: Date.now() }
  });
  const { ctx, page, errs } = await seite(st, '/sb_lu_tabelle.html?objekt=obj_ws_ws_fremd');
  const t1 = await page.evaluate(() => (document.querySelector('.g-nav-bc') || {}).textContent || '');
  ok('fremder Kontext wird verworfen', !/Geheimprojekt/.test(t1), t1.trim());
  ok('normaler Breadcrumb bleibt stehen', /Sanitärberechnungen/.test(t1), t1.trim());
  await ctx.close();

  /* Eigener Kontext, aber ein anderes Projekt offen → ebenfalls kein Eimer-Pfad */
  const st2 = basis({
    gema_ws_ctx_v1: { bucketId: 'ws_x', name: 'Eimer X', objektId: 'obj_ws_ws_x', userId: 'u_test', ts: Date.now() }
  });
  const b = await seite(st2, '/sb_lu_tabelle.html?objekt=obj_anderes');
  const t2 = await b.page.evaluate(() => (document.querySelector('.g-nav-bc') || {}).textContent || '');
  ok('anderes Projekt → kein Eimer-Pfad', !/Eimer X/.test(t2), t2.trim());
  ok('keine JS-Fehler', errs.length === 0 && b.errs.length === 0, errs.concat(b.errs).slice(0, 2));
  await b.ctx.close();
}

console.log('\n■ B8: Variante/Vergleich sind aus der Navigation verschwunden');
{
  const { ctx, page } = await seite(basis(), '/sb_lu_tabelle.html');
  const nav = await page.evaluate(() => (document.querySelector('.g-nav') || document.body).textContent);
  ok('kein «Variante»-Knopf', !/Variante/.test(nav), nav.replace(/\s+/g, ' ').slice(0, 120));
  ok('kein «Vergleich»-Knopf', !/Vergleich/.test(nav));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
