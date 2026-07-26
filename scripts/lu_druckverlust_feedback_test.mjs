// Drift-Guard für das Feedback vom 25.07.2026 (Sandro) in
// sb_lu_tabelle.html + gema_lu_api.js + sb_druckverlust.html:
//   LU: Reduktions-Diagramm (100 % vs. Red. W3), Spaltenköpfe «Grösster LU /
//       100 % / Red. W3», «Osmose (OW)»-Label (inkl. Verwerfen des alten
//       Admin-Override-Defaults), Info-Text bei Speziellen Apparaten,
//       breitere Medium-Selects, Wert+Einheit (l/s · l/min · l/h),
//       Total-Fusszeile der Apparate-Tabelle, eigene Spalten EW/OW/RW/GW.
//   Druckverlust: Fokus-Erhalt beim Tippen (kein «1 … nochmal 0»),
//       Zahlen-Parse (kein String-Concat bei «+ Q»), Rohrsystem einmal oben
//       + Haken «gemischte Installation» (inkl. Alt-Stand-Herleitung).
// Aufruf: CHROME=<chromium> node scripts/lu_druckverlust_feedback_test.mjs
import { chromium } from 'playwright-core';
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ════════════════════════════════════════════════════════════════
// 1) LU-Tabelle
// ════════════════════════════════════════════════════════════════
{
  const st = seed(['role_planer']);
  // Alter Admin-Override mit dem frueheren OW-Default-Label → muss beim
  // Laden verworfen werden (Label-Kürzung 07/2026), eigene gw-Umbenennung
  // bleibt dagegen erhalten.
  st.gema_lu_stammdaten_v1 = { media: [
    { id: 'ow', label: 'Enthärtetes Wasser für Osmose (OW)', short: 'OW' },
    { id: 'gw', label: 'Meteowasser (RW)', short: 'RW' }
  ] };
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_lu_tabelle.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  console.log('■ LU: Apparate-Tabelle (Spalten, Total-Fusszeile)');
  const kopf = await page.evaluate(() => {
    const h = document.querySelector('.list-head.devices');
    return { cols: h.children.length, txt: h.textContent.replace(/\s+/g, ' ').trim() };
  });
  ok(kopf.cols === 12, 'Kopfzeile hat 12 Spalten (Apparat…✕)');
  for (const c of ['KW', 'WW', 'ND', 'EW', 'OW', 'RW', 'GW', 'Total']) {
    ok(kopf.txt.indexOf(c) >= 0, 'eigene Spalte «' + c + '» vorhanden');
  }
  // Zeilen befuellen: WC ×10 (Trinkwasser), Spuelbecken ×2 (enthaertet), WC ×1 (grauwasser)
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#deviceList .device-row:not(.device-total)');
    const set = (row, qty, medium) => {
      if (medium) { const m = row.children[2]; m.value = medium; m.dispatchEvent(new Event('change', { bubbles: true })); }
    };
    set(rows[2], 0, 'enthaertet');
  });
  await page.waitForTimeout(120);
  for (const [idx, qty] of [[1, '10'], [2, '2'], [3, '5']]) {
    await page.evaluate(a => {
      const rows = document.querySelectorAll('#deviceList .device-row:not(.device-total)');
      const inp = rows[a.idx].children[1];
      inp.value = a.qty; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, { idx, qty });
    await page.waitForTimeout(120);
  }
  const tot = await page.evaluate(() => {
    const t = document.querySelector('#deviceList .device-total');
    return { txt: t.textContent.replace(/\s+/g, ' ').trim(), last: t === document.getElementById('deviceList').lastElementChild };
  });
  // WC×10 → KW 10 · Dusche×5 → KW 10/WW 10 · Spuelbecken×2 (EW) → 8 → Total 38 LU
  ok(/Total\s*17/.test(tot.txt) && tot.txt.indexOf('38 LU') >= 0, 'Total-Fusszeile summiert (17 Stk · 38 LU)');
  ok(tot.txt.indexOf('20') >= 0 && tot.txt.indexOf('8') >= 0, 'Fusszeile: KW 20 + EW 8 in eigenen Spalten');
  ok(tot.last, 'Total-Zeile rutscht immer ans Ende');
  await page.evaluate(() => window._luAddDevice());
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.querySelector('#deviceList .device-total') === document.getElementById('deviceList').lastElementChild),
    'Total-Zeile bleibt nach «+ Zeile» zuunterst');

  console.log('■ LU: Spezielle Apparate / Dauerverbraucher (Einheiten, Info-Text)');
  const specHead = await page.evaluate(() => document.querySelector('.lu-scroll.specials .list-head.specials').textContent.replace(/\s+/g, ' ').trim());
  ok(specHead.indexOf('Wert') >= 0 && specHead.indexOf('Einheit') >= 0, 'Spaltenköpfe «Wert» + «Einheit»');
  const unitOpts = await page.evaluate(() => {
    const sel = document.querySelector('#specialList .special-row select[title="Einheit"]');
    return [...sel.options].map(o => o.textContent);
  });
  ok(unitOpts.join('|') === 'l/s|l/min|l/h', 'Einheiten-Auswahl l/s · l/min · l/h (klein geschrieben)');
  ok(await page.evaluate(() => [...document.querySelectorAll('.g-info')].some(x => /Spezielle Apparate:.*1:1 addiert/.test(x.textContent))),
    'Info-Text auch bei den Speziellen Apparaten');
  // 30 l/min = 0.5 l/s → fliesst in Kaltwasser total
  await page.evaluate(() => {
    const row = document.querySelector('#specialList .special-row');
    const flow = row.children[3]; flow.value = '30'; flow.dispatchEvent(new Event('input', { bubbles: true }));
    const unit = row.children[4]; unit.value = 'lmin'; unit.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const kw = await page.evaluate(() => [...document.querySelectorAll('#kpiMain .g-result-row.ex')].map(x => x.textContent.replace(/\s+/g, ' ')).find(x => x.indexOf('Kaltwasser') >= 0) || '');
  ok(kw.indexOf('2.50 l/s') >= 0, 'Spezial 30 l/min → 0.5 l/s (KW 100 % = 2.50 l/s)');

  console.log('■ LU: Ergebnisse (Spaltenköpfe, Grösster LU, Osmose-Label, Diagramm)');
  const exHead = await page.evaluate(() => document.querySelector('.kpi-ex-head').textContent.replace(/\s+/g, ' ').trim());
  ok(exHead.indexOf('Grösster LU') >= 0, 'Spaltenkopf «Grösster LU» über den Kurven-Buttons');
  ok(exHead.indexOf('100 %') >= 0 && exHead.indexOf('Red. W3') >= 0, 'Spaltenköpfe «100 %» und «Red. W3»');
  ok(await page.evaluate(() => !!document.querySelector('#kpiMain .g-result-row.ex .maxlu-col .maxlu-inline')),
    'Grösster-LU-Buttons in eigener, ausgerichteter Spalte');
  // OW-Verbraucher anlegen → Label «Osmose (OW)» (alter Admin-Override verworfen)
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#deviceList .device-row:not(.device-total)');
    const r = rows[rows.length - 1];
    const sel = r.children[0]; sel.value = 'Waschtisch'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#deviceList .device-row:not(.device-total)');
    const r = rows[rows.length - 1];
    const m = r.children[2]; m.value = 'osmose'; m.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#kpiMain .g-result-lbl')].map(x => x.textContent.trim()));
  ok(labels.some(l => l.indexOf('Osmose (OW) total') === 0), 'Hauptwert heisst «Osmose (OW) total» (ohne «Enthärtetes Wasser für»)');
  ok(!labels.some(l => l.indexOf('Enthärtetes Wasser für Osmose') >= 0), 'alter OW-Admin-Override-Default wird verworfen');
  const redu = await page.evaluate(() => ({
    sichtbar: document.getElementById('reduCard').style.display !== 'none',
    rows: [...document.querySelectorAll('#reduChart .redu-row')].map(x => x.textContent.replace(/\s+/g, ' ').trim())
  }));
  ok(redu.sichtbar && redu.rows.length >= 3, 'Reduktions-Diagramm sichtbar (Karte «Reduktion nach W3»)');
  ok(redu.rows.some(r => /Kaltwasser.*→.*l\/s.*−\d+ %/.test(r)), 'Diagramm-Zeile zeigt 100 % → Red. W3 + Prozent-Reduktion');
  ok(redu.rows.some(r => r.indexOf('Summe alle Medien') >= 0), 'Diagramm mit Summen-Zeile');

  console.log('■ LU: GemaLU-API rechnet Einheiten um (l/min → l/s)');
  const api = await page.evaluate(() => {
    localStorage.setItem('lu_spitzenvolumenstrom_dropdown_v3__obj_fb', JSON.stringify({
      devices: [], maxLU: {},
      special: [{ label: 'Fuellhahn', medium: 'kw', qty: 1, flow: 30, flowUnit: 'lmin' }],
      dauer: [{ label: 'Alt', medium: 'kw', qty: 1, flow: 0.2 }],
      _stammdaten: { devices: [] }
    }));
    return {
      kw: GemaLU.getSpitzenvolumenstrom('obj_fb', 'kw'),
      verbraucher: GemaLU.getVerbraucher('obj_fb').map(v => v.flow)
    };
  });
  ok(Math.abs(api.kw - 0.7) < 1e-9, 'GemaLU.getSpitzenvolumenstrom: 30 l/min + 0.2 l/s (Altdaten ohne Einheit) = 0.7 l/s');
  ok(api.verbraucher.some(f => Math.abs(f - 0.5) < 1e-9), 'GemaLU.getVerbraucher liefert die l/min-Zeile als 0.5 l/s');

  ok(errors.length === 0, 'keine JS-Fehler in sb_lu_tabelle (' + errors.join(' | ').slice(0, 120) + ')');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════
// 2) Druckverlust
// ════════════════════════════════════════════════════════════════
{
  const st = seed(['role_planer']);
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_druckverlust.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  console.log('■ DV: Fokus bleibt beim Tippen (Feedback «10 braucht zwei Anläufe»)');
  const lenInp = page.locator('.ts-card').first().locator('[data-k="length_m"]');
  await lenInp.click({ clickCount: 3 });
  await page.keyboard.type('10', { delay: 70 });
  await page.waitForTimeout(150);
  const f1 = await page.evaluate(() => {
    const card = document.querySelector('.ts-card');
    return { val: card.querySelector('[data-k="length_m"]').value, foc: document.activeElement === card.querySelector('[data-k="length_m"]') };
  });
  ok(f1.val === '10', 'Länge «10» in einem Zug tippbar');
  ok(f1.foc, 'Eingabefeld behält den Fokus über das Re-Render');
  const qzInp = page.locator('.ts-card').first().locator('[data-k="qZusatz"]');
  await qzInp.click({ clickCount: 3 });
  await page.keyboard.type('0.5', { delay: 60 });
  await page.waitForTimeout(150);
  const qChip = await page.evaluate(() => document.querySelector('.ts-card .hd-val').textContent);
  ok(qChip.indexOf('1.092') >= 0, '«+ Q 0.5» wird als Zahl addiert (Q = 0.592 + 0.5 — kein String-Concat)');

  console.log('■ DV: Rohrsystem einmal oben + «gemischte Installation»');
  const top = await page.evaluate(() => ({
    perRow: document.querySelectorAll('.ts-card [data-k="sysId"]').length,
    topSys: (document.getElementById('inp_globalsys') || {}).value,
    disabled: (document.getElementById('inp_globalsys') || {}).disabled,
    gemischt: (document.getElementById('inp_gemischt') || {}).checked
  }));
  ok(top.perRow === 0, 'Standard: KEIN Rohrsystem-Select pro Teilstrecke');
  ok(top.topSys === 'optipress' && !top.disabled && top.gemischt === false, 'Kopf-Select aktiv, Haken aus');
  await page.selectOption('#inp_globalsys', 'mapress');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.querySelector('.ts-card [data-k="dimDn"]').value === '22x1.2'),
    'globaler Wechsel: Dimension bleibt erhalten, wenn es sie im neuen System gibt');
  await page.check('#inp_gemischt');
  await page.waitForTimeout(150);
  const gem = await page.evaluate(() => ({
    perRow: document.querySelectorAll('.ts-card [data-k="sysId"]').length,
    disabled: document.getElementById('inp_globalsys').disabled
  }));
  ok(gem.perRow === 3 && gem.disabled, 'Haken an → Auswahl pro Teilstrecke, Kopf-Select gesperrt');
  await page.selectOption('.ts-card [data-k="sysId"]', 'kupfer');
  await page.waitForTimeout(120);
  await page.uncheck('#inp_gemischt');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('.gema-dlg-bg')), 'Haken aus bei gemischten Systemen → Bestätigungs-Dialog');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.gema-dlg-bg button')].find(x => /Umstellen/.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelectorAll('.ts-card [data-k="sysId"]').length === 0 && !document.getElementById('inp_gemischt').checked),
    'Bestätigt → alle Teilstrecken einheitlich, Haken aus');
  ok(errors.length === 0, 'keine JS-Fehler in sb_druckverlust (' + errors.join(' | ').slice(0, 120) + ')');
  await ctx.close();
}

