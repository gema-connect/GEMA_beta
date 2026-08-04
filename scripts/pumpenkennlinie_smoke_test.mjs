// Pumpenkennlinie — Playwright-Smoke des kompletten Wegs:
//   Lieferanten-Dashboard «📈 Prüfbericht» → echte WILLY1003CS.xlsx hochladen
//   → Vorschau (Kopfdaten + Diagramm) → als NEUES Produkt (Entwurf) anlegen
//   → Kennlinie im Produkt-Editor (Karte + Entfernen) → an BESTEHENDES
//   Produkt anhängen (nur leere Felder ergänzt) → createProdukt-Objekt-
//   Signatur (CSV-Import-Regression) → Anlagenwahl: Pumpendiagramm in der
//   «Gewählte Anlage»-Box eines Berechnungsmoduls (sb_zirkulation) mit
//   lazy nachgeladenem Helper.
// Aufruf: CHROME=<chromium> node scripts/pumpenkennlinie_smoke_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';
import { startServer, seed, newPage, BASE } from './rolematrix_harness.mjs';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
const FIX = path.join(ROOT, 'scripts', 'fixtures', 'WILLY1003CS_pruefbericht.xlsx');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info != null ? ' — ' + JSON.stringify(info) : '')); } };

const LIEF = {
  id: 'lief_test', firma: 'Testlieferant AG', orgId: 'org_test', status: 'aktiv',
  lieferantKategorien: ['zirkulationspumpe'],
  adresse: { ort: 'Basel' }, abo: { typ: 'basis', status: 'aktiv' }
};
// Bestehendes Produkt für den Anhängen-Fall: foerderhoeheMax ist ERFASST
// (999) und darf beim Import NICHT überschrieben werden.
const PROD = {
  id: 'prod_zp', lieferantId: 'lief_test', lieferantFirma: 'Testlieferant AG',
  kategorie: 'zirkulationspumpe', status: 'nicht_verifiziert',
  daten: { serie: 'Alpha ZP', foerderhoeheMax: '999' }, dokumente: [], log: []
};

