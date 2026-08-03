/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test el_leistungsbedarf (Playwright)
   ════════════════════════════════════════════════════════════════════════
     CHROME=/opt/pw-browsers/chromium node scripts/leistungsbedarf_smoke_test.mjs

   Prüft das Modul so, wie es benutzt wird:
     A  Boot ohne Fehler, Gerüst-Banner weg, Aufbau steht
     B  Rechenkette im UI (Motor → I_N, I_A, Motorschutz, Drehmoment)
     C  Anlaufart wirkt — Stern-Dreieck koppelt an den Direktfaktor
     D  Summe, Zuleitung und Anlauf-Spannungsfall
     E  Grenzen werden angezeigt statt verschwiegen
     F  Persistenz über einen Reload (GemaAutoSave + Snapshot-Fallback)
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
const enthaelt = (t, s, m) => ok(String(t || '').indexOf(s) >= 0,
  m + ' (erwartet «' + s + '» in «' + String(t || '').trim().slice(0, 120) + '»)');

const server = await startServer();
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seed(roleIds || ['role_elektro_planer']));
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_leistungsbedarf.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return { page, ctx, fehler };
}

/* Die Felder sind bewusst type="text" (GEMA-Kanon) — Wert setzen + input. */
const setzeFeld = async (page, sel, wert) => {
  await page.fill(sel, String(wert));
  await page.dispatchEvent(sel, 'input');
  await page.waitForTimeout(140);
};
const txt = (page, sel) => page.textContent(sel);
/* Kennwert-Chip einer aufgeklappten Zeile: <span class="lb-val">Label <b>Wert</b></span>.
   Die Beschriftung wird EXAKT verglichen — «M_N» darf nicht auf
   «Motorschutzschalter» treffen. */
const chip = (page, i, label) => page.locator('[data-vals="' + i + '"] .lb-val')
  .evaluateAll((els, l) => {
    for (const e of els) {
      const b = e.querySelector('b');
      if (!b) continue;
      let lab = '';
      for (const k of e.childNodes) { if (k === b) break; lab += k.textContent; }
      if (lab.trim() === l) return b.textContent.trim();
    }
    return '';
  }, label);

/* ══ A — Boot & Aufbau ════════════════════════════════════════════════ */
console.log('── A: Boot & Aufbau ──');
{
  const { page, ctx, fehler } = await oeffne();
  ok(fehler.length === 0, 'keine pageerrors — ' + fehler.join(' | '));
  ok(await page.locator('.el-stub').count() === 0, 'Gerüst-Banner ist entfernt');
  ok(await page.locator('.el-card').count() === 5, '5 Schritt-Karten');
  for (const f of ['netz', 'verbraucher', 'anschluss', 'anlauf', 'ergebnis'])
    ok(await page.locator('.el-card[data-fold="' + f + '"]').count() === 1, 'Karte «' + f + '» vorhanden');

  ok(await page.locator('input[type="number"]').count() === 0, 'kein einziges type="number" (GEMA-Kanon)');
  const ohneBlur = await page.locator('input[inputmode="decimal"]:not([onblur])').count();
  ok(ohneBlur === 0, 'alle Dezimalfelder tragen fixLeadingZero (' + ohneBlur + ' ohne)');

  /* Startzustand: genau ein Motor, aufgeklappt, gerechnet. */
  ok(await page.locator('#lb_rowsBody tr.lb-hd').count() === 1, 'Startzeile: ein Motor');
  ok(await page.locator('#lb_rowsBody tr.lb-det').count() === 1, 'die Motorzeile startet aufgeklappt');
  enthaelt(await txt(page, '#lb_sum1'), 'A', 'die Kennzahlen-Leiste rechnet beim Start');
  ok((await page.locator('.frml').count()) >= 3, 'Formel-Chips an den zentralen Ergebnissen');
  await ctx.close();
}

