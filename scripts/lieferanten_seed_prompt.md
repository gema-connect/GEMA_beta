# Auftrag: Reale Lieferanten-/Produktdaten für GEMA recherchieren

Du recherchierst **reale, belegbare Herstellerdaten** (Datenblätter, offizielle Produktseiten) für den GEMA-Produktkatalog (Schweizer Sanitär-/Haustechnik-Software). Antworte am Ende **NUR mit EINEM JSON-Codeblock** im unten definierten Format — kein SQL, keine Tabellen, kein Text ausserhalb des Codeblocks (kurze Quellenliste davor ist ok).

## Regeln (WICHTIG)
- **Nichts erfinden.** Nur Werte, die du in Datenblättern/Produktseiten belegen kannst. Fehlende Werte: Feld einfach WEGLASSEN.
- Aus Kennlinien/Formeln **abgeleitete** Werte sind erlaubt, aber im Feld `besonderheiten` als «abgeleitet — ab Datenblatt prüfen» zu kennzeichnen.
- Pro Produkt in `besonderheiten` eine Kurzbeschreibung + **«Quelle: …»** (Dokument-/Seitenname).
- Zahlenfelder: **reine Zahl mit Punkt als Dezimaltrenner**, OHNE Einheit (die Einheit steht im Schema). Checkboxen: true/false.
- `select`-Felder: **EXAKT** eine der erlaubten Optionen (Zeichen für Zeichen).
- Modellnamen exakt wie beim Hersteller (inkl. Artikelnummer, wo bekannt). `serie` + `modell` werden in GEMA hintereinander angezeigt — Serie im Modell nicht wiederholen.
- Texte in Schweizer Hochdeutsch (kein ß).
- Der Status wird automatisch auf «nicht verifiziert» gesetzt — der Lieferant bestätigt die Daten später selbst.

## JSON-Format
```json
{
  "lieferanten": [
    {
      "key": "kurzname",
      "firma": "Firma AG",
      "kategorien": [
        "enthaertung"
      ],
      "website": "https://…",
      "beschreibung": "Kurzbeschrieb",
      "adresse": {
        "strasse": "",
        "plz": "",
        "ort": "",
        "kanton": "",
        "land": "CH"
      }
    }
  ],
  "produkte": [
    {
      "lieferant": "kurzname",
      "kategorie": "enthaertung",
      "daten": {
        "serie": "…",
        "modell": "…",
        "nenndurchfluss": 53,
        "ce": true,
        "besonderheiten": "… Quelle: …"
      }
    }
  ],
  "armaturen": [
    {
      "lieferant": "kurzname",
      "typ": "druckminderer",
      "name": "Anzeigename",
      "serie": "…",
      "kvs": {
        "15": 2.4,
        "20": 3.1
      },
      "zeta": {},
      "zetaDefault": 8
    }
  ]
}
```
- `lieferanten` nur für Firmen, die es in GEMA noch nicht gibt. **Bestehende Keys** (direkt referenzierbar): bwt, flamco, geberit, gruenbeck, grundfos, gwf, imi, jrg, ksb, nussbaum, oventrop, resideo, taconova, wilo.
- `armaturen` = Rechenwerte-Katalog für die Druckverlustberechnung (ζ und/oder kvs **je DN**; kvs wird bevorzugt). Nur wenn du echte ζ-/kvs-Werte je Dimension hast.

## Lieferanten-Kategorien (`kategorien`)
- `enthaertung` — Enthärtungsanlagen
- `osmose` — Umkehrosmoseanlagen
- `druckerhoehung` — Druckerhöhungsanlagen
- `zirkulationspumpe` — Zirkulationspumpen
- `saugpumpe` — Saugpumpen (selbstansaugend)
- `sicherheitsventil` — Sicherheitsventile
- `ausdehnungsgefaess` — Ausdehnungsgefässe (Heizung)
- `heizungspumpe` — Heizungs-Umwälzpumpen
- `waermeerzeuger` — Wärmeerzeuger (WP / Kessel)
- `lueftungsgeraet` — Lüftungsgeräte / Monoblocs
- `fluessiggasanlage` — Flüssiggas-Versorgungsanlagen (LPG)
- `gasloeschanlage` — Gaslöschanlagen (N2 / Novec / Inertgas)
- `fettabscheider` — Fettabscheider
- `oelabscheider` — Ölabscheider
- `schlammsammler` — Schlammsammler
- `hebeanlage` — Abwasserhebeanlage
- `frischwasserstation` — Frischwasserstation
- `thermische_solaranlage` — Solaranlagen
- `werkzeuge` — Werkzeuge / Maschinen / Leitern
- `elektropruefung` — Elektroprüfung (NIV/NIN)
- `leiterpruefung` — Leiterprüfung (EKAS)
- `servicepruefung` — Service / Wartung
- `fahrzeuge` — Garagist / Fahrzeugmanagement
- `rohrsysteme` — Rohrsysteme & Armaturen

