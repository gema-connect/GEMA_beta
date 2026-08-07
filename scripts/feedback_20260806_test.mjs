// Drift-Guard: Feedback 06.08.2026 (Sandro Caso) — 15 Punkte
//   Osmose (4): (1) Tagesablauf-Simulation ohne Text-Kollisionen (Marker-
//     Label-Ausweichband, «−… l/h» rechts der Druckerhöhungs-Pumpe,
//     Füllstand-Chip-Klemme über der Ablauf-Zone), (2) Konzentrat der
//     2. Stufe als Rückführung VOR die 1. Stufe (Saugseite), (3) Standard
//     nur EIN Verbraucher, (4) VN-Kachel ausgeschrieben, 2 Nachkommastellen,
//     2 Zeilen.
//   Workspace (1): Mitglieder-Chip zeigt beim Klick die ECHTE Liste — auch
//     beim Klassen-/Übungs-Eimer (Klasse ist die Wahrheit, nurUserIds als
//     Fallback); Chip-Zähler = Klick-Liste (EIN Resolver).
//   Zirkulation (10): RV-Karte unter den Teilstrecken (Δp automatisch aus
//     TS 1 + KVS-Tabelle, Diagramm), Regulierventil-Mappe-Sprung, Detail-
//     zeile mit «angeschlossene Teilstrecken» + ausgeschriebener Bauart,
//     Schema von unten nach oben, 2 Fabrikate wählbar, eigene Umgebungs-
//     Karte («Raum beheizt»), «Temperatur Austritt Wassererwärmer»,
//     Abkühlung 1–5 K ganze Schritte, T WW 65→52 absteigend.
//   Dazu Regression: pm_revisionsunterlagen — alle Inline-Script-Blöcke
//     parsen (eine GemaFeedback.init-Einfügung sass im document.write-String
//     des QR-Fensters und riss den Modul-Block mit einem SyntaxError ab).
//
// Aufruf: CHROME=<chromium> node scripts/feedback_20260806_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { startServer, seed, BASE, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 220) : '')); } };

const zk = readFileSync(new URL('../sb_zirkulation.html', import.meta.url), 'utf8');
const os = readFileSync(new URL('../sa_osmose.html', import.meta.url), 'utf8');
const ws = readFileSync(new URL('../sys_workspace.html', import.meta.url), 'utf8');
const rev = readFileSync(new URL('../pm_revisionsunterlagen.html', import.meta.url), 'utf8');

console.log('■ A: Statik — Zirkulation');
ok(/id="zk_fabrikat2"/.test(zk) && /function zkFab2Changed/.test(zk) && /function zkRowFab/.test(zk),
  '#6: zweites Fabrikat wählbar (zk_fabrikat2 + zkFab2Changed + zkRowFab)');
ok(/data-k="fabsel"/.test(zk), '#6: Fabrikat-Wahl pro Zeile (data-k="fabsel") im 2-Fabrikate-Modus');
// Feedback 06.08.2026 (Runde 2): «Wassererwärmer» heisst jetzt «Warmwassererzeugung».
ok(/Temperatur Austritt Warmwassererzeugung/.test(zk), '#8: Label «Temperatur Austritt Warmwassererzeugung»');
ok(/zkFillRangeSelect\('zk_tww',\s*65,\s*52,\s*-1,\s*58\)/.test(zk),
  '#10: T WW 65→52 °C absteigend (65 zuoberst), Vorgabe 58');
ok(/zkFillRangeSelect\('zk_dtzul',\s*1,\s*5,\s*1,\s*3\)/.test(zk),
  '#9: Zulässige Abkühlung 1–5 K in GANZEN Schritten');
ok(/id="zkUmgebCard"/.test(zk) && /Raum beheizt/.test(zk),
  '#7: eigene Umgebungs-Karte + Einbauort «Raum beheizt»');
