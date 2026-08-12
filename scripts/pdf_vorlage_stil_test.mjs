// Drift-Guard: PDF-Export im Vorlagen-Stil (Kunden-Vorlage 12.08.2026,
// «PDF_Export_Vorlage_Schmutz_Partner»)
//
// Abgesichert wird das Blatt-Layout von gema_print.js:
//   1. Der Bericht besteht aus FESTEN A4-Blättern (210×297 mm) — die Vorschau
//      zeigt exakt die Seiten, die aus dem Druckdialog kommen.
//   2. JEDES Blatt trägt die volle Kopfzeile (Logo-Box · Projekt + Titel ·
//      Firma/Datum/Bearbeitung), die Trennlinie in der Firmenfarbe und die
//      Fusszeile (Firma · gema-connect.ch · «Seite X / Y»).
//   3. Die Kategorie-Zeile («Kicker» aus dem Breadcrumb) steht NUR auf dem
//      ersten Blatt.
//   4. Sektionen erscheinen als fortlaufend nummerierte Karten (01, 02, …);
//      die Bildschirm-Schrittnummern (.gsek-nr) weichen ihnen.
//   5. Eine Karte, die nicht aufs Blatt passt, wird GETEILT: Hinweis
//      «Fortsetzung auf der nächsten Seite», auf dem Folgeblatt wiederholt
//      sich der Kartenkopf (samt Nummer) mit der «Fortsetzung»-Marke,
//      Tabellen nehmen ihre Kopfzeile mit, die Fusszeile (tfoot) kommt
//      GENAU EINMAL — und KEINE Zeile geht verloren.
//   6. Kein Blatt läuft vertikal über; die Paginierung ist idempotent
//      (Nachfass-Läufe bauen nichts doppelt).
//
// Aufruf: CHROME=<chromium> node scripts/pdf_vorlage_stil_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, wireRoutes } from './rolematrix_harness.mjs';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let n = 0, fail = 0;
const ok = (name, cond, info) => {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); }
};

/* ═══ Teil A — statisch: die Vorlagen-Merkmale im Code ════════════════════ */
console.log('■ A: gema_print.js — Blatt-Layout der Vorlage verankert');
const P = readFileSync('gema_print.js', 'utf8');

