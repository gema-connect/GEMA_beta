/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test el_belastbarkeit (Playwright)
   ════════════════════════════════════════════════════════════════════════
     CHROME=/opt/pw-browsers/chromium node scripts/belastbarkeit_smoke_test.mjs

   Prüft das Modul so, wie es benutzt wird:
     A  Boot ohne Fehler, Gerüst-Banner weg, Aufbau steht
     B  Rechenkette im UI (Temperatur · Häufung · Verlegeart · parallel)
     C  Kabelwahl + Nachweis NIN 4.3.3 sichtbar (LS ⇄ gG)
     D  Grenzen werden angezeigt statt verschwiegen
     E  Vergleichstabelle folgt der Bauart und rechnet Spalte D mit Boden-
        temperatur
     F  Persistenz über einen Reload (GemaAutoSave)
     G  Kein Zugriff für role_monteur

   Ohne playwright-core/Chromium bricht der Test mit Hinweis ab — nie still.
   ════════════════════════════════════════════════════════════════════════ */
let pw;
try { pw = await import('playwright-core'); }
catch { console.log('⚠ ÜBERSPRUNGEN — playwright-core fehlt (npm i --no-save playwright-core).'); process.exit(0); }

const { startServer, wireRoutes, seed, BASE } = await import('./rolematrix_harness.mjs');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';

let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const gleich = (a, b, m) => ok(String(a).trim() === b, m + ' (erwartet «' + b + '», erhalten «' + String(a).trim() + '»)');

const server = await startServer();
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seed(roleIds || ['role_elektro_planer']));
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_belastbarkeit.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { page, ctx, fehler };
}

/* Kleine Helfer — die Felder sind bewusst type="text" (GEMA-Kanon). */
const setzeFeld = async (page, id, wert) => {
  await page.fill('#' + id, String(wert));
  await page.dispatchEvent('#' + id, 'input');
  await page.waitForTimeout(120);
};
const txt = (page, sel) => page.textContent(sel);

/* ══ A — Boot ═════════════════════════════════════════════════════════ */
console.log('── A: Boot & Aufbau ──');
{
  const { page, ctx, fehler } = await oeffne();
  ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
  ok(await page.locator('.el-stub').count() === 0, 'Gerüst-Banner ist entfernt');
  ok(await page.locator('.el-card').count() === 6, '6 Schritt-Karten');
  ok(await page.locator('.gema-hero-title').count() === 1, 'Hero vorhanden');
  ok(await page.locator('#metaObjektDropdown').count() === 1, 'Objekt-Bezug vorhanden');
  ok(await page.locator('.bl-vl button').count() === 5, 'Verlegeart-Kacheln mehradrig: 5');
  ok(await page.locator('.bl-vl button.an').count() === 1, 'genau eine Verlegeart ist aktiv');
  ok(await page.locator('#bl_a').count() === 1, 'Querschnitt-Auswahl im Modus «Querschnitt → Iz»');

  /* Kein type="number" — GEMA-Kanon, hier am gerenderten DOM geprüft. */
  const zahlFelder = await page.$$eval('input[inputmode="decimal"]', els =>
    els.map(e => ({ id: e.id, typ: e.getAttribute('type'), blur: e.getAttribute('onblur') || '' })));
  ok(zahlFelder.length >= 8, 'mehrere Zahlenfelder vorhanden (' + zahlFelder.length + ')');
  ok(zahlFelder.every(f => f.typ === 'text'), 'alle Zahlenfelder sind type="text"');
  ok(zahlFelder.every(f => f.blur.indexOf('fixLeadingZero') >= 0), 'alle Zahlenfelder haben fixLeadingZero');

  /* Jede zentrale Ergebniszeile trägt einen Formel-Chip. */
  ok(await page.locator('.el-res .frml').count() >= 6, 'Formel-Chips an den Ergebniszeilen');
  const legende = await txt(page, '#bl_legende');
  ok(/1\.45/.test(legende) && /κ\(ϑ\)|κ/.test(legende), 'Formel-Legende nennt die 1.45-Bedingung und κ');
  await ctx.close();
}

