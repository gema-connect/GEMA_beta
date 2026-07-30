// Playwright-Smoke-Test Regenwasserberechnung Stadt Luzern (sb_regenwasser_luzern.html)
// Boot/Struktur (19 Katalog-Zeilen, 7 Kolmations-Selects), Erfassung mit Kolmationsgrad-
// Wechsel, AV-Kontrolle rot/grün, GEP-Vergleich + «Retention nötig»-Badge, Übernahme
// Tab ① → Retention, Qab-Drosselung mit resultierendem C, beide integrierten Beispiele
// (EFH exakt 0.564/11.51/0.481 grün · Areal exakt 0.482/165.30/0.379 rot inkl.
// Confirm-Dialog), Versickerung (Qzu/Volumen), Snapshot-Restore auf dem Basis-Key
// (Reload), sb_index-Kachel, Kein-Zugriff (Monteur).
// Aufruf: CHROME=<chromium> node scripts/regenluzern_smoke_test.mjs
import { startServer, newPage, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = await import('playwright-core');

let n = 0, fail = 0;
function ok(cond, name) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
const txt = (p, sel) => p.locator(sel).innerText();

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

// ── Boot als Planer ──
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/sb_regenwasser_luzern.html');
await page.waitForTimeout(1200);

console.log('— Boot & Struktur —');
ok((await page.title()).indexOf('Regenwasserberechnung Luzern') === 0, 'Seite lädt (Titel)');
ok(errs.length === 0, 'keine pageerrors (' + errs.slice(0, 2).join(' | ') + ')');
ok((await page.locator('body').innerText()).indexOf('Kein Zugriff') < 0, 'Planer hat Zugriff');
ok(await page.locator('.g-tab').count() === 2, '2 Tabs (Befestigte Flächen · Retention & Versickerung)');
ok(await page.locator('#rlKatBody tr').count() === 19, '19 Katalog-Zeilen (fester Flächenkatalog)');
ok(await page.locator('#rlKatBody select.rl-kolsel').count() === 7, '7 Kolmationsgrad-Selects (nur sickerfähige Beläge)');
ok(await page.locator('#rlKolTbl tr').count() === 8, 'Kolmations-Referenztabelle: 7 Beläge + Kopf');
ok((await page.locator('#rl_stadtteil option').allInnerTexts()).join('|').indexOf('Littau') >= 0, 'Stadtteil-Auswahl (linkes/rechtes Seeufer, Littau)');

console.log('— Tab ①: Erfassung + Kolmationsgrad —');
await page.fill('#rl_avflaeche', '300');
await page.fill('#rl_f_dach', '100');
await page.fill('#rl_f_kies', '100');
await page.fill('#rl_f_gruenflaeche', '100');
await page.waitForTimeout(250);
ok((await txt(page, '#rl_sum_f')).indexOf('300.0') >= 0, 'Σ Flächen = 300.0');
ok((await txt(page, '#rl_c_kies')) === '0.8', 'Kiesbelag: C 0.8 bei Kolmationsgrad 3 (Default)');
ok((await txt(page, '#rl_g_kies')).indexOf('80.0') >= 0, 'Kiesbelag 100 m² → 80.0 m² gebührenrelevant');
// C Parzelle = ⌊(100·1 + 100·0.8 + 0)/300⌋₃ = ⌊0.6⌋ = 0.6
ok((await txt(page, '#rl_cparz')).indexOf('0.600') >= 0, 'C Parzelle 0.600');
ok((await txt(page, '#rl_sum_ctrl')).indexOf('entspricht der Parzellen-Fläche') >= 0, 'AV-Kontrolle grün (300 = 300)');
// Kolmationsgrad 1 → C 0.4
await page.selectOption('#rl_k_kies', '1');
await page.waitForTimeout(250);
ok((await txt(page, '#rl_c_kies')) === '0.4', 'Kolmationsgrad 1 → C 0.4');
ok((await txt(page, '#rl_g_kies')).indexOf('40.0') >= 0, '→ 40.0 m² gebührenrelevant');
ok((await txt(page, '#rl_cparz')).indexOf('0.466') >= 0, 'C Parzelle ⌊140/300⌋₃ = 0.466 (abgerundet)');
// AV-Differenz → rot
await page.fill('#rl_avflaeche', '320');
await page.waitForTimeout(250);
ok((await txt(page, '#rl_sum_ctrl')).indexOf('Differenz zur AV-Fläche') >= 0, 'AV-Abweichung → rote Kontrolle');
await page.fill('#rl_avflaeche', '300');
// Flächenbilanz gerendert
ok(await page.locator('#rlBilanz span[title*="Kiesbelag"]').count() === 1, 'Flächenbilanz zeigt den Kiesbelag-Anteil');

console.log('— Tab ②: GEP-Vergleich + Übernahme + Retention —');
await page.click('.g-tab[data-tab="rlt2"]');
await page.fill('#rl_gep', '0.35');
await page.waitForTimeout(250);
ok((await txt(page, '#rl_r_c')).indexOf('0.466') >= 0, 'berechneter C aus Tab ① übernommen');
// Q = 300·0.466/10000·300 = 4.194
ok((await txt(page, '#rl_r_q')).indexOf('4.19') >= 0, 'berechneter Abfluss 4.19 l/s');
ok((await txt(page, '#rl_r_qmax')).indexOf('3.15') >= 0, 'maximale Wassermenge 3.15 l/s (GEP 0.35)');
ok((await txt(page, '#rl_r_noetig')).indexOf('Ja') >= 0, 'Retention notwendig: Ja (0.466 > 0.35)');
ok((await page.locator('#rlSkala .mark').count()) >= 2, 'C-Skala mit Markern (C + GEP)');
// Übernahme Tab ① → Retention (kein Confirm — Tabelle leer)
await page.click('button[onclick="rlUebernahme()"]');
await page.waitForTimeout(300);
ok(await page.locator('#rlRetBody tr').count() === 3, 'Übernahme: 3 Zeilen (Dach, Kies, Grünfläche)');
const c2 = await page.locator('#rlRetBody input[data-k="c"]').evaluateAll(els => els.map(e => e.value));
ok(c2.join('|') === '1|0.4|0', 'übernommene C-Werte inkl. Kolmationsgrad (1 / 0.4 / 0)');
ok((await txt(page, '#rl_ret_sumf')).indexOf('300.0') >= 0, 'Σ Retention-Flächen 300.0 + AV-Kontrolle');
// Ohne Drosselung: Qab Total = 4.19 (rot, über Qmax)
ok((await txt(page, '#rl_ret_qtot')).indexOf('4.20') >= 0 && (await txt(page, '#rl_ret_qtot')).indexOf('über Q') >= 0, 'Qab Total 4.20 l/s → über Qmax (rot; ungerundete Zeilen-C, der Kopf-Abfluss rechnet mit dem abgerundeten C 0.466)');
// Dach drosseln: Qab 1 l/s → E = min(10000·1/(100·300), 1) = 0.333
await page.locator('#rlRetBody input[data-k="qab"]').first().fill('1');
await page.waitForTimeout(250);
ok((await txt(page, '#rl_rt_0_e')).indexOf('0.333') >= 0, 'gedrosseltes Dach: resultierender C 0.333');
ok((await txt(page, '#rl_rt_0_f')).indexOf('1.00') >= 0, 'gedrosseltes Dach: Qab 1.00 l/s');
// Qab Total = 1 + 1.2 + 0 = 2.2 ≤ 3.15 → grün; C äquiv = 2.2·10⁴/(300·300) = 0.2444
ok((await txt(page, '#rl_ret_qtot')).indexOf('2.20') >= 0 && (await txt(page, '#rl_ret_qtot')).indexOf('✓') >= 0, 'Qab Total 2.20 l/s → unter Qmax (grün)');
ok((await txt(page, '#rl_ret_caeq')).indexOf('0.244') >= 0 && (await txt(page, '#rl_ret_caeq')).indexOf('GEP eingehalten') >= 0, 'C äquivalent 0.244 → GEP eingehalten');

console.log('— Tab ②: Versickerung —');
await page.click('.g-tab[data-tab="rlt1"]');
await page.fill('#rl_f_versickerung', '500');
await page.click('.g-tab[data-tab="rlt2"]');
await page.fill('#rl_sicker', '2');
await page.waitForTimeout(250);
ok((await txt(page, '#rl_v_qzu')).indexOf('15.00') >= 0, 'Qzu = 0.03 · 500 = 15.00 l/s');
ok((await txt(page, '#rl_v_vol')).indexOf('11.70') >= 0, 'V = (15 − 2) · 15 · 60 / 1000 = 11.70 m³');
await page.selectOption('#rl_vteil', 'Ja');
await page.fill('#rl_sicker', '20');
await page.waitForTimeout(250);
ok((await page.locator('#rl_v_hint').innerText()).indexOf('Sickerleistung deckt den Zufluss') >= 0, 'Hinweis bei gedecktem Zufluss');

console.log('— Beispiel EFH (Confirm — Formular trägt Daten) —');
page.once('dialog', d => d.accept());
await page.evaluate(() => rlBeispiel('efh'));
// GemaDialog-Confirm bestätigen
await page.waitForTimeout(400);
const dlgBtn = page.locator('.gema-dlg-bg button', { hasText: 'Beispiel laden' });
if (await dlgBtn.count()) await dlgBtn.click();
await page.waitForTimeout(400);
ok((await txt(page, '#rl_cparz')).indexOf('0.564') >= 0, 'EFH: C Parzelle 0.564');
ok((await txt(page, '#rl_kpi_sum')).indexOf("797.6") >= 0, 'EFH: Σ Flächen 797.6');
ok((await page.locator('#rl_k_kies').inputValue()) === '1', 'EFH: Kiesbelag mit Kolmationsgrad 1');
ok(await page.locator('#rlRetBody tr').count() === 7, 'EFH: 7 Retention-Zeilen');
ok((await txt(page, '#rl_ret_qtot')).indexOf('11.51') >= 0, 'EFH: Qab Total 11.51 l/s');
ok((await txt(page, '#rl_ret_caeq')).indexOf('0.481') >= 0 && (await txt(page, '#rl_ret_caeq')).indexOf('GEP eingehalten') >= 0, 'EFH: C äquivalent 0.481 ≤ GEP 0.5 (grün)');
ok((await txt(page, '#rl_r_noetig')).indexOf('Ja') >= 0, 'EFH: Retention notwendig (0.564 > 0.5)');

console.log('— Beispiel Areal —');
await page.evaluate(() => rlBeispiel('areal'));
await page.waitForTimeout(400);
const dlgBtn2 = page.locator('.gema-dlg-bg button', { hasText: 'Beispiel laden' });
if (await dlgBtn2.count()) await dlgBtn2.click();
await page.waitForTimeout(400);
ok((await txt(page, '#rl_cparz')).indexOf('0.482') >= 0, 'Areal: C Parzelle 0.482');
ok((await txt(page, '#rl_kpi_sum')).indexOf("14'527") >= 0, "Areal: Σ Flächen 14'527 (Apostroph-Format)");
ok((await page.locator('#rl_stadtteil').inputValue()) === 'linkes Seeufer', 'Areal: Stadtteil übernommen');
ok((await txt(page, '#rl_r_q')).indexOf('210.06') >= 0, 'Areal: Abfluss 210.06 l/s');
ok((await txt(page, '#rl_r_qmax')).indexOf('152.53') >= 0, 'Areal: Qmax 152.53 l/s');
ok(await page.locator('#rlRetBody tr').count() === 16, 'Areal: 16 Retention-Zeilen (inkl. Trakt-Bemerkungen)');
const bems = await page.locator('#rlRetBody input[data-k="bem"]').evaluateAll(els => els.map(e => e.value));
ok(bems.filter(b => b === 'Trakt B').length === 3, 'Areal: 3 Zeilen «Trakt B»');
ok((await txt(page, '#rl_ret_qtot')).indexOf('165.30') >= 0 && (await txt(page, '#rl_ret_qtot')).indexOf('über Q') >= 0, 'Areal: Qab Total 165.30 l/s über Qmax (rot)');
ok((await txt(page, '#rl_ret_caeq')).indexOf('0.379') >= 0 && (await txt(page, '#rl_ret_caeq')).indexOf('nicht eingehalten') >= 0, 'Areal: C äquivalent 0.379 > GEP 0.35 (rot)');
// Qab-0-Zeile (vollständiger Rückhalt) rechnet resultierenden C 0
const kiesIdx = 7; // Zeile «Plätze und Wege mit Kiesbelag» mit Qab 0
ok((await txt(page, '#rl_rt_' + kiesIdx + '_e')) === '0.000', 'Areal: Qab 0 (Rückhalt) → resultierender C 0.000');

console.log('— Persistenz (Snapshot-Restore auf dem Basis-Key) —');
await page.waitForTimeout(6500);   // AutoSave-Debounce 5 s
await page.reload();
await page.waitForTimeout(4200);   // Snapshot-Fallback 700/1800/3500 ms
ok((await txt(page, '#rl_cparz')).indexOf('0.482') >= 0, 'nach Reload: C Parzelle 0.482 wiederhergestellt');
ok(await page.locator('#rlRetBody tr').count() === 16, 'nach Reload: 16 Retention-Zeilen wiederhergestellt');
ok((await page.locator('#rl_gep').inputValue()) === '0.35', 'nach Reload: GEP-Abflussbeiwert 0.35');

console.log('— sb_index-Kachel (als Admin — der Rollen-Redirect schickt Planer auf ihre Landing-Page) —');
{
  const { ctx: cA, page: pA } = await newPage(browser, seed(['role_admin']));
  await pA.goto(BASE + '/sb_index.html');
  await pA.waitForTimeout(900);
  const idx = await pA.locator('body').innerText();
  ok(idx.indexOf('Regenwasser Luzern') >= 0, 'Kachel «Regenwasser Luzern» auf sb_index');
  ok(await pA.locator('a.mod[href="sb_regenwasser_luzern.html"]').count() === 1, 'Kachel verlinkt aufs Modul');
  ok(idx.indexOf('Kolmationsgrad') >= 0, 'Stichpunkte nennen den Kolmationsgrad (Suche findet die Kachel)');
  await cA.close();
}

// ── Kein Zugriff: Monteur ──
console.log('— Zugriff —');
{
  const { ctx: c2, page: p2 } = await newPage(browser, seed(['role_monteur']));
  await p2.goto(BASE + '/sb_regenwasser_luzern.html');
  await p2.waitForTimeout(1200);
  ok((await p2.locator('body').innerText()).indexOf('Kein Zugriff') >= 0, 'Monteur: Kein-Zugriff-Screen');
  await c2.close();
}

await browser.close();
server.close();
console.log('');
console.log(fail === 0 ? '✅ ' + n + '/' + n + ' Checks grün' : '❌ ' + fail + ' von ' + n + ' Checks rot');
process.exit(fail === 0 ? 0 : 1);
