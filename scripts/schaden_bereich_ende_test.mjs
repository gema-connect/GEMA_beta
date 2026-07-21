// Schadensbericht: Trocknung pro Bereich abschliessen + Items verschieben.
//
// Deckt ab:
//  A) «Trocknung für <Raum> beendet»-Button pro Bereichs-Karte (Phase
//     Trocknung): setzt s.trocknung.bereichEnde[raum] = {am: heute, von} und
//     fixiert das End-Datum (g.entferntAm) ALLER noch laufenden Geräte im
//     Raum — auch Geräte OHNE Zähler (Laufzeit/Ventilator), deren Tage sonst
//     endlos bis «heute» weiterliefen. Geräte mit bereits gesetztem Ende
//     (Zählerstand) bleiben unverändert; fremde Räume unberührt.
//  B) Badge «✓ Trocknung beendet am …» + Reopen (löst NUR die automatisch
//     gesetzten End-Daten, bereichEnde-Objekt wird restlos entfernt —
//     Alt-Berichte bleiben additiv/byte-stabil).
//  C) Verschieben zugeordneter Items (⇄): Chooser-Overlay für Foto und
//     Messpunkt, «Ohne Bereich», ziehbare Foto-Kacheln (draggable).
//  D) Vorlage-PDF: Raum-Zusammenfassung mit «Trocknung beendet»-Spalte
//     (nur wenn Abschlüsse existieren).
//
// Aufruf:  CHROME=<chromium> node scripts/schaden_bereich_ende_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8896;
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

const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const HEUTE = new Date().toISOString().slice(0, 10);

// Trocknungs-Bericht: 2 Bereiche, Ventilator OHNE Zähler (laufzeit) im Bad,
// Trockner mit fixiertem Ende (Zählerstand) im Bad, laufender Trockner im Flur.
const SD_T = {
  id: 'sd_t', typ: 'wasserschaden', titel: 'Bereichs-Ende Test', objektId: 'obj1', phase: 'trocknung',
  beschreibung: '', ursache: '', raeume: ['Bad', 'Flur'],
  versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
  erstelltAm: '2026-07-01', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
  zustandsanalyse: { leckortung: '', schadenausmass: '', massnahmen: [], fotos: [], abgeschlossenAm: '2026-07-01' },
  trocknung: {
    gestartetAm: '2026-07-01', beendetAm: null,
    messpunkte: [
      { id: 'mp_b', name: 'Wand Bad', raum: 'Bad', messungen: [{ id: 'm1', datum: '2026-07-02', wert: 120, einheit: 'Digits', foto: null }] },
      { id: 'mp_f', name: 'Wand Flur', raum: 'Flur', messungen: [] }
    ],
    geraete: [
      { id: 'dev_vent', name: 'Ventilator V1', raum: 'Bad', kw: 0.1, zaehlerTyp: 'laufzeit', stundenProTag: 24 },
      { id: 'dev_tr1', name: 'Trockner T1', raum: 'Bad', kw: 1.2, zaehlerTyp: 'stunden', zaehlerStart: 0, zaehlerEnde: '55', entferntAm: '2026-07-10' },
      { id: 'dev_tr2', name: 'Trockner T2', raum: 'Flur', kw: 1.0, zaehlerTyp: 'stunden', zaehlerStart: 0, zaehlerEnde: '' }
    ],
    fotos: [
      { id: 'f_bad', dataUrl: TINY_JPG, kommentar: 'Bad Foto', imBericht: true, raum: 'Bad' },
      { id: 'f_ohne', dataUrl: TINY_JPG, kommentar: 'Ohne Bereich Foto', imBericht: true }
    ],
    notizen: ''
  },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const SEED = {
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }],
  gema_session_v1: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig', userId: 'u_p', expires: FUTURE },
  gema_objekte_v1: { objekte: [{ id: 'obj1', name: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich' }], beteiligte: [], activeObjektId: '' }
};

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
  if (isSb) {
    if (route.request().method() === 'GET' && u.indexOf('module_key=eq.schadensbericht') >= 0) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { data_key: 'schaden:sd_t', payload: { data: SD_T, _lm: '2026-07-10T08:00:00Z' } }
      ]) });
    }
    return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
  }
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, SEED);

