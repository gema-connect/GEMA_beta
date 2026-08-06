// Playwright-Smoke: ERP — Adress-Autocomplete (swisstopo) + Handelsregister (Zefix)
//   - Kunden-Dialog (k_*), Zustelladresse (z_*), Absender (s_*)
//   - Das Strassen-Feld IST das Such-Input (Muster if_wareneingang): die Auswahl
//     schreibt NUR Strasse+Nr zurück, PLZ/Ort in die eigenen Felder
//   - Bewusst OHNE GemaAdresse-Target-Bindung: Nachtippen in der Strasse darf
//     bereits erfasste PLZ/Ort NIE leeren
//   - Firma-Feld: Handelsregister-Vorschläge, Auswahl füllt NUR LEERE Adressfelder
//     und merkt den HR-Bezug (UID) — beim Umtippen des Namens fällt er weg
// Ausführen: CHROME=<chromium> node scripts/erp_adresse_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const SWISSTOPO = {
  results: [
    { attrs: { label: 'Musterstrasse 12 <b>4051 Basel</b>', plz: 4051, gemeindename: 'Basel', kanton: 'BS', lon: 7.58, lat: 47.55 } },
    { attrs: { label: 'Musterstrasse 14 <b>4051 Basel</b>', plz: 4051, gemeindename: 'Basel', kanton: 'BS', lon: 7.58, lat: 47.55 } }
  ]
};

// Handelsregister-Antworten: Suche OHNE Adresse (wie die echte Zefix-API),
// Detail (?uid=…) MIT Adresse — das Frontend lädt sie beim Auswählen nach.
const ZEFIX_SUCHE = { ok: true, anzahl: 2, firmen: [
  { name: 'Muster AG', uid: 'CHE123456789', uidFormatted: 'CHE-123.456.789', chid: 'CH-270.3.014.395-4', sitz: 'Zürich', rechtsform: 'Aktiengesellschaft', rechtsformKurz: 'AG', status: 'ACTIVE', aktiv: true, zefixUrl: 'https://www.zefix.ch/de/search/entity/list?name=Muster%20AG', strasse: '', plz: '', ort: '' },
  { name: 'Muster Bau GmbH', uid: 'CHE987654321', uidFormatted: 'CHE-987.654.321', chid: '', sitz: 'Basel', rechtsform: 'Gesellschaft mit beschränkter Haftung', rechtsformKurz: 'GmbH', status: 'CANCELLED', aktiv: false, zefixUrl: '', strasse: '', plz: '', ort: '' }
] };
const ZEFIX_DETAIL = { ok: true, anzahl: 1, firmen: [
  { name: 'Muster AG', uid: 'CHE123456789', uidFormatted: 'CHE-123.456.789', chid: 'CH-270.3.014.395-4', sitz: 'Zürich', rechtsform: 'Aktiengesellschaft', rechtsformKurz: 'AG', status: 'ACTIVE', aktiv: true, zefixUrl: 'https://zh.chregister.ch/auszug', strasse: 'Bahnhofstrasse 1', plz: '8001', ort: 'Zürich' }
] };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// Page-Route schlägt die abort-all-Route des Harness (Context-Ebene)
let apiCalls = 0;
await page.route('**/api3.geo.admin.ch/**', route => {
  apiCalls++;
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(SWISSTOPO) });
});
let zefixSuche = 0, zefixDetail = 0, zefixAuth = '';
await page.route('**/functions/zefix*', route => {
  const u = route.request().url();
  zefixAuth = route.request().headers()['authorization'] || '';
  const detail = /[?&]uid=/.test(u);
  if (detail) zefixDetail++; else zefixSuche++;
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail ? ZEFIX_DETAIL : ZEFIX_SUCHE) });
});

await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpKundeNeu === 'function' && typeof erpAdrInit === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

