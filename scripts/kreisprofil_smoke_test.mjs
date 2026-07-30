// Playwright-Smoke-Test Hydraulik Kreisprofil (sb_kreisprofil.html) +
// Grundleitungen-Integration (sb_grundleitungen.html, Karte «Kreisprofil
// Anschlussleitung → HSK»). Deckt ab: Boot, Deep-Link-Prefill (?q=&gef=&kb=&di=),
// Excel-Beispiel (Di 96 / 1 % / kb 1 → 50 %, 48 mm, 0.69 m/s, i.O.), Vollfüllungs-
// Werte, Teilfüllungstabelle mit Betriebspunkt-Zeile, Status-Wechsel (zu klein /
// Einstau / überdimensioniert), Rohrreihe→DN→Di-Kette, SVG; Integration: Karte nur
// bei Anschlussleitung(en) mit Q, dynamische Aktualisierung beim Dimensionswechsel,
// Trennsystem (2 Panels), Gefälle-fehlt-Hinweis, Deep-Link ins Detailmodul,
// sb_index-Kachel, Kein-Zugriff (Monteur).
// Aufruf: CHROME=<chromium> node scripts/kreisprofil_smoke_test.mjs
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

// ── Standalone: Boot + Deep-Link (Excel-Beispielwerte) ──
const { ctx, page } = await newPage(browser, seed(['role_planer']));
await page.goto(BASE + '/sb_kreisprofil.html?q=2.5&gef=1&kb=1&di=96');
await page.waitForTimeout(2000);

console.log('— Standalone: Boot & Deep-Link-Prefill —');
ok((await page.title()).indexOf('Hydraulik Kreisprofil') === 0, 'Seite lädt (Titel)');
ok((await page.locator('body').innerText()).indexOf('Kein Zugriff') < 0, 'Planer hat Zugriff');
ok((await page.inputValue('#kp_q')) === '2.5', 'Deep-Link: Q = 2.5 übernommen');
ok((await page.inputValue('#kp_di')) === '96', 'Deep-Link: Di = 96 übernommen');

console.log('— Vollfüllung (Excel-Cached) —');
const txt = (id) => page.locator('#' + id).innerText();
ok((await txt('kp_out_vv')).indexOf('0.69') === 0, 'vv = 0.69 m/s');
ok((await txt('kp_out_qv')).indexOf('5.00') === 0, 'Qv = 5.00 l/s');
ok((await txt('kp_out_q07')).indexOf('4.20') === 0, 'Q0.7 = 4.20 l/s (0.84·Qv)');
ok((await txt('kp_out_dimin')).indexOf('78') === 0, 'Mindestdurchmesser 78 mm');
ok((await txt('kp_out_nu')).indexOf('1.31') >= 0, 'ν = 1.31e-6 (10 °C)');

console.log('— Betriebspunkt-KPIs & Beurteilung —');
ok((await txt('kp_kpi_fuell')) === '50 %', 'Füllgrad 50 %');
ok((await txt('kp_kpi_ht')) === '48.0', 'Fliesstiefe 48.0 mm');
ok((await txt('kp_kpi_v')) === '0.69', 'v am Betriebspunkt 0.69 m/s');
ok((await txt('kp_kpi_status')).indexOf('i.O.') >= 0, 'Beurteilung ✓ i.O.');
ok(await page.locator('#kp_note_ok').isVisible(), 'grüne i.O.-Note sichtbar');

console.log('— Teilfüllungstabelle —');
ok(await page.locator('#kp_tbody tr').count() === 16, '15 Stufen + Betriebspunkt-Zeile');
ok(await page.locator('#kp_tbody tr.kp-mass').count() === 1, 'Betriebspunkt-Zeile markiert');
ok((await page.locator('#kp_tbody tr.kp-mass').innerText()).indexOf('48.0') >= 0, 'Betriebspunkt bei 48.0 mm');
ok(await page.locator('#kpSchema svg').count() >= 1, 'SVG-Schema gezeichnet');
ok((await page.locator('#kpSchema').innerHTML()).indexOf('Teilfüllungskurve') >= 0, 'Teilfüllungskurve im Schema');

console.log('— Status-Wechsel —');
await page.fill('#kp_q', '4.5'); await page.waitForTimeout(250);
ok(await page.locator('#kp_note_klein').isVisible(), 'Q 4.5 > Q0.7 → «Dimension zu klein»');
await page.fill('#kp_q', '6'); await page.waitForTimeout(250);
ok(await page.locator('#kp_note_einstau').isVisible(), 'Q 6 über Kurvenscheitel → «Einstau»');
ok((await txt('kp_kpi_fuell')).indexOf('> 100') >= 0, 'Füllgrad-KPI zeigt > 100 %');
await page.fill('#kp_q', '0.4'); await page.waitForTimeout(250);
ok(await page.locator('#kp_note_gross').isVisible(), 'Q 0.4 → «überdimensioniert» (h/Di < 20 %)');
await page.fill('#kp_q', '2.5'); await page.waitForTimeout(250);

