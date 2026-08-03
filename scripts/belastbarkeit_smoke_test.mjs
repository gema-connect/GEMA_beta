/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test el_belastbarkeit (Browser)
   ════════════════════════════════════════════════════════════════════════
   Prüft, was der Engine-Test NICHT kann: dass die Seite bootet, dass die
   Oberfläche die Rechenkette wirklich anzeigt, dass die Eingaben einen
   Reload überleben (AutoSave) und dass der Zugriffsschutz greift.

     A  Boot ohne pageerrors, Aufbau, Selects gefüllt
     B  Rechenkette in der Anzeige (Referenzfall von Hand nachgerechnet)
     C  Nachweis-Ampel: LS-Schalter ⇄ gG-Sicherung
     D  Grenzfälle erscheinen als Meldung (kein stiller Deckel)
     E  Kabelwahl-Tabelle
     F  Persistenz über Reload (AutoSave) + Fold NICHT im Snapshot
     G  Kein Zugriff für role_monteur

   AUSFÜHREN
     CHROME=/opt/pw-browsers/chromium node scripts/belastbarkeit_smoke_test.mjs
   Ohne playwright-core/Chromium bricht der Test mit Hinweis ab — nie still.
   ════════════════════════════════════════════════════════════════════════ */
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let pw = null;
try { pw = await import('playwright-core'); }
catch {
  console.log('⚠ playwright-core fehlt — Test NICHT gelaufen.');
  console.log('  npm i --no-save playwright-core   (danach: rm -rf node_modules)');
  process.exit(1);
}

const { startServer, wireRoutes, seed, BASE } = await import('./rolematrix_harness.mjs');
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const nah = (a, b, eps, m) => ok(Math.abs(a - b) <= eps, `${m} (ist ${a}, erwartet ${b} ±${eps})`);

const server  = await startServer();
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await wireRoutes(ctx);
  const st = seed(roleIds || ['role_elektro_planer'], opts);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_belastbarkeit.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { ctx, page, fehler };
}

