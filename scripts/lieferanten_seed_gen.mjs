// Generator für den Lieferanten-/Produkt-Seed (supabase/gema_lieferanten_seed_v1.sql).
// EINE Quelle für Records + SQL: `records()` exportiert alle Datensätze
// (auch für den Playwright-Test scripts/lieferanten_seed_test.mjs), `main()`
// validiert die Produkt-Felder gegen die LIVE-Schemata aus
// gema_produktkatalog_api.js, schreibt die SQL-Datei und prüft sie per
// Roundtrip (jede eingebettete jsonb-Literal wird zurückgeparst und
// deep-equal gegen den Quell-Record verglichen).
//
// Datenherkunft: reale Herstellerangaben (Datenblätter/Produktseiten,
// Web-Recherche 07/2026). ALLE Produkte/Armaturen sind bewusst
// status='nicht_verifiziert' — die Lieferanten bestätigen sie im
// Verifizierungs-Workflow des Dashboards (das ist der Testzweck).
// Abgeleitete Werte (aus Kennlinien/Formeln statt Datenblatt-Zahl) sind
// in `besonderheiten` als «abgeleitet» gekennzeichnet.
//
// Aufruf: node scripts/lieferanten_seed_gen.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'gema_lieferanten_seed_v1.sql');

// Fixe Zeitstempel — deterministische Datei (Re-Run erzeugt identisches SQL)
const TS_ISO = '2026-07-14T12:00:00.000Z';
const TS_MS = Date.parse(TS_ISO);

// ═══════════════════════════════════════════════════════════════
// LIEFERANTEN (per-Record: module_key 'produktkatalog', data_key 'lieferant:<id>')
// Adressen nur wo öffentlich bekannt; Rest lassen die Firmen beim
// Verifizieren selbst nach (status 'aktiv' nötig, damit sie in der
// Anlagenwahl/Offertanfrage erscheinen).
// ═══════════════════════════════════════════════════════════════
function lieferant(id, firma, kategorien, opts) {
  opts = opts || {};
  return {
    id: 'lief_seed_' + id,
    orgId: 'org_default',
    firma: firma,
    rechtsform: opts.rechtsform || '',
    uid: '',
    branche: [],
    kontaktPerson: '',
    kontaktPersonen: [],
    email: opts.email || '',
    telefon: opts.telefon || '',
    website: opts.website || '',
    adresse: Object.assign({ strasse: '', plz: '', ort: '', kanton: '', land: 'CH' }, opts.adresse || {}),
    logo: '',
    beschreibung: opts.beschreibung || '',
    status: 'aktiv',
    abo: {
      typ: 'basis', status: 'testphase', startDatum: TS_ISO.slice(0, 10), endDatum: '',
      testphaseEnde: '2026-08-13', zahlungsart: 'rechnung', jahrespreis: 1200, letzteZahlung: '', mahnungen: 0
    },
    premium: { aktiv: false, platzierung: 'none', kategorien: [], badge: '', sortPriority: 0 },
    lieferantKategorien: kategorien,
    erstelltAm: TS_ISO,
    erstelltVon: 'GEMA Seed (Web-Recherche)',
    deaktiviertAm: '', deaktiviertVon: '', deaktiviertGrund: '', letzterLogin: '',
    produkteCount: 0, verifizierteCount: 0
  };
}

