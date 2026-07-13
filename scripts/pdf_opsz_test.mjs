// Drift-Guard «dickes l» (DM-Sans-Optical-Sizing) in PDF-/Druckfenstern.
// Regel (CLAUDE.md «DM-Sans „l" wird zu dick im PDF-Export»): JEDES per
// document.write erzeugte Druckfenster, das DM Sans lädt (Fonts-Link als
// JS-String), MUSS im zugehörigen CSS den Kanon tragen:
//   font-optical-sizing:auto;font-variation-settings:"opsz" 14
// Ohne Kanon rendert die Variable-Font im Druck mit der fetten
// Display-Optical-Size — dünne Glyphen wie das kleine «l» wirken zu dick.
// Zusätzlich verboten: font-optical-sizing:none (der ursprüngliche Bug).
//
// Aufruf: node scripts/pdf_opsz_test.mjs   (reiner Node-Test, kein Browser)
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.error('  ✗ ' + l); } };

const files = readdirSync(ROOT).filter(f => f.endsWith('.html') || f.endsWith('.js'));
const fontWindows = [];
const offenders = [];
const noneUses = [];

for (const f of files) {
  let src = '';
  try { src = readFileSync(join(ROOT, f), 'utf8'); } catch (e) { continue; }
  if (/font-optical-sizing\s*:\s*none/.test(src)) noneUses.push(f);
  if (!/document\.write/.test(src)) continue;
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    // Fonts-Link als JS-String (Druckfenster) — der statische <link> im <head>
    // der Seite beginnt mit "<link" und zählt nicht.
    if (ln.indexOf('fonts.googleapis.com/css2?family=DM+Sans') >= 0 && !/^\s*<link/.test(ln)) {
      fontWindows.push(f + ':' + (i + 1));
      // Kanon im Fenster-Kontext: das zugehörige CSS (auch als benannte
      // Konstante wie REPORT_CSS) liegt in der Praxis < 250 Zeilen entfernt.
      const ctx = lines.slice(Math.max(0, i - 250), i + 250).join('\n');
      if (ctx.indexOf('font-variation-settings:"opsz" 14') < 0) offenders.push(f + ':' + (i + 1));
    }
  });
}

console.log('— PDF-/Druckfenster mit DM Sans —');
fontWindows.forEach(x => console.log('   ·', x));
ok(fontWindows.length >= 7, fontWindows.length + ' Druckfenster laden DM Sans (erwartet ≥ 7)');
ok(offenders.length === 0, 'alle tragen den opsz-14-Kanon' + (offenders.length ? ' — FEHLT bei: ' + offenders.join(', ') : ''));
ok(noneUses.length === 0, 'kein font-optical-sizing:none im Repo' + (noneUses.length ? ' — gefunden in: ' + noneUses.join(', ') : ''));

console.log('');
console.log((pass) + '/' + (pass + fail) + ' Checks grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
