// Fahrzeugmanagement — Fahrer-Zuweisung als Auswahl, sortierbare Liste,
// kompakte Listenansicht fuers Handy und Filteroptionen (Feedback 22.08.2026):
//   A) Zuweisungs-Dialog: Fahrer UND Abteilung sind Auswahl-Felder (frueher
//      freie Textfelder — «es ist irgendwie ein normaler Textblock»); die
//      Auswahl kommt aus derselben Quelle wie das Erfassungs-Formular.
//   B) Tabellen-Kopfzeile ist anklickbar → sortiert, zweiter Klick dreht die
//      Richtung; leere Werte stehen IMMER am Ende; die Wahl ueberlebt einen
//      Reload (pro Geraet).
//   C) Kompakte Listenansicht: auf dem Handy Standard, drei Textzeilen,
//      KEIN horizontales Scrollen (geometrisch gemessen).
//   D) Filter-Dialog: auf dem Handy der Ersatz fuer die dort versteckten
//      Selects — Status/Typ/Zuteilung schreiben in DIESELBEN Selects
//      (eine Filter-Wahrheit), dazu Fahrer/Abteilung/Ausbau/MFK/Defekte.
//   E) Native Handy-Ansicht (Standard auf dem Phone) kennt dieselbe
//      Sortierung und die zusaetzlichen Filter.
//
// WICHTIG: Auf einem Phone-Viewport ist die NATIVE App-Ansicht der Standard
// (user.profile.nativeAnsicht, Default an). Die Abschnitte C/D pruefen die
// KLASSISCHE Ansicht und schalten die native darum so ab, wie es der Nutzer
// in sys_profil tut (profile.nativeAnsicht:false).
//
// Aufruf:  CHROME=<chromium> node scripts/fahrzeug_filter_sort_liste_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8898;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/if_fahrzeug.html';
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
// Bewusst gemischt: unterschiedliche Fahrer/Abteilungen, teils GAR keine
// (fuer die «Leere ans Ende»-Regel), ein Fahrzeug mit offenem Defekt und
// eines mit bald faelliger MFK.
const heute = new Date();
const inTagen = n => new Date(heute.getTime() + n * 86400000).toISOString().slice(0, 10);
const VEHICLES = [
  { id: 'v_1700000000001_a', nr: '30', plate: 'BS 30030', model: 'VW Crafter',  type: 'Monteurfahrzeug', assignment: 'fix',     driver: 'Zora Zimmerli', dept: 'Sanitär', buildout: 'Werkstattausbau', km: 90000, mfk: inTagen(400), status: 'aktiv', orgId: 'org_t', createdAt: '2026-01-05T08:00:00Z' },
  { id: 'v_1700000000002_b', nr: '10', plate: 'BS 10010', model: 'Ford Transit', type: 'Servicefahrzeug', assignment: 'sharing', driver: 'Anna Ammann',   dept: 'Service', buildout: 'Regalausbau',     km: 120000, mfk: inTagen(20),  status: 'aktiv', orgId: 'org_t', createdAt: '2026-02-05T08:00:00Z',
    events: [{ id: 'e1', type: 'defekt', text: 'Bremse', resolved: false }] },
  { id: 'v_1700000000003_c', nr: '20', plate: 'BS 20020', model: 'Opel Vivaro',  type: 'Monteurfahrzeug', assignment: 'fix',     driver: '',              dept: '',        buildout: '',                km: 45000,  mfk: inTagen(500), status: 'aktiv', orgId: 'org_t', createdAt: '2026-03-05T08:00:00Z' },
  { id: 'v_1700000000004_d', nr: '40', plate: 'BS 40040', model: 'Renault Master', type: 'Poolfahrzeug',  assignment: 'sharing', driver: 'Beat Brunner',  dept: 'Heizung', buildout: 'Leerausbau',      km: 15000,  mfk: inTagen(300), status: 'service', orgId: 'org_t', createdAt: '2026-04-05T08:00:00Z' }
];
function seedStore() {
  store.clear();
  VEHICLES.forEach(v => store.set('fahrzeugmanagement|vehicle:' + v.id, { data: JSON.parse(JSON.stringify(v)), _lm: '2026-08-01T00:00:00Z' }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const TEAM = [
  { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } },
  { id: 'u_a',   username: 'anna@t.ch', name: 'Anna Ammann', roleIds: ['role_monteur'],  orgId: 'org_t', active: true, profile: { email: 'anna@t.ch' } },
  { id: 'u_b',   username: 'beat@t.ch', name: 'Beat Brunner', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'beat@t.ch' } },
  { id: 'u_z',   username: 'zora@t.ch', name: 'Zora Zimmerli', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'zora@t.ch' } }
];
// Nutzer, der die App-Ansicht in sys_profil abgeschaltet hat → klassische Sicht
const TEAM_KLASSISCH = TEAM.map(u => u.id === 'u_mag'
  ? Object.assign({}, u, { profile: { email: 'mag@t.ch', nativeAnsicht: false } })
  : u);

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
  const users = opts.users || TEAM;
  const seed = { gema_orgs_v1: [ORG], gema_users_v1: users, gema_session_v1: { token: 'x.y.z', userId: 'u_mag', expires: FUTURE } };
  if (opts.extra) Object.assign(seed, opts.extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_fahrzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}
