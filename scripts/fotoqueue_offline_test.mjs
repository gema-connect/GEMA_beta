// gema_fotoqueue.js — geteilte Offline-Foto-Warteschlange (IndexedDB)
//
// Prüfbericht-Feedback 30.07.2026, Bericht 3: «offline nur 4 Kamera- +
// 2 Mediathek-Fotos, dann blockiert es» — Base64 im Record sprengte das
// localStorage-Quota. Der Kanon aus pm_pruefliste (Record trägt nur ein
// pendingId, Bild in IndexedDB, Nachsende-Runner) ist als geteilter Helper
// generalisiert und in 6 Bericht-Module verdrahtet:
//   sd_schadensbericht (Scope 'schaden')  · sp_dachbericht ('dach')
//   pm_abnahme ('abnahme')                · pm_regierapport ('regierapport')
//   pm_stunden ('stunden' + 'regierapport') · pm_planablage ('planablage')
//
// Drei Schichten:
//   A) Helper-Unit im echten Chromium (echte IndexedDB): put/get/src/srcStr,
//      Scope-Isolation, Persistenz über Reload, materialize, Upload-Runner
//      inkl. 48-h-Waisen-Schutz.
//   B) End-to-End am Schadensbericht: Foto OFFLINE erfassen → Record klein
//      (kein Base64), Bild überlebt den Reload, wird online automatisch in
//      den Bucket nachgesendet (Record trägt danach die URL).
//   C) Statische Drift-Guards: Include + Scope in allen 6 Modulen, sw.js.
//
// Aufruf:  CHROME=<chromium> node scripts/fotoqueue_offline_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8934;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// Synthetische Seite für die Helper-Unit (nur der Helper, echte IndexedDB)
const FQ_PAGE = '<!doctype html><html><head><meta charset="utf-8"><script src="gema_fotoqueue.js"></script></head><body>fq</body></html>';

