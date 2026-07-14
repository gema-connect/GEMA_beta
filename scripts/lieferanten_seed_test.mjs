// End-to-End-Validierung des Lieferanten-Seeds (supabase/gema_lieferanten_seed_v1.sql).
// Lädt die vom Generator erzeugten Records (EINE Quelle) über einen
// PostgREST-Mock in die echte App und prüft:
//  - GemaProdukte: Lieferanten + Produkte kommen an, ALLE nicht_verifiziert,
//    Kategorie-Filter/matchFn funktionieren mit den Seed-Daten
//  - GemaArmaturen: Seed-Armaturen (kvs) im Katalog + getForLieferant-Zuordnung
//  - sys_lieferant_dashboard (Admin-Vorschau ?lief=…): Produkte sichtbar mit
//    «nicht verifiziert»-Status → der Verifizierungs-Test ist durchführbar
// Aufruf: CHROME=<chromium> node scripts/lieferanten_seed_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';
import { records } from './lieferanten_seed_gen.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const ROWS = records();
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// PostgREST-Mock: beantwortet loadCollection-GETs mit den Seed-Rows
// (Registrierung NACH wireRoutes → LIFO, gewinnt vor dem []-Default).
async function mockSeedRows(ctx) {
  await ctx.route(/rest\/v1\/gema_data/, route => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fulfill({ contentType: 'application/json', body: '{}' });
    const u = new URL(req.url());
    const mk = (u.searchParams.get('module_key') || '').replace(/^eq\./, '');
    const dk = u.searchParams.get('data_key') || '';
    let rows = [];
    if (dk.startsWith('like.')) {
      const prefix = dk.slice(5).replace(/\*$/, '');
      rows = ROWS.filter(r => r.module_key === mk && r.data_key.startsWith(prefix));
    } else if (dk.startsWith('eq.')) {
      rows = ROWS.filter(r => r.module_key === mk && r.data_key === dk.slice(3));
    }
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(rows.map(r => ({ data_key: r.data_key, payload: { data: r.data, _lm: 1784030400000 } })))
    });
  });
}

