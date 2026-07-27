// Cloud-Audit 27.07.2026: «Alles in der Cloud, nichts nur lokal».
// Drift-Guard für die im Audit migrierten Speicherstellen — dieselbe
// Bug-Klasse wie der Workspace-Eimer (gerätelokale Daten bzw. tote
// `_GemaDB.put`-Aufrufe, die Funktion existiert in gema_db.js nicht).
//
// Abgedeckt (je: Gerät A schreibt → Cloud-Row → Gerät B sieht):
//  1) sb_druckverlust — Teilstrecken-Berechnungen (_GemaDB init/save)
//  2) pm_crbx — Offertvergleich-Store, ORG-gescopter Key
//  3) Berechnungs-Index (gema_objekte_api) — per-Record `bidx:`
//  4) gema_anlagenwahl — gewählte Anlage wird aus der Cloud gespiegelt
//  5) pm_regierapport — Zusammenstellungs-Parameter `regiezus:<objektId>`
//  6) gema_notify — Benachrichtigungs-Einstellungen `nprefs:<userId>`
//  7) pm_ausschreibungsunterlagen — Vorlagen, ORG-gescopter Key
//  8) sys_workspace — Eimer-Vorlagen `wstpl:<orgId>`
//  9) sa_enthaertung — LU-Override-Marker aus der Cloud gespiegelt
// 10) if_werkzeug — Inventur-Lauf per-Record `inv:` (+ Org-Filter)
//
// Aufruf:  CHROME=<chromium> node scripts/cloud_audit_sync_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8892;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST: GET eq/like/in + POST batch + DELETE eq ──
const store = new Map(); // «mk|dk» → payload
function handleSb(route) {
  const req = route.request(), url = req.url(), method = req.method();
  const mkm = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const mk = mkm ? decodeURIComponent(mkm) : null;
  if (method === 'GET') {
    const rows = [];
    const eq = url.match(/data_key=eq\.([^&]+)/);
    const like = url.match(/data_key=like\.([^&]+)/);
    const inm = url.match(/data_key=in\.\(([^)]*)\)/);
    if (mk && eq) {
      const dk = decodeURIComponent(eq[1]);
      if (store.has(mk + '|' + dk)) rows.push({ data_key: dk, payload: store.get(mk + '|' + dk) });
    } else if (mk && inm) {
      decodeURIComponent(inm[1]).split(',').map(s => s.replace(/^"|"$/g, '')).forEach(dk => {
        if (store.has(mk + '|' + dk)) rows.push({ data_key: dk, payload: store.get(mk + '|' + dk) });
      });
    } else if (mk && like) {
      const pf = decodeURIComponent(like[1]).replace(/\*$/, '');
      for (const [k, v] of store) { const i = k.indexOf('|'); if (k.slice(0, i) === mk && k.slice(i + 1).startsWith(pf)) rows.push({ data_key: k.slice(i + 1), payload: v }); }
      rows.sort((a, b) => a.data_key < b.data_key ? -1 : 1);
    } else if (mk) {
      for (const [k, v] of store) { const i = k.indexOf('|'); if (k.slice(0, i) === mk) rows.push({ data_key: k.slice(i + 1), payload: v }); }
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = [];
    try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(r => { if (r && r.module_key && r.data_key) store.set(r.module_key + '|' + r.data_key, r.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') {
    const eq = url.match(/data_key=eq\.([^&]+)/);
    if (mk && eq) store.delete(mk + '|' + decodeURIComponent(eq[1]));
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfYSIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig';
const ORGS = [
  { id: 'org_a', name: 'Planer AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true },
  { id: 'org_b', name: 'Fremd GmbH', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u3'], active: true }
];
const USERS = [
  { id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_planer'], orgId: 'org_a', active: true, profile: { email: 'a@t.ch' } },
  { id: 'u3', username: 'f@x.ch', name: 'Fremder', roleIds: ['role_planer'], orgId: 'org_b', active: true, profile: { email: 'f@x.ch' } },
  { id: 'u8', username: 'm@t.ch', name: 'Magaziner', roleIds: ['role_magaziner'], orgId: 'org_a', active: true, profile: { email: 'm@t.ch' } }
];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function device(userId, file, extraLs) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
    Object.assign({
      gema_orgs_v1: ORGS, gema_users_v1: USERS,
      gema_session_v1: { token: JWT, userId, expires: FUTURE },
      gema_coachmarks_done_sys_workspace_v2: 'done'
    }, extraLs || {}));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/' + file, { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}

console.log('— 1) sb_druckverlust: Berechnungen cross-device —');
{
  const a = await device('u1', 'sb_druckverlust.html');
  await a.page.waitForTimeout(1200);   // Boot + _GemaDB.init
  await a.page.evaluate(() => {
    allCalcs[0].name = 'Steigzone Haus B';
    allCalcs[0].state.rows[0].length_m = 42;
    saveActiveCalc();
  });
  await a.page.waitForTimeout(1200);   // gema_db-Flush (700 ms debounce)
  const row = store.get('druckverlust|gema_druckverlust_v2');
  ok(!!row && String(row.v || '').indexOf('Steigzone Haus B') >= 0, 'Berechnung liegt als Cloud-Row (druckverlust)');
  ok(a.page.errs.length === 0, 'keine pageerrors (A): ' + a.page.errs.join('|').slice(0, 120));
  await a.ctx.close();

  const b = await device('u1', 'sb_druckverlust.html');
  await b.page.waitForTimeout(1500);
  const st = await b.page.evaluate(() => ({ name: allCalcs[0] && allCalcs[0].name, len: allCalcs[0] && allCalcs[0].state.rows[0].length_m }));
  ok(st.name === 'Steigzone Haus B', 'Gerät B lädt die Berechnung aus der Cloud');
  ok(String(st.len) === '42', 'Teilstrecken-Werte kommen mit (Länge 42 m)');
  await b.ctx.close();
}

console.log('— 2) pm_crbx: Store cross-device + org-gescoped —');
{
  const a = await device('u1', 'pm_crbx.html');
  await a.page.waitForTimeout(900);
  await a.page.evaluate(() => { S.settings.testMarke = 'crbx-sync'; save(); });
  await a.page.waitForTimeout(1200);
  ok(!!store.get('crbx|gema_crbx_v1__org_org_a'), 'CRBX-Row unter dem ORG-Key (kein globaler Blob)');
  ok(!store.get('crbx|gema_crbx_v1'), 'kein cross-org geteilter flacher Key');
  await a.ctx.close();

  const b = await device('u1', 'pm_crbx.html');
  await b.page.waitForTimeout(900);
  ok(await b.page.evaluate(() => S.settings.testMarke) === 'crbx-sync', 'Gerät B liest den CRBX-Stand');
  const f = await device('u3', 'pm_crbx.html');   // fremde Org
  await f.page.waitForTimeout(900);
  ok(await f.page.evaluate(() => S.settings.testMarke || null) === null, 'fremde Org sieht den CRBX-Stand NICHT');
  await b.ctx.close(); await f.ctx.close();
}

console.log('— 3) Berechnungs-Index: org-weit statt gerätelokal —');
{
  const a = await device('u1', 'sb_saugpumpe.html');
  await a.page.waitForTimeout(900);
  await a.page.evaluate(() => GemaObjekte.registerBerechnung({ modul: 'saugpumpe', objektId: 'obj1', titel: 'Saughöhe Pumpwerk' }));
  await a.page.waitForTimeout(600);
  const rec = store.get('berechnungsindex|bidx:saugpumpe__obj1');
  ok(!!rec && rec.data && rec.data.titel === 'Saughöhe Pumpwerk', 'Index-Eintrag als Cloud-Record (bidx:)');
  ok(rec && rec.data.orgId === 'org_a', 'Eintrag trägt die Org (Team-Sichtbarkeit)');
  await a.ctx.close();

  const b = await device('u1', 'sb_saugpumpe.html');
  await b.page.waitForTimeout(1500);
  const list = await b.page.evaluate(() => GemaObjekte.getBerechnungenForObjekt('obj1'));
  ok(list.length === 1 && list[0].titel === 'Saughöhe Pumpwerk', 'Gerät B sieht den Index-Eintrag');
  await b.ctx.close();
}

console.log('— 4) Anlagenwahl: gewählte Anlage aus der Cloud gespiegelt —');
{
  store.set('anlagenwahl|aw:gema_aw_chosen_saugpumpe', { data: { id: 'p1', lieferantFirma: 'Musterpumpen AG', serie: 'JP', modell: '5', daten: { npsh: 3.2 }, uebernommenAm: '2026-07-27' }, _lm: 1 });
  const b = await device('u1', 'sb_saugpumpe.html');
  await b.page.waitForTimeout(1500);
  const chosen = await b.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gema_aw_chosen_saugpumpe') || 'null'); } catch (e) { return null; } });
  ok(!!chosen && chosen.modell === '5', 'aw:-Record landet im localStorage-Spiegel (alle Leser unverändert)');
  await b.ctx.close();
}

console.log('— 5) Regierapport: Zusammenstellungs-Parameter cross-device —');
{
  const a = await device('u1', 'pm_regierapport.html');
  await a.page.waitForTimeout(900);
  await a.page.evaluate(() => rrZusSaveParams('obj1', { zuschlag: 5, rabatt: 2, mwst: 8.1 }));
  await a.page.waitForTimeout(500);
  const rec = store.get('regierapport|regiezus:obj1');
  ok(!!rec && rec.data && rec.data.zuschlag === 5, 'Parameter als Cloud-Record (regiezus:)');
  await a.ctx.close();

  const b = await device('u1', 'pm_regierapport.html');
  await b.page.waitForTimeout(1400);
  const p = await b.page.evaluate(() => rrZusParams('obj1'));
  ok(p.zuschlag === 5 && p.rabatt === 2, 'Gerät B rechnet mit denselben Zuschlägen');
  await b.ctx.close();
}

console.log('— 6) Notify-Prefs: Einstellungen folgen dem User —');
{
  const a = await device('u1', 'sb_saugpumpe.html');
  await a.page.waitForTimeout(900);
  await a.page.evaluate(() => GemaNotify.setPref('werkzeug_defekt', false));
  await a.page.waitForTimeout(500);
  const rec = store.get('notify|nprefs:u1');
  ok(!!rec && rec.data && rec.data.werkzeug_defekt === false, 'Pref als Cloud-Record (nprefs:<userId>)');
  await a.ctx.close();

  const b = await device('u1', 'sb_saugpumpe.html');
  await b.page.waitForTimeout(3600);   // Prefs-Pull läuft bei +2.8 s
  ok(await b.page.evaluate(() => GemaNotify.getPrefs().werkzeug_defekt) === false, 'Gerät B übernimmt die Einstellung');
  await b.ctx.close();
}

console.log('— 7) Ausschreibungs-Vorlagen: org-gescoped in der Cloud —');
{
  const a = await device('u1', 'pm_ausschreibungsunterlagen.html');
  await a.page.waitForTimeout(2500);
  await a.page.evaluate(() => svVorlagen([{ id: 'v1', name: 'MFH-Standard', bkp: [] }]));
  await a.page.waitForTimeout(1200);
  ok(!!store.get('ausschreibung|gema_ausschreibung_vorlagen_v1__org_org_a'), 'Vorlagen-Row unter dem ORG-Key');
  await a.ctx.close();

  const b = await device('u1', 'pm_ausschreibungsunterlagen.html');
  await b.page.waitForTimeout(2500);
  const v = await b.page.evaluate(() => ldVorlagen());
  ok(v.length === 1 && v[0].name === 'MFH-Standard', 'Gerät B sieht die Vorlage');
  await b.ctx.close();
}

console.log('— 8) Workspace-Vorlagen: pro Org in der Cloud —');
{
  const a = await device('u1', 'sys_workspace.html');
  await a.page.waitForTimeout(900);
  await a.page.evaluate(() => window._wsHooks.templates.save([{ name: 'Neubau-Set', modules: ['sb_druckverlust'] }]));
  await a.page.waitForTimeout(500);
  const rec = store.get('workspace|wstpl:org_a');
  ok(!!rec && rec.data && rec.data.templates[0].name === 'Neubau-Set', 'Vorlagen-Record wstpl:<orgId>');
  await a.ctx.close();

  const b = await device('u1', 'sys_workspace.html');
  await b.page.waitForTimeout(1200);
  const t = await b.page.evaluate(() => window._wsHooks.templates.load());
  ok(t.length === 1 && t[0].name === 'Neubau-Set', 'Gerät B sieht die Eimer-Vorlage');
  await b.ctx.close();
}

console.log('— 9) LU-Override-Marker (Enthärtung): Cloud → localStorage —');
{
  store.set('enthaertungsanlage|gema_enthaertung_lu_overrides_v1__obj1', { data: { A: { lbl: true } }, _lm: 1 });
  const b = await device('u1', 'sa_enthaertung.html');
  await b.page.waitForTimeout(1500);
  const m = await b.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gema_enthaertung_lu_overrides_v1__obj1') || 'null'); } catch (e) { return null; } });
  ok(!!m && m.A && m.A.lbl === true, 'Override-Marker aus der Cloud gespiegelt (manuelle Werte bleiben geschützt)');
  ok(b.page.errs.length === 0, 'keine pageerrors (Enthärtung)');
  await b.ctx.close();
}

console.log('— 10) Werkzeug-Inventur: per-Record + Org-Filter —');
{
  const a = await device('u8', 'if_werkzeug.html');
  await a.page.waitForTimeout(1800);
  await a.page.evaluate(() => {
    window.confirm = () => true;      // nativer Start-Confirm
    window._wzStartInventur();
  });
  await a.page.waitForTimeout(600);
  const invKeys = [...store.keys()].filter(k => k.startsWith('werkzeugmanagement|inv:'));
  ok(invKeys.length === 1, 'Inventur-Lauf als Cloud-Record (inv:)');
  const inv = store.get(invKeys[0]);
  ok(inv && inv.data && inv.data.orgId === 'org_a', 'Lauf trägt die Org');
  await a.ctx.close();

  const b = await device('u8', 'if_werkzeug.html');   // Desktop derselben Org
  await b.page.waitForTimeout(2200);
  ok(await b.page.evaluate(() => !!window._wzGetActiveInventur()), 'Zweitgerät sieht den laufenden Inventur-Lauf');
  const f = await device('u3', 'if_werkzeug.html');   // fremde Org
  await f.page.waitForTimeout(2200);
  ok(await f.page.evaluate(() => !window._wzGetActiveInventur()), 'fremde Org sieht den Lauf NICHT');
  await b.ctx.close(); await f.ctx.close();
}

await browser.close(); server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' Checks bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
