// Drift-Guard — Feedback 05.09.2026 (Sandro), sb_zirkulation.html, 3 Punkte:
//   #1 «Darstellung optimieren und Styl ändern. Wenn länge unterschiedlich soll
//      dies ersichtlich sein. Abgänge nach zuordnung der Teilstrecken logisch
//      verteilen und vom Wassererwärmer nach links oder nach rechts einen
//      Abgang erstellen. Die Regelventile immer gleich nach dem T-Stück
//      drastellen.»
//   #2 «Werte nach unten in aufklapp Fenster / markierte Auswahlfelder nach
//      oben in TS darstellung»
//   #3 «Nach oben verschieben» (Teilstrecken-Tabelle direkt unter die
//      Grundparameter; Regulierventil-Zuschlag + Förderhöhe in eine eigene
//      Karte «Druckverluste & Pumpe»)
//
// Geprüft wird BEIDES: der Quelltext (Rückbau fällt sofort auf) UND die
// gerenderte Geometrie im Browser (Augenmass ersetzt keine Messung).
//
// Ausführen: CHROME=<chromium> node scripts/feedback_20260905_zirkulation_test.mjs
// Gegenprobe: die Datei vor dem Umbau unter dem Originalnamen ablegen — die
// Checks in «A: Schema gemessen» und die Quelltext-Checks zu #1 werden rot.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name, info) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
};

const zk = readFileSync('sb_zirkulation.html', 'utf8');

// ════════ Quelltext ════════
console.log('■ Quelltext — #1 Netzschema');
ok(/function Y\(nr\)\{return yBase-depthPx\[nr\];\}/.test(zk),
  '#1: Y folgt der LÄNGE (depthPx), nicht mehr einem festen Ebenen-Raster');
ok(/var LEN_MIN=\d+, LEN_MAX=\d+, PX_MAX=\d+;/.test(zk) && /LEN_MIN\+Math\.max\(0,Math\.min\(1,l\/lenMax\)\)\*\(LEN_MAX-LEN_MIN\)/.test(zk),
  '#1: Längen-Skala mit Minimum/Maximum (kurze TS bleibt beschriftbar, lange gedeckelt)');
ok(/komp=maxPx0>PX_MAX\?PX_MAX\/maxPx0:1/.test(zk),
  '#1: tiefe Netze werden GLEICHMÄSSIG gestaucht (relative Längen bleiben erhalten)');
ok(/if\(idx===0\)\{walk\(c,dp\+1,slot\);return;\}/.test(zk),
  '#1: TS 1 = Fortsetzung → bleibt in derselben Spalte (durchgehende Steigleitung)');
ok(/var links=\(nr===res\.root\)&&!\(kids\[c\]\|\|\[\]\)\.length;/.test(zk),
  '#1: Abgang direkt am Wassererwärmer wird nach LINKS gezeichnet');
ok(/var yVent=Math\.min\(y1-2,Math\.max\(y2\+26,y1-6\)\);/.test(zk),
  '#1: Regulierventil sitzt unmittelbar nach dem T-Stück (an y1), nicht auf halber Höhe');
ok(/if\(nr!==res\.root&&\(kids\[parentOf\[nr\]\]\|\|\[\]\)\.length>1\)/.test(zk),
  '#1: T-Stück-Punkt nur bei echtem Abzweig (≥ 2 Kinder), nicht bei blosser Fortsetzung');
ok(/var lbl='TS '\+nr\+' · DN '\+r\.dn\+' · '\+fmt\(parseFloat\(r\.len\)\|\|0,1\)\+' m'/.test(zk),
  '#1: Länge steht am TS-Label (Präfix «TS n · DN x» unverändert)');
ok(!/var\s+levH\s*=/.test(zk), '#1: festes Ebenen-Raster (levH) ist restlos entfernt');
{
  // Schema-Kanon: im SVG-Block NUR literale Hex-/rgb-Farben, nie var()
  const blk = zk.slice(zk.indexOf('window._zkSchemaDraw'));
  const svg = blk.slice(0, blk.indexOf('</script>'));
  ok(svg.indexOf('var(--') < 0, '#1: Schema nutzt keine CSS-Variablen (GemaPDF/html2canvas-Regel)');
}

