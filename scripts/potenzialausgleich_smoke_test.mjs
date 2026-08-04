/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test Potenzialausgleich & Schutzleiter (el_potenzialausgleich)
   ════════════════════════════════════════════════════════════════════════
   Prüft die Oberfläche im Browser: Boot, Rechenkette bis in die Anzeige,
   Herleitung, Blitzschutz-Schalter, Kappungs-Warnung, Werkstoff-Tabelle,
   Schema, Persistenz über einen Reload und den Zugriffsschutz.

     CHROME=/opt/pw-browsers/chromium node scripts/potenzialausgleich_smoke_test.mjs

   Braucht playwright-core (npm i --no-save playwright-core).
   ════════════════════════════════════════════════════════════════════════ */
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let pass = 0, fail = 0;
const ok = (b, m) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const zahl = t => parseFloat(String(t).replace(/[’\s]/g, '').replace(/[^0-9.\-]/g, '')) || 0;

const { chromium } = await import('playwright-core');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await wireRoutes(ctx);
  const st = seed(roleIds);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_potenzialausgleich.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { page, ctx, fehler };
}
const txt = (page, sel) => page.textContent(sel).then(t => (t || '').trim());
/* Querschnitte werden gewählt, nicht getippt — der oninput-Handler hängt am
   change-Ereignis, das selectOption auslöst. */
const waehle = async (page, id, wert) => { await page.selectOption('#' + id, String(wert)); await page.waitForTimeout(120); };

/* ══ Boot & Aufbau ═══════════════════════════════════════════════════ */
const { page, ctx, fehler } = await oeffne(['role_elektro_planer']);
ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
ok((await page.textContent('.gema-hero-title')).includes('Potenzialausgleich'), 'Hero-Titel');
ok(await page.locator('.el-card').count() === 5, '5 Schritt-Karten');
ok(await page.locator('.el-stub').count() === 0, 'Gerüst-Banner ist entfernt');
ok(await page.locator('#pa_pen option').count() >= 19, 'PEN-Querschnitte aus der Normreihe');
ok(await page.locator('#pa_phase option').count() >= 19, 'Aussenleiter-Querschnitte aus der Normreihe');
ok(await page.locator('#pa_werkstoff option').count() === 3, 'Leiterwerkstoffe geladen');
/* Dieses Modul hat bewusst keine freien Zahlenfelder — Querschnitte sind
   eine Normreihe. */
ok(await page.locator('input[inputmode="decimal"]').count() === 0, 'keine freien Zahlenfelder');
ok(await page.locator('input[type="number"]').count() === 0, 'kein type="number"');

/* ══ Vorgabewerte: PEN 16, S 16 ══════════════════════════════════════
   PE  = 16                    (S ≤ 16 → S)
   HPA = max(8 ; 6)  = 8  → 10 (Normreihe)
   ÖPA = max(8 ; 4)  = 8  → 10
   FE  = max(4 ; 10) = 10                                            */
{
  ok(zahl(await txt(page, '#pa_pe')) === 16, 'PE 16 mm²');
  ok(zahl(await txt(page, '#pa_hpa')) === 10, 'HPA 10 mm²');
  ok(zahl(await txt(page, '#pa_opa')) === 10, 'ÖPA 10 mm²');
  ok(zahl(await txt(page, '#pa_fe')) === 10, 'FE 10 mm²');
  ok((await txt(page, '#pa_status')).startsWith('✓'), 'Status i.O.');
  ok((await page.getAttribute('#pa_status', 'class')).includes('ok'), 'Status-Klasse ok');
}

/* ══ Kennzahlen-Leiste spiegelt die Ergebnisse ═══════════════════════ */
{
  ok(zahl(await txt(page, '#pa_sum_hpa')) === 10, 'Kennzahl HPA');
  ok(zahl(await txt(page, '#pa_sum_opa')) === 10, 'Kennzahl ÖPA');
  ok(zahl(await txt(page, '#pa_sum_pe')) === 16, 'Kennzahl PE');
  ok(zahl(await txt(page, '#pa_sum_fe')) === 10, 'Kennzahl FE');
}

/* ══ Herleitung ist sichtbar und nennt die Zwischenschritte ══════════ */
{
  const hHpa = await txt(page, '#pa_herlHpa');
  ok(hHpa.includes('8') && hHpa.includes('6'), 'HPA-Herleitung nennt ½·PEN und den Mindestwert');
  ok(hHpa.includes('Normreihe'), 'HPA-Herleitung nennt die Normreihe');
  const hPe = await txt(page, '#pa_herlPe');
  ok(hPe.includes('16'), 'PE-Herleitung nennt den Aussenleiter');
  ok((await txt(page, '#pa_frmlPe')).includes('S'), 'PE-Formel-Chip gesetzt');
  ok((await txt(page, '#pa_herlFe')).includes('4'), 'FE-Herleitung nennt den Mindestwert');
}