/* ══ B — Rechenkette im UI ═══════════════════════════════════════════ */
console.log('\n── B: Rechenkette (7.5 kW Motor) ──');
{
  const { page, ctx, fehler } = await oeffne();
  /* 7.5 kW, 400 V, cos 0.85, η IE3 0.904 → I_N = 14.09 A, I_A = 84.53 A */
  enthaelt(await txt(page, 'td[data-o="iN"][data-i="0"]'), '14.09', 'I_N = 14.09 A in der Zeile');
  enthaelt(await txt(page, 'td[data-o="iA"][data-i="0"]'), '84.53', 'I_A = 6 × I_N = 84.53 A');
  enthaelt(await chip(page, 0, 'η'), '0.904', 'η kommt aus der IE3-Reihe');
  enthaelt(await chip(page, 0, 'η'), 'IE3', 'die Herkunft des Wirkungsgrads steht dabei');
  enthaelt(await chip(page, 0, 'S'), '9.76', 'Scheinleistung 9.76 kVA');
  enthaelt(await chip(page, 0, 'Motorschutzschalter'), '16 A', 'Motorschutzschalter 16 A');
  enthaelt(await chip(page, 0, 'Motorschutzschalter'), '14.09', 'der Auslöser wird auf I_N eingestellt');
  enthaelt(await chip(page, 0, 'MN'), '49.4', 'M_N = 9550 · 7.5 / 1450 = 49.4 Nm');
  enthaelt(await chip(page, 0, 'MN'), '1\u2019450', 'die zugehörige Drehzahl steht dabei');
  enthaelt(await chip(page, 0, 'MA'), '98.8', 'M_A = 2 × M_N = 98.8 Nm');

  /* Eigener Wirkungsgrad gewinnt IMMER — auch bei einer Katalogleistung. */
  const etaFeld = page.locator('tr.lb-det input').nth(1);               // cos φ, η, g …
  await etaFeld.fill('0.85');
  await etaFeld.dispatchEvent('input');
  await page.waitForTimeout(160);
  enthaelt(await chip(page, 0, 'η'), '0.850', 'ein eigener Wirkungsgrad wird übernommen');
  enthaelt(await chip(page, 0, 'η'), 'eigen', 'und als eigener Wert ausgewiesen');
  enthaelt(await txt(page, 'td[data-o="iN"][data-i="0"]'), '14.98', 'I_N folgt dem eigenen η (14.98 A)');
  ok(fehler.length === 0, 'keine pageerrors in der Rechenkette');
  await ctx.close();
}

/* ══ C — Anlaufart ═══════════════════════════════════════════════════ */
console.log('\n── C: Anlaufart wirkt ──');
{
  const { page, ctx } = await oeffne();
  const anlauf = page.locator('tr.lb-det select').first();
  await anlauf.selectOption('stern');
  await page.waitForTimeout(180);
  enthaelt(await txt(page, 'td[data-o="iA"][data-i="0"]'), '28.18', 'Stern-Dreieck: I_A = 2 × I_N = 28.18 A');
  enthaelt(await chip(page, 0, 'IA/IN'), '2.00', 'der Faktor 2.00 steht als Kennwert');

  /* Datenblatt-Faktor 7 beim Direktanlauf → Stern-Dreieck koppelt auf 7/3. */
  await anlauf.selectOption('direkt');
  await page.waitForTimeout(140);
  const fFeld = page.locator('tr.lb-det input').nth(3);   // cos φ, η, g, I_A/I_N
  await fFeld.fill('7');
  await fFeld.dispatchEvent('input');
  await page.waitForTimeout(160);
  enthaelt(await txt(page, 'td[data-o="iA"][data-i="0"]'), '98.62', 'Direktanlauf mit Datenblatt-Faktor 7 → 98.62 A');
  await anlauf.selectOption('stern');
  await page.waitForTimeout(180);
  enthaelt(await chip(page, 0, 'IA/IN'), '2.33', 'Stern-Dreieck rechnet 7/3 = 2.33 (gekoppelt, nicht fix 2)');
  enthaelt(await chip(page, 0, 'IA/IN'), 'Typenschild', 'die Herkunft des Faktors steht dabei');
  await ctx.close();
}

