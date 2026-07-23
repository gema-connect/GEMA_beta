// Playwright-Smoke: Einsatzplan — Stunden-Tafel (Feedback 19.07.2026)
//   - Wochen-Plantafel im Stundenraster, Zeit läuft von links nach rechts
//     (Timeline pro Person×Tag, Events absolut positioniert, Spuren-Stapelung)
//   - Jetzt-Linie (aktuelle Zeit) am heutigen Tag + Stunden-Ticks im Kopf
//   - Outlook-Muster: Zeit per Klicken–Halten–Ziehen direkt im Kalender
//     aufziehen → Dialog öffnet mit der gewählten Zeit (Auftrag zuweisen)
//   - Auftrags-Pool rechts: nur NICHT eingeplante Aufträge, Abteilungs-Filter
//     (Arbeitsbereiche) pro Gerät gespeichert; Drag&Drop setzt die Startstunde
//   - «Freier Termin» ohne Auftrag/Objekt; Zeitfelder im Dialog sobald Zeiten da
// Ausführen: CHROME=<chromium> node scripts/einsatzplan_stundenplan_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof epRender === 'function' && typeof epEvHours === 'function' && typeof epTlDown === 'function', null, { timeout: 12000 });
await page.waitForTimeout(500);

// Setup: Test-User planbar, Wochenende sichtbar (heutiger Tag in der Tafel), Bereiche
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const org = GemaAuth.getOrgs()[0];
  const st = org.settings || {};
  st.einsatzplan = Object.assign({}, st.einsatzplan, { userIds: [u.id], wochenende: true });
  st.arbeitsbereiche = [{ id: 'ab_san', name: 'Sanitär', farbe: '#16a34a' }, { id: 'ab_hei', name: 'Heizung', farbe: '#dc2626' }];
  GemaAuth.updateOrgSettings(org.id, st);
  _anker = '2026-07-13';
  epRender();
});

console.log('■ Stunden-Helfer (Engine)');
ok(await page.evaluate(() => epHmToH('07:30') === 7.5 && epHmToH('06:00') === 6 && epHmToH('x') === null), 'epHmToH: «07:30» → 7.5');
ok(await page.evaluate(() => epHToHm(7.5) === '07:30' && epHToHm(6) === '06:00' && epHToHm(13) === '13:00'), 'epHToHm: 7.5 → «07:30»');
ok(await page.evaluate(() => {
  const s = { tagVon: 6, tagBis: 18 };
  const ganz = epEvHours({ slot: 'ganz' }, s), vm = epEvHours({ slot: 'vm' }, s), nm = epEvHours({ slot: 'nm' }, s);
  return ganz.von === 6 && ganz.bis === 18 && vm.von === 6 && vm.bis === 12 && nm.von === 12 && nm.bis === 18;
}), 'epEvHours: Slot-Altdaten → Ganztag/VM/NM-Fenster');
ok(await page.evaluate(() => {
  const s = { tagVon: 6, tagBis: 18 };
  const z = epEvHours({ zeitVon: '08:00', zeitBis: '12:00' }, s);
  return z.von === 8 && z.bis === 12;
}), 'epEvHours: Zeiten 08–12 exakt übernommen');
ok(await page.evaluate(() => { const s = epSettings(); return s.raster === 'zeit' && s.tagVon === 6 && s.tagBis === 18; }), 'Defaults: Raster «zeit», Arbeitszeit 06–18');

