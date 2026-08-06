// Workspace: Klassen-Eimer in der Org, fixe Eimer, Rollen-Eimer (04.08.2026)
//
// User-Entscheid (Feedback 04.08.2026): es gibt KEINE eigene «Klassen»-
// Sektion. Der hervorgehobene Klassen-Eimer liegt in der ORG der Schule und
// erscheint dort zuoberst — Dozent UND Studierende sehen ihn automatisch.
//   (1) EIN GETEILTER Klassen-Eimer je Klasse (`ws_kl_<klasseId>`, Org-Eimer,
//       pinned, accessControl.nurUserIds = Dozenten + Studierende) mit dem
//       Modul «Meine Klasse».
//   (2) Darunter eingerueckt (subOf) der ÜBUNGS-Eimer PRO STUDENT mit der
//       ADRESSE der Org als Namen, eigenem Auto-Objekt und den vom Dozenten
//       freigeschalteten Modulen (ADD-ONLY nachgefuehrt).
//   (3) Wer nicht zur Klasse gehoert, sieht den Eimer NICHT — auch nicht in
//       derselben Org (accessControl.nurUserIds, _bucketScopeOk).
//   (4) Der Org-Admin legt eigene FIXE Eimer an (ganze Firma / bestimmte
//       Personen / bestimmte Rollen), dazu gibt es automatische Rollen-Eimer
//       (Lieferanten-Dashboard).
//   (5) GEMA Card bleibt fuer Studierende gesperrt (UI + card-api 403), pro
//       Klasse entsteht EINE Chatgruppe mit stabiler Thread-ID.
//
// Aufruf: CHROME=<chromium> node scripts/schule_workspace_student_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { startServer, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

