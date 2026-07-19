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
console.log('■ _mapEinheit — IGH/UN-ECE-Codes → GEMA-Einheiten');
ok(ds._mapEinheit('PCE') === 'Stk', 'PCE → Stk');
ok(ds._mapEinheit('pce') === 'Stk', 'pce (klein) → Stk');
ok(ds._mapEinheit('MTQ') === 'm³' && ds._mapEinheit('MTK') === 'm²' && ds._mapEinheit('LTR') === 'l', 'MTQ/MTK/LTR → m³/m²/l');
ok(ds._mapEinheit('Stk') === 'Stk', 'bereits-GEMA bleibt (idempotent)');
ok(ds._mapEinheit('Kartons') === 'Kartons', 'unbekannte Einheit unverändert durchgereicht');
{
  const a = ds._normArtikel({ Produktcode: 'X', Produktname: 'Y', Verkaufspreis: '5', Einheit: 'PCE' });
  ok(a.einheit === 'Stk', 'bexio-CSV Einheit «PCE» → «Stk» im normalisierten Artikel');
}

console.log('■ bezeichnungLang — Kurz- (Produktname) vs. Langtext (Produktbeschreibung)');
{
  const a = ds._normArtikel({ Produktcode: 'A', Produktname: 'Duschwanne Kaldewei 80x90', Produktbeschreibung: 'Duschwanne Kaldewei Duschplan 80 x 90 x 6,5 cm, Stahl, emailliert, mit Schallisolierung\nAF: Pergamon/AFZ: Gleitschutz Antislip', Verkaufspreis: '1222' });
  ok(a.bezeichnung === 'Duschwanne Kaldewei 80x90', 'bezeichnung = Kurztext (Produktname)');
  ok(a.bezeichnungLang.indexOf('emailliert') >= 0, 'bezeichnungLang = ausführliche Beschreibung');
  ok(a.bezeichnungLang.indexOf('AF:') < 0, 'AF/AFZ-Zeile aus dem Langtext entfernt (steckt in ausfuehrung)');
  ok(a.ausfuehrung === 'Pergamon · Gleitschutz Antislip', 'ausfuehrung weiterhin aus AF/AFZ');
}
ok(ds._normArtikel({ Produktcode: 'B', Produktname: 'WC-Sitz', Verkaufspreis: '50' }).bezeichnungLang === '', 'ohne Langbeschreibung → bezeichnungLang leer');
{
  // HTML-Beschreibung (bexio liefert teils HTML): AF/AFZ-Zeile muss AUCH dann aus
  // bezeichnungLang verschwinden, wenn <br>/kollabierte Newlines das «AF:» in die
  // Zeilenmitte schieben (Review-Befund: sonst Roh-Marker im Insert + Doppelung).
  const a = ds._normArtikel({ Produktcode: 'C', Produktname: 'Duschwanne', Produktbeschreibung: 'Duschwanne Kaldewei<br>Stahl emailliert<br>AF: Weiss/AFZ: Gleitschutz Antislip', Verkaufspreis: '999' });
  ok(a.bezeichnungLang.indexOf('AF:') < 0 && a.bezeichnungLang.indexOf('AFZ:') < 0, 'HTML-Beschreibung: AF/AFZ-Marker aus bezeichnungLang entfernt');
  ok(a.bezeichnungLang.indexOf('emailliert') >= 0, 'HTML-Beschreibung: Inhalt (emailliert) bleibt');
  ok(a.ausfuehrung === 'Weiss · Gleitschutz Antislip', 'HTML-Beschreibung: ausfuehrung korrekt extrahiert');
}
{
  // Kein AF/AFZ → Langtext bleibt vollständig, auch wenn eine Zeile legitim mit «AF»
  // beginnt (nur der echte AF:/AFZ:-Paar-Marker wird geschnitten).
  const a = ds._normArtikel({ Produktcode: 'D', Produktname: 'Pumpe', Produktbeschreibung: 'Pumpe X\nAFP-Modul inklusive\nGewicht 2 kg', Verkaufspreis: '10' });
  ok(a.bezeichnungLang.indexOf('AFP-Modul inklusive') >= 0 && a.bezeichnungLang.indexOf('Gewicht 2 kg') >= 0, 'ohne AF:/AFZ:-Marker wird nichts abgeschnitten (kein Fehlschnitt bei «AFP…»)');
}

