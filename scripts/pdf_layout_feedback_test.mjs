// Drift-Guard: PDF-Layout-Feedback 05.08.2026 (annotierter Enthärtungs-Bericht)
//
// Gemeldet wurden vier Punkte:
//   1. «Logo bei PDF immer gleich, links oben»
//   2. «buttons immer ausblenden im pdf» (markiert war die Einheiten-Toolbar)
//   3. «eingabefeld teilweise nicht sichtbar und wert verschoben»
//   4. «horizontal scrollen nicht gut für pdf … geht ja nicht im pdf»
//
// Dazu die drei Zusagen, die beim Umbau nicht brechen dürfen:
//   A. Ein segmentierter Umschalter TRÄGT einen Wert (3/5 grösster LU,
//      «Verschlossen/Gelocht») — er darf mit den Knöpfen nicht verschwinden.
//   B. Eine echte Ja/Nein-Angabe bleibt als ☑/☐ mit Beschriftung stehen;
//      nur der reine Einheiten-Umschalter fällt weg.
//   C. Versteckte Zustands-Felder (JSON-Blobs wie #zk_rows) gehören NICHT
//      in den Bericht.
//
// Aufruf: CHROME=<chromium> node scripts/pdf_layout_feedback_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ Teil A — statisch ═══════════════════════════════════════════════════ */
console.log('■ A: gema_print.js — Regeln im Code verankert');
const P = readFileSync('gema_print.js', 'utf8');

ok('Logo steht als ERSTES im Kopf (links oben)',
  /\(m\.logo \?\s*'<img class="gp-logo"/.test(P));
/* Feedback 12.08.2026: fest ist seither die HÖHE (= Textblock daneben), die
   Breite folgt dem Seitenverhältnis und wird nur von der Spalte begrenzt —
   object-fit:contain verzerrt dabei nie. */
ok('Logo-Höhe ist fest an den Kopf-Text gebunden, unverzerrt',
  /\.gp-logo\{[^}]*height:var\(--gp-kopftext\)[^}]*width:auto/.test(P) &&
  /object-fit:contain/.test(P) && /--gp-kopftext:/.test(P));
ok('Einheiten-Umschalter werden erkannt und entfernt',
  /istEinheitenSchalter/.test(P) && /querySelectorAll\('\.g-switch-wrap'\)/.test(P));
ok('Segmentierte Umschalter werden VOR dem Knopf-Kahlschlag zu Text',
  P.indexOf('SEGMENT') > 0 && P.indexOf('klon.querySelectorAll(SEGMENT)') < P.indexOf('klon.querySelectorAll(KNOEPFE)'));
ok('SEGMENT enthält KEINE Chart-Klassen (.bseg = Balken, .seg = Kollision)',
  !/'\.bseg'/.test(P) && !/'\.seg'/.test(P) && !/'\.dv-seg'/.test(P));
ok('Hülsen-Aufräumen nur von berührten Eltern aus (leere Chart-Divs bleiben)',
  /leereHuelsenWeg\(beruehrt\)/.test(P) && !/leereHuelsenWeg\(klon\)/.test(P));
ok('Wert-Span erbt die Klassen des Feldes (Breite kommt von der Seite)',
  /sp\.className = \(f\.className \? f\.className \+ ' ' : 'gp-solo '\)/.test(P));
ok('Versteckte Zustands-Felder werden markiert und entfernt',
  /data-gp-hide/.test(P) && /getAttribute\('data-gp-hide'\) === '1'/.test(P));
ok('Mindestbreiten gelten im Druck nicht (Tabellen/Schemata)',
  /\.gp-body table select,\.gp-body table input\{min-width:0!important\}/.test(P) &&
  /\.gp-body svg,\.gp-body img,\.gp-body \.gp-canvas\{min-width:0!important\}/.test(P));
ok('kein Umbruch mitten im Wort in Tabellen («120» darf nicht 1/2/0 werden)',
  /word-break:normal;overflow-wrap:normal/.test(P));
ok('Einpass-Script arbeitet von innen nach aussen',
  /querySelectorAll\("\*"\)\)\)\.reverse\(\)/.test(P));
