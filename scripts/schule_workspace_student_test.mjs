// Studenten-Workspace — Auto-Eimer, Landing, Card-Sperre, Klassen-Chat (04.08.2026)
//
// User-Entscheid: Studierende landen im WORKSPACE und arbeiten dort.
//   (1) Zuoberst ein HERVORGEHOBENER Eimer mit dem Namen der Klasse, in dem
//       das Modul «Meine Klasse» (ab_klassen) bereits liegt.
//   (2) Direkt darunter ein Eimer mit der ADRESSE der Schul-Org und den vom
//       Dozenten freigeschalteten Modulen (ADD-ONLY nachgefuehrt) — mit
//       eigenem Auto-Objekt, damit die Berechnungen Projekt-Kontext haben.
//   (3) Weitere/private Eimer bleiben frei erstellbar; die Auto-Eimer sind
//       fest verwaltet (kein Umbenennen/Loeschen).
//   (4) GEMA Card ist fuer Studierende gesperrt — UI unsichtbar UND
//       serverseitig abgelehnt (card-api 403).
//   (5) Pro Klasse entsteht automatisch EINE Chatgruppe (alle Studierenden
//       + Dozenten) mit STABILER Thread-ID — Beitritte/Entfernungen syncen
//       den bestehenden Thread, Nachrichten bleiben erhalten.
//
// Aufruf: CHROME=<chromium> node scripts/schule_workspace_student_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { startServer, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const KLASSE = {
  id: 'kl1', name: 'Kaltwasser HF 2026', lehrgang: 'HF Gebäudetechnik', code: 'K7M2XA',
  orgId: 'org_test', archiviert: false,
  dozentIds: ['u_doz'], studentIds: ['u_test'],
  module: ['lu_tabelle'], erstelltAm: '2026-08-01T08:00:00Z'
};

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
function studSeed() {
  const s = seed(['role_student'], { studentMods: ['lu_tabelle'] });
  s.gema_orgs_v1 = [{ id: 'org_test', name: 'HF Schule Olten', kategorie: 'schule', kategorien: ['schule'], admins: [], active: true, adresse: { strasse: 'Musterstrasse 5', plz: '4600', ort: 'Olten' } }];
  s.gema_users_v1 = [
    { id: 'u_test', username: 'stud@test.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true, profile: { email: 'stud@test.ch' } },
    { id: 'u_doz', username: 'doz@test.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true, profile: { email: 'doz@test.ch' } }
  ];
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  return s;
}
async function newCtx(state, seedObj) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await ctx.route('**/*', makeRoutes(state));
  await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seedObj);
  return ctx;
}

