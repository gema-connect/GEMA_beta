/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test el_leistungsbedarf (Playwright)
   ════════════════════════════════════════════════════════════════════════
   Boot, Rechenkette, Verhalten der Verbrauchertabelle, Persistenz über
   einen Reload und Zugriffsschutz.

   Wichtigste Prüfung ist die FOKUS-REGEL: die Zeilen-Eingaben dürfen die
   Liste beim Tippen NICHT neu bauen, sonst springt der Fokus nach dem
   ersten Zeichen weg und aus «123» wird «3». Genau diese Falle ist in
   GEMA mehrfach dokumentiert (sb_lu_tabelle, sb_druckverlust).

   Die Zahlen stammen aus derselben unabhängigen Referenzrechnung wie
   scripts/leistungsbedarf_engine_test.mjs.

   AUSFÜHREN:
     CHROME=/opt/pw-browsers/chromium node scripts/leistungsbedarf_smoke_test.mjs
   ════════════════════════════════════════════════════════════════════════ */
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let pw;
try { pw = await import('playwright-core'); }
catch {
  console.error('✗ playwright-core fehlt — npm i --no-save playwright-core');
  process.exit(1);
}
const { startServer, wireRoutes, seed, BASE } = await import('./rolematrix_harness.mjs');

let n = 0, fail = 0;
const t = (name, cond) => { n++; if (!cond) { fail++; console.error('  ✗ FAIL: ' + name); } };
const near = (name, a, b, tol) => t(`${name} (${a} ≈ ${b})`, isFinite(a) && Math.abs(a - b) <= tol);
const zahl = (s) => parseFloat(String(s || '').replace(/[’']/g, '').replace(/[^0-9.\-]/g, ''));

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
  await page.goto(BASE + '/el_leistungsbedarf.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  return { ctx, page, fehler };
}
const P_FELD = 'tr[data-row="0"] td:nth-child(3) input';

try {
  /* ══ 1. Boot ═══════════════════════════════════════════════════════ */
  console.log('— Boot —');
  {
    const { ctx, page, fehler } = await oeffne();
    t('keine pageerrors — ' + fehler.join(' | '), fehler.length === 0);
    t('Gerüst-Banner entfernt', await page.locator('.el-stub').count() === 0);
    t('fünf Schritt-Karten', await page.locator('.el-card').count() === 5);
    t('Hero vorhanden', await page.locator('.gema-hero-title').count() === 1);
    t('Objekt-Bezug vorhanden', await page.locator('#metaObjektDropdown').count() === 1);
    t('drei Verbrauchergruppen vorbelegt', await page.locator('#lbRows tr[data-row]').count() === 3);
    t('Verbrauchertyp-Select gefüllt (12 Typen)',
      await page.locator('tr[data-row="0"] select option').count() === 12);
    t('Verdrosselungs-Select gefüllt', await page.locator('#lb_verdrosselung option').count() === 4);
    t('Zeilen-JSON ist versteckt', !(await page.locator('#lb_rows').isVisible()));
    await ctx.close();
  }

  /* ══ 2. Rechenkette ════════════════════════════════════════════════ */
  console.log('— Rechenkette —');
  {
    const { ctx, page } = await oeffne();
    near('Σ P_inst = 107 kW', zahl(await page.textContent('#lb_pInst')), 107, 0.05);
    near('Σ P_b = 62.5 kW', zahl(await page.textContent('#lb_pB')), 62.5, 0.05);
    near('Σ Q_b = 38.63 kvar', zahl(await page.textContent('#lb_qB')), 38.63, 0.05);
    near('S = 73.48 kVA', zahl(await page.textContent('#lb_sB')), 73.48, 0.05);
    near('cos φ = 0.851', zahl(await page.textContent('#lb_cosGes')), 0.851, 0.002);
    near('I_b = 106.1 A', zahl(await page.textContent('#lb_iB')), 106.05, 0.15);
    near('Q_C = 18.09 kvar', zahl(await page.textContent('#lb_qC')), 18.09, 0.05);

    /* Zeilen-Ergebnisspalten werden nachgezogen */
    near('Zeile 3 P_b = 38.50 kW',
      zahl(await page.textContent('tr[data-row="2"] [data-pb]')), 38.5, 0.02);
    near('Zeile 3 Q_b = 28.88 kvar',
      zahl(await page.textContent('tr[data-row="2"] [data-qb]')), 28.875, 0.02);
    near('Total-Fusszeile P_b', zahl(await page.textContent('#lb_tPb')), 62.5, 0.05);

    /* Kacheln */
    t('2 Stufen à 12.5 kvar', /2\s*×\s*12\.5/.test(await page.textContent('#lb_pfStufenVal')));
    t('Vorsicherung 125 → 100 A', /125.*100/.test(await page.textContent('#lb_pfSichVal')));
    t('unverdrosselt gemeldet', /unverdrosselt/.test(await page.textContent('#lb_pfResVal')));
    t('Verdrosselung bei 15 % nichtlinear angemahnt',
      (await page.getAttribute('#lb_pfRes', 'class') || '').includes('warn'));

    /* Kennzahlen-Leiste */
    near('Leiste P_b', zahl(await page.textContent('#lb_sum1')), 62.5, 0.1);
    near('Leiste I_b', zahl(await page.textContent('#lb_sum2')), 106.05, 0.15);
    near('Leiste cos φ', zahl(await page.textContent('#lb_sum3')), 0.851, 0.002);

    t('Annahmen werden aufgelistet', await page.locator('#lb_annahmen li').count() >= 3);
    t('Strombelastbarkeit ist verlinkt',
      await page.locator('#lb_annahmen a[href="el_belastbarkeit.html"]').count() === 1);
    t('Leistungsdreieck gezeichnet', (await page.innerHTML('#lbDreieck')).includes('<line'));
    /* Tiefstellungen als tspan, nicht als roher Unterstrich */
    t('Dreieck zeigt die Kompensationsstrecke Q_C',
      (await page.textContent('#lbDreieck')).includes('C, inst'));
    t('keine rohen Unterstriche in den Beschriftungen',
      !/[A-Za-z]_[A-Za-z0-9]/.test(await page.textContent('#lbDreieck')));

    /* Wirtschaftlichkeit */
    near('eingesparte Kosten ≈ 169 CHF/a', zahl(await page.textContent('#lb_kosten')), 169, 3);
    await ctx.close();
  }

  /* ══ 3. FOKUS-REGEL ════════════════════════════════════════════════ */
  console.log('— Fokus-Regel beim Tippen —');
  {
    const { ctx, page } = await oeffne();
    await page.click(P_FELD);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('123');            // drei Zeichen nacheinander
    t('alle drei Zeichen sind angekommen', await page.inputValue(P_FELD) === '123');
    t('der Fokus liegt noch im selben Feld',
      await page.evaluate(s => document.activeElement === document.querySelector(s), P_FELD));
    await page.waitForTimeout(150);
    near('und das Ergebnis ist nachgezogen',
      zahl(await page.textContent('tr[data-row="0"] [data-pb]')), 123, 0.05);

    /* Auch das Total und der Bemessungsstrom folgen live */
    near('Σ P_b enthält den neuen Wert',
      zahl(await page.textContent('#lb_pB')), 123 + 12 + 38.5, 0.1);
    await ctx.close();
  }

  /* ══ 4. Tabelle bedienen ═══════════════════════════════════════════ */
  console.log('— Zeilen hinzufügen, wählen, löschen —');
  {
    const { ctx, page } = await oeffne();
    await page.click('.lb-add');
    await page.waitForTimeout(150);
    t('vierte Zeile angelegt', await page.locator('#lbRows tr[data-row]').count() === 4);

    /* Typ-Wahl setzt g und cos φ als Startwert */
    await page.selectOption('tr[data-row="3"] select', 'wp');
    await page.waitForTimeout(150);
    t('Wärmepumpe setzt cos φ 0.85',
      await page.inputValue('tr[data-row="3"] td:nth-child(5) input') === '0.85');
    t('und g = 1', await page.inputValue('tr[data-row="3"] td:nth-child(4) input') === '1');

    /* Eigene Angabe überschreibt den Startwert und bleibt stehen */
    await page.fill('tr[data-row="3"] td:nth-child(5) input', '0.7');
    await page.waitForTimeout(150);
    t('eigener cos φ bleibt erhalten',
      await page.inputValue('tr[data-row="3"] td:nth-child(5) input') === '0.7');

    await page.click('tr[data-row="3"] .lb-del');
    await page.waitForTimeout(150);
    t('Zeile wieder entfernt', await page.locator('#lbRows tr[data-row]').count() === 3);

    /* Alle Zeilen weg → ehrlicher Leerzustand statt Scheinergebnis */
    for (let i = 2; i >= 0; i--) { await page.click(`tr[data-row="${i}"] .lb-del`); await page.waitForTimeout(80); }
    t('Leerzustand wird erklärt',
      /Noch keine Verbrauchergruppe/.test(await page.textContent('#lbRows')));
    t('Status meldet die fehlende Eingabe',
      /Noch keine Verbrauchergruppe/.test(await page.textContent('#lb_status')));
    t('Dreieck zeigt einen Hinweis statt Linien',
      (await page.textContent('#lbDreieck')).includes('Verbrauchergruppen erfassen'));
    await ctx.close();
  }

  /* ══ 5. Bewertung folgt dem IST-cos-φ ══════════════════════════════ */
  console.log('— Bewertung —');
  {
    const { ctx, page } = await oeffne();
    /* Ziel bewusst tief setzen — eine gesunde Anlage darf dadurch nicht
       plötzlich als kompensationsbedürftig gelten (Fehler der Vorlage). */
    await page.fill('tr[data-row="2"] td:nth-child(5) input', '0.98');
    await page.fill('#lb_cosZiel', '0.5');
    await page.selectOption('#lb_verdrosselung', 'p7');
    await page.waitForTimeout(200);
    t('guter Ist-Wert trotz tiefem Ziel → grün',
      (await page.getAttribute('#lb_status', 'class') || '').includes('ok'));
    t('und es steht «keine Kompensation nötig»',
      /keine Kompensation nötig/.test(await page.textContent('#lb_status')));

    /* Jetzt umgekehrt: schlechter Ist-Wert */
    await page.fill('tr[data-row="2"] td:nth-child(5) input', '0.6');
    await page.fill('#lb_cosZiel', '0.95');
    await page.waitForTimeout(200);
    t('schlechter Ist-Wert → rot',
      (await page.getAttribute('#lb_status', 'class') || '').includes('err'));

    /* Überkompensation durch grobe Stufung */
    await page.fill('#lb_stufe', '100');
    await page.waitForTimeout(200);
    t('grobe Stufung → Warnung',
      (await page.getAttribute('#lb_status', 'class') || '').includes('warn'));
    t('Überkompensation benannt', /berkompensiert/.test(await page.textContent('#lb_status')));
    await ctx.close();
  }

  /* ══ 6. Persistenz über Reload ═════════════════════════════════════ */
  console.log('— Persistenz —');
  {
    const { ctx, page } = await oeffne();
    t('kein Objekt gewählt — der Snapshot-Fallback ist der einzige Restore-Pfad',
      await page.inputValue('#metaObjektDropdown') === '');

    await page.fill(P_FELD, '77');
    await page.fill('#lb_cosZiel', '0.92');
    await page.click('.lb-add');
    await page.waitForTimeout(200);
    const pbVor = zahl(await page.textContent('#lb_pB'));
    await page.evaluate(() => window.GemaAutoSave && window.GemaAutoSave.save());
    await page.waitForTimeout(300);
    t('AutoSave hat gespeichert',
      await page.evaluate(() => !!localStorage.getItem('gema_leistungsbedarf')));
    t('das Zeilen-JSON steckt im Snapshot',
      await page.evaluate(() => (localStorage.getItem('gema_leistungsbedarf') || '').includes('lb_rows')));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    t('vier Zeilen wiederhergestellt', await page.locator('#lbRows tr[data-row]').count() === 4);
    t('geänderte Leistung wiederhergestellt', await page.inputValue(P_FELD) === '77');
    t('Ziel-cos φ wiederhergestellt', await page.inputValue('#lb_cosZiel') === '0.92');
    near('Ergebnis nach Reload neu gerechnet', zahl(await page.textContent('#lb_pB')), pbVor, 0.05);
    await ctx.close();
  }

  /* ══ 7. Fold ═══════════════════════════════════════════════════════ */
  console.log('— Fold —');
  {
    const { ctx, page } = await oeffne();
    await page.locator('.el-card .el-card-hd').first().click();
    await page.waitForTimeout(200);
    t('Karte klappt zu', await page.locator('.el-card.zu').count() === 1);
    t('Fold ist Geräte-UI, nicht im AutoSave-Snapshot',
      await page.evaluate(() => {
        const s = localStorage.getItem('gema_leistungsbedarf');
        return (localStorage.getItem('gema_el_fold_v1') || '').includes('el_leistungsbedarf')
          && (!s || !s.includes('fold'));
      }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    t('Fold überlebt den Reload', await page.locator('.el-card.zu').count() === 1);
    await ctx.close();
  }

  /* ══ 8. Zugriff ════════════════════════════════════════════════════ */
  console.log('— Zugriff —');
  {
    const { ctx, page } = await oeffne(['role_monteur']);
    t('Monteur bekommt «Kein Zugriff»', /Kein Zugriff/i.test(await page.textContent('body') || ''));
    await ctx.close();
  }
  {
    const { ctx, page, fehler } = await oeffne(['role_elektro_planer']);
    t('Elektroplaner: Modul lädt fehlerfrei', fehler.length === 0);
    t('Elektroplaner: Ergebnis sichtbar', zahl(await page.textContent('#lb_iB')) > 0);
    await ctx.close();
  }
  {
    const { ctx, page } = await oeffne(['role_planer']);
    t('Sanitärplaner hat ebenfalls Zugriff (_allPerms)',
      await page.locator('#lb_iB').count() === 1);
    await ctx.close();
  }

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
