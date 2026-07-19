// Playwright-Smoke: ERP — Sachbearbeiter (07/2026)
//   - Dokumente tragen sachbearbeiter {userId,name}: Default = Ersteller beim
//     Erstellen (Offerte ODER Direkt-Auftrag), Vererbung durch die Kette
//     (Offerte → Auftrag → Rechnung), im Editor per Dropdown änderbar
//   - Altdaten ohne Feld fallen auf erstelltVon zurück (erpSb-Resolver)
//   - Toolbar-Filter «Alle Sachbearbeiter» (datengetrieben, erscheint ab 2
//     verschiedenen SBs), Karten zeigen 👔, PDF-Kürzel folgt dem SB
//   - Einsatzplan: 👔 Verantwortlich live vom Auftrag (Meine Woche, Tages-
//     Modal, Einsatz-Modal, Sidebar); freie Einsätze zeigen den Einplaner
// Ausführen: CHROME=<chromium> node scripts/erp_sachbearbeiter_test.mjs
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

// ════════ 1) ERP: Default, Kette, Filter, PDF ════════
console.log('■ ERP: Sachbearbeiter-Default + Vererbung');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpSb === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(400);

  ok(await page.evaluate(() => {
    erpNeu('offerte');
    const u = GemaAuth.getCurrentUser();
    return cur.sachbearbeiter && cur.sachbearbeiter.userId === u.id && cur.sachbearbeiter.name === (u.name || u.username);
  }), 'Neue Offerte: Ersteller ist Sachbearbeiter');
  await page.evaluate(() => { cur.titel = 'Offerte A'; erpOpenEditor(); });
  ok(await page.evaluate(() => {
    const sel = document.getElementById('e_sb');
    const u = GemaAuth.getCurrentUser();
    return !!sel && sel.value === u.id;
  }), 'Editor: Sachbearbeiter-Dropdown mit Ersteller vorausgewählt');
  // SB manuell wechseln (simulierter zweiter Mitarbeiter) → Kette erbt ihn
  await page.evaluate(() => {
    cur.sachbearbeiter = { userId: 'user_petra', name: 'Petra Muster' };
    cur.kundeSnapshot = { firma: 'Muster AG', strasse: 'Weg 1', plz: '4000', ort: 'Basel' };
    cur.positionen = [{ id: 'p1', art: 'frei', bez: 'Arbeit', menge: 1, einheit: 'h', ep: 100 }];
    erpSaveCur(true);
    erpZuAuftrag();
  });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => cur.typ === 'auftrag' && cur.sachbearbeiter.name === 'Petra Muster'), 'Auftrag erbt den Sachbearbeiter der Offerte');
  await page.evaluate(() => { window._aufId = cur.id; });
  await page.evaluate(() => {
    const re = _erpNeueRechnung(cur, 'akonto', [{ id: 'a1', art: 'akonto', bez: 'Akonto', menge: 1, einheit: 'pausch.', ep: 500 }], 'Akonto');
    window._reId = re.id;
  });
  ok(await page.evaluate(() => {
    const re = poolRead(DOK_POOL).find(x => x.id === window._reId);
    return re.sachbearbeiter && re.sachbearbeiter.name === 'Petra Muster';
  }), 'Rechnung erbt den Sachbearbeiter des Auftrags');
  ok(await page.evaluate(() => {
    // Direkt-Auftrag: Ersteller = SB
    erpNeu('auftrag');
    const u = GemaAuth.getCurrentUser();
    const okNeu = cur.sachbearbeiter.userId === u.id;
    cur.titel = 'Direktauftrag'; erpSaveCur(true); erpCloseEditor();
    return okNeu;
  }), 'Direkt erstellter Auftrag: Ersteller ist Sachbearbeiter');
  // Altdaten: Dokument ohne sachbearbeiter → Fallback erstelltVon
  ok(await page.evaluate(() => {
    const alt = { id: 'alt1', typ: 'offerte', erstelltVon: { userId: 'u_alt', name: 'Alt Ersteller' } };
    const s = erpSb(alt);
    return s && s.name === 'Alt Ersteller';
  }), 'Altdaten ohne Feld: erpSb fällt auf erstelltVon zurück');

  console.log('■ ERP: Filter + Karten + PDF-Kürzel');
  await page.evaluate(() => { _tab = 'offerte'; erpRenderAll(); });
  ok(await page.evaluate(() => {
    const f = document.getElementById('fSb');
    return !!f && f.innerHTML.indexOf('Petra Muster') >= 0;
  }), 'Toolbar: Sachbearbeiter-Filter mit beiden Personen');
  ok(await page.evaluate(() => document.getElementById('docList').innerHTML.indexOf('👔 Petra Muster') >= 0), 'Karte zeigt 👔 Sachbearbeiter');
  {
    const n = await page.evaluate(() => {
      document.getElementById('fSb').value = 'user_petra';
      erpRenderList();
      return document.querySelectorAll('#docList .card, #docList .drow').length;
    });
    ok(n === 1, 'Filter auf Petra: nur ihre Offerte (' + n + ' Eintrag)');
    await page.evaluate(() => { document.getElementById('fSb').value = ''; erpRenderList(); });
  }
  {
    const html = await page.evaluate(() => {
      erpOpen(poolRead(DOK_POOL).find(d => d.titel === 'Offerte A').id);
      window._pdfHtml = '';
      const orig = window.open;
      window.open = function () { return { document: { write: s => { window._pdfHtml += s; }, close: () => {} }, close: () => {} }; };
      erpPdf();
      window.open = orig;
      return window._pdfHtml;
    });
    ok(html.indexOf('/ PM') >= 0, 'PDF: Kürzel folgt dem Sachbearbeiter (PM = Petra Muster)');
    await page.evaluate(() => erpCloseEditor());
  }
  ok(errors.length === 0, 'ERP: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

// ════════ 2) Einsatzplan: 👔 Verantwortlich beim Termin ════════
console.log('■ Einsatzplan: Verantwortlicher sichtbar für den Monteur');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epVerantwortlich === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const u = GemaAuth.getCurrentUser();
    const org = GemaAuth.getOrgs()[0];
    const st = org.settings || {};
    st.einsatzplan = Object.assign({}, st.einsatzplan, { userIds: [u.id] });
    GemaAuth.updateOrgSettings(org.id, st);
    const auftrag = { id: 'au_sb', orgId: u.orgId, typ: 'auftrag', nr: 'AU-2026-021', titel: 'Service Boiler', status: 'offen', positionen: [], kundeSnapshot: { firma: 'Muster AG' }, sachbearbeiter: { userId: 'user_petra', name: 'Petra Muster' }, erstelltVon: { userId: u.id, name: u.name } };
    // zweiter, NICHT eingeplanter Auftrag — der Pool rechts zeigt nur Uneingeplante
    const auftrag2 = { id: 'au_sb2', orgId: u.orgId, typ: 'auftrag', nr: 'AU-2026-022', titel: 'Filter ersetzen', status: 'offen', positionen: [], kundeSnapshot: { firma: 'Muster AG' }, sachbearbeiter: { userId: 'user_petra', name: 'Petra Muster' }, erstelltVon: { userId: u.id, name: u.name } };
    localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([auftrag, auftrag2]));
    _epErpMemo = { t: 0, l: null };
    epNeuAusAuftrag(auftrag, u.id, '2026-07-22');
    epNeu(u.id, '2026-07-23');
    document.getElementById('ev_titel').value = 'Freier Termin';
    epEvSave();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => { _anker = '2026-07-22'; _view = 'meine'; epRender(); });
  {
    const html = await page.evaluate(() => document.getElementById('viewWrap').innerHTML);
    ok(html.indexOf('👔 Verantwortlich: <b>Petra Muster</b>') >= 0, 'Meine Woche: Auftrags-Einsatz zeigt den Sachbearbeiter');
    ok(await page.evaluate(() => {
      const u = GemaAuth.getCurrentUser();
      const ev = poolRead().find(e => e.titel === 'Freier Termin');
      return epVerantwortlich(ev) === u.name;
    }), 'Freier Einsatz: Verantwortlich = Einplaner');
  }
  await page.evaluate(() => epDayOpen('2026-07-22'));
  ok(await page.evaluate(() => document.getElementById('dayBody').innerHTML.indexOf('Verantwortlich: Petra Muster') >= 0), 'Tages-Modal zeigt den Verantwortlichen');
  await page.evaluate(() => document.getElementById('dayModal').classList.remove('open'));
  {
    const evId = await page.evaluate(() => poolRead().find(e => e.auftragId === 'au_sb').id);
    await page.evaluate(id => epEvOpen(id), evId);
    ok(await page.evaluate(() => document.getElementById('evKeyInfo').innerHTML.indexOf('Petra Muster') >= 0), 'Einsatz-Modal: 👔 Verantwortlich unter der Auftrags-Wahl');
    await page.evaluate(() => epEvClose());
  }
  await page.evaluate(() => { _view = 'woche'; epRender(); });
  ok(await page.evaluate(() => document.getElementById('viewWrap').innerHTML.indexOf('👔 Petra Muster') >= 0), 'Auftrags-Pool: 👔 Sachbearbeiter am (uneingeplanten) Auftrag');
  ok(errors.length === 0, 'Einsatzplan: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
