// Drift-Guard Feedback 05.09.2026 — Hydraulik Kreisprofil (sb_kreisprofil.html)
//
// Sandro Caso (Sanitärplaner), 2 Punkte:
//  #1 «Abzug Rohrdruchemsser manuelles Feld ergänzen (z.B. Inliner)» — Feld
//     `kp_abzug` direkt unter «Innendurchmesser gewählt D_i». Gewählte Semantik:
//     Wandstärke s der Innenbeschichtung, die BEIDSEITIG an der Rohrwand liegt →
//     D_i,eff = D_i − 2·s (Engine `kpDiEff`). Der wirksame Durchmesser speist die
//     GANZE Rechenkette (Vollfüllung, 15-Stufen-Tabelle, Betriebspunkt, Schema);
//     der eingegebene D_i bleibt unangetastet (DN-Löse-Guard vergleicht den ROHEN
//     Wert). Ein Abzug ≥ D_i/2 wird GEMELDET (Hinweis rot, Warnbox, Tabellen-
//     Platzhalter, Schema-Hinweis), nie still gekappt. Deep-Link `&abzug=` optional.
//  #2 «Füllgrad 0.7 in einem Rohr entspricht nicht 70 % Querschnittsfläche
//     (sondern ca. 74.8%) aber 70% Rohrhöhe. beiden angeben und Darstellung
//     korrekt wiedergeben.» — h/D_i ist ein HÖHEN-Füllgrad; der Flächen-Füllgrad
//     A/A_v = (φ − sin φ)/(2π) mit φ = 4·arcsin(√t) liegt bei t = 0.7 bei ≈ 0.748
//     (Engine `kpFlaechenanteil`, `kpTeil` liefert `aRel`). Beide Grössen stehen
//     getrennt in KPI-Kachel, Tabellen-Spalte, Schema (Kreis-Text + 0.7-Linie)
//     und Q_0.7-Zeile; die doppeldeutigen Alt-Texte sind entfernt.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260905_kreisprofil_test.mjs
// (Teile A+B laufen ohne Browser; ohne playwright-core/Chromium wird Teil C
//  mit Hinweis übersprungen, nie still.)
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, l, info) => {
  if (c) { pass++; console.log('  ✓ ' + l); }
  else { fail++; console.error('  ✗ FAIL: ' + l + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};
const num = (s) => parseFloat(String(s == null ? '' : s).replace(/[’']/g, '').replace(',', '.'));

const src = readFileSync(join(ROOT, 'sb_kreisprofil.html'), 'utf8');
const engM = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
const svgM = src.match(/window\._kpSchemaDraw=function[\s\S]*?<\/script>/);
const svgBlock = svgM ? svgM[0] : '';

// ══════════════════════════════════════════════════════════════════════
console.log('■ A: Statische Checks — Feld, Markup, Verdrahtung');
// ══════════════════════════════════════════════════════════════════════
{
  ok(!!engM, 'ENGINE-Block vorhanden (/*ENGINE-START*/ … /*ENGINE-END*/)');
  ok(!!svgM, 'SVG-Script-Block (window._kpSchemaDraw) gefunden');

  // #1 — Feld direkt unter kp_di, Kanon numerische Inputs
  const fld = src.match(/<input[^>]*id="kp_abzug"[^>]*>\s*<span class="fg-unit">([^<]*)<\/span>/);
  ok(!!fld, 'Feld kp_abzug mit angeschlossener Einheiten-Box gefunden');
  if (fld) {
    ok(/type="text"/.test(fld[0]) && /inputmode="decimal"/.test(fld[0]), 'kp_abzug: type="text" inputmode="decimal" (kein type=number)');
    ok(/onblur="fixLeadingZero\(this\)"/.test(fld[0]), 'kp_abzug: fixLeadingZero am Feld');
    ok(fld[1].trim() === 'mm', 'Einheiten-Box trägt «mm»', fld[1]);
  }
  ok(src.indexOf('type="number"') < 0, 'nirgends type="number"');
  const iDi = src.indexOf('id="kp_di"'), iAb = src.indexOf('id="kp_abzug"');
  ok(iDi > 0 && iAb > iDi && iAb - iDi < 700, 'Abzug-Feld steht DIREKT unter dem D_i-Feld (Screenshot-Position)', { iDi, iAb });
  ok(/id="kp_abzug_hint"[^>]*>Wandstärke s der Innenbeschichtung — beidseitig: D<sub>i,eff<\/sub> = D<sub>i<\/sub> − 2·s/.test(src),
    'Hinweis am Feld nennt die Semantik (Wandstärke beidseitig, D_i,eff = D_i − 2·s)');

  // Verdrahtung: wirksamer Durchmesser speist die Kette
  ok(/var di=kpDiEff\(diRoh,abzug\);/.test(src), 'kpRecalc rechnet di = kpDiEff(diRoh, abzug)');
  ok(/kpVoll\(di,gef,kb,nu\)/.test(src) && /kpTabelle\(di,gef,kb,nu\)/.test(src) && /kpBetriebspunkt\(q,di,gef,kb,nu\)/.test(src),
    'Vollfüllung, Tabelle und Betriebspunkt laufen ALLE über den wirksamen di');
  ok(/liste\[i\]\[1\]-diRoh\)<1e-9/.test(src), 'DN-Löse-Guard vergleicht den ROHEN D_i (Abzug löst die DN-Wahl nicht)');
  ok(/id="kp_out_dieff"/.test(src) && /Wirksamer Innendurchmesser D<sub>i,eff<\/sub>/.test(src), 'Ergebnis-Zeile «Wirksamer Innendurchmesser D_i,eff»');
  ok(/id="kp_note_abzug"/.test(src) && /Abzug zu gross/.test(src), 'Warnbox kp_note_abzug («Abzug zu gross») vorhanden');
  ok(/\['abzug','kp_abzug'\]/.test(src), 'Deep-Link-Mapping abzug → kp_abzug');
  ok(/\?q=&gef=&kb=&di=&temp=&abzug=/.test(src), 'Deep-Link-Kommentar nennt den optionalen Parameter');
  ok(!engM || /function kpDiEff\(/.test(engM[1]), 'kpDiEff liegt IM ENGINE-Block (DOM-frei)');
  ok(!engM || /function kpFlaechenanteil\(/.test(engM[1]), 'kpFlaechenanteil liegt IM ENGINE-Block (DOM-frei)');
  ok(!engM || /aRel:\(phi-Math\.sin\(phi\)\)\/\(2\*Math\.PI\)/.test(engM[1]), 'kpTeil liefert aRel (Flächen-Füllgrad) mit');

  // #2 — beide Füllgrade getrennt ausgewiesen
  ok(/id="kp_kpi_fuell"[\s\S]{0,120}Höhen-Füllgrad h\/D<sub>i<\/sub> bei Q<sub>max<\/sub>/.test(src), 'KPI-Kachel «Höhen-Füllgrad h/D_i»');
  ok(/id="kp_kpi_afuell"[\s\S]{0,120}Flächen-Füllgrad A\/A<sub>v<\/sub> bei Q<sub>max<\/sub>/.test(src), 'KPI-Kachel «Flächen-Füllgrad A/A_v»');
  ok(/title="Flächen-Füllgrad:[^"]*">A\/A<sub>v<\/sub><\/th>/.test(src), 'Tabellen-Spalte A/A_v mit erklärendem Tooltip');
  ok(/title="Höhen-Füllgrad:[^"]*">h\/D<sub>i<\/sub><\/th>/.test(src), 'Tabellen-Spalte h/D_i als Höhen-Füllgrad beschriftet');
  const cs13 = (src.match(/colspan="13"/g) || []).length;
  ok(cs13 === 2, 'colspan="13" an BEIDEN Platzhaltern (Markup + JS)', cs13);
  ok(src.indexOf('colspan="12"') < 0, 'kein veraltetes colspan="12"');
  ok(/Max\. Abflusswert bei Füllgrad h\/D<sub>i<\/sub> = 0\.7/.test(src) && /A\/A<sub>v<\/sub> ≈ 0\.748/.test(src),
    'Q_0.7-Zeile: 0.7 als Höhen-Füllgrad + Chip «A/A_v ≈ 0.748» (die Kundenzahl 74.8 %, nicht auf 0.75 gerundet)');
  ok(/frml-sym">A\/A<sub>v<\/sub><\/span>[\s\S]{0,200}\(φ − sin φ\)\/\(2π\)/.test(src), 'Formel-Legende A/A_v = (φ − sin φ)/(2π)');
  ok(src.indexOf('Bemessungsgrenze 70 %') < 0, 'doppeldeutiger Alt-Text «Bemessungsgrenze 70 %» ist weg');
  ok(src.indexOf('Füllgrad bei Q<tspan') < 0, 'doppeldeutiger Alt-Text «Füllgrad bei Q_max» im Kreis ist weg');
  ok(src.indexOf('> = 0.7</tspan>') < 0, 'alte 0.7-Beschriftung ohne Höhen-/Flächen-Angabe ist weg');

  // SVG-Block
  ok(svgBlock.indexOf('= 0.7 (Höhe)') >= 0 && svgBlock.indexOf('(Fläche)') >= 0, 'Schema: 0.7-Linie als «(Höhe)» beschriftet + Flächen-Angabe daneben');
  ok(svgBlock.indexOf('Höhen-Füllgrad') >= 0 && svgBlock.indexOf('Flächen-Füllgrad') >= 0, 'Schema: Kreis-Text nennt Höhen- UND Flächen-Füllgrad');
  ok(svgBlock.indexOf("'i,eff'") >= 0 && svgBlock.indexOf('Inliner s = ') >= 0, 'Schema: D_i,eff + Inliner-Zeile bei Abzug');
  ok(svgBlock.indexOf('Abzug zu gross') >= 0, 'Schema: Leerzustand meldet «Abzug zu gross»');
  ok(svgBlock.indexOf('var(--') < 0, 'SVG-Block ohne CSS-Variablen (nur literale Farben — GemaPDF-Regel)');
  ok(!/Q<sub>0\.7<\/sub>[^<]*=[^<]*0\.7[^<]*Q<sub>v/.test(src), 'nirgends «Q_0.7 = 0.7·Q_v» (der Faktor bleibt 0.84)');
}

// ══════════════════════════════════════════════════════════════════════
console.log('■ B: Engine (Node) — Flächen-Füllgrad + Abzug durchgängig');
// ══════════════════════════════════════════════════════════════════════
if (engM) {
  const E = new Function(engM[1] + ';return {kpDiEff,kpFlaechenanteil,kpTeil,kpVoll,kpTabelle,kpBetriebspunkt,kpNu,kpStatus,kpNum};')();
  const nu = E.kpNu(10);

  // Bestandsschutz (Auftrag): ein LEERES kp_abzug liefert exakt die Excel-Referenz des bestehenden
  // kreisprofil_engine_test (Di 96 mm / Is 1 % / kb 1 / 10 °C → v_v 0.6902316 m/s, Q_v 4.9961 l/s).
  ok(E.kpDiEff(96, '') === 96 && E.kpDiEff(96, undefined) === 96 && E.kpDiEff('96', ' ') === 96, 'leeres Abzug-Feld: D_i,eff === D_i (96 — leer / undefined / Leerzeichen)');
  const ref = E.kpVoll(E.kpDiEff(96, ''), 1, 1, nu);
  ok(Math.abs(ref.v - 0.6902316) < 5e-7, 'Bestandsschutz: v_v = 0.6902316 m/s (Excel B18) mit leerem Abzug', ref.v);
  ok(Math.abs(ref.qLs - 4.9961) < 5e-4, 'Bestandsschutz: Q_v = 4.9961 l/s (Excel B19) mit leerem Abzug', ref.qLs);
  const bpRef = E.kpBetriebspunkt(2.5, E.kpDiEff(96, ''), 1, 1, nu);
  ok(bpRef && !bpRef.ueber && Math.abs(bpRef.t - 0.5) < 1e-3 && Math.abs(E.kpFlaechenanteil(bpRef.t) - 0.5) < 2e-3, 'Bestandsschutz: Q 2.5 l/s → h/D_i ≈ 0.5 UND A/A_v ≈ 0.5 (Excel-Beispiel)', bpRef && bpRef.t);

  // Unabhängige Gegenrechnung: Kreissegment-Fläche per Simpson-Integration der Sehnenbreiten
  const segAnteil = (t) => {
    const r = 0.5, h = t, N = 20000, dy = h / N; let s = 0;
    const w = (y) => 2 * Math.sqrt(Math.max(0, r * r - (y - r) * (y - r)));
    for (let i = 0; i <= N; i++) { const f = w(i * dy); s += (i === 0 || i === N) ? f : (i % 2 ? 4 * f : 2 * f); }
    return (s * dy / 3) / (Math.PI * r * r);
  };
  const a07 = E.kpFlaechenanteil(0.7);
  ok(Math.abs(a07 - 0.7477) < 6e-4, 'kpFlaechenanteil(0.7) ≈ 0.748 (Feedback: «ca. 74.8 %»)', a07);
  ok(Math.abs(a07 - 0.7) > 0.04, 'Flächen-Füllgrad bei h/D_i = 0.7 ist NICHT 0.7 (Kern des Feedbacks)', a07);
  ok(Math.abs(a07 - segAnteil(0.7)) < 1e-6, 'stimmt mit der unabhängigen Simpson-Integration überein', segAnteil(0.7));
  ok(Math.abs(E.kpFlaechenanteil(0.5) - 0.5) < 1e-12, 'bei h/D_i = 0.5 sind Höhe und Fläche exakt gleich (0.5)');
  ok(E.kpFlaechenanteil(0) === 0 && E.kpFlaechenanteil(1) === 1 && E.kpFlaechenanteil(1.3) === 1 && E.kpFlaechenanteil(-0.2) === 0,
    'Ränder: 0 → 0, 1 → 1, > 1 → 1, < 0 → 0');
  let mono = true, prev = -1;
  for (let t = 0.02; t <= 0.98; t += 0.02) { const v = E.kpFlaechenanteil(t); if (!(v > prev)) mono = false; prev = v; }
  ok(mono, 'kpFlaechenanteil ist streng monoton steigend');
  ok(Math.abs(E.kpFlaechenanteil(0.3) - segAnteil(0.3)) < 1e-6 && Math.abs(E.kpFlaechenanteil(0.9) - segAnteil(0.9)) < 1e-6,
    'weitere Stützstellen (0.3 / 0.9) gegen die Integration');

  // kpTeil.aRel konsistent mit kpFlaechenanteil und mit a/Av
  const r07 = E.kpTeil(0.7 * 0.096, 96, 1, 1, nu);
  ok(r07 && Math.abs(r07.t - 0.7) < 1e-12, 'kpTeil bei h = 0.7·D_i liefert t = 0.7 (Höhe)');
  ok(r07 && Math.abs(r07.aRel - E.kpFlaechenanteil(0.7)) < 1e-12, 'kpTeil.aRel = kpFlaechenanteil(t)');
  ok(r07 && Math.abs(r07.aRel - r07.a / (Math.PI * 0.096 * 0.096 / 4)) < 1e-12, 'kpTeil.aRel = A / A_v (Geometrie-Identität)');
  const tab = E.kpTabelle(96, 1, 1, nu);
  ok(tab.length === 15 && tab.every(r => Math.abs(r.aRel - E.kpFlaechenanteil(r.t)) < 1e-12), 'alle 15 Tabellen-Stufen tragen einen konsistenten aRel');
  ok(tab[0].t === 1 && tab[0].aRel === 1, 'Vollfüllung: t = 1 und aRel = 1');

  // #1 — Abzug-Semantik
  ok(E.kpDiEff(207, 3) === 201, 'kpDiEff(207, 3) = 201 (beidseitig: 207 − 2·3)');
  ok(E.kpDiEff(207, 0) === 207 && E.kpDiEff(207, '') === 207 && E.kpDiEff(207, null) === 207, 'ohne Abzug bleibt D_i unverändert (0 / leer / null)');
  ok(E.kpDiEff('207', '1,5') === 204, 'Strings + Komma-Dezimal werden gelesen (207 − 2·1.5 = 204)');
  ok(E.kpDiEff(100, 60) === 0 && E.kpDiEff(100, 50) === 0, 'Abzug ≥ D_i/2 → 0, nie negativ (wird im UI gemeldet)');
  ok(E.kpDiEff(0, 3) === 0 && E.kpDiEff('', 3) === 0, 'ohne D_i → 0');

  // Gegenprobe: der Abzug verändert das Ergebnis wirklich — über die ganze Kette
  const vRoh = E.kpVoll(207, 1, 1, nu), vEff = E.kpVoll(E.kpDiEff(207, 3), 1, 1, nu);
  ok(vEff.qLs < vRoh.qLs && vEff.av < vRoh.av && vEff.uv < vRoh.uv, 'Vollfüllung: Q_v, A_v, U_v sinken mit Abzug', { qRoh: vRoh.qLs, qEff: vEff.qLs });
  ok(Math.abs(vEff.av / vRoh.av - (201 / 207) * (201 / 207)) < 1e-12, 'A_v skaliert exakt mit (D_i,eff/D_i)²');
  const bRoh = E.kpBetriebspunkt(25, 207, 1, 1, nu), bEff = E.kpBetriebspunkt(25, 201, 1, 1, nu);
  ok(bRoh && bEff && !bRoh.ueber && !bEff.ueber && bEff.t > bRoh.t, 'Betriebspunkt: gleicher Q_max füllt das kleinere Rohr höher', { tRoh: bRoh && bRoh.t, tEff: bEff && bEff.t });
  ok(bEff && Math.abs(E.kpTeil(bEff.h, 201, 1, 1, nu).qLs - 25) < 1e-6, 'Betriebspunkt wird auf dem WIRKSAMEN Rohr (201) gelöst');
  const tEff = E.kpTabelle(201, 1, 1, nu);
  ok(tEff.length === 15 && Math.abs(tEff[0].h - 0.201) < 1e-12, 'Tabelle: erste Stufe = D_i,eff (201 mm), nicht der rohe D_i');
  ok(E.kpTabelle(E.kpDiEff(100, 60), 1, 1, nu).length === 0 && E.kpBetriebspunkt(5, 0, 1, 1, nu) === null,
    'Abzug zu gross → leere Tabelle + kein Betriebspunkt (kein erfundener Wert)');
} else {
  ok(false, 'ENGINE-Block nicht extrahierbar — Engine-Checks übersprungen');
}

// ══════════════════════════════════════════════════════════════════════
console.log('■ C: Browser — Kette, DN-Guard, Meldung, Deep-Link, Darstellung');
// ══════════════════════════════════════════════════════════════════════
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) { chromium = null; }
if (!chromium) {
  console.log('  (übersprungen: playwright-core nicht installiert — Teil C braucht Chromium)');
} else {
  const { startServer, newPage, seed, BASE } = await import('./rolematrix_harness.mjs');
  const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROME });
  const errs = [];
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  page.on('pageerror', e => errs.push(e.message));
  const txt = (id) => page.locator('#' + id).innerText();
  const val = (id) => page.inputValue('#' + id);
  const firstHt = () => page.locator('#kp_tbody tr').first().locator('td').first().innerText();
  const svgHtml = () => page.locator('#kpSchema').innerHTML();

  await page.goto(BASE + '/sb_kreisprofil.html?q=25&gef=1&kb=1&di=207');
  await page.waitForTimeout(2000);

  console.log('— Ausgangslage (DN 225, D_i 207, Q 25 l/s, 1 %) —');
  ok((await page.locator('body').innerText()).indexOf('Kein Zugriff') < 0, 'Planer hat Zugriff');
  ok((await val('kp_di')) === '207' && (await val('kp_abzug')) === '', 'Deep-Link ohne abzug: D_i 207, Abzug-Feld leer (kein Phantomwert)');
  ok((await txt('kp_out_dieff')).indexOf('207 mm') === 0, 'D_i,eff = 207 mm ohne Abzug');
  const base = { qv: num(await txt('kp_out_qv')), av: num(await txt('kp_out_av')), fuell: num(await txt('kp_kpi_fuell')), ht: await firstHt(), afuell: await txt('kp_kpi_afuell') };
  ok(base.qv > 0 && base.av > 0 && base.fuell > 0, 'Basiswerte gerechnet', base);
  ok(base.ht === '207.0', 'Tabelle: erste Stufe h_T = 207.0 mm', base.ht);
  const thN = await page.evaluate(() => document.getElementById('kp_tbody').closest('table').querySelectorAll('thead th').length);
  const tdN = await page.locator('#kp_tbody tr').first().locator('td').count();
  ok(thN === 13 && tdN === 13, 'Tabelle hat 13 Spalten (neue Spalte A/A_v)', { thN, tdN });
  const afuellErw = await page.evaluate(() => kpFmt(kpFlaechenanteil(_kpLast.bp.t) * 100, 1) + ' %');
  ok(base.afuell === afuellErw, 'KPI Flächen-Füllgrad = kpFlaechenanteil(bp.t)', { ist: base.afuell, soll: afuellErw });
  ok(num(base.afuell) > base.fuell, 'Flächen-Füllgrad liegt über dem Höhen-Füllgrad (t > 0.5)', { hoehe: base.fuell, flaeche: base.afuell });
  ok((await txt('kp_kpi_afuells')).indexOf('bei h/Di = 0.7 wären es 74.8 %') >= 0, 'KPI-Untertitel erklärt: bei h/Di = 0.7 wären es 74.8 %');
  const tdAb = await page.locator('#kp_tbody tr').first().locator('td').nth(2).innerText();
  ok(tdAb.indexOf('100.0 %') === 0, 'Tabelle: A/A_v der Vollfüllung = 100.0 %', tdAb);
  const svg0 = await svgHtml();
  ok(svg0.indexOf('= 0.7 (Höhe)') >= 0 && svg0.indexOf('≈ 0.748 (Fläche)') >= 0, 'Schema: 0.7-Linie zeigt «= 0.7 (Höhe)» und «≈ 0.748 (Fläche)»');
  ok(svg0.indexOf('Höhen-Füllgrad') >= 0 && svg0.indexOf('Flächen-Füllgrad') >= 0, 'Schema: beide Füllgrade im Kreis');
  ok(svg0.indexOf('Inliner') < 0 && svg0.indexOf('i,eff') < 0, 'Schema ohne Abzug: keine Inliner-Beschriftung');

  console.log('— Feedback #2: Betriebspunkt genau bei h/D_i = 0.7 —');
  const q07 = await page.evaluate(() => kpTeil(0.7 * 0.207, 207, 1, 1, _kpLast.nu).qLs);
  await page.fill('#kp_q', q07.toFixed(4)); await page.waitForTimeout(300);
  ok((await txt('kp_kpi_fuell')) === '70 %', 'Höhen-Füllgrad 70 %', await txt('kp_kpi_fuell'));
  ok((await txt('kp_kpi_afuell')) === '74.8 %', 'Flächen-Füllgrad dazu 74.8 % (nicht 70 % — exakt die Kundenzahl)', await txt('kp_kpi_afuell'));
  const bpRow = await page.locator('#kp_tbody tr.kp-mass').innerText();
  ok(bpRow.indexOf('70 %') >= 0 && bpRow.indexOf('74.8 %') >= 0, 'Betriebspunkt-Zeile: 70 % Höhe · 74.8 % Fläche', bpRow.slice(0, 80));
  const svg07 = await svgHtml();
  ok(svg07.indexOf('70 %') >= 0 && svg07.indexOf('= 74.8 %') >= 0, 'Schema-Kreis: «70 %» + «Flächen-Füllgrad … = 74.8 %»');
  await page.fill('#kp_q', '25'); await page.waitForTimeout(300);

  console.log('— Feedback #1: Abzug 3 mm (Inliner) —');
  await page.fill('#kp_abzug', '3'); await page.waitForTimeout(300);
  ok((await val('kp_di')) === '207', 'roher D_i bleibt 207 (Feld unangetastet)');
  const dieff = await txt('kp_out_dieff');
  ok(dieff.indexOf('201 mm') === 0 && dieff.indexOf('2·3') >= 0, 'D_i,eff = 201 mm (= 207 − 2·3)', dieff);
  ok((await page.locator('#kp_abzug_hint').innerHTML()).indexOf('<b>201 mm</b>') >= 0, 'Hinweis am Feld rechnet vor: 207 − 2·3 = 201 mm');
  const last = await page.evaluate(() => ({ di: _kpLast.di, diRoh: _kpLast.diRoh, abzug: _kpLast.abzug }));
  ok(last.di === 201 && last.diRoh === 207 && last.abzug === 3, '_kpLast trägt di 201 / diRoh 207 / abzug 3', last);
  const eff = { qv: num(await txt('kp_out_qv')), av: num(await txt('kp_out_av')), fuell: num(await txt('kp_kpi_fuell')), ht: await firstHt() };
  ok(eff.qv < base.qv && eff.av < base.av, 'Vollfüllung: Q_v und A_v sinken (Abzug wirkt, nicht nur Anzeige)', { base, eff });
  ok(eff.fuell > base.fuell, 'Höhen-Füllgrad steigt (kleineres Rohr, gleicher Q_max)', { base: base.fuell, eff: eff.fuell });
  ok(eff.ht === '201.0', 'Tabelle: erste Stufe h_T = 201.0 mm (D_i,eff/15-Raster)', eff.ht);
  ok(await page.evaluate(() => Math.abs(kpTeil(_kpLast.bp.h, 201, 1, 1, _kpLast.nu).qLs - 25) < 1e-6), 'Betriebspunkt auf dem 201er-Rohr gelöst (Q(h) = 25 l/s)');
  const svgA = await svgHtml();
  ok(svgA.indexOf('i,eff') >= 0 && svgA.indexOf('Inliner s = 3 mm') >= 0 && svgA.indexOf('201 mm') >= 0, 'Schema: D_i,eff = 201 mm + Inliner-Zeile', svgA.length);
  ok(svgA.indexOf('stroke="#f59e0b" stroke-width="4"') >= 0, 'Schema: Beschichtungsring gezeichnet');
  ok(await page.locator('#kp_note_abzug').isHidden(), 'keine «Abzug zu gross»-Warnung bei 3 mm');

  console.log('— DN-Wahl + Abzug: Löse-Guard vergleicht den rohen D_i —');
  await page.selectOption('#kp_reihe', 'sn'); await page.waitForTimeout(150);
  await page.selectOption('#kp_dn', '225'); await page.waitForTimeout(300);
  ok((await val('kp_dn')) === '225' && (await val('kp_di')) === '207', 'DN 225 gewählt → D_i 207, DN bleibt gesetzt (trotz Abzug)');
  ok((await txt('kp_out_dieff')).indexOf('201 mm') === 0, 'D_i,eff bleibt 201 mm nach der DN-Wahl');
  await page.fill('#kp_abzug', '4'); await page.waitForTimeout(300);
  ok((await val('kp_dn')) === '225' && (await val('kp_di')) === '207', 'Abzug ändern löst die DN-Wahl NICHT');
  ok((await txt('kp_out_dieff')).indexOf('199 mm') === 0, 'D_i,eff folgt: 207 − 2·4 = 199 mm');

  console.log('— Abzug zurücknehmen: Ausgangslage wiederhergestellt —');
  await page.fill('#kp_abzug', ''); await page.waitForTimeout(300);
  ok((await txt('kp_out_dieff')).indexOf('207 mm') === 0, 'D_i,eff = 207 mm');
  ok(num(await txt('kp_out_qv')) === base.qv && num(await txt('kp_kpi_fuell')) === base.fuell && (await firstHt()) === base.ht, 'Q_v, Füllgrad und Tabelle exakt wie zu Beginn');
  ok((await svgHtml()).indexOf('Inliner') < 0, 'Schema ohne Inliner-Zeile');
  ok((await page.locator('#kp_abzug_hint').innerText()).indexOf('Wandstärke s der Innenbeschichtung') === 0, 'Hinweis am Feld zurück auf den Standardtext');
  ok((await val('kp_dn')) === '225', 'DN-Wahl auch nach dem Zurücknehmen erhalten');

  console.log('— Abzug zu gross (200 mm bei D_i 207): gemeldet, nicht gekappt —');
  await page.fill('#kp_abzug', '200'); await page.waitForTimeout(300);
  ok(await page.locator('#kp_note_abzug').isVisible(), 'Warnbox «Abzug zu gross» sichtbar');
  ok((await txt('kp_out_dieff')) === 'kein lichter Querschnitt', 'D_i,eff-Zeile: «kein lichter Querschnitt»');
  ok((await page.locator('#kp_abzug_hint').innerText()).indexOf('kein lichter Querschnitt') >= 0, 'Hinweis am Feld rot mit Grund');
  ok(await page.locator('#kp_tbody tr').count() === 1 && (await page.locator('#kp_tbody').innerText()).indexOf('Abzug zu gross') >= 0, 'Tabelle: Platzhalter «Abzug zu gross»');
  ok((await svgHtml()).indexOf('Abzug zu gross') >= 0, 'Schema: Leerzustand nennt den Grund');
  ok((await txt('kp_kpi_fuell')) === '–' && (await txt('kp_kpi_afuell')) === '–', 'KPIs zeigen «–» statt erfundener Werte');
  ok((await val('kp_di')) === '207', 'roher D_i weiterhin 207');
  await page.fill('#kp_abzug', ''); await page.waitForTimeout(300);

  console.log('— Gegenprobe Excel-Beispiel (D_i 96, Q 2.5): bei 0.5 sind Höhe und Fläche gleich —');
  await page.selectOption('#kp_reihe', 'frei'); await page.waitForTimeout(150); // «Freie Eingabe» hat den Wert frei, nicht ''
  await page.fill('#kp_di', '96'); await page.fill('#kp_q', '2.5'); await page.waitForTimeout(300);
  ok((await txt('kp_kpi_fuell')) === '50 %' && (await txt('kp_kpi_afuell')) === '50.0 %', 'h/D_i 50 % ⇒ A/A_v 50.0 % (Bestandsschutz Smoke-Test)');
  ok((await txt('kp_kpi_ht')) === '48.0', 'Fliesstiefe 48.0 mm unverändert');
  // Bestandsschutz: mit LEEREM Abzug-Feld stehen exakt die Anzeigewerte des bestehenden Smoke-Tests da
  ok((await txt('kp_out_dieff')).indexOf('96 mm') === 0 && (await txt('kp_out_vv')).indexOf('0.69') === 0 && (await txt('kp_out_qv')).indexOf('5.00') === 0 && (await txt('kp_out_q07')).indexOf('4.20') === 0 && (await txt('kp_out_dimin')).indexOf('78') === 0,
    'Bestandsschutz: leeres kp_abzug ⇒ D_i,eff 96 mm · v_v 0.69 · Q_v 5.00 · Q_0.7 4.20 · d_i,min 78 (Smoke-Test-Referenz)',
    { dieff: await txt('kp_out_dieff'), vv: await txt('kp_out_vv'), qv: await txt('kp_out_qv') });
  ok(errs.length === 0, 'keine pageerrors', errs);
  await ctx.close();

  console.log('— Deep-Link mit &abzug=3 —');
  const d = await newPage(browser, seed(['role_planer']));
  const errs2 = []; d.page.on('pageerror', e => errs2.push(e.message));
  await d.page.goto(BASE + '/sb_kreisprofil.html?q=25&gef=1&kb=1&di=207&abzug=3');
  await d.page.waitForTimeout(2000);
  ok((await d.page.inputValue('#kp_abzug')) === '3', 'Deep-Link: abzug = 3 übernommen');
  ok((await d.page.inputValue('#kp_di')) === '207', 'Deep-Link: D_i = 207 übernommen');
  ok((await d.page.locator('#kp_out_dieff').innerText()).indexOf('201 mm') === 0, 'Deep-Link: D_i,eff = 201 mm gerechnet');
  ok((await d.page.locator('#kpSchema').innerHTML()).indexOf('Inliner s = 3 mm') >= 0, 'Deep-Link: Schema zeigt den Inliner');
  ok(errs2.length === 0, 'keine pageerrors (Deep-Link)', errs2);
  await d.ctx.close();

  await browser.close();
  server.close();
}

console.log('');
console.log(pass + '/' + (pass + fail) + ' Checks grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