## Armaturen-Typen (`armaturen[].typ`)
`schraeg` (Schrägsitzventile) · `gerad` (Geradsitzventile) · `kugelhahn` (Kugelhähne) · `absperrschieber` (Absperrschieber) · `rueckschlag` (Rückschlagventile) · `druckminderer` (Druckminderer) · `wasserzaehler` (Wasserzähler) · `filter` (Filter / Schmutzfänger) · `regulierventil` (Regulierventile) · `sonstige` (Sonstige)

## Produkt-Kategorien und ihre Felder (`produkte[].daten`)
Nur diese Feld-IDs sind erlaubt (pro Kategorie). ✱ = Pflichtfeld (wenn beschaffbar).

### `enthaertung` — Enthärtungsanlage
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauweise` ✱ | Bauweise | select |  | Parallelschaltung \| Einzelanlage \| Pendelanlage \| Kabinettanlage |
| `technologie` ✱ | Technologie | select |  | Ionenaustausch \| Nanofiltration \| Physikalisch |
| `nenndurchfluss` ✱ | Nenndurchfluss | number | l/min |  |
| `spitzendurchfluss` | Spitzendurchfluss | number | l/min |  |
| `druckverlustQn` ✱ | Druckverlust bei Qn | number | bar |  |
| `druckverlustSpitze` | Druckverlust bei Spitze | number | bar |  |
| `kapazitaet` ✱ | Enthärtungskapazität | number | m³·°fH |  |
| `salzProRegeneration` | Salzverbrauch pro Regeneration | number | kg |  |
| `personenMax` | Max. Personenanzahl | number | Pers. |  |
| `haertebereichEin` | Eingangshärte max. | number | °fH |  |
| `haertebereichAus` | Ausgangshärte einstellbar | text | °fH |  |
| `anschluss` ✱ | Anschlussgrösse | select |  | DN 20 \| DN 25 \| DN 32 \| DN 40 \| DN 50 \| DN 65 \| DN 80 \| DN 100 |
| `anschlussTyp` | Anschlusstyp | select |  | Überwurfmutter \| Flansch \| Klemme \| Löt \| Press |
| `abwasserAnschluss` | Abwasseranschluss | text | mm |  |
| `ueberlauf` | Überlaufanschluss | text | mm |  |
| `breite` ✱ | Breite | number | mm |  |
| `tiefe` ✱ | Tiefe | number | mm |  |
| `hoehe` ✱ | Höhe | number | mm |  |
| `gewichtLeer` | Gewicht leer | number | kg |  |
| `gewichtBetrieb` | Gewicht Betrieb | number | kg |  |
| `salzverbrauch` | Salzverbrauch / Regeneration | number | kg |  |
| `wasserverbrauch` | Wasserverbrauch / Regeneration | number | l |  |
| `regenerationsdauer` | Regenerationsdauer | number | min |  |
| `salzvorrat` | Salzvorrat max. | number | kg |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz \| 12V DC |
| `leistung` | Leistungsaufnahme | number | W |  |
| `schutzart` | Schutzart | text |  |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `dvgwNr` | DVGW-Zulassungsnummer | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `trinkwasserZugelassen` | Trinkwasser zugelassen | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |
| `zubehoer` | Zubehör (inkl.) | textarea |  |  |
| `optionen` | Optionales Zubehör | textarea |  |  |

### `osmose` — Osmoseanlage
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Untertisch \| Standgerät \| Wandmontage \| Industrieanlage |
| `permeatleistung` ✱ | Permeatleistung | number | l/h |  |
| `recovery` ✱ | Recovery / Ausbeute | number | % |  |
| `salzrueckhaltung` | Salzrückhaltung | number | % |  |
| `feedDruckMin` | Feed-Druck min. | number | bar |  |
| `feedDruckMax` | Feed-Druck max. | number | bar |  |
| `druckverlust` | Druckverlust | number | bar |  |
| `membranAnzahl` | Anzahl Membranen | number |  |  |
| `membranTyp` | Membrantyp | text |  |  |
| `membranFlaeche` | Membranfläche gesamt | number | m² |  |
| `membranStandzeit` | Standzeit Membran | text | Jahre |  |
| `anschlussFeed` | Feed-Anschluss | select |  | DN 15 \| DN 20 \| DN 25 \| DN 32 \| DN 40 \| DN 50 |
| `anschlussPermeat` | Permeat-Anschluss | select |  | DN 15 \| DN 20 \| DN 25 \| DN 32 |
| `anschlussKonzentrat` | Konzentrat-Anschluss | select |  | DN 15 \| DN 20 \| DN 25 \| DN 32 |
| `breite` ✱ | Breite | number | mm |  |
| `tiefe` ✱ | Tiefe | number | mm |  |
| `hoehe` ✱ | Höhe | number | mm |  |
| `gewicht` | Gewicht | number | kg |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `leistung` | Leistungsaufnahme | number | W |  |
| `pumpenleistung` | Pumpenleistung | number | W |  |
| `schutzart` | Schutzart | text |  |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `trinkwasserZugelassen` | Trinkwasser zugelassen | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |
| `zubehoer` | Zubehör (inkl.) | textarea |  |  |

### `hebeanlage` — Abwasserhebeanlage
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `einsatz` ✱ | Einsatzbereich | select |  | Fäkalienfrei \| Fäkalienhaltig \| Schwarzwasser \| Regenwasser |
| `foerdermenge` ✱ | Fördermenge | number | l/s |  |
| `foerderhoehe` ✱ | Förderhöhe | number | m |  |
| `freikugel` ✱ | Freikugeldurchgang | number | mm |  |
| `motorleistung` | Motorleistung | number | kW |  |
| `pumpenAnzahl` ✱ | Anzahl Pumpen | number |  |  |
| `redundanz` | Redundanz | select |  | Keine \| 1+1 Reserve \| 2+1 Reserve |
| `pumpentyp` | Pumpentyp | select |  | Schneidradpumpe \| Freistromrad \| Kanalrad \| Wirbel |
| `behaelterVolumen` ✱ | Behältervolumen | number | l |  |
| `behaelterMaterial` | Material | select |  | PE \| GFK \| Edelstahl \| Beton |
| `zulaufDN` | Zulauf DN | select |  | DN 50 \| DN 65 \| DN 80 \| DN 100 \| DN 125 \| DN 150 |
| `druckleitungDN` | Druckleitung DN | select |  | DN 32 \| DN 40 \| DN 50 \| DN 65 \| DN 80 \| DN 100 |
| `breite` ✱ | Breite | number | mm |  |
| `tiefe` ✱ | Tiefe | number | mm |  |
| `hoehe` ✱ | Höhe | number | mm |  |
| `gewicht` | Gewicht | number | kg |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `leistung` | Leistungsaufnahme | number | W |  |
| `schutzart` | Schutzart | text |  |  |
| `steuerung` | Steuerung | text |  |  |
| `enNorm` | EN-Norm | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |
| `zubehoer` | Zubehör (inkl.) | textarea |  |  |

### `zirkulation` — Zirkulationspumpe
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `pumpenart` ✱ | Pumpenart | select |  | Nassläufer \| Trockenläufer \| Inline \| Blockpumpe |
| `foerdermenge` ✱ | Fördermenge max. | number | l/h |  |
| `foerderhoehe` ✱ | Förderhöhe max. | number | m |  |
| `leistung` ✱ | Leistungsaufnahme | number | W |  |
| `tempMax` | Max. Medientemperatur | number | °C |  |
| `druckMax` | Max. Betriebsdruck | number | bar |  |
| `drehzahlregelung` | Drehzahlregelung | select |  | Keine \| Stufenschaltung \| Stufenlos (EC) \| Autoadapt |
| `betriebsarten` | Betriebsarten | text |  |  |
| `thermDesinfektion` | Therm. Desinfektion | checkbox |  |  |
| `anschluss` ✱ | Anschluss DN | select |  | DN 15 \| DN 20 \| DN 25 \| DN 32 \| DN 40 \| DN 50 |
| `einbaulaenge` | Einbaulänge | number | mm |  |
| `anschlussTyp` | Anschlusstyp | select |  | Verschraubung \| Flansch \| Löt \| Press |
| `breite` | Breite | number | mm |  |
| `hoehe` | Höhe | number | mm |  |
| `gewicht` | Gewicht | number | kg |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `schutzart` | Schutzart | text |  |  |
| `energielabel` | Energielabel (EEI) | text |  |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |
| `zubehoer` | Zubehör (inkl.) | textarea |  |  |

### `rohrsystem` — Rohrsystem
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Systemname / Serie | text |  |  |
| `modell` | Modellbezeichnung | text |  |  |
| `material` | Werkstoff | text |  |  |
| `rauhigkeit` | Rauhigkeit k | number | mm |  |
| `dimensionen` | Verfügbare Dimensionen | textarea |  |  |
| `druckbereich` | Druckbereich | text | bar |  |
| `tempBereich` | Temperaturbereich | text | °C |  |
| `zulassungen` | Zulassungen / Normen | text |  |  |
| `svgw` | SVGW-zugelassen | checkbox |  |  |

### `armaturen` — Armaturen
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` | Modellbezeichnung | text |  |  |
| `armaturTyp` | Armatur-Typ | select |  | Schrägsitzventil \| Geradsitzventil \| Kugelhahn \| Absperrschieber \| Rückschlagventil \| Druckminderer \| Wasserzähler \| Filter |
| `dn` | Verfügbare DN | text |  |  |
| `kvs` | kvs-Wert | number | m³/h |  |
| `zetaWerte` | Zeta-Werte (DN:ζ) | textarea |  |  |
| `druckbereich` | Druckbereich | text | bar |  |
| `tempBereich` | Temperaturbereich | text | °C |  |
| `werkstoff` | Werkstoff Gehäuse | text |  |  |
| `svgw` | SVGW-zugelassen | checkbox |  |  |

