// Schadensbericht: Betroffene Bereiche umbenennen + entfernen.
//
// Hintergrund: Fotos, Messpunkte und Geräte referenzieren ihren Bereich über
// den NAMEN (it.raum), s.trocknung.bereichEnde ist ebenfalls nach dem Namen
// gekeyt, und das Vorlage-PDF gruppiert die «Zusammenfassung pro Raum» über
// g.raum. Ein Umbenennen ohne Migration würde einen Bereich in zwei
// zerfallen lassen und den Trocknungs-Abschluss verlieren.
//
// Deckt ab:
//  A) Statik: eine Wahrheit für beide Einstiege (Bereichs-Karte + Raum-Tag),
//     Migration über alle fünf Item-Arrays, bereichEnde-Key, raeume in place.
//  B) Umbenennen über die Bereichs-Karte: Name wandert, Anzahl der Bereiche
//     bleibt gleich (kein Zerfall), Fotos/Messpunkte/Geräte aller Phasen und
//     der Abschluss-Vermerk wandern mit, Reihenfolge bleibt erhalten.
//  C) Abgeleiteter Bereich (nur über Items referenziert, nicht in raeume)
//     lässt sich ebenfalls umbenennen.
//  D) Namenskollision: wird NICHT stillschweigend zusammengeführt, sondern
//     mit klarer Meldung abgelehnt — nichts am Bericht verändert.
//  E) Entfernen: Einträge werden NIE gelöscht, sie wandern nach
//     «Ohne Bereich»; raeume-Eintrag + bereichEnde weg; Dialog nennt die Zahl.
//  F) Raum-Tags der Erfassung (✎ / ✕) laufen durch dieselbe Logik.
//  G) Persistenz über den Reload + Vorlage-PDF zeigt den neuen Namen EINMAL
//     samt Abschluss-Datum.
//  H) Rechte: Monteur (nur Messungen) sieht weder ✏️ noch 🗑.
//
// Aufruf:  CHROME=<chromium> node scripts/schaden_bereich_bearbeiten_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8902;
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

// ── A) Statik ──────────────────────────────────────────────────────
console.log('— A) Statik: eine Wahrheit, vollständige Migration —');
const SRC = await readFile(join(ROOT, 'sd_schadensbericht.html'), 'utf8');

ok(/_sdItemArraysAll[\s\S]{0,220}tr\.geraete[\s\S]{0,120}tr\.messpunkte[\s\S]{0,120}za\.fotos[\s\S]{0,120}tr\.fotos[\s\S]{0,120}ab\.fotos/.test(SRC),
  '_sdItemArraysAll deckt alle fünf Item-Arrays ab (Geräte, Messpunkte, Fotos aller 3 Phasen)');
ok(/function _sdBereichRename[\s\S]{0,900}be\[neu\] = be\[alt\][\s\S]{0,60}delete be\[alt\]/.test(SRC),
  '_sdBereichRename verschiebt den bereichEnde-Key mit');
ok(/function _sdBereichRename[\s\S]{0,900}s\.raeume\[i\] = neu/.test(SRC),
  '_sdBereichRename ersetzt in s.raeume AN ORT UND STELLE (Reihenfolge bleibt)');
ok(/function _sdBereichRemove[\s\S]{0,700}it\.raum = ''/.test(SRC),
  '_sdBereichRemove löscht keine Einträge, sondern löst nur den Bereichs-Bezug');
ok(!/function _sdBereichRemove[\s\S]{0,700}\.splice\([^)]*\)\s*;?\s*[\s\S]{0,40}fotos/.test(SRC),
  '_sdBereichRemove entfernt keine Fotos/Einträge aus ihren Arrays');
ok(/function sdErfRemRaum[\s\S]{0,220}_sdBereichEntfernenName/.test(SRC),
  'Raum-Tag ✕ läuft durch dieselbe Entfernen-Logik wie die Bereichs-Karte');
ok(/function sdErfRenRaum[\s\S]{0,220}_sdBereichUmbenennenName/.test(SRC),
  'Raum-Tag ✎ läuft durch dieselbe Umbenennen-Logik wie die Bereichs-Karte');
ok(/function _sdBereichUmbenennenName[\s\S]{0,200}_sdCanEdit\(\)/.test(SRC)
  && /function _sdBereichEntfernenName[\s\S]{0,200}_sdCanEdit\(\)/.test(SRC),
  'beide Apply-Funktionen guarden auf _sdCanEdit (Defense-in-Depth)');
