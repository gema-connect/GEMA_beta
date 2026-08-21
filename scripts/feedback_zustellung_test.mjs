/* Drift-Guard: Feedback kommt an — oder sagt, dass es noch nicht angekommen ist.
 *
 * Hintergrund (Bugreport 21.08.2026 «Feedback als Monteur gemacht, erscheint
 * nicht im Beta-Prüfungen-Modul»): gema_feedback.js schrieb einen
 * fehlgeschlagenen Cloud-Save still in localStorage['gema_feedback_<modul>']
 * und meldete trotzdem «✓ Feedback gespeichert». Niemand sendete das je nach —
 * der Eintrag war für immer weg, ohne dass es jemand merkte.
 *
 * Der Test prüft beide Hälften:
 *   A) statisch — Warteschlange, ehrliche Meldung, Flush-Verdrahtung,
 *      Screenshot-Auslagerung, Board rendert screenshotUrl
 *   B) im Browser — abgelehnter POST landet in der Warteschlange (nicht im
 *      Nichts), die Meldung behauptet keinen Erfolg, und beim nächsten
 *      Seitenaufruf mit erreichbarer Cloud kommt das Feedback im Board an
 *
 * Aufruf: CHROME=<chromium> node scripts/feedback_zustellung_test.mjs
 */
import fs from 'fs';

let ok = 0, fail = 0;
const T = (name, cond, info) => {
  if (cond) { ok++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info ? '  → ' + info : '')); }
};

const FB  = fs.readFileSync('gema_feedback.js', 'utf8');
const BET = fs.readFileSync('sys_beta.html', 'utf8');

