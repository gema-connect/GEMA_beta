// Playwright-Smoke: ERP + Einsatzplan — Feedback 19.07.2026
//   (1) ERP-Offert-Editor: Beteiligte des gewählten Objekts direkt sichtbar,
//       1-Klick-Übernahme als Rechnungsempfänger (Request 1)
//   (2) Einsatzplan: neuer Einsatz startet als «Auftrag» (Request 2)
//   (3) Einsatzplan: bei Typ «Auftrag» ist die separate Projekt/Objekt-Auswahl
//       ausgeblendet (kommt aus dem Auftrag) (Request 3)
//   (4) Einsatzplan: Auftrag-Auswahl ist eine Such-Maske, sortiert nach
//       Erstellungsdatum, Filter über Nr/Titel/Kunde/Adresse (Request 4)
// Ausführen: CHROME=<chromium> node scripts/erp_einsatz_auftrag_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const OBJEKTE = {
  objekte: [{ id: 'obj1', orgId: 'org_test', name: 'Neubau Musterstrasse', strasse: 'Musterstr. 1', plz: '4000', ort: 'Basel' }],
  beteiligte: [
    { id: 'b1', objektId: 'obj1', rolle: 'Bauherrschaft', firma: 'Immo Basel AG', name: 'Hans Muster', strasse: 'Rheinweg 2', plz: '4001', ort: 'Basel', email: 'h@immo.ch' },
    { id: 'b2', objektId: 'obj1', rolle: 'Architekt', firma: 'Arch AG', name: 'Petra Plan' }
  ],
  activeObjektId: 'obj1'
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// ════════ 1) ERP: Beteiligte im Offert-Editor ════════
console.log('■ ERP: Beteiligte des Objekts direkt im Editor sichtbar (Request 1)');
{
  const sd = seed(['role_planer']);
  sd.gema_objekte_v1 = OBJEKTE;
  const { ctx, page } = await newPage(browser, sd);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpNeu === 'function' && typeof erpObjektWahl === 'function' && typeof erpRenderObjBet === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(400);

  ok(await page.evaluate(() => { try { return (GemaObjekte.getBeteiligte('obj1') || []).length === 2; } catch (e) { return false; } }), 'Objekt obj1 hat 2 Beteiligte geladen');

  // Neue Offerte übernimmt das aktive Objekt (obj1) → Beteiligte erscheinen sofort
  await page.evaluate(() => { erpNeu('offerte'); erpOpenEditor(); });
  ok(await page.evaluate(() => cur.objektId === 'obj1'), 'neue Offerte übernimmt das aktive Objekt');
  {
    const html = await page.evaluate(() => document.getElementById('erpObjBet').innerHTML);
    ok(/Immo Basel AG/.test(html) && /Arch AG/.test(html), 'Beteiligten-Box erscheint automatisch mit beiden Beteiligten');
    ok(/Rechnungsempfänger/.test(html) && /erpBetAlsKunde\(0\)/.test(html), 'Box beschriftet + 1-Klick-Buttons');
  }
  // Objekt abwählen → Box verschwindet
  ok(await page.evaluate(() => { erpObjektWahl(''); return document.getElementById('erpObjBet').innerHTML === ''; }), 'ohne Objekt: keine Beteiligten-Box');
  await page.evaluate(() => erpObjektWahl('obj1'));

  ok(await page.evaluate(() => {
    erpBetAlsKunde(0);
    return cur.kundeId && cur.kundeSnapshot && cur.kundeSnapshot.firma === 'Immo Basel AG' && cur.kundeSnapshot.ort === 'Basel';
  }), 'Klick übernimmt Beteiligten als Rechnungsempfänger (mit Adresse)');
  ok(await page.evaluate(() => poolRead(KUN_POOL).some(k => k.firma === 'Immo Basel AG')), 'Kunde wurde im Kundenstamm angelegt');

  // gleiche Firma erneut → kein Duplikat
  ok(await page.evaluate(() => {
    const before = poolRead(KUN_POOL).filter(k => k.firma === 'Immo Basel AG').length;
    erpBetAlsKunde(0);
    const after = poolRead(KUN_POOL).filter(k => k.firma === 'Immo Basel AG').length;
    return before === 1 && after === 1;
  }), 'zweite Übernahme legt keinen Duplikat-Kunden an');

  // Persistenz: Editor neu öffnen → Box erscheint direkt (Objekt gesetzt)
  ok(await page.evaluate(() => {
    cur.titel = 'Offerte Musterstrasse'; erpSaveCur(true); erpOpen(cur.id);
    return /Immo Basel AG/.test(document.getElementById('erpObjBet').innerHTML);
  }), 'beim Wiederöffnen mit gesetztem Objekt erscheint die Box direkt');

  // ── Objekt-Wahl als Such-Dropdown (Combobox) — Feedback 24.07.2026 ──
  await page.evaluate(() => { erpNeu('offerte'); erpObjektWahl(''); erpOpenEditor(); });
  ok(await page.evaluate(() => { const el=document.getElementById('e_objekt'); return el && el.tagName==='INPUT' && el.closest('.erp-combo'); }), 'Objektfeld ist ein Such-Textfeld (Combobox), kein <select>');
  ok(await page.evaluate(() => document.getElementById('e_objektClear').style.display==='none'), 'ohne Objekt: kein ✕-Clear');
  // tippen → gefilterte Vorschläge
  ok(await page.evaluate(() => { erpObjInput('muster'); const d=document.getElementById('e_objektDrop'); return d.classList.contains('open') && [...d.querySelectorAll('.co-item')].some(x=>x.getAttribute('data-id')==='obj1'); }), 'Tippen «muster» zeigt obj1 als Vorschlag');
  ok(await page.evaluate(() => { erpObjInput('zznope'); return document.getElementById('e_objektDrop').textContent.indexOf('Kein Projekt gefunden')>=0; }), 'kein Treffer → «Kein Projekt gefunden»');
  // Vorschlag wählen → objektId gesetzt + Beteiligte + Clear sichtbar
  ok(await page.evaluate(() => {
    erpObjPick('obj1');
    const inp=document.getElementById('e_objekt');
    return cur.objektId==='obj1' && inp.value.indexOf('Musterstrasse')>=0
      && document.getElementById('e_objektClear').style.display!=='none'
      && !document.getElementById('e_objektDrop').classList.contains('open')
      && /Immo Basel AG/.test(document.getElementById('erpObjBet').innerHTML);
  }), 'Pick setzt objektId + Textfeld + Beteiligten-Box, Drop schliesst');
  // Enter wählt den ersten/aktiven Vorschlag
  ok(await page.evaluate(() => {
    erpObjClear(); erpObjInput('basel');
    const drop=document.getElementById('e_objektDrop');
    const inp=document.getElementById('e_objekt');
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    return cur.objektId==='obj1';
  }), 'Enter im Suchfeld übernimmt den Treffer');
  // ✕ leert die Auswahl
  ok(await page.evaluate(() => {
    erpObjClear();
    return cur.objektId==='' && document.getElementById('e_objekt').value==='' && document.getElementById('e_objektClear').style.display==='none' && document.getElementById('erpObjBet').innerHTML==='';
  }), '✕ entfernt das Objekt (objektId leer, Box weg)');

  ok(errors.length === 0, 'ERP: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

// ════════ 2-4) Einsatzplan: Auftrag-Default + Such-Maske ════════
console.log('■ Einsatzplan: Standard-Typ, ausgeblendetes Objekt, Such-Maske (Request 2-4)');
{
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/pm_einsatzplan.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof epNeu === 'function' && typeof epAufOpen === 'function' && typeof epAufRender === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(500);

  // ERP-Aufträge seeden (verschiedene Erstellungsdaten + Adressen) + den Test-User als planbare Person
  await page.evaluate(() => {
    const u = GemaAuth.getCurrentUser();
    const org = GemaAuth.getOrgs()[0];
    const st = org.settings || {};
    st.einsatzplan = Object.assign({}, st.einsatzplan, { userIds: [u.id] });
    GemaAuth.updateOrgSettings(org.id, st);
    const mk = (nr, titel, firma, str, plz, ort, ea, objId, objName) => ({
      id: 'au_' + nr, orgId: u.orgId, typ: 'auftrag', nr: nr, titel: titel, status: 'offen', positionen: [],
      kundeSnapshot: { firma: firma, strasse: str, plz: plz, ort: ort }, erstelltAm: ea, datum: ea.slice(0, 10),
      objektId: objId || '', objektName: objName || ''
    });
    localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([
      mk('AU-2026-001', 'Boiler Service', 'Alpha AG', 'Bahnhofstrasse 3', '8000', 'Zürich', '2026-07-01T10:00:00Z', 'objX', 'Wohnhaus Alpha · Zürich'),
      mk('AU-2026-002', 'Steigzone Sanierung', 'Beta GmbH', 'Seestrasse 9', '6000', 'Luzern', '2026-07-10T10:00:00Z'),
      mk('AU-2026-003', 'Waschküche Umbau', 'Gamma AG', 'Dorfweg 1', '3000', 'Bern', '2026-07-05T10:00:00Z')
    ]));
    _epErpMemo = { t: 0, l: null };
  });

  // Request 2: neuer Einsatz startet als «Auftrag»
  ok(await page.evaluate(() => { epNeu('', '2026-07-20'); return curEv.typ === 'auftrag'; }), 'neuer Einsatz: Standard-Typ = Auftrag');
  ok(await page.evaluate(() => document.getElementById('evAuftragWrap').style.display !== 'none'), 'Auftrag-Auswahl sichtbar');

  // Request 3: kein separates Projekt/Objekt-Feld mehr (Objekt kommt aus dem Auftrag)
  ok(await page.evaluate(() => !document.getElementById('ev_objekt')), 'kein separates Objekt-Feld im Dialog (Objekt kommt aus dem Auftrag)');
  ok(await page.evaluate(() => { curEv.typ = 'frei'; epEvRender(); return document.getElementById('evTyp').innerHTML.indexOf('Freier Termin') >= 0 && document.getElementById('evAuftragWrap').style.display === 'none'; }), 'Typ «frei» heisst «Freier Termin» — ohne Auftrag- und Objekt-Feld');
  await page.evaluate(() => { curEv.typ = 'auftrag'; epEvRender(); });

  // Request 4: Such-Maske
  ok(await page.evaluate(() => /Auftrag suchen/.test(document.getElementById('evAuftragPick').innerHTML)), 'ohne Auftrag: «🔍 Auftrag suchen …»-Button statt Dropdown');
  await page.evaluate(() => epAufOpen());
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => document.getElementById('aufModal').classList.contains('open')), 'Such-Maske öffnet sich');
  ok(await page.evaluate(() => document.querySelectorAll('#aufList .auf-row').length === 3), 'Alle 3 offenen Aufträge gelistet');
  // Sortierung nach Erstellungsdatum, neueste zuerst → AU-2026-002 (10.07.) oben
  ok(await page.evaluate(() => { const r = document.querySelector('#aufList .auf-row'); return r && r.innerHTML.indexOf('AU-2026-002') >= 0; }), 'Sortierung: neuester Auftrag (10.07.) zuoberst');
  // Suche nach Adresse
  ok(await page.evaluate(() => { epAufRender('zürich'); const rows = document.querySelectorAll('#aufList .auf-row'); return rows.length === 1 && rows[0].innerHTML.indexOf('AU-2026-001') >= 0; }), 'Suche «zürich» findet den Auftrag mit dieser Adresse');
  ok(await page.evaluate(() => { epAufRender('steigzone'); const rows = document.querySelectorAll('#aufList .auf-row'); return rows.length === 1 && rows[0].innerHTML.indexOf('AU-2026-002') >= 0; }), 'Suche «steigzone» findet über den Titel');
  ok(await page.evaluate(() => { epAufRender('gamma'); const rows = document.querySelectorAll('#aufList .auf-row'); return rows.length === 1 && rows[0].innerHTML.indexOf('AU-2026-003') >= 0; }), 'Suche «gamma» findet über den Kunden');

  // Auswahl setzt Auftrag + Objekt und schliesst die Maske
  ok(await page.evaluate(() => {
    epAufPick('au_AU-2026-001');
    return curEv.auftragId === 'au_AU-2026-001' && curEv.objektId === 'objX' && !document.getElementById('aufModal').classList.contains('open');
  }), 'Auswahl übernimmt Auftrag + verknüpftes Objekt, schliesst Maske');
  ok(await page.evaluate(() => /AU-2026-001/.test(document.getElementById('evAuftragPick').innerHTML) && /Ändern/.test(document.getElementById('evAuftragPick').innerHTML)), 'gewählter Auftrag als Chip mit «Ändern»-Button');
  ok(await page.evaluate(() => /Wohnhaus Alpha/.test(document.getElementById('evAuftragPick').innerHTML)), 'Chip zeigt das Objekt des Auftrags (statt separatem Feld)');

  // getippter Titel überlebt die Auftragswahl
  ok(await page.evaluate(() => {
    epNeu('', '2026-07-20'); document.getElementById('ev_titel').value = 'Eigener Titel';
    epAufOpen(); epAufPick('au_AU-2026-002');
    return curEv.titel === 'Eigener Titel';
  }), 'bereits getippter Titel wird bei der Auftragswahl nicht überschrieben');

  // Speichern eines Auftrags-Einsatzes ohne Auftragswahl crasht nicht (kein ev_auftrag-Select mehr)
  ok(await page.evaluate(() => {
    epNeu('', '2026-07-20'); curEv.auftragId = ''; curEv.monteurUserId = GemaAuth.getCurrentUser().id;
    document.getElementById('ev_titel').value = 'Ohne Auftrag';
    document.getElementById('ev_monteur').value = GemaAuth.getCurrentUser().id;
    epEvSave();
    return poolRead().some(e => e.titel === 'Ohne Auftrag');
  }), 'Auftrags-Einsatz ohne gewählten Auftrag speichert (kein Crash)');

  // Objekt aus dem Auftrag (denormalisiert, NICHT in GemaObjekte) überlebt das Speichern
  ok(await page.evaluate(() => {
    epNeu('', '2026-07-24'); document.getElementById('ev_monteur').value = GemaAuth.getCurrentUser().id;
    epAufOpen(); epAufPick('au_AU-2026-001');   // objektId 'objX', objektName gesetzt, nicht in GemaObjekte
    document.getElementById('ev_monteur').value = GemaAuth.getCurrentUser().id;
    epEvSave();
    const ev = poolRead().find(e => e.auftragId === 'au_AU-2026-001' && e.datum === '2026-07-24');
    return ev && ev.objektId === 'objX' && /Zürich/.test(ev.objektName);
  }), 'Auftrag-Objekt (denormalisiert) bleibt beim Speichern erhalten');

  ok(errors.length === 0, 'Einsatzplan: keine JS-Fehler' + (errors.length ? ' — ' + errors[0] : ''));
  await ctx.close();
}

await browser.close();
await server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
