// Node-Test der DOM-freien Schul-Engine (gema_schule_api.js /*ENGINE-START*/-Block)
// Aufruf: node scripts/schule_engine_test.mjs
import fs from 'fs';

const src = fs.readFileSync(new URL('../gema_schule_api.js', import.meta.url), 'utf8');
const m = src.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) { console.error('ENGINE-Block nicht gefunden'); process.exit(1); }
const engine = new Function(m[1] + `
  return {schuleUid,schuleCodeNeu,schuleCodeNorm,schuleSeed,schuleShuffle,schuleNote,schuleNoteFmt,
    schuleNoteFarbe,schuleFenster,schulePruefPhase,schuleRest,schuleFmtMs,schuleMcPunkte,schuleWertOk,
    schuleAutoPunkte,schuleSplitPruefung,schuleMergePruefung,schuleTotalPunkte,schuleAntwortLeer,
    schuleFortschritt,schuleAbgabePunkte,schuleNotenspiegel,schuleAbgabeId,SCHULE_CODE_ALPHABET};
`)();

let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ ' + name); }
}
function eq(name, a, b) {
  t(name + ' (' + JSON.stringify(a) + ' == ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b));
}

console.log('— Noten —');
eq('Vollpunktzahl = 6.0', engine.schuleNote(26, 26, 'zehntel'), 6);
eq('Hälfte = 3.5', engine.schuleNote(13, 26, 'zehntel'), 3.5);
eq('0 Punkte = 1.0', engine.schuleNote(0, 26, 'zehntel'), 1);
eq('Zehntel-Rundung 17/26', engine.schuleNote(17, 26, 'zehntel'), 4.3); // 4.269 → 4.3
eq('Halbe Noten 17/26', engine.schuleNote(17, 26, 'halb'), 4.5);        // 4.269 → 4.5
eq('Über Max klemmt auf 6', engine.schuleNote(30, 26, 'zehntel'), 6);
eq('Negativ klemmt auf 1', engine.schuleNote(-4, 26, 'zehntel'), 1);
eq('Max 0 → null', engine.schuleNote(5, 0, 'zehntel'), null);
eq('NoteFmt', engine.schuleNoteFmt(4.5), '4.5');
eq('NoteFmt null', engine.schuleNoteFmt(null), '–');

console.log('— Shuffle —');
const arr = [1, 2, 3, 4, 5, 6, 7, 8];
const s1 = engine.schuleShuffle(arr, 'pruef1|userA');
const s2 = engine.schuleShuffle(arr, 'pruef1|userA');
const s3 = engine.schuleShuffle(arr, 'pruef1|userB');
eq('Deterministisch (gleicher Seed)', s1, s2);
t('Verschiedene Seeds ≠ (praktisch)', JSON.stringify(s1) !== JSON.stringify(s3));
eq('Permutation (sortiert gleich)', s1.slice().sort(), arr.slice().sort());
t('Original unverändert', JSON.stringify(arr) === '[1,2,3,4,5,6,7,8]');
eq('Leeres Array ok', engine.schuleShuffle([], 'x'), []);

console.log('— Zeitfenster / Phase / Countdown —');
const T0 = Date.parse('2026-07-01T10:00:00Z');
const pruef = {
  status: 'geplant',
  startAm: '2026-07-01T10:00:00Z',
  endeAm: '2026-07-01T10:45:00Z',
  toleranzMin: 10,
  verlaengerungen: {
    uV: { zusatzMin: 15 },
    uN: { startAm: '2026-07-02T10:00:00Z', endeAm: '2026-07-02T10:45:00Z' }
  }
};
const f = engine.schuleFenster(pruef, 'uX');
eq('Fenster Start', f.start, T0);
eq('Fenster Ende', f.ende, T0 + 45 * 60000);
eq('Toleranz-Ende', f.toleranzEnde, T0 + 55 * 60000);
const fV = engine.schuleFenster(pruef, 'uV');
eq('Zusatzzeit verlängert Ende', fV.ende, T0 + 60 * 60000);
eq('Zusatzzeit verlängert Toleranz-Ende', fV.toleranzEnde, T0 + 70 * 60000);
const fN = engine.schuleFenster(pruef, 'uN');
eq('Individuelles Fenster (Nachschreiber)', fN.start, T0 + 24 * 3600000);
eq('Phase vor Start = geplant', engine.schulePruefPhase(pruef, 'uX', T0 - 1000), 'geplant');
eq('Phase im Fenster = laufend', engine.schulePruefPhase(pruef, 'uX', T0 + 10 * 60000), 'laufend');
eq('Phase nach Ende = toleranz', engine.schulePruefPhase(pruef, 'uX', T0 + 50 * 60000), 'toleranz');
eq('Phase nach Toleranz = beendet', engine.schulePruefPhase(pruef, 'uX', T0 + 56 * 60000), 'beendet');
eq('Entwurf bleibt Entwurf', engine.schulePruefPhase({ status: 'entwurf', startAm: pruef.startAm, endeAm: pruef.endeAm }, 'uX', T0), 'entwurf');
eq('Zusatzzeit: uV läuft noch bei +50min', engine.schulePruefPhase(pruef, 'uV', T0 + 50 * 60000), 'laufend');
const r1 = engine.schuleRest(pruef, 'uX', T0 + 40 * 60000);
eq('Countdown laufend: 5 min Rest', r1, { phase: 'laufend', ms: 5 * 60000 });
const r2 = engine.schuleRest(pruef, 'uX', T0 + 47 * 60000);
eq('Countdown Toleranz: 8 min Rest', r2, { phase: 'toleranz', ms: 8 * 60000 });
eq('fmtMs 0', engine.schuleFmtMs(0), '00:00');
eq('fmtMs 65 s', engine.schuleFmtMs(65000), '01:05');
eq('fmtMs 1h 1m 1s', engine.schuleFmtMs(3661000), '1:01:01');
eq('fmtMs negativ → 00:00', engine.schuleFmtMs(-500), '00:00');

console.log('— MC-Punkte —');
const mcSingle = { punkte: 2, mcOptionen: [{ id: 'a', korrekt: true }, { id: 'b' }, { id: 'c' }] };
eq('Single richtig = voll', engine.schuleMcPunkte(mcSingle, ['a']), 2);
eq('Single falsch = 0', engine.schuleMcPunkte(mcSingle, ['b']), 0);
eq('Keine Auswahl = 0', engine.schuleMcPunkte(mcSingle, []), 0);
const mcMulti = { punkte: 3, mcOptionen: [{ id: 'a', korrekt: true }, { id: 'b', korrekt: true }, { id: 'c', korrekt: true }, { id: 'd' }] };
eq('Multi alle richtig = voll', engine.schuleMcPunkte(mcMulti, ['a', 'b', 'c']), 3);
eq('Multi 2/3 richtig = 2', engine.schuleMcPunkte(mcMulti, ['a', 'b']), 2);
eq('Multi 2 richtig + 1 falsch = 1', engine.schuleMcPunkte(mcMulti, ['a', 'b', 'd']), 1);
eq('Multi nie negativ', engine.schuleMcPunkte(mcMulti, ['d']), 0);
eq('Keine korrekten Optionen = 0', engine.schuleMcPunkte({ punkte: 2, mcOptionen: [{ id: 'a' }] }, ['a']), 0);

console.log('— Zahlen-Antwortfelder —');
eq('Exakt ok', engine.schuleWertOk({ loesung: '3.6', toleranzPct: 2 }, '3.6'), true);
eq('Innerhalb 2% ok', engine.schuleWertOk({ loesung: '100' }, '101.9'), true);
eq('Ausserhalb 2% falsch', engine.schuleWertOk({ loesung: '100' }, '103'), false);
eq('Komma-Eingabe ok', engine.schuleWertOk({ loesung: '3,6', toleranzPct: 1 }, '3,62'), true);
eq('Text = falsch', engine.schuleWertOk({ loesung: '5' }, 'abc'), false);
eq('Ohne Lösung = falsch', engine.schuleWertOk({ loesung: '' }, '5'), false);
const ber = { typ: 'berechnung', punkte: 4, antwortFelder: [
  { id: 'f1', loesung: '10', toleranzPct: 2 },
  { id: 'f2', loesung: '20', toleranzPct: 2 }
]};
eq('Auto Berechnung 2/2', engine.schuleAutoPunkte(ber, { werte: { f1: '10', f2: '20' } }).punkte, 4);
eq('Auto Berechnung 1/2', engine.schuleAutoPunkte(ber, { werte: { f1: '10', f2: '99' } }).punkte, 2);
eq('Auto Freitext aus', engine.schuleAutoPunkte({ typ: 'freitext', punkte: 2 }, { text: 'x' }).auto, false);
eq('Auto MC', engine.schuleAutoPunkte({ typ: 'mc', punkte: 2, mcOptionen: [{ id: 'a', korrekt: true }] }, { mc: ['a'] }).punkte, 2);

console.log('— Prüfungs-Split (Lösungs-Leak-Schutz) —');
const full = {
  id: 'p1', orgId: 'o1', titel: 'Test',
  aufgaben: [
    { id: 'a1', typ: 'freitext', frage: 'F?', punkte: 2, loesung: 'GEHEIME_LOESUNG', loesungBilder: [{ name: 'lb.jpg', url: 'https://x/lb.jpg' }] },
    { id: 'a2', typ: 'mc', frage: 'M?', punkte: 1, mcOptionen: [{ id: 'o1', text: 'A', korrekt: true }, { id: 'o2', text: 'B', korrekt: false }] },
    { id: 'a3', typ: 'berechnung', frage: 'B?', punkte: 3, antwortFelder: [{ id: 'f1', label: 'Δp', einheit: 'bar', loesung: '3.6', toleranzPct: 2 }], tools: ['druckerhoehung'] }
  ]
};
const sp = engine.schuleSplitPruefung(full);
const pubJson = JSON.stringify(sp.pub);
t('pub enthält KEINE Lösung (Text)', pubJson.indexOf('GEHEIME_LOESUNG') < 0);
t('pub enthält KEINE Lösungs-Bilder', pubJson.indexOf('lb.jpg') < 0);
t('pub enthält KEIN korrekt-Flag', pubJson.indexOf('korrekt') < 0);
t('pub enthält KEINEN Lösungswert 3.6', pubJson.indexOf('3.6') < 0);
t('pub enthält KEINE toleranzPct', pubJson.indexOf('toleranzPct') < 0);
t('pub behält Frage/Felder/Tools', sp.pub.aufgaben[2].antwortFelder[0].label === 'Δp' && sp.pub.aufgaben[2].tools[0] === 'druckerhoehung');
t('loes enthält Lösung', JSON.stringify(sp.loes).indexOf('GEHEIME_LOESUNG') >= 0);
const merged = engine.schuleMergePruefung(sp.pub, sp.loes);
eq('Merge stellt Lösung wieder her', merged.aufgaben[0].loesung, 'GEHEIME_LOESUNG');
eq('Merge stellt korrekt wieder her', merged.aufgaben[1].mcOptionen.map(o => !!o.korrekt), [true, false]);
eq('Merge stellt Feld-Lösung wieder her', merged.aufgaben[2].antwortFelder[0].loesung, '3.6');

console.log('— Punkte / Fortschritt / Spiegel —');
eq('Total', engine.schuleTotalPunkte(full), 6);
t('Antwort leer', engine.schuleAntwortLeer({ text: '  ' }) === true);
t('Antwort mit Text nicht leer', engine.schuleAntwortLeer({ text: 'x' }) === false);
t('Antwort mit MC nicht leer', engine.schuleAntwortLeer({ mc: ['a'] }) === false);
t('Antwort mit Wert nicht leer', engine.schuleAntwortLeer({ werte: { f1: '5' } }) === false);
t('Antwort mit Datei nicht leer', engine.schuleAntwortLeer({ dateien: [{}] }) === false);
const abg = { antworten: { a1: { text: 'x' }, a2: { mc: ['o1'] } }, korrektur: { a1: { punkte: 1.5 }, a2: { punkte: 1 } } };
eq('Fortschritt 2/3', engine.schuleFortschritt(full, abg), { beantwortet: 2, total: 3 });
eq('Abgabe-Punkte mit offener Aufgabe', engine.schuleAbgabePunkte(full, abg), { punkte: 2.5, offen: 1 });
const ns = engine.schuleNotenspiegel([5.5, 4.0, 3.5]);
eq('Notenspiegel avg', ns.avg, 4.33);
eq('Notenspiegel bestanden', ns.bestanden, 2);
eq('AbgabeId', engine.schuleAbgabeId('p1', 'u1'), 'abg_p1__u1');

console.log('— Klassencode —');
const code = engine.schuleCodeNeu();
t('Code 6 Zeichen', code.length === 6);
t('Code nur erlaubte Zeichen', [...code].every(c => engine.SCHULE_CODE_ALPHABET.indexOf(c) >= 0));
t('Alphabet ohne I/L/O/0/1', ['I', 'L', 'O', '0', '1'].every(c => engine.SCHULE_CODE_ALPHABET.indexOf(c) < 0));
eq('codeNorm', engine.schuleCodeNorm(' k7-m2 xa '), 'K7M2XA');

console.log('');
console.log(fail ? '✗ ' + fail + ' von ' + n + ' Tests FEHLGESCHLAGEN' : '✓ Alle ' + n + ' Tests grün');
process.exit(fail ? 1 : 0);
