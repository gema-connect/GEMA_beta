// Drift-Guard — Feedback 20.08.2026 (Robin):
//   «Das sind sogenannte floating labels — integriere das Verhalten der
//    Inputboxen mit den Labels in der Anlagen-Erfassung im Produktekatalog
//    von Herstellern»
//
// Umgesetzt im Produkt-Editor des Lieferanten-Dashboards
// (sys_lieferant_dashboard.html): die Feldbeschriftung ruht als Platzhalter
// IM Feld und wandert bei Fokus oder vorhandenem Inhalt verkleinert auf die
// Rahmenkante — rein per CSS (placeholder=" " + :placeholder-shown +
// Geschwister-Selektor), also ohne nachzufuehrenden JS-Zustand.
//
// Der Test MISST die Geometrie im Browser (Label-Mitte gegen Feld-Mitte bzw.
// Feld-Oberkante) statt Markup zu lesen — nur so faellt er, wenn eine
// spaetere CSS-Aenderung die Bewegung tot legt.
//
// Ausfuehren: CHROME=<chromium> node scripts/feedback_20260820_1_test.mjs
import { chromium } from 'playwright-core';
import { startServer, seed, newPage, BASE } from './rolematrix_harness.mjs';
import fs from 'node:fs';

let pass = 0, fail = 0;
function check(msg, cond) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

const src = fs.readFileSync('sys_lieferant_dashboard.html', 'utf8');

// ── Teil A: statisch ────────────────────────────────────────────────────
console.log('\n── Teil A: Markup-/CSS-Kanon ──');

check('A1 .pfl-Wrapper mit position:relative existiert',
  /\.pfl\{[^}]*position:relative/.test(src));

check('A2 Label schwebt bei Fokus UND bei Inhalt (:placeholder-shown-Geschwister)',
  /\.pfl>\.fc:focus~\.fl/.test(src) && /\.pfl>\.fc:not\(:placeholder-shown\)~\.fl/.test(src));

check('A3 Schwebe-Zustand verkleinert und legt sich auf die Rahmenkante',
  /\.pfl\.pfl-up>\.fl\{top:0;transform:translateY\(-50%\) scale\(\.85\);background:var\(--sur\)\}/.test(src));

check('A4 Ruhe-Zustand sitzt mittig im Feld (top:50%)',
  /\.pfl>\.fl\{[^}]*top:50%/.test(src));

check('A5 Fokus faerbt das Label in der Akzentfarbe',
  /\.pfl>\.fc:focus~\.fl\{color:var\(--acc\)\}/.test(src));

// Kanon: Grossschreibung zerstoert Einheiten/Formelzeichen (aus «l/s» wird «L/S»).
check('A6 Floating Label OHNE text-transform:uppercase',
  /\.pfl>\.fl\{[^}]*text-transform:none/.test(src));

check('A7 Textfelder tragen placeholder=" " (Leerzeichen — Bedingung fuer :placeholder-shown)',
  /placeholder=" " '\+\(isNum\?'type="text" inputmode="decimal"'/.test(src)
  && /rows="2" placeholder=" "/.test(src));

check('A8 Label steht im Markup NACH dem Feld (Geschwister-Selektor braucht das)',
  /'<div class="pfl">'\+inp\+flLabel\+'<\/div>'/.test(src)
  && /<\/select>'\+flLabel\+'<\/div>/.test(src));

check('A9 Select + Feld mit eigenem Hinweistext: Label dauerhaft oben (.pfl-up)',
  /class="pfl pfl-up"><select class="fc" data-fid=/.test(src)
  && /class="pfl pfl-up">\s*<input class="fc" id="peFamilie"/.test(src));

check('A10 Bei Einheiten-Box flext der Floating-Wrapper (nicht das Input selbst)',
  /\.g-inp-group>\.pfl\{flex:1 1 auto;min-width:0\}/.test(src));