// ═════════════════════════════════════════════════════════════════
console.log('■ Produktkatalog: Seed kommt in der App an (sa_enthaertung)');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await mockSeedRows(ctx);
  await page.goto(BASE + '/sa_enthaertung.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    typeof GemaProdukte !== 'undefined' && GemaProdukte.getAllLieferanten().some(l => l.id === 'lief_seed_bwt'),
    null, { timeout: 15000 });

  const st = await page.evaluate(() => {
    const lief = GemaProdukte.getAllLieferanten();
    // getProdukte verlangt eine Kategorie → über alle Seed-Kategorien sammeln
    const kats = ['enthaertung', 'osmose', 'druckerhoehung', 'zirkulationspumpe', 'saugpumpe',
      'sicherheitsventil', 'frischwasserstation', 'hebeanlage', 'rohrsystem', 'armaturen'];
    const alle = kats.flatMap(k => GemaProdukte.getProdukte(k));
    const seedProd = alle.filter(p => String(p.id).indexOf('prod_seed_') === 0);
    return {
      liefCount: lief.filter(l => String(l.id).indexOf('lief_seed_') === 0).length,
      liefAktiv: lief.filter(l => String(l.id).indexOf('lief_seed_') === 0).every(l => l.status === 'aktiv'),
      seedCount: seedProd.length,
      alleNichtVerifiziert: seedProd.every(p => p.status === 'nicht_verifiziert'),
      enth: GemaProdukte.getProdukte('enthaertung', { nurFreigegeben: true }).map(p => p.daten.modell),
      druck: GemaProdukte.getProdukte('druckerhoehung').length,
      rohr: GemaProdukte.getProdukte('rohrsystem').length,
      svModelle: GemaProdukte.getProdukte('sicherheitsventil').map(p => p.daten.ansprechdruck),
      liefKat: GemaProdukte.getLieferantenByKategorie ? true : false
    };
  });
  ok(st.liefCount === 14, '14 Seed-Lieferanten geladen (' + st.liefCount + ')');
  ok(st.liefAktiv, 'alle Seed-Lieferanten status aktiv');
  ok(st.seedCount === 25, '25 Seed-Produkte geladen (' + st.seedCount + ')');
  ok(st.alleNichtVerifiziert, 'ALLE Seed-Produkte nicht_verifiziert (Verifizierungs-Test möglich)');
  ok(st.enth.includes('Duplex') && st.enth.includes('SD21'), 'Enthärtung: BWT Perla Duplex + Grünbeck softliQ:SD21 als freigegeben gelistet');
  ok(st.druck === 3, 'Druckerhöhung: 3 Produkte (Grundfos/Wilo/KSB)');
  ok(st.rohr === 4, 'Rohrsysteme: 4 Produkte (Optipress/Mapress/Mepla/Sanipex MT)');
  ok(st.svModelle.every(p => p === 6), 'Sicherheitsventile: Ansprechdruck 6.0 bar (Prescor B)');

  // matchFn der Kategorie arbeitet mit den Seed-Daten (Anlagenwahl-Scoring)
  const scores = await page.evaluate(() => {
    const cat = GemaProdukte.KATEGORIEN.enthaertung;
    const bedarf = { durchfluss: 40, kapazitaet: 20 };  // l/min + m³·°fH aus einer Berechnung
    return GemaProdukte.getProdukte('enthaertung').map(p => ({ m: p.daten.modell, s: cat.matchFn(p, bedarf) }));
  });
  const bwt = scores.find(x => x.m === 'Duplex'), gb = scores.find(x => x.m === 'SD21');
  ok(bwt && bwt.s >= 70, 'matchFn: BWT Perla Duplex (53 l/min, 22 m³·°fH) scored ' + (bwt && bwt.s));
  ok(gb && gb.s >= 20, 'matchFn: softliQ SD21 (35 l/min < Bedarf 40 → Teil-Score) scored ' + (gb && gb.s));
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════
console.log('■ Armaturen-Katalog: kvs-Records + Lieferanten-Zuordnung (sb_druckverlust)');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await mockSeedRows(ctx);
  await page.goto(BASE + '/sb_druckverlust.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    typeof GemaArmaturen !== 'undefined' && GemaArmaturen.getAll().some(a => a.id === 'arm_seed_stad'),
    null, { timeout: 15000 });

  const st = await page.evaluate(() => {
    const stad = GemaArmaturen.getById('arm_seed_stad');
    const d06f = GemaArmaturen.getById('arm_seed_d06f');
    const gwf = GemaArmaturen.getById('arm_seed_gwf_q34');
    return {
      stadKvs15: stad && stad.kvs && stad.kvs[15],
      stadStatus: stad && stad.status,
      d06fKvs25: d06f && d06f.kvs && d06f.kvs[25],
      gwfKvs20: gwf && gwf.kvs && gwf.kvs[20],
      imiListe: GemaArmaturen.getForLieferant('lief_seed_imi', 'IMI Hydronic Engineering (Schweiz) AG').map(a => a.id),
      nussbaumListe: GemaArmaturen.getForLieferant('lief_seed_nussbaum', 'R. Nussbaum AG').length,
      // kvs-Rechenweg: Δp = (Q/kvs)²·100 kPa — STAD DN20 voll offen bei 2 m³/h
      dp: GemaArmaturen.getDp('arm_seed_stad', 20, { Q_ls: 2000 / 3600, rho: 1000, v_ms: 1 })
    };
  });
  ok(st.stadKvs15 === 2.56, 'STAD kvs DN15 = 2.56 (aus validierter Ventil-Tabelle)');
  ok(st.stadStatus === 'nicht_verifiziert', 'STAD-Record nicht_verifiziert');
  ok(st.d06fKvs25 === 5.8, 'D06F kvs DN25 = 5.8 (Resideo-Produktseite)');
  ok(st.gwfKvs20 === 5.0, 'GWF Wasserzähler kvs DN20 = 5.0');
  ok(st.imiListe.includes('arm_seed_stad'), 'getForLieferant(imi) liefert den STAD-Record (Dashboard-Tab)');
  ok(st.nussbaumListe >= 4, 'Nussbaum sieht via Firma-Match auch die Default-Armaturen (' + st.nussbaumListe + ')');
  ok(st.dp && Math.abs(st.dp.dp_kPa - Math.pow(2 / 5.39, 2) * 100) < 0.5, 'Δp-Berechnung über kvs plausibel (' + (st.dp && st.dp.dp_kPa && st.dp.dp_kPa.toFixed(2)) + ' kPa)');
  await ctx.close();
}

// ═════════════════════════════════════════════════════════════════
console.log('■ Lieferanten-Dashboard (Admin-Vorschau): Verifizierungs-Test durchführbar');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await mockSeedRows(ctx);
  await page.goto(BASE + '/sys_lieferant_dashboard.html?lief=lief_seed_bwt', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.textContent.indexOf('BWT AQUA AG') >= 0, null, { timeout: 15000 });
  await page.waitForTimeout(1200);

  const st = await page.evaluate(() => ({
    adminBanner: document.body.textContent.indexOf('Admin-Vorschau') >= 0,
    hatPerla: document.body.textContent.indexOf('Perla Duplex') >= 0,
    hatPermaq: document.body.textContent.indexOf('PERMAQ pico') >= 0,
    unverifiziert: document.body.textContent.indexOf('nicht verifiziert') >= 0 || document.body.textContent.indexOf('Nicht verifiziert') >= 0
  }));
  ok(st.adminBanner, 'Admin-Vorschau-Banner sichtbar (?lief=lief_seed_bwt)');
  ok(st.hatPerla && st.hatPermaq, 'BWT-Produkte (Perla Duplex, PERMAQ pico) im Dashboard gelistet');
  ok(st.unverifiziert, '«nicht verifiziert»-Status sichtbar → Verifizierung testbar');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
