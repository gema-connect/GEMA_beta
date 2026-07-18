// Playwright-Smoke: ERP — Kreditorenmanagement (07/2026)
//   - Kreditor (Lieferantenrechnung) mit Beleg erfassen, Auftrag zuteilen →
//     Freigeber = SACHBEARBEITER des Auftrags (live via erpSb aufgelöst)
//   - Statusmaschine offen→freigegeben→bezahlt · zurückweisen mit Grund ·
//     wiedervorlegen; Guard: nur der zugewiesene Freigeber (oder Admin)
//     entscheidet; Notifys kreditor_freigabe / kreditor_entscheid
//   - Auftrag-/Rechnungs-Editor: Übersicht mit ALLEN Stunden (Datum, Person,
//     Zeit, Dauer via Einsatzplan-Kette) + ALLEN Kreditoren des Auftrags
//   - Doppelklick (Karte + Übersichts-Zeile) öffnet den Beleg im separaten
//     Fenster; Deep-Link ?tab=kreditoren&kred=<id>
// Ausführen: CHROME=<chromium> node scripts/erp_kreditoren_test.mjs
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

const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof erpKredNeu === 'function' && typeof erpKredNext === 'function', null, { timeout: 12000 });
await page.waitForTimeout(400);

console.log('■ Engine: Statusmaschine + Summen + Auftrag-Stunden');
{
  const r = await page.evaluate(() => ({
    f1: erpKredNext('offen', 'freigeben'), f2: erpKredNext('offen', 'zurueckweisen'),
    f3: erpKredNext('freigegeben', 'bezahlen'), f4: erpKredNext('freigegeben', 'zurueckweisen'),
    f5: erpKredNext('zurueckgewiesen', 'wiedervorlegen'),
    b1: erpKredNext('bezahlt', 'zurueckweisen'), b2: erpKredNext('offen', 'bezahlen'), b3: erpKredNext('freigegeben', 'freigeben')
  }));
  ok(r.f1 === 'freigegeben' && r.f2 === 'zurueckgewiesen' && r.f3 === 'bezahlt' && r.f4 === 'zurueckgewiesen' && r.f5 === 'offen', 'gültige Übergänge (freigeben/zurückweisen/bezahlen/wiedervorlegen)');
  ok(r.b1 === null && r.b2 === null && r.b3 === null, 'ungültige Übergänge liefern null');
  const s = await page.evaluate(() => erpKredSummen([
    { status: 'offen', betrag: 100 }, { status: 'offen', betrag: 50.5 },
    { status: 'freigegeben', betrag: 200 }, { status: 'bezahlt', betrag: 300 },
    { status: 'zurueckgewiesen', betrag: 999 }
  ]));
  ok(s.offenN === 2 && Math.abs(s.offenChf - 150.5) < 1e-9 && s.freiChf === 200 && s.bezChf === 300 && s.rueckN === 1, 'erpKredSummen zählt pro Status');
  ok(Math.abs(s.totalChf - 650.5) < 1e-9, 'totalChf ohne zurückgewiesene');
  const st = await page.evaluate(() => erpAuftragStunden('au1',
    [{ id: 'ev1', auftragId: 'au1' }, { id: 'ev2', auftragId: 'au2' }],
    [
      { datum: '2026-07-14', userName: 'Marco', eintraege: [
        { einsatzId: 'ev1', von: '08:00', bis: '11:30', pauseMin: 30, taetigkeit: 'Montage' },
        { einsatzId: 'ev2', von: '13:00', bis: '17:00' }
      ]},
      { datum: '2026-07-15', userName: 'Marco', eintraege: [{ einsatzId: 'ev1', von: '22:00', bis: '02:00', pauseMin: 0 }] },
      { typ: 'ferienantrag', eintraege: [{ einsatzId: 'ev1', von: '08:00', bis: '09:00' }] }
    ]));
  ok(st.rows.length === 2, 'nur Einträge mit Einsatz dieses Auftrags zählen (typ-Records ignoriert)');
  ok(st.rows[0].min === 180 && st.rows[0].datum === '2026-07-14', 'Pause abgezogen (08:00–11:30 −30′ = 3.0 h), Datum dabei');
  ok(st.rows[1].min === 240, 'über Mitternacht: 22:00–02:00 = 4.0 h');
  ok(st.totalMin === 420, 'Total 7.0 h');
}

