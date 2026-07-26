// Abschluss-Rückmeldung des Monteurs (User-Entscheide 26.07.2026)
// Deckt ab:
//  A) Einstellung: Arbeitsbereich mit ✅ Abschluss-Pflicht (Editor-Roundtrip
//     abRowHtml/abRowsCollect) + Folgetermin-Gründe als Vorlagen
//  B) Dialog nach dem Zeit-Erfassen: abgeschlossen / Folgetermin / Offerte;
//     unbeantwortete Termine blockieren die Tages-Freigabe
//  C) Folgetermin: Pflicht-Grund, Vorlagen-Chips, Meldung an die
//     Projektleitung, Rück-Meldung ev.abschluss
//  D) Offerte: Pflicht-Beschrieb → ERP-Offert-Entwurf mit Kunde/Objekt/
//     Sachbearbeiter + Notifikation mit Deep-Link auf den Entwurf
//  E) «Nicht stattgefunden» meldet ebenfalls an die Projektleitung
//  F) Folgetermin-Pool in den Terminen: Meldung + Ausfall erscheinen,
//     Einplanen erzeugt den neuen Termin und räumt den Pool, «✓ erledigt»
//     ohne neuen Termin
//
// Ausführen: CHROME=<chromium> node scripts/termin_abschluss_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };
const HEUTE = new Date().toISOString().slice(0, 10);

const AB = [
  { id: 'ab_srv', name: 'Sanitärservice', farbe: '#16a34a', fotoPflicht: false, abschlussPflicht: true },
  { id: 'ab_mon', name: 'Montage', farbe: '#2563eb' }
];
const GRUENDE = [
  { id: 'fg_fehlendes_material', label: 'Fehlendes Material' },
  { id: 'fg_zusatzarbeit', label: 'Zusatzarbeit entdeckt' }
];
// ev_a = Service (Abschluss-Pflicht), ev_b = Montage (keine Pflicht)
const EINSAETZE = [
  { id: 'ev_a', orgId: 'org_test', typ: 'auftrag', titel: 'Boiler-Service Meier', auftragNr: 'AU-2026-004',
    auftragId: 'auf1', kunde: 'Meier AG', objektId: 'obj1', objektName: 'MFH Musterstrasse',
    bereichId: 'ab_srv', monteurUserId: 'u_test', monteurName: 'Test User',
    datum: HEUTE, dauerTage: 1, slot: 'ganz', zeitVon: '07:00', zeitBis: '12:00',
    erstelltVon: { userId: 'u_pl', name: 'Planer Peter' } },
  { id: 'ev_b', orgId: 'org_test', typ: 'frei', titel: 'Montage Huber',
    objektId: 'obj2', objektName: 'EFH Huber', bereichId: 'ab_mon',
    monteurUserId: 'u_test', monteurName: 'Test User',
    datum: HEUTE, dauerTage: 1, slot: 'ganz', zeitVon: '13:00', zeitBis: '17:00',
    erstelltVon: { userId: 'u_pl', name: 'Planer Peter' } }
];
// ERP-Auftrag mit Kunde + Sachbearbeiter → Empfänger der Meldungen
const ERP = [{
  id: 'auf1', typ: 'auftrag', nr: 'AU-2026-004', orgId: 'org_test', status: 'in_arbeit',
  objektId: 'obj1', objektName: 'MFH Musterstrasse', bereichId: 'ab_srv',
  kundeId: 'k1', kundeSnapshot: { firma: 'Meier AG', ort: 'Basel', strasse: 'Musterstrasse 1', plz: '4051' },
  sachbearbeiter: { userId: 'u_pl', name: 'Planer Peter' },
  erstelltVon: { userId: 'u_pl', name: 'Planer Peter' }, positionen: []
}];
const OBJEKTE = { objekte: [{ id: 'obj1', name: 'MFH Musterstrasse', orgId: 'org_test' }, { id: 'obj2', name: 'EFH Huber', orgId: 'org_test' }], beteiligte: [], activeObjektId: null };

