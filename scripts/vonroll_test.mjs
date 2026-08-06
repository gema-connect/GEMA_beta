// Von-Roll-Tabellen (sb_vonroll.html) — Drift-Guard gegen das Papier
// «11.22 VonRoll-Tabellen» (suissetec Bildungszentrum Lostorf, Modul 11.22).
//
// Prüft OHNE Browser:
//   A) T1/T2 (Verschränkung, A=1): JEDER Tabellenwert gegen das exakte
//      Geometrie-Modell (M² = A²+B²+H², tan γ = A/B, cos F_senk = H/M,
//      cos F_lieg = (B·cos 1,5° + H·sin 1,5°)/M) — Residuen ≤ 1e-4 bzw.
//      die zwei dokumentierten Druck-Eigenheiten verbatim.
//   B) T2 = T1 mit vertauschten Formstückwinkeln (Swap-Identität).
//   C) T3 (Überkröpfung, h=1): geschlossene Lösung des 4-Gleichungs-Modells
//      (H = h + (A+B)·tan 1,5°, M² = A²+B²+H², beide cos-F-Relationen)
//      reproduziert alle 10 Zeilen; Spiegel-Symmetrie + γ-Paare = 90°.
//   D) T4 (Gefällsbrechung, c=1): vrT4Calc-Parität zu allen Zeilen,
//      Identität a = h − b·tan δ ≡ sin α / cos δ, β = 90° − α − δ.
//   E) Druck-Eigenheiten verbatim (T2 60/45 γ=36.771 Zahlendreher,
//      T1 30/75 B=1.9509, T1 75/60 B=0.2960 «02960»).
//   F) Statik: Registrierung (gema_auth/sb_index/sw.js/gema_recent/
//      sys_workspace), kein type="number", fixLeadingZero, Skizzen-
//      Funktionen vorhanden, VRC nur literale Hex-Farben, sw-Version.
//
//   node scripts/vonroll_test.mjs
//
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const SRC = read('sb_vonroll.html');
const m = SRC.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.log('✗ ENGINE-Block fehlt'); process.exit(1); }
const S = {};
new Function('S', m[1] + `
S.VR_ANGLES=VR_ANGLES; S.VR_T1=VR_T1; S.VR_T2=VR_T2; S.VR_T3=VR_T3; S.VR_T4=VR_T4;
S.vrLookup=vrLookup; S.vrT4Row=vrT4Row; S.vrT4Calc=vrT4Calc;
`)(S);

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

const R = Math.PI / 180, n = 1.5 * R, sn = Math.sin(n), cn = Math.cos(n);

// ── A) T1/T2 gegen das exakte Modell ────────────────────────────────
// A=1. fLieg = Formstück an der Liegenden, fSenk = an der Senkrechten.
// a = (cos fLieg − cos fSenk·sin n)/cos n, q = √(sin² fSenk − a²)
// → M = 1/q, B = a/q, H = cos fSenk/q, tan γ = A/B = q/a.
function exT12(fLieg, fSenk) {
  const a = (Math.cos(fLieg * R) - Math.cos(fSenk * R) * sn) / cn;
  const q = Math.sqrt(Math.sin(fSenk * R) ** 2 - a * a);
  return { M: 1 / q, B: a / q, H: Math.cos(fSenk * R) / q, g: Math.atan2(q, a) / R };
}
// Druck-Eigenheiten: dort gilt die Verbatim-Prüfung in E) statt der Toleranz.
const QUIRK = { 'T1|30/75|B': 1, 'T2|60/45|g': 1 };

