// Termine → Zeiterfassung (User-Entscheide 26.07.2026)
// Deckt ab:
//  A) Geplanter Termin erscheint als VORSCHLAG mit seiner Planzeit —
//     ohne Bestätigungsklick. «Stimmt die Zeit, gibt er einfach den Tag frei»
//     → beim Freigeben werden die Planzeiten zu echten Zeiteinträgen.
//  B) Zeit anpassen (Planzeit vorbelegt, Monteur korrigiert die Abweichung)
//  C) «Nicht stattgefunden» — drei Szenarien:
//       1. Projektleitung löscht den Termin vorher → gar nicht erst in der
//          Zeiterfassung, nichts zu tun
//       2. Termin bleibt, Monteur war nie dort → 0 h, keine Foto-/Material-
//          Pflicht
//       3. Monteur war vor Ort (kein Zugang) → Zeit ganz normal erfassen UND
//          Termin als nicht stattgefunden markieren, in BELIEBIGER Reihenfolge
//  D) Ganztags-Termin: Standard-Arbeitszeit als Planzeit (Tagessoll INKL.
//     Vorholzeit); Gate greift nur ohne konfiguriertes Tagessoll
//  E) Rück-Meldung an den Termine-Kalender: ev.ist mit Ist-Zeiten + Stand
//     (erfasst → freigegeben → ausgefallen) inkl. Anzeige im Modul
//  F) Entsperren durch Projektleitung/Firmen-Admin; Monteur kann erneut
//     anpassen und freigeben; Monteur selbst darf NICHT entsperren
//
// Ausführen: CHROME=<chromium> node scripts/termin_zeiterfassung_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };
const HEUTE = new Date().toISOString().slice(0, 10);

// Zwei Termine am selben Tag: einer mit Uhrzeit (Vorschlag), einer ohne (Gate)
const EINSAETZE = [
  { id: 'ev_a', orgId: 'org_test', typ: 'auftrag', titel: 'Boiler-Service Meier', auftragNr: 'AU-2026-004',
    objektId: 'obj1', objektName: 'MFH Musterstrasse', kunde: 'Meier AG',
    monteurUserId: 'u_test', monteurName: 'Test User', datum: HEUTE, dauerTage: 1, slot: 'ganz',
    zeitVon: '07:00', zeitBis: '12:00', erstelltVon: { userId: 'u_pl', name: 'Planer' } },
  { id: 'ev_b', orgId: 'org_test', typ: 'frei', titel: 'Nachkontrolle Huber',
    objektId: 'obj2', objektName: 'EFH Huber',
    monteurUserId: 'u_test', monteurName: 'Test User', datum: HEUTE, dauerTage: 1, slot: 'ganz',
    zeitVon: '', zeitBis: '', erstelltVon: { userId: 'u_pl', name: 'Planer' } }
];
const OBJEKTE = { objekte: [{ id: 'obj1', name: 'MFH Musterstrasse', orgId: 'org_test' }, { id: 'obj2', name: 'EFH Huber', orgId: 'org_test' }], beteiligte: [], activeObjektId: null };

