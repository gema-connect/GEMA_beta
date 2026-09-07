// Bilder: editierbare Bildunterschrift + Datei-Drag&Drop (Schadensbericht)
// und Raum-Gliederung samt Raum-Bemerkung (Zustandsanalyse).
//
// Hintergrund (Feedback 07.09.2026):
//  «bei dem schadensbericht soll die bildunterschrift bearbeitbar sein, auch
//   soll der drag n drop für bilder funktionieren, auch mehrere bilder auf
//   einmal. unterteile auch bei der zustandsanalyse nach räumen, also dass die
//   bilder entsprechend sortiert und unterteilt sind. man soll auch zu jedem
//   raum noch eine Bemerkung machen können.»
//
// Bisher liess sich der Kommentar NUR beim Hochladen setzen (Dialog), ein
// Tippfehler war danach für immer im Bericht; Bilder aus dem Dateimanager
// liessen sich gar nicht ablegen (der Browser navigierte stattdessen zum
// Bild und die Erfassung war weg); in der Zustandsanalyse lagen alle Fotos
// eines Kapitels in EINER Reihe, der Raum stand nur klein in der Meta-Zeile.
//
// Deckt ab:
//  A) Statik beider Dateien: Fokusregel (change statt input), Attribut-
//     Escaper, Files-Erkennung, Navigations-Sicherheitsnetz, lesendes
//     Rendern (kein Save durch blosses Anzeigen).
//  B) Schadensbericht: Unterschrift an der Kachel editierbar + persistent,
//     Fokus bleibt beim Tippen, ✎-Dialog mit Vorschau, Datei-Drop mit
//     MEHREREN Bildern in die richtige Bereichs-Karte, Drop ohne Bereich,
//     Nicht-Bild-Dateien werden benannt statt still geschluckt,
//     Read-only bietet weder Feld noch Ablagefläche.
//  C) Zustandsanalyse: Raum-Blöcke sortiert, Kacheln im richtigen Block,
//     Bemerkung je Raum, Raum anlegen/umbenennen/entfernen (Fotos bleiben),
//     Datei-Drop in den Raum-Block, Bericht mit Raumtitel + Bemerkung.
//
// Aufruf:  CHROME=<chromium> node scripts/schaden_bilder_raeume_test.mjs
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
const ok = (c, l, extra) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l, extra === undefined ? '' : '→ ' + extra); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const TINY_JPG = 'data:image/jpeg;base64,' + B64;

// ══════════════════════════════════════════════════════════════════
// A) Statik
// ══════════════════════════════════════════════════════════════════
console.log('— A) Statik: Fokusregel, Escaper, Files-Erkennung, Sicherheitsnetz —');
const SD = await readFile(join(ROOT, 'sd_schadensbericht.html'), 'utf8');
const ZA = await readFile(join(ROOT, 'pm_zustandsanalyse.html'), 'utf8');

ok(/function _sdAttr[\s\S]{0,400}&quot;[\s\S]{0,120}&#39;/.test(SD),
  'sd: _sdAttr escapt zusätzlich " und \' (Werte landen in value="…")');
ok(/class="photo-cap-inp"[\s\S]{0,400}onchange="sdUpdatePhotoCaption/.test(SD),
  'sd: Bildunterschrift speichert auf change (nicht auf input → Fokusregel)');
ok(!/photo-cap-inp[\s\S]{0,400}oninput=/.test(SD),
  'sd: KEIN oninput am Unterschriftfeld (würde die Kachelliste im Tippen neu bauen)');
ok(/function sdUpdatePhotoCaption[\s\S]{0,420}sdSave\(\);\s*\n\}/.test(SD),
  'sd: sdUpdatePhotoCaption speichert OHNE sdRenderDetail (kein Re-Render im Feld)');
ok(/function _sdDragHatDateien[\s\S]{0,420}'Files'/.test(SD),
  'sd: Datei-Drag wird über dataTransfer.types = «Files» erkannt (files ist im dragover leer)');