const KLASSE = {
  id: 'kl1', name: 'Kaltwasser HF 2026', lehrgang: 'HF Gebäudetechnik', code: 'K7M2XA',
  orgId: 'org_test', archiviert: false,
  dozentIds: ['u_doz'], studentIds: ['u_test'],
  module: ['lu_tabelle'], erstelltAm: '2026-08-01T08:00:00Z'
};
const ORG_SCHULE = { id: 'org_test', name: 'HF Schule Olten', kategorie: 'schule', kategorien: ['schule'], admins: [], active: true, adresse: { strasse: 'Musterstrasse 5', plz: '4600', ort: 'Olten' } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

// Stateful PostgREST-Mock: POSTs landen in einem Store, GETs liefern ihn
// zurueck — sonst wischte der (leere) objekte-Pull das frisch provisionierte
// Auto-Objekt wieder aus dem Blob und der Test würde flaken.
function makeRoutes(state) {
  return async route => {
    const req = route.request(); const u = req.url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
      const m = req.method();
      if (m === 'POST') {
        let rows = [];
        try { rows = JSON.parse(req.postData() || '[]'); } catch (e) {}
        if (!Array.isArray(rows)) rows = [rows];
        rows.forEach(r => {
          if (r && r.module_key && r.data_key) {
            state.store.set(r.module_key + '|' + r.data_key, (r.payload && r.payload.data) || null);
            state.posts.push({ mk: r.module_key, dk: r.data_key });
          }
        });
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      }
      if (m === 'DELETE') {
        const dm = /module_key=eq\.([^&]+)/.exec(u), dk = /data_key=eq\.([^&]+)/.exec(u);
        if (dm && dk) state.store.delete(decodeURIComponent(dm[1]) + '|' + decodeURIComponent(dk[1]));
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      }
      if (m === 'GET') {
        const gm = /module_key=eq\.([^&]+)/.exec(u);
        if (gm) {
          const mk = decodeURIComponent(gm[1]);
          const lk = /data_key=like\.([^&]+)/.exec(u);
          const pref = lk ? decodeURIComponent(lk[1]).replace(/\*$/, '') : '';
          const rows = [];
          state.store.forEach((data, key) => {
            const [km, kd] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
            if (km === mk && (!pref || kd.indexOf(pref) === 0)) rows.push({ data_key: kd, payload: { data } });
          });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
        }
        return route.fulfill({ contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  };
}

function studState() {
  const state = { store: new Map(), posts: [] };
  state.store.set('schule|sklasse:kl1', KLASSE);
  return state;
}
const SCHUL_USERS = [
  { id: 'u_test', username: 'stud@test.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true, profile: { email: 'stud@test.ch' } },
  { id: 'u_doz', username: 'doz@test.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true, profile: { email: 'doz@test.ch' } }
];
function studSeed() {
  const s = seed(['role_student'], { studentMods: ['lu_tabelle'] });
  s.gema_orgs_v1 = [ORG_SCHULE];
  s.gema_users_v1 = SCHUL_USERS;
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  return s;
}
async function newCtx(state, seedObj) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx.route('**/*', makeRoutes(state));
  await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seedObj);
  return ctx;
}
// Sidebar-Zeilen der ORG-Sektion (dort leben die Auto-Eimer — es gibt KEINE
// eigene Klassen-Sektion mehr).
const ORG_ROWS = () => Array.from(document.querySelectorAll('#wsOrgBuckets .ws-bucket-row'))
  .map(el => ({ cls: el.className, name: (el.querySelector('.ws-bucket-row__name') || {}).textContent || '' }));

try {
  // ── Teil A: Studentin — Auto-Eimer in der Org, Landing, Chatgruppe ──
  console.log('■ A: Studentin — Klassen-Eimer + Übungs-Eimer in der Org-Sektion');
  {
    const state = studState();
    const ctx = await newCtx(state, studSeed());
    const page = await ctx.newPage();
    const errors = [];
    // Fehler MIT Seite aufzeichnen: auf der Kein-Zugriff-Seite (Body wird
    // ersetzt) laufen Modul-Scripts benigne in fehlende Elemente («Cannot
    // set … of null») — im Workspace selbst zaehlt aber JEDER Fehler.
    page.on('pageerror', e => errors.push(page.url().split('/').pop() + ': ' + e.message));

    // Redirect: die Modulübersicht wirft Studierende in den Workspace
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    ok(/sys_workspace\.html/.test(page.url()), 'index.html leitet Studierende in den Workspace', page.url());

    // Provisionierung abwarten (Klassen- + Übungs-Eimer + Objekt)
    await page.waitForFunction(() => {
      const b = (window._wsHooks && _wsHooks.buckets()) || [];
      const ue = b.find(x => x.id === 'ws_ue_kl1_u_test');
      let objDa = false;
      try { objDa = !!(JSON.parse(localStorage.getItem('gema_objekte_v1') || '{}').objekte || []).find(o => o.id === 'obj_ws_ws_ue_kl1_u_test'); } catch (e) {}
      return !!(b.find(x => x.id === 'ws_kl_kl1') && ue && ue.objektId && objDa);
    }, { timeout: 8000 }).catch(() => {});

    const r = await page.evaluate(rowsFn => {
      const b = _wsHooks.buckets();
      const kl = b.find(x => x.id === 'ws_kl_kl1') || null;
      const ue = b.find(x => x.id === 'ws_ue_kl1_u_test') || null;
      let obj = null;
      try { obj = (JSON.parse(localStorage.getItem('gema_objekte_v1') || '{}').objekte || []).find(o => o.id === 'obj_ws_ws_ue_kl1_u_test') || null; } catch (e) {}
      let thread = null;
      try { thread = (JSON.parse(localStorage.getItem('gema_chat_threads_pool_v1') || '[]')).find(t => t && t.id === 'chtgrp_klasse_kl1') || null; } catch (e) {}
      const hook = window._wsModulesHook ? _wsModulesHook() : null;
      return {
        kl, ue, obj, thread,
        rows: eval('(' + rowsFn + ')')(),
        klasseSektionWeg: !document.getElementById('wsKlasseSection'),
        tabName: (document.querySelector('.ws-tab.active .ws-tab-name') || {}).textContent || '',
        cats: hook ? hook.cats.map(c => c.id) : [],
        modIds: hook ? hook.modules.map(m => m.id) : [],
        abKlassenErlaubt: hook ? hook.allowed({ id: 'ab_klassen' }) : null,
        cardLesen: (typeof GemaAuth !== 'undefined') ? GemaAuth.can('read', 'visitenkarte') : null,
        wsLesen: (typeof GemaAuth !== 'undefined') ? GemaAuth.can('read', 'workspace') : null,
        tile: !!document.querySelector('#wsModGrid a[href^="ab_klassen.html"]')
      };
    }, ORG_ROWS.toString());
    ok(r.klasseSektionWeg, 'es gibt KEINE eigene «Klassen»-Sektion mehr');
    ok(!!r.kl, 'geteilter Klassen-Eimer ws_kl_kl1 existiert (ohne User-Suffix)');
    ok(r.kl && r.kl.ownerType === 'org' && r.kl.ownerOrgId === 'org_test', 'Klassen-Eimer haengt an der ORG der Schule', r.kl && { t: r.kl.ownerType, o: r.kl.ownerOrgId });
    ok(r.kl && r.kl.pinned === true && r.kl.autoTyp === 'klasse' && r.kl.name === 'Kaltwasser HF 2026', 'Klassen-Eimer ist hervorgehoben + traegt den Klassennamen', r.kl && { n: r.kl.name, p: r.kl.pinned });
    ok(r.kl && JSON.stringify((r.kl.accessControl.nurUserIds || []).slice().sort()) === JSON.stringify(['u_doz', 'u_test']), 'Zugriff auf Dozent + Studierende beschraenkt', r.kl && r.kl.accessControl);
    ok(r.kl && r.kl.modules.some(m => m.mod === 'ab_klassen'), 'Modul «Meine Klasse» liegt fix im Klassen-Eimer');
    ok(!!r.ue, 'Übungs-Eimer ws_ue_kl1_u_test existiert');
    ok(r.ue && r.ue.ownerType === 'org' && r.ue.subOf === 'ws_kl_kl1', 'Übungs-Eimer haengt an der Org und ist dem Klassen-Eimer untergeordnet', r.ue && { t: r.ue.ownerType, s: r.ue.subOf });
    ok(r.ue && JSON.stringify(r.ue.accessControl.nurUserIds) === JSON.stringify(['u_test']), 'Übungs-Eimer ist NUR fuer diese Person (eigene Berechnungen)', r.ue && r.ue.accessControl);
    ok(r.ue && r.ue.name === 'Musterstrasse 5, 4600 Olten', 'Übungs-Eimer heisst wie die Org-Adresse', r.ue && r.ue.name);
    ok(r.ue && r.ue.modules.some(m => m.mod === 'sb_lu_tabelle'), 'freigeschaltetes Modul lu_tabelle → sb_lu_tabelle im Übungs-Eimer', r.ue && r.ue.modules);
    ok(r.ue && r.ue.objektId === 'obj_ws_ws_ue_kl1_u_test', 'Übungs-Eimer traegt sein Auto-Objekt', r.ue && r.ue.objektId);
    ok(r.obj && r.obj.strasse === 'Musterstrasse 5' && r.obj.plz === '4600' && r.obj.ort === 'Olten', 'Auto-Objekt traegt die Org-Adresse', r.obj);
    ok(r.rows.length >= 2 && /ws-bucket-row--pinned/.test(r.rows[0].cls) && r.rows[0].name === 'Kaltwasser HF 2026', 'Klassen-Eimer steht in der ORG-Sektion zuoberst', r.rows[0]);
    ok(r.rows[1] && /ws-bucket-row--sub/.test(r.rows[1].cls) && r.rows[1].name === 'Musterstrasse 5, 4600 Olten', 'Übungs-Eimer haengt DIREKT darunter (eingerueckt)', r.rows[1]);
    ok(r.tabName === 'Kaltwasser HF 2026', 'Landing: der Klassen-Eimer ist beim Einstieg geoeffnet', r.tabName);
    ok(r.tile, 'Modul-Kachel «Meine Klasse» verlinkt auf ab_klassen.html');
    ok(r.cats.indexOf('ausbildung') >= 0, 'Modul-Katalog kennt die Kategorie Ausbildung');
    ok(r.modIds.indexOf('ab_klassen') >= 0 && r.modIds.indexOf('ab_pruefung_live') >= 0, 'ab_klassen + ab_pruefung_live im MODULES-Katalog');
    ok(r.abKlassenErlaubt === true, 'Picker-Gating erlaubt ab_klassen fuer Studierende');
    ok(r.cardLesen === false, 'can(read, visitenkarte) ist fuer Studierende false');
    ok(r.wsLesen === true, 'can(read, workspace) ist fuer Studierende true');
    ok(!!r.thread && r.thread.gruppe === true, 'Klassen-Chatgruppe chtgrp_klasse_kl1 existiert (gruppe:true)');
    ok(r.thread && r.thread.titel === 'Kaltwasser HF 2026', 'Chatgruppe traegt den Klassennamen als Titel', r.thread && r.thread.titel);
    ok(r.thread && JSON.stringify((r.thread.teilnehmerIds || []).slice().sort()) === JSON.stringify(['u_doz', 'u_test']), 'Dozent + Studentin sind Mitglieder', r.thread && r.thread.teilnehmerIds);
    const chatPosts = state.posts.filter(p => p.mk === 'chat' && p.dk === 'chat:chtgrp_klasse_kl1').length;
    ok(chatPosts === 1, 'genau EIN Cloud-Write fuer den Gruppen-Thread', chatPosts);

    // Idempotenz + ADD-ONLY-Heilung
    await page.evaluate(() => {
      const ue = _wsHooks.buckets().find(x => x.id === 'ws_ue_kl1_u_test');
      ue.modules = ue.modules.filter(m => m.mod !== 'sb_lu_tabelle');   // Studentin entfernt das Modul
      _wsHooks.provision();                                             // naechster Lauf
    });
    await page.waitForTimeout(700);
    const r2 = await page.evaluate(() => {
      const b = _wsHooks.buckets();
      return {
        n: b.filter(x => x.autoTyp).length,
        wieder: b.find(x => x.id === 'ws_ue_kl1_u_test').modules.some(m => m.mod === 'sb_lu_tabelle'),
        abK: b.find(x => x.id === 'ws_kl_kl1').modules.filter(m => m.mod === 'ab_klassen').length,
        threads: (JSON.parse(localStorage.getItem('gema_chat_threads_pool_v1') || '[]')).filter(t => t && t.id === 'chtgrp_klasse_kl1').length
      };
    });
    ok(r2.n === 2, 'zweiter Lauf legt KEINE weiteren Auto-Eimer an (idempotent)', r2.n);
    ok(r2.wieder === true, 'entferntes freigeschaltetes Modul kommt wieder (ADD-ONLY-Sync)');
    ok(r2.abK === 1, 'ab_klassen bleibt genau einmal im Klassen-Eimer', r2.abK);
    ok(r2.threads === 1, 'Chatgruppe bleibt EIN Thread (kein Duplikat)', r2.threads);
    const chatPosts2 = state.posts.filter(p => p.mk === 'chat' && p.dk === 'chat:chtgrp_klasse_kl1').length;
    ok(chatPosts2 === 1, 'unveraenderte Mitglieder → kein weiterer Cloud-Write', chatPosts2);

    // Auto-Eimer sind fest verwaltet
    const ctxMenu = await page.evaluate(() => {
      const row = document.querySelector('#wsOrgBuckets .ws-bucket-row--pinned');
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
      const m = document.querySelector('.ws-ctx');
      const txt = m ? m.textContent : '';
      return { da: !!m, hatModul: /Modul hinzufügen/.test(txt), hatLoeschen: /Löschen/.test(txt), hatUmben: /Umbenennen/.test(txt) };
    });
    ok(ctxMenu.da && ctxMenu.hatModul, 'Kontextmenü am Auto-Eimer bietet «Modul hinzufügen»', ctxMenu);
    ok(!ctxMenu.hatLoeschen && !ctxMenu.hatUmben, 'Kontextmenü am Auto-Eimer OHNE Löschen/Umbenennen', ctxMenu);
    await page.keyboard.press('Escape');
    const delGuard = await page.evaluate(() => {
      window._wsConfirmDelete('ws_kl_kl1');
      return { modal: document.getElementById('wsModalRoot').innerHTML.length, buckets: _wsHooks.buckets().length };
    });
    ok(delGuard.modal === 0, '_wsConfirmDelete oeffnet fuer Auto-Eimer KEINEN Dialog', delGuard.modal);

    // Eigene Eimer bleiben moeglich (User: «weitere buckets erstellen, auch private»)
    const eigene = await page.evaluate(rowsFn => {
      _wsHooks.buckets().push({ id: 'ws_priv1', name: 'Mein Test', type: 'private', ownerType: 'personal', createdBy: 'u_test', members: [], modules: [], activity: [], beteiligte: [], notes: [], objektId: null, createdAt: new Date().toISOString() });
      _wsHooks.save(); _wsHooks.load();
      return { inPersoenlich: /Mein Test/.test(document.getElementById('wsPersonal').textContent), orgRows: eval('(' + rowsFn + ')')().length };
    }, ORG_ROWS.toString());
    ok(eigene.inPersoenlich, 'privater Eimer erscheint unter «Meine Eimer»');
    ok(eigene.orgRows === 2, 'Org-Sektion bleibt bei den zwei Auto-Eimern', eigene.orgRows);

    // Kein-Zugriff eines gesperrten Moduls fuehrt zurueck in den Workspace
    await page.goto(BASE + '/sb_zirkulation.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const kz = await page.evaluate(() => ({
      hint: /nicht freigeschaltet/.test(document.body.textContent || ''),
      link: !!document.querySelector('a[href="sys_workspace.html"]')
    }));
    ok(kz.hint && kz.link, 'Kein-Zugriff-Screen verlinkt «← Zum Workspace»', kz);

    // sys_profil: Karten-Sektion bleibt unsichtbar
    await page.goto(BASE + '/sys_profil.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1100);
    const prof = await page.evaluate(() => {
      const c = document.getElementById('cardQrCard');
      return { display: c ? c.style.display : '(fehlt)' };
    });
    ok(prof.display === 'none', 'GEMA-Card-QR in den Einstellungen bleibt fuer Studierende verborgen', prof);

    var wsErrors = errors.filter(e => /^(sys_workspace|index)\.html/.test(e));
    var restErrors = errors.filter(e => !/^(sys_workspace|index)\.html/.test(e) && !/Cannot (read|set)|null|undefined/.test(e));
    ok(wsErrors.length === 0, 'keine JS-Fehler im Workspace (' + wsErrors.slice(0, 2).join(' | ') + ')');
    ok(restErrors.length === 0, 'keine unerwarteten JS-Fehler auf den Folgeseiten (' + restErrors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── Teil B: Dozent sieht DENSELBEN Klassen-Eimer im Workspace ──
  console.log('■ B: Dozent — derselbe Klassen-Eimer, kein Übungs-Eimer');
  {
    const state = studState();
    // Die Studentin hat den Eimer bereits provisioniert (Cloud-Stand)
    state.store.set('workspace|ws:ws_kl_kl1', {
      id: 'ws_kl_kl1', name: 'Kaltwasser HF 2026', type: 'training', ownerType: 'org', ownerOrgId: 'org_test',
      createdBy: 'u_test', autoTyp: 'klasse', autoKlasseId: 'kl1', pinned: true,
      accessControl: { orgVisible: false, invitedUsers: [], revokedUsers: [], nurUserIds: ['u_doz', 'u_test'] },
      org: '', members: [], modules: [{ mod: 'ab_klassen', status: 'offen' }], activity: [], beteiligte: [], notes: [], objektId: null, createdAt: '2026-08-04T10:00:00Z'
    });
    const s = seed(['role_dozent']);
    s.gema_orgs_v1 = [ORG_SCHULE];
    s.gema_users_v1 = [
      { id: 'u_test', username: 'doz@test.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true, profile: { email: 'doz@test.ch' } },
      { id: 'u_stud', username: 'stud@test.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true, profile: { email: 'stud@test.ch' } }
    ];
    s.gema_coachmarks_done_sys_workspace_v2 = '1';
    // Klasse gehoert dem Dozenten u_test, Mitglied ist u_stud
    state.store.set('schule|sklasse:kl1', Object.assign({}, KLASSE, { dozentIds: ['u_test'], studentIds: ['u_stud'] }));
    const ctx = await newCtx(state, s);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const b = (window._wsHooks && _wsHooks.buckets()) || [];
      const kl = b.find(x => x.id === 'ws_kl_kl1');
      return !!(kl && (kl.accessControl.nurUserIds || []).indexOf('u_test') >= 0);
    }, { timeout: 8000 }).catch(() => {});
    const d = await page.evaluate(rowsFn => {
      const b = _wsHooks.buckets();
      const kl = b.find(x => x.id === 'ws_kl_kl1') || null;
      return {
        kl, rows: eval('(' + rowsFn + ')')(),
        anzahl: b.filter(x => x.id.indexOf('ws_kl_') === 0).length,
        uebung: b.filter(x => x.autoTyp === 'uebung').length,
        sichtbar: kl ? _wsHooks.canSee(kl) : false
      };
    }, ORG_ROWS.toString());
    ok(d.sichtbar === true, 'Dozent sieht den Klassen-Eimer (Mitglied via nurUserIds)');
    ok(d.anzahl === 1, 'es bleibt bei EINEM geteilten Klassen-Eimer (kein zweiter je Person)', d.anzahl);
    ok(d.rows[0] && /ws-bucket-row--pinned/.test(d.rows[0].cls) && d.rows[0].name === 'Kaltwasser HF 2026', 'Klassen-Eimer erscheint beim Dozenten in der Org-Sektion', d.rows[0]);
    ok(d.kl && JSON.stringify((d.kl.accessControl.nurUserIds || []).slice().sort()) === JSON.stringify(['u_stud', 'u_test']), 'Mitglieder werden nachgezogen (Dozent + Studierender)', d.kl && d.kl.accessControl.nurUserIds);
    ok(d.uebung === 0, 'Dozent bekommt KEINEN Übungs-Eimer', d.uebung);
    ok(errors.length === 0, 'keine JS-Fehler (Dozent) (' + errors.slice(0, 2).join(' | ') + ')');

    // Chatgruppe entsteht auch ueber den Dozenten-Boot in ab_klassen
    await page.goto(BASE + '/ab_klassen.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      try { return (JSON.parse(localStorage.getItem('gema_chat_threads_pool_v1') || '[]')).some(t => t && t.id === 'chtgrp_klasse_kl1'); } catch (e) { return false; }
    }, { timeout: 8000 }).catch(() => {});
    const t = await page.evaluate(() => {
      try { return (JSON.parse(localStorage.getItem('gema_chat_threads_pool_v1') || '[]')).find(t => t && t.id === 'chtgrp_klasse_kl1') || null; } catch (e) { return null; }
    });
    ok(!!t, 'Chatgruppe entsteht auch ueber den Dozenten-Boot');
    ok(t && JSON.stringify((t.teilnehmerIds || []).slice().sort()) === JSON.stringify(['u_stud', 'u_test']), 'Mitglieder: Dozent + Studierender', t && t.teilnehmerIds);
    ok(t && t.kontext && t.kontext.typ === 'klasse' && /ab_klassen\.html\?k=kl1/.test(t.kontext.url), 'Kontext-Chip zeigt auf die Klasse', t && t.kontext);
    await ctx.close();
  }

  // ── Teil C: Fremde in derselben Org sehen den Klassen-Eimer NICHT ──
  console.log('■ C: Zugriffs-Grenze — Planer derselben Org bleibt aussen vor');
  {
    const state = studState();
    // Der Planer (u_test) gehoert NICHT zur Klasse — sonst wuerde die
    // Provisionierung ihn korrekterweise aufnehmen und der Test pruefte nichts.
    state.store.set('schule|sklasse:kl1', Object.assign({}, KLASSE, { dozentIds: ['u_doz'], studentIds: ['u_stud'] }));
    state.store.set('workspace|ws:ws_kl_kl1', {
      id: 'ws_kl_kl1', name: 'Kaltwasser HF 2026', type: 'training', ownerType: 'org', ownerOrgId: 'org_test',
      createdBy: 'u_doz', autoTyp: 'klasse', autoKlasseId: 'kl1', pinned: true,
      accessControl: { orgVisible: false, invitedUsers: [], revokedUsers: [], nurUserIds: ['u_doz', 'u_stud'] },
      org: '', members: [], modules: [{ mod: 'ab_klassen', status: 'offen' }], activity: [], beteiligte: [], notes: [], objektId: null, createdAt: '2026-08-04T10:00:00Z'
    });
    const s = seed(['role_planer']);
    s.gema_coachmarks_done_sys_workspace_v2 = '1';
    const ctx = await newCtx(state, s);
    const page = await ctx.newPage();
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(rowsFn => {
      const b = _wsHooks.buckets();
      const kl = b.find(x => x.id === 'ws_kl_kl1') || null;
      return {
        auto: b.filter(x => x.autoTyp === 'klasse' || x.autoTyp === 'uebung').length,
        imPool: !!kl,
        sichtbar: kl ? _wsHooks.canSee(kl) : null,
        rows: eval('(' + rowsFn + ')')().map(x => x.name)
      };
    }, ORG_ROWS.toString());
    ok(r.imPool === true, 'der geteilte Klassen-Eimer liegt im Pool (Org-Eimer)', r.imPool);
    ok(r.sichtbar === false, 'Planer sieht ihn NICHT — accessControl.nurUserIds greift', r.sichtbar);
    ok(r.rows.indexOf('Kaltwasser HF 2026') < 0, 'Klassen-Eimer taucht in der Org-Sektion des Planers nicht auf', r.rows);
    ok(r.auto === 1, 'Planer provisioniert selbst keine Auto-Eimer', r.auto);
    const chatPosts = state.posts.filter(p => p.mk === 'chat').length;
    ok(chatPosts === 0, 'Planer-Boot erzeugt keinen Gruppen-Thread', chatPosts);
    await ctx.close();
  }

  // ── Teil D: automatischer Rollen-Eimer (Lieferanten-Dashboard) ──
  console.log('■ D: Lieferant — automatischer Rollen-Eimer');
  {
    const state = { store: new Map(), posts: [] };
    const s = seed(['role_lieferant_admin']);
    s.gema_coachmarks_done_sys_workspace_v2 = '1';
    const ctx = await newCtx(state, s);
    const page = await ctx.newPage();
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window._wsHooks && _wsHooks.buckets() || []).some(b => b.id === 'ws_auto_lieferant_org_test'), { timeout: 8000 }).catch(() => {});
    const r = await page.evaluate(rowsFn => {
      const b = (_wsHooks.buckets() || []).find(x => x.id === 'ws_auto_lieferant_org_test') || null;
      return { b, rows: eval('(' + rowsFn + ')')(), sichtbar: b ? _wsHooks.canSee(b) : null,
        scopeFremd: _wsHooks.scopeOk({ accessControl: { nurRollen: ['role_planer'] } }) };
    }, ORG_ROWS.toString());
    ok(!!r.b && r.b.pinned === true && r.b.autoTyp === 'rolle', 'Lieferanten-Eimer wird automatisch angelegt (hervorgehoben)', r.b && { p: r.b.pinned, t: r.b.autoTyp });
    /* Feedback 05.08.2026: das Dashboard ist FIX IM EIMER INTEGRIERT
       (direktModul → eingebettete Übersicht) statt als Modul-Kachel. */
    ok(r.b && r.b.direktModul === 'sys_lieferant_dashboard', 'Lieferanten-Dashboard ist direkt integriert (direktModul)', r.b && r.b.direktModul);
    ok(r.b && !(r.b.modules || []).some(m => m.mod === 'sys_lieferant_dashboard'), 'keine Dashboard-Kachel mehr im Eimer', r.b && r.b.modules);
    ok(r.b && JSON.stringify(r.b.accessControl.nurRollen) === JSON.stringify(['role_lieferant', 'role_produktlieferant']), 'Zugriff ueber Rollen-Praefix (Unterrollen inbegriffen)', r.b && r.b.accessControl);
    ok(r.sichtbar === true, 'role_lieferant_admin sieht ihn ueber den Praefix-Match');
    ok(r.scopeFremd === false, 'ein Eimer fuer role_planer bleibt dem Lieferanten verborgen', r.scopeFremd);
    ok(r.rows[0] && r.rows[0].name === 'Lieferanten-Dashboard', 'Rollen-Eimer steht in der Org-Sektion zuoberst', r.rows[0]);
    await ctx.close();
  }

  // ── Teil E: Org-Admin legt fixe Eimer an ──
  console.log('■ E: Org-Admin — fixe Eimer fuer Firma/Personen/Rollen');
  {
    const state = { store: new Map(), posts: [] };
    const s = seed(['role_planer'], { orgAdmins: ['u_test'] });
    s.gema_users_v1 = [
      { id: 'u_test', username: 'u@test.ch', name: 'Test User', roleIds: ['role_planer'], orgId: 'org_test', active: true, profile: { email: 'u@test.ch' } },
      { id: 'u_mont', username: 'm@test.ch', name: 'Monti Monteur', roleIds: ['role_monteur'], orgId: 'org_test', active: true, profile: { email: 'm@test.ch' } }
    ];
    s.gema_coachmarks_done_sys_workspace_v2 = '1';
    const ctx = await newCtx(state, s);
    const page = await ctx.newPage();
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Einstellungen → Eimer & Vorlagen: Sektion nur fuer Org-Admins
    const sek = await page.evaluate(() => {
      window._wsOpenSettings ? _wsOpenSettings() : document.getElementById('wsSettingsBtn').click();
      window._wsSettingsTab('eimer');
      const t = document.querySelector('.ws-settings-body').textContent;
      return { fix: /Fixe Eimer der Firma/.test(t), btn: !!Array.from(document.querySelectorAll('.ws-btn')).find(b => /Fixer Eimer/.test(b.textContent)) };
    });
    ok(sek.fix && sek.btn, 'Org-Admin sieht «Fixe Eimer der Firma» mit Anlegen-Knopf', sek);

    // Anlegen: ganze Firma
    const f1 = await page.evaluate(rowsFn => {
      window._wsFixEdit('');
      document.getElementById('wsFixName').value = 'Firmen-Handbuch';
      window._wsFixSave('');
      const b = (_wsHooks.buckets() || []).find(x => x.name === 'Firmen-Handbuch') || null;
      return { b, rows: eval('(' + rowsFn + ')')() };
    }, ORG_ROWS.toString());
    ok(f1.b && f1.b.pinned === true && f1.b.ownerType === 'org', 'fixer Eimer entsteht als hervorgehobener Org-Eimer', f1.b && { p: f1.b.pinned, t: f1.b.ownerType });
    ok(f1.b && !f1.b.accessControl.nurUserIds && !f1.b.accessControl.nurRollen, 'ohne Einschraenkung gilt er fuer die ganze Firma', f1.b && f1.b.accessControl);
    ok(f1.rows.some(x => x.name === 'Firmen-Handbuch' && /ws-bucket-row--pinned/.test(x.cls)), 'er erscheint in der Org-Sektion hervorgehoben', f1.rows);

    // Anlegen: nur eine Person
    const f2 = await page.evaluate(() => {
      window._wsFixEdit('');
      document.getElementById('wsFixName').value = 'Nur fuer Monti';
      document.getElementById('wsFixModus').value = 'personen';
      window._wsFixModus('personen');
      const box = document.querySelector('.ws-fix-user input[value="u_mont"]');
      if (box) box.checked = true;
      window._wsFixSave('');
      const b = (_wsHooks.buckets() || []).find(x => x.name === 'Nur fuer Monti') || null;
      return { b, sichtbarFuerMich: b ? _wsHooks.canSee(b) : null,
        fremd: _wsHooks.scopeOk({ id: 'x', accessControl: { nurUserIds: ['u_mont'] } }) };
    });
    ok(f2.b && JSON.stringify(f2.b.accessControl.nurUserIds) === JSON.stringify(['u_mont']), 'Personen-Auswahl landet in accessControl.nurUserIds', f2.b && f2.b.accessControl);
    ok(f2.fremd === false, 'ein Eimer nur fuer eine andere Person ist fuer mich ausserhalb des Scopes', f2.fremd);
    ok(f2.sichtbarFuerMich === true, 'der ERSTELLER sieht seinen Eimer trotzdem (sonst waere er verloren)', f2.sichtbarFuerMich);

    // Anlegen: ganze Rolle
    const f3 = await page.evaluate(() => {
      window._wsFixEdit('');
      document.getElementById('wsFixName').value = 'Alle Monteure';
      document.getElementById('wsFixModus').value = 'rollen';
      window._wsFixModus('rollen');
      const box = document.querySelector('.ws-fix-role input[value="role_monteur"]');
      if (box) box.checked = true;
      window._wsFixSave('');
      const b = (_wsHooks.buckets() || []).find(x => x.name === 'Alle Monteure') || null;
      return { b, ctxUmben: (function () {
        const rows = Array.from(document.querySelectorAll('#wsOrgBuckets .ws-bucket-row'));
        const row = rows.find(el => /Alle Monteure/.test(el.textContent));
        if (!row) return null;
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
        const m = document.querySelector('.ws-ctx');
        return m ? /Umbenennen/.test(m.textContent) && /Löschen/.test(m.textContent) : null;
      })() };
    });
    ok(f3.b && JSON.stringify(f3.b.accessControl.nurRollen) === JSON.stringify(['role_monteur']), 'Rollen-Auswahl landet in accessControl.nurRollen', f3.b && f3.b.accessControl);
    ok(f3.ctxUmben === true, 'ein selbst erstellter fixer Eimer bleibt umbenenn- und loeschbar', f3.ctxUmben);

    // Duplikat eines fixen Eimers ist ein NORMALER Eimer
    const dup = await page.evaluate(() => {
      const src = (_wsHooks.buckets() || []).find(x => x.name === 'Alle Monteure');
      window._wsDuplicateBucket(src.id);
      const k = (_wsHooks.buckets() || []).find(x => /\(Kopie\)/.test(x.name)) || null;
      return k ? { pinned: !!k.pinned, nurRollen: !!(k.accessControl && k.accessControl.nurRollen) } : null;
    });
    ok(dup && dup.pinned === false && dup.nurRollen === false, 'Kopie ist weder hervorgehoben noch eingeschraenkt', dup);
    await ctx.close();
  }

  // ── Teil F: Statik — Server-Sperre + Mitglieder-Sync-Verdrahtung ──
  console.log('■ F: Statische Verdrahtung');
  {
    const cardApi = readFileSync(new URL('../netlify/functions/card-api.js', import.meta.url), 'utf8');
    const guardPos = cardApi.indexOf("indexOf('role_student')");
    const dispatchPos = cardApi.indexOf('await fn(body, user)');
    ok(guardPos >= 0 && dispatchPos > guardPos, 'card-api lehnt role_student VOR dem Aktions-Dispatch ab (403)');
    ok(/403/.test(cardApi.slice(guardPos, guardPos + 220)), 'Sperre antwortet mit 403');

    const abk = readFileSync(new URL('../ab_klassen.html', import.meta.url), 'utf8');
    const studWeg = abk.slice(abk.indexOf('window.klStudWeg='), abk.indexOf('window.klStudWeg=') + 700);
    const beitritt = abk.slice(abk.indexOf('window.klBeitreten='), abk.indexOf('window.klBeitreten=') + 1600);
    ok(/klChatSync\(k\)/.test(studWeg), 'Entfernen aus der Klasse synct die Chatgruppe sofort');
    ok(/klChatSync\(k\)/.test(beitritt), 'Beitritt synct die Chatgruppe sofort');
    ok(/meineKlassen\(\)[\s\S]{0,120}forEach\(klChatSync\)/.test(abk), 'Boot pflegt die Gruppen aller eigenen Klassen');

    const chat = readFileSync(new URL('../gema_chat.js', import.meta.url), 'utf8');
    ok(/ensureGruppe:\s*ensureGruppe/.test(chat), 'GemaChat.ensureGruppe ist exportiert');
    ok(/'chtgrp_'\+String\(opts\.gruppeId\)/.test(chat), 'Gruppen-Thread nutzt die STABILE deterministische ID (nie den userIds-Key)');

    const ws = readFileSync(new URL('../sys_workspace.html', import.meta.url), 'utf8');
    ok(ws.indexOf('wsKlasseSection') < 0, 'die eigene «Klassen»-Sektion ist restlos entfernt');
    ok(ws.indexOf('gleichzeitigkeit') < 0, 'die tote Einstellung «Gleichzeitigkeitsfaktor» ist entfernt');
  }

  console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
} finally {
  await browser.close(); server.close();
}
process.exit(fail ? 1 : 0);