ok(/id="zkRvCard"/.test(zk) && /var ZK_RV=\[\[15,/.test(zk) && /id="zkRvDiag"/.test(zk) && /window\._zkRvDraw\s*=/.test(zk),
  '#1: RV-Karte mit KVS-Tabelle (DN 15…) + Diagramm (_zkRvDraw)');
ok(zk.indexOf('id="zkRvCard"') > zk.indexOf('Teilstrecken Zirkulationsleitung'),
  '#1: RV-Karte steht UNTER den Teilstrecken');
ok(/id="zk_rvtyp"[^>]*>/.test(zk) && /value="kvs" selected/.test(zk),
  '#1: Standard-RV automatisch nach KVS-Tabelle ist die Vorgabe');
ok(/Δp = \(m\/KVS\)²\/1000/.test(zk), '#1: Formel-Chip Δp = (m/KVS)²/1000 an der RV-Zeile');
ok(/id="zkRegJumpRow"/.test(zk) && /function zkVentilMappe/.test(zk),
  '#2: Sprung-Zeile zur Regulierventil-Mappe (zkVentilMappe)');
ok(/class="zk-anschl"/.test(zk) && /angeschlossene Teilstrecken/.test(zk),
  '#4: Detail-Block «angeschlossene Teilstrecken» mit eigenem Titel');
ok(/<option value="kon"[^>]*>konventionell<\/option>/.test(zk) && />Rohr an Rohr<\/option>/.test(zk),
  '#4: Bauart ausgeschrieben (konventionell / Rohr an Rohr)');
ok(/yBase-\(depth\[nr\]\+1\)\*levH/.test(zk),
  '#5: Schema-Y wächst nach OBEN (yBase − Tiefe·levH — von unten nach oben)');

console.log('■ A: Statik — Osmose');
ok(/addConsumerRow\("Verbraucher 1"/.test(os) && !/addConsumerRow\("Verbraucher 2"/.test(os),
  '#3: Standard nur EIN Verbraucher (kein «Verbraucher 2»-Seed)');
ok(/Erforderliches Nutzvolumen V<sub>N<\/sub>/.test(os) && /formatNumber\(vnRequired,\s*2\)/.test(os),
  '#4: VN-Kachel ausgeschrieben + 2 Nachkommastellen');
ok(/ohneKonz/.test(os) && /H -200 V 112/.test(os) && /Rückführung vor Stufe 1/.test(os),
  '#2: Konzentrat Stufe 2 als Rückführung vor Stufe 1 (Saugseite Pumpe 1)');
ok(/BL_TOP\s*=\s*64,\s*BL_BOT\s*=\s*186/.test(os),
  '#1: Marker-Labels weichen dem Anlage-Band (y 64..186) aus');
ok(/\(X \+ W \+ 48 \+ 580\) \/ 2/.test(os),
  '#1: «−… l/h» steht ZWISCHEN Druckerhöhungs-Pumpe und Verbraucher-Box');
ok(/OTS\.BOT - 56, y\)/.test(os),
  '#1: Füllstand-Chip klemmt ÜBER der Ablauf-Zone (BOT−56 — nie auf der Pumpe)');

console.log('■ A: Statik — Workspace + Regression Revisionsunterlagen');
ok(/function _wsMitgliederListe/.test(ws) && /_wsMitgliederListe\(b\)\.length/.test(ws),
  'Workspace: EIN Resolver für Chip-Zähler UND Mitglieder-Liste');
ok(/function _wsKlasseVon/.test(ws), 'Workspace: Klasse wird LIVE aus dem Pool-Cache aufgelöst');
{
  const re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, bad = 0, blk = 0;
  while ((m = re.exec(rev))) { blk++; try { new Function(m[1]); } catch (e) { bad++; } }
  ok(blk >= 2 && bad === 0, 'pm_revisionsunterlagen: alle Inline-Script-Blöcke parsen (QR-String-Regression)', { blk, bad });
  ok(/GemaFeedback\.init\('revisionsunterlagen'/.test(rev) && rev.indexOf("GemaFeedback.init('revisionsunterlagen'") > rev.indexOf('DOMContentLoaded'),
    'pm_revisionsunterlagen: GemaFeedback.init läuft im Seiten-Boot (nicht im Druckfenster-String)');
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

console.log('■ B: Browser — Zirkulation (RV-Karte, Detail, Schema, 2 Fabrikate)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_zirkulation.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof zkRenderTable === 'function');
  await page.waitForTimeout(700);

  const sel = await page.evaluate(() => {
    const tw = [...document.querySelectorAll('#zk_tww option')].map(o => o.value);
    const dt = [...document.querySelectorAll('#zk_dtzul option')].map(o => o.value);
    return { tw, dt, twVal: document.getElementById('zk_tww').value, dtVal: document.getElementById('zk_dtzul').value };
  });
  ok(sel.tw[0] === '65' && sel.tw[sel.tw.length - 1] === '52' && sel.tw.length === 14 && sel.twVal === '58',
    '#10: T-WW-Select 65…52 absteigend, Vorgabe 58', sel.tw);
  ok(JSON.stringify(sel.dt) === JSON.stringify(['1', '2', '3', '4', '5']) && sel.dtVal === '3',
    '#9: Abkühlung 1–5 K ganze Schritte, Vorgabe 3', sel.dt);
  ok(await page.evaluate(() => {
    const c = document.getElementById('zkUmgebCard');
    return !!c && /Raum beheizt/.test(c.textContent) && /Keller nicht beheizt/.test(c.textContent);
  }), '#7: Umgebungs-Karte mit ausgeschriebenen Einbauorten');

  // Netz: TS1 (Root) → TS2 → TS3 (Strang A) und TS1 → TS4 (Strang B)
  await page.evaluate(() => {
    zkRows = [1, 2, 3, 4].map(n => zkDefaultRow(n));
    zkRows[0].len = 50; zkRows[0].e = 2; zkRows[0].f = 4;
    zkRows[1].len = 30; zkRows[1].e = 3;
    zkRows[2].len = 20;
    zkRows[3].len = 25;
    zkPersist(); zkRenderTable(); zkRecalc();
  });
  await page.waitForTimeout(350);

  // #1/#3: RV automatisch — Δp = (m/KVS)²/1000, m aus TS 1, KVS je DN RL
  const rv = await page.evaluate(() => {
    const r = _zkLast.rv || {};
    const root = zkRows.find(x => x.nr === _zkLast.root);
    const tab = ZK_RV.find(x => x[0] === parseFloat(root.dn));
    return {
      mode: r.mode, dn: r.dn, kvs: r.kvs, m: r.m, dp: r.dp,
      exp: (r.m > 0 && tab) ? Math.pow(r.m / tab[1], 2) / 1000 : null,
      tabKvs: tab ? tab[1] : null,
      mPump: _zkLast.pump ? _zkLast.pump.m : 0,
      dpTxt: document.getElementById('zkRvDp').textContent,
      flowTxt: document.getElementById('zkRvFlow').textContent,
      diag: !!document.querySelector('#zkRvDiag svg'),
      pt: document.querySelectorAll('#zkRvDiag circle').length,
      manuSichtbar: document.getElementById('zkRvManuRow').style.display !== 'none'
    };
  });
  ok(rv.mode === 'kvs' && rv.kvs === rv.tabKvs && rv.kvs != null, '#1: RV folgt der KVS-Tabelle je DN RL der TS 1', rv);
  ok(rv.m > 0 && Math.abs(rv.m - rv.mPump) < 1e-9, '#2: Volumenstrom IMMER aus TS 1 (m an der Pumpe)', { m: rv.m, p: rv.mPump });
  ok(rv.exp != null && Math.abs(rv.dp - rv.exp) < 1e-12, '#3: Δp automatisch = (m/KVS)²/1000', { dp: rv.dp, exp: rv.exp });
  ok(/mbar/.test(rv.dpTxt) && /kg\/h/.test(rv.flowTxt), '#3: Δp + Volumenstrom werden ausgewiesen', rv.dpTxt);
  ok(rv.diag && rv.pt >= 1, '#2: RV-Kennlinien-Diagramm mit Betriebspunkt gezeichnet');
  ok(!rv.manuSichtbar, '#1: manuelles Δp-Feld im Automatik-Modus versteckt');

  // Dynamik: TS-1-Länge ändern → RV-Betriebspunkt folgt (Volumenstrom bleibt
  // TS 1, aber hEff/Δp der Strecke ändern das Netz → m ändert sich mit T)
  const dyn = await page.evaluate(() => {
    const alt = _zkLast.rv.dp;
    zkRows[0].len = 90; zkPersist(); zkRenderTable(); zkRecalc();
    return { alt, neu: _zkLast.rv.dp };
  });
  ok(Math.abs(dyn.alt - dyn.neu) > 1e-12, '#2: dynamische Eingabe — Δp RV folgt der Berechnung', dyn);

  // Manueller Modus
  await page.selectOption('#zk_rvtyp', '');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => _zkLast.rv.mode === 'man' && document.getElementById('zkRvManuRow').style.display !== 'none' &&
    document.getElementById('zkRvAuto').style.display === 'none'),
    '#1: manueller Modus zeigt das Δp-Feld, Automatik-Zeilen weg');
  await page.selectOption('#zk_rvtyp', 'kvs');
  await page.waitForTimeout(250);

  // #4: Detailzeile — «angeschlossene Teilstrecken» + Bauart ausgeschrieben
  await page.evaluate(() => zkToggleRow(1));
  await page.waitForTimeout(200);
  const det = await page.evaluate(() => {
    const d = document.querySelector('.zk-detrow');
    const anschl = d ? d.querySelector('.zk-anschl') : null;
    const art = d ? d.querySelector('select[data-k="art"]') : null;
    return {
      da: !!d, anschl: !!anschl,
      titel: anschl ? (anschl.querySelector('.zk-grptit') || {}).textContent : '',
      artOpts: art ? [...art.options].map(o => o.textContent) : []
    };
  });
  ok(det.da && det.anschl && det.titel === 'angeschlossene Teilstrecken',
    '#4: roter Punkt — Titel «angeschlossene Teilstrecken» über den Feldern', det.titel);
  ok(det.artOpts.indexOf('konventionell') >= 0 && det.artOpts.indexOf('Rohr an Rohr') >= 0,
    '#4: grüner Punkt — Bauart-Optionen ausgeschrieben', det.artOpts);

  // #5: Schema von unten nach oben — End-TS liegt ÜBER der TS 1, der
  // Erwärmer/RV-Sockel zuunterst
  const schema = await page.evaluate(() => {
    function y(sel) { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top : null; }
    return {
      ts1: y('#zkSchema [data-zkziel="ts|1"]'),
      ts3: y('#zkSchema [data-zkziel="ts|3"]'),
      rvSym: y('#zkSchema [data-zkziel="inp|zk_rvtyp"]')
    };
  });
  ok(schema.ts1 != null && schema.ts3 != null && schema.ts3 < schema.ts1,
    '#5: End-Teilstrecke liegt im Schema ÜBER der TS 1 (von unten nach oben)', schema);
  ok(schema.rvSym != null && schema.rvSym > schema.ts3,
    '#5: RV/Pumpen-Sockel liegt zuunterst', schema);

  // #6: zwei Fabrikate → Fabrikat-Wahl pro Zeile. Der erste Katalog-Eintrag
  // ist «— frei —» ohne mat (nur echte Fabrikate zählen); die Wahl sitzt in
  // der DETAILZEILE — also eine pro AUFGEKLAPPTER Teilstrecke.
  const fab = await page.evaluate(() => {
    const echte = ZK_FABRIKATE.filter(f => f.mat);
    const f1 = echte[0].id, f2 = echte[1].id;
    document.getElementById('zk_fabrikat').value = f1; zkFabChanged(f1);
    document.getElementById('zk_fabrikat2').value = f2; zkFab2Changed(f2);
    zkRows.forEach(function(r, i){ if (!_zkOpen[r.nr]) zkToggleRow(i); });   // alle aufklappen
    const sels = document.querySelectorAll('#zkBody select[data-k="fabsel"]');
    return { n: sels.length, rows: zkRows.length, f1, f2 };
  });
  ok(fab.n === fab.rows && fab.n > 0, '#6: im 2-Fabrikate-Modus hat JEDE (offene) Zeile die Fabrikat-Wahl', fab);
  const fabRow = await page.evaluate((f2) => {
    const det = document.querySelector('#zkBody tr.zk-det[data-i="0"]');
    const sel = det.querySelector('select[data-k="fabsel"]');
    // der Zeilen-Listener hängt am input-Event (native Selects feuern beides)
    sel.value = f2; sel.dispatchEvent(new Event('input', { bubbles: true }));
    return { fabId: zkRows[0].fabId, mat: zkRows[0].mat };
  }, fab.f2);
  ok(fabRow.fabId === fab.f2, '#6: Zeilen-Wahl schreibt r.fabId (Zeile folgt Fabrikat 2)', fabRow);

  // #2 (Mappe): Ventil wählen → Sprung-Zeile zeigt es, Klick öffnet die Karte
  await page.selectOption('#zk_regventil', 'nb15');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => /Nussbaum/.test(document.getElementById('zkRegJumpLbl').textContent)),
    '#2: Sprung-Zeile in den Grundparametern zeigt das gewählte Ventil');
  await page.evaluate(() => { zkFold('zkVentilC'); });          // zu
  await page.evaluate(() => zkVentilMappe());                    // öffnet + scrollt
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('bd_zkVentilC').style.display !== 'none'),
    '#2: zkVentilMappe öffnet die Regulierventil-Mappe');

  ok(errors.length === 0, 'Zirkulation: keine pageerrors', errors.join(' | ').slice(0, 200));
  await ctx.close();
}

