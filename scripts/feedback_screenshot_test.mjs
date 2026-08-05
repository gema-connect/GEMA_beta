// Drift-Guard fuer den Feedback-Screenshot (gema_feedback.js).
//
// Hintergrund (Bugreport 28.07.2026, Pruefliste): Der Snip lieferte ein
// WEISSES Bild, sobald die Seite hinter einem position:fixed-Vollbild-Editor
// gescrollt war. Ursache waren zwei Fehler in der html2canvas-Aufrufkette:
//   1. Der Snip rendete das GANZE Dokument ab (0,0) und addierte den
//      Seiten-Scroll auf die Crop-Koordinaten. Fixed-Overlays zeichnet
//      html2canvas aber am Dokument-Anfang → der Ausschnitt lag um den
//      Scroll-Offset daneben, im Extremfall in der leeren Flaeche.
//   2. Der Fullscreen-Pfad (Touch) setzte x/y UND scrollX:-scrollX — das
//      zaehlt den Offset doppelt (html2canvas: bounds = clientRect +
//      windowBounds) und liefert bei gescrollter Seite ein leeres Bild.
// Beides ist behoben durch _captureViewport(): NUR x/y/width/height.
//
// Der Test misst geometrisch: eine Marke an bekannter Viewport-Position im
// Vollbild-Editor muss im Screenshot an der erwarteten Stelle liegen.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_screenshot_test.mjs
//   (html2canvas kommt sonst vom CDN; im Test wird eine lokale Kopie
//    ueber H2C_PATH eingespeist, sonst wird der Test uebersprungen.)
import { chromium } from 'playwright-core';
import { startServer, BASE, newPage, seed } from './rolematrix_harness.mjs';
import { readFileSync, existsSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const H2C_PATH = process.env.H2C_PATH || 'node_modules/html2canvas/dist/html2canvas.min.js';
let n = 0, fail = 0;
const ok = (name, cond) => { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } };

if (!existsSync(H2C_PATH)) {
  console.log('⚠ html2canvas nicht gefunden (' + H2C_PATH + ') — Test uebersprungen.');
  console.log('  npm i html2canvas@1.4.1  bzw.  H2C_PATH=<pfad> setzen.');
  process.exit(0);
}
const H2C = readFileSync(H2C_PATH, 'utf8');

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

// Marke: knallrotes Quadrat an fixer Stelle IM Vollbild-Editor.
const MARKE = { size: 60, farbe: [220, 38, 38] };

