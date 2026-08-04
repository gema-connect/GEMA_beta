// Lernmittel-Upload — Bucket-Direktweg + Fortschrittsanzeige (04.08.2026)
//
// Ein Lernmittel ist schnell mehrere MB gross. Zwei Dinge muessen stimmen:
//
//   1) Die Datei geht DIREKT als Datei in den Bucket. uploadDataUrl las sie
//      vorher erst als Base64 ein (+33 %) und dekodierte sie Byte fuer Byte
//      zurueck — bei einem 7-MB-Skript belegt das kurzzeitig gegen 30 MB und
//      dauert auf einem Tablet spuerbar, ohne jeden Nutzen.
//   2) Waehrend des Uploads laeuft eine Fortschrittsanzeige. Ohne sie wirkt
//      die Seite eingefroren und man klickt ein zweites Mal.
//      (Nur XHR kennt Upload-Fortschritt — fetch nicht. Darum XHR.)
//
// Aufruf: CHROME=<chromium> node scripts/schule_lernmittel_upload_test.mjs
import { chromium } from 'playwright-core';
import { startServer, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n, info) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n + (info !== undefined ? ' — ' + JSON.stringify(info) : '')); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const KLASSE = {
  id: 'kl_up', name: 'Upload-Klasse', lehrgang: '', code: 'UP1234', orgId: 'org_test',
  archiviert: false, dozentIds: ['u_test'], studentIds: [], module: []
};

// Supabase-Mock: Klassen-Pool liefern, Storage-PUT protokollieren.
function routen(store) {
  return async route => {
    const req = route.request(); const u = req.url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.indexOf('/storage/v1/object/public/') >= 0) {
      // Verifikations-HEAD/GET nach dem Upload
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: 'ok' });
    }
    if (u.indexOf('/storage/v1/object/') >= 0) {
      store.push({ url: u, method: req.method(), bytes: (req.postDataBuffer() || Buffer.alloc(0)).length, ctype: (req.headers()['content-type'] || '') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (u.indexOf('/.netlify/functions/') >= 0 || u.indexOf('/api/') >= 0)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false }) });
    if (u.indexOf('supabase') >= 0 || u.indexOf('/rest/v1/') >= 0 || u.indexOf('/sb/') >= 0) {
      if (req.method() === 'GET' && u.indexOf('module_key=eq.schule') >= 0)
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ data_key: 'sklasse:kl_up', payload: { data: KLASSE } }]) });
      if (req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: '[]' });
      return route.fulfill({ contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  };
}

