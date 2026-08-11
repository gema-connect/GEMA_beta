// Drift-Guard: das Feedback-Board zeichnet nach, wenn das Laden laenger
// dauert als das Renn-Zeitfenster des Boots.
//
// Bugreport 11.08.2026: «es heisst daten geladen aber ich sehe keine
// feedback, wenn ich aber den markdown export mache, dann sehe ich die
// punkte.»
//
// Ursache — zwei Halbwahrheiten, die zusammen den Bug ergeben:
//   1. gema_db.js: der 4-s-AbortController begrenzt NUR den Verbindungs-
//      aufbau. fetch() loest auf, sobald die ANTWORTKOEPFE da sind; Body-
//      Download und JSON.parse laufen danach unbegrenzt weiter. Bei
//      Feedback mit Base64-Screenshots sind das schnell zweistellige MB.
//   2. sys_beta.html: der Boot liess _GemaDB.init gegen 5 s rennen und
//      zeichnete danach. Gewann der Timer, lief renderAll() mit LEEREM
//      Cache — jede Modul-Zeile zeigte «Kommentar hinzufügen» statt der
//      Zaehler. Wurde init spaeter fertig, meldete es «✓ Daten geladen»,
//      ohne dass jemand neu zeichnete. Der Markdown-Export las den Cache
//      erst beim Klick und zeigte alles.
//
// Der Test modelliert genau das: Antwortkoepfe sofort, r.json() langsam.
// Ein Mock, der die ganze Antwort verzoegert, traefe stattdessen den
// 4-s-Abort und pruefte einen anderen Fehlerfall.
//
// Ausfuehren: CHROME=<chromium> node scripts/beta_board_nachladen_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PARSE_MS = 9000;   // > 5 s Rennfenster des Boots
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const ts = '11.08.2026, 09:00';
const MODULE = ['pruefliste', 'erp', 'zirkulation', 'druckverlust', 'lu_tabelle'];
const PRO_MODUL = 3;
const CLOUD = {};
MODULE.forEach(id => {
  CLOUD['feedback_' + id] = Array.from({ length: PRO_MODUL }, (_, i) => ({
    type: 'fehler', author: 'Robin', text: 'PUNKT-' + id + '-' + i,
    ts, source: id, moduleId: id, cStatus: 'offen', umsetzen: true
  }));
});
const PUNKTE_TOTAL = MODULE.length * PRO_MODUL;

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });

await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.indexOf('/rest/v1/') >= 0) {
    const rows = [];
    if (u.indexOf('data_key=like.feedback_') >= 0) {
      for (const k of Object.keys(CLOUD)) rows.push({ data_key: k, payload: { v: CLOUD[k] } });
    } else if (u.indexOf('data_key=in.') >= 0) {
      for (const k of Object.keys(CLOUD)) if (u.indexOf('%22' + k + '%22') >= 0) rows.push({ data_key: k, payload: { v: CLOUD[k] } });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
    return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
  return route.abort();
});

// Der Kern des Repros: nur der grosse init-Abruf bekommt einen langsamen
// Body — die Koepfe sind sofort da, der 4-s-Abort greift also NICHT.
await ctx.addInitScript(ms => {
  const of = window.fetch;
  window.fetch = async function (u, o) {
    const r = await of.call(this, u, o);
    if (String(u).indexOf('data_key=in.') >= 0) {
      const oj = r.json.bind(r);
      r.json = async function () { await new Promise(res => setTimeout(res, ms)); return oj(); };
    }
    return r;
  };
}, PARSE_MS);
await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); },
  { ...seed(['role_admin']), gema_coachmarks_done_sys_beta_v1: '1' });

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });

const stand = () => page.evaluate(() => ({
  cache: (typeof getFeedback === 'function') ? getFeedback('pruefliste').length : -1,
  exportPunkte: (typeof _exCollectAll === 'function') ? _exCollectAll(false).length : -1,
  zaehler: document.querySelectorAll('.cb-counts').length,
  ohneZaehler: [...document.querySelectorAll('.comment-toggle')].filter(b => /Kommentar hinzuf/.test(b.textContent)).length,
  ladeHint: (function () { const e = document.getElementById('fbLadeHint'); return !!e && e.style.display !== 'none'; })(),
  karten: document.querySelectorAll('.fb-card').length
}));

console.log('■ Waehrend das Laden laeuft (Rennen verloren)');
await page.waitForTimeout(6000);
{
  const a = await stand();
  ok(a.cache === 0, 'der Cache ist erwartungsgemäss noch leer');
  ok(a.ladeHint === true, 'ein sichtbarer Hinweis sagt, dass noch geladen wird');
  ok(a.ohneZaehler > 0, 'die Zeilen stehen noch ohne Zähler da (' + a.ohneZaehler + ')');
}

console.log('■ Nach Abschluss des Ladens zeichnet das Board nach');
await page.waitForTimeout(PARSE_MS - 3000);
{
  const b = await stand();
  ok(b.cache === PRO_MODUL, 'die Daten sind im Cache angekommen (' + b.cache + ')');
  ok(b.zaehler > 0, 'die Modul-Zeilen tragen jetzt Zähler-Badges (' + b.zaehler + ')');
  ok(b.zaehler === MODULE.length, 'genau die ' + MODULE.length + ' Module mit Feedback zeigen einen Zähler');
  ok(b.ladeHint === false, 'der Lade-Hinweis ist wieder weg');
  // Die Kern-Invariante des Bugreports: Board und Export duerfen nie
  // auseinanderlaufen.
  ok(b.exportPunkte === PUNKTE_TOTAL, 'der Export sieht alle ' + PUNKTE_TOTAL + ' Punkte');
  ok(b.ohneZaehler < 124, 'nicht mehr jede Zeile sagt «Kommentar hinzufügen»');
}

console.log('■ Die Punkte sind wirklich sichtbar, nicht nur gezählt');
{
  const r = await page.evaluate(() => {
    toggleFbPanel('pruefliste');
    const panel = document.getElementById('fbp-pruefliste');
    return {
      offen: !!panel && panel.style.display !== 'none',
      karten: panel ? panel.querySelectorAll('.fb-card').length : 0,
      text: document.body.innerText.indexOf('PUNKT-pruefliste-0') >= 0
    };
  });
  ok(r.offen, 'das Panel lässt sich aufklappen');
  ok(r.karten === PRO_MODUL, 'es enthält alle ' + PRO_MODUL + ' Feedback-Karten (' + r.karten + ')');
  ok(r.text, 'der Feedback-Text steht wirklich im DOM');
}

console.log('■ gema_db.js: der Abort begrenzt bewusst nur den Verbindungsaufbau');
{
  const src = await (await fetch(BASE + '/gema_db.js')).text();
  ok(/ANTWORTKOEPFE/.test(src), 'die Falle ist im Code dokumentiert');
  ok(/setTimeout\(\(\) => controller\.abort\(\), 120000\)/.test(src),
    'der Body-Download hat einen eigenen (grosszügigen) Deckel statt gar keinem');
  ok((src.match(/clearTimeout\(timeoutId\)/g) || []).length >= 3,
    'jeder Ausgang räumt seinen Timer ab (kein Abort auf einer fertigen Antwort)');
}

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''));

await ctx.close(); await browser.close(); server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
