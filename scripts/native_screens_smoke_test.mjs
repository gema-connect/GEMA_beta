// GEMA Native — iPhone-Ansicht der 6 vorbereiteten Screens (gema_native_mobil.js).
//  Prüft pro Modul: Native-Overlay erscheint auf Phone-Viewport (390×844) mit ECHTEN
//  Daten aus den geseedeten Pools, Aktionen/Filter funktionieren, die Ansicht folgt
//  der USER-EINSTELLUNG (profile.nativeAnsicht / Cache gema_native_view_v1, Standard AN)
//  ohne In-Modul-Umschalter/Pill, Desktop (1280×800) bleibt klassisch.
//  DURCHGÄNGIG nativ (07/2026): pm_stunden/pm_einsatzplan (Erfassungs-Sheets) UND
//  if_werkzeug/if_fahrzeug — natives Detail-Sheet + Sheets für Erfassen/Bearbeiten,
//  Defekt, km-Stand; alle über die echten Modul-Speicherketten (submitForm/saveVehicle/
//  _wzSaveDefekt/saveDefekt/_fzQuickKmEdit) verifiziert am Pool-Inhalt.
//  Dazu (Feedback 23.07.): zentral injizierte ‹Zurück-Taste (Toolbar + Kompakt-
//  Leiste, Navigation zu index.html ohne Verlauf), Autocomplete-Vorschläge in den
//  Sheets (GemaNativeMobil.ac + geteilte _wz*Suggestions-Quellen), Kategorie-/
//  Typ-Chips und der erweiterte Filter (Werkzeug: _wzAdvFilter-Motor) — plus
//  Aufschub-Guard: ein Refresh wischt NIE ein offenes Sheet weg.
//  Module: if_werkzeug, if_fahrzeug, pm_stunden, pm_einsatzplan, sys_workspace,
//  sb_druckdispositiv (DOM-Proxy auf die echte Berechnung).
//
// Aufruf:  CHROME=<chromium> node scripts/native_screens_smoke_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8895;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const MFK_BALD = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const ORG = { id: 'org_t', name: 'Muster Haustechnik AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true };
const USERS = [
  { id: 'u1', username: 'a@t.ch', name: 'Robin Muster', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } },
  { id: 'u2', username: 'm@t.ch', name: 'M. Keller', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'm@t.ch' } }
];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

const SEED = {
  gema_orgs_v1: JSON.stringify([ORG]),
  gema_users_v1: JSON.stringify(USERS),
  gema_session_v1: JSON.stringify(SESSION),
  gema_werkzeug: JSON.stringify([
    { id: 'w1', orgId: 'org_t', name: 'Bohrschrauber Hilti TE 6', internKennung: 'W-0421', cat: 'maschine', bought: '2024-01-01', brand: 'Hilti', model: 'TE 6-A22' },
    { id: 'w2', orgId: 'org_t', name: 'Kernbohrgerät Weka DK32', internKennung: 'W-0113', cat: 'maschine', bought: '2024-01-01', ausgeliehenAn: { userId: 'u1', name: 'M. Keller' } },
    { id: 'w3', orgId: 'org_t', name: 'Leiter 3-teilig Alu', internKennung: 'W-0088', cat: 'leiter', bought: '2023-01-01', hasLeiter: true, leiterInterval: 12, lastLeiter: '2025-01-10' }
  ]),
  gema_vehicles: JSON.stringify([
    { id: 'v1', orgId: 'org_t', model: 'VW Crafter', plate: 'BS 12345', nr: 'BS-4', driver: 'M. Keller', km: 84200, status: 'aktiv', type: 'Servicefahrzeug', assignment: 'fix' },
    { id: 'v2', orgId: 'org_t', model: 'Renault Master', plate: 'BS 45677', nr: 'BS-7', km: 122400, status: 'aktiv', mfk: MFK_BALD, type: 'Monteurenfahrzeug', assignment: 'sharing' }
  ]),
  gema_std_pool_v1: JSON.stringify([
    { id: 'std1', orgId: 'org_t', userId: 'u1', userName: 'Robin Muster', datum: TODAY, status: 'offen', spesen: {},
      eintraege: [
        { id: 'e1', von: '07:00', bis: '11:30', pauseMin: 15, objektName: 'Lindenpark', taetigkeit: 'Montage' },
        { id: 'e2', von: '13:00', bis: '17:00', pauseMin: 0, objektName: 'Büro', taetigkeit: 'Rapporte' }
      ] }
  ]),
  gema_einsatz_pool_v1: JSON.stringify([
    { id: 'ev1', orgId: 'org_t', typ: 'frei', titel: 'Montage Sanitär · Lindenpark', objektName: 'Lindenpark',
      monteurUserId: 'u1', monteurName: 'Robin Muster', datum: TODAY, dauerTage: 1, zeitVon: '07:30', zeitBis: '11:00', erstelltVon: { userId: 'u1', name: 'Robin Muster' } }
  ]),
  gema_regie_pool_v1: JSON.stringify([
    { id: 'r1', orgId: 'org_t', status: 'eingereicht', nr: 'R-001', objektName: 'Lindenpark' }
  ]),
  gema_workspace_v1: JSON.stringify([
    { id: 'b1', name: 'Wohnüberbauung Lindenpark', type: 'bauprojekt', shared: false, members: [], activity: [], beteiligte: [], notes: [],
      modules: [{ mod: 'sb_druckdispositiv', status: '' }], createdAt: '2026-07-01' }
  ]),
  gema_recent_v1: JSON.stringify([{ key: 'sb_druckdispositiv', ts: Date.now() }]),
  gema_coachmarks_done_sys_workspace_v2: '1'
};

