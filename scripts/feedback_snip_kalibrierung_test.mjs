// Drift-Guard: Snip-Ausschnitt wird GEMESSEN, nicht angenommen
// (Bugreport 05.08.2026 «bei mehreren Modulen wird der falsche Ausschnitt
//  generiert»).
//
// Hintergrund: Der Zuschnitt rechnete Bildpunkt = Viewport-Punkt × scale.
// Diese Annahme gilt nur, solange html2canvas den erfassten Bereich exakt so
// legt und exakt so skaliert, wie angefragt. Das tut es nicht zuverlässig —
// `body` trägt global position:relative + overflow-x:clip, Module bringen
// sticky/fixed Leisten mit, und der Geräte-Pixelratio geht je nach Pfad
// zusätzlich ein. Weicht die Lage um ein paar Pixel ab, schneidet der Snip
// daneben, ohne dass es jemand merkt.
//
// Der Fix legt vor dem Erfassen zwei Kalibrier-Marken an bekannte
// Viewport-Punkte; im Bild gefunden liefern sie Versatz UND tatsächliche
// Skalierung. Genau das prüft dieser Test — mit einem GESTUBBTEN html2canvas,
// das absichtlich falsch liegt (Versatz + andere Skalierung). Damit läuft der
// Test ohne die CDN-Bibliothek und misst trotzdem geometrisch.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_snip_kalibrierung_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';
import { readFileSync, readdirSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ Teil A — statisch ═══════════════════════════════════════════════════ */
console.log('■ A: gema_feedback.js — Kalibrierung vorhanden');
const FB = readFileSync('gema_feedback.js', 'utf8');
ok('Marken werden gesetzt (_calAn)', /_calAn\s*\(/.test(FB) && /rgb\(255,0,255\)/.test(FB));
ok('Marken werden gemessen (_calMessen)', /_calMessen\s*\(/.test(FB) && /getImageData/.test(FB));
ok('Marken werden wieder herausgemalt (_calWeg)', /_calWeg\s*\(/.test(FB));
ok('Marken werden IMMER entfernt (auch im Fehlerfall)', (FB.match(/_calAus\(/g) || []).length >= 3);
ok('Zuschnitt rechnet mit der Messung, nicht mit der Annahme',
  /cal\.sc\s*\+\s*cal\.offX/.test(FB) && /cal\.sc\s*\+\s*cal\.offY/.test(FB));
ok('Fallback auf die alte Annahme, wenn nichts gemessen wurde',
  /_gfbCal\s*\|\|\s*\{\s*offX:\s*0,\s*offY:\s*0,\s*sc:\s*sc\s*\}/.test(FB));
ok('Spannweite ohne Scrollbalken (clientWidth)', /_calSpanne[\s\S]{0,220}clientWidth/.test(FB));

/* ═══ Teil B — geometrisch im Browser ═════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

/** html2canvas-Stub: zeichnet den Viewport als synthetisches Bild — absichtlich
 *  mit VERSATZ und ANDERER Skalierung als angefragt. Ein Zuschnitt, der die
 *  Anfrage-Werte glaubt, landet damit garantiert daneben. */
function stubQuelle(versatzX, versatzY, echtScale) {
  return `
window.__h2cCalls = 0;
window.html2canvas = function(el, opts){
  window.__h2cCalls++;
  var VX = ${versatzX}, VY = ${versatzY}, S = ${echtScale};
  var vw = opts.width, vh = opts.height;
  var c = document.createElement('canvas');
  c.width = Math.round(vw * S) + VX;
  c.height = Math.round(vh * S) + VY;
  var x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0,0,c.width,c.height);
  // Jeden sichtbaren Testklotz an SEINER Viewport-Position abbilden
  document.querySelectorAll('[data-probe]').forEach(function(p){
    var r = p.getBoundingClientRect();
    x.fillStyle = getComputedStyle(p).backgroundColor;
    x.fillRect(Math.round(r.left*S)+VX, Math.round(r.top*S)+VY, Math.round(r.width*S), Math.round(r.height*S));
  });
  // Die Kalibrier-Marken ebenso (sie sind echte DOM-Knoten)
  var lay = document.getElementById('_gfbcal');
  if (lay) Array.prototype.forEach.call(lay.children, function(s){
    var r = s.getBoundingClientRect();
    x.fillStyle = 'rgb(255,0,255)';
    x.fillRect(Math.round(r.left*S)+VX, Math.round(r.top*S)+VY, Math.round(r.width*S), Math.round(r.height*S));
  });
  return Promise.resolve(c);
};`;
}

/** Snip auf dem Testklotz ausführen und die MITTELFARBE des Ergebnisses lesen. */
async function snip(page, probeSel) {
  return await page.evaluate(async (sel) => {
    const p = document.querySelector(sel);
    const r = p.getBoundingClientRect();
    // Feedback-Snip starten und die Auswahl exakt auf den Klotz legen
    GemaFeedback.start();
    await new Promise(res => setTimeout(res, 60));
    const ov = document.getElementById('gfb-overlay');
    const ev = (t, x, y) => ov.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, button: 0, bubbles: true }));
    ev('mousedown', r.left + 2, r.top + 2);
    ev('mousemove', r.right - 2, r.bottom - 2);
    ov.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise(res => setTimeout(res, 260));
    const img = document.querySelector('#gfb-annot img, #gfb-annot canvas');
    const src = (window.__gfbHooks && window.__gfbHooks.shot) ? '' : '';
    // Mittelpunkt des erzeugten Bildes auslesen
    const dataUrl = document.getElementById('gfb-annot-img')
      ? document.getElementById('gfb-annot-img').src
      : (window._gfbHooks && window._gfbHooks.dataUrl ? window._gfbHooks.dataUrl() : '');
    return await new Promise(res => {
      if (!dataUrl) { res(null); return; }
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const cx = c.getContext('2d');
        cx.drawImage(im, 0, 0);
        const d = cx.getImageData(Math.floor(im.width / 2), Math.floor(im.height / 2), 1, 1).data;
        res({ w: im.width, h: im.height, rgb: [d[0], d[1], d[2]] });
      };
      im.onerror = () => res(null);
      im.src = dataUrl;
    });
  }, probeSel);
}

/** Testseite: drei farbige Klötze nebeneinander. Wird der falsche Ausschnitt
 *  genommen, liest der Test die Farbe des NACHBARN — der Fehler ist damit
 *  nicht zu übersehen. */
const SEITE = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Snip-Test</title>
<style>body{margin:0;position:relative;overflow-x:clip;font-family:sans-serif}
.probe{position:absolute;width:150px;height:150px}
#p1{left:60px;top:120px;background:rgb(220,20,20)}
#p2{left:230px;top:120px;background:rgb(20,180,20)}
#p3{left:400px;top:120px;background:rgb(20,20,220)}
.hoch{height:2400px}</style></head><body>
<div class="hoch"></div>
<div class="probe" data-probe id="p1"></div>
<div class="probe" data-probe id="p2"></div>
<div class="probe" data-probe id="p3"></div>
<script src="gema_feedback.js"></script>
<script>document.addEventListener('DOMContentLoaded',function(){GemaFeedback.init('snip_test','Snip-Test');});</script>
</body></html>`;

async function lauf(titel, versatzX, versatzY, echtScale, erwartet) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(seedFn => { }, {});
  await ctx.route('**/snip_test.html', route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: SEITE }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/snip_test.html', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: stubQuelle(versatzX, versatzY, echtScale) });
  await page.waitForTimeout(200);

  const res = await snip(page, '#p2');
  const nah = (a, b) => Math.abs(a - b) <= 40;
  const trefferFarbe = res && nah(res.rgb[0], erwartet[0]) && nah(res.rgb[1], erwartet[1]) && nah(res.rgb[2], erwartet[2]);
  ok(titel + ' → richtiger Ausschnitt (grüner Klotz)', trefferFarbe, res && res.rgb);
  ok(titel + ' → keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  const rest = await page.evaluate(() => !!document.getElementById('_gfbcal'));
  ok(titel + ' → Kalibrier-Marken wieder entfernt', rest === false);
  await ctx.close();
}

console.log('\n■ B: Zuschnitt trifft, auch wenn die Erfassung daneben liegt');
/* Der grüne Klotz (#p2) ist das Ziel; links davon liegt der rote (#p1), genau
   170 px entfernt. Ein Versatz von 255 Bildpunkten (= 170 px × 1.5) verschiebt
   den Inhalt um exakt einen Klotz: ohne Kalibrierung liest der Zuschnitt den
   ROTEN — der Fehler ist damit nicht zu übersehen (per Gegenprobe belegt). */
await lauf('ohne Versatz, Skala wie angefragt', 0, 0, 1.5, [20, 180, 20]);
await lauf('Versatz um genau einen Klotz (255/0)', 255, 0, 1.5, [20, 180, 20]);
await lauf('Versatz 12/8 UND andere Skala (2.0 statt 1.5)', 12, 8, 2.0, [20, 180, 20]);

/* ═══ Teil C — jedes Modul kann snippen ═══════════════════════════════════ */
console.log('\n■ C: alle Module — Feedback initialisiert (sonst ist der Knopf tot)');
const MODULE = readdirSync('.')
  .filter(f => /^(sa_|sb_|hz_|lt_|el_|br_|pm_|if_|hy_|sd_|sp_|sv_|iv_|ab_|sys_)[a-z0-9_]*\.html$/.test(f))
  .filter(f => readFileSync(f, 'utf8').includes('gema_feedback.js'));
let ohneInit = [];
for (const f of MODULE) {
  const src = readFileSync(f, 'utf8');
  if (!/GemaFeedback\.init\s*\(/.test(src)) ohneInit.push(f);
}
ok('jedes Modul mit Feedback-Knopf ruft GemaFeedback.init (' + MODULE.length + ' Module)',
  ohneInit.length === 0, ohneInit);

await browser.close();
server.close();
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
