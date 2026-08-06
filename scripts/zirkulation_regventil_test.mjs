// Drift-Guard: Thermostatische Zirkulations-Regulierventile (sb_zirkulation.html)
// Feedback 06.08.2026 (Robin): Nussbaum 36010 DN 15/20 — KV(T)-Kennlinie 1:1 aus
// den Hersteller-Diagrammen (flach 1.3/1.6 bis 53 °C → linear fallend bis 58 °C →
// flach 0.1/0.2 bis 63 °C → steigend bis 65 °C → t.D.-Plateau 0.2/0.3).
// Kemper MULTI-THERM DN 15/20: Kennlinien-PNG folgt → Einträge MÜSSEN pending
// und ohne pts sein (keine erfundenen Werte).
// Node-only: extrahiert den /*ZK-VENTIL-ENGINE-START*/-Block aus dem HTML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'sb_zirkulation.html'), 'utf8');

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps == null ? 1e-9 : eps); }

// ── Engine-Block extrahieren ──
const m = html.match(/\/\*ZK-VENTIL-ENGINE-START\*\/([\s\S]*?)\/\*ZK-VENTIL-ENGINE-END\*\//);
t('Engine-Block /*ZK-VENTIL-ENGINE-START*/ vorhanden', !!m);
if (!m) { console.log('\nErgebnis: ' + ok + ' ok, ' + fail + ' fehlgeschlagen'); process.exit(1); }

const eng = new Function(m[1] + '\nreturn {ZK_REGVENTILE:ZK_REGVENTILE, zkRegVentilById:zkRegVentilById, zkRegKv:zkRegKv, zkRegDpMbar:zkRegDpMbar};')();
const { ZK_REGVENTILE, zkRegVentilById, zkRegKv, zkRegDpMbar } = eng;

// ── Katalog-Struktur ──
console.log('■ Katalog');
t('4 Einträge (nb15, nb20, ke15, ke20)', ZK_REGVENTILE.length === 4 &&
  ['nb15', 'nb20', 'ke15', 'ke20'].every(id => ZK_REGVENTILE.some(v => v.id === id)));
const nb15 = zkRegVentilById('nb15'), nb20 = zkRegVentilById('nb20');
const ke15 = zkRegVentilById('ke15'), ke20 = zkRegVentilById('ke20');
t('zkRegVentilById löst auf', !!nb15 && !!nb20 && !!ke15 && !!ke20);
t('unbekannte/leere id → null', zkRegVentilById('xx') === null && zkRegVentilById('') === null && zkRegVentilById(null) === null);
t('Nussbaum DN15: 5 Stützpunkte', Array.isArray(nb15.pts) && nb15.pts.length === 5);
t('Nussbaum DN20: 5 Stützpunkte', Array.isArray(nb20.pts) && nb20.pts.length === 5);
t('Nussbaum Einstellband 52–65 °C', /52–65/.test(nb15.einstell) && /52–65/.test(nb20.einstell));
t('Nussbaum t.D. ab 65 °C', nb15.tdAb === 65 && nb20.tdAb === 65);
t('Kemper pending + OHNE pts (keine erfundenen Werte)',
  ke15.pending === true && ke15.pts == null && ke20.pending === true && ke20.pts == null);
t('Kemper DN korrekt', ke15.dn === 15 && ke20.dn === 20);
[nb15, nb20].forEach(v => {
  let asc = true, pos = true;
  for (let i = 1; i < v.pts.length; i++) if (!(v.pts[i][0] > v.pts[i - 1][0])) asc = false;
  v.pts.forEach(p => { if (!(p[1] > 0)) pos = false; });
  t(v.id + ': Stützpunkte streng aufsteigend in T, KV > 0', asc && pos);
});

// ── DN15-Kennlinie (verifiziert gegen das Hersteller-Diagramm) ──
console.log('■ KV(T) Nussbaum 36010 DN 15');
t('kv(45) = 1.3 (flach vor 50 °C)', approx(zkRegKv(nb15, 45), 1.3));
t('kv(50) = 1.3', approx(zkRegKv(nb15, 50), 1.3));
t('kv(52) = 1.3 (Bandanfang, noch offen)', approx(zkRegKv(nb15, 52), 1.3));
t('kv(53) = 1.3 (Knick)', approx(zkRegKv(nb15, 53), 1.3));
t('kv(54) = 1.06 (Flanke −0.24/°C)', approx(zkRegKv(nb15, 54), 1.06));
t('kv(55.5) = 0.70 (Flankenmitte)', approx(zkRegKv(nb15, 55.5), 0.7));
t('kv(56) = 0.58', approx(zkRegKv(nb15, 56), 0.58));
t('kv(57) = 0.34', approx(zkRegKv(nb15, 57), 0.34));
t('kv(58) = 0.1 (KV min erreicht)', approx(zkRegKv(nb15, 58), 0.1));
t('kv(60) = 0.1 (Regelband flach)', approx(zkRegKv(nb15, 60), 0.1));
t('kv(63) = 0.1 (Regelband-Ende)', approx(zkRegKv(nb15, 63), 0.1));
t('kv(64) = 0.15 (Anstieg zur t.D.)', approx(zkRegKv(nb15, 64), 0.15));
t('kv(65) = 0.2 (t.D.)', approx(zkRegKv(nb15, 65), 0.2));
t('kv(70) = 0.2 (t.D.-Plateau)', approx(zkRegKv(nb15, 70), 0.2));
t('kv(75) = 0.2 (Diagramm-Ende flach)', approx(zkRegKv(nb15, 75), 0.2));
t('kv(null) = 1.3 (ohne T: offenes Ventil)', approx(zkRegKv(nb15, null), 1.3));
t('kv(NaN) = 1.3', approx(zkRegKv(nb15, NaN), 1.3));

// ── DN20-Kennlinie ──
console.log('■ KV(T) Nussbaum 36010 DN 20');
t('kv(50) = 1.6', approx(zkRegKv(nb20, 50), 1.6));
t('kv(53) = 1.6', approx(zkRegKv(nb20, 53), 1.6));
t('kv(54) = 1.32 (Flanke −0.28/°C)', approx(zkRegKv(nb20, 54), 1.32));
t('kv(55.5) = 0.90', approx(zkRegKv(nb20, 55.5), 0.9));
t('kv(56) = 0.76', approx(zkRegKv(nb20, 56), 0.76));
t('kv(58) = 0.2', approx(zkRegKv(nb20, 58), 0.2));
t('kv(61) = 0.2', approx(zkRegKv(nb20, 61), 0.2));
t('kv(63) = 0.2', approx(zkRegKv(nb20, 63), 0.2));
t('kv(64) = 0.25', approx(zkRegKv(nb20, 64), 0.25));
t('kv(65) = 0.3 (t.D.)', approx(zkRegKv(nb20, 65), 0.3));
t('kv(72) = 0.3 (t.D.-Plateau)', approx(zkRegKv(nb20, 72), 0.3));

// ── Pending-Ventile liefern KEINEN KV ──
console.log('■ Pending / Fehlerfälle');
t('zkRegKv(Kemper) = null (keine Kennlinie erfunden)', zkRegKv(ke15, 55) === null && zkRegKv(ke20, 60) === null);
t('zkRegKv(null-Ventil) = null', zkRegKv(null, 55) === null);

// ── Druckverlust-Formel (identisch zur bestehenden Strang-Formel) ──
console.log('■ Δp = (m/KV)²/1000 [mbar]');
t('KV 1.0, m 100 kg/h → 10 mbar', approx(zkRegDpMbar(1, 100), 10));
t('KV 1.3, m 100 kg/h → 5.9172', approx(zkRegDpMbar(1.3, 100), Math.pow(100 / 1.3, 2) / 1000));
t('KV 0.1, m 50 kg/h → 250 mbar (gedrosseltes Ventil!)', approx(zkRegDpMbar(0.1, 50), 250));
t('KV 0.2, m 50 kg/h → 62.5 mbar', approx(zkRegDpMbar(0.2, 50), 62.5));
t('KV 0 → 0 (kein Division-durch-0)', zkRegDpMbar(0, 100) === 0);
t('m 0 → 0', zkRegDpMbar(1.3, 0) === 0);
t('null/negativ → 0', zkRegDpMbar(null, 100) === 0 && zkRegDpMbar(1.3, -5) === 0);
{
  let konsistent = true;
  [[1.3, 80], [0.7, 45], [0.1, 30], [1.6, 200], [0.3, 120]].forEach(([kv, mm]) => {
    if (!approx(zkRegDpMbar(kv, mm), Math.pow(mm / kv, 2) / 1000)) konsistent = false;
  });
  t('Formel-Konsistenz über 5 Wertepaare', konsistent);
}

// ── Kette Kennlinie → Druckverlust (Praxisfall) ──
console.log('■ Kette KV(T) → Δp');
{
  // Strang bei 55.5 °C am Ventil, 60 kg/h: DN15 → KV 0.7 → Δp 7.35 mbar
  const kv = zkRegKv(nb15, 55.5);
  t('DN15 @55.5 °C, 60 kg/h → 7.347 mbar', approx(zkRegDpMbar(kv, 60), Math.pow(60 / 0.7, 2) / 1000));
  // Gleicher Strang im Regelband (60 °C): KV 0.1 → Δp 360 mbar — der Grund,
  // warum ein fester Kvs den warmen Strang massiv unterschätzt.
  const kv2 = zkRegKv(nb15, 60);
  t('DN15 @60 °C, 60 kg/h → 360 mbar (Drossel-Stellung)', approx(zkRegDpMbar(kv2, 60), 360));
}

// ── HTML-Verdrahtung (statisch) ──
console.log('■ Verdrahtung im Modul');
t('Select #zk_regventil vorhanden (AutoSave via id)', /id="zk_regventil"/.test(html));
t('Kvs-Zeile trägt id zkKvsRow (Sichtbarkeits-Umschaltung)', /id="zkKvsRow"/.test(html));
t('Karte #zkVentilCard mit Fold zkVentilC', /id="zkVentilCard"/.test(html) && /zkFold\('zkVentilC'\)/.test(html) && /zkVentilC:true/.test(html));
t('Draw-Hook window._zkVentilDraw verdrahtet (Aufruf + Definition)',
  /window\._zkVentilDraw\)try\{window\._zkVentilDraw\(/.test(html) && /window\._zkVentilDraw=function/.test(html));
t('zkCalc nutzt zkRegKv/zkRegDpMbar pro Strang', /zkRegKv\(ventil,tV\)/.test(html) && /zkRegDpMbar\(kvEff,mLeaf\)/.test(html));
t('kvEff wandert in den Strang-Record', /kvEff:kvEff/.test(html));
t('Diagramm nur mit literalen Hex-Farben (kein var() im Ventil-Block)',
  !/window\._zkVentilDraw[\s\S]{0,6000}var\(--/.test(html));

console.log('\nErgebnis: ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
