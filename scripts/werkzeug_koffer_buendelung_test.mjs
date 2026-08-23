// Werkzeugmanagement — Koffer-Buendelung in der Liste
// (User-Wunsch 23.08.2026: «Es sollen aber die Werkzeuge, welche in einem
// Koffer sind, beim jeweiligen Koffer gebuendelt sein … Man soll den Koffer
// aufklappen koennen … Standardmaessig soll der Koffer aufgeklappt sein. Man
// soll diese aber in den Einstellungen einstellen koennen … Ebenso soll man
// die Kofferbuendelung standardmaessig einstellen koennen … oder die
// Standardreihenfolge mit dem neuesten Werkzeug zuoberst ohne Buendelung.»)
//
//   A) Engine _wzGruppen — Gruppierung, Reihenfolge, Buendelung aus.
//   B) Auf/Zu ist Geraete-UI: Org-Standard, bewusstes Umschalten gewinnt,
//      ueberlebt den Reload (localStorage), NIE am Datensatz.
//   C) Karten-Ansicht: Gruppe .wz-kgrp, zugeklappt keine Teile, kein Duplikat.
//   D) Kompakte Liste: .wz-lsub + Auf-/Zu-Knopf.
//   E) Tabelle: tr.wz-tsub + Auf-/Zu-Knopf.
//   F) KEIN Teil verschwindet, wenn sein Koffer weggefiltert ist.
//   G) Ehrliche Zahlen: «N von M Teilen» + Hinweis bei 0 sichtbaren Teilen.
//   H) Einstellungen: beide Selects speichern und wirken; der Startwert ist
//      ohne Buendelung gesperrt (live, nicht erst nach dem Speichern).
//   I) Handy-Ansicht: gruppiert, Toggle klappt zu OHNE das Detail zu oeffnen.
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_koffer_buendelung_test.mjs
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
// Die ids tragen aufsteigende Zeitstempel — die Standard-Sortierung 'neu'
// liest sie (_wzCreatedTs) und stellt das NEUESTE zuoberst.
const TOOLS = [
  { id: 't_1700000000001_akku',  name: 'Akku 5.2Ah',   cat: 'ladegeraet',   brand: 'Hilti',  model: 'B22', internKennung: 'WZ-101', bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1700000000002_lade',  name: 'Ladegerät C4', cat: 'ladegeraet',   brand: 'Hilti',  model: 'C4',  bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1700000000003_frei',  name: 'Zange',        cat: 'handwerkzeug', brand: 'Knipex', model: 'K1',  bought: '2025-03-01', orgId: 'org_t' },
  { id: 'k_1700000000010_kof',   name: 'Bohrhammer-Set', cat: 'koffer', internKennung: 'KOF-01', bought: '2025-01-10', orgId: 'org_t',
    kofferInhalt: ['t_1700000000001_akku', 't_1700000000002_lade'] },
  { id: 'k_1700000000011_leer',  name: 'Leerkoffer',   cat: 'koffer', bought: '2025-02-01', orgId: 'org_t', kofferInhalt: [] },
  { id: 't_1700000000012_neu',   name: 'Bohrmaschine', cat: 'handwerkzeug', brand: 'Bosch', model: 'GSB',  bought: '2025-06-01', orgId: 'org_t' }
];
const AKKU = 't_1700000000001_akku', LADE = 't_1700000000002_lade', FREI = 't_1700000000003_frei',
      KOF = 'k_1700000000010_kof', LEER = 'k_1700000000011_leer', NEU = 't_1700000000012_neu';

function seedStore(orgSettings) {
  store.clear();
  TOOLS.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-08-01T00:00:00Z' }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const mkOrg = wz => ({ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_mag'], active: true, settings: wz ? { werkzeug: wz } : {} });