/* ══ D — Summe, Zuleitung, Anlauf-Spannungsfall ══════════════════════ */
console.log('\n── D: Summe, Zuleitung, Anlauf ──');
{
  const { page, ctx } = await oeffne();
  await page.click('.lb-add button >> nth=1');            // ＋ Verbraucher
  await page.waitForTimeout(200);
  ok(await page.locator('#lb_rowsBody tr.lb-hd').count() === 2, 'zweite Zeile angelegt');

  /* Verbraucher 10 kW, Vorgabe cos φ = 1.0 → I = 10000/692.8203 = 14.43 A,
     I_B = 14.0885 + 14.4338 = 28.52 A */
  const zweite = page.locator('#lb_rowsBody tr.lb-hd').nth(1);
  const pFeld = zweite.locator('input').nth(2);           // Bezeichnung, Anzahl, kW
  await pFeld.fill('10');
  await pFeld.dispatchEvent('input');
  await page.waitForTimeout(180);
  enthaelt(await txt(page, '#lb_ib'), '28.52', 'I_B = 28.52 A');
  enthaelt(await txt(page, '#lb_in'), '32 A', 'Schutzorgan der Zuleitung 32 A');
  enthaelt(await txt(page, '#lb_qs'), 'mm²', 'Querschnitt der Zuleitung bestimmt');
  enthaelt(await txt(page, '#lb_sum2'), 'kW', 'Anschlussleistung in der Kennzahlen-Leiste');

  /* Anlauf: der 7.5-kW-Motor ist massgebend */
  enthaelt(await txt(page, '#lb_anMotor'), 'Direktanlauf', 'massgebender Motor benannt');
  enthaelt(await txt(page, '#lb_iAnlauf'), '98.96', 'I_Anlauf = 28.52 − 14.09 + 84.53 = 98.96 A');

  /* Spannungsfall braucht eine Länge — vorher keine erfundene Zahl. */
  enthaelt(await txt(page, '#lb_duAn'), 'Länge', 'ohne Länge wird kein Spannungsfall behauptet');
  await setzeFeld(page, '#lb_laenge', '30');
  enthaelt(await txt(page, '#lb_duAn'), '%', 'mit Länge erscheint der Spannungsfall');
  /* κ bei Betriebstemperatur, NICHT κ₂₀ = 56 */
  enthaelt(await txt(page, '#lb_kappa'), '46.80', 'κ Cu bei 70 °C = 46.80 (nicht 56)');
  enthaelt(await txt(page, '#lb_kappa'), '70 °C', 'die Bezugstemperatur steht dabei');
  await ctx.close();
}

/* ══ E — Grenzen werden gemeldet ═════════════════════════════════════ */
console.log('\n── E: kein stiller Deckel ──');
{
  const { page, ctx } = await oeffne();
  const mld = () => txt(page, '#lb_meldungen');

  /* 8 kW liegt nicht in der IE3-Reihe → geschätzt, aber gemeldet. */
  const kw = page.locator('#lb_rowsBody tr.lb-hd').first().locator('input').nth(2);
  await kw.fill('8');
  await kw.dispatchEvent('input');
  await page.waitForTimeout(200);
  enthaelt(await mld(), 'IE3-Reihe', 'Leistung ausserhalb der IE3-Reihe wird gemeldet');
  enthaelt(await chip(page, 0, 'η'), 'geschätzt', 'der geschätzte Wirkungsgrad ist als solcher markiert');

  /* 75 kW → über der Motorschutzschalter-Reihe (125 A) */
  await kw.fill('75');
  await kw.dispatchEvent('input');
  await page.waitForTimeout(220);
  enthaelt(await mld(), '125 A', 'kein Motorschutzschalter in der Reihe → gemeldet');
  enthaelt(await chip(page, 0, 'Motorschutzschalter'), '—', 'und kein erfundener Wert im Kennwert');

  /* Temperatur über dem Tabellenbereich → kein Faktor, kein Querschnitt */
  await kw.fill('7.5');
  await kw.dispatchEvent('input');
  await setzeFeld(page, '#lb_tumg', '70');
  enthaelt(await mld(), 'Tabellenbereich', 'Temperatur über der Tabelle wird gemeldet');
  enthaelt(await txt(page, '#lb_qs'), '—', 'ohne Faktor wird kein Querschnitt behauptet');
  ok((await page.locator('#lb_status').getAttribute('class') || '').indexOf('err') >= 0,
     'der Status steht auf «nicht vollständig»');

  /* Erdverlegung wechselt den Temperatur-Bezug (20 °C statt 30 °C) */
  await setzeFeld(page, '#lb_tumg', '30');
  await page.selectOption('#lb_verlegeart', 'D');
  await page.waitForTimeout(200);
  enthaelt(await txt(page, '#lb_tempLbl'), 'Bodentemperatur', 'Erdverlegung fragt die Bodentemperatur');
  enthaelt(await txt(page, '#lb_tempHint'), '20 °C', 'Bezug 20 °C nach NIN Tab. 19');
  await ctx.close();
}