// Reihenfolge der aktuell gefilterten/sortierten Liste (ansichts-unabhaengig)
const nrsOf = page => page.evaluate(() => _fzPermHooks.filtered().map(v => v.nr));

// ══════════════════════════════════════════════════════════════════
console.log('— A) Zuweisung: Fahrer/Abteilung sind eine AUSWAHL —');
{
  seedStore();
  const { ctx, page } = await openPage();

  const tags = await page.evaluate(() => ({
    driver: (document.getElementById('zuweisungDriver') || {}).tagName || '',
    dept: (document.getElementById('zuweisungDept') || {}).tagName || '',
    fDriver: (document.getElementById('fDriver') || {}).tagName || '',
    fDept: (document.getElementById('fDept') || {}).tagName || ''
  }));
  ok(tags.driver === 'SELECT', 'Zuweisungs-Dialog: Fahrer ist ein <select>, kein Textfeld');
  ok(tags.dept === 'SELECT', 'Zuweisungs-Dialog: Abteilung ist ein <select>');
  ok(tags.fDriver === 'SELECT' && tags.fDept === 'SELECT', 'Erfassungs-Formular ist unveraendert eine Auswahl');

  await page.evaluate(() => openZuweisung('v_1700000000001_a'));
  await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => {
    const d = document.getElementById('zuweisungDriver'), t = document.getElementById('zuweisungDept');
    return {
      driverOpts: Array.from(d.options).map(o => o.value),
      driverVal: d.value,
      deptOpts: Array.from(t.options).map(o => o.value),
      deptVal: t.value,
      typ: document.getElementById('zuweisungType').value
    };
  });
  ok(dlg.driverOpts.indexOf('Anna Ammann') >= 0 && dlg.driverOpts.indexOf('Beat Brunner') >= 0,
    'Fahrer-Auswahl listet das Team der eigenen Org (' + dlg.driverOpts.filter(Boolean).join(', ') + ')');
  ok(dlg.driverVal === 'Zora Zimmerli', 'Aktueller Fahrer ist vorausgewaehlt');
  ok(dlg.deptOpts.indexOf('Sanitär') >= 0, 'Abteilungs-Auswahl kennt die erfassten Abteilungen');
  ok(dlg.deptVal === 'Sanitär', 'Aktuelle Abteilung ist vorausgewaehlt');
  ok(dlg.typ === 'fix', 'Zuteilung ist vorausgewaehlt');

  // Zuweisen und speichern
  await page.evaluate(() => {
    document.getElementById('zuweisungDriver').value = 'Beat Brunner';
    document.getElementById('zuweisungDept').value = 'Heizung';
    saveZuweisung();
  });
  await page.waitForTimeout(400);
  const nach = await page.evaluate(() => {
    const v = (window._fzPermHooks.vehicles() || []).find(x => x.id === 'v_1700000000001_a');
    return { driver: v.driver, dept: v.dept };
  });
  ok(nach.driver === 'Beat Brunner', 'Ausgewaehlter Fahrer wird gespeichert');
  ok(nach.dept === 'Heizung', 'Ausgewaehlte Abteilung wird gespeichert');

  // Platzhalter «Eigene …» darf nie als Wert im Datensatz landen
  await page.evaluate(() => {
    openZuweisung('v_1700000000001_a');
    document.getElementById('zuweisungDept').value = '_custom';
    saveZuweisung();
  });
  await page.waitForTimeout(300);
  const custom = await page.evaluate(() => ((window._fzPermHooks.vehicles() || []).find(x => x.id === 'v_1700000000001_a') || {}).dept);
  ok(custom === '', 'Platzhalter «Eigene …» wird nie gespeichert');

  ok(page.errs.length === 0, 'Keine JS-Fehler (' + (page.errs[0] || '—') + ')');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— B) Sortierbare Tabelle —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => _fzSetView('table'));
  await page.waitForTimeout(250);

  const heads = await page.evaluate(() => Array.from(document.querySelectorAll('#tableView th[data-sort]')).map(th => th.getAttribute('data-sort')));
  ok(heads.length >= 7, 'Kopfzeile hat anklickbare Spalten (' + heads.length + ': ' + heads.join(', ') + ')');
  ok(heads.indexOf('driver') >= 0 && heads.indexOf('km') >= 0 && heads.indexOf('service') >= 0,
    'Fahrer, km-Stand und Service-Termin sind ueber die Kopfzeile sortierbar');
  const sortKeys = await page.evaluate(() => (window._fzSortOptsHtml ? _fzSortOptsHtml() : '').match(/value="([^:"]+):/g) || []);
  ok(sortKeys.join(',').indexOf('mfk') >= 0 && sortKeys.join(',').indexOf('dept') >= 0,
    'MFK und Abteilung sind ueber die Sortier-Auswahl erreichbar (keine eigene Tabellenspalte)');

  // Standard: nach Nummer aufsteigend
  ok((await nrsOf(page)).join(',') === '10,20,30,40', 'Standard sortiert nach Nummer aufsteigend');

  // Klick auf «km-Stand»
  await page.evaluate(() => _fzSetSort('km'));
  await page.waitForTimeout(200);
  const kmAb = await nrsOf(page);
  ok(kmAb.join(',') === '10,30,20,40', 'km-Stand sortiert absteigend (' + kmAb.join(',') + ')');
  await page.evaluate(() => _fzSetSort('km'));
  await page.waitForTimeout(200);
  const kmAuf = await nrsOf(page);
  ok(kmAuf.join(',') === '40,20,30,10', 'Zweiter Klick dreht die Richtung (' + kmAuf.join(',') + ')');

  // Leere Werte IMMER am Ende — in beiden Richtungen
  await page.evaluate(() => _fzSetSort('driver'));
  await page.waitForTimeout(200);
  const fA = await nrsOf(page);
  await page.evaluate(() => _fzSetSort('driver'));
  await page.waitForTimeout(200);
  const fB = await nrsOf(page);
  ok(fA[fA.length - 1] === '20', 'Fahrzeug OHNE Fahrer steht am Ende (aufsteigend)');
  ok(fB[fB.length - 1] === '20', 'Fahrzeug OHNE Fahrer steht auch abgedreht am Ende');
  ok(fA.slice(0, 3).join(',') !== fB.slice(0, 3).join(','), 'Die belegten Fahrer drehen dabei wirklich um');

  // Kopfzeile markiert die aktive Spalte
  const mark = await page.evaluate(() => {
    const th = document.querySelector('#tableView th[data-sort="driver"]');
    return { on: th.classList.contains('is-sort'), ar: (th.querySelector('.th-ar') || {}).textContent || '' };
  });
  ok(mark.on, 'Aktive Sortier-Spalte ist markiert');
  ok(mark.ar === '▲' || mark.ar === '▼', 'Richtungspfeil steht in der Kopfzeile (' + mark.ar + ')');

  // Wahl ueberlebt den Reload
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.evaluate(() => _fzSetView('table'));
  await page.waitForTimeout(250);
  const nachReload = await page.evaluate(() => {
    const th = document.querySelector('#tableView th[data-sort="driver"]');
    return { on: !!(th && th.classList.contains('is-sort')), sel: (document.getElementById('fzSortSel') || {}).value || '' };
  });
  ok(nachReload.on, 'Sortier-Wahl ueberlebt den Reload (Geraete-UI)');
  ok(page.errs.length === 0, 'Keine JS-Fehler (' + (page.errs[0] || '—') + ')');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— C) Kompakte Listenansicht (klassisch, Handy) —');
{
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 844 }, mobile: true, users: TEAM_KLASSISCH });

  const aktiv = () => page.evaluate(() => { const b = document.querySelector('#viewToggle .seg.active'); return b ? b.dataset.view : ''; });
  ok(await aktiv() === 'list', 'Auf dem Handy ist die kompakte Liste der Standard');
  const sichtbar = await page.evaluate(() => {
    const l = document.getElementById('listView'), c = document.getElementById('cardsView'), t = document.getElementById('tableView');
    return { l: getComputedStyle(l).display, c: getComputedStyle(c).display, t: getComputedStyle(t).display };
  });
  ok(sichtbar.l !== 'none' && sichtbar.c === 'none' && sichtbar.t === 'none', 'Nur die Liste ist sichtbar');

  const rows = await page.evaluate(() => document.querySelectorAll('#fzList .fz-lrow').length);
  ok(rows === 4, 'Alle vier Fahrzeuge stehen in der Liste (' + rows + ')');

  const aufbau = await page.evaluate(() => {
    const r = document.querySelector('#fzList .fz-lrow');
    return {
      zeilen: r.querySelectorAll('.fz-lmain > div').length,
      hatName: !!r.querySelector('.fz-lname'),
      hatChips: r.querySelectorAll('.fz-lchip').length
    };
  });
  ok(aufbau.zeilen === 3, 'Jede Zeile hat genau drei Textzeilen (' + aufbau.zeilen + ')');
  ok(aufbau.hatName, 'Erste Zeile traegt Fahrzeug + Nummer');
  ok(aufbau.hatChips > 0, 'Dritte Zeile traegt Status-Chips');

  // GEOMETRISCH: kein horizontales Scrollen — auch nicht mit bewusst langem
  // Inhalt (nur so beweist die Messung wirklich etwas).
  const geo = await page.evaluate(() => {
    const v = (window._fzPermHooks.vehicles() || []).find(x => x.id === 'v_1700000000001_a');
    const alt = { model: v.model, plate: v.plate, driver: v.driver, dept: v.dept, buildout: v.buildout, type: v.type };
    v.model = 'Volkswagen Crafter 35 Kastenwagen Hochdach lang Allrad Sonderausbau';
    v.plate = 'BS 300300300';
    v.driver = 'Maximiliane Wolkenschieber-Hasenpfeffer';
    v.dept = 'Sanitär, Heizung, Lüftung und Klima Grossprojekte';
    v.type = 'Monteurfahrzeug mit Spezialausruestung';
    render();
    const list = document.getElementById('listView');
    const row = document.querySelector('#fzList .fz-lrow[data-fz-id="v_1700000000001_a"]');
    const name = row.querySelector('.fz-lname');
    const meta = row.querySelector('.fz-l2');
    const out = {
      listScroll: list.scrollWidth - list.clientWidth,
      bodyScroll: document.body.scrollWidth - document.body.clientWidth,
      rowScroll: row.scrollWidth - row.clientWidth,
      rowH: Math.round(row.getBoundingClientRect().height),
      nameClipped: name.scrollWidth > name.clientWidth + 1,
      metaClipped: meta.scrollWidth > meta.clientWidth + 1,
      nameEllipsis: getComputedStyle(name).textOverflow,
      metaEllipsis: getComputedStyle(meta).textOverflow
    };
    Object.assign(v, alt); render();
    return out;
  });
  ok(geo.nameClipped, 'Der bewusst lange Text wuerde ueberlaufen — die Messung ist damit aussagekraeftig');
  ok(geo.listScroll <= 1, 'Die Liste scrollt NICHT horizontal (' + geo.listScroll + 'px)');
  ok(geo.rowScroll <= 1, 'Die Zeile selbst scrollt NICHT horizontal (' + geo.rowScroll + 'px)');
  ok(geo.bodyScroll <= 1, 'Die Seite scrollt NICHT horizontal (' + geo.bodyScroll + 'px)');
  ok(geo.nameEllipsis === 'ellipsis' && geo.metaEllipsis === 'ellipsis', 'Zu langer Text wird mit … gekuerzt');
  ok(geo.rowH <= 110, 'Die Zeile bleibt kompakt (' + geo.rowH + 'px, max. 110)');

  // Sortier-Auswahl direkt ueber der Liste
  const bar = await page.evaluate(() => {
    const s = document.getElementById('fzSortSel');
    return { opts: s ? s.options.length : 0, val: s ? s.value : '', count: (document.getElementById('fzListCount') || {}).textContent || '' };
  });
  ok(bar.opts >= 12, 'Sortier-Auswahl ueber der Liste kennt alle Kriterien (' + bar.opts + ')');
  ok(/4 Fahrzeuge/.test(bar.count), 'Trefferzahl steht in der Listen-Leiste (' + bar.count + ')');

  await page.evaluate(() => _fzSortFromSelect('km:desc'));
  await page.waitForTimeout(250);
  const listNrs = await page.evaluate(() => Array.from(document.querySelectorAll('#fzList .fz-lnr')).map(e => e.textContent));
  ok(listNrs.join(',') === '10,30,20,40', 'Die Liste folgt der gewaehlten Sortierung (' + listNrs.join(',') + ')');

  ok(page.errs.length === 0, 'Keine JS-Fehler (' + (page.errs[0] || '—') + ')');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— C2) Ansicht: Desktop-Standard + gemerkte Wahl —');
{
  seedStore();
  const { ctx, page } = await openPage({ users: TEAM_KLASSISCH });
  const aktiv2 = () => page.evaluate(() => { const b = document.querySelector('#viewToggle .seg.active'); return b ? b.dataset.view : ''; });
  ok(await aktiv2() === 'cards', 'Auf dem Desktop bleiben die Karten der Standard');
  const seg = await page.evaluate(() => Array.from(document.querySelectorAll('#viewToggle .seg')).map(b => b.dataset.view));
  ok(seg.join(',') === 'cards,list,table', 'Der Umschalter bietet Karten / Liste / Tabelle');
  await page.evaluate(() => _fzSetView('list'));
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  ok(await aktiv2() === 'list', 'Eine bewusst gewaehlte Ansicht ueberlebt den Reload');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— D) Filter-Dialog (Handy-Ersatz fuer die versteckten Selects) —');
{
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 844 }, mobile: true, users: TEAM_KLASSISCH });

  const knopf = await page.evaluate(() => {
    const l = document.getElementById('fzListFilter'), t = document.getElementById('fzFilterBtn');
    const sel = document.getElementById('filterStatus');
    return {
      lb: !!l, tb: !!t,
      lVis: l ? getComputedStyle(l).display !== 'none' : false,
      tVis: t ? getComputedStyle(t).display !== 'none' : false,
      selVis: sel ? getComputedStyle(sel).display !== 'none' : true
    };
  });
  ok(knopf.lb && knopf.lVis, 'Die Listen-Leiste traegt den Filter-Knopf');
  ok(!knopf.selVis, 'Die Filter-Selects sind auf dem Handy ausgeblendet');
  ok(knopf.tb && !knopf.tVis, 'In der Listenansicht erscheint der Toolbar-Knopf NICHT doppelt');

  // Status/Typ/Zuteilung schreiben in die BESTEHENDEN Selects (eine Wahrheit)
  await page.evaluate(() => _fzFilterOpen());
  await page.waitForTimeout(250);
  const felder = await page.evaluate(() => ['ff_status', 'ff_type', 'ff_assign', 'ff_driver', 'ff_dept', 'ff_buildout', 'ff_service', 'ff_mfk', 'ff_defekt'].map(id => !!document.getElementById(id)));
  ok(felder.every(Boolean), 'Der Dialog bietet Status/Typ/Zuteilung/Fahrer/Abteilung/Ausbau + MFK/Service/Defekte');

  await page.evaluate(() => { document.getElementById('ff_assign').value = 'sharing'; _fzFilterApply(); });
  await page.waitForTimeout(300);
  const nachZut = await nrsOf(page);
  ok(nachZut.join(',') === '10,40', 'Zuteilung «Sharing» filtert richtig (' + nachZut.join(',') + ')');
  ok(await page.evaluate(() => document.getElementById('filterAssignment').value) === 'sharing',
    'Der Dialog schreibt in den BESTEHENDEN Select — eine Filter-Wahrheit');

  // Zusatzkriterien — IMMER ueber den Dialog, das ist der echte Bedienweg
  const filtern = async felder => {
    await page.evaluate(() => _fzFilterOpen());
    await page.waitForTimeout(200);
    await page.evaluate(f => {
      ['ff_status', 'ff_type', 'ff_assign', 'ff_driver', 'ff_dept', 'ff_buildout'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = f[id] || '';
      });
      ['ff_service', 'ff_mfk', 'ff_defekt'].forEach(id => {
        const el = document.getElementById(id); if (el) el.checked = !!f[id];
      });
      _fzFilterApply();
    }, felder);
    await page.waitForTimeout(300);
  };

  await filtern({ ff_dept: 'sanit' });
  ok((await nrsOf(page)).join(',') === '30', 'Abteilung filtert als Teiltreffer, gross-/kleinschreibungsunabhaengig');

  await filtern({ ff_defekt: true });
  ok((await nrsOf(page)).join(',') === '10', 'Filter «Offene Defekte» findet genau das defekte Fahrzeug');

  await filtern({ ff_mfk: true });
  ok((await nrsOf(page)).join(',') === '10', 'Filter «MFK innert 60 Tagen» findet genau das faellige Fahrzeug');

  await filtern({ ff_driver: 'brunner' });
  ok((await nrsOf(page)).join(',') === '40', 'Fahrer filtert als Teiltreffer');

  await filtern({ ff_buildout: 'regal' });
  ok((await nrsOf(page)).join(',') === '10', 'Ausbau filtert als Teiltreffer');

  // Badge zaehlt die aktiven Kriterien, Zuruecksetzen raeumt alles ab
  await filtern({ ff_status: 'aktiv', ff_driver: 'brunner', ff_mfk: true });
  const badge = await page.evaluate(() => {
    const b = document.getElementById('fzListFilterCt');
    return { txt: b.textContent, vis: getComputedStyle(b).display !== 'none', on: document.getElementById('fzListFilter').classList.contains('on') };
  });
  ok(badge.vis && badge.txt === '3', 'Der Knopf zeigt die Zahl der aktiven Kriterien (' + badge.txt + ')');
  ok(badge.on, 'Der Filter-Knopf ist als aktiv markiert');

  await page.evaluate(() => _fzFilterReset());
  await page.waitForTimeout(250);
  const zurueck = await page.evaluate(() => ({
    n: _fzPermHooks.filtered().length,
    status: document.getElementById('filterStatus').value,
    assign: document.getElementById('filterAssignment').value,
    badgeVis: getComputedStyle(document.getElementById('fzListFilterCt')).display !== 'none'
  }));
  ok(zurueck.n === 4 && zurueck.status === '' && zurueck.assign === '', 'Zuruecksetzen raeumt ALLE Kriterien ab');
  ok(!zurueck.badgeVis, 'Der Zaehler verschwindet wieder');

  // In der Kartenansicht uebernimmt der Toolbar-Knopf
  await page.evaluate(() => _fzSetView('cards'));
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('fzFilterBtn')).display !== 'none'),
    'Ausserhalb der Liste traegt die Toolbar den Filter-Knopf');

  ok(page.errs.length === 0, 'Keine JS-Fehler (' + (page.errs[0] || '—') + ')');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— E) Native Handy-Ansicht —');
{
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await page.waitForTimeout(600);

  ok(await page.evaluate(() => document.documentElement.classList.contains('gn-native-on')),
    'Auf dem Handy ist die native App-Ansicht der Standard');

  // Native Liste folgt der EINEN Sortierung
  await page.evaluate(() => _fzSortFromSelect('km:desc'));
  await page.waitForTimeout(700);
  const natTitel = () => page.evaluate(() => Array.from(document.querySelectorAll('.gn .gn-row-title')).map(e => e.textContent));
  const kmOrder = await natTitel();
  ok(/Ford/.test(kmOrder[0] || ''), 'Die native Liste folgt der Sortierung (' + (kmOrder[0] || '—') + ' zuerst)');
  await page.evaluate(() => _fzSortFromSelect('km:asc'));
  await page.waitForTimeout(700);
  const kmOrder2 = await natTitel();
  ok(/Renault/.test(kmOrder2[0] || ''), 'Umgedreht steht das km-aermste Fahrzeug zuoberst (' + (kmOrder2[0] || '—') + ')');

  // Filter-Sheet kennt Fahrer / MFK / Defekte / Sortierung
  await page.evaluate(() => { const b = document.querySelector('.gn [data-nat-filter]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(() => {
    const s = document.querySelector('.gn-sheet');
    if (!s) return null;
    const f = n => !!s.querySelector('[data-f="' + n + '"]');
    const sortSel = s.querySelector('[data-f="sort"]');
    return { zut: f('zut'), dept: f('dept'), fahrer: f('fahrer'), mfk: f('mfk'), defekt: f('defekt'), sort: f('sort'), sortOpts: sortSel ? sortSel.options.length : 0 };
  });
  ok(sheet && sheet.zut && sheet.dept, 'Das Filter-Sheet kennt weiterhin Zuteilung + Abteilung');
  ok(sheet && sheet.fahrer && sheet.mfk && sheet.defekt, 'Das Filter-Sheet kennt neu Fahrer, MFK und offene Defekte');
  ok(sheet && sheet.sort && sheet.sortOpts >= 12, 'Das Filter-Sheet kennt die Sortierung (' + (sheet ? sheet.sortOpts : 0) + ' Kriterien)');

  await page.evaluate(() => {
    const s = document.querySelector('.gn-sheet');
    s.querySelector('[data-f="defekt"]').checked = true;
    s.querySelector('[data-f="sort"]').value = 'nr:asc';
    const btn = Array.from(s.querySelectorAll('button')).find(b => /Anwenden/.test(b.textContent));
    btn.click();
  });
  await page.waitForTimeout(900);
  const gefiltert = await natTitel();
  ok(gefiltert.length === 1 && /Ford/.test(gefiltert[0]), 'Angewendeter Defekt-Filter zeigt genau ein Fahrzeug (' + gefiltert.join(', ') + ')');
  const dot = await page.evaluate(() => { const d = document.querySelector('.gn [data-nat-filter] .gn-dot'); return d ? d.textContent : ''; });
  ok(dot === '1', 'Das Filter-Symbol traegt den Zaehler der aktiven Kriterien (' + dot + ')');

  ok(page.errs.length === 0, 'Keine JS-Fehler (' + (page.errs[0] || '—') + ')');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— E2) Native Zuweisung: Fahrer aus dem Team —');
{
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.gn [data-nat-id]'));
    const r = rows.find(x => x.getAttribute('data-nat-id') === 'v_1700000000003_c');
    if (r) r.click();
  });
  await page.waitForTimeout(700);
  const sheetDa = await page.evaluate(() => !!document.querySelector('.gn-sheet'));
  ok(sheetDa, 'Der Tap auf die Zeile oeffnet das native Fahrzeug-Sheet');
  await page.evaluate(() => {
    const s = document.querySelector('.gn-sheet');
    const b = Array.from(s.querySelectorAll('.gn-select')).find(x => /Fahrer zuweisen/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  const nat = await page.evaluate(() => {
    const s = document.querySelector('.gn-sheet');
    const d = s && s.querySelector('[data-f="driver"]');
    return d ? { tag: d.tagName, opts: Array.from(d.options).map(o => o.value) } : null;
  });
  ok(nat && nat.tag === 'SELECT', 'Auch nativ ist der Fahrer eine Auswahl, kein Textfeld');
  ok(nat && nat.opts.indexOf('Anna Ammann') >= 0, 'Die native Auswahl listet das Team (' + (nat ? nat.opts.filter(Boolean).join(', ') : '—') + ')');
  if (nat) {
    await page.evaluate(() => {
      const s = document.querySelector('.gn-sheet');
      s.querySelector('[data-f="driver"]').value = 'Anna Ammann';
      const btn = Array.from(s.querySelectorAll('button')).find(b => /Speichern/.test(b.textContent));
      btn.click();
    });
    await page.waitForTimeout(900);
    const drv = await page.evaluate(() => ((window._fzPermHooks.vehicles() || []).find(x => x.id === 'v_1700000000003_c') || {}).driver);
    ok(drv === 'Anna Ammann', 'Die native Zuweisung speichert ueber die echte Modul-Kette');
  }
  ok(page.errs.length === 0, 'Keine JS-Fehler (' + (page.errs[0] || '—') + ')');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