/* ══ B — Rechenkette ══════════════════════════════════════════════════ */
console.log('\n── B: Rechenkette im UI ──');
{
  const { page, ctx } = await oeffne();

  /* Modul-Default ist 10 mm²; für die Rechenkette auf den runden
     Tabellenwert 16 mm² = 76 A stellen. */
  gleich(await txt(page, '#bl_izRef'), '57.0 A', 'Default 10 mm² → Referenzwert 57 A');
  await page.selectOption('#bl_a', '16');
  await page.waitForTimeout(150);
  gleich(await txt(page, '#bl_izRef'), '76.0 A', 'Referenzwert 16 mm² = 76 A');
  gleich(await txt(page, '#bl_hauptwert'), '76.00 A', 'Iz bei Referenzbedingungen = 76 A');
  gleich(await txt(page, '#bl_kGes'), '1.000', 'Gesamtfaktor 1.000');
  gleich(await txt(page, '#bl_quelle'), 'Normwert', 'Herkunft: Normwert');

  /* 40 °C → 76 · 0.87 = 66.12 */
  await setzeFeld(page, 'bl_tumg', 40);
  gleich(await txt(page, '#bl_kTemp'), '0.870', 'kϑ 40 °C = 0.870');
  gleich(await txt(page, '#bl_hauptwert'), '66.12 A', '76 · 0.87 = 66.12 A');

  /* + 3 gehäufte Stromkreise → · 0.70 = 46.28 */
  await page.selectOption('#bl_haeufModus', 'tabelle');
  await page.waitForTimeout(150);
  ok(await page.locator('#bl_n').isVisible(), 'Feld «Stromkreise» erscheint');
  await setzeFeld(page, 'bl_n', 3);
  gleich(await txt(page, '#bl_kHaeuf'), '0.700', 'kh für 3 Kreise = 0.700');
  gleich(await txt(page, '#bl_hauptwert'), '46.28 A', '76 · 0.87 · 0.70 = 46.28 A');

  /* NIN und EN weichen bei 4 Kreisen ab — beide Werte werden gezeigt. */
  await setzeFeld(page, 'bl_n', 4);
  const info = await txt(page, '#bl_haeufInfo');
  ok(/0\.70/.test(info) && /0\.65/.test(info) && /kleineren/.test(info),
     'beide Quellwerte (0.70 / 0.65) und die konservative Wahl stehen im UI');
  gleich(await txt(page, '#bl_kHaeuf'), '0.650', 'gerechnet wird mit 0.650');

  /* 30 %-Regel: 4 Kreise, 1 gering belastet → wirksam 3 → 0.70 */
  await setzeFeld(page, 'bl_ngering', 1);
  gleich(await txt(page, '#bl_kHaeuf'), '0.700', '30 %-Regel: 4 − 1 = 3 wirksame Kreise → 0.700');
  ok(/5\.2\.3\.5/.test(await txt(page, '#bl_meldungen')), 'der Abzug wird als Annahme ausgewiesen');
  await setzeFeld(page, 'bl_ngering', 0);

  /* Verlegeart D: Beschriftung und Temperaturbasis wechseln auf Erdreich. */
  await page.click('.bl-vl button[data-v="D"]');
  await page.waitForTimeout(150);
  ok(/Bodentemperatur/.test(await txt(page, '#bl_tempLbl')), 'Beschriftung wechselt auf Bodentemperatur');
  ok(/20 °C/.test(await txt(page, '#bl_tempHint')), 'der Bezug 20 °C steht dabei');
  gleich(await txt(page, '#bl_kTemp'), '0.770', '40 °C Erdreich → 0.770 (nicht 0.870 wie in Luft)');
  gleich(await txt(page, '#bl_izRef'), '64.0 A', 'Referenzwert D / 16 mm² = 64 A');

  /* zurück auf C, Referenzbedingungen, dann parallel */
  await page.click('.bl-vl button[data-v="C"]');
  await setzeFeld(page, 'bl_tumg', 30);
  await page.selectOption('#bl_haeufModus', 'keine');
  await page.waitForTimeout(150);
  await setzeFeld(page, 'bl_parallel', 2);
  gleich(await txt(page, '#bl_hauptwert'), '152.00 A', '2 parallele Leiter → 152 A');
  ok(/eigene Stromkreise/.test(await txt(page, '#bl_meldungen')),
     'parallel ohne Häufung wird gemeldet');
  await ctx.close();
}

