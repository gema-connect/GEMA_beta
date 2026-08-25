/* Drift-Guard: Screenshots im Feedback-Export laden IMMER.
 *
 * Hintergrund (Bugreport 25.08.2026 «Warum können Screenshots nicht geladen
 * werden»): Der Markdown-Export schrieb die nackte Bucket-URL ins Dokument —
 * obwohl der Dialog seit je «Screenshots als Base64 eingebettet» verspricht.
 * Das stimmte nur, solange die Bilder als Base64 IM Record lagen; seit
 * gema_feedback.js sie in den Bucket auslagert (screenshotUrl), war es ein
 * blosser Link. Wer die .md weitergibt, ohne Netz öffnet oder von einem
 * Gerät aus liest, auf dem supabase.co blockiert ist (Firewall, Werbe-
 * blocker, DNS-Filter, Proxy), sieht kein einziges Bild.
 *
 * Geprüft wird:
 *   A) statisch — Kandidaten-Kette in gema_storage/gema_sync, Einbettung im
 *      Export, kein nackter Link mehr, Fallback am Board-Bild
 *   B) im Browser — ein Screenshot, dessen DIREKTE URL abgelehnt wird
 *      (403, wie im echten Fall), landet über den Same-Origin-Proxy als
 *      data:-URI im Markdown; ein wirklich unerreichbarer wird BENANNT
 *      statt als toter Link dazustehen; Gegenprobe, dass der direkte Weg
 *      wirklich scheiterte
 *
 * Aufruf: CHROME=<chromium> node scripts/feedback_screenshots_export_test.mjs
 */
import fs from 'fs';

let ok = 0, fail = 0;
const T = (name, cond, info) => {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  → ' + info : '')); }
};

const SYNC = fs.readFileSync('gema_sync.js', 'utf8');
const STO  = fs.readFileSync('gema_storage.js', 'utf8');
const BET  = fs.readFileSync('sys_beta.html', 'utf8');

console.log('\n── A1) Beide Verbindungswege sind abfragbar ──');
T('gema_sync exportiert sbBasen()', /sbBasen:\s*function/.test(SYNC));
T('sbBasen liefert den aktiven Weg zuerst', /var out = \[_sbBase\(\)\];/.test(SYNC));
T('… und den jeweils anderen dazu', /_sbProxy \? SB_URL : /.test(SYNC));

