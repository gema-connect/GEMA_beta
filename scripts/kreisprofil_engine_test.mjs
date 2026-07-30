// Hydraulik Kreisprofil — Engine-Test gegen die Excel-Cached-Werte der Vorlage
// «HydraulikKreisprofil.xlsm» (Blatt Berechnung: Di=96 mm, Is=1 %, kb=1.0 mm,
// T=10 °C → vv=0.6902316 m/s, Qv=4.9961 l/s, Q0.7=0.84·Qv=4.1967 l/s) plus
// unabhängig berechnete Geometrie-Identitäten der Teilfüllung. Deckt zusätzlich
// die Grundleitungen-Integration ab (glFuellstand/glKreisStatus in
// sb_grundleitungen.html — Betriebs-Füllstand der Anschlussleitung → HSK).
//
//   node scripts/kreisprofil_engine_test.mjs
//
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function engineOf(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
  if (!m) throw new Error('ENGINE-Block fehlt in ' + file);
  return m[1];
}

// Beide Engines in EINEM Scope evaluieren (Namen kollidieren nicht: kp* vs gl*)
const kpEngine = engineOf('sb_kreisprofil.html');
const glEngine = engineOf('sb_grundleitungen.html');
const scope = {};
new Function('S', kpEngine + '\n' + glEngine + `
S.KP_DN_SN592000=KP_DN_SN592000; S.KP_DN_STEINZEUG=KP_DN_STEINZEUG; S.KP_NU=KP_NU;
S.kpNum=kpNum; S.kpNu=kpNu; S.kpMinDurchmesser=kpMinDurchmesser;
S.kpVoll=kpVoll; S.kpTeil=kpTeil; S.kpTabelle=kpTabelle;
S.kpBetriebspunkt=kpBetriebspunkt; S.kpStatus=kpStatus;
S.glVollfuellung=glVollfuellung; S.glTeilfuellung=glTeilfuellung; S.glQmax=glQmax;
S.glFuellstand=glFuellstand; S.glKreisStatus=glKreisStatus; S.glCalcNetz=glCalcNetz;
`)(scope);
const E = scope;

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

console.log('— Stoffwerte & Tabellen —');
t('ν(10 °C) = 1.31e-6', E.kpNu(10) === 1.31e-6);
t('ν(0 °C) = 1.79e-6', E.kpNu(0) === 1.79e-6);
t('ν unbekannte Temperatur → Default 1.31e-6', E.kpNu(999) === 1.31e-6);
t('ν monoton fallend', E.KP_NU.every((r, i, a) => i === 0 || r[1] < a[i - 1][1]));
t('SN-592000-Reihe: DN100 → ID 96 mm', E.KP_DN_SN592000.some(r => r[0] === 100 && r[1] === 96));
t('SN-592000-Reihe: DN150 → ID 146 mm', E.KP_DN_SN592000.some(r => r[0] === 150 && r[1] === 146));
t('Steinzeug-Reihe: DN200 → ID 200 mm', E.KP_DN_STEINZEUG.some(r => r[0] === 200 && r[1] === 200));
t('kpNum: Komma + Apostroph', E.kpNum("1'234,5") === 1234.5);

console.log('— Vollfüllung (Excel-Cached: Di=96, Is=1 %, kb=1, T=10 °C) —');
const nu = E.kpNu(10);
const voll = E.kpVoll(96, 1, 1, nu);
t('vv = 0.6902316 m/s (Excel B18)', near(voll.v, 0.6902316, 5e-7), voll.v);
t('Qv = 4.9961 l/s (Excel B19)', near(voll.qLs, 4.9961, 5e-4), voll.qLs);
t('Q0.7 = 0.84·Qv = 4.1967 l/s (Excel B20)', near(0.84 * voll.qLs, 4.1967, 5e-4));
t('rhy = Di/4', near(voll.rhy, 0.096 / 4, 1e-12));
t('Av = π·Di²/4', near(voll.av, Math.PI * 0.096 * 0.096 / 4, 1e-12));
t('Uv = π·Di', near(voll.uv, Math.PI * 0.096, 1e-12));
t('Vollfüllung ohne Gefälle → q=0', E.kpVoll(96, 0, 1, nu).qLs === 0);

