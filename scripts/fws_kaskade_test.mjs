// Frischwasserstation — Kaskaden-Engine-Test gegen die Lösungswerte des
// Kaskaden-Prinzipschemas (BMS-Energietechnik TE 136105 «Alterszentrum
// Alban-Breite Basel», Lösungsblatt 05/2026, 4-Kaskade 274 kW):
//   V1: 274 kW / 3 Ladestationen = 91.33 kW (Blatt rundet: 92 kW) + Z separat 1.35 kW
//   V2: 274 kW / 4 Stationen    = 68.5 kW
//   Qd (2'600 l, 15→55 °C) = 121 kWh · Ladedauer td = 121/55 = 2.2 h/d
//   WW-Zuschlag = HL·24/(24−td) − HL (Sperrzeit-Formel wie hz_waermegruppen)
//   max. Heiz-Unterbruch = C·ΔTzul/q̇ = 105·0.5/35 = 1.5 h → 2 Ladungen
//   Steuervolumen = 2'600/2 = 1'300 l · Stundenspitze 19.3 % (SIA 385/2,
//   Altersheim) auf dem Nettobedarf ≈ 400 l · Reserve 10 min ≈ 65–100 l
//   Primär-Massenstrom bei 60/42 °C ≈ 12'900 kg/h (Blatt)
// Dazu statische Verdrahtungs-Checks (Schema-Block, 🔥-Kennzeichnung,
// OA-Payload-Labels im Lieferanten-Dashboard).
//
//   node scripts/fws_kaskade_test.mjs
//
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'sa_frischwasserstation.html'), 'utf8');

const m = SRC.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block fehlt'); process.exit(1); }
const scope = {};
new Function('S', m[1] + '\nS.fwkCalc=fwkCalc;S.fwgCalc=fwgCalc;S.fwgPersProWhg=fwgPersProWhg;')(scope);
const E = scope;

