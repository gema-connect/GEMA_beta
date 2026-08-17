// Schadensbericht: Bereichs-Struktur (Fotos/Messpunkte/Geräte je betroffenem
// Bereich) + Referenz-Ausgangslage + Foto-Fix + Massnahmen-UX — Playwright.
//
// Deckt ab:
//  A) BESTANDSSCHUTZ (User-Vorgabe «keine Daten verlieren»): Alt-Bericht ohne
//     raum-Felder rendert; nicht zugeordnete Items landen im «Ohne Bereich»-
//     Bucket und bleiben VOLL sichtbar (komplette Messreihe/Foto), Boot +
//     Save-Roundtrip byte-identisch (kein raum-Key injiziert).
//  B) Bereichs-UI: je Bereich Fotos + Messpunkte (+Referenz) + Geräte;
//     Add-Buttons in den Bereichskarten (kein Dropdown); Referenz-Badge,
//     «Erste Messung ausstehend»-Pill; Gesamtübersicht (Total kWh + Chart).
//  C) Zuweisung: Auswahl-Fallback (move-select) + DnD-Handler setzen raum
//     ADDITIV (übrige Felder unverändert), Item wandert in die Bereichskarte.
//  D) Geräte-QR-Zuweisung je Bereich: gemockter Scan füllt Name/kW + aktuellen
//     Zählerstand zur Gegenprüfung, Bereich vorbelegt, «Hinzufügen» ordnet zu.
//  E) Massnahmen: «+ Massnahme»-Button UNTER der Liste, neue Zeile synchron
//     angehängt + fokussiert (Tastatur/iOS).
//  F) Referenz-Flow (Analyse) + Vorlage-PDF-Marker weiterhin korrekt.
//
// Aufruf:  CHROME=<chromium> node scripts/schadensbericht_messpunkte_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8894;
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

const TINY_JPG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const TINY_JPG_DATAURL = 'data:image/jpeg;base64,' + TINY_JPG_B64;
const HEUTE = new Date().toISOString().slice(0, 10);