console.log('\n── A) Statisch: Zustellkette in gema_feedback.js ──');
T('Warteschlange existiert (OUTBOX_KEY)', /OUTBOX_KEY\s*=\s*'gema_feedback_outbox_v1'/.test(FB));
T('_obLegen / _obFlush / _obLesen vorhanden',
  /function _obLegen\(/.test(FB) && /async function _obFlush\(/.test(FB) && /function _obLesen\(/.test(FB));
T('init() stösst das Nachsenden an', /_obStart\(\);/.test(FB) && /function _obStart\(/.test(FB));
T('«online» sendet den Rückstand nach', /addEventListener\('online'[\s\S]{0,120}_obFlush/.test(FB));
T('submit() flusht vor dem Schreiben', /await _obFlush\(\);/.test(FB));

// Der eigentliche Fehler: stiller localStorage-Fallback mit Erfolgsmeldung
const submitBlock = FB.slice(FB.indexOf('async function submit()'), FB.indexOf('var _toastEl'));
T('submit() schreibt NICHT mehr still nach gema_feedback_<modul>',
  !/localStorage\.setItem\('gema_feedback_'/.test(submitBlock),
  'stiller Fallback ist zurück');
T('kein «gespeichert» ohne Zustellung',
  /wartet[\s\S]{0,200}Noch nicht übermittelt/.test(submitBlock),
  'ehrliche Meldung fehlt');
T('Fehlerfall wird benannt', /Fehler beim Speichern/.test(submitBlock));

console.log('\n── A2) Screenshot: erst Bucket, dann Record ──');
T('_shotAuslagern lädt in den Bucket', /async function _shotAuslagern\(/.test(FB) && /uploadDataUrl\(shot, _orgOrdner\(\)\)/.test(FB));
T('gema_storage.js wird bei Bedarf nachgeladen', /_ensureStorage/.test(FB) && /s\.src = 'gema_storage\.js'/.test(FB));
T('Bucket-Pfad trägt die Org (Löschgrenze)', /'feedback\/' \+ \(\(u && u\.orgId\)/.test(FB));
T('Base64 bleibt Fallback', /if \(shot\.length > SHOT_MAX_B64\)/.test(FB));
T('weggelassener Screenshot wird BENANNT (kein stiller Deckel)',
  /screenshotWeg = true/.test(FB) && /screenshotWeg/.test(BET));
T('Board rendert die ausgelagerte URL', /c\.screenshotUrl \|\| c\.screenshot/.test(BET));
T('Markdown-Export nimmt die ausgelagerte URL', /it\.screenshotUrl \|\| it\.screenshot/.test(BET));

console.log('\n── A3) Historie darf nie überschrieben werden ──');
T('gescheiterter Lesevorgang liefert null (nicht [])', /catch \(e\) \{ return null; \}[^\n]*Leseweg kaputt/.test(FB));
T('_zurCloud bricht bei null ab', /if \(vorhanden === null\) return false;/.test(FB));
T('Dedupe vor dem Anhängen', /_gleicherEintrag/.test(FB));

/* ── B) Browser ─────────────────────────────────────────────────────── */
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) { }
if (!chromium || !process.env.CHROME) {
  console.log('\n⏭  Browser-Teil übersprungen (playwright-core/CHROME fehlt) — nie still: Teil A lief.');
} else {
  const { startServer, BASE, seed } = await import('./rolematrix_harness.mjs');

  const DB = new Map();
  let postErlaubt = false;
  async function mock(ctx) {
    await ctx.route('**/*', async route => {
      const req = route.request(), u = req.url(), m = req.method();
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
        if (m === 'POST') {
          if (!postErlaubt) return route.fulfill({ status: 413, contentType: 'application/json', body: '{"message":"payload too large"}' });
          let b = []; try { b = JSON.parse(req.postData() || '[]'); } catch (e) { }
          if (!Array.isArray(b)) b = [b];
          b.forEach(r => DB.set(r.module_key + '|' + r.data_key, r.payload));
          return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (u.includes('/.netlify/functions/') || u.includes('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      if (u.includes('supabase') || u.includes('/rest/v1/') || u.includes('/sb/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.abort();
    });
  }
  const mitSeed = async (ctx, rollen) => ctx.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seed(rollen));

  const srv = await startServer();
  const br = await chromium.launch({ executablePath: process.env.CHROME });

  const absenden = async (page, text) => {
    await page.evaluate(t => {
      GemaFeedback.start();
      document.getElementById('gfb-modal').style.display = 'flex';
      document.getElementById('gfb-text').value = t;
      document.getElementById('gfb-author').value = 'Monteur Test';
    }, text);
    await page.waitForTimeout(250);
    await page.evaluate(() => document.getElementById('gfb-submit').click());
    await page.waitForTimeout(2500);
  };

  console.log('\n── B1) Cloud lehnt ab: Eintrag wartet, Meldung ist ehrlich ──');
  const c1 = await br.newContext();
  await mock(c1); await mitSeed(c1, ['role_monteur']);
  const p1 = await c1.newPage();
  await p1.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await p1.waitForTimeout(2200);
  await absenden(p1, 'FEEDBACK VOM MONTEUR — muss ankommen');

  const r1 = await p1.evaluate(() => ({
    toast: (document.body.innerText.match(/Noch nicht übermittelt[^\n]*/) || [''])[0],
    wartend: (window._gfbHooks && window._gfbHooks.outbox) ? (window._gfbHooks.outbox().werkzeug || []).length : -1,
    alt: Object.keys(localStorage).filter(k => k.indexOf('gema_feedback_') === 0 && k !== 'gema_feedback_outbox_v1')
  }));
  T('Eintrag liegt in der Warteschlange', r1.wartend === 1, JSON.stringify(r1));
  T('kein stiller gema_feedback_<modul>-Key mehr', r1.alt.length === 0, r1.alt.join(','));
  T('Meldung behauptet keinen Erfolg', /Noch nicht übermittelt/.test(r1.toast), r1.toast || '(keine Meldung)');
  T('Gegenprobe: die Cloud hat wirklich nichts', ![...DB.keys()].some(k => k.includes('feedback_werkzeug')));

  console.log('\n── B2) Cloud wieder erreichbar: der nächste Aufruf sendet nach ──');
  postErlaubt = true;
  const p1b = await c1.newPage();
  await p1b.goto(BASE + '/if_werkzeug.html', { waitUntil: 'domcontentloaded' });
  await p1b.waitForTimeout(6000);
  const r2 = await p1b.evaluate(() => (window._gfbHooks && window._gfbHooks.outboxAnzahl) ? window._gfbHooks.outboxAnzahl() : -1);
  T('Warteschlange ist leer', r2 === 0, 'noch ' + r2 + ' wartend');
  const inDb = DB.get('gema_beta_pruefungen_v1|feedback_werkzeug');
  // _GemaDB.saveToModule verpackt den Wert als {v:…}
  let liste = inDb ? (inDb.v !== undefined ? inDb.v : inDb.data) : null;
  if (typeof liste === 'string') { try { liste = JSON.parse(liste); } catch (e) { } }
  T('Feedback steht in der Cloud', Array.isArray(liste) && liste.length === 1 && /muss ankommen/.test(liste[0].text || ''),
    JSON.stringify(inDb || null).slice(0, 160));

  console.log('\n── B3) Der Admin sieht es im Board ──');
  const c2 = await br.newContext();
  await mock(c2); await mitSeed(c2, ['role_admin']);
  const p2 = await c2.newPage();
  await p2.goto(BASE + '/sys_beta.html', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(9000);
  const r3 = await p2.evaluate(() => ({
    getFb: (typeof getFeedback === 'function') ? (getFeedback('werkzeug') || []).length : -1,
    karten: document.querySelectorAll('.fb-card').length,
    // Das Panel startet zugeklappt — der Text steht im Markup, nicht in innerText
    text: [...document.querySelectorAll('.fb-card')].some(c => c.textContent.includes('muss ankommen'))
  }));
  T('getFeedback liefert den Eintrag', r3.getFb === 1, JSON.stringify(r3));
  T('Board rendert die Feedback-Karte', r3.karten === 1, JSON.stringify(r3));
  T('Der Text steht im Board', r3.text, JSON.stringify(r3));

  await br.close(); srv.close();
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + ok + ' ok, ' + fail + ' fehlgeschlagen');
process.exit(fail ? 1 : 0);
