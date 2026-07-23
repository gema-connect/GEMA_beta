// Playwright-Test: Tages-Freigabe + Foto-Pflicht + Material-Pflicht + Termine
// Deckt ab (User-Feedback 23.07.2026 + AUQ-Entscheide):
//   - Umbenennung: Einsatzplan heisst im UI «Termine» (Titel, Modul-Label)
//   - Arbeitsbereiche mit 📷 Foto-Pflicht (Editor-Roundtrip abRowHtml/abRowsCollect)
//   - Freitext-Besonderheiten DIREKT im Termin (ev.besonderheitenFrei):
//     Erfassen im Modal (epBesFreiAdd), ☆ «als Vorlage speichern»
//     (epBesFreiVorlage → org-Liste + Chip-Umhängung), Badge-Anzeige überall
//     (bsAlle/bsChipsHtml + stBesChips in der Stundenerfassung)
//   - Stundenerfassung: Freigabe NUR pro Tag (kein «Woche einreichen» mehr);
//     stTagEinreichen blockt ohne aktive Material-Antwort und ohne Foto der
//     Foto-Pflicht-Termine; «Kein Foto» nur mit Begründung; die Projektleitung
//     sieht die Begründung ROT in der Freigabe-Ansicht
// Ausführen: CHROME=<chromium> node scripts/stunden_freigabe_foto_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};
const HEUTE = new Date().toISOString().slice(0, 10);