/* ══ C — Kabelwahl und Nachweis ═══════════════════════════════════════ */
console.log('\n── C: Kabelwahl + Nachweis NIN 4.3.3 ──');
{
  const { page, ctx } = await oeffne();
  await page.click('#bl_segModus button[data-v="a"]');
  await page.waitForTimeout(150);
  ok(!(await page.locator('#bl_a').isVisible()), 'im Modus «Strom → Querschnitt» entfällt die Querschnitt-Auswahl');

  /* Leitungsschutzschalter: Ib 40 A → 6 mm² */
  await setzeFeld(page, 'bl_ib', 40);
  await page.selectOption('#bl_schutz', 'mcb');
  await page.waitForTimeout(150);
  ok(/6\.0 mm²/.test(await txt(page, '#bl_hauptwert')), 'LS-Schalter → 6 mm²');
  ok(/40 A/.test(await txt(page, '#bl_inHint')), 'In 40 A wird als Vorschlag ausgewiesen');
  ok(/✓/.test(await txt(page, '#bl_b1')) && /✓/.test(await txt(page, '#bl_b2')), 'beide Bedingungen ✓');
  gleich(await txt(page, '#bl_sum3'), '✓ erfüllt', 'Kennzahlen-Leiste meldet «erfüllt»');

  /* Schmelzsicherung gG: derselbe Strom verlangt 10 mm² */
  await page.selectOption('#bl_schutz', 'gg');
  await page.waitForTimeout(200);
  ok(/10\.0 mm²/.test(await txt(page, '#bl_hauptwert')), 'gG → 10 mm² statt 6 mm²');
  ok(/Bedingung 2/.test(await txt(page, '#bl_meldungen')), 'der massgebende Grund wird benannt');
  ok(/1\.60/.test(await txt(page, '#bl_b2Frml')), 'der Formel-Chip zeigt den I₂-Faktor 1.60');
  /* Die gefundene Grösse muss in der Vergleichstabelle markiert sein — im
     Modus «Strom → Querschnitt» ist das NICHT der Wert des ausgeblendeten
     Querschnitt-Felds. */
  const markiert = await page.$$eval('#bl_tbody tr.bl-zeile', trs =>
    trs.map(t => t.children[0].textContent.trim()));
  ok(markiert.length === 1 && markiert[0] === '10 mm²',
     'die gewählten 10 mm² sind in der Vergleichstabelle markiert (erhalten: ' + markiert + ')');

  /* Gegenprobe im Modus «Querschnitt → Iz»: 6 mm² mit gG ist unzulässig,
     obwohl Bedingung 1 aufgeht. */
  await page.click('#bl_segModus button[data-v="iz"]');
  await page.waitForTimeout(150);
  await page.selectOption('#bl_a', '6');
  await setzeFeld(page, 'bl_in', 40);
  ok(/✓/.test(await txt(page, '#bl_b1')), 'Bedingung 1 erfüllt (40 ≤ 40 ≤ 41)');
  ok(/✗/.test(await txt(page, '#bl_b2')), 'Bedingung 2 verletzt (64 > 59.45)');
  ok((await page.getAttribute('#bl_status', 'class')).indexOf('err') >= 0, 'Status rot');
  gleich(await txt(page, '#bl_sum3'), '✗ nicht erfüllt', 'Kennzahlen-Leiste meldet «nicht erfüllt»');

  /* Spannungsfall-Gegencheck */
  await page.selectOption('#bl_a', '10');
  await setzeFeld(page, 'bl_laenge', 50);
  ok(/7\.40 V/.test(await txt(page, '#bl_du')), 'ΔU = 7.40 V (κ bei 70 °C)');
  ok(/1\.85 %/.test(await txt(page, '#bl_du')), 'ΔU = 1.85 %');
  ok(/46\.80/.test(await txt(page, '#bl_kappa')), 'κ wird mit 46.80 bei 70 °C ausgewiesen — nicht 56');
  await setzeFeld(page, 'bl_laenge', 200);
  ok(/✗/.test(await txt(page, '#bl_du')) && /Spannungsfall massgebend/.test(await txt(page, '#bl_meldungen')),
     'über dem Grenzwert wird der Spannungsfall als massgebend gemeldet');
  await ctx.close();
}

