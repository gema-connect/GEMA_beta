// Storage-Aufraeumen beim Loeschen eines Datensatzes:
//  A) Function storage-delete.js — Sicherheitsgrenzen (JWT, Org, Pfade)
//     als reine Node-Pruefung der Modul-Logik (kein Netlify noetig)
//  B) gema_storage.js im Browser — pathFromUrl, collectFiles (rekursiv),
//     ZIP-Erzeugung (echtes ZIP-Format), deleteFiles-Aufruf, Dialog mit
//     Auflistung + ZIP-Button
//  C) Verdrahtung sd_schadensbericht + sp_dachbericht: Loeschen zeigt die
//     Datei-Anzahl und ruft danach die Loesch-Function mit den Pfaden
//
// Aufruf:  CHROME=<chromium> node scripts/storage_delete_test.mjs
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { extname, join } from 'path';
import { chromium } from 'playwright-core';

const ROOT = process.env.GEMA_ROOT || '/home/user/GEMA_beta';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8893;
const BASE = 'http://localhost:' + PORT;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓', l); } else { fail++; console.log('  ✗', l); } };

// ── A) Function-Logik (Pfad-/Org-Regel) ──────────────────────────
console.log('— A) Function storage-delete: Sicherheitsgrenzen —');
{
  const src = readFileSync(join(ROOT, 'netlify/functions/storage-delete.js'), 'utf8');
  ok(src.includes("require('./_jwt')") && src.includes('requireAuth(event)'), 'JWT-Pflicht (requireAuth)');
  ok(src.includes('SUPABASE_SERVICE_KEY'), 'nutzt den Service-Key (umgeht RLS)');
  ok(/BUCKET\s*=\s*'gema-fotos'/.test(src), 'fest auf den Bucket gema-fotos');
  ok(src.includes('MAX_PATHS'), 'Obergrenze pro Aufruf');
  ok(src.includes("json(501"), 'ohne Service-Key: 501 statt stillem Fehlschlag');

  // pruefePfad aus der Function isolieren und direkt testen
  const m = src.match(/function pruefePfad[\s\S]*?\n}\n/);
  ok(!!m, 'pruefePfad extrahierbar');
  const pruefePfad = new Function(m[0] + '; return pruefePfad;')();
  const ORG = 'org_a';
  ok(pruefePfad('schaden/org_a/x1.jpg', ORG, false) === 'schaden/org_a/x1.jpg', 'eigener Firmen-Ordner erlaubt');
  ok(pruefePfad('dach/org_a/unter/x.png', ORG, false) === 'dach/org_a/unter/x.png', 'Unterordner der eigenen Firma erlaubt');
  ok(pruefePfad('schaden/org_b/x1.jpg', ORG, false) === null, 'fremde Firma abgelehnt');
  ok(pruefePfad('schaden/org_b/x1.jpg', ORG, true) === 'schaden/org_b/x1.jpg', 'GEMA-Admin darf firmenübergreifend');
  ok(pruefePfad('../../etc/passwd', ORG, true) === null, 'Pfad-Ausbruch (..) abgelehnt — auch für Admin');
  ok(pruefePfad('schaden/org_a/../../x', ORG, false) === null, '.. mitten im Pfad abgelehnt');
  ok(pruefePfad('/schaden/org_a/x.jpg', ORG, false) === 'schaden/org_a/x.jpg', 'führender / wird normalisiert');
  ok(pruefePfad('schaden/org_a', ORG, false) === null, 'zu kurzer Pfad (Ordner statt Datei) abgelehnt');
  ok(pruefePfad('schaden/org_a/x.jpg?x=1', ORG, false) === null, 'Query-Anhang abgelehnt');
  ok(pruefePfad('schaden/org_a/x .jpg', ORG, false) === null, 'Leerzeichen/Sonderzeichen abgelehnt');
  ok(pruefePfad('pruefliste/obj_1/x.jpg', ORG, false) === null, 'fremdes Pfadschema (objektId) bewusst nicht löschbar');
  ok(pruefePfad(null, ORG, false) === null && pruefePfad(42, ORG, false) === null, 'Nicht-Strings abgelehnt');

  const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
  ok(toml.includes('/api/storage-delete'), 'netlify.toml: Redirect eingetragen');
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  ok(sw.includes("'gema-v369'"), 'sw.js: Cache-Version v369');
}