// ── 2b) Alt-Stand mit gemischten Systemen → Haken automatisch an ──
{
  const st = seed(['role_planer']);
  st.gema_druckverlust_v2 = {
    calcs: [{ id: 'dv_alt', name: 'Kaltwasser 1', medium: 'kw', state: {
      project: '', owner: '', apparat: '', tempC: 10,
      rows: [
        { id: 'r1', label: '1', sysId: 'optipress', dimDn: '22x1.2', flowMode: 'lu', lu: 10, grLU: 3, q_direct: 0.1, qZusatz: 0, leitungstyp: 'verteil', length_m: 5, zeta_sum: 0, eq_rl: 0, fittings: {}, armaturen: {}, manuArm: [] },
        { id: 'r2', label: '2', sysId: 'kupfer', dimDn: '15x1.0', flowMode: 'lu', lu: 5, grLU: 3, q_direct: 0.1, qZusatz: 0, leitungstyp: 'verteil', length_m: 3, zeta_sum: 0, eq_rl: 0, fittings: {}, armaturen: {}, manuArm: [] }
      ] } }],
    activeId: 'dv_alt'
  };
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);
  const page = await ctx.newPage();
  await page.goto(BASE + '/sb_druckverlust.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const alt = await page.evaluate(() => ({
    gemischt: document.getElementById('inp_gemischt').checked,
    perRow: document.querySelectorAll('.ts-card [data-k="sysId"]').length,
    sys: [...document.querySelectorAll('.ts-card [data-k="sysId"]')].map(s => s.value)
  }));
  ok(alt.gemischt === true, 'Alt-Stand mit unterschiedlichen Systemen → «gemischte Installation» automatisch an');
  ok(alt.perRow === 2 && alt.sys.join('|') === 'optipress|kupfer', 'bestehende Systeme pro Teilstrecke unverändert');

  // Datenverlust-Regression (beim Feedback-Umbau gefunden): das initiale
  // render() speicherte VOR loadAllCalcs() und wischte den gespeicherten
  // Stand bei jedem Seitenaufruf weg — Reload muss die Daten behalten.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const nachReload = await page.evaluate(() => ({
    labels: [...document.querySelectorAll('.ts-card .ts-num')].map(x => x.value),
    laenge: (document.querySelector('.ts-card [data-k="length_m"]') || {}).value,
    tab: document.getElementById('calcTabBar').textContent
  }));
  ok(nachReload.labels.join('|') === '1|2' && nachReload.laenge === '5', 'Reload behält die gespeicherten Teilstrecken (kein Boot-Überschreiben)');
  ok(nachReload.tab.indexOf('Kaltwasser 1') >= 0, 'Reload behält den Berechnungs-Namen');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
