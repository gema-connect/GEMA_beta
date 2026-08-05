// ═══════════════════════════════════════════════════════════════════════════
// Drift-Guard: Prüfliste — Feedback 29./30.07.2026 (Sandro, 8 Punkte)
//   #1 Vorlagen-Änderungen in OFFENE Berichte nachziehen (prSyncPunkte +
//      syncOffeneBegehung beim Öffnen; abgeschlossene bleiben Snapshot)
//   #2 Mehrere Empfehlungen (eine pro Zeile) — im Begehungs-Editor als
//      wählbare Chips (prEmpfToggle)
//   #3 Bauteil-Felder (Hersteller/Typ/Baujahr/Material) EINZELN wählbar
//      (bauteilFelder, Checkboxen in allen drei Punkt-Editoren)
//   #4 Bericht-Bilder automatisch angepasst (height:auto + contain)
//   #5 «✎ Bearbeiten» direkt aus dem Bericht (prBerichtBearbeiten öffnet
//      auch eine abgeschlossene Begehung in einem Schritt)
//   #6 Mehrere Fotos auf einmal (multiple auf beiden Foto-Wegen)
//   #7 Zustand ÜBERALL als Auswahl-Chips statt Dropdown
//   #8 Geruch: Zustands-Skala tief/mittel/hoch (intern gut/maessig/schlecht)
// Aufruf: CHROME=<chromium> node scripts/pruefliste_feedback_20260730_test.mjs
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import { chromium } from 'playwright-core';
import { startServer, BASE, newPage, seed } from './rolematrix_harness.mjs';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
let n = 0, fail = 0;
function ok(name, cond) { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } }

/* ═══ Teil A — Engine (Node, DOM-frei) ═══ */
console.log('■ Engine: Skala, Bauteil-Felder, Empfehlungs-Items, Sync');
{
  const src = fs.readFileSync(new URL('../pm_pruefliste.html', import.meta.url), 'utf8');
  const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
  const g = {}; new Function('window', m[1])(g);
  const E = g._prEngine;

  // #8 — Zustands-Skala
  ok('geruch trägt skala intensitaet', E.PR_ANTWORTTYPEN.geruch.skala === 'intensitaet');
  ok('prZustandLabel geruch: schlecht → hoch', E.prZustandLabel('geruch', 'schlecht') === 'hoch');
  ok('prZustandLabel geruch: gut → tief', E.prZustandLabel('geruch', 'gut') === 'tief');
  ok('prZustandLabel geruch: maessig → mittel', E.prZustandLabel('geruch', 'maessig') === 'mittel');
  ok('prZustandLabel Standard-Typ unverändert (schlecht)', E.prZustandLabel('ja_nein_nb', 'schlecht') === 'schlecht');
  ok('prZustandLabel unbekannter Typ fällt auf PR_BEWERTUNGEN zurück', E.prZustandLabel('gibtsnicht', 'maessig') === 'mässig');

  // #3 — Bauteil-Felder einzeln
  ok('Legacy bauteil:true → alle vier Felder', JSON.stringify(E.prBauteilFelder({ bauteil: true })) === '["hersteller","typ","baujahr","material"]');
  ok('bauteilFelder wählt einzeln (Reihenfolge fix)', JSON.stringify(E.prBauteilFelder({ bauteil: true, bauteilFelder: { baujahr: true, hersteller: true } })) === '["hersteller","baujahr"]');
  ok('ohne bauteil → keine Felder', E.prBauteilFelder({}).length === 0 && E.prBauteilFelder(null).length === 0);

  // #2 — Empfehlungs-Vorlagen
  ok('prEmpfItems splittet Zeilen + strippt Bullets',
    JSON.stringify(E.prEmpfItems('- Ventil ersetzen\n• Dichtung prüfen\n\nService veranlassen')) === '["Ventil ersetzen","Dichtung prüfen","Service veranlassen"]');
  ok('prEmpfItems leer-sicher', E.prEmpfItems('').length === 0 && E.prEmpfItems(null).length === 0);

  // #1 — prSyncPunkte
  const anlage = { punkte: [
    { key: 'k1', punktId: 'std_a', quelle: 'global', individuell: false, bezeichnung: 'Alt-Wortlaut', untergruppe: '', antworttyp: 'ja_nein_nb',
      pflicht: false, standardbewertung: 'schlecht', empfehlungVorlage: 'Alt-Empfehlung', antwort: 'nein', bewertung: 'schlecht', bemerkung: 'undicht', empfehlung: 'Eigenes', fotos: [{ url: 'x' }] },
    { key: 'k2', punktId: 'std_b', quelle: 'global', individuell: false, bezeichnung: 'Unbeantwortet', untergruppe: '', antworttyp: 'ja_nein_nb',
      pflicht: false, standardbewertung: 'schlecht', empfehlungVorlage: '', antwort: null, bewertung: 'nicht_bewertet', bemerkung: '', empfehlung: '', fotos: [] },
    { key: 'k3', punktId: 'ind_1', quelle: 'begehung', individuell: true, bezeichnung: 'Individuell erfasst', antwort: null, bewertung: 'nicht_bewertet', fotos: [] }
  ] };
  const eff = [
    { id: 'std_a', quelle: 'global', bezeichnung: 'Neu-Wortlaut', untergruppe: 'Armaturen', antworttyp: 'auffaellig', pflicht: true,
      standardbewertung: 'schlecht', empfehlung: 'Neue Empfehlung 1\nNeue Empfehlung 2', bauteil: true, bauteilFelder: { hersteller: true } },
    { id: 'std_b', quelle: 'global', bezeichnung: 'Unbeantwortet NEU', untergruppe: '', antworttyp: 'zustand', pflicht: false, standardbewertung: 'schlecht', empfehlung: '' },
    { id: 'std_neu', quelle: 'org', bezeichnung: 'Ganz neuer Punkt', untergruppe: '', antworttyp: 'ja_nein_nb', pflicht: false, standardbewertung: 'schlecht', empfehlung: 'Tun.' }
  ];
  const r1 = E.prSyncPunkte(anlage, eff);
  ok('Sync: 1 neu + 2 aktualisiert', r1.neu === 1 && r1.aktualisiert === 2);
  const a0 = anlage.punkte[0], a1 = anlage.punkte[1], a2 = anlage.punkte[2], a3 = anlage.punkte[3];
  ok('Definition nachgezogen (Bezeichnung/Vorlage/Bauteil)', a0.bezeichnung === 'Neu-Wortlaut' && a0.empfehlungVorlage.indexOf('Neue Empfehlung 2') > 0 && a0.bauteilFelder.hersteller === true);
  ok('Nutzer-Daten UNANGETASTET (Antwort/Zustand/Bemerkung/Empfehlung/Fotos)',
    a0.antwort === 'nein' && a0.bewertung === 'schlecht' && a0.bemerkung === 'undicht' && a0.empfehlung === 'Eigenes' && a0.fotos.length === 1);
  ok('Antworttyp bei BEANTWORTETEM Punkt NICHT geändert', a0.antworttyp === 'ja_nein_nb');
  ok('Antworttyp bei unbeantwortetem Punkt nachgezogen', a1.antworttyp === 'zustand' && a1.bezeichnung === 'Unbeantwortet NEU');
  ok('Individueller Punkt bleibt unangetastet', a2.bezeichnung === 'Individuell erfasst');
  ok('Neuer Punkt angehängt (unbeantwortet)', a3 && a3.punktId === 'std_neu' && a3.antwort === null && a3.bewertung === 'nicht_bewertet');
  const r2 = E.prSyncPunkte(anlage, eff);
  ok('Zweiter Lauf idempotent (0/0)', r2.neu === 0 && r2.aktualisiert === 0);
  const r3 = E.prSyncPunkte(anlage, [eff[0]]);   // std_b/std_neu aus der Liste entfernt
  ok('Entfernte Standardpunkte werden NIE gelöscht', r3.neu === 0 && anlage.punkte.length === 4);
}

/* ═══ Teil B — Browser (echte UI) ═══ */
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const errors = [];
const { ctx, page } = await newPage(browser, seed(['role_admin']));
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE + '/pm_pruefliste.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window._prHooks, null, { timeout: 9000 });