console.log('— Mindestdurchmesser (Excel B14) —');
t('di,min(2.5 l/s, kb 1, 1 %) = 78 mm', E.kpMinDurchmesser(0.0025, 1, 1) === 78, E.kpMinDurchmesser(0.0025, 1, 1));
t('di,min ohne Q → null', E.kpMinDurchmesser(0, 1, 1) === null);
t('di,min wächst mit Q', E.kpMinDurchmesser(0.01, 1, 1) > E.kpMinDurchmesser(0.0025, 1, 1));

console.log('— Teilfüllung (Geometrie-Identitäten) —');
const tv = E.kpTeil(0.096, 96, 1, 1, nu);
t('h=Di → q = Qv', near(tv.qLs, voll.qLs, 1e-9));
t('h=Di → t=1', near(tv.t, 1, 1e-12));
const th = E.kpTeil(0.048, 96, 1, 1, nu);
t('h=Di/2 → A = Av/2', near(th.a, voll.av / 2, 1e-12));
t('h=Di/2 → rhy = Di/4', near(th.rhy, 0.096 / 4, 1e-12));
t('h=Di/2 → bsp = Di (Wasserspiegelbreite)', near(th.bsp, 0.096, 1e-12));
t('h=Di/2 → v = vv (P-C mit gleichem rhy)', near(th.v, voll.v, 1e-9));
t('h=Di/2 → q = Qv/2', near(th.qLs, voll.qLs / 2, 1e-6));
const t93 = E.kpTeil(0.096 * 0.93, 96, 1, 1, nu);
t('Kurvenscheitel: q(0.93·Di)/Qv ≈ 1.05…1.09', t93.qLs / voll.qLs > 1.05 && t93.qLs / voll.qLs < 1.09, (t93.qLs / voll.qLs).toFixed(4));
t('Froude bei h=Di/2 > 0', th.fr > 0);
t('Wandschubspannung τ = ρ·g·I·rhy (h=Di/2)', near(th.tau, 1000 * 9.81 * 0.01 * 0.024, 1e-6), th.tau);
t('Energiehöhe hE = h + v²/2g', near(th.hE, 0.048 + th.v * th.v / (2 * 9.81), 1e-12));

console.log('— Teilfüllungstabelle (15 Stufen) —');
const tab = E.kpTabelle(96, 1, 1, nu);
t('15 Zeilen', tab.length === 15);
t('erste Zeile = Vollfüllung', near(tab[0].t, 1, 1e-12));
t('Schrittweite Di/15 (letzte Zeile h = Di/15)', near(tab[14].h, 0.096 / 15, 1e-12));
t('h streng fallend', tab.every((r, i, a) => i === 0 || r.h < a[i - 1].h));

console.log('— Betriebspunkt (Bisektion) —');
const bp = E.kpBetriebspunkt(2.5, 96, 1, 1, nu);
t('Q=2.5 l/s → h/Di ≈ 0.50', near(bp.t, 0.5, 0.005), bp.t);
t('Q=2.5 l/s → hT ≈ 48 mm', near(bp.h * 1000, 48, 0.5), bp.h * 1000);
t('Q=2.5 l/s → v ≈ 0.69 m/s', near(bp.v, 0.69, 0.005), bp.v);
t('Betriebspunkt reproduziert Q', near(bp.qLs, 2.5, 1e-6));
const bpU = E.kpBetriebspunkt(6.0, 96, 1, 1, nu);
t('Q über Scheitel → ueber (Einstau)', bpU.ueber === true);
t('qPeak > Qv', bpU.qPeak > voll.qLs);
t('Q=0 → null', E.kpBetriebspunkt(0, 96, 1, 1, nu) === null);

console.log('— Beurteilung (kpStatus) —');
const q07 = 0.84 * voll.qLs;
t('leer ohne Q', E.kpStatus(0, null, q07) === 'leer');
t('ok bei 2.5 l/s', E.kpStatus(2.5, bp, q07) === 'ok');
t('zu_klein über Q0.7', E.kpStatus(4.5, E.kpBetriebspunkt(4.5, 96, 1, 1, nu), q07) === 'zu_klein');
t('einstau über Scheitel', E.kpStatus(6.0, bpU, q07) === 'einstau');
const bpG = E.kpBetriebspunkt(0.8, 200, 1, 1, nu);
t('gross bei h/Di < 0.2', E.kpStatus(0.8, bpG, 0.84 * E.kpVoll(200, 1, 1, nu).qLs) === 'gross', bpG && bpG.t);

