// Playwright-Smoke: hz_waermepumpe.html — Boot, Rechenkette, Sichtbarkeiten, Anlagenwahl-Payload
// Ausführen: CHROME=<chromium> node scripts/waermepumpe_smoke_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Szenario A: Luft-WP einstufig, MFH Zürich, H+WW, el. Notheizung, Speicher, El-Einsatz im Speicher
async function fillA(page) {
  await page.evaluate(() => {
    const s = (id, v) => { const el = document.getElementById(id); el.value = v; };
    const st = WPE_STATIONEN.findIndex(x => x.name === 'Zürich SMA');
    s('wpe_station', String(st)); s('wpe_kat', '0');
    s('wpe_ebf', '368.4'); s('wpe_qh', '26.4'); s('wpe_qt', '39'); s('wpe_qv', '20.6');
    s('wpe_vv', '0'); s('wpe_sperr', '2'); s('wpe_wwv', '5');
    s('wpe_art', '2'); s('wpe_einsatz', '4'); s('wpe_bw', '3');
    s('wpe_l_q35_0', '4.34'); s('wpe_l_q35_1', '5.41'); s('wpe_l_q35_2', '3.91'); s('wpe_l_q35_3', '3.35'); s('wpe_l_q35_4', '2.68');
    s('wpe_l_c35_0', '2.5'); s('wpe_l_c35_1', '3.08'); s('wpe_l_c35_2', '3.79'); s('wpe_l_c35_3', '4.88'); s('wpe_l_c35_4', '6.81');
    s('wpe_l_q55_0', '4.67'); s('wpe_l_q55_1', '2.75'); s('wpe_l_q55_2', '2.25');
    s('wpe_l_c55_0', '2.06'); s('wpe_l_c55_1', '2.78'); s('wpe_l_c55_2', '3.49');
    s('wpe_ti', '20'); s('wpe_tvl', '35'); s('wpe_trl', '28');
    s('wpe_speicher', '3'); s('wpe_ladung', '3'); s('wpe_tww', '55');
    s('wpe_wwz', '2'); s('wpe_wwvert', '2'); s('wpe_solar', '1');
    wpeArtChanged(); wpeRecalc();
  });
}

console.log('■ hz_waermepumpe: Boot & Rechenkette (Luft-WP, MFH Zürich)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/hz_waermepumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof wpeCalc === 'function' && typeof WPE_STATIONEN !== 'undefined', null, { timeout: 12000 });

  ok(await page.evaluate(() => WPE_STATIONEN.length === 32), '32 Klimastationen geladen');
  ok(await page.evaluate(() => document.querySelectorAll('#wpe_station option').length === 33), 'Stations-Dropdown befüllt');
  ok(await page.evaluate(() => document.querySelectorAll('#wpe_kat option').length === 13), 'Kategorie-Dropdown befüllt');

  await fillA(page);
  await page.waitForTimeout(200);

  // Gebäudemodell exakt gegen Excel-Cached
  ok(await page.evaluate(() => Math.abs(_wpeLast.geb.kh - 95615) < 1), 'Σ ΔT·h = 95615 (Excel B21)');
  ok(await page.evaluate(() => Math.abs(_wpeLast.geb.vorschlag - 6.429806201955759) < 0.001), 'Leistungsvorschlag = 6.43 kW (Excel B36)');
  ok(await page.evaluate(() => Math.abs(_wpeLast.geb.qhKWh - 9725.76) < 0.1), 'QH = 9725.76 kWh (Excel B29)');

  // Resultate plausibel
  ok(await page.evaluate(() => _wpeLast.jazh > 3.5 && _wpeLast.jazh < 4.5), 'JAZh im plausiblen Bereich (Luft-WP ~4)');
  ok(await page.evaluate(() => _wpeLast.jazww > 2 && _wpeLast.jazww < 3.5), 'JAZww plausibel');
  ok(await page.evaluate(() => typeof _wpeLast.jazTot === 'number' && _wpeLast.jazTot > 3 && _wpeLast.jazTot < 4), 'JAZh+ww plausibel');
  ok(await page.evaluate(() => _wpeLast.laufzeit > 3000 && _wpeLast.laufzeit < 6000), 'Laufzeit plausibel (h/a)');
  ok(await page.evaluate(() => _wpeLast.energie.strom > 3000 && _wpeLast.energie.strom < 8000), 'Strombedarf plausibel');

  // KPIs im DOM
  ok(await page.evaluate(() => document.getElementById('wpe_kpi_jaz').textContent !== '–'), 'KPI JAZ gefüllt');
  ok(await page.evaluate(() => document.getElementById('wpe_kpi_jazh').textContent !== '–'), 'KPI JAZh gefüllt');
  ok(await page.evaluate(() => document.getElementById('wpe_out_leistung').textContent.indexOf('6.4') >= 0), 'Leistungsvorschlag im DOM');

  // Diagramm
  ok(await page.evaluate(() => !!document.querySelector('#wpeChartHost svg')), 'Lastkurven-SVG gerendert');

  // JAZ-Umschalter inkl. el. Zusatz
  await page.evaluate(() => wpeJazMode('inkl'));
  await page.waitForTimeout(50);
  ok(await page.evaluate(() => document.querySelector('#wpe_jazseg .seg-btn[data-v="inkl"]').classList.contains('act')), 'JAZ-Umschalter inkl. aktiv');

  ok(errors.length === 0, 'keine pageerror-Exceptions (' + errors.join(' | ') + ')');
  await ctx.close();
}

