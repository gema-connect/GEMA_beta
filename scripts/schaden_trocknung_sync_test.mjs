// Abgleich Schadensbericht ⇄ Trocknungsgeräte (Feedback 31.08.2026).
//
// Deckt ab:
//  A) Ausbuchen im Schadensbericht gibt das Gerät in der Verwaltung frei —
//     auf ALLEN Wegen: Zählerstand-Ende, manuelles End-Datum, «Trocknung
//     für <Raum> beendet». Wieder-Einbuchen nimmt den Historie-Eintrag
//     zurück (kein Wachstum bei jedem Aus-/Einbuchen, eingesetztAm bleibt).
//  A2) Selbstheilung beim Öffnen des Berichts (Ende auf einem anderen
//     Gerät gesetzt / Altbestand) + die beiden Schutzregeln: ein Gerät
//     eines FREMDEN Berichts wird nie freigegeben oder übernommen, und ein
//     LEERER Pool (offline/Cloud nicht geladen) fasst nichts an.
//  B) Banner «Aktueller Einsatz» in if_trocknung ist ein Link auf den
//     Bericht + Sprung zum Gerät (Karte, Tabelle, Detail-Modal); ohne
//     schadenId bzw. bei freiem Gerät KEIN Link (keine Sackgasse). Dazu
//     der Rückkanal: gema-trocknung-updated aktualisiert die offene Liste.
//  C) Interne Kennung als Badge an jeder Geräte-Karte des Berichts — der
//     LIVE-Wert aus der Verwaltung gewinnt über den Schnappschuss.
//  D) Deep-Link ?geraet=<tgId> öffnet die Trocknungs-Sektion, scrollt zur
//     Karte und lässt sie pulsieren.
//
// Aufruf:  CHROME=<chromium> node scripts/schaden_trocknung_sync_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const PORT = 8907;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// if_trocknung.html liegt komplett in einer IIFE — `devices`/`load()`/`_tgSchadenLink`
// sind von aussen NICHT erreichbar. Geprueft wird darum immer das, was der Nutzer
// sieht: die gerenderte Karte. kartenVon() zerlegt das Kachel-Raster in eine Map
// geraeteId -> Karten-HTML (die Id steckt im openDetail('...')-Handler des Fusses).
async function kartenVon(page) {
  const roh = await page.evaluate(() => (document.getElementById('cardGrid') || {}).innerHTML || '');
  const map = {};
  roh.split('<div class="tool-card').slice(1).forEach(st => {
    const m = /openDetail\('([^']+)'\)/.exec(st);
    if (m) map[m[1]] = st;
  });
  return map;
}
async function karteVon(page, id) { return (await kartenVon(page))[id] || ''; }

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const HEUTE = new Date().toISOString().slice(0, 10);