// ── Alt-Format-Bericht: raeume ['Küche'] vorhanden, aber Messpunkt+Foto OHNE
//    raum-Feld → «Ohne Bereich»-Bucket. Prüft Bestandsschutz. ──
const SD_ALT = {
  id: 'sd_alt', typ: 'wasserschaden', titel: 'Altbericht Küche', objektId: 'obj1', phase: 'trocknung',
  beschreibung: 'Wasser unter Spüle', ursache: 'Anschluss undicht', raeume: ['Küche'],
  versicherung: { name: 'V AG', policeNr: 'P-1', schadenNr: 'S-1', kontakt: '' },
  erstelltAm: '2026-06-20', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
  zustandsanalyse: {
    leckortung: 'Leitung Spüle', schadenausmass: 'Boden nass',
    massnahmen: [{ id: 'mn1', beschreibung: 'Sockelleisten demontiert' }],
    fotos: [{ id: 'ph1', dataUrl: TINY_JPG_DATAURL, kommentar: 'Übersicht', imBericht: true, erstelltAm: '2026-06-20', phase: 'analyse' }],
    abgeschlossenAm: '2026-06-21'
  },
  trocknung: {
    gestartetAm: '2026-06-22', beendetAm: null,
    messpunkte: [{ id: 'mp_alt', name: 'Wand links Küche', messungen: [
      { id: 'm1', datum: '2026-06-22', wert: 120, einheit: 'Digits', foto: null },
      { id: 'm2', datum: '2026-06-29', wert: 95, einheit: 'Digits', foto: null }
    ] }],
    geraete: [{ id: 'dev_alt', name: 'Trockner A', raum: 'Küche', kw: 1.2, zaehlerStart: 100, zaehlerEnde: '', zaehlerTyp: 'stunden' }],
    fotos: [], notizen: 'läuft'
  },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

// ── Analyse-Bericht: Bereich «Bad» mit einem Referenz-Messpunkt. ──
const SD_ANA = {
  id: 'sd_ana', typ: 'rohrbruch', titel: 'Analysebericht Bad', objektId: 'obj1', phase: 'analyse',
  beschreibung: '', ursache: '', raeume: ['Bad'],
  versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
  erstelltAm: '2026-07-10', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
  zustandsanalyse: { leckortung: 'Steigleitung', schadenausmass: '', massnahmen: [], fotos: [], abgeschlossenAm: null },
  trocknung: {
    gestartetAm: null, beendetAm: null,
    messpunkte: [{ id: 'mp_a1', name: 'Decke Bad', raum: 'Bad', messungen: [
      { id: 'mr1', datum: '2026-07-10', wert: 140, einheit: 'Digits', foto: null, referenz: true }
    ] }],
    geraete: [], fotos: [], notizen: ''
  },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

// Trocknungsgerät im Pool (für QR-Scan-Zuweisung)
const TG_DEV = { id: 'tg_77', orgId: 'org_t', status: 'verfuegbar', name: 'Bautrockner X', typ: 'bautrockner', kw: 1.5, zaehlerTyp: 'stunden', aktuellerZaehlerstand: 42 };

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const SEED = {
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }],
  gema_session_v1: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidV90ZXN0Iiwib3JnIjoib3JnX3Rlc3QiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.testsig', userId: 'u_p', expires: FUTURE },
  gema_objekte_v1: { objekte: [{ id: 'obj1', name: 'MFH Musterweg 3', strasse: 'Musterweg 3', plz: '8000', ort: 'Zürich' }], beteiligte: [], activeObjektId: '' },
  gema_trocknung_v1: [TG_DEV]
};

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  const isSb = u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0;
  if (isSb) {
    if (route.request().method() === 'GET' && u.indexOf('module_key=eq.schadensbericht') >= 0) {
      const rows = [
        { data_key: 'schaden:sd_alt', payload: { data: SD_ALT, _lm: '2026-07-10T08:00:00Z' } },
        { data_key: 'schaden:sd_ana', payload: { data: SD_ANA, _lm: '2026-07-10T08:00:00Z' } }
      ];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
  }
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, SEED);

const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window._sdCloudLoaded === true || (window.schaeden || []).length >= 2, null, { timeout: 9000 }).catch(() => {});
await page.waitForTimeout(400);
// gema_trocknung_v1-Pool wird beim Boot ggf. aus der (leeren) Cloud überschrieben → neu setzen
await page.evaluate(d => localStorage.setItem('gema_trocknung_v1', JSON.stringify([d])), TG_DEV);

