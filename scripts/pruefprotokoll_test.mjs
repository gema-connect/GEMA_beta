#!/usr/bin/env node
/**
 * Drift-Guard: Prüfprotokoll ortsveränderlicher Betriebsmittel
 * ═══════════════════════════════════════════════════════════════
 * Sichert die fünf Punkte ab, die aus einem Termin-Nachweis einen
 * PRÜF-Nachweis machen:
 *   1. Grenzwerte nach SNR 462638 (Engine, Node)
 *   2. Ergebnis als stabiler Schlüssel statt Emoji-Anzeigetext
 *   3. Prüfeinträge nur mit Bestätigung + Aktivitätenlog löschbar
 *   4. Schutzklasse/Leitungslänge/Heizleistung am Werkzeug
 *   5. Messwerte + Prüfprotokoll am Bericht
 *
 * Teil A/B laufen ohne Browser (Engine + statische Repo-Prüfung),
 * Teil C braucht playwright-core + Chromium und wird sonst mit
 * Hinweis übersprungen — nie still.
 *
 * Aufruf:  CHROME=<chromium> node scripts/pruefprotokoll_test.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, fail = 0;
const T = (name, cond, info) => {
  if (cond) { ok++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${info ? '  → ' + info : ''}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ════════════════════════════════════════════════════════════
console.log('\nA · Engine — Grenzwerte nach SNR 462638');
// ════════════════════════════════════════════════════════════
const P = (await import(join(ROOT, 'gema_pruefwerte.js'))).default;

// Schutzleiterwiderstand: 0.30 Ω bis 5 m, +0.10 Ω je angefangene 7.5 m, max 1.00 Ω
T('R_PE ohne Längenangabe = Basiswert 0.30 Ω', near(P.grenzRpe(undefined), 0.30));
T('R_PE bei 5.0 m = 0.30 Ω (Grenze inklusive)', near(P.grenzRpe(5), 0.30));
T('R_PE bei 5.1 m = 0.40 Ω (erste angefangene Stufe)', near(P.grenzRpe(5.1), 0.40));
T('R_PE bei 12.5 m = 0.40 Ω (genau eine volle Stufe)', near(P.grenzRpe(12.5), 0.40));
T('R_PE bei 12.6 m = 0.50 Ω (zweite Stufe beginnt)', near(P.grenzRpe(12.6), 0.50));
T('R_PE bei 60 m = 1.00 Ω (Deckel greift)', near(P.grenzRpe(60), 1.00));
T('R_PE bei 500 m bleibt 1.00 Ω (nie darüber)', near(P.grenzRpe(500), 1.00));

// Isolationswiderstand je Schutzklasse
T('R_ISO SK I = 1.0 MΩ', near(P.grenzRiso('I'), 1.0));
T('R_ISO SK II = 2.0 MΩ', near(P.grenzRiso('II'), 2.0));
T('R_ISO SK III = 0.25 MΩ', near(P.grenzRiso('III'), 0.25));
T('R_ISO SK I mit 3.5 kW bleibt 1.0 MΩ (Grenze nicht überschritten)', near(P.grenzRiso('I', 3.5), 1.0));
T('R_ISO SK I mit 3.6 kW = 0.30 MΩ (Heizelement-Regel)', near(P.grenzRiso('I', 3.6), 0.30));
T('R_ISO SK II mit 9 kW bleibt 2.0 MΩ (Regel gilt nur SK I)', near(P.grenzRiso('II', 9), 2.0));
T('R_ISO ohne Schutzklasse = null (kein erfundener Wert)', P.grenzRiso('') === null);

// Ableitströme
T('I_PE Basiswert 3.5 mA', near(P.grenzIpe(), 3.5));
T('I_PE bei 3.5 kW bleibt 3.5 mA', near(P.grenzIpe(3.5), 3.5));
T('I_PE bei 6 kW = 6.0 mA (1 mA je kW)', near(P.grenzIpe(6), 6.0));
T('I_PE bei 22 kW = 10 mA (Deckel)', near(P.grenzIpe(22), 10));
T('I_B fest 0.5 mA', near(P.grenzIb(), 0.5));

// Zusammengesetzte Grenzwerte pro Gerät
const gI = P.grenzwerte({ schutzklasse: 'I', leitungLaengeM: 10, heizleistungKw: null });
T('SK I: R_PE gesetzt', near(gI.rpe, 0.40));
T('SK I: I_PE gesetzt', near(gI.ipe, 3.5));
const gII = P.grenzwerte({ schutzklasse: 'II' });
T('SK II: R_PE null (kein Schutzleiter vorhanden)', gII.rpe === null);
T('SK II: I_PE gesetzt', near(gII.ipe, 3.5));
const gIII = P.grenzwerte({ schutzklasse: 'III' });
T('SK III: R_PE null', gIII.rpe === null);
T('SK III: I_PE null (führt keinen Netzstrom)', gIII.ipe === null);
const gLeer = P.grenzwerte({});
T('ohne Schutzklasse: R_PE/R_ISO/I_PE alle null', gLeer.rpe === null && gLeer.riso === null && gLeer.ipe === null);
T('ohne Schutzklasse: I_B trotzdem gesetzt (klassenunabhängig)', near(gLeer.ib, 0.5));
// Gegenprobe zum Versprechen der Oberfläche: ohne Schutzklasse darf die
// Ampel NICHT bewerten — ein Ableitstrom-Basiswert wäre eine Bewertung
// gegen einen Grenzwert, den niemand bestimmt hat.
const ampelLeer = P.messAuswertung({ ipe: 9, ib: 0.02 }, {});
T('ohne Schutzklasse: I_PE wird erfasst, aber nicht bewertet',
  ampelLeer.zeilen.find(z => z.key === 'ipe').status === '' && ampelLeer.ueber === 0);
T('ohne Schutzklasse: I_B wird sehr wohl bewertet',
  ampelLeer.zeilen.find(z => z.key === 'ib').status === 'ok');
T('grenzwerte(null) wirft nicht', (() => { try { P.grenzwerte(null); return true; } catch { return false; } })());

// ════════════════════════════════════════════════════════════
console.log('\nA2 · Engine — Bewertung eines Messwerts');
// ════════════════════════════════════════════════════════════
T('max: klar unter Grenzwert = ok', P.messBewertung(0.10, 0.30, 'max') === 'ok');
T('max: exakt auf Grenzwert = grenz (nicht über)', P.messBewertung(0.30, 0.30, 'max') === 'grenz');
T('max: knapp darunter (>90 %) = grenz', P.messBewertung(0.28, 0.30, 'max') === 'grenz');
T('max: darüber = ueber', P.messBewertung(0.31, 0.30, 'max') === 'ueber');
T('min: klar darüber = ok', P.messBewertung(50, 1.0, 'min') === 'ok');
T('min: exakt auf Grenzwert = grenz', P.messBewertung(1.0, 1.0, 'min') === 'grenz');
T('min: darunter = ueber (Mangel)', P.messBewertung(0.9, 1.0, 'min') === 'ueber');
T('ohne Grenzwert nicht bewertbar = leer', P.messBewertung(0.2, null, 'max') === '');
T('ohne Messwert nicht bewertbar = leer', P.messBewertung('', 0.3, 'max') === '');
T('Text statt Zahl = leer, kein Absturz', P.messBewertung('abc', 0.3, 'max') === '');

// Auswertung mehrerer Werte
const aus = P.messAuswertung({ rpe: 0.21, riso: 55, ipe: 0.4, ib: 0.02 },
  { schutzklasse: 'I', leitungLaengeM: 3 });
T('vier Messwerte werden als erfasst gezählt', aus.erfasst === 4);
T('alle im grünen Bereich → 0 Überschreitungen', aus.ueber === 0);
T('Zeilen tragen Kurzbezeichnung für die Ampel', aus.zeilen.every(z => !!z.kurz));
T('Zeilen tragen Einheit', aus.zeilen.map(z => z.einheit).join(',') === 'Ω,MΩ,mA,mA');
const ausBad = P.messAuswertung({ rpe: 0.9, riso: 0.4 }, { schutzklasse: 'I', leitungLaengeM: 2 });
// Beide sind daneben: R_PE 0.9 > 0.30 Ω, R_ISO 0.4 < 1.0 MΩ (SK I).
T('R_PE 0.9 Ω und R_ISO 0.4 MΩ → zwei Überschreitungen', ausBad.ueber === 2, `ueber=${ausBad.ueber}`);
T('nur erfasste Werte zählen (2 von 4)', ausBad.erfasst === 2);
const ausOhneSk = P.messAuswertung({ rpe: 0.9 }, {});
T('ohne Schutzklasse: Wert erfasst, aber nicht bewertet',
  ausOhneSk.erfasst === 1 && ausOhneSk.ueber === 0 && ausOhneSk.zeilen[0].status === '');
T('hatMesswerte: leeres Objekt = false', P.hatMesswerte({}) === false);
T('hatMesswerte: null = false', P.hatMesswerte(null) === false);
T('hatMesswerte: nur Nullen sind Werte (0 ist kein Leerwert)', P.hatMesswerte({ ib: 0 }) === true);
T('hatMesswerte: leere Strings = false', P.hatMesswerte({ rpe: '', riso: '' }) === false);

// ════════════════════════════════════════════════════════════
console.log('\nA3 · Engine — Ergebnis als Schlüssel, Altbestand lesbar');
// ════════════════════════════════════════════════════════════
T('Enum wird durchgereicht', P.ergebnisId('bestanden') === 'bestanden');
T('Alt-Anzeigetext «✓ Bestanden» → bestanden', P.ergebnisId('✓ Bestanden') === 'bestanden');
T('Alt-Anzeigetext «⚠ Mit Mängeln» → maengel', P.ergebnisId('⚠ Mit Mängeln') === 'maengel');
T('Alt-Anzeigetext «✕ Nicht bestanden» → nicht_bestanden', P.ergebnisId('✕ Nicht bestanden') === 'nicht_bestanden');
T('«Nicht bestanden» vor «bestanden» geprüft (Substring-Falle)',
  P.ergebnisId('Nicht bestanden') === 'nicht_bestanden');
T('unbekannter Text → leer (nichts geraten)', P.ergebnisId('Hä?') === '');
T('ergebnisInfo bleibt ehrlich: null bei unbekannt', P.ergebnisInfo('Hä?') === null);
T('ergebnisAnzeige liefert IMMER ein Objekt', !!P.ergebnisAnzeige('Hä?'));
T('ergebnisAnzeige: unbekannt → neutrale Farbe, kein Absturz',
  P.ergebnisAnzeige('Hä?').farbe === '#64748b');
T('ergebnisAnzeige ohne Wert → «—»', P.ergebnisAnzeige('').label === '—');
T('drei Ergebnisse definiert', P.ERGEBNIS.length === 3);
T('drei Schutzklassen definiert', P.SCHUTZKLASSEN.length === 3);

// ════════════════════════════════════════════════════════════
console.log('\nB · Repo — eine Wahrheit, keine Kopie der Grenzwerte');
// ════════════════════════════════════════════════════════════
const wz = readFileSync(join(ROOT, 'if_werkzeug.html'), 'utf8');
const dash = readFileSync(join(ROOT, 'sys_lieferant_dashboard.html'), 'utf8');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

T('gema_pruefwerte.js existiert', existsSync(join(ROOT, 'gema_pruefwerte.js')));
T('if_werkzeug lädt den geteilten Helfer', wz.includes('src="gema_pruefwerte.js"'));
T('Lieferanten-Dashboard lädt den geteilten Helfer', dash.includes('src="gema_pruefwerte.js"'));
T('Helfer im Service-Worker registriert', sw.includes('/gema_pruefwerte.js'));
// Die Grenzwert-Regeln dürfen NUR im Helfer stehen — eine zweite Kopie
// liefe beim nächsten Normen-Update still auseinander.
T('keine zweite R_PE-Regel in if_werkzeug', !wz.includes('function wzGrenzRpe'));
T('keine zweite R_PE-Regel im Dashboard', !dash.includes('function wzGrenzRpe'));
T('keine zweite Bewertungs-Funktion in if_werkzeug', !wz.includes('function wzMessBewertung'));
T('keine zweite Bewertungs-Funktion im Dashboard', !dash.includes('function wzMessBewertung'));
T('kein Rest-Engine-Block in if_werkzeug', !wz.includes('WZ-PRUEF-ENGINE-START'));

console.log('\nB2 · Repo — Prüfnachweis statt Terminnachweis');
// Ergebnis wird als Schlüssel gespeichert, nicht als Anzeigetext
T('if_werkzeug speichert Ergebnis über wzErgebnisId', wz.includes('wzErgebnisId(document.getElementById(\'prErg\')'));
T('Dashboard speichert Ergebnis über wzErgebnisId', dash.includes("wzErgebnisId(document.getElementById('dwzPbErgebnis')"));
T('kein hartcodierter Emoji-Ergebnistext mehr im Dashboard',
  !dash.includes("erg==='bestanden'?'✓ Bestanden'"));
// Messwerte + Protokoll am Bericht
for (const [datei, txt] of [['if_werkzeug', wz], ['Dashboard', dash]]) {
  T(`${datei}: Messwerte werden am Bericht gespeichert`, txt.includes('messwerte:wzHatMesswerte'));
  T(`${datei}: Grenzwerte werden mitgespeichert (Nachweis bleibt deutbar)`, txt.includes('grenzwerte:wzHatMesswerte'));
  T(`${datei}: Protokoll wird am Bericht gespeichert`, txt.includes('protokoll:prot'));
  T(`${datei}: Protokoll geht zuerst in den Bucket`, txt.includes('GemaStorage.uploadDataUrl'));
  T(`${datei}: nicht ablegbares Protokoll wird gemeldet`, txt.includes('zuGross'));
}
// Typenschild-Angaben am Werkzeug
T('Schutzklasse im Formular', wz.includes('id="f_schutzklasse"'));
T('Leitungslänge im Formular', wz.includes('id="f_leitungLaenge"'));
T('Heizleistung im Formular', wz.includes('id="f_heizleistung"'));
T('Schutzklasse wird gespeichert', wz.includes('schutzklasse:'));
T('leeres Zahlenfeld wird zu null, nicht zu 0', wz.includes('function _wzNumOrNull'));
T('Formular-Reset leert auch die neuen Felder', wz.includes("'f_schutzklasse'") && wz.includes("'f_heizleistung'"));
T('Bearbeiten füllt die neuen Felder wieder', wz.includes("sv('f_schutzklasse'"));
T('Detail-Ansicht zeigt die Typenschild-Angaben', wz.includes('Angaben ab Typenschild'));
T('CSV-Bestandsliste führt die Schutzklasse', wz.includes("'Schutzklasse','Länge Anschlussleitung [m]'"));
T('CSV-Bestandsliste führt die gerechneten Grenzwerte', wz.includes("'Grenzwert R_PE [Ohm]'"));
T('CSV-Berichte führen Messwert UND Grenzwert', wz.includes("'R_PE [Ohm]','Grenzwert R_PE'"));
T('CSV-Berichte führen das Protokoll', wz.includes("'Prüfprotokoll'"));
// PDF: jsPDF-Standardfonts sind latin1 → kein Ω/Emoji
T('PDF nutzt ASCII-Umschrift für Ω', wz.includes("'Ω':'Ohm'"));
T('PDF druckt Ergebnis ohne Emoji', wz.includes('wzErgebnisAnzeige(b.ergebnis).label'));
// Prüfeintrag ist ein Nachweis
T('Prüfeintrag-Löschen fragt nach', wz.includes("title:'Prüfeintrag löschen'"));
T('Prüfeintrag-Löschen hat «Nein» vorausgewählt', /Prüfeintrag löschen[\s\S]{0,400}focusCancel:true/.test(wz));
T('Prüfeintrag-Löschen ist rot markiert', /Prüfeintrag löschen[\s\S]{0,400}danger:true/.test(wz));
T('Prüfeintrag-Löschen landet im Aktivitätenlog', wz.includes("_wzActLog('pruefung','Prüfeintrag gelöscht"));
T('Prüfeintrag-Erfassen landet im Aktivitätenlog', wz.includes("_wzActLog('pruefung','Prüfung erfasst"));
T('Prüfeintrag-Löschen prüft die Berechtigung', /function delPruef[\s\S]{0,200}_wzCanEdit\(\)/.test(wz));
// Dashboard: der externe Prüfer bekommt dieselben Felder
T('Dashboard: Messwert-Block im Prüfbericht-Dialog', dash.includes('_dwzMessBlockHtml'));
T('Dashboard: Live-Ampel für Messwerte', dash.includes('_dwzMessAmpel'));
T('Dashboard: Protokoll-Upload im Dialog', dash.includes('id="dwzPbProt"'));
T('Dashboard: fixLeadingZero ist definiert (war ein toter Aufruf)',
  dash.includes('function fixLeadingZero'));
T('Dashboard: Zahlenfelder nach GEMA-Kanon (kein type=number)',
  !/id="dwzPb(Rpe|Riso|Ipe|Ib)"[^>]*type="number"/.test(dash));

// ════════════════════════════════════════════════════════════
console.log('\nC · Browser — Dialog, Ampel, Speicherung');
// ════════════════════════════════════════════════════════════
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch { /* unten gemeldet */ }
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';

