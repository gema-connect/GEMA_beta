// Drift-Guard: «Feedback von Admins ist automatisch für die Umsetzung
// freigegeben» (User-Entscheid 07.08.2026).
//
// Zwei Wege, EINE Regel:
//   (a) gema_feedback.js stempelt beim ABSENDEN `umsetzen:true` auf den
//       Eintrag, wenn der Absender Admin ist (role_admin ODER orgAdmin) —
//       Quelle ist die Sitzung, nie das freie Autor-Textfeld.
//   (b) sys_beta.html leitet dieselbe Regel beim LESEN ab (fbUmsetzen), damit
//       auch die BEREITS vorhandenen Admin-Punkte freigegeben sind, ohne dass
//       irgendwo gespeicherte Daten überschrieben werden.
//
// Die drei Fallen, die dieser Guard festhält:
//   1. Eine bewusste Wahl am Datensatz muss IMMER gewinnen — `umsetzen:false`
//      an einem Admin-Punkt heisst «nicht exportieren», auch wenn die Regel
//      etwas anderes sagen würde.
//   2. Abwählen muss `false` EXPLIZIT speichern (nicht das Feld löschen),
//      sonst käme die Ableitung sofort zurück und der Haken wäre gar nicht
//      abwählbar.
//   3. Ein Punkt OHNE Rollen-Angabe (Altbestand vor 08/2026, ohne Login
//      abgesendet) ist KEIN Admin-Punkt — eine fehlende Angabe wird nie
//      geraten.
//
// Aufruf: CHROME=<chromium> node scripts/feedback_admin_umsetzen_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { startServer, seed, BASE, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info).slice(0, 220) : '')); } };

const fbjs = readFileSync(new URL('../gema_feedback.js', import.meta.url), 'utf8');
const beta = readFileSync(new URL('../sys_beta.html', import.meta.url), 'utf8');

console.log('■ A: Statik');
ok(/function _istAdmin\(k\)/.test(fbjs) && /k\.orgAdmin === true/.test(fbjs) && /'role_admin'/.test(fbjs),
  'gema_feedback: _istAdmin prüft role_admin UND orgAdmin');
ok(/if \(_istAdmin\(kontext\)\) entry\.umsetzen = true;/.test(fbjs),
  'gema_feedback: Admin-Absender bekommt umsetzen:true auf den Eintrag');
{
  // Die Freigabe muss INNERHALB des Rollen-Kontext-Blocks stehen — der ist die
  // einzige Stelle, die aus der SITZUNG liest (nie aus dem Autor-Textfeld).
  const blk = (fbjs.match(/var kontext = _rollenKontext\(\);[\s\S]*?\n    \}/) || [''])[0];
  ok(/_istAdmin\(kontext\)/.test(blk), 'gema_feedback: Freigabe hängt am Sitzungs-Kontext', blk.slice(-120));
}
ok(/const fbIstAdmin = /.test(beta) && /const fbUmsetzen = /.test(beta) && /const fbUmAuto = /.test(beta),
  'sys_beta: Resolver fbIstAdmin/fbUmsetzen/fbUmAuto vorhanden');
{
  const fn = (beta.match(/const fbUmsetzen = \(c\) => \{[\s\S]*?\n\};/) || [''])[0];
  ok(/c\.umsetzen === true\)\s*return true;/.test(fn) && /c\.umsetzen === false\) return false;/.test(fn) &&
     /return fbIstAdmin\(c\);/.test(fn),
    'sys_beta: bewusste Wahl gewinnt, sonst greift die Admin-Regel', fn.slice(0, 200));
}
{
  const fn = (beta.match(/const setCommentUmsetzen = \(modId, idx, on\) => \{[\s\S]*?\n\};/) || [''])[0];
  ok(/else if \(fbIstAdmin\(fb\[idx\]\)\) fb\[idx\]\.umsetzen = false;/.test(fn),
    'sys_beta: Abwählen speichert bei Admin-Punkten false EXPLIZIT', fn.slice(0, 260));
}
ok(/else if \(fbIstAdmin\(fb\[idx\]\)\) fb\[idx\]\.umsetzen = false;[\s\S]{0,80}n\+\+;/.test(beta),
  'sys_beta: Bulk-Abwählen folgt derselben Regel');
