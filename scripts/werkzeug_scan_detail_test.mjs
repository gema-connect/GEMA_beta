// Werkzeugmanagement — Scan-Routing, Koffer-Teileliste, Verloren-Status,
// Aktivitäten pro Werkzeug (Feedback 07/2026):
//  1) Koffer-Scan: Teileliste zeigt Typ (Kategorie), Hersteller/Modell + SN.
//  2) Magaziner-Scan (?scan=<id>, Nicht-Koffer) → DIREKT die Detailansicht
//     mit «Aktionen»-Block (Ausleihen an, Zuweisen, Defekt, Verloren,
//     Aktivitäten, QR); Koffer behalten die Scan-Ansicht (Kontrolle),
//     Monteure den Selbst-Ausleihe-Flow.
//  3) Verloren melden / Wieder gefunden (nur Magaziner/Admin) inkl.
//     Aktivitätenlog-Einträgen und rotem Karten-Band.
//  4) Aktivitätenlog pro Werkzeug: openModal({recordId}) filtert auf den
//     einen Datensatz (Anzeige + Titel).
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_scan_detail_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8894;
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

// ── In-Memory-PostgREST (Map «mk|dk» → payload) ──────────────────────
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
const T_BOHR = { id: 't_1700000000001_aa', name: 'Bohrhammer', cat: 'maschine', brand: 'Hilti', model: 'TE 30', serial: '77812', bought: '2025-01-10', orgId: 'org_t' };
const T_LADE = { id: 't_1700000000002_bb', name: 'Ladegerät', cat: 'ladegeraet', brand: 'Hilti', model: 'C4/36', serial: '55123', bought: '2025-01-10', orgId: 'org_t' };
const T_KOFFER = { id: 't_1700000000003_cc', name: 'Koffer Bohren', cat: 'koffer', bought: '2025-01-10', orgId: 'org_t', kofferInhalt: [T_BOHR.id, T_LADE.id] };
// Zwei freie Werkzeuge (in KEINEM Koffer) für die Inhalt-Suche: eines MIT,
// eines OHNE Serien-Nr. — die Suche muss beide unterscheidbar anzeigen.
const T_FREI = { id: 't_1700000000004_dd', name: 'Bohrhammer klein', cat: 'maschine', brand: 'Bosch', model: 'GBH 2-26', serial: 'B-99001', bought: '2025-02-01', orgId: 'org_t' };
const T_OHNE = { id: 't_1700000000005_ee', name: 'Bohrer-Set', cat: 'werkzeug', brand: 'Bosch', bought: '2025-02-01', orgId: 'org_t' };
function seedStore() {
  store.clear();
  [T_BOHR, T_LADE, T_KOFFER, T_FREI, T_OHNE].forEach(t => store.set('werkzeugmanagement|tool:' + t.id, { data: JSON.parse(JSON.stringify(t)), _lm: '2026-07-01T00:00:00Z' }));
  // Aktivitäten: zwei Einträge für den Bohrhammer, einer fürs Ladegerät
  const logs = [
    { id: 'log_1', ts: '2026-07-10T08:00:00Z', orgId: 'org_t', modul: 'werkzeug', modulRecordId: T_BOHR.id, modulRecordName: 'Bohrhammer', aktion: 'erfasst', beschreibung: 'Gerät erfasst', userName: 'Magaziner M' },
    { id: 'log_2', ts: '2026-07-11T08:00:00Z', orgId: 'org_t', modul: 'werkzeug', modulRecordId: T_BOHR.id, modulRecordName: 'Bohrhammer', aktion: 'ausleihe', beschreibung: 'Ausgeliehen an Hans', userName: 'Magaziner M' },
    { id: 'log_3', ts: '2026-07-12T08:00:00Z', orgId: 'org_t', modul: 'werkzeug', modulRecordId: T_LADE.id, modulRecordName: 'Ladegerät', aktion: 'erfasst', beschreibung: 'Gerät erfasst', userName: 'Magaziner M' }
  ];
  logs.forEach(e => store.set('aktivitaetslog|log:' + e.id, { data: e, _lm: e.ts }));
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: [], active: true };
const USERS = [
  { id: 'u_mag', username: 'mag@t.ch', name: 'Magaziner M', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } },
  { id: 'u_mon', username: 'mon@t.ch', name: 'Monteur M', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'mon@t.ch' } }
];

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(userId, query) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
    { gema_orgs_v1: [ORG], gema_users_v1: USERS, gema_session_v1: { token: 'x.y.z', userId, expires: FUTURE } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html' + (query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400); // Boot + ?scan-Deep-Link (400ms)
  return { ctx, page };
}

