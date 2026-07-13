// Schadensbericht: Messpunkte-Ausgangslage (Analyse-Phase) + Foto-Fix — Playwright-Suite.
//
// Deckt ab:
//  A) BESTANDSSCHUTZ (User-Vorgabe): ein Alt-Format-Bericht (Messungen OHNE
//     referenz-Flag, Fotos als dataUrl) rendert unveraendert, uebersteht den
//     Boot byte-identisch und verliert bei einem Save-Roundtrip keine Daten.
//  B) Neue Flows: Messpunkt + Referenzmessung aus der Analyse-Phase
//     (mpRefHint, Checkbox vorbelegt, referenz:true nur wenn angehakt),
//     Referenz-Badge in der Trocknungs-Tabelle, «Erste Messung ausstehend»-
//     Pill, gestartetAm-Setzung beim Phasenwechsel trotz vorbestehendem
//     s.trocknung-Objekt, Chart mit gemischten Flags.
//  C) Foto-Fix: dynamischer File-Input haengt IM DOM (iOS-GC-Bug),
//     zwei Fotos hintereinander werden beide uebernommen, Input wird
//     nach dem change-Event abgeraeumt.
//  D) Vorlage-PDF (gema_schaden_pdf.js): Ausgangslage-Tabelle nur bei
//     vorhandenen Referenzmessungen; Alt-Bericht ohne Referenzen unveraendert.
//
// Aufruf:  CHROME=<chromium> node scripts/schadensbericht_messpunkte_test.mjs
// (braucht playwright-core im node_modules-Pfad; GEMA_ROOT optional)
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

// 1×1-px-JPEG (gueltig dekodierbar) fuer die Foto-Flows
const TINY_JPG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const TINY_JPG_DATAURL = 'data:image/jpeg;base64,' + TINY_JPG_B64;
const HEUTE = new Date().toISOString().slice(0, 10);

// ── Alt-Format-Bericht (Stand VOR dieser Aenderung): Messungen ohne
//    referenz-Flag, Foto als Base64-dataUrl, Phase Trocknung ──
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
    geraete: [{ name: 'Trockner A', raum: 'Küche', kw: 1.2, zaehlerStart: 100, zaehlerEnde: '', zaehlerTyp: 'stunden' }],
    fotos: [], notizen: 'läuft'
  },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

