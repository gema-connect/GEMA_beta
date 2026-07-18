// Playwright-Smoke: Service & Wartung ↔ Einsatzplan/ERP-Verknüpfung (07/2026)
//   - Anlage trägt 🔑 schluessel {code,info} + bereichId (Arbeitsbereich) —
//     Formular, Karte (🔑 + Farbpunkt) und Doku-/QR-Modal zeigen sie
//   - «📅 Einsatz planen» übergibt Schlüssel-Snapshot, Arbeitsbereich und
//     angehakte Besonderheiten an den Einsatzplan-Termin (typ frei,
//     serviceAuftragId); Notify nennt Besonderheiten, NIE den Code
//   - pm_einsatzplan: epSchluessel liest das EIGENE ev.schluessel-Feld zuerst
//     (Service-Einsätze haben keinen ERP-Auftrag) — 🔑-Box im Tages-Modal
//   - svMakeRechnung setzt sachbearbeiter (= Ersteller) auf die ERP-Rechnung
// Ausführen: CHROME=<chromium> node scripts/service_einsatz_verknuepfung_test.mjs
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

console.log('■ Service: Anlage mit Schlüssel + Bereich erfassen');
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/sv_service.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof svAnlNeu === 'function' && typeof svBesListe === 'function', null, { timeout: 12000 });
await page.waitForTimeout(600);

// Org-Settings: Arbeitsbereiche + Besonderheiten (nach dem Boot seeden)
await page.evaluate(() => {
  const org = GemaAuth.getOrgs()[0];
  const st = org.settings || {};
  st.arbeitsbereiche = [{ id: 'ab_service', name: 'Sanitärservice', farbe: '#16a34a' }];
  st.einsatzplan = Object.assign({}, st.einsatzplan, { besonderheiten: [
    { id: 'bs_filter', label: 'Ersatzfilter mitnehmen', ic: '🧰' },
    { id: 'bs_leiter', label: 'Grosse Leiter mitnehmen', ic: '🪜' }
  ]});
  GemaAuth.updateOrgSettings(org.id, st);
});
await page.evaluate(() => {
  svAnlNeu();
  document.getElementById('an_name').value = 'Osmoseanlage Labor';
  document.getElementById('an_kat').value = 'Osmose';
  document.getElementById('an_standort').value = 'Technikraum UG';
  document.getElementById('an_sk_code').value = '4711';
  document.getElementById('an_sk_info').value = 'Hauswart Müller, 079 111 22 33';
  document.getElementById('an_intervall').value = '6';
  document.getElementById('an_letzte').value = '2025-01-10';
  document.getElementById('an_bereich').value = 'ab_service';
  svAnlSave();
});
await page.waitForTimeout(400);
{
  const a = await page.evaluate(() => poolRead('anl').find(x => x.name === 'Osmoseanlage Labor'));
  ok(a && a.schluessel && a.schluessel.code === '4711' && a.schluessel.info.indexOf('Hauswart') === 0, 'Anlage speichert schluessel {code, info}');
  ok(a && a.bereichId === 'ab_service', 'Anlage speichert den Arbeitsbereich');
}
ok(await page.evaluate(() => {
  const wrap = document.getElementById('anBereichWrap');
  return wrap && wrap.style.display !== 'none';
}), 'Formular zeigt das Bereich-Feld (Bereiche definiert)');
// Karte: 🔑 + Farbpunkt; Fälligkeits-Scan hat einen offenen Auftrag erzeugt (letzte Wartung > 6 Mt)
await page.evaluate(() => svRender());
{
  const html = await page.evaluate(() => document.body.innerHTML);
  ok(html.indexOf('🔑') >= 0 && html.indexOf('Sanitärservice') >= 0, 'Anlagen-Karte zeigt 🔑 + Bereich');
}
{
  const auf = await page.evaluate(() => poolRead('auf').find(x => x.anlageName === 'Osmoseanlage Labor' && x.status === 'offen'));
  ok(!!auf, 'Fälligkeits-Scan: offener Serviceauftrag vorhanden');
  await page.evaluate(id => { window._aufId = id; }, auf ? auf.id : '');
}

