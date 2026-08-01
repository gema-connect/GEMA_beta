// Drift-Guard ERP-Migration + Adressstamm
//
// Teil A (reines Node): die DOM-freien Engines von gema_erp_adressen.js und
//   gema_erp_import.js — Normalisierung, Anzeigename, Snapshot-Kompatibilität,
//   Dedupe, Spalten-Erkennung, Anschrift-Parser, Zeilen-Normalisierung.
// Teil B (Chromium): der ECHTE XLSX-Reader gegen eine real erzeugte .xlsx-Datei
//   (ZIP + DecompressionStream + DOMParser) — inkl. Datums-Erkennung.
//
// Aufruf:  node scripts/erp_import_test.mjs
//          (Teil B braucht playwright-core + CHROME=<pfad>; fehlt beides,
//           wird Teil B mit klarem Hinweis übersprungen — nie still.)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(new URL('../x', import.meta.url)));
let n = 0, fail = 0;
function t(name, cond) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.error('  ✗ FAIL: ' + name); }
}
function eq(name, a, b) {
  t(name + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)),
    JSON.stringify(a) === JSON.stringify(b));
}

// ── Module in einer Fake-Window-Umgebung laden ──────────────────────────
function ladeModul(datei, win) {
  const src = fs.readFileSync(path.join(ROOT, datei), 'utf8');
  new Function('window', 'localStorage', 'GemaSync', 'GemaAuth', 'GemaObjekte', 'DOMParser', src)(
    win,
    { getItem: () => null, setItem: () => {} },
    undefined, undefined, undefined, undefined
  );
  return win;
}
const win = {};
ladeModul('gema_erp_adressen.js', win);
ladeModul('gema_erp_import.js', win);
const A = win.GemaAdressen, I = win.GemaErpImport;

console.log('\n═══ A1 — Adressstamm: Normalisierung & Alt-Kompatibilität ═══');
t('GemaAdressen geladen', !!A);
t('20 Standard-Kontakttypen (Altsystem 1:1)', A.TYPEN_DEFAULT.length === 20);
t('Typ «Programm Boilerservice» vorhanden',
  A.TYPEN_DEFAULT.some(x => x.label === 'Programm Boilerservice'));
t('3 Objekt-Slots', A.SLOTS.length === 3 && A.SLOTS[0].id === 'zahler');

// KRITISCH: firma darf NIE leer bleiben — Alt-Konsumenten (kundeSnapshot,
// QR-Rechnung, PDF-Fensteradresse) lesen ausschliesslich `firma`.
const priv = A.normalize({ vorname: 'Florian', name: 'Siebert' });
eq('Privatperson → firma aus Name Vorname', priv.firma, 'Siebert Florian');
t('Privatperson erkannt', A.istPerson(priv));
const fa = A.normalize({ firma: 'Immobilien Basel-Stadt', vorname: 'Florian', name: 'Siebert' });
eq('Firma bleibt Firma', fa.firma, 'Immobilien Basel-Stadt');
eq('Person wird zur Kontaktperson', fa.kontakt, 'Florian Siebert');
t('Firma ist keine Privatperson', !A.istPerson(fa));

