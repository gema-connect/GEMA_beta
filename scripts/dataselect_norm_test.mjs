// Node-Test: DataSelect-Normalizer (netlify/functions/dataselect.js)
// Das exakte debim-Feldschema ist vertrags-/versionsabhängig — _normArtikel
// bildet heuristisch über viele plausible Feldnamen ab. Dieser Test sichert,
// dass gängige Schema-Varianten (deutsch/englisch/BIM, verschiedene
// Container- und Bild-Formen, Schweizer Preisformate) korrekt landen.
// Ausführen: node scripts/dataselect_norm_test.mjs
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ds = require(join(ROOT, 'netlify/functions/dataselect.js'));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ FAIL: ' + l); } };
const near = (a, b) => Math.abs(a - b) < 1e-6;

console.log('■ _num — Schweizer/deutsche Preisformate');
ok(near(ds._num("1'234.50"), 1234.5), "1'234.50 → 1234.5 (Apostroph-Tausender)");
ok(near(ds._num('1.234,50'), 1234.5), '1.234,50 → 1234.5 (deutsch)');
ok(near(ds._num('12.30 CHF'), 12.3), '«12.30 CHF» → 12.3');
ok(near(ds._num('89'), 89), 'Ganzzahl');
ok(near(ds._num(''), 0) && near(ds._num(null), 0), 'leer/null → 0');

console.log('■ _bild — String / Array / Objekt');
ok(ds._bild('https://x/y.jpg') === 'https://x/y.jpg', 'String-URL direkt');
ok(ds._bild(['https://a/1.jpg', 'https://a/2.jpg']) === 'https://a/1.jpg', 'Array → erstes Bild');
ok(ds._bild([{ Url: 'https://o/z.png' }]) === 'https://o/z.png', 'Array von Objekten → .Url');
ok(ds._bild({ src: 'https://s/i.jpg' }) === 'https://s/i.jpg', 'Objekt → .src');
ok(ds._bild('') === '' && ds._bild(null) === '', 'leer → leer');

console.log('■ _normArtikel — deutsches Schema (debim-typisch)');
{
  const a = ds._normArtikel({
    ArtNr: '620.020.00.1', Bezeichnung: 'Spülkasten UP', EAN: '7612345678901',
    Bruttopreis: "289.50", Einheit: 'Stk', Hersteller: 'Geberit', Serie: 'Sigma',
    BildUrl: 'https://www.dataselect.ch/img/620020.jpg'
  });
  ok(a.artnr === '620.020.00.1', 'ArtNr');
  ok(a.bezeichnung === 'Spülkasten UP', 'Bezeichnung');
  ok(a.ean === '7612345678901', 'EAN');
  ok(near(a.preis, 289.5), 'Bruttopreis → 289.5');
  ok(a.einheit === 'Stk' && a.hersteller === 'Geberit' && a.serie === 'Sigma', 'Einheit/Hersteller/Serie');
  ok(a.bildUrl === 'https://www.dataselect.ch/img/620020.jpg', 'BildUrl');
  ok(a.waehrung === 'CHF', 'Währung Default CHF');
}

console.log('■ _normArtikel — englisches/alternatives Schema + Bez1+Bez2');
{
  const a = ds._normArtikel({
    articleNumber: 'ABC-1', description: 'Valve', gtin: '400123', listPrice: "1'050.00",
    unit: 'm', brand: 'Nussbaum', images: [{ url: 'https://n/v.png' }], bezeichnung2: 'DN20'
  });
  ok(a.artnr === 'ABC-1' && a.bezeichnung.indexOf('Valve') === 0, 'articleNumber/description');
  ok(a.bezeichnung.indexOf('DN20') >= 0, 'Bezeichnung2 angehängt');
  ok(a.ean === '400123' && near(a.preis, 1050) && a.einheit === 'm' && a.hersteller === 'Nussbaum', 'gtin/listPrice/unit/brand');
  ok(a.bildUrl === 'https://n/v.png', 'images-Array → erstes .url');
}
{
  // data:-URL (eingebettetes Bild) bleibt erhalten
  const a = ds._normArtikel({ artnr: 'X', bez: 'Y', preis: '5', bild: 'data:image/png;base64,AAAA' });
  ok(a.bildUrl === 'data:image/png;base64,AAAA', 'data:-Bild bleibt erhalten');
  ok(ds._normArtikel({}) && ds._normArtikel({}).artnr === '', 'leeres Objekt → leere Felder (kein Crash)');
  ok(ds._normArtikel(null) === null, 'null → null');
}

