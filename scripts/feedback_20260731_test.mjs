// Drift-Guard: Feedback 31.07.2026 (Sandro Caso u.a.)
// Teil 1 — Druckerhöhung (sb_druckerhoehung.html):
//   Excel-Prinzip Eingabe→Berechnung→Ergebnis je Schritt (1./2./3., Lehrmittel-Bezug),
//   Inline-Zwischenergebnisse, Freitext-Dauerverbraucher, löschbare Zusatzzeilen,
//   Kennlinien-Wertetabelle (l/s + bar), 2 Nachkommastellen, einklappbare Karten,
//   Schema: Anzahl Pumpen wählbar/aus Anlage, Rückflussverhinderer (gefülltes
//   Dreieck), Expansionsgefäss, Verteilung nach oben, 2.8-m-Geschossraster,
//   gerade (senkrechte) Bezugslinien.
// Ausführen: CHROME=<chromium> node scripts/feedback_20260731_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const srv = await startServer();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const { page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto(BASE + '/sb_druckerhoehung.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1400);

// ---- Schritt-Struktur (1./2./3. Lehrmittel-Bezug) + Fold vorhanden
const struct = await page.evaluate(() => {
  const steps = [...document.querySelectorAll('#tabVFD .de-step .de-stepnum, #tabVFD .g-card-hd .de-stepnum')].map(e => e.textContent.trim());
  return {
    steps,
    foldHds: document.querySelectorAll('.g-card-hd.de-foldhd').length,
    cx: document.querySelectorAll('.de-fold-cx').length,
    npSel: !!document.getElementById('vfd_np'),
    curveHosts: !!document.getElementById('curveTblVfd') && !!document.getElementById('curveTblVes'),
    delBtns: document.querySelectorAll('#tabVFD .fg-del').length,
    freeName: !!document.getElementById('vfd_qdvN1'),
    inres: document.querySelectorAll('#tabVFD .de-inres').length
  };
});
ok(struct.steps.includes('1') && struct.steps.includes('2') && struct.steps.includes('3'), 'Schritt-Nummern 1/2/3 im VFD-Tab: ' + struct.steps.join(','));
ok(struct.foldHds >= 6, 'Karten einklappbar (de-foldhd): ' + struct.foldHds);
ok(struct.cx >= 6, 'Fold-Chevrons injiziert: ' + struct.cx);
ok(struct.npSel, 'Anzahl-Pumpen-Select (vfd_np) vorhanden');
ok(struct.curveHosts, 'Kennlinien-Tabellen-Hosts vorhanden (vfd + ves)');
ok(struct.delBtns >= 6, 'Zusatzzeilen mit ✕-Löschen: ' + struct.delBtns);
ok(struct.freeName, 'Freitext-Beschrieb der Dauerverbraucher-Zeile (vfd_qdvN1)');
ok(struct.inres >= 2, 'Inline-Zwischenergebnisse in den Schritten: ' + struct.inres);

// ---- Berechnung füllen → Ergebnis, Mirror, Kennlinien-Tabelle, Schema
await page.evaluate(() => {
  const set = (id, v) => { const el = document.getElementById(id); el.value = v; };
  set('vfd_kat', '1');
  set('vfd_LU', '125');
  set('vfd_pv', '0.5'); set('vfd_pF', '1.0'); set('vfd_h', '10');
  set('vfd_pDl', '1.5'); set('vfd_pDs', '0'); set('vfd_pU', '0.5');
  calcVFD();
});
await page.waitForTimeout(200);

const res = await page.evaluate(() => ({
  vz: document.getElementById('vfd_out_vz').textContent,
  h1: document.getElementById('vfd_out_H1').textContent,
  h2: document.getElementById('vfd_out_H2').textContent,
  mirrorVz: document.querySelector('[data-demirror="vfd_out_vz"]')?.textContent,
  mirrorPn: document.querySelector('[data-demirror="vfd_out_pN"]')?.textContent,
  tbl: document.getElementById('curveTblVfd').innerHTML,
  tblCells: document.querySelectorAll('#curveTblVfd td').length
}));
ok(/^\d+\.\d{2}$/.test(res.vz), 'VZ mit 2 Dezimalstellen: ' + res.vz);
ok(/^\d+\.\d{2}$/.test(res.h1), 'H1 mit 2 Dezimalstellen: ' + res.h1);
ok(/^\d+\.\d{2}$/.test(res.h2), 'H2 mit 2 Dezimalstellen: ' + res.h2);
ok(res.mirrorVz === res.vz, 'Zwischenergebnis (Mirror) VZ = Ergebnis: ' + res.mirrorVz);
ok(!!res.mirrorPn && res.mirrorPn !== '–', 'Mirror pN gefüllt: ' + res.mirrorPn);
ok(res.tblCells >= 10 && res.tbl.includes('Q [l/s]'), 'Kennlinien-Wertetabelle gefüllt (' + res.tblCells + ' Zellen, l/s + bar)');
ok(res.tbl.includes('p<sub>mano</sub> [bar]'), 'Tabelle zeigt p_mano in bar');