console.log('— A) Bestandsschutz Alt-Bericht (Ohne-Bereich-Bucket, volle Sichtbarkeit) —');
{
  const st = await page.evaluate(() => ({ n: (window.schaeden || []).length }));
  ok(st.n === 2, 'beide Cloud-Berichte geladen (' + st.n + ')');
  const cacheAlt = await page.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem('gema_schadensbericht_v1') || '[]');
    return JSON.stringify(arr.find(x => x.id === 'sd_alt') || null);
  });
  ok(cacheAlt === JSON.stringify(SD_ALT), 'Alt-Record nach Boot byte-identisch (keine raum-Migration)');

  await page.evaluate(() => sdOpenDetail('sd_alt'));
  await page.waitForTimeout(300);
  const det = await page.evaluate(() => {
    const ana = document.querySelector('#acc_analyse .acc-body');
    const tro = document.querySelector('#acc_trocknung .acc-body');
    return {
      anaTxt: ana ? ana.textContent : '',
      troTxt: tro ? tro.textContent : '',
      areaCards: tro ? tro.querySelectorAll('.sd-area:not(.sd-area-none)').length : -1,
      bucket: tro ? !!tro.querySelector('.sd-area-none') : false
    };
  });
  ok(det.troTxt.indexOf('🏠 Küche') >= 0, 'Bereichs-Karte «Küche» (aus raeume) vorhanden');
  ok(det.bucket === true, '«Ohne Bereich»-Bucket vorhanden (Alt-Messpunkt/-Gerät ohne raum)');
  // Alt-Gerät hat raum:'Küche' → gehört in die Küche-Karte, NICHT in den Bucket
  ok(det.troTxt.indexOf('Trockner A') >= 0, 'Alt-Gerät (raum Küche) in der Bereichs-Karte sichtbar');
  // Alt-Messpunkt (raum='') im Bucket MIT voller Messreihe (120/95 sichtbar)
  ok(det.troTxt.indexOf('Wand links Küche') >= 0 && det.troTxt.indexOf('120 Digits') >= 0 && det.troTxt.indexOf('95 Digits') >= 0,
    'Alt-Messpunkt im Bucket mit VOLLER Messreihe (nichts versteckt)');
  ok(det.anaTxt.indexOf('Betroffene Bereiche') >= 0, 'Analyse zeigt die Bereichs-Sektion');
  // Alt-Analyse-Foto (raum='') im Bucket sichtbar
  ok(det.anaTxt.indexOf('Ohne Bereich') >= 0, 'Analyse-Bucket vorhanden (Alt-Foto ohne raum)');

  // Save-Roundtrip: Textänderung → Items byte-identisch (kein raum injiziert)
  await page.evaluate(() => sdUpdateAnalyse('sd_alt', 'leckortung', 'Leitung Spüle — präzisiert'));
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('gema_schadensbericht_v1') || '[]').find(x => x.id === 'sd_alt');
    return { mp: JSON.stringify(s.trocknung.messpunkte), fotos: JSON.stringify(s.zustandsanalyse.fotos), ger: JSON.stringify(s.trocknung.geraete) };
  });
  ok(after.mp === JSON.stringify(SD_ALT.trocknung.messpunkte), 'Messpunkte nach Save-Roundtrip byte-identisch');
  ok(after.fotos === JSON.stringify(SD_ALT.zustandsanalyse.fotos), 'Analyse-Fotos unverändert');
  ok(after.ger === JSON.stringify(SD_ALT.trocknung.geraete), 'Geräte unverändert');
}

console.log('— C) Zuweisung: Auswahl-Fallback + DnD setzen raum additiv —');
{
  // move-select im Bucket: Alt-Messpunkt der Küche (areaIdx 0) zuweisen
  const moved = await page.evaluate(() => {
    // move-select des Messpunkts finden (kind 'mp')
    var sels = Array.from(document.querySelectorAll('#acc_trocknung .sd-area-none select.sd-move-sel'));
    var target = sels.find(s => s.getAttribute('onchange').indexOf("'mp'") >= 0);
    if (!target) return { ok: false };
    target.value = '0'; // areaIdx 0 = «Küche»
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  });
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const s = window.schaeden.find(x => x.id === 'sd_alt');
    const mp = s.trocknung.messpunkte.find(m => m.id === 'mp_alt');
    return { raum: mp.raum, msgCount: mp.messungen.length, w0: mp.messungen[0].wert };
  });
  ok(res.raum === 'Küche', 'Auswahl-Fallback setzt mp.raum = «Küche» (' + res.raum + ')');
  ok(res.msgCount === 2 && res.w0 === 120, 'Messungen additiv erhalten (raum-Feld nur ergänzt)');
  const inCard = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#acc_trocknung .sd-area:not(.sd-area-none)'));
    const kueche = cards.find(c => (c.textContent || '').indexOf('🏠 Küche') >= 0);
    return kueche ? kueche.textContent.indexOf('Wand links Küche') >= 0 : false;
  });
  ok(inCard, 'zugewiesener Messpunkt erscheint jetzt in der Küche-Karte');

  // DnD-Handler direkt: Alt-Analyse-Foto (idx 0) per Drop der Küche zuweisen
  const dnd = await page.evaluate(() => {
    sdDragStart({ dataTransfer: { setData(){}, } }, 'sd_alt', 'foto', 'analyse', 0);
    sdDropOnArea({ preventDefault(){} }, 'sd_alt', 0);
    const s = window.schaeden.find(x => x.id === 'sd_alt');
    return s.zustandsanalyse.fotos[0].raum;
  });
  ok(dnd === 'Küche', 'DnD-Drop setzt foto.raum = «Küche» (' + dnd + ')');
}

