// Feedback 28.07.2026 (Sandro, 19 Punkte aus 5 Modulen) — Drift-Guard
//
//  Apparateliste : Norm-Badge weg · komplette Adresse + Beteiligte (aufklappbar)
//                  + Lieferant · freie Apparate (Grundapparat/Ausführung/
//                  Material/Zubehör/Spezielles)
//  Druckverlust  : Schema ganz nach oben, «Strang» aus dem Titel, einklappbar
//  Enthärtung    : Behälter schmal + Text daneben · gewählter Anlagetyp als
//                  Text · separate Umgehungsleitung je Strang
//  Prüfliste     : Objekttyp als Chips · Art frei beschreibbar · Baujahr frei
//  Zirkulation   : TS aufklappbar mit Werten · Fabrikat steuert ø/Werkstoff ·
//                  Dämmung 10–120 · Karten einklappbar · Schema unter den TS ·
//                  «Erdsonde» weg · 52–65 °C · 1–5 K
//
// Ausführen: CHROME=<chromium> node scripts/feedback_20260728_1_test.mjs
import { chromium } from 'playwright-core';
import { startServer, BASE, seed, newPage } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ FAIL: ' + n); } };

const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function seite(datei, warteAuf, extra) {
  const { ctx, page } = await newPage(browser, Object.assign(seed(['role_planer']), extra || {}));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/' + datei, { waitUntil: 'domcontentloaded' });
  if (warteAuf) await page.waitForFunction(warteAuf, null, { timeout: 12000 });
  await page.waitForTimeout(1100);
  return { ctx, page, errs };
}

