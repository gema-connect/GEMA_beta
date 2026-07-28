// Playwright-Smoke: ERP-Positionseditor — Auswahl/DnD/Sperre/Schlussrabatte (07/2026)
//   - Werte/Texte: Anzeige-Zellen (.pcell), erst per Doppelklick (erpCellEdit)
//     bearbeitbar; Delete im offenen Eingabefeld löscht keine Zeilen
//   - Zeilen markieren: Klick (einzeln), Shift (Bereich), Ctrl/Cmd (mehrere);
//     Delete löscht die Auswahl (Feld-Editing hat Vorrang)
//   - Neue Position/Katalog wird bei GENAU einer Markierung darüber eingefügt,
//     bei mehreren ans Ende; Rechtsklick «Neue Position darüber/darunter»
//   - Drag&Drop verschiebt die Reihenfolge
//   - Offerte versendet = gesperrt (nicht editierbar), «🔓 Entsperren» macht
//     editierbar; «Angenommen» ist raus (Versendet → direkt Auftrag)
//   - Schlussrabatte/-zuschläge: beliebig viele, je %/CHF, aufs Gesamttotal;
//     Alt-rabattPct wird beim Öffnen in eine Schlusszeile migriert
// Ausführen: CHROME=<chromium> node scripts/erp_positionen_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };
const near = (a, b) => Math.abs(a - b) < 0.005;

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpPosSelClick === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

// Offerte mit 4 Positionen anlegen
await page.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Testofferte';
  cur.kundeSnapshot = { firma: 'Muster AG' };
  cur.positionen = [
    { id: 'p1', art: 'frei', bez: 'Pos A', menge: 1, einheit: 'Stk', ep: 100, rabattPct: '' },
    { id: 'p2', art: 'frei', bez: 'Pos B', menge: 1, einheit: 'Stk', ep: 200, rabattPct: '' },
    { id: 'p3', art: 'frei', bez: 'Pos C', menge: 1, einheit: 'Stk', ep: 300, rabattPct: '' },
    { id: 'p4', art: 'frei', bez: 'Pos D', menge: 1, einheit: 'Stk', ep: 400, rabattPct: '' }
  ];
  erpSaveCur(true);
  erpOpenEditor();
});

console.log('■ Auswahl: Einzel / Shift-Bereich / Ctrl-Toggle');
ok(await page.evaluate(() => { erpPosSelClick({ stopPropagation() {}, preventDefault() {} }, 1); return _selIds.length === 1 && _selIds[0] === 'p2'; }), 'Einzelklick markiert genau eine Zeile');
ok(await page.evaluate(() => { erpPosSelClick({ stopPropagation() {}, preventDefault() {}, shiftKey: true }, 3); return _selIds.join(',') === 'p2,p3,p4'; }), 'Shift-Klick markiert den Bereich (Anker p2 → p4)');
ok(await page.evaluate(() => { erpPosSelClick({ stopPropagation() {}, preventDefault() {}, ctrlKey: true }, 3); return _selIds.indexOf('p4') < 0 && _selIds.length === 2; }), 'Ctrl-Klick schaltet eine Zeile aus der Auswahl');
ok(await page.evaluate(() => { erpPosSelClick({ stopPropagation() {}, preventDefault() {}, ctrlKey: true }, 0); return _selIds.indexOf('p1') >= 0 && _selIds.length === 3; }), 'Ctrl-Klick fügt einzelne Zeile hinzu');
ok(await page.evaluate(() => { const html = document.getElementById('posBody').innerHTML; return (html.match(/pos-sel/g) || []).length === 3; }), 'markierte Zeilen tragen die pos-sel-Klasse (3)');
// Griff-Spalte + Delete-Hinweis
ok(await page.evaluate(() => document.querySelectorAll('#posBody .pos-grip').length === 4), 'jede Zeile hat einen ⠿-Griff');
// Werte sind Anzeige-Zellen — erst der Doppelklick öffnet ein Eingabefeld
ok(await page.evaluate(() => document.querySelectorAll('#posBody .pcell').length > 0 && document.querySelectorAll('#posBody input').length === 0), 'Positionen zeigen Anzeige-Zellen (.pcell), keine Roh-Inputs');
ok(await page.evaluate(() => { erpCellEdit(cur.positionen[0].id, 'bez'); const has = document.querySelectorAll('#posBody [data-edit]').length === 1 && !!document.querySelector('#posBody .rich-ed[contenteditable="true"]'); erpCellCommit(); return has; }), 'Doppelklick (erpCellEdit) öffnet den Rich-Editor (contenteditable), Klick woanders (erpCellCommit) schliesst');
ok(await page.evaluate(() => { erpCellEdit(cur.positionen[0].id, 'menge'); const isInp = document.querySelectorAll('#posBody input[data-edit]').length === 1; erpCellCommit(); return isInp; }), 'Zahlenfeld (Menge) öffnet weiterhin ein <input>');

