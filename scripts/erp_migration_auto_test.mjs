// Drift-Guard: ERP-Migration erkennt die Struktur der Export-Dateien selbst
//
// Anforderung (Robin, 13.08.2026): «ich habe zu jedem Thema: Aufträge,
// Adressen, Objekte, Offerten etc. eine Excel gesendet, wenn ich Daten
// migrieren will, sind die Daten genau in einer solchen Excel, heisst ich muss
// nichts mehr zuweisen wie ich es jetzt machen muss, es soll diese Struktur
// oder das Muster der Excel so übernehmen.»
//
// Teil A (reines Node): die Erkennungs-Engine in gema_erp_import.js —
//   erkenneSektion / mappingGuete / IMPORT_REIHENFOLGE / sektionRang.
//   Die Kopfzeilen werden aus den Alias-Listen der Sektionen REKONSTRUIERT
//   (der erste Alias je Feld ist die echte Export-Spalte) — die Erkennung wird
//   damit gegen genau das geprüft, was sie erkennen soll, ohne die
//   Kundendateien im Repo zu haben.
// Teil B (Chromium): der ganze Weg im echten Modul — 5 Dateien auf einmal
//   ablegen, Abschnitt + Spalten automatisch, Reihenfolge richtig, EIN Klick
//   importiert alles und die Belege hängen danach aneinander.
//
// Aufruf: node scripts/erp_migration_auto_test.mjs
//         (Teil B braucht playwright-core + Chromium; fehlt beides, wird er
//          mit klarem Hinweis übersprungen — nie still.)
import fs from 'fs';
import path from 'path';
import { startServer, newPage, seed, BASE, ROOT } from './rolematrix_harness.mjs';

let n = 0, fail = 0;
const t = (name, cond) => { n++; if (cond) console.log('  ✓ ' + name); else { fail++; console.error('  ✗ FAIL: ' + name); } };
const eq = (name, a, b) => t(name + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)),
  JSON.stringify(a) === JSON.stringify(b));

// ── Engine ohne Browser laden ───────────────────────────────────────────
function ladeModul(datei, win) {
  const src = fs.readFileSync(path.join(ROOT, datei), 'utf8');
  new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(
    win, { getItem: () => null, setItem: () => {} }, undefined, undefined, undefined, undefined);
  return win;
}
const win = {};
ladeModul('gema_erp_adressen.js', win);
ladeModul('gema_erp_import.js', win);
const I = win.GemaErpImport;

// Kopfzeile einer Export-Datei = der ERSTE Alias je Feld.
const kopfVon = sekId => I.sektion(sekId).felder.map(f => f.alias[0]);

console.log('\n═══ A1 — jede Export-Datei wird ihrem Abschnitt zugeordnet ═══');
const SEK = ['objekte', 'adressen', 'offerten', 'auftraege', 'rechnungen'];
for (const id of SEK) {
  const r = I.erkenneSektion(kopfVon(id));
  const sek = I.sektion(id);
  t(sek.label + ': Abschnitt erkannt' + (r.beste ? '' : ' (nichts erkannt)'), !!r.beste && r.beste.sekId === id);
  t(sek.label + ': eindeutig (keine Rückfrage nötig)', !!r.sicher);
  t(sek.label + ': alle Pflichtfelder haben eine Spalte', !!(r.beste && r.beste.pflichtOk));
  const g = I.mappingGuete(r.beste.mapping, id);
  t(sek.label + ': alle ' + g.gesamt + ' Felder zugeordnet (' + g.erkannt + ')', g.erkannt === g.gesamt);
  // Abstand zum zweitbesten — daran hängt «sicher»
  const zweit = r.liste.filter(x => x.sekId !== id).sort((a, b) => b.punkte - a.punkte)[0];
  t(sek.label + ': deutlicher Abstand zum zweitbesten (' + r.beste.punkte + ' vs. ' + (zweit ? zweit.punkte : 0) + ')',
    !zweit || r.beste.punkte >= zweit.punkte + 3);
}

console.log('\n═══ A2 — was NICHT erkannt wird, wird auch nicht geraten ═══');
const müll = I.erkenneSektion(['foo', 'bar', 'baz', 'qux']);
t('Fremde Kopfzeile: kein Abschnitt mit Pflichtfeldern', !müll.beste || !müll.beste.pflichtOk);
t('Fremde Kopfzeile: nie «sicher»', !müll.sicher);
const leer = I.erkenneSektion([]);
t('Leere Kopfzeile: nichts erkannt', !leer.beste || !leer.beste.pflichtOk);
t('Leere Kopfzeile: nie «sicher»', !leer.sicher);