function ls(roles, extra) {
  return Object.assign(seed(roles || ['role_monteur']), {
    gema_einsatz_pool_v1: EINSAETZE,
    gema_erp_dok_pool_v1: ERP,
    gema_objekte_v1: OBJEKTE,
    gema_coachmarks_done_pm_stunden: '1',
    gema_coachmarks_done_pm_einsatzplan: '1'
  }, extra || {});
}
// Der Harness mockt Supabase leer → bindCollection überschreibt die Pools.
// Nach dem Pull setzen wir sie neu (getCached liest localStorage zuerst) und
// hängen die Org-Einstellungen an — genau wie im Echtbetrieb aus der Cloud.
async function setup(page, d) {
  await page.evaluate((x) => {
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(x.ev));
    localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(x.erp));
    if (x.tage) localStorage.setItem('gema_std_pool_v1', JSON.stringify(x.tage));
    const orgs = JSON.parse(localStorage.getItem('gema_orgs_v1') || '[]');
    if (orgs[0]) {
      orgs[0].settings = orgs[0].settings || {};
      orgs[0].settings.arbeitsbereiche = x.ab;
      orgs[0].settings.einsatzplan = Object.assign({ tagVon: 7, tagBis: 18 }, orgs[0].settings.einsatzplan || {}, { folgegruende: x.gr });
      localStorage.setItem('gema_orgs_v1', JSON.stringify(orgs));
    }
  }, d);
  await page.waitForTimeout(120);
}
async function stundenSeite(browser, seedObj, tage) {
  const { ctx, page } = await newPage(browser, seedObj);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof stRender === 'function' && typeof stAbschlussTermine === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  await setup(page, { ev: EINSAETZE, erp: ERP, ab: AB, gr: GRUENDE, tage: tage || null });
  await page.evaluate((d) => { _tagDatum = d; _wkMode = 'tag'; stRender(); }, HEUTE);
  await page.waitForTimeout(250);
  return { ctx, page, errs };
}
const tagMit = (eintraege) => ([{
  id: 'tagX', orgId: 'org_test', userId: 'u_test', userName: 'Test User', datum: HEUTE,
  status: 'offen', spesen: {}, eintraege: eintraege
}]);

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* ════════ A · Einstellungen: ✅-Bereich + Grund-Vorlagen ════════ */
console.log('■ A · Einstellung: Abschluss-Pflicht pro Bereich + Grund-Vorlagen');
{
  const { ctx, page } = await newPage(browser, ls(['role_planer']));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof abRowsCollect === 'function' && typeof fgRowsCollect === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(500);
  // Editor-Roundtrip: Haken setzen → einsammeln
  const rt = await page.evaluate(() => {
    document.getElementById('ep_abRows').innerHTML = abRowHtml({ id: 'ab_srv', name: 'Sanitärservice', farbe: '#16a34a', abschlussPflicht: true });
    const gesetzt = !!document.querySelector('#ep_abRows .ab-abschluss:checked');
    const raus = abRowsCollect('ep_abRows');
    // Haken entfernen → Feld verschwindet wieder
    document.querySelector('#ep_abRows .ab-abschluss').checked = false;
    const ohne = abRowsCollect('ep_abRows');
    return { gesetzt, raus, ohne };
  });
  ok(rt.gesetzt, '✅-Haken wird aus dem gespeicherten Bereich vorbelegt');
  ok(rt.raus[0] && rt.raus[0].abschlussPflicht === true && rt.raus[0].id === 'ab_srv', 'abschlussPflicht wird gespeichert (ID bleibt stabil)');
  ok(rt.ohne[0] && rt.ohne[0].abschlussPflicht === undefined, 'ohne Haken kein abschlussPflicht-Feld (Bestandsschutz)');
  // Grund-Vorlagen
  const gr = await page.evaluate(() => {
    document.getElementById('ep_fgRows').innerHTML = '';
    fgVorlagenEinfuegen();
    const n1 = document.querySelectorAll('#ep_fgRows .fg-row').length;
    fgVorlagenEinfuegen();                       // idempotent, keine Dubletten
    const n2 = document.querySelectorAll('#ep_fgRows .fg-row').length;
    return { n1, n2, rows: fgRowsCollect('ep_fgRows') };
  });
  ok(gr.n1 === 7 && gr.n2 === 7, '«Beispiele einfügen» legt 7 Gründe an und dupliziert nicht');
  ok(gr.rows.length === 7 && /^fg_/.test(gr.rows[0].id), 'Gründe bekommen stabile fg_-IDs');
  ok(errs.length === 0, 'keine pageerrors (A)');
  await ctx.close();
}

