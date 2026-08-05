// Schule — «Neue Klasse lässt sich nicht speichern» (Bugreport 04.08.2026)
//
// Ursache: Der Boot-Pull (bindCollection) läuft asynchron; wer die Klasse im
// Boot-Fenster anlegte (Seite öffnen → sofort «＋ Neue Klasse»), verlor sie,
// sobald der ÄLTERE Cloud-Snapshot eintraf und den lokalen Pool überschrieb.
// Ab dann lief JEDE Eingabe im offenen Detail über klasseById(null) still ins
// Leere — Name tippen und Module anhaken sah funktionierend aus (native
// Controls reagieren), gespeichert wurde nichts.
//
// Abgesichert werden BEIDE Schichten des Fixes:
//   1) PreBoot-Journal in gema_schule_api.js (Muster _plPreBoot):
//      Writes im Boot-Fenster überleben den verspäteten Cloud-Snapshot.
//   2) Selbstheilung klAktuell() in ab_klassen.html: verschwindet die
//      geöffnete Klasse aus dem Pool (egal warum), arbeiten die Handler auf
//      dem Schnappschuss weiter und das nächste Speichern legt sie zurück.
//   3) Happy Path: stateful Cloud → Klasse übersteht den Reload.
//
// Aufruf: CHROME=<chromium> node scripts/schule_klasse_persistenz_test.mjs
import { chromium } from 'playwright-core';
import { startServer, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info != null ? ' — ' + JSON.stringify(info) : '')); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

// Basis-Routen wie rolematrix_harness.wireRoutes — aber mit steuerbarem
// Verhalten für die schule-GETs (Delay bzw. stateful Store).
function routen(opts) {
  opts = opts || {};
  return async route => {
    const req = route.request(); const u = req.url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
      if (req.method() === 'POST' && u.indexOf('/gema_data') >= 0 && opts.store) {
        try { JSON.parse(req.postData() || '[]').forEach(r => opts.store.set(r.module_key + '|' + r.data_key, r)); } catch (e) {}
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
      if (req.method() === 'GET' && u.indexOf('/gema_data') >= 0 && u.indexOf('module_key=eq.schule') >= 0) {
        // Der VERSPÄTETE Snapshot einer älteren Cloud (ohne die neue Klasse):
        if (opts.schuleDelayMs) await new Promise(r => setTimeout(r, opts.schuleDelayMs));
        if (opts.store) {
          const like = decodeURIComponent((u.match(/data_key=like\.([^&]+)/) || [])[1] || '').replace(/\*/g, '');
          const rows = [...opts.store.values()].filter(r => r.module_key === 'schule' && (!like || String(r.data_key).indexOf(like) === 0));
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
        }
        return route.fulfill({ contentType: 'application/json', body: '[]' });
      }
      if (req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: '[]' });
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  };
}

async function öffne(routenFn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.route('**/*', routenFn);
  const s = seed(['role_dozent']);
  await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, s);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/ab_klassen.html', { waitUntil: 'domcontentloaded' });
  return { ctx, page, errors };
}
async function klasseAnlegen(page, name) {
  await page.click('#btnNeueKlasse');
  await page.waitForTimeout(250);
  await page.fill('.gema-dlg-input', name);
  await page.click('.gema-dlg-confirm');
  await page.waitForTimeout(400);
}
const poolNamen = p => p.evaluate(() => JSON.parse(localStorage.getItem('gema_schule_klassen_pool_v1') || '[]').map(k => k.name));

