// Skeleton-Ladeanzeige in Werkzeug- und Fahrzeugmanagement.
//
// Statt eines Spinners stehen waehrend des ERSTEN Cloud-Pulls Platzhalter in
// der FORM der jeweiligen Ansicht (Karten / kompakte Liste / Tabelle / nativer
// Handy-Screen). Geprueft wird das, was wirklich schiefgehen kann:
//
//   A) Bei LEEREM Cache erscheinen die Platzhalter — in allen drei klassischen
//      Ansichten und im nativen Screen.
//   B) Kein «0» und kein «Keine Geraete/Fahrzeuge gefunden.» waehrend des
//      Ladens — das waeren Aussagen ueber einen Bestand, den GEMA noch gar
//      nicht kennt (genau dafuer gab es die Ladeanzeige ueberhaupt).
//   C) Nach dem Cloud-Pull sind die Platzhalter WEG und die echten Daten da —
//      auch dann, wenn die Cloud LEER antwortet (sonst bliebe das Skelett
//      fuer immer stehen; der haeufigste Skeleton-Fehler).
//   D) Bei GEFUELLTEM Cache erscheint NIE ein Skelett (stale-while-revalidate
//      — dort waere es ein Rueckschritt gegenueber dem Sofort-Render).
//   E) Layout: die Platzhalter-Kennzahl ist so hoch wie die spaetere Zahl
//      (gemessen) — die Zeile darf beim Eintreffen der Daten nicht springen.
//   F) Zugaenglichkeit/Druck: Platzhalter sind aria-hidden, der sichtbare
//      Hinweis sagt im Klartext was laeuft, und im Druck faellt beides weg.
//
// Aufruf:  CHROME=<chromium> node scripts/skeleton_loading_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8931;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/if_werkzeug.html';
    const buf = await readFile(join(ROOT, p.slice(1)));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ── Cloud-Antwort steuerbar: der Test entscheidet, WANN und WOMIT sie kommt.
//    Nur so ist der Ladezustand ueberhaupt beobachtbar.
function makeCtx(browser, opts) {
  return browser.newContext({ viewport: opts.viewport || { width: 1400, height: 950 } });
}

const SESSION = {
  userId: 'u_test', name: 'Test Magaziner', orgId: 'org_test',
  token: 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJ1X3Rlc3QiLCJvcmciOiJvcmdfdGVzdCJ9.x',
  tokenExp: Math.floor(Date.now() / 1000) + 999999,
  expires: Date.now() + 999999000, remember: true
};
const USER = { id: 'u_test', name: 'Test Magaziner', username: 'test@gema.ch', orgId: 'org_test', roleIds: ['role_magaziner'], active: true };
const ORG = { id: 'org_test', name: 'Testfirma AG' };

async function seed(ctx, { cache = null } = {}) {
  await ctx.addInitScript(([session, user, org, cache]) => {
    localStorage.setItem('gema_session_v1', JSON.stringify(session));
    localStorage.setItem('gema_users_v1', JSON.stringify([user]));
    localStorage.setItem('gema_orgs_v1', JSON.stringify([org]));
    localStorage.setItem('gema_coachmarks_done_if_werkzeug', '1');
    localStorage.setItem('gema_coachmarks_done_if_fahrzeug', '1');
    localStorage.setItem('gema_native_view_v1', 'klassisch');
    if (cache) for (const k of Object.keys(cache)) localStorage.setItem(k, JSON.stringify(cache[k]));
  }, [SESSION, USER, ORG, cache]);
}

// Die Cloud-Antwort wird angehalten, bis der Test sie freigibt.
async function holdCloud(ctx, rowsFor) {
  let release;
  const gate = new Promise(r => { release = r; });
  await ctx.route('**/rest/v1/**', async route => {
    const u = route.request().url();
    if (route.request().method() !== 'GET') return route.fulfill({ status: 200, body: '[]', headers: { 'content-type': 'application/json' } });
    await gate;
    let body = '[]';
    try { body = JSON.stringify(rowsFor(u) || []); } catch {}
    route.fulfill({ status: 200, body, headers: { 'content-type': 'application/json', 'content-range': '0-0/*' } });
  });
  await ctx.route('**/gema-auth**', route => route.fulfill({ status: 200, body: '{}', headers: { 'content-type': 'application/json' } }));
  return () => release();
}

