// Werkzeugmanagement — Filter nach interner Kennung, sortierbare Tabelle,
// Sammel-Bearbeitung der internen Kennung und die kompakte Listenansicht
// fuers Handy (Feedback 22.08.2026):
//   A) Erweiterter Filter kennt die interne Kennung (Teiltreffer + Vorschlaege).
//   B) Tabellen-Kopfzeile ist anklickbar → sortiert, zweiter Klick dreht die
//      Richtung; leere Werte stehen IMMER am Ende; die Wahl ueberlebt einen
//      Reload (pro Geraet).
//   C) Sammel-Bearbeitung setzt die interne Kennung 1:1 auf alle markierten
//      Werkzeuge (Koffer werden wie bisher uebersprungen).
//   D) Kompakte Listenansicht: auf dem Handy Standard, max. 3 Textzeilen,
//      KEIN horizontales Scrollen (geometrisch gemessen), Sortier-Auswahl
//      und Filter-Knopf direkt darueber.
//   E) Native Handy-Ansicht (Standard auf dem Phone) kennt dieselbe
//      Sortierung und den Kennungs-Filter.
//
// WICHTIG: Auf einem Phone-Viewport ist die NATIVE App-Ansicht der Standard
// (user.profile.nativeAnsicht, Default an). Die Abschnitte D/D2 pruefen die
// KLASSISCHE Ansicht und schalten die native darum so ab, wie es der Nutzer
// in sys_profil tut (profile.nativeAnsicht:false).
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_filter_sort_liste_test.mjs
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
// Bewusst gemischt: unterschiedliche Kennungen, teils GAR keine (fuer die
// «Leere ans Ende»-Regel), unterschiedliche Kaufdaten/Garantien.
const TOOLS = [
  { id: 't_1700000000001_a', name: 'Zange',        cat: 'handwerkzeug', brand: 'Knipex', model: 'K1',  internKennung: 'WZ-030', bought: '2025-03-01', warranty: '2027-03-01', orgId: 'org_t' },
  { id: 't_1700000000002_b', name: 'Bohrhammer',   cat: 'maschine',     brand: 'Hilti',  model: 'TE 30', internKennung: 'WZ-010', bought: '2025-01-10', warranty: '2028-01-10', orgId: 'org_t' },
  { id: 't_1700000000003_c', name: 'Akkuschrauber',cat: 'maschine',     brand: 'Bosch',  model: 'GSR',  internKennung: 'AB-002', bought: '2025-02-05', orgId: 'org_t' },
  { id: 't_1700000000004_d', name: 'Leiter 3m',    cat: 'leiter',       brand: 'Zarges', model: 'L3',   bought: '2024-11-20', warranty: '2026-11-20', orgId: 'org_t' },
  { id: 't_1700000000005_e', name: 'Messgerät',    cat: 'messgeraet',   brand: 'Testo',  model: 'T1',   internKennung: 'WZ-011', bought: '2025-04-15', orgId: 'org_t' }
];
function seedStore() {
  store.clear();
  TOOLS.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-08-01T00:00:00Z' }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const USERS = [
  { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } }
];

// Nutzer, der die App-Ansicht in sys_profil abgeschaltet hat → klassische Sicht
const USERS_KLASSISCH = [Object.assign({}, USERS[0], { profile: { email: 'mag@t.ch', nativeAnsicht: false } })];

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(opts) {
  opts = opts || {};
  const ctx = await browser.newContext(opts.viewport ? { viewport: opts.viewport, isMobile: !!opts.mobile, hasTouch: !!opts.mobile } : {});
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const users = opts.users || USERS;
  const seed = { gema_orgs_v1: [ORG], gema_users_v1: users, gema_session_v1: { token: 'x.y.z', userId: 'u_mag', expires: FUTURE } };
  if (opts.extra) Object.assign(seed, opts.extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1300);
  return { ctx, page };
}
// Reihenfolge der aktuell gefilterten/sortierten Liste (view-unabhaengig)
const namesOf = page => page.evaluate(() => getFiltered().map(t => t.name));