try {
  const store = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.route('**/*', routen(store));
  const s = seed(['role_dozent']);
  s['gema_schule_klassen_pool_v1'] = JSON.stringify([KLASSE]);
  await ctx.addInitScript(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, s);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/ab_klassen.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);

  console.log('■ 1: Grosse PDF geht DIREKT als Datei in den Bucket (kein Base64-Umweg)');
  {
    // 7 MB — genau die Groessenordnung eines echten Skripts.
    const MB = 7;
    const r = await page.evaluate(async mb => {
      const bytes = new Uint8Array(mb * 1024 * 1024);
      bytes[0] = 0x25; bytes[1] = 0x50; bytes[2] = 0x44; bytes[3] = 0x46;   // %PDF
      const file = new File([bytes], 'Skript Kaltwasser.pdf', { type: 'application/pdf' });
      const schritte = [];
      const t0 = performance.now();
      const meta = await GemaSchule.uploadDatei(file, 'schule/org_test/lernmittel', {
        maxMb: 10, onProgress: (pct, phase) => schritte.push([pct, phase])
      });
      return { meta: meta, schritte: schritte, ms: Math.round(performance.now() - t0) };
    }, MB);

    ok(!!r.meta.url, 'Meta traegt eine Bucket-URL', r.meta.url);
    ok(r.meta.dataUrl === undefined, 'KEIN Base64 im Record (waere ~9.3 MB)');
    ok(r.meta.size === MB * 1024 * 1024, 'Originalgroesse vermerkt', r.meta.size);

    const put = store.filter(x => x.method === 'POST' && x.url.indexOf('/public/') < 0);
    ok(put.length === 1, 'genau ein Upload-Request', put.length);
    ok(put[0] && put[0].bytes === MB * 1024 * 1024,
      'exakt die Rohbytes gesendet — nicht die um 33 % groessere Base64-Fassung', put[0] && put[0].bytes);
    ok(put[0] && put[0].ctype === 'application/pdf', 'Content-Type application/pdf', put[0] && put[0].ctype);
    ok(put[0] && /\/gema-fotos\/schule\/org_test\/lernmittel\//.test(put[0].url), 'landet im Lernmittel-Pfad', put[0] && put[0].url);

    // Fortschritt: mindestens Start und Abschluss, monoton steigend.
    const pcts = r.schritte.map(x => x[0]);
    ok(r.schritte.length >= 2, 'onProgress wird mehrfach gemeldet', r.schritte.length);
    ok(pcts[0] === 0, 'startet bei 0 %', pcts[0]);
    ok(pcts[pcts.length - 1] === 100, 'endet bei 100 %', pcts[pcts.length - 1]);
    ok(pcts.every((v, i) => i === 0 || v >= pcts[i - 1]), 'Prozentwerte steigen monoton', pcts);
    ok(r.schritte.some(x => x[1] === 'fertig'), 'Schlussphase «fertig» gemeldet');
    ok(r.schritte.every(x => x[0] >= 0 && x[0] <= 100), 'alle Werte zwischen 0 und 100');
  }

  console.log('■ 2: Fortschritts-Overlay ist verdrahtet');
  {
    const el = await page.evaluate(() => {
      const ov = document.getElementById('upOv');
      const H = window._upHooks;
      if (!ov || !H) return null;
      // Zustaende durchspielen wie im echten Upload
      H.open({ name: 'Skript.pdf', size: 7 * 1048576 });
      const auf = getComputedStyle(ov).display;
      const datei = document.getElementById('upDatei').textContent;
      H.set(42, 'upload');
      const mitte = { w: document.getElementById('upFill').style.width, pct: document.getElementById('upPct').textContent, ph: document.getElementById('upPhase').textContent };
      H.set(100, 'pruefen');
      const pruef = { w: document.getElementById('upFill').style.width, ph: document.getElementById('upPhase').textContent };
      H.verkleinern();
      const unbest = document.getElementById('upFill').className;
      H.close();
      return { auf: auf, datei: datei, mitte: mitte, pruef: pruef, unbest: unbest, zu: getComputedStyle(ov).display };
    });
    ok(el && el.auf === 'flex', 'Overlay wird sichtbar', el && el.auf);
    ok(el && /Skript\.pdf/.test(el.datei) && /7,0 MB/.test(el.datei), 'Dateiname + Groesse stehen drin', el && el.datei);
    ok(el && el.mitte.w === '42%' && el.mitte.pct === '42 %', 'Balken folgt dem Prozentwert', el && el.mitte);
    ok(el && /übertragen/.test(el.mitte.ph), 'Phase «wird übertragen»', el && el.mitte.ph);
    ok(el && el.pruef.w === '100%' && /geprüft/.test(el.pruef.ph),
      'nach dem Senden Hinweis auf die Pruefung (kein scheinbarer Stillstand)', el && el.pruef);
    ok(el && /unbestimmt/.test(el.unbest), 'Bild-Verkleinern nutzt einen unbestimmten Balken (kein erfundener Prozentwert)', el && el.unbest);
    ok(el && el.zu === 'none', 'Overlay schliesst wieder', el && el.zu);
  }

  console.log('■ 3: Fehler beenden die Anzeige und werden gemeldet');
  {
    const r = await page.evaluate(async () => {
      const file = new File([new Uint8Array(11 * 1024 * 1024)], 'zu_gross.pdf', { type: 'application/pdf' });
      try { await GemaSchule.uploadDatei(file, 'schule/org_test/lernmittel', { maxMb: 10 }); return { fehler: null }; }
      catch (e) { return { fehler: e.message }; }
    });
    ok(r.fehler && /zu gross/i.test(r.fehler), 'zu grosse Datei wird vor dem Upload abgefangen', r.fehler);
    const stillOffen = await page.evaluate(() => getComputedStyle(document.getElementById('upOv')).display);
    ok(stillOffen === 'none', 'Overlay bleibt bei einem Abbruch nicht haengen', stillOffen);

    const nichtErlaubt = await page.evaluate(async () => {
      const file = new File([new Uint8Array(10)], 'liste.xlsx', { type: 'application/vnd.ms-excel' });
      try { await GemaSchule.uploadDatei(file, 'schule/org_test/lernmittel', {}); return null; }
      catch (e) { return e.message; }
    });
    ok(nichtErlaubt && /PDF/.test(nichtErlaubt), 'Excel & Co. werden mit Klartext abgelehnt', nichtErlaubt);
  }

  console.log('■ 4: Datei-Input haengt im DOM (WebKit raeumt losgeloeste Inputs weg)');
  {
    const src = await (await fetch(BASE + '/ab_klassen.html')).text();
    const mat = src.slice(src.indexOf('window.matNeu='), src.indexOf('window.matLinkNeu='));
    ok(/document\.body\.appendChild\(inp\)/.test(mat), 'Input wird in den Body gehaengt');
    ok(/inp\.click\(\)/.test(mat), 'Dialog wird geoeffnet');
    ok(/onProgress\s*:\s*upSet/.test(mat), 'Fortschritt ist an den Upload gehaengt');
  }

  ok(errors.length === 0, 'keine JS-Fehler (' + errors.slice(0, 2).join(' | ') + ')');
  await ctx.close();
} finally {
  await browser.close(); server.close();
}
console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
