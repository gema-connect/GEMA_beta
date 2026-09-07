# ERP-Migration: Altsystem «dbof» → GEMA ERP

**Stand**: 2026-09-07 · **Status**: Analyse abgeschlossen, kein Import durchgeführt

Analysegrundlage: Kopie des MySQL-Datenverzeichnisses (`C:\OF_SQLDaten\Data\dbof`),
ausgewertet wurden ausschliesslich die Strukturdateien (`.frm`, `.TRG`, `db.opt`).
Es wurden **keine Nutzdaten** (`.ibd`) angefasst — die Analyse enthält keine
Kunden-, Adress- oder Betragsdaten.

Werkzeug: `erp_alt/frm_parse.py` (liest MySQL-5.x-`.frm` ohne laufenden Server),
Ergebnis in `erp_alt/schema.txt`. Beides liegt unter `erp_alt/` und ist per
`.gitignore` vom Repo ausgenommen.

---

## 1. Eckdaten des Altsystems

| | |
|---|---|
| Server | MySQL 5.7.44, InnoDB, `innodb_file_per_table` |
| Zeichensatz | `utf8` / `utf8_general_ci` — **keine Umlaut-Konvertierung nötig** |
| DB-Benutzer | `ofuser@%` (aus den Trigger-Definitionen) |
| Umfang | 199 Tabellen, 15 Views, 39 Trigger-Definitionen |
| Grösster Datenbestand | `journal.ibd` ≈ 1 GB, `kreditoren.ibd` ≈ 33 MB, `kredzut.ibd` ≈ 22 MB |

**Automatik im Altsystem** (per Trigger, relevant fürs Verständnis der Daten):
`insert_info_date` / `insert_info_user` / `post_info_date` / `post_info_user`
werden auf ~38 Tabellen automatisch gesetzt. Jede Mutation wird zusätzlich in
`journal` protokolliert — das erklärt dessen Grösse.

---

## 2. Die drei Schichten der Datenbank

Von den 199 Tabellen ist nur rund ein Drittel migrationsrelevant. Die Trennung:

### A — Firmendatenbestand (migrieren)
Belege, Stammdaten, Zeiten, Service. Rund 60 Tabellen. Details in Abschnitt 3.

### B — Normpositions-Katalog NPK/CRB (**nicht** migrieren)
`chapter`, `positiontbl`, `positiondetails`, `chaptermap`, `chaptermat`,
`suchtitel`, `suchtopos`, `matpos`, `artikel`, `eanmap`, `ausfuehrungen`,
`produktegrp`, `bkp`, `arthits`, `ofcatalog`

Erkennbar an `chapter.CRB_version`, `.SSIV_version`, `.IGH_version`, `.GH_version`
sowie `positiontbl.npktext`. Das ist **lizenziertes Katalogmaterial von CRB/SSIV/IGH**,
kein eigener Datenbestand. GEMA deckt das bereits anders ab: `gema_dataselect.js`
(IGH/DataExpert), `pm_crbx` (SIA 451) und die BKP-Struktur in
`pm_ausschreibungsunterlagen`. Eine Migration wäre lizenzrechtlich zudem heikel —
die Nutzungsrechte hängen am Altsystem-Vertrag, nicht an den Daten.

> Ausnahme: die **Referenzen** aus den Belegpositionen auf den Katalog
> (`SChapter`/`sbuchnr`/`SPos`/`SMat`) übernehmen wir als Text, damit die
> Herkunft einer Position nachvollziehbar bleibt.

### C — Post-Adressdatenbank und Systemtabellen (**nicht** migrieren)
- **Post/GWR**: `new_plz1`, `new_plz2`, `new_str`, `new_stra`, `new_geb`,
  `new_geba`, `new_com`, `new_geb_com`, `new_bot_b`, `plzort`, `post_obj`
  → Schweizer Post-Strassenverzeichnis inkl. EGID/Koordinaten. GEMA nutzt
  dafür `gema_adresse.js`.
