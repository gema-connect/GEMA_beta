// Playwright-Smoke: ERP — Rabatt-/Zuschlags-Positionen, Rechnungs-Vorlagen,
// Schlussrechnung ./. nur gestellte Akontorechnungen (07/2026)
//   - art 'rabatt'/'zuschlag': frei benennbar, % vom Kapitel-Zwischentotal
//     (Positionen darüber im Kapitel) ODER pauschal CHF; fliesst in Totals,
//     Editor (Basis-Anzeige «auf CHF x») und PDF (Zwischentotal ausgewiesen,
//     Kapitelsumme inkl. Rabatt)
//   - Teilrechnung: Rabatt-/Zuschlagszeilen bewusst nicht übernommen
//   - Vorlagen: für Rechnungen inkl. rechnungsArt (Akonto-Standardvorlage),
//     passende zuerst, Texte-Übernahme; Rabatt/Zuschlag überleben den Roundtrip
//   - Schlussrechnung: Auftragspositionen ./. NUR gestellte Akontorechnungen
//     (Teilrechnung + Entwurfs-Akonto werden nicht abgezogen)
// Ausführen: CHROME=<chromium> node scripts/erp_rabatt_vorlagen_test.mjs
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
await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpAufschlagBetrag === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

console.log('■ Engine: Rabatt/Zuschlag aufs Kapitel-Zwischentotal');
{
  const t = await page.evaluate(() => erpDocTotals({ mwstPct: 0, rabattPct: 0, positionen: [
    { art: 'titel', bez: 'Kap 1' },
    { art: 'frei', menge: 2, ep: 100 },          // 200
    { art: 'frei', menge: 1, ep: 100 },          // 100 → Kapitelbasis 300
    { art: 'zuschlag', bez: 'Regiezuschlag', modus: 'pct', wert: 10 },   // +30
    { art: 'rabatt', bez: 'Aktionsrabatt', modus: 'chf', wert: 50 },     // −50
    { art: 'titel', bez: 'Kap 2' },
    { art: 'frei', menge: 1, ep: 100 },          // 100 → neue Basis
    { art: 'rabatt', bez: 'Rabatt', modus: 'pct', wert: 5 }              // −5
  ]}));
  ok(Math.abs(t.zwischen - 375) < 0.001, 'Zwischentotal 375 (300 +10% −50 pauschal · Kapitel 2: 100 −5%)');
  const t2 = await page.evaluate(() => erpDocTotals({ mwstPct: 0, rabattPct: 0, positionen: [
    { art: 'frei', menge: 1, ep: 200 },
    { art: 'rabatt', bez: 'R', modus: 'pct', wert: 10 },
    { art: 'zuschlag', bez: 'Z', modus: 'pct', wert: 10 }
  ]}));
  ok(Math.abs(t2.zwischen - 200) < 0.001, 'Ohne Titel: Basis = alle Positionen darüber; Rabatt+Zuschlag rechnen beide auf 200 (keine Verkettung)');
}

