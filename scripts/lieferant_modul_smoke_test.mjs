// Browser-Smoke: der Lieferant startet im Workspace, findet dort sein
// Dashboard als Modul und kommt von dort in die Berechnungen seines
// Sortiments (08/2026).
//
// Ergaenzt scripts/lieferant_modul_test.mjs (Logik ohne Browser) um den
// gerenderten Weg — genau die Kette, die der Umbau versprochen hat:
//   Login → Workspace → Eimer → «＋ Modul» → Lieferanten-Dashboard →
//   Karte «Berechnungen zu meinem Sortiment» → Berechnung oeffnet sich.
//
// Ausfuehren: CHROME=<chromium> node scripts/lieferant_modul_smoke_test.mjs
import { chromium } from 'playwright-core';
import { startServer, seed, newPage, BASE } from './rolematrix_harness.mjs';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } }

// Lieferant fuehrt Enthaertung (als PRODUKT) + Osmose (nur Firmenprofil) —
// deckt beide Freischaltungs-Quellen ab.
const LIEF = {
  id: 'lief_test', firma: 'Testlieferant AG', orgId: 'org_test', status: 'aktiv',
  lieferantKategorien: ['osmose'],
  adresse: { ort: 'Basel' }, abo: { typ: 'basis', status: 'aktiv' }
};
const PROD = {
  id: 'prod_1', lieferantId: 'lief_test', lieferantFirma: 'Testlieferant AG',
  kategorie: 'enthaertung', status: 'nicht_verifiziert',
  daten: { serie: 'AQA perla', modell: 'M' }
};

function liefSeed(mods) {
  const s = seed(['role_lieferant']);
  s.gema_users_v1[0].lieferantId = 'lief_test';
  if (mods) s.gema_lief_mods_v1 = { userId: 'u_test', mods, ts: Date.now() };
  s.gema_pk_lief_pool_v1 = [LIEF];
  s.gema_pk_prod_pool_v1 = [PROD];
  s.gema_pk_oa_pool_v1 = [];
  return s;
}

