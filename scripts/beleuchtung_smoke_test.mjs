/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test Beleuchtungsberechnung (el_beleuchtung.html)
   ════════════════════════════════════════════════════════════════════════
   Prüft die Oberfläche im Browser: Boot, Rechenkette bis in die Anzeige,
   Vorlagen, Richtwert vs. Datenblattwert, Raster-Schema, Netzsystem-Wechsel,
   Kennzahlen-Leiste, Persistenz über einen Reload und den Zugriffsschutz.

     CHROME=/opt/pw-browsers/chromium node scripts/beleuchtung_smoke_test.mjs

   Braucht playwright-core (npm i --no-save playwright-core).
   ════════════════════════════════════════════════════════════════════════ */
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
/* Nur die ERSTE Zahl im Text — sonst kleben Apostroph-Tausender und
   Klammer-Zusätze zu einer Phantasiezahl zusammen. */
const zahl = s => {
  const m = String(s).replace(/[’'\s]/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
};

const { chromium } = await import('playwright-core');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 1000 } });
  await wireRoutes(ctx);
  const st = seed(roleIds);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s))
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_beleuchtung.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { page, ctx, fehler };
}
const txt = (page, sel) => page.textContent(sel).then(t => (t || '').trim());
const tippe = async (page, id, wert) => {
  await page.fill('#' + id, String(wert));
  await page.waitForTimeout(90);
};
const waehle = async (page, id, wert) => {
  await page.selectOption('#' + id, String(wert));
  await page.waitForTimeout(120);
};

/* ══ Boot & Aufbau ═══════════════════════════════════════════════════ */
const { page, ctx, fehler } = await oeffne(['role_elektro_planer']);
ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
ok((await txt(page, '.gema-hero-title')).includes('Beleuchtung'), 'Hero-Titel');
ok(await page.locator('.el-card').count() === 4, '4 Karten (Eingabe/Berechnung/Ergebnis/Anordnung)');
ok(await page.locator('.el-stub').count() === 0, 'Gerüst-Banner ist entfernt');
ok(await page.locator('input[type="number"]').count() === 0, 'kein type="number"');
ok(await page.locator('input[inputmode="decimal"]').count() >= 10, 'Zahlenfelder als Text mit inputmode');
ok(await page.locator('input[inputmode="decimal"][onblur*="fixLeadingZero"]').count()
   === await page.locator('input[inputmode="decimal"]').count(),
   'jedes Zahlenfeld hat fixLeadingZero');
ok(await page.locator('.g-inp-group .g-inp-unit').count() >= 10, 'Einheiten-Boxen an den Feldern');
ok(await page.locator('#bt_vorlage option').count() >= 11, 'Leuchten-Vorlagen geladen');
ok(await page.locator('#bt_refl option').count() === 3, 'drei Reflexionsgrad-Stufen');
ok(await page.locator('#bt_netz option').count() === 2, 'Netzsysteme aus GemaElektro');
ok(await page.locator('.frml').count() >= 6, 'Formel-Chips an den Ergebnis-Zeilen');
/* `.fg>label` schreibt gross — ein griechisches η würde dabei zu Η und wäre
   von einem H nicht mehr zu unterscheiden. Die Formelzeichen sind deshalb
   von der Umschrift ausgenommen (Falle «l/s» → «L/S» aus sa_enthaertung). */
{
  const sym = await page.evaluate(() => {
    const el = document.querySelector('.fg label .sym');
    return el ? getComputedStyle(el).textTransform : null;
  });
  ok(sym === 'none', 'Formelzeichen bleiben klein geschrieben — ist ' + sym);
  ok(await page.locator('.fg label .sym').count() >= 4, 'alle case-kritischen Zeichen geschützt');
}