console.log('■ Editor: Zeilen, Basis-Anzeige, Modus-Wechsel');
await page.evaluate(() => {
  erpNeu('offerte');
  cur.titel = 'Testofferte';
  cur.kundeSnapshot = { firma: 'Muster AG' };
  cur.mwstPct = 0;
  cur.positionen = [
    { id: 't1', art: 'titel', bez: 'Sanitärleitungen', bkp: '254' },
    { id: 'p1', art: 'frei', bez: 'Leitungen', menge: 2, einheit: 'h', ep: 100 },
    { id: 'p2', art: 'frei', bez: 'Verteiler', menge: 1, einheit: 'Stk', ep: 100 }
  ];
  erpOpenEditor();
  erpPosAdd('zuschlag');
  erpPosAdd('rabatt');
});
ok(await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#edBody .btn.ghost')].map(b => b.textContent.trim());
  return btns.includes('− Rabatt') && btns.includes('+ Zuschlag');
}), 'Buttons «− Rabatt» / «+ Zuschlag» im Positions-Editor');
ok(await page.evaluate(() => {
  const p = cur.positionen;
  return p[3].art === 'zuschlag' && p[3].modus === 'pct' && p[4].art === 'rabatt';
}), 'erpPosAdd legt Rabatt-/Zuschlagszeilen an (Default %)');
await page.evaluate(() => {
  cur.positionen[3].wert = 10; cur.positionen[3].bez = 'Baustellenzuschlag';
  cur.positionen[4].modus = 'chf'; cur.positionen[4].wert = 25;
  erpRenderPos();
});
{
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#posBody tr')];
    const zu = rows[3], ra = rows[4];
    return {
      // cells[0] ist neu die Auswahl-/DnD-Griff-Spalte → Basis/Betrag um 1 verschoben
      zuBadge: zu.querySelector('.src').textContent, zuBasis: zu.cells[6].textContent.trim(), zuBetrag: zu.cells[7].textContent.trim(),
      raBasis: ra.cells[6].textContent.trim(), raBetrag: ra.cells[7].textContent.trim(),
      raClass: ra.className, sum: document.getElementById('sumBlock').textContent
    };
  });
  ok(r.zuBadge === '+ Zuschlag' && r.zuBasis === 'auf 300.00' && r.zuBetrag === '+ 30.00', 'Zuschlagszeile: Basis «auf 300.00» + Betrag +30.00');
  ok(r.raBasis === 'pauschal' && r.raBetrag === '− 25.00' && r.raClass === 'abzug', 'Rabattzeile pauschal: −25.00 (amber Zeile)');
  ok(r.sum.indexOf("305.00") >= 0, 'Summenblock: Zwischentotal 305.00 (300 + 30 − 25)');
}
// eigener Name als Anzeige-Zelle (Doppelklick öffnet die Bearbeitung)
ok(await page.evaluate(() => {
  const zu = [...document.querySelectorAll('#posBody tr')][3];
  return zu.cells[1].textContent.trim() === 'Baustellenzuschlag';
}), 'Zuschlag frei benennbar («Baustellenzuschlag»)');

console.log('■ PDF: Zwischentotal ausgewiesen, Kapitelsumme inkl. Rabatt/Zuschlag');
await page.evaluate(() => {
  window._pdfHtml = '';
  const orig = window.open;
  window.open = function () { return { document: { write: s => { window._pdfHtml += s; }, close: () => {} }, close: () => {} }; };
  erpPdf();
  window.open = orig;
});
{
  const html = await page.evaluate(() => window._pdfHtml);
  ok(html.indexOf('10 % auf Zwischentotal CHF 300.00') >= 0, 'PDF weist das Kapitel-Zwischentotal beim %-Zuschlag aus');
  ok(html.indexOf('Baustellenzuschlag') >= 0 && html.indexOf('(pauschal)') >= 0, 'PDF: eigener Name + Pauschal-Vermerk');
  const zus = html.slice(html.indexOf('Zusammenfassung'));
  ok(/grpltr">254<[\s\S]{0,220}?num">305\.00/.test(zus), 'Zusammenfassung: Kapitel 254 = 305.00 (inkl. Zuschlag − Rabatt)');
}
await page.evaluate(() => erpSaveCur(true));
const offerteId = await page.evaluate(() => cur.id);

console.log('■ Vorlagen: Rabatt/Zuschlag überleben, Rechnungs-Vorlage mit Akonto-Art');
await page.evaluate(() => {
  const orig = GemaDialog.prompt;
  GemaDialog.prompt = () => Promise.resolve('Standard mit Rabatt');
  erpVorlSpeichern();
  GemaDialog.prompt = orig;
});
await page.waitForTimeout(300);
{
  const v = await page.evaluate(() => (GemaSync.getCached('gema_erp_vorl_pool_v1') || []).find(x => x.name === 'Standard mit Rabatt'));
  ok(v && v.positionen.some(p => p.art === 'zuschlag' && p.modus === 'pct' && p.wert === 10)
    && v.positionen.some(p => p.art === 'rabatt' && p.modus === 'chf' && p.wert === 25), 'Offerten-Vorlage behält Rabatt-/Zuschlagszeilen (modus + wert)');
}