const U_MAG = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
const klassisch = u => Object.assign({}, u, { profile: Object.assign({}, u.profile, { nativeAnsicht: false }) });
const nativ = u => Object.assign({}, u, { profile: Object.assign({}, u.profile, { nativeAnsicht: true }) });

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(opts) {
  opts = opts || {};
  const user = opts.user || klassisch(U_MAG);
  const ctx = await browser.newContext(opts.viewport ? { viewport: opts.viewport, isMobile: !!opts.mobile, hasTouch: !!opts.mobile } : {});
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const seed = {
    gema_orgs_v1: [mkOrg(opts.wz)], gema_users_v1: [user],
    gema_session_v1: { token: 'x.y.z', userId: user.id, expires: FUTURE },
    gema_coachmarks_done_if_werkzeug: '1',
    gema_wz_view_v1: opts.view || 'cards'
  };
  if (opts.extra) Object.assign(seed, opts.extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html' + (opts.query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}

// ══════════════════════════════════════════════════════════════════
console.log('— A) Engine _wzGruppen —');
{
  seedStore();
  const { ctx, page } = await openPage();
  ok(page.errs.length === 0, 'Boot ohne pageerror' + (page.errs[0] ? ' (' + page.errs[0] + ')' : ''));

  const g = await page.evaluate(() => _wzGruppen(getFiltered()).map(x => ({
    typ: x.typ, id: x.tool.id, items: (x.items || []).map(t => t.id), gesamt: x.gesamt || 0, offen: !!x.offen
  })));
  const kof = g.find(x => x.id === 'k_1700000000010_kof');
  ok(!!kof && kof.typ === 'koffer', 'der Koffer ist eine eigene Gruppe');
  ok(kof && kof.items.length === 2, 'beide Teile haengen an ihrer Gruppe (' + (kof ? kof.items.length : '—') + ')');
  ok(kof && kof.gesamt === 2, 'gesamt = 2 (alle Teile des Koffers)');
  ok(kof && kof.offen === true, 'Standard ist AUFGEKLAPPT (ohne Org-Einstellung)');
  ok(!g.some(x => x.typ === 'tool' && (x.id === AKKU || x.id === LADE)), 'kein Koffer-Teil steht zusaetzlich im Fluss (kein Duplikat)');
  ok(g.some(x => x.typ === 'tool' && x.id === FREI), 'ein Werkzeug ohne Koffer bleibt eine normale Zeile');
  const leer = g.find(x => x.id === LEER);
  ok(!!leer && leer.gesamt === 0, 'ein leerer Koffer ist eine Gruppe ohne Teile (gesamt 0)');

  // Die Gruppierung ordnet nur UM — sie sortiert NICHT neu: die Reihenfolge
  // der Gruppen-Koepfe ist die Sortier-Reihenfolge ohne die eingerueckten Teile.
  const flach = await page.evaluate(() => getFiltered().map(t => t.id));
  const kinder = kof ? kof.items : [];
  const ohneKinder = flach.filter(id => kinder.indexOf(id) < 0);
  ok(JSON.stringify(g.map(x => x.id)) === JSON.stringify(ohneKinder),
    'Sortier-Wahrheit unangetastet — nur umgeordnet, nie neu sortiert');

  // Gegenprobe: Buendelung aus → alles flach, exakt die Sortier-Reihenfolge.
  const flat = await page.evaluate(() => {
    // Wie die App speichern — getCurrentOrg() liefert bei jedem Aufruf ein
    // frisch geparstes Objekt, eine In-Place-Mutation verpufft.
    const orgs = GemaAuth.getOrgs(); const o = orgs.find(x => x.id === 'org_t');
    o.settings = o.settings || {};
    o.settings.werkzeug = Object.assign({}, o.settings.werkzeug, { kofferBuendeln: false });
    GemaAuth.saveOrgs(orgs);
    return _wzGruppen(getFiltered()).map(x => ({ typ: x.typ, id: x.tool.id }));
  });
  ok(flat.every(x => x.typ === 'tool'), 'Gegenprobe: ohne Buendelung gibt es KEINE Koffer-Gruppe');
  ok(JSON.stringify(flat.map(x => x.id)) === JSON.stringify(flach), 'ohne Buendelung exakt die Standard-Reihenfolge');
  await ctx.close();
}

console.log('— B) Auf/Zu ist Geraete-UI —');
{
  seedStore();
  // Org-Standard «zugeklappt»
  const { ctx, page } = await openPage({ wz: { kofferOffen: false } });
  ok(await page.evaluate(k => _wzKofOffen(k) === false, KOF), 'Org-Standard «zugeklappt» wirkt');
  await page.evaluate(k => _wzKofToggle(k), KOF);
  await page.waitForTimeout(150);
  ok(await page.evaluate(k => _wzKofOffen(k) === true, KOF), 'bewusstes Aufklappen gewinnt ueber den Standard');
  const ls = await page.evaluate(() => localStorage.getItem('gema_wz_kofferfold_v1') || '');
  ok(/k_1700000000010_kof/.test(ls) && /true/.test(ls), 'die Wahl liegt im Geraete-Speicher (gema_wz_kofferfold_v1)');
  const amRecord = await page.evaluate(k => {
    const t = (tools || []).find(x => x.id === k) || {};
    return Object.keys(t).some(f => /offen|fold|zuge/i.test(f));
  }, KOF);
  ok(!amRecord, 'der Zustand haengt NICHT am Datensatz (kein Feld am Werkzeug)');
  ok(await page.evaluate(k => _wzKofOffen(k) !== _wzKofOffen('k_1700000000011_leer'), KOF), 'der zweite Koffer folgt weiter dem Standard (pro Koffer gemerkt)');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1300);
  ok(await page.evaluate(k => _wzKofOffen(k) === true, KOF), 'die Wahl ueberlebt den Reload');
  await ctx.close();
}

console.log('— C) Karten-Ansicht —');
{
  seedStore();
  const { ctx, page } = await openPage({ view: 'cards' });
  const m1 = await page.evaluate(() => {
    const grp = document.querySelector('#cardGrid .wz-kgrp');
    return {
      gruppen: document.querySelectorAll('#cardGrid .wz-kgrp').length,
      kofInGrp: !!(grp && grp.querySelector('[data-bulk-id="k_1700000000010_kof"]')),
      teileInGrp: grp ? grp.querySelectorAll('.wz-kgrp-bd [data-bulk-id]').length : -1,
      akkuGesamt: document.querySelectorAll('#cardGrid [data-bulk-id="t_1700000000001_akku"]').length,
      freiAussen: !!document.querySelector('#cardGrid > [data-bulk-id="t_1700000000003_frei"]'),
      toggle: !!(grp && grp.querySelector('.wz-koftg'))
    };
  });
  ok(m1.gruppen === 1, 'nur der Koffer MIT Teilen wird zum Gruppen-Kasten (.wz-kgrp)');
  ok(await page.evaluate(() => !!document.querySelector('#cardGrid > [data-bulk-id="k_1700000000011_leer"]')),
    'ein leerer Koffer bleibt eine normale Karte — es gibt nichts aufzuklappen');
  ok(m1.kofInGrp, 'die Koffer-Karte steht IM Gruppen-Kasten');
  ok(m1.teileInGrp === 2, 'beide Teile stehen im Gruppen-Rumpf (' + m1.teileInGrp + ')');
  ok(m1.akkuGesamt === 1, 'das Teil erscheint GENAU einmal auf der Seite');
  ok(m1.freiAussen, 'ein Werkzeug ohne Koffer bleibt direkt im Raster');
  ok(m1.toggle, 'die Koffer-Karte traegt den Auf-/Zu-Knopf');

  await page.evaluate(k => _wzKofToggle(k), KOF);
  await page.waitForTimeout(200);
  const m2 = await page.evaluate(() => ({
    rumpf: document.querySelectorAll('#cardGrid .wz-kgrp .wz-kgrp-bd').length,
    akku: document.querySelectorAll('#cardGrid [data-bulk-id="t_1700000000001_akku"]').length,
    label: (document.querySelector('#cardGrid [data-bulk-id="k_1700000000010_kof"] .wz-koftg') || {}).textContent || ''
  }));
  ok(m2.rumpf === 0, 'zugeklappt: kein Teile-Rumpf mehr');
  ok(m2.akku === 0, 'zugeklappt: das Teil ist nicht mehr gerendert');
  ok(/2 Teile/.test(m2.label), 'zugeklappt sieht man Koffer + Teilezahl («' + m2.label.trim() + '»)');
  await ctx.close();
}

console.log('— D) Kompakte Liste —');
{
  seedStore();
  const { ctx, page } = await openPage({ view: 'list' });
  const m = await page.evaluate(() => ({
    subs: document.querySelectorAll('#wzList .wz-lrow.wz-lsub').length,
    toggle: !!document.querySelector('#wzList [data-bulk-id="k_1700000000010_kof"] .wz-koftg'),
    akkuSub: !!document.querySelector('#wzList [data-bulk-id="t_1700000000001_akku"].wz-lsub'),
    freiSub: !!document.querySelector('#wzList [data-bulk-id="t_1700000000003_frei"].wz-lsub')
  }));
  ok(m.subs === 2, 'zwei eingerueckte Teile-Zeilen (.wz-lsub)');
  ok(m.toggle, 'die Koffer-Zeile traegt den Auf-/Zu-Knopf');
  ok(m.akkuSub, 'das Koffer-Teil ist eingerueckt');
  ok(!m.freiSub, 'ein Werkzeug ohne Koffer ist NICHT eingerueckt');
  await page.evaluate(k => _wzKofToggle(k), KOF);
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelectorAll('#wzList .wz-lrow.wz-lsub').length === 0), 'zugeklappt: keine Teile-Zeilen mehr');
  await ctx.close();
}

