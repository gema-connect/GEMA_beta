// Drift-Guard: Feedback 05.08.2026 · Runde 2 (gema_feedback_20260805_2.md)
//
// Abgedeckt:
//  A  gema_sektion.js — Fold-Pfeil grösser (36 px) + über die Mask überall
//     IDENTISCH (auch bei modul-eigenen ▾/▸-Pfeilen); zugeklappt verschwinden
//     die Kopf-Bedienelemente/-Texte (gsek-hd-weg), nicht nur der Rumpf.
//  B  gema_responsive.css — Eingabefeld + Einheiten-Box bündig (34 px,
//     border-box, .fg-unit als inline-flex); .gnav-weg schlägt die
//     !important-Metriken der Nav-Buttons (display:none).
//  C  sb_apparateliste — Wizard: Status-Zeile ja/bauseits/nicht vorhanden
//     statt Ja/Nein-Karte (bauseits/nicht → alles ausgegraut, bauseits-Zeile
//     im Ergebnis), leere Status ≠ wählbar-Bug behoben (Chips immer aktiv),
//     Gruppen einklappbar, Karte heisst «Auswahl», EIN ＋-Menü (Apparate/Raum),
//     Altbestand ohne apStatus rendert unverändert (nie bauseits).
//  D  sys_lieferant_dashboard — Tab-Reihenfolge Übersicht · Produktkatalog ·
//     Offertanfragen · Bestellungen; Mitarbeiter + Firmenprofil als Nav-Knöpfe
//     NUR für Org-Admins (gnav-weg); KPI-Kacheln füllen die Zeile (auto-fit);
//     Embed-Modus (?embed=1: Nav weg, <base target="_top">).
//  E  sys_workspace — Klassen-Eimer: die KLASSE ist die Wahrheit (Konto nicht
//     in der Klasse → Eimer unsichtbar, auch als zufälliger Ersteller);
//     hervorgehobene Eimer schimmern in der Org-Primärfarbe (pdfFarben);
//     Lieferanten-Dashboard FIX im Eimer integriert (direktModul + iframe
//     ?embed=1, keine Modul-Kachel); _wsWann-Altlast «gerade eben» ohne ts
//     wird nie mehr als Zeit angezeigt.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260805_2_test.mjs
import { chromium } from 'playwright-core';
import { startServer, wireRoutes, seed, BASE, newPage } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};
const norm = s => String(s || '').replace(/\s+/g, '');