console.log('■ Delete löscht die Auswahl (nicht in Feldern)');
ok(await page.evaluate(() => { erpPosSelClick({ stopPropagation() {}, preventDefault() {} }, 1); erpPosSelClick({ stopPropagation() {}, preventDefault() {}, ctrlKey: true }, 2); return _selIds.join(',') === 'p2,p3'; }), 'p2+p3 markiert');
ok(await page.evaluate(() => {
  document.body.focus();
  const ev = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
  document.dispatchEvent(ev);
  return cur.positionen.map(p => p.id).join(',') === 'p1,p4' && _selIds.length === 0;
}), 'Delete-Taste entfernt p2+p3');
// Feld-Editing hat Vorrang: Delete im offenen Bearbeitungsfeld löscht KEINE Zeilen
ok(await page.evaluate(() => {
  erpPosSelClick({ stopPropagation() {}, preventDefault() {} }, 0);
  erpCellEdit(cur.positionen[0].id, 'bez');   // Rich-Beschrieb (contenteditable) offen
  const inp = document.querySelector('#posBody [data-edit]');
  inp.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  const okk = cur.positionen.length === 2;   // nichts gelöscht (contenteditable = Feld-Editing)
  erpCellCommit();
  return okk;
}), 'Delete im Rich-Beschrieb (contenteditable) löscht keine Zeilen');

console.log('■ Einfügen über der Markierung (genau eine) / ans Ende (mehrere)');
await page.evaluate(() => { cur.positionen = [{ id: 'a', art: 'frei', bez: 'A', menge: 1, einheit: 'Stk', ep: 1 }, { id: 'b', art: 'frei', bez: 'B', menge: 1, einheit: 'Stk', ep: 1 }, { id: 'c', art: 'frei', bez: 'C', menge: 1, einheit: 'Stk', ep: 1 }]; erpPosSelReset(); erpRenderPos(); });
ok(await page.evaluate(() => { erpPosSelClick({ stopPropagation() {}, preventDefault() {} }, 1); erpPosAdd('frei'); const idx = cur.positionen.findIndex(p => p.id === 'b'); return cur.positionen[idx - 1].bez === '' && cur.positionen[idx - 1].art === 'frei'; }), 'eine Markierung → neue Position DIREKT darüber');
ok(await page.evaluate(() => {
  cur.positionen = [{ id: 'a', art: 'frei', bez: 'A', menge: 1, einheit: 'Stk', ep: 1 }, { id: 'b', art: 'frei', bez: 'B', menge: 1, einheit: 'Stk', ep: 1 }];
  _selIds = ['a', 'b']; _selAnchor = 'b';
  erpPosAdd('frei');
  return cur.positionen.length === 3 && cur.positionen[2].bez === '';   // ans Ende
}), 'mehrere Markierungen → neue Position ans Ende');
ok(await page.evaluate(() => { cur.positionen = [{ id: 'a', art: 'frei', bez: 'A', menge: 1, einheit: 'Stk', ep: 1 }]; erpPosSelReset(); erpPosAdd('frei'); return cur.positionen.length === 2; }), 'ohne Markierung → ans Ende');

