// Playwright-Smoke: ERP — Rechtsklick-Kontextmenü (07/2026)
//   - Karten (Liste + Erfolg-Tab): statusabhängige Aktionen mit wenig Klicks —
//     Offerte: versendet/angenommen/abgelehnt, Auftrag erstellen, Duplizieren;
//     Auftrag: Akonto-/Teil-/Schlussrechnung erstellen, in Arbeit, abschliessen;
//     Rechnung: stellen, Zahlung, stornieren; immer: Öffnen + PDF; Entwurf: Löschen
//   - Positions-Editor: Kopieren/Ausschneiden/Einfügen (Session-Clipboard, auch
//     dokumentübergreifend; Regie-/OA-Verknüpfung wird beim Einfügen gekappt),
//     Duplizieren, Hoch/Runter, Löschen; read-only nur Kopieren
//   - In Eingabefeldern bleibt das native Menü (kein Custom-Menü)
// Ausführen: CHROME=<chromium> node scripts/erp_kontextmenu_test.mjs
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

const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpDocCtx === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

// ── Helpers ──
const ctxOpen = () => page.evaluate(() => !!document.getElementById('erpCtxMenu'));
const ctxItems = () => page.evaluate(() => [...document.querySelectorAll('#erpCtxMenu .ctx-i')].map(b => b.textContent.trim()));
const ctxClick = (lbl) => page.evaluate((lbl) => {
  const b = [...document.querySelectorAll('#erpCtxMenu .ctx-i')].find(x => x.textContent.indexOf(lbl) >= 0);
  if (!b) return false; b.click(); return true;
}, lbl);
const docCtx = (id) => page.evaluate((id) => {
  const card = document.querySelector('.card[oncontextmenu*="' + id + '"]');
  if (!card) return false;
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 160, clientY: 160 }));
  return true;
}, id);
const rowCtx = (i, onInput) => page.evaluate(({ i, onInput }) => {
  const tr = document.querySelectorAll('#posBody tr')[i];
  if (!tr) return false;
  const target = onInput ? tr.querySelector('input') : tr;
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
  return true;
}, { i, onInput });

console.log('■ Offerte-Karte: statusabhängiges Menü + Statuswechsel per Rechtsklick');
await page.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Sanitär EFH Muster';
  cur.kundeSnapshot = { firma: 'Muster AG', strasse: 'Weg 1', plz: '4000', ort: 'Basel' };
  cur.positionen = [
    { id: 'p1', art: 'frei', bez: 'Boiler 300 l', menge: 1, einheit: 'Stk', ep: 2400 },
    { id: 'p2', art: 'regie', bez: 'Regie Vorarbeiten', menge: 1, einheit: 'pausch.', ep: 500, regieRapportId: 'rr_1' }
  ];
  erpSaveCur(true);
  window._offId = cur.id;
  erpCloseEditor();
});
ok(await docCtx(await page.evaluate(() => window._offId)), 'Rechtsklick auf die Offerten-Karte');
ok(await ctxOpen(), 'Kontextmenü erscheint');
{
  const items = await ctxItems();
  ok(items.some(t => t.indexOf('Öffnen') >= 0) && items.some(t => t.indexOf('Als versendet markieren') >= 0), 'Entwurf: Öffnen + «Als versendet markieren»');
  ok(items.some(t => t.indexOf('PDF') >= 0) && items.some(t => t.indexOf('Löschen') >= 0), 'Entwurf: PDF + Löschen vorhanden');
  ok(!items.some(t => t.indexOf('angenommen') >= 0), 'Entwurf: noch kein «angenommen»');
}
await ctxClick('Als versendet markieren');
await page.waitForTimeout(150);
ok(await page.evaluate(() => !document.getElementById('erpCtxMenu')), 'Menü schliesst nach der Aktion');
ok(await page.evaluate(() => poolRead(DOK_POOL).find(d => d.id === window._offId).status === 'versendet'), 'Status → versendet (ohne Editor zu öffnen)');
await docCtx(await page.evaluate(() => window._offId));
{
  const items = await ctxItems();
  // «Angenommen» ist raus — aus einer versendeten Offerte direkt der Auftrag
  ok(!items.some(t => t.indexOf('angenommen') >= 0), 'Versendet: kein «Angenommen»-Schritt mehr');
  ok(items.some(t => t.indexOf('Auftrag erstellen') >= 0) && items.some(t => t.indexOf('Als abgelehnt markieren') >= 0), 'Versendet: «Auftrag erstellen» + «abgelehnt» im Menü');
  ok(!items.some(t => t.indexOf('Löschen') >= 0), 'Versendet: kein Löschen mehr (nur Entwurf)');
}

