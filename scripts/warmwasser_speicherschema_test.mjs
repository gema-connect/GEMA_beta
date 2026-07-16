#!/usr/bin/env node
/* Warmwasser — Speicherschema: Engine-Test (Node, ohne Browser)
 * Prüft wwSpZonen aus dem /*ENGINE-START*​/-Block von sb_warmwasser.html:
 * Zonen-Verteilung (Spitzendeckung → Steuer → Misch/Reserve, von oben nach
 * unten) auf 1 Speicher bzw. 2 gleich grosse, in Serie geschaltete Speicher
 * (Speicher 1 = WW-seitig nimmt die oberen Zonen, Überlauf in Speicher 2).
 * Ausführen: node scripts/warmwasser_speicherschema_test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'sb_warmwasser.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const g = {};
new Function('window', m[1] + '; window.wwSpZonen = wwSpZonen;')(g);
const { wwSpZonen } = g;

let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}
function eq(a, b, label) {
  const pass = Math.abs(a - b) < 1e-9;
  ok(pass, label + ' (' + a + (pass ? ' == ' : ' != ') + b + ')');
}
const flat = r => r.speicher.map(v => v.zones.map(z => z.typ + ':' + Math.round(z.vol)).join(',')).join(' | ');
function volOfTyp(r, typ) {
  let s = 0;
  r.speicher.forEach(v => v.zones.forEach(z => { if (z.typ === typ) s += z.vol; }));
  return s;
}

console.log('■ 1 Speicher — Zonenfolge von oben nach unten');
{
  const r = wwSpZonen(300, 500, 200, 1);
  eq(r.vtot, 1000, 'Totales Speichervolumen = Summe der Zonen');
  eq(r.proSpeicher, 1000, 'ein Behälter = volles Volumen');
  ok(r.speicher.length === 1, 'ein Behälter');
  ok(flat(r) === 'pk:300,ctrl:500,misch:200', 'Reihenfolge pk → ctrl → misch (' + flat(r) + ')');
}

console.log('■ 2 Speicher in Serie — Zonen laufen über die Behältergrenze');
{
  const r = wwSpZonen(300, 500, 200, 2);
  eq(r.proSpeicher, 500, 'je Behälter die Hälfte (500 l)');
  ok(r.speicher.length === 2, 'zwei Behälter');
  ok(flat(r) === 'pk:300,ctrl:200 | ctrl:300,misch:200', 'Steuervolumen läuft in Speicher 2 weiter (' + flat(r) + ')');
  eq(volOfTyp(r, 'pk'), 300, 'Spitzendeckung volumen-erhalten');
  eq(volOfTyp(r, 'ctrl'), 500, 'Steuervolumen volumen-erhalten');
  eq(volOfTyp(r, 'misch'), 200, 'Mischvolumen volumen-erhalten');
  eq(r.speicher[0].zones.reduce((s, z) => s + z.vol, 0), 500, 'Speicher 1 exakt gefüllt');
  eq(r.speicher[1].zones.reduce((s, z) => s + z.vol, 0), 500, 'Speicher 2 exakt gefüllt');
}

console.log('■ Grosse Spitzendeckung — pk füllt Speicher 1 und läuft über');
{
  const r = wwSpZonen(800, 100, 100, 2);
  ok(flat(r) === 'pk:500 | pk:300,ctrl:100,misch:100', 'pk-Überlauf in Speicher 2 (' + flat(r) + ')');
}

console.log('■ Randfälle');
{
  const r0 = wwSpZonen(0, 0, 0, 1);
  eq(r0.vtot, 0, 'alles 0 → vtot 0');
  ok(r0.speicher[0].zones.length === 0, 'keine Zonen');
  const r1 = wwSpZonen(250, 350, 0, 1);
  ok(flat(r1) === 'pk:250,ctrl:350', 'misch 0 → nur zwei Zonen');
  const r2 = wwSpZonen(-5, 400, 100, 1);
  ok(flat(r2) === 'ctrl:400,misch:100', 'negative Eingabe wird geklemmt');
  const r3 = wwSpZonen(300, 500, 200, 3);
  ok(r3.speicher.length === 1, 'ungültige Anzahl → 1 Behälter (Fallback)');
  const r4 = wwSpZonen(0, 0, 0, 2);
  ok(r4.speicher.length === 2 && r4.proSpeicher === 0, 'leer + Serie → 2 leere Behälter ohne Division-Fehler');
  // exakte Grenze: pk endet genau an der Behältergrenze
  const r5 = wwSpZonen(500, 300, 200, 2);
  ok(flat(r5) === 'pk:500 | ctrl:300,misch:200', 'Zone endet exakt an der Grenze (' + flat(r5) + ')');
}

console.log('\n═══ Ergebnis: ' + okCount + ' OK, ' + failCount + ' FAIL ═══');
process.exit(failCount ? 1 : 0);