// PostgREST-Mock: bindCollection-Pulls liefern die geseedeten Pools als Rows —
// sonst würde der (leere) Cloud-Pull die localStorage-Seeds wieder wegwischen.
const POOL_ROWS = {
  'tool:': JSON.parse(SEED.gema_werkzeug),
  'vehicle:': JSON.parse(SEED.gema_vehicles),
  'std:': JSON.parse(SEED.gema_std_pool_v1),
  'einsatz:': JSON.parse(SEED.gema_einsatz_pool_v1),
  'regie:': JSON.parse(SEED.gema_regie_pool_v1)
};
function sbMock(u, method) {
  if (method !== 'GET') return '[]';
  const m = /data_key=like\.([^&]+)/.exec(u);
  if (m) {
    const prefix = decodeURIComponent(m[1]).replace(/\*$/, '');
    const arr = POOL_ROWS[prefix];
    if (arr) return JSON.stringify(arr.map(r => ({ data_key: prefix + r.id, payload: { data: r, _lm: 1 } })));
  }
  return '[]';
}
function routeAll(c) {
  return c.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0)
      return route.fulfill({ contentType: 'application/json', body: sbMock(u, route.request().method()) });
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
}
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await routeAll(ctx);
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, SEED);

async function openPage(path) {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  return { page, errs };
}
const natVisible = p => p.evaluate(() => { const r = document.querySelector('.gn--page'); return !!r && r.style.display !== 'none'; });