function ls(extra) {
  return Object.assign(seed(['role_monteur']), {
    gema_einsatz_pool_v1: EINSAETZE,
    gema_objekte_v1: OBJEKTE,
    gema_coachmarks_done_pm_stunden: '1',
    gema_coachmarks_done_pm_einsatzplan: '1'
  }, extra || {});
}
// Der Harness mockt Supabase mit einer leeren Antwort; bindCollection
// überschreibt damit die geseedeten Pools. Nach dem Pull werden sie wieder
// gesetzt (getCached liest localStorage zuerst) — das entspricht dem echten
// Zustand, in dem die Termine aus der Cloud kommen.
async function poolsSetzen(page, extra) {
  await page.evaluate((d) => {
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(d.ev));
    if (d.tage) localStorage.setItem('gema_std_pool_v1', JSON.stringify(d.tage));
    try { stRender(); } catch (e) {}
  }, extra);
  await page.waitForTimeout(250);
}
async function stundenSeite(browser, seedObj) {
  const { ctx, page } = await newPage(browser, seedObj);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof stRender === 'function' && typeof stTermineOffen === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);   // Cloud-Pull abwarten
  await poolsSetzen(page, { ev: EINSAETZE, tage: seedObj.gema_std_pool_v1 || null });
  return { ctx, page, errs };
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* ════════ A · Vorschlag ohne Bestätigungsklick ════════ */
console.log('■ A · Geplanter Termin als Vorschlag (kein Extra-Klick)');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls());
  const st = await page.evaluate((d) => ({
    offen: stTermineOffen(d).map(e => e.id).sort(),
    ohneZeit: stTermineOffen(d, true).map(e => e.id),
    planA: stTerminPlanStd(stEinsatzById('ev_a')),
    planB: stTerminPlanStd(stEinsatzById('ev_b')),
    vorschau: stTerminVorschauStd(d),
    pzB: stTerminPlanzeit(stEinsatzById('ev_b')),
    tagSoll: stdTagSollH(stParamsFor('u_test')),
    tagVon: stTagVonHm(),
    zustandA: stTerminZustand(stTagFor(d, 'u_test'), stEinsatzById('ev_a')).typ
  }), HEUTE);
  ok(JSON.stringify(st.offen) === JSON.stringify(['ev_a', 'ev_b']), 'beide Termine gelten als offen');
  ok(st.planA === 5, 'fixe Planzeit 07:00–12:00 = 5 h');
  // Ganztags → Standard-Arbeitszeit, Dauer = Tagessoll inkl. Vorholzeit
  ok(Math.abs(st.planB - st.tagSoll) < 0.01, 'Ganztags-Termin: Planzeit = Tagessoll inkl. Vorholzeit (' + st.planB + ' h)');
  ok(st.pzB && st.pzB.quelle === 'standard' && st.pzB.von === st.tagVon, 'Vorschlag beginnt zur Standard-Arbeitszeit (' + (st.pzB && st.pzB.von) + ')');
  ok(st.ohneZeit.length === 0, 'kein Termin bleibt ohne Planzeit');
  ok(Math.abs(st.vorschau - (5 + st.tagSoll)) < 0.01, 'Tages-Vorschau zählt beide Planzeiten');
  ok(st.zustandA === 'offen', 'Zustand «offen», solange nichts erfasst ist');

  // Tagesansicht zeigt Vorschlag + Hinweis statt Bestätigungsknopf
  await page.evaluate(d => { _tagDatum = d; _wkMode = 'tag'; stRender(); }, HEUTE);
  await page.waitForTimeout(300);
  const ui = await page.evaluate(() => {
    const b = document.body.innerText;
    return {
      hinweis: b.indexOf('wird beim Freigeben übernommen') >= 0,
      geplantPill: (document.body.innerHTML.match(/>geplant</g) || []).length,
      anpassen: b.indexOf('Zeit anpassen') >= 0,
      ausfall: b.indexOf('Nicht stattgefunden') >= 0,
      keinBestaetigen: b.indexOf('Zeiten stimmen') < 0,
      freigabeKnopf: b.indexOf('Tag freigeben') >= 0,
      vorschauZeile: b.indexOf('geplanten Termin') >= 0
    };
  });
  ok(ui.hinweis, 'Hinweis «wird beim Freigeben übernommen»');
  ok(ui.geplantPill >= 1, 'Vorschlags-Zeile mit «geplant»-Pill in der Tages-Karte');
  ok(ui.anpassen && ui.ausfall, 'Aktionen «Zeit anpassen» + «Nicht stattgefunden»');
  ok(ui.keinBestaetigen, 'KEIN Bestätigungsknopf (User-Entscheid)');
  ok(ui.freigabeKnopf, '«Tag freigeben» erscheint, obwohl noch kein Eintrag existiert');
  ok(ui.vorschauZeile, 'Wochenbilanz weist die geplanten Stunden aus');
  ok(errs.length === 0, 'keine pageerrors (A)');
  await ctx.close();
}

/* ════════ D · Ganztags-Vorschlag + Gate als Sicherheitsnetz ════════ */
console.log('■ D · Ganztags-Termin bekommt die Standard-Arbeitszeit');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls());
  // Beide Termine haben eine Planzeit → Freigabe läuft ohne Zeit-Gate durch
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(400);
  const titel = await page.evaluate(() => (document.querySelector('.gema-dlg-title') || {}).textContent || '');
  ok(!/Zeit fehlt/.test(titel), 'kein «Zeit fehlt»-Gate — der Ganztags-Termin hat eine Planzeit');
  const uebernommen = await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    const b = (t.eintraege || []).find(x => x.einsatzId === 'ev_b');
    return { n: (t.eintraege || []).length, vonB: b && b.von, ausPlanB: b && b.ausPlan === true };
  }, HEUTE);
  ok(uebernommen.n === 2, 'beide Termine wurden als Einträge übernommen');
  ok(uebernommen.ausPlanB && uebernommen.vonB === (await page.evaluate(() => stTagVonHm())), 'Ganztags-Eintrag startet zur Standard-Arbeitszeit');
  await page.click('[data-act="cancel"]');
  ok(errs.length === 0, 'keine pageerrors (D)');
  await ctx.close();
}