ok(/document\.addEventListener\('drop'[\s\S]{0,220}preventDefault/.test(SD),
  'sd: Sicherheitsnetz — ein Drop neben die Ablagefläche navigiert nicht weg');
ok(/function _sdIstBilddatei[\s\S]{0,300}if \(f\.type\) return/.test(SD),
  'sd: Datei-Filter nie über file.type allein (iOS liefert Fotos ohne MIME-Typ)');
ok(/function _sdPushPhoto[\s\S]{0,900}\+\+_sdPhotoSeq/.test(SD),
  'sd: Foto-IDs tragen eine laufende Nummer (Serienimport in derselben Millisekunde)');

ok(/function raumNotizen[\s\S]{0,260}cur\.raumNotiz\[kapId\]/.test(ZA),
  'za: Bemerkung liegt je Kapitel UND Raum (cur.raumNotiz[kapId][raum])');
ok(/class="foto-cap-inp"[\s\S]{0,300}onchange="zaFotoCap/.test(ZA),
  'za: Bildunterschrift an der Kachel speichert auf change');
ok(/window\.zaRaumNotiz = function[\s\S]{0,600}scheduleSave\(\);\s*\n\};/.test(ZA)
  && !/window\.zaRaumNotiz = function[\s\S]{0,600}repaintKap/.test(ZA),
  'za: zaRaumNotiz speichert OHNE repaintKap (Cursor bleibt in der Bemerkung)');
ok(/Lesend, NICHT über raumNotizen\(\)/.test(ZA),
  'za: der Render-Pfad legt keine Container an (blosses Anzeigen löst keinen Save aus)');
ok(/function _bFotos[\s\S]{0,2000}Fotos nach Räumen[\s\S]{0,900}braum-n/.test(ZA),
  'za: der Bericht gliedert die Fotos nach Räumen und druckt die Bemerkung');
ok(/function _bFotos[\s\S]{0,2600}Ohne Raumzuordnung/.test(ZA),
  'za: Fotos ohne Raum fallen im Bericht NICHT weg (eigener Abschnitt)');

// ══════════════════════════════════════════════════════════════════
// B) Schadensbericht
// ══════════════════════════════════════════════════════════════════
const SD_T = {
  id: 'sd_t', titel: 'Wasserschaden Musterweg', schadenTyp: 'wasser', objektId: 'obj1',
  orgId: 'org_t', phase: 'analyse', status: 'offen', erfasstAm: '2026-07-01',
  raeume: ['Bad EG', 'Küche'],
  zustandsanalyse: {
    leckortung: '', schadenausmass: '', massnahmen: [], abgeschlossenAm: null,
    fotos: [
      { id: 'f1', dataUrl: TINY_JPG, kommentar: 'Wand feucht', imBericht: true, raum: 'Bad EG' },
      { id: 'f2', dataUrl: TINY_JPG, kommentar: '', imBericht: true, raum: 'Küche' }
    ]
  },
  trocknung: { gestartetAm: null, beendetAm: null, messpunkte: [], geraete: [], fotos: [], notizen: '' },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';
const seedFor = (roleIds) => ({
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds, orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }],
  gema_session_v1: { token: TOKEN, userId: 'u_p', expires: FUTURE },
  gema_objekte_v1: { objekte: [{ id: 'obj1', name: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich' }], beteiligte: [], activeObjektId: '' }
});

const browser = await chromium.launch({ executablePath: CHROME });

async function neuerCtx(seed, cloud) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (isSb) {
      if (route.request().method() === 'GET' && cloud && u.indexOf('module_key=eq.' + cloud.mod) >= 0) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(cloud.rows) });
      }
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    }
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seed);
  return ctx;
}