console.log('■ Wochen-Tafel: Timeline links→rechts, Positionen, Spuren, Jetzt-Linie');
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const mk = (id, datum, von, bis, titel) => ({ id, orgId: u.orgId, typ: 'auftrag', titel, monteurUserId: u.id, monteurName: u.name, datum, dauerTage: 1, slot: 'ganz', zeitVon: von, zeitBis: bis, auftragId: '', auftragNr: '', kunde: '', objektId: '', objektName: '', notiz: '', bereichId: '', garantie: false, besonderheiten: [], erstelltVon: { userId: u.id, name: u.name } });
  localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify([
    mk('tl1', '2026-07-14', '08:00', '12:00', 'Steigzone'),
    mk('tl2', '2026-07-14', '10:00', '14:00', 'Boiler')
  ]));
  epRender();
});
ok(await page.evaluate(() => document.querySelectorAll('.tl').length >= 7), 'Timeline-Zellen (.tl) für jeden Tag gerendert');
ok(await page.evaluate(() => { const tl = document.querySelector('.tl'); return tl && tl.style.getPropertyValue('--hn') === '12'; }), 'Stundenraster: 12 Stunden-Spalten (06–18)');
ok(await page.evaluate(() => {
  const t = [...document.querySelectorAll('.th-scale')][0];
  return t && t.textContent.indexOf('06') >= 0 && t.textContent.indexOf('09') >= 0 && t.textContent.indexOf('12') >= 0 && t.textContent.indexOf('15') >= 0;
}), 'Tageskopf mit Stunden-Ticks 06/09/12/15');
{
  const r = await page.evaluate(() => {
    const el = document.querySelector('.tl-ev[data-ev="tl1"]');
    return el ? { left: parseFloat(el.style.left), width: parseFloat(el.style.width), titel: el.textContent } : null;
  });
  ok(r && Math.abs(r.left - 16.67) < 0.5 && Math.abs(r.width - 33.33) < 0.5, '08–12-Einsatz sitzt bei 16.7% Breite 33.3% (Zeit → Position)');
  ok(r && /08:00–12:00/.test(r.titel), 'Karte zeigt die Zeit 08:00–12:00');
}
ok(await page.evaluate(() => {
  const a = document.querySelector('.tl-ev[data-ev="tl1"]'), b = document.querySelector('.tl-ev[data-ev="tl2"]');
  return a && b && a.style.top !== b.style.top;
}), 'Überlappende Einsätze stapeln in Spuren (verschiedene top-Werte)');
ok(await page.evaluate(() => {
  const a = document.querySelector('.tl-ev[data-ev="tl1"]');
  return a && a.classList.contains('konflikt');
}), 'Überlappung trägt die ⚠-Konflikt-Markierung');
ok(await page.evaluate(() => {
  // Linie erscheint nur, wenn die aktuelle Zeit im Arbeitsfenster liegt UND
  // der heutige Tag in der (hier auf KW 2026-07-13 verankerten) Woche sichtbar
  // ist — sonst wäre der Check datumsabhängig (Test-Drift nach dieser Woche).
  const f = epNowFrac(epSettings());
  const line = document.querySelector('.nowline');
  const mo = monday(_anker);
  const heuteSichtbar = today() >= mo && today() <= addD(mo, 6);
  return ((f != null && heuteSichtbar)) === (line != null);
}), 'Jetzt-Linie konsistent: sichtbar genau dann, wenn heute in der Woche liegt und die Zeit im Arbeitsfenster ist');

