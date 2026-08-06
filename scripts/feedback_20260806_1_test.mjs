// Drift-Guard: Feedback 06.08.2026 · Runde 2 (Sandro Caso) — 16 Punkte
//
//   Ausstosszeiten sb_ausstosszeiten.html (8):
//     (1) mehrere Situationen je Berechnung (+ Zusammenfassung über alle),
//     (2) Leitungsabschnitte aufklappbar — Kopf ohne Volumen-Badge/Meta-Zeile,
//         die Werte (Volumen · v · Δp · Δp/m) stehen IM Detail,
//     (3) Label «Eintritt Ausstossleitung» (statt «Temperatur …»),
//     (4) Feld «Effektiver Volumenstrom» übersteuert den Normwert,
//     (5–7) die drei Typ-Schemata neu gezeichnet: rot = warmgehaltene Leitung
//         in der Dämmung, orange = Ausstoss-/Anschlussleitung; das frühere
//         «WS»-Kürzel ist weg, jede Grafik hat eine Legende,
//     (8) Karten-Titel «Anlagetyp + Verteilsystem».
//     Dazu: Hydraulik je Abschnitt (Darcy-Weisbach/Swamee-Jain, Warmwasser
//     55 °C) und Persistenz aller Situationen über #az_rows.
//
//   Abwasserhebeanlage sa_abwasserhebeanlage.html (8):
//     (1) Schachtmasse wahlweise in m ODER cm (Umschalten rechnet um),
//     (2) Schacht-Schema als SVG (Zonen im Grössenverhältnis),
//     (3) Tab-Reihenfolge Hebeanlage · Schacht · Pumpendruckleitung,
//     (4) Regenwasser/Niederschlag fliesst in Qtot (inkl. Import aus
//         sb_niederschlag),
//     (5) K-Wert wählbar (inkl. frei) + Dauerbelastung Qc,
//     (6) Apparate nach DU-Wert gruppiert mit Gruppensummen,
//     (7) Schritt-Nummern 1)–4) an den Karten,
//     (8) Druckverlust-Diagramm (Hvj-Kurve + v-Gerade + Betriebspunkt).
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260806_1_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { startServer, seed, BASE, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 220) : '')); } };

const az = readFileSync(new URL('../sb_ausstosszeiten.html', import.meta.url), 'utf8');
const hb = readFileSync(new URL('../sa_abwasserhebeanlage.html', import.meta.url), 'utf8');

console.log('■ A: Statik — Ausstosszeiten');
ok(/<div class="g-section-title">Anlagetyp \+ Verteilsystem<\/div>/.test(az),
  '#8: Karten-Titel «Anlagetyp + Verteilsystem»');
ok(/Eintritt Ausstossleitung/.test(az) && !/>\s*Temperatur Eintritt\s*</.test(az),
  '#3: Label «Eintritt Ausstossleitung»');
ok(/Effektiver Volumenstrom/.test(az) && /function sitVolumenstrom/.test(az),
  '#4: Feld «Effektiver Volumenstrom» + Resolver sitVolumenstrom');
ok(/const AZ_RHO=985\.7/.test(az) && /const AZ_NU=0\.506e-6/.test(az) && /function segHydraulik/.test(az),
  'Hydraulik-Engine: ρ/ν für Warmwasser 55 °C + segHydraulik');
ok(/0\.25\/Math\.pow\(Math\.log10\(k\/\(3\.7\*di\)\+5\.74\/Math\.pow\(Re,0\.9\)\),2\)/.test(az),
  'Hydraulik: Swamee-Jain für den turbulenten Ast');
ok(/PIPES\s*=/.test(az) && /k:\s*0\.007/.test(az) && /k:\s*0\.0015/.test(az),
  'Hydraulik: Rauhigkeit k je Rohrsystem (VPE 0.007 / CNS 0.0015 mm)');
// #2: die Kopfzeile der Abschnittskarte trägt NUR Chevron/Nummer/Name (+ ✕),
// die Werte liegen im aufklappbaren Body.
{
  const head = (az.match(/<div class="seg-head">[\s\S]*?<\/div>\s*<div class="seg-body">/) || [''])[0];
  ok(head && !/data-sv="vol"/.test(head) && !/seg-meta/.test(head) && /seg-cx/.test(head),
    '#2: Abschnitts-Kopf ohne Volumen-Badge/Meta-Zeile, mit Chevron', head.slice(0, 160));
}
ok(/<div class="seg-vals">[\s\S]*?data-sv="vol"[\s\S]*?data-sv="v"[\s\S]*?data-sv="dp"[\s\S]*?data-sv="r"/.test(az),
  '#2: Volumen · v · Δp · Δp/m stehen im Detail');
