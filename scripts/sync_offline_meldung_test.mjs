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
//  A) Schreibfehler bei intakter Verbindung → KEINE Offline-Meldung; kurzer
//     Aussetzer bleibt komplett LAUTLOS (Ruhe-Frist); erst ein wirklich
//     haengender Rueckstand zeigt den ehrlichen Hinweis «Noch nicht
//     hochgeladen … Verbindung ist in Ordnung» — per ✕ stummschaltbar
//  B) Der Hinweis verschwindet, sobald der Upload durch ist
//  C) Echter Netzausfall → weiterhin die Offline-Meldung
//  D) 4xx (z.B. 413 «zu gross») schaltet nie auf offline
//  E) EIN Gift-Record blockiert NIE die uebrigen: scheitert der Sammel-POST,
//     werden die Records einzeln gesendet — nur der problematische bleibt
//  F) Ein ZU GROSSER Record repariert sich selbst: Base64-Fotos werden in den
//     Storage ausgelagert (GemaStorage) und der geschrumpfte Record sofort
//     erneut gesendet — «Verbindung ok, aber es laedt nicht hoch» heilt sich
//  G) Der GRUND eines abgelehnten Uploads ist sichtbar (pendingInfo: Modul,
//     Groesse, Versuche, letzter Fehler) — kein Blindflug mehr
//  H) RLS-Heilung: Ein Record OHNE orgId wird von den org-gescopten Policies
//     (gema_rls_v2) mit 403 «row-level security» abgelehnt — GemaSync stempelt
//     die eigene Org (JWT-Claim) nach und sendet sofort erneut; ein Record
//     mit FREMDER orgId wird NIE umgestempelt
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
let schreibModus = 'ok';     // ok | fehler | zuGross | gift | nurKlein | rls (Rows ohne data.orgId='org_test' → 403 wie die v2-Policies)
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
    if (schreibModus === 'rls') {
      let rows = []; try { rows = JSON.parse(req.postData() || '[]'); } catch (e) { }
      const verletzt = rows.some(r => ((r.payload || {}).data || {}).orgId !== 'org_test');
      if (verletzt) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', details: null, hint: null, message: 'new row violates row-level security policy for table \"gema_data\"' }) });
      rows.forEach(r => cloud.set(r.data_key, r));
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (schreibModus === 'nurKlein' && (req.postData() || '').length > 5000)
      return route.fulfill({ status: 413, contentType: 'application/json', body: '{"message":"Payload too large"}' });
    if (schreibModus === 'gift') {
      // Sammel-POST (mehrere Rows) wird abgelehnt; einzeln geht alles durch
      // AUSSER dem Gift-Record — exakt das 413-Szenario eines zu grossen
      // Datensatzes im Batch.
      if (rows.length > 1) return route.fulfill({ status: 413, contentType: 'application/json', body: '{"message":"payload too large"}' });
      if (rows.length === 1 && rows[0].data_key === 'schaden:gift') return route.fulfill({ status: 413, contentType: 'application/json', body: '{"message":"payload too large"}' });
    }
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
  await page.evaluate(() => { GemaSync.bannerGraceMs = 600; });   // Ruhe-Frist fürs Testen verkürzen
  schreibModus = 'fehler';                 // POST wirft, GET (Probe) antwortet weiter
  ok(await schreibe('schaden:s1', { titel: 'Wasserschaden', fotos: 'viele' }) === 'queued', 'erster Versuch: lokal gesichert (Outbox)');
  ok(await schreibe('schaden:s2', { titel: 'Rohrbruch' }) === 'queued', 'zweiter Versuch: lokal gesichert');
  // Ruhe-Frist: ein kurzer Aussetzer zeigt GAR NICHTS (die schnellen
  // Wiederholungen räumen ihn lautlos weg — genau das «nervt»-Feedback).
  ok(await banner() === null, 'kein Banner direkt nach dem Fehlversuch (Ruhe-Frist)');
  await page.evaluate(() => GemaSync.flushOutbox());   // Nachsenden scheitert wirklich
  await page.waitForTimeout(1600);                     // > Ruhe-Frist + Recheck
  const t = await banner();
  ok(await page.evaluate(() => GemaSync.isReachable()) === true, 'Verbindung wird als INTAKT erkannt (Gegenprobe entscheidet)');
  ok(t && t.indexOf('Offline') < 0, 'kein «Offline» im Hinweis: ' + JSON.stringify(t));
  ok(t && /Noch nicht hochgeladen/.test(t), 'ehrlicher Hinweis «Noch nicht hochgeladen» (erst nach echtem Hängen)');
  ok(t && /Verbindung ist in Ordnung/.test(t), 'Hinweis nennt die intakte Verbindung');
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 2, '2 Änderungen warten');
  // ✕ schaltet den Hinweis stumm — Daten bleiben gesichert
  await page.click('#gema-sync-hide');
  await page.evaluate(() => GemaSync.flushOutbox()).catch(() => {});
  await page.waitForTimeout(900);
  ok(await banner() === null, '✕ blendet den Hinweis aus (Snooze), auch nach weiterem Fehlversuch');
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

