// Feedback 28.08.2026 (Werkzeugmanagement, 9 Punkte) — Drift-Guard.
//
// Deckt ab:
//  A) Sammelerfassung optimiert: Autocomplete in der 📌-Vorgabe-Zeile (wie die
//     Einzelerfassung), EIGEN-EINGABE-SEMANTIK (nur Zeilen mit eigenem Wert
//     werden erfasst — eine Vorgabe allein erfasst NICHTS; bewusster
//     Guard-Nachzug gegenüber werkzeug_sammelerfassung_test), Auto-Vorschlag
//     der Prüf-Intervalle aus dem Bestand (Name-Match, z.B. Kabelrolle →
//     Elektro NIV) bzw. Kategorie-Fallback (maschine-kabel/ladegeraet →
//     12 Mt.), data-smluser-Respekt (eigene Eingabe wird nie überschrieben),
//     Rücknahme nicht mehr passender Auto-Werte, Leiterprüfung nur bei
//     Kategorie «leiter», wird/werden-Zähler grammatisch korrekt, Save-Runde
//     erfasst GENAU die ausgefüllten Zeilen (neueste zuoberst).
//  B) Koffer-Kennung: geänderte interne Kennung bietet die Übertragung auf
//     ALLE Teile an (Dialog nennt die bisherigen Kennungen — kein stilles
//     Überschreiben); unveränderte Kennung fragt NICHT.
//  C) Koffer kopieren: «(Kopie)»-Vorschlag, Kaufdatum heute, Seriennummern-
//     Feld je Teil; Prüf-Konfiguration/Kennung wandern mit, Historie/
//     Berichte/Zuweisung/Beleg werden zurückgesetzt, Detail öffnet direkt.
//  D) Einstellung «Koffer-Suche» (org.settings.werkzeug.kofferSucheVoll):
//     aus (Default) = nur echte Treffer; ein = Koffer + kompletter Inhalt,
//     sobald der Koffer ODER ein Teil auf die Suche passt. Die Status-Ampel
//     (überfällig/fällig) wird dabei NIE aufgefüllt (Gate currentFilter==='all').
//  E) Personenansicht 👤: Gruppen Person → 📍 Platz → Ohne Zuteilung mit
//     Zählern «N Werkzeuge · M Koffer»; Koffer-Inhalt erbt die Person über
//     seinen Koffer (_wzHalter); standardmässig zugeklappt, Index-Toggle
//     (_wzPersKeys — Platz-Namen sind Freitext und gehören nie in onclick).
//  F) NFC-Direktschreiben in der Listenansicht: 📡 nur mit NDEFReader
//     (Android) + Bearbeitungsrecht; Schreib-Pill unten mit Abbrechen;
//     zweiter Klick auf dasselbe Gerät beendet den Vorgang (der laufende
//     Schreibauftrag wird abgebrochen — _wzNfcWriteCtl wird SYNCHRON
//     gesetzt); Bulk-Modus versteckt die Knöpfe; Monteur sieht sie nie;
//     ohne NDEFReader (Desktop) erscheint kein Knopf.
//
// Aufruf:  CHROME=<chromium> node scripts/feedback_20260828_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8902;
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

