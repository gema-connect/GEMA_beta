// Drift-Guard: PDF-Export der Berechnungen — abgeschnittene / komisch
// dargestellte Abschnitte (Feedback 11.09.2026, Robin).
//
// Gefunden per Messung über alle 50 Berechnungsmodule:
//   1. Scroll-Container (Dampfdruck-Tafel .dd-wrap, max-height + overflow)
//      wurden auf Papier ABGESCHNITTEN — alles, was am Bildschirm scrollte,
//      fehlte (sb_saugpumpe, 327 px unter dem Blattende).
//   2. Tab-Module exportierten NUR die offene Mappe (sb_warmwasser: 5 von 6
//      Kapiteln fehlten still) — und die Mappe als EIN Block auf 34–66 %
//      geschrumpft (Ein-Kind-Kette .tab-content > .g-main-grid).
//   3. Karten, die nicht ganz in den Restplatz passten, wanderten komplett
//      aufs nächste Blatt → halb leere Seiten (sb_zirkulation: 8 Blätter).
//   4. Zweispaltige Karten-Raster (.two-col) als Ganzes verkleinert.
//   5. Toast «✓ Gespeichert» (position:fixed) lag als Kasten auf dem Blatt;
//      nackte Fold-Pfeile «▸», Sprung-Chips «📈 öffnen», leere ✕-Spalten.
//   6. Reine Ergebnis-Karten (KPI-Kacheln) galten als «— keine Angaben».
//   7. Tabellen mit nowrap-Köpfen auf 54–65 % geschrumpft.
//
// Absicht wird geprüft, nicht Wortlaut: gemessen werden Blattgrenzen,
// Skalierungen, Mappen-Zahl und Restplatz. Gegenprobe: GEGENPROBE=1 serviert
// gema_print.js OHNE Scroll-Öffnung, Mappen und Fit-Lösung — dann müssen die
// betroffenen Browser-Checks rot werden.
//
// Aufruf: CHROME=<chromium> node scripts/pdf_abschnitte_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GEGENPROBE = process.env.GEGENPROBE === '1';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ Teil A — statisch ═══════════════════════════════════════════════════ */
console.log('■ A: Regeln im Code verankert');
const P = readFileSync('gema_print.js', 'utf8');
const S = readFileSync('gema_sektion.js', 'utf8');
ok('Scroll-Container werden GEMESSEN markiert (overflow auto/scroll, senkrecht gekappt)',
  /data-gp-scroll/.test(P) && /overflowY/.test(P) && /scrollHeight > e\.clientHeight/.test(P));
