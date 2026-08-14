// Drift-Guard: ERP — Löschen ist IMMER möglich, mit Auflistung + Checkbox
// (Feedback 13.08.2026: «ich kann im erp teilweise aufträge oder offerte nicht
//  löschen, das soll immer möglich sein mit bestätigung und auflistung … dann
//  soll man per checkbox (die standard aktiviert ist) alle verknüpften daten
//  auch löschen anwählen können oder eben nicht»)
//
// Geprüft wird:
//   A) Statisch — kein status==='entwurf'-Gate mehr am Lösch-Knopf und im
//      Kontextmenü; der Save-Abbruch vor dem Löschen ist da.
//   B) Scan — findet Kette, Kreditoren, Termine (mit/ohne erfasste Zeit),
//      Regierapporte, Serviceaufträge, Abschlussmeldungen, vorgelagerte Offerte.
//      Und: der Scan hängt am HAKEN — ohne ihn überleben die nachgelagerten
//      Belege, also darf auch nichts entkoppelt werden, was an DENEN hängt.
//   C) Dialog — Auflistung, Checkbox standardmässig AN, Knopf nennt die Zahl,
//      Umschalten rechnet die Vorschau neu.
//   D) Ausführung — mit Haken: Kette + Kreditoren + Plan-Termine weg;
//      ohne Haken: alles bleibt, nur die Bezüge sind gelöst. Zeit-Termine,
//      Regierapporte und Serviceaufträge werden NIE gelöscht.
//   E) Kein Geister-Datensatz durch den offenen Auto-Save.
// Ausführen: CHROME=<chromium> node scripts/erp_loeschen_test.mjs
import { readFileSync } from 'fs';
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage, ROOT } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