// ── Geräte-Pool (gema_trocknung_v1) ───────────────────────────────────
// tg_1  läuft für UNSEREN Bericht, Kennung TR-07 (der Bericht hält den
//       veralteten Schnappschuss ALT-99 → live muss gewinnen)
// tg_2  läuft für unseren Bericht, Laufzeit-Gerät (Ventilator)
// tg_fremd läuft für einen ANDEREN Bericht → darf nie angefasst werden
const POOL = [
  { id: 'tg_1', name: 'Trockner T1', typ: 'bautrockner', internKennung: 'TR-07', kw: 1.2, zaehlerTyp: 'stunden',
    status: 'im_einsatz', orgId: 'org_t', aktuellerZaehlerstand: 0,
    einsatz: { schadenId: 'sd_x', schadenTitel: 'Wasserschaden Musterweg', objektId: 'obj1', objektName: 'MFH Musterweg 3',
      raum: 'Bad', eingesetztAm: '2026-07-01', eingesetztVon: { userId: 'u_p', name: 'Planerin' }, zaehlerStart: 0 },
    einsatzHistorie: [] },
  { id: 'tg_2', name: 'Ventilator V1', typ: 'ventilator', internKennung: 'VE-02', kw: 0.1, zaehlerTyp: 'kein',
    status: 'im_einsatz', orgId: 'org_t',
    einsatz: { schadenId: 'sd_x', schadenTitel: 'Wasserschaden Musterweg', objektId: 'obj1', objektName: 'MFH Musterweg 3',
      raum: 'Flur', eingesetztAm: '2026-07-02', eingesetztVon: { userId: 'u_p', name: 'Planerin' }, zaehlerStart: 0 },
    einsatzHistorie: [] },
  { id: 'tg_fremd', name: 'Trockner Fremd', typ: 'bautrockner', internKennung: 'FR-01', kw: 1.0, zaehlerTyp: 'stunden',
    status: 'im_einsatz', orgId: 'org_t',
    einsatz: { schadenId: 'sd_ANDERER', schadenTitel: 'Anderer Fall', objektId: 'obj9', objektName: 'Anderes Haus',
      raum: 'Keller', eingesetztAm: '2026-06-01', eingesetztVon: { userId: 'u_p', name: 'Planerin' }, zaehlerStart: 10 },
    einsatzHistorie: [] },
  { id: 'tg_frei', name: 'Trockner Frei', typ: 'bautrockner', internKennung: 'TR-09', kw: 1.0, zaehlerTyp: 'stunden',
    status: 'verfuegbar', orgId: 'org_t', einsatz: null, einsatzHistorie: [] },
  // Altbestand: Einsatz OHNE schadenId — der Banner darf dort kein Link sein
  // (ein Link ins Leere waere schlimmer als gar keiner).
  { id: 'tg_alt', name: 'Trockner Alt', typ: 'bautrockner', internKennung: 'AL-00', kw: 1.0, zaehlerTyp: 'stunden',
    status: 'im_einsatz', orgId: 'org_t',
    einsatz: { schadenTitel: 'Altfall ohne Verknüpfung', raum: 'Estrich', eingesetztAm: '2026-06-20', zaehlerStart: 0 },
    einsatzHistorie: [] }
];

// ── Bericht ───────────────────────────────────────────────────────────
// g1 → tg_1 (läuft, Schnappschuss-Kennung veraltet)
// g2 → tg_2 (läuft, Laufzeit)
// g3 → tg_fremd, im Bericht bereits AUSGEBUCHT → Selbstheilung darf das
//      fremde Gerät trotzdem nicht freigeben
// g4 → ohne Verknüpfung, nur Schnappschuss-Kennung
const SD_X = {
  id: 'sd_x', typ: 'wasserschaden', titel: 'Wasserschaden Musterweg', objektId: 'obj1', phase: 'trocknung',
  beschreibung: '', ursache: '', raeume: ['Bad', 'Flur'],
  versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
  erstelltAm: '2026-07-01', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
  zustandsanalyse: { leckortung: '', schadenausmass: '', massnahmen: [], fotos: [], abgeschlossenAm: '2026-07-01' },
  trocknung: {
    gestartetAm: '2026-07-01', beendetAm: null, messpunkte: [], fotos: [], notizen: '',
    geraete: [
      { id: 'g1', name: 'Trockner T1', raum: 'Bad', kw: 1.2, zaehlerTyp: 'stunden', zaehlerStart: 0, zaehlerEnde: '',
        tgDeviceId: 'tg_1', internKennung: 'ALT-99', eingesetztAm: '2026-07-01' },
      { id: 'g2', name: 'Ventilator V1', raum: 'Flur', kw: 0.1, zaehlerTyp: 'laufzeit', stundenProTag: 24,
        tgDeviceId: 'tg_2', eingesetztAm: '2026-07-02' },
      { id: 'g3', name: 'Trockner Fremd', raum: 'Bad', kw: 1.0, zaehlerTyp: 'stunden', zaehlerStart: 0, zaehlerEnde: '30',
        tgDeviceId: 'tg_fremd', entferntAm: '2026-07-08' },
      { id: 'g4', name: 'Handgerät', raum: 'Bad', kw: 0.5, zaehlerTyp: 'kein', internKennung: 'MANUELL-1' }
    ]
  },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const SEED = {
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }],
  gema_session_v1: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig', userId: 'u_p', expires: FUTURE },
  gema_objekte_v1: { objekte: [{ id: 'obj1', name: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich' }], beteiligte: [], activeObjektId: '' },
  gema_trocknung_v1: POOL,
  gema_coachmarks_done_if_trocknung: '1'
};

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
  if (isSb) {
    const m = route.request().method();
    if (m === 'GET' && u.indexOf('module_key=eq.schadensbericht') >= 0) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { data_key: 'schaden:sd_x', payload: { data: SD_X, _lm: '2026-07-10T08:00:00Z' } }
      ]) });
    }
    if (m === 'GET' && u.indexOf('module_key=eq.trocknungsgeraete') >= 0) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(
        POOL.map(d => ({ data_key: 'device:' + d.id, payload: { data: d, _lm: '2026-07-10T08:00:00Z' } }))
      ) });
    }
    return route.fulfill({ contentType: 'application/json', body: m === 'GET' ? '[]' : '{}' });
  }
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, SEED);