/* ════════ B · Nur ✅-Bereiche fragen; Gate vor der Freigabe ════════ */
console.log('■ B · Abschluss-Frage nur im ✅-Bereich, blockiert die Freigabe');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls(), tagMit([
    { id: 'e1', von: '07:00', bis: '12:00', pauseMin: 0, objektId: 'obj1', objektName: 'MFH Musterstrasse', taetigkeit: 'Service', einsatzId: 'ev_a', materialAntwort: 'kein' },
    { id: 'e2', von: '13:00', bis: '17:00', pauseMin: 0, objektId: 'obj2', objektName: 'EFH Huber', taetigkeit: 'Montage', einsatzId: 'ev_b', materialAntwort: 'kein' }
  ]));
  const st = await page.evaluate((d) => {
    const t = stTagFor(d, 'u_test');
    return { pflicht: stAbschlussTermine(d).map(e => e.id), fehlt: stAbschlussFehlt(d, t).map(e => e.id), txt: document.body.innerText };
  }, HEUTE);
  ok(JSON.stringify(st.pflicht) === '["ev_a"]', 'nur der ✅-Bereich verlangt eine Antwort');
  ok(JSON.stringify(st.fehlt) === '["ev_a"]', 'offene Antwort wird erkannt');
  ok(st.txt.indexOf('Abschluss-Frage offen') >= 0, 'Termin-Karte zeigt die offene Frage');
  // Freigabe blockiert
  await page.evaluate((d) => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(300);
  const dlg = await page.evaluate(() => (document.querySelector('.gema-dlg-title') || {}).textContent || '');
  ok(/Abschluss-Frage offen/.test(dlg), 'Tages-Freigabe blockiert mit Hinweis auf die Abschluss-Frage');
  await page.click('[data-act="cancel"]');
  await page.waitForTimeout(200);
  const nochOffen = await page.evaluate((d) => (stTagFor(d, 'u_test') || {}).status, HEUTE);
  ok(nochOffen === 'offen', 'Tag bleibt offen');
  ok(errs.length === 0, 'keine pageerrors (B)');
  await ctx.close();
}