try {
  // ── Teil A: Studentin — Redirect, Auto-Eimer, Landing, Chatgruppe ──
  console.log('■ A: Studentin landet im Workspace mit den Auto-Eimern');
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
      return !!(b.find(x => x.id === 'ws_kl_kl1_u_test') && ue && ue.objektId && objDa);
    }, { timeout: 8000 }).catch(() => {});

    const r = await page.evaluate(() => {
      const b = _wsHooks.buckets();
      const kl = b.find(x => x.id === 'ws_kl_kl1_u_test') || null;
      const ue = b.find(x => x.id === 'ws_ue_kl1_u_test') || null;
      let obj = null;
      try { obj = (JSON.parse(localStorage.getItem('gema_objekte_v1') || '{}').objekte || []).find(o => o.id === 'obj_ws_ws_ue_kl1_u_test') || null; } catch (e) {}
      const sec = document.getElementById('wsKlasseSection');
      const rows = sec ? Array.from(sec.querySelectorAll('.ws-bucket-row')).map(el => ({ cls: el.className, name: (el.querySelector('.ws-bucket-row__name') || {}).textContent || '' })) : [];
      let thread = null;
      try { thread = (JSON.parse(localStorage.getItem('gema_chat_threads_pool_v1') || '[]')).find(t => t && t.id === 'chtgrp_klasse_kl1') || null; } catch (e) {}
      const hook = window._wsModulesHook ? _wsModulesHook() : null;
      const tabName = (document.querySelector('.ws-tab.active .ws-tab-name') || {}).textContent || '';
      return {
        kl, ue, obj, rows, thread, tabName,
        secOffen: sec && sec.style.display !== 'none',
        cats: hook ? hook.cats.map(c => c.id) : [],
        modIds: hook ? hook.modules.map(m => m.id) : [],
        abKlassenErlaubt: hook ? hook.allowed({ id: 'ab_klassen' }) : null,
        cardLesen: (typeof GemaAuth !== 'undefined') ? GemaAuth.can('read', 'visitenkarte') : null,
        wsLesen: (typeof GemaAuth !== 'undefined') ? GemaAuth.can('read', 'workspace') : null,
        tile: !!document.querySelector('#wsModGrid a[href^="ab_klassen.html"]')
      };
    });
    ok(!!r.kl, 'Klassen-Eimer ws_kl_kl1_u_test existiert');
    ok(r.kl && r.kl.autoTyp === 'klasse' && r.kl.name === 'Kaltwasser HF 2026', 'Klassen-Eimer traegt Klassenname + autoTyp', r.kl && { n: r.kl.name, t: r.kl.autoTyp });
    ok(r.kl && r.kl.modules.some(m => m.mod === 'ab_klassen'), 'Modul «Meine Klasse» liegt fix im Klassen-Eimer');
    ok(r.kl && r.kl.ownerType === 'personal' && r.kl.createdBy === 'u_test', 'Klassen-Eimer ist PERSOENLICH (kein geteilter Objekt-Kontext)', r.kl && r.kl.ownerType);
    ok(!!r.ue, 'Übungs-Eimer ws_ue_kl1_u_test existiert');
    ok(r.ue && r.ue.name === 'Musterstrasse 5, 4600 Olten', 'Übungs-Eimer heisst wie die Org-Adresse', r.ue && r.ue.name);
    ok(r.ue && r.ue.modules.some(m => m.mod === 'sb_lu_tabelle'), 'freigeschaltetes Modul lu_tabelle → sb_lu_tabelle im Übungs-Eimer', r.ue && r.ue.modules);
    ok(r.ue && r.ue.objektId === 'obj_ws_ws_ue_kl1_u_test', 'Übungs-Eimer traegt sein Auto-Objekt', r.ue && r.ue.objektId);
    ok(r.obj && r.obj.strasse === 'Musterstrasse 5' && r.obj.plz === '4600' && r.obj.ort === 'Olten', 'Auto-Objekt traegt die Org-Adresse', r.obj);
    ok(r.secOffen && r.rows.length === 2, 'Sektion «Meine Klasse» zeigt genau die zwei Auto-Eimer', r.rows);
    ok(r.rows[0] && /ws-bucket-row--klasse/.test(r.rows[0].cls) && r.rows[0].name === 'Kaltwasser HF 2026', 'Klassen-Eimer steht ZUERST und ist hervorgehoben', r.rows[0]);
    ok(r.rows[1] && /ws-bucket-row--uebung/.test(r.rows[1].cls), 'Übungs-Eimer haengt DIREKT darunter (eingerueckt)', r.rows[1]);
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
      _wsHooks.studentProvision();                                       // naechster Lauf
    });
    await page.waitForTimeout(700);
    const r2 = await page.evaluate(() => {
      const b = _wsHooks.buckets();
      return {
        n: b.filter(x => x.autoTyp).length,
        wieder: b.find(x => x.id === 'ws_ue_kl1_u_test').modules.some(m => m.mod === 'sb_lu_tabelle'),
        abK: b.find(x => x.id === 'ws_kl_kl1_u_test').modules.filter(m => m.mod === 'ab_klassen').length,
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
      const row = document.querySelector('.ws-bucket-row--klasse');
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
      const m = document.querySelector('.ws-ctx');
      const txt = m ? m.textContent : '';
      return { da: !!m, hatModul: /Modul hinzufügen/.test(txt), hatLoeschen: /Löschen/.test(txt), hatUmben: /Umbenennen/.test(txt) };
    });
    ok(ctxMenu.da && ctxMenu.hatModul, 'Kontextmenü am Auto-Eimer bietet «Modul hinzufügen»', ctxMenu);
    ok(!ctxMenu.hatLoeschen && !ctxMenu.hatUmben, 'Kontextmenü am Auto-Eimer OHNE Löschen/Umbenennen', ctxMenu);
    await page.keyboard.press('Escape');
    const delGuard = await page.evaluate(() => {
      window._wsConfirmDelete('ws_kl_kl1_u_test');
      return { modal: document.getElementById('wsModalRoot').innerHTML.length, buckets: _wsHooks.buckets().length };
    });
    ok(delGuard.modal === 0, '_wsConfirmDelete oeffnet fuer Auto-Eimer KEINEN Dialog', delGuard.modal);

    // Eigene Eimer bleiben moeglich (User: «weitere buckets erstellen, auch private»)
    const eigene = await page.evaluate(() => {
      _wsHooks.buckets().push({ id: 'ws_priv1', name: 'Mein Test', type: 'private', ownerType: 'personal', createdBy: 'u_test', members: [], modules: [], activity: [], beteiligte: [], notes: [], objektId: null, createdAt: new Date().toISOString() });
      _wsHooks.save(); _wsHooks.load();
      const per = document.getElementById('wsPersonal').textContent;
      const sec = document.getElementById('wsKlasseSection').querySelectorAll('.ws-bucket-row').length;
      return { inPersoenlich: /Mein Test/.test(per), autoRows: sec };
    });
    ok(eigene.inPersoenlich, 'privater Eimer erscheint unter «Meine Eimer»');
    ok(eigene.autoRows === 2, 'Auto-Sektion bleibt bei den zwei Auto-Eimern', eigene.autoRows);

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

  // ── Teil B: Dozent — Boot auf ab_klassen legt die Chatgruppe an ──
  console.log('■ B: Dozenten-Boot pflegt die Klassen-Chatgruppe');
  {
    const state = studState();
    const s = seed(['role_dozent']);
    s.gema_users_v1 = [
      { id: 'u_test', username: 'doz@test.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true, profile: { email: 'doz@test.ch' } },
      { id: 'u_stud', username: 'stud@test.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true, profile: { email: 'stud@test.ch' } }
    ];
    // Klasse gehoert dem Dozenten u_test, Mitglied ist u_stud
    state.store.set('schule|sklasse:kl1', Object.assign({}, KLASSE, { dozentIds: ['u_test'], studentIds: ['u_stud'] }));
    const ctx = await newCtx(state, s);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
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
    ok(errors.length === 0, 'keine JS-Fehler (Dozent) (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── Teil C: Gegenprobe — Planer bekommt KEINE Auto-Eimer ──
  console.log('■ C: Nicht-Studierende bleiben unberuehrt');
  {
    const state = studState();
    const s = seed(['role_planer']);
    s.gema_coachmarks_done_sys_workspace_v2 = '1';
    const ctx = await newCtx(state, s);
    const page = await ctx.newPage();
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => ({
      auto: _wsHooks.buckets().filter(b => b.autoTyp).length,
      sec: document.getElementById('wsKlasseSection').style.display
    }));
    ok(r.auto === 0, 'Planer: keine Auto-Eimer provisioniert', r.auto);
    ok(r.sec === 'none', 'Sektion «Meine Klasse» bleibt beim Planer verborgen', r.sec);
    const chatPosts = state.posts.filter(p => p.mk === 'chat').length;
    ok(chatPosts === 0, 'Planer-Boot erzeugt keinen Gruppen-Thread', chatPosts);
    await ctx.close();
  }

  // ── Teil D: Statik — Server-Sperre + Mitglieder-Sync-Verdrahtung ──
  console.log('■ D: Statische Verdrahtung');
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
  }

  console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
} finally {
  await browser.close(); server.close();
}
process.exit(fail ? 1 : 0);
