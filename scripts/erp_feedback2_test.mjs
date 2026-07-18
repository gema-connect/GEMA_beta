// Playwright-Smoke: ERP-Feedback 18.07. — Grunddaten-Flow, Seitenumbruch,
// Einheiten-Mapping, Textmodus, Lieferant-Dialog, keine Artikel-Emojis,
// Ausführungs-Dialog ohne Preis, verstellbare Seitenleiste.
// Ausführen: CHROME=<chromium> node scripts/erp_feedback2_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// DataSelect mock: ein Produkt mit Ausführungen + Einheit PCE + Langtext
await ctx.route('**/api/dataselect**', route => {
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, anzahl: 3, artikel: [
    { artnr: '6130#111/1', bezeichnung: 'Duschwanne kurz/Weiss', bezeichnungLang: 'Duschwanne Kaldewei Duschplan 80x90, Stahl emailliert', preis: 100, einheit: 'PCE', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Weiss', hatBild: false, bildUrl: '' },
    { artnr: '6130#111/2', bezeichnung: 'Duschwanne kurz/Pergamon', bezeichnungLang: 'Duschwanne Kaldewei Duschplan 80x90, Stahl emailliert', preis: 110, einheit: 'PCE', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Pergamon', hatBild: false, bildUrl: '' },
    { artnr: '990.111.0', bezeichnung: 'Einzelartikel WC', bezeichnungLang: 'WC-Sitz mit Absenkautomatik, Duroplast weiss', preis: 89, einheit: 'PCE', waehrung: 'CHF', hersteller: 'Geberit', ausfuehrung: '', hatBild: false, bildUrl: '' }
  ] }) });
});

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpGrunddatenToggle === 'function', null, { timeout: 12000 });
await page.waitForTimeout(300);

console.log('■ P2 — Grunddaten bei neuer Offerte sichtbar, dann ausblendbar');
await page.evaluate(() => { erpNeu('offerte'); cur.kundeSnapshot = { firma: 'M AG' }; });
ok(await page.evaluate(() => { const s = document.getElementById('secGrund'); return s && s.style.display !== 'none'; }), 'neue Offerte: Grunddaten sichtbar');
ok(await page.evaluate(() => (document.getElementById('edFt').textContent || '').indexOf('Grunddaten ausblenden') >= 0), 'Top-Button zeigt «Grunddaten ausblenden»');
await page.evaluate(() => erpGrunddatenToggle());
ok(await page.evaluate(() => document.getElementById('secGrund').style.display === 'none'), 'nach Toggle: Grunddaten ausgeblendet');
ok(await page.evaluate(() => (document.getElementById('edFt').textContent || '').indexOf('Grunddaten anpassen') >= 0), 'Button zeigt jetzt «Grunddaten anpassen»');
await page.evaluate(() => { window._docId = cur.id; erpSaveCur(true); erpOpen(window._docId); });
ok(await page.evaluate(() => document.getElementById('secGrund').style.display === 'none'), 'bestehendes Dokument öffnet mit eingeklappten Grunddaten');

console.log('■ P8 — Ctrl+Enter fügt Seitenumbruch ein, zählt 0');
await page.evaluate(() => {
  cur.positionen = [{ id: 'a', art: 'frei', bez: 'X', menge: 1, einheit: 'Stk', ep: 100 }];
  erpOpenEditor();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
});
ok(await page.evaluate(() => cur.positionen.some(p => p.art === 'seitenumbruch')), 'Ctrl+Enter fügt art:seitenumbruch ein');
ok(await page.evaluate(() => { const t = erpDocTotals(cur); return Math.abs(t.zwischen - 100) < 1e-6; }), 'Seitenumbruch zählt 0 im Total');
ok(await page.evaluate(() => (document.getElementById('posBody').textContent || '').indexOf('Seitenumbruch') >= 0), 'Editor rendert die Seitenumbruch-Zeile');
// Review-Fix: Ctrl+Enter WÄHREND der Zellbearbeitung darf KEINEN Seitenumbruch einfügen
// (erpCellKey ruft preventDefault → defaultPrevented-Guard im Dokument-Handler greift).
await page.evaluate(() => {
  cur.positionen = [{ id: 'z', art: 'frei', bez: 'Y', menge: 1, einheit: 'Stk', ep: 50 }];
  erpOpenEditor();
  const n0 = cur.positionen.filter(p => p.art === 'seitenumbruch').length;
  window._pbBefore = n0;
  // Zelle in Bearbeitung öffnen → Input fokussiert
  erpCellEdit('z', 'bez');
});
await page.waitForTimeout(60);
await page.evaluate(() => {
  const inp = document.querySelector('#posBody [data-edit]');
  if (inp) { inp.focus(); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })); }
});
ok(await page.evaluate(() => cur.positionen.filter(p => p.art === 'seitenumbruch').length === window._pbBefore), 'Ctrl+Enter in einer Zelle fügt KEINEN Seitenumbruch ein (Feld-Editing hat Vorrang)');
// Positions-Zähler ignoriert Seitenumbruch/Rabatt/Zuschlag/Titel
ok(await page.evaluate(() => {
  cur.positionen = [{ id: '1', art: 'titel', bez: 'T' }, { id: '2', art: 'frei', bez: 'A', menge: 1, ep: 10 }, { id: '3', art: 'seitenumbruch' }, { id: '4', art: 'rabatt', bez: 'R', modus: 'pct', wert: 5 }];
  erpUpdatePosHint();
  return (document.getElementById('posHint').textContent || '').indexOf('1 Positionen') === 0;
}), 'Positions-Zähler zählt nur echte Leistungspositionen (Titel/Umbruch/Rabatt/Zuschlag ausgenommen)');

