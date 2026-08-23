/* Drift-Guard — Feedback 23.08.2026 (Robin Jäggi, 11 Punkte)
 *
 * Schlammsammler-Runde über zwei Module:
 *   sa_schlammsammler.html  S#1 Toggles schalten · S#2 Masstext zentriert auf
 *                           der Linie · S#3 Abscheideraum ab UK Auslauf +
 *                           Einlauf links + «Verschiedene Einläufe / Tiefster»
 *                           · S#4 alles lesbar · S#5 «+ Einlauf» hängt ans ENDE
 *                           · S#6 Trennstrich vor dem KPI-Grid entfernt
 *   sb_niederschlag.html    N#1 Bedienung raus aus dem PDF · N#2 einklappbare
 *                           Visualisierung je Schlammsammler · N#3 Abgangs-Ø
 *                           wählbar, Frost setzt die Auslauftiefe · N#4/N#5
 *                           WAR-Code lesbar bzw. nicht abgeschnitten
 *
 * Gemessen, nicht gelesen: Überlappungen, Textbreiten und Fold-Zustände werden
 * im Browser über getBoundingClientRect geprüft — eine reine Markup-Prüfung
 * hätte N#5 (globales `input,select,textarea{font-size:16px!important}` aus
 * gema_responsive.css schlägt jede Modul-Schriftgrösse) nie gefunden.
 *
 * Ausführen:  CHROME=<chromium> node scripts/feedback_20260823_2_test.mjs
 */
import { chromium } from 'playwright-core';
import { readFile } from 'fs/promises';
import { startServer, seed, newPage, BASE } from './rolematrix_harness.mjs';

const server  = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME });
let fehler = 0;
const ok = (b, t, x) => {
  console.log((b ? '  ok  ' : '  FAIL') + '  ' + t + (x != null ? ('  → ' + JSON.stringify(x)) : ''));
  if (!b) fehler++;
};

/* Beschriftungen einer Skizze einsammeln: Text, Rechteck, Überlappungen. */
const TEXTE = (sel) => `(() => {
  const svg = document.querySelector(${JSON.stringify(sel)}); if(!svg) return null;
  const t = [...svg.querySelectorAll('text')]
    .map(e => ({ txt: e.textContent, r: e.getBoundingClientRect(),
                 anchor: e.getAttribute('text-anchor') || '',
                 rot: /rotate/.test(e.getAttribute('transform') || '') }))
    .filter(x => x.r.width > 0 && x.txt.trim());
  const bad = [];
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    const a = t[i].r, b = t[j].r;
    const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
             * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    if (ov > 4) bad.push(t[i].txt + ' ⨯ ' + t[j].txt);
  }
  const box = svg.getBoundingClientRect();
  return {
    n: t.length, bad,
    texte: t.map(x => x.txt),
    raus: t.filter(x => x.r.left < box.left - 1 || x.r.right > box.right + 1).map(x => x.txt),
    rot: t.filter(x => x.rot).map(x => ({ txt: x.txt, anchor: x.anchor,
           cx: (x.r.left + x.r.right) / 2, cy: (x.r.top + x.r.bottom) / 2 })),
    box: { left: box.left, right: box.right }
  };
})()`;

