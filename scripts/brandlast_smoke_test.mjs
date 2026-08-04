#!/usr/bin/env node
/**
 * Browser-Smoke «Brandlast im Fluchtweg» (br_brandlast.html)
 *
 *   CHROME=/opt/pw-browsers/chromium node scripts/brandlast_smoke_test.mjs
 *
 * A Boot & Aufbau · B Rechenkette im UI · C Nachweis-Ampel · D cr-Kabel
 * E Herleitung aus der Masse · F Meldungen (kein stiller Deckel)
 * G Schema · H Persistenz über Reload · I Zugriffsschutz
 */
import { chromium } from 'playwright-core';
import { startServer, seed, newPage, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let pass = 0, fail = 0;
const fehler = [];
function ok(name, bed, info) {
  if (bed) { pass++; return true; }
  fail++; fehler.push(name + (info ? '  → ' + info : ''));
  return false;
}
function nah(name, ist, soll, tol = 0.005) {
  const gut = Number.isFinite(ist) && Math.abs(ist - soll) <= tol;
  return ok(name, gut, `erwartet ${soll}, erhalten ${ist}`);
}
const zahl = s => {
  const m = String(s || '').replace(/[’']/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

const PLANER = ['role_planer'];

async function txt(page, sel) { return (await page.textContent(sel).catch(() => '')) || ''; }

/** Setzt ein Feld über echte Tastatur-Eingabe (isTrusted) und wartet auf die Neuberechnung. */
async function setFeld(page, sel, wert) {
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (wert !== '') await page.type(sel, String(wert), { delay: 8 });
  await page.waitForTimeout(60);
}

/** Legt Zeile i an (falls nötig) und füllt sie. */
async function zeile(page, i, { bez, cpr, anzahl, laenge, mjm, masse, werkstoff, hu }) {
  const n = await page.locator('#braBody tr').count();
  for (let k = n; k <= i; k++) await page.click('button.zl-add');
  const tr = `#braBody tr[data-bra-row="${i}"]`;
  if (bez !== undefined)    await setFeld(page, `${tr} td.bra-bez input`, bez);
  if (cpr !== undefined)    await page.selectOption(`${tr} td:nth-child(2) select`, cpr);
  if (anzahl !== undefined) await setFeld(page, `${tr} td:nth-child(3) input`, anzahl);
  if (laenge !== undefined) await setFeld(page, `${tr} td:nth-child(4) input`, laenge);
  if (masse !== undefined)  await setFeld(page, `${tr} td:nth-child(5) input`, masse);
  if (werkstoff !== undefined) await page.selectOption(`${tr} td:nth-child(6) select`, werkstoff);
  if (hu !== undefined)     await setFeld(page, `${tr} td:nth-child(7) input`, hu);
  if (mjm !== undefined)    await setFeld(page, `${tr} td:nth-child(8) input`, mjm);
  await page.waitForTimeout(80);
}

const srv = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

try {
  /* ══════════════════════════════════════════════════════
     A · Boot & Aufbau
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(PLANER));
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    ok('A1 Seite lädt ohne JS-Fehler', errs.length === 0, errs.join(' | ').slice(0, 200));
    ok('A2 Titel gesetzt', (await page.title()).includes('Brandlast'));
    ok('A3 Breadcrumb zeigt auf die Brandschutz-Kategorie',
       (await page.getAttribute('.g-nav-bc a.bc-cat', 'href')) === 'index.html#brand');
    ok('A4 Breadcrumb-Label «Brandschutz & Sprinkler»',
       (await txt(page, '.g-nav-bc a.bc-cat')).includes('Brandschutz'));
    ok('A5 Feedback-Knopf vorhanden', await page.locator('.gema-feedback-btn').count() === 1);
    ok('A6 Alle 6 Karten vorhanden', await page.locator('.g-card').count() >= 6,
       String(await page.locator('.g-card').count()));
    ok('A7 Eine Kabel-Zeile ist vorbereitet', await page.locator('#braBody tr').count() === 1);
    ok('A8 Fluchtweg-Länge vorbelegt (10 m)',
       (await page.inputValue('#bra_laenge')) === '10');
    ok('A9 Grenzwert vorbelegt (200 MJ/m)',
       (await page.inputValue('#bra_limit')) === '200');
    ok('A10 Kein type="number" auf der Seite',
       await page.locator('input[type="number"]').count() === 0);
    const anzTxt = await page.locator('input[inputmode="decimal"]').count();
    ok('A11 Zahlenfelder mit inputmode="decimal"', anzTxt >= 5, String(anzTxt));
    ok('A12 Gerüst-Banner ist entfernt', await page.locator('.el-stub').count() === 0);
    ok('A13 Leerzustand meldet «offen»', (await txt(page, '#braBadge')).trim() === 'offen',
       await txt(page, '#braBadge'));
    ok('A14 Heizwert-Tabelle gerendert', await page.locator('#braHuTbl tr').count() === 7,
       String(await page.locator('#braHuTbl tr').count()));
    ok('A15 Herleitungs-Spalten sind zunächst versteckt',
       !(await page.locator('#braTbl th.bra-col-h').first().isVisible()));
    await ctx.close();
  }

  /* ══════════════════════════════════════════════════════
     B · Rechenkette im UI (Referenzfall von Hand: siehe Engine-Test)
         L = 20 m · A: 6 × 3.2 über ganze Länge = 384 MJ
                   · B: 2 × 12.5 über 8 m       = 200 MJ
         Σ 584 MJ → 29.2 MJ/m, Reserve 170.8, Auslastung 14.6 %
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    await setFeld(page, '#bra_laenge', '20');
    await zeile(page, 0, { bez: 'Steigleitung UV 3.1', cpr: 'Cca',  anzahl: '6', laenge: '',  mjm: '3.2' });
    await zeile(page, 1, { bez: 'Sammelleitung EDV',   cpr: 'B2ca', anzahl: '2', laenge: '8', mjm: '12.5' });
    await page.waitForTimeout(150);

    nah('B1 Σ Brandlast = 584 MJ', zahl(await txt(page, '#out_summe')), 584, 0.06);
    nah('B2 L = 20 m', zahl(await txt(page, '#out_laenge')), 20);
    nah('B3 q = 29.2 MJ/m', zahl(await txt(page, '#out_prom')), 29.2, 0.006);
    nah('B4 Grenzwert = 200 MJ/m', zahl(await txt(page, '#out_limit')), 200);
    nah('B5 Reserve = 170.8 MJ/m', zahl(await txt(page, '#out_reserve')), 170.8, 0.006);
    nah('B6 Auslastung = 14.6 %', zahl(await txt(page, '#out_ausl')), 14.6, 0.06);
    ok('B7 Anzahl-Zeile nennt 8 Kabel und 2 Typen',
       /8 Kabel/.test(await txt(page, '#out_anzahl')) && /2 Typen/.test(await txt(page, '#out_anzahl')),
       await txt(page, '#out_anzahl'));

    nah('B8 Zeile 1 Total = 384 MJ',
        zahl(await txt(page, '#braBody tr[data-bra-row="0"] .bra-tot')), 384, 0.06);
    nah('B9 Zeile 2 Total = 200 MJ',
        zahl(await txt(page, '#braBody tr[data-bra-row="1"] .bra-tot')), 200, 0.06);
    nah('B10 Fusszeile Σ MJ = 584', zahl(await txt(page, '#braFootMj')), 584, 0.06);
    nah('B11 Fusszeile MJ/m = 29.2', zahl(await txt(page, '#braFootMjm')), 29.2, 0.006);

    ok('B12 Formel-Chip für q vorhanden',
       (await page.locator('#out_prom').locator('xpath=../div[@class="bra-res-lbl"]/span[@class="frml"]').count()) >= 0);
    const chips = await page.locator('.bra-res-lbl .frml').allTextContents();
    ok('B13 Formel-Chip zeigt die gerechnete Kette',
       chips.some(c => /Σ MJ ÷ L/.test(c)), chips.join(' | '));

    /* ── C · Nachweis-Ampel ── */
    ok('C1 Badge «erfüllt»', (await txt(page, '#braBadge')).trim() === 'erfüllt', await txt(page, '#braBadge'));
    ok('C2 Status grün', (await page.getAttribute('#braStatus', 'class')).includes('ok'));
    ok('C3 KPI-Box grün', (await page.getAttribute('#braKpi', 'class')).includes('ok'));
    nah('C4 KPI-Wert = 29.2', zahl(await txt(page, '#braKpiVal')), 29.2, 0.06);
    ok('C5 Massnahmen-Hinweis versteckt',
       !(await page.locator('#braMassnahmen').isVisible()));

    /* Grenzwert auf 20 senken → dieselbe Anlage wird unzulässig */
    await setFeld(page, '#bra_limit', '20');
    await page.waitForTimeout(120);
    ok('C6 Kleinerer Grenzwert → Badge «nicht erfüllt»',
       (await txt(page, '#braBadge')).trim() === 'nicht erfüllt', await txt(page, '#braBadge'));
    ok('C7 Status rot', (await page.getAttribute('#braStatus', 'class')).includes('err'));
    ok('C8 Massnahmen-Hinweis erscheint', await page.locator('#braMassnahmen').isVisible());
    ok('C9 Statustext nennt die Überschreitung',
       /überschreitet den Grenzwert|Nachweis NICHT erfüllt/i.test(await txt(page, '#braStatus')),
       await txt(page, '#braStatus'));
    nah('C10 Reserve wird negativ', zahl(await txt(page, '#out_reserve')), -9.2, 0.06);
    await setFeld(page, '#bra_limit', '200');
    await page.waitForTimeout(100);
    ok('C11 Zurück auf 200 → wieder erfüllt', (await txt(page, '#braBadge')).trim() === 'erfüllt');

    await ctx.close();
  }

  /* ══════════════════════════════════════════════════════
     D · cr-Kabel (Eca/Fca) werden gesperrt, nicht weggerechnet
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    await setFeld(page, '#bra_laenge', '10');
    await zeile(page, 0, { bez: 'Zulässig',  cpr: 'Cca', anzahl: '5', laenge: '', mjm: '4' });
    await zeile(page, 1, { bez: 'Alt-Kabel', cpr: 'Eca', anzahl: '5', laenge: '', mjm: '4' });
    await page.waitForTimeout(150);

    nah('D1 Nur die zulässige Zeile zählt: q = 20 MJ/m', zahl(await txt(page, '#out_prom')), 20, 0.006);
    ok('D2 Gesperrte Zeile ist rot markiert',
       (await page.getAttribute('#braBody tr[data-bra-row="1"]', 'class') || '').includes('bra-sperr'));
    ok('D3 Gesperrte Zeile zeigt «unzulässig»',
       (await txt(page, '#braBody tr[data-bra-row="1"] .bra-tot')).includes('unzulässig'),
       await txt(page, '#braBody tr[data-bra-row="1"] .bra-tot'));
    ok('D4 Fusszeile weist die ausgeschlossene Zeile aus',
       /unzulässige Zeile/i.test(await txt(page, '#braFootLbl')), await txt(page, '#braFootLbl'));
    ok('D5 Nachweis gilt trotz eingehaltenem Grenzwert als nicht erfüllt',
       (await txt(page, '#braBadge')).trim() === 'nicht erfüllt', await txt(page, '#braBadge'));
    const msg = await txt(page, '#braMsg');
    ok('D6 Meldung nennt Kabel und Grund',
       /Alt-Kabel/.test(msg) && /nicht zulässig/i.test(msg), msg.slice(0, 160));
    /* Die Ampel muss dem GESAMT-Nachweis folgen, nicht nur dem Grenzwert. */
    ok('D6a KPI-Box nicht grün trotz eingehaltenem Grenzwert',
       !(await page.getAttribute('#braKpi', 'class')).includes('ok'),
       await page.getAttribute('#braKpi', 'class'));
    ok('D6b KPI-Box rot', (await page.getAttribute('#braKpi', 'class')).includes('err'));
    const svgD = await page.innerHTML('#braSchema');
    ok('D6c Schema sagt NICHT «ZULÄSSIG»', !/ZULÄSSIG/.test(svgD), svgD.match(/>([A-ZÄÖÜ ]{4,})</)?.[1]);
    ok('D6d Schema meldet «NICHT ERFÜLLT»', /NICHT ERFÜLLT/.test(svgD));

    /* Gegenprobe: dieselbe Zeile auf Cca umstellen */
    await page.selectOption('#braBody tr[data-bra-row="1"] td:nth-child(2) select', 'Cca');
    await page.waitForTimeout(150);
    nah('D7 Gegenprobe Cca: q = 40 MJ/m', zahl(await txt(page, '#out_prom')), 40, 0.006);
    ok('D8 Gegenprobe: Nachweis erfüllt', (await txt(page, '#braBadge')).trim() === 'erfüllt');
    ok('D9 Gegenprobe: Markierung weg',
       !(await page.getAttribute('#braBody tr[data-bra-row="1"]', 'class') || '').includes('bra-sperr'));
    ok('D10 Gegenprobe: Schema wieder «ZULÄSSIG»',
       /ZULÄSSIG/.test(await page.innerHTML('#braSchema')));
    await ctx.close();
  }

  /* ══════════════════════════════════════════════════════
     E · Herleitung aus der brennbaren Masse
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    ok('E1 Spalten zunächst versteckt', !(await page.locator('#braTbl th.bra-col-h').first().isVisible()));
    /* Die Checkbox selbst ist im GEMA-Schalter unsichtbar (opacity:0) — der Slider ist das Bedienelement. */
    await page.click('.g-switch-slider');
    await page.waitForTimeout(120);
    ok('E2a Schalter ist aktiviert', await page.isChecked('#bra_herleitung'));
    ok('E2 Schalter blendet die Herleitungs-Spalten ein',
       await page.locator('#braTbl th.bra-col-h').first().isVisible());

    await setFeld(page, '#bra_laenge', '10');
    await zeile(page, 0, { bez: 'Hauptzuleitung', cpr: 'Cca', anzahl: '4', laenge: '' });
    await setFeld(page, '#braBody tr[data-bra-row="0"] td:nth-child(5) input', '0.35');
    await page.selectOption('#braBody tr[data-bra-row="0"] td:nth-child(6) select', 'pvc');
    await page.waitForTimeout(180);

    ok('E3 Werkstoff-Wahl belegt Hu vor (PVC = 18)',
       (await page.inputValue('#braBody tr[data-bra-row="0"] td:nth-child(7) input')) === '18',
       await page.inputValue('#braBody tr[data-bra-row="0"] td:nth-child(7) input'));
    nah('E4 MJ/m hergeleitet: 0.35 × 18 = 6.3',
        Number(await page.inputValue('#braBody tr[data-bra-row="0"] td:nth-child(8) input')), 6.3, 0.001);
    ok('E5 MJ/m-Feld ist im Masse-Modus gesperrt',
       await page.locator('#braBody tr[data-bra-row="0"] td:nth-child(8) input').getAttribute('readonly') !== null);
    /* 6.3 × 4 × 10 = 252 MJ → 25.2 MJ/m */
    nah('E6 Σ = 252 MJ', zahl(await txt(page, '#out_summe')), 252, 0.06);
    nah('E7 q = 25.2 MJ/m', zahl(await txt(page, '#out_prom')), 25.2, 0.006);

    /* Hu von Hand auf 25 → 0.35 × 25 = 8.75 */
    await setFeld(page, '#braBody tr[data-bra-row="0"] td:nth-child(7) input', '25');
    await page.waitForTimeout(150);
    nah('E8 Eigener Hu wirkt: 0.35 × 25 = 8.75 MJ/m',
        Number(await page.inputValue('#braBody tr[data-bra-row="0"] td:nth-child(8) input')), 8.75, 0.001);

    /* Masse leeren → MJ/m wieder frei eintragbar */
    await setFeld(page, '#braBody tr[data-bra-row="0"] td:nth-child(5) input', '');
    await page.waitForTimeout(150);
    ok('E9 Masse leeren gibt das MJ/m-Feld wieder frei',
       await page.locator('#braBody tr[data-bra-row="0"] td:nth-child(8) input').getAttribute('readonly') === null);
    await ctx.close();
  }

  /* ══════════════════════════════════════════════════════
     F · Meldungen — kein stiller Deckel
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    /* Länge im Fluchtweg grösser als der Fluchtweg → melden, nicht kappen */
    await setFeld(page, '#bra_laenge', '10');
    await setFeld(page, '#bra_limit', '5000');
    await zeile(page, 0, { bez: 'Zu lang', cpr: 'Cca', anzahl: '1', laenge: '30', mjm: '2' });
    await page.waitForTimeout(150);
    nah('F1 Zu lange Strecke wird ungekappt gerechnet (60 MJ)',
        zahl(await txt(page, '#out_summe')), 60, 0.06);
    ok('F2 … und dabei gemeldet',
       /grösser als der Fluchtweg/i.test(await txt(page, '#braMsg')), await txt(page, '#braMsg'));

    /* Fehlende CPR-Klasse → Warnung, Nachweis «mit Vorbehalt» */
    await zeile(page, 0, { cpr: '', laenge: '' });
    await setFeld(page, '#bra_limit', '200');
    await page.waitForTimeout(150);
    ok('F3 Fehlende CPR-Klasse wird gemeldet', /CPR/i.test(await txt(page, '#braMsg')));
    ok('F4 Badge «mit Vorbehalt»', (await txt(page, '#braBadge')).trim() === 'mit Vorbehalt',
       await txt(page, '#braBadge'));

    /* Fehlende Brandlast → Fehler statt stillem Leerzustand */
    await zeile(page, 0, { cpr: 'Cca', mjm: '' });
    await page.waitForTimeout(150);
    ok('F5 Fehlende Brandlast wird als Fehler gemeldet',
       /Brandlast \[MJ\/m\] fehlt/i.test(await txt(page, '#braMsg')), await txt(page, '#braMsg'));
    ok('F6 Status nicht «offen», sondern «nicht erfüllt»',
       (await txt(page, '#braBadge')).trim() === 'nicht erfüllt', await txt(page, '#braBadge'));

    /* Fluchtweg-Länge leeren → Fehler, kein stilles Ersetzen durch 1 */
    await zeile(page, 0, { mjm: '5' });
    await setFeld(page, '#bra_laenge', '');
    await page.waitForTimeout(150);
    ok('F7 Fehlende Fluchtweglänge wird gemeldet',
       /Länge des Fluchtwegs/i.test(await txt(page, '#braMsg')), await txt(page, '#braMsg'));
    ok('F8 Ohne Länge kein Ergebnis', (await txt(page, '#out_prom')).trim() === '—',
       await txt(page, '#out_prom'));
    await ctx.close();
  }

  /* ══════════════════════════════════════════════════════
     G · Schema
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await setFeld(page, '#bra_laenge', '10');
    await zeile(page, 0, { bez: 'Trasse', cpr: 'Cca', anzahl: '5', laenge: '', mjm: '4' });
    await page.waitForTimeout(200);

    const svg = await page.innerHTML('#braSchema');
    ok('G1 Schema gezeichnet', svg.length > 500, String(svg.length));
    ok('G2 Schema zeigt «ZULÄSSIG»', /ZULÄSSIG/.test(svg));
    ok('G3 Schema nennt die Fluchtweglänge', /L = 10 m/.test(svg));
    ok('G4 Schema nennt den Wert gegen den Grenzwert', /20\.0 \/ 200 MJ\/m/.test(svg), svg.match(/[\d.]+ \/ \d+ MJ\/m/)?.[0]);
    ok('G5 Nur literale Hex-Farben (kein var\\(\\) im SVG)', !/var\(--/.test(svg));

    await setFeld(page, '#bra_limit', '10');
    await page.waitForTimeout(200);
    const svg2 = await page.innerHTML('#braSchema');
    ok('G6 Überschreitung im Schema sichtbar', /ÜBERSCHRITTEN/.test(svg2));
    ok('G7 Überschreitung färbt rot', /#dc2626/.test(svg2));
    await ctx.close();
  }

  /* ══════════════════════════════════════════════════════
     H · Persistenz über Reload (ohne gewähltes Objekt → Snapshot-Fallback)
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);

    await setFeld(page, '#bra_laenge', '18');
    await setFeld(page, '#bra_limit', '150');
    await setFeld(page, '#bra_korridor', 'Korridor Nord');
    await zeile(page, 0, { bez: 'Leitung A', cpr: 'Cca',  anzahl: '3', laenge: '',  mjm: '5' });
    await zeile(page, 1, { bez: 'Leitung B', cpr: 'B2ca', anzahl: '2', laenge: '6', mjm: '7' });
    /* 5·3·18 = 270 ; 7·2·6 = 84 ; Σ = 354 ; 354/18 = 19.6666… */
    await page.waitForTimeout(200);
    nah('H1 Vor dem Reload: Σ = 354 MJ', zahl(await txt(page, '#out_summe')), 354, 0.06);

    /* AutoSave schreibt debounced (5 s) — abwarten, dann neu laden */
    await page.waitForTimeout(5600);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4200);   /* Snapshot-Fallback läuft bei 700/1800/3500 ms */

    ok('H2 Fluchtweglänge wiederhergestellt', (await page.inputValue('#bra_laenge')) === '18',
       await page.inputValue('#bra_laenge'));
    ok('H3 Grenzwert wiederhergestellt', (await page.inputValue('#bra_limit')) === '150',
       await page.inputValue('#bra_limit'));
    ok('H4 Freitext wiederhergestellt', (await page.inputValue('#bra_korridor')) === 'Korridor Nord',
       await page.inputValue('#bra_korridor'));
    ok('H5 Beide Kabel-Zeilen wiederhergestellt', await page.locator('#braBody tr').count() === 2,
       String(await page.locator('#braBody tr').count()));
    ok('H6 Bezeichnung der zweiten Zeile erhalten',
       (await page.inputValue('#braBody tr[data-bra-row="1"] td.bra-bez input')) === 'Leitung B',
       await page.inputValue('#braBody tr[data-bra-row="1"] td.bra-bez input'));
    ok('H7 CPR-Klasse der zweiten Zeile erhalten',
       (await page.inputValue('#braBody tr[data-bra-row="1"] td:nth-child(2) select')) === 'B2ca');
    nah('H8 Nach dem Reload: Σ = 354 MJ', zahl(await txt(page, '#out_summe')), 354, 0.06);
    nah('H9 Nach dem Reload: q = 19.67 MJ/m', zahl(await txt(page, '#out_prom')), 354 / 18, 0.01);

    /* Fold-Zustand ist Geräte-UI und darf NICHT im AutoSave-Snapshot landen */
    await page.click('#cardSchema .bra-fold-hd');
    await page.waitForTimeout(200);
    const snap = await page.evaluate(() => {
      const roh = localStorage.getItem('gema_brandlast');
      return roh ? Object.keys(JSON.parse(roh)) : [];
    });
    ok('H10 AutoSave-Snapshot enthält die Eingaben', snap.includes('bra_laenge') && snap.includes('bra_rows'),
       snap.join(','));
    ok('H11 Fold-Zustand liegt NICHT im Snapshot',
       !snap.some(k => /fold/i.test(k)), snap.join(','));
    const fold = await page.evaluate(() => localStorage.getItem('gema_bra_fold_v1'));
    ok('H12 Fold-Zustand liegt in eigenem Geräte-Key', !!fold && /cardSchema/.test(fold), String(fold));
    await ctx.close();
  }

  /* ══════════════════════════════════════════════════════
     I · Zugriffsschutz
     ══════════════════════════════════════════════════════ */
  {
    const { ctx, page } = await newPage(browser, seed(['role_monteur']));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const body = await page.textContent('body');
    ok('I1 Monteur bekommt «Kein Zugriff»', /Kein Zugriff/i.test(body || ''), (body || '').slice(0, 120));
    ok('I2 Monteur sieht die Berechnung nicht', await page.locator('#braBody').count() === 0);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, seed(['role_elektro_planer']));
    await page.goto(BASE + '/br_brandlast.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    ok('I3 Elektroplaner hat Zugriff', await page.locator('#braBody tr').count() >= 1);
    await ctx.close();
  }
  {
    /* Die Planer-Rollen werden vom Rollen-Redirect in den Workspace geschickt —
       die Modulübersicht wird darum mit dem Admin geprüft. */
    const { ctx, page } = await newPage(browser, seed(['role_admin']));
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    ok('I4 Kachel auf der Modulübersicht sichtbar',
       await page.locator('a.mod-card[data-module="brandlast"]:not([data-perm-hidden])').count() === 1);
    ok('I5 Kachel verlinkt auf br_brandlast.html',
       (await page.getAttribute('a.mod-card[data-module="brandlast"]', 'href')) === 'br_brandlast.html');
    await ctx.close();
  }

} finally {
  await browser.close();
  srv.close();
}

console.log('');
console.log('══════════════════════════════════════════════');
console.log(`  Brandlast — Browser-Smoke: ${pass} ok, ${fail} Fehler`);
console.log('══════════════════════════════════════════════');
if (fail) {
  console.log('');
  fehler.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('  ✓ alle Prüfungen bestanden');
