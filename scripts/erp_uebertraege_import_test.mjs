// Drift-Guard — ERP-Migration, dritte Runde
//
// Geprüft wird, was aus der Auswertung des Altbestands vom 07.09.2026 kam:
//
//   A  Termin-Uhrzeiten. Das Altsystem führt ZWEI Zeitpaare: `von60`/`bis60`
//      tragen den Klartext («07:00»), `von`/`bis` Dezimalzahlen (gemessen
//      1.00 … 19.50). Wer die Dezimalspalte erwischt, bekäme aus «19.50»
//      still «19:50» statt 19:30 — eine halbe Stunde daneben, 6 924 mal.
//      Darum: `von60` gewinnt die Zuordnung, und eine nackte Zahl wird
//      NIE zu einer Uhrzeit gedeutet.
//
//   B  Ferien- und Überzeitüberträge (`arbueber`). Jede Zeile ist ein SALDO
//      auf einen Stichtag, kein Zuwachs — aufsummieren wäre falsch. Sie
//      liegen im Stunden-Pool und dürfen die Tagesrapporte nicht anfassen.
//
//   C  Nachkalkulation des Altsystems: ein JSON-Feld, das nur mitgeführt und
//      nie in GEMAs Zahlen eingerechnet wird. Leere Felder fliegen raus (das
//      Altsystem legt alle 35 Spalten an, gefüllt sind 121 von 9 723).
//
// Gegenproben sind bewusst eingebaut: ohne die Fixes müssten sie rot werden.
//
// Aufruf:  node scripts/erp_uebertraege_import_test.mjs
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

function zeile(sekId, kopf, werte) {
  const map = I.erkenneMapping(kopf, sekId);
  return { map, ziel: I.normalisiereZeile(werte, map, sekId) };
}

console.log('\n═══ A — Termin-Uhrzeit: Klartext ja, Dezimalzahl nie ═══');
eq('«07:00» → 07:00', I.parseZeit('07:00'), '07:00');
eq('«9:45» wird auf zwei Stellen gebracht', I.parseZeit('9:45'), '09:45');
eq('«19h30» (Schreibweise mit h)', I.parseZeit('19h30'), '19:30');
eq('leer bleibt leer', I.parseZeit(''), '');
// Der Kern: «19.50» ist im Altsystem die Dezimalstunde 19:30 — als Uhrzeit
// gelesen wären es 19:50. Beides ist plausibel, keines belegt → nichts raten.
eq('«19.50» wird NICHT gedeutet', I.parseZeit('19.50'), '');
eq('«7.5» wird NICHT gedeutet', I.parseZeit('7.5'), '');
eq('«7» wird NICHT gedeutet', I.parseZeit('7'), '');
eq('«25:00» ist keine Uhrzeit', I.parseZeit('25:00'), '');
eq('«08:75» ist keine Uhrzeit', I.parseZeit('08:75'), '');

console.log('\n═══ A2 — von60 schlägt von in der Spaltenerkennung ═══');
{
  // So sieht der Export aus, wenn BEIDE Paare mitkommen.
  const kopf = ['guid', 'datum', 'von', 'bis', 'von60', 'bis60', 'arbeit', 'arbname'];
  const { map, ziel } = zeile('termine', kopf,
    ['g1', '2026-09-07', '7.5', '11.75', '07:30', '11:45', 'Montage', 'Muster']);
  eq('«Von» greift auf von60', map.zeitVon, kopf.indexOf('von60'));
  eq('«Bis» greift auf bis60', map.zeitBis, kopf.indexOf('bis60'));
  eq('Uhrzeit kommt aus dem Klartext', ziel.zeitVon, '07:30');
  eq('Bis-Zeit kommt aus dem Klartext', ziel.zeitBis, '11:45');
  t('kein Rohwert-Vermerk nötig', !ziel.zeitRoh);
  // Gegenprobe: Stünde «von» vorn (der Stand vor dem Fix), käme hier 7.5
  // heraus — und über parseZeit gar nichts. Beides wäre falsch.
  t('Gegenprobe: 7.5 ist nirgends als Zeit gelandet',
    ziel.zeitVon !== '7.5' && ziel.zeitVon !== '07:50');
}
{
  // Und so, wenn jemand nur die Dezimalspalten exportiert: keine erfundene
  // Uhrzeit, sondern ein Vermerk und eine Meldung.
  const kopf = ['guid', 'datum', 'von', 'bis', 'arbeit', 'arbname'];
  const { map, ziel } = zeile('termine', kopf,
    ['g2', '2026-09-07', '19.50', '20.25', 'Notfall', 'Muster']);
  eq('ohne von60 greift «Von» ersatzweise auf von', map.zeitVon, kopf.indexOf('von'));
  eq('daraus entsteht KEINE Uhrzeit', ziel.zeitVon, '');
  eq('der Rohwert bleibt erhalten', ziel.zeitRoh, '19.50–20.25');
  const hin = I.pruefe(ziel, 'termine');
  t('die Vorschau warnt und nennt von60/bis60',
    hin.some(h => h.typ === 'warn' && /von60/.test(h.text)));
  t('die Zeile wird deswegen nicht übersprungen',
    !hin.some(h => h.typ === 'fehler'));
}