const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0];
    if (p === '/__fq.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(FQ_PAGE); }
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
const ORG = { id: 'org_t', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u1'], active: true, settings: {} };
const USERS = [{ id: 'u1', username: 'a@t.ch', name: 'User A', roleIds: ['role_admin'], orgId: 'org_t', active: true, profile: { email: 'a@t.ch' } }];
const SESSION = { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjQwMDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwidWlkIjoidTEiLCJvcmciOiJvcmdfdCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIn0.testsig', userId: 'u1', expires: FUTURE };
const JPG_1PX = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const TINY = 'data:image/jpeg;base64,' + JPG_1PX.toString('base64');

// In-Memory-PostgREST + Bucket, mit Offline-Schalter
const cloud = new Map();
let offline = false, bucket = [];
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
  if (u.indexOf('/storage/v1/') >= 0) {
    if (offline) return route.abort('failed');
    if (req.method() === 'POST') {
      const m = /\/object\/([^?]+)/.exec(u);
      const pfad = m ? decodeURIComponent(m[1]) : 'x';
      bucket.push(pfad);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: pfad }) });
    }
    // GemaStorage verifiziert die Public-URL als <img> — echtes Bild liefern
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG_1PX });
  }
  if (u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('supabase') >= 0) {
    if (offline) return route.abort('failed');
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

// ═════════════════ A) Helper-Unit (echte IndexedDB) ═════════════════
console.log('— A) Helper: put/get/src, Scope-Isolation —');
let page = await ctx.newPage();
const errsA = []; page.on('pageerror', e => errsA.push(e.message));
await page.goto(BASE + '/__fq.html', { waitUntil: 'load' });
await page.waitForTimeout(200);

const a1 = await page.evaluate((tiny) => {
  const out = {};
  out.verfuegbar = GemaFotoQueue.verfuegbar();
  const q = GemaFotoQueue.scope('unittest');
  const pid = q.put(tiny);
  out.pidForm = /^pf_[a-z0-9]+_[a-z0-9]+$/.test(pid);
  out.getSofort = q.get(pid) === tiny;                       // synchron, vor IDB-Ack
  out.srcUrlGewinnt = q.src({ url: 'https://x/y.jpg', pendingId: pid }) === 'https://x/y.jpg';
  out.srcPending = q.src({ pendingId: pid }) === tiny;
  out.srcDataUrl = q.src({ dataUrl: 'data:image/f' }) === 'data:image/f';
  out.srcFremd = q.src({ pendingId: 'pf_zzz_nix' }) === GemaFotoQueue.PLATZHALTER;   // fremdes Gerät
  out.srcStr = q.srcStr('idbfoto:' + pid) === tiny;
  out.srcStrUrl = q.srcStr('https://x/y.jpg') === 'https://x/y.jpg';
  out.wartet = q.wartet({ pendingId: pid }) && !q.wartet({ url: 'u', pendingId: pid }) && !q.wartet({ dataUrl: 'd' });
  out.isolation = GemaFotoQueue.scope('anderer').get(pid) === '';
  out.ids = q.ids().indexOf(pid) >= 0;
  window.__pid = pid;
  return out;
}, TINY);
ok(errsA.length === 0, 'keine pageerrors (' + errsA.slice(0, 2).join(' | ') + ')');
ok(a1.verfuegbar, 'verfuegbar() erkennt IndexedDB');
ok(a1.pidForm, 'put() liefert pendingId im pf_<ts36>_<rand>-Format');
ok(a1.getSofort, 'get() liest SYNCHRON aus dem Memory-Spiegel (Erfassung blockiert nie)');
ok(a1.srcUrlGewinnt, 'src(): url gewinnt immer');
ok(a1.srcPending, 'src(): pendingId löst zum lokalen Bild auf');
ok(a1.srcDataUrl, 'src(): dataUrl-Altdaten bleiben lesbar');
ok(a1.srcFremd, 'src(): unbekanntes pendingId → Platzhalter (fremdes Gerät, kein totes Bild)');
ok(a1.srcStr, 'srcStr(): idbfoto:<pid> löst auf');
ok(a1.srcStrUrl, 'srcStr(): normale URL läuft unverändert durch');
ok(a1.wartet, 'wartet() nur bei pendingId ohne url');
ok(a1.isolation, 'Scopes sind isoliert (anderes Modul sieht das Bild nicht)');
ok(a1.ids, 'ids() listet den wartenden Eintrag');

console.log('— A) Persistenz über Reload (IndexedDB, nicht nur Speicher) —');
const pidA = await page.evaluate(() => window.__pid);
await page.waitForTimeout(400);                              // IDB-Write ankommen lassen
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(500);
const a2 = await page.evaluate((args) => {
  const q = GemaFotoQueue.scope('unittest');
  return q.init().then(() => ({
    daNachReload: q.get(args.pid) === args.tiny,
    andererLeer: GemaFotoQueue.scope('anderer').get(args.pid) === ''
  }));
}, { pid: pidA, tiny: TINY });
ok(a2.daNachReload, 'Bild überlebt den Reload (liegt in IndexedDB, nicht localStorage)');
ok(a2.andererLeer, 'Scope-Isolation gilt auch nach dem Reload');

console.log('— A) materialize für Exporte —');
const a3 = await page.evaluate((args) => {
  const q = GemaFotoQueue.scope('unittest');
  const rec = {
    titel: 'R', fotos: [{ pendingId: args.pid, ts: 't1' }, { url: 'https://x/a.jpg' }],
    mess: [{ foto: 'idbfoto:' + args.pid }, { foto: 'https://x/b.jpg' }],
    tief: { liste: ['idbfoto:' + args.pid, 'normal'] },
    fremd: [{ pendingId: 'pf_zzz_nix' }]
  };
  const m = q.materialize(rec);
  return {
    obj: m.fotos[0].dataUrl === args.tiny && !m.fotos[0].pendingId,
    urlBleibt: m.fotos[1].url === 'https://x/a.jpg',
    str: m.mess[0].foto === args.tiny && m.mess[1].foto === 'https://x/b.jpg',
    tiefArr: m.tief.liste[0] === args.tiny && m.tief.liste[1] === 'normal',
    fremdPlatzhalter: m.fremd[0].dataUrl === GemaFotoQueue.PLATZHALTER,
    originalUnberuehrt: !!rec.fotos[0].pendingId && !rec.fotos[0].dataUrl
  };
}, { pid: pidA, tiny: TINY });
ok(a3.obj, 'materialize: pendingId-Objekt → dataUrl');
ok(a3.urlBleibt, 'materialize: url-Fotos bleiben unangetastet');
ok(a3.str, 'materialize: idbfoto:-String → dataUrl, URLs bleiben');
ok(a3.tiefArr, 'materialize: verschachtelte Arrays werden durchlaufen');
ok(a3.fremdPlatzhalter, 'materialize: fehlendes Bild → Platzhalter statt totem Verweis');
ok(a3.originalUnberuehrt, 'materialize: der ORIGINAL-Record wird nie re-bloatet');

console.log('— A) Upload-Runner + 48-h-Waisen-Schutz —');
const a4 = await page.evaluate((args) => {
  const q = GemaFotoQueue.scope('unittest');
  // GemaStorage-Fake: zeichnet Pfade auf, liefert URLs
  const calls = [];
  window.GemaStorage = {
    isConfigured: () => true,
    uploadDataUrl: (du, pfad) => { calls.push(pfad); return Promise.resolve({ url: 'https://bucket/' + pfad + '/f' + calls.length + '.jpg' }); }
  };
  const rec = { fotos: [{ pendingId: args.pid, ts: 't1' }] };
  // Waisen: jung (bleibt) + alt (>48 h, wird abgeräumt)
  const jung = q.put('data:image/jpeg;base64,AA==');
  const altTs = (Date.now() - 60 * 3600 * 1000).toString(36);
  const altPid = 'pf_' + altTs + '_wxyz';
  // alten Eintrag direkt in den Spiegel + IDB legen (put würde frische ts vergeben)
  return q.init().then(() => {
    // put + Key-Umbenennung simulieren: put liefert frische pid — wir nutzen
    // den internen Weg über eine zweite put + Map-Zugriff nicht; stattdessen
    // prüft der Alt-Fall über einen eigenen Scope mit manipulierter pid.
    const q2 = GemaFotoQueue.scope('unittest');
    // direkter Spiegel-Trick: über put + ids ist die pid nicht wählbar,
    // darum legen wir den Alt-Eintrag als «jung» an und testen das
    // Alters-Parsing separat (unten, altPid via reinem Regex-Pfad).
    let fertigN = 0;
    return q.upload({
      pfad: 'unittest/org_t',
      stellen: (pid) => {
        const out = [];
        rec.fotos.forEach(f => { if (f.pendingId === pid && !f.url) out.push(url => { f.url = url; delete f.pendingId; }); });
        return out;   // jung-Waise: leere Liste
      },
      fertig: (n) => { fertigN = n; }
    }).then(n => ({
      n, fertigN, calls,
      urlGesetzt: !!rec.fotos[0].url && !rec.fotos[0].pendingId,
      pidWeg: q.get(args.pid) === '',
      jungBleibt: q.get(jung) !== '',           // Waise <48 h wird NICHT gelöscht
      altParse: (Date.now() - parseInt(altPid.split('_')[1], 36)) > 48 * 3600 * 1000
    }));
  });
}, { pid: pidA });
ok(a4.n === 1 && a4.fertigN === 1, 'Runner meldet genau 1 Upload (n=' + a4.n + ')');
ok(a4.urlGesetzt, 'Setter hat die Bucket-URL in den Record geschrieben');
ok(a4.pidWeg, 'Queue-Eintrag ist nach dem Upload gelöscht');
ok(a4.calls.length === 1 && a4.calls[0] === 'unittest/org_t', 'Upload lief mit dem Modul-Pfad');
ok(a4.jungBleibt, 'Waise <48 h bleibt (Schutz für ungespeicherte Dialoge in Zweit-Tabs)');
ok(a4.altParse, 'pid-Zeitstempel (base36) trägt das Alter für den 48-h-Waisen-Check');

// Alter Waisen-Eintrag: über einen frischen Scope mit direkt konstruierter pid
const a5 = await page.evaluate(() => {
  // put mit manipulierter Date.now — so bekommt der Eintrag eine ECHTE alte pid
  const realNow = Date.now;
  Date.now = () => realNow() - 60 * 3600 * 1000;
  const q = GemaFotoQueue.scope('waisentest');
  const altPid = q.put('data:image/jpeg;base64,AA==');
  Date.now = realNow;
  return q.upload({ pfad: 'x/y', stellen: () => [], fertig: () => {} })
    .then(() => ({ altWeg: q.get(altPid) === '' }));
});
ok(a5.altWeg, 'Waise >48 h wird vom Runner abgeräumt (kein IDB-Müllberg)');
await page.close();

// ═════════════ B) End-to-End: Schadensbericht offline ═════════════
console.log('— B) Schadensbericht: Foto offline erfassen —');
const SCHADEN = {
  id: 'sch_test1', typ: 'wasserschaden', titel: 'Wasserschaden Test', objektId: 'obj1',
  phase: 'analyse', beschreibung: '', ursache: '', raeume: ['Bad'], orgId: 'org_t',
  versicherung: {}, erstelltAm: '2026-07-01', erstelltVon: { userId: 'u1', name: 'User A' },
  zustandsanalyse: { leckortung: '', schadenausmass: '', massnahmen: [], fotos: [], abgeschlossenAm: null }
};
const OBJEKTE = { objekte: [{ id: 'obj1', name: 'Testobjekt', strasse: 'Weg 1', plz: '4000', ort: 'Basel', status: 'aktiv', orgId: 'org_t' }], beteiligte: [], activeObjektId: '' };
cloud.set('schadensbericht|schaden:sch_test1', { module_key: 'schadensbericht', data_key: 'schaden:sch_test1', payload: { data: SCHADEN }, last_modified: new Date().toISOString() });

const seed = {
  gema_orgs_v1: JSON.stringify([ORG]),
  gema_users_v1: JSON.stringify(USERS),
  gema_session_v1: JSON.stringify(SESSION),
  gema_objekte_v1: JSON.stringify(OBJEKTE),
  gema_schadensbericht_v1: JSON.stringify([SCHADEN])
};
await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); }, seed);