/* ════════ E · Gift-Record blockiert die übrigen NICHT ════════ */
console.log('■ E · Ein zu grosser Datensatz blockiert die anderen nicht mehr');
{
  // Aufräumen: Outbox leeren (alles zustellbar machen)
  schreibModus = 'ok'; leseModus = 'ok';
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(500);
  // Zwei Datensätze einreihen (beide scheitern zunächst)
  schreibModus = 'fehler';
  await schreibe('schaden:gift', { titel: 'Riesig — bleibt hängen' });
  await schreibe('schaden:normal', { titel: 'Normaler Bericht' });
  ok(await page.evaluate(() => GemaSync.pendingCount()) >= 2, 'beide warten in der Outbox');
  // Jetzt: Sammel-POST wird abgelehnt, einzeln geht alles ausser dem Gift durch
  schreibModus = 'gift';
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(700);
  ok(cloud.has('schaden:normal'), 'der normale Datensatz ist in der Cloud (Einzel-Fallback)');
  ok(!cloud.has('schaden:gift'), 'der Gift-Record ist (noch) nicht oben');
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 1, 'nur noch der Gift-Record wartet');
  ok(await page.evaluate(() => GemaSync.isReachable()) === true, 'bleibt online (413 ist kein Netzausfall)');
  // Und sobald auch er zustellbar ist, räumt sich alles auf
  schreibModus = 'ok';
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(500);
  ok(cloud.has('schaden:gift'), 'Gift-Record nachgeliefert, sobald möglich');
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 0, 'Outbox leer');
  ok(await banner() === null, 'kein Banner mehr');
}

/* ════════ F · Zu grosser Record repariert sich selbst ════════ */
console.log('■ F · Base64-Fotos werden ausgelagert, der Record schrumpft und geht hoch');
{
  // GemaStorage-Stub: «Upload» liefert eine Storage-URL
  await page.evaluate(() => {
    window._stUploads = [];
    window.GemaStorage = { uploadDataUrl: d => { window._stUploads.push(d.length);
      return Promise.resolve({ url: 'https://x.supabase.co/storage/v1/object/public/gema-fotos/sync/org_test/f' + window._stUploads.length + '.jpg', path: 'sync/org_test/f.jpg' }); } };
  });
  const gross = 'data:image/jpeg;base64,' + 'A'.repeat(70000);
  schreibModus = 'fehler';   // erst einreihen
  await schreibe('schaden:big', { titel: 'Bericht mit Foto', fotos: [{ kommentar: 'Leck', dataUrl: gross }], messpunkte: [{ name: 'Wand', foto: gross }] });
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 1, 'grosser Record wartet in der Outbox');
  schreibModus = 'nurKlein'; // Cloud lehnt grosse Bodies ab — genau der Praxisfall
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 0, 'Record wurde verkleinert und hochgeladen');
  ok(await page.evaluate(() => window._stUploads.length) === 2, 'beide Base64-Fotos in den Storage ausgelagert');
  const rec = JSON.parse(cloud.get('schaden:big').payload ? JSON.stringify(cloud.get('schaden:big').payload.data) : '{}');
  ok(rec.fotos && rec.fotos[0].url && !rec.fotos[0].dataUrl, 'Foto-Objekt folgt dem url||dataUrl-Kanon (url gesetzt, dataUrl weg)');
  ok(/^https:/.test(rec.messpunkte[0].foto), 'String-Foto (Messpunkt) zeigt jetzt auf die Storage-URL');
  ok(rec.titel === 'Bericht mit Foto' && rec.fotos[0].kommentar === 'Leck', 'uebrige Felder unveraendert');
  ok(await banner() === null, 'kein Banner');
}

