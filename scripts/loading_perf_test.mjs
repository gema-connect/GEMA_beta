#!/usr/bin/env node
// scripts/loading_perf_test.mjs — Drift-Guard fuer den Loading-Kanon (08/2026)
//
// Sichert die Lade-Optimierungen ab, die aus der Performance-Analyse
// («Werkzeugmanagement braucht 3–4 s bis Daten sichtbar sind») entstanden sind:
//
//   1. Delta-Sync in gema_sync.js: nach einem Voll-Pull laedt bindCollection
//      nur noch Rows mit payload->>_lm > (letzter Stand − Skew) plus einen
//      billigen count=exact-Head; Abweichung/Loeschung -> automatischer
//      Voll-Resync. Meta pro Collection in gema_sync_meta_v1.
//   2. IndexedDB-Cache-Schicht (gema_sync_cache_v1): ueberlebt das iOS-
//      localStorage-Quota — der Warm-Cache-Paint funktioniert auch, wenn
//      localStorage geleert wurde. Public: GemaSync.cacheReady.
//   3. Hintergrund-Prefetch (gema_sync_bindreg_v1): zuletzt gebundene
//      Collections werden im Leerlauf nachgeladen; gebundene/frisch
//      geprueften werden uebersprungen. Public: GemaSync.prefetchNow.
//   4. Outbox-Schutz: wartende Outbox-Eintraege unterdruecken den count
//      (sonst Endlos-Resync) und ueberlagern den Delta-Merge.
//   5. Auth-Boot: 3 statt 6 Collection-GETs, wenn die Migration die Rows
//      bereits geliefert hat (records-exist + Durchreichen).
//   6. Modul-Boot-Kanon: if_werkzeug malt den Warm-Cache SOFORT (vor dem
//      Cloud-Pull) und der Aktivitaetslog laedt org-gescopt statt global.
//   7. Service-Worker: stale-while-revalidate (v504+) statt network-first.
//
// Ausfuehren: CHROME=<chromium> node scripts/loading_perf_test.mjs
// (In-Memory-PostgREST-Mock via page.route — kein echtes Supabase noetig.)

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}
function lies(f) { return readFileSync(ROOT + '/' + f, 'utf8'); }

function resolveChrome() {
  const cands = [process.env.CHROME, '/opt/pw-browsers/chromium'];
  try {
    for (const d of readdirSync('/opt/pw-browsers')) {
      cands.push('/opt/pw-browsers/' + d + '/chrome-linux/chrome');
    }
  } catch (e) {}
  for (const c of cands) { if (c && existsSync(c)) return c; }
  return process.env.CHROME || 'chromium';
}

/* ───────────────────────── Teil 1: statische Checks ───────────────────────── */