const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => {});
await page.waitForTimeout(400);

const getS = () => page.evaluate(() => JSON.parse(JSON.stringify(window.sdGetById('sd_t'))));

try {
  console.log('— A) Abschluss-Button pro Bereich (Phase Trocknung) —');
  await page.evaluate(() => sdOpenDetail('sd_t'));
  await page.waitForTimeout(300);
  let tro = await page.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(tro.indexOf('Trocknung für «Bad» beendet') >= 0, 'Button «Trocknung für «Bad» beendet» gerendert');
  ok(tro.indexOf('Trocknung für «Flur» beendet') >= 0, 'Button «Trocknung für «Flur» beendet» gerendert');
  ok(tro.indexOf('sd-be-badge') < 0, 'noch kein Abschluss-Badge');

  // UI-Pfad: Button → GemaDialog-Confirm → Bestätigen
  await page.evaluate(() => sdBereichTrocknungEnde('sd_t', 0));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  const dlgTxt = await page.$eval('.gema-dlg-bg', el => el.textContent);
  ok(dlgTxt.indexOf('laufenden Gerät') >= 0, 'Dialog nennt laufende Geräte (Ventilator ohne Zähler)');
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);

  let s = await getS();
  ok(s.trocknung.bereichEnde && s.trocknung.bereichEnde['Bad'] && s.trocknung.bereichEnde['Bad'].am === HEUTE,
    'bereichEnde[Bad].am = heute (' + HEUTE + ')');
  ok((s.trocknung.bereichEnde['Bad'].von || '') === 'Planerin', 'Abschluss trägt den Namen der Person');
  ok(s.trocknung.geraete[0].entferntAm === HEUTE, 'Ventilator OHNE Zähler: End-Datum fixiert (lief vorher endlos)');
  ok(s.trocknung.geraete[1].entferntAm === '2026-07-10', 'Gerät mit Zählerstand-Ende bleibt unverändert');
  ok(s.trocknung.geraete[2].entferntAm == null, 'Gerät im Flur unberührt');
  const tage = await page.evaluate(() => {
    const s2 = window.sdGetById('sd_t');
    return { vent: window.sdGeraetTage(s2.trocknung.geraete[0], s2.trocknung), ende: window.sdGeraetEnde(s2.trocknung.geraete[0]) };
  });
  ok(tage.ende === HEUTE, 'sdGeraetEnde(Ventilator) = Abschluss-Datum → Tage laufen nicht weiter');
  ok(tage.vent >= 1, 'Ventilator-Tage berechnet (' + tage.vent + ')');

  console.log('— B) Badge + Reopen —');
  tro = await page.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(tro.indexOf('sd-be-badge') >= 0 && tro.indexOf('Trocknung beendet am') >= 0, 'Badge «✓ Trocknung beendet am …» gerendert');
  ok(tro.indexOf('Trocknung für «Bad» wieder öffnen') >= 0, 'Bad zeigt Reopen-Button');
  ok(tro.indexOf('Trocknung für «Flur» beendet') >= 0, 'Flur zeigt weiterhin den Abschluss-Button');
  ok(tro.indexOf('läuft') < 0 || tro.split('läuft').length - 1 === 1, 'Ventilator-Karte ohne «läuft»-Chip (nur noch Flur-Gerät läuft)');

  await page.evaluate(() => sdBereichTrocknungReopen('sd_t', 0));
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(400);
  s = await getS();
  ok(s.trocknung.geraete[0].entferntAm == null, 'Reopen: automatisch gesetztes Ventilator-Ende wieder gelöst');
  ok(s.trocknung.geraete[1].entferntAm === '2026-07-10', 'Reopen: Zählerstand-Ende bleibt fixiert');
  ok(!('bereichEnde' in s.trocknung), 'bereichEnde-Objekt restlos entfernt (additiv sauber)');

  console.log('— C) Verschieben zugeordneter Items (⇄) —');
  tro = await page.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(tro.indexOf('photo-move') >= 0, '⇄-Button auf der Foto-Kachel');
  ok(tro.indexOf("sdMoveItemDialog('sd_t','mp'") >= 0, '⇄-Button an den Messpunkt-Karten');
  ok(tro.indexOf("sdMoveItemDialog('sd_t','dev'") >= 0, '⇄-Button an den Geräte-Karten');
  ok(/photo-item[^>]*draggable="true"/.test(tro), 'Foto-Kacheln sind ziehbar (DnD)');

  await page.evaluate(() => sdMoveItemDialog('sd_t', 'foto', 'trocknung', 0));
  await page.waitForSelector('.sd-move-target', { timeout: 4000 });
  const chooser = await page.$$eval('.sd-move-target', els => els.map(e => ({ t: e.textContent.trim(), dis: e.disabled })));
  ok(chooser.length === 4, 'Chooser: Bad + Flur + Neuer Bereich + Ohne Bereich (' + chooser.length + ')');
  ok(chooser[0].dis === true && chooser[0].t.indexOf('Bad') >= 0, 'aktueller Bereich (Bad) deaktiviert');
  await page.evaluate(() => { document.querySelectorAll('.sd-move-target')[1].click(); });  // Flur
  await page.waitForTimeout(300);
  s = await getS();
  ok(s.trocknung.fotos[0].raum === 'Flur', 'Foto Bad → Flur verschoben');
  ok(await page.evaluate(() => !document.querySelector('.sd-move-target')), 'Chooser nach Auswahl geschlossen');

  await page.evaluate(() => sdMoveItemDialog('sd_t', 'mp', 'trocknung', 0));
  await page.waitForSelector('.sd-move-target', { timeout: 4000 });
  await page.evaluate(() => { document.querySelectorAll('.sd-move-target')[1].click(); });  // Flur
  await page.waitForTimeout(300);
  s = await getS();
  ok(s.trocknung.messpunkte[0].raum === 'Flur', 'Messpunkt Bad → Flur verschoben');

  await page.evaluate(() => sdMoveChooserPick('sd_t', 'foto', 'trocknung', 0, -3));
  await page.waitForTimeout(300);
  s = await getS();
  ok(s.trocknung.fotos[0].raum === '', '«Ohne Bereich» setzt raum zurück (Bucket)');

  console.log('— D) Vorlage-PDF: «Trocknung beendet»-Spalte —');
  await page.evaluate(() => window._sdBereichEndeApply('sd_t', 'Flur'));
  await page.waitForTimeout(300);
  s = await getS();
  ok(s.trocknung.geraete[2].entferntAm === HEUTE, 'Direkt-Apply: Flur-Gerät bekommt End-Datum');
  const pdfHtml = await page.evaluate(() => {
    window.__pdf = '';
    const origOpen = window.open;
    window.open = function () {
      const noop = () => {};
      return {
        document: { open: noop, write: h => { window.__pdf += h; }, close: noop, addEventListener: noop },
        focus: noop, print: noop, close: noop,
        addEventListener: noop, removeEventListener: noop, setTimeout: noop
      };
    };
    try { GemaSchadenPDF.exportPrint(window.sdGetById('sd_t'), { phases: ['trocknung'] }); } catch (e) { window.__pdf = 'ERR:' + e.message; }
    window.open = origOpen;
    return window.__pdf;
  });
  ok(pdfHtml.indexOf('ERR:') !== 0, 'exportPrint läuft fehlerfrei' + (pdfHtml.indexOf('ERR:') === 0 ? ' — ' + pdfHtml.slice(0, 120) : ''));
  ok(pdfHtml.indexOf('Trocknung beendet') >= 0, 'PDF-Raum-Zusammenfassung hat «Trocknung beendet»-Spalte');
  ok(pdfHtml.indexOf('✓ ') >= 0, 'PDF zeigt Abschluss-Datum mit ✓');

  ok(errs.length === 0, 'keine pageerrors (' + errs.join(' | ').slice(0, 140) + ')');
} catch (e) {
  fail++; console.error('  ✗ EXCEPTION:', e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + (pass + fail) + ' fehlgeschlagen') : ('✓ Alle ' + pass + ' Checks grün')));
process.exit(fail ? 1 : 0);
