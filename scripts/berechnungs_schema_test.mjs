// Playwright-Drift-Guard: Berechnungs-Schemas (07/2026)
//   1) sb_saugpumpe   — Schnittbild + Höhen-Budget (Hb − Hf − NPSH − Hs − Hv = hmax),
//      Defizit-Fall, klickbare Chips
//   2) hz_ausdehnungsgefaess — ein Gefäss / drei Zustände (p0 → Fülldruck → Enddruck),
//      Aufheiz-Slider (Boyle-Interpolation, Range OHNE id), Guard Enddruck ≤ Vordruck
//   3) sb_zirkulation — Netzbaum mit Temperaturfarben, Drosselventile je Strang,
//      massgebender Strang ★, Klick → Tabellenzeile, unverbundene TS
// Ausführen: CHROME=<chromium> node scripts/berechnungs_schema_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ════════ 1) SAUGPUMPE ════════
console.log('■ Saugpumpe: Schnittbild + Höhen-Budget');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_saugpumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window._sgSchemaDraw === 'function' && window._sgLast, null, { timeout: 12000 });
  await page.waitForTimeout(300);

  ok(await page.evaluate(() => !!document.querySelector('#sgSchema svg')), 'SVG gerendert');
  ok(await page.evaluate(() => document.getElementById('sgSchema').innerHTML.indexOf('Höhen-Budget') >= 0), 'Budget-Balken beschriftet');
  ok(await page.evaluate(() => {
    const html = document.getElementById('sgSchema').innerHTML;
    return html.indexOf('hmax = ' + _sgLast.hmax.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m') >= 0;
  }), 'hmax im Massband = Engine-Wert');
  ok(await page.evaluate(() => document.getElementById('sgSchema').innerHTML.indexOf('#16a34a') >= 0), 'Grünes hmax-Segment (positiver Fall)');
  ok(await page.evaluate(() => document.getElementById('sgSchema').innerHTML.indexOf('Hv') >= 0 && document.getElementById('sgSchema').innerHTML.indexOf('Wasserspiegel (0 m)') >= 0), 'Hv-Abzug + Null-Linie vorhanden');
  ok(await page.evaluate(() => (document.getElementById('sgSchemaNote') || {}).textContent.indexOf('verbleiben') >= 0), 'Notiz erklärt das Budget');

  // Standort ändern → Hb im Schema folgt der Anzeige
  await page.evaluate(() => { document.getElementById('sg_h').value = '2000'; sgRecalc(); });
  ok(await page.evaluate(() => {
    const hb = _sgLast.Hb.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return _sgLast.Hb < 9 && document.getElementById('sgSchema').innerHTML.indexOf('Hb — theoretisches Maximum ' + hb + ' m') >= 0;
  }), 'Höhenlage 2000 m → kleineres Hb im Schema');

  // Defizit-Fall: NPSH 12 m frisst das Budget
  await page.evaluate(() => { document.getElementById('sg_h').value = '0'; document.getElementById('sg_npsh').value = '12'; sgRecalc(); });
  ok(await page.evaluate(() => _sgLast.hmax <= 0), 'Engine: hmax negativ');
  ok(await page.evaluate(() => document.getElementById('sgSchema').innerHTML.indexOf('Defizit') >= 0), 'Budget zeigt Defizit-Segment');
  ok(await page.evaluate(() => document.getElementById('sgSchema').innerHTML.indexOf('Saugbetrieb nicht möglich') >= 0), 'Warnung «Saugbetrieb nicht möglich» im Schema');

  // Chip-Klick → Eingabefeld pulsiert
  await page.evaluate(() => { document.getElementById('sg_npsh').value = '4'; sgRecalc(); });
  await page.evaluate(() => document.querySelector('#sgSchema [data-sgziel="sg_t"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('sg_t').classList.contains('sg-puls')), 'Chip-Klick pulsiert das Temperatur-Feld');

  ok(errors.length === 0, 'Saugpumpe: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

// ════════ 2) AUSDEHNUNGSGEFÄSS ════════
console.log('■ Ausdehnungsgefäss: ein Gefäss, drei Zustände + Aufheiz-Slider');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/hz_ausdehnungsgefaess.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window._heSchemaDraw === 'function' && window._heLast && _heLast.vn > 0, null, { timeout: 12000 });
  await page.waitForTimeout(300);

  ok(await page.evaluate(() => !!document.querySelector('#heSchema svg')), 'SVG gerendert (Demo-Daten: SU 600.3)');
  ok(await page.evaluate(() => {
    const html = document.getElementById('heSchema').innerHTML;
    return html.indexOf('① Vordruck') >= 0 && html.indexOf('② Gefüllt') >= 0 && html.indexOf('③ Betrieb') >= 0;
  }), 'Drei Zustände beschriftet');
  ok(await page.evaluate(() => (document.getElementById('heSchema').innerHTML.match(/rx="34"/g) || []).length >= 3), 'Drei Gefäss-Kapseln gezeichnet');
  ok(await page.evaluate(() => {
    const f = _heLast.pfill.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return document.getElementById('heSchema').innerHTML.indexOf('Fülldruck = ' + f + ' barü') >= 0;
  }), 'Fülldruck-Chip = Engine-Wert');
  ok(await page.evaluate(() => document.getElementById('heSchema').innerHTML.indexOf('Gefäss: ' + _heLast.typ) >= 0), 'Gefässtyp-Chip (' + await page.evaluate(() => _heLast.typ) + ')');
  ok(await page.evaluate(() => document.getElementById('heSchema').innerHTML.indexOf('hst') >= 0 && document.getElementById('heSchema').innerHTML.indexOf('Gas (N₂)') >= 0), 'hst-Massband + Gaspolster beschriftet');

  // Slider (Range bewusst OHNE id — AutoSave-Regel)
  ok(await page.evaluate(() => {
    const r = document.querySelector('#heSchemaSim input[type="range"]');
    return !!r && !r.id;
  }), 'Aufheiz-Slider vorhanden und OHNE id');
  const pKalt = await page.evaluate(() => { _heSimSet(0); return document.getElementById('he_v3_ptxt').textContent; });
  ok(pKalt.indexOf(await page.evaluate(() => _heLast.pfill.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))) >= 0, 'Slider 0 % → Druck = Fülldruck (' + pKalt + ')');
  ok(await page.evaluate(() => {
    const geo = window._heSimGeo;
    const h = parseFloat(document.getElementById('he_v3_water').getAttribute('height'));
    return Math.abs(h - geo.f2 * 186) < 1;
  }), 'Slider 0 % → Wasserzone = VWr-Anteil');
  const pMid = await page.evaluate(() => { _heSimSet(50); return parseFloat(document.getElementById('he_sim_out').textContent.replace(/’|'/g, '')); });
  ok(await page.evaluate((pm) => pm > _heLast.pfill && pm < _heLast.pfin, pMid), 'Slider 50 % → Druck zwischen Fülldruck und pfin (' + pMid + ' barü)');
  const pWarm = await page.evaluate(() => { _heSimSet(100); return document.getElementById('he_v3_ptxt').textContent; });
  ok(pWarm.indexOf('Enddruck ≤') >= 0 && pWarm.indexOf(await page.evaluate(() => _heLast.pfin.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))) >= 0, 'Slider 100 % → Enddruck ≤ pfin (' + pWarm + ')');

  // Guard: Anlagehöhe zu gross → Enddruck ≤ Vordruck → Schema zeigt Warnhinweis statt Gefässen
  await page.evaluate(() => { document.getElementById('he_hst').value = '40'; heRecalc(); });
  ok(await page.evaluate(() => !_heLast.druckOk && !document.querySelector('#heSchema svg') && document.getElementById('heSchema').textContent.indexOf('Enddruck pfin ≤ Vordruck') >= 0), 'Guard: pfin ≤ p0 → Warnhinweis statt Schema');
  await page.evaluate(() => { document.getElementById('he_hst').value = '14'; heRecalc(); });

  // Chip-Klick
  await page.evaluate(() => document.querySelector('#heSchema [data-heziel="he_psv"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('he_psv').classList.contains('he-puls')), 'Chip-Klick pulsiert das pSV-Feld');

  ok(errors.length === 0, 'MAG: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

// ════════ 3) ZIRKULATION ════════
console.log('■ Zirkulation: Netzbaum mit Temperaturverlauf');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_zirkulation.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window._zkSchemaDraw === 'function' && typeof zkRecalc === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(300);

  ok(await page.evaluate(() => document.getElementById('zkSchema').textContent.indexOf('Netzschema folgt') >= 0), 'Ohne Teilstrecken: Platzhalter');

  // Netz seeden: TS1 → (TS2 | TS3 → TS4)  ⇒ 2 Stränge (A: TS2, B: TS4)
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    set('zk_heff', 250); set('zk_kvs', 1.6);
    zkRows.length = 0;
    const mk = (nr, len, e, f) => ({ nr, len: String(len), e: e ? String(e) : '', f: f ? String(f) : '', art: 'kon', ort: 'raeume', ovl: 35, dn: 15, mat: 'PE-X', dvl: '', drl: '', drar: '' });
    zkRows.push(mk(1, 10, 2, 3), mk(2, 8), mk(3, 6, 4), mk(4, 5));
    zkRenderTable(); zkRecalc();
  });
  await page.waitForTimeout(200);

  ok(await page.evaluate(() => !!document.querySelector('#zkSchema svg')), 'SVG gerendert');
  ok(await page.evaluate(() => _zkLast.straenge.length === 2 && _zkLast.reqHead > 0), 'Engine: 2 Stränge, Förderhöhe > 0');
  ok(await page.evaluate(() => {
    const html = document.getElementById('zkSchema').innerHTML;
    return html.indexOf('TS 1 · DN 15') >= 0 && html.indexOf('TS 4 · DN 15') >= 0;
  }), 'TS-Labels mit DN');
  ok(await page.evaluate(() => (document.getElementById('zkSchema').innerHTML.match(/M0 -7 L12 0/g) || []).length === 2), 'Zwei Drosselventil-Symbole (je End-TS)');
  ok(await page.evaluate(() => {
    const html = document.getElementById('zkSchema').innerHTML;
    return html.indexOf('Strang A') >= 0 && html.indexOf('Strang B') >= 0 && html.indexOf('massgebend: Strang') >= 0;
  }), 'Strang-Chips + massgebender Strang ★');
  ok(await page.evaluate(() => {
    const cols = {};
    (document.getElementById('zkSchema').innerHTML.match(/stroke="rgb\([^)]+\)"/g) || []).forEach(c => { cols[c] = 1; });
    return Object.keys(cols).length >= 2;
  }), 'Temperaturfarben: mindestens 2 verschiedene Leitungsfarben');
  ok(await page.evaluate(() => {
    const html = document.getElementById('zkSchema').innerHTML;
    return html.indexOf('WW-') >= 0 && html.indexOf('Zirk.-Pumpe') >= 0 && html.indexOf('zkGradLeg') >= 0;
  }), 'Erwärmer, Pumpe + Farb-Legende');
  ok(await page.evaluate(() => {
    const kv = _zkLast.straenge[0].kv;
    return kv != null && document.getElementById('zkSchema').innerHTML.indexOf('KV ' + kv.toLocaleString('de-CH', { maximumFractionDigits: 0 })) >= 0;
  }), 'Drossel-KV im Strang-Chip = Engine-Wert');

  // Klick auf TS-Label → Tabellenzeile pulsiert
  await page.evaluate(() => document.querySelector('#zkSchema [data-zkziel="ts|2"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.querySelector('#zkBody tr[data-i="1"]').classList.contains('zk-puls-row')), 'Klick auf TS-Label pulsiert die Tabellenzeile');

  // Unverbundene TS wird gemeldet
  await page.evaluate(() => {
    zkRows.push({ nr: 5, len: '4', e: '', f: '', art: 'kon', ort: 'raeume', ovl: 35, dn: 15, mat: 'PE-X', dvl: '', drl: '', drar: '' });
    zkRenderTable(); zkRecalc();
  });
  ok(await page.evaluate(() => (document.getElementById('zkSchemaNote') || {}).textContent.indexOf('TS 5') >= 0), 'Unverbundene TS 5 im Hinweis gemeldet');

  ok(errors.length === 0, 'Zirkulation: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