console.log('■ C: Browser — Osmose (Kollisionen, Rückführung, Default, VN)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sa_osmose.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof recalc === 'function' && window._otSimHooks, null, { timeout: 12000 });
  await page.waitForTimeout(400);

  ok(await page.evaluate(() => document.querySelectorAll('#consumerBody tr').length) === 1,
    '#3: frischer Boot startet mit EINEM Verbraucher');

  // Szenario: 200 l/h × 4 h ab 06, VA 100 → Vorschlag 450 l
  async function setInp(s, v) {
    await page.evaluate(([q, w]) => { const el = document.querySelector(q); el.value = w;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, [s, String(v)]);
  }
  await setInp('#va', 100);
  await page.evaluate(() => {
    const tr = document.querySelectorAll('#consumerBody tr')[0];
    const inps = tr.querySelectorAll('input');
    inps[0].value = 'Labor'; inps[1].value = '200'; inps[2].value = '4';
    inps[2].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => otVerteileBedarf(document.querySelector('#otTbl tr[data-key]').getAttribute('data-key')));
  await page.evaluate(() => otVerteileProd());
  await page.evaluate(() => otVorschlag());
  await page.waitForTimeout(400);

  const vn = await page.evaluate(() => {
    const val = document.getElementById('vnRequired');
    const kach = val ? val.closest('.g-kpi') || val.closest('div') : null;
    const lbl = kach ? kach.parentElement.querySelector('.g-kpi-label') || kach.querySelector('.g-kpi-label') : null;
    // Label + Wert im selben Kachel-Container suchen (robust gegen Wrapper)
    let box = val; for (let i = 0; i < 4 && box && !box.querySelector('.g-kpi-label'); i++) box = box.parentElement;
    const l = box ? box.querySelector('.g-kpi-label') : null;
    return { txt: val ? val.textContent : '', lbl: l ? l.textContent.trim() : '' };
  });
  ok(/^\d[\d']*\.\d{2}$/.test(vn.txt), '#4: VN-Wert mit 2 Nachkommastellen', vn.txt);
  ok(/Erforderliches Nutzvolumen/.test(vn.lbl), '#4: Beschriftung ausgeschrieben («Erforderliches Nutzvolumen VN»)', vn.lbl);

  // Kollisionsdetektor: Text↔Text + Text↔Symbol (Chip-Text IN seiner Box ok)
  async function collisions() {
    return await page.evaluate(() => {
      const svg = document.querySelector('#otSimWrap svg');
      if (!svg) return ['kein SVG'];
      const pad = -1;
      const box = el => { const b = el.getBoundingClientRect(); return { x1: b.left - pad, y1: b.top - pad, x2: b.right + pad, y2: b.bottom + pad }; };
      const hit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
      const inside = (a, b) => a.x1 >= b.x1 - 2 && a.x2 <= b.x2 + 2 && a.y1 >= b.y1 - 2 && a.y2 <= b.y2 + 2;
      const texts = [...svg.querySelectorAll('text')].filter(t => (t.textContent || '').trim());
      const out = [];
      for (let i = 0; i < texts.length; i++)
        for (let j = i + 1; j < texts.length; j++)
          if (hit(box(texts[i]), box(texts[j]))) out.push('T↔T ' + texts[i].textContent.trim() + '↔' + texts[j].textContent.trim());
      const shapes = [...svg.querySelectorAll('circle, rect')];
      for (const t of texts) {
        const tb = box(t);
        for (const s of shapes) {
          if (s.getAttribute('fill') === 'none') continue;
          if (s.getAttribute('data-sim') === 'water') continue;
          if (inside(tb, box(s))) continue;
          if (hit(tb, box(s))) out.push('T↔S ' + t.textContent.trim());
        }
      }
      return out;
    });
  }
  await page.evaluate(() => _otSimHooks.setT(10));
  const c1 = await collisions();
  ok(c1.length === 0, '#1: 1-stufig — keine Text-Kollisionen (t=10)', c1);
  const konz1 = await page.evaluate(() =>
    [...document.querySelectorAll('#otSimWrap svg text')].filter(t => t.textContent.trim() === 'Konzentrat').length);
  ok(konz1 === 1, '#2: 1-stufig — Konzentrat-Abgang beschriftet, keine Rückführung', konz1);
  ok(await page.evaluate(() => !document.querySelector('#otSimWrap svg path[d*="H -200"]')),
    '#2: 1-stufig — keine Rückführungs-Leitung');

  await setInp('#stufen', '2');
  await page.waitForTimeout(400);
  await page.evaluate(() => _otSimHooks.setT(10));
  const c2 = await collisions();
  ok(c2.length === 0, '#1: 2-stufig — keine Text-Kollisionen (t=10)', c2);
  const serie = await page.evaluate(() => ({
    rueck: !!document.querySelector('#otSimWrap svg path[d*="H -200"]'),
    lbl: [...document.querySelectorAll('#otSimWrap svg text')].some(t => /Rückführung vor Stufe 1/.test(t.textContent)),
    konz: [...document.querySelectorAll('#otSimWrap svg text')].filter(t => t.textContent.trim() === 'Konzentrat').length
  }));
  ok(serie.rueck && serie.lbl, '#2: 2-stufig — Rückführungs-Leitung + Beschriftung vorhanden', serie);
  ok(serie.konz === 1, '#2: 2-stufig — nur Stufe 1 hat den Konzentrat-Abgang (Stufe 2 führt zurück)', serie.konz);

  // Chip-Klemme: um 10:00 liegt der Stand auf der 50-l-Reserve (Minimum) —
  // der Chip darf NIE tiefer als BOT−56 sitzen (Ablauf-Zone mit Pumpe).
  const chip = await page.evaluate(() => {
    const lg = document.querySelector('#otSimWrap [data-sim="lvlGrp"]');
    const m = /translate\(0,\s*([\d.]+)\)/.exec(lg.getAttribute('transform') || '');
    return m ? parseFloat(m[1]) : null;
  });
  ok(chip != null && chip <= 326 - 56 + 0.01, '#1: Füllstand-Chip klemmt über der Ablauf-Zone (≤ BOT−56)', chip);

  ok(errors.length === 0, 'Osmose: keine pageerrors', errors.join(' | ').slice(0, 200));
  await ctx.close();
}

console.log('■ D: Browser — Workspace Mitglieder-Liste (Klassen-/Übungs-Eimer)');
{
  // Stateful PostgREST-Mock (Muster schule_workspace_student_test): der
  // Klassen-Pool muss aus der «Cloud» kommen, damit die Provisionierung und
  // der LIVE-Klassen-Resolver denselben Stand sehen.
  // Die Session gehört IMMER u_test (Harness-Konvention) — variiert wird,
  // WER u_test in der Klasse ist (Dozent bzw. Studentin).
  const ORG_SCHULE = { id: 'org_test', name: 'HF Schule Olten', kategorie: 'schule', kategorien: ['schule'], admins: [], active: true, adresse: { strasse: 'Musterstrasse 5', plz: '4600', ort: 'Olten' } };
  function klasseMit(dozentIds, studentIds) {
    return { id: 'kl1', name: 'Kaltwasser HF 2026', lehrgang: 'HF Gebäudetechnik', code: 'K7M2XA',
      orgId: 'org_test', archiviert: false, dozentIds, studentIds,
      module: ['lu_tabelle'], erstelltAm: '2026-08-01T08:00:00Z' };
  }
  function makeRoutes(state) {
    return async route => {
      const req = route.request(); const u = req.url();
      if (u.startsWith(BASE)) return route.continue();
      if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
      if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
        const m = req.method();
        if (m === 'POST') {
          let rows = []; try { rows = JSON.parse(req.postData() || '[]'); } catch (e) {}
          if (!Array.isArray(rows)) rows = [rows];
          rows.forEach(r => { if (r && r.module_key && r.data_key) state.store.set(r.module_key + '|' + r.data_key, (r.payload && r.payload.data) || null); });
          return route.fulfill({ contentType: 'application/json', body: '{}' });
        }
        if (m === 'GET') {
          const gm = /module_key=eq\.([^&]+)/.exec(u);
          if (gm) {
            const mk = decodeURIComponent(gm[1]);
            const lk = /data_key=like\.([^&]+)/.exec(u);
            const pref = lk ? decodeURIComponent(lk[1]).replace(/\*$/, '') : '';
            const rows = [];
            state.store.forEach((data, key) => {
              const km = key.slice(0, key.indexOf('|')), kd = key.slice(key.indexOf('|') + 1);
              if (km === mk && (!pref || kd.indexOf(pref) === 0)) rows.push({ data_key: kd, payload: { data } });
            });
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
          }
          return route.fulfill({ contentType: 'application/json', body: '[]' });
        }
        return route.fulfill({ contentType: 'application/json', body: '{}' });
      }
      return route.abort();
    };
  }
  async function bootAls(rolle, klasse, users) {
    const state = { store: new Map() };
    state.store.set('schule|sklasse:kl1', klasse);
    const s = seed([rolle], rolle === 'role_student' ? { studentMods: ['lu_tabelle'] } : undefined);
    s.gema_orgs_v1 = [ORG_SCHULE];
    s.gema_users_v1 = users;
    s.gema_coachmarks_done_sys_workspace_v2 = '1';
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
    await ctx.route('**/*', makeRoutes(state));
    await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, s);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window._wsHooks && _wsHooks.buckets().some(b => b.id === 'ws_kl_kl1'), null, { timeout: 9000 }).catch(() => {});
    return { ctx, page, errors };
  }

  // (a) Dozent (= u_test): Klassen-Eimer → Chip zählt 2, Klick listet beide
  {
    const { ctx, page, errors } = await bootAls('role_dozent', klasseMit(['u_test'], ['u_stud']), [
      { id: 'u_test', username: 'doz@test.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true, profile: { email: 'doz@test.ch' } },
      { id: 'u_stud', username: 'stud@test.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true, profile: { email: 'stud@test.ch' } }
    ]);
    await page.evaluate(() => _wsOpen('ws_kl_kl1'));
    await page.waitForTimeout(500);
    const chip = await page.evaluate(() => (document.querySelector('.ws-meta-chip--btn') || {}).textContent || '');
    ok(/2 Mitglieder/.test(chip), 'Klassen-Eimer: Chip zählt die ECHTEN Mitglieder (2)', chip);
    await page.click('.ws-meta-chip--btn');
    await page.waitForTimeout(300);
    const modal = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#wsModalRoot .ws-mitglied-row')].map(r => ({
        name: (r.querySelector('.ws-mitglied-name') || {}).textContent || '',
        sub: (r.querySelector('.ws-mitglied-sub') || {}).textContent || '',
        del: !!r.querySelector('.ws-icon-btn')
      }));
      return { rows, hint: (document.querySelector('#wsModalRoot') || {}).textContent || '' };
    });
    ok(modal.rows.length === 2, 'Klick zeigt BEIDE Mitglieder (vorher: leere Liste)', modal.rows);
    ok(modal.rows.some(r => /Dozent Test/.test(r.name) && /Klasse/.test(r.name) && r.sub === 'Dozent'),
      'Dozent mit Badge «Klasse» + Rolle Dozent', modal.rows);
    ok(modal.rows.some(r => /Studi Test/.test(r.name) && r.sub === 'Studierende'),
      'Studentin mit Rolle Studierende', modal.rows);
    ok(modal.rows.every(r => !r.del), 'Auto-Eimer: keine Entfernen-Knöpfe (Mitglieder folgen der Klasse)');
    ok(/folgen der Klasse/.test(modal.hint), 'Hinweis «Mitglieder folgen der Klasse»');
    ok(errors.length === 0, 'Dozent-Sicht: keine pageerrors', errors.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // (b) Studentin (= u_test): Übungs-Eimer → Chip 1, Liste zeigt SIE (Zugriff)
  {
    const { ctx, page, errors } = await bootAls('role_student', klasseMit(['u_doz'], ['u_test']), [
      { id: 'u_test', username: 'stud@test.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true, profile: { email: 'stud@test.ch' } },
      { id: 'u_doz', username: 'doz@test.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true, profile: { email: 'doz@test.ch' } }
    ]);
    await page.waitForFunction(() => window._wsHooks && _wsHooks.buckets().some(b => b.id === 'ws_ue_kl1_u_test'), null, { timeout: 9000 }).catch(() => {});
    await page.evaluate(() => _wsOpen('ws_ue_kl1_u_test'));
    await page.waitForTimeout(500);
    const chip = await page.evaluate(() => (document.querySelector('.ws-meta-chip--btn') || {}).textContent || '');
    ok(/1 Mitglied\b/.test(chip), 'Übungs-Eimer: Chip zählt 1 (die Studentin selbst)', chip);
    await page.click('.ws-meta-chip--btn');
    await page.waitForTimeout(300);
    const modal = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#wsModalRoot .ws-mitglied-row')].map(r => (r.textContent || '').trim());
      return { rows, txt: (document.querySelector('#wsModalRoot') || {}).textContent || '' };
    });
    ok(modal.rows.length === 1 && /Studi Test/.test(modal.rows[0]) && /Zugriff/.test(modal.rows[0]),
      'Übungs-Eimer: Liste zeigt die Studentin (Badge «Zugriff»)', modal.rows);
    ok(errors.length === 0, 'Studentin-Sicht: keine pageerrors', errors.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // (c) Von Hand angelegter Eimer: Ersteller erscheint, Einladen bleibt
  {
    const { ctx, page, errors } = await bootAls('role_dozent', klasseMit(['u_test'], ['u_stud']), [
      { id: 'u_test', username: 'doz@test.ch', name: 'Dozent Test', roleIds: ['role_dozent'], orgId: 'org_test', active: true, profile: { email: 'doz@test.ch' } },
      { id: 'u_stud', username: 'stud@test.ch', name: 'Studi Test', roleIds: ['role_student'], orgId: 'org_test', active: true, profile: { email: 'stud@test.ch' } }
    ]);
    await page.evaluate(() => _wsNatCreate('Mein Projekt', 'project'));
    await page.waitForTimeout(500);
    const chip = await page.evaluate(() => (document.querySelector('.ws-meta-chip--btn') || {}).textContent || '');
    ok(/1 Mitglied\b/.test(chip), 'Hand-Eimer: Chip zählt den Ersteller', chip);
    await page.click('.ws-meta-chip--btn');
    await page.waitForTimeout(300);
    const modal = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#wsModalRoot .ws-mitglied-row')].map(r => (r.textContent || '').trim()),
      einladen: /Einladen/.test((document.querySelector('#wsModalRoot') || {}).textContent || '')
    }));
    ok(modal.rows.length === 1 && /Dozent Test/.test(modal.rows[0]) && /Ersteller/.test(modal.rows[0]),
      'Hand-Eimer: Liste zeigt den Ersteller (Badge «Ersteller»)', modal.rows);
    ok(modal.einladen, 'Hand-Eimer: Einladen-Knopf bleibt in der Liste');
    ok(errors.length === 0, 'Hand-Eimer: keine pageerrors', errors.join(' | ').slice(0, 200));
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
