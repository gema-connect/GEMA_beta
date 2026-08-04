/* ════════════════════════════════════════════════════════════════════════
   GEMA — Smoke-Test Photovoltaik (el_photovoltaik.html)
   ════════════════════════════════════════════════════════════════════════
   Prüft die Oberfläche im Browser: Boot, Rechenkette bis in die Anzeige,
   Umschalten der Auslegungsart, Speicher, Verlaufsgrafik, Persistenz über
   einen Reload OHNE gewähltes Objekt (dort greift der Snapshot-Fallback)
   und den Zugriffsschutz.

     CHROME=/opt/pw-browsers/chromium node scripts/photovoltaik_smoke_test.mjs

   Braucht playwright-core (npm i --no-save playwright-core).
   ════════════════════════════════════════════════════════════════════════ */
import { startServer, wireRoutes, seed, BASE } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let n = 0, fail = 0;
const t = (m, b) => { n++; if (!b) { fail++; console.log('  ✗ ' + m); } };
const near = (m, a, b, tol) => t(m + ' — ist ' + a + ', erwartet ' + b, Math.abs(a - b) <= tol);
/* NUR die ERSTE Zahl aus dem Text — die Anzeigen tragen oft einen Zusatz
   («87 Stück à 429 Wp», «0 CHF (brutto 223’938 CHF)»); alle Ziffern
   zusammenzukleben ergäbe dort Unsinn. */
const zahl = s => {
  const m = String(s).replace(/[’'\s]/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
};

const { chromium } = await import('playwright-core');
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function oeffne(roleIds) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  await wireRoutes(ctx);
  await ctx.addInitScript(s => {
    for (const [k, v] of Object.entries(s)) {
      localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }, seed(roleIds || ['role_elektro_planer']));
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e)));
  await page.goto(BASE + '/el_photovoltaik.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  return { page, ctx, fehler };
}