console.log('■ Quelltext — #2 Kopfzeile / #3 Reihenfolge');
ok(/class="zk-anschl"/.test(zk) && /zk-head/.test(zk),
  '#2: «angeschlossene Teilstrecken» ist in der Kopfzeile verdrahtet');
ok(/function zkPaintRowSelects/.test(zk),
  '#2 (Fokus-Regel): Selects werden gezielt nachgezeichnet, nie die ganze Liste');

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_zirkulation.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window._zkSchemaDraw === 'function' && typeof zkRecalc === 'function', null, { timeout: 15000 });
  await page.waitForTimeout(300);

  // Netz seeden: TS1 → e=TS2 (Fortsetzung) | f=TS3 (Abgang am Erwärmer)
  //             TS2 → e=TS4 (Fortsetzung) | f=TS5 (Abgang auf Ebene 2)
  const netz = (l2, l3) => `(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    set('zk_heff', 250); set('zk_kvs', 1.6);
    zkRows.length = 0;
    const mk = (nr, len, e, f) => ({ nr, len: String(len), e: e ? String(e) : '', f: f ? String(f) : '',
      art: 'kon', ort: 'raeume', ovl: 35, dn: 15, mat: 'PE-X', dvl: '', drl: '', drar: '' });
    zkRows.push(mk(1, 10, 2, 3), mk(2, 6, 4, 5), mk(3, ${l3}), mk(4, ${l2}), mk(5, 4));
    zkRenderTable(); zkRecalc();
  })()`;

  const mess = () => page.evaluate(() => {
    const box = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2 }; };
    const svg = document.querySelector('#zkSchema svg');
    /* Linien in BILDSCHIRM-Pixeln messen (getBoundingClientRect am <line>),
       NICHT in SVG-Koordinaten: das Schema skaliert per viewBox, und eine
       Umrechnung von Hand ist eine zweite Wahrheit, die beim nächsten
       Layout-Umbau still danebenliegt. waagrecht = Höhe ~0, senkrecht =
       Breite ~0. */
    const linien = Array.from(svg ? svg.querySelectorAll('line') : []).map(l => {
      const r = l.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, cx: (r.left + r.right) / 2 };
    });
    const hor = linien.filter(o => o.h < 2 && o.w > 3).map(o => ({ x1: o.l, x2: o.r, y: o.t }));
    const vert = linien.filter(o => o.w < 2 && o.h > 3).map(o => ({ cx: o.cx, t: o.t, b: o.b, h: o.h }));
    // Ventil-Gruppen: die einzigen <g> mit rotate(-90) im Schema
    const vent = Array.from(document.querySelectorAll('#zkSchema g[transform*="rotate(-90)"]')).map(g => {
      const r = g.getBoundingClientRect(); return { cx: (r.left + r.right) / 2, t: r.top, b: r.bottom };
    });
    const ts = {}; [1, 2, 3, 4, 5].forEach(n => { ts[n] = box('[data-zkziel="ts|' + n + '"] rect'); });
    const txt = {}; [1, 2, 3, 4, 5].forEach(n => { const e = document.querySelector('[data-zkziel="ts|' + n + '"] text'); txt[n] = e ? e.textContent : ''; });
    const chips = {}; ['A', 'B', 'C'].forEach(s => { chips[s] = box('[data-zkziel="strang|' + s + '"] rect'); });
    const punkte = document.querySelectorAll('#zkSchema circle[r="4.6"]').length;
    return { ts, txt, chips, vent, hor, vert, punkte, svgBox: box('#zkSchema svg') };
  });

  console.log('■ A: Schema gemessen — #1');
  await page.evaluate(netz(4, 4)); await page.waitForTimeout(250);
  let m = await mess();

  // (a) Zuordnung: Fortsetzung bleibt in der Spalte, Abgang bekommt eine eigene
  ok(m.ts[1] && m.ts[2] && Math.abs(m.ts[2].l - m.ts[1].l) < 1.5,
    '#1: Fortsetzung (TS 1 → TS 2) steigt in DERSELBEN Spalte weiter', { ts1: m.ts[1] && m.ts[1].l, ts2: m.ts[2] && m.ts[2].l });
  ok(m.ts[4] && Math.abs(m.ts[4].l - m.ts[1].l) < 1.5,
    '#1: Fortsetzung bleibt auch über zwei Ebenen in der Spalte (TS 4)', { ts4: m.ts[4] && m.ts[4].l });
  ok(m.ts[5] && Math.abs(m.ts[5].l - m.ts[1].l) > 40,
    '#1: Abgang auf Ebene 2 (TS 5) bekommt eine EIGENE Spalte', { ts5: m.ts[5] && m.ts[5].l });
  ok(m.ts[3] && m.ts[3].l < m.ts[1].l - 40,
    '#1: Abgang direkt am Wassererwärmer (TS 3) liegt LINKS der Steigleitung', { ts3: m.ts[3] && m.ts[3].l });

  // (b) T-Stück-Punkte: genau an den beiden echten Abzweigen (TS1 und TS2)
  ok(m.punkte >= 2, '#1: T-Stück-Punkte an den Abzweigen gezeichnet', { punkte: m.punkte });

  /* (c) Regulierventil unmittelbar nach dem T-Stück.
     Gemessen wird am ECHTEN Abzweig der jeweiligen Spalte: die waagrechte
     Verbinder-Linie, die in der Spalte des Ventils ENDET. Die frühere Fassung
     nahm «die am weitesten links liegende Waagrechte» — das ist die Leitung
     vom Wassererwärmer zur Pumpe auf der Grundlinie, nicht der Abzweig. */
  const ventVonSpalte = (mm, colX) => mm.vent.filter(v => Math.abs(v.cx - colX) < 15).sort((a, b) => a.t - b.t)[0] || null;
  const abzweigZu = (mm, v) => mm.hor.filter(h => Math.abs(h.x1 - v.cx) < 4 || Math.abs(h.x2 - v.cx) < 4)
    .sort((a, b) => Math.abs(a.y - v.b) - Math.abs(b.y - v.b))[0] || null;
  [3, 5].forEach(n => {
    const v = m.ts[n] ? ventVonSpalte(m, m.ts[n].l) : null;
    const abz = v ? abzweigZu(m, v) : null;
    if (!v || !abz) { fail++; console.log('  ✗ FAIL: #1: Ventil/Abzweig der Spalte TS ' + n + ' nicht messbar'); return; }
    const abstand = v.b - abz.y;   // Ventil-Unterkante − Abzweig-Linie
    ok(abstand <= 2 && abstand >= -20,
      '#1: Regulierventil TS ' + n + ' klebt am T-Stück (≤ 20 px darüber)', { abstand: Math.round(abstand) });
  });

  /* (d) Länge sichtbar. Gemessen wird die HÖHE DES GEZEICHNETEN ABSCHNITTS
     (senkrechte Linie in der Spalte der Teilstrecke), nicht die absolute Lage
     der Strang-Chips: TS 3 hängt an TS 1, TS 5 an TS 2 — verschiedene Eltern
     liegen zu Recht auf verschiedener Höhe. Verglichen werden darf nur, was
     die Zusicherung wirklich meint: gleiche Länge ⇒ gleich langer Abschnitt. */
  const segH = (mm, n) => { const b = mm.ts[n]; if (!b) return null;
    const v = mm.vert.filter(o => Math.abs(o.cx - b.l) < 15).sort((a, b2) => b2.h - a.h)[0];
    return v ? v.h : null; };
  ok(m.txt[3].indexOf('4.0 m') >= 0 && m.txt[3].indexOf('TS 3 · DN 15') === 0,
    '#1: Länge steht im TS-Label (Präfix unverändert)', { txt3: m.txt[3] });
  const h3g = segH(m, 3), h5g = segH(m, 5);
  ok(h3g != null && h5g != null && Math.abs(h3g - h5g) < 2,
    '#1: gleich lange Teilstrecken (je 4 m) werden gleich hoch gezeichnet', { ts3: h3g, ts5: h5g });

  // … und unterschiedliche Länge → sichtbar unterschiedlich hoher Abschnitt
  await page.evaluate(netz(4, 24)); await page.waitForTimeout(250);
  const m2 = await mess();
  const h3u = segH(m2, 3), h5u = segH(m2, 5);
  ok(m2.txt[3].indexOf('24.0 m') >= 0, '#1: geänderte Länge erscheint sofort im Label', { txt3: m2.txt[3] });
  ok(h3u != null && h5u != null && (h3u - h5u) > 25,
    '#1: die LÄNGERE Teilstrecke (24 m vs. 4 m) wird sichtbar höher gezeichnet', { ts3: h3u, ts5: h5u });

  console.log('■ B: Kopfzeile — #2');
  /* Die Aufklapp-Zeile wird NUR gerendert, solange die Teilstrecke offen ist
     (zkRenderTable hängt sie an `_zkOpen[r.nr]`) — vor dem Messen also
     aufklappen, sonst prüfte man eine Zeile, die es gar nicht gibt. */
  await page.evaluate(() => zkToggleRow(0)); await page.waitForTimeout(150);
  const kopf = await page.evaluate(() => {
    const row = document.querySelector('#zkBody tr.zk-head') || document.querySelector('tr.zk-head');
    if (!row) return null;
    return {
      chips: row.querySelectorAll('.zk-chip').length,
      tsSelects: row.querySelectorAll('select.zk-ts').length,
      art: !!row.querySelector('select[data-k="art"]'),
      ort: !!row.querySelector('select[data-k="ort"]'),
      det: (document.querySelector('tr.zk-det') || {}).innerHTML || ''
    };
  });
  ok(!!kopf && kopf.chips === 0, '#2: keine Wert-Chips mehr in der Kopfzeile', kopf && kopf.chips);
  ok(!!kopf && kopf.tsSelects === 2, '#2: beide Auswahlfelder «angeschlossene TS» stehen in der Kopfzeile', kopf && kopf.tsSelects);
  ok(!!kopf && kopf.art && kopf.ort, '#2: Bauart + Einbauort ebenfalls in der Kopfzeile');
  ok(!!kopf && kopf.det.indexOf('zk-vals') >= 0, '#2: die Rechenwerte liegen in der Aufklapp-Zeile');

  console.log('■ C: Karten-Reihenfolge — #3');
  const reihe = await page.evaluate(() => {
    const y = sel => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top + window.scrollY : null; };
    const karten = Array.from(document.querySelectorAll('.g-card')).map(c => {
      const h = c.querySelector('h2, h3, .g-card-hd');
      return { t: (h ? h.textContent : '').replace(/\s+/g, ' ').trim(), y: c.getBoundingClientRect().top + window.scrollY };
    });
    const find = re => (karten.find(k => re.test(k.t)) || {}).y;
    return { grund: find(/Grundparameter/i), ts: find(/Teilstrecken/i), pumpe: find(/Druckverluste .*Pumpe/i), schema: find(/Schema/i) };
  });
  ok(reihe.grund != null && reihe.ts != null && reihe.ts > reihe.grund,
    '#3: Teilstrecken stehen direkt unter den Grundparametern', reihe);
  ok(reihe.pumpe != null && reihe.pumpe > reihe.ts,
    '#3: eigene Karte «Druckverluste & Pumpe» unterhalb der Teilstrecken', reihe);

  ok(errors.length === 0, 'Zirkulation: keine JS-Fehler', errors.slice(0, 3));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