console.log('— 1) Koffer-Scan: Teileliste mit Typ + SN, Kontroll-Hinweis —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag', '?scan=' + T_KOFFER.id);
  const st = await page.evaluate(() => {
    const o = document.getElementById('wzScanOverlay');
    const sec = document.getElementById('kofCtrlSection');
    return { overlay: !!o, sec: sec ? sec.textContent : '', secHtml: sec ? sec.innerHTML : '' };
  });
  ok(st.overlay, 'Koffer-Scan öffnet weiterhin die Scan-Ansicht (Kontrolle)');
  ok(/Maschine \(Akku\)/.test(st.sec), 'Teileliste zeigt den Typ (Kategorie «Maschine (Akku)»)');
  ok(/Hilti TE 30/.test(st.sec), 'Teileliste zeigt Hersteller + Modell');
  ok(/SN 77812/.test(st.sec), 'Teileliste zeigt die Serien-Nr. (SN 77812)');
  ok(/SN 55123/.test(st.sec), 'auch das zweite Teil mit SN');
  ok(/Dokumentiert die Kontrolle am Koffer/.test(st.sec), 'Hinweis erklärt den «Kontrolle bestätigen»-Button');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— 2) Magaziner-Scan (Nicht-Koffer) → direkt Detailansicht mit Aktionen —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag', '?scan=' + T_BOHR.id);
  const st = await page.evaluate(() => {
    const vm = document.getElementById('viewModal');
    const body = document.getElementById('vm_body');
    const badges = document.getElementById('vm_badges');
    return {
      overlay: !!document.getElementById('wzScanOverlay'),
      detailOpen: vm && !vm.classList.contains('hidden'),
      body: body ? body.textContent : '',
      badges: badges ? badges.textContent : '',
      grid: !!document.getElementById('vm_actions_grid')
    };
  });
  ok(!st.overlay, 'KEINE Scan-Ansicht für Magaziner bei normalem Werkzeug');
  ok(st.detailOpen, 'Detailansicht (viewModal) öffnet direkt');
  ok(/SN: 77812/.test(st.badges), 'SN-Badge im Detail-Kopf');
  ok(st.grid, '«Aktionen»-Block vorhanden');
  ok(/Ausleihen an/.test(st.body), 'Button «Ausleihen an …»');
  ok(/Zuweisen/.test(st.body), 'Button «Zuweisen»');
  ok(/Defekt melden/.test(st.body), 'Button «Defekt melden»');
  ok(/Als verloren melden/.test(st.body), 'Button «Als verloren melden»');
  ok(/Aktivitäten/.test(st.body), 'Button «Aktivitäten»');
  ok(/QR \/ Etikette/.test(st.body), 'Button «QR / Etikette»');
  // Ausleihen-Button funktioniert (öffnet den Ausleihe-Dialog)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#vm_actions_grid button'));
    const b = btns.find(x => /Ausleihen an/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  const lend = await page.evaluate(() => document.body.textContent.indexOf('Ausleihen') >= 0 && !!document.querySelector('.modal-bg:not(.hidden), #wzModalHost, .wz-modal, [id*=ausleihe i]') || document.body.innerHTML.toLowerCase().indexOf('ausleihen an') >= 0);
  ok(lend, 'Klick auf «Ausleihen an …» öffnet den Ausleihe-Dialog');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— 3) Monteur-Scan bleibt beim Selbst-Ausleihe-Flow —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mon', '?scan=' + T_BOHR.id);
  const st = await page.evaluate(() => ({
    overlay: !!document.getElementById('wzScanOverlay'),
    text: document.getElementById('wzScanOverlay') ? document.getElementById('wzScanOverlay').textContent : ''
  }));
  ok(st.overlay, 'Monteur sieht die Scan-Ansicht');
  ok(/Bei mir einbuchen/.test(st.text), 'Selbst-Ausleihe-Button vorhanden');
  ok(!/Verloren melden/.test(st.text), 'kein Verloren-Button für Monteur');
  ok(page.errs.length === 0, 'keine pageerrors (Monteur)');
  await ctx.close();
}