/* Eingaben setzen und die Neuberechnung abwarten. */
async function setze(page, werte) {
  for (const [id, wert] of Object.entries(werte)) {
    const tag = await page.$eval('#' + id, e => e.tagName);
    if (tag === 'SELECT') await page.selectOption('#' + id, String(wert));
    else await page.fill('#' + id, String(wert));
  }
  await page.waitForTimeout(200);
}
const txt = (page, id) => page.textContent('#' + id).then(t => (t || '').trim());
/* Anzeigetext → Zahl (GEMA-Format: Apostroph als Tausendertrennzeichen). */
const zahl = async (page, id) => parseFloat((await txt(page, id)).replace(/['’\s]/g, '').replace(',', '.'));

/* ═══ A — Boot ═════════════════════════════════════════════════════════ */
console.log('── A: Boot & Aufbau ──');
{
  const { ctx, page, fehler } = await oeffne();
  ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
  ok(await page.locator('.gema-hero-title').count() === 1, 'Hero vorhanden');
  ok(await page.locator('.el-card').count() === 4, '4 Schritt-Karten (Eingabe/Berechnung/Ergebnis/Kabelwahl)');
  ok(await page.locator('#metaObjektDropdown').count() === 1, 'Objekt-Bezug vorhanden');
  ok(await page.locator('.el-stub').count() === 0, 'Gerüst-Banner ist entfernt');

  /* Selects sind aus der Fachbasis gefüllt — nicht hart im Markup. */
  ok(await page.locator('#bl_typ option').count() === 3, 'Kabeltyp-Select: 3 Typen');
  ok(await page.locator('#bl_verlegeart option').count() === 2, 'Verlegeart-Select: E und F');
  ok(await page.locator('#bl_q option').count() === 10, 'Querschnitt-Select: 10 Werte (25–300)');
  ok(await page.locator('#bl_in option').count() === 19, 'Nennstrom-Select: automatisch + 18 Nennströme');
  /* Der «mehr als 4»-Eintrag muss wählbar sein — sonst liesse sich der
     Grenzfall gar nicht erreichen und die Meldung wäre toter Code. */
  ok(await page.locator('#bl_nhaeuf option').count() === 5, 'Häufung: 1–4 plus «kein Faktor hinterlegt»');

  /* Kein type="number" — GEMA-Kanon für Zahlenfelder. */
  ok(await page.locator('input[type="number"]').count() === 0, 'kein type="number" auf der Seite');
  ok(await page.locator('#bl_tempU').getAttribute('inputmode') === 'decimal', 'Temperaturfeld inputmode=decimal');
  ok(await page.locator('#bl_ib').getAttribute('inputmode') === 'decimal', 'IB-Feld inputmode=decimal');

  /* Die Formel-Chips müssen dem Code entsprechen (GEMA-Kanon). */
  const chips = await page.$$eval('.frml', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));
  ok(chips.some(c => /f.*=.*√/.test(c)), 'Formel-Chip für f_θ vorhanden');
  ok(chips.some(c => /I.*z.*=.*I.*z,30.*·.*f.*·.*f/.test(c.replace(/\s/g, ''))
                  || /Iz,30·fθ·fh/.test(c.replace(/\s/g, ''))), 'Formel-Chip für Iz vorhanden');
  ok(chips.some(c => /1\.45/.test(c)), 'Formel-Chip für Bedingung 2 nennt den Faktor 1.45');

  /* .el-res-lbl ist ein Flex-Container mit gap — ein <sub> als DIREKTES Kind
     würde zur eigenen Spalte und erschiene als «I  z,30». Der Text muss
     deshalb in einem <span> stecken. */
  ok(await page.locator('.el-res-lbl > sub').count() === 0,
     'kein <sub> als direktes Flex-Kind von .el-res-lbl (sonst Lücke im Formelzeichen)');
  const lueckeOk = await page.$$eval('.el-res-lbl', ls => ls.every(l => {
    for (const n of l.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) return false;  // nackter Textknoten
    }
    return true;
  }));
  ok(lueckeOk, 'jede Ergebnis-Beschriftung liegt in einem eigenen Element');
  await ctx.close();
}

/* ═══ B — Rechenkette in der Anzeige ═══════════════════════════════════ */
console.log('── B: Rechenkette ──');
{
  const { ctx, page } = await oeffne();
  /* Referenz von Hand: XLPE · Verlegeart F · 95 mm² = 328 A
     θu 40 °C → f_θ = √(50/60) = 0.9129 · 2 Kreise → f_h = 0.90
     Iz = 328 · 0.9129 · 0.90 = 269.5 A · n_par 1 ⇒ Iz,ges = 269.5 A */
  await setze(page, { bl_typ:'xlpe', bl_verlegeart:'F', bl_q:'95', bl_npar:'1',
                      bl_nhaeuf:'2', bl_tempU:'40', bl_ib:'' });
  nah(await zahl(page, 'bl_iz0'), 328, 0.01, 'Tabellenwert 328 A angezeigt');
  nah(await zahl(page, 'bl_ftemp'), 0.913, 0.001, 'f_θ = 0.913 angezeigt');
  nah(await zahl(page, 'bl_fhaeuf'), 0.90, 0.001, 'f_h = 0.90 angezeigt');
  nah(await zahl(page, 'bl_izKreis'), 269.5, 0.1, 'Iz je Kreis = 269.5 A');
  nah(await zahl(page, 'bl_izGes'), 269.5, 0.1, 'Iz gesamt = 269.5 A');
  ok((await txt(page, 'bl_status')).indexOf('Betriebsstrom') >= 0,
     'ohne IB: Hinweis auf den fehlenden Nachweis statt grünem Haken');
  ok((await page.getAttribute('#bl_status', 'class')).indexOf('info') >= 0,
     'ohne IB: neutrale (blaue) Statusfarbe, nicht grün');

  /* Parallele Leiter verdoppeln Iz,ges — und heben die Häufung mit an. */
  await setze(page, { bl_npar:'2' });
  nah(await zahl(page, 'bl_izGes'), 539.0, 0.2, '2 parallele Leiter → Iz,ges verdoppelt');

  /* Temperatur zurück auf 30 °C: f_θ = 1, Iz = Tabellenwert */
  await setze(page, { bl_npar:'1', bl_nhaeuf:'1', bl_tempU:'30' });
  nah(await zahl(page, 'bl_ftemp'), 1.0, 0.001, 'bei 30 °C ist f_θ = 1');
  nah(await zahl(page, 'bl_izGes'), 328, 0.01, 'bei 30 °C / 1 Kreis = Tabellenwert');
  await ctx.close();
}

/* ═══ C — Nachweis-Ampel ══════════════════════════════════════════════ */
console.log('── C: Nachweis LS ⇄ gG ──');
{
  const { ctx, page } = await oeffne();
  /* 70 mm² XLPE F = 268 A · IB 250 A · In automatisch 250 A
     LS-Schalter: I2 = 1.45·250 = 362.5 ≤ 1.45·268 = 388.6 → erfüllt
     gG-Sicherung: I2 = 1.6·250 = 400   > 388.6            → verletzt  */
  await setze(page, { bl_typ:'xlpe', bl_verlegeart:'F', bl_q:'70', bl_npar:'1',
                      bl_nhaeuf:'1', bl_tempU:'30', bl_ib:'250',
                      bl_schutz:'ls', bl_in:'auto' });
  ok((await txt(page, 'bl_inNenn')).indexOf('250') >= 0, 'In automatisch = 250 A');
  ok(await page.getAttribute('#bl_m1', 'class') === 'bl-mark ok', 'LS: Bedingung 1 grün');
  ok(await page.getAttribute('#bl_m2', 'class') === 'bl-mark ok', 'LS: Bedingung 2 grün');
  nah(await zahl(page, 'bl_auslastung'), 93.3, 0.1, 'Auslastung 93.3 %');
  ok((await page.getAttribute('#bl_status', 'class')).indexOf('warn') >= 0,
     'LS bei 93 % Auslastung: amber (zulässig, aber ohne Reserve)');

  await setze(page, { bl_schutz:'gg' });
  ok(await page.getAttribute('#bl_m1', 'class') === 'bl-mark ok', 'gG: Bedingung 1 weiterhin grün');
  ok(await page.getAttribute('#bl_m2', 'class') === 'bl-mark err', 'gG: Bedingung 2 ROT — I2 = 1.6·In');
  ok((await page.getAttribute('#bl_status', 'class')).indexOf('err') >= 0, 'gG: Status rot');
  ok((await page.textContent('#bl_meldungen')).indexOf('Bedingung 2') >= 0,
     'gG: Verletzung steht als Meldung da');
  ok((await txt(page, 'bl_vorschlag')).indexOf('95') >= 0,
     'gG: Vorschlag springt auf 95 mm² (Bedingung 2 mitgerechnet)');
  ok((await txt(page, 'bl_sum3')).indexOf('nicht erfüllt') >= 0, 'Kennzahlen-Leiste meldet den Fehlschlag');
  await ctx.close();
}

/* ═══ D — Grenzfälle ══════════════════════════════════════════════════ */
console.log('── D: Grenzfälle werden sichtbar ──');
{
  const { ctx, page } = await oeffne();
  await setze(page, { bl_typ:'xlpe', bl_verlegeart:'F', bl_q:'95', bl_tempU:'30', bl_ib:'250' });

  /* Häufung über 4: kein Faktor hinterlegt → Meldung, KEIN Rückfall auf 1.00 */
  await setze(page, { bl_nhaeuf:'5' });
  ok((await txt(page, 'bl_izGes')) === '—', 'Häufung 5: kein Iz-Wert angezeigt');
  ok((await txt(page, 'bl_fhaeuf')).indexOf('nicht hinterlegt') >= 0, 'Häufung 5: Faktor als «nicht hinterlegt»');
  const m5 = await page.textContent('#bl_meldungen');
  ok(m5.indexOf('1.00') >= 0 && m5.indexOf('4 Kreise') >= 0,
     'Häufung 5: Meldung begründet, warum nicht auf 1.00 zurückgefallen wird');
  ok(await page.locator('#bl_meldungen .m.err').count() >= 1, 'Häufung 5: als Fehler markiert');

  /* Umgebung über der zulässigen Leitertemperatur */
  await setze(page, { bl_nhaeuf:'1', bl_typ:'pvc', bl_tempU:'75' });
  ok((await page.textContent('#bl_meldungen')).indexOf('nicht belastet') >= 0,
     'θu über θmax: klare Meldung');
  ok((await page.getAttribute('#bl_status', 'class')).indexOf('err') >= 0, 'θu über θmax: Status rot');

  /* Randbereich der Temperaturtabelle: gerechnet, aber ausgewiesen */
  await setze(page, { bl_tempU:'60' });
  ok((await page.textContent('#bl_meldungen')).indexOf('55 °C') >= 0,
     'PVC über 55 °C: Randbereich wird gemeldet');
  ok(await zahl(page, 'bl_izGes') > 0, 'Randbereich: es wird trotzdem gerechnet');

  /* NIN 5.2.3.7 — Parallelschaltung unter 70 mm² */
  await setze(page, { bl_typ:'xlpe', bl_tempU:'30', bl_q:'50', bl_npar:'2', bl_nhaeuf:'2' });
  ok((await page.textContent('#bl_meldungen')).indexOf('5.2.3.7') >= 0,
     'Parallel mit 50 mm²: NIN 5.2.3.7 wird gemeldet');
  await ctx.close();
}

/* ═══ E — Kabelwahl-Tabelle ═══════════════════════════════════════════ */
console.log('── E: Kabelwahl-Tabelle ──');
{
  const { ctx, page } = await oeffne();
  await setze(page, { bl_typ:'xlpe', bl_verlegeart:'F', bl_q:'95', bl_npar:'1',
                      bl_nhaeuf:'1', bl_tempU:'30', bl_ib:'250', bl_schutz:'ls', bl_in:'auto' });
  ok(await page.locator('#bl_tblBody tr').count() === 10, 'Tabelle: 10 Zeilen');
  ok(await page.locator('#bl_tblBody tr.bl-akt').count() === 1, 'gewählter Querschnitt markiert');
  ok((await page.textContent('#bl_tblBody tr.bl-akt')).indexOf('95') >= 0, 'markiert ist 95 mm²');
  ok(await page.locator('#bl_tblBody tr.bl-vor').count() === 1, 'kleinster ausreichender markiert');
  ok((await page.textContent('#bl_tblBody tr.bl-vor')).indexOf('70') >= 0, 'kleinster ausreichender = 70 mm²');
  ok(await page.locator('#bl_tblBody .bl-ja').count() >= 4, 'passende Querschnitte als «passt» markiert');

  /* Ohne Nennstrom bleibt die Nachweis-Spalte leer statt grün. */
  await setze(page, { bl_ib:'' });
  ok(await page.locator('#bl_tblBody .bl-ja').count() === 0,
     'ohne IB: keine Zeile wird als «passt» ausgegeben');
  await ctx.close();
}

/* ═══ F — Persistenz über Reload ══════════════════════════════════════ */
console.log('── F: Persistenz (AutoSave) ──');
{
  const { ctx, page } = await oeffne();
  await setze(page, { bl_typ:'pvc', bl_verlegeart:'E', bl_q:'150', bl_npar:'2',
                      bl_nhaeuf:'3', bl_tempU:'42', bl_ib:'275',
                      bl_schutz:'gg', bl_in:'315' });
  const vorher = await txt(page, 'bl_izGes');
  await page.waitForTimeout(5400);   // AutoSave-Debounce (5 s) abwarten
  const gespeichert = await page.evaluate(() => localStorage.getItem('gema_belastbarkeit'));
  ok(!!gespeichert && gespeichert.indexOf('bl_q') >= 0, 'AutoSave hat den Stand geschrieben');

  /* Fold-Zustand ist Geräte-UI und darf NICHT im Snapshot landen. */
  await page.locator('.el-card .el-card-hd').first().click();
  await page.waitForTimeout(200);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  ok(await page.inputValue('#bl_typ') === 'pvc', 'Reload: Kabeltyp erhalten');
  ok(await page.inputValue('#bl_verlegeart') === 'E', 'Reload: Verlegeart erhalten');
  ok(await page.inputValue('#bl_q') === '150', 'Reload: Querschnitt erhalten');
  ok(await page.inputValue('#bl_npar') === '2', 'Reload: parallele Leiter erhalten');
  ok(await page.inputValue('#bl_nhaeuf') === '3', 'Reload: Häufung erhalten');
  ok(await page.inputValue('#bl_tempU') === '42', 'Reload: Umgebungstemperatur erhalten');
  ok(await page.inputValue('#bl_ib') === '275', 'Reload: Betriebsstrom erhalten');
  ok(await page.inputValue('#bl_schutz') === 'gg', 'Reload: Schutzeinrichtung erhalten');
  ok(await page.inputValue('#bl_in') === '315', 'Reload: Nennstrom erhalten');
  ok(await txt(page, 'bl_izGes') === vorher, 'Reload: Ergebnis identisch nachgerechnet (' + vorher + ')');
  ok(vorher !== '—', 'Reload-Referenzwert war überhaupt ein Ergebnis');

  ok(await page.locator('.el-card.zu').count() === 1, 'Reload: Fold-Zustand erhalten');
  const snap = await page.evaluate(() => localStorage.getItem('gema_belastbarkeit'));
  ok(!snap || snap.indexOf('fold') < 0, 'Fold-Zustand NICHT im AutoSave-Snapshot');
  const fold = await page.evaluate(() => localStorage.getItem('gema_el_fold_v1'));
  ok(!!fold && fold.indexOf('el_belastbarkeit') >= 0, 'Fold-Zustand in gema_el_fold_v1 (Geräte-UI)');
  await ctx.close();
}

/* Komma-Eingabe darf die Rechnung nicht zerschiessen (CH-Schreibweise). */
{
  const { ctx, page } = await oeffne();
  await setze(page, { bl_typ:'xlpe', bl_verlegeart:'F', bl_q:'95', bl_nhaeuf:'1', bl_tempU:'37,5', bl_ib:'' });
  const izKomma = await zahl(page, 'bl_izGes');
  await page.locator('#bl_tempU').blur();
  await page.waitForTimeout(150);
  ok(await page.inputValue('#bl_tempU') === '37.5', 'fixLeadingZero normalisiert Komma auf Punkt');
  nah(izKomma, 328 * Math.sqrt((90 - 37.5) / 60), 0.2, 'Komma-Eingabe rechnet korrekt');
  await ctx.close();
}

/* ═══ G — Zugriffsschutz ══════════════════════════════════════════════ */
console.log('── G: Zugriffsschutz ──');
{
  const { ctx, page } = await oeffne(['role_monteur']);
  const body = await page.textContent('body');
  ok(/Kein Zugriff/i.test(body || ''), 'Monteur: «Kein Zugriff»');
  ok(await page.locator('#bl_izGes').count() === 0, 'Monteur: Berechnung nicht im DOM');
  await ctx.close();
}
{
  const { ctx, page, fehler } = await oeffne(['role_elektro_planer']);
  ok(fehler.length === 0, 'Elektroplaner: lädt ohne Fehler');
  ok(await page.locator('#bl_izGes').count() === 1, 'Elektroplaner: voller Zugriff');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