console.log('■ Karten-Menü: Auftrag erstellen → Akonto/Teil/Schluss per Rechtsklick');
await docCtx(await page.evaluate(() => window._offId));
ok((await ctxItems()).some(t => t.indexOf('Auftrag erstellen') >= 0), 'Versendet: «Auftrag erstellen» im Menü');
await ctxClick('Auftrag erstellen');
await page.waitForTimeout(300);
ok(await page.evaluate(() => cur && cur.typ === 'auftrag' && cur.verknuepfung.offerteId === window._offId), 'Auftrag erstellt + Editor offen');
await page.evaluate(() => { window._aufId = cur.id; erpCloseEditor(); });
// Offerte hat jetzt einen Auftrag → kein zweites «Auftrag erstellen»
await docCtx(await page.evaluate(() => window._offId));
ok(!(await ctxItems()).some(t => t.indexOf('Auftrag erstellen') >= 0), 'Offerte mit Auftrag: kein doppeltes «Auftrag erstellen»');
await page.evaluate(() => erpCtxClose());
// Auftrag-Karte: Rechnungs-Aktionen
await page.evaluate(() => { _tab = 'auftrag'; erpRenderAll(); });
await docCtx(await page.evaluate(() => window._aufId));
{
  const items = await ctxItems();
  ok(items.some(t => t.indexOf('Akontorechnung erstellen') >= 0) && items.some(t => t.indexOf('Teilrechnung erstellen') >= 0) && items.some(t => t.indexOf('Schlussrechnung erstellen') >= 0), 'Auftrag: Akonto + Teil + Schluss im Menü');
  ok(items.some(t => t.indexOf('In Arbeit setzen') >= 0) && items.some(t => t.indexOf('abschliessen') >= 0), 'Auftrag: Statusaktionen (in Arbeit / abschliessen)');
}
await page.evaluate(() => { window._origPrompt = GemaDialog.prompt; GemaDialog.prompt = () => Promise.resolve('30%'); });
await ctxClick('Akontorechnung erstellen');
await page.waitForTimeout(400);
ok(await page.evaluate(() => {
  GemaDialog.prompt = window._origPrompt;
  const re = poolRead(DOK_POOL).find(d => d.typ === 'rechnung' && d.rechnungsArt === 'akonto' && d.verknuepfung.auftragId === window._aufId);
  if (re) window._akId = re.id;
  return !!re;
}), 'Akontorechnung per Rechtsklick erstellt (30% via Prompt)');
await page.evaluate(() => { erpCloseEditor(); _tab = 'auftrag'; erpRenderAll(); });
await docCtx(await page.evaluate(() => window._aufId));
await ctxClick('Schlussrechnung erstellen');
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
  const re = poolRead(DOK_POOL).find(d => d.typ === 'rechnung' && d.rechnungsArt === 'schluss');
  return re && re.verknuepfung.auftragId === window._aufId;
}), 'Schlussrechnung per Rechtsklick erstellt');
await page.evaluate(() => erpCloseEditor());

console.log('■ Rechnungs-Karte: stellen per Rechtsklick');
await page.evaluate(() => { _tab = 'rechnung'; erpRenderAll(); });
await docCtx(await page.evaluate(() => window._akId));
ok((await ctxItems()).some(t => t.indexOf('Rechnung stellen') >= 0), 'Rechnung (Entwurf): «Rechnung stellen» im Menü');
await page.evaluate(() => { window._origConfirm = GemaDialog.confirm; GemaDialog.confirm = () => Promise.resolve(true); });
await ctxClick('Rechnung stellen');
await page.waitForTimeout(400);
ok(await page.evaluate(() => {
  GemaDialog.confirm = window._origConfirm;
  return poolRead(DOK_POOL).find(d => d.id === window._akId).status === 'gestellt';
}), 'Rechnung gestellt');
await page.evaluate(() => erpCloseEditor());
await docCtx(await page.evaluate(() => window._akId));
{
  const items = await ctxItems();
  ok(items.some(t => t.indexOf('Zahlung erfassen') >= 0) && items.some(t => t.indexOf('Stornieren') >= 0), 'Gestellte Rechnung: Zahlung + Stornieren im Menü');
  ok(!items.some(t => t.indexOf('Rechnung stellen') >= 0), 'Gestellt: kein «stellen» mehr');
}
await page.evaluate(() => erpCtxClose());