ok('Script wird NACHGELEGT statt mitgeschrieben (führt garantiert aus)',
  /createElement\('script'\)/.test(P) && !/<script>' \+ fitScript/.test(P));
ok('kein Inline-Script mehr im geschriebenen HTML',
  !/\+ '<script>/.test(P));

/* ═══ Teil B — im Browser ═════════════════════════════════════════════════ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.route('**/*', r => {
  const u = r.request().url();
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
/* Bewusst ein sehr breites Logo (7.5:1) — die Box muss trotzdem gleich sein */
s['gema_orgs_v1'] = JSON.stringify([{
  id: 'org_test', name: 'Jäggi Vollmer GmbH', kategorie: 'sanitaerplaner', admins: ['u_test'], active: true,
  logo: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="120"><rect width="900" height="120" fill="#c2410c"/></svg>').toString('base64')
}]);
await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, s);

/* Satzspiegel A4 hoch: 210 mm − 2 × 13 mm Rand */
const SATZ = Math.round(184 / 25.4 * 96);

async function druck(datei, vorbereiten) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  if (vorbereiten) await page.evaluate(vorbereiten);
  await page.waitForTimeout(500);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.evaluate(() => GemaPrint.open({ title: 'Prüfbericht' }))]);
  await pop.waitForTimeout(1200);
  await pop.setViewportSize({ width: SATZ + 4, height: 1200 });
  await pop.emulateMedia({ media: 'print' });
  await pop.waitForTimeout(1200);
  return { page, pop };
}

/* Punkt 1 «Logo immer links oben, immer gleich» — seit 12.08.2026 ist die
   feste Grösse die HÖHE: sie folgt dem Kopf-Text (Projektname +
   Berechnungsname), die Breite dem Seitenverhältnis. Damit ist das Logo
   deutlich grösser als in der 26×18-mm-Box und der Titel steht mittig. */
console.log('\n■ B: Punkt 1 — Logo links oben, Höhe = Kopf-Text, Titel mittig');
{
  const { page, pop } = await druck('sa_enthaertung.html');
  const r = await pop.evaluate(() => {
    const l = document.querySelector('.gp-logo'), k = document.querySelector('.gp-kopf');
    if (!l) return { fehlt: true };
    const t = document.querySelector('.gp-kopf-l');
    const lb = l.getBoundingClientRect(), kb = k.getBoundingClientRect(), tb = t.getBoundingClientRect();
    return {
      erstesKind: k.firstElementChild === l,
      links: Math.round(lb.left - kb.left),
      hoehe: Math.round(lb.height),
      textHoehe: Math.round(tb.height),
      breite: Math.round(lb.width),
      spalte: Math.round((kb.width - tb.width) / 2),
      mitteVersatz: Math.round((tb.left + tb.width / 2) - (kb.left + kb.width / 2)),
      titelRechtsVomLogo: document.querySelector('.gp-titel').getBoundingClientRect().left > lb.right - 1
    };
  });
  ok('Logo ist das erste Element im Kopf', r.erstesKind === true, r);
  ok('Logo sitzt bündig links (0 px Versatz)', r.links === 0, r.links);
  ok('Logo ist so hoch wie der Kopf-Text (Projekt + Berechnung)',
    Math.abs(r.hoehe - r.textHoehe) <= 1, r);
  ok('breites 7.5:1-Logo bleibt in seiner Spalte (überlappt den Titel nie)',
    r.breite <= r.spalte + 1 && r.titelRechtsVomLogo === true, r);
  ok('Projektname + Berechnungsname stehen mittig auf dem Blatt',
    Math.abs(r.mitteVersatz) <= 1, r.mitteVersatz);
  await pop.close(); await page.close();
}