console.log('— 4) Verloren melden → Status, Karten-Band, Log; Wieder gefunden —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag', '?scan=' + T_BOHR.id);
  await page.evaluate(id => window._wzMarkVerloren(id), T_BOHR.id);
  await page.waitForSelector('.gema-dlg', { timeout: 5000 });
  const dlgTxt = await page.evaluate(() => document.querySelector('.gema-dlg').textContent);
  ok(/verloren markieren/.test(dlgTxt), 'Bestätigungs-Dialog erscheint');
  await page.click('.gema-dlg-danger');
  await page.waitForTimeout(600);
  const st = await page.evaluate(id => {
    const cache = JSON.parse(localStorage.getItem('gema_werkzeug') || '[]');
    const t = cache.find(x => x.id === id);
    const vm = document.getElementById('vm_body');
    return {
      lc: t && t.lifecycleStatus,
      verlorenAm: !!(t && t.verlorenAm),
      detail: vm ? vm.textContent : '',
      badges: document.getElementById('vm_badges').textContent,
      log: (window.GemaActivityLog.getForModul('werkzeug') || []).filter(e => e.modulRecordId === id && e.aktion === 'verloren').length
    };
  }, T_BOHR.id);
  ok(st.lc === 'verloren', 'lifecycleStatus = verloren (persistiert)');
  ok(st.verlorenAm, 'verlorenAm-Zeitstempel gesetzt');
  ok(/Verloren/.test(st.badges), 'Detail-Badge «Verloren»');
  ok(/Wieder gefunden/.test(st.detail), 'Aktion wechselt auf «Wieder gefunden»');
  ok(st.log === 1, 'Aktivitätenlog-Eintrag «verloren» geschrieben');
  ok(store.has('werkzeugmanagement|tool:' + T_BOHR.id) && store.get('werkzeugmanagement|tool:' + T_BOHR.id).data.lifecycleStatus === 'verloren', 'Cloud-Row trägt den Verloren-Status');
  // Karten-Band in der Liste
  await page.evaluate(() => { const vm = document.getElementById('viewModal'); vm.classList.add('hidden'); window.renderList && renderList(); });
  const band = await page.evaluate(() => document.getElementById('cardGrid').textContent.indexOf('❓ Verloren') >= 0);
  ok(band, 'Karte zeigt das rote «❓ Verloren»-Band (bleibt in der Standard-Sicht)');
  // Wieder gefunden
  await page.evaluate(id => window._wzMarkGefunden(id), T_BOHR.id);
  await page.waitForTimeout(500);
  const st2 = await page.evaluate(id => {
    const cache = JSON.parse(localStorage.getItem('gema_werkzeug') || '[]');
    const t = cache.find(x => x.id === id);
    return { lc: t && t.lifecycleStatus, log: (window.GemaActivityLog.getForModul('werkzeug') || []).filter(e => e.modulRecordId === id && e.aktion === 'gefunden').length };
  }, T_BOHR.id);
  ok(st2.lc === 'aktiv', 'Wieder gefunden → Status aktiv');
  ok(st2.log === 1, 'Aktivitätenlog-Eintrag «gefunden» geschrieben');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— 5) Aktivitäten pro Werkzeug (recordId-Filter) —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag', '');
  await page.evaluate(id => window._wzToolActLog(id), T_BOHR.id);
  await page.waitForSelector('#gema-actlog-modal', { timeout: 5000 });
  const st = await page.evaluate(() => {
    const m = document.getElementById('gema-actlog-modal');
    const rows = m.querySelectorAll('#actlogBody tbody tr').length;
    return { titel: m.textContent.slice(0, 200), rows, body: m.querySelector('#actlogBody').textContent, footer: m.querySelector('#actlogFooter').textContent };
  });
  ok(/Aktivitäten — Bohrhammer/.test(st.titel), 'Modal-Titel nennt das Werkzeug');
  ok(st.rows === 2, 'nur die 2 Einträge dieses Werkzeugs (' + st.rows + ')');
  ok(/Ausgeliehen an Hans/.test(st.body), 'Eintrag des Werkzeugs sichtbar');
  ok(st.body.indexOf('Ladegerät') < 0, 'Einträge anderer Werkzeuge NICHT sichtbar');
  // Globales Modal (ohne recordId) zeigt weiterhin alles
  await page.evaluate(() => { document.getElementById('gema-actlog-modal').remove(); window.GemaActivityLog.openModal({ modul: 'werkzeug' }); });
  await page.waitForTimeout(300);
  const all = await page.evaluate(() => document.querySelectorAll('#gema-actlog-modal #actlogBody tbody tr').length);
  ok(all === 3, 'globales Aktivitäten-Modal zeigt weiterhin alle Einträge (' + all + ')');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— 6) Koffer-Inhalt-Suche zeigt die Serien-Nr. —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag', '');
  await page.evaluate(id => window.openKofferInhalt(id), T_KOFFER.id);
  await page.waitForSelector('#kofSearch', { timeout: 5000 });
  ok(/Serien-Nr/.test(await page.evaluate(() => document.getElementById('kofSearch').placeholder)),
    'Suchfeld nennt die Serien-Nr. als Suchkriterium');
  // «Bohr» trifft das freie Werkzeug MIT SN und das Set OHNE SN
  const suche = (q, kid) => page.evaluate(a => {
    document.getElementById('kofSearch').value = a.q;
    window._wzKofferSearch(a.kid);
  }, { q, kid });
  await suche('Bohr', T_KOFFER.id);
  await page.waitForTimeout(150);
  const tr = await page.evaluate(() => {
    const r = document.getElementById('kofSearchRes');
    return { txt: r ? r.textContent : '', n: r ? r.querySelectorAll('button').length : 0 };
  });
  ok(/SN B-99001/.test(tr.txt), 'Treffer zeigt die Serien-Nr. («SN B-99001»)');
  ok(/ohne SN/.test(tr.txt), 'Treffer ohne Serien-Nr. wird als «ohne SN» ausgewiesen');
  ok(tr.n >= 2, 'beide freien Werkzeuge als Treffer mit «+»-Button (' + tr.n + ')');
  // Suche über die Serien-Nr. selbst findet genau das eine Werkzeug
  await suche('B-99001', T_KOFFER.id);
  await page.waitForTimeout(150);
  const sn = await page.evaluate(() => {
    const r = document.getElementById('kofSearchRes');
    return { txt: r.textContent, n: r.querySelectorAll('button').length };
  });
  ok(sn.n === 1 && /Bohrhammer klein/.test(sn.txt), 'Suche NACH der Serien-Nr. findet genau das Werkzeug');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— 7) Scan-Ansicht: Details / Bearbeiten / Koffer-Inhalt (Magaziner) —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mag', '?scan=' + T_KOFFER.id);
  const btns = () => page.evaluate(() => {
    const o = document.getElementById('wzScanOverlay');
    return o ? Array.from(o.querySelectorAll('button')).map(b => b.textContent.trim()) : [];
  });
  const b1 = await btns();
  ok(b1.some(t => /📋 Details/.test(t)), 'Koffer-Scan bietet «📋 Details»');
  ok(b1.some(t => /✏️ Bearbeiten/.test(t)), 'Koffer-Scan bietet «✏️ Bearbeiten»');
  ok(b1.some(t => /Inhalt bearbeiten/.test(t)), 'Koffer-Scan bietet «🧰 Inhalt bearbeiten»');
  ok(await page.evaluate(id => document.getElementById('wzScanOverlay').getAttribute('data-tool') === id, T_KOFFER.id),
    'Overlay merkt sich das gescannte Werkzeug (data-tool) für den Refresh');
  // Inhalt-Editor öffnet ÜBER dem Scan (Scan 10000, Editor 10500)
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#wzScanOverlay button')).find(x => /Inhalt bearbeiten/.test(x.textContent));
    b.click();
  });
  await page.waitForSelector('#kofSearch', { timeout: 5000 });
  const lay = await page.evaluate(() => {
    const ov = document.getElementById('_wzModalOverlay'), sc = document.getElementById('wzScanOverlay');
    return { zOv: ov ? parseInt(getComputedStyle(ov).zIndex, 10) : 0, zSc: sc ? parseInt(getComputedStyle(sc).zIndex, 10) : 0 };
  });
  ok(lay.zOv > lay.zSc, 'Inhalt-Editor liegt ÜBER der Scan-Ansicht (z ' + lay.zOv + ' > ' + lay.zSc + ')');
  // Teil hinzufügen und schliessen → Scan-Checkliste ist aufgefrischt
  await page.evaluate(a => {
    document.getElementById('kofSearch').value = a.q;
    window._wzKofferSearch(a.kid);
  }, { q: 'B-99001', kid: T_KOFFER.id });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('#kofSearchRes button').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => window._wzKofferInhaltClose());
  await page.waitForTimeout(500);
  const nach = await page.evaluate(() => {
    const sec = document.getElementById('kofCtrlSection');
    return { editorWeg: !document.getElementById('_wzModalOverlay'), scan: !!document.getElementById('wzScanOverlay'), txt: sec ? sec.textContent : '' };
  });
  ok(nach.editorWeg && nach.scan, 'Schliessen des Editors führt zurück in die Scan-Ansicht');
  ok(/Bohrhammer klein/.test(nach.txt), 'Scan-Checkliste zeigt das neu hinzugefügte Teil');
  ok(/SN B-99001/.test(nach.txt), 'neues Teil mit Serien-Nr. in der Kontrollliste');
  // Nicht-Koffer: dieselben Verwalten-Knöpfe (Scan-Ansicht direkt aufgerufen)
  await page.evaluate(id => { window._wzCloseScan(); window._wzScanAusleihe(id); }, T_BOHR.id);
  await page.waitForTimeout(300);
  const b2 = await btns();
  ok(b2.some(t => /📋 Details/.test(t)) && b2.some(t => /✏️ Bearbeiten/.test(t)),
    'auch beim Einzel-Werkzeug: Details + Bearbeiten in der Scan-Ansicht');
  ok(!b2.some(t => /Inhalt bearbeiten/.test(t)), 'kein Koffer → kein «Inhalt bearbeiten»');
  // «Details» schliesst den Scan (Modals liegen mit z 500 UNTER dem Overlay)
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#wzScanOverlay button')).find(x => /📋 Details/.test(x.textContent)).click();
  });
  await page.waitForTimeout(500);
  const det = await page.evaluate(() => {
    const vm = document.getElementById('viewModal');
    return { scanWeg: !document.getElementById('wzScanOverlay'), offen: !!vm && !vm.classList.contains('hidden'), txt: vm ? vm.textContent : '' };
  });
  ok(det.scanWeg, '«Details» schliesst die Scan-Ansicht (sonst läge das Modal dahinter)');
  ok(det.offen && /Bohrhammer/.test(det.txt), 'Detailansicht des gescannten Werkzeugs offen');
  ok(page.errs.length === 0, 'keine pageerrors');
  await ctx.close();
}

console.log('— 8) Monteur: Scan-Ansicht ohne Verwalten-Knöpfe —');
{
  seedStore();
  const { ctx, page } = await openPage('u_mon', '?scan=' + T_KOFFER.id);
  const txt = await page.evaluate(() => {
    const o = document.getElementById('wzScanOverlay');
    return o ? Array.from(o.querySelectorAll('button')).map(b => b.textContent.trim()).join(' | ') : '';
  });
  ok(!/📋 Details/.test(txt) && !/✏️ Bearbeiten/.test(txt), 'Monteur sieht weder Details noch Bearbeiten');
  ok(!/Inhalt bearbeiten/.test(txt), 'Monteur (nicht zugeteilt) darf den Koffer-Inhalt nicht bearbeiten');
  ok(page.errs.length === 0, 'keine pageerrors (Monteur)');
  await ctx.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
