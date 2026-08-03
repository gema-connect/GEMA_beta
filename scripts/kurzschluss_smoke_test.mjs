/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test el_kurzschluss (Playwright)
   ════════════════════════════════════════════════════════════════════════
   Prüft die Seite so, wie sie benutzt wird: Boot ohne Fehler, die Rechen-
   kette von der Eingabe bis zum Nachweis, das Verhalten der Eingabe-
   Gruppen, die Wiederherstellung über einen Reload und den Zugriffsschutz.

   Die Zahlen stammen aus derselben unabhängigen Referenzrechnung wie
   scripts/kurzschluss_engine_test.mjs (Trafo 630 kVA / 50 m / 16 mm² Cu /
   LS C 32 A → I_k max 4.22 kA, I_k min 1589 A, L_max 254 m).

   AUSFÜHREN:
     CHROME=/opt/pw-browsers/chromium node scripts/kurzschluss_smoke_test.mjs

   Ohne playwright-core/Chromium bricht der Test mit Hinweis ab — er wird
   nie stillschweigend als bestanden gemeldet.
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
/* Anzeigewerte tragen Tausender-Apostroph (elFmt) — für den Vergleich weg. */
const zahl = (s) => parseFloat(String(s || '').replace(/[’']/g, '').replace(/[^0-9.\-]/g, ''));

const server = await startServer();
const browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, seed(roleIds || ['role_elektro_planer'], opts));
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_kurzschluss.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { ctx, page, fehler };
}

try {
  /* ══ 1. Boot ═══════════════════════════════════════════════════════ */
  console.log('— Boot —');
  {
    const { ctx, page, fehler } = await oeffne();
    t('keine pageerrors — ' + fehler.join(' | '), fehler.length === 0);
    t('Gerüst-Banner ist entfernt', await page.locator('.el-stub').count() === 0);
    t('fünf Schritt-Karten', await page.locator('.el-card').count() === 5);
    t('Hero vorhanden', await page.locator('.gema-hero-title').count() === 1);
    t('Objekt-Bezug vorhanden', await page.locator('#metaObjektDropdown').count() === 1);
    t('GemaElektro geladen',
      await page.evaluate(() => !!(window.GemaElektro && window.GemaElektro.EL_C_FAKTOR)));

    /* Selects sind aus der Fachbasis befüllt, nicht von Hand gepflegt */
    t('Querschnitt-Select aus EL_QUERSCHNITTE (19 Werte)',
      await page.locator('#kz_querschnitt option').count() === 19);
    t('Material-Select aus EL_MATERIAL (3 Werte)',
      await page.locator('#kz_material option').count() === 3);
    /* B/C/D (IEC 60898-1) + K (IEC 60947-2) + Z (herstellerspezifisch) + manuell */
    t('Schutz-Select: 5 LS-Typen + manuell',
      await page.locator('#kz_schutzTyp option').count() === 6);
    t('Select für das Gerät davor ist gleich bestückt',
      await page.locator('#kz_vorTyp option').count() === 6);
    await ctx.close();
  }

  /* ══ 2. Rechenkette mit den Vorgabewerten ══════════════════════════ */
  console.log('— Rechenkette —');
  {
    const { ctx, page } = await oeffne();
    near('I_k max ≈ 4.22 kA', zahl(await page.textContent('#kz_ikMax')), 4.22, 0.02);
    near('I_k min ≈ 1589 A', zahl(await page.textContent('#kz_ikMin')), 1589, 3);
    near('Z gesamt ≈ 0.0603 Ω', zahl(await page.textContent('#kz_zGesamt')), 0.0603, 0.0002);
    near('Z Leitung ≈ 0.0559 Ω', zahl(await page.textContent('#kz_zLeitung2')), 0.0559, 0.0002);
    near('κ kalt = 56', zahl(await page.textContent('#kz_kappaKalt')), 56, 0.01);
    near('κ warm ≈ 46.80', zahl(await page.textContent('#kz_kappaWarm')), 46.80, 0.02);

    t('Abschaltbedingung grün',
      (await page.getAttribute('#kz_pfAb', 'class') || '').includes('ok'));
    t('Nachweis-Text nennt erfüllt',
      /erfüllt/.test(await page.textContent('#kz_pfAbVal')));
    near('L_max ≈ 254 m', zahl(await page.textContent('#kz_pfLenVal')), 253.9, 1.5);
    t('Schaltvermögen ausreichend',
      /ausreichend/.test(await page.textContent('#kz_pfIcnVal')));
    t('Gesamtstatus ok', (await page.getAttribute('#kz_status', 'class') || '').includes('ok'));

    /* Kennzahlen-Leiste spiegelt die Ergebnisse */
    near('Leiste I_k max', zahl(await page.textContent('#kz_sum1')), 4.22, 0.02);
    near('Leiste I_k min', zahl(await page.textContent('#kz_sum2')), 1589, 3);
    t('Leiste Abschaltbedingung', /erfüllt/.test(await page.textContent('#kz_sum3')));

    /* Annahmen sind sichtbar, nicht versteckt */
    t('Annahmen werden aufgelistet', await page.locator('#kz_annahmen li').count() >= 2);
    t('Schema ist gezeichnet', (await page.innerHTML('#kzSchema')).includes('<rect'));
    t('Schema nennt den Fehlerort', (await page.textContent('#kzSchema')).includes('Fehlerort'));
    await ctx.close();
  }

  /* ══ 3. Live-Reaktion auf Eingaben ═════════════════════════════════ */
  console.log('— Live-Reaktion —');
  {
    const { ctx, page } = await oeffne();

    /* Längere, dünnere Leitung → Nachweis muss kippen */
    await page.fill('#kz_laenge', '400');
    await page.selectOption('#kz_querschnitt', '2.5');
    await page.waitForTimeout(200);
    t('400 m auf 2.5 mm²: Status err',
      (await page.getAttribute('#kz_status', 'class') || '').includes('err'));
    t('Nachweis-Kachel rot',
      (await page.getAttribute('#kz_pfAb', 'class') || '').includes('err'));
    t('Text nennt «nicht erfüllt»',
      /nicht erfüllt/.test(await page.textContent('#kz_pfAbVal')));
    t('Status erklärt die Abhilfe',
      /Querschnitt|Leitung|Kennlinie/.test(await page.textContent('#kz_status')));

    /* Zurück auf 16 mm² und kurze Leitung → wieder grün */
    await page.fill('#kz_laenge', '50');
    await page.selectOption('#kz_querschnitt', '16');
    await page.waitForTimeout(200);
    t('zurück auf 50 m / 16 mm²: wieder ok',
      (await page.getAttribute('#kz_status', 'class') || '').includes('ok'));

    /* Temperatur wirkt nur auf I_k min — der fachliche Kern */
    const maxVor = zahl(await page.textContent('#kz_ikMax'));
    const minVor = zahl(await page.textContent('#kz_ikMin'));
    await page.selectOption('#kz_temp', '90');
    await page.waitForTimeout(200);
    near('I_k max bleibt bei 90 °C unverändert', zahl(await page.textContent('#kz_ikMax')), maxVor, 0.001);
    t('I_k min sinkt bei 90 °C', zahl(await page.textContent('#kz_ikMin')) < minVor);

    /* Kennlinie D braucht mehr Strom als C */
    await page.selectOption('#kz_temp', '70');
    await page.selectOption('#kz_schutzTyp', 'D');
    await page.waitForTimeout(200);
    t('Typ D: I_a 640 A im Nachweis-Text',
      /640/.test(await page.textContent('#kz_pfAbSub')));
    await ctx.close();
  }

  /* ══ 4. Eingabe-Gruppen schalten mit ═══════════════════════════════ */
  console.log('— Eingabe-Gruppen —');
  {
    const { ctx, page } = await oeffne();
    t('Trafo-Felder sichtbar, I_k-Felder verborgen',
      await page.locator('#kzTrafoBox').isVisible() && !(await page.locator('#kzIkBox').isVisible()));

    await page.selectOption('#kz_speise', 'ik');
    await page.waitForTimeout(200);
    t('Umschalten auf I_k″: Trafo-Felder verborgen', !(await page.locator('#kzTrafoBox').isVisible()));
    t('Umschalten auf I_k″: I_k-Felder sichtbar', await page.locator('#kzIkBox').isVisible());
    t('R/X-Annahme wird als Hinweis gemeldet',
      /R\/X/.test(await page.textContent('#kz_annahmen')));

    /* Ohne Leitung muss der gemeldete Strom exakt herauskommen */
    await page.fill('#kz_ikSpeise', '10');
    await page.fill('#kz_laenge', '0');
    await page.waitForTimeout(200);
    near('ohne Leitung ergibt sich wieder 10 kA',
      zahl(await page.textContent('#kz_ikMax')), 10.00, 0.01);

    await page.selectOption('#kz_speise', 'trafo');
    await page.selectOption('#kz_schutzTyp', 'manuell');
    await page.waitForTimeout(200);
    t('manueller I_a: Feld erscheint', await page.locator('#kzIaBox').isVisible());
    t('manueller I_a: Nennstrom-Feld verborgen', !(await page.locator('#kz_in').isVisible()));
    await ctx.close();
  }

  /* ══ 5. Kein stiller Deckel ════════════════════════════════════════ */
  console.log('— Grenzfälle werden gemeldet —');
  {
    const { ctx, page } = await oeffne();
    await page.selectOption('#kz_schutzTyp', 'manuell');
    await page.fill('#kz_iaManuell', '200000');
    await page.waitForTimeout(200);
    t('unerreichbarer I_a: L_max = 0 statt leerer Anzeige',
      zahl(await page.textContent('#kz_pfLenVal')) === 0);
    t('und die Begründung steht dabei',
      /keiner Länge erfüllbar/.test(await page.textContent('#kz_pfLenSub')));

    /* Unvollständige Eingabe darf keinen grünen Nachweis vortäuschen */
    await page.selectOption('#kz_schutzTyp', 'C');
    await page.fill('#kz_sTrafo', '0');
    await page.fill('#kz_uk', '0');
    await page.waitForTimeout(200);
    const klasse = await page.getAttribute('#kz_status', 'class') || '';
    t('ohne Speisung kein grüner Status', !klasse.includes(' ok'));
    t('ohne Speisung wird gesagt, was fehlt',
      /Speisung/.test(await page.textContent('#kz_status')));
    await ctx.close();
  }

  /* ══ 6. Persistenz über Reload ═════════════════════════════════════ */
  console.log('— Persistenz —');
  {
    const { ctx, page } = await oeffne();
    /* Ohne gewähltes Objekt macht GemaAutoSave.init KEINEN Initial-Restore
       (es steigt über #metaObjektDropdown.value ein). Der Snapshot-Fallback
       im Modul ist hier also der einzige Weg zurück — genau das wird unten
       geprüft. */
    t('kein Objekt gewählt — Fallback ist der einzige Restore-Pfad',
      await page.inputValue('#metaObjektDropdown') === '');
    await page.fill('#kz_laenge', '123');
    await page.selectOption('#kz_querschnitt', '35');
    await page.selectOption('#kz_material', 'al');
    await page.waitForTimeout(200);
    const minVor = zahl(await page.textContent('#kz_ikMin'));
    /* AutoSave schreibt debounced (5 s) — hier bewusst erzwingen. */
    await page.evaluate(() => window.GemaAutoSave && window.GemaAutoSave.save());
    await page.waitForTimeout(300);
    t('AutoSave hat unter dem Basis-Key gespeichert',
      await page.evaluate(() => !!localStorage.getItem('gema_kurzschluss')));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);   // deckt den 700-ms-Fallback ab
    t('Länge 123 m wiederhergestellt', await page.inputValue('#kz_laenge') === '123');
    t('Querschnitt 35 mm² wiederhergestellt', await page.inputValue('#kz_querschnitt') === '35');
    t('Material Aluminium wiederhergestellt', await page.inputValue('#kz_material') === 'al');
    near('Ergebnis nach Reload neu gerechnet', zahl(await page.textContent('#kz_ikMin')), minVor, 1);
    await ctx.close();
  }

  /* ══ 7. Fold-Zustand ═══════════════════════════════════════════════ */
  console.log('— Fold —');
  {
    const { ctx, page } = await oeffne();
    await page.locator('.el-card .el-card-hd').first().click();
    await page.waitForTimeout(200);
    t('Karte klappt zu', await page.locator('.el-card.zu').count() === 1);
    t('Fold liegt in der Geräte-UI, nicht im AutoSave-Snapshot',
      await page.evaluate(() => {
        const s = localStorage.getItem('gema_kurzschluss');
        return (localStorage.getItem('gema_el_fold_v1') || '').includes('el_kurzschluss')
          && (!s || !s.includes('fold'));
      }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    t('Fold-Zustand überlebt den Reload', await page.locator('.el-card.zu').count() === 1);
    await ctx.close();
  }

  /* ══ 8. Zugriffsschutz ═════════════════════════════════════════════ */
  console.log('— Zugriff —');
  {
    const { ctx, page } = await oeffne(['role_monteur']);
    t('Monteur bekommt «Kein Zugriff»', /Kein Zugriff/i.test(await page.textContent('body') || ''));
    await ctx.close();
  }
  {
    const { ctx, page, fehler } = await oeffne(['role_elektro_planer']);
    t('Elektroplaner: Modul lädt fehlerfrei', fehler.length === 0);
    t('Elektroplaner: Ergebnis sichtbar', zahl(await page.textContent('#kz_ikMax')) > 0);
    await ctx.close();
  }
  {
    const { ctx, page } = await oeffne(['role_planer']);
    t('Sanitärplaner hat ebenfalls Zugriff (_allPerms)',
      await page.locator('#kz_ikMax').count() === 1);
    await ctx.close();
  }

  /* ══ Selektivität & Backup ═════════════════════════════════════════ */
  console.log('— Selektivität & Backup —');
  {
    const { ctx, page, fehler } = await oeffne();

    /* Ohne Gerät davor bleibt die Karte leer statt etwas zu behaupten. */
    t('ohne Gerät davor: erklärender Leerzustand',
      await page.locator('#kz_selLeer').isVisible());
    t('ohne Gerät davor: keine Auswertung sichtbar',
      !(await page.locator('#kz_selBody').isVisible()));

    /* C 63 A davor über C 32 A danach — I5 danach 320 A > I4 davor 315 A. */
    await page.fill('#kz_inVor', '63');
    await page.waitForTimeout(120);
    t('Auswertung erscheint', await page.locator('#kz_selBody').isVisible());
    t('Auslösebereich danach 160 A … 320 A',
      /160\s*A\s*…\s*320\s*A/.test(await page.textContent('#kz_selNach')));
    t('Auslösebereich davor 315 A … 630 A',
      /315\s*A\s*…\s*630\s*A/.test(await page.textContent('#kz_selVor')));
    t('Kurzschlussbereich überschneidet sich',
      (await page.textContent('#kz_pfKsVal')).includes('überschneidet'));
    t('Staffelgrenze = I4 davor (315 A)',
      (await page.textContent('#kz_selGrenze')).includes('315'));
    t('Quelle wird als rechnerisch ausgewiesen',
      (await page.textContent('#kz_selQuelle')).includes('rechnerisch'));
    t('Nennstromverhältnis 1 : 1.97',
      (await page.textContent('#kz_selVerh')).includes('1.97'));
    t('nicht selektiv gemeldet',
      (await page.textContent('#kz_selStatus')).includes('Nicht selektiv'));
    t('und ausdrücklich als kein Sicherheitsmangel eingeordnet',
      (await page.textContent('#kz_selStatus')).includes('Kein Sicherheitsmangel'));
    t('der Gesamtstatus warnt, verurteilt aber nicht',
      (await page.getAttribute('#kz_status', 'class')).includes('warn'));

    /* Bänder werden gezeichnet und liegen auf einer gemeinsamen Skala. */
    const breite = await page.evaluate(() => ({
      n: document.getElementById('kz_bandNach').style.width,
      v: document.getElementById('kz_bandVor').style.width
    }));
    t('beide Auslösebänder haben eine Breite',
      /%$/.test(breite.n) && /%$/.test(breite.v) && parseFloat(breite.n) > 0);

    /* Katalogwert hebt die Grenze — der geprüfte Wert gewinnt. */
    await page.fill('#kz_is', '6');
    await page.waitForTimeout(120);
    t('Katalogwert wird als Quelle ausgewiesen',
      (await page.textContent('#kz_selQuelle')).includes('Koordinationstabelle'));
    t('mit Katalogwert selektiv',
      (await page.textContent('#kz_selStatus')).includes('Selektiv bei diesem'));
    await page.fill('#kz_is', '');

    /* Backup deckt ein zu kleines I_cn — dafür gibt es die Kaskadierung. */
    await page.fill('#kz_icn', '3');
    await page.waitForTimeout(120);
    t('ohne Backup ist I_cn 3 kA zu klein',
      (await page.textContent('#kz_pfIcnVal')).includes('zu klein'));
    await page.fill('#kz_iBackup', '25');
    await page.waitForTimeout(120);
    t('mit Backup läuft der Nachweis über die Kombination',
      (await page.textContent('#kz_pfIcnVal')).includes('Backup'));
    t('Backup-Kachel meldet geschützt',
      (await page.textContent('#kz_pfBackVal')).includes('geschützt'));
    t('der Verzicht auf I_cn ≥ I_k max wird in den Annahmen begründet',
      (await page.textContent('#kz_annahmen')).includes('Backup-Kombination'));

    /* Backup-Grenze unter I_k max: auch die Kombination trägt dann nicht. */
    await page.fill('#kz_iBackup', '2');
    await page.waitForTimeout(120);
    t('Backup-Grenze unter I_k max ⇒ überschritten',
      (await page.textContent('#kz_pfBackVal')).includes('überschritten'));
    t('und der Gesamtstatus fällt durch',
      (await page.getAttribute('#kz_status', 'class')).includes('err'));

    /* Schmelzsicherung davor: Nennstrom-Feld weg, Ansprechstrom-Feld da. */
    await page.selectOption('#kz_vorTyp', 'manuell');
    await page.waitForTimeout(120);
    t('bei «anderes Gerät» erscheint das Ansprechstrom-Feld',
      await page.locator('#kzVorIaBox').isVisible());
    await page.fill('#kz_iaVor', '900');
    await page.waitForTimeout(120);
    t('abgelesener Ansprechstrom wird zur Staffelgrenze',
      (await page.textContent('#kz_selGrenze')).includes('900'));
    t('ohne Auslöseband bleibt der Überlastvergleich offen',
      (await page.textContent('#kz_pfUeberVal')) === '—');

    t('keine pageerrors — ' + fehler.join(' | '), fehler.length === 0);
    await ctx.close();
  }

  /* Die neuen Felder überleben den Reload über denselben Snapshot-Pfad. */
  console.log('— Persistenz der Selektivitäts-Eingaben —');
  {
    const { ctx, page } = await oeffne();
    t('kein Objekt gewählt — es greift der Snapshot-Fallback',
      (await page.inputValue('#metaObjektDropdown')) === '');
    await page.fill('#kz_inVor', '80');
    await page.fill('#kz_iBackup', '15');
    await page.waitForTimeout(1400);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4200);
    t('I_n davor überlebt den Reload', (await page.inputValue('#kz_inVor')) === '80');
    t('Backup-Grenze überlebt den Reload', (await page.inputValue('#kz_iBackup')) === '15');
    await ctx.close();
  }

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