async function sdSeite() {
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/sd_schadensbericht.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof sdStorePhoto === 'function' && window._sdQ !== undefined, null, { timeout: 9000 }).catch(() => {});
  await p.waitForTimeout(1200);
  return { p, errs };
}

offline = true;                                  // Baustelle: kein Netz
let { p: sdP, errs: sdErrs } = await sdSeite();
ok(sdErrs.length === 0, 'sd bootet offline ohne pageerrors (' + sdErrs.slice(0, 2).join(' | ') + ')');
const b1 = await sdP.evaluate((tiny) => {
  sdStorePhoto('sch_test1', 'analyse', tiny, 'Leck unter Lavabo', true, 'Bad');
  const s = schaeden.find(x => x.id === 'sch_test1');
  const f = s.zustandsanalyse.fotos[0];
  return {
    pending: !!(f && f.pendingId), dataUrl: !!(f && f.dataUrl),
    roh: JSON.stringify(s).indexOf('data:image') >= 0,
    anzeige: _sdImgSrc(f) === tiny,
    raum: f && f.raum === 'Bad',
    poolRoh: String(localStorage.getItem('gema_schadensbericht_v1')).indexOf('data:image') >= 0
  };
}, TINY);
ok(b1.pending, 'Foto trägt pendingId (kein Base64 im Record)');
ok(!b1.dataUrl && !b1.roh, 'im ganzen Datensatz steckt kein «data:image»');
ok(!b1.poolRoh, 'auch der localStorage-Pool bleibt frei von Base64 (Quota-Schutz)');
ok(b1.anzeige, '_sdImgSrc zeigt das Bild sofort aus der lokalen Queue');
ok(b1.raum, 'Bereichszuordnung (raum) bleibt erhalten');
await sdP.waitForTimeout(600);                   // IDB-Write ankommen lassen
await sdP.close();

