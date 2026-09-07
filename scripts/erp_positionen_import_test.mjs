// Drift-Guard — ERP-Migration, nachgezogene Abschnitte
//
// Geprüft werden die fünf Abschnitte, die den Kopf-Import ergänzen:
// Positionen · Zahlungen · Kreditoren · Artikelstamm · Zahlungsbedingungen.
//
// Der Schwerpunkt liegt auf den Zuordnungen, die am Altbestand GEMESSEN und
// nicht geraten wurden (postyp → Positionsart, module_id → Belegart) und auf
// den drei Fallen, die beim Import echten Schaden anrichten würden:
//   1. eine führende Null im Zahlbed-Kürzel («00» = 60 Tage, nicht «leer»),
//   2. krumme FLOAT-Prozente (3 % steht als 2.9999999329447746),
//   3. ein echtes Leistungsverzeichnis, das die Positionen überschreiben würden.
//
// Aufruf:  node scripts/erp_positionen_import_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  t(name + (ok ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)), ok);
}

function ladeModul(datei, win) {
  const src = fs.readFileSync(path.join(ROOT, datei), 'utf8');
  new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(
    win, { getItem: () => null, setItem: () => {} }, undefined, undefined, undefined, undefined
  );
  return win;
}
const win = {};
ladeModul('gema_erp_adressen.js', win);
ladeModul('gema_erp_import.js', win);
const I = win.GemaErpImport;

// Hilfsmittel: eine Zeile über das ECHTE Mapping normalisieren, damit auch die
// Spaltenerkennung mitgeprüft wird und nicht nur die Normalisierung.
function zeile(sekId, kopf, werte) {
  const map = I.erkenneMapping(kopf, sekId);
  return { map, ziel: I.normalisiereZeile(werte, map, sekId) };
}

console.log('\n═══ A1 — postyp → Positionsart (am Bestand gemessen) ═══');
// Die Zuordnung stammt aus der Auswertung von 632 008 Positionen: je Typ wurde
// gezählt, ob Menge, Preis, Einheit und NPK-Bezug vorhanden sind.
eq('9 = NPK-Gliederung → Titel', I.posArt('9', {}).art, 'titel');
eq('10 = Kapitel → Titel', I.posArt('10', {}).art, 'titel');
eq('20 = Beschreibungszeile → Text', I.posArt('20', {}).art, 'text');
eq('19 = Text ohne NPK → Text', I.posArt('19', {}).art, 'text');
eq('11 = normale Leistungsposition → frei', I.posArt('11', {}).art, 'frei');
eq('21 = NPK-Untervariante → frei', I.posArt('21', {}).art, 'frei');
eq('26 = eigener Artikel → frei', I.posArt('26', {}).art, 'frei');
eq('27 = Preis ohne Menge → Zuschlag', I.posArt('27', {}).art, 'zuschlag');
t('bekannte Typen sind als erkannt markiert', I.posArt('11', {}).erkannt === true);

// GEGENPROBE: die naive Umsetzung («alles ist eine Position») wäre falsch.
// Ohne die gemessene Tabelle müsste dieser Check rot werden.
t('GEGENPROBE — nicht alles wird zu «frei»',
  ['9', '10', '19', '20', '27'].every(p => I.POSTYP_ART[p] !== 'frei'));
t('GEGENPROBE — die Tabelle deckt die häufigen Typen ab (99,8 % des Bestands)',
  ['9', '10', '11', '12', '13', '15', '16', '19', '20', '21', '22', '25', '26', '27']
    .every(p => !!I.POSTYP_ART[p]));

console.log('\n═══ A2 — unbekannter postyp wird abgeleitet, nicht geraten ═══');
eq('18 ohne Preis und Menge → Text', I.posArt('18', { ep: null, menge: null }).art, 'text');
eq('18 mit Preis → Position', I.posArt('18', { ep: 12.5, menge: 1 }).art, 'frei');
t('abgeleitete Typen sind NICHT als erkannt markiert', I.posArt('18', {}).erkannt === false);
t('… und die Vorschau meldet das', I.pruefe(
  { belegNr: '5', belegTypRoh: '2', belegTypErkannt: true, bez: 'x', art: 'text',
    artRoh: '18', artErkannt: false }, 'positionen'
).some(h => h.typ === 'warn' && /unbekannt/.test(h.text)));

console.log('\n═══ A3 — module_id → Belegart (über die Belegsummen nachgewiesen) ═══');
eq('2 = Offerte', I.belegTyp('2').typ, 'offerte');
eq('4 = Rechnung', I.belegTyp('4').typ, 'rechnung');
t('unbekannter Wert wird NICHT geraten', I.belegTyp('99').typ === '');
t('… und blockiert die Zeile', I.pruefe(
  { belegNr: '5', belegTypRoh: '99', belegTypErkannt: false, bez: 'x', art: 'frei', artErkannt: true },
  'positionen').some(h => h.typ === 'fehler'));
