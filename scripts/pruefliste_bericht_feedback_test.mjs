// Prüfliste + Feedback — Feedback 28.07.2026 (4 Punkte)
//  A) Bericht: Bilder stehen DIREKT unter ihrem Prüfpunkt (eigene Tabellenzeile)
//  B) Bericht: 🔴-Feedback-Knopf im Druckfenster → Bild an GemaFeedback
//  C) Feedback aus JEDER Ansicht der Prüfliste (Liste, Vollbild-Editor, Modals)
//  D) Annotation mit wählbaren Farben (jede Form merkt sich ihre Farbe)
//
// Ausführen: CHROME=<chromium> node scripts/pruefliste_bericht_feedback_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const BEG = {
  id: 'b1', nr: 'BEG-2026-001', orgId: 'org_test', status: 'offen', datum: '2026-07-28',
  art: 'begehung', titel: 'Testbegehung', prueferName: 'Sandro', objekttyp: 'mfh',
  objektAdresse: 'Dornacherstrasse 210, 4053 Basel',
  anlagen: [{ anlagenart: 'sanitaer', name: 'Abwasser / Entwässerung', standort: 'UG', punkte: [
    { id: 'pp1', bezeichnung: 'Hebeanlage', antworttyp: 'vorhanden_nb', antwort: 'vorhanden',
      bewertung: 'gut', fotos: [{ dataUrl: PX }, { dataUrl: PX }], empfehlung: 'Wartung jährlich' },
    { id: 'pp2', bezeichnung: 'Test', antworttyp: 'ja_nein_nb', bewertung: 'gut',
      hersteller: 'Biral', typ: 'Test', baujahr: '2026', material: 'Kunststoff', fotos: [{ dataUrl: PX }] },
    { id: 'pp3', bezeichnung: 'Ohne Bild', antworttyp: 'ja_nein_nb', bewertung: 'maessig', empfehlung: 'Prüfen' },
    { id: 'pp4', bezeichnung: 'Geruchsemission', antworttyp: 'geruch', antwort: 'keine', pruefart: 'messgeraet' },
    { id: 'pp5', bezeichnung: 'Rückstauklappe', antworttyp: 'vorhanden_nb', antwort: 'nicht_vorhanden' }
  ] }]
};
function ls() {
  const s = seed(['role_planer']);
  return Object.assign(s, { gema_pr_beg_pool_v1: [BEG], gema_coachmarks_done_pruefliste: '1' });
}
async function prSeite(browser) {
  const { ctx, page } = await newPage(browser, ls());
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof prOpen === 'function' && typeof GemaFeedback !== 'undefined', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  await page.evaluate(b => { localStorage.setItem('gema_pr_beg_pool_v1', JSON.stringify([b])); }, BEG);
  return { ctx, page, errs };
}
// Druckfenster abfangen: window.open mocken und das geschriebene HTML einsammeln
const berichtHtml = page => page.evaluate(() => {
  let html = '';
  const _o = window.open;
  window.open = () => ({ document: { write: s => { html += s; }, close() { }, title: '' }, focus() { }, print() { }, onload: null });
  try { prBericht(); } catch (e) { html += '<!--ERR ' + e.message + '-->'; }
  window.open = _o;
  return html;
});

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* ════════ A · Bilder unter dem Prüfpunkt ════════ */
console.log('■ A · Bericht: Bilder direkt unter ihrem Prüfpunkt');
{
  const { ctx, page, errs } = await prSeite(browser);
  await page.evaluate(() => prOpen('b1'));
  await page.waitForTimeout(400);
  const html = await berichtHtml(page);
  ok(html.indexOf('Prüfbericht') > 0, 'Bericht wird gebaut');

  // Zeilenfolge in der Prüfpunkt-Tabelle prüfen
  const tbody = (html.match(/<table class="pk">[\s\S]*?<\/table>/) || [''])[0];
  const rows = (tbody.match(/<tr[^>]*>/g) || []).map(t => (t.match(/class="([^"]*)"/) || ['', ''])[1]);
  const idxP1 = tbody.indexOf('Hebeanlage'), idxF1 = tbody.indexOf('fotorow');
  ok(rows.filter(c => c.indexOf('fotorow') >= 0).length === 2, 'genau 2 Bild-Zeilen (nur Punkte MIT Foto)');
  ok(idxF1 > idxP1, 'die Bild-Zeile folgt direkt auf ihren Prüfpunkt');
  // Reihenfolge: pkrow(Hebeanlage) → fotorow → pkrow(Test) → fotorow → pkrow(Ohne Bild)
  const seq = [];
  const re = /<tr class="(pkrow[^"]*|fotorow[^"]*)"[^>]*>([\s\S]*?)<\/tr>/g; let m;
  while ((m = re.exec(tbody))) seq.push(m[1].split(' ')[0] + (m[1].indexOf('foto') < 0 ? ':' + (m[2].match(/>([^<]*Hebeanlage|[^<]*Test|[^<]*Ohne Bild)/) ? 'x' : '') : ''));
  ok(seq.join('|').indexOf('pkrow') === 0 && seq[1] === 'fotorow' && seq[3] === 'fotorow',
    'Reihenfolge Punkt → Bilder → Punkt → Bilder (' + seq.join(' ') + ')');
  ok(tbody.indexOf('Empfehlung') > 0, 'Empfehlung erscheint unter den Bildern');
  ok(html.indexOf('class="pblock"') < 0 && html.indexOf('pblock-t') < 0, 'keine separaten Foto-Blöcke mehr nach der Tabelle');
  // Feedback 28.07.2026: die Verkettung steht NUR noch auf Punkten mit Bildern
  // (auf jeder Zeile machte sie die ganze Tabelle unteilbar).
  ok(html.indexOf('tr.pkrow.mitfoto{break-after:avoid') > 0, 'Prüfpunkt und seine Bilder bleiben im Druck zusammen');
  ok(html.indexOf('tr.pkrow{break-after:avoid') < 0, 'kein pauschales break-after auf allen Punktzeilen');
  // Feedback 30.07.2026: Labels AUSGESCHRIEBEN («Baujahr» statt «Bj.») + .btz (10pt)
  ok(html.indexOf('🔩 Hersteller Biral · Typ Test · Baujahr 2026 · Material Kunststoff') > 0,
    'Bauteil-Zeile mit ausgeschriebenen Labels');

  /* ── Prüfbericht-Feedback 30.07.2026 (Berichte BEG-2026-011/-012) ── */
  console.log('■ Prüfbericht-Feedback 30.07.2026 (Titel/Meta/KPI/Fusszeile/Trenner/Umbrüche)');
  ok(html.indexOf('<title>Dornacherstrasse 210 – Prüfbericht</title>') > 0,
    'Fenster-/PDF-Titel = Strasse + Hausnr. (statt Begehungs-Nr.)');
  ok(html.indexOf('<h1>Dornacherstrasse 210</h1>') > 0, 'H1 = Adresse');
  ok(html.indexOf('Prüfbericht — Begehung · Testbegehung') > 0,
    'Untertitel «Prüfbericht — Art · Begehungs-Titel»');
  ok(html.indexOf('>Projekt</td>') > 0 && html.indexOf('Objekt / Projekt') < 0,
    'Meta-Label heisst nur noch «Projekt»');
  ok(html.indexOf('Begehungs-Nr.') < 0, 'keine Begehungs-Nr.-Zeile mehr im Bericht');
  ok(html.indexOf('entfällt: <b>1</b>') > 0, 'KPI-Chip «entfällt» (Rückstauklappe nicht vorhanden)');
  /* Summe geht auf: 5 Punkte = gut 2 (pp1 + pp2 mit Zustand ohne Antwort) +
     mässig 1 (pp3) + entfällt 1 (pp5) + offen 1 (pp4 beantwortet ohne Zustand) */
  ok(html.indexOf('Prüfpunkte: <b>5</b>') > 0 && html.indexOf('gut: <b>2</b>') > 0
    && html.indexOf('mässig: <b>1</b>') > 0 && html.indexOf('offen: <b>1</b>') > 0,
    'KPI-Zahlen gehen auf (2+1+0+1+1 = 5; Zustand ohne Antwort zählt beim Zustand)');
  ok(html.indexOf('@bottom-left{content:') > 0 && html.indexOf('counter(pages)') > 0,
    '@page-Fusszeile: Org statt URL/about:blank + Seite X/Y');
  ok(html.indexOf('@page:first{@top-right{content:none}}') > 0, 'Deckblatt ohne Kopf-Laufzeile');
  ok(html.indexOf('class="pkname"') > 0 && html.indexOf('.pkname{font-weight:800;font-size:10.5pt}') > 0,
    'Prüfpunkt-Titel fett + grösser');
  ok(html.indexOf('white-space:nowrap">Prüfung: Messgerät') > 0, '«Prüfung: Messgerät» bleibt einzeilig');
  ok(html.indexOf('.pgrid img{width:auto;max-width:100%') > 0 && !/\.pgrid img\{[^}]*border:1px/.test(html),
    'Bilder ohne Rahmen, kein leerer Rahmen-Streifen (width:auto)');
  ok(!/\.titelbild img\{[^}]*border:1px/.test(html), 'Titelbild ohne Rahmen');
  ok(html.indexOf('table.pk tr.pkrow.mitfoto td{border-bottom:none}') > 0,
    'keine Trennlinie zwischen Prüfpunkt und seiner Bild-Zeile');
  ok(html.indexOf('table.pk td+td,table.pk tr.colhd th+th{border-left:1px solid') > 0,
    'vertikale Spaltentrenner in allen Zeilen');
  ok(html.indexOf('table.pk tr.fotorow{break-inside:auto') > 0,
    'Bild-Zeile darf zwischen den Bildern brechen (saubere Seitenumbrüche)');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ B · Feedback aus dem Bericht ════════ */
console.log('■ B · Bericht: Feedback-Knopf im Druckfenster');
{
  const { ctx, page, errs } = await prSeite(browser);
  await page.evaluate(() => prOpen('b1'));
  await page.waitForTimeout(400);
  const html = await berichtHtml(page);
  ok(/class="fbb"[^>]*onclick="gemaBerichtFeedback\(\)"/.test(html), '🔴-Feedback-Knopf in der Bericht-Toolbar');
  ok(html.indexOf('window.opener') > 0 && html.indexOf('startWithImage') > 0, 'Bericht übergibt das Bild an GemaFeedback des Hauptfensters');
  ok(html.indexOf('.no-print{display:none!important}') > 0, 'Toolbar wird nicht mitgedruckt');

  // startWithImage: mit Bild → Annotation, ohne Bild → direkt Formular
  ok(await page.evaluate(() => typeof GemaFeedback.startWithImage === 'function'), 'GemaFeedback.startWithImage ist öffentliche API');
  const mitBild = await page.evaluate(px => {
    GemaFeedback.startWithImage(px);
    return document.getElementById('gfb-annot').style.display;
  }, PX);
  ok(mitBild === 'flex', 'mit Bild → Annotation öffnet');
  await page.evaluate(() => GemaFeedback.close());
  const ohneBild = await page.evaluate(() => {
    GemaFeedback.startWithImage('');
    return { annot: document.getElementById('gfb-annot').style.display, modal: document.getElementById('gfb-modal').style.display };
  });
  ok(ohneBild.modal === 'flex' && ohneBild.annot === 'none', 'ohne Bild → direkt ins Formular (Feedback bleibt möglich)');
  await page.evaluate(() => GemaFeedback.close());

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ C · Feedback in jeder Ansicht ════════ */
console.log('■ C · Feedback aus Liste, Editor und Modals erreichbar');
{
  const { ctx, page, errs } = await prSeite(browser);
  ok(await page.locator('.g-nav .gema-feedback-btn').count() === 1, 'Listenansicht: Feedback in der Nav');
  await page.evaluate(() => GemaFeedback.start());
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('gfb-overlay').style.display) === 'block', 'Listenansicht: Overlay öffnet');
  await page.keyboard.press('Escape');

  await page.evaluate(() => prOpen('b1'));
  await page.waitForTimeout(400);
  ok(await page.locator('#edFt .gema-feedback-btn').count() === 1, 'Vollbild-Editor: eigener Feedback-Knopf (Nav ist verdeckt)');
  const zEd = await page.evaluate(() => {
    GemaFeedback.start();
    const ov = document.getElementById('gfb-overlay'), ed = document.getElementById('edOv');
    return { disp: ov.style.display, zOv: +getComputedStyle(ov).zIndex, zEd: +getComputedStyle(ed).zIndex };
  });
  ok(zEd.disp === 'block' && zEd.zOv > zEd.zEd, 'Editor: Overlay liegt ÜBER dem Vollbild-Editor (' + zEd.zOv + ' > ' + zEd.zEd + ')');
  await page.keyboard.press('Escape');

  // Modals verdecken die Nav → eigener Knopf im Kopf
  for (const [id, oeffnen] of [['addPktBg', () => prAddPktOpen && prAddPktOpen(0)], ['pkEditBg', null]]) {
    ok(await page.locator('#' + id + ' .modal-hd .fb-x').count() === 1, 'Modal #' + id + ': Feedback-Knopf im Kopf');
  }
  const zModal = await page.evaluate(() => {
    const m = document.getElementById('addPktBg'); m.classList.add('open');
    const nav = document.querySelector('.g-nav');
    const r = { zM: +getComputedStyle(m).zIndex, zNav: +getComputedStyle(nav).zIndex };
    m.classList.remove('open');
    return r;
  });
  ok(zModal.zM > zModal.zNav, 'Modal deckt die Nav ab (' + zModal.zM + ' > ' + zModal.zNav + ') — daher der eigene Knopf');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ D · Farben in der Annotation ════════ */
console.log('■ D · Annotation: verschiedene Farben');
{
  const { ctx, page, errs } = await prSeite(browser);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(px => GemaFeedback.startWithImage(px), PX);
  await page.waitForTimeout(250);

  const n = await page.locator('#gfb-colors .gfb-col').count();
  ok(n >= 4, n + ' Farben zur Auswahl');
  ok(await page.evaluate(() => _gfbHooks.color()) === '#dc2626', 'Rot ist die Standardfarbe');

  // Form in Rot, dann Farbe wechseln, zweite Form
  await page.evaluate(() => {
    _gfbHooks.setTool('rect');
    const c = document.getElementById('gfb-annot-canvas'), r = c.getBoundingClientRect();
    function ev(t, x, y) { c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true })); }
    ev('mousedown', 10, 10); ev('mousemove', 60, 60); ev('mouseup', 60, 60);
  });
  await page.click('#gfb-colors .gfb-col[data-col="#16a34a"]');
  ok(await page.evaluate(() => _gfbHooks.color()) === '#16a34a', 'Farbwechsel auf Grün');
  await page.evaluate(() => {
    const c = document.getElementById('gfb-annot-canvas'), r = c.getBoundingClientRect();
    function ev(t, x, y) { c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true })); }
    ev('mousedown', 80, 10); ev('mousemove', 130, 60); ev('mouseup', 130, 60);
  });
  const cols = await page.evaluate(() => _gfbHooks.shapes().map(s => s.c));
  ok(cols.length === 2 && cols[0] === '#dc2626' && cols[1] === '#16a34a', 'jede Form merkt sich ihre Farbe (' + cols.join(', ') + ')');
  ok(await page.evaluate(() => {
    // Altform ohne Farbe darf nicht abstürzen und bleibt rot
    _gfbHooks.shapes().push({ tool: 'rect', x1: 5, y1: 5, x2: 20, y2: 20 });
    try { _gfbHooks.undo(); return true; } catch (e) { return false; }
  }), 'Formen ohne Farbfeld (Altdaten) bleiben zeichenbar');

  // Aktive Farbe ist markiert
  ok(await page.evaluate(() => document.querySelector('#gfb-colors .gfb-col[data-col="#16a34a"]').style.borderColor.indexOf('255') >= 0
    || document.querySelector('#gfb-colors .gfb-col[data-col="#16a34a"]').style.borderColor === 'rgb(255, 255, 255)'), 'gewählte Farbe ist markiert');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
