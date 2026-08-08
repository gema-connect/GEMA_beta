// GEMA-Feedback 07.08.2026 — 3 Punkte aus 2 Modulen
//
// pm_pruefliste (Tim Löhrer, Org-Admin):
//  (1) «Zwischen Daten und Prüfer ‹Uhrzeit› mit Textfeld und fix ‹Uhr›
//      dahinter ergänzen. Beispiel: Uhrzeit 11.00 Uhr»
//      → Textfeld (KEIN type="time" — gewünscht ist die Schweizer
//        Punkt-Schreibweise) + angeschlossene Einheiten-Box, additiv
//        gespeichert, im Bericht ausgewiesen.
//  (2) «Rechteck Seite 1 = Titelseite, ab Abwasser Seite 2 und folgende»
//      → Deckblatt in .titelseite geklammert, Seitenumbruch dahinter (Druck).
//
// sys_workspace (Mathias Schläfli, eigene Rolle ohne Admin-Rechte):
//  (3) «Button ausblenden wenn kein Zugriff»
//      → Die beiden Admin-Knöpfe 🏢/👥 trugen Inline-`display:none`. Die
//        zentrale Metrik-Regel in gema_responsive.css setzt
//        `.g-nav .g-nav-btn{display:inline-flex!important}` und SCHLÄGT das
//        Inline-Style — beide Knöpfe waren damit für JEDE Rolle sichtbar und
//        führten in eine Sackgasse. Kanon dafür ist die Klasse .gnav-weg.
//        Dazu folgt jeder Knopf jetzt dem Guard SEINER Zielseite, und
//        sys_admin steht in _KONTO_SEITEN, damit der Org-Admin die
//        Benutzerverwaltung seiner eigenen Firma überhaupt erreicht (die
//        Seite guardet sich selbst hart).
//
// Aufruf:  CHROME=<chromium> node scripts/feedback_20260807_test.mjs
import { readFileSync } from 'fs';
import { chromium } from 'playwright-core';
import { startServer, newPage, seed, BASE, ROOT } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, l, info) => {
  if (c) { pass++; console.log('  ✓', l); }
  else { fail++; console.log('  ✗', l + (info ? '  → ' + info : '')); }
};

const PR   = readFileSync(ROOT + '/pm_pruefliste.html', 'utf8');
const WS   = readFileSync(ROOT + '/sys_workspace.html', 'utf8');
const AUTH = readFileSync(ROOT + '/gema_auth.js', 'utf8');
const RESP = readFileSync(ROOT + '/gema_responsive.css', 'utf8');

// ══ A) Statisch ═══════════════════════════════════════════════════════
console.log('\n═ A) Statisch ═');

console.log('— A1) Prüfliste: Uhrzeit —');
ok(/id="eUhrzeit"/.test(PR), 'Uhrzeit-Feld im Editor');
ok(/id="eUhrzeit"[^>]*type="text"|type="text"[^>]*id="eUhrzeit"/.test(PR),
   'Uhrzeit ist ein TEXTFELD (kein natives type="time")');
