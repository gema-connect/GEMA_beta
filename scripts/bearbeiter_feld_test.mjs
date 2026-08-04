// Bearbeiter-Feld folgt der eingeloggten Person (Feedback 04.08.2026)
//
// Bugreport (sb_druckverlust): «beim Bearbeiter steht Admin und nicht der
// eingeloggte Nutzer». Ursache war NICHT modul-spezifisch: 43 Module cachen
// ihre Kopfzeile geraetelokal unter `gema_meta_<pfad>` — OHNE User-Bezug.
// Meldet sich auf demselben Browser eine andere Person an, erbt sie den
// Bearbeiter-Namen der vorherigen. Fix zentral in gema_objekte_api.js:
//   (1) _metaUserGuard() wirft beim User-Wechsel NUR das `b`-Feld
//       (Bearbeiter) aus allen gema_meta_*-Caches — Projekt/Datum/Objekt
//       bleiben unangetastet (das sind Projektdaten, keine Personendaten).
//   (2) _metaBearbeiterPrefill() traegt den eingeloggten Namen NUR in ein
//       LEERES Feld ein — ein bewusst erfasster fremder Name (z.B. der
//       Lernende, der fuer den Chef rechnet) wird NIE ueberschrieben.
//
// Aufruf: CHROME=<chromium> node scripts/bearbeiter_feld_test.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { startServer, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

const SEITEN = ['sb_druckverlust.html', 'sb_lu_tabelle.html', 'sa_enthaertung.html'];

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

function routes(ctx) {
  return ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: '{"ok":false}' });
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: route.request().method() === 'GET' ? '[]' : '{}' });
    return route.abort();
  });
}
function planerSeed(userId, name) {
  const s = seed(['role_planer']);
  s.gema_users_v1 = [
    { id: 'u_admin', username: 'admin@test.ch', name: 'Admin GEMA', roleIds: ['role_admin'], orgId: 'org_test', active: true, profile: { email: 'admin@test.ch' } },
    { id: 'u_test', username: 'p@test.ch', name: 'Sandro Planer', roleIds: ['role_planer'], orgId: 'org_test', active: true, profile: { email: 'p@test.ch' } }
  ];
  return s;
}
async function neuerCtx(seedObj) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  await routes(ctx);
  await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, seedObj);
  return ctx;
}
const lesen = page => page.evaluate(() => {
  const el = document.getElementById('metaBearbeiter');
  return { da: !!el, wert: el ? el.value : null };
});

try {
  // ── A: der fremde Name aus dem Geraete-Cache verschwindet ──
  console.log('■ A: Vorheriger Nutzer im Geraete-Cache');
  {
    const s = planerSeed();
    // Der Admin hat auf diesem Geraet zuletzt gerechnet — sein Name klebt
    // im geraetelokalen Meta-Cache jeder Seite (so kam «Admin» zustande).
    SEITEN.forEach(f => { s['gema_meta_' + f.replace('.html', '')] = { p: 'Neubau Musterstrasse', b: 'Admin GEMA', d: '2026-08-01', oid: '' }; });
    s.gema_meta_user_v1 = 'u_admin';
    const ctx = await neuerCtx(s);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    for (const f of SEITEN) {
      await page.goto(BASE + '/' + f, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const r = await lesen(page);
      ok(r.da && r.wert === 'Sandro Planer', f + ': Bearbeiter = eingeloggte Person (nicht «Admin GEMA»)', r);
    }
    // Projektdaten des Caches bleiben unberuehrt — nur der Name wird geleert
    const meta = await page.evaluate(f => {
      try { return JSON.parse(localStorage.getItem('gema_meta_' + f.replace('.html', '')) || '{}'); } catch (e) { return null; }
    }, SEITEN[0]);
    ok(meta && meta.p === 'Neubau Musterstrasse', 'Projekt-Angabe im Meta-Cache bleibt erhalten', meta);
    ok(meta && !meta.b_alt, 'kein Alt-Feld zurueckgelassen', meta);
    ok(errors.length === 0, 'keine JS-Fehler (' + errors.slice(0, 2).join(' | ') + ')');
    await ctx.close();
  }

  // ── B: ein bewusst erfasster fremder Name bleibt stehen ──
  console.log('■ B: Manuell erfasster Name wird NIE ueberschrieben');
  {
    const s = planerSeed();
    s.gema_meta_user_v1 = 'u_test';                       // kein User-Wechsel
    s['gema_meta_' + SEITEN[0].replace('.html', '')] = { p: '', b: 'Lernender Lars', d: '', oid: '' };
    const ctx = await neuerCtx(s);
    const page = await ctx.newPage();
    await page.goto(BASE + '/' + SEITEN[0], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const r = await lesen(page);
    ok(r.wert === 'Lernender Lars', 'erfasster Name des angemeldeten Nutzers bleibt stehen', r);

    // Auch waehrend der Sitzung getippte Namen bleiben (Prefill laeuft mehrfach)
    await page.evaluate(() => {
      const el = document.getElementById('metaBearbeiter');
      el.value = 'Chef persoenlich';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(2200);
    const r2 = await lesen(page);
    ok(r2.wert === 'Chef persoenlich', 'spaeterer Prefill-Lauf ueberschreibt die Eingabe nicht', r2);
    await ctx.close();
  }

  // ── C: leeres Feld ohne Cache wird vorbefuellt ──
  console.log('■ C: Frisches Geraet');
  {
    const ctx = await neuerCtx(planerSeed());
    const page = await ctx.newPage();
    await page.goto(BASE + '/' + SEITEN[0], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const r = await lesen(page);
    ok(r.wert === 'Sandro Planer', 'leeres Bearbeiter-Feld wird mit der eingeloggten Person vorbefuellt', r);
    // Und der Marker steht danach auf dem aktuellen User (kein Dauer-Loeschen)
    const marker = await page.evaluate(() => localStorage.getItem('gema_meta_user_v1'));
    ok(marker === 'u_test', 'User-Marker steht auf der angemeldeten Person', marker);
    await ctx.close();
  }

  // ── D: Statik — der Guard liegt zentral, nicht pro Modul ──
  console.log('■ D: Zentrale Verdrahtung');
  {
    const api = readFileSync(new URL('../gema_objekte_api.js', import.meta.url), 'utf8');
    ok(/META_USER_KEY\s*=\s*'gema_meta_user_v1'/.test(api), 'User-Marker-Key in gema_objekte_api.js');
    ok(/_metaUserGuard\(\);/.test(api), 'Guard laeuft beim Laden der API (vor loadMeta der Module)');
    ok(/if\s*\(!el\s*\|\|\s*\(el\.value\s*\|\|\s*''\)\.trim\(\)\)\s*return;/.test(api), 'Prefill fasst ein gefuelltes Feld NIE an');
    ok(/delete d\.b;/.test(api) && !/localStorage\.removeItem\(k\)/.test(api.slice(api.indexOf('_metaUserGuard'), api.indexOf('_metaUserGuard') + 700)),
      'beim User-Wechsel wird nur der Bearbeiter geleert, nicht der ganze Cache');
  }

  console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
} finally {
  await browser.close(); server.close();
}
process.exit(fail ? 1 : 0);
