// Playwright-Smoke-Test Mischkreuz (sb_mischkreuz.html). Deckt ab: Boot als
// Planer, Excel-Beispiel (WW 60 / KW 10 / MW 45, Q 30 l/min → 21/9 l/min,
// 0.35/0.15 l/s, Kontrolle 30), Anteile ohne Q (leer-Hinweis), Einheiten-
// Umschaltung (l/s · l/h), Fehlerpfade (MW ausserhalb, WW ≤ KW) inkl.
// Schema-Warnbox, klickbares SVG-Schema (Chip → Eingabefeld), Persistenz
// über Reload OHNE Projektbezug (Snapshot-Fallback), sb_index-Kachel,
// Kein-Zugriff (Monteur).
// Aufruf: CHROME=<chromium> node scripts/mischkreuz_smoke_test.mjs
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

// ── Boot als Planer (Defaults = Excel-Beispiel, noch ohne Q) ──
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(BASE + '/sb_mischkreuz.html');
await page.waitForTimeout(1800);

const txt = (id) => page.locator('#' + id).innerText();

console.log('— Boot & Anteile ohne Q —');
ok((await page.title()).indexOf('Mischkreuz') === 0, 'Seite lädt (Titel)');
ok((await page.locator('body').innerText()).indexOf('Kein Zugriff') < 0, 'Planer hat Zugriff');
ok((await page.inputValue('#mk_tw')) === '60', 'Default WW = 60 °C');
ok((await page.inputValue('#mk_tk')) === '10', 'Default KW = 10 °C');
ok((await page.inputValue('#mk_tm')) === '45', 'Default MW = 45 °C');
ok((await txt('mk_out_aww')).indexOf('35.00') === 0, 'WW-Anteil 35.00 K (Excel M23)');
ok((await txt('mk_out_akw')).indexOf('15.00') === 0, 'KW-Anteil 15.00 K (Excel M27)');
ok((await txt('mk_out_spanne')).indexOf('50.00') === 0, 'Spanne 50.00 K (Excel M29)');
ok((await txt('mk_out_pctww')).indexOf('70.0') === 0, 'WW-Anteil 70.0 %');
ok((await txt('mk_kpi_qww')) === '–', 'ohne Q: KPI Q_WW leer («–»)');
ok(await page.locator('#mk_hint_q').isVisible(), 'Hinweis «Volumenstrom erfassen» sichtbar');
ok(await page.locator('#mkSchema svg').count() === 1, 'Mischungskreuz-SVG gezeichnet');
ok((await page.locator('#mkSchema').innerHTML()).indexOf('Q erfassen') >= 0, 'Schema zeigt «Q erfassen» in den Volumenstrom-Boxen');

console.log('— Excel-Beispiel mit Q = 30 l/min —');
await page.fill('#mk_q', '30');
await page.waitForTimeout(300);
ok((await txt('mk_out_qww')).indexOf('21.00') === 0, 'Q_WW = 21.00 l/min (Excel V23)');
ok((await txt('mk_out_qww_ls')).indexOf('0.35') === 0, 'Q_WW = 0.35 l/s (Excel Z23)');
ok((await txt('mk_out_qkw')).indexOf('9.00') === 0, 'Q_KW = 9.00 l/min (Excel V27)');
ok((await txt('mk_out_qkw_ls')).indexOf('0.15') === 0, 'Q_KW = 0.15 l/s (Excel Z27)');
ok((await txt('mk_out_sum')).indexOf('30.00') === 0, 'Kontrolle: Summe 30.00 l/min (Excel V29)');
ok((await txt('mk_out_qlmin')).indexOf('30.00') === 0 && (await txt('mk_out_qls')).indexOf('0.50') === 0, 'Q-Spiegel 30.00 l/min / 0.50 l/s');
ok((await txt('mk_kpi_qww')) === '21.00' && (await txt('mk_kpi_qkw')) === '9.00', 'KPIs 21.00 / 9.00');
ok((await txt('mk_kpi_pct')).indexOf('70') === 0, 'Mischverhältnis-KPI 70 / 30');
ok(!(await page.locator('#mk_hint_q').isVisible()), 'Q-Hinweis verschwindet');
ok((await page.locator('#mkSchema').innerHTML()).indexOf('21.00') >= 0, 'Schema zeigt Q_WW 21.00');
ok((await page.locator('#mkSchema').innerHTML()).indexOf('Kontrolle') >= 0, 'Schema zeigt Kontrollzeile');

