// QR-Scanner: Reichweite und Reaktionszeit (gema_qr_scanner.js).
//
// Hintergrund (Feedback 07.09.2026): «wenn man bei Trocknungsgeräten oder
// beim Werkzeug einen QR-Code scannen will, muss man immer enorm nahe dran
// gehen, bis er erkannt wird.»
//
// Ursache, gemessen am alten Stand: html5-qrcode dekodiert nicht das
// Kamerabild, sondern schneidet die qrbox aus dem <video> und zeichnet sie
// in ein Canvas, das genau so viele PIXEL hat, wie die qrbox CSS-PIXEL
// gross ist. Ein QR-Code belegt im Dekodier-Canvas also exakt so viele
// Pixel wie auf dem Bildschirm. Mit einem 300×300-Sucher und fixer
// 250er-qrbox mass dieses Canvas 300×225 — unabhaengig von der Kamera, die
// zudem im Browser-Default 640×480 lief.
//
// Gemessener Ausgangsstand (dieselbe Messung wie unten, Stand vor dem Fix):
//   Kamera 640×480 · Dekodier-Canvas 300×225 · ~8 Dekodier-Versuche/s
// Sollstand: Kamera in angeforderter Aufloesung, Dekodier-Canvas mindestens
// doppelt so gross auf der kurzen Seite (gemessen 486×486 → der Code darf
// halb so gross erscheinen, also rund doppelte Distanz), Versuchsrate NICHT
// schlechter.
//
// Deckt ab:
//  A) Statik: die vier Stellschrauben stehen wirklich im Code
//     (Aufloesung im Sucher-Format, entkoppelte Dekodier-Basis, nativer
//     BarcodeDetector, disableFlip) + sauberes Aufraeumen in stop().
//  B) Gemessen mit Fake-Kamera: angeforderte Aufloesung kommt an, das
//     Dekodier-Canvas ist quadratisch und mindestens doppelt so gross wie
//     frueher, die CSS-Skalierung veraendert clientWidth NICHT (darauf
//     beruht der ganze Trick), die Versuchsrate bleibt oben.
//  C) Sucher-Einpassung: das ganze Kamerabild ist sichtbar (kein Beschnitt),
//     zentriert, und passt sich der Buehne an.
//  D) Zoom/Licht erscheinen NUR, wenn die Kamera sie meldet (beide Faelle).
//  E) Aufraeumen: stop() beendet Kamera-Tracks und entfernt das Overlay;
//     ein zweiter scan() hinterlaesst kein zweites Overlay.
//  F) Echte Dekodierung: die Kamera wird aus einem Canvas gespeist, auf dem
//     ein echter Etiketten-QR liegt — die Kette bis zum Callback laeuft.
//
// Aufruf:  CHROME=<chromium> node scripts/qr_scan_reichweite_test.mjs
// Braucht html5-qrcode lokal (npm i --no-save html5-qrcode@2.3.8); fehlt es,
// wird die CDN-Version geladen (dann ist Netz noetig).
import { createServer } from 'http';
import { readFile, access } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8938;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const LIB = join(ROOT, 'node_modules/html5-qrcode/html5-qrcode.min.js');

// Werte des ALTEN Stands — die Messungen unten werden dagegen gehalten.
const ALT_CANVAS_KURZ = 225;
const ALT_KAMERA_BREITE = 640;
// Groesse des Testcodes im simulierten Kamerabild. Der Vergleich alt/neu
// steckt in Abschnitt B (exakt gemessene Geometrie) — Abschnitt F prueft, dass
// am Ende wirklich DEKODIERT wird und nicht nur die Zahlen stimmen. Darum ein
// Wert mit Abstand zur Erkennungsgrenze (die liegt in dieser Umgebung bei rund
// 170 px) statt einer Messung auf der Messerschneide.
const TEST_QR_PX = 220;

