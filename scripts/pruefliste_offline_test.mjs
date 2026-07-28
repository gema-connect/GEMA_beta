// pm_pruefliste — Speichern muss auch ohne Internet verlustfrei sein
//
// Im Kontext des Abnahme-Vorfalls (28.07.2026) geprüft: Eine Begehung wird
// draussen auf der Baustelle erfasst — dort ist das Netz regelmässig weg.
// Der Kanon dafür (siehe CLAUDE.md «Verlustfreies Speichern»):
//   1. local-first: der lokale Pool wird IMMER zuerst geschrieben,
//      unabhängig davon, ob der Cloud-Push klappt;
//   2. ein gescheiterter Push landet in der GemaSync-Outbox und wird
//      automatisch nachgesendet;
//   3. ein Reload überschreibt den lokalen Stand NICHT mit dem (älteren)
//      Cloud-Stand — die Outbox legt sich darüber;
//   4. die Debounce-Änderung geht bei Tab-Wechsel/Schliessen nicht verloren;
//   5. der Zustand ist sichtbar (Status-Badge), nicht stumm.
//
// Aufruf:  CHROME=<chromium> node scripts/pruefliste_offline_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8921;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/pm_pruefliste.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true, settings: {} };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };

// In-Memory-PostgREST mit Offline-Schalter
const cloud = new Map();
let offline = false;
function rowsFor(url) {
  const like = /data_key=like\.([^&]+)/.exec(url);
  const mod = /module_key=eq\.([^&]+)/.exec(url);
  let out = [...cloud.values()];
  if (mod) out = out.filter(r => r.module_key === decodeURIComponent(mod[1]));
  if (like) { const pat = decodeURIComponent(like[1]).replace(/\*/g, ''); out = out.filter(r => r.data_key.indexOf(pat) === 0); }
  return out;
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
await ctx.route('**/*', route => {
  const req = route.request(), u = req.url();
  if (u.startsWith(BASE)) return route.continue();
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
    if (offline) return route.abort('failed');           // echter Netzausfall
    if (req.method() === 'POST') {
      let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
      if (!Array.isArray(body)) body = [body];
      body.forEach(r => { if (r && r.data_key) cloud.set(r.module_key + '|' + r.data_key, r); });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (req.method() === 'DELETE') return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rowsFor(u)) });
  }
  if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) {
    if (offline) return route.abort('failed');
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  }
  return route.abort();
});
const seed = {
  gema_orgs_v1: JSON.stringify([ORG]),
  gema_users_v1: JSON.stringify(USERS),
  gema_session_v1: JSON.stringify(SESSION),
  gema_coachmarks_done_pruefliste: '1'
};
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, seed);

async function neueSeite() {
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._prHooks, null, { timeout: 9000 });
  await page.waitForTimeout(1200);
  return { page, errs };
}

console.log('— Online: Begehung anlegen —');
let { page, errs } = await neueSeite();
ok(errs.length === 0, 'keine pageerrors beim Boot (' + errs.slice(0, 2).join(' | ') + ')');
await page.evaluate(() => window.prNeu());
await page.evaluate(() => window.prAddAnlage('gas'));
await page.waitForTimeout(600);
const begId = await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].id);
ok(!!begId, 'Begehung angelegt');
ok([...cloud.keys()].some(k => k === 'pruefliste|prbeg:' + begId), 'Begehung ist in der Cloud angekommen');