/* ════════ C · Folgetermin nötig ════════ */
console.log('■ C · «Folgetermin nötig» — Grund, Meldung, Rück-Meldung');
{
  // Beide Termine erfasst — sonst würde die Freigabe ev_b materialisieren und
  // dafür (korrekt) die Material-Frage stellen; hier geht es um die Abschluss-Frage
  const { ctx, page, errs } = await stundenSeite(browser, ls(), tagMit([
    { id: 'e1', von: '07:00', bis: '12:00', pauseMin: 0, objektId: 'obj1', objektName: 'MFH Musterstrasse', taetigkeit: 'Service', einsatzId: 'ev_a', materialAntwort: 'kein' },
    { id: 'e2', von: '13:00', bis: '17:00', pauseMin: 0, objektId: 'obj2', objektName: 'EFH Huber', taetigkeit: 'Montage', einsatzId: 'ev_b', materialAntwort: 'kein' }
  ]));
  await page.evaluate((d) => stAbschlussOpen(d, 'ev_a'), HEUTE);
  await page.waitForTimeout(250);
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('#ab_gruende button')).map(b => b.textContent));
  ok(chips.length === 2 && chips[0] === 'Fehlendes Material', 'Grund-Vorlagen erscheinen als Chips');
  // Ohne Grund speichern → blockiert
  await page.evaluate(() => { stAbschlussWahl('folge'); stAbschlussSave(); });
  await page.waitForTimeout(200);
  const ohneGrund = await page.evaluate((d) => { const t = stTagFor(d, 'u_test'); return !!(t && t.terminAbschluss && t.terminAbschluss.ev_a); }, HEUTE);
  ok(!ohneGrund, 'ohne Begründung wird nichts gespeichert');
  // Chip klicken füllt das Feld, dann speichern
  await page.click('#ab_gruende button[data-g="0"]');
  await page.waitForTimeout(120);
  const feld = await page.evaluate(() => document.getElementById('ab_grund').value);
  ok(feld === 'Fehlendes Material', 'Chip füllt das Grund-Feld');
  await page.evaluate(() => stAbschlussSave());
  await page.waitForTimeout(400);
  const res = await page.evaluate((d) => {
    const t = stTagFor(d, 'u_test');
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(x => x.id === 'ev_a');
    const n = (JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]'));
    return { rec: t.terminAbschluss.ev_a, abschluss: ev && ev.abschluss, notify: n.map(x => ({ k: x.eventKey, u: x.empfaengerUserId, t: x.text })), fehlt: stAbschlussFehlt(d, t).length, txt: document.body.innerText };
  }, HEUTE);
  ok(res.rec && res.rec.status === 'folge' && res.rec.grund === 'Fehlendes Material', 'Antwort am Tages-Record gespeichert');
  ok(res.abschluss && res.abschluss.status === 'folge' && res.abschluss.grund === 'Fehlendes Material', 'Rück-Meldung am Termin (ev.abschluss)');
  ok(res.fehlt === 0, 'Gate ist erfüllt');
  const nf = res.notify.filter(x => x.k === 'termin_folgetermin');
  ok(nf.length === 1 && nf[0].u === 'u_pl', 'Meldung geht an den Sachbearbeiter des Auftrags');
  ok(/Fehlendes Material/.test(nf[0].t || ''), 'Meldung nennt den Grund');
  ok(res.txt.indexOf('Folgetermin nötig: Fehlendes Material') >= 0, 'Termin-Karte zeigt die Antwort');
  // Freigabe läuft jetzt durch
  await page.evaluate((d) => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(300);
  const title = await page.evaluate(() => ({t:(document.querySelector('.gema-dlg-title') || {}).textContent || '', m:(document.querySelector('.gema-dlg-msg')||{}).textContent||''}));
  ok(title.t === 'Tag freigeben', 'Freigabe erreicht den Bestätigungs-Dialog');
  await page.click('[data-act="cancel"]');
  ok(errs.length === 0, 'keine pageerrors (C)');
  await ctx.close();
}

