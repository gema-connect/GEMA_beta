// Playwright-Suite: Monteur-Gruppen im Termine-Modul (Feedback 31.07.2026)
// — org-weite Gruppen (Servicemonteur/Sanitärmonteur/Spengler …) im ⚙️-Editor
//   (Vorlagen, 👥-Personen-Picker pro Gruppe, stabile IDs beim Umbenennen),
// — Gruppen-Filter in der Plantafel: Woche zeigt nur Personen der Gruppe,
//   Monat + Tages-Modal nur deren Termine; «– ohne Gruppe –»; pro Gerät
//   persistiert; unbekannte gespeicherte Gruppe rendert wie «Alle», die
//   Wahl wird NIE zurückgesetzt; Termin-Modal-Dropdown bleibt UNGEFILTERT.
// Aufruf: CHROME=<chromium> node scripts/einsatzplan_gruppen_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, newPage, seed } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let n = 0, fail = 0;
function ok(name, cond) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } }

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });

function heute() { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

function baseSeed(extra) {
  const s = seed(['role_planer']);
  s.gema_users_v1.push(
    { id: 'u_mon1', username: 'm1@test.ch', name: 'Max Sanitär', roleIds: ['role_monteur'], orgId: 'org_test', active: true },
    { id: 'u_mon2', username: 'm2@test.ch', name: 'Peter Blech', roleIds: ['role_spengler'], orgId: 'org_test', active: true },
    { id: 'u_mon3', username: 'm3@test.ch', name: 'Nino Neutral', roleIds: ['role_monteur'], orgId: 'org_test', active: true }
  );
  if (extra) extra(s);
  return s;
}

async function open(seedObj, query) {
  const { ctx, page } = await newPage(browser, seedObj);
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html' + (query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewWrap', { timeout: 9000 });
  return { ctx, page, errs };
}

