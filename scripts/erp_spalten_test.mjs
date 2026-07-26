// Dokumentliste im ERP: Spalten frei anordnen (Feedback 26.07.2026)
// Deckt ab:
//  A) Listenansicht ist eine Tabelle mit Kopfzeile; Standard-Spalten stimmen
//  B) Reihenfolge per Drag&Drop (linke/rechte Hälfte entscheidet davor/dahinter
//     — auch die LETZTE Position ist erreichbar)
//  C) Kopf-Kontextmenü: ◀/▶ verschieben (Touch), ein-/ausblenden, Standard
//  D) Wahl überlebt den Reload (pro Gerät gespeichert), Spaltenbreite ebenso
//  E) Zell-Inhalte stimmen und folgen der Reihenfolge; Karten-Ansicht bleibt
//
// Ausführen: CHROME=<chromium> node scripts/erp_spalten_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const DOCS = [
  { id: 'd1', typ: 'offerte', nr: 'OF-2026-001', orgId: 'org_test', status: 'entwurf', datum: '2026-07-01',
    gueltigBis: '2026-07-31', titel: 'Badumbau Meier', objektId: 'obj1', objektName: 'MFH Musterstrasse',
    kundeSnapshot: { firma: 'Meier AG', ort: 'Basel' }, bereichId: 'ab_srv',
    sachbearbeiter: { userId: 'u_test', name: 'Test User' },
    positionen: [{ id: 'p1', art: 'frei', bez: 'Montage', menge: 2, einheit: 'Std', ep: 100 }] },
  { id: 'd2', typ: 'offerte', nr: 'OF-2026-002', orgId: 'org_test', status: 'versendet', datum: '2026-07-05',
    titel: 'Heizungsersatz Huber', objektId: 'obj2', objektName: 'EFH Huber',
    kundeSnapshot: { firma: 'Huber GmbH', ort: 'Bern' },
    sachbearbeiter: { userId: 'u_test', name: 'Test User' },
    positionen: [{ id: 'p2', art: 'frei', bez: 'Kessel', menge: 1, einheit: 'Stk', ep: 8000 }] }
];
const OBJEKTE = { objekte: [{ id: 'obj1', name: 'MFH Musterstrasse', orgId: 'org_test' }, { id: 'obj2', name: 'EFH Huber', orgId: 'org_test' }], beteiligte: [], activeObjektId: null };

function ls(extra) {
  const s = seed(['role_planer']);
  s.gema_orgs_v1[0].settings = { arbeitsbereiche: [{ id: 'ab_srv', name: 'Sanitärservice', farbe: '#16a34a' }] };
  return Object.assign(s, {
    gema_erp_dok_pool_v1: DOCS,
    gema_objekte_v1: OBJEKTE,
    gema_coachmarks_done_pm_erp: '1'
  }, extra || {});
}
async function erpSeite(browser, seedObj) {
  const { ctx, page } = await newPage(browser, seedObj);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpRenderList === 'function' && typeof erpSichtbareCols === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  // Der Harness mockt Supabase leer → Pool nach dem Pull neu setzen
  await page.evaluate((d) => { localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(d)); erpRenderAll(); }, DOCS);
  await page.waitForTimeout(300);
  return { ctx, page, errs };
}
const kopf = (page) => page.evaluate(() => Array.from(document.querySelectorAll('table.dtbl thead th[data-col]')).map(t => t.getAttribute('data-col')));

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* ════════ A · Tabelle mit Kopfzeile ════════ */
console.log('■ A · Listenansicht als Tabelle mit Spalten-Kopfzeile');
{
  const { ctx, page, errs } = await erpSeite(browser, ls());
  ok(await page.evaluate(() => !!document.querySelector('table.dtbl')), 'Listenansicht rendert eine Tabelle');
  const cols = await kopf(page);
  ok(JSON.stringify(cols) === JSON.stringify(['nr', 'titel', 'kunde', 'objekt', 'datum', 'betrag', 'status']), 'Standard-Spalten in Standard-Reihenfolge');
  const zeilen = await page.evaluate(() => document.querySelectorAll('table.dtbl tbody tr.dtr').length);
  ok(zeilen === 2, 'beide Offerten als Zeilen');
  const z1 = await page.evaluate(() => Array.from(document.querySelectorAll('table.dtbl tbody tr.dtr')[0].querySelectorAll('td')).map(t => t.textContent.trim()));
  ok(z1[1] === 'OF-2026-002', 'Nr-Spalte gefüllt (neueste zuerst)');
  ok(z1[2] === 'Heizungsersatz Huber' && z1[3] === 'Huber GmbH', 'Titel und Kunde in ihren Spalten');
  ok(/8/.test(z1[6]) && /CHF/.test(z1[6]), 'Betrag-Spalte mit Total (' + z1[6] + ')');
  ok(z1[7] === 'Versendet', 'Status-Spalte');
  ok(await page.evaluate(() => document.querySelectorAll('table.dtbl thead th[draggable="true"]').length === 7), 'alle Spalten-Titel sind ziehbar');
  ok(errs.length === 0, 'keine pageerrors (A)');
  await ctx.close();
}