console.log('— A) T1/T2: Tabellenwerte vs. exakte Geometrie —');
for (const [tn, data, swap] of [['T1', S.VR_T1, false], ['T2', S.VR_T2, true]]) {
  t(tn + ': 15 Zeilen, alle F1+F2 ≥ 90°',
    data.length === 15 && data.every(r => r[0] + r[1] >= 90));
  let bad = [];
  for (const r of data) {
    const e = swap ? exT12(r[1], r[0]) : exT12(r[0], r[1]);
    const key = tn + '|' + r[0] + '/' + r[1] + '|';
    if (!near(r[2], e.M, 1e-4)) bad.push(key + 'M');
    if (!QUIRK[key + 'B'] && !near(r[3], e.B, 1e-4)) bad.push(key + 'B');
    if (!near(r[4], e.H, 1e-4)) bad.push(key + 'H');
    if (!QUIRK[key + 'g'] && !near(r[5], e.g, 0.005)) bad.push(key + 'γ');
    // cos F an der Liegenden = (B·cos n + H·sin n)/M — auf den DRUCK-Werten
    const fL = swap ? r[1] : r[0];
    if (Math.abs((r[3] * cn + r[4] * sn) / r[2] - Math.cos(fL * R)) > 1e-3) bad.push(key + 'cosF');
  }
  t(tn + ': alle Werte im Modell (M/B/H ≤ 1e-4, γ ≤ 0.005°, ausser Quirks)',
    bad.length === 0, bad.join(', '));
}

console.log('— B) T2 = T1 mit vertauschten Formstückwinkeln —');
{
  let bad = [];
  for (const r2 of S.VR_T2) {
    const r1 = S.vrLookup(S.VR_T1, r2[1], r2[0]);
    if (!r1) { bad.push('T1 ' + r2[1] + '/' + r2[0] + ' fehlt'); continue; }
    if (r1[2] !== r2[2] || r1[4] !== r2[4]) bad.push(r2[0] + '/' + r2[1] + ' M/H');
    const isQ = (r2[0] === 75 && r2[1] === 30) || (r2[0] === 60 && r2[1] === 45) ||
                (r2[0] === 30 && r2[1] === 75) || (r2[0] === 45 && r2[1] === 60);
    if (!isQ && (r1[3] !== r2[3] || r1[5] !== r2[5])) bad.push(r2[0] + '/' + r2[1] + ' B/γ');
  }
  t('Swap-Identität (M/H verbatim, B/γ ausser Quirk-Paaren)', bad.length === 0, bad.join(', '));
}

// ── C) T3: geschlossene Lösung des Überkröpfungs-Modells ────────────
// h=1. Unbekannte M,A,B,H mit: H = 1 + (A+B)·tan n, M² = A²+B²+H²,
// cos F1 = (B·cos n + H·sin n)/M, cos F2 = (A·cos n + H·sin n)/M.
// Substitution macht daraus eine quadratische Gleichung in M.
function exT3(f1, f2) {
  const c1 = Math.cos(f1 * R), c2 = Math.cos(f2 * R), Sm = c1 + c2;
  const p = cn * cn / (1 + sn * sn), q = Sm * sn / (1 + sn * sn); // H = q·M + p
  const a1 = (c1 - q * sn) / cn, b1 = -p * sn / cn;               // B = a1·M + b1
  const a2 = (c2 - q * sn) / cn, b2 = -p * sn / cn;               // A = a2·M + b2
  const al = a1 * a1 + a2 * a2 + q * q - 1, be = 2 * (a1 * b1 + a2 * b2 + q * p), ga = b1 * b1 + b2 * b2 + p * p;
  const disc = Math.sqrt(be * be - 4 * al * ga);
  const M = [(-be + disc) / (2 * al), (-be - disc) / (2 * al)].filter(x => x > 1).sort((x, y) => x - y)[0];
  const H = q * M + p, B = a1 * M + b1, A = a2 * M + b2;
  return { M, A, B, H, g: Math.atan2(A, B) / R };
}

