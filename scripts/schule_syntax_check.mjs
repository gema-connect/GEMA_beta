// Syntax-Check der Inline-<script>-Blöcke von HTML-Seiten (Schule-Modul).
// Aufruf: node scripts/schule_syntax_check.mjs <datei.html> [...]
import fs from 'fs';

let fail = 0;
for (const file of process.argv.slice(2)) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, i = 0, ok = 0;
  while ((m = re.exec(html))) {
    i++;
    const code = m[1];
    if (!code.trim()) continue;
    try {
      new Function(code);
      ok++;
    } catch (e) {
      fail++;
      const upto = html.slice(0, m.index).split('\n').length;
      console.error(`✗ ${file} — Script-Block #${i} (ab Zeile ~${upto}): ${e.message}`);
      // Fehlerposition grob eingrenzen
      const lines = code.split('\n');
      for (let l = 0; l < lines.length; l += 1) {
        try { new Function(lines.slice(0, l + 1).join('\n')); } catch (e2) { /* noch offen */ }
      }
    }
  }
  console.log(`${file}: ${i} Script-Blöcke, ${ok} geprüft OK${fail ? '' : ' ✓'}`);
}
process.exit(fail ? 1 : 0);