// ── Server + Mocks ───────────────────────────────────────────────
const server = createServer(async (req, res) => {
  try {
    let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
    const d = await readFile(join(ROOT, p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(d);
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(PORT, r));

const store = new Map();          // gema_data
const delCalls = [];              // Aufrufe an /api/storage-delete
const SB = 'https://fjhbqjvaygvhievjgdtm.supabase.co';
const PUB = SB + '/storage/v1/object/public/gema-fotos/';
// 1x1-PNG als Nutzlast für den ZIP-Test
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function handleSb(route) {
  const req = route.request(), url = decodeURIComponent(req.url()), method = req.method();
  if (url.indexOf('/storage/v1/object/public/') >= 0) {
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_B64, 'base64') });
  }
  const mk = (url.match(/module_key=eq\.([^&]+)/) || [])[1] || '';
  if (method === 'GET') {
    const dkLike = (url.match(/data_key=like\.([^&]+)/) || [])[1];
    const rows = [];
    for (const [k, v] of store) {
      const i = k.indexOf('|'); const m = k.slice(0, i), d = k.slice(i + 1);
      if (m !== mk) continue;
      if (dkLike) { const pre = dkLike.replace(/\*$/, ''); if (!d.startsWith(pre)) continue; }
      rows.push({ data_key: d, payload: v });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  }
  if (method === 'POST') {
    let body = []; try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
    if (!Array.isArray(body)) body = [body];
    body.forEach(r => { if (r && r.module_key && r.data_key) store.set(r.module_key + '|' + r.data_key, r.payload || {}); });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
  }
  if (method === 'DELETE') {
    const dk = (url.match(/data_key=eq\.([^&]+)/) || [])[1];
    if (mk && dk) store.delete(mk + '|' + dk);
    return route.fulfill({ status: 204, body: '' });
  }
  return route.fulfill({ contentType: 'application/json', body: '{}' });
}

const FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ iat: now, exp: now + 30 * 86400, uid: 'u_a', org: 'org_a', role: 'authenticated' }) + '.sig';
}
const ORG = { id: 'org_a', name: 'T AG', kategorie: 'sanitaerplaner', kategorien: ['sanitaerplaner'], admins: ['u_a'], active: true };
const USERS = [{ id: 'u_a', username: 'a@t.ch', name: 'Anna Muster', roleIds: ['role_admin'], orgId: 'org_a', active: true, profile: { email: 'a@t.ch' } }];

const browser = await chromium.launch({ executablePath: CHROME });
async function seite(path, extraLs) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.indexOf('/api/storage-delete') >= 0) {
      let b = {}; try { b = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
      delCalls.push({ paths: b.paths || [], auth: route.request().headers()['authorization'] || '' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, geloescht: (b.paths || []).length }) });
    }
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0 || u.indexOf('/storage/v1/') >= 0) return handleSb(route);
    if (u.indexOf('/api/') >= 0 || u.indexOf('/.netlify/') >= 0) return route.fulfill({ contentType: 'application/json', body: '{}' });
    return route.abort();
  });
  await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); },
    Object.assign({
      gema_orgs_v1: [ORG], gema_users_v1: USERS,
      gema_session_v1: { userId: 'u_a', expires: FUTURE, token: jwt() },
      gema_coachmarks_done_sd_schadensbericht: '1', gema_coachmarks_done_sp_dachbericht: '1'
    }, extraLs || {}));
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return { ctx, page };
}