console.log('— B) Reload OHNE Netz: Foto bleibt sichtbar —');
({ p: sdP, errs: sdErrs } = await sdSeite());
const b2 = await sdP.evaluate((tiny) => {
  const s = schaeden.find(x => x.id === 'sch_test1');
  const f = s && s.zustandsanalyse.fotos[0];
  return _sdQ.init().then(() => ({
    daNachReload: !!f && !!f.pendingId,
    anzeige: !!f && _sdImgSrc(f) === tiny
  }));
}, TINY);
ok(b2.daNachReload, 'nach Reload offline: pendingId-Foto noch im Record');
ok(b2.anzeige, 'nach Reload offline: Bild kommt aus der IndexedDB (früher: weg/blockiert)');

console.log('— B) Netz zurück: automatischer Upload in den Bucket —');
offline = false; bucket = [];
await sdP.evaluate(() => { window.dispatchEvent(new Event('online')); });
await sdP.waitForTimeout(2500);
await sdP.evaluate(() => { try { return window.GemaSync.flushOutbox(); } catch (e) {} });
await sdP.waitForTimeout(800);
const b3 = await sdP.evaluate(() => {
  const s = schaeden.find(x => x.id === 'sch_test1');
  const f = s.zustandsanalyse.fotos[0];
  return { url: f && f.url, pending: !!(f && f.pendingId), queueLeer: _sdQ.ids().length === 0 };
});
ok(!!b3.url, 'Foto trägt nach dem Reconnect eine Bucket-URL (' + (b3.url || '—') + ')');
ok(!b3.pending, 'pendingId ist nach dem Upload entfernt');
ok(b3.queueLeer, 'lokale Warteschlange ist leer');
ok(bucket.length === 1 && bucket[0].indexOf('schaden/org_t') >= 0, 'Upload liegt unter schaden/<orgId> (' + bucket[0] + ')');
const cloudRec = cloud.get('schadensbericht|schaden:sch_test1');
ok(cloudRec && JSON.stringify(cloudRec.payload.data).indexOf('data:image') < 0, 'in der CLOUD steckt kein Base64');
ok(cloudRec && JSON.stringify(cloudRec.payload.data).indexOf(b3.url) >= 0, 'Cloud-Record trägt die Bucket-URL');
await sdP.close();

