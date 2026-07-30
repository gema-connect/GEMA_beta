// Playwright-Smoke-Test Regenwasserrechner AWEL (sb_regenwasserrechner.html)
// Boot/Tabs, Beispiel Oberdorfingen (Tab ①: Ared-Zellen, Kontrollfeld, Zusammenzug, Ψa-Prüfung
// kantonal/kommunal), Retention Versickerung (Tab ②: QS/VRet/hÜ/massgebende TR, unterirdisch),
// Retention vor Einleitung (Tab ③: 3 Fragen, kommunale Drossel, VRet-Stufen), alle 3 SVG-Schemata,
// Übernahme-Buttons ① → ②/③, Snapshot-Restore auf dem Basis-Key (Reload), Kein-Zugriff (Monteur),
// sb_index-Kachel. Aufruf: CHROME=<chromium> node scripts/regenwasserrechner_smoke_test.mjs
import { startServer, newPage, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = await import('playwright-core');

let n = 0, fail = 0;
function ok(cond, name) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

// ── Boot als Planer ──
const { ctx, page } = await newPage(browser, seed(['role_planer']));
await page.goto(BASE + '/sb_regenwasserrechner.html');
await page.waitForTimeout(1200);

console.log('— Boot & Struktur —');
ok((await page.title()).indexOf('Regenwasserrechner AWEL') === 0, 'Seite lädt (Titel)');
ok(await page.locator('.gema-hero-title').first().isVisible(), 'Hero sichtbar');
ok((await page.locator('body').innerText()).indexOf('Kein Zugriff') < 0, 'Planer hat Zugriff');
ok(await page.locator('.g-tab').count() === 3, '3 Tabs');
ok(await page.locator('#rwFlBody tr').count() === 1, 'eine Default-Teilflächen-Zeile');
ok(await page.locator('#rwOflRefBody tr').count() === 15 + 3, 'Oberflächentypen-Referenz: 15 Typen + 3 Gruppen');

// ── Tab ①: Beispiel Oberdorfingen ──
console.log('— Tab ① Entwässerungsplanung (Beispiel Oberdorfingen) —');
await page.fill('#rw_aper', '2000');
const FL = [
  ['Dach', 'flachdach_kies', 'rw_kanal', '480'],
  ['Hauszugänge', 'platten_ohne_fugen', 'vers_dezentral', '130'],
  ['Tiefgarageneinfahrt', 'hartbelag', 'mw_kanal', '100'],
  ['Besucherparkplätze', 'hartbelag', 'rw_kanal', '90'],
  ['Fläche über Tiefgarage', 'flachdach_gruen_50', 'rw_kanal', '360'],
  ['Grünfläche', 'gruenflaeche', 'vers_dezentral', '840']
];
for (let i = 1; i < FL.length; i++) await page.click('.zl-add');
for (let i = 0; i < FL.length; i++) {
  const tr = '#rwFlBody tr:nth-child(' + (i + 1) + ') ';
  await page.fill(tr + '[data-k="bez"]', FL[i][0]);
  await page.selectOption(tr + '[data-k="ofl"]', FL[i][1]);
  await page.selectOption(tr + '[data-k="art"]', FL[i][2]);
  await page.fill(tr + '[data-k="a"]', FL[i][3]);
}
await page.waitForTimeout(250);
const cell = (id) => page.locator('#' + id).innerText();
ok((await cell('rw_f_0_areds')) === '384', 'Zeile 1: Ared,S = 384 (Flachdach Kies · 480 m²)');
ok((await cell('rw_f_0_areda')) === '336', 'Zeile 1: Ared,a = 336');
ok((await cell('rw_f_1_areds')) === '78', 'Zeile 2: Ared,S = 78 (Platten ohne Fugen · 130 m²)');
ok((await cell('rw_sum_a')) === '2’000' || (await cell('rw_sum_a')) === "2'000", 'Σ Teilflächen = 2000');
ok((await page.locator('#rw_sum_ctrl').innerText()).indexOf('✓') >= 0, 'Kontrollfeld: ✓ entspricht Perimeterfläche');
const artTxt = await page.locator('#rwArtBody').innerText();
ok(artTxt.indexOf('546') >= 0 && artTxt.indexOf('489') >= 0, 'RW-Kanalisation: 546 / 489');
ok(artTxt.indexOf('579') >= 0, 'Σ Ableitung Ared,a = 579');
ok((await cell('rw_out_psi')) === '29.0 %', 'Ψa = 29.0 %');
ok((await page.locator('#rw_out_psichk').innerText()).indexOf('Nein') >= 0, 'Anforderung kantonal (15 %) → Nein');
ok(await page.locator('#rw_psi_warn').isVisible(), 'Warnbox «Nachweis dem Baugesuch beilegen» sichtbar');
await page.fill('#rw_psikom', '30');
await page.waitForTimeout(150);
ok((await page.locator('#rw_out_psichk').innerText()).indexOf('Ja') >= 0, 'kommunale Anforderung 30 % → Ja');
ok((await cell('rw_out_grenze')).indexOf('kommunal') >= 0, 'Grenze als «kommunal» ausgewiesen');
await page.fill('#rw_psikom', '');
await page.waitForTimeout(150);
ok(await page.locator('#rwSchema1 svg').count() === 1, 'Schema ① (Flächenbilanz) gezeichnet');
const s1 = await page.locator('#rwSchema1').innerHTML();
ok(s1.indexOf('RW-Kanalisation') >= 0 && s1.indexOf('Dezentrale Versickerung') >= 0, 'Schema ①: Zielboxen der genutzten Arten');
ok(s1.indexOf('29.0') >= 0, 'Schema ①: Ψa-Marker beschriftet');
const kontrolle = await page.locator('#rw_sum_ctrl').innerText();
await page.fill('#rw_aper', '1900');
await page.waitForTimeout(150);
ok((await page.locator('#rw_sum_ctrl').innerText()).indexOf('⚠') >= 0, 'Kontrollfeld meldet Differenz zur Perimeterfläche');
await page.fill('#rw_aper', '2000');
await page.waitForTimeout(150);
ok(kontrolle.indexOf('✓') >= 0, 'Kontrollfeld war vorher ✓');
await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/rw_tab1.png' : '/tmp/rw_tab1.png', fullPage: true });

// ── Tab ②: Retention Versickerung ──
console.log('— Tab ② Retention für Versickerung —');
await page.click('.g-tab[data-tab="rwt2"]');
await page.fill('#rw_v_areds', '1000');
await page.fill('#rw_v_av', '90');
await page.fill('#rw_v_ag', '60');
await page.fill('#rw_v_sspez', '2');
await page.waitForTimeout(250);
ok((await cell('rw_v_out_qs')) === '3.0 l/s', 'QS = 3.0 l/s');
ok((await cell('rw_v_out_a')) === '23.621', 'az = 23.621 (z = 1)');
ok((await cell('rw_v_kpi_vret')) === '13', 'VRet gerundet = 13 m³ (12.57)');
ok((await cell('rw_v_kpi_hue')) === '0.17', 'hÜ = 0.17 m');
ok((await cell('rw_v_kpi_tr')) === '30', 'massgebende Regendauer = 30 min');
ok(await page.locator('#rw_v_tbody tr').count() === 21, '21 Regendauer-Zeilen');
ok((await page.locator('#rw_v_tbody tr.rw-mass').innerText()).indexOf('30') === 0, 'massgebende Zeile TR 30 markiert');
const s2 = await page.locator('#rwSchema2').innerHTML();
ok(s2.indexOf('<svg') >= 0 && s2.indexOf('h') >= 0 && s2.indexOf('0.17') >= 0, 'Schema ②: Mulde mit hÜ-Mass');
ok(s2.indexOf('T') >= 0 && s2.indexOf('30 min') >= 0, 'Schema ②: Bemessungsdiagramm mit massgebender TR');
await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/rw_tab2.png' : '/tmp/rw_tab2.png', fullPage: true });
await page.selectOption('#rw_v_typ', 'unterirdisch');
await page.waitForTimeout(200);
ok((await cell('rw_v_kpi_hue')) === '–', 'unterirdisch: hÜ-KPI entfällt');
ok((await page.locator('#rwSchema2').innerHTML()).indexOf('Kies-/Elementspeicher') >= 0, 'Schema ②: unterirdische Anlage');
await page.selectOption('#rw_v_typ', 'oberirdisch');
await page.waitForTimeout(150);

// Übernahme-Button ① → ②: erst eine Fläche auf «Einleitung in Versickerungsanlage» stellen
await page.click('.g-tab[data-tab="rwt1"]');
await page.selectOption('#rwFlBody tr:nth-child(2) [data-k="art"]', 'vers_anlage');
await page.waitForTimeout(150);
await page.click('.g-tab[data-tab="rwt2"]');
await page.click('button[onclick="rwPullVersAreds()"]');
await page.waitForTimeout(150);
ok((await page.inputValue('#rw_v_areds')) === '78', '⇩-Übernahme: Ared,S = 78 (Einleitung in Versickerungsanlage)');
await page.fill('#rw_v_areds', '1000');
await page.click('.g-tab[data-tab="rwt1"]');
await page.selectOption('#rwFlBody tr:nth-child(2) [data-k="art"]', 'vers_dezentral');
await page.waitForTimeout(150);

// ── Tab ③: Retention vor Einleitung ──
console.log('— Tab ③ Retention vor Einleitung —');
await page.click('.g-tab[data-tab="rwt3"]');
await page.fill('#rw_e_gew', 'Dorfbach');
await page.fill('#rw_e_aper', '10000');
await page.fill('#rw_e_areda', '7250');
await page.fill('#rw_e_areds', '9000');
await page.fill('#rw_e_q347', '4');
await page.waitForTimeout(250);
ok((await cell('rw_e_out_psi')) === '72.5 %', 'Ψa = 72.5 %');
ok((await page.locator('#rw_e_out_f1').innerText()) === 'Ja', 'Frage 1: Ja');
ok((await cell('rw_e_out_qe1')) === '126 l/s', 'QE,1 = 126 l/s');
ok((await page.locator('#rw_e_out_f2').innerText()) === 'Ja', 'Frage 2: Ja');
ok((await cell('rw_e_out_qdr')) === '40 l/s', 'QDrossel = 40 l/s');
ok((await page.locator('#rw_e_out_f3').innerText()) === 'Ja', 'Frage 3: Ja');
ok((await page.locator('#rw_e_out_alle').innerText()).indexOf('Ja') >= 0, 'alle drei Fragen Ja');
ok(await page.locator('#rw_e_hint_ja').isVisible(), 'Hinweis «Retentionsvolumen berechnen» sichtbar');
ok((await cell('rw_e_kpi_vret')) === '81', 'VRet gerundet = 81 m³ (80.95)');
ok((await cell('rw_e_kpi_tr')) === '20', 'massgebende Regendauer = 20 min');
ok((await cell('rw_e_out_dros')).indexOf('40') >= 0 && (await cell('rw_e_out_dros')).indexOf('Q347') >= 0, 'wirksame Drossel 40 l/s (10·Q347)');
ok(await page.locator('#rw_e_tbody tr').count() === 21, '21 Regendauer-Zeilen');
const s3 = await page.locator('#rwSchema3').innerHTML();
ok(s3.indexOf('Dorfbach') >= 0, 'Schema ③: Fliessgewässer beschriftet');
ok(s3.indexOf('Drossel') >= 0 && s3.indexOf('Retention') >= 0, 'Schema ③: Drossel + Becken');
await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/rw_tab3.png' : '/tmp/rw_tab3.png', fullPage: true });
// kommunale Drossel gewinnt
await page.fill('#rw_e_drossel', '25');
await page.waitForTimeout(200);
ok((await cell('rw_e_kpi_dros')) === '25', 'kommunale Drossel 25 l/s wirksam');
ok((await cell('rw_e_out_dros')).indexOf('kommunal') >= 0, 'Herkunft «kommunal» ausgewiesen');
ok((await page.locator('#rwSchema3').innerHTML()).indexOf('Kanalisation') >= 0, 'Schema ③: Ziel Kanalisation bei kommunaler Drossel');
await page.fill('#rw_e_drossel', '');
await page.waitForTimeout(150);
// VRet-Stufen (Q347 = 1 → Drossel 10 l/s): 1000 m² → VRet ≈ 4.3 m³ (< 5 verzichtbar) · 1400 m² → ≈ 8.7 m³ (5–10 → 10 m³)
await page.fill('#rw_e_q347', '1');
await page.fill('#rw_e_areds', '1000');
await page.waitForTimeout(200);
ok(await page.locator('#rw_e_note_verzicht').isVisible(), 'VRet < 5 m³ → Verzicht-Hinweis');
await page.fill('#rw_e_areds', '1400');
await page.waitForTimeout(200);
ok(await page.locator('#rw_e_note_zehn').isVisible(), 'VRet 5–10 m³ → Hinweis «10 m³ erstellen»');
await page.fill('#rw_e_q347', '4');
await page.fill('#rw_e_areds', '9000');
await page.waitForTimeout(150);

// ── Persistenz: Reload restauriert über den Snapshot-Fallback (Basis-Key) ──
console.log('— Persistenz (Basis-Key + Snapshot-Fallback) —');
await page.waitForTimeout(1600); // AutoSave-Debounce
await page.reload();
await page.waitForTimeout(2600); // Snapshot-Fallback 700/1800 ms
ok(await page.locator('#rwFlBody tr').count() === 6, 'Reload: 6 Teilflächen restauriert');
ok((await page.inputValue('#rwFlBody tr:nth-child(1) [data-k="bez"]')) === 'Dach', 'Reload: Bezeichnung der ersten Zeile');
ok((await page.inputValue('#rw_aper')) === '2000', 'Reload: Perimeterfläche restauriert');
ok((await page.locator('#rw_out_psi').innerText()) === '29.0 %', 'Reload: Ψa neu gerechnet');
ok((await page.inputValue('#rw_e_areds')) === '9000', 'Reload: Tab-③-Eingaben restauriert');

await ctx.close();

// ── sb_index-Kachel (als Admin — der Rollen-Redirect schickt Planer auf ihre Landing-Page) ──
console.log('— sb_index —');
{
  const { ctx: cA, page: pA } = await newPage(browser, seed(['role_admin']));
  await pA.goto(BASE + '/sb_index.html');
  await pA.waitForTimeout(900);
  const idx = await pA.locator('body').innerText();
  ok(idx.indexOf('Regenwasserrechner AWEL') >= 0, 'Kachel «Regenwasserrechner AWEL» auf sb_index');
  ok(await pA.locator('a.mod[href="sb_regenwasserrechner.html"]').count() === 1, 'Kachel verlinkt aufs Modul');
  ok(idx.indexOf('Retentionsbecken') < 0, '«Bald»-Platzhalter Retentionsbecken ersetzt');
  await cA.close();
}

// ── Kein Zugriff: Monteur ──
console.log('— Zugriff —');
{
  const { ctx: c2, page: p2 } = await newPage(browser, seed(['role_monteur']));
  await p2.goto(BASE + '/sb_regenwasserrechner.html');
  await p2.waitForTimeout(1200);
  ok((await p2.locator('body').innerText()).indexOf('Kein Zugriff') >= 0, 'Monteur: Kein-Zugriff-Screen');
  await c2.close();
}

await browser.close();
server.close();
console.log('');
console.log(fail === 0 ? '✅ ' + n + '/' + n + ' Checks grün' : '❌ ' + fail + ' von ' + n + ' Checks rot');
process.exit(fail === 0 ? 0 : 1);