/* ══ Referenzfall (identisch zum Engine-Test) ════════════════════════
   10 × 6 m · h_m 2.15 · E_m 500 · WF 0.8 · 4320 lm / 36 W · η_B 0.60
     k = 1.744 · Φ_ges = 62 500 lm · n = 14.47 → 15
     Raster 5 × 3 · E_ist 518.4 lx · P 540 W · 9.00 W/m² · I 0.82 A     */
{
  await tippe(page, 'bt_eta', '0.6');
  ok(zahl(await txt(page, '#bt_flaeche')) === 60, 'Fläche 60 m²');
  ok(zahl(await txt(page, '#bt_hm')) === 2.15, 'Nutzhöhe 2.15 m');
  ok(zahl(await txt(page, '#bt_k')) === 1.74, 'Raumindex 1.74');
  ok(zahl(await txt(page, '#bt_phiGes')) === 62500, 'Gesamtlichtstrom 62 500 lm');
  ok((await txt(page, '#bt_nRoh')).includes('15'), 'aufgerundet auf 15 Leuchten');
  ok((await txt(page, '#bt_anordnung')).includes('5 × 3'), 'Anordnung 5 × 3');
  ok((await txt(page, '#bt_anordnung')).includes('15'), 'gesamt 15 Leuchten');
  ok(zahl(await txt(page, '#bt_eIst')) === 518, 'erreichte Beleuchtungsstärke 518 lx');
  ok(zahl(await txt(page, '#bt_pGes')) === 540, 'Anschlussleistung 540 W');
  ok(zahl(await txt(page, '#bt_lmw')) === 120, 'Lichtausbeute 120 lm/W');
  ok(zahl(await txt(page, '#bt_iBetrieb')) === 0.82, 'Betriebsstrom 0.82 A');
  ok((await txt(page, '#bt_iBetrieb')).includes('6 A'), 'nächste Sicherung 6 A genannt');
  ok(zahl(await txt(page, '#bt_spezVal')) === 9, 'spezifische Leistung 9.00 W/m²');
  ok((await txt(page, '#bt_abstand')).includes('2.00'), 'Leuchtenabstand 2.00 m');
  ok((await txt(page, '#bt_abstand')).includes('1.00'), 'Wandabstand 1.00 m (halber Abstand)');
  ok((await txt(page, '#bt_etaB')).includes('Datenblatt'), 'η_B als Datenblattwert markiert');
  /* Kennzahlen-Leiste */
  ok(await txt(page, '#bt_sum1') === '15', 'Leiste: 15 Leuchten');
  ok(zahl(await txt(page, '#bt_sum2')) === 540, 'Leiste: 540 W');
  ok(zahl(await txt(page, '#bt_sum3')) === 9, 'Leiste: 9.00 W/m²');
  /* Status */
  const st = await page.getAttribute('#bt_status', 'class');
  ok(/\bok\b/.test(st), 'Status ok — ist ' + st);
  ok((await txt(page, '#bt_status')).includes('518'), 'Status nennt den erreichten Wert');
}

/* ══ Richtwert statt Datenblattwert ══════════════════════════════════ */
{
  await tippe(page, 'bt_eta', '');
  ok((await txt(page, '#bt_etaB')).includes('Richtwert'), 'η_B als Richtwert markiert');
  ok(zahl(await txt(page, '#bt_etaB')) === 0.694, 'Richtwert 0.694 interpoliert');
  const hint = await txt(page, '#bt_etaHint');
  ok(/Richtwert/.test(hint) && /1\.74/.test(hint), 'Herkunft steht am Feld');
  ok((await txt(page, '#bt_anordnung')).includes('mehr als rechnerisch'),
     'Überzahl des Rasters wird ausgewiesen');
  const ann = await txt(page, '#bt_annahmen');
  ok(/Datenblatt/.test(ann), 'Annahmen verweisen aufs Datenblatt');
  ok(/UGR|Blendung/.test(ann), 'Blendungsbegrenzung als Lücke benannt');
  ok(/Tageslicht/.test(ann), 'Tageslicht als Lücke benannt');
  ok(await page.locator('#bt_annahmen li').count() >= 5, 'mehrere Annahmen aufgelistet');
  /* Zurück auf den Datenblattwert */
  await tippe(page, 'bt_eta', '0.6');
}

/* ══ Vorlagen füllen Lichtstrom und Leistung, bleiben überschreibbar ══ */
{
  await waehle(page, 'bt_vorlage', 'hb150');
  ok(await page.inputValue('bt_phi'.replace(/^/, '#')) === '22500', 'Vorlage setzt den Lichtstrom');
  ok(await page.inputValue('#bt_p') === '150', 'Vorlage setzt die Leistung');
  ok(zahl(await txt(page, '#bt_lmw')) === 150, 'Lichtausbeute folgt der Vorlage');
  /* Übertippen löst die Vorlage — sie würde sonst etwas Falsches behaupten. */
  await tippe(page, 'bt_phi', '20000');
  ok(await page.inputValue('#bt_vorlage') === '', 'Vorlage löst sich beim Übertippen');
  /* Zurück auf den Referenzfall */
  await waehle(page, 'bt_vorlage', 'p6060');
  ok(await page.inputValue('#bt_phi') === '4320', 'Referenz-Leuchte wieder gesetzt');
}