// Pflichtfeld fehlt → die Datei darf NICHT durchrutschen
const ohnePflicht = kopfVon('rechnungen').filter(h => {
  const f = I.sektion('rechnungen').felder.find(x => x.alias[0] === h);
  return !(f && f.pflicht);
});
const rOhne = I.erkenneSektion(ohnePflicht);
t('Rechnungen ohne Pflichtspalte: pflichtOk = false',
  !!rOhne.beste && rOhne.beste.sekId === 'rechnungen' && !rOhne.beste.pflichtOk);
t('Rechnungen ohne Pflichtspalte: nicht «sicher» (Import bleibt zu)', !rOhne.sicher);
t('… und die fehlende Spalte wird BENANNT', !!(rOhne.beste.fehlendePflicht || []).length);

console.log('\n═══ A3 — Import-Reihenfolge (jeder Abschnitt hängt am vorherigen) ═══');
eq('Reihenfolge Objekte → Adressen → Offerten → Aufträge → Rechnungen',
  I.IMPORT_REIHENFOLGE, ['objekte', 'adressen', 'offerten', 'auftraege', 'rechnungen']);
const gemischt = ['rechnungen', 'objekte', 'auftraege', 'adressen', 'offerten'];
eq('sektionRang sortiert eine gemischte Ablage richtig',
  gemischt.slice().sort((a, b) => I.sektionRang(a) - I.sektionRang(b)), I.IMPORT_REIHENFOLGE);
t('unbekannter Abschnitt landet hinten', I.sektionRang('irgendwas') > I.sektionRang('rechnungen'));

console.log('\n═══ A4 — mappingGuete zählt ehrlich ═══');
const gVoll = I.mappingGuete(I.erkenneMapping(kopfVon('objekte'), 'objekte'), 'objekte');
t('volle Zuordnung: pflichtOk', gVoll.pflichtOk);
eq('volle Zuordnung: erkannt = gesamt', gVoll.erkannt, gVoll.gesamt);
const gLeer = I.mappingGuete({}, 'objekte');
eq('leere Zuordnung: 0 erkannt', gLeer.erkannt, 0);
t('leere Zuordnung: pflichtOk = false', !gLeer.pflichtOk);