const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

const pool = () => page.evaluate(() => {
  var a = (window.GemaSync && GemaSync.getCached) ? GemaSync.getCached('gema_trocknung_v1') : JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]');
  return JSON.parse(JSON.stringify(a || []));
});
const dev = async id => (await pool()).find(d => d.id === id) || null;
const getS = () => page.evaluate(() => JSON.parse(JSON.stringify(window.sdGetById('sd_x'))));

try {
  console.log('— Statisch: Verdrahtung —');
  const sdSrc = await readFile(join(ROOT, 'sd_schadensbericht.html'), 'utf8');
  const tgSrc = await readFile(join(ROOT, 'if_trocknung.html'), 'utf8');
  ok(/function _sdSyncTgEinsatz\(/.test(sdSrc), '_sdSyncTgEinsatz vorhanden');
  ['sdUpdateDevEnd', 'sdUpdateDevEndDate', '_sdBereichEndeApply', 'sdBereichTrocknungReopen', 'sdOpenDetail'].forEach(fn => {
    const blk = sdSrc.slice(sdSrc.indexOf('function ' + fn + '('));
    ok(blk.slice(0, 2600).indexOf('_sdSyncTgEinsatz(') >= 0, fn + ' ruft _sdSyncTgEinsatz');
  });
  const renderBlk = sdSrc.slice(sdSrc.indexOf('function sdRenderDetail('), sdSrc.indexOf('function sdRenderDetail(') + 6000);
  ok(renderBlk.indexOf('_sdSyncTgEinsatz(') < 0, 'sdRenderDetail ruft NIE _sdSyncTgEinsatz (keine Schreib-Schleife)');
  ok(/_sdTgWriteAll\(all\);?\s*\n\s*_sdTgEvent\(\);/.test(sdSrc) || sdSrc.indexOf('if(dirty){ _sdTgWriteAll(all); _sdTgEvent(); }') >= 0, 'Write feuert gema-trocknung-updated');
  ok(sdSrc.indexOf('_sdTgMemo.a = null;') >= 0, 'Lese-Memo wird bei Write verworfen');
  ok(tgSrc.indexOf("window.addEventListener('gema-trocknung-updated'") >= 0, 'if_trocknung lauscht auf gema-trocknung-updated');
  ok(tgSrc.indexOf("ev.key === STORAGE_KEY") >= 0, 'if_trocknung lauscht auf Cross-Tab-storage');

  console.log('\n— A2) Selbstheilung + Schutzregeln beim Öffnen —');
  await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => sdOpenDetail('sd_x'));
  await page.waitForTimeout(500);

  let d = await dev('tg_fremd');
  ok(d && d.status === 'im_einsatz' && d.einsatz && d.einsatz.schadenId === 'sd_ANDERER',
    'fremdes Gerät bleibt im Einsatz, obwohl es im Bericht ausgebucht ist');
  ok(d && (d.einsatzHistorie || []).length === 0, 'fremdes Gerät bekommt keinen Historie-Eintrag');
  d = await dev('tg_1');
  ok(d && d.status === 'im_einsatz' && d.einsatz.eingesetztAm === '2026-07-01', 'laufendes Gerät bleibt unverändert eingebucht');

  console.log('\n— C) Interne Kennung als Badge —');
  let tro = await page.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(tro.indexOf('dev-kennung') >= 0, 'Badge-Klasse .dev-kennung gerendert');
  ok(tro.indexOf('TR-07') >= 0, 'Live-Kennung aus der Verwaltung erscheint (TR-07)');
  ok(tro.indexOf('ALT-99') < 0, 'veralteter Schnappschuss ALT-99 wird NICHT gezeigt (live gewinnt)');
  ok(tro.indexOf('MANUELL-1') >= 0, 'Schnappschuss-Kennung ohne Verknüpfung bleibt Rückfallebene');
  ok(tro.indexOf('VE-02') >= 0 && tro.indexOf('FR-01') >= 0, 'Kennung an allen verknüpften Geräten');
  // Aendert die Verwaltung die Kennung, muss sie im Bericht sofort nachziehen
  // (Anzeige-Memo darf sie hoechstens bis zum naechsten Ereignis halten).
  await page.evaluate(() => {
    var all = GemaSync.getCached('gema_trocknung_v1');
    all.find(d => d.id === 'tg_1').internKennung = 'TR-77';
    localStorage.setItem('gema_trocknung_v1', JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('gema-trocknung-updated'));
  });
  await page.waitForTimeout(300);
  tro = await page.evaluate(() => (document.querySelector('#acc_trocknung .acc-body') || {}).innerHTML || '');
  ok(tro.indexOf('TR-77') >= 0, 'geaenderte Kennung erscheint sofort (TR-77)');
  ok(tro.indexOf('TR-07') < 0, 'alte Kennung ist weg — Anzeige-Memo wurde verworfen');

  console.log('\n— A) Ausbuchen per Zählerstand —');
  await page.evaluate(() => sdUpdateDevEnd('sd_x', 0, '55'));
  await page.waitForTimeout(400);
  d = await dev('tg_1');
  ok(d && d.status === 'verfuegbar', 'Zählerstand-Ende → Gerät ist wieder verfügbar');
  ok(d && !d.einsatz, 'Einsatz gelöst');
  ok(d && (d.einsatzHistorie || []).length === 1, 'genau 1 Historie-Eintrag');
  const h1 = d.einsatzHistorie[0];
  ok(h1 && h1.devId === 'g1', 'Historie trägt die Herkunfts-Marke devId');
  ok(h1 && h1.betriebsstunden === 55 && h1.kwhTotal === 66, 'Stunden/kWh aus dem Zählerstand gerechnet (55 h · 1.2 kW)');
  ok(h1 && h1.eingesetztAm === '2026-07-01', 'ursprüngliches Einsatz-Datum in der Historie');

  console.log('\n— A) Wieder einbuchen nimmt den Historie-Eintrag zurück —');
  await page.evaluate(() => sdUpdateDevEnd('sd_x', 0, ''));
  await page.waitForTimeout(400);
  d = await dev('tg_1');
  ok(d && d.status === 'im_einsatz' && d.einsatz, 'Endwert geleert → wieder eingebucht');
  ok(d && d.einsatz.eingesetztAm === '2026-07-01', 'eingesetztAm bleibt erhalten (kein heutiges Datum)');
  ok(d && (d.einsatzHistorie || []).length === 0, 'Historie-Eintrag zurückgenommen');
  ok(d && d.einsatz.zurueckAm === undefined && d.einsatz.zaehlerEnde === undefined, 'Ende-Felder aus dem Einsatz entfernt');

  // Zweimal aus- und einbuchen → Historie wächst nicht
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => sdUpdateDevEnd('sd_x', 0, '60'));
    await page.waitForTimeout(250);
    await page.evaluate(() => sdUpdateDevEnd('sd_x', 0, ''));
    await page.waitForTimeout(250);
  }
  d = await dev('tg_1');
  ok(d && (d.einsatzHistorie || []).length === 0 && d.status === 'im_einsatz', 'mehrfaches Aus-/Einbuchen lässt die Historie nicht wachsen');

  console.log('\n— A) Ausbuchen per End-Datum —');
  await page.evaluate(h => sdUpdateDevEndDate('sd_x', 0, h), HEUTE);
  await page.waitForTimeout(400);
  d = await dev('tg_1');
  ok(d && d.status === 'verfuegbar', 'manuelles End-Datum → Gerät frei');
  await page.evaluate(() => sdUpdateDevEndDate('sd_x', 0, ''));
  await page.waitForTimeout(400);
  d = await dev('tg_1');
  ok(d && d.status === 'im_einsatz' && (d.einsatzHistorie || []).length === 0, 'End-Datum gelöscht → wieder eingebucht, Historie sauber');

  console.log('\n— A) Ausbuchen per «Trocknung für <Raum> beendet» —');
  await page.evaluate(() => window._sdBereichEndeApply('sd_x', 'Flur'));
  await page.waitForTimeout(500);
  let s = await getS();
  ok(s.trocknung.geraete[1].entferntAm === HEUTE, 'Bereichs-Abschluss setzt End-Datum am Ventilator');
  d = await dev('tg_2');
  ok(d && d.status === 'verfuegbar' && !d.einsatz, 'Ventilator (Laufzeit) ist in der Verwaltung frei');
  ok(d && (d.einsatzHistorie || []).length === 1 && d.einsatzHistorie[0].zaehlerTyp === 'laufzeit',
    'Laufzeit-Erfassung wandert als zaehlerTyp «laufzeit» in die Historie');
  d = await dev('tg_1');
  ok(d && d.status === 'im_einsatz', 'Gerät im anderen Raum (Bad) bleibt eingebucht');

  console.log('\n— A) Bereich wieder öffnen —');
  await page.evaluate(() => {
    var i = window._sdAreaNames ? window._sdAreaNames(sdGetById('sd_x')).indexOf('Flur') : 1;
    sdBereichTrocknungReopen('sd_x', i < 0 ? 1 : i);
  });
  await page.waitForSelector('.gema-dlg-bg', { timeout: 4000 });
  await page.click('.gema-dlg-bg [data-act="ok"]');
  await page.waitForTimeout(500);
  d = await dev('tg_2');
  ok(d && d.status === 'im_einsatz' && d.einsatz, 'Reopen bucht den Ventilator wieder ein');
  ok(d && d.einsatz.eingesetztAm === '2026-07-02', 'ursprüngliches Einsatz-Datum wiederhergestellt');
  ok(d && (d.einsatzHistorie || []).length === 0, 'Historie-Eintrag zurückgenommen');

  console.log('\n— A2) EMPTY-READ-GUARD: leerer Pool fasst nichts an —');
  const guard = await page.evaluate(() => {
    var vorher = JSON.parse(JSON.stringify(GemaSync.getCached('gema_trocknung_v1')));
    localStorage.setItem('gema_trocknung_v1', '[]');
    var s = sdGetById('sd_x');
    s.trocknung.geraete[0].entferntAm = '2026-07-20';   // ausgebucht
    var dirty = window._sdSyncTgEinsatz(s);
    var nachher = JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]');
    s.trocknung.geraete[0].entferntAm = null;
    localStorage.setItem('gema_trocknung_v1', JSON.stringify(vorher));
    return { leer: nachher.length === 0, dirty: dirty };
  });
  ok(guard.leer, 'leerer Pool wird nicht überschrieben (offline/Cloud nicht geladen)');
  ok(guard.dirty === false, 'Abgleich meldet "nichts getan" statt eine Löschung zu behaupten');

  console.log('\n— D) Deep-Link ?geraet= springt zum Gerät —');
  await page.goto(BASE + '/sd_schadensbericht.html?id=sd_x&geraet=tg_1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window.schaeden || []).length >= 1, null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(1400);
  const dl = await page.evaluate(() => {
    var acc = document.getElementById('acc_trocknung');
    var card = document.querySelector('.dev-card[data-devid="tg_1"]');
    return { detail: !!document.querySelector('.detail-view.open, #detailView.open, .detail-view'),
      accOffen: !!(acc && acc.classList.contains('open')),
      karte: !!card, puls: !!(card && card.classList.contains('sd-puls')) };
  });
  ok(dl.karte, 'Geräte-Karte trägt data-devid und ist auffindbar');
  ok(dl.accOffen, 'Trocknungs-Sektion wird für den Sprung geöffnet');
  ok(dl.puls, 'Karte pulsiert (.sd-puls)');

  console.log('\n— B) if_trocknung: Banner ist ein Link zum Bericht —');
  await page.goto(BASE + '/if_trocknung.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#cardGrid .tool-card').length >= 5,
    null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.querySelectorAll('#cardGrid .tool-card').length) === 5,
    'alle 5 Geräte gerendert');
  // Geprueft wird die GERENDERTE Karte, nicht die interne Helferfunktion —
  // der Nutzer sieht den Banner, nicht den Rueckgabewert.
  const karten = await kartenVon(page);
  ok((karten.tg_1 || '').indexOf('geraet=tg_1') >= 0, 'laufendes Gerät: Banner verlinkt Bericht + Gerät');
  ok((karten.tg_frei || '').indexOf('tc-einsatz') < 0, 'freies Gerät hat gar keinen Einsatz-Banner');
  ok((karten.tg_alt || '').indexOf('tc-einsatz') >= 0, 'Altbestand zeigt den Banner');
  ok((karten.tg_alt || '').indexOf('<a class="tc-einsatz"') < 0,
    'Einsatz ohne schadenId bekommt keinen Link (keine Sackgasse)');
  ok((karten.tg_fremd || '').indexOf('id=sd_ANDERER') >= 0, 'fremder Einsatz verlinkt seinen eigenen Bericht');

  const cardHtml = await page.evaluate(() => (document.getElementById('cardGrid') || {}).innerHTML || '');
  ok(cardHtml.indexOf('<a class="tc-einsatz"') >= 0, 'Einsatz-Banner ist ein <a>');
  ok(cardHtml.indexOf('Bericht öffnen ›') >= 0, 'Banner sagt «Bericht öffnen ›»');
  ok(cardHtml.indexOf('sd_schadensbericht.html?id=sd_x&amp;geraet=tg_1') >= 0 || cardHtml.indexOf('sd_schadensbericht.html?id=sd_x&geraet=tg_1') >= 0,
    'Banner-href zeigt auf Bericht + Gerät');
  const tblHtml = await page.evaluate(() => (document.getElementById('tBody') || {}).innerHTML || '');
  ok(tblHtml.indexOf('sd_schadensbericht.html?id=sd_x') >= 0, 'Tabellen-Zelle verlinkt ebenfalls');
  const detailHtml = await page.evaluate(() => { openDetail('tg_1'); return (document.getElementById('detailModal') || document.body).innerHTML; });
  ok(detailHtml.indexOf('sd_schadensbericht.html?id=sd_x') >= 0, 'Detail-Modal verlinkt das Schadensprojekt');
  await page.evaluate(() => { try { closeDetail(); } catch(e) {} });

  console.log('\n— B) Rückkanal: gema-trocknung-updated aktualisiert die Liste —');
  // KRITISCH: if_trocknung liegt komplett in einer IIFE — `devices`/`load()`
  // sind von aussen NICHT erreichbar. Geprueft wird darum das, was der
  // Nutzer sieht: die gerenderte Karte.
  await page.evaluate(async () => {
    var all = JSON.parse(localStorage.getItem('gema_trocknung_v1') || '[]');
    var d = all.find(x => x.id === 'tg_1');
    d.status = 'verfuegbar'; d.einsatz = null;
    localStorage.setItem('gema_trocknung_v1', JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('gema-trocknung-updated', { detail: { ts: new Date().toISOString() } }));
    await new Promise(r => setTimeout(r, 600));
  });
  const karte1 = await karteVon(page, 'tg_1');
  ok(karte1.indexOf('geraet=tg_1') < 0, 'externe Freigabe kommt in der offenen Liste an (kein Bericht-Link mehr)');
  ok(karte1.indexOf('tc-einsatz') < 0, 'Einsatz-Banner ist verschwunden');
  ok(karte1.indexOf('badge-ok') >= 0, 'Karte zeigt den Status «verfügbar»');

  ok(errs.filter(e => e.indexOf('ResizeObserver') < 0).length === 0,
    'keine pageerrors (' + errs.join(' | ').slice(0, 160) + ')');
} catch (e) {
  fail++; console.error('  ✗ EXCEPTION:', e.message);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + (pass + fail) + ' fehlgeschlagen') : ('✓ Alle ' + pass + ' Checks grün')));
process.exit(fail ? 1 : 0);
