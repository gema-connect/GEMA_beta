// GemaSync — «Offline»-Meldung nur bei WIRKLICH fehlender Verbindung
//
// Bugreport 28.07.2026 (Schadensbericht): «kommt eine Meldung dass alles nur
// lokal gespeichert wird und hochgeladen wird wenn wieder Internet vorhanden
// ist. Ich habe die ganze Zeit Internet, die Notification hat auch
// funktioniert.» — Ursache: zwei fehlgeschlagene SCHREIBVORGÄNGE in Folge
// schalteten direkt auf «offline». Bildlastige Records (Schadens-/Dachbericht)
// erzeugen mehrere MB grosse Requests; scheitern die (Grösse, Timeout), sieht
// das wie ein Netzausfall aus, obwohl die Leitung einwandfrei ist.
//
// Erwartetes Verhalten jetzt:
//  A) Schreibfehler bei intakter Verbindung → KEINE Offline-Meldung; stattdessen
//     der ehrliche Hinweis «Noch nicht hochgeladen … Verbindung ist in Ordnung»
//  B) Der Hinweis verschwindet, sobald der Upload durch ist
//  C) Echter Netzausfall → weiterhin die Offline-Meldung
//  D) 4xx (z.B. 413 «zu gross») schaltet nie auf offline
//
// Ausführen: CHROME=<chromium> node scripts/sync_offline_meldung_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));

// «Cloud»: Schreibvorgänge (POST) und Lesevorgänge/Probe (GET) getrennt steuerbar
const cloud = new Map();
let schreibModus = 'ok';     // ok | fehler (fetch wirft) | zuGross (HTTP 413)
let leseModus = 'ok';        // ok | tot  (auch die Probe schlägt fehl)

await page.route('**/rest/v1/gema_data*', route => {
  const req = route.request();
  if (req.method() === 'GET') {
    if (leseModus === 'tot') return route.abort('internetdisconnected');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...cloud.values()]) });
  }
  if (req.method() === 'POST') {
    if (schreibModus === 'fehler') return route.abort('internetdisconnected');
    if (schreibModus === 'zuGross') return route.fulfill({ status: 413, contentType: 'application/json', body: '{"message":"payload too large"}' });
    let rows = []; try { rows = JSON.parse(req.postData() || '[]'); } catch (e) { }
    rows.forEach(r => cloud.set(r.data_key, r));
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});

await page.goto(BASE + '/__rmtest.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof GemaSync !== 'undefined', null, { timeout: 10000 });
await page.waitForTimeout(300);

const banner = () => page.evaluate(() => {
  const b = document.getElementById('gema-sync-offline-banner');
  return b ? (b.querySelector('#gema-sync-msg') || b).textContent : null;
});
const schreibe = (key, data) => page.evaluate(([k, d]) =>
  GemaSync.saveRecord('schadensbericht', k, d).then(() => 'ok').catch(e => (e && e.queued) ? 'queued' : 'err'), [key, data]);

/* ════════ A · Schreibfehler bei intakter Verbindung ════════ */
console.log('■ A · Upload scheitert, Internet ist da');
{
  schreibModus = 'fehler';                 // POST wirft, GET (Probe) antwortet weiter
  ok(await schreibe('schaden:s1', { titel: 'Wasserschaden', fotos: 'viele' }) === 'queued', 'erster Versuch: lokal gesichert (Outbox)');
  ok(await schreibe('schaden:s2', { titel: 'Rohrbruch' }) === 'queued', 'zweiter Versuch: lokal gesichert');
  await page.waitForTimeout(900);          // Gegenprobe läuft
  const t = await banner();
  ok(await page.evaluate(() => GemaSync.isReachable()) === true, 'Verbindung wird als INTAKT erkannt (Gegenprobe entscheidet)');
  ok(t && t.indexOf('Offline') < 0, 'kein «Offline» im Hinweis: ' + JSON.stringify(t));
  ok(t && /Noch nicht hochgeladen/.test(t), 'ehrlicher Hinweis «Noch nicht hochgeladen»');
  ok(t && /Verbindung ist in Ordnung/.test(t), 'Hinweis nennt die intakte Verbindung');
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 2, '2 Änderungen warten');
}

/* ════════ B · Hinweis verschwindet nach dem Upload ════════ */
console.log('■ B · Nachholen räumt den Hinweis weg');
{
  schreibModus = 'ok';
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 0, 'Outbox leer — alles hochgeladen');
  ok(await banner() === null, 'Hinweis ist weg');
  ok(cloud.has('schaden:s1') && cloud.has('schaden:s2'), 'beide Datensätze liegen in der Cloud');
}

/* ════════ C · Echter Netzausfall ════════ */
console.log('■ C · Wirklich keine Verbindung');
{
  schreibModus = 'fehler'; leseModus = 'tot';
  await schreibe('schaden:s3', { titel: 'Ohne Netz' });
  await schreibe('schaden:s4', { titel: 'Auch ohne' });
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => GemaSync.isReachable()) === false, 'jetzt wird offline erkannt');
  const t = await banner();
  ok(t && /nicht erreichbar/.test(t), 'Offline-Meldung erscheint: ' + JSON.stringify(t));
  ok(t && /lokal gespeichert/.test(t), 'Meldung sagt, dass lokal gespeichert wird');
  // Verbindung zurück → Hinweis weg, Daten oben
  leseModus = 'ok'; schreibModus = 'ok';
  await page.evaluate(() => GemaSync.probe());
  await page.waitForTimeout(900);
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => GemaSync.isReachable()) === true, 'Verbindung zurück');
  ok(cloud.has('schaden:s3') && cloud.has('schaden:s4'), 'nachgeholt — nichts verloren');
  ok(await banner() === null, 'Banner weg');
}

/* ════════ D · 413 «zu gross» ist kein Verbindungsproblem ════════ */
console.log('■ D · Abgelehnter Request (413) schaltet nie auf offline');
{
  schreibModus = 'zuGross';
  await schreibe('schaden:s5', { titel: 'Riesig' });
  await schreibe('schaden:s6', { titel: 'Noch riesiger' });
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => GemaSync.isReachable()) === true, 'bleibt online');
  const t = await banner();
  ok(!t || t.indexOf('Offline') < 0, 'keine Offline-Meldung');
  ok(await page.evaluate(() => GemaSync.pendingCount()) >= 1, 'Daten trotzdem lokal gesichert (Outbox)');
}

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