console.log('■ Outlook-Muster: Zeit im Kalender aufziehen → Dialog mit Zeit');
{
  // Montag-Zelle (erste Spalte — sicher im sichtbaren Bereich)
  const box = await page.evaluate(() => {
    const tl = document.querySelector('.tl[data-cell$="|2026-07-13"]');
    const r = tl.getBoundingClientRect();
    return { x: r.left, y: r.top + r.height / 2, w: r.width };
  });
  const x1 = box.x + box.w * (1.5 / 12);   // 07:30 → Stunde 7
  const x2 = box.x + box.w * (5.5 / 12);   // 11:30 → bis 12
  await page.mouse.move(x1, box.y);
  await page.mouse.down();
  await page.mouse.move(x1 + 8, box.y, { steps: 2 });
  ok(await page.evaluate(() => !!document.querySelector('.tl-selbox')), 'während des Ziehens: Auswahl-Box sichtbar');
  await page.mouse.move(x2, box.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('evModal').classList.contains('open')), 'Loslassen öffnet den Einsatz-Dialog');
  ok(await page.evaluate(() => document.getElementById('ev_von').value === '07:00' && document.getElementById('ev_bis').value === '12:00'), 'aufgezogene Zeit 07:00–12:00 vorbefüllt');
  ok(await page.evaluate(() => curEv.typ === 'auftrag' && curEv.datum === '2026-07-13'), 'Dialog: Typ Auftrag (Auftrag zuweisen), Datum aus der Zelle');
  ok(await page.evaluate(() => document.getElementById('evZeitWrap').style.display !== 'none'), 'Zeitfelder sichtbar');
  ok(await page.evaluate(() => !document.querySelector('.tl-selbox')), 'Auswahl-Box nach dem Loslassen abgeräumt');
  await page.evaluate(() => epEvClose());
}
{
  // Klick ohne Ziehen = 1-Stunden-Termin (Outlook-Klick)
  const box = await page.evaluate(() => {
    const tl = document.querySelector('.tl[data-cell$="|2026-07-13"]');
    const r = tl.getBoundingClientRect();
    return { x: r.left, y: r.top + r.height / 2, w: r.width };
  });
  await page.mouse.click(box.x + box.w * (3.5 / 12), box.y);   // 09:30 → Stunde 9
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => document.getElementById('evModal').classList.contains('open') && document.getElementById('ev_von').value === '09:00' && document.getElementById('ev_bis').value === '10:00'), 'Klick (ohne Ziehen) → 1-h-Termin 09:00–10:00');
  ok(await page.evaluate(() => {
    const n = document.querySelectorAll('.modal-bg.open').length;
    return n === 1;
  }), 'kein doppelter Dialog (nachlaufender Click unterdrückt)');
  await page.evaluate(() => epEvClose());
}