ok(/if\(s\._open===undefined\)\s*s\._open=!s\.length;/.test(az),
  '#2: ausgefüllte Abschnitte starten zugeklappt, leere offen');
ok(/\.gp-blatt \.situ\.zu \.situ-bd,\.gp-blatt \.seg-card\.zu \.seg-body\{display:block!important;\}/.test(az),
  '#2: Druckansicht zeigt zugeklappte Abschnitte trotzdem (gp-blatt + @media print)');
ok(!/>WS<\/text>/.test(az) && !/\bWS\b/.test(az.slice(az.indexOf('Anlagetyp + Verteilsystem'), az.indexOf('id="az_rows"'))),
  '#5–7: kein «WS»-Kürzel mehr in den Typ-Schemata');
ok((az.match(/stroke="#ea580c"/g) || []).length >= 8 && /Rot<\/span> = warmgehaltene Leitung/.test(az),
  '#5–7: orange Ausstossleitung + Farb-Legende in der Fussnote');
ok((az.match(/font-size="5" fill="#64748b">warmgehalten<\/text>/g) || []).length === 3,
  '#5–7: jede der drei Grafiken hat eine eigene Legende');
ok(/function newSit\(\)/.test(az) && /function addSit\(/.test(az) && /const sits=\[\]/.test(az),
  '#1: mehrere Situationen (sits-Liste + addSit)');
ok(/id="az_rows"/.test(az) && /function applyState\(/.test(az) && /function azSnapshotLoad\(/.test(az),
  '#1: Persistenz aller Situationen über #az_rows + Snapshot-Fallback');
ok(/window\._azHooks=\{/.test(az), 'Test-Hooks window._azHooks vorhanden');
// FOKUS-REGEL: der Namens-Handler darf die Liste NICHT neu bauen.
{
  const fn = (az.match(/function sitSetName\([\s\S]*?\n\}/) || [''])[0];
  ok(fn && !/renderSits\(\)/.test(fn), 'Fokus-Regel: sitSetName baut die Liste nicht neu', fn.slice(0, 200));
  const upd = (az.match(/function updSeg\([\s\S]*?\n\}/) || [''])[0];
  ok(upd && !/renderSits\(\)/.test(upd), 'Fokus-Regel: updSeg baut die Liste nicht neu', upd.slice(0, 200));
}

console.log('■ B: Statik — Abwasserhebeanlage');
{
  const tabs = [...hb.matchAll(/data-tab="(tab\d)"[^>]*>([^<]+)</g)].map(m => m[2].trim());
  ok(tabs[0] === 'Hebeanlage' && tabs[1] === 'Schacht' && tabs[2] === 'Pumpendruckleitung',
    '#3: Tab-Reihenfolge Hebeanlage · Schacht · Pumpendruckleitung', tabs);
}
ok(/<h2>1\) Eingangsdaten<\/h2>/.test(hb) && /<h2>2\) Angeschlossene Apparate<\/h2>/.test(hb) &&
   /<h2>3\) Schachtvolumen<\/h2>/.test(hb) && /<h2>4\) Pumpendruckleitung &amp; Druckverlust<\/h2>/.test(hb),
  '#7: Schritt-Nummern 1)–4) an den vier Karten');