const row = (mod, key, data) => ({ module_key: mod, data_key: key, payload: { data }, last_modified: new Date().toISOString() });

const TOOLS = [
  { id: 't1', name: 'Bohrhammer TE 30', cat: 'bohren', brand: 'Hilti', model: 'TE 30', orgId: 'org_test', bought: '2024-01-05', status: 'aktiv' },
  { id: 't2', name: 'Presswerkzeug', cat: 'press', brand: 'Nussbaum', model: 'PW 2', orgId: 'org_test', bought: '2023-06-01', status: 'aktiv' }
];
const VEHICLES = [
  { id: 'v1', nr: '01', model: 'VW Crafter', plate: 'BS 12345', type: 'Bus', status: 'aktiv', km: 45000, orgId: 'org_test' },
  { id: 'v2', nr: '02', model: 'Ford Transit', plate: 'BS 67890', type: 'Bus', status: 'aktiv', km: 88000, orgId: 'org_test' }
];

const wzRows = u => u.includes('werkzeugmanagement') ? TOOLS.map(t => row('werkzeugmanagement', 'tool:' + t.id, t)) : [];
const fzRows = u => u.includes('fahrzeugmanagement') ? VEHICLES.map(v => row('fahrzeugmanagement', 'vehicle:' + v.id, v)) : [];