/* ════════ D2 · Sicherheitsnetz ohne konfiguriertes Tagessoll ════════ */
console.log('■ D2 · Ohne Tagessoll greift das Zeit-Gate weiter');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls());
  await page.evaluate(() => {
    // Wochensoll auf 0 → kein ableitbarer Ganztags-Vorschlag mehr
    const org = GemaAuth.getCurrentOrg();
    org.settings = org.settings || {};
    org.settings.stunden = Object.assign({}, org.settings.stunden, { wochenSoll: 0, vorholProWocheH: 0 });
    const orgs = GemaAuth.getOrgs().map(o => o.id === org.id ? org : o);
    localStorage.setItem('gema_orgs_v1', JSON.stringify(orgs));
    stRender();
  });
  await page.waitForTimeout(250);
  ok(await page.evaluate(d => stTermineOffen(d, true).map(e => e.id).indexOf('ev_b') >= 0, HEUTE), 'Ganztags-Termin gilt ohne Tagessoll als «ohne Zeit»');
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => ({
    titel: (document.querySelector('.gema-dlg-title') || {}).textContent || '',
    txt: (document.querySelector('.gema-dlg-msg') || {}).textContent || ''
  }));
  ok(/Zeit fehlt/.test(dlg.titel), 'Dialog «Zeit fehlt» als Sicherheitsnetz');
  ok(dlg.txt.indexOf('Nachkontrolle Huber') >= 0, 'Dialog nennt den betroffenen Termin');
  ok(await page.evaluate(d => { const t = stTagFor(d, 'u_test'); return !t || t.status !== 'eingereicht'; }, HEUTE), 'Tag wurde NICHT freigegeben');
  await page.click('[data-act="cancel"]');
  ok(errs.length === 0, 'keine pageerrors (D2)');
  await ctx.close();
}