console.log('\n— Teil 1: statische Marker (Loading-Kanon) —');
{
  const sw = lies('sw.js');
  const mV = sw.match(/gema-v(\d+)/);
  ok(mV && parseInt(mV[1], 10) >= 504, 'sw.js: Cache-Version numerisch >= 504 (' + (mV ? mV[1] : '—') + ')');
  ok(sw.indexOf('ignoreSearch') >= 0, 'sw.js: HTML-Cache-Match mit ignoreSearch');
  ok(sw.indexOf('waitUntil(netP') >= 0 && sw.indexOf('return cached || netP') >= 0,
    'sw.js: stale-while-revalidate (cached sofort, Netz im Hintergrund)');

  const sy = lies('gema_sync.js');
  ok(sy.indexOf('gema_sync_meta_v1') >= 0, 'gema_sync.js: Delta-Meta-Store gema_sync_meta_v1');
  ok(sy.indexOf("payload->>_lm=gt.") >= 0, 'gema_sync.js: serverseitiger Delta-Filter payload->>_lm=gt.');
  ok(sy.indexOf('gema_sync_cache_v1') >= 0, 'gema_sync.js: IndexedDB-Cache gema_sync_cache_v1');
  ok(sy.indexOf('gema_sync_bindreg_v1') >= 0, 'gema_sync.js: Prefetch-Registry gema_sync_bindreg_v1');
  ok(sy.indexOf('cacheReady') >= 0 && sy.indexOf('prefetchNow') >= 0 && sy.indexOf('syncMeta') >= 0,
    'gema_sync.js: Public API cacheReady/syncMeta/prefetchNow');
  ok(sy.indexOf('_outboxHasFor') >= 0, 'gema_sync.js: Outbox unterdrueckt den count (kein Endlos-Resync)');

  const au = lies('gema_auth.js');
  ok(au.indexOf('records-exist') >= 0, 'gema_auth.js: Migration meldet vorhandene Records (records-exist)');
  ok(/_loadCollectionFromCloud\(STORAGE_\w+,\s*migs\[\d+\]\s*&&\s*migs\[\d+\]\.rows\)/.test(au),
    'gema_auth.js: Boot reicht die Migrations-Rows durch (3 statt 6 GETs)');

  const al = lies('gema_aktivitaetslog.js');
  ok(al.indexOf('payload->data->>orgId=eq.') >= 0, 'gema_aktivitaetslog.js: org-gescopter Cloud-Pull');
  ok(al.indexOf('have[e.id]') >= 0, 'gema_aktivitaetslog.js: Union-Merge mit lokalen Eintraegen');
  // KEIN maxRows als OPTION im Code (der Kommentar, der das Verbot begruendet, darf das Wort tragen)
  ok(!/maxRows\s*:/.test(al), 'gema_aktivitaetslog.js: kein maxRows (data_key.asc wuerde die NEUSTEN kappen)');

  const wz = lies('if_werkzeug.html');
  ok(wz.indexOf('cacheReady') >= 0, 'if_werkzeug: Re-Render-Hook auf GemaSync.cacheReady');
  ok(!/GemaAuth\.restoreFromCloud\s*\(/.test(wz), 'if_werkzeug: kein redundanter restoreFromCloud()-AUFRUF mehr');

  const fz = lies('if_fahrzeug.html');
  ok(fz.indexOf('cacheReady') >= 0, 'if_fahrzeug: Re-Render-Hook auf GemaSync.cacheReady');
  ok(!/GemaAuth\.restoreFromCloud\s*\(/.test(fz), 'if_fahrzeug: kein redundanter restoreFromCloud()-AUFRUF mehr');

  ok(lies('sd_schadensbericht.html').indexOf('_sdBootFertig') >= 0,
    'sd_schadensbericht: Boot-Race mit Rejection-Pfad (_sdBootFertig)');
  ok(lies('pm_objekte.html').indexOf('_objNachzug') >= 0,
    'pm_objekte: begrenzter Boot + Nachzug-Render (_objNachzug)');
  ok(lies('gema_chat.js').indexOf('clearInterval(ST.metaTimer)') >= 0,
    'gema_chat: Meta-Poll wird beim Schliessen gestoppt');
  ok(lies('index.html').indexOf('_favCloudPull') >= 0,
    'index.html: Favoriten-Pull ohne Doppel-GET (_favCloudPull)');
}

/* ─────────────────── In-Memory-PostgREST-Mock (gema_data) ─────────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range'
};

// Cloud-Map: '<module_key>|<data_key>' -> {data,_lm}. Der Gate haelt Antworten
// zurueck (HOLD, nie abort — ein Abort wuerde _noteFailure/Offline ausloesen).
function mkMock() {
  const cloud = new Map();
  const log = [];
  const gate = { p: null, open: null };
  function holdGate() { gate.p = new Promise(r => { gate.open = r; }); }
  function releaseGate() { const f = gate.open; gate.p = null; gate.open = null; if (f) f(); }
  function teile(key) { const i = key.indexOf('|'); return [key.slice(0, i), key.slice(i + 1)]; }

  async function handler(route) {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (gate.p) await gate.p;

    let sp;
    try { sp = new URL(req.url()).searchParams; } catch (e) { sp = new URLSearchParams(); }
    const mk = String(sp.get('module_key') || '').replace(/^eq\./, '');
    const dkRaw = sp.get('data_key') || '';
    let prefix = null, exact = null, inList = null;
    if (dkRaw.indexOf('like.') === 0) prefix = dkRaw.slice(5).replace(/\*$/, '');
    else if (dkRaw.indexOf('eq.') === 0) exact = dkRaw.slice(3);
    else if (dkRaw.indexOf('in.(') === 0) inList = dkRaw.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
    let lmGt = null, orgEq = null;
    for (const [k, v] of sp.entries()) {
      if (k === 'payload->>_lm' && v.indexOf('gt.') === 0) lmGt = v.slice(3);
      if (k === 'payload->data->>orgId' && v.indexOf('eq.') === 0) orgEq = v.slice(3);
    }

    if (method === 'POST') {
      let arr = [];
      try { arr = req.postDataJSON() || []; } catch (e) {}
      if (!Array.isArray(arr)) arr = [arr];
      arr.forEach(it => {
        if (it && it.module_key && it.data_key) {
          cloud.set(it.module_key + '|' + it.data_key,
            { data: (it.payload || {}).data, _lm: (it.payload || {})._lm || null });
        }
      });
      log.push({ kind: 'post', mk: (arr[0] || {}).module_key || mk, n: arr.length });
      return route.fulfill({ status: 201, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }, body: '[]' });
    }
    if (method === 'DELETE') {
      const dks = exact != null ? [exact] : (inList || []);
      dks.forEach(dk => cloud.delete(mk + '|' + dk));
      log.push({ kind: 'delete', mk, n: dks.length });
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (method !== 'GET') return route.fulfill({ status: 204, headers: CORS });

    // Treffer sammeln (count zaehlt OHNE lmGt — die count-URL traegt keinen Filter)
    const rows = [];
    for (const [key, val] of cloud) {
      const [m, dk] = teile(key);
      if (m !== mk) continue;
      if (prefix != null && dk.indexOf(prefix) !== 0) continue;
      if (exact != null && dk !== exact) continue;
      if (inList && inList.indexOf(dk) < 0) continue;
      if (lmGt != null && !(String(val._lm || '') > lmGt)) continue;
      if (orgEq != null && String(((val.data || {}).orgId) || '') !== orgEq) continue;
      rows.push({ data_key: dk, payload: { data: val.data, _lm: val._lm } });
    }
    rows.sort((a, b) => a.data_key < b.data_key ? -1 : a.data_key > b.data_key ? 1 : 0);

    const isCount = sp.get('select') === 'data_key' && sp.get('limit') === '1';
    if (isCount) {
      log.push({ kind: 'count', mk, prefix, exact, lmGt, orgEq, returned: rows.length });
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Range': '*/' + rows.length, ...CORS },
        body: '[]'
      });
    }
    const limit = parseInt(sp.get('limit') || '1000', 10) || 1000;
    const offset = parseInt(sp.get('offset') || '0', 10) || 0;
    const page = rows.slice(offset, offset + limit);
    log.push({
      kind: exact != null ? 'record' : (lmGt != null ? 'delta' : 'full'),
      mk, prefix, exact, lmGt, orgEq, offset, returned: page.length
    });
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
      body: JSON.stringify(page)
    });
  }
  return { cloud, log, handler, holdGate, releaseGate };
}