// ── B) Client-Helper ─────────────────────────────────────────────
console.log('— B) gema_storage.js: Sammler, ZIP, Löschen —');
{
  const { ctx, page } = await seite('/sd_schadensbericht.html');
  const r = await page.evaluate((pub) => {
    // Realistischer Record: Fotos in mehreren Phasen, Messwert-Beleg,
    // Base64-Foto (darf NICHT mitgezählt werden), fremde URL, Duplikat
    const rec = {
      id: 's1', titel: 'Wasserschaden Bad',
      zustandsanalyse: { fotos: [{ url: pub + 'schaden/org_a/a1.jpg', kommentar: 'Wand links' },
                                  { dataUrl: 'data:image/jpeg;base64,XXX', kommentar: 'nur lokal' }] },
      trocknung: {
        fotos: [{ url: pub + 'schaden/org_a/b1.png', kommentar: 'Bad EG' }],
        messpunkte: [{ name: 'MP1', messungen: [{ foto: pub + 'schaden/org_a/m1.jpg', wert: 80 },
                                                 { foto: pub + 'schaden/org_a/a1.jpg', wert: 70 }] }]
      },
      abschluss: { fotos: [{ url: 'https://fremd.example/bild.jpg', kommentar: 'extern' }] },
      notiz: 'kein Bild hier'
    };
    const files = GemaStorage.collectFiles(rec);
    return {
      n: files.length,
      pfade: files.map(f => f.path).sort(),
      labels: files.map(f => f.label),
      exts: files.map(f => f.ext).sort(),
      pathOk: GemaStorage.pathFromUrl(pub + 'schaden/org_a/a1.jpg'),
      pathProxy: GemaStorage.pathFromUrl('http://x/sb/storage/v1/object/public/gema-fotos/dach/org_a/z.png'),
      pathFremd: GemaStorage.pathFromUrl('https://fremd.example/bild.jpg'),
      pathLeer: GemaStorage.pathFromUrl(null)
    };
  }, PUB);
  ok(r.n === 3, 'genau 3 Storage-Dateien gefunden (Duplikat, Base64 und fremde URL zählen nicht) — ' + r.n);
  ok(JSON.stringify(r.pfade) === JSON.stringify(['schaden/org_a/a1.jpg', 'schaden/org_a/b1.png', 'schaden/org_a/m1.jpg']), 'Pfade korrekt über alle Phasen hinweg gesammelt');
  ok(r.labels.indexOf('Wand links') >= 0 && r.labels.indexOf('MP1') >= 0, 'Beschriftung aus dem umgebenden Objekt übernommen');
  ok(JSON.stringify(r.exts) === JSON.stringify(['jpg', 'jpg', 'png']), 'Dateiendungen erkannt');
  ok(r.pathOk === 'schaden/org_a/a1.jpg', 'pathFromUrl: Public-URL → Pfad');
  ok(r.pathProxy === 'dach/org_a/z.png', 'pathFromUrl: erkennt auch den /sb-Proxy-Weg');
  ok(r.pathFremd === null && r.pathLeer === null, 'pathFromUrl: fremde URL und null ergeben null');

  // ZIP wirklich erzeugen und die Bytes prüfen
  const zip = await page.evaluate(async (pub) => {
    const files = [
      { path: 'schaden/org_a/a1.jpg', url: pub + 'schaden/org_a/a1.jpg', label: 'Wand links', ext: 'jpg' },
      { path: 'schaden/org_a/b1.png', url: pub + 'schaden/org_a/b1.png', label: 'Bad EG', ext: 'png' }
    ];
    let last = null;
    const urls = [];
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = function (b) { window.__zipBlob = b; return origCreate.call(URL, b); };
    const res = await GemaStorage.zipDownload(files, 'Test Bericht', (f, t) => { last = f + '/' + t; });
    const buf = new Uint8Array(await window.__zipBlob.arrayBuffer());
    const sig = [buf[0], buf[1], buf[2], buf[3]];
    const txt = new TextDecoder().decode(buf);
    return { res, last, size: buf.length, sig, hatName1: txt.indexOf('01_Wand links.jpg') >= 0, hatName2: txt.indexOf('02_Bad EG.png') >= 0, eocd: buf.length >= 22 && buf[buf.length - 22] === 0x50 && buf[buf.length - 21] === 0x4b };
  }, PUB);
  ok(zip.res.ok && zip.res.dabei === 2, 'ZIP mit beiden Dateien erzeugt');
  ok(JSON.stringify(zip.sig) === JSON.stringify([0x50, 0x4b, 0x03, 0x04]), 'gültige ZIP-Signatur (PK\\x03\\x04)');
  ok(zip.eocd, 'End-of-Central-Directory am Dateiende');
  ok(zip.hatName1 && zip.hatName2, 'Dateien nummeriert + sprechend benannt');
  ok(zip.last === '2/2', 'Fortschritts-Rückmeldung läuft');

  const del = await page.evaluate(() => GemaStorage.deleteFiles([
    { path: 'schaden/org_a/a1.jpg' }, { path: 'schaden/org_a/b1.png' }
  ]));
  ok(del.ok && del.geloescht === 2, 'deleteFiles ruft die Function und meldet Erfolg');
  ok(delCalls.length === 1 && delCalls[0].paths.length === 2, 'genau ein Function-Aufruf mit beiden Pfaden');
  ok(/^Bearer /.test(delCalls[0].auth), 'Aufruf trägt das Anmelde-Token');
  ok(page.errs.length === 0, 'keine pageerrors (Helper)');
  await ctx.close();
}

