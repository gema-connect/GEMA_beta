// Werkzeugmanagement — Sammel-Ausleihe der markierten Auswahl
// (User-Wunsch 28.08.2026: «bei werkzeugmanagement, soll man die gesamte
// auswahl auch an jemand ausleihen können»).
//
// Vorher bot die Sammel-Leiste nur Bearbeiten/Status/Zuweisen/Etiketten —
// ausgeliehen wurde ausschliesslich Gerät für Gerät über den 🔄-Knopf.
//
//   A) Knopf «🔄 Ausleihen» ist in der Leiste und folgt dem disabled-Muster.
//   B) Der Dialog listet, WAS mitgeht — und benennt mit Grund, was NICHT
//      mitgeht (bereits ausgeliehen / Einbuchung ausstehend). Nie still.
//   C) Speichern setzt ausgeliehenAn={userId,name,seit} auf jedes Gerät,
//      loggt pro Gerät und schickt GENAU EINE Sammel-Notifikation.
//   D) Ein markierter Koffer geht MIT seinem Inhalt (viaKoffer) — ein bereits
//      ausgeliehenes Teil bleibt dabei liegen und wird gezählt.
//   E) Ein Teil, das über seinen Koffer mitgeht, wird NICHT zweimal vergeben
//      (es behaelt viaKoffer) — auch wenn es zusaetzlich einzeln markiert ist.
//   F) Guards: ohne Berechtigung passiert nichts; ist NICHTS ausleihbar,
//      kommt eine Meldung statt eines leeren Dialogs.
//   G) Der Monteur sieht die Sammel-Auswahl gar nicht (Hard-Lock).
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_sammel_ausleihe_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8931;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/if_werkzeug.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST ──────────────────────────────────────────────
const store = new Map();
function likeToRe(p) {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*/g, '.*').replace(/_/g, '.') + '$');
}
function handleSb(route) {
  const req = route.request();
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mkEq = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
  const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|');
      const m = k.slice(0, i), d = k.slice(i + 1);
      if (mkEq && m !== mkEq) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike && !likeToRe(dkLike).test(d)) continue;
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
// t_a/t_b frei · t_c bereits an Anna ausgeliehen · t_d mit ausstehender
// Einbuchung · k_1 traegt t_e (frei) und t_f (bereits ausgeliehen).
const TOOLS = [
  { id: 't_1700000000001_a', name: 'Bohrhammer', cat: 'bohrmaschine', brand: 'Hilti', bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1700000000002_b', name: 'Zange',      cat: 'handwerkzeug', brand: 'Knipex', bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1700000000003_c', name: 'Messgerät',  cat: 'messgeraet',   brand: 'Testo',  bought: '2025-01-10', orgId: 'org_t',
    ausgeliehenAn: { userId: 'u_anna', name: 'Anna A', seit: '2026-08-01' } },
  { id: 't_1700000000004_d', name: 'Neugerät',   cat: 'handwerkzeug', brand: 'Bosch',  bought: '2025-01-10', orgId: 'org_t',
    einbuchung: { status: 'vorgeschlagen', lieferantId: 'lf_1', lieferantFirma: 'Lief AG', eingebuchtAm: '2026-08-01' } },
  { id: 't_1700000000005_e', name: 'Akku 5.2Ah', cat: 'ladegeraet',   brand: 'Hilti',  bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1700000000006_f', name: 'Ladegerät',  cat: 'ladegeraet',   brand: 'Hilti',  bought: '2025-01-10', orgId: 'org_t',
    ausgeliehenAn: { userId: 'u_anna', name: 'Anna A', seit: '2026-08-01' } },
  { id: 'k_1700000000010_k', name: 'Bohrhammer-Set', cat: 'koffer', bought: '2025-01-10', orgId: 'org_t',
    kofferInhalt: ['t_1700000000005_e', 't_1700000000006_f'] }
];
const A = 't_1700000000001_a', B = 't_1700000000002_b', C = 't_1700000000003_c',
      D = 't_1700000000004_d', E = 't_1700000000005_e', F = 't_1700000000006_f',
      KOF = 'k_1700000000010_k';