// ── Teil B: der ganze Weg im echten Modul ───────────────────────────────
// Testdateien: CSV mit Semikolon (GEMA-Kanon) und exakt den Export-Kopfzeilen.
function csv(sekId, zeilen) {
  const kopf = kopfVon(sekId);
  const raus = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const zeile = obj => kopf.map((h, i) => {
    const f = I.sektion(sekId).felder[i];
    return raus(obj[f.id] == null ? '' : obj[f.id]);
  }).join(';');
  return kopf.join(';') + '\n' + zeilen.map(zeile).join('\n') + '\n';
}
const TMP = path.join(ROOT, 'scripts', '.tmp_mig');
try { fs.mkdirSync(TMP); } catch (e) {}
const D = {
  objekte: csv('objekte', [{ extId: '4984', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen' }]),
  adressen: csv('adressen', [{ nr: '7330', firma: 'Immobilien Basel-Stadt', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen' }]),
  offerten: csv('offerten', [{
    extId: 'O1', nr: '5001', datum: '01.02.2026', titel: 'Sanierung Bad',
    status: 'Zuschlag', nettoBetrag: '1000.00', mwstBetrag: '81.00', bruttoBetrag: '1081.00',
    kundeName: 'Immobilien Basel-Stadt', kundeNr: '7330', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen'
  }]),
  auftraege: csv('auftraege', [{
    extId: 'A1', nr: '9554.00', offertNr: '5001', betrifft: 'Sanierung Bad',
    status: 'In Arbeit', kundeName: 'Immobilien Basel-Stadt', kundeNr: '7330',
    strasse: 'Hellring 7', plz: '4125', ort: 'Riehen'
  }]),
  rechnungen: csv('rechnungen', [{
    extId: 'R1', nr: '7001', auftragNr: '9554.00', datum: '01.03.2026',
    art: 'Schlussrechnung', status: 'Versandt', nettoBetrag: '1000.00',
    mwstBetrag: '81.00', bruttoBetrag: '1081.00', kundeName: 'Immobilien Basel-Stadt', kundeNr: '7330'
  }]),
  fremd: 'foo;bar;baz\n1;2;3\n'
};
// Bewusst in FALSCHER Reihenfolge abgelegt — GEMA muss sie selbst sortieren.
const DATEIEN = ['rechnungen', 'fremd', 'objekte', 'auftraege', 'adressen', 'offerten']
  .map(k => { const p = path.join(TMP, k + '.csv'); fs.writeFileSync(p, D[k], 'utf8'); return p; });

function aufraeumen() { try { DATEIEN.forEach(p => fs.unlinkSync(p)); fs.rmdirSync(TMP); } catch (e) {} }

let pw = null;
try { pw = (await import('playwright-core')).chromium; } catch (e) {}
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/chromium']
  .filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!pw || !CHROME) {
  console.log('\n⏭  Teil B ÜBERSPRUNGEN — playwright-core / Chromium fehlt.');
  console.log('   Der ganze Weg im Modul (Ablegen → Erkennen → Importieren) wurde NICHT geprüft.');
  aufraeumen();
  console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' fehlgeschlagen' : '✓ alles grün — ' + n + ' Checks bestanden'));
  process.exit(fail ? 1 : 0);
}

const server = await startServer();
const browser = await pw.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const { ctx, page } = await newPage(browser, seed(['role_planer']));
const fehler = [];
page.on('pageerror', e => fehler.push(String(e && e.message || e)));
await page.goto(BASE + '/pm_erp.html');
await page.waitForFunction(() => document.getElementById('mtabs') && document.getElementById('mtabs').children.length, { timeout: 15000 });
await page.click('#mtabs .mtab:has-text("Migration")');

console.log('\n═══ B1 — Ablage-Feld statt Abschnitt-für-Abschnitt ═══');
t('Ablage-Feld für die Export-Dateien vorhanden', await page.isVisible('#migDrop'));
t('mehrere Dateien auf einmal', await page.getAttribute('#migAutoFile', 'multiple') !== null);
t('Erklärung nennt die automatische Erkennung', /erkennt selbst/i.test(await page.textContent('#migDrop')));
t('der Weg über die Abschnitts-Karten bleibt offen', (await page.$$('.mig-card')).length === 5);

console.log('\n═══ B2 — 6 Dateien auf einmal, in falscher Reihenfolge abgelegt ═══');
await page.setInputFiles('#migAutoFile', DATEIEN);
await page.waitForFunction(() => window._migAuto && window._migAuto.every(d => d.status !== 'liest'), { timeout: 20000 });
const erk = await page.evaluate(() => window._migAuto.map(d => ({ name: d.name, sek: d.sekId || '', st: d.status, z: (d.rows || []).length })));
eq('Reihenfolge automatisch hergestellt (Objekt zuerst, Rechnung zuletzt)',
  erk.filter(d => d.sek).map(d => d.sek), ['objekte', 'adressen', 'offerten', 'auftraege', 'rechnungen']);
t('alle 5 Export-Dateien erkannt', erk.filter(d => d.st === 'ok').length === 5);
t('jede Datei hat ihre Datenzeile', erk.filter(d => d.sek).every(d => d.z === 1));
const fremd = erk.find(d => /fremd/.test(d.name));
eq('fremde Datei: nicht erkannt statt falsch zugeordnet', fremd.st, 'unbekannt');
t('fremde Datei blockiert die anderen nicht', await page.isVisible('#migAutoListe button:has-text("übernehmen")'));
const liste = await page.textContent('#migAutoListe');
t('Auflistung nennt die erkannten Abschnitte', /Offerten/.test(liste) && /Rechnungen/.test(liste));
t('Auflistung nennt die Zahl automatisch zugeordneter Felder', /Feldern automatisch zugeordnet/.test(liste));
t('Auflistung erklärt die Reihenfolge', /so bauen die Belege aufeinander auf/.test(liste));
t('nicht erkannte Datei sagt, was zu tun ist', /nicht erkannt/i.test(liste) && /einzeln importieren/i.test(liste));
t('KEIN Zuordnungs-Schritt nötig — der Assistent ist zu', !(await page.isVisible('#migModal.open')));

console.log('\n═══ B3 — «Spalten prüfen» bleibt erreichbar ═══');
await page.click('#migAutoListe a:has-text("Spalten prüfen")');
await page.waitForSelector('#migModal.open');
const wiz = await page.evaluate(() => ({ schritt: window._mig.schritt, sek: window._mig.sekId, anz: Object.keys(window._mig.mapping).length, idx: window._mig.autoIdx }));
eq('öffnet direkt bei der Zuordnung (Schritt 2)', wiz.schritt, 2);
eq('mit dem erkannten Abschnitt', wiz.sek, 'objekte');
t('die erkannte Zuordnung ist bereits gesetzt (' + wiz.anz + ' Spalten)', wiz.anz >= 10);
t('der Assistent weiss, zu welcher abgelegten Datei er gehört', wiz.idx === 0);
// Eine Zuordnung von Hand ändern → sie muss den Auto-Lauf erreichen
await page.evaluate(() => { delete window._mig.mapping.ort; });
await page.click('#migModal .modal-x');
const nachPruefung = await page.evaluate(() => ({ hatOrt: window._migAuto[0].mapping.ort != null, st: window._migAuto[0].status }));
t('geänderte Zuordnung wird übernommen (Kontrolle ist nicht wirkungslos)', !nachPruefung.hatOrt);
eq('Datei gilt danach als geprüft', nachPruefung.st, 'geprueft');
await page.evaluate(() => { window._migAuto[0].mapping.ort = 4; window._migAutoRender(); });

console.log('\n═══ B4 — EIN Klick übernimmt alles ═══');
await page.click('#migAutoListe button:has-text("übernehmen")');
await page.waitForSelector('.gema-dlg-bg', { timeout: 60000 });
const bericht = (await page.textContent('.gema-dlg-bg')).replace(/\s+/g, ' ');
t('Abschlussmeldung erscheint', /Migration abgeschlossen/.test(bericht));
['Objekte', 'Adressen', 'Offerten', 'Aufträge', 'Rechnungen'].forEach(x =>
  t('Bericht nennt ' + x, bericht.indexOf(x) >= 0));
t('Bericht meldet keine Fehlerzeilen', !/Zeilen mit Fehler/.test(bericht));
await page.click('.gema-dlg-bg [data-act="ok"], .gema-dlg-bg button');

const erg = await page.evaluate(() => {
  const pool = JSON.parse(localStorage.getItem('gema_erp_dok_pool_v1') || '[]');
  const f = t => pool.filter(d => d.typ === t);
  const of = f('offerte')[0], au = f('auftrag')[0], re = f('rechnung')[0];
  return {
    of: of && { nr: of.nr, auftragId: (of.verknuepfung || {}).auftragId, obj: !!of.objektId, pos: (of.positionen || []).length },
    au: au && { nr: au.nr, id: au.id, offerteId: (au.verknuepfung || {}).offerteId, pos: (au.positionen || []).length },
    re: re && { nr: re.nr, auftragId: (re.verknuepfung || {}).auftragId, offerteId: (re.verknuepfung || {}).offerteId, status: re.status },
    adr: (window.GemaAdressen.list() || []).length,
    objekte: (GemaObjekte.getAllUnfiltered ? GemaObjekte.getAllUnfiltered() : GemaObjekte.getAll())
      .filter(o => o.quelle && o.quelle.typ === 'import').length
  };
});
t('Objekt importiert', erg.objekte >= 1);
t('Adresse importiert', erg.adr >= 1);
t('Offerte importiert', !!erg.of && erg.of.nr === '5001');
t('Offerte mit dem Objekt verknüpft', !!(erg.of && erg.of.obj));
t('Offerte hat die Sammelposition', !!(erg.of && erg.of.pos === 1));
t('Auftrag importiert', !!erg.au && erg.au.nr === '9554.00');
t('Auftrag hängt an der Offerte', !!(erg.au && erg.au.offerteId));
t('Offerte kennt den Auftrag (Kette in beide Richtungen)', !!(erg.of && erg.of.auftragId === erg.au.id));
t('Positionen aus der Offerte übernommen (Option greift)', !!(erg.au && erg.au.pos >= 1));
t('Rechnung importiert', !!erg.re && erg.re.nr === '7001');
t('Rechnung hängt am Auftrag', !!(erg.re && erg.re.auftragId === erg.au.id));
t('Rechnung erbt die Offerte über den Auftrag', !!(erg.re && erg.re.offerteId));
eq('Rechnung entsteht als «gestellt» (Export kennt keine Zahlungen)', erg.re && erg.re.status, 'gestellt');

const nachher = await page.evaluate(() => (window._migAuto || []).map(d => d.status));
t('übernommene Dateien sind als erledigt markiert (kein Doppel-Import)',
  nachher.filter(s => s === 'fertig').length === 5);

console.log('\n═══ B5 — keine Fehler auf der Seite ═══');
eq('keine JS-Fehler beim ganzen Ablauf', fehler, []);

await ctx.close(); await browser.close(); await server.close(); aufraeumen();
console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' fehlgeschlagen' : '✓ alles grün — ' + n + ' Checks bestanden'));
process.exit(fail ? 1 : 0);