console.log('■ Auftrags-Pool rechts: nur Uneingeplante + Abteilungs-Filter (gespeichert)');
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const mk = (id, nr, titel, bereichId, ea) => ({ id, orgId: u.orgId, typ: 'auftrag', nr, titel, status: 'offen', positionen: [], kundeSnapshot: { firma: 'Muster AG' }, bereichId, erstelltAm: ea, erstelltVon: { userId: u.id, name: u.name } });
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([
    mk('auP1', 'AU-101', 'Bereits eingeplant', 'ab_san', '2026-07-01T08:00:00Z'),
    mk('auP2', 'AU-102', 'Sanitär offen', 'ab_san', '2026-07-05T08:00:00Z'),
    mk('auP3', 'AU-103', 'Heizung offen', 'ab_hei', '2026-07-06T08:00:00Z')
  ]));
  _epErpMemo = { t: 0, l: null };
  // auP1 einplanen → verschwindet aus dem Pool
  const pool = JSON.parse(localStorage.getItem('gema_einsatz_pool_v1'));
  pool.push({ id: 'evP1', orgId: u.orgId, typ: 'auftrag', auftragId: 'auP1', titel: 'Bereits eingeplant', monteurUserId: u.id, monteurName: u.name, datum: '2026-07-15', dauerTage: 1, slot: 'ganz', zeitVon: '07:00', zeitBis: '15:00', erstelltVon: {} });
  localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(pool));
  epRender();
});
ok(await page.evaluate(() => {
  const jobs = [...document.querySelectorAll('.job')].map(j => j.getAttribute('data-job'));
  return jobs.length === 2 && jobs.indexOf('auP1') < 0 && jobs.indexOf('auP2') >= 0 && jobs.indexOf('auP3') >= 0;
}), 'Pool zeigt nur die 2 uneingeplanten Aufträge');
ok(await page.evaluate(() => /1 Auftrag bereits eingeplant/.test(document.querySelector('.side').textContent)), 'Fusszeile: «✓ 1 Auftrag bereits eingeplant»');
ok(await page.evaluate(() => {
  const f = document.getElementById('epPoolFilter');
  return !!f && f.innerHTML.indexOf('Sanitär') >= 0 && f.innerHTML.indexOf('Heizung') >= 0;
}), 'Abteilungs-Filter (Arbeitsbereiche) vorhanden');
ok(await page.evaluate(() => {
  epPoolFilterSet('ab_hei');
  const jobs = [...document.querySelectorAll('.job')].map(j => j.getAttribute('data-job'));
  return jobs.length === 1 && jobs[0] === 'auP3' && localStorage.getItem('gema_ep_poolfilter_v1') === 'ab_hei';
}), 'Filter «Heizung»: nur passende Aufträge, in localStorage gespeichert');
// Persistenz über Reload (Pools nach dem Boot neu seeden — der gemockte
// leere Cloud-Pull würde sie sonst überschreiben; der Filter liegt separat)
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof epRender === 'function', null, { timeout: 12000 });
await page.waitForTimeout(700);
await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  // Org-Settings neu anwenden (der Init-Seed des Test-Harness setzt die Org bei jedem Load zurück)
  const org = GemaAuth.getOrgs()[0];
  const st = org.settings || {};
  st.einsatzplan = Object.assign({}, st.einsatzplan, { userIds: [u.id], wochenende: true });
  st.arbeitsbereiche = [{ id: 'ab_san', name: 'Sanitär', farbe: '#16a34a' }, { id: 'ab_hei', name: 'Heizung', farbe: '#dc2626' }];
  GemaAuth.updateOrgSettings(org.id, st);
  const mk = (id, nr, titel, bereichId, ea) => ({ id, orgId: u.orgId, typ: 'auftrag', nr, titel, status: 'offen', positionen: [], kundeSnapshot: { firma: 'Muster AG' }, bereichId, erstelltAm: ea, erstelltVon: { userId: u.id, name: u.name } });
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([
    mk('auP1', 'AU-101', 'Bereits eingeplant', 'ab_san', '2026-07-01T08:00:00Z'),
    mk('auP2', 'AU-102', 'Sanitär offen', 'ab_san', '2026-07-05T08:00:00Z'),
    mk('auP3', 'AU-103', 'Heizung offen', 'ab_hei', '2026-07-06T08:00:00Z')
  ]));
  localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify([
    { id: 'tl1', orgId: u.orgId, typ: 'auftrag', titel: 'Steigzone', monteurUserId: u.id, monteurName: u.name, datum: '2026-07-14', dauerTage: 1, slot: 'ganz', zeitVon: '08:00', zeitBis: '12:00', erstelltVon: {} },
    { id: 'evP1', orgId: u.orgId, typ: 'auftrag', auftragId: 'auP1', titel: 'Bereits eingeplant', monteurUserId: u.id, monteurName: u.name, datum: '2026-07-15', dauerTage: 1, slot: 'ganz', zeitVon: '07:00', zeitBis: '15:00', erstelltVon: {} }
  ]));
  _epErpMemo = { t: 0, l: null };
  _anker = '2026-07-13';
  epRender();
});
ok(await page.evaluate(() => {
  const f = document.getElementById('epPoolFilter');
  return _poolFilter === 'ab_hei' && f && f.value === 'ab_hei' && document.querySelectorAll('.job').length === 1;
}), 'Filter überlebt den Reload (beim nächsten Öffnen gleich)');
await page.evaluate(() => epPoolFilterSet(''));

