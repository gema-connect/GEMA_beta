#!/usr/bin/env node
/* Niederschlag — Strang-Zuweisung: Playwright-Test
 * Deckt ab: «＋ Neuer Strang» im Zeilen-Dropdown (Auto-Name nach Leitungstyp:
 * WAR-R 1 / WAR-S 1), Mehrfach-Zuweisung, Zusammenstellung nach Strängen mit
 * Totalen + «Ohne Strang»-Ausweis, Umbenennen, Löschen (Zeilen-Zuweisung wird
 * geleert), SS-Kopplung (Schlammsammler übernimmt Strang-Flächen in die
 * Auslegung — Chips 🔗, Klick-Guard, manuelle Chips bleiben unabhängig) und
 * Persistenz-Roundtrip getState→setState inkl. ssState (war vorher NICHT
 * persistiert). Ausführen: CHROME=<chromium> node scripts/niederschlag_straenge_test.mjs
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
await page.goto(BASE + '/sb_niederschlag.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.addRowDach && window._strHooks, null, { timeout: 12000 });

// Saubere Ausgangslage: leere Tabellen, 3 Dach- + 1 Umgebungsfläche
await page.evaluate(() => {
  document.getElementById('tbodyDach').innerHTML = '';
  document.getElementById('tbodyUmg').innerHTML = '';
  window.addRowDach({}); window.addRowDach({}); window.addRowDach({});
  window.addRowUmg({});
  const rows = [...document.querySelectorAll('#tbodyDach tr, #tbodyUmg tr')];
  [100, 50, 30, 20].forEach((a, i) => {
    const inp = rows[i].querySelector('.area');
    inp.value = String(a);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

console.log('■ Strang anlegen über das Zeilen-Dropdown (Auto-Name nach Leitungstyp)');
{
  await page.evaluate(() => {
    const tr = document.querySelectorAll('#tbodyDach tr')[0];
    const sel = tr.querySelector('.strangSel');
    sel.value = '__new__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const s1 = await page.evaluate(() => ({ n: _strHooks.strState().length, name: _strHooks.strState()[0] && _strHooks.strState()[0].name, row: document.querySelectorAll('#tbodyDach tr')[0].dataset.strangId }));
  ok(s1.n === 1 && s1.name === 'WAR-R 1', 'Auto-Name «WAR-R 1» (Leitungstyp der Zeile + Nr)');
  ok(s1.row === '1', 'Zeile trägt die Strang-Zuweisung');
  // Zweite + dritte Fläche demselben Strang zuordnen (Dropdown wurde nachgeführt)
  await page.evaluate(() => {
    [1, 2].forEach(i => {
      const sel = document.querySelectorAll('#tbodyDach tr')[i].querySelector('.strangSel');
      sel.value = '1';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  ok(await page.evaluate(() => [...document.querySelectorAll('#tbodyDach tr')].filter(tr => tr.dataset.strangId === '1').length) === 3, 'Flächen 1–3 am Strang WAR-R 1');
  // Umgebungszeile → eigener Strang (Leitungstyp WAR-S)
  await page.evaluate(() => {
    const sel = document.querySelector('#tbodyUmg tr .strangSel');
    sel.value = '__new__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok(await page.evaluate(() => _strHooks.strState()[1] && _strHooks.strState()[1].name) === 'WAR-S 1', 'zweiter Strang auto «WAR-S 1» (Umgebungszeile)');
}

console.log('■ Zusammenstellung nach Strängen');
{
  const z = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#strangList .str-card')];
    return {
      n: cards.length,
      badge: document.getElementById('strangCount').textContent,
      rows1: cards[0].querySelectorAll('tbody tr').length,
      total1: cards[0].querySelector('.str-total').textContent,
      total2: cards[1].querySelector('.str-total').textContent
    };
  });
  ok(z.n === 2 && z.badge === '2', 'zwei Strang-Karten in der Zusammenstellung');
  ok(z.rows1 === 4, 'Strang 1: 3 Flächen-Zeilen + Total-Zeile');
  ok(/180/.test(z.total1.replace(/['’’]/g, '')), 'Total WAR-R 1 = 180 m² (100+50+30)');
  ok(/20/.test(z.total2), 'Total WAR-S 1 = 20 m²');
  ok(!(await page.evaluate(() => document.getElementById('strangList').textContent.includes('Ohne Strang'))), 'kein «Ohne Strang»-Hinweis (alles zugeordnet)');
  // Eine Fläche abhängen → Ohne-Strang-Ausweis
  await page.evaluate(() => {
    const sel = document.querySelectorAll('#tbodyDach tr')[2].querySelector('.strangSel');
    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok(await page.evaluate(() => document.getElementById('strangList').textContent.includes('Ohne Strang: 1 Fläche')), '«Ohne Strang»-Zeile erscheint (1 Fläche · 30 m²)');
}

console.log('■ Umbenennen');
{
  await page.evaluate(() => window.strRename(1, 'WAR-R Ost'));
  ok(await page.evaluate(() => _strHooks.strState()[0].name) === 'WAR-R Ost', 'Strang umbenannt');
  ok(await page.evaluate(() => {
    const sel = document.querySelectorAll('#tbodyDach tr')[0].querySelector('.strangSel');
    return [...sel.options].some(o => o.textContent === 'WAR-R Ost') && sel.value === '1';
  }), 'Zeilen-Dropdowns führen den neuen Namen, Zuweisung bleibt');
}

console.log('■ Schlammsammler-Kopplung (SS übernimmt Strang-Flächen)');
{
  await page.evaluate(() => { window.addSS(); });
  await page.evaluate(() => window.strSetSS(1, String(_strHooks.ssState()[0].id)));
  const k = await page.evaluate(() => {
    const card = document.querySelector('#ssList .ss-card');
    const chips = [...card.querySelectorAll('.ss-fl-chip')];
    return {
      aktiv: chips.filter(c => c.className.includes('active')).length,
      link: chips.filter(c => c.innerHTML.includes('🔗')).length,
      manuell: _strHooks.ssState()[0].assignedNrs.size,
      strangTotal: document.querySelector('#strangList .str-total').textContent
    };
  });
  ok(k.aktiv === 2 && k.link === 2, 'SS-Chips: die 2 Strang-Flächen aktiv mit 🔗-Marker');
  ok(k.manuell === 0, 'manuelle Chip-Menge bleibt leer (Kopplung ist abgeleitet)');
  ok(k.strangTotal.includes('SS 1'), 'Strang-Total verweist auf den gekoppelten SS');
  // Klick auf 🔗-Chip ändert nichts (Guard), manueller Chip bleibt frei
  await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#ssList .ss-fl-chip')];
    chips.find(c => c.innerHTML.includes('🔗')).click();
  });
  ok(await page.evaluate(() => _strHooks.ssState()[0].assignedNrs.size) === 0, 'Klick auf Strang-Chip entfernt NICHTS (Guard)');
  await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#ssList .ss-fl-chip')];
    chips.find(c => !c.innerHTML.includes('🔗')).click();   // freie Fläche manuell dazu
  });
  ok(await page.evaluate(() => _strHooks.ssState()[0].assignedNrs.size) === 1, 'manuelle Chip-Zuweisung funktioniert weiterhin');
  ok(await page.evaluate(() => document.querySelectorAll('#ssList .ss-fl-chip.active').length) === 3, 'effektiv 3 aktive Flächen (2 Strang + 1 manuell)');
}

console.log('■ Persistenz-Roundtrip (inkl. ssState — war vorher nicht gespeichert)');
{
  const st = await page.evaluate(() => _strHooks.getState());
  ok(Array.isArray(st.straenge) && st.straenge.length === 2 && st.straenge[0].ssId !== '', 'getState trägt Stränge inkl. SS-Kopplung');
  ok(Array.isArray(st.ss) && st.ss.length === 1 && st.ss[0].assigned.length === 1, 'getState trägt Schlammsammler inkl. manueller Zuweisung');
  ok(st.rows.filter(r => r.strang === '1').length === 2, 'Zeilen tragen die Strang-IDs');
  await page.evaluate(s => _strHooks.setState(s), st);
  const nach = await page.evaluate(() => ({
    cards: document.querySelectorAll('#strangList .str-card').length,
    name: _strHooks.strState()[0].name,
    rowSel: document.querySelectorAll('#tbodyDach tr')[0].querySelector('.strangSel').value,
    ssChips: document.querySelectorAll('#ssList .ss-fl-chip.active').length,
    ssManuell: _strHooks.ssState()[0].assignedNrs.size
  }));
  ok(nach.cards === 2 && nach.name === 'WAR-R Ost', 'Roundtrip: Stränge wiederhergestellt (Name erhalten)');
  ok(nach.rowSel === '1', 'Roundtrip: Zeilen-Dropdown wieder zugewiesen');
  ok(nach.ssChips === 3 && nach.ssManuell === 1, 'Roundtrip: SS-Karte mit Kopplung + manueller Zuweisung');
}

console.log('■ Strang löschen');
{
  await page.evaluate(() => window.strDelete(1));
  ok(await page.evaluate(() => _strHooks.strState().length) === 1, 'Strang entfernt');
  ok(await page.evaluate(() => [...document.querySelectorAll('#tbodyDach tr')].every(tr => (tr.dataset.strangId || '') !== '1')), 'Zeilen-Zuweisungen geleert (Flächen bleiben)');
  ok(await page.evaluate(() => document.querySelectorAll('#ssList .ss-fl-chip.active').length) === 1, 'SS verliert die Strang-Flächen, manuelle bleibt');
}

await ctx.close();
await browser.close();
server.close();
console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
