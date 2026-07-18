// Playwright-Smoke: ERP — BKP-Titel in Offerten (07/2026)
//   - gema_bkp_katalog.js: kompletter Standard-BKP als GemaBKP (flat/level/byId)
//   - BKP-Titel-Werkzeug in der Seitenleiste (kein Modal): Baum bis 2-stellig
//     zugeklappt (Aufklapp-Zustand gespeichert), Suche = flache Trefferliste,
//     Mehrfachauswahl → Einfügen als Titelzeilen in Baumreihenfolge (2 < 25 < …)
//   - Titelzeilen im Editor: BKP-Nr als Anzeige-Zelle (Doppelklick bearbeitbar)
//     + Einrückung nach Ebene, Nummer und Text bleiben frei anpassbar
//   - PDF: BKP-Nummer als Kapitel-Label (eingerückt), Zusammenfassung mit
//     Teilbaum-Rollup (25 = Σ 251…), Buchstaben-Kapitel ohne BKP unverändert
//   - Vorlagen behalten die BKP-Struktur
// Ausführen: CHROME=<chromium> node scripts/erp_bkp_titel_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

console.log('■ Boot + Katalog');
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof GemaBKP !== 'undefined', null, { timeout: 12000 });
await page.waitForTimeout(400);

ok(await page.evaluate(() => GemaBKP.flat().length > 300), 'Kompletter BKP-Katalog geladen (' + await page.evaluate(() => GemaBKP.flat().length) + ' Einträge)');
ok(await page.evaluate(() => GemaBKP.level('2') === 0 && GemaBKP.level('25') === 1 && GemaBKP.level('254') === 2 && GemaBKP.level('254.0') === 3), 'Ebenen: 2→0, 25→1, 254→2, 254.0→3');
ok(await page.evaluate(() => GemaBKP.byId('254').titel === 'Sanitärleitungen' && GemaBKP.byId('25').titel === 'Sanitäranlagen'), 'byId liefert die Standard-Titel');

console.log('■ Seitenleiste: Baum (bis 2-stellig zugeklappt), Suche, Einfügen in Baumreihenfolge');
await page.evaluate(() => { localStorage.removeItem('gema_erp_side_v1'); erpNeu('offerte'); cur.titel = 'Testofferte'; erpBkpOpen(); });
ok(await page.evaluate(() => _sideTool === 'bkp' && !!document.getElementById('bkpListe')), 'BKP-Werkzeug öffnet in der Seitenleiste (kein Modal)');
ok(await page.evaluate(() => document.querySelectorAll('#bkpListe .bkp-node').length > 300), 'Baum enthält den ganzen Katalog');
{
  // Sichtbarkeit: ebene 0 (2) + ebene 1 (25) offen, ebene 2 (254) zugeklappt
  const vis = await page.evaluate(() => {
    const rowVis = id => { const n = document.querySelector('.bkp-node[data-id="' + id + '"]'); const r = n && n.querySelector(':scope > .bkp-row'); return !!(r && r.offsetHeight > 0); };
    return { e0: rowVis('2'), e1: rowVis('25'), e2: rowVis('254') };
  });
  ok(vis.e0 && vis.e1 && !vis.e2, 'Bis 2-stellig aufgeklappt: 2 + 25 sichtbar, 254 zugeklappt');
}
await page.evaluate(() => erpBkpNodeToggle(null, '25'));
ok(await page.evaluate(() => { const n = document.querySelector('.bkp-node[data-id="254"]'); const r = n && n.querySelector(':scope > .bkp-row'); return !!(r && r.offsetHeight > 0); }), '254 nach Aufklappen von 25 sichtbar');
// Aufklapp-Zustand ist gespeichert (Neu-Rendern behält 25 offen)
await page.evaluate(() => erpBkpRenderList());
ok(await page.evaluate(() => { const n = document.querySelector('.bkp-node[data-id="254"]'); const r = n && n.querySelector(':scope > .bkp-row'); return !!(r && r.offsetHeight > 0) && document.querySelector('.bkp-node[data-id="25"]').classList.contains('open'); }), 'Aufklapp-Zustand bleibt gespeichert');
await page.evaluate(() => { document.getElementById('bkpSuche').value = 'Sanitärleitungen'; erpBkpRenderList(); });
ok(await page.evaluate(() => {
  const items = [...document.querySelectorAll('#bkpListe .bkp-chk')].map(c => c.dataset.bkp);
  return items.indexOf('254') >= 0 && items.length < 10;
}), 'Suche = flache Trefferliste (Text «Sanitärleitungen» → 254)');
await page.evaluate(() => { document.getElementById('bkpSuche').value = ''; erpBkpRenderList(); });
// bewusst in "falscher" Klick-Reihenfolge wählen → Einfügen sortiert baumkonform
await page.evaluate(() => {
  ['254.0', '2', '254', '25'].forEach(id => {
    const cb = [...document.querySelectorAll('#bkpListe .bkp-chk')].find(c => c.dataset.bkp === id);
    cb.click();
  });
});
ok(await page.evaluate(() => document.getElementById('bkpInsBtn').textContent.indexOf('4 Titel') >= 0 && !document.getElementById('bkpInsBtn').disabled), 'Zähler-Button: «＋ 4 Titel einfügen»');
await page.evaluate(() => erpBkpInsert());
{
  const titel = await page.evaluate(() => cur.positionen.filter(p => p.art === 'titel').map(p => p.bkp + '|' + p.bez));
  ok(titel.join(';') === '2|Gebäude;25|Sanitäranlagen;254|Sanitärleitungen;254.0|Kalt- und Warmwasser', 'Eingefügt in Baumreihenfolge mit Standard-Texten');
  ok(await page.evaluate(() => Object.keys(_bkpSel).length === 0), 'Auswahl nach dem Einfügen zurückgesetzt');
}