/* ════════ 1 · Werkzeug ════════ */
console.log('— Werkzeug (Liste/Badges/Filter/Toggle) —');
{
  const { page, errs } = await openPage('/if_werkzeug.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar (Phone)');
  const w = await page.evaluate(() => ({
    sub: document.querySelector('.gn--page .gn-large-title p').textContent,
    rows: document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length,
    badges: Array.from(document.querySelectorAll('.gn--page .gn-badge')).map(b => b.textContent)
  }));
  ok(w.sub.indexOf('3 Geräte') >= 0 && w.sub.indexOf('1 Prüfungen fällig') >= 0, 'Zähler echt («' + w.sub + '»)');
  ok(w.rows === 3, 'alle 3 Werkzeuge gelistet');
  ok(w.badges.some(b => /Ausgeliehen/.test(b)) && w.badges.some(b => /Prüfung überfällig/.test(b)) && w.badges.some(b => /Verfügbar/.test(b)), 'Status-Badges (Verfügbar/Ausgeliehen/Prüfung)');
  // ‹ Zurück-Taste — zentral injiziert (Toolbar + Kompakt-Leiste)
  const back = await page.evaluate(() => ({
    tb: !!document.querySelector('.gn--page .gn-toolbar [data-gn-back]'),
    cp: !!document.querySelector('.gn--page [data-gn-compact] [data-gn-back]')
  }));
  ok(back.tb && back.cp, 'Zurück-Taste in Toolbar + Kompakt-Leiste injiziert');
  // Kategorie-Chips (2 Kategorien im Seed → Leiste erscheint, Zähler stimmen)
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page [data-nat-cats] .gn-chip-sel')).map(c => c.textContent));
  ok(chips.length === 3 && chips[0].indexOf('Alle') === 0, 'Kategorie-Chips (Alle + 2 Kategorien): ' + chips.join(' | '));
  await page.click('.gn--page [data-nat-cats] [data-nat-cat="leiter"]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 1, 'Kategorie-Chip «Leiter» filtert auf 1');
  await page.click('.gn--page [data-nat-cats] [data-nat-cat=""]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 3, 'Chip «Alle» hebt den Kategorie-Filter auf');
  await page.click('.gn--page [data-nat-seg] [data-value="aus"]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 1, 'Segment «Ausgeliehen» filtert auf 1');
  await page.fill('.gn--page [data-nat-q]', 'Leiter');
  await page.click('.gn--page [data-nat-seg] [data-value="alle"]');
  await page.waitForTimeout(200);
  const s1 = await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length);
  ok(s1 === 1, 'Suche «Leiter» filtert auf 1');
  // Zeilen-Tap öffnet das NATIVE Detail-Sheet (durchgängig nativ — kein Modal)
  await page.click('.gn--page [data-nat-list] .gn-row');
  await page.waitForTimeout(450);
  const det = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet.is-open');
    const vm = document.getElementById('viewModal');
    return {
      open: !!sh,
      titel: sh ? sh.querySelector('.gn-sheet-head h2').textContent : '',
      kv: sh ? sh.querySelectorAll('.gn-kv').length : 0,
      acts: sh ? Array.from(sh.querySelectorAll('[data-nats]')).map(b => b.getAttribute('data-nats')) : [],
      classicHidden: !vm || vm.classList.contains('hidden')
    };
  });
  ok(det.open && det.titel.indexOf('Leiter') >= 0, 'Zeilen-Tap öffnet natives Detail-Sheet («' + det.titel + '»)');
  ok(det.kv >= 3, 'Detail-Sheet zeigt Grunddaten (' + det.kv + ' Zeilen)');
  ok(det.acts.indexOf('edit') >= 0 && det.acts.indexOf('ausleihe') >= 0 && det.acts.indexOf('defekt') >= 0 && det.acts.indexOf('qr') >= 0, 'Aktionen im Sheet (Bearbeiten/Ausleihen/Defekt/QR)');
  ok(det.classicHidden, 'kein klassisches Modal sichtbar (durchgängig nativ)');
  // ✏️ Bearbeiten → natives Formular-Sheet (vorbefüllt) → echte Save-Kette (submitForm)
  await page.click('.gn--page .gn-sheet.is-open [data-nats="edit"]');
  await page.waitForTimeout(500);
  const edit = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet.is-open');
    return { open: !!sh, name: sh ? sh.querySelector('[data-f="name"]').value : '', cat: sh ? sh.querySelector('[data-f="cat"]').value : '' };
  });
  ok(edit.open && edit.name === 'Leiter 3-teilig Alu' && edit.cat === 'leiter', 'Bearbeiten-Sheet mit echten Werten vorbefüllt');
  await page.fill('.gn--page .gn-sheet.is-open [data-f="name"]', 'Leiter 3-teilig Alu NEU');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem('gema_werkzeug') || '[]');
    const t = pool.find(x => x.id === 'w3');
    return { name: t && t.name, leiter: t && t.hasLeiter, addHidden: document.getElementById('addModal').classList.contains('hidden') };
  });
  ok(saved.name === 'Leiter 3-teilig Alu NEU', 'Speichern läuft über die echte Kette (submitForm → Pool)');
  ok(saved.leiter === true, 'nicht-native Felder bleiben erhalten (hasLeiter aus editTool-Populate)');
  ok(saved.addHidden, 'klassisches Formular-Modal blieb zu (synchrone Brücke)');
  // ＋ Neues Gerät → natives Formular-Sheet → echter neuer Pool-Eintrag.
  // Der «＋» sitzt seit 26.07.2026 in der Bottom-Navbar und öffnet zuerst
  // die Auswahl Gerät/Koffer.
  await page.fill('.gn--page [data-nat-q]', '');
  await page.waitForTimeout(200);
  await page.click('.gn--page .gn-navbar [data-nat-nav-plus]');
  await page.waitForTimeout(550);
  await page.click('.gn--page .gn-sheet [data-nat-plus-i="0"]');
  await page.waitForTimeout(900);
  // Autocomplete-Vorschläge im Sheet: Tippen zeigt Katalog+Bestand, die
  // Übernahme setzt die Kategorie automatisch (gleiche Quellen wie klassisch)
  await page.fill('.gn--page .gn-sheet.is-open [data-f="name"]', 'Bohrschrauber');
  await page.waitForTimeout(250);
  const acItems = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page .gn-sheet.is-open .gn-ac.is-open .gn-ac-it .gn-ac-l')).map(e => e.textContent));
  ok(acItems.some(t => t === 'Bohrschrauber Hilti TE 6'), 'Vorschläge im Bezeichnung-Feld (eigener Bestand): ' + acItems.slice(0, 3).join(' | '));
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.gn--page .gn-sheet.is-open .gn-ac.is-open .gn-ac-it'));
    const it = items.find(b => b.querySelector('.gn-ac-l').textContent === 'Bohrschrauber Hilti TE 6');
    if (it) it.click();
  });
  await page.waitForTimeout(200);
  const acPick = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet.is-open');
    return { name: sh.querySelector('[data-f="name"]').value, cat: sh.querySelector('[data-f="cat"]').value };
  });
  ok(acPick.name === 'Bohrschrauber Hilti TE 6' && acPick.cat === 'maschine', 'Vorschlag übernommen + Kategorie automatisch gesetzt («' + acPick.cat + '»)');
  // Hersteller-Vorschläge folgen der Bezeichnung (Kreuzfilterung)
  await page.click('.gn--page .gn-sheet.is-open [data-f="brand"]');
  await page.waitForTimeout(250);
  const brandAc = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page .gn-sheet.is-open .gn-ac.is-open .gn-ac-it .gn-ac-l')).map(e => e.textContent));
  ok(brandAc.length >= 1 && brandAc.indexOf('Hilti') >= 0, 'Hersteller-Vorschläge gefiltert nach Bezeichnung: ' + brandAc.join(' | '));
  // Lieferant-Feld vorhanden (mit Vorschlags-Quelle) — dann normal ausfüllen
  ok(await page.evaluate(() => !!document.querySelector('.gn--page .gn-sheet.is-open [data-f="supplier"]')), 'Lieferant-Feld im nativen Formular');
  await page.fill('.gn--page .gn-sheet.is-open [data-f="name"]', 'Testgerät Nativ');
  await page.selectOption('.gn--page .gn-sheet.is-open [data-f="cat"]', 'handwerkzeug');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').some(t => t.name === 'Testgerät Nativ' && t.cat === 'handwerkzeug')), 'Neues Gerät via natives Sheet erfasst (echter Pool-Eintrag)');
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 4, 'Liste zeigt das neue Gerät sofort');
  // 🚨 Defekt melden → natives Sheet → echter Bericht + Notify-Kette
  await page.click('.gn--page [data-nat-list] .gn-row');
  await page.waitForTimeout(450);
  await page.click('.gn--page .gn-sheet.is-open [data-nats="defekt"]');
  await page.waitForTimeout(450);
  ok(await page.evaluate(() => { const sh = document.querySelector('.gn--page .gn-sheet.is-open'); return !!sh && !!sh.querySelector('[data-f="titel"]'); }), 'Defekt-Sheet öffnet (Titel/Schweregrad/Beschreibung)');
  await page.fill('.gn--page .gn-sheet.is-open [data-f="titel"]', 'Akku defekt');
  await page.fill('.gn--page .gn-sheet.is-open [data-f="beschr"]', 'Lädt nicht mehr');
  await page.selectOption('.gn--page .gn-sheet.is-open [data-f="sev"]', 'schwer');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(500);
  const defekt = await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem('gema_werkzeug') || '[]');
    const withDef = pool.find(t => (t.berichte || []).some(b => b.typ === 'defekt' && b.titel === 'Akku defekt'));
    const b = withDef && withDef.berichte.find(x => x.titel === 'Akku defekt');
    return { ok: !!withDef, sev: b && b.schweregrad };
  });
  ok(defekt.ok && defekt.sev === 'schwer', 'Defekt via natives Sheet gemeldet (echter Bericht via _wzSaveDefekt)');
  await page.evaluate(() => { try { if (window.GemaDialog) document.querySelectorAll('.gema-dlg-bg').forEach(d => d.remove()); } catch (e) {} });
  // 🔍 Erweiterter Filter (natives Sheet → derselbe Motor _wzAdvFilter)
  await page.click('.gn--page [data-nat-filter]');
  await page.waitForTimeout(450);
  const fsheet = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet.is-open');
    return { open: !!sh, felder: sh ? ['kat', 'brand', 'model', 'supplier', 'standort', 'zu', 'aus', 'serial', 'pruef', 'defekt', 'garantie', 'kaufVon', 'kaufBis'].filter(f => !!sh.querySelector('[data-f="' + f + '"]')).length : 0 };
  });
  ok(fsheet.open && fsheet.felder === 13, 'Filter-Sheet mit allen 13 Kriterien (' + fsheet.felder + ')');
  await page.selectOption('.gn--page .gn-sheet.is-open [data-f="kat"]', 'leiter');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(900);
  const flt = await page.evaluate(() => ({
    rows: document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length,
    dot: (document.querySelector('.gn--page [data-nat-filter] .gn-dot') || {}).textContent || ''
  }));
  ok(flt.rows === 1, 'Filter «Kategorie Leiter» wirkt auf die Liste (1 Treffer)');
  ok(flt.dot === '1', 'Filter-Badge am Button zeigt aktive Kriterien («' + flt.dot + '»)');
  await page.click('.gn--page [data-nat-filter]');
  await page.waitForTimeout(450);
  await page.click('.gn--page .gn-sheet.is-open [data-nat-freset]');
  await page.waitForTimeout(900);
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 4, '«↻ Zurücksetzen» hebt den Filter auf (4 Geräte)');
  // Native-Ansicht = USER-EINSTELLUNG (sys_profil → profile.nativeAnsicht, synchroner
  // Cache gema_native_view_v1). KEIN In-Modul-Umschalter/Pill mehr.
  ok(await page.evaluate(() => !document.querySelector('.gn--page [data-gn-classic]')), 'kein In-Modul-Umschalter mehr');
  ok(await page.evaluate(() => !document.querySelector('.gn-return-pill')), 'keine 📱-Rückkehr-Pill mehr');
  // Einstellung «klassisch» → Native aus (genau der Cache, den sys_profil schreibt)
  await page.evaluate(() => { localStorage.setItem('gema_native_view_v1', 'klassisch'); window.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(300);
  ok(!(await natVisible(page)), 'Einstellung «klassisch» → Native-Overlay aus');
  // Einstellung «native» → wieder aktiv (Standard)
  await page.evaluate(() => { localStorage.setItem('gema_native_view_v1', 'native'); window.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(300);
  ok(await natVisible(page), 'Einstellung «native» → Native-Ansicht wieder aktiv');
  await page.close();
}

/* ════════ 2 · Fahrzeuge ════════ */
console.log('— Fahrzeuge (Liste/MFK/Fahrer-Chip) —');
{
  const { page, errs } = await openPage('/if_fahrzeug.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const f = await page.evaluate(() => ({
    sub: document.querySelector('.gn--page .gn-large-title p').textContent,
    rows: document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length,
    badges: Array.from(document.querySelectorAll('.gn--page .gn-badge')).map(b => b.textContent),
    ava: (document.querySelector('.gn--page .gn-ava-sm') || {}).textContent
  }));
  ok(f.sub.indexOf('2 Fahrzeuge') >= 0 && f.sub.indexOf('1 MFK fällig') >= 0, 'Zähler echt («' + f.sub + '»)');
  ok(f.rows === 2 && f.badges.some(b => /MFK fällig/.test(b)), '2 Fahrzeuge + MFK-Badge');
  ok(f.ava === 'MK', 'Fahrer-Initialen-Chip («' + f.ava + '»)');
  // ‹ Zurück-Taste auch hier (zentrale Injektion aus gema_native_mobil)
  ok(await page.evaluate(() => !!document.querySelector('.gn--page .gn-toolbar [data-gn-back]')), 'Zurück-Taste in der Toolbar');
  // Typ-Chips (2 Typen im Seed → Leiste erscheint, Filter wirkt)
  const ftyps = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page [data-nat-typs] .gn-chip-sel')).map(c => c.textContent));
  ok(ftyps.length === 3 && ftyps.some(t => t.indexOf('Servicefahrzeug') >= 0), 'Typ-Chips (Alle + 2 Typen): ' + ftyps.join(' | '));
  await page.click('.gn--page [data-nat-typs] [data-nat-typ="Servicefahrzeug"]');
  await page.waitForTimeout(200);
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 1, 'Typ-Chip «Servicefahrzeug» filtert auf 1');
  await page.click('.gn--page [data-nat-typs] [data-nat-typ=""]');
  await page.waitForTimeout(200);
  // Zeilen-Tap öffnet das NATIVE Detail-Sheet (durchgängig nativ)
  await page.click('.gn--page [data-nat-list] .gn-row');
  await page.waitForTimeout(450);
  const fdet = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet.is-open');
    return {
      open: !!sh,
      titel: sh ? sh.querySelector('.gn-sheet-head h2').textContent : '',
      kv: sh ? sh.querySelectorAll('.gn-kv').length : 0,
      acts: sh ? Array.from(sh.querySelectorAll('[data-nats]')).map(b => b.getAttribute('data-nats')) : []
    };
  });
  ok(fdet.open && fdet.titel.indexOf('VW Crafter') >= 0, 'Zeilen-Tap öffnet natives Detail-Sheet («' + fdet.titel + '»)');
  ok(fdet.kv >= 4, 'Detail-Sheet zeigt Fahrzeugdaten (' + fdet.kv + ' Zeilen)');
  ok(fdet.acts.indexOf('edit') >= 0 && fdet.acts.indexOf('km') >= 0 && fdet.acts.indexOf('defekt') >= 0, 'Aktionen im Sheet (Bearbeiten/km/Defekt)');
  // 🧭 km-Stand → natives Sheet → echte Kette (_fzQuickKmEdit mit gestubbtem prompt)
  await page.click('.gn--page .gn-sheet.is-open [data-nats="km"]');
  await page.waitForTimeout(450);
  ok(await page.evaluate(() => { const sh = document.querySelector('.gn--page .gn-sheet.is-open'); return !!sh && !!sh.querySelector('[data-f="km"]'); }), 'km-Sheet öffnet mit aktuellem Stand');
  await page.fill('.gn--page .gn-sheet.is-open [data-f="km"]', '90000');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem('gema_vehicles') || '[]');
    const v = pool.find(x => x.id === 'v1');
    return v && v.km === '90000' && !!v.kmUpdatedAt;
  }), 'km-Update läuft über die echte Kette (persist → Pool, 90000)');
  // tieferer km-Stand → native Zwei-Tap-Bestätigung statt window.confirm
  await page.click('.gn--page [data-nat-list] .gn-row');
  await page.waitForTimeout(400);
  await page.click('.gn--page .gn-sheet.is-open [data-nats="km"]');
  await page.waitForTimeout(400);
  await page.fill('.gn--page .gn-sheet.is-open [data-f="km"]', '80000');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(250);
  const warn = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet.is-open');
    const w = sh && sh.querySelector('[data-kmwarn]');
    return { open: !!sh, warn: !!(w && w.style.display !== 'none' && w.textContent.indexOf('tiefer') >= 0) };
  });
  ok(warn.open && warn.warn, 'tieferer km-Stand → Warnhinweis, Sheet bleibt offen (Zwei-Tap)');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(450);
  ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('gema_vehicles') || '[]').find(x => x.id === 'v1') || {}).km === '80000'), 'zweiter Tap bestätigt den tieferen Stand');
  // 🔧 Defekt melden → natives Sheet → echter events-Eintrag (saveDefekt)
  await page.click('.gn--page [data-nat-list] .gn-row');
  await page.waitForTimeout(400);
  await page.click('.gn--page .gn-sheet.is-open [data-nats="defekt"]');
  await page.waitForTimeout(450);
  await page.fill('.gn--page .gn-sheet.is-open [data-f="desc"]', 'Bremsen quietschen vorne');
  await page.selectOption('.gn--page .gn-sheet.is-open [data-f="prio"]', 'hoch');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(500);
  const fdef = await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem('gema_vehicles') || '[]');
    const v = pool.find(x => x.id === 'v1');
    const e = v && (v.events || []).find(ev => ev.type === 'defekt' && /Bremsen quietschen/.test(ev.detail || ev.label || ''));
    return { ok: !!e, prio: e && e.prio, overlayOffen: (() => { const o = document.getElementById('mgmtDefektOverlay'); return !!o && getComputedStyle(o).display !== 'none' && o.classList.contains('open'); })() };
  });
  ok(fdef.ok && fdef.prio === 'hoch', 'Defekt via natives Sheet gemeldet (echter events-Eintrag via saveDefekt)');
  ok(!fdef.overlayOffen, 'klassisches Defekt-Overlay blieb zu (synchrone Brücke)');
  // Modell-Vorschläge im Formular-Sheet (Basiskatalog via _fzPermHooks.katalog)
  await page.click('.gn--page [data-nat-add]');
  await page.waitForTimeout(400);
  await page.fill('.gn--page .gn-sheet.is-open [data-f="model"]', 'Craf');
  await page.waitForTimeout(250);
  const fac = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page .gn-sheet.is-open .gn-ac.is-open .gn-ac-it .gn-ac-l')).map(e => e.textContent));
  ok(fac.indexOf('VW Crafter') >= 0, 'Modell-Vorschläge aus dem Basiskatalog: ' + fac.join(' | '));
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.gn--page .gn-sheet.is-open .gn-ac.is-open .gn-ac-it'));
    const it = items.find(b => b.querySelector('.gn-ac-l').textContent === 'VW Crafter');
    if (it) it.click();
  });
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.querySelector('.gn--page .gn-sheet.is-open [data-f="model"]').value === 'VW Crafter'), 'Modell-Vorschlag übernommen');
  // Fahrer-Vorschläge (Team + Bestand)
  await page.click('.gn--page .gn-sheet.is-open [data-f="driver"]');
  await page.waitForTimeout(250);
  const fdrv = await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page .gn-sheet.is-open .gn-ac.is-open .gn-ac-it .gn-ac-l')).map(e => e.textContent));
  ok(fdrv.indexOf('M. Keller') >= 0 && fdrv.indexOf('Robin Muster') >= 0, 'Fahrer-Vorschläge (Team + Bestand): ' + fdrv.join(' | '));
  await page.click('.gn--page .gn-sheet.is-open [data-gn-cancel]');
  await page.waitForTimeout(500);
  // 🔍 Filter-Sheet (Zuteilung fix/sharing wie die klassischen Selects)
  await page.click('.gn--page [data-nat-filter]');
  await page.waitForTimeout(450);
  await page.selectOption('.gn--page .gn-sheet.is-open [data-f="zut"]', 'fix');
  await page.click('.gn--page .gn-sheet.is-open [data-gn-save]');
  await page.waitForTimeout(900);
  const fflt = await page.evaluate(() => ({
    rows: document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length,
    dot: (document.querySelector('.gn--page [data-nat-filter] .gn-dot') || {}).textContent || ''
  }));
  ok(fflt.rows === 1 && fflt.dot === '1', 'Filter «Zuteilung fix» wirkt (1 Fahrzeug, Badge «' + fflt.dot + '»)');
  await page.click('.gn--page [data-nat-filter]');
  await page.waitForTimeout(450);
  await page.click('.gn--page .gn-sheet.is-open [data-nat-freset]');
  await page.waitForTimeout(900);
  ok((await page.evaluate(() => document.querySelectorAll('.gn--page [data-nat-list] .gn-row').length)) === 2, '«↻ Zurücksetzen» hebt den Filter auf');
  await page.close();
}

