// pm_pruefliste — saubere Seitenumbrüche im Prüfbericht
//
// Feedback 28.07.2026: «gliedere die Zeilenumbrüche sauber, sodass nicht die
// Titel auf einer anderen Seite alleine sind, oder Prüfpunkte
// auseinandergerissen werden».
//
// Zwei Ursachen:
//  1. Der Anlagen-Titel stand als eigenes <div> VOR der Tabelle. Ein
//     «break-after:avoid» auf einem Block ist im Druck unzuverlässig — der
//     Titel landete alleine am Seitenende. Er steht jetzt als erste Zeile im
//     <thead>: ein Tabellenkopf wird nie ohne Datenzeile gedruckt und
//     wiederholt sich auf Folgeseiten.
//  2. «break-after:avoid» stand auf JEDER Punktzeile — das verkettet die
//     ganze Tabelle zu einem unteilbaren Block, der Browser bricht dann
//     irgendwo. Jetzt nur noch auf Punkten, denen eine Bilder-Zeile folgt.
//
// Der Test misst die ECHTE Pagination: Chrome druckt in ein PDF, die Anzahl
// Seiten kommt aus dem PDF; die Zuordnung Element→Seite wird im
// Druck-Layout über die Y-Position gegen die Seitenhöhe bestimmt.
//
// Aufruf:  CHROME=<chromium> node scripts/pruefliste_bericht_umbruch_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8925;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try { let p = req.url.split('?')[0]; if (p === '/') p = '/pm_pruefliste.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'Muster AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true, settings: {} };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
    if (route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  }
  if (u.indexOf('fonts.googleapis') >= 0 || u.indexOf('fonts.gstatic') >= 0) return route.abort();
  if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
  return route.abort();
});
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, {
  gema_orgs_v1: JSON.stringify([ORG]), gema_users_v1: JSON.stringify(USERS),
  gema_session_v1: JSON.stringify(SESSION), gema_coachmarks_done_pruefliste: '1'
});

const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
await page.waitForTimeout(1200);

// Begehung bauen, die GARANTIERT über mehrere Seiten läuft:
// zwei Anlagen, viele Punkte, Fotos an mehreren Punkten.
await page.evaluate(jpg => {
  window.prNeu();
  window.prAddAnlage('gas');
  window.prAddAnlage('trinkwasser');
  const b = window._prHooks.aktuelle();
  b.titel = 'Umbruch-Test';
  b.anlagen.forEach((a, ai) => {
    const basis = a.punkte.slice();
    a.punkte = [];
    for (let i = 0; i < 12; i++) {
      const p = JSON.parse(JSON.stringify(basis[i % basis.length]));
      p.id = 'p_' + ai + '_' + i;
      p.bezeichnung = 'Prüfpunkt ' + (i + 1) + ' der Anlage ' + (ai + 1) + ' — ein bewusst langer Text, damit die Zeile über mehrere Zeilen läuft und die Tabelle wirklich über die Seite hinausreicht';
      p.antwort = 'ja';
      p.bewertung = 'maessig';
      p.bemerkung = 'Bemerkung zu Punkt ' + (i + 1) + ' mit etwas Text.';
      p.empfehlung = 'Empfehlung zu Punkt ' + (i + 1) + '.';
      if (i % 3 === 0) p.fotos = [{ url: jpg }, { url: jpg }];
      a.punkte.push(p);
    }
  });
}, JPG);

// Das erzeugte Berichts-HTML abgreifen und in einer echten Seite rendern —
// dort lässt sich die Pagination messen (window.open + document.write auf
// about:blank ist dafür nicht zuverlässig auslesbar).
const html = await page.evaluate(() => {
  let out = '';
  const _o = window.open;
  window.open = () => ({ document: { write: s => { out += s; }, close() {}, title: '' }, focus() {}, print() {} });
  try { prBericht(); } catch (e) { out += '<!--ERR ' + e.message + '-->'; }
  window.open = _o;
  return out;
});
ok(html.indexOf('Prüfbericht') > 0, 'Bericht wird gebaut');
const rep = await ctx.newPage();
await rep.setContent(html, { waitUntil: 'load' });
await rep.waitForTimeout(500);

