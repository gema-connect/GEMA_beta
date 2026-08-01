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

console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