console.log('\n═══ B — Überträge: Saldo auf einen Stichtag ═══');
{
  // Kopfzeile wie im Export aus `arbueber` (echte Spaltennamen).
  const kopf = ['id', 'arbname', 'datum', 'totarbeit', 'totferien', 'ausbezst', 'zus_stunden', 'bemerkung'];
  const { map, ziel } = zeile('uebertraege', kopf,
    ['4711', 'Muster Hans', '2026-01-01', '15.25', '248.75', '0.00', '0.00', 'Topf A=52h(100%)']);
  eq('Mitarbeiter erkannt', map.mitarbeiter, kopf.indexOf('arbname'));
  eq('totferien ist das Ferienguthaben', map.ferienH, kopf.indexOf('totferien'));
  eq('totarbeit ist der Stundenübertrag', map.ueberzeitH, kopf.indexOf('totarbeit'));
  eq('ausbezst sind die ausbezahlten Überstunden', map.ausbezahltH, kopf.indexOf('ausbezst'));
  eq('Ferienguthaben in Stunden', ziel.ferienH, 248.75);
  eq('Überzeit', ziel.ueberzeitH, 15.25);
  eq('Stichtag', ziel.datum, '2026-01-01');
  eq('Bemerkung bleibt', ziel.bemerkung, 'Topf A=52h(100%)');
  // 0.00 ist eine Aussage, kein «nicht gesetzt».
  eq('eine 0 bleibt eine 0', ziel.ausbezahltH, 0);
  t('und ist nicht null', ziel.ausbezahltH !== null);
}
{
  // Minusstunden kommen im Altbestand vor (gemessen: −6.75, −14.0, −39.0).
  const kopf = ['arbname', 'datum', 'totarbeit', 'totferien'];
  const { ziel } = zeile('uebertraege', kopf, ['Muster Hans', '2024-01-01', '-6.75', '283.50']);
  eq('negativer Übertrag wird übernommen', ziel.ueberzeitH, -6.75);
  const hin = I.pruefe(ziel, 'uebertraege');
  t('Minusstunden werden benannt, nicht verschluckt',
    hin.some(h => /[Nn]egativ/.test(h.text)));
  t('kein Fehler', !hin.some(h => h.typ === 'fehler'));
}
{
  const kopf = ['arbname', 'datum', 'totarbeit', 'totferien'];
  const ohneMa = zeile('uebertraege', kopf, ['', '2024-01-01', '5', '10']).ziel;
  t('ohne Mitarbeiter → Fehler',
    I.pruefe(ohneMa, 'uebertraege').some(h => h.typ === 'fehler'));
  const ohneDatum = zeile('uebertraege', kopf, ['Muster', '', '5', '10']).ziel;
  t('ohne Stichtag → Fehler',
    I.pruefe(ohneDatum, 'uebertraege').some(h => h.typ === 'fehler'));
  const ohneSaldo = zeile('uebertraege', kopf, ['Muster', '2024-01-01', '', '']).ziel;
  t('ohne jeden Saldo → Fehler',
    I.pruefe(ohneSaldo, 'uebertraege').some(h => h.typ === 'fehler'));
}
{
  // Mehrere Zeilen je Person sind Geschichte — der Schlüssel muss sie
  // auseinanderhalten, sonst überschriebe der letzte Import den ganzen Verlauf.
  const a = I.uebertragSchluessel('2026-01-01', 'Muster Hans', '');
  const b = I.uebertragSchluessel('2025-10-31', 'Muster Hans', '');
  t('zwei Stichtage derselben Person sind zwei Datensätze', a !== b);
  const c = I.uebertragSchluessel('2026-01-01', 'Andere Person', '');
  t('zwei Personen am selben Stichtag sind zwei Datensätze', a !== c);
  // Die ID des Altsystems gewinnt, damit ein zweiter Lauf nichts verdoppelt.
  eq('gleiche Alt-ID → gleicher Schlüssel',
    I.uebertragSchluessel('2026-01-01', 'X', '4711'),
    I.uebertragSchluessel('1999-01-01', 'Y', '4711'));
}