console.log('■ Duplizieren: Kopie als Entwurf, Verknüpfungen gekappt');
await page.evaluate(() => { _tab = 'offerte'; erpRenderAll(); });
await docCtx(await page.evaluate(() => window._offId));
await ctxClick('Duplizieren');
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
  const c = cur;
  return c && c.typ === 'offerte' && c.id !== window._offId && c.status === 'entwurf'
    && !(c.verknuepfung && c.verknuepfung.auftragId)
    && c.positionen.length === 2 && !c.positionen.some(p => p.regieRapportId);
}), 'Kopie: Entwurf, neue Nr, keine Auftrags-/Regie-Verknüpfung');
await page.evaluate(() => erpCloseEditor());

console.log('■ Positions-Menü: Kopieren / Einfügen / Ausschneiden / Verschieben');
// Frisches Entwurfs-Dokument (die Original-Offerte ist «angenommen» = read-only)
await page.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Positionen-Test';
  cur.positionen = [
    { id: 'q1', art: 'frei', bez: 'Boiler 300 l', menge: 1, einheit: 'Stk', ep: 2400 },
    { id: 'q2', art: 'regie', bez: 'Regie Vorarbeiten', menge: 1, einheit: 'pausch.', ep: 500, regieRapportId: 'rr_1' }
  ];
  erpSaveCur(true);
  window._posDocId = cur.id;
  erpOpenEditor();
});
await page.waitForTimeout(200);
ok(await rowCtx(0), 'Rechtsklick auf Positionszeile');
{
  const items = await ctxItems();
  ok(items.some(t => t.indexOf('Kopieren') >= 0) && items.some(t => t.indexOf('Ausschneiden') >= 0) && items.some(t => t.indexOf('Duplizieren') >= 0) && items.some(t => t.indexOf('Löschen') >= 0), 'Menü: Kopieren/Ausschneiden/Duplizieren/Löschen');
  ok(!items.some(t => t.indexOf('Einfügen') >= 0), 'Ohne Clipboard: kein «Einfügen»');
  ok(!items.some(t => t.indexOf('Nach oben') >= 0) && items.some(t => t.indexOf('Nach unten') >= 0), 'Erste Zeile: nur «Nach unten»');
}
await ctxClick('Kopieren');
ok(await page.evaluate(() => _posClip && _posClip.bez === 'Boiler 300 l'), 'Clipboard gefüllt');
// Einfügen unterhalb der Regie-Zeile (Index 1)
await rowCtx(1);
ok((await ctxItems()).some(t => t.indexOf('Einfügen') >= 0), 'Mit Clipboard: «Einfügen (unterhalb)»');
await ctxClick('Einfügen');
ok(await page.evaluate(() => cur.positionen.length === 3 && cur.positionen[2].bez === 'Boiler 300 l' && cur.positionen[2].id !== 'q1'), 'Eingefügt mit neuer ID');
// Regie-Zeile kopieren → beim Einfügen wird regieRapportId gekappt
await rowCtx(1);
await ctxClick('Kopieren');
await rowCtx(2);
await ctxClick('Einfügen');
ok(await page.evaluate(() => cur.positionen.length === 4 && cur.positionen[3].bez === 'Regie Vorarbeiten' && !cur.positionen[3].regieRapportId), 'Regie-Kopie ohne regieRapportId (kein Doppel-Verrechnen)');
await rowCtx(3);
await ctxClick('Nach oben verschieben');
ok(await page.evaluate(() => cur.positionen[2].bez === 'Regie Vorarbeiten' && cur.positionen[3].bez === 'Boiler 300 l'), 'Nach oben verschoben');
await rowCtx(2);
await ctxClick('Ausschneiden');
ok(await page.evaluate(() => cur.positionen.length === 3 && _posClip.bez === 'Regie Vorarbeiten'), 'Ausschneiden: Zeile weg, Clipboard gefüllt');

console.log('■ Clipboard dokumentübergreifend + Feld-Guard + read-only');
await page.evaluate(() => { erpSaveCur(true); erpOpen(window._aufId); });
await page.waitForTimeout(200);
await rowCtx(0);
await ctxClick('Einfügen');
ok(await page.evaluate(() => cur.positionen[1] && cur.positionen[1].bez === 'Regie Vorarbeiten' && !cur.positionen[1].regieRapportId), 'In anderes Dokument (Auftrag) eingefügt');
// Rechtsklick IN einem (per Doppelklick geöffneten) Eingabefeld → natives Menü bleibt
await page.evaluate(() => erpCellEdit(cur.positionen[0].id, 'bez'));
await rowCtx(0, true);
ok(!(await ctxOpen()), 'Im Eingabefeld: kein Custom-Menü (native Textbearbeitung)');
await page.evaluate(() => erpCellCommit());
// Read-only (gestellte Rechnung): nur Kopieren
await page.evaluate(() => { erpOpen(window._akId); });
await page.waitForTimeout(200);
await rowCtx(0);
{
  const items = await ctxItems();
  ok(items.length === 1 && items[0].indexOf('Kopieren') >= 0, 'Gestellte Rechnung: nur «Kopieren» (read-only, auch kein Rabatt/Zuschlag)');
}
await page.evaluate(() => erpCtxClose());

