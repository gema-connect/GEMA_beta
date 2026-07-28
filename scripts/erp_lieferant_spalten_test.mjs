// ERP — Feedback 28.07.2026 (2 Punkte)
//  A) IGH-Lieferantenkatalog: im «Lieferant hinterlegen»-Dialog nach Firma /
//     Sortiment / ID suchen, Klick übernimmt die id_anbieter (kein Nachschlagen
//     auf dataselect.ch mehr). Bereits hinterlegte sind markiert.
//  B) Spalten im Dokument (Positionstabelle) konfigurierbar — Editor UND Druck,
//     Firmen-Standard in den ⚙️-Einstellungen, pro Dokument übersteuerbar.
//
// Ausführen: CHROME=<chromium> node scripts/erp_lieferant_spalten_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const DOC = {
  id: 'd1', typ: 'offerte', nr: 'OF-2026-001', orgId: 'org_test', status: 'entwurf', datum: '2026-07-28',
  titel: 'Badumbau', mwstPct: 8.1, rabattPct: 0, schluss: [], zahlungen: [],
  kundeSnapshot: { firma: 'Meier AG', ort: 'Basel' },
  sachbearbeiter: { userId: 'u_test', name: 'Test User' },
  positionen: [
    { id: 't1', art: 'titel', bkp: '254', bez: 'Sanitärapparate' },
    { id: 'p1', art: 'frei', bez: 'Waschtisch', menge: 2, einheit: 'Stk', ep: 450 },
    { id: 'p2', art: 'frei', bez: 'Montage', menge: 4, einheit: 'Std', ep: 95, rabattPct: 10 },
    { id: 'x1', art: 'text', bez: 'Alle Masse vor Ort prüfen.' },
    { id: 'r1', art: 'rabatt', bez: 'Aktionsrabatt', modus: 'pct', wert: 5 }
  ]
};

