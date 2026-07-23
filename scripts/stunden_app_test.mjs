// Playwright-Test: Stundenerfassung — App-Ansichten + Stunden→Regierapport-Brücke
// Deckt ab (Feedback 07/2026 + AUQ-Entscheide):
//   - Ansichts-Umschalter Tag/Woche/Monat («Meine Woche»); Monats-Kalender mit
//     Stunden-/Einsatz-/Absenz-Markern, Tap → Tagesansicht
//   - Geplante Einsätze (Einsatzplan) erscheinen in der Tagesansicht mit
//     Direkt-Übernahme in die Zeiterfassung
//   - Nach jedem NEUEN Eintrag mit Projekt: Dialog «Material gebraucht?» —
//     Ja → Checkbox-Liste aus ERP-Auftrag (sonst Offerte) + freie Positionen,
//     Nein → Rapport ohne Material, ✕ → kein Rapport; Foto optional
//   - Rapport pro Zeiteintrag im Regie-Pool (Entwurf), Eintrag trägt 📝✓
//   - Org-Admin (org.admins) darf die GAV-Parameter öffnen/speichern
//   - pm_regierapport: fotos[] im Editor sichtbar
// Ausführen: CHROME=<chromium> node scripts/stunden_app_test.mjs (aus scripts/)
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};
const HEUTE = new Date().toISOString().slice(0, 10);
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Seed-Daten (werden nach dem Boot erneut in localStorage gelegt — der
// Boot-Bind überschreibt Caches mit dem Harness-Mock [])
const OBJEKTE = { objekte: [{ id: 'obj1', name: 'MFH Muster', ort: 'Basel', strasse: 'Musterweg 1', plz: '4000', orgId: 'org_test' }], beteiligte: [], activeObjektId: '' };
const EINSATZ = [{ id: 'ein1', orgId: 'org_test', typ: 'auftrag', auftragNr: 'AU-2026-001', kunde: 'Muster AG', titel: 'Steigzone sanieren', objektId: 'obj1', objektName: 'MFH Muster', monteurUserId: 'u_test', monteurName: 'Test User', datum: HEUTE, dauerTage: 1, slot: 'ganz', notiz: '' }];
const ERP = [{ id: 'erp1', typ: 'auftrag', nr: 'AU-2026-001', orgId: 'org_test', objektId: 'obj1', positionen: [
  { id: 'p0', art: 'titel', bez: 'Sanitärarbeiten' },
  { id: 'p1', art: 'frei', bez: 'Pressfitting 22 mm', menge: 40, einheit: 'Stk', ep: 8.5 },
  { id: 'p2', art: 'frei', bez: 'Rohr C-Stahl 22', menge: 60, einheit: 'm', ep: 12 },
  { id: 'p3', art: 'abzug', bez: 'Akonto-Abzug', ep: -100 }
] }];

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ── Kontext 1: Monteur (kein Org-Admin) ─────────────────────────────
console.log('■ Ansichten Tag / Woche / Monat');
const s1 = seed(['role_monteur'], { orgAdmins: ['u_boss'] });
const { ctx: ctx1, page: p1 } = await newPage(browser, s1);
// Objekt-Records auf Route-Ebene mocken — gema_objekte_api baut den Blob
// beim Boot aus dem Cloud-Pull neu (Harness-Mock [] würde ihn leeren).
await ctx1.route('**/*', route => {
  const u = decodeURIComponent(route.request().url());
  if (route.request().method() === 'GET' && u.indexOf('/gema_data') >= 0 && u.indexOf('module_key=eq.objekte') >= 0) {
    const body = u.indexOf('objekt:') >= 0
      ? OBJEKTE.objekte.map(o => ({ data_key: 'objekt:' + o.id, payload: { data: o, _lm: 1 } }))
      : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  }
  return route.fallback();
});
const errors = [];
p1.on('pageerror', e => errors.push(e.message));
await p1.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
await p1.waitForFunction(() => typeof stRender === 'function' && typeof stRrStart === 'function', null, { timeout: 12000 });
await p1.waitForTimeout(700);
await p1.evaluate(d => {
  localStorage.setItem('gema_einsatz_pool_v1', JSON.stringify(d.eins));
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify(d.erp));
  stRender();
}, { eins: EINSATZ, erp: ERP });

