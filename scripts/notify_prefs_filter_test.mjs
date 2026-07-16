// Playwright-Test: Notifikations-Einstellungen greifen auch bei ROLLEN-/ORG-
// adressierten Meldungen (Bug 16.07.2026: «Elektroprüfung fällig» kam trotz
// deaktivierter Werkzeugprüfungen — der Prefs-Filter lief nur in push() bei
// empfaengerUserId, getForCurrentUser() zeigte Rollen-Pushes ungefiltert).
// Fix: Anzeige-Filter pro Empfänger in getForCurrentUser(); Settings-Panel
// nutzt includeDisabled für die Selbstheilung («bereits erhaltene Gruppen»).
// Ausführen: CHROME=<chromium> node scripts/notify_prefs_filter_test.mjs (aus scripts/)
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_magaziner']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/if_trocknung.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof GemaNotify !== 'undefined' && typeof GemaNotify.push === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

console.log('■ Rollen-adressierte Meldung respektiert die User-Einstellung');
const pushPruefung = () => page.evaluate(() => GemaNotify.push({
  eventKey: 'werkzeug_pruefung_faellig',
  empfaengerRoleId: 'role_magaziner',
  empfaengerOrgId: 'org_test',
  modul: 'werkzeug', typ: 'warnung',
  titel: 'Elektroprüfung fällig: Bohrhammer', text: 'NIV-Prüfung in 7 Tagen fällig'
}));
await pushPruefung();
{
  const s = await page.evaluate(() => ({
    sichtbar: GemaNotify.getForCurrentUser().some(n => n.eventKey === 'werkzeug_pruefung_faellig'),
    unread: GemaNotify.getUnreadCount()
  }));
  ok(s.sichtbar, 'Aktiviert (Default): Prüfungs-Meldung sichtbar');
  ok(s.unread >= 1, 'Ungelesen-Zähler zählt sie');
}
await page.evaluate(() => GemaNotify.setPref('werkzeug_pruefung_faellig', false));
{
  const s = await page.evaluate(() => ({
    sichtbar: GemaNotify.getForCurrentUser().some(n => n.eventKey === 'werkzeug_pruefung_faellig'),
    unread: GemaNotify.getUnreadCount(),
    roh: GemaNotify.getForCurrentUser({ includeDisabled: true }).some(n => n.eventKey === 'werkzeug_pruefung_faellig')
  }));
  ok(!s.sichtbar, 'Deaktiviert → bestehende Rollen-Meldung verschwindet aus Panel/Liste');
  ok(s.unread === 0, 'Ungelesen-Zähler (Glocke) zählt sie nicht mehr');
  ok(s.roh, 'includeDisabled liefert sie weiterhin (Selbstheilung im ⚙-Panel)');
}
// Neue Rollen-Meldung nach dem Deaktivieren: wird erstellt (andere Magaziner
// wollen sie evtl.), bleibt für DIESEN User aber unsichtbar
await pushPruefung();
{
  const s = await page.evaluate(() => ({
    sichtbar: GemaNotify.getForCurrentUser().filter(n => n.eventKey === 'werkzeug_pruefung_faellig').length,
    gesamt: GemaNotify._getAll().filter(n => n.eventKey === 'werkzeug_pruefung_faellig').length
  }));
  ok(s.gesamt === 2 && s.sichtbar === 0, 'Neue Rollen-Meldung: erstellt (für andere Empfänger), für diesen User unsichtbar');
}
// Persönlich adressiert: weiterhin gar nicht erst erstellt (bestehender Filter)
{
  const r = await page.evaluate(() => GemaNotify.push({
    eventKey: 'werkzeug_pruefung_faellig', empfaengerUserId: 'u_test',
    modul: 'werkzeug', typ: 'warnung', titel: 'x', text: 'x'
  }));
  ok(r === null, 'Persönlich adressiert + deaktiviert → push() erstellt nichts (wie bisher)');
}
// Andere Event-Keys bleiben unberührt
await page.evaluate(() => GemaNotify.push({ eventKey: 'werkzeug_zuweisung', empfaengerRoleId: 'role_magaziner', empfaengerOrgId: 'org_test', modul: 'werkzeug', typ: 'info', titel: 'Zuweisung', text: 'x' }));
ok(await page.evaluate(() => GemaNotify.getForCurrentUser().some(n => n.eventKey === 'werkzeug_zuweisung')), 'Andere Werkzeug-Events (Zuweisung) bleiben sichtbar');

console.log('■ Wieder aktivieren');
await page.evaluate(() => GemaNotify.setPref('werkzeug_pruefung_faellig', true));
ok(await page.evaluate(() => GemaNotify.getForCurrentUser().filter(n => n.eventKey === 'werkzeug_pruefung_faellig').length) === 2, 'Re-Aktivieren zeigt die aufgelaufenen Meldungen wieder');

console.log('■ ⚙-Einstellungs-Panel: Gruppe bleibt trotz Deaktivierung schaltbar');
await page.evaluate(() => GemaNotify.setPref('werkzeug_pruefung_faellig', false));
await page.evaluate(() => { document.querySelector('.gn-btn').click(); });
await page.waitForSelector('#gnSettings', { timeout: 5000 });
await page.evaluate(() => document.getElementById('gnSettings').click());
await page.waitForSelector('#gnSettingsOverlay input[data-ev]', { timeout: 5000 });
{
  const s = await page.evaluate(() => {
    const cb = document.querySelector('#gnSettingsOverlay input[data-ev="werkzeug_pruefung_faellig"]');
    return { da: !!cb, checked: cb ? cb.checked : null };
  });
  ok(s.da, 'Schalter «Prüfung fällig» ist im Panel gelistet');
  ok(s.checked === false, 'Schalter zeigt den deaktivierten Zustand');
}

if (errors.length) console.log('  [pageerrors]', errors.slice(0, 5));
ok(errors.length === 0, 'Keine JS-Fehler');

await ctx.close();
await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
