// Feedback 25.08.2026 — Sammel-Export «offen · mit Screenshots», 9 Punkte
// aus drei Bereichen.  Dieser Guard haelt fest, WAS umgesetzt wurde und
// prueft die heiklen Stellen mit Gegenproben statt nur den Quelltext zu lesen.
//
// A) DACHBERICHT (Kaspar Fluck, 24.08. 14:27)
//    «Möglichkeit Absätze zu machen und möglichkeit Text Fett, Unterstrichen
//     oder kursiv zu gestalten»
//    A1  Die acht Beschreibungsfelder sind Rich-Text-Felder, kein <textarea>
//    A2  Tippen speichert — OHNE die Detail-Ansicht neu zu bauen (Fokus-Regel)
//    A3  Fett/Kursiv/Unterstrichen ueber die Werkzeugleiste landen im Datensatz
//    A4  Absaetze bleiben erhalten (mehrere <br> werden NICHT gekappt)
//    A5  Der Sanitizer laesst nur die Whitelist durch — <script>/<img onerror>
//        werden entfernt, der TEXT bleibt (nichts verschwindet still)
//    A6  DOMParser statt innerHTML: eingeschleustes onerror feuert nicht
//    A7  Die KI bekommt KLARTEXT und ihr Ergebnis landet als HTML im Feld
//    A8  Der PDF-Bericht gibt die Formatierung aus (rich statt esc)
//    A9  Ohne den Helfer bleibt das Feld erfassbar (Fallback-Textfeld)
//
// B) APPARATELISTE (Sandro Caso, 24.08. 21:17–21:23)
//    B1  «IV» ergaenzen: Haltegriffe, Rückenlehne, UP-Sifon, Ablage, Haken
//        — bei ALLEN vier Apparaten, EIN Katalog
//    B2  Standard einfach/mittel/hoch pro Apparat (nicht nur pro Raum)
//    B3  Massangabe «Gemäss Planunterlagen» neben Katalogmass + Freitext
//    B4  Dusche: Armatur UP/AP/Thermostat, Accessoires benannt
//    B5  Waschtisch: Armatur-Bedienung, Spiegelschrank UP/AP nur bei Schrank
//    B6  Badewanne hat KEINE Möbel-Gruppe (Gegenprobe: Waschtisch hat sie)
//    B7  «+» statt «&» in den Gruppentiteln
//    B8  Altbestand: ein Raum ohne die neuen Felder rendert unveraendert
//    B9  escCSV liefert den Wert zurueck (der else-Zweig gab '' — CSV war leer)
//
// C) AUSSCHREIBUNGSUNTERLAGEN (Sandro Caso, 24.08. 21:26–21:32)
//    C1  BKP 256 hat die sechs Positionen aus dem Feedback
//    C2  Gewerk-Zeilen «24»/«25» erscheinen nicht mehr als Position
//    C3  Sammel-Schalter klappt den BKP-Baum auf und wieder zu
//    C4  Die Karte «BKP-Positionen» in pdet ist faltbar und startet zu
//    C5  Word-Dateien sind als Vorbedingungs-Dokument hochladbar
//    C6  Nebeneffekt geschlossen: Gasloeschanlage setzt sich NICHT in 256.0
//
// Aufruf:  CHROME=<chromium> node scripts/feedback_20260825_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8961;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

