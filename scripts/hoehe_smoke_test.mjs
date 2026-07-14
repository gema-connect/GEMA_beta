// Playwright-Smoke-Test für die Höhen-Übernahme ab Karte (gema_hoehe.js).
// swisstopo-APIs gemockt (SearchServer + Höhendienst), externe Hosts geblockt
// (Leaflet-CDN abortet → Karten-Degradation wird mitgetestet).
// Prüft: Auto-Prefill aus Objektadresse, Höhe-Anzeige, Übernahme in die
// Zielfelder (Druckdispositiv/Saugpumpe/Medizinalgas/Erdgas), Punkt-Korrektur
// mit Badge, Persistenz über Reload OHNE erneuten API-Call.
// Aufruf: CHROME=<chromium> node scripts/hoehe_smoke_test.mjs
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

function seedMitObjekt() {
  const s = seed(['role_planer']);
  s.gema_objekte_v1 = {
    objekte: [{ id: 'obj_t1', name: 'Testobjekt', strasse: 'Musterstrasse 12', plz: '4001', ort: 'Basel', orgId: 'org_test' }],
    beteiligte: [], activeObjektId: 'obj_t1'
  };
  s.gema_active_objekt_v1 = 'obj_t1';
  return s;
}

// Mock: SearchServer → fixe Koordinate Basel; Höhendienst → 428.2 (1. Call), 431.7 (danach)
async function mockGeoAdmin(ctx, counter) {
  await ctx.route(/api3\.geo\.admin\.ch\/rest\/services\/api\/SearchServer/, route => {
    counter.geocode++;
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      results: [{ attrs: { lat: 47.556614, lon: 7.592055, label: 'Musterstrasse 12 4001 Basel' } }]
    })});
  });
  await ctx.route(/api3\.geo\.admin\.ch\/rest\/services\/height/, route => {
    counter.height++;
    const h = counter.height === 1 ? '428.2' : '431.7';
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ height: h }) });
  });
}

async function openModule(file) {
  const counter = { geocode: 0, height: 0 };
  const { ctx, page } = await newPage(browser, seedMitObjekt());
  await mockGeoAdmin(ctx, counter);
  await page.goto(BASE + '/' + file, { waitUntil: 'domcontentloaded' });
  return { ctx, page, counter };
}

console.log('■ Druckdispositiv — Auto-Prefill, Übernahme, Korrektur, Persistenz');
{
  const { ctx, page, counter } = await openModule('sb_druckdispositiv.html');
  await page.waitForFunction(() => window._ghHooks && _ghHooks.state('ddGhState') != null, null, { timeout: 12000 });
  const st1 = await page.evaluate(() => _ghHooks.state('ddGhState'));
  ok(st1.hoehe === 428.2, 'Auto-Prefill aus Objektadresse → Höhe 428.2 m (Mock)');
  ok(counter.geocode >= 1 && counter.height === 1, 'genau 1 Höhen-Call beim Prefill');
  ok(await page.$eval('#ddGhState_adr', el => el.value.includes('Musterstrasse')), 'Adressfeld mit Objektadresse befüllt');
  ok(await page.$eval('#ddGhState_val', el => el.textContent.includes('428.2')), 'Karte-Karte zeigt 428.2 m ü.M.');
  ok(await page.$eval('#ddGhState_sub', el => el.textContent.includes("2'611'")), 'LV95-Koordinaten angezeigt (Basel ≈ 2\'611\'549)');
  ok(await page.$eval('#ddGhState_badge', el => el.style.display === 'none'), 'kein Korrektur-Badge beim Original-Punkt');
  ok(await page.$eval('#ddGhState_ph', el => el.style.display !== 'none' && el.textContent.includes('Karte nicht verfügbar')), 'Karten-Degradation ohne Leaflet (CDN geblockt) — Höhe trotzdem da');

  // Übernahme → hVerteilbatterie + Weiterrechnung (Höhendifferenz)
  await page.evaluate(() => _ghHooks.apply('ddGhState'));
  ok(await page.$eval('#hVerteilbatterie', el => el.value === '428.2'), 'Übernahme schreibt 428.2 in «Höhe Verteilbatterie»');
  await page.fill('#hReservoir', '628.2');
  await page.dispatchEvent('#hReservoir', 'input');
  ok(await page.$eval('#out-hoehendiff', el => el.textContent.trim().replace(',', '.').startsWith('200')), 'Weiterrechnung: Höhendifferenz Reservoir−VB = 200 m');

  // Punkt-Korrektur (~25 m) → neue Höhe + Badge
  await page.evaluate(() => _ghHooks.setPoint('ddGhState', 47.5568, 7.5921));
  await page.waitForFunction(() => _ghHooks.state('ddGhState') && _ghHooks.state('ddGhState').hoehe === 431.7, null, { timeout: 6000 });
  const st2 = await page.evaluate(() => _ghHooks.state('ddGhState'));
  ok(st2.korrigiert === true, 'Verschiebung > 1.5 m → Status «korrigiert»');
  ok(await page.$eval('#ddGhState_badge', el => el.style.display !== 'none'), 'Badge «Punkt manuell korrigiert» sichtbar');
  ok(await page.$eval('#ddGhState_print', el => el.textContent.includes('swissALTI3D') && el.textContent.includes('korrigiert')), 'Print-Zeile dokumentiert Quelle + Korrektur');

  // Persistenz: Reload → Zustand aus AutoSave, KEIN neuer API-Call
  counter.height = 100; counter.geocode = 100; // Marker: alles ab jetzt wäre "neu"
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window._ghHooks && _ghHooks.state('ddGhState') != null, null, { timeout: 12000 });
  const st3 = await page.evaluate(() => _ghHooks.state('ddGhState'));
  ok(st3.hoehe === 431.7 && st3.korrigiert === true, 'Reload: korrigierter Punkt aus AutoSave wiederhergestellt');
  ok(counter.height === 100 && counter.geocode === 100, 'Reload: kein erneuter API-Call (offline-fest aus State)');
  await ctx.close();
}