console.log('■ Editor: Einrückung + Nummer/Text als Anzeige-Zellen (Doppelklick bearbeitbar)');
{
  const row = await page.evaluate(() => {
    const trs = [...document.querySelectorAll('#posBody tr.titel')];
    return trs.map(tr => {
      const div = tr.querySelector('td div');
      const nrCell = div.querySelector('.pcell.bkp');
      return { pad: div.style.paddingLeft, nr: nrCell ? nrCell.textContent.trim() : '' };
    });
  });
  ok(row.length === 4 && row[0].pad === '0px' && row[1].pad === '20px' && row[2].pad === '40px' && row[3].pad === '60px', 'Titelzeilen eingerückt nach Ebene (0/20/40/60px)');
  ok(row[3].nr === '254.0', 'BKP-Nr-Zelle vorbefüllt');
}
// eigene Nummer + eigener Text
await page.evaluate(() => {
  const i = cur.positionen.findIndex(p => p.bkp === '254.0');
  cur.positionen[i].bkp = '254.9';
  cur.positionen[i].bez = 'Eigene Unterkategorie';
  erpRenderPos();
});
ok(await page.evaluate(() => {
  const tr = [...document.querySelectorAll('#posBody tr.titel')][3];
  const div = tr.querySelector('td div');
  const nr = div.querySelector('.pcell.bkp').textContent.trim();
  const bez = div.querySelector('.pcell.titeltxt').textContent.trim();
  return nr === '254.9' && bez === 'Eigene Unterkategorie' && div.style.paddingLeft === '60px';
}), 'Eigene Nummer + Text anpassbar (Einrückung folgt der Nummer)');

console.log('■ PDF: BKP-Kapitel + Zusammenfassungs-Rollup');
// Positionen: 200 CHF unter 254, 100 CHF unter 254.9; dazu Buchstaben-Kapitel ohne BKP mit 50 CHF
await page.evaluate(() => {
  const at = bkp => cur.positionen.findIndex(p => p.bkp === bkp);
  cur.positionen.splice(at('254') + 1, 0, { id: 'p1', art: 'frei', bez: 'Leitungen EG', menge: 2, einheit: 'h', ep: 100 });
  cur.positionen.splice(at('254.9') + 1, 0, { id: 'p2', art: 'frei', bez: 'KW-Verteiler', menge: 1, einheit: 'Stk', ep: 100 });
  cur.positionen.push({ id: 't9', art: 'titel', bez: 'Diverses' });
  cur.positionen.push({ id: 'p3', art: 'frei', bez: 'Kleinmaterial', menge: 1, einheit: 'pausch.', ep: 50 });
  window._pdfHtml = '';
  const origOpen = window.open;
  window.open = function () {
    return { document: { write: s => { window._pdfHtml += s; }, close: () => {} }, close: () => {} };
  };
  erpPdf();
  window.open = origOpen;
});
{
  const html = await page.evaluate(() => window._pdfHtml);
  ok(html.indexOf('<td class="grpltr">254</td>') >= 0 && html.indexOf('<td class="grpltr">254.9</td>') >= 0, 'Positionsteil: BKP-Nummern als Kapitel-Label');
  ok(html.indexOf('padding-left:12mm') >= 0 && html.indexOf('padding-left:17mm') >= 0, 'Kapitel-Titel im PDF eingerückt (Ebene 2/3)');
  ok(html.indexOf('<td class="grpltr">A</td>') >= 0, 'Kapitel ohne BKP behält den Buchstaben (A)');
  // Rollup: 254.9=100 · 254=200+100=300 · 25=300 · 2=300 · A(Diverses)=50
  const zus = html.slice(html.indexOf('Zusammenfassung'));
  const sumOf = lbl => {
    const i = zus.indexOf('<td class="grpltr">' + lbl + '</td>');
    if (i < 0) return null;
    const m = zus.slice(i).match(/<td class="num">([\d'.,]+)<\/td>/);
    return m ? m[1] : null;
  };
  ok(sumOf('254.9') === '100.00', 'Zusammenfassung: 254.9 = 100.00 (Direktsumme)');
  ok(sumOf('254') === '300.00', 'Zusammenfassung: 254 = 300.00 (Rollup inkl. 254.9)');
  ok(sumOf('25') === '300.00' && sumOf('2') === '300.00', 'Zusammenfassung: Ober-Titel 25 + 2 rollen den Teilbaum auf');
  ok(sumOf('A') === '50.00', 'Buchstaben-Kapitel bleibt Direktsumme');
  ok(html.indexOf('350.00') >= 0, 'Gesamttotal 350.00 (Positionen einfach gezählt — kein Doppelzählen)');
}

console.log('■ Vorlage behält die BKP-Struktur');
await page.evaluate(() => {
  window._origPrompt = GemaDialog.prompt;
  GemaDialog.prompt = () => Promise.resolve('BKP-Standardofferte');
  erpVorlSpeichern();
});
await page.waitForTimeout(400);
{
  const v = await page.evaluate(() => (GemaSync.getCached('gema_erp_vorl_pool_v1') || [])[0]);
  ok(v && v.positionen.some(p => p.art === 'titel' && p.bkp === '254'), 'Vorlage speichert bkp auf den Titelzeilen');
  await page.evaluate(() => { GemaDialog.prompt = window._origPrompt; });
}

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