/* ════════ C · Nicht stattgefunden: 0 h, keine Foto-/Materialpflicht ════════ */
console.log('■ C · «Nicht stattgefunden» — keine Rückfrage, keine Pflichten');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls());
  // Foto-Pflicht-Bereich einrichten und ev_b zuordnen
  await page.evaluate(() => {
    const org = GemaAuth.getCurrentOrg();
    org.settings = org.settings || {};
    org.settings.arbeitsbereiche = [{ id: 'ab_srv', name: 'Service', farbe: '#16a34a', fotoPflicht: true }];
    localStorage.setItem('gema_orgs_v1', JSON.stringify(GemaAuth.getOrgs().map(o => o.id === org.id ? org : o)));
    const pool = JSON.parse(localStorage.getItem('gema_einsatz_pool_v1'));
    pool.forEach(e => { e.bereichId = 'ab_srv'; });
    localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(pool));
    stRender();
  });
  await page.waitForTimeout(250);
  ok(await page.evaluate(d => stFotoTermine(d).length === 2, HEUTE), 'beide Termine unterliegen der Foto-Pflicht');

  await page.evaluate(d => stTerminAusfall(d, 'ev_b'), HEUTE);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !!document.querySelector('.gema-dlg-input')), 'Begründung wird abgefragt');
  // Leerer Grund wird abgewiesen
  await page.evaluate(() => { document.querySelector('.gema-dlg-input').value = ''; });
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(250);
  ok(await page.evaluate(d => { const t = stTagFor(d, 'u_test'); return !t || !t.terminStatus || !t.terminStatus.ev_b; }, HEUTE), 'ohne Begründung kein Ausfall-Vermerk');

  await page.evaluate(d => stTerminAusfall(d, 'ev_b'), HEUTE);
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('.gema-dlg-input').value = 'Kunde nicht angetroffen'; });
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(450);
  ok(await page.evaluate(() => !document.querySelector('.gema-dlg-title')), 'KEINE Rückfrage «Zeit trotzdem erfassen?» mehr');

  const nachAusfall = await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(x => x.id === 'ev_b');
    return {
      vermerk: t && t.terminStatus && t.terminStatus.ev_b ? t.terminStatus.ev_b.grund : '',
      zustand: stTerminZustand(t, stEinsatzById('ev_b')).typ,
      std: stTerminZustand(t, stEinsatzById('ev_b')).stunden,
      offen: stTermineOffen(d).map(e => e.id),
      fotoPflicht: stFotoTermine(d).map(e => e.id),
      fotoFehlt: stFotoFehlt(d, t).map(e => e.id),
      istStatus: ev && ev.ist ? ev.ist.status : '',
      istGrund: ev && ev.ist ? ev.ist.grund : ''
    };
  }, HEUTE);
  ok(nachAusfall.vermerk === 'Kunde nicht angetroffen', 'Begründung am Tag gespeichert');
  ok(nachAusfall.zustand === 'ausgefallen' && nachAusfall.std === 0, 'Zustand «ausgefallen» mit 0 h');
  ok(JSON.stringify(nachAusfall.offen) === JSON.stringify(['ev_a']), 'ausgefallener Termin blockiert die Freigabe nicht mehr');
  ok(JSON.stringify(nachAusfall.fotoPflicht) === JSON.stringify(['ev_a']), 'Foto-Pflicht entfällt für den ausgefallenen Termin');
  ok(nachAusfall.fotoFehlt.indexOf('ev_b') < 0, 'ausgefallener Termin fehlt nicht in der Foto-Prüfung');
  ok(nachAusfall.istStatus === 'ausgefallen' && nachAusfall.istGrund === 'Kunde nicht angetroffen', 'Rück-Meldung an den Termin (ausgefallen + Grund)');

  // Szenario 3a: Ausfall zuerst, danach die tatsächliche Zeit erfassen —
  // ohne separate «Anfahrt»-Erfassung, ohne Material-Pflicht
  await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    t.eintraege.push({ id: 'e_zeit', von: '07:00', bis: '07:30', pauseMin: 0, objektId: 'obj2', objektName: 'EFH Huber', taetigkeit: '', einsatzId: 'ev_b' });
    poolSave(t); stEinsatzIstSync('ev_b', d);
    _tagDatum = d; _wkMode = 'tag'; stRender();
  }, HEUTE);
  await page.waitForTimeout(300);
  const mitZeit = await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    const z = stTerminZustand(t, stEinsatzById('ev_b'));
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(x => x.id === 'ev_b');
    return { typ: z.typ, std: z.stunden, ist: ev && ev.ist ? ev.ist.stunden : -1,
             matFehlt: stMatFehlt(t).map(e => e.id), fotoFehlt: stFotoFehlt(d, t).map(e => e.id),
             txt: document.body.innerText };
  }, HEUTE);
  ok(mitZeit.typ === 'ausgefallen' && mitZeit.std === 0.5, 'Ausfall bleibt, 0.5 h erfasst (Szenario 3)');
  ok(mitZeit.ist === 0.5, 'die erfasste Zeit fliesst an den Termin zurück');
  ok(mitZeit.matFehlt.indexOf('e_zeit') < 0, 'keine Material-Pflicht für die Zeit eines ausgefallenen Termins');
  ok(mitZeit.fotoFehlt.indexOf('ev_b') < 0, 'keine Foto-Pflicht für den ausgefallenen Termin');
  ok(mitZeit.txt.indexOf('0.50 h erfasst') >= 0, 'Tagesansicht zeigt Ausfall UND erfasste Zeit');
  ok(mitZeit.txt.indexOf('Anfahrt —') < 0, 'keine aufgezwungene «Anfahrt»-Tätigkeit');
  ok(errs.length === 0, 'keine pageerrors (C)');
  await ctx.close();
}