/* ══ D — Grenzen sichtbar ═════════════════════════════════════════════ */
console.log('\n── D: Grenzen werden gemeldet ──');
{
  const { page, ctx } = await oeffne();

  /* Verlegeart F erst ab 25 mm² */
  await page.click('#bl_segBauart button[data-v="ein"]');
  await page.waitForTimeout(150);
  ok(await page.locator('.bl-vl button').count() === 8, 'einadrig: 8 Verlegearten');
  await page.click('.bl-vl button[data-v="F"]');
  await page.selectOption('#bl_a', '16');
  await page.waitForTimeout(150);
  gleich(await txt(page, '#bl_hauptwert'), '—', 'kein Wert → kein erfundenes Ergebnis');
  ok(/erst ab 25 mm²/.test(await txt(page, '#bl_meldungen')), 'der Grund steht als Meldung da');
  ok(/erst ab 25 mm²/.test(await txt(page, '#bl_vlHint')), 'die Kachel-Beschreibung nennt die Grenze');
  await page.selectOption('#bl_a', '25');
  await page.waitForTimeout(150);
  gleich(await txt(page, '#bl_izRef'), '110.0 A', 'ab 25 mm² liegt der Wert vor');

  /* Temperatur über dem Tabellenbereich */
  await setzeFeld(page, 'bl_tumg', 70);
  gleich(await txt(page, '#bl_kTemp'), '—', 'kein Faktor über 60 °C');
  gleich(await txt(page, '#bl_hauptwert'), '—', 'und damit kein Iz');
  ok(/über dem Tabellenbereich/.test(await txt(page, '#bl_meldungen')), 'die Grenze wird benannt');
  await setzeFeld(page, 'bl_tumg', 30);

  /* Näherungstabelle wird als solche markiert */
  await page.click('#bl_segBelastet button[data-v="2"]');
  await page.selectOption('#bl_isolation', 'xlpe');
  await page.waitForTimeout(200);
  gleich(await txt(page, '#bl_quelle'), '≈ hochgerechnet', 'Näherung ist als solche markiert');
  ok(/hochgerechnete/.test(await txt(page, '#bl_meldungen')), 'und wird zusätzlich erklärt');

  /* Aluminium: gemeldet statt still mit Kupferwerten gerechnet */
  await page.selectOption('#bl_material', 'al');
  await page.waitForTimeout(200);
  gleich(await txt(page, '#bl_hauptwert'), '—', 'kein Iz für Aluminium');
  ok(/Kupferleiter/.test(await txt(page, '#bl_meldungen')), 'der Grund steht in der Meldung');
  await ctx.close();
}