console.log('■ Einsatz planen: Besonderheiten + Schlüssel + Bereich wandern mit');
await page.evaluate(() => svPlanOpen(window._aufId));
ok(await page.evaluate(() => document.getElementById('plBesWrap').style.display !== 'none' && document.querySelectorAll('#pl_bes button').length === 2), 'Plan-Modal zeigt die Besonderheiten-Chips');
ok(await page.evaluate(() => document.getElementById('pl_key').innerHTML.indexOf('4711') >= 0), 'Plan-Modal zeigt die Schlüssel-Box der Anlage');
{
  const captured = await page.evaluate(() => {
    svPlanBesToggle('bs_filter');
    // Monteur-Option injizieren (Test-Org hat keine Monteur-Rolle) + Notify abfangen
    const sel = document.getElementById('pl_monteur');
    sel.innerHTML = '<option value="u_mont">Marco Monteur</option>';
    sel.value = 'u_mont';
    document.getElementById('pl_datum').value = '2026-07-24';
    let cap = null;
    const orig = GemaNotify.push;
    GemaNotify.push = o => { cap = o; };
    svPlanSave();
    GemaNotify.push = orig;
    return cap;
  });
  await page.waitForTimeout(300);
  const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_einsatz_pool_v1') || '[]').find(e => e.serviceAuftragId === window._aufId));
  ok(ev && ev.schluessel && ev.schluessel.code === '4711', 'Einsatz trägt den Schlüssel-Snapshot der Anlage');
  ok(ev && ev.bereichId === 'ab_service', 'Einsatz erbt den Arbeitsbereich der Anlage');
  ok(ev && (ev.besonderheiten || []).join(',') === 'bs_filter', 'Einsatz trägt die angehakte Besonderheit');
  ok(captured && captured.text.indexOf('Ersatzfilter mitnehmen') >= 0, 'Notify nennt die Besonderheit');
  ok(captured && captured.text.indexOf('4711') < 0, 'Notify enthält NIE den Schlüsselcode');
  const auf = await page.evaluate(() => poolRead('auf').find(x => x.id === window._aufId));
  ok(auf && auf.status === 'eingeplant' && auf.einsatzId, 'Serviceauftrag → eingeplant mit einsatzId');
}

console.log('■ Doku-/QR-Modal + Service-Rechnung');
await page.evaluate(() => {
  const a = poolRead('anl').find(x => x.name === 'Osmoseanlage Labor');
  svDokuOpen(a.id);
});
ok(await page.evaluate(() => document.getElementById('dok_key').innerHTML.indexOf('4711') >= 0), 'Wartungs-Doku-Modal (QR vor Ort) zeigt die Schlüssel-Box');
await page.evaluate(() => svClose('dokModal'));
{
  const doc = await page.evaluate(() => svMakeRechnung({ titel: 'Test-Service', positionen: [] }));
  ok(doc && doc.sachbearbeiter && doc.sachbearbeiter.userId === (await page.evaluate(() => GemaAuth.getCurrentUser().id)), 'Service-Rechnung trägt den Sachbearbeiter (= Ersteller)');
}
ok(errors.length === 0, 'Service: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
await ctx.close();

console.log('■ Einsatzplan: eigenes ev.schluessel-Feld hat Vorrang');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epSchluessel === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const u = GemaAuth.getCurrentUser();
    const org = GemaAuth.getOrgs()[0];
    const st = org.settings || {};
    st.einsatzplan = Object.assign({}, st.einsatzplan, { besonderheiten: [{ id: 'bs_filter', label: 'Ersatzfilter mitnehmen', ic: '🧰' }] });
    GemaAuth.updateOrgSettings(org.id, st);
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify([{
      id: 'ev_srv', orgId: u.orgId, typ: 'frei', titel: '🛠 Service: Osmoseanlage Labor',
      monteurUserId: u.id, monteurName: u.name, datum: '2026-07-24', dauerTage: 1, slot: 'ganz',
      serviceAuftragId: 'auf_x', besonderheiten: ['bs_filter'],
      schluessel: { code: '4711', info: 'Hauswart Müller' },
      erstelltVon: { userId: u.id, name: u.name }
    }]));
  });
  ok(await page.evaluate(() => {
    const s = epSchluessel({ schluessel: { code: '9', info: '' }, auftragId: '' });
    return s && s.code === '9';
  }), 'epSchluessel: eigenes Feld funktioniert ohne Auftrag');
  await page.evaluate(() => epDayOpen('2026-07-24'));
  {
    const html = await page.evaluate(() => document.getElementById('dayBody').innerHTML);
    ok(html.indexOf('4711') >= 0 && html.indexOf('Hauswart Müller') >= 0, 'Tages-Modal: 🔑-Box des Service-Einsatzes');
    ok(html.indexOf('Ersatzfilter mitnehmen') >= 0, 'Tages-Modal: Besonderheiten-Pill des Service-Einsatzes');
  }
  ok(errs.length === 0, 'Einsatzplan: keine JS-Fehler' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