/* ════════ C2 · Szenario 3 in der anderen Reihenfolge ════════ */
console.log('■ C2 · Erst Zeit erfassen, dann «nicht stattgefunden»');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls());
  // Zeit für ev_a erfassen (Monteur war vor Ort)
  await page.evaluate(d => {
    let t = stTagFor(d, 'u_test');
    if (!t) t = { id: 'tZ', orgId: 'org_test', userId: 'u_test', userName: 'Test User', datum: d, eintraege: [], spesen: {}, status: 'offen' };
    t.eintraege.push({ id: 'e_vorort', von: '07:00', bis: '07:30', pauseMin: 0, objektId: 'obj1', objektName: 'MFH Musterstrasse', taetigkeit: 'Zugang fehlte', einsatzId: 'ev_a' });
    poolSave(t);
    _tagDatum = d; _wkMode = 'tag'; stRender();
  }, HEUTE);
  await page.waitForTimeout(300);
  const vorher = await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    return { typ: stTerminZustand(t, stEinsatzById('ev_a')).typ, txt: document.body.innerText };
  }, HEUTE);
  ok(vorher.typ === 'erfasst', 'Termin gilt zunächst als erfasst');
  ok(vorher.txt.indexOf('Nicht stattgefunden') >= 0, 'Ausfall-Knopf bleibt auch bei erfasster Zeit sichtbar');

  // Jetzt nachträglich als nicht stattgefunden markieren
  await page.evaluate(d => stTerminAusfall(d, 'ev_a'), HEUTE);
  await page.waitForTimeout(300);
  const hinweis = await page.evaluate(() => (document.querySelector('.gema-dlg-msg') || {}).textContent || '');
  ok(/0\.50 h bleiben bestehen/.test(hinweis), 'Dialog sichert die bereits erfasste Zeit zu');
  await page.evaluate(() => { document.querySelector('.gema-dlg-input').value = 'Kein Zugang zur Wohnung'; });
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(400);
  const nachher = await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    const z = stTerminZustand(t, stEinsatzById('ev_a'));
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(x => x.id === 'ev_a');
    return { typ: z.typ, std: z.stunden, grund: z.grund, ist: ev && ev.ist ? ev.ist.status : '',
             istStd: ev && ev.ist ? ev.ist.stunden : -1, matFehlt: stMatFehlt(t).map(e => e.id) };
  }, HEUTE);
  ok(nachher.typ === 'ausgefallen' && nachher.grund === 'Kein Zugang zur Wohnung', 'nachträglicher Ausfall-Vermerk');
  ok(nachher.std === 0.5, 'die erfasste Zeit bleibt erhalten');
  ok(nachher.ist === 'ausgefallen' && nachher.istStd === 0.5, 'Termin meldet Ausfall MIT der erfassten Zeit zurück');
  ok(nachher.matFehlt.indexOf('e_vorort') < 0, 'Material-Pflicht entfällt rückwirkend');
  ok(errs.length === 0, 'keine pageerrors (C2)');
  await ctx.close();
}

/* ════════ C3 · Szenario 1: Termin gelöscht → nichts zu tun ════════ */
console.log('■ C3 · Von der Planung gelöschter Termin taucht nicht auf');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls());
  await poolsSetzen(page, { ev: [EINSAETZE[0]] });   // ev_b von der Planung entfernt
  const st = await page.evaluate(d => ({
    offen: stTermineOffen(d).map(e => e.id),
    fotoPflicht: stFotoTermine(d).map(e => e.id)
  }), HEUTE);
  ok(JSON.stringify(st.offen) === JSON.stringify(['ev_a']), 'gelöschter Termin ist gar nicht erst in der Zeiterfassung');
  ok(st.fotoPflicht.indexOf('ev_b') < 0, 'keine Foto-Pflicht für einen gelöschten Termin');
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => /Zeit fehlt/.test((document.querySelector('.gema-dlg-title') || {}).textContent || ''))), 'Freigabe wird davon nicht blockiert');
  await page.click('[data-act="cancel"]');
  ok(errs.length === 0, 'keine pageerrors (C3)');
  await ctx.close();
}