const snap = A.snapshot(A.normalize({ id: 'kd_1', nr: '7330', firma: 'Immobilien Basel-Stadt', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen' }));
eq('Snapshot-Schema unverändert (Alt-Konsumenten)',
  Object.keys(snap).sort(), ['adressId', 'email', 'firma', 'kontakt', 'nr', 'ort', 'plz', 'strasse']);
eq('Snapshot.firma', snap.firma, 'Immobilien Basel-Stadt');

eq('Adresszeilen Firma', A.zeilen(fa).slice(0, 2), ['Immobilien Basel-Stadt', 'Florian Siebert']);
eq('Adresszeilen Person mit Anrede',
  A.zeilen(A.normalize({ anrede: 'Herr', vorname: 'Florian', name: 'Siebert', strasse: 'Hellring 7', plz: '4125', ort: 'Riehen' })),
  ['Herr Siebert Florian', 'Hellring 7', '4125 Riehen']);

console.log('\n═══ A2 — Dedupe (der Kern des idempotenten Imports) ═══');
// Der Export zeigt: dieselbe Firma hat PRO Liegenschaft eine eigene
// Kundennummer (7330 = Hellring 7, 7685 = Hellring 3). Nur über die
// Nummer zu deduplizieren ist deshalb zwingend — Name allein würde die
// beiden Datensätze fälschlich verschmelzen.
const a7330 = { nr: '7330', firma: 'Immobilien Basel-Stadt', strasse: 'Hellring 7', plz: '4125' };
const a7685 = { nr: '7685', firma: 'Immobilien Basel-Stadt', strasse: 'Hellring 3', plz: '4125' };
t('Gleiche Firma, andere Kundennummer → NICHT dieselbe Adresse',
  A.dedupeKey(a7330) !== A.dedupeKey(a7685));
t('Gleiche Kundennummer → dieselbe Adresse',
  A.dedupeKey(a7330) === A.dedupeKey({ nr: '7330', firma: 'Immo BS' }));
t('Ohne Nummer: Name+PLZ+Strasse entscheidet',
  A.dedupeKey({ firma: 'Muster AG', plz: '4000', strasse: 'Weg 1' }) ===
  A.dedupeKey({ firma: 'muster  ag', plz: '4000', strasse: 'weg 1' }));
eq('nextNrAus ignoriert nicht-numerische Nummern',
  A.nextNrAus([{ nr: '7330' }, { nr: 'K-A' }, { nr: '7685' }]), '7686');
eq('nextNrAus leer → 1', A.nextNrAus([]), '1');

console.log('\n═══ A3 — Anschrift-Block zerlegen ═══');
const anschrift = 'Zahlbar durch:\r\nImmobilien Basel-Stadt\r\nHellring 7\r\n4125 Riehen\r\n';
const bl = I.parseAnschrift(anschrift);
t('Slot «zahler» erkannt', !!bl.zahler);
eq('Firma aus Block', bl.zahler.firma, 'Immobilien Basel-Stadt');
eq('Strasse aus Block', bl.zahler.strasse, 'Hellring 7');
eq('PLZ aus Block', bl.zahler.plz, '4125');
eq('Ort aus Block', bl.zahler.ort, 'Riehen');

const mehr = I.parseAnschrift(
  'Zahlbar durch:\nMuster AG\nBahnhofstrasse 1\n8001 Zürich\n' +
  'Korrespondenzadresse:\nTreuhand Meier\nc/o Postfach\nPostfach 12\n3000 Bern\n' +
  'Eigentümer:\nErbengemeinschaft Muster\n8001 Zürich\n');
t('Drei Blöcke erkannt', !!(mehr.zahler && mehr.korrespondenz && mehr.eigentuemer));
eq('Korrespondenz-Firma', mehr.korrespondenz.firma, 'Treuhand Meier');
eq('Korrespondenz-Ort', mehr.korrespondenz.ort, 'Bern');
eq('Eigentümer ohne Strasse', mehr.eigentuemer.strasse, '');
eq('Eigentümer-Firma', mehr.eigentuemer.firma, 'Erbengemeinschaft Muster');
// _x000D_-Escapes (so liefert Excel den Zeilenumbruch im Shared-String)
t('_x000D_ wird dekodiert',
  I.parseAnschrift('Zahlbar durch:_x000D_\nMuster AG_x000D_\n8001 Zürich').zahler.firma === 'Muster AG');
eq('Block ohne Label fällt auf «zahler»', I.parseAnschrift('Muster AG\n8001 Zürich').zahler.firma, 'Muster AG');

console.log('\n═══ A4 — Spalten-Erkennung gegen den ECHTEN Export-Header ═══');
const HEADER = ['id', 'strasse', 'strasse2', 'plz', 'ort', 'egid', 'egrid', 'korr_name',
  'name1', 'vorname', 'name1_1', 'vorname_1', 'knummer', 'co_knummer', 'ei_knummer', 'anschrift'];
const map = I.erkenneMapping(HEADER, 'objekte');
eq('id → extId', map.extId, 0);
eq('strasse', map.strasse, 1);
eq('strasse2 → Adresszusatz', map.strasse2, 2);
eq('plz', map.plz, 3);
eq('ort', map.ort, 4);
eq('egid', map.egid, 5);
eq('egrid', map.egrid, 6);
eq('korr_name → Name der Hauptadresse', map.zahlerName, 7);
eq('name1 → Bezugsperson 1 Name', map.kp1Name, 8);
eq('vorname → Bezugsperson 1 Vorname', map.kp1Vorname, 9);
eq('name1_1 → Bezugsperson 2 Name', map.kp2Name, 10);
eq('vorname_1 → Bezugsperson 2 Vorname', map.kp2Vorname, 11);
eq('knummer → Zahlbar durch', map.zahlerNr, 12);
eq('co_knummer → Korrespondenz', map.korrNr, 13);
eq('ei_knummer → Eigentümer', map.eigNr, 14);
eq('anschrift', map.anschrift, 15);
t('Jede Quellspalte höchstens einmal vergeben',
  new Set(Object.values(map)).size === Object.values(map).length);

console.log('\n═══ A5 — Zeile normalisieren (echte Exportzeile) ═══');
const ZEILE = ['4984', 'Hellring 7', '', '4125', 'Riehen', '', '', 'Immobilien Basel-Stadt',
  '', '', '', '', '7330', '', '', anschrift];
const z = I.normalisiereZeile(ZEILE, map, 'objekte');
eq('extId', z.extId, '4984');
eq('Objektname aus Strasse', z.name, 'Hellring 7');
eq('Strasse', z.strasse, 'Hellring 7');
eq('PLZ/Ort', [z.plz, z.ort], ['4125', 'Riehen']);
t('Slot «zahler» befüllt', !!z.slots.zahler);
eq('Zahler-Kundennummer', z.slots.zahler.nr, '7330');
eq('Zahler-Firma aus Anschrift', z.slots.zahler.adresse.firma, 'Immobilien Basel-Stadt');
eq('Zahler-Strasse aus Anschrift', z.slots.zahler.adresse.strasse, 'Hellring 7');
t('Keine leeren Slots angelegt', !z.slots.korrespondenz && !z.slots.eigentuemer);
eq('Keine Bezugspersonen in dieser Zeile', z.personen.length, 0);
eq('Zeile ist gültig (keine Fehler)', I.pruefe(z, 'objekte').filter(h => h.typ === 'fehler').length, 0);

// Zeile MIT Bezugsperson + Typ
const map2 = I.erkenneMapping(['id', 'strasse', 'plz', 'ort', 'name1', 'vorname', 'typ1'], 'objekte');
const z2 = I.normalisiereZeile(['9', 'Weg 2', '4000', 'Basel', 'Siebert', 'Florian', 'Besteller'], map2, 'objekte');
eq('Bezugsperson erkannt', z2.personen.length, 1);
eq('Bezugsperson Name', [z2.personen[0].name, z2.personen[0].vorname], ['Siebert', 'Florian']);
eq('Bezugsperson Typ-Label', z2.personen[0].typLabel, 'Besteller');

const leer = I.normalisiereZeile(['', '', '', ''], I.erkenneMapping(['id', 'strasse', 'plz', 'ort'], 'objekte'), 'objekte');
t('Zeile ohne Adresse wird als Fehler markiert',
  I.pruefe(leer, 'objekte').some(h => h.typ === 'fehler'));

console.log('\n═══ A6 — Abschnitte & Kopfzeile ═══');
eq('5 Abschnitte registriert', I.SEKTIONEN.length, 5);
eq('Objekte + Adressen sind bereit',
  I.SEKTIONEN.filter(x => x.bereit).map(x => x.id), ['objekte', 'adressen']);
eq('Offerten/Aufträge/Rechnungen vorbereitet',
  I.SEKTIONEN.filter(x => !x.bereit).map(x => x.id), ['offerten', 'auftraege', 'rechnungen']);
eq('Kopfzeile = erste Zeile mit ≥2 Werten', I.findeKopfzeile([[''], ['', ''], ['id', 'strasse']]), 2);
eq('Datum-Serial 45000 → ISO', I.serialZuDatum(45000), '2023-03-15');
t('Datumsformat 14 erkannt', I.istDatumFmt(14, null));
t('Zahlformat 0.00 ist kein Datum', !I.istDatumFmt(2, '0.00'));

console.log('\n═══ A7 — Adress-Import: ergänzen statt überschreiben ═══');
// Der Bestand wird injiziert (opts.bestand) — dieselbe Schnittstelle, die der
// Importer nutzt, um die Adressliste EINMAL statt pro Zeile zu lesen.
const bestand = [A.normalize({ id: 'kd_1', nr: '7330', firma: 'Immobilien Basel-Stadt', tel: '061 111 11 11' })];
const r1 = A.upsertVonImport({ nr: '7330', firma: 'Immobilien BS', strasse: 'Hellring 7', tel: '099 999 99 99' }, { bestand });
eq('Bestehende Adresse wird erkannt', r1.aktion, 'aktualisiert');
eq('Leeres Feld wird ergänzt', r1.rec.strasse, 'Hellring 7');
eq('Gepflegte Telefonnummer bleibt (nie überschreiben)', r1.rec.tel, '061 111 11 11');
eq('Gepflegter Name bleibt', r1.rec.firma, 'Immobilien Basel-Stadt');
const r2 = A.upsertVonImport({ nr: '7330', firma: 'Immobilien Basel-Stadt', tel: '061 111 11 11' }, { bestand });
eq('Zweiter identischer Lauf ändert nichts', r2.aktion, 'unveraendert');
const r3 = A.upsertVonImport({ nr: '9999', firma: 'Neu AG' }, { bestand });
eq('Unbekannte Nummer → neu', r3.aktion, 'neu');
const r4 = A.upsertVonImport({ nr: '7330', typen: ['mieter'] }, { bestand });
eq('Typen werden vereinigt', r4.rec.typen, ['mieter']);
// Ohne Nummer greift die Namens-/Adress-Erkennung
const r5 = A.upsertVonImport({ firma: 'Immobilien Basel-Stadt' }, { bestand });
eq('Ohne Kundennummer + andere Adresse → neu (keine Falsch-Verschmelzung)', r5.aktion, 'neu');

console.log('\n═══ A8 — CSV/TSV-Fallback ═══');
const csv = I.parseCsv('id;strasse;plz;ort\n4984;"Hellring 7";4125;Riehen\n');
eq('CSV: 2 Zeilen', csv.sheets[0].rows.length, 2);
eq('CSV: Semikolon erkannt, Quotes entfernt', csv.sheets[0].rows[1], ['4984', 'Hellring 7', '4125', 'Riehen']);
eq('TSV erkannt', I.parseCsv('a\tb\n1\t2\n').sheets[0].rows[1], ['1', '2']);
eq('CSV mit Komma', I.parseCsv('a,b\n1,2\n').sheets[0].rows[1], ['1', '2']);
eq('CSV: doppelte Quotes als Escape', I.parseCsv('a\n"sag ""hallo"""\n').sheets[0].rows[1], ['sag "hallo"']);

// ── Teil B: echter XLSX-Reader im Browser ───────────────────────────────
console.log('\n═══ B — XLSX-Reader (Chromium, echte Datei) ═══');

// Eine echte .xlsx bauen (ZIP mit deflate) — damit der Test unabhängig von
// einer hochgeladenen Datei läuft und die Struktur exakt der von Excel
// entspricht (sharedStrings + styles + inline Datum).
function baueXlsx(dest) {
  const files = {};
  files['[Content_Types].xml'] =
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  files['_rels/.rels'] =
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files['xl/workbook.xml'] =
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Tabelle1" sheetId="1" r:id="rId1"/></sheets></workbook>';
  files['xl/_rels/workbook.xml.rels'] =
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  // numFmtId 14 = Datum → cellXfs[1] ist ein Datumsformat
  files['xl/styles.xml'] =
    '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>';
  const ss = ['id', 'strasse', 'plz', 'ort', 'knummer', 'anschrift', 'datum',
    '4984', 'Hellring 7', '4125', 'Riehen', '7330',
    'Zahlbar durch:_x000D_\nImmobilien Basel-Stadt_x000D_\nHellring 7_x000D_\n4125 Riehen_x000D_\n'];
  files['xl/sharedStrings.xml'] =
    '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + ss.length + '" uniqueCount="' + ss.length + '">' +
    ss.map(v => '<si><t xml:space="preserve">' + v.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</t></si>').join('') + '</sst>';
  files['xl/worksheets/sheet1.xml'] =
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>' +
    '<c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c><c r="G1" t="s"><v>6</v></c></row>' +
    // Spalte C (plz) bewusst als ZAHL, Spalte G als Datums-Serial mit s="1"
    '<row r="2"><c r="A2" t="s"><v>7</v></c><c r="B2" t="s"><v>8</v></c><c r="C2"><v>4125</v></c>' +
    '<c r="D2" t="s"><v>10</v></c><c r="E2" t="s"><v>11</v></c><c r="F2" t="s"><v>12</v></c>' +
    '<c r="G2" s="1"><v>45000</v></c></row>' +
    // Lücke: Zeile 3 überspringt Spalte B (prüft die Spalten-Index-Logik)
    '<row r="3"><c r="A3" t="inlineStr"><is><t>5280</t></is></c><c r="C3"><v>4125</v></c></row>' +
    '</sheetData></worksheet>';

  const names = Object.keys(files);
  const locals = [], central = [];
  let offset = 0;
  const crcTable = (() => { const c = []; for (let n2 = 0; n2 < 256; n2++) { let k = n2; for (let j = 0; j < 8; j++) k = k & 1 ? 0xEDB88320 ^ (k >>> 1) : k >>> 1; c[n2] = k >>> 0; } return c; })();
  function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function u16(v) { return Buffer.from([v & 255, (v >> 8) & 255]); }
  function u32(v) { return Buffer.from([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]); }
  for (const nm of names) {
    const raw = Buffer.from(files[nm], 'utf8');
    const def = zlib.deflateRawSync(raw);
    const crc = crc32(raw), nb = Buffer.from(nm, 'utf8');
    const lh = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(def.length), u32(raw.length), u16(nb.length), u16(0), nb, def]);
    locals.push(lh);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(def.length), u32(raw.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nb]));
    offset += lh.length;
  }
  const cd = Buffer.concat(central);
  const zip = Buffer.concat([Buffer.concat(locals), cd,
    Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(names.length), u16(names.length),
      u32(cd.length), u32(offset), u16(0)])]);
  fs.writeFileSync(dest, zip);
  return zip;
}