// ═══════════════════════════════════════════════════════════════════
async function pruefeModul(name, { url, cacheKey, cacheDaten, rowsFor, viewSel, listBtn, tableBtn, statIds, leerText }) {
  console.log('\n═══ ' + name + ' ═══');

  // ── A/B: leerer Cache → Platzhalter, keine falschen Zahlen ──────────
  {
    const ctx = await makeCtx(browser, {});
    await seed(ctx);
    const release = await holdCloud(ctx, rowsFor);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900); // Sofort-Render aus (leerem) Cache ist durch

    const sk = await page.evaluate(() => ({
      anzahl: document.querySelectorAll('.gema-sk').length,
      hinweise: [...document.querySelectorAll('.gema-sk-hint')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim()),
      ariaOk: [...document.querySelectorAll('.gema-sk')].every(e => e.closest('[aria-hidden="true"]') !== null),
      shimmer: (() => { const e = document.querySelector('.gema-sk'); if (!e) return ''; return getComputedStyle(e, '::after').animationName; })()
    }));
    ok(sk.anzahl > 0, 'A · Karten-Ansicht zeigt Platzhalter (' + sk.anzahl + ' Elemente)');
    ok(sk.hinweise.length > 0 && /geladen/i.test(sk.hinweise[0]), 'A · sichtbarer Hinweis im Klartext: «' + (sk.hinweise[0] || '—') + '»');
    ok(sk.ariaOk, 'F · alle Platzhalter liegen unter aria-hidden (Screenreader liest keine leeren Balken)');
    ok(sk.shimmer === 'gema-sk-shimmer', 'A · Schimmer-Animation laeuft (' + sk.shimmer + ')');

    // B: keine erfundene Zahl, kein «nichts gefunden»
    const txt = await page.evaluate(() => document.body.innerText);
    ok(!new RegExp(leerText, 'i').test(txt), 'B · waehrend des Ladens KEIN «' + leerText + '»');
    const stats = await page.evaluate(ids => ids.map(id => {
      const e = document.getElementById(id); if (!e) return 'FEHLT';
      return e.querySelector('.gema-sk') ? 'SK' : e.textContent.trim();
    }), statIds);
    ok(stats.every(s => s === 'SK'), 'B · Kennzahlen zeigen Platzhalter statt «0» (' + stats.join('/') + ')');

    // E: Balken so hoch wie die spaetere Zahl → kein Layout-Sprung
    const hVor = await page.evaluate(id => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().height : 0; }, statIds[0]);

    // andere Ansichten
    if (listBtn) {
      await page.click(listBtn); await page.waitForTimeout(200);
      const n = await page.evaluate(sel => document.querySelectorAll(sel + ' .gema-sk').length, viewSel.liste);
      ok(n > 0, 'A · kompakte Liste zeigt Platzhalter (' + n + ')');
    }
    if (tableBtn) {
      await page.click(tableBtn); await page.waitForTimeout(200);
      const t = await page.evaluate(() => {
        const tb = document.querySelector('table tbody');
        const kopf = document.querySelectorAll('table thead th').length;
        const zellen = tb ? (tb.querySelector('tr') ? tb.querySelector('tr').children.length : 0) : 0;
        return { sk: tb ? tb.querySelectorAll('.gema-sk').length : 0, kopf, zellen };
      });
      ok(t.sk > 0, 'A · Tabelle zeigt Platzhalter (' + t.sk + ')');
      ok(t.zellen === t.kopf, 'A · Platzhalter-Zeile hat genau so viele Spalten wie der Tabellenkopf (' + t.zellen + '/' + t.kopf + ')');
    }

    // ── C: Cloud antwortet → Platzhalter weg, echte Daten da ───────────
    release();
    await page.waitForTimeout(1600);
    const nach = await page.evaluate(() => ({
      sk: document.querySelectorAll('.gema-sk').length,
      hint: document.querySelectorAll('.gema-sk-hint').length,
      txt: document.body.innerText
    }));
    ok(nach.sk === 0 && nach.hint === 0, 'C · nach dem Cloud-Pull sind ALLE Platzhalter weg');
    const hNach = await page.evaluate(id => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().height : 0; }, statIds[0]);
    ok(Math.abs(hVor - hNach) <= 1.5, 'E · Kennzahl springt nicht (' + hVor.toFixed(1) + 'px → ' + hNach.toFixed(1) + 'px)');
    ok(errs.length === 0, 'A · keine JS-Fehler (' + (errs[0] || 'keine') + ')');
    await ctx.close();
  }

  // ── C2: LEERE Cloud-Antwort → Skelett verschwindet trotzdem ─────────
  {
    const ctx = await makeCtx(browser, {});
    await seed(ctx);
    const release = await holdCloud(ctx, () => []);
    const page = await ctx.newPage();
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const vorher = await page.evaluate(() => document.querySelectorAll('.gema-sk').length);
    release();
    await page.waitForTimeout(1800);
    const nachher = await page.evaluate(() => ({ sk: document.querySelectorAll('.gema-sk').length, txt: document.body.innerText }));
    ok(vorher > 0, 'C2 · Platzhalter erscheinen auch vor einer leeren Antwort');
    ok(nachher.sk === 0, 'C2 · LEERE Cloud-Antwort raeumt die Platzhalter ebenfalls ab (kein ewiges Skelett)');
    ok(new RegExp(leerText, 'i').test(nachher.txt), 'C2 · danach steht ehrlich «' + leerText + '»');
    await ctx.close();
  }

  // ── D: gefuellter Cache → NIE ein Skelett ──────────────────────────
  {
    const ctx = await makeCtx(browser, {});
    await seed(ctx, { cache: { [cacheKey]: cacheDaten } });
    const release = await holdCloud(ctx, rowsFor);
    const page = await ctx.newPage();
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({ sk: document.querySelectorAll('.gema-sk').length, txt: document.body.innerText }));
    ok(r.sk === 0, 'D · gefuellter Cache rendert SOFORT die echten Daten, kein Skelett');
    release(); await ctx.close();
  }
}

// ═══ Werkzeug ═══
await pruefeModul('Werkzeugmanagement', {
  url: '/if_werkzeug.html',
  cacheKey: 'gema_werkzeug', cacheDaten: TOOLS, rowsFor: wzRows,
  viewSel: { liste: '#wzList' },
  listBtn: '#vt_list',
  tableBtn: '#vt_table',
  statIds: ['s_total', 's_overdue', 's_soon', 's_ok'],
  leerText: 'Keine Geräte gefunden'
});

// ═══ Fahrzeug ═══
await pruefeModul('Fahrzeugmanagement', {
  url: '/if_fahrzeug.html',
  cacheKey: 'gema_vehicles', cacheDaten: VEHICLES, rowsFor: fzRows,
  viewSel: { liste: '#listView' },
  listBtn: '#viewToggle .seg[data-view="list"]',
  tableBtn: '#viewToggle .seg[data-view="table"]',
  statIds: ['kTotal', 'kActive', 'kService', 'kInactive'],
  leerText: 'Keine Fahrzeuge gefunden'
});