console.log('■ _extractArray — verschiedene Container-Formen');
ok(ds._extractArray([{ ArtNr: 'a' }]).length === 1, 'reines Array');
ok(ds._extractArray({ Artikel: [{ ArtNr: 'a' }, { ArtNr: 'b' }] }).length === 2, '{Artikel:[…]}');
ok(ds._extractArray({ data: [{ ArtNr: 'a' }] }).length === 1, '{data:[…]}');
ok(ds._extractArray({ result: { ArtNr: 'a' } }).length === 1, '{result:{…}} → 1');
ok(ds._extractArray({ ArtNr: '620', Bezeichnung: 'x' }).length === 1, 'einzelnes Artikel-Objekt (Top-Level)');
ok(ds._extractArray({ foo: 'bar' }).length === 0, 'unbekanntes Objekt → []');
ok(ds._extractArray(null).length === 0, 'null → []');

console.log('■ End-to-End: Container → normalisierte Artikelliste');
{
  const raw = { Artikel: [
    { ArtNr: '1', Bezeichnung: 'A', Bruttopreis: "10.00", BildUrl: 'https://x/1.jpg' },
    { ArtNr: '2', Bezeichnung: 'B', Bruttopreis: "0", Bilder: [] },
    { NurMuell: true }
  ]};
  const list = ds._extractArray(raw).map(ds._normArtikel).filter(a => a && (a.artnr || a.bezeichnung));
  ok(list.length === 2, 'Müll-Zeile (ohne Artnr/Bez) herausgefiltert');
  ok(list[0].bildUrl === 'https://x/1.jpg' && list[1].bildUrl === '', 'Bild pro Artikel korrekt (leeres Bilder-Array → kein Bild)');
}

console.log('■ _parseCsv — bexio-CSV (Semikolon, gequotet)');
{
  // Echte bexio-Kopfzeile (aus der Live-Antwort) + zwei Datenzeilen
  const header = '"ID";"Produktart";"Produktcode";"Produktname";"Produktbeschreibung HTML";"Produktbeschreibung";"Währung";"Einheit";"Hauptgruppe";"Untergruppe";"Einkaufspreis";"Verkaufspreis"';
  const csv = header + '\r\n'
    + '"1";"Ware";"620.020.00.1";"Spülkasten Sigma UP320";"<b>Sigma</b>";"Spülkasten UP";"CHF";"Stk";"Geberit";"Sigma";"180.00";"289.50"\r\n'
    + '"2";"Ware";"115.770.00.5";"Betätigungsplatte Sigma50";"";"Platte";"CHF";"Stk";"Geberit";"Sigma";"90.00";"145.00"';
  const parsed = ds._parseCsv(csv);
  ok(parsed && parsed.header.length === 12 && parsed.rows.length === 2, 'CSV: 12 Spalten, 2 Datenzeilen');
  const list = ds._extractArray(parsed.rows).map(ds._normArtikel);
  ok(list[0].artnr === '620.020.00.1', 'Produktcode → artnr');
  ok(list[0].bezeichnung === 'Spülkasten Sigma UP320', 'Produktname → bezeichnung');
  ok(Math.abs(list[0].preis - 289.5) < 1e-6, 'Verkaufspreis → preis (nicht Einkaufspreis)');
  ok(list[0].einheit === 'Stk' && list[0].waehrung === 'CHF', 'Einheit + Währung übernommen');
  ok(list[0].serie === 'Geberit', 'Hauptgruppe → serie (Fallback)');
  ok(list.length === 2 && list[1].artnr === '115.770.00.5', 'zweite Zeile korrekt');
}
{
  // Nur Kopfzeile (kein Treffer) → 0 Datenzeilen (nicht als Fehler behandeln)
  const onlyHeader = ds._parseCsv('"ID";"Produktcode";"Produktname";"Verkaufspreis"');
  ok(onlyHeader && onlyHeader.rows.length === 0, 'Nur-Header-CSV → leere Zeilenliste (kein Treffer)');
  // Feld mit eingebettetem Semikolon in Quotes bleibt zusammen
  const q = ds._parseCsv('"a";"b"\n"x; y";"z"');
  ok(q && q.rows.length === 1 && q.rows[0].a === 'x; y', 'gequotetes Feld mit Semikolon bleibt intakt');
  // Escaped Quote ("") wird zu einem "
  const e = ds._parseCsv('"a";"b"\n"sag ""hallo""";"1"');
  ok(e && e.rows[0].a === 'sag "hallo"', 'doppelte Quotes "" → ein "');
  // XML/JSON ist KEINE CSV
  ok(ds._parseCsv('<?xml version="1.0"?><x/>') === null, 'XML → kein CSV (null)');
  ok(ds._parseCsv('[{"a":1}]') === null, 'JSON → kein CSV (null)');
}
console.log('■ _stripHtml — HTML aus Beschreibung');
ok(ds._stripHtml('<b>Sigma</b>&nbsp;UP') === 'Sigma UP', 'Tags + &nbsp; entfernt');

console.log('\n' + pass + '/' + (pass + fail) + ' Checks grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