async function fall(label, { seiteScrollen, markeOffsetY }) {
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await ctx.route('**/html2canvas*', r => r.fulfill({ contentType: 'text/javascript', body: H2C }));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
  await page.waitForFunction(() => typeof window.html2canvas === 'function', null, { timeout: 20000 });

  // Lange Liste → die Seite hinter dem Editor laesst sich scrollen
  await page.evaluate(() => { for (let i = 0; i < 25; i++) { window.prNeu(); window.prCloseEditor(); } });
  await page.waitForTimeout(200);
  if (seiteScrollen) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
  }
  const begId = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].id);
  await page.evaluate(id => window.prOpen(id), begId);
  await page.evaluate(() => window.prAddAnlage('gas'));
  await page.waitForTimeout(300);

  const st = await page.evaluate(() => ({ y: window.scrollY, docH: document.documentElement.scrollHeight,
                                          ovFixed: getComputedStyle(document.getElementById('edOv')).position }));

  // Marke IM fixed Overlay platzieren (viewport-fest, wie der echte Inhalt)
  const m = await page.evaluate(([mk, offY]) => {
    const d = document.createElement('div');
    d.id = '__marke';
    d.style.cssText = 'position:fixed;left:400px;top:' + offY + 'px;width:' + mk.size + 'px;height:' + mk.size +
                      'px;background:rgb(' + mk.farbe.join(',') + ');z-index:400';
    document.getElementById('edOv').appendChild(d);
    const r = d.getBoundingClientRect();
    return { x: r.x, y: r.y };
  }, [MARKE, markeOffsetY]);

  // Snip 30px links/oberhalb der Marke → sie muss im Bild bei (30,30)*1.5 liegen
  const pad = 30, box = { x: m.x - pad, y: m.y - pad, w: MARKE.size + 2 * pad, h: MARKE.size + 2 * pad };
  await page.evaluate(() => GemaFeedback.start());
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w, box.y + box.h, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => !!(window._gfbHooks && window._gfbHooks.screenshot()), null, { timeout: 25000 });

  const mess = await page.evaluate(([mk, p]) => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, treffer = 0, nichtWeiss = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4, R = d[i], G = d[i + 1], B = d[i + 2];
        if (R < 235 || G < 235 || B < 235) nichtWeiss++;
        if (Math.abs(R - mk.farbe[0]) < 34 && Math.abs(G - mk.farbe[1]) < 34 && Math.abs(B - mk.farbe[2]) < 34) {
          treffer++; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
      }
      res({ bild: [c.width, c.height], treffer, box: [minX, minY, maxX, maxY],
            inhaltProzent: +(nichtWeiss / (c.width * c.height) * 100).toFixed(1), pad: p });
    };
    img.src = window._gfbHooks.screenshot();
  }), [MARKE, pad]);

  const sc = 1.5, tol = 6;
  const erwX = pad * sc, erwY = pad * sc, erwGr = MARKE.size * sc;
  console.log('\n■ ' + label + '  (scrollY=' + st.y + ', docH=' + st.docH + ', ov=' + st.ovFixed + ')');
  ok('Editor ist ein fixed Vollbild-Overlay', st.ovFixed === 'fixed');
  ok('Screenshot hat die Groesse der Auswahl', mess.bild[0] === Math.round(box.w * sc) && mess.bild[1] === Math.round(box.h * sc));
  ok('Bild ist nicht leer (Inhalt ' + mess.inhaltProzent + '% > 3%)', mess.inhaltProzent > 3);
  ok('Marke im Bild gefunden (' + mess.treffer + ' px)', mess.treffer > erwGr * erwGr * 0.5);
  ok('Marke sitzt an der erwarteten Stelle (x ' + mess.box[0] + '≈' + erwX + ', y ' + mess.box[1] + '≈' + erwY + ')',
     Math.abs(mess.box[0] - erwX) <= tol && Math.abs(mess.box[1] - erwY) <= tol);
  ok('Marke hat die erwartete Groesse (' + (mess.box[2] - mess.box[0] + 1) + '≈' + erwGr + ')',
     Math.abs((mess.box[2] - mess.box[0] + 1) - erwGr) <= tol && Math.abs((mess.box[3] - mess.box[1] + 1) - erwGr) <= tol);
  ok('keine pageerrors', errs.length === 0 || (console.log('   ', errs), false));
  await ctx.close();
}

