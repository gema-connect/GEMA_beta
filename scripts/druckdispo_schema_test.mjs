// Playwright-Test für das Druckschema (SVG-Szene) im Druckdispositiv
// (Variante 3 des Grafik-Entscheids, 07/2026): Live-Zeichnung aus recalc(),
// Reservoir-/Netz-Modus, Norm-Farben synchron zu den Ergebnis-Karten,
// Einheiten-Umschaltung, klickbare Chips → Eingabefelder, Massstab-Logik.
// Aufruf: CHROME=<chromium> node scripts/druckdispo_schema_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ FAIL: ' + name); }
};

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
await page.goto(BASE + '/sb_druckdispositiv.html', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#ddSchema svg', { timeout: 12000 });

const svgText = () => page.evaluate(() => document.getElementById('ddSchema').textContent);
const noteText = () => page.evaluate(() => document.getElementById('ddSchemaNote').textContent);

console.log('■ Leerzustand & Grundgerüst');
ok(await page.evaluate(() => document.getElementById('ddSchemaHint').style.display !== 'none'), 'Hinweis «Werte erfassen» bei leerem Modul sichtbar');
ok((await svgText()).indexOf('Reservoir') >= 0, 'Skeleton zeichnet trotzdem (Reservoir-Modus Default)');

console.log('■ Reservoir-Modus: Werte, Norm-Farben, Konsistenz');
for (const [id, v] of [['hReservoir', '523'], ['hVerteilbatterie', '428'], ['dvHauszuleitung', '0.5'], ['dvWasserzaehler', '0.35'],
  ['ruhedruckDM', '4'], ['dvNachbehandlung', '0.2'], ['hHoechste', '12.4'], ['hTiefste', '2'], ['dvInstallation', '0.8']]) {
  await page.fill('#' + id, v);
}
await page.waitForTimeout(200);
{
  const t = await svgText();
  ok(await page.evaluate(() => document.getElementById('ddSchemaHint').style.display === 'none'), 'Hinweis verschwindet mit Daten');
  ok(t.indexOf('Δh 95 m → 9.32 bar') >= 0, 'Δh-Massband: 95 m → 9.32 bar');
  ok(t.indexOf('Betrieb nach WZ: 8.47 bar') >= 0, 'Betriebsdruck-Chip 8.47 bar (9.32 − 0.5 − 0.35)');
  ok(t.indexOf('DM → 4.00 bar') >= 0, 'Druckminderer-Chip mit Einstelldruck');
  ok(t.indexOf('NB −0.20 bar') >= 0, 'Nachbehandlungs-Chip');
  ok(t.indexOf('1.78 bar · Erhöht') >= 0, 'Fliessdruck-Kasten 1.78 bar · Erhöht');
  ok(t.indexOf('Ruhe 4.20 bar') >= 0, 'tiefste Stelle Ruhe 4.20 bar (4 + 2 m Höhe)');
  // Feedback 25.07.2026: Geschosse alle 2.8 m (statt gleichmässiger Teilung),
  // oberste Kante = exakte Höhe (12.4 m → 2.8/5.6/8.4/11.2/12.4)
  ok(t.indexOf('+2.8 m') >= 0 && t.indexOf('Ruhe 3.73 bar') >= 0, 'Geschossraster alle 2.8 m mit Ruhedruck je Ebene');
  ok(t.indexOf('+12.4 m') >= 0, 'oberstes Geschoss = exakte Höhe (+12.4 m)');
  ok(t.indexOf('Δp Inst −0.80 bar') >= 0, 'Installations-Verlust-Chip');
  ok((await noteText()).indexOf('Massstab-Bruch') >= 0, 'Massstab-Bruch-Hinweis bei 95 m Differenz');
  // Feedback 25.07.2026: Fliessdruck-Kasten-Text untereinander (3 Zeilen)
  ok(t.indexOf('FLIESSDRUCK') >= 0 && t.indexOf('HÖCHSTE ENTNAHMESTELLE (+12.4 M)') >= 0, 'Fliessdruck-Kasten mit gestapeltem Text');
  // Feedback 25.07.2026: WZ/NB/DM sind IM (breiteren) Gebäude dargestellt
  const stationenImHaus = await page.evaluate(() => {
    const svg = document.getElementById('ddSchema');
    const geb = [...svg.querySelectorAll('rect')].map(r => ({ x: parseFloat(r.getAttribute('x')), w: parseFloat(r.getAttribute('width')) }))
      .sort((a, b) => b.w - a.w)[0]; // grösstes Rect = Gebäude
    const wz = [...svg.querySelectorAll('text')].find(x => x.textContent === 'WZ');
    return geb && wz && parseFloat(wz.getAttribute('x')) > geb.x && parseFloat(wz.getAttribute('x')) < geb.x + geb.w && geb.w >= 380;
  });
  ok(stationenImHaus, 'Wasserzähler im (breiteren) Gebäude dargestellt');
  // Feedback 25.07.2026: m-ü.M.-Chip UNTER dem Terrain-Strich
  const chipUnterTerrain = await page.evaluate(() => {
    const svg = document.getElementById('ddSchema');
    const g = [...svg.querySelectorAll('.dd-chipbtn')].find(x => x.getAttribute('data-ziel') === 'hVerteilbatterie');
    if (!g) return false;
    const r = g.querySelector('rect');
    const terr = svg.querySelector('path[stroke="#a8a29e"]');
    const bodenMatch = terr && terr.getAttribute('d').match(/H 1000$/) ? null : null;
    // Gebäude-Oberkante des UG = Terrain: Chip-y muss unter der EG-Linie liegen
    const egLine = [...svg.querySelectorAll('line')].find(l => l.getAttribute('stroke-width') === '1.6');
    return r && egLine && parseFloat(r.getAttribute('y')) > parseFloat(egLine.getAttribute('y1'));
  });
  ok(chipUnterTerrain, 'm-ü.M.-Chip liegt unter dem Terrain-Strich');
  // Farbe = Norm-Bewertung (amber für erhöht, grün für Ruhe ok)
  const farben = await page.evaluate(() => {
    const svg = document.getElementById('ddSchema');
    const box = [...svg.querySelectorAll('rect')].find(r => (r.getAttribute('stroke') || '') === '#d97706');
    const ruhe = [...svg.querySelectorAll('text')].find(x => x.textContent.indexOf('Ruhe 4.20') === 0);
    return { warnBox: !!box, ruheFill: ruhe && ruhe.getAttribute('fill') };
  });
  ok(farben.warnBox, 'Fliessdruck-Kasten trägt Warn-Farbe (≥ 1.5 bar erhöht)');
  ok(farben.ruheFill === '#16a34a', 'Ruhedruck-Label grün (≤ 5 bar)');
  // Konsistenz mit der Ergebnis-Karte
  const karte = await page.evaluate(() => document.getElementById('out-fliessdruck').textContent);
  ok(t.indexOf(karte + ' bar') >= 0, 'Schema-Fliessdruck identisch mit Ergebnis-Karte (' + karte + ')');
}

console.log('■ Chip-Klick fokussiert das Eingabefeld');
{
  await page.click('#ddSchema .dd-chipbtn[data-ziel="dvHauszuleitung"]');
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'dvHauszuleitung'), 'Klick auf Δp-HZ-Chip fokussiert #dvHauszuleitung');
  ok(await page.evaluate(() => !!document.querySelector('.dd-puls')), 'Eingabe-Zeile pulsiert (visuelles Feedback)');
}