// KRITISCH: wireRoutes mockt Supabase-GETs auf [] — bindCollection wuerde die
// localStorage-Seeds damit ueberschreiben und die Auto-Provisionierung liefe
// an (leerer Lieferant ohne Sortiment). Diese Route (nach wireRoutes → LIFO)
// liefert die Katalog-Records im echten Row-Format. Muster: arbeitskleider_smoke.
async function wirePkPools(ctx, opts) {
  opts = opts || {};
  const rows = (arr, pf) => arr.map(r => ({ data_key: pf + r.id, payload: { data: r, _lm: 1 } }));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (route.request().method() === 'GET' && u.indexOf('/gema_data') >= 0 && u.indexOf('module_key=eq.produktkatalog') >= 0) {
      let body = [];
      if (u.indexOf('lieferant') >= 0) body = rows(opts.leer ? [] : [LIEF], 'lieferant:');
      else if (u.indexOf('produkt') >= 0) body = rows(opts.leer ? [] : [PROD], 'produkt:');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
}

const server = await startServer();
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {
  // ── 1) Landing: der Lieferant kommt im Workspace an ──
  console.log('── 1: Start im Workspace ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed(['enthaertungsanlage', 'osmose']));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    ok(/sys_workspace\.html/.test(page.url()),
      'index.html leitet den Lieferanten in den Workspace (ist: ' + page.url().split('/').pop() + ')');
    await ctx.close();
  }

  // ── 2) Workspace: Dashboard steht im Modul-Picker ──
  console.log('── 2: Dashboard im Eimer-Picker ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed(['enthaertungsanlage', 'osmose']));
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const katalog = await page.evaluate(() => {
      const h = window._wsModulesHook && window._wsModulesHook();
      if (!h) return null;
      return {
        erlaubt: h.modules.filter(m => h.allowed(m)).map(m => m.id),
        kats: h.cats.map(c => c.id)
      };
    });
    ok(!!katalog, 'Workspace-Katalog erreichbar (_wsModulesHook)');
    ok(katalog && katalog.kats.indexOf('lief') >= 0, 'Kategorie «lief» im Katalog');
    ok(katalog && katalog.erlaubt.indexOf('sys_lieferant_dashboard') >= 0,
      'Dashboard steht dem Lieferanten im Picker zur Verfügung');
    // Die freigeschalteten Berechnungen erscheinen ebenfalls
    ok(katalog && katalog.erlaubt.indexOf('sa_enthaertung') >= 0,
      'freigeschaltete Berechnung sa_enthaertung im Picker');
    ok(katalog && katalog.erlaubt.indexOf('sa_osmose') >= 0,
      'freigeschaltete Berechnung sa_osmose im Picker');
    // Nicht gefuehrtes Sortiment bleibt draussen
    ok(katalog && katalog.erlaubt.indexOf('sb_druckerhoehung') < 0,
      'nicht gefuehrte Anlage (Druckerhöhung) NICHT im Picker');
    ok(katalog && katalog.erlaubt.indexOf('pm_erp') < 0, 'ERP bleibt gesperrt');
    await ctx.close();
  }

  // ── 3) Modulübersicht zeigt genau die richtigen Kacheln ──
  console.log('── 3: Kacheln der Modulübersicht ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed(['enthaertungsanlage', 'osmose']));
    // Redirect umgehen: index ist fuer Nicht-Admins zwar Ziel-Ausnahme, der
    // Rollen-Redirect greift dort nicht — wir landen aber in 1) im Workspace.
    // Darum die Kacheln über can() pruefen, so wie index sie filtert.
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => ({
      dash: GemaAuth.can('read', 'lieferant_dashboard'),
      enth: GemaAuth.can('read', 'enthaertungsanlage'),
      enthW: GemaAuth.can('write', 'enthaertungsanlage'),
      osmo: GemaAuth.can('read', 'osmose'),
      druck: GemaAuth.can('read', 'druckerhoehung'),
      erp: GemaAuth.can('read', 'erp'),
      mods: GemaAuth.getLieferantModule()
    }));
    ok(r.dash, 'Dashboard-Kachel sichtbar');
    ok(r.enth && r.enthW, 'Enthärtung lesbar UND beschreibbar (rechnen + speichern)');
    ok(r.osmo, 'Osmose lesbar');
    ok(!r.druck, 'Druckerhöhung bleibt verborgen');
    ok(!r.erp, 'ERP bleibt verborgen');
    ok(r.mods.sort().join(',') === 'enthaertungsanlage,osmose', 'getLieferantModule() = Sortiment');
    await ctx.close();
  }

  // ── 4) Dashboard-Seite: Karte mit den Berechnungen ──
  console.log('── 4: Karte «Berechnungen zu meinem Sortiment» ──');
  {
    // bewusst OHNE vorbefuellten Cache: die Karte muss ihn aus dem
    // aufgeloesten Profil (Produkt + Firmenkategorie) selbst aufbauen
    const { ctx, page } = await newPage(browser, liefSeed(null));
    await wirePkPools(ctx);
    await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    ok(!/Kein Zugriff/.test(await page.textContent('body')), 'Dashboard öffnet sich (kein Zugriffs-Screen)');
    const bc = await page.textContent('.g-nav-bc .bc-cat').catch(() => null);
    ok(bc && bc.trim() === 'Lieferanten', 'Breadcrumb «Lieferanten» gerendert');
    const karte = await page.$('#meineBerechnungen');
    ok(!!karte, 'Karte #meineBerechnungen im DOM');
    const html = karte ? await karte.innerHTML() : '';
    ok(/sa_enthaertung\.html/.test(html), 'aus dem PRODUKT abgeleitet: Enthärtungs-Berechnung verlinkt');
    ok(/sa_osmose\.html/.test(html), 'aus der FIRMENKATEGORIE abgeleitet: Osmose-Berechnung verlinkt');
    ok(!/sb_druckerhoehung\.html/.test(html), 'Karte zeigt keine fremde Berechnung');
    // Herkunfts-Hinweis: welche Kategorie hat freigeschaltet
    ok(/Enthärtung/i.test(html), 'Karte nennt die auslösende Kategorie');
    // Der Cache ist damit auch fuer die uebrigen Seiten gesetzt
    const mods = await page.evaluate(() => GemaAuth.getLieferantModule().sort());
    ok(mods.join(',') === 'enthaertungsanlage,osmose',
      'Sortiment-Cache aus dem Dashboard gesetzt (ist: ' + mods.join(',') + ')');
    await ctx.close();
  }

  // ── 4b) Empty-Read-Guard: leerer Katalog-Pull leert den Cache NICHT ──
  console.log('── 4b: Empty-Read-Guard ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed(['enthaertungsanlage', 'osmose']));
    await wirePkPools(ctx, { leer: true });   // Cloud antwortet mit []
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);          // Hintergrund-Refresh abwarten
    const mods = await page.evaluate(() => GemaAuth.getLieferantModule().sort());
    ok(mods.join(',') === 'enthaertungsanlage,osmose',
      'leere Cloud-Antwort löscht den Sortiment-Cache nicht (ist: [' + mods.join(',') + '])');
    ok(await page.evaluate(() => GemaAuth.can('read', 'enthaertungsanlage')),
      'Berechnung bleibt trotz leerem Pull erreichbar');
    await ctx.close();
  }

  // ── 5) Der Sprung in die Berechnung funktioniert wirklich ──
  console.log('── 5: Berechnung öffnet sich ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed(['enthaertungsanlage']));
    await page.goto(BASE + '/sa_enthaertung.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const txt = await page.textContent('body');
    ok(!/Kein Zugriff/.test(txt), 'sa_enthaertung öffnet sich für den Lieferanten');
    ok(await page.$('#hr_fh') !== null || /Enthärtung/i.test(txt), 'Berechnungs-Formular ist da');
    await ctx.close();
  }

  // ── 6) Gegenprobe: ohne Sortiment bleibt die Berechnung zu ──
  console.log('── 6: Gegenprobe ohne Sortiment ──');
  {
    const { ctx, page } = await newPage(browser, liefSeed([]));
    await page.goto(BASE + '/sb_druckerhoehung.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const txt = await page.textContent('body');
    ok(/Kein Zugriff/.test(txt), 'nicht gefuehrte Berechnung zeigt «Kein Zugriff»');
    ok(/Sortiment/.test(txt), 'Hinweis erklärt den Sortiment-Bezug');
    ok(/sys_lieferant_dashboard\.html/.test(await page.content()), 'Rückweg führt ins Dashboard');
    await ctx.close();
  }

  // ── 7) Planer sieht die Dashboard-Kachel NICHT ──
  console.log('── 7: Abgrenzung Planer ──');
  {
    const { ctx, page } = await newPage(browser, seed(['role_planer']));
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const h = window._wsModulesHook && window._wsModulesHook();
      return {
        dash: GemaAuth.can('read', 'lieferant_dashboard'),
        imPicker: h ? h.modules.filter(m => h.allowed(m)).map(m => m.id).indexOf('sys_lieferant_dashboard') >= 0 : null
      };
    });
    ok(!r.dash, 'Planer: kein Dashboard-Recht (hätte kein Lieferanten-Profil)');
    ok(r.imPicker === false, 'Planer: Dashboard nicht im Eimer-Picker');
    await ctx.close();
  }

} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? '✗ ' + fail + ' Fehler, ' : '✓ ') + pass + ' Checks bestanden');
process.exit(fail ? 1 : 0);