console.log('— C) T3: Überkröpfung —');
t('T3: 10 Zeilen, alle F1+F2 ≥ 105°', S.VR_T3.length === 10 && S.VR_T3.every(r => r[0] + r[1] >= 105));
{
  let bad = [];
  for (const r of S.VR_T3) {
    const e = exT3(r[0], r[1]), key = r[0] + '/' + r[1] + '|';
    if (!near(r[2], e.M, 1e-4)) bad.push(key + 'M');
    if (!near(r[3], e.A, 1e-4)) bad.push(key + 'A');
    if (!near(r[4], e.B, 1e-4)) bad.push(key + 'B');
    if (!near(r[5], e.H, 1e-4)) bad.push(key + 'H');
    if (!near(r[6], e.g, 0.005)) bad.push(key + 'γ');
    // Invarianten direkt auf den Druckwerten:
    if (!near(r[5], 1 + (r[3] + r[4]) * Math.tan(n), 1e-4)) bad.push(key + 'H-Formel');
    if (!near(r[2] * r[2], r[3] ** 2 + r[4] ** 2 + r[5] ** 2, 3e-4)) bad.push(key + 'M²');
    if (!near((r[4] * cn + r[5] * sn) / r[2], Math.cos(r[0] * R), 5e-5)) bad.push(key + 'cosF1');
    if (!near((r[3] * cn + r[5] * sn) / r[2], Math.cos(r[1] * R), 5e-5)) bad.push(key + 'cosF2');
  }
  t('alle Zeilen im Modell (Werte ≤ 1e-4, γ ≤ 0.005°, Invarianten)', bad.length === 0, bad.join(', '));
}
{
  let bad = [];
  for (const r of S.VR_T3) {
    const s2 = S.vrLookup(S.VR_T3, r[1], r[0]);
    if (!s2) { bad.push('Spiegel ' + r[1] + '/' + r[0] + ' fehlt'); continue; }
    if (!near(r[3], s2[4], 1e-4) || !near(r[4], s2[3], 1e-4)) bad.push(r[0] + '/' + r[1] + ' A↔B');
    if (!near(r[2], s2[2], 1e-4)) bad.push(r[0] + '/' + r[1] + ' M');
    if (!near(r[6] + s2[6], 90, 0.0015)) bad.push(r[0] + '/' + r[1] + ' γ+γ≠90');
  }
  t('Spiegel-Symmetrie (A↔B, M gleich, γ-Paare = 90°)', bad.length === 0, bad.join(', '));
}

console.log('— D) T4: Gefällsbrechung —');
t('T4: 10 Zeilen (5 × δ=1,5° + 5 × δ=3°)',
  S.VR_T4.length === 10 &&
  S.VR_T4.filter(r => r[1] === 1.5).length === 5 && S.VR_T4.filter(r => r[1] === 3).length === 5 &&
  S.VR_T4.every(r => r[0] === 1));
{
  let bad = [];
  for (const r of S.VR_T4) {
    const e = S.vrT4Calc(r[2], r[1]), key = 'α' + r[2] + '/δ' + r[1] + '|';
    if (r[3] !== e.beta) bad.push(key + 'β');
    if (!near(r[4], e.a, 1e-4)) bad.push(key + 'a');
    if (!near(r[5], e.b, 1e-4)) bad.push(key + 'b');
    if (!near(r[6], e.h, 1e-4)) bad.push(key + 'h');
    // Papier-Identität: a = h − b·tan δ ≡ sin α / cos δ
    if (!near(e.a, Math.sin(r[2] * R) / Math.cos(r[1] * R), 1e-9)) bad.push(key + 'Identität');
  }
  t('vrT4Calc-Parität zu allen Zeilen + a ≡ sin α / cos δ', bad.length === 0, bad.join(', '));
}
{
  const f = S.vrT4Calc(75, 8); // freie δ-Eingabe (steht nicht in der Tabelle)
  t('freies δ=8°/α=75°: β=7, b=cos 83°, a=sin 75/cos 8',
    f.beta === 7 && near(f.b, Math.cos(83 * R), 1e-9) && near(f.a, Math.sin(75 * R) / Math.cos(8 * R), 1e-9));
}
t('vrLookup: Treffer 45/60 + null bei 15/15',
  S.vrLookup(S.VR_T1, 45, 60) !== null && S.vrLookup(S.VR_T1, 15, 15) === null);
