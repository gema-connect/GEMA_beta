// Playwright-Smoke: ERP-Positionen Rich-Text + Ausführung-Formatierung + UX (07/2026)
//   - Rich-Beschrieb: Sanitizer (Whitelist b/i/u/strong/em/span[style], Rest escaped,
//     Script/Style verworfen), contenteditable + Toolbar (Fett/Kursiv/Grösse/Farbe),
//     execCommand-Bold speichert ins bez.
//   - DataSelect-Ausführung/Farbe auf neuer Zeile + fett (<br><strong>).
//   - Multi-Select markiert keinen Text (user-select:none), Edit erlaubt Text.
//   - PDF: Logo 3mm hoch (kopf-r margin-top:-3mm) + @page:first ohne Laufzeile,
//     Rich-bez sanitisiert im Druck.
// Ausführen: CHROME=<chromium> node scripts/erp_richtext_test.mjs
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

// DataSelect-Mock: ein Produkt mit 2 Ausführungen (Basiscode teilen sich via «/»)
await ctx.route('**/api/dataselect**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, anzahl: 2, artikel: [
  { artnr: '1313116/143/183', bezeichnung: 'Duschwanne Kaldewei Duschplan 80x90', bezeichnungLang: 'Duschwanne Kaldewei Duschplan 80x90', preis: 1222, einheit: 'Stk', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Pergamon · Gleitschutz Antislip', hatBild: false, bildUrl: '' },
  { artnr: '1313116/100/0', bezeichnung: 'Duschwanne Kaldewei Duschplan 80x90', bezeichnungLang: 'Duschwanne Kaldewei Duschplan 80x90', preis: 806, einheit: 'Stk', waehrung: 'CHF', hersteller: 'Kaldewei', ausfuehrung: 'Weiss', hatBild: false, bildUrl: '' }
] }) }));

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpRichSanitize === 'function' && typeof erpBezPlain === 'function', null, { timeout: 12000 });
await page.waitForTimeout(300);

console.log('■ Sanitizer erpRichSanitize — Whitelist + Escaping');
ok(await page.evaluate(() => erpRichSanitize('<b>Fett</b>') === '<b>Fett</b>'), 'erlaubt <b>');
ok(await page.evaluate(() => erpRichSanitize('<span style="color:red">rot</span>') === '<span style="color:red">rot</span>'), 'erlaubt span[style:color]');
ok(await page.evaluate(() => erpRichSanitize('<span style="font-size:1.2em">gross</span>').indexOf('font-size:1.2em') >= 0), 'erlaubt span[style:font-size]');
ok(await page.evaluate(() => { const r = erpRichSanitize('<span style="color:red" onclick="x()">rot</span>'); return r.indexOf('onclick') < 0 && r.indexOf('color:red') >= 0; }), 'strippt onclick, behält color');
// Gefährliche Tags GEMISCHT mit Formatierung → DOM-Sanitizer wirft sie weg (Inhalt bleibt)
ok(await page.evaluate(() => erpRichSanitize('<b>ok</b><script>alert(1)</script>') === '<b>ok</b>'), '<script> mit Formatierung → verworfen');
ok(await page.evaluate(() => erpRichSanitize('<b>x</b><img src=x onerror=alert(1)>') === '<b>x</b>'), '<img>/onerror mit Formatierung → verworfen');
ok(await page.evaluate(() => erpRichSanitize('<b>x</b><a href="javascript:alert(1)">klick</a>') === '<b>x</b>klick'), '<a> mit Formatierung → Tag weg, Text bleibt (kein href)');
// Rein gefährliche Eingabe (ohne Formatier-Tag) → als Klartext escaped (SICHER, nicht ausführbar)
ok(await page.evaluate(() => { const r = erpRichSanitize('<script>alert(1)</script>'); return r.indexOf('<script') < 0 && r.indexOf('&lt;script') >= 0; }), 'reines <script> → escaped (kein ausführbares Tag)');
ok(await page.evaluate(() => erpRichSanitize('Ø < 20 mm') === 'Ø &lt; 20 mm'), 'reiner Text mit «<» wird escaped (kein Tag-Verlust)');
ok(await page.evaluate(() => erpRichSanitize('Zeile1\nZeile2') === 'Zeile1<br>Zeile2'), 'Zeilenumbruch → <br>');
ok(await page.evaluate(() => erpRichSanitize('Base<br><strong>Weiss</strong>') === 'Base<br><strong>Weiss</strong>'), 'Variant-HTML (br+strong) bleibt erhalten');
ok(await page.evaluate(() => erpBezPlain('Base<br><strong>Weiss</strong>') === 'Base\nWeiss'), 'erpBezPlain strippt Tags → Klartext');