try {
  /* ══ Boot ═══════════════════════════════════════════════════════════ */
  console.log('— Boot —');
  {
    const { ctx, page, fehler } = await oeffne();
    t('keine pageerrors — ' + fehler.join(' | '), fehler.length === 0);
    t('Gerüst-Banner ist entfernt', await page.locator('.el-stub').count() === 0);
    t('vier Schritt-Karten', await page.locator('.el-card').count() === 4);
    t('Hero vorhanden', (await page.textContent('.gema-hero-title')).includes('Photovoltaik'));
    t('Objekt-Bezug vorhanden', await page.locator('#metaObjektDropdown').count() === 1);
    t('Ausrichtungen geladen', await page.locator('#pv_ausricht option').count() === 7);
    t('Netzsysteme aus GemaElektro', await page.locator('#pv_netz option').count() >= 2);
    t('GemaElektro geladen',
      await page.evaluate(() => !!(window.GemaElektro && window.GemaElektro.EL_SYSTEME)));
    /* Freistehende Zahlenfelder nach GEMA-Kanon */
    t('kein type="number" im Modul',
      await page.locator('input[type="number"]').count() === 0);
    const felder = await page.locator('.g-inp[inputmode="decimal"]').count();
    t('Zahlenfelder tragen inputmode="decimal" (' + felder + ')', felder >= 15);
    t('jedes Zahlenfeld hat eine angeschlossene Einheit',
      await page.locator('.g-inp-group .g-inp-unit').count() >= 15);
    await ctx.close();
  }

  /* ══ Rechenkette ════════════════════════════════════════════════════ */
  console.log('— Rechenkette —');
  {
    const { ctx, page, fehler } = await oeffne();

    /* Defaults: 200 m² Schrägdach, 22 %, 1.95 m², 1000 kWh/kWp, EV 30 % */
    near('belegbare Fläche 170 m²', zahl(await page.textContent('#pv_flBel')), 170, 0.5);
    near('87 Module', zahl(await page.textContent('#pv_nMod')), 87, 0);
    near('37.32 kWp', zahl(await page.textContent('#pv_pKwp')), 37.32, 0.02);
    near('Jahresertrag 37.32 MWh', zahl(await page.textContent('#pv_ertrag')), 37.32, 0.05);
    near('Eigenverbrauch 11.20 MWh', zahl(await page.textContent('#pv_evKwh')), 11.20, 0.05);
    near('Einspeisung 26.13 MWh', zahl(await page.textContent('#pv_einspKwh')), 26.13, 0.05);

    /* Aufteilungsbalken bildet die 30/70-Teilung ab */
    const anteil = await page.evaluate(() => {
      const i = document.querySelectorAll('#pv_split > i');
      return i.length === 2 ? parseFloat(i[0].style.width) : -1;
    });
    near('Balken zeigt 30 % Eigenverbrauch', anteil, 30, 0.5);

    /* Wirtschaftlichkeit */
    near('Investition 59’718 CHF', zahl(await page.textContent('#pv_investNetto')), 59718, 20);
    t('Amortisation liegt bei rund 12 Jahren',
      /1[12]\.\d/.test(await page.textContent('#pv_amorVal')));
    const lcoe = zahl(await page.textContent('#pv_lcoeVal'));
    t('Gestehungskosten zwischen 5 und 12 Rp./kWh (' + lcoe + ')', lcoe > 5 && lcoe < 12);
    t('LCOE wird gegen den Bezugspreis eingeordnet',
      (await page.textContent('#pv_lcoeSub')).includes('günstiger als der Bezug'));
    t('Status grün', (await page.getAttribute('#pv_status', 'class')).includes('ok'));

    /* AC-Seite: 37.32 kWp · 97 % → 36.2 kW → I = 36200/(√3·400) ≈ 52.3 A */
    const iac = await page.textContent('#pv_iAc');
    near('AC-Bemessungsstrom rund 52 A', zahl(iac), 52.3, 1);
    t('nächste Sicherung wird genannt', /Vorsicherung\s*63\s*A/.test(iac));

    /* Kennzahlen-Leiste */
    t('Kennzahl 1 zeigt die Leistung', (await page.textContent('#pv_sum1')).includes('kWp'));
    t('Kennzahl 3 zeigt die Gestehungskosten',
      (await page.textContent('#pv_sum3')).includes('Rp./kWh'));

    t('keine pageerrors — ' + fehler.join(' | '), fehler.length === 0);
    await ctx.close();
  }

  /* ══ Live-Reaktion und Auslegungsart ════════════════════════════════ */
  console.log('— Live-Reaktion —');
  {
    const { ctx, page } = await oeffne();

    const vorher = zahl(await page.textContent('#pv_pKwp'));
    await page.selectOption('#pv_dach', 'flach');
    await page.waitForTimeout(150);
    t('Flachdach senkt die Leistung', zahl(await page.textContent('#pv_pKwp')) < vorher);
    t('der Richtwert der Dachform wird erklärt',
      (await page.textContent('#pv_dachHint')).includes('55 %'));
    await page.selectOption('#pv_dach', 'schraeg');

    /* Umschalten auf «Leistung direkt» blendet die Flächenrechnung aus. */
    await page.selectOption('#pv_modus', 'kwp');
    await page.waitForTimeout(150);
    t('Leistungsfeld erscheint', await page.locator('#pvKwpBox').isVisible());
    t('Flächenfelder verschwinden', !(await page.locator('#pv_dachFl').isVisible()));
    await page.fill('#pv_kwp', '50');
    await page.waitForTimeout(150);
    near('Leistung folgt der Eingabe', zahl(await page.textContent('#pv_pKwp')), 50, 0.01);
    near('Ertrag skaliert mit', zahl(await page.textContent('#pv_ertrag')), 50, 0.05);
    await page.selectOption('#pv_modus', 'flaeche');
    await page.waitForTimeout(150);
    t('Flächenfelder sind zurück', await page.locator('#pv_dachFl').isVisible());

    /* Ausrichtung wirkt auf den Ertrag. */
    const e0 = zahl(await page.textContent('#pv_ertrag'));
    await page.selectOption('#pv_ausricht', 'ow30');
    await page.waitForTimeout(150);
    near('Ost/West senkt den Ertrag auf 80 %',
      zahl(await page.textContent('#pv_ertrag')), e0 * 0.8, 0.05);
    await page.selectOption('#pv_ausricht', 'sued30');

    /* Eigenverbrauch ist der stärkste Hebel — mehr EV, kürzere Amortisation. */
    const a0 = zahl(await page.textContent('#pv_amorVal'));
    await page.fill('#pv_ev', '60');
    await page.waitForTimeout(150);
    t('höherer Eigenverbrauch verkürzt die Amortisation',
      zahl(await page.textContent('#pv_amorVal')) < a0);
    await page.fill('#pv_ev', '30');

    await ctx.close();
  }

  /* ══ Speicher und Autarkie ══════════════════════════════════════════ */
  console.log('— Speicher & Autarkie —');
  {
    const { ctx, page } = await oeffne();

    t('ohne Speicher bleibt die Kachel verborgen',
      !(await page.locator('#pv_kpiBatt').isVisible()));
    t('ohne Bedarf kein Autarkiegrad',
      (await page.textContent('#pv_autVal')) === '—');

    await page.fill('#pv_bedarf', '20000');
    await page.waitForTimeout(150);
    near('Autarkiegrad 11197 / 20000 ≈ 56 %',
      zahl(await page.textContent('#pv_autVal')), 56, 1);

    await page.fill('#pv_battKwh', '10');
    await page.fill('#pv_battChf', '12000');
    await page.waitForTimeout(200);
    t('Speicher-Kachel erscheint', await page.locator('#pv_kpiBatt').isVisible());
    t('der Zusatz-Eigenverbrauch wird ausgewiesen',
      (await page.textContent('#pv_frmlEv')).includes('inkl. Speicher'));
    near('Eigenverbrauch steigt um 2500 kWh',
      zahl(await page.textContent('#pv_evKwh')), 13.70, 0.05);
    /* Nutzen = 2500 · (0.28 − 0.09) = 475 CHF/a → 12000/475 ≈ 25.3 Jahre */
    t('Speicher-Amortisation liegt jenseits der Betrachtungsdauer',
      (await page.textContent('#pv_battVal')).includes('> 25'));

    /* Ohne Preisdifferenz bringt der Speicher nichts. */
    await page.fill('#pv_verg', '28');
    await page.waitForTimeout(200);
    t('ohne Preisdifferenz kein Speicher-Nutzen',
      (await page.textContent('#pv_battVal')).includes('kein Nutzen'));
    t('und der Grund steht dabei',
      (await page.textContent('#pv_battSub')).includes('Verschieben lohnt nicht'));

    await ctx.close();
  }

  /* ══ Grenzfälle werden gemeldet ═════════════════════════════════════ */
  console.log('— Grenzfälle —');
  {
    const { ctx, page } = await oeffne();

    /* Teure Anlage: amortisiert sich nicht — und wird NICHT hochgerechnet. */
    await page.fill('#pv_invKwp', '6000');
    await page.waitForTimeout(200);
    t('keine Amortisation gemeldet',
      (await page.textContent('#pv_amorVal')).includes('nicht erreicht'));
    t('ausdrücklich nicht hochgerechnet',
      (await page.textContent('#pv_amorSub')).includes('nicht hochgerechnet'));
    t('Status rot', (await page.getAttribute('#pv_status', 'class')).includes('err'));

    /* Förderung über der Investition wird gekappt, kein Gewinn behauptet. */
    await page.fill('#pv_foerder', '999999');
    await page.waitForTimeout(200);
    near('Nettoinvestition 0', zahl(await page.textContent('#pv_investNetto')), 0, 0.5);
    t('die Kappung wird gemeldet',
      (await page.textContent('#pv_annahmen')).includes('übersteigt die Investition'));
    await page.fill('#pv_foerder', '');
    await page.fill('#pv_invKwp', '1600');

    /* Fläche zu klein für ein Modul. */
    await page.fill('#pv_dachFl', '1');
    await page.waitForTimeout(200);
    t('kein Modul wird gemeldet',
      (await page.textContent('#pv_annahmen')).includes('kein einziges Modul'));
    await page.fill('#pv_dachFl', '200');

    /* Kalkulationszins verteuert die Gestehungskosten. */
    const l0 = zahl(await page.textContent('#pv_lcoeVal'));
    await page.fill('#pv_zins', '3');
    await page.waitForTimeout(200);
    t('mit Zins steigen die Gestehungskosten',
      zahl(await page.textContent('#pv_lcoeVal')) > l0);
    t('die Abzinsung wird bei der Amortisation ausgewiesen',
      (await page.textContent('#pv_amorSub')).includes('abgezinst'));

    /* Annahmen sind sichtbar, nicht versteckt. */
    t('Annahmen werden aufgelistet', await page.locator('#pv_annahmen li').count() >= 4);
    t('die Energie-Abzinsung wird erklärt',
      (await page.textContent('#pv_annahmen')).includes('zu günstig'));

    await ctx.close();
  }

  /* ══ Verlaufsgrafik ═════════════════════════════════════════════════ */
  console.log('— Verlauf —');
  {
    const { ctx, page } = await oeffne();
    const svg = await page.innerHTML('#pvChart');
    t('Ertragskurve gezeichnet', svg.includes('<path'));
    t('Investitionslinie gezeichnet', svg.includes('Investition'));
    t('Amortisationspunkt markiert', svg.includes('amortisiert nach'));
    t('nur literale Hex-Farben im SVG (kein var())', !svg.includes('var('));

    /* Ohne Investition zeigt die Karte einen Hinweis statt einer leeren Fläche. */
    await page.fill('#pv_invKwp', '');
    await page.waitForTimeout(200);
    t('leerer Zustand wird erklärt',
      (await page.textContent('#pvChart')).includes('erfassen'));
    await ctx.close();
  }

  /* ══ Persistenz ═════════════════════════════════════════════════════
     KRITISCH ohne gewähltes Objekt: dort schreibt GemaAutoSave zwar in den
     Basis-Key, liest ihn beim Laden aber nie zurück — es greift allein der
     Snapshot-Fallback pvSnapshotLoad. */
  console.log('— Persistenz —');
  {
    const { ctx, page } = await oeffne();
    t('kein Objekt gewählt — es greift der Snapshot-Fallback',
      (await page.inputValue('#metaObjektDropdown')) === '');
    await page.fill('#pv_dachFl', '333');
    await page.fill('#pv_ev', '45');
    await page.fill('#pv_preis', '31');
    await page.waitForTimeout(1400);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(4200);
    t('Dachfläche überlebt den Reload', (await page.inputValue('#pv_dachFl')) === '333');
    t('Eigenverbrauch überlebt den Reload', (await page.inputValue('#pv_ev')) === '45');
    t('Strompreis überlebt den Reload', (await page.inputValue('#pv_preis')) === '31');
    t('und die Anzeige ist nachgerechnet',
      zahl(await page.textContent('#pv_flBel')) > 280);
    await ctx.close();
  }

  /* ══ Fold ═══════════════════════════════════════════════════════════ */
  console.log('— Fold —');
  {
    const { ctx, page } = await oeffne();
    await page.locator('.el-card .el-card-hd').first().click();
    await page.waitForTimeout(150);
    t('Karte klappt zu', await page.locator('.el-card.zu').count() === 1);
    t('Fold-Zustand liegt NICHT im AutoSave-Snapshot',
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('gema_photovoltaik') || '{}');
        return !Object.keys(s).some(k => /fold/i.test(k));
      }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    t('Fold-Zustand überlebt den Reload', await page.locator('.el-card.zu').count() === 1);
    await page.locator('.el-card .el-card-hd').first().click();
    await ctx.close();
  }

  /* ══ Zugriff ════════════════════════════════════════════════════════ */
  console.log('— Zugriff —');
  {
    const { ctx, page } = await oeffne(['role_monteur']);
    const body = await page.textContent('body');
    t('Monteur bekommt den Kein-Zugriff-Screen',
      /Kein Zugriff|keine Berechtigung/i.test(body));
    t('und sieht die Berechnung nicht', await page.locator('#pv_pKwp').count() === 0);
    await ctx.close();
  }
  {
    const { ctx, page } = await oeffne(['role_planer']);
    t('Sanitärplaner hat ebenfalls Zugriff (_allPerms)',
      await page.locator('#pv_pKwp').count() === 1);
    await ctx.close();
  }

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${n - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