ok(/data-schunit="m"/.test(hb) && /data-schunit="cm"/.test(hb) && /function schToM\(/.test(hb) &&
   /function schFromM\(/.test(hb) && /function setSchUnit\(/.test(hb),
  '#1: m/cm-Umschalter für die Schachtmasse');
ok(/schToM\(\$\("sch_d"\)\.value\)\s*\*\s*100/.test(hb),
  '#1: getState legt IMMER SI ab (d_cm aus schToM)');
ok(/id="k_wert"/.test(hb) && /id="k_frei"/.test(hb) && /function getK\(/.test(hb),
  '#5: K-Wert wählbar inkl. freiem Wert');
ok(/let qcRows=/.test(hb) && /function qcTotal\(/.test(hb),
  '#5: Dauerbelastung Qc als eigene Zeilen');
ok(/let nsRows=/.test(hb) && /function nsQ\(/.test(hb) && /function nsImport\(/.test(hb),
  '#4: Niederschlagsflächen inkl. Import aus sb_niederschlag');
ok(/loadFromModule\('niederschlagsanfall'/.test(hb) && /straengeSummary/.test(hb),
  '#4: Import liest die straengeSummary des Niederschlags-Moduls');
ok(/const qtot_ls = Math\.max\(q_from_du, maxLs\) \+ \(st\.inputs\.q_add_ls\|\|0\) \+ qc \+ qr;/.test(hb),
  '#4/#5: Qc und Qr fliessen in Qtot');
ok(/function fixtureGruppen\(/.test(hb) && /class="grp-row"|className='grp-row'/.test(hb),
  '#6: Apparate nach DU-Wert gruppiert');
ok(/window\._schSchemaDraw=function/.test(hb) && /id="schSchema"/.test(hb),
  '#2: Schacht-Schema (window._schSchemaDraw + Host)');
ok(/window\._dlSchemaDraw=function/.test(hb) && /id="dlSchema"/.test(hb),
  '#8: Druckverlust-Diagramm (window._dlSchemaDraw + Host)');
ok(/try \{ if \(window\._schSchemaDraw\)/.test(hb) && /try \{ if \(window\._dlSchemaDraw\)/.test(hb),
  'Cross-Block-Regel: beide Zeichner werden geguardet aus recalcAll gerufen');
ok(!/var\(--/.test((hb.match(/window\._schSchemaDraw=function[\s\S]*?\n  \};/) || [''])[0]),
  'SVG-Regel: Schacht-Schema nutzt nur literale Farben (kein var())');
// Doppelte IDs waren ein Bestandsfehler (zwei Mal id="tab5").
{
  const ids = [...hb.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dop = ids.filter((v, i) => ids.indexOf(v) !== i);
  ok(dop.length === 0, 'keine doppelten Element-IDs', dop);
}
// Die beiden Setter stehen je auf EINER Zeile — nur diese Zeile prüfen,
// sonst zieht der Regex die darunter stehenden Add-/Del-Funktionen mit hinein.
{
  const fn = (hb.match(/function qcSet\([^\n]*/) || [''])[0];
  ok(fn && !/renderQc\(\)/.test(fn), 'Fokus-Regel: qcSet baut die Zeilen nicht neu', fn.slice(0, 160));
  const ns = (hb.match(/function nsSet\([^\n]*/) || [''])[0];
  ok(ns && !/renderNs\(\)/.test(ns), 'Fokus-Regel: nsSet baut die Zeilen nicht neu', ns.slice(0, 160));
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

console.log('■ C: Browser — Ausstosszeiten');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_ausstosszeiten.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window._azHooks);
  await page.waitForTimeout(500);

  ok(errors.length === 0, 'Boot ohne pageerrors', errors.join(' | ').slice(0, 200));

  // #1: zweite Situation + Abschnitte anlegen, Werte setzen.
  await page.evaluate(() => {
    const H = window._azHooks;
    const s1 = H.sits()[0];
    s1.name = 'Bad OG'; s1.armatur = '0.2'; s1.tempFactor = '1.39';
    H.addSeg(s1.id);
    const segs = H.sits()[0].segs;
    segs[segs.length - 1].pipe = 'vpe20';
    segs[segs.length - 1].length = 5;
    H.addSit();
    const s2 = H.sits()[1];
    s2.name = 'Küche EG';
    H.addSeg(s2.id);
    const g2 = H.sits()[1].segs;
    g2[g2.length - 1].pipe = 'vpe16'; g2[g2.length - 1].length = 3;
    recalc();
  });
  await page.waitForTimeout(200);

  const st = await page.evaluate(() => {
    const H = window._azHooks;
    const sits = H.sits();
    return {
      n: sits.length,
      karten: document.querySelectorAll('.situ').length,
      r1: H.rechnen(sits[0]),
      r2: H.rechnen(sits[1]),
      zus: (document.getElementById('sumList') || {}).textContent || ''
    };
  });
  ok(st.n === 2 && st.karten === 2, '#1: zwei Situationen werden gerendert', { n: st.n, karten: st.karten });
  ok(st.r1 && st.r1.tem > 0 && st.r2 && st.r2.tem > 0, '#1: beide Situationen rechnen', { a: st.r1 && st.r1.tem, b: st.r2 && st.r2.tem });
  ok(/Bad OG/.test(st.zus) && /Küche EG/.test(st.zus), '#1: Zusammenfassung listet beide Situationen');

  // #2: Hydraulik — v und Δp je Abschnitt, gegen die Formel nachgerechnet.
  const hyd = await page.evaluate(() => {
    const H = window._azHooks;
    const s = H.sits()[0];
    const r = H.rechnen(s);
    const seg = r.details.find(x => x.hyd);
    return seg ? { v: seg.hyd.v, dp: seg.hyd.dp, di: seg.pipe.di, q: r.q } : null;
  });
  ok(hyd && hyd.v > 0 && hyd.dp > 0, '#2: v und Δp werden je Abschnitt gerechnet', hyd);
  if (hyd) {
    const A = Math.PI * Math.pow(hyd.di / 1000, 2) / 4;
    ok(Math.abs(hyd.v - (hyd.q / 1000) / A) < 1e-9, '#2: v = Q/A stimmt exakt', { v: hyd.v, soll: (hyd.q / 1000) / A });
  }

  // #4: effektiver Volumenstrom übersteuert den Normwert.
  const q = await page.evaluate(() => {
    const H = window._azHooks;
    const s = H.sits()[0];
    const norm = H.q(s);
    s.qEff = '0.35';
    const eff = H.q(s);
    s.qEff = '';
    return { norm: norm, eff: eff };
  });
  ok(q.norm.q === 0.2 && q.norm.eff === false, '#4: ohne Eingabe gilt der Normvolumenstrom', q.norm);
  ok(q.eff.q === 0.35 && q.eff.eff === true, '#4: erfasster Wert übersteuert den Normwert', q.eff);

  // FOKUS-REGEL im Browser: beim Tippen im Namensfeld bleibt der Fokus.
  await page.click('.situ .situ-name');
  await page.type('.situ .situ-name', 'XY');
  const fok = await page.evaluate(() => ({
    cls: document.activeElement ? document.activeElement.className : '',
    val: document.activeElement ? document.activeElement.value : ''
  }));
  ok(/situ-name/.test(fok.cls) && /XY$/.test(fok.val), 'Fokus bleibt beim Tippen im Situations-Namen', fok);

  // #1: der Zustand ALLER Situationen liegt im #az_rows-Textarea (das ist,
  // was GemaAutoSave pro Objekt speichert).
  const raw = await page.evaluate(() => window._azHooks.state());
  {
    let d = null; try { d = JSON.parse(raw); } catch (e) {}
    ok(d && Array.isArray(d.sits) && d.sits.length === 2 && /^Bad OG/.test(d.sits[0].name) && d.sits[1].name === 'Küche EG',
      '#1: #az_rows trägt beide Situationen', raw.slice(0, 120));
    ok(d && d.sits[0].segs.length >= 2, '#1: die Abschnitte wandern mit', d && d.sits[0].segs.length);
  }
  ok(errors.length === 0, 'Ausstosszeiten: keine pageerrors', errors.join(' | ').slice(0, 200));
  await ctx.close();

  // Roundtrip ECHT: Snapshot in den Speicher legen und die Seite neu laden.
  const s2 = seed(['role_planer']);
  s2.gema_ausstosszeiten = { az_rows: raw };
  const zweite = await newPage(browser, s2);
  const err2 = [];
  zweite.page.on('pageerror', e => err2.push(e.message));
  await zweite.page.goto(BASE + '/sb_ausstosszeiten.html', { waitUntil: 'domcontentloaded' });
  await zweite.page.waitForFunction(() => !!window._azHooks);
  await zweite.page.waitForTimeout(4200); // Snapshot-Fallback 700/1800/3500 ms
  const wieder = await zweite.page.evaluate(() => ({
    n: window._azHooks.sits().length,
    namen: window._azHooks.sits().map(s => s.name),
    karten: document.querySelectorAll('.situ').length
  }));
  ok(wieder.n === 2 && wieder.karten === 2 && /^Bad OG/.test(wieder.namen[0]) && wieder.namen[1] === 'Küche EG',
    '#1: nach dem Neuladen sind beide Situationen wieder da', wieder);
  ok(err2.length === 0, 'Roundtrip: keine pageerrors', err2.join(' | ').slice(0, 200));
  await zweite.ctx.close();
}

console.log('■ D: Browser — Ausstosszeiten Bestandsschutz (Altstand ohne az_rows)');
{
  const s = seed(['role_planer']);
  // Alt-Snapshot: nur die beiden früheren Einzelfelder, KEINE Situationen.
  s.gema_ausstosszeiten = { armatur: '0.3', tempFactor: '1.39' };
  const { ctx, page } = await newPage(browser, s);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_ausstosszeiten.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window._azHooks);
  await page.waitForTimeout(4200); // Snapshot-Fallback 700/1800/3500 ms
  const alt = await page.evaluate(() => {
    const sits = window._azHooks.sits();
    return { n: sits.length, arm: sits[0] && sits[0].armatur, tf: sits[0] && sits[0].tempFactor };
  });
  ok(alt.n === 1 && alt.arm === '0.3' && alt.tf === '1.39',
    'Bestandsschutz: Altstand (armatur/tempFactor) landet in der ersten Situation', alt);
  ok(errors.length === 0, 'Bestandsschutz: keine pageerrors', errors.join(' | ').slice(0, 200));
  await ctx.close();
}

console.log('■ E: Browser — Abwasserhebeanlage');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sa_abwasserhebeanlage.html', { waitUntil: 'domcontentloaded' });
  // Das Modul ist eine IIFE — recalcAll/getState sind bewusst NICHT global.
  // Gelesen wird darum das Export-JSON aus #out (Tab «Datenbasis»), also
  // genau das, was der Nutzer sieht.
  await page.waitForFunction(() => typeof saveLocal === 'function');
  await page.waitForTimeout(600);
  const lies = () => page.evaluate(() => { try { return JSON.parse(document.getElementById('out').textContent); } catch (e) { return null; } });
  ok(errors.length === 0, 'Boot ohne pageerrors', errors.join(' | ').slice(0, 200));

  // #6: Gruppierung — jede Gruppe hat eine Summenzeile.
  const grp = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#tbl tbody tr.grp-row')];
    return {
      n: rows.length,
      lbl: rows.map(r => (r.querySelector('.grp-lbl') || {}).textContent || ''),
      cnt: rows.map(r => (r.querySelector('.grp-cnt') || {}).textContent || ''),
      sum: rows.filter(r => r.querySelector('.grp-sum')).length,
      zeilen: document.querySelectorAll('#tbl tbody tr').length
    };
  });
  ok(grp.n >= 3, '#6: Apparate in DU-Gruppen aufgeteilt', grp.n);
  ok(grp.lbl.every(t => /DU\s*=|Sonderfälle/.test(t)), '#6: jede Gruppe nach ihrem DU-Wert benannt', grp.lbl);
  ok(grp.sum === grp.n && grp.cnt.every(t => /Apparate?$/.test(t.trim())),
    '#6: jede Gruppe hat Anzahl + Summenzelle', grp.cnt);
  {
    // DU-Gruppen aufsteigend, l/s-Sonderfälle (falls es welche gibt) zuunterst.
    const du = grp.lbl.filter(t => /DU\s*=/.test(t)).map(t => parseFloat(t.replace(/[^0-9.]/g, '')));
    const sortiert = du.every((v, i) => i === 0 || v >= du[i - 1]);
    const ls = grp.lbl.findIndex(t => /Sonderfälle/.test(t));
    ok(sortiert && (ls < 0 || ls === grp.n - 1), '#6: DU-Gruppen aufsteigend, l/s-Sonderfälle zuunterst', grp.lbl);
  }
  ok(grp.zeilen > grp.n, '#6: unter den Gruppen stehen die Apparate-Zeilen', { gruppen: grp.n, total: grp.zeilen });

  // #5: K-Wert + Dauerbelastung, #4: Niederschlag → alles in Qtot.
  // Bedient wird wie ein Nutzer (echte input/change-Events).
  await page.evaluate(() => {
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(document.querySelector('#tbl tbody input[data-kind="qty"]'), '4');
    const k = document.getElementById('k_wert');
    k.value = '0.5'; k.dispatchEvent(new Event('change', { bubbles: true }));
    const qc = document.querySelectorAll('#qcRows input');
    set(qc[qc.length - 1], '0.5');                 // Dauerbelastung 0.5 l/s
    document.getElementById('btn_ns_add').click();  // Niederschlagsfläche
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const f = document.querySelectorAll('#nsRows .ns-row')[0].querySelectorAll('input');
    // 25 m² × C 1.0 × r 0.030 = 0.75 l/s
    f[1].value = '25'; f[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const res = await lies();
  ok(res && res.sumDU > 0, '#6: Apparate-Anzahl fliesst in ΣDU', res && res.sumDU);
  ok(res && Math.abs(res.qtot_ls - (0.5 * Math.sqrt(res.sumDU) + 0.5 + 0.75)) < 1e-6,
    '#4/#5: Qtot = K·√ΣDU + ΣQc (0.5) + ΣQr (0.75)',
    res && { qtot: res.qtot_ls, du: res.sumDU, soll: 0.5 * Math.sqrt(res.sumDU) + 1.25 });

  // K-Wert-Wechsel muss durchschlagen (0.5 → 0.7).
  await page.evaluate(() => {
    const k = document.getElementById('k_wert');
    k.value = '0.7'; k.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const res07 = await lies();
  ok(res07 && Math.abs(res07.qtot_ls - (0.7 * Math.sqrt(res07.sumDU) + 1.25)) < 1e-6,
    '#5: K-Wert-Wechsel schlägt auf Qtot durch', res07 && res07.qtot_ls);

  // #1: m ⇄ cm — dieselbe Anlage, nur andere Einheit.
  await page.evaluate(() => {
    document.querySelector('.g-tab[data-tab="tab3"]').click();
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('sch_d', '1'); set('sch_ps', '0.4'); set('sch_res', '0.2'); set('sch_nutz', '0.5');
  });
  await page.waitForTimeout(200);
  const vorM = await lies();
  await page.click('.sch-unit-btn[data-schunit="cm"]');
  await page.waitForTimeout(250);
  const nachCm = await lies();
  const dCm = await page.evaluate(() => document.getElementById('sch_d').value);
  ok(Math.abs(parseFloat(dCm) - 100) < 0.5, '#1: Umschalten m → cm rechnet 1 m auf 100 cm um', dCm);
  ok(vorM && nachCm && Math.abs(vorM.schacht.pumpensumpf_l - nachCm.schacht.pumpensumpf_l) < 1e-6 &&
     Math.abs(vorM.schacht.d_cm - nachCm.schacht.d_cm) < 1e-6,
    '#1: das Ergebnis bleibt identisch — nur die Einheit wechselt',
    { m: vorM && vorM.schacht.pumpensumpf_l, cm: nachCm && nachCm.schacht.pumpensumpf_l });
  ok(await page.evaluate(() => {
    const l = [...document.querySelectorAll('#tab3 .g-inp-unit')].map(e => e.textContent.trim());
    return l.filter(t => t === 'cm').length >= 3 && l.indexOf('m') < 0;
  }), '#1: alle Schacht-Einheiten-Boxen zeigen cm');

  // #2/#8: beide SVGs sind gezeichnet.
  const svg = await page.evaluate(() => ({
    sch: (document.getElementById('schSchema') || {}).innerHTML || '',
    dl: (document.getElementById('dlSchema') || {}).innerHTML || ''
  }));
  ok(/<svg/.test(svg.sch) && /Schaltpunkt|Nutzvolumen|Reserve/.test(svg.sch),
    '#2: Schacht-Schema gezeichnet (Zonen beschriftet)', svg.sch.slice(0, 120));
  ok(/<svg/.test(svg.dl) && /Hvj/.test(svg.dl), '#8: Druckverlust-Diagramm gezeichnet', svg.dl.slice(0, 120));
  ok(!/var\(--/.test(svg.sch) && !/var\(--/.test(svg.dl),
    'SVG-Regel: nur literale Farben in beiden Diagrammen');

  ok(errors.length === 0, 'Abwasserhebeanlage: keine pageerrors', errors.join(' | ').slice(0, 200));
  await ctx.close();
}

console.log('■ F: Browser — Abwasserhebeanlage Bestandsschutz (Altstand ohne K/Qc/Ns)');
{
  const s = seed(['role_planer']);
  s.gema_abwasserhebeanlage = { d_cm: '100', ps_m: '0.5', pipe_len: '20', static_h: '4' };
  const { ctx, page } = await newPage(browser, s);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sa_abwasserhebeanlage.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof saveLocal === 'function');
  await page.waitForTimeout(4200);
  const alt = await page.evaluate(() => ({
    unit: document.querySelector('.sch-unit-btn.active').dataset.schunit,
    kSel: document.getElementById('k_wert').value,
    qc: document.querySelectorAll('#qcRows .qc-row').length,
    nsLeer: /Keine Fläche erfasst/.test(document.getElementById('nsRows').textContent || '')
  }));
  ok(alt.unit === 'm', 'Bestandsschutz: Altstand startet in Metern', alt.unit);
  ok(alt.kSel === '0.5', 'Bestandsschutz: fehlender K-Wert fällt auf 0.5 zurück', alt.kSel);
  ok(alt.qc === 1 && alt.nsLeer,
    'Bestandsschutz: Qc-/Niederschlags-Blöcke starten leer und erklären sich', alt);
  ok(errors.length === 0, 'Bestandsschutz: keine pageerrors', errors.join(' | ').slice(0, 200));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