console.log('■ Kette: Auftrag → Akonto (gestellt + Entwurf) + Teilrechnung → Schlussrechnung');
await page.evaluate(() => erpZuAuftrag());
await page.waitForTimeout(300);
const auftragId = await page.evaluate(() => cur.id);
// Akonto 1: 100 netto, GESTELLT
await page.evaluate(() => {
  const re = _erpNeueRechnung(cur, 'akonto', [{ id: 'a1', art: 'akonto', bez: 'Akonto 1', menge: 1, einheit: 'pausch.', ep: 100 }], 'Akonto');
  re.status = 'gestellt'; poolSave(DOK_POOL, DOK_PREFIX, re);
  window._ak1 = re.id;
});
// Akonto 2: 40 netto, bleibt ENTWURF
await page.evaluate(() => {
  const re = _erpNeueRechnung(cur, 'akonto', [{ id: 'a2', art: 'akonto', bez: 'Akonto 2', menge: 1, einheit: 'pausch.', ep: 40 }], 'Akonto');
  window._ak2 = re.id;
});
// Teilrechnung: 50 netto, GESTELLT — darf NICHT abgezogen werden
await page.evaluate(() => {
  const re = _erpNeueRechnung(cur, 'teil', [{ id: 'tp', art: 'frei', bez: 'Teil-Leistung', menge: 1, einheit: 'pausch.', ep: 50 }], 'Teilrechnung');
  re.status = 'gestellt'; poolSave(DOK_POOL, DOK_PREFIX, re);
});
{
  const akVorlage = await page.evaluate(() => {
    erpOpen(window._ak2);
    const orig = GemaDialog.prompt;
    GemaDialog.prompt = () => Promise.resolve('Akonto Standard');
    cur.einleitung = 'Gemäss Vereinbarung stellen wir akonto in Rechnung:';
    erpVorlSpeichern();
    GemaDialog.prompt = orig;
  });
  await page.waitForTimeout(300);
  const v = await page.evaluate(() => (GemaSync.getCached('gema_erp_vorl_pool_v1') || []).find(x => x.name === 'Akonto Standard'));
  ok(v && v.typ === 'rechnung' && v.rechnungsArt === 'akonto', 'Vorlage aus Akontorechnung trägt typ rechnung + rechnungsArt akonto');
  // Vorlagen-Liste in einer Akontorechnung: passende zuerst + Badge
  await page.evaluate(() => erpVorlOpen());
  const first = await page.evaluate(() => document.querySelector('#vorlList .pick-item .pi-n').textContent);
  ok(first.indexOf('Akonto Standard') >= 0 && first.indexOf('Akonto') >= 0, 'Vorlagen-Liste: Akonto-Vorlage zuerst mit «Akonto»-Badge');
  // Anwenden ersetzt die Texte (Standardvorlage wirkt auf die bestehende Akontorechnung)
  await page.evaluate(() => { const v2 = (GemaSync.getCached('gema_erp_vorl_pool_v1') || []).find(x => x.name === 'Akonto Standard'); cur.einleitung = 'alt'; erpVorlApply(v2.id); });
  ok(await page.evaluate(() => cur.einleitung === 'Gemäss Vereinbarung stellen wir akonto in Rechnung:'), 'Vorlage-Anwendung übernimmt die Einleitung (Akonto-Standardtext)');
}

// Schlussrechnung: Offert-/Auftragsbetrag ./. NUR gestelltes Akonto (100)
await page.evaluate(id => { erpOpen(id); erpSchluss(); }, auftragId);
await page.waitForTimeout(300);
{
  const r = await page.evaluate(() => ({
    art: cur.rechnungsArt,
    abz: cur.positionen.filter(p => p.art === 'abzug').map(p => p.bez + '|' + p.ep),
    netto: erpDocTotals(cur).netto
  }));
  ok(r.art === 'schluss' && r.abz.length === 1, 'Schlussrechnung: genau EINE Abzugszeile (nur gestelltes Akonto)');
  ok(r.abz[0].indexOf('Akontorechnung') === 4 && r.abz[0].indexOf('|-100') > 0, 'Abzug «./. Akontorechnung …» über −100 (netto)');
  ok(Math.abs(r.netto - 205) < 0.001, 'Restbetrag automatisch: 305 (Offertbetrag) − 100 Akonto = 205 — Teilrechnung + Entwurfs-Akonto nicht abgezogen');
}

console.log('■ Teilrechnungs-Auswahl lässt Rabatt/Zuschlag aus');
await page.evaluate(id => { erpOpen(id); erpTeilOpen(); }, auftragId);
{
  const r = await page.evaluate(() => ({
    checks: document.querySelectorAll('#teilBody .pick-item input[type=checkbox]').length,
    hint: document.getElementById('teilBody').textContent
  }));
  ok(r.checks === 2, 'Teil-Auswahl: nur die 2 echten Positionen wählbar');
  ok(r.hint.indexOf('nicht übernommen') >= 0, 'Hinweis: Rabatt/Zuschlag nicht übernommen');
  await page.evaluate(() => document.getElementById('teilModal').classList.remove('open'));
}

ok(errors.length === 0, 'Keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