console.log('■ Helper geladen + angebunden');
ok(await page.evaluate(() => typeof GemaAdresse !== 'undefined' && typeof GemaAdresse.attach === 'function'), 'gema_adresse.js ist eingebunden');
ok(await page.evaluate(() => !!document.getElementById('k_strasse')._gemaAdresseAttached), 'Kunde: k_strasse ist an GemaAdresse gebunden');
ok(await page.evaluate(() => !!document.getElementById('z_strasse')._gemaAdresseAttached), 'Zustelladresse: z_strasse ist gebunden');
ok(await page.evaluate(() => !!document.getElementById('s_strasse')._gemaAdresseAttached), 'Einstellungen: s_strasse ist gebunden');
ok(await page.evaluate(() => document.getElementById('k_strasse').classList.contains('gema-adr-input')), 'k_strasse trägt die Helper-Klasse');
ok(await page.evaluate(() => {
  const c = document.getElementById('k_strasse')._gemaAdresseAttached;
  return !c.targets.strasse && !c.targets.plz && !c.targets.ort;
}), 'KEINE Target-Bindung (Nachtippen darf PLZ/Ort nicht leeren)');

console.log('■ Kunden-Dialog: Adresse wird vorgeschlagen');
await page.evaluate(() => erpKundeNeu());
ok(await page.evaluate(() => document.getElementById('kundeModal').classList.contains('open')), 'Kunden-Dialog offen');
await page.fill('#k_firma', 'Muster Immobilien AG');
await page.click('#k_strasse');
await page.type('#k_strasse', 'Musterstrasse 12', { delay: 12 });
await page.waitForSelector('#kundeModal .gema-adr-drop.open .gema-adr-item', { timeout: 6000 });
ok(apiCalls > 0, 'swisstopo-Endpunkt wurde abgefragt');
{
  const items = await page.$$eval('#kundeModal .gema-adr-drop .gema-adr-item', els => els.map(e => e.textContent));
  ok(items.length === 2, 'Zwei Vorschläge im Dropdown');
  ok(/Musterstrasse 12/.test(items[0]) && /4051 Basel/.test(items[0]), 'Vorschlag zeigt Strasse + PLZ/Ort');
}
await page.$eval('#kundeModal .gema-adr-drop .gema-adr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForTimeout(120);
{
  const v = await page.evaluate(() => ({
    str: document.getElementById('k_strasse').value,
    plz: document.getElementById('k_plz').value,
    ort: document.getElementById('k_ort').value,
    open: document.querySelector('#kundeModal .gema-adr-drop').classList.contains('open')
  }));
  ok(v.str === 'Musterstrasse 12', 'k_strasse enthält NUR Strasse + Nr. (kein Anzeige-String)');
  ok(v.plz === '4051', 'k_plz automatisch gefüllt');
  ok(v.ort === 'Basel', 'k_ort automatisch gefüllt');
  ok(!v.open, 'Dropdown schliesst nach der Auswahl');
}

console.log('■ Nachtippen leert PLZ/Ort NICHT');
await page.type('#k_strasse', 'a', { delay: 12 });
await page.waitForTimeout(60);
{
  const v = await page.evaluate(() => ({ plz: document.getElementById('k_plz').value, ort: document.getElementById('k_ort').value }));
  ok(v.plz === '4051' && v.ort === 'Basel', 'PLZ/Ort bleiben beim Korrigieren der Strasse erhalten');
}
await page.evaluate(() => { document.getElementById('k_strasse').value = 'Musterstrasse 12'; });

console.log('■ Speichern übernimmt die Adresse in den Kundenstamm');
await page.evaluate(() => erpKundeSave());
{
  const k = await page.evaluate(() => (erpKunden() || []).find(x => x.firma === 'Muster Immobilien AG'));
  ok(!!k, 'Kunde gespeichert');
  ok(k && k.strasse === 'Musterstrasse 12' && k.plz === '4051' && k.ort === 'Basel', 'Adresse korrekt im Record (Strasse/PLZ/Ort getrennt)');
}

console.log('■ Bearbeiten: Adresse bleibt einzeilig im Strassenfeld');
{
  const id = await page.evaluate(() => (erpKunden() || []).find(x => x.firma === 'Muster Immobilien AG').id);
  await page.evaluate(i => erpKundeEdit(i), id);
  ok(await page.evaluate(() => document.getElementById('k_strasse').value === 'Musterstrasse 12'), 'Edit zeigt die reine Strasse');
  await page.evaluate(() => document.getElementById('kundeModal').classList.remove('open'));
}

console.log('■ Zustelladresse-Dialog: gleiche Vorschläge');
await page.evaluate(() => { erpNeu('offerte'); erpZustellOpen(); });
await page.click('#z_strasse');
await page.type('#z_strasse', 'Musterstrasse', { delay: 12 });
await page.waitForSelector('#zustellModal .gema-adr-drop.open .gema-adr-item', { timeout: 6000 });
ok(true, 'Zustelladresse: Dropdown erscheint');
await page.$eval('#zustellModal .gema-adr-drop .gema-adr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForTimeout(120);
{
  const v = await page.evaluate(() => ({
    str: document.getElementById('z_strasse').value,
    plz: document.getElementById('z_plz').value,
    ort: document.getElementById('z_ort').value
  }));
  ok(v.str === 'Musterstrasse 12' && v.plz === '4051' && v.ort === 'Basel', 'Zustelladresse: Strasse/PLZ/Ort korrekt getrennt');
}
await page.evaluate(() => document.getElementById('zustellModal').classList.remove('open'));

console.log('■ Einstellungen (Absender): gleiche Vorschläge');
await page.evaluate(() => erpOpenSettings());
await page.click('#s_strasse');
await page.type('#s_strasse', 'Musterstrasse', { delay: 12 });
await page.waitForSelector('#setModal .gema-adr-drop.open .gema-adr-item', { timeout: 6000 });
await page.$eval('#setModal .gema-adr-drop .gema-adr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForTimeout(120);
{
  const v = await page.evaluate(() => ({
    str: document.getElementById('s_strasse').value,
    plz: document.getElementById('s_plz').value,
    ort: document.getElementById('s_ort').value
  }));
  ok(v.str === 'Musterstrasse 12' && v.plz === '4051' && v.ort === 'Basel', 'Absender: Strasse/PLZ/Ort korrekt getrennt');
}

await page.evaluate(() => document.getElementById('setModal').classList.remove('open'));

// ═══════════════ HANDELSREGISTER (Zefix) am Firma-Feld ═══════════════
console.log('■ Handelsregister: Anbindung');
ok(await page.evaluate(() => typeof GemaZefix !== 'undefined' && typeof GemaZefix.attach === 'function'), 'gema_zefix.js ist eingebunden');
ok(await page.evaluate(() => !!document.getElementById('k_firma')._gzAttached), 'Kunde: k_firma ist an GemaZefix gebunden');
ok(await page.evaluate(() => !!document.getElementById('z_firma')._gzAttached), 'Zustelladresse: z_firma ist gebunden');
ok(await page.evaluate(() => !!document.getElementById('s_name')._gzAttached), 'Einstellungen: s_name ist gebunden');

console.log('■ Handelsregister: Suche + Auswahl im Kunden-Dialog');
await page.evaluate(() => erpKundeNeu());
await page.click('#k_firma');
await page.type('#k_firma', 'Muster', { delay: 12 });
await page.waitForSelector('#kundeModal .gema-hr-drop.open .gema-hr-item', { timeout: 6000 });
ok(zefixSuche > 0, 'Zefix-Suche wurde abgefragt');
ok(/^Bearer\s+\S+/.test(zefixAuth), 'Anfrage trägt das GEMA-JWT (Function ist auth-gegated)');
{
  const items = await page.$$eval('#kundeModal .gema-hr-drop .gema-hr-item', els => els.map(e => e.textContent));
  ok(items.length === 2, 'Zwei Handelsregister-Treffer');
  // Seit 08/2026 steht die ADRESSE zuoberst in der Vorschlagszeile — daran
  // erkennt man den Betrieb. Die Such-Antwort dieses Mocks fuehrt (wie die
  // REST-Quellen) keine Adresse, darum erscheint hier der Sitz.
  ok(/Muster AG/.test(items[0]) && /Zürich · AG · CHE-123\.456\.789/.test(items[0]), 'Treffer zeigt Adresse/Sitz · Rechtsform · UID');
  ok(/gelöscht/i.test(items[1]), 'Gelöschte Firma ist als solche markiert');
}
await page.$eval('#kundeModal .gema-hr-drop .gema-hr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForFunction(() => document.getElementById('k_strasse').value !== '', null, { timeout: 6000 });
ok(zefixDetail > 0, 'Detail (?uid=) für die Adresse nachgeladen');
{
  const v = await page.evaluate(() => ({
    firma: document.getElementById('k_firma').value,
    str: document.getElementById('k_strasse').value,
    plz: document.getElementById('k_plz').value,
    ort: document.getElementById('k_ort').value,
    hint: document.getElementById('k_hrHint').textContent,
    cls: document.getElementById('k_hrHint').className
  }));
  ok(v.firma === 'Muster AG', 'Offizieller Firmenname übernommen');
  ok(v.str === 'Bahnhofstrasse 1' && v.plz === '8001' && v.ort === 'Zürich', 'Adresse aus dem Handelsregister gefüllt');
  ok(/CHE-123\.456\.789/.test(v.hint) && /AG/.test(v.hint) && /Zürich/.test(v.hint), 'Bestätigungs-Zeile nennt UID · Rechtsform · Sitz');
  ok(v.cls === 'gema-hr-hint', 'Bestätigungs-Zeile ist als solche gestylt');
}

console.log('■ Handelsregister: Speichern übernimmt den HR-Bezug');
await page.evaluate(() => erpKundeSave());
{
  const k = await page.evaluate(() => (erpKunden() || []).find(x => x.firma === 'Muster AG'));
  ok(k && k.hr && k.hr.uid === 'CHE123456789', 'UID am Kunden gespeichert');
  ok(k && k.hr.rechtsformKurz === 'AG' && k.hr.sitz === 'Zürich', 'Rechtsform + Sitz gespeichert');
  ok(k && k.strasse === 'Bahnhofstrasse 1' && k.plz === '8001', 'Adresse im Kundenstamm');
  const id = k.id;
  await page.evaluate(i => erpKundeEdit(i), id);
  ok(await page.evaluate(() => /CHE-123\.456\.789/.test(document.getElementById('k_hrHint').textContent)), 'Beim Bearbeiten wird der HR-Bezug wieder angezeigt');
  await page.evaluate(() => document.getElementById('kundeModal').classList.remove('open'));
}

console.log('■ Handelsregister: Adresse wird direkt übernommen und bleibt bearbeitbar');
await page.evaluate(() => {
  erpKundeNeu();
  document.getElementById('k_strasse').value = 'Eigene Gasse 7';
  document.getElementById('k_plz').value = '4500';
  document.getElementById('k_ort').value = 'Solothurn';
});
await page.click('#k_firma');
await page.type('#k_firma', 'Muster', { delay: 12 });
await page.waitForSelector('#kundeModal .gema-hr-drop.open .gema-hr-item', { timeout: 6000 });
await page.$eval('#kundeModal .gema-hr-drop .gema-hr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForFunction(() => document.getElementById('k_strasse').value === 'Bahnhofstrasse 1', null, { timeout: 6000 });
{
  const v = await page.evaluate(() => ({
    str: document.getElementById('k_strasse').value,
    plz: document.getElementById('k_plz').value,
    ort: document.getElementById('k_ort').value,
    hint: document.getElementById('k_hrHint').textContent,
    ro: ['k_strasse', 'k_plz', 'k_ort'].some(id => { const e = document.getElementById(id); return e.readOnly || e.disabled; })
  }));
  ok(v.str === 'Bahnhofstrasse 1' && v.plz === '8001' && v.ort === 'Zürich', 'Adresse ersetzt die zuvor erfasste');
  ok(/Adresse übernommen/.test(v.hint), 'Hinweis nennt die Übernahme');
  ok(v.ro === false, 'Adressfelder bleiben editierbar (nicht readonly/disabled)');
}
// Nach der Übernahme von Hand anpassen — der Wert muss stehen bleiben
await page.fill('#k_strasse', 'Bahnhofstrasse 1a');
await page.fill('#k_plz', '8002');
await page.waitForTimeout(60);
{
  const v = await page.evaluate(() => ({ str: document.getElementById('k_strasse').value, plz: document.getElementById('k_plz').value, ort: document.getElementById('k_ort').value }));
  ok(v.str === 'Bahnhofstrasse 1a' && v.plz === '8002' && v.ort === 'Zürich', 'Manuelle Korrektur nach der Übernahme bleibt erhalten');
}

console.log('■ Handelsregister: Eintrag ohne Adresse leert nichts');
await page.unroute('**/functions/zefix*');
await page.route('**/functions/zefix*', route => {
  const detail = /[?&]uid=/.test(route.request().url());
  const ohneAdr = { ok: true, firmen: [Object.assign({}, ZEFIX_DETAIL.firmen[0], { strasse: '', plz: '', ort: '' })] };
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail ? ohneAdr : ZEFIX_SUCHE) });
});
await page.evaluate(() => {
  erpKundeNeu();
  document.getElementById('k_strasse').value = 'Handerfasst 3';
  document.getElementById('k_plz').value = '3000';
  document.getElementById('k_ort').value = 'Bern';
});
await page.click('#k_firma');
await page.type('#k_firma', 'Muster', { delay: 12 });
await page.waitForSelector('#kundeModal .gema-hr-drop.open .gema-hr-item', { timeout: 6000 });
await page.$eval('#kundeModal .gema-hr-drop .gema-hr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForFunction(() => document.getElementById('k_hrHint').textContent !== '', null, { timeout: 6000 });
{
  const v = await page.evaluate(() => ({
    str: document.getElementById('k_strasse').value,
    plz: document.getElementById('k_plz').value,
    ort: document.getElementById('k_ort').value,
    hint: document.getElementById('k_hrHint').textContent
  }));
  ok(v.str === 'Handerfasst 3' && v.plz === '3000' && v.ort === 'Bern', 'Firma ohne publizierte Adresse leert die erfasste nicht');
  ok(!/Adresse übernommen/.test(v.hint), 'kein Übernahme-Hinweis, wenn nichts übernommen wurde');
}
// Standard-Mock für die folgenden Abschnitte wiederherstellen
await page.unroute('**/functions/zefix*');
await page.route('**/functions/zefix*', route => {
  const detail = /[?&]uid=/.test(route.request().url());
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail ? ZEFIX_DETAIL : ZEFIX_SUCHE) });
});
await page.evaluate(() => erpKundeNeu());
await page.click('#k_firma');
await page.type('#k_firma', 'Muster', { delay: 12 });
await page.waitForSelector('#kundeModal .gema-hr-drop.open .gema-hr-item', { timeout: 6000 });
await page.$eval('#kundeModal .gema-hr-drop .gema-hr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForFunction(() => document.getElementById('k_hrHint').textContent !== '', null, { timeout: 6000 });

console.log('■ Handelsregister: Umtippen löst den Bezug wieder');
await page.click('#k_firma');
await page.type('#k_firma', ' Holding', { delay: 12 });
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.getElementById('k_hrHint').textContent === ''), 'Bestätigungs-Zeile verschwindet beim Umtippen');
await page.evaluate(() => { document.getElementById('k_firma').value = 'Freie Firma ohne HR'; erpKundeSave(); });
{
  const k = await page.evaluate(() => (erpKunden() || []).find(x => x.firma === 'Freie Firma ohne HR'));
  ok(k && !k.hr, 'Kein HR-Bezug gespeichert, wenn der Name nicht mehr zum Eintrag passt');
}

