#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   Drift-Guard: Rechenkern el_potenzialausgleich
   ════════════════════════════════════════════════════════════════════════
   Prüft den ENGINE-Block von el_potenzialausgleich.html gegen von Hand
   nachgerechnete Werte — kein Browser, kein DOM.

   Ausführen:  node scripts/potenzialausgleich_engine_test.mjs

   VERFAHREN (Tabellenmethode, kein thermischer Nachweis):
     Schutzleiter   S ≤ 16 → S · 16 < S ≤ 35 → 16 · S > 35 → S/2
     HPA            max(½·S_PEN ; 6)   bzw. 10 mit äusserem Blitzschutz,
                    in der Regel nicht grösser als 16
     ÖPA            max(½·S_PE ; 4)    bzw. 2.5 mechanisch geschützt,
                    nie grösser als der HPA
     FE             max(4 ; S_HPA)
   Jeder Rohwert wird auf den nächstgrösseren Querschnitt der Normreihe
   aufgerundet.
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, fail = 0;
function t(name, bed) {
  if (bed) { ok++; }
  else { fail++; console.log('  ✕ ' + name); }
}
function nah(name, ist, soll, tol = 1e-9) {
  const d = Math.abs(ist - soll);
  if (d <= tol) { ok++; }
  else { fail++; console.log(`  ✕ ${name}: ist ${ist}, soll ${soll} (Δ ${d})`); }
}

/* ── Engine + Fachbasis laden ──────────────────────────────────────────── */
const ctx = { window: {}, console };
ctx.window.window = ctx.window;

// gema_elektro.js hängt sich an window
const basis = readFileSync(join(root, 'gema_elektro.js'), 'utf8');
new Function('window', basis)(ctx.window);
const GemaElektro = ctx.window.GemaElektro;
t('gema_elektro.js liefert GemaElektro', !!GemaElektro);