const tmp = path.join(ROOT, 'scripts', '.tmp_import_test.xlsx');
const zipBuf = baueXlsx(tmp);

let pw = null;
try { pw = (await import('playwright-core')).chromium; } catch (e) { pw = null; }
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!pw || !CHROME) {
  console.log('  ⏭  ÜBERSPRUNGEN — playwright-core und/oder CHROME nicht verfügbar.');
  console.log('     Der XLSX-Reader (ZIP + DecompressionStream + DOMParser) ist damit');
  console.log('     NICHT geprüft. Zum Nachholen: CHROME=<chromium> node scripts/erp_import_test.mjs');
} else {
  const browser = await pw.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => { fail++; console.error('  ✗ pageerror: ' + e.message); });
  await page.goto('about:blank');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'gema_erp_adressen.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'gema_erp_import.js'), 'utf8') });

  const res = await page.evaluate(async (bytes) => {
    const buf = new Uint8Array(bytes).buffer;
    const wb = await window.GemaErpImport.leseXlsx(buf);
    const rows = wb.sheets[0].rows;
    const map = window.GemaErpImport.erkenneMapping(rows[0], 'objekte');
    const z = window.GemaErpImport.normalisiereZeile(rows[1], map, 'objekte');
    return { blaetter: wb.sheets.length, name: wb.sheets[0].name, rows, map, ziel: z };
  }, Array.from(zipBuf));

  eq('1 Arbeitsblatt gelesen', res.blaetter, 1);
  eq('Blattname aus workbook.xml', res.name, 'Tabelle1');
  eq('Kopfzeile entpackt (sharedStrings)', res.rows[0], ['id', 'strasse', 'plz', 'ort', 'knummer', 'anschrift', 'datum']);
  eq('Datenzeile entpackt', res.rows[1].slice(0, 5), ['4984', 'Hellring 7', '4125', 'Riehen', '7330']);
  eq('Zahl-Zelle ohne Datumsformat bleibt Zahl-Text', res.rows[1][2], '4125');
  eq('Datums-Serial → ISO (styles.xml numFmtId 14)', res.rows[1][6], '2023-03-15');
  eq('inlineStr gelesen', res.rows[2][0], '5280');
  eq('Fehlende Zelle wird als leer aufgefüllt', res.rows[2][1], '');
  eq('Spalten-Index bleibt korrekt trotz Lücke', res.rows[2][2], '4125');
  eq('Mapping im Browser identisch zu Node', res.map.zahlerNr, 4);
  eq('Anschrift im Browser zerlegt', res.ziel.slots.zahler.adresse.firma, 'Immobilien Basel-Stadt');
  eq('_x000D_ im Browser dekodiert', res.ziel.slots.zahler.adresse.ort, 'Riehen');

  await browser.close();
}
try { fs.unlinkSync(tmp); } catch (e) {}

console.log('\n' + (fail ? '✗ ' + fail + ' von ' + n + ' Checks fehlgeschlagen' : '✓ alle ' + n + ' Checks bestanden'));
process.exit(fail ? 1 : 0);