/* ════════ Apparateliste ════════ */
console.log('■ Apparateliste');
{
  const { ctx, page, errs } = await seite('sb_apparateliste.html', () => typeof _apHooks !== 'undefined');

  ok(await page.locator('.hero-norm').count() === 0, 'Norm-Badge im Hero entfernt');
  const felder = await page.evaluate(() => ['prjStrasse', 'prjPlz', 'prjOrt', 'prjLieferant',
    'prjBauherr', 'prjArchitekt', 'prjPlaner', 'prjUnternehmer'].filter(i => !!document.getElementById(i)));
  ok(felder.length === 8, 'komplette Adresse + Beteiligte + Lieferant erfasst (' + felder.length + '/8)');
  ok(await page.locator('#apLieferantList option').count() >= 4, 'Lieferanten-Vorschläge (Richner, Sanitas Troesch, Sabag, …)');
  ok(await page.evaluate(() => [...document.querySelectorAll('#apLieferantList option')].map(o => o.value).join('|')).then(v => /Richner/.test(v) && /Sabag/.test(v)), 'genannte Lieferanten sind dabei');

  // Beteiligte sind aufklappbar und starten zugeklappt
  ok(await page.evaluate(() => document.getElementById('prjBetBd').style.display) === 'none', 'Beteiligte starten eingeklappt');
  await page.evaluate(() => apBetToggle());
  ok(await page.evaluate(() => document.getElementById('prjBetBd').style.display) !== 'none', 'Beteiligte aufklappbar');

  // Werte landen im State und überleben das Speichern
  await page.evaluate(() => {
    ['Strasse|Musterweg 3', 'Plz|4000', 'Ort|Basel', 'Lieferant|Richner', 'Bauherr|Muster AG'].forEach(x => {
      const [k, v] = x.split('|'); const el = document.getElementById('prj' + k);
      el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  const st = await page.evaluate(() => _apHooks.getState());
  ok(st.strasse === 'Musterweg 3' && st.plz === '4000' && st.ort === 'Basel', 'Adresse im State');
  ok(st.lieferant === 'Richner' && st.bauherr === 'Muster AG', 'Lieferant + Beteiligte im State');

  // Freie Apparate-Auswahl
  await page.evaluate(() => openWizardAdd());
  await page.waitForTimeout(250);
  const steps = await page.evaluate(() => _apHooks.wizard().steps.map(s => s.k));
  ok(steps[steps.length - 1] === 'extras', 'Wizard hat den Schritt «Weitere Apparate»');
  await page.evaluate(() => { const w = _apHooks.wizard(); w.step = w.steps.length - 1; _apHooks.renderWiz(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#apExtraList').parentNode.querySelector('button.nbtn').click());
  await page.waitForTimeout(150);
  const ff = await page.evaluate(() => [...document.querySelectorAll('.ap-extra [data-f]')].map(x => x.dataset.f));
  ok(['grund', 'ausfuehrung', 'material', 'spezielles'].every(k => ff.indexOf(k) >= 0), 'Grundapparat · Ausführung · Material · Spezielles vorhanden');
  ok(await page.locator('.ap-extra .ap-chip').count() >= 5, 'Zubehör-Auswahl (Siphon, Schallschutz, Montage-Set, UP-Material, Armatur …)');
  const zubL = await page.evaluate(() => [...document.querySelectorAll('.ap-extra .ap-chip')].map(b => b.textContent).join('|'));
  ok(/Siphon/.test(zubL) && /Schallschutz/.test(zubL) && /UP-Material/.test(zubL), 'die genannten Zubehör-Teile sind dabei');

  const rows = await page.evaluate(() => {
    const w = _apHooks.wizard(), x = w.draft.extras[0];
    x.grund = 'Urinal'; x.ausfuehrung = 'Absaug'; x.material = 'Keramik'; x.zub.siphon = true;
    x.spezielles = 'Sonderhöhe 60 cm'; x.menge = 2;
    return _apHooks.buildRows(w.draft).map(r => r.app + '|' + r.menge + '|' + r.details);
  });
  const urinal = rows.find(r => r.indexOf('Urinal') === 0);
  ok(!!urinal && /\|2\|/.test(urinal), 'freier Apparat landet mit Anzahl in der Liste');
  ok(urinal && /Absaug/.test(urinal) && /Keramik/.test(urinal) && /Siphon/.test(urinal) && /Sonderhöhe/.test(urinal),
    'alle Merkmale erscheinen: ' + urinal);
  // Altbestand ohne das Feld darf nicht abstürzen
  ok(await page.evaluate(() => { try { return _apHooks.buildRows({ roomType: 'Badezimmer', qty: 1, hasWC: true }).length > 0; } catch (e) { return false; } }),
    'Räume ohne extras-Feld (Altbestand) rendern unverändert');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ Druckverlust ════════ */
console.log('■ Druckverlust');
{
  const { ctx, page, errs } = await seite('sb_druckverlust.html', () => typeof dvSchemaToggle === 'function');
  const titel = await page.evaluate(() => document.querySelector('#dvSchemaCard .dv-foldhd').textContent);
  ok(!/Strang/.test(titel), '«Strang» aus der Schema-Beschriftung entfernt: ' + JSON.stringify(titel.trim().slice(0, 40)));

  // Schema steht VOR den Teilstrecken
  const vorTs = await page.evaluate(() => {
    const c = document.getElementById('dvSchemaCard'), t = document.getElementById('tsContainer');
    return !!(c && t) && (c.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
  });
  ok(vorTs, 'Visualisierung steht ganz oben (vor den Teilstrecken)');
  ok(await page.evaluate(() => document.getElementById('dvSchema').style.display) !== 'none', 'standardmässig ausgeklappt');
  await page.evaluate(() => dvSchemaToggle());
  ok(await page.evaluate(() => document.getElementById('dvSchema').style.display) === 'none', 'manuell einklappbar');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900);
  ok(await page.evaluate(() => document.getElementById('dvSchema').style.display) === 'none', 'Wahl überlebt den Reload');
  await page.evaluate(() => dvSchemaToggle());
  ok(await page.evaluate(() => document.getElementById('dvSchema').style.display) !== 'none', 'wieder aufklappbar');
  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ Enthärtung ════════ */
console.log('■ Enthärtungsanlage');
{
  const { ctx, page, errs } = await seite('sa_enthaertung.html', () => typeof recalc === 'function');
  // Zwei Stränge mit Aufhärtung erzeugen
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('hr_fh', '30'); set('lu_A', '10'); set('v_A', '18'); set('lu_B', '5'); set('v_B', '15');
    recalc();
  });
  await page.waitForTimeout(400);
  const svg = await page.evaluate(() => (document.getElementById('enthSchemaWrap') || {}).innerHTML || '');
  ok(svg.length > 500, 'Anlagenschema wird gezeichnet');
  ok(/Enthärtungsanlage/.test(svg), 'Beschriftung «Enthärtungsanlage» vorhanden');
  // Text steht NEBEN dem Behälter (nicht mittig darin) → text-anchor nicht middle
  const nebendran = await page.evaluate(() => {
    const svg = document.querySelector('#enthSchemaWrap svg'); if (!svg) return false;
    const t = [...svg.querySelectorAll('text')].find(x => /Enthärtungsanlage/.test(x.textContent));
    const r = [...svg.querySelectorAll('rect')].filter(x => +x.getAttribute('width') > 40 && +x.getAttribute('width') < 200 && +x.getAttribute('height') === 72)[0];
    if (!t || !r) return false;
    return t.getAttribute('text-anchor') !== 'middle' && (+t.getAttribute('x')) > (+r.getAttribute('x') + +r.getAttribute('width'));
  });
  ok(nebendran, 'Text steht rechts NEBEN dem Behälter');
  const breite = await page.evaluate(() => {
    const svg = document.querySelector('#enthSchemaWrap svg'); if (!svg) return 999;
    const r = [...svg.querySelectorAll('rect')].filter(x => +x.getAttribute('height') === 72)[0];
    return r ? +r.getAttribute('width') : 999;
  });
  ok(breite <= 80, 'Behälter schmaler dargestellt (' + breite + ' px)');

  // Gewählter Anlagetyp als Text
  await page.evaluate(() => {
    localStorage.setItem('gema_enthaertung_anlage', JSON.stringify({ lieferant: 'BWT', serie: 'AQA perla', modell: '20' }));
    recalc();
  });
  await page.waitForTimeout(300);
  ok(/BWT AQA perla 20/.test(await page.evaluate(() => (document.getElementById('enthSchemaWrap') || {}).innerHTML || '')),
    'gewählter Anlagetyp erscheint als Text im Schema');
  ok(await page.evaluate(() => typeof window._enthGetChosenAnlage === 'function'), 'gewählte Anlage ist für den Schema-Block erreichbar');

  // Separate Umgehungsleitungen: mehrere waagrechte Umgehungs-Spuren
  const spuren = await page.evaluate(() => {
    const svg = document.querySelector('#enthSchemaWrap svg'); if (!svg) return 0;
    const ys = new Set();
    svg.querySelectorAll('line[stroke-dasharray]').forEach(l => {
      if (l.getAttribute('y1') === l.getAttribute('y2')) ys.add(l.getAttribute('y1'));
    });
    return ys.size;
  });
  ok(spuren >= 2, 'jede Aufhärtung hat ihre eigene Leitung (' + spuren + ' Spuren)');
  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ Prüfliste ════════ */
console.log('■ Prüfliste');
{
  const BEG = {
    id: 'b1', nr: 'BEG-2026-001', orgId: 'org_test', status: 'offen', datum: '2026-07-28',
    art: 'begehung', prueferName: 'S', anlagen: [{
      anlagenart: 'sanitaer', name: 'A', punkte: [
        { id: 'p1', bezeichnung: 'Kessel', antworttyp: 'ja_nein_nb', bauteil: true, baujahr: '' }]
    }]
  };
  const { ctx, page, errs } = await seite('pm_pruefliste.html',
    () => typeof prOpen === 'function', { gema_pr_beg_pool_v1: [BEG], gema_coachmarks_done_pruefliste: '1' });
  await page.evaluate(b => localStorage.setItem('gema_pr_beg_pool_v1', JSON.stringify([b])), BEG);
  await page.evaluate(() => prOpen('b1'));
  await page.waitForTimeout(400);

  // Objekttyp als Chips (wie Nutzungen)
  ok(await page.locator('#eObjTypChips .chip').count() >= 5, 'Objekttyp als Chips — gleich wie die Nutzungen');
  ok(await page.locator('#eNutzungen .chip').count() >= 3, 'Nutzungen weiterhin als Chips');
  await page.click('#eObjTypChips .chip >> nth=1');
  await page.waitForTimeout(150);
  ok(await page.locator('#eObjTypChips .chip.on').count() === 1, 'Einfachauswahl: genau ein Chip aktiv');
  const typ1 = await page.evaluate(() => _prHooks ? null : null);
  await page.click('#eObjTypChips .chip.on');
  await page.waitForTimeout(150);
  ok(await page.locator('#eObjTypChips .chip.on').count() === 0, 'erneuter Klick hebt die Wahl auf');

  // Art frei beschreibbar
  ok(await page.evaluate(() => [...document.getElementById('eArt').options].some(o => o.value === 'frei')),
    'Art kennt «Eigene Bezeichnung …»');
  await page.evaluate(() => prEArt('frei'));
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.getElementById('eArtFreiWrap').style.display) !== 'none', 'Freitextfeld erscheint');
  await page.evaluate(() => { const e = document.getElementById('eArtFrei'); e.value = 'Zustandsaufnahme vor Umbau'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(250);
  ok(/Zustandsaufnahme vor Umbau/.test(await page.evaluate(() => document.querySelector('#edBody .sec-hd h3').textContent)),
    'eigene Bezeichnung steht im Kopf');

  // Baujahr frei beschreibbar
  const bj = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#edBody .bauteil input')].find(i => i.getAttribute('list') === 'prJahrList');
    if (!el) return null;
    el.value = 'ca. 1985'; el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.tagName + '|' + el.value;
  });
  ok(bj === 'INPUT|ca. 1985', 'Baujahr ist ein Textfeld mit Jahres-Vorschlägen (' + bj + ')');
  ok(await page.locator('#prJahrList option').count() > 50, 'Jahres-Vorschläge vorhanden');
  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

/* ════════ Zirkulation ════════ */
console.log('■ Zirkulationsberechnung');
{
  const { ctx, page, errs } = await seite('sb_zirkulation.html', () => typeof zkRenderTable === 'function');

  // Temperatur-/ΔT-Auswahl
  const tww = await page.evaluate(() => [...document.getElementById('zk_tww').options].map(o => +o.value));
  ok(tww[0] === 52 && tww[tww.length - 1] === 65, 'Temp. Warmwasser 52–65 °C wählbar');
  const dt = await page.evaluate(() => [...document.getElementById('zk_dtzul').options].map(o => +o.value));
  ok(dt[0] === 1 && dt[dt.length - 1] === 5, 'Zulässige Abkühlung 1–5 K wählbar');
  ok(!/Erdsonde/.test(await page.evaluate(() => document.body.textContent)), '«Erdsonde» aus «ESH kalt» entfernt');

  // Karten einklappbar
  ok(await page.evaluate(() => document.getElementById('bd_zkGrund').style.display) !== 'none', 'Grundparameter starten offen');
  await page.evaluate(() => zkFold('zkGrund'));
  ok(await page.evaluate(() => document.getElementById('bd_zkGrund').style.display) === 'none', 'Grundparameter einklappbar');
  ok(await page.evaluate(() => document.getElementById('bd_zkHilfe').style.display) === 'none', '«So funktioniert\'s» startet eingeklappt');
  await page.evaluate(() => zkFold('zkHilfe'));
  ok(await page.evaluate(() => document.getElementById('bd_zkHilfe').style.display) !== 'none', '«So funktioniert\'s» aufklappbar');

  // Reihenfolge: Grundparameter → Teilstrecken → Schema
  const reihen = await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const ts = q('#zkTable').closest('.g-card'), sc = q('#zkSchemaCard'), gr = q('#bd_zkGrund').closest('.g-card');
    const pos = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
    return { tsNachGrund: pos(gr, ts), schemaNachTs: pos(ts, sc) };
  });
  ok(reihen.tsNachGrund, 'Teilstrecken direkt unter den Grundeinstellungen (2. Position)');
  ok(reihen.schemaNachTs, 'Netzschema folgt den Teilstrecken');

  // Teilstrecken aufklappbar, Werte im aufgeklappten Zustand
  await page.evaluate(() => { zkRows[0].len = 50; zkPersist(); zkRenderTable(); zkRecalc(); });
  await page.waitForTimeout(200);
  ok(await page.locator('#zkBody tr.zk-det').count() === 0, 'Teilstrecke startet zugeklappt');
  ok(await page.locator('#zkBody .zk-chip').count() >= 4, 'Kopfzeile zeigt die wichtigsten Werte als Chips');
  await page.evaluate(() => zkToggleRow(0));
  await page.waitForTimeout(200);
  ok(await page.locator('#zkBody tr.zk-det').count() === 1, 'Teilstrecke aufklappbar');
  const vals = await page.evaluate(() => [...document.querySelectorAll('#zkBody tr.zk-det .zk-val .v')].map(x => x.textContent.trim()));
  ok(vals.length === 8 && vals.filter(v => v !== '–').length >= 6, 'alle Werte im aufgeklappten Zustand (' + vals.join(' · ') + ')');

  // Dämmstärken wählbar
  const dm = await page.evaluate(() => [...document.querySelectorAll('#zkBody [data-daemm="vl"] option')].map(o => o.value).filter(Boolean).map(Number));
  ok(dm[0] === 10 && dm[dm.length - 1] === 120 && dm.length === 12, 'Dämmung 10–120 mm wählbar (+ auto)');

  // Fabrikat steuert Werkstoff + Dimensionen
  ok(await page.locator('#zk_fabrikat option').count() >= 4, 'Fabrikat-Auswahl vorhanden');
  await page.evaluate(() => { document.getElementById('zk_fabrikat').value = 'nussbaum_optipress'; zkFabChanged('nussbaum_optipress'); });
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => zkRows[0].mat) === 'Edelstahl', 'Werkstoff folgt dem Fabrikat automatisch');
  const ovl = await page.evaluate(() => [...document.querySelectorAll('#zkBody [data-k="ovl"] option')].map(o => +o.value));
  ok(ovl.length === 7 && ovl[0] === 15 && ovl[ovl.length - 1] === 54, 'nur noch die ø des Fabrikats wählbar (' + ovl.join(',') + ')');
  ok(await page.evaluate(() => { const s = document.querySelector('#zkBody [data-k="mat"]'); return !!(s && s.disabled); }),
    'Werkstoff-Auswahl folgt dem Fabrikat (gesperrt)');

  ok(errs.length === 0, 'keine JS-Fehler' + (errs.length ? ': ' + errs[0] : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