eq('Klartext geht auch', I.belegTyp('Rechnung').typ, 'rechnung');

console.log('\n═══ A4 — Positionen: Normalisierung über das echte Mapping ═══');
const kopfPos = ['module_id', 'nr', 'postyp', 'SPos', 'text', 'qty', 'unit', 'price',
                 'total', 'SChapter', 'leitfaden_zeit', 'ansatz', 'verschnitt', 'einkaufs_rabatt'];
const p1 = zeile('positionen', kopfPos,
  ['2', '1042', '11', '426.101', 'Rohr DN 25', '12.5', 'm', '18.40', '230', '426',
   '0.35', '78', '2.9999999329447746', '1.9999999552965164']);
eq('Belegart erkannt', p1.ziel.belegTyp, 'offerte');
eq('Beleg-Nr. erkannt', p1.ziel.belegNr, '1042');
eq('Positionsart aus postyp', p1.ziel.art, 'frei');
eq('Menge', p1.ziel.menge, 12.5);
eq('EP', p1.ziel.ep, 18.4);
eq('NPK-Kapitel', p1.ziel.npk.kapitel, '426');
eq('krummes FLOAT-Prozent wird gerundet (Verschnitt)', p1.ziel.kalk.verschnitt, 3);
eq('krummes FLOAT-Prozent wird gerundet (Einkaufsrabatt)', p1.ziel.kalk.einkRabatt, 2);
eq('Leitfadenzeit bleibt roh', p1.ziel.kalk.leitfadenZeit, 0.35);

// EP fehlt, Total und Menge sind da → herleiten statt 0 anlegen.
const p2 = zeile('positionen', ['module_id', 'nr', 'postyp', 'text', 'qty', 'total'],
  ['4', '77', '11', 'Montage', '4', '100']);
eq('fehlender EP wird aus Total ÷ Menge hergeleitet', p2.ziel.ep, 25);

console.log('\n═══ A5 — Kalkulation verschiebt KEINE Preise ═══');
const rec = I.positionRecord(p1.ziel);
eq('EP steht unverändert in der Position', rec.ep, 18.4);
t('Kalkulation liegt unter importKalk', !!rec.importKalk && rec.importKalk.verschnitt === 3);
t('… und NICHT in einem Rechenfeld von GEMA',
  rec.verschnitt === undefined && rec.leitfadenZeit === undefined &&
  rec.ansatz === undefined && rec.einkaufsrabattPct === undefined);
t('NPK-Herkunft bleibt als Vermerk erhalten', !!rec.importNpk && rec.importNpk.kapitel === '426');
const recTitel = I.positionRecord({ art: 'titel', bez: 'Sanitär', npk: {}, kalk: {} });
t('ein Titel bekommt weder Menge noch Preis',
  recTitel.menge === undefined && recTitel.ep === undefined);
t('leere Kalkulationswerte werden nicht als 0 geschrieben',
  I.positionRecord({ art: 'frei', bez: 'x', npk: {}, kalk: {} }).importKalk === undefined);

console.log('\n═══ A6 — Sammelposition erkennen (sonst überschreiben wir echte LV) ═══');
t('frisch importierte Sammelposition (Kennzeichen)', I.istSammelposition(
  { positionen: [{ importSammel: true, bez: 'egal' }] }));
t('Sammelposition aus einem früheren Lauf (Text + importSumme)', I.istSammelposition(
  { importSumme: { netto: 100 }, positionen: [{ bez: 'Übernahme aus dem Altsystem — Offerte 5' }] }));
t('ECHTES Leistungsverzeichnis ist keine Sammelposition', !I.istSammelposition(
  { positionen: [{ bez: 'Rohr DN 25' }, { bez: 'Montage' }] }));
t('eine einzelne, von Hand erfasste Position auch nicht', !I.istSammelposition(
  { positionen: [{ bez: 'Rohr DN 25' }] }));
t('leerer Beleg ist keine Sammelposition', !I.istSammelposition({ positionen: [] }));

console.log('\n═══ A7 — Zahlungsbedingungen: die führende Null überlebt ═══');
const kopfZb = ['shortcut', 'description', 'days_netto', 'days1', 'skonto1'];
const zb00 = zeile('zahlbed', kopfZb, ['00', '60 Tage netto', '60', '0', '0']);
eq('Kürzel «00» bleibt ein String', zb00.ziel.kuerzel, '00');
eq('… mit 60 Tagen', zb00.ziel.tage, 60);
const zb08 = zeile('zahlbed', kopfZb, ['08', '14 T 3%, 30 T netto', '30', '14', '2.9999999329447746']);
eq('Skonto wird auf 3 % gerundet', zb08.ziel.skontoPct, 3);