// ── In-Memory-PostgREST ──────────────────────────────────────────────
const store = new Map();
function likeToRe(p) {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + esc.replace(/\*/g, '.*').replace(/_/g, '.') + '$');
}
function handleSb(route) {
  const req = route.request();
  const url = decodeURIComponent(req.url());
  const method = req.method();
  const mkEq = (url.match(/module_key=eq\.([^&]+)/) || [])[1];
  const dkEq = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
  const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
  if (method === 'GET') {
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|');
      const m = k.slice(0, i), d = k.slice(i + 1);
      if (mkEq && m !== mkEq) continue;
      if (dkEq && d !== dkEq) continue;
      if (dkLike && !likeToRe(dkLike).test(d)) continue;
      rows.push({ module_key: m, data_key: d, payload: v });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = [];
    try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(row => { if (row && row.module_key && row.data_key) store.set(row.module_key + '|' + row.data_key, row.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') {
    if (mkEq && dkEq) store.delete(mkEq + '|' + dkEq);
    return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG  = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_pl'], active: true };
const U_PL = { id: 'u_pl', username: 'pl@t.ch', name: 'Petra Planer', roleIds: ['role_admin'], orgId: 'org_t', active: true,
               profile: { email: 'pl@t.ch', nativeAnsicht: false } };

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(seite, extra) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  const seed = {
    gema_orgs_v1: [ORG], gema_users_v1: [U_PL],
    gema_session_v1: { token: 'x.y.z', userId: 'u_pl', expires: FUTURE },
    gema_native_view_v1: 'klassisch',
    gema_coachmarks_done_sp_dachbericht: '1',
    gema_coachmarks_done_sb_apparateliste: '1',
    gema_coachmarks_done_pm_ausschreibungsunterlagen: '1'
  };
  if (extra) Object.assign(seed, extra);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seed);
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + seite, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1300);
  return { ctx, page };
}

// ══════════════════════════════════════════════════════════════════
//  A) DACHBERICHT — Rich-Text
// ══════════════════════════════════════════════════════════════════
console.log('\n— A) Dachbericht: Absätze + fett/kursiv/unterstrichen —');
{
  store.clear();
  const { ctx, page } = await openPage('/sp_dachbericht.html');
  ok(page.errs.length === 0, 'A0 die Seite bootet ohne Fehler (' + (page.errs[0] || 'keine') + ')');

  // Bericht anlegen und oeffnen
  await page.evaluate(() => {
    const r = { id: 'db_test1', titel: 'Testdach', objektId: '', phase: 'inspektion', orgId: 'org_t',
      erstelltAm: new Date().toISOString(), erstelltVon: { userId: 'u_pl', name: 'Petra Planer' },
      dachuebersicht: { dachtyp: 'satteldach', dachtypText: '', ziegelart: '', ziegelartText: '', bemerkung: '', bilder: [] },
      kapitel: [{ id: 'k1', name: 'Strassenseite', einleitung: '', bilder: [], checkliste: [], unterkapitel: [{ id: 'uk1', typ: 'rinnen', label: 'Rinnen', text: '', bilder: [] }] }],
      nachbaranschluesse: { text: '', bilder: [] },
      massnahmen: [{ id: 'm1', titel: 'M1', beschreibung: '', empfehlung: '', prioritaet: 'mittel' }] };
    upsert(r); openDetail('db_test1');
    // Die Detail-Ansicht klappt nur den Abschnitt der AKTIVEN Phase auf; ein
    // Feld in einem geschlossenen Abschnitt ist display:none und damit NICHT
    // fokussierbar (focus() bliebe wirkungslos, focusin feuerte nie).
    document.querySelectorAll('#detailInner .acc').forEach(a => a.classList.add('open'));
  });
  await page.waitForTimeout(700);

  // A1 — acht Rich-Text-Felder, kein <textarea> mehr
  const felder = await page.evaluate(() => {
    const eds = Array.from(document.querySelectorAll('#detailInner [data-gr]')).map(e => e.getAttribute('data-gr'));
    return { eds, textareas: document.querySelectorAll('#detailInner textarea').length };
  });
  ok(felder.eds.length >= 8, 'A1 acht Rich-Text-Felder gerendert (' + felder.eds.length + ')');
  ok(felder.textareas === 0, 'A1 kein <textarea> mehr im Bericht');
  ['uebersicht_dachtypText', 'uebersicht_bemerkung', 'nachbar_text'].forEach(k => {
    ok(felder.eds.some(id => id.endsWith('|' + k)), 'A1 Feld ' + k + ' ist ein Rich-Text-Feld');
  });
  ok(felder.eds.some(id => /\|kapitel::k1::einleitung$/.test(id)), 'A1 Kapitel-Einleitung ebenfalls');
  ok(felder.eds.some(id => /\|uk::uk1::text$/.test(id)), 'A1 Unterkapitel-Text ebenfalls');
  ok(felder.eds.some(id => /\|mn::m1::beschreibung$/.test(id)), 'A1 Massnahmen-Beschrieb ebenfalls');
  ok(felder.eds.every(id => id.indexOf('db_test1|') === 0), 'A1 jedes Feld traegt die Berichts-Id vor dem Schluessel');

  // A2 — Tippen speichert, ohne die Ansicht neu zu bauen
  await page.evaluate(() => {
    const el = document.querySelector('[data-gr="db_test1|uebersicht_bemerkung"]');
    el.setAttribute('data-marke', 'unveraendert');
    // Inhalt ZUERST setzen, dann fokussieren: ein innerHTML-Write auf einem
    // bereits fokussierten contenteditable ersetzt den Textknoten, in dem der
    // Cursor steht — der Browser blurt dabei.
    el.innerHTML = 'Erste Zeile';
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const nachTippen = await page.evaluate(() => {
    const el = document.querySelector('[data-gr="db_test1|uebersicht_bemerkung"]');
    return { marke: el && el.getAttribute('data-marke'), fokus: document.activeElement === el,
             gespeichert: (getById('db_test1').dachuebersicht.bemerkung || '') };
  });
  ok(nachTippen.gespeichert.indexOf('Erste Zeile') >= 0, 'A2 der Text landet im Datensatz');
  ok(nachTippen.marke === 'unveraendert', 'A2 das Feld wurde NICHT neu gebaut (Fokus-Regel)');
  ok(nachTippen.fokus, 'A2 der Fokus bleibt im Feld');

  // A3 — fett/kursiv/unterstrichen ueber die Werkzeugleiste
  const fmt = await page.evaluate(() => {
    const el = document.querySelector('[data-gr="db_test1|uebersicht_dachtypText"]');
    el.innerHTML = 'Wichtig'; el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    // ganzen Inhalt markieren
    const rng = document.createRange(); rng.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
    document.dispatchEvent(new Event('selectionchange'));
    const bar = document.querySelector('.gr-bar');
    const klick = cmd => {
      const b = bar && bar.querySelector('[data-gr-cmd="' + cmd + '"]');
      if (!b) return false;
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    };
    const hatBar = !!bar;
    const g1 = klick('bold'), g2 = klick('italic'), g3 = klick('underline');
    return { hatBar, g1, g2, g3, html: getById('db_test1').dachuebersicht.dachtypText || '' };
  });
  ok(fmt.hatBar, 'A3 die Werkzeugleiste erscheint beim Fokus');
  ok(fmt.g1 && fmt.g2 && fmt.g3, 'A3 F/K/U sind bedienbar');
  ok(/<(b|strong)\b/i.test(fmt.html), 'A3 fett landet im Datensatz');
  ok(/<(i|em)\b/i.test(fmt.html), 'A3 kursiv landet im Datensatz');
  ok(/<u\b|text-decoration/i.test(fmt.html), 'A3 unterstrichen landet im Datensatz');

  // A4 — Absaetze bleiben (mehrere <br> werden NICHT gekappt)
  const abs = await page.evaluate(() => {
    const s = GemaRichtext.sanitize('Eins<br><br><br>Zwei');
    const p = GemaRichtext.sanitize('<div>Eins</div><div>Zwei</div>');
    return { s, br: (s.match(/<br>/g) || []).length, p };
  });
  ok(abs.br === 3, 'A4 drei Umbrueche bleiben drei (frueher auf zwei gekappt)');
  ok(/Eins<br>Zwei/.test(abs.p), 'A4 Bloecke werden zu Umbruechen, der Text bleibt');

  // A5/A6 — Sanitizer: Whitelist, Text bleibt, kein onerror
  const sec = await page.evaluate(async () => {
    window.__pwned = false;
    const gift = 'Vor<script>window.__pwned=true<\/script><img src=x onerror="window.__pwned=true">Nach<b>fett</b><span style="color:red">rot</span>';
    const out = GemaRichtext.sanitize(gift);
    await new Promise(r => setTimeout(r, 300));
    return { out, pwned: window.__pwned };
  });
  ok(!/script|onerror|<img/i.test(sec.out), 'A5 <script>/<img onerror> sind entfernt');
  ok(/Vor/.test(sec.out) && /Nach/.test(sec.out), 'A5 der umgebende Text bleibt (nichts verschwindet still)');
  ok(/<b>fett<\/b>/.test(sec.out), 'A5 erlaubte Auszeichnung bleibt');
  ok(!/color/.test(sec.out), 'A5 nicht gelistete Style-Eigenschaft faellt weg');
  ok(sec.pwned === false, 'A6 eingeschleuster Code laeuft NICHT (DOMParser statt innerHTML)');

  // A7 — KI bekommt Klartext, Ergebnis landet als HTML
  const ki = await page.evaluate(async () => {
    const gerufen = [];
    window.GemaClaude = { rewrite: t => { gerufen.push(t); return Promise.resolve('Neu Zeile1\nZeile2'); } };
    const r = getById('db_test1');
    r.nachbaranschluesse.text = '<b>fett</b> und mehr';
    upsert(r);
    claudeAction('db_test1', 'nachbar_text', 'rewrite');
    await new Promise(x => setTimeout(x, 400));
    return { gerufen, feld: getById('db_test1').nachbaranschluesse.text,
             dom: (document.querySelector('[data-gr="db_test1|nachbar_text"]') || {}).innerHTML || '' };
  });
  ok(ki.gerufen.length === 1 && !/[<>]/.test(ki.gerufen[0]), 'A7 an die KI geht Klartext ohne Auszeichnung');
  ok(/Zeile1<br>Zeile2/.test(ki.feld), 'A7 das Ergebnis landet mit Absaetzen als HTML');
  ok(/Zeile1/.test(ki.dom), 'A7 nur das eine Feld wird nachgezogen');

  // A8 — der PDF-Bericht gibt die Formatierung aus
  const pdf = await page.evaluate(() => {
    const r = getById('db_test1');
    r.dachuebersicht.bemerkung = 'Klar <b>fett</b><br><br>Neuer Absatz';
    r.massnahmen[0].beschreibung = 'Mangel <i>dringend</i>';
    upsert(r);
    // buildHtml ist der reine Bau-Schritt von exportPrint (dieselbe Quelle);
    // exportPrint selbst schreibt in ein echtes Fenster — ein Stub davon wuerde
    // nur den window.open-Aufruf pruefen, nicht den Bericht.
    try { return GemaDachberichtPDF.buildHtml(r, { org: {}, user: {}, objektName: '', objektAdresse: '', templates: {} }); }
    catch (e) { return 'FEHLER:' + e.message; }
  });
  ok(/Klar <b>fett<\/b>/.test(pdf), 'A8 fett steht als Auszeichnung im Bericht (nicht als Text)');
  ok(/Neuer Absatz/.test(pdf) && /<br><br>Neuer Absatz/.test(pdf), 'A8 der Absatz bleibt im Bericht erhalten');
  ok(/Mangel <i>dringend<\/i>/.test(pdf), 'A8 auch die Massnahmen-Texte');
  ok(!/&lt;b&gt;/.test(pdf), 'A8 Gegenprobe: die Auszeichnung ist NICHT escaped');

  await ctx.close();
}

// A9 — ohne den Helfer bleibt das Feld erfassbar
{
  store.clear();
  const ctxA = await browser.newContext();
  await ctxA.route('**/*', route => {
    const u = route.request().url();
    if (u.indexOf('gema_richtext.js') >= 0) return route.fulfill({ contentType: 'text/javascript', body: '/* absichtlich leer */' });
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctxA.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, {
    gema_orgs_v1: [ORG], gema_users_v1: [U_PL],
    gema_session_v1: { token: 'x.y.z', userId: 'u_pl', expires: FUTURE },
    gema_native_view_v1: 'klassisch', gema_coachmarks_done_sp_dachbericht: '1'
  });
  const pA = await ctxA.newPage();
  await pA.goto(BASE + '/sp_dachbericht.html', { waitUntil: 'domcontentloaded' });
  await pA.waitForTimeout(1200);
  await pA.evaluate(() => {
    upsert({ id: 'db_fb', titel: 'Fallback', phase: 'inspektion', orgId: 'org_t', erstelltAm: new Date().toISOString(),
      erstelltVon: { userId: 'u_pl', name: 'P' },
      dachuebersicht: { dachtyp: '', dachtypText: '<b>alt</b> fett', ziegelart: '', ziegelartText: '', bemerkung: '', bilder: [] },
      kapitel: [], nachbaranschluesse: { text: '', bilder: [] }, massnahmen: [] });
    openDetail('db_fb');
  });
  await pA.waitForTimeout(600);
  const fb = await pA.evaluate(() => {
    const ta = Array.from(document.querySelectorAll('#detailInner textarea'));
    return { anzahl: ta.length, wert: ta.length ? ta[0].value : '', keinHelfer: typeof GemaRichtext === 'undefined' };
  });
  ok(fb.keinHelfer, 'A9 der Helfer fehlt (Fallback-Lage hergestellt)');
  ok(fb.anzahl > 0, 'A9 die Felder sind als normales Textfeld erfassbar');
  ok(fb.wert === 'alt fett', 'A9 vorhandenes HTML erscheint darin als Klartext');
  await ctxA.close();
}

// ══════════════════════════════════════════════════════════════════
//  B) APPARATELISTE
// ══════════════════════════════════════════════════════════════════
console.log('\n— B) Apparateliste: IV, Standard, Massangabe, Armaturen —');
{
  store.clear();
  const { ctx, page } = await openPage('/sb_apparateliste.html');
  ok(page.errs.length === 0, 'B0 die Seite bootet ohne Fehler (' + (page.errs[0] || 'keine') + ')');

  // B1 — IV-Katalog aus dem Feedback, bei allen vier Apparaten
  const iv = await page.evaluate(() => {
    const h = window._apHooks;
    return { katalog: h.AP_IV.map(x => x.k), labels: h.AP_IV.map(x => x.l),
             draftFelder: ['bathtubIV', 'washbasinIV', 'wcIV', 'showerIV'].filter(f => h.newDraft('Bad') && typeof h.newDraft('Bad')[f] === 'object') };
  });
  ok(iv.katalog.length === 5, 'B1 fuenf IV-Eintraege');
  ['Haltegriffe', 'Rückenlehne', 'UP-Siphon', 'Ablage', 'Haken'].forEach(l => {
    ok(iv.labels.indexOf(l) >= 0, 'B1 «' + l + '» im Katalog');
  });
  ok(iv.draftFelder.length === 4, 'B1 alle vier Apparate tragen ein IV-Feld');

  // IV wandert in die Zeile
  const ivRow = await page.evaluate(() => {
    const h = window._apHooks;
    const d = h.newDraft('Bad');
    d.qty = 1; d.hasWC = true; d.apStatus = { wc: 'ja' };
    d.wcIV.haltegriffe = true; d.wcIV.haken = true;
    const rows = h.buildRows(d);
    const wc = rows.find(r => r.app === 'WC');
    return { detail: wc ? wc.details : '', labels: h.apIvLabels(d.wcIV) };
  });
  ok(/IV Haltegriffe/.test(ivRow.detail), 'B1 «IV Haltegriffe» steht in der Apparate-Zeile');
  ok(/IV Haken/.test(ivRow.detail), 'B1 «IV Haken» ebenfalls');
  ok(!/IV Ablage/.test(ivRow.detail), 'B1 Gegenprobe: Nicht-Gewaehltes erscheint nicht');

  // B2 — Standard pro Apparat
  const std = await page.evaluate(() => {
    const h = window._apHooks;
    const d = h.newDraft('Bad');
    d.qty = 1; d.standard = 'einfach';
    d.hasWashbasin = true; d.apStatus = { washbasin: 'ja' }; d.washbasinStandard = 'hoch';
    d.hasWC = true; d.apStatus.wc = 'ja';
    const rows = h.buildRows(d);
    return { wt: (rows.find(r => r.app === 'Waschtisch') || {}).details || '',
             wc: (rows.find(r => r.app === 'WC') || {}).details || '' };
  });
  ok(/Standard hoch/.test(std.wt), 'B2 der Apparat-Standard gewinnt (Waschtisch «hoch»)');
  ok(/Standard einfach/.test(std.wc), 'B2 ohne eigenen Wert gilt der Raum-Standard');

  // B3 — Massangabe «Gemäss Planunterlagen»
  const mass = await page.evaluate(() => {
    const h = window._apHooks;
    const d = h.newDraft('Bad'); d.qty = 1;
    d.hasShower = true; d.apStatus = { shower: 'ja' }; d.showerSize = h.AP_SIZE_PLAN;
    const plan = (h.buildRows(d).find(r => r.app === 'Dusche') || {}).details || '';
    const e = h.newDraft('Bad'); e.qty = 1;
    e.hasShower = true; e.apStatus = { shower: 'ja' }; e.showerSize = '90×90';
    const kat = (h.buildRows(e).find(r => r.app === 'Dusche') || {}).details || '';
    return { plan, kat, konstante: h.AP_SIZE_PLAN };
  });
  ok(mass.konstante === 'plan', 'B3 die Plan-Wahl hat einen eigenen Wert');
  ok(/Mass gemäss Planunterlagen/.test(mass.plan), 'B3 «Gemäss Planunterlagen» erscheint in der Zeile');
  ok(/Mass 90×90 cm/.test(mass.kat), 'B3 Gegenprobe: ein Katalogmass erscheint unveraendert');

  // B4 — Dusche: Armatur + benannte Accessoires
  const du = await page.evaluate(() => {
    const h = window._apHooks;
    const d = h.newDraft('Bad'); d.qty = 1;
    d.hasShower = true; d.apStatus = { shower: 'ja' };
    d.showerFaucet = 'UP'; d.showerThermostat = true;
    d.showerGarn.gleitstange = true; d.showerGarn.brause = true;
    const neu = (h.buildRows(d).find(r => r.app === 'Dusche') || {}).details || '';
    // Altbestand: nur der alte Boolean
    const a = h.newDraft('Bad'); a.qty = 1;
    a.hasShower = true; a.apStatus = { shower: 'ja' }; a.showerAccessories = true;
    const alt = (h.buildRows(a).find(r => r.app === 'Dusche') || {}).details || '';
    return { neu, alt, katalog: h.AP_SHOWER_GARN.map(x => x.l) };
  });
  ok(/Armatur UP/.test(du.neu) && /Thermostat/.test(du.neu), 'B4 Armatur UP + Thermostat in der Zeile');
  ok(/Gleitstange/.test(du.neu) && /Handbrause/.test(du.neu), 'B4 die benannten Accessoires stehen einzeln');
  ok(!/Accessoires/.test(du.neu), 'B4 der pauschale Alt-Text erscheint daneben nicht mehr');
  ok(/Accessoires/.test(du.alt), 'B4 Altbestand ohne benannte Wahl bleibt lesbar');
  ['Gleitstange', 'Brauseschlauch', 'Handbrause', 'Haltegriff', 'Seifenhalter'].forEach(l => {
    ok(du.katalog.indexOf(l) >= 0, 'B4 «' + l + '» im Accessoire-Katalog');
  });

  // B5 — Waschtisch: Bedienung + Spiegelschrank UP/AP
  const wt = await page.evaluate(() => {
    const h = window._apHooks;
    const d = h.newDraft('Bad'); d.qty = 1;
    d.hasWashbasin = true; d.apStatus = { washbasin: 'ja' };
    d.washbasinFaucet = 'KW'; d.washbasinFaucetTyp = 'sensor';
    d.mirror = 'spiegelschrank'; d.mirrorMount = 'UP';
    const mitSchrank = (h.buildRows(d).find(r => r.app === 'Waschtisch') || {}).details || '';
    const e = h.newDraft('Bad'); e.qty = 1;
    e.hasWashbasin = true; e.apStatus = { washbasin: 'ja' };
    e.mirror = 'spiegel'; e.mirrorMount = 'AP'; // Altlast: Montage ohne Schrank
    const nurSpiegel = (h.buildRows(e).find(r => r.app === 'Waschtisch') || {}).details || '';
    return { mitSchrank, nurSpiegel };
  });
  ok(/Armatur nur KW/.test(wt.mitSchrank), 'B5 «Nur KW» ist waehlbar');
  ok(/Sensor/i.test(wt.mitSchrank), 'B5 die Bedienung steht in der Zeile');
  ok(/Spiegelschrank UP/.test(wt.mitSchrank), 'B5 Spiegelschrank mit Montageart');
  ok(/Spiegel/.test(wt.nurSpiegel) && !/Spiegel AP|Spiegel UP/.test(wt.nurSpiegel),
     'B5 ohne Schrank wird KEINE Montageart behauptet');

  // B6 — Badewanne ohne Möbel UND ohne Unterbauelement (Gegenprobe: Waschtisch hat Möbel).
  // Feedback 25.08.2026: gemeint war das Unterbauelement — es ist ersatzlos entfallen.
  const moebel = await page.evaluate(() => {
    const h = window._apHooks;
    const w = h.wizard();
    const zeigen = (schritt, felder, patch) => {
      w.open = true; w.mode = 'add'; w.editId = null;
      w.draft = h.newDraft(); w.draft.qty = 1;
      felder.forEach(f => { w.draft[f] = true; });
      Object.assign(w.draft, patch || {});
      w.draft.apStatus = { bathtub: 'ja', washbasin: 'ja' };
      w.steps = h.stepsFor(w.draft.roomType);
      w.step = w.steps.findIndex(s => s.k === schritt);
      h.renderWiz();
      const alles = (document.getElementById('modalBody') || {}).textContent || '';
      return { alles };
    };
    const bad = zeigen('bath', ['hasBathtub']);
    const wtb = zeigen('washbasin', ['hasWashbasin']);
    // Bestandsschutz: ein Alt-Raum mit gesetztem Wert bekommt einen Hinweis + Entfernen-Knopf
    const alt = zeigen('bath', ['hasBathtub'], { bathtubUnderbuild: true });
    const altKnopf = !!document.querySelector('#modalBody button[onclick*="apBathUnterbauWeg"]');
    let altWeg = null;
    if (typeof window.apBathUnterbauWeg === 'function') {
      window.apBathUnterbauWeg();
      altWeg = { wert: h.wizard().draft.bathtubUnderbuild,
                 text: (document.getElementById('modalBody') || {}).textContent || '' };
    }
    // Ein NEUER Raum erbt den entfallenen Wert nie aus den Voreinstellungen
    const frisch = h.newDraft().bathtubUnderbuild;
    return { badMoebel: /Möbel/.test(bad.alles), wtMoebel: /Möbel/.test(wtb.alles),
             badUnterbau: /Unterbauelement/.test(bad.alles),
             altHinweis: /Unterbauelement/.test(alt.alles), altKnopf, altWeg, frisch };
  });
  ok(!moebel.badMoebel, 'B6 die Badewanne hat KEINE Möbel-Gruppe');
  ok(moebel.wtMoebel, 'B6 Gegenprobe: beim Waschtisch gibt es sie weiterhin');
  ok(!moebel.badUnterbau, 'B6 die Badewanne hat KEINE Unterbauelement-Gruppe mehr');
  ok(moebel.frisch === false, 'B6 ein neuer Raum erbt den entfallenen Wert nicht');
  ok(moebel.altHinweis, 'B6 Bestandsschutz: Alt-Raum mit dem Wert wird ausgewiesen');
  ok(moebel.altKnopf, 'B6 Bestandsschutz: mit Entfernen-Knopf');
  ok(moebel.altWeg && moebel.altWeg.wert === false, 'B6 Entfernen setzt den Alt-Wert zurueck');
  ok(moebel.altWeg && !/Unterbauelement/.test(moebel.altWeg.text), 'B6 danach ist der Hinweis weg');

  // B6b — kein STILLER Verlust: der Alt-Wert steht weiter in Liste/Bericht/CSV
  const altZeile = await page.evaluate(() => {
    const h = window._apHooks;
    const mk = (unter) => {
      const r = h.newDraft();
      r.roomType = 'Badezimmer'; r.hasBathtub = true;
      r.hasWashbasin = r.hasWC = r.hasShower = false;
      r.bathtubUnderbuild = unter;
      return (h.buildRows(r) || []).filter(z => /Badewanne/.test(z.app || ''))
        .map(z => String(z.details || '')).join(' | ');
    };
    return { mit: mk(true), ohne: mk(false) };
  });
  ok(/Unterbauelement/.test(altZeile.mit), 'B6b Alt-Wert bleibt in der Positionszeile sichtbar');
  ok(!/Unterbauelement/.test(altZeile.ohne), 'B6b ohne den Wert steht er nicht da');

  // B7 — «+» statt «&»
  const plus = await page.evaluate(() => {
    const w = window._apHooks.wizard();
    const h = window._apHooks;
    const raus = [];
    w.open = true; w.mode = 'add'; w.editId = null;
    ['bath', 'washbasin', 'wc', 'shower'].forEach(s => {
      w.draft = h.newDraft();
      w.draft.hasBathtub = w.draft.hasWashbasin = w.draft.hasWC = w.draft.hasShower = true;
      w.draft.apStatus = { bathtub: 'ja', washbasin: 'ja', wc: 'ja', shower: 'ja' };
      w.steps = h.stepsFor(w.draft.roomType);
      w.step = w.steps.findIndex(x => x.k === s);
      h.renderWiz();
      Array.from(document.querySelectorAll('#modalBody .gbox-title')).forEach(e => raus.push(e.textContent));
    });
    return raus;
  });
  ok(plus.length > 0, 'B7 Gruppentitel gefunden (' + plus.length + ')');
  ok(plus.every(t => t.indexOf(' & ') < 0), 'B7 kein «&» mehr in den Gruppentiteln');

  // B8 — Altbestand ohne die neuen Felder
  const alt = await page.evaluate(() => {
    const h = window._apHooks;
    const altRaum = { id: 'r_alt', roomType: 'Bad', floor: 'EG', qty: 1, hasWC: true, wcType: 'wand',
                      flushType: 'UP', upCisternHeight: '98', wcSeat: true };
    let fehler = '';
    let rows = [];
    try { rows = h.buildRows(altRaum); } catch (e) { fehler = e.message; }
    const norm = h.normDraft(JSON.parse(JSON.stringify(altRaum)));
    return { fehler, detail: (rows.find(r => r.app === 'WC') || {}).details || '',
             ergaenzt: !!norm.wcIV && typeof norm.wcIV === 'object' && norm.wcIV.haken === false };
  });
  ok(!alt.fehler, 'B8 ein Raum ohne die neuen Felder rendert fehlerfrei');
  ok(/Wand-WC/.test(alt.detail) && !/IV /.test(alt.detail), 'B8 und ohne erfundene IV-Angaben');
  ok(alt.ergaenzt, 'B8 normDraft ergaenzt die Felder leer (additiv)');

  // B9 — escCSV
  const csv = await page.evaluate(() => {
    const h = window._apHooks;
    return { schlicht: h.escCSV('Waschtisch'), semikolon: h.escCSV('a;b'), leer: h.escCSV(''), nullw: h.escCSV(null) };
  });
  ok(csv.schlicht === 'Waschtisch', 'B9 escCSV liefert den Wert zurueck (frueher leer)');
  ok(/^".*"$/.test(csv.semikolon), 'B9 ein Semikolon wird gequotet');
  ok(csv.leer === '' && csv.nullw === '', 'B9 leer bleibt leer');

  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
//  C) AUSSCHREIBUNGSUNTERLAGEN
// ══════════════════════════════════════════════════════════════════
console.log('\n— C) Ausschreibungsunterlagen: BKP 256, Gewerk-Zeilen, Falten, Word —');
{
  store.clear();
  const { ctx, page } = await openPage('/pm_ausschreibungsunterlagen.html');
  ok(page.errs.length === 0, 'C0 die Seite bootet ohne Fehler (' + (page.errs[0] || 'keine') + ')');

  // C1 — BKP 256 mit den sechs Positionen
  const b256 = await page.evaluate(() => {
    const n25 = BKP_KOMPLETT.find(x => x.id === '2').kinder.find(x => x.id === '25');
    const k = n25.kinder.find(x => x.id === '256');
    return { kinder: (k.kinder || []).map(x => ({ id: x.id, t: x.titel, lief: !!x.istLieferung })) };
  });
  const soll = [
    ['256.0', 'Lieferung Installationselemente', true],
    ['256.1', 'Montage Installationselemente', false],
    ['256.2', 'Lieferung Beplankung', true],
    ['256.3', 'Montage Beplankung', false],
    ['256.4', 'Lieferung Schallschutzmassnahmen', true],
    ['256.5', 'Montage Schallschutzmassnahmen', false]
  ];
  ok(b256.kinder.length === 6, 'C1 sechs Positionen unter BKP 256');
  soll.forEach(([id, t, lief], i) => {
    const k = b256.kinder[i] || {};
    ok(k.id === id && k.t === t, 'C1 ' + id + ' «' + t + '»');
    ok(k.lief === lief, 'C1 ' + id + (lief ? ' ist eine Lieferung' : ' ist keine Lieferung'));
  });

  // C2 — Gewerk-Zeilen erscheinen nicht als Position
  const gew = await page.evaluate(() => {
    // walkBKP nimmt EINEN Knoten (so ruft es auch initBKPPositionenAlle) —
    // der Baum wird darum wie dort ueber die Untergruppen gelaufen.
    const pos = [];
    BKP_KOMPLETT.forEach(h => (h.kinder || []).forEach(u => walkBKP(u, pos)));
    const bkps = pos.map(p => p.bkp);
    return { total: bkps.length,
             zweistellig: bkps.filter(b => String(b).length <= 2),
             hat256_0: bkps.indexOf('256.0') >= 0,
             hat255: bkps.indexOf('255') >= 0,
             gewerkFn: [istGewerkZeile({ bkp: '25' }), istGewerkZeile({ bkp: '255' }), istGewerkZeile({ bkp: '256.0' })] };
  });
  ok(gew.zweistellig.length === 0, 'C2 keine 2-stelligen Gewerk-Zeilen mehr als Position (' + gew.zweistellig.join(',') + ')');
  ok(gew.hat255, 'C2 3-stellige Gruppen bleiben (sie tragen die Kopfzeile)');
  ok(gew.hat256_0, 'C2 die neuen 256er-Positionen sind dabei');
  ok(gew.gewerkFn[0] === true && gew.gewerkFn[1] === false && gew.gewerkFn[2] === false,
     'C2 istGewerkZeile trennt Gewerk (25) von Gruppe (255) und Position (256.0)');

  // Ausschreibung anlegen und BKP-Ansicht oeffnen
  await page.evaluate(() => {
    // Die Positionen kommen sonst ueber die Gewerk-Lizenz des Kontos; hier wird
    // der Sanitaer-Zweig direkt geladen, damit der Test nicht daran haengt.
    const n25 = BKP_KOMPLETT.find(x => x.id === '2').kinder.find(x => x.id === '25');
    S.ausschreibungen = S.ausschreibungen || [];
    S.ausschreibungen.push({ id: 'a_t', name: 'Testausschreibung', orgId: 'org_t', ownerOrgId: 'org_t',
      erstelltVonUserId: 'u_pl', modell: 'pauschal', status: 'entwurf',
      lose: [{ id: 'los_t', name: 'LOS 1', positionen: initBKPPositionen(n25) }], bkp: [],
      beteiligte: [], plaene: [], unterlagen: [] });
    S.activeAusId = 'a_t'; sv(); nav('pbkp');
  });
  await page.waitForTimeout(600);

  // C3 — Sammel-Schalter
  const falt = await page.evaluate(() => {
    const zaehl = () => document.querySelectorAll('.bkp-group').length;
    const sichtbar = () => document.querySelectorAll('.bkp-group.open').length;
    const knopf = document.getElementById('bkpFoldBtn');
    const vorher = sichtbar();
    if (knopf) knopf.click();
    const nachAuf = sichtbar();
    const txtAuf = knopf ? knopf.textContent : '';
    if (knopf) knopf.click();
    const nachZu = sichtbar();
    return { knopf: !!knopf, vorher, nachAuf, nachZu, txtAuf, txtZu: knopf ? knopf.textContent : '', total: zaehl() };
  });
  ok(falt.knopf, 'C3 der Sammel-Schalter existiert');
  ok(falt.vorher === 0, 'C4 die Standardansicht startet eingeklappt');
  ok(falt.nachAuf > 0, 'C3 ein Klick klappt alle Gruppen auf (' + falt.nachAuf + ')');
  ok(falt.nachZu === 0, 'C3 der zweite Klick klappt sie wieder zu');
  ok(/aufklappen/i.test(falt.txtAuf) === false, 'C3 die Beschriftung folgt dem Zustand');
  ok(/aufklappen/i.test(falt.txtZu), 'C3 und zeigt danach wieder «Alle aufklappen»');

  // C4 — Karte «BKP-Positionen» in pdet
  const karte = await page.evaluate(() => {
    nav('pdet');
    const nachRender = () => {
      const body = document.getElementById('bkpPosBody');
      const hd = document.querySelector('#cardBkpPos .card-hd');
      return { da: !!body, offen: !!body && body.style.display !== 'none', hd: !!hd };
    };
    const start = nachRender();
    toggleBkpPos();
    const auf = nachRender();
    toggleBkpPos();
    const zu = nachRender();
    return { start, auf, zu, gespeichert: localStorage.getItem('gema_aus_bkppos_offen_v1') };
  });
  ok(karte.start.da && karte.start.hd, 'C4 die Karte «BKP-Positionen» ist da');
  ok(!karte.start.offen, 'C4 sie startet eingeklappt');
  ok(karte.auf.offen, 'C4 der Klick klappt sie auf');
  ok(!karte.zu.offen, 'C4 und wieder zu');
  ok(karte.gespeichert === '0', 'C4 der Zustand wird pro Geraet gemerkt');

  // C5 — Word hochladbar
  const word = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    const accepts = Array.from(document.querySelectorAll('input[type="file"]')).map(i => i.getAttribute('accept') || '');
    return { markup: (html.match(/accept="[^"]*doc[^"]*"/g) || []).length,
             docx: html.indexOf('.docx') >= 0, accepts };
  });
  ok(word.markup >= 1, 'C5 Datei-Felder akzeptieren Word (' + word.markup + ' Stellen)');
  ok(word.docx, 'C5 .docx ist genannt');

  // C6 — Nebeneffekt: Gasloeschanlage setzt sich NICHT in 256.0
  const nebeneffekt = await page.evaluate(() => {
    const map = (window.GemaProdukte && GemaProdukte.OA_BKP_MAP) || {};
    const pber = document.documentElement.innerHTML;
    return { gas: map.gasloeschanlage, andere: map.enthaertung,
             keine256: !/gasloeschanlage[^}]*bkp:'256\.0'/.test(pber) };
  });
  ok(!nebeneffekt.gas, 'C6 die Gasloeschanlage traegt keinen BKP-Code mehr');
  ok(nebeneffekt.andere === '253.0', 'C6 Gegenprobe: die uebrigen Zuordnungen bleiben');
  ok(nebeneffekt.keine256, 'C6 auch die Modul-Uebersicht behauptet 256.0 nicht mehr');

  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