ok('feste A4-Blätter (210×297 mm, overflow hidden)',
  /\.gp-blatt\{width:210mm;height:297mm;position:relative;overflow:hidden/.test(P));
ok('Blatt-Vorlage mit Kopf + Inhalt + Fuss (Paginierung stanzt daraus jedes Blatt)',
  /<template id="gpBlattTpl">/.test(P) && /'<section class="gp-blatt">' \+ kopf \+ '<div class="gp-body"><\/div>' \+ fuss/.test(P));
ok('Kopf: Trennlinie in der Firmenfarbe unter der Kopfzeile',
  /\.gp-linie\{[^}]*background:' \+ b\.acc/.test(P));
ok('Kopf: Titel im dunkleren Ton derselben Farbfamilie (brand → brand-dark)',
  /var dunkel = lesbar\(/.test(P) && /\.gp-titel\{[^}]*color:' \+ b\.dunkel/.test(P));
ok('Kopf rechts: Firma fett, Datum, «Bearbeitung: …»',
  /Bearbeitung: ' \+ esc\(m\.bearbeiter\)/.test(P) && /<strong>' \+ esc\(m\.firma\)/.test(P));
/* Feedback 12.08.2026: Projekt + Titel MITTIG (Grid 1fr auto 1fr), Logo links
   so hoch wie dieser Textblock — die Breite folgt dem Seitenverhältnis. */
ok('Kopf: drei Spalten, Projekt + Titel mittig',
  /\.gp-kopf\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/.test(P) &&
  /\.gp-kopf-l\{[^}]*text-align:center/.test(P));
ok('Logo-Höhe folgt dem Kopf-Text (CSS-Vorgabe + Nachmessung im Script)',
  /--gp-kopftext:/.test(P) && /\.gp-logo\{[^}]*height:var\(--gp-kopftext\)/.test(P) &&
  /function gemaKopfLogo\(\)/.test(P) && /querySelector\("\.gp-kopf-l"\)/.test(P));
ok('ohne Firmenlogo hält eine leere Spalte den Titel in der Mitte',
  /gp-logo-leer/.test(P));
ok('Fusszeile: Firma · gema-connect.ch · Seite X / Y',
  /gema-connect\.ch/.test(P) && /gp-seite/.test(P) && /"Seite "\+\(i\+1\)\+" \/ "\+seiten\.length/.test(P));
ok('Kicker aus dem Breadcrumb des Moduls (Kategorie-Zeile, nur erstes Blatt)',
  /a\.bc-cat/.test(P) && /gp-kicker/.test(P));
/* Feedback 12.08.2026 «nur das Projekt auf Seite 1, dann ist die Seite leer»:
   aus einem Eimer heraus trägt der Breadcrumb den Eimer-Namen — der steht
   schon im Kopf; der Kicker entfällt dann. */
ok('Kicker entfällt, wenn er Projekt oder Titel nur wiederholt',
  /norm\(m\.kategorie\) === norm\(m\.eimer\)/.test(P) && /m\.kategorie = ''/.test(P));
/* Unsichtbare Reste (leeres <span> der Modulseite) belegten Blatt 1 und
   schoben den ganzen Inhalt auf Blatt 2. */
ok('unsichtbare Hülsen werden gar nicht erst platziert',
  /function sichtbar\(el\)/.test(P) && /\.filter\(sichtbar\)\.forEach\(platziere\)/.test(P));
ok('«leeres Blatt» wird GEMESSEN, nicht an der Kinderzahl abgelesen',
  /function leerIst\(\)\{/.test(P) && /getBoundingClientRect\(\)\.height>1\) return false/.test(P));
ok('Offerten-Reiter der Modulseite steht nicht im Bericht',
  /#gema-offerten-tab/.test(P) && /#gema-offerten-panel/.test(P));
ok('Karten fortlaufend nummeriert (01, 02, …), Bildschirm-Nummern weichen',
  /function nummerieren\(/.test(P) && /gp-num/.test(P) && /\.gp-body \.gsek-nr\{display:none!important\}/.test(P));
ok('Tabellen im Vorlagen-Stil: Kopf versal/klein auf sanfter Fläche, nur Zeilenlinien',
  /text-transform:uppercase/.test(P) && /background:#f5f7f9!important/.test(P) &&
  /border:none!important;border-bottom:1px solid #edf1f4!important/.test(P));
ok('Fortsetzung: Hinweis + wiederholter Kartenkopf mit Marke',
  /Fortsetzung auf der nächsten Seite/.test(P) && /gp-fortpill/.test(P) && /function fortsetzung\(/.test(P));
ok('Fortsetzung über 3+ Blätter: alte Marke wird vor der neuen entfernt',
  /querySelector\("\.gp-fortpill"\);if\(alt\)alt\.parentNode\.removeChild\(alt\)/.test(P));
ok('Tabellen-Teilung: colgroup + thead je Teil geklont, Rest = ORIGINAL (tfoot genau einmal)',
  /"COLGROUP"\|\|c\.tagName==="THEAD"\|\|c\.tagName==="CAPTION"/.test(P) &&
  /return huelle;/.test(P));
ok('Paginierung idempotent: EINE Fluss-Quelle + Signatur-Vergleich gegen Flackern',
  /GP\.flow==null/.test(P) && /sig===GP\.sig/.test(P));
ok('Paginierung läuft vor jedem Druck + bei Schriften/Bildern nach',
  /addEventListener\("beforeprint",gemaPaginate\)/.test(P) &&
  /document\.fonts\.ready\.then/.test(P) && /\[80,400,1200,2600\]/.test(P));
ok('Mess-Container trägt die Inhalts-Klasse (misst mit exakt den Blatt-Regeln)',
  /className="gp-body gp-mess"/.test(P) && /\.gp-mess\{[^}]*width:182mm!important/.test(P));
ok('Druck: Bühne ohne Transform, Mess-Container unsichtbar, Blatt = Seite',
  /\.gp-stage\{transform:none!important\}/.test(P) &&
  /\.gp-mess\{display:none!important\}/.test(P) &&
  /\.gp-blatt\{margin:0;box-shadow:none;border-radius:0;page-break-after:always\}/.test(P));
ok('Fallback ohne Script: das Roh-Blatt fliesst (vollständiges Dokument)',
  /gp-roh/.test(P) && /\.gp-roh \.gp-body\{position:static/.test(P));

/* ═══ Teil B — im Browser: echtes Modul exportiert im Vorlagen-Layout ═════ */
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
  s['gema_objpool_v1'] = JSON.stringify([{ id: 'obj1', name: 'Hellring 7', strasse: 'Hellring 7', plz: '4056', ort: 'Basel', status: 'aktiv', orgId: 'org_test', erstelltVon: 'u_test' }]);
  await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, s);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  return { ctx, page, errs };
}
async function drucke(page, ctx, vorbereiten) {
  if (vorbereiten) { await page.evaluate(vorbereiten); await page.waitForTimeout(300); }
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.evaluate(() => GemaPrint.open({ title: 'Prüfbericht' }))]);
  await pop.waitForTimeout(1700);
  return pop;
}

console.log('\n■ B: sb_lu_tabelle — Blätter, Kopf/Fuss überall, Kicker, Nummern');
{
  const { ctx, page, errs } = await seite('sb_lu_tabelle.html');
  const pop = await drucke(page, ctx);
  const r = await pop.evaluate(() => {
    const blaetter = [...document.querySelectorAll('.gp-blatt')];
    const nums = [...document.querySelectorAll('.gp-num')].map(e => e.textContent);
    return {
      blaetter: blaetter.length,
      roh: document.querySelectorAll('.gp-roh').length,
      koepfe: blaetter.filter(b => b.querySelector('.gp-kopf .gp-titel')).length,
      eimer: blaetter.filter(b => (b.querySelector('.gp-eimer') || {}).textContent === 'Neubau Hellring 7').length,
      linien: blaetter.filter(b => b.querySelector('.gp-linie')).length,
      fuesse: blaetter.map(b => (b.querySelector('.gp-seite') || {}).textContent || ''),
      mitte: blaetter.filter(b => /gema-connect\.ch/.test((b.querySelector('.gp-fuss-c') || {}).textContent || '')).length,
      kicker: blaetter.map(b => b.querySelectorAll('.gp-kicker').length),
      kickerText: (document.querySelector('.gp-kicker') || {}).textContent || '',
      nums,
      numsAufsteigend: nums.length > 1 && nums.every((v, i) => i === 0 || parseInt(v, 10) >= parseInt(nums[i - 1], 10)),
      schrittNrSichtbar: [...document.querySelectorAll('.gp-body .gsek-nr')].filter(e => getComputedStyle(e).display !== 'none').length,
      ueberlauf: blaetter.map(b => { const bd = b.querySelector('.gp-body'); return bd ? Math.max(0, bd.scrollHeight - bd.clientHeight - 2) : 0; }),
      messLeer: !document.getElementById('gpMess') || !document.getElementById('gpMess').childElementCount,
      /* Blatt 1 muss RICHTIGEN Inhalt tragen — nicht nur den Kicker */
      blatt1: (() => {
        const bd = document.querySelector('.gp-blatt:not(.gp-roh) .gp-body');
        if (!bd) return null;
        const echt = [...bd.children].filter(c => !c.classList.contains('gp-kicker')
          && c.getBoundingClientRect().height > 1);
        const r = bd.getBoundingClientRect();
        let u = r.top; [...bd.children].forEach(c => { const cr = c.getBoundingClientRect(); if (cr.bottom > u) u = cr.bottom; });
        return { inhalte: echt.length, karten: bd.querySelectorAll('.gp-num').length, fuell: Math.round((u - r.top) / r.height * 100) };
      })(),
      /* Kopf-Geometrie je Blatt: Titel mittig, Logo (bzw. seine leere
         Spalte) genau so hoch wie der Textblock daneben */
      kopfGeo: blaetter.map(b => {
        const k = b.querySelector('.gp-kopf'), t = b.querySelector('.gp-kopf-l');
        const l = b.querySelector('.gp-logo, .gp-logo-leer');
        if (!k || !t || !l) return null;
        const kb = k.getBoundingClientRect(), tb = t.getBoundingClientRect(), lb = l.getBoundingClientRect();
        return {
          versatz: Math.round((tb.left + tb.width / 2) - (kb.left + kb.width / 2)),
          dh: Math.round(Math.abs(lb.height - tb.height))
        };
      })
    };
  });
  ok('mindestens ein fertiges Blatt, Roh-Fallback abgebaut', r.blaetter >= 1 && r.roh === 0, r);
  ok('JEDES Blatt trägt die Kopfzeile mit Titel', r.koepfe === r.blaetter, r);
  ok('JEDES Blatt nennt das Projekt (Eimer)', r.eimer === r.blaetter, r);
  ok('JEDES Blatt hat die Trennlinie in der Firmenfarbe', r.linien === r.blaetter, r);
  ok('Seitenzahlen «Seite X / Y» stimmen auf jedem Blatt',
    r.fuesse.every((t, i) => t === 'Seite ' + (i + 1) + ' / ' + r.blaetter), r.fuesse);
  ok('gema-connect.ch mittig in jeder Fusszeile', r.mitte === r.blaetter, r);
  ok('Kicker NUR auf dem ersten Blatt', r.kicker[0] === 1 && r.kicker.slice(1).every(k => k === 0), r.kicker);
  ok('Kicker = Kategorie aus dem Breadcrumb', r.kickerText === 'Sanitärberechnungen', r.kickerText);
  ok('Karten-Nummern zweistellig und aufsteigend (01, 02, …)',
    r.nums.length >= 2 && /^0\d$|^\d\d$/.test(r.nums[0]) && r.nums[0] === '01' && r.numsAufsteigend, r.nums.slice(0, 6));
  ok('Bildschirm-Schrittnummern im Bericht ausgeblendet', r.schrittNrSichtbar === 0, r.schrittNrSichtbar);
  ok('kein Blatt läuft vertikal über', r.ueberlauf.every(u => u === 0), r.ueberlauf);
  /* Feedback 12.08.2026: Blatt 1 zeigte nur den Projekt-Chip, der ganze
     Inhalt begann auf Blatt 2 — Ursache war eine unsichtbare Hülse. */
  ok('Blatt 1 trägt echten Inhalt (nicht nur den Kicker)',
    r.blatt1 && r.blatt1.inhalte >= 1 && r.blatt1.karten >= 1, r.blatt1);
  ok('Projekt + Titel stehen auf JEDEM Blatt mittig',
    r.kopfGeo.every(g => g && Math.abs(g.versatz) <= 1), r.kopfGeo);
  ok('Logo-Spalte auf JEDEM Blatt so hoch wie der Kopf-Text',
    r.kopfGeo.every(g => g && g.dh <= 1), r.kopfGeo);
  ok('Mess-Container nach der Paginierung geleert', r.messLeer);
  ok('keine JS-Fehler auf der Modulseite', errs.length === 0, errs.slice(0, 2));

  /* Idempotenz: ein Nachfass-Lauf ohne Änderung baut nichts um */
  const r2 = await pop.evaluate(() => {
    const vorher = document.querySelectorAll('.gp-blatt').length;
    const html1 = document.querySelector('.gp-stage').innerHTML.length;
    window.gemaPaginate();
    return { vorher, nachher: document.querySelectorAll('.gp-blatt').length, gleich: document.querySelector('.gp-stage').innerHTML.length === html1 };
  });
  ok('Nachfass-Lauf ist ein No-Op (Signatur-Vergleich)', r2.vorher === r2.nachher && r2.gleich, r2);

  /* Druck-Medium: Bühne unskaliert, Messcontainer weg, Leiste weg */
  await pop.emulateMedia({ media: 'print' });
  const r3 = await pop.evaluate(() => ({
    transform: getComputedStyle(document.querySelector('.gp-stage')).transform,
    mess: document.getElementById('gpMess') ? getComputedStyle(document.getElementById('gpMess')).display : 'none',
    bar: getComputedStyle(document.querySelector('.gp-bar')).display
  }));
  ok('im Druck: Bühne ohne Transform', r3.transform === 'none', r3.transform);
  ok('im Druck: Mess-Container unsichtbar', r3.mess === 'none', r3.mess);
  ok('im Druck: Bedienleiste unsichtbar', r3.bar === 'none', r3.bar);
  await pop.close(); await ctx.close();
}

console.log('\n■ C: Fortsetzungs-Mechanik — Karte über mehrere Blätter, nichts geht verloren');
{
  const ZEILEN = 140;
  const { ctx, page } = await seite('sa_enthaertung.html');
  const pop = await drucke(page, ctx, () => {
    /* Deterministisch: eine Karte mit grosser Tabelle (thead + 140 Zeilen +
       tfoot) in die Seite legen — sie MUSS über mehrere Blätter laufen. */
    const wirt = document.querySelector('.g-page');
    const karte = document.createElement('div');
    karte.className = 'g-card';
    let rows = '';
    for (let i = 1; i <= 140; i++) rows += '<tr><td>Z' + i + '</td><td>' + (i * 10) + '</td></tr>';
    karte.innerHTML =
      '<div class="g-card-hd"><h3>Testkarte Fortsetzung</h3></div>' +
      '<div class="g-card-bd"><table>' +
      '<thead><tr><th>KOPFMARKE</th><th>Wert</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td>FUSSMARKE</td><td>Σ</td></tr></tfoot>' +
      '</table></div>';
    wirt.appendChild(karte);
  });
  const r = await pop.evaluate(() => {
    const blaetter = [...document.querySelectorAll('.gp-blatt')];
    const koepfe = [...document.querySelectorAll('.gp-blatt ' + '.g-card-hd')].filter(h => /Testkarte Fortsetzung/.test(h.textContent));
    const zeilen = [...document.querySelectorAll('.gp-blatt tbody td')].map(t => t.textContent).filter(t => /^Z\d+$/.test(t));
    return {
      blaetter: blaetter.length,
      teile: koepfe.length,
      pills: koepfe.filter(h => h.querySelector('.gp-fortpill')).length,
      pillText: (document.querySelector('.gp-fortpill') || {}).textContent || '',
      doppelPille: koepfe.filter(h => h.querySelectorAll('.gp-fortpill').length > 1).length,
      nummern: [...new Set(koepfe.map(h => (h.querySelector('.gp-num') || {}).textContent || ''))],
      hinweise: [...document.querySelectorAll('.gp-weiter')].map(e => e.textContent),
      kopfmarken: [...document.querySelectorAll('.gp-blatt th')].filter(t => t.textContent === 'KOPFMARKE').length,
      fussmarken: [...document.querySelectorAll('.gp-blatt tfoot td')].filter(t => t.textContent === 'FUSSMARKE').length,
      zeilen: zeilen.length,
      luecken: (() => { const s = new Set(zeilen); for (let i = 1; i <= 140; i++) if (!s.has('Z' + i)) return 'Z' + i; return ''; })(),
      ueberlauf: blaetter.map(b => { const bd = b.querySelector('.gp-body'); return bd ? Math.max(0, bd.scrollHeight - bd.clientHeight - 2) : 0; })
    };
  });
  ok('die Karte läuft über mehrere Blätter', r.teile >= 2 && r.blaetter >= 3, { teile: r.teile, blaetter: r.blaetter });
  ok('jeder Folgeteil trägt die «Fortsetzung»-Marke im wiederholten Kopf',
    r.pills === r.teile - 1 && r.pillText === 'Fortsetzung', { pills: r.pills, teile: r.teile });
  ok('nie zwei Marken im selben Kopf (3+-Blätter-Fall)', r.doppelPille === 0, r.doppelPille);
  ok('die Karten-Nummer wiederholt sich auf jedem Teil (gleiche Nummer)',
    r.nummern.length === 1 && /^\d\d$/.test(r.nummern[0]), r.nummern);
  ok('Hinweis «Fortsetzung auf der nächsten Seite» vor jedem Umbruch',
    r.hinweise.length >= r.teile - 1 && r.hinweise.every(t => t === 'Fortsetzung auf der nächsten Seite'),
    { hinweise: r.hinweise.length, teile: r.teile });
  ok('die Tabellen-Kopfzeile wiederholt sich je Teil', r.kopfmarken >= r.teile, { kopfmarken: r.kopfmarken, teile: r.teile });
  ok('die Fusszeile (tfoot) kommt GENAU EINMAL', r.fussmarken === 1, r.fussmarken);
  ok('KEINE Zeile geht verloren (alle ' + ZEILEN + ' im Bericht)', r.zeilen === ZEILEN && !r.luecken,
    { zeilen: r.zeilen, fehlt: r.luecken });
  ok('kein Blatt läuft vertikal über', r.ueberlauf.every(u => u === 0), r.ueberlauf);
  await pop.close(); await ctx.close();
}

await browser.close(); server.close();
console.log('\n' + n + ' Checks, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