// QR-Matrix der Etiketten-URL, 33×33 Module (Version 4, Level M) — als
// Bitmuster eingebettet, damit der Test ohne QR-Bibliothek auskommt.
// Inhalt: https://gema.netlify.app/if_werkzeug.html?scan=tool_m2k9x4qz
const QR_URL = 'https://gema.netlify.app/if_werkzeug.html?scan=tool_m2k9x4qz';
const QR_MATRIX = [
  '111111100010110011111101001111111', '100000100011111110000100101000001',
  '101110101110010010011111001011101', '101110101110101101110011101011101',
  '101110101101000100011001001011101', '100000101011001100101010001000001',
  '111111101010101010101010101111111', '000000001100001000011101100000000',
  '101111100001011011010010101111100', '101011001000101010010001101101101',
  '111010111101100111101010010010110', '111100000101101010100100100011101',
  '101111110111100011011000110011001', '000011011100111010101111001001111',
  '100111100100100110100110011101110', '000000001001111100101111111111100',
  '010101110011010111011010110111001', '111000000111110111011011001101111',
  '001000100001101101100110011110110', '000000001100000010011110010111111',
  '011001111110010111100011010111001', '100000000111101010011111001001101',
  '101101101110101100101110010111110', '101100010011011110111101011011100',
  '100001100111001101110011111110011', '000000001101101011111100100010101',
  '111111100000011110101111101010110', '100000101100011100000101100011101',
  '101110101000010011010010111111000', '101110101100110001011001110011111',
  '101110101011000101001111101101000', '100000100010100100011101011010100',
  '111111101101110001010010100100010'
];

let pass = 0, fail = 0;
const ok = (c, l, extra) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l, extra === undefined ? '' : '→ ' + extra); } };

let libLokal = true;
try { await access(LIB); } catch (e) { libLokal = false; }
if (!libLokal) console.log('  ⚠ html5-qrcode nicht lokal installiert — der Test laedt die CDN-Version (Netz noetig).');

// Minimale Testseite: nur der Scanner, ohne App-Bootstrap.
const HARNESS = '<!doctype html><meta charset="utf-8"><title>qr</title>'
  + '<style>html,body{margin:0;height:100%;background:#000}</style>'
  + '<body><script src="gema_qr_scanner.js"></script></body>';

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/__qr.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(HARNESS); return; }
    if (p === '/__lib.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(await readFile(LIB)); return; }
    if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ══════════════════════════════════════════════════════════════════
// A) Statik
// ══════════════════════════════════════════════════════════════════
console.log('— A) Statik: die vier Stellschrauben stehen im Code —');
const SRC = await readFile(join(ROOT, 'gema_qr_scanner.js'), 'utf8');

ok(/videoConstraints[\s\S]{0,60}_videoConstraints\(\)/.test(SRC)
  && /function _videoConstraints[\s\S]{0,600}width:\{ideal:hoch\?1080:1920\}/.test(SRC),
  'Kamera-Aufloesung wird angefordert, und zwar im Format des Suchers');
ok(/function _videoConstraints[\s\S]{0,700}focusMode:'continuous'/.test(SRC),
  'Dauer-Autofokus angefordert (best-effort in advanced)');
ok(/function _stageFit[\s\S]{0,700}rd\.style\.transform='scale\('/.test(SRC)
  && /_basisBreite\(\)/.test(SRC),
  'Dekodier-Aufloesung ist von der Bildschirmbreite entkoppelt (Basis + CSS-Skalierung)');
ok(/qrbox:function\(vw,vh\)[\s\S]{0,260}Math\.min\(vw,vh\)/.test(SRC)
  && !/qrbox:\{width:250/.test(SRC.replace(/qrbox:\{width:250,height:250\}\},treffer/, '')),
  'qrbox folgt der gemessenen Sucher-Groesse statt fixer 250 px');
ok(/disableFlip:true/.test(SRC), 'disableFlip: kein gespiegelter Zweitversuch je Bild');
ok(/useBarCodeDetectorIfSupported:true/.test(SRC), 'nativer BarcodeDetector wird genutzt, wo vorhanden');
ok(/_scanner\.start\([\s\S]{0,400}catch\(function\(err1\)[\s\S]{0,400}_scanner\.start\(/.test(SRC),
  'lehnt die Kamera die Wuensche ab, wird schlicht gestartet statt aufgegeben');
ok(/function stop\(\)[\s\S]{0,400}_ro\.disconnect\(\)/.test(SRC)
  && /function stop\(\)[\s\S]{0,400}removeEventListener\('resize'/.test(SRC),
  'stop() raeumt ResizeObserver und Fenster-Listener ab');

// ══════════════════════════════════════════════════════════════════
// B–E) Messungen mit Fake-Kamera
// ══════════════════════════════════════════════════════════════════
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});

// caps: null = Kamera meldet keine Zusatzfaehigkeiten, sonst {zoom, torch}
async function seite(caps) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, permissions: ['camera'] });
  if (libLokal) await ctx.route('**/html5-qrcode*', r => r.fulfill({ status: 302, headers: { location: BASE + '/__lib.js' } }));
  await ctx.addInitScript(() => {
    // Dekodier-Versuche zaehlen: jeder Versuch zeichnet den qrbox-Ausschnitt
    // per drawImage in das Canvas.
    window.__draws = 0;
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function () { window.__draws++; return orig.apply(this, arguments); };
  });
  if (caps) {
    await ctx.addInitScript((c) => {
      const gc = MediaStreamTrack.prototype.getCapabilities;
      MediaStreamTrack.prototype.getCapabilities = function () {
        const base = (gc ? gc.call(this) : {}) || {};
        if (c.zoom) base.zoom = { min: 1, max: 5, step: 0.1 };
        if (c.torch) base.torch = true;
        return base;
      };
      const gs = MediaStreamTrack.prototype.getSettings;
      MediaStreamTrack.prototype.getSettings = function () {
        const s = (gs ? gs.call(this) : {}) || {};
        if (c.zoom && !('zoom' in s)) s.zoom = 1;
        return s;
      };
      window.__applied = [];
      MediaStreamTrack.prototype.applyConstraints = function (x) { window.__applied.push(JSON.stringify(x)); return Promise.resolve(); };
    }, caps);
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/__qr.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  return { ctx, page, errs };
}

const mess = async (page, ms) => {
  await page.evaluate(() => { window.__draws = 0; GemaQR.scan(function () { window.__code = 1; }); });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const rd = document.getElementById('gemaQrReader');
    const st = document.getElementById('gemaQrStage');
    const v = rd ? rd.querySelector('video') : null;
    const c = rd ? rd.querySelector('canvas') : null;
    const r = v ? v.getBoundingClientRect() : null;
    const sr = st ? st.getBoundingClientRect() : null;
    return {
      video: v ? { nativ: [v.videoWidth, v.videoHeight], layout: [v.clientWidth, v.clientHeight] } : null,
      canvas: c ? [c.width, c.height] : null,
      stage: st ? [st.clientWidth, st.clientHeight] : null,
      angezeigt: r ? [Math.round(r.width), Math.round(r.height)] : null,
      stageRect: sr ? [Math.round(sr.width), Math.round(sr.height), Math.round(sr.left), Math.round(sr.top)] : null,
      videoRect: r ? [Math.round(r.left), Math.round(r.top)] : null,
      draws: window.__draws,
      ctrls: (() => { const e = document.getElementById('gemaQrCtrls'); return e ? e.style.display : 'weg'; })(),
      zoom: !!document.getElementById('gemaQrZoom'),
      torch: !!document.getElementById('gemaQrTorch'),
      overlays: document.querySelectorAll('#gemaQrOverlay').length
    };
  });
};

