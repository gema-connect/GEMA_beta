// Drift-Guard: einheitliche Sektionen + A4-Druckansicht (Feedback 05.08.2026)
//
// Abgesichert werden die sieben Punkte des Feedbacks:
//   1. Einklappbare Sektionen in ALLEN Berechnungsmodulen.
//   2. Der Pfeil ist ein deutlicher Knopf, nicht ein blasses ▾ im Titel.
//   3. Der Pfeil steht IMMER ganz rechts — nach allfälligen Kopf-Knöpfen,
//      damit die Pfeile aller Karten untereinander stehen.
//   4. Zugeklappt verschwinden die Bedienelemente des Kopfes mit.
//   5. Sektionsnummern überall gleich (Grösse/Schrift/Form), Farbe vom Modul.
//   6. PDF-Knopf öffnet eine A4-DRUCKANSICHT zum Prüfen (kein «Speichern
//      unter»-Dialog, kein Screenshot-PDF); der separate «Drucken»-Knopf ist
//      darin aufgegangen.
//   7. Im Export: Modul-Titel + Eimer-Name, KEIN Hero/Norm-Untertitel, KEINE
//      Projektleiste, KEINE Knöpfe (auch keine ✕), Sektionen mit Werten offen,
//      leere zugeklappt.
//
// Aufruf: CHROME=<chromium> node scripts/sektion_druckansicht_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';
import { readFileSync, readdirSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info != null ? ' — ' + JSON.stringify(info) : '')); }
};