console.log('— B) Bereichs-UI: Referenz-Karte + Add-Buttons + Gesamtübersicht —');
{
  await page.evaluate(() => sdOpenDetail('sd_ana'));
  await page.waitForTimeout(250);
  const ana = await page.evaluate(() => {
    const el = document.querySelector('#acc_analyse .acc-body');
    const card = Array.from(el.querySelectorAll('.sd-area')).find(c => (c.textContent || '').indexOf('🏠 Bad') >= 0);
    return {
      hasBad: !!card,
      cardTxt: card ? card.textContent : '',
      addFoto: card ? /sdTriggerPhotoUpload\('sd_ana','analyse',\d+\)/.test(card.innerHTML) : false,
      addMp: card ? /sdOpenMpAdd\('sd_ana','analyse',\d+\)/.test(card.innerHTML) : false,
      refPill: card ? card.querySelectorAll('.sd-ref-pill').length : -1
    };
  });
  ok(ana.hasBad, 'Bereichs-Karte «Bad» vorhanden');
  ok(ana.cardTxt.indexOf('140 Digits') >= 0 && ana.refPill >= 1, 'Referenzmessung (140) mit Badge im Bereich');
  ok(ana.addFoto && ana.addMp, 'Add-Buttons (Foto + Messpunkt) hängen an der Bereichs-Karte (kein Dropdown)');

  // Trocknung: «Erste Messung ausstehend»-Pill + Gesamtübersicht-Chart, QR-Button
  await page.evaluate(() => { const s = window.schaeden.find(x => x.id === 'sd_ana'); sdAdvancePhase('sd_ana', 'trocknung'); });
  await page.waitForTimeout(250);
  const tro = await page.evaluate(() => {
    const el = document.querySelector('#acc_trocknung .acc-body');
    return {
      firstPill: el.querySelectorAll('.sd-first-pill').length,
      // Der Bereichs-Knopf gibt den Modus IMMER mit — er darf nie wieder
      // auf mode:'auto' zurückfallen (sonst startet Android zwingend NFC).
      scanBtn: /sdScanDevForArea\('sd_ana',\d+,'qr'\)/.test(el.innerHTML),
      nfcBtn: /sdScanDevForArea\('sd_ana',\d+,'nfc'\)/.test(el.innerHTML),
      gesamt: el.textContent.indexOf('Gesamtübersicht') >= 0,
      gestartet: window.schaeden.find(x => x.id === 'sd_ana').trocknung.gestartetAm
    };
  });
  ok(tro.firstPill === 1, '«Erste Messung ausstehend»-Pill am Bad-Messpunkt (nur Referenz)');
  ok(tro.scanBtn, '«QR scannen & zuweisen»-Button je Bereich (Modus explizit)');
  ok(!tro.nfcBtn, 'ohne Web-NFC (Desktop/Chromium) kein NFC-Knopf — QR bleibt der Weg');
  ok(tro.gestartet === HEUTE, 'gestartetAm beim Phasenwechsel gesetzt (' + tro.gestartet + ')');
}