function seedStore() {
  store.clear();
  TOOLS.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-08-01T00:00:00Z' }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const U_MAG  = { id: 'u_mag',  username: 'mag@t.ch',  name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
const U_MON  = { id: 'u_mon',  username: 'mon@t.ch',  name: 'Monteur M',   roleIds: ['role_monteur'],   orgId: 'org_t', active: true, profile: { email: 'mon@t.ch' } };
const U_BEN  = { id: 'u_ben',  username: 'ben@t.ch',  name: 'Ben Beck',    roleIds: ['role_monteur'],   orgId: 'org_t', active: true, profile: { email: 'ben@t.ch' } };
const U_ANNA = { id: 'u_anna', username: 'anna@t.ch', name: 'Anna A',      roleIds: ['role_monteur'],   orgId: 'org_t', active: true, profile: { email: 'anna@t.ch' } };
const klassisch = u => Object.assign({}, u, { profile: Object.assign({}, u.profile, { nativeAnsicht: false }) });

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(opts) {
  opts = opts || {};
  const user = opts.user || klassisch(U_MAG);
  const ctx = await browser.newContext({});
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const seed = {
    gema_orgs_v1: [ORG],
    gema_users_v1: [klassisch(U_MAG), U_MON, U_BEN, U_ANNA],
    gema_session_v1: { token: 'x.y.z', userId: user.id, expires: FUTURE },
    gema_coachmarks_done_if_werkzeug: '1'
  };
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  // Notifikationen mitschneiden statt sie zu verschlucken
  await page.addInitScript(() => { window.__notifs = []; });
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    if (typeof GemaNotify !== 'undefined') {
      const orig = GemaNotify.push;
      GemaNotify.push = function (o) { window.__notifs.push(o); return orig ? orig.call(GemaNotify, o) : null; };
    }
  });
  return { ctx, page };
}
const markiere = (page, ids) => page.evaluate(list => {
  if (!_wzBulkMode) _wzToggleBulkMode();
  list.forEach(id => { if (!_wzBulkSelected[id]) _wzBulkToggle(id); });
  return Object.keys(_wzBulkSelected).length;
}, ids);
const tool = (page, id) => page.evaluate(i => {
  const t = tools.find(x => x.id === i);
  return t ? { name: t.name, aus: t.ausgeliehenAn || null } : null;
}, id);