// ─────────────────────────────────────────────────────────────
console.log('■ A) Statisch: kein Entwurf-Gate mehr');
const ERP = readFileSync(ROOT + '/pm_erp.html', 'utf8');
{
  ok(/if\(erpCanEdit\(\)\)ft\+='<button class="btn red" onclick="erpLoeschen\(\)">/.test(ERP),
    'Editor-Knopf hängt nur noch am Schreibrecht');
  ok(!/editable&&d\.status==='entwurf'\|\|d\.typ==='offerte'&&d\.status==='entwurf'/.test(ERP),
    'altes Entwurf-Gate am Editor-Knopf ist weg');
  ok(/if\(canEdit\)\{\s*\/\/ immer löschbar/.test(ERP),
    'Kontextmenü: Löschen ohne Status-Bedingung');
  ok(!/if\(canEdit&&d\.status==='entwurf'\)\{/.test(ERP),
    'altes Entwurf-Gate im Kontextmenü ist weg');
  ok(/function erpSaveAbbrechen\(\)/.test(ERP) && /erpSaveAbbrechen\(\);\s*\n\s*erpLoeschAusfuehren/.test(ERP),
    'ausstehender Auto-Save wird VOR dem Löschen verworfen (kein Geister-Datensatz)');
  ok(/GemaSync\.deleteRecord\(p\.modul,p\.prefix\+id\)/.test(ERP)
     && /GemaSync\.saveRecord\(p\.modul,p\.prefix\+rec\.id,rec\)/.test(ERP)
     && !/GemaSync\.persistCollection/.test(ERP),
    'Fremd-Pools nur per saveRecord/deleteRecord (nie persistCollection — Pools sind cross-org)');
}

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

// Testbestand: Offerte → Auftrag → Rechnung, plus alles, was daran hängen kann.
const BESTAND = `
  var DOK=[
    {id:'d_off',typ:'offerte',nr:'OF-1',orgId:'org_test',status:'versendet',titel:'S',datum:'2026-03-01',
     positionen:[{id:'p1',art:'frei',bez:'A',menge:1,einheit:'pausch.',ep:1000}],verknuepfung:{auftragId:'d_auf'},zahlungen:[],mwstPct:8.1},
    {id:'d_auf',typ:'auftrag',nr:'AU-1',orgId:'org_test',status:'in_arbeit',titel:'S',datum:'2026-03-05',
     positionen:[{id:'p1',art:'frei',bez:'A',menge:1,einheit:'pausch.',ep:1000}],verknuepfung:{offerteId:'d_off'},zahlungen:[],mwstPct:8.1},
    {id:'d_re',typ:'rechnung',nr:'RE-1',orgId:'org_test',status:'gestellt',rechnungsArt:'schluss',titel:'S',
     datum:'2026-04-01',frist:'2026-05-01',positionen:[{id:'p1',art:'frei',bez:'A',menge:1,einheit:'pausch.',ep:1000}],
     verknuepfung:{auftragId:'d_auf',offerteId:'d_off'},zahlungen:[],mwstPct:8.1}];
  DOK.forEach(function(d){poolSave(DOK_POOL,DOK_PREFIX,d);});
  poolSave(KRED_POOL,KRED_PREFIX,{id:'k_1',orgId:'org_test',lieferant:'Sanitas AG',rechnungsNr:'L-99',
     betrag:500,datum:'2026-03-20',auftragId:'d_auf',status:'offen'});
  erpFremdSave(ERP_FREMD.einsatz,{id:'ev_plan',orgId:'org_test',typ:'auftrag',auftragId:'d_auf',
     datum:'2026-03-10',monteurName:'Hans Plan',titel:'Montage'});
  erpFremdSave(ERP_FREMD.einsatz,{id:'ev_zeit',orgId:'org_test',typ:'auftrag',auftragId:'d_auf',
     datum:'2026-03-11',monteurName:'Peter Zeit',titel:'Montage 2'});
  erpFremdSave(ERP_FREMD.std,{id:'std_1',orgId:'org_test',userId:'u_m',userName:'Peter Zeit',datum:'2026-03-11',
     eintraege:[{id:'e1',von:'08:00',bis:'12:00',pauseMin:0,einsatzId:'ev_zeit'}]});
  erpFremdSave(ERP_FREMD.std,{id:'std_2',orgId:'org_test',userId:'u_m',userName:'Peter Zeit',datum:'2026-03-12',
     eintraege:[],terminAbschluss:{ev_x:{status:'offerte',offerteId:'d_off',offerteNr:'OF-1'}}});
  erpFremdSave(ERP_FREMD.regie,{id:'r_1',orgId:'org_test',nr:'R-001',status:'ausgewiesen',verrechnetIn:'RE-1'});
  erpFremdSave(ERP_FREMD.svauf,{id:'sv_1',orgId:'org_test',anlageName:'Boiler',faelligAm:'2026-03-01',
     status:'verrechnet',rechnungId:'d_re'});
`;

// Frische Seite mit vollem Testbestand (jeder Fall isoliert — ein Löschvorgang
// verändert den Bestand, gemeinsame Seiten würden die Fälle koppeln).
async function frisch() {
  const { ctx, page } = await newPage(browser, seed(['role_planer']));
  await page.goto(BASE + '/pm_erp.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof erpLoeschScan === 'function' && typeof erpFremdSave === 'function', null, { timeout: 12000 });
  await page.waitForTimeout(700);        // Cloud-Pull (mockt []) abwarten, sonst leert er den Pool
  await page.evaluate(BESTAND);
  return { ctx, page };
}
const lies = page => page.evaluate(() => ({
  docs: poolRead(DOK_POOL).map(x => x.nr).sort(),
  vkOff: JSON.stringify((poolRead(DOK_POOL).find(x => x.id === 'd_off') || {}).verknuepfung || null),
  vkRe: JSON.stringify((poolRead(DOK_POOL).find(x => x.id === 'd_re') || {}).verknuepfung || null),
  kreds: poolRead(KRED_POOL).map(x => x.id + '/' + (x.auftragId || '')),
  termine: poolRead(ERP_FREMD.einsatz.key).map(x => x.id + '/' + (x.auftragId || '')),
  regie: poolRead(ERP_FREMD.regie.key).map(x => x.nr + '/' + (x.verrechnetIn || '')),
  svauf: poolRead(ERP_FREMD.svauf.key).map(x => x.id + '/' + x.status + '/' + (x.rechnungId || '')),
  abschluss: JSON.stringify((poolRead(ERP_FREMD.std.key).find(x => x.id === 'std_2') || {}).terminAbschluss || null)
}));

// ─────────────────────────────────────────────────────────────
console.log('■ B) Scan: findet alles — und hängt am Haken');
{
  const { ctx, page } = await frisch();
  const r = await page.evaluate(() => {
    const auf = poolRead(DOK_POOL).find(x => x.id === 'd_auf');
    const re = poolRead(DOK_POOL).find(x => x.id === 'd_re');
    const kurz = s => ({
      folge: s.folge.map(x => x.nr), kreds: s.kreds.length,
      plan: s.terminePlan.map(x => x.id), zeit: s.termineZeit.map(x => x.id),
      regie: s.regie.map(x => x.nr), svauf: s.svauf.length, vor: s.vor.map(x => x.nr),
      abschluss: s.stdTage.length, anzL: s.anzLoeschbar,
      gruppen: s.gruppen.map(g => g.titel + '|' + g.art)
    });
    return { aufMit: kurz(erpLoeschScan(auf, true)), aufOhne: kurz(erpLoeschScan(auf, false)), re: kurz(erpLoeschScan(re, true)) };
  });
  ok(r.aufMit.folge.join() === 'RE-1', 'Auftrag: nachgelagerte Rechnung gefunden');
  ok(r.aufMit.vor.join() === 'OF-1', 'Auftrag: vorgelagerte Offerte gefunden (wird nur entkoppelt)');
  ok(r.aufMit.kreds === 1, 'Kreditor am Auftrag gefunden');
  ok(r.aufMit.plan.join() === 'ev_plan', 'Termin OHNE erfasste Zeit → löschbar');
  ok(r.aufMit.zeit.join() === 'ev_zeit', 'Termin MIT erfasster Zeit → nur entkoppeln');
  ok(r.aufMit.regie.join() === 'R-001', 'Regierapport über die Rechnungs-NUMMER gefunden');
  ok(r.aufMit.svauf === 1, 'Serviceauftrag an der Rechnung gefunden');
  ok(r.aufMit.anzL === 3, 'löschbar = Rechnung + Kreditor + Plan-Termin');
  ok(r.aufMit.gruppen.join(' ') ===
     'Belege der Kette|loeschen Kreditoren|loeschen Termine ohne erfasste Zeit|loeschen '
     + 'Termine mit erfasster Arbeitszeit|entkoppeln Regierapporte|entkoppeln '
     + 'Serviceaufträge|entkoppeln Vorgelagerte Offerte|entkoppeln',
    'Gruppen korrekt in löschbar/entkoppeln getrennt');
  ok(r.aufOhne.regie.length === 0 && r.aufOhne.svauf === 0,
    'OHNE Haken: was an der überlebenden Rechnung hängt, wird NICHT entkoppelt');
  ok(r.aufOhne.folge.join() === 'RE-1' && r.aufOhne.vor.join() === 'OF-1',
    'OHNE Haken: Kette + Offerte bleiben in der Auflistung (Bezug wird gelöst)');
  ok(r.re.abschluss === 0 && r.re.folge.length === 0, 'Rechnung: keine nachgelagerten Belege');
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────
console.log('■ C) Dialog: Auflistung, Checkbox an, Knopf mit Zahl');
{
  const { ctx, page } = await frisch();
  await page.evaluate(() => erpOpen('d_auf'));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => [...document.querySelectorAll('#edFt button')].some(b => b.textContent.trim() === '🗑')),
    'Lösch-Knopf im Editor sichtbar, obwohl Status «In Arbeit» (nicht Entwurf)');
  await page.click('#edFt button:text-is("🗑")');
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => {
    const bg = document.querySelector('.gema-dlg-bg'); if (!bg) return null;
    const cb = bg.querySelector('input[type=checkbox]');
    return { txt: bg.querySelector('.gema-dlg-msg').innerText, knopf: bg.querySelector('[data-act=ok]').textContent, cb: !!cb, an: cb && cb.checked };
  });
  ok(!!d, 'Bestätigungs-Dialog erscheint');
  ok(d.cb && d.an === true, 'Checkbox vorhanden und standardmässig AKTIVIERT');
  ok(/Verknüpfte Daten mitlöschen \(3\)/.test(d.txt), 'Checkbox nennt die Zahl der mitzulöschenden Datensätze');
  ok(d.knopf === 'Löschen (4 Datensätze)', 'Bestätigen-Knopf nennt die Gesamtzahl');
  ok(/RE-1/.test(d.txt) && /Sanitas AG/.test(d.txt) && /Hans Plan/.test(d.txt), 'Auflistung nennt Rechnung, Kreditor, Plan-Termin');
  ok(/lohnrelevant/.test(d.txt) && /Peter Zeit/.test(d.txt), 'Zeit-Termin wird als «bleibt bestehen» ausgewiesen');
  ok(/R-001/.test(d.txt) && /wieder verrechenbar/.test(d.txt), 'Regierapport mit Begründung gelistet');
  ok(/OF-1/.test(d.txt) && /verliert nur den Verweis/.test(d.txt), 'vorgelagerte Offerte als «bleibt bestehen» gelistet');
  // Umschalten rechnet die Vorschau neu
  await page.click('.gema-dlg-bg input[type=checkbox]');
  await page.waitForTimeout(300);
  const d2 = await page.evaluate(() => ({
    txt: document.querySelector('.gema-dlg-msg').innerText,
    knopf: document.querySelector('.gema-dlg-bg [data-act=ok]').textContent
  }));
  ok(d2.knopf === 'Löschen', 'ohne Haken nennt der Knopf keine Zusatz-Zahl mehr');
  ok(!/Regierapporte/.test(d2.txt) && /bleiben bestehen, Bezug wird entfernt/.test(d2.txt),
    'ohne Haken verschwindet der Regierapport aus der Liste (die Rechnung bleibt ja)');
  await page.click('.gema-dlg-bg [data-act=cancel]');
  await page.waitForTimeout(300);
  const nach = await lies(page);
  ok(nach.docs.join() === 'AU-1,OF-1,RE-1', 'Abbrechen löscht nichts');
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────
console.log('■ D1) Ausführung MIT Haken');
{
  const { ctx, page } = await frisch();
  await page.evaluate(() => erpOpen('d_auf'));
  await page.waitForTimeout(300);
  await page.click('#edFt button:text-is("🗑")');
  await page.waitForTimeout(400);
  await page.click('.gema-dlg-bg [data-act=ok]');
  await page.waitForTimeout(800);
  const n = await lies(page);
  ok(n.docs.join() === 'OF-1', 'Auftrag UND nachgelagerte Rechnung gelöscht, Offerte bleibt');
  ok(n.vkOff === '{}', 'Offerte verliert den Verweis auf den gelöschten Auftrag');
  ok(n.kreds.length === 0, 'Kreditor mitgelöscht');
  ok(n.termine.join() === 'ev_zeit/', 'Plan-Termin gelöscht, Zeit-Termin bleibt (entkoppelt)');
  ok(n.regie.join() === 'R-001/', 'Regierapport bleibt und ist wieder verrechenbar');
  ok(n.svauf.join() === 'sv_1/erledigt/', 'Serviceauftrag bleibt und geht zurück auf «erledigt»');
  await ctx.close();
}

console.log('■ D2) Ausführung OHNE Haken — nichts geht verloren');
{
  const { ctx, page } = await frisch();
  await page.evaluate(() => erpOpen('d_auf'));
  await page.waitForTimeout(300);
  await page.click('#edFt button:text-is("🗑")');
  await page.waitForTimeout(400);
  await page.click('.gema-dlg-bg input[type=checkbox]');
  await page.waitForTimeout(300);
  await page.click('.gema-dlg-bg [data-act=ok]');
  await page.waitForTimeout(800);
  const n = await lies(page);
  ok(n.docs.join() === 'OF-1,RE-1', 'nur der Auftrag ist weg');
  ok(n.vkOff === '{}' && !/auftragId/.test(n.vkRe), 'tote Verweise auf den Auftrag sind gelöst');
  ok(/offerteId/.test(n.vkRe), 'die Rechnung behält ihren Bezug zur weiterhin bestehenden Offerte');
  ok(n.kreds.join() === 'k_1/', 'Kreditor bleibt, nur ohne Auftrags-Zuteilung');
  ok(n.termine.join() === 'ev_plan/,ev_zeit/', 'beide Termine bleiben, nur entkoppelt');
  ok(n.regie.join() === 'R-001/RE-1', 'Regierapport bleibt VERRECHNET — die Rechnung existiert ja noch');
  ok(n.svauf.join() === 'sv_1/verrechnet/d_re', 'Serviceauftrag unangetastet — seine Rechnung lebt');
  await ctx.close();
}

console.log('■ D3) Offerte löschen: volle Kaskade + Abschlussmeldung');
{
  const { ctx, page } = await frisch();
  await page.evaluate(() => erpOpen('d_off'));
  await page.waitForTimeout(300);
  const vor = await page.evaluate(() => {
    const s = erpLoeschScan(poolRead(DOK_POOL).find(x => x.id === 'd_off'), true);
    return { folge: s.folge.map(x => x.nr).sort(), abschluss: s.stdTage.length, anzL: s.anzLoeschbar };
  });
  ok(vor.folge.join() === 'AU-1,RE-1', 'Offerte: Auftrag UND dessen Rechnung als nachgelagert erkannt');
  ok(vor.abschluss === 1, 'Abschlussmeldung der Stundenerfassung gefunden');
  await page.click('#edFt button:text-is("🗑")');
  await page.waitForTimeout(400);
  await page.click('.gema-dlg-bg [data-act=ok]');
  await page.waitForTimeout(900);
  const n = await lies(page);
  ok(n.docs.length === 0, 'ganze Kette gelöscht');
  ok(n.abschluss === '{"ev_x":{"status":"offerte"}}', 'Abschlussmeldung bleibt, nur der Offert-Verweis ist weg');
  ok(n.termine.join() === 'ev_zeit/', 'Zeit-Termin überlebt auch die volle Kaskade');
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────
console.log('■ E) Kein Geister-Datensatz durch den offenen Auto-Save');
{
  const { ctx, page } = await frisch();
  await page.evaluate(() => erpOpen('d_re'));
  await page.waitForTimeout(300);
  // Änderung machen → Debounce läuft (1.2 s), sofort löschen
  await page.evaluate(() => { cur.titel = 'Frisch getippt'; erpTouch(); });
  // KEIN Rückgabewert — erpLoeschen() liefert die Dialog-Promise, auf die
  // page.evaluate sonst wartet (der Dialog ist noch offen → Hänger).
  await page.evaluate(() => { erpLoeschen(); });
  await page.waitForTimeout(300);
  await page.click('.gema-dlg-bg [data-act=ok]');
  await page.waitForTimeout(2200);        // länger als der Save-Debounce
  const n = await lies(page);
  ok(n.docs.join() === 'AU-1,OF-1', 'gelöschter Beleg kommt durch den offenen Auto-Save NICHT zurück');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + (fail ? '✗ ' + fail + ' FEHLER' : '✓ alles grün') + ' — ' + pass + ' Checks bestanden');
process.exit(fail ? 1 : 0);
