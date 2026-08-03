/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test Transformator-Betriebskennwerte in el_kurzschluss
   ════════════════════════════════════════════════════════════════════════
   Ergänzt scripts/kurzschluss_smoke_test.mjs (Fehlerschleife/Nachweis) um
   die Betriebskennwerte des Transformators: Übersetzung, Primär- und
   Sekundär-Nennstrom, Leerlaufstrom, Strom bei Auslastung und der
   Klemmen-Kurzschlussstrom.

   Zwei Dinge stehen im Zentrum:
     · Die Werte müssen stimmen — verglichen wird gegen unabhängig von Hand
       gerechnete Zahlen, nicht gegen die eigene Implementierung.
     · Die bestehende Kurzschlussrechnung darf sich NICHT ändern. Die neuen
       Angaben gehen nicht in die Fehlerschleife ein; Abschnitt 7 weist das
       an der laufenden Seite nach.

   Unabhängige Referenz (Vorgabewerte der Seite: 630 kVA, u_k 4 %,
   16 000 V / 400 V, i₀ 1.5 %, Auslastung 80 %, 1 Trafo):
     ü            = 16000 / 400                    = 40.0 : 1
     I₁N          = 630000 / (√3 · 16000)          = 22.733 A
     I₂N          = 630000 / (√3 · 400)            = 909.33 A
     I₀           = 1.5 % · 22.733                 = 0.341 A
     I bei 80 %   = 0.80 · 909.33                  = 727.46 A
     I_k,Klemmen  = 909.33 / 0.04                  = 22.733 kA

   AUSFÜHREN:
     CHROME=/opt/pw-browsers/chromium node scripts/kurzschluss_trafo_smoke_test.mjs

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
    /* Die Kennwerte sind eine Gruppe INNERHALB der Berechnungs-Karte.
       Der Schritt-Aufbau Eingabe → Berechnung → Ergebnis bleibt bei
       vier Karten — eine fünfte wäre ein anderer Modul-Aufbau. */
    t('weiterhin vier Schritt-Karten', await page.locator('.el-card').count() === 4);
    t('Kennwert-Gruppe ist sichtbar', await page.locator('#kzTrafoKwBox').isVisible());
    t('Gruppe trägt eine eigene Überschrift',
      /Transformator im Betrieb/.test(await page.textContent('#kzTrafoKwBox')));

    /* Die vier neuen Felder folgen dem GEMA-Kanon für Zahlenfelder. */
    for (const id of ['kz_u1', 'kz_u2n', 'kz_i0', 'kz_last']) {
      const a = await page.evaluate(sel => {
        const e = document.getElementById(sel);
        return e ? { typ: e.type, im: e.getAttribute('inputmode'), blur: e.getAttribute('onblur') || '' } : null;
      }, id);
      t(`#${id}: type=text, inputmode=decimal, fixLeadingZero`,
        !!a && a.typ === 'text' && a.im === 'decimal' && a.blur.includes('fixLeadingZero'));
    }
    /* Einheiten stehen in der angeschlossenen Box, nicht im Label. */
    t('Einheiten-Boxen vorhanden (V/V/%/%)',
      await page.evaluate(() => ['kz_u1','kz_u2n','kz_i0','kz_last'].every(id => {
        const g = document.getElementById(id).closest('.g-inp-group');
        return g && g.querySelector('.g-inp-unit');
      })));
    await ctx.close();
  }

  /* ══ 2. Kennwerte mit den Vorgabewerten ════════════════════════════ */
  console.log('— Kennwerte —');
  {
    const { ctx, page } = await oeffne();
    near('Übersetzung 40.0 : 1',      zahl(await page.textContent('#kz_ue')),        40.0,   0.05);
    near('I₁N ≈ 22.73 A',            zahl(await page.textContent('#kz_i1n')),       22.73,  0.02);
    near('I₂N ≈ 909.3 A',            zahl(await page.textContent('#kz_i2n')),       909.3,  0.5);
    near('I₀ ≈ 0.34 A',              zahl(await page.textContent('#kz_i0res')),     0.34,   0.01);
    near('I bei 80 % ≈ 727.5 A',     zahl(await page.textContent('#kz_ilast')),     727.5,  0.5);
    near('I_k,Klemmen ≈ 22.733 kA',  zahl(await page.textContent('#kz_ikKlemmen')), 22.733, 0.01);

    t('Auslastung wird zusätzlich in % ausgewiesen',
      /80\s*%\s*von/.test(await page.textContent('#kz_ilast')));
    t('bei einem Trafo kein «je Trafo»-Zusatz',
      !/je Trafo/.test(await page.textContent('#kz_i2n')));
    await ctx.close();
  }

  /* ══ 3. Kennwert und IEC-Rechenwert stehen nebeneinander ═══════════ */
  console.log('— Kennwert gegen Rechenwert —');
  {
    const { ctx, page } = await oeffne();
    const klemmen = zahl(await page.textContent('#kz_ikKlemmen'));
    const iecMax  = zahl(await page.textContent('#kz_ikMax'));
    /* Beides sind Kurzschlussströme, aber nicht dasselbe: der Kennwert
       gilt an den Trafoklemmen ohne c, ohne Netz und ohne R_T. Stünden
       beide unkommentiert auf einer Seite, wäre das ein Widerspruch. */
    t('die beiden Ströme unterscheiden sich', Math.abs(klemmen - iecMax) > 0.5);
    const note = await page.textContent('#kz_trafoKwNote');
    t('Hinweis erklärt den Unterschied', /Kennwert/.test(note) && /IEC 60909/.test(note));
    t('Hinweis nennt die drei fehlenden Glieder',
      /Spannungsfaktor c/.test(note) && /Netz/.test(note) && /R/.test(note));
    t('Hinweis nennt den massgebenden Wert',
      /massgebend/.test(note) && note.includes(String(iecMax.toFixed(2))));
    await ctx.close();
  }

  /* ══ 4. Fehlende Angaben: «—» statt erfundener Null ════════════════ */
  console.log('— Fehlende Angaben —');
  {
    const { ctx, page } = await oeffne();
    await page.fill('#kz_u1', '');
    await page.waitForTimeout(200);
    t('ohne U₁N: Übersetzung «—»',   (await page.textContent('#kz_ue')).trim()    === '—');
    t('ohne U₁N: I₁N «—»',           (await page.textContent('#kz_i1n')).trim()   === '—');
    t('ohne U₁N: I₀ «—»',            (await page.textContent('#kz_i0res')).trim() === '—');
    t('I₂N bleibt trotzdem gerechnet', zahl(await page.textContent('#kz_i2n')) > 900);

    await page.fill('#kz_u1', '16000');
    await page.fill('#kz_i0', '');
    await page.waitForTimeout(200);
    t('ohne i₀: nur der Leerlaufstrom fehlt',
      (await page.textContent('#kz_i0res')).trim() === '—'
      && zahl(await page.textContent('#kz_i1n')) > 22);

    await page.fill('#kz_i0', '1.5');
    await page.fill('#kz_last', '');
    await page.waitForTimeout(200);
    t('ohne Auslastung: Laststrom «—»', (await page.textContent('#kz_ilast')).trim() === '—');
    await ctx.close();
  }

  /* ══ 5. Bemessungs-Unterspannung 420 V ═════════════════════════════ */
  console.log('— U₂N = 420 V —');
  {
    const { ctx, page } = await oeffne();
    await page.fill('#kz_u2n', '420');
    await page.waitForTimeout(250);
    near('ü sinkt auf 38.1 : 1',     zahl(await page.textContent('#kz_ue')),        38.1,  0.05);
    near('I₂N sinkt auf 866.0 A',    zahl(await page.textContent('#kz_i2n')),       866.0, 0.5);
    near('I_k,Klemmen 21.651 kA',    zahl(await page.textContent('#kz_ikKlemmen')), 21.651, 0.01);
    t('die Abweichung zur Netzspannung wird gemeldet',
      /420/.test(await page.textContent('#kz_annahmen'))
      && /IEC 60909/.test(await page.textContent('#kz_annahmen')));
    await ctx.close();
  }

  /* ══ 6. Trafos parallel ════════════════════════════════════════════ */
  console.log('— Parallelbetrieb —');
  {
    const { ctx, page } = await oeffne();
    const einer = zahl(await page.textContent('#kz_ikKlemmen'));
    await page.fill('#kz_nTrafo', '2');
    await page.waitForTimeout(250);
    const txt = await page.textContent('#kz_i2n');
    t('I₂N wird als «je Trafo» ausgewiesen', /je Trafo/.test(txt));
    t('und die Gesamtsumme steht dabei', /1[’']?818/.test(txt));
    near('I_k,Klemmen verdoppelt sich', zahl(await page.textContent('#kz_ikKlemmen')), einer * 2, 0.02);
    near('Laststrom 80 % von beiden Trafos', zahl(await page.textContent('#kz_ilast')), 1454.9, 1);
    await ctx.close();
  }

  /* ══ 7. REGRESSION — die Fehlerschleife bleibt unberührt ═══════════ */
  console.log('— Regression Fehlerschleife —');
  {
    const { ctx, page } = await oeffne();
    const lies = () => page.evaluate(() => ({
      ikMax:   document.getElementById('kz_ikMax').textContent,
      ikMin:   document.getElementById('kz_ikMin').textContent,
      zT:      document.getElementById('kz_zT').textContent,
      zGesamt: document.getElementById('kz_zGesamt').textContent,
      nachw:   document.getElementById('kz_pfAbVal').textContent,
      lmax:    document.getElementById('kz_pfLenVal').textContent,
      status:  document.getElementById('kz_status').className
    }));
    const vorher = await lies();
    /* Alle vier neuen Angaben kräftig verstellen … */
    await page.fill('#kz_u1',   '20000');
    await page.fill('#kz_u2n',  '420');
    await page.fill('#kz_i0',   '4');
    await page.fill('#kz_last', '35');
    await page.waitForTimeout(300);
    const nachher = await lies();
    for (const k of Object.keys(vorher)) {
      t(`Fehlerschleife unverändert: ${k}`, vorher[k] === nachher[k]);
    }
    /* … die Kennwerte selbst müssen sich sehr wohl geändert haben —
       sonst prüfte der Vergleich oben gar nichts. */
    t('die Kennwerte haben sich geändert',
      Math.abs(zahl(await page.textContent('#kz_ue')) - 40) > 1);
    await ctx.close();
  }

  /* ══ 8. Speisung über I_k″: Kennwerte entfallen ════════════════════ */
  console.log('— Speisung I_k″ —');
  {
    const { ctx, page } = await oeffne();
    await page.selectOption('#kz_speise', 'ik');
    await page.waitForTimeout(250);
    t('ohne Trafo-Daten keine Trafo-Kennwerte', !(await page.locator('#kzTrafoKwBox').isVisible()));
    t('und die Eingabefelder verschwinden mit', !(await page.locator('#kz_u1').isVisible()));
    await page.selectOption('#kz_speise', 'trafo');
    await page.waitForTimeout(250);
    t('zurück auf Trafo: Kennwerte wieder da', await page.locator('#kzTrafoKwBox').isVisible());
    near('und wieder gerechnet', zahl(await page.textContent('#kz_i2n')), 909.3, 0.5);
    await ctx.close();
  }

  /* ══ 9. Persistenz über Reload ═════════════════════════════════════ */
  console.log('— Persistenz —');
  {
    const { ctx, page } = await oeffne();
    await page.fill('#kz_u1',   '10000');
    await page.fill('#kz_u2n',  '420');
    await page.fill('#kz_i0',   '2.2');
    await page.fill('#kz_last', '65');
    await page.waitForTimeout(250);
    const i2nVor = zahl(await page.textContent('#kz_i2n'));
    /* AutoSave schreibt debounced (5 s) — hier bewusst erzwingen. */
    await page.evaluate(() => window.GemaAutoSave && window.GemaAutoSave.save());
    await page.waitForTimeout(300);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);   // deckt den 700-ms-Fallback ab
    t('U₁N wiederhergestellt',      await page.inputValue('#kz_u1')   === '10000');
    t('U₂N wiederhergestellt',      await page.inputValue('#kz_u2n')  === '420');
    t('i₀ wiederhergestellt',       await page.inputValue('#kz_i0')   === '2.2');
    t('Auslastung wiederhergestellt', await page.inputValue('#kz_last') === '65');
    near('Kennwerte nach Reload neu gerechnet',
      zahl(await page.textContent('#kz_i2n')), i2nVor, 0.5);
    near('Übersetzung nach Reload 23.8 : 1', zahl(await page.textContent('#kz_ue')), 23.8, 0.05);
    await ctx.close();
  }

  /* ══ 10. Zugriffsschutz ════════════════════════════════════════════ */
  console.log('— Zugriff —');
  {
    const { ctx, page } = await oeffne(['role_monteur']);
    t('Monteur bekommt «Kein Zugriff»', /Kein Zugriff/i.test(await page.textContent('body') || ''));
    t('und sieht die Kennwerte nicht', await page.locator('#kzTrafoKwBox').count() === 0);
    await ctx.close();
  }
  {
    const { ctx, page, fehler } = await oeffne(['role_elektro_planer']);
    t('Elektroplaner: Modul lädt fehlerfrei', fehler.length === 0);
    t('Elektroplaner: Kennwerte sichtbar', zahl(await page.textContent('#kz_i2n')) > 0);
    await ctx.close();
  }

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