// ══════════════════════════════════════════════════════════════════
console.log('— A) Der Knopf steht in der Sammel-Leiste —');
{
  seedStore();
  const { ctx, page } = await openPage();
  const leer = await page.evaluate(() => { _wzToggleBulkMode(); const b = document.getElementById('wzBulkBar'); return b ? b.innerHTML : ''; });
  ok(/_wzBulkAusleihe\(\)/.test(leer), 'die Leiste traegt den Knopf «🔄 Ausleihen»');
  ok(/_wzBulkAusleihe\(\)"\s+disabled/.test(leer), 'ohne Auswahl ist er deaktiviert (disabled)');
  await markiere(page, [A]);
  const mit = await page.evaluate(() => document.getElementById('wzBulkBar').innerHTML);
  ok(!/_wzBulkAusleihe\(\)"\s+disabled/.test(mit), 'mit Auswahl ist er bedienbar');
  const pos = await page.evaluate(() => {
    const h = document.getElementById('wzBulkBar').innerHTML;
    return { zuw: h.indexOf('_wzBulkAssign()'), aus: h.indexOf('_wzBulkAusleihe()'), etik: h.indexOf('_wzExportEtikettenBulk()') };
  });
  ok(pos.zuw >= 0 && pos.aus > pos.zuw, 'er steht NACH «Person zuweisen»');
  ok(pos.etik < 0 || pos.aus < pos.etik, 'und VOR «🏷 Etiketten»');
  ok(page.errs.length === 0, 'kein pageerror (' + page.errs.join(' | ') + ')');
  await ctx.close();
}

console.log('— B) Der Dialog benennt, was NICHT mitgeht —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await markiere(page, [A, B, C, D]);
  await page.evaluate(() => _wzBulkAusleihe());
  await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => {
    const el = document.getElementById('_wzModalOverlay') || document.querySelector('.dlg-card');
    return el ? el.textContent.replace(/\s+/g, ' ') : '';
  });
  ok(/Sammel-Ausleihe/.test(dlg), 'der Dialog ist offen');
  ok(/Bohrhammer/.test(dlg) && /Zange/.test(dlg), 'die ausleihbaren Geraete stehen als Liste drin');
  ok(/2 Ger(ä|a)t/.test(dlg), 'der Kopf nennt die Zahl der Geraete (2)');
  ok(/Messger(ä|a)t/.test(dlg) && /bereits ausgeliehen an Anna A/.test(dlg), 'das ausgeliehene Geraet steht MIT Grund im Sperr-Block');
  ok(/Neuger(ä|a)t/.test(dlg) && /Einbuchung noch nicht akzeptiert/.test(dlg), 'die ausstehende Einbuchung steht MIT Grund im Sperr-Block');
  const users = await page.evaluate(() => Array.from(document.querySelectorAll('#bulkLendUser option')).map(o => o.textContent));
  ok(users.some(u => /Ben Beck/.test(u)), 'der Personen-Picker listet die Org-Personen');
  await ctx.close();
}

console.log('— C) Ausleihen setzt die Felder, loggt und meldet EINMAL —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await markiere(page, [A, B, C]);
  await page.evaluate(() => _wzBulkAusleihe());
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById('bulkLendUser').value = 'u_ben'; _wzBulkAusleiheSave(); });
  await page.waitForTimeout(400);

  const a = await tool(page, A), b = await tool(page, B), c = await tool(page, C);
  const heute = new Date().toISOString().split('T')[0];
  ok(a.aus && a.aus.userId === 'u_ben' && a.aus.name === 'Ben Beck', 'Geraet 1 ist an Ben ausgeliehen');
  ok(a.aus && a.aus.seit === heute, 'das seit-Datum ist heute (' + (a.aus && a.aus.seit) + ')');
  ok(!a.aus.viaKoffer, 'ein Einzelgeraet traegt KEIN viaKoffer');
  ok(b.aus && b.aus.userId === 'u_ben', 'Geraet 2 ebenfalls');
  ok(c.aus && c.aus.userId === 'u_anna', 'das bereits ausgeliehene Geraet bleibt UNANGETASTET bei Anna');

  const n = await page.evaluate(() => window.__notifs.filter(o => o && o.eventKey === 'werkzeug_zuweisung'));
  ok(n.length === 1, 'GENAU EINE Sammel-Notifikation statt einer pro Geraet (' + n.length + ')');
  ok(n[0] && n[0].empfaengerUserId === 'u_ben', 'sie geht an den Ausleiher');
  ok(n[0] && /2 Werkzeuge ausgeliehen/.test(n[0].titel || ''), 'ihr Titel nennt die Zahl («' + (n[0] && n[0].titel) + '»)');

  const bulkAus = await page.evaluate(() => !!document.getElementById('wzBulkBar') || !!Object.keys(_wzBulkSelected).length);
  ok(!bulkAus, 'der Sammel-Modus ist danach beendet');
  // In der Cloud angekommen?
  const cloudA = store.get('werkzeugmanagement|tool:' + A);
  ok(cloudA && cloudA.data && cloudA.data.ausgeliehenAn && cloudA.data.ausgeliehenAn.userId === 'u_ben', 'die Ausleihe ist in der Cloud gespeichert');
  ok(page.errs.length === 0, 'kein pageerror (' + page.errs.join(' | ') + ')');
  await ctx.close();
}

console.log('— D) Ein Koffer geht MIT seinem Inhalt —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await markiere(page, [KOF]);
  await page.evaluate(() => _wzBulkAusleihe());
  await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => (document.querySelector('.dlg-card') || {}).textContent.replace(/\s+/g, ' '));
  ok(/inkl\. 1 Teil/.test(dlg), 'der Dialog sagt, wie viele Teile mitgehen (1 von 2)');
  ok(/1 Teil.*(gehen|geht) nicht mit/.test(dlg), 'und benennt, dass 1 Teil NICHT mitgeht');
  ok(/eigenen 🔄-Knopf/.test(dlg), 'der Ausweg auf die Koffer-Ausleihe mit Checkliste steht da');

  await page.evaluate(() => { document.getElementById('bulkLendUser').value = 'u_ben'; _wzBulkAusleiheSave(); });
  await page.waitForTimeout(400);
  const k = await tool(page, KOF), e = await tool(page, E), f = await tool(page, F);
  ok(k.aus && k.aus.userId === 'u_ben', 'der Koffer ist ausgeliehen');
  ok(e.aus && e.aus.userId === 'u_ben' && e.aus.viaKoffer === KOF, 'das freie Teil geht MIT viaKoffer mit');
  ok(f.aus && f.aus.userId === 'u_anna' && !f.aus.viaKoffer, 'das bereits ausgeliehene Teil bleibt bei Anna');
  const n = await page.evaluate(() => window.__notifs.filter(o => o && o.eventKey === 'werkzeug_zuweisung'));
  ok(n.length === 1 && /1 Koffer-Teil/.test(n[0].text || ''), 'die Notifikation weist die Koffer-Teile aus');
  await ctx.close();
}