const LIEFERANTEN = [
  lieferant('bwt', 'BWT AQUA AG', ['enthaertung', 'osmose'], {
    website: 'https://www.bwt.com/de-ch/', adresse: { strasse: 'Hauptstrasse 192', plz: '4147', ort: 'Aesch', kanton: 'BL' },
    beschreibung: 'Wasseraufbereitung: Enthärtung, Umkehrosmose, Dosiertechnik. Schweizer Niederlassung der BWT-Gruppe.'
  }),
  lieferant('gruenbeck', 'Grünbeck Wasseraufbereitung GmbH', ['enthaertung', 'osmose'], {
    website: 'https://www.gruenbeck.de', adresse: { strasse: 'Josef-Grünbeck-Strasse 1', plz: 'D-89420', ort: 'Höchstädt a. d. Donau', kanton: '', land: 'DE' },
    beschreibung: 'Wasseraufbereitung: Enthärtungsanlagen (softliQ), Umkehrosmose (GENO-OSMO), Dosiertechnik.'
  }),
  lieferant('grundfos', 'Grundfos Pumpen AG', ['druckerhoehung', 'zirkulationspumpe', 'saugpumpe', 'hebeanlage'], {
    website: 'https://www.grundfos.ch', adresse: { strasse: 'Bruggacherstrasse 10', plz: '8117', ort: 'Fällanden', kanton: 'ZH' },
    beschreibung: 'Pumpen und Druckerhöhungsanlagen: Hydro Multi-E, COMFORT-Zirkulation, JP-Jetpumpen, Multilift-Hebeanlagen.'
  }),
  lieferant('wilo', 'Wilo Schweiz AG', ['druckerhoehung', 'zirkulationspumpe'], {
    website: 'https://wilo.com/ch/de/', adresse: { strasse: 'Gerstenweg 7', plz: '4310', ort: 'Rheinfelden', kanton: 'AG' },
    beschreibung: 'Pumpen und Systeme: SiBoost-Druckerhöhung, Stratos PICO-Z Trinkwasser-Zirkulation.'
  }),
  lieferant('ksb', 'KSB (Schweiz) AG', ['druckerhoehung', 'hebeanlage'], {
    website: 'https://www.ksb.com/de-ch', beschreibung: 'Pumpen und Armaturen: Delta-Druckerhöhungsanlagen, mini-Compacta Hebeanlagen.'
  }),
  lieferant('nussbaum', 'R. Nussbaum AG', ['rohrsysteme'], {
    website: 'https://www.nussbaum.ch', adresse: { strasse: 'Martin-Disteli-Strasse 26', plz: '4601', ort: 'Olten', kanton: 'SO' },
    beschreibung: 'Armaturen und Rohrsysteme für die Haustechnik: Optipress-Aquaplus, Optiflex, Easy-Top.'
  }),
  lieferant('geberit', 'Geberit Vertriebs AG', ['rohrsysteme'], {
    website: 'https://www.geberit.ch', adresse: { strasse: 'Schachenstrasse 77', plz: '8645', ort: 'Jona', kanton: 'SG' },
    beschreibung: 'Sanitärtechnik: Versorgungssysteme Mapress und Mepla, Entwässerung.'
  }),
  lieferant('jrg', 'Georg Fischer JRG AG', ['rohrsysteme'], {
    website: 'https://www.gfps.com/ch', adresse: { strasse: 'Hauptstrasse 130', plz: '4450', ort: 'Sissach', kanton: 'BL' },
    beschreibung: 'JRG Sanipex/Sanipex MT Rohrsysteme, JRG LegioStop Armaturen, JRG Coral force.'
  }),
  lieferant('oventrop', 'Oventrop (Schweiz) GmbH', ['frischwasserstation', 'rohrsysteme'], {
    website: 'https://www.oventrop.com', beschreibung: 'Armaturen und Stationen: Regumaq Frischwasserstationen, Aquastrom Zirkulations-Regulierventile.'
  }),
  lieferant('taconova', 'Taconova Group AG', ['frischwasserstation'], {
    website: 'https://www.taconova.com', adresse: { plz: '8902', ort: 'Urdorf', kanton: 'ZH' },
    beschreibung: 'Systemtechnik: TacoTherm Fresh Frischwasserstationen, hydraulischer Abgleich.'
  }),
  lieferant('flamco', 'Flamco AG (Aalberts hydronic)', ['sicherheitsventil'], {
    website: 'https://flamcogroup.com', beschreibung: 'Sicherheitstechnik: Prescor Membran-Sicherheitsventile, Ausdehnungsgefässe.'
  }),
  lieferant('imi', 'IMI Hydronic Engineering (Schweiz) AG', ['rohrsysteme'], {
    website: 'https://www.imi-hydronic.com', adresse: { plz: '4414', ort: 'Füllinsdorf', kanton: 'BL' },
    beschreibung: 'Hydraulischer Abgleich und Regulierventile (TA/STAD), Druckhaltung (Pneumatex).'
  }),
  lieferant('gwf', 'GWF MessSysteme AG', ['rohrsysteme'], {
    website: 'https://www.gwf.ch', adresse: { strasse: 'Obergrundstrasse 119', plz: '6005', ort: 'Luzern', kanton: 'LU' },
    beschreibung: 'Wasser-, Wärme- und Gaszähler für die Schweiz (MID-konform).'
  }),
  lieferant('resideo', 'Resideo (Honeywell Home)', ['rohrsysteme'], {
    website: 'https://www.resideo.com/emea', adresse: { land: 'DE' },
    beschreibung: 'Braukmann-Armaturen: Druckminderer (D06F), Filter, Rückflussverhinderer.'
  })
];
const LIEF_BY_KEY = {};
LIEFERANTEN.forEach(l => { LIEF_BY_KEY[l.id.replace('lief_seed_', '')] = l; });

