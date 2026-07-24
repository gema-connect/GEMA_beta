// Node-Test: Endsumme direkt vorgeben (erpTotalKorrektur, pm_erp ENGINE-Block)
//
// Doppelklick auf «Total CHF» → Zielbetrag eingeben → es wird automatisch eine
// Schluss-Zeile (Rabatt bzw. Zuschlag, pauschal CHF) eingetragen, sodass das
// Brutto-Total exakt stimmt. Geprüft wird die Rechnung inkl. MwSt-Rückrechnung,
// 5-Rappen-Rundung und Mehrfach-Anwendung (darf sich nicht aufschaukeln).
//
// Ausführen: node scripts/erp_endsumme_test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'pm_erp.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = {};
new Function('exports', m[1] + '\n;Object.assign(exports,{erpDocTotals,erpTotalKorrektur,erpRound5,erpNum,erpAufschlagBetrag});')(E);

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

// Wendet die Korrektur an (wie erpTotalAnwenden im Modul) und liefert das Doc
const anwenden = (doc, ziel) => {
  const k = E.erpTotalKorrektur(doc, ziel);
  const neu = Object.assign({}, doc);
  neu.schluss = (doc.schluss || []).filter(s => !s.autoTotal);
  if (k && k.art && k.wert > 0.004) neu.schluss = neu.schluss.concat([{ id: 'auto', art: k.art, modus: 'chf', wert: k.wert, autoTotal: true }]);
  return { doc: neu, k: k, total: E.erpDocTotals(neu).brutto };
};

const dok = (positionen, mwst) => ({ typ: 'offerte', mwstPct: mwst == null ? 8.1 : mwst, positionen: positionen, schluss: [] });

console.log('■ Beispiel aus der Anforderung: 250.60 → 200.00');
{
  // Netto so wählen, dass brutto = 250.60 herauskommt
  const d = dok([{ id: 'p1', art: 'frei', menge: 1, ep: 231.82 }]);
  const t0 = E.erpDocTotals(d);
  ok(Math.abs(t0.brutto - 250.60) < 0.03, 'Ausgangstotal ≈ 250.60 (ist ' + t0.brutto.toFixed(2) + ')');
  const r = anwenden(d, 200.00);
  ok(Math.abs(r.total - 200.00) < 0.005, 'Endsumme trifft exakt 200.00 (ist ' + r.total.toFixed(2) + ')');
  ok(r.k.art === 'rabatt', 'es wird ein Rabatt eingetragen');
  ok(r.doc.schluss.length === 1 && r.doc.schluss[0].modus === 'chf', 'genau EINE pauschale Schlusszeile');
  ok(r.doc.schluss[0].autoTotal === true, 'als Auto-Korrektur markiert (ersetzbar)');
  // Der Rabatt ist der NETTO-Betrag, das Brutto sinkt um Rabatt × (1+MwSt)
  const erwartet = (t0.brutto - 200.00) / 1.081;
  ok(Math.abs(r.k.wert - erwartet) < 0.03, 'Rabattbetrag ist netto gerechnet (' + r.k.wert.toFixed(2) + ' ≈ ' + erwartet.toFixed(2) + ')');
}

console.log('■ Endsumme erhöhen → Zuschlag');
{
  const d = dok([{ id: 'p1', art: 'frei', menge: 1, ep: 100 }]);
  const r = anwenden(d, 200.00);
  ok(Math.abs(r.total - 200.00) < 0.005, 'Endsumme trifft 200.00');
  ok(r.k.art === 'zuschlag', 'es wird ein Zuschlag eingetragen');
  ok(r.k.wert > 0, 'Zuschlag positiv (' + r.k.wert.toFixed(2) + ')');
}

console.log('■ Mehrfach anwenden schaukelt sich nicht auf');
{
  let d = dok([{ id: 'p1', art: 'frei', menge: 3, ep: 84.35 }]);
  let r = anwenden(d, 250.00);
  ok(Math.abs(r.total - 250.00) < 0.005, '1. Vorgabe 250.00 trifft');
  r = anwenden(r.doc, 180.00);
  ok(Math.abs(r.total - 180.00) < 0.005, '2. Vorgabe 180.00 trifft');
  ok(r.doc.schluss.filter(s => s.autoTotal).length === 1, 'immer nur EINE Auto-Zeile (alte wird ersetzt)');
  r = anwenden(r.doc, 300.00);
  ok(Math.abs(r.total - 300.00) < 0.005, '3. Vorgabe 300.00 trifft (Rabatt → Zuschlag)');
  ok(r.doc.schluss.filter(s => s.autoTotal).length === 1, 'weiterhin genau eine Auto-Zeile');
}

console.log('■ Bestehende Schlussrabatte bleiben erhalten');
{
  const d = dok([{ id: 'p1', art: 'frei', menge: 1, ep: 1000 }]);
  d.schluss = [{ id: 's1', art: 'rabatt', bez: 'Treuerabatt', modus: 'pct', wert: 5 }];
  const r = anwenden(d, 900.00);
  ok(Math.abs(r.total - 900.00) < 0.005, 'Endsumme trifft 900.00 trotz bestehendem %-Rabatt');
  ok(r.doc.schluss.some(s => s.bez === 'Treuerabatt'), 'der manuelle Treuerabatt bleibt stehen');
  ok(r.doc.schluss.filter(s => s.autoTotal).length === 1, 'eine zusätzliche Auto-Zeile');
}

console.log('■ 5-Rappen-Rundung');
{
  const d = dok([{ id: 'p1', art: 'frei', menge: 1, ep: 500 }]);
  const r = anwenden(d, 333.33);   // kein Vielfaches von 0.05
  ok(Math.abs(r.total - 333.35) < 0.005, 'Ziel wird auf das Rappen-Raster gesetzt (333.35)');
  ok(Math.abs(r.k.ziel - 333.35) < 0.005, 'die Korrektur rechnet mit dem gerundeten Ziel');
}

console.log('■ Randfälle');
{
  const d = dok([{ id: 'p1', art: 'frei', menge: 1, ep: 100 }]);
  const t = E.erpDocTotals(d);
  const r = anwenden(d, t.brutto);
  ok(r.k.wert === 0 && r.k.art === null, 'gleiche Summe eingeben → keine Korrektur');
  ok(r.doc.schluss.length === 0, 'keine überflüssige Zeile');
}
{
  const d = dok([{ id: 'p1', art: 'frei', menge: 1, ep: 100 }], 0);
  const r = anwenden(d, 50.00);
  ok(Math.abs(r.total - 50.00) < 0.005, 'funktioniert auch ohne MwSt (0 %)');
}
{
  const d = dok([{ id: 'p1', art: 'frei', menge: 1, ep: 100 }]);
  const r = anwenden(d, 0);
  ok(Math.abs(r.total) < 0.005, 'Ziel 0.00 ist erreichbar');
}
{
  // Mit Titel + Kapitel-Rabatt: die Auto-Zeile rechnet aufs Netto-Gesamttotal
  const d = dok([
    { id: 't1', art: 'titel', bez: 'Kapitel A' },
    { id: 'p1', art: 'frei', menge: 2, ep: 150 },
    { id: 'r1', art: 'rabatt', modus: 'pct', wert: 10 }
  ]);
  const r = anwenden(d, 250.00);
  ok(Math.abs(r.total - 250.00) < 0.005, 'trifft auch mit Titel + Kapitel-Rabatt (' + r.total.toFixed(2) + ')');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
