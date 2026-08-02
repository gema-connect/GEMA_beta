// Playwright-Smoke: Beleg-Verknüpfungen + Kopfdaten im ERP (pm_erp.html).
//
// Deckt die drei Pakete ab, die nach der ERP-Migration dazugekommen sind:
//
//   1) Beleg-Kette in BEIDE Richtungen — von der Offerte sieht man die
//      Rechnungen, von der Rechnung die Offerte. Die Kette wird GERECHNET
//      (nicht gespeichert), damit sie nie auseinanderlaufen kann.
//   2) Das Objekt speist den Beleg — Adress-Slots, Bezugspersonen und die
//      Zahlungsbedingung des Kunden. Einmal am Objekt gepflegt, überall da.
//   3) Kopfdaten aus dem Altsystem — Art der Arbeit, Anlage, Dateien,
//      externe Referenzen, Buchhaltungs-Datum, Vermerke, Verlauf.
//
// Aufruf: CHROME=<chromium> node scripts/erp_beleg_verknuepfung_test.mjs
import { startServer, newPage, seed, BASE } from './rolematrix_harness.mjs';

let n = 0, fail = 0;
const t = (name, cond) => { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } };
const eq = (name, a, b) => t(name + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), JSON.stringify(a) === JSON.stringify(b));

