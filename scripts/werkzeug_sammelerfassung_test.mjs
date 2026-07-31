// Werkzeug: Sammelerfassung (Desktop) + Native-Liste neueste-zuoberst + Pull-to-Refresh.
//
// Deckt ab:
//  A) Desktop-Sammelerfassung (nur Magaziner/Admin): Tabellen-Modal mit
//     📌-Vorgabe-Zeile (gilt für alle Zeilen ohne eigenen Wert), Spalten
//     ein-/ausblendbar + pro Gerät gemerkt (gema_wz_sml_cols_v1, ↺ Standard),
//     Live-Zähler am Speichern-Button, Auto-Zeile beim Tippen in der letzten
//     Zeile, interne Kennung gilt 1:1 (Feedback 31.07.2026 — KEIN Hochzählen),
//     DATUM-Vorgaben werden sichtbar in die Zeilen gespiegelt (type=date kann
//     keinen Platzhalter zeigen; eigene Eingabe löst die Spiegelung, gespiegelte
//     Werte zählen nicht als «ausgefüllt»), ausgeblendete Vorgaben ausgewiesen,
//     Fenster nutzt die volle Bildschirmbreite (Dropdowns lesbar).
//  B) Validierung: Zeile mit Werten aber ohne effektive Bezeichnung/Kategorie/
//     Kaufdatum → Fehlerdialog mit Zeilennummer, nichts wird gespeichert.
//  C) Save-Pipeline: orgId gestempelt, Vorgaben angewendet, Garantie-Default
//     Kauf+24 Mt., Zuweisung (typ user, seit heute), EINE Sammel-Notifikation
//     pro Person (Muster Sammel-Bearbeitung), IDs in Erfassungs-Reihenfolge
//     (Zeile 1 = neueste).
//  D) Native Handy-Ansicht: Liste neueste zuoberst (_wzCreatedTs, wie die
//     klassische getFiltered-Sortierung), data-gn-ptr + Spinner vorhanden,
//     __gnRefresh-Hook gesetzt und funktionsfähig; die Maus-Zug-Geste
//     (gema-native.js PTR) löst den Hook aus.
//  E) Monteur: kein Sammelerfassungs-Button.
//
// Aufruf:  CHROME=<chromium> node scripts/werkzeug_sammelerfassung_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8901;
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

const HEUTE = new Date().toISOString().slice(0, 10);
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';

// Bestand: 2 Werkzeuge mit klar unterschiedlichem Erfassungs-Timestamp
// (t_<ts>-IDs — Basis der newest-first-Sortierung in beiden Ansichten)
const TOOL_ALT = { id: 't_1600000000000', name: 'Altes Werkzeug', cat: 'maschine', orgId: 'org_t', bought: '2020-09-13', berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const TOOL_NEU = { id: 't_1700000000000', name: 'Neueres Werkzeug', cat: 'handwerkzeug', orgId: 'org_t', bought: '2023-11-14', berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const KOFFER = { id: 't_1650000000000', name: 'Servicekoffer', cat: 'koffer', istKoffer: true, kofferInhalt: [], orgId: 'org_t', berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };

const ORGS = [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_mag'], active: true }];
const USERS = [
  { id: 'u_mag', username: 'mag@t.ch', name: 'Magazinerin', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } },
  { id: 'u_mon', username: 'mon@t.ch', name: 'Monteur Max', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'mon@t.ch' } }
];

function seedFor(userId, mitKoffer) {
  return {
    gema_orgs_v1: ORGS,
    gema_users_v1: USERS,
    gema_session_v1: { token: TOKEN, userId, expires: FUTURE },
    gema_werkzeug: mitKoffer ? [TOOL_ALT, TOOL_NEU, KOFFER] : [TOOL_ALT, TOOL_NEU],
    gema_coachmarks_done_if_werkzeug_v1: '1'
  };
}

const browser = await chromium.launch({ executablePath: CHROME });

async function newWzPage(userId, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(opts.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' } : (opts.viewport ? { viewport: opts.viewport } : {}));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (isSb) {
      // bindCollection überschreibt den lokalen Cache mit dem Cloud-Stand —
      // die Bestand-Werkzeuge müssen deshalb als Cloud-Rows kommen
      if (route.request().method() === 'GET' && u.indexOf('module_key=eq.werkzeugmanagement') >= 0) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
          (opts.koffer ? [TOOL_ALT, TOOL_NEU, KOFFER] : [TOOL_ALT, TOOL_NEU]).map(t => ({ data_key: 'tool:' + t.id, payload: { data: t, _lm: '2026-07-10T08:00:00Z' } }))
        ) });
      }
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    }
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seedFor(userId, !!opts.koffer));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.getFiltered === 'function' && window.getFiltered().length >= 2, null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, errs };
}