### `formstücke` — Formstücke / Fittings
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Bezeichnung | text |  |  |
| `modell` | Modell / Artikelnummer | text |  |  |
| `fittingTyp` | Formstück-Typ | select |  | Bogen 90° \| Bogen 45° \| T-Stück Durchgang \| T-Stück Abzweig \| Reduktion \| Muffe \| Kupplung \| Winkel 90° \| Winkel 45° \| Übergang \| Anschlusswinkel \| Anschlussdose \| Verteiler |
| `rohrsystem` | Kompatibles Rohrsystem | text |  |  |
| `dn` | Verfügbare DN | text |  |  |
| `zetaWerte` | Zeta-Werte (DN:ζ) | textarea |  |  |
| `werkstoff` | Werkstoff | text |  |  |
| `bild` | Produktbild URL | text |  |  |

### `warmwasser_boiler` — Warmwasserspeicher / Boiler
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `beheizung` ✱ | Beheizung | select |  | Elektro \| Wärmepumpe \| Solar \| Gas \| Öl \| Kombi (E+WP) \| Kombi (E+Solar) \| Frischwasserstation |
| `volumen` ✱ | Speichervolumen | number | l |  |
| `leistungElektro` | Elektro-Heizleistung | number | kW |  |
| `leistungWP` | Wärmepumpen-Leistung | number | kW |  |
| `cop` | COP (A15/W55) | number |  |  |
| `tempMax` | Max. Speichertemperatur | number | °C |  |
| `aufheizzeit` | Aufheizzeit (15→55°C) | number | h |  |
| `verlustzahl` | Verlustzahl ζIS (24h) | number | kWh/24h |  |
| `energieklasse` | Energieeffizienzklasse (ErP) | select |  | A+ \| A \| B \| C \| D \| E \| F |
| `register` | Anzahl Wärmetauscher | select |  | 0 \| 1 \| 2 \| 3 |
| `registerFlaeche1` | Fläche WT 1 | number | m² |  |
| `registerFlaeche2` | Fläche WT 2 | number | m² |  |
| `durchmesser` ✱ | Durchmesser (mit Iso) | number | mm |  |
| `hoehe` ✱ | Höhe | number | mm |  |
| `kippmass` | Kippmass | number | mm |  |
| `gewichtLeer` | Gewicht leer | number | kg |  |
| `material` | Behälter-Werkstoff | select |  | Email \| Edelstahl \| Kunststoff \| Stahl beschichtet |
| `isolation` | Isolation | text |  |  |
| `isolationStaerke` | Isolationsstärke | number | mm |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `sia385` | Konform SIA 385/2 | checkbox |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |
| `zubehoer` | Zubehör (inkl.) | textarea |  |  |