// ═══════════════════════════════════════════════════════════════
// PRODUKTE (per-Record: 'produkt:<id>') — ALLE status 'nicht_verifiziert'
// ═══════════════════════════════════════════════════════════════
let _prodNr = 0;
function produkt(liefKey, kategorie, daten) {
  const l = LIEF_BY_KEY[liefKey];
  if (!l) throw new Error('Unbekannter Lieferant-Key: ' + liefKey);
  _prodNr++;
  return {
    id: 'prod_seed_' + String(_prodNr).padStart(2, '0') + '_' + liefKey + '_' + kategorie,
    kategorie: kategorie,
    lieferantId: l.id,
    lieferantFirma: l.firma,
    daten: daten,
    dokumente: [],
    status: 'nicht_verifiziert',
    quelle: 'admin',
    erstelltVon: 'GEMA Seed (Web-Recherche)',
    erstelltAm: TS_ISO,
    geaendertVon: '', geaendertAm: '', verifiziertVon: '', verifiziertAm: '',
    log: [{ ts: TS_ISO, user: 'GEMA Seed', aktion: 'erstellt', detail: 'Vorerfasst aus öffentlichen Herstellerangaben — bitte prüfen und verifizieren' }]
  };
}

const PRODUKTE = [
  // ── Enthärtung ──
  produkt('bwt', 'enthaertung', {
    serie: 'BWT Perla', modell: 'Duplex', bauweise: 'Parallelschaltung', technologie: 'Ionenaustausch',
    nenndurchfluss: 53, druckverlustQn: 1.0, kapazitaet: 22, haertebereichAus: '0–8 °fH (einstellbar)',
    anschluss: 'DN 32', anschlussTyp: 'Überwurfmutter',
    breite: 400, tiefe: 510, hoehe: 800,
    spannung: '230V/50Hz', ce: true, trinkwasserZugelassen: true,
    besonderheiten: 'Duplex-Anlage (2 Säulen, unterbruchfreier Betrieb). Nenndurchfluss 3.2 m³/h nach DIN EN 14743 (bei 1.0 bar Druckverlust), Betriebsdruck 2–8 bar, Nennkapazität 2×1.1 mol (= 22 m³·°fH). Quelle: BWT Produktdatenblatt.',
    zubehoer: 'Anschluss-Set, AQA Guard Sensor (optional)'
  }),
  produkt('gruenbeck', 'enthaertung', {
    serie: 'softliQ', modell: 'SD21', artikelnr: '189200', bauweise: 'Einzelanlage', technologie: 'Ionenaustausch',
    nenndurchfluss: 35, druckverlustQn: 1.0, kapazitaet: 36, haertebereichAus: 'einstellbar (Verschnitt)',
    anschluss: 'DN 25', anschlussTyp: 'Überwurfmutter',
    breite: 360, tiefe: 430, hoehe: 815, salzvorrat: 35,
    spannung: '230V/50Hz', ce: true, trinkwasserZugelassen: true, dvgwNr: 'DVGW-zertifiziert (softliQ:SD)',
    besonderheiten: 'Nenndurchfluss 2.1 m³/h nach DIN EN 14743, variable Nennkapazität 14–36 m³·°f (1.4–3.6 mol), Betriebsdruck 2–8 bar (empf. 4 bar), Regeneration 20–40 min. Quelle: Grünbeck Produktdatenblatt.',
    zubehoer: 'myGrünbeck-App-Anbindung'
  }),
  // ── Osmose ──
  produkt('bwt', 'osmose', {
    serie: 'PERMAQ pico', modell: '10', bauart: 'Standgerät',
    permeatleistung: 160, recovery: 80, salzrueckhaltung: 99, feedDruckMin: 2.5, feedDruckMax: 6.0,
    breite: 450, tiefe: 550, hoehe: 1350,
    spannung: '400V/50Hz', ce: true,
    besonderheiten: 'Kompakt-Umkehrosmose, Serie PERMAQ pico 10–90 (160–2800 l/h). Ausbeute (WCF) ca. 80 %, Salzrückhaltung >99 %. Abmessungen ab Datenblatt prüfen. Quelle: BWT Produktdatenblatt PERMAQ pico.'
  }),
  produkt('gruenbeck', 'osmose', {
    serie: 'GENO-OSMO-X', modell: '400', bauart: 'Industrieanlage',
    permeatleistung: 400, recovery: 80, feedDruckMin: 4.0, feedDruckMax: 8.0,
    breite: 700, tiefe: 750, hoehe: 1700,
    spannung: '400V/50Hz', ce: true,
    besonderheiten: 'Rahmenmodulsystem, Permeatleistung 400 l/h bei 15 °C Speisewasser, Ausbeute bis 80 %, Zulauffliessdruck 4–8 bar. Abmessungen ab Datenblatt prüfen. Quelle: Grünbeck Produktdatenblatt GENO-OSMO-X.'
  }),
  // ── Druckerhöhung ──
  produkt('grundfos', 'druckerhoehung', {
    serie: 'Hydro Multi-E', modell: '2 CME3-5', bauart: 'VFD (Frequenzgeregelt)',
    pumpenAnzahl: 2, volumenstromMax: 2.8, druckMax: 4.8,
    anschlussSaug: 'DN 50', anschlussDruck: 'DN 50',
    spannung: '400V/50Hz', steuerung: 'CU 352 / integrierte FU je Pumpe',
    ce: true,
    besonderheiten: '2 parallel geschaltete, drehzahlgeregelte CME3-5 Pumpen auf Edelstahl-Grundrahmen. Q max ca. 2.8 l/s und p max ca. 4.8 bar aus Kennlinie abgeleitet — ab Datenblatt/Auslegungstool prüfen. Quelle: Grundfos Datenheft Hydro Multi-E.'
  }),
  produkt('wilo', 'druckerhoehung', {
    serie: 'SiBoost Smart', modell: '2 Helix VE 604', bauart: 'VFD (Frequenzgeregelt)',
    pumpenAnzahl: 2, volumenstromMax: 5.5, druckMax: 4.2, motorleistung: 0.75,
    anschlussSaug: 'DN 50', anschlussDruck: 'DN 50',
    spannung: '400V/50Hz', steuerung: 'SCe-Regelgerät, FU je Pumpe',
    ce: true,
    besonderheiten: '2 normalsaugende Edelstahl-Hochdruckkreiselpumpen Helix VE 604 (je 0.75 kW), Anschluss R 2. Q max / p max aus Kennlinie abgeleitet — ab Wilo-Select prüfen. Quelle: Wilo-Katalog SiBoost Smart Helix VE.'
  }),
  produkt('ksb', 'druckerhoehung', {
    serie: 'DeltaBasic Compact', modell: 'MVP 2 C06/06', artikelnr: '48281303', bauart: 'VFD (Frequenzgeregelt)',
    pumpenAnzahl: 2, volumenstromMax: 3.3, druckMax: 5.8, motorleistung: 1.5,
    anschlussSaug: 'DN 40', anschlussDruck: 'DN 40',
    spannung: '400V/50Hz', steuerung: 'Delta-Steuerung, drehzahlgeregelt',
    ce: true,
    besonderheiten: 'Kompakt-Druckerhöhungsanlage mit 2 Pumpen Comeo C06/06 (je 1.5 kW), Betriebsdruck bis 10 bar, Anschluss G 1½. Q max / Enddruck aus Baureihe abgeleitet — ab KSB-Baureihenheft prüfen.'
  }),
  // ── Zirkulationspumpen (Trinkwarmwasser) ──
  produkt('grundfos', 'zirkulationspumpe', {
    serie: 'COMFORT', modell: '15-14 BX PM', artikelnr: '97989266', regelungsart: 'Konstantdrehzahl',
    foerderhoeheMax: 140, volumenstromMax: 330, medienTempMax: 70, leistungMax: 7,
    anschluss: 'DN 15', einbaulaenge: 140, rvIntegriert: true, absperrungIntegriert: true,
    spannung: '230V/50Hz', ce: true,
    besonderheiten: 'Trinkwarmwasser-Zirkulationspumpe mit Permanentmagnet-Motor, Messing-Gehäuse, PN 10. Förderhöhe max. 1.4 m (≈140 mbar), Q max 0.33 m³/h, Einbaulänge 140 mm, G 1. Quelle: Grundfos Datenheft COMFORT.'
  }),
  produkt('wilo', 'zirkulationspumpe', {
    serie: 'Stratos PICO-Z', modell: '20/1-6', artikelnr: '4216471', regelungsart: 'Drehzahlgeregelt (Δp variabel)',
    foerderhoeheMax: 600, volumenstromMax: 3500, medienTempMax: 70, leistungMax: 45,
    anschluss: 'DN 20', einbaulaenge: 150,
    spannung: '230V/50Hz', schutzart: 'IPX4D', ce: true,
    besonderheiten: 'Hocheffizienz-Zirkulationspumpe für Trinkwasser (Gehäuse Edelstahl 1.4409), Rp ¾, Verschraubung G 1¼, PN 10, Medium +2…+70 °C, 45 W. Förderhöhe 1–6 m; Q max aus Kennlinie abgeleitet. Quelle: Wilo-Katalog Stratos PICO-Z.'
  }),
  // ── Saugpumpe ──
  produkt('grundfos', 'saugpumpe', {
    serie: 'JP', modell: '5-48', artikelnr: '99458769', bauart: 'Jetpumpe (Ejektorpumpe)',
    npsh: 1.5, maxSaughoehe: 8, foerdermenge: 5.0, foerderhoehe: 48, medienTempMax: 40,
    anschluss: 'G 1', spannung: '230 V', ce: true,
    besonderheiten: 'Selbstansaugende einstufige Jetpumpe, Pumpenkörper Edelstahl, max. Saughöhe 8 m, H max 48 m, Q max 5 m³/h, P1 1.49 kW, max. 6 bar. NPSH-Wert aus Saughöhen-Angabe abgeleitet — ab Kennlinie prüfen. Quelle: Grundfos Produktseite JP 5-48.'
  }),
  // ── Sicherheitsventile ──
  produkt('flamco', 'sicherheitsventil', {
    serie: 'Prescor B', modell: '¾" — 6.0 bar', artikelnr: '27110', bauart: 'Membran-Sicherheitsventil',
    ansprechdruck: 6.0, abblaseleistung: 150, medienTempMax: 95,
    anschluss: 'DN 20 (¾")', austritt: 'Rp 1',
    ce: true,
    besonderheiten: 'Membran-Sicherheitsventil für geschlossene Trinkwassererwärmer nach DIN 4753-1, Eintritt Rp ¾ / Austritt Rp 1, Beheizungsleistung max. 150 kW, TÜV-geprüft, Messing. Quelle: Flamco-Katalog Prescor B (Art. 27110).'
  }),
  produkt('flamco', 'sicherheitsventil', {
    serie: 'Prescor B', modell: '½" — 6.0 bar', bauart: 'Membran-Sicherheitsventil',
    ansprechdruck: 6.0, abblaseleistung: 75, medienTempMax: 95,
    anschluss: 'DN 15 (½")', austritt: 'Rp ¾',
    ce: true,
    besonderheiten: 'Membran-Sicherheitsventil für Trinkwassererwärmer nach DIN 4753-1, Beheizungsleistung max. 75 kW (DIN-Zuordnung R ½). Quelle: Flamco-Katalog Prescor B.'
  }),
  // ── Frischwasserstationen ──
  produkt('oventrop', 'frischwasserstation', {
    serie: 'Regumaq', modell: 'X-30', bauart: 'Wandmontage',
    leistungNenn: 105, zapfleistungPeak: 30, twwMax: 70,
    anschlussPrim: 'DN 25', anschlussSek: 'DN 20',
    ce: true,
    besonderheiten: 'Frischwasserstation zur zentralen Trinkwassererwärmung im Durchflussprinzip, Zapfleistung bis 30 l/min, Regler Regtronic RQ. Betriebsdruck primär 6 bar / sekundär 10 bar, max. 120 °C. Leistung ≈105 kW abgeleitet aus 30 l/min bei ΔT 50 K — ab Datenblatt prüfen. Quelle: Oventrop Katalog/Anleitung Regumaq X-30.'
  }),
  produkt('taconova', 'frischwasserstation', {
    serie: 'TacoTherm Fresh', modell: 'Peta2 X', bauart: 'Kaskade',
    leistungNenn: 340, zapfleistungPeak: 98, twwMax: 65,
    anschlussPrim: 'DN 32', anschlussSek: 'DN 32',
    ce: true,
    besonderheiten: 'Grosse Frischwasserstation, Zapfleistung 98.5 l/min bei Heizwasser 70/60 °C und 200 mbar Restförderhöhe, kaskadierbar. Nennleistung ≈340 kW abgeleitet aus Zapfleistung bei ΔT 50 K — ab Datenblatt prüfen. Quelle: Taconova Produktangaben TacoTherm Fresh.'
  }),
  // ── Hebeanlagen ──
  produkt('grundfos', 'hebeanlage', {
    serie: 'Multilift', modell: 'MSS.11.1.2', artikelnr: '97901037', einsatz: 'Fäkalienhaltig',
    foerdermenge: 5.5, foerderhoehe: 4.1, freikugel: 40, motorleistung: 1.1,
    pumpenAnzahl: 1, redundanz: 'Keine', pumpentyp: 'Wirbel',
    behaelterVolumen: 44, behaelterMaterial: 'PE', zulaufDN: 'DN 100', druckleitungDN: 'DN 100',
    breite: 600, tiefe: 450, hoehe: 650,
    spannung: '230V/50Hz', steuerung: 'Niveauschaltung integriert',
    enNorm: 'EN 12050-1', ce: true,
    besonderheiten: 'Fäkalienhebeanlage mit Vortex-Laufrad (Feststoffe bis 40 mm), Nennförderstrom 5.5 l/s bei 4.1 m (Q max 8.6 l/s), Sammelbehälter 44 l (LDPE), Zulauf DN 100/DN 50 seitlich. Abmessungen ab Datenblatt prüfen. Quelle: Grundfos Produktseite Multilift MSS.'
  }),
  produkt('ksb', 'hebeanlage', {
    serie: 'mini-Compacta', modell: 'U1.60 E', artikelnr: '29131501', einsatz: 'Fäkalienhaltig',
    foerdermenge: 7.3, foerderhoehe: 11.9, freikugel: 40, motorleistung: 1.1,
    pumpenAnzahl: 1, redundanz: 'Keine', pumpentyp: 'Freistromrad',
    behaelterVolumen: 60, behaelterMaterial: 'PE', zulaufDN: 'DN 100', druckleitungDN: 'DN 80',
    breite: 510, tiefe: 510, hoehe: 600,
    spannung: '230V/50Hz', steuerung: 'Niveausteuerung integriert',
    enNorm: 'EN 12050-1', ce: true,
    besonderheiten: 'Überflutbare Fäkalienhebeanlage nach EN 12050-1, Q max 440 l/min (7.3 l/s), H max 11.9 m, Behälter 60 l, Stellfläche 510×510 mm, Feststoffe bis 40 mm. Höhe/Motorleistung ab Baureihenheft prüfen. Quelle: KSB Baureihenheft mini-Compacta.'
  }),
  // ── Rohrsysteme ──
  produkt('nussbaum', 'rohrsystem', {
    serie: 'Optipress-Aquaplus', modell: 'Edelstahl-Presssystem', material: 'Edelstahl 1.4521 (Systemrohr)',
    rauhigkeit: 0.0015, dimensionen: 'Ø 15 / 18 / 22 / 28 / 35 / 42 / 54 / 64 / 76.1 / 88.9 / 108 mm',
    druckbereich: 'PN 16', tempBereich: 'Trinkwasser kalt/warm (bis 95 °C Systemangabe)',
    zulassungen: 'SVGW (mit Optipress-Aquaplus-Fittings)', svgw: true
  }),
  produkt('geberit', 'rohrsystem', {
    serie: 'Geberit Mapress', modell: 'Edelstahl', material: 'Edelstahl 1.4401',
    rauhigkeit: 0.0015, dimensionen: 'Ø 12 / 15 / 18 / 22 / 28 / 35 / 42 / 54 / 76.1 / 88.9 / 108 mm',
    druckbereich: 'PN 16', tempBereich: 'Trinkwasser kalt/warm',
    zulassungen: 'SVGW', svgw: true
  }),
  produkt('geberit', 'rohrsystem', {
    serie: 'Geberit Mepla', modell: 'Verbundrohr', material: 'Mehrschichtverbund PE-Xb/Al/PE',
    rauhigkeit: 0.007, dimensionen: 'Ø 16 / 20 / 26 / 32 / 40 / 50 / 63 / 75 mm',
    druckbereich: 'PN 10', tempBereich: 'bis 70 °C (Betrieb), kurzzeitig höher',
    zulassungen: 'SVGW', svgw: true
  }),
  produkt('jrg', 'rohrsystem', {
    serie: 'JRG Sanipex MT', modell: 'Mehrschichtverbund-System', material: 'Mehrschichtverbund PE-X/Al/PE',
    rauhigkeit: 0.007, dimensionen: 'Ø 16 / 20 / 26 / 32 / 40 / 50 / 63 mm',
    druckbereich: 'PN 10', tempBereich: 'bis 70 °C (Betrieb)',
    zulassungen: 'SVGW', svgw: true
  }),
  // ── Armaturen (Produktkatalog — Rechenwerte stehen zusätzlich im Armaturen-Katalog arm:) ──
  produkt('nussbaum', 'armaturen', {
    serie: 'Easy-Top', modell: 'Schrägsitzventil Optipress', armaturTyp: 'Schrägsitzventil',
    dn: 'DN 15–50 (Ø 15–54 mm)', zetaWerte: 'ζ je Dimension: 15: 2.3 · 18: 2.1 · 22: 1.7 · 28: 1.4 · 35: 1.2 · 42: 1.6 · 54: 1.5 (siehe Armaturen-Katalog)',
    werkstoff: 'Rotguss/Edelstahl', svgw: true
  }),
  produkt('jrg', 'armaturen', {
    serie: 'JRG LegioStop', modell: 'Schrägsitzventil Sanipex MT', armaturTyp: 'Schrägsitzventil',
    dn: 'DN 16–63 (Sanipex MT)', zetaWerte: 'ζ je Dimension: 16: 2.1 · 20: 2.1 · 26: 1.7 · 32: 1.5 · 40: 1.4 · 50: 1.6 · 63: 1.4 (siehe Armaturen-Katalog)',
    werkstoff: 'Rotguss, Kolbenschieber-Prinzip (totraumarm)', svgw: true
  }),
  produkt('gwf', 'armaturen', {
    serie: 'GWF Hauswasserzähler', modell: 'Q3 4 / DN 20', armaturTyp: 'Wasserzähler',
    dn: 'DN 20', kvs: 5.0, druckbereich: 'PN 16',
    zetaWerte: 'kvs ≈ 5.0 m³/h abgeleitet aus Δp 0.63 bar bei Q3 = 4 m³/h (ISO 4064)',
    werkstoff: 'Messing', svgw: true
  }),
  produkt('oventrop', 'armaturen', {
    serie: 'Aquastrom T plus', modell: 'Thermisches Zirkulations-Regulierventil', armaturTyp: 'Schrägsitzventil',
    dn: 'DN 15 / 20 / 25', tempBereich: 'Regelbereich 50–60 °C (thermisch)',
    zetaWerte: 'kvs temperaturabhängig (thermische Regelung) — Datenblatt-Werte vom Lieferanten zu ergänzen',
    werkstoff: 'Rotguss', svgw: false
  }),
  produkt('imi', 'armaturen', {
    serie: 'TA STAD', modell: 'Strangregulierventil', armaturTyp: 'Geradsitzventil',
    dn: 'DN 10–50', zetaWerte: 'kvs voll offen (4 Umdr.): 10: 1.36 · 15: 2.56 · 20: 5.39 · 25: 8.59 · 32: 14.2 · 40: 19.3 · 50: 32.3 (siehe Armaturen-Katalog)',
    druckbereich: 'PN 20', tempBereich: '−20…+120 °C', werkstoff: 'AMETAL (Rotguss)', svgw: false
  })
];