// Alle Konsumenten laufen über den Resolver — kein direkter Feldvergleich mehr.
{
  const rest = beta.replace(/const fbUmsetzen = \(c\) => \{[\s\S]*?\n\};/, '');
  ok(!/umsetzen === true|umsetzen !== true/.test(rest),
    'sys_beta: kein direkter umsetzen-Vergleich ausserhalb des Resolvers',
    (rest.match(/.{0,60}umsetzen [=!]== true.{0,40}/) || [''])[0]);
}
ok(/if\(nur && !fbUmsetzen\(item\)\) return;/.test(beta), 'sys_beta: Export-Sammler nutzt den Resolver');
ok(/return !fbUmsetzen\(e\.item\);/.test(beta), 'sys_beta: _exOhneHaken nutzt den Resolver');
ok(/const umCount = \(id\) => getFeedback\(id\)\.filter\(c => fbUmsetzen\(c\)\)/.test(beta),
  'sys_beta: Zähler der Kopfzeile nutzt den Resolver');
ok(/\.um-auto\{/.test(beta) && /um-auto">Admin</.test(beta),
  'sys_beta: automatisch gesetzter Haken trägt die «Admin»-Marke');
ok(/bei Admin-Feedback automatisch/.test(beta) && /bei Feedback von Admins ist der Haken automatisch gesetzt/.test(beta),
  'sys_beta: die Regel steht in Panel-Hinweis, Export-Modal und Markdown-Kopf');

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

// Feedback-Punkte, wie sie gema_feedback.js schreibt.
const P = {
  gemaAdmin: { type: 'fehler', author: 'A', text: 'Von einem GEMA-Admin', ts: '07.08.26 09:00',
               source: 'Mischkreuz', moduleId: 'mischkreuz', rollen: [{ id: 'role_admin', name: 'Admin' }] },
  orgAdmin:  { type: 'aenderung', author: 'B', text: 'Von einem Firmen-Admin', ts: '07.08.26 09:05',
               source: 'Mischkreuz', moduleId: 'mischkreuz', rollen: [{ id: 'role_planer', name: 'Sanitärplaner' }], orgAdmin: true },
  planer:    { type: 'kommentar', author: 'C', text: 'Von einem Planer ohne Admin', ts: '07.08.26 09:10',
               source: 'Mischkreuz', moduleId: 'mischkreuz', rollen: [{ id: 'role_planer', name: 'Sanitärplaner' }] },
  altbestand:{ type: 'kommentar', author: 'D', text: 'Altbestand ohne Rollen-Angabe', ts: '01.08.26 09:00',
               source: 'Mischkreuz', moduleId: 'mischkreuz' },
  adminAus:  { type: 'fehler', author: 'E', text: 'Admin, aber bewusst abgewählt', ts: '07.08.26 09:15',
               source: 'Mischkreuz', moduleId: 'mischkreuz', rollen: [{ id: 'role_admin', name: 'Admin' }], umsetzen: false },
  planerAn:  { type: 'fehler', author: 'F', text: 'Planer, aber von Hand angehakt', ts: '07.08.26 09:20',
               source: 'Mischkreuz', moduleId: 'mischkreuz', rollen: [{ id: 'role_planer', name: 'Sanitärplaner' }], umsetzen: true }
};
const ALLE = ['gemaAdmin', 'orgAdmin', 'planer', 'altbestand', 'adminAus', 'planerAn'].map(k => P[k]);

console.log('■ B: Browser — Board (sys_beta)');
{
  const { ctx, page } = await newPage(browser, seed(['role_admin']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof fbUmsetzen === 'function');
  await page.waitForTimeout(900);
  ok(errors.length === 0, 'Boot ohne pageerrors', errors.join(' | ').slice(0, 200));

  // getFeedback liest den GemaDB-Cache (`_GemaDB.c['feedback_<id>']`) — genau
  // dorthin legen wir die Punkte, statt einen zweiten Lesepfad zu erfinden.
  await page.evaluate(alle => {
    _GemaDB.c['feedback_mischkreuz'] = JSON.stringify(alle);
    try { renderAll(); } catch (e) {}
  }, ALLE);
  await page.waitForTimeout(400);

  const r = await page.evaluate(pk => ({
    gemaAdmin:  fbUmsetzen(pk.gemaAdmin),
    orgAdmin:   fbUmsetzen(pk.orgAdmin),
    planer:     fbUmsetzen(pk.planer),
    altbestand: fbUmsetzen(pk.altbestand),
    adminAus:   fbUmsetzen(pk.adminAus),
    planerAn:   fbUmsetzen(pk.planerAn),
    autoAdmin:  fbUmAuto(pk.gemaAdmin),
    autoPlaner: fbUmAuto(pk.planer),
    autoAdminAus: fbUmAuto(pk.adminAus),
    autoPlanerAn: fbUmAuto(pk.planerAn)
  }), P);
  ok(r.gemaAdmin === true,  'GEMA-Admin (role_admin) ist automatisch freigegeben');
  ok(r.orgAdmin === true,   'Firmen-Admin (orgAdmin) ist automatisch freigegeben');
  ok(r.planer === false,    'Planer ohne Admin bleibt gesperrt');
  ok(r.altbestand === false, 'Altbestand ohne Rollen-Angabe zählt NICHT als Admin');
  ok(r.adminAus === false,  'bewusst abgewählter Admin-Punkt bleibt gesperrt (Wahl gewinnt)');
  ok(r.planerAn === true,   'von Hand angehakter Planer-Punkt bleibt freigegeben');
  ok(r.autoAdmin === true && r.autoPlaner === false && r.autoAdminAus === false && r.autoPlanerAn === false,
    'fbUmAuto markiert NUR die abgeleitete Freigabe', r);

  // Panel öffnen und die gerenderten Karten prüfen.
  await page.evaluate(() => { try { toggleFbPanel('mischkreuz'); } catch (e) { renderComments('mischkreuz'); } });
  await page.waitForTimeout(400);
  const ui = await page.evaluate(() => {
    const host = document.getElementById('cl-mischkreuz');
    const karten = [...(host ? host.querySelectorAll('.fb-card') : [])];
    return {
      n: karten.length,
      an: karten.filter(k => k.classList.contains('fb-um')).length,
      checked: karten.filter(k => { const i = k.querySelector('.um-lbl input'); return i && i.checked; }).length,
      marken: karten.filter(k => k.querySelector('.um-auto')).length,
      kopf: (document.getElementById('umc-mischkreuz') || {}).textContent || ''
    };
  });
  ok(ui.n === 6, 'alle sechs Punkte gerendert', ui.n);
  ok(ui.an === 3 && ui.checked === 3, 'genau die drei freigegebenen Punkte sind angehakt', ui);
  ok(ui.marken === 2, 'die «Admin»-Marke steht nur an den zwei ABGELEITETEN Punkten', ui.marken);
  ok(/3 für Umsetzung markiert/.test(ui.kopf), 'Kopfzeile zählt die freigegebenen Punkte', ui.kopf);

  // FALLE 2: Abwählen eines Admin-Punkts muss wirken UND einen Reload überleben.
  const abw = await page.evaluate(() => {
    setCommentUmsetzen('mischkreuz', 0, false);
    const fb = getFeedback('mischkreuz');
    return { feld: fb[0].umsetzen, frei: fbUmsetzen(fb[0]),
             card: !!document.querySelector('#cl-mischkreuz .fb-card[data-fbcard="mischkreuz|fb|0"].fb-um'),
             marke: !!document.querySelector('#cl-mischkreuz .fb-card[data-fbcard="mischkreuz|fb|0"] .um-auto') };
  });
  ok(abw.feld === false, 'Abwählen speichert false EXPLIZIT (statt das Feld zu löschen)', abw.feld);
  ok(abw.frei === false && abw.card === false, 'der abgewählte Admin-Punkt ist danach wirklich draussen', abw);
  ok(abw.marke === false, 'nach der bewussten Wahl fällt die «Admin»-Marke weg', abw.marke);

  // Wieder anhaken → true am Datensatz.
  const wieder = await page.evaluate(() => {
    setCommentUmsetzen('mischkreuz', 0, true);
    const fb = getFeedback('mischkreuz');
    return { feld: fb[0].umsetzen, frei: fbUmsetzen(fb[0]) };
  });
  ok(wieder.feld === true && wieder.frei === true, 'wieder anhaken setzt true am Datensatz', wieder);

  // Export-Sammler: dieselbe Auswahl, ohne Doppel-Logik.
  const ex = await page.evaluate(() => {
    const frei = _exCollectAll().filter(e => e.modId === 'mischkreuz').map(e => e.item.author).sort();
    const ohne = _exCollectAll(false).filter(e => e.modId === 'mischkreuz' && !fbUmsetzen(e.item)).map(e => e.item.author).sort();
    return { frei: frei, ohne: ohne };
  });
  ok(JSON.stringify(ex.frei) === JSON.stringify(['A', 'B', 'F']),
    'Export nimmt beide Admin-Punkte + den von Hand angehakten', ex.frei);
  ok(JSON.stringify(ex.ohne) === JSON.stringify(['C', 'D', 'E']),
    'draussen bleiben Planer, Altbestand und der abgewählte Admin-Punkt', ex.ohne);

  ok(errors.length === 0, 'Board: keine pageerrors', errors.join(' | ').slice(0, 200));
  await ctx.close();
}

console.log('■ C: Browser — Absenden (gema_feedback.js)');
// Die Sitzung entscheidet, nicht das Autor-Feld: derselbe getippte Name,
// einmal als Admin und einmal als Planer abgesendet. Geprueft wird, was
// WIRKLICH in die Cloud geht (POST-Body) — submit() schreibt ueber
// _GemaDB.saveToModule direkt dorthin, der localStorage-Weg ist nur Fallback.
for (const [rolle, roleIds, orgAdmins, sollFrei] of [
  ['GEMA-Admin',   ['role_admin'],  [],         true],
  ['Firmen-Admin', ['role_planer'], ['u_test'], true],
  ['Planer',       ['role_planer'], [],         false]
]) {
  const { ctx, page } = await newPage(browser, seed(roleIds, { orgAdmins: orgAdmins }));
  const posts = [];
  // Zuletzt registrierte Route gewinnt — faengt die Schreibvorgaenge ab.
  await ctx.route('**/rest/v1/**', route => {
    const req = route.request();
    if (req.method() === 'POST') {
      try { posts.push(JSON.parse(req.postData() || '{}')); } catch (e) {}
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sb_mischkreuz.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window._gfbHooks && typeof GemaFeedback !== 'undefined');
  await page.waitForTimeout(400);

  const istAdmin = await page.evaluate(() => window._gfbHooks.istAdmin(window._gfbHooks.rollenKontext()));
  ok(istAdmin === sollFrei, rolle + ': als Admin erkannt = ' + sollFrei, istAdmin);

  await page.evaluate(async () => {
    GemaFeedback.start();
    await new Promise(r => setTimeout(r, 250));
    const t = document.getElementById('gfb-text');
    if (t) t.value = 'Testmeldung';
    const a = document.getElementById('gfb-author'); if (a) a.value = 'Immer derselbe Name';
    await GemaFeedback.submit();
    await new Promise(r => setTimeout(r, 400));
  });
  await page.waitForTimeout(300);

  const geschrieben = posts.filter(p => p && p.data_key === 'feedback_mischkreuz');
  const eintrag = geschrieben.length
    ? (geschrieben[geschrieben.length - 1].payload || {}).v : null;
  const e0 = Array.isArray(eintrag) ? eintrag[0] : null;
  ok(!!e0, rolle + ': Meldung gespeichert', { posts: posts.length, treffer: geschrieben.length });
  ok(e0 && e0.umsetzen === (sollFrei ? true : undefined),
    rolle + ': ' + (sollFrei ? 'umsetzen:true gestempelt' : 'KEIN umsetzen-Feld'), e0 && e0.umsetzen);
  ok(e0 && e0.author === 'Immer derselbe Name',
    rolle + ': das Autor-Feld aendert an der Regel nichts', e0 && e0.author);
  ok(errors.length === 0, rolle + ': keine pageerrors', errors.join(' | ').slice(0, 160));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