try {
  // ───────────────────────── Desktop: Magazinerin ─────────────────────────
  console.log('— A) Sammelerfassung: Modal, Spalten, Vorgaben —');
  const { ctx: ctx1, page, errs } = await newWzPage('u_mag', { viewport: { width: 1720, height: 900 } });

  ok(await page.evaluate(() => document.getElementById('btnSammel') && document.getElementById('btnSammel').style.display !== 'none'),
    'Toolbar-Button «📋 Sammelerfassung» sichtbar (Magazinerin)');

  await page.evaluate(() => window._wzSammelOpen());
  await page.waitForSelector('#smlTable', { timeout: 4000 });
  ok(await page.evaluate(() => document.querySelectorAll('#smlTbody tr.sml-row').length) === 5, 'startet mit 5 leeren Zeilen');
  ok(await page.evaluate(() => document.getElementById('sml_fix_bought').value) === HEUTE, 'Vorgabe Kaufdatum = heute (wie Einzelerfassung)');
  const breite = await page.evaluate(() => ({
    card: document.querySelector('.sml-card').offsetWidth,
    catSel: document.querySelector('#smlTbody tr.sml-row [data-smlrowcol="cat"]').offsetWidth
  }));
  ok(breite.card >= 1600, 'Fenster nutzt die volle Breite (' + breite.card + 'px bei 1720er-Screen)');
  ok(breite.catSel >= 170, 'Kategorie-Dropdown lesbar breit (' + breite.catSel + 'px)');
  // Datum-Vorgabe wird SICHTBAR in die Zeilen gespiegelt (type=date kann
  // keinen Platzhalter zeigen — die Vorgabe wirkte sonst «nicht übernommen»)
  const mirror0 = await page.evaluate(() => {
    const el = document.querySelector('#smlTbody tr.sml-row [data-smlrowcol="bought"]');
    return { val: el.value, fromfix: el.getAttribute('data-fromfix') };
  });
  ok(mirror0.val === HEUTE && mirror0.fromfix === '1', 'Kaufdatum-Vorgabe sichtbar in der Zeile gespiegelt (data-fromfix)');
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_bought');
    f.value = '2026-05-04'; f.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok(await page.evaluate(() => document.querySelector('#smlTbody tr.sml-row [data-smlrowcol="bought"]').value) === '2026-05-04',
    'geänderte Datum-Vorgabe zieht in allen Zeilen nach');
  ok(await page.evaluate(() => document.getElementById('smlSaveBtn').disabled) === true,
    'gespiegelte Datum-Werte zählen NICHT als ausgefüllte Zeile (Button bleibt deaktiviert)');
  await page.evaluate(() => {
    const el = document.querySelectorAll('#smlTbody tr.sml-row')[1].querySelector('[data-smlrowcol="bought"]');
    el.value = '2026-01-15'; el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_bought');
    f.value = '2026-06-01'; f.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const mirror1 = await page.evaluate(() => Array.from(document.querySelectorAll('#smlTbody tr.sml-row')).slice(0, 2).map(tr => tr.querySelector('[data-smlrowcol="bought"]').value));
  ok(mirror1[0] === '2026-06-01' && mirror1[1] === '2026-01-15', 'eigene Zeilen-Eingabe hat Vorrang und übersteht Vorgabe-Änderungen');
  await page.evaluate(() => {
    // zurück auf den Ausgangszustand für die Folge-Checks
    const el = document.querySelectorAll('#smlTbody tr.sml-row')[1].querySelector('[data-smlrowcol="bought"]');
    el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true }));
    const f = document.getElementById('sml_fix_bought');
    f.value = new Date().toISOString().slice(0, 10); f.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const colState = await page.evaluate(() => {
    const vis = id => document.querySelector('#smlTable thead th[data-smlcol="' + id + '"]').style.display !== 'none';
    return { name: vis('name'), zuw: vis('zuw'), warranty: vis('warranty'), supplier: vis('supplier'), service: vis('service') };
  });
  ok(colState.name && colState.zuw, 'Standard-Spalten sichtbar (Bezeichnung, Zuweisung)');
  ok(!colState.warranty && !colState.supplier && !colState.service, 'Zusatz-Spalten (Garantie/Lieferant/Service) standardmässig ausgeblendet');

  // Spalte «Modell» ausblenden → wirkt + wird pro Gerät gemerkt
  await page.evaluate(() => {
    const cb = document.querySelector('#smlColMenu [data-smlcolchk="model"]');
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok(await page.evaluate(() => document.querySelector('#smlTable thead th[data-smlcol="model"]').style.display) === 'none', 'Spalte «Modell» ausgeblendet');
  ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('gema_wz_sml_cols_v1')) || []).indexOf('model')) === -1, 'Auswahl in localStorage gemerkt');
  await page.evaluate(() => { _wzCloseModal(); window._wzSammelOpen(); });
  await page.waitForSelector('#smlTable', { timeout: 4000 });
  ok(await page.evaluate(() => document.querySelector('#smlTable thead th[data-smlcol="model"]').style.display) === 'none', 'ausgeblendete Spalte übersteht Neu-Öffnen (persistiert)');
  await page.evaluate(() => window._wzSmlColsReset());
  ok(await page.evaluate(() => document.querySelector('#smlTable thead th[data-smlcol="model"]').style.display) !== 'none', '↺ Standard-Spalten stellt «Modell» wieder her');

  // Vorgabe Bezeichnung → alle 5 Zeilen zählen; Button trägt den Zähler
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_name');
    f.value = 'Bohrhammer TE 30'; f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  ok(await page.evaluate(() => document.getElementById('smlSaveBtn').textContent.trim()) === '✓ 5 Werkzeuge erfassen', 'Vorgabe-Bezeichnung → Button «✓ 5 Werkzeuge erfassen»');
  ok(await page.evaluate(() => {
    const inp = document.querySelector('#smlTbody tr.sml-row [data-smlrowcol="name"]');
    return inp.placeholder;
  }) === '📌 Bohrhammer TE 30', 'Zeilen-Platzhalter zeigt die 📌-Vorgabe');
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_name');
    f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  ok(await page.evaluate(() => document.getElementById('smlSaveBtn').disabled) === true, 'ohne Vorgabe + ohne Zeilenwerte: Button deaktiviert');

  console.log('— B) Zeilen, Auto-Anhängen, Kennung zählt hoch, Validierung —');
  const setRow = (n, col, val) => page.evaluate(a => {
    const tr = document.querySelectorAll('#smlTbody tr.sml-row')[a.n];
    const el = tr.querySelector('[data-smlrowcol="' + a.col + '"]');
    el.value = a.val;
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, { n, col, val });

  await setRow(0, 'name', 'Akkuschrauber');
  await setRow(1, 'name', 'Winkelschleifer');
  ok(await page.evaluate(() => document.querySelectorAll('#smlTbody tr.sml-row').length) === 5, 'Tippen in mittleren Zeilen hängt NICHTS an');
  await setRow(4, 'name', 'Stichsäge');
  ok(await page.evaluate(() => document.querySelectorAll('#smlTbody tr.sml-row').length) === 6, 'Tippen in der LETZTEN Zeile hängt automatisch eine neue an');
  await page.evaluate(() => { const tr = document.querySelectorAll('#smlTbody tr.sml-row')[4]; const el = tr.querySelector('[data-smlrowcol="name"]'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });

  // Vorgaben: Kategorie + interne Kennung + Zuweisung an den Monteur
  await page.evaluate(() => {
    const c = document.getElementById('sml_fix_cat'); c.value = 'maschine'; c.dispatchEvent(new Event('change', { bubbles: true }));
    const i = document.getElementById('sml_fix_intern'); i.value = 'WZ-014'; i.dispatchEvent(new Event('input', { bubbles: true }));
    const z = document.getElementById('sml_fix_zuw'); z.value = 'u:u_mon'; z.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const internPh = await page.evaluate(() => Array.from(document.querySelectorAll('#smlTbody tr.sml-row')).slice(0, 2).map(tr => tr.querySelector('[data-smlrowcol="intern"]').placeholder));
  ok(internPh[0] === '📌 WZ-014' && internPh[1] === '📌 WZ-014', 'Kennung-Vorgabe gilt 1:1 — KEIN Hochzählen (' + internPh.join(' / ') + ')');
  // Zeile 2 setzt eine EIGENE Kennung → hat Vorrang vor der Vorgabe
  await setRow(1, 'intern', 'EIGEN-1');

  // Validierung: Zeile 3 nur mit Hersteller (keine effektive Bezeichnung)
  await setRow(2, 'brand', 'Hilti');
  await page.evaluate(() => window._wzSammelSave());
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const valTxt = await page.$eval('.gema-dlg-bg', el => el.textContent);
  ok(valTxt.indexOf('Zeile 3') >= 0 && valTxt.indexOf('Bezeichnung') >= 0, 'Validierung nennt Zeile 3 + fehlende Bezeichnung');
  ok(await page.evaluate(() => window.getFiltered().length) === 2, 'nichts gespeichert bei Validierungsfehler');
  ok(await page.evaluate(() => document.querySelectorAll('#smlTbody tr.sml-err').length) === 1, 'Fehler-Zeile rot markiert');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.evaluate(() => { const tr = document.querySelectorAll('#smlTbody tr.sml-row')[2]; const el = tr.querySelector('[data-smlrowcol="brand"]'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });

  console.log('— C) Speichern: Vorgaben angewendet, Notify gebündelt —');
  await page.evaluate(() => { window.__notifs = []; if (window.GemaNotify) { const o = GemaNotify.push; GemaNotify.push = function (n) { window.__notifs.push(n); return o.apply(this, arguments); }; } });
  await page.evaluate(() => window._wzSammelSave());
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => ({
    n: window.getFiltered().length,
    neu: window.getFiltered().filter(t => ['Akkuschrauber', 'Winkelschleifer'].indexOf(t.name) >= 0).map(t => ({
      id: t.id, name: t.name, cat: t.cat, orgId: t.orgId, intern: t.internKennung,
      bought: t.bought, warranty: t.warranty, zuw: t.zugewiesenAn, hasService: t.hasService
    })),
    modalWeg: !document.getElementById('_wzModalOverlay'),
    notifs: window.__notifs
  }));
  ok(res.n === 4, '2 Werkzeuge erfasst (Bestand 2 → 4) — ' + res.n);
  const akku = res.neu.find(t => t.name === 'Akkuschrauber'), flex = res.neu.find(t => t.name === 'Winkelschleifer');
  ok(!!akku && akku.cat === 'maschine' && akku.orgId === 'org_t', 'Vorgabe-Kategorie + orgId gestempelt');
  ok(akku.bought === HEUTE, 'Vorgabe-Kaufdatum (heute) angewendet');
  ok(!!akku.warranty && akku.warranty > HEUTE, 'Garantie-Default Kauf + 24 Monate gesetzt (' + akku.warranty + ')');
  ok(akku.intern === 'WZ-014' && flex.intern === 'EIGEN-1', 'Kennung: Zeile 1 = Vorgabe 1:1 (WZ-014), Zeile 2 eigener Wert (EIGEN-1)');
  ok(akku.zuw && akku.zuw.typ === 'user' && akku.zuw.userId === 'u_mon' && akku.zuw.seit === HEUTE, 'Zuweisung typ user an Monteur, seit heute');
  ok(akku.hasService === false, 'ohne Service-Vorgabe keine Prüfung aktiviert');
  const idsOrder = await page.evaluate(() => window.getFiltered().map(t => t.name));
  ok(idsOrder[0] === 'Akkuschrauber' && idsOrder[1] === 'Winkelschleifer' && idsOrder[2] === 'Neueres Werkzeug',
    'Liste neueste zuoberst in Erfassungs-Reihenfolge (Zeile 1 zuerst) — ' + idsOrder.join(', '));
  const zw = res.notifs.filter(n => n.eventKey === 'werkzeug_zuweisung');
  ok(zw.length === 1 && zw[0].empfaengerUserId === 'u_mon' && zw[0].titel.indexOf('2 Werkzeuge') >= 0,
    'EINE Sammel-Notifikation «2 Werkzeuge zugewiesen» an den Monteur');
  ok(res.modalWeg, 'Modal nach dem Speichern geschlossen');
  ok(errs.length === 0, 'keine pageerrors (Desktop) ' + (errs.length ? '— ' + errs.join(' | ').slice(0, 140) : ''));
  await ctx1.close();

  // ───────────────────────── Native (Phone): Magazinerin ─────────────────────────
  console.log('— D) Native: neueste zuoberst + Pull-to-Refresh —');
  const { ctx: ctx2, page: pn, errs: errsN } = await newWzPage('u_mag', { phone: true, koffer: true });
  await pn.waitForSelector('[data-nat-list] .gn-row', { timeout: 9000 });
  const natOrder = await pn.evaluate(() => Array.from(document.querySelectorAll('[data-nat-list] .gn-row')).map(r => r.getAttribute('data-nat-id')));
  ok(natOrder.join(',') === 't_1700000000000,t_1650000000000,t_1600000000000', 'Native Liste: neuestes Werkzeug zuoberst (inkl. Koffer einsortiert) — ' + natOrder.join(', '));
  const ptr = await pn.evaluate(() => {
    const el = document.querySelector('[data-gn-ptr]');
    return { da: !!el, scroll: el && el.hasAttribute('data-gn-scroll'), spinner: !!document.querySelector('.gn-ptr-spinner'), hook: el && typeof el.__gnRefresh === 'function' };
  });
  ok(ptr.da && ptr.scroll, 'Screen trägt data-gn-ptr (auf dem Scroll-Container)');
  ok(ptr.spinner, '.gn-ptr-spinner vorhanden');
  ok(ptr.hook, '__gnRefresh-Hook gesetzt');
  const hookOk = await pn.evaluate(() => Promise.resolve(document.querySelector('[data-gn-ptr]').__gnRefresh()).then(() => true).catch(() => false));
  ok(hookOk === true, '__gnRefresh läuft durch (Cloud-Re-Pull + Neu-Render)');
  ok(await pn.evaluate(() => document.querySelectorAll('[data-nat-list] .gn-row').length) >= 2, 'Liste nach Refresh weiterhin gerendert');

  // Zug-Geste (Maus-Pfad der Kit-Mechanik): Spy auf den Hook, dann ziehen
  await pn.evaluate(() => {
    const el = document.querySelector('[data-gn-ptr]');
    const orig = el.__gnRefresh;
    window.__ptrHit = false;
    el.__gnRefresh = function () { window.__ptrHit = true; return orig ? orig() : Promise.resolve(); };
  });
  await pn.mouse.move(195, 120);
  await pn.mouse.down();
  await pn.mouse.move(195, 200, { steps: 8 });
  await pn.mouse.up();
  await pn.waitForFunction(() => window.__ptrHit === true, null, { timeout: 4000 }).catch(() => {});
  ok(await pn.evaluate(() => window.__ptrHit === true), 'Zug-Geste (80px nach unten) löst den Refresh aus');

  console.log('— D2) Native: Koffer befüllen (Regression 31.07.2026) —');
  // Koffer-Tap → klassisches Detail (Koffer-Funktionen) über dem Screen
  await pn.evaluate(() => { document.querySelector('[data-nat-id="t_1650000000000"]').click(); });
  await pn.waitForTimeout(400);
  const kofVm = await pn.evaluate(() => {
    const vm = document.getElementById('viewModal');
    return { open: !!vm && !vm.classList.contains('hidden'), z: vm ? parseInt(getComputedStyle(vm).zIndex, 10) : 0 };
  });
  ok(kofVm.open, 'Koffer-Tap öffnet das klassische Detail');
  ok(kofVm.z >= 10600, 'Detail liegt über dem Native-Screen (z ' + kofVm.z + ')');
  // «🧰 Inhalt»-Button IM Detail (Feedback 31.07.2026): er lebte nur auf der
  // Desktop-Karte — in der nativen Ansicht gab es damit KEINEN Weg zum
  // Inhalt-Editor. Jetzt trägt die Detailansicht eine Koffer-Box mit Button.
  const kofBox = await pn.evaluate(() => {
    const b = document.getElementById('vm_kofferBox');
    const btn = b && b.querySelector('button[onclick*="openKofferInhalt"]');
    return { box: !!b, btn: !!btn, txt: b ? b.textContent : '' };
  });
  ok(kofBox.box && kofBox.btn, 'Detailansicht zeigt Koffer-Box mit «🧰 Inhalt»-Button');
  ok(/0 Teile/.test(kofBox.txt) && /Noch leer/.test(kofBox.txt), 'Box nennt den Füllstand («0 Teile · Noch leer»)');
  // Inhalt-Editor öffnet ÜBER dem Detail — vorher lag er dahinter
  // (.modal-bg wurde im Native-Modus auf 10600 gehoben, der dynamische
  // _wzModalOverlay blieb bei 10500 → «Koffer kann nicht befüllt werden»)
  await pn.evaluate(() => { document.querySelector('#vm_kofferBox button[onclick*="openKofferInhalt"]').click(); });
  await pn.waitForTimeout(250);
  const lay = await pn.evaluate(() => {
    const ov = document.getElementById('_wzModalOverlay');
    const vm = document.getElementById('viewModal');
    return { ov: !!ov, search: !!document.getElementById('kofSearch'),
      zOv: ov ? parseInt(getComputedStyle(ov).zIndex, 10) : 0, zVm: vm ? parseInt(getComputedStyle(vm).zIndex, 10) : 0 };
  });
  ok(lay.ov && lay.search, 'Inhalt-Editor gerendert (Suche + Sammelscan)');
  ok(lay.zOv > lay.zVm, 'Inhalt-Editor liegt ÜBER dem Koffer-Detail (z ' + lay.zOv + ' > ' + lay.zVm + ') — Koffer befüllbar');
  // Befüllen über die Suche: erster Treffer → «+»
  await pn.evaluate(() => window._wzKofferSearch('t_1650000000000'));
  const addOk = await pn.evaluate(() => { const b = document.querySelector('#kofSearchRes button'); if (!b) return false; b.click(); return true; });
  ok(addOk, 'Suchtreffer mit «+»-Button vorhanden');
  await pn.waitForTimeout(400);
  const inhalt = await pn.evaluate(() => {
    const k = window.getFiltered().find(t => t.id === 't_1650000000000');
    const ov = document.getElementById('_wzModalOverlay');
    return { n: (k && k.kofferInhalt || []).length, editor: !!ov, zeigt: ov ? ov.textContent.indexOf('1 Teil') >= 0 : false };
  });
  ok(inhalt.n === 1, 'Werkzeug liegt im Koffer (kofferInhalt: 1)');
  ok(inhalt.editor && inhalt.zeigt, 'Editor neu gerendert und zeigt «1 Teil»');
  // Schliessen → zurück in die Detailansicht, 🧰-Box mit AKTUELLEM Zähler
  await pn.evaluate(() => window._wzKofferInhaltClose());
  await pn.waitForTimeout(200);
  const nachClose = await pn.evaluate(() => {
    const vm = document.getElementById('viewModal');
    const b = document.getElementById('vm_kofferBox');
    return { open: !!vm && !vm.classList.contains('hidden'), txt: b ? b.textContent : '' };
  });
  ok(nachClose.open, 'Schliessen des Editors führt zurück in die Koffer-Detailansicht');
  ok(/1 Teil/.test(nachClose.txt) && !/Noch leer/.test(nachClose.txt), '🧰-Box aufgefrischt («1 Teil» statt «Noch leer»)');
  ok(errsN.length === 0, 'keine pageerrors (Native) ' + (errsN.length ? '— ' + errsN.join(' | ').slice(0, 140) : ''));
  await ctx2.close();

  // ───────────────────────── Monteur: kein Sammel-Button ─────────────────────────
  console.log('— E) Monteur —');
  const { ctx: ctx3, page: pm, errs: errsM } = await newWzPage('u_mon');
  ok(await pm.evaluate(() => document.getElementById('btnSammel').style.display) === 'none', 'Monteur sieht den Sammelerfassungs-Button NICHT');
  ok(errsM.length === 0, 'keine pageerrors (Monteur)');
  await ctx3.close();
} catch (e) {
  fail++; console.error('  ✗ EXCEPTION:', e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + (pass + fail) + ' fehlgeschlagen') : ('✓ Alle ' + pass + ' Checks grün')));
process.exit(fail ? 1 : 0);