console.log('■ Kreditor erfassen: Freigeber = Sachbearbeiter des Auftrags');
// Auftrag mit Sachbearbeiterin Petra anlegen
await page.evaluate(() => {
  erpNeu('auftrag');
  cur.titel = 'Umbau Bad EG';
  cur.kundeSnapshot = { firma: 'Muster AG', strasse: 'Weg 1', plz: '4000', ort: 'Basel' };
  cur.sachbearbeiter = { userId: 'user_petra', name: 'Petra Muster' };
  cur.positionen = [{ id: 'p1', art: 'frei', bez: 'Arbeit', menge: 1, einheit: 'h', ep: 100 }];
  erpSaveCur(true);
  window._aufPetra = cur.id;
  erpCloseEditor();
});
ok(await page.evaluate(() => document.getElementById('mtabs').textContent.indexOf('Kreditoren') >= 0), 'Tab «💳 Kreditoren» sichtbar (erpCanEdit)');
{
  const r = await page.evaluate(() => {
    erpKredNeu();
    const modalOpen = document.getElementById('kredModal').classList.contains('open');
    document.getElementById('kr_lieferant').value = 'Sanitas Troesch AG';
    document.getElementById('kr_nr').value = 'RG-784512';
    document.getElementById('kr_betrag').value = '1250.40';
    document.getElementById('kr_beschrieb').value = 'Apparate Bad EG';
    document.getElementById('kr_auftrag').value = window._aufPetra;
    erpKredFreigeberHint();
    const hint = document.getElementById('kr_freigeberHint').textContent;
    let cap = null;
    const orig = GemaNotify.push;
    GemaNotify.push = o => { cap = o; };
    erpKredSave();
    GemaNotify.push = orig;
    const k = poolRead(KRED_POOL).find(x => x.lieferant === 'Sanitas Troesch AG');
    window._kredId = k ? k.id : '';
    return { modalOpen, hint, k, cap, closed: !document.getElementById('kredModal').classList.contains('open') };
  });
  ok(r.modalOpen && r.closed, 'Modal öffnet und schliesst nach dem Speichern');
  ok(r.hint.indexOf('Petra Muster') >= 0, 'Hint zeigt den Freigeber (Sachbearbeiter des Auftrags)');
  ok(r.k && r.k.status === 'offen' && r.k.betrag === 1250.4, 'Record: status offen + Betrag');
  ok(r.k && r.k.auftragId === await page.evaluate(() => window._aufPetra) && (r.k.auftragNr || '').indexOf('AU-') === 0, 'Auftrag zugeteilt (auftragNr denormalisiert)');
  ok(r.k && r.k.freigeber && r.k.freigeber.name === 'Petra Muster', 'Freigeber-Snapshot = Sachbearbeiterin');
  ok(r.k && (r.k.verlauf || []).length === 1, 'Verlauf: «Erfasst»');
  ok(r.cap && r.cap.eventKey === 'kreditor_freigabe' && r.cap.empfaengerUserId === 'user_petra', 'Notify kreditor_freigabe an die Sachbearbeiterin');
  ok(r.cap && r.cap.link.indexOf('kred=' + r.k.id) >= 0, 'Notify-Link mit Deep-Link auf den Kreditor');
}

console.log('■ Freigabe-Guard: nur der zugewiesene Freigeber entscheidet');
{
  const r = await page.evaluate(() => {
    erpKredAktion(window._kredId, 'freigeben');   // ich bin nicht Petra und nicht Admin
    return poolRead(KRED_POOL).find(x => x.id === window._kredId).status;
  });
  ok(r === 'offen', 'Fremd-Freigabe blockiert — Status bleibt offen');
}