// Nur die synchronisierenden GETs einer Collection (full/delta/count)
function gets(log, mk, prefix) {
  return log.filter(e => e.mk === mk && e.prefix === prefix &&
    (e.kind === 'full' || e.kind === 'delta' || e.kind === 'count'));
}
function art(log, mk, prefix, kind) { return gets(log, mk, prefix).filter(e => e.kind === kind); }

/* ─────────────────────────── Seeds & Helfer ─────────────────────────── */

// Gespreizte Zeitstempel: T0 = jetzt − 6 h, alle 10 s einer — damit ein Delta
// mit 10-min-Skew nur den SCHWANZ zurueckliefert, nie wieder alles.
const T0 = Date.now() - 6 * 3600 * 1000;
const lmOf = i => new Date(T0 + i * 10000).toISOString();
function toolRec(i) {
  return { id: 'wz_' + i, name: 'Werkzeug ' + i, cat: 'elektro', brand: 'Bosch', model: 'M' + i, bought: '2024-01-01', orgId: 'org_test' };
}
function seedTools(cloud, n) {
  for (let i = 0; i < n; i++) cloud.set('werkzeugmanagement|tool:wz_' + i, { data: toolRec(i), _lm: lmOf(i) });
}

async function bindWerkzeug(page) {
  return page.evaluate(async () => {
    await GemaSync.bindCollection('werkzeugmanagement', 'gema_werkzeug', 'tool:', 'id');
    return {
      n: (GemaSync.getCached('gema_werkzeug') || []).length,
      meta: GemaSync.syncMeta('gema_werkzeug')
    };
  });
}