console.log('— D) Geräte-QR-Zuweisung je Bereich (gemockter Scan + Zählerstand-Gegenprüfung) —');
{
  const scan = await page.evaluate(() => {
    // GemaNFC mocken: Scan liefert sofort eine Geräte-URL
    window.GemaNFC = {
      isAvailable: () => false, isIos: () => false,
      parseTgUrl: () => 'tg_77',
      scan: (opts) => { opts.onScan('if_trocknung.html?id=tg_77'); }
    };
    // areaIdx der «Bad»-Karte ermitteln
    var idx = _sdAreaNames(window.schaeden.find(x => x.id === 'sd_ana')).indexOf('Bad');
    sdScanDevForArea('sd_ana', idx);
    return {
      name: document.getElementById('devName').value,
      kw: document.getElementById('devKw').value,
      start: document.getElementById('devStart').value,
      raum: document.getElementById('devRaumSelect').value,
      modalOpen: !document.getElementById('devAddModal').classList.contains('hidden')
    };
  });
  ok(scan.modalOpen, 'Geräte-Modal offen nach Scan');
  ok(scan.name === 'Bautrockner X' && scan.kw == 1.5, 'Name/kW aus dem gescannten Gerät vorbefüllt');
  ok(scan.start === '42' || Number(scan.start) === 42, 'aktueller Zählerstand (42) zur Gegenprüfung vorbefüllt');
  ok(scan.raum === 'Bad', 'Bereich «Bad» vorbelegt');
  // Monteur bestätigt → Gerät wird dem Bereich zugewiesen
  const added = await page.evaluate(() => {
    sdAddGeraet();
    const s = window.schaeden.find(x => x.id === 'sd_ana');
    const g = s.trocknung.geraete[s.trocknung.geraete.length - 1];
    return { raum: g.raum, name: g.name, tg: g.tgDeviceId, start: g.zaehlerStart };
  });
  ok(added.raum === 'Bad' && added.name === 'Bautrockner X' && added.tg === 'tg_77', 'Gerät dem Bereich «Bad» zugewiesen (QR-verknüpft)');
  ok(added.start === 42, 'gegengeprüfter Zählerstand (42) übernommen');
  await page.evaluate(() => document.getElementById('devAddModal').classList.add('hidden'));
}

console.log('— D2) Android: QR bleibt wählbar, obwohl Web-NFC vorhanden ist —');
{
  // Android Chrome simulieren: NDEFReader existiert → 'auto' hätte früher
  // IMMER NFC gestartet, ein Gerät mit blosser QR-Etikette war unscanbar.
  const und = await page.evaluate(() => {
    window.__scanModi = [];
    window.GemaNFC = {
      isAvailable: () => true, isIos: () => false,
      parseTgUrl: () => 'tg_78',
      scan: (opts) => { window.__scanModi.push(opts.mode); }
    };
    sdOpenDetail('sd_ana');
    return true;
  });
  await page.waitForTimeout(250);
  const btns = await page.evaluate(() => {
    const el = document.querySelector('#acc_trocknung .acc-body');
    return {
      qr: /sdScanDevForArea\('sd_ana',\d+,'qr'\)/.test(el.innerHTML),
      nfc: /sdScanDevForArea\('sd_ana',\d+,'nfc'\)/.test(el.innerHTML)
    };
  });
  ok(und.true !== false && btns.qr, 'Android: «QR scannen»-Knopf je Bereich vorhanden');
  ok(btns.nfc, 'Android: «NFC scannen» steht als ZWEITER Knopf daneben (Wahl statt Automatik)');

  // Beide Knöpfe reichen ihren Modus durch — kein 'auto' mehr
  const modi = await page.evaluate(() => {
    var idx = _sdAreaNames(window.schaeden.find(x => x.id === 'sd_ana')).indexOf('Bad');
    window.__scanModi = [];
    sdScanDevForArea('sd_ana', idx, 'qr');
    document.getElementById('devAddModal').classList.add('hidden');
    sdScanDevForArea('sd_ana', idx, 'nfc');
    document.getElementById('devAddModal').classList.add('hidden');
    var modalBtns = {
      qrSichtbar: document.getElementById('devQrScanBtn').style.display !== 'none',
      nfcSichtbar: document.getElementById('devNfcScanBtn').style.display !== 'none'
    };
    return { modi: window.__scanModi, modalBtns: modalBtns };
  });
  ok(modi.modi[0] === 'qr', 'QR-Knopf startet den Kamera-Scan (mode qr, nicht auto)');
  ok(modi.modi[1] === 'nfc', 'NFC-Knopf startet den NFC-Scan (mode nfc)');
  ok(modi.modalBtns.qrSichtbar && modi.modalBtns.nfcSichtbar, 'Android: im Geräte-Dialog stehen BEIDE Scan-Knöpfe');

  // Gegenprobe iPhone/Desktop: kein Web-NFC → nur QR, NFC-Knopf weg
  const ios = await page.evaluate(() => {
    window.GemaNFC.isAvailable = () => false;
    window.GemaNFC.isIos = () => true;
    var idx = _sdAreaNames(window.schaeden.find(x => x.id === 'sd_ana')).indexOf('Bad');
    window.__scanModi = [];
    sdScanDevForArea('sd_ana', idx, 'nfc');   // NFC angefragt, aber unmöglich
    var r = {
      nfcSichtbar: document.getElementById('devNfcScanBtn').style.display !== 'none',
      hinweis: document.getElementById('devScanStatus').textContent,
      modus: window.__scanModi[0]
    };
    document.getElementById('devAddModal').classList.add('hidden');
    return r;
  });
  ok(!ios.nfcSichtbar, 'iPhone/Desktop: NFC-Knopf im Dialog ausgeblendet');
  ok(ios.modus === 'qr', 'NFC-Anfrage ohne Web-NFC fällt auf QR zurück (statt ins Leere zu laufen)');
  ok(/iPhone/.test(ios.hinweis), 'iPhone-Hinweis (Tag ans Gerät halten / sonst QR) steht im Dialog');
}