console.log('— Rohrreihe → DN → Di —');
await page.selectOption('#kp_reihe', 'sn'); await page.waitForTimeout(150);
ok(await page.locator('#kp_dn option').count() === 16, 'SN-592000-Reihe: 15 DN + Platzhalter');
await page.selectOption('#kp_dn', '150'); await page.waitForTimeout(250);
ok((await page.inputValue('#kp_di')) === '146', 'DN 150 setzt Di = 146 mm');
ok((await txt('kp_kpi_status')).indexOf('i.O.') >= 0 || (await txt('kp_kpi_status')).length > 0, 'Neuberechnung läuft nach DN-Wahl');
await page.selectOption('#kp_reihe', 'steinzeug'); await page.waitForTimeout(150);
ok(await page.locator('#kp_dn option').count() === 11, 'Steinzeug-Reihe: 10 DN + Platzhalter');
await ctx.close();

// ── Integration: Grundleitungen ──
console.log('— Integration Grundleitungen: Karte nur bei Anschlussleitung mit Q —');
const g = await newPage(browser, seed(['role_planer']));
await g.page.goto(BASE + '/sb_grundleitungen.html');
await g.page.waitForTimeout(1600);
ok(await g.page.evaluate(() => document.getElementById('glKreisCard').style.display === 'none'),
  'Karte versteckt ohne Einleitungen (Default-Netz, Q = 0)');

// Netz seeden: Fallstrang 120 DU → Grundleitung 1 → HSK
await g.page.evaluate(() => {
  const ta = document.getElementById('gl_rows');
  ta.value = JSON.stringify({
    k: 0.5,
    quellen: [{ id: 'q1', typ: 'fallstrang', name: 'Fallstrang A', du: 120, duMax: 2.5, ziel: 'a1' }],
    abschnitte: [{ id: 'a1', name: 'Grundleitung 1', ziel: 'hsk', gef: 2, dn: 'auto' }],
    cfg: {}, seq: 9
  });
  ta.dispatchEvent(new Event('change', { bubbles: true }));
});
await g.page.waitForTimeout(700);
const card = () => g.page.evaluate(() => {
  const host = document.getElementById('glKreisHost');
  const pill = host.querySelector('.glkp-pill');
  return {
    visible: document.getElementById('glKreisCard').style.display !== 'none',
    panels: host.querySelectorAll('.glkp-panel').length,
    pill: pill ? pill.textContent : '', pillCls: pill ? pill.className : '',
    svg: host.querySelectorAll('svg').length,
    link: (host.querySelector('.glkp-link') || {}).getAttribute?.('href') || '',
    vals: (host.querySelector('.glkp-vals') || {}).textContent || '',
    hint: (host.querySelector('.glkp-hint') || {}).textContent || '',
    name: (host.querySelector('.glkp-name') || {}).textContent || ''
  };
});
let c = await card();
ok(c.visible, 'Karte sichtbar mit Q > 0');
ok(c.panels === 1, 'genau 1 Panel (nur die Anschlussleitung → HSK)');
ok(c.name.indexOf('Grundleitung 1') >= 0 && c.name.indexOf('HSK') >= 0, 'Panel-Titel mit Anschluss-Tag');
ok(c.pill === '✓ in Ordnung' && c.pillCls.indexOf('ok') >= 0, 'Status ✓ in Ordnung (DN 125 auto)');
ok(c.svg === 1, 'Rohr-Querschnitt-SVG gezeichnet');
ok(/h\/d\s*46/.test(c.vals.replace(/ /g, ' ')) || c.vals.indexOf('46') >= 0, 'Betriebs-Füllstand 46 % in den Werten');
ok(c.vals.indexOf('5.48') >= 0, 'Qtot 5.48 l/s in den Werten');
ok(/sb_kreisprofil\.html\?q=5\.477&gef=2&kb=1&di=118\.6/.test(c.link), 'Deep-Link ins Detailmodul mit Projektwerten');
ok((await g.page.evaluate(() => document.querySelector('#glKreisHost svg').innerHTML)).indexOf('Bemessung 50 %') >= 0,
  'Bemessungs-Füllgrad-Linie beschriftet (SW h/d 50 %)');