console.log('■ _stripHtml — HTML aus Beschreibung');
ok(ds._stripHtml('<b>Sigma</b>&nbsp;UP') === 'Sigma UP', 'Tags + &nbsp; entfernt');

console.log('■ _afAusfuehrung — AF/AFZ aus bexio-Beschreibung');
ok(ds._afAusfuehrung('Duschwanne …\nAF: Pergamon/AFZ: Gleitschutz Antislip') === 'Pergamon · Gleitschutz Antislip', 'AF + AFZ → "Farbe · Oberfläche"');
ok(ds._afAusfuehrung('Duschwanne …\nAF: Manhattan/AFZ: ') === 'Manhattan', 'nur AF (AFZ leer)');
ok(ds._afAusfuehrung('Spülkasten UP ohne Ausführung') === '', 'keine AF-Zeile → leer');
{
  // End-to-End: bexio-CSV mit Ausführung → normArtikel trägt ausfuehrung
  const csv = '"Produktcode";"Produktname";"Produktbeschreibung";"Währung";"Einheit";"Verkaufspreis"\r\n'
    + '"6130#1313116/143/183";"Duschwanne Kaldewei Duschplan/Pergamon";"Duschwanne\nAF: Pergamon/AFZ: Gleitschutz Antislip";"CHF";"PCE";"1222"';
  const rows = ds._parseCsv(csv).rows;
  const a = ds._normArtikel(rows[0]);
  ok(a.ausfuehrung === 'Pergamon · Gleitschutz Antislip', 'CSV-Zeile → ausfuehrung gesetzt');
  ok(a.artnr === '6130#1313116/143/183' && Math.abs(a.preis - 1222) < 1e-6, 'artnr (mit Ausführungscode) + Preis');
}

console.log('■ _xmlUnescape — XML-Entities');
ok(ds._xmlUnescape('G 1 1/2&quot;') === 'G 1 1/2"', '&quot; → "');
ok(ds._xmlUnescape('P&lt;sub&gt;1&lt;/sub&gt;') === 'P<sub>1</sub>', '&lt;/&gt; → </>');
ok(ds._xmlUnescape('a &amp; b') === 'a & b', '&amp; → &');
ok(ds._xmlUnescape('&#39;x&#39; &#x2013;') === "'x' –", 'numerische Refs (dez + hex)');
ok(ds._xmlUnescape('&amp;lt;') === '&lt;', '&amp;lt; bleibt literal (kein Doppel-Unescape)');