// ---- Schema: default 2 Pumpen + RV-Dreiecke + Expansionsgefäss + Steigleitung nach oben
const schema1 = await page.evaluate(() => {
  const svg = document.querySelector('#deSchemaVfd svg');
  const html = svg ? svg.innerHTML : '';
  const pumps = (html.match(/stroke="#1d4ed8" stroke-width="2\.5"/g) || []).length;
  return {
    has: !!svg, pumps,
    exp: html.includes('Expansionsgefäss'),
    label: (html.match(/Druckerhöhungsanlage · (\d) Pumpen?/) || [])[1],
    rv: svg.querySelectorAll('path[fill="#0f172a"]').length,
    downLeg: html.includes('x1="560" y1="284" x2="560" y2="356"'),
    upLeg: /x1="676" y1="284" x2="676" y2="\d/.test(html),
    raster28: html.includes('+2,8 m') || html.includes('+2,8'),
    diagLeader: /line x1="(\d+(?:\.\d+)?)" y1="200" x2="(?!\1")/.test(html)
  };
});
ok(schema1.has, 'VFD-Schema gezeichnet');
// Feedback 01.08.2026 (Sandro): Standard ist EINE Pumpe — vorher 2.
ok(schema1.pumps === 1, 'Default 1 Pumpe (Kreise): ' + schema1.pumps);
ok(schema1.label === '1', 'Beschriftung «· 1 Pumpe»: ' + schema1.label);
ok(schema1.exp, 'Expansionsgefäss dargestellt');
ok(schema1.rv >= 1, 'Rückflussverhinderer-Dreiecke (gefüllt): ' + schema1.rv);
ok(!schema1.downLeg && schema1.upLeg, 'Verteilung geht NACH OBEN (kein Boden-Umweg)');
ok(schema1.raster28, 'Geschosse im 2.8-m-Raster beschriftet');

// ---- np-Wahl: 3 Pumpen
await page.evaluate(() => { document.getElementById('vfd_np').value = '3'; calcVFD(); });
await page.waitForTimeout(150);
const schema3 = await page.evaluate(() => {
  const html = document.querySelector('#deSchemaVfd svg').innerHTML;
  return {
    pumps: (html.match(/stroke="#1d4ed8" stroke-width="2\.5"/g) || []).length,
    label: (html.match(/Druckerhöhungsanlage · (\d) Pumpen?/) || [])[1],
    // Feedback 03.08.2026: das «~f»-Badge heisst jetzt «FU» (Frequenzumrichter)
    fBadges: (html.match(/>FU</g) || []).length
  };
});
ok(schema3.pumps === 3 && schema3.label === '3', 'np-Wahl 3 → 3 Pumpen im Schema');
ok(schema3.fBadges === 3, 'Jede Pumpe mit FU-Kästchen: ' + schema3.fBadges);

/* ---- Gerade Bezugslinien: keine SCHRÄGEN Linien im Schema. Senkrecht
   (x1==x2) war bis 01.08.2026 die einzige Form; seit dem Δh-Chip rechts im
   Gebäude (Feedback 03.08.2026 «Beschriftung weiter nach rechts schieben»)
   gibt es zusätzlich eine waagrechte Leaderlinie (y1==y2) — beides ist
   orthogonal, verboten bleibt allein die Schräge. */
const straight = await page.evaluate(() => {
  const svg = document.querySelector('#deSchemaVfd svg');
  const bad = [];
  svg.querySelectorAll('line[stroke-dasharray="3 3"]').forEach(l => {
    const senkrecht = l.getAttribute('x1') === l.getAttribute('x2');
    const waagrecht = l.getAttribute('y1') === l.getAttribute('y2');
    if (!senkrecht && !waagrecht) bad.push(l.outerHTML.slice(0, 90));
  });
  return bad;
});
ok(straight.length === 0, 'Alle Bezugslinien senkrecht/gerade' + (straight.length ? ' — schräg: ' + straight[0] : ''));

// ---- Zusatzzeile: hinzufügen, füllen, löschen
await page.evaluate(() => { _deAddRow_vfd_qdv(); });
const rowShown = await page.evaluate(() => {
  const r = document.querySelector('[data-x="vfd_qdv2"]');
  return r && r.style.display !== 'none';
});
ok(rowShown, 'Zusatzzeile qdv2 eingeblendet');
await page.evaluate(() => {
  document.getElementById('vfd_qdvN2').value = 'Bewässerung';
  document.getElementById('vfd_qdv2').value = '0.5';
  calcVFD();
});
const vzMit = await page.evaluate(() => document.getElementById('vfd_out_vz').textContent);
await page.evaluate(() => { _deDelRow(document.querySelector('[data-x="vfd_qdv2"] .fg-del'), 'vfd'); });
const after = await page.evaluate(() => ({
  vz: document.getElementById('vfd_out_vz').textContent,
  hidden: document.querySelector('[data-x="vfd_qdv2"]').style.display === 'none',
  cleared: document.getElementById('vfd_qdv2').value === '' && document.getElementById('vfd_qdvN2').value === ''
}));
ok(parseFloat(vzMit) > parseFloat(after.vz), 'Zusatz-Volumenstrom zählte (' + vzMit + ' → ' + after.vz + ')');
ok(after.hidden && after.cleared, '✕ löscht Zeile (ausgeblendet + geleert)');