console.log('■ Drag & Drop verschiebt die Reihenfolge');
// Ablage-Helfer: obere/untere Hälfte der Zielzeile entscheidet vor/dahinter.
await page.evaluate(() => {
  window.__dnd = (vonIdx, zuIdx, unten) => {
    cur.positionen = [{ id: 'x1', art: 'frei', bez: 'X1', menge: 1, einheit: 'Stk', ep: 1 },
                      { id: 'x2', art: 'frei', bez: 'X2', menge: 1, einheit: 'Stk', ep: 1 },
                      { id: 'x3', art: 'frei', bez: 'X3', menge: 1, einheit: 'Stk', ep: 1 }];
    erpRenderPos();
    const tr = document.querySelectorAll('#posBody tr')[zuIdx];
    const r = tr.getBoundingClientRect();
    const y = r.top + (unten ? r.height * 0.8 : r.height * 0.2);
    erpPosDragStart({ target: { closest: () => null }, dataTransfer: { setData() {} } }, vonIdx);
    erpPosDrop({ preventDefault() {}, clientY: y, target: { closest: () => tr } }, zuIdx);
    return cur.positionen.map(p => p.id).join(',');
  };
});
ok(await page.evaluate(() => __dnd(2, 0, false) === 'x3,x1,x2'), 'obere Hälfte von x1 → x3 davor (x3,x1,x2)');
ok(await page.evaluate(() => __dnd(2, 0, true) === 'x1,x3,x2'), 'untere Hälfte von x1 → x3 dahinter (x1,x3,x2)');
// DER Fehlerfall: bis zur LETZTEN Position ziehen — vorher kam man nur auf den vorletzten Platz
ok(await page.evaluate(() => __dnd(0, 2, true) === 'x2,x3,x1'), 'x1 auf die untere Hälfte der letzten Zeile → ans Listenende (x2,x3,x1)');
ok(await page.evaluate(() => __dnd(0, 2, false) === 'x2,x1,x3'), 'obere Hälfte der letzten Zeile → davor (x2,x1,x3)');
ok(await page.evaluate(() => {
  // Ablegen auf sich selbst ändert nichts
  return __dnd(1, 1, true) === 'x1,x2,x3';
}), 'Ablegen auf der eigenen Zeile lässt die Reihenfolge unverändert');
ok(await page.evaluate(() => {
  cur.positionen = [{ id: 'y1', art: 'frei', bez: 'Y1', menge: 1, einheit: 'Stk', ep: 1 }, { id: 'y2', art: 'frei', bez: 'Y2', menge: 1, einheit: 'Stk', ep: 1 }];
  erpRenderPos();
  const tr = document.querySelectorAll('#posBody tr')[1];
  return !!(tr.getAttribute('ondragover') && tr.getAttribute('ondrop'));
}), 'die GANZE Zeile ist Ablagefläche (nicht nur der 26-px-Griff)');

console.log('■ + Text: freie Textzeile über die ganze Breite');
ok(await page.evaluate(() => {
  cur.positionen = []; erpPosSelReset(); erpPosAdd('text'); erpRenderPos();
  const p = cur.positionen[0];
  const tr = document.querySelector('#posBody tr.postext');
  // colspan folgt seit Feedback 28.07.2026 den konfigurierten Spalten —
  // die Zeile muss die Kopfzeile exakt füllen (Bezeichnung + Quelle + Mitte)
  const td = tr && tr.querySelector('td[colspan]');
  const nTh = document.querySelectorAll('#posHead th').length;
  let n = 0; Array.prototype.forEach.call(tr.children, c => { n += parseInt(c.getAttribute('colspan') || '1', 10); });
  return p.art === 'text' && p.menge === undefined && p.ep === undefined && !!td && n === nTh;
}), 'Textzeile ohne Menge/Preis, Beschrieb über die volle Breite');
ok(await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.pos-add .btn, #edBody .btn')).map(b => b.textContent.trim());
  const iT = btns.indexOf('+ Titelzeile'), iX = btns.indexOf('+ Text');
  return iT >= 0 && iX === iT + 1;
}), '«+ Text» steht direkt neben «+ Titelzeile»');
ok(await page.evaluate(() => {
  cur.positionen = [{ id: 'a', art: 'frei', bez: 'A', menge: 1, einheit: 'Stk', ep: 100 },
                    { id: 't', art: 'text', bez: 'Hinweis' }];
  erpRenderPos();
  return document.getElementById('posHint').textContent.indexOf('1 Positionen') === 0;
}), 'Textzeile zählt nicht als Position');