if (!chromium) {
  console.log('  ⚠ übersprungen — playwright-core fehlt (npm i --no-save playwright-core)');
} else if (!existsSync(CHROME)) {
  console.log(`  ⚠ übersprungen — Chromium nicht gefunden unter ${CHROME}`);
} else {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  // Nur die eigene Seite laden — nichts nach draussen. Cloud-Aufrufe werden
  // mit einer LEEREN Antwort bedient statt abgebrochen: ein abgebrochener
  // fetch wirft «Failed to fetch» und das sähe wie ein Seitenfehler aus,
  // obwohl es nur der Netzsperre des Tests geschuldet wäre.
  await ctx.route('**', route => {
    const u = route.request().url();
    if (u.startsWith('file://')) return route.continue();
    // KRITISCH — auf ein LESEN antwortet der Mock mit 503, nicht mit «[]».
    // Eine leere 200er-Antwort gilt als gültiger Cloud-Stand und leert den
    // lokalen Cache («Cloud gewinnt») — der geseedete Bestand wäre weg.
    if (/supabase|\/rest\/v1\/|\/functions\/|\/api\/|\/sb\//.test(u)) {
      return route.fulfill({
        status: route.request().method() === 'GET' ? 503 : 200,
        contentType: 'application/json',
        body: '{}'
      });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push(String(e.message || e)));

  const heute = new Date().toISOString().slice(0, 10);
  const seed = {
    tools: [{
      id: 'wz_test1', name: 'Bohrhammer', cat: 'bohren', orgId: 'org_t', bought: '2024-01-01',
      hasElec: true, elecInterval: 12, lastElec: '2025-01-01', elecHistory: [],
      schutzklasse: 'I', leitungLaengeM: 3, heizleistungKw: null, berichte: []
    }, {
      id: 'wz_test2', name: 'Heizlüfter', cat: 'sonstiges', orgId: 'org_t', bought: '2024-01-01',
      hasElec: true, elecInterval: 12, elecHistory: [],
      schutzklasse: 'I', leitungLaengeM: 20, heizleistungKw: 9, berichte: []
    }]
  };
  await page.addInitScript(([s, d]) => {
    const u = { id: 'u_mag', name: 'Test Magaziner', username: 'mag@t.ch', orgId: 'org_t', active: true, roleIds: ['role_magaziner'] };
    localStorage.setItem('gema_users_v1', JSON.stringify([u]));
    localStorage.setItem('gema_orgs_v1', JSON.stringify([{ id: 'org_t', name: 'Testfirma', admins: [] }]));
    localStorage.setItem('gema_session_v1', JSON.stringify({
      userId: 'u_mag', token: 'eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJ1X21hZyJ9.x',
      tokenExp: Date.now() + 864e5, expires: Date.now() + 864e5, remember: true
    }));
    // NUR beim ersten Laden seeden. addInitScript läuft bei JEDEM reload —
    // ein unbedingtes setItem würde die Vorbereitung des Tests (Schutzklasse
    // leeren, Prüfeintrag anlegen) nach dem Reload stillschweigend zurücksetzen.
    if (!localStorage.getItem('gema_werkzeug')) {
      localStorage.setItem('gema_werkzeug', JSON.stringify(s.tools));
    }
    localStorage.setItem('gema_coachmarks_done_if_werkzeug', '1');
    localStorage.setItem('gema_native_view_v1', 'klassisch');
    void d;
  }, [seed, heute]);

  await page.goto('file://' + join(ROOT, 'if_werkzeug.html'));
  await page.waitForTimeout(1500);

  // — Engine im Browser identisch zur Node-Seite —
  const bGrenz = await page.evaluate(() => ({
    a: wzGrenzwerte({ schutzklasse: 'I', leitungLaengeM: 3 }).rpe,
    b: wzGrenzwerte({ schutzklasse: 'I', leitungLaengeM: 20, heizleistungKw: 9 }),
    c: typeof wzErgebnisAnzeige === 'function'
  }));
  T('Browser: Helfer global verfügbar', bGrenz.c === true);
  T('Browser: R_PE 3 m = 0.30 Ω (wie Node)', near(bGrenz.a, 0.30));
  // 20 m = 5 m + genau 2 × 7.5 m ⇒ 0.30 + 0.20 = 0.50 Ω (nicht 0.60).
  T('Browser: Heizlüfter 20 m → R_PE 0.50 Ω', near(bGrenz.b.rpe, 0.50), JSON.stringify(bGrenz.b));
  T('Browser: Heizlüfter 9 kW → R_ISO 0.30 MΩ', near(bGrenz.b.riso, 0.30));
  T('Browser: Heizlüfter 9 kW → I_PE 9 mA', near(bGrenz.b.ipe, 9));

  // — Prüfbericht-Dialog: Grenzwerte sichtbar, Messfelder da —
  await page.evaluate(() => openPruefbericht('wz_test1'));
  await page.waitForTimeout(400);
  const dlg = await page.evaluate(() => {
    const h = document.body.innerHTML;
    return {
      rpe: !!document.getElementById('prRpe'),
      riso: !!document.getElementById('prRiso'),
      ipe: !!document.getElementById('prIpe'),
      ib: !!document.getElementById('prIb'),
      prot: !!document.getElementById('prProtokoll'),
      grenzChip: h.includes('0.3') && h.includes('Ω'),
      typNumber: !!document.querySelector('#prRpe[type="number"]')
    };
  });
  T('Dialog: R_PE-Feld vorhanden (SK I)', dlg.rpe);
  T('Dialog: R_ISO-Feld vorhanden', dlg.riso);
  T('Dialog: I_PE-Feld vorhanden', dlg.ipe);
  T('Dialog: I_B-Feld vorhanden', dlg.ib);
  T('Dialog: Protokoll-Upload vorhanden', dlg.prot);
  T('Dialog: Grenzwert wird angezeigt', dlg.grenzChip);
  T('Dialog: kein type=number (GEMA-Kanon)', !dlg.typNumber);

  // — Live-Ampel: guter Wert grün, schlechter rot —
  await page.fill('#prRpe', '0.15');
  await page.waitForTimeout(250);
  const ampelOk = await page.evaluate(() => (document.getElementById('prMessAmpel') || {}).innerHTML || '');
  T('Ampel: guter Wert wird grün markiert', /#16a34a/.test(ampelOk) && /✓/.test(ampelOk), ampelOk.slice(0, 120));
  await page.fill('#prRpe', '0.85');
  await page.waitForTimeout(250);
  const ampelBad = await page.evaluate(() => (document.getElementById('prMessAmpel') || {}).innerHTML || '');
  T('Ampel: überschrittener Wert wird rot markiert',
    /#dc2626/.test(ampelBad) && /überschritten/i.test(ampelBad), ampelBad.slice(0, 120));
  T('Ampel sagt NICHT ab — Speichern bleibt möglich',
    await page.evaluate(() => { const b = document.getElementById('prSaveBtn'); return !!b && !b.disabled; }));

  // — Speichern: Enum + Messwerte + Grenzwerte am Bericht —
  await page.fill('#prRiso', '48');
  await page.fill('#prIb', '0.03');
  await page.selectOption('#prErg', 'maengel');
  await page.fill('#prBemerk', 'Schutzleiterwiderstand grenzwertig.');
  await page.evaluate(() => _wzSavePruefbericht('wz_test1'));
  await page.waitForTimeout(900);
  const ber = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('gema_werkzeug') || '[]').find(x => x.id === 'wz_test1');
    const b = (t.berichte || []).filter(x => x.typ === 'pruefbericht').pop();
    return b ? {
      erg: b.ergebnis, m: b.messwerte, g: b.grenzwerte,
      lastElec: t.lastElec, hatProt: 'protokoll' in b
    } : null;
  });
  T('Bericht wurde gespeichert', !!ber);
  T('Ergebnis als Schlüssel gespeichert, nicht als Emoji-Text', ber && ber.erg === 'maengel');
  T('Messwerte am Bericht', ber && ber.m && near(ber.m.rpe, 0.85) && near(ber.m.riso, 48));
  T('Grenzwerte mitgespeichert (Nachweis bleibt deutbar)', ber && ber.g && near(ber.g.rpe, 0.30));
  T('Grenzwerte tragen die Schutzklasse', ber && ber.g && ber.g.schutzklasse === 'I');
  T('Prüfdatum wurde nachgeführt', ber && ber.lastElec === heute);
  T('Protokoll-Feld existiert am Bericht (hier leer)', ber && ber.hatProt);

  // — Anzeige: Messwerte erscheinen im Bericht-Verlauf —
  await page.evaluate(() => openBerichte('wz_test1'));
  await page.waitForTimeout(400);
  const anz = await page.evaluate(() => document.body.innerText);
  T('Verlauf zeigt das Ergebnis im Klartext', /Mit Mängeln/.test(anz));
  T('Verlauf zeigt den Messwert', /0\.85/.test(anz));
  T('Verlauf zeigt den Grenzwert dazu', /0\.3/.test(anz));

  // — Ohne Schutzklasse: erfassen ja, bewerten nein —
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('gema_werkzeug'));
    all.find(t => t.id === 'wz_test2').schutzklasse = '';
    localStorage.setItem('gema_werkzeug', JSON.stringify(all));
  });
  await page.reload();
  await page.waitForTimeout(1300);
  await page.evaluate(() => openPruefbericht('wz_test2'));
  await page.waitForTimeout(400);
  const ohneSk = await page.evaluate(() => document.body.innerText);
  T('ohne Schutzklasse wird der fehlende Grenzwert BENANNT',
    /nicht gegen Grenzwerte|keine Schutzklasse/i.test(ohneSk), ohneSk.slice(0, 200));

  // — Prüfeintrag löschen: Bestätigung + Log —
  await page.evaluate(() => { if (typeof _wzCloseModal === 'function') _wzCloseModal(); });
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('gema_werkzeug'));
    const t = all.find(x => x.id === 'wz_test1');
    t.elecHistory = [{ date: '2025-01-01', pruefer: 'Muster AG', note: 'i.O.' }];
    localStorage.setItem('gema_werkzeug', JSON.stringify(all));
  });
  await page.reload();
  await page.waitForTimeout(1300);
  await page.evaluate(() => { window.__logs = []; const o = GemaActivityLog.log; GemaActivityLog.log = function (e) { window.__logs.push(e); return o.apply(this, arguments); }; });
  await page.evaluate(() => openPruef('wz_test1'));
  await page.waitForTimeout(300);
  await page.evaluate(() => delPruef(0));
  await page.waitForTimeout(400);
  const conf = await page.evaluate(() => {
    const bg = document.querySelector('.gema-dlg-bg');
    return { offen: !!bg, txt: bg ? bg.innerText : '' };
  });
  T('Löschen öffnet eine Bestätigung', conf.offen);
  T('Bestätigung nennt den Prüfnachweis', /Prüfnachweis/i.test(conf.txt), conf.txt.slice(0, 160));
  T('Bestätigung kündigt den Log-Eintrag an', /Aktivitätenlog/i.test(conf.txt));
  const nochDa = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('gema_werkzeug')).find(x => x.id === 'wz_test1');
    return (t.elecHistory || []).length;
  });
  T('vor dem Bestätigen ist noch nichts gelöscht', nochDa === 1);
  // Jetzt bestätigen
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.gema-dlg-bg button')].find(x => /Löschen/i.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  const nachher = await page.evaluate(() => ({
    n: (JSON.parse(localStorage.getItem('gema_werkzeug')).find(x => x.id === 'wz_test1').elecHistory || []).length,
    logs: (window.__logs || []).map(l => l.beschreibung || '')
  }));
  T('nach dem Bestätigen ist der Eintrag weg', nachher.n === 0);
  T('das Löschen steht im Aktivitätenlog',
    nachher.logs.some(l => /Prüfeintrag gelöscht/.test(l)), JSON.stringify(nachher.logs));

  T('keine Seitenfehler', fehler.length === 0, fehler.join(' | '));
  await browser.close();
}

// ════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(52)}`);
console.log(`  ${ok} bestanden · ${fail} fehlgeschlagen`);
console.log('═'.repeat(52) + '\n');
process.exit(fail ? 1 : 0);
