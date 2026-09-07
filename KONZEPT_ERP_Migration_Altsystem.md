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

## 1a. Datenbestand (gemessen 2026-09-07)

| Bereich | Umfang |
|---|---|
| **Historie** | **2015-03-27 bis heute — 11,5 Jahre** |
| Objekte | 4 173 |
| Adressen / Kontaktpersonen | 6 627 Adressen · 12 992 `zuhand` · 54 116 `contact` · 7 972 `objadr` |
| Offerten | 6 321 |
| Aufträge (`rapporte`) | 9 723 |
| Rechnungen | 10 328 |
| **Belegpositionen** | **632 008** (`lvposition`) + **241 628** (`nlvposition`) |
| Kreditoren | 12 310 · Zuteilungen 14 734 |
| Eigener Artikelstamm | 15 888 (`abarticle`) |
| Mitarbeiter / Abteilungen / Kostenstellen | 206 · 12 · 24 |
| Stunden | 58 054 Wochenzeilen · 91 586 Tageszeilen |
| Termine | 6 739 |
| Service | 388 Anlagen · 35 Apparate · 406 Komponenten |
| **Mandanten** | **1** — `company_id` ist durchgehend derselbe Wert |

**Nicht genutzt** (0 Zeilen) — fällt komplett aus dem Migrationsumfang:
`orders`, `orderposition`, `stock`, `stockdet`, `stockhistory`, `lieferschein`
(kein Bestell- und Lagerwesen) · `task`, `taskset*` (keine Pendenzen) ·
`holidays`, `vorholzeit`, `zeiterfassung`, `zuschlaege_stunden`, `timespan`
(keine Zeitzuschläge/Stempelung) · `company`, `bank`, `customfields`,
`property`, `options`, `dm` · sämtliche `new_*`-Tabellen und `post_obj`
(die Post-Adressdatenbank ist leer — genutzt wird nur `plzort` mit 5 333 Zeilen).

**Speicherfresser, die nicht migriert werden:**
- `lvdata` — **7,4 GB** bei nur 46 569 Zeilen. Die Spalte `lv` ist ein
  komprimierter LONGBLOB mit der serialisierten LV-Struktur, dazu die Spalte
  `autosave`: ein grosser Teil der Zeilen sind Zwischenstände des Editors.
  Da `lvposition` dieselben Positionen relational führt, brauchen wir den Blob nicht.
- `filesver` — 389 MB Programm-Binärdateien (`progbin`), das ERP verteilt seine
  eigenen Updates über die Datenbank.
- `chaptermat` — 109 MB NPK-Materiallisten (Schicht B).

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

**Achtung, drei Generationen — und zwei davon sind aktiv.** Die Zählung zeigt:

| Modell | Umfang | Bewertung |
|---|---|---|
| `lvdata` (LONGBLOB, komprimiert) | 46 569 Zeilen / 7,4 GB | älteste Form, proprietär serialisiert. **Nicht migrieren** — dieselben Positionen stehen relational in `lvposition`. |
| `lvposition` | **632 008 Zeilen** | Hauptbestand, relational und direkt lesbar |
| `nlv` / `nlvposition` / `nlvprice` | 6 687 Köpfe / **241 628 Positionen** / 178 009 Preise | neueres Modell, Preise normalisiert über `price_id` in `nlvprice` (`mat_price`, `mat_discount`, `mat_loss`, `mat_factor`, `labor_amount`, `labor_factor`, `labor_rate`) |

Beide relationalen Modelle sind gefüllt, es gab also eine Umstellung im
laufenden Betrieb. **Der Positions-Import muss beide lesen** und je Beleg
entscheiden, welches Modell greift. Die Verteilung von `module_id` in
`lvposition`:

| `module_id` | Positionen |
|---|---|
| 2 | 425 424 |
| 4 | 203 805 |
| 18 | 2 779 |