// ══════════════════════════════════════════════════════════════════
console.log('— A) Erweiterter Filter: interne Kennung —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => setView('table'));
  await page.waitForTimeout(150);

  // Dialog: Feld + Vorschlagsliste vorhanden
  await page.evaluate(() => _wzOpenAdvFilter());
  await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => {
    const inp = document.getElementById('af_intern');
    const dl = document.getElementById('af_internList');
    return {
      hasInp: !!inp,
      list: inp ? inp.getAttribute('list') : '',
      lbl: (function () { const d = inp && inp.closest('div'); const l = d && d.querySelector('.dlg-lbl'); return l ? l.textContent : ''; })(),
      opts: dl ? Array.from(dl.querySelectorAll('option')).map(o => o.value) : []
    };
  });
  ok(dlg.hasInp, 'Filter-Dialog hat das Feld «Interne Kennung» (#af_intern)');
  ok(dlg.lbl === 'Interne Kennung', 'Feld ist als «Interne Kennung» beschriftet');
  ok(dlg.list === 'af_internList', 'Feld haengt an einer Vorschlagsliste (datalist)');
  ok(dlg.opts.length === 4 && dlg.opts.indexOf('WZ-010') >= 0 && dlg.opts.indexOf('AB-002') >= 0,
    'Vorschlagsliste enthaelt die vorhandenen Kennungen (' + dlg.opts.join(', ') + ')');

  // Teiltreffer «WZ-01» → Bohrhammer (WZ-010) + Messgeraet (WZ-011)
  await page.evaluate(() => { document.getElementById('af_intern').value = 'WZ-01'; _wzApplyAdvFilterDialog(); });
  await page.waitForTimeout(250);
  const gefiltert = await namesOf(page);
  ok(gefiltert.length === 2 && gefiltert.indexOf('Bohrhammer') >= 0 && gefiltert.indexOf('Messgerät') >= 0,
    'Teiltreffer «WZ-01» findet genau WZ-010 + WZ-011 (' + gefiltert.join(', ') + ')');
  ok(gefiltert.indexOf('Zange') < 0, 'WZ-030 faellt heraus');
  ok(gefiltert.indexOf('Leiter 3m') < 0, 'Werkzeug OHNE Kennung faellt heraus');

  // Gross-/Kleinschreibung egal
  await page.evaluate(() => { _wzAdvFilter = { intern: 'ab-0' }; renderList(); });
  await page.waitForTimeout(150);
  const klein = await namesOf(page);
  ok(klein.length === 1 && klein[0] === 'Akkuschrauber', 'Suche ist gross-/kleinschreibungsunabhaengig');

  // Badge zeigt den aktiven Filter, Zuruecksetzen raeumt ihn ab
  await page.evaluate(() => { _wzAdvFilter = { intern: 'WZ' }; _wzUpdateFilterBadge(); });
  const badge = await page.evaluate(() => { const b = document.getElementById('advFilterBadge'); return b ? b.style.display : 'weg'; });
  ok(badge !== 'none', 'Filter-Badge zeigt den aktiven Filter an');
  await page.evaluate(() => _wzClearAdvFilter());
  await page.waitForTimeout(150);
  const alle = await namesOf(page);
  ok(alle.length === 5, 'Zuruecksetzen zeigt wieder alle Geraete');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— B) Tabelle sortierbar —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => setView('table'));
  await page.waitForTimeout(200);

  const heads = await page.evaluate(() => Array.from(document.querySelectorAll('.tool-table th[data-sort]')).map(th => ({
    key: th.getAttribute('data-sort'),
    text: th.textContent.trim(),
    klick: !!th.getAttribute('onclick'),
    ar: !!th.querySelector('.th-ar')
  })));
  ok(heads.length === 7, 'sieben Spaltenkoepfe sind sortierbar (' + heads.length + ')');
  ok(heads.every(h => h.klick), 'jeder sortierbare Kopf ist anklickbar');
  ok(heads.every(h => h.ar), 'jeder sortierbare Kopf hat einen Pfeil-Platzhalter');
  ok(heads.map(h => h.key).join(',') === 'name,cat,bought,warranty,service,pruef,status',
    'Kopf-Reihenfolge deckt Bezeichnung…Status ab');

  const cursor = await page.evaluate(() => getComputedStyle(document.querySelector('.tool-table th[data-sort]')).cursor);
  ok(cursor === 'pointer', 'sortierbarer Kopf zeigt den Zeiger als Hand (cursor:pointer)');

  // Standard: neueste zuerst (wie bisher)
  const start = await namesOf(page);
  ok(start[0] === 'Messgerät' && start[4] === 'Zange', 'Standard bleibt «zuletzt erfasst zuerst»');

  // Klick auf «Bezeichnung» → A→Z
  await page.evaluate(() => document.querySelector('.tool-table th[data-sort="name"]').click());
  await page.waitForTimeout(200);
  const az = await namesOf(page);
  ok(az.join('|') === 'Akkuschrauber|Bohrhammer|Leiter 3m|Messgerät|Zange', 'Klick sortiert A→Z (' + az.join(', ') + ')');
  const pfeilAuf = await page.evaluate(() => document.querySelector('.tool-table th[data-sort="name"] .th-ar').textContent);
  ok(pfeilAuf === '▲', 'Pfeil zeigt aufsteigend (▲)');
  const markiert = await page.evaluate(() => document.querySelector('.tool-table th[data-sort="name"]').classList.contains('is-sort'));
  ok(markiert, 'die sortierte Spalte ist hervorgehoben');

  // Zweiter Klick → Z→A
  await page.evaluate(() => document.querySelector('.tool-table th[data-sort="name"]').click());
  await page.waitForTimeout(200);
  const za = await namesOf(page);
  ok(za.join('|') === 'Zange|Messgerät|Leiter 3m|Bohrhammer|Akkuschrauber', 'zweiter Klick dreht auf Z→A');
  const pfeilAb = await page.evaluate(() => document.querySelector('.tool-table th[data-sort="name"] .th-ar').textContent);
  ok(pfeilAb === '▼', 'Pfeil zeigt absteigend (▼)');
  const nurEiner = await page.evaluate(() => Array.from(document.querySelectorAll('.tool-table th[data-sort]')).filter(th => th.querySelector('.th-ar').textContent).length);
  ok(nurEiner === 1, 'nur EINE Spalte traegt einen Pfeil');

  // Kaufdatum aufsteigend
  await page.evaluate(() => _wzSetSort('bought'));
  await page.waitForTimeout(150);
  const kauf = await page.evaluate(() => getFiltered().map(t => t.bought));
  ok(kauf.join('|') === '2024-11-20|2025-01-10|2025-02-05|2025-03-01|2025-04-15', 'Kaufdatum aufsteigend');

  // Leere Werte IMMER ans Ende — in BEIDEN Richtungen
  await page.evaluate(() => _wzSetSort('warranty'));
  await page.waitForTimeout(150);
  const gAuf = await page.evaluate(() => getFiltered().map(t => t.name + ':' + (t.warranty || '')));
  ok(/:$/.test(gAuf[3]) && /:$/.test(gAuf[4]), 'Garantie aufsteigend: Geraete OHNE Garantie stehen am Ende');
  await page.evaluate(() => _wzSetSort('warranty'));  // dreht auf absteigend
  await page.waitForTimeout(150);
  const gAb = await page.evaluate(() => getFiltered().map(t => t.name + ':' + (t.warranty || '')));
  ok(gAb[0] === 'Bohrhammer:2028-01-10', 'Garantie absteigend: spaetestes Datum zuoberst');
  ok(/:$/.test(gAb[3]) && /:$/.test(gAb[4]), 'auch absteigend stehen leere Garantien am Ende');

  // Sortierung nach interner Kennung (nur ueber die Listen-Auswahl erreichbar)
  await page.evaluate(() => _wzSetSort('intern'));
  await page.waitForTimeout(150);
  const ik = await page.evaluate(() => getFiltered().map(t => t.internKennung || ''));
  ok(ik.join('|') === 'AB-002|WZ-010|WZ-011|WZ-030|', 'Sortierung nach interner Kennung, ohne Kennung zuletzt');

  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— B2) Sortierung ueberlebt den Reload (pro Geraet) —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => { setView('table'); _wzSetSort('name'); });
  await page.waitForTimeout(200);
  const gemerkt = await page.evaluate(() => localStorage.getItem('gema_wz_sort_v1'));
  ok(/"key":"name"/.test(gemerkt || ''), 'die Sortierung wird gemerkt (' + gemerkt + ')');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1300);
  const nach = await namesOf(page);
  ok(nach[0] === 'Akkuschrauber', 'nach dem Reload gilt weiterhin A→Z');
  const pf = await page.evaluate(() => { const a = document.querySelector('.tool-table th[data-sort="name"] .th-ar'); return a ? a.textContent : ''; });
  ok(pf === '▲', 'der Pfeil steht nach dem Reload wieder in der richtigen Spalte');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— C) Sammel-Bearbeitung: interne Kennung fuer alle —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => {
    _wzToggleBulkMode();
    _wzBulkSelected = {}; ['t_1700000000001_a', 't_1700000000002_b', 't_1700000000004_d'].forEach(id => { _wzBulkSelected[id] = true; });
    _wzBulkEdit();
  });
  await page.waitForTimeout(300);
  const feld = await page.evaluate(() => {
    const inp = document.getElementById('be_v_intern');
    const cb = document.getElementById('be_on_intern');
    const wrap = document.getElementById('be_wrap_intern');
    return { inp: !!inp, cb: !!cb, gesperrt: wrap ? wrap.style.pointerEvents : '', txt: document.querySelector('.dlg-card') ? document.querySelector('.dlg-card').textContent : '' };
  });
  ok(feld.inp && feld.cb, 'Sammel-Dialog hat Haken + Feld «Interne Kennung»');
  ok(feld.gesperrt === 'none', 'Feld ist bis zum Anhaken gesperrt (wie die uebrigen Zeilen)');
  ok(/Interne Kennung/.test(feld.txt), 'Zeile ist als «Interne Kennung» beschriftet');
  ok(/keine Nummerierung/.test(feld.txt), 'Hinweis sagt, dass 1:1 gesetzt wird (keine Nummerierung)');

  await page.evaluate(() => {
    document.getElementById('be_on_intern').checked = true; _wzBeToggle('intern');
    document.getElementById('be_v_intern').value = 'SET-7';
  });
  const sammel = await page.evaluate(() => _wzBeCollect().map(c => c.label));
  ok(sammel.length === 1 && /Interne Kennung → SET-7/.test(sammel[0]), 'nur die angehakte Aenderung wird gesammelt');

  // Anwenden (Bestaetigungs-Dialog uebergehen — die Kette dahinter ist gemeinsam)
  await page.evaluate(() => {
    var ziele = ['t_1700000000001_a', 't_1700000000002_b', 't_1700000000004_d'].map(id => tools.find(t => t.id === id));
    _wzBulkApplyEdit(_wzBeCollect(), ziele);
  });
  await page.waitForTimeout(400);
  const nachher = await page.evaluate(() => tools.map(t => t.name + '=' + (t.internKennung || '')).sort());
  ok(nachher.indexOf('Zange=SET-7') >= 0 && nachher.indexOf('Bohrhammer=SET-7') >= 0 && nachher.indexOf('Leiter 3m=SET-7') >= 0,
    'alle drei markierten Werkzeuge tragen die neue Kennung');
  ok(nachher.indexOf('Akkuschrauber=AB-002') >= 0 && nachher.indexOf('Messgerät=WZ-011') >= 0,
    'nicht markierte Werkzeuge bleiben unangetastet');
  const cloud = await page.evaluate(() => {
    const raw = localStorage.getItem('gema_werkzeug') || '[]';
    return JSON.parse(raw).filter(t => t.internKennung === 'SET-7').length;
  });
  ok(cloud === 3, 'die Aenderung ist gespeichert (' + cloud + ' Records)');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— D) Kompakte Listenansicht (Handy) —');
{
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 780 }, mobile: true, users: USERS_KLASSISCH });
  const start = await page.evaluate(() => ({
    view: currentView,
    listeSichtbar: getComputedStyle(document.getElementById('listWrap')).display !== 'none',
    kartenSichtbar: getComputedStyle(document.getElementById('cardGrid')).display !== 'none',
    zeilen: document.querySelectorAll('.wz-lrow').length
  }));
  ok(start.view === 'list', 'auf dem Handy startet die kompakte Liste');
  ok(start.listeSichtbar && !start.kartenSichtbar, 'Liste sichtbar, Karten aus');
  ok(start.zeilen === 5, 'eine Zeile je Geraet (' + start.zeilen + ')');

  // Umschalter: Karten + Liste sichtbar, Tabelle bleibt aus (scrollt horizontal)
  const toggle = await page.evaluate(() => ({
    wrap: getComputedStyle(document.getElementById('viewToggle')).display,
    karten: getComputedStyle(document.getElementById('vt_cards')).display,
    liste: getComputedStyle(document.getElementById('vt_list')).display,
    tabelle: getComputedStyle(document.getElementById('vt_table')).display,
    aktiv: document.getElementById('vt_list').classList.contains('active')
  }));
  ok(toggle.wrap !== 'none', 'der Ansichts-Umschalter ist auf dem Handy sichtbar');
  ok(toggle.karten !== 'none' && toggle.liste !== 'none', 'Karten- und Listen-Knopf sind da');
  ok(toggle.tabelle === 'none', 'der Tabellen-Knopf bleibt auf dem Handy aus');
  ok(toggle.aktiv, 'der Listen-Knopf ist als aktiv markiert');

  // KEIN horizontales Scrollen — geometrisch gemessen, und zwar mit Inhalt,
  // der OHNE Schutz garantiert ueberlaufen wuerde (lange Bezeichnung,
  // langer Hersteller/Modell, lange Seriennummer, viele Chips).
  await page.evaluate(() => {
    const t = tools.find(x => x.id === 't_1700000000001_a');
    t.name = 'Hydraulische Presszange mit Wechselbacken und Koffer XXL';
    t.brand = 'Sehr Langer Herstellername International';
    t.model = 'Modellbezeichnung-mit-vielen-Zeichen-2026';
    t.serial = 'SN-0000000000000000000000000000';
    t.internKennung = 'WZ-030-LANG-LANG-LANG';
    t.zugewiesenAn = { typ: 'user', userId: 'u_mag', name: 'Magaziner Maximilian Mustermann' };
    renderList();
  });
  await page.waitForTimeout(200);
  const breit = await page.evaluate(() => {
    const list = document.getElementById('wzList');
    const rows = Array.from(document.querySelectorAll('.wz-lrow'));
    return {
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      listScroll: list.scrollWidth, listClient: list.clientWidth,
      ueber: rows.filter(r => r.scrollWidth > r.clientWidth + 1).length,
      rausRagt: rows.filter(r => r.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length
    };
  });
  ok(breit.docScroll <= breit.docClient + 1, 'die Seite scrollt nicht horizontal (' + breit.docScroll + ' ≤ ' + breit.docClient + ')');
  ok(breit.listScroll <= breit.listClient + 1, 'die Liste selbst scrollt nicht horizontal');
  ok(breit.ueber === 0, 'keine Zeile ist breiter als ihr Platz');
  ok(breit.rausRagt === 0, 'keine Zeile ragt ueber den Bildschirmrand');
  const lang = await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('.wz-lrow')).find(x => /Presszange/.test(x.textContent));
    return { h: Math.round(r.getBoundingClientRect().height), name: r.querySelector('.wz-lname').scrollWidth > r.querySelector('.wz-lname').clientWidth };
  });
  ok(lang.h <= 110, 'auch eine Zeile mit sehr langem Inhalt bleibt kompakt (' + lang.h + 'px)');
  ok(lang.name, 'lange Bezeichnungen werden gekuerzt statt umgebrochen');
  // Seed-Zustand fuer die folgenden Pruefungen wiederherstellen
  await page.evaluate(() => {
    const t = tools.find(x => x.id === 't_1700000000001_a');
    t.name = 'Zange'; t.brand = 'Knipex'; t.model = 'K1'; t.serial = ''; t.internKennung = 'WZ-030';
    delete t.zugewiesenAn; renderList();
  });
  await page.waitForTimeout(150);

  // Zeilenhoehe: mehrzeilig, aber kompakt
  const hoehe = await page.evaluate(() => {
    const r = document.querySelector('.wz-lrow');
    return { h: Math.round(r.getBoundingClientRect().height), l1: !!r.querySelector('.wz-l1'), l2: !!r.querySelector('.wz-l2'), l3: !!r.querySelector('.wz-l3') };
  });
  ok(hoehe.l1 && hoehe.l2 && hoehe.l3, 'jede Zeile hat genau drei Textzeilen (Name / Meta / Chips)');
  ok(hoehe.h >= 56 && hoehe.h <= 110, 'Zeilenhoehe ist kompakt: ' + hoehe.h + 'px (Karte ist ein Vielfaches davon)');
  const kartenHoehe = await page.evaluate(async () => {
    setView('cards'); await new Promise(r => setTimeout(r, 150));
    const c = document.querySelector('.tool-card');
    const h = c ? Math.round(c.getBoundingClientRect().height) : 0;
    setView('list'); await new Promise(r => setTimeout(r, 150));
    return h;
  });
  ok(kartenHoehe > hoehe.h * 1.8, 'die Liste ist deutlich kompakter als die Karten (' + hoehe.h + 'px vs. ' + kartenHoehe + 'px)');

  // Inhalt der Zeile: Name, Kennung, Hersteller/Modell, Status-Chip
  const inhalt = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.wz-lrow'));
    const bohr = rows.find(r => /Bohrhammer/.test(r.textContent));
    return {
      name: bohr.querySelector('.wz-lname').textContent,
      kenn: bohr.querySelector('.wz-lkenn') ? bohr.querySelector('.wz-lkenn').textContent : '',
      meta: bohr.querySelector('.wz-l2').textContent,
      chips: bohr.querySelector('.wz-l3').textContent,
      ohneKenn: !rows.find(r => /Leiter 3m/.test(r.textContent)).querySelector('.wz-lkenn')
    };
  });
  ok(inhalt.name === 'Bohrhammer', 'Zeile 1 traegt die Bezeichnung');
  ok(/WZ-010/.test(inhalt.kenn), 'Zeile 1 traegt die interne Kennung');
  ok(/Hilti/.test(inhalt.meta) && /TE 30/.test(inhalt.meta), 'Zeile 2 traegt Hersteller + Modell');
  ok(/Maschine/.test(inhalt.meta), 'Zeile 2 nennt die Kategorie');
  ok(inhalt.chips.length > 0, 'Zeile 3 traegt Status-Chips');
  ok(inhalt.ohneKenn, 'ein Geraet ohne Kennung bekommt kein leeres Kennungs-Feld');

  // Sortier-Auswahl + Filter-Knopf ueber der Liste
  const leiste = await page.evaluate(() => {
    const sel = document.getElementById('wzSortSel');
    const f = document.getElementById('wzListFilter');
    return { sel: !!sel, opts: sel ? sel.options.length : 0, wert: sel ? sel.value : '', filt: !!f, ct: document.getElementById('wzListCount').textContent };
  });
  ok(leiste.sel && leiste.opts > 5, 'Sortier-Auswahl mit mehreren Kriterien (' + leiste.opts + ')');
  ok(leiste.wert === 'neu:desc', 'Auswahl zeigt die aktive Sortierung');
  ok(leiste.filt, 'Filter-Knopf steht direkt ueber der Liste');
  ok(/5 Geräte/.test(leiste.ct), 'Trefferzahl wird angezeigt («' + leiste.ct + '»)');

  await page.evaluate(() => _wzSortFromSelect('name:asc'));
  await page.waitForTimeout(200);
  const sortiert = await page.evaluate(() => Array.from(document.querySelectorAll('.wz-lname')).map(e => e.textContent));
  ok(sortiert[0] === 'Akkuschrauber', 'die Sortier-Auswahl wirkt auf die Liste');

  // Filter-Knopf zeigt aktive Filter an
  await page.evaluate(() => { _wzAdvFilter = { intern: 'WZ-01' }; renderList(); });
  await page.waitForTimeout(200);
  const gef = await page.evaluate(() => ({
    zeilen: document.querySelectorAll('.wz-lrow').length,
    an: document.getElementById('wzListFilter').classList.contains('on'),
    ct: document.getElementById('wzListFilterCt').textContent,
    ctSicht: document.getElementById('wzListFilterCt').style.display
  }));
  ok(gef.zeilen === 2, 'der Filter wirkt auch in der Listenansicht');
  ok(gef.an && gef.ct === '1' && gef.ctSicht !== 'none', 'der Filter-Knopf weist den aktiven Filter aus');

  // Klick auf eine Zeile oeffnet die Detailansicht
  await page.evaluate(() => { _wzAdvFilter = {}; renderList(); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { const r = Array.from(document.querySelectorAll('.wz-lrow')).find(x => /Bohrhammer/.test(x.textContent)); r.click(); });
  await page.waitForTimeout(350);
  const det = await page.evaluate(() => { const vm = document.getElementById('viewModal'); return vm && !vm.classList.contains('hidden'); });
  ok(det, 'Klick auf eine Listenzeile oeffnet die Detailansicht');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— D2) Listenansicht: Mehrfachauswahl + Desktop-Standard —');
{
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 780 }, mobile: true, users: USERS_KLASSISCH });
  await page.evaluate(() => _wzToggleBulkMode());
  await page.waitForTimeout(250);
  const cb = await page.evaluate(() => document.querySelectorAll('.wz-lrow .wz-lcb').length);
  ok(cb === 5, 'im Auswahl-Modus hat jede Listenzeile ein Kaestchen (' + cb + ')');
  await page.evaluate(() => { const r = Array.from(document.querySelectorAll('.wz-lrow')).find(x => /Bohrhammer/.test(x.textContent)); r.click(); });
  await page.waitForTimeout(200);
  const sel = await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('.wz-lrow')).find(x => /Bohrhammer/.test(x.textContent));
    return { markiert: r.classList.contains('wz-bulk-sel'), haken: r.querySelector('.wz-lcb').textContent, anzahl: Object.keys(_wzBulkSelected).length, detail: !document.getElementById('viewModal').classList.contains('hidden') };
  });
  ok(sel.markiert && sel.haken === '✓', 'Klick markiert die Zeile (Haken sichtbar)');
  ok(sel.anzahl === 1, 'die Auswahl ist gesetzt');
  ok(!sel.detail, 'im Auswahl-Modus oeffnet der Klick KEINE Detailansicht');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();

  // Desktop startet weiterhin in den Karten
  seedStore();
  const d = await openPage({ viewport: { width: 1280, height: 900 } });
  const dv = await d.page.evaluate(() => ({ view: currentView, tab: getComputedStyle(document.getElementById('vt_table')).display }));
  ok(dv.view === 'cards', 'am Desktop startet weiterhin die Kartenansicht');
  ok(dv.tab !== 'none', 'am Desktop bleibt der Tabellen-Knopf sichtbar');
  // Gemerkte Wahl gewinnt ueber den Geraete-Standard
  await d.page.evaluate(() => setView('list'));
  await d.page.waitForTimeout(150);
  await d.page.reload({ waitUntil: 'domcontentloaded' });
  await d.page.waitForTimeout(1300);
  const dv2 = await d.page.evaluate(() => currentView);
  ok(dv2 === 'list', 'eine bewusst gewaehlte Ansicht ueberlebt den Reload');
  ok(d.page.errs.length === 0, 'keine pageerrors');
  await d.ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— E) Native Handy-Ansicht: Sortierung + Kennungs-Filter —');
{
  seedStore();
  // KEIN nativeAnsicht:false → auf dem Phone gilt der Standard (native App-Ansicht)
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 780 }, mobile: true });
  await page.waitForTimeout(400);
  const nat = await page.evaluate(() => ({
    an: document.documentElement.classList.contains('gn-native-on'),
    zeilen: Array.from(document.querySelectorAll('.gn--page [data-nat-id] .gn-row-title')).map(e => e.textContent)
  }));
  ok(nat.an, 'auf dem Phone ist die native App-Ansicht der Standard');
  ok(nat.zeilen.length === 5, 'die native Liste zeigt alle Geraete (' + nat.zeilen.length + ')');

  // Sortierung wirkt auch nativ (gemeinsamer Motor _wzSortList)
  await page.evaluate(() => { _wzSortFromSelect('name:asc'); });
  await page.waitForTimeout(400);
  const sortiert = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page [data-nat-id] .gn-row-title')).map(e => e.textContent));
  ok(sortiert[0] === 'Akkuschrauber' && sortiert[4] === 'Zange', 'die native Liste folgt derselben Sortierung (' + sortiert.join(', ') + ')');

  // Filter-Sheet: Felder «Interne Kennung» + «Sortierung»
  await page.evaluate(() => { document.querySelector('[data-nat-filter]').click(); });
  await page.waitForTimeout(450);
  const sheet = await page.evaluate(() => ({
    intern: !!document.querySelector('.gn-sheet [data-f="intern"]'),
    sort: !!document.querySelector('.gn-sheet [data-f="sort"]'),
    sortWert: (document.querySelector('.gn-sheet [data-f="sort"]') || {}).value || '',
    opts: document.querySelectorAll('.gn-sheet [data-f="sort"] option').length
  }));
  ok(sheet.intern, 'das native Filter-Sheet hat das Feld «Interne Kennung»');
  ok(sheet.sort && sheet.opts > 5, 'das native Filter-Sheet hat eine Sortier-Auswahl (' + sheet.opts + ' Optionen)');
  ok(sheet.sortWert === 'name:asc', 'die Auswahl zeigt die aktive Sortierung');

  await page.evaluate(() => {
    document.querySelector('.gn-sheet [data-f="intern"]').value = 'WZ-01';
    document.querySelector('.gn-sheet [data-f="sort"]').value = 'name:desc';
    const b = Array.from(document.querySelectorAll('.gn-sheet button')).find(x => /Anwenden/.test(x.textContent));
    b.click();
  });
  await page.waitForTimeout(900);
  const nach = await page.evaluate(() => ({
    zeilen: Array.from(document.querySelectorAll('.gn--page [data-nat-id] .gn-row-title')).map(e => e.textContent),
    f: JSON.parse(JSON.stringify(_wzAdvFilter || {})),
    sort: JSON.parse(JSON.stringify(_wzSort))
  }));
  ok(nach.f.intern === 'WZ-01', 'der Kennungs-Filter ist gesetzt');
  ok(nach.zeilen.length === 2 && nach.zeilen.indexOf('Zange') < 0, 'die native Liste filtert nach der Kennung (' + nach.zeilen.join(', ') + ')');
  ok(nach.sort.key === 'name' && nach.sort.dir === -1, 'die Sortierung aus dem Sheet ist uebernommen');
  ok(nach.zeilen[0] === 'Messgerät', 'die native Liste ist Z→A sortiert');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— E2) Native Toolbar: nichts wird seitlich hinausgeschoben —');
{
  // Die Werkzeug-Toolbar ist die vollste der App: Zurueck + Titel + Filter +
  // QR + NFC + Avatar. Ohne min-width:0 am flexenden Titel stand der zentral
  // injizierte Avatar (Konto-Menue: Profil/Abmelden) AUSSERHALB des Bildes und
  // war nur per seitlichem Scrollen erreichbar.
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 780 }, mobile: true });
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => {
    const sc = document.querySelector('.gn--page [data-gn-scroll]');
    const tb = document.querySelector('.gn--page .gn-toolbar');
    const av = tb && tb.querySelector('.gn-avatar');
    const h1 = tb && tb.querySelector('.gn-large-title h1');
    const back = tb && tb.querySelector('[data-gn-back]');
    let treffer = '—';
    if (back) {
      const r = back.getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      const btn = el && el.closest ? el.closest('button') : null;
      treffer = btn ? (btn.className || '') : '—';
    }
    return {
      scrollX: sc ? sc.scrollWidth - sc.clientWidth : -1,
      bodyX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tbX: tb ? tb.scrollWidth - tb.clientWidth : -1,
      avaRechts: av ? Math.round(av.getBoundingClientRect().right) : -1,
      titelGekappt: h1 ? h1.scrollWidth > h1.clientWidth + 1 : true,
      treffer: treffer
    };
  });
  ok(g.scrollX <= 1 && g.bodyX <= 1 && g.tbX <= 1, 'kein seitliches Scrollen (Inhalt ' + g.scrollX + ', Seite ' + g.bodyX + ', Toolbar ' + g.tbX + ')');
  ok(g.avaRechts > 0 && g.avaRechts <= 390, 'der Konto-Avatar steht vollstaendig im Bild (rechte Kante ' + g.avaRechts + ' von 390)');
  ok(!g.titelGekappt, 'der Titel wird nicht abgeschnitten');
  // Die unsichtbare Kompakt-Leiste darf keine Taps abfangen
  ok(/gn-back(\s|$)/.test(g.treffer), 'der Tap auf ‹ Zurueck erreicht die Toolbar-Taste, nicht die unsichtbare Kompakt-Leiste (' + g.treffer + ')');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' Checks grün, ' + fail + ' fehlgeschlagen');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