console.log('\n■ B: Punkt 2 — keine Bedienelemente im Bericht');
{
  const { page, pop } = await druck('sa_enthaertung.html');
  const r = await pop.evaluate(() => ({
    knoepfe: document.querySelectorAll('.gp-body button,.gp-body [role="button"]').length,
    felder: document.querySelectorAll('.gp-body input,.gp-body select,.gp-body textarea').length,
    schalter: document.querySelectorAll('.gp-body .g-switch,.gp-body .g-switch-wrap,.gp-body .g-switch-slider').length,
    toolbar: document.querySelectorAll('.gp-body .g-toolbar').length,
    segHuelsen: document.querySelectorAll('.gp-body .lumax-toggle,.gp-body .g-seg-group').length
  }));
  ok('kein Knopf mehr im Bericht', r.knoepfe === 0, r);
  ok('kein Eingabefeld mehr im Bericht', r.felder === 0, r);
  ok('kein Einheiten-Schalter mehr im Bericht', r.schalter === 0, r);
  ok('die leere Einheiten-Toolbar ist weg', r.toolbar === 0, r);
  ok('keine leeren Umschalter-Hülsen', r.segHuelsen === 0, r);
  await pop.close(); await page.close();
}

console.log('\n■ B: Punkt 3 — Wert füllt sein Feld, nichts verschoben/abgeschnitten');
{
  const { page, pop } = await druck('sa_enthaertung.html', () => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('hr_fh', '35'); set('na0', '10');
  });
  const r = await pop.evaluate(() => {
    const out = [];
    document.querySelectorAll('.gp-body .g-inp-group').forEach(g => {
      const v = g.querySelector('.gp-val'), u = g.querySelector('.g-inp-unit');
      if (!v || !u) return;
      const vb = v.getBoundingClientRect(), ub = u.getBoundingClientRect(), gb = g.getBoundingClientRect();
      out.push({
        txt: v.textContent.trim(),
        /* Wert + Einheit füllen die Gruppe (kein Loch dazwischen) */
        fuellt: Math.abs((vb.width + ub.width) - gb.width) <= 3,
        /* Text passt vollständig ins Feld */
        ganz: v.scrollWidth <= Math.ceil(vb.width) + 1,
        /* Einheit klebt direkt am Feld */
        bündig: Math.abs(ub.left - vb.right) <= 2
      });
    });
    return out;
  });
  ok('Wert-Felder gefunden', r.length >= 3, r.length);
  ok('Wert + Einheit füllen die Feldgruppe', r.every(x => x.fuellt), r.filter(x => !x.fuellt).slice(0, 3));
  ok('kein Wert abgeschnitten', r.every(x => x.ganz), r.filter(x => !x.ganz).slice(0, 3));
  ok('Einheiten-Box sitzt direkt am Feld', r.every(x => x.bündig), r.filter(x => !x.bündig).slice(0, 3));
  ok('erfasster Wert steht im Bericht', r.some(x => x.txt === '35'), r.map(x => x.txt).slice(0, 4));
  await pop.close(); await page.close();
}

console.log('\n■ B: Punkt 4 — nichts ragt über das Blatt (auf Papier gibt es kein Scrollen)');
for (const datei of ['sa_enthaertung.html', 'sb_lu_tabelle.html', 'sb_zirkulation.html', 'hz_heizungsleitungen.html', 'sb_druckverlust.html']) {
  const { page, pop } = await druck(datei);
  const r = await pop.evaluate(() => {
    const body = document.querySelector('.gp-body');
    const rechts = body.getBoundingClientRect().right;
    const raus = [];
    body.querySelectorAll('*').forEach(e => {
      if (e.closest('.gp-fit')) return;          /* verkleinerte Blöcke messen wir am Rahmen */
      const b = e.getBoundingClientRect();
      if (b.width > 0 && b.right > rechts + 1.5) raus.push(e.tagName + '.' + String(e.className || '').split(' ')[0]);
    });
    return {
      passt: Math.round(body.scrollWidth) <= Math.round(body.clientWidth) + 2,
      raus: [...new Set(raus)].slice(0, 3),
      ziffernZerlegt: /(^|\s)\d(\s+\d){2,}(\s|$)/.test(body.innerText)
    };
  });
  ok(datei + ': Inhalt passt in die Blattbreite', r.passt, r);
  ok(datei + ': kein Element ragt rechts hinaus', r.raus.length === 0, r.raus);
  ok(datei + ': keine in Einzelziffern zerlegten Zahlen', !r.ziffernZerlegt);
  await pop.close(); await page.close();
}

