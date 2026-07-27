// Skalierungs-Härtung (100-Nutzer-Review): Drift-Guard für
//  A) gema_sync.loadCollection — Pagination gegen den PostgREST-1000-Row-Cap
//     (order=data_key.asc + limit/offset-Schleife, opts.filter/maxRows)
//  B) gema_notify — serverseitiger Empfänger-Vorfilter (or=…) statt
//     Voll-Collection-Pull + tägliche Cloud-Retention (60d, Tages-Lock)
//  C) gema_editlock — Gleichzeitig-Bearbeiten-Banner (Heartbeat-Locks,
//     2 Kontexte = 2 Personen, TTL, Dismiss, stop/pagehide-Release,
//     Stale-Housekeeping) + Lazy-Integration über gema_autosave
//  D) statische Verdrahtung (pm_erp, sw.js)
//
// Aufruf:  CHROME=<chromium> node scripts/skalierung_sync_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8894;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// ── 0) Statische Verdrahtung ─────────────────────────────────────
console.log('— 0) Statische Verdrahtung —');
{
  const sync = readFileSync(join(ROOT, 'gema_sync.js'), 'utf8');
  ok(sync.includes('order=data_key.asc'), 'gema_sync: deterministische Ordnung (order=data_key.asc)');
  ok(/LOAD_PAGE\s*=\s*1000/.test(sync), 'gema_sync: LOAD_PAGE = 1000');
  ok(sync.includes('LOAD_MAX_PAGES'), 'gema_sync: Seiten-Deckel vorhanden');
  ok(sync.includes('opts.filter'), 'gema_sync: opts.filter unterstützt');
  ok(sync.includes('opts.maxRows'), 'gema_sync: opts.maxRows unterstützt');

  const notify = readFileSync(join(ROOT, 'gema_notify.js'), 'utf8');
  ok(notify.includes('_recipientFilter'), 'gema_notify: Empfänger-Vorfilter vorhanden');
  ok(notify.includes("'or=('"), 'gema_notify: or=()-Filter-Syntax');
  ok(/CLOUD_RETENTION_DAYS\s*=\s*60/.test(notify), 'gema_notify: Cloud-Retention 60 Tage');
  ok(notify.includes('gema_notify_ret_v1'), 'gema_notify: Retention-Tages-Lock');
  ok(notify.includes('deleteRecords'), 'gema_notify: Retention löscht via deleteRecords');
  ok(notify.includes('if(!u) return;   // ohne Login'), 'gema_notify: Pull ohne Login übersprungen');

  const el = readFileSync(join(ROOT, 'gema_editlock.js'), 'utf8');
  ok(el.includes('GemaEditLock'), 'gema_editlock: vorhanden');
  ok(el.includes('noQueue: true') || el.includes('noQueue:true'), 'gema_editlock: Locks nie in die Outbox (noQueue)');
  ok(el.includes('keepalive: true') || el.includes('keepalive:true'), 'gema_editlock: pagehide-Release mit keepalive');
  ok(el.includes('TTL_MS'), 'gema_editlock: TTL-Ablauf');

  const asave = readFileSync(join(ROOT, 'gema_autosave.js'), 'utf8');
  ok(asave.includes('_lockSetup') && asave.includes('_lockWatch'), 'gema_autosave: Editlock-Integration');
  ok(asave.includes("'gema_editlock.js'"), 'gema_autosave: lazy-Load des Editlock-Scripts');

  const erp = readFileSync(join(ROOT, 'pm_erp.html'), 'utf8');
  ok(erp.includes('gema_editlock.js'), 'pm_erp: Script eingebunden');
  ok(erp.includes("GemaEditLock.watch({key:'erpdok:'+d.id"), 'pm_erp: watch pro Dokument in erpOpenEditor');
  ok(erp.includes('GemaEditLock.stop()'), 'pm_erp: stop in erpCloseEditor');

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  // Version NICHT festnageln — sie wird bei jeder Änderung hochgezogen; hier
  // zählt nur, dass überhaupt eine Cache-Version gesetzt ist.
  ok(/gema-v\d+/.test(sw), 'sw.js: Cache-Version gesetzt (' + ((sw.match(/gema-v\d+/) || [])[0] || '?') + ')');
  ok(sw.includes('/gema_editlock.js'), 'sw.js: gema_editlock.js im Cache');
}