- **System/Technik**: `journal`, `request`, `logs`, `sessions`, `license`,
  `licenseset`, `dbversion`, `progver`, `filesver`, `seq`, `tmpprint`,
  `deleteditems`, `iplist`, `user_tracking`, `pushnotifications`,
  `incomingcalls`, `intercom`, `ai_actions`, `ai_actions_det`, `ai_models`,
  `ai_providers`, `webusertoken`, `webcust_token`, `variables`, `globopt`,
  `options`, `pdfforms`, `dm`, `dmband`, `dmbands`, `displaymodels`,
  `etikettenformate`, `tppreset*`

---

## 3. Kern-Mapping Altsystem → GEMA

### 3.1 Objekte — `obj` (37 Spalten) → `objekt:` (pm_objekte)

| Altsystem | GEMA | Bemerkung |
|---|---|---|
| `id` | `extId` | Schlüssel für den Wiederholungs-Import |
| `strasse`, `strasse2`, `plz`, `ort` | Adressfelder | direkt |
| `objekt1`, `objekt2` | Bezeichnung | zwei Freitextzeilen |
| `egid`, `egrid` | `egid`, `egrid` | GEMA führt beide bereits |
| `loc_latitude`, `loc_longitude` | Koordinaten | für `gema_hoehe.js` / Karten nutzbar |
| `knummer` / `co_knummer` / `ei_knummer` | drei Adress-Slots | Zahler · Korrespondenz · Eigentümer — vom Importer bereits so verstanden |
| `ct_knummer`, `ct_co_knummer`, `ct_ei_knummer`, `ct_korr_knummer` | Bezugspersonen | `ct_` = Kontaktperson je Slot |
| `monteur_id`, `sachb_id` | Team / Bearbeiter | über `arbeiter` auflösen |
| `objmemo` | Notiz | LONGTEXT |
| `extref1`, `extref2` | `ref1`, `ref2` | |
| `korr_name` | denormalisierter Name | in GEMA nur Fallback — Live-Lookup gewinnt (CLAUDE.md §2) |
| `otyp`, `oshow`, `printstr2`, `modenabled`, `lk*` | — | Altsystem-UI-Steuerung |

Ergänzend: `objadr` (Objekt↔Adresse mit `adrtyp`) und `contact` / `contactinfos`
(polymorph über `module_id`/`item_id`) liefern die weiteren Bezugspersonen.

### 3.2 Adressen — `adressen` (78) + `zuhand` (11) + `adrkre` (33) → `erpkunde:`

Zentraler Stamm. Bestätigt die Alias-Tabelle in `gema_erp_import.js:496`:
`oknummer`, `name1`…`name4`, `banrede`, `zahlbedid`, `zuhand`, `bemerkungen`,
`strasse`/`strasse2`/`plz`/`ort`/`land`, `tel1`/`tel2`/`natel`/`fax`/`email`/`web`.

Zusätzlich vorhanden und für GEMA interessant:
- `paymentterm_id` → Zahlungsbedingung (Tabelle `paymentterm`)
- `eBillID`, `Rechnung_Email`, `esr_trennen` → eBill / Rechnungsversand
- `stdskonto`, `stdrabatt` → Kundenkonditionen
- `pk_debi`, `pk_kredi`, `pk_abacdebi`, `pk_abackredi` → Schnittstellen-Schlüssel
  zu Sesam bzw. Abacus. **Nicht migrieren**, ausser die Fibu-Anbindung bleibt.

`zuhand` = Ansprechpersonen je Adresse (mit eigenem Telefon/E-Mail).
`adrkre` = Kreditoren-Zusatzdaten zur Adresse: Konditionen, Bestellkanal
(`order_email`, `order_with_dataexpert`, `order_with_pdf`) und die
**IGH-Zugangsdaten** (`igh_user`, `igh_password`, `igh_liefnr`, `igh_liefurl`).
Letztere passen direkt auf `gema_dataselect.js`.

> ⚠ `adrkre.password` / `igh_password` enthalten Zugangsdaten im Klartextfeld.
> Diese Spalten beim Export **weglassen** und die Zugänge in GEMA neu erfassen.

### 3.3 Offerten — `offerten` (65) → `erpdok:` Typ `offerte`

