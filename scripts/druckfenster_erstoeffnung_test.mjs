// Druckfenster: beim ERSTEN Öffnen vollständig — nicht erst beim zweiten Mal
//
// Bugreport 28.07.2026 (zwei Nutzer): «beim PDF anzeigen erschien eine leere
// A4-Seite, beim Scrollen kamen die Daten komplett vermischt und nicht auf dem
// jeweiligen Blatt. Fenster zu, nochmals geklickt → normal.»
//
// Zwei Ursachen, beide nur beim ERSTEN Öffnen (kalter Cache):
//  1. Ein noch ladender Stylesheet-Link (Google Fonts) hält ein NACHFOLGENDES
//     Inline-<script> an — der HTML-Parser stoppt dort. Das direkt danach vom
//     Aufrufer gerufene document.close() beendet den Eingabestrom, und ALLES,
//     was im Markup nach dem Script kommt, wird verworfen. Beim zweiten Mal
//     ist die Schrift im Cache → kein Blockieren → alles da.
//     Fix: der Feedback-Script-Block steht jetzt GANZ AM ENDE des Dokuments.
//  2. GemaPrintA4.apply() lief unmittelbar nach document.close() und legte nur
//     die bis dahin geparsten Knoten aufs A4-Blatt; alles später Geparste
//     landete daneben («nicht auf dem jeweiligen Blatt»).
//     Fix: erst wrappen, wenn das Dokument fertig ist (bzw. nicht mehr wächst).
//
// Der Test simuliert den kalten Cache mit einer verzögerten Font-CSS.
//
// Aufruf:  CHROME=<chromium> node scripts/druckfenster_erstoeffnung_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8933;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
await ctx.route('**/*', async route => {
  const u = route.request().url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
    if (route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  }
  // Kalter Cache: die Schrift trifft erst nach 900 ms ein — genau das hielt
  // den Parser des Druckfensters an.
  if (u.indexOf('fonts.googleapis') >= 0) { await sleep(900); return route.fulfill({ contentType: 'text/css', body: '/*font*/' }); }
  if (u.indexOf('fonts.gstatic') >= 0) return route.abort();
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
await page.evaluate(jpg => {
  window.prNeu(); window.prAddAnlage('trinkwasser');
  const b = window._prHooks.aktuelle();
  b.titel = 'Erstöffnung'; b.objektName = 'Neubau Sonnhalde';
  b.anlagen[0].punkte.forEach((p, i) => {
    p.antwort = 'ja'; p.bewertung = 'maessig'; p.empfehlung = 'Empfehlung ' + i;
    if (i % 2 === 0) p.fotos = [{ url: jpg }, { url: jpg }];
  });
}, JPG);

async function berichtOeffnen() {
  await page.evaluate(() => window.prBericht());
  await page.waitForTimeout(2600);          // Font-Verzögerung + Wrap abwarten
  const pages = ctx.pages();
  const rep = pages[pages.length - 1];
  const stand = await rep.evaluate(() => {
    const b = document.body;
    const sheet = document.querySelector('.gpa4-sheet');
    const draussen = [...b.children].filter(c => !c.classList.contains('gpa4-sheet') && !c.classList.contains('no-print'));
    return {
      tabellen: document.querySelectorAll('table.pk').length,
      punkte: document.querySelectorAll('tr.pkrow').length,
      fotos: document.querySelectorAll('tr.fotorow').length,
      hatTitel: !!document.querySelector('thead tr.anlrow'),
      hatDeckblatt: !!document.querySelector('h1'),
      hatFuss: !!document.querySelector('.ft'),
      sheets: document.querySelectorAll('.gpa4-sheet').length,
      imSheet: sheet ? sheet.children.length : -1,
      draussen: draussen.map(c => c.tagName + '.' + c.className)
    };
  });
  return { rep, stand };
}

console.log('— ERSTE Öffnung (kalter Cache, Schrift 900 ms verzögert) —');
const erste = await berichtOeffnen();
ok(erste.stand.hatDeckblatt, 'Deckblatt vorhanden');
ok(erste.stand.tabellen === 1, 'Prüfpunkt-Tabelle vorhanden (' + erste.stand.tabellen + ')');
ok(erste.stand.punkte >= 5, 'alle Prüfpunkte da (' + erste.stand.punkte + ') — nichts vom Parser verschluckt');
ok(erste.stand.fotos >= 2, 'Bilder-Zeilen da (' + erste.stand.fotos + ')');
ok(erste.stand.hatTitel, 'Anlagen-Titel da');
ok(erste.stand.hatFuss, 'Fusszeile da — der Inhalt reicht bis zum Dokumentende');
ok(erste.stand.sheets === 1, 'genau ein A4-Blatt (' + erste.stand.sheets + ')');
ok(erste.stand.draussen.length === 0, 'nichts liegt neben dem Blatt (' + erste.stand.draussen.join(', ') + ')');
ok(erste.stand.imSheet >= 8, 'der ganze Bericht sitzt AUF dem Blatt (' + erste.stand.imSheet + ' Blöcke)');
await erste.rep.close();

console.log('— ZWEITE Öffnung (warmer Cache) — muss identisch sein —');
const zweite = await berichtOeffnen();
ok(zweite.stand.tabellen === erste.stand.tabellen && zweite.stand.punkte === erste.stand.punkte,
   'gleicher Inhalt wie beim ersten Mal (' + zweite.stand.punkte + ' Punkte)');
ok(zweite.stand.sheets === 1 && zweite.stand.draussen.length === 0, 'auch hier alles auf dem Blatt');
await zweite.rep.close();

console.log('— Statische Absicherung —');
const src = await readFile(join(ROOT, 'pm_pruefliste.html'), 'utf8');
const iScript = src.indexOf("h+='<script>(function(){");
const iFuss = src.indexOf("h+='<div class=\"ft\"");
const iEnde = src.indexOf("h+='</body></html>';");
ok(iScript > iFuss && iScript > 0, 'der Feedback-Script-Block steht NACH dem Inhalt');
ok(iScript < iEnde, 'und noch vor dem schliessenden </body>');
const pa4 = await readFile(join(ROOT, 'gema_print_a4.js'), 'utf8');
ok(/readyState === 'loading'/.test(pa4), 'GemaPrintA4 wartet, solange das Fenster noch parst');
ok(/DOMContentLoaded/.test(pa4) && /addEventListener\('load'/.test(pa4), 'wrappt bei DOMContentLoaded bzw. load');
ok(/ruhig >= 3/.test(pa4), 'Sicherheitsnetz, falls der Parser nie fertig meldet');

ok(errs.length === 0, 'keine JS-Fehler (' + errs.slice(0, 2).join(' | ') + ')');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