### `druckerhoehung` — Druckerhöhungsanlage
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | VFD (Frequenzgeregelt) \| VES (Druckkessel) \| Hybrid |
| `pumpenAnzahl` | Anzahl Pumpen | number |  |  |
| `volumenstromMax` ✱ | Max. Volumenstrom QVZ | number | l/s |  |
| `druckMax` ✱ | Max. Förderdruck | number | bar |  |
| `nachdruckMin` | Min. Nachdruck pN | number | bar |  |
| `motorleistung` | Motorleistung gesamt | number | kW |  |
| `kesselvolumen` | Kesselvolumen (VES) | number | l |  |
| `anschlussSaug` ✱ | Sauganschluss | select |  | DN 25 \| DN 32 \| DN 40 \| DN 50 \| DN 65 \| DN 80 \| DN 100 \| DN 125 \| DN 150 |
| `anschlussDruck` ✱ | Druckanschluss | select |  | DN 25 \| DN 32 \| DN 40 \| DN 50 \| DN 65 \| DN 80 \| DN 100 \| DN 125 \| DN 150 |
| `breite` | Breite | number | mm |  |
| `tiefe` | Tiefe | number | mm |  |
| `hoehe` | Höhe | number | mm |  |
| `gewicht` | Gewicht | number | kg |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `schutzart` | Schutzart | text |  |  |
| `steuerung` | Steuerung | text |  |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `zirkulationspumpe` — Zirkulationspumpe
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `regelungsart` ✱ | Regelungsart | select |  | Konstantdrehzahl \| Drehzahlgeregelt (Δp konstant) \| Drehzahlgeregelt (Δp variabel) \| Temperaturgeführt |
| `foerderhoeheMax` ✱ | Max. Förderhöhe | number | mbar |  |
| `volumenstromMax` ✱ | Max. Volumenstrom | number | l/h |  |
| `medienTempMax` | Max. Medientemperatur | number | °C |  |
| `leistungMax` | Leistungsaufnahme max. | number | W |  |
| `eei` | Energieeffizienzindex EEI | number |  |  |
| `anschluss` ✱ | Anschluss | select |  | DN 15 \| DN 20 \| DN 25 \| DN 32 \| DN 40 |
| `einbaulaenge` | Einbaulänge | number | mm |  |
| `rvIntegriert` | Rückflussverhinderer integriert | checkbox |  |  |
| `absperrungIntegriert` | Absperrungen integriert | checkbox |  |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `schutzart` | Schutzart | text |  |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `saugpumpe` — Saugpumpe
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Selbstansaugende Kreiselpumpe \| Normalsaugende Kreiselpumpe \| Jetpumpe (Ejektorpumpe) \| Peripheralradpumpe \| Membran-/Kolbenpumpe |
| `npsh` ✱ | NPSH-Wert (beim Nennförderstrom) | number | m |  |
| `maxSaughoehe` | Max. Saughöhe (Herstellerangabe) | number | m |  |
| `foerdermenge` | Fördermenge (Nennpunkt) | number | m³/h |  |
| `foerderhoehe` | Förderhöhe (Nennpunkt) | number | m |  |
| `motorleistung` | Motorleistung | number | kW |  |
| `medienTempMax` | Max. Medientemperatur | number | °C |  |
| `anschluss` | Anschlüsse Saug-/Druckseite | text |  |  |
| `spannung` | Spannung | select |  | 230 V \| 400 V |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `sicherheitsventil` — Sicherheitsventil
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Membran-Sicherheitsventil \| Feder-Sicherheitsventil (Eckform) \| Feder-Sicherheitsventil (Durchgang) \| Sicherheitsgruppe (mit RV) |
| `ansprechdruck` ✱ | Ansprechdruck (fix eingestellt) | number | bar |  |
| `abblaseleistung` | Abblaseleistung | number | kW |  |
| `medienTempMax` | Max. Medientemperatur | number | °C |  |
| `anschluss` ✱ | Anschluss Eintritt | select |  | DN 15 (½") \| DN 20 (¾") \| DN 25 (1") \| DN 32 (1¼") \| DN 40 (1½") \| DN 50 (2") |
| `austritt` | Anschluss Austritt | text |  |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `ausdehnungsgefaess` — Ausdehnungsgefäss
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Membran-Ausdehnungsgefäss \| Blasen-Ausdehnungsgefäss \| Kompressorgehaltene Druckhaltung \| Pumpengehaltene Druckhaltung |
| `nennvolumen` ✱ | Nennvolumen | number | Liter |  |
| `maxDruck` ✱ | Zul. Betriebsdruck PS | number | bar |  |
| `vordruckWerk` | Vordruck ab Werk | number | bar |  |
| `medienTempMax` | Max. Medientemperatur | number | °C |  |
| `anschluss` | Anschluss | text |  |  |
| `ce` | CE-Konformität (Druckgeräterichtlinie) | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `heizungspumpe` — Heizungs-Umwälzpumpe
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `regelungsart` ✱ | Regelungsart | select |  | Konstantdrehzahl \| Drehzahlgeregelt (Δp konstant) \| Drehzahlgeregelt (Δp variabel) \| Temperaturgeführt |
| `foerderhoeheMax` ✱ | Max. Förderhöhe | number | kPa |  |
| `volumenstromMax` ✱ | Max. Volumenstrom | number | m³/h |  |
| `medienTempMax` | Max. Medientemperatur | number | °C |  |
| `leistungMax` | Leistungsaufnahme max. | number | W |  |
| `eei` | Energieeffizienzindex EEI | number |  |  |
| `anschluss` ✱ | Anschluss | select |  | DN 25 \| DN 32 \| DN 40 \| DN 50 \| DN 65 \| DN 80 \| DN 100 |
| `einbaulaenge` | Einbaulänge | number | mm |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `schutzart` | Schutzart | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `waermeerzeuger` — Wärmeerzeuger
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Wärmepumpe Luft/Wasser \| Wärmepumpe Sole/Wasser \| Wärmepumpe Wasser/Wasser \| Gaskessel (Brennwert) \| Pelletkessel \| Stückholzkessel \| Ölkessel \| Fernwärme-Übergabestation \| Elektroheizeinsatz |
| `heizleistung` ✱ | Heizleistung (Auslegungspunkt) | number | kW |  |
| `leistungMin` | Min. Leistung (Modulation) | number | kW |  |
| `cop` | COP / Wirkungsgrad | number |  |  |
| `vlTempMax` | Max. Vorlauftemperatur | number | °C |  |
| `kaeltemittel` | Kältemittel | text |  |  |
| `schallleistung` | Schallleistungspegel | number | dB(A) |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `lueftungsgeraet` — Lüftungsgerät / Monobloc
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Monobloc innen \| Monobloc Wetterfest (Dach) \| Flachgerät (Zwischendecke) \| Kompaktgerät Wohnungslüftung |
| `volumenstromMax` ✱ | Max. Volumenstrom | number | m³/h |  |
| `externerDruck` | Externe Pressung | number | Pa |  |
| `wrgTyp` | Wärmerückgewinnung | select |  | Plattentauscher (Kreuzstrom) \| Plattentauscher (Gegenstrom) \| Rotationstauscher \| Kreislaufverbund \| keine |
| `wrgGrad` | WRG-Rückwärmzahl | number | % |  |
| `heizleistung` | Heizregister-Leistung | number | kW |  |
| `kuehlleistung` | Kühlregister-Leistung | number | kW |  |
| `befeuchterLeistung` | Befeuchter-Leistung | number | kg/h |  |
| `sfp` | SFP-Klasse / spez. Ventilatorleistung | text |  |  |
| `spannung` | Spannung | select |  | 230V/50Hz \| 400V/50Hz |
| `ce` | CE-Konformität (ErP/Ecodesign) | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `fluessiggasanlage` — Flüssiggas-Versorgungsanlage (LPG)
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Flaschenrampe (Transportbehälter) \| Tank überflur \| Tank unterflur \| Verdampferanlage (elektrisch) |
| `verdampfungsleistung` ✱ | Verdampfungs-/Entnahmeleistung | number | kg/h |  |
| `lagerkapazitaet` | Lagerkapazität / Füllmenge | number | kg |  |
| `anzahlBehaelter` | Anzahl Behälter (Rampe) | number | Stk. |  |
| `behaeltergroesse` | Behälter-/Flaschengrösse | select |  | Propan 10.5 kg \| Propan 33/35 kg \| Tank 1.6–2.0 m³ \| Tank 2.7 m³ \| Tank 4.8 m³ \| Tank 12 m³ \| Tank 30 m³ |
| `ausgangsdruck` | Ausgangsdruck (Regelstufe) | number | mbar |  |
| `ekas` | Konform EKAS 6517 / Leitfaden L1 | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `gasloeschanlage` — Gaslöschanlage
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `loeschmittel` ✱ | Löschmittel | select |  | Stickstoff N2 300 bar \| Novec 1230 (FK-5-1-12) \| Argon \| Inergen (IG-541) \| CO2 |
| `flaschengroesse` ✱ | Flaschengrösse | number | l |  |
| `flaschenanzahlMax` | Max. Flaschen pro Batterie | number | Stk. |  |
| `maxRaumvolumen` | Max. Raumvolumen (Richtwert) | number | m³ |  |
| `fuellmenge` | Füllmenge pro Flasche | number | kg |  |
| `arbeitsdruck` | Arbeitsdruck | number | bar |  |
| `vds` | VdS-Zulassung | checkbox |  |  |
| `iso14520` | Konform ISO 14520 | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `frischwasserstation` — Frischwasserstation
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauart` ✱ | Bauart | select |  | Wandmontage \| Standgerät \| Kaskade |
| `leistungNenn` ✱ | Nennleistung (kW) | number | kW |  |
| `zapfleistungPeak` ✱ | Peak-Zapfleistung (TWW/TKW) | number | l/min |  |
| `twwMax` | Max. TWW-Temperatur | number | °C |  |
| `primaerVol` | Primär-Vorlauftemperatur | number | °C |  |
| `waermetauscherFlaeche` | Wärmetauscherfläche | number | m² |  |
| `anschlussPrim` | Primär-Anschluss | select |  | DN 20 \| DN 25 \| DN 32 \| DN 40 \| DN 50 |
| `anschlussSek` | Sekundär-Anschluss | select |  | DN 15 \| DN 20 \| DN 25 \| DN 32 \| DN 40 |
| `breite` | Breite | number | mm |  |
| `tiefe` | Tiefe | number | mm |  |
| `hoehe` | Höhe | number | mm |  |
| `svgwNr` | SVGW-Zulassungsnummer | text |  |  |
| `sia385` | Konform SIA 385/2 | checkbox |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `fettabscheider` — Fettabscheider
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `aufstellung` ✱ | Aufstellung | select |  | Frostfrei (innen) \| Erdeingebaut \| Freie Aufstellung |
| `material` | Material | select |  | PE \| GFK \| Edelstahl \| Beton |
| `ns` ✱ | Nenngrösse NS | number | l/s |  |
| `schlammraum` ✱ | Schlammraum VS | number | l |  |
| `fettspeicher` | Fettspeicherraum | number | l |  |
| `gesamtvolumen` | Gesamtvolumen | number | l |  |
| `zulaufDN` | Zulauf DN | select |  | DN 100 \| DN 125 \| DN 150 \| DN 200 |
| `ablaufDN` | Ablauf DN | select |  | DN 100 \| DN 125 \| DN 150 \| DN 200 |
| `laenge` | Länge | number | mm |  |
| `breite` | Breite | number | mm |  |
| `hoehe` | Höhe | number | mm |  |
| `gewichtLeer` | Gewicht leer | number | kg |  |
| `enNorm` | EN-Norm | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `oelabscheider` — Öl- / Benzinabscheider
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `klasse` ✱ | Klasse | select |  | Klasse I (Koaleszenz) \| Klasse II (Schwerkraft) |
| `material` | Material | select |  | PE \| GFK \| Edelstahl \| Beton |
| `ns` ✱ | Nenngrösse NS | number | l/s |  |
| `schlammraum` ✱ | Schlammraum | number | l |  |
| `oelspeicher` | Öl-Speicherraum | number | l |  |
| `maxAblauf` | Max. Ablaufkonzentration | number | mg/l |  |
| `zulaufDN` | Zulauf DN | select |  | DN 100 \| DN 125 \| DN 150 \| DN 200 \| DN 250 \| DN 300 |
| `ablaufDN` | Ablauf DN | select |  | DN 100 \| DN 125 \| DN 150 \| DN 200 \| DN 250 \| DN 300 |
| `laenge` | Länge | number | mm |  |
| `durchmesser` | Durchmesser | number | mm |  |
| `hoehe` | Höhe | number | mm |  |
| `enNorm` | EN-Norm | text |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `schlammsammler` — Schlammsammler
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `bauform` | Bauform | select |  | Rund \| Rechteckig \| Schachtform |
| `material` | Material | select |  | PE \| GFK \| Beton \| Edelstahl |
| `volumen` ✱ | Nutzvolumen | number | l |  |
| `durchmesser` | Innendurchmesser D | number | mm |  |
| `absetzflaeche` | Absetzfläche | number | m² |  |
| `verweilzeit` | Mindest-Verweilzeit | number | min |  |
| `zulaufDN` | Zulauf DN | select |  | DN 100 \| DN 125 \| DN 150 \| DN 200 \| DN 250 \| DN 300 |
| `ablaufDN` | Ablauf DN | select |  | DN 100 \| DN 125 \| DN 150 \| DN 200 \| DN 250 \| DN 300 |
| `laenge` | Länge | number | mm |  |
| `hoehe` | Höhe | number | mm |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `thermische_solaranlage` — Thermische Solaranlage
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Typenbezeichnung / Serie | text |  |  |
| `modell` ✱ | Modell / Grösse | text |  |  |
| `artikelnr` | Artikelnummer | text |  |  |
| `kollektortyp` ✱ | Kollektortyp | select |  | Flachkollektor \| Röhrenkollektor (Vakuum) \| Luftkollektor |
| `bruttoflaeche` ✱ | Bruttofläche | number | m² |  |
| `aperturflaeche` | Aperturfläche | number | m² |  |
| `absorberflaeche` | Absorberfläche | number | m² |  |
| `eta0` | Optischer Wirkungsgrad η₀ | number |  |  |
| `a1` | a1 (linear) | number | W/m²K |  |
| `a2` | a2 (quadratisch) | number | W/m²K² |  |
| `ertragJahr` | Jahresertrag (CH Mittelland) | number | kWh/m²·a |  |
| `stagnationsT` | Stagnationstemperatur | number | °C |  |
| `absorberMat` | Absorber-Material | select |  | Kupfer \| Aluminium \| Stahl |
| `absorberBeschicht` | Absorberbeschichtung | text |  |  |
| `laenge` | Länge | number | mm |  |
| `breite` | Breite | number | mm |  |
| `hoehe` | Höhe | number | mm |  |
| `gewicht` | Gewicht | number | kg |  |
| `solarKeymark` | Solar Keymark | checkbox |  |  |
| `en12975` | EN 12975 | checkbox |  |  |
| `ce` | CE-Konformität | checkbox |  |  |
| `besonderheiten` | Besonderheiten | textarea |  |  |

### `werkzeuge` — Werkzeuge & Maschinen
| Feld-ID | Bedeutung | Typ | Einheit | Optionen |
|---|---|---|---|---|
| `serie` ✱ | Hersteller | text |  |  |
| `modell` ✱ | Modell | text |  |  |
| `bezeichnung` ✱ | Geräte-Bezeichnung | text |  |  |
| `artikelnr` | Artikel-Nr. | text |  |  |
| `werkzeugKategorie` ✱ | Werkzeug-Kategorie | select |  | Maschine (Akku) \| Maschine (Kabel) \| Handwerkzeug \| Leiter / Gerüst \| Messgerät \| Ladegerät \| Zubehör \| Sonstiges |
| `bild` | Produktbild | bild |  |  |
| `beschreibung` | Beschreibung | textarea |  |  |
| `leistung` | Leistung | number | W |  |
| `spannung` | Akku-/Netzspannung | text | V |  |
| `gewicht` | Gewicht | number | kg |  |
| `masse` | Masse (L×B×H) | text | mm |  |
| `pruefpflichtNiv` | Elektroprüfung (NIV) erforderlich | checkbox |  |  |
| `pruefintervall` | Empf. Prüfintervall | number | Monate |  |
| `listenpreis` | Listenpreis (CHF) | number |  |  |
| `lieferzeit` | Lieferzeit | text |  |  |
| `garantie` | Garantie | number | Monate |  |
| `zubehoer` | Lieferumfang / Zubehör | textarea |  |  |

---
_Generiert aus den Live-Schemata via `node scripts/lieferanten_seed_gen.mjs --prompt` — bei Schema-Änderungen neu erzeugen._
