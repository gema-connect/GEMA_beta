// Playwright-Smoke: Einsatzplan — Besonderheiten + Schlüssel/Zutritt (07/2026)
//   - org.settings.einsatzplan.besonderheiten: frei definierbare Monteur-Hinweise
//     (Icon + Label, Editor in ⚙️ mit «Beispiele einfügen», IDs bleiben stabil)
//   - Pro Einsatz anhakbar (Mehrfachauswahl) — sichtbar als Icons (Woche/Monat)
//     und volle Pills (Tages-Modal, «Meine Woche», pm_stunden «Geplante Einsätze»)
//   - ERP-Auftrag trägt 🔑 schluessel {code, info} — der Einsatz zeigt Code +
//     Abholort live vom Auftrag (Meine Woche + Einsatz-Modal); Offerte hat das
//     Feld nicht; Notify-Text nennt Besonderheiten, NIE den Schlüsselcode
// Ausführen: CHROME=<chromium> node scripts/einsatzplan_besonderheiten_test.mjs
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

// ════════ 1) Einsatzplan: Einstellungen + Einsatz + Sichten ════════
console.log('■ Einstellungen: Besonderheiten-Editor mit Beispielen');
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof epOpenSettings === 'function' && typeof bsListe === 'function', null, { timeout: 12000 });
await page.waitForTimeout(600);

await page.evaluate(() => epOpenSettings());
ok(await page.evaluate(() => document.querySelectorAll('#ep_bsRows .bs-row').length === 0), 'Editor startet leer');
await page.evaluate(() => bsVorlagenEinfuegen());
ok(await page.evaluate(() => document.querySelectorAll('#ep_bsRows .bs-row').length >= 5), '«Beispiele einfügen» legt die Startliste an');
await page.evaluate(() => epSetSave());
await page.waitForTimeout(300);
{
  const l = await page.evaluate(() => bsListe());
  ok(l.length >= 5 && l[0].id.indexOf('bs_') === 0 && l.some(b => b.label === 'Material im Lager bereit' && b.ic === '📦'), 'Gespeichert: ' + l.length + ' Besonderheiten mit bs_-IDs');
}
// Umbenennen behält die ID (data-id-Pfad)
await page.evaluate(() => epOpenSettings());
{
  const vorherId = await page.evaluate(() => bsListe()[0].id);
  await page.evaluate(() => {
    const row = document.querySelector('#ep_bsRows .bs-row');
    row.querySelector('.bs-label').value = 'Material bereitgestellt (Lager 2)';
    epSetSave();
  });
  await page.waitForTimeout(200);
  ok(await page.evaluate(id => bsListe()[0].id === id && bsListe()[0].label === 'Material bereitgestellt (Lager 2)', vorherId), 'Umbenennen behält die ID');
}

console.log('■ Einsatz: Besonderheiten anhaken + Sichten');
// Planer selbst als einplanbare Person zulassen (userIds)
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const org = GemaAuth.getOrgs()[0];
  const st = org.settings || {};
  st.einsatzplan = Object.assign({}, st.einsatzplan, { userIds: [u.id] });
  GemaAuth.updateOrgSettings(org.id, st);
});
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  epNeu(u.id, '2026-07-20');
});
ok(await page.evaluate(() => document.getElementById('evBesWrap').style.display !== 'none' && document.querySelectorAll('#evBes .tchip').length >= 5), 'Modal zeigt die Besonderheiten-Chips');
await page.evaluate(() => {
  const ids = bsListe().slice(0, 2).map(b => b.id);
  epBesToggle(ids[0]); epBesToggle(ids[1]);
  document.getElementById('ev_titel').value = 'Steigzone EG';
  epEvSave();
});
await page.waitForTimeout(200);
{
  const ev = await page.evaluate(() => poolRead().find(e => e.titel === 'Steigzone EG'));
  ok(ev && (ev.besonderheiten || []).length === 2, 'Einsatz gespeichert mit 2 Besonderheiten');
}
await page.evaluate(() => { _anker = '2026-07-20'; _view = 'woche'; epRender(); });
ok(await page.evaluate(() => {
  const html = document.getElementById('viewWrap').innerHTML;
  return html.indexOf('title="Material bereitgestellt (Lager 2)"') >= 0 && html.indexOf('📦') >= 0;
}), 'Woche: Icons mit Label-Tooltip auf der Karte');
await page.evaluate(() => { _view = 'monat'; epRender(); });
ok(await page.evaluate(() => document.getElementById('viewWrap').innerHTML.indexOf('📦') >= 0), 'Monat: Icon in der Tages-Zelle');
await page.evaluate(() => epDayOpen('2026-07-20'));
ok(await page.evaluate(() => document.getElementById('dayBody').innerHTML.indexOf('Material bereitgestellt (Lager 2)') >= 0), 'Tages-Modal: volle Pills');
await page.evaluate(() => document.getElementById('dayModal').classList.remove('open'));