/* ════════ B · Reihenfolge per Drag&Drop ════════ */
console.log('■ B · Spalten per Drag&Drop umordnen');
{
  const { ctx, page, errs } = await erpSeite(browser, ls());
  // «betrag» auf die linke Hälfte von «titel» ziehen → davor
  const drop = async (src, ziel, rechts) => {
    await page.evaluate(({ src, ziel, rechts }) => {
      const th = document.querySelector('table.dtbl thead th[data-col="' + ziel + '"]');
      const r = th.getBoundingClientRect();
      const x = rechts ? r.left + r.width * 0.8 : r.left + r.width * 0.2;
      const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; }, effectAllowed: '' };
      const mk = (typ, el) => { const e = new MouseEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: r.top + r.height / 2 }); e.dataTransfer = dt; return e; };
      const srcTh = document.querySelector('table.dtbl thead th[data-col="' + src + '"]');
      srcTh.dispatchEvent(mk('dragstart', srcTh));
      th.dispatchEvent(mk('dragover', th));
      th.dispatchEvent(mk('drop', th));
    }, { src, ziel, rechts });
    await page.waitForTimeout(220);
  };
  await drop('betrag', 'titel', false);
  ok(JSON.stringify(await kopf(page)) === JSON.stringify(['nr', 'betrag', 'titel', 'kunde', 'objekt', 'datum', 'status']), 'Drop auf die linke Hälfte setzt die Spalte DAVOR');
  // «nr» auf die rechte Hälfte der LETZTEN Spalte → ans Ende (früher unerreichbar)
  await drop('nr', 'status', true);
  ok(JSON.stringify(await kopf(page)) === JSON.stringify(['betrag', 'titel', 'kunde', 'objekt', 'datum', 'status', 'nr']), 'Drop auf die rechte Hälfte der letzten Spalte setzt ans ENDE');
  // Zellen folgen der neuen Reihenfolge
  const z = await page.evaluate(() => Array.from(document.querySelectorAll('table.dtbl tbody tr.dtr')[0].querySelectorAll('td')).map(t => t.textContent.trim()));
  ok(/CHF/.test(z[1]) && z[7] === 'OF-2026-002', 'die Zellen folgen der neuen Spalten-Reihenfolge');
  // Auf sich selbst fallen lassen ändert nichts
  await drop('titel', 'titel', true);
  ok(JSON.stringify(await kopf(page)) === JSON.stringify(['betrag', 'titel', 'kunde', 'objekt', 'datum', 'status', 'nr']), 'Drop auf sich selbst ist wirkungslos');
  ok(errs.length === 0, 'keine pageerrors (B)');
  // ── D · Wahl überlebt den Reload ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpRenderList === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(1100);
  await page.evaluate((d) => { localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(d)); erpRenderAll(); }, DOCS);
  await page.waitForTimeout(300);
  ok(JSON.stringify(await kopf(page)) === JSON.stringify(['betrag', 'titel', 'kunde', 'objekt', 'datum', 'status', 'nr']), 'Reihenfolge überlebt den Reload');
  await ctx.close();
}

