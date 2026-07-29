// ═══════════════════════════════════════════════════════════════════════════
// Drift-Guard: Feedback 29.07.2026 (Datei 2 — gema_feedback_20260729_1.md)
//   Druckdispositiv: «Druckerhöhung vorgesehen»-Wahl (rote Meldung wird
//     neutral), kein «Fehlbetrag», «Erhöht (> 1 bar)» ohne «!», Karten fold
//   Druckverlust: 2 Dezimalstellen + Tausender-Apostroph, Optiflex nur bis
//     25 mm (Legacy-Dims nur für Altdaten), Dimension-Sortierung Optiflex→
//     Optipress klein→gross, Armaturen-Diagramme klickbar (Gross-Overlay)
//   Heizungsleitungen: W/kW + Pa/mbar/bar wählbar (trusted konvertiert,
//     AutoSave-Restore nicht), Material+Zuschlag zentral, Strang-Schema
//   Prüfliste: 🗑/📝-Buttons gross + sichtbar, Touch-Kompakt-Layout,
//     Sichtbarkeits-Re-Pull, Feedback-Capture erfasst offene Vollbild-
//     Editoren komplett (Overlay-Element-Pfad in gema_feedback.js)
// Ausführen: CHROME=<chromium> node scripts/feedback_20260729_1_test.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { startServer, BASE, seed, newPage, wireRoutes } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okN = 0, failN = 0;
function ok(name, cond, extra) {
  if (cond) { okN++; console.log('  ✓ ' + name); }
  else { failN++; console.log('  ✗ ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}
const SRC = p => readFileSync('/home/user/GEMA_beta/' + p, 'utf8');

// ── Statische Checks ──
console.log('■ Statik');
{
  const dd = SRC('sb_druckdispositiv.html');
  ok('dd: #deaVorgesehen-Select vorhanden', dd.includes('id="deaVorgesehen"'));
  ok('dd: kein «Fehlbetrag» mehr im Modul', !/Fehlbetrag/.test(dd));
  ok('dd: «Erhöht (> 1 bar)» ohne Ausrufezeichen', dd.includes('Erhöht (> 1 bar)') && !dd.includes('Erhöht!'));
  ok('dd: Fold-Karten (dd-foldhd) + Print-Schutz', dd.includes('dd-foldhd') && /print[^}]*card-bd[^}]*display:block/s.test(dd));
  const dv = SRC('sb_druckverlust.html');
  ok('dv: fmt mit Tausender-Apostroph', dv.includes('(\\d{3})+(?!\\d)'));
  ok('dv: dimAuswahl filtert Legacy-Dimensionen', dv.includes('function dimAuswahl') && dv.includes('legacy'));
  ok('dv: Gross-Overlay für Armaturen-Diagramme', dv.includes('armDiagGross') && dv.includes('zoom-in'));
  const hz = SRC('hz_heizungsleitungen.html');
  ok('hz: Einheiten-Helfer (HL_DUNITS/hlPF/hlHeF)', hz.includes('HL_DUNITS') && hz.includes('function hlPF') && hz.includes('function hlHeF'));
  ok('hz: zentrale Wahl (hl_matAll/hl_zuAll)', hz.includes('hl_matAll') && hz.includes('hl_zuAll'));
  ok('hz: Schema-Block (_hlSchemaDraw + Toggle)', hz.includes('window._hlSchemaDraw') && hz.includes('hlSchemaToggle'));
  const pr = SRC('pm_pruefliste.html');
  ok('pr: .row-del gestylt (rot getönt)', /\.row-del\{[^}]*red-bd/.test(pr));
  ok('pr: .icobtn 38px', /\.icobtn\{width:38px/.test(pr));
  ok('pr: Touch-Kompakt-Media-Query', pr.includes('(hover:none) and (pointer:coarse)'));
  ok('pr: Sichtbarkeits-Re-Pull', pr.includes('_lastRepull') && pr.includes("visibilityState!=='visible'"));
  const fb = SRC('gema_feedback.js');
  ok('feedback: Overlay-Element-Erfassung', fb.includes('_fullscreenOverlayEl') && fb.includes('elementsFromPoint'));
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ── Druckdispositiv ──
console.log('■ Druckdispositiv');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/sb_druckdispositiv.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#ddSchema svg', { timeout: 12000 });
  for (const [id, v] of [['hReservoir','250'],['hVerteilbatterie','150'],['schwankungNetz','0.5'],['dvHauszuleitung','0.2'],
    ['dvWasserzaehler','0.3'],['ruhedruckDM','10'],['hHoechste','15'],['hTiefste','5'],['dvInstallation','1.2']]) await page.fill('#'+id, v);
  await page.waitForTimeout(300);
  // Ruhedruck 10 > Betriebsdruck → ohne Wahl: roter Fehler
  let h = await page.evaluate(() => { const e = document.getElementById('ddRdHinweis'); return { cls: e.className, txt: e.textContent, vis: getComputedStyle(e).display !== 'none' }; });
  ok('ohne Wahl: roter Hinweis «Druckerhöhung nötig» sichtbar', h.vis && /Druckerhöhung nötig/.test(h.txt) && !/deaok/.test(h.cls));
  await page.selectOption('#deaVorgesehen', 'ja');
  await page.waitForTimeout(250);
  h = await page.evaluate(() => { const e = document.getElementById('ddRdHinweis'); return { cls: e.className, txt: e.textContent, vis: getComputedStyle(e).display !== 'none' }; });
  ok('Wahl «Ja»: neutrale Meldung «Druckerhöhung vorgesehen»', h.vis && /Druckerhöhung vorgesehen/.test(h.txt) && /deaok/.test(h.cls));
  ok('Wahl «Ja»: kein «Fehlbetrag», kein ⚠', !/Fehlbetrag/.test(h.txt) && h.txt.indexOf('⚠') < 0);
  const zw = await page.evaluate(() => { const e = document.getElementById('ddDmBedarf'); return e ? { cls: e.className, txt: e.textContent } : null; });
  ok('Zwischenwerte-Zeile folgt der Wahl (deaok)', !!zw && /deaok/.test(zw.cls) && /vorgesehen/.test(zw.txt));
  // Fliessdruck «Erhöht (> 1 bar)» ohne «!»
  await page.fill('#ruhedruckDM', '5');
  await page.waitForTimeout(250);
  const fl = await page.textContent('#rs-fliessdruck');
  ok('Fliessdruck-Status «Erhöht (> 1 bar)» ohne «!»', /Erhöht \(> 1 bar\)/.test(fl) && fl.indexOf('!') < 0);
  // Fold
  const foldN = await page.locator('.card-hd.dd-foldhd').count();
  ok('mehrere Karten einklappbar (dd-foldhd ≥ 4)', foldN >= 4, foldN);
  await page.evaluate(() => document.querySelector('.card-hd.dd-foldhd').click());
  await page.waitForTimeout(150);
  const zu = await page.evaluate(() => { const c = document.querySelector('.card-hd.dd-foldhd').closest('.card'); const b = c.querySelector('.card-bd'); return getComputedStyle(b).display === 'none'; });
  ok('Klick klappt die Karte zu', zu);
  await page.evaluate(() => document.querySelector('.card-hd.dd-foldhd').click());
  await ctx.close();
}

// ── Druckverlust ──
console.log('■ Druckverlust');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/sb_druckverlust.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ts-card', { timeout: 12000 });
  // Sammel-System Nussbaum wählen → Dimensionen: Optiflex zuerst, dann Optipress, je klein→gross; keine Optiflex-Legacy > 25
  await page.selectOption('#inp_globalsys', 'nussbaum');
  await page.waitForTimeout(400);
  const dims = await page.$eval('.ts-card select[data-k="dimDn"]', sel => [...sel.options].map(o => o.textContent.trim()));
  const flexIdx = dims.map((d, i) => /Optiflex/.test(d) ? i : -1).filter(i => i >= 0);
  const pressIdx = dims.map((d, i) => /Optipress/.test(d) ? i : -1).filter(i => i >= 0);
  ok('Nussbaum-Dimension-Liste hat beide Fabrikate', flexIdx.length > 0 && pressIdx.length > 0);
  ok('Optiflex steht VOR Optipress', flexIdx.length && pressIdx.length && Math.max(...flexIdx) < Math.min(...pressIdx),
    dims.slice(0, 6).join(' | '));
  ok('Optiflex-Sortiment endet bei 25 mm (keine 32/40/50/63)', !dims.some(d => /Optiflex/.test(d) && /(32|40|50|63)\s*x/.test(d)), dims.filter(d => /Optiflex/.test(d)).join(', '));
  // Tausender-Apostroph + 2 Dezimalstellen: grosse Zahl durch fmt schicken
  const fmtRes = await page.evaluate(() => (typeof fmt === 'function') ? fmt(12345.678, 2) : null);
  ok("fmt(12345.678,2) → 12'345.68", fmtRes === "12'345.68", fmtRes);
  const dpRes = await page.evaluate(() => (typeof dpFmt === 'function' && typeof state !== 'undefined') ? (state.dpUnit = 'bar', dpFmt(123456)) : null);
  ok("dpFmt in bar: 2 Dezimalstellen + Apostroph (123456 kPa → 1'234.56 bar)", dpRes === "1'234.56", dpRes);
  ok('armDiagGross global aufrufbar', await page.evaluate(() => typeof armDiagGross === 'function' || typeof window.armDiagGross === 'function'));
  await ctx.close();
}

// ── Heizungsleitungen ──
console.log('■ Heizungsleitungen');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/hz_heizungsleitungen.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#hlTsBody tr', { timeout: 12000 });
  await page.fill('#hl_tvl', '70'); await page.fill('#hl_trl', '50');
  await page.selectOption('#hlTsBody tr[data-i="0"] select[data-k="mat"]', 'Stahl');
  await page.selectOption('#hlTsBody tr[data-i="0"] select[data-k="dn"]', '25');
  await page.fill('#hlTsBody tr[data-i="0"] input[data-k="l"]', '12');
  await page.fill('#hlTsBody tr[data-i="0"] input[data-k="p"]', '8000');
  await page.waitForTimeout(350);
  ok('Schema zeichnet (SVG + Segment)', await page.locator('#hlSchema svg').count() === 1 && await page.locator('#hlSchema [data-hlts]').count() >= 1);
  const totPa = await page.textContent('#hl_ts_0_tot');
  ok('Total in Pa gerechnet (581)', /^58[01]$/.test(totPa.trim()), totPa);
  // trusted kW-Wechsel via Tastatur → Feld konvertiert
  await page.focus('#hl_punit'); await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  ok('trusted W→kW konvertiert das Leistungsfeld (8000→8)', (await page.inputValue('#hlTsBody tr[data-i="0"] input[data-k="p"]')) === '8');
  ok('Spaltenkopf folgt: Leistung [kW]', /\[kW\]/.test(await page.evaluate(() => document.querySelector('th[data-u*="{P}"]').textContent)));
  // trusted Pa→mbar→bar
  await page.focus('#hl_dunit'); await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150); await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const totBar = await page.textContent('#hl_ts_0_tot');
  ok('Total folgt der Druck-Einheit (bar, 3 Dez.)', /^0\.00[56]$/.test(totBar.trim()), totBar);
  // NICHT-trusted (AutoSave-Restore-Simulation): selectOption konvertiert NICHT
  await page.selectOption('#hl_punit', 'W');
  await page.waitForTimeout(200);
  ok('non-trusted Wechsel konvertiert NICHT (Feld bleibt 8)', (await page.inputValue('#hlTsBody tr[data-i="0"] input[data-k="p"]')) === '8');
  // zentrale Material-Wahl (trusted)
  await page.focus('#hl_matAll'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120); await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const mats = await page.$$eval('#hlTsBody tr[data-kind="ts"] select[data-k="mat"]', els => els.map(e => e.value));
  ok('zentrales Material CNS auf allen Zeilen', mats.length > 0 && mats.every(m => m === 'CNS'), mats.join(','));
  // zentraler Zuschlag (trusted tippen)
  await page.click('#hl_zuAll'); await page.keyboard.type('30'); await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  const zus = await page.$$eval('#hlTsBody tr[data-kind="ts"] input[data-k="zu"]', els => els.map(e => e.value));
  ok('zentraler Zuschlag 30 % auf allen Zeilen', zus.length > 0 && zus.every(z => z === '30'), zus.join(','));
  // Schema-Klick → Zeile pulsiert; Fold-Toggle
  await page.evaluate(() => document.querySelector('#hlSchema [data-hlts="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(150);
  ok('Schema-Klick springt zur Tabellenzeile (hl-puls)', await page.locator('#hlTsBody tr.hl-puls').count() === 1);
  await page.evaluate(() => document.querySelector('.hl-foldhd').click());
  await page.waitForTimeout(150);
  ok('Fold klappt zu', await page.evaluate(() => document.getElementById('hlSchemaBd').style.display === 'none'));
  await page.evaluate(() => document.querySelector('.hl-foldhd').click());
  await page.waitForTimeout(150);
  ok('Fold klappt auf + zeichnet nach', await page.locator('#hlSchema svg').count() === 1);
  await ctx.close();
}

// ── Prüfliste: Buttons + Touch-Layout + Feedback-Capture ──
console.log('■ Prüfliste');
{
  const H2C_PATH = process.env.H2C_PATH || '/home/user/node_modules/html2canvas/dist/html2canvas.min.js';
  const beg = {
    id: 'beg_t1', nr: 'BEG-2026-007', orgId: 'org_test', status: 'offen', datum: '2026-07-27',
    pruefer: 'Test', objektId: '', objektAdresse: 'Rainacker 23, 4628 Wolfwil',
    erstelltVon: { userId: 'u_test', name: 'Test User' },
    anlagen: [{ id: 'anl1', anlagenart: 'abwasser', name: 'Abwasser', standort: 'UG', punkte: [
      { id: 'pk1', bezeichnung: 'Hebeanlage', antworttyp: 'vorhanden_nb', antwort: 'vorhanden', bewertung: 'gut', individuell: true, bemerkung: '', empfehlung: '', fotos: [] }
    ] }]
  };
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  await wireRoutes(ctx);
  if (existsSync(H2C_PATH)) {
    const H2C = readFileSync(H2C_PATH, 'utf8');
    await ctx.route('**/html2canvas*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: H2C }));
  }
  await ctx.route('**/rest/v1/**', r => {
    if (r.request().method() === 'GET' && /data_key=like\.prbeg/.test(r.request().url())) {
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ data_key: 'prbeg:beg_t1', payload: { data: beg }, last_modified: new Date().toISOString() }]) });
    }
    if (r.request().method() === 'GET') return r.fulfill({ contentType: 'application/json', body: '[]' });
    return r.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await ctx.addInitScript(sd => { for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed(['role_planer']));
  const page = await ctx.newPage();
  await page.goto(BASE + '/pm_pruefliste.html?beg=beg_t1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#edOv.open', { timeout: 12000 });
  await page.waitForTimeout(400);
  // Buttons: row-del rot getönt + gross, icobtn 38px, Antwort-Buttons kompakt (Touch)
  const bt = await page.evaluate(() => {
    const rd = document.querySelector('.pkt .row-del'), ic = document.querySelector('.pkt .icobtn'), ab = document.querySelector('.ans-btn');
    const g = el => { const c = getComputedStyle(el), r = el.getBoundingClientRect(); return { w: r.width, h: r.height, bg: c.backgroundColor, bc: c.borderColor, fs: parseFloat(c.fontSize), mh: parseFloat(c.minHeight) }; };
    return { rd: rd ? g(rd) : null, ic: ic ? g(ic) : null, ab: ab ? g(ab) : null };
  });
  ok('🗑 row-del 38px mit rotem Ton', !!bt.rd && Math.round(bt.rd.w) === 38 && bt.rd.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(bt.rd));
  ok('📝 icobtn 38px', !!bt.ic && Math.round(bt.ic.w) === 38);
  ok('Antwort-Buttons kompakt auf Touch (min-height 34, font 12)', !!bt.ab && bt.ab.mh === 34 && bt.ab.fs === 12, JSON.stringify(bt.ab));
  // Feedback-Capture: Body gescrollt + Editor offen → Bild trotzdem KOMPLETT
  if (existsSync(H2C_PATH)) {
    await page.evaluate(src => new Promise(res => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = res; document.head.appendChild(sc); }), 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '1600px'; document.body.appendChild(d); window.scrollTo(0, 420); });
    await page.evaluate(() => { const b = document.querySelector('#edOv .ov-bd'); if (b) b.scrollTop = 200; });
    await page.evaluate(() => GemaFeedback.start());
    await page.waitForSelector('#gfb-annot-img', { timeout: 15000 });
    await page.waitForTimeout(500);
    const cap = await page.evaluate(async () => {
      const img = document.getElementById('gfb-annot-img');
      if (!img || !(img.src || '').startsWith('data:image')) return null;
      await new Promise(r => { if (img.complete) r(); else img.onload = r; });
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const cover = (y0, y1) => { const d = x.getImageData(0, Math.floor(y0), w, Math.floor(y1 - y0)).data; let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 40 && (d[i] < 236 || d[i + 1] < 236 || d[i + 2] < 236)) n++; } return n / (d.length / 4); };
      return { w, h, top: cover(0, h * 0.15), unten: cover(h * 0.75, h) };
    });
    ok('Capture hat Viewport-Grösse', !!cap && cap.w === 1024 && cap.h === 768, JSON.stringify(cap));
    ok('Capture: Editor-Kopf im Bild (oben Inhalt)', !!cap && cap.top > 0.02, cap && (cap.top * 100).toFixed(1) + '%');
    ok('Capture: unteres Viertel NICHT weiss (Bugreport iPad)', !!cap && cap.unten > 0.02, cap && (cap.unten * 100).toFixed(1) + '%');
  } else {
    console.log('  ⚠ html2canvas fehlt (' + H2C_PATH + ') — Capture-Checks übersprungen (npm i html2canvas@1.4.1)');
  }
  await ctx.close();
}

await browser.close(); server.close();
console.log('');
console.log(failN === 0 ? '✓ alle ' + okN + ' Checks grün' : '✗ ' + failN + ' von ' + (okN + failN) + ' Checks ROT');
process.exit(failN === 0 ? 0 : 1);