console.log('— Grundleitungen-Integration: glFuellstand —');
const gv = E.glVollfuellung(103.6, 2, 1.0);
t('DN110 @ 2 %: Qvoll ≈ 8.70 l/s (GL-Referenz)', near(gv.q, 8.70, 0.01), gv.q);
const f05 = E.glFuellstand(gv.q * 0.5, 103.6, 2, 1.0);
t('Q = Qvoll/2 → h/d = 0.500 (Manning-Kanon)', near(f05.t, 0.5, 1e-3), f05.t);
const f07 = E.glFuellstand(gv.q * 0.8372, 103.6, 2, 1.0);
t('Q = 0.8372·Qvoll → h/d = 0.700', near(f07.t, 0.7, 2e-3), f07.t);
t('Füllhöhe h = t·Di [mm]', near(f05.h, 0.5 * 103.6, 0.2));
t('v Betrieb = vVoll·(R/Rv)^(2/3)', near(f05.v, gv.v * Math.pow(1 - Math.sin(Math.PI) / Math.PI, 2 / 3), 1e-6) || near(f05.v, gv.v, 1e-6), f05.v);
const fU = E.glFuellstand(9.7, 103.6, 2, 1.0);
t('Q über Scheitel → ueber:true', fU.ueber === true);
t('qPeak ≈ 1.076·Qvoll', near(fU.qPeak / gv.q, 1.0757, 0.003), fU.qPeak / gv.q);
t('ohne Q → null', E.glFuellstand(0, 103.6, 2, 1.0) === null);
t('ohne Gefälle → null', E.glFuellstand(2, 103.6, 0, 1.0) === null);
t('Bisektion reproduziert Q', near(E.glTeilfuellung(f05.t).q * f05.qVoll, gv.q * 0.5, 1e-6));

console.log('— Grundleitungen-Integration: glKreisStatus —');
const mk = (aus, dnE, dnM) => ({ qtot: 1, auslastung: aus, dnEff: dnE, dnMind: dnM });
t('leer ohne Füllstand', E.glKreisStatus({ qtot: 0 }, null) === 'leer');
t('ok: unter Bemessungs-Füllgrad, DN = mind. DN', E.glKreisStatus(mk(0.8, 110, 110), f05) === 'ok');
t('gross: DN über mind. DN', E.glKreisStatus(mk(0.3, 160, 110), f05) === 'gross');
t('zu_klein: Auslastung > 100 %', E.glKreisStatus(mk(1.2, 110, 125), f05) === 'zu_klein');
t('einstau dominiert', E.glKreisStatus(mk(1.5, 110, 160), fU) === 'einstau');

console.log('— Roundtrip glCalcNetz → Füllstand der Anschlussleitung —');
const st = {
  k: 0.5,
  quellen: [{ id: 'q1', typ: 'fallstrang', du: 120, duMax: 2.5, ziel: 'a1' }],
  abschnitte: [{ id: 'a1', name: 'GL 1', ziel: 'hsk', gef: 2, dn: 'auto' }],
  cfg: {}
};
const c = E.glCalcNetz(st);
const r = c.res['a1'];
t('Root: qtot = 5.48 l/s, DN 125 auto', near(r.qtot, 5.477, 0.01) && r.dnEff === 125, r.qtot + '/' + r.dnEff);
const fr = E.glFuellstand(r.qtot, r.di, r.gef, c.cfg.kb);
t('Betriebs-Füllstand unter Bemessung (h/d < 0.5)', fr.t < 0.5 && fr.t > 0.4, fr.t);
t('Status ok (auto = mind. DN)', E.glKreisStatus(r, fr) === 'ok');
const st2 = JSON.parse(JSON.stringify(st)); st2.abschnitte[0].dn = 110;
const c2 = E.glCalcNetz(st2); const r2 = c2.res['a1'];
t('DN 110 manuell → Auslastung > 100 %', r2.auslastung > 1, r2.auslastung);
t('DN 110 → Status zu_klein', E.glKreisStatus(r2, E.glFuellstand(r2.qtot, r2.di, r2.gef, c2.cfg.kb)) === 'zu_klein');
const st3 = JSON.parse(JSON.stringify(st)); st3.abschnitte[0].dn = 315;
const c3 = E.glCalcNetz(st3); const r3 = c3.res['a1'];
t('DN 315 manuell → Status gross (DN 125 würde genügen)', E.glKreisStatus(r3, E.glFuellstand(r3.qtot, r3.di, r3.gef, c3.cfg.kb)) === 'gross');

console.log('\n═══ ' + ok + ' OK, ' + fail + ' FAIL ═══');
process.exit(fail ? 1 : 0);
