#!/usr/bin/env node
/* Drift-Guard — Feedback 05.09.2026, Modul sb_warmwasser (29 Punkte).
 *
 * Etappe 1 — Tab ④ Speicher & Leistung:
 *   #8  Verlustfaktor nur 2 Nachkommastellen · fsto-Bauarten neu benannt
 *       (WE mit innenliegendem Register 1.25 · WE mit externem Tauscher 1.1 ·
 *        WE mit externem Tauscher ohne Misch- und Kaltzone 1.0)
 *   #3  Misch-/Reserve-Prozent im Speicherschema muss zum gewaehlten fsto passen
 *
 * Etappe 2 — Tab ③ Feinplanung, 3.4 Ausstosswaermeverluste:
 *   #10 Ø-Personenbelegung + Verlust je Entnahme + Verlust je Nutzungseinheit
 *   #11 Zeit-Select schneidet «Standard (10 s)» nicht mehr ab
 *   #12 Beschriftung + Hinweis nebeneinander, kleines Auswahlfeld, Schnellwahl 10/15 s
 *
 * Etappe 3 — Tab ③ Feinplanung, 3.3 Warmgehaltene Leitungen:
 *   #14 kWh/d je Zeile in der Farbe ihrer Leitungsart (Kanon 2.2)
 *   #17 ø-Auswahl folgt dem Material (PEX 12/16/20/25/32 · CNS 15…108),
 *       gespeicherter ø ausserhalb der Reihe bleibt als «(bisherig)» waehlbar
 *
 * Ausfuehren:  CHROME=<chromium> node scripts/feedback_20260905_warmwasser_test.mjs
 */
import { readFileSync } from 'node:fs';
import { startServer, seed, newPage, ROOT, BASE } from './rolematrix_harness.mjs';