// Dateien wie aus dem Dateimanager erzeugen und als echtes drop-Event ablegen.
async function dropDateien(page, selector, dateien) {
  const dt = await page.evaluateHandle((liste) => {
    const dt = new DataTransfer();
    liste.forEach(function (f) {
      let bytes;
      if (f.b64) {
        const bin = atob(f.b64);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(f.text || 'x');
      }
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    });
    return dt;
  }, dateien);
  await page.dispatchEvent(selector, 'dragover', { dataTransfer: dt });
  await page.dispatchEvent(selector, 'drop', { dataTransfer: dt });
  await page.waitForTimeout(600);
}

let ctx = await neuerCtx(seedFor(['role_planer']), { mod: 'schadensbericht', rows: [{ data_key: 'schaden:sd_t', payload: { data: SD_T, _lm: '2026-07-01T08:00:00Z' } }] });
let page = await ctx.newPage();
const errsSd = []; page.on('pageerror', e => errsSd.push(e.message));

try {
  await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => {});
  await page.evaluate(() => sdOpenDetail('sd_t'));
  await page.waitForTimeout(500);
  const getS = () => page.evaluate(() => JSON.parse(JSON.stringify(window.sdGetById('sd_t'))));

  console.log('— B1) Bildunterschrift direkt an der Kachel —');
  const caps = await page.$$eval('#acc_analyse .photo-cap-inp', els => els.map(e => e.value));
  ok(caps.length === 2, 'zwei Unterschriftfelder (ein Foto je Bereich)', caps.length);
  ok(caps.indexOf('Wand feucht') >= 0, 'bestehende Unterschrift steht im Feld', JSON.stringify(caps));

  // Tippen: der Fokus muss NACH dem ersten Zeichen im selben Feld bleiben
  // (Gegenprobe zur Fokusregel — ein Re-Render im input-Handler würde ihn reissen).
  const feld = '#acc_analyse .photo-cap-inp >> nth=0';
  await page.click(feld);
  await page.fill(feld, '');
  await page.type(feld, 'Wand feucht, Sockelleiste geloest', { delay: 12 });
  const fokusOk = await page.evaluate(() => {
    const a = document.activeElement;
    return !!(a && a.classList && a.classList.contains('photo-cap-inp'));
  });
  ok(fokusOk, 'Fokus bleibt beim Tippen im Unterschriftfeld');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(400);
  let s = await getS();
  ok(s.zustandsanalyse.fotos[0].kommentar === 'Wand feucht, Sockelleiste geloest',
    'geänderte Unterschrift ist im Datensatz', s.zustandsanalyse.fotos[0].kommentar);

  console.log('— B2) ✎-Dialog mit Vorschau —');
  ok(await page.locator('#acc_analyse .photo-edit').count() === 2, '✎-Knopf auf jeder Kachel');
  await page.click('#acc_analyse .photo-edit >> nth=1');
  await page.waitForTimeout(300);
  ok(!(await page.locator('#photoCommentModal').getAttribute('class')).includes('hidden'), 'Dialog offen');
  ok(await page.$eval('#pcTitle', e => e.textContent).then(t => t.indexOf('Bildunterschrift') >= 0), 'Dialog-Titel nennt die Bildunterschrift');
  ok(await page.$eval('#pcPreview', e => e.style.display !== 'none' && !!e.getAttribute('src')), 'Vorschaubild im Dialog sichtbar');
  await page.fill('#pcComment', 'Kueche: Wasseraustritt unter Spuele');
  await page.click('#photoCommentModal .dlg-save');
  await page.waitForTimeout(400);
  s = await getS();
  ok(s.zustandsanalyse.fotos[1].kommentar === 'Kueche: Wasseraustritt unter Spuele',
    'Dialog schreibt die Unterschrift auf das RICHTIGE Foto', s.zustandsanalyse.fotos[1].kommentar);
  ok(s.zustandsanalyse.fotos[0].kommentar === 'Wand feucht, Sockelleiste geloest', 'das andere Foto bleibt unberührt');

  console.log('— B3) Datei-Drag&Drop: mehrere Bilder auf einmal —');
  const areaSel = '#acc_analyse .sd-area >> nth=0';
  ok(await page.locator(areaSel).getAttribute('data-drop-phase') === 'analyse', 'Bereichs-Karte ist Ablagefläche der Phase');
  await dropDateien(page, areaSel, [
    { name: 'a.jpg', type: 'image/jpeg', b64: B64 },
    { name: 'b.jpg', type: 'image/jpeg', b64: B64 },
    { name: 'c.jpg', type: '', b64: B64 }            // iOS-Fall: leerer MIME-Typ
  ]);
  await page.waitForTimeout(900);
  s = await getS();
  const badEg = s.zustandsanalyse.fotos.filter(f => f.raum === 'Bad EG');
  ok(s.zustandsanalyse.fotos.length === 5, 'alle drei gezogenen Bilder übernommen (2 + 3)', s.zustandsanalyse.fotos.length);
  ok(badEg.length === 4, 'sie landen im Bereich der Karte, auf die gezogen wurde', badEg.length);
  ok(badEg.every(f => f.pendingId || f.dataUrl), 'jedes Bild trägt ein Bild (Queue oder dataUrl)');
  const ids = s.zustandsanalyse.fotos.map(f => f.id);
  ok(new Set(ids).size === ids.length, 'Foto-IDs bleiben eindeutig (Serienimport)', JSON.stringify(ids));

  console.log('— B4) Nicht-Bild-Dateien werden benannt, nicht still geschluckt —');
  const vorher = (await getS()).zustandsanalyse.fotos.length;
  await dropDateien(page, areaSel, [{ name: 'offerte.pdf', type: 'application/pdf', text: 'nope' }]);
  await page.waitForTimeout(500);
  s = await getS();
  ok(s.zustandsanalyse.fotos.length === vorher, 'PDF wird nicht als Foto übernommen');
  const toastTxt = await page.evaluate(() => {
    const els = Array.prototype.slice.call(document.querySelectorAll('body > div'));
    const t = els.filter(e => (e.textContent || '').indexOf('übernommen') >= 0);
    return t.length ? t[t.length - 1].textContent : '';
  });
  ok(/kein(e)? Bild/.test(toastTxt), 'Meldung nennt den Grund (kein Bild)', toastTxt);

  console.log('— B5) Drop ohne Bereich —');
  await page.evaluate(() => { const s2 = window.sdGetById('sd_t'); s2.raeume = []; s2.zustandsanalyse.fotos = []; window.sdSave(); window.sdRenderDetail(s2); });
  await page.waitForTimeout(400);
  const leerSel = '#acc_analyse .sd-area-none';
  ok(await page.locator(leerSel).count() >= 1, 'Leerzustand ist selbst eine Ablagefläche');
  await dropDateien(page, leerSel + ' >> nth=0', [{ name: 'd.jpg', type: 'image/jpeg', b64: B64 }]);
  await page.waitForTimeout(800);
  s = await getS();
  ok(s.zustandsanalyse.fotos.length === 1, 'Bild auch ohne angelegten Bereich übernommen', s.zustandsanalyse.fotos.length);
  ok(!s.zustandsanalyse.fotos[0].raum, 'es wartet unter «Ohne Bereich» (kein erfundener Raum)');

  console.log('— B6) Gegenprobe: ohne Editier-Recht weder Feld noch Ablagefläche —');
  // Gate-Nachweis über den Override (Kanon schaden_bereich_bearbeiten_test):
  // schadensbericht ist laut Rollen-Matrix entweder rw oder gar nicht sichtbar,
  // ein «nur lesender» Benutzer lässt sich also nicht über eine Rolle bauen.
  await page.evaluate(() => { window._sdCanEdit = function () { return false; }; });
  await page.evaluate(() => sdRenderDetail(sdGetById('sd_t')));
  await page.waitForTimeout(400);
  ok(await page.locator('#acc_analyse .photo-cap-inp').count() === 0, 'ohne Schreibrecht kein Unterschriftfeld');
  ok(await page.locator('#acc_analyse .photo-edit').count() === 0, 'ohne Schreibrecht kein ✎-Knopf');
  ok(await page.locator('#acc_analyse .sd-area[data-drop-phase]').count() === 0, 'ohne Schreibrecht keine Datei-Ablagefläche');
  const roVorher = (await getS()).zustandsanalyse.fotos.length;
  await dropDateien(page, '#acc_analyse .sd-area >> nth=0', [{ name: 'x.jpg', type: 'image/jpeg', b64: B64 }]);
  await page.waitForTimeout(600);
  ok((await getS()).zustandsanalyse.fotos.length === roVorher, 'ein Drop bleibt ohne Schreibrecht wirkungslos');

  ok(errsSd.length === 0, 'keine JS-Fehler im Schadensbericht (' + errsSd.join(' | ') + ')');
} finally {
  await ctx.close();
}

