/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test Spannungsfall & Verlustleistung (el_spannungsfall.html)
   ════════════════════════════════════════════════════════════════════════
   Prüft die Oberfläche im Browser: Boot, Rechenkette bis in die Anzeige,
   Ampel, Querschnitts-Vorschlag, Schema, Persistenz über einen Reload und
   den Zugriffsschutz.

     CHROME=/opt/pw-browsers/chromium node scripts/spannungsfall_smoke_test.mjs

   Braucht playwright-core (npm i --no-save playwright-core).
   ════════════════════════════════════════════════════════════════════════ */
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const nah = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, m + ' — ist ' + a + ', erwartet ' + b);
const zahl = t => parseFloat(String(t).replace(/[’\s]/g, '').replace(/[^0-9.\-]/g, '')) || 0;

const { chromium } = await import('playwright-core');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await wireRoutes(ctx);
  const st = seed(roleIds);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_spannungsfall.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { page, ctx, fehler };
}
const txt = (page, sel) => page.textContent(sel).then(t => (t || '').trim());

/* ══ Boot & Aufbau ═══════════════════════════════════════════════════ */
const { page, ctx, fehler } = await oeffne(['role_elektro_planer']);
ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
ok((await page.textContent('.gema-hero-title')).includes('Spannungsfall'), 'Hero-Titel');
ok(await page.locator('.el-card').count() === 5, '5 Schritt-Karten');
ok(await page.locator('#sf_system option').count() === 2, 'Netzsysteme geladen');
ok(await page.locator('#sf_quer option').count() >= 19, 'Querschnittsreihe geladen');
ok(await page.locator('#sf_material option').count() === 3, 'Leitermaterialien geladen');
ok(await page.locator('#sf_temp option').count() === 5, 'Temperaturstufen geladen');
ok(await page.locator('.el-stub').count() === 0, 'Gerüst-Banner ist entfernt');

/* ══ Default-Rechnung ════════════════════════════════════════════════
   400 V / 2.5 mm² / 16 A / 100 m / Cu bei 70 °C
   κ = 56 / (1 + 0.00393·50) = 46.7995
   ΔU = √3·16·100 / (46.7995·2.5) = 23.6866 V → 5.92 % */
{
  const kappa = 56 / (1 + 0.00393 * 50);
  const dU = Math.sqrt(3) * 16 * 100 / (kappa * 2.5);
  nah(zahl(await txt(page, '#sf_kappa')), kappa, 0.01, 'κ bei 70 °C angezeigt');
  nah(zahl(await txt(page, '#sf_du')), dU, 0.02, 'ΔU angezeigt');
  nah(zahl(await txt(page, '#sf_duPct')), dU / 400 * 100, 0.02, 'Δu angezeigt');
  nah(zahl(await txt(page, '#sf_pv')), 3 * 256 * 100 / (kappa * 2.5), 0.05, 'Verlustleistung angezeigt');
  nah(zahl(await txt(page, '#sf_aeff')), 2.5, 0.01, 'wirksamer Querschnitt');
  nah(zahl(await txt(page, '#sf_duZul')), 12, 0.01, 'zulässiger Spannungsfall 12 V');
  ok((await page.getAttribute('#sf_duPct', 'class')).includes('err'), '5.92 % über 3 % → rot markiert');
  ok((await txt(page, '#sf_status')).startsWith('✗'), 'Status meldet die Überschreitung');
}

/* Kennzahlen-Leiste spiegelt das Ergebnis */
ok((await txt(page, '#sf_sumDu')).includes('%'), 'Kennzahl Spannungsfall gesetzt');
ok((await txt(page, '#sf_sumPv')).includes('W'), 'Kennzahl Verlustleistung gesetzt');
ok((await txt(page, '#sf_sumKosten')).includes('CHF'), 'Kennzahl Kosten gesetzt');