try {
  console.log('■ #7/#8 — Zustand als Chips, Geruch tief/mittel/hoch');
  await page.evaluate(() => window.prNeu());
  await page.evaluate(() => window.prAddAnlage('abwasser'));
  const gi = await page.evaluate(() => {
    const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
    return { ai: 0, pi: b.anlagen[0].punkte.findIndex(p => p.antworttyp === 'geruch') };
  });
  ok('Geruchsemission-Punkt geladen', gi.pi >= 0);
  await page.evaluate(g => window.prTogglePkt(g.ai, g.pi), gi);
  ok('kein Zustand-Dropdown im Panel', !(await page.$('#more_' + gi.ai + '_' + gi.pi + ' select')));
  const gchips = await page.$$eval('#more_' + gi.ai + '_' + gi.pi + ' .ans-btn', els => els.map(e => e.textContent.trim()));
  // Feedback 05.08.2026 (Tim): vierte Stufe «normal» am Anfang, «nicht beurteilbar» am Ende
  ok('Geruch-Zustand-Chips heissen normal/tief/mittel/hoch/nicht beurteilbar',
    JSON.stringify(gchips) === '["normal","tief","mittel","hoch","nicht beurteilbar"]');
  await page.evaluate(g => window.prSetBewertung(g.ai, g.pi, 'schlecht'), gi);
  const gp = await page.evaluate(g => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].anlagen[g.ai].punkte[g.pi], gi);
  ok('intern bleibt der Wert «schlecht»', gp.bewertung === 'schlecht');
  ok('Kopf-Chip zeigt «hoch»', (await page.$eval('#pkt_' + gi.ai + '_' + gi.pi + ' .bw-chip', el => el.textContent.trim())) === 'hoch');
  // Standard-Punkt: Chips heissen gut/mässig/schlecht
  const ji = await page.evaluate(() => {
    const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
    return { ai: 0, pi: b.anlagen[0].punkte.findIndex(p => p.antworttyp === 'ja_nein_nb') };
  });
  await page.evaluate(j => window.prTogglePkt(j.ai, j.pi), ji);
  const jchips = await page.$$eval('#more_' + ji.ai + '_' + ji.pi + ' .ans-btn', els => els.map(e => e.textContent.trim()));
  ok('Standard-Zustand-Chips gut/mässig/schlecht/nicht beurteilbar',
    JSON.stringify(jchips) === '["gut","mässig","schlecht","nicht beurteilbar"]');
  await page.evaluate(j => window.prSetBewertung(j.ai, j.pi, 'maessig'), ji);
  await page.evaluate(j => window.prSetBewertung(j.ai, j.pi, 'nicht_bewertet'), ji);
  const jp = await page.evaluate(j => window._prHooks.cached(window._prHooks.POOLS.BEG)[0].anlagen[j.ai].punkte[j.pi], ji);
  ok('erneuter Klick setzt auf nicht bewertet zurück', jp.bewertung === 'nicht_bewertet');

  console.log('■ #2 — Empfehlungs-Vorlagen als wählbare Chips');
  await page.evaluate(j => {
    const b = window._prHooks.cached(window._prHooks.POOLS.BEG)[0];
    const p = b.anlagen[j.ai].punkte[j.pi];
    p.empfehlungVorlage = 'Ventil ersetzen\nDichtung prüfen\nService veranlassen';
    p.empfehlung = '';
    
  }, ji);
  // _cur ist eine Kopie — Vorlage direkt am _cur setzen + neu rendern
  await page.evaluate(j => {
    const c = window._prHooks.aktuelle();
    const p = c.anlagen[j.ai].punkte[j.pi];
    p.empfehlungVorlage = 'Ventil ersetzen\nDichtung prüfen\nService veranlassen';
    p.empfehlung = '';
    window._prHooks.renderEditor();
    window.prTogglePkt(j.ai, j.pi);
  }, ji);
  const echips = await page.$$eval('#more_' + ji.ai + '_' + ji.pi + ' .empf-chip', els => els.length);
  ok('3 Empfehlungs-Chips sichtbar', echips === 3);
  await page.evaluate(j => { window.prEmpfToggle(j.ai, j.pi, 0); window.prEmpfToggle(j.ai, j.pi, 2); }, ji);
  let ep = await page.evaluate(j => window._prHooks.aktuelle().anlagen[j.ai].punkte[j.pi].empfehlung, ji);
  ok('zwei Vorlagen übernommen (je eigene Zeile)', ep === 'Ventil ersetzen\nService veranlassen');
  await page.evaluate(j => window.prEmpfToggle(j.ai, j.pi, 0), ji);
  ep = await page.evaluate(j => window._prHooks.aktuelle().anlagen[j.ai].punkte[j.pi].empfehlung, ji);
  ok('erneuter Klick entfernt genau diese Empfehlung', ep === 'Service veranlassen');
  ok('aktive Chips als solche markiert (.on)', (await page.$$eval('#more_' + ji.ai + '_' + ji.pi + ' .empf-chip.on', els => els.length)) === 1);

  console.log('■ #3 — Bauteil-Felder einzeln (Editoren + Panel)');
  // Verwaltungs-Editor: 4 Checkboxen statt Ja/Nein-Select
  await page.evaluate(() => window.prPkNew());
  ok('5 Bauteil-Checkboxen im Prüfpunkt-Editor (inkl. Wartung/Ersatz — Feedback 30.07.2026)', (await page.$$eval('#pkEditBody .btchk input', els => els.length)) === 5 && (await page.$('#pkBt_wartung')) != null);
  ok('kein pkBauteil-Select mehr', !(await page.$('#pkBauteil')));
  await page.fill('#pkBez', 'Testpunkt Bauteil einzeln');
  await page.evaluate(() => { document.getElementById('pkBt_hersteller').checked = true; document.getElementById('pkBt_baujahr').checked = true; });
  await page.evaluate(() => window.prPkSave());
  const neu = await page.evaluate(() => window._prHooks.stdOrgAll().filter(p => p.bezeichnung === 'Testpunkt Bauteil einzeln')[0]);
  ok('Record trägt bauteilFelder {hersteller,baujahr}', neu && neu.bauteil === true && neu.bauteilFelder && neu.bauteilFelder.hersteller === true && neu.bauteilFelder.baujahr === true && !neu.bauteilFelder.typ);
  // Begehungs-Panel zeigt NUR die gewählten Felder
  await page.evaluate(j => {
    const c = window._prHooks.aktuelle();
    const p = c.anlagen[j.ai].punkte[j.pi];
    p.bauteil = true; p.bauteilFelder = { hersteller: true, baujahr: true };
    window._prHooks.renderEditor(); window.prTogglePkt(j.ai, j.pi);
  }, ji);
  const btLabels = await page.$$eval('#more_' + ji.ai + '_' + ji.pi + ' .bauteil label', els => els.map(e => e.textContent.trim()));
  ok('Panel zeigt nur Hersteller + Baujahr', JSON.stringify(btLabels) === '["Hersteller","Baujahr"]');
  // «Prüfpunkt ergänzen»-Dialog: gleiche Checkboxen
  await page.evaluate(() => window.prAddPktOpen(0));
  ok('Ergänzen-Dialog: 5 Bauteil-Checkboxen (apBt_, inkl. Wartung/Ersatz)', (await page.$$eval('#addPktBody .btchk input', els => els.length)) === 5 && (await page.$('#apBt_material')) != null && (await page.$('#apBt_wartung')) != null);
  await page.evaluate(() => window.prAddPktClose());

  console.log('■ #1 — Vorlagen-Änderung fliesst in OFFENE Begehung');
  // Begehung schliessen (Editor zu), Standardpunkt ändern, wieder öffnen
  const begId = await page.evaluate(() => window._prHooks.aktuelle().id);
  await page.evaluate(() => window.prCloseEditor());
  await page.evaluate(() => {
    // Geruchsemission (prstd_def_25) global umbenennen + neue Empfehlungs-Vorlage
    const merged = window._prHooks.stdGlobalMerged();
    const p = merged.filter(x => x.antworttyp === 'geruch')[0];
    const rec = JSON.parse(JSON.stringify(p)); delete rec._default;
    rec.scope = 'global'; rec.orgId = null; rec.status = 'aktiv';
    rec.bezeichnung = 'Geruchsemission (neu formuliert)';
    rec.empfehlung = 'Empfehlung A\nEmpfehlung B';
    window._prHooks.saveRec(window._prHooks.POOLS.STD, 'prstd:', rec);
  });
  await page.evaluate(id => window.prOpen(id), begId);
  await page.waitForTimeout(300);
  const sync = await page.evaluate(() => {
    const c = window._prHooks.aktuelle();
    return c.anlagen[0].punkte.filter(p => /Geruchsemission/.test(p.bezeichnung))[0];
  });
  ok('offene Begehung: Bezeichnung nachgezogen', sync && sync.bezeichnung === 'Geruchsemission (neu formuliert)');
  ok('offene Begehung: neue Empfehlungs-Vorlage da', sync && /Empfehlung B/.test(sync.empfehlungVorlage || ''));
  ok('Antwort/Zustand der Begehung blieben erhalten', sync && sync.bewertung === 'schlecht');
  ok('Sync persistiert (Pool)', await page.evaluate(id => {
    const b = window._prHooks.cached(window._prHooks.POOLS.BEG).filter(x => x.id === id)[0];
    return b.anlagen[0].punkte.some(p => p.bezeichnung === 'Geruchsemission (neu formuliert)');
  }, begId));
  // Abgeschlossene bleibt Snapshot
  await page.evaluate(() => { const c = window._prHooks.aktuelle(); c.status = 'abgeschlossen'; window._prHooks.saveBegC(); });
  await page.evaluate(() => window.prCloseEditor());
  await page.evaluate(() => {
    const merged = window._prHooks.stdGlobalMerged();
    const p = merged.filter(x => /Geruchsemission/.test(x.bezeichnung))[0];
    const rec = JSON.parse(JSON.stringify(p)); rec.bezeichnung = 'Geruchsemission NOCHMALS geändert';
    window._prHooks.saveRec(window._prHooks.POOLS.STD, 'prstd:', rec);
  });
  await page.evaluate(id => window.prOpen(id), begId);
  const abgSync = await page.evaluate(() => window._prHooks.aktuelle().anlagen[0].punkte.filter(p => /Geruchsemission/.test(p.bezeichnung))[0]);
  ok('abgeschlossene Begehung bleibt Snapshot', abgSync.bezeichnung === 'Geruchsemission (neu formuliert)');

  console.log('■ #5 — «✎ Bearbeiten» direkt aus dem Bericht');
  // Bericht-HTML abfangen
  await page.evaluate(() => {
    window.__rep = '';
    window.GemaPrintA4 = null;
    window.open = function () { return { document: { write: function (h) { window.__rep += h; }, close: function () {} }, print: function () {}, focus: function () {} }; };
    window.prBericht();
  });
  const rep = await page.evaluate(() => window.__rep);
  ok('Bericht hat «✎ Bearbeiten»-Knopf', rep.indexOf('gemaBerichtBearbeiten') >= 0 && rep.indexOf('✎ Bearbeiten') >= 0);
  ok('Bericht-Fenster definiert gemaBerichtBearbeiten', rep.indexOf('window.gemaBerichtBearbeiten=function') >= 0);
  // #4 — Bilder automatisch angepasst
  ok('Bericht-Bilder: height auto + contain (kein fixes 58mm-Cover)', /\.pgrid img\{[^}]*height:auto/.test(rep) && /\.pgrid img\{[^}]*object-fit:contain/.test(rep) && rep.indexOf('height:58mm') < 0);
  ok('Bericht-Zustand nutzt die Geruch-Skala («hoch»)', />hoch</.test(rep));
  // prBerichtBearbeiten öffnet die abgeschlossene Begehung in einem Schritt
  await page.evaluate(() => window.prBerichtBearbeiten());
  const nachEdit = await page.evaluate(() => ({ status: window._prHooks.aktuelle().status, offen: document.getElementById('edOv').classList.contains('open') }));
  ok('abgeschlossene Begehung → ein Klick → wieder offen im Editor', nachEdit.status === 'offen' && nachEdit.offen);

  console.log('■ #6 — Mehrfach-Fotoauswahl auf beiden Wegen');
  await page.evaluate(() => window.prAddFoto(0, 0, 'galerie'));
  ok('Mediathek-Input: multiple, ohne capture', await page.evaluate(() => {
    const i = document.querySelector('input[type=file]');
    return !!i && i.multiple === true && !i.hasAttribute('capture');
  }));
  await page.evaluate(() => window.prAddFoto(0, 0, 'kamera'));
  ok('Kamera-Weg: multiple gesetzt (Dateidialog-Fallback), capture bleibt', await page.evaluate(() => {
    const i = document.querySelector('input[type=file]');
    return !!i && i.multiple === true && i.getAttribute('capture') === 'environment';
  }));

  ok('keine pageerrors', errors.length === 0 || (console.log('   errs:', errors), false));
} finally {
  await ctx.close(); await browser.close(); server.close();
}
console.log('');
console.log(fail === 0 ? '✓ alle ' + n + ' Checks grün' : '✗ ' + fail + ' von ' + n + ' Checks ROT');
process.exit(fail === 0 ? 0 : 1);