/* ════════ D · Offerte nötig → ERP-Entwurf ════════ */
console.log('■ D · «Offerte nötig» erzeugt einen ERP-Offert-Entwurf');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls(), tagMit([
    { id: 'e1', von: '07:00', bis: '12:00', pauseMin: 0, objektId: 'obj1', objektName: 'MFH Musterstrasse', taetigkeit: 'Service', einsatzId: 'ev_a', materialAntwort: 'kein' }
  ]));
  await page.evaluate((d) => { stAbschlussOpen(d, 'ev_a'); stAbschlussWahl('offerte'); }, HEUTE);
  await page.waitForTimeout(200);
  // Zu kurzer Beschrieb → blockiert
  await page.evaluate(() => { document.getElementById('ab_beschrieb').value = 'x'; stAbschlussSave(); });
  await page.waitForTimeout(200);
  const kurz = await page.evaluate(() => (GemaSync.getCached('gema_erp_dok_pool_v1') || []).filter(d => d.typ === 'offerte').length);
  ok(kurz === 0, 'ohne brauchbaren Beschrieb entsteht keine Offerte');
  await page.evaluate(() => {
    document.getElementById('ab_beschrieb').value = 'Lavabo-Armatur im Gäste-WC ersetzen, Eckventile mitwechseln';
    stAbschlussSave();
  });
  await page.waitForTimeout(400);
  const res = await page.evaluate((d) => {
    const t = stTagFor(d, 'u_test');
    const off = (GemaSync.getCached('gema_erp_dok_pool_v1') || []).filter(x => x.typ === 'offerte');
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(x => x.id === 'ev_a');
    const n = JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]').filter(x => x.eventKey === 'termin_offerte');
    return { rec: t.terminAbschluss.ev_a, off: off[0] || null, anz: off.length, abschluss: ev && ev.abschluss, notify: n[0] || null, txt: document.body.innerText };
  }, HEUTE);
  ok(res.anz === 1 && res.off, 'genau ein Offert-Entwurf entstanden');
  ok(res.off.status === 'entwurf' && /^OF-\d{4}-001$/.test(res.off.nr), 'Entwurf mit Offert-Nummernkreis (' + (res.off && res.off.nr) + ')');
  ok(res.off.objektId === 'obj1' && res.off.kundeSnapshot && res.off.kundeSnapshot.firma === 'Meier AG', 'Kunde + Objekt vom Termin/Auftrag übernommen');
  ok(res.off.sachbearbeiter && res.off.sachbearbeiter.userId === 'u_pl', 'Projektleitung ist Sachbearbeiter');
  ok(res.off.positionen.length === 1 && /Lavabo-Armatur/.test(res.off.positionen[0].bez), 'Beschrieb des Monteurs als Position');
  ok(res.off.bereichId === 'ab_srv', 'Arbeitsbereich vererbt');
  ok(res.off.herkunft && res.off.herkunft.einsatzId === 'ev_a', 'Spur zurück zum Termin');
  ok(res.rec.offerteNr === res.off.nr, 'Antwort merkt sich die Offerten-Nummer');
  ok(res.abschluss && res.abschluss.status === 'offerte' && res.abschluss.offerteNr === res.off.nr, 'Rück-Meldung am Termin nennt die Offerte');
  ok(res.notify && res.notify.empfaengerUserId === 'u_pl' && /doc=/.test(res.notify.link || ''), 'Meldung an die Projektleitung verlinkt den Entwurf');
  ok(res.txt.indexOf('Offerte nötig') >= 0 && res.txt.indexOf(res.off.nr) >= 0, 'Termin-Karte zeigt Offerten-Nummer');
  ok(errs.length === 0, 'keine pageerrors (D)');
  await ctx.close();
}