console.log('■ Menge 0 → «per», kein Betrag');
ok(await page.evaluate(() => {
  cur.positionen = [{ id: 'q', art: 'frei', bez: 'Zuschlag Sonderfarbe', menge: 0, einheit: 'Stk', ep: 12.5 }];
  erpRenderPos();
  const tr = document.querySelector('#posBody tr[data-posid="q"]');
  const per = tr.querySelector('.per-tag');
  const betrag = tr.children[tr.children.length - 1].textContent.trim();
  return per && per.textContent === 'per' && betrag === '—';
}), 'Mengenspalte zeigt «per», Betragsspalte bleibt leer');
ok(await page.evaluate(() => {
  cur.positionen[0].menge = 3; erpRenderPos();
  const tr = document.querySelector('#posBody tr[data-posid="q"]');
  return !tr.querySelector('.per-tag') && /37\.50/.test(tr.children[tr.children.length - 1].textContent);
}), 'Menge wieder > 0 → normale Anzeige (37.50)');
ok(await page.evaluate(() => {
  cur.positionen[0].menge = ''; erpRenderPos();
  return !document.querySelector('#posBody tr[data-posid="q"] .per-tag');
}), 'leere Menge ist NICHT «per» (nur die echte 0)');

console.log('■ Variante per Rechtsklick');
ok(await page.evaluate(() => {
  cur.positionen = [{ id: 'v1', art: 'frei', bez: 'Standard-Armatur', menge: 1, einheit: 'Stk', ep: 100 },
                    { id: 'v2', art: 'frei', bez: 'Design-Armatur', menge: 1, einheit: 'Stk', ep: 400 }];
  erpPosSelReset(); erpRenderPos();
  let items = null; const orig = erpCtxShow; window.erpCtxShow = (e, it) => { items = it; };
  erpPosCtx({ preventDefault() {}, stopPropagation() {}, target: { tagName: 'TD' } }, 1);
  window.erpCtxShow = orig;
  const e = items.find(x => x && x.t && /Als Variante markieren/.test(x.t));
  if (!e) return false;
  e.fn();
  return cur.positionen[1].variante === true && cur.positionen[0].variante === undefined;
}), 'Rechtsklick markiert die angeklickte Position als Variante');
ok(await page.evaluate(() => {
  const tr = document.querySelector('#posBody tr[data-posid="v2"]');
  const tag = tr.querySelector('.vari-tag');
  const betrag = tr.children[tr.children.length - 1].textContent.trim();
  const st = getComputedStyle(tr.querySelector('.pcell'));
  const stTag = getComputedStyle(tag);
  return tag && tag.textContent === 'Variante' && st.fontStyle === 'italic' && stTag.fontStyle === 'normal'
      && +stTag.fontWeight >= 700 && betrag === '(400.00)';
}), '«Variante» fett+aufrecht in der ersten Zeile, Text kursiv, Betrag in Klammern');
ok(await page.evaluate(() => Math.abs(erpDocTotals(cur).zwischen - 100) < 0.005),
   'Variante fehlt im Total (nur 100.00)');
