#!/usr/bin/env node
/* Enthärtung — Multistrang: Playwright-Smoke
 * Deckt ab: Excel-Beispielwerte im UI (ohne Stränge — implizite Einzel-Zeilen-
 * Stränge liefern dieselben Totale), Strang anlegen über das Zeilen-Dropdown
 * (HW-Vorbelegung = kleinste Zeilen-Härte, Härte-Feld gesperrt, «→ Strang»-
 * Tag), Zusammenstellungs-Karte mit Strang-KPIs, Gesamt-Gleichzeitigkeit
 * (V'E < konservative Summe bei 2 LU-Strängen), Umbenennen/HW ändern/Löschen,
 * Anlagenschema-SVG (Werte + Chip-Klick springt zum Feld) und Persistenz-
 * Roundtrip über das hidden Textarea (#enth_straenge, zk_rows-Muster).
 * Ausführen: CHROME=<chromium> node scripts/enthaertung_multistrang_smoke_test.mjs (aus scripts/)
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/sa_enthaertung.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof recalc === 'function' && typeof enthMultistrang === 'function', null, { timeout: 12000 });

async function setInp(sel, val) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [sel, String(val)]);
}
const txt = id => page.evaluate(i => document.getElementById(i).textContent, id);

console.log('■ Excel-Beispiel ohne Stränge (implizite Einzel-Zeilen-Stränge)');
{
  await setInp('#hr_fh', 39);
  await setInp('#lu_A', 68);     // Strang-2-Äquivalent: 68 LU, Einzel-LU 3 (Default)
  await setInp('#v_A', 10);      // HW 1 mmol/l = 10 °fH
  await setInp('#m_A', 900);
  await setInp('#n_B', 0.19);    // Strang-3-Äquivalent: Gegenosmose 0.19 l/s
  await setInp('#v_B', 0);
  await setInp('#m_B', 5337);
  ok((await txt('qd_ges')).startsWith('1.09'), 'Gesamt-Spitzendurchfluss QD = 1.09 l/s (Excel Z9)');
  ok((await txt('ve_total_ls')).startsWith('0.86'), "V'E total = 0.86 l/s (Excel I17)");
  ok((await txt('ve_total_m3h')).startsWith('3.1'), "V'E total = 3.10 m³/h (Excel I24)");
  ok((await txt('umg_total')).startsWith('0.23'), 'Umgehung total = 0.23 l/s (Excel D15)');
  ok((await txt('cb_mol_day')).replace(/['’]/g, '').startsWith('23.42'), 'CB total = 23.42 mol/d (Excel I32)');
  ok((await txt('ve_A')) === '0.67', 'Zeile A «über Enthärter» = 0.67 (P17)');
  ok((await txt('ve_B')) === '0.19', 'Zeile B «über Enthärter» = 0.19 (voll, HW 0)');
  ok(await page.evaluate(() => document.getElementById('n_A').readOnly), 'LU-Zeile: l/s-Feld aus W3 gesperrt (Regression)');
}

console.log('■ Strang anlegen über das Zeilen-Dropdown');
{
  await page.evaluate(() => {
    const sel = document.querySelector('select.strangSel[data-c="A"]');
    sel.value = '__new__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const s1 = await page.evaluate(() => ({
    n: esState.straenge.length, name: esState.straenge[0] && esState.straenge[0].name,
    hw: esState.straenge[0] && esState.straenge[0].hw, zu: esState.zu.A,
    vLocked: document.getElementById('v_A').readOnly,
    vClass: document.getElementById('v_A').classList.contains('v-strang'),
    vEdit: document.getElementById('v_A').classList.contains('v-strang-edit'),
    vStrang: document.getElementById('v_A').dataset.strang || '',
    veTag: document.getElementById('ve_A').textContent
  }));
  ok(s1.n === 1 && s1.name === 'Strang 1', 'Strang 1 angelegt («＋ Neuer Strang …»)');
  ok(s1.zu === '1', 'Zeile A dem Strang zugeordnet');
  ok(s1.hw === '10', 'HW-Vorbelegung = kleinste Zeilen-Härte (10 °fH)');
  // Feedback 28.07.2026: die Härte einer zugeordneten Zeile ist NICHT mehr
  // gesperrt — sie bleibt editierbar und schreibt die Härte des Strangs.
  ok(!s1.vLocked && !s1.vClass && s1.vEdit && s1.vStrang === '1',
     'Härte-Feld der Zeile editierbar und auf den Strang verdrahtet');
  ok(s1.veTag.includes('Strang 1'), '«über Enthärter»-Zelle zeigt «→ Strang 1»');
  ok((await txt('ve_total_ls')).startsWith('0.86'), 'Totale unverändert (gleiches Modell)');

  const card = await page.evaluate(() => {
    const c = document.querySelector('#esList .es-card');
    const k = [...c.querySelectorAll('.es-kpi b')].map(b => b.textContent);
    return { kpis: k, hwInp: c.querySelector('input[id^="es_hw_"]').value, badge: document.getElementById('esCount').textContent };
  });
  ok(card.badge === '1', 'Zähler-Badge = 1');
  ok(card.kpis[1] === '0.903 l/s', 'Karte: Q W3 = 0.903 l/s');
  ok(card.kpis[4] === '0.671 l/s', "Karte: V'E = 0.671 l/s");
  ok(card.kpis[5] === '0.232 l/s', 'Karte: Umgehung = 0.232 l/s');
  ok(card.kpis[7] === '2.61 mol/d', 'Karte: CB = 2.61 mol/d');
  ok(card.hwInp === '10', 'HW-Feld in der Karte = 10');
}

console.log('■ Zweiter Strang (Gegenosmose, HW 0) + Ohne-Strang-Ausweis');
{
  ok(await page.evaluate(() => document.getElementById('esList').textContent.includes('Ohne Strang')), 'Zeile B erscheint unter «Ohne Strang»');
  await page.evaluate(() => {
    const sel = document.querySelector('select.strangSel[data-c="B"]');
    sel.value = '__new__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const s2 = await page.evaluate(() => ({ hw: esState.straenge[1].hw, cards: document.querySelectorAll('#esList .es-card').length }));
  ok(s2.hw === '0', 'HW-Vorbelegung Strang 2 = 0 °fH (Zeilen-Härte der Gegenosmose)');
  ok(s2.cards === 2, 'zwei Strang-Karten');
  ok(!(await page.evaluate(() => document.getElementById('esList').textContent.includes('Ohne Strang'))), 'kein «Ohne Strang» mehr (alles zugeordnet)');
  ok((await txt('ve_total_ls')).startsWith('0.86'), "V'E total weiterhin 0.86 l/s");
}

console.log('■ Gesamt-Gleichzeitigkeit sichtbar (2 LU-Stränge)');
{
  await setInp('#lu_C', 28);
  await setInp('#v_C', 10);
  await page.evaluate(() => {
    const sel = document.querySelector('select.strangSel[data-c="C"]');
    sel.value = '__new__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const t = await page.evaluate(() => ({
    ve: parseFloat(document.getElementById('ve_total_ls').textContent),
    sum: parseFloat(document.getElementById('ve_sum_info').textContent)
  }));
  ok(t.ve < t.sum, "V'E mit Gesamt-Gleichzeitigkeit (" + t.ve + ") < konservative Summe (" + t.sum + ')');
  // W3(68+28=96 LU) = 1.021 → QD ges = 1.021 + 0.19 = 1.21
  ok((await txt('qd_ges')).startsWith('1.21'), 'QD gesamt über W3(96 LU) + Direktlast');
  await page.evaluate(() => { esDelete('3'); });   // Strang 3 wieder weg
  await setInp('#lu_C', '');
  await setInp('#n_C', '');   // LU löschen lässt den abgeleiteten l/s-Wert im (wieder editierbaren) Feld stehen — wie im UI sichtbar
  await setInp('#v_C', '');
}

console.log('■ Umbenennen · HW ändern · Schema');
{
  await page.evaluate(() => esRename('1', 'Strang Ost'));
  ok(await page.evaluate(() => document.querySelector('select.strangSel[data-c="A"] option[value="1"]').textContent) === 'Strang Ost', 'Dropdown führt den neuen Namen');
  await page.evaluate(() => esSetHw('1', '15'));
  const umg = await page.evaluate(() => [...document.querySelectorAll('#esList .es-card')][0].querySelectorAll('.es-kpi b')[5].textContent);
  ok(umg === '0.347 l/s', 'HW 15 °fH → Umgehung des Strangs steigt (0.347 l/s)');
  await page.evaluate(() => esSetHw('1', '10'));

  const svg = await page.evaluate(() => {
    const w = document.getElementById('enthSchemaWrap');
    const s = w.querySelector('svg');
    return { has: !!s, txt: s ? s.textContent : '', chips: s ? s.querySelectorAll('[data-esziel]').length : 0 };
  });
  ok(svg.has, 'Anlagenschema-SVG gerendert');
  ok(svg.txt.includes('Enthärtungsanlage') && svg.txt.includes('Rohwasser'), 'Schema: Behälter + Rohwasser beschriftet');
  ok(svg.txt.includes('Strang Ost'), 'Schema: Strang-Box mit Namen');
  ok(svg.txt.includes('0.86') && svg.txt.includes('39'), "Schema: V'E-Chip + HR-Chip mit Live-Werten");
  ok(svg.txt.includes('Umgehung'), 'Schema: Umgehungs-Leitung beschriftet');
  ok(svg.chips >= 4, 'Schema: klickbare Chips vorhanden (' + svg.chips + ')');
  // Chip-Klick springt zum Eingabefeld
  await page.evaluate(() => {
    const chip = document.querySelector('#enthSchemaWrap [data-esziel="hr_fh"]');
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'hr_fh'), 'Chip-Klick fokussiert das HR-Feld');
}

console.log('■ Persistenz-Roundtrip (#enth_straenge)');
{
  const ta = await page.evaluate(() => JSON.parse(document.getElementById('enth_straenge').value));
  ok(ta && ta.str.length === 2 && ta.zu.A === '1' && ta.zu.B === '2', 'Textarea trägt Stränge + Zuordnungen');
  ok(ta.str[0].name === 'Strang Ost' && ta.str[0].hw === '10', 'Name + HW persistiert');
  // Restore simulieren (AutoSave-Kette): fremder Stand → change-Event
  await page.evaluate(() => {
    const st = { str: [{ id: '7', name: 'Restore-Strang', hw: '12' }], zu: { A: '7' }, seq: 7 };
    const el = document.getElementById('enth_straenge');
    el.value = JSON.stringify(st);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const re = await page.evaluate(() => ({
    n: esState.straenge.length, name: esState.straenge[0].name,
    selA: document.querySelector('select.strangSel[data-c="A"]').value,
    selB: document.querySelector('select.strangSel[data-c="B"]').value,
    card: document.querySelector('#esList .es-name') && document.querySelector('#esList .es-name').value
  }));
  ok(re.n === 1 && re.name === 'Restore-Strang', 'Restore ersetzt den Strang-Stand');
  ok(re.selA === '7' && re.selB === '', 'Zeilen-Dropdowns folgen dem Restore (B wieder frei)');
  ok(re.card === 'Restore-Strang', 'Karte zeigt den restaurierten Strang');
  ok(await page.evaluate(() => !document.getElementById('v_B').readOnly), 'Härte-Feld B nach Restore wieder editierbar');
}

console.log('■ Strang löschen');
{
  await page.evaluate(() => esDelete('7'));
  const del = await page.evaluate(() => ({
    n: esState.straenge.length, zuA: esState.zu.A || '',
    vA: document.getElementById('v_A').readOnly,
    ve: document.getElementById('ve_A').textContent
  }));
  ok(del.n === 0 && del.zuA === '', 'Strang gelöscht, Zuordnung geleert');
  ok(!del.vA, 'Härte-Feld A wieder editierbar');
  ok(del.ve === '0.67', 'Zeile A rechnet wieder als eigener Strang (0.67 l/s)');
  ok((await txt('ve_total_ls')).startsWith('0.86'), 'Totale stabil (0.86 l/s)');
}

if (errors.length) console.log('  [pageerrors]', errors.slice(0, 5));
ok(errors.length === 0, 'Keine JS-Fehler auf der Seite');

await ctx.close();
await browser.close();
server.close();
console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
