// Playwright-Test: Adress-Vorschläge im Objekt-Erfassen-Dialog (pm_objekte)
//
// Vorher schrieb die Adress-Suche in VERSTECKTE Felder — fand swisstopo
// nichts, liess sich gar keine Adresse erfassen. Jetzt gleiches Muster wie
// if_wareneingang/pm_erp: das Strassen-Feld IST das Such-Input, Strasse/PLZ/
// Ort sind sichtbar und jederzeit von Hand korrigierbar.
//
// Ausführen: CHROME=<chromium> node scripts/objekt_adresse_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const SWISSTOPO = { results: [
  { attrs: { label: 'Bläsiring 153 <b>4057 Basel</b>', plz: 4057, gemeindename: 'Basel', kanton: 'BS' } },
  { attrs: { label: 'Bläsiring 155 <b>4057 Basel</b>', plz: 4057, gemeindename: 'Basel', kanton: 'BS' } }
] };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const _seed = seed(['role_planer']);
_seed['gema_coachmarks_done_pm_objekte'] = '1';   // Onboarding-Tour aus (Backdrop fängt sonst alle Klicks)
const { ctx, page } = await newPage(browser, _seed);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let apiCalls = 0;
await page.route('**/api3.geo.admin.ch/**', route => {
  apiCalls++;
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(SWISSTOPO) });
});

await page.goto(BASE + '/pm_objekte.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof openObjektModal === 'function', null, { timeout: 12000 });
await page.waitForTimeout(900);

console.log('■ Helper angebunden');
ok(await page.evaluate(() => typeof GemaAdresse !== 'undefined' && typeof GemaAdresse.attach === 'function'),
   'gema_adresse.js ist eingebunden (gleiche API wie im Wareneingang)');
ok(await page.evaluate(() => !!document.getElementById('objStrasse')._gemaAdresseAttached),
   'Strassen-Feld ist an GemaAdresse gebunden');
ok(await page.evaluate(() => {
  const c = document.getElementById('objStrasse')._gemaAdresseAttached;
  return !c.targets.strasse && !c.targets.plz && !c.targets.ort;
}), 'KEINE Target-Bindung (Nachtippen darf PLZ/Ort nicht leeren)');

console.log('■ Felder sind sichtbar und editierbar');
await page.evaluate(() => { openObjektModal(); document.getElementById('objName').value = 'Testprojekt'; _objWzGo(2); });
await page.waitForTimeout(350);
{
  const v = await page.evaluate(() => ['objStrasse', 'objPlz', 'objOrt'].map(id => {
    const e = document.getElementById(id);
    const r = e.getBoundingClientRect();
    return { id: id, sichtbar: r.width > 0 && r.height > 0, typ: e.type, gesperrt: e.readOnly || e.disabled };
  }));
  ok(v.every(x => x.sichtbar), 'Strasse, PLZ und Ort sind sichtbare Felder (vorher versteckt)');
  ok(v.every(x => x.typ !== 'hidden'), 'keines davon ist type="hidden"');
  ok(v.every(x => !x.gesperrt), 'alle drei sind frei editierbar');
}

console.log('■ Vorschläge erscheinen');
await page.click('#objStrasse');
await page.type('#objStrasse', 'Bläsiring', { delay: 14 });
await page.waitForSelector('#objModal .gema-adr-drop.open .gema-adr-item', { timeout: 6000 });
ok(apiCalls > 0, 'swisstopo wurde abgefragt');
{
  const items = await page.$$eval('#objModal .gema-adr-drop .gema-adr-item', els => els.map(e => e.textContent));
  ok(items.length === 2, 'Zwei Vorschläge im Dropdown');
  ok(/Bläsiring 153/.test(items[0]) && /4057 Basel/.test(items[0]), 'Vorschlag zeigt Strasse + PLZ/Ort');
}

console.log('■ Auswahl füllt die Felder getrennt');
await page.$eval('#objModal .gema-adr-drop .gema-adr-item', el => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForTimeout(150);
{
  const v = await page.evaluate(() => ({
    str: document.getElementById('objStrasse').value,
    plz: document.getElementById('objPlz').value,
    ort: document.getElementById('objOrt').value,
    gem: document.getElementById('objGemeinde').value,
    kt: document.getElementById('objKanton').value
  }));
  ok(v.str === 'Bläsiring 153', 'Strassen-Feld enthält NUR Strasse + Nr.');
  ok(v.plz === '4057' && v.ort === 'Basel', 'PLZ und Ort in ihren eigenen Feldern');
  ok(v.kt === 'BS', 'Kanton mitgeführt (für Behördenformulare)');
  ok(/Basel/.test(v.gem), 'Gemeinde mitgeführt');
}

console.log('■ Nachtippen leert PLZ/Ort nicht');
await page.type('#objStrasse', 'a', { delay: 14 });
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.getElementById('objPlz').value === '4057' && document.getElementById('objOrt').value === 'Basel'),
   'PLZ/Ort bleiben beim Korrigieren der Strasse erhalten');

console.log('■ Adresse ohne Treffer ist trotzdem erfassbar (der eigentliche Fehler)');
await page.evaluate(() => {
  document.getElementById('objStrasse').value = 'Neubauweg 1 (noch nicht im Register)';
  document.getElementById('objPlz').value = '9999';
  document.getElementById('objOrt').value = 'Musterhausen';
  saveObjekt();
});
await page.waitForTimeout(700);
{
  const o = await page.evaluate(() => (GemaObjekte.getAll() || []).find(x => x.name === 'Testprojekt'));
  ok(!!o, 'Objekt gespeichert');
  ok(o && o.strasse === 'Neubauweg 1 (noch nicht im Register)', 'frei getippte Strasse wurde übernommen');
  ok(o && o.plz === '9999' && o.ort === 'Musterhausen', 'frei getippte PLZ/Ort wurden übernommen');
}

console.log('■ Bearbeiten zeigt die gespeicherte Adresse in den Feldern');
{
  const id = await page.evaluate(() => (GemaObjekte.getAll() || []).find(x => x.name === 'Testprojekt').id);
  await page.evaluate(i => { openObjektModal(i); _objWzGo(2); }, id);
  await page.waitForTimeout(300);
  const v = await page.evaluate(() => ({
    str: document.getElementById('objStrasse').value,
    plz: document.getElementById('objPlz').value,
    ort: document.getElementById('objOrt').value
  }));
  ok(v.str === 'Neubauweg 1 (noch nicht im Register)' && v.plz === '9999' && v.ort === 'Musterhausen',
     'Adresse wird beim Bearbeiten korrekt vorbefüllt');
}

console.log('■ Keine JS-Fehler');
ok(errors.length === 0, 'Keine pageerror-Meldungen' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await ctx.close();
await browser.close();
server.close();
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + '/' + (pass + fail) + ' Checks');
process.exit(fail === 0 ? 0 : 1);