// ── Server + PostgREST-Mock ──────────────────────────────────────
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// Gemeinsamer Store (Map «mk|dk» → payload) über alle Kontexte + Request-Log.
const store = new Map();
const reqLog = [];   // {method, url, mk}
const DB_MAX_ROWS = 1000;   // simuliert Supabase db-max-rows

// Notify-Sonderfälle: Retention-Query (ts=lt.) und Empfänger-Pull (or=()
function handleSb(route) {
  const req = route.request();
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mk = (url.match(/module_key=eq\.([^&]+)/) || [])[1] || '';
  reqLog.push({ method, url, mk });

  if (method === 'GET') {
    // Retention-Scan der Notify-Schicht → zwei uralte Rows liefern
    if (mk === 'notify' && url.includes('ts=lt.')) {
      const old = new Date(Date.now() - 90 * 86400000).toISOString();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { data_key: 'notif:old1', payload: { data: { id: 'old1', ts: old, titel: 'alt1' }, _lm: old } },
        { data_key: 'notif:old2', payload: { data: { id: 'old2', ts: old, titel: 'alt2' }, _lm: old } }
      ]) });
    }
    // Empfänger-Pull → eine passende Notifikation
    if (mk === 'notify' && url.includes('or=(')) {
      const now = new Date().toISOString();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { data_key: 'notif:n_match', payload: { data: { id: 'n_match', ts: now, eventKey: '', empfaengerUserId: 'u_a', modul: 'test', typ: 'info', titel: 'Cloud-Hallo', text: '', link: '', gelesen: false, gelesenAt: null }, _lm: now } }
      ]) });
    }
    // Generischer Store: like-Prefix + eq + order/limit/offset (Cap 1000)
    const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
    const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
    let rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|'); const m = k.slice(0, i), d = k.slice(i + 1);
      if (m !== mk) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike) { const pre = dkLike.replace(/\*$/, ''); if (!d.startsWith(pre)) continue; }
      rows.push({ data_key: d, payload: v });
    }
    rows.sort((a, b) => a.data_key < b.data_key ? -1 : a.data_key > b.data_key ? 1 : 0);
    const limit = parseInt((url.match(/[?&]limit=(\d+)/) || [])[1] || DB_MAX_ROWS, 10);
    const offset = parseInt((url.match(/[?&]offset=(\d+)/) || [])[1] || '0', 10);
    rows = rows.slice(offset, offset + Math.min(limit, DB_MAX_ROWS));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(r => { if (r && r.module_key && r.data_key) store.set(r.module_key + '|' + r.data_key, r.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') {
    const dk = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
    if (mk && dk) store.delete(mk + '|' + dk);
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

// ── Synthetische Seiten ──────────────────────────────────────────
const PAGE_SYNC = `<!doctype html><html><head><meta charset="utf-8"><title>synctest</title></head>
<body><div id="app">sync</div><script src="/gema_sync.js"></script></body></html>`;
const PAGE_NOTIFY = `<!doctype html><html><head><meta charset="utf-8"><title>notifytest</title></head>
<body><div id="app">notify</div>
<script src="/gema_sync.js"></script><script src="/gema_auth.js"></script><script src="/gema_notify.js"></script>
</body></html>`;
const PAGE_LOCK = `<!doctype html><html><head><meta charset="utf-8"><title>Drucktest – GEMA</title></head>
<body><div id="app">lock</div>
<script src="/gema_sync.js"></script><script src="/gema_auth.js"></script><script src="/gema_editlock.js"></script>
</body></html>`;
const PAGE_ASAVE = `<!doctype html><html><head><meta charset="utf-8"><title>Testmodul – GEMA</title></head>
<body><div id="app">
<select id="metaObjektDropdown"><option value="">–</option><option value="obj9" selected>Objekt 9</option></select>
<input id="feld1" type="text">
</div>
<script src="/gema_sync.js"></script><script src="/gema_auth.js"></script><script src="/gema_autosave.js"></script>
<script>GemaAutoSave.init('testmodul');</script>
</body></html>`;

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iat: now, exp: now + 30 * 86400, uid: 'u_a', org: 'org_t', role: 'authenticated' }) + '.testsig';
}
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_a', 'u_b'], active: true };
const USERS = [
  { id: 'u_a', username: 'a@t.ch', name: 'Anna Muster', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } },
  { id: 'u_b', username: 'b@t.ch', name: 'Beni Beispiel', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'b@t.ch' } }
];