/* ══ Netzsystem: Formel-Chip und Strom folgen der Wahl ═══════════════ */
{
  ok((await txt(page, '#bt_frmlI')).includes('√3'), 'dreiphasig: √3 im Chip');
  await waehle(page, 'bt_netz', '1p230');
  ok(!(await txt(page, '#bt_frmlI')).includes('√3'), 'einphasig: kein √3 im Chip');
  /* 540 W / (230 · 0.95) = 2.47 A */
  ok(zahl(await txt(page, '#bt_iBetrieb')) === 2.47, 'einphasiger Strom 2.47 A');
  await waehle(page, 'bt_netz', '3p400');
  ok(zahl(await txt(page, '#bt_iBetrieb')) === 0.82, 'dreiphasig wieder 0.82 A');
}

/* ══ Gleichmässigkeit: Verletzung wird gemeldet, nicht verschwiegen ══ */
{
  await tippe(page, 'bt_shr', '0.5');
  const st = await page.getAttribute('#bt_status', 'class');
  ok(/warn/.test(st), 'verletztes Abstandsverhältnis → warn');
  ok(/Gleichmässigkeit/.test(await txt(page, '#bt_status')), 'Status nennt die Gleichmässigkeit');
  ok(/warn/.test(await page.getAttribute('#bt_kpiGleich', 'class')), 'Kachel warnt mit');
  await tippe(page, 'bt_shr', '1.5');
  ok(/ok/.test(await page.getAttribute('#bt_kpiGleich', 'class')), 'Kachel wieder i.O.');
}

/* ══ Kein stiller Deckel: Strom über der Sicherungsreihe ═════════════ */
{
  await tippe(page, 'bt_laenge', '300');
  await tippe(page, 'bt_breite', '200');
  await tippe(page, 'bt_hoehe', '8');
  await tippe(page, 'bt_nutz', '0');
  await tippe(page, 'bt_em', '300');
  await tippe(page, 'bt_eta', '0.75');
  await tippe(page, 'bt_phi', '30000');
  await tippe(page, 'bt_p', '200');
  await waehle(page, 'bt_netz', '1p230');
  await page.waitForTimeout(200);
  const i = await txt(page, '#bt_iBetrieb');
  ok(zahl(i) > 400, 'Betriebsstrom über 400 A — ist ' + i);
  ok(/über der Sicherungsreihe/.test(i), 'die Überschreitung wird benannt');
  ok(!/→ nächste Sicherung/.test(i), 'es wird keine Sicherung erfunden');
  ok(/Stromkreise/.test(await txt(page, '#bt_annahmen')), 'Hinweis auf Aufteilung');
}

/* ══ Leerer Zustand ══════════════════════════════════════════════════ */
{
  await tippe(page, 'bt_laenge', '');
  await tippe(page, 'bt_breite', '');
  await page.waitForTimeout(200);
  ok(await txt(page, '#bt_flaeche') === '—', 'ohne Raum keine Fläche');
  ok(await txt(page, '#bt_anordnung') === '—', 'ohne Raum keine Anordnung');
  ok(await txt(page, '#bt_sum1') === '—', 'Leiste leer');
  const st = await page.getAttribute('#bt_status', 'class');
  ok(/\bok\b/.test(st), 'leerer Zustand ist kein Fehler');
  ok(/erfassen/.test(await txt(page, '#bt_status')), 'Status sagt, was fehlt');
  const svg = await page.innerHTML('#btPlan');
  ok(/erfassen/.test(svg), 'Schema erklärt den leeren Zustand statt leer zu bleiben');
}