ok(await p1.evaluate(() => document.querySelectorAll('.wkmode button').length) === 3, 'Umschalter Tag/Woche/Monat vorhanden');
ok(await p1.evaluate(() => document.querySelector('.wkmode button.on').textContent.includes('Woche')), 'Desktop-Default: Wochenansicht');
ok(await p1.evaluate(() => document.getElementById('btnSet').style.display) === 'none', 'GAV-Parameter-Knopf für Monteur ohne Org-Admin versteckt');

// Tagesansicht mit geplantem Einsatz
await p1.evaluate(() => stSetWkMode('tag'));
{
  const t = await p1.evaluate(() => document.getElementById('viewWrap').textContent);
  ok(t.includes('Geplante Termine') && t.includes('Steigzone sanieren'), 'Tagesansicht zeigt den geplanten Termin aus dem Termine-Kalender');
  ok(t.includes('Σ KW'), 'Schlanke Wochen-Bilanz in der Tagesansicht');
}
// Einsatz-Übernahme → Eintrag-Modal vorbefüllt
await p1.evaluate(() => stEinNeuVonEinsatz(new Date().toISOString().slice(0, 10), 'ein1'));
{
  const m = await p1.evaluate(() => ({
    open: document.getElementById('einModal').classList.contains('open'),
    objekt: document.getElementById('ein_objekt').value,
    taetigkeit: document.getElementById('ein_taetigkeit').value
  }));
  ok(m.open && m.objekt === 'obj1', 'Einsatz-Übernahme: Modal offen, Projekt vorbefüllt');
  ok(m.taetigkeit === 'Steigzone sanieren', 'Tätigkeit aus dem Einsatz übernommen');
}

// ── Eintrag speichern → «Material gebraucht?» ──
console.log('■ Stunden → Regierapport: Ja mit Material');
await p1.evaluate(() => {
  document.getElementById('ein_von').value = '07:00';
  document.getElementById('ein_bis').value = '11:00';
  document.getElementById('ein_pause').value = '0';
  stEinSave();
});
await p1.waitForTimeout(200);
{
  const d = await p1.evaluate(() => ({
    open: document.getElementById('rrModal').classList.contains('open'),
    info: document.getElementById('rr_info').textContent,
    save: document.getElementById('rr_saveBtn').style.display
  }));
  ok(d.open, 'Nach dem Speichern erscheint die Meldung «Material gebraucht?»');
  ok(d.info.includes('MFH Muster') && d.info.includes('4.00 h'), 'Dialog zeigt Projekt + erfasste Stunden');
  ok(d.save === 'none', 'Speichern erst nach Ja/Nein-Antwort');
}
await p1.evaluate(() => stRrMaterial(true));
{
  const m = await p1.evaluate(() => ({
    quelle: document.getElementById('rr_matQuelle').textContent,
    rows: Array.from(document.querySelectorAll('#rr_matList .rr-mat .bez')).map(x => x.textContent)
  }));
  ok(m.quelle.includes('ERP-Auftrag AU-2026-001'), 'Material-Vorschläge aus dem ERP-Auftrag des Projekts');
  ok(m.rows.length === 2 && m.rows[0].includes('Pressfitting') && m.rows[1].includes('Rohr C-Stahl'), 'Nur echte Positionen (Titel/Abzug ausgelassen)');
}
// Position 1 anhaken (Menge 3), Foto anhängen, speichern
await p1.evaluate(() => {
  const row = document.querySelectorAll('#rr_matList .rr-mat')[0];
  row.querySelector('input[type=checkbox]').checked = true;
  row.querySelector('.mge').value = '3';
});
await p1.evaluate(png => { _rr.fotos.push({ dataUrl: png, ts: new Date().toISOString() }); stRrThumbs(); }, PNG1);
ok(await p1.evaluate(() => document.querySelectorAll('#rr_thumbs img').length) === 1, 'Foto-Thumbnail im Dialog');
await p1.evaluate(() => stRrSave());
await p1.waitForTimeout(400);
{
  const r = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_regie_pool_v1') || '[]'));
  ok(r.length === 1 && r[0].nr === 'R-001' && r[0].status === 'entwurf', 'Regierapport R-001 als Entwurf im Regie-Pool');
  ok(r[0].stunden.length === 1 && r[0].stunden[0].std === 4 && r[0].stunden[0].name === 'Test User', 'Stunden (4.00 h) in den Rapport übernommen');
  ok(r[0].material.length === 1 && r[0].material[0].bez === 'Pressfitting 22 mm' && r[0].material[0].menge === 3 && r[0].material[0].ep === 8.5, 'Material-Position mit Menge 3 + EP aus dem Auftrag');
  ok((r[0].fotos || []).length === 1, 'Foto im Rapport gespeichert');
  ok(r[0].objektId === 'obj1' && r[0].quelle && r[0].quelle.typ === 'stunden', 'Objekt-Bezug + Quelle «stunden» am Rapport');
  const tag = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_std_pool_v1') || '[]').find(t => !t.typ));
  ok(tag.eintraege[0].rapportId === r[0].id && tag.eintraege[0].rapportNr === 'R-001', 'Zeiteintrag mit dem Rapport verlinkt');
  const karte = await p1.evaluate(() => document.getElementById('viewWrap').textContent);
  ok(karte.includes('📝✓'), 'Tages-Karte zeigt 📝✓ am verlinkten Eintrag');
}