// ── Bericht in der Analyse-Phase — s.trocknung existiert bereits mit
//    gestartetAm:null (genau der Zustand, den der neue Analyse-Flow erzeugt) ──
const SD_ANA = {
  id: 'sd_ana', typ: 'rohrbruch', titel: 'Analysebericht Bad', objektId: 'obj1', phase: 'analyse',
  beschreibung: '', ursache: '', raeume: ['Bad'],
  versicherung: { name: '', policeNr: '', schadenNr: '', kontakt: '' },
  erstelltAm: '2026-07-10', erstelltVon: { userId: 'u_p', name: 'Planerin' }, orgId: 'org_t',
  zustandsanalyse: { leckortung: 'Steigleitung', schadenausmass: '', massnahmen: [], fotos: [], abgeschlossenAm: null },
  trocknung: {
    gestartetAm: null, beendetAm: null,
    messpunkte: [{ id: 'mp_a1', name: 'Decke Bad', messungen: [
      { id: 'mr1', datum: '2026-07-10', wert: 140, einheit: 'Digits', foto: null, referenz: true }
    ] }],
    geraete: [], fotos: [], notizen: ''
  },
  abschluss: { zusammenfassung: '', instandstellung: '', weitereSchaeden: '', fotos: [], abgeschlossenAm: null }
};

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const SEED = {
  gema_orgs_v1: [{ id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_p'], active: true }],
  gema_users_v1: [{ id: 'u_p', username: 'p@t.ch', name: 'Planerin', roleIds: ['role_planer'], orgId: 'org_t', active: true, profile: { email: 'p@t.ch' } }],
  gema_session_v1: { userId: 'u_p', expires: FUTURE },
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
      // Cloud liefert die zwei Berichte als per-Record-Rows (PostgREST-Form)
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

console.log('— A) Bestandsschutz Alt-Bericht —');
{
  const st = await page.evaluate(() => ({
    n: (window.schaeden || []).length,
    list: (document.getElementById('cardGrid') || document.body).textContent || ''
  }));
  ok(st.n === 2, 'beide Cloud-Berichte geladen (' + st.n + ')');
  ok(st.list.indexOf('Altbericht Küche') >= 0, 'Alt-Bericht erscheint in der Liste');
  ok(st.list.indexOf('1 Messpunkte') >= 0, 'Messpunkt-Zähler auf der Karte (auch Analyse-Phase)');

  // Byte-Identitaet des Alt-Records nach Boot (Cloud → Cache, keine stille Migration)
  const cacheAlt = await page.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem('gema_schadensbericht_v1') || '[]');
    return JSON.stringify(arr.find(x => x.id === 'sd_alt') || null);
  });
  ok(cacheAlt === JSON.stringify(SD_ALT), 'Alt-Record nach Boot byte-identisch (keine Migration/Mutation)');

  await page.evaluate(() => sdOpenDetail('sd_alt'));
  await page.waitForTimeout(300);
  const det = await page.evaluate(() => {
    const ana = document.querySelector('#acc_analyse .acc-body');
    const tro = document.querySelector('#acc_trocknung .acc-body');
    return {
      anaTxt: ana ? ana.textContent : '',
      troTxt: tro ? tro.textContent : '',
      troHtml: tro ? tro.innerHTML : '',
      refPillsTro: tro ? tro.querySelectorAll('.sd-ref-pill').length : -1,
      firstPills: tro ? tro.querySelectorAll('.sd-first-pill').length : -1
    };
  });
  ok(det.anaTxt.indexOf('Ausgangslage (Referenz)') >= 0, 'Analyse-Akkordeon zeigt den neuen Ausgangslage-Block');
  ok(det.anaTxt.indexOf('Wand links Küche') >= 0 && det.anaTxt.indexOf('Noch keine Referenzmessung') >= 0, 'Alt-Messpunkt ohne Referenz → Hinweis statt Referenzzeile');
  ok(det.anaTxt.indexOf('+ 2 Messungen in der Trocknungsphase') >= 0, 'Zähler der regulären Trocknungs-Messungen');
  ok(det.refPillsTro === 0, 'Alt-Messungen tragen KEIN Referenz-Badge (' + det.refPillsTro + ')');
  ok(det.firstPills === 0, 'keine «Erste Messung ausstehend»-Pill (Alt-Messpunkt hat reguläre Messungen)');
  ok(det.troTxt.indexOf('120 Digits') >= 0 && det.troTxt.indexOf('95 Digits') >= 0, 'Alt-Messwerte rendern unverändert');

  // Save-Roundtrip: harmlose Text-Aenderung → Messungen/Fotos bleiben identisch
  await page.evaluate(() => sdUpdateAnalyse('sd_alt', 'leckortung', 'Leitung Spüle — präzisiert'));
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => {
    const arr = JSON.parse(localStorage.getItem('gema_schadensbericht_v1') || '[]');
    const s = arr.find(x => x.id === 'sd_alt');
    return {
      leck: s.zustandsanalyse.leckortung,
      mp: JSON.stringify(s.trocknung.messpunkte),
      fotos: JSON.stringify(s.zustandsanalyse.fotos),
      ger: JSON.stringify(s.trocknung.geraete)
    };
  });
  ok(after.leck === 'Leitung Spüle — präzisiert', 'Edit ist gespeichert');
  ok(after.mp === JSON.stringify(SD_ALT.trocknung.messpunkte), 'Messpunkte/Messungen nach Save-Roundtrip byte-identisch (kein referenz-Key injiziert)');
  ok(after.fotos === JSON.stringify(SD_ALT.zustandsanalyse.fotos), 'Analyse-Fotos (dataUrl) unverändert');
  ok(after.ger === JSON.stringify(SD_ALT.trocknung.geraete), 'Geräte unverändert');
}