/* ════════ G · Der Grund ist sichtbar ════════ */
console.log('■ G · pendingInfo nennt Modul, Groesse, Versuche und Fehler');
{
  await page.evaluate(() => { delete window.GemaStorage; });   // keine Reparatur moeglich
  schreibModus = 'fehler';
  await schreibe('schaden:blind', { titel: 'haengt', blob: 'x'.repeat(400000) });
  schreibModus = 'zuGross';
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => GemaSync.pendingInfo());
  ok(info.length === 1 && info[0].module === 'schadensbericht' && info[0].key === 'schaden:blind', 'Eintrag gelistet');
  ok(info[0].kb > 300, 'Groesse ausgewiesen (' + info[0].kb + ' KB)');
  ok(info[0].tries >= 1, 'Versuche gezaehlt (' + info[0].tries + ')');
  ok(/HTTP 413/.test(info[0].err), 'letzter Fehler mit HTTP-Status: ' + JSON.stringify(info[0].err));
  ok(/payload too large/i.test(info[0].err), 'Antwort-Text der Cloud ist im Fehler enthalten');
  // aufräumen
  schreibModus = 'ok';
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => GemaSync.pendingCount()) === 0, 'raeumt sich auf, sobald zustellbar');
}

/* ════════ H · RLS-Heilung: fehlende orgId wird nachgestempelt ════════ */
console.log('■ H · 403 «row-level security» bei fehlender orgId heilt sich selbst');
{
  schreibModus = 'fehler';   // einreihen
  await schreibe('schaden:sd_ohne_org', { titel: 'Wasserschaden ohne Org-Stempel', phase: 'erfasst' });
  await schreibe('schaden:sd_fremd', { titel: 'Fremder Bericht', orgId: 'org_fremd' });
  ok(await page.evaluate(() => GemaSync.pendingCount()) >= 2, 'beide warten in der Outbox');
  schreibModus = 'rls';      // Cloud verhaelt sich wie die v2-Policies
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(800);
  const heil = cloud.get('schaden:sd_ohne_org');
  ok(!!heil, 'orgId-loser Record wurde geheilt und hochgeladen');
  ok(heil && heil.payload.data.orgId === 'org_test', 'nachgestempelte orgId = eigene Org aus dem JWT');
  ok(heil && heil.payload.data.titel === 'Wasserschaden ohne Org-Stempel', 'Inhalt unveraendert');
  ok(!cloud.has('schaden:sd_fremd'), 'Record mit FREMDER orgId wird NIE umgestempelt (bleibt abgelehnt)');
  const infoH = await page.evaluate(() => GemaSync.pendingInfo());
  ok(infoH.length === 1 && infoH[0].key === 'schaden:sd_fremd' && /row-level security/.test(infoH[0].err),
    'fremder Record wartet mit sichtbarem RLS-Grund');
  // aufräumen
  schreibModus = 'ok';
  await page.evaluate(() => GemaSync.flushOutbox());
  await page.waitForTimeout(400);
}

/* ════════ I · Modul-Drift: Schadensbericht stempelt orgId selbst ════════ */
console.log('■ I · sd_schadensbericht stempelt orgId (Neuanlage + Heilung beim Speichern)');
{
  const fs = await import('fs');
  const sd = fs.readFileSync(new URL('../sd_schadensbericht.html', import.meta.url), 'utf8');
  const neu = sd.slice(sd.indexOf('function sdSaveNew()'), sd.indexOf('function sdSaveNew()') + 2600);
  ok(/orgId:\s*\(u && u\.orgId\) \|\| ''/.test(neu), 'sdSaveNew stempelt orgId auf den neuen Bericht');
  ok(/function _sdStampOrg/.test(sd), 'Heilungs-Helfer _sdStampOrg vorhanden');
  const save = sd.slice(sd.indexOf('function sdSave()'), sd.indexOf('function sdSave()') + 400);
  ok(/_sdStampOrg\(\)/.test(save), 'sdSave heilt orgId-lose Altberichte vor dem Persistieren');
}

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
