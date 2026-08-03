/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test el_leistungsbedarf (Browser)
   ════════════════════════════════════════════════════════════════════════
   Prüft, was der Engine-Test NICHT kann: Boot, Anzeige der Rechenkette,
   Zeilen-Tabelle ohne Fokusverlust, Persistenz über Reload, Zugriffsschutz.

     A  Boot ohne pageerrors, Aufbau, Selects aus der Fachbasis
     B  Rechenkette in der Anzeige (Referenz von Hand nachgerechnet)
     C  Zeilen-Tabelle: hinzufügen, löschen, Richtwerte, Fokus beim Tippen
     D  Grenzfälle erscheinen als Meldung (kein stiller Deckel)
     E  Umrechnungs-Hilfe (Wechselstrom + Ohmsches Gesetz) inkl. Übernahme
     F  Persistenz über Reload (AutoSave) + Fold NICHT im Snapshot
     G  Kein Zugriff für role_monteur

   AUSFÜHREN
     CHROME=/opt/pw-browsers/chromium node scripts/leistungsbedarf_smoke_test.mjs
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

async function oeffne(roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await wireRoutes(ctx);
  const st = seed(roleIds || ['role_elektro_planer']);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_leistungsbedarf.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  return { ctx, page, fehler };
}

const txt  = (page, id) => page.textContent('#' + id).then(t => (t || '').trim());
const zahl = async (page, id) => parseFloat((await txt(page, id)).replace(/['’\s]/g, '').replace(',', '.'));

/* Zellen einer Zeile der Verbraucher-Tabelle (1-basiert). */
const zelle = (n, spalte) => `#lb_tblBody tr:nth-child(${n}) td:nth-child(${spalte})`;
const SP = { bez:1, kat:2, anzahl:3, p:4, cos:5, phase:6, g:7, pInst:8, pBed:9 };

async function setzeZeile(page, n, werte) {
  for (const [feld, wert] of Object.entries(werte)) {
    const sel = zelle(n, SP[feld]) + (feld === 'kat' || feld === 'phase' ? ' select' : ' input');
    if (feld === 'kat' || feld === 'phase') await page.selectOption(sel, String(wert));
    else await page.fill(sel, String(wert));
  }
  await page.waitForTimeout(180);
}

/* ═══ A — Boot ═════════════════════════════════════════════════════════ */
console.log('── A: Boot & Aufbau ──');
{
  const { ctx, page, fehler } = await oeffne();
  ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
  ok(await page.locator('.gema-hero-title').count() === 1, 'Hero vorhanden');
  ok(await page.locator('.el-card').count() === 4, '4 Schritt-Karten');
  ok(await page.locator('#metaObjektDropdown').count() === 1, 'Objekt-Bezug vorhanden');
  ok(await page.locator('.el-stub').count() === 0, 'Gerüst-Banner ist entfernt');
  ok(await page.locator('#lb_tblBody tr').count() === 1, 'startet mit einer Verbraucher-Zeile');

  /* Selects aus der Fachbasis, nicht hart im Markup */
  ok(await page.locator('#lb_system option').count() === 2, 'Netzsystem: 2 Optionen');
  const katN = await page.locator(zelle(1, SP.kat) + ' select option').count();
  ok(katN >= 12, 'Kategorie-Select aus EL_VERBRAUCHER_KAT (' + katN + ' Einträge)');

  /* GEMA-Kanon für Zahlenfelder */
  ok(await page.locator('input[type="number"]').count() === 0, 'kein type="number" auf der Seite');
  ok(await page.locator('#lb_reserve').getAttribute('inputmode') === 'decimal', 'Reserve-Feld inputmode=decimal');

  /* Herkunft der Werte muss sichtbar sein — Richtwert ≠ Norm */
  const hint = await page.textContent('.el-hint');
  ok(/keine Normvorgaben/i.test(hint || ''), 'Richtwert-Charakter der Kategorien steht im UI');
  ok(/EN 61439-1/.test(await page.textContent('#lb_legende')), 'Normquelle der Gegenprobe benannt');

  /* .el-res-lbl ist ein Flex-Container mit gap — ein <sub> als direktes
     Kind erschiene als «I  B». Der Text muss in einem <span> stecken. */
  ok(await page.locator('.el-res-lbl > sub').count() === 0,
     'kein <sub> als direktes Flex-Kind von .el-res-lbl');
  const lueckeOk = await page.$$eval('.el-res-lbl', ls => ls.every(l =>
    ![...l.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())));
  ok(lueckeOk, 'jede Ergebnis-Beschriftung liegt in einem eigenen Element');
  await ctx.close();
}

/* ═══ B — Rechenkette ══════════════════════════════════════════════════ */
console.log('── B: Rechenkette ──');
{
  const { ctx, page } = await oeffne();
  /* Referenz von Hand (siehe Engine-Test):
     Wärmepumpe 12 kW · cos φ 0.85 · g 1.00 · 3-phasig
     Steckdosen 10 kW · cos φ 0.95 · g 0.30 · 1-phasig
     ⇒ P_inst 22 kW · P_bed 15 kW · S 17.203 kVA · cos φ 0.872
       I_sym 24.83 A · I_worst 34.05 A · I_n 25 A                        */
  await setzeZeile(page, 1, { bez:'Wärmepumpe', kat:'waermepumpe', anzahl:'1', p:'12', cos:'0.85', g:'1', phase:'3' });
  await page.click('.lb-add');
  await page.waitForTimeout(200);
  await setzeZeile(page, 2, { bez:'Steckdosen', kat:'steckdosen', anzahl:'1', p:'10', cos:'0.95', g:'0.3', phase:'1' });

  nah(await zahl(page, 'lb_pInst'), 22, 0.01, 'P installiert = 22 kW');
  nah(await zahl(page, 'lb_pBed'), 15, 0.01, 'P Bedarf = 15 kW');
  nah(await zahl(page, 'lb_qBed'), 8.42, 0.01, 'Q = 8.42 kvar');
  nah(await zahl(page, 'lb_sBed'), 17.20, 0.01, 'S = 17.20 kVA');
  nah(await zahl(page, 'lb_cosRes'), 0.872, 0.001, 'cos φ = 0.872');
  nah(await zahl(page, 'lb_iSym'), 24.8, 0.1, 'I gleichmässig = 24.8 A');
  nah(await zahl(page, 'lb_iWorst'), 34.1, 0.1, 'I ungünstigste Phase = 34.1 A');
  nah(await zahl(page, 'lb_hauptwert'), 24.8, 0.1, 'Bemessungsstrom = 24.8 A');
  nah(await zahl(page, 'lb_inNenn'), 25, 0.01, 'Nennstrom = 25 A');
  nah(await zahl(page, 'lb_sAnschluss'), 17.3, 0.1, 'Anschlussleistung = 17.3 kVA');
  ok((await txt(page, 'lb_gzNorm')).indexOf('0.90') >= 0, 'EN-61439-Gegenprobe für 2 Kreise = 0.90');

  /* Zeilen-Summen in der Tabelle */
  nah(await zahl(page, 'lb_sumInst'), 22, 0.01, 'Fusszeile: Σ P installiert');
  nah(await zahl(page, 'lb_sumBed'), 15, 0.01, 'Fusszeile: Σ P Bedarf');
  ok((await page.textContent(zelle(1, SP.pBed))).indexOf('12.00') >= 0, 'Zeile 1: P Bedarf 12 kW');
  ok((await page.textContent(zelle(2, SP.pBed))).indexOf('3.00') >= 0, 'Zeile 2: P Bedarf 3 kW (10 × 0.3)');

  /* Reserve und Aufteilung wirken */
  await page.fill('#lb_reserve', '20');
  await page.waitForTimeout(200);
  nah(await zahl(page, 'lb_hauptwert'), 29.8, 0.1, '20 % Reserve → 29.8 A');
  nah(await zahl(page, 'lb_inNenn'), 32, 0.01, 'Reserve hebt den Nennstrom auf 32 A');

  await page.fill('#lb_reserve', '0');
  await page.selectOption('#lb_verteilung', 'worst');
  await page.waitForTimeout(200);
  nah(await zahl(page, 'lb_hauptwert'), 34.1, 0.1, 'Vorgabe «ungünstigst» → 34.1 A massgebend');
  nah(await zahl(page, 'lb_inNenn'), 40, 0.01, 'ungünstigste Phase → Nennstrom 40 A');
  await ctx.close();
}

/* ═══ C — Zeilen-Tabelle ═══════════════════════════════════════════════ */
console.log('── C: Verbraucher-Tabelle ──');
{
  const { ctx, page } = await oeffne();
  await page.click('.lb-add');
  await page.click('.lb-add');
  await page.waitForTimeout(200);
  ok(await page.locator('#lb_tblBody tr').count() === 3, '3 Zeilen nach zweimal Hinzufügen');
  await page.click('#lb_tblBody tr:nth-child(2) .lb-del');
  await page.waitForTimeout(200);
  ok(await page.locator('#lb_tblBody tr').count() === 2, 'Zeile gelöscht');
  await page.click('#lb_tblBody tr:nth-child(1) .lb-del');
  await page.click('#lb_tblBody tr:nth-child(1) .lb-del');
  await page.waitForTimeout(200);
  ok(await page.locator('#lb_tblBody tr').count() === 1, 'letzte Zeile bleibt stehen (nie leere Tabelle)');

  /* Leere cos-φ-/g-Felder zeigen den Kategorie-Richtwert als Platzhalter */
  await setzeZeile(page, 1, { kat:'steckdosen', anzahl:'1', p:'10' });
  const phCos = await page.getAttribute(zelle(1, SP.cos) + ' input', 'placeholder');
  const phG   = await page.getAttribute(zelle(1, SP.g)   + ' input', 'placeholder');
  ok(phCos === '0.95', 'cos-φ-Platzhalter = Richtwert der Kategorie');
  ok(phG === '0.30', 'g-Platzhalter = Richtwert der Kategorie');
  nah(await zahl(page, 'lb_pBed'), 3, 0.01, 'leere Felder rechnen mit dem Richtwert (10 × 0.30)');

  /* Kategoriewechsel zieht die übliche Anschlussart nach */
  await page.selectOption(zelle(1, SP.kat) + ' select', 'waermepumpe');
  await page.waitForTimeout(200);
  ok(await page.inputValue(zelle(1, SP.phase) + ' select') === '3',
     'Kategoriewechsel setzt die übliche Anschlussart (Wärmepumpe → 3-phasig)');

  /* FOKUS-REGEL: bei input-Handlern darf die Liste NICHT neu gebaut werden,
     sonst verliert das Feld nach dem ersten Zeichen den Fokus und «10»
     bliebe «1» (GEMA-Regel für Zeilen-Tabellen). */
  const pFeld = zelle(1, SP.p) + ' input';
  await page.click(pFeld);
  await page.fill(pFeld, '');
  await page.type(pFeld, '125', { delay: 60 });
  await page.waitForTimeout(200);
  ok(await page.inputValue(pFeld) === '125', 'Tippen mehrerer Ziffern kommt vollständig an');
  ok(await page.evaluate(s => document.activeElement === document.querySelector(s), pFeld),
     'Fokus bleibt im Feld (Liste wird beim Tippen nicht neu gebaut)');
  await ctx.close();
}

/* ═══ D — Grenzfälle ═══════════════════════════════════════════════════ */
console.log('── D: Grenzfälle werden sichtbar ──');
{
  const { ctx, page } = await oeffne();
  await setzeZeile(page, 1, { kat:'motor', anzahl:'1', p:'10', cos:'0.9', g:'1', phase:'3' });
  await page.click('.lb-add');
  await page.waitForTimeout(200);
  await setzeZeile(page, 2, { kat:'motor', anzahl:'1', p:'99', cos:'1.5', g:'1', phase:'3' });

  nah(await zahl(page, 'lb_pInst'), 10, 0.01, 'ungültige Zeile zählt NICHT in der Summe');
  ok((await page.textContent(zelle(2, SP.pBed))).indexOf('ungültig') >= 0, 'Zeile als ungültig markiert');
  ok((await page.getAttribute('#lb_status', 'class')).indexOf('err') >= 0, 'Status rot');
  ok((await page.textContent('#lb_meldungen')).indexOf('Zeile 2') >= 0, 'Meldung nennt die Zeilennummer');
  ok(await page.locator('#lb_meldungen .m.err').count() >= 1, 'als Fehler markiert');

  /* Nur ungültige Zeilen: P_inst ist 0 — der Status darf trotzdem nicht
     neutral auf «noch nichts erfasst» zurückfallen. */
  await page.click('#lb_tblBody tr:nth-child(1) .lb-del');
  await page.waitForTimeout(250);
  ok((await page.getAttribute('#lb_status', 'class')).indexOf('err') >= 0,
     'nur ungültige Zeilen ⇒ Status bleibt rot, nicht «leer»');

  /* Strom über der Sicherungsreihe */
  await page.click('.lb-add');
  await page.waitForTimeout(200);
  const n = await page.locator('#lb_tblBody tr').count();
  await setzeZeile(page, n, { kat:'elektroheiz', anzahl:'1', p:'300', cos:'1', g:'1', phase:'3' });
  await page.fill(zelle(1, SP.cos) + ' input', '1');
  await page.fill(zelle(1, SP.p) + ' input', '0');
  await page.waitForTimeout(250);
  ok((await txt(page, 'lb_inNenn')).indexOf('über der Reihe') >= 0, 'Nennstrom über der Reihe wird benannt');
  ok((await page.textContent('#lb_meldungen')).indexOf('gesondert auszulegen') >= 0,
     'Hinweis auf gesonderte Auslegung statt leerem Feld');
  await ctx.close();
}
{
  /* Niedriger cos φ → Vorbehalt statt grün */
  const { ctx, page } = await oeffne();
  await setzeZeile(page, 1, { kat:'motor', anzahl:'1', p:'20', cos:'0.75', g:'1', phase:'3' });
  ok((await page.getAttribute('#lb_status', 'class')).indexOf('warn') >= 0, 'cos φ 0.75 → amber');
  ok((await page.textContent('#lb_meldungen')).indexOf('Kompensation') >= 0, 'Kompensation wird angesprochen');
  await ctx.close();
}

/* ═══ E — Umrechnungs-Hilfe ════════════════════════════════════════════ */
console.log('── E: Umrechnungs-Hilfe ──');
{
  const { ctx, page } = await oeffne();
  /* 3-phasig · 400 V · 16 A · cos φ 0.9 ⇒ S 11.09 kVA · P 9.98 kW · φ 25.8° */
  await page.selectOption('#lb_acPh', '3');
  await page.fill('#lb_acU', '400');
  await page.fill('#lb_acI', '16');
  await page.fill('#lb_acCos', '0.9');
  await page.waitForTimeout(200);
  ok((await txt(page, 'lb_acS')).indexOf('11.09') >= 0, 'S = 11.09 kVA');
  ok((await txt(page, 'lb_acP')).indexOf('9.98') >= 0, 'P = 9.98 kW');
  ok((await txt(page, 'lb_acQ')).indexOf('4.83') >= 0, 'Q = 4.83 kvar');
  ok((await txt(page, 'lb_acPhi')).indexOf('25.8') >= 0, 'φ = 25.8°');

  /* Übernahme legt eine Verbraucher-Zeile an */
  const vorher = await page.locator('#lb_tblBody tr').count();
  await page.click('#lb_acUeber');
  await page.waitForTimeout(300);
  ok(await page.locator('#lb_tblBody tr').count() === vorher + 1, 'Übernahme legt eine Zeile an');
  const letzte = await page.locator('#lb_tblBody tr').count();
  const pWert = parseFloat(await page.inputValue(zelle(letzte, SP.p) + ' input'));
  nah(pWert, 9.977, 0.01, 'übernommene Leistung = 9.98 kW');
  ok(await page.inputValue(zelle(letzte, SP.phase) + ' select') === '3', 'Anschlussart übernommen');

  /* cos φ über 1 wird abgewiesen statt P > S zu rechnen */
  await page.fill('#lb_acCos', '1.4');
  await page.waitForTimeout(200);
  ok((await txt(page, 'lb_acS')) === '—', 'cos φ 1.4 → kein Ergebnis');
  ok((await page.textContent('#lb_acMsg')).indexOf('zwischen 0 und 1') >= 0, 'Fehler wird benannt');

  /* Ohmsches Gesetz: U aus I und R, dann Moduswechsel */
  await page.fill('#lb_ohmI', '10');
  await page.fill('#lb_ohmR', '23');
  await page.waitForTimeout(200);
  ok((await txt(page, 'lb_ohmFrml')) === 'U = R · I', 'Formel-Chip zeigt U = R · I');
  ok((await txt(page, 'lb_ohmWert')).indexOf('230.00 V') >= 0, 'U = 230 V');
  const alle = await txt(page, 'lb_ohmAlle');
  ok(/230\.00 V/.test(alle) && /10\.00 A/.test(alle) && /23\.00 Ω/.test(alle) && /2’300\.00 W/.test(alle),
     'vollständiger Satz U·I·R·P mit Apostroph-Tausendern');

  await page.click('.lb-mode[data-ohm="R"]');
  await page.waitForTimeout(200);
  ok((await txt(page, 'lb_ohmFrml')) === 'R = U / I', 'Moduswechsel auf R');
  ok(await page.locator('#lb_ohmU').count() === 1 && await page.locator('#lb_ohmI').count() === 1,
     'Modus R fragt U und I ab');
  await page.fill('#lb_ohmU', '230');
  await page.fill('#lb_ohmI', '10');
  await page.waitForTimeout(200);
  ok((await txt(page, 'lb_ohmWert')).indexOf('23.00 Ω') >= 0, 'R = 23 Ω');

  await page.fill('#lb_ohmI', '0');
  await page.waitForTimeout(200);
  ok((await page.textContent('#lb_ohmMsg')).indexOf('Division durch null') >= 0,
     'I = 0 wird gemeldet statt Unendlich anzuzeigen');
  await ctx.close();
}

/* ═══ F — Persistenz ═══════════════════════════════════════════════════ */
console.log('── F: Persistenz (AutoSave) ──');
{
  const { ctx, page } = await oeffne();
  await setzeZeile(page, 1, { bez:'Küche', kat:'kochherd', anzahl:'2', p:'11', cos:'1', g:'0.7', phase:'3' });
  await page.click('.lb-add');
  await page.waitForTimeout(200);
  await setzeZeile(page, 2, { bez:'Licht', kat:'beleuchtung', anzahl:'1', p:'4', cos:'0.95', g:'1', phase:'1' });
  await page.fill('#lb_reserve', '15');
  await page.selectOption('#lb_verteilung', 'worst');
  await page.click('.lb-mode[data-ohm="P"]');
  await page.waitForTimeout(300);
  const vorher = await txt(page, 'lb_hauptwert');
  ok(vorher !== '—', 'Referenzwert vor dem Reload liegt vor (' + vorher + ')');

  await page.waitForTimeout(5400);   // AutoSave-Debounce (5 s)
  const snap = await page.evaluate(() => localStorage.getItem('gema_leistungsbedarf'));
  ok(!!snap && snap.indexOf('lb_rows') >= 0, 'AutoSave hat den Stand inkl. Zeilen geschrieben');

  /* Fold ist Geräte-UI und darf NICHT im Snapshot landen. */
  await page.locator('.el-card .el-card-hd').first().click();
  await page.waitForTimeout(200);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);

  ok(await page.locator('#lb_tblBody tr').count() === 2, 'Reload: beide Zeilen zurück');
  ok(await page.inputValue(zelle(1, SP.bez) + ' input') === 'Küche', 'Reload: Bezeichnung Zeile 1');
  ok(await page.inputValue(zelle(1, SP.kat) + ' select') === 'kochherd', 'Reload: Kategorie Zeile 1');
  ok(await page.inputValue(zelle(1, SP.anzahl) + ' input') === '2', 'Reload: Anzahl Zeile 1');
  ok(await page.inputValue(zelle(1, SP.p) + ' input') === '11', 'Reload: Leistung Zeile 1');
  ok(await page.inputValue(zelle(1, SP.g) + ' input') === '0.7', 'Reload: Gleichzeitigkeit Zeile 1');
  ok(await page.inputValue(zelle(2, SP.bez) + ' input') === 'Licht', 'Reload: Bezeichnung Zeile 2');
  ok(await page.inputValue(zelle(2, SP.phase) + ' select') === '1', 'Reload: Anschlussart Zeile 2');
  ok(await page.inputValue('#lb_reserve') === '15', 'Reload: Reserve erhalten');
  ok(await page.inputValue('#lb_verteilung') === 'worst', 'Reload: Aufteilung erhalten');
  ok(await page.inputValue('#lb_ohmSel') === 'P', 'Reload: gesuchte Ohm-Grösse erhalten');
  ok((await txt(page, 'lb_ohmFrml')) === 'P = U · I', 'Reload: Ohm-Modus auch in der Anzeige');
  ok(await txt(page, 'lb_hauptwert') === vorher, 'Reload: Ergebnis identisch nachgerechnet');

  ok(await page.locator('.el-card.zu').count() === 1, 'Reload: Fold-Zustand erhalten');
  const snap2 = await page.evaluate(() => localStorage.getItem('gema_leistungsbedarf'));
  ok(!snap2 || snap2.indexOf('fold') < 0, 'Fold-Zustand NICHT im AutoSave-Snapshot');
  const fold = await page.evaluate(() => localStorage.getItem('gema_el_fold_v1'));
  ok(!!fold && fold.indexOf('el_leistungsbedarf') >= 0, 'Fold-Zustand in gema_el_fold_v1 (Geräte-UI)');
  await ctx.close();
}
{
  /* Schweizer Schreibweise darf die Rechnung nicht zerschiessen. */
  const { ctx, page } = await oeffne();
  await setzeZeile(page, 1, { kat:'motor', anzahl:'1', p:'12,5', cos:'0,9', g:'1', phase:'3' });
  await page.locator(zelle(1, SP.p) + ' input').blur();
  await page.waitForTimeout(200);
  ok(await page.inputValue(zelle(1, SP.p) + ' input') === '12.5', 'fixLeadingZero normalisiert Komma auf Punkt');
  nah(await zahl(page, 'lb_pInst'), 12.5, 0.01, 'Komma-Eingabe rechnet korrekt');
  await ctx.close();
}

/* ═══ G — Zugriffsschutz ═══════════════════════════════════════════════ */
console.log('── G: Zugriffsschutz ──');
{
  const { ctx, page } = await oeffne(['role_monteur']);
  const body = await page.textContent('body');
  ok(/Kein Zugriff/i.test(body || ''), 'Monteur: «Kein Zugriff»');
  ok(await page.locator('#lb_hauptwert').count() === 0, 'Monteur: Berechnung nicht im DOM');
  await ctx.close();
}
{
  const { ctx, page, fehler } = await oeffne(['role_elektro_planer']);
  ok(fehler.length === 0, 'Elektroplaner: lädt ohne Fehler');
  ok(await page.locator('#lb_hauptwert').count() === 1, 'Elektroplaner: voller Zugriff');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