console.log('■ _parseDebimXml — DataExpert-BIM (mit Bild-URL)');
{
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DataExpert-BIM><Body><Katalog><Produkte>
<Artikel ArtNr="7000001829">
  <ArtStat>1</ArtStat>
  <TKurz>BIRAL Heizungs-Umwälzpumpe
PrimAX 25-3 180 RED</TKurz>
  <TLang>BIRAL Heizungs-Umwälzpumpe
PrimAX 25-3 180 RED T2
Inkl. Wärmedämmschalen

Hocheffiziente Rohreinbaupumpe
Gewindeanschluss:  G 1 1/2&quot;
Aufnahmeleistung P&lt;sub&gt;1&lt;/sub&gt;: 2-15 W
Bruttogewicht: 2.1 kg</TLang>
  <Menge ISO="PCE" Einh="ST">1</Menge>
  <PreisEig>
    <Pr Typ="1" Preis="426" EAN="7630054958625"/>
  </PreisEig>
  <LinkAdr>
    <Name Typ="1" Code="6" Bez="Produkt URL" Ext="html">https://www.biral.ch/de/7000001829</Name>
    <Name Typ="1" Code="1" Bez="Bild IGH" Ext="png">https://www.biral.ch/fileadmin/Media/images/IGH/PrimAX_RED_T2_s_w_WD.png</Name>
    <Name Typ="1" Code="6" Bez="Datenblatt PDF" Ext="html">https://oxomi.com/p/2025044/catalog/10228650?page=34</Name>
  </LinkAdr>
</Artikel>
</Produkte></Katalog></Body></DataExpert-BIM>`;
  const raw = ds._parseDebimXml(xml);
  ok(Array.isArray(raw) && raw.length === 1, 'ein Artikel geparst');
  const a = ds._normArtikel(raw[0]);
  ok(a.artnr === '7000001829', 'ArtNr → artnr');
  ok(a.bezeichnung === 'BIRAL Heizungs-Umwälzpumpe PrimAX 25-3 180 RED', 'TKurz → bezeichnung (Kurzname, einzeilig)');
  ok(a.einheit === 'Stk', 'Menge ISO «PCE» → «Stk»');
  ok(Math.abs(a.preis - 426) < 1e-6, 'Pr Preis → 426');
  ok(a.ean === '7630054958625', 'Pr EAN → EAN');
  ok(a.bildUrl === 'https://www.biral.ch/fileadmin/Media/images/IGH/PrimAX_RED_T2_s_w_WD.png', 'Bild IGH (Ext=png) → bildUrl');
  ok(a.bildUrl.indexOf('oxomi') < 0 && a.bildUrl.indexOf('/de/') < 0, 'HTML-Links (Produkt-URL/Datenblatt) NICHT als Bild');
  ok(a.bezeichnungLang.indexOf('Hocheffiziente Rohreinbaupumpe') >= 0, 'TLang → bezeichnungLang (ausführlich)');
  ok(a.bezeichnungLang.indexOf('G 1 1/2"') >= 0, 'Entity &quot; im Langtext aufgelöst');
  ok(a.bezeichnungLang.indexOf('P1: 2-15 W') >= 0 && a.bezeichnungLang.indexOf('<sub>') < 0, '<sub>-Tag entfernt, Text erhalten');
  ok(a.bezeichnungLang.indexOf('\n') >= 0, 'Zeilenumbrüche im Langtext ERHALTEN (nicht auf eine Zeile gepresst)');
  // Bild vorhanden → hatBild greift im Handler; hier direkt am Roh-URL prüfbar
  ok(!!a.bildUrl, 'Artikel hat ein Bild → fliesst beim Einfügen in die Position');
}
{
  // End-to-End: XML-Hülle → _extractArray reicht das Array durch → normalisierte Liste
  const xml = '<DataExpert-BIM><Body><Produkte>'
    + '<Artikel ArtNr="A1"><TKurz>Pumpe A</TKurz><Menge ISO="PCE">1</Menge><PreisEig><Pr Preis="10" EAN="111"/></PreisEig></Artikel>'
    + '<Artikel ArtNr="B2"><TKurz>Ventil B</TKurz><Menge ISO="MTR">1</Menge><PreisEig><Pr Preis="20"/></PreisEig></Artikel>'
    + '</Produkte></Body></DataExpert-BIM>';
  const list = ds._extractArray(ds._parseDebimXml(xml)).map(ds._normArtikel);
  ok(list.length === 2 && list[0].artnr === 'A1' && list[1].artnr === 'B2', 'zwei Artikel korrekt extrahiert');
  ok(list[0].einheit === 'Stk' && list[1].einheit === 'm', 'Einheiten pro Artikel (PCE→Stk, MTR→m)');
  ok(list[0].ean === '111' && list[1].ean === '', 'EAN nur wo vorhanden');
  ok(ds._parseDebimXml('<html><body>Login</body></html>') === null, 'Nicht-debim-XML → null (Fallback greift)');
  ok(ds._parseDebimXml('<DataExpert-BIM><Body><Produkte></Produkte></Body></DataExpert-BIM>') === null, 'debim-Hülle ohne Artikel → null (kein Treffer)');
}
{
  // _debimBild — Bild-Auswahl aus <LinkAdr>
  ok(ds._debimBild('<Name Ext="jpg">https://x/a.jpg</Name>') === 'https://x/a.jpg', 'Ext=jpg → Bild');
  ok(ds._debimBild('<Name Ext="html">https://x/p.html</Name><Name Bez="Foto">https://x/f.png</Name>') === 'https://x/f.png', 'Bez «Foto» → Bild (html übersprungen)');
  ok(ds._debimBild('<Name Ext="html">https://x/only.html</Name>') === '', 'nur HTML-Links → kein Bild');
  ok(ds._debimBild('<Name>https://x/img.webp?v=2</Name>') === 'https://x/img.webp?v=2', 'URL-Endung .webp als Fallback erkannt');
}

console.log('■ _parseDebimXml — Ausführungen (AFZ/AFZNr → Varianten mit Farbe/Preis/EAN)');
{
  // Reales debim-Beispiel (Kaldewei Duschwanne): EIN <Artikel> mit 7 Farben (AFZ)
  // à 2 Oberflächen (AFZNr, «» = Standard / «Gleitschutz Antislip») = 14 Varianten.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DataExpert-BIM><Body><Katalog><Produkte>
<Artikel ArtNr="1313116">
  <TKurz>Duschwanne Kaldewei Duschplan, 80 x 90 x 6,5 cm, Stahl, Schallisolierung</TKurz>
  <TLang>Duschwanne Kaldewei Duschplan, 80 x 90 x 6,5 cm, Stahl, Schallisolierung</TLang>
  <Menge ISO="PCE" Einh="Stk.">1</Menge>
  <PreisEig>
    <AFZ AFNr="100" Txt="Weiss">
      <AFZNr Txt="" Typ="1" Preis="806" EAN="4001112310748">0</AFZNr>
      <AFZNr Txt="Gleitschutz Antislip" Typ="1" Preis="981" EAN="4001112306017">183</AFZNr>
    </AFZ>
    <AFZ AFNr="143" Txt="Pergamon">
      <AFZNr Txt="" Typ="1" Preis="1047" EAN="4001112482773">0</AFZNr>
      <AFZNr Txt="Gleitschutz Antislip" Typ="1" Preis="1222" EAN="4001112539774">183</AFZNr>
    </AFZ>
  </PreisEig>
  <LinkAdr><Name Bez="Bild IGH" Ext="png">https://x/duschwanne.png</Name></LinkAdr>
</Artikel>
</Produkte></Katalog></Body></DataExpert-BIM>`;
  const raw = ds._parseDebimXml(xml);
  ok(Array.isArray(raw) && raw.length === 4, '2 Farben × 2 Oberflächen = 4 Varianten-Artikel');
  const list = raw.map(ds._normArtikel);
  // Voll-Code ArtNr/AFNr/Suffix — _dsBaseCode (Teil vor «/») gruppiert sie alle unter «1313116»
  ok(list.every(a => a.artnr.indexOf('1313116/') === 0), 'Voll-Code «1313116/AFNr/Suffix» je Variante');
  ok(list.every(a => a.artnr.split('/')[0] === '1313116'), 'gemeinsamer Basiscode 1313116 (Gruppierung greift)');
  const weissStd = list.find(a => a.artnr === '1313116/100/0');
  const pergAnti = list.find(a => a.artnr === '1313116/143/183');
  ok(weissStd && weissStd.ausfuehrung === 'Weiss' && Math.abs(weissStd.preis - 806) < 1e-6 && weissStd.ean === '4001112310748', 'Weiss Standard: Label/Preis/EAN');
  ok(pergAnti && pergAnti.ausfuehrung === 'Pergamon · Gleitschutz Antislip' && Math.abs(pergAnti.preis - 1222) < 1e-6, 'Pergamon · Gleitschutz Antislip: Label + Preis');
  ok(list.every(a => a.einheit === 'Stk' && a.bezeichnung.indexOf('Duschwanne Kaldewei') === 0), 'Einheit (PCE/Stk.) + gemeinsamer Kurzname pro Variante');
  ok(list.every(a => a.bildUrl === 'https://x/duschwanne.png'), 'Artikel-Bild für alle Ausführungen übernommen');
  ok(list.every(a => a.hersteller !== undefined), 'normalisiert ohne Crash');
}
{
  // _debimVarianten direkt
  const body = '<PreisEig><AFZ AFNr="7" Txt="Chrom"><AFZNr Txt="matt" Preis="50" EAN="111">2</AFZNr></AFZ></PreisEig>';
  const v = ds._debimVarianten(body, '900');
  ok(v.length === 1 && v[0].code === '900/7/2' && v[0].label === 'Chrom · matt' && v[0].preis === '50', '_debimVarianten: Code/Label/Preis');
  // AFZ ohne AFZNr → eine Variante ArtNr/AFNr
  const v2 = ds._debimVarianten('<AFZ AFNr="1" Txt="Weiss" Preis="99" EAN="222"></AFZ>', '800');
  ok(v2.length === 1 && v2[0].code === '800/1' && v2[0].label === 'Weiss' && v2[0].preis === '99', 'AFZ ohne AFZNr → Variante mit AFZ-Preis');
  // debim ohne AFZ (Einzelprodukt) → _debimVarianten leer → <Pr>-Pfad
  ok(ds._debimVarianten('<PreisEig><Pr Preis="10" EAN="1"/></PreisEig>', 'X').length === 0, 'kein AFZ → keine Varianten (Einzelprodukt-Pfad)');
}

console.log('\n' + pass + '/' + (pass + fail) + ' Checks grün' + (fail ? ' — ' + fail + ' FEHLER' : ''));
process.exit(fail ? 1 : 0);