/* ════════ 3 · Stunden ════════ */
console.log('— Stunden (Wochen-Summe/Tages-Gruppen) —');
{
  const { page, errs } = await openPage('/pm_stunden.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const s = await page.evaluate(() => ({
    sub: document.querySelector('.gn--page .gn-large-title p').textContent,
    rows: Array.from(document.querySelectorAll('.gn--page .gn-row .gn-row-title')).map(x => x.textContent),
    vals: Array.from(document.querySelectorAll('.gn--page .gn-row-val')).map(x => x.textContent)
  }));
  ok(/Woche \d+ · 8,3 h erfasst/.test(s.sub), 'Wochen-Summe echt («' + s.sub + '»)');
  ok(s.rows.some(r => r.indexOf('Lindenpark') >= 0) && s.rows.some(r => r.indexOf('Büro') >= 0), 'Tages-Einträge aus dem Pool');
  ok(s.vals.some(v => v === '4,3 h') && s.vals.some(v => v === '4,0 h'), 'Eintrags-Stunden berechnet (4,3 / 4,0)');
  // ＋ Zeit erfassen öffnet ein NATIVES Sheet (kein klassisches Modal)
  await page.click('.gn--page [data-nat-act="neu"]');
  await page.waitForTimeout(450);
  const sheetShown = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet--form.is-open');
    const cls = document.getElementById('einModal');
    return { native: !!sh, classicVisible: !!cls && cls.classList.contains('open'), fields: sh ? sh.querySelectorAll('[data-f]').length : 0 };
  });
  ok(sheetShown.native && sheetShown.fields >= 4, 'Natives Erfassungs-Sheet öffnet (Von/Bis/Pause/Projekt/Tätigkeit)');
  ok(!sheetShown.classicVisible, 'kein klassisches Modal sichtbar (durchgängig nativ)');
  // Felder befüllen + Speichern → echter Eintrag im Pool (via stEinSave)
  await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet--form.is-open');
    const set = (f, v) => { const el = sh.querySelector('[data-f="' + f + '"]'); if (el) el.value = v; };
    set('von', '08:00'); set('bis', '12:00'); set('pause', '0'); set('taetigkeit', 'Native Montage');
  });
  await page.click('.gn--page .gn-sheet--form [data-gn-save]');
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => {
    const u = { id: 'u1' };
    const t = (window.stTagFor ? stTagFor(new Date().toISOString().slice(0, 10), u.id) : null);
    const e = t && (t.eintraege || []).find(x => x.taetigkeit === 'Native Montage');
    return { has: !!e, von: e && e.von, min: e ? (window.stdEintragMin ? stdEintragMin(e) : 0) : 0, sheetGone: !document.querySelector('.gn--page .gn-sheet--form.is-open') };
  });
  ok(saved.has && saved.von === '08:00' && saved.min === 240, 'Speichern schreibt den echten Eintrag (4,0 h via stEinSave)');
  ok(saved.sheetGone, 'Sheet schliesst nach dem Speichern');
  ok(await page.evaluate(() => Array.from(document.querySelectorAll('.gn--page .gn-row .gn-row-title')).some(x => x.textContent.indexOf('Native Montage') >= 0)), 'neue Zeile erscheint im nativen Screen');
  // Eintrag-Tap öffnet Edit-Sheet mit Löschen
  await page.click('.gn--page .gn-row[data-nat-edit]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const sh = document.querySelector('.gn--page .gn-sheet--form.is-open'); return !!sh && !!sh.querySelector('[data-gn-del]'); }), 'Eintrag-Tap öffnet Bearbeiten-Sheet mit Löschen');
  await page.close();
}