// Bestand (8 Geräte): deckt Bestand-Match (Kabelrolle → Elektro 24 Mt.),
// Koffer mit 2 Teilen (Kennung/Kopie/Suche) und die Personen-/Platz-/
// Ohne-Zuteilung-Gruppen der Personenansicht ab.
const T_KABEL = { id: 't_1600000000001', name: 'Kabelrolle', cat: 'maschine-kabel', brand: 'Brennenstuhl', orgId: 'org_t', bought: '2022-03-01', hasElec: true, elecInterval: 24, berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const T_FREI = { id: 't_1600000000002', name: 'Bohrhammer', cat: 'maschine', orgId: 'org_t', bought: '2021-05-10', berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const ITEM1 = { id: 't_1600000000003', name: 'Zange Knipex', cat: 'handwerkzeug', orgId: 'org_t', bought: '2020-01-15', berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const ITEM2 = { id: 't_1600000000004', name: 'Messgeraet Fluke', cat: 'messgeraet', internKennung: 'ALT-7', serial: 'SN-1', orgId: 'org_t', bought: '2020-02-20', hasElec: true, elecInterval: 6, berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const T_PLATZ = { id: 't_1600000000005', name: 'Leiter Alu', cat: 'leiter', orgId: 'org_t', bought: '2019-07-07', hasLeiter: true, leiterInterval: 12, zugewiesenAn: { typ: 'platz', platz: 'Lager Halle B', name: 'Lager Halle B' }, berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const T_PERS = { id: 't_1600000000006', name: 'Akkuschrauber', cat: 'maschine', orgId: 'org_t', bought: '2023-02-02', zugewiesenAn: { typ: 'user', userId: 'u_ma2', name: 'Peter Person' }, berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const T_MON = { id: 't_1600000000007', name: 'Monteur-Schrauber', cat: 'maschine', orgId: 'org_t', bought: '2023-03-03', zugewiesenAn: { typ: 'user', userId: 'u_mon', name: 'Monteur Max' }, berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const KOF = { id: 't_1650000000000', name: 'Servicekoffer', cat: 'koffer', istKoffer: true, internKennung: 'KO-1', kofferInhalt: ['t_1600000000003', 't_1600000000004'], orgId: 'org_t', bought: '2020-01-15', hasService: false, hasElec: false, zugewiesenAn: { typ: 'user', userId: 'u_ma2', name: 'Peter Person' }, berichte: [], elecHistory: [], leiterHistory: [], ersatzAnfragen: [] };
const SEED_TOOLS = [T_KABEL, T_FREI, ITEM1, ITEM2, T_PLATZ, T_PERS, T_MON, KOF];

const ORGS = [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_mag'], active: true }];
const USERS = [
  { id: 'u_mag', username: 'mag@t.ch', name: 'Magazinerin', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'mag@t.ch' } },
  { id: 'u_mon', username: 'mon@t.ch', name: 'Monteur Max', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'mon@t.ch' } },
  { id: 'u_ma2', username: 'peter@t.ch', name: 'Peter Person', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'peter@t.ch' } }
];

// ───────────────────────── Statik: Code-Anker ─────────────────────────
console.log('— Statik: Feedback-28.08-Anker —');
const src = await readFile(join(ROOT, 'if_werkzeug.html'), 'utf8');
const sw = await readFile(join(ROOT, 'sw.js'), 'utf8');

ok(src.includes('function _wzWriteNFC(opts)') && /opts\.statusId\s*\|\|\s*'nfcStatus'/.test(src) && /opts\.btnId\s*\|\|\s*'nfcBtn'/.test(src) && src.includes('opts.onEnd'),
  '_wzWriteNFC ist parametrisiert (statusId/btnId/onEnd — QR-Dialog UND Listen-Pill teilen EINEN Schreibweg)');
ok(/window\._wzListNfc\s*=/.test(src) && /window\._wzListNfcClose\s*=/.test(src) && src.includes("'?scan='+id") && /_wzListNfc[\s\S]{0,700}_wzCanEditTool\(t\)/.test(src),
  '_wzListNfc/_wzListNfcClose: window-Exporte, ?scan=<id>-URL, Bearbeitungsrecht-Guard');
ok(src.includes('wzNfcPill') && src.includes('env(safe-area-inset-bottom') && /z-index:\s*10800/.test(src),
  'NFC-Schreib-Pill: fixe Leiste mit Safe-Area + z-index 10800');
ok(/!_wzBulkMode\s*&&\s*\('NDEFReader' in window\)\s*&&\s*_wzCanEditTool\(t\)/.test(src),
  '📡-Gate der Listenzeile: kein Bulk-Modus + NDEFReader + Bearbeitungsrecht');
ok(/SML_COLS\.some\(function\(c\)\s*\{\s*return d\[c\.id\];?\s*\}\)/.test(src),
  '_smlRowCounts: Eigen-Eingabe-Semantik (irgendein eigener Zeilen-Wert zählt)');
ok(src.includes('if(!_smlRowCounts(d))return;'),
  '_wzSammelSave überspringt Zeilen ohne eigene Eingabe');
ok(src.includes('data-smlauto') && src.includes('data-smluser') && src.includes('_smlAutoPruefungen') && /\[\s*'maschine-kabel'\s*,\s*'ladegeraet'\s*\]/.test(src),
  'Auto-Prüf-Vorschlag: smlauto/smluser-Marker + Kategorie-Fallback maschine-kabel/ladegeraet');
ok(src.includes("_wzInitAC('sml_fix_name'"),
  'Vorgabe-Zeile hat Autocomplete (sml_fix_name — geteilte Vorschlags-Quellen)');
ok(/leiterIv\s*>\s*0\s*&&\s*eff\.cat\s*===\s*'leiter'/.test(src),
  'Save-Gate: Leiterprüfung nur bei Kategorie «leiter» (fängt stehengebliebene Auto-Werte)');
ok(/window\._wzKofferKennungFrage\s*=/.test(src) && src.includes('kennung!==kennungAlt'),
  'Koffer-Kennung: Übertragen-Dialog nur bei GEÄNDERTER Kennung');
ok(/window\._wzKofferKopieren\s*=/.test(src) && /window\._wzKofferKopierenSave\s*=/.test(src) && src.includes('kopSer_') && src.includes("' (Kopie)'"),
  'Koffer kopieren: Dialog mit Seriennummern-Feldern + «(Kopie)»-Vorschlag');
ok(/kofferSucheVoll\s*===\s*true/.test(src) && src.includes('wzs_kofferSuche') && /wz\.kofferSucheVoll\s*=/.test(src),
  'Einstellung kofferSucheVoll: Resolver (Default aus) + ⚙️-Select + Save');
ok(/currentFilter\s*===\s*'all'\s*&&\s*_wzKofSucheVoll\(\)/.test(src),
  'Koffer-Vervollständigung greift NUR ohne Status-Filter (die Ampel wird nie aufgefüllt)');
ok(src.includes('id="vt_person"') && src.includes('id="personWrap"') && src.includes('_wzPersonenHtml') && src.includes('_wzPersKeys[i]') && src.includes('_wzHalter'),
  'Personenansicht: Umschalter, Container, Renderer, Index-Toggle über _wzPersKeys');
ok(src.includes("(count!==1?' werden':' wird')"),
  'Sammelerfassungs-Zähler: «wird/werden» grammatisch korrekt');
const swV = (sw.match(/gema-v(\d+)/) || [0, 0])[1];
ok(parseInt(swV, 10) >= 505, 'sw.js-Cache-Version numerisch ≥ 505 (ist v' + swV + ')');

// ───────────────────────── Browser-Szenarien ─────────────────────────
const browser = await chromium.launch({ executablePath: CHROME });

function seedFor(userId) {
  return {
    gema_orgs_v1: ORGS,
    gema_users_v1: USERS,
    gema_session_v1: { token: TOKEN, userId, expires: FUTURE },
    gema_werkzeug: SEED_TOOLS,
    gema_coachmarks_done_if_werkzeug_v1: '1'
  };
}

async function newWzPage(userId, opts) {
  opts = opts || {};
  const ctx = await browser.newContext(opts.viewport ? { viewport: opts.viewport } : {});
  if (opts.nfcStub) {
    // Web-NFC-Stub (Android-Chrome-Simulation): write() bleibt offen (kein Tag
    // am Gerät), makeReadOnly fehlt BEWUSST auf dem Prototype (autoLock aus) —
    // der Schreibvorgang wartet damit in _wzNfcListen und _wzNfcWriteCtl bleibt
    // gesetzt, der Toggle-Schliess-Klick ist deterministisch testbar.
    await ctx.addInitScript(() => {
      window.NDEFReader = function () {
        this.scan = function () { return Promise.resolve(); };
        this.write = function () { return new Promise(function () {}); };
        this.addEventListener = function () {};
        this.removeEventListener = function () {};
      };
    });
  }
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (isSb) {
      // bindCollection überschreibt den lokalen Cache mit dem Cloud-Stand —
      // der Bestand muss deshalb als Cloud-Rows kommen
      if (route.request().method() === 'GET' && u.indexOf('module_key=eq.werkzeugmanagement') >= 0) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
          SEED_TOOLS.map(t => ({ data_key: 'tool:' + t.id, payload: { data: t, _lm: '2026-07-10T08:00:00Z' } }))
        ) });
      }
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    }
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seedFor(userId));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  const min = opts.minTools || SEED_TOOLS.length;
  await page.waitForFunction(n => typeof window.getFiltered === 'function' && window.getFiltered().length >= n, min, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, errs };
}