/* ══════════ sa_schlammsammler — S#1 bis S#6 ══════════ */
{
  const { page, ctx } = await newPage(browser, seed(['role_planer']));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sa_schlammsammler.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  ok(errs.length === 0, 'sa: keine pageerrors', errs);
  ok(!!(await page.$('#skizzeHost svg')), 'sa: Skizze gerendert');

  /* ── S#6 «dieser strich entfernen» ─────────────────────────────
     Der Trennstrich sass unmittelbar vor dem KPI-Grid und trennte
     Eingabe von Ergebnis ohne Not. Der Strich VOR den Einläufen bleibt. */
  const strich = await page.evaluate(() => {
    const grid = document.querySelector('.g-kpi-grid');
    let p = grid && grid.previousElementSibling;
    while (p && p.nodeType === 1 && !p.offsetHeight && !p.className) p = p.previousElementSibling;
    return { vorGrid: !!(p && p.classList && p.classList.contains('g-divider')),
             anzahl: document.querySelectorAll('.g-divider').length };
  });
  ok(!strich.vorGrid, 'S#6 kein Trennstrich mehr vor dem KPI-Grid', strich);

  /* ── S#1 «diese toggles lassen sich nicht switchen» ──────────── */
  const segVor = await page.evaluate(() => document.querySelectorAll('.g-seg.active').length);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.g-seg')].find(x => /gelocht/i.test(x.textContent));
    b && b.click();
  });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !![...document.querySelectorAll('.g-seg.active')]
        .find(x => /gelocht/i.test(x.textContent))),
     'S#1 Toggle schaltet um', segVor);

  /* ── S#5 «+Einlauf» hängt ans ENDE ──────────────────────────── */
  const namen = () => page.evaluate(() =>
    [...document.querySelectorAll('#inlets .inlet-row')]
      .map(r => r.querySelector('input[type=text]')?.value || ''));
  const n0 = await namen();
  await page.click('#addInletBtn');
  await page.waitForTimeout(300);
  const nach = await namen();
  ok(nach.length === n0.length + 1, 'S#5 ein Einlauf mehr', { n0: n0.length, nach: nach.length });
  ok(n0.every((v, i) => nach[i] === v),
     'S#5 neuer Einlauf steht am SCHLUSS (Reihenfolge unverändert)', { n0, nach });

  /* ── S#3 «Verschiedene Einläufe / Tiefster» + Einlauf links ──── */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.g-seg')].find(x => /verschlossen/i.test(x.textContent));
    b && b.click();
  });
  await page.waitForTimeout(300);
  // Genau EIN Einlauf mit Tiefe → «Sohle x.xx m»
  const setzeTiefen = (werte) => page.evaluate((w) => {
    const rows = [...document.querySelectorAll('#inlets .inlet-row')];
    rows.forEach((r, i) => {
      const ins = r.querySelectorAll('input');
      const d = ins[2]; if (!d || d.readOnly) return;
      d.value = (w[i] == null ? '' : String(w[i]));
      d.dispatchEvent(new Event('input', { bubbles: true }));
      d.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return rows.length;
  }, werte);

  await setzeTiefen([0.5, '']);
  await page.waitForTimeout(350);
  let sk = await page.evaluate(TEXTE('#skizzeHost svg'));
  ok(sk && sk.texte.some(t => /Sohle 0\.50 m/.test(t)),
     'S#3 ein Einlauf → Sohle wird beziffert', sk && sk.texte);

  await setzeTiefen([0.5, 0.8]);
  await page.waitForTimeout(350);
  sk = await page.evaluate(TEXTE('#skizzeHost svg'));
  ok(sk && sk.texte.some(t => /Verschiedene Einläufe/.test(t)),
     'S#3 mehrere Einläufe → «Verschiedene Einläufe»', sk && sk.texte);
  ok(sk && sk.texte.some(t => /Tiefster: 0\.80 m/.test(t)),
     'S#3 der TIEFSTE Einlauf wird ausgewiesen', sk && sk.texte);

  const geom = await page.evaluate(() => {
    const svg = document.querySelector('#skizzeHost svg'); if (!svg) return null;
    const rects = [...svg.querySelectorAll('rect')].map(r => ({
      fill: (r.getAttribute('fill') || '').toLowerCase(),
      x: +r.getAttribute('x'), y: +r.getAttribute('y'),
      w: +r.getAttribute('width'), h: +r.getAttribute('height')
    }));
    const wasser = rects.filter(r => r.fill === '#dbeafe').sort((a, b) => a.y - b.y)[0];
    const rohre  = rects.filter(r => r.fill === '#cbd5e1').sort((a, b) => a.x - b.x);
    const einl = rohre[0], ausl = rohre[rohre.length - 1];
    // Massketten: senkrechte Linien MIT Pfeilmarker und durchgezogen — die
    // gestrichelten Hilfslinien an den Schachtwänden sind keine Massketten.
    const ketten = [...svg.querySelectorAll('path[marker-start]')]
      .filter(p => !p.getAttribute('stroke-dasharray'))
      .map(p => (p.getAttribute('d') || '').match(/^M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)$/))
      .filter(m => m && Math.abs(+m[1] - +m[3]) < 0.5 && Math.abs(+m[4] - +m[2]) > 30)
      .map(m => ({ x: +m[1], y0: Math.min(+m[2], +m[4]), y1: Math.max(+m[2], +m[4]) }));
    return { wasser, einl, ausl, ketten, viewBox: svg.getAttribute('viewBox') };
  });
  ok(geom && geom.wasser && geom.ausl &&
       Math.abs(geom.wasser.y - (geom.ausl.y + geom.ausl.h)) < 1.5,
     'S#3 Abscheideraum beginnt an der UNTERKANTE des Auslaufs',
     geom && { abscheiOben: geom.wasser?.y, auslaufUnten: geom.ausl && (geom.ausl.y + geom.ausl.h) });
  ok(geom && geom.einl && geom.ketten.length >= 2 &&
       geom.einl.x + geom.einl.w < Math.min(...geom.ketten.map(k => k.x)),
     'S#3 Einlauf links, Massketten rechts — sie kreuzen sich nie',
     geom && { einlaufRechts: geom.einl && (geom.einl.x + geom.einl.w),
               kettenLinks: geom.ketten.length ? Math.min(...geom.ketten.map(k => k.x)) : null });

  /* ── S#2 «text sauber zentriert über der beschriftungslinie» ──
     Senkrechte Massketten: Text mittig AUF der Linie (rotate -90).
     Ø-Schacht unten: Text mittig ÜBER der waagrechten Masslinie. */
  const zentriert = await page.evaluate(() => {
    const svg = document.querySelector('#skizzeHost svg'); if (!svg) return null;
    const vb = (svg.getAttribute('viewBox') || '0 0 700 500').split(/\s+/).map(Number);
    const box = svg.getBoundingClientRect();
    const sx = box.width / vb[2], sy = box.height / vb[3];
    const toDoc = (x, y) => ({ x: box.left + x * sx, y: box.top + y * sy });

    // Nur echte Massketten (Pfeilmarker, durchgezogen) — nicht die
    // gestrichelten Hilfslinien.
    const linien = [...svg.querySelectorAll('path[marker-start]')]
      .filter(p => !p.getAttribute('stroke-dasharray'))
      .map(p => (p.getAttribute('d') || '').match(/^M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)$/))
      .filter(Boolean);
    const senk = linien
      .filter(m => Math.abs(+m[1] - +m[3]) < 0.5 && Math.abs(+m[4] - +m[2]) > 30)
      .map(m => ({ x: +m[1], mitte: (+m[2] + +m[4]) / 2, laenge: Math.abs(+m[4] - +m[2]) }));
    const waag = linien
      .filter(m => Math.abs(+m[2] - +m[4]) < 0.5 && Math.abs(+m[3] - +m[1]) > 60)
      .map(m => ({ y: +m[2], mitte: (+m[1] + +m[3]) / 2, laenge: Math.abs(+m[3] - +m[1]) }));

    const abw = [];
    [...svg.querySelectorAll('text')].forEach(t => {
      const r = t.getBoundingClientRect(); if (!r.width) return;
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      if (/rotate/.test(t.getAttribute('transform') || '')) {
        // Zugehörige senkrechte Masslinie über die x-Nähe finden
        const l = senk.map(s => ({ s, d: Math.abs(toDoc(s.x, 0).x - cx) })).sort((a, b) => a.d - b.d)[0];
        if (!l || l.d > 14 * sx) { abw.push({ txt: t.textContent, grund: 'keine Linie' }); return; }
        const soll = toDoc(0, l.s.mitte).y;
        if (t.getAttribute('text-anchor') !== 'middle')
          abw.push({ txt: t.textContent, grund: 'anchor ' + t.getAttribute('text-anchor') });
        else if (Math.abs(cy - soll) > l.s.laenge * sy * 0.08 + 4)
          abw.push({ txt: t.textContent, grund: 'nicht mittig', ist: Math.round(cy), soll: Math.round(soll) });
      } else if (/Ø Schacht/.test(t.textContent)) {
        const l = waag.map(s => ({ s, d: Math.abs(toDoc(0, s.y).y - cy) })).sort((a, b) => a.d - b.d)[0];
        if (!l) { abw.push({ txt: t.textContent, grund: 'keine Linie' }); return; }
        const sollX = toDoc(l.s.mitte, 0).x, linieY = toDoc(0, l.s.y).y;
        if (Math.abs(cx - sollX) > 6) abw.push({ txt: t.textContent, grund: 'nicht mittig über der Linie' });
        if (r.bottom > linieY + 1) abw.push({ txt: t.textContent, grund: 'steht nicht ÜBER der Linie' });
      }
    });
    return { senk: senk.length, waag: waag.length, abw };
  });
  ok(zentriert && zentriert.senk >= 2 && zentriert.abw.length === 0,
     'S#2 Masstexte zentriert auf bzw. über ihrer Beschriftungslinie', zentriert && zentriert.abw);

  /* ── S#4 «wörter nicht lesbar, mache es dynamisch» ───────────── */
  const koll = await page.evaluate(TEXTE('#skizzeHost svg'));
  ok(koll && koll.bad.length === 0, 'S#4 keine überlappenden Beschriftungen', koll && koll.bad);
  ok(koll && koll.raus.length === 0, 'S#4 keine Beschriftung ausserhalb der Zeichnung', koll && koll.raus);

  await ctx.close();
}