console.log('■ Freigabe durch den Sachbearbeiter (Auftrag mit SB = ich)');
{
  const r = await page.evaluate(() => {
    // Auftrag, dessen Sachbearbeiter der eingeloggte User ist
    erpNeu('auftrag');
    cur.titel = 'Service Heizung';
    cur.kundeSnapshot = { firma: 'Muster AG' };
    erpSaveCur(true);
    window._aufMe = cur.id;
    erpCloseEditor();
    erpKredNeu();
    document.getElementById('kr_lieferant').value = 'Debrunner Acifer';
    document.getElementById('kr_betrag').value = '480';
    document.getElementById('kr_auftrag').value = window._aufMe;
    erpKredSave();
    const k = poolRead(KRED_POOL).find(x => x.lieferant === 'Debrunner Acifer');
    window._kredMe = k.id;
    // Erfasser auf einen anderen User stellen, damit der Entscheid-Notify greift
    const c = JSON.parse(JSON.stringify(k));
    c.erstelltVon = { userId: 'user_hans', name: 'Hans Beispiel' };
    poolSave(KRED_POOL, KRED_PREFIX, c);
    let cap = null;
    const orig = GemaNotify.push;
    GemaNotify.push = o => { cap = o; };
    erpKredAktion(window._kredMe, 'freigeben');
    GemaNotify.push = orig;
    const after = poolRead(KRED_POOL).find(x => x.id === window._kredMe);
    return { st: after.status, ent: after.entscheid, cap };
  });
  ok(r.st === 'freigegeben', 'Freigeben durch den Sachbearbeiter funktioniert');
  ok(r.ent && r.ent.von === 'Test User', 'Entscheid protokolliert (von)');
  ok(r.cap && r.cap.eventKey === 'kreditor_entscheid' && r.cap.empfaengerUserId === 'user_hans' && r.cap.typ === 'erfolg', 'Notify kreditor_entscheid an den Erfasser');
}

console.log('■ Zurückweisen mit Grund · wiedervorlegen · bezahlt');
{
  const r = await page.evaluate(() => {
    // Kreditor OHNE Auftrag → Freigabe offen für alle Bearbeiter
    erpKredNeu();
    document.getElementById('kr_lieferant').value = 'Tobler Haustechnik';
    document.getElementById('kr_betrag').value = '99';
    erpKredSave();
    const k = poolRead(KRED_POOL).find(x => x.lieferant === 'Tobler Haustechnik');
    window._kredFrei = k.id;
    const origP = GemaDialog.prompt;
    GemaDialog.prompt = () => Promise.resolve('Betrag stimmt nicht mit der Bestellung überein');
    erpKredAktion(window._kredFrei, 'zurueckweisen');
    GemaDialog.prompt = origP;
    return true;
  });
  await page.waitForTimeout(250);
  const st1 = await page.evaluate(() => poolRead(KRED_POOL).find(x => x.id === window._kredFrei));
  ok(st1.status === 'zurueckgewiesen' && st1.entscheid.grund.indexOf('Bestellung') >= 0, 'Zurückgewiesen mit Grund (Prompt)');
  const st2 = await page.evaluate(() => {
    erpKredAktion(window._kredFrei, 'wiedervorlegen');
    erpKredAktion(window._kredFrei, 'freigeben');
    erpKredAktion(window._kredFrei, 'bezahlen');
    return poolRead(KRED_POOL).find(x => x.id === window._kredFrei);
  });
  ok(st2.status === 'bezahlt' && st2.bezahlt && st2.bezahlt.von === 'Test User', 'Kette wiedervorlegen → freigeben → bezahlt');
  ok((st2.verlauf || []).length >= 4, 'Verlauf wächst mit jeder Aktion (' + (st2.verlauf || []).length + ')');
}

console.log('■ Kreditoren-Tab: KPIs, Karten, Freigabe-Panel');
{
  const r = await page.evaluate(() => {
    _tab = 'kreditoren';
    erpRenderAll();
    return {
      kpis: document.getElementById('kpis').textContent,
      cards: document.querySelectorAll('#docList .card').length,
      list: document.getElementById('docList').innerHTML,
      toolbar: document.getElementById('toolbar').innerHTML
    };
  });
  ok(r.kpis.indexOf('Zur Freigabe') >= 0 && r.kpis.indexOf('Bezahlt') >= 0, 'KPI-Zeile (Zur Freigabe / Bezahlt)');
  ok(r.cards === 3, 'drei Kreditoren-Karten gerendert (' + r.cards + ')');
  ok(r.list.indexOf('zur Freigabe bei dir') < 0, 'kein Freigabe-Panel (der offene Kreditor liegt bei Petra, nicht bei mir)');
  ok(r.list.indexOf('ondblclick="erpKredCardDbl') >= 0, 'Karten tragen den Doppelklick-Handler (Beleg)');
  ok(r.toolbar.indexOf('fKredSt') >= 0 && r.toolbar.indexOf('Kreditor erfassen') >= 0, 'Toolbar: Status-Filter + ＋ Kreditor');
  // Status-Filter
  const n = await page.evaluate(() => {
    document.getElementById('fKredSt').value = 'bezahlt';
    erpRenderList();
    return document.querySelectorAll('#docList .card').length;
  });
  ok(n === 1, 'Status-Filter «Bezahlt» → 1 Karte');
  await page.evaluate(() => { document.getElementById('fKredSt').value = ''; erpRenderList(); });
}