Welcher Wert für Offerte, Auftrag und Rechnung steht, klärt die erste Abfrage
in Abschnitt 6.

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
- `nstunden` (12): **kein Ersatz, sondern die Detailebene** — die Spalte
  `stunden_id` verweist zurück auf `stunden`, dazu `datum` und `stunden`.
  Die Zahlen bestätigen das: 58 054 Wochenzeilen zu 91 586 Tageszeilen.
  Beide Tabellen werden gebraucht, `nstunden` liefert die Tagesauflösung.
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

## 6. Offene Punkte

### Beantwortet durch die Zählung vom 2026-09-07

| Frage | Antwort |
|---|---|
| `lvposition` oder `nlvposition`? | **Beide**, plus der Alt-Blob `lvdata`. Der Import muss `lvposition` (632 008) und `nlvposition` (241 628) lesen; `lvdata` bleibt draussen. |
| `stunden` oder `nstunden`? | **Beide** — `nstunden` ist die Tagesebene unter `stunden` (`stunden_id`). |
| Welche MwSt-Tabelle? | **`mwst`** (10 Sätze). `mwst_legacy` (15) ist historisch, `abamwst` ist leer. |
| Mandantenfähigkeit? | **Ein Mandant.** Alle Belege tragen dieselbe `company_id` → eine `orgId` in GEMA. |
| Bestell-/Lagerwesen? | **Nicht genutzt** (`orders`, `orderposition`, `stock*` alle leer) → aus dem Umfang gestrichen. |

### Noch zu klären

1. **Werte von `module_id`** — noch offen. In `lvposition` kommen 2 (425 408
   Positionen / 5 057 Belege), 4 (203 805 / 7 598) und 18 (2 779 / 32) vor,
   in `nlv` dieselben drei Werte (2 914 / 3 773 / 28 Belege).

   Der Versuch, sie über `EXISTS` gegen die Belegtabellen aufzulösen, **scheitert
   an überlappenden ID-Räumen**: `offerten.id`, `rechnungen.id` und `rapporte.id`
   zählen unabhängig ab 1, eine `item_id` trifft daher fast immer in allen drei
   Tabellen. Die Trefferquoten (module 2 → 93 % Offerten; module 4 → 90 %
   Rechnungen, aber nur 37 % Offerten) sind ein Indiz, kein Beweis.

   Sauber auflösbar ist es über die **Belegsummen**: nur beim richtigen
   Belegtyp stimmt `SUM(lvposition.total)` mit `obetrag` bzw. `rbetrag` überein.
   Abfrage siehe unten.

2. **Werte von `postyp`** — 16 verschiedene, Verteilung bekannt:
   11 (289 901) · 20 (133 343) · 10 (70 998) · 21 (61 418) · 9 (48 259) ·
   26 (8 801) · 12 (6 688) · 19 (3 556) · 16 (3 145) · 27 (1 836) ·
   13 · 22 · 15 · 25 · 18 · 28. Die Bedeutung ergibt sich aus dem
   Strukturmuster je Typ (hat Menge/Preis/Einheit? hat NPK-Bezug? hat Parent?),
   nicht aus den Zahlen — Abfrage siehe unten. Ziel ist die Abbildung auf die
   GEMA-Positionsarten `titel` / `text` / `frei` / `rabatt` / `zuschlag`.

3. **`companydata` ist keine Zusatzfeld-Tabelle, sondern eine Overlay-Schicht.**
   Die 8 152 Zeilen betreffen fast ausschliesslich Felder, die es als echte
   Spalte bereits gibt: `adressen.pk_debi` (2 046), `adressen.zahlbedid` (1 652),
   `adrkre.sesam_zahlart` (672), `adrkre.sesam_pk_nr` (667), `adrkre.bank_id`
   (581), `adrkre.ekonto`/`akkonto`, `adrkre.igh_liefnr` (539), `adrkre.bkp_nr`
   (139), `adressen.stdrabatt`/`stdskonto`.

   Das ist der Mandanten-Mechanismus des Altsystems: pro `company_id` kann ein
   Feld überschrieben werden. Bei **einem** Mandanten ist zu klären, ob die
   Basisspalte oder der Overlay-Wert gilt — besonders bei `zahlbedid`
   (Zahlungsfrist!) und den Konditionsfeldern. Abfrage siehe unten.

   > Auch hier steht ein `adrkre.password`-Eintrag drin — beim Export ausschliessen.