/* ══ F — Persistenz über einen Reload ════════════════════════════════ */
console.log('\n── F: Persistenz ──');
{
  const { page, ctx } = await oeffne();
  await setzeFeld(page, '#lb_laenge', '42');
  await setzeFeld(page, '#lb_gGlobal', '0.8');
  await page.click('.lb-add button >> nth=1');            // ＋ Verbraucher
  await page.waitForTimeout(200);
  const bez = page.locator('#lb_rowsBody tr.lb-hd').nth(1).locator('input').first();
  await bez.fill('Beleuchtung EG');
  await bez.dispatchEvent('input');
  await page.waitForTimeout(200);
  await page.evaluate(() => { if (window.GemaAutoSave) GemaAutoSave.save(); });
  await page.waitForTimeout(300);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);                        // Snapshot-Fallback 700/1800
  ok(await page.inputValue('#lb_laenge') === '42', 'die Länge überlebt den Reload');
  ok(await page.inputValue('#lb_gGlobal') === '0.8', 'die Gleichzeitigkeit überlebt den Reload');
  ok(await page.locator('#lb_rowsBody tr.lb-hd').count() === 2, 'beide Zeilen sind wieder da');
  ok(await page.locator('#lb_rowsBody tr.lb-hd').nth(1).locator('input').first().inputValue()
     === 'Beleuchtung EG', 'die Bezeichnung der zweiten Zeile überlebt den Reload');
  enthaelt(await txt(page, '#lb_ib'), 'A', 'nach dem Reload wird sofort wieder gerechnet');

  /* Der Fold-Zustand ist Geräte-UI und darf NIE im AutoSave-Schnappschuss liegen. */
  const snap = await page.evaluate(() => localStorage.getItem('gema_leistungsbedarf') || '');
  ok(snap.indexOf('gema_el_fold_v1') < 0 && snap.indexOf('"fold"') < 0,
     'der Fold-Zustand steckt nicht im AutoSave-Schnappschuss');
  await page.click('.el-card[data-fold="netz"] .el-card-hd');
  await page.waitForTimeout(160);
  ok((await page.evaluate(() => localStorage.getItem('gema_el_fold_v1'))) !== null,
     'der Fold-Zustand liegt in seinem eigenen Geräte-Key');
  const snap2 = await page.evaluate(() => localStorage.getItem('gema_leistungsbedarf') || '');
  ok(snap2.indexOf('netz') < 0, 'und wandert auch danach nicht in den AutoSave-Schnappschuss');
  await ctx.close();
}

/* ══ G — Kein Zugriff ════════════════════════════════════════════════ */
console.log('\n── G: Kein Zugriff für role_monteur ──');
{
  const { page, ctx } = await oeffne(['role_monteur']);
  const body = (await page.textContent('body')) || '';
  ok(body.indexOf('Kein Zugriff') >= 0, 'der Monteur sieht den «Kein Zugriff»-Screen');
  ok(await page.locator('#lb_rowsBody').count() === 0, 'die Berechnung wird nicht gerendert');
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