// ══════════════════════════════════════════════════════════════════
// C) Zustandsanalyse
// ══════════════════════════════════════════════════════════════════
console.log('— C) Zustandsanalyse: Räume, Bemerkung, Drop, Bericht —');
const ZA_T = {
  id: 'za_t', orgId: 'org_t', titel: 'Zustandsanalyse Musterweg',
  kopf: { objektId: '', objektText: 'MFH Musterweg 3', adresse: 'Musterweg 3, 8000 Zürich', bauherrschaft: 'Muster Immobilien AG', verwaltung: '', verfasser: 'Planerin', datum: '2026-07-01' },
  a: {}, bereiche: [], komponenten: [], mat: {}, kosten: {}, massnahmen: { kurz: [], mittel: [], lang: [] },
  fotos: {
    k1: [
      { id: 'p1', beschreibung: 'Speicher aussen', standort: '', geschoss: 'UG', raum: 'Technikraum UG', bauteil: '', dataUrl: TINY_JPG },
      { id: 'p2', beschreibung: 'Armatur', standort: '', geschoss: '', raum: 'Bad 2. OG', bauteil: '', dataUrl: TINY_JPG },
      { id: 'p3', beschreibung: 'Anschluss', standort: '', geschoss: 'UG', raum: 'Technikraum UG', bauteil: '', dataUrl: TINY_JPG },
      { id: 'p4', beschreibung: 'Ohne Zuordnung', standort: '', geschoss: '', raum: '', bauteil: '', dataUrl: TINY_JPG }
    ]
  },
  erstelltVon: { userId: 'u_p', name: 'Planerin' },
  createdAt: '2026-07-01T08:00:00Z', updatedAt: '2026-07-01T08:00:00Z'
};

