// Feedback 20.08.2026 (Robin) — zwei Punkte:
//
//  A) Schadensbericht: «Foto hinzufügen» soll auch die MEDIATHEK anbieten —
//     Kachel gesplittet (oben direkt Kamera, unten direkt Mediathek), damit
//     man sich einen Klick spart. Bis dahin erzwang jeder Weg die Kamera
//     (capture='environment'); ein vorhandenes Bild war nur über den
//     Systemdialog erreichbar.
//
//  B) Werkzeugmanagement: der Scan-Knopf oben rechts soll nicht nur QR,
//     sondern auch NFC anbieten, damit man mit einem gefundenen Werkzeug
//     direkt in dessen Ansicht landet. Der NFC-Knopf existierte, war aber
//     hinter ('NDEFReader' in window) versteckt — auf iPhone/iPad (dem
//     Hauptgerät der Baustellen-App) also unsichtbar, obwohl der Tag DORT
//     funktioniert (iOS liest ihn im Hintergrund und öffnet die Adresse).
//
// Deckt ab:
//  A1) Statik: sdPickFiles kennt beide Quellen, capture nur bei 'kamera',
//      multiple auf beiden Wegen, zu grosse Dateien werden BENANNT.
//  A2) Statik: serielle Kette (_pcDone/_sdPcWeiter) aus BEIDEN Dialog-Enden.
//  A3) Browser: Kachel rendert zwei Knöpfe mit den richtigen Quellen; der
//      Container ist nicht mehr klickbar (kein doppelter Weg).
//  A4) Browser: 'galerie' erzeugt einen Input OHNE capture MIT multiple,
//      'kamera' MIT capture — der eigentliche Kern des Feedbacks.
//  A5) Browser: Mehrfachauswahl wird SERIELL abgearbeitet (jedes Bild bekommt
//      seinen eigenen Kommentar-Dialog), Verwerfen bricht die Kette nicht ab.
//  A6) Browser: Messfoto-Dialog bietet dieselben zwei Wege, capture wird für
//      den nächsten Kamera-Klick wieder gesetzt.
//  B1) Statik: kein NDEFReader-Gate mehr an Hero-Knopf und nativem Screen.
//  B2) Browser OHNE NDEFReader: NFC-Knopf sichtbar, Klick erklärt den Weg
//      (Dialog) statt still auf die Kamera zu wechseln.
//  B3) Browser MIT NDEFReader: unverändert echter NFC-Scan (kein Dialog).
//
// Aufruf:  CHROME=<chromium> node scripts/feedback_20260820_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8931;
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

const SD = await readFile(join(ROOT, 'sd_schadensbericht.html'), 'utf8');
const WZ = await readFile(join(ROOT, 'if_werkzeug.html'), 'utf8');

// ── A1/A2) Statik Schadensbericht ──────────────────────────────────
console.log('— A1) sdPickFiles: Quelle entscheidet über capture —');
ok(/function sdPickFiles\(quelle, multiple, cb\)/.test(SD),
  'sdPickFiles(quelle, multiple, cb) existiert');
ok(/if \(quelle !== 'galerie'\) inp\.setAttribute\('capture', 'environment'\)/.test(SD),
  "capture wird NUR gesetzt, wenn die Quelle nicht 'galerie' ist");
ok(/if \(multiple\) inp\.multiple = true/.test(SD),
  'multiple gilt auf beiden Wegen (Desktop/iPad zeigt auch beim 📷-Weg einen Dateidialog)');
ok(/document\.body\.appendChild\(inp\)[\s\S]{0,60}_sdPhotoInput = inp/.test(SD),
  'Input hängt im DOM + globale Referenz (iOS-GC-Regel)');
ok(/zuGross[\s\S]{0,300}alert\(zuGross \+ ' Bild\(er\) über 10 MB wurden übersprungen\.'\)/.test(SD),
  'zu grosse Dateien werden gezählt und BENANNT, nicht still verschluckt');