I.zahlbedTageSetzen({ '00': 60, '01': 30, '12': 14 });
eq('fristTage findet «00» → 60 Tage', I.fristTage('00', 30), 60);
eq('fristTage findet «12» → 14 Tage', I.fristTage('12', 30), 14);
eq('unbekanntes Kürzel fällt auf den Standard', I.fristTage('99', 30), 30);
// GEGENPROBE: würde das Kürzel über parseInt aufgelöst, ergäbe «00» die Zahl 0
// und fiele auf den Standard zurück — die Rechnung wäre 30 statt 60 Tage fällig.
t('GEGENPROBE — «00» liefert NICHT den Standard', I.fristTage('00', 30) !== 30);
// Excel frisst die führende Null: das muss die Vorschau melden.
t('einstelliges Kürzel wird als Excel-Artefakt gemeldet',
  I.pruefe({ kuerzel: '1', label: '30 Tage netto', tage: 30 }, 'zahlbed')
    .some(h => h.typ === 'warn' && /Null/.test(h.text)));
I.zahlbedTageSetzen({});

console.log('\n═══ A8 — Kreditoren ═══');
eq('«Bezahlt» schlägt «freigegeben»', I.kreditorStatus('Bezahlt').status, 'bezahlt');
eq('«Zurückgewiesen»', I.kreditorStatus('Zurückgewiesen').status, 'zurueckgewiesen');
eq('«Freigegeben»', I.kreditorStatus('Freigegeben').status, 'freigegeben');
eq('Unbekanntes landet auf «offen»', I.kreditorStatus('Blubb').status, 'offen');
t('… und wird gemeldet', I.kreditorStatus('Blubb').erkannt === false);
const kr = zeile('kreditoren', ['id', 'name1', 'belegnr', 'datum', 'faelligdatum', 'betrag', 'kredistatustext', 'rapport_nr'],
  ['k99', 'Sanitär Muster AG', 'RE-4711', '2026-03-01', '2026-03-31', '1250.50', 'Freigegeben', '8123']);
eq('Lieferant', kr.ziel.lieferant, 'Sanitär Muster AG');
eq('Betrag', kr.ziel.betrag, 1250.5);
eq('Status', kr.ziel.status, 'freigegeben');
eq('Auftrags-Nr. für die Zuteilung', kr.ziel.auftragNr, '8123');
t('ohne Betrag blockiert die Zeile',
  I.pruefe({ lieferant: 'X', betrag: null }, 'kreditoren').some(h => h.typ === 'fehler'));

console.log('\n═══ A9 — Zahlungen und Belegtotal ═══');
const za = zeile('zahlungen', ['nr', 'zahlungsdatum', 'zahlungsbetrag'], ['77', '2026-04-02', '1080.00']);
eq('Rechnungs-Nr.', za.ziel.belegNr, '77');
eq('Datum', za.ziel.datum, '2026-04-02');
eq('Betrag', za.ziel.betrag, 1080);
t('ohne Betrag blockiert die Zeile',
  I.pruefe({ belegNr: '77', betrag: null }, 'zahlungen').some(h => h.typ === 'fehler'));
eq('Belegtotal bevorzugt die gemerkte Summe des Altsystems',
  I.belegBrutto({ importSumme: { brutto: 1080 }, positionen: [{ art: 'frei', ep: 1, menge: 1 }] }), 1080);
eq('… sonst wird es aus den Positionen gerechnet',
  I.belegBrutto({ mwstPct: 8.1, positionen: [{ art: 'frei', ep: 100, menge: 2 }, { art: 'titel', bez: 'T' }] }),
  216.2);

console.log('\n═══ A10 — Adress-Zusatzfelder ergänzen, nie überschreiben ═══');
const a1 = { firma: 'Muster AG' };
t('leere Felder werden gefüllt',
  I.adressZusatz({ pkDebi: '10500', stdRabatt: 5 }, a1) && a1.importPkDebi === '10500' && a1.stdRabattPct === 5);
const a2 = { firma: 'Muster AG', importPkDebi: '99999', stdRabattPct: 12 };
t('bestehende Werte bleiben stehen',
  !I.adressZusatz({ pkDebi: '10500', stdRabatt: 5 }, a2) &&
  a2.importPkDebi === '99999' && a2.stdRabattPct === 12);
t('ohne Zusatzdaten wird nichts gemeldet', !I.adressZusatz({}, { firma: 'X' }));