check('A11 saveProd sammelt weiterhin generisch [data-fid] am Input',
  /data-fid="'\+E\(f\.id\)\+'" value="'\+E\(val\)\+'" placeholder=" "/.test(src)
  && /#peFelder \[data-fid\]/.test(src));

// Die alte Platzreserve fuer zweizeilige Labels ueber dem Feld ist mit dem
// Label IM Feld gegenstandslos — sie wuerde das absolut positionierte Label
// zusaetzlich auf 2.4em Mindesthoehe zwingen.
check('A12 Alte min-height-Reserve der Labels ist entfernt',
  !/#peFelder \.fg \.fl\{min-height/.test(src));

check('A13 Langer Feldname wird gekuerzt, voller Text bleibt als Tooltip',
  /text-overflow:ellipsis/.test(src) && /<label class="fl" title="'\+E\(voll\)\+'"/.test(src));

// ── Teil B: gemessen im Browser ─────────────────────────────────────────
const LIEF = {
  id: 'lief_test', firma: 'Testlieferant AG', orgId: 'org_test', status: 'aktiv',
  lieferantKategorien: ['enthaertung'], adresse: { ort: 'Basel' }
};
const PROD = {
  id: 'prod_1', lieferantId: 'lief_test', lieferantFirma: 'Testlieferant AG',
  kategorie: 'enthaertung', status: 'nicht_verifiziert',
  daten: { serie: 'AQA perla', modell: 'M', nenndurchfluss: '2.5' }
};

function liefSeed() {
  const s = seed(['role_lieferant']);
  s.gema_users_v1[0].lieferantId = 'lief_test';
  s.gema_pk_lief_pool_v1 = [LIEF];
  s.gema_pk_prod_pool_v1 = [PROD];
  s.gema_pk_oa_pool_v1 = [];
  return s;
}

// wireRoutes mockt Supabase-GETs auf [] — ohne diese Route wuerde
// bindCollection die Seeds ueberschreiben (Muster lieferant_modul_smoke).
async function wirePkPools(ctx) {
  const rows = (arr, pf) => arr.map(r => ({ data_key: pf + r.id, payload: { data: r, _lm: 1 } }));
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (route.request().method() === 'GET' && u.indexOf('/gema_data') >= 0 && u.indexOf('module_key=eq.produktkatalog') >= 0) {
      let body = [];
      if (u.indexOf('lieferant') >= 0) body = rows([LIEF], 'lieferant:');
      else if (u.indexOf('produkt') >= 0) body = rows([PROD], 'produkt:');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fallback();
  });
}

// Misst ein Feld samt Label: schwebt das Label (Mitte auf der Feld-Oberkante)
// oder ruht es (Mitte in der Feldmitte)?
const MESS = (sel) => {
  const inp = document.querySelector(sel);
  if (!inp) return null;
  const wrap = inp.closest('.pfl');
  const lbl = wrap && wrap.querySelector('label.fl');
  if (!lbl) return null;
  const ri = inp.getBoundingClientRect(), rl = lbl.getBoundingClientRect();
  const cs = getComputedStyle(lbl);
  const lblMitte = rl.top + rl.height / 2;
  return {
    schwebt: Math.abs(lblMitte - ri.top) < 6,
    ruht: Math.abs(lblMitte - (ri.top + ri.height / 2)) < 6,
    farbe: cs.color,
    bg: cs.backgroundColor,
    text: lbl.textContent.trim(),
    ueberlappt: rl.left < ri.left + 4 && rl.bottom > ri.top + 8,
    transform: cs.transform
  };
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

try {
  console.log('\n── Teil B: Verhalten im Browser (gemessen) ──');
  const { ctx, page } = await newPage(browser, liefSeed());
  await wirePkPools(ctx);
  await page.goto(BASE + '/sys_lieferant_dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);

  // ── B1: NEUES Produkt — alle Felder leer, Labels ruhen im Feld ──
  await page.evaluate(() => { window.openProdEditor(); });
  await page.waitForTimeout(400);

  const editorOffen = await page.evaluate(() =>
    document.getElementById('prodEditorOverlay') &&
    document.getElementById('prodEditorOverlay').style.display === 'block' &&
    document.querySelectorAll('#peFelder .pfl').length > 0);
  check('B1 Produkt-Editor offen und rendert Floating-Wrapper', editorOffen);

  const leer = await page.evaluate(MESS, '#peSerie');
  check('B2 Leeres Feld: Label RUHT mittig im Feld (wie ein Platzhalter)',
    !!leer && leer.ruht && !leer.schwebt);
  check('B3 Ruhendes Label hat keinen deckenden Hintergrund (liegt im Feld, nicht auf dem Rahmen)',
    !!leer && (leer.bg === 'rgba(0, 0, 0, 0)' || leer.bg === 'transparent'));

  // ── B2: Fokus laesst es schweben und faerbt es ──
  await page.focus('#peSerie');
  await page.waitForTimeout(320);
  const fokus = await page.evaluate(MESS, '#peSerie');
  check('B4 Fokus: Label schwebt auf die Rahmenkante', !!fokus && fokus.schwebt);
  check('B5 Fokus: Label traegt die Akzentfarbe', !!fokus && fokus.farbe !== leer.farbe);
  check('B6 Schwebendes Label deckt den Rahmen ab (Kartengrund als Hintergrund)',
    !!fokus && fokus.bg !== 'rgba(0, 0, 0, 0)');
  check('B7 Schwebendes Label ist verkleinert (scale)', !!fokus && /matrix/.test(fokus.transform));

  // ── B3: Tippen haelt es oben, Leeren laesst es zurueckfallen ──
  await page.fill('#peSerie', 'AQA perla');
  await page.evaluate(() => document.getElementById('peSerie').blur());
  await page.waitForTimeout(320);
  const getippt = await page.evaluate(MESS, '#peSerie');
  check('B8 Inhalt ohne Fokus: Label bleibt oben', !!getippt && getippt.schwebt);
  check('B9 Wert und Label ueberlappen sich nicht', !!getippt && !getippt.ueberlappt);

  await page.fill('#peSerie', '');
  await page.evaluate(() => document.getElementById('peSerie').blur());
  await page.waitForTimeout(320);
  const wiederLeer = await page.evaluate(MESS, '#peSerie');
  check('B10 Feld geleert: Label faellt zurueck ins Feld', !!wiederLeer && wiederLeer.ruht);

  // ── B4: Select-Label steht immer oben ──
  const selMess = await page.evaluate(MESS, '#peKat');
  check('B11 Select: Label steht dauerhaft oben (ein Select sieht nie leer aus)',
    !!selMess && selMess.schwebt);

  // ── B5: Kategorie-Feld mit Einheiten-Box ──
  const mitEinheit = await page.evaluate(() => {
    const g = document.querySelector('#peFelder .g-inp-group');
    if (!g) return null;
    const inp = g.querySelector('input.fc'), unit = g.querySelector('.g-inp-unit'), lbl = g.querySelector('label.fl');
    if (!inp || !unit || !lbl) return null;
    const ri = inp.getBoundingClientRect(), ru = unit.getBoundingClientRect(), rl = lbl.getBoundingClientRect();
    return {
      labelUeberInput: rl.left < ru.left,
      gleicheHoehe: Math.abs(ri.height - ru.height) < 2,
      wrapperIstPfl: !!inp.closest('.pfl')
    };
  });
  check('B12 Einheiten-Feld: Label sitzt auf dem Input-Rahmen, nicht auf der Einheiten-Box',
    !!mitEinheit && mitEinheit.labelUeberInput && mitEinheit.wrapperIstPfl);
  check('B13 Einheiten-Box bleibt gleich hoch wie das Feld', !!mitEinheit && mitEinheit.gleicheHoehe);

  // ── B6: BESTEHENDES Produkt — Labels sofort oben, ohne jeden Fokus ──
  await page.evaluate(() => { window.closeProdEditor(); window.openProdEditor('prod_1'); });
  await page.waitForTimeout(500);
  const best = await page.evaluate(MESS, '#peSerie');
  check('B14 Bestehendes Produkt: per value gesetzter Wert laesst das Label sofort schweben',
    !!best && best.schwebt && !best.ruht);

  const alleGefuellt = await page.evaluate(() => {
    const raus = [];
    document.querySelectorAll('#peFelder .pfl > input.fc, #peFelder .pfl > textarea.fc').forEach(inp => {
      if (!inp.value) return;
      const lbl = inp.parentElement.querySelector('label.fl');
      const ri = inp.getBoundingClientRect(), rl = lbl.getBoundingClientRect();
      if (Math.abs((rl.top + rl.height / 2) - ri.top) >= 6) raus.push(inp.getAttribute('data-fid'));
    });
    return raus;
  });
  check('B15 JEDES gefuellte Kategorie-Feld zeigt sein Label oben (ohne Ausreisser: '
    + (alleGefuellt.length ? alleGefuellt.join(', ') : '—') + ')', alleGefuellt.length === 0);

  // ── B7: Speichern-Kette unveraendert (data-fid am Input) ──
  const roundtrip = await page.evaluate(async () => {
    const f = document.querySelector('#peFelder .pfl > input.fc[data-fid]');
    if (!f) return null;
    const fid = f.getAttribute('data-fid');
    f.value = '42.5';
    const gesammelt = {};
    document.querySelectorAll('#peFelder [data-fid]').forEach(el => { gesammelt[el.getAttribute('data-fid')] = el.value; });
    return { fid: fid, wert: gesammelt[fid] };
  });
  check('B16 Werte werden weiterhin ueber [data-fid] eingesammelt (saveProd unveraendert)',
    !!roundtrip && roundtrip.wert === '42.5');

  // ── B8: kein Label laeuft aus seinem Feld heraus ──
  const ueberlaeufe = await page.evaluate(() => {
    const raus = [];
    document.querySelectorAll('#peFelder .pfl').forEach(w => {
      const inp = w.querySelector('.fc'), lbl = w.querySelector('label.fl');
      if (!inp || !lbl) return;
      const ri = inp.getBoundingClientRect(), rl = lbl.getBoundingClientRect();
      if (rl.right > ri.right + 2) raus.push(lbl.textContent.trim());
    });
    return raus;
  });
  check('B17 Kein Label laeuft ueber die Feldbreite hinaus ('
    + (ueberlaeufe.length ? ueberlaeufe.join(' | ') : 'keine') + ')', ueberlaeufe.length === 0);

  const tooltips = await page.evaluate(() => {
    let ohne = 0;
    document.querySelectorAll('#peFelder .pfl > label.fl').forEach(l => { if (!l.getAttribute('title')) ohne++; });
    return ohne;
  });
  check('B18 Jedes Floating Label traegt den vollen Feldnamen als Tooltip', tooltips === 0);

  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