console.log('■ P1/P6/P12 — DataSelect: Einheit PCE→Stk, Textmodus, keine Emojis');
await page.evaluate(() => {
  erpSideTool('kataloge');
  document.getElementById('dsq_1900').value = 'Dusch';
  erpDsSearch('1900');
});
await page.waitForTimeout(300);
ok(await page.evaluate(() => { const r = document.getElementById('dsRes_1900'); return r && /[📦🎨]/.test(r.innerHTML) === false; }), 'P12: Trefferliste ohne Artikel-Emojis (📦/🎨)');
ok(await page.evaluate(() => document.querySelectorAll('#dsRes_1900 .side-art[data-dsgroup]').length === 1 && document.querySelectorAll('#dsRes_1900 .side-art').length === 2), 'Gruppierung: 1 Gruppe + 1 Einzelartikel');
// Einzelartikel einfügen (Lang-Modus Default) → einheit Stk, Langtext
await page.evaluate(() => {
  const single = [].find.call(document.querySelectorAll('#dsRes_1900 .side-art'), r => !r.dataset.dsgroup);
  erpArtGoEl(single);
});
await page.waitForTimeout(80);
await page.evaluate(() => { document.getElementById('eq_menge').value = '1'; erpQtyConfirm(); });
await page.waitForTimeout(80);
{
  const p = await page.evaluate(() => cur.positionen[cur.positionen.length - 1]);
  ok(p && p.einheit === 'Stk', 'P1: eingefügte IGH-Position hat Einheit «Stk» (nicht PCE)');
  ok(p && /Absenkautomatik/.test(p.bez), 'P6: Lang-Modus fügt die ausführliche Beschreibung ein');
}
// Auf Kurz umstellen, erneut einfügen → Kurzname
await page.evaluate(() => { erpDsSetTextLang('1900', 'kurz'); document.getElementById('dsq_1900').value = 'Dusch'; erpDsSearch('1900'); });
await page.waitForTimeout(250);
await page.evaluate(() => { const single = [].find.call(document.querySelectorAll('#dsRes_1900 .side-art'), r => !r.dataset.dsgroup); erpArtGoEl(single); });
await page.waitForTimeout(80);
await page.evaluate(() => { document.getElementById('eq_menge').value = '1'; erpQtyConfirm(); });
await page.waitForTimeout(80);
ok(await page.evaluate(() => { const p = cur.positionen[cur.positionen.length - 1]; return p && p.bez === 'Einzelartikel WC'; }), 'P6: Kurz-Modus fügt den Produktnamen ein');

console.log('■ P12 — Ausführungs-Dialog ohne Preis');
await page.evaluate(() => { const g = document.querySelector('#dsRes_1900 .side-art[data-dsgroup]'); erpArtGoEl(g); });
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.getElementById('erpVarModal').classList.contains('open')), 'Ausführungs-Dialog offen');
ok(await page.evaluate(() => document.querySelectorAll('#erpVarModal .ev-price').length === 0), 'kein Preis im Ausführungs-Dialog');
await page.evaluate(() => erpVarCancel());

console.log('■ P11 — Lieferant-Dialog: Name → ID automatisch');
await page.evaluate(() => erpDsAddAnbieter());
ok(await page.evaluate(() => document.getElementById('erpAnbModal').classList.contains('open')), 'Lieferant-Dialog offen (Name + ID in einem)');
ok(await page.evaluate(() => { document.getElementById('anb_name').value = 'Geberit'; erpAnbNameInput('Geberit'); return document.getElementById('anb_id').value === '1900'; }), 'bekannter Name «Geberit» füllt ID 1900 automatisch');
await page.evaluate(() => { document.getElementById('anb_name').value = 'Musterlieferant'; document.getElementById('anb_id').value = '1801'; erpAnbSave(); });
ok(await page.evaluate(() => !document.getElementById('erpAnbModal').classList.contains('open')), 'Dialog schliesst nach Hinzufügen');
ok(await page.evaluate(() => (GemaDataSelect.anbieter() || []).some(a => a.id === '1801')), 'neuer Lieferant gespeichert');

console.log('■ P10/P12 — Lieferanten-Kopf ohne ID/Emoji');
ok(await page.evaluate(() => { const hd = document.querySelector('#ighList .side-grp[data-dskey="1900"] .side-grp-hd'); return hd && hd.textContent.indexOf('(1900)') < 0 && /[🔎📦]/.test(hd.textContent) === false; }), 'Lieferanten-Kopf zeigt nur den Namen (keine ID, kein Emoji)');

console.log('■ P3 — Seitenleiste hat einen Ziehgriff, Breite persistiert');
ok(await page.evaluate(() => !!document.getElementById('edSideRs')), 'Ziehgriff #edSideRs vorhanden');
ok(await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('gema_erp_side_v1') || '{}'); st.width = 500; localStorage.setItem('gema_erp_side_v1', JSON.stringify(st)); erpSideRender(); return getComputedStyle(document.getElementById('edSide')).getPropertyValue('--erp-side-w').trim() === '500px'; }), 'gespeicherte Breite wird angewendet (--erp-side-w)');

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden');
process.exit(fail ? 1 : 0);