/* ═══ Teil A — gema_sektion.js (statisch) ═════════════════════════════════ */
console.log('■ A: gema_sektion.js — Pfeil + Kopf-Texte');
const SEK = readFileSync('gema_sektion.js', 'utf8');
ok('Pfeil-Knopf 36 px', /\.gsek-cx\{[^}]*width:36px[^}]*height:36px/.test(SEK));
ok('EIN Chevron über die CSS-Mask (identisch für alle Module)',
  /\.gsek-cx::before\{[^}]*mask:/.test(SEK) && /var MASK\s*=\s*'url\("data:image\/svg\+xml/.test(SEK));
ok('modul-eigener Pfeiltext wird versteckt (font-size:0 + Kind-Reset)',
  /\.gsek-cx\{[^}]*font-size:0/.test(SEK) && /\.gsek-cx\s*>\s*\*\{display:none/.test(SEK));
ok('zugeklappt dreht die Mask (-90°)', /\.gsek-cx\.zu::before\{[^}]*rotate\(-90deg\)/.test(SEK));
ok('Kopf-Bedienelemente verschwinden zugeklappt (gsek-hd-weg)',
  /\.gsek-zu\s*>\s*\.gsek-hd\s*>\s*\.gsek-hd-weg\{display:none!important\}/.test(SEK));
ok('kopfKinderMarkieren existiert und läuft im sync()',
  /function kopfKinderMarkieren\(/.test(SEK) && /kopfKinderMarkieren\(sec\)/.test(SEK));
ok('.g-section-num in den Nummern-Klassen', /NR_KLASSEN\s*=\s*'[^']*\.g-section-num/.test(SEK));

/* ═══ Teil B — gema_responsive.css (statisch) ═════════════════════════════ */
console.log('■ B: gema_responsive.css — bündige Einheiten-Box + gnav-weg');
const RESP = readFileSync('gema_responsive.css', 'utf8');
ok('fg-Zeile: Feld + Einheit gleich hoch (34px, !important)',
  /\.fg\s*>\s*\.fg-inp,\s*\.fg\s*>\s*select\.fg-inp,\s*\.fg\s*>\s*\.fg-unit\s*\{[^}]*height:\s*34px\s*!important/.test(RESP));
ok('fg-unit zentriert als inline-flex',
  /\.fg\s*>\s*\.fg-unit\s*\{[^}]*display:\s*inline-flex\s*!important/.test(RESP));
ok('g-inp-group streckt die Einheiten-Box (align-items:stretch)',
  /:where\(\.g-inp-group\)\s*\{\s*align-items:\s*stretch/.test(RESP));
ok('.gnav-weg blendet Nav-Buttons trotz !important-Metriken aus',
  /\.g-nav\s+\.g-nav-btn\.gnav-weg\s*\{\s*display:\s*none\s*!important/.test(RESP));

/* ═══ Teil C statisch — sb_apparateliste ══════════════════════════════════ */
console.log('■ C: sb_apparateliste — Status-Modell (statisch)');
const AP = readFileSync('sb_apparateliste.html', 'utf8');
ok('apStatus/apStatusSet vorhanden (additives Status-Modell)',
  /function apStatus\(/.test(AP) && /function apStatusSet\(/.test(AP));
ok('Status-Zeile mit ja/bauseits/nicht', /'ja'/.test(AP) && /bauseits/.test(AP) && /ap-statusrow/.test(AP));
ok('Ja/Nein-Auswahlkarte entfernt (kein «vorhanden?»-gbox mehr)', !/gbox\('[^']*vorhanden\?/.test(AP));
ok('Gruppen einklappbar (wizard.fold + gbox-cx)', /wizard\.fold/.test(AP) && /gbox-cx/.test(AP));
ok('Karte heisst «Auswahl»', /class="g-section-title">Auswahl</.test(AP));
ok('EIN ＋-Menü mit Apparate/Raum', /apAddMenu/.test(AP) && /apAddPick\('raum'\)/.test(AP) && /apAddPick\('apparate'\)/.test(AP));
ok('buildRows kennt bauseits', /bauseits/.test(AP) && /bs\('bath'\)/.test(AP));
ok('kompakte Auswahl-Karten (minmax(150px)', /\.choice-grid\{[^}]*minmax\(150px/.test(AP));
ok('Hooks exportiert (apStatus/apStatusSet)', /_apHooks[\s\S]{0,600}apStatus/.test(AP));

/* ═══ Teil D statisch — sys_lieferant_dashboard ═══════════════════════════ */
console.log('■ D: sys_lieferant_dashboard (statisch)');
const LD = readFileSync('sys_lieferant_dashboard.html', 'utf8');
{
  const iU = LD.indexOf("id:'uebersicht'"), iP = LD.indexOf("id:'produkte'"),
        iO = LD.indexOf("id:'anfragen'"), iB = LD.indexOf("id:'bestellungen'");
  ok('Tab-Reihenfolge Übersicht → Produktkatalog → Offertanfragen → Bestellungen',
    iU >= 0 && iU < iP && iP < iO && iO < iB, { iU, iP, iO, iB });
}
ok('Tab heisst «Produktkatalog»', /label:'Produktkatalog'/.test(LD) && !/label:'Meine Produkte'/.test(LD));
ok('Mitarbeiter/Firmenprofil NICHT mehr in der Tab-Zeile',
  !/TABS[\s\S]{0,800}id:'mitarbeiter'/.test(LD.slice(LD.indexOf('function setupTabs'), LD.indexOf('function setupTabs') + 2200)));
ok('Nav-Knöpfe navMitarbeiter + navProfil mit gnav-weg',
  /id="navMitarbeiter"/.test(LD) && /id="navProfil"/.test(LD) && /class="g-nav-btn gnav-weg"/.test(LD));
ok('Gating über _liefIsAdmin (nur Org-Admins der Firma)',
  /adminNav\s*=\s*_liefIsAdmin\(\)/.test(LD) && /classList\.toggle\('gnav-weg',!adminNav\)/.test(LD));
ok('KPI-Zeile füllt die Breite (auto-fit)', /\.kpi-row\{[^}]*auto-fit/.test(LD));
ok('Embed-Modus: gema-embed + Nav weg + base target=_top',
  /gema-embed/.test(LD) && /html\.gema-embed \.g-nav\{display:none!important\}/.test(LD) && /_gb\.target='_top'/.test(LD));

/* ═══ Teil E statisch — sys_workspace ═════════════════════════════════════ */
console.log('■ E: sys_workspace (statisch)');
const WS = readFileSync('sys_workspace.html', 'utf8');
ok('Klassen-Eimer: LIVE-Mitgliedschaft entscheidet (_wsKlasseMitglied)',
  /function _wsKlasseMitglied\(/.test(WS) && /autoTyp==='klasse'/.test(WS));
ok('Ersteller-Ausnahme gilt NICHT für Auto-Eimer',
  /b\.createdBy===uid&&!b\.autoTyp\)return true/.test(WS));
ok('Pin-Schimmer aus der Org-Primärfarbe (_wsPinFarben + Variablen)',
  /function _wsPinFarben\(/.test(WS) && /--ws-pin1/.test(WS) && /pdfFarben/.test(WS));
ok('Kontrastschutz für die Textfarbe (≥4.5:1)', /_wsKontrastInk/.test(WS) && /4\.5/.test(WS));
ok('CSS nutzt die Variablen mit Blau-Fallback',
  /var\(--ws-pin1,#eef4ff\)/.test(WS) && /var\(--ws-pin-bd,#d8e4f8\)/.test(WS));
ok('Lieferanten-Dashboard als direkt integriertes Modul (AUTO_ROLLEN_EIMER.direkt)',
  /direkt:'sys_lieferant_dashboard'/.test(WS) && /b\.direktModul!==def\.direkt/.test(WS));
ok('renderContent bettet das Direkt-Modul ein (?embed=1)',
  /ws-direkt-frame/.test(WS) && /embed=1/.test(WS));
ok('frühere Dashboard-Kachel wird beim Provisionieren entfernt',
  /b\.modules=\(b\.modules\|\|\[\]\)\.filter\(function\(m\)\{return m\.mod!==def\.direkt;\}\)/.test(WS));
ok('nativer Screen: Direkt-Modul als Zeile', /b\.direktModul/.test(WS) && /direkt integriert/.test(WS));
ok('_wsWann: Altlast-Texte ohne ts werden unterdrückt',
  /function _wsWannAlt\(/.test(WS) && /gerade eben\|\^vor \|soeben/.test(WS));
ok('Vorlagen/Zuletzt sind Container mit Direkt-Einträgen (keine reinen Buttons)',
  /ws-mod-hero-item/.test(WS) && /_wsHeroVorlagen/.test(WS) && /_wsHeroZuletzt/.test(WS));

/* ═══ Teil F — Browser ════════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

// Kontext mit Row-Mock: der Harness antwortet auf jeden Cloud-GET mit [] —
// bindCollection würde geseedete Pools leeren. Diese Route liegt danach und
// gewinnt: sie liefert die Seeds als echte per-Record-Rows.
async function ctxMitRows(seedObj, rowsByModule) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await wireRoutes(ctx);
  await ctx.route(/rest\/v1\/gema_data/, route => {
    if (route.request().method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const u = route.request().url();
    let rows = [];
    for (const [mk, list] of Object.entries(rowsByModule || {})) {
      if (new RegExp('module_key=eq\\.' + mk).test(u)) rows = list;
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seedObj);
  const page = await ctx.newPage();
  return { ctx, page };
}

/* ── F1: Apparateliste — Status-Workflow im Wizard ── */
console.log('■ F1: sb_apparateliste im Browser');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/sb_apparateliste.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._apHooks && typeof window.apAddPick === 'function', null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const out = {};
    out.titel = [...document.querySelectorAll('.g-section-title')].map(e => e.textContent.trim());
    window.apAddMenu();
    out.menuOffen = !document.getElementById('apAddMenu').classList.contains('hidden');
    window.apAddPick('apparate');
    await new Promise(r2 => setTimeout(r2, 300));
    const body = document.getElementById('modalBody');
    out.keinJaNein = body.textContent.indexOf('vorhanden?') < 0;
    const chips = [...body.querySelectorAll('.ap-status')];
    out.chipsAktiv = chips.length >= 3 && chips.every(b => !b.disabled);
    out.grau0 = [...body.querySelectorAll('.gbox')].every(g => g.classList.contains('off'));
    chips.find(b => b.dataset.st === 'ja').click();
    await new Promise(r2 => setTimeout(r2, 150));
    out.aktivNachJa = ![...document.querySelectorAll('#modalBody .gbox')].some(g => g.classList.contains('off'));
    document.querySelector('#modalBody .ap-status[data-st="bauseits"]').click();
    await new Promise(r2 => setTimeout(r2, 150));
    out.grauBauseits = [...document.querySelectorAll('#modalBody .gbox')].every(g => g.classList.contains('off'));
    const t = document.querySelector('#modalBody .gbox-title');
    if (t) t.click();
    await new Promise(r2 => setTimeout(r2, 150));
    const box2 = document.querySelector('#modalBody .gbox');
    out.fold = box2 && box2.classList.contains('zu') &&
      getComputedStyle(box2.querySelector('.choice-grid')).display === 'none';
    document.getElementById('btnSaveNow').click();
    await new Promise(r2 => setTimeout(r2, 250));
    const st = window._apHooks.getState();
    out.rows = window._apHooks.buildRows(st.rooms[st.rooms.length - 1]).map(x => x.app + '|' + x.details);
    out.alt = window._apHooks.buildRows({
      roomType: 'Badezimmer', qty: 1, hasWashbasin: true, washbasinType: 'normal',
      washbasinFaucet: 'UP', washbasinVanity: false, washbasinDuofix: 'none',
      washbasinMeterRun: false, mirror: 'nein'
    }).map(x => x.app + '|' + x.details);
    return out;
  });
  ok('Karte heisst «Auswahl»', r.titel.indexOf('Auswahl') >= 0, r.titel);
  ok('＋-Menü öffnet (Apparate/Raum)', r.menuOffen === true);
  ok('keine Ja/Nein-Frage mehr im Schritt', r.keinJaNein === true);
  ok('Status-Chips vorhanden und AKTIV (auch bei leeren Karten)', r.chipsAktiv === true);
  ok('«Ohne Raum» startet mit Status nicht → alles ausgegraut', r.grau0 === true);
  ok('Status «ja» aktiviert die Konfiguration', r.aktivNachJa === true);
  ok('Status «bauseits» graut alles aus', r.grauBauseits === true);
  ok('Gruppen einklappbar (choice-grid verschwindet)', r.fold === true);
  ok('bauseits-Zeile im Ergebnis', r.rows.some(x => /bauseits/.test(x)), r.rows);
  ok('Altbestand ohne apStatus rendert unverändert (nie bauseits)',
    r.alt.length === 1 && !/bauseits/.test(r.alt[0]), r.alt);
  await ctx.close();
}

/* ── F2: Lieferanten-Dashboard — Tabs/Nav/KPI + Embed ── */
console.log('■ F2: sys_lieferant_dashboard im Browser');
async function ldProbe(roles, query) {
  const { ctx, page } = await newPage(browser, seed(roles));
  await page.goto(BASE + '/sys_lieferant_dashboard.html' + (query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const r = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tab')].map(t => t.textContent.trim().replace(/\s+\d+$/, ''));
    const kpis = [...document.querySelectorAll('.kpi')];
    let breit = true;
    if (kpis.length >= 2) {
      const row = document.getElementById('kpis').getBoundingClientRect();
      const last = kpis[kpis.length - 1].getBoundingClientRect();
      breit = Math.abs(row.right - last.right) < 4 &&
        Math.abs(kpis[0].getBoundingClientRect().width - last.width) < 2;
    }
    return {
      tabs,
      navMit: getComputedStyle(document.getElementById('navMitarbeiter')).display !== 'none',
      navProf: getComputedStyle(document.getElementById('navProfil')).display !== 'none',
      kpiBreit: breit,
      embedCls: document.documentElement.classList.contains('gema-embed'),
      navWeg: (function(){ const nv = document.querySelector('.g-nav'); return nv ? getComputedStyle(nv).display === 'none' : true; })(),
      baseTop: (function(){ const b = document.querySelector('base'); return b ? b.target : ''; })()
    };
  });
  await ctx.close();
  return r;
}
{
  const admin = await ldProbe(['role_lieferant_admin']);
  ok('Tabs beginnen mit Übersicht · Produktkatalog · Offertanfragen · Bestellungen',
    /Übersicht/.test(admin.tabs[0]) && /Produktkatalog/.test(admin.tabs[1]) &&
    /Offertanfragen/.test(admin.tabs[2]) && /Bestellungen/.test(admin.tabs[3]), admin.tabs);
  ok('Mitarbeiter/Firmenprofil NICHT als Tabs', !admin.tabs.some(t => /Mitarbeiter|Firmenprofil/.test(t)), admin.tabs);
  ok('Org-Admin sieht die Nav-Knöpfe', admin.navMit && admin.navProf);
  ok('KPI-Kacheln füllen die Zeile gleichmässig', admin.kpiBreit === true);

  const intern = await ldProbe(['role_produktlieferant_produkte']);
  ok('Nicht-Admin sieht Mitarbeiter/Firmenprofil NICHT', !intern.navMit && !intern.navProf, intern);

  const emb = await ldProbe(['role_lieferant'], '?embed=1');
  ok('?embed=1: gema-embed-Klasse + Nav ausgeblendet', emb.embedCls && emb.navWeg, emb);
  ok('?embed=1: <base target="_top"> für echte Navigationen', emb.baseTop === '_top');
  const nrm = await ldProbe(['role_lieferant']);
  ok('ohne embed: Nav sichtbar, keine Klasse', !nrm.embedCls && !nrm.navWeg);
}

/* ── F3: Workspace — Direkt-Dashboard + Pin-Farben ── */
console.log('■ F3: sys_workspace — Rollen-Eimer + Primärfarbe');
{
  const s = seed(['role_lieferant']);
  s.gema_orgs_v1[0].settings = { pdfFarben: { primary: '#e11d48' } };
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  const { ctx, page } = await newPage(browser, s);
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem('gema_ws_pool_v1') || '[]');
    return arr.find(x => x.id && x.id.indexOf('ws_auto_lieferant_') === 0) || null;
  });
  ok('Auto-Eimer provisioniert mit direktModul', !!b && b.direktModul === 'sys_lieferant_dashboard', b && b.direktModul);
  ok('keine Dashboard-Kachel im Auto-Eimer', b && !(b.modules || []).some(m => m.mod === 'sys_lieferant_dashboard'));
  await page.evaluate(id => window._wsOpen(id), b.id);
  await page.waitForTimeout(400);
  const det = await page.evaluate(() => ({
    frame: (function(){ const f = document.querySelector('.ws-direkt-frame'); return f ? f.getAttribute('src') : null; })(),
    voll: (function(){ const a = document.querySelector('.ws-direkt-bar a'); return a ? a.getAttribute('href') : null; })(),
    pin1: document.documentElement.style.getPropertyValue('--ws-pin1'),
    ink: document.documentElement.style.getPropertyValue('--ws-pin-ink'),
    row: (function(){ const r = document.querySelector('.ws-bucket-row--pinned'); return r ? getComputedStyle(r).backgroundImage : ''; })()
  }));
  ok('Eimer-Inhalt = eingebettetes Dashboard (?embed=1)', /sys_lieferant_dashboard\.html\?embed=1/.test(det.frame || ''), det.frame);
  ok('Vollbild-Link ohne embed', det.voll === 'sys_lieferant_dashboard.html');
  ok('--ws-pin1 = Tint der Primärfarbe', /^rgb\(/.test(det.pin1));
  ok('--ws-pin-ink = dunkler Kontrastton', /^#[0-9a-f]{6}$/.test(det.ink));
  ok('pinned-Zeile schimmert in der Firmenfarbe', norm(det.row).indexOf(norm(det.pin1)) >= 0, det);
  await ctx.close();

  // ohne Firmenfarbe: Fallback-Blau
  const s2 = seed(['role_lieferant']);
  s2.gema_coachmarks_done_sys_workspace_v2 = '1';
  const { ctx: c2, page: p2 } = await newPage(browser, s2);
  await p2.goto(BASE + '/sys_workspace.html', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1200);
  const fb = await p2.evaluate(() => ({
    v1: document.documentElement.style.getPropertyValue('--ws-pin1'),
    row: (function(){ const r = document.querySelector('.ws-bucket-row--pinned'); return r ? getComputedStyle(r).backgroundImage : ''; })()
  }));
  ok('ohne Firmenfarbe bleiben die Blau-Fallbacks', fb.v1 === '' && norm(fb.row).indexOf('rgb(238,244,255)') >= 0, fb);
  await c2.close();
}

/* ── F4: Workspace — Klassen-Eimer-Sichtbarkeit ── */
console.log('■ F4: sys_workspace — die Klasse ist die Wahrheit');
{
  const klBucket = (nurUser) => ({
    id: 'ws_kl_k1', name: 'Klasse HF-24', type: 'training', ownerType: 'org', ownerOrgId: 'org_test',
    createdBy: 'u_test', autoTyp: 'klasse', autoKlasseId: 'k1', pinned: true,
    accessControl: { orgVisible: false, invitedUsers: [], revokedUsers: [], nurUserIds: nurUser },
    org: '', members: [], modules: [{ mod: 'ab_klassen', status: 'offen' }],
    activity: [], beteiligte: [], notes: [], objektId: null, createdAt: new Date().toISOString()
  });
  const rows = (bucket, klasse) => ({
    workspace: [{ data_key: 'ws:' + bucket.id, payload: { data: bucket } }],
    schule: klasse ? [{ data_key: 'sklasse:' + klasse.id, payload: { data: klasse } }] : []
  });
  async function sicht(seedObj, rowsObj) {
    const { ctx, page } = await ctxMitRows(seedObj, rowsObj);
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const res = await page.evaluate(() => {
      const b = window._wsHooks.pool().find(x => x.id === 'ws_kl_k1');
      return { da: !!b, sichtbar: b ? !!window._wsHooks.canSee(b) : null };
    });
    await ctx.close();
    return res;
  }

  // Konto NICHT in der Klasse — trotz createdBy=eigenes Konto UND stale
  // nurUserIds MIT dem Konto (genau der gemeldete Login-Wechsel-Fall).
  let s = seed(['role_planer']);
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  let bk = klBucket(['u_test', 'u_fremd']);
  s.gema_ws_pool_v1 = [bk];
  s.gema_schule_klassen_pool_v1 = [{ id: 'k1', name: 'HF-24', studentIds: ['u_fremd'], dozentIds: ['u_doz'] }];
  let r = await sicht(s, rows(bk, { id: 'k1', name: 'HF-24', studentIds: ['u_fremd'], dozentIds: ['u_doz'] }));
  ok('Nicht-Mitglied sieht den Klassen-Eimer NICHT (trotz createdBy + stale nurUserIds)',
    r.da && r.sichtbar === false, r);

  // Mitglied via Klasse — auch wenn die stale nurUserIds das Konto NICHT führt.
  s = seed(['role_student']);
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  bk = klBucket(['u_fremd']);
  s.gema_ws_pool_v1 = [bk];
  s.gema_schule_klassen_pool_v1 = [{ id: 'k1', name: 'HF-24', studentIds: ['u_test'], dozentIds: [] }];
  r = await sicht(s, rows(bk, { id: 'k1', name: 'HF-24', studentIds: ['u_test'], dozentIds: [] }));
  ok('Mitglied sieht den Eimer (Klasse gewinnt über stale nurUserIds)', r.da && r.sichtbar === true, r);

  // Klasse (noch) nicht im Cache → nurUserIds entscheidet (Empty-Read-Regel).
  s = seed(['role_planer']);
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  bk = klBucket(['u_test']);
  s.gema_ws_pool_v1 = [bk];
  r = await sicht(s, rows(bk, null));
  ok('Klasse fehlt im Cache → nurUserIds entscheidet (kein Ausblenden auf Verdacht)', r.da && r.sichtbar === true, r);
}

/* ── F5: Workspace — _wsWann-Altlast ── */
console.log('■ F5: sys_workspace — «gerade eben»-Altlast');
{
  const bx = {
    id: 'ws_x', name: 'Test', type: 'project', ownerType: 'org', ownerOrgId: 'org_test', createdBy: 'u_test',
    accessControl: { orgVisible: true, invitedUsers: [], revokedUsers: [] },
    org: '', members: [], modules: [{ mod: 'sb_druckverlust', status: 'offen' }],
    activity: [
      { who: 'A', text: 'Altlast relativ', when: 'gerade eben' },
      { who: 'B', text: 'Altlast vor', when: 'vor 3 Min.' },
      { who: 'C', text: 'Altlast Datum', when: '01.07.2026' },
      { who: 'D', text: 'Neu mit ts', ts: '2026-08-01T10:00:00.000Z' }
    ],
    beteiligte: [], notes: [], objektId: null, createdAt: new Date().toISOString()
  };
  const s = seed(['role_planer']);
  s.gema_coachmarks_done_sys_workspace_v2 = '1';
  s.gema_ws_pool_v1 = [bx];
  const { ctx, page } = await ctxMitRows(s, { workspace: [{ data_key: 'ws:ws_x', payload: { data: bx } }] });
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window._wsOpen('ws_x'));
  await page.waitForTimeout(400);
  const acts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ws-activity-item')).map(li => li.textContent));
  const a = acts.find(t => /Altlast relativ/.test(t)) || '';
  const b2 = acts.find(t => /Altlast vor/.test(t)) || '';
  const c = acts.find(t => /Altlast Datum/.test(t)) || '';
  const d = acts.find(t => /Neu mit ts/.test(t)) || '';
  ok('«gerade eben»-Altlast zeigt keine Zeit mehr', !!a && !/gerade eben/.test(a), a);
  ok('«vor N Min.»-Altlast unterdrückt', !!b2 && !/vor 3 Min/.test(b2), b2);
  ok('Datums-Altlast bleibt stehen', /01\.07\.2026/.test(c), c);
  ok('ts-Eintrag zeigt Tag + Zeit', /1\.8\.2026.*10:00/.test(d), d);
  await ctx.close();
}

await browser.close();
try { server.close(); } catch (e) {}
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