/* ══ Schutzleiter: die drei Stufen in der Anzeige ════════════════════ */
{
  await waehle(page, 'pa_phase', 25);
  ok(zahl(await txt(page, '#pa_pe')) === 16, '25 mm² → PE 16');
  ok((await txt(page, '#pa_frmlPe')).includes('35'), 'Formel-Chip zeigt die 2. Stufe');

  await waehle(page, 'pa_phase', 95);
  ok(zahl(await txt(page, '#pa_pe')) === 50, '95 mm² → PE 50 (47.5 aufgerundet)');
  ok((await txt(page, '#pa_herlPe')).includes('47.5'), 'Herleitung zeigt den Rohwert 47.5');

  await waehle(page, 'pa_phase', 16);
  ok(zahl(await txt(page, '#pa_pe')) === 16, 'zurück auf 16 mm²');
}

/* ══ Blitzschutz hebt den Mindestquerschnitt ═════════════════════════ */
{
  await waehle(page, 'pa_pen', 10);
  ok(zahl(await txt(page, '#pa_hpa')) === 6, 'PEN 10 ohne Blitzschutz → HPA 6');

  await page.check('#pa_blitz');
  await page.waitForTimeout(150);
  ok(zahl(await txt(page, '#pa_hpa')) === 10, 'mit Blitzschutz → HPA 10');
  ok((await txt(page, '#pa_status')).includes('Blitzschutz'), 'Blitzschutz erscheint im Status');
  ok((await page.getAttribute('#pa_blitzWrap', 'class')).includes('an'), 'Schalter optisch aktiv');

  await page.uncheck('#pa_blitz');
  await page.waitForTimeout(150);
  ok(zahl(await txt(page, '#pa_hpa')) === 6, 'ohne Blitzschutz wieder HPA 6');
  ok(!(await page.getAttribute('#pa_blitzWrap', 'class')).includes('an'), 'Schalter optisch inaktiv');
}

/* ══ Kappung wird ausgewiesen, nicht verschwiegen ════════════════════ */
{
  await waehle(page, 'pa_pen', 50);
  ok(zahl(await txt(page, '#pa_hpa')) === 16, 'PEN 50 → HPA auf 16 begrenzt');
  ok((await page.getAttribute('#pa_status', 'class')).includes('warn'), 'Status warnt');
  const st = await txt(page, '#pa_status');
  ok(st.includes('25'), 'Status nennt den rechnerischen Wert 25');
  ok(/zulässig/i.test(st), 'Status nennt die Zulässigkeit einer grösseren Ausführung');
  ok((await page.getAttribute('#pa_hpa', 'class')).includes('warn'), 'HPA-Wert amber markiert');
  ok((await txt(page, '#pa_herlHpa')).includes('Regel-Grenze'), 'Herleitung zeigt die Kappung');
}

/* ══ ÖPA wird auf den HPA begrenzt ═══════════════════════════════════ */
{
  await waehle(page, 'pa_pen', 10);    // HPA 6
  await waehle(page, 'pa_phase', 50);  // PE 25 → ½ = 12.5 → 16
  ok(zahl(await txt(page, '#pa_opa')) === 6, 'ÖPA auf HPA 6 begrenzt');
  ok((await txt(page, '#pa_herlOpa')).includes('begrenzt'), 'Herleitung zeigt die Begrenzung');
  ok((await txt(page, '#pa_status')).includes('begrenzt'), 'Status nennt die Begrenzung');
}

/* ══ Verlegeart ändert den Mindestquerschnitt des ÖPA ════════════════ */
{
  await waehle(page, 'pa_pen', 25);    // HPA 16
  await waehle(page, 'pa_phase', 2.5); // PE 2.5 → ½ = 1.25
  ok(zahl(await txt(page, '#pa_opa')) === 4, 'ungeschützt → ÖPA 4');
  await waehle(page, 'pa_opaschutz', 'geschuetzt');
  ok(zahl(await txt(page, '#pa_opa')) === 2.5, 'mechanisch geschützt → ÖPA 2.5');
  await waehle(page, 'pa_opaschutz', 'offen');
  ok(zahl(await txt(page, '#pa_opa')) === 4, 'zurück auf ungeschützt');
}

/* ══ Werkstoff-Umrechnung ════════════════════════════════════════════ */
{
  await waehle(page, 'pa_pen', 16);
  await waehle(page, 'pa_phase', 16);   // HPA 10, ÖPA 10, PE 16, FE 10
  ok(await page.locator('#pa_wkBody tr').count() === 4, 'vier Zeilen in der Werkstoff-Tabelle');
  ok((await txt(page, '#pa_werkstoffHint')).includes('Kupfer'), 'Hinweis nennt Kupfer als Vorgabe');

  await waehle(page, 'pa_werkstoff', 'al');
  const z = await page.locator('#pa_wkBody tr').first();
  const zellen = await z.locator('td').allTextContents();
  ok(zellen[1].includes('10'), 'HPA in Kupfer bleibt 10 mm²');
  ok(zahl(zellen[2]) > 15 && zahl(zellen[2]) < 16, 'gerechneter Al-Wert 15.6 mm²');
  ok(zahl(zellen[3]) === 16, 'gewählter Al-Querschnitt 16 mm²');
  ok((await txt(page, '#pa_werkstoffHint')).includes('1.56'), 'Hinweis nennt den Faktor 1.56');

  await waehle(page, 'pa_werkstoff', 'cu');
  const z2 = await page.locator('#pa_wkBody tr').first().locator('td').allTextContents();
  ok(z2[2] === '—', 'bei Kupfer keine Umrechnung');
}

