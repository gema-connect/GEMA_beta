#!/usr/bin/env node
/* h,x-Diagramm — Auslegungen Lüftungskomponenten: Playwright-Smoke
 * Deckt die UI-Verdrahtung der Auslegungs-Karte ab: Chip-Navigation (ax_tab),
 * Punkt-Selects aus den Luftzuständen (Defaults AUL/ZUL), Mischen inkl.
 * «als Luftzustand übernehmen» (neue Zeile combo t_x + Diagramm), Erhitzer-
 * Modi (Leistung/Zustand nach/Volumenstrom) mit Übernahme nach dem Startpunkt,
 * Kühler mit Kaltwasserseite, WRG gegen die Engine, Befeuchtung adiabat +
 * Abschlämmung, Ventilator (Pven aus Δp/η), Konsistenz UI ↔ Engine und die
 * Snapshot-Wiederherstellung der Punkt-Selects + des aktiven Tabs nach Reload.
 * Ausführen: CHROME=<chromium> node scripts/hx_auslegung_smoke_test.mjs
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}
const num = s => parseFloat(String(s).replace(/'/g, '').replace(',', '.'));

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/lt_hx_diagramm.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof axRecalc === 'function' && window._hxLast && _hxLast.punkte.length === 2, null, { timeout: 12000 });

async function setInp(sel, val) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, String(val)]);
}
const txt = sel => page.$eval(sel, el => el.textContent.trim());

console.log('■ Karte + Chip-Navigation');
{
  ok(await page.$('.ax-tabs') !== null, 'Auslegungs-Karte vorhanden');
  ok(await page.$$eval('.ax-tab', b => b.length) === 6, '6 Themen-Chips');
  ok(await page.$eval('#axPanel_misch', el => el.classList.contains('act')), 'Start-Panel = Mischen');
  await page.click('.ax-tab[data-ax="wrg"]');
  ok(await page.$eval('#axPanel_wrg', el => el.classList.contains('act')), 'Chip-Klick wechselt Panel');
  ok(await page.$eval('#ax_tab', el => el.value) === 'wrg', 'ax_tab (Persistenz) folgt dem Chip');
  await page.click('.ax-tab[data-ax="misch"]');
}

console.log('■ Punkt-Selects aus den Luftzuständen');
{
  const o = await page.$eval('#ax_mi_p1', el => ({ n: el.options.length, v: el.value, t: el.options[el.selectedIndex].text }));
  ok(o.n === 3, 'Placeholder + 2 Luftzustände (AUL/ZUL)');
  ok(o.v === '0' && /AUL/.test(o.t), 'Default Luftstrom 1 = AUL');
  ok(await page.$eval('#ax_mi_p2', el => el.value) === '1', 'Default Luftstrom 2 = ZUL (Zeile 2)');
}

console.log('■ Mischen + Übernahme');
{
  await setInp('#ax_mi_v1', 2000);
  await setInp('#ax_mi_v2', 1000);
  const tm = num(await txt('#ax_out_mi_t'));
  ok(isFinite(tm) && tm > -8 && tm < 21, 'Mischtemperatur zwischen den Strömen (' + tm + ' °C)');
  const eng = await page.evaluate(() => {
    const s1 = _hxLast.punkte[0], s2 = _hxLast.punkte[1];
    return axMisch(s1, 2000 * s1.rho, s2, 1000 * s2.rho, _hxLast.p).t;
  });
  ok(Math.abs(tm - eng) < 0.01, 'UI = Engine (θm ' + eng.toFixed(2) + ' °C)');
  ok(await page.$eval('#ax_btn_misch', b => !b.disabled), 'Übernehmen-Button aktiv');
  await page.click('#ax_btn_misch');
  const rows = await page.evaluate(() => hxRows.map(r => ({ name: r.name, combo: r.combo })));
  ok(rows.length === 3 && rows[2].name === 'Mischluft' && rows[2].combo === 't_x', 'Mischpunkt als Luftzustand übernommen (t_x, nach Punkt 2)');
  ok(await page.evaluate(() => _hxLast.punkte.length) === 3, 'Diagramm/Tabelle rechnen mit 3 Punkten');
  // Ziel-Mischverhältnis
  await setInp('#ax_mi_tziel', 7);
  const ant = await txt('#ax_out_mi_ant');
  ok(/%/.test(ant) && ant !== '–', 'Ziel-Temperatur → Mischverhältnis (' + ant + ')');
  await setInp('#ax_mi_tziel', 40);
  ok(await page.$eval('#ax_warn_mi_ziel', el => el.style.display !== 'none'), 'Ziel ausserhalb → Warnhinweis');
  await setInp('#ax_mi_tziel', '');
}

console.log('■ Lufterhitzer (4 Modi)');
{
  await page.click('.ax-tab[data-ax="le"]');
  // Feedback 31.07.2026: KEIN globaler Parameter-V̇ mehr — leerer
  // Auslegungs-Volumenstrom rechnet NICHT (ZUL/ABL nicht immer gleich)
  ok((await txt('#ax_out_le_phi')) === '–', 'Ohne Auslegungs-V̇ keine Leistung (kein globaler Fallback)');
  await setInp('#ax_le_v', 3000);
  const phiTxt = await txt('#ax_out_le_phi');   // Modus «Leistung»: AUL → ZUL (Default 0/1)
  const phiEng = await page.evaluate(() => {
    const s1 = _hxLast.punkte[0], s2 = _hxLast.punkte[1];
    return axRegister(s1, s2, 3000 * s1.rho).phi;
  });
  ok(Math.abs(num(phiTxt) - phiEng) < 0.01, 'Heizleistung AUL→ZUL = Engine (' + phiEng.toFixed(2) + ' kW)');
  ok((await txt('#ax_out_le_m')).indexOf('kg/h') > 0, 'Massenstrom aus dem Auslegungs-V̇');
  // Modus «Ziel-Temperatur» (Feedback 31.07.2026: nur ZUL-t, ohne Feuchte)
  await page.selectOption('#ax_le_mode', 'ziel');
  ok(await page.$eval('#ax_le_row_tziel', el => el.style.display !== 'none'), 'Ziel-t-Eingabe sichtbar');
  ok(await page.$eval('#ax_le_row_p2', el => el.style.display === 'none'), 'Punkt-nach-Zeile im Ziel-Modus ausgeblendet');
  await setInp('#ax_le_tziel', 21);
  const zielEng = await page.evaluate(() => {
    const s1 = _hxLast.punkte[0];
    return axRegisterZiel(s1, 21, 3000 * s1.rho, _hxLast.p).phi;
  });
  ok(Math.abs(num(await txt('#ax_out_le_phi')) - zielEng) < 0.01, 'Ziel-t 21 °C → Leistung = Engine (' + zielEng.toFixed(2) + ' kW)');
  ok(/21\.0 °C/.test(await txt('#ax_out_le_t2')), 'Zustand nach = Zieltemperatur (x konstant, φ berechnet)');
  ok(await page.$eval('#ax_btn_le', b => !b.disabled), 'Übernehmen-Button im Ziel-Modus aktiv');
  await setInp('#ax_le_tziel', '');
  // Modus «Zustand nach»
  await page.selectOption('#ax_le_mode', 'nach');
  ok(await page.$eval('#ax_le_row_p2', el => el.style.display === 'none'), 'Punkt-nach-Zeile im Modus «nach» ausgeblendet');
  await setInp('#ax_le_phi', 10);
  const t2 = await txt('#ax_out_le_t2');
  ok(/°C/.test(t2), 'Zustand nach Register berechnet (' + t2 + ')');
  const n0 = await page.evaluate(() => hxRows.length);
  await page.click('#ax_btn_le');
  const rows = await page.evaluate(() => hxRows.map(r => r.name));
  ok(rows.length === n0 + 1 && rows[1] === 'nach Erhitzer', 'Übernahme direkt NACH dem Startpunkt (Index 1)');
  // Modus «Volumenstrom»
  await page.selectOption('#ax_le_mode', 'vdot');
  await page.selectOption('#ax_le_p2', '1');
  const vreq = await txt('#ax_out_le_vreq');
  ok(/m³\/h/.test(vreq), 'erforderlicher Volumenstrom berechnet (' + vreq + ')');
  await page.selectOption('#ax_le_mode', 'phi');
  await setInp('#ax_le_phi', '');
}

console.log('■ Luftkühler + Kaltwasser');
{
  await page.click('.ax-tab[data-ax="lk"]');
  await setInp('#ax_lk_v', 3000);   // eigener Auslegungs-V̇ (kein globaler Fallback mehr)
  // warmen feuchten + kühlen Punkt anlegen
  await page.evaluate(() => {
    hxRows.push({ name: 'Sommer', combo: 't_phi', w1: '32', w2: '60' });
    hxRows.push({ name: 'Kühl', combo: 't_phi', w1: '14', w2: '95' });
    hxRenderTable(); hxPersist(); hxRecalc();
  });
  const iSommer = await page.evaluate(() => hxRows.length - 2);
  await page.selectOption('#ax_lk_p1', String(iSommer));
  await page.selectOption('#ax_lk_p2', String(iSommer + 1));
  ok((await txt('#ax_out_lk_art')).indexOf('nass') === 0, 'Kühlung als «nass — entfeuchtet» erkannt');
  const kond = num(await txt('#ax_out_lk_kond'));
  ok(kond > 5, 'Kondensat berechnet (' + kond + ' kg/h)');
  const phiLk = num(await txt('#ax_out_lk_phi'));
  ok(phiLk > 0, 'Kühlleistung positiv ausgewiesen (' + phiLk + ' kW)');
  const mw = await txt('#ax_out_lk_mw');
  ok(/kg\/h/.test(mw) && /l\/min/.test(mw), 'Kaltwasser-Massenstrom (' + mw + ')');
  ok(num(await txt('#ax_out_lk_t0')) === 10.5, 'θ0 = (6+12)/2+1.5 = 10.5 °C');
  ok(await page.$eval('#ax_warn_lk', el => el.style.display === 'none'), 'keine Heiz-Warnung im Kühlfall');
}

console.log('■ Wärmerückgewinnung');
{
  await page.click('.ax-tab[data-ax="wrg"]');
  await setInp('#ax_wrg_vaul', 3000);   // eigener Auslegungs-V̇
  await page.selectOption('#ax_wrg_paul', '0');   // AUL −8/90
  const iAbl = await page.evaluate(() => hxRows.findIndex(r => r.name === 'ZUL'));
  await page.selectOption('#ax_wrg_pabl', String(iAbl));
  const ui = num(await txt('#ax_out_wrg_t2'));
  const eng = await page.evaluate(iA => {
    const sA = _hxLast.punkte.find(s => s.idx === 0), sB = _hxLast.punkte.find(s => s.idx === iA);
    const v = 3000;
    return axWrg(sA, sB, v * sA.rho, v * sB.rho, 75, 0, _hxLast.p).aul2.t;
  }, iAbl);
  ok(Math.abs(ui - eng) < 0.05, 'θ nach WRG (η 75 %) = Engine (' + eng.toFixed(2) + ' °C)');
  ok(/°C/.test(await txt('#ax_out_wrg_abl2')), 'Fortluft-Temperatur aus der Bilanz');
  ok(/kW/.test(await txt('#ax_out_wrg_phi')), 'Rückgewinnleistung ausgewiesen');
  const n0 = await page.evaluate(() => hxRows.length);
  await page.click('#ax_btn_wrg');
  ok(await page.evaluate(() => hxRows.length) === n0 + 1 &&
     await page.evaluate(() => hxRows[1].name) === 'nach WRG', 'Zuluft nach WRG übernommen (nach AUL)');
  // η-Inverse: eben erzeugten Punkt als AUL 2 messen (Indizes nach dem
  // Einfügen verschoben → ABL neu auf ZUL setzen)
  await page.selectOption('#ax_wrg_mode', 'eta');
  const iZul = await page.evaluate(() => hxRows.findIndex(r => r.name === 'ZUL'));
  await page.selectOption('#ax_wrg_pabl', String(iZul));
  await page.selectOption('#ax_wrg_paul2', '1');
  const eta = num(await txt('#ax_out_wrg_etat'));
  ok(Math.abs(eta - 75) < 1.5, 'η-Inverse aus gemessenen Zuständen ≈ 75 % (' + eta + ')');
  await page.selectOption('#ax_wrg_mode', 'nach');
}

console.log('■ Befeuchtung adiabat + Abschlämmung');
{
  await page.click('.ax-tab[data-ax="bef"]');
  await setInp('#ax_bef_v', 3000);   // eigener Auslegungs-V̇
  await page.selectOption('#ax_bef_art', 'adiabat');
  const iSommer = await page.evaluate(() => hxRows.findIndex(r => r.name === 'Sommer'));
  await page.selectOption('#ax_bef_p1', String(iSommer));
  const kg = num(await txt('#ax_out_bef_kg'));
  const tw = await page.evaluate(i => _hxLast.punkte.find(s => s.idx === i).tw, iSommer);
  ok(Math.abs(kg - tw) < 0.1, 'Kühlgrenze = Feuchtkugel (' + tw.toFixed(1) + ' °C)');
  ok(/g\/kg/.test(await txt('#ax_out_bef_dxm')), 'Δxmax/Δxeff berechnet');
  const wv = num(await txt('#ax_out_bef_wv'));
  ok(wv > 0, 'Wasserverbrauch ṁV (' + wv + ' kg/h)');
  await setInp('#ax_bef_csp', 15);
  await setInp('#ax_bef_ca', 45);
  const ma = num(await txt('#ax_out_bef_ma'));
  ok(Math.abs(ma - wv * 15 / 30) < 0.05, 'Abschlämmung = ṁV·Csp/(CA−Csp) (' + ma + ' kg/h)');
  await setInp('#ax_bef_ca', 10);
  ok(await page.$eval('#ax_warn_bef_ca', el => el.style.display !== 'none'), 'CA ≤ Csp → Warnhinweis');
  await setInp('#ax_bef_ca', 45);
  // Dampf-Modus: Zustand nach aus Dampfmenge
  await page.selectOption('#ax_bef_art', 'dampf');
  await page.selectOption('#ax_bef_mode_d', 'nach');
  await setInp('#ax_bef_md', 12);
  ok(/°C/.test(await txt('#ax_out_bef_t2')), 'Dampf: Zustand nach Befeuchter berechnet');
  ok(await page.$eval('#ax_btn_bef', b => !b.disabled), 'Übernahme möglich');
}

console.log('■ Ventilator');
{
  await page.click('.ax-tab[data-ax="ven"]');
  await setInp('#ax_ven_v', 3000);   // eigener Auslegungs-V̇
  await setInp('#ax_ven_dp', 1200);
  const pv = num(await txt('#ax_out_ven_p'));
  ok(Math.abs(pv - 3000 * 1200 / (0.65 * 3.6e6)) < 0.01, 'Pven = V̇·Δp/(η·3.6·10⁶) = ' + pv + ' kW');
  ok(/K/.test(await txt('#ax_out_ven_dt')), 'Ventilatorerwärmung θAbw berechnet');
  await page.selectOption('#ax_ven_p1', '0');
  ok(/°C/.test(await txt('#ax_out_ven_t2')), 'Temperatur nach Ventilator (Punkt gewählt)');
  ok(await page.$eval('#ax_btn_ven', b => !b.disabled), 'Übernahme möglich');
  await page.selectOption('#ax_ven_mode', 'p');
  await setInp('#ax_ven_p', 2);
  ok(await page.$eval('#ax_ven_row_dp', el => el.style.display === 'none'), 'Modus «Leistung bekannt» blendet Δp aus');
  ok(/K/.test(await txt('#ax_out_ven_dt')), 'θAbw auch aus direkter Leistung');
}

console.log('■ Snapshot (AutoSave) + Restore-Fallback der Punkt-Selects');
{
  // beforeunload → AutoSave schreibt den Snapshot synchron nach localStorage
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  const snap = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('gema_hx_diagramm') || '{}'); } catch (e) { return {}; } });
  ok(typeof snap.ax_tab === 'string' && ('ax_lk_tvl' in snap) && ('ax_mi_p1' in snap), 'AutoSave-Snapshot enthält die Auslegungs-Felder (ax_*)');
  // Restore-Fallback End-to-End: Tab + Punkt-Select setzen, Reload (beforeunload
  // schreibt den Snapshot) — objektlos restauriert NUR axSnapshotLoad; AutoSave
  // würde Select-Werte ohnehin VOR dem Optionen-Aufbau setzen.
  await page.click('.ax-tab[data-ax="lk"]');
  await page.selectOption('#ax_lk_p1', '1');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof axRecalc === 'function' && window._hxLast && _hxLast.punkte.length >= 2, null, { timeout: 12000 });
  await page.waitForTimeout(1100);   // axSnapshotLoad 700 ms
  ok(await page.$eval('#axPanel_lk', el => el.classList.contains('act')), 'aktiver Tab (Kühler) aus dem Snapshot wiederhergestellt');
  ok(await page.$eval('#ax_lk_p1', el => el.value) === '1', 'Punkt-Select aus dem Snapshot wiederhergestellt (statt Default 0)');
}

ok(errors.length === 0, 'keine pageerrors' + (errors.length ? ' — ' + errors[0] : ''));
console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
