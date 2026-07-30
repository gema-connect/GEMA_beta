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

// ── Fotos gehören in den Bucket, nie als Base64 in den Datensatz ─────────
console.log('— Fotos: Bucket statt Base64 —');
// Bucket-Mock: nimmt Uploads an und liefert eine öffentliche URL zurück
let bucket = [];
const JPG_1PX = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
await ctx.route('**/storage/v1/**', route => {
  const u = route.request().url();
  if (offline) return route.abort('failed');
  if (route.request().method() === 'POST') {
    const m = /\/object\/([^?]+)/.exec(u);
    const pfad = m ? decodeURIComponent(m[1]) : 'x';
    bucket.push(pfad);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: pfad }) });
  }
  // Verifikation: GemaStorage lädt die Public-URL als <img> — es MUSS ein
  // echtes Bild zurückkommen, sonst gilt der Upload als fehlgeschlagen.
  return route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG_1PX });
});

async function fotoAufnehmen(page) {
  // 1×1-JPEG als File in den zuletzt erzeugten File-Input schieben
  await page.evaluate(() => window.prAddFoto(0, 0, 'kamera'));
  await page.waitForTimeout(200);
  const handle = await page.$('input[type=file]');
  await handle.setInputFiles({ name: 'f.jpg', mimeType: 'image/jpeg', buffer: JPG_1PX });
  await page.waitForTimeout(1600);
}

await page.evaluate(() => { window.prOpen(window._prHooks.cached(window._prHooks.POOLS.BEG)[0].id); });
await page.waitForTimeout(300);
await fotoAufnehmen(page);
const fotoOnline = await page.evaluate(() => {
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  const f = b.anlagen[0].punkte[0].fotos[0];
  return { hatFoto: !!f, url: f && f.url, dataUrl: !!(f && f.dataUrl), pending: !!(f && f.pendingId),
           roh: JSON.stringify(b).indexOf('data:image') >= 0,
           queue: Object.keys(window._prHooks.fotoQ()).length };
});
ok(fotoOnline.hatFoto, 'Foto ist am Prüfpunkt erfasst');
ok(!!fotoOnline.url, 'Foto trägt eine Bucket-URL');
ok(!fotoOnline.dataUrl && !fotoOnline.pending, 'kein dataUrl/pendingId mehr am Foto');
ok(!fotoOnline.roh, 'im GANZEN Datensatz steckt kein «data:image» (Base64) mehr');
ok(fotoOnline.queue === 0, 'lokale Warteschlange ist nach dem Upload leer');
ok(bucket.length === 1, 'genau ein Upload im Bucket (' + bucket.length + ')');
ok(bucket[0] && bucket[0].indexOf('pruefliste/') >= 0, 'Upload liegt unter pruefliste/<orgId>');

const cloudBeg = () => cloud.get('pruefliste|prbeg:' + begId);
ok(JSON.stringify(cloudBeg().payload.data).indexOf('data:image') < 0, 'auch in der CLOUD kein Base64');

console.log('— Foto offline aufnehmen: wartet lokal, geht nie als Base64 in die Cloud —');
offline = true;
await fotoAufnehmen(page);
const fotoOffline = await page.evaluate(() => {
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  const f = b.anlagen[0].punkte[0].fotos[1];
  return { pending: !!(f && f.pendingId), dataUrl: !!(f && f.dataUrl),
           roh: JSON.stringify(b).indexOf('data:image') >= 0,
           queue: Object.keys(window._prHooks.fotoQ()).length,
           lsFrei: !localStorage.getItem('gema_pr_fotoq_v1') };
});
ok(fotoOffline.pending, 'offline aufgenommenes Foto trägt eine pendingId');
ok(!fotoOffline.dataUrl, 'kein dataUrl im Datensatz');
ok(!fotoOffline.roh, 'auch offline steckt kein Base64 im Datensatz');
ok(fotoOffline.queue === 1, 'das Bild wartet in der lokalen Warteschlange');
// Prüfbericht-Feedback 30.07.2026 (Bericht 3: «offline nur 4+2 Fotos, dann
// blockiert es») — die Warteschlange liegt in INDEXEDDB, localStorage (~5 MB,
// geteilt mit allen Pool-Caches) bleibt frei und kann nicht mehr volllaufen.
ok(fotoOffline.lsFrei, 'localStorage bleibt frei — das Bild liegt in IndexedDB');
const angezeigt = await page.evaluate(() => {
  const el = document.querySelector('#fotos_0_0 .foto.wartet');
  return { markiert: !!el, bildDa: !!(el && el.querySelector('img') && el.querySelector('img').src.indexOf('data:image') === 0) };
});
ok(angezeigt.markiert, 'wartendes Foto ist in der UI als solches markiert');
ok(angezeigt.bildDa, 'der Nutzer sieht sein Foto trotzdem sofort');