let ok_ = 0, bad = 0;
function ok(cond, name, extra) {
  if (cond) { ok_++; console.log('  ok   ' + name); }
  else { bad++; console.log('  FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function sec(t) { console.log('\n── ' + t); }

const WW = readFileSync(ROOT + '/sb_warmwasser.html', 'utf8');

// ─────────────────────────────────────────────────────────────── statisch
sec('A · Markup & Quelltext');

// #8 — die drei Bauarten mit den vom Kunden vorgegebenen Faktoren
ok(/data-fsto="1\.25"[^>]*data-bauart="register_innen"/.test(WW),
  '#8: Kachel 1 = register_innen mit fsto 1.25');
ok(/data-fsto="1\.1"[^>]*data-bauart="tauscher_extern"/.test(WW),
  '#8: Kachel 2 = tauscher_extern mit fsto 1.1');
ok(/data-fsto="1"[^>]*data-bauart="tauscher_extern_ohne"/.test(WW),
  '#8: Kachel 3 = tauscher_extern_ohne mit fsto 1.0');
ok(WW.includes('WE mit innenliegendem Register'),  '#8: Beschriftung «WE mit innenliegendem Register»');
ok(WW.includes('WE mit externem Tauscher</div>')
   || /WE mit externem Tauscher<\/div>/.test(WW),  '#8: Beschriftung «WE mit externem Tauscher»');
ok(WW.includes('WE mit externem Tauscher ohne Misch- und Kaltzone'),
  '#8: Beschriftung «WE mit externem Tauscher ohne Misch- und Kaltzone»');
ok(!/data-fsto="1\.5"/.test(WW), '#8: keine 1.5-Kachel mehr (alte Bauart «Liegend» abgeloest)');

// #8 — der Default-Merker zeigt auf eine EXISTIERENDE Bauart
{
  const m = WW.match(/id="ww_fsto_bauart"[^>]*value="([^"]*)"/);
  ok(!!m && WW.includes('data-bauart="' + (m ? m[1] : '') + '"'),
    '#8: hidden ww_fsto_bauart-Default entspricht einer Kachel', m ? m[1] : null);
}

// #8 — Verlustfaktor auf 2 Nachkommastellen (Rundung + beide Vorschau-Chips)
ok(/Math\.round\(v\*100\)\/100/.test(WW),                '#8: wwVfSet rundet auf 2 Nachkommastellen');
ok(!/Math\.round\(v\*1000\)\/1000/.test(WW),             '#8: keine 3-Stellen-Rundung mehr');
ok(/setTxt\('ww_vfGrob'[^)]*wwFmt\(1\+res\.vz\/100,2\)/.test(WW),   '#8: Chip Grobauslegung mit 2 NK');
ok(/setTxt\('ww_vfFein'[^)]*wwFmt\(1\+res\.vzFein\/100,2\)/.test(WW), '#8: Chip Feinplanung mit 2 NK');

// #3 — Schema kennt den fsto und rechnet die Misch-Zone gegen die Bereitschaft
ok(/fsto:wwNum\('ww_fsto'\)/.test(WW),        '#3: fsto wandert in den _wwSpSchemaDraw-Payload');
ok(/pctBasis:d\.vcont/.test(WW),              '#3: Misch-Zone traegt pctBasis = Bereitschaftsvolumen');
ok(/m\.pctBasis>0\)\?m\.pctBasis:Z\.vtot/.test(WW),
  '#3: Render-Loop nimmt pctBasis, faellt sonst auf das Total zurueck');
ok(/sub:'fsto-Zuschlag '/.test(WW),           '#3: Unterzeile behaelt den Begriff «fsto-Zuschlag»');
ok(/l Bereitschaft'/.test(WW),                '#3: Unterzeile nennt die Bezugsgroesse');

// nur literale Hex-Farben in den neuen Kacheln (GemaPDF-Regel)
{
  const blk = WW.slice(WW.indexOf('id="wwFstoTiles"'), WW.indexOf('id="wwFstoTiles"') + 6000);
  ok(!/var\(--/.test(blk.slice(0, blk.indexOf('</div>\n        </div>') + 40) || blk),
    'Kachel-SVG ohne var()-Farben (literale Hex)');
}

// ─────────────────────────────────────────────────────────────── Browser
sec('B · Browser');
const srv = await startServer();
let browser = null;
try {
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  const { page } = await newPage(browser, seed(['role_planer']));
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/sb_warmwasser.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => typeof wwRecalc === 'function' && typeof window._wwSpSchemaDraw === 'function',
    null, { timeout: 12000 });

  // Bedarf seeden (50 P Mehrfamilienhaus) — ohne Bedarf zeichnet Tab ④ nur den Hinweis
  await page.evaluate(() => { wwState.fein.push({ ne: 3, n: '50', profil: 'wohnbau' }); wwRenderTables(); wwRecalc(); });
  await page.evaluate(() => { const e = document.querySelector('[data-tab="wt4"]'); if (e) e.click(); });
  await page.waitForTimeout(400);

  // #8 — drei Kacheln, korrekte Faktoren, Klick setzt Wert UND Merker
  const tiles = await page.$$eval('#wwFstoTiles .ww-fsto-tile',
    els => els.map(e => ({ f: e.dataset.fsto, b: e.dataset.bauart, t: (e.querySelector('.t') || {}).textContent })));
  ok(tiles.length === 3, '#8: genau drei Bauart-Kacheln', tiles.length);
  ok(tiles.map(t => t.f).join('|') === '1.25|1.1|1', '#8: Faktoren 1.25 / 1.1 / 1.0', tiles.map(t => t.f));

  await page.evaluate(() => { const e = document.querySelector('[data-bauart="tauscher_extern"]'); if (e) e.click(); });
  await page.waitForTimeout(300);
  const nach = await page.evaluate(() => ({
    v: document.getElementById('ww_fsto').value,
    b: document.getElementById('ww_fsto_bauart').value,
    akt: [...document.querySelectorAll('#wwFstoTiles .ww-fsto-tile.active')].map(e => e.dataset.bauart)
  }));
  ok(nach.v === '1.1',                    '#8: Klick setzt fsto 1.1', nach.v);
  ok(nach.b === 'tauscher_extern',        '#8: Klick setzt den Bauart-Merker', nach.b);
  ok(nach.akt.join() === 'tauscher_extern', '#8: genau die geklickte Kachel ist aktiv', nach.akt);

  // Bestandsschutz: ein Alt-Wert 1.5 bleibt stehen und markiert KEINE Kachel
  await page.evaluate(() => {
    const f = document.getElementById('ww_fsto'), b = document.getElementById('ww_fsto_bauart');
    b.value = ''; f.value = '1.5';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const alt = await page.evaluate(() => ({
    v: document.getElementById('ww_fsto').value,
    n: document.querySelectorAll('#wwFstoTiles .ww-fsto-tile.active').length
  }));
  ok(alt.v === '1.5', '#8 Bestandsschutz: Alt-Wert 1.5 bleibt erhalten', alt.v);
  ok(alt.n === 0,     '#8 Bestandsschutz: Alt-Wert markiert keine Kachel', alt.n);

  // #3 — Misch-Prozent = fsto-Zuschlag auf die Bereitschaft
  await page.evaluate(() => { const e = document.querySelector('[data-bauart="register_innen"]'); if (e) e.click(); });
  await page.waitForTimeout(300);
  const schema = await page.evaluate(() => {
    const svg = document.querySelector('#wwSpSchemaWrap svg');
    const t = svg ? [...svg.querySelectorAll('text')].map(e => e.textContent) : [];
    return { txt: t.join(' § ') };
  });
  const mPct = schema.txt.match(/Liter · \+(\d+) %/);
  ok(!!mPct && Number(mPct[1]) === 25,
    '#3: Misch-Zone zeigt «+25 %» (fsto 1.25 auf die Bereitschaft)', mPct ? mPct[1] : schema.txt.slice(0, 300));
  ok(/fsto-Zuschlag 1\.25 auf .* l Bereitschaft/.test(schema.txt),
    '#3: Unterzeile nennt Faktor und Bezugsgroesse', schema.txt.match(/fsto-Zuschlag[^§]*/) || null);
  // die Zonen IM Behaelter bleiben auf das Total bezogen (Summe 100 %)
  ok(!/Liter · \+\d+ %.*Liter · \+\d+ %/.test(schema.txt),
    '#3: nur die Misch-Zone traegt das «+» (Spitze/Steuer bleiben auf das Total bezogen)');

  // ── Etappe 2 — Tab ③ Feinplanung, 3.4 Ausstosswaermeverluste ───────────
  await page.evaluate(() => {
    wwState.whg = [{ whg: '5', anf: '65' }, { whg: '5', anf: '85' }, { whg: '3', anf: '105' }];
    wwRenderTables(); wwRecalc();
  });
  await page.evaluate(() => { const e = document.querySelector('[data-tab="wt3"]'); if (e) e.click(); });
  await page.waitForTimeout(300);

  // #10 — drei zusaetzliche Spalten in der Wohnungen-Tabelle
  const sp = await page.evaluate(() => {
    const tb = document.getElementById('wwAusstossWohnBody');
    const tab = tb ? tb.closest('table') : null;
    const kopf = tab ? [...tab.querySelectorAll('thead th')].map(e => e.textContent.trim()) : [];
    const z1 = tb ? [...tb.querySelectorAll('tr')][0] : null;
    const zellen = z1 ? [...z1.children].map(e => e.textContent.trim()) : [];
    const tot = tb ? [...tb.querySelectorAll('tr')].pop() : null;
    return { kopf, zellen, totN: tot ? tot.children.length : 0 };
  });
  ok(sp.kopf.length === 8, '#10: Wohnungen-Tabelle hat 8 Spalten', sp.kopf);
  ok(sp.kopf[1] === 'Ø Personenbelegung',
    '#10: Spalte «Ø Personenbelegung» steht zwischen Wohnungstyp und Anz. Whg', sp.kopf[1]);
  ok(sp.kopf[5] === 'Wärmeverluste pro Entnahme',
    '#10: Spalte «Wärmeverluste pro Entnahme» nach «Zeit [s]»', sp.kopf[5]);
  ok(sp.kopf[6] === 'Wärmeverluste pro Nutzungseinheit',
    '#10: Spalte «Wärmeverluste pro Nutzungseinheit» direkt vor kWh/d', sp.kopf[6]);
  ok(sp.totN === 8, '#10: Total-Fusszeile hat dieselbe Spaltenzahl', sp.totN);
  const bel = parseFloat(String(sp.zellen[1]).replace(',', '.'));
  ok(bel > 1 && bel < 6, '#10: Ø-Belegung ist ein plausibler Wert', sp.zellen[1]);
  const perE = parseFloat(String(sp.zellen[5]).replace(',', '.'));
  const perNE = parseFloat(String(sp.zellen[6]).replace(',', '.'));
  const entn = parseFloat(String(sp.zellen[3]).replace(',', '.'));
  ok(perE > 0 && perE < 1, '#10: Verlust je Entnahme ist ein kWh-Wert < 1', sp.zellen[5]);
  ok(Math.abs(perNE - entn * perE) < 0.02,
    '#10: Verlust je Nutzungseinheit = Entnahmen × Verlust je Entnahme', [entn, perE, perNE]);
  const nw = parseFloat(String(sp.zellen[2]).replace(',', '.'));
  const tag = parseFloat(String(sp.zellen[7]).replace(',', '.'));
  ok(Math.abs(tag - perNE * nw) < 0.05,
    '#10: kWh/d bleibt Verlust je Nutzungseinheit × Anzahl (Rechenkette unveraendert)', [perNE, nw, tag]);

  // #11 — das Zeit-Select wird nicht mehr abgeschnitten
  const zt = await page.evaluate(() => {
    const s = document.querySelector('#wwAusstossWohnBody select.ww-zeit');
    if (!s) return null;
    const cs = getComputedStyle(s);
    return { w: s.getBoundingClientRect().width, over: s.scrollWidth - s.clientWidth,
             font: cs.fontSize, txt: s.options[0].textContent };
  });
  ok(!!zt && zt.over === 0, '#11: Zeit-Select schneidet nichts ab (kein Overflow)', zt);
  ok(!!zt && zt.font === '16px',
    '#11: gemessen gegen die global erzwungenen 16px, nicht gegen die deklarierten 12.5px', zt && zt.font);
  ok(!!zt && zt.w >= 118, '#11: Breite traegt «Standard (10 s)»', zt && zt.w);

  // #12 — Beschriftung + Hinweis nebeneinander, Auswahlfeld klein, Schnellwahl
  const kf = await page.evaluate(() => {
    const sel = document.getElementById('ww_zeitWohn');
    const fg = sel ? sel.closest('.fg') : null;
    const lbl = fg ? fg.querySelector('.fg-lbl') : null;
    const chips = [...document.querySelectorAll('.ww-zeitwahl .ww-quick')];
    return {
      lblRow: !!(lbl && lbl.classList.contains('fg-lbl-row')),
      lblH: lbl ? Math.round(lbl.getBoundingClientRect().height) : 0,
      lblW: lbl ? Math.round(lbl.getBoundingClientRect().width) : 0,
      selW: sel ? Math.round(sel.getBoundingClientRect().width) : 0,
      selKurz: !!(sel && sel.classList.contains('ww-sel-kurz')),
      chips: chips.map(c => c.getAttribute('data-sec') + ':' + (c.classList.contains('active') ? 'a' : '-')),
      val: sel ? sel.value : null
    };
  });
  ok(kf.lblRow && kf.chips.length === 2, '#12: Schnellwahl 10 s / 15 s neben dem Auswahlfeld', kf.chips);
  ok(kf.lblH > 0 && kf.lblH <= 26,
    '#12: Beschriftung + Hinweis auf EINER Zeile (nicht mehr Wort fuer Wort umgebrochen)', kf.lblH);
  ok(kf.lblW > 400, '#12: die Beschriftungs-Spalte ist nicht mehr auf ~150px gequetscht', kf.lblW);
  ok(kf.selKurz && kf.selW < 260,
    '#12: Auswahlfeld auf Inhaltsbreite (.ww-sel-kurz statt .g-sel{width:100%})', kf.selW);
  ok(kf.chips.join(',') === '10:a,15:-', '#12: die aktive Marke folgt dem Auswahlwert', kf.chips);

  await page.evaluate(() => { const b = document.querySelector('.ww-zeitwahl .ww-quick[data-sec="15"]'); if (b) b.click(); });
  await page.waitForTimeout(250);
  const nach2 = await page.evaluate(() => ({
    val: (document.getElementById('ww_zeitWohn') || {}).value,
    chips: [...document.querySelectorAll('.ww-zeitwahl .ww-quick')].map(c => c.getAttribute('data-sec') + ':' + (c.classList.contains('active') ? 'a' : '-')),
    std: (document.querySelector('#wwAusstossWohnBody select.ww-zeit') || { options: [{}] }).options[0].textContent
  }));
  ok(nach2.val === '15', '#12: Klick auf «15 s» setzt den Wert', nach2.val);
  ok(nach2.chips.join(',') === '10:-,15:a', '#12: die aktive Marke wandert mit', nach2.chips);
  ok(/Standard \(15 s\)/.test(nach2.std),
    '#12: die Zeilen uebernehmen den neuen Standard (change wurde gefeuert)', nach2.std);

  /* ── Etappe 3 · 3.3 Warmgehaltene Leitungen (#14, #17) ── */
  console.log('\n── Etappe 3 · 3.3 Warmgehaltene Leitungen ──');

  // #14 — die kWh/d tragen die Farbe ihrer Leitungsart (exakt die Farbpunkt-Toene aus 2.2)
  const farb = await page.evaluate(() => {
    const c = id => {
      const e = document.getElementById(id);
      if (!e) return null;
      const dot = e.closest('tr').querySelector('.ww-cdot');
      return { zelle: getComputedStyle(e).color, punkt: dot ? getComputedStyle(dot).backgroundColor : null };
    };
    return { vl: c('ww_out_qVL'), rl: c('ww_out_qRL'), rar: c('ww_out_qRarF'), whb: c('ww_out_qWhbF') };
  });
  ok(farb.vl && farb.vl.zelle === 'rgb(217, 119, 6)', '#14: Vorlauf konventionell amber (#d97706)', farb.vl);
  ok(farb.rl && farb.rl.zelle === 'rgb(217, 119, 6)', '#14: Ruecklauf konventionell amber (#d97706)', farb.rl);
  ok(farb.rar && farb.rar.zelle === 'rgb(220, 38, 38)', '#14: Rohr-an-Rohr rot (#dc2626)', farb.rar);
  ok(farb.whb && farb.whb.zelle === 'rgb(37, 99, 235)', '#14: Warmhalteband blau (#2563eb)', farb.whb);
  ok(['vl', 'rl', 'rar', 'whb'].every(k => farb[k] && farb[k].zelle === farb[k].punkt),
    '#14: die Wertfarbe ist EXAKT der Farbpunkt der Zeile (kein zweiter Farbkanon)',
    Object.keys(farb).map(k => k + ':' + (farb[k] && farb[k].zelle === farb[k].punkt)).join(' '));

  // #17 — ø-Reihe folgt dem Material
  const dims = id => page.evaluate(i => [...document.getElementById(i).options].map(o => o.value).join(','), id);

  ok(await dims('ww_oeVL') === '15,18,22,28,35,42,54,64,76.1,108',
    '#17: CNS zeigt die Edelstahl-Reihe (76.1 statt der nicht existierenden 78.1)', await dims('ww_oeVL'));
  ok(await dims('ww_oeRarRL') === '15,18,22,28,35,42,54,64,76.1,108',
    '#17: auch RaR-RL folgt dem Material (die alte Sonderliste 12…63 ist weg)', await dims('ww_oeRarRL'));

  await page.evaluate(() => {
    const m = document.getElementById('ww_matRL');
    m.value = 'pex';
    m.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  // synthetisch (isTrusted false) = Boot/Restore-Pfad → kein Klemmen, Wert bleibt
  const pex = await page.evaluate(() => {
    const s = document.getElementById('ww_oeRL');
    return {
      opts: [...s.options].map(o => o.value).join(','),
      val: s.value,
      alt: [...s.options].filter(o => o.classList.contains('ww-oe-alt')).map(o => o.textContent).join('|')
    };
  });
  ok(pex.opts.indexOf('12,16,20,25,32') === 0, '#17: PEX zeigt 12/16/20/25/32', pex.opts);
  ok(pex.val === '22' && /22 \(bisherig\)/.test(pex.alt),
    '#17: der gespeicherte ø 22 bleibt als «(bisherig)» erhalten (Bestandsschutz, kein stilles Kappen)', pex);

  /* echte Benutzer-Wahl → klemmt auf den naechstgroesseren Wert der Reihe.
     KRITISCH: page.selectOption() feuert ein SYNTHETISCHES change (isTrusted false)
     und traefe damit den Restore-Pfad von oben. Eine echte Wahl entsteht im Test nur
     ueber die CDP-Tastatur (Kanon: HX_KLIMA-Stationswahl in lt_hx_diagramm). */
  await page.focus('#ww_matWhb');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const whb = await page.evaluate(() => {
    const s = document.getElementById('ww_oeWhb');
    return { opts: [...s.options].map(o => o.value).join(','), val: s.value };
  });
  ok(whb.opts === '12,16,20,25,32', '#17: echte Wahl baut die Reihe ohne Alt-Option um', whb.opts);
  ok(whb.val === '25', '#17: der ø 22 klemmt auf den naechstgroesseren PEX-Wert 25', whb.val);

  await page.focus('#ww_matWhb');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  ok(await dims('ww_oeWhb') === '15,18,22,28,35,42,54,64,76.1,108',
    '#17: zurueck auf CNS stellt die Edelstahl-Reihe wieder her', await dims('ww_oeWhb'));

  // Rechenkette unveraendert: ein PEX-ø ohne eigenen Faktor nimmt den naechstgroesseren Tabellenwert
  const faktor = await page.evaluate(() => ({ f12: wwOeFaktor(12), f15: wwOeFaktor(15), f16: wwOeFaktor(16), f18: wwOeFaktor(18) }));
  ok(faktor.f12 === faktor.f15, '#17: PEX 12 nimmt den naechstgroesseren Faktor (15) — kein erfundener Zwischenwert', faktor);
  ok(faktor.f16 === faktor.f18, '#17: PEX 16 unveraendert auf dem 18er-Faktor (Bestandsverhalten)', faktor);

  ok(errs.length === 0, 'Keine JS-Fehler auf der Seite', errs.slice(0, 3));
} finally {
  if (browser) await browser.close();
  srv.close();
}

console.log('\n' + ok_ + ' ok, ' + bad + ' fehlgeschlagen');
process.exit(bad ? 1 : 0);
