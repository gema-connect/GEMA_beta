#!/usr/bin/env node
/* Drift-Guard — Feedback 05.09.2026, Modul sb_warmwasser (29 Punkte).
 *
 * Etappe 1 — Tab ④ Speicher & Leistung:
 *   #8  Verlustfaktor nur 2 Nachkommastellen · fsto-Bauarten neu benannt
 *       (WE mit innenliegendem Register 1.25 · WE mit externem Tauscher 1.1 ·
 *        WE mit externem Tauscher ohne Misch- und Kaltzone 1.0)
 *   #3  Misch-/Reserve-Prozent im Speicherschema muss zum gewaehlten fsto passen
 *
 * Ausfuehren:  CHROME=<chromium> node scripts/feedback_20260905_warmwasser_test.mjs
 */
import { readFileSync } from 'node:fs';
import { startServer, seed, newPage, ROOT, BASE } from './rolematrix_harness.mjs';

let ok_ = 0, bad = 0;
function ok(cond, name, extra) {
  if (cond) { ok_++; console.log('  ok   ' + name); }
  else { bad++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function sec(t) { console.log('\n── ' + t); }

const WW = readFileSync(ROOT + '/sb_warmwasser.html', 'utf8');

// ─────────────────────────────────────────────────────────────── statisch
sec('A · Markup & Quelltext');

// #8 — die drei Bauarten mit den vom Kunden vorgegebenen Faktoren
ok(/data-fsto="1\.25"[^>]*data-bauart="register_innen"/.test(WW),
  '#8: Kachel 1 = register_innen mit fsto 1.25');
ok(/data-fsto="1\.1"[^>]*data-bauart="tauscher_extern"/.test(WW),
  '#8: Kachel 2 = tauscher_extern mit fsto 1.1');
ok(/data-fsto="1"[^>]*data-bauart="tauscher_extern_ohne"/.test(WW),
  '#8: Kachel 3 = tauscher_extern_ohne mit fsto 1.0');
ok(WW.includes('WE mit innenliegendem Register'),  '#8: Beschriftung «WE mit innenliegendem Register»');
ok(WW.includes('WE mit externem Tauscher</div>')
   || /WE mit externem Tauscher<\/div>/.test(WW),  '#8: Beschriftung «WE mit externem Tauscher»');
ok(WW.includes('WE mit externem Tauscher ohne Misch- und Kaltzone'),
  '#8: Beschriftung «WE mit externem Tauscher ohne Misch- und Kaltzone»');
ok(!/data-fsto="1\.5"/.test(WW), '#8: keine 1.5-Kachel mehr (alte Bauart «Liegend» abgeloest)');

// #8 — der Default-Merker zeigt auf eine EXISTIERENDE Bauart
{
  const m = WW.match(/id="ww_fsto_bauart"[^>]*value="([^"]*)"/);
  ok(!!m && WW.includes('data-bauart="' + (m ? m[1] : '') + '"'),
    '#8: hidden ww_fsto_bauart-Default entspricht einer Kachel', m ? m[1] : null);
}

// #8 — Verlustfaktor auf 2 Nachkommastellen (Rundung + beide Vorschau-Chips)
ok(/Math\.round\(v\*100\)\/100/.test(WW),                '#8: wwVfSet rundet auf 2 Nachkommastellen');
ok(!/Math\.round\(v\*1000\)\/1000/.test(WW),             '#8: keine 3-Stellen-Rundung mehr');
ok(/setTxt\('ww_vfGrob'[^)]*wwFmt\(1\+res\.vz\/100,2\)/.test(WW),   '#8: Chip Grobauslegung mit 2 NK');
ok(/setTxt\('ww_vfFein'[^)]*wwFmt\(1\+res\.vzFein\/100,2\)/.test(WW), '#8: Chip Feinplanung mit 2 NK');

// #3 — Schema kennt den fsto und rechnet die Misch-Zone gegen die Bereitschaft
ok(/fsto:wwNum\('ww_fsto'\)/.test(WW),        '#3: fsto wandert in den _wwSpSchemaDraw-Payload');
ok(/pctBasis:d\.vcont/.test(WW),              '#3: Misch-Zone traegt pctBasis = Bereitschaftsvolumen');
ok(/m\.pctBasis>0\)\?m\.pctBasis:Z\.vtot/.test(WW),
  '#3: Render-Loop nimmt pctBasis, faellt sonst auf das Total zurueck');