/* ════════ C · Kontextmenü: verschieben, aus-/einblenden, Standard ════════ */
console.log('■ C · Kopf-Kontextmenü (Touch-tauglich)');
{
  const { ctx, page, errs } = await erpSeite(browser, ls());
  await page.evaluate(() => {
    const th = document.querySelector('table.dtbl thead th[data-col="kunde"]');
    const r = th.getBoundingClientRect();
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
  });
  await page.waitForTimeout(220);
  const menu = await page.evaluate(() => {
    const m = document.getElementById('erpCtxMenu');
    return m ? Array.from(m.querySelectorAll('.ctx-i,.ctx-hd')).map(e => e.textContent.trim()) : null;
  });
  const hat = (t) => !!(menu && menu.some(x => x.indexOf(t) >= 0));
  ok(hat('Nach links') && hat('Nach rechts'), 'Menü bietet ◀/▶ (funktioniert auch auf Touch)');
  ok(hat('Spalte ausblenden') && hat('Standard-Spalten'), 'Ausblenden + Standard im Menü');
  ok(['Sachbearbeiter', 'Bereich', 'Frist', 'Verknüpfung'].every(hat), 'alle ausgeblendeten Spalten stehen zur Wahl');
  ok(menu && menu.some(x => /^☑\s*Kunde$/.test(x.replace(/\s+/g, ' ').trim()) || x.indexOf('☑Kunde') >= 0), 'sichtbare Spalten sind angehakt');
  // ◀ verschiebt nach links
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#erpCtxMenu .ctx-i')).find(x => x.textContent.indexOf('Nach links') >= 0);
    b.click();
  });
  await page.waitForTimeout(250);
  ok(JSON.stringify(await kopf(page)) === JSON.stringify(['nr', 'kunde', 'titel', 'objekt', 'datum', 'betrag', 'status']), '◀ verschiebt die Spalte nach links');
  // Spalte einblenden
  await page.evaluate(() => { erpColToggle('sb'); });
  await page.waitForTimeout(250);
  const mitSb = await kopf(page);
  ok(mitSb.indexOf('sb') === mitSb.length - 1, 'neu eingeblendete Spalte hängt sich hinten an');
  ok(await page.evaluate(() => {
    const i = erpSichtbareCols().findIndex(c => c.id === 'sb');
    const td = document.querySelectorAll('table.dtbl tbody tr.dtr')[0].querySelectorAll('td')[i + 1];
    return td && td.textContent.trim() === 'Test User';
  }), 'Sachbearbeiter-Spalte zeigt den echten Wert');
  // Ausblenden
  await page.evaluate(() => { erpColToggle('kunde'); });
  await page.waitForTimeout(250);
  ok((await kopf(page)).indexOf('kunde') < 0, 'Ausblenden entfernt die Spalte');
  // Standard wiederherstellen
  await page.evaluate(() => erpColsReset());
  await page.waitForTimeout(250);
  ok(JSON.stringify(await kopf(page)) === JSON.stringify(['nr', 'titel', 'kunde', 'objekt', 'datum', 'betrag', 'status']), '↺ stellt die Standard-Spalten wieder her');
  // Die letzte Spalte lässt sich nicht auch noch ausblenden
  await page.evaluate(() => { ['titel', 'kunde', 'objekt', 'datum', 'betrag', 'status'].forEach(erpColToggle); erpColToggle('nr'); });
  await page.waitForTimeout(250);
  ok((await kopf(page)).length === 1, 'die letzte Spalte bleibt stehen (Liste nie leer)');
  // Der Bereich-Chip hängt am Titel, solange es keine eigene Spalte gibt
  await page.evaluate(() => erpColsReset());
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => {
    const tds = document.querySelectorAll('table.dtbl tbody tr.dtr')[1].querySelectorAll('td');
    return !!tds[2].querySelector('.ab-chip');
  }), 'ohne Bereich-Spalte hängt der Chip am Titel');
  await page.evaluate(() => erpColToggle('bereich'));
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => {
    const tr = document.querySelectorAll('table.dtbl tbody tr.dtr')[1];
    const i = erpSichtbareCols().findIndex(c => c.id === 'bereich');
    const tds = tr.querySelectorAll('td');
    return !tds[2].querySelector('.ab-chip') && !!tds[i + 1].querySelector('.ab-chip');
  }), 'mit eigener Spalte wandert der Chip dorthin (nie doppelt)');
  ok(errs.length === 0, 'keine pageerrors (C)');
  await ctx.close();
}

/* ════════ D2 · Spaltenbreite ════════ */
console.log('■ D · Spaltenbreite ziehen + merken');
{
  const { ctx, page, errs } = await erpSeite(browser, ls());
  await page.evaluate(() => {
    const th = document.querySelector('table.dtbl thead th[data-col="titel"]');
    const g = th.querySelector('.col-rsz');
    const r = g.getBoundingClientRect();
    const ev = (typ, x) => { const e = new PointerEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: r.top + 5, pointerId: 1 }); return e; };
    g.dispatchEvent(ev('pointerdown', r.left));
    window.dispatchEvent(ev('pointermove', r.left + 90));
    window.dispatchEvent(ev('pointerup', r.left + 90));
  });
  await page.waitForTimeout(250);
  const w = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_erp_colw_v1') || '{}').titel);
  ok(w > 300, 'Breite wurde gespeichert (' + w + 'px, vorher 240)');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpRenderList === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(1100);
  await page.evaluate((d) => { localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(d)); erpRenderAll(); }, DOCS);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => {
    const c = document.querySelector('table.dtbl col[data-col="titel"]');
    return c && parseInt(c.style.width, 10) > 300;
  }), 'Breite überlebt den Reload');
  ok(errs.length === 0, 'keine pageerrors (D)');
  await ctx.close();
}

/* ════════ E · Karten-Ansicht unverändert ════════ */
console.log('■ E · Karten-Ansicht bleibt, Zeilen-Klick öffnet');
{
  const { ctx, page, errs } = await erpSeite(browser, ls());
  await page.evaluate(() => erpSetDocView('karten'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.querySelector('table.dtbl') && document.querySelectorAll('#docList .card').length === 2), 'Karten-Ansicht rendert weiterhin Karten');
  await page.evaluate(() => erpSetDocView('liste'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('table.dtbl')), 'zurück auf die Tabelle');
  await page.evaluate(() => document.querySelector('table.dtbl tbody tr.dtr').click());
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => {
    const ov = document.getElementById('edOv');
    return !!ov && ov.classList.contains('open') && !!cur;
  }), 'Klick auf eine Zeile öffnet das Dokument');
  ok(errs.length === 0, 'keine pageerrors (E)');
  await ctx.close();
}

await browser.close();
await server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