console.log('■ Erdsonden-WP: Kennwert-Felder + Quellentemperatur');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/hz_waermepumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof wpeCalc === 'function', null, { timeout: 12000 });
  await page.evaluate(() => {
    const s = (id, v) => { document.getElementById(id).value = v; };
    const st = WPE_STATIONEN.findIndex(x => x.name === 'Bern-Liebefeld');
    s('wpe_station', String(st)); s('wpe_kat', '1'); s('wpe_ebf', '210'); s('wpe_qh', '48'); s('wpe_qt', '52'); s('wpe_qv', '18');
    s('wpe_art', '3'); s('wpe_einsatz', '4'); s('wpe_bw', '2');
    s('wpe_qb035', '10.5'); s('wpe_cb035', '4.8'); s('wpe_qb055', '9.8'); s('wpe_cb055', '3.1');
    s('wpe_pumpe', '150'); s('wpe_anz', '1'); s('wpe_laenge', '180');
    s('wpe_ti', '20'); s('wpe_tvl', '35'); s('wpe_trl', '28'); s('wpe_speicher', '2'); s('wpe_tww', '55');
    s('wpe_wwz', '2'); s('wpe_wwvert', '3'); s('wpe_solar', '1');
    wpeArtChanged(); wpeRecalc();
  });
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('wpe_kennsole').style.display !== 'none'), 'Kennwert-Block (Sole) sichtbar');
  ok(await page.evaluate(() => document.getElementById('wpe_kennluft').style.display === 'none'), 'Luft-Kennlinie ausgeblendet');
  ok(await page.evaluate(() => document.getElementById('wpe_quelle').style.display !== 'none'), 'Quellen-Detail sichtbar');
  ok(await page.evaluate(() => _wpeLast && _wpeLast.ok && _wpeLast.jazh > 3.5 && _wpeLast.jazh < 6), 'Erdsonde: JAZh plausibel (>Luft)');
  ok(await page.evaluate(() => document.getElementById('wpe_out_tq').textContent !== '–'), 'Quellentemperatur im DOM');
  ok(errors.length === 0, 'keine pageerror-Exceptions (' + errors.join(' | ') + ')');
  await ctx.close();
}