/* ════════ 4 · Einsatzplan ════════ */
console.log('— Einsatzplan (Weekstrip/Agenda) —');
{
  const { page, errs } = await openPage('/pm_einsatzplan.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const e = await page.evaluate(() => ({
    days: document.querySelectorAll('.gn--page .gn-day').length,
    dot: !!document.querySelector('.gn--page .gn-day.is-active.has-dot'),
    ev: (document.querySelector('.gn--page .gn-event-title') || {}).textContent,
    zeit: (document.querySelector('.gn--page .gn-event-time') || {}).textContent
  }));
  ok(e.days === 7, 'Wochenstreifen mit 7 Tagen');
  ok(e.dot, 'Heute aktiv + Event-Punkt');
  ok(e.ev === 'Montage Sanitär · Lindenpark', 'Agenda zeigt den echten Einsatz');
  ok(e.zeit && e.zeit.indexOf('07:30') >= 0, 'Einsatz-Zeit aus dem Record');
  // ＋ öffnet ein NATIVES Termin-Sheet; Freier Termin erfassen + speichern
  await page.click('.gn--page [data-nat-add]');
  await page.waitForTimeout(450);
  const evSheet = await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet--form.is-open');
    const cls = document.getElementById('evModal');
    return { native: !!sh, classicVisible: !!cls && cls.classList.contains('open'), typChips: sh ? sh.querySelectorAll('[data-nat-typ] .gn-chip-sel').length : 0, monteur: sh ? sh.querySelectorAll('[data-f="monteur"] option').length : 0 };
  });
  ok(evSheet.native && evSheet.typChips === 3, 'Natives Termin-Sheet öffnet (Typ-Chips Auftrag/Frei/Abwesend)');
  ok(!evSheet.classicVisible, 'kein klassisches evModal sichtbar');
  ok(evSheet.monteur >= 2, 'Monteur-Select aus echten Personen (inkl. Leer-Option)');
  await page.evaluate(() => {
    const sh = document.querySelector('.gn--page .gn-sheet--form.is-open');
    sh.querySelector('[data-nat-typ] .gn-chip-sel[data-t="frei"]').click();       // Typ «Frei»
    const set = (f, v) => { const el = sh.querySelector('[data-f="' + f + '"]'); if (el) el.value = v; };
    set('titel', 'Native Termin');
    const mon = sh.querySelector('[data-f="monteur"]'); mon.value = 'u2';
    set('von', '09:00'); set('bis', '11:00');
  });
  await page.click('.gn--page .gn-sheet--form [data-gn-save]');
  await page.waitForTimeout(600);
  const evSaved = await page.evaluate(() => {
    const all = window.epAll ? epAll() : [];
    const ev = all.find(x => x.titel === 'Native Termin');
    return { has: !!ev, typ: ev && ev.typ, von: ev && ev.zeitVon, mon: ev && ev.monteurUserId, sheetGone: !document.querySelector('.gn--page .gn-sheet--form.is-open') };
  });
  ok(evSaved.has && evSaved.typ === 'frei' && evSaved.von === '09:00' && evSaved.mon === 'u2', 'Termin gespeichert via epEvSave (Typ/Zeit/Monteur echt)');
  ok(evSaved.sheetGone, 'Termin-Sheet schliesst nach dem Speichern');
  // Agenda-Tap öffnet Bearbeiten-Sheet mit Löschen
  await page.click('.gn--page .gn-event[data-nat-id]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const sh = document.querySelector('.gn--page .gn-sheet--form.is-open'); return !!sh && !!sh.querySelector('[data-gn-del]') && sh.querySelector('[data-f="titel"]').value.length > 0; }), 'Termin-Tap öffnet Bearbeiten-Sheet (vorbelegt + Löschen)');
  await page.close();
}

