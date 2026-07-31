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
ok(schema1.pumps === 2, 'Default 2 Pumpen (Kreise): ' + schema1.pumps);
ok(schema1.label === '2', 'Beschriftung «· 2 Pumpen»: ' + schema1.label);
ok(schema1.exp, 'Expansionsgefäss dargestellt');
ok(schema1.rv >= 2, 'Rückflussverhinderer-Dreiecke (gefüllt): ' + schema1.rv);
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
    fBadges: (html.match(/>~f</g) || []).length
  };
});
ok(schema3.pumps === 3 && schema3.label === '3', 'np-Wahl 3 → 3 Pumpen im Schema');
ok(schema3.fBadges === 3, 'Jede Pumpe mit ~f-Badge: ' + schema3.fBadges);

// ---- Gerade Bezugslinien: alle dashed 3-3-Linien im Schema sind senkrecht (x1==x2)
const straight = await page.evaluate(() => {
  const svg = document.querySelector('#deSchemaVfd svg');
  const bad = [];
  svg.querySelectorAll('line[stroke-dasharray="3 3"]').forEach(l => {
    if (l.getAttribute('x1') !== l.getAttribute('x2')) bad.push(l.outerHTML.slice(0, 90));
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
    diagBad: [...document.querySelectorAll('#deSchemaVes svg line[stroke-dasharray="3 3"]')].filter(l => l.getAttribute('x1') !== l.getAttribute('x2')).length
  };
});
ok(/^\d+\.\d{2}$/.test(ves.vz) && /^\d+\.\d{2}$/.test(ves.k), 'Vessel: VZ/K mit 2 Dezimalstellen: ' + ves.vz + ' / ' + ves.k);
ok(ves.tblCells >= 10, 'Vessel-Kennlinien-Tabelle gefüllt: ' + ves.tblCells + ' Zellen');
ok(ves.pumps === 2 && ves.rv === 2, 'Vessel: 2 Pumpen + 2 RV-Dreiecke');
ok(ves.upLeg && ves.kessel, 'Vessel: Steigleitung nach oben + Windkessel');
ok(ves.diagBad === 0, 'Vessel: alle Bezugslinien gerade');

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ': ' + errors[0] : ''));

await browser.close();
srv.close();
console.log(`\n${pass}/${pass + fail} Checks bestanden${fail ? ' — ' + fail + ' FEHLER' : ''}`);
process.exit(fail ? 1 : 0);