console.log('— Netz weg: Erfassung läuft weiter —');
offline = true;
await page.evaluate(() => {
  window.prEField('titel', 'Begehung ohne Netz');
  window.prSetAntwort(0, 0, 'ja');   // erster Prüfpunkt — echte Erfassung, nicht nur ein Feld
});
await page.waitForTimeout(1400);          // Debounce 700 ms + Push-Versuch
const offlineStand = await page.evaluate(() => {
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  const st = document.getElementById('saveStatus');
  return {
    titel: b.titel,
    antwort: b.anlagen[0].punkte[0].antwort,
    badge: st ? (st.className + '|' + st.textContent) : '',
    pending: (window.GemaSync && window.GemaSync.pendingCount) ? window.GemaSync.pendingCount() : -1
  };
});
ok(offlineStand.titel === 'Begehung ohne Netz', 'Titel ist lokal gespeichert (local-first)');
ok(offlineStand.antwort === 'ja', 'beantworteter Prüfpunkt ist lokal gespeichert');
ok(offlineStand.pending > 0, 'Cloud-Push liegt in der Outbox (' + offlineStand.pending + ')');
ok(/error/.test(offlineStand.badge), 'Status-Badge meldet den Rückstand statt zu schweigen');
ok(/nachgeholt|hochgeladen/i.test(offlineStand.badge), 'Badge-Text erklärt, dass nachgesendet wird');

console.log('— Reload OHNE Netz: nichts verloren —');
await page.close();
({ page, errs } = await neueSeite());
const nachReloadOffline = await page.evaluate(() => {
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  return { titel: b && b.titel, antwort: b && b.anlagen[0].punkte[0].antwort };
});
ok(nachReloadOffline.titel === 'Begehung ohne Netz', 'nach Reload offline: Titel noch da');
ok(nachReloadOffline.antwort === 'ja', 'nach Reload offline: Antwort noch da');

console.log('— Netz zurück: automatisch nachgesendet —');
offline = false;
await page.evaluate(() => window.GemaSync && window.GemaSync.flushOutbox && window.GemaSync.flushOutbox());
await page.waitForTimeout(1500);
const row = cloud.get('pruefliste|prbeg:' + begId);
ok(!!row, 'Record liegt nach dem Flush in der Cloud');
ok(row && row.payload && row.payload.data && row.payload.data.titel === 'Begehung ohne Netz', 'Cloud hat den OFFLINE erfassten Stand');
ok(row && row.payload.data.anlagen[0].punkte[0].antwort === 'ja', 'Cloud hat die offline beantwortete Frage');
const restPending = await page.evaluate(() => window.GemaSync.pendingCount());
ok(restPending === 0, 'Outbox ist danach leer (' + restPending + ')');

console.log('— Reload MIT Netz: der Cloud-Stand ist der erfasste —');
await page.close();
({ page, errs } = await neueSeite());
const final = await page.evaluate(() => {
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  return { titel: b && b.titel, antwort: b && b.anlagen[0].punkte[0].antwort };
});
ok(final.titel === 'Begehung ohne Netz', 'nach Reload online: Titel unverändert');
ok(final.antwort === 'ja', 'nach Reload online: Antwort unverändert');

console.log('— Debounce geht bei Tab-Wechsel/Schliessen nie verloren —');
await page.evaluate(() => { window.prOpen(window._prHooks.cached(window._prHooks.POOLS.BEG)[0].id); });
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.prEField('titel', 'Per Tab-Wechsel gesichert');
  // Tab in den Hintergrund — pagehide feuert dabei NICHT
  Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(400);
ok((await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].titel)) === 'Per Tab-Wechsel gesichert',
   'visibilitychange flusht die pending Änderung (iOS: pagehide feuert oft nicht)');
await page.evaluate(() => { window.prEField('titel', 'Beim Schliessen gesichert'); window.prCloseEditor(); });
await page.waitForTimeout(300);
ok((await page.evaluate(() => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].titel)) === 'Beim Schliessen gesichert',
   'Editor-Schliessen flusht die pending Änderung');

console.log('— Statische Absicherung —');
const src = await readFile(join(ROOT, 'pm_pruefliste.html'), 'utf8');
ok(/addEventListener\('pagehide', *flushSave\)/.test(src), 'flushSave auf pagehide');
ok(/visibilitychange[\s\S]{0,120}flushSave\(\)/.test(src), 'flushSave auf visibilitychange');
ok(/setInterval\(flushSave/.test(src), 'Backstop-Interval für hängengebliebene Debounce-Saves');
ok(/lokalOk *= *false/.test(src), 'gescheiterter LOKALER Write wird erkannt (Quota), nicht verschluckt');
ok(/function _setSaveStatus/.test(src), 'Speicher-Status-Badge vorhanden');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