function ls(extra) {
  const s = seed(['role_planer']);
  return Object.assign(s, { gema_erp_dok_pool_v1: [DOC], gema_coachmarks_done_pm_erp: '1' }, extra || {});
}
async function erpSeite(browser, seedObj) {
  const { ctx, page } = await newPage(browser, seedObj);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpRenderPos === 'function' && typeof erpPosColsFor === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  await page.evaluate(d => { localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([d])); erpRenderAll(); }, DOC);
  await page.waitForTimeout(250);
  return { ctx, page, errs };
}
const kopf = page => page.evaluate(() => Array.from(document.querySelectorAll('#posHead th')).map(t => t.textContent.trim()));

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* ════════ A · IGH-Lieferantenkatalog ════════ */
console.log('■ A · Lieferant suchen statt ID nachschlagen');
{
  const { ctx, page, errs } = await erpSeite(browser, ls());

  const katOk = await page.evaluate(() => ({
    n: GemaDataSelect.KATALOG.length,
    nuss: GemaDataSelect.katalog('nussbaum').map(m => m.id + '|' + m.name),
    badm: GemaDataSelect.katalog('badmöbel').map(m => m.id).sort(),
    byId: (GemaDataSelect.katalogById('1910') || {}).name,
    dopId: (function () { const s = {}, d = []; GemaDataSelect.KATALOG.forEach(m => { if (s[m.id]) d.push(m.id); s[m.id] = 1; }); return d; })(),
    dopName: (function () { const s = {}, d = []; GemaDataSelect.KATALOG.forEach(m => { const k = m.name.toLowerCase(); if (s[k]) d.push(m.name); s[k] = 1; }); return d; })(),
    krumm: GemaDataSelect.KATALOG.filter(m => !/^\d+$/.test(m.id)).map(m => m.name)
  }));
  ok(katOk.n >= 90, 'Katalog trägt ' + katOk.n + ' IGH-Mitglieder');
  ok(katOk.nuss.length === 1 && katOk.nuss[0] === '2700|R. Nussbaum AG', 'Suche «nussbaum» → 2700 R. Nussbaum AG');
  ok(katOk.badm.length >= 2, 'Suche nach Sortiment «Badmöbel» findet ' + katOk.badm.length + ' Firmen');
  ok(katOk.byId === 'Georg Fischer JRG AG' || /Georg Fischer/.test(katOk.byId || ''), 'katalogById(1910) → ' + katOk.byId);
  ok(katOk.dopId.length === 0, 'keine doppelte id_anbieter');
  ok(katOk.dopName.length === 0, 'keine Firma zweimal');
  ok(katOk.krumm.length === 0, 'alle IDs rein numerisch');

  // Dialog öffnen (Sidebar → Kataloge → ＋ Lieferant hinzufügen)
  await page.evaluate(() => erpDsAddAnbieter());
  await page.waitForTimeout(150);
  ok(await page.locator('#erpAnbModal.open').count() === 1, 'Dialog «Lieferant hinterlegen» offen');
  ok(await page.locator('#anb_such').count() === 1, 'Suchfeld vorhanden');

  await page.fill('#anb_such', 'nussbaum');
  await page.evaluate(() => erpAnbSuche(document.getElementById('anb_such').value));
  await page.waitForTimeout(120);
  const treffer = await page.locator('#anbListe .anb-item').count();
  ok(treffer === 1, 'Suche im Dialog: genau 1 Treffer');
  ok((await page.locator('#anbListe .anb-id').first().textContent()).indexOf('2700') >= 0, 'Treffer zeigt die ID 2700');

  await page.click('#anbListe .anb-item');
  await page.waitForTimeout(250);
  const gespeichert = await page.evaluate(() => GemaDataSelect.anbieter().map(a => a.id + '|' + a.name));
  ok(gespeichert.some(x => x.indexOf('2700|R. Nussbaum AG') === 0), 'Klick übernimmt Name + ID und speichert: ' + gespeichert.join(', '));
  ok(await page.locator('#erpAnbModal.open').count() === 0, 'Dialog schliesst nach dem Speichern');

  // Zweiter Aufruf: bereits hinterlegter Lieferant ist markiert und nicht klickbar
  await page.evaluate(() => erpDsAddAnbieter());
  await page.fill('#anb_such', 'nussbaum');
  await page.evaluate(() => erpAnbSuche('nussbaum'));
  await page.waitForTimeout(120);
  ok(await page.locator('#anbListe .anb-item.da[disabled]').count() === 1, 'bereits hinterlegter Lieferant ist markiert/gesperrt');

  // Nicht im Katalog → Hinweis, Felder bleiben von Hand nutzbar
  await page.fill('#anb_such', 'zzz-gibt-es-nicht');
  await page.evaluate(() => erpAnbSuche('zzz-gibt-es-nicht'));
  await page.waitForTimeout(120);
  ok(await page.locator('#anbListe .anb-leer').count() === 1, 'kein Treffer → erklärender Hinweis');
  await page.fill('#anb_name', 'Eigene Firma AG');
  await page.fill('#anb_id', '999999');
  await page.evaluate(() => erpAnbSave());
  await page.waitForTimeout(250);
  ok((await page.evaluate(() => GemaDataSelect.anbieter().map(a => a.id))).indexOf('999999') >= 0, 'Lieferant ausserhalb des Katalogs von Hand erfassbar');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ B · Spalten im Dokument ════════ */
console.log('■ B · Spalten in der Offerte einstellbar');
{
  const { ctx, page, errs } = await erpSeite(browser, ls());
  await page.evaluate(() => erpOpen('d1'));
  await page.waitForTimeout(400);

  ok(await page.locator('#edOv.open').count() === 1, 'Editor offen');
  const k0 = await kopf(page);
  ok(k0.indexOf('Pos.') >= 0 && k0.indexOf('Bezeichnung') >= 0 && k0.indexOf('Betrag') >= 0, 'Standard-Spalten im Kopf: ' + k0.filter(Boolean).join(' | '));
  ok(k0.indexOf('Rabatt %') >= 0, 'Rabatt-Spalte automatisch da, weil eine Position 10 % trägt');

  // laufende Positionsnummer wie im Druck
  const nrs = await page.evaluate(() => Array.from(document.querySelectorAll('#posBody tr')).map(tr => (tr.children[1] ? tr.children[1].textContent.trim() : '')));
  ok(nrs.filter(x => x === '1').length === 1 && nrs.filter(x => x === '2').length === 1, 'Positionen sind im Editor nummeriert');

  // Zellenzahl je Zeile stimmt mit dem Kopf überein (keine verschobenen Spalten)
  const konsistent = await page.evaluate(() => {
    const n = document.querySelectorAll('#posHead th').length;
    return Array.from(document.querySelectorAll('#posBody tr')).every(tr => {
      let c = 0; Array.from(tr.children).forEach(td => { c += parseInt(td.getAttribute('colspan') || '1', 10); });
      return c === n;
    });
  });
  ok(konsistent, 'jede Zeile füllt genau die Kopfzeilen-Spalten (colspan stimmt)');

  // Spalte ausblenden → Kopf und Zeilen folgen, Bezeichnung wird breiter
  const bez0 = await page.evaluate(() => erpPosBezMm(erpPosColsFor(cur)));
  await page.evaluate(() => erpPosColToggle('einheit'));
  await page.waitForTimeout(150);
  const k1 = await kopf(page);
  ok(k1.indexOf('Einheit') < 0, 'Einheit ausgeblendet');
  ok(await page.evaluate(() => (cur.posCols || []).indexOf('einheit') < 0), 'Wahl steht am Dokument (cur.posCols)');
  const bez1 = await page.evaluate(() => erpPosBezMm(erpPosColsFor(cur)));
  ok(bez1 > bez0, 'Bezeichnung wächst um die freigewordene Breite (' + bez0 + ' → ' + bez1 + ' mm)');
  ok(await page.evaluate(() => document.documentElement.style.getPropertyValue('--pos-bezw')) === bez1 + 'mm', '--pos-bezw folgt (WYSIWYG-Umbrüche)');
  const konsistent2 = await page.evaluate(() => {
    const n = document.querySelectorAll('#posHead th').length;
    return Array.from(document.querySelectorAll('#posBody tr')).every(tr => {
      let c = 0; Array.from(tr.children).forEach(td => { c += parseInt(td.getAttribute('colspan') || '1', 10); });
      return c === n;
    });
  });
  ok(konsistent2, 'Titel-/Text-/Rabattzeilen bleiben nach dem Ausblenden konsistent');

  // Bezeichnung lässt sich nicht ausblenden
  await page.evaluate(() => erpPosColToggle('bez'));
  ok((await kopf(page)).indexOf('Bezeichnung') >= 0, 'Bezeichnung ist Pflichtspalte');

  // Druck: Kopf + Zeilen folgen derselben Wahl
  const pdf = await page.evaluate(() => {
    let html = '';
    const _o = window.open;
    window.open = () => ({ document: { write: s => { html += s; }, close() { }, title: '' }, focus() { }, print() { }, onload: null });
    try { erpPdf(); } catch (e) { html += '<!--ERR ' + e.message + '-->'; }
    window.open = _o;
    return html;
  });
  ok(pdf.indexOf('>Einheit<') < 0, 'Druck zeigt die ausgeblendete Spalte nicht');
  ok(pdf.indexOf('>Bezeichnung<') > 0 && pdf.indexOf('>Betrag CHF<') > 0, 'Druck zeigt die gewählten Spalten');
  const posTbl = (pdf.match(/<table class="pos">[\s\S]*?<\/table>/) || [''])[0];
  const nTh = (posTbl.match(/<th[ >]/g) || []).length;   // «<thead» darf nicht mitzählen
  const zeilenOk = (posTbl.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []).slice(1).every(tr => {
    let c = 0; (tr.match(/<td[^>]*>/g) || []).forEach(td => { const m = td.match(/colspan="(\d+)"/); c += m ? parseInt(m[1], 10) : 1; });
    return c === nTh;
  });
  ok(nTh > 0 && zeilenOk, 'Druck-Tabelle: alle Zeilen füllen die ' + nTh + ' Spalten');

  // Firmen-Standard aus den Einstellungen
  await page.evaluate(() => { erpPosColsDocReset(); erpOpenSettings(); });
  await page.waitForTimeout(200);
  ok(await page.locator('#s_posCols .s-poscol').count() === 7, 'Einstellungen listen alle Spalten');
  ok(await page.locator('#s_posCols .s-poscol[data-col="bez"][disabled]').count() === 1, 'Bezeichnung in den Einstellungen fix angehakt');
  await page.evaluate(() => { document.querySelector('#s_posCols .s-poscol[data-col="posnr"]').checked = false; erpSetSave(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => erpPosColsOrg().indexOf('posnr') < 0), 'Firmen-Standard gespeichert (ohne Pos.-Spalte)');
  ok((await kopf(page)).indexOf('Pos.') < 0, 'offener Editor folgt dem neuen Firmen-Standard sofort');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
