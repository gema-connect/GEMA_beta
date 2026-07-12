// Playwright-Smoke Immobilienverwaltung (iv_immobilien.html)
// Deckt ab: Verwalter-CRUD (Liegenschaft/Wohnung), Leerstand → Spülmanager-Kopplung
// (spobj/spst-Records, hy_spuelmanager-Sicht), Handwerker-Auftrag an GEMA-Betrieb
// mit Cross-Org-Roundtrip (Notify, Annehmen, Erledigen mit Bericht), Wiedervermietung
// beendet das Spülregime, Zugriffsschutz (Monteur ohne immobilien-read).
//
// Cloud wird als In-Memory-PostgREST-Mock simuliert (POST upsert, GET like/eq,
// DELETE) — damit läuft der echte per-Record-Sync zwischen ZWEI Browser-Kontexten.
//
// Aufruf (benötigt playwright-core + Chromium; ESM sucht node_modules aufwärts —
// z.B. aus einem Ordner mit playwright-core starten):
//   CHROME=<chromium> GEMA_ROOT=<repo> node immobilien_smoke_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8897;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-«Cloud» (PostgREST-Mock) ──────────────────────────────
const cloud = new Map(); // "module_key|data_key" → payload
function cloudRows(moduleKey, likePrefix, eqKey) {
  const out = [];
  for (const [k, payload] of cloud) {
    const [mk, dk] = k.split('|');
    if (mk !== moduleKey) continue;
    if (likePrefix != null && !dk.startsWith(likePrefix)) continue;
    if (eqKey != null && dk !== eqKey) continue;
    out.push({ data_key: dk, payload });
  }
  return out;
}
function handleRest(route) {
  const req = route.request();
  const u = decodeURIComponent(req.url());
  const method = req.method();
  const mk = (u.match(/module_key=eq\.([^&]+)/) || [])[1];
  const like = (u.match(/data_key=like\.([^&]+)/) || [])[1];
  const eqk = (u.match(/data_key=eq\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = cloudRows(mk, like ? like.replace(/\*$/, '') : null, eqk || null);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    try {
      const body = JSON.parse(req.postData() || '[]');
      (Array.isArray(body) ? body : [body]).forEach(r => {
        if (r && r.module_key && r.data_key) cloud.set(r.module_key + '|' + r.data_key, r.payload);
      });
    } catch (e) {}
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  }
  if (method === 'DELETE') {
    if (mk && eqk) cloud.delete(mk + '|' + eqk);
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORGS = [
  { id: 'org_verw', name: 'Hausverwaltung Rhein AG', kategorie: 'immobilien', kategorien: ['immobilien'], admins: ['u_verw'], active: true },
  { id: 'org_hand', name: 'Sanitär Keller GmbH', kategorie: 'sanitaerinstallateur', kategorien: ['sanitaerinstallateur'], admins: ['u_hand'], active: true }
];
const USERS = [
  { id: 'u_verw', username: 'vera@verw.ch', name: 'Vera Verwalterin', roleIds: ['role_immoverwalter'], orgId: 'org_verw', active: true, profile: { email: 'vera@verw.ch' } },
  { id: 'u_hand', username: 'hans@hand.ch', name: 'Hans Keller', roleIds: ['role_unternehmer'], orgId: 'org_hand', active: true, profile: { email: 'hans@hand.ch' } },
  { id: 'u_mont', username: 'mo@verw.ch', name: 'Monti Monteur', roleIds: ['role_monteur'], orgId: 'org_verw', active: true, profile: { email: 'mo@verw.ch' } }
];
function seedFor(userId) {
  return {
    gema_orgs_v1: ORGS, gema_users_v1: USERS,
    gema_session_v1: { userId, expires: FUTURE }
  };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗', label); } };

async function newPage(userId) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) return handleRest(route);
    if (u.indexOf('supabase') >= 0 || u.indexOf('/storage/v1/') >= 0) {
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    }
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  });
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, JSON.stringify(v));
  }, seedFor(userId));
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push(e.message));
  return { ctx, page };
}