console.log('■ Kein-Zugriff (Monteur) & Anlagenwahl-Payload');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/hz_waermepumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof wpeCalc === 'function', null, { timeout: 12000 });
  await fillA(page);
  await page.waitForTimeout(150);
  // Anlagenwahl-Payload prüfen (berechnete Projektwerte, nie Datenblatt)
  const pl = await page.evaluate(() => {
    const r = _wpeLast;
    return {
      leistungGenOut: Math.round((r.vorschlag || 0) * 10) / 10,
      jazHeizung: r.jazh ? Math.round(r.jazh * 100) / 100 : 0,
      jazHww: (typeof r.jazTot === 'number') ? Math.round(r.jazTot * 100) / 100 : 0,
      strombedarfWp: Math.round(r.energie.strom || 0)
    };
  });
  ok(Math.abs(pl.leistungGenOut - 6.4) < 0.2, 'Payload leistungGenOut ≈ 6.4 kW');
  ok(pl.jazHeizung > 3.5 && pl.jazHeizung < 4.5, 'Payload jazHeizung plausibel');
  ok(pl.strombedarfWp > 3000, 'Payload strombedarfWp plausibel');
  await ctx.close();
}
console.log('■ WP-Datenbank-Picker (gema_wpesti_daten.js)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/hz_waermepumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof wpeCalc === 'function' && typeof GemaWpestiDaten !== 'undefined', null, { timeout: 12000 });

  // Boot: Luft-Wasser (Default) → Hersteller-Select befüllt, Typ-Zeile versteckt
  ok(await page.evaluate(() => GemaWpestiDaten.anzahl() === 1817), 'Datenbank geladen (1817 Geräte)');
  ok(await page.evaluate(() => document.querySelectorAll('#wpe_db_herst option').length === 50), 'Hersteller-Select: 49 Luft-Wasser-Hersteller + Platzhalter');
  ok(await page.evaluate(() => document.getElementById('wpe_db_row_typ').style.display === 'none'), 'Typ-Zeile anfangs versteckt');

  // Gerät wählen → Kennlinie/Typ/Stufigkeit übernommen, Chip + Wahl gesetzt
  const g = await page.evaluate(() => {
    document.getElementById('wpe_db_herst').value = 'STIEBEL ELTRON'; wpeDbHerstChanged();
    document.getElementById('wpe_db_typ').value = '09,04 kW WPL 24 I / IK / A'; wpeDbTypChanged();
    const v = id => document.getElementById(id).value;
    return { q0: v('wpe_l_q35_0'), c55_0: v('wpe_l_c55_0'), typ: v('wpe_typ'), stufig: v('wpe_stufig'),
             chip: document.getElementById('wpe_db_chip').style.display, wahl: v('wpe_db_wahl') };
  });
  ok(g.q0 === '12.98' && g.c55_0 === '2.34', 'Kennlinie zellidentisch übernommen (Q−15/W35 = 12.98, COP−7/W55 = 2.34)');
  ok(g.typ === 'STIEBEL ELTRON 09,04 kW WPL 24 I / IK / A', 'WP-Typ-Feld befüllt');
  ok(g.stufig === '4', 'Stufigkeit übernommen (stufenlos)');
  ok(g.chip !== 'none' && g.wahl.indexOf('WPL 24') > 0, 'Herkunfts-Chip sichtbar + Wahl im Hidden-Feld');

  // Eigene Eingabe (echtes Event) → Herkunft gelöst, Wert bleibt
  await page.click('#wpe_l_q35_0', { clickCount: 3 });
  await page.keyboard.type('13.5');
  const o = await page.evaluate(() => ({
    wahl: document.getElementById('wpe_db_wahl').value,
    chip: document.getElementById('wpe_db_chip').style.display,
    q0: document.getElementById('wpe_l_q35_0').value }));
  ok(o.wahl === '' && o.chip === 'none' && o.q0 === '13.5', 'Eigene Eingabe löst die DB-Herkunft, der Wert bleibt');

  // Quellen-Wechsel auf Erdsonde → Sole-Hersteller, Übernahme in die B0/W-Felder
  const s = await page.evaluate(() => {
    document.getElementById('wpe_art').value = '3'; wpeArtChanged();
    document.getElementById('wpe_db_herst').value = 'alpha innotec'; wpeDbHerstChanged();
    document.getElementById('wpe_db_typ').value = 'SWCV 62H(K)3'; wpeDbTypChanged();
    const v = id => document.getElementById(id).value;
    return { n: document.querySelectorAll('#wpe_db_herst option').length,
             qb035: v('wpe_qb035'), cb055: v('wpe_cb055') };
  });
  ok(s.n === 32, 'Quellen-Wechsel: 31 Sole-Hersteller + Platzhalter');
  ok(s.qb035 === '5.95' && s.cb055 === '2.87', 'Sole-Gerät übernommen (Q B0/W35 = 5.95, COP B0/W55 = 2.87)');

  // AutoSave-Restore-Pfad: Hidden-Feld + synthetisches change → Selects/Chip nachgezogen, keine Löse-Reaktion
  const r = await page.evaluate(() => {
    const w = document.getElementById('wpe_db_wahl');
    w.value = JSON.stringify({ g: 'sw', h: 'alpha innotec', t: 'SWCV 62H(K)3' });
    w.dispatchEvent(new Event('change', { bubbles: true }));
    return { herst: document.getElementById('wpe_db_herst').value,
             typ: document.getElementById('wpe_db_typ').value,
             chip: document.getElementById('wpe_db_chip').style.display };
  });
  ok(r.herst === 'alpha innotec' && r.typ === 'SWCV 62H(K)3' && r.chip !== 'none', 'Restore-Pfad stellt Selects + Chip wieder her');
  ok(errors.length === 0, 'Picker: keine pageerror-Exceptions (' + errors.join('; ') + ')');
  await ctx.close();
}
{
  // Monteur → Kein Zugriff
  const { ctx, page } = await newPage(browser, seed(['role_monteur']));
  await page.goto(BASE + '/hz_waermepumpe.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.body.innerHTML.indexOf('Kein Zugriff') >= 0 || document.body.innerHTML.indexOf('kein Zugriff') >= 0), 'Monteur: Kein-Zugriff-Screen');
  await ctx.close();
}

await browser.close();
await server.close();
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' waermepumpe_smoke: ' + pass + ' ok, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