ok(/sub:'fsto-Zuschlag '/.test(WW),           '#3: Unterzeile behaelt den Begriff «fsto-Zuschlag»');
ok(/l Bereitschaft'/.test(WW),                '#3: Unterzeile nennt die Bezugsgroesse');

// nur literale Hex-Farben in den neuen Kacheln (GemaPDF-Regel)
{
  const blk = WW.slice(WW.indexOf('id="wwFstoTiles"'), WW.indexOf('id="wwFstoTiles"') + 6000);
  ok(!/var\(--/.test(blk.slice(0, blk.indexOf('</div>\n        </div>') + 40) || blk),
    'Kachel-SVG ohne var()-Farben (literale Hex)');
}

// ─────────────────────────────────────────────────────────────── Browser
sec('B · Browser');
const srv = await startServer();
let browser = null;
try {
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  const { page } = await newPage(browser, seed(['role_planer']));
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/sb_warmwasser.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof wwRecalc === 'function' && typeof window._wwSpSchemaDraw === 'function',
    null, { timeout: 12000 });

  // Bedarf seeden (50 P Mehrfamilienhaus) — ohne Bedarf zeichnet Tab ④ nur den Hinweis
  await page.evaluate(() => { wwState.fein.push({ ne: 3, n: '50', profil: 'wohnbau' }); wwRenderTables(); wwRecalc(); });
  await page.evaluate(() => { const e = document.querySelector('[data-tab="wt4"]'); if (e) e.click(); });
  await page.waitForTimeout(400);

  // #8 — drei Kacheln, korrekte Faktoren, Klick setzt Wert UND Merker
  const tiles = await page.$$eval('#wwFstoTiles .ww-fsto-tile',
    els => els.map(e => ({ f: e.dataset.fsto, b: e.dataset.bauart, t: (e.querySelector('.t') || {}).textContent })));
  ok(tiles.length === 3, '#8: genau drei Bauart-Kacheln', tiles.length);
  ok(tiles.map(t => t.f).join('|') === '1.25|1.1|1', '#8: Faktoren 1.25 / 1.1 / 1.0', tiles.map(t => t.f));

  await page.evaluate(() => { const e = document.querySelector('[data-bauart="tauscher_extern"]'); if (e) e.click(); });
  await page.waitForTimeout(300);
  const nach = await page.evaluate(() => ({
    v: document.getElementById('ww_fsto').value,
    b: document.getElementById('ww_fsto_bauart').value,
    akt: [...document.querySelectorAll('#wwFstoTiles .ww-fsto-tile.active')].map(e => e.dataset.bauart)
  }));
  ok(nach.v === '1.1',                    '#8: Klick setzt fsto 1.1', nach.v);
  ok(nach.b === 'tauscher_extern',        '#8: Klick setzt den Bauart-Merker', nach.b);
  ok(nach.akt.join() === 'tauscher_extern', '#8: genau die geklickte Kachel ist aktiv', nach.akt);

  // Bestandsschutz: ein Alt-Wert 1.5 bleibt stehen und markiert KEINE Kachel
  await page.evaluate(() => {
    const f = document.getElementById('ww_fsto'), b = document.getElementById('ww_fsto_bauart');
    b.value = ''; f.value = '1.5';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const alt = await page.evaluate(() => ({
    v: document.getElementById('ww_fsto').value,
    n: document.querySelectorAll('#wwFstoTiles .ww-fsto-tile.active').length
  }));
  ok(alt.v === '1.5', '#8 Bestandsschutz: Alt-Wert 1.5 bleibt erhalten', alt.v);
  ok(alt.n === 0,     '#8 Bestandsschutz: Alt-Wert markiert keine Kachel', alt.n);

  // #3 — Misch-Prozent = fsto-Zuschlag auf die Bereitschaft
  await page.evaluate(() => { const e = document.querySelector('[data-bauart="register_innen"]'); if (e) e.click(); });
  await page.waitForTimeout(300);
  const schema = await page.evaluate(() => {
    const svg = document.querySelector('#wwSpSchemaWrap svg');
    const t = svg ? [...svg.querySelectorAll('text')].map(e => e.textContent) : [];
    return { txt: t.join(' § ') };
  });
  const mPct = schema.txt.match(/Liter · \+(\d+) %/);
  ok(!!mPct && Number(mPct[1]) === 25,
    '#3: Misch-Zone zeigt «+25 %» (fsto 1.25 auf die Bereitschaft)', mPct ? mPct[1] : schema.txt.slice(0, 300));
  ok(/fsto-Zuschlag 1\.25 auf .* l Bereitschaft/.test(schema.txt),
    '#3: Unterzeile nennt Faktor und Bezugsgroesse', schema.txt.match(/fsto-Zuschlag[^§]*/) || null);
  // die Zonen IM Behaelter bleiben auf das Total bezogen (Summe 100 %)
  ok(!/Liter · \+\d+ %.*Liter · \+\d+ %/.test(schema.txt),
    '#3: nur die Misch-Zone traegt das «+» (Spitze/Steuer bleiben auf das Total bezogen)');

  ok(errs.length === 0, 'Keine JS-Fehler auf der Seite', errs.slice(0, 3));
} finally {
  if (browser) await browser.close();
  srv.close();
}

console.log('\n' + ok_ + ' ok, ' + bad + ' fehlgeschlagen');
process.exit(bad ? 1 : 0);