console.log('■ Norm-Umschlag: DM tiefer → Fliessdruck-Bewertung folgt');
{
  await page.fill('#ruhedruckDM', '3.5');
  await page.waitForTimeout(150);
  let t = await svgText();
  ok(t.indexOf('1.28 bar · Gemäss Norm') >= 0, 'DM 3.5 → Fliessdruck 1.28 bar · Gemäss Norm');
  await page.fill('#ruhedruckDM', '3.2');
  await page.waitForTimeout(150);
  t = await svgText();
  ok(t.indexOf('0.98 bar · Zu tief') >= 0, 'DM 3.2 → Fliessdruck 0.98 bar · Zu tief (< 1 bar)');
  await page.fill('#ruhedruckDM', '4');
}

console.log('■ Einheiten-Umschaltung');
{
  await page.click('#unitChips .g-chip[data-u="kPa"]');
  await page.waitForTimeout(200);
  const t = await svgText();
  const karte = await page.evaluate(() => document.getElementById('out-fliessdruck').textContent);
  ok(t.indexOf(' kPa') >= 0, 'Schema-Chips zeigen kPa');
  ok(t.indexOf(karte + ' kPa') >= 0, 'Fliessdruck im Schema folgt der Einheit (' + karte + ' kPa)');
  await page.click('#unitChips .g-chip[data-u="bar"]');
  await page.waitForTimeout(150);
}