// ═══ 1) Verwalterin: Stammdaten + Leerstand + Auftrag ═══
console.log('— Verwalterin (role_immoverwalter) —');
{
  const { ctx, page } = await newPage('u_verw');
  await page.goto(BASE + '/iv_immobilien.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  ok(await page.evaluate(() => !!document.getElementById('ivTabs') && document.querySelectorAll('#ivTabs .vtab').length === 5), 'Seite geladen, 5 Verwalter-Tabs');

  // Liegenschaft via UI
  await page.evaluate(() => ivLgNeu());
  await page.fill('#lg_name', 'MFH Musterstrasse 12');
  await page.fill('#lg_strasse', 'Musterstrasse 12');
  await page.fill('#lg_plz', '4051');
  await page.fill('#lg_ort', 'Basel');
  await page.evaluate(() => ivLgSave());
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('gema_im_lg_pool_v1') || '[]').length === 1), 'Liegenschaft gespeichert');

  // Wohnung via UI
  await page.evaluate(() => { ivTab('whg'); ivWhgNeu(); });
  await page.fill('#wg_bez', '3. OG links');
  await page.fill('#wg_netto', '1650');
  await page.fill('#wg_nk', '220');
  await page.evaluate(() => ivWhgSave());
  await page.waitForTimeout(300);
  const whgId = await page.evaluate(() => (JSON.parse(localStorage.getItem('gema_im_whg_pool_v1') || '[]')[0] || {}).id);
  ok(!!whgId, 'Wohnung gespeichert');

  // Leerstand melden → Spülmanager-Kopplung
  await page.evaluate(id => ivLeerstandOpen(id), whgId);
  await page.fill('#le_interval', '7');
  await page.evaluate(() => ivLeerstandSave());
  await page.waitForTimeout(500);
  const spuel = await page.evaluate(() => {
    const objs = JSON.parse(localStorage.getItem('gema_sp_obj_pool_v1') || '[]');
    const st = JSON.parse(localStorage.getItem('gema_sp_stellen_pool_v1') || '[]');
    const w = JSON.parse(localStorage.getItem('gema_im_whg_pool_v1') || '[]')[0];
    return { objs, stellen: st.length, whgStatus: w.status, spuelObjId: w.leerstand && w.leerstand.spuelObjId };
  });
  ok(spuel.objs.length === 1 && spuel.objs[0].typ === 'leerstand' && spuel.objs[0].intervalTage === 7, 'Spülobjekt Typ «leerstand», Intervall 7 Tage');
  ok(spuel.objs[0].aktiv === true && spuel.objs[0].name.indexOf('Leerwohnung') === 0, 'Spülobjekt aktiv, Name «Leerwohnung …»');
  ok(spuel.stellen === 3, '3 Spülstellen (Küche/Bad/WC)');
  ok(spuel.whgStatus === 'leer' && spuel.spuelObjId === spuel.objs[0].id, 'Wohnung leer + mit Spülobjekt verknüpft');
  ok(cloud.has('spuelmanager|spobj:' + spuel.objs[0].id), 'Spülobjekt in der Cloud (moduleKey spuelmanager)');
  ok(cloudRows('spuelmanager', 'spst:').length === 3, 'Spülstellen in der Cloud');
  ok([...cloud.keys()].some(k => k.startsWith('notify|notif:')), 'spuel_aktiviert-Notify in der Cloud');

  // Auftrag an GEMA-Handwerker
  await page.evaluate(() => { ivTab('auf'); ivAufNeu(); });
  const hwOpts = await page.evaluate(() => Array.from(document.querySelectorAll('#af_hwUser option')).map(o => o.textContent));
  ok(hwOpts.some(t => t.indexOf('Sanitär Keller GmbH') >= 0), 'GEMA-Handwerker-Dropdown zeigt Betrieb (GEMA-weit)');
  await page.fill('#af_titel', 'Geschirrspüler defekt');
  await page.fill('#af_besch', 'Küche tropft, Mieter erreichbar ab 17 Uhr');
  await page.selectOption('#af_hwUser', 'u_hand');
  await page.evaluate(() => ivAufSave(true)); // direkt beauftragen
  await page.waitForTimeout(500);
  const auf = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_im_auf_pool_v1') || '[]')[0]);
  ok(auf && auf.nr === 'HW-' + new Date().getFullYear() + '-001' && auf.status === 'beauftragt', 'Auftrag beauftragt, Nr ' + (auf && auf.nr));
  ok(auf.handwerker.typ === 'gema' && auf.handwerker.userId === 'u_hand', 'GEMA-Handwerker verknüpft');
  ok(auf.adresse.indexOf('Musterstrasse 12') >= 0, 'Adresse denormalisiert im Auftrag');
  const notifNeu = [...cloud.entries()].filter(([k]) => k.startsWith('notify|notif:')).map(([, p]) => p.data).find(d => d && d.eventKey === 'immo_auftrag_neu');
  ok(notifNeu && notifNeu.empfaengerUserId === 'u_hand' && notifNeu.link.indexOf('iv_immobilien.html?auf=') === 0, 'immo_auftrag_neu an Handwerker mit Deep-Link');
  ok(page.errs.length === 0, 'keine pageerrors (Verwalterin)' + (page.errs.length ? ': ' + page.errs[0] : ''));
  await ctx.close();
}