console.log('■ Saugpumpe — Übernahme in Höhenlage [h]');
{
  const { ctx, page } = await openModule('sb_saugpumpe.html');
  await page.waitForFunction(() => window._ghHooks && _ghHooks.state('sgGhState') != null, null, { timeout: 12000 });
  await page.evaluate(() => _ghHooks.apply('sgGhState'));
  ok(await page.$eval('#sg_h', el => el.value === '428.2'), 'Übernahme schreibt 428.2 in «Höhenlage [h]»');
  const last = await page.evaluate(() => window._sgLast);
  ok(Math.abs(last.h - 428.2) < 1e-9 && last.pLuft < 101325 && last.pLuft > 96000, 'sgRecalc lief: pLuft aus neuer Höhenlage');
  await ctx.close();
}

console.log('■ Medizinalgas — Übernahme als Luftdruck [mbar]');
{
  const { ctx, page } = await openModule('sb_druckverlust_medizinalgas.html');
  await page.waitForFunction(() => window._ghHooks && _ghHooks.state('mgGhState') != null, null, { timeout: 12000 });
  const mbar = await page.evaluate(() => Math.round(_ghHooks.engine.ghLuftdruckMbar(428.2)));
  ok(await page.$eval('#mgGhState_val2', (el, m) => el.textContent.includes('→ Luftdruck ' + m + ' mbar'), mbar), 'Widget zeigt Umrechnung «→ Luftdruck ' + mbar + ' mbar»');
  await page.evaluate(() => _ghHooks.apply('mgGhState'));
  ok(await page.$eval('#mg_luft', (el, m) => el.value === String(m), mbar), 'Übernahme schreibt ' + mbar + ' mbar in «Luftdruck»');
  await ctx.close();
}

console.log('■ Erdgas — Widget initialisiert + Übernahme');
{
  const { ctx, page } = await openModule('sb_druckverlust_erdgas.html');
  await page.waitForFunction(() => window._ghHooks && _ghHooks.state('egGhState') != null, null, { timeout: 12000 });
  await page.evaluate(() => _ghHooks.apply('egGhState'));
  const mbar = await page.evaluate(() => Math.round(_ghHooks.engine.ghLuftdruckMbar(428.2)));
  ok(await page.$eval('#eg_luft', (el, m) => el.value === String(m), mbar), 'Übernahme schreibt ' + mbar + ' mbar in «Luftdruck» (informativ)');
  await ctx.close();
}

console.log('■ Fehlerfall — Höhendienst nicht erreichbar');
{
  const counter = { geocode: 0, height: 0 };
  const { ctx, page } = await newPage(browser, seedMitObjekt());
  await ctx.route(/api3\.geo\.admin\.ch\/rest\/services\/api\/SearchServer/, route => {
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      results: [{ attrs: { lat: 47.556614, lon: 7.592055, label: 'Musterstrasse 12 4001 Basel' } }]
    })});
  });
  await ctx.route(/api3\.geo\.admin\.ch\/rest\/services\/height/, route => route.fulfill({ status: 500, body: 'err' }));
  await page.goto(BASE + '/sb_druckdispositiv.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const m = document.getElementById('ddGhState_msg');
    return m && m.textContent.includes('nicht erreichbar');
  }, null, { timeout: 12000 });
  ok(true, 'klare Fehlermeldung «Höhendienst nicht erreichbar — manuell eingeben»');
  ok(await page.$eval('#hVerteilbatterie', el => !el.disabled), 'manuelle Eingabe bleibt möglich');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail === 0 ? `✅ ${pass}/${pass + fail} Smoke-Checks grün` : `❌ ${fail}/${pass + fail} rot`));
process.exit(fail === 0 ? 0 : 1);