ctx = await neuerCtx(seedFor(['role_planer']), { mod: 'zustandsanalyse', rows: [{ data_key: 'za:za_t', payload: { data: ZA_T, _lm: '2026-07-01T08:00:00Z' } }] });
page = await ctx.newPage();
const errsZa = []; page.on('pageerror', e => errsZa.push(e.message));
try {
  await page.goto(BASE + '/pm_zustandsanalyse.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.zaOpen('za_t'));
  await page.waitForTimeout(600);
  await page.click('#kap_k1 .kap-hd');            // Kapitel aufklappen (Felder sonst unsichtbar)
  await page.waitForTimeout(300);
  // IIFE-Modul → Zustand über den Test-Hook lesen (Kanon window._*Hooks).
  const getZ = () => page.evaluate(() => window._zaHooks.cur());

  console.log('— C1) Gliederung nach Räumen —');
  const namen = await page.$$eval('#kapbd_k1 .raum-blk .raum-nm', els => els.map(e => e.textContent.trim()));
  ok(namen.length === 3, 'drei Blöcke: zwei Räume + «Ohne Raum»', JSON.stringify(namen));
  ok(namen[0].indexOf('Bad 2. OG') >= 0 && namen[1].indexOf('Technikraum UG') >= 0,
    'Räume natürlich sortiert (Bad vor Technikraum)', JSON.stringify(namen));
  ok(namen[2].indexOf('Ohne Raum') >= 0, '«Ohne Raum» steht zuletzt', namen[2]);
  const proBlock = await page.$$eval('#kapbd_k1 .raum-blk', els => els.map(e => e.querySelectorAll('.foto-tile').length));
  ok(JSON.stringify(proBlock) === '[1,2,1]', 'jede Kachel liegt im richtigen Block (Bad 1, Technik 2, ohne 1)', JSON.stringify(proBlock));
  const capsZa = await page.$$eval('#kapbd_k1 .raum-blk >> nth=1 >> css=.foto-cap-inp', els => els.map(e => e.value)).catch(() => []);
  ok(await page.locator('#kapbd_k1 .foto-cap-inp').count() === 4, 'jede Kachel hat ein editierbares Unterschriftfeld', capsZa);

  console.log('— C2) Bemerkung je Raum —');
  const ta = '#kapbd_k1 .raum-blk >> nth=0 >> css=.raum-notiz-ta';
  ok(await page.locator(ta).count() === 1, 'Raum-Block hat ein Bemerkungsfeld');
  await page.click(ta);
  await page.type(ta, 'Kalkspuren an der Armatur, Dichtung sprde.', { delay: 8 });
  const fokusZa = await page.evaluate(() => !!(document.activeElement && document.activeElement.classList.contains('raum-notiz-ta')));
  ok(fokusZa, 'Fokus bleibt beim Tippen in der Bemerkung');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(400);
  let z = await getZ();
  ok(((z.raumNotiz || {}).k1 || {})['Bad 2. OG'] === 'Kalkspuren an der Armatur, Dichtung sprde.',
    'Bemerkung liegt unter Kapitel + Raum', JSON.stringify((z.raumNotiz || {}).k1 || {}));
  ok(!(((z.raumNotiz || {}).k1 || {})['Technikraum UG']), 'die anderen Räume bekommen nichts angehängt');

  console.log('— C3) Raum anlegen / umbenennen / entfernen —');
  await page.evaluate(() => window.zaRaumAdd('k1'));
  await page.waitForSelector('.gema-dlg-bg input', { timeout: 4000 });
  await page.fill('.gema-dlg-bg input', 'Waschküche UG');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  let namen2 = await page.$$eval('#kapbd_k1 .raum-blk .raum-nm', els => els.map(e => e.textContent.trim()));
  ok(namen2.some(n => n.indexOf('Waschküche UG') >= 0), 'neuer Raum erscheint auch ohne Foto', JSON.stringify(namen2));

  // Derselbe Raum in anderer Schreibweise darf NICHT ein zweites Mal entstehen
  await page.evaluate(() => window.zaRaumAdd('k1'));
  await page.waitForSelector('.gema-dlg-bg input', { timeout: 4000 });
  await page.fill('.gema-dlg-bg input', 'waschküche ug');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  const namenDup = await page.$$eval('#kapbd_k1 .raum-blk .raum-nm', els => els.map(e => e.textContent.trim()));
  ok(namenDup.length === namen2.length, 'Raum in anderer Schreibweise wird nicht doppelt angelegt', JSON.stringify(namenDup));
  ok((await page.textContent('#toast')).indexOf('gibt es bereits') >= 0, 'Meldung nennt den Grund');

  // Umbenennen: Fotos + Bemerkung wandern mit
  const riBad = namen2.findIndex(n => n.indexOf('Bad 2. OG') >= 0);
  await page.evaluate(ri => window.zaRaumRename('k1', ri), riBad);
  await page.waitForSelector('.gema-dlg-bg input', { timeout: 4000 });
  await page.fill('.gema-dlg-bg input', 'Bad 2. OG links');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  z = await getZ();
  ok(z.fotos.k1.filter(f => f.raum === 'Bad 2. OG links').length === 1, 'Umbenennen migriert den Raum am Foto');
  ok(z.fotos.k1.filter(f => f.raum === 'Bad 2. OG').length === 0, 'der alte Name existiert nicht mehr (kein Zerfall in zwei Räume)');
  ok((z.raumNotiz.k1 || {})['Bad 2. OG links'] === 'Kalkspuren an der Armatur, Dichtung sprde.', 'die Bemerkung wandert mit');

  // Entfernen: Fotos bleiben, sie wandern nach «Ohne Raum»
  namen2 = await page.$$eval('#kapbd_k1 .raum-blk .raum-nm', els => els.map(e => e.textContent.trim()));
  const riTech = namen2.findIndex(n => n.indexOf('Technikraum UG') >= 0);
  await page.evaluate(ri => window.zaRaumDel('k1', ri), riTech);
  await page.waitForSelector('.gema-dlg-bg [data-act="ok"]', { timeout: 4000 });
  const delTxt = await page.$eval('.gema-dlg-bg', e => e.textContent);
  ok(delTxt.indexOf('2 Fotos wandern') >= 0, 'Dialog beziffert, was passiert', delTxt.slice(0, 140));
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  z = await getZ();
  ok(z.fotos.k1.length === 4, 'kein Foto gelöscht', z.fotos.k1.length);
  ok(z.fotos.k1.filter(f => !f.raum).length === 3, 'die Fotos des Raums stehen jetzt ohne Raum', z.fotos.k1.filter(f => !f.raum).length);

  console.log('— C4) Datei-Drop in einen Raum-Block —');
  namen2 = await page.$$eval('#kapbd_k1 .raum-blk .raum-nm', els => els.map(e => e.textContent.trim()));
  const riWasch = namen2.findIndex(n => n.indexOf('Waschküche UG') >= 0);
  await dropDateien(page, '#kapbd_k1 .raum-blk >> nth=' + riWasch, [
    { name: 'w1.jpg', type: 'image/jpeg', b64: B64 },
    { name: 'w2.jpg', type: 'image/jpeg', b64: B64 }
  ]);
  await page.waitForTimeout(900);
  z = await getZ();
  ok(z.fotos.k1.length === 6, 'beide gezogenen Bilder übernommen', z.fotos.k1.length);
  ok(z.fotos.k1.filter(f => f.raum === 'Waschküche UG').length === 2, 'sie landen im Raum des Blocks',
    JSON.stringify(z.fotos.k1.map(f => f.raum)));

  console.log('— C5) Bericht: Raumtitel + Bemerkung + Fotos —');
  const [pop] = await Promise.all([
    ctx.waitForEvent('page'),
    page.click('#footBar button:has-text("Bericht (PDF)")')
  ]);
  await pop.waitForLoadState('domcontentloaded');
  await pop.waitForTimeout(700);
  const body = await pop.evaluate(() => document.body.textContent);
  ok(body.indexOf('Fotos nach Räumen') >= 0, 'Bericht gliedert den Fototeil nach Räumen');
  ok(body.indexOf('Bad 2. OG links') >= 0, 'Raumtitel im Bericht');
  ok(body.indexOf('Kalkspuren an der Armatur') >= 0, 'Raum-Bemerkung steht im Bericht');
  ok(body.indexOf('Ohne Raumzuordnung') >= 0, 'Fotos ohne Raum fallen nicht weg');
  const proRaum = await pop.$$eval('.braum', els => els.map(e => ({ t: (e.querySelector('.braum-t') || {}).textContent || '', n: e.querySelectorAll('.bft').length })));
  const bad = proRaum.find(r => r.t.indexOf('Bad 2. OG links') >= 0);
  const wasch = proRaum.find(r => r.t.indexOf('Waschküche UG') >= 0);
  ok(bad && bad.n === 1, 'Bad-Abschnitt zeigt genau sein Foto', JSON.stringify(proRaum));
  ok(wasch && wasch.n === 2, 'Waschküche-Abschnitt zeigt seine zwei Fotos', JSON.stringify(proRaum));
  await pop.close();

  ok(errsZa.length === 0, 'keine JS-Fehler in der Zustandsanalyse (' + errsZa.join(' | ') + ')');
} finally {
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