console.log('— E) Tabelle —');
{
  seedStore();
  const { ctx, page } = await openPage({ view: 'table' });
  const m = await page.evaluate(() => ({
    subs: document.querySelectorAll('#toolTbody tr.wz-tsub').length,
    toggle: document.querySelectorAll('#toolTbody .wz-koftg').length
  }));
  ok(m.subs === 2, 'zwei eingerueckte Tabellenzeilen (tr.wz-tsub)');
  ok(m.toggle >= 1, 'Auf-/Zu-Knopf in der Tabelle vorhanden');
  await page.evaluate(k => _wzKofToggle(k), KOF);
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelectorAll('#toolTbody tr.wz-tsub').length === 0), 'zugeklappt: keine eingerueckten Zeilen mehr');
  await ctx.close();
}

console.log('— F) Kein Teil verschwindet —');
{
  seedStore();
  const { ctx, page } = await openPage({ view: 'cards' });
  // Suche nach dem Teil — der Koffer faellt aus dem Filter.
  await page.evaluate(() => { const i = document.getElementById('searchInp'); i.value = 'Akku'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({
    akku: document.querySelectorAll('#cardGrid [data-bulk-id="t_1700000000001_akku"]').length,
    inGrp: !!document.querySelector('#cardGrid .wz-kgrp [data-bulk-id="t_1700000000001_akku"]'),
    gruppen: document.querySelectorAll('#cardGrid .wz-kgrp').length,
    chip: !!document.querySelector('#cardGrid [data-bulk-id="t_1700000000001_akku"] .tc-kofchip')
  }));
  ok(m.akku === 1, 'das Teil bleibt sichtbar, obwohl sein Koffer weggefiltert ist');
  ok(!m.inGrp && m.gruppen === 0, 'es steht dann normal im Fluss (keine Geister-Gruppe)');
  ok(m.chip, 'und behaelt dort seinen Sprung-Chip «Im Koffer …»');
  await ctx.close();
}

console.log('— G) Ehrliche Zahlen —');
{
  seedStore();
  const { ctx, page } = await openPage({ view: 'cards' });
  // Gemessen wird ueber die Engine: Koffer sichtbar, aber nur EIN Teil.
  const mess = await page.evaluate(() => {
    const alle = tools || [];
    const kof = alle.find(t => t.id === 'k_1700000000010_kof');
    const akku = alle.find(t => t.id === 't_1700000000001_akku');
    const g = _wzGruppen([kof, akku], alle).find(x => x.typ === 'koffer');
    return g ? { n: g.items.length, ges: g.gesamt, lbl: _wzKofTgLabel(g) } : null;
  });
  ok(mess && mess.n === 1 && mess.ges === 2, 'nur ein Teil sichtbar, Koffer hat aber zwei');
  ok(mess && /1 von 2 Teilen/.test(mess.lbl), 'das Label sagt «1 von 2 Teilen» statt bloss «1 Teil»' + (mess ? ' (' + mess.lbl.trim() + ')' : ''));
  const voll = await page.evaluate(() => {
    const alle = tools || [];
    const g = _wzGruppen(alle, alle).find(x => x.typ === 'koffer' && x.tool.id === 'k_1700000000010_kof');
    return g ? _wzKofTgLabel(g) : '';
  });
  ok(/2 Teile/.test(voll) && !/von/.test(voll), 'bei vollstaendiger Sicht steht schlicht «2 Teile» (' + voll.trim() + ')');

  // Und im DOM: Filter «Hilti» trifft Koffer + ein Teil nicht — pruefen, dass
  // die Karte dieselbe Sprache spricht wie die Engine.
  const domLbl = await page.evaluate(() => {
    const i = document.getElementById('searchInp'); i.value = 'Bohrhammer'; i.dispatchEvent(new Event('input', { bubbles: true }));
    return null;
  });
  await page.waitForTimeout(300);
  const dom = await page.evaluate(() => {
    const grp = document.querySelector('#cardGrid .wz-kgrp');
    return {
      da: !!grp,
      lbl: grp ? (grp.querySelector('.wz-koftg') || {}).textContent || '' : '',
      hint: grp ? (grp.querySelector('.wz-kgrp-leer') || {}).textContent || '' : ''
    };
  });
  ok(dom.da, 'der Koffer allein im Filter bildet weiterhin seine Gruppe');
  ok(/0 von 2 Teilen/.test(dom.lbl), 'die Karte sagt «0 von 2 Teilen» (' + dom.lbl.trim() + ')');
  ok(/2 Teile im Koffer/.test(dom.hint) && /keines sichtbar/.test(dom.hint),
    'weggefilterte Teile werden BENANNT statt stillschweigend zu fehlen');

  const leerHint = await page.evaluate(() => {
    const alle = tools || [];
    const g = _wzGruppen([alle.find(t => t.id === 'k_1700000000011_leer')], alle).find(x => x.typ === 'koffer');
    return g ? _wzKofLeerHint(g) : '';
  });
  ok(/Koffer ist leer/.test(leerHint), 'ein wirklich leerer Koffer sagt das auch so');
  await ctx.close();
}

console.log('— H) Einstellungen —');
{
  seedStore();
  const { ctx, page } = await openPage({ view: 'cards' });
  await page.evaluate(() => _wzOpenSettings());
  await page.waitForTimeout(300);
  const vorh = await page.evaluate(() => ({
    b: !!document.getElementById('wzs_kofferBuendeln'),
    o: !!document.getElementById('wzs_kofferOffen'),
    bVal: (document.getElementById('wzs_kofferBuendeln') || {}).value,
    oVal: (document.getElementById('wzs_kofferOffen') || {}).value,
    oDis: (document.getElementById('wzs_kofferOffen') || {}).disabled
  }));
  ok(vorh.b && vorh.o, 'beide Einstellungen sind im Dialog vorhanden');
  ok(vorh.bVal === '1' && vorh.oVal === '1', 'Vorgabe: gebuendelt + aufgeklappt');
  ok(vorh.oDis === false, 'der Startwert ist bei aktiver Buendelung bedienbar');

  // Live-Sperre beim Abwaehlen der Buendelung (nicht erst nach dem Speichern).
  await page.evaluate(() => { const s = document.getElementById('wzs_kofferBuendeln'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('wzs_kofferOffen').disabled === true), 'ohne Buendelung wird der Startwert SOFORT gesperrt');
  await page.evaluate(() => { const s = document.getElementById('wzs_kofferBuendeln'); s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('wzs_kofferOffen').disabled === false), 'und wieder freigegeben, sobald die Buendelung zurueckkommt');

  // Speichern: Buendelung AUS
  await page.evaluate(() => {
    document.getElementById('wzs_kofferBuendeln').value = '0';
    document.getElementById('wzs_kofferOffen').value = '0';
    _wzSaveSettings();
  });
  await page.waitForTimeout(500);
  const gesp = await page.evaluate(() => {
    const s = (GemaAuth.getCurrentOrg().settings || {}).werkzeug || {};
    return { b: s.kofferBuendeln, o: s.kofferOffen };
  });
  ok(gesp.b === false && gesp.o === false, 'beide Werte sind in org.settings.werkzeug gespeichert');
  ok(await page.evaluate(() => document.querySelectorAll('#cardGrid .wz-kgrp').length === 0), 'Buendelung aus → keine Gruppen mehr im Raster');
  const reihe = await page.evaluate(() => ({
    dom: Array.from(document.querySelectorAll('#cardGrid > [data-bulk-id]')).map(e => e.getAttribute('data-bulk-id')),
    soll: getFiltered().map(t => t.id)
  }));
  ok(JSON.stringify(reihe.dom) === JSON.stringify(reihe.soll), 'Buendelung aus → exakt die Standard-Reihenfolge der Liste');
  ok(reihe.dom.indexOf(AKKU) >= 0, 'die Koffer-Teile stehen dann normal in der Liste');

  // Standard «zugeklappt» wirkt, sobald die Buendelung wieder an ist.
  await page.evaluate(() => {
    const orgs = GemaAuth.getOrgs(); const o = orgs.find(x => x.id === 'org_t');
    o.settings.werkzeug.kofferBuendeln = true;
    GemaAuth.saveOrgs(orgs);
    try { localStorage.removeItem('gema_wz_kofferfold_v1'); } catch (e) {}
    _wzKofFold = {}; renderList();
  });
  await page.waitForTimeout(250);
  const zu = await page.evaluate(() => ({
    gruppen: document.querySelectorAll('#cardGrid .wz-kgrp').length,
    rumpf: document.querySelectorAll('#cardGrid .wz-kgrp-bd').length
  }));
  ok(zu.gruppen === 1 && zu.rumpf === 0, 'Standard «zugeklappt» wirkt: Gruppe ja, Teile zu');
  await ctx.close();
}

console.log('— I) Handy-Ansicht —');
{
  seedStore();
  const { ctx, page } = await openPage({ user: nativ(U_MAG), viewport: { width: 390, height: 844 }, mobile: true });
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const l = document.querySelector('.gn [data-nat-list]');
    return {
      da: !!l,
      toggle: l ? l.querySelectorAll('[data-nat-kof]').length : -1,
      subs: l ? Array.from(l.querySelectorAll('[data-nat-id]')).filter(r => /padding-left/.test(r.getAttribute('style') || '')).length : -1,
      sub: (function () {
        const r = l && l.querySelector('[data-nat-id="k_1700000000010_kof"] .gn-row-sub');
        return r ? r.textContent : '';
      })()
    };
  });
  ok(m.da, 'die Handy-Liste ist da');
  ok(m.toggle === 1, 'der Koffer mit Teilen traegt den Auf-/Zu-Knopf, der leere nicht (' + m.toggle + ')');
  ok(m.subs === 2, 'die Teile sind eingerueckt (' + m.subs + ')');
  ok(/2 Teile/.test(m.sub), 'die Koffer-Zeile nennt die Teilezahl («' + m.sub.trim() + '»)');

  // Der Tipp auf den Knopf klappt zu und oeffnet NICHT das Detail-Sheet.
  // (Klick defensiv — ein fehlender Knopf soll als ✗ auffallen, nicht abstuerzen.)
  await page.evaluate(() => { const b = document.querySelector('.gn [data-nat-kof="k_1700000000010_kof"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  const nach = await page.evaluate(() => {
    const l = document.querySelector('.gn [data-nat-list]');
    return {
      subs: l ? Array.from(l.querySelectorAll('[data-nat-id]')).filter(r => /padding-left/.test(r.getAttribute('style') || '')).length : -1,
      sheet: !!document.querySelector('.gn-sheet')
    };
  });
  ok(nach.subs === 0, 'Tipp auf den Knopf klappt den Koffer zu');
  ok(!nach.sheet, 'und oeffnet dabei KEIN Detail-Sheet');

  // Gegenprobe: Tipp auf die Zeile selbst oeffnet weiterhin das Detail — ein
  // Koffer laeuft dabei bewusst aufs klassische Detail (voller Funktionsumfang).
  await page.evaluate(() => { const r = document.querySelector('.gn [data-nat-id="k_1700000000010_kof"] .gn-row-body'); if (r) r.click(); });
  await page.waitForTimeout(600);
  const detOffen = await page.evaluate(() => {
    const m = document.getElementById('viewModal');
    return !!m && !m.classList.contains('hidden');
  });
  ok(detOffen, 'Gegenprobe: Tipp auf die Koffer-Zeile oeffnet weiterhin das Detail');
  ok(page.errs.length === 0, 'Handy-Ansicht ohne pageerror' + (page.errs[0] ? ' (' + page.errs[0] + ')' : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' Checks bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