console.log('■ Massstäblich vs. Bruch vs. Reservoir unter VB');
{
  await page.fill('#hReservoir', '440');   // Δh 12 m → massstäblich
  await page.waitForTimeout(150);
  ok((await noteText()).indexOf('massstäblich gezeichnet') >= 0, 'Δh 12 m → «Höhen massstäblich gezeichnet»');
  await page.fill('#hReservoir', '420');   // Δh −8 m → Warnhinweis
  await page.waitForTimeout(150);
  ok((await noteText()).indexOf('nicht über der Verteilbatterie') >= 0, 'Δh negativ → Warnhinweis in der Notiz');
  await page.fill('#hReservoir', '523');
}

console.log('■ Netz-Modus (Direktangabe)');
{
  await page.click('#modeDirekt');
  await page.fill('#versorgungsdruck', '4.2');
  await page.fill('#hoehengewinn', '1.5');
  await page.fill('#schwankungReserve', '0.3');
  await page.waitForTimeout(200);
  const t = await svgText();
  ok(t.indexOf('Netzanschluss') >= 0 && t.indexOf('Reservoir') < 0, 'Linke Seite wird zum Netzanschluss (kein Reservoir)');
  ok(t.indexOf('Versorgungsdruck 4.20 bar') >= 0, 'Versorgungsdruck-Chip');
  ok(t.indexOf('Höhengewinn +1.5 m → +0.15 bar') >= 0, 'Höhengewinn-Chip mit bar-Umrechnung');
  ok(t.indexOf('Schwankung −0.30 bar') >= 0, 'Schwankungs-Chip');
  ok(t.indexOf('Betrieb nach WZ: 3.20 bar') >= 0, 'Betriebsdruck im Netz-Modus (4.2 + 0.147 − 0.3 − 0.5 − 0.35)');
  ok((await noteText()).indexOf('Direktangabe') >= 0, 'Netz-Notiz («Terrain schematisch»)');
}

console.log('■ Optionale Stationen verschwinden ohne Werte');
{
  await page.fill('#dvNachbehandlung', '');
  await page.fill('#ruhedruckDM', '');
  await page.fill('#dvDruckminderer', '');
  await page.waitForTimeout(150);
  const t = await svgText();
  ok(t.indexOf('NB −') < 0, 'kein NB-Symbol ohne Nachbehandlungs-Verlust');
  ok(t.indexOf('DM →') < 0 && t.indexOf('Δp DM') < 0, 'kein DM-Symbol ohne Druckminderer-Angaben');
}