try {
  console.log('— B) Dekodier-Aufloesung und Versuchsrate (Fake-Kamera) —');
  let s = await seite(null);
  const MESSDAUER = 3000;
  let m = await mess(s.page, MESSDAUER);

  ok(!!m.video, 'Kamera laeuft im Sucher');
  ok(m.video.nativ[0] >= 1000 || m.video.nativ[1] >= 1000,
    'Kamera liefert die angeforderte Aufloesung (frueher ' + ALT_KAMERA_BREITE + '×480)', JSON.stringify(m.video.nativ));
  ok(!!m.canvas, 'Dekodier-Canvas vorhanden');
  const kurz = Math.min(m.canvas[0], m.canvas[1]);
  ok(m.canvas[0] === m.canvas[1], 'Dekodier-Ausschnitt ist quadratisch (kein Rechenaufwand ohne Nutzen)', JSON.stringify(m.canvas));
  ok(kurz >= ALT_CANVAS_KURZ * 2,
    'Dekodier-Aufloesung mindestens doppelt so gross wie frueher — ' + kurz + ' px statt ' + ALT_CANVAS_KURZ + ' px'
    + ' (Faktor ' + (kurz / ALT_CANVAS_KURZ).toFixed(2) + '×)', kurz);
  // Der Kern des Tricks: die CSS-Skalierung darf clientWidth NICHT anfassen,
  // sonst schrumpft der Dekodier-Ausschnitt wieder auf Bildschirmbreite.
  ok(m.video.layout[0] > m.stage[0],
    'CSS-Skalierung laesst clientWidth unberuehrt (Layout ' + m.video.layout[0] + ' px > Buehne ' + m.stage[0] + ' px)');
  ok(m.angezeigt[0] <= m.stage[0] + 1,
    'angezeigt wird trotzdem nur bildschirmbreit (' + m.angezeigt[0] + ' px)');
  const rate = m.draws / (MESSDAUER / 1000);
  ok(rate >= 4, 'Versuchsrate bleibt oben: ' + rate.toFixed(1) + ' Dekodier-Versuche/s (' + m.draws + ' in ' + (MESSDAUER / 1000) + ' s)');

  console.log('— C) Sucher-Einpassung —');
  ok(m.angezeigt[1] <= m.stage[1] + 1, 'das ganze Kamerabild ist sichtbar, nichts wird abgeschnitten',
    'Bild ' + m.angezeigt[1] + ' px, Buehne ' + m.stage[1] + ' px');
  const dx = Math.abs((m.videoRect[0] - m.stageRect[2]) - (m.stageRect[0] - m.angezeigt[0]) / 2);
  ok(dx <= 2, 'Bild horizontal zentriert', dx);
  ok(m.overlays === 1, 'genau EIN Overlay');
  ok(m.ctrls === 'none', 'ohne gemeldete Faehigkeiten bleiben Zoom/Licht weg (nichts versprechen)');
  ok(!m.zoom && !m.torch, 'kein Zoom-Regler, kein Licht-Knopf ohne Kamera-Unterstuetzung');

  console.log('— E) Aufraeumen + Session-Guard —');
  const nach = await s.page.evaluate(async () => {
    GemaQR.scan(function () { });                       // zweiter Start
    await new Promise(r => setTimeout(r, 1200));
    const doppelt = document.querySelectorAll('#gemaQrOverlay').length;
    GemaQR.stop();
    await new Promise(r => setTimeout(r, 300));
    return { doppelt: doppelt, uebrig: document.querySelectorAll('#gemaQrOverlay').length };
  });
  ok(nach.doppelt === 1, 'zweiter scan() hinterlaesst kein zweites Overlay', nach.doppelt);
  ok(nach.uebrig === 0, 'stop() entfernt das Overlay restlos');
  ok(s.errs.length === 0, 'keine JS-Fehler (' + s.errs.join(' | ') + ')');
  await s.ctx.close();

  console.log('— D) Zoom + Licht, wenn die Kamera sie meldet —');
  s = await seite({ zoom: true, torch: true });
  m = await mess(s.page, 2200);
  ok(m.ctrls === 'flex', 'Bedienleiste erscheint');
  ok(m.zoom, 'Zoom-Regler vorhanden');
  ok(m.torch, 'Licht-Knopf vorhanden');
  const z = await s.page.evaluate(async () => {
    const sl = document.querySelector('#gemaQrZoom input[type=range]');
    sl.value = '3';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('gemaQrTorch').click();
    await new Promise(r => setTimeout(r, 150));
    return {
      angewendet: (window.__applied || []).join(' '),
      gemerkt: localStorage.getItem('gema_qr_zoom_v1'),
      torchText: document.getElementById('gemaQrTorch').textContent,
      min: sl.min, max: sl.max
    };
  });
  ok(z.min === '1' && z.max === '5', 'Regler spannt den GEMELDETEN Bereich (1–5), nicht einen erfundenen', z.min + '–' + z.max);
  ok(z.angewendet.indexOf('"zoom":3') >= 0, 'Zoom wird auf die Kamera angewendet', z.angewendet.slice(0, 160));
  ok(z.gemerkt === '3', 'Zoom bleibt fuer den naechsten Scan gespeichert', z.gemerkt);
  ok(z.angewendet.indexOf('"torch":true') >= 0, 'Licht wird eingeschaltet');
  ok(z.torchText.indexOf('aus') >= 0, 'Licht-Knopf zeigt den Zustand an', z.torchText);

  // Gemerkter Zoom wird beim naechsten Scan wieder gesetzt.
  const z2 = await s.page.evaluate(async () => {
    GemaQR.stop();
    window.__applied = [];
    await new Promise(r => setTimeout(r, 200));
    GemaQR.scan(function () { });
    await new Promise(r => setTimeout(r, 1600));
    const sl = document.querySelector('#gemaQrZoom input[type=range]');
    return { wert: sl ? sl.value : null, angewendet: (window.__applied || []).join(' ') };
  });
  ok(z2.wert === '3', 'naechster Scan startet mit dem gemerkten Zoom', z2.wert);
  ok(z2.angewendet.indexOf('"zoom":3') >= 0, 'und setzt ihn auch wirklich an der Kamera', z2.angewendet.slice(0, 160));

  ok(s.errs.length === 0, 'keine JS-Fehler im Zoom-/Licht-Zweig (' + s.errs.join(' | ') + ')');
  await s.ctx.close();

  // ── F) Echte Erkennung: Kamera aus einem Canvas speisen ────────────
  // Nicht nur Geometrie messen, sondern wirklich dekodieren. Der Code ist
  // absichtlich so klein, dass der ALTE Stand ihn nicht mehr las.
  console.log('— F) Erkennung eines kleinen Codes (Kamera aus Canvas) —');
  const ctxF = await browser.newContext({ viewport: { width: 390, height: 800 } });
  if (libLokal) await ctxF.route('**/html5-qrcode*', r => r.fulfill({ status: 302, headers: { location: BASE + '/__lib.js' } }));
  await ctxF.addInitScript((cfg) => {
    const CW = 1080, CH = 1920;                    // simuliertes Kamerabild
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const cx = cv.getContext('2d');
    const n = cfg.matrix.length;
    function malen() {
      cx.fillStyle = '#b9c2cf'; cx.fillRect(0, 0, CW, CH);     // grauer Grund
      const s = window.__qrSize || cfg.px;
      // Ganzzahliger Ursprung: bei ~4 px pro Modul verschmiert ein
      // gebrochener Startpunkt die Kanten und verfaelscht die Messung.
      const m = s / n, x0 = Math.round((CW - s) / 2), y0 = Math.round((CH - s) / 2);
      cx.fillStyle = '#fff'; cx.fillRect(x0 - m * 3, y0 - m * 3, s + m * 6, s + m * 6);  // Ruhezone
      cx.fillStyle = '#111827';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (cfg.matrix[r][c] === '1') cx.fillRect(x0 + c * m, y0 + r * m, m + 0.5, m + 0.5);
      }
      requestAnimationFrame(malen);
    }
    // Bewusst requestAnimationFrame und NICHT setInterval: captureStream
    // greift das Canvas beim naechsten Compositor-Tick ab. Ein Timer zeichnet
    // mitten hinein, die Kamera liefert dann halb gemalte Bilder (grauer
    // Grund ohne Module) und der Test misst Rauschen statt Erkennung.
    // Die Seite wird dafuer mit bringToFront() sichtbar gehalten.
    malen();
    // JEDER Aufruf bekommt einen FRISCHEN Stream — html5-qrcode stoppt beim
    // stop() den Track, und ein gestoppter captureStream-Track laesst sich
    // nicht wiederbeleben.
    navigator.mediaDevices.getUserMedia = function () { return Promise.resolve(cv.captureStream(30)); };
    navigator.mediaDevices.enumerateDevices = function () {
      return Promise.resolve([{ deviceId: 'fake', kind: 'videoinput', label: 'Canvas', groupId: 'g' }]);
    };
  }, { matrix: QR_MATRIX, px: TEST_QR_PX });
  const pageF = await ctxF.newPage();
  const errsF = []; pageF.on('pageerror', e => errsF.push(e.message));
  pageF.on('dialog', d => d.dismiss().catch(() => {}));
  await pageF.goto(BASE + '/__qr.html', { waitUntil: 'domcontentloaded' });
  await pageF.bringToFront();
  await pageF.waitForTimeout(400);
  const f = await pageF.evaluate(async (px) => {
    window.__qrSize = px;
    let code = null;
    await new Promise(r => setTimeout(r, 400));
    GemaQR.scan(function (c) { code = c; });
    let diag = null;
    for (let i = 0; i < 60 && code === null; i++) {
      await new Promise(r => setTimeout(r, 150));
      if (i === 12) {   // Zustandsaufnahme, solange der Sucher noch offen ist
        const rd = document.getElementById('gemaQrReader');
        const v = rd ? rd.querySelector('video') : null;
        const c = rd ? rd.querySelector('canvas') : null;
        diag = { video: v ? [v.videoWidth, v.videoHeight, v.clientWidth, v.clientHeight] : null,
                 canvas: c ? [c.width, c.height] : null, draws: window.__draws };
      }
    }
    try { GemaQR.stop(); } catch (e) {}
    return { code: code, diag: diag };
  }, TEST_QR_PX);
  const gelesen = f.code;
  ok(gelesen === QR_URL,
    'ein Etiketten-Code (33×33 Module, ' + TEST_QR_PX + ' px im Kamerabild) wird tatsaechlich dekodiert',
    gelesen === null ? 'nichts erkannt — ' + JSON.stringify(f.diag) : gelesen);
  ok(errsF.length === 0, 'keine JS-Fehler beim Dekodieren (' + errsF.join(' | ') + ')');
  await ctxF.close();
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