console.log('\n═══ B2 — Überträge liegen NEBEN den Tagesrapporten ═══');
{
  const src = fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8');
  // Der Übertrag trägt typ:'uebertrag'; pm_stunden trennt darüber (wie bei
  // den Auszahlungen). Ohne den `!t.typ`-Filter im Stunden-Writer würde ein
  // Übertrag vom 01.01. zum Tagesrapport desselben Tages umgebaut.
  t('Übertrag wird als typ:\'uebertrag\' abgelegt', /typ:'uebertrag'/.test(src));
  t('der Stunden-Writer überspringt typisierte Datensätze',
    /return !t\.typ&&s\(t\.datum\)===g\.datum/.test(src));
  t('Überträge landen im Stunden-Pool',
    /poolSichern\(ST_POOL,ST_PREFIX,rec,ST_MODULE\)/.test(src));
  // Reihenfolge: der Übertrag braucht die Person, nicht den Tagesrapport —
  // aber er gehört ans Ende, weil er nichts anderes speist.
  const r = I.IMPORT_REIHENFOLGE;
  t('Überträge sind in der Reihenfolge geführt', r.indexOf('uebertraege') >= 0);
  t('sie kommen nach den Stunden', r.indexOf('uebertraege') > r.indexOf('stunden'));
}

console.log('\n═══ C — Nachkalkulation: mitführen, nicht mitrechnen ═══');
{
  // So kommt sie aus dem Export (JSON_OBJECT über die nk*-Spalten).
  const roh = JSON.stringify({
    nkrnbh: 204.15, nkrmat: 37699.92, nkrfaktor: 0.999, nkoffph: 91.99,
    nkwstup: 100, nkwmatp: 100,
    // Das Altsystem legt alle 35 Spalten an; die meisten sind leer.
    nkwnbh: 0, nkmantot: 0, nkwstuval: null, nkwmatpcfaktor: null
  });
  const nk = I.parseNachkalk(roh);
  eq('gefüllte Werte bleiben', nk.nkrnbh, 204.15);
  eq('und behalten ihre Rappen', nk.nkrmat, 37699.92);
  t('Nullwerte fliegen raus', nk.nkwnbh === undefined && nk.nkmantot === undefined);
  t('NULL-Spalten fliegen raus', !('nkwstuval' in nk) && !('nkwmatpcfaktor' in nk));
  eq('nur die 6 echten Werte bleiben', Object.keys(nk).length, 6);
}
{
  eq('ein leeres Objekt ergibt nichts', I.parseNachkalk('{}'), null);
  eq('lauter Nullen ergeben nichts', I.parseNachkalk('{"a":0,"b":null}'), null);
  eq('leer ergibt nichts', I.parseNachkalk(''), null);
  // Unlesbares wird NICHT verworfen — sonst verschwände es stillschweigend.
  eq('kaputtes JSON bleibt roh erhalten', I.parseNachkalk('{kaputt').roh, '{kaputt');
}
{
  const kopf = ['rapport_nr', 'betrifft', 'nachkalk'];
  const { map, ziel } = zeile('auftraege', kopf,
    ['8448.00', 'Sanitärarbeiten', '{"nkrnbh":204.15,"nkoffph":91.99}']);
  eq('das Feld wird erkannt', map.nachkalk, kopf.indexOf('nachkalk'));
  eq('und landet am Auftrag', ziel.nachkalk.nkrnbh, 204.15);
  // Der Kern: die Zahlen dürfen nirgends in GEMAs Rechenfelder rutschen.
  const s = JSON.stringify(ziel);
  t('kein Betrag am Beleg', !/"betrag"/.test(s));
  t('keine Positionen', !/"positionen"/.test(s));
}
{
  const src = fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8');
  t('sie wird als importNachkalk abgelegt', /doc\.importNachkalk=z\.nachkalk/.test(src));
  // Gegenprobe: Ein Zuweisen an ein Rechenfeld des Belegs wäre der Fehler,
  // den dieser Guard verhindern soll.
  t('Gegenprobe: nichts aus nachkalk landet in doc.betrag/doc.total',
    !/doc\.(betrag|total|summe)\s*=\s*z\.nachkalk/.test(src));
}

console.log('\n═══ D — Vorschau und Bericht zeigen das Neue ═══');
{
  const html = fs.readFileSync(path.join(ROOT, 'pm_erp.html'), 'utf8');
  t('die Überträge haben eigene Vorschau-Spalten', /sekId==='uebertraege'/.test(html));
  t('der Bericht nennt die übernommenen Salden', /ferienUebertraege/.test(html));
  t('der Bericht meldet unklare Termin-Zeiten', /zeitUnklar/.test(html));
  t('und sagt, welche Spalten zu exportieren sind', /von60/.test(html));
}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Prüfungen fehlgeschlagen'
                          : '✓ alle ' + n + ' Prüfungen bestanden'));
process.exit(fail ? 1 : 0);