/* ════════ E · «Abgeschlossen» + Ausfall-Meldung ════════ */
console.log('■ E · «Arbeit abgeschlossen» und Ausfall-Meldung an die Planung');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls(), tagMit([
    { id: 'e1', von: '07:00', bis: '12:00', pauseMin: 0, objektId: 'obj1', objektName: 'MFH Musterstrasse', taetigkeit: 'Service', einsatzId: 'ev_a', materialAntwort: 'kein' }
  ]));
  await page.evaluate((d) => { stAbschlussOpen(d, 'ev_a'); stAbschlussWahl('fertig'); stAbschlussSave(); }, HEUTE);
  await page.waitForTimeout(350);
  const fertig = await page.evaluate((d) => {
    const t = stTagFor(d, 'u_test');
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(x => x.id === 'ev_a');
    const n = JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]');
    return { st: t.terminAbschluss.ev_a.status, ev: ev && ev.abschluss && ev.abschluss.status, notify: n.filter(x=>/^termin_/.test(x.eventKey||'')).length, alle: n.map(x=>x.eventKey), txt: document.body.innerText };
  }, HEUTE);
  ok(fertig.st === 'fertig' && fertig.ev === 'fertig', '«abgeschlossen» wird gespeichert und zurückgemeldet');
  ok(fertig.notify === 0, 'der Normalfall erzeugt KEINE Termin-Meldung (kein Rauschen)');
  ok(fertig.txt.indexOf('Arbeit abgeschlossen') >= 0, 'Termin-Karte zeigt den Abschluss');

  // Ausfall meldet an die Planung — und hebt die Abschluss-Pflicht auf
  await page.evaluate((d) => stTerminAusfall(d, 'ev_a'), HEUTE);
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.querySelector('.gema-dlg-input').value = 'Kunde nicht angetroffen'; });
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(400);
  const aus = await page.evaluate((d) => {
    const t = stTagFor(d, 'u_test');
    const n = JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]').filter(x => x.eventKey === 'termin_ausgefallen');
    return { notify: n[0] || null, pflicht: stAbschlussTermine(d).length, fehlt: stAbschlussFehlt(d, t).length };
  }, HEUTE);
  ok(aus.notify && aus.notify.empfaengerUserId === 'u_pl' && /Kunde nicht angetroffen/.test(aus.notify.text || ''), 'Ausfall meldet Grund an die Projektleitung');
  ok(aus.notify.typ === 'warnung', 'Ausfall-Meldung ist eine Warnung');
  ok(aus.pflicht === 0 && aus.fehlt === 0, 'ausgefallener Termin verlangt keine Abschluss-Antwort mehr');
  ok(errs.length === 0, 'keine pageerrors (E)');
  await ctx.close();
}