/* ════════ 5 · Workspace ════════ */
console.log('— Workspace (Cockpit-KPIs) —');
{
  const { page, errs } = await openPage('/sys_workspace.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  const w = await page.evaluate(() => {
    const st = Array.from(document.querySelectorAll('.gn--page .gn-stat')).map(x => ({ k: x.querySelector('.gn-stat-k').textContent, v: x.querySelector('.gn-stat-v').textContent }));
    return { st, bucket: (document.querySelector('.gn--page [data-nat-bucket] .gn-row-title') || {}).textContent,
      recent: (document.querySelector('.gn--page [data-nat-href] .gn-row-title') || {}).textContent };
  });
  const kv = k => (w.st.find(x => x.k === k) || {}).v;
  ok(kv('Stunden Woche') === '8,3', 'KPI Stunden Woche aus dem Pool (8,3)');
  ok(kv('Einsätze heute') === '1', 'KPI Einsätze heute (1)');
  ok(kv('Prüfungen fällig') === '1', 'KPI Prüfungen fällig (1 — Leiter überfällig)');
  ok(kv('Offene Rapporte') === '1', 'KPI offene Rapporte (1)');
  ok(w.bucket === 'Wohnüberbauung Lindenpark', 'Eimer-Liste echt');
  ok(w.recent === 'Druckdispositiv', 'Zuletzt verwendet via GemaRecent');
  await page.close();
}