console.log('— D3) Zentraler Helper: NFC-Overlay hat den Umschalter auf QR —');
{
  // Betrifft ALLE mode:'auto'-Aufrufer. Echtes gema_nfc_scanner.js gegen
  // einen NDEFReader-Stub, der nie auflöst (Tag wird nie aufgelegt).
  const sw = await page.evaluate(() => {
    delete window.GemaNFC;                       // Mock aus D2 entfernen
    window.NDEFReader = function(){ this.scan = function(){ return new Promise(function(){}); };
                                    this.addEventListener = function(){}; };
    window.__qrGestartet = 0;
    window.GemaQR = { scan: function(){ window.__qrGestartet++; }, stop: function(){} };
    return new Promise(function(res){
      var s = document.createElement('script');
      s.src = 'gema_nfc_scanner.js?t=' + Date.now();   // Helper frisch laden
      s.onload = function(){
        GemaNFC.scan({ mode: 'auto', onScan: function(){} });
        var btn = document.getElementById('gemaNfcToQr');
        var vorher = { nfcModus: !!document.getElementById('gemaNfcStatus'), knopf: !!btn };
        if (btn) btn.click();
        res({
          vorher: vorher,
          qrGestartet: window.__qrGestartet,
          bannerWeg: !document.getElementById('gemaNfcStatus'),
          knopfWeg: !document.getElementById('gemaNfcToQr')
        });
      };
      document.head.appendChild(s);
    });
  });
  ok(sw.vorher.nfcModus, 'auto wählt bei vorhandenem NDEFReader weiterhin NFC (Banner steht)');
  ok(sw.vorher.knopf, 'NFC-Overlay bietet «📷 Stattdessen QR-Code scannen»');
  ok(sw.qrGestartet === 1, 'Klick startet den Kamera-Scanner');
  ok(sw.bannerWeg && sw.knopfWeg, 'NFC-Overlay wird beim Umschalten restlos abgeräumt (keine Geister-Knöpfe)');
  await page.evaluate(() => { delete window.NDEFReader; });
}