/* ══ E — Vergleichstabelle ════════════════════════════════════════════ */
console.log('\n── E: Vergleichstabelle ──');
{
  const { page, ctx } = await oeffne();
  ok(await page.locator('#bl_thead th').count() === 6, 'mehradrig: Querschnitt + 5 Verlegearten');
  ok(await page.locator('#bl_tbody tr').count() === 19, '19 genormte Querschnitte');

  /* 16 mm²: Spalte C = 76 A, Spalte D = 64 A — beide bei 30 °C, aber D mit
     der Bodentabelle (0.89), C mit der Lufttabelle (1.00). */
  const z16 = await page.$$eval('#bl_tbody tr', trs => {
    const tr = trs.find(t => t.children[0].textContent.trim() === '16 mm²');
    return Array.from(tr.children).map(td => td.textContent.trim());
  });
  ok(/^76\.00 A/.test(z16[3]), 'Spalte C / 16 mm² = 76.00 A');
  ok(/^56\.96 A/.test(z16[4]), 'Spalte D / 16 mm² = 64 · 0.89 = 56.96 A (Bodentemperatur)');
  ok(/\(64\.0 A\)/.test(z16[4]), 'der Referenzwert steht in Klammern daneben');

  const kopf = await txt(page, '#bl_thead');
  ok(/0\.890/.test(kopf), 'die Kopfzeile weist den abweichenden Faktor der Spalte D aus');

  await page.click('#bl_segBauart button[data-v="ein"]');
  await page.waitForTimeout(200);
  ok(await page.locator('#bl_thead th').count() === 9, 'einadrig: Querschnitt + 8 Verlegearten');
  const z16e = await page.$$eval('#bl_tbody tr', trs => {
    const tr = trs.find(t => t.children[0].textContent.trim() === '16 mm²');
    return Array.from(tr.children).map(td => td.textContent.trim());
  });
  gleich(z16e[5], '—', 'einadrig 16 mm² Spalte F: «—» statt einer erfundenen Zahl');
  await ctx.close();
}

/* ══ F — Persistenz über Reload ═══════════════════════════════════════ */
console.log('\n── F: Persistenz ──');
{
  const { page, ctx } = await oeffne();
  await page.click('#bl_segBauart button[data-v="ein"]');
  await page.waitForTimeout(120);
  await page.click('.bl-vl button[data-v="B1"]');
  await page.click('#bl_segBelastet button[data-v="2"]');
  await page.selectOption('#bl_isolation', 'pvc');
  await page.selectOption('#bl_a', '10');
  await setzeFeld(page, 'bl_tumg', 35);
  await page.selectOption('#bl_haeufModus', 'tabelle');
  await page.waitForTimeout(120);
  await setzeFeld(page, 'bl_n', 2);
  await setzeFeld(page, 'bl_ib', 33);

  /* ein|2|70 / B1 / 10 mm² = 57 A · kϑ(35 °C) 0.94 · kh(2) 0.80 = 42.864 */
  gleich(await txt(page, '#bl_hauptwert'), '42.86 A', 'vor dem Reload: 57 · 0.94 · 0.80 = 42.86 A');

  await page.evaluate(() => GemaAutoSave.save());
  await page.waitForTimeout(400);
  const gespeichert = await page.evaluate(() => localStorage.getItem('gema_belastbarkeit'));
  ok(!!gespeichert, 'AutoSave-Snapshot liegt unter gema_belastbarkeit');
  ok(gespeichert.indexOf('fold') < 0, 'der Fold-Zustand steckt NICHT im Snapshot (Geräte-UI)');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  gleich(await page.inputValue('#bl_bauart'), 'ein', 'Bauart überlebt den Reload');
  gleich(await page.inputValue('#bl_verlegeart'), 'B1', 'Verlegeart überlebt den Reload');
  gleich(await page.inputValue('#bl_belastet'), '2', 'belastete Leiter überleben den Reload');
  gleich(await page.inputValue('#bl_tumg'), '35', 'Temperatur überlebt den Reload');
  ok(await page.locator('.bl-vl button.an[data-v="B1"]').count() === 1, 'die Kachel B1 ist wieder aktiv');
  gleich(await txt(page, '#bl_hauptwert'), '42.86 A', 'nach dem Reload wird dasselbe Ergebnis angezeigt');
  await ctx.close();
}

/* ══ G — Zugriffsschutz ═══════════════════════════════════════════════ */
console.log('\n── G: Zugriffsschutz ──');
{
  const { page, ctx } = await oeffne(['role_monteur']);
  ok(/Kein Zugriff/i.test(await page.textContent('body') || ''), 'Monteur: «Kein Zugriff»');
  await ctx.close();
}
{
  const { page, ctx, fehler } = await oeffne(['role_elektro_planer']);
  ok(fehler.length === 0 && await page.locator('#bl_hauptwert').count() === 1,
     'Elektroplaner: voller Zugriff');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