console.log('■ Nein-Pfad (Rapport ohne Material) + Kein-Rapport-Pfad');
await p1.evaluate(() => { stEinNeu(new Date().toISOString().slice(0, 10)); document.getElementById('ein_von').value = '12:00'; document.getElementById('ein_bis').value = '14:00'; document.getElementById('ein_pause').value = '0'; document.getElementById('ein_objekt').value = 'obj1'; document.getElementById('ein_taetigkeit').value = 'Nacharbeiten'; stEinSave(); });
await p1.waitForTimeout(150);
await p1.evaluate(() => stRrMaterial(false));
ok(await p1.evaluate(() => document.getElementById('rr_matWrap').style.display) === 'none', 'Nein → keine Material-Liste');
ok(await p1.evaluate(() => document.getElementById('rr_beschrieb').value) === 'Nacharbeiten', 'Beschrieb aus der Tätigkeit vorbefüllt');
await p1.evaluate(() => stRrSave());
await p1.waitForTimeout(300);
{
  const r = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_regie_pool_v1') || '[]'));
  ok(r.length === 2 && r[1].nr === 'R-002' && r[1].material.length === 0 && r[1].arbeit === 'Nacharbeiten', 'R-002 ohne Material, Beschrieb übernommen');
}
await p1.evaluate(() => { stEinNeu(new Date().toISOString().slice(0, 10)); document.getElementById('ein_von').value = '15:00'; document.getElementById('ein_bis').value = '16:00'; document.getElementById('ein_pause').value = '0'; document.getElementById('ein_objekt').value = 'obj1'; stEinSave(); });
await p1.waitForTimeout(150);
await p1.evaluate(() => stRrSkip());
{
  const r = await p1.evaluate(() => JSON.parse(localStorage.getItem('gema_regie_pool_v1') || '[]'));
  ok(r.length === 2, '«✕ Kein Rapport» erzeugt keinen Rapport — reine Zeiterfassung bleibt');
  ok(await p1.evaluate(() => !document.getElementById('rrModal').classList.contains('open')), 'Dialog geschlossen');
}
// Eintrag OHNE Projekt → keine Frage
await p1.evaluate(() => { stEinNeu(new Date().toISOString().slice(0, 10)); document.getElementById('ein_von').value = '16:00'; document.getElementById('ein_bis').value = '16:30'; document.getElementById('ein_pause').value = '0'; document.getElementById('ein_objekt').value = ''; stEinSave(); });
await p1.waitForTimeout(150);
ok(await p1.evaluate(() => !document.getElementById('rrModal').classList.contains('open')), 'Eintrag ohne Projekt: keine Material-Frage');