ok(/function sdTriggerPhotoUpload\(schadenId, phase, raumIdx, quelle\)/.test(SD)
  && /sdPickFiles\(quelle \|\| 'kamera', true,/.test(SD),
  'sdTriggerPhotoUpload nimmt die Quelle additiv entgegen (Altaufrufe → Kamera)');

console.log('— A2) Serielle Kette bei Mehrfachauswahl —');
ok(/function sdResizeAndStore\(file, done\)/.test(SD), 'sdResizeAndStore nimmt eine Fortsetzung entgegen');
ok(/_pcDone = _fertig;[\s\S]{0,200}photoCommentModal/.test(SD),
  'die Fortsetzung wird VOR dem Öffnen des Kommentar-Dialogs gemerkt');
ok(/function _sdPcWeiter\(\)[\s\S]{0,180}setTimeout\(d, 60\)/.test(SD),
  '_sdPcWeiter stösst das nächste Bild erst nach dem Schliessen an');
ok(/function sdSavePhotoComment\(\)[\s\S]{0,400}_sdPcWeiter\(\)/.test(SD),
  'Speichern setzt die Kette fort');
ok(/function sdClosePhotoComment\(\)[\s\S]{0,400}_sdPcWeiter\(\)/.test(SD),
  'Verwerfen setzt die Kette ebenfalls fort (kein stiller Abbruch)');
// Der alert-Text enthaelt selbst Klammern — darum bis zum Zeilenende matchen.
ok(/reader\.onerror = function\(\) \{ alert\(.*_fertig\(\); \}/.test(SD)
  && /img\.onerror = function\(\) \{ alert\(.*_fertig\(\); \}/.test(SD)
  && /alert\('Foto ist nach Komprimierung immer noch zu gross[\s\S]{0,80}_fertig\(\);/.test(SD),
  'auch die Fehlerpfade (lesen / verarbeiten / zu gross) setzen die Kette fort');

// ── B1) Statik Werkzeug ────────────────────────────────────────────
console.log('— B1) NFC-Knopf ohne NDEFReader-Gate —');
ok(/if\(heroNfc\)heroNfc\.style\.display='inline-flex'/.test(WZ),
  'Hero-NFC-Knopf wird ohne NDEFReader-Prüfung eingeblendet');
ok(!/heroNfc&&\('NDEFReader' in window\)/.test(WZ),
  'das alte Gate am Hero-Knopf ist weg');
ok(!/\('NDEFReader' in window\)\?'<button class="gn-icon-btn" data-nat-nfc/.test(WZ),
  'auch der native Handy-Screen zeigt den NFC-Knopf immer');
ok(/GemaDialog\.confirm\(\{title:'📡 NFC-Tag direkt ans Gerät halten'/.test(WZ),
  'ohne Web-NFC erklärt ein Dialog den funktionierenden iOS-Weg');
ok(/confirmLabel:'📷 QR-Code scannen'[\s\S]{0,140}if\(ok\) _wzScanWithCamera\(\)/.test(WZ),
  'der QR-Scan ist eine bewusste Wahl im Dialog, kein stiller Wechsel');

// ── Browser-Teil ───────────────────────────────────────────────────
const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';

const SEED = {
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }],
  gema_session_v1: { token: JWT, userId: 'u_p', expires: FUTURE },
  gema_objekte_v1: { objekte: [{ id: 'obj1', name: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich' }], beteiligte: [], activeObjektId: '' },
  gema_coachmarks_done_sd_schadensbericht_v1: true,
  gema_coachmarks_done_if_werkzeug_v1: true
};

const SCHADEN = {
  id: 'sd_f', typ: 'wasserschaden', titel: 'Fototest', objektId: 'obj1', phase: 'trocknung',
  beschreibung: '', ursache: '', raeume: ['Bad'],
  versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
  erstelltAm: '2026-08-01', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
  zustandsanalyse: { leckortung: '', schadenausmass: '', massnahmen: [], fotos: [], abgeschlossenAm: null },
  trocknung: { gestartetAm: '2026-08-01', beendetAm: null, messpunkte: [{ id: 'mp1', name: 'Wand Bad', raum: 'Bad', messungen: [] }], geraete: [], fotos: [], notizen: '' },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

const browser = await chromium.launch({ executablePath: CHROME });

async function mkCtx(seedExtra, init) {
  const ctx = await browser.newContext();
  const cloud = new Map(seedExtra || []);
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (!isSb) return route.abort();
    const m = route.request().method();
    if (m === 'GET' && u.indexOf('module_key=eq.schadensbericht') >= 0) {
      const rows = [...cloud.entries()].map(([k, v]) => ({ data_key: k, payload: { data: v, _lm: '2026-08-01T08:00:00Z' } }));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (m === 'POST' || m === 'PATCH') {
      try {
        const body = JSON.parse(route.request().postData() || '[]');
        (Array.isArray(body) ? body : [body]).forEach(r => {
          if (r && r.data_key && r.payload && r.payload.data) cloud.set(r.data_key, r.payload.data);
        });
      } catch (e) { }
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ contentType: 'application/json', body: m === 'GET' ? '[]' : '{}' });
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, SEED);
  if (init) await ctx.addInitScript(init);
  return ctx;
}

// Beobachtet die zur Laufzeit erzeugten <input type=file> und merkt sich ihre
// Attribute — genau daran hängt der Unterschied Kamera ⇄ Mediathek.
const SPY = () => {
  window.__inputs = [];
  const orig = document.createElement.bind(document);
  document.createElement = function (t) {
    const el = orig(t);
    if (String(t).toLowerCase() === 'input') {
      const cl = el.click.bind(el);
      el.click = function () {
        if (el.type === 'file') {
          window.__inputs.push({
            capture: el.getAttribute('capture'),
            multiple: !!el.multiple,
            imDom: !!el.parentNode,
            id: el.id || ''
          });
          window.__lastInput = el;
          return;           // kein echter Dateidialog im Test
        }
        return cl();
      };
    }
    return el;
  };
  // Auch der statische Mess-Input (#messPhotoInput) wird abgefangen.
  document.addEventListener('DOMContentLoaded', () => {
    const mi = document.getElementById('messPhotoInput');
    if (mi) mi.click = function () {
      window.__inputs.push({ capture: mi.getAttribute('capture'), multiple: !!mi.multiple, imDom: true, id: 'messPhotoInput' });
    };
  });
};

console.log('— A3/A4/A5/A6) Schadensbericht im Browser —');
const ctxA = await mkCtx([['schaden:sd_f', JSON.parse(JSON.stringify(SCHADEN))]], SPY);
const pA = await ctxA.newPage();
const errA = []; pA.on('pageerror', e => errA.push(e.message));
pA.on('dialog', d => d.accept());   // alert() nie blockieren lassen
await pA.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
await pA.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => { });
await pA.waitForTimeout(400);

try {
  await pA.evaluate(() => sdOpenDetail('sd_f'));
  await pA.waitForTimeout(350);

  const tro = await pA.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(tro.indexOf('photo-add-split') >= 0, 'Foto-Kachel ist gesplittet (.photo-add-split)');
  ok(/sdTriggerPhotoUpload\('sd_f','trocknung',0,'kamera'\)/.test(tro), 'obere Hälfte geht direkt in die Kamera');
  ok(/sdTriggerPhotoUpload\('sd_f','trocknung',0,'galerie'\)/.test(tro), 'untere Hälfte geht direkt in die Mediathek');
  ok(tro.indexOf('Aus Mediathek') >= 0 && tro.indexOf('Foto aufnehmen') >= 0, 'beide Wege sind beschriftet');

  const halb = await pA.evaluate(() => {
    const el = document.querySelector('#acc_trocknung .photo-add-split');
    if (!el) return null;
    return { container: el.getAttribute('onclick'), knoepfe: el.querySelectorAll('button.pa-half').length };
  });
  ok(halb && halb.knoepfe === 2, 'die Kachel enthält genau zwei Knöpfe');
  ok(halb && !halb.container, 'der Container selbst ist NICHT mehr klickbar (kein doppelter Weg)');

  // A4 — der eigentliche Kern
  await pA.evaluate(() => { window.__inputs = []; sdTriggerPhotoUpload('sd_f', 'trocknung', 0, 'galerie'); });
  await pA.waitForTimeout(120);
  let inps = await pA.evaluate(() => window.__inputs);
  ok(inps.length === 1 && inps[0].capture === null, 'Mediathek-Weg: Input OHNE capture (öffnet die Mediathek)');
  ok(inps.length === 1 && inps[0].multiple === true, 'Mediathek-Weg: Mehrfachauswahl erlaubt');
  ok(inps.length === 1 && inps[0].imDom === true, 'Input hängt beim Klick im DOM (iOS-GC)');

  await pA.evaluate(() => { window.__inputs = []; sdTriggerPhotoUpload('sd_f', 'trocknung', 0, 'kamera'); });
  await pA.waitForTimeout(120);
  inps = await pA.evaluate(() => window.__inputs);
  ok(inps.length === 1 && inps[0].capture === 'environment', 'Kamera-Weg: Input MIT capture=environment');

  await pA.evaluate(() => { window.__inputs = []; sdTriggerPhotoUpload('sd_f', 'trocknung', 0); });
  await pA.waitForTimeout(120);
  inps = await pA.evaluate(() => window.__inputs);
  ok(inps.length === 1 && inps[0].capture === 'environment', 'ohne Quelle (Altaufruf) bleibt es die Kamera');

  // A5 — zwei Bilder aus der Mediathek: seriell, jedes mit eigenem Dialog
  const anzahlVorher = await pA.evaluate(() => sdGetById('sd_f').trocknung.fotos.length);
  await pA.evaluate(async (jpg) => {
    window.__inputs = [];
    sdTriggerPhotoUpload('sd_f', 'trocknung', 0, 'galerie');
    await new Promise(r => setTimeout(r, 60));
    const inp = window.__lastInput;
    const mk = (n) => { const b = atob(jpg.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new File([a], n, { type: 'image/jpeg' }); };
    const dt = new DataTransfer(); dt.items.add(mk('a.jpg')); dt.items.add(mk('b.jpg'));
    Object.defineProperty(inp, 'files', { value: dt.files, configurable: true });
    inp.onchange();
  }, TINY_JPG);
  await pA.waitForTimeout(500);
  let dlgOffen = await pA.evaluate(() => !document.getElementById('photoCommentModal').classList.contains('hidden'));
  ok(dlgOffen, 'Mehrfachauswahl: der Kommentar-Dialog des ERSTEN Bildes ist offen');
  await pA.evaluate(() => { document.getElementById('pcComment').value = 'Bild 1'; sdSavePhotoComment(); });
  await pA.waitForTimeout(450);
  dlgOffen = await pA.evaluate(() => !document.getElementById('photoCommentModal').classList.contains('hidden'));
  ok(dlgOffen, 'nach dem Speichern öffnet der Dialog des ZWEITEN Bildes (serielle Kette)');
  await pA.evaluate(() => { document.getElementById('pcComment').value = 'Bild 2'; sdSavePhotoComment(); });
  await pA.waitForTimeout(450);
  const fotos = await pA.evaluate(() => sdGetById('sd_f').trocknung.fotos.map(f => f.kommentar));
  ok(fotos.length === anzahlVorher + 2, 'beide Bilder wurden übernommen (' + fotos.length + ')');
  ok(fotos.indexOf('Bild 1') >= 0 && fotos.indexOf('Bild 2') >= 0, 'jedes Bild hat seinen eigenen Kommentar');
  ok((await pA.evaluate(() => sdGetById('sd_f').trocknung.fotos.every(f => f.raum === 'Bad'))),
    'beide Bilder sind dem angeklickten Bereich zugeordnet');

  // Verwerfen bricht die Kette nicht ab
  await pA.evaluate(async (jpg) => {
    sdTriggerPhotoUpload('sd_f', 'trocknung', 0, 'galerie');
    await new Promise(r => setTimeout(r, 60));
    const inp = window.__lastInput;
    const mk = (n) => { const b = atob(jpg.split(',')[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new File([a], n, { type: 'image/jpeg' }); };
    const dt = new DataTransfer(); dt.items.add(mk('c.jpg')); dt.items.add(mk('d.jpg'));
    Object.defineProperty(inp, 'files', { value: dt.files, configurable: true });
    inp.onchange();
  }, TINY_JPG);
  await pA.waitForTimeout(500);
  await pA.evaluate(() => sdClosePhotoComment());   // erstes Bild verwerfen
  await pA.waitForTimeout(450);
  dlgOffen = await pA.evaluate(() => !document.getElementById('photoCommentModal').classList.contains('hidden'));
  ok(dlgOffen, 'Verwerfen bricht die Kette nicht ab — das nächste Bild kommt trotzdem');
  await pA.evaluate(() => sdClosePhotoComment());
  await pA.waitForTimeout(300);

  // A6 — Messfoto-Dialog
  await pA.evaluate(() => sdOpenMessAdd('sd_f', 'mp1', false));
  await pA.waitForTimeout(300);
  const messHtml = await pA.evaluate(() => (document.getElementById('messPhotoPreview') || {}).innerHTML || '');
  ok(/sdMessTakePhoto\('kamera'\)/.test(messHtml) && /sdMessTakePhoto\('galerie'\)/.test(messHtml),
    'Messfoto-Box bietet beide Wege');
  await pA.evaluate(() => { window.__inputs = []; sdMessTakePhoto('galerie'); });
  await pA.waitForTimeout(120);
  inps = await pA.evaluate(() => window.__inputs);
  ok(inps.length === 1 && inps[0].capture === null, 'Messfoto Mediathek: capture entfernt');
  await pA.evaluate(() => { window.__inputs = []; sdMessTakePhoto('kamera'); });
  await pA.waitForTimeout(120);
  inps = await pA.evaluate(() => window.__inputs);
  ok(inps.length === 1 && inps[0].capture === 'environment', 'Messfoto Kamera: capture wieder gesetzt (nicht dauerhaft verloren)');

  ok(errA.length === 0, 'Schadensbericht: keine JS-Fehler (' + (errA[0] || '—') + ')');
} finally {
  await pA.close(); await ctxA.close();
}

// ── B2/B3) Werkzeug ────────────────────────────────────────────────
console.log('— B2) Werkzeug OHNE Web-NFC (iPhone/iPad/Desktop) —');
const WZ_SEED = {
  ...SEED,
  gema_werkzeug: [{ id: 'wz_1', name: 'Bohrhammer', cat: 'bohren', orgId: 'org_t', bought: '2026-01-01' }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Magazinerin', roleIds: ['role_magaziner'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }]
};
async function wzCtx(mitNfc) {
  const ctx = await browser.newContext({
    // Touch erzwingen: der Hero-Scan-Block erscheint nur auf Touch-Geräten
    // (bzw. für Prüfer) — genau der Fall, um den es geht.
    hasTouch: true, isMobile: true, viewport: { width: 820, height: 1100 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (!isSb) return route.abort();
    return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, WZ_SEED);
  if (mitNfc) {
    await ctx.addInitScript(() => {
      window.__nfcScans = 0;
      window.NDEFReader = function () {
        this.scan = function () { window.__nfcScans++; return Promise.resolve(); };
        this.addEventListener = function () { };
      };
    });
  } else {
    await ctx.addInitScript(() => { try { delete window.NDEFReader; } catch (e) { } });
  }
  return ctx;
}

for (const mitNfc of [false, true]) {
  const ctxB = await wzCtx(mitNfc);
  const pB = await ctxB.newPage();
  const errB = []; pB.on('pageerror', e => errB.push(e.message));
  await pB.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await pB.waitForTimeout(1400);
  const lbl = mitNfc ? 'MIT Web-NFC (Android)' : 'OHNE Web-NFC (iPad)';
  try {
    const sicht = await pB.evaluate(() => {
      const g = id => { const e = document.getElementById(id); return e ? getComputedStyle(e).display : 'weg'; };
      return { wrap: g('wzHeroScanWrap'), qr: g('wzHeroScan'), nfc: g('wzHeroNfc'), hatNdef: ('NDEFReader' in window) };
    });
    ok(sicht.hatNdef === mitNfc, lbl + ': Umgebung korrekt simuliert');
    ok(sicht.wrap !== 'none' && sicht.wrap !== 'weg', lbl + ': Scan-Leiste sichtbar');
    ok(sicht.qr !== 'none', lbl + ': QR-Knopf sichtbar');
    ok(sicht.nfc !== 'none' && sicht.nfc !== 'weg', lbl + ': NFC-Knopf sichtbar');

    if (!mitNfc) {
      // Kamera-Scan darf NICHT still starten — der Dialog erklärt den Weg.
      await pB.evaluate(() => { window.__kam = 0; const o = window._wzScanWithCamera; window._wzScanWithCamera = function () { window.__kam++; }; window.__origKam = o; });
      await pB.evaluate(() => _wzScanWithNFC());
      await pB.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
      const txt = await pB.$eval('.gema-dlg-bg', el => el.textContent);
      ok(/NFC-Tag direkt ans Gerät halten/.test(txt), lbl + ': Dialog erklärt den Tag-am-Gerät-Weg');
      ok(/öffnet das Werkzeug direkt/.test(txt), lbl + ': Dialog sagt, dass man direkt beim Werkzeug landet');
      ok(/QR-Code scannen/.test(txt), lbl + ': QR-Scan als bewusste Wahl im Dialog');
      ok((await pB.evaluate(() => window.__kam)) === 0, lbl + ': KEIN stiller Wechsel auf die Kamera');
      await pB.click('.gema-dlg-bg [data-act="ok"]');
      await pB.waitForTimeout(250);
      ok((await pB.evaluate(() => window.__kam)) === 1, lbl + ': erst der Klick auf «QR-Code scannen» startet die Kamera');
    } else {
      await pB.evaluate(() => _wzScanWithNFC());
      await pB.waitForTimeout(350);
      const dlg = await pB.$('.gema-dlg-bg');
      ok(!dlg, lbl + ': kein Erklär-Dialog — echter NFC-Scan läuft');
    }
    ok(errB.length === 0, lbl + ': keine JS-Fehler (' + (errB[0] || '—') + ')');
  } finally {
    await pB.close(); await ctxB.close();
  }
}

await browser.close();
server.close();
console.log('\n' + (fail === 0 ? '✅' : '❌') + '  ' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail === 0 ? 0 : 1);