console.log('\n■ B: Zusagen A–C — nichts geht beim Aufräumen verloren');
{
  /* A) Segmentierter Umschalter trägt einen Wert */
  const { page, pop } = await druck('sa_schlammsammler.html');
  const r = await pop.evaluate(() => {
    const t = document.querySelector('.gp-body').innerText;
    return { deckel: /Verschlossen|Gelocht/.test(t), typ: /SSE?\s*\(t = \d+ s\)/.test(t) };
  });
  ok('gewählter Wert eines Segment-Umschalters bleibt im Bericht (Deckel)', r.deckel, r);
  ok('gewählter Wert eines Segment-Umschalters bleibt im Bericht (Typ)', r.typ, r);
  await pop.close(); await page.close();
}
{
  /* B) Echte Ja/Nein-Angabe bleibt */
  const { page, pop } = await druck('br_brandlast.html', () => {
    const c = document.getElementById('bra_herleitung');
    if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  const r = await pop.evaluate(() => ({
    haken: [...document.querySelectorAll('.gp-body .gp-chk')].map(e => e.textContent),
    label: /Herleitung aus brennbarer Masse/.test(document.querySelector('.gp-body').innerText)
  }));
  ok('gesetzte Ja/Nein-Angabe erscheint als ☑', r.haken.indexOf('☑') >= 0, r);
  ok('ihre Beschriftung bleibt stehen', r.label, r);
  await pop.close(); await page.close();
}
{
  /* C) Versteckte Zustandsfelder lecken nicht */
  const { page, pop } = await druck('sb_zirkulation.html', () => {
    const t = document.getElementById('zk_rows');
    if (t) t.value = JSON.stringify([{ nr: 1, laenge: 12, GEHEIMER_BLOB: 'x' }]);
  });
  const r = await pop.evaluate(() => ({ leck: /GEHEIMER_BLOB/.test(document.body.innerText) }));
  ok('versteckte Zustands-Felder stehen NICHT im Bericht', !r.leck, r);
  await pop.close(); await page.close();
}
{
  /* D) Leere Chart-Divs (Reduktions-Balken .bstack/.bseg, Farbpunkte)
        überleben das Hülsen-Aufräumen — sie sind Grafik, keine Hülse. */
  const { page, pop } = await druck('sa_enthaertung.html', () => {
    /* In eine GEFÜLLTE Sektion legen — eine leere würde regulär zugeklappt */
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('hr_fh', '35');
    const wirt = document.getElementById('hr_fh').closest('.g-card-bd,.g-section-bd') || document.querySelector('.g-page');
    const chart = document.createElement('div');
    chart.id = 'chartProbe';
    chart.innerHTML = '<div class="redu-track" style="position:relative;height:14px">' +
      '<div class="bstack" style="position:absolute;left:0;right:0;display:flex">' +
      '<div class="bseg" style="width:60%;background:#16a34a"></div>' +
      '<div class="bseg" style="width:40%;background:#e879f9"></div></div></div>';
    wirt.appendChild(chart);
  });
  const r = await pop.evaluate(() => ({
    probe: !!document.getElementById('chartProbe'),
    balken: document.querySelectorAll('#chartProbe .bseg').length
  }));
  ok('Chart-Container übersteht das Aufräumen', r.probe, r);
  ok('farbige Balken-Segmente bleiben erhalten', r.balken === 2, r);
  await pop.close(); await page.close();
}
{
  /* Das nachgelegte Script läuft; KEIN Feedback-Knopf in der Druckansicht
     (User-Entscheid 05.08.2026 — Feedback gehört aufs Modul selbst) */
  const { page, pop } = await druck('sa_enthaertung.html');
  const r = await pop.evaluate(() => ({
    fit: typeof window.gemaFit,
    fbKnopf: document.querySelectorAll('.gp-bar .fb, .gp-bar [onclick*="Feedback"]').length,
    fbText: /Feedback/i.test(document.querySelector('.gp-bar').textContent)
  }));
  ok('Einpass-Script ist aktiv', r.fit === 'function', r);
  ok('KEIN Feedback-Knopf in der Druckansicht', r.fbKnopf === 0 && !r.fbText, r);
  await pop.close(); await page.close();
}

await browser.close(); server.close();
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks grün'));
process.exit(fail ? 1 : 0);