| Altsystem | GEMA |
|---|---|
| `offert_nr` | `nr` |
| `datum` | `datum` |
| `rdatum` | `gueltigBis` |
| `betrmemo` | `titel` |
| `status` → `offstatus.typ_text` | `status` |
| `offerttyp` → `offtyp.typ_text` | Vermerk |
| `obetrag` / `mwstbetrag` / `zbetrag` | Summen |
| `tostunden`, `toaufwand` | Stunden-/Aufwandtotal |
| `abt_id` → `abt.name1` | Arbeitsbereich |
| `sachb_id` → `arbeiter` | Sachbearbeiter |
| `obj_id` | Objektverknüpfung |
| `rapport_id` | Verknüpfung zum Auftrag |
| `zahlbedid` | Zahlungsfrist |
| `sigmonteur`, `sigcustomer` | Unterschriften (LONGTEXT) |
| `print_info_date/user`, `post_info_date/user` | Versand-/Druckvermerke |

### 3.4 Aufträge — `rapporte` (114) → `erpdok:` Typ `auftrag`

Die grösste Tabelle. Drei Blöcke:

**Kopf und Zutritt** — `rapport_nr`, `obj_id`, Adresse, `besteller` / `best_datum` /
`best_tel` / `best_natel`, `wohnung` / `wohn_tel` / `wohn_natel` / `wohn_standort`,
**`schlussel` / `schlu_tel` / `schlu_natel`**. Der Schlüssel-/Zutrittsblock trifft
exakt auf das Schlüssel-Feature in `pm_einsatzplan` (Code nie in Notify).

**Disposition** — `termin`, `terminbis`, `timefrom`, `timeuntil`, `woche`,
`dringlichk` → `dringlich`, `astatus` → `arbstatus`, `rstatus`, `arbtyp` → `arbtyp`,
`monteur_id`, `abt_id`, `sachb_id`, `offerte_id`.

**Nachkalkulation** — rund 35 `nk*`-Felder (`nkofftot`, `nkmantot`, `nkrmat`,
`nkrnbh`, `nkwp`, `nkgewp`, `nkfaktor`, `nkspesen`, `nkmanspesen`, …). Das ist
eine vollständige Soll-Ist-Nachkalkulation je Auftrag und entspricht dem
Nachkalkulations-Teil von `pm_erp`. Die Feldsemantik ist aus den Namen allein
nicht sicher ableitbar (`nbh` = Nebenkosten/Handel?, `w` = Werte?) — hier braucht
es einmal einen Blick ins Altsystem-UI oder ein paar Beispielzeilen.

Ausserdem: `regiecalculation`, `allow_additional_efforts`, `pdf_hide_prices`
(→ Preis-Sichtbarkeit wie `_rrCanPrice` in `pm_regierapport`), `sigmonteur` /
`sigcustomer` (Unterschriften-Pad), `ausmassliste`, `service_id`.

### 3.5 Rechnungen — `rechnungen` (76) → `erpdok:` Typ `rechnung`

| Altsystem | GEMA |
|---|---|
| `nr` | `nr` |
| `rapport_id`, `rapport_nr` | Verknüpfung zum Auftrag |
| `typ` → `rechtyp.typ_text` | `rechnungsArt` (Schluss/Akonto/Teil) |
| `astatus` → `rechastatus`, `debistatus` → `debistatus` | `status` |
| `datum`, `faelligdatum` | `datum`, `frist` |
| `rbetrag`, `mwstbetrag` | Summen |
| **`zahlungsdatum`, `zahlungsbetrag`** | `zahlungen[]` |
| `spk_id`, `esr_bankid` → `bank` | ESR-/QR-Referenz |
| `belegnr`, `opdebi`, `abacbelegnr` | Fibu-Belegnummern |
| `arbeit`, `betrifft`, `ausgef` | Titel / Leistungsdatum |
| `kostenst_id` → `kostenst` | Kostenstelle |
| `zahlbedid` → `paymentterm` | Zahlungsbedingung |