console.log('■ Rabatt/Zuschlag per Rechtsklick einfügen (% oder pauschal)');
await page.evaluate(() => { erpOpen(window._posDocId); });
await page.waitForTimeout(200);
await rowCtx(0);
{
  const items = await ctxItems();
  ok(items.some(t => t.indexOf('Rabatt in %') >= 0) && items.some(t => t.indexOf('Rabatt pauschal (CHF)') >= 0), 'Menü: «Rabatt in %» + «Rabatt pauschal (CHF)»');
  ok(items.some(t => t.indexOf('Zuschlag in %') >= 0) && items.some(t => t.indexOf('Zuschlag pauschal (CHF)') >= 0), 'Menü: «Zuschlag in %» + «Zuschlag pauschal (CHF)»');
  ok(await page.evaluate(() => [...document.querySelectorAll('#erpCtxMenu .ctx-hd')].some(h => h.textContent.indexOf('Unterhalb einfügen') >= 0)), 'Gruppen-Überschrift «Unterhalb einfügen»');
}
await ctxClick('Rabatt in %');
ok(await page.evaluate(() => {
  const p = cur.positionen[1];
  return p && p.art === 'rabatt' && p.modus === 'pct' && p.bez === 'Rabatt';
}), 'Rabatt-Zeile (%) direkt unterhalb eingefügt');
// Rabatt wirkt aufs Kapitel-Zwischentotal: 10 % auf die Position darüber (2400)
ok(await page.evaluate(() => {
  cur.positionen[1].wert = '10';
  const vorher = erpDocTotals(cur).zwischen;
  cur.positionen.splice(1, 1);
  const ohne = erpDocTotals(cur).zwischen;
  cur.positionen.splice(1, 0, { id: 'rb_t', art: 'rabatt', bez: 'Rabatt', modus: 'pct', wert: '10' });
  return Math.abs((ohne - vorher) - 240) < 0.01;
}), 'Eingefügter Rabatt rechnet aufs Zwischentotal (10 % von 2400 = 240)');
await page.evaluate(() => { cur.positionen.splice(1, 1); erpRenderPos(); });
await rowCtx(0);
await ctxClick('Zuschlag pauschal (CHF)');
ok(await page.evaluate(() => {
  const p = cur.positionen[1];
  return p && p.art === 'zuschlag' && p.modus === 'chf' && p.bez === 'Zuschlag';
}), 'Zuschlag-Zeile (pauschal CHF) eingefügt');
await page.evaluate(() => { cur.positionen.splice(1, 1); erpRenderPos(); erpSaveCur(true); });
// Auch in der Rechnung (Entwurf — User-Wunsch «bei Offerte und Rechnung»)
await page.evaluate(() => {
  const re = poolRead(DOK_POOL).find(d => d.typ === 'rechnung' && d.rechnungsArt === 'schluss');
  erpOpen(re.id);
});
await page.waitForTimeout(200);
await rowCtx(0);
ok((await ctxItems()).some(t => t.indexOf('Rabatt pauschal (CHF)') >= 0), 'Rechnung (Entwurf): Rabatt/Zuschlag-Einträge im Menü');
await ctxClick('Rabatt pauschal (CHF)');
ok(await page.evaluate(() => cur.positionen[1] && cur.positionen[1].art === 'rabatt' && cur.positionen[1].modus === 'chf'), 'Rabatt pauschal in der Rechnung eingefügt');
await page.evaluate(() => { cur.positionen.splice(1, 1); erpRenderPos(); });

console.log('■ Menü-Verhalten: Escape + Klick daneben schliessen');
await page.evaluate(() => { erpOpen(window._posDocId); });
await page.waitForTimeout(200);
await rowCtx(0);
ok(await ctxOpen(), 'Menü offen');
await page.keyboard.press('Escape');
ok(!(await ctxOpen()), 'Escape schliesst');
await rowCtx(0);
await page.evaluate(() => document.body.click());
ok(!(await ctxOpen()), 'Klick daneben schliesst');
ok(await page.evaluate(() => (document.getElementById('posHint') || {}).textContent.indexOf('Rechtsklick') >= 0), 'Hinweis «Rechtsklick: Kopieren / Einfügen / Verschieben» im Positions-Footer');

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