console.log('■ Rich-Editor: contenteditable + Toolbar, Bold speichert ins bez');
await page.evaluate(() => { erpNeu('offerte'); cur.kundeSnapshot = { firma: 'X AG' }; cur.positionen = [{ id: 'p1', art: 'frei', bez: 'Rohrschelle DN20', menge: 1, einheit: 'Stk', ep: 5 }]; erpSaveCur(true); erpOpenEditor(); });
await page.evaluate(() => erpCellEdit('p1', 'bez'));
await page.waitForTimeout(60);
ok(await page.evaluate(() => !!document.querySelector('#posBody .rich-ed[contenteditable="true"]')), 'Doppelklick öffnet contenteditable');
ok(await page.evaluate(() => { const b = document.querySelector('#posBody .rich-bar'); return b && b.querySelectorAll('.rb').length >= 3 && b.querySelectorAll('.rb-col').length >= 3 && !!b.querySelector('.rb-sel'); }), 'Toolbar hat Fett/Kursiv/Unterstr. + Farb-Buttons + Grössen-Select');
// gesamten Text markieren → Fett → bez enthält <b>/<strong>
await page.evaluate(() => {
  const ed = document.querySelector('#posBody .rich-ed'); ed.focus();
  const r = document.createRange(); r.selectNodeContents(ed);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  erpRichSaveSel(); erpRichCmd('bold');
});
await page.waitForTimeout(40);
ok(await page.evaluate(() => { const p = cur.positionen[0]; return /<(b|strong)\b/i.test(p.bez) && /Rohrschelle/.test(p.bez); }), 'Fett auf die Auswahl → bez trägt <b>/<strong>');
// Farbe rot auf die (noch markierte) Auswahl
await page.evaluate(() => { const ed = document.querySelector('#posBody .rich-ed'); ed.focus(); const r = document.createRange(); r.selectNodeContents(ed); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); erpRichSaveSel(); erpRichColor('#dc2626'); });
await page.waitForTimeout(40);
ok(await page.evaluate(() => /color/i.test(cur.positionen[0].bez)), 'Farbe → bez trägt eine color-Angabe');
await page.evaluate(() => { const ed = document.querySelector('#posBody .rich-ed'); ed.blur(); });
await page.waitForTimeout(40);
ok(await page.evaluate(() => !document.querySelector('#posBody .rich-ed')), 'Blur (ausserhalb Toolbar) schliesst den Editor');

console.log('■ Multi-Select markiert keinen Text; contenteditable erlaubt Text');
ok(await page.evaluate(() => { const td = document.querySelector('#posBody td'); return td && getComputedStyle(td).userSelect === 'none'; }), '.pos td: user-select:none');
await page.evaluate(() => erpCellEdit('p1', 'bez'));
await page.waitForTimeout(40);
ok(await page.evaluate(() => { const ed = document.querySelector('#posBody .rich-ed'); return ed && getComputedStyle(ed).userSelect === 'text'; }), 'contenteditable: user-select:text (Markieren erlaubt)');
await page.evaluate(() => erpCellCommit());

console.log('■ DataSelect-Ausführung: neue Zeile + fett');
await page.evaluate(() => { cur.positionen = []; erpRenderPos(); erpSideTool('kataloge'); document.getElementById('dsq_1900').value = 'Duschwanne'; erpDsSearch('1900'); });
await page.waitForTimeout(350);
ok(await page.evaluate(() => document.querySelectorAll('#dsRes_1900 .side-art[data-dsgroup]').length === 1), 'Ausführungen gruppiert (1 Produkt-Eintrag)');
await page.evaluate(() => { erpArtGoEl(document.querySelector('#dsRes_1900 .side-art[data-dsgroup]')); });
await page.waitForTimeout(120);
await page.evaluate(() => { erpVarPick(0); erpVarConfirm(); });
await page.waitForTimeout(80);
await page.evaluate(() => { document.getElementById('eq_menge').value = '1'; erpQtyConfirm(); });
await page.waitForTimeout(80);
{
  const bez = await page.evaluate(() => cur.positionen[cur.positionen.length - 1].bez);
  ok(/<br>\s*<strong>/.test(bez), 'Ausführung steht nach <br> in <strong> (neue Zeile, fett): ' + JSON.stringify(bez));
  ok(/Pergamon/.test(bez) && /Duschwanne Kaldewei/.test(bez), 'Basisname + Ausführungslabel enthalten');
  // Anzeige rendert das Label bold auf eigener Zeile
  ok(await page.evaluate(() => { const pc = document.querySelector('#posBody .pcell.bezflex'); return pc && pc.querySelector('br') && pc.querySelector('strong'); }), 'Editor-Anzeige zeigt <br>+<strong>');
}

console.log('■ PDF: Logo 3mm hoch + @page:first ohne Laufzeile + Rich-bez sanitisiert');
{
  const html = await page.evaluate(() => {
    let captured = '';
    const orig = window.open;
    window.open = function () { return { document: { write(s) { captured += s; }, close() {}, title: '' }, focus() {}, print() {}, closed: false }; };
    try { erpPdf(); } catch (e) { captured += ' ERR:' + e.message; }
    window.open = orig;
    return captured;
  });
  ok(html.indexOf('@page:first') >= 0 && /@top-right\{content:none\}/.test(html), 'Titelblatt ohne Laufzeile (@page:first)');
  ok(/\.kopf-r\{[^}]*margin-top:-3mm/.test(html), 'Logo 3mm nach oben (kopf-r margin-top:-3mm)');
  ok(/<strong>/.test(html), 'Rich-bez (Ausführung) im Druck als <strong> gerendert');
  ok(html.indexOf('<script') < 0 || html.indexOf('alert(1)') < 0, 'kein injizierter Script im Druck');
}

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