console.log('— Einheiten-Umschaltung —');
await page.selectOption('#mk_qunit', 'ls');
await page.fill('#mk_q', '0.5');
await page.waitForTimeout(300);
ok((await txt('mk_out_qww')).indexOf('21.00') === 0, '0.5 l/s → identisches Ergebnis (21.00 l/min)');
await page.selectOption('#mk_qunit', 'lh');
await page.fill('#mk_q', '1800');
await page.waitForTimeout(300);
ok((await txt('mk_out_qkw')).indexOf('9.00') === 0, '1800 l/h → identisches Ergebnis (9.00 l/min)');
await page.selectOption('#mk_qunit', 'lmin');
await page.fill('#mk_q', '30');
await page.waitForTimeout(300);

console.log('— Fehlerpfade (gemeldet statt geklemmt) —');
await page.fill('#mk_tm', '65');
await page.waitForTimeout(300);
ok(await page.locator('#mk_err').isVisible(), 'MW > WW → Fehlerbox sichtbar');
ok((await txt('mk_err')).indexOf('Mischtemperatur') >= 0, 'Fehlertext nennt die Mischtemperatur');
ok((await txt('mk_out_qww')) === '–', 'keine Volumenströme im Fehlerfall');
ok((await page.locator('#mkSchema').innerText()).indexOf('nicht darstellbar') >= 0, 'Schema zeigt Warnbox statt Kreuz');
await page.fill('#mk_tm', '45');
await page.fill('#mk_tw', '10');
await page.waitForTimeout(300);
ok((await txt('mk_err')).indexOf('wärmer als Kaltwasser') >= 0, 'WW = KW → ww_kw-Fehlertext');
await page.fill('#mk_tw', '60');
await page.waitForTimeout(300);
ok(!(await page.locator('#mk_err').isVisible()), 'Fehlerbox verschwindet nach Korrektur');

console.log('— Klickbares Schema —');
await page.locator('#mkSchema [data-mkziel="mk_tw"]').first().click();
await page.waitForTimeout(400);
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'mk_tw'), 'Klick auf WW-Box fokussiert das WW-Feld');

console.log('— Persistenz über Reload OHNE Projektbezug (Snapshot-Fallback) —');
await page.fill('#mk_q', '42');
await page.fill('#mk_tm', '38');
await page.waitForTimeout(5600); // AutoSave-Debounce (5 s) abwarten
await page.reload();
await page.waitForTimeout(4200); // Snapshot-Fallback 700/1800/3500 ms
ok((await page.inputValue('#mk_q')) === '42', 'Q = 42 nach Reload wiederhergestellt');
ok((await page.inputValue('#mk_tm')) === '38', 'MW = 38 nach Reload wiederhergestellt');
ok((await txt('mk_out_qww')).indexOf('23.52') === 0, 'Ergebnis nach Restore neu gerechnet (42·28/50 = 23.52 l/min)');
ok(errors.length === 0, 'keine pageerrors (' + errors.join(' | ').slice(0, 200) + ')');

await ctx.close();

// ── sb_index-Kachel (role_admin — der Rollen-Redirect leitet Planer vom Hub weg) ──
console.log('— sb_index-Kachel —');
{
  const ix = await newPage(browser, seed(['role_admin']));
  await ix.page.goto(BASE + '/sb_index.html');
  await ix.page.waitForTimeout(900);
  ok(await ix.page.locator('a.mod[href="sb_mischkreuz.html"]').count() === 1, 'Kachel in der Kaltwasser-Gruppe');
  ok((await ix.page.locator('a.mod[href="sb_mischkreuz.html"]').innerText()).indexOf('Mischkreuz') >= 0, 'Kachel-Titel «Mischkreuz»');
  await ix.ctx.close();
}

// ── Kein Zugriff (Monteur) ──
console.log('— Zugriffsschutz —');
{
  const { ctx: c2, page: p2 } = await newPage(browser, seed(['role_monteur']));
  await p2.goto(BASE + '/sb_mischkreuz.html');
  await p2.waitForTimeout(1500);
  ok((await p2.locator('body').innerText()).indexOf('Kein Zugriff') >= 0, 'Monteur: Kein-Zugriff-Screen');
  await c2.close();
}

await browser.close();
server.close();
console.log('\n' + n + ' Checks, ' + fail + ' Fehler');
process.exit(fail ? 1 : 0);