ok('Druck-CSS öffnet markierte Scroll-Container',
  /\[data-gp-scroll\]\{overflow:visible!important;max-height:none!important/.test(P));
ok('position:fixed wird gemessen und entfernt', /cs\.position === 'fixed'/.test(P) && /'\[data-gp-fix\]'/.test(P));
ok('alle Mappen (.tab-content) sichtbar, mit Reiter-Titel',
  /\.tab-content\.gp-tab\{display:block!important\}/.test(P) && /function mappen\(/.test(P) && /gp-mappe/.test(P));
ok('Ausnahmen werden BENANNT (data-gp-tabs="aktiv", data-gp-print="weg")',
  /data-gp-tabs/.test(P) && /data-gp-print/.test(P) && /nicht im Bericht/.test(P));
ok('Mappen laufen VOR dem Knopf-Kahlschlag (Reiter tragen die Titel)',
  P.indexOf('mappen(klon)') < P.indexOf('klon.querySelectorAll(KNOEPFE)'));
ok('Ein-Kind-Ketten werden abgestiegen (childElementCount>=1)',
  /k\.childElementCount>=1\)\{/.test(P) && /bl\.childElementCount>=1&&st/.test(P));
ok('Restplatz wird genutzt (frei() ≥ 28 %) — nicht über body.scrollHeight',
  /function frei\(\)/.test(P) && /frei\(\)>=body\.clientHeight\*0\.28/.test(P) && !/frei=body\.clientHeight-body\.scrollHeight/.test(P));
ok('Verkleinern nur unter Zwang (leeres Blatt)', /GP\.zwang/.test(P) && /if\(!GP\.zwang\)\{GP\.teil=false;return kinder;\}/.test(P));
ok('Breiten-Fit wird beim Absteigen gelöst', /function fitLoesen\(/.test(P) && (P.match(/fitLoesen\(/g) || []).length >= 5);
ok('mehrspaltige Karten-Raster werden linearisiert', /function linearisierbar\(/.test(P) && /\.gp-linear\{display:block!important/.test(P));
ok('Tabellenköpfe dürfen umbrechen', /table th\{[^}]*white-space:normal!important/.test(P));
ok('nackte Pfeil-Glyphen und leere Spalten werden entfernt', /CHEVRON/.test(P) && /function leereSpaltenWeg\(/.test(P));
ok('Schleifen-Sicherung vorhanden', /GP\.schritte>20000/.test(P) && />300\)throw/.test(P));
ok('hatWerte kennt KPI-Kacheln', /\.ww-kpi \.v/.test(S) && /\.g-kpi-val/.test(S));
ok('Modul-Marker gesetzt', /data-gp-tabs="aktiv"/.test(readFileSync('sb_druckerhoehung.html', 'utf8')) &&
  /id="et4" class="tab-content" data-gp-print="weg"/.test(readFileSync('sb_druckverlust_erdgas.html', 'utf8')) &&
  /class="no-print" style="margin-left:8px/.test(readFileSync('sb_zirkulation.html', 'utf8')));

/* ═══ Teil B — im Browser ═════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
/* Gegenprobe: gema_print.js ohne die drei Kern-Fixes ausliefern */
let printJs = P;
if (GEGENPROBE) {
  printJs = printJs
    .replace("if (scrollt || gekappt) e.setAttribute('data-gp-scroll', '1');", '')
    .replace('mappen(klon);', '')
    .replace(/fitLoesen\((k|karte|bl)\);/g, '');
}
await ctx.route('**/*', r => {
  const u = r.request().url();
  if (GEGENPROBE && u === BASE + '/gema_print.js') return r.fulfill({ contentType: 'text/javascript', body: printJs });
  if (u.startsWith(BASE)) return r.continue();
  if (u.includes('fonts.g')) return r.fulfill({ contentType: 'text/css', body: '/*mock*/' });
  if (u.includes('supabase') || u.includes('/rest/v1/') || u.includes('/sb/')) return r.fulfill({ contentType: 'application/json', body: '[]' });
  if (u.includes('/api/') || u.includes('/.netlify/')) return r.fulfill({ contentType: 'application/json', body: '{}' });
  return r.abort();
});
const s = seed(['role_planer']);
s['gema_ws_pool_v1'] = JSON.stringify([{ id: 'ws1', name: 'Dörnliweg 5, 4125 Riehen', objektId: 'obj1' }]);
s['gema_active_objekt_v1'] = 'obj1';
s['gema_objpool_v1'] = JSON.stringify([{ id: 'obj1', name: 'Dörnliweg 5', strasse: 'Dörnliweg 5', plz: '4125', ort: 'Riehen', status: 'aktiv', orgId: 'org_test', erstelltVon: 'u_test' }]);
s['gema_orgs_v1'] = JSON.stringify([{ id: 'org_test', name: 'Jäggi Vollmer GmbH', kategorie: 'sanitaerplaner', admins: ['u_test'], active: true }]);
await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, s);

const SATZ = Math.round(210 / 25.4 * 96);

/* Alle sichtbaren Felder mit Werten füllen (Sektionen «mit Werten») */
function fuellen() {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  let i = 0;
  document.querySelectorAll('input,textarea').forEach(f => {
    if (!vis(f) || ['checkbox', 'radio', 'file', 'range', 'button', 'submit', 'date', 'hidden'].includes(f.type)) return;
    if (f.readOnly || f.disabled || String(f.value || '').trim()) return;
    const dec = (f.getAttribute('inputmode') === 'decimal' || f.type === 'number');
    f.value = dec ? String(3 + (i % 7) * 2.5) : (f.tagName === 'TEXTAREA' ? 'Bemerkung' : 'Test ' + (i + 1)); i++;
    try { f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { }
  });
}
async function druck(datei, vorbereiten) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.evaluate(fuellen);
  if (vorbereiten) await page.evaluate(vorbereiten);
  await page.waitForTimeout(700);
  const warn = [];
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.evaluate(() => GemaPrint.open())]);
  pop.on('console', m => { if (/GemaPrint/.test(m.text())) warn.push(m.text()); });
  await pop.setViewportSize({ width: SATZ + 40, height: 1300 });
  await pop.waitForTimeout(3200);
  return { page, pop, warn };
}
/* Messung je Blatt: was ragt über den Inhaltsbereich, welche Fits, wie voll */
const MESSEN = () => {
  const out = { blaetter: 0, raus: [], fits: [], fuellung: [], mappen: [], text: '' };
  const seiten = document.querySelectorAll('.gp-blatt');
  out.blaetter = seiten.length;
  seiten.forEach((bl, si) => {
    const body = bl.querySelector('.gp-body');
    const bb = body.getBoundingClientRect();
    let unten = 0;
    body.querySelectorAll('*').forEach(e => {
      if (e.closest('.gp-fit') && !e.classList.contains('gp-fit')) return;
      const b = e.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return;
      unten = Math.max(unten, b.bottom - bb.top);
      if (b.bottom > bb.bottom + 1.5 || b.right > bb.right + 1.5) {
        out.raus.push({ s: si + 1, el: e.tagName + (e.id ? '#' + e.id : '') + '.' + String(e.className || '').split(' ')[0], u: Math.round(b.bottom - bb.bottom), r: Math.round(b.right - bb.right) });
      }
    });
    out.fuellung.push(Math.round(100 * unten / bb.height));
    /* Gekappte Rahmen: ein Element, dessen Inhalt in einem Scroll-/Clip-Rahmen
       hängt (auf Papier unsichtbar). Höhen-Fits (.gp-fit) sind bewusst
       gekappt (skalierter Inhalt), Blatt und Inhaltsbereich ebenfalls. */
    body.querySelectorAll('*').forEach(e => {
      if (e.classList.contains('gp-fit') || e.closest('.gp-fit')) return;
      const cs = getComputedStyle(e);
      if (!/auto|scroll|hidden|clip/.test(cs.overflowY)) return;
      if (e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0) {
        out.gekappt = out.gekappt || [];
        out.gekappt.push({ s: si + 1, el: e.tagName + (e.id ? '#' + e.id : '') + '.' + String(e.className || '').split(' ')[0], sichtbar: e.clientHeight, inhalt: e.scrollHeight });
      }
    });
    body.querySelectorAll('.gp-fit').forEach(w => {
      const k = w.firstElementChild; if (!k) return;
      const m = /scale\(([\d.]+)\)/.exec(k.style.transform || '');
      out.fits.push({ s: si + 1, el: k.tagName + (k.id ? '#' + k.id : '') + '.' + String(k.className || '').split(' ')[0], f: m ? +m[1] : 1, hoch: !!w.getAttribute('data-gp-hoch') });
    });
    body.querySelectorAll('.gp-mappe').forEach(m => out.mappen.push(m.textContent.trim()));
  });
  out.raus = out.raus.slice(0, 8);
  out.text = document.querySelector('.gp-stage').innerText;
  return out;
};

console.log('\n■ B1: sb_saugpumpe — Scroll-Tafel (Dampfdruck) vollständig, nichts unter dem Blattende');
{
  const { page, pop, warn } = await druck('sb_saugpumpe.html');
  const r = await pop.evaluate(MESSEN);
  const zeilen = await pop.evaluate(() => document.querySelectorAll('.gp-blatt [id="sg_ddtable"] tbody tr, .gp-blatt table[id="sg_ddtable"] tr').length);
  const live = await page.evaluate(() => document.querySelectorAll('#sg_ddtable tbody tr').length);
  ok('kein Element ragt unter/über das Blatt', r.raus.length === 0, r.raus);
  ok('kein Rahmen kappt seinen Inhalt (Scroll-Container geöffnet)', !(r.gekappt || []).length, (r.gekappt || []).slice(0, 4));
  ok('alle Zeilen der Dampfdruck-Tafel im Bericht (Tafel geteilt, nicht gekappt)', live > 8 && zeilen >= live, { live, zeilen });
  ok('keine 20-%-Notverkleinerung', !warn.some(t => /20 %/.test(t)), warn.slice(0, 2));
  await pop.close(); await page.close();
}

console.log('\n■ B2: sb_warmwasser — alle Mappen im Bericht, nichts als Ganzes geschrumpft, Ergebnis-Karte nicht «leer»');
{
  const { page, pop, warn } = await druck('sb_warmwasser.html');
  const r = await pop.evaluate(MESSEN);
  const reiter = await page.evaluate(() => [...document.querySelectorAll('#pdfArea .g-tab[data-tab]')].map(b => b.textContent.trim()));
  ok('jede Mappe trägt ihren Reiter-Titel als Zwischentitel', reiter.length >= 5 && reiter.every(t => r.mappen.includes(t)), { reiter, mappen: r.mappen });
  ok('Inhalte weiterer Mappen stehen im Bericht (Verlustzahl, Speicher)', /Verlustzahl/.test(r.text) && /Speicher/.test(r.text));
  ok('kein Tab-Panel als Ganzes verkleinert (kein Höhen-Fit auf .tab-content)',
    !r.fits.some(f => f.hoch && /tab-content|g-main-grid/.test(f.el)), r.fits.filter(f => f.hoch));
  ok('kein Höhen-Fit unter 75 %', !r.fits.some(f => f.hoch && f.f < 0.75), r.fits.filter(f => f.hoch && f.f < 0.75));
  ok('«1.4 Ergebnis» gilt nicht als «keine Angaben» (KPI-Kacheln zählen)',
    await pop.evaluate(() => { const h = [...document.querySelectorAll('.gp-blatt #wt1 .g-card-hd h2')].find(x => /Ergebnis\s*$/.test(x.textContent)); return !!h && !h.closest('.g-card').classList.contains('gp-zu'); }));
  ok('kein Element ragt über das Blatt', r.raus.length === 0, r.raus);
  ok('keine 20-%-Notverkleinerung', !warn.some(t => /20 %/.test(t)), warn.slice(0, 2));
  await pop.close(); await page.close();
}

console.log('\n■ B3: sb_regenwasserrechner — Ein-Kind-Kette abgestiegen, Restplatz genutzt, langer Titel im Kopf');
{
  const { page, pop, warn } = await druck('sb_regenwasserrechner.html');
  const r = await pop.evaluate(MESSEN);
  ok('kein Höhen-Fit unter 75 % (früher 34 %)', !r.fits.some(f => f.hoch && f.f < 0.75), r.fits);
  ok('keine 20-%-Notverkleinerung', !warn.some(t => /20 %/.test(t)), warn.slice(0, 2));
  ok('Blätter in vernünftiger Zahl (< 14)', r.blaetter < 14, r.blaetter);
  ok('kein Element ragt über das Blatt', r.raus.length === 0, r.raus);
  const kopf = await pop.evaluate(() => { const t = document.querySelector('.gp-titel'), l = document.querySelector('.gp-linie'); return { titelUnten: t.getBoundingClientRect().bottom, linie: l.getBoundingClientRect().top }; });
  ok('langer Titel bleibt über der Markenlinie', kopf.titelUnten <= kopf.linie, kopf);
  await pop.close(); await page.close();
}

console.log('\n■ B4: sb_zirkulation — Restplatz: Karten werden im Restplatz begonnen, Bedien-Chip und Toast draussen');
{
  const { page, pop } = await druck('sb_zirkulation.html');
  const r = await pop.evaluate(MESSEN);
  /* Ein Blatt, das nicht das letzte ist, darf nicht halb leer sein, wenn
     danach noch teilbare Karten kommen — gemessen: mittlere Füllung der
     Blätter ausser dem letzten ≥ 72 % */
  const voll = r.fuellung.slice(0, -1);
  const mittel = voll.reduce((a, b) => a + b, 0) / Math.max(1, voll.length);
  ok('Blätter (ausser dem letzten) sind im Mittel ≥ 72 % gefüllt', mittel >= 72, r.fuellung);
  ok('«📈 öffnen»-Sprung-Chip nicht im Bericht', !/öffnen/.test(r.text));
  ok('kein Toast «Gespeichert» im Bericht', !/Gespeichert/.test(r.text));
  ok('Fortsetzungs-Marke vorhanden (Karte über die Blattgrenze geteilt)', /Fortsetzung/.test(r.text));
  await pop.close(); await page.close();
}

console.log('\n■ B5: sb_druckdispositiv — zweispaltiges Karten-Raster untereinander statt verkleinert');
{
  const { page, pop } = await druck('sb_druckdispositiv.html');
  const r = await pop.evaluate(MESSEN);
  const lin = await pop.evaluate(() => {
    const out = [];
    document.querySelectorAll('.gp-blatt .two-col').forEach(t => {
      const bw = t.getBoundingClientRect().width;
      out.push({ linear: t.classList.contains('gp-linear'), breiten: [...t.children].map(c => Math.round(100 * c.getBoundingClientRect().width / bw)) });
    });
    return out;
  });
  ok('.two-col ist linearisiert', lin.length > 0 && lin.every(x => x.linear), lin);
  ok('Karten stehen in voller Blattbreite', lin.every(x => x.breiten.every(b => b >= 95)), lin);
  ok('kein Höhen-Fit auf .two-col', !r.fits.some(f => f.hoch && /two-col/.test(f.el)), r.fits);
  await pop.close(); await page.close();
}

console.log('\n■ B6: sb_druckverlust — Toast draussen, nackter Fold-Pfeil draussen, kein Überlauf');
{
  const { page, pop } = await druck('sb_druckverlust.html', () => { const t = document.getElementById('toast'); if (t) { t.textContent = '✓ Gespeichert'; t.classList.add('show'); } });
  const r = await pop.evaluate(MESSEN);
  ok('kein Toast «Gespeichert» im Bericht', !/Gespeichert/.test(r.text));
  ok('kein nackter Pfeil «▸/▾» im Bericht', !/[▸▾]/.test(r.text));
  ok('kein Element ragt über das Blatt', r.raus.length === 0, r.raus);
  await pop.close(); await page.close();
}

console.log('\n■ B7: Ausnahmen werden benannt — Variante (sb_druckerhoehung) und Referenz-Mappe (sb_druckverlust_erdgas)');
{
  const { page, pop } = await druck('sb_druckerhoehung.html');
  const r = await pop.evaluate(MESSEN);
  ok('nicht gewählte Variante wird benannt, nicht gedruckt', /«Mit Druckwindkessel» — nicht gewählte Variante, nicht im Bericht/.test(r.text), r.text.slice(0, 200));
  ok('die gedruckte Variante ist als Mappe benannt', r.mappen.length === 1 && r.mappen[0] === 'Drehzahlreguliert', r.mappen);
  await pop.close(); await page.close();
}
{
  const { page, pop } = await druck('sb_druckverlust_erdgas.html');
  const r = await pop.evaluate(MESSEN);
  ok('Referenz-Mappe «ζ-Werte» wird als Zeile benannt', /ζ-Werte \(Referenz\)» — Nachschlagetabelle, nicht im Bericht/.test(r.text));
  ok('die drei Fach-Mappen stehen mit Titel im Bericht', r.mappen.length === 3, r.mappen);
  ok('kein Element ragt über das Blatt', r.raus.length === 0, r.raus);
  await pop.close(); await page.close();
}

console.log('\n■ B8: hz_waermegruppen — Tabellenköpfe umbrechen, Tabelle nicht mehr auf 54 %');
{
  const { page, pop } = await druck('hz_waermegruppen.html');
  const r = await pop.evaluate(MESSEN);
  const wg = r.fits.find(f => /table\.wg/i.test(f.el) || /TABLE\.wg/.test(f.el));
  ok('Raumliste-Tabelle mindestens auf 60 % (früher 54 %)', !wg || wg.f >= 0.6, r.fits);
  ok('alle vier Mappen im Bericht', r.mappen.length === 4, r.mappen);
  ok('kein Element ragt über das Blatt', r.raus.length === 0, r.raus);
  await pop.close(); await page.close();
}

await browser.close(); server.close();
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks grün'));
process.exit(fail ? 1 : 0);