> **Korrektur gegenüber dem heutigen Importer**: dessen Beschreibung sagt
> «Der Export führt KEINE Zahlungsinformation — die Rechnungen entstehen als
> gestellt». Das galt für die damalige CSV-Datei, **nicht für die Datenbank**:
> `zahlungsdatum` und `zahlungsbetrag` sind vorhanden. Der Stichtag-Behelf in
> `gema_erp_import.js` wird damit überflüssig, der Zahlungsstand lässt sich
> echt übernehmen.

### 3.6 Positionen — `lvposition` (32) → `doc.positionen[]` ← **die zentrale Lücke**

Heute erzeugt `gema_erp_import.js` pro Beleg nur eine **Sammelposition** mit der
Summe. `lvposition` enthält die echten Positionen:

| Altsystem | GEMA-Position |
|---|---|
| `module_id` + `item_id` | polymorphe Zuordnung zum Beleg (Offerte/Rechnung/Rapport) |
| `postyp` | `art` (`titel` / `text` / `frei` / `rabatt` / `zuschlag`) |
| `text` | `bez` |
| `qty`, `unit`, `dim` | `menge`, `einheit` |
| `price`, `total` | `ep` |
| `guid`, `parent_pos_guid` | Hierarchie → Titel/Unterposition |
| `SChapter`, `sbuchnr`, `SPos`, `SMat`, `SProdGrp`, `STyp` | NPK-Herkunft (als Text übernehmen) |
| `variante`, `price_fixed` | Variantenposition, Festpreis |
| `mat_faktor`, `mat_price`, `einkaufs_rabatt`, `verschnitt`, `leitfaden_zeit`, `zeit_faktor`, `ansatz`, `preis_art`, `round_method`, `nettofixed`, `lsva` | **Kalkulation** — GEMA hat dafür den Kalkulations-Teil des Positions-Editors |

`lsva` = leistungsabhängige Schwerverkehrsabgabe (Schweiz), fliesst als Zuschlag ein.

**Achtung, zwei Generationen**: parallel existiert `nlv` / `nlvposition` /
`nlvprice` / `nlvcondition` / `nlvuserstructure` (neueres Modell, Preise
normalisiert über `price_id`). Welche Generation produktiv ist, entscheiden die
Zeilenzahlen — siehe Abschnitt 6.

### 3.7 Kreditoren — `kreditoren` (41) + `kredzut` (19) → `erpkred:`

Passt fast eins zu eins auf das bestehende GEMA-Kreditorenmodul inklusive
Freigabe durch den Sachbearbeiter:

- `kreditoren`: `nr`, `adr_id`, `datum`, `belegnr`, `faelligdatum`, `esr_nr`,
  `betrag`, `mwstbetrag`, `restbetrag`, `gutschrift`, `zahlbedid`, `konto`,
  `gkonto`, `kostenst_id`, `iban`, `input_type` → `kredinputtype`,
  `kredistatus` → `kredzutstatus`, `sensibel`
- `kredzut`: Zuteilung eines Kreditors auf Rapport und Kostenstelle, mit
  **`freigegeben_info_date/user` und `kontrolliert_info_date/user`** — das ist
  genau der zweistufige Freigabeworkflow, den `pm_erp` kennt.

### 3.8 Artikelstamm — `abarticle` (33) / `abmatarticle` (37) → `erpkat:`

`abarticle` = eigene Artikel/Leistungen mit Kalkulation, hierarchisch über
`chapterguid` / `lineguid` / `sheetguid` (Tabellen `abchapter`, `absheet`,
`abtitle`, `abline`). `abmatarticle` = dasselbe, aber **auf einem Rapport
erfasst** (`rapport_id`, `arb_id`, `datum`) → Regiematerial, gehört zu
`pm_regierapport`. `artdetails` führt zusätzlich Lagerdaten
(`lagermenge`, `lagermin`, `lagermax`, `lagerstelle`) → `if_wareneingang`.

### 3.9 Zeiten — `stunden` / `nstunden` / `stdtot` / `spesen` → `pm_stunden`

- `stunden` (22): Wochenzeile mit `t1`…`t7` je Wochentag, `arb_id`, `jhrwoche`,
  `rapp_id`, `arbtyp`, `absenz`, `zuschlag_id`