ok(!/id="eUhrzeit"[^>]*type="time"/.test(PR), 'kein type="time" am Uhrzeit-Feld');
ok(/class="uhr-u">Uhr</.test(PR), 'fixe Einheiten-Box «Uhr» hinter dem Feld');
ok(/\.uhr-grp\{display:flex/.test(PR), 'Feld + Box sind eine angeschlossene Gruppe');
ok(/\.uhr-grp input\{flex:1 1 auto;min-width:0/.test(PR),
   'Eingabefeld schrumpft in der Flex-Zeile (sonst drückt width:100% die Box raus)');
ok(/\.fld-row\.r3\{grid-template-columns:1fr 150px 1fr\}/.test(PR),
   'dreispaltige Zeile Datum · Uhrzeit · Prüfer');
ok(/@media\(max-width:480px\)\{\.fld-row,\.fld-row\.r3\{grid-template-columns:1fr\}\}/.test(PR),
   'auf dem Phone einspaltig');
ok(/function prUhrzeitNorm/.test(PR) && /window\.prUhrzeit=function/.test(PR),
   'Normalisierung + Handler vorhanden');
ok(/_cur\.uhrzeit=v/.test(PR), 'Wert landet in b.uhrzeit');
// Die Reihenfolge im Markup ist der Kern des Feedbacks («ZWISCHEN Datum und Prüfer»)
const iDat = PR.indexOf('id="eDatum"'), iUhr = PR.indexOf('id="eUhrzeit"'), iPrf = PR.indexOf('id="ePruefer"');
ok(iDat > 0 && iUhr > iDat && iPrf > iUhr, 'Reihenfolge Datum → Uhrzeit → Prüfer');
ok(/b\.uhrzeit\?'<tr><td class="l">Uhrzeit<\/td><td>'\+E\(b\.uhrzeit\)\+' Uhr<\/td><\/tr>':''/.test(PR),
   'Bericht zeigt die Uhrzeit NUR wenn erfasst (Altbestand unverändert)');

console.log('— A2) Prüfliste: Titelseite —');
ok(/h\+='<div class="titelseite">'/.test(PR), 'Deckblatt ist geklammert');
ok(/\.titelseite\{break-after:page;page-break-after:always\}/.test(PR),
   'Seitenumbruch mit beiden Schreibweisen (moderne + Fallback)');
ok(/@media print\{\.no-print\{display:none!important\}[\s\S]{0,120}?\.titelseite\{break-after:page/.test(PR),
   'der Umbruch gilt NUR im Druck');

console.log('— A3) Workspace: Nav-Knöpfe —');
ok(!/id="wsNavOrgAdmin"[^>]*style="display:none"/.test(WS) && !/id="wsNavUsers"[^>]*style="display:none"/.test(WS),
   'kein Inline-display:none mehr an den Nav-Knöpfen (wirkungslos)');
ok(/class="g-nav-btn no-print gnav-weg"[^>]*id="wsNavOrgAdmin"/.test(WS),
   '🏢 startet versteckt über .gnav-weg');
ok(/class="g-nav-btn no-print gnav-weg"[^>]*id="wsNavUsers"/.test(WS),
   '👥 startet versteckt über .gnav-weg');
ok(/nb\.classList\.toggle\('gnav-weg',!\(isAdmin\|\|isOrgA\)\)/.test(WS),
   '👥 folgt dem Guard von sys_admin (GEMA-Admin ODER Org-Admin)');
ok(/ob\.classList\.toggle\('gnav-weg',!isOrgA\)/.test(WS),
   '🏢 folgt dem Guard von sys_unternehmen (Org-Admin)');
ok(!/wsNavUsers'\);if\(nb\)nb\.style\.display=''/.test(WS), 'altes gemeinsames Freischalten ist weg');
ok(/\.g-nav \.g-nav-btn\.gnav-weg \{ display: none !important; \}/.test(RESP),
   'die .gnav-weg-Regel existiert zentral');
ok(/\.g-nav \.g-nav-btn,[\s\S]{0,80}display: inline-flex !important;/.test(RESP),
   'die Metrik-Regel mit !important existiert — genau sie schlug das Inline-Style');

console.log('— A4) gema_auth: sys_admin erreichbar für Org-Admins —');
ok(/_KONTO_SEITEN=\['sys_profil','sys_preise','sys_beta','sys_unternehmen','sys_admin'\]/.test(AUTH),
   'sys_admin steht in _KONTO_SEITEN');
ok(/entgegen der früheren\s+Notiz hier sehr wohl einen harten In-Page-Guard/.test(AUTH),
   'die Begründung (falsche Prämisse korrigiert) ist im Code dokumentiert');
const SA = readFileSync(ROOT + '/sys_admin.html', 'utf8');
ok(/if\(!user \|\| \(!isSup && !isOrgA\)\)\{/.test(SA) && /Kein Zugriff/.test(SA),
   'sys_admin.html hat den harten In-Page-Guard wirklich (Prämisse belegt)');

// ══ B) Prüfliste im Browser ═══════════════════════════════════════════
console.log('\n═ B) Prüfliste im Browser ═');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

const sPr = seed(['role_admin']);
sPr.gema_coachmarks_done_pruefliste = '1';
const { ctx: cPr, page: pPr } = await newPage(browser, sPr);
const errPr = []; pPr.on('pageerror', e => errPr.push(e.message));
await pPr.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
await pPr.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
await pPr.waitForTimeout(900);
ok(errPr.length === 0, 'pm_pruefliste bootet ohne Fehler', errPr[0]);

await pPr.evaluate(() => { window.prNeu(); window.prAddAnlage('gas'); });
await pPr.waitForTimeout(400);

console.log('— B1) Uhrzeit-Feld —');
const feld = await pPr.evaluate(() => {
  const i = document.getElementById('eUhrzeit');
  if (!i) return null;
  const grp = i.parentElement;
  const box = grp.querySelector('.uhr-u');
  const r = i.getBoundingClientRect(), rb = box.getBoundingClientRect();
  const d = document.getElementById('eDatum').getBoundingClientRect();
  const p = document.getElementById('ePruefer').getBoundingClientRect();
  return {
    typ: i.type, boxText: box.textContent.trim(),
    // buendig: gleiche Ober-/Unterkante, direkt angeschlossen
    bAlign: Math.abs(r.top - rb.top) < 1.5 && Math.abs(r.bottom - rb.bottom) < 1.5,
    bAn: Math.abs(rb.left - r.right) < 2,
    // zwischen Datum und Pruefer (gleiche Zeile → x-Position entscheidet)
    zwischen: d.left < r.left && r.left < p.left && Math.abs(d.top - r.top) < 4,
    imBild: rb.right <= grp.getBoundingClientRect().right + 1
  };
});
ok(!!feld, 'Uhrzeit-Feld ist gerendert');
ok(feld && feld.typ === 'text', 'es ist ein Textfeld (' + (feld && feld.typ) + ')');
ok(feld && feld.boxText === 'Uhr', 'die Box zeigt fix «Uhr»');
ok(feld && feld.bAlign, 'Feld und Box schliessen oben/unten bündig ab');
ok(feld && feld.bAn, 'die Box ist direkt ans Feld angeschlossen');
ok(feld && feld.imBild, 'die Box läuft nicht aus der Gruppe (Flex-Falle)');
ok(feld && feld.zwischen, 'das Feld steht zwischen Datum und Prüfer');

console.log('— B2) Normalisierung (sichtbar, nie raten) —');
const norm = await pPr.evaluate(() => {
  const i = document.getElementById('eUhrzeit');
  const setz = v => { i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); return { feld: i.value, gespeichert: window._prHooks.aktuelle().uhrzeit }; };
  return {
    doppelpunkt: setz('11:00'),
    mitUhr:      setz('11.00 Uhr'),
    leerzeichen: setz('  9.30  '),
    frei:        setz('vormittags'),
    spanne:      setz('11.00–12.30'),
    leer:        setz('')
  };
});
ok(norm.doppelpunkt.feld === '11.00' && norm.doppelpunkt.gespeichert === '11.00',
   '«11:00» wird sichtbar zu «11.00» (Schweizer Schreibweise)');
ok(norm.mitUhr.feld === '11.00', 'ein angehängtes «Uhr» fällt weg (steht fix in der Box)');
ok(norm.leerzeichen.feld === '9.30', 'Leerzeichen werden getrimmt');
ok(norm.frei.feld === 'vormittags' && norm.frei.gespeichert === 'vormittags',
   'freier Text bleibt UNANGETASTET — nichts wird geraten');
ok(norm.spanne.feld === '11.00–12.30', 'eine Zeitspanne bleibt erhalten (kein stilles Kappen)');
ok(norm.leer.feld === '' && norm.leer.gespeichert === '', 'leeren geht');

console.log('— B3) Bericht: Uhrzeit + Titelseite —');
const berichtHtml = async () => pPr.evaluate(() => {
  let out = '';
  const _o = window.open;
  window.open = () => ({ document: { write: s => { out += s; }, close() {}, title: '' }, focus() {}, print() {} });
  try { window.prBericht(); } catch (e) { out += '<!--ERR ' + e.message + '-->'; }
  window.open = _o;
  return out;
});

await pPr.evaluate(() => {
  const i = document.getElementById('eUhrzeit');
  i.value = '11.00'; i.dispatchEvent(new Event('change', { bubbles: true }));
});
const hMit = await berichtHtml();
ok(/<td class="l">Uhrzeit<\/td><td>11\.00 Uhr<\/td>/.test(hMit), 'Bericht weist «11.00 Uhr» aus');
const iBerDat = hMit.indexOf('>Datum<'), iBerUhr = hMit.indexOf('>Uhrzeit<'), iBerPrf = hMit.indexOf('>Prüfer / Fachperson<');
ok(iBerDat > 0 && iBerUhr > iBerDat && iBerPrf > iBerUhr, 'im Bericht ebenfalls zwischen Datum und Prüfer');

// Altbestand: Begehung OHNE das Feld druckt exakt wie bisher
await pPr.evaluate(() => { delete window._prHooks.aktuelle().uhrzeit; });
const hOhne = await berichtHtml();
ok(hOhne.indexOf('>Uhrzeit<') < 0, 'ohne erfasste Uhrzeit erscheint KEINE Uhrzeit-Zeile (Altbestand)');

// Titelseite: Aufbau
const rep = await cPr.newPage();
await rep.setContent(hOhne, { waitUntil: 'load' });
await rep.waitForTimeout(400);
const bau = await rep.evaluate(() => {
  const t = document.querySelector('.titelseite');
  if (!t) return null;
  const tab = document.querySelector('table.pk');
  return {
    hatMeta: !!t.querySelector('table.meta'),
    hatSum: !!t.querySelector('.sum'),
    hatH1: !!t.querySelector('h1'),
    // die Anlagen-Tabellen dürfen NICHT im Deckblatt stecken
    anlDrin: !!t.querySelector('table.pk'),
    anlDanach: !!tab && !!(t.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_FOLLOWING)
  };
});
ok(!!bau, '.titelseite ist im Bericht vorhanden');
ok(bau && bau.hatH1 && bau.hatMeta && bau.hatSum, 'Deckblatt enthält Titel, Metadaten und KPI-Zeile');
ok(bau && !bau.anlDrin, 'die Anlagen-Tabellen stecken NICHT im Deckblatt');
ok(bau && bau.anlDanach, 'die Anlagen folgen nach dem Deckblatt');

// Titelseite: die Pagination wirklich messen — inkl. Gegenprobe.
// Der Testbericht ist bewusst klein: OHNE Umbruch passt alles auf EINE Seite.
await rep.emulateMedia({ media: 'print' });
const seitenM = (await rep.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' } }))
  .toString('latin1').match(/\/Type\s*\/Page[^s]/g);
const nMit = (seitenM || []).length;
ok(nMit >= 2, 'mit Umbruch: Deckblatt und Inhalt liegen auf verschiedenen Seiten (' + nMit + ')');

const rep2 = await cPr.newPage();
await rep2.setContent(hOhne, { waitUntil: 'load' });
await rep2.addStyleTag({ content: '@media print{.titelseite{break-after:auto!important;page-break-after:auto!important}}' });
await rep2.waitForTimeout(300);
await rep2.emulateMedia({ media: 'print' });
const nOhne = ((await rep2.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' } }))
  .toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
ok(nOhne === 1, 'Gegenprobe: ohne die Regel passt derselbe Bericht auf eine Seite (' + nOhne + ')');
ok(nMit > nOhne, 'der Umbruch ist nachweislich die Ursache (' + nOhne + ' → ' + nMit + ')');
await rep.close(); await rep2.close(); await cPr.close();

// ══ C) Workspace im Browser ═══════════════════════════════════════════
console.log('\n═ C) Workspace: Knopf nur mit Zugriff ═');

const ROLLE_MS = { id: 'r_1786096388369', name: 'Dev 3 MS', color: '#0ea5e9',
  permissions: { workspace: { read: true, write: true, admin: false }, objekte: { read: true, write: false, admin: false } } };

async function navZustand(seedObj) {
  seedObj.gema_coachmarks_done_sys_workspace_v2 = '1';
  const { ctx, page } = await newPage(browser, seedObj);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/sys_workspace.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const z = await page.evaluate(() => {
    const s = id => {
      const el = document.getElementById(id);
      if (!el) return { da: false };
      const cs = getComputedStyle(el);
      return { da: true, weg: el.classList.contains('gnav-weg'), display: cs.display, sichtbar: !!el.offsetParent && cs.display !== 'none' };
    };
    return { users: s('wsNavUsers'), org: s('wsNavOrgAdmin') };
  });
  return { ctx, page, z, errs };
}

// C1 — eigene Rolle ohne Admin-Rechte (der gemeldete Fall)
console.log('— C1) Eigene Rolle ohne Admin-Rechte (Mathias) —');
const r1 = await navZustand(seed(['r_1786096388369'], { roles: [ROLLE_MS], orgAdmins: [] }));
ok(r1.errs.length === 0, 'Workspace bootet ohne Fehler', r1.errs[0]);
ok(r1.z.users.da && r1.z.org.da, 'beide Knöpfe sind im Markup vorhanden');
ok(r1.z.users.display === 'none', '👥 Benutzerverwaltung ist AUSGEBLENDET (gemeldeter Bug)');
ok(r1.z.org.display === 'none', '🏢 Firmendaten ist AUSGEBLENDET (gemeldeter Bug)');
ok(!r1.z.users.sichtbar && !r1.z.org.sichtbar, 'keiner der beiden Knöpfe ist sichtbar');

// Gegenprobe: die alte Lösung (Inline-display:none) wäre wirkungslos —
// genau das war die Ursache. Wird hier gemessen, nicht behauptet.
const falle = await r1.page.evaluate(() => {
  const el = document.getElementById('wsNavUsers');
  el.classList.remove('gnav-weg');
  el.style.display = 'none';                    // die frühere Schreibweise
  const d = getComputedStyle(el).display;
  el.style.display = ''; el.classList.add('gnav-weg');
  return d;
});
ok(falle !== 'none', 'Gegenprobe: Inline-display:none wird von der Metrik-Regel geschlagen (' + falle + ') — .gnav-weg ist zwingend');
await r1.ctx.close();

// C2 — Org-Admin (keine role_admin)
console.log('— C2) Org-Admin der eigenen Firma (Tim) —');
const r2 = await navZustand(seed(['r_1786096388369'], { roles: [ROLLE_MS], orgAdmins: ['u_test'] }));
ok(r2.z.users.display !== 'none', '👥 sichtbar — sys_admin lässt Org-Admins herein');
ok(r2.z.org.display !== 'none', '🏢 sichtbar — Firmendaten sind Org-Admin-Sache');
// … und der Knopf führt nicht mehr ins Leere
const p2 = r2.page;
await p2.goto(BASE + '/sys_admin.html', { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(900);
// Gemessen wird die GERENDERTE Überschrift des Guards — NICHT
// body.textContent: darin steckt auch der Inhalt der <script>-Elemente, und
// der Guard-String lebt genau dort (die Prüfung schlüge immer an).
const admZust = await p2.evaluate(() => ({
  pfad: location.pathname,
  keinZugriff: Array.from(document.querySelectorAll('h2')).some(h => h.textContent.indexOf('Kein Zugriff') >= 0)
}));
ok(admZust.pfad.indexOf('sys_admin') >= 0, 'Org-Admin wird NICHT mehr weggeleitet (' + admZust.pfad + ')');
ok(!admZust.keinZugriff, 'Org-Admin sieht die Benutzerverwaltung statt eines Kein-Zugriff-Screens');
await r2.ctx.close();

// C3 — GEMA-Admin
console.log('— C3) GEMA-Admin —');
const r3 = await navZustand(seed(['role_admin'], { orgAdmins: [] }));
ok(r3.z.users.display !== 'none', '👥 sichtbar');
ok(r3.z.org.display !== 'none', '🏢 sichtbar (isOrgAdmin gilt für den GEMA-Admin)');
await r3.ctx.close();

// C4 — der Schutz bleibt: wer nicht darf, kommt auch per URL nicht rein
console.log('— C4) Der Schutz verschiebt sich, er verschwindet nicht —');
const s4 = seed(['r_1786096388369'], { roles: [ROLLE_MS], orgAdmins: [] });
const { ctx: c4, page: p4 } = await newPage(browser, s4);
await p4.goto(BASE + '/sys_admin.html', { waitUntil: 'domcontentloaded' });
await p4.waitForTimeout(900);
const z4 = await p4.evaluate(() => ({
  keinZugriff: Array.from(document.querySelectorAll('h2')).some(h => h.textContent.indexOf('Kein Zugriff') >= 0),
  keineListe: !document.querySelector('#userList .u-row, #userList .user-row')
}));
ok(z4.keinZugriff, 'ohne Rechte zeigt sys_admin den Kein-Zugriff-Screen (In-Page-Guard)');
ok(z4.keineListe, 'keine Benutzerliste sichtbar');
await c4.close();

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' ok, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
