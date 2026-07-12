// Offerten-Split-Test für den Wareneingang (if_wareneingang.html):
// Grosshändler-Offerte → Positionen klassifizieren (Regeln: Lager / anderer
// Lieferant) → Bestell-Listen → Beiblatt/Streich-Matching → AB-Verknüpfung
// mit Abdeckungs-Status. Läuft komplett gegen die echte Seite (Playwright,
// localStorage-Seeding, Supabase gemockt — Muster rolematrix_harness).
//
// AUSFÜHREN (benötigt playwright-core + Chromium):
//   CHROME=<chromium-binary> node scripts/wareneingang_offerten_test.mjs
import { chromium } from 'playwright-core';
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0, n = 0;
function check(name, cond) {
  n++;
  if (cond) console.log('  ok ' + n + ' — ' + name);
  else { fails++; console.error('  FAIL ' + n + ' — ' + name); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Seed: Lagerist + Split-Regeln in den Org-Einstellungen
const st = seed(['role_lagerist']);
st.gema_orgs_v1[0].settings = {
  wareneingang: {
    splitRegeln: [
      { id: 'r1', muster: 'Hansgrohe', ziel: 'lieferant', lieferant: 'Muster Sanitär AG' },
      { id: 'r2', muster: 'Pressbogen', ziel: 'lager', lieferant: '' },
      { id: 'r3', muster: 'GEB-77', ziel: 'lieferant', lieferant: 'Direktimport GmbH' }
    ]
  }
};

const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
await wireRoutes(ctx);
await ctx.addInitScript(s => {
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
}, st);

const errors = [];
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/if_wareneingang.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);

// ── 1) Klassifizierung (Regeln aus den Einstellungen) ────────────────
const klass = await page.evaluate(() => {
  const H = window._weHooks;
  const regeln = H.settings().splitRegeln;
  return {
    regelN: regeln.length,
    hg: H.offKlassifiziere({ artikelNr: 'HG-28276000', bezeichnung: 'Hansgrohe Brauseschlauch 160cm' }, regeln),
    lager: H.offKlassifiziere({ artikelNr: 'PB-22', bezeichnung: 'Pressbogen 90° 22mm' }, regeln),
    art: H.offKlassifiziere({ artikelNr: 'GEB-77123', bezeichnung: 'Spülkasten UP' }, regeln),
    rest: H.offKlassifiziere({ artikelNr: 'X-1', bezeichnung: 'Waschtisch Standard' }, regeln),
    caseIns: H.offKlassifiziere({ artikelNr: '', bezeichnung: 'HANSGROHE Kopfbrause' }, regeln)
  };
});
check('3 Regeln aus Org-Einstellungen geladen', klass.regelN === 3);
check('Stichwort in Bezeichnung → anderer Lieferant', klass.hg.bezug === 'lieferant' && klass.hg.bezugLieferant === 'Muster Sanitär AG');
check('Lager-Regel greift', klass.lager.bezug === 'lager');
check('Artikel-Nr-Muster greift', klass.art.bezug === 'lieferant' && klass.art.bezugLieferant === 'Direktimport GmbH');
check('ohne Treffer → Grosshändler', klass.rest.bezug === 'grosshaendler');
check('Matching case-insensitive', klass.caseIns.bezug === 'lieferant');

// ── 2) Offerte über den Wizard anlegen (manuelle Zeilen) ─────────────
await page.evaluate(() => {
  window.weOffNeu();                       // Offerten-Modus
  window.weImpSet('lieferantFirma', 'Sanitas Troesch AG');
  window.weImpManual();                    // → Schritt 3 (Aufteilung)
});
await page.waitForTimeout(200);
const step3 = await page.evaluate(() => {
  const H = window._weHooks;
  // 4 Positionen erfassen (Handler wie im UI)
  window.weImpAddRow(); window.weImpAddRow(); window.weImpAddRow(); window.weImpAddRow();
  window.weImpEdit(0, 'artikelNr', 'HG-28276000'); window.weImpEdit(0, 'bezeichnung', 'Hansgrohe Brauseschlauch');
  window.weImpEdit(1, 'artikelNr', 'PB-22'); window.weImpEdit(1, 'bezeichnung', 'Pressbogen 90°');
  window.weImpEdit(2, 'artikelNr', 'ST-100'); window.weImpEdit(2, 'bezeichnung', 'Waschtisch Basic');
  window.weImpEdit(3, 'artikelNr', 'GEB-77123'); window.weImpEdit(3, 'bezeichnung', 'Spülkasten UP');
  window.weImpSet('offertNr', 'OF-4711');
  const el = document.getElementById('impBody');
  // innerHTML escapt «&» zu «&amp;» — deshalb nur nach «Aufteilung» suchen.
  return { html: (el && el.innerHTML.indexOf('Aufteilung') >= 0), n: H.getImp().positionen.length, modus: H.getImp().modus };
});
check('Wizard im Offerten-Modus mit 4 Zeilen', step3.html && step3.n === 4 && step3.modus === 'offerte');

const saved = await page.evaluate(() => {
  window.weOffSave();
  const H = window._weHooks;
  const offs = H.offerten();
  const o = offs[0];
  return o ? {
    count: offs.length, firma: o.lieferantFirma, nr: o.offertNr,
    bezuege: o.positionen.map(p => p.bezug),
    liefZiel: (o.positionen.find(p => p.artikelNr === 'HG-28276000') || {}).bezugLieferant,
    quelle: (o.positionen.find(p => p.artikelNr === 'HG-28276000') || {}).bezugQuelle
  } : null;
});
check('Offerte gespeichert (Pool weoff:)', !!saved && saved.count === 1 && saved.firma === 'Sanitas Troesch AG' && saved.nr === 'OF-4711');
check('Auto-Klassifizierung beim Review angewendet',
  !!saved && saved.bezuege.join(',') === 'lieferant,lager,grosshaendler,lieferant' && saved.liefZiel === 'Muster Sanitär AG' && saved.quelle === 'regel');

// ── 3) Detail: manueller Bezug-Override + Regeln neu anwenden ────────
const detail = await page.evaluate(() => {
  const H = window._weHooks;
  const o = H.offerten()[0];
  window.weOpenOff(o.id);
  const p3 = o.positionen[2];                       // Waschtisch (grosshaendler)
  window.weOffDetBezug(o.id, p3.id, 'lager');       // manuell → Lager
  window.weOffReapply(o.id);                        // Regeln neu — manuell bleibt
  const o2 = H.offById(o.id);
  return {
    modalOffen: !!document.querySelector('.modal-x'),
    bezug: o2.positionen[2].bezug, quelle: o2.positionen[2].bezugQuelle
  };
});
check('Detail-Modal offen', detail.modalOffen);
check('manueller Override überlebt «Regeln neu anwenden»', detail.bezug === 'lager' && detail.quelle === 'manuell');

// ── 4) Bestell-Listen (Gruppierung) ──────────────────────────────────
// Nach dem manuellen Override (ST-100 → Lager) ist die Grosshändler-Gruppe
// leer und erscheint nicht: erwartet 3 Blöcke (2 Lieferanten + Lager mit 2).
const listen = await page.evaluate(() => {
  const H = window._weHooks;
  const o = H.offById(H.offerten()[0].id);
  return H.offListenText(o).map(b => ({ titel: b.titel, n: b.zeilen.length }));
});
check('Bestell-Listen: Gruppe je Ziel-Lieferant + Lager, leere Gruppen fehlen',
  listen.length === 3
  && listen.some(b => b.titel.indexOf('Muster Sanitär AG') >= 0 && b.n === 1)
  && listen.some(b => b.titel.indexOf('Direktimport GmbH') >= 0 && b.n === 1)
  && listen.some(b => b.titel.indexOf('Ab Lager') >= 0 && b.n === 2)
  && !listen.some(b => b.titel.indexOf('Grossh') >= 0));
const listen2 = await page.evaluate(() => {
  const H = window._weHooks;
  const o = H.offById(H.offerten()[0].id);
  return H.offListenText(o).length;
});
check('leere Gruppen erscheinen nicht', listen2 === 3);

// ── 5) Beiblatt-Zeilen + Streich-Matching (synthetische PDF-Textitems) ─
const pdfMatch = await page.evaluate(() => {
  const H = window._weHooks;
  const o = H.offById(H.offerten()[0].id);
  const zeilen = H.offBeiblattLines(o);
  // Synthetische pdf.js-Items: 3 Zeilen auf Seite 1 (y absteigend)
  const items = [
    { str: 'Pos 1', x: 40, y: 700, w: 30, h: 9, page: 1 },
    { str: 'HG-28276000', x: 80, y: 700, w: 70, h: 9, page: 1 },
    { str: 'Hansgrohe Brauseschlauch', x: 160, y: 700, w: 150, h: 9, page: 1 },
    { str: 'PB-22 Pressbogen 90°', x: 80, y: 680, w: 180, h: 9, page: 1 },
    { str: 'ST-100 Waschtisch Basic', x: 80, y: 660, w: 180, h: 9, page: 1 }
  ];
  const streich = o.positionen.filter(p => p.bezug !== 'grosshaendler');
  const m = H.offMatchZeilen(items, streich);
  return {
    zeilenN: zeilen.length,
    grund: zeilen[0],
    bands: m.map(x => ({ art: x.pos.artikelNr, hit: !!x.band, page: x.band && x.band.page })),
    hgBand: m.find(x => x.pos.artikelNr === 'HG-28276000').band
  };
});
check('Beiblatt: eine Zeile je entfallender Position', pdfMatch.zeilenN === 4);
check('Beiblatt nennt den Grund', /entfällt: Bezug anderweitig \(Muster Sanitär AG\)/.test(pdfMatch.grund));
check('Streich-Matching findet alle 3 lokalisierbaren Zeilen (GEB-77123 ohne Zeile → Beiblatt-Fallback)',
  pdfMatch.bands.filter(b => b.hit).length === 3 && pdfMatch.bands.find(b => b.art === 'GEB-77123').hit === false);
check('Band umfasst die ganze Zeile (x0 < 80, x1 > 300)', pdfMatch.hgBand.x0 <= 40 && pdfMatch.hgBand.x1 >= 300);

// ── 6) AB-Import mit Offerte verknüpfen → Abdeckung ──────────────────
const abdeckung = await page.evaluate(() => {
  const H = window._weHooks;
  const o = H.offById(H.offerten()[0].id);
  // «AB importieren» aus dem Detail → Wizard vorverknüpft
  window.weOffImportAB(o.id);
  const imp = H.getImp();
  const vorverknuepft = imp.offerteId === o.id && imp.modus === 'lieferung';
  // AB des anderen Lieferanten: Hansgrohe-Position
  window.weImpManual();
  window.weImpAddRow();
  window.weImpEdit(0, 'artikelNr', 'HG-28276000');
  window.weImpEdit(0, 'bezeichnung', 'Hansgrohe Brauseschlauch');
  window.weImpEdit(0, 'menge', '2');
  window.weImpSet('lieferantFirma', 'Muster Sanitär AG');
  window.weImpDoImport(false);
  const abd = H.offAbdeckung(H.offById(o.id));
  const byArt = {};
  H.offById(o.id).positionen.forEach(p => { byArt[p.artikelNr] = abd[p.id]; });
  return {
    vorverknuepft,
    liefVerknuepft: H.liefById && (function(){const l=(H.offerten(),null);return true;})(),
    hg: byArt['HG-28276000'], pb: byArt['PB-22'], st: byArt['ST-100'], geb: byArt['GEB-77123'],
    status: H.offStatus(H.offById(o.id))
  };
});
check('«AB importieren» verknüpft den Wizard mit der Offerte', abdeckung.vorverknuepft);
check('Abdeckung: Hansgrohe-Position = bestellt (AB von Muster Sanitär AG)',
  abdeckung.hg.status === 'bestellt' && abdeckung.hg.liefFirma === 'Muster Sanitär AG');
check('Lager-Positionen gelten als gedeckt', abdeckung.pb.status === 'lager' && abdeckung.st.status === 'lager');
check('unbestellte Position bleibt offen', abdeckung.geb.status === 'offen');
check('Offerten-Status = teilweise', abdeckung.status === 'teilweise');

// Wareneingang buchen → Abdeckung wird «eingegangen»
const eingegangen = await page.evaluate(() => {
  const H = window._weHooks;
  const o = H.offById(H.offerten()[0].id);
  const liefs = JSON.parse(localStorage.getItem('gema_we_pool_v1') || '[]').filter(l => l.offerteId === o.id);
  if (!liefs.length) return null;
  window.weComplete(liefs[0].id, liefs[0].positionen[0].id);
  const abd = H.offAbdeckung(H.offById(o.id));
  const p = H.offById(o.id).positionen.find(x => x.artikelNr === 'HG-28276000');
  return { st: abd[p.id].status, chip: liefs[0].offerteId === o.id };
});
check('Lieferung trägt offerteId', !!eingegangen && eingegangen.chip);
check('nach Wareneingang: Offerten-Position = eingegangen', !!eingegangen && eingegangen.st === 'eingegangen');

// ── 7) Manuell «bestellt» + Status komplett ──────────────────────────
const fertig = await page.evaluate(() => {
  const H = window._weHooks;
  const o = H.offById(H.offerten()[0].id);
  const geb = o.positionen.find(p => p.artikelNr === 'GEB-77123');
  window.weOffToggleErledigt(o.id, geb.id);   // manuell als bestellt markieren
  return H.offStatus(H.offById(o.id));
});
check('manuell bestellt → Status «bestellt» (alles gedeckt, noch nicht alles eingegangen)', fertig === 'bestellt');

// ── 8) Einstellungen-UI: Regeln-Editor vorhanden ─────────────────────
await page.evaluate(() => window.weTab('einst'));
await page.waitForTimeout(200);
const einst = await page.evaluate(() => {
  const rows = document.querySelectorAll('#regelRows tr').length;
  const card = document.body.innerHTML.indexOf('Bezugsquellen-Regeln') >= 0;
  return { rows, card };
});
check('Einstellungen zeigen Split-Regeln-Editor mit 3 Regeln', einst.card && einst.rows === 3);

// ── 9) Offerten-Tab rendert Karte mit Chips ──────────────────────────
await page.evaluate(() => window.weTab('offerten'));
await page.waitForTimeout(200);
const tab = await page.evaluate(() => {
  const html = document.getElementById('tab_offerten').innerHTML;
  return { karte: html.indexOf('Sanitas Troesch AG') >= 0 && html.indexOf('OF-4711') >= 0, cnt: document.getElementById('cntOff').textContent };
});
check('Offerten-Tab zeigt Karte + Zähler', tab.karte && tab.cnt === '1');

// ── 10) KI-Fehler-Härtung: HTML-/Nicht-JSON-Antworten → klare Meldung ─
// (Plattform-Fehlerseite VOR der Function, Proxy-/Virenscanner-Blockseite.)
// page.route hat Vorrang vor der Kontext-Route des Harness.
let kiMode = 'html502';
await page.route('**/claude-extract', route => {
  if (kiMode === 'html502') return route.fulfill({ status: 502, contentType: 'text/html', body: '<HTML> <HEAD><TITLE>Bad Gateway</TITLE></HEAD><BODY>Proxy Error</BODY></HTML>' });
  return route.fulfill({ status: 413, contentType: 'text/plain', body: 'Request Entity Too Large' });
});
const msgHtml = await page.evaluate(() => GemaClaude.extractPositions({ text: 'test' }).then(() => 'OK').catch(e => e.message));
check('HTML-Antwort → verständliche Meldung mit HTTP-Status statt «Unexpected token»',
  /HTML-Seite/.test(msgHtml) && /502/.test(msgHtml) && /Firewall|Upload-Limit/.test(msgHtml));
kiMode = 'plain413';
const msg413 = await page.evaluate(() => GemaClaude.extractPositions({ text: 'test' }).then(() => 'OK').catch(e => e.message));
check('413 ohne JSON → «Anfrage zu gross»-Meldung', /zu gross/i.test(msg413) && /413/.test(msg413));
await page.unroute('**/claude-extract');

// ── 11) Client-Cap = Function-Limit (~3.3 MB): zu grosse Datei wird
//        SOFORT abgefangen (kein Server-Roundtrip, keine HTML-Fehlerseite).
await page.evaluate(() => { try { window.weCloseModal(); } catch (e) {} window.weOffNeu(); window.weImpNext(); });
await page.waitForTimeout(200);
await page.setInputFiles('#kiFile', { name: 'gross.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(3400000, 65) });
await page.waitForTimeout(400);
const dlgTxt = await page.evaluate(() => { const d = document.querySelector('.gema-dlg'); return d ? d.textContent : ''; });
check('Datei > 3.3 MB → sofortige Meldung mit Grösse (3.2 MB)', /zu gross/i.test(dlgTxt) && /3\.2 MB/.test(dlgTxt));

check('Keine JS-Fehler auf der Seite', errors.length === 0);
if (errors.length) console.log('  [pageerrors]', errors.slice(0, 5));

await browser.close();
server.close();
console.log(fails ? ('\n' + fails + ' FEHLER') : ('\nAlle ' + n + ' Offerten-Split-Checks gruen'));
process.exit(fails ? 1 : 0);
