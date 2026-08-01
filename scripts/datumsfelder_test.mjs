#!/usr/bin/env node
/* Datums-/Zeitfelder — Überlauf-Schutz in ALLEN Dialogen: Drift-Guard
 *
 * Symptom (iPhone/Android): `<input type="date">` ragt aus dem Dialog und
 * schiebt sich über das Nachbarfeld.
 *
 * Ursache (browser-unabhängig, auf iOS nur ausgeprägter): Das native
 * Datumsfeld hat eine grosse Inhalts-Mindestbreite (min-content). Ein
 * Flex-/Grid-Container hat per Default `min-width:auto` und kann deshalb
 * NICHT unter diese Breite schrumpfen — die Zeile wird breiter als der
 * Dialog. Auf iOS kommt dazu, dass das Control width:100% ignoriert und
 * seine Shadow-Teile eigenes Padding mitbringen.
 *
 * Fix: gema_responsive.css Abschnitt 17 — zwei Schichten:
 *   (a) global  — box-sizing/max-width/min-width am Feld + min-width:0 am
 *                 Container (via :has()). Verhindert den Überlauf.
 *   (b) Touch   — appearance:none + Padding-Resets der WebKit-Shadow-Teile.
 *                 Bewusst NICHT am Desktop: dort änderte es bei Feldern mit
 *                 height:auto die Höhe um 1–2 px.
 *
 * Die Seitenliste wird aus dem Repo GELESEN — neue Module sind automatisch
 * abgedeckt, ohne dass dieser Test angefasst werden muss.
 *
 * Ausführen: CHROME=<chromium> node scripts/datumsfelder_test.mjs
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed } from './rolematrix_harness.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CSS = readFileSync(join(ROOT, 'gema_responsive.css'), 'utf8');
const DATE_SEL = 'input[type="date"],input[type="datetime-local"],input[type="time"],input[type="month"],input[type="week"]';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ FAIL: ' + label); }
}

// ── A) Die zentrale Regel steht (und steht zentral) ───────────────
console.log('— A) gema_responsive.css Abschnitt 17 —');
{
  // Ab dem KOMMENTAR-Anfang schneiden, sonst fehlt dem Stripper unten das «/*»
  const sec = CSS.slice(CSS.lastIndexOf('/*', CSS.indexOf('17. DATUMS')));
  ok(CSS.includes('17. DATUMS'), 'Abschnitt 17 vorhanden');
  ok(/input\[type="date"\][\s\S]{0,400}?min-width:\s*0/.test(sec), 'Feld: min-width:0');
  ok(/input\[type="date"\][\s\S]{0,400}?max-width:\s*100%/.test(sec), 'Feld: max-width:100%');
  ok(/input\[type="date"\][\s\S]{0,400}?box-sizing:\s*border-box/.test(sec), 'Feld: box-sizing:border-box');
  ok(/:where\([\s\S]{0,300}?:has\(>\s*input\[type="date"\]\)/.test(sec), 'Container: :has() → min-width:0');
  ok(/:where\(/.test(sec), 'Container-Regel via :where() (Spezifität 0 — Seiten-Regeln gewinnen)');
  // (b) muss in der Touch-Media-Query liegen, NICHT global
  const mq = sec.slice(sec.indexOf('@media (hover: none) and (pointer: coarse)'));
  ok(sec.includes('@media (hover: none) and (pointer: coarse)'), 'Touch-Media-Query vorhanden');
  ok(/appearance:\s*none/.test(mq), 'appearance:none liegt IN der Touch-Query');
  // Kommentare rausschneiden — der Erklärtext nennt die Regeln beim Namen
  const ohneKommentar = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
  const vorMq = ohneKommentar(sec.slice(0, sec.indexOf('@media (hover: none)')));
  ok(!/appearance:\s*none/.test(vorMq), 'appearance:none NICHT global (Desktop-Höhen bleiben)');
  ok(!/date-and-time-value/.test(vorMq), 'WebKit-Shadow-Regeln NICHT global');
  ok(/date-and-time-value[\s\S]{0,300}?text-align:\s*left/.test(mq), 'Wert linksbündig (Touch)');
  ok(/::-webkit-datetime-edit\b[\s\S]{0,200}?padding:\s*0/.test(mq), 'datetime-edit padding:0 (Touch)');
}

// ── B) Mechanismus: reproduziert der Fix den Fehler weg? ──────────
console.log('— B) Überlauf-Mechanismus (enge 2-Spalten-Zeile) —');
const browser = await chromium.launch({ executablePath: CHROME });
{
  const c = await browser.newContext({ viewport: { width: 393, height: 800 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  const markup = withFix => `<style>
    body{margin:0;font:16px sans-serif}
    .dlg{width:260px;border:2px solid #333;padding:8px;box-sizing:border-box}
    .row{display:flex;gap:10px}
    .fg{display:flex;flex-direction:column;flex:1}
    .fg input{width:100%;height:44px;padding:0 12px;border:1.5px solid #999;border-radius:8px;font-size:16px}
  </style>${withFix ? '<style>' + CSS + '</style>' : ''}
  <div class="dlg"><div class="row">
    <div class="fg"><label>Von</label><input type="date" id="a" value="2026-08-01"></div>
    <div class="fg"><label>Bis</label><input type="date" id="b" value="2026-08-31"></div>
  </div></div>`;
  const measure = async withFix => {
    await p.setContent(markup(withFix)); await p.waitForTimeout(150);
    return p.evaluate(() => {
      const dlg = document.querySelector('.dlg').getBoundingClientRect();
      const b = document.getElementById('b').getBoundingClientRect();
      const a = document.getElementById('a').getBoundingClientRect();
      return { ausDialog: Math.round(b.right - dlg.right), aW: Math.round(a.width) };
    });
  };
  const ohne = await measure(false), mit = await measure(true);
  ok(ohne.ausDialog > 20, 'ohne Fix ragt das Feld aus dem Dialog (' + ohne.ausDialog + 'px) — Fehler reproduziert');
  ok(mit.ausDialog <= 0, 'mit Fix bleibt das Feld im Dialog (' + mit.ausDialog + 'px)');
  ok(mit.aW < ohne.aW, 'Feld darf schrumpfen (' + ohne.aW + 'px → ' + mit.aW + 'px)');
  await c.close();
}

// ── C) Sweep über ALLE Seiten mit Datumsfeldern ───────────────────
console.log('— C) Alle Seiten mit Datumsfeldern (iPhone-Viewport) —');
const seiten = readdirSync(ROOT)
  .filter(f => f.endsWith('.html'))
  .filter(f => /type="(date|datetime-local|month|time|week)"/.test(readFileSync(join(ROOT, f), 'utf8')))
  .sort();
ok(seiten.length > 40, 'Seitenliste aus dem Repo gelesen — ' + seiten.length + ' Seiten');

const server = await startServer();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith(BASE)) return r.continue();
  if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0) return r.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
  if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
    return r.fulfill({ contentType: 'application/json', body: r.request().method() === 'GET' ? '[]' : '{}' });
  }
  return r.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed(['role_admin']));

let felder = 0, riskant = 0, ueberlauf = 0, mqFehlt = 0;
const treffer = [];
for (const s of seiten) {
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + '/' + s, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    // Dialoge sichtbar machen — die meisten Datumsfelder leben in Modals
    await page.addStyleTag({ content: '.modal-bg,.modal-overlay,.modal,[class*="modal"],[id*="odal"]{display:block!important;visibility:visible!important;opacity:1!important}' });
    await page.waitForTimeout(200);
    if (!await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches)) mqFehlt++;
    const r = await page.evaluate(sel => {
      const o = { n: 0, risky: [], over: [] };
      document.querySelectorAll(sel).forEach(el => {
        o.n++;
        const cs = getComputedStyle(el), par = el.parentElement;
        const pcs = par ? getComputedStyle(par) : null;
        const gp = par && par.parentElement ? getComputedStyle(par.parentElement) : null;
        const parIsItem = gp && (gp.display.includes('flex') || gp.display.includes('grid'));
        const bad = [];
        if (cs.boxSizing !== 'border-box') bad.push('box-sizing');
        if (cs.appearance !== 'none' && cs.webkitAppearance !== 'none') bad.push('appearance');
        if (cs.maxWidth === 'none' && cs.width !== '100%') bad.push('kein-width-cap');
        if (parIsItem && pcs.minWidth === 'auto') bad.push('parent-min-width');
        if (bad.length) o.risky.push((el.id || el.name || '?') + ':' + bad.join('+'));
        const rc = el.getBoundingClientRect();
        if (rc.width && par && rc.right - par.getBoundingClientRect().right > 1) o.over.push(el.id || '?');
      });
      return o;
    }, DATE_SEL);
    felder += r.n; riskant += r.risky.length; ueberlauf += r.over.length;
    if (r.risky.length || r.over.length) treffer.push(s + ' → ' + [...r.risky, ...r.over.map(x => x + ':ÜBERLAUF')].slice(0, 4).join(', '));
  } catch (e) { treffer.push(s + ' → LADEFEHLER ' + e.message.slice(0, 50)); }
  await page.close();
}
ok(felder > 100, felder + ' Datumsfelder geprüft');
ok(mqFehlt === 0, 'Touch-Media-Query greift auf allen Seiten');
ok(riskant === 0, 'kein Feld mit Risiko-Merkmal' + (riskant ? ' — ' + riskant : ''));
ok(ueberlauf === 0, 'kein Feld ragt über seinen Container' + (ueberlauf ? ' — ' + ueberlauf : ''));
if (treffer.length) treffer.slice(0, 12).forEach(t => console.log('      ! ' + t));

// ── D) Desktop bleibt unangetastet ────────────────────────────────
console.log('— D) Desktop: natives Rendering unverändert —');
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.setContent('<style>' + CSS + '</style><input type="date" id="d" value="2026-08-01" style="height:auto">');
  await p.waitForTimeout(150);
  const d = await p.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('d'));
    return { app: cs.appearance || cs.webkitAppearance, box: cs.boxSizing, max: cs.maxWidth, min: cs.minWidth };
  });
  ok(d.app !== 'none', 'appearance am Desktop NICHT überschrieben (' + d.app + ')');
  ok(d.box === 'border-box', 'box-sizing greift auch am Desktop');
  ok(d.max === '100%', 'max-width greift auch am Desktop');
  await c.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
await server.close();
process.exit(fail ? 1 : 0);