/* ════════ A2/B/E · Freigabe übernimmt Planzeiten + Rück-Sync ════════ */
console.log('■ A2/B/E · Freigeben übernimmt die Planzeit, Rück-Meldung an den Termin');
{
  const { ctx, page, errs } = await stundenSeite(browser, ls());
  // ev_b als ausgefallen wegräumen, damit nur ev_a offen bleibt
  await page.evaluate(d => {
    let t = stTagFor(d, 'u_test');
    if (!t) { t = { id: 'tX', orgId: 'org_test', userId: 'u_test', userName: 'Test User', datum: d, eintraege: [], spesen: {}, status: 'offen' }; }
    t.terminStatus = { ev_b: { ausfall: true, grund: 'verschoben', ts: new Date().toISOString(), von: 'Test User' } };
    poolSave(t);
  }, HEUTE);
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(400);
  // Material-Gate greift für den materialisierten Eintrag (Projekt gesetzt)
  let dlgTitel = await page.evaluate(() => (document.querySelector('.gema-dlg-title') || {}).textContent || '');
  ok(/Material-Frage offen/.test(dlgTitel), 'Material-Frage greift auch für übernommene Termine (Flow bleibt)');
  const nachMat = await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    const e = (t.eintraege || []).find(x => x.einsatzId === 'ev_a');
    return { n: (t.eintraege || []).length, von: e && e.von, bis: e && e.bis, ausPlan: e && e.ausPlan === true, obj: e && e.objektId, taet: e && e.taetigkeit };
  }, HEUTE);
  ok(nachMat.n === 1 && nachMat.von === '07:00' && nachMat.bis === '12:00', 'Planzeit wurde als echter Eintrag übernommen');
  ok(nachMat.ausPlan, 'Eintrag ist als «aus Planung» markiert');
  ok(nachMat.obj === 'obj1' && /Boiler-Service/.test(nachMat.taet || ''), 'Projekt + Tätigkeit aus dem Termin übernommen');
  await page.click('[data-act="cancel"]');
  await page.waitForTimeout(200);

  // Material beantworten (kein Material) und erneut freigeben
  await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    t.eintraege.forEach(e => { e.materialAntwort = 'kein'; });
    poolSave(t);
  }, HEUTE);
  await page.evaluate(d => stTagEinreichen(d), HEUTE);
  await page.waitForTimeout(400);
  dlgTitel = await page.evaluate(() => (document.querySelector('.gema-dlg-title') || {}).textContent || '');
  ok(dlgTitel === 'Tag freigeben', 'zweiter Anlauf erreicht den Freigabe-Dialog');
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(500);
  const nachFrei = await page.evaluate(d => {
    const t = stTagFor(d, 'u_test');
    const pool = GemaSync.getCached('gema_einsatz_pool_v1') || [];
    const a = pool.find(x => x.id === 'ev_a'), b = pool.find(x => x.id === 'ev_b');
    return {
      status: t.status,
      editable: stTagEditable(t),
      istA: a && a.ist ? { s: a.ist.status, h: a.ist.stunden, von: a.ist.von, bis: a.ist.bis } : null,
      istB: b && b.ist ? b.ist.status : ''
    };
  }, HEUTE);
  ok(nachFrei.status === 'eingereicht', 'Tag ist freigegeben');
  ok(!nachFrei.editable, 'Tag ist für den Monteur gesperrt');
  ok(nachFrei.istA && nachFrei.istA.s === 'freigegeben' && nachFrei.istA.h === 5, 'Termin meldet «freigegeben» mit 5 h zurück');
  ok(nachFrei.istA && nachFrei.istA.von === '07:00' && nachFrei.istA.bis === '12:00', 'Ist-Zeiten am Termin');
  ok(nachFrei.istB === 'ausgefallen', 'ausgefallener Termin behält seinen Stand');

  // Gesperrt: Anpassen wird abgewiesen
  await page.evaluate(d => stTerminZeit(d, 'ev_a'), HEUTE);
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.querySelector('#einModal.open')), 'gesperrter Tag lässt keine Änderung zu');
  ok(errs.length === 0, 'keine pageerrors (A2/B/E)');
  await ctx.close();
}

/* ════════ E2 · Anzeige im Termine-Modul ════════ */
console.log('■ E2 · Ist-Zeiten im Termine-Kalender sichtbar');
{
  const evs = JSON.parse(JSON.stringify(EINSAETZE));
  evs[0].ist = { status: 'freigegeben', stunden: 6.5, von: '07:00', bis: '13:30', datum: HEUTE, am: new Date().toISOString(), vonName: 'Test User' };
  evs[1].ist = { status: 'ausgefallen', stunden: 0.75, grund: 'Kunde nicht angetroffen', datum: HEUTE, am: new Date().toISOString(), vonName: 'Test User' };
  const s = Object.assign(seed(['role_planer']), { gema_einsatz_pool_v1: evs, gema_objekte_v1: OBJEKTE, gema_coachmarks_done_pm_einsatzplan: '1' });
  const { ctx, page } = await newPage(browser, s);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epIstZeile === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  await page.evaluate(e => { localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(e)); try { epRender(); } catch (x) {} }, evs);
  await page.waitForTimeout(300);
  const z = await page.evaluate(() => {
    const pool = GemaSync.getCached('gema_einsatz_pool_v1') || [];
    const a = pool.find(x => x.id === 'ev_a'), b = pool.find(x => x.id === 'ev_b');
    const tmp = document.createElement('div'); tmp.innerHTML = epIstZeile(a);
    const tmp2 = document.createElement('div'); tmp2.innerHTML = epIstZeile(b);
    return { a: tmp.textContent, b: tmp2.textContent, kurzA: epIstKurz(a), planA: epPlanStd(a) };
  });
  ok(/freigegeben/.test(z.a) && /6\.5 h/.test(z.a), 'Termin zeigt «freigegeben» mit Ist-Stunden');
  ok(/geplant 5 h/.test(z.a) && /\+1\.5 h/.test(z.a), 'Soll-Ist-Vergleich mit Abweichung (+1.5 h)');
  ok(/nicht stattgefunden/.test(z.b) && /Kunde nicht angetroffen/.test(z.b), 'ausgefallener Termin zeigt die Begründung');
  ok(/0\.75 h/.test(z.b), 'trotzdem erfasste Zeit wird ausgewiesen');
  ok(/✅/.test(z.kurzA) && /\+1\.5/.test(z.kurzA), 'Kurz-Chip für die Wochentafel');
  ok(z.planA === 5, 'geplante Dauer aus den Termin-Zeiten');
  ok(errs.length === 0, 'keine pageerrors (E2)');
  await ctx.close();
}

