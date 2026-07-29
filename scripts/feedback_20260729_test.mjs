// Feedback 29.07.2026 (Sandro Caso, 7 Punkte aus 3 Modulen) — Drift-Guard
//
//  Druckdispositiv : (1) Enthärtung → zusätzliches Rechteck «E» im Schema
//                    (2) Druckminderer als Rechteck «DM» (statt Ventil-Symbol)
//                    (3) Terrain-Strich gerade (Massstab-Bruch mittig darauf)
//                    (4) Druckminderer aus dem Hersteller-Katalog (Diagramme)
//                        + Volumenstrom aus der LU · Wert aus der Enthärtung
//                    (5) tiefste Entnahme tiefer, Text ohne Überschneidung
//  h,x-Diagramm    : Karten einklappbar (Zustand pro Gerät)
//  Prüfliste       : Objekttyp mehrfach wählbar
//
// Ausführen: CHROME=<chromium> node scripts/feedback_20260729_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function seite(datei, warteAuf, extraSeed) {
  const s = seed(['role_planer']);
  Object.assign(s, extraSeed || {});
  const { ctx, page } = await newPage(browser, s);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  if (warteAuf) await page.waitForFunction(warteAuf, null, { timeout: 12000 });
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}

/* ════════ Druckdispositiv ════════ */
console.log('■ Druckdispositiv — Schema (Feedback 1/2/3/5)');
{
  // LU-Stand fürs aktive Objekt: 2 WC + 2 Lavabo → Spitzenvolumenstrom kw
  const luKey = 'lu_spitzenvolumenstrom_dropdown_v3__obj_1';
  const luState = {
    devices: [{ deviceName: 'WC-Spülkasten', qty: 4 }, { deviceName: 'Waschtisch', qty: 4 }],
    special: [], dauer: [], maxLU: { kw: 3 },
    _stammdaten: { devices: [
      { name: 'WC-Spülkasten', lu_kw: 1, lu_ww: 0, lu_nd: 0 },
      { name: 'Waschtisch', lu_kw: 1, lu_ww: 1, lu_nd: 0 }
    ] }
  };
  const enthAnlage = { lieferant: 'BWT', serie: 'AQA perla', modell: '20', nenndurchfluss: 150, druckverlustQn: 0.4 };
  const { ctx, page, errs } = await seite('sb_druckdispositiv.html', () => !!document.querySelector('#ddSchema svg'), {
    gema_objekte_v1: { objekte: [{ id: 'obj_1', name: 'Testprojekt', strasse: 'Musterweg 1', plz: '4000', ort: 'Basel', orgId: 'org_test', status: 'aktiv' }], beteiligte: [] },
    gema_objpool_v1: [{ id: 'obj_1', name: 'Testprojekt', orgId: 'org_test', erstelltVon: 'u_test', status: 'aktiv' }],
    gema_active_objekt_v1: 'obj_1',
    [luKey]: luState,
    gema_enthaertung_anlage__obj_1: enthAnlage
  });
  const svg = () => page.evaluate(() => document.getElementById('ddSchema').innerHTML);

  for (const [id, v] of [['hReservoir', '250'], ['hVerteilbatterie', '150'], ['dvHauszuleitung', '0.2'],
    ['dvWasserzaehler', '0.3'], ['ruhedruckDM', '5'], ['dvDruckminderer', '0.5'],
    ['dvNachbehandlung', '0.2'], ['hHoechste', '15'], ['hTiefste', '5'], ['dvInstallation', '1.2']]) {
    await page.fill('#' + id, v);
  }
  await page.waitForTimeout(250);

  // (3) Terrain: EIN gerader Hang — kein Zickzack mehr
  const terr = await page.evaluate(() => {
    const p = [...document.querySelectorAll('#ddSchema path')].map(x => x.getAttribute('d') || '')
      .find(d => /^M 30 /.test(d) && /H \d/.test(d));
    return p || '';
  });
  ok(terr && (terr.match(/ L /g) || []).length === 1, 'Terrain ist ein gerader Hang (genau ein Knick zum Gebäude)');
  ok(/H 1000/.test(terr), 'Terrain läuft rechts durch');

  // (2) DM als Rechteck mit Text «DM» — kein Bowtie-Pfad mehr
  let t = await svg();
  ok(/>DM</.test(t), 'Druckminderer trägt die Beschriftung «DM»');
  ok(await page.evaluate(() => [...document.querySelectorAll('#ddSchema rect')].some(r =>
    Math.abs(+r.getAttribute('width') - 30) < 0.1 && Math.abs(+r.getAttribute('height') - 21) < 0.1)),
    'DM ist ein Rechteck-Symbol');

  // (1) Enthärtung: Rechteck «E» erst mit gesetztem Haken
  ok(!/>E</.test(t), 'ohne Enthärtung kein «E»-Symbol');
  await page.check('#nbEnthaertung');
  await page.waitForTimeout(200);
  t = await svg();
  ok(/>E</.test(t), 'Enthärtung ausgefüllt → Rechteck «E» im Schema');
  ok(/Enthärtung<\/text>/.test(t), 'Chip «Enthärtung» am Symbol');
  ok(await page.evaluate(() => [...document.querySelectorAll('#ddSchema rect')].filter(r =>
    Math.abs(+r.getAttribute('width') - 30) < 0.1).length === 2), 'E und DM als gleich grosse Rechtecke');

  // (5) tiefste Entnahmestelle: unten im Keller, Beschriftung ohne Überlappung
  const geo = await page.evaluate(() => {
    const box = document.getElementById('ddSchema');
    const texte = [...box.querySelectorAll('text')];
    const ti = texte.find(x => /tiefste Stelle/.test(x.textContent));
    const ruhe = texte.filter(x => /^Ruhe /.test(x.textContent)).pop();
    const geb = [...box.querySelectorAll('rect')].find(r => +r.getAttribute('width') === 390);
    const hahnG = [...box.querySelectorAll('g')].filter(g => /translate/.test(g.getAttribute('transform') || '')).pop();
    const m = hahnG && /translate\(([\d.]+) ([\d.]+)\)/.exec(hahnG.getAttribute('transform'));
    const svg = box.querySelector('svg');
    return {
      tiY: ti ? +ti.getAttribute('y') : null,
      ruheY: ruhe ? +ruhe.getAttribute('y') : null,
      tiX: ti ? +ti.getAttribute('x') : null,
      gebTop: geb ? +geb.getAttribute('y') : null,
      gebBot: geb ? (+geb.getAttribute('y') + +geb.getAttribute('height')) : null,
      hahnX: m ? +m[1] : null, hahnY: m ? +m[2] : null,
      vbY: null, hoehe: +svg.getAttribute('viewBox').split(' ')[3]
    };
  });
  ok(geo.tiY !== null && geo.hahnY !== null, 'tiefste Entnahmestelle wird gezeichnet');
  ok(geo.hahnY > geo.gebBot - 120 && geo.hahnY < geo.gebBot, 'Entnahme sitzt unten im Keller (nicht auf der Zuleitung)');
  ok(geo.tiY > geo.gebTop && geo.ruheY < geo.gebBot, 'Beschriftung liegt im Gebäude (nicht über dem Terrain)');
  ok(Math.abs(geo.ruheY - geo.tiY) >= 12, 'zwei getrennte Textzeilen');
  ok(geo.tiY > geo.hahnY, 'Text weicht unter das Symbol aus, wenn er es sonst überschneidet');

  // Leerzustand: dieselbe Kollisionsfreiheit (Feedback-Screenshot)
  for (const id of ['hReservoir', 'hVerteilbatterie', 'dvHauszuleitung', 'dvWasserzaehler', 'ruhedruckDM',
    'dvDruckminderer', 'dvNachbehandlung', 'hHoechste', 'hTiefste', 'dvInstallation']) await page.fill('#' + id, '');
  await page.uncheck('#nbEnthaertung');
  await page.waitForTimeout(250);
  const leer = await page.evaluate(() => {
    const box = document.getElementById('ddSchema');
    const ti = [...box.querySelectorAll('text')].find(x => /tiefste Stelle/.test(x.textContent));
    const geb = [...box.querySelectorAll('rect')].find(r => +r.getAttribute('width') === 390);
    const chip = [...box.querySelectorAll('text')].find(x => /m ü\.M\./.test(x.textContent) && +x.getAttribute('x') > 900);
    return { tiY: ti ? +ti.getAttribute('y') : null, gebBot: geb ? +geb.getAttribute('y') + +geb.getAttribute('height') : null,
             chipY: chip ? +chip.getAttribute('y') : null };
  });
  ok(leer.tiY !== null && leer.tiY < leer.gebBot, 'Leerzustand: Beschriftung bleibt im Gebäude');
  ok(leer.chipY === null || Math.abs(leer.tiY - leer.chipY) > 20, 'Leerzustand: kein Zusammenstoss mit dem m-ü.M.-Chip');

  console.log('■ Druckdispositiv — Wertübernahmen (Feedback 4)');
  // Volumenstrom aus der LU
  ok(await page.locator('#qDruckminderer').count() === 1, 'Feld «Volumenstrom Druckminderer» vorhanden');
  await page.evaluate(() => window._ddLuQ());
  await page.waitForTimeout(200);
  const q = await page.inputValue('#qDruckminderer');
  ok(parseFloat(q) > 0, 'Volumenstrom aus der LU-Zusammenstellung übernommen (' + q + ' l/s)');
  ok(await page.locator('#ddQSrc').isVisible(), 'Herkunfts-Chip zeigt die LU-Übernahme');
  await page.fill('#qDruckminderer', '0.9');
  await page.waitForTimeout(150);
  ok(!(await page.locator('#ddQSrc').isVisible()), 'Herkunfts-Chip löst sich beim Übertippen');

  // Druckminderer aus dem Katalog (mit Hersteller-Diagramm)
  await page.evaluate(() => window._ddArmPicker());
  await page.waitForTimeout(300);
  ok(await page.locator('#gapModal:not(.gap-hidden)').count() === 1, 'Armaturen-Picker öffnet');
  const karten = await page.locator('#gapBody .gap-card').count();
  const nurDM = await page.evaluate(() => [...document.querySelectorAll('#gapBody .gap-card-n')]
    .every(n => /druckminderer|d06f/i.test(n.textContent)));
  ok(karten >= 2 && nurDM, 'Picker zeigt nur Druckminderer (' + karten + ' Fabrikate)');
  ok(await page.locator('#gapBody .gap-diag-btn').count() >= 1, 'Hersteller-Diagramm je Armatur wählbar');
  // Dimension wählen (kvs des Fabrikats) → Δp wird aus Q und kvs gerechnet
  const dnBtn = page.locator('#gapBody .gap-card').first().locator('.gap-cnt button').first();
  ok(/DN .*kvs/.test(await dnBtn.textContent()), 'Dimension mit kvs je Fabrikat wählbar');
  await dnBtn.click();
  await page.waitForTimeout(250);
  const dvDm = parseFloat(await page.inputValue('#dvDruckminderer'));
  ok(dvDm > 0, 'Δp des gewählten Druckminderers landet im Feld (' + dvDm + ' bar)');
  ok(await page.locator('#ddDmSrc').isVisible(), 'Herkunfts-Chip nennt Armatur, Dimension und Volumenstrom');
  ok(/Q = 0\.9 l\/s/.test(await page.locator('#ddDmSrc').innerHTML()), 'Δp folgt dem erfassten Volumenstrom');
  ok(await page.locator('#ddDmDiagCard').isVisible(), 'Kennlinie des gewählten Druckminderers erscheint (kommt in den Ausdruck)');
  ok(/DN /.test(await page.locator('#ddDmDiagSub').textContent()), 'Diagramm nennt Fabrikat und Dimension');
  ok(await page.evaluate(() => {
    const cv = document.getElementById('ddDmDiagCv');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let rot = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i+1] < 90 && d[i+2] < 90) rot++;
    return rot > 20;                       // roter Betriebspunkt + Hilfslinien
  }), 'Betriebspunkt ist auf der Kennlinie markiert');
  // Wahl überlebt den Reload (Hidden-Feld im AutoSave-Snapshot)
  const dmWahl = await page.evaluate(() => document.getElementById('dd_dmarm').value);
  ok(/"dn"/.test(dmWahl), 'gewählter Druckminderer wird mit der Berechnung gespeichert');

  // Wassernachbehandlung: Wert aus der Enthärtung
  await page.evaluate(() => window._ddEnthUebernehmen());
  await page.waitForTimeout(250);
  ok(await page.inputValue('#dvNachbehandlung') === '0.4', 'Druckverlust aus der gewählten Enthärtungsanlage übernommen');
  ok(await page.isChecked('#nbEnthaertung'), 'Übernahme setzt den Enthärtungs-Haken → «E» im Schema');
  ok(/BWT/.test(await page.locator('#ddNbSrc').innerHTML()), 'Herkunfts-Chip nennt die Anlage');
  ok(/>E</.test(await svg()), 'Schema zeigt den Enthärter nach der Übernahme');

  ok(errs.length === 0, 'keine JS-Fehler im Druckdispositiv' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ h,x-Diagramm ════════ */
console.log('■ h,x-Diagramm — Karten einklappbar');
{
  const { ctx, page, errs } = await seite('lt_hx_diagramm.html', () => !!document.querySelector('.g-card-hd.hx-foldhd'));
  const karten = await page.locator('.g-card-hd.hx-foldhd').count();
  ok(karten >= 6, 'alle Karten sind einklappbar (' + karten + ')');
  ok(await page.locator('.g-card').first().locator('.g-card-bd').isVisible(), 'Karten starten offen');
  await page.locator('.g-card-hd.hx-foldhd').first().click();
  await page.waitForTimeout(150);
  ok(!(await page.locator('.g-card').first().locator('.g-card-bd').isVisible()), 'Klick auf den Kopf klappt zu');
  ok(await page.locator('.g-card').first().locator('.hx-fold-cx').textContent() === '▸', 'Chevron zeigt den Zustand');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.g-card-hd.hx-foldhd', { timeout: 12000 });
  await page.waitForTimeout(500);
  ok(!(await page.locator('.g-card').first().locator('.g-card-bd').isVisible()), 'Zustand überlebt den Reload (pro Gerät)');
  await page.locator('.g-card-hd.hx-foldhd').first().click();
  await page.waitForTimeout(150);
  ok(await page.locator('.g-card').first().locator('.g-card-bd').isVisible(), 'wieder aufklappbar');
  ok(await page.evaluate(() => {
    const snap = JSON.parse(localStorage.getItem('gema_hx_diagramm') || '{}');
    return Object.keys(snap).every(k => !/fold/i.test(k));
  }), 'Fold-Zustand liegt NICHT im AutoSave-Snapshot');
  ok(errs.length === 0, 'keine JS-Fehler im h,x-Diagramm' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ Prüfliste ════════ */
console.log('■ Prüfliste — Objekttyp mehrfach wählbar');
{
  const { ctx, page, errs } = await seite('pm_pruefliste.html', () => typeof _prHooks !== 'undefined');
  await page.evaluate(() => prNeu());
  await page.waitForTimeout(400);
  ok(await page.locator('#eObjTypChips .chip').count() >= 5, 'Objekttyp-Chips vorhanden');
  await page.evaluate(() => prEObjTyp('mfh'));
  await page.evaluate(() => prEObjTyp('wgh'));
  await page.waitForTimeout(150);
  ok(await page.locator('#eObjTypChips .chip.on').count() === 2, 'zwei Objekttypen gleichzeitig wählbar');
  let b = await page.evaluate(() => prCurrent());
  ok(Array.isArray(b.objekttypen) && b.objekttypen.join(',') === 'mfh,wgh', 'beide Typen im Datensatz');
  ok(b.objekttyp === 'mfh', 'Einzelfeld bleibt als Spiegel des ersten Typs (Altdaten-Leser)');
  ok(await page.evaluate(() => _prEngine.prObjekttypenText(prCurrent())) === 'Mehrfamilienhaus (MFH) · Wohn- und Geschäftshaus',
    'Anzeige listet beide Typen');
  await page.evaluate(() => prEObjTyp('mfh'));
  await page.waitForTimeout(150);
  ok(await page.locator('#eObjTypChips .chip.on').count() === 1, 'erneuter Klick nimmt einen Typ wieder weg');
  await page.evaluate(() => prEObjTyp('sonstiges'));
  await page.waitForTimeout(150);
  ok(await page.locator('#eObjTypFreiWrap').isVisible(), '«Sonstiges» blendet das Freitextfeld ein');
  // Legacy: Datensatz mit altem Einzelfeld bleibt lesbar
  ok(await page.evaluate(() => _prEngine.prObjekttypenText({ objekttyp: 'hotel' })) === 'Hotel', 'Altdaten (Einzelwert) unverändert lesbar');
  ok(errs.length === 0, 'keine JS-Fehler in der Prüfliste' + (errs.length ? ' — ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden');
process.exit(fail ? 1 : 0);
