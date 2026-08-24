// Werkzeugmanagement — von JEDEM Werkzeug direkt in seinen Koffer springen
// (User-Wunsch 22.08.2026: «Im werkzeugmanagement soll man von jedem werkzeug
// direkt in den koffer switchen können, sofern dieses in einem koffer drinn ist»).
//
// Vorher war der Koffer von einem Teil aus NIRGENDS erreichbar — einzig die
// Desktop-Karte nannte seinen Namen als toten Text.
//
//   A) Detailansicht: Teil zeigt «Im Koffer …» + Sprung; Koffer selbst nicht;
//      Werkzeug ohne Koffer zeigt gar nichts.
//   B) Desktop-Karte: Knopf «→ Zum Koffer» oeffnet das Koffer-Detail.
//   C) Kompakte Liste: Sprung-Chip; im Bulk-Modus bewusst NICHT (dort waehlt
//      der Zeilen-Tap aus).
//   D) Tabelle: 🧰-Aktion in der Aktionen-Spalte.
//   E) Scan-Ansicht: Sprung fuer JEDE Rolle (auch Monteur) — und er schliesst
//      das Scan-Overlay (z 10000), sonst laege das Detail (500) unsichtbar
//      darunter. GEMESSEN via elementFromPoint.
//   F) Natives Handy-Sheet: Info-Zeile + Aktion; Koffer-Name ist ESCAPED
//      (natAct setzt sein Label roh ein).
//   G) Kein stiller Nulleffekt: Koffer weg → Meldung statt nichts.
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_koffer_sprung_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8913;
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
// k_1 traegt zwei Teile; t_frei liegt in keinem Koffer (Gegenstueck).
// k_x traegt einen boesartigen Namen — fuer die Escaping-Pruefung im
// nativen Sheet (natAct setzt sein Label ROH ein).
const XSS = 'Koffer <img src=x onerror="window.__xss=1">';
const TOOLS = [
  { id: 't_1700000000001_akku', name: 'Akku 5.2Ah', cat: 'ladegeraet',   brand: 'Hilti', model: 'B22', internKennung: 'WZ-101', bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1700000000002_lade', name: 'Ladegerät',  cat: 'ladegeraet',   brand: 'Hilti', model: 'C4',  bought: '2025-01-10', orgId: 'org_t' },
  { id: 't_1700000000003_frei', name: 'Zange',      cat: 'handwerkzeug', brand: 'Knipex', model: 'K1', bought: '2025-03-01', orgId: 'org_t' },
  { id: 't_1700000000004_xss',  name: 'Sägeblatt',  cat: 'handwerkzeug', brand: 'Bosch', model: 'S1',  bought: '2025-03-01', orgId: 'org_t' },
  { id: 'k_1700000000010_kof',  name: 'Bohrhammer-Set', cat: 'koffer', internKennung: 'KOF-01', bought: '2025-01-10', orgId: 'org_t',
    kofferInhalt: ['t_1700000000001_akku', 't_1700000000002_lade'] },
  { id: 'k_1700000000011_xss',  name: XSS, cat: 'koffer', bought: '2025-01-10', orgId: 'org_t',
    kofferInhalt: ['t_1700000000004_xss'] }
];
function seedStore() {
  store.clear();
  TOOLS.forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-08-01T00:00:00Z' }));
}
const TEIL = 't_1700000000001_akku', FREI = 't_1700000000003_frei', KOF = 'k_1700000000010_kof', TEIL_X = 't_1700000000004_xss';

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const U_MAG = { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } };
const U_MON = { id: 'u_mon', username: 'mon@t.ch', name: 'Monteur M', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'mon@t.ch' } };
const klassisch = u => Object.assign({}, u, { profile: Object.assign({}, u.profile, { nativeAnsicht: false }) });
// Die App-Ansicht ist seit 24.08.2026 NICHT mehr der Phone-Standard — wer sie
// prüfen will, schaltet sie wie ein echter Nutzer in sys_profil ein (Profil-Flag
// + der Cache, den sys_profil dabei mitschreibt).
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
    gema_orgs_v1: [ORG], gema_users_v1: [user],
    gema_session_v1: { token: 'x.y.z', userId: user.id, expires: FUTURE },
    gema_coachmarks_done_if_werkzeug: '1'
  };
  if (opts.extra) Object.assign(seed, opts.extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html' + (opts.query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}
// Welches Geraet zeigt das klassische Detail-Modal gerade?
const detail = page => page.evaluate(() => {
  const m = document.getElementById('viewModal');
  return {
    offen: !!m && !m.classList.contains('hidden'),
    name: (document.getElementById('vm_name') || {}).textContent || '',
    kofferBox: !!document.getElementById('vm_kofferBox'),
    teilBox: !!document.getElementById('vm_kofferOfBox')
  };
});

// ══════════════════════════════════════════════════════════════════
console.log('— A) Detailansicht: Teil ⇄ Koffer —');
{
  seedStore();
  const { ctx, page } = await openPage();

  await page.evaluate(id => openViewTool(id), TEIL);
  await page.waitForTimeout(200);
  const dTeil = await detail(page);
  ok(dTeil.offen && dTeil.name === 'Akku 5.2Ah', 'Detail des Teils ist offen');
  ok(dTeil.teilBox, 'Teil-Detail zeigt die Box «Im Koffer …» (#vm_kofferOfBox)');
  ok(!dTeil.kofferBox, 'Teil-Detail zeigt KEINE Koffer-Inhalt-Box');
  const boxTxt = await page.evaluate(() => (document.getElementById('vm_kofferOfBox') || {}).textContent || '');
  ok(/Bohrhammer-Set/.test(boxTxt), 'die Box nennt den Koffer beim Namen');
  ok(/2 Teile/.test(boxTxt), 'die Box nennt die Zahl der Teile im Koffer (' + boxTxt.replace(/\s+/g, ' ').trim().slice(0, 70) + ')');

  // Der Sprung zeichnet IN das bereits offene Modal (kein Schliessen, kein
  // Flackern) — der Scroll-Stand des Teils darf dabei NICHT stehenbleiben,
  // sonst erschiene der Koffer mittendrin. Fuer die MESSUNG wird der Rumpf
  // kuenstlich klein gemacht, damit er ueberhaupt scrollen kann.
  const scrollVor = await page.evaluate(() => {
    const b = document.getElementById('vm_body');
    b.style.maxHeight = '120px'; b.style.overflowY = 'auto';
    b.scrollTop = 9999; return b.scrollTop;
  });
  ok(scrollVor > 0, 'Messvorbereitung: der Modal-Rumpf ist gescrollt (' + scrollVor + 'px)');

  // Sprung
  await page.evaluate(() => document.querySelector('#vm_kofferOfBox button').click());
  await page.waitForTimeout(400);
  const dKof = await detail(page);
  ok(dKof.offen && dKof.name === 'Bohrhammer-Set', 'der Sprung oeffnet die Detailansicht DES KOFFERS');
  ok(dKof.kofferBox && !dKof.teilBox, 'im Koffer-Detail steht die Inhalt-Box, keine «Im Koffer»-Box');
  const scrollNach = await page.evaluate(() => document.getElementById('vm_body').scrollTop);
  ok(scrollNach === 0, 'der Sprung setzt den Scroll-Stand zurueck — der Koffer erscheint oben');

  // Gegenprobe: openViewTool ALLEIN setzt den Scroll NICHT zurueck — der Reset
  // kommt nachweislich aus _wzKofferSpringen.
  const gegen = await page.evaluate(id => {
    const b = document.getElementById('vm_body');
    b.scrollTop = 9999; const vor = b.scrollTop;
    openViewTool(id);
    return { vor: vor, nach: b.scrollTop };
  }, TEIL);
  ok(gegen.vor > 0 && gegen.nach === gegen.vor, 'Gegenprobe: ohne den Sprung bliebe der Scroll-Stand stehen (' + gegen.vor + 'px)');
  await page.evaluate(() => { const b = document.getElementById('vm_body'); b.style.maxHeight = ''; b.style.overflowY = ''; });

  // Werkzeug ohne Koffer: gar nichts
  await page.evaluate(() => closeView());
  await page.evaluate(id => openViewTool(id), FREI);
  await page.waitForTimeout(200);
  const dFrei = await detail(page);
  ok(dFrei.name === 'Zange' && !dFrei.teilBox && !dFrei.kofferBox, 'Werkzeug ohne Koffer zeigt keine Koffer-Box');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— B) Desktop-Karte —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => setView('cards'));
  await page.waitForTimeout(300);

  const karte = await page.evaluate(id => {
    const c = document.querySelector('.tool-card[data-bulk-id="' + id + '"]');
    if (!c) return { da: false };
    const b = Array.from(c.querySelectorAll('button')).find(x => /Zum Koffer/.test(x.textContent));
    return { da: true, knopf: !!b, titel: b ? b.getAttribute('title') : '', stop: b ? /stopPropagation/.test(b.getAttribute('onclick') || '') : false,
      text: (c.textContent.match(/Im Koffer [^\n]*/) || [''])[0].trim().slice(0, 40) };
  }, TEIL);
  ok(karte.da, 'Karte des Teils gefunden');
  ok(karte.knopf, 'die Karte hat den Knopf «→ Zum Koffer»');
  ok(/Bohrhammer-Set/.test(karte.titel || ''), 'der Knopf nennt den Koffer im Tooltip (' + karte.titel + ')');
  ok(karte.stop, 'der Knopf stoppt den Karten-Klick (stopPropagation)');

  await page.evaluate(id => {
    const c = document.querySelector('.tool-card[data-bulk-id="' + id + '"]');
    Array.from(c.querySelectorAll('button')).find(x => /Zum Koffer/.test(x.textContent)).click();
  }, TEIL);
  await page.waitForTimeout(400);
  const d = await detail(page);
  ok(d.offen && d.name === 'Bohrhammer-Set', 'der Karten-Knopf oeffnet den KOFFER, nicht das Teil');

  // Gegenstueck: Karte des Koffers hat den Sprung nicht (dort steht «🧰 Inhalt»)
  const kofKarte = await page.evaluate(id => {
    const c = document.querySelector('.tool-card[data-bulk-id="' + id + '"]');
    if (!c) return { da: false };
    return { da: true, sprung: !!Array.from(c.querySelectorAll('button')).find(x => /Zum Koffer/.test(x.textContent)),
      inhalt: !!Array.from(c.querySelectorAll('button')).find(x => /Inhalt/.test(x.textContent)) };
  }, KOF);
  ok(kofKarte.da && !kofKarte.sprung && kofKarte.inhalt, 'die Koffer-Karte hat «🧰 Inhalt», aber keinen Sprung auf sich selbst');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— C) Kompakte Liste —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => setView('list'));
  await page.waitForTimeout(300);

  const chip = await page.evaluate(id => {
    const r = document.querySelector('.wz-lrow[data-bulk-id="' + id + '"]');
    if (!r) return { da: false };
    const b = r.querySelector('button.wz-lchip');
    return { da: true, chip: !!b, txt: b ? b.textContent.trim() : '', titel: b ? b.getAttribute('title') : '' };
  }, TEIL);
  ok(chip.da, 'Listenzeile des Teils gefunden');
  ok(chip.chip && /Bohrhammer-Set/.test(chip.txt), 'die Zeile hat einen Sprung-Chip mit dem Koffer-Namen (' + chip.txt + ')');

  await page.evaluate(id => document.querySelector('.wz-lrow[data-bulk-id="' + id + '"] button.wz-lchip').click(), TEIL);
  await page.waitForTimeout(400);
  const d = await detail(page);
  ok(d.offen && d.name === 'Bohrhammer-Set', 'der Chip oeffnet das Koffer-Detail');

  // Gegenprobe: im Bulk-Modus waehlt der Tap aus — dort darf der Chip NICHT stehen
  await page.evaluate(() => closeView());
  await page.evaluate(() => _wzToggleBulkMode());
  await page.waitForTimeout(300);
  const imBulk = await page.evaluate(id => {
    const r = document.querySelector('.wz-lrow[data-bulk-id="' + id + '"]');
    return { r: !!r, chip: !!(r && r.querySelector('button.wz-lchip')) };
  }, TEIL);
  ok(imBulk.r && !imBulk.chip, 'im Bulk-Modus gibt es KEINEN Sprung-Chip (Tap = auswaehlen)');
  await page.evaluate(() => _wzToggleBulkMode());
  await page.waitForTimeout(250);
  const wieder = await page.evaluate(id => !!document.querySelector('.wz-lrow[data-bulk-id="' + id + '"] button.wz-lchip'), TEIL);
  ok(wieder, 'ausserhalb des Bulk-Modus ist der Chip wieder da (Gegenprobe)');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— D) Tabelle —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(() => setView('table'));
  await page.waitForTimeout(300);

  const tab = await page.evaluate(ids => {
    const zeile = id => Array.from(document.querySelectorAll('#tableWrap tbody tr'))
      .find(tr => tr.innerHTML.indexOf(id) >= 0);
    const knopf = id => { const tr = zeile(id); return tr ? Array.from(tr.querySelectorAll('button')).find(b => /🧰/.test(b.textContent)) : null; };
    const bTeil = knopf(ids.teil), bKof = knopf(ids.kof), bFrei = knopf(ids.frei);
    return { teil: !!bTeil, titel: bTeil ? bTeil.getAttribute('title') : '', kof: !!bKof, frei: !!bFrei };
  }, { teil: TEIL, kof: KOF, frei: FREI });
  ok(tab.teil, 'die Tabellenzeile des Teils hat die 🧰-Aktion');
  ok(/Bohrhammer-Set/.test(tab.titel || ''), 'der Tooltip nennt den Koffer (' + tab.titel + ')');
  ok(!tab.kof, 'der Koffer selbst hat keine 🧰-Aktion');
  ok(!tab.frei, 'ein Werkzeug ohne Koffer hat keine 🧰-Aktion');

  await page.evaluate(id => {
    const tr = Array.from(document.querySelectorAll('#tableWrap tbody tr')).find(x => x.innerHTML.indexOf(id) >= 0);
    Array.from(tr.querySelectorAll('button')).find(b => /🧰/.test(b.textContent)).click();
  }, TEIL);
  await page.waitForTimeout(400);
  const d = await detail(page);
  ok(d.offen && d.name === 'Bohrhammer-Set', 'die Tabellen-Aktion oeffnet das Koffer-Detail');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— E) Scan-Ansicht (Schichtung GEMESSEN) —');
{
  seedStore();
  const { ctx, page } = await openPage();
  await page.evaluate(id => _wzScanAusleihe(id), TEIL);
  await page.waitForTimeout(300);
  const scan = await page.evaluate(() => {
    const o = document.getElementById('wzScanOverlay');
    const b = o ? Array.from(o.querySelectorAll('button')).find(x => /Zum Koffer/.test(x.textContent)) : null;
    return { overlay: !!o, knopf: !!b, txt: b ? b.textContent.trim() : '' };
  });
  ok(scan.overlay, 'Scan-Ansicht des Teils ist offen');
  ok(scan.knopf && /Bohrhammer-Set/.test(scan.txt), 'die Scan-Ansicht hat «🧰 Zum Koffer …» (' + scan.txt + ')');

  await page.evaluate(() => Array.from(document.querySelectorAll('#wzScanOverlay button')).find(x => /Zum Koffer/.test(x.textContent)).click());
  await page.waitForTimeout(600);
  const nach = await page.evaluate(() => {
    const m = document.getElementById('viewModal');
    const r = document.getElementById('vm_name').getBoundingClientRect();
    const oben = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
      overlay: !!document.getElementById('wzScanOverlay'),
      name: document.getElementById('vm_name').textContent,
      offen: !!m && !m.classList.contains('hidden'),
      imModal: !!(oben && oben.closest && oben.closest('#viewModal'))
    };
  });
  ok(!nach.overlay, 'der Sprung schliesst das Scan-Overlay (z 10000 laege ueber dem Modal)');
  ok(nach.offen && nach.name === 'Bohrhammer-Set', 'das Koffer-Detail ist offen');
  ok(nach.imModal, 'das Koffer-Detail ist wirklich obenauf (elementFromPoint trifft #viewModal)');

  // Gegenprobe: liegt das Scan-Overlay noch da, trifft elementFromPoint es —
  // die Messung oben ist also aussagekraeftig.
  const gp = await page.evaluate(() => {
    const o = document.createElement('div');
    o.id = 'wzScanOverlay';
    o.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#fff';
    document.body.appendChild(o);
    const r = document.getElementById('vm_name').getBoundingClientRect();
    const oben = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const treffer = !!(oben && oben.closest && oben.closest('#viewModal'));
    o.remove();
    return treffer;
  });
  ok(!gp, 'Gegenprobe: mit stehendem Scan-Overlay waere das Detail verdeckt');

  // Monteur darf ebenfalls springen (er darf das Teil scannen)
  await ctx.close();
  seedStore();
  const m = await openPage({ user: klassisch(U_MON) });
  await m.page.evaluate(id => _wzScanAusleihe(id), TEIL);
  await m.page.waitForTimeout(300);
  const mon = await m.page.evaluate(() => {
    const o = document.getElementById('wzScanOverlay');
    return {
      sprung: !!(o && Array.from(o.querySelectorAll('button')).find(x => /Zum Koffer/.test(x.textContent))),
      details: !!(o && Array.from(o.querySelectorAll('button')).find(x => /Details/.test(x.textContent)))
    };
  });
  ok(mon.sprung, 'auch der Monteur kann aus dem Scan in den Koffer springen');
  ok(!mon.details, 'der Monteur bekommt weiterhin KEINE Details/Bearbeiten-Knoepfe (Rechte unveraendert)');
  ok(m.page.errs.length === 0, 'keine pageerrors');
  await m.ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— F) Natives Handy-Sheet —');
{
  seedStore();
  const { ctx, page } = await openPage({ viewport: { width: 390, height: 844 }, mobile: true, user: nativ(U_MAG),
    extra: { gema_native_view_v1: 'native' } });
  await page.waitForTimeout(500);
  const natAn = await page.evaluate(() => document.documentElement.classList.contains('gn-native-on'));
  ok(natAn, 'die eingeschaltete App-Ansicht ist auf dem Phone aktiv');

  await page.evaluate(id => document.querySelector('.gn--page [data-nat-id="' + id + '"]').click(), TEIL);
  await page.waitForTimeout(500);
  const sheet = await page.evaluate(() => {
    const s = document.querySelector('.gn-sheet');
    if (!s) return { da: false };
    const kv = Array.from(s.querySelectorAll('.gn-kv')).map(e => e.textContent.replace(/\s+/g, ' ').trim());
    const act = s.querySelector('[data-nats="koffer"]');
    return { da: true, kv: kv, act: !!act, actTxt: act ? act.textContent.trim() : '' };
  });
  ok(sheet.da, 'natives Detail-Sheet des Teils ist offen');
  ok(sheet.kv.some(t => /Im Koffer/.test(t) && /Bohrhammer-Set/.test(t)), 'das Sheet zeigt die Zeile «Im Koffer»');
  ok(sheet.act && /Zum Koffer/.test(sheet.actTxt), 'das Sheet hat die Aktion «🧰 Zum Koffer …»');

  await page.evaluate(() => document.querySelector('.gn-sheet [data-nats="koffer"]').click());
  await page.waitForTimeout(700);
  const d = await page.evaluate(() => {
    const m = document.getElementById('viewModal');
    return { offen: !!m && !m.classList.contains('hidden'), name: document.getElementById('vm_name').textContent,
      kofferBox: !!document.getElementById('vm_kofferBox') };
  });
  ok(d.offen && d.name === 'Bohrhammer-Set', 'die native Aktion oeffnet den Koffer (klassisches Detail — dort liegen alle Koffer-Funktionen)');
  ok(d.kofferBox, 'im Koffer-Detail steht die Inhalt-Box');

  // Escaping: natAct setzt sein Label ROH ein — ein boesartiger Koffer-Name
  // darf im Sheet KEIN Element erzeugen.
  await page.evaluate(() => { const m = document.getElementById('viewModal'); if (m) m.classList.add('hidden'); });
  await page.evaluate(id => document.querySelector('.gn--page [data-nat-id="' + id + '"]').click(), TEIL_X);
  await page.waitForTimeout(500);
  const xss = await page.evaluate(() => {
    const a = document.querySelector('.gn-sheet [data-nats="koffer"]');
    return { act: !!a, img: !!(a && a.querySelector('img')), txt: a ? a.textContent.trim().slice(0, 60) : '', flag: !!window.__xss };
  });
  ok(xss.act, 'auch beim boesartig benannten Koffer erscheint die Aktion');
  ok(!xss.img && !xss.flag, 'der Koffer-Name ist ESCAPED — kein eingeschleustes Element (' + xss.txt + ')');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
console.log('— G) Kein stiller Nulleffekt —');
{
  seedStore();
  const { ctx, page } = await openPage();
  // Teil wurde inzwischen aus dem Koffer entfernt (anderes Geraet/Tab)
  const res = await page.evaluate(ids => {
    const k = tools.find(x => x.id === ids.kof);
    k.kofferInhalt = [];
    _wzKofferSpringen(ids.teil);
    const m = document.getElementById('viewModal');
    return { modalOffen: !!m && !m.classList.contains('hidden'),
      dlg: !!document.querySelector('.gema-dlg-bg, .gema-dialog, [class*="gema-dlg"]') };
  }, { teil: TEIL, kof: KOF });
  await page.waitForTimeout(300);
  const txt = await page.evaluate(() => document.body.textContent);
  ok(!res.modalOffen, 'ohne Koffer oeffnet sich KEIN Detail');
  ok(/liegt in keinem Koffer/.test(txt), 'stattdessen wird es gesagt (Meldung statt Nulleffekt)');

  // Gegenprobe: mit intaktem Koffer oeffnet derselbe Aufruf das Detail —
  // der Test sieht den Unterschied also wirklich.
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^(OK|Schliessen)$/i.test(x.textContent.trim())); if (b) b.click(); });
  await page.waitForTimeout(250);
  await page.evaluate(ids => {
    tools.find(x => x.id === ids.kof).kofferInhalt = [ids.teil];
    _wzKofferSpringen(ids.teil);
  }, { teil: TEIL, kof: KOF });
  await page.waitForTimeout(400);
  const d = await detail(page);
  ok(d.offen && d.name === 'Bohrhammer-Set', 'Gegenprobe: mit Koffer oeffnet derselbe Aufruf das Detail');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