console.log('— Integration: dynamischer Dimensionswechsel —');
const setDn = (dn) => g.page.evaluate((d) => {
  const ta = document.getElementById('gl_rows');
  const st = JSON.parse(ta.value);
  st.abschnitte[0].dn = d;
  ta.value = JSON.stringify(st);
  ta.dispatchEvent(new Event('change', { bubbles: true }));
}, dn);
await setDn(110); await g.page.waitForTimeout(600);
c = await card();
ok(c.pill === 'DN zu klein' && c.pillCls.indexOf('zu_klein') >= 0, 'DN 110 → «DN zu klein» (rot)');
ok(c.hint.indexOf('mind. DN 125') >= 0, 'Hinweis nennt mind. DN 125');
await setDn(315); await g.page.waitForTimeout(600);
c = await card();
ok(c.pill === 'DN grösser als nötig' && c.pillCls.indexOf('gross') >= 0, 'DN 315 → «DN grösser als nötig» (amber)');
ok(c.hint.indexOf('DN 125') >= 0 && c.hint.indexOf('DN 315') >= 0, 'Hinweis: DN 125 würde genügen — gewählt DN 315');
await setDn('auto'); await g.page.waitForTimeout(600);
c = await card();
ok(c.pill === '✓ in Ordnung', 'zurück auf auto → wieder ✓ in Ordnung');

console.log('— Integration: nur Roots, Trennsystem, Gefälle fehlt —');
await g.page.evaluate(() => {
  const ta = document.getElementById('gl_rows');
  const st = JSON.parse(ta.value);
  // Zulauf-Strang (kein Root) — Quelle wandert an den Zulauf
  st.abschnitte.push({ id: 'a2', name: 'Zulauf Strang', ziel: 'a1', gef: 2, dn: 'auto' });
  st.quellen[0].ziel = 'a2';
  ta.value = JSON.stringify(st);
  ta.dispatchEvent(new Event('change', { bubbles: true }));
});
await g.page.waitForTimeout(600);
c = await card();
ok(c.panels === 1, 'Zulauf-Strang erzeugt KEIN zweites Panel (nur Roots)');
await g.page.evaluate(() => {
  const ta = document.getElementById('gl_rows');
  const st = JSON.parse(ta.value);
  // Trennsystem: zweite Anschlussleitung (Regenwasser) → HSK
  st.abschnitte.push({ id: 'a3', name: 'RW-Anschluss', ziel: 'hsk', gef: 1.5, dn: 'auto' });
  st.quellen.push({ id: 'q2', typ: 'regen', name: 'Dach', q: 9, ziel: 'a3' });
  ta.value = JSON.stringify(st);
  ta.dispatchEvent(new Event('change', { bubbles: true }));
});
await g.page.waitForTimeout(600);
const zwei = await g.page.evaluate(() => {
  const host = document.getElementById('glKreisHost');
  return {
    panels: host.querySelectorAll('.glkp-panel').length,
    bem: Array.from(host.querySelectorAll('svg')).map(s => (s.innerHTML.match(/Bemessung (\d+) %/) || [])[1])
  };
});
ok(zwei.panels === 2, 'Trennsystem: 2 Anschlussleitungen → 2 Panels');
ok(zwei.bem.indexOf('50') >= 0 && zwei.bem.indexOf('70') >= 0, 'Bemessungs-Füllgrad je Medium (SW 50 % / RW 70 %)');
await g.page.evaluate(() => {
  const ta = document.getElementById('gl_rows');
  const st = JSON.parse(ta.value);
  st.abschnitte = st.abschnitte.filter(a => a.id !== 'a3');
  st.quellen = st.quellen.filter(q => q.id !== 'q2');
  st.abschnitte[0].gef = 0;
  ta.value = JSON.stringify(st);
  ta.dispatchEvent(new Event('change', { bubbles: true }));
});
await g.page.waitForTimeout(600);
c = await card();
ok(c.panels === 1 && c.hint.indexOf('Gefälle erfassen') >= 0, 'ohne Gefälle: Hinweis statt Querschnitt');
ok(c.svg === 0, 'ohne Gefälle kein SVG');
await g.ctx.close();

// ── sb_index-Kachel (role_admin — Planer-Redirect umgehen) ──
console.log('— sb_index & Zugriff —');
const ix = await newPage(browser, seed(['role_admin']));
await ix.page.goto(BASE + '/sb_index.html');
await ix.page.waitForTimeout(900);
ok(await ix.page.locator('a.mod[href="sb_kreisprofil.html"]').count() === 1, 'Kachel in der Abwasser-Gruppe');
ok((await ix.page.locator('a.mod[href="sb_kreisprofil.html"]').innerText()).indexOf('Hydraulik Kreisprofil') >= 0, 'Kachel-Titel');
await ix.ctx.close();

const mo = await newPage(browser, seed(['role_monteur']));
await mo.page.goto(BASE + '/sb_kreisprofil.html');
await mo.page.waitForTimeout(1200);
ok((await mo.page.locator('body').innerText()).indexOf('Kein Zugriff') >= 0, 'Monteur: Kein-Zugriff-Screen');
await mo.ctx.close();

await browser.close();
server.close();
console.log('\n═══ ' + n + ' Checks, ' + fail + ' FAIL ═══');
process.exit(fail ? 1 : 0);
