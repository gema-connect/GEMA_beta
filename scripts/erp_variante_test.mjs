// Node-Test: Textzeilen, «per»-Positionen und Varianten in der Summen-Engine
// (erpDocTotals, pm_erp ENGINE-Block).
//
//  - art:'text'  = freier Beschrieb ohne Menge/Preis → zählt 0 und setzt die
//                  Kapitel-Basis NICHT zurück (anders als ein Titel)
//  - menge 0     = Einheitspreis «per» → Betrag 0, kein Beitrag zum Total
//  - variante    = Alternativ-Position → weder im Total noch in der Basis der
//                  Kapitel-Rabatte; Aufheben stellt den alten Stand her
//
// Ausführen: node scripts/erp_variante_test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'pm_erp.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const E = {};
new Function('exports', m[1] + '\n;Object.assign(exports,{erpDocTotals,erpAufschlagBetrag,erpNum,erpRound5});')(E);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };
const dok = (positionen, mwst) => ({ typ: 'offerte', mwstPct: mwst == null ? 8.1 : mwst, positionen: positionen, schluss: [] });
const P = (id, menge, ep, extra) => Object.assign({ id: id, art: 'frei', bez: id, menge: menge, einheit: 'Stk', ep: ep }, extra || {});

console.log('■ Freie Textzeile (art:text)');
{
  const ohne = E.erpDocTotals(dok([P('p1', 2, 100), P('p2', 1, 50)]));
  const mit = E.erpDocTotals(dok([P('p1', 2, 100), { id: 't', art: 'text', bez: 'Hinweis zur Ausführung' }, P('p2', 1, 50)]));
  ok(Math.abs(ohne.netto - mit.netto) < 0.005, 'Textzeile ändert das Total nicht (' + mit.netto.toFixed(2) + ')');
  ok(mit.zwischen === 250, 'Zwischentotal bleibt 250.00');
}
{
  // Kapitel-Rabatt: die Textzeile darf die Basis NICHT zurücksetzen (ein Titel täte das)
  const mitText = E.erpDocTotals(dok([
    { id: 'ti', art: 'titel', bez: 'Kapitel A' },
    P('p1', 1, 200),
    { id: 'tx', art: 'text', bez: 'Beschrieb' },
    { id: 'r', art: 'rabatt', modus: 'pct', wert: 10 }
  ]));
  ok(Math.abs(mitText.zwischen - 180) < 0.005, 'Rabatt rechnet über die Textzeile hinweg aufs Kapitel (180.00)');
  const mitTitel = E.erpDocTotals(dok([
    { id: 'ti', art: 'titel', bez: 'Kapitel A' },
    P('p1', 1, 200),
    { id: 'ti2', art: 'titel', bez: 'Kapitel B' },
    { id: 'r', art: 'rabatt', modus: 'pct', wert: 10 }
  ]));
  ok(Math.abs(mitTitel.zwischen - 200) < 0.005, 'Gegenprobe: ein TITEL setzt die Basis zurück (200.00)');
}

console.log('■ Menge 0 = «per» (Einheitspreis ohne Menge)');
{
  const t = E.erpDocTotals(dok([P('p1', 1, 100), P('per', 0, 12.5)]));
  ok(Math.abs(t.zwischen - 100) < 0.005, 'per-Position steuert nichts zum Total bei (100.00)');
  const kap = E.erpDocTotals(dok([
    { id: 'ti', art: 'titel', bez: 'A' }, P('p1', 1, 100), P('per', 0, 12.5), { id: 'r', art: 'rabatt', modus: 'pct', wert: 10 }
  ]));
  ok(Math.abs(kap.zwischen - 90) < 0.005, 'Kapitel-Rabatt rechnet nur auf die echten 100.00 → 90.00');
}

console.log('■ Variante zählt nicht mit');
{
  const basis = dok([P('p1', 2, 100), P('p2', 1, 300)]);
  const t0 = E.erpDocTotals(basis);
  ok(Math.abs(t0.zwischen - 500) < 0.005, 'Ausgangstotal 500.00');
  const mitVar = dok([P('p1', 2, 100), P('p2', 1, 300, { variante: true })]);
  const t1 = E.erpDocTotals(mitVar);
  ok(Math.abs(t1.zwischen - 200) < 0.005, 'Variante fällt aus dem Zwischentotal (200.00)');
  ok(Math.abs(t1.netto - 200) < 0.005 && t1.brutto > 200, 'Netto/Brutto folgen (netto ' + t1.netto.toFixed(2) + ')');
  // aufheben = Feld entfernen → alter Stand
  const zurueck = dok([P('p1', 2, 100), P('p2', 1, 300)]);
  ok(Math.abs(E.erpDocTotals(zurueck).brutto - t0.brutto) < 0.005, 'Aufheben stellt das Total wieder her');
}
{
  // Variante bleibt auch aus der Basis der Kapitel-Rabatte draussen
  const t = E.erpDocTotals(dok([
    { id: 'ti', art: 'titel', bez: 'A' },
    P('p1', 1, 200),
    P('v1', 1, 1000, { variante: true }),
    { id: 'r', art: 'rabatt', modus: 'pct', wert: 10 }
  ]));
  ok(Math.abs(t.zwischen - 180) < 0.005, '10 % rechnen auf 200.00, nicht auf 1200.00 → 180.00');
}
{
  // mehrere Varianten + Rabatt-Position dazwischen
  const t = E.erpDocTotals(dok([
    P('a', 1, 100), P('v1', 1, 50, { variante: true }), P('v2', 2, 25, { variante: true }), P('b', 1, 100)
  ]));
  ok(Math.abs(t.zwischen - 200) < 0.005, 'mehrere Varianten hintereinander (200.00)');
}
{
  // Variante mit Positionsrabatt bleibt trotzdem draussen
  const t = E.erpDocTotals(dok([P('a', 1, 100), P('v', 1, 500, { variante: true, rabattPct: 20 })]));
  ok(Math.abs(t.zwischen - 100) < 0.005, 'Variante mit Positionsrabatt zählt ebenfalls nicht');
}
{
  // Schlussrabatt rechnet auf das Total OHNE Varianten
  const d = dok([P('a', 1, 1000), P('v', 1, 500, { variante: true })]);
  d.schluss = [{ id: 's', art: 'rabatt', modus: 'pct', wert: 10 }];
  const t = E.erpDocTotals(d);
  ok(Math.abs(t.netto - 900) < 0.005, 'Schlussrabatt 10 % auf 1000.00 → 900.00 (Variante bleibt aussen vor)');
}

console.log('■ Zusammenspiel Text + per + Variante');
{
  const t = E.erpDocTotals(dok([
    { id: 'ti', art: 'titel', bkp: '25', bez: 'Sanitär' },
    { id: 'tx', art: 'text', bez: 'Alle Leitungen in Chromstahl.' },
    P('p1', 4, 250),
    P('per', 0, 18),
    P('v', 1, 900, { variante: true }),
    { id: 'r', art: 'rabatt', modus: 'chf', wert: 100 }
  ]));
  ok(Math.abs(t.zwischen - 900) < 0.005, '4×250 − 100 pauschal = 900.00 (Text/per/Variante zählen nicht)');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