t('vrT4Row: Treffer α45/δ1.5 + null bei δ=8', S.vrT4Row(S.VR_T4, 45, 1.5) !== null && S.vrT4Row(S.VR_T4, 45, 8) === null);
t('VR_ANGLES = [15,30,45,60,75]', JSON.stringify(S.VR_ANGLES) === '[15,30,45,60,75]');

console.log('— E) Druck-Eigenheiten verbatim (bewusst 1:1 aus dem Papier) —');
t('T2 60/45 γ = 36.771 (Zahlendreher — exakt 36.7113)',
  S.vrLookup(S.VR_T2, 60, 45)[5] === 36.771 && Math.abs(36.771 - exT12(45, 60).g) > 0.05);
t('T1 45/60 γ = 36.711 (korrekt gerundet)',
  S.vrLookup(S.VR_T1, 45, 60)[5] === 36.711 && near(36.711, exT12(45, 60).g, 5e-4));
t('T1 30/75 B = 1.9509 / T2 75/30 B = 1.9505 (exakt 1.95052)',
  S.vrLookup(S.VR_T1, 30, 75)[3] === 1.9509 && S.vrLookup(S.VR_T2, 75, 30)[3] === 1.9505 &&
  near(1.9505, exT12(30, 75).B, 1e-4));
t('T1 75/60 B = 0.2960 (Papier «02960»)', S.vrLookup(S.VR_T1, 75, 60)[3] === 0.296);

console.log('— F) Statik: Modul-Aufbau + Registrierung —');
t('Skizzen-Funktionen vorhanden (iso/geo T1–T4 + triT4)',
  ['isoT1', 'geoT1', 'isoT2', 'geoT2', 'isoT3', 'geoT3', 'isoT4', 'triT4', 'geoT4', 'renderLookup']
    .every(f => SRC.indexOf('function ' + f + '(') >= 0));
t('Lookup-Tabelle druckt String(v) (Druck-Treue, z.B. «8.976»)',
  /renderLookup[\s\S]{0,600}String\(/.test(SRC));
t('kein type="number"', SRC.indexOf('type="number"') < 0);
t('inputmode="decimal" + fixLeadingZero', SRC.indexOf('inputmode="decimal"') >= 0 && SRC.indexOf('fixLeadingZero') >= 0);
{
  const vrc = SRC.match(/var VRC\s*=\s*\{[\s\S]*?\};/);
  t('VRC-Palette: nur literale Hex-Farben (GemaPDF-Regel)',
    !!vrc && !/var\(--/.test(vrc[0]) && (vrc[0].match(/#[0-9a-f]{3,6}/gi) || []).length >= 8);
}
t('N = 1,5° als Neigungs-Beschriftung in den Skizzen', SRC.indexOf('N = 1,5°') >= 0);
t('ENGINE-Header dokumentiert die Druck-Eigenheiten',
  m[1].indexOf('36.771') >= 0 && m[1].indexOf('1.9509') >= 0 && m[1].indexOf('02960') >= 0);

const auth = read('gema_auth.js'), idx = read('sb_index.html'), sw = read('sw.js');
t('gema_auth: MODULES-Key vonroll_tabellen', /key:\s*'vonroll_tabellen'/.test(auth));
t("gema_auth: FILE_MAP 'sb_vonroll'→'vonroll_tabellen'", /'sb_vonroll'\s*:\s*'vonroll_tabellen'/.test(auth));
t('sb_index: Kachel verlinkt sb_vonroll.html', idx.indexOf('href="sb_vonroll.html"') >= 0);
t('sw.js: /sb_vonroll.html im Cache', sw.indexOf("'/sb_vonroll.html'") >= 0);
{
  const v = sw.match(/gema-v(\d+)/);
  t('sw.js: Cache-Version ≥ v470 (Skizzen-Umbau)', !!v && parseInt(v[1], 10) >= 470, v && v[0]);
}
t('gema_recent: Label vorhanden', read('gema_recent.js').indexOf("'sb_vonroll'") >= 0);
t('sys_workspace: MODULES-Eintrag sb_vonroll', read('sys_workspace.html').indexOf("id:'sb_vonroll'") >= 0);

console.log('\n' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