const browser = await chromium.launch({ executablePath: CHROME });

async function device(userId, pageHtml, path, extraLs) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE + path)) return route.fulfill({ contentType: 'text/html', body: pageHtml });
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s.ls)) localStorage.setItem(k, JSON.stringify(v));
    window._GEMA_EDITLOCK_HB_MS = 250; window._GEMA_EDITLOCK_TTL_MS = 2500;
  }, { ls: Object.assign({ gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: { userId, expires: FUTURE, token: jwt() } }, extraLs || {}) });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  return { ctx, page };
}

// ── A) Pagination ────────────────────────────────────────────────
console.log('— A) loadCollection-Pagination (2500 Rows über den 1000er-Cap) —');
{
  for (let i = 0; i < 2500; i++) {
    const id = 'demo:' + String(i).padStart(5, '0');
    store.set('demo|' + id, { data: { id: id, n: i }, _lm: '2026-01-01T00:00:00Z' });
  }
  const { ctx, page } = await device('u_a', PAGE_SYNC, '/__synctest.html');
  const res = await page.evaluate(() => GemaSync.loadCollection('demo', 'demo:').then(r => ({
    n: r.length, first: r[0] && r[0].key, last: r[r.length - 1] && r[r.length - 1].key,
    shape: !!(r[0] && r[0].data && r[0].data.id && r[0].lm)
  })));
  ok(res.n === 2500, 'alle 2500 Rows geladen (vorher: stiller Cut bei 1000) — ' + res.n);
  ok(res.first === 'demo:00000' && res.last === 'demo:02499', 'Reihenfolge deterministisch (erste/letzte Row korrekt)');
  ok(res.shape, 'Rückgabeform {key,data,lm} unverändert');
  const pageReqs = reqLog.filter(r => r.method === 'GET' && r.mk === 'demo');
  ok(pageReqs.length === 3, '3 Seiten-Requests (1000+1000+500) — ' + pageReqs.length);
  ok(pageReqs.every(r => r.url.includes('order=data_key.asc')), 'jede Seite mit order=data_key.asc');
  ok(pageReqs[1].url.includes('offset=1000') && pageReqs[2].url.includes('offset=2000'), 'offset-Kette 1000/2000');

  reqLog.length = 0;
  const res2 = await page.evaluate(() => GemaSync.loadCollection('demo', 'demo:', { maxRows: 150 }).then(r => r.length));
  ok(res2 === 1000 && reqLog.filter(r => r.mk === 'demo').length === 1, 'maxRows stoppt nach der ersten Seite (' + res2 + ' Rows, 1 Request)');

  reqLog.length = 0;
  await page.evaluate(() => GemaSync.loadCollection('demo', 'demo:', { filter: 'payload->data->>n=eq.7' }).catch(() => []));
  ok(reqLog.some(r => r.mk === 'demo' && r.url.includes('payload->data->>n=eq.7')), 'opts.filter landet im Query-String');
  ok(page.errs.length === 0, 'keine pageerrors (Pagination)');
  await ctx.close();
}