console.log('■ Freigabe-Panel: offener Kreditor mit SB = ich');
{
  const r = await page.evaluate(() => {
    erpKredNeu(window._aufMe);
    document.getElementById('kr_lieferant').value = 'Geberit Vertriebs AG';
    document.getElementById('kr_betrag').value = '780';
    erpKredSave();
    erpRenderList();
    return document.getElementById('docList').innerHTML;
  });
  ok(r.indexOf('zur Freigabe bei dir') >= 0, 'Panel «🔔 zur Freigabe bei dir» erscheint');
  ok(r.indexOf('(du)') >= 0, 'Karte markiert mich als Freigeber «(du)»');
}

console.log('■ Beleg: Doppelklick öffnet separates Fenster');
{
  const r = await page.evaluate(() => {
    // Beleg-URL direkt an den Sanitas-Kreditor hängen (Upload ist im Test gemockt sinnlos)
    const k = JSON.parse(JSON.stringify(poolRead(KRED_POOL).find(x => x.id === window._kredId)));
    k.beleg = { name: 'rechnung_784512.pdf', url: 'https://storage.example/erp/kred/784512.pdf', mime: 'application/pdf' };
    poolSave(KRED_POOL, KRED_PREFIX, k);
    let html = '';
    let opened = 0;
    const orig = window.open;
    window.open = function () { opened++; return { document: { write: s => { html += s; }, close: () => {} } }; };
    erpKredBelegOpen(window._kredId);
    window.open = orig;
    return { opened, html };
  });
  ok(r.opened === 1, 'window.open aufgerufen (separates Fenster)');
  ok(r.html.indexOf('<iframe') >= 0 && r.html.indexOf('784512.pdf') >= 0, 'PDF-Beleg als iframe eingebettet');
  ok(r.html.indexOf('Sanitas Troesch') >= 0 && r.html.indexOf('CHF') >= 0, 'Kopfzeile mit Lieferant + Betrag');
  const r2 = await page.evaluate(() => {
    let opened = 0;
    const orig = window.open;
    window.open = function () { opened++; return { document: { write: () => {}, close: () => {} } }; };
    erpKredBelegOpen(window._kredFrei);   // hat keinen Beleg
    window.open = orig;
    return opened;
  });
  ok(r2 === 0, 'ohne Beleg: kein Fenster (Toast-Hinweis)');
}

console.log('■ Auftrag-Editor: Übersicht Stunden + Kreditoren');
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  // Einsatz auf den Petra-Auftrag + Zeiteinträge der Stundenerfassung
  localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify([
    { id: 'ev_a', orgId: u.orgId, typ: 'auftrag', auftragId: window._aufPetra, monteurUserId: 'u_mont', datum: '2026-07-14', dauerTage: 2, slot: 'ganz' }
  ]));
  localStorage.setItem('gema_std_pool_v1', JSON.stringify([
    { id: 't1', orgId: u.orgId, userId: 'u_mont', userName: 'Marco Monteur', datum: '2026-07-14',
      eintraege: [{ id: 'e1', von: '07:30', bis: '12:00', pauseMin: 15, taetigkeit: 'Demontage Bad', einsatzId: 'ev_a' }] },
    { id: 't2', orgId: u.orgId, userId: 'u_mont', userName: 'Marco Monteur', datum: '2026-07-15',
      eintraege: [{ id: 'e2', von: '13:00', bis: '17:15', taetigkeit: 'Neue Leitungen', einsatzId: 'ev_a' }] }
  ]));
  erpOpen(window._aufPetra);
});
{
  const html = await page.evaluate(() => document.getElementById('edBody').innerHTML);
  ok(html.indexOf('Stunden &amp; Kreditoren') >= 0 || html.indexOf('Stunden & Kreditoren') >= 0, 'Sektion «📊 Stunden & Kreditoren» im Auftrag');
  ok(html.indexOf('14.07.2026') >= 0 && html.indexOf('Marco Monteur') >= 0 && html.indexOf('Demontage Bad') >= 0, 'Stunden-Zeile mit Datum, Person, Tätigkeit');
  ok(html.indexOf('4.25') >= 0 && html.indexOf('8.50') >= 0, 'Dauer je Eintrag (4.25 h) + Total (8.50 h)');
  ok(html.indexOf('Sanitas Troesch AG') >= 0 && html.indexOf('RG-784512') >= 0, 'Kreditoren-Tabelle mit Lieferant + Rechnungs-Nr');
  ok(html.indexOf('ondblclick="erpKredBelegOpen') >= 0, 'Kreditoren-Zeile: Doppelklick → Beleg');
  ok(html.indexOf('＋ Kreditor erfassen') >= 0, '＋-Button mit vorausgewähltem Auftrag');
}