console.log('■ Schlüssel/Zutritt vom Auftrag (Live-Lookup im ERP-Pool)');
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const auftrag = { id: 'au_key', orgId: u.orgId, typ: 'auftrag', nr: 'AU-2026-009', titel: 'Boiler ersetzen', status: 'offen', positionen: [], kundeSnapshot: { firma: 'Muster AG' }, schluessel: { code: '4711', info: 'Hauswart Müller, 079 111 22 33' } };
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([auftrag]));
  _epErpMemo = { t: 0, l: null };
  epNeuAusAuftrag(auftrag, u.id, '2026-07-21');
});
await page.waitForTimeout(200);
await page.evaluate(() => { _anker = '2026-07-21'; _view = 'meine'; epRender(); });
{
  const html = await page.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(html.indexOf('4711') >= 0 && html.indexOf('Hauswart Müller') >= 0, 'Meine Woche: Schlüsselcode + Abholort sichtbar');
  ok(html.indexOf('Schlüssel/Zutritt') >= 0, 'Meine Woche: 🔑-Box beschriftet');
}
await page.evaluate(() => { _view = 'woche'; epRender(); });
ok(await page.evaluate(() => document.getElementById('viewWrap').innerHTML.indexOf('🔑') >= 0), 'Woche: 🔑-Marker auf der Karte');
{
  const evId = await page.evaluate(() => poolRead().find(e => e.auftragId === 'au_key').id);
  await page.evaluate(id => epEvOpen(id), evId);
  ok(await page.evaluate(() => document.getElementById('evKeyInfo').innerHTML.indexOf('4711') >= 0), 'Einsatz-Modal: Schlüssel-Info unter der Auftrags-Wahl');
  await page.evaluate(() => epEvClose());
}
// Notify: Besonderheiten ja, Schlüsselcode nie
{
  const res = await page.evaluate(() => {
    const bs = bsListe()[0];
    let captured = null;
    const orig = GemaNotify.push;
    GemaNotify.push = o => { captured = o; };
    epNotify({ monteurUserId: 'user_fremd', titel: 'Boiler', datum: '2026-07-21', slot: 'ganz', auftragId: 'au_key', besonderheiten: [bs.id] }, 'geplant');
    GemaNotify.push = orig;
    return captured;
  });
  ok(res && res.text.indexOf('Material bereitgestellt (Lager 2)') >= 0, 'Notify nennt die Besonderheiten');
  ok(res && res.text.indexOf('4711') < 0, 'Notify enthält NIE den Schlüsselcode');
}
ok(errors.length === 0, 'Einsatzplan: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
await ctx.close();

// ════════ 2) ERP: Schlüssel-Felder nur am Auftrag ════════
console.log('■ ERP: 🔑 Schlüssel / Zutritt am Auftrag');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpNeu === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => { erpNeu('auftrag'); cur.titel = 'Auftrag mit Schlüssel'; erpOpenEditor(); });
  ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('Schlüssel / Zutritt') >= 0), 'Auftrag-Editor zeigt die 🔑-Sektion');
  await page.evaluate(() => {
    const code = document.querySelector('#edBody input[placeholder^="Schlüsselcode"]');
    code.value = '2580'; code.dispatchEvent(new Event('input', { bubbles: true }));
    const info = document.querySelector('#edBody input[placeholder^="Schlüssel wo"]');
    info.value = 'Abholen im Büro Verwaltung'; info.dispatchEvent(new Event('input', { bubbles: true }));
    erpSaveCur(true);
  });
  ok(await page.evaluate(() => {
    const d = poolRead(DOK_POOL).find(x => x.titel === 'Auftrag mit Schlüssel');
    return d && d.schluessel && d.schluessel.code === '2580' && d.schluessel.info === 'Abholen im Büro Verwaltung';
  }), 'schluessel {code, info} im Auftrag gespeichert');
  await page.evaluate(() => { erpNeu('offerte'); erpOpenEditor(); });
  ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('Schlüssel / Zutritt') < 0), 'Offerte hat KEINE Schlüssel-Sektion');
  ok(errs.length === 0, 'ERP: keine JS-Fehler' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx.close();
}

// ════════ 3) pm_stunden: Chips in «Geplante Einsätze» ════════
console.log('■ pm_stunden: Besonderheiten in der Tagesansicht');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof stRender === 'function' && typeof stBesChips === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const u = GemaAuth.getCurrentUser();
    const org = GemaAuth.getOrgs()[0];
    const st = org.settings || {};
    st.einsatzplan = Object.assign({}, st.einsatzplan, { besonderheiten: [{ id: 'bs_leiter', label: 'Grosse Leiter mitnehmen', ic: '🪜' }] });
    GemaAuth.updateOrgSettings(org.id, st);
    const heute = today();
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify([{ id: 'ev_std', orgId: u.orgId, typ: 'frei', titel: 'Service Meier', monteurUserId: u.id, monteurName: u.name, datum: heute, dauerTage: 1, slot: 'ganz', besonderheiten: ['bs_leiter'] }]));
    _wkMode = 'tag'; _tagDatum = heute; stRender();
  });
  await page.waitForTimeout(200);
  {
    const html = await page.evaluate(() => document.body.innerHTML);
    ok(html.indexOf('Geplante Einsätze') >= 0 && html.indexOf('Service Meier') >= 0, 'Karte «Geplante Einsätze» zeigt den Einsatz');
    ok(html.indexOf('🪜 Grosse Leiter mitnehmen') >= 0, 'Besonderheiten-Chip sichtbar beim Monteur');
  }
  ok(errs.length === 0, 'pm_stunden: keine JS-Fehler' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