// ── B) Notify: Empfänger-Filter + Retention ──────────────────────
console.log('— B) Notify-Pull mit Empfänger-Filter + Cloud-Retention —');
{
  reqLog.length = 0;
  const { ctx, page } = await device('u_a', PAGE_NOTIFY, '/__notifytest.html');
  await page.waitForTimeout(3200);   // Initial-Pull kommt bei +2500ms
  const pulls = reqLog.filter(r => r.method === 'GET' && r.mk === 'notify' && r.url.includes('or=('));
  ok(pulls.length >= 1, 'Pull läuft mit or=()-Empfänger-Filter (' + pulls.length + 'x)');
  if (pulls.length) {
    const u = pulls[0].url;
    ok(u.includes('empfaengerUserId.eq.u_a'), 'Filter: eigene userId');
    ok(u.includes('empfaengerOrgId.eq.org_t'), 'Filter: eigene orgId');
    ok(u.includes('empfaengerRoleId.eq.role_admin'), 'Filter: eigene Rolle');
    ok(u.includes('data_key=like.notif'), 'Prefix-Filter bleibt (notif:)');
  } else { fail += 4; }
  const merged = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]'));
  ok(merged.some(n => n.id === 'n_match'), 'Cloud-Notifikation lokal gemerged');
  const retScans = reqLog.filter(r => r.method === 'GET' && r.mk === 'notify' && r.url.includes('ts=lt.'));
  ok(retScans.length === 1, 'Retention-Scan lief genau 1x (' + retScans.length + ')');
  ok(retScans.length && retScans[0].url.includes('limit='), 'Retention-Scan paginiert/limitiert');
  await page.waitForTimeout(400);
  const dels = reqLog.filter(r => r.method === 'DELETE' && r.mk === 'notify');
  ok(dels.some(r => r.url.includes('notif:old1')) && dels.some(r => r.url.includes('notif:old2')), 'alte Cloud-Rows gelöscht (old1+old2)');
  const lock = await page.evaluate(() => localStorage.getItem('gema_notify_ret_v1'));
  ok(lock === new Date().toISOString().slice(0, 10), 'Tages-Lock gesetzt');

  // Reload (gleiches Gerät): Retention übersprungen, Pull läuft weiter
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3200);
  const retScans2 = reqLog.filter(r => r.method === 'GET' && r.mk === 'notify' && r.url.includes('ts=lt.'));
  ok(retScans2.length === 1, 'Retention am selben Tag nicht erneut (Tages-Lock)');
  ok(page.errs.length === 0, 'keine pageerrors (Notify)');
  await ctx.close();
}