console.log('■ Rechnung: dieselbe Übersicht (Stunden + Kreditoren des Auftrags)');
{
  const html = await page.evaluate(() => {
    const auftrag = poolRead(DOK_POOL).find(x => x.id === window._aufPetra);
    const re = _erpNeueRechnung(auftrag, 'akonto', [{ id: 'a1', art: 'akonto', bez: 'Akonto', menge: 1, einheit: 'pausch.', ep: 500 }], 'Akonto');
    erpOpen(re.id);
    return document.getElementById('edBody').innerHTML;
  });
  ok(html.indexOf('des Auftrags') >= 0, 'Rechnung zeigt die Auftrags-Übersicht');
  ok(html.indexOf('Marco Monteur') >= 0 && html.indexOf('Sanitas Troesch AG') >= 0, 'Stunden UND Kreditoren in der Rechnung sichtbar');
  await page.evaluate(() => erpCloseEditor());
}

console.log('■ Erfolg-Karte: Kreditoren-Zeile');
{
  const html = await page.evaluate(() => { _tab = 'erfolg'; erpRenderAll(); return document.getElementById('docList').innerHTML; });
  ok(html.indexOf('💳 Kreditoren (1 Lieferantenrechnung)') >= 0, 'Nachkalkulations-Karte weist die Kreditoren aus');
}

console.log('■ Notify-Gruppe «erp» registriert (Keys + Gating-Map)');
{
  const r = await page.evaluate(() => ({
    k1: GemaNotify.EVENT_KEYS.kreditor_freigabe, k2: GemaNotify.EVENT_KEYS.kreditor_entscheid,
    zug: window._gnHooks ? _gnHooks.MODUL_ZUGRIFF.erp : null,
    lbl: window._gnHooks ? _gnHooks.MODUL_LABELS.erp : null
  }));
  ok(r.k1 && r.k1.modul === 'erp' && r.k2 && r.k2.modul === 'erp', 'EVENT_KEYS kreditor_freigabe/kreditor_entscheid (modul erp)');
  ok(r.zug && (r.zug.mods || []).indexOf('erp') >= 0, 'MODUL_ZUGRIFF.erp → mods [erp]');
  ok(!!r.lbl, 'MODUL_LABELS.erp gesetzt');
}
ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
await ctx.close();

console.log('■ Deep-Link ?tab=kreditoren&kred=<id> öffnet den Kreditor');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_erp.html?tab=kreditoren&kred=kred_dl', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpKredEdit === 'function' && window._dlDone === true, null, { timeout: 12000 });
  // Der Boot-Pull (gemockte Cloud = leer) hat den Pool geleert — Kreditor
  // nachträglich seeden und den Deep-Link-Handler mit der echten
  // location.search erneut laufen lassen (Muster: Pools NACH dem Boot seeden)
  await page.evaluate(() => {
    localStorage.setItem('gema_erp_kred_pool_v1', JSON.stringify([
      { id: 'kred_dl', orgId: 'org_test', lieferant: 'R. Nussbaum AG', rechnungsNr: 'N-1', betrag: 55, datum: '2026-07-16', status: 'offen', verlauf: [], erstelltVon: { userId: 'u_test', name: 'Test User' }, erstelltAm: '2026-07-16T08:00:00.000Z' }
    ]));
    _dlDone = false;
    erpDeepLink();
  });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => _tab === 'kreditoren'), 'Tab «Kreditoren» aktiv');
  ok(await page.evaluate(() => document.getElementById('kredModal').classList.contains('open') && document.getElementById('kr_lieferant').value === 'R. Nussbaum AG'), 'Kreditor-Modal mit dem verlinkten Kreditor offen');
  ok(errs.length === 0, 'Deep-Link: keine JS-Fehler' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