try {
  // ── E) Personenansicht — VOR den Mutations-Szenarien (Zähler wären sonst stale) ──
  console.log('— E) Personenansicht 👤 —');
  const { ctx: ctx1, page, errs } = await newWzPage('u_mag', { viewport: { width: 1720, height: 900 } });

  ok(await page.evaluate(() => !!document.getElementById('vt_person')), 'Umschalter 👤 in der Ansichten-Leiste');
  await page.evaluate(() => window.setView('person'));
  await page.waitForTimeout(200);
  const pers = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('#wzPersonen .wz-pers')].map(s => ({
      nm: (s.querySelector('.wz-pers-nm') || { textContent: '' }).textContent.trim(),
      ct: (s.querySelector('.wz-pers-ct') || { textContent: '' }).textContent.trim(),
      offen: !!s.querySelector('.wz-pers-bd')
    }));
    return { secs, count: ((document.getElementById('wzPersCount') || { textContent: '' }).textContent || '').trim() };
  });
  ok(pers.secs.length === 4, '4 Gruppen (2 Personen · 1 Platz · Ohne Zuteilung) — ist ' + pers.secs.length);
  ok(pers.secs[0] && pers.secs[0].nm === 'Monteur Max' && pers.secs[0].ct === '1 Werkzeug', 'Gruppe 1: Monteur Max — «1 Werkzeug»');
  ok(pers.secs[1] && pers.secs[1].nm === 'Peter Person' && pers.secs[1].ct === '3 Werkzeuge · 1 Koffer',
    'Gruppe 2: Peter Person — «3 Werkzeuge · 1 Koffer» (Koffer-Inhalt erbt die Person über den Koffer)');
  ok(pers.secs[2] && pers.secs[2].nm === 'Lager Halle B' && pers.secs[2].ct === '1 Werkzeug', 'Gruppe 3: 📍 Lager Halle B — «1 Werkzeug»');
  ok(pers.secs[3] && pers.secs[3].nm === 'Ohne Zuteilung' && pers.secs[3].ct === '2 Werkzeuge', 'Gruppe 4: Ohne Zuteilung — «2 Werkzeuge»');
  ok(pers.secs.every(s => !s.offen), 'alle Gruppen starten zugeklappt');
  ok(pers.count === '8 Geräte', 'Zähler «8 Geräte» (ist «' + pers.count + '»)');

  await page.evaluate(() => window._wzPersonToggle(0));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => {
    const s = document.querySelectorAll('#wzPersonen .wz-pers')[0];
    return !!s && !!s.querySelector('.wz-pers-bd') && s.querySelectorAll('.wz-pers-bd .wz-lrow').length === 1;
  }), 'Toggle öffnet Gruppe 1 mit ihrer einen Zeile');
  await page.evaluate(() => window._wzPersonToggle(1));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => {
    const s = document.querySelectorAll('#wzPersonen .wz-pers')[1];
    return !!s && !!s.querySelector('.wz-pers-bd') && s.querySelector('.wz-pers-bd').textContent.indexOf('Servicekoffer') >= 0;
  }), 'Gruppe «Peter Person» zeigt den Servicekoffer im aufgeklappten Inhalt');
  await page.evaluate(() => window.setView('cards'));

  // ── D) Einstellung Koffer-Suche (VOR den Bestand-Mutationen) ──
  console.log('— D) Einstellung Koffer-Suche (kofferSucheVoll) —');
  ok(await page.evaluate(() => window._wzKofSucheVoll() === false), 'Standard AUS: nur echte Treffer');
  const treffer1 = await page.evaluate(() => {
    document.getElementById('searchInp').value = 'Zange';
    return window.getFiltered().map(t => t.id);
  });
  ok(treffer1.length === 1 && treffer1[0] === 't_1600000000003', 'Suche «Zange» (aus): NUR die Zange selbst (' + treffer1.length + ' Treffer)');
  await page.evaluate(() => window._wzOpenSettings());
  await page.waitForSelector('#wzs_kofferSuche', { timeout: 4000 });
  ok(await page.evaluate(() => document.getElementById('wzs_kofferSuche').value) === '0', '⚙️-Select startet auf «nur Treffer zeigen»');
  await page.evaluate(() => { document.getElementById('wzs_kofferSuche').value = '1'; window._wzSaveSettings(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => { try { window._wzCloseModal(); } catch (e) {} });
  ok(await page.evaluate(() => window._wzKofSucheVoll() === true), 'Einstellung gespeichert: Koffer komplett zeigen');
  ok(await page.evaluate(() => (localStorage.getItem('gema_orgs_v1') || '').indexOf('kofferSucheVoll') >= 0),
    'kofferSucheVoll liegt in den Org-Settings (gema_orgs_v1)');
  const treffer2 = await page.evaluate(() => {
    document.getElementById('searchInp').value = 'Zange';
    return window.getFiltered().map(t => t.id);
  });
  ok(treffer2.length === 3 && treffer2.indexOf('t_1650000000000') >= 0 && treffer2.indexOf('t_1600000000004') >= 0,
    'Suche «Zange» (ein): Koffer + kompletter Inhalt (' + treffer2.length + ' Treffer)');
  await page.evaluate(() => window.setFilter('overdue'));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !window.getFiltered().some(t => t.id === 't_1650000000000')),
    'Status-Ampel wird NIE aufgefüllt (überfällig + Suche → Koffer bleibt draussen)');
  await page.evaluate(() => { document.getElementById('searchInp').value = ''; window.setFilter('all'); });
  await page.waitForTimeout(150);

  // ── A) Sammelerfassung: Autocomplete, Eigen-Eingabe, Auto-Prüfungen ──
  console.log('— A) Sammelerfassung: Vorgabe-Autocomplete + Auto-Prüf-Vorschlag —');
  await page.evaluate(() => window._wzSammelOpen());
  await page.waitForSelector('#smlTable', { timeout: 4000 });
  ok(await page.evaluate(() => !!document.querySelector('.ac-drop[data-ac-for="sml_fix_name"]')),
    'Vorgabe-Bezeichnung hat ein Autocomplete-Dropdown');
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_name');
    f.focus(); f.value = 'Kabel';
    f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(450);
  ok(await page.evaluate(() => {
    const d = document.querySelector('.ac-drop[data-ac-for="sml_fix_name"]');
    return !!d && d.textContent.indexOf('Kabelrolle') >= 0;
  }), 'Vorschläge aus dem Bestand erscheinen («Kabelrolle»)');

  // Eigen-Eingabe-Semantik: eine Vorgabe ALLEIN erfasst nichts (Feedback 28.08.2026)
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_name');
    f.value = 'Kabelrolle';
    f.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const leer = await page.evaluate(() => ({
    dis: document.getElementById('smlSaveBtn').disabled,
    btn: document.getElementById('smlSaveBtn').textContent.trim(),
    cnt: document.getElementById('smlCount').textContent
  }));
  ok(leer.dis === true && leer.btn === '✓ Werkzeuge erfassen', 'Vorgabe allein: Speichern bleibt deaktiviert (keine Zeile hat eigene Eingabe)');
  ok(leer.cnt === 'Zeilen ausfüllen — leere Zeilen werden nicht erfasst', 'Zähler erklärt die Eigen-Eingabe-Regel');

  // Auto-Vorschlag auf VORGABE-Ebene: Bestand-Match hat Vorrang vor dem Kategorie-Fallback
  await page.evaluate(() => document.getElementById('sml_fix_name').dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(150);
  const fixAuto = await page.evaluate(() => ({
    v: document.getElementById('sml_fix_elec').value,
    auto: document.getElementById('sml_fix_elec').getAttribute('data-smlauto'),
    sichtbar: !!document.getElementById('sml_fix_elec').offsetParent,
    info: getComputedStyle(document.getElementById('smlAutoInfo')).display !== 'none'
  }));
  ok(fixAuto.v === '24' && fixAuto.auto === '1', 'Vorgabe «Kabelrolle» → Elektro-Intervall 24 Mt. aus dem Bestand vorgeschlagen');
  ok(fixAuto.sichtbar, 'die (versteckte) Elektro-Spalte wird dafür automatisch eingeblendet');
  ok(fixAuto.info, 'Hinweiszeile «⚡ Prüf-Intervalle automatisch vorgeschlagen …» sichtbar');
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_name');
    f.value = '';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('sml_fix_elec').value === '' && !document.getElementById('sml_fix_elec').getAttribute('data-smlauto')),
    'Vorgabe geleert → Auto-Vorschlag zurückgenommen');
  await page.evaluate(() => {
    const c = document.getElementById('sml_fix_cat');
    c.value = 'maschine-kabel';
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('sml_fix_elec').value === '12'),
    'Kategorie «Maschine (Kabel)» ohne Bestand-Treffer → Fallback Elektro 12 Mt.');
  await page.evaluate(() => {
    const c = document.getElementById('sml_fix_cat');
    c.value = '';
    c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('sml_fix_elec').value === ''),
    'Kategorie zurückgesetzt → Vorschlag wieder weg');

  // Auto-Vorschlag auf ZEILEN-Ebene
  // KRITISCH — Zeilen werden ueber ihre POSITION adressiert, nie ueber eine
  // geratene id: _wzSmlAddRows vergibt die Feld-ids aus einem laufenden Zaehler
  // (`var ri=++_smlRowSeq` → erste Zeile ist sml_r1_*, NICHT sml_r0_*). Die
  // Position ist unabhaengig vom Nummernschema und bleibt gueltig, wenn eine
  // Zeile geloescht wird. Muster: setRow in werkzeug_sammelerfassung_test.mjs.
  const setZeile = (n, col, val, mitChange) => page.evaluate(a => {
    const tr = document.querySelectorAll('#smlTbody tr.sml-row')[a.n];
    const el = tr.querySelector('[data-smlrowcol="' + a.col + '"]');
    el.value = a.val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (a.ch) el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { n, col, val, ch: !!mitChange });
  const leseZeile = (n, col, attr) => page.evaluate(a => {
    const tr = document.querySelectorAll('#smlTbody tr.sml-row')[a.n];
    const el = tr.querySelector('[data-smlrowcol="' + a.col + '"]');
    return a.attr ? el.getAttribute(a.attr) : el.value;
  }, { n, col, attr: attr || '' });

  await setZeile(0, 'name', 'Kabelrolle', true);
  await page.waitForTimeout(120);
  ok(await leseZeile(0, 'elec') === '24' && await leseZeile(0, 'elec', 'data-smlauto') === '1',
    'Zeile: Bestand-Treffer «Kabelrolle» → Elektro 24 Mt. in der Zeile');
  await setZeile(1, 'name', 'Neues Kabelgeraet', true);
  await setZeile(1, 'cat', 'maschine-kabel', true);
  await page.waitForTimeout(120);
  ok(await leseZeile(1, 'elec') === '12',
    'Zeile ohne Bestand-Treffer, Kategorie kabelgebunden → Fallback 12 Mt.');
  await setZeile(1, 'elec', '99', false);
  await setZeile(1, 'cat', 'maschine-kabel', true);
  await page.waitForTimeout(120);
  ok(await leseZeile(1, 'elec') === '99',
    'eigene Eingabe (99) wird vom Auto-Vorschlag NIE überschrieben (data-smluser)');
  await setZeile(0, 'name', '', true);
  await page.waitForTimeout(120);
  ok(await leseZeile(0, 'elec') === '' && !(await leseZeile(0, 'elec', 'data-smlauto')),
    'Zeilen-Name geleert → Auto-Wert der Zeile zurückgenommen');
  await setZeile(2, 'name', 'Leiter Alu', true);
  await setZeile(2, 'cat', 'leiter', true);
  await page.waitForTimeout(120);
  ok(await leseZeile(2, 'leiter') === '12',
    'Leiter aus dem Bestand → Leiterprüfung 12 Mt. (nur bei Kategorie «leiter»)');

  // Save-Runde: GENAU die ausgefüllten Zeilen werden erfasst
  console.log('— A2) Sammelerfassung: Speichern mit Eigen-Eingabe-Regel —');
  await page.evaluate(() => { window._wzCloseModal(); window._wzSammelOpen(); });
  await page.waitForSelector('#smlTable', { timeout: 4000 });
  await page.evaluate(() => {
    const f = document.getElementById('sml_fix_name');
    f.value = 'Serie X'; f.dispatchEvent(new Event('input', { bubbles: true }));
    const c = document.getElementById('sml_fix_cat');
    c.value = 'handwerkzeug'; c.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await setZeile(0, 'serial', 'S-1', false);
  ok(await page.evaluate(() => document.getElementById('smlCount').textContent) === '1 von 5 Zeilen wird erfasst',
    'Zähler Singular «1 von 5 Zeilen wird erfasst»');
  await setZeile(1, 'serial', 'S-2', false);
  const vollCnt = await page.evaluate(() => ({
    cnt: document.getElementById('smlCount').textContent,
    btn: document.getElementById('smlSaveBtn').textContent.trim(),
    dis: document.getElementById('smlSaveBtn').disabled
  }));
  ok(vollCnt.cnt === '2 von 5 Zeilen werden erfasst', 'Zähler Plural «2 von 5 Zeilen werden erfasst»');
  ok(vollCnt.btn === '✓ 2 Werkzeuge erfassen' && !vollCnt.dis, 'Button «✓ 2 Werkzeuge erfassen» aktiv');
  await page.evaluate(() => window._wzSammelSave());
  await page.waitForTimeout(450);
  const gespeichert = await page.evaluate(() => {
    const alle = window.getFiltered();
    return {
      n: alle.filter(t => t.name === 'Serie X').length,
      erste: alle[0] ? { name: alle[0].name, serial: alle[0].serial, cat: alle[0].cat, hs: alle[0].hasService, he: alle[0].hasElec } : null
    };
  });
  ok(gespeichert.n === 2, 'GENAU die 2 ausgefüllten Zeilen wurden erfasst (3 leere nicht)');
  ok(!!gespeichert.erste && gespeichert.erste.name === 'Serie X' && gespeichert.erste.serial === 'S-1',
    'Zeile 1 = neuestes Gerät (Erfassungs-Reihenfolge bleibt)');
  ok(!!gespeichert.erste && gespeichert.erste.cat === 'handwerkzeug' && gespeichert.erste.hs === false && gespeichert.erste.he === false,
    'Vorgaben angewendet, keine Prüfungen ohne Intervall (hasService/hasElec false)');

  // ── B) Koffer-Kennung auf den Inhalt übertragen ──
  console.log('— B) Koffer-Kennung auf den Inhalt übertragen —');
  await page.evaluate(() => window.openKofferForm('t_1650000000000'));
  await page.waitForSelector('#kofKennung', { timeout: 4000 });
  await page.evaluate(() => { document.getElementById('kofKennung').value = 'KO-9'; });
  await page.evaluate(() => window._wzSaveKofferForm('t_1650000000000'));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const dlgTxt = await page.evaluate(() => document.querySelector('.gema-dlg-bg').textContent);
  ok(dlgTxt.indexOf('Kennung auf den Inhalt übertragen') >= 0, 'Dialog «Kennung auf den Inhalt übertragen?» erscheint');
  ok(dlgTxt.indexOf('ALT-7') >= 0, 'Dialog nennt die bisherige Kennung des Teils (ALT-7 — kein stilles Überschreiben)');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => {
    const f = id => window.getFiltered().find(t => t.id === id) || {};
    return f('t_1600000000003').internKennung === 'KO-9' && f('t_1600000000004').internKennung === 'KO-9' && f('t_1650000000000').internKennung === 'KO-9';
  }), 'Kennung KO-9 auf Koffer UND beide Teile übertragen (1:1)');
  await page.evaluate(() => window.openKofferForm('t_1650000000000'));
  await page.waitForSelector('#kofKennung', { timeout: 4000 });
  await page.evaluate(() => window._wzSaveKofferForm('t_1650000000000'));
  await page.waitForTimeout(450);
  ok(await page.evaluate(() => {
    const d = document.querySelector('.gema-dlg-bg');
    return !d || getComputedStyle(d).display === 'none';
  }), 'unveränderte Kennung → KEIN Übertragen-Dialog (Gegenprobe)');

  // ── C) Koffer kopieren ──
  console.log('— C) Koffer kopieren —');
  await page.evaluate(() => window._wzKofferKopieren('t_1650000000000'));
  await page.waitForSelector('#kopName', { timeout: 4000 });
  const kop = await page.evaluate(() => ({
    name: document.getElementById('kopName').value,
    bought: document.getElementById('kopBought').value,
    ser: document.querySelectorAll('[id^="kopSer_"]').length
  }));
  ok(kop.name === 'Servicekoffer (Kopie)', 'Namens-Vorschlag «Servicekoffer (Kopie)»');
  ok(kop.bought === HEUTE, 'Kaufdatum-Vorschlag = heute');
  ok(kop.ser === 2, 'je Teil ein Seriennummern-Feld (' + kop.ser + ')');
  await page.evaluate(() => {
    document.getElementById('kopSer_0').value = 'NEU-1';
    document.getElementById('kopKennung').value = 'KO-K';
  });
  await page.evaluate(() => window._wzKofferKopierenSave('t_1650000000000'));
  await page.waitForTimeout(450);
  const kopie = await page.evaluate(() => {
    const alle = window.getFiltered();
    const neu = alle[0] || {};
    const teil = id => alle.find(t => t.id === id) || {};
    const p0 = teil((neu.kofferInhalt || [])[0]), p1 = teil((neu.kofferInhalt || [])[1]);
    return {
      koffer: { istKoffer: !!neu.istKoffer, name: neu.name, kennung: neu.internKennung, n: (neu.kofferInhalt || []).length },
      p0: { name: p0.name, serial: p0.serial },
      p1: { serial: p1.serial, hasElec: p1.hasElec, iv: p1.elecInterval, lastElec: p1.lastElec, hist: (p1.elecHistory || []).length, ber: (p1.berichte || []).length, bought: p1.bought, warranty: p1.warranty, zuw: p1.zugewiesenAn, kennung: p1.internKennung }
    };
  });
  ok(kopie.koffer.istKoffer && kopie.koffer.name === 'Servicekoffer (Kopie)' && kopie.koffer.kennung === 'KO-K' && kopie.koffer.n === 2,
    'neuer Koffer zuoberst: «Servicekoffer (Kopie)», Kennung KO-K, 2 Teile');
  ok(kopie.p0.name === 'Zange Knipex' && kopie.p0.serial === 'NEU-1', 'Teil 1 kopiert, Seriennummer aus dem Dialog (NEU-1)');
  ok(kopie.p1.serial === '' && kopie.p1.hasElec === true && kopie.p1.iv === 6,
    'Teil 2: Prüf-Konfiguration bleibt (Elektro 6 Mt.), Seriennummer leer');
  ok(kopie.p1.lastElec === null && kopie.p1.hist === 0 && kopie.p1.ber === 0 && kopie.p1.zuw === null,
    'Teil 2: Historie/Berichte/Zuweisung zurückgesetzt');
  ok(kopie.p1.bought === HEUTE && String(kopie.p1.warranty || '') > HEUTE, 'Teil 2: Kaufdatum heute + Garantie-Default');
  ok(kopie.p1.kennung === 'KO-9', 'interne Kennung wandert 1:1 mit (KO-9 aus Szenario B)');
  ok(await page.evaluate(() => { const m = document.getElementById('viewModal'); return !!m && !m.classList.contains('hidden'); }),
    'Detail des neuen Koffers öffnet sich direkt (nur noch Seriennummern/Details prüfen)');
  await page.evaluate(() => window.closeView());

  // Ohne Web-NFC (Desktop-Chromium) erscheint der 📡-Knopf NICHT
  await page.evaluate(() => window.setView('list'));
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.querySelectorAll('.wz-lnfc').length) === 0, 'ohne NDEFReader: kein 📡 in der Liste');
  ok(errs.length === 0, 'keine pageerrors auf der Hauptseite' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx1.close();

  // ── F) NFC-Direktschreiben in der Listenansicht (Android-Stub) ──
  console.log('— F) NFC-Direktschreiben in der Liste (NDEFReader-Stub) —');
  const { ctx: ctx2, page: pn, errs: errsN } = await newWzPage('u_mag', { nfcStub: true });
  await pn.evaluate(() => window.setView('list'));
  await pn.waitForTimeout(250);
  ok(await pn.evaluate(() => document.querySelectorAll('.wz-lnfc').length) > 0, 'mit NDEFReader + Bearbeitungsrecht: 📡-Knöpfe in der Liste');
  await pn.locator('.wz-lnfc').first().click();
  await pn.waitForTimeout(500);
  const pill = await pn.evaluate(() => {
    const p = document.getElementById('wzNfcPill');
    return { da: !!p, disp: p ? getComputedStyle(p).display : '', nm: p ? ((document.getElementById('wzNfcPillNm') || { textContent: '' }).textContent || '') : '' };
  });
  ok(pill.da && pill.disp === 'flex', 'Schreib-Pill erscheint unten (fix, mit ✕ Abbrechen)');
  ok(pill.nm.indexOf('Servicekoffer') >= 0, 'Pill nennt das Gerät («' + pill.nm.trim() + '»)');
  await pn.locator('.wz-lnfc').first().click();
  await pn.waitForTimeout(400);
  ok(await pn.evaluate(() => getComputedStyle(document.getElementById('wzNfcPill')).display === 'none'),
    'zweiter Klick auf dasselbe Gerät bricht den Schreibvorgang ab (Pill weg)');
  await pn.evaluate(() => window._wzToggleBulkMode());
  await pn.waitForTimeout(250);
  ok(await pn.evaluate(() => document.querySelectorAll('.wz-lnfc').length) === 0, 'Bulk-Modus versteckt die 📡-Knöpfe');
  ok(errsN.length === 0, 'keine pageerrors (NFC-Kontext)' + (errsN.length ? ' — ' + errsN[0] : ''));
  await ctx2.close();

  const { ctx: ctx3, page: pm } = await newWzPage('u_mon', { nfcStub: true, minTools: 1 });
  await pm.evaluate(() => window.setView('list'));
  await pm.waitForTimeout(250);
  ok(await pm.evaluate(() => document.querySelectorAll('.wz-lnfc').length) === 0,
    'Monteur: trotz NDEFReader KEIN 📡 (kein Bearbeitungsrecht)');
  await ctx3.close();
} finally {
  await browser.close(); server.close();
}

console.log('\n' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
