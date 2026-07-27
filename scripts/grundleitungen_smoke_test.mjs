#!/usr/bin/env node
/* Grundleitungen — Playwright-Smoke
 * Deckt ab: Boot + Default-Seeding (1 Fallstrang → 1 Abschnitt → HSK), K-Wahl,
 * DU-Eingabe → Qww-Chip + Ergebnisliste, Zusammenführung zweier Fallstränge
 * (ΣDU summiert, Qww NEU gerechnet), Regenwasser → Mischwasser + SVG wächst,
 * Baum (2. Abschnitt als Zulauf) + keine Verjüngung, Retention-Drossel,
 * dynamisches SVG (Quellen-Boxen, rote Anschluss-Box, HSK), Schema-Klick →
 * Zeilen-Puls, Persistenz-Roundtrip über #gl_rows + AutoSave-Snapshot,
 * graceful Cross-Modul-Links (Cloud leer → Hinweis statt Absturz),
 * Kein-Zugriff für Monteur.
 * Ausführen: CHROME=<chromium> node scripts/grundleitungen_smoke_test.mjs
 */
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
page.on('pageerror', e => { failCount++; console.log('  ✗ PAGEERROR: ' + e.message); });
await page.goto(BASE + '/sb_grundleitungen.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof glRecalc === 'function' && document.querySelectorAll('#glQBody tr').length >= 1, null, { timeout: 9000 });

async function setRowInput(bodySel, row, inpIdx, val) {
  await page.evaluate(([b, r, i, v]) => {
    const tr = document.querySelectorAll(b + ' tr')[r];
    const inp = tr.querySelectorAll('input[type="text"]')[i];
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, [bodySel, row, inpIdx, String(val)]);
}

console.log('■ Boot & Default-Seeding');
{
  ok(await page.evaluate(() => document.querySelectorAll('#glQBody tr').length) === 1, 'Default: 1 Einleitung (WAS-H 1)');
  ok(await page.evaluate(() => document.querySelectorAll('#glABody tr').length) === 1, 'Default: 1 Abschnitt (Grundleitung 1 → HSK)');
  ok(await page.evaluate(() => document.querySelectorAll('#glkRow .glk-opt').length) === 4, 'K-Wahl: 4 Optionen gerendert');
  ok(await page.evaluate(() => document.querySelector('#glkRow .glk-opt.sel .kv').textContent) === '0.5', 'K-Default 0.5 selektiert');
  ok(await page.evaluate(() => JSON.parse(document.getElementById('gl_rows').value).abschnitte.length) === 1, 'Persist-Guard: #gl_rows sofort befüllt');
  ok(await page.evaluate(() => !!document.querySelector('#glSchema svg')), 'SVG-Schema gezeichnet');
}

console.log('■ Fallstrang: DU → Qww-Chip + Ergebnisliste');
{
  await setRowInput('#glQBody', 0, 1, '20');   // input 0 = Name, 1 = ΣDU
  const chip = await page.evaluate(() => document.querySelector('#glQBody .gl-chip.calc').textContent);
  ok(/2\.24/.test(chip), 'Qww-Chip ≈ 2.24 l/s (K·√20): ' + chip);
  const qtot = await page.evaluate(() => document.querySelector('#glResBody tr .qtot').textContent);
  ok(/2\.24/.test(qtot), 'Ergebnisliste Qtot = 2.24 l/s');
  ok(await page.evaluate(() => /DN 110/.test(document.querySelectorAll('#glResBody tr td')[10].textContent)), 'mind. DN 110 (Mindest-DN SW)');
  ok(await page.evaluate(() => document.querySelector('#glResBody tr').classList.contains('anschluss')), 'Einziger Abschnitt = Anschlussleitung (rot markiert)');
  ok(await page.evaluate(() => /Anschlussleitung/.test(document.querySelector('#glSchema svg').innerHTML)), 'SVG: rote Anschlussleitungs-Box');
  ok(await page.evaluate(() => /HSK/.test(document.querySelector('#glSchema svg').innerHTML)), 'SVG: HSK-Kreis beschriftet');
}

console.log('■ Zusammenführung: 2. Fallstrang — DU summieren, Qww NEU rechnen');
{
  await page.click('button.gl-add:has-text("＋ Fallstrang")');
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 2);
  await setRowInput('#glQBody', 1, 1, '30');
  const r = await page.evaluate(() => {
    const tds = document.querySelectorAll('#glResBody tr td');
    return { du: tds[2].textContent, qww: tds[3].textContent };
  });
  ok(/50/.test(r.du), 'ΣDU = 50 (20 + 30)');
  ok(/3\.54/.test(r.qww), 'Qww = 3.54 l/s (0.5·√50 — NICHT 2.24 + 2.74)');
  const svgBoxes = await page.evaluate(() => (document.querySelector('#glSchema svg').innerHTML.match(/data-glziel="q:/g) || []).length);
  ok(svgBoxes === 2, 'SVG: 2 Quellen-Boxen (dynamisch gewachsen)');
}

console.log('■ Regenwasser + Dauerverbraucher → Mischwasser');
{
  await page.click('button.gl-add:has-text("＋ Regenwasser")');
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 3);
  await setRowInput('#glQBody', 2, 1, '3');    // Regen: input 0 = Name, 1 = Q
  await page.click('button.gl-add:has-text("＋ Dauerverbraucher")');
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 4);
  await setRowInput('#glQBody', 3, 1, '0.8');
  const r = await page.evaluate(() => {
    const tr = document.querySelector('#glResBody tr');
    const tds = tr.querySelectorAll('td');
    return { med: tds[1].textContent, qc: tds[4].textContent, qr: tds[5].textContent, qtot: tds[6].textContent };
  });
  ok(/Mischwasser/.test(r.med), 'Medium = Mischwasser');
  ok(/0\.80/.test(r.qc), 'Qc = 0.80 l/s (1:1)');
  ok(/3\.00/.test(r.qr), 'Qr = 3.00 l/s (1:1)');
  ok(/7\.34/.test(r.qtot), 'Qtot = 3.54 + 0.8 + 3 = 7.34 l/s');
  ok(await page.evaluate(() => (document.querySelector('#glSchema svg').innerHTML.match(/data-glziel="q:/g) || []).length) === 4, 'SVG: 4 Quellen-Boxen');
}

console.log('■ Baum: 2. Abschnitt als Zulauf + keine Verjüngung');
{
  await page.click('button.gl-add:has-text("＋ Abschnitt")');
  await page.waitForFunction(() => document.querySelectorAll('#glABody tr').length === 2);
  // Abschnitt 2 mündet in Abschnitt 1; Regenwasser-Quelle dorthin verschieben
  await page.evaluate(() => {
    const a2row = document.querySelectorAll('#glABody tr')[1];
    const ziel = a2row.querySelector('select[data-glziel-sel]');
    ziel.value = JSON.parse(document.getElementById('gl_rows').value).abschnitte[0].id;
    ziel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    const st = JSON.parse(document.getElementById('gl_rows').value);
    const qrow = document.querySelectorAll('#glQBody tr')[2];
    const ziel = qrow.querySelectorAll('select')[1];
    ziel.value = st.abschnitte[1].id;
    ziel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#glResBody tr').length === 2);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#glResBody tr')].map(tr => ({
    name: tr.querySelector('td b').textContent,
    med: tr.querySelectorAll('td')[1].textContent,
    anschluss: tr.classList.contains('anschluss')
  })));
  ok(rows.length === 2 && rows[0].name === 'Grundleitung 2' && !rows[0].anschluss, 'Zulauf-Abschnitt zuerst gelistet (Fliessreihenfolge)');
  ok(/Regenwasser/.test(rows[0].med), 'Zulauf = Regenwasser');
  ok(rows[1].anschluss && /Mischwasser/.test(rows[1].med), 'Anschlussleitung bleibt Mischwasser');
  // keine Verjüngung: Zulauf manuell DN 160 → Anschluss mind. DN 160
  await page.evaluate(() => {
    const a2row = document.querySelectorAll('#glABody tr')[1];
    const dn = a2row.querySelectorAll('select')[1];
    dn.value = '160';
    dn.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const mindDn = await page.evaluate(() => document.querySelectorAll('#glResBody tr')[1].querySelectorAll('td')[10].textContent);
  ok(/160/.test(mindDn), 'Keine Verjüngung: Anschluss mind. DN 160 (Zulauf DN 160)');
}

console.log('■ Retention drosselt den Regenanteil');
{
  await page.evaluate(() => {
    const a2row = document.querySelectorAll('#glABody tr')[1];
    const cb = a2row.querySelector('input[type="checkbox"]');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelectorAll('#glABody tr')[1].querySelectorAll('input[type="text"]').length === 3);
  await setRowInput('#glABody', 1, 2, '1.5');   // Drossel [l/s] (inputs: Name, Gefälle, Drossel)
  const r = await page.evaluate(() => {
    const rows = document.querySelectorAll('#glResBody tr');
    return { qrZu: rows[0].querySelectorAll('td')[5].textContent, qrAn: rows[1].querySelectorAll('td')[5].textContent,
             hin: rows[0].querySelectorAll('td')[12].textContent, svg: document.querySelector('#glSchema svg').innerHTML };
  });
  ok(/1\.50/.test(r.qrZu), 'Zulauf: Qr gedrosselt auf 1.50 l/s');
  ok(/1\.50/.test(r.qrAn), 'Anschluss erhält den gedrosselten Wert');
  ok(/Retention/.test(r.hin), 'Hinweis «Retention …» in der Liste');
  ok(/Retention/.test(r.svg), 'SVG: Retentions-Symbol beschriftet');
}

console.log('■ Schema-Klick → Zeile pulsiert');
{
  await page.evaluate(() => {
    const g = document.querySelector('#glSchema svg [data-glziel^="a:"]');
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  ok(await page.evaluate(() => !!document.querySelector('#glABody tr.gl-puls, #glQBody tr.gl-puls')), 'Klick auf SVG-Element → Tabellen-Zeile pulsiert');
}

console.log('■ Cross-Modul-Links (Cloud leer) — graceful');
{
  await page.click('#glQBody tr button.gl-linkbtn');   // ⇩ DU-Zusammenstellung (Fallstrang Zeile 1)
  await page.waitForFunction(() => !!document.querySelector('.gema-dlg-bg') || !!document.querySelector('.gema-dlg'), null, { timeout: 6000 }).catch(() => {});
  const dlgTxt = await page.evaluate(() => document.body.textContent);
  ok(/DU-Zusammenstellung einmal öffnen|keine gespeicherten DU-Werte/i.test(dlgTxt), 'DU-Link ohne Daten → erklärender Dialog');
  await page.evaluate(() => { document.querySelectorAll('.gema-dlg-bg button, .gema-dlg button').forEach(b => { if (/ok|schliessen/i.test(b.textContent)) b.click(); }); });
  await page.evaluate(() => { const b = [...document.querySelectorAll('#glQBody tr')[2].querySelectorAll('button')].find(x => /Niederschlag/.test(x.textContent)); b.click(); });
  await page.waitForFunction(() => document.getElementById('glPickBg').classList.contains('open'), null, { timeout: 6000 });
  ok(await page.evaluate(() => /Niederschlagsanfall/.test(document.getElementById('glPickList').textContent)), 'Niederschlag-Link ohne Daten → Empty-State im Picker');
  await page.evaluate(() => glPickClose());
}

console.log('■ Persistenz-Roundtrip (AutoSave-Snapshot)');
{
  await page.waitForTimeout(5800);   // AutoSave-Debounce (gema_autosave: 5 s)
  const snap = await page.evaluate(() => localStorage.getItem('gema_grundleitungen'));
  ok(!!snap && snap.indexOf('gl_rows') >= 0, 'AutoSave-Snapshot enthält gl_rows');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof glRecalc === 'function' && document.querySelectorAll('#glQBody tr').length >= 1, null, { timeout: 9000 });
  await page.waitForFunction(() => document.querySelectorAll('#glQBody tr').length === 4, null, { timeout: 9000 });
  const r = await page.evaluate(() => ({
    q: document.querySelectorAll('#glQBody tr').length,
    a: document.querySelectorAll('#glABody tr').length,
    du: document.querySelectorAll('#glQBody tr')[0].querySelectorAll('input[type="text"]')[1].value,
    qww: document.querySelectorAll('#glResBody tr')[1] ? document.querySelectorAll('#glResBody tr')[1].querySelectorAll('td')[3].textContent : ''
  }));
  ok(r.q === 4 && r.a === 2, 'Nach Reload: 4 Einleitungen + 2 Abschnitte restauriert');
  ok(r.du === '20', 'DU-Wert restauriert');
  ok(/3\.54/.test(r.qww), 'Ergebnis nach Reload identisch (Qww 3.54)');
}

console.log('■ Einstellungen wirken (Mindest-DN)');
{
  await page.evaluate(() => {
    const inp = document.querySelector('[data-cfg="minDnSw"]');
    inp.value = '160';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const mindDn = await page.evaluate(() => document.querySelectorAll('#glResBody tr')[1].querySelectorAll('td')[10].textContent);
  ok(/160|200/.test(mindDn), 'Mindest-DN-Einstellung schlägt durch: ' + mindDn.trim());
}

console.log('■ Kein Zugriff für Monteur');
{
  const { page: p2 } = await newPage(browser, seed(['role_monteur']));
  await p2.goto(BASE + '/sb_grundleitungen.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1600);
  const txt = await p2.evaluate(() => document.body.textContent || '');
  ok(/Kein Zugriff|kein Zugriff/.test(txt), 'Monteur sieht den Kein-Zugriff-Screen');
  await p2.context().close();
}

await browser.close();
server.close();
console.log('');
console.log(failCount === 0 ? '✅ ' + okCount + '/' + okCount + ' Checks grün' : '❌ ' + failCount + ' von ' + (okCount + failCount) + ' Checks rot');
process.exit(failCount === 0 ? 0 : 1);