/* ══════════ sb_niederschlag — N#1 bis N#5 ══════════ */
{
  const { page, ctx } = await newPage(browser, seed(['role_planer']));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sb_niederschlag.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(errs.length === 0, 'nb: keine pageerrors', errs);

  await page.evaluate(() => window.addRowDach && window.addRowDach());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const a = document.querySelector('#tbodyDach tr .area');
    if (a) { a.value = '250'; a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.addSS && window.addSS());
  await page.waitForTimeout(400);
  await page.evaluate(() => { const c = document.querySelector('.ss-fl-chip'); c && c.click(); });
  await page.waitForTimeout(400);

  /* ── N#3 Abgangsdimension wählbar, Frost setzt die Auslauftiefe ── */
  const p0 = await page.evaluate(() => ({
    abg:   document.querySelector('.ss-abgang')?.value,
    tiefe: document.querySelector('.ss-params .g-inp')?.value,
    chip:  !!document.querySelector('.ss-auto-chip')
  }));
  ok(p0.abg === '110', 'N#3 Standard Ø 110 mm (DN 100)', p0.abg);
  ok(p0.tiefe === '0.91', 'N#3 Auslauftiefe automatisch (Scheitel 0.80 + Ø 0.11)', p0.tiefe);
  ok(p0.chip, 'N#3 Herkunfts-Marke «auto»');
  await page.selectOption('.ss-abgang', '200');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.ss-params .g-inp')?.value) === '1',
     'N#3 Tiefe folgt der Dimension (Ø 200 → 1.00 m)');
  await page.fill('.ss-params .g-inp', '1.5');
  await page.locator('.ss-params .g-inp').blur();
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('.ss-auto-btn')),
     'N#3 eigene Eingabe gewinnt (↺ erscheint)');
  await page.click('.ss-auto-btn');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.ss-params .g-inp')?.value) === '1',
     'N#3 ↺ stellt die Automatik wieder her');

  /* ── N#4 «Schrift nicht gut lesbar, WAR-S gar nicht» ─────────── */
  const chip = await page.evaluate(() => {
    const c = document.querySelector('.ss-fl-chip.active .ss-fl-war');
    return c ? { txt: c.textContent, col: getComputedStyle(c).color } : null;
  });
  ok(chip && /255,\s*255,\s*255/.test(chip.col),
     'N#4 WAR-Code erbt die Chip-Farbe (auf dunklem Grund lesbar)', chip);

  /* ── N#5 «fehlt ein teil des textes an der endung von WAR-S» ───
     KRITISCH: die wirksame Schrift ist 16px (gema_responsive.css erzwingt
     `input,select,textarea{font-size:16px!important}` gegen den iOS-Fokus-
     Zoom) — die Modul-Regel `font-size:11px` greift NIE. Die Mindestbreite
     wird darum gegen die ECHTE Rendering-Breite gemessen. */
  const w = await page.evaluate(() => {
    const sel = document.querySelector('select.warType');
    sel.value = 'WAR-Si'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const p = document.createElement('select'); p.className = sel.className;
    p.style.cssText = 'width:auto;min-width:0;position:absolute;visibility:hidden;font-family:ui-sans-serif,system-ui,sans-serif';
    p.innerHTML = '<option>WAR-Si</option>'; sel.parentNode.appendChild(p);
    const n = p.getBoundingClientRect().width; p.remove();
    return { ist: sel.offsetWidth, noetig: Math.round(n),
             schrift: Math.round(parseFloat(getComputedStyle(sel).fontSize)) };
  });
  ok(w.ist >= w.noetig, 'N#5 «WAR-Si» passt vollständig in den Select', w);
  ok(w.schrift === 16, 'N#5 gemessen gegen die WIRKSAME Schrift (16px global)', w.schrift);
  const wrapScroll = await page.evaluate(() => {
    const el = document.querySelector('#tbodyDach')?.closest('table')?.parentElement;
    return el ? { scroll: el.scrollWidth, client: el.clientWidth } : null;
  });
  ok(!wrapScroll || wrapScroll.scroll <= wrapScroll.client + 1,
     'N#5 die Tabelle läuft dadurch nicht über', wrapScroll);

  /* ── N#2 «neue zeile pro schlammsammler mit Visualisierung» ──── */
  const v0 = await page.evaluate(() => {
    const v = document.querySelector('.ss-vis');
    return v ? { offen: v.classList.contains('open'),
                 disp: getComputedStyle(v.querySelector('.ss-vis-bd')).display,
                 svg: !!v.querySelector('svg'),
                 tit: v.querySelector('.ss-vis-tit')?.textContent } : null;
  });
  ok(v0 && !v0.offen && v0.disp === 'none', 'N#2 Visualisierung startet eingeklappt', v0);
  ok(v0 && /Visualisierung/.test(v0.tit || ''), 'N#2 Zeile heisst «Visualisierung»', v0 && v0.tit);
  ok(v0 && v0.svg, 'N#2 Skizze ist gerendert (nur per CSS versteckt — der Druck zeigt sie)');
  await page.click('.ss-vis-hd');
  await page.waitForTimeout(300);
  const v1 = await page.evaluate(TEXTE('.ss-vis-bd svg'));
  const hoehe = await page.evaluate(() => Math.round(document.querySelector('.ss-vis-bd svg').getBoundingClientRect().height));
  ok(hoehe > 100, 'N#2 Skizze nach dem Aufklappen sichtbar', hoehe);
  ok(v1 && v1.bad.length === 0, 'N#2 Beschriftungen überlappen nicht', v1 && v1.bad);
  ok(v1 && v1.raus.length === 0, 'N#2 keine Beschriftung ausserhalb der Zeichnung', v1 && v1.raus);
  ok(v1 && v1.texte.some(t => /Auslauftiefe/.test(t)) && v1.texte.some(t => /Schachttiefe/.test(t))
        && v1.texte.some(t => /Ø Schacht/.test(t)),
     'N#2 sauber bemasst (Auslauf- + Schachttiefe + Ø)', v1 && v1.texte);
  await page.evaluate(() => window.renderAllSS && window.renderAllSS());
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.querySelector('.ss-vis')?.classList.contains('open')),
     'N#2 Auf-Zustand überlebt den Re-Render');

  /* ── N#1 «bei pdf export ausblenden» ────────────────────────── */
  await page.evaluate(() => document.querySelector('.ss-vis').classList.remove('open'));
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  const dr = await page.evaluate(() => ({
    bd:   getComputedStyle(document.querySelector('.ss-vis-bd')).display,
    hd:   getComputedStyle(document.querySelector('.ss-vis-hd')).display,
    link: getComputedStyle(document.querySelector('#ssSection .g-card-hd a')).display
  }));
  await page.emulateMedia({ media: 'screen' });
  ok(dr.link === 'none', 'N#1 «→ Einzelauslegung» ist im Druck ausgeblendet', dr.link);
  ok(dr.bd === 'block' && dr.hd === 'none',
     'N#2 Druck zeigt die Skizze ohne den Fold-Kopf', dr);

  /* ── Persistenz: additiv + Bestandsschutz für Altstände ──────── */
  const rt = await page.evaluate(() => {
    const H  = window._strHooks;
    const st = H.getState();
    const s  = st.ss && st.ss[0];
    const alt = JSON.parse(JSON.stringify(st));
    alt.ss = [{ id: 1, name: 'SS 1', deckel: 'verschlossen', assigned: [],
                auslauftiefe: 0.9, schlammtiefe: 0.5, bereich: 'frost', zustand: 'neu', h: '' }];
    H.setState(alt);
    const nachAlt = H.getState().ss[0];
    return { neu: s ? { abgangDn: s.abgangDn, manuell: s.auslaufManuell, tiefe: s.auslauftiefe } : null,
             altTiefe: nachAlt.auslauftiefe, altDn: nachAlt.abgangDn, altManuell: nachAlt.auslaufManuell };
  });
  ok(rt.neu && rt.neu.abgangDn === 200, 'N#3 abgangDn wird gespeichert', rt.neu);
  ok(rt.altTiefe === 0.9, 'N#3 Altstand: gespeicherte Tiefe bleibt EXAKT stehen', rt.altTiefe);
  ok(rt.altDn === 110, 'N#3 Altstand: Ø fällt auf 110 mm zurück', rt.altDn);
  ok(rt.altManuell === true, 'N#3 Altstand: abweichende Tiefe gilt als bewusste Eingabe', rt.altManuell);

  await ctx.close();
}

/* ══════════ gema_print.js — Toggle-Werte überleben den Druck ══════════
   KNOEPFE löscht alle Buttons; ohne den SEGMENT-Eintrag verschwanden
   Deckel/Frost/Zustand ersatzlos aus dem Bericht. */
{
  const src = await readFile(new URL('../gema_print.js', import.meta.url), 'utf8');
  const seg = (src.match(/var SEGMENT = \[([\s\S]*?)\]\.join/) || [])[1] || '';
  ok(/'\.ss-toggle'/.test(seg),
     'N#1 .ss-toggle steht in SEGMENT (vor dem Knopf-Kahlschlag)');
}

console.log(fehler ? ('\n' + fehler + ' FEHLER') : '\nalles gruen');
await browser.close(); server.close();
process.exit(fehler ? 1 : 0);