ok(!/s\.raeume\.splice\(idx, 1\);\s*\n\s*sdSave/.test(SRC),
  'das alte blinde Splice in sdErfRemRaum ist weg (entfernte Bereiche kamen sonst abgeleitet zurück)');
ok(/sdBereichUmbenennen\(\\'/.test(SRC) && /sdBereichEntfernen\(\\'/.test(SRC),
  'Bereichs-Karte ruft beide Aktionen auf');

// ── Browser-Teil ───────────────────────────────────────────────────
const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

// Bericht mit 2 erfassten Bereichen (Bad, Flur) + 1 ABGELEITETEM Bereich
// («Keller» steht NICHT in raeume, wird nur von einem Foto referenziert).
const SD = {
  id: 'sd_b', typ: 'wasserschaden', titel: 'Bereiche bearbeiten', objektId: 'obj1', phase: 'trocknung',
  beschreibung: '', ursache: '', raeume: ['Bad', 'Flur'],
  versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
  erstelltAm: '2026-07-01', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
  zustandsanalyse: {
    leckortung: '', schadenausmass: '', massnahmen: [],
    fotos: [
      { id: 'fa_bad', dataUrl: TINY_JPG, kommentar: 'Analyse Bad', imBericht: true, raum: 'Bad' },
      { id: 'fa_kel', dataUrl: TINY_JPG, kommentar: 'Analyse Keller', imBericht: true, raum: 'Keller' }
    ],
    abgeschlossenAm: '2026-07-01'
  },
  trocknung: {
    gestartetAm: '2026-07-01', beendetAm: null,
    bereichEnde: { 'Bad': { am: '2026-07-12', von: 'Planerin' } },
    messpunkte: [
      { id: 'mp_bad', name: 'Wand Bad', raum: 'Bad', messungen: [{ id: 'm1', datum: '2026-07-02', wert: 120, einheit: 'Digits', foto: null }] },
      { id: 'mp_flu', name: 'Wand Flur', raum: 'Flur', messungen: [] }
    ],
    geraete: [
      { id: 'dev_bad', name: 'Trockner T1', raum: 'Bad', kw: 1.2, zaehlerTyp: 'stunden', zaehlerStart: 0, zaehlerEnde: '55', entferntAm: '2026-07-12' },
      { id: 'dev_flu', name: 'Trockner T2', raum: 'Flur', kw: 1.0, zaehlerTyp: 'stunden', zaehlerStart: 0, zaehlerEnde: '' }
    ],
    fotos: [
      { id: 'ft_bad', dataUrl: TINY_JPG, kommentar: 'Trocknung Bad', imBericht: true, raum: 'Bad' },
      { id: 'ft_ohne', dataUrl: TINY_JPG, kommentar: 'Ohne Bereich', imBericht: true }
    ],
    notizen: ''
  },
  abschluss: {
    zusammenfassung: '', instandstellung: '', weitereSchaeden: '',
    fotos: [{ id: 'fz_bad', dataUrl: TINY_JPG, kommentar: 'Abschluss Bad', imBericht: true, raum: 'Bad' }],
    abgeschlossenAm: null
  }
};

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig';
const seedFor = (user) => ({
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [
    { id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } },
    { id: 'u_m', username: 'm@t.ch', name: 'Monteur', roleIds: ['role_monteur'], orgId: 'org_t', active: true, profile: { email: 'm@t.ch' } }
  ],
  gema_session_v1: { token: JWT, userId: user, expires: FUTURE },
  gema_objekte_v1: { objekte: [{ id: 'obj1', name: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich' }], beteiligte: [], activeObjektId: '' }
});

const browser = await chromium.launch({ executablePath: CHROME });

// Zustandsbehaftete Cloud: gespeicherte Berichte überleben den Reload.
const cloud = new Map([['schaden:sd_b', JSON.parse(JSON.stringify(SD))]]);
async function mkCtx(user) {
  const ctx = await browser.newContext();
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
    if (!isSb) return route.abort();
    const m = route.request().method();
    if (m === 'GET' && u.indexOf('module_key=eq.schadensbericht') >= 0) {
      const rows = [...cloud.entries()].map(([k, v]) => ({ data_key: k, payload: { data: v, _lm: '2026-07-12T08:00:00Z' } }));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (m === 'POST' || m === 'PATCH') {
      try {
        const body = JSON.parse(route.request().postData() || '[]');
        (Array.isArray(body) ? body : [body]).forEach(r => {
          if (r && r.module_key === 'schadensbericht' && r.data_key && r.payload && r.payload.data) {
            cloud.set(r.data_key, r.payload.data);
          }
        });
      } catch (e) { }
      return route.fulfill({ contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ contentType: 'application/json', body: m === 'GET' ? '[]' : '{}' });
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, seedFor(user));
  return ctx;
}

const ctx = await mkCtx('u_p');
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => { });
await page.waitForTimeout(400);

const getS = () => page.evaluate(() => JSON.parse(JSON.stringify(window.sdGetById('sd_b'))));
const areas = () => page.evaluate(() => window._sdAreaNames(window.sdGetById('sd_b')));
const troHtml = () => page.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');

try {
  await page.evaluate(() => sdOpenDetail('sd_b'));
  await page.waitForTimeout(350);

  console.log('— B) Umbenennen über die Bereichs-Karte —');
  let tro = await troHtml();
  ok(tro.indexOf('sdBereichUmbenennen(\'sd_b\',0)') >= 0, '✏️ Umbenennen auf der Bereichs-Karte');
  ok(tro.indexOf('sdBereichEntfernen(\'sd_b\',0)') >= 0, '🗑 Entfernen auf der Bereichs-Karte');

  let vorher = await areas();
  ok(JSON.stringify(vorher) === '["Bad","Flur","Keller"]', 'Ausgangslage: Bad, Flur + abgeleiteter Keller (' + vorher.join(', ') + ')');

  await page.evaluate(() => sdBereichUmbenennen('sd_b', 0));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const promptVal = await page.$eval('.gema-dlg-bg input', el => el.value);
  ok(promptVal === 'Bad', 'Dialog ist mit dem bisherigen Namen vorbelegt');
  await page.fill('.gema-dlg-bg input', 'Bad EG');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(450);

  let s = await getS();
  let nachher = await areas();
  ok(JSON.stringify(nachher) === '["Bad EG","Flur","Keller"]', 'Bereiche danach: Bad EG, Flur, Keller — kein Zerfall, Reihenfolge erhalten');
  ok(s.raeume[0] === 'Bad EG' && s.raeume[1] === 'Flur', 's.raeume an Ort und Stelle ersetzt');
  ok(s.zustandsanalyse.fotos[0].raum === 'Bad EG', 'Analyse-Foto migriert');
  ok(s.trocknung.fotos[0].raum === 'Bad EG', 'Trocknungs-Foto migriert');
  ok(s.abschluss.fotos[0].raum === 'Bad EG', 'Abschluss-Foto migriert');
  ok(s.trocknung.messpunkte[0].raum === 'Bad EG', 'Messpunkt migriert');
  ok(s.trocknung.geraete[0].raum === 'Bad EG', 'Gerät migriert');
  ok(s.trocknung.bereichEnde['Bad EG'] && s.trocknung.bereichEnde['Bad EG'].am === '2026-07-12',
    'Trocknungs-Abschluss wandert auf den neuen Namen');
  ok(s.trocknung.bereichEnde['Bad'] === undefined, 'alter bereichEnde-Key ist weg');
  ok(s.trocknung.messpunkte[1].raum === 'Flur' && s.trocknung.geraete[1].raum === 'Flur', 'fremder Bereich unberührt');
  ok(s.trocknung.fotos[1].raum === undefined, 'Eintrag ohne Bereich unberührt');

  tro = await troHtml();
  ok(tro.indexOf('🏠 Bad EG') >= 0 && tro.indexOf('>🏠 Bad<') < 0, 'Karte zeigt den neuen Namen');
  ok(tro.indexOf('Trocknung beendet am') >= 0, 'Abschluss-Badge weiterhin am (umbenannten) Bereich');

  console.log('— C) Abgeleiteter Bereich (nicht in raeume) —');
  await page.evaluate(() => sdBereichUmbenennen('sd_b', 2));   // Keller
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.fill('.gema-dlg-bg input', 'Untergeschoss');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  s = await getS();
  ok(s.zustandsanalyse.fotos[1].raum === 'Untergeschoss', 'abgeleiteter Bereich umbenannt (Foto folgt)');
  ok((s.raeume || []).indexOf('Untergeschoss') < 0, 'abgeleiteter Bereich bleibt abgeleitet (raeume unverändert)');
  ok((await areas()).indexOf('Untergeschoss') >= 0, 'erscheint weiterhin als Bereich');

  console.log('— D) Namenskollision wird nicht stillschweigend zusammengeführt —');
  const vorKoll = JSON.stringify(await getS());
  await page.evaluate(() => sdBereichUmbenennen('sd_b', 1));   // Flur
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.fill('.gema-dlg-bg input', 'bad eg');             // andere Schreibweise
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  const kollTxt = await page.$eval('.gema-dlg-bg', el => el.textContent).catch(() => '');
  ok(/bereits einen Bereich/.test(kollTxt), 'klare Meldung «bereits einen Bereich …»');
  ok(/⇄/.test(kollTxt), 'Meldung nennt den Weg zum Verschieben (⇄)');
  await page.click('.gema-dlg-bg [data-act="ok"]').catch(() => { });
  await page.waitForTimeout(300);
  ok(JSON.stringify(await getS()) === vorKoll, 'Bericht bei Kollision unverändert');

  console.log('— E) Entfernen: Einträge bleiben, Bereich geht —');
  await page.evaluate(() => sdBereichEntfernen('sd_b', 0));    // Bad EG
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const delTxt = await page.$eval('.gema-dlg-bg', el => el.textContent);
  ok(/5 erfassten Einträge/.test(delTxt), 'Dialog nennt die Zahl der betroffenen Einträge (' + (delTxt.match(/\d+ erfasste\S*/) || [''])[0] + ')');
  ok(/Ohne Bereich/.test(delTxt), 'Dialog sagt, dass die Einträge erhalten bleiben');
  ok(/Trocknungs-Abschluss/.test(delTxt), 'Dialog nennt den entfallenden Trocknungs-Abschluss');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(450);

  s = await getS();
  ok((s.raeume || []).indexOf('Bad EG') < 0, 'Bereich aus raeume entfernt');
  ok((await areas()).indexOf('Bad EG') < 0, 'Bereich verschwindet wirklich (kommt nicht abgeleitet zurück)');
  ok(s.zustandsanalyse.fotos.length === 2 && s.trocknung.fotos.length === 2 && s.abschluss.fotos.length === 1,
    'kein einziges Foto gelöscht');
  ok(s.trocknung.messpunkte.length === 2 && s.trocknung.geraete.length === 2, 'kein Messpunkt/Gerät gelöscht');
  ok(s.trocknung.geraete[0].raum === '' && s.abschluss.fotos[0].raum === '', 'Einträge sind jetzt ohne Bereich');
  ok(!s.trocknung.bereichEnde['Bad EG'], 'bereichEnde des entfernten Bereichs weg');
  tro = await troHtml();
  ok(tro.indexOf('Ohne Bereich — bitte zuordnen') >= 0, '«Ohne Bereich»-Bucket zeigt die Einträge an');

  console.log('— F) Raum-Tags der Erfassung —');
  let erf = await page.evaluate(() => (document.querySelector('#acc_erfasst .acc-body') || {}).innerHTML || '');
  ok(erf.indexOf('sdErfRenRaum(\'sd_b\',0)') >= 0, 'Tag hat ✎ (Umbenennen)');
  ok(erf.indexOf('sdErfRemRaum(\'sd_b\',0)') >= 0, 'Tag hat ✕ (Entfernen)');
  await page.evaluate(() => sdErfRenRaum('sd_b', 0));          // Flur
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.fill('.gema-dlg-bg input', 'Korridor');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(450);
  s = await getS();
  ok(s.raeume[0] === 'Korridor', 'Tag-Umbenennen wirkt auf raeume');
  ok(s.trocknung.messpunkte[1].raum === 'Korridor' && s.trocknung.geraete[1].raum === 'Korridor',
    'Tag-Umbenennen migriert die Einträge genauso');

  console.log('— G) Persistenz + Vorlage-PDF —');
  await page.waitForTimeout(900);
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => { });
  await p2.waitForTimeout(500);
  const s2 = await p2.evaluate(() => JSON.parse(JSON.stringify(window.sdGetById('sd_b'))));
  ok(s2.raeume[0] === 'Korridor' && (s2.raeume || []).indexOf('Bad EG') < 0, 'Umbenennen + Entfernen überleben den Reload');
  ok(s2.trocknung.geraete[1].raum === 'Korridor', 'migrierte Einträge überleben den Reload');
  ok(s2.zustandsanalyse.fotos[1].raum === 'Untergeschoss', 'abgeleiteter Bereich überlebt den Reload');
  await p2.close();

  // Vorlage-PDF: der umbenannte Bereich darf nur EINMAL in der
  // Raum-Zusammenfassung stehen (sonst wäre die Migration unvollständig).
  await page.evaluate(() => window._sdBereichEndeApply && window._sdBereichEndeApply('sd_b', 'Korridor'));
  await page.waitForTimeout(300);
  const pdf = await page.evaluate(() => {
    window.__pdf = '';
    const orig = window.open;
    window.open = function () {
      const noop = () => { };
      return {
        document: { open: noop, write: h => { window.__pdf += h; }, close: noop, addEventListener: noop },
        focus: noop, print: noop, close: noop,
        addEventListener: noop, removeEventListener: noop, setTimeout: noop
      };
    };
    try { GemaSchadenPDF.exportPrint(window.sdGetById('sd_b'), { phases: ['trocknung'] }); }
    catch (e) { window.__pdf = 'ERR:' + e.message; }
    window.open = orig;
    return window.__pdf;
  });
  ok(pdf.indexOf('ERR:') !== 0, 'exportPrint läuft fehlerfrei' + (pdf.indexOf('ERR:') === 0 ? ' — ' + pdf.slice(0, 120) : ''));
  ok((pdf.match(/<td class="lead">Korridor<\/td>/g) || []).length === 1,
    'PDF: umbenannter Bereich steht genau einmal in der Raum-Zusammenfassung');
  ok(pdf.indexOf('Bad EG') < 0, 'PDF kennt den entfernten Bereichsnamen nicht mehr');
  ok(/Trocknung beendet/.test(pdf), 'PDF zeigt die Abschluss-Spalte');
  ok(/Ohne Raum/.test(pdf), 'PDF weist die bereichslos gewordenen Geräte als «Ohne Raum» aus (nicht verschwunden)');

  ok(errs.length === 0, 'keine JS-Fehler (' + (errs[0] || '—') + ')');

  console.log('— H) Rechte —');
  // Der Monteur hat auf schadensbericht bewusst rw (er erfasst Messungen und
  // Fotos vor Ort) → _sdCanEdit() ist für ihn true, er sieht dieselben
  // Bereichs-Aktionen wie «+ Raum hinzufügen»/✕ schon bisher. Der Test hält
  // diese Absicht fest, statt eine strengere Sonderregel zu erfinden.
  const ctxM = await mkCtx('u_m');
  const pm = await ctxM.newPage();
  await pm.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
  await pm.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => { });
  await pm.waitForTimeout(400);
  await pm.evaluate(() => sdOpenDetail('sd_b'));
  await pm.waitForTimeout(350);
  const troM = await pm.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(troM.indexOf('sd-area') >= 0, 'Monteur sieht die Bereiche');
  ok(troM.indexOf('sdBereichUmbenennen') >= 0 && troM.indexOf('sdErfAddRaum') >= 0,
    'Monteur (rw laut Rollen-Matrix) hat Bereichs-Aktionen — gleicher Gate wie «+ Bereich»');

  // Gate-Nachweis: ohne _sdCanEdit gibt es weder Knöpfe noch Wirkung.
  await pm.evaluate(() => { window._sdCanEdit = function () { return false; }; });
  await pm.evaluate(() => sdRenderDetail(sdGetById('sd_b')));
  await pm.waitForTimeout(300);
  const troRo = await pm.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(troRo.indexOf('sdBereichUmbenennen') < 0, 'ohne Editier-Recht kein ✏️');
  ok(troRo.indexOf('sdBereichEntfernen') < 0, 'ohne Editier-Recht kein 🗑');
  ok(troRo.indexOf('sd-area') >= 0, 'Bereiche bleiben sichtbar (nur lesend)');
  await pm.evaluate(() => { try { sdBereichEntfernen('sd_b', 0); } catch (e) { } });
  await pm.waitForTimeout(350);
  ok(!(await pm.$('.gema-dlg-bg')), 'direkter Aufruf ohne Recht öffnet nicht einmal den Dialog (Guard greift)');
  await ctxM.close();
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? '❌ ' + fail + ' fehlgeschlagen, ' : '✅ ') + pass + '/' + (pass + fail) + ' Checks bestanden');
process.exit(fail ? 1 : 0);
