#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   Drift-Guard — el_spannungsfall im Browser (Playwright)

   Prüft, was der Node-Engine-Test NICHT kann: Boot ohne Fehler, die Kette
   Eingabe → Anzeige, Sichtbarkeits-Logik, Persistenz über einen Reload und
   den Zugriffsschutz.

   Ausführen:  CHROME=/opt/pw-browsers/chromium node scripts/spannungsfall_smoke_test.mjs
   Ohne playwright-core wird der Test mit Hinweis übersprungen — nie still.
   ════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function ok(b, t) { if (b) { pass++; } else { fail++; console.log('  ✕ ' + t); } }
function nahe(a, b, tol, t) {
  const d = Math.abs(a - b);
  ok(d <= (tol || 0.01), t + ' — ist ' + a + ', soll ' + b);
}
/* Anzeigetext → Zahl. Die Oberfläche formatiert mit Apostroph-Tausendern,
   Minus-Zeichen «−» (U+2212) und stellt teils eine Einheit voran («CHF 12.30»)
   oder nach («23.68 V») — alles Nicht-Numerische fällt weg. */
function zahl(txt) {
  const s = String(txt == null ? '' : txt).replace(/[’']/g, '').replace(/−/g, '-').replace(',', '.');
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

let pw = null;
try { pw = await import('playwright-core'); }
catch {
  console.log('⚠ ÜBERSPRUNGEN — playwright-core fehlt (npm i --no-save playwright-core).');
  process.exit(0);
}
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';

const { startServer, wireRoutes, seed, BASE } = await import('./rolematrix_harness.mjs');
const server = await startServer();
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

/* Ein Objekt im Seed — ohne gewähltes Objekt speichert AutoSave auf dem
   Basis-Key und macht dort KEINEN Initial-Restore (dokumentiertes Verhalten).
   Für den Persistenz-Test muss also ein Objekt gewählt sein. */
const OBJEKT = {
  id: 'obj_t1', name: 'Testobjekt', strasse: 'Musterweg 1', plz: '4000', ort: 'Basel',
  status: 'aktiv', orgId: 'org_test', erstelltVon: 'u_test'
};
async function seite(roleIds, mitObjekt) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await wireRoutes(ctx);
  const st = seed(roleIds || ['role_elektro_planer']);
  if (mitObjekt) {
    st.gema_objpool_v1 = [OBJEKT];
    st.gema_objekte_v1 = { objekte: [OBJEKT], beteiligte: [], activeObjektId: OBJEKT.id };
    st.gema_active_objekt_v1 = OBJEKT.id;
  }
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, st);
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_spannungsfall.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { page, ctx, fehler };
}
/* Feld setzen wie ein Mensch: leeren, tippen, Recalc abwarten. */
async function tippe(page, id, wert) {
  await page.fill('#' + id, '');
  await page.type('#' + id, String(wert));
  await page.waitForTimeout(120);
}
const txt = (page, id) => page.textContent('#' + id);

/* ══ 1. Boot ════════════════════════════════════════════════════════════ */
console.log('── Boot ──');
{
  const { page, ctx, fehler } = await seite();
  ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
  ok(await page.locator('.gema-hero-title').count() === 1, 'Hero vorhanden');
  ok(await page.locator('.el-card').count() === 4, '4 Schritt-Karten (Eingabe/Berechnung/Ergebnis/Kosten)');
  ok(await page.locator('#metaObjektDropdown').count() === 1, 'Objekt-Bezug vorhanden');
  ok(await page.locator('#sfStub').count() === 0, 'Gerüst-Banner ist entfernt');

  /* Selects sind aus der Fachbasis befüllt — keine leeren Dropdowns. */
  for (const [id, min] of [['sf_system', 2], ['sf_material', 3], ['sf_temp', 5],
                           ['sf_querschnitt', 19], ['sf_xbelag', 4], ['sf_parallel', 4]]) {
    const n = await page.locator('#' + id + ' option').count();
    ok(n >= min, id + ': ' + n + ' Optionen (mind. ' + min + ')');
  }
  ok(await page.inputValue('#sf_querschnitt') === '2.5', 'Querschnitt startet bei 2.5 mm²');
  ok(await page.inputValue('#sf_temp') === '70', 'Temperatur startet bei 70 °C (nicht 20)');
  ok(await page.inputValue('#sf_system') === '3p400', 'Netzsystem startet dreiphasig');

  /* Keine Zahlenfelder mit type="number" (GEMA-Kanon) */
  const numFelder = await page.locator('input[type="number"]').count();
  ok(numFelder === 0, 'kein type="number" im gerenderten DOM');
  await ctx.close();
}

/* ══ 2. Rechenkette Eingabe → Anzeige ═══════════════════════════════════ */
console.log('── Rechenkette ──');
{
  const { page, ctx } = await seite();
  /* Referenzfall: 400 V · 16 A · 100 m · 2.5 mm² · Cu · 70 °C
     ΔU = √3·16·100/(κ·2.5), κ = 56/(1+0.00393·50) = 46.803176 */
  const kappa = 56 / (1 + 0.00393 * 50);
  const duSoll = Math.sqrt(3) * 16 * 100 / (kappa * 2.5);

  nahe(zahl(await txt(page, 'sf_kappa')), kappa, 0.01, 'κ angezeigt');
  nahe(zahl(await txt(page, 'sf_du')), duSoll, 0.01, 'ΔU angezeigt (23.68 V)');
  nahe(zahl(await txt(page, 'sf_duproz')), duSoll / 400 * 100, 0.01, 'ΔU% angezeigt (5.92 %)');
  nahe(zahl(await txt(page, 'sf_uv')), 400 - duSoll, 0.1, 'Spannung am Verbraucher');
  nahe(zahl(await txt(page, 'sf_pv')), 3 * 256 * 100 / (kappa * 2.5), 0.1, 'Verlustleistung');
  ok((await txt(page, 'sf_anorm')).indexOf('4') >= 0, 'nächster Querschnitt 4 mm² wird genannt');

  /* Status muss rot sein — 5.92 % über 5 % */
  const cls = await page.getAttribute('#sf_status', 'class');
  ok(/err/.test(cls), 'Status-Ampel rot bei überschrittenem Grenzwert — ' + cls);
  ok(/überschritten/i.test(await txt(page, 'sf_status')), 'Status nennt die Überschreitung');

  /* Kennzahlen-Leiste folgt */
  nahe(zahl(await txt(page, 'sf_sumDu')), duSoll / 400 * 100, 0.01, 'Kennzahl ΔU% folgt');

  /* Querschnitt auf 16 mm² → grün, ΔU sinkt um Faktor 6.4 */
  await page.selectOption('#sf_querschnitt', '16');
  await page.waitForTimeout(150);
  nahe(zahl(await txt(page, 'sf_du')), duSoll * 2.5 / 16, 0.01, 'ΔU nach Querschnittswechsel');
  ok(/ok/.test(await page.getAttribute('#sf_status', 'class')), 'Status grün bei 16 mm²');

  /* Länge verdoppeln → ΔU verdoppelt sich */
  await tippe(page, 'sf_laenge', 200);
  nahe(zahl(await txt(page, 'sf_du')), duSoll * 2.5 / 16 * 2, 0.02, 'ΔU verdoppelt sich mit der Länge');

  /* Aluminium → κ kleiner, ΔU grösser */
  const duCu = zahl(await txt(page, 'sf_du'));
  await page.selectOption('#sf_material', 'al');
  await page.waitForTimeout(150);
  ok(zahl(await txt(page, 'sf_du')) > duCu * 1.4, 'Aluminium führt zu deutlich höherem ΔU');
  await ctx.close();
}

/* ══ 3. Lastangabe über Leistung ════════════════════════════════════════ */
console.log('── Lastangabe Strom ⇄ Leistung ──');
{
  const { page, ctx } = await seite();
  ok(await page.locator('#sf_wrapStrom').isVisible(), 'Stromfeld sichtbar im Modus «Strom»');
  ok(!(await page.locator('#sf_wrapLeistung').isVisible()), 'Leistungsfeld verborgen');
  ok(!(await page.locator('#sf_rowStrom').isVisible()), 'Strom-Zwischenzeile verborgen');

  await page.selectOption('#sf_modus', 'leistung');
  await page.waitForTimeout(150);
  ok(!(await page.locator('#sf_wrapStrom').isVisible()), 'Stromfeld verborgen im Modus «Leistung»');
  ok(await page.locator('#sf_wrapLeistung').isVisible(), 'Leistungsfeld sichtbar');
  ok(await page.locator('#sf_rowStrom').isVisible(), 'Strom-Zwischenzeile sichtbar');

  /* 10 kW, cos φ 0.9, 400 V dreiphasig → I = 10000/(√3·400·0.9) = 16.037 A */
  await tippe(page, 'sf_leistung', 10);
  await tippe(page, 'sf_cos', 0.9);
  nahe(zahl(await txt(page, 'sf_strombw')), 10000 / (Math.sqrt(3) * 400 * 0.9), 0.01,
       'Strom aus der Leistung angezeigt');
  ok(/√3/.test(await txt(page, 'sf_frmlStrom')), 'Formel-Chip zeigt die dreiphasige Variante');
  await ctx.close();
}

/* ══ 4. Reaktanz und Hinweise ═══════════════════════════════════════════ */
console.log('── Reaktanz und Hinweise ──');
{
  const { page, ctx } = await seite();
  await page.selectOption('#sf_querschnitt', '95');
  await page.waitForTimeout(150);
  ok(await page.locator('#sf_hinweise').isVisible(), 'Hinweisbox erscheint ab 95 mm² ohne X′');
  ok(/induktiv/i.test(await txt(page, 'sf_hinweise')), 'Hinweis nennt den fehlenden induktiven Anteil');
  ok(/0\.00 V/.test(await txt(page, 'sf_duX')), 'ΔU_X ist 0, solange X′ nicht gewählt ist');

  const duOhne = zahl(await txt(page, 'sf_du'));
  await page.selectOption('#sf_xbelag', '0.08');
  await tippe(page, 'sf_cos', 0.8);
  const duMit = zahl(await txt(page, 'sf_du'));
  ok(zahl(await txt(page, 'sf_duX')) > 0, 'mit X′ erscheint ein induktiver Anteil');
  ok(duMit !== duOhne, 'ΔU ändert sich mit dem Reaktanzbelag');

  /* cos φ < 1 OHNE Reaktanz muss als «zu günstig» gemeldet werden. */
  await page.selectOption('#sf_xbelag', '0');
  await page.waitForTimeout(150);
  ok(/cos/i.test(await txt(page, 'sf_hinweise')), 'cos φ < 1 ohne X′ wird gemeldet');
  await ctx.close();
}

/* ══ 5. Kein stiller Deckel über 630 mm² ════════════════════════════════ */
console.log('── Grenze der Querschnittsreihe ──');
{
  const { page, ctx } = await seite();
  await tippe(page, 'sf_strom', 630);
  await tippe(page, 'sf_laenge', 400);
  await tippe(page, 'sf_maxdu', 2);
  const anorm = await txt(page, 'sf_anorm');
  ok(/630/.test(anorm) && /reicht nicht/i.test(anorm),
     'über 630 mm² steht im Ergebnis statt eines leeren Felds — «' + anorm + '»');
  ok(/630/.test(await txt(page, 'sf_hinweise')), 'Hinweis erklärt die Überschreitung');
  ok((await txt(page, 'sf_sumAmin')).indexOf('630') >= 0, 'Kennzahlen-Leiste meldet es ebenfalls');
  await ctx.close();
}

/* ══ 6. Vergleichstabelle ═══════════════════════════════════════════════ */
console.log('── Vergleichstabelle ──');
{
  const { page, ctx } = await seite();
  ok(await page.locator('#sf_varTbody tr').count() === 19, '19 Zeilen (ganze genormte Reihe)');
  const ersteZeile = await page.textContent('#sf_varTbody tr:first-child');
  ok(/gewählt/.test(await page.textContent('#sf_varTbody')), 'gewählter Querschnitt ist markiert');
  ok(/Minimum/.test(await page.textContent('#sf_varTbody')), 'Mindest-Querschnitt ist markiert');
  ok(/überschritten/.test(ersteZeile), '1.5 mm² ist als überschritten ausgewiesen');
  ok(/eingehalten/.test(await page.textContent('#sf_varTbody tr:last-child')),
     '630 mm² ist als eingehalten ausgewiesen');
  await ctx.close();
}

/* ══ 7. Verlustkosten ═══════════════════════════════════════════════════ */
console.log('── Verlustkosten ──');
{
  const { page, ctx } = await seite();
  const pv = zahl(await txt(page, 'sf_pv'));
  nahe(zahl(await txt(page, 'sf_wv')), pv / 1000 * 2000, 0.2, 'Energieverlust bei 100 % Auslastung');
  const kosten100 = zahl(await txt(page, 'sf_kosten'));
  nahe(kosten100, pv / 1000 * 2000 * 0.25, 0.1, 'Kosten = Energie × Preis');

  /* Halbe Auslastung → ein Viertel der Kosten (b², nicht b). */
  await tippe(page, 'sf_auslastung', 50);
  const kosten50 = zahl(await txt(page, 'sf_kosten'));
  nahe(kosten50, kosten100 * 0.25, 0.1, 'halbe Auslastung → ein Viertel der Kosten (b²)');
  ok(Math.abs(kosten50 - kosten100 * 0.5) > 1, 'nicht linear gerechnet');
  await ctx.close();
}

/* ══ 8. Nennspannung folgt dem Netzsystem — nur bei echter Wahl ═════════ */
console.log('── Nennspannung / isTrusted-Guard ──');
{
  const { page, ctx } = await seite();
  ok(await page.inputValue('#sf_u') === '400', 'startet mit 400 V');

  /* Der Restore von GemaAutoSave setzt Selects programmatisch und feuert
     dabei SYNTHETISCHE change-Events (gema_autosave.js: new Event(...)).
     Die dürfen eine erfasste Spannung nicht überschreiben — genau das
     bildet selectOption nach, das ebenfalls synthetisch feuert. */
  await tippe(page, 'sf_u', 690);
  await page.selectOption('#sf_system', '1p230');
  await page.waitForTimeout(150);
  ok(await page.inputValue('#sf_u') === '690', 'synthetischer Wechsel lässt die eigene Spannung stehen');
  ok(zahl(await txt(page, 'sf_du')) > 0, 'gerechnet wird trotzdem neu');

  /* Der Zweig für eine ECHTE Wahl. Über die Tastatur ist er auf einem
     per JS befüllten Select in headless Chromium nicht verlässlich
     auszulösen (der erste Pfeil-Druck wirkt dort nicht) — deshalb wird der
     Handler direkt mit einem trusted-Ereignis aufgerufen. Die verlässliche
     Tastatur-Prüfung läuft unten über den statischen Grenzwert-Select. */
  await page.evaluate(() => sfSysChanged({ isTrusted: true }));
  await page.waitForTimeout(150);
  ok(await page.inputValue('#sf_u') === '230', 'echte Wahl führt die Nennspannung auf 230 V nach');
  await ctx.close();
}

/* ══ 9. Grenzwert-Vorwahl ═══════════════════════════════════════════════ */
console.log('── Grenzwert-Vorwahl ──');
{
  const { page, ctx } = await seite();
  ok(await page.inputValue('#sf_maxdu') === '5', 'Standard 5 % (übrige Verbraucher)');
  /* Echte Tastatur-Wahl auf dem statischen Select — hier ist das Ereignis
     nachweislich trusted, das prüft den isTrusted-Zweig mit einem
     ECHTEN Benutzer-Ereignis. */
  await page.focus('#sf_grenz');
  await page.keyboard.press('ArrowUp');          // 5 % → 3 % (Beleuchtung)
  await page.waitForTimeout(250);
  ok(await page.inputValue('#sf_grenz') === '3', 'Tastatur bewegt den Select (trusted)');
  ok(await page.inputValue('#sf_maxdu') === '3', 'Vorwahl «Beleuchtung» setzt 3 %');
  /* Gegenprobe: der synthetische Weg darf einen eigenen Wert nicht kapern. */
  await tippe(page, 'sf_maxdu', 4.2);
  await page.selectOption('#sf_grenz', '8');
  await page.waitForTimeout(150);
  ok(await page.inputValue('#sf_maxdu') === '4.2', 'synthetischer Wechsel lässt den eigenen Grenzwert stehen');
  /* Eigener Wert bleibt bestehen und wirkt auf die Bewertung. */
  await tippe(page, 'sf_maxdu', 10);
  ok(/ok/.test(await page.getAttribute('#sf_status', 'class')),
     '5.92 % ist bei einem Grenzwert von 10 % eingehalten');
  await ctx.close();
}

/* ══ 10. Persistenz über den Reload ═════════════════════════════════════ */
console.log('── Persistenz ──');
{
  const { page, ctx } = await seite(null, true);   // mit gewähltem Objekt
  ok(await page.inputValue('#metaObjektDropdown') === 'obj_t1', 'Objekt ist gewählt');

  await tippe(page, 'sf_laenge', 137);
  await tippe(page, 'sf_strom', 63);
  await tippe(page, 'sf_u', 690);                  // bewusst abweichend vom Systemwert
  await page.selectOption('#sf_querschnitt', '35');
  await page.selectOption('#sf_material', 'al');
  await page.waitForTimeout(5600);                 // echter AutoSave-Debounce (5 s)

  const duVor = zahl(await txt(page, 'sf_du'));
  const key = 'gema_spannungsfall__obj_t1';
  const snap = await page.evaluate(k => localStorage.getItem(k), key);
  ok(!!snap, 'AutoSave-Snapshot pro Objekt angelegt (' + key + ')');
  ok(snap && snap.indexOf('fold') < 0, 'Fold-Zustand NICHT im Snapshot (Geräte-UI)');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);                 // Restore + Recalc abwarten

  ok(await page.inputValue('#sf_laenge') === '137', 'Länge überlebt den Reload');
  ok(await page.inputValue('#sf_strom') === '63', 'Strom überlebt den Reload');
  ok(await page.inputValue('#sf_querschnitt') === '35', 'Querschnitt überlebt den Reload');
  ok(await page.inputValue('#sf_material') === 'al', 'Material überlebt den Reload');
  /* Die Kern-Regression: der Restore setzt sf_system programmatisch. Ohne den
     isTrusted-Guard würde sfSysChanged die eigene Spannung mit 400 V
     überschreiben — der Wert wäre still weg. */
  ok(await page.inputValue('#sf_u') === '690', 'eigene Nennspannung überlebt den Restore');
  nahe(zahl(await txt(page, 'sf_du')), duVor, 0.02, 'ΔU nach dem Reload unverändert');
  await ctx.close();
}

/* ══ 11. Zugriffsschutz ═════════════════════════════════════════════════ */
console.log('── Zugriffsschutz ──');
{
  const { page, ctx } = await seite(['role_monteur']);
  const body = await page.textContent('body');
  ok(/Kein Zugriff/i.test(body || ''), 'Monteur sieht «Kein Zugriff»');
  ok(!/Reaktanzbelag/.test(body || ''), 'Monteur sieht die Eingabefelder nicht');
  await ctx.close();
}
{
  const { page, ctx, fehler } = await seite(['role_elektro_planer']);
  ok(fehler.length === 0, 'Elektroplaner: Modul lädt fehlerfrei');
  ok(await page.locator('#sf_querschnitt').count() === 1, 'Elektroplaner: voller Zugriff');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