console.log('\n── A2) Kandidaten-Kette + Base64-Loader in gema_storage ──');
T('urlKandidaten vorhanden', /function urlKandidaten\(/.test(STO));
T('… und exportiert', /urlKandidaten:\s*urlKandidaten/.test(STO));
T('fetchDataUrl vorhanden', /function fetchDataUrl\(/.test(STO));
T('… und exportiert', /fetchDataUrl:\s*fetchDataUrl/.test(STO));
T('data:-URI wird unverändert durchgereicht',
  /if\(url\.indexOf\('data:'\) === 0\) return Promise\.resolve\(url\);/.test(STO));
T('erst wenn ALLE Wege scheitern, wird abgelehnt',
  /throw letzter \|\| new Error\('nicht erreichbar'\);/.test(STO));
T('zipDownload nutzt dieselbe Kette (gleiche Fehlerklasse)',
  /function _fetchBytes\(/.test(STO) && /_fetchBytes\(f\.url\)/.test(STO));
T('Kandidaten hängen am Pfad, nicht am Bucket-Namen',
  /indexOf\('\/storage\/v1\/'\)/.test(STO));

console.log('\n── A3) Der Export bettet wirklich ein ──');
T('gema_storage.js ist auf sys_beta geladen', /<script src="gema_storage\.js"><\/script>/.test(BET));
T('Screenshot-Cache existiert', /var _exShotCache = \{\}/.test(BET));
T('_exShotsLaden holt die Bilder', /function _exShotsLaden\(/.test(BET));
T('… über GemaStorage.fetchDataUrl', /GemaStorage\.fetchDataUrl\(q\)/.test(BET));
T('KEIN nackter Link mehr im Markdown',
  !/'!\[Screenshot\]\(' \+ shotQ \+ '\)'/.test(BET),
  'der Export schreibt wieder die rohe URL');
T('eingebettet wird die data:-URI', /'!\[Screenshot\]\(' \+ cache\.data \+ '\)'/.test(BET));
T('Fehlschlag wird BENANNT (No-silent-Regel)',
  /konnte nicht eingebettet werden/.test(BET) && /Direktlink/.test(BET));
T('Download wartet auf die Bilder',
  /function _exFertigStellen\(/.test(BET)
  && /_exFertigStellen\(function\(\)\{ _downloadExportJetzt\(\); \}\)/.test(BET));
T('… und Kopieren ebenso', /_exFertigStellen\(function\(\)\{ _copyExportJetzt\(\); \}\)/.test(BET));
T('bereits geladene Bilder blockieren die Zwischenablage nicht (synchroner Weg)',
  /if\(!withSs \|\| _exShotsFertig\(filtered\)\)\{ cb\(\); return; \}/.test(BET));
T('Statistik weist eingebettet/nicht ladbar aus',
  /eingebettet/.test(BET) && /nicht ladbar/.test(BET));

console.log('\n── A4) Auch im Board lädt das Bild oder sagt warum nicht ──');
T('Board-Bild hat einen Fallback', /onerror="fbShotFallback\(this\)"/.test(BET));
T('fbShotFallback probiert die anderen Wege',
  /window\.fbShotFallback = function/.test(BET) && /GemaStorage\.urlKandidaten\(quelle\)\.slice\(1\)/.test(BET));
T('… und benennt den Ausfall statt ein kaputtes Bild zu lassen',
  /Screenshot nicht erreichbar/.test(BET));

/* ── B) Browser ─────────────────────────────────────────────────────── */
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) { }
if (!chromium || !process.env.CHROME) {
  console.log('\n⏭  Browser-Teil übersprungen (playwright-core/CHROME fehlt) — nie still: Teil A lief.');
} else {
  const { startServer, BASE, seed } = await import('./rolematrix_harness.mjs');

  // 1×1-JPEG (Base64) als Testbild.
  const JPG_B64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
    + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAA'
    + 'AAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  const JPG_BYTES = Buffer.from(JPG_B64, 'base64');

  const DIREKT_HOST = 'https://fjhbqjvaygvhievjgdtm.supabase.co';
  const PFAD_OK   = '/storage/v1/object/public/gema-fotos/feedback/org_test/erreichbar.jpg';
  const PFAD_TOT  = '/storage/v1/object/public/gema-fotos/feedback/org_test/verschwunden.jpg';

  let direktVersuche = 0, proxyVersuche = 0;

  const FEEDBACK = [
    { ts: '25.08.26, 09:00', author: 'Sandro Caso', text: 'Mit Screenshot — muss im Export sichtbar sein',
      type: 'fehler', cStatus: 'offen', umsetzen: true, screenshotUrl: DIREKT_HOST + PFAD_OK },
    { ts: '25.08.26, 09:05', author: 'Sandro Caso', text: 'Screenshot ist weg — muss BENANNT werden',
      type: 'fehler', cStatus: 'offen', umsetzen: true, screenshotUrl: DIREKT_HOST + PFAD_TOT }
  ];

  const DB = new Map();
  DB.set('gema_beta_pruefungen_v1|feedback_werkzeug', { v: FEEDBACK });

  async function mock(ctx) {
    await ctx.route('**/*', async route => {
      const req = route.request(), u = req.url(), m = req.method();

      // Bilder: der DIREKTE Weg ist blockiert (403 — genau der reale Fall),
      // der Same-Origin-Proxy /sb liefert. Ein Pfad existiert gar nicht.
      if (u.indexOf('/storage/v1/object/public/') >= 0) {
        const istProxy = u.indexOf('/sb/storage/') >= 0;
        if (istProxy) proxyVersuche++; else direktVersuche++;
        if (u.indexOf('verschwunden.jpg') >= 0) {
          return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
        }
        if (!istProxy) return route.fulfill({ status: 403, contentType: 'text/plain', body: 'blocked' });
        return route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG_BYTES });
      }

      if (u.startsWith(BASE)) return route.continue();

      if (u.includes('/rest/v1/gema_data')) {
        if (m === 'GET') {
          const url = new URL(u);
          const mk = (url.searchParams.get('module_key') || '').replace(/^eq\./, '');
          const dk = url.searchParams.get('data_key') || '';
          const out = [];
          for (const [k, v] of DB) {
            const i = k.indexOf('|'), mm = k.slice(0, i), dd = k.slice(i + 1);
            if (mm !== mk) continue;
            if (dk.startsWith('like.')) { const pre = dk.slice(5).replace(/[*%]$/, ''); if (!dd.startsWith(pre)) continue; }
            else if (dk.startsWith('eq.')) { if (dd !== dk.slice(3)) continue; }
            else if (dk.startsWith('in.')) {
              const l = dk.slice(3).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
              if (!l.includes(dd)) continue;
            }
            out.push({ module_key: mm, data_key: dd, payload: v });
          }
          return route.fulfill({ status: 200, contentType: 'application/json',
            headers: { 'content-range': '0-' + Math.max(0, out.length - 1) + '/' + out.length },
            body: JSON.stringify(out) });
        }
        return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
      if (u.includes('/.netlify/functions/') || u.includes('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      if (u.includes('supabase') || u.includes('/rest/v1/') || u.includes('/sb/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.abort();
    });
  }

  const srv = await startServer();
  const br = await chromium.launch({ executablePath: process.env.CHROME });
  const ctx = await br.newContext();
  await mock(ctx);
  await ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seed(['role_admin']));

  const page = await ctx.newPage();
  await page.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  console.log('\n── B1) Die beiden Testpunkte sind im Board ──');
  const geladen = await page.evaluate(() => (typeof getFeedback === 'function') ? (getFeedback('werkzeug') || []).length : -1);
  T('Feedback ist geladen', geladen === 2, 'geladen: ' + geladen);

  console.log('\n── B2) Export bettet die Bilder als Base64 ein ──');
  await page.evaluate(() => { window.openExportModal(); });
  // Vorschau + Bild-Ladelauf abwarten
  await page.waitForFunction(() => {
    const h = window._exHooks; if (!h) return false;
    return h.fertig(h.gefiltert());
  }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);

  const r = await page.evaluate(() => ({
    md: document.getElementById('exPreview').value,
    stats: document.getElementById('exStats').textContent,
    cache: Object.entries(window._exHooks.cache()).map(([k, v]) => ({
      k: k.slice(-22), hatData: !!v.data, fehler: v.fehler || ''
    }))
  }));

  const dataTreffer = (r.md.match(/!\[Screenshot\]\(data:image\//g) || []).length;
  T('genau EIN Bild ist eingebettet', dataTreffer === 1, 'gefunden: ' + dataTreffer);
  T('die Einbettung trägt echte Base64-Daten', /!\[Screenshot\]\(data:image\/jpeg;base64,[A-Za-z0-9+/=]{40,}\)/.test(r.md));
  T('KEIN nackter http-Link als Bild im Markdown',
    !/!\[Screenshot\]\(https?:/.test(r.md),
    (r.md.match(/!\[Screenshot\]\(https?:[^)]{0,60}/) || [''])[0]);

  console.log('\n── B3) Gegenprobe: der direkte Weg war wirklich blockiert ──');
  T('der direkte Weg wurde versucht', direktVersuche > 0, 'Versuche: ' + direktVersuche);
  T('… und über den Proxy nachgeholt', proxyVersuche > 0, 'Proxy-Versuche: ' + proxyVersuche);

  console.log('\n── B4) Was nicht ladbar ist, wird BENANNT ──');
  T('Fehlermeldung steht im Markdown', /konnte nicht eingebettet werden/.test(r.md), r.md.slice(0, 200));
  T('… mit Direktlink als Rückfallebene', /Direktlink[^\n]*verschwunden\.jpg/.test(r.md));
  T('… und nicht als (toter) Bild-Link', !/!\[Screenshot\]\([^)]*verschwunden/.test(r.md));
  T('Cache hält Erfolg UND Fehlschlag getrennt',
    r.cache.filter(c => c.hatData).length === 1 && r.cache.filter(c => c.fehler).length === 1,
    JSON.stringify(r.cache));

  console.log('\n── B5) Die Statistik sagt die Wahrheit ──');
  T('nennt die eingebetteten Bilder', /1 eingebettet/.test(r.stats), r.stats);
  T('nennt den nicht ladbaren', /1 nicht ladbar/.test(r.stats), r.stats);
  T('kein «wird noch geladen»-Platzhalter mehr im Markdown', !/wird noch geladen/.test(r.md));

  console.log('\n── B6) Board: Bild fällt auf den anderen Weg zurück ──');
  const board = await page.evaluate(async () => {
    // Panel aufklappen, damit die Karten wirklich gerendert sind
    const row = document.querySelector('tr[data-mod="werkzeug"]') || null;
    if (typeof toggleFbPanel === 'function') { try { toggleFbPanel('werkzeug'); } catch (e) {} }
    await new Promise(r => setTimeout(r, 600));
    const imgs = [...document.querySelectorAll('.fb-shot img')];
    const raus = { anzahl: imgs.length, kandidaten: -1, hinweis: false };
    if (imgs.length) {
      const i = imgs[0];
      raus.kandidaten = (typeof GemaStorage !== 'undefined' && GemaStorage.urlKandidaten)
        ? GemaStorage.urlKandidaten(i.getAttribute('src')).length : -1;
    }
    // Fallback bis zum Ende durchspielen: ein Bild, das nirgends existiert
    const test = document.createElement('div');
    test.className = 'fb-shot';
    test.innerHTML = '<img src="' + location.origin + '/storage/v1/object/public/gema-fotos/feedback/org_test/verschwunden.jpg">';
    document.body.appendChild(test);
    const img = test.querySelector('img');
    for (let n = 0; n < 6; n++) { window.fbShotFallback(img); if (!img.isConnected) break; }
    raus.hinweis = /Screenshot nicht erreichbar/.test(document.body.innerHTML);
    return raus;
  });
  T('Karten tragen Screenshots', board.anzahl >= 1, JSON.stringify(board));
  T('es gibt mehr als einen Weg zum Bild', board.kandidaten >= 2, 'Kandidaten: ' + board.kandidaten);
  T('nach allen Fehlversuchen steht der Hinweis statt eines kaputten Bildes', board.hinweis, JSON.stringify(board));

  await br.close(); srv.close();
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