// ── C) Verdrahtung Schadensbericht ───────────────────────────────
console.log('— C) sd_schadensbericht: Löschen zeigt Fotos + räumt auf —');
{
  delCalls.length = 0;
  const rec = {
    id: 'sd_1', orgId: 'org_a', titel: 'Wasserschaden Bad', typ: 'wasserschaden', phase: 'trocknung',
    objektId: 'obj_1', erstelltAm: new Date().toISOString(), erstelltVon: { userId: 'u_a', name: 'Anna Muster' },
    raeume: ['Bad EG'],
    zustandsanalyse: { fotos: [{ url: PUB + 'schaden/org_a/f1.jpg', kommentar: 'Wand links' }, { url: PUB + 'schaden/org_a/f2.jpg', kommentar: 'Decke' }] },
    trocknung: { fotos: [{ url: PUB + 'schaden/org_a/f3.jpg', kommentar: 'Bad EG' }], messpunkte: [], geraete: [] },
    abschluss: { fotos: [{ url: PUB + 'schaden/org_a/f4.jpg', kommentar: 'nachher' }] }
  };
  store.set('schadensbericht|schaden:sd_1', { data: rec, _lm: new Date().toISOString() });
  const { ctx, page } = await seite('/sd_schadensbericht.html', { gema_schadensbericht_v1: [rec] });
  await page.waitForTimeout(900);

  await page.evaluate(() => sdDelete('sd_1'));
  await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => {
    const el = document.querySelector('.gema-dlg-msg');
    const btn = document.querySelector('[data-act="ok"]');
    return { txt: el ? el.textContent : '', zip: !!document.getElementById('gsZipBtn'), cta: btn ? btn.textContent : '' };
  });
  ok(/4\s+Fotos werden mitgelöscht/.test(dlg.txt), 'Dialog nennt die Anzahl Fotos — «' + (dlg.txt.match(/\d+ Fotos werden mitgelöscht/) || [''])[0] + '»');
  ok(dlg.txt.indexOf('Wand links') >= 0 && dlg.txt.indexOf('nachher') >= 0, 'Dialog listet die Fotos mit ihren Kommentaren');
  ok(dlg.zip, 'ZIP-Download-Button im Dialog');
  ok(/4/.test(dlg.cta), 'Bestätigungs-Button nennt die Anzahl — «' + dlg.cta + '»');

  // ZIP-Button klicken: Dialog muss offen bleiben
  await page.click('#gsZipBtn');
  await page.waitForTimeout(700);
  const nochOffen = await page.evaluate(() => !!document.querySelector('[data-act="ok"]'));
  ok(nochOffen, 'ZIP-Download schliesst den Dialog nicht');

  // Abbrechen: nichts passiert
  await page.click('[data-act="cancel"]');
  await page.waitForTimeout(300);
  ok(delCalls.length === 0, 'Abbrechen löscht keine Dateien');
  const nochDa = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_schadensbericht_v1') || '[]').length);
  ok(nochDa === 1, 'Abbrechen behält den Bericht');

  // Jetzt wirklich löschen
  await page.evaluate(() => sdDelete('sd_1'));
  await page.waitForTimeout(400);
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(700);
  const weg = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_schadensbericht_v1') || '[]').length);
  ok(weg === 0, 'Bericht gelöscht');
  ok(delCalls.length === 1, 'genau ein Lösch-Aufruf für die Dateien');
  ok(delCalls.length && delCalls[0].paths.length === 4, '4 Foto-Pfade übergeben — ' + (delCalls[0] ? delCalls[0].paths.length : 0));
  ok(delCalls.length && delCalls[0].paths.every(p => p.indexOf('schaden/org_a/') === 0), 'nur Pfade der eigenen Firma');
  ok(page.errs.length === 0, 'keine pageerrors (Schadensbericht)');
  await ctx.close();
}

