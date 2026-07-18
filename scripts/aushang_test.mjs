// Playwright-Smoke: Aushang (Mieter-Mitteilung) — gema_aushang.js (07/2026)
//   - Standardisierte Vorlagen (Wasser/Strom/Heizung/Boiler/Filter/Allgemein),
//     Text anpassbar, org-weit überschreibbar («Als Vorlage speichern»)
//   - Pflicht-Zeitangabe von–bis + Datum; A4-Poster-Druckfenster mit grosser
//     Datum/Zeit-Box (langes deutsches Datum mit Wochentag)
//   - pm_erp: Auftrag-Flag «Aushang nötig» + Vorlage + «Aushang erstellen»
//   - pm_einsatzplan: Erinnerung beim Einplanen eines geflaggten Auftrags,
//     📌-Block im Einsatz-Modal, Daten am Einsatz gespeichert; verschobener
//     Termin druckt NIE das alte Datum
//   - sv_service: Flag an der Anlage (wiederkehrend, MFH), Hinweis im
//     Plan-Modal, Prompt nach dem Einplanen, 📌-Button am Serviceauftrag
// Ausführen: CHROME=<chromium> node scripts/aushang_test.mjs
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

// ════════ 1) Helper + pm_erp (Auftrag-Flag + Druck) ════════
console.log('■ Vorlagen + Auftrag-Flag (pm_erp)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpNeu === 'function' && typeof GemaAushang !== 'undefined', null, { timeout: 12000 });
  await page.waitForTimeout(400);

  const vl = await page.evaluate(() => GemaAushang.vorlagen().map(v => v.id));
  ok(vl.length >= 6 && vl.includes('wasser') && vl.includes('strom') && vl.includes('boiler') && vl.includes('filter'), 'Standard-Vorlagen vorhanden (' + vl.join(', ') + ')');

  await page.evaluate(() => {
    erpNeu('auftrag');
    cur.titel = 'Steigzonen-Sanierung';
    cur.kundeSnapshot = { firma: 'Immo Basel AG' };
    cur.objektName = 'MFH Musterstrasse 12 · Basel';
    erpSaveCur(true);
    window._aufId = cur.id;
    erpOpenEditor();
  });
  ok(await page.evaluate(() => document.getElementById('edBody').innerHTML.indexOf('Aushang (Mieter-Info)') >= 0), 'Auftrag-Grunddaten: 📌-Aushang-Box vorhanden');
  await page.evaluate(() => {
    cur.aushang = { noetig: true, vorlageId: 'wasser' };
    erpSaveCur(true);
  });

  console.log('■ Dialog: Vorlage, Zeit-Pflicht, Druck');
  await page.evaluate(() => erpAushangOpen());
  ok(await page.evaluate(() => document.getElementById('gausModal').classList.contains('open')), 'Aushang-Dialog öffnet');
  ok(await page.evaluate(() => document.getElementById('gausTitel').value === 'Wasserabstellung' && document.getElementById('gausText').value.indexOf('Sanitärleitungen') >= 0), 'Vorlage «Wasserabstellung» vorbefüllt (Titel + Text)');
  ok(await page.evaluate(() => document.getElementById('gausObjekt').value.indexOf('Musterstrasse 12') >= 0), 'Liegenschaft aus dem Auftrag vorbefüllt');
  // Vorlagen-Wechsel ersetzt Titel + Text
  await page.evaluate(() => { document.getElementById('gausVorlage').value = 'strom'; GemaAushang._hooks.applyVorlage('strom'); });
  ok(await page.evaluate(() => document.getElementById('gausTitel').value === 'Stromabschaltung' && document.getElementById('gausText').value.indexOf('Elektroinstallation') >= 0), 'Vorlagen-Wechsel ersetzt Titel + Text');
  await page.evaluate(() => { document.getElementById('gausVorlage').value = 'wasser'; GemaAushang._hooks.applyVorlage('wasser'); });
  // Zeit-Pflicht
  {
    const r = await page.evaluate(() => {
      document.getElementById('gausDatum').value = '2026-07-20';
      document.getElementById('gausVon').value = '';
      document.getElementById('gausBis').value = '';
      let opened = 0;
      const orig = window.open;
      window.open = function () { opened++; return { document: { write: () => {}, close: () => {} } }; };
      document.getElementById('gausPrint').click();
      window.open = orig;
      return { opened, err: document.getElementById('gausErr').style.display === 'block', errTxt: document.getElementById('gausErr').textContent, still: document.getElementById('gausModal').classList.contains('open') };
    });
    ok(r.opened === 0 && r.err && r.errTxt.indexOf('Zeitangabe') >= 0 && r.still, 'ohne Zeit von–bis: kein Druck, Fehlermeldung (Pflichtfeld)');
  }
  // Drucken mit Zeit
  {
    const r = await page.evaluate(() => {
      document.getElementById('gausVon').value = '08:00';
      document.getElementById('gausBis').value = '12:00';
      document.getElementById('gausZusatz').value = 'Bitte Fahrzeuge vor der Garage umparkieren';
      let html = '';
      const orig = window.open;
      window.open = function () { return { document: { write: s => { html += s; }, close: () => {} } }; };
      document.getElementById('gausPrint').click();
      window.open = orig;
      return { html, closed: !document.getElementById('gausModal').classList.contains('open') };
    });
    ok(r.html.indexOf('Wasserabstellung') >= 0 && r.html.indexOf('Wichtige Mitteilung') >= 0, 'Druckfenster: Titel + Eyebrow');
    ok(r.html.indexOf('Montag, 20. Juli 2026') >= 0, 'grosses deutsches Datum mit Wochentag');
    ok(r.html.indexOf('von 08:00 bis 12:00 Uhr') >= 0, 'Zeitangabe von–bis in der Zeitbox');
    ok(r.html.indexOf('umparkieren') >= 0 && r.html.indexOf('Bitte beachten') >= 0, 'Zusatzinfo-Box auf dem Aushang');
    ok(r.html.indexOf('Testfirma AG') >= 0 && r.html.indexOf('Freundliche Grüsse') >= 0, 'Firma + Grussformel');
    ok(r.html.indexOf('font-variation-settings:"opsz" 14') >= 0, 'DM-Sans-opsz-Kanon im Druck-CSS');
    ok(r.closed, 'Dialog schliesst nach dem Druck');
    const saved = await page.evaluate(() => poolRead(DOK_POOL).find(d => d.id === window._aufId).aushang);
    ok(saved && saved.daten && saved.daten.von === '08:00' && saved.daten.gedrucktAm, 'Daten am Auftrag gespeichert (onSave)');
  }
  // Mehrtägig
  {
    const r = await page.evaluate(() => {
      erpAushangOpen();
      document.getElementById('gausDatumBis').value = '2026-07-22';
      let html = '';
      const orig = window.open;
      window.open = function () { return { document: { write: s => { html += s; }, close: () => {} } }; };
      document.getElementById('gausPrint').click();
      window.open = orig;
      return html;
    });
    ok(r.indexOf('Montag, 20. Juli 2026 bis Mittwoch, 22. Juli 2026') >= 0 && r.indexOf('jeweils von 08:00') >= 0, 'mehrtägig: Datum-bis + «jeweils»');
  }
  // Als Vorlage speichern (überschreibt die gewählte org-weit)
  {
    const r = await page.evaluate(() => {
      erpAushangOpen();
      document.getElementById('gausText').value = 'Eigener Firmen-Text für Wasserabstellungen.';
      const origC = GemaDialog.confirm;
      GemaDialog.confirm = () => Promise.resolve(true);
      document.getElementById('gausSaveVorlage').click();
      GemaDialog.confirm = origC;
      return true;
    });
    await page.waitForTimeout(300);
    const v = await page.evaluate(() => {
      const org = GemaAuth.getOrgs()[0];
      const own = (org.settings.aushang && org.settings.aushang.vorlagen) || [];
      return { own: own.find(x => x.id === 'wasser'), eff: GemaAushang.vorlagen().find(x => x.id === 'wasser') };
    });
    ok(v.own && v.own.text.indexOf('Eigener Firmen-Text') >= 0, 'Org-Override in org.settings.aushang.vorlagen gespeichert');
    ok(v.eff && v.eff.text.indexOf('Eigener Firmen-Text') >= 0, 'vorlagen() liefert die Org-Version (Override gewinnt)');
    await page.evaluate(() => GemaAushang.close());
  }
  ok(errors.length === 0, 'pm_erp: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

// ════════ 2) Einsatzplan: Erinnerung beim Einplanen + Termin-Datum ════════
console.log('■ Einsatzplan: Einplan-Erinnerung + 📌 am Einsatz');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epNeuAusAuftrag === 'function' && typeof epAushangOpen === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const u = GemaAuth.getCurrentUser();
    localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([{
      id: 'au_aus', orgId: u.orgId, typ: 'auftrag', nr: 'AU-2026-031', titel: 'Steigzonen-Sanierung', status: 'offen',
      positionen: [], kundeSnapshot: { firma: 'Immo Basel AG' }, objektName: 'MFH Musterstrasse 12',
      aushang: { noetig: true, vorlageId: 'wasser' },
      erstelltVon: { userId: u.id, name: u.name }
    }]));
    _epErpMemo = { t: 0, l: null };
  });
  {
    const r = await page.evaluate(() => {
      const u = GemaAuth.getCurrentUser();
      const a = epAuftraege().find(x => x.id === 'au_aus');
      let confirmed = null;
      const orig = GemaDialog.confirm;
      GemaDialog.confirm = o => { confirmed = o; return Promise.resolve(true); };
      epNeuAusAuftrag(a, u.id, '2026-07-21');
      GemaDialog.confirm = orig;
      const ev = poolRead().find(e => e.auftragId === 'au_aus');
      window._evId = ev.id;
      return { confirmed, evId: ev.id };
    });
    await page.waitForTimeout(300);
    ok(r.confirmed && String(r.confirmed.title).indexOf('Aushang nötig') >= 0, 'Einplanen eines geflaggten Auftrags: Erinnerungs-Dialog');
    ok(await page.evaluate(() => document.getElementById('gausModal').classList.contains('open')), 'Bestätigen öffnet den Aushang-Dialog');
    ok(await page.evaluate(() => document.getElementById('gausDatum').value === '2026-07-21'), 'Termin-Datum vorbefüllt');
    ok(await page.evaluate(() => document.getElementById('gausTitel').value === 'Wasserabstellung'), 'Vorlage vom Auftrag (wasser)');
    // Drucken → Daten am Einsatz
    const saved = await page.evaluate(() => {
      document.getElementById('gausVon').value = '07:30';
      document.getElementById('gausBis').value = '11:00';
      const orig = window.open;
      window.open = function () { return { document: { write: () => {}, close: () => {} } }; };
      document.getElementById('gausPrint').click();
      window.open = orig;
      return poolRead().find(e => e.id === window._evId).aushang;
    });
    ok(saved && saved.noetig && saved.daten && saved.daten.von === '07:30', 'Aushang-Daten am Einsatz gespeichert');
  }
  // Einsatz-Modal: Badge + Button; verschobener Termin gewinnt beim Datum
  await page.evaluate(() => epEvOpen(window._evId));
  {
    const r = await page.evaluate(() => ({
      vis: document.getElementById('evAushang').style.display !== 'none',
      html: document.getElementById('evAushang').innerHTML
    }));
    ok(r.vis && r.html.indexOf('Aushang nötig') >= 0, 'Einsatz-Modal: 📌-Badge «Aushang nötig»');
    ok(r.html.indexOf('✓ erstellt am') >= 0 && r.html.indexOf('Aushang erstellen') >= 0, 'Modal zeigt «erstellt am» + Druck-Button');
    await page.evaluate(() => epEvClose());
  }
  {
    const d = await page.evaluate(() => {
      const ev = poolRead().find(e => e.id === window._evId);
      ev.datum = '2026-07-28';   // Termin verschoben
      epSave(ev);
      epAushangOpen(window._evId);
      return document.getElementById('gausDatum').value;
    });
    ok(d === '2026-07-28', 'verschobener Termin: Dialog zeigt das NEUE Datum (nie das alte aus den gespeicherten Daten)');
    await page.evaluate(() => GemaAushang.close());
  }
  ok(errors.length === 0, 'Einsatzplan: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

// ════════ 3) Service: Anlage-Flag (wiederkehrend, MFH) ════════
console.log('■ Service: Anlage-Flag → Plan-Hinweis → Prompt → Auftrag-Button');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/sv_service.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof svAnlNeu === 'function' && typeof svAushangOpen === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    svAnlNeu();
    document.getElementById('an_name').value = 'Boiler MFH Musterstrasse';
    document.getElementById('an_kat').value = 'Boiler';
    document.getElementById('an_intervall').value = '12';
    document.getElementById('an_letzte').value = '2025-01-10';
    document.getElementById('an_aushang').checked = true;
    document.getElementById('an_aushang_vorlage').value = 'boiler';
    svAnlSave();
  });
  await page.waitForTimeout(400);
  {
    const a = await page.evaluate(() => poolRead('anl').find(x => x.name === 'Boiler MFH Musterstrasse'));
    ok(a && a.aushang && a.aushang.noetig && a.aushang.vorlageId === 'boiler', 'Anlage speichert aushang {noetig, vorlageId}');
    const auf = await page.evaluate(() => poolRead('auf').find(x => x.anlageName === 'Boiler MFH Musterstrasse' && x.status === 'offen'));
    ok(!!auf, 'Fälligkeits-Scan: offener Serviceauftrag');
    await page.evaluate(id => { window._aufId = id; }, auf ? auf.id : '');
  }
  await page.evaluate(() => svPlanOpen(window._aufId));
  ok(await page.evaluate(() => document.getElementById('pl_aushangHint').innerHTML.indexOf('Aushang nötig') >= 0), 'Plan-Modal: Aushang-Hinweis der Anlage');
  {
    const r = await page.evaluate(() => {
      const sel = document.getElementById('pl_monteur');
      sel.innerHTML = '<option value="u_mont">Marco Monteur</option>';
      sel.value = 'u_mont';
      document.getElementById('pl_datum').value = '2026-07-24';
      let confirmed = null;
      const orig = GemaDialog.confirm;
      GemaDialog.confirm = o => { confirmed = o; return Promise.resolve(false); };
      svPlanSave();
      GemaDialog.confirm = orig;
      return { confirmed };
    });
    await page.waitForTimeout(300);
    ok(r.confirmed && String(r.confirmed.title).indexOf('Aushang nötig') >= 0, 'nach dem Einplanen: Aushang-Prompt');
    const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_einsatz_pool_v1') || '[]').find(e => e.serviceAuftragId === window._aufId));
    ok(ev && ev.aushang && ev.aushang.noetig && ev.aushang.vorlageId === 'boiler', 'Service-Einsatz trägt das Aushang-Flag (sichtbar im Einsatzplan)');
  }
  {
    const html = await page.evaluate(() => { _view = 'auftraege'; svRender(); return document.getElementById('viewWrap').innerHTML; });
    ok(html.indexOf('📌 Aushang') >= 0, 'Serviceauftrag-Zeile: 📌-Aushang-Button');
  }
  {
    const r = await page.evaluate(() => {
      svAushangOpen(window._aufId);
      return { open: document.getElementById('gausModal').classList.contains('open'), datum: document.getElementById('gausDatum').value, titel: document.getElementById('gausTitel').value };
    });
    ok(r.open && r.datum === '2026-07-24', 'Aushang-Dialog mit dem geplanten Termin-Datum');
    ok(r.titel.indexOf('Boilerservice') >= 0, 'Boilerservice-Vorlage («kein Warmwasser»)');
    const saved = await page.evaluate(() => {
      document.getElementById('gausVon').value = '08:00';
      document.getElementById('gausBis').value = '10:30';
      let html = '';
      const orig = window.open;
      window.open = function () { return { document: { write: s => { html += s; }, close: () => {} } }; };
      document.getElementById('gausPrint').click();
      window.open = orig;
      return { html, auf: poolRead('auf').find(x => x.id === window._aufId).aushang };
    });
    ok(saved.html.indexOf('kein Warmwasser') >= 0 && saved.html.indexOf('von 08:00 bis 10:30 Uhr') >= 0, 'Druck: Boiler-Text + Zeitfenster');
    ok(saved.auf && saved.auf.daten && saved.auf.daten.bis === '10:30', 'Daten am Serviceauftrag gespeichert (Nachdruck möglich)');
  }
  ok(errors.length === 0, 'Service: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