// ═══ 2) Handwerker: Cross-Org-Sicht + Annehmen + Erledigen ═══
console.log('— Handwerker (role_unternehmer, fremde Org) —');
{
  const { ctx, page } = await newPage('u_hand');
  await page.goto(BASE + '/iv_immobilien.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const panel = await page.evaluate(() => (document.getElementById('ivTasks') || {}).textContent || '');
  ok(panel.indexOf('Meine Handwerker-Aufträge') >= 0 && panel.indexOf('Geschirrspüler defekt') >= 0, 'Panel «Meine Aufträge» zeigt Cross-Org-Auftrag');
  ok(await page.evaluate(() => document.querySelectorAll('#ivTabs .vtab').length === 0), 'Keine Verwalter-Tabs für reinen Handwerker');
  const aufId = await page.evaluate(() => (GemaSync.getCached('gema_im_auf_pool_v1')[0] || {}).id);
  await page.evaluate(id => ivAufAnnehmen(id), aufId);
  await page.waitForTimeout(300);
  ok(cloud.get('immobilien|imauf:' + aufId).data.status === 'in_arbeit', 'Annehmen → in_arbeit (Cloud)');
  await page.evaluate(id => ivAufErledigtOpen(id), aufId);
  await page.fill('#er_bericht', 'Zulaufschlauch ersetzt, dicht.');
  await page.evaluate(() => ivAufErledigtSave());
  await page.waitForTimeout(300);
  const cloudAuf = cloud.get('immobilien|imauf:' + aufId).data;
  ok(cloudAuf.status === 'erledigt' && cloudAuf.bericht.indexOf('Zulaufschlauch') === 0, 'Erledigt mit Arbeitsbericht (Cloud)');
  const notifStat = [...cloud.entries()].filter(([k]) => k.startsWith('notify|notif:')).map(([, p]) => p.data).filter(d => d && d.eventKey === 'immo_auftrag_status');
  ok(notifStat.length >= 2 && notifStat.every(d => d.empfaengerUserId === 'u_verw'), 'Status-Notifys (angenommen+erledigt) an Verwalterin');
  ok(page.errs.length === 0, 'keine pageerrors (Handwerker)' + (page.errs.length ? ': ' + page.errs[0] : ''));
  await ctx.close();
}

// ═══ 3) Verwalterin: Ergebnis + Wiedervermietung + Spülmanager-Sicht ═══
console.log('— Verwalterin: Rückmeldung + Wiedervermietung —');
{
  const { ctx, page } = await newPage('u_verw');
  await page.goto(BASE + '/iv_immobilien.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const st = await page.evaluate(() => {
    const a = GemaSync.getCached('gema_im_auf_pool_v1')[0];
    return { status: a.status, bericht: a.bericht, verlauf: a.verlauf.length };
  });
  ok(st.status === 'erledigt' && st.bericht.indexOf('Zulaufschlauch') === 0 && st.verlauf >= 4, 'Erledigt-Status + Bericht + Verlauf beim Verwalter angekommen');

  // Fälligkeits-Badge (nie gespült = fällig)
  await page.evaluate(() => ivTab('whg'));
  const badge = await page.evaluate(() => document.getElementById('ivWrap').textContent);
  ok(badge.indexOf('Spülung(en) fällig') >= 0, 'Fälligkeits-Badge «Spülung fällig» auf der Leerwohnung');

  // Spülmanager-Sicht der Verwalterin (neue Rolle: read+write)
  await page.goto(BASE + '/hy_spuelmanager.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const spBody = await page.evaluate(() => document.body.textContent || '');
  ok(spBody.indexOf('Kein Zugriff') < 0 && spBody.indexOf('Leerwohnung') >= 0, 'hy_spuelmanager zeigt das Leerstand-Spülobjekt (Rollen-Zugriff ok)');

  // Wiedervermietung beendet das Spülregime
  await page.goto(BASE + '/iv_immobilien.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const whgId = await page.evaluate(() => (GemaSync.getCached('gema_im_whg_pool_v1')[0] || {}).id);
  await page.evaluate(id => ivVermietet(id), whgId);
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.gema-dlg-bg button')).find(x => /Vermietet/.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.gema-dlg-bg button')).find(x => /Abbrechen/.test(x.textContent)); if (b) b.click(); }); // MV-Erfassen-Angebot ablehnen
  await page.waitForTimeout(300);
  const nachher = await page.evaluate(() => ({
    whg: GemaSync.getCached('gema_im_whg_pool_v1')[0],
    sp: GemaSync.getCached('gema_sp_obj_pool_v1')[0]
  }));
  ok(nachher.whg.status === 'vermietet' && !nachher.whg.leerstand, 'Wohnung wieder vermietet, Leerstand entfernt');
  ok(nachher.sp.aktiv === false && !!nachher.sp.beendetAm, 'Spülobjekt beendet (aktiv=false + beendetAm)');
  const cloudSp = cloud.get('spuelmanager|spobj:' + nachher.sp.id).data;
  ok(cloudSp.aktiv === false, 'Beendigung in der Cloud angekommen');
  ok(page.errs.length === 0, 'keine pageerrors (Wiedervermietung)' + (page.errs.length ? ': ' + page.errs[0] : ''));
  await ctx.close();
}

// ═══ 4) Zugriffsschutz: Monteur ohne immobilien-read ═══
console.log('— Monteur (kein immobilien-Zugriff) —');
{
  const { ctx, page } = await newPage('u_mont');
  await page.goto(BASE + '/iv_immobilien.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const body = await page.evaluate(() => document.body.textContent || '');
  ok(body.indexOf('Kein Zugriff') >= 0 || !(await page.evaluate(() => !!document.getElementById('ivTabs'))), 'Monteur: «Kein Zugriff»-Screen');
  await ctx.close();
}

console.log(pass + ' passed, ' + fail + ' failed');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
