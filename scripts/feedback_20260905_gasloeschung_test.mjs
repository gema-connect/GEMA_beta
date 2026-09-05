// Drift-Guard Feedback 05.09.2026 — Gaslöschanlagen (br_gasloeschung.html)
//
// Nicolas Flückiger (Brandschutzplaner), 1 Punkt: «Liter raus löschen (Benennung)».
// Markiert war das Feld «Flaschengrösse» im Tab «Stickstoff N2 300 bar»: die
// Auswahl zeigte «80 Liter» UND die angeschlossene Einheiten-Box daneben «Liter»
// — dieselbe Einheit zweimal in einer Zeile.
//
// Regel (CLAUDE.md «Numerische Inputs»): die Einheit steht in der angeschlossenen
// Box, nicht im Wert/Label. Kanon für ein Zahlen-Select mit Einheiten-Box ist
// `kp_temp` in sb_kreisprofil (Optionstext = blosse Zahl, width:110px,
// text-align:left, Einheit in der `.fg-unit`-Box).
//
// Umgesetzt: die Optionen tragen nur noch die Zahl (80 / 140), die Einheiten-Box
// das Kürzel «l» — dieselbe Schreibweise, die das Modul überall sonst schon nutzt
// (Hinweis «80 l ≙ 24.9 kg», Novec-Feld `bg2_flgr`, Ergebnis `bg1_out_nfl`,
// Offert-Zusammenfassung «… l Flaschen»). Damit ist das Wort «Liter» aus dem
// Modul verschwunden und Bildschirm, Ergebnis-Zeilen und Export sagen dasselbe.
//
// KEINE Rechenänderung: die option-VALUES bleiben 80/140, `bgNum` liest
// `el.value` — gespeicherte AutoSave-Stände bleiben damit gültig.
//
// Aufruf: node scripts/feedback_20260905_gasloeschung_test.mjs   (reiner Node-Test)
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, l, info) => {
  if (c) { pass++; console.log('  ✓ ' + l); }
  else { fail++; console.error('  ✗ FAIL: ' + l + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};

const src = readFileSync(join(ROOT, 'br_gasloeschung.html'), 'utf8');

// ── A: das Wort «Liter» ist restlos weg ──
console.log('■ A: Benennung «Liter» entfernt');
{
  const treffer = src.split('\n')
    .map((ln, i) => ({ nr: i + 1, ln }))
    .filter(x => x.ln.indexOf('Liter') >= 0)
    .map(x => x.nr + ': ' + x.ln.trim().slice(0, 120));
  ok(treffer.length === 0, 'kein «Liter» mehr in br_gasloeschung.html', treffer);
}

// ── B: Feld «Flaschengrösse» (bg1_flgr) — Zahl im Select, Einheit in der Box ──
console.log('■ B: Feld «Flaschengrösse»');
{
  const m = src.match(/<select[^>]*id="bg1_flgr"[\s\S]*?<\/select>\s*<span class="fg-unit">([^<]*)<\/span>/);
  ok(!!m, 'Select bg1_flgr mit angeschlossener Einheiten-Box gefunden');
  if (m) {
    const block = m[0], unit = m[1].trim();

    ok(unit === 'l', 'Einheiten-Box trägt «l»', unit);

    // Optionstexte: blosse Zahl, keine Einheit
    const opts = [...block.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)]
      .map(o => ({ value: o[1], text: o[2].trim() }));
    ok(opts.length === 2, 'zwei Flaschengrössen zur Wahl', opts);
    ok(opts.every(o => /^\d+$/.test(o.text)), 'Optionstexte sind blosse Zahlen (Einheit nur in der Box)', opts.map(o => o.text));

    // KRITISCH — Rechenpfad unberührt: bgNum liest el.value
    ok(opts.map(o => o.value).join('|') === '80|140', 'option-VALUES unverändert 80/140 (Rechenlogik + AutoSave-Stände)', opts.map(o => o.value));

    // Kanon kp_temp (sb_kreisprofil): 110px, links ausgerichtet
    ok(/style="width:110px;text-align:left"/.test(block), 'Select folgt dem Kanon width:110px;text-align:left (wie kp_temp)');
  }
}

// ── C: Ergebnis-Zeilen Direkt-/Nachflutung nutzen dieselbe Schreibweise ──
console.log('■ C: Ergebnis-Zeilen');
{
  const sys1 = src.match(/bgSet\('bg1_out_sys1'[^;]*;/);
  const sys2 = src.match(/bgSet\('bg1_out_sys2'[^;]*;/);
  ok(!!sys1 && !!sys2, 'Ausgaben bg1_out_sys1/sys2 gefunden');
  if (sys1 && sys2) {
    ok(/' l — Direktflutung'/.test(sys1[0]), 'Direktflutung schreibt « l»', sys1[0]);
    ok(/' l — Nachflutung'/.test(sys2[0]), 'Nachflutung schreibt « l»', sys2[0]);
  }
  // Gegenprobe: die übrigen Ausgaben nutzten «l» schon immer — keine zwei Schreibweisen
  ok(/bgSet\('bg1_out_nfl'[^;]*' l'\)/.test(src), 'bg1_out_nfl (Anzahl Flaschen) unverändert mit «l»');
  ok(/bgSet\('bg2_out_nfl'[^;]*' l'\)/.test(src), 'bg2_out_nfl (Novec) unverändert mit «l»');
}

// ── D: Umfeld unangetastet — Hinweise, Novec-Feld, Export ──
console.log('■ D: Umfeld unverändert');
{
  ok(src.indexOf('80 l ≙ 24.9 kg · 140 l ≙ 43.5 kg N2 (300 bar)') >= 0, 'Hinweis unter dem Label unverändert («80 l ≙ 24.9 kg …»)');
  ok(/id="bg2_flgr"[\s\S]{0,220}<span class="fg-unit">l<\/span>/.test(src), 'Novec-Feld bg2_flgr behält Einheiten-Box «l»');
  ok(src.indexOf("d.flaschengroesse+' l Flaschen'") >= 0, 'Offert-/Export-Zusammenfassung unverändert («… l Flaschen»)');
  ok(/flGr:bgNum\('bg1_flgr'\)/.test(src), 'N2-Rechnung liest die Flaschengrösse weiterhin über bgNum(bg1_flgr)');
  ok(/function bgNum\(id\)\{var v=parseFloat\(String\(bgVal\(id\)\)/.test(src), 'bgNum parst el.value (nicht den Optionstext)');
}

console.log('');
console.log(pass + '/' + (pass + fail) + ' Checks grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