const EINSATZ = [{
  id: 'einS', orgId: 'org_test', typ: 'frei', titel: 'Boiler-Service Meier', objektId: 'obj1', objektName: 'MFH Muster',
  monteurUserId: 'u_test', monteurName: 'Test User', datum: HEUTE, dauerTage: 1, slot: 'ganz',
  bereichId: 'ab_srv', besonderheiten: [], besonderheitenFrei: ['Schuhe ausziehen beim Kunden'], erstelltVon: { userId: 'u_test', name: 'Test User' }
}];
const TAG = [{
  id: 'tag1', orgId: 'org_test', userId: 'u_test', userName: 'Test User', datum: HEUTE, status: 'offen', spesen: {},
  eintraege: [{ id: 'e1', von: '07:00', bis: '11:00', pauseMin: 0, objektId: 'obj1', objektName: 'MFH Muster', taetigkeit: 'Service Boiler', einsatzId: 'einS' }]
}];
const ARBEITSBEREICHE = [
  { id: 'ab_srv', name: 'Service', farbe: '#16a34a', fotoPflicht: true },
  { id: 'ab_mon', name: 'Montage', farbe: '#2563eb' }
];

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* ════════ 1 · Termine (pm_einsatzplan): Umbenennung + Freitext-Besonderheiten ════════ */
console.log('■ Termine: Umbenennung + Freitext-Besonderheiten im Termin');
{
  const s = seed(['role_planer']);
  const { ctx, page } = await newPage(browser, s);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epRender === 'function' && typeof bsAlle === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.title.indexOf('Termine') === 0), 'Seitentitel «Termine – GEMA»');
  ok(await page.evaluate(() => (document.querySelector('.hero-title') || {}).textContent === 'Termine'), 'Hero heisst «Termine»');
  ok(await page.evaluate(() => {
    const m = (GemaAuth.getModules() || []).find(x => x.key === 'einsatzplan');
    return m && m.label === 'Termine';
  }), 'Modul-Label in gema_auth = «Termine» (Key bleibt einsatzplan)');

  // Setup: Person planbar + Arbeitsbereiche mit Foto-Pflicht
  await page.evaluate(ab => {
    const u = GemaAuth.getCurrentUser();
    const org = GemaAuth.getOrgs()[0];
    const st = org.settings || {};
    st.einsatzplan = Object.assign({}, st.einsatzplan, { userIds: [u.id] });
    st.arbeitsbereiche = ab;
    GemaAuth.updateOrgSettings(org.id, st);
    epRender();
  }, ARBEITSBEREICHE);

  // ⚙️-Editor-Roundtrip: 📷-Checkbox rein + raus
  const abRt = await page.evaluate(() => {
    const host = document.createElement('div'); host.id = '_abTest';
    host.innerHTML = abRowHtml({ id: 'ab_srv', name: 'Service', farbe: '#16a34a', fotoPflicht: true }) + abRowHtml({ id: 'ab_mon', name: 'Montage', farbe: '#2563eb' });
    document.body.appendChild(host);
    const out = abRowsCollect('_abTest');
    host.remove();
    return { srvChecked: /class="ab-foto" checked/.test(abRowHtml({ fotoPflicht: true, name: 'x' })), collected: out };
  });
  ok(abRt.srvChecked, 'abRowHtml rendert die 📷-Foto-Pflicht-Checkbox (checked)');
  ok(abRt.collected.length === 2 && abRt.collected[0].fotoPflicht === true && !abRt.collected[1].fotoPflicht, 'abRowsCollect übernimmt fotoPflicht nur bei gesetztem Haken');
  ok(await page.evaluate(() => abListe().find(b => b.id === 'ab_srv').fotoPflicht === true), 'abListe() reicht fotoPflicht durch (Normalisierung strippt es nicht)');

  // Neuer Termin: Freitext-Besonderheit direkt im Modal erfassen
  await page.evaluate(() => { epNeu(); });
  await page.waitForTimeout(300);
  const modalDa = await page.evaluate(() => ({
    open: document.getElementById('evModal').classList.contains('open'),
    titel: (document.getElementById('evTitle') || {}).textContent,
    freiRow: !!document.getElementById('ev_besFreiInp') && document.getElementById('evBesWrap').style.display !== 'none'
  }));
  ok(modalDa.open && /Termin/.test(modalDa.titel), 'Termin-Modal öffnet («' + modalDa.titel + '»)');
  ok(modalDa.freiRow, 'Freitext-Eingabe für Besonderheiten sichtbar (auch ohne Vorlagen-Liste)');
  await page.evaluate(() => {
    document.getElementById('ev_besFreiInp').value = 'Schuhe ausziehen beim Kunden';
    epBesFreiAdd();
    document.getElementById('ev_besFreiInp').value = 'Hund im Haus — klingeln';
    epBesFreiAdd();
  });
  ok(await page.evaluate(() => (curEv.besonderheitenFrei || []).length === 2 && document.getElementById('evBesFrei').textContent.indexOf('Schuhe ausziehen') >= 0), 'Zwei Freitext-Besonderheiten am Termin erfasst (Chips im Modal)');
  // ☆ als Vorlage speichern → org-Liste + Umhängen auf den Chip
  await page.evaluate(() => epBesFreiVorlage(1));
  await page.waitForTimeout(200);
  const vorl = await page.evaluate(() => {
    const org = GemaAuth.getOrgs()[0];
    const l = (org.settings.einsatzplan && org.settings.einsatzplan.besonderheiten) || [];
    const eintrag = l.find(b => b.label === 'Hund im Haus — klingeln');
    return { inListe: !!eintrag, alsChip: eintrag ? (curEv.besonderheiten || []).indexOf(eintrag.id) >= 0 : false, freiRest: (curEv.besonderheitenFrei || []).length };
  });
  ok(vorl.inListe, '☆ speichert die Besonderheit als org-weite Vorlage');
  ok(vorl.alsChip && vorl.freiRest === 1, 'Termin hängt auf den Vorlagen-Chip um (Freitext-Eintrag entfernt)');

  // Speichern → Record trägt besonderheitenFrei; Badge-Merge in bsAlle/bsChipsHtml
  await page.evaluate(d => {
    document.getElementById('ev_titel').value = 'Boiler-Service Meier';
    const u = GemaAuth.getCurrentUser();
    document.getElementById('ev_monteur').value = u.id;
    document.getElementById('ev_datum').value = d;
    epEvSave();
  }, HEUTE);
  await page.waitForTimeout(300);
  const gespeichert = await page.evaluate(() => {
    const pool = JSON.parse(localStorage.getItem('gema_einsatz_pool_v1') || '[]');
    const ev = pool.find(e => e.titel === 'Boiler-Service Meier');
    return { frei: ev && ev.besonderheitenFrei, chips: ev ? bsChipsHtml(ev) : '', icons: ev ? bsIconsText(ev) : '' };
  });
  ok(gespeichert.frei && gespeichert.frei[0] === 'Schuhe ausziehen beim Kunden', 'Gespeicherter Termin trägt die Freitext-Besonderheit');
  ok(gespeichert.chips.indexOf('Schuhe ausziehen') >= 0 && gespeichert.chips.indexOf('Hund im Haus') >= 0, 'bsChipsHtml zeigt Vorlagen-Chip UND Freitext als Badge');
  ok(gespeichert.icons.indexOf('📌') >= 0, 'bsIconsText enthält das 📌-Icon des Freitexts (Kalender-Karten)');
  ok(errs.length === 0, 'Keine JS-Fehler in pm_einsatzplan (' + errs.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

/* ════════ 2 · Stundenerfassung (Monteur): Gates + Tages-Freigabe ════════ */
console.log('■ Stundenerfassung: Foto-/Material-Gate + Tag freigeben');
let poolNachher = null;
{
  const s = seed(['role_monteur']);
  s.gema_einsatz_pool_v1 = EINSATZ;
  const { ctx, page } = await newPage(browser, s);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof stRender === 'function' && typeof stTagEinreichen === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(600);
  await page.evaluate(d => {
    const org = GemaAuth.getOrgs()[0];
    const st = org.settings || {};
    st.arbeitsbereiche = d.ab;
    GemaAuth.updateOrgSettings(org.id, st);
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(d.eins));
    localStorage.setItem('gema_std_pool_v1', JSON.stringify(d.tag));
    stSetWkMode('tag');
  }, { ab: ARBEITSBEREICHE, eins: EINSATZ, tag: TAG });
  await page.waitForTimeout(300);

  const tagView = await page.evaluate(() => document.getElementById('viewWrap').textContent);
  ok(tagView.indexOf('Geplante Termine') >= 0 && tagView.indexOf('Boiler-Service Meier') >= 0, 'Tagesansicht zeigt den geplanten Termin');
  ok(tagView.indexOf('Schuhe ausziehen beim Kunden') >= 0, 'Freitext-Besonderheit als Badge beim Monteur (stBesChips)');
  ok(tagView.indexOf('Foto-Pflicht') >= 0 && tagView.indexOf('Service') >= 0, 'Foto-Pflicht-Hinweis mit Bereichsname («Service»)');
  ok(await page.evaluate(() => document.getElementById('viewWrap').innerHTML.indexOf('stTerminFotoAdd') >= 0 && document.getElementById('viewWrap').innerHTML.indexOf('stTerminKeinFoto') >= 0), 'Buttons «📷 Foto» + «🚫 Kein Foto» vorhanden');
  ok(tagView.indexOf('Tag freigeben') >= 0, '«📤 Tag freigeben»-Button in der Tagesansicht');
  ok(tagView.indexOf('Woche einreichen') < 0, 'Kein «Woche einreichen» mehr (Freigabe NUR pro Tag)');
  ok(await page.evaluate(() => typeof window.stWocheEinreichen === 'undefined'), 'stWocheEinreichen existiert nicht mehr');
  ok(tagView.indexOf('❓ 1 Material-Frage') >= 0 || tagView.indexOf('Material-Frage') >= 0, 'Offene-Pflichten-Hinweis (Material) auf der Tages-Karte');

  // Gate 1: Material-Frage unbeantwortet → Freigabe blockt mit Dialog
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(350);
  const dlg1 = await page.evaluate(() => {
    const d = document.querySelector('.gema-dlg');
    return d ? d.textContent : '';
  });
  ok(dlg1.indexOf('Material-Frage offen') >= 0, 'Freigabe blockt: Dialog «Material-Frage offen»');
  await page.click('.gema-dlg .gema-dlg-cancel');
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('gema_std_pool_v1'))[0].status === 'offen'), 'Tag bleibt offen (nicht eingereicht)');

  // Material aktiv beantworten: «Nein» → Rapport ohne Material (stRrSave)
  await page.evaluate(d => stRrStart(d, 'e1'), HEUTE);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('rrModal').classList.contains('open')), 'Material-Dialog öffnet (stRrStart)');
  ok(await page.evaluate(() => document.querySelector('#rrModal .modal-ft .btn').textContent.indexOf('Später') >= 0), 'Skip-Button heisst «⏳ Später» (Frage bleibt offen)');
  await page.evaluate(() => { stRrMaterial(false); stRrSave(); });
  await page.waitForTimeout(700);
  const nachMat = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('gema_std_pool_v1'))[0];
    const e = t.eintraege[0];
    const regie = JSON.parse(localStorage.getItem('gema_regie_pool_v1') || '[]');
    return { antwort: e.materialAntwort, rapport: !!e.rapportId, regieN: regie.length };
  });
  ok(nachMat.antwort === 'rapport' && nachMat.rapport && nachMat.regieN === 1, 'Antwort «Nein» erzeugt den Rapport (Stunden schreiben = Regierapport) + materialAntwort gesetzt');

  // Gate 2: Foto fehlt → Freigabe blockt mit Foto-Dialog
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(350);
  const dlg2 = await page.evaluate(() => (document.querySelector('.gema-dlg') || {}).textContent || '');
  ok(dlg2.indexOf('Foto fehlt') >= 0 && dlg2.indexOf('Boiler-Service Meier') >= 0, 'Freigabe blockt: Dialog «📷 Foto fehlt» nennt den Termin');
  await page.click('.gema-dlg .gema-dlg-cancel');
  await page.waitForTimeout(250);

  // «Kein Foto» ohne Begründung unmöglich, mit Begründung ok
  await page.evaluate(d => stTerminKeinFoto(d, 'einS'), HEUTE);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('.gema-dlg #_gdInput')), '«Kein Foto» verlangt eine Begründung (Prompt)');
  await page.evaluate(() => { document.querySelector('.gema-dlg #_gdInput').value = ''; });
  await page.click('.gema-dlg .gema-dlg-confirm');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('gema_std_pool_v1'))[0]; return !(t.terminFotos && t.terminFotos.einS); }), 'Leere Begründung wird NICHT übernommen');
  await page.evaluate(d => stTerminKeinFoto(d, 'einS'), HEUTE);
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('.gema-dlg #_gdInput').value = 'Kunde verbietet Fotos in der Wohnung'; });
  await page.click('.gema-dlg .gema-dlg-confirm');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('gema_std_pool_v1'))[0];
    return t.terminFotos && t.terminFotos.einS && t.terminFotos.einS.keinFoto && /verbietet/.test(t.terminFotos.einS.grund);
  }), '«Kein Foto» mit Begründung am Tages-Record gespeichert');
  ok(await page.evaluate(() => document.getElementById('viewWrap').textContent.indexOf('Kein Foto: Kunde verbietet') >= 0), 'Roter «Kein Foto»-Badge in der Tagesansicht');

  // Jetzt lässt sich der Tag freigeben (Bestätigungs-Dialog → eingereicht)
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(350);
  const dlg3 = await page.evaluate(() => (document.querySelector('.gema-dlg') || {}).textContent || '');
  ok(dlg3.indexOf('Tag freigeben') >= 0, 'Freigabe-Bestätigung erscheint (Gates erfüllt)');
  await page.click('.gema-dlg .gema-dlg-confirm');
  await page.waitForTimeout(400);
  const nachFrei = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('gema_std_pool_v1'))[0];
    const notifs = JSON.parse(localStorage.getItem('gema_notifications_v1') || '[]');
    const n = notifs.find(x => x.eventKey === 'stunden_eingereicht');
    return { status: t.status, notifText: n ? n.text : '' };
  });
  ok(nachFrei.status === 'eingereicht', 'Tag ist eingereicht (Tages-Freigabe)');
  ok(nachFrei.notifText.indexOf('ohne Foto') >= 0, 'Notify an die Projektleitung weist «ohne Foto (mit Begründung)» aus');
  poolNachher = await page.evaluate(() => localStorage.getItem('gema_std_pool_v1'));
  ok(errs.length === 0, 'Keine JS-Fehler in pm_stunden (' + errs.slice(0, 2).join(' | ') + ')');
  await ctx.close();
}