console.log('— E) Massnahmen: Button unter der Liste + synchron angehängt + fokussiert —');
{
  await page.evaluate(() => sdOpenDetail('sd_alt'));
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => {
    const list = document.getElementById('mnList_sd_alt');
    if (!list) return { ok: false };
    // Button muss NACH der Liste im DOM stehen (unter den Massnahmen)
    var btn = list.parentElement.querySelector('button[onclick*="sdAddMnInline"]');
    var afterList = btn && (list.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { ok: true, rows: list.querySelectorAll('.mn-edit').length, btnAfter: !!afterList };
  });
  ok(layout.ok && layout.btnAfter, '«+ Massnahme»-Button steht unter der Massnahmen-Liste');
  const before = layout.rows;
  const added = await page.evaluate(() => {
    sdAddMnInline('sd_alt');
    const list = document.getElementById('mnList_sd_alt');
    const rows = list.querySelectorAll('.mn-edit');
    const last = rows[rows.length - 1];
    return { rows: rows.length, focused: document.activeElement === last, isTextarea: document.activeElement && document.activeElement.classList.contains('mn-edit') };
  });
  ok(added.rows === before + 1, 'neue Massnahme-Zeile synchron angehängt (' + before + '→' + added.rows + ')');
  ok(added.focused && added.isTextarea, 'neue Textbox ist fokussiert (Tastatur öffnet)');
  // Kein Datenverlust: bestehende Massnahme noch da
  const keep = await page.evaluate(() => window.schaeden.find(x => x.id === 'sd_alt').zustandsanalyse.massnahmen[0].beschreibung);
  ok(keep === 'Sockelleisten demontiert', 'bestehende Massnahme erhalten');
}

console.log('— F) Referenz-Flow (Analyse) + Vorlage-PDF-Marker —');
{
  await page.evaluate(() => sdOpenDetail('sd_ana'));
  await page.waitForTimeout(200);
  // Neuen Messpunkt aus der Bad-Karte anlegen → kettet in Referenzmessung
  const flow = await page.evaluate(() => {
    var idx = _sdAreaNames(window.schaeden.find(x => x.id === 'sd_ana')).indexOf('Bad');
    sdOpenMpAdd('sd_ana', 'analyse', idx);
    var hintVisible = document.getElementById('mpRefHint').style.display !== 'none';
    document.getElementById('mpName').value = 'Boden Bad';
    sdAddMesspunkt();
    var messOpen = !document.getElementById('messAddModal').classList.contains('hidden');
    var refChecked = document.getElementById('messReferenz').checked;
    document.getElementById('messVal').value = '150';
    sdAddMessung();
    var s = window.schaeden.find(x => x.id === 'sd_ana');
    var mp = s.trocknung.messpunkte.find(m => m.name === 'Boden Bad');
    return { hintVisible, messOpen, refChecked, raum: mp && mp.raum, mess: mp && mp.messungen[0] };
  });
  ok(flow.hintVisible && flow.messOpen && flow.refChecked, 'Analyse-Kette: Hint + Referenzmessung-Modal + Checkbox vorbelegt');
  ok(flow.raum === 'Bad' && flow.mess && flow.mess.referenz === true && flow.mess.wert === 150, 'neuer Messpunkt im Bereich «Bad» mit Referenzmessung');

  const [pop] = await Promise.all([
    page.waitForEvent('popup', { timeout: 8000 }),
    page.evaluate(() => {
      const s = window.schaeden.find(x => x.id === 'sd_ana');
      GemaSchadenPDF.exportPrint(s, { org: { name: 'T AG' }, user: { name: 'P' }, objektName: 'MFH', objektAdresse: '', phases: ['analyse', 'trocknung'] });
    })
  ]);
  await pop.waitForLoadState('domcontentloaded').catch(() => {});
  await pop.waitForTimeout(400);
  const t = await pop.evaluate(() => document.body.textContent || '');
  ok(t.indexOf('Ausgangslage (Referenz)') >= 0 && t.indexOf('(Referenz)') >= 0, 'Vorlage-PDF: Ausgangslage-Tabelle + Referenz-Marker');
  await pop.close();
}

ok(errs.length === 0, 'keine pageerrors (' + (errs.join(' | ') || '—') + ')');

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