// ── D) Verdrahtung Dachbericht ───────────────────────────────────
console.log('— D) sp_dachbericht: Löschen räumt Bilder auf —');
{
  delCalls.length = 0;
  const rec = {
    id: 'd_1', orgId: 'org_a', titel: 'Dachinspektion Musterweg', objektId: 'obj_1',
    erstelltAm: new Date().toISOString(), erstelltVon: { userId: 'u_a', name: 'Anna Muster' },
    dachuebersicht: { dachtyp: 'satteldach', bild: { url: PUB + 'dach/org_a/u1.jpg', kommentar: 'Übersicht' } },
    kapitel: [{ id: 'k1', name: 'Strassenseite', bildGross: { url: PUB + 'dach/org_a/k1.jpg', kommentar: 'Front' },
                bilder: [{ url: PUB + 'dach/org_a/k2.jpg', kommentar: 'Rinne' }], unterkapitel: [] }],
    massnahmen: []
  };
  store.set('dachbericht|dach:d_1', { data: rec, _lm: new Date().toISOString() });
  const { ctx, page } = await seite('/sp_dachbericht.html', { gema_dachbericht_v1: [rec] });
  await page.waitForTimeout(900);

  await page.evaluate(() => delReport('d_1'));
  await page.waitForTimeout(400);
  const txt = await page.evaluate(() => { const el = document.querySelector('.gema-dlg-msg'); return el ? el.textContent : ''; });
  ok(/3\s+Fotos werden mitgelöscht/.test(txt), 'Dialog nennt 3 Bilder');
  ok(txt.indexOf('Dachinspektion Musterweg') >= 0, 'Dialog nennt den Bericht beim Namen');
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(700);
  ok(delCalls.length === 1 && delCalls[0].paths.length === 3, '3 Bild-Pfade zum Löschen übergeben');
  ok(delCalls.length && delCalls[0].paths.every(p => p.indexOf('dach/org_a/') === 0), 'nur Pfade der eigenen Firma');
  ok(page.errs.length === 0, 'keine pageerrors (Dachbericht)');
  await ctx.close();
}

// ── E) Bericht ohne Fotos: schlanker Dialog ──────────────────────
console.log('— E) Bericht ohne Fotos —');
{
  delCalls.length = 0;
  const rec = { id: 'sd_2', orgId: 'org_a', titel: 'Ohne Fotos', typ: 'rohrbruch', phase: 'erfasst', objektId: 'obj_1', erstelltAm: new Date().toISOString(), raeume: [] };
  const { ctx, page } = await seite('/sd_schadensbericht.html', { gema_schadensbericht_v1: [rec] });
  await page.waitForTimeout(900);
  await page.evaluate(() => sdDelete('sd_2'));
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({
    txt: (document.querySelector('.gema-dlg-msg') || {}).textContent || '',
    zip: !!document.getElementById('gsZipBtn'),
    cta: (document.querySelector('[data-act="ok"]') || {}).textContent || ''
  }));
  ok(st.txt.indexOf('mitgelöscht') < 0 && !st.zip, 'ohne Fotos kein Datei-Hinweis, kein ZIP-Button');
  ok(st.cta.trim() === 'Löschen', 'schlichter Bestätigungs-Button — «' + st.cta.trim() + '»');
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(600);
  ok(delCalls.length === 0, 'kein unnötiger Lösch-Aufruf ohne Dateien');
  ok(page.errs.length === 0, 'keine pageerrors (ohne Fotos)');
  await ctx.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
