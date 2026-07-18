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

console.log('\n' + pass + '/' + (pass + fail) + ' Checks grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