/* ─────────────────────────── Teil 2: Browser ─────────────────────────── */

const server = await startServer();
const browser = await chromium.launch({
  executablePath: resolveChrome(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {

  /* — A–D + M: Delta-Lebenszyklus auf EINER Seite (Reloads, Cloud-Mutationen) — */
  console.log('\n— Teil 2A: Erstbesuch = Voll-Pull + Meta —');
  {
    const m = mkMock();
    seedTools(m.cloud, 450);
    const { ctx, page } = await newPage(browser, seed(['role_planer']));
    await page.route('**/rest/v1/gema_data*', m.handler);
    await page.goto(BASE + '/__rmtest.html', { waitUntil: 'load' });

    const a = await bindWerkzeug(page);
    ok(a.n === 450, 'A: 450 Werkzeuge im Cache nach dem Erstbesuch');
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'full').length === 1 &&
       art(m.log, 'werkzeugmanagement', 'tool:', 'delta').length === 0,
      'A: genau EIN Voll-Pull, kein Delta (kein Meta vorhanden)');
    ok(!!(a.meta && a.meta.lm === lmOf(449) && a.meta.n === 450 && a.meta.full),
      'A: Meta gesetzt (lm = neuster Stempel, n = 450, full-Zeitpunkt)');

    console.log('\n— Teil 2B: Zweitbesuch = Delta + Count statt Voll-Pull —');
    m.log.length = 0;
    await page.reload({ waitUntil: 'load' });
    const b = await bindWerkzeug(page);
    ok(b.n === 450, 'B: Cache bleibt bei 450');
    const bDelta = art(m.log, 'werkzeugmanagement', 'tool:', 'delta');
    ok(bDelta.length >= 1, 'B: Delta-GET mit payload->>_lm=gt. abgesetzt');
    ok(bDelta.every(e => e.lmGt && e.lmGt < lmOf(449)), 'B: Delta-Grenze traegt den Skew (lmGt < meta.lm)');
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'count').length >= 1, 'B: billiger count=exact-Head statt 450 Rows');
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'full').length === 0, 'B: KEIN Voll-Pull mehr noetig');

    console.log('\n— Teil 2C: Aenderungen + Neue kommen per Delta an —');
    const jetzt = new Date().toISOString();
    for (const i of [10, 20, 30]) {
      m.cloud.set('werkzeugmanagement|tool:wz_' + i,
        { data: { ...toolRec(i), name: 'Geaendert ' + i }, _lm: jetzt });
    }
    m.cloud.set('werkzeugmanagement|tool:wz_9000', { data: { ...toolRec(9000), name: 'Neu 9000' }, _lm: jetzt });
    m.cloud.set('werkzeugmanagement|tool:wz_9001', { data: { ...toolRec(9001), name: 'Neu 9001' }, _lm: jetzt });
    m.log.length = 0;
    await page.reload({ waitUntil: 'load' });
    const c = await page.evaluate(async () => {
      await GemaSync.bindCollection('werkzeugmanagement', 'gema_werkzeug', 'tool:', 'id');
      const arr = GemaSync.getCached('gema_werkzeug') || [];
      const g = arr.find(t => t.id === 'wz_10');
      return { n: arr.length, name10: g && g.name, hatNeu: arr.some(t => t.id === 'wz_9000') };
    });
    ok(c.n === 452, 'C: 3 Aenderungen + 2 Neue -> 452 im Cache');
    ok(c.name10 === 'Geaendert 10' && c.hatNeu, 'C: geaenderte Felder + neue Records angekommen');
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'delta').length >= 1 &&
       art(m.log, 'werkzeugmanagement', 'tool:', 'full').length === 0,
      'C: alles per Delta, kein Voll-Pull');

    console.log('\n— Teil 2D: Loeschungen -> count-Abweichung -> Auto-Voll-Resync —');
    for (const i of [100, 101, 102, 103, 104]) m.cloud.delete('werkzeugmanagement|tool:wz_' + i);
    m.log.length = 0;
    await page.reload({ waitUntil: 'load' });
    const d = await bindWerkzeug(page);
    ok(d.n === 447, 'D: Cache nach Resync = 447 (5 geloescht)');
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'full').length >= 1,
      'D: count-Abweichung hat den Voll-Resync ausgeloest');
    ok(!!(d.meta && d.meta.n === 447), 'D: Meta nach Resync auf 447');

    console.log('\n— Teil 2M: parallele loadCollection werden dedupliziert —');
    m.log.length = 0;
    const mm = await page.evaluate(async () => {
      const [r1, r2] = await Promise.all([
        GemaSync.loadCollection('werkzeugmanagement', 'tool:'),
        GemaSync.loadCollection('werkzeugmanagement', 'tool:')
      ]);
      return { n1: r1.length, n2: r2.length };
    });
    ok(mm.n1 === 447 && mm.n2 === 447, 'M: beide Aufrufer bekommen alle 447 Rows');
    ok(m.log.filter(e => e.mk === 'werkzeugmanagement').length === 1,
      'M: In-Flight-Dedupe — nur EIN GET fuer zwei parallele Aufrufer');

    await ctx.close();
  }

  /* — F: Outbox unterdrueckt den count und ueberlagert den Delta-Merge — */
  console.log('\n— Teil 2F: Outbox-Schutz (kein count, Overlay bleibt) —');
  {
    const m = mkMock();
    seedTools(m.cloud, 450);
    const tools = []; for (let i = 0; i < 450; i++) tools.push(toolRec(i));
    const st = seed(['role_planer']);
    st['gema_werkzeug'] = tools;
    st['gema_sync_meta_v1'] = { gema_werkzeug: { lm: lmOf(449), n: 450, ghost: 0, full: Date.now(), chk: 0 } };
    st['gema_sync_outbox_v1'] = { ops: { 'werkzeugmanagement|tool:wz_local': {
      m: 'werkzeugmanagement', key: 'tool:wz_local', type: 'up',
      data: { id: 'wz_local', name: 'Lokal erfasst', orgId: 'org_test' }, lm: new Date().toISOString()
    } } };
    const { ctx, page } = await newPage(browser, st);
    await page.route('**/rest/v1/gema_data*', m.handler);
    await page.goto(BASE + '/__rmtest.html', { waitUntil: 'domcontentloaded' });
    // SOFORT binden — vor dem 2.5-s-Outbox-Flush des Boots
    const f = await page.evaluate(async () => {
      await GemaSync.bindCollection('werkzeugmanagement', 'gema_werkzeug', 'tool:', 'id');
      const arr = GemaSync.getCached('gema_werkzeug') || [];
      return { n: arr.length, hatLokal: arr.some(t => t.id === 'wz_local') };
    });
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'delta').length >= 1, 'F: Delta laeuft trotz wartender Outbox');
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'count').length === 0,
      'F: KEIN count solange Outbox-Eintraege warten (kein Endlos-Resync)');
    ok(f.hatLokal && f.n === 451, 'F: Outbox-Overlay — lokal erfasster Datensatz bleibt sichtbar');
    await ctx.close();
  }

  /* — E: token-lose Session -> nie Delta (RLS-Leere waere kein Delta-Beweis) — */
  console.log('\n— Teil 2E: token-lose Session faellt auf Voll-Pull zurueck —');
  {
    const m = mkMock();
    seedTools(m.cloud, 450);
    const tools = []; for (let i = 0; i < 450; i++) tools.push(toolRec(i));
    const st = seed(['role_planer'], { tokenlos: true });
    st['gema_werkzeug'] = tools;
    st['gema_sync_meta_v1'] = { gema_werkzeug: { lm: lmOf(449), n: 450, ghost: 0, full: Date.now(), chk: 0 } };
    const { ctx, page } = await newPage(browser, st);
    // gema-auth-Function -> 404 = Legacy-Modus (sonst wuerde der Boot-Check ausloggen)
    await page.route('**/gema-auth*', r => r.fulfill({ status: 404, body: 'nf' }));
    await page.route('**/rest/v1/gema_data*', m.handler);
    await page.goto(BASE + '/__rmtest.html', { waitUntil: 'load' });
    const e = await bindWerkzeug(page);
    ok(e.n === 450, 'E: Daten kommen an (450)');
    ok(art(m.log, 'werkzeugmanagement', 'tool:', 'full').length >= 1 &&
       art(m.log, 'werkzeugmanagement', 'tool:', 'delta').length === 0 &&
       art(m.log, 'werkzeugmanagement', 'tool:', 'count').length === 0,
      'E: ohne Token NIE Delta/Count — immer der ehrliche Voll-Pull');
    await ctx.close();
  }

  /* — G: IndexedDB-Schicht ueberlebt den localStorage-Verlust (Quota-Fall) — */
  console.log('\n— Teil 2G: IndexedDB-Cache liefert den Warm-Paint ohne localStorage —');
  {
    const m = mkMock();
    seedTools(m.cloud, 450);
    const { ctx, page } = await newPage(browser, seed(['role_planer']));
    await page.route('**/rest/v1/gema_data*', m.handler);
    await page.goto(BASE + '/__rmtest.html', { waitUntil: 'load' });
    await bindWerkzeug(page);
    await page.waitForTimeout(700);                       // IDB-Put (fire-and-forget) landen lassen
    await page.evaluate(() => localStorage.removeItem('gema_werkzeug'));  // iOS-Quota simuliert
    m.holdGate();                                          // Cloud haelt — was jetzt kommt, kommt aus IDB
    await page.reload({ waitUntil: 'domcontentloaded' });
    const g = await page.evaluate(() =>
      GemaSync.cacheReady.then(() => (GemaSync.getCached('gema_werkzeug') || []).length));
    ok(g === 450, 'G: 450 Werkzeuge aus IndexedDB, waehrend die Cloud noch haengt');
    m.releaseGate();
    await ctx.close();
  }

  /* — L: Hintergrund-Prefetch (Registry, Bound-Skip, Drossel) — */
  console.log('\n— Teil 2L: Prefetch laedt Ungebundenes, ueberspringt Gebundenes, drosselt —');
  {
    const m = mkMock();
    seedTools(m.cloud, 450);
    for (let i = 1; i <= 3; i++) {
      m.cloud.set('fahrzeugmanagement|vehicle:fz_' + i,
        { data: { id: 'fz_' + i, model: 'Fahrzeug ' + i, orgId: 'org_test' }, _lm: lmOf(i) });
    }
    const tools = []; for (let i = 0; i < 450; i++) tools.push(toolRec(i));
    const st = seed(['role_planer']);
    st['gema_werkzeug'] = tools;
    st['gema_sync_meta_v1'] = { gema_werkzeug: { lm: lmOf(449), n: 450, ghost: 0, full: Date.now(), chk: 0 } };
    st['gema_sync_bindreg_v1'] = {
      gema_werkzeug: { m: 'werkzeugmanagement', p: 'tool:', id: 'id', ts: Date.now() },
      gema_vehicles: { m: 'fahrzeugmanagement', p: 'vehicle:', id: 'id', ts: Date.now() - 1000 }
    };
    const { ctx, page } = await newPage(browser, st);
    await page.route('**/rest/v1/gema_data*', m.handler);
    await page.goto(BASE + '/__rmtest.html', { waitUntil: 'load' });
    await bindWerkzeug(page);                              // werkzeug = bound-this-page
    const wzVorher = gets(m.log, 'werkzeugmanagement', 'tool:').length;
    const p1 = await page.evaluate(() => GemaSync.prefetchNow());
    await page.waitForTimeout(600);
    ok(art(m.log, 'fahrzeugmanagement', 'vehicle:', 'full').length >= 1,
      'L: Prefetch holt die ungebundene Registry-Collection (Fahrzeuge)');
    ok((await page.evaluate(() => (GemaSync.getCached('gema_vehicles') || []).length)) === 3,
      'L: Prefetch schreibt den Cache — naechster Modul-Besuch rendert warm');
    ok(gets(m.log, 'werkzeugmanagement', 'tool:').length === wzVorher,
      'L: die in DIESER Seite gebundene Collection wird uebersprungen');
    ok(typeof p1 === 'number', 'L: prefetchNow liefert die Anzahl geholter Collections (' + p1 + ')');
    const logN = m.log.length;
    await page.evaluate(() => GemaSync.prefetchNow());
    await page.waitForTimeout(300);
    ok(m.log.length === logN, 'L: zweiter Lauf sofort gedrosselt (meta.chk 5-min-Sperre) — 0 neue Requests');
    await ctx.close();
  }

  /* — I: Auth-Boot mit Cloud-Rows = 3 Collection-GETs, keine Doppel-Pulls — */
  console.log('\n— Teil 2I: Auth-Boot laedt orgs/users/roles je EINMAL —');
  {
    const m = mkMock();
    const nowIso = new Date().toISOString();
    m.cloud.set('auth|org:org_test', { data: {
      id: 'org_test', name: 'Testfirma AG', kategorie: 'sanitaerplaner',
      kategorien: ['sanitaerplaner'], admins: ['u_test'], active: true
    }, _lm: nowIso });
    m.cloud.set('auth|user:u_test', { data: {
      id: 'u_test', username: 'u@test.ch', name: 'Test User', roleIds: ['role_planer'],
      orgId: 'org_test', active: true, profile: { email: 'u@test.ch' }
    }, _lm: nowIso });
    m.cloud.set('auth|role:r_test', { data: {
      id: 'r_test', name: 'Testrolle', color: '#888888', permissions: {}
    }, _lm: nowIso });
    const { ctx, page } = await newPage(browser, seed(['role_planer']));
    await page.route('**/rest/v1/gema_data*', m.handler);
    await page.goto(BASE + '/__rmtest.html', { waitUntil: 'load' });
    await page.waitForTimeout(2200);                       // 1. Boot + evtl. EIN gefuehrter Auto-Reload
    m.log.length = 0;
    await page.goto(BASE + '/__rmtest.html', { waitUntil: 'load' });
    await page.waitForTimeout(1400);
    const authGets = m.log.filter(e => e.mk === 'auth' && e.kind !== 'post' && e.kind !== 'delete');
    const prefixe = authGets.map(e => e.prefix).sort();
    ok(authGets.length === 3, 'I: genau 3 Auth-GETs pro Boot (statt 6) — gezaehlt: ' + authGets.length);
    ok(prefixe.join(',') === 'org:,role:,user:', 'I: je einmal org:/role:/user: (' + prefixe.join(',') + ')');
    ok(authGets.every(e => e.kind === 'full'), 'I: keine Legacy-Blob-Einzelreads (eq.) mehr noetig');
    const roles = await page.evaluate(() => (GemaAuth.getRoles() || []).some(r => r.id === 'r_test'));
    ok(roles, 'I: Cloud-Rolle r_test ist im Cache angekommen');
    await ctx.close();
  }

  /* — H: if_werkzeug — Warm-Cache-Paint VOR dem Cloud-Pull + org-gescopter ActLog — */
  console.log('\n— Teil 2H: if_werkzeug malt sofort aus dem Cache, ActLog laedt org-gescopt —');
  {
    const m = mkMock();
    const namen = ['Bohrhammer GBH', 'Akkuschrauber PSR', 'Winkelschleifer WS'];
    const tools = namen.map((n, i) => ({
      id: 'wz_' + (i + 1), name: n, cat: 'elektro', brand: 'Bosch', model: 'M' + i,
      bought: '2024-01-01', warranty: '2026-12-01', serial: 'SN' + i, notes: '', orgId: 'org_test'
    }));
    tools.forEach((t, i) => m.cloud.set('werkzeugmanagement|tool:' + t.id, { data: t, _lm: lmOf(i) }));
    const logRow = (id, orgId) => ({
      id, ts: new Date().toISOString(), orgId, modul: 'werkzeug',
      modulRecordId: 'wz_1', modulRecordName: 'Bohrhammer GBH',
      aktion: 'erfasst', beschreibung: 'Testeintrag', userId: 'u_test', userName: 'Test User'
    });
    m.cloud.set('aktivitaetslog|log:log_1', { data: logRow('log_1', 'org_test'), _lm: lmOf(1) });
    m.cloud.set('aktivitaetslog|log:log_2', { data: logRow('log_2', 'org_test'), _lm: lmOf(2) });
    m.cloud.set('aktivitaetslog|log:log_3', { data: logRow('log_3', 'org_other'), _lm: lmOf(3) });

    const st = seed(['role_magaziner']);
    st['gema_werkzeug'] = tools;
    const { ctx, page } = await newPage(browser, st);
    await page.route('**/sw.js', r => r.fulfill({ status: 404, body: 'nf' }));  // SW wuerde den Mock umgehen
    await page.route('**/rest/v1/gema_data*', m.handler);
    m.holdGate();                                          // Cloud haelt — der Paint MUSS aus dem Cache kommen
    await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    let warm = false;
    try {
      await page.waitForFunction(() => {
        const g = document.getElementById('cardGrid');
        return !!(g && g.innerHTML && g.innerHTML.indexOf('Bohrhammer') >= 0);
      }, null, { timeout: 4000 });
      warm = true;
    } catch (e) {}
    ok(warm, 'H: Werkzeug-Karte «Bohrhammer» steht, WAEHREND die Cloud noch haengt (Warm-Cache-Paint)');
    m.releaseGate();
    await page.waitForTimeout(1800);
    ok(await page.evaluate(() => {
      const g = document.getElementById('cardGrid');
      return !!(g && g.innerHTML.indexOf('Bohrhammer') >= 0);
    }), 'H: Karte bleibt nach dem Cloud-Abgleich stehen');
    ok(gets(m.log, 'werkzeugmanagement', 'tool:').length >= 1, 'H: Werkzeug-Pull lief nach dem Paint');
    const alGets = m.log.filter(e => e.mk === 'aktivitaetslog' && e.prefix === 'log:');
    ok(alGets.length >= 1 && alGets.every(e => e.orgEq === 'org_test'),
      'H: Aktivitaetslog laedt serverseitig org-gefiltert (orgId=eq.org_test)');
    const al = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('gema_aktivitaetslog_v1') || '[]').map(e => e.id).sort(); }
      catch (e) { return []; }
    });
    ok(al.length === 2 && al.join(',') === 'log_1,log_2',
      'H: nur die eigenen Org-Eintraege im Cache (log_3 der Fremd-Org fehlt) — ' + al.join(','));
    await ctx.close();
  }

} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' loading_perf_test: ' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail === 0 ? 0 : 1);