/* ════════ 3 · Freigabe-Ansicht (Projektleitung): Kein-Foto ROT sichtbar ════════ */
console.log('■ Freigabe durch die Projektleitung: 🚫 Kein Foto klar ersichtlich');
{
  const s = seed(['role_planer']);
  const { ctx, page } = await newPage(browser, s);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof stRender === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(600);
  await page.evaluate(d => {
    localStorage.setItem('gema_std_pool_v1', d.pool);
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(d.eins));
    _view = 'freigabe';
    stRender();
  }, { pool: poolNachher, eins: EINSATZ });
  await page.waitForTimeout(300);
  const frei = await page.evaluate(() => document.getElementById('viewWrap').innerHTML);
  ok(frei.indexOf('Kein Foto') >= 0 && frei.indexOf('Kunde verbietet Fotos') >= 0, 'Freigabe zeigt die «Kein Foto»-Begründung');
  ok(/gavnote[^>]*red/.test(frei) || frei.indexOf('var(--red)') >= 0, '… ROT hervorgehoben (unübersehbar für die Projektleitung)');
  ok(frei.indexOf('Boiler-Service Meier') >= 0, '… mit dem Termin-Namen (stTerminName-Auflösung)');
  ok(frei.indexOf('📝R-') >= 0, 'Tages-Zeile verweist auf den erstellten Regierapport (📝R-…)');
  ok(errs.length === 0, 'Keine JS-Fehler in der Freigabe-Ansicht');
  await ctx.close();
}

console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