console.log('■ Monats-Kalender');
await p1.evaluate(() => stSetWkMode('monat'));
{
  const k = await p1.evaluate(() => {
    const heute = new Date().toISOString().slice(0, 10);
    const cells = document.querySelectorAll('.kal-cell:not(.leer)');
    const todayCell = document.querySelector('.kal-cell.today');
    return {
      n: cells.length,
      head: document.querySelector('.kal-head').textContent,
      today: todayCell ? todayCell.textContent : '',
      sum: document.getElementById('viewWrap').textContent.includes('Σ Monat')
    };
  });
  ok(k.n >= 28 && k.n <= 31, 'Kalender rendert die Monatstage (' + k.n + ')');
  ok(k.head.indexOf('Mo') === 0, 'Wochentags-Kopfzeile');
  ok(/7\.5|7\.50/.test(k.today), 'Heutiger Tag zeigt die erfassten Stunden (7.50 h)');
  ok(k.today.includes('📅'), 'Einsatz-Marker 📅 am heutigen Tag');
  ok(k.sum, 'Monats-Summe ausgewiesen');
}
await p1.evaluate(() => { const c = document.querySelector('.kal-cell.today'); c.click(); });
{
  const m = await p1.evaluate(() => ({ mode: _wkMode, tag: _tagDatum, on: document.querySelector('.wkmode button.on').textContent }));
  ok(m.mode === 'tag' && m.tag === HEUTE && m.on.includes('Tag'), 'Tap auf Kalendertag → springt in die Tagesansicht dieses Tags');
}
await ctx1.close();

// ── Kontext 2: Org-Admin (Monteur-Rolle, aber org.admins) ──────────
console.log('■ Org-Admin darf GAV-Parameter einstellen');
const s2 = seed(['role_monteur']);   // Harness-Default: org.admins = ['u_test']
const { ctx: ctx2, page: p2 } = await newPage(browser, s2);
await p2.goto(BASE + '/pm_stunden.html', { waitUntil: 'domcontentloaded' });
await p2.waitForFunction(() => typeof stOpenSettings === 'function', null, { timeout: 12000 });
await p2.waitForTimeout(400);
ok(await p2.evaluate(() => document.getElementById('btnSet').style.display) !== 'none', 'GAV-Parameter-Knopf sichtbar (Org-Admin ohne Planer-Rolle)');
await p2.evaluate(() => stOpenSettings());
ok(await p2.evaluate(() => document.getElementById('setModal').classList.contains('open')), 'Einstellungs-Modal öffnet');
await p2.evaluate(() => { document.getElementById('s_wochenSoll').value = '41'; stSetSave(); });
await p2.waitForTimeout(150);
ok(await p2.evaluate(() => GemaAuth.getOrgs()[0].settings.stunden.wochenSoll) === 41, 'Org-Admin speichert Wochensoll 41 h');
await ctx2.close();

// ── Kontext 3: pm_regierapport zeigt fotos[] ────────────────────────
console.log('■ Regierapport-Modul: Fotos im Editor');
const RAPPORT = { id: 'regie_test1', nr: 'R-007', orgId: 'org_test', objektId: 'obj1', objektName: 'MFH Muster', datum: HEUTE, arbeit: 'Test', bemerkung: '', status: 'entwurf', erstelltVon: { userId: 'u_test', name: 'Test User' }, erstelltAm: new Date().toISOString(), stunden: [{ id: 's1', kat: 'monteur', name: 'Test User', std: 4, ansatz: '' }], material: [], fotos: [{ dataUrl: PNG1, ts: new Date().toISOString() }], quelle: { typ: 'stunden' } };
const s3 = seed(['role_planer']);
const { ctx: ctx3, page: p3 } = await newPage(browser, s3);
await p3.goto(BASE + '/pm_regierapport.html', { waitUntil: 'domcontentloaded' });
await p3.waitForFunction(() => typeof rrOpen === 'function', null, { timeout: 12000 });
await p3.waitForTimeout(500);
await p3.evaluate(r => { localStorage.setItem('gema_regie_pool_v1', JSON.stringify([r])); rrRender(); }, RAPPORT);
await p3.evaluate(() => rrOpen('regie_test1'));
{
  const e = await p3.evaluate(() => ({
    fotos: document.querySelectorAll('#fotoRows img').length,
    sum: (document.getElementById('fotoSum') || {}).textContent || '',
    btn: !!Array.from(document.querySelectorAll('#edBody button')).find(b => b.textContent.includes('Foto aufnehmen'))
  }));
  ok(e.fotos === 1, 'Editor zeigt das Foto aus der Stunden-Erfassung');
  ok(e.sum.includes('1 Foto'), 'Foto-Zähler in der Sektion');
  ok(e.btn, '«📷 Foto aufnehmen»-Knopf für Berechtigte');
}
await ctx3.close();

if (errors.length) console.log('  [pageerrors]', errors.slice(0, 6));
ok(errors.length === 0, 'Keine JS-Fehler in pm_stunden');

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