console.log('■ Drag&Drop / Drop-Stunde');
ok(await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  epDropOn('job:auP2', u.id, '2026-07-16', 7);
  const ev = poolRead().find(e => e.auftragId === 'auP2');
  return ev && ev.zeitVon === '07:00' && ev.zeitBis === '15:00' && ev.titel === 'Sanitär offen';
}), 'Auftrag-Drop bei Stunde 7 → 07:00–15:00, Auftragstext als Titel übernommen');
ok(await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  const a = epAuftraege().find(x => x.id === 'auP3');
  epNeuAusAuftrag(a, u.id, '2026-07-17');
  const ev = poolRead().find(e => e.auftragId === 'auP3');
  return ev && ev.zeitVon === '' && ev.slot === 'ganz';
}), 'Einplanen ohne Positionsangabe bleibt ganztags (Rückwärtskompatibilität)');
ok(await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  epDropOn('ev:tl1', u.id, '2026-07-16', 13);
  const ev = poolRead().find(e => e.id === 'tl1');
  return ev && ev.datum === '2026-07-16' && ev.zeitVon === '13:00' && ev.zeitBis === '17:00';
}), 'Einsatz-Drop bei Stunde 13: Startzeit neu, Dauer (4 h) bleibt');

console.log('■ «Freier Termin» ohne Auftrag/Objekt');
ok(await page.evaluate(() => TYPEN.frei.n === 'Freier Termin'), 'Typ heisst «Freier Termin»');
ok(await page.evaluate(() => {
  epNeu('', '2026-07-20'); curEv.typ = 'frei'; epEvRender();
  return document.getElementById('evTyp').innerHTML.indexOf('Freier Termin') >= 0
    && document.getElementById('evAuftragWrap').style.display === 'none'
    && !document.getElementById('ev_objekt');
}), 'Freier Termin: kein Auftrag-Feld, kein Objekt-Feld');
ok(await page.evaluate(() => {
  const u = GemaAuth.getCurrentUser();
  curEv.auftragId = 'auP2';   // Altlast simulieren
  document.getElementById('ev_titel').value = 'Lager aufräumen';
  document.getElementById('ev_monteur').value = u.id;
  epEvSave();
  const ev = poolRead().find(e => e.titel === 'Lager aufräumen');
  return ev && ev.typ === 'frei' && ev.auftragId === '' && !ev.objektId;
}), 'Speichern: freier Termin ohne Auftrag und ohne Objekt');
ok(await page.evaluate(() => {
  // Service-Einsatz (typ frei MIT objektName aus sv_service): Objekt bleibt + wird read-only gezeigt
  const u = GemaAuth.getCurrentUser();
  const pool = poolRead().slice();
  pool.push({ id: 'evSvc', orgId: u.orgId, typ: 'frei', titel: '🛠 Service: Enthärter', objektId: 'objS', objektName: 'MFH Servicehaus', monteurUserId: u.id, monteurName: u.name, datum: '2026-07-21', dauerTage: 1, slot: 'ganz', zeitVon: '', zeitBis: '', erstelltVon: {}, schluessel: { code: '9999', info: 'Hauswart' } });
  localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(pool));
  epEvOpen('evSvc');
  const info = document.getElementById('evKeyInfo').innerHTML;
  document.getElementById('ev_titel').value = '🛠 Service: Enthärter';
  epEvSave();
  const ev = poolRead().find(e => e.id === 'evSvc');
  return info.indexOf('MFH Servicehaus') >= 0 && info.indexOf('9999') >= 0 && ev.objektId === 'objS';
}), 'Service-Einsatz: Objekt read-only sichtbar + bleibt beim Speichern erhalten');

console.log('■ Arbeitszeit-Fenster einstellbar');
ok(await page.evaluate(() => {
  const org = GemaAuth.getOrgs()[0];
  const st = org.settings || {};
  st.einsatzplan = Object.assign({}, st.einsatzplan, { tagVon: 7, tagBis: 17 });
  GemaAuth.updateOrgSettings(org.id, st);
  const s = epSettings();
  epRender();
  const tl = document.querySelector('.tl');
  return s.tagVon === 7 && s.tagBis === 17 && tl && tl.style.getPropertyValue('--hn') === '10';
}), 'tagVon/tagBis aus ⚙️ wirken auf das Stundenraster (07–17 → 10 Spalten)');

ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