// ENGINE-Block aus dem Modul schneiden
const html = readFileSync(join(root, 'el_potenzialausgleich.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
t('ENGINE-Block vorhanden', !!m);
if (!m) { console.log('\nABBRUCH: kein ENGINE-Block'); process.exit(1); }

/* Kommentare erst entfernen: im Kopf des Blocks steht der Merksatz
   «keine getElementById, kein innerHTML» — der darf die Prüfung nicht
   auslösen (gleiche Falle wie beim type="number"-Guard). */
const codeOhneKommentar = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
t('ENGINE-Block ist DOM-frei', !/getElementById|innerHTML|document\./.test(codeOhneKommentar));

const mk = new Function('GemaElektro', m[1] + '\nreturn { paCalc, paWerkstoff };');
const { paCalc, paWerkstoff } = mk(GemaElektro);

const calc = (o) => paCalc(Object.assign({ pen: 16, phase: 16, blitzschutz: false, opaVerlegung: 'offen' }, o));

console.log('\n── Leerer Zustand ─────────────────────────────────────────');
{
  const r = paCalc({});
  t('ohne Eingabe leer', r.leer === true);
  t('ohne Eingabe Status leer', r.status === 'leer');
  t('ohne Eingabe keine Zahlen', r.hpa === null && r.pe === null && r.opa === null && r.fe === null);
  const r2 = calc({ phase: 0 });
  t('Aussenleiter 0 → leer', r2.leer === true);
  const r3 = calc({ pen: 0 });
  t('PEN 0 → leer', r3.leer === true);
}

console.log('\n── Schutzleiter: die drei Stufen ──────────────────────────');
{
  // S ≤ 16 → PE = S
  nah('S 1.5 → PE 1.5', calc({ phase: 1.5 }).pe, 1.5);
  nah('S 2.5 → PE 2.5', calc({ phase: 2.5 }).pe, 2.5);
  nah('S 10 → PE 10', calc({ phase: 10 }).pe, 10);
  nah('S 16 → PE 16 (Grenze der 1. Stufe)', calc({ phase: 16 }).pe, 16);
  t('S 16 nimmt den Ast «gleich»', calc({ phase: 16 }).peAst === 'gleich');

  // 16 < S ≤ 35 → PE = 16
  nah('S 25 → PE 16', calc({ phase: 25 }).pe, 16);
  nah('S 35 → PE 16 (Grenze der 2. Stufe)', calc({ phase: 35 }).pe, 16);
  t('S 25 nimmt den Ast «fix16»', calc({ phase: 25 }).peAst === 'fix16');

  // S > 35 → PE = S/2, aufgerundet auf die Normreihe
  nah('S 50 → PE 25 (50/2, in der Reihe)', calc({ phase: 50 }).pe, 25);
  nah('S 70 → PE 35', calc({ phase: 70 }).pe, 35);
  nah('S 95 → PE 50 (47.5 aufgerundet)', calc({ phase: 95 }).pe, 50);
  nah('S 120 → PE 70 (60 aufgerundet)', calc({ phase: 120 }).pe, 70);
  nah('S 150 → PE 95 (75 aufgerundet)', calc({ phase: 150 }).pe, 95);
  nah('S 185 → PE 95 (92.5 aufgerundet)', calc({ phase: 185 }).pe, 95);
  nah('S 240 → PE 120', calc({ phase: 240 }).pe, 120);
  t('S 50 nimmt den Ast «halb»', calc({ phase: 50 }).peAst === 'halb');
  nah('S 95 Rohwert 47.5 vor der Normreihe', calc({ phase: 95 }).peRoh, 47.5);
}

console.log('\n── Hauptpotenzialausgleich ────────────────────────────────');
{
  // Mindestwert greift, solange ½·PEN darunter liegt
  const a = calc({ pen: 10 });
  nah('PEN 10 → ½ = 5', a.hpaHalb, 5);
  nah('PEN 10 → Mindestwert 6 greift', a.hpa, 6);
  t('PEN 10 → nicht gekappt', a.hpaGekappt === false);

  nah('PEN 6 → HPA 6 (Mindestwert)', calc({ pen: 6 }).hpa, 6);
  nah('PEN 16 → ½ = 8 → Normreihe 10', calc({ pen: 16 }).hpa, 10);
  nah('PEN 25 → ½ = 12.5 → Normreihe 16', calc({ pen: 25 }).hpa, 16);
  nah('PEN 32 → ½ = 16 → 16', calc({ pen: 35 }).hpa, 16);

  // Deckel: rechnerisch grösser als 16 → ausgewiesen mit 16, aber gemeldet
  const b = calc({ pen: 50 });
  nah('PEN 50 → ½ = 25 rechnerisch', b.hpaReihe, 25);
  nah('PEN 50 → ausgewiesen mit 16', b.hpa, 16);
  t('PEN 50 → Kappung wird gemeldet', b.hpaGekappt === true);
  t('PEN 50 → Status warn', b.status === 'warn');
  t('PEN 50 → Hinweis nennt den rechnerischen Wert', b.hinweise.some(h => h.includes('25')));
  t('PEN 50 → Hinweis nennt die Zulässigkeit einer grösseren Ausführung',
    b.hinweise.some(h => /zulässig/i.test(h)));

  nah('PEN 240 → ausgewiesen mit 16', calc({ pen: 240 }).hpa, 16);
  nah('PEN 240 → rechnerisch 120', calc({ pen: 240 }).hpaReihe, 120);

  // Blitzschutz hebt den Mindestwert
  const c = calc({ pen: 10, blitzschutz: true });
  nah('Blitzschutz + PEN 10 → HPA 10', c.hpa, 10);
  nah('Blitzschutz → Mindestwert 10', c.hpaMin, 10);
  t('Blitzschutz wird im Hinweis genannt', c.hinweise.some(h => /Blitzschutz/i.test(h)));
  nah('ohne Blitzschutz → Mindestwert 6', calc({ pen: 10 }).hpaMin, 6);
  // Blitzschutz ändert nichts, wo ½·PEN ohnehin darüber liegt
  nah('Blitzschutz + PEN 25 → weiterhin 16', calc({ pen: 25, blitzschutz: true }).hpa, 16);
}

console.log('\n── Zusätzlicher Potenzialausgleich ────────────────────────');
{
  // ungeschützt: Mindestwert 4
  const a = calc({ phase: 16, pen: 25 });   // PE 16, HPA 16
  nah('PE 16 → ½ = 8 → ÖPA 10', a.opa, 10);
  nah('ungeschützt → Mindestwert 4', a.opaMin, 4);

  const b = calc({ phase: 2.5, pen: 25 });  // PE 2.5 → ½ = 1.25 → Mindestwert greift
  nah('PE 2.5 ungeschützt → ÖPA 4', b.opa, 4);
  const c = calc({ phase: 2.5, pen: 25, opaVerlegung: 'geschuetzt' });
  nah('PE 2.5 geschützt → ÖPA 2.5', c.opa, 2.5);
  nah('geschützt → Mindestwert 2.5', c.opaMin, 2.5);

  // Deckel auf den HPA
  const d = calc({ phase: 50, pen: 10 });   // PE 25 → ½ = 12.5 → 16 ; HPA 6
  nah('HPA 6 begrenzt ÖPA', d.opa, 6);
  t('Begrenzung wird gemeldet', d.opaGedeckelt === true);
  t('Begrenzung erscheint als Hinweis', d.hinweise.some(h => /begrenzt/i.test(h)));

  const e = calc({ phase: 16, pen: 16 });   // PE 16 → ½ = 8 → 10 ; HPA 10
  nah('ÖPA darf gleich dem HPA sein', e.opa, 10);
  t('gleich gross ist keine Begrenzung', e.opaGedeckelt === false);
}

console.log('\n── Funktionserdung ────────────────────────────────────────');
{
  nah('HPA 6 → FE 6', calc({ pen: 10 }).fe, 6);
  nah('HPA 16 → FE 16', calc({ pen: 25 }).fe, 16);
  // Mindestwert 4 greift nur, wenn der HPA kleiner wäre — mit min 6 nie.
  t('FE nie kleiner als 4', [6, 10, 16, 25, 50, 240].every(p => calc({ pen: p }).fe >= 4));
  t('FE folgt dem ausgewiesenen HPA, nicht dem rechnerischen',
    calc({ pen: 240 }).fe === calc({ pen: 240 }).hpa);
}

console.log('\n── Referenzfall (Vorgabewerte des Moduls) ─────────────────');
{
  const r = calc({});   // PEN 16, S 16, ungeschützt, ohne Blitzschutz
  nah('PE 16', r.pe, 16);
  nah('HPA 10', r.hpa, 10);
  nah('ÖPA 8 → Normreihe 10', r.opa, 10);
  nah('FE 10', r.fe, 10);
  t('Status ok', r.status === 'ok');
  t('nicht leer', r.leer === false);
  t('keine Warnung', r.hpaGekappt === false && r.opaGedeckelt === false);
}

console.log('\n── Gegenprobe: Reihenfolge und Monotonie ──────────────────');
{
  // Ein grösserer PEN darf den HPA nie verkleinern.
  const reihe = GemaElektro.EL_QUERSCHNITTE;
  let letzte = 0, monoton = true;
  reihe.forEach(p => { const h = calc({ pen: p }).hpa; if (h < letzte) monoton = false; letzte = h; });
  t('HPA wächst monoton mit dem PEN', monoton);

  // Ein grösserer Aussenleiter darf den PE nie verkleinern.
  letzte = 0; monoton = true;
  reihe.forEach(p => { const pe = calc({ phase: p }).pe; if (pe < letzte) monoton = false; letzte = pe; });
  t('PE wächst monoton mit dem Aussenleiter', monoton);

  // Jedes Ergebnis liegt in der Normreihe.
  const inReihe = (v) => v === null || reihe.indexOf(v) >= 0;
  let alleInReihe = true;
  reihe.forEach(p => reihe.forEach(q => {
    const r = calc({ pen: p, phase: q });
    if (!(inReihe(r.pe) && inReihe(r.hpa) && inReihe(r.opa) && inReihe(r.fe))) alleInReihe = false;
  }));
  t('alle Ergebnisse liegen in der Normreihe (361 Kombinationen)', alleInReihe);

  // Der ÖPA ist nie grösser als der HPA.
  let opaOk = true;
  reihe.forEach(p => reihe.forEach(q => {
    const r = calc({ pen: p, phase: q });
    if (r.opa !== null && r.hpa !== null && r.opa > r.hpa) opaOk = false;
  }));
  t('ÖPA nie grösser als HPA (361 Kombinationen)', opaOk);
}

console.log('\n── Werkstoff-Umrechnung ───────────────────────────────────');
{
  t('Kupfer bleibt unverändert', paWerkstoff(16, 'cu').reihe === 16);
  nah('Kupfer Faktor 1', paWerkstoff(16, 'cu').faktor, 1);

  // Aluminium: κ20 Cu 56, Al 36 → Faktor 56/36 = 1.5556
  const al = paWerkstoff(16, 'al');
  nah('Al: 16 Cu → 24.89 gerechnet', al.roh, 16 * 56 / 36, 1e-9);
  nah('Al: aufgerundet auf 25', al.reihe, 25);
  nah('Al-Faktor 56/36', al.faktor, 56 / 36, 1e-9);

  nah('Al: 6 Cu → 10 (9.33 aufgerundet)', paWerkstoff(6, 'al').reihe, 10);
  nah('Al: 10 Cu → 16 (15.56 aufgerundet)', paWerkstoff(10, 'al').reihe, 16);
  nah('Al: 25 Cu → 50 (38.9 aufgerundet)', paWerkstoff(25, 'al').reihe, 50);

  t('ohne Wert null', paWerkstoff(0, 'al') === null);
  t('negativ null', paWerkstoff(-5, 'al') === null);

  // Der gleichwertige Querschnitt muss denselben Leitwert haben:
  // A_al · κ_al ≥ A_cu · κ_cu
  const kCu = GemaElektro.elMaterial('cu').kappa20;
  const kAl = GemaElektro.elMaterial('al').kappa20;
  let leitwertOk = true;
  [2.5, 4, 6, 10, 16, 25, 50].forEach(a => {
    const u = paWerkstoff(a, 'al');
    if (!(u.reihe * kAl >= a * kCu - 1e-9)) leitwertOk = false;
  });
  t('gewählter Al-Querschnitt hat mindestens den Leitwert von Kupfer', leitwertOk);
}

console.log('\n── Grenzfall über der Normreihe ───────────────────────────');
{
  // Ein PEN über 1260 mm² gibt es nicht; die Kette muss trotzdem sauber
  // reagieren, statt still auf den grössten Wert zu kappen.
  const r = calc({ pen: 2000, phase: 2000 });
  t('über der Reihe wird gemeldet', r.ueberReihe === true);
  t('über der Reihe → Status err', r.status === 'err');
  t('über der Reihe → kein stiller Wert', r.pe === null);
  t('über der Reihe → Hinweis vorhanden', r.hinweise.length > 0);
}

console.log('\n── Fachbasis: die PA-Grenzwerte ───────────────────────────');
{
  const PA = GemaElektro.EL_PA_MIN;
  t('EL_PA_MIN vorhanden', !!PA);
  nah('HPA Mindestwert 6', PA.hpa.min, 6);
  nah('HPA Mindestwert mit Blitzschutz 10', PA.hpa.minBlitzschutz, 10);
  nah('HPA Regel-Grenze 16', PA.hpa.max, 16);
  nah('ÖPA geschützt 2.5', PA.opa.geschuetzt, 2.5);
  nah('ÖPA ungeschützt 4', PA.opa.offen, 4);
  nah('FE Mindestwert 4', PA.fe.min, 4);

  // elPeQuerschnitt liefert den ROHWERT (ungerundet) — das Runden macht das Modul.
  nah('elPeQuerschnitt(95) = 47.5 roh', GemaElektro.elPeQuerschnitt(95), 47.5);
  nah('elPeQuerschnitt(16) = 16', GemaElektro.elPeQuerschnitt(16), 16);
  nah('elPeQuerschnitt(25) = 16', GemaElektro.elPeQuerschnitt(25), 16);
  nah('elPeQuerschnitt(0) = 0', GemaElektro.elPeQuerschnitt(0), 0);
}

console.log(`\n${fail === 0 ? '✓' : '✕'} ${ok} von ${ok + fail} Prüfungen bestanden`);
process.exit(fail === 0 ? 0 : 1);