console.log('■ Feedback 25.07.2026: UGs, Ruhedruck-Hinweise, Δh-Zeile, Eingaben');
{
  // zurück in den Reservoir-Modus mit Basiswerten
  await page.click('#modeHoehen');
  for (const [id, v] of [['hReservoir', '523'], ['hVerteilbatterie', '428'], ['ruhedruckDM', '4'], ['hHoechste', '12.4']]) {
    await page.fill('#' + id, v);
  }
  // UGs nach unten: tiefste Entnahmestelle 6 m unter VB → 3 UG-Zonen à 2.8 m
  await page.fill('#hTiefste', '6');
  await page.waitForTimeout(200);
  let t = await svgText();
  ok(t.indexOf('−2.8 m') >= 0 && t.indexOf('Ruhe 4.27 bar') >= 0, 'UG-Zonen alle 2.8 m nach unten mit Ruhedruck (−2.8 m → 4.27 bar)');
  ok(t.indexOf('(−6 m)') >= 0 && t.indexOf('Ruhe 4.59 bar') >= 0, 'tiefste Stelle im untersten UG (Ruhe 4 + 6 m = 4.59 bar)');
  await page.fill('#hTiefste', '2');
  await page.waitForTimeout(150);

  // Δh-Zeile unter den Höhenfeldern (Höhenunterschied + gewählter Druck)
  const dhInfo = await page.evaluate(() => {
    const el = document.getElementById('ddDhInfo');
    return { sichtbar: el && el.style.display !== 'none', txt: el ? el.textContent : '' };
  });
  ok(dhInfo.sichtbar && dhInfo.txt.indexOf('95 m') >= 0 && dhInfo.txt.indexOf('9.32 bar') >= 0, 'Δh-Zeile unter den Höhenfeldern (95 m → 9.32 bar)');

  // Label «Ruhedruck» ohne «nach Druckminderer» (DM nicht zwingend)
  const lblTxt = await page.evaluate(() => {
    const inp = document.getElementById('ruhedruckDM');
    const fg = inp && inp.closest('.fg');
    const lbl = fg && fg.querySelector('label');
    return lbl ? lbl.childNodes[0].textContent.trim() : '';
  });
  ok(lblTxt === 'Ruhedruck', 'Feld-Label heisst «Ruhedruck» (nicht «nach Druckminderer»)');

  // Druckminderer nötig: Betriebsdruck (8.47) > gewählter Ruhedruck (4)
  const hintDm = await page.evaluate(() => {
    const el = document.getElementById('ddRdHinweis');
    const row = document.getElementById('ddDmBedarf');
    return { cls: el ? el.className : '', txt: el ? el.textContent : '',
      rowSichtbar: row && row.style.display !== 'none', rowTxt: row ? row.textContent : '' };
  });
  ok(hintDm.cls.indexOf('dm') >= 0 && hintDm.txt.indexOf('Druckminderer nötig') >= 0, 'Hinweis «Druckminderer nötig» (Betriebsdruck über Ruhedruck)');
  ok(hintDm.rowSichtbar && hintDm.rowTxt.indexOf('Druckminderer nötig') >= 0, 'Zwischenwerte-Zeile «Druckminderer nötig»');

  // Druckerhöhung nötig: gewählter Ruhedruck (10) über Betriebsdruck (8.47)
  await page.fill('#ruhedruckDM', '10');
  await page.waitForTimeout(150);
  const hintDea = await page.evaluate(() => {
    const el = document.getElementById('ddRdHinweis');
    const row = document.getElementById('ddDmBedarf');
    return { cls: el ? el.className : '', txt: el ? el.textContent : '', rowTxt: row ? row.textContent : '' };
  });
  ok(hintDea.cls.indexOf('dea') >= 0 && hintDea.txt.indexOf('Druckerhöhung nötig') >= 0, 'Fehler «Druckerhöhung nötig» (Ruhedruck über Betriebsdruck)');
  ok(hintDea.rowTxt.indexOf('Druckerhöhung nötig') >= 0, 'Zwischenwerte-Zeile «Druckerhöhung nötig»');
  await page.fill('#ruhedruckDM', '4');

  // Eingabe «.5» wird beim Verlassen zu «0.5» (fixLeadingZero auf allen Feldern)
  await page.fill('#schwankungNetz', '.5');
  await page.evaluate(() => { const el = document.getElementById('schwankungNetz'); el.dispatchEvent(new Event('blur')); if (typeof fixLeadingZero === 'function') fixLeadingZero(el); });
  ok(await page.evaluate(() => document.getElementById('schwankungNetz').value) === '0.5', '«.5» wird beim Verlassen zu «0.5»');
  // Komma-Eingabe bleibt Komma («,5» → «0.5» — nie zu Ganzzahl gekappt)
  await page.fill('#schwankungNetz', '2,5');
  await page.evaluate(() => { const el = document.getElementById('schwankungNetz'); if (typeof fixLeadingZero === 'function') fixLeadingZero(el); });
  ok(await page.evaluate(() => document.getElementById('schwankungNetz').value) === '2.5', '«2,5» wird beim Verlassen zu «2.5» (Punkt statt Komma)');
  await page.fill('#schwankungNetz', '');

  // «+ weitere Position»-Button + Einheiten-Chips im Standard-Look (Klassen definiert)
  const styled = await page.evaluate(() => {
    const btn = document.querySelector('button.g-btn.sm');
    const chipGrp = document.querySelector('#unitChips');
    const bs = btn && getComputedStyle(btn);
    const cs = chipGrp && getComputedStyle(chipGrp);
    return { btnRadius: bs ? bs.borderRadius : '', grpRadius: cs ? cs.borderRadius : '' };
  });
  ok(styled.btnRadius === '8px', '«+ weitere Position»-Button trägt den GEMA-Button-Look (8px-Radius)');
  ok(styled.grpRadius === '9px', 'Einheiten-Umschalter als Segment-Gruppe gestylt');
}

await browser.close();
server.close();
console.log('\n' + pass + '/' + (pass + fail) + ' Checks bestanden' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
