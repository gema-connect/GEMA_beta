// Objekt-Löschung mit Daten-Check (pm_objekte.html): Vor dem Löschen wird
// geprüft, ob und wo Daten für das Objekt gespeichert wurden — der Dialog
// listet sie pro Modul auf, beim Bestätigen werden die objekt-eigenen
// Modul-Daten mitgelöscht (Cloud + localStorage + Berechnungs-Index),
// verknüpfte Pool-Datensätze anderer Module bleiben bestehen.
//
// Playwright mit In-Memory-PostgREST-Mock (LIKE-Pattern + JSON-Pfad-Filter
// + DELETE), Muster scripts/favoriten_sync_test.mjs.
//
// Aufruf:  CHROME=<chromium> node scripts/objekt_loeschen_datencheck_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8897;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/pm_objekte.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST (Map «mk|dk» → payload) ──────────────────────
const store = new Map();
function likeToRe(pattern) {
  // SQL-LIKE: * (PostgREST-%) = beliebig, _ = genau ein Zeichen
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*/g, '.*').replace(/_/g, '.') + '$');
}
function handleSb(route) {
  const req = route.request();
  // fetch() percent-encodiert die '>'-Zeichen der PostgREST-JSON-Pfad-Filter
  // (payload->data->>objektId) — wie der echte Server zuerst dekodieren.
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mkEq = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
  const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
  const jObjektId = (url.match(/payload->data->>objektId=eq\.([^&]+)/) || [])[1];
  const jProjObjektId = (url.match(/payload->data->projekt->>objektId=eq\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|');
      const m = k.slice(0, i), d = k.slice(i + 1);
      if (mkEq && m !== mkEq) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike && !likeToRe(dkLike).test(d)) continue;
      if (jObjektId && !(v && v.data && v.data.objektId === jObjektId)) continue;
      if (jProjObjektId && !(v && v.data && v.data.projekt && v.data.projekt.objektId === jProjObjektId)) continue;
      rows.push({ module_key: m, data_key: d, payload: v });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = [];
    try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(row => { if (row && row.module_key && row.data_key) store.set(row.module_key + '|' + row.data_key, row.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') {
    if (mkEq && dkEq) store.delete(mkEq + '|' + dkEq);
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

// ── Seeds ────────────────────────────────────────────────────────────
function seedStore() {
  store.clear();
  const put = (mk, dk, payload) => store.set(mk + '|' + dk, payload);
  // Stammdaten (per-Record, wie GemaObjekte sie ablegt)
  put('objekte', 'objekt:obj_del',  { data: { id: 'obj_del',  name: 'Testhaus Löschen', orgId: 'org_t' }, _lm: '2026-07-01T00:00:00Z' });
  put('objekte', 'objekt:obj_keep', { data: { id: 'obj_keep', name: 'Bleibt stehen',    orgId: 'org_t' }, _lm: '2026-07-01T00:00:00Z' });
  put('objekte', 'objekt:obj_empty',{ data: { id: 'obj_empty', name: 'Ohne Daten',      orgId: 'org_t' }, _lm: '2026-07-01T00:00:00Z' });
  put('objekte', 'bet:bet1', { data: { id: 'bet1', objektId: 'obj_del', rolle: 'Bauherrschaft', firma: 'BH AG' }, _lm: '2026-07-01T00:00:00Z' });
  // Objekt-eigene Modul-Stände (werden mitgelöscht): AutoSave + _GemaDB-Blob + Phase + Anlagenwahl
  put('lu_tabelle',   'gema_lu_tabelle__obj_del',              { v: JSON.stringify({ a: '1', _ts: 1 }) });
  put('zirkulation',  'gema_zirkulation__obj_del@bauprojekt',  { v: JSON.stringify({ b: '2', _ts: 2 }) });
  put('abnahme',      'gema_abnahme_sia_v1__obj_del',          { v: JSON.stringify({ protocols: [] }) });
  put('enthaertungsanlage', 'gema_aw_chosen_enthaertung__obj_del', { v: '"anlage_1"' });
  // Fremdes Objekt — darf NICHT angefasst werden
  put('druckerhoehung', 'gema_druckerhoehung__obj_keep', { v: JSON.stringify({ k: '1', _ts: 3 }) });
  // Verknüpfte Pool-Datensätze (bleiben bestehen)
  put('regierapport',   'regie:r1',   { data: { id: 'r1', objektId: 'obj_del', nr: 'R-001' }, _lm: '2026-07-02T00:00:00Z' });
  put('erp',            'erpdok:d1',  { data: { id: 'd1', objektId: 'obj_del', typ: 'offerte' }, _lm: '2026-07-02T00:00:00Z' });
  put('produktkatalog', 'oa:oa1',     { data: { id: 'oa1', projekt: { objektId: 'obj_del' }, kategorie: 'enthaertung' }, _lm: '2026-07-02T00:00:00Z' });
  // Notifikation mit objektId — darf NICHT als «Daten» erscheinen
  put('notify', 'notif:n1', { data: { id: 'n1', objektId: 'obj_del', titel: 'x' }, _lm: '2026-07-02T00:00:00Z' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

const browser = await chromium.launch({ executablePath: CHROME });

async function openObjektePage(extraLs) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    Object.assign({ gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: SESSION }, extraLs || {}));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/pm_objekte.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return { ctx, page };
}

// Lokale per-Objekt-Keys + Berechnungs-Index als Geräte-Stand
const LOCAL_SEED = {
  'gema_lu_tabelle__obj_del': JSON.stringify({ a: '1', _ts: 1 }),
  'gema_nur_lokal__obj_del': JSON.stringify({ l: 1 }),               // nur auf diesem Gerät
  'gema_druckerhoehung__obj_keep': JSON.stringify({ k: '1', _ts: 3 }),
  'gema_berechnungen_index_v1': JSON.stringify([
    { key: 'lu_tabelle__obj_del', modul: 'lu_tabelle', objektId: 'obj_del', titel: 'LU', storageKey: 'gema_lu_tabelle__obj_del', orgId: 'org_t', lastModified: '2026-07-10T10:00:00Z' },
    { key: 'druckerhoehung__obj_keep', modul: 'druckerhoehung', objektId: 'obj_keep', titel: 'DE', storageKey: 'gema_druckerhoehung__obj_keep', orgId: 'org_t', lastModified: '2026-07-11T10:00:00Z' }
  ])
};

console.log('— 1) Scan findet alle Daten des Objekts —');
{
  seedStore();
  const { ctx, page } = await openObjektePage(LOCAL_SEED);
  ok(page.errs.length === 0, 'pm_objekte bootet ohne pageerrors');
  const hooks = await page.evaluate(() => !!(window._objDelHooks && window._objDelHooks.scan));
  ok(hooks, 'Test-Hooks (_objDelHooks) vorhanden');
  const scan = await page.evaluate(() => window._objDelHooks.scan('obj_del'));
  ok(scan.cloudOk === true, 'Cloud-Scan erfolgreich (cloudOk)');
  const dks = scan.rows.map(r => r.dataKey).sort();
  ok(dks.indexOf('gema_lu_tabelle__obj_del') >= 0, 'AutoSave-Snapshot gefunden (lu_tabelle)');
  ok(dks.indexOf('gema_zirkulation__obj_del@bauprojekt') >= 0, 'Phasen-Variante gefunden (@bauprojekt)');
  ok(dks.indexOf('gema_abnahme_sia_v1__obj_del') >= 0, '_GemaDB-Blob gefunden (Abnahme)');
  ok(dks.indexOf('gema_aw_chosen_enthaertung__obj_del') >= 0, 'Anlagenwahl-Key gefunden');
  ok(dks.indexOf('gema_nur_lokal__obj_del') >= 0, 'Nur-lokaler Key gefunden');
  ok(dks.every(k => k.indexOf('obj_keep') < 0), 'Fremdes Objekt NICHT in der Liste');
  ok(!scan.rows.some(r => /^(objekt:|bet:)/.test(r.dataKey)), 'objekt:/bet:-Stammdaten-Rows nicht als Modul-Daten gelistet');
  const luRow = scan.rows.find(r => r.dataKey === 'gema_lu_tabelle__obj_del');
  ok(luRow && luRow.moduleKey === 'lu_tabelle', 'module_key aus der Cloud übernommen');
  const refMods = scan.refs.map(r => r.moduleKey).sort();
  ok(refMods.join(',') === 'erp,produktkatalog,regierapport', 'Referenzen: ERP + Offertanfrage (verschachtelt) + Regierapport — Notify ausgeschlossen (' + refMods.join(',') + ')');
  // Label-Auflösung
  const labels = await page.evaluate(() => ({
    lu: window._objDelHooks.modulInfo('lu_tabelle', 'gema_lu_tabelle__obj_del').label,
    zk: window._objDelHooks.modulInfo('zirkulation', 'gema_zirkulation__obj_del@bauprojekt').label,
    ab: window._objDelHooks.modulInfo('abnahme', 'gema_abnahme_sia_v1__obj_del').label,
    vkf: window._objDelHooks.modulInfo('vkf_allgemeine_daten', 'gema_vkf_allgemeine_daten__obj_del').label,
    aw: window._objDelHooks.modulInfo(null, 'gema_aw_chosen_enthaertung__obj_del').label,
    refErp: window._objDelHooks.refLabel('erp').label
  }));
  ok(labels.lu === 'LU-Zusammenstellung', 'Label via MODUL_MAP (' + labels.lu + ')');
  ok(labels.zk === 'Zirkulationsberechnung', 'Label via Alias/GemaAuth (' + labels.zk + ')');
  ok(/Abnahme/.test(labels.ab), 'Label Abnahme-Alias (' + labels.ab + ')');
  ok(/VKF-Formular/.test(labels.vkf), 'Label VKF-Formular (' + labels.vkf + ')');
  ok(/Anlagen-Auswahl/.test(labels.aw), 'Label Anlagenwahl (' + labels.aw + ')');
  ok(/Offerten|Rechnungen/.test(labels.refErp), 'Referenz-Label ERP (' + labels.refErp + ')');
  await ctx.close();
}

console.log('— 2) Dialog listet die Daten + Bestätigen löscht kaskadiert —');
{
  seedStore();
  const { ctx, page } = await openObjektePage(LOCAL_SEED);
  await page.evaluate(() => window.deleteObjektById('obj_del'));
  await page.waitForSelector('.gema-dlg', { timeout: 8000 });
  const dlg = await page.evaluate(() => ({
    msg: document.querySelector('.gema-dlg-msg').innerHTML,
    btn: document.querySelector('.gema-dlg-danger') ? document.querySelector('.gema-dlg-danger').textContent : ''
  }));
  ok(/Testhaus Löschen/.test(dlg.msg), 'Dialog nennt das Objekt');
  ok(/werden mitgelöscht/.test(dlg.msg), 'Sektion «werden mitgelöscht» vorhanden');
  ok(/LU-Zusammenstellung/.test(dlg.msg), 'Modul-Liste: LU-Zusammenstellung');
  ok(/Zirkulationsberechnung/.test(dlg.msg), 'Modul-Liste: Zirkulation');
  ok(/Abnahmeprotokolle/.test(dlg.msg), 'Modul-Liste: Abnahme');
  ok(/BP/.test(dlg.msg), 'Phasen-Chip (BP) angezeigt');
  ok(/bleiben erhalten/.test(dlg.msg), 'Sektion «bleiben erhalten» vorhanden');
  ok(/Regierapporte/.test(dlg.msg), 'Referenz: Regierapporte gelistet');
  ok(/1 Beteiligte/.test(dlg.msg), 'Beteiligten-Hinweis vorhanden');
  ok(/10\.0?7\.2026/.test(dlg.msg), 'Zuletzt-geändert-Datum aus dem Berechnungs-Index');
  ok(/Objekt \+ Daten löschen/.test(dlg.btn), 'Confirm-Button heisst «Objekt + Daten löschen»');
  await page.click('.gema-dlg-danger');
  await page.waitForTimeout(1200);
  // Cloud: objekt-eigene Daten weg
  ok(!store.has('lu_tabelle|gema_lu_tabelle__obj_del'), 'Cloud: AutoSave-Row gelöscht');
  ok(!store.has('zirkulation|gema_zirkulation__obj_del@bauprojekt'), 'Cloud: Phasen-Row gelöscht');
  ok(!store.has('abnahme|gema_abnahme_sia_v1__obj_del'), 'Cloud: Abnahme-Blob gelöscht');
  ok(!store.has('enthaertungsanlage|gema_aw_chosen_enthaertung__obj_del'), 'Cloud: Anlagenwahl-Row gelöscht');
  ok(!store.has('objekte|objekt:obj_del'), 'Cloud: objekt:-Row gelöscht (persistBlob-Diff)');
  ok(!store.has('objekte|bet:bet1'), 'Cloud: Beteiligten-Row gelöscht');
  // Verknüpfte Datensätze + fremdes Objekt unangetastet
  ok(store.has('regierapport|regie:r1'), 'Regierapport bleibt bestehen');
  ok(store.has('erp|erpdok:d1'), 'ERP-Dokument bleibt bestehen');
  ok(store.has('produktkatalog|oa:oa1'), 'Offertanfrage bleibt bestehen');
  ok(store.has('druckerhoehung|gema_druckerhoehung__obj_keep'), 'Daten des anderen Objekts unangetastet');
  ok(store.has('objekte|objekt:obj_keep'), 'Anderes Objekt bleibt bestehen');
  // Lokal: Keys + Index bereinigt
  const local = await page.evaluate(() => {
    const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('__obj_del') >= 0) ks.push(k); }
    let idx = []; try { idx = JSON.parse(localStorage.getItem('gema_berechnungen_index_v1') || '[]'); } catch (e) {}
    return { rest: ks, keep: !!localStorage.getItem('gema_druckerhoehung__obj_keep'), idxDel: idx.filter(e => e.objektId === 'obj_del').length, idxKeep: idx.filter(e => e.objektId === 'obj_keep').length };
  });
  ok(local.rest.length === 0, 'localStorage: alle __obj_del-Keys entfernt');
  ok(local.keep, 'localStorage: Key des anderen Objekts bleibt');
  ok(local.idxDel === 0 && local.idxKeep === 1, 'Berechnungs-Index bereinigt (nur obj_keep übrig)');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— 3) Abbrechen löscht nichts —');
{
  seedStore();
  const { ctx, page } = await openObjektePage(LOCAL_SEED);
  await page.evaluate(() => window.deleteObjektById('obj_del'));
  await page.waitForSelector('.gema-dlg', { timeout: 8000 });
  await page.click('.gema-dlg-cancel');
  await page.waitForTimeout(500);
  ok(store.has('objekte|objekt:obj_del'), 'Objekt bleibt bestehen');
  ok(store.has('lu_tabelle|gema_lu_tabelle__obj_del'), 'Modul-Daten bleiben bestehen');
  const hasLocal = await page.evaluate(() => !!localStorage.getItem('gema_lu_tabelle__obj_del'));
  ok(hasLocal, 'lokale Daten bleiben bestehen');
  await ctx.close();
}

console.log('— 4) Objekt ohne Daten: klarer Hinweis + normales Löschen —');
{
  seedStore();
  const { ctx, page } = await openObjektePage();
  await page.evaluate(() => window.deleteObjektById('obj_empty'));
  await page.waitForSelector('.gema-dlg', { timeout: 8000 });
  const dlg = await page.evaluate(() => ({
    msg: document.querySelector('.gema-dlg-msg').innerHTML,
    btn: document.querySelector('.gema-dlg-danger') ? document.querySelector('.gema-dlg-danger').textContent : ''
  }));
  ok(/Keine gespeicherten Modul-Daten/.test(dlg.msg), 'Hinweis «Keine gespeicherten Modul-Daten»');
  ok(dlg.btn.trim() === 'Löschen', 'Confirm-Button heisst schlicht «Löschen»');
  await page.click('.gema-dlg-danger');
  await page.waitForTimeout(900);
  ok(!store.has('objekte|objekt:obj_empty'), 'Objekt ohne Daten gelöscht');
  await ctx.close();
}

console.log('— 5) Cloud offline: lokaler Scan + Warnhinweis —');
{
  seedStore();
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return route.abort(); // Cloud tot
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  // Objekt liegt im lokalen Blob-Cache (Cloud unerreichbar)
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, {
    gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: SESSION,
    gema_objekte_v1: { objekte: [{ id: 'obj_del', name: 'Offline-Haus', orgId: 'org_t' }], beteiligte: [], activeObjektId: null },
    'gema_lu_tabelle__obj_del': JSON.stringify({ a: '1', _ts: 1 }),
    gema_regie_pool_v1: [{ id: 'r1', objektId: 'obj_del' }]
  });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/pm_objekte.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const scan = await page.evaluate(() => window._objDelHooks.scan('obj_del'));
  ok(scan.cloudOk === false, 'cloudOk=false ohne Cloud');
  ok(scan.rows.some(r => r.dataKey === 'gema_lu_tabelle__obj_del' && r.moduleKey === null), 'lokaler Key gefunden (ohne module_key)');
  ok(scan.refs.some(r => r.moduleKey === 'regierapport' && r.count === 1), 'Pool-Cache-Fallback zählt Regierapport');
  const html = await page.evaluate(o => window._objDelHooks.dialogHtml({ id: 'obj_del', name: 'Offline-Haus' }, o), scan);
  ok(/Cloud nicht erreichbar/.test(html), 'Dialog warnt «Cloud nicht erreichbar»');
  await ctx.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