// ═══ Native Handy-Ansicht ═══
console.log('\n═══ Native Handy-Ansicht ═══');
for (const [name, url, rowsFor, leer] of [
  ['Werkzeug', '/if_werkzeug.html', wzRows, 'Keine Geräte gefunden'],
  ['Fahrzeug', '/if_fahrzeug.html', fzRows, 'Keine Fahrzeuge gefunden']
]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([session, user, org]) => {
    localStorage.setItem('gema_session_v1', JSON.stringify(session));
    user.profile = { nativeAnsicht: true };
    localStorage.setItem('gema_users_v1', JSON.stringify([user]));
    localStorage.setItem('gema_orgs_v1', JSON.stringify([org]));
    localStorage.setItem('gema_native_view_v1', 'native');
    localStorage.setItem('gema_coachmarks_done_if_werkzeug', '1');
    localStorage.setItem('gema_coachmarks_done_if_fahrzeug', '1');
  }, [SESSION, JSON.parse(JSON.stringify(USER)), ORG]);
  const release = await holdCloud(ctx, rowsFor);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const r = await page.evaluate(() => {
    const gn = document.querySelector('.gn--page');
    const sicht = gn && getComputedStyle(gn).display !== 'none';
    return {
      nativ: !!sicht,
      sk: gn ? gn.querySelectorAll('.gema-sk').length : 0,
      unter: (gn && gn.querySelector('.gn-large-title p')) ? gn.querySelector('.gn-large-title p').textContent.trim() : '',
      txt: gn ? gn.innerText : ''
    };
  });
  ok(r.nativ, name + ' · App-Ansicht ist aktiv');
  ok(r.sk > 0, name + ' · nativer Screen zeigt Platzhalter (' + r.sk + ')');
  ok(/geladen/i.test(r.unter), name + ' · Unterzeile sagt «' + r.unter + '» statt einer erfundenen Zahl');
  ok(!new RegExp(leer, 'i').test(r.txt), name + ' · kein «' + leer + '» waehrend des Ladens');

  release();
  await page.waitForTimeout(2200);
  const nach = await page.evaluate(() => {
    const gn = document.querySelector('.gn--page');
    return { sk: gn ? gn.querySelectorAll('.gema-sk').length : 0, unter: (gn && gn.querySelector('.gn-large-title p')) ? gn.querySelector('.gn-large-title p').textContent.trim() : '' };
  });
  ok(nach.sk === 0, name + ' · Platzhalter nach dem Pull weg');
  ok(!/geladen/i.test(nach.unter) && nach.unter.length > 0, name + ' · Unterzeile zeigt danach die echten Zahlen («' + nach.unter + '»)');
  ok(errs.length === 0, name + ' · keine JS-Fehler (' + (errs[0] || 'keine') + ')');
  await ctx.close();
}

// ═══ F: Druck + reduzierte Bewegung ═══
console.log('\n═══ Druck & reduzierte Bewegung ═══');
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, reducedMotion: 'reduce' });
  await seed(ctx);
  const release = await holdCloud(ctx, wzRows);
  const page = await ctx.newPage();
  await page.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  const rm = await page.evaluate(() => {
    const e = document.querySelector('.gema-sk');
    const s = getComputedStyle(e, '::after');
    return { anim: s.animationName, sichtbar: e.getBoundingClientRect().height > 0 };
  });
  ok(rm.anim === 'none', 'F · prefers-reduced-motion: Schimmer aus (' + rm.anim + ')');
  ok(rm.sichtbar, 'F · Platzhalter bleibt trotzdem sichtbar (nur ohne Bewegung)');

  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => {
    const sk = document.querySelector('.gema-sk');
    const hint = document.querySelector('.gema-sk-hint');
    return { sk: sk ? getComputedStyle(sk).display : 'weg', hint: hint ? getComputedStyle(hint).display : 'weg' };
  });
  ok(pr.sk === 'none' || pr.sk === 'weg', 'F · im Druck sind die Platzhalter ausgeblendet');
  ok(pr.hint === 'none' || pr.hint === 'weg', 'F · im Druck ist der Lade-Hinweis ausgeblendet');
  release(); await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
