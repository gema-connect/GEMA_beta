// Drift-Guard zum Feedback-Export vom 27.07.2026 (Sandro Caso, 9 Punkte).
//
//  LU-Tabelle  (1) mehrstellige Anzahl-Eingabe («Eingabe 10 geht nicht»)
//  Prüfliste   (2) Titelbild für den Bericht
//              (3) Prüfpunkte einzeln löschbar
//              (4) freies Objekt mit Adresse + Objekttyp (immer wählbar)
//              (5) Zustand NICHT automatisch setzen
//              (6) Fotos aus der Mediathek (nicht nur Kamera)
//  Saugpumpe   (7) Dampfdruck-Kurve mit Live-Betriebspunkt
//              (8) NPSH aus dem Lieferanten-Katalog
//              (9) vereinfachte Druckverlustberechnung (l/s, ohne LU)
//
// Ausführen (aus einem Ordner, über dem playwright-core liegt):
//   CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/feedback_20260727_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (b, msg) => { if (b) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };

const PLANER = ['role_planer'];

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

  // ═══════════════════════ LU-Tabelle: Punkt 1 ═══════════════════════
  {
    console.log('\nLU-Tabelle — Anzahl-Eingabe');
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/sb_lu_tabelle.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#deviceList .device-row', { timeout: 15000 });

    const row = page.locator('#deviceList .device-row').first();
    await row.locator('select').first().selectOption({ label: 'Waschtisch' });
    const qty = row.locator('input').first();

    // Zeichenweise tippen — genau der Fall aus dem Feedback.
    await qty.click();
    await qty.fill('');
    await page.keyboard.type('10', { delay: 60 });
    ok(await qty.inputValue() === '10', 'Anzahl-Feld hält «10» (war: ' + await qty.inputValue() + ')');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'INPUT'),
       'Fokus bleibt beim Tippen im Feld');

    // Ergebniszellen der Zeile folgen ohne Voll-Render
    const total = (await row.locator('span').last().textContent()) || '';
    const totalTxt = (await row.textContent()) || '';
    ok(/20 LU/.test(totalTxt), 'Zeilen-Total rechnet mit 10 Waschtischen (20 LU)');
    const foot = (await page.locator('#deviceList .device-total').textContent()) || '';
    ok(/20 LU/.test(foot), 'Total-Fusszeile aktualisiert sich mit');

    // dreistellig
    await qty.fill('');
    await page.keyboard.type('125', { delay: 40 });
    ok(await qty.inputValue() === '125', 'auch dreistellige Eingabe bleibt erhalten');
    await ctx.close();
  }

  // ═══════════════════════ Prüfliste: Punkte 2–6 ═══════════════════════
  {
    console.log('\nPrüfliste — Begehung');
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.prNeu === 'function', { timeout: 15000 });

    // Engine-Prüfungen (DOM-frei)
    const eng = await page.evaluate(() => {
      const E = window._prEngine;
      return {
        typen: E.PR_OBJEKTTYPEN.map(t => t.id),
        lblEfh: E.prObjekttypLabel('efh'),
        lblFrei: E.prObjekttypLabel('sonstiges', 'Museum'),
        adr: E.prFreieAdresse({ strasse: 'Musterstrasse', nr: '12a', plz: '4000', ort: 'Basel' }),
        adrTeil: E.prFreieAdresse({ strasse: 'Musterstrasse', ort: 'Basel' }),
        adrLeer: E.prFreieAdresse({}),
        reihe: E.PR_BEWERTUNG_REIHE[0]
      };
    });
    ok(Array.isArray(eng.typen) && ['efh', 'mfh', 'wgh', 'schulhaus', 'restaurant', 'buero'].every(x => eng.typen.includes(x)),
       'Objekttypen enthalten EFH/MFH/WGH/Schulhaus/Restaurant/Bürogebäude');
    ok(eng.lblEfh === 'Einfamilienhaus (EFH)', 'Objekttyp-Label auflösbar');
    ok(eng.lblFrei === 'Museum', 'Freitext-Objekttyp gewinnt bei «sonstiges»');
    ok(eng.adr === 'Musterstrasse 12a, 4000 Basel', 'freie Adresse wird korrekt zusammengesetzt');
    ok(eng.adrTeil === 'Musterstrasse, Basel', 'unvollständige Adresse ohne leere Teile');
    ok(eng.adrLeer === '', 'leere Adresse bleibt leer');
    ok(eng.reihe === 'nicht_bewertet', 'Zustands-Auswahl beginnt bei «nicht bewertet»');

    // Neue Begehung + Anlage
    await page.evaluate(() => window.prNeu());
    await page.waitForSelector('#edOv.open', { timeout: 8000 });

    // (4) Adressfelder + Objekttyp
    ok(await page.locator('#eStrasse').count() === 1, 'freies Objekt: Strassenfeld vorhanden');
    ok(await page.locator('#eNr').count() === 1, 'freies Objekt: Hausnummer-Feld vorhanden');
    ok(await page.locator('#ePlz').count() === 1, 'freies Objekt: PLZ-Feld vorhanden');
    ok(await page.locator('#eOrt').count() === 1, 'freies Objekt: Ort-Feld vorhanden');
    ok(await page.locator('#eObjTyp').count() === 1, 'Objekttyp-Select vorhanden');

    await page.fill('#eStrasse', 'Musterstrasse');
    await page.dispatchEvent('#eStrasse', 'change');
    await page.fill('#eNr', '12a');
    await page.dispatchEvent('#eNr', 'change');
    await page.fill('#ePlz', '4000');
    await page.dispatchEvent('#ePlz', 'change');
    await page.fill('#eOrt', 'Basel');
    await page.dispatchEvent('#eOrt', 'change');
    await page.selectOption('#eObjTyp', 'mfh');
    const nachAdr = await page.evaluate(() => ({ adr: window._prHooks ? null : null, cur: JSON.parse(JSON.stringify(window.__cur || {})) })).catch(() => null);
    const state1 = await page.evaluate(() => {
      const b = (window.prCurrent && window.prCurrent()) || null;
      return b ? { adr: b.objektAdresse, typ: b.objekttyp, fa: b.freieAdresse } : null;
    });
    ok(state1 && state1.adr === 'Musterstrasse 12a, 4000 Basel', 'Adresse landet als objektAdresse im Record');
    ok(state1 && state1.typ === 'mfh', 'Objekttyp im Record gespeichert');

    // «Sonstiges» blendet das Freitextfeld ein
    await page.selectOption('#eObjTyp', 'sonstiges');
    ok(await page.locator('#eObjTypFreiWrap').isVisible(), '«Sonstiges» blendet das Freitextfeld ein');
    await page.selectOption('#eObjTyp', 'mfh');
    ok(!(await page.locator('#eObjTypFreiWrap').isVisible()), 'Freitextfeld wieder ausgeblendet');

    // (2) Titelbild-Bedienung vorhanden
    ok(await page.locator('#eTitelbild').count() === 1, 'Titelbild-Bereich im Kopf vorhanden');
    const tbBtns = await page.locator('#eTitelbild button').count();
    ok(tbBtns >= 2, 'Titelbild: Kamera- UND Mediathek-Knopf');
    // Titelbild setzen (ohne Datei-Dialog) und im Bericht prüfen
    await page.evaluate(() => {
      const b = window.prCurrent();
      b.titelbild = { dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' };
      window.prRefreshTitelbild();
    });
    ok(await page.locator('#eTitelbild .tb-prev img').count() === 1, 'Titelbild-Vorschau erscheint');

    // Anlage + Prüfpunkte
    await page.evaluate(() => window.prAddAnlage('abwasser'));
    await page.waitForSelector('.pkt', { timeout: 5000 });
    const pkte = await page.locator('.pkt').count();
    ok(pkte > 0, 'Anlage bringt Standard-Prüfpunkte mit (' + pkte + ')');

    // (3) jeder Prüfpunkt hat einen Lösch-Knopf
    const delBtns = await page.locator('.pkt .row-del').count();
    ok(delBtns === pkte, 'jeder Prüfpunkt hat einen Lösch-Knopf (' + delBtns + '/' + pkte + ')');
    await page.locator('.pkt .row-del').first().click();
    await page.waitForTimeout(120);
    ok(await page.locator('.pkt').count() === pkte - 1, 'Prüfpunkt lässt sich einzeln entfernen');

    // (5) Zustand bleibt leer, bis er gewählt wird
    const first = page.locator('.pkt').first();
    await first.locator('.ans .ans-btn').nth(1).click();  // «Nein» bzw. 2. Option
    await page.waitForTimeout(120);
    const zustand = await page.evaluate(() => {
      const b = window.prCurrent();
      const p = b.anlagen[0].punkte[0];
      return { antwort: p.antwort, bewertung: p.bewertung, empf: p.empfehlung || '' };
    });
    ok(zustand.antwort != null, 'Antwort wird gesetzt');
    ok(zustand.bewertung === 'nicht_bewertet', 'Zustand bleibt «nicht bewertet» (kein Auto-Zustand)');
    const chipTxt = (await page.locator('.pkt').first().locator('.bw-chip').first().textContent()) || '';
    ok(/nicht bewertet/.test(chipTxt), 'Zustands-Chip zeigt «nicht bewertet»');
    // manuell setzen wirkt weiterhin
    await page.evaluate(() => window.prSetBewertung(0, 0, 'maessig'));
    ok(await page.evaluate(() => window.prCurrent().anlagen[0].punkte[0].bewertung) === 'maessig',
       'manuell gewählter Zustand wird übernommen');
    // Auswahl-Reihenfolge im Select: «nicht bewertet» zuerst
    const optFirst = await page.locator('.pkt-more select').first().locator('option').first().getAttribute('value');
    ok(optFirst === 'nicht_bewertet', '«nicht bewertet» steht als erste Option');

    // (6) Foto: Kamera + Mediathek
    await page.evaluate(() => window.prTogglePkt(0, 0));
    const fotoBtns = page.locator('#fotos_0_0 button.icobtn');
    ok(await fotoBtns.count() === 2, 'Foto-Bereich hat Kamera- UND Mediathek-Knopf');
    const inpAttrs = await page.evaluate(() => {
      const out = {};
      const orig = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function () {
        out.type = this.type; out.capture = this.getAttribute('capture'); out.multiple = this.multiple;
      };
      window.prAddFoto(0, 0, 'galerie');
      const galerie = Object.assign({}, out);
      window.prAddFoto(0, 0, 'kamera');
      const kamera = Object.assign({}, out);
      HTMLInputElement.prototype.click = orig;
      return { galerie, kamera };
    });
    ok(inpAttrs.galerie.capture === null, 'Mediathek-Knopf erzwingt NICHT die Kamera');
    ok(inpAttrs.galerie.multiple === true, 'Mediathek erlaubt Mehrfachauswahl');
    ok(inpAttrs.kamera.capture === 'environment', 'Kamera-Knopf öffnet weiterhin die Kamera');

    // Bericht: Titelbild + Objekttyp + Adresse auf dem Deckblatt
    const bericht = await page.evaluate(() => {
      let html = '';
      const orig = window.open;
      window.open = () => ({ document: { write: h => { html = h; }, close() {} }, close() {}, print() {} });
      window.prBericht();
      window.open = orig;
      return html;
    });
    ok(/class="titelbild"/.test(bericht), 'Bericht: Titelbild auf dem Deckblatt');
    ok(/Objekttyp/.test(bericht) && /Mehrfamilienhaus/.test(bericht), 'Bericht: Objekttyp in der Meta-Tabelle');
    ok(/Musterstrasse 12a, 4000 Basel/.test(bericht), 'Bericht: erfasste Adresse erscheint');
    await ctx.close();
  }

  // ═══════════════════════ Saugpumpe: Punkte 7–9 ═══════════════════════
  {
    console.log('\nSaugpumpe');
    const { ctx, page } = await newPage(browser, seed(PLANER));
    await page.goto(BASE + '/sb_saugpumpe.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.sgRecalc === 'function', { timeout: 15000 });

    // ── (9) Engine: Druckverlust der Saugleitung ──
    const e = await page.evaluate(() => {
      // Referenz von Hand: PE 100 SDR 11, 50x4.6 → di 40.8 mm, Q = 2 l/s, 10 °C
      const t = 10, Q = 2;
      const r = sgAbschnittDp({ sysId: 'pe100_sdr11', dn: '50x4.6', laenge: 10, zeta: 4.5 }, Q, t);
      const di = 0.0408, A = Math.PI / 4 * di * di, v = (Q / 1000) / A;
      const rho = sgDichte(t), nu = sgViskositaet(t), Re = v * di / nu;
      const A2 = Math.log10((0.007 / 40.8) / 3.7 + 5.74 / Math.pow(Re, 0.9));
      const lam = 0.25 / (A2 * A2);
      const soll = lam * (10 / di) * (rho / 2) * v * v + 4.5 * (rho / 2) * v * v;
      const ges = sgLeitungDp([
        { sysId: 'pe100_sdr11', dn: '50x4.6', laenge: 10, zeta: 4.5 },
        { sysId: 'pe100_sdr11', dn: '50x4.6', laenge: 5, zeta: 0 }
      ], Q, t);
      return {
        v: r.v, vSoll: v, dp: r.dp, dpSoll: soll, Re: r.Re,
        summe: ges.pf, summeSoll: r.dp + sgAbschnittDp({ sysId: 'pe100_sdr11', dn: '50x4.6', laenge: 5, zeta: 0 }, Q, t).dp,
        laminar: sgLambda(1000, 0.007, 40.8), nu10: sgViskositaet(10), nu20: sgViskositaet(20),
        unbekannt: sgAbschnittDp({ sysId: 'gibtsnicht', dn: 'x', laenge: 1, zeta: 1 }, Q, t)
      };
    });
    ok(Math.abs(e.v - e.vSoll) < 1e-9, 'Fliessgeschwindigkeit v = Q/A');
    ok(Math.abs(e.dp - e.dpSoll) < 1e-6, 'Δp = λ·(L/di)·(ρ/2)·v² + Σζ·(ρ/2)·v²');
    ok(e.Re > 4000, 'Reynolds im turbulenten Bereich (' + Math.round(e.Re) + ')');
    ok(Math.abs(e.summe - e.summeSoll) < 1e-6, 'Summe über mehrere Abschnitte');
    ok(Math.abs(e.laminar - 64 / 1000) < 1e-12, 'laminar: λ = 64/Re');
    ok(Math.abs(e.nu10 - 1.307e-6) < 1e-12 && Math.abs(e.nu20 - 1.0038e-6) < 1e-12, 'Viskosität aus der Tafel');
    ok(e.unbekannt === null, 'unbekanntes Rohrsystem liefert null statt NaN');

    // ── (9) UI: Rechner ein → pf wird übernommen und gesperrt ──
    await page.fill('#sg_t', '10');
    await page.dispatchEvent('#sg_t', 'input');
    ok(!(await page.locator('#slPanel').isVisible()), 'Rechner startet eingeklappt');
    await page.check('#sl_aktiv');
    await page.waitForTimeout(150);
    ok(await page.locator('#slPanel').isVisible(), 'Rechner klappt auf');
    ok(await page.locator('#slBody tr').count() === 1, 'startet mit einem Abschnitt');

    await page.fill('#sl_q', '2');
    await page.dispatchEvent('#sl_q', 'input');
    await page.waitForTimeout(150);
    const pfFeld = await page.inputValue('#sg_pf');
    const pfBerechnet = await page.evaluate(() =>
      sgLeitungDp(slState.abschnitte, slState.q, sgNum('sg_t')).pf);
    ok(Math.abs(parseFloat(pfFeld) - Math.round(pfBerechnet)) < 0.51, 'pf-Feld übernimmt das Ergebnis (' + pfFeld + ' Pa)');
    ok(await page.evaluate(() => document.getElementById('sg_pf').readOnly), 'pf-Feld ist gesperrt, solange der Rechner läuft');
    const hf = await page.textContent('#sg_out_hf');
    ok(/[1-9]/.test(hf || ''), 'Hf folgt dem berechneten pf (' + hf + ')');

    // Temperaturänderung schlägt über die Dichte durch
    const pfVor = await page.inputValue('#sg_pf');
    await page.fill('#sg_t', '60');
    await page.dispatchEvent('#sg_t', 'input');
    await page.waitForTimeout(150);
    const pfNach = await page.inputValue('#sg_pf');
    ok(pfVor !== pfNach, 'Temperaturwechsel rechnet die Leitung nach (' + pfVor + ' → ' + pfNach + ')');
    await page.fill('#sg_t', '10');
    await page.dispatchEvent('#sg_t', 'input');

    // Abschnitt hinzufügen / entfernen
    await page.click('.sl-add');
    await page.waitForTimeout(120);
    ok(await page.locator('#slBody tr').count() === 2, 'Abschnitt hinzufügen');
    await page.locator('#slBody .sl-del').last().click();
    await page.waitForTimeout(120);
    ok(await page.locator('#slBody tr').count() === 1, 'Abschnitt entfernen');

    // Formstück-Auswahl → Σζ
    await page.locator('#slBody .sl-zbtn').first().click();
    await page.waitForSelector('#fsBg.open', { timeout: 4000 });
    await page.evaluate(() => {
      document.querySelectorAll('#fsBody .fs-cnt').forEach(el => { el.value = '0'; });
      const set = (id, n) => {
        const el = document.querySelector('#fsBody .fs-cnt[data-fs="' + id + '"]');
        if (el) { el.value = String(n); }
      };
      set('fussventil', 1); set('bogen90', 2);
      window.slFsChange();
    });
    const sum = await page.textContent('#fsSum');
    ok(/5\.00/.test(sum || ''), 'Σζ = 1×4.0 + 2×0.5 = 5.00 (' + sum + ')');
    await page.click('#fsBg .fs-ok');
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => slState.abschnitte[0].zeta) === 5, 'Σζ landet im Abschnitt');
    ok(await page.evaluate(() => slState.abschnitte[0].fs.bogen90) === 2, 'Formstück-Mengen bleiben editierbar gespeichert');

    // Persistenz: JSON im hidden Textarea, Restore stellt her
    const gespeichert = await page.inputValue('#sg_saugltg');
    ok(/"aktiv":true/.test(gespeichert) && /"zeta":5/.test(gespeichert), 'Zustand liegt als JSON im hidden Feld');
    await page.evaluate(() => { slState = { aktiv: false, q: 1, abschnitte: [] }; slRender(); });
    await page.evaluate(() => { slRestore(); slRender(); slRecalc(); });
    ok(await page.evaluate(() => slState.abschnitte[0].zeta) === 5, 'Restore stellt den Stand wieder her');

    // Rechner aus → Feld wieder frei
    await page.uncheck('#sl_aktiv');
    await page.waitForTimeout(120);
    ok(!(await page.evaluate(() => document.getElementById('sg_pf').readOnly)), 'Rechner aus → pf wieder manuell erfassbar');

    // ── (7) Dampfdruck-Kurve ──
    await page.fill('#sg_t', '20');
    await page.dispatchEvent('#sg_t', 'input');
    await page.waitForTimeout(150);
    const svg = await page.innerHTML('#sgDdChart');
    ok(/<svg/.test(svg), 'Dampfdruck-Kurve wird als SVG gezeichnet');
    ok(/<polyline/.test(svg), 'Kurve als Polyline vorhanden');
    ok(/circle[^>]*fill="#dc2626"/.test(svg), 'Betriebspunkt ist rot');
    ok((svg.match(/stroke="#dc2626"[^>]*stroke-dasharray/g) || []).length >= 2,
       'zwei gestrichelte Hilfslinien (zu Temperatur- und Druckachse)');
    ok(/Temperatur \[°C\]/.test(svg) && /Dampfdruck \[mbar\]/.test(svg), 'Achsen sind mit °C und mbar beschriftet');
    ok(/20\.0 °C/.test(svg), 'Betriebspunkt-Label zeigt die eingestellte Temperatur');
    ok(/23\.4/.test(svg), 'Druck-Label zeigt den Tafelwert in mbar (23.4 bei 20 °C)');
    ok(!/var\(--/.test(svg), 'nur literale Farben im SVG (GemaPDF-Regel)');

    // live: Temperatur ändern → Punkt wandert
    await page.fill('#sg_t', '80');
    await page.dispatchEvent('#sg_t', 'input');
    await page.waitForTimeout(150);
    const svg80 = await page.innerHTML('#sgDdChart');
    ok(/80\.0 °C/.test(svg80), 'Kurve folgt der Temperatur live');
    ok(!/20\.0 °C/.test(svg80), 'alter Betriebspunkt ist weg');
    const note80 = await page.textContent('#sgDdChartNote');
    // gegen die Tafel des Moduls prüfen (linear interpoliert), nicht gegen eine Handzahl
    const pv80 = await page.evaluate(() => (sgDampfdruck(80) / 100).toFixed(1));
    ok((note80 || '').indexOf(pv80) >= 0, 'Hinweistext nennt den Dampfdruck in mbar (' + pv80 + ')');
    await page.fill('#sg_t', '10');
    await page.dispatchEvent('#sg_t', 'input');

    // ── (8) NPSH aus dem Lieferanten-Katalog ──
    ok(await page.locator('.np-btn').count() === 1, 'Knopf «Aus Lieferanten-Katalog» beim NPSH-Feld');
    // leerer Katalog → klarer Hinweis statt leeres Modal
    await page.click('.np-btn');
    await page.waitForSelector('#npBg.open', { timeout: 4000 });
    ok(/Produktkatalog/.test(await page.textContent('#npBody')), 'leerer Katalog erklärt sich');
    await page.click('#npBg .fs-x');

    // Katalog mit zwei Pumpen bestücken
    await page.evaluate(() => {
      window.GemaProdukte.getProdukte = () => ([
        { id: 'p1', kategorie: 'saugpumpe', status: 'verifiziert', lieferantFirma: 'Musterpumpen AG',
          daten: { serie: 'JP', modell: '5', npsh: 3.2, bauart: 'Jetpumpe (Ejektorpumpe)', foerdermenge: 6 } },
        { id: 'p2', kategorie: 'saugpumpe', status: 'nicht_verifiziert', lieferantFirma: 'Zweitpumpen GmbH',
          daten: { serie: 'SP', modell: '2', npsh: 1.4, bauart: 'Selbstansaugende Kreiselpumpe', foerdermenge: 4 } }
      ]);
      window.GemaProdukte.getProdukt = (id) => window.GemaProdukte.getProdukte().filter(p => p.id === id)[0] || null;
    });
    await page.click('.np-btn');
    await page.waitForSelector('#npBg.open', { timeout: 4000 });
    ok(await page.locator('.np-item').count() === 2, 'beide Katalog-Pumpen erscheinen');
    const ersteTxt = (await page.locator('.np-item').first().textContent()) || '';
    ok(/1\.4/.test(ersteTxt), 'kleinster NPSH zuerst (beste Reserve)');
    ok(/verifiziert/.test((await page.textContent('#npBody')) || ''), 'Verifizierungs-Status ist ausgewiesen');
    await page.locator('.np-item').first().click();
    await page.waitForTimeout(150);
    ok(await page.inputValue('#sg_npsh') === '1.4', 'NPSH wird ins Feld übernommen');
    ok(/Zweitpumpen GmbH/.test((await page.textContent('#np_src')) || ''), 'Herkunft des Werts wird ausgewiesen');
    ok(await page.inputValue('#sg_npsh_src') !== '', 'Herkunft wird mit der Berechnung gespeichert');
    const hmaxNach = await page.textContent('#sg_out_hmax');
    ok(/[0-9]/.test(hmaxNach || ''), 'Ergebnis rechnet mit dem übernommenen NPSH');

    // manuelles Übertippen löst die Herkunft
    await page.fill('#sg_npsh', '2.5');
    await page.dispatchEvent('#sg_npsh', 'input');
    await page.waitForTimeout(100);
    ok((await page.textContent('#np_src')) === '', 'manuelle Eingabe löst die Katalog-Herkunft');
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' Checks bestanden, ' + fail + ' fehlgeschlagen');
  process.exit(fail ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