// ── C) Editlock: zwei Personen am selben Datensatz ───────────────
console.log('— C) Editlock-Banner (2 Kontexte, TTL, Dismiss, Release) —');
{
  const KEY = 'gema_testmodul__obj1';
  const a = await device('u_a', PAGE_LOCK, '/__locktest.html');
  await a.page.evaluate(k => GemaEditLock.watch({ key: k, label: 'Druckdispositiv' }), KEY);
  await a.page.waitForTimeout(400);
  ok(!!store.get('editlock|lock:' + KEY + '__u_a'), 'Lock-Row von A in der Cloud');
  const rowA = store.get('editlock|lock:' + KEY + '__u_a');
  ok(rowA && rowA.data && rowA.data.userName === 'Anna Muster' && rowA.data.ts, 'Lock trägt Name + Zeitstempel');
  const bannerA0 = await a.page.evaluate(() => { const b = document.getElementById('gema-editlock-banner'); return b && b.style.display !== 'none'; });
  ok(!bannerA0, 'allein: kein Banner bei A');

  const b = await device('u_b', PAGE_LOCK, '/__locktest.html');
  await b.page.evaluate(k => GemaEditLock.watch({ key: k, label: 'Druckdispositiv' }), KEY);
  await b.page.waitForTimeout(600);
  const bannerB = await b.page.evaluate(() => { const el = document.getElementById('gema-editlock-banner'); return el && el.style.display !== 'none' ? el.textContent : ''; });
  ok(bannerB.includes('Anna Muster'), 'B sieht Banner mit Namen von A');
  ok(bannerB.includes('Druckdispositiv'), 'Banner nennt den Datensatz (Label)');
  await a.page.waitForTimeout(600);   // A's nächster Beat sieht B
  const bannerA = await a.page.evaluate(() => { const el = document.getElementById('gema-editlock-banner'); return el && el.style.display !== 'none' ? el.textContent : ''; });
  ok(bannerA.includes('Beni Beispiel'), 'A sieht Banner mit Namen von B');

  // Dismiss bei B: Banner weg, bleibt bei gleicher Konstellation weg
  await b.page.evaluate(() => document.querySelector('#gema-editlock-banner button').click());
  await b.page.waitForTimeout(600);
  const bAfterDismiss = await b.page.evaluate(() => { const el = document.getElementById('gema-editlock-banner'); return el && el.style.display !== 'none'; });
  ok(!bAfterDismiss, 'Dismiss (✕) hält den Banner bei B ausgeblendet');

  // B beendet → Lock weg → Banner bei A verschwindet
  await b.page.evaluate(() => GemaEditLock.stop());
  await b.page.waitForTimeout(300);
  ok(!store.get('editlock|lock:' + KEY + '__u_b'), 'stop() löscht Lock-Row von B');
  await a.page.waitForTimeout(700);
  const bannerA2 = await a.page.evaluate(() => { const el = document.getElementById('gema-editlock-banner'); return el && el.style.display !== 'none'; });
  ok(!bannerA2, 'Banner bei A verschwindet, sobald B weg ist');

  // TTL: abgelaufener fremder Lock zählt nicht; uralter wird abgeräumt
  const oldTs = new Date(Date.now() - 11 * 60000).toISOString();
  store.set('editlock|lock:' + KEY + '__u_c', { data: { key: KEY, userId: 'u_c', userName: 'Karl Alt', ts: oldTs }, _lm: oldTs });
  reqLog.length = 0;
  await a.page.waitForTimeout(700);
  const bannerA3 = await a.page.evaluate(() => { const el = document.getElementById('gema-editlock-banner'); return el && el.style.display !== 'none'; });
  ok(!bannerA3, 'abgelaufener Lock (TTL) erzeugt keinen Banner');
  await a.page.waitForTimeout(400);
  ok(!store.get('editlock|lock:' + KEY + '__u_c'), 'uralte Lock-Leiche wird abgeräumt (Housekeeping)');

  // pagehide bei A → eigener Lock wird gelöst
  await a.page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await a.page.waitForTimeout(400);
  ok(!store.get('editlock|lock:' + KEY + '__u_a'), 'pagehide löst den eigenen Lock');
  ok(a.page.errs.length === 0 && b.page.errs.length === 0, 'keine pageerrors (Editlock)');
  await a.ctx.close(); await b.ctx.close();
}

// ── D) Autosave-Integration (lazy) ───────────────────────────────
console.log('— D) Editlock via GemaAutoSave (lazy-Load, Key = AutoSave-Key) —');
{
  const { ctx, page } = await device('u_a', PAGE_ASAVE, '/__asavetest.html');
  await page.waitForTimeout(2300);   // _lockSetup nach 1.5s + Script-Load
  const st = await page.evaluate(() => ({
    loaded: typeof window.GemaEditLock !== 'undefined',
    active: window.GemaEditLock ? window.GemaEditLock.active() : null
  }));
  ok(st.loaded, 'gema_editlock.js lazy nachgeladen');
  ok(st.active === 'gema_testmodul__obj9', 'Watch-Key = AutoSave-Key (Modul + Objekt) — ' + st.active);
  ok(!!store.get('editlock|lock:gema_testmodul__obj9__u_a'), 'Lock-Row für das Objekt in der Cloud');
  // Objektwechsel → Watch folgt
  await page.evaluate(() => { document.getElementById('metaObjektDropdown').value = ''; window.onObjektSelect(); });
  await page.waitForTimeout(500);
  const st2 = await page.evaluate(() => window.GemaEditLock.active());
  ok(st2 === 'gema_testmodul', 'Objektwechsel zieht den Watch-Key nach — ' + st2);
  ok(!store.get('editlock|lock:gema_testmodul__obj9__u_a'), 'alter Objekt-Lock beim Wechsel gelöst');
  ok(page.errs.length === 0, 'keine pageerrors (Autosave-Integration)');
  await ctx.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