console.log('\n═══ A11 — Abschnitts-Erkennung trennt die neuen Exporte ═══');
const erkPos = I.erkenneSektion(kopfPos);
eq('Positions-Export wird als «positionen» erkannt', erkPos.beste.sekId, 'positionen');
t('… und zwar sicher', erkPos.sicher);
const erkZb = I.erkenneSektion(kopfZb);
eq('Konditionen-Export wird als «zahlbed» erkannt', erkZb.beste.sekId, 'zahlbed');
const erkKred = I.erkenneSektion(['id', 'kreditor_key', 'name1', 'kredistatustext', 'betrag', 'restbetrag', 'gkonto']);
eq('Kreditoren-Export wird als «kreditoren» erkannt', erkKred.beste.sekId, 'kreditoren');
// Die Rechnungs-Erkennung darf durch die neuen Abschnitte nicht kippen.
const erkRe = I.erkenneSektion(['id', 'nr', 'rapport_nr', 'datum', 'rbetrag', 'mwstbetrag', 'esr_ref',
                                'name1', 'strasse', 'plz', 'ort', 'typtext', 'typtext1', 'abt_name']);
eq('Rechnungs-Export bleibt «rechnungen»', erkRe.beste.sekId, 'rechnungen');

console.log('\n═══ A12 — Rechnungsnummer vor Fibu-Belegnummer ═══');
// Im Altsystem ist `nr` die Rechnungsnummer und `belegnr` die Fibu-Belegnummer.
// Stünde «belegnr» in der Alias-Liste vor «nr», landete der Fibu-Beleg in der
// Rechnungsnummer — der Beleg wäre unter falscher Nummer im System.
const re = zeile('rechnungen', ['nr', 'belegnr', 'datum', 'rbetrag'],
  ['5001', 'FIBU-99', '2026-02-01', '1080']);
eq('nr bleibt die Rechnungsnummer', re.ziel.nr, '5001');
eq('belegnr landet in der Fibu-Belegnummer', re.ziel.fibuBelegNr, 'FIBU-99');

console.log('\n═══ A13 — jeder neue Abschnitt ist vollständig deklariert ═══');
['positionen', 'zahlungen', 'kreditoren', 'artikel', 'zahlbed'].forEach(id => {
  const sek = I.sektion(id);
  t(id + ': registriert und bereit', !!sek && sek.bereit === true);
  t(id + ': hat Felder', !!sek && Array.isArray(sek.felder) && sek.felder.length > 0);
  t(id + ': hat mindestens ein Pflichtfeld', !!sek && sek.felder.some(f => f.pflicht));
  t(id + ': erklärt sich (info)', !!sek && typeof sek.info === 'string' && sek.info.length > 40);
  t(id + ': jedes Feld hat Aliasse',
    !!sek && sek.felder.every(f => Array.isArray(f.alias) && f.alias.length > 0));
  t(id + ': steht in der Import-Reihenfolge', I.IMPORT_REIHENFOLGE.indexOf(id) >= 0);
});

console.log('\n═══ A14 — die Vorschau kennt jeden Abschnitt ═══');
// Ohne eigenen Zweig fällt ein Abschnitt in der Vorschau auf die Adress-Ansicht
// zurück und zeigt leere Spalten — der Nutzer sähe vor dem Import nicht, was
// ankommt. Geprüft wird darum, dass jeder Abschnitt sowohl in der Kopfzeile
// als auch im Zeilen-Zweig vorkommt.
const erpHtml = fs.readFileSync(path.join(ROOT, 'pm_erp.html'), 'utf8');
const FALLBACK = 'adressen';   // die Adress-Ansicht IST der else-Zweig
I.SEKTIONEN.filter(s => s.id !== FALLBACK).forEach(sek => {
  const treffer = (erpHtml.match(new RegExp("_mig\\.sekId===['\"]" + sek.id + "['\"]", 'g')) || []).length;
  t('Vorschau kennt «' + sek.id + '» in Kopfzeile und Zeilen', treffer >= 2);
});
t('der Fallback ist die Adress-Ansicht', !!I.sektion(FALLBACK));
t('globale Plan-Warnungen werden angezeigt (kein stiller Deckel)',
  /plan\.warnungen/.test(erpHtml));
t('die neuen Zähler stehen im Abschluss-Bericht',
  /rep\.posBelege/.test(erpHtml) && /rep\.zahlungen/.test(erpHtml) &&
  /rep\.belegFehlt/.test(erpHtml) && /rep\.belegBesetzt/.test(erpHtml));

console.log('');
if (fail) { console.error('✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen'); process.exit(1); }
console.log('✓ alle ' + n + ' Checks bestanden');