const pw = (await import('playwright-core')).chromium;
const server = await startServer();
const browser = await pw.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const st = seed(['role_planer']);
// Das Objekt trägt die Adress-Slots + Bezugspersonen. GemaObjekte memoisiert
// seinen Cache beim ersten Lesen — der Seed MUSS deshalb vor dem Boot stehen.
const OBJ = {
  id: 'obj_1', orgId: 'org_test', name: 'Hellring 7', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen', status: 'aktiv',
  adressen: {
    zahler: { adressId: 'kd_z', nr: '7330', snapshot: { firma: 'Immobilien Basel-Stadt', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen' } },
    korrespondenz: { adressId: 'kd_k', snapshot: { firma: 'IBS Liegenschaften FV', strasse: 'Fischmarkt 10', plz: '4001', ort: 'Basel' } }
  },
  bezugspersonen: [
    { id: 'bp1', name: 'Hauswart Muster', typen: ['besteller'], tel: '061 000 11 22' },
    { id: 'bp2', name: 'Frau Beispiel', typen: ['bewohner'], wohnung: '3. OG' }
  ]
};
st.gema_objekte_v1 = { objekte: [OBJ], beteiligte: [] };
st.gema_objpool_v1 = [OBJ];

const { ctx, page } = await newPage(browser, st);
page.on('pageerror', e => { fail++; console.error('  ✗ pageerror: ' + e.message); });
await page.goto(BASE + '/pm_erp.html');
await page.waitForFunction(() => document.getElementById('mtabs') && document.getElementById('mtabs').children.length, { timeout: 15000 });
await page.waitForTimeout(2500);   // Cloud-Pull abwarten

// Die Pools erst NACH dem Boot seeden: der Harness beantwortet jeden
// Supabase-GET mit [], und bindCollection würde einen vorher gesetzten
// Cache mit dieser leeren Antwort überschreiben.
await page.evaluate(() => {
  const now = new Date().toISOString();
  const base = { orgId: 'org_test', positionen: [], schluss: [], zahlungen: [], rabattPct: 0, mwstPct: 8.1, erstelltAm: now };
  const off = { ...base, id: 'd_off', typ: 'offerte', nr: 'OF-2026-001', status: 'angenommen', titel: 'Waschmaschine',
    verknuepfung: { auftragId: 'd_auf' }, positionen: [{ id: 'p1', art: 'frei', bez: 'X', menge: 1, einheit: 'Psch', ep: 1000 }] };
  const auf = { ...base, id: 'd_auf', typ: 'auftrag', nr: '9554.00', status: 'abgeschlossen', titel: 'Waschmaschine',
    verknuepfung: { offerteId: 'd_off' }, positionen: [{ id: 'p2', art: 'frei', bez: 'X', menge: 1, einheit: 'Psch', ep: 1000 }] };
  const r1 = { ...base, id: 'd_r1', typ: 'rechnung', nr: '2026.0252', status: 'bezahlt', rechnungsArt: 'schluss', titel: 'W',
    verknuepfung: { auftragId: 'd_auf', offerteId: 'd_off' }, positionen: [{ id: 'p3', art: 'frei', bez: 'X', menge: 1, einheit: 'Psch', ep: 600 }],
    zahlungen: [{ datum: '2026-05-01', betrag: 648.6 }],
    importArbeit: 'Hauptauftrag', importStatusText: 'Versandt', importAusgefuehrt: 'vom 14.04. bis 16.04.2026',
    // Gültige Referenz: der Importer legt sie doppelt ab — roh für die
    // Vermerke-Anzeige, bereinigt für den QR-Nachdruck.
    importZahlbed: '01', importEsrRefRoh: '38 44000 00000 00000 20260 25 23', importEsrRef: '384400000000000000202602523',
    quelle: { typ: 'import', system: 'ERP-Migration', am: '2026-08-02T00:00:00Z', extId: '11554' },
    importSumme: { netto: 600, mwst: 48.6, brutto: 648.6 } };
  const r2 = { ...base, id: 'd_r2', typ: 'rechnung', nr: '2026.0300', status: 'gestellt', rechnungsArt: 'akonto', titel: 'W',
    frist: '2026-06-01', verknuepfung: { auftragId: 'd_auf' }, positionen: [{ id: 'p4', art: 'frei', bez: 'X', menge: 1, einheit: 'Psch', ep: 400 }] };
  localStorage.setItem('gema_erp_dok_pool_v1', JSON.stringify([off, auf, r1, r2]));
  localStorage.setItem('gema_sv_anlagen_pool_v1', JSON.stringify([
    { id: 'anl_1', orgId: 'org_test', name: 'Boiler 300 l', hersteller: 'Domotec', serienNr: 'D-4711', objektId: 'obj_1' }
  ]));
  localStorage.setItem('gema_erp_kunden_pool_v1', JSON.stringify([
    { id: 'kd_z', orgId: 'org_test', firma: 'Immobilien Basel-Stadt', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen', zahlbedId: 'netto10' }
  ]));
});
await page.evaluate(() => erpRenderAll());
await page.waitForTimeout(300);

async function oeffne(id) {
  await page.evaluate(i => erpOpen(i), id);
  await page.waitForSelector('#edOv.open', { timeout: 8000 });
  await page.waitForTimeout(250);
  return await page.textContent('.ov-bd');
}

console.log('\n═══ 1 — Kette von der OFFERTE aus ═══');
let txt = await oeffne('d_off');
t('Ketten-Zeile wird gezeigt', /🔗/.test(txt));
t('Der Auftrag ist verlinkt', /9554\.00/.test(txt));
t('BEIDE Rechnungen sind verlinkt (die Kette rechnet über den Auftrag hinweg)', /2026\.0252/.test(txt) && /2026\.0300/.test(txt));

console.log('\n═══ 2 — Kette vom AUFTRAG aus ═══');
txt = await oeffne('d_auf');
t('Die Offerte ist rückwärts verlinkt', /OF-2026-001/.test(txt));
t('Beide Rechnungen sind verlinkt', /2026\.0252/.test(txt) && /2026\.0300/.test(txt));
t('Der Fakturierungsstand steht in der Kette', /% verrechnet/.test(txt));
t('Keine doppelte Linkliste (Kette ersetzt die alte Box)', (txt.match(/2026\.0252/g) || []).length === 1);

console.log('\n═══ 3 — Kette + Vermerke von der importierten RECHNUNG aus ═══');
txt = await oeffne('d_r1');
t('Offerte UND Auftrag sind verlinkt', /OF-2026-001/.test(txt) && /9554\.00/.test(txt));
t('Die Vermerke-Zeile ist da', /Aus dem Altsystem/.test(txt));
t('Vermerke starten zugeklappt (kein Lärm im Alltag)', !(await page.isVisible('#edVermerkeBd')));
await page.evaluate(() => erpVermerkeToggle());
await page.waitForTimeout(150);
txt = await page.textContent('.ov-bd');
t('Aufgeklappt: Arbeitsart aus dem Altsystem', /Hauptauftrag/.test(txt));
t('Aufgeklappt: Ausführungs-Zeitraum', /vom 14\.04/.test(txt));
t('Aufgeklappt: ESR-Referenz im Original', /38 44000 00000 00000 20260 25 23/.test(txt));
t('Aufgeklappt: Betrag laut Altsystem (Kontrollwert)', /Betrag im Altsystem/.test(txt));

console.log('\n═══ 4 — Verlauf schreibt sich selbst ═══');
const vor = await page.evaluate(() => (poolRead('gema_erp_dok_pool_v1').find(d => d.id === 'd_r2').verlauf || []).length);
await page.evaluate(() => erpCtxStatus('d_r2', 'storniert', 'x'));
await page.waitForTimeout(250);
const nach = await page.evaluate(() => {
  const d = poolRead('gema_erp_dok_pool_v1').find(x => x.id === 'd_r2');
  return { n: (d.verlauf || []).length, txt: (d.verlauf || []).map(v => v.text).join(' | ') };
});
eq('Genau ein Verlaufs-Eintrag ergänzt', [vor, nach.n], [0, 1]);
t('Der Eintrag nennt den Statuswechsel: ' + nach.txt, /Gestellt/.test(nach.txt) && /Storniert/.test(nach.txt));

console.log('\n═══ 5 — Das Objekt speist den Beleg ═══');
await page.evaluate(() => erpNeu('rechnung'));
await page.waitForSelector('#edOv.open', { timeout: 8000 });
await page.waitForTimeout(250);
await page.evaluate(() => erpObjektWahl('obj_1'));
await page.waitForTimeout(400);
let r = await page.evaluate(() => ({
  kunde: cur.kundeSnapshot && cur.kundeSnapshot.firma,
  zustell: cur.zustellSnapshot && cur.zustellSnapshot.firma,
  zb: cur.zahlbedId, frist: cur.frist, datum: cur.datum
}));
eq('Rechnungsempfänger kommt aus dem Zahler-Slot', r.kunde, 'Immobilien Basel-Stadt');
eq('Zustelladresse kommt aus dem Korrespondenz-Slot', r.zustell, 'IBS Liegenschaften FV');
// KRITISCH: der Kunde kam über den Objekt-Slot, NICHT über das Kunden-Feld.
// Seine Zahlungsbedingung muss trotzdem mitkommen — sonst müsste man sie
// von Hand nachtragen, obwohl sie am Kunden gepflegt ist.
eq('Zahlungsbedingung des Kunden kommt über den Objekt-Slot mit', r.zb, 'netto10');
eq('Zahlbar-bis daraus gerechnet (+10 Tage)', r.frist, new Date(Date.parse(r.datum) + 10 * 864e5).toISOString().slice(0, 10));

let ui = await page.textContent('.ov-bd');
t('Bezugspersonen des Objekts stehen am Beleg (nur lesend)', /Hauswart Muster/.test(ui) && /Frau Beispiel/.test(ui));
t('Anlage aus dem Service-Register ist wählbar', /Boiler 300 l/.test(ui));
t('Feld «Zahlungsbedingung» ist da', /Zahlungsbedingung/.test(ui));
t('Externe Referenzen 1 + 2 sind da', /Externe Referenz 1/.test(ui) && /Externe Referenz 2/.test(ui));
t('«Art der Arbeit» ist eine Auswahl (kein Freitext-Feld mehr)', /Art der Arbeit/.test(ui) && /Hauptauftrag/.test(ui));
t('Dateien lassen sich anhängen', /Plan, Foto, Lieferschein/.test(ui));
t('Buchhaltungs-Datum bei der Rechnung', /An Buchhaltung/.test(ui));

console.log('\n═══ 6 — Kunden-Wahl über das Feld setzt dieselbe Bedingung ═══');
await page.evaluate(() => { cur.zahlbedId = ''; erpKundeWahl('kd_z'); });
await page.waitForTimeout(350);
r = await page.evaluate(() => ({ zb: cur.zahlbedId, frist: cur.frist, datum: cur.datum }));
eq('Zahlungsbedingung auch über das Kunden-Feld', r.zb, 'netto10');
eq('Und die Frist folgt', r.frist, new Date(Date.parse(r.datum) + 10 * 864e5).toISOString().slice(0, 10));

console.log('\n═══ 7 — Anlage wird mit Momentaufnahme verknüpft ═══');
await page.evaluate(() => erpAnlageWahl('anl_1'));
await page.waitForTimeout(300);
r = await page.evaluate(() => ({ id: cur.anlageId, snap: cur.anlageSnapshot && cur.anlageSnapshot.name, sn: cur.anlageSnapshot && cur.anlageSnapshot.serienNr }));
eq('Anlage verknüpft', r.id, 'anl_1');
eq('Momentaufnahme mitgespeichert (Beleg bleibt lesbar, wenn die Anlage später wegfällt)', [r.snap, r.sn], ['Boiler 300 l', 'D-4711']);

console.log('\n═══ 8 — Zahlungsbedingungen + Arten der Arbeit sind pflegbar ═══');
await page.evaluate(() => erpOpenSettings());
await page.waitForTimeout(300);
r = await page.evaluate(() => ({ zb: document.querySelectorAll('#s_zbRows .zb-row').length, aa: document.querySelectorAll('#s_aaRows .aa-row').length }));
eq('Beide Listen sind im ⚙️-Dialog vorbelegt', [r.zb > 0, r.aa > 0], [true, true]);
await page.evaluate(() => {
  document.querySelector('#s_zbRows .zb-row .zb-label').value = '30 Tage';   // umbenennen
  erpZbRowAdd('s_zbRows');
  var rows = document.querySelectorAll('#s_zbRows .zb-row'), neu = rows[rows.length - 1];
  neu.querySelector('.zb-label').value = '14 Tage netto';
  neu.querySelector('.zb-tage').value = '14';
  neu.querySelector('.zb-skpct').value = '2';
  neu.querySelector('.zb-sktage').value = '7';
  erpAaRowAdd('s_aaRows');
  var a = document.querySelectorAll('#s_aaRows .aa-row');
  a[a.length - 1].querySelector('.aa-name').value = 'Umbau';
  erpSetSave();
});
await page.waitForTimeout(400);
r = await page.evaluate(() => {
  var l = erpZahlbedListe(), neu = erpZahlbedById('zb_14_tage_netto');
  return { ersteId: l[0].id, ersteLabel: l[0].label, neu: neu, aa: erpArbeitsarten() };
});
// KRITISCH: die id bleibt beim Umbenennen stehen — sonst verlören alle
// Kunden und Belege ihre Zuordnung, sobald jemand die Bezeichnung anpasst.
eq('Umbenennen behält die id (Zuordnungen bleiben)', [r.ersteId, r.ersteLabel], ['netto30', '30 Tage']);
eq('Neue Bedingung mit Skonto gespeichert', r.neu, { id: 'zb_14_tage_netto', label: '14 Tage netto', tage: 14, skontoPct: 2, skontoTage: 7 });
t('Neue Arbeitsart in der Liste', r.aa.indexOf('Umbau') >= 0);

console.log('\n═══ 9 — Importierte ESR-Referenz gewinnt im QR ═══');
r = await page.evaluate(() => {
  const d = poolRead('gema_erp_dok_pool_v1').find(x => x.id === 'd_r1');
  return { alt: erpRefFuer(d), roh: d.importEsrRef || '', neu: erpQrReferenz(d.nr) };
});
t('Die Referenz des Altsystems wird gedruckt, nicht eine neue', r.alt === r.roh && r.alt !== r.neu && /^\d{27}$/.test(r.alt));

await ctx.close(); await browser.close(); await server.close();
console.log(fail ? `\n✗ ${fail} von ${n} Checks fehlgeschlagen` : `\n✓ alle ${n} Checks bestanden`);
process.exit(fail ? 1 : 0);