4. **Format von `sigmonteur` / `sigcustomer`** (LONGTEXT) — Base64-PNG oder SVG?
   Entscheidet, ob die Unterschriften übernommen werden können.
5. **`artikel.Calculation`** ist LONGBLOB, vermutlich serialisiertes Delphi-Format.
   Falls die Kalkulationsdetails gebraucht werden, muss das Format geklärt
   werden — sonst weglassen. `calcdata` (38 396 Zeilen) führt die Kalkulation
   dagegen relational und ist die bessere Quelle.
6. **Wird die Fibu-Anbindung** (Sesam / Abacus, erkennbar an `pk_abacdebi`,
   `abacbelegnr`, `sesamcode`) weitergeführt? Falls ja, müssen die
   Belegnummern-Felder mitwandern. Der Umfang der Overlay-Tabelle
   `companydata` deutet darauf hin, dass die Sesam-Anbindung aktiv genutzt wird.

### Abfragen für die letzte Runde

```sql
-- 1) module_id definitiv: nur beim richtigen Belegtyp stimmen die Summen
SELECT m.module_id, 'offerten' beleg, COUNT(*) treffer FROM (SELECT DISTINCT module_id FROM lvposition) m
JOIN (SELECT module_id, item_id, SUM(total) s FROM lvposition GROUP BY 1,2) p ON p.module_id=m.module_id
JOIN offerten o ON o.id=p.item_id
WHERE ABS(p.s-o.obetrag)<1 OR ABS(p.s-(o.obetrag-o.mwstbetrag))<1 GROUP BY 1;

SELECT m.module_id, 'rechnungen' beleg, COUNT(*) treffer FROM (SELECT DISTINCT module_id FROM lvposition) m
JOIN (SELECT module_id, item_id, SUM(total) s FROM lvposition GROUP BY 1,2) p ON p.module_id=m.module_id
JOIN rechnungen r ON r.id=p.item_id
WHERE ABS(p.s-r.rbetrag)<1 OR ABS(p.s-(r.rbetrag-r.mwstbetrag))<1 GROUP BY 1;

-- 2) ID-Bereiche als Gegenprobe
SELECT module_id, MIN(item_id) mn, MAX(item_id) mx FROM lvposition GROUP BY module_id;
SELECT 'offerten' t,MIN(id),MAX(id) FROM offerten UNION ALL
SELECT 'rechnungen',MIN(id),MAX(id) FROM rechnungen UNION ALL
SELECT 'rapporte',MIN(id),MAX(id) FROM rapporte UNION ALL
SELECT 'lvmuster',MIN(id),MAX(id) FROM lvmuster UNION ALL
SELECT 'services',MIN(id),MAX(id) FROM services;

-- 3) postyp entschluesseln ueber das Strukturmuster (keine Inhalte)
SELECT postyp, COUNT(*) n,
  SUM(qty<>0) mit_menge, SUM(price<>0) mit_preis,
  SUM(COALESCE(unit,'')<>'') mit_einheit, SUM(total<>0) mit_total,
  SUM(COALESCE(SPos,'')<>'') mit_npk,
  SUM(COALESCE(parent_pos_guid,'')='') ohne_parent,
  ROUND(AVG(CHAR_LENGTH(text))) txt_len
FROM lvposition GROUP BY postyp ORDER BY n DESC;

-- 4) companydata: ueberschreibt der Overlay-Wert die Basisspalte?
SELECT COUNT(*) gesamt,
  SUM(COALESCE(c.cmd_string,'')=COALESCE(a.zahlbedid,'')) gleich,
  SUM(COALESCE(c.cmd_string,'')<>COALESCE(a.zahlbedid,'')) abweichend
FROM companydata c JOIN adressen a ON a.id=c.cmd_item_id
WHERE c.cmd_tablename='adressen' AND c.cmd_fieldname='zahlbedid';
```

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
