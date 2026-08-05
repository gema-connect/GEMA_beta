// Frischwasserstation — Playwright-Smoke der Kaskaden-Auslegung (Abschnitt 7):
// Toggle/Sichtbarkeit, Blatt-Szenario (Altersheim 50 Betten, 4-Kaskade mit
// separater Zirkulationsstation, HL 55 kW, Primär 60/42 °C), Ergebnis-Zeilen,
// SVG-Schema (Stationen W1..Wn + Z, Speicherzonen mit Ein/Aus-Fühlern,
// 🔥-Chips, klickbare Chips, nur literale Farben), V2-Umschaltung, AutoSave-
// Persistenz der fwk_*-Felder und Kaskaden-Werte im Anlagenwahl-Payload.
// Aufruf: CHROME=<chromium> node scripts/fws_kaskade_smoke_test.mjs
// Optional SHOT_DIR=<dir> → Screenshots der Karte + beider Schema-Varianten.
import { chromium } from 'playwright-core';
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOT = process.env.SHOT_DIR || '';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await wireRoutes(ctx);
const st = seed(['role_planer']);
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/sa_frischwasserstation.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);

console.log('■ Toggle & Sichtbarkeit');
ok(await page.$('#fwKaskadeCard') !== null, 'Kaskaden-Karte vorhanden');
// Feedback 05.08.2026: das Schema ist das STANDARD-Anlagenschema und immer sichtbar —
// ohne aktive Kaskade mit EINER Station gezeichnet. Nur der Eingabe-Body ist versteckt.
ok(await page.$eval('#fwkSchemaCard', e => getComputedStyle(e).display !== 'none'), 'Schema-Karte auch ohne Kaskade sichtbar');
ok(await page.$$eval('#fwkSchema svg', n => n.length) === 1, 'Schema ohne Kaskade gezeichnet');
ok(await page.evaluate(() => Array.from(document.querySelectorAll('#fwkSchema text')).filter(t => /^(FWS|W\d)$/.test(t.textContent)).length === 1), 'ohne Kaskade genau EINE Station');
ok(await page.$eval('#fwkBody', e => getComputedStyle(e).display === 'none'), 'Kaskaden-Body versteckt solange aus');