console.log('■ Handelsregister: fehlender Zugang degradiert sauber');
await page.unroute('**/functions/zefix*');
await page.route('**/functions/zefix*', route => route.fulfill({
  status: 502, contentType: 'application/json',
  body: JSON.stringify({ ok: false, error: 'Handelsregister-Zugang nicht konfiguriert oder abgelehnt — ZEFIX_USER/ZEFIX_PASSWORD in den Netlify-Einstellungen hinterlegen (kostenloses Konto auf zefix.admin.ch).' })
}));
await page.evaluate(() => erpKundeNeu());
await page.click('#k_firma');
await page.type('#k_firma', 'Testfirma', { delay: 12 });
await page.waitForFunction(() => {
  const d = document.querySelector('#kundeModal .gema-hr-drop');
  return d && /nicht konfiguriert/.test(d.textContent);
}, null, { timeout: 6000 });
ok(true, 'Klarer Konfigurations-Hinweis statt stiller Fehler');
ok(await page.evaluate(() => { document.getElementById('k_firma').value += ' AG'; return document.getElementById('k_firma').value === 'Testfirma AG'; }), 'Feld bleibt normal tippbar (Graceful Degradation)');
await page.evaluate(() => document.getElementById('kundeModal').classList.remove('open'));

console.log('■ Keine JS-Fehler');
ok(errors.length === 0, 'Keine pageerror-Meldungen' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