console.log('— B) Neuer Flow: Messpunkt + Referenzmessung aus der Analyse —');
{
  await page.evaluate(() => sdOpenDetail('sd_ana'));
  await page.waitForTimeout(250);
  const ana0 = await page.evaluate(() => {
    const ana = document.querySelector('#acc_analyse .acc-body');
    return { txt: ana ? ana.textContent : '', pills: ana ? ana.querySelectorAll('.sd-ref-pill').length : -1 };
  });
  ok(ana0.txt.indexOf('Decke Bad') >= 0 && ana0.pills >= 1 && ana0.txt.indexOf('140 Digits') >= 0, 'vorhandene Referenzmessung erscheint im Ausgangslage-Block');

  // + Messpunkt aus der Analyse: Hint sichtbar, Kette in die Referenzmessung
  const flow = await page.evaluate(() => {
    sdOpenMpAdd('sd_ana', 'analyse');
    const hintVisible = document.getElementById('mpRefHint').style.display !== 'none';
    document.getElementById('mpName').value = 'Boden Bad';
    sdAddMesspunkt();
    const messOpen = !document.getElementById('messAddModal').classList.contains('hidden');
    const refChecked = document.getElementById('messReferenz').checked;
    document.getElementById('messVal').value = '150';
    sdAddMessung();
    const s = window.schaeden.find(x => x.id === 'sd_ana');
    const mp = s.trocknung.messpunkte.find(m => m.name === 'Boden Bad');
    return { hintVisible, messOpen, refChecked, mpId: mp && mp.id, mess: mp && mp.messungen[0] };
  });
  ok(flow.hintVisible === true, 'mpRefHint im Analyse-Kontext sichtbar');
  ok(flow.messOpen === true, 'nach «Hinzufügen» öffnet direkt die Referenzmessung');
  ok(flow.refChecked === true, 'Referenz-Checkbox vorbelegt');
  ok(flow.mess && flow.mess.referenz === true && flow.mess.wert === 150, 'Messung mit referenz:true gespeichert');

  // Phasenwechsel: gestartetAm wird gesetzt, obwohl s.trocknung schon existierte
  const adv = await page.evaluate(() => {
    sdAdvancePhase('sd_ana', 'trocknung');
    const s = window.schaeden.find(x => x.id === 'sd_ana');
    return { phase: s.phase, gestartet: s.trocknung.gestartetAm };
  });
  ok(adv.phase === 'trocknung', 'Phase → trocknung');
  ok(adv.gestartet === HEUTE, 'gestartetAm gesetzt trotz vorbestehendem trocknung-Objekt (' + adv.gestartet + ')');

  await page.waitForTimeout(200);
  const tro = await page.evaluate(() => {
    const el = document.querySelector('#acc_trocknung .acc-body');
    return { txt: el ? el.textContent : '', refPills: el.querySelectorAll('.sd-ref-pill').length, firstPills: el.querySelectorAll('.sd-first-pill').length };
  });
  ok(tro.refPills >= 2, 'Referenz-Badges in der Trocknungs-Tabelle (' + tro.refPills + ')');
  ok(tro.firstPills === 2, '«Erste Messung ausstehend»-Pill an beiden Messpunkten (nur Referenzen; ' + tro.firstPills + ')');

  // Regulaere Messung: Checkbox NICHT vorbelegt, kein referenz-Key, Pill verschwindet
  const reg = await page.evaluate(() => {
    sdOpenMessAdd('sd_ana', 'mp_a1');
    const refChecked = document.getElementById('messReferenz').checked;
    document.getElementById('messVal').value = '120';
    sdAddMessung();
    const s = window.schaeden.find(x => x.id === 'sd_ana');
    const mp = s.trocknung.messpunkte.find(m => m.id === 'mp_a1');
    const neu = mp.messungen[mp.messungen.length - 1];
    return { refChecked, hatKey: ('referenz' in neu), wert: neu.wert };
  });
  ok(reg.refChecked === false, 'Checkbox im Trocknungs-Kontext nicht vorbelegt');
  ok(reg.hatKey === false && reg.wert === 120, 'reguläre Messung OHNE referenz-Key gespeichert');
  await page.waitForTimeout(200);
  const tro2 = await page.evaluate(() => {
    const el = document.querySelector('#acc_trocknung .acc-body');
    return { firstPills: el.querySelectorAll('.sd-first-pill').length };
  });
  ok(tro2.firstPills === 1, 'Pill nur noch am Messpunkt ohne reguläre Messung (' + tro2.firstPills + ')');

  // Chart mit gemischten Flags rendert ohne Fehler
  await page.evaluate(() => sdSetMeasView('mp_a1', 'chart', 'sd_ana'));
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !!document.getElementById('chart_mp_a1')), 'Diagramm-Canvas rendert (Referenz + regulär gemischt)');
  await page.evaluate(() => sdSetMeasView('mp_a1', 'table', 'sd_ana'));
  await page.waitForTimeout(150);
}