function liefSeed() {
  const s = seed(['role_lieferant']);
  s.gema_users_v1[0].lieferantId = 'lief_test';
  s.gema_pk_lief_pool_v1 = [LIEF];
  s.gema_pk_prod_pool_v1 = [PROD];
  s.gema_pk_oa_pool_v1 = [];
  // Coachmarks-Tour stilllegen — ihr Backdrop fängt sonst alle Klicks ab
  s.gema_coachmarks_done_lieferant_dashboard_v1 = '1';
  return s;
}
// wireRoutes mockt Supabase-GETs auf [] — diese LIFO-Route liefert die
// Katalog-Pools im echten Row-Format, sonst überschriebe bindCollection die
// localStorage-Seeds (Muster lieferant_modul_smoke_test).
async function wirePkPools(ctx) {
  const rows = (arr, pf) => arr.map(r => ({ data_key: pf + r.id, payload: { data: r, _lm: 1 } }));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (route.request().method() === 'GET' && u.indexOf('/gema_data') >= 0 && u.indexOf('module_key=eq.produktkatalog') >= 0) {
      let body = [];
      if (u.indexOf('lieferant') >= 0) body = rows([LIEF], 'lieferant:');
      else if (u.indexOf('produkt') >= 0) body = rows([PROD], 'produkt:');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

try {
  // ═══ 1) Dashboard: Prüfbericht-Import End-to-End ═══
  console.log('■ Dashboard: Prüfbericht hochladen + Vorschau');
  const { ctx, page } = await newPage(browser, liefSeed());
  await wirePkPools(ctx);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.evaluate(() => switchToTab('produkte'));
  ok(await page.$eval('#btnKennImport', b => getComputedStyle(b).display !== 'none'), '«📈 Prüfbericht»-Button im Produkte-Tab');
  await page.click('#btnKennImport');
  await page.waitForTimeout(200);
  ok(await page.$('#kennImportOv') !== null, 'Import-Dialog offen');
  await page.setInputFiles('#kennImpFile', FIX);
  await page.waitForTimeout(900);
  const rep = await page.$eval('#kennImpReport', e => e.textContent);
  ok(/WILLY1003CS/.test(rep), 'Vorschau nennt den Pumpentyp', rep.slice(0, 120));
  ok(/12 Messpunkte/.test(rep), 'Vorschau nennt 12 Messpunkte');
  ok(/2850/.test(rep) && /ISO 9906/.test(rep), 'Vorschau: Drehzahl + Norm');
  ok(await page.$('#kennImpDia svg') !== null, 'Diagramm-Vorschau (SVG) gezeichnet');
  ok(await page.$eval('#kennImpZielWrap', e => getComputedStyle(e).display !== 'none'), 'Ziel/Kategorie-Wahl sichtbar');
  const katSel = await page.$eval('#kennImpKat', s => ({ val: s.value, first: s.options[0].textContent, n: s.options.length, disabled: s.disabled }));
  ok(katSel.val === 'zirkulationspumpe' && /✓/.test(katSel.first), 'Eigene Kategorie (Firmenprofil) steht zuoberst mit ✓', katSel);
  ok(katSel.n >= 4 && !katSel.disabled, 'alle Pumpen-Kategorien wählbar', katSel.n);
  const map1 = await page.$eval('#kennImpMap', e => e.textContent);
  ok(/Kennlinie/.test(map1) && /1'?030|1030/.test(map1) && /11'?000|11000/.test(map1), 'Übernommene Werte: mbar/l/h umgerechnet', map1.slice(0, 200));

  console.log('■ Import als NEUES Produkt (Entwurf)');
  await page.click('#kennImpBtn');
  await page.waitForTimeout(500);
  const neu = await page.evaluate(() => {
    const list = getMyProdukte('zirkulationspumpe', null).filter(p => p.id !== 'prod_zp');
    const p = list[0] || null;
    return p ? { n: list.length, id: p.id, st: p.status, lf: p.lieferantFirma, d: p.daten } : null;
  });
  ok(neu && neu.n === 1 && neu.st === 'entwurf', 'genau 1 neues Produkt als Entwurf', neu);
  ok(neu && neu.lf === 'Testlieferant AG', 'Lieferant über Objekt-Signatur aufgelöst', neu && neu.lf);
  ok(neu && neu.d.serie === 'WILLY1003CS', 'Serie/Typ aus dem Prüfbericht', neu && neu.d.serie);
  ok(neu && neu.d.foerderhoeheMax === 1030 && neu.d.volumenstromMax === 11000 && neu.d.leistungMax === 750,
    'Schema-Werte umgerechnet (1030 mbar / 11000 l/h / 750 W)', neu && neu.d);
  ok(neu && neu.d.kennlinie && neu.d.kennlinie.punkte.length === 12 && neu.d.kennlinie.drehzahl === 2850,
    'Kennlinie am Produkt (12 Punkte, n 2850)');
  ok(await page.$eval('#prodList', e => /📈 Kennlinie/.test(e.textContent)), 'Produktliste zeigt 📈-Kennlinie-Badge');

  console.log('■ Produkt-Editor: Kennlinien-Karte + Überleben von saveProd');
  await page.evaluate(id => openProdEditor(id), neu.id);
  await page.waitForTimeout(300);
  ok(await page.$('#peKennlinie svg') !== null, 'Kennlinien-Karte mit Diagramm im Editor');
  ok(await page.$eval('#peKennlinie', e => /Prüfbericht 2023-11-29/.test(e.textContent) && /12 Messpunkte/.test(e.textContent)),
    'Karte nennt Prüfdatum + Punktzahl');
  ok(await page.$eval('#peKennlinie', e => /Kennlinie entfernen/.test(e.textContent)), 'Entfernen-Button vorhanden');
  await page.evaluate(() => saveProd());
  await page.waitForTimeout(250);
  const nachSave = await page.evaluate(id => (GemaProdukte.getProdukt(id).daten.kennlinie || {}).punkte?.length || 0, neu.id);
  ok(nachSave === 12, 'Kennlinie überlebt saveProd (kein Schema-Feld, Merge)', nachSave);

  console.log('■ Kennlinie entfernen (GemaDialog danger)');
  await page.evaluate(() => _peKennlinieEntfernen());
  await page.waitForTimeout(250);
  await page.click('.gema-dlg-danger');
  await page.waitForTimeout(300);
  const entfernt = await page.evaluate(id => !GemaProdukte.getProdukt(id).daten.kennlinie, neu.id);
  ok(entfernt, 'Kennlinie entfernt (daten.kennlinie leer)');
  ok(await page.$('#peKennlinie svg') === null, 'Karte verschwindet nach dem Entfernen');
  await page.evaluate(() => closeProdEditor());

  console.log('■ An BESTEHENDES Produkt anhängen — nur leere Felder');
  await page.evaluate(() => _liefKennImportOpen());
  await page.setInputFiles('#kennImpFile', FIX);
  await page.waitForTimeout(900);
  await page.selectOption('#kennImpZiel', 'prod_zp');
  await page.evaluate(() => _liefKennZielChanged());
  const katNachZiel = await page.$eval('#kennImpKat', s => ({ val: s.value, disabled: s.disabled }));
  ok(katNachZiel.val === 'zirkulationspumpe' && katNachZiel.disabled === true,
    'Anlagentyp folgt dem Produkt und ist gesperrt', katNachZiel);
  ok(await page.$eval('#kennImpMap', e => /leere Felder/.test(e.textContent)), 'Hinweis «nur leere Felder» beim Anhängen');
  await page.click('#kennImpBtn');
  await page.waitForTimeout(400);
  const zp = await page.evaluate(() => { const p = GemaProdukte.getProdukt('prod_zp'); return { d: p.daten, st: p.status }; });
  ok(zp.d.kennlinie && zp.d.kennlinie.punkte.length === 12, 'Kennlinie am bestehenden Produkt');
  ok(String(zp.d.foerderhoeheMax) === '999', 'ERFASSTER Wert (999 mbar) bleibt unangetastet', zp.d.foerderhoeheMax);
  ok(zp.d.volumenstromMax === 11000 && zp.d.leistungMax === 750, 'leere Felder wurden ergänzt', zp.d);
  ok(zp.d.serie === 'Alpha ZP', 'Serie bleibt die erfasste', zp.d.serie);

  console.log('■ createProdukt-Objekt-Signatur (CSV-Import-Regression)');
  const csv = await page.evaluate(() => {
    const p = GemaProdukte.createProdukt({ lieferantId: 'lief_test', kategorie: 'zirkulationspumpe', daten: { serie: 'CsvTest' }, status: 'entwurf' });
    return { kat: p.kategorie, lf: p.lieferantFirma, st: p.status, serie: (p.daten || {}).serie };
  });
  ok(csv.kat === 'zirkulationspumpe' && typeof csv.kat === 'string', 'kategorie ist ein String (nicht das Options-Objekt)', csv);
  ok(csv.lf === 'Testlieferant AG' && csv.st === 'entwurf' && csv.serie === 'CsvTest', 'Lieferant/Status/Daten korrekt', csv);

  ok(errors.length === 0, 'keine JS-Fehler im Dashboard (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();

  // ═══ 2) Anlagenwahl: Pumpendiagramm in der «Gewählte Anlage»-Box ═══
  console.log('■ Anlagenwahl (sb_zirkulation): Diagramm + Lazy-Load');
  {
    const KL = {
      quelle: 'pruefbericht', typ: 'WILLY1003CS', datum: '2023-11-29', norm: 'ISO 9906 Sect.4.4.2',
      drehzahl: 2850, tol: { q: 10, h: 8, eta: 16.6 }, qmax: 11, qmin: 0,
      punkte: [{ q: 0, h: 10.5, p1: 0.4, eta: 0 }, { q: 1.4, h: 10, p1: 0.42, eta: 18.2 },
        { q: 3.1, h: 9, p1: 0.47, eta: 29.4 }, { q: 5.5, h: 7, p1: 0.55, eta: 36.6 },
        { q: 7.6, h: 5, p1: 0.63, eta: 32.8 }, { q: 9.3, h: 3, p1: 0.69, eta: 22 },
        { q: 11, h: 0.5, p1: 0.74, eta: 4 }]
    };
    const s = seed(['role_planer']);
    s.gema_aw_chosen_zirkulationspumpe = {
      id: 'prod_kl', lieferantFirma: 'BIRAL', serie: 'WILLY1003CS', modell: '', status: 'verifiziert',
      daten: { volumenstromMax: 11000, foerderhoeheMax: 1030, kennlinie: KL },
      uebernommenAm: '2026-08-01T08:00:00.000Z'
    };
    const { ctx: c2, page: p2 } = await newPage(browser, s);
    const err2 = [];
    p2.on('pageerror', e => err2.push(e.message));
    await p2.goto(BASE + '/sb_zirkulation.html', { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(1800);
    ok(await p2.$('.pk-confirm') !== null, 'Gewählte-Anlage-Box gerendert');
    ok(await p2.$eval('.pk-confirm', e => /📈 Pumpendiagramm/.test(e.textContent) && /2023-11-29/.test(e.textContent)),
      'Diagramm-Titel mit Prüfdatum in der Box');
    await p2.waitForTimeout(600); // Lazy-Load des Helpers
    ok(await p2.$('.pk-confirm .gaw-kenndia svg') !== null, 'Pumpendiagramm (SVG) via lazy geladenem Helper gezeichnet');
    ok(await p2.evaluate(() => typeof GemaPumpenkennlinie !== 'undefined'), 'gema_pumpenkennlinie.js wurde nachgeladen');
    const svgHtml = await p2.$eval('.pk-confirm .gaw-kenndia', e => e.innerHTML);
    ok(!/var\(--/.test(svgHtml), 'nur literale Farben (GemaPDF-Regel)');
    ok(/Q max/.test(svgHtml) && /P1 \[kW\]/.test(svgHtml), 'Einsatzgrenze + P1-Panel im Diagramm');
    ok(err2.length === 0, 'keine JS-Fehler in sb_zirkulation (' + err2.slice(0, 2).join(' | ') + ')');
    await c2.close();
  }
} finally {
  await browser.close(); server.close();
}
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