ok(await page.evaluate(() => {
  let items = null; const orig = erpCtxShow; window.erpCtxShow = (e, it) => { items = it; };
  erpPosCtx({ preventDefault() {}, stopPropagation() {}, target: { tagName: 'TD' } }, 1);
  window.erpCtxShow = orig;
  const e = items.find(x => x && x.t && /Variante aufheben/.test(x.t));
  if (!e) return false;
  e.fn();
  const tr = document.querySelector('#posBody tr[data-posid="v2"]');
  return !('variante' in cur.positionen[1]) && !tr.querySelector('.vari-tag')
      && getComputedStyle(tr.querySelector('.pcell')).fontStyle === 'normal'
      && Math.abs(erpDocTotals(cur).zwischen - 500) < 0.005;
}), 'Aufheben entfernt Marke, Kursiv und Klammern — Total wieder 500.00');
ok(await page.evaluate(() => {
  // Mehrfachauswahl: alle markierten auf einmal
  cur.positionen = ['m1', 'm2', 'm3'].map((id, i) => ({ id: id, art: 'frei', bez: id, menge: 1, einheit: 'Stk', ep: 100 }));
  erpRenderPos();
  erpPosSelClick({ shiftKey: false, ctrlKey: false, metaKey: false, stopPropagation() {} }, 1);
  erpPosSelClick({ shiftKey: false, ctrlKey: true, metaKey: false, stopPropagation() {} }, 2);
  let items = null; const orig = erpCtxShow; window.erpCtxShow = (e, it) => { items = it; };
  erpPosCtx({ preventDefault() {}, stopPropagation() {}, target: { tagName: 'TD' } }, 1);
  window.erpCtxShow = orig;
  const e = items.find(x => x && x.t && /Als Variante markieren \(2\)/.test(x.t));
  if (!e) return false;
  e.fn();
  return cur.positionen[1].variante && cur.positionen[2].variante && !cur.positionen[0].variante
      && Math.abs(erpDocTotals(cur).zwischen - 100) < 0.005;
}), 'Mehrfachauswahl: beide markierten Positionen werden Variante');
ok(await page.evaluate(() => {
  // Titel/Text/Umbruch können keine Variante sein
  cur.positionen = [{ id: 'ti', art: 'titel', bez: 'K' }, { id: 'tx', art: 'text', bez: 'T' }];
  erpPosSelReset(); erpRenderPos();
  let items = null; const orig = erpCtxShow; window.erpCtxShow = (e, it) => { items = it; };
  erpPosCtx({ preventDefault() {}, stopPropagation() {}, target: { tagName: 'TD' } }, 0);
  window.erpCtxShow = orig;
  return !items.some(x => x && x.t && /Variante/.test(x.t));
}), 'Titelzeile bietet keine Variante an');

console.log('■ Rechtsklick: neue Position darüber / darunter');
ok(await page.evaluate(() => {
  cur.positionen = [{ id: 'r1', art: 'frei', bez: 'R1', menge: 1, einheit: 'Stk', ep: 1 }];
  erpRenderPos();
  let items = null;
  const orig = erpCtxShow; window.erpCtxShow = (e, it) => { items = it; };
  erpPosCtx({ preventDefault() {}, stopPropagation() {}, target: { tagName: 'TD' } }, 0);
  window.erpCtxShow = orig;
  return items && items.some(x => x.t === 'Neue Position darüber') && items.some(x => x.t === 'Neue Position darunter');
}), 'Positions-Kontextmenü hat «Neue Position darüber/darunter»');

console.log('■ Sperre: Offerte versendet = gesperrt, entsperrbar');
await page.evaluate(() => { erpNeu('offerte'); cur.titel = 'Lock'; cur.kundeSnapshot = { firma: 'M AG' }; cur.status = 'versendet'; erpSaveCur(true); erpOpen(cur.id); });
ok(await page.evaluate(() => erpEditable() === false && erpLocked() === true), 'versendete Offerte ist gesperrt (nicht editierbar)');
ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('🔒') >= 0 && document.getElementById('edBody').innerHTML.indexOf('Entsperren') >= 0), 'Gesperrt-Banner mit Entsperren-Button');
ok(await page.evaluate(() => document.querySelectorAll('#posBody .pos-grip').length === 0), 'gesperrt → keine Griffe/Auswahl');
ok(await page.evaluate(() => { erpEntsperren(); return erpEditable() === true && cur._unlocked === true; }), 'Entsperren macht editierbar (transient)');
ok(await page.evaluate(() => { const u = cur._unlocked; erpSaveCur(true); const stored = poolRead(DOK_POOL).find(x => x.id === cur.id); return stored._unlocked === undefined && u === true; }), '_unlocked wird NICHT gespeichert (beim Öffnen wieder gesperrt)');