// ═══════════════════════════════════════════════════════════════
// ARMATUREN-KATALOG (per-Record: module_key 'armaturen', 'arm:<id>')
// Rechenwerte ζ/kvs für die Druckverlust-Module. Pool-Records ergänzen
// die GEMA-Defaults; getForLieferant matcht via lieferantId ODER Firma.
// ═══════════════════════════════════════════════════════════════
const ARMATUREN = [
  {
    id: 'arm_seed_d06f', typ: 'druckminderer', name: 'Druckminderer D06F (kvs)', hersteller: 'Resideo (Honeywell Home)',
    serie: 'Braukmann D06F', lieferantId: 'lief_seed_resideo', status: 'nicht_verifiziert',
    zeta: {}, kvs: { 15: 2.4, 20: 3.1, 25: 5.8, 32: 5.9, 40: 12.6, 50: 12 }, zetaDefault: 6.0
  },
  {
    id: 'arm_seed_stad', typ: 'regulierventil', name: 'Strangregulierventil TA STAD (voll offen)', hersteller: 'IMI Hydronic Engineering (Schweiz) AG',
    serie: 'TA STAD', lieferantId: 'lief_seed_imi', status: 'nicht_verifiziert',
    zeta: {}, kvs: { 10: 1.36, 15: 2.56, 20: 5.39, 25: 8.59, 32: 14.2, 40: 19.3, 50: 32.3 }, zetaDefault: 4.0
  },
  {
    id: 'arm_seed_gwf_q34', typ: 'wasserzaehler', name: 'Hauswasserzähler Q3 4', hersteller: 'GWF MessSysteme AG',
    serie: 'Q3 4 / DN 20', lieferantId: 'lief_seed_gwf', status: 'nicht_verifiziert',
    zeta: {}, kvs: { 20: 5.0 }, zetaDefault: 4.0
  }
];