// Reload offline — Foto darf nicht verschwinden (Queue liegt in IndexedDB;
// die Init lädt sie in den synchronen Memory-Spiegel, auf den imgSrc liest)
await page.close();
({ page, errs } = await neueSeite());
const nachReload = await page.evaluate(async () => {
  await window._prHooks.fotoQInit();
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  const f = b.anlagen[0].punkte[0].fotos[1];
  return { pending: !!(f && f.pendingId), src: window._prHooks.imgSrc ? window._prHooks.imgSrc(f) : '' };
});
ok(nachReload.pending, 'nach Reload offline: Foto noch am Prüfpunkt');
ok(nachReload.src.indexOf('data:image') === 0, 'nach Reload offline: Bild wird aus der lokalen Warteschlange angezeigt');

console.log('— Netz zurück: Foto wandert automatisch in den Bucket —');
offline = false;
await page.evaluate(() => window._prHooks.fotoUpload());
await page.waitForTimeout(1600);
const nachUpload = await page.evaluate(() => {
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  const f = b.anlagen[0].punkte[0].fotos[1];
  return { url: f && f.url, pending: !!(f && f.pendingId),
           queue: Object.keys(window._prHooks.fotoQ()).length };
});
ok(!!nachUpload.url, 'Foto hat jetzt eine Bucket-URL');
ok(!nachUpload.pending, 'pendingId ist entfernt');
ok(nachUpload.queue === 0, 'lokale Warteschlange geleert');
ok(bucket.length === 2, 'zweiter Upload im Bucket angekommen (' + bucket.length + ')');
ok(JSON.stringify(cloudBeg().payload.data).indexOf('data:image') < 0, 'Cloud-Record blieb die ganze Zeit Base64-frei');

console.log('— Migration: Alt-Einträge aus localStorage wandern nach IndexedDB —');
offline = true;
await page.evaluate(() => { window.prOpen(window._prHooks.cached(window._prHooks.POOLS.BEG)[0].id); });
await page.waitForTimeout(300);
await fotoAufnehmen(page);                     // drittes Foto — wartet offline in der Queue
const pidInfo = await page.evaluate(() => {
  const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
  const f = b.anlagen[0].punkte[0].fotos[2];
  const pid = f.pendingId, du = window._prHooks.fotoQ()[pid];
  // Alt-Zustand simulieren (Version VOR IndexedDB): das Bild liegt im localStorage
  localStorage.setItem('gema_pr_fotoq_v1', JSON.stringify({ [pid]: du }));
  return { pid, hatDu: (du || '').indexOf('data:image') === 0 };
});
ok(pidInfo.hatDu, 'Ausgangslage: wartendes Bild + Alt-Eintrag im localStorage');
await page.close();
({ page, errs } = await neueSeite());
const mig = await page.evaluate(async (pid) => {
  await window._prHooks.fotoQInit();
  return { imMem: (window._prHooks.fotoQ()[pid] || '').indexOf('data:image') === 0,
           lsLeer: !localStorage.getItem('gema_pr_fotoq_v1') };
}, pidInfo.pid);
ok(mig.imMem, 'Alt-Eintrag ist nach dem Boot in der Queue (Memory-Spiegel)');
ok(mig.lsLeer, 'Migration hat den localStorage-Key geleert — Quota sofort entlastet');
offline = false;

console.log('— Statische Absicherung —');
const src = await readFile(join(ROOT, 'pm_pruefliste.html'), 'utf8');
ok(/addEventListener\('pagehide', *flushSave\)/.test(src), 'flushSave auf pagehide');
ok(/visibilitychange[\s\S]{0,120}flushSave\(\)/.test(src), 'flushSave auf visibilitychange');
ok(/setInterval\(flushSave/.test(src), 'Backstop-Interval für hängengebliebene Debounce-Saves');
ok(/lokalOk *= *false/.test(src), 'gescheiterter LOKALER Write wird erkannt (Quota), nicht verschluckt');
ok(/function _setSaveStatus/.test(src), 'Speicher-Status-Badge vorhanden');
ok(!/dataUrl *: *du/.test(src), 'kein Foto wird mehr mit dataUrl in den Record geschrieben');
ok(/pendingId *: *pid/.test(src), 'wartende Fotos referenzieren die lokale Warteschlange');
ok(/PR_FOTOQ *= *'gema_pr_fotoq_v1'/.test(src), 'lokale Foto-Warteschlange getrennt vom Datensatz');
ok(/addEventListener\('online'[\s\S]{0,80}prFotoUpload/.test(src), 'Nachsenden bei «online»');
// IndexedDB-Queue (Prüfbericht-Feedback 30.07.2026, Bericht 3)
ok(/indexedDB\.open\('gema_pruefliste_fotoq_v1'/.test(src), 'Queue liegt in IndexedDB (localStorage-Quota entlastet)');
ok(/localStorage\.removeItem\(PR_FOTOQ\)/.test(src), 'Migration leert den alten localStorage-Key');
ok(/return true; *\/\/ Memory-Put kann nicht scheitern/.test(src.replace(/\s+/g, ' ')) || /Memory-Put kann nicht scheitern/.test(src), '_fotoQPut blockiert nie mehr (Memory-Spiegel)');

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