- `nstunden` (12): tagesbasierte Variante mit `datum` + `stunden` — vermutlich
  die Ablösung von `stunden`
- `stdtot` (44): Wochentotal je Mitarbeiter mit Soll je Wochentag (`sollmo`…`sollso`),
  Tagessperren (`molocked`…), **Vorholzeit `vz_mo`…`vz_so`**, Boni `b_mo`…`b_so`,
  `comptypb`
- `spesen` (20): gleiche Wochenstruktur für Spesen
- Ergänzend: `absenz`, `holidays`, `vorholzeit`, `vorholzeit_mitarbeiter`,
  `zuschlaege_stunden`, `stundenbonus`, `beglichene_ueberzeit`, `zeiterfassung`
  (Stempelung von/bis), `arbueber`, `monthly_budget`, `timespan`

Das deckt sich auffallend gut mit dem GAV-Modell in `pm_stunden` (Zuschläge,
Töpfe A/B, Vorholzeit, Absenzen, Betriebsferien).

### 3.10 Übrige Bereiche

| Altsystem | GEMA-Ziel |
|---|---|
| `termin` (25), `terminserie`, `terminsmscontact` | `pm_einsatzplan` |
| `services` (67), `apparate` (10), `komponenten` (32), `servstatus`, `appkat`, `appteile` | `sv_service` — Anlagen, Wartungsverträge, Revisionsintervalle (`ser_next_rev`, `ser_rev_int`, `ser_rev_toleranz`) |
| `orders` (30), `orderposition` (15), `orderstatus`, `lieferschein`, `stock`, `stockdet`, `stockhistory` | `pm_bestellungen`, `if_wareneingang` |
| `task` (24), `taskset*`, `tasksetdef*` | Pendenzen (`pm_planablage`) |
| `arbeiter` (113), `abt` (57), `users`, `userright`, `userrole`, `role` | Benutzer, Rollen, Arbeitsbereiche |
| `paymentterm`, `mwst`, `mwst_periode`, `esrtyp`, `bank`, `kostenst` | Firmen-Stammdaten (`sys_unternehmen`) |
| `customfields`, `customfieldsdata`, `property`, `propertydata` | frei definierte Felder — Prüfen, ob produktiv genutzt |

`abt` (57 Spalten) ist mehr als eine Abteilungsliste: sie trägt die ganze
**Kalkulationsbasis** je Abteilung (`stdlohn`, `kalklohn`, `matfak`, `vkmatgk`,
`vklohnk`, `vksozl`, `vkgk`, `vkgew`, `gka…gkd`-Zuschlagsstufen) plus je
Abteilung eigene Konten und Dokumentvorlagen. Für die Nachkalkulation ist
diese Tabelle unverzichtbar.

---

## 4. Stand des bestehenden Importers

`gema_erp_import.js` (1619 Zeilen, 5 Sektionen, idempotent über `extId`) liest
**nur XLSX und CSV** — kein SQL, kein `.frm`. Der Weg bleibt also:
Alt-DB → `SELECT` mit JOINs → eine flache Datei je Sektion → Import-Assistent.

| Sektion | Status | Lücke |
|---|---|---|
| Objekte / Liegenschaften | ✅ | `loc_latitude`/`loc_longitude` ungenutzt |
| Adressen / Kunden | ✅ | `paymentterm_id`, `stdskonto`/`stdrabatt`, eBill fehlen |
| Offerten | ⚠ Kopf | Positionen fehlen |
| Aufträge | ⚠ Kopf | Positionen, Nachkalkulation, Schlüsselblock teilweise |
| Rechnungen | ⚠ Kopf | Positionen, **Zahlungen** |
| **Positionen** | ❌ | neu — `lvposition` |
| **Kreditoren** | ❌ | neu — `kreditoren` + `kredzut` |
| **Artikelstamm** | ❌ | neu — `abarticle` |
| **Stunden / Spesen** | ❌ | neu — eigener Import nach `pm_stunden` |
| **Service / Anlagen** | ❌ | neu — `services` + `apparate` + `komponenten` |
| Stammdaten (MwSt, Zahlbed., Banken, Kostenstellen) | ❌ | klein, aber Voraussetzung für die Belege |