/* ════════ 6 · Druckdispositiv (DOM-Proxy) ════════ */
console.log('— Druckdispositiv (Eingabe→echte Berechnung→Ergebnis) —');
{
  const { page, errs } = await openPage('/sb_druckdispositiv.html');
  ok(errs.length === 0, 'Boot ohne pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
  ok(await natVisible(page), 'Native-Screen sichtbar');
  // Modus «Netzdruck», Versorgungsdruck 4.5 bar + höchste Stelle 10 m
  await page.click('.gn--page [data-nat-mode] [data-value="direkt"]');
  await page.waitForTimeout(250);
  await page.fill('.gn--page [data-nat-proxy="versorgungsdruck"]', '4.5');
  await page.fill('.gn--page [data-nat-proxy="hHoechste"]', '10');
  await page.waitForTimeout(250);
  const d = await page.evaluate(() => ({
    klassisch: document.getElementById('versorgungsdruck').value,
    out: document.getElementById('out-fliessdruck').textContent
  }));
  ok(d.klassisch === '4.5', 'Proxy schreibt in den klassischen Input');
  ok(d.out !== '—' && Math.abs(parseFloat(d.out.replace(',', '.')) - 3.52) < 0.02, 'Echte Berechnung läuft (Fliessdruck ≈ 3.52, ist «' + d.out + '»)');
  await page.click('.gn--page [data-nat-seg] [data-value="ergebnis"]');
  await page.waitForTimeout(250);
  const erg = await page.evaluate(() => ({
    val: (document.querySelector('.gn--page .gn-result .gn-val') || {}).textContent,
    note: (document.querySelector('.gn--page .gn-result .gn-note') || {}).textContent,
    kv: document.querySelectorAll('.gn--page [data-nat-ergebnis] .gn-kv').length
  }));
  ok(erg.val && erg.val.replace(',', '.').indexOf('3.52') >= 0, 'Ergebnis-Karte zeigt den Modul-Wert («' + erg.val + '»)');
  ok(/Erhöht|Norm|tief/.test(erg.note), 'Normstatus übernommen («' + erg.note + '»)');
  ok(erg.kv === 5, 'Zwischenwerte-Liste (5 kv-Zeilen)');
  await page.close();
}

/* ════════ Zurück-Navigation ════════ */
console.log('— Zurück-Taste navigiert —');
{
  // Direkt geöffnet (kein Verlauf/Referrer) → Zurück führt zur Modulübersicht
  const { page } = await openPage('/if_werkzeug.html');
  await Promise.all([
    page.waitForURL('**/index.html', { timeout: 8000 }),
    page.click('.gn--page .gn-toolbar [data-gn-back]')
  ]).then(() => ok(true, 'Zurück ohne Verlauf → index.html'))
    .catch(e => ok(false, 'Zurück ohne Verlauf → index.html (' + e.message.split('\n')[0] + ')'));
  await page.close();
}

/* ════════ Desktop-Gegenprobe ════════ */
console.log('— Desktop bleibt klassisch —');
{
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await routeAll(dctx);
  await dctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, SEED);
  const page = await dctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  ok(errs.length === 0, 'Desktop-Boot ohne pageerrors');
  ok(!(await natVisible(page)), 'Native-Overlay auf Desktop unsichtbar');
  ok(await page.evaluate(() => !document.querySelector('.gn-return-pill') && !document.querySelector('[data-gn-classic]')), 'kein Native-Umschalter/Pill auf Desktop');
  ok(await page.evaluate(() => !!document.querySelector('.g-nav') && getComputedStyle(document.querySelector('.g-nav')).display !== 'none'), 'GEMA-Nav auf Desktop sichtbar');
  await dctx.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
