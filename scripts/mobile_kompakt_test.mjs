// Playwright-Drift-Guard: Mobile-Kompaktierung (User-Vorgabe 07/2026)
//   - Übersichtsseiten (index/sb_index/ab_index/pm_ausschreibung): Modul-Kacheln
//     sind auf dem Phone kompakte ZEILEN — Stichpunkte (.mod-desc/.mod-pts),
//     Badges und Norm-Chips ausgeblendet; Fav-Stern bleibt, «Bald»-Badge bleibt
//     auf deaktivierten Kacheln
//   - Alle Hero-Header auf dem Phone nur Emoji + Titel: Hub-Heroes ohne
//     Beschrieb/Badges/Stats, Modul-Heroes (.hero-in) ohne Untertitel/Pills,
//     Berechnungs-Heroes (.gema-hero) ohne Norm/Untertitel (Regression)
//   - Desktop (1280px) unverändert: volle Kacheln + volle Heroes
// Ausführen: CHROME=<chromium> node scripts/mobile_kompakt_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};
const disp = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  return el ? getComputedStyle(el).display : 'MISSING';
}, sel);

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

console.log('■ index.html — Kacheln als Zeilen (Phone 390px)');
const { ctx, page } = await newPage(browser, seed(['role_admin']));
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);

ok((await disp(page, '.mod-card .mod-desc')) === 'none', 'Stichpunkte (.mod-desc) ausgeblendet');
ok(await page.evaluate(() => getComputedStyle(document.querySelector('a.mod-card')).flexDirection === 'row'), 'Kachel ist eine Flex-ZEILE');
{
  const h = await page.evaluate(() => document.querySelector('a.mod-card').getBoundingClientRect().height);
  ok(h < 80, 'Zeilenhöhe kompakt (' + Math.round(h) + 'px < 80px)');
}
ok(await page.evaluate(() => {
  const b = document.querySelector('a.mod-card:not(.disabled) .mod-badges .badge');
  return !b || getComputedStyle(b).display === 'none';
}), 'Badge-Chips auf aktiven Kacheln ausgeblendet');
ok(await page.evaluate(() => {
  const s = document.querySelector('a.mod-card .fav-btn');
  return !!s && getComputedStyle(s).display !== 'none';
}), 'Fav-Stern bleibt sichtbar');
ok(await page.evaluate(() => {
  const b = document.querySelector('.mod-card.disabled .mod-badges .badge');
  return !b || getComputedStyle(b).display !== 'none';
}), 'Deaktivierte Kachel behält den «Bald»-Badge');
ok((await disp(page, '.mod-card .mod-norms')) === 'none', 'Norm-Chips im Footer ausgeblendet');
// Hub-Hero: nur Titel
ok((await disp(page, '.hero .hero-stats')) === 'none', 'Hub-Hero: Stats-Zeile ausgeblendet');
ok(await page.evaluate(() => {
  const p = document.querySelector('.hero .hero-text p, .hero p');
  return !p || getComputedStyle(p).display === 'none';
}), 'Hub-Hero: Beschreibungstext ausgeblendet');
ok(await page.evaluate(() => {
  const b = document.querySelector('.hero .hero-badges');
  return !b || getComputedStyle(b).display === 'none';
}), 'Hub-Hero: Badge-Karten ausgeblendet');
// Suche filtert weiter über den (versteckten) Kachel-Text
ok(await page.evaluate(() => {
  const card = [...document.querySelectorAll('a.mod-card')].find(c => (c.querySelector('.mod-desc') || {}).textContent?.indexOf('QR-Rechnung') >= 0);
  return !!card;
}), 'Stichpunkt-Text bleibt im DOM (Suche «QR-Rechnung» findet die ERP-Kachel)');

console.log('■ index.html — Desktop 1280px unverändert');
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(300);
ok((await disp(page, '.mod-card .mod-desc')) !== 'none', 'Desktop: Stichpunkte sichtbar');
ok(await page.evaluate(() => getComputedStyle(document.querySelector('a.mod-card')).flexDirection === 'column'), 'Desktop: Kachel bleibt Karte (column)');
ok((await disp(page, '.hero .hero-stats')) !== 'none', 'Desktop: Hero-Stats sichtbar');
await ctx.close();

console.log('■ sb_index.html — .mod-Variante (Phone)');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/sb_index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  ok((await disp(page, '.mod-grid > .mod .mod-pts')) === 'none', 'Stichpunkte (.mod-pts) ausgeblendet');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('.mod-grid > .mod')).flexDirection === 'row'), 'Kachel ist eine Flex-ZEILE');
  {
    const h = await page.evaluate(() => document.querySelector('.mod-grid > .mod').getBoundingClientRect().height);
    ok(h < 80, 'Zeilenhöhe kompakt (' + Math.round(h) + 'px < 80px)');
  }
  ok(await page.evaluate(() => {
    const b = document.querySelector('.mod-grid > .mod:not(.disabled) .mod-badge');
    return !b || getComputedStyle(b).display === 'none';
  }), 'Kachel-Badges ausgeblendet');
  ok((await disp(page, '.hero .hero-stats')) === 'none', 'Hub-Hero: Stats ausgeblendet');
  await ctx.close();
}

console.log('■ Modul-Heroes: .hero-in (if_werkzeug) + .gema-hero (sb_zirkulation)');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  ok((await disp(page, '.hero-in .hero-sub')) === 'none', 'if_werkzeug: Untertitel ausgeblendet');
  ok(await page.evaluate(() => {
    const p = document.querySelector('.hero-in .hero-pills');
    return !p || getComputedStyle(p).display === 'none';
  }), 'if_werkzeug: Pills ausgeblendet');
  ok(await page.evaluate(() => {
    const t = document.querySelector('.hero-in .hero-title');
    return !!t && getComputedStyle(t).display !== 'none';
  }), 'if_werkzeug: Titel bleibt');
  {
    const h = await page.evaluate(() => (document.querySelector('.hero:not(.g-nav)') || document.querySelector('.hero')).getBoundingClientRect().height);
    ok(h < 90, 'if_werkzeug: Hero schlank (' + Math.round(h) + 'px < 90px)');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
  ok((await disp(page, '.hero-in .hero-sub')) !== 'none', 'if_werkzeug Desktop: Untertitel sichtbar');
  await ctx.close();
}
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/sb_zirkulation.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  ok((await disp(page, '.gema-hero-sub')) === 'none', 'sb_zirkulation: .gema-hero-sub ausgeblendet (Regression)');
  ok((await disp(page, '.gema-hero-norm')) === 'none', 'sb_zirkulation: Norm-Badge ausgeblendet (Regression)');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