/* ══ Schema ══════════════════════════════════════════════════════════ */
{
  ok(await page.locator('#pa_schema svg').count() === 1, 'Schema gezeichnet');
  const svg = await page.innerHTML('#pa_schema');
  ok(!svg.includes('var(--'), 'Schema ohne var()-Farben (GemaPDF-Regel)');
  ok(/#[0-9a-fA-F]{6}/.test(svg), 'Schema nutzt literale Hex-Farben');
  ok(svg.includes('ausgleichsschiene'), 'Schema zeigt die Ausgleichsschiene');
  ok(svg.includes('Fundamenterder'), 'Schema zeigt den Erder');
  ok(svg.includes('ÖPA'), 'Schema beschriftet den zusätzlichen Potenzialausgleich');
  ok(!svg.includes('Blitzschutz'), 'ohne Blitzschutz kein Blitzschutz-Anschluss');

  await page.check('#pa_blitz');
  await page.waitForTimeout(150);
  ok((await page.innerHTML('#pa_schema')).includes('Blitzschutz'), 'mit Blitzschutz erscheint der Anschluss');
  await page.uncheck('#pa_blitz');
  await page.waitForTimeout(150);
}

/* ══ Fold: Zustand pro Gerät, nie im AutoSave-Snapshot ═══════════════ */
{
  await page.click('.el-card[data-fold="schema"] .el-card-hd');
  await page.waitForTimeout(150);
  ok(await page.locator('.el-card[data-fold="schema"].zu').count() === 1, 'Karte klappt zu');
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('gema_el_fold_v1') || '{}'));
  ok(st['el_potenzialausgleich.schema'] === true, 'Fold-Zustand gespeichert');
  await page.click('.el-card[data-fold="schema"] .el-card-hd');
  await page.waitForTimeout(150);
  ok(await page.locator('.el-card[data-fold="schema"].zu').count() === 0, 'Karte klappt auf');
}

/* ══ Persistenz über einen Reload — OHNE Projektbezug ════════════════
   GemaAutoSave stellt ohne gewähltes Objekt nichts wieder her; dafür
   greift paSnapshotLoad. Genau dieser Fall ging in el_spannungsfall
   zuerst verloren. */
{
  await waehle(page, 'pa_pen', 35);
  await waehle(page, 'pa_phase', 50);
  await waehle(page, 'pa_opaschutz', 'geschuetzt');
  await page.check('#pa_blitz');
  await page.waitForTimeout(900);   // AutoSave-Debounce abwarten

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);  // Snapshot-Fallback bei 700/1800 ms

  ok(await page.inputValue('#pa_pen') === '35', 'PEN nach Reload erhalten');
  ok(await page.inputValue('#pa_phase') === '50', 'Aussenleiter nach Reload erhalten');
  ok(await page.inputValue('#pa_opaschutz') === 'geschuetzt', 'Verlegeart nach Reload erhalten');
  ok(await page.isChecked('#pa_blitz') === true, 'Blitzschutz-Schalter nach Reload erhalten');
  ok(zahl(await txt(page, '#pa_hpa')) === 16, 'Ergebnis nach Reload neu gerechnet');
  ok(zahl(await txt(page, '#pa_pe')) === 25, 'PE nach Reload neu gerechnet');
}

/* ══ Fold überlebt den Reload, liegt aber NICHT im AutoSave ══════════ */
{
  const snap = await page.evaluate(() => {
    const k = Object.keys(localStorage).filter(x => x.indexOf('gema_potenzialausgleich') === 0);
    return k.length ? JSON.parse(localStorage.getItem(k[0])) : null;
  });
  ok(snap !== null, 'AutoSave-Snapshot vorhanden');
  ok(snap && !Object.keys(snap).some(k => /fold/i.test(k)), 'Fold-Zustand nicht im Snapshot');
  ok(snap && snap.pa_pen === '35', 'Snapshot enthält die Eingaben');
}

await ctx.close();

/* ══ Zugriffsschutz ══════════════════════════════════════════════════ */
{
  const { page: p2, ctx: c2 } = await oeffne(['role_monteur']);
  const body = await p2.textContent('body');
  ok(/Kein Zugriff/i.test(body), 'Monteur sieht den Kein-Zugriff-Screen');
  ok(await p2.locator('#pa_pen').count() === 0, 'Monteur sieht die Eingabefelder nicht');
  await c2.close();
}

await browser.close();
server.close();
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} von ${pass + fail} Prüfungen bestanden`);
process.exit(fail === 0 ? 0 : 1);