/* ══ Schema zeichnet das Raster ══════════════════════════════════════ */
{
  await tippe(page, 'bt_laenge', '10');
  await tippe(page, 'bt_breite', '6');
  await tippe(page, 'bt_hoehe', '3');
  await tippe(page, 'bt_nutz', '0.85');
  await tippe(page, 'bt_em', '500');
  await tippe(page, 'bt_eta', '0.6');
  await tippe(page, 'bt_phi', '4320');
  await tippe(page, 'bt_p', '36');
  await waehle(page, 'bt_netz', '3p400');
  await page.waitForTimeout(250);
  const svg = await page.innerHTML('#btPlan');
  /* 15 Leuchten + 1 Raum + Rechteck-Hintergrund = 17 <rect> */
  const rects = (svg.match(/<rect/g) || []).length;
  ok(rects === 17, '15 Leuchten-Symbole im Grundriss — ' + rects + ' Rechtecke gesamt');
  ok(/5 × 3 = 15 Leuchten/.test(svg), 'Kopfzeile nennt das Raster');
  ok(/518 lx/.test(svg), 'Kopfzeile nennt den erreichten Wert');
  ok(/a \/ hₘ/.test(svg), 'Fusszeile nennt das Abstandsverhältnis');
  /* GemaPDF-Regel: NUR literale Hex-Farben im SVG. */
  ok(!/var\(--/.test(svg), 'keine CSS-Variablen im SVG (GemaPDF-Regel)');
  ok(/#0f172a|#ca8a04|#fde68a/.test(svg), 'literale Hex-Farben');
}

/* ══ Persistenz über einen Reload — OHNE Projektbezug ════════════════
   GemaAutoSave stellt ohne gewähltes Objekt nichts wieder her; das macht
   der Snapshot-Fallback bei 700/1800/3500 ms.                          */
{
  await tippe(page, 'bt_laenge', '12.5');
  await tippe(page, 'bt_breite', '8');
  await tippe(page, 'bt_em', '300');
  await tippe(page, 'bt_wf', '0.7');
  await waehle(page, 'bt_refl', 'dunkel');
  await page.waitForTimeout(1100);   // AutoSave-Debounce

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2700);   // Snapshot-Fallback 700/1800 ms

  ok(await page.inputValue('#bt_laenge') === '12.5', 'Länge nach Reload erhalten');
  ok(await page.inputValue('#bt_breite') === '8', 'Breite nach Reload erhalten');
  ok(await page.inputValue('#bt_em') === '300', 'Beleuchtungsstärke nach Reload erhalten');
  ok(await page.inputValue('#bt_wf') === '0.7', 'Wartungsfaktor nach Reload erhalten');
  ok(await page.inputValue('#bt_refl') === 'dunkel', 'Reflexionsstufe nach Reload erhalten');
  ok(zahl(await txt(page, '#bt_flaeche')) === 100, 'Ergebnis nach Reload neu gerechnet');
  ok(await txt(page, '#bt_sum1') !== '—', 'Kennzahlen-Leiste nach Reload gefüllt');
}

/* ══ Fold überlebt den Reload, liegt aber NICHT im AutoSave ══════════ */
{
  const snap = await page.evaluate(() => {
    const k = Object.keys(localStorage).filter(x => x.indexOf('gema_beleuchtung') === 0);
    return k.length ? JSON.parse(localStorage.getItem(k[0])) : null;
  });
  ok(snap !== null, 'AutoSave-Snapshot vorhanden');
  ok(snap && !Object.keys(snap).some(k => /fold/i.test(k)), 'Fold-Zustand nicht im Snapshot');
  ok(snap && snap.bt_laenge === '12.5', 'Snapshot enthält die Eingaben');

  await page.click('.el-card[data-fold="plan"] .el-card-hd');
  await page.waitForTimeout(150);
  ok(await page.locator('.el-card[data-fold="plan"].zu').count() === 1, 'Karte klappt zu');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  ok(await page.locator('.el-card[data-fold="plan"].zu').count() === 1, 'Fold überlebt den Reload');
  const fold = await page.evaluate(() => localStorage.getItem('gema_el_fold_v1'));
  ok(fold && fold.indexOf('el_beleuchtung.plan') >= 0, 'Fold liegt unter dem Modul-Schlüssel');
}

await ctx.close();

/* ══ Zugriffsschutz ══════════════════════════════════════════════════ */
{
  const { page: p2, ctx: c2 } = await oeffne(['role_monteur']);
  const body = await p2.textContent('body');
  ok(/Kein Zugriff/i.test(body), 'Monteur sieht den Kein-Zugriff-Screen');
  ok(await p2.locator('#bt_laenge').count() === 0, 'Monteur sieht die Eingabefelder nicht');
  await c2.close();
}

await browser.close();
server.close();
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} von ${pass + fail} Prüfungen bestanden`);
process.exit(fail === 0 ? 0 : 1);