// ---- Fold: Karte zuklappen → localStorage, aufklappen
const foldRes = await page.evaluate(() => {
  const card = document.querySelector('#tabVFD .g-card');
  const hd = card.querySelector('.g-card-hd');
  hd.click();
  const closed = card.classList.contains('de-zu');
  const st = JSON.parse(localStorage.getItem('gema_de_fold_v1') || '{}');
  hd.click();
  return { closed, stored: Object.keys(st).length === 1, reopened: !card.classList.contains('de-zu') };
});
ok(foldRes.closed && foldRes.stored && foldRes.reopened, 'Fold: zu → localStorage → wieder offen');

// ---- Klick auf np-Select im Kopf klappt NICHT
const selNoFold = await page.evaluate(() => {
  const card = document.getElementById('vfd_np').closest('.g-card');
  document.getElementById('vfd_np').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return !card.classList.contains('de-zu');
});
ok(selNoFold, 'Klick auf Bedienelement im Kopf klappt nicht zu');

// ---- Vessel-Tab: Struktur + Rechnung + Tabelle + RV im Schema
await page.evaluate(() => {
  document.querySelector('[data-tab="tabVessel"]').click();
  const set = (id, v) => { document.getElementById(id).value = v; };
  set('ves_kat', '1'); set('ves_LU', '100');
  set('ves_pv', '3'); set('ves_pF', '1'); set('ves_h', '12');
  set('ves_pDl', '0.5'); set('ves_pDs', '0'); set('ves_pSi', '0.5'); set('ves_pS', '1');
  set('ves_np', '2'); set('ves_n', '30'); set('ves_VBsel', '300');
  calcVes();
});
await page.waitForTimeout(200);
const ves = await page.evaluate(() => {
  const html = document.querySelector('#deSchemaVes svg').innerHTML;
  return {
    vz: document.getElementById('ves_out_vz').textContent,
    k: document.getElementById('ves_out_k').textContent,
    tblCells: document.querySelectorAll('#curveTblVes td').length,
    rv: document.querySelectorAll('#deSchemaVes svg path[fill="#0f172a"]').length,
    pumps: (html.match(/stroke="#1d4ed8" stroke-width="2\.5"/g) || []).length,
    upLeg: /x1="676" y1="284" x2="676" y2="\d/.test(html),
    kessel: html.includes('Windkessel'),
    diagBad: [...document.querySelectorAll('#deSchemaVes svg line[stroke-dasharray="3 3"]')]
      .filter(l => l.getAttribute('x1') !== l.getAttribute('x2') && l.getAttribute('y1') !== l.getAttribute('y2')).length
  };
});
ok(/^\d+\.\d{2}$/.test(ves.vz) && /^\d+\.\d{2}$/.test(ves.k), 'Vessel: VZ/K mit 2 Dezimalstellen: ' + ves.vz + ' / ' + ves.k);
ok(ves.tblCells >= 10, 'Vessel-Kennlinien-Tabelle gefüllt: ' + ves.tblCells + ' Zellen');
ok(ves.pumps === 2 && ves.rv === 2, 'Vessel: 2 Pumpen + 2 RV-Dreiecke');
ok(ves.upLeg && ves.kessel, 'Vessel: Steigleitung nach oben + Windkessel');
ok(ves.diagBad === 0, 'Vessel: alle Bezugslinien gerade');

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ': ' + errors[0] : ''));