/* ══ Schema ══════════════════════════════════════════════════════════ */
{
  ok(await page.locator('#sf_schema svg').count() === 1, 'Schema gezeichnet');
  const svg = await page.innerHTML('#sf_schema');
  ok(svg.includes('#dc2626'), 'Schema in Rot (Grenzwert überschritten)');
  ok(!/var\(--/.test(svg), 'Schema nutzt nur literale Farben (GemaPDF-Regel)');
  ok(svg.includes('Einspeisung') && svg.includes('Verbraucher'), 'Schema beschriftet');
}

/* ══ Hinweise ════════════════════════════════════════════════════════ */
{
  const hw = await page.innerText('#sf_hinweise');
  ok(/Strombelastbarkeit/.test(hw), 'Hinweis auf die Strombelastbarkeit');
  ok(await page.locator('#sf_hinweise a[href="el_belastbarkeit.html"]').count() === 1,
     'Hinweis verlinkt das Belastbarkeits-Modul');
  ok(!/Reaktanz/.test(hw), 'bei 2.5 mm² kein Reaktanz-Hinweis');
}

/* ══ Querschnitts-Vorschlag ══════════════════════════════════════════ */
{
  ok(await page.locator('.sf-empf').count() === 1, 'Querschnitts-Vorschlag erscheint');
  const empf = await page.textContent('.sf-empf-q');
  ok(empf.trim() === '6 mm²', 'Vorschlag 6 mm² bei 70 °C — ist ' + empf.trim());
  await page.click('.sf-empf-btn');
  await page.waitForTimeout(250);
  ok(await page.inputValue('#sf_quer') === '6', 'Übernehmen setzt den Querschnitt');
  const pct = zahl(await txt(page, '#sf_duPct'));
  ok(pct <= 3, 'nach der Übernahme ist der Grenzwert eingehalten — ' + pct + ' %');
  ok(await page.locator('.sf-empf').count() === 0, 'Vorschlag verschwindet, sobald es passt');
  const svg = await page.innerHTML('#sf_schema');
  ok(svg.includes('#059669') || svg.includes('#d97706'), 'Schema nicht mehr rot');
  await page.selectOption('#sf_quer', '2.5');
  await page.waitForTimeout(200);
}

/* ══ Systemwechsel ═══════════════════════════════════════════════════ */
{
  await page.selectOption('#sf_system', '1p230');
  await page.waitForTimeout(250);
  const kappa = 56 / (1 + 0.00393 * 50);
  nah(zahl(await txt(page, '#sf_du')), 2 * 16 * 100 / (kappa * 2.5), 0.05,
      'einphasig: ΔU mit Faktor 2');
  ok((await page.innerHTML('#sf_duFrml')).includes('2 · I'), 'Formel-Chip zeigt den Faktor 2');
  ok((await txt(page, '#sf_rLbl')).includes('Schleife'), 'Label nennt den Schleifenwiderstand');
  await page.selectOption('#sf_system', '3p400');
  await page.waitForTimeout(250);
  ok((await page.innerHTML('#sf_duFrml')).includes('√3'), 'dreiphasig: Formel-Chip zeigt √3');
}

/* ══ Energie & Kosten ════════════════════════════════════════════════ */
{
  await page.fill('#sf_hTag', '10');
  await page.fill('#sf_tage', '300');
  await page.fill('#sf_jahre', '2');
  await page.fill('#sf_auslast', '100');
  await page.fill('#sf_preis', '0.30');
  await page.waitForTimeout(250);
  nah(zahl(await txt(page, '#sf_hGesamt')), 6000, 1, 't = 10 · 300 · 2 = 6000 h');
  const pv = zahl(await txt(page, '#sf_pv'));
  nah(zahl(await txt(page, '#sf_energie')), pv / 1000 * 6000, 1, 'Energie aus P_V und t');
  nah(zahl(await txt(page, '#sf_kosten')), pv / 1000 * 6000 * 0.30, 0.5, 'Kosten = Energie · Preis');
  /* Auslastung wirkt quadratisch */
  const voll = zahl(await txt(page, '#sf_energie'));
  await page.fill('#sf_auslast', '50');
  await page.waitForTimeout(250);
  nah(zahl(await txt(page, '#sf_energie')), voll / 4, 1, '50 % Auslastung → ein Viertel');
  await page.fill('#sf_auslast', '100');
  await page.waitForTimeout(200);
}

/* ══ Temperatur-Hinweis ══════════════════════════════════════════════ */
{
  await page.selectOption('#sf_temp', '20');
  await page.waitForTimeout(250);
  ok(/20 °C/.test(await page.innerText('#sf_hinweise')), 'bei 20 °C erscheint der Warnhinweis');
  await page.selectOption('#sf_temp', '70');
  await page.waitForTimeout(250);
}

/* ══ Fold ════════════════════════════════════════════════════════════ */
{
  await page.locator('.el-card[data-fold="kosten"] .el-card-hd').click();
  await page.waitForTimeout(200);
  ok(await page.locator('.el-card[data-fold="kosten"].zu').count() === 1, 'Karte klappt zu');
  const st = await page.evaluate(() => localStorage.getItem('gema_el_fold_v1'));
  ok(st && st.includes('el_spannungsfall.kosten'), 'Fold-Zustand gespeichert');
  const snap = await page.evaluate(() => localStorage.getItem('gema_spannungsfall') || '');
  ok(!snap.includes('fold'), 'Fold-Zustand NICHT im AutoSave-Snapshot');
}

/* ══ Persistenz über Reload ══════════════════════════════════════════ */
{
  await page.fill('#sf_bez', 'Zuleitung UV Werkstatt');
  await page.fill('#sf_strom', '32');
  await page.fill('#sf_laenge', '75');
  await page.selectOption('#sf_quer', '10');
  await page.selectOption('#sf_material', 'al');
  await page.waitForTimeout(1400);
  const vorher = await txt(page, '#sf_duPct');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  ok(await page.inputValue('#sf_bez') === 'Zuleitung UV Werkstatt', 'Bezeichnung überlebt den Reload');
  ok(await page.inputValue('#sf_strom') === '32', 'Strom überlebt den Reload');
  ok(await page.inputValue('#sf_laenge') === '75', 'Länge überlebt den Reload');
  ok(await page.inputValue('#sf_quer') === '10', 'Querschnitt überlebt den Reload');
  ok(await page.inputValue('#sf_material') === 'al', 'Material überlebt den Reload');
  ok(await txt(page, '#sf_duPct') === vorher, 'Ergebnis nach dem Reload identisch — ' + vorher);
  ok(await page.locator('.el-card[data-fold="kosten"].zu').count() === 1, 'Fold-Zustand überlebt den Reload');
  const svg = await page.innerHTML('#sf_schema');
  ok(svg.includes('Zuleitung UV Werkstatt'), 'Bezeichnung erscheint im Schema');
}

/* ══ Leer-Zustand ════════════════════════════════════════════════════ */
{
  await page.fill('#sf_strom', '');
  await page.waitForTimeout(300);
  ok(await txt(page, '#sf_du') === '—', 'ohne Strom keine Zahl beim Spannungsfall');
  ok(await txt(page, '#sf_kosten') === '—', 'ohne Strom keine Kosten');
  ok((await txt(page, '#sf_status')).includes('erfassen'), 'Status fordert die Eingabe ein');
  ok(await page.locator('#sf_schema svg').count() === 0, 'Schema zeigt den Leer-Hinweis');
  await page.fill('#sf_strom', '16');
  await page.waitForTimeout(300);
}
await ctx.close();

/* ══ Zugriffsschutz ══════════════════════════════════════════════════ */
{
  const m = await oeffne(['role_monteur']);
  ok(/Kein Zugriff/i.test(await m.page.textContent('body') || ''),
     'Monteur: «Kein Zugriff»');
  await m.ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