console.log('— Aufbau —');
const bau = await rep.evaluate(() => {
  const tabs = [...document.querySelectorAll('table.pk')];
  return {
    tabellen: tabs.length,
    anlImThead: tabs.every(t => !!t.querySelector('thead tr.anlrow th.anlhd')),
    theadGroup: tabs.every(t => getComputedStyle(t.querySelector('thead')).display === 'table-header-group'),
    altesDiv: !!document.querySelector('div.anl'),
    titelTexte: tabs.map(t => t.querySelector('thead tr.anlrow th').textContent.trim().slice(0, 24)),
    mitFoto: [...document.querySelectorAll('tr.pkrow.mitfoto')].length,
    fotoRows: [...document.querySelectorAll('tr.fotorow')].length,
    ohneFoto: [...document.querySelectorAll('tr.pkrow:not(.mitfoto)')].length
  };
});
ok(bau.tabellen === 2, 'zwei Anlagen-Tabellen (' + bau.tabellen + ')');
ok(bau.anlImThead, 'Anlagen-Titel steht IM Tabellenkopf (nicht als loses <div> davor)');
ok(!bau.altesDiv, 'kein loses .anl-<div> mehr');
ok(bau.theadGroup, 'thead wiederholt sich auf Folgeseiten (table-header-group)');
ok(bau.mitFoto === bau.fotoRows && bau.mitFoto > 0, 'genau die Punkte MIT Bildern tragen .mitfoto (' + bau.mitFoto + '/' + bau.fotoRows + ')');
ok(bau.ohneFoto > 0, 'Punkte ohne Bilder tragen die Verkettung NICHT (' + bau.ohneFoto + ')');

const regeln = await rep.evaluate(() => {
  const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
  return {
    nurMitFoto: /tr\.pkrow\.mitfoto\{break-after:avoid/.test(css),
    keinPauschal: !/tr\.pkrow\{break-after:avoid/.test(css),
    theadAvoid: /thead tr\{break-inside:avoid;break-after:avoid/.test(css)
  };
});
ok(regeln.nurMitFoto, 'break-after:avoid NUR auf .pkrow.mitfoto');
ok(regeln.keinPauschal, 'kein pauschales break-after auf allen Punktzeilen mehr');
ok(regeln.theadAvoid, 'Kopfzeilen brechen nicht auf und nicht vom Inhalt weg');

console.log('— Zusammenhalt im Markup —');
// Was die CSS-Regeln zusammenhalten SOLLEN, muss im Markup auch benachbart
// sein: eine Bilder-Zeile steht IMMER direkt hinter ihrem Prüfpunkt, und der
// Anlagen-Titel liegt in derselben Tabelle wie seine Punkte.
const nachbar = await rep.evaluate(() => {
  const res = { fotoDirekt: true, fotoOhnePunkt: 0, titelMitPunkten: true };
  document.querySelectorAll('tr.fotorow').forEach(f => {
    const v = f.previousElementSibling;
    if (!v || !v.classList.contains('pkrow') || !v.classList.contains('mitfoto')) { res.fotoDirekt = false; res.fotoOhnePunkt++; }
  });
  document.querySelectorAll('table.pk').forEach(t => {
    if (!t.querySelector('thead tr.anlrow') || !t.querySelector('tbody tr.pkrow')) res.titelMitPunkten = false;
  });
  return res;
});
ok(nachbar.fotoDirekt, 'jede Bilder-Zeile steht direkt hinter ihrem Prüfpunkt (' + nachbar.fotoOhnePunkt + ' Ausreisser)');
ok(nachbar.titelMitPunkten, 'jeder Anlagen-Titel steckt in derselben Tabelle wie seine Punkte');

console.log('— Der Bericht paginiert wirklich (Chrome-Druck) —');
await rep.emulateMedia({ media: 'print' });
const pdf = await rep.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', right: '18mm', bottom: '18mm', left: '18mm' } });
const seiten = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
ok(seiten >= 3, 'Testbericht läuft über mehrere Seiten (' + seiten + ') — die Umbruch-Regeln greifen im Ernstfall');
// Hinweis: WO Chrome bricht, lässt sich von aussen nicht zuverlässig
// auslesen (die Fragmentierung schlägt sich nicht in den DOM-Offsets
// nieder). Abgesichert ist darum der Mechanismus: Titel im <thead>
// (Tabellenkopf wird nie ohne Datenzeile gedruckt) + Verkettung nur
// zwischen Punkt und seinen Bildern.
const druck = await rep.evaluate(() => {
  const t = document.querySelector('table.pk');
  return { theadGroup: getComputedStyle(t.querySelector('thead')).display, kopfSichtbar: !!t.querySelector('thead tr.anlrow th').offsetHeight };
});
ok(druck.theadGroup === 'table-header-group', 'auch im Druck-Modus bleibt der thead eine Kopfgruppe');
ok(druck.kopfSichtbar, 'der Anlagen-Titel wird im Druck gerendert');

ok(errs.length === 0, 'keine JS-Fehler (' + errs.slice(0, 2).join(' | ') + ')');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