try {
  /* ─── A) ⚙️-Editor: Vorlagen + Zuordnung + Save ─── */
  console.log('■ A) Editor — Gruppen anlegen + Personen zuordnen');
  const { ctx, page, errs } = await open(baseSeed());
  await page.waitForFunction(() => typeof window.epOpenSettings === 'function', null, { timeout: 6000 });
  await page.evaluate(() => window.epOpenSettings());
  ok('Sektion «Monteur-Gruppen» im ⚙️-Modal', await page.$('#ep_grRows') != null);
  ok('ohne Gruppen: kein Filter in der Toolbar', await page.$('#epGrpFilter') == null);
  await page.evaluate(() => window.grVorlagenEinfuegen());
  const rows = await page.$$eval('#ep_grRows .gr-row', els => els.length);
  ok('«↺ Beispiele einfügen» legt 5 Vorlagen an', rows === 5);
  const labels = await page.$$eval('#ep_grRows .gr-label', els => els.map(e => e.value));
  ok('Vorlagen enthalten Servicemonteur/Sanitärmonteur/Spengler', labels.includes('Servicemonteur') && labels.includes('Sanitärmonteur') && labels.includes('Spengler'));
  // Zuordnung: Sanitärmonteur → u_mon1, Spengler → u_mon2 (👥-Picker)
  const zug = await page.evaluate(() => {
    function assign(lbl, uid) {
      const row = Array.from(document.querySelectorAll('#ep_grRows .gr-row')).find(r => r.querySelector('.gr-label').value === lbl);
      if (!row) return false;
      row.querySelector('.gr-pick-btn').click();                       // Panel auf
      const cb = row.querySelector('.gr-u[data-uid="' + uid + '"]');
      if (!cb) return false;
      cb.click();                                                      // onchange → grPickCount
      return row.querySelector('.gr-pick-btn').textContent.trim();
    }
    return { a: assign('Sanitärmonteur', 'u_mon1'), b: assign('Spengler', 'u_mon2') };
  });
  ok('👥-Zähler folgt der Auswahl (je 1 Person)', zug.a === '👥 1' && zug.b === '👥 1');
  await page.evaluate(() => window.epSetSave());
  const saved = await page.evaluate(() => {
    const o = GemaAuth.getCurrentOrg();
    return (o && o.settings && o.settings.einsatzplan) || {};
  });
  ok('gruppen gespeichert (5, IDs gr_*)', Array.isArray(saved.gruppen) && saved.gruppen.length === 5 && saved.gruppen.every(g => /^gr_/.test(g.id)));
  ok('userGruppen: u_mon1 → Sanitärmonteur, u_mon2 → Spengler', JSON.stringify(saved.userGruppen && saved.userGruppen.u_mon1) === '["gr_sanitaermonteur"]' && JSON.stringify(saved.userGruppen && saved.userGruppen.u_mon2) === '["gr_spengler"]');
  ok('u_mon3 ohne Gruppe (kein Eintrag)', !(saved.userGruppen || {}).u_mon3);

  /* ─── B) Filter in der Wochen-Plantafel ─── */
  console.log('■ B) Woche — «Sanitär einblenden» zeigt nur diese Monteure');
  ok('Filter-Select erscheint (Gruppen definiert)', await page.$('#epGrpFilter') != null);
  const alle = await page.$$eval('#viewWrap td.mn', els => els.map(e => e.textContent));
  ok('ohne Filter: alle 3 Monteure als Zeilen', alle.length === 3);
  await page.evaluate(() => window.epGrpFilterSet('gr_sanitaermonteur'));
  const nurSan = await page.$$eval('#viewWrap td.mn', els => els.map(e => e.textContent));
  ok('Filter Sanitärmonteur: NUR Max Sanitär sichtbar', nurSan.length === 1 && /Max Sanitär/.test(nurSan[0]));
  ok('Wahl pro Gerät gespeichert (gema_ep_grpfilter_v1)', await page.evaluate(() => localStorage.getItem('gema_ep_grpfilter_v1')) === 'gr_sanitaermonteur');
  await page.evaluate(() => window.epGrpFilterSet('__ohne'));
  const ohne = await page.$$eval('#viewWrap td.mn', els => els.map(e => e.textContent));
  ok('«– ohne Gruppe –»: NUR Nino Neutral', ohne.length === 1 && /Nino Neutral/.test(ohne[0]));
  await page.evaluate(() => window.epGrpFilterSet('gr_heizungsmonteur'));
  const leerTxt = await page.$eval('#viewWrap', el => el.textContent);
  ok('leere Gruppe: erklärender Hinweis statt generischem Leerzustand', /Keine Personen in der Gruppe/.test(leerTxt) && /Heizungsmonteur/.test(leerTxt));
  // Termin-Modal-Dropdown bleibt UNGEFILTERT (Filter ist reine Anzeige)
  await page.evaluate(() => window.epNeu());
  const optN = await page.$$eval('#ev_monteur option', els => els.length);
  ok('Termin-Modal: Monteur-Dropdown ungefiltert (– wählen – + 3)', optN === 4);
  await page.evaluate(() => window.epEvClose());
  ok('keine pageerrors (Editor + Filter)', errs.length === 0 || (console.log('   errs:', errs), false));
  await ctx.close();

  /* ─── C) Boot mit gespeicherten Gruppen + Filter · Monat + Tages-Modal ─── */
  console.log('■ C) Monat + Tages-Modal folgen dem Filter (Boot-Persistenz)');
  const t = heute();
  const seed2 = baseSeed(s => {
    s.gema_orgs_v1[0].settings = { einsatzplan: {
      gruppen: [{ id: 'gr_sanitaermonteur', label: 'Sanitärmonteur' }, { id: 'gr_spengler', label: 'Spengler' }],
      userGruppen: { u_mon1: ['gr_sanitaermonteur'], u_mon2: ['gr_spengler'] }
    } };
    s.gema_ep_grpfilter_v1 = 'gr_sanitaermonteur';
  });
  const { ctx: c2, page: p2, errs: e2 } = await open(seed2);
  const bootRows = await p2.$$eval('#viewWrap td.mn', els => els.map(e => e.textContent));
  ok('Boot: gespeicherter Filter greift sofort (nur Max Sanitär)', bootRows.length === 1 && /Max Sanitär/.test(bootRows[0]));
  ok('Select zeigt die gespeicherte Wahl', await p2.$eval('#epGrpFilter', el => el.value) === 'gr_sanitaermonteur');
  // Termine NACH dem (leeren) Cloud-Pull seeden — der bindCollection-Mock
  // liefert [], ein Vor-Boot-Seed würde damit überschrieben (Harness-Regel)
  await p2.waitForFunction(() => window._epCloudLoaded === true, null, { timeout: 9000 });
  await p2.evaluate(tag => {
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify([
      { id: 'ev_a', orgId: 'org_test', typ: 'frei', titel: 'Boiler entkalken', monteurUserId: 'u_mon1', monteurName: 'Max Sanitär', datum: tag, slot: 'ganz', dauerTage: 1 },
      { id: 'ev_b', orgId: 'org_test', typ: 'frei', titel: 'Dachrinne flicken', monteurUserId: 'u_mon2', monteurName: 'Peter Blech', datum: tag, slot: 'ganz', dauerTage: 1 },
      { id: 'ev_c', orgId: 'org_test', typ: 'frei', titel: 'Ohne Monteur', monteurUserId: '', monteurName: '', datum: tag, slot: 'ganz', dauerTage: 1 }
    ]));
    window._view = 'monat'; window.epRender();
  }, t);
  const monat = await p2.$eval('#viewWrap', el => el.textContent);
  ok('Monat: Sanitär-Termin sichtbar, Spengler-Termin AUSGEBLENDET', /Boiler entkalken/.test(monat) && !/Dachrinne flicken/.test(monat));
  ok('Monat: Termin OHNE Monteur bleibt IMMER sichtbar', /Ohne Monteur/.test(monat));
  await p2.evaluate(d => window.epDayOpen(d), t);
  const day = await p2.$eval('#dayBody', el => el.textContent);
  ok('Tages-Modal folgt dem Filter (Boiler ja, Dachrinne nein, ohne Monteur ja)', /Boiler entkalken/.test(day) && !/Dachrinne flicken/.test(day) && /Ohne Monteur/.test(day));
  ok('keine pageerrors (Monat)', e2.length === 0 || (console.log('   errs:', e2), false));
  await c2.close();

  /* ─── D) Unbekannte gespeicherte Gruppe → rendert wie «Alle», Wahl bleibt ─── */
  console.log('■ D) Robustheit — gelöschte/unbekannte Gruppe im Filter');
  const seed3 = baseSeed(s => {
    s.gema_orgs_v1[0].settings = { einsatzplan: {
      gruppen: [{ id: 'gr_spengler', label: 'Spengler' }],
      userGruppen: { u_mon2: ['gr_spengler'] }
    } };
    s.gema_ep_grpfilter_v1 = 'gr_geloescht';
  });
  const { ctx: c3, page: p3 } = await open(seed3);
  const rowsD = await p3.$$eval('#viewWrap td.mn', els => els.length);
  ok('unbekannte Gruppe: ALLE Personen sichtbar (kein Leerlauf)', rowsD === 3);
  ok('gespeicherte Wahl wird NIE zurückgesetzt', await p3.evaluate(() => localStorage.getItem('gema_ep_grpfilter_v1')) === 'gr_geloescht');
  await c3.close();

  /* ─── E) Umbenennen behält die ID (Zuordnung + Filter überleben) ─── */
  console.log('■ E) Editor — Umbenennen behält die Gruppen-ID');
  const seed4 = baseSeed(s => {
    s.gema_orgs_v1[0].settings = { einsatzplan: {
      gruppen: [{ id: 'gr_sanitaermonteur', label: 'Sanitärmonteur' }],
      userGruppen: { u_mon1: ['gr_sanitaermonteur'] }
    } };
  });
  const { ctx: c4, page: p4 } = await open(seed4);
  await p4.evaluate(() => window.epOpenSettings());
  const vorbelegt = await p4.evaluate(() => {
    const row = document.querySelector('#ep_grRows .gr-row');
    return { id: row.getAttribute('data-id'), n: row.querySelectorAll('.gr-u:checked').length, btn: row.querySelector('.gr-pick-btn').textContent.trim() };
  });
  ok('bestehende Zuordnung im Editor vorbelegt (👥 1)', vorbelegt.id === 'gr_sanitaermonteur' && vorbelegt.n === 1 && vorbelegt.btn === '👥 1');
  await p4.evaluate(() => { document.querySelector('#ep_grRows .gr-label').value = 'Sanitär & Service'; window.epSetSave(); });
  const nachher = await p4.evaluate(() => {
    const o = GemaAuth.getCurrentOrg();
    return (o.settings && o.settings.einsatzplan) || {};
  });
  ok('ID bleibt beim Umbenennen stabil', nachher.gruppen.length === 1 && nachher.gruppen[0].id === 'gr_sanitaermonteur' && nachher.gruppen[0].label === 'Sanitär & Service');
  ok('Zuordnung überlebt das Umbenennen', JSON.stringify(nachher.userGruppen.u_mon1) === '["gr_sanitaermonteur"]');
  // Merge-Save: fremde einsatzplan-Keys überleben den Modal-Save
  ok('tagVon/tagBis nach Save vorhanden (Merge statt Ersetzen)', nachher.tagVon != null && nachher.tagBis != null);
  await c4.close();

} catch (e) {
  fail++; console.error('  ✗ EXCEPTION:', e.message, e.stack && e.stack.split('\n')[1]);
} finally {
  await browser.close();
  server.close();
}

console.log('\n' + (fail ? ('✗ ' + fail + ' von ' + n + ' fehlgeschlagen') : ('✓ Alle ' + n + ' Gruppen-Checks grün')));
process.exit(fail ? 1 : 0);
