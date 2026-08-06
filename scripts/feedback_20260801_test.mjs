// Drift-Guard für die Feedback-Runde vom 01.08.2026 (Sandro Caso + Hans Brunner):
// 38 Punkte über 10 Module.
//   LU-Tabelle .......... Reduktion zweistufig (LU / inkl. Spezial+Dauer),
//                         Bezeichnung + Medium-Farbe der Zuschlags-Zeilen.
//   Druckerhöhung ....... zwei Kapitel, Volumenstrom aus LU, Ergebnis pN vor
//                         der Drucküberlagerung, Höhe→Druck, 2 NK, 1 Pumpe,
//                         Kartentitel links, Text «Dauer-/Spezialverbraucher».
//   Enthärtung .......... 2 NK, «Abgang Aufhärtung», «100 % Gleichzeitigkeit»,
//                         Total-Spalte, Ventil-Beschriftung oberhalb.
//   Osmose .............. VO/VW ausgeschrieben + Übertrag-Hinweis, Tank-
//                         Vorschlag oberhalb, Sim einmalig + Tempo-Wahl.
//   Saugpumpe ........... eigene einklappbare Karten, 2 NK, «Druckverlust
//                         Saugleitung».
//   Druckanstieg ........ eigene einklappbare Karten, Rohrsystem-Wahl.
//   Frischwasserstation . einklappbare Karten, 2 NK.
//   DU-Zusammenstellung . Reduktionsübersicht, freie Bezeichnungen, Gruppen
//                         einklappbar.
//   Druckverlust ........ unterscheidbare Formstück-Icons.
//   Lieferanten-Dash .... Abmelden, Hero→So-funktionierts→KPIs, Tabs folgen
//                         den Kategorien, Logo, eigener Einladungs-Dialog.
// Aufruf: CHROME=<chromium> node scripts/feedback_20260801_test.mjs
import { chromium } from 'playwright-core';
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function open(datei, opts) {
  opts = opts || {};
  const st = opts.seed || seed(['role_planer']);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, st);
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(opts.wait || 1300);
  return { ctx, page, errors };
}