// ═════════════ C) Statische Drift-Guards über alle Module ═════════════
console.log('— C) Verdrahtung in allen 6 Modulen + sw.js —');
const MODS = [
  { f: 'sd_schadensbericht.html', scope: "scope('schaden')" },
  { f: 'sp_dachbericht.html', scope: "scope('dach')" },
  { f: 'pm_abnahme.html', scope: "scope('abnahme')" },
  { f: 'pm_regierapport.html', scope: "scope('regierapport')" },
  { f: 'pm_stunden.html', scope: "scope('stunden')" },
  { f: 'pm_planablage.html', scope: "scope('planablage')" }
];
for (const m of MODS) {
  const src = readFileSync(join(ROOT, m.f), 'utf8');
  ok(src.indexOf('gema_fotoqueue.js') >= 0, m.f + ' bindet gema_fotoqueue.js ein');
  ok(src.indexOf(m.scope) >= 0, m.f + ' nutzt GemaFotoQueue.' + m.scope);
  ok(/GemaFotoQueue\.verfuegbar\(\)/.test(src), m.f + ' prüft verfuegbar() (Fallback ohne IndexedDB)');
}
const stSrc = readFileSync(join(ROOT, 'pm_stunden.html'), 'utf8');
ok(stSrc.indexOf("scope('regierapport')") >= 0, 'pm_stunden schreibt Rapport-Fotos in den Regie-Scope (geteilte Queue)');
const swSrc = readFileSync(join(ROOT, 'sw.js'), 'utf8');
ok(swSrc.indexOf('/gema_fotoqueue.js') >= 0, 'sw.js cached gema_fotoqueue.js');
const fqSrc = readFileSync(join(ROOT, 'gema_fotoqueue.js'), 'utf8');
ok(/48\s*\*\s*3600\s*\*\s*1000/.test(fqSrc), 'Helper hat den 48-h-Waisen-Schutz');
// Die Upload-Runner der Module lesen ihren Pool EINMAL pro Lauf (Setter
// mehrerer Fotos desselben Records müssen auf denselben Objekten arbeiten)
ok(/var pool=poolRead\(\);/.test(stSrc), 'pm_stunden-Runner liest den Pool einmal pro Lauf');
const pabSrc = readFileSync(join(ROOT, 'pm_planablage.html'), 'utf8');
ok(/var pool = cached\(LSP\);/.test(pabSrc), 'pm_planablage-Runner liest den Pool einmal pro Lauf');

await browser.close();
server.close();
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + (pass + fail) + ' Checks FEHLGESCHLAGEN' : '✓ Alle ' + pass + ' Checks bestanden'));
process.exit(fail ? 1 : 0);