/* Alle Module mit PDF-Knopf = die Berechnungsmodule */
const MODULE = readdirSync('.')
  .filter(f => /^(sa_|sb_|hz_|lt_|el_|br_)[a-z0-9_]*\.html$/.test(f))
  .filter(f => /GemaPrint\.open\(|GemaPDF\.export\(/.test(readFileSync(f, 'utf8')));

/* ═══ Teil A — statisch ═══════════════════════════════════════════════════ */
console.log('■ A: Rollout in allen Berechnungsmodulen (' + MODULE.length + ')');
const fehlt = { sektion: [], print: [], altPdf: [], druckKnopf: [] };
for (const f of MODULE) {
  const s = readFileSync(f, 'utf8');
  if (!s.includes('gema_sektion.js')) fehlt.sektion.push(f);
  if (!s.includes('gema_print.js')) fehlt.print.push(f);
  if (s.includes('GemaPDF.export(')) fehlt.altPdf.push(f);
  if (/onclick="window\.print\(\)"/.test(s)) fehlt.druckKnopf.push(f);
}
ok('jedes Modul bindet gema_sektion.js ein', fehlt.sektion.length === 0, fehlt.sektion);
ok('jedes Modul bindet gema_print.js ein', fehlt.print.length === 0, fehlt.print);
ok('kein Modul ruft mehr GemaPDF.export (Screenshot-PDF)', fehlt.altPdf.length === 0, fehlt.altPdf);
ok('kein separater «Drucken»-Knopf mehr (geht in der Vorschau auf)',
  fehlt.druckKnopf.length === 0, fehlt.druckKnopf);

const SEK = readFileSync('gema_sektion.js', 'utf8');
ok('Pfeil ganz rechts (order + margin-left:auto)',
  /\.gsek-cx\{[^}]*order:99/.test(SEK) && /margin:0 0 0 auto!important/.test(SEK));
ok('zugeklappt: Kopf-Knöpfe weg',
  /\.gsek-zu > \.gsek-hd button:not\(\.gsek-cx\)/.test(SEK));
ok('im Druck: alles offen, Pfeil und Kopf-Knöpfe weg',
  /@media print\{\.gsek-zu > \.gsek-bd\{display:block!important\}/.test(SEK));
ok('Sektionsnummern vereinheitlicht, Farbe vom Modul (--accent)',
  /\.gsek-nr\{[\s\S]{0,400}background:var\(--accent/.test(SEK));
ok('Fold-Zustand ist Geräte-UI (localStorage, nie AutoSave)',
  /localStorage\.setItem\(KEY/.test(SEK) && !/GemaAutoSave/.test(SEK));
ok('istOffen liest den EIGENEN Marker nicht bei fremden Mechaniken (Rückkopplung)',
  /if \(sec\.eigen\) return !sec\.karte\.classList\.contains\('gsek-zu'\)/.test(SEK));

const PR = readFileSync('gema_print.js', 'utf8');
ok('Druckansicht: Hero, Projektleiste und Objekt-Hinweis fliegen raus',
  /'\.gema-hero'/.test(PR) && /'\.project-bar'/.test(PR) && /gemaObjPill/.test(PR));
ok('Druckansicht: Knöpfe inkl. ✕ zum Löschen fliegen raus',
  /var KNOEPFE = 'button/.test(PR) && /row-del/.test(PR));
ok('Druckansicht: Kopf = Modul-Titel + Eimer-Name',
  /gp-titel/.test(PR) && /gp-eimer/.test(PR) && /eimerName/.test(PR));
/* Feedback 05.08.2026: Logo IMMER links oben in fester Box — object-fit:contain
   erhält das Seitenverhältnis, die Box macht jeden Bericht gleich. */
ok('Logo links oben in fester Box, unverzerrt (object-fit:contain)',
  /gp-kopf">'\s*\+\s*\(m\.logo \?/.test(PR) &&
  /\.gp-logo\{[^}]*width:26mm[^}]*height:18mm[^}]*object-fit:contain/.test(PR));
ok('opsz-Kanon gegen das «zu dicke l»',
  /font-optical-sizing:auto/.test(PR) && /"opsz" 14/.test(PR));
/* Feedback 05.08.2026: das Script wird NACHGELEGT statt mitgeschrieben — ein
   im HTML stehendes <script> wartet auf die (u.U. nie fertig ladenden)
   Stylesheets und lief nachweislich gar nicht. */
ok('Druckfenster-Script wird programmatisch angehängt (kein Inline-Script im HTML)',
  /createElement\('script'\)/.test(PR) && !/\+ '<script>/.test(PR));
ok('leere Sektionen werden zugeklappt, nicht weggelassen',
  /data-gp-leer="1"/.test(PR) && /keine Angaben/.test(PR));

const PDF = readFileSync('gema_pdf.js', 'utf8');
/* Der Emoji darf nicht mehr GEZEICHNET werden — in Kommentaren ist er egal */
ok('gema_pdf.js: Norm-Untertitel mit 📖 (kam als «Ø=ÜÖ») wird nicht mehr gezeichnet',
  !/doc\.text\(\s*'(\\ud83d\\udcd6|📖)/.test(PDF) && !/meta\.norm\s*,\s*M\s*\+\s*logoW/.test(PDF));
ok('gema_pdf.js: Logo mit gemessenem Seitenverhältnis',
  /getImageProperties/.test(PDF));
ok('gema_pdf.js: Hero + Projektleiste + ✕ werden ausgeblendet',
  /'\.gema-hero'/.test(PDF) && /'\.project-bar'/.test(PDF) && /'\.row-del'/.test(PDF));
ok('gema_pdf.js: Eimer-Name im Kopf', /m\.eimer/.test(PDF) && /gema_ws_pool_v1/.test(PDF));

const RESP = readFileSync('gema_responsive.css', 'utf8');
ok('App selbst: opsz-Kanon (html2canvas fotografiert die LIVE-Seite ab)',
  /font-optical-sizing:\s*auto/.test(RESP) && /"opsz"\s*14/.test(RESP));

/* Schreibfehler-Sweep: echte Mojibake-Folgen im Repo */
console.log('\n■ A2: keine kaputt kodierten Umlaute (Muster «Förderköhe»)');
const MOJI = /Ã[¤¶¼Ÿ©]|â€[žœ“]|Â[ ·°]|�/;
const treffer = [];
for (const f of readdirSync('.').filter(x => /\.(html|js|css)$/.test(x))) {
  const zeilen = readFileSync(f, 'utf8').split('\n');
  zeilen.forEach((z, i) => { if (MOJI.test(z)) treffer.push(f + ':' + (i + 1)); });
}
ok('keine Mojibake in HTML/JS/CSS', treffer.length === 0, treffer.slice(0, 6));

/* ═══ Teil B — im Browser ═════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function seite(datei) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await wireRoutes(ctx);
  const s = seed(['role_planer']);
  s['gema_ws_pool_v1'] = JSON.stringify([{ id: 'ws1', name: 'Neubau Hellring 7', objektId: 'obj1' }]);
  s['gema_active_objekt_v1'] = 'obj1';
  s['gema_objekte_v1'] = JSON.stringify({
    objekte: [{ id: 'obj1', name: 'Hellring 7', strasse: 'Hellring 7', plz: '4056', ort: 'Basel',
                status: 'aktiv', orgId: 'org_test', erstelltVon: 'u_test' }],
    beteiligte: [], activeObjektId: 'obj1'
  });
  s['gema_objpool_v1'] = JSON.stringify([{ id: 'obj1', name: 'Hellring 7', strasse: 'Hellring 7',
    plz: '4056', ort: 'Basel', status: 'aktiv', orgId: 'org_test', erstelltVon: 'u_test' }]);
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, s);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  return { ctx, page, errs };
}

console.log('\n■ B: Sektionen — Pfeil rechts, Nummern gleich, Knöpfe folgen dem Zustand');
const PROBEN = ['sb_lu_tabelle.html', 'el_spannungsfall.html', 'hz_heizlast.html',
  'sa_osmose.html', 'br_brandlast.html', 'sb_grundleitungen.html'];
for (const datei of PROBEN) {
  const { ctx, page, errs } = await seite(datei);
  const r = await page.evaluate(() => {
    const secs = window.GemaSektion ? GemaSektion.sektionen() : [];
    const cx = [...document.querySelectorAll('.gsek-cx')];
    const nr = [...document.querySelectorAll('.gsek-nr')];
    const groessen = [...new Set(nr.map(e => getComputedStyle(e).width + '/' + getComputedStyle(e).fontSize))];
    return {
      sekt: secs.length,
      rechts: cx.every(c => c.parentElement && c.parentElement.lastElementChild === c),
      doppelt: [...document.querySelectorAll('.gsek-hd')].filter(h => h.querySelectorAll('.gsek-cx').length > 1).length,
      nrGroessen: groessen,
      cxGross: cx.length ? Math.round(cx[0].getBoundingClientRect().width) : 0
    };
  });
  ok(datei + ': Sektionen gefunden (' + r.sekt + ')', r.sekt > 0);
  ok(datei + ': jeder Pfeil ist letztes Kopf-Element (ganz rechts)', r.rechts);
  ok(datei + ': kein doppelter Pfeil', r.doppelt === 0, r.doppelt);
  ok(datei + ': Pfeil ist ein deutlicher Knopf (≥ 26 px)', r.cxGross >= 26, r.cxGross);
  ok(datei + ': Sektionsnummern einheitlich', r.nrGroessen.length <= 1, r.nrGroessen);
  ok(datei + ': keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B2: Zuklappen versteckt die Kopf-Knöpfe, Aufklappen bringt sie zurück');
{
  const { ctx, page } = await seite('hz_heizlast.html');
  const r = await page.evaluate(async () => {
    const secs = GemaSektion.sektionen();
    /* Eine Sektion mit einem Knopf im Kopf suchen; sonst einen einsetzen */
    let s = secs.find(x => x.hd.querySelector('button:not(.gsek-cx)'));
    if (!s) {
      s = secs[0];
      const b = document.createElement('button');
      b.className = 'g-btn'; b.textContent = 'Test';
      s.hd.insertBefore(b, s.cx);
    }
    const knopf = s.hd.querySelector('button:not(.gsek-cx)');
    const vorher = getComputedStyle(knopf).display !== 'none';
    s.cx.click();
    await new Promise(r2 => setTimeout(r2, 120));
    const zuKnopf = getComputedStyle(knopf).display === 'none';
    const zuBody = getComputedStyle(s.bd).display === 'none';
    const pfeilBleibt = getComputedStyle(s.cx).display !== 'none';
    s.cx.click();
    await new Promise(r2 => setTimeout(r2, 120));
    return {
      vorher, zuKnopf, zuBody, pfeilBleibt,
      wiederKnopf: getComputedStyle(knopf).display !== 'none',
      wiederBody: getComputedStyle(s.bd).display !== 'none'
    };
  });
  ok('Knopf im Kopf ist offen sichtbar', r.vorher);
  ok('zugeklappt: Inhalt weg', r.zuBody);
  ok('zugeklappt: Kopf-Knopf weg', r.zuKnopf);
  ok('zugeklappt: der Pfeil selbst bleibt (sonst käme man nie wieder auf)', r.pfeilBleibt);
  ok('aufgeklappt: Inhalt zurück', r.wiederBody);
  ok('aufgeklappt: Kopf-Knopf zurück', r.wiederKnopf);
  await ctx.close();
}

console.log('\n■ B3: Fold-Zustand überlebt den Reload, liegt aber NICHT im AutoSave');
{
  const { ctx, page } = await seite('hz_heizlast.html');
  await page.evaluate(() => GemaSektion.sektionen()[0].cx.click());
  await page.waitForTimeout(200);
  const key = await page.evaluate(() => GemaSektion.KEY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  const r = await page.evaluate(k => ({
    zu: !GemaSektion.istOffen(GemaSektion.sektionen()[0]),
    gespeichert: !!localStorage.getItem(k),
    imSnapshot: Object.keys(localStorage).filter(x => /^gema_(?!fold_)/.test(x))
      .some(x => /fold/i.test(String(localStorage.getItem(x) || '')))
  }), key);
  ok('Zustand überlebt den Reload (pro Gerät)', r.zu);
  ok('Zustand liegt im eigenen Fold-Schlüssel', r.gespeichert);
  ok('Fold-Zustand steckt in KEINEM AutoSave-Snapshot', !r.imSnapshot);
  await ctx.close();
}

console.log('\n■ B4: Druckansicht — Aufbau, Inhalt, leere Sektionen');
for (const datei of ['sb_lu_tabelle.html', 'el_spannungsfall.html']) {
  const { ctx, page, errs } = await seite(datei);
  const [pop] = await Promise.all([
    ctx.waitForEvent('page'),
    page.evaluate(() => GemaPrint.open({ title: 'Prüfbericht' }))
  ]);
  await pop.waitForTimeout(1400);
  const r = await pop.evaluate(() => ({
    titel: (document.querySelector('.gp-titel') || {}).textContent || '',
    eimer: (document.querySelector('.gp-eimer') || {}).textContent || '',
    fenstertitel: document.title,
    blatt: !!document.querySelector('.gp-blatt'),
    leiste: !!document.querySelector('.gp-bar'),
    druckKnopf: /Drucken/.test(document.querySelector('.gp-bar') ? document.querySelector('.gp-bar').textContent : ''),
    chrome: document.querySelectorAll('.gp-body .g-nav,.gp-body .gema-hero,.gp-body .hero,.gp-body .project-bar').length,
    knoepfe: document.querySelectorAll('.gp-body button,.gp-body .g-btn,.gp-body .btn,.gp-body .row-del').length,
    restInputs: document.querySelectorAll('.gp-body input,.gp-body select,.gp-body textarea').length,
    werte: document.querySelectorAll('.gp-val').length,
    sekt: document.querySelectorAll('.gp-body .g-card,.gp-body .el-card,.gp-body .g-section').length,
    zu: document.querySelectorAll('.gp-zu').length,
    zuOhneRumpf: [...document.querySelectorAll('.gp-zu')]
      .every(k => !k.querySelector('.g-card-bd,.el-card-bd,.g-section-bd')),
    offenMitRumpf: [...document.querySelectorAll('.gp-body .g-card:not(.gp-zu),.gp-body .el-card:not(.gp-zu)')]
      .every(k => !!k.querySelector('.g-card-bd,.el-card-bd'))
  }));
  ok(datei + ' → Druckansicht: Modul-Titel im Kopf', r.titel === 'Prüfbericht', r.titel);
  ok(datei + ' → Druckansicht: Eimer-Name darunter', r.eimer === 'Neubau Hellring 7', r.eimer);
  ok(datei + ' → Fenstertitel trägt Titel + Eimer (= PDF-Dateiname)',
    r.fenstertitel.includes('Prüfbericht') && r.fenstertitel.includes('Neubau Hellring 7'), r.fenstertitel);
  ok(datei + ' → A4-Blatt zum Prüfen', r.blatt);
  ok(datei + ' → Bedienleiste mit «Drucken / Als PDF speichern»', r.leiste && r.druckKnopf);
  ok(datei + ' → kein Hero/Nav/Projektleiste im Bericht', r.chrome === 0, r.chrome);
  ok(datei + ' → keine Knöpfe im Bericht (auch keine ✕)', r.knoepfe === 0, r.knoepfe);
  ok(datei + ' → Eingaben sind statischer Text geworden', r.restInputs === 0 && r.werte > 0,
    { rest: r.restInputs, werte: r.werte });
  ok(datei + ' → Sektionen im Bericht (' + r.sekt + ')', r.sekt > 0);
  ok(datei + ' → leere Sektionen ohne Rumpf (Titel bleibt sichtbar)', r.zuOhneRumpf);
  ok(datei + ' → Sektionen mit Werten behalten ihren Rumpf', r.offenMitRumpf);
  ok(datei + ' → keine JS-Fehler', errs.length === 0, errs.slice(0, 2));
  await ctx.close();
}

console.log('\n■ B5: zugeklappte Sektion kommt im Export TROTZDEM mit Werten');
{
  const { ctx, page } = await seite('el_spannungsfall.html');
  await page.evaluate(() => { GemaSektion.setzeAlle(false); });   /* alles zuklappen */
  await page.waitForTimeout(200);
  const [pop] = await Promise.all([
    ctx.waitForEvent('page'),
    page.evaluate(() => GemaPrint.open({ title: 'Test' }))
  ]);
  await pop.waitForTimeout(1200);
  const r = await pop.evaluate(() => ({
    werte: document.querySelectorAll('.gp-val').length,
    zu: document.querySelectorAll('.gp-zu').length,
    gsekZu: document.querySelectorAll('.gsek-zu').length
  }));
  ok('Bildschirm-Fold beeinflusst den Export nicht (kein gsek-zu im Bericht)', r.gsekZu === 0, r.gsekZu);
  ok('gefüllte Sektionen erscheinen trotz zugeklappter Ansicht', r.werte > 0, r.werte);
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