/* ════════ E3 · Monteur sieht KEINEN Soll-Ist-Vergleich ════════ */
console.log('■ E3 · Monteur-Sicht: nur der Stand, keine Zahlen');
{
  const evs = JSON.parse(JSON.stringify(EINSAETZE));
  evs[0].ist = { status: 'freigegeben', stunden: 6.5, von: '07:00', bis: '13:30', datum: HEUTE, am: new Date().toISOString(), vonName: 'Test User' };
  evs[1].ist = { status: 'ausgefallen', stunden: 0.75, grund: 'Kunde nicht angetroffen', datum: HEUTE, am: new Date().toISOString(), vonName: 'Test User' };
  const s = Object.assign(seed(['role_monteur']), { gema_einsatz_pool_v1: evs, gema_objekte_v1: OBJEKTE, gema_coachmarks_done_pm_einsatzplan: '1' });
  const { ctx, page } = await newPage(browser, s);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epIstZeile === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  await page.evaluate(e => { localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(e)); try { epRender(); } catch (x) {} }, evs);
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const pool = GemaSync.getCached('gema_einsatz_pool_v1') || [];
    const a = pool.find(x => x.id === 'ev_a'), b = pool.find(x => x.id === 'ev_b');
    const t1 = document.createElement('div'); t1.innerHTML = epIstZeile(a);
    const t2 = document.createElement('div'); t2.innerHTML = epIstZeile(b);
    return { darfZahlen: epIstZahlenSichtbar(), a: t1.textContent, b: t2.textContent, kurzA: epIstKurz(a), seite: document.body.innerText };
  });
  ok(!m.darfZahlen, 'Monteur ist nicht planungsberechtigt');
  ok(/freigegeben/.test(m.a), 'Monteur sieht den Stand «freigegeben»');
  ok(!/6\.5/.test(m.a) && !/geplant/.test(m.a) && !/\+1\.5/.test(m.a), 'KEINE Ist-Stunden und kein Soll-Ist-Vergleich');
  ok(/nicht stattgefunden/.test(m.b) && !/0\.75/.test(m.b), 'ausgefallener Termin ohne Stundenangabe');
  ok(!/\+1\.5/.test(m.kurzA) && /✅/.test(m.kurzA), 'Kurz-Chip ohne Abweichung');
  ok(!/6\.5 h/.test(m.seite), 'auf der ganzen Seite keine Ist-Stunden für den Monteur');
  ok(errs.length === 0, 'keine pageerrors (E3)');
  await ctx.close();
}