try {
  await fall('Seite NICHT gescrollt', { seiteScrollen: false, markeOffsetY: 300 });
  await fall('Seite gescrollt, Marke oben im Bild', { seiteScrollen: true, markeOffsetY: 200 });
  await fall('Seite gescrollt, Marke unten im Bild', { seiteScrollen: true, markeOffsetY: 620 });

  // Touch-Pfad (Fullscreen statt Snip): darf bei gescrollter Seite ebenfalls
  // nicht leer sein — dieselbe _captureViewport-Kette.
  console.log('\n■ Fullscreen-Pfad (Touch) bei gescrollter Seite');
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  await ctx.route('**/html2canvas*', r => r.fulfill({ contentType: 'text/javascript', body: H2C }));
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
  await page.waitForFunction(() => typeof window.html2canvas === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { for (let i = 0; i < 25; i++) { window.prNeu(); window.prCloseEditor(); } });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const bid = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].id);
  await page.evaluate(i => window.prOpen(i), bid);
  await page.evaluate(() => window.prAddAnlage('gas'));
  await page.waitForTimeout(300);
  const voll = await page.evaluate(async () => {
    const c = await html2canvas(document.body, { x: window.scrollX, y: window.scrollY,
      width: window.innerWidth, height: window.innerHeight, scale: 1,
      logging: false, useCORS: true, allowTaint: true });
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let nw = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) nw++;
    return { size: [c.width, c.height], inhalt: +(nw / (c.width * c.height) * 100).toFixed(1) };
  });
  ok('Viewport-Canvas hat Viewport-Groesse', voll.size[0] === 1280 && voll.size[1] === 760);
  ok('Viewport-Canvas nicht leer (' + voll.inhalt + '% > 3%)', voll.inhalt > 3);
  await ctx.close();

  // ── Body-Pfad auf einem Modul MIT html{scroll-behavior:smooth} ──────────
  // Bugreport 05.08.2026 (Enthaertung): Seite runtergescrollt, Snip gemacht →
  // der Snip zeigte den Inhalt, «als waere ich ganz oben an der Seite».
  // Ursache: html2canvas stellt die Scroll-Position seines Klon-iframes per
  // cloneWindow.scrollTo wieder her — der Klon ERBT das smooth-CSS, der
  // scrollTo ANIMIERT, die Positionen werden gelesen, waehrend der Klon noch
  // bei 0 steht → alle Bounds verschieben sich um +scrollY, der Crop bei
  // scrollY zeigt den Dokument-Anfang. pm_pruefliste (oben) hat KEIN smooth —
  // darum brauchte es diesen eigenen Fall. Fix: _instantScroll (inline
  // scroll-behavior:auto auf der Live-Seite, der Klon kopiert das
  // style-Attribut) + onclone-Re-Scroll mit behavior:'instant'.
  console.log('\n■ Body-Pfad, Seite gescrollt, Modul mit scroll-behavior:smooth (sa_enthaertung)');
  {
    const { ctx, page } = await newPage(browser, seed(['role_planer']));
    await ctx.route('**/html2canvas*', r => r.fulfill({ contentType: 'text/javascript', body: H2C }));
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.goto(BASE + '/sa_enthaertung.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    await page.waitForFunction(() => typeof window.GemaFeedback !== 'undefined' && typeof window.html2canvas === 'function', null, { timeout: 20000 });

    // instant runterscrollen (kein Animations-Artefakt) + ABSOLUTE Marke in
    // den SEITENINHALT an der gescrollten Viewport-Position legen — im
    // fehlerhaften Bild (Dokument-Anfang) kann sie nicht auftauchen.
    const info = await page.evaluate(() => {
      try { window.scrollTo({ top: 1200, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 1200); }
      const m = document.createElement('div');
      m.style.cssText = 'position:absolute;left:500px;top:' + (window.scrollY + 300) +
        'px;width:60px;height:60px;background:rgb(220,38,38);z-index:5';
      document.body.appendChild(m);
      const r = m.getBoundingClientRect();
      return { scrollY: window.scrollY, vx: r.x, vy: r.y,
               smooth: getComputedStyle(document.documentElement).scrollBehavior };
    });
    ok('Modul traegt scroll-behavior:smooth (Vorbedingung des Falls)', info.smooth === 'smooth');
    ok('Seite ist weit gescrollt (' + info.scrollY + ' > 700)', info.scrollY > 700);

    await page.evaluate(() => GemaFeedback.start());
    const pad2 = 30, b2 = { x: info.vx - pad2, y: info.vy - pad2, w: 60 + 2 * pad2, h: 60 + 2 * pad2 };
    await page.mouse.move(b2.x, b2.y);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.w, b2.y + b2.h, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => !!(window._gfbHooks && window._gfbHooks.screenshot()), null, { timeout: 25000 });

    const m2 = await page.evaluate(() => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let treffer = 0, minX = 1e9, minY = 1e9;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (Math.abs(d[i] - 220) < 34 && Math.abs(d[i + 1] - 38) < 34 && Math.abs(d[i + 2] - 38) < 34) {
            treffer++; if (x < minX) minX = x; if (y < minY) minY = y;
          }
        }
        res({ bild: [c.width, c.height], treffer, min: [minX, minY] });
      };
      img.src = window._gfbHooks.screenshot();
    }));
    const sc2 = 1.5, erw2 = pad2 * sc2;
    ok('Marke im Snip gefunden (' + m2.treffer + ' px — Bug zeigte 0)', m2.treffer > 60 * 60 * sc2 * sc2 * 0.5);
    ok('Marke an der erwarteten Stelle (x ' + m2.min[0] + '≈' + erw2 + ', y ' + m2.min[1] + '≈' + erw2 + ')',
       Math.abs(m2.min[0] - erw2) <= 6 && Math.abs(m2.min[1] - erw2) <= 6);
    ok('scroll-behavior der Live-Seite wieder hergestellt',
       await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior) === 'smooth');
    ok('keine pageerrors', errs.length === 0 || (console.log('   ', errs), false));
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' fehlgeschlagen' : '✓ alle ' + n + ' Checks gruen'));
process.exit(fail ? 1 : 0);