// ============================================================
// Teil 2 — Osmose (sa_osmose.html): 24-h-Tabelle mit «Zeit»-Kopf +
// zweizeiligen 00.00–01.00-Fenstern OHNE Schiebe-Balken, Tank-Simulation
// breiter mit einzeiliger Verbraucher-Beschriftung + gestaffelten
// Marker-Labels bei kleinen Werten, Sektionen einklappbar.
// ============================================================
console.log('\n— Osmose —');
const { page: op } = await newPage(browser, seed(['role_planer']));
const oErr = [];
op.on('pageerror', e => oErr.push(String(e)));
await op.goto(BASE + '/sa_osmose.html', { waitUntil: 'domcontentloaded' });
await op.waitForTimeout(1500);
await op.evaluate(() => {
  const set = (id, v) => { const el = document.getElementById(id); if (el){ el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  set('c_flow_0', '250'); set('c_hours_0', '8');
  /* Feedback 03.08.2026: «Gewählte Tankgrösse» ist entfallen — das Profil
     öffnet sich, sobald ein Tank zwingend ist bzw. bewusst aufgeklappt wird. */
  set('anlageLeistung', '150');
  recalc();
  if (typeof otProfilOeffnen === 'function') otProfilOeffnen();
});
await op.waitForTimeout(500);
await op.evaluate(() => { document.getElementById('otOptTank').value = '2500'; otOptChanged(); });
await op.waitForTimeout(400);

const osm = await op.evaluate(() => {
  const wrap = document.querySelector('.ot-wrap');
  const zh = document.querySelectorAll('#otTbl .ot-zh');
  const svg = document.querySelector('#otSimWrap svg');
  const txts = svg ? [...svg.querySelectorAll('text')].map(t => t.textContent) : [];
  // Marker-Labels (Tankgrösse/gewählt/Reserve) — y-Abstände der Text-Labels
  const marks = svg ? [...svg.querySelectorAll('text')].filter(t => /Tankgrösse|Reserve|gewählt/.test(t.textContent))
    .map(t => parseFloat(t.getAttribute('y'))).sort((a, b) => a - b) : [];
  let minGap = 999;
  for (let i = 1; i < marks.length; i++) minGap = Math.min(minGap, marks[i] - marks[i - 1]);
  const vb = svg ? svg.getAttribute('viewBox') : '';
  const tankRect = svg ? [...svg.querySelectorAll('rect')].find(r => r.getAttribute('stroke') === '#111827') : null;
  return {
    scroll: wrap ? (wrap.scrollWidth - wrap.clientWidth) : -1,
    zhCount: zh.length, zh0: zh[0] ? zh[0].textContent : '', zh23: zh[23] ? zh[23].textContent : '',
    zhTwoLine: zh[0] ? zh[0].innerHTML.includes('<br>') : false,
    zeitLbl: !!([...document.querySelectorAll('#otTbl thead th')].find(t => t.textContent.trim() === 'Zeit')),
    // Ab Feedback 01.08.2026 steht das Stundenraster UNTER dem Verbraucher
    // (spart Breite) — die Stundenfenster-Beschriftung wanderte in die Zellen.
    hcells: document.querySelectorAll('#otTbl .ot-hrow .ot-hcell').length,
    hrows: document.querySelectorAll('#otTbl tr.ot-hrow').length,
    hkeyRows: document.querySelectorAll('#otTbl tr.ot-hrow[data-hkey]').length,
    consRows: document.querySelectorAll('#otTbl tbody tr[data-key]').length,
    hlbl0: (document.querySelector('#otTbl .ot-hrow .ot-hcell .ot-hlbl') || {}).textContent || '',
    htitle0: (document.querySelector('#otTbl .ot-hrow .ot-hcell') || {}).title || '',
    htitle23: (document.querySelectorAll('#otTbl .ot-hrow .ot-hcell')[23] || {}).title || '',
    einzeilig: txts.includes('Verbraucher') && !txts.includes('Verbrau-'),
    markCount: marks.length, minGap,
    tankW: tankRect ? parseFloat(tankRect.getAttribute('width')) : 0,
    folds: document.querySelectorAll('.g-section-hd.osm-foldhd').length
  };
});
ok(osm.scroll === 0, '24-h-Tabelle ohne horizontalen Schiebe-Balken (Overflow ' + osm.scroll + 'px)');
/* Das zweizeilige «Zeit»-Kopfband vom 31.07. ist am 01.08.2026 dem Wunsch
   «die zeitliche Verteilung soll unter dem Verbraucher dargestellt werden»
   gewichen — die Absicht (jede Stunde beschriftet, kein Schiebe-Balken)
   gilt weiter und wird hier am neuen Raster geprüft. */
ok(osm.hrows > 0 && osm.hcells === osm.hrows * 24 && osm.hkeyRows === osm.consRows,
   'je Verbraucher ein 24-Stunden-Raster unter der Zeile (' + osm.hkeyRows + '/' + osm.consRows + ' Verbraucher, ' + osm.hrows + ' Raster à 24)');
/* Feedback 03.08.2026 (Sandro) «Zeitangaben pro Feld angeben: 00.00-01.00»:
   Das Fenster steht jetzt AM FELD (zweizeilig), nicht mehr nur im Tooltip. */
ok(osm.hlbl0.replace(/\s/g, '') === '00.00–01.00', 'jede Stunde mit vollem Fenster beschriftet: ' + osm.hlbl0);
ok(osm.htitle0 === '00.00–01.00 Uhr' && osm.htitle23 === '23.00–24.00 Uhr', 'Fenster-Angabe zusätzlich als Tooltip');
ok(osm.einzeilig, 'Tank-Sim: «Verbraucher» in einer Zeile');
ok(osm.tankW >= 240, 'Tank breiter dargestellt (' + osm.tankW + 'px)');
/* Nur noch ZWEI Marker: «gewählt … l» ist mit dem Feld «Gewählte Tankgrösse»
   entfallen (Feedback 03.08.2026). Die Staffelungs-Regel gilt unverändert. */
ok(osm.markCount === 2 && osm.minGap >= 11, 'Marker-Labels gestaffelt (Tankgrösse + Reserve, minGap ' + osm.minGap.toFixed(1) + 'px)');
ok(osm.folds >= 3, 'Sektionen einklappbar: ' + osm.folds);

const osmFold = await op.evaluate(() => {
  const sec = document.querySelector('.g-section');
  const hd = sec.querySelector('.g-section-hd');
  hd.click();
  const zu = sec.classList.contains('osm-zu');
  const st = JSON.parse(localStorage.getItem('gema_osm_fold_v1') || '{}');
  hd.click();
  return { zu, stored: Object.keys(st).length === 1, offen: !sec.classList.contains('osm-zu') };
});
ok(osmFold.zu && osmFold.stored && osmFold.offen, 'Fold: zu → localStorage → wieder offen');
ok(oErr.length === 0, 'Osmose: keine JS-Fehler' + (oErr.length ? ': ' + oErr[0] : ''));

// ============================================================
// Teil 3 — h,x-Diagramm (lt_hx_diagramm.html), Feedback Christoph Grolimund:
// Klimastationen SIA 2028 (Ort setzt Höhe, Winter-/Sommer-Auslegungszustand
// einfügbar — Basel −13 °C / 90 % aus Tab. 6), Volumenstrom raus aus den
// Parametern (je Auslegung eigener V̇), Ziel-Temperatur-Modus für Erhitzer/
// Kühler (nur ZUL-t ohne Feuchte), mehrere Anlagen (244.1 / 244.2 …).
// ============================================================
console.log('\n— h,x-Diagramm —');
const { page: hp } = await newPage(browser, seed(['role_planer']));
const hErr = [];
hp.on('pageerror', e => hErr.push(String(e)));
await hp.goto(BASE + '/lt_hx_diagramm.html', { waitUntil: 'domcontentloaded' });
await hp.waitForFunction(() => typeof axRecalc === 'function' && window._hxLast && _hxLast.punkte.length >= 1, null, { timeout: 15000 });
await hp.waitForTimeout(400);

// Parameter: kein Volumenstrom mehr, Klimastation vorhanden
const hxStruct = await hp.evaluate(() => {
  const paramCard = [...document.querySelectorAll('.g-card')].find(c => {
    const h = c.querySelector('.g-card-hd h2');
    return h && /Parameter/.test(h.textContent);
  });
  return {
    vdotInParam: paramCard ? !!paramCard.querySelector('#hx_vdot') : null,
    vdotDa: !!document.getElementById('hx_vdot'),
    station: !!document.getElementById('hx_station'),
    stationOpts: (document.getElementById('hx_station') || { options: [] }).options.length,
    anlBar: !!document.getElementById('hxAnlSel'),
    zielLe: !!document.querySelector('#ax_le_mode option[value="ziel"]'),
    zielLk: !!document.querySelector('#ax_lk_mode option[value="ziel"]')
  };
});
ok(hxStruct.vdotInParam === false && hxStruct.vdotDa, 'Volumenstrom raus aus «Parameter» (lebt in der Prozess-Auswertung)');
ok(hxStruct.station && hxStruct.stationOpts >= 30, 'Klimastationen-Auswahl (SIA 2028): ' + (hxStruct.stationOpts - 1) + ' Orte');
ok(hxStruct.anlBar, 'Anlagen-Leiste vorhanden');
ok(hxStruct.zielLe && hxStruct.zielLk, 'Ziel-Temperatur-Modus in Erhitzer + Kühler');

// Station Basel: Höhe setzen verlangt eine ECHTE Benutzer-Wahl (isTrusted —
// der AutoSave-Restore darf eine manuell angepasste Höhe nie überschreiben).
// CDP-Tastatur-Eingaben sind trusted: Select fokussieren + «b» tippen wählt
// Basel-Binningen und feuert ein echtes change-Event.
await hp.focus('#hx_station');
await hp.keyboard.press('b');
await hp.waitForTimeout(250);
const basel = await hp.evaluate(() => ({
  hoehe: document.getElementById('hx_hoehe').value,
  btnW: (document.getElementById('hx_btn_winter') || {}).textContent || '',
  rowVis: (document.getElementById('hx_station_row') || {}).style.display !== 'none'
}));
ok(basel.hoehe === '316', 'Ort wählen setzt die Höhe (Basel 316 müM)');
ok(basel.rowVis && /−?-?13 °C \/ 90 %/.test(basel.btnW.replace('−', '-')), 'Winter-Button zeigt SIA-2028-Tab.-6-Wert: ' + basel.btnW);
await hp.evaluate(() => hxStationEinfuegen('winter'));
await hp.evaluate(() => hxStationEinfuegen('sommer'));
const pts = await hp.evaluate(() => hxRows.map(r => ({ n: r.name, w1: r.w1, w2: r.w2 })));
const wPt = pts.find(r => /AUL Winter Basel/.test(r.n));
const sPt = pts.find(r => /AUL Sommer Basel/.test(r.n));
ok(!!wPt && wPt.w1 === '-13' && wPt.w2 === '90', 'Winter-Auslegungszustand eingefügt (−13 °C / 90 %)');
ok(!!sPt && sPt.w1 === '32' && sPt.w2 === '40', 'Sommer-Auslegungszustand eingefügt (Richtwert 32 °C / 40 %)');

// Ziel-Temperatur-Modus: AUL Winter → 21 °C, nur t — Leistung berechnet
await hp.click('.ax-tab[data-ax="le"]');
const iW = pts.findIndex(r => /AUL Winter Basel/.test(r.n));
await hp.selectOption('#ax_le_p1', String(iW));
await hp.selectOption('#ax_le_mode', 'ziel');
await hp.evaluate(() => {
  const v = document.getElementById('ax_le_v'); v.value = '3000'; v.dispatchEvent(new Event('input', { bubbles: true }));
  const t = document.getElementById('ax_le_tziel'); t.value = '21'; t.dispatchEvent(new Event('input', { bubbles: true }));
});
await hp.waitForTimeout(150);
const ziel = await hp.evaluate(() => ({
  phi: document.getElementById('ax_out_le_phi').textContent,
  t2: document.getElementById('ax_out_le_t2').textContent,
  eng: (function(){ const s1 = _hxLast.punkte[document.getElementById('ax_le_p1').value|0]; return axRegisterZiel(s1, 21, 3000 * s1.rho, _hxLast.p).phi; })()
}));
ok(/kW/.test(ziel.phi) && Math.abs(parseFloat(ziel.phi) - ziel.eng) < 0.01, 'Ziel-t: Leistung = Engine (' + ziel.phi + ')');
ok(/21\.0 °C/.test(ziel.t2), 'Zustand nach = Ziel-Temperatur, Feuchte berechnet: ' + ziel.t2);

// Mehrere Anlagen: neue Anlage → leerer Stand, zurückwechseln → alter Stand
await hp.evaluate(() => {
  // GemaDialog.prompt stubben (Testumgebung)
  window.GemaDialog = window.GemaDialog || {};
  GemaDialog.prompt = function(){ return Promise.resolve('244.2 Abluftanlage'); };
  hxAnlNeu();
});
await hp.waitForTimeout(400);
const anl2 = await hp.evaluate(() => ({
  n: _hxAnlHooks.state().list.length,
  aktivName: _hxAnlHooks.state().list.find(a => a.id === _hxAnlHooks.state().aktiv).name,
  rows: hxRows.length,
  selOpts: document.getElementById('hxAnlSel').options.length
}));
ok(anl2.n === 2 && anl2.selOpts === 2, 'Neue Anlage angelegt (2 in der Auswahl)');
ok(anl2.aktivName === '244.2 Abluftanlage', 'Anlage trägt den Namen «244.2 Abluftanlage»');
ok(anl2.rows === 1, 'Neue Anlage startet mit leerem Stand (1 Default-Luftzustand)');
await hp.evaluate(() => { hxAnlSwitch(_hxAnlHooks.state().list[0].id); });
await hp.waitForTimeout(400);
const back = await hp.evaluate(() => ({
  rows: hxRows.map(r => r.name),
  tziel: document.getElementById('ax_le_tziel').value,
  mode: document.getElementById('ax_le_mode').value
}));
ok(back.rows.some(n => /AUL Winter Basel/.test(n)), 'Zurückwechseln stellt die Luftzustände wieder her');
ok(back.tziel === '21' && back.mode === 'ziel', 'Auslegungs-Eingaben der Anlage wiederhergestellt (Ziel-t 21, Modus ziel)');
ok(hErr.length === 0, 'h,x: keine JS-Fehler' + (hErr.length ? ': ' + hErr[0] : ''));

// ============================================================
// Teil 4 — Prüfliste (pm_pruefliste.html): Objekttyp «Take-Away» nach
// Restaurant, Standort-Freifeld pro Prüfpunkt (inkl. Bericht), Hersteller
// als Auswahl mit «andere …» → freies Textfeld, Foto-Sichern-Knopf (Share).
// ============================================================
console.log('\n— Prüfliste —');
const { page: pp } = await newPage(browser, seed(['role_planer']));
const pErr = [];
pp.on('pageerror', e => pErr.push(String(e)));
await pp.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
await pp.waitForFunction(() => window._prHooks && typeof neueBegehung === 'function', null, { timeout: 15000 }).catch(() => {});
await pp.waitForTimeout(800);

// Begehung anlegen (echte API: prNeu + prAddAnlage), Punkt auf Bauteil stellen
await pp.evaluate(() => { prNeu(); });
await pp.waitForTimeout(400);
await pp.evaluate(() => { prAddAnlage('gas'); });
await pp.waitForTimeout(300);
const prChips = await pp.evaluate(() => {
  const btns = [...document.querySelectorAll('#eObjTypChips button')].map(b => b.textContent.trim());
  const iR = btns.indexOf('Restaurant');
  return { iR, next: btns[iR + 1] || '' };
});
ok(prChips.iR >= 0 && prChips.next === 'Take-Away', 'Objekttyp-Chips: «Take-Away» direkt nach «Restaurant»');
await pp.evaluate(() => {
  const p0 = _prHooks.aktuelle().anlagen[0].punkte[0];
  p0.bauteil = true; p0.bauteilFelder = null;
  p0.fotos = [{ dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==' }];
  _prHooks.renderEditor();
});
await pp.waitForTimeout(300);
await pp.evaluate(() => { prTogglePkt(0, 0); });
await pp.waitForTimeout(200);

const prPanel = await pp.evaluate(() => {
  const more = document.querySelector('.pkt-more');
  const herSel = more ? [...more.querySelectorAll('select')].find(sel => [...sel.options].some(o => o.value === '__frei')) : null;
  const frei = document.querySelector('[id^="herFrei_"]');
  return {
    standortInp: !!(more && [...more.querySelectorAll('.fld label')].find(l => l.textContent === 'Standort')),
    herSelDa: !!herSel,
    herAndere: herSel ? [...herSel.options].some(o => o.value === '__frei' && /andere/.test(o.textContent)) : false,
    herFreiHidden: frei ? frei.style.display === 'none' : null,
    shareBtn: !!document.querySelector('.foto .fx.fshare')
  };
});
ok(prPanel.standortInp, 'Standort-Freifeld im Prüfpunkt-Panel');
ok(prPanel.herSelDa && prPanel.herAndere, 'Hersteller als Auswahl mit «andere …»');
ok(prPanel.herFreiHidden === true, 'Freitextfeld startet versteckt');
ok(prPanel.shareBtn, 'Foto-Sichern/Teilen-Knopf (📤) am Foto');

// Listenwert wählen → direkt gespeichert; dann «andere …» → Freitext
await pp.evaluate(() => {
  const herSel = [...document.querySelectorAll('.pkt-more select')].find(sel => [...sel.options].some(o => o.value === '__frei'));
  herSel.value = 'Biral'; prPktHersteller(0, 0, herSel);
});
ok((await pp.evaluate(() => _prHooks.aktuelle().anlagen[0].punkte[0].hersteller)) === 'Biral', 'Listen-Hersteller direkt gespeichert');
await pp.evaluate(() => {
  const herSel = [...document.querySelectorAll('.pkt-more select')].find(sel => [...sel.options].some(o => o.value === '__frei'));
  herSel.value = '__frei'; prPktHersteller(0, 0, herSel);
});
ok(await pp.evaluate(() => document.querySelector('[id^="herFrei_"]').style.display !== 'none'), '«andere …» blendet das Freitextfeld ein');
await pp.evaluate(() => {
  const inp = document.querySelector('[id^="herFrei_"]');
  inp.value = 'Spezialpumpen AG';
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  const st = [...document.querySelectorAll('.pkt-more .fld')].find(f => f.querySelector('label') && f.querySelector('label').textContent === 'Standort').querySelector('input');
  st.value = 'UG Waschküche';
  st.dispatchEvent(new Event('change', { bubbles: true }));
});
const prSaved = await pp.evaluate(() => {
  const p0 = _prHooks.aktuelle().anlagen[0].punkte[0];
  return { her: p0.hersteller, standort: p0.standort };
});
ok(prSaved.her === 'Spezialpumpen AG', 'freier Hersteller gespeichert');
ok(prSaved.standort === 'UG Waschküche', 'Standort gespeichert');

// Bericht: 📍-Standort-Zeile + freier Hersteller (Druckfenster-Mock)
const prBerHtml = await pp.evaluate(() => {
  let html = '';
  const _o = window.open;
  window.open = () => ({ document: { write: s => { html += s; }, close() { }, title: '' }, focus() { }, print() { }, onload: null });
  try { prBericht(); } catch (e) { html += '<!--ERR ' + e.message + '-->'; }
  window.open = _o;
  return html;
});
ok(/📍 UG Waschküche/.test(prBerHtml), 'Bericht zeigt die 📍-Standort-Zeile');
ok(/Hersteller Spezialpumpen AG/.test(prBerHtml), 'Bericht zeigt den freien Hersteller');

// Re-Render: «andere …» + Wert bleiben sichtbar
await pp.evaluate(() => { _prHooks.renderEditor(); prTogglePkt(0, 0); });
await pp.waitForTimeout(200);
const prRe = await pp.evaluate(() => {
  const herSel = [...document.querySelectorAll('.pkt-more select')].find(sel => [...sel.options].some(o => o.value === '__frei'));
  const frei = document.querySelector('[id^="herFrei_"]');
  return { sel: herSel ? herSel.value : '', frei: frei ? frei.value : '', vis: frei ? frei.style.display !== 'none' : false };
});
ok(prRe.sel === '__frei' && prRe.frei === 'Spezialpumpen AG' && prRe.vis, 'Re-Render: freier Hersteller bleibt («andere …» + Wert)');
ok(pErr.length === 0, 'Prüfliste: keine JS-Fehler' + (pErr.length ? ': ' + pErr[0] : ''));

// ============================================================
// Teil 5 — Workspace (sys_workspace.html), Bug Tim Löhrer: «5 mehr»
// klappte nicht auf (Zustand lag auf weggeworfenen DOM-Knoten).
// ============================================================
console.log('\n— Workspace —');
const wsSeed = seed(['role_planer']);
wsSeed['gema_coachmarks_done_sys_workspace_v2'] = '1';
const { page: wp } = await newPage(browser, wsSeed);
const wErr = [];
wp.on('pageerror', e => wErr.push(String(e)));
await wp.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
await wp.waitForFunction(() => window._wsHooks && typeof _wsToggleExpand === 'function', null, { timeout: 15000 });
await wp.waitForTimeout(600);
// 8 persönliche Eimer direkt in den Seiten-State (nach dem Cloud-Pull —
// ein Seed im Cache würde vom leeren bindCollection-Ergebnis überschrieben)
await wp.evaluate(() => {
  const uid = (window.GemaAuth && GemaAuth.getCurrentUser() || {}).id || 'u_test';
  const arr = _wsHooks.buckets();
  for (let i = 0; i < 8; i++) arr.push({
    id: 'fb31_b' + i, name: 'Eimer ' + (i + 1), type: 'private', ownerType: 'personal',
    createdBy: uid, accessControl: {}, members: [], modules: [], activity: [], beteiligte: [], notes: [], createdAt: 1
  });
  _wsToggleExpand('__render'); _wsToggleExpand('__render');   // rendert die Sidebar neu, Zustand neutral
});
await wp.waitForSelector('#wsPersonal .ws-more-btn', { timeout: 8000 });

const ws0 = await wp.evaluate(() => ({
  btn: (document.querySelector('#wsPersonal .ws-more-btn') || {}).textContent || '',
  eimer8: !![...document.querySelectorAll('#wsPersonal *')].find(el => el.textContent.trim() === 'Eimer 8')
}));
ok(/3 mehr/.test(ws0.btn) && !ws0.eimer8, 'Knopf zeigt «… 3 mehr» (8 Eimer, 5 sichtbar)');
await wp.click('#wsPersonal .ws-more-btn');
await wp.waitForTimeout(250);
const ws1 = await wp.evaluate(() => ({
  btn: (document.querySelector('#wsPersonal .ws-more-btn') || {}).textContent || '',
  eimer8: !![...document.querySelectorAll('#wsPersonal *')].find(el => el.textContent.trim() === 'Eimer 8')
}));
ok(ws1.eimer8, 'Klick klappt auf — alle 8 Eimer sichtbar');
ok(/weniger anzeigen/.test(ws1.btn), 'Knopf wird zu «… weniger anzeigen»');
await wp.click('#wsPersonal .ws-more-btn');
await wp.waitForTimeout(250);
const ws2 = await wp.evaluate(() => ({
  btn: (document.querySelector('#wsPersonal .ws-more-btn') || {}).textContent || '',
  eimer8: !![...document.querySelectorAll('#wsPersonal *')].find(el => el.textContent.trim() === 'Eimer 8')
}));
ok(!ws2.eimer8 && /3 mehr/.test(ws2.btn), 'Zweiter Klick klappt wieder zu');
ok(wErr.length === 0, 'Workspace: keine JS-Fehler' + (wErr.length ? ': ' + wErr[0] : ''));

// ============================================================
// Teil 6 — Apparateliste (sb_apparateliste.html), Sandro: «Die Auswahl
// der Apparate nicht in einem Pop-Up sondern im ausklappbaren Fenster».
// Der Wizard läuft als Inline-Panel in der Räume-Karte statt als Overlay.
// ============================================================
console.log('\n— Apparateliste —');
const { page: ap } = await newPage(browser, seed(['role_planer']));
const aErr = [];
ap.on('pageerror', e => aErr.push(String(e)));
await ap.goto(BASE + '/sb_apparateliste.html', { waitUntil: 'domcontentloaded' });
await ap.waitForFunction(() => typeof window.openWizardAdd === 'function' && window._apHooks, null, { timeout: 15000 });
await ap.waitForTimeout(400);

const ap0 = await ap.evaluate(() => {
  const inline = document.getElementById('wizardInline');
  const sec = inline && inline.closest('.g-section');
  return {
    keinModal: !document.getElementById('wizardModal'),
    inline: !!inline,
    inRaumKarte: !!(sec && sec.querySelector('#roomList')),
    hidden: !!(inline && inline.classList.contains('hidden'))
  };
});
ok(ap0.keinModal && ap0.inline, 'Pop-Up-Overlay entfernt, Inline-Panel #wizardInline vorhanden');
ok(ap0.inRaumKarte, 'Panel liegt IN der Räume-Karte (gleiche Karte wie #roomList)');
ok(ap0.hidden, 'Panel startet zugeklappt');

await ap.evaluate(() => window.openWizardAdd());
await ap.waitForTimeout(300);
const ap1 = await ap.evaluate(() => {
  const el = document.getElementById('wizardInline');
  const cs = getComputedStyle(el);
  return {
    sichtbar: !el.classList.contains('hidden') && cs.display !== 'none',
    position: cs.position,
    schritte: document.querySelectorAll('#stepper .step-btn').length,
    basis: (document.getElementById('modalBody').textContent || '').indexOf('Ausbaustandard') >= 0
  };
});
ok(ap1.sichtbar, '«+ Raum» klappt das Panel auf');
ok(ap1.position === 'static', 'Panel ist Teil des Seitenflusses (position:static, kein fixed-Overlay)');
ok(ap1.schritte >= 5 && ap1.basis, 'Stepper + Basis-Schritt rendern im Panel (' + ap1.schritte + ' Schritte)');

// Speichern schliesst das Panel und legt den Raum an
await ap.click('#btnSaveNow');
await ap.waitForTimeout(300);
const ap2 = await ap.evaluate(() => ({
  zu: document.getElementById('wizardInline').classList.contains('hidden'),
  rooms: window._apHooks.getState().rooms.length
}));
ok(ap2.zu && ap2.rooms === 1, 'Speichern: Panel zu, Raum in der Liste');

// ✏️ Bearbeiten öffnet dasselbe Panel wieder (Titel «Raum bearbeiten»)
await ap.evaluate(() => document.querySelector('#roomList [data-edit]').click());
await ap.waitForTimeout(300);
const ap3 = await ap.evaluate(() => ({
  auf: !document.getElementById('wizardInline').classList.contains('hidden'),
  titel: document.getElementById('wiz_title').textContent
}));
ok(ap3.auf && /bearbeiten/i.test(ap3.titel), '✏️ öffnet das Panel im Bearbeiten-Modus');

// Escape klappt zu
await ap.keyboard.press('Escape');
await ap.waitForTimeout(200);
ok(await ap.evaluate(() => document.getElementById('wizardInline').classList.contains('hidden')), 'Escape klappt das Panel zu');
ok(aErr.length === 0, 'Apparateliste: keine JS-Fehler' + (aErr.length ? ': ' + aErr[0] : ''));

await browser.close();
srv.close();
console.log(`\n${pass}/${pass + fail} Checks bestanden${fail ? ' — ' + fail + ' FEHLER' : ''}`);
process.exit(fail ? 1 : 0);