let ok = 0, fail = 0;
function t(name, cond, info) {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info != null ? ' — ' + info : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// Beispiel des Lösungsblatts: 50 Betten Altersheim, 2'600 l/d à 55 °C (inkl.
// Verluste; netto 2'000 l), FWS 80 l/min / 274 kW, Zirkulation 302 l/h 1.35 kW,
// HL 55 kW, q̇ 35 W/m², C 105 Wh/m²K, ΔTzul 0.5 K, Primär 60/42 °C.
const base = {
  n: 4, sepZirk: true, pTheor: 274, vMass: 80, pZirk: 1.35, zirkV: 302,
  tww: 55, tkw: 15, primVl: 60, primRl: 42,
  tagesbedarf: 2600, nutzTotal: 2000,
  hl: 55, qHeiz: 35, cGeb: 105, dtZul: 0.5,
  spitzePct: 19.3, reserveMin: 10, cp: 4.187
};

console.log('— V1: separate Zirkulationsstation (Blatt: 274/3 = 92 kW) —');
const v1 = E.fwkCalc(base);
t('n = 4, sep aktiv', v1.n === 4 && v1.sep === true);
t('3 Ladestationen', v1.nLade === 3);
t('Leistung je Station 91.33 kW (Blatt rundet 92)', near(v1.pStation, 274 / 3, 1e-9), v1.pStation);
t('Volumenstrom je Station 26.67 l/min', near(v1.vStation, 80 / 3, 1e-9), v1.vStation);
t('Zirkulationsstation 1.35 kW', near(v1.pZirk, 1.35, 1e-12));
t('Deckung bei Ausfall: 66.7 % (2 von 3)', near(v1.ausfallPct, 200 / 3, 1e-9), v1.ausfallPct);
t('Heizungsplaner-Hinweis warme Rücklauftemperatur (Z über Speicher)',
  v1.warn.some(w => /Rücklauf/.test(w) && /Heizungsplaner/.test(w)));

console.log('— V2: alle Stationen laden (Blatt: 274/4 = 68.5 kW) —');
const v2 = E.fwkCalc({ ...base, sepZirk: false });
t('4 Ladestationen', v2.nLade === 4 && v2.sep === false);
t('Leistung je Station 68.5 kW', near(v2.pStation, 68.5, 1e-9), v2.pStation);
t('Volumenstrom je Station 20 l/min', near(v2.vStation, 20, 1e-9));
t('kein Z-Hinweis ohne separate Station', !v2.warn.some(w => /Zirkulationsstation Z/.test(w)));

console.log('— Ladung & Pufferspeicher (Blatt: 121 kWh · 2.2 h · 1.5 h · 2 Ladungen · 1300 l) —');
t('Qd = 120.96 kWh (Blatt 121)', near(v1.qd, 2600 * 4.187 * 40 / 3600, 1e-9) && near(v1.qd, 121, 0.5), v1.qd);
t('Ladedauer td = 2.20 h/d (Blatt 2.2)', near(v1.td, 2.2, 0.02), v1.td);
t('WW-Zuschlag = HL·24/(24−td) − HL', near(v1.wwZuschlag, 55 * 24 / (24 - v1.td) - 55, 1e-9), v1.wwZuschlag);
t('Ladeleistung 59–62.5 kW (Blatt rundet 62)', v1.pLade > 59 && v1.pLade < 62.5, v1.pLade);
t('max. Heiz-Unterbruch 105·0.5/35 = 1.5 h', near(v1.tAbMax, 1.5, 1e-12));
t('2 Ladungen pro Tag', v1.ladungen === 2);
t('Steuervolumen 2600/2 = 1300 l', near(v1.vSteuer, 1300, 1e-9));
t('Stundenspitze auf NETTObedarf: 2000·19.3 % = 386 l (Blatt ~400)', near(v1.vSpitze, 386, 1e-9), v1.vSpitze);
t('Reserve 10 min = 64.33 l (Blatt ca. 100)', near(v1.vReserve, 386 / 6, 1e-9), v1.vReserve);
t('Speicher-Vorschlag = Spitze + Steuer + Reserve', near(v1.vSpeicher, v1.vSpitze + v1.vSteuer + v1.vReserve, 1e-9));

console.log('— Primärseite (Blatt: 12\'900 kg/h bei 60/42 °C) —');
t('Spreizung 18 K', near(v1.dtPrim, 18, 1e-12));
t('Massenstrom ≈ 12\'900 kg/h (±3 %)', Math.abs(v1.mPrim - 12900) / 12900 < 0.03, v1.mPrim);
t('Massenstrom je Station = total/3', near(v1.mPrimStation, v1.mPrim / 3, 1e-9));

console.log('— Guards —');
const g1 = E.fwkCalc({ ...base, n: 1, sepZirk: true });
t('sep bei n=1 → Fallback auf Kaskade + Warnung', g1.sep === false && g1.nLade === 1
  && g1.warn.some(w => /mind\. 2 Stationen/.test(w)));
t('keine Redundanz bei 1 Ladestation', g1.ausfallPct === 0);
const g2 = E.fwkCalc({ ...base, primVl: 40, primRl: 40 });
t('VL = RL → Warnung + kein Massenstrom', g2.mPrim === 0
  && g2.warn.some(w => /Vorlauf muss über dem Rücklauf/.test(w)));
const g3 = E.fwkCalc({ ...base, hl: 0 });
t('HL 0 → Ladung leer + Hinweis', g3.td === 0 && g3.wwZuschlag === 0 && g3.pLade === 0
  && g3.ladungen === 0 && g3.vSteuer === 0
  && g3.warn.some(w => /Heizleistung der Wärmeerzeugung erfassen/.test(w)));
t('HL 0 → Spitze/Reserve bleiben (unabhängig von der Ladung)', near(g3.vSpitze, 386, 1e-9) && g3.vReserve > 0);
const g4 = E.fwkCalc({ ...base, hl: 5 });
t('HL zu klein (td ≥ 24 h) → Warnung, kein Zuschlag', g4.td >= 24 && g4.wwZuschlag === 0
  && g4.warn.some(w => /mehr als 24 h/.test(w)));
const g5 = E.fwkCalc({ ...base, qHeiz: 0 });
t('ohne q̇: 1 Ladung (kein Unterbruchs-Limit)', g5.tAbMax === 0 && g5.ladungen === 1
  && near(g5.vSteuer, 2600, 1e-9));
const g6 = E.fwkCalc({ ...base, zirkV: 0, pZirk: 0 });
t('sep ohne Zirkulations-Volumenstrom → Hinweis «keine Last»', g6.warn.some(w => /keine Last/.test(w)));
const g7 = E.fwkCalc({ ...base, tkw: 60 });
t('tkw ≥ tww → keine Tagesenergie', g7.qd === 0 && g7.td === 0);

console.log('— Verdrahtung (statisch) —');
t('fwRecalc ruft fwkRecalc', /fwRenderCalc\(res\);fwgRecalc\(res\);fwkRecalc\(res\);/.test(SRC));
t('Abschnitt 7 vorhanden', /7 · Kaskaden-Auslegung/.test(SRC));
t('Toggle fwk_on + Body', /id="fwk_on"/.test(SRC) && /id="fwkBody"/.test(SRC));
t('alle fwk_-Eingaben vorhanden', ['fwk_n', 'fwk_sep', 'fwk_primVl', 'fwk_primRl', 'fwk_hl',
  'fwk_qheiz', 'fwk_cgeb', 'fwk_dtzul', 'fwk_spitze', 'fwk_reserveMin']
  .every(id => new RegExp('id="' + id + '"').test(SRC)));
t('🔥-Kennzeichnung (hz-tag) an den Heizungs-Werten', (SRC.match(/hz-tag/g) || []).length >= 8);
t('Kaskaden-Schema-Karte + Draw-Hook', /id="fwkSchemaCard"/.test(SRC) && /window\._fwKaskadeDraw=function/.test(SRC)
  && /window\._fwKaskadeDraw\)try\{window\._fwKaskadeDraw\(res,k\)/.test(SRC));
const blk = SRC.split('Kaskaden-Schema (Abschnitt 7)')[1] || '';
const drawBlk = blk.split('</script>')[0] || '';
t('Schema-Block nutzt nur literale Farben (GemaPDF-Regel)', drawBlk.length > 1000 && !/var\(--/.test(drawBlk));
t('Schema: Speicherzonen Spitze/Steuer/Reserve + Fühler Ein/Aus',
  /lbl:'Spitze'/.test(drawBlk) && /lbl:'Steuer'/.test(drawBlk) && /lbl:'Reserve'/.test(drawBlk)
  && />Ein</.test(drawBlk) && />Aus</.test(drawBlk));
t('Schema: klickbare Chips (data-fwziel)', (drawBlk.match(/data-fwziel/g) || []).length >= 2);
t('Payload: Kaskaden-Werte nur bei aktiver Kaskade', /w\.kaskadeStationen=_fwkLast\.n/.test(SRC)
  && /w\.leistungJeStation=Math\.round\(_fwkLast\.pStation\*10\)\/10/.test(SRC));
const DASH = readFileSync(join(ROOT, 'sys_lieferant_dashboard.html'), 'utf8');
t('OA-Labels im Lieferanten-Dashboard', /kaskadeStationen:'Kaskade — Anzahl Stationen'/.test(DASH)
  && /leistungJeStation:'Leistung je Station \(kW\)'/.test(DASH));

console.log('\n' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