console.log('■ Status-Flow ohne «Angenommen»');
ok(await page.evaluate(() => {
  erpNeu('offerte'); cur.titel = 'Flow'; cur.kundeSnapshot = { firma: 'M AG' };
  cur.positionen = [{ id: 'p', art: 'frei', bez: 'x', menge: 1, einheit: 'Stk', ep: 10 }];
  cur.status = 'versendet'; erpSaveCur(true); erpOpen(cur.id);
  const ft = document.getElementById('edFt').innerHTML;
  return ft.indexOf('Auftrag erstellen') >= 0 && ft.indexOf('Angenommen') < 0;
}), 'versendete Offerte: «→ Auftrag erstellen», kein «Angenommen»');
ok(await page.evaluate(() => {
  // Stepper hat nur 2 Schritte
  return (document.querySelector('.steps') ? document.querySelectorAll('.steps .step').length : 0) === 2;
}), 'Offerte-Stepper: nur Entwurf → Versendet (2 Schritte)');

console.log('■ Schlussrabatte: beliebig viele, % + pauschal');
ok(await page.evaluate(() => {
  erpNeu('offerte'); cur.titel = 'Rabatt'; cur.kundeSnapshot = { firma: 'M AG' };
  cur.positionen = [{ id: 'p', art: 'frei', bez: 'Arbeit', menge: 1, einheit: 'pausch.', ep: 1000 }];
  cur.schluss = [];
  erpSchlussAdd('rabatt'); cur.schluss[0].wert = 10;            // 10% → −100
  erpSchlussAdd('zuschlag'); cur.schluss[1].modus = 'chf'; cur.schluss[1].wert = 50;  // +50
  const t = erpDocTotals(cur);
  return Math.abs(t.zwischen - 1000) < 0.005 && Math.abs(t.schlussTotal - (-50)) < 0.005 && Math.abs(t.netto - 950) < 0.005;
}), 'Netto = 1000 − 10% + 50 CHF = 950 (mehrere Schlusszeilen)');
ok(await page.evaluate(() => { erpRenderPos(); const sb = document.getElementById('sumBlock').innerHTML; return sb.indexOf('Schlussrabatt') >= 0 && sb.indexOf('− 100.00') >= 0 && sb.indexOf('+ 50.00') >= 0; }), 'Summenblock zeigt Schlussrabatt −100 und Zuschlag +50');

console.log('■ Migration: alter Dokument-Rabatt (rabattPct) → Schlusszeile');
ok(await page.evaluate(() => {
  const alt = { id: 'altdoc', typ: 'offerte', nr: 'OF-x', orgId: GemaAuth.getCurrentUser().orgId, status: 'entwurf', kundeSnapshot: { firma: 'Alt AG' }, positionen: [{ id: 'p', art: 'frei', bez: 'x', menge: 1, einheit: 'Stk', ep: 500 }], rabattPct: 20, mwstPct: 8.1, erstelltVon: { userId: 'u', name: 'x' } };
  poolSave(DOK_POOL, DOK_PREFIX, alt);
  erpOpen('altdoc');
  return (cur.schluss || []).length === 1 && cur.schluss[0].art === 'rabatt' && erpNum(cur.schluss[0].wert) === 20 && erpNum(cur.rabattPct) === 0
    && Math.abs(erpDocTotals(cur).netto - 400) < 0.005;   // 500 − 20%
}), 'rabattPct 20% wird zu einer Schlusszeile migriert, Netto 400');

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