/* ════════ F · Folgetermin-Pool in den Terminen ════════ */
console.log('■ F · Folgetermin-Pool: Meldung erscheint, einplanen, erledigen');
{
  const evs = JSON.parse(JSON.stringify(EINSAETZE));
  evs[0].abschluss = { status: 'folge', grund: 'Fehlendes Material', datum: HEUTE, am: new Date().toISOString(), vonName: 'Test User' };
  evs[1].ist = { status: 'ausgefallen', grund: 'Kein Zugang', stunden: 0.5, datum: HEUTE, am: new Date().toISOString(), vonName: 'Test User' };
  const { ctx, page } = await newPage(browser, ls(['role_planer']));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epRender === 'function' && typeof epFolgePool === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  await page.evaluate((x) => {
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(x.ev));
    localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(x.erp));
    const orgs = JSON.parse(localStorage.getItem('gema_orgs_v1') || '[]');
    orgs[0].settings = orgs[0].settings || {};
    orgs[0].settings.arbeitsbereiche = x.ab;
    orgs[0].settings.einsatzplan = { tagVon: 7, tagBis: 18, userIds: ['u_test'], folgegruende: x.gr };
    localStorage.setItem('gema_orgs_v1', JSON.stringify(orgs));
    epRender();
  }, { ev: evs, erp: ERP, ab: AB, gr: GRUENDE });
  await page.waitForTimeout(350);

  const pool = await page.evaluate(() => ({
    ids: epFolgePool().map(r => r.ev.id),
    arten: epFolgePool().map(r => r.info.art),
    txt: document.body.innerText,
    karten: document.querySelectorAll('.job-folge').length
  }));
  ok(JSON.stringify(pool.ids.sort()) === '["ev_a","ev_b"]', 'Folgetermin-Meldung UND Ausfall stehen im Pool');
  ok(pool.arten.indexOf('folge') >= 0 && pool.arten.indexOf('ausgefallen') >= 0, 'beide Herkunftsarten erkannt');
  ok(pool.karten === 2, 'zwei Karten in der Sidebar');
  ok(pool.txt.indexOf('Folgetermin nötig') >= 0 && pool.txt.indexOf('Fehlendes Material') >= 0, 'Sektion mit Grund sichtbar');
  ok(pool.txt.indexOf('Nicht stattgefunden') >= 0 && pool.txt.indexOf('Kein Zugang') >= 0, 'Ausfall-Karte mit Grund');

  // Einplanen: Karte auf eine Zelle «droppen»
  const morgen = await page.evaluate((d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }, HEUTE);
  await page.evaluate((d) => epDropOn('folge:ev_a', 'u_test', d, 8), morgen);
  await page.waitForTimeout(400);
  const nach = await page.evaluate((d) => {
    const pool = GemaSync.getCached('gema_einsatz_pool_v1') || [];
    const neu = pool.find(e => e.folgeVon && e.folgeVon.einsatzId === 'ev_a');
    const alt = pool.find(e => e.id === 'ev_a');
    return { neu: neu || null, erledigt: alt && alt.folgeErledigt || null, poolIds: epFolgePool().map(r => r.ev.id), n: pool.length };
  }, morgen);
  ok(nach.neu && nach.neu.datum === morgen, 'neuer Termin am Zieltag angelegt');
  ok(nach.neu.objektId === 'obj1' && nach.neu.auftragId === 'auf1' && nach.neu.bereichId === 'ab_srv', 'Projekt, Auftrag und Bereich übernommen');
  ok(/Fehlendes Material/.test(nach.neu.notiz || ''), 'Grund steht als Notiz am neuen Termin');
  ok(nach.neu.zeitVon === '08:00', 'Drop-Stunde wird zur Startzeit');
  ok(nach.erledigt && nach.erledigt.neuerEinsatzId === nach.neu.id, 'Quelle als erledigt markiert (mit Verweis)');
  ok(JSON.stringify(nach.poolIds) === '["ev_b"]', 'eingeplante Meldung verschwindet aus dem Pool');

  // «✓ erledigt» ohne neuen Termin
  await page.evaluate(() => epFolgeErledigt('ev_b'));
  await page.waitForTimeout(300);
  const leer = await page.evaluate(() => ({ ids: epFolgePool().map(r => r.ev.id), karten: document.querySelectorAll('.job-folge').length }));
  ok(leer.ids.length === 0 && leer.karten === 0, '«✓ erledigt» räumt den Pool ohne neuen Termin');
  ok(errs.length === 0, 'keine pageerrors (F)');
  await ctx.close();
}

/* ════════ G · Abschluss-Stand im Termin sichtbar ════════ */
console.log('■ G · Abschluss-Stand im Termine-Modul sichtbar');
{
  const evs = JSON.parse(JSON.stringify(EINSAETZE));
  evs[0].abschluss = { status: 'offerte', beschrieb: 'Armatur ersetzen', offerteId: 'erp_x', offerteNr: 'OF-2026-007', datum: HEUTE, am: new Date().toISOString(), vonName: 'Test User' };
  const { ctx, page } = await newPage(browser, ls(['role_planer']));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epAbschlussZeile === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(800);
  const html = await page.evaluate((x) => {
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(x.ev));
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(e => e.id === 'ev_a');
    return { plan: epAbschlussZeile(ev), leer: epAbschlussZeile({ id: 'x' }) };
  }, { ev: evs });
  ok(/Offerte nötig/.test(html.plan) && /Armatur ersetzen/.test(html.plan), 'Offerte-Meldung erscheint am Termin');
  ok(/OF-2026-007/.test(html.plan) && /pm_erp\.html\?doc=erp_x/.test(html.plan), 'Planung bekommt den Link zum Entwurf');
  ok(html.leer === '', 'Termine ohne Rückmeldung bleiben unverändert');
  ok(errs.length === 0, 'keine pageerrors (G)');
  await ctx.close();
}

await browser.close();
await server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