console.log('— E) Kein Teil wird zweimal vergeben —');
{
  seedStore();
  const { ctx, page } = await openPage();
  // Koffer UND sein freies Teil zusammen markieren
  await markiere(page, [KOF, E]);
  const plan = await page.evaluate(() => {
    const p = _wzBulkLendPlan();
    return { offen: p.offen.map(t => t.id), koffer: p.koffer.map(k => k.k.id), teile: p.teile };
  });
  ok(plan.offen.indexOf(E) < 0, 'das Teil steht NICHT zusaetzlich in der Einzel-Liste');
  ok(plan.koffer.length === 1 && plan.teile === 1, 'es geht ausschliesslich ueber seinen Koffer mit');
  await page.evaluate(() => _wzBulkAusleihe());
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.getElementById('bulkLendUser').value = 'u_ben'; _wzBulkAusleiheSave(); });
  await page.waitForTimeout(400);
  const e = await tool(page, E);
  ok(e.aus && e.aus.viaKoffer === KOF, 'es behaelt sein viaKoffer (die Koffer-Rueckgabe findet es damit)');

  // Gegenprobe: das Teil ALLEIN markiert (ohne seinen Koffer) geht einzeln
  seedStore();
  const { ctx: c2, page: p2 } = await openPage();
  await markiere(p2, [E]);
  await p2.evaluate(() => _wzBulkAusleihe());
  await p2.waitForTimeout(200);
  await p2.evaluate(() => { document.getElementById('bulkLendUser').value = 'u_ben'; _wzBulkAusleiheSave(); });
  await p2.waitForTimeout(400);
  const e2 = await tool(p2, E), k2 = await tool(p2, KOF);
  ok(e2.aus && e2.aus.userId === 'u_ben' && !e2.aus.viaKoffer, 'Gegenprobe: allein markiert geht es OHNE viaKoffer');
  ok(!k2.aus, 'und sein Koffer bleibt im Lager');
  await c2.close();
  await ctx.close();
}

console.log('— F) Guards —');
{
  seedStore();
  const { ctx, page } = await openPage();
  // Nichts ausleihbar → Meldung statt leerem Dialog
  await markiere(page, [C, D]);
  await page.evaluate(() => { window.__alert = null; if (typeof GemaDialog !== 'undefined') GemaDialog.alert = o => { window.__alert = o; return Promise.resolve(true); }; _wzBulkAusleihe(); });
  await page.waitForTimeout(250);
  const al = await page.evaluate(() => window.__alert);
  ok(al && /Nichts ausleihbar/.test(al.title || ''), 'nichts ausleihbar → klare Meldung');
  ok(al && /bereits ausgeliehen an Anna A/.test(al.message || '') && /Einbuchung/.test(al.message || ''), 'die Meldung nennt JEDEN Grund');
  const offen = await page.evaluate(() => !!document.querySelector('#bulkLendUser'));
  ok(!offen, 'es oeffnet sich KEIN leerer Ausleih-Dialog');

  // Ohne Person: kein Schreibvorgang
  await page.evaluate(id => { _wzBulkSelected = {}; _wzBulkSelected[id] = true; _wzBulkAusleihe(); }, A);
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.alert = () => {}; document.getElementById('bulkLendUser').value = ''; _wzBulkAusleiheSave(); });
  await page.waitForTimeout(300);
  const a = await tool(page, A);
  ok(a && !a.aus, 'ohne gewaehlte Person wird nichts ausgeliehen');
  await ctx.close();
}

console.log('— G) Monteur: kein Sammel-Modus, kein Sammel-Ausleihen —');
{
  seedStore();
  const { ctx, page } = await openPage({ user: klassisch(U_MON) });
  const r = await page.evaluate(() => {
    _wzToggleBulkMode();
    return { bulk: !!_wzBulkMode, bar: !!document.getElementById('wzBulkBar'), knopf: getComputedStyle(document.getElementById('btnBulkMode')).display };
  });
  ok(!r.bulk && !r.bar, 'der Monteur kann den Sammel-Modus nicht starten (Hard-Lock)');
  ok(r.knopf === 'none', 'der «☑ Auswählen»-Knopf ist fuer ihn ausgeblendet');
  // Defense in Depth: direkter Aufruf schreibt nichts
  await page.evaluate(id => { window.alert = () => {}; _wzBulkSelected = {}; _wzBulkSelected[id] = true; _wzBulkAusleihe(); }, A);
  await page.waitForTimeout(250);
  const offen = await page.evaluate(() => !!document.querySelector('#bulkLendUser'));
  ok(!offen, 'auch der direkte Aufruf oeffnet keinen Dialog');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' Checks bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