// ════════════════════════════════════════════════════════════════
// 1) LU-Tabelle — Reduktion zweistufig + benannte Zuschlags-Zeilen
// ════════════════════════════════════════════════════════════════
{
  console.log('■ LU: Reduktion zweistufig + Bezeichnung/Farbe der Zuschläge');
  const { ctx, page, errors } = await open('sb_lu_tabelle.html');

  // 10× WC (Kaltwasser, je 1 LU) + 1 Dauerverbraucher «TEST Apparat 2» 0.7 l/s
  await page.evaluate(() => {
    const row = document.querySelector('#deviceList .device-row:not(.device-total)');
    const qty = row.querySelector('input[type="text"], input[inputmode]');
    qty.value = '10'; qty.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Dauerverbraucher/.test(b.textContent) && /\+/.test(b.textContent));
    if (btn) btn.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const host = document.getElementById('dauerList');
    const row = host.querySelector('.med-row') || host.firstElementChild;
    const inps = row.querySelectorAll('input');
    inps[0].value = 'TEST Apparat 2'; inps[0].dispatchEvent(new Event('input', { bubbles: true }));
    const wert = [...inps].find(i => i.className.indexOf('flow') >= 0) || inps[inps.length - 1];
    wert.value = '0.7'; wert.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);

  const red = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#reduChart .redu-row')];
    return rows.map(r => ({
      top: (r.querySelector('.redu-top:not(.redu-sub)') || {}).textContent || '',
      sub: (r.querySelector('.redu-sub') || {}).textContent || ''
    }));
  });
  const kwRow = red.find(r => /Kaltwasser/.test(r.top));
  ok(!!kwRow, 'Reduktions-Karte zeigt eine Kaltwasser-Zeile');
  ok(kwRow && /—\s*LU/.test(kwRow.top), 'Zeile 1 ist als reine LU-Reduktion beschriftet');
  ok(kwRow && /inkl\. Spezial \/ Dauer/.test(kwRow.sub), 'Zeile 2 weist das Total inkl. der 1:1-Zuschläge aus');
  // «… 1.00 → 0.46 l/s −54 %» — die beiden Werte VOR der Einheit vergleichen
  const werte = t => { const m = /([\d.]+)\s*→\s*([\d.]+)\s*l\/s/.exec(t || ''); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; };
  const wLu = kwRow ? werte(kwRow.top) : null, wTot = kwRow ? werte(kwRow.sub) : null;
  ok(wLu && wTot && wTot[0] > wLu[0] && wTot[1] > wLu[1],
    'das Total der zweiten Zeile ist um die Zuschläge grösser als der reine LU-Wert');

  const split = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#kpiSplit .g-result-row')];
    return rows.map(r => ({
      txt: r.textContent.replace(/\s+/g, ' ').trim(),
      sub: r.classList.contains('sub'),
      col: (r.querySelector('.g-result-lbl') || {}).style ? r.querySelector('.g-result-lbl').style.color : ''
    }));
  });
  const named = split.find(r => r.sub && /TEST Apparat 2/.test(r.txt));
  ok(!!named, 'Aufteilung nennt den Dauerverbraucher mit seiner Bezeichnung');
  ok(named && named.col && named.col !== '', 'die benannte Zeile trägt die Farbe ihres Mediums');
  ok(split.some(r => !r.sub && /Dauerverbraucher – Σ/.test(r.txt)), 'die Σ-Zeile bleibt erhalten');
  ok(errors.length === 0, 'keine JS-Fehler in sb_lu_tabelle (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════
// 2) Druckerhöhung — zwei Kapitel, Zwischenwerte, Schema
// ════════════════════════════════════════════════════════════════
{
  console.log('■ Druckerhöhung: Kapitel, Zwischenwerte, 2 NK, Schema');
  const { ctx, page, errors } = await open('sb_druckerhoehung.html');
  const set = async (id, v) => page.evaluate(([i, val]) => {
    const e = document.getElementById(i);
    e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('blur', { bubbles: true }));
  }, [id, v]);
  for (const [id, v] of [['vfd_LU', '120'], ['vfd_qdv', '0.5'], ['vfd_pv', '0.5'], ['vfd_pF', '1'],
                         ['vfd_h', '10'], ['vfd_pDl', '1.2'], ['vfd_pDs', '0.2']]) await set(id, v);
  await page.waitForTimeout(400);

  const titel = await page.evaluate(() => [...document.querySelectorAll('#tabVFD .g-card')]
    .map(c => (c.querySelector('.g-card-hd h2') || {}).textContent || '').map(t => t.replace(/\s+/g, ' ').trim()));
  ok(/Volumenstrom/.test(titel[0] || ''), 'Kapitel 1 heisst «Volumenstrom»');
  ok(/Druckdisposition/.test(titel[1] || ''), 'Kapitel 2 heisst «Druckdisposition»');

  ok(await page.inputValue('#vfd_pF') === '1.00', 'Druck-Eingabe wird auf 2 Nachkommastellen formatiert');
  const hbar = await page.evaluate(() => (document.querySelector('[data-demirror="vfd_out_hbar"]') || {}).textContent || '');
  ok(/^=\s*0\.98\s*bar$/.test(hbar.trim()), 'Höhenunterschied wird in Druck umgerechnet angezeigt (' + hbar.trim() + ')');
  const qw3 = await page.evaluate(() => (document.querySelector('[data-demirror="vfd_out_qw3"]') || {}).textContent || '');
  ok(parseFloat(qw3) > 0, 'Zwischenergebnis «Volumenstrom aus LU» gefüllt (' + qw3 + ')');

  // pN steht VOR der Drucküberlagerung, pE danach
  const reihe = await page.evaluate(() => {
    const k2 = [...document.querySelectorAll('#tabVFD .g-card')][1];
    return [...k2.querySelectorAll('.fg .fg-lbl, .de-inres .de-inres-lbl')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
  });
  const iPN = reihe.findIndex(t => /Nachdruck/.test(t));
  const iPU = reihe.findIndex(t => /Drucküberlagerung/.test(t));
  const iPE = reihe.findIndex(t => /Sollwertdruck/.test(t));
  ok(iPN >= 0 && iPU > iPN && iPE > iPU, 'Reihenfolge: Nachdruck pN → Drucküberlagerung → Sollwertdruck pE');

  ok(await page.evaluate(() => !/≥ 15 min Laufzeit/.test(document.getElementById('fg_vfd_qdv').textContent)),
    'Untertext «≥ 15 min Laufzeit» entfernt');
  ok(await page.evaluate(() => /Dauer-\/ Spezialverbraucher/.test(document.getElementById('fg_vfd_qdv').textContent)),
    'Label heisst «Dauer-/ Spezialverbraucher»');

  const schema = await page.evaluate(() => {
    const svg = document.querySelector('#deSchemaVfd svg');
    const html = svg ? svg.innerHTML : '';
    const mani = /x1="(\d+)" y1="284" x2="\d+" y2="284" stroke="#2563eb"/.exec(html);
    const riser = /<line x1="(\d+)" y1="317" x2="\1" y2="284"/.exec(html);
    return {
      pumpen: (html.match(/Druckerhöhungsanlage · (\d) Pumpe/) || [])[1],
      dach: /<path d="M 628 [\d.]+ L 812 [\d.]+ L 996 [\d.]+ Z"/.test(html),
      maniStart: mani ? +mani[1] : null, riserX: riser ? +riser[1] : null,
      expX: (/<circle cx="(\d+)" cy="240" r="22"/.exec(html) || [])[1]
    };
  });
  ok(schema.pumpen === '1', 'Schema zeigt standardmässig 1 Pumpe');
  ok(schema.dach, 'Gebäude hat ein Satteldach');
  ok(schema.maniStart !== null && schema.maniStart === schema.riserX,
    'Sammelleitung beginnt bündig am Pumpen-Riser (' + schema.maniStart + ' / ' + schema.riserX + ')');
  ok(schema.expX && +schema.expX < 612, 'Expansionsgefäss steht weiter vorne als bisher (' + schema.expX + ')');
  ok(errors.length === 0, 'keine JS-Fehler in sb_druckerhoehung (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════
// 3) Enthärtung — Total-Spalte, 2 NK, Wortlaut, Ventil-Beschriftung
// ════════════════════════════════════════════════════════════════
{
  console.log('■ Enthärtung: Total-Spalte, 2 NK, «Abgang Aufhärtung»');
  const { ctx, page, errors } = await open('sa_enthaertung.html', { wait: 1500 });
  const set = async (id, v) => page.evaluate(([i, val]) => {
    const e = document.getElementById(i);
    e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('blur', { bubbles: true }));
  }, [id, v]);
  for (const [id, v] of [['hr_fh', '30'], ['lu_A', '100'], ['nm_A', '0.58'], ['v_A', '15'], ['m_A', '7100']]) await set(id, v);
  await page.waitForTimeout(500);

  const kopf = await page.evaluate(() => [...document.querySelectorAll('.consumer-table thead th')]
    .map(t => t.textContent.replace(/\s+/g, ' ').trim()));
  const iMan = kopf.findIndex(t => /\+ manuell/.test(t));
  ok(iMan >= 0 && /^Total/.test(kopf[iMan + 1] || ''), 'Spalte «Total l/s» steht direkt nach «+ manuell»');

  const nA = await page.inputValue('#n_A');
  ok(nA === '1.03', 'aus LU abgeleiteter Volumenstrom mit 2 Nachkommastellen (' + nA + ')');
  const totA = await page.evaluate(() => document.getElementById('tot_A').textContent);
  ok(totA === '1.61', 'Total = Volumenstrom + manueller Zuschlag (' + totA + ')');

  const lbls = await page.evaluate(() => [...document.querySelectorAll('.g-result-lbl')].map(e => e.textContent.trim()));
  ok(lbls.some(t => t === 'Abgang Aufhärtung'), 'Zeile heisst «Abgang Aufhärtung»');
  ok(!lbls.some(t => /Umgehung total/.test(t)), '«Umgehung total (Aufhärteventil)» ist ersetzt');
  ok(lbls.some(t => /100 % Gleichzeitigkeit \(informativ\)/.test(t)), 'informative Summe heisst «100 % Gleichzeitigkeit»');

  const schema = await page.evaluate(() => (document.querySelector('#enthSchemaCard svg') || {}).innerHTML || '');
  ok(/Abgang Aufhärtung/.test(schema), 'Schema-Beschriftung heisst «Abgang Aufhärtung»');
  ok(!/Umgehung \(Rohwasser zur Aufhärtung\)/.test(schema), 'alte Schema-Beschriftung entfernt');
  ok(errors.length === 0, 'keine JS-Fehler in sa_enthaertung (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════
// 4) Osmose — Labels, Tank-Vorschlag, Sim-Tempo, 24-h-Raster
// ════════════════════════════════════════════════════════════════
{
  console.log('■ Osmose: Labels, Vorschlag oben, Sim einmalig, 24-h-Raster');
  const { ctx, page, errors } = await open('sa_osmose.html', { wait: 1500 });
  const set = async (id, v) => page.evaluate(([i, val]) => {
    const e = document.getElementById(i); if (!e) return;
    e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('blur', { bubbles: true }));
  }, [id, v]);
  await page.evaluate(() => {
    const tb = document.getElementById('consumerBody');
    if (!tb.rows.length && window.addConsumerRow) addConsumerRow();
    const r = tb.rows[0];
    const ins = [r.cells[0].querySelector('input'), r.cells[1].querySelector('input'), r.cells[2].querySelector('input')];
    ins[0].value = 'Labor'; ins[1].value = '120'; ins[2].value = '8';
    ins.forEach(i => i.dispatchEvent(new Event('input', { bubbles: true })));
  });
  for (const [id, v] of [['va', '100'], ['betriebszeit', '9.6'], ['recovery', '75']]) await set(id, v);
  await page.waitForTimeout(400);
  await set('otOptTank', '2500');
  await page.waitForTimeout(500);

  const lbls = await page.evaluate(() => [...document.querySelectorAll('.g-result-lbl')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(lbls.some(t => /^Volumenstrom Osmose VO in l\/s/.test(t)), 'VO-Kürzel ausgeschrieben');
  ok(lbls.some(t => /^Volumenstrom Weichwasser VW in l\/s/.test(t)), 'VW-Kürzel ausgeschrieben');
  ok(await page.evaluate(() => !!document.querySelector('.os-uebertrag')), 'Weichwasser verweist auf den Übertrag in die Enthärtungsanlage');

  // Vorschlag steht ÜBER dem Eingabefeld
  const oben = await page.evaluate(() => {
    const box = document.getElementById('otVorschlagBox'), inp = document.getElementById('otOptTank');
    if (!box || !inp) return false;
    return (box.compareDocumentPosition(inp) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });
  ok(oben, 'Tank-Vorschlag steht oberhalb des Eingabefeldes');
  ok(await page.evaluate(() => /Reduktion möglich/.test(document.getElementById('otReduHint').textContent)),
    'Reduktions-Potenzial des Tanks wird ausgewiesen');

  // 24-h-Verteilung als Raster UNTER dem Verbraucher
  const raster = await page.evaluate(() => ({
    spalten: document.querySelectorAll('#otTbl thead th').length,
    hrows: document.querySelectorAll('#otTbl tr.ot-hrow').length,
    zellenProRaster: document.querySelectorAll('#otTbl tr.ot-hrow .ot-hcell').length / Math.max(1, document.querySelectorAll('#otTbl tr.ot-hrow').length),
    zugeordnet: !!document.querySelector('#otTbl tr.ot-hrow[data-hkey]')
  }));
  ok(raster.spalten === 4, 'Tabelle führt nur noch 4 Spalten (' + raster.spalten + ')');
  ok(raster.zellenProRaster === 24, 'jedes Raster hat 24 Stundenfelder');
  ok(raster.zugeordnet, 'das Raster ist seinem Verbraucher zugeordnet (data-hkey)');

  // Simulation: Tempo-Wahl + einmaliger Durchlauf
  ok(await page.evaluate(() => document.querySelectorAll('[data-ot-tempo]').length === 3), 'Tempo-Wahl 1× / 2× / 5× vorhanden');
  const sim = await page.evaluate(() => {
    window.otSimTempo(5);
    const st = window._otSimHooks.state();
    window._otSimHooks.setT(23.99);
    window.otSimToggle();                       // startet ab 23.99 → läuft sofort ans Ende
    return { spielt: st.playing };
  });
  await page.waitForTimeout(400);
  const nachEnde = await page.evaluate(() => ({
    playing: window._otSimHooks.state().playing,
    t: window._otSimHooks.state().t,
    btn: document.getElementById('otSimPlayBtn').textContent
  }));
  ok(!nachEnde.playing && nachEnde.t >= 24 - 1e-6, 'Simulation hält am Tagesende an statt endlos zu laufen');
  ok(/Nochmals/.test(nachEnde.btn), 'Knopf bietet danach «↻ Nochmals» an');

  const svg = await page.evaluate(() => (document.querySelector('#otSimWrap svg') || {}).outerHTML || '');
  ok(/Weichwasser/.test(svg) && /von der Enthärtung/.test(svg), 'Weichwasser-Zulauf von der Enthärtung dargestellt');
  ok(/Druckerhöhung/.test(svg), 'Druckerhöhungspumpe nach dem Tank dargestellt');
  ok(/Konzentrat/.test(svg), 'Osmoseanlage komplett gezeichnet (Konzentrat-Abgang)');
  ok(errors.length === 0, 'keine JS-Fehler in sa_osmose (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ── Saugpumpe ────────────────────────────────────────────────────────────
console.log('\n■ Saugpumpe — eigene Karten, 2 NK, Schema');
{
  const { page, errors, ctx } = await open('sb_saugpumpe.html');
  const karten = await page.$$eval('.g-card > .g-card-hd h2', n => n.map(x => x.textContent.trim()));
  ok(karten.filter(t => /^[1-6]/.test(t)).length === 6, 'die 6 Eingabe-Sektionen sind eigene Karten');
  ok(await page.$$eval('.g-card-hd.sp-foldhd', n => n.length) >= 6, 'alle Karten einklappbar');
  // Einklappen persistiert pro Gerät und liegt NIE im AutoSave-Snapshot
  await page.evaluate(() => document.querySelectorAll('.g-card-hd.sp-foldhd')[0].click());
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({
    zu: document.querySelectorAll('.g-card.sp-zu').length,
    ls: localStorage.getItem('gema_sg_fold_v1') || '',
    save: JSON.stringify(localStorage).indexOf('gema_sg_fold_v1') >= 0
  }));
  ok(st.zu === 1 && st.ls.length > 2, 'Fold-Zustand pro Gerät gespeichert');
  const werte = await page.evaluate(() => ['sg_out_hf', 'sg_out_hv', 'sg_out_hb2', 'sg_out_hf2', 'sg_out_hv2']
    .map(i => (document.getElementById(i) || {}).textContent || ''));
  ok(werte.every(v => /^-?[\d’']*\d\.\d{2}\s/.test(v.trim())), '2 Nachkommastellen in den Ergebnissen (' + werte.join(' | ') + ')');
  const sgTexte = await page.evaluate(() => Array.from(document.querySelectorAll('#sgSchema text')).map(t => t.textContent));
  ok(sgTexte.some(t => /Druckverlust Saugleitung/.test(t)), 'Legende nennt «Druckverlust Saugleitung» statt «Reibung»');
  ok(sgTexte.includes('Absperrventil') && sgTexte.includes('Saugleitung'), 'Schema: Saugleitung + Absperrventil beschriftet');
  ok(sgTexte.some(t => /zur Anlage/.test(t)) && sgTexte.includes('Pumpe'), 'Schema: Pumpe + Druckleitung «zur Anlage»');
  // T/ρ-Chip steht NEBEN dem Becken (Feedback: grüner Pfeil), nicht mehr darin
  const chipX = await page.evaluate(() => {
    const g = Array.from(document.querySelectorAll('#sgSchema g[data-sgziel="sg_t"] rect'))[0];
    return g ? parseFloat(g.getAttribute('x')) : -1;
  });
  ok(chipX > 302, 'Wasserwerte-Chip liegt rechts neben dem Becken (x=' + chipX + ')');
  ok(errors.length === 0, 'keine JS-Fehler in sb_saugpumpe (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ── Druckanstieg ─────────────────────────────────────────────────────────
console.log('\n■ Druckanstieg — eigene Karten, Rohrsystem-Wahl, 2 NK');
{
  const { page, errors, ctx } = await open('sb_druckanstieg.html');
  const karten = await page.$$eval('.g-card > .g-card-hd h2', n => n.map(x => x.textContent.trim()));
  ok(karten.filter(t => /^[1-5]/.test(t)).length === 5, 'die 5 Eingabe-Sektionen sind eigene Karten');
  ok(await page.$$eval('.g-card-hd.sp-foldhd', n => n.length) >= 5, 'alle Karten einklappbar');
  // Rohrsystem-Katalog kommt aus gema_rohrsysteme.js — dieselbe Tabelle wie im Druckverlust
  const sysN = await page.$$eval('#sp_sys option', n => n.length);
  ok(sysN >= 10, 'Rohrsystem-Auswahl aus dem Druckverlust-Katalog (' + sysN + ' Systeme)');
  ok(await page.evaluate(() => typeof window.GemaRohre === 'object' && GemaRohre.SYSTEMS.length > 10), 'GemaRohre als geteilte Wahrheit geladen');
  const dim0 = await page.$eval('#sp_out_di', e => e.textContent);
  ok(/^\d+\.\d{2}\s*mm/.test(dim0), 'Innen-ø aus der Rohrtabelle mit 2 NK (' + dim0 + ')');
  // Systemwechsel: Dimensionen + α folgen dem Werkstoff
  await page.selectOption('#sp_sys', 'pe10');
  await page.waitForTimeout(250);
  const nach = await page.evaluate(() => ({
    dims: document.querySelectorAll('#sp_dim option').length,
    alpha: document.getElementById('sp_alpha').value,
    di: document.getElementById('sp_out_di').textContent
  }));
  ok(nach.dims > 3 && nach.di !== dim0, 'Dimensionsliste + di folgen dem gewählten System');
  ok(parseFloat(nach.alpha) > 100, 'α wird aus dem Werkstoff vorbelegt (Kunststoff ' + nach.alpha + ')');
  await page.selectOption('#sp_sys', 'mapress');
  await page.waitForTimeout(250);
  ok(parseFloat(await page.$eval('#sp_alpha', e => e.value)) === 16.5, 'α zurück auf Edelstahl 16.5');
  const res = await page.evaluate(() => ['sp_out_phgeo', 'sp_out_dt', 'sp_out_dp', 'sp_out_pmax', 'sp_out_psv', 'sp_kpi_dp']
    .map(i => (document.getElementById(i) || {}).textContent || ''));
  ok(res.every(v => /\d\.\d{2}(\s|$)/.test(v)), '2 Nachkommastellen in allen Ergebnissen (' + res.join(' | ') + ')');
  const klein = await page.$eval('#sp_out_dv', e => e.textContent);
  ok(/cm³/.test(klein) && /\d\.\d{2}/.test(klein), 'Volumenänderung in cm³ statt Exponent (' + klein + ')');
  ok(errors.length === 0, 'keine JS-Fehler in sb_druckanstieg (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ── Frischwasserstation ──────────────────────────────────────────────────
console.log('\n■ Frischwasserstation — einklappbar, 2 NK, Visualisierung');
{
  const { page, errors, ctx } = await open('sa_frischwasserstation.html');
  ok(await page.$$eval('.g-card-hd.fw-foldhd', n => n.length) >= 6, 'alle Karten einklappbar');
  await page.evaluate(() => document.querySelectorAll('.g-card-hd.fw-foldhd')[0].click());
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelectorAll('.g-card.fw-zu').length === 1
     && (localStorage.getItem('gema_fw_fold_v1') || '').length > 2), 'Fold-Zustand pro Gerät gespeichert');
  // Feedback 05.08.2026: EIN Anlagenschema (das frühere Durchlauf-Schema ist entfernt),
  // immer sichtbar und direkt unter dem Ergebnis — ohne Kaskade mit EINER Station.
  ok(await page.$$eval('#fwSchema', n => n.length) === 0, 'altes Durchlauf-Schema entfernt');
  ok(await page.$$eval('#fwkSchema svg', n => n.length) === 1, 'Anlagenschema gezeichnet');
  ok(await page.$eval('#fwkSchemaCard', e => getComputedStyle(e).display !== 'none'), 'Anlagenschema ohne Kaskade sichtbar');
  // Daten erfassen → Werte erscheinen im Schema
  await page.evaluate(() => {
    const i = document.querySelector('#fwNutzBody input[data-k="n"]');
    if (i) { i.value = '4'; i.dispatchEvent(new Event('input', { bubbles: true })); }
    const b = document.querySelector('#fwWhgBody');
    if (b) { const s = b.querySelectorAll('input');
      if (s[0]) { s[0].value = '6'; s[0].dispatchEvent(new Event('input', { bubbles: true })); }
      if (s[2]) { s[2].value = '1'; s[2].dispatchEvent(new Event('input', { bubbles: true })); } }
  });
  await page.waitForTimeout(400);
  const txt = await page.evaluate(() => Array.from(document.querySelectorAll('#fwkSchema text')).map(t => t.textContent));
  ok(txt.filter(t => /^(FWS|W\d)$/.test(t)).length === 1, 'ohne Kaskade genau EINE Station (' + txt.filter(t => /^(FWS|W\d)$/.test(t)).join(',') + ')');
  ok(txt.some(t => /^FWS$/.test(t)), 'Station heisst ohne Kaskade FWS');
  ok(txt.some(t => /Pufferspeicher/.test(t)) && txt.some(t => /erzeuger/.test(t)), 'Primärseite mit Pufferspeicher + Wärmeerzeuger');
  ok(txt.some(t => /^Warmwasser \d/.test(t)) && txt.some(t => /^Kaltwasser \d/.test(t)), 'KW/WW-Temperaturen im Schema');
  ok(txt.some(t => /^Station \d+\.\d{2} kW/.test(t)), 'Leistung im Schema mit 2 NK');
  ok(!/var\(--/.test(await page.evaluate(() => document.getElementById('fwkSchema').innerHTML)), 'Schema nutzt nur literale Farben (GemaPDF-Regel)');
  ok(await page.evaluate(() => {
    const c = document.getElementById('fwkSchemaCard'), s2 = Array.from(document.querySelectorAll('.g-card h2')).find(h => /^2 · /.test(h.textContent));
    return !!(c && s2 && (c.compareDocumentPosition(s2) & Node.DOCUMENT_POSITION_FOLLOWING));
  }), 'Schema steht weiter oben — vor Abschnitt 2');
  // Zirkulations-Chip erscheint erst mit Wert (der Legenden-Eintrag steht immer)
  ok(!txt.some(t => /^Zirkulation \d/.test(t)), 'Zirkulation ohne Wert nicht gezeichnet');
  await page.evaluate(() => { const z = document.getElementById('fw_zirkV'); z.value = '250'; z.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => Array.from(document.querySelectorAll('#fwkSchema text')).some(t => /Zirkulation \d/.test(t.textContent))), 'Zirkulation erscheint mit erfasstem Wert');
  const kpi = await page.evaluate(() => ['fw_kpi_v', 'fw_kpi_p', 'fw_out_zTotal', 'fw_out_pfws', 'fw_out_vWW']
    .map(i => (document.getElementById(i) || {}).textContent || ''));
  ok(kpi.every(v => /\d\.\d{2}/.test(v)), '2 Nachkommastellen in KPI + Ergebnis (' + kpi.join(' | ') + ')');
  ok(errors.length === 0, 'keine JS-Fehler in sa_frischwasserstation (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ── DU-Zusammenstellung ──────────────────────────────────────────────────
console.log('\n■ DU-Zusammenstellung — Reduktionsübersicht, freie Namen, einklappbar');
{
  const { page, errors, ctx } = await open('sb_du_zusammenstellung.html');
  // (3) alle Gruppen + Ergebnis-Karten einklappbar
  ok(await page.$$eval('.tbl-card-hd.du-foldhd', n => n.length) >= 5, 'Apparate-Gruppen einklappbar');
  ok(await page.$$eval('.du-foldable', n => n.length) >= 2, 'Ergebnis-Karten einklappbar');
  await page.click('#grp_g200 .tbl-card-hd');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById('grp_g200').classList.contains('du-zu')
     && JSON.parse(localStorage.getItem('gema_du_fold_v1') || '{}').g200 === 1), 'Fold-Zustand pro Gerät gespeichert');
  await page.click('#grp_g200 .tbl-card-hd');
  await page.waitForTimeout(200);
  // (2) Bezeichnungen der variablen Apparate frei beschreibbar
  // Feedback 06.08.2026: die Gruppe startet mit EINER Zeile (weitere per ＋) —
  // die freie Beschreibbarkeit bleibt, nur die Zeilenzahl ist nicht mehr fix.
  ok(await page.$$eval('.ap-name-input', n => n.length) >= 1, 'variable Apparate haben ein Bezeichnungs-Feld');
  await page.evaluate(() => { if (!document.getElementById('nam_WMGEW')) varRowAdd(); });
  await page.waitForTimeout(200);
  await page.fill('#nam_WMGEW', 'Grossküchen-Spüler');
  await page.waitForTimeout(300);
  const nam = await page.evaluate(() => ({
    fokus: document.activeElement && document.activeElement.id,
    gespeichert: (JSON.parse(_GemaDB.c[Object.keys(_GemaDB.c)[0]] || '{}').varName || {}).WMGEW || ''
  }));
  ok(nam.gespeichert === 'Grossküchen-Spüler', 'eigene Bezeichnung wird gespeichert');
  ok(nam.fokus === 'nam_WMGEW', 'Fokus bleibt beim Tippen im Feld (Liste wird nicht neu gebaut)');
  // (1) Reduktionsübersicht wie in der LU-Berechnung
  ok(await page.$eval('#duReduCard', e => e.style.display === 'none'), 'Reduktionsübersicht bleibt ohne Apparate weg');
  await page.evaluate(() => { setQty('WC', 4); setQty('WT', 6); });
  await page.waitForTimeout(300);
  const r1 = await page.evaluate(() => ({
    sicht: document.getElementById('duReduCard').style.display !== 'none',
    txt: document.getElementById('duReduBody').textContent.replace(/\s+/g, ' '),
    segs: Array.from(document.querySelectorAll('#duReduBody .bseg')).length
  }));
  ok(r1.sicht && r1.segs === 1, 'Reduktionsübersicht erscheint mit erfassten Apparaten');
  ok(/→/.test(r1.txt) && /−\s?\d+\.\d\s?%/.test(r1.txt), '100 % → reduziert mit Prozent-Angabe (' + r1.txt.slice(0, 60) + ')');
  await page.evaluate(() => { const q = document.getElementById('qc1'); q.value = '0.8'; q.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => ({
    txt: document.getElementById('duReduBody').textContent.replace(/\s+/g, ' '),
    segs: Array.from(document.querySelectorAll('#duReduBody .bseg')).map(x => x.style.width),
    stack: !!document.querySelector('#duReduBody .bstack')
  }));
  ok(/Dauerabflüsse/.test(r2.txt) && r2.segs.length === 3, 'zweite Zeile inkl. Dauerabflüsse Qc (1:1)');
  ok(r2.segs.every(w => /%$/.test(w) && parseFloat(w) > 0), 'gestapelte Segmente haben echte Breiten (' + r2.segs.join(' | ') + ')');
  ok(errors.length === 0, 'keine JS-Fehler in sb_du_zusammenstellung (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ── Druckverlust: eindeutige Formstück-Icons ─────────────────────────────
console.log('\n■ Druckverlust — eindeutige Formstück-Icons');
{
  const { page, errors, ctx } = await open('sb_druckverlust.html');
  const ic = await page.evaluate(() => {
    const f = n => fitIcon(n);
    return {
      durch: f('T-Stück (Durchgang)'), abzw: f('T-Stück (Abzweig)'),
      bogen90: f('Bogen 90°'), bogen45: f('Bogen 45°'),
      muffe: f('Muffe'), kupplung: f('Kupplung'), fallback: f('Unbekanntes Teil')
    };
  });
  ok(ic.durch !== ic.abzw, 'T-Stück Durchgang und Abzweig haben UNTERSCHIEDLICHE Icons');
  ok(Object.values(ic).every(v => /^<svg/.test(v)), 'alle Icons sind Piktogramme (SVG statt Emoji/Unicode)');
  ok(ic.bogen90 !== ic.bogen45 && ic.muffe !== ic.kupplung, 'auch ähnliche Formstücke sind unterscheidbar');
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(ic.durch + ic.bogen90 + ic.fallback), 'keine Emojis mehr in den Icons');
  // Klammern in den Katalog-Namen dürfen das Matching nicht aushebeln
  ok(await page.evaluate(() => fitIcon('T-Stück (Durchgang)') === fitIcon('T-Stück Durchgang')), 'Namen mit und ohne Klammern liefern dasselbe Icon');
  // Im gerenderten Formstück-Katalog stehen die SVG wirklich drin
  await page.evaluate(() => { const c = document.querySelector('.ts-card'); const rid = c && c.getAttribute('data-row'); if (rid) { _tsOpenMap[rid] = true; render(); } });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const t = document.querySelector('[data-fittoggle]'); if (t) t.click(); });
  await page.waitForTimeout(300);
  const n = await page.$$eval('.fit-card .fc-ic svg', x => x.length);
  ok(n >= 5, 'Formstück-Karten zeigen die Piktogramme (' + n + ')');
  ok(errors.length === 0, 'keine JS-Fehler in sb_druckverlust (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

// ── Lieferanten-Dashboard (Hans Brunner, 7 Punkte) ───────────────────────
console.log('\n■ Lieferanten-Dashboard');
{
  const { page, errors, ctx } = await open('sys_lieferant_dashboard.html', { seed: seed(['role_lieferant']), wait: 2200 });
  // #1 Abmelden
  ok(await page.$$eval('#navLogout', n => n.length) === 1, 'Abmelden-Knopf in der Navigation');
  // #2 Hero oben (schlank) → So funktioniert's → KPIs
  const reihe = await page.evaluate(() => Array.from(document.querySelector('.g-page').children).map(c => c.id || c.className));
  const iHero = reihe.indexOf('welcomeCard'), iKpi = reihe.indexOf('kpis'), iTabs = reihe.indexOf('mainTabs');
  ok(iHero >= 0 && iHero < iKpi && iKpi < iTabs, 'Reihenfolge Hero → KPIs → Tabs (' + reihe.slice(0, 5).join(' / ') + ')');
  ok(await page.evaluate(() => {
    const h = document.querySelector('#welcomeCard > div');
    return !!h && h.getBoundingClientRect().height < 110;      // schlank statt 32px-Padding-Block
  }), 'Hero ist schlank');
  ok(await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.g-page button')).find(b => /So funktioniert/.test(b.textContent));
    if (!btn) return false;
    const kpi = document.getElementById('kpis');
    return btn.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING;   // Knopf VOR den KPIs
  }), '«So funktioniert\'s» steht zwischen Hero und KPIs');
  // #4 Tabs folgen den Firmenprofil-Kategorien
  const t1 = await page.evaluate(() => { _lief.lieferantKategorien = ['enthaertung', 'osmose']; setupTabs(); return Array.from(document.querySelectorAll('.tab')).map(x => x.textContent.trim()); });
  ok(!t1.some(t => /Rohrsysteme/.test(t)) && !t1.some(t => /Werkzeuge/.test(t)), 'ohne passende Kategorie kein Rohrsystem-/Werkzeug-Tab');
  const t2 = await page.evaluate(() => { _lief.lieferantKategorien = ['enthaertung', 'rohrsysteme', 'werkzeuge']; setupTabs(); return Array.from(document.querySelectorAll('.tab')).map(x => x.textContent.trim()); });
  ok(t2.some(t => /Rohrsysteme/.test(t)) && t2.some(t => /Werkzeuge/.test(t)), 'mit gewählter Kategorie erscheinen die Tabs');
  const t3 = await page.evaluate(() => { _lief.lieferantKategorien = []; setupTabs(); return Array.from(document.querySelectorAll('.tab')).map(x => x.textContent.trim()); });
  ok(t3.some(t => /Rohrsysteme/.test(t)), 'Bestandsschutz: ohne jede Kategorie bleibt alles sichtbar');
  // #5 Produkt-Editor als eigene Seite (nicht Seitenleiste)
  const ed = await page.evaluate(() => {
    const ov = document.getElementById('prodEditorOverlay');
    const inner = ov.firstElementChild;
    return { pos: getComputedStyle(inner).position, zurueck: /Zurück/.test(ov.textContent) };
  });
  ok(ed.pos !== 'absolute' && ed.zurueck, 'Produkt-Editor ist Vollbild-Seite mit «‹ Zurück»');
  ok(await page.evaluate(() => {
    document.getElementById('peKat').innerHTML = '<option value="enthaertung">x</option>';
    renderPeFelder();
    return document.querySelectorAll('#peFelder .pe-grp').length > 1
        && document.querySelectorAll('#peFelder .pe-grp-sep').length >= 1;
  }), 'Angaben pro Anlage gegliedert, Gruppen durch Trennstrich abgesetzt');
  // #6 eigener Einladungs-Dialog statt window.prompt
  ok(await page.evaluate(() => {
    let promptCalled = false;
    const orig = window.prompt; window.prompt = () => { promptCalled = true; return null; };
    _liefInviteOpen();
    window.prompt = orig;
    const ov = document.getElementById('liefInviteOv');
    return !promptCalled && !!ov && ov.style.display !== 'none'
        && !!document.getElementById('liefInvMail') && !!document.getElementById('liefInvName');
  }), 'Mitarbeiter-Einladung nutzt einen eigenen Dialog (kein window.prompt)');
  ok(await page.evaluate(() => {
    document.getElementById('liefInvMail').value = 'keine-mail';
    _liefInviteSave();
    const e = document.getElementById('liefInvErr');
    return e.style.display !== 'none' && /gültig/i.test(e.textContent);
  }), 'Dialog prüft die E-Mail-Adresse');
  await page.evaluate(() => _liefInviteClose());
  // #7 Logo-Upload im Firmenprofil (nur Org-Admin)
  ok(await page.$$eval('#pLogoBox', n => n.length) === 1, 'Firmenprofil hat ein Logo-Feld');
  // Über den ECHTEN Speicherpfad (getOrgs liefert Kopien — nur saveOrgs wirkt)
  ok(await page.evaluate(async () => {
    await Promise.resolve(_liefLogoSpeichern('', 'data:image/jpeg;base64,AAA'));
    await new Promise(r => setTimeout(r, 250));
    const img = document.getElementById('pLogoImg');
    return img.style.display === 'block' && !!document.querySelector('#welcomeCard img');
  }), 'hochgeladenes Logo erscheint in Vorschau und Hero');
  ok(await page.evaluate(() => {
    // Fremde Org darf NIE durchschlagen (Muster «bwt aqua»-Bug)
    const me = GemaAuth.getCurrentUser();
    return _liefLogoSrc() === ((GemaAuth.getOrgs() || []).filter(o => o.id === me.orgId)[0] || {}).logo;
  }), 'Logo kommt streng aus der eigenen Firma');
  // #3 Excel-Vorlage + Import
  await page.evaluate(() => { _lief.lieferantKategorien = ['enthaertung', 'osmose']; _liefXlsVorlageOpen(); });
  await page.waitForTimeout(250);
  const vk = await page.$$eval('#xlsKatList label', n => n.map(x => x.textContent.trim()));
  ok(vk.length === 2 && vk.every(t => /Spalten/.test(t)), 'Vorlage-Dialog listet die Anlagentypen mit Checkbox (' + vk.length + ')');
  ok(await page.$$eval('#xlsKatList input.xls-kat', n => n.length) === 2, 'Mehrfachauswahl per Checkbox');
  const vt = await page.evaluate(() => {
    const kopf = _xlsHooks.vorlage('enthaertung').split('\r\n')[0];
    return { kopf: kopf, spalten: kopf.split(';').length, schema: _xlsHooks.spalten('enthaertung').length };
  });
  ok(vt.spalten === vt.schema && vt.spalten > 10, 'Vorlage trägt alle Schema-Spalten als Titel (' + vt.spalten + ')');
  ok(/Typenbezeichnung|Serie/.test(vt.kopf) && /\[/.test(vt.kopf), 'Titel sind lesbar und tragen die Einheit');
  await page.evaluate(() => _liefXlsClose('xlsVorlageOv'));
  // Kopfzeilen-Prüfung: geänderte Titel werden gemeldet
  const pruef = await page.evaluate(() => {
    const sp = _xlsHooks.spalten('enthaertung').map(c => c.titel);
    const ok = _xlsHooks.pruefeKopf('enthaertung', sp);
    const bad = _xlsHooks.pruefeKopf('enthaertung', sp.map((t, i) => i === 1 ? 'Umbenannt' : t).concat(['Extra']));
    const lax = _xlsHooks.pruefeKopf('enthaertung', sp.map(t => '  ' + t.toUpperCase() + ' '));
    return { okF: ok.fehlend.length, badF: bad.fehlend.length, badU: bad.unbekannt.length, laxF: lax.fehlend.length };
  });
  ok(pruef.okF === 0, 'unveränderte Vorlage wird vollständig zugeordnet');
  ok(pruef.badF === 1 && pruef.badU === 2, 'geänderter Titel wird als fehlend, Zusatzspalten als unbekannt gemeldet');
  ok(pruef.laxF === 0, 'Gross-/Kleinschrift und Leerzeichen brechen den Import nicht');
  ok(await page.evaluate(() => JSON.stringify(_xlsHooks.parse('a;b;c\r\n1;"zwei;drei";3')) === '[["a","b","c"],["1","zwei;drei","3"]]'), 'CSV-Parser beachtet Quotes und Trennzeichen');
  ok(errors.length === 0, 'keine JS-Fehler im Lieferanten-Dashboard (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