---

## 5. Empfohlene Reihenfolge

Die Reihenfolge ergibt sich aus den Fremdschlüsseln — jede Stufe braucht die
vorherige:

1. **Stammdaten**: `paymentterm`, `mwst`, `bank`, `kostenst`, `abt`, `arbeiter`
2. **Adressen**: `adressen` + `zuhand` (+ `adrkre` für Lieferanten)
3. **Objekte**: `obj` + `objadr` + `contact`
4. **Artikelstamm**: `abarticle` (+ `abchapter`/`absheet`/`abtitle`/`abline`)
5. **Offerten** (Kopf) → **Aufträge** (Kopf) → **Rechnungen** (Kopf)
6. **Positionen** `lvposition` — nach den Belegen, über `module_id`/`item_id`
7. **Zahlungen** aus `rechnungen.zahlungsdatum` / `.zahlungsbetrag`
8. **Kreditoren** `kreditoren` + `kredzut`
9. Optional: Stunden, Service, Bestellungen, Termine

---

## 6. Offene Punkte — dafür braucht es die Zeilenzahlen

Die folgenden Fragen lassen sich aus der Struktur allein nicht beantworten.
Sie klären sich mit einer einzigen Abfrage (keine Personendaten):

```sql
SELECT TABLE_NAME, TABLE_ROWS, ROUND(DATA_LENGTH/1024/1024,1) AS MB
FROM information_schema.TABLES
WHERE TABLE_SCHEMA='dbof' ORDER BY DATA_LENGTH DESC;
```

1. **`lvposition` oder `nlvposition`?** Beide Positionsmodelle existieren. Die
   gefüllte Tabelle ist die produktive.
2. **`stunden` (t1…t7) oder `nstunden` (datum)?** Gleiche Frage für die Zeiterfassung.
3. **`mwst`, `mwst_legacy` oder `abamwst`?** Drei MwSt-Tabellen.
4. **Werte von `module_id`** in `lvposition`, `contact`, `contactinfos`, `task`.
   Diese Zahl unterscheidet Offerte/Auftrag/Rechnung und ist der Schlüssel zum
   Positions-Import. Ermittelbar mit:
   ```sql
   SELECT module_id, COUNT(*) FROM lvposition GROUP BY module_id;
   ```
5. **Format von `sigmonteur` / `sigcustomer`** (LONGTEXT) — Base64-PNG oder SVG?
   Entscheidet, ob die Unterschriften übernommen werden können.
6. **`artikel.Calculation` und `chaptermat.matlist`** sind LONGBLOB. Vermutlich
   ein serialisiertes Delphi-/Binärformat. Falls die Kalkulationsdetails
   gebraucht werden, muss das Format geklärt werden — sonst weglassen.
7. **Wird die Fibu-Anbindung** (Sesam / Abacus, erkennbar an `pk_abacdebi`,
   `abacbelegnr`, `sesamcode`) weitergeführt? Falls ja, müssen die
   Belegnummern-Felder mitwandern.
8. **Mandantenfähigkeit**: `company_id` steckt auf vielen Tabellen. Gibt es mehr
   als eine Firma im System? Das bestimmt die `orgId`-Zuordnung in GEMA.

---

## 7. Datenschutz

Der produktive Bestand enthält Kundennamen, Adressen, Beträge sowie
Personaldaten in `arbeiter` (AHV-Nummer, Geburtsdatum, Zivilstand, Kinderzahl,
Lohnkonto, Bankverbindung). Für die Migration gilt:

- Nur die Felder exportieren, die GEMA tatsächlich braucht — `arbeiter` liefert
  Name, Kürzel, Abteilung, Ansatz; **nicht** AHV, Lohn, Bank, Zivilstand.
- `adrkre.password` / `igh_password` nie exportieren.
- Auszüge nicht ins Repo (`.gitignore` deckt `erp_alt/`, `*.db`, `*.mdb` u.a. ab).
- Bearbeitungsverzeichnis nach Art. 12 DSG nachführen, wenn die Daten in eine
  neue Umgebung wechseln.