// Daten in Anlehnung ans Lösungsblatt: Altersheim/Pflegeheim 50 Betten,
// Zirkulation 302 l/h, gewählter Volumenstrom 80 l/min, Kaltwasser 15 °C.
await page.evaluate(() => {
  const sel = document.querySelector('#fwNutzBody select[data-k="ne"]');
  const idx = Array.from(sel.options).findIndex(o => /Altersheim- und Pflegeheim/.test(o.textContent));
  sel.value = String(idx); sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(150);
await page.evaluate(() => {
  const set = (q, v) => { const el = document.querySelector(q); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  set('#fwNutzBody input[data-k="n"]', '50');
  set('#fw_verlust', '25');
  set('#fw_zirkV', '302');
  set('#fw_vGewaehlt', '80');
  set('#fw_tkw', '15');
});
await page.waitForTimeout(300);

await page.evaluate(() => { const c = document.getElementById('fwk_on'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForTimeout(300);
ok(await page.$eval('#fwkBody', e => getComputedStyle(e).display !== 'none'), 'Kaskaden-Body sichtbar nach Toggle');
ok(await page.$eval('#fwkSchemaCard', e => getComputedStyle(e).display !== 'none'), 'Schema-Karte sichtbar nach Toggle');
ok(await page.$$eval('#fwkSchema svg', n => n.length) === 1, 'Kaskaden-SVG gezeichnet');

console.log('■ Blatt-Szenario V1: 4 Stationen, separate Zirkulationsstation');
await page.evaluate(() => {
  const set = (q, v, ev) => { const el = document.querySelector(q); el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };
  set('#fwk_n', '4', 'change');
  set('#fwk_sep', 'ja', 'change');
  set('#fwk_hl', '55');
  set('#fwk_primVl', '60');
  set('#fwk_primRl', '42');
});
await page.waitForTimeout(400);

const out = await page.evaluate(() => Object.fromEntries(
  ['fwk_out_nlade', 'fwk_out_pst', 'fwk_out_vst', 'fwk_out_mprim', 'fwk_out_td', 'fwk_out_plade',
   'fwk_out_ladungen', 'fwk_out_vsteuer', 'fwk_out_vspeicher']
  .map(i => [i, (document.getElementById(i) || {}).textContent || ''])));
ok(/3 Ladestation/.test(out.fwk_out_nlade) && /Zirkulationsstation Z/.test(out.fwk_out_nlade), 'Aufteilung V1: 3 Ladestationen + Z');
ok(/\d\.\d{2} kW/.test(out.fwk_out_pst), 'Leistung je Station mit 2 NK (' + out.fwk_out_pst + ')');
ok(/l\/min/.test(out.fwk_out_vst) && /l\/s/.test(out.fwk_out_vst), 'Volumenstrom je Station');
ok(/kg\/h/.test(out.fwk_out_mprim), 'Primär-Massenstrom (' + out.fwk_out_mprim + ')');
ok(/h\/d/.test(out.fwk_out_td) && /kW/.test(out.fwk_out_plade), 'Ladedauer + Ladeleistung');
ok(/×\/d/.test(out.fwk_out_ladungen) && / l$/.test(out.fwk_out_vsteuer), 'Ladungen + Steuervolumen');
ok(/ l$/.test(out.fwk_out_vspeicher), 'Speicher-Vorschlag (' + out.fwk_out_vspeicher + ')');

console.log('■ SVG-Schema');
const txt = await page.evaluate(() => Array.from(document.querySelectorAll('#fwkSchema text')).map(t => t.textContent));
ok(txt.some(t => /Heizungsseite/.test(t)) && txt.some(t => /Sanitärseite/.test(t)), 'Seiten-Beschriftung primär/sekundär');
ok(txt.some(t => t === 'W1') && txt.some(t => t === 'W3') && txt.some(t => t === 'Z'), 'Stationen W1..W3 + Z');
ok(txt.some(t => /Pufferspeicher/.test(t)) && txt.some(t => /Wärme-/.test(t)), 'Pufferspeicher + Wärmeerzeuger');
ok(txt.some(t => /Spitze/.test(t)) && txt.some(t => /Steuer/.test(t)) && txt.some(t => /Reserve/.test(t)), 'Speicherzonen Spitze/Steuer/Reserve');
ok(txt.some(t => t === 'Ein') && txt.some(t => t === 'Aus'), 'Fühler Ein/Aus an den Zonengrenzen');
ok(txt.some(t => /🔥 VL 60 °C/.test(t)) && txt.some(t => /🔥 RL 42 °C/.test(t)), '🔥 VL/RL-Chips (Heizungsplaner)');
ok(txt.some(t => /Ladeleistung/.test(t)), 'Ladeleistung-Chip');
ok(txt.some(t => /Zirkulation 302/.test(t)), 'Zirkulations-Chip');
ok(txt.some(t => /Heizungsplaner/.test(t)), '🔥-Legende');
ok(!/var\(--/.test(await page.evaluate(() => document.getElementById('fwkSchema').innerHTML)), 'nur literale Farben (GemaPDF-Regel)');

await page.evaluate(() => { document.querySelector('#fwkSchema [data-fwziel="fwk_primVl"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
await page.waitForTimeout(250);
ok(await page.evaluate(() => document.getElementById('fwk_primVl').classList.contains('fw-puls')), 'Chip-Klick pulsiert das Eingabefeld');

if (SHOT) {
  await (await page.$('#fwKaskadeCard')).screenshot({ path: SHOT + '/smoke_v1_karte.png' });
  await (await page.$('#fwkSchemaCard')).screenshot({ path: SHOT + '/smoke_v1_schema.png' });
}

console.log('■ V2 + Persistenz + Payload');
await page.evaluate(() => {
  const set = (q, v) => { const el = document.querySelector(q); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  set('#fwk_sep', 'nein'); set('#fwk_n', '6');
});
await page.waitForTimeout(350);
const txt2 = await page.evaluate(() => Array.from(document.querySelectorAll('#fwkSchema text')).map(t => t.textContent));
ok(txt2.some(t => t === 'W6') && !txt2.some(t => t === 'Z'), 'V2 mit 6 Stationen, ohne Z');
if (SHOT) await (await page.$('#fwkSchemaCard')).screenshot({ path: SHOT + '/smoke_v2_schema.png' });

await page.evaluate(() => GemaAutoSave.save()); // Debounce (5 s) überspringen
await page.waitForTimeout(300);
const snap = await page.evaluate(() => { const k = Object.keys(localStorage).find(x => /^gema_frischwasserstation/.test(x)); return k ? localStorage.getItem(k) : ''; });
ok(/"fwk_on":true/.test(snap) && /"fwk_hl":"55"/.test(snap) && /"fwk_n":"6"/.test(snap), 'AutoSave persistiert fwk_*-Felder');

const pay = await page.evaluate(() => ({ aktiv: typeof fwkActive === 'function' && fwkActive(), k: window._fwkLast ? { n: _fwkLast.n, p: _fwkLast.pStation } : null }));
ok(pay.aktiv && pay.k && pay.k.n === 6 && pay.k.p > 0, 'Kaskaden-State für den Anlagenwahl-Payload verfügbar');

// Aus-Toggle: Schema bleibt sichtbar und fällt auf EINE Station zurück,
// der Kaskaden-State für die Offertanfrage wird geräumt.
await page.evaluate(() => { const c = document.getElementById('fwk_on'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForTimeout(250);
ok(await page.$eval('#fwkSchemaCard', e => getComputedStyle(e).display !== 'none'), 'Aus-Toggle lässt das Anlagenschema stehen');
ok(await page.$eval('#fwkBody', e => getComputedStyle(e).display === 'none'), 'Aus-Toggle versteckt den Kaskaden-Body');
ok(await page.evaluate(() => Array.from(document.querySelectorAll('#fwkSchema text')).filter(t => /^(FWS|W\d)$/.test(t.textContent)).length === 1), 'Schema fällt auf EINE Station zurück');
ok(await page.evaluate(() => window._fwkLast === null), 'Kaskaden-State für die Offertanfrage geräumt');

ok(errors.length === 0, 'keine JS-Fehler (' + errors.slice(0, 3).join(' | ') + ')');

await ctx.close(); await browser.close(); server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