console.log('— C) Foto-Fix: Input im DOM, zwei Fotos hintereinander —');
{
  const fotosVorher = await page.evaluate(() => window.schaeden.find(x => x.id === 'sd_ana').zustandsanalyse.fotos.length);
  for (let i = 1; i <= 2; i++) {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 8000 }),
      page.evaluate(() => sdTriggerPhotoUpload('sd_ana', 'analyse'))
    ]);
    const dom = await page.evaluate(() => ({
      inDom: !!document.querySelector('body > input[type=file]'),
      refGesetzt: !!window._sdPhotoInput,
      capture: (document.querySelector('body > input[type=file]') || { getAttribute: () => null }).getAttribute('capture')
    }));
    if (i === 1) {
      ok(dom.inDom && dom.refGesetzt, 'File-Input hängt im DOM + globale Referenz (GC-Schutz iOS)');
      ok(dom.capture === 'environment', 'capture="environment" gesetzt');
    }
    await chooser.setFiles({ name: 'foto' + i + '.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(TINY_JPG_B64, 'base64') });
    await page.waitForFunction(() => !document.getElementById('photoCommentModal').classList.contains('hidden'), null, { timeout: 8000 });
    await page.evaluate(n => { document.getElementById('pcComment').value = 'Foto ' + n; sdSavePhotoComment(); }, i);
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({
      n: window.schaeden.find(x => x.id === 'sd_ana').zustandsanalyse.fotos.length,
      inputWeg: !document.querySelector('body > input[type=file]'),
      refWeg: !window._sdPhotoInput
    }));
    ok(st.n === fotosVorher + i, 'Foto ' + i + ' übernommen (' + st.n + ' total)');
    if (i === 2) ok(st.inputWeg && st.refWeg, 'Input nach change-Event abgeräumt (DOM + Referenz)');
  }
  const komm = await page.evaluate(() => window.schaeden.find(x => x.id === 'sd_ana').zustandsanalyse.fotos.map(f => f.kommentar).join('|'));
  ok(komm.indexOf('Foto 1') >= 0 && komm.indexOf('Foto 2') >= 0, 'beide Kommentare gespeichert (' + komm + ')');
}

console.log('— D) Vorlage-PDF: Ausgangslage-Tabelle nur mit Referenzen —');
{
  // sd_ana HAT Referenzen → Block erscheint; Trocknungs-Tabelle markiert Referenz-Zeilen
  const [pop1] = await Promise.all([
    page.waitForEvent('popup', { timeout: 8000 }),
    page.evaluate(() => {
      const s = window.schaeden.find(x => x.id === 'sd_ana');
      GemaSchadenPDF.exportPrint(s, { org: { name: 'T AG' }, user: { name: 'P' }, objektName: 'MFH Musterweg 3', objektAdresse: '', phases: ['analyse', 'trocknung'] });
    })
  ]);
  await pop1.waitForLoadState('domcontentloaded').catch(() => {});
  await pop1.waitForTimeout(400);
  const t1 = await pop1.evaluate(() => document.body.textContent || '');
  ok(t1.indexOf('Ausgangslage (Referenz)') >= 0, 'PDF-Analyse-Sektion enthält Ausgangslage-Tabelle');
  ok(t1.indexOf('(Referenz)') >= 0, 'PDF-Trocknungs-Tabelle markiert Referenz-Zeilen');
  ok(t1.indexOf('Decke Bad') >= 0 && t1.indexOf('140 Digits') >= 0, 'Referenzwert im PDF (140 Digits, Decke Bad)');
  await pop1.close();

  // sd_alt hat KEINE Referenzen → kein Ausgangslage-Block, Tabellen unverändert
  const [pop2] = await Promise.all([
    page.waitForEvent('popup', { timeout: 8000 }),
    page.evaluate(() => {
      const s = window.schaeden.find(x => x.id === 'sd_alt');
      GemaSchadenPDF.exportPrint(s, { org: { name: 'T AG' }, user: { name: 'P' }, objektName: 'MFH Musterweg 3', objektAdresse: '', phases: ['analyse', 'trocknung'] });
    })
  ]);
  await pop2.waitForLoadState('domcontentloaded').catch(() => {});
  await pop2.waitForTimeout(400);
  const t2 = await pop2.evaluate(() => document.body.textContent || '');
  ok(t2.indexOf('Ausgangslage (Referenz)') < 0, 'Alt-Bericht: KEIN Ausgangslage-Block im PDF');
  ok(t2.indexOf('(Referenz)') < 0, 'Alt-Bericht: keine Referenz-Marker in den Messwert-Tabellen');
  ok(t2.indexOf('Wand links Küche') >= 0, 'Alt-Messpunkt rendert im PDF wie bisher');
  await pop2.close();
}

ok(errs.length === 0, 'keine pageerrors (' + (errs.join(' | ') || '—') + ')');

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
