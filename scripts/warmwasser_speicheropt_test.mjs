#!/usr/bin/env node
/* Warmwasser — Excel-Vollausbau 08/2026: Drift-Guard (Node, ohne Browser)
 * Sichert die Ergänzungen aus der Vollanalyse der Arbeitsmappe
 * «WarmwasserGesamt385_251125_v3.xlsm» gegen die Excel-Cached-Werte ab:
 *   A) WW_TYP_PROFILE — 11 Stundenprofile (24 Werte, Σ = 100, Basis-Spitze
 *      konsistent mit WW_SPITZE_PROFIL im Haupt-Script; Alt-Werte unverändert)
 *   B) wwTypProfilEff — Spitzenstunden-Ersatz + Skalierung auf Σ 100
 *      (Excel-Mechanik `(100−Spitze)/(100−BasisSpitze)·Wert`)
 *   C) wwSoMenge — Menge WW pro Ladung (Feinplanung AN257/AN266,
 *      Excel-Cache 859.8041557200859 bei 50 kW / 1 h)
 *   D) wwSoTag — 24-h-Tanksimulation (Blatt «Speicheroptimierung Wohnbau»
 *      Zeilen 52–57 + AC17: Verbrauch/Prod/Inhalt, kein WW, Überlauf,
 *      Optimierung = min. Inhalt − Spitzendeckung; Fixpunkt nach Übernahme)
 *   E) wwWrg — WRG-Duschen (Blatt «WRG-Duschen»: 12 Duschen einfach, η 40 %
 *      → 300 Nl · 17.4 kWh · Reduktion 6.96 kWh/d)
 *   F) Statische Marker (Markup-IDs, Restore, Cross-Block-Guards,
 *      Summenlinien ohne VSSH-Fallback) + Syntax aller Inline-Scripts
 * Ausführen: node scripts/warmwasser_speicheropt_test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'sb_warmwasser.html'), 'utf8');

let okCount = 0, failCount = 0;
function ok(cond, label) {
  if (cond) { okCount++; console.log('  ✓ ' + label); }
  else { failCount++; console.log('  ✗ FAIL: ' + label); }
}
function eq(a, b, label, tol) {
  const t = tol == null ? 1e-9 : tol;
  const pass = isFinite(a) && isFinite(b) && Math.abs(a - b) < t;
  ok(pass, label + ' (' + a + (pass ? ' == ' : ' != ') + b + ')');
}

// ── Engine-Block laden ──
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const g = {};
new Function('window', m[1] + `; window.WW_TYP_PROFILE = WW_TYP_PROFILE;
  window.wwTypProfilEff = wwTypProfilEff; window.wwSoMenge = wwSoMenge;
  window.wwSoTag = wwSoTag; window.wwWrg = wwWrg;`)(g);
const { WW_TYP_PROFILE, wwTypProfilEff, wwSoMenge, wwSoTag, wwWrg } = g;

// WW_SPITZE_PROFIL / WW_PROFIL_LABEL leben im Haupt-Script (Block 1) — separat extrahieren
function extractVar(name) {
  const mm = html.match(new RegExp('var ' + name + '=(\\{[^;]*\\});'));
  if (!mm) { console.error(name + ' nicht gefunden'); process.exit(1); }
  return new Function('return ' + mm[1] + ';')();
}
const SPITZE = extractVar('WW_SPITZE_PROFIL');
const LABEL = extractVar('WW_PROFIL_LABEL');

console.log('■ A — WW_TYP_PROFILE: 11 Profile, Σ = 100, Basis-Spitzen konsistent');
{
  const keys = ['wohnbau', 'hotel', 'hotel_tourist', 'altersheim', 'altersheim_din',
    'spital', 'spital_din', 'studentenheim', 'buero', 'restaurant', 'restaurant_din'];
  ok(Object.keys(WW_TYP_PROFILE).length === 11, 'genau 11 Profile');
  ok(keys.every(k => WW_TYP_PROFILE[k]), 'alle erwarteten Profil-Keys vorhanden');
  keys.forEach(k => {
    const p = WW_TYP_PROFILE[k];
    const sum = p.pct.reduce((a, v) => a + v, 0);
    ok(p.pct.length === 24 && p.pct.every(v => isFinite(v) && v >= 0), k + ': 24 endliche Stundenwerte ≥ 0');
    eq(sum, 100, k + ': Σ Stundenwerte = 100');
    ok(p.peakIdx >= 0 && p.peakIdx < 24 && p.pct[p.peakIdx] === Math.max(...p.pct),
      k + ': peakIdx zeigt auf den grössten Stundenwert');
  });
  // Basis-Spitze = Default-Stundenspitze (Cross-Block-Konsistenz mit WW_SPITZE_PROFIL)
  Object.keys(SPITZE).forEach(k => {
    const p = WW_TYP_PROFILE[k];
    ok(!!p, 'WW_SPITZE_PROFIL.' + k + ' hat ein Profil in WW_TYP_PROFILE');
    if (p) eq(p.pct[p.peakIdx], SPITZE[k], k + ': Basis-Spitze == WW_SPITZE_PROFIL (' + SPITZE[k] + ' %)');
  });
  eq(WW_TYP_PROFILE.wohnbau.pct[10], 9, 'wohnbau: Basis-Spitze 9 % in Stunde 10–11 (SIA 385/2 Sa–So)');
  // Bestandsschutz: die bisherigen Keys behalten ihre Werte, Varianten additiv
  eq(SPITZE.hotel, 12.5, 'Alt-Wert hotel = 12.5 unverändert');
  eq(SPITZE.altersheim, 19.3, 'Alt-Wert altersheim = 19.3 unverändert');
  eq(SPITZE.spital, 14.0, 'Alt-Wert spital = 14.0 unverändert');
  eq(SPITZE.studentenheim, 6.6, 'Alt-Wert studentenheim = 6.6 unverändert');
  eq(SPITZE.buero, 20.0, 'Alt-Wert buero = 20.0 unverändert');
  eq(SPITZE.restaurant, 13.5, 'Alt-Wert restaurant = 13.5 unverändert');
  eq(SPITZE.hotel_tourist, 20.5, 'Variante hotel_tourist = 20.5 (SI 1991)');
  eq(SPITZE.altersheim_din, 15.7, 'Variante altersheim_din = 15.7 (DIN EN 12831-3)');
  eq(SPITZE.spital_din, 10.5, 'Variante spital_din = 10.5 (DIN EN 12831-3)');
  eq(SPITZE.restaurant_din, 15.7, 'Variante restaurant_din = 15.7 (DIN EN 12831-3)');
  ok(Object.keys(LABEL).length === 11, 'WW_PROFIL_LABEL: 11 Einträge (wohnbau + 10 Profile)');
  ok(Object.keys(SPITZE).every(k => LABEL[k]), 'jeder WW_SPITZE_PROFIL-Key hat ein Label');
}

console.log('■ B — wwTypProfilEff: Spitzenstunden-Ersatz + Skalierung (Excel-Mechanik)');
{
  // Hotel: Spitze 20 % statt 12.5 % → C9 = (100−20)/87.5 · B9
  const eff = wwTypProfilEff('hotel', 20);
  eq(eff[17], 20, 'Spitzenstunde trägt die effektive Spitze');
  eq(eff.reduce((a, v) => a + v, 0), 100, 'Σ bleibt exakt 100');
  eq(eff[0], 0.5 * (100 - 20) / 87.5, 'übrige Stunden skalieren mit (100−sp)/(100−Basis)');
  // Basis-Durchreichung: sp == Basis → Faktor 1 (Profil unverändert)
  const b = wwTypProfilEff('buero', 20);
  ok(WW_TYP_PROFILE.buero.pct.every((v, i) => Math.abs(b[i] - v) < 1e-12), 'sp == Basis-Spitze → Profil unverändert (buero)');
  // sp ≤ 0 / nicht endlich → Basisprofil
  const n0 = wwTypProfilEff('wohnbau', 0);
  ok(WW_TYP_PROFILE.wohnbau.pct.every((v, i) => Math.abs(n0[i] - v) < 1e-12), 'sp = 0 → Basisprofil');
  const nn = wwTypProfilEff('wohnbau', NaN);
  ok(WW_TYP_PROFILE.wohnbau.pct.every((v, i) => Math.abs(nn[i] - v) < 1e-12), 'sp = NaN → Basisprofil');
  // Wohnbau-Formel kann rechnerisch > 100 % liegen → Klemme auf 100 (keine negativen Stunden)
  const c = wwTypProfilEff('wohnbau', 250);
  eq(c[10], 100, 'sp > 100 → auf 100 geklemmt');
  ok(c.every(v => v >= 0), 'keine negativen Stundenwerte');
  eq(c.reduce((a, v) => a + v, 0), 100, 'Σ = 100 auch im Klemmfall');
  // unbekanntes Profil → Wohnbau-Fallback
  const u = wwTypProfilEff('gibts_nicht', 0);
  ok(WW_TYP_PROFILE.wohnbau.pct.every((v, i) => Math.abs(u[i] - v) < 1e-12), 'unbekannter Key → Wohnbau-Fallback');
}

console.log('■ C — wwSoMenge: Menge WW pro Ladung (Excel AN257/AN266)');
{
  ok(wwSoMenge(50, 1) === 859.8041557200859, 'wwSoMenge(50 kW, 1 h) === 859.8041557200859 (Excel-Cache exakt)');
  eq(wwSoMenge(50, 2), 2 * 859.8041557200859, '2 h Ladezeit → doppelte Menge');
  eq(wwSoMenge(0, 1), 0, 'ohne Leistung keine Menge');
  eq(wwSoMenge(50, 0), 0, 'ohne Ladezeit keine Menge');
}

console.log('■ D — wwSoTag: 24-h-Simulation (Blatt-Zeilen 52–57 + AC17)');
{
  const marks = []; marks[4] = true; marks[5] = true;
  const so = wwSoTag({ tagesbedarf: 1000, spitzePct: 12, startInhalt: 500, kapazitaet: 500,
    ladungProStunde: 300, marks, spitzendeckung: 200 });
  // Referenz-Nachrechnung von Hand (dieselbe Excel-Kette, unabhängig ausgeschrieben)
  const eff = wwTypProfilEff('wohnbau', 12);
  let inhalt = 500, refMin = 500, refMinIdx = -1, refKein = false, refUeb = false;
  const refInhalt = [];
  for (let h = 0; h < 24; h++) {
    inhalt = inhalt - 1000 / 100 * eff[h] + (marks[h] ? 300 : 0);
    refInhalt.push(inhalt);
    if (inhalt < 200 - 1e-9) refKein = true;
    if (inhalt > 500 + 1e-9) refUeb = true;
    if (inhalt < refMin) { refMin = inhalt; refMinIdx = h; }
  }
  ok(so.rows.length === 24, '24 Stundenzeilen');
  ok(so.rows.every((r, h) => Math.abs(r.inhalt - refInhalt[h]) < 1e-9), 'Speicherinhalt-Verlauf == Referenz-Nachrechnung (N54/O54-Kette)');
  eq(so.rows[0].inhalt, 500 - 10 * eff[0], 'N54: Start − Verbrauch₀ + Prod₀ (Stunde 0 zählt mit)');
  eq(so.rows[4].prod, 300, 'markierte Stunde produziert ladungProStunde');
  eq(so.rows[3].prod, 0, 'unmarkierte Stunde produziert nichts');
  ok(so.markCount === 2, 'markCount = 2');
  eq(so.min, refMin, 'min. Speicherinhalt == Referenz');
  ok(so.minIdx === refMinIdx, 'minIdx == Referenz (' + so.minIdx + ')');
  eq(so.optimierung, refMin - 200, 'Optimierung (AC17) = min. Inhalt − Spitzendeckung');
  ok(so.keinWw === refKein && refKein === true, '«kein WW» erkannt (Inhalt < Spitzendeckung, Zeile 57)');
  ok(so.ueberlauf === refUeb && refUeb === true, '«Überlauf» erkannt (Inhalt > Kapazität, Zeile 56)');
  eq(so.ende, 500 - 1000 + 600, 'Endinhalt = Start − Tagesbedarf + Σ Produktion');
  // Fixpunkt: Startfüllung um die Optimierung verschieben → min landet exakt auf der Spitzendeckung
  const so2 = wwSoTag({ tagesbedarf: 1000, spitzePct: 12, startInhalt: 500 - so.optimierung,
    kapazitaet: 500 - so.optimierung, ladungProStunde: 300, marks, spitzendeckung: 200 });
  eq(so2.min, 200, 'Fixpunkt: nach Übernahme liegt der min. Inhalt exakt auf der Spitzendeckung');
  eq(so2.optimierung, 0, 'Fixpunkt: Optimierung = 0');
  // Leerlauf: keine Marken, kein Bedarf → konstanter Inhalt, keine Flags
  const so3 = wwSoTag({ tagesbedarf: 0, spitzePct: 0, startInhalt: 400, kapazitaet: 400,
    ladungProStunde: 300, marks: [], spitzendeckung: 100 });
  ok(so3.rows.every(r => r.inhalt === 400), 'ohne Bedarf/Marken bleibt der Inhalt konstant');
  ok(!so3.keinWw && !so3.ueberlauf && so3.markCount === 0, 'keine Flags im Leerlauf');
}

console.log('■ E — wwWrg: WRG-Duschen (Excel-Referenz 12 Duschen · einfach · η 40 %)');
{
  const w = wwWrg(12, false, 40);
  eq(w.nlEinzel, 25, 'einfach/mittel → 25 Normliter (Y21)');
  ok(w.kwhEinzel === 25 * 0.058, 'kWh pro Vorgang = Nl · 0.058 (AD21)');
  eq(w.nlTotal, 300, 'Total 300 Normliter (Y23)');
  eq(w.kwhTotal, 17.400000000000002, 'Total 17.4 kWh (AD23, Excel-Cache)', 1e-12);
  eq(w.redEinzel, 0.5800000000000001, 'Reduktion pro Vorgang 0.58 kWh (AD30, Excel-Cache)', 1e-12);
  eq(w.redTotal, 6.960000000000001, 'Reduktion 6.96 kWh/d (Y30, Excel-Cache)', 1e-12);
  const w2 = wwWrg(10, true, 50);
  eq(w2.nlEinzel, 35, 'gehoben → 35 Normliter');
  eq(w2.nlTotal, 350, 'Total 350 Normliter');
  eq(w2.redTotal, 50 * (350 * 0.058) / 100, 'Reduktion = η · kWh ÷ 100');
  const w0 = wwWrg(0, false, 40);
  ok(w0.nlTotal === 0 && w0.redTotal === 0, 'ohne Duschen keine Reduktion (informativ leer)');
}

console.log('■ F — Statische Marker (Markup, Restore, Cross-Block-Guards)');
{
  ['wwSoCard', 'ww_soLadezeit', 'wwSoHours', 'wwSoCanvas', 'wwSoApplyBtn',
   'ww_out_soMenge', 'ww_out_soProdH', 'ww_out_soStart', 'ww_out_soMin',
   'ww_out_soOpt', 'ww_out_soStatus', 'ww_out_ladezeitTotal',
   'ww_wrgAnzahl', 'ww_wrgStd', 'ww_wrgEta', 'ww_out_wrgRed', 'ww_out_wrgTot',
   'ww_vfGrob', 'ww_vfFein'].forEach(id => {
    ok(html.indexOf('id="' + id + '"') >= 0, 'Markup-ID vorhanden: ' + id);
  });
  ok(/st\.so&&typeof st\.so==='object'&&Array\.isArray\(st\.so\.h\)/.test(html),
    'wwRestoreFromTA restauriert wwState.so geguardet (additiv)');
  ok(html.indexOf('WW_FEINSL_MAP') < 0, 'VSSH-Fallback-Map entfernt — Summenlinien nutzen echte Typ-Profile');
  ok(/wwTypProfilEff\(profKey,o\.spPct\)/.test(html), 'wwFeinSlDraw nutzt wwTypProfilEff (echtes Profil je Zeile)');
  ok(/typeof wwSoMenge==='function'/.test(html) && /typeof wwSoTag==='function'/.test(html)
    && /typeof wwWrg==='function'/.test(html), 'wwCalc ruft die Engine-Funktionen typeof-geguardet (Cross-Block)');
  ok(/typeof wwSoRender==='function'/.test(html), 'wwRenderCalc ruft wwSoRender typeof-geguardet');
  ok(/id="ww_soLadezeit"[^>]*inputmode="decimal"/.test(html)
    && /onblur="fixLeadingZero\(this\)"[^>]*id="ww_soLadezeit"/.test(html),
    'ww_soLadezeit: type=text + inputmode=decimal + fixLeadingZero (Kanon)');
  ok(html.indexOf('type="number"') < 0, 'kein type="number" in der Datei');
  ok(/Canvas-Zeichnungen \(Summenlinien ③, Speicheroptimierung ④\)/.test(html),
    'Tab-Wechsel rechnet nach (Canvas-Breiten in versteckten Tabs)');
  ok(/Reduktion fliesst nicht automatisch in den Tagesbedarf/.test(html),
    'WRG-Karte weist den Informativ-Charakter aus (kein stilles Verhalten)');
  // Übernahme-Guard: im Override-Feld heisst 0 «errechneter Wert» — eine Reduktion
  // auf ≤ 0 wäre dort nicht darstellbar (stiller No-Op). wwSoApply muss den
  // Überschuss BENENNEN statt still 0 zu schreiben.
  const applyFn = html.match(/window\.wwSoApply=function\(\)\{[\s\S]*?\n\};/);
  ok(!!applyFn, 'wwSoApply gefunden');
  ok(applyFn && /if\(neu<=0\)\{/.test(applyFn[0]) && /Überschuss/.test(applyFn[0]),
    'wwSoApply: Guard neu≤0 → Dialog benennt den Überschuss (kein stiller 0-Write)');
  ok(applyFn && !/Math\.max\(0,/.test(applyFn[0]),
    'wwSoApply: keine stille Math.max(0,…)-Klemme mehr');
}

console.log('■ G — Syntax aller Inline-Script-Blöcke');
{
  const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
  ok(scripts.length >= 2, scripts.length + ' Inline-Script-Blöcke gefunden');
  scripts.forEach((s, i) => {
    let pass = true, err = '';
    try { new Function(s[1]); } catch (e) { pass = false; err = String(e); }
    ok(pass, 'Script-Block ' + (i + 1) + ' parst' + (err ? ' — ' + err : ''));
  });
}

console.log('\n' + okCount + ' ok, ' + failCount + ' fail');
process.exit(failCount ? 1 : 0);