// ═══════════════════════════════════════════════════════════════
export function records() {
  const rows = [];
  LIEFERANTEN.forEach(l => rows.push({ module_key: 'produktkatalog', data_key: 'lieferant:' + l.id, data: l }));
  PRODUKTE.forEach(p => rows.push({ module_key: 'produktkatalog', data_key: 'produkt:' + p.id, data: p }));
  ARMATUREN.forEach(a => rows.push({ module_key: 'armaturen', data_key: 'arm:' + a.id, data: a }));
  return rows;
}

// ── Validierung gegen die Live-Schemata aus gema_produktkatalog_api.js ──
function validate() {
  const src = readFileSync(join(ROOT, 'gema_produktkatalog_api.js'), 'utf8');
  const sandbox = { window: { addEventListener() {}, dispatchEvent() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  const fn = new Function('window', 'localStorage', src + '\nreturn window.GemaProdukte;');
  const GP = fn(sandbox.window, sandbox.localStorage);
  const KAT = GP.KATEGORIEN;
  const LIEF_IDS = new Set(GP.LIEF_KATEGORIEN.map(k => k.id));
  const errors = [];

  LIEFERANTEN.forEach(l => {
    (l.lieferantKategorien || []).forEach(k => {
      if (!LIEF_IDS.has(k)) errors.push('Lieferant ' + l.id + ': unbekannte LIEF_KATEGORIE «' + k + '»');
    });
    if (l.status !== 'aktiv') errors.push('Lieferant ' + l.id + ': status muss aktiv sein');
  });

  PRODUKTE.forEach(p => {
    const cat = KAT[p.kategorie];
    if (!cat) { errors.push('Produkt ' + p.id + ': unbekannte Kategorie «' + p.kategorie + '»'); return; }
    const feldIds = new Set(cat.felder.map(f => f.id));
    Object.keys(p.daten).forEach(k => {
      if (!feldIds.has(k)) errors.push('Produkt ' + p.id + ': Feld «' + k + '» existiert nicht im Schema ' + p.kategorie);
    });
    cat.felder.filter(f => f.typ === 'select' && p.daten[f.id] != null && p.daten[f.id] !== '').forEach(f => {
      if (!f.optionen.includes(p.daten[f.id])) errors.push('Produkt ' + p.id + ': «' + p.daten[f.id] + '» keine gültige Option für ' + f.id + ' (' + f.optionen.join('|') + ')');
    });
    if (p.status !== 'nicht_verifiziert') errors.push('Produkt ' + p.id + ': status muss nicht_verifiziert sein');
    if (!LIEFERANTEN.some(l => l.id === p.lieferantId)) errors.push('Produkt ' + p.id + ': lieferantId ' + p.lieferantId + ' fehlt im Seed');
  });

  ARMATUREN.forEach(a => {
    if (a.status !== 'nicht_verifiziert') errors.push('Armatur ' + a.id + ': status muss nicht_verifiziert sein');
    if (a.lieferantId && !LIEFERANTEN.some(l => l.id === a.lieferantId)) errors.push('Armatur ' + a.id + ': lieferantId fehlt im Seed');
  });
  return errors;
}

// ── SQL-Erzeugung (Dollar-Quoting — keine Escape-Fallen) ──
function toSql() {
  const rows = records();
  const lines = [];
  lines.push('-- ═══════════════════════════════════════════════════════════════');
  lines.push('-- GEMA Seed v1: Lieferanten + Produkte + Armaturen-Katalog');
  lines.push('-- Reale Herstellerdaten (Web-Recherche ' + TS_ISO.slice(0, 10) + ') — ALLE Produkte/Armaturen');
  lines.push("-- bewusst status='nicht_verifiziert' (Verifizierungs-Workflow-Test).");
  lines.push('--');
  lines.push('-- AUSFÜHREN: Supabase Dashboard → SQL Editor → dieses File einfügen → Run.');
  lines.push('-- Idempotent: ON CONFLICT DO NOTHING — bereits vorhandene Records');
  lines.push('-- (z.B. inzwischen verifizierte) werden NIE überschrieben.');
  lines.push('-- Erzeugt von scripts/lieferanten_seed_gen.mjs — dort ändern, nicht hier.');
  lines.push('--');
  lines.push('-- Rollback: supabase/gema_lieferanten_seed_rollback.sql');
  lines.push('-- ═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('insert into public.gema_data (module_key, data_key, payload) values');
  const tuples = rows.map(r => {
    const payload = JSON.stringify({ data: r.data, _lm: TS_MS });
    if (payload.indexOf('$j$') >= 0) throw new Error('Dollar-Quote-Kollision in ' + r.data_key);
    return "('" + r.module_key + "', '" + r.data_key + "', $j$" + payload + '$j$::jsonb)';
  });
  lines.push(tuples.join(',\n'));
  lines.push('on conflict (module_key, data_key) do nothing;');
  lines.push('');
  lines.push('-- Kontrolle: sollte ' + rows.length + ' Zeilen liefern');
  lines.push("select module_key, count(*) from public.gema_data where data_key like 'lieferant:lief_seed_%' or data_key like 'produkt:prod_seed_%' or data_key like 'arm:arm_seed_%' group by module_key;");
  return lines.join('\n') + '\n';
}

function toRollbackSql() {
  return [
    '-- Rollback für gema_lieferanten_seed_v1.sql — entfernt NUR die Seed-Records',
    '-- (erkennbar an den festen ID-Präfixen lief_seed_/prod_seed_/arm_seed_).',
    "delete from public.gema_data where module_key = 'produktkatalog' and (data_key like 'lieferant:lief_seed_%' or data_key like 'produkt:prod_seed_%');",
    "delete from public.gema_data where module_key = 'armaturen' and data_key like 'arm:arm_seed_%';",
    ''
  ].join('\n');
}

function main() {
  const errors = validate();
  if (errors.length) {
    console.error('✗ Schema-Validierung fehlgeschlagen:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  const sql = toSql();
  writeFileSync(OUT, sql);
  writeFileSync(join(ROOT, 'supabase', 'gema_lieferanten_seed_rollback.sql'), toRollbackSql());

  // Roundtrip: jede jsonb-Literal aus der geschriebenen Datei zurückparsen
  const written = readFileSync(OUT, 'utf8');
  const lits = [...written.matchAll(/\$j\$(.*?)\$j\$::jsonb/gs)].map(m => JSON.parse(m[1]));
  const rows = records();
  if (lits.length !== rows.length) throw new Error('Roundtrip: ' + lits.length + ' Literale vs ' + rows.length + ' Records');
  rows.forEach((r, i) => {
    if (JSON.stringify(lits[i].data) !== JSON.stringify(r.data)) throw new Error('Roundtrip-Diff bei ' + r.data_key);
  });
  const stats = { lieferanten: LIEFERANTEN.length, produkte: PRODUKTE.length, armaturen: ARMATUREN.length };
  console.log('✓ Validierung ok, Roundtrip ok —', JSON.stringify(stats));
  console.log('✓ geschrieben:', OUT);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