/* ════════ F · Entsperren ════════ */
console.log('■ F · Entsperren durch Projektleitung / Firmen-Admin');
{
  const TAG_FREI = [{
    id: 'tagF', orgId: 'org_test', userId: 'u_test', userName: 'Test User', datum: HEUTE,
    status: 'eingereicht', eingereichtAm: new Date().toISOString(), spesen: {},
    eintraege: [{ id: 'eF', von: '07:00', bis: '12:00', pauseMin: 0, objektId: 'obj1', objektName: 'MFH Musterstrasse', taetigkeit: 'Boiler-Service Meier', einsatzId: 'ev_a', ausPlan: true, materialAntwort: 'kein' }]
  }];
  // Monteur darf NICHT entsperren (bewusst OHNE Firmen-Admin-Rechte —
  // ein Org-Admin dürfte es laut Entscheid sehr wohl)
  {
    const nurMonteur = Object.assign(seed(['role_monteur'], { orgAdmins: ['u_chef'] }), {
      gema_einsatz_pool_v1: EINSAETZE, gema_objekte_v1: OBJEKTE,
      gema_std_pool_v1: TAG_FREI, gema_coachmarks_done_pm_stunden: '1'
    });
    const { ctx, page } = await stundenSeite(browser, nurMonteur);
    const darf = await page.evaluate(() => stCanUnlock());
    ok(!darf, 'Monteur kann nicht entsperren');
    const gesperrt = await page.evaluate(d => stTagEditable(stTagFor(d, 'u_test')), HEUTE);
    ok(!gesperrt, 'Tag ist für den Monteur gesperrt');
    await ctx.close();
  }
  // Projektleitung entsperrt
  const s = Object.assign(seed(['role_planer']), {
    gema_einsatz_pool_v1: EINSAETZE, gema_objekte_v1: OBJEKTE,
    gema_std_pool_v1: TAG_FREI, gema_coachmarks_done_pm_stunden: '1'
  });
  const { ctx, page } = await newPage(browser, s);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof stWocheEntsperren === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(900);
  await poolsSetzen(page, { ev: EINSAETZE, tage: TAG_FREI });
  ok(await page.evaluate(() => stCanUnlock()), 'Projektleitung darf entsperren');
  await page.evaluate(() => { _view = 'freigabe'; stRender(); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.body.innerText.indexOf('Entsperren') >= 0), '«🔓 Entsperren» im Freigabe-Tab');
  const key = await page.evaluate(d => 'u_test|' + stdWochenStart(d), HEUTE);
  await page.evaluate(k => stWocheEntsperren(k), key);
  await page.waitForTimeout(350);
  await page.click('[data-act="ok"]');
  await page.waitForTimeout(500);
  const nach = await page.evaluate(d => {
    const t = (GemaSync.getCached('gema_std_pool_v1') || []).find(x => x.datum === d && x.userId === 'u_test');
    const ev = (GemaSync.getCached('gema_einsatz_pool_v1') || []).find(x => x.id === 'ev_a');
    const n = (GemaNotify.getForCurrentUser({ includeDisabled: true }) || []);
    return { status: t && t.status, entsperrt: !!(t && t.entsperrt), ist: ev && ev.ist ? ev.ist.status : '', notif: JSON.stringify(n).indexOf('wieder geöffnet') >= 0 };
  }, HEUTE);
  ok(nach.status === 'offen', 'Tag ist wieder offen');
  ok(nach.entsperrt, 'Entsperr-Vermerk am Tag (Nachvollziehbarkeit)');
  ok(nach.ist === 'erfasst', 'Termin fällt von «freigegeben» auf «erfasst» zurück');
  ok(nach.notif, 'Monteur wird benachrichtigt');
  ok(errs.length === 0, 'keine pageerrors (F)');
  await ctx.close();

  // Monteur kann jetzt wieder ändern und erneut freigeben
  const nurA = [EINSAETZE[0]];
  const m = await stundenSeite(browser, ls({ gema_std_pool_v1: (await (async () => {
    const t = JSON.parse(JSON.stringify(TAG_FREI));
    t[0].status = 'offen'; delete t[0].entscheid; t[0].entsperrt = { von: 'Planer', userId: 'u_pl', am: new Date().toISOString() };
    return t;
  })()) }));
  await poolsSetzen(m.page, { ev: nurA });
  ok(await m.page.evaluate(d => stTagEditable(stTagFor(d, 'u_test')), HEUTE), 'Monteur kann den Tag wieder bearbeiten');
  await m.page.evaluate(d => stTagEinreichen(d), HEUTE);
  await m.page.waitForTimeout(400);
  const t2 = await m.page.evaluate(() => (document.querySelector('.gema-dlg-title') || {}).textContent || '');
  ok(t2 === 'Tag freigeben', 'erneutes Freigeben möglich');
  await m.page.click('[data-act="ok"]');
  await m.page.waitForTimeout(400);
  ok(await m.page.evaluate(d => stTagFor(d, 'u_test').status === 'eingereicht', HEUTE), 'Tag ist erneut freigegeben');
  ok(m.errs.length === 0, 'keine pageerrors (F2)');
  await m.ctx.close();
}

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