try {
  // ═══ 1) Boot-Fenster-Race: Klasse anlegen, BEVOR der Cloud-Pull landet ═══
  console.log('■ 1: Verspäteter Cloud-Snapshot überschreibt die frische Klasse NICHT mehr');
  {
    const { ctx, page, errors } = await öffne(routen({ schuleDelayMs: 3500 }));
    await page.waitForTimeout(900);            // Seite bedienbar, GET noch unterwegs
    await klasseAnlegen(page, 'Kaltwasser HF_GT 2026');
    ok((await poolNamen(page)).length === 1, 'Klasse sofort im Pool (lokal-first)');
    ok(await page.$eval('#klOv', e => e.classList.contains('open')), 'Detail-Dialog offen');
    await page.waitForTimeout(4200);           // jetzt landet der ALTE Snapshot ([])
    const nachher = await poolNamen(page);
    ok(nachher.indexOf('Kaltwasser HF_GT 2026') >= 0,
      'Klasse überlebt den verspäteten Snapshot (PreBoot-Journal)', nachher);
    // …und die Eingaben im offenen Detail greifen weiter:
    ok(!!(await page.$('#modChecks input[data-modkey]')), 'Modul-Checkliste gerendert');
    // NICHT über einen gehaltenen ElementHandle klicken: der Cloud-Pull zeichnet das
    // offene Detail EINMAL neu (renderDetail nach S.bind) — der Selektor muss zum
    // Klick-Zeitpunkt neu aufgelöst werden.
    await page.click('#modChecks input[data-modkey]');
    await page.fill('#klName', 'Kaltwasser HF_GT 2026/27');
    await page.evaluate(() => klStammSave());
    await page.waitForTimeout(350);
    const k1 = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_schule_klassen_pool_v1') || '[]')[0]);
    ok(k1 && k1.name === 'Kaltwasser HF_GT 2026/27', 'Umbenennen greift nach dem Snapshot', k1 && k1.name);
    ok(k1 && (k1.module || []).length === 1, 'Modul-Freischaltung greift nach dem Snapshot', k1 && k1.module);
    // Lernmittel/übrige Pools sind gleich geschützt (API-Ebene):
    const matN = await page.evaluate(() => {
      GemaSchule.saveMaterial({ klasseId: 'kx', titel: 'Skript', link: 'https://example.org' });
      return JSON.parse(localStorage.getItem('gema_schule_mat_pool_v1') || '[]').length;
    });
    ok(matN === 1, 'Journal deckt auch die übrigen Pools (Lernmittel)');
    await page.evaluate(() => klClose());
    await page.waitForTimeout(250);
    ok(await page.$eval('#listWrap', e => /Kaltwasser HF_GT 2026\/27/.test(e.textContent)), 'Liste zeigt die Klasse nach dem Schliessen');
    ok(errors.length === 0, 'keine JS-Fehler (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ═══ 2) Selbstheilung: Pool verschwindet UNTER dem offenen Detail ═══
  console.log('■ 2: Eingaben im offenen Detail gehen NIE mehr still verloren');
  {
    const { ctx, page, errors } = await öffne(routen({}));
    await page.waitForTimeout(1500);           // Boot fertig (kein Delay)
    await klasseAnlegen(page, 'Selbstheilungs-Klasse');
    // Pool von aussen wegwischen (steht für JEDE künftige Ursache):
    await page.evaluate(() => localStorage.setItem('gema_schule_klassen_pool_v1', '[]'));
    ok((await poolNamen(page)).length === 0, 'Pool ist leer (Klasse unter den Füssen weg)');
    const chk = await page.$('#modChecks input[data-modkey]');
    if (chk) await chk.click();
    await page.waitForTimeout(350);
    const heal1 = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_schule_klassen_pool_v1') || '[]')[0]);
    ok(heal1 && heal1.name === 'Selbstheilungs-Klasse' && (heal1.module || []).length === 1,
      'Modul-Klick legt die Klasse zurück in den Pool (klAktuell-Schnappschuss)', heal1);
    await page.evaluate(() => localStorage.setItem('gema_schule_klassen_pool_v1', '[]'));
    await page.fill('#klName', 'Geheilte Klasse');
    await page.evaluate(() => klStammSave());
    await page.waitForTimeout(350);
    const heal2 = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_schule_klassen_pool_v1') || '[]')[0]);
    ok(heal2 && heal2.name === 'Geheilte Klasse' && (heal2.module || []).length === 1,
      'Umbenennen heilt ebenfalls — inkl. vorher angehaktem Modul', heal2);
    ok(errors.length === 0, 'keine JS-Fehler (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ═══ 3) Happy Path: echte (stateful) Cloud → Reload ═══
  console.log('■ 3: Klasse übersteht den Reload (stateful Cloud)');
  {
    const store = new Map();
    const { ctx, page, errors } = await öffne(routen({ store }));
    await page.waitForTimeout(1500);
    await klasseAnlegen(page, 'Reload-Klasse');
    const chk = await page.$('#modChecks input[data-modkey]');
    if (chk) await chk.click();
    await page.waitForTimeout(400);
    ok([...store.keys()].some(k => k.indexOf('schule|sklasse:') === 0), 'Klasse liegt in der Cloud (POST)');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const nach = await page.evaluate(() => GemaSchule.meineKlassen().map(k => ({ n: k.name, m: (k.module || []).length })));
    ok(nach.length === 1 && nach[0].n === 'Reload-Klasse' && nach[0].m === 1,
      'Klasse inkl. freigeschaltetem Modul nach Reload da', nach);
    ok(errors.length === 0, 'keine JS-Fehler (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
