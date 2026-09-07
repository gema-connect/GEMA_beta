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
| `otyp`, `oshow`, `printstr2`, `modenabled`, `lk*` | — | Altsystem-UI-Steuerung; `otyp`/`oshow` sind bei allen 4 547 Objekten leer |
| `name3`, `name4` | weitere Adresszeilen | selten benutzt (89 bzw. 17 Zeilen) — wandern in den Adresszusatz |

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
| `offerttyp` → `offtyp.typ_text` | Vermerk — trägt praktisch keine Information: 5 915 von 5 930 Offerten stehen auf «Privatperson als Offertempfänger», die übrigen sechs Typen sind zweistellig oder leer |
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

**Nachkalkulation** — rund 35 `nk*`-Felder auf `rapporte`. Am Auftrag 8448.00
gegen die Maske abgeglichen und damit aufgelöst:

| Feld | Bedeutung | im Beispiel |
|---|---|---|
| `nkrnbh` | verrechnete Stunden aus den Rechnungen | 204.15 |
| `nkrmat` | Materialanteil netto | 37 699.92 |
| `nkrfaktor` | Materialfaktor | 0.999 |
| `nkoffph` | erzielter Stundenansatz Fr./h | 91.99 |
| `nkofftot`, `nkoffmat`, `nkoffnbh` | dieselben Grössen auf der Offertseite | |
| `nkwstup`, `nkwmatp` | Projektstand % Stunden / Material | immer 100.00 |
| `nkgewp` | Gewinn in % | |
| `nkbez`, `nkspesen` | Aufwand aus Kostenstellen, Spesen | |

Die Maske rechnet: Total M+A − Material brutto = Arbeitsanteil, geteilt durch
die Stunden ergibt Fr./h; darunter Rechnungssumme − Materialaufwand netto =
Deckungsbeitrag 1. Die übrigen rund 20 `nk*`-Felder (`nkman*`, `nkw*val`,
`nkwnbh`, `nkwp`, `*_rec`-Varianten) sind im ganzen Bestand 0 oder NULL — der
manuelle Zweig der Maske wurde nie benutzt.

**Migriert wird sie trotzdem nicht als Rechengrösse, sondern als
Schnappschuss**, aus zwei gemessenen Gründen:

1. Sie existiert bei **121 von 9 723 Aufträgen** (1.2 %).
2. In der Maske sind **«Lohnkosten inkl. Sozialleistungen» und «Gemeinkosten»
   leer** — die Abteilungskalkulation wurde nie parametriert. Deckungsbeitrag 2
   und «Gewinn/Verlust» sind deshalb identisch mit Deckungsbeitrag 1, also
   schlicht Rechnungssumme minus Material. Als «Gewinn» nach GEMA übernommen
   wäre das eine Zahl, die etwas anderes behauptet, als sie ist. Der
   Bestandsschnitt von `nkgewp` (−33 %, Minimum −2 584) zeigt dasselbe.

Alle Grössen sind ohnehin aus den migrierten Primärdaten neu rechenbar
(Rechnungen, Positionen, Kreditoren, Stunden). Der Import führt sie als **ein
JSON-Feld** `nachkalk` am Auftrag mit und legt es unverändert unter
`importNachkalk` ab — vollständig erhalten, zum Vergleichen da, aber ausserhalb
von GEMAs Zahlen.

```sql
-- Zusatzspalte für den Auftrags-Export (8.3): leere Felder fallen im
-- Importer heraus, Aufträge ohne Nachkalkulation liefern NULL.
JSON_OBJECT('nkrnbh',r.nkrnbh,'nkrmat',r.nkrmat,'nkrfaktor',r.nkrfaktor,
            'nkbez',r.nkbez,'nkofftot',r.nkofftot,'nkoffmat',r.nkoffmat,
            'nkoffnbh',r.nkoffnbh,'nkoffph',r.nkoffph,'nkfaktor',r.nkfaktor,
            'nkgewp',r.nkgewp,'nkwstup',r.nkwstup,'nkwmatp',r.nkwmatp,
            'nkspesen',r.nkspesen) AS nachkalk
```

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

**Gelöst: `nlv` wird nicht gebraucht.** Der Abgleich zeigt, dass die
`nlv`-Belege fast vollständig auch in `lvposition` stehen:

| Modul | `nlv`-Belege | davon auch in `lvposition` | **nur** im `nlv` |
|---|---|---|---|
| 2 (Offerten) | 2 914 | 2 905 | **9** |
| 4 (Rechnungen) | 3 773 | 3 752 | **21** |

99,7 % Überschneidung. Von rund 26 000 Belegen existieren **30** ausschliesslich
im `nlv`-Modell. Der Import läuft deshalb durchgehend über `lvposition`, wo der
Preis fertig in der Zeile steht; die 30 Ausnahmen behalten die Sammelposition
mit dem korrekten Belegbetrag und werden im Bericht benannt.

Struktur des `nlv`-Modells, falls die 30 doch von Hand nacherfasst werden:
`title_id` und `sortorder` sind **unbenutzt** (alle NULL) — die Reihenfolge
macht `autoid`. Die Zeilenart steckt allein in `price_id`: gesetzt = Position
(177 446 Zeilen), NULL = Titel oder Text (64 182). Zwischen Titel und Text
unterscheidet das Altsystem nicht.

Der Einheitspreis steht dort nirgends, er wird gerechnet — an einem Beleg mit
drei Positionen und Netto 467.50 auf den Rappen verifiziert:

```
EP    = mat_price × mat_factor + labor_amount × labor_factor × labor_rate
Total = quantity × EP
```

`mat_loss` ist ein Faktor (0…1,15), `mat_discount` dagegen Prozent (0…100) —
die beiden sind NICHT gleich skaliert.

Die Verteilung von `module_id` in `lvposition`:

| `module_id` | Bedeutung | Positionen | Belege |
|---|---|---|---|
| **2** | **Offerte** | 425 408 | 5 057 |
| **4** | **Rechnung** | 203 805 | 7 598 |
| 18 | vermutlich `lvmuster` (LV-Vorlagen) | 2 779 | 32 |

Nachgewiesen über die Belegsummen: `SUM(lvposition.total)` trifft bei
`module_id=2` in **3 375** Fällen den Offertbetrag, aber nur in 3 Fällen einen
Rechnungsbetrag; bei `module_id=4` sind es **6 343** Rechnungen gegen 3 Offerten.
Eindeutiger geht es nicht. Dass die Quote nicht bei 100 % liegt, ist normal —
Belegrabatte, Akonto-Abzüge und nachträgliche Änderungen verschieben die Summe.

Für `module_id=18` liegen die `item_id` zwischen 11 und 79, was zum ID-Bereich
von `lvmuster` (7…76, 18 Vorlagen) passt und nicht zu `services` (1…440).
Nicht bewiesen, aber plausibel — und mit 32 Belegen ohnehin ohne Gewicht.

> **Aufträge (`rapporte`) haben keine eigenen Positionen.** Es gibt keinen
> `module_id`-Wert für sie. Der Auftrag ist im Altsystem ein Disponier- und
> Ausführungsbeleg; die Positionen hängen an Offerte und Rechnung. Das deckt
> sich mit dem Hinweis im heutigen Importer, der Auftrags-Export führe keine
> Beträge.

#### `postyp` → GEMA-Positionsart

Die Bedeutung ergibt sich aus dem Strukturmuster (Menge/Preis/Einheit vorhanden?
NPK-Bezug? Unterposition?):

| `postyp` | Anzahl | Muster | GEMA `art` |
|---|---|---|---|
| 11 | 289 901 | Menge · Preis · Einheit · Total, 88 % mit NPK-Bezug | `frei` — die normale Leistungsposition |
| 20 | 133 343 | kein Preis, kein Total, 99,9 % mit Parent, Ø 57 Zeichen | `text` — Beschreibungszeile zur Position |
| 10 | 70 998 | kein Preis, 33 % ohne Parent, Ø 54 Zeichen | `titel` |
| 21 | 61 418 | Menge · Preis · Einheit, 98 % NPK, praktisch immer mit Parent | `frei` — NPK-Untervariante |
| 9 | 48 259 | kein Preis, **100 % NPK**, Ø 18 Zeichen | `titel` — NPK-Gliederungsebene |
| 26 | 8 801 | Menge · Preis · Einheit · Total, **kein** NPK | `frei` — eigener Artikel |
| 12 | 6 688 | Menge · Preis · Total, alle ohne Parent, Ø 9 Zeichen | `frei` |
| 19 | 3 556 | kein Preis, kein NPK | `text` |
| 16 · 15 · 13 · 22 · 25 | 7 075 zusammen | Menge · Preis · Total, kurze Texte | `frei` |
| 27 | 1 836 | **keine Menge**, aber Preis · Einheit · Total, alle top-level, Ø 79 Zeichen | `zuschlag` bzw. Pauschale |
| 18 · 28 | 133 | Randfälle | vor dem Import an Stichproben prüfen |

Damit sind 99,8 % der 632 008 Positionen abgedeckt. Die fünf kleinen Typen
(16/15/13/22/25) und die beiden Randfälle brauchen vor dem Import je eine
Stichprobe von ein paar Zeilen — dort geht es um zusammen 1,1 % des Bestands.

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

## 4. Stand des Importers

`gema_erp_import.js` (3116 Zeilen, **15 Abschnitte**, idempotent über `extId`)
liest **nur XLSX und CSV** — kein SQL, kein `.frm`. Der Weg bleibt also:
Alt-DB → `SELECT` mit JOINs → eine flache Datei je Abschnitt → Import-Assistent.

Ausgangslage waren 5 Abschnitte (Objekte, Adressen, Offerten, Aufträge,
Rechnungen), alle nur als Kopfdaten. Heute:

| # | Abschnitt | Ziel | Export | Zeilen |
|---|---|---|---|---|
| 1 | Zahlungsbedingungen | `org.settings.erp.zahlbed` | 8.1 | ~20 |
| 2 | Artikelstamm | `erpkat:` | 8.2 | 15 888 |
| 3 | Objekte / Liegenschaften | `objekt:` | **8.0** | 4 173 |
| 4 | Adressen / Kunden | Adressstamm | 8.7 | 6 627 |
| 5 | Bezugspersonen | `objekt.bezugspersonen[]` | 8.12 | 12 992 |
| 6 | Offerten | `erpdok:` | **8.0** | 6 321 |
| 7 | Aufträge | `erpdok:` | **8.0** | 9 723 |
| 8 | Rechnungen | `erpdok:` | **8.0** | 10 328 |
| 9 | Positionen | LV am Beleg | 8.3 | 632 008 |
| 10 | Zahlungen | `doc.zahlungen[]` | 8.5 | — (leer, siehe 8.8) |
| 11 | Kreditoren | `erpkred:` | 8.6 | 12 310 |
| 12 | Anlagen (Service) | `svanl:` (sv_service) | 8.10 | 406 |
| 13 | Termine | `einsatz:` (pm_einsatzplan) | 8.9 | 6 739 |
| 14 | Stunden | `std:` (pm_stunden) | 8.11 | 91 586 + mobil |
| 15 | Ferien-/Überzeitüberträge | `std:` mit `typ:'uebertrag'` | 8.13 | ~300 |

Offen bleiben nur bewusste Auslassungen (NPK-Katalog, Fibu-Schnittstelle,
Post-Adressdatenbank) — siehe 6 und 7.

---

## 5. Reihenfolge

Sie ergibt sich aus den Fremdschlüsseln — jede Stufe braucht die vorherige und
ist im Importer als `IMPORT_REIHENFOLGE` hinterlegt, der Assistent sortiert
danach:

```
zahlbed → artikel → objekte → adressen → bezugspersonen
        → offerten → auftraege → rechnungen
        → positionen → zahlungen → kreditoren
        → anlagen → termine → stunden → uebertraege
```

Die Abhängigkeiten dahinter: Positionen und Zahlungen hängen sich an einen
fertigen Beleg, Kreditoren an den Auftrag, Termine an Auftrag und Person,
Stunden an Termin und Person, Überträge an die Person. Die Konditionen stehen
zuoberst, weil erst sie den Belegen die richtige Zahlungsfrist geben.

---

## 6. Offene Punkte

### 6.0 Nachschlagetabellen — ausgezählt am 2026-09-07

Vier Zuordnungen waren generisch geschrieben. Die Zählung gegen die
Nachschlagetabellen (Abfrage in 8.14) hat drei echte Fehler aufgedeckt:

| Wert | Zeilen | vorher | jetzt |
|---|---|---|---|
| Offerte «In Bearbeitung» | 2 387 | fiel durch → «versendet» | **entwurf** |
| Offerte «Versandt» | 784 | fiel durch (Status zufällig richtig, aber als unbekannt gemeldet) | **versendet**, erkannt |
| «A-Konto-Rechnung» | 1 479 | fiel durch → «Einzelrechnung» | **akonto** |

Die Akonto-Rechnung ist der teuerste der drei: die Schlussrechnung zieht die
Akonti ab, eine falsch eingeordnete fehlt in diesem Abzug. Ursache war der
Bindestrich — `/akonto/` trifft «A-Konto-Rechnung» nicht.

**Der Auftragsstatus war korrekt.** Alle fünf benutzten Werte treffen
(«Erledigt, Rapport zurück» 9 610 · «Nicht begonnen» 394 · «Laufende Arbeit»
209 · «Storniert» 84 · «Erledigt, Rapport verloren» 2); nur «Offerte» (1 Beleg)
und «Wartet» (0) fallen durch und werden gemeldet. Die Arbeitsarten (`arbtyp`)
sind praktisch unbenutzt — 17 Termine über alle 21 Arten — und bleiben Vermerk.

#### `absenz` ist kein Absenzkatalog

Der wichtigste Fund. In derselben Spalte stehen drei verschiedene Dinge:

| Gruppe | Beispiele | Behandlung |
|---|---|---|
| echte Abwesenheiten | Ferien 419 · Schule 454 · Unfall 130 · Krankheit 116 · Feiertage 108 · Militär 47 · Brücke 36 · ÜK 33 · Zivildienst 6 · Kompensation 4 | → GEMA-Absenztyp |
| **Arbeit** | **Werkstatt 87 (+170 mobil) · Sitzung 22 · Büro 10 (+47) · Garantiearbeit · Teamevent** | **bleibt Einsatz** |
| Zuschlagsarten | Stundenzuschlag, Nachtzuschlag, Kompensation Typ B/Zuschläge/Vorholzeit | alle unbenutzt |

Die alte Regel «Feld gesetzt = abwesend» hätte **119 Arbeitstermine zu
Abwesenheiten** gemacht. `ABSENZ_MAP` in `gema_erp_import.js` trennt die drei
Gruppen; unbekannte Arten (Kurs 116, Arztbesuch 4, Privat 1, «Bezahlte
Absenzen» 2) bekommen **keinen erfundenen Typ**, sondern werden benannt — ob
«Kurs» Berufsschule, ÜK oder Weiterbildung ist, entscheidet die Personalstelle,
nicht der Name. Für sie gibt es in GEMA eigene Absenzarten (⚙️-Einstellungen).

> **`absenz.paid` taugt NICHT als Kriterium.** Im Bestand steht es bei «Ferien»
> auf 0 und bei «unbezahlter Urlaub» und «unbezahlte Absenzen» auf 1. Was die
> Spalte bedeutet, ist damit offen; sie wird nicht ausgewertet. Das korrigiert
> die frühere Aussage, `paid` entscheide mit.

Erkannte Absenzen werden in der Zeiterfassung jetzt zur **GEMA-Absenz am Tag**
statt zu einem Arbeitseintrag. Ohne das zählte ein Ferientag als geleistete
Zeit *und* als null bezogene Ferien — der Feriensaldo wäre zu hoch und die
Ist-Zeit ebenfalls.

**Feiertage (108 Termine)** sind eigens markiert: GEMA führt sie im
Firmenkalender (`org.settings.stunden.feiertage`), nicht als Abwesenheit. Der
Termin entsteht als «Abwesend», die Meldung verweist auf den Kalender.

#### Noch offen: die Einheit von `hours.hrs_length`

Die 296 Absenzzeilen der mobilen Erfassung ergeben `SUM(hrs_length)/60` =
46 275 — also 9 380 pro Zeile. Als Minuten wären das 156 h für einen einzelnen
Eintrag, als Sekunden 2.6 h. Sekunden ist damit die einzig plausible Lesart,
**belegt ist sie nicht**. Der Export in 8.11 reicht `hrs_length` bisher
ungerechnet als «Stunden» durch.

Bis das geklärt ist, weist der Importer jede Zeile über **24 h an einem Tag als
Fehler zurück** und meldet ab 16 h. Damit kann der Fehler nicht mehr
unbemerkt durchlaufen; die Umrechnung gehört in den Export, sobald die Einheit
feststeht (Gegenprobe: eine `hours`-Zeile mit ihrem Termin über
`hrs_terminguid` vergleichen — `termin.stunden` führt Dezimalstunden).

Der Zahlungsstatus (`debistatus`) ist ausgezählt und vollständig zugeordnet,
ebenso `postyp`, `module_id` und der Revisionszyklus. Der MwSt-Satz wird aus
den Beträgen des Belegs gerechnet statt aus einer Tabelle geraten; die
Bezugspersonen-Rollen (`krit`) werden als Adresstyp angelegt, wie sie heissen —
beides ist zuordnungsfrei.

### Beantwortet durch die Zählung vom 2026-09-07

| Frage | Antwort |
|---|---|
| `lvposition` oder `nlvposition`? | **Beide**, plus der Alt-Blob `lvdata`. Der Import muss `lvposition` (632 008) und `nlvposition` (241 628) lesen; `lvdata` bleibt draussen. |
| `stunden` oder `nstunden`? | **Beide** — `nstunden` ist die Tagesebene unter `stunden` (`stunden_id`). |
| Welche MwSt-Tabelle? | **`mwst`** (10 Sätze). `mwst_legacy` (15) ist historisch, `abamwst` ist leer. |
| Mandantenfähigkeit? | **Ein Mandant.** Alle Belege tragen dieselbe `company_id` → eine `orgId` in GEMA. |
| Bestell-/Lagerwesen? | **Nicht genutzt** (`orders`, `orderposition`, `stock*` alle leer) → aus dem Umfang gestrichen. |

### Geklärt: `companydata` ist ein lückenfüllender Overlay

Die Gegenprobe entwarnt. Die Tabelle hat **genau eine Zeile je
(Tabelle · Datensatz · Feld)** — 8 207 Zeilen auf 8 207 Schlüssel. Also kein
Versionsverlauf, sondern ein echter Overlay, und alles unter einer `company_id`.

Für `adressen.zahlbedid`:

| Fall | Anzahl |
|---|---|
| Basisspalte leer, Overlay gefüllt | 1 445 |
| beide gefüllt, identisch | 159 |
| **beide gefüllt, verschieden** | **25** |
| Overlay leer | 9 |

> **Korrektur.** Die frühere Zahl «1 463 abweichend» war ein Artefakt meiner
> Abfrage — sie zählte «Basis leer gegen Overlay gefüllt» als Abweichung.
> Tatsächlich füllt der Overlay in 89 % der Fälle eine **Lücke** und
> widerspricht nur in **25 Fällen**. Das Risiko ist damit klein und beherrschbar.

Die Werteverteilung bestätigt die Richtung: `adressen.zahlbedid` ist bei 6 061
von 6 627 Adressen leer, während der Overlay 1 629-mal «01» trägt. Die
Zahlungsbedingung ist im Lauf der Jahre aus der Basisspalte nach `companydata`
gewandert; die Basisspalte ist der Altbestand.

**Regel für den Import** (gilt sinngemäss auch für `pk_debi`, `stdrabatt`,
`stdskonto` und die `adrkre`-Konditionen):

```
Wert = Overlay aus companydata
     ?? Basisspalte
     ?? Firmen-Standard
```

Die 25 echten Konflikte sind mit dieser Regel abgedeckt; eine Stichprobe im
ERP-UI bestätigt sie oder deckt die Ausnahme auf.

### Fallen beim Zahlungsbedingungs-Import

Aus `paymentterm` (13 Einträge, Schweizer Standardkonditionen von «per sofort»
bis «14 T 3%, 30 T 2%, 60 T netto`):

1. **Verknüpft wird über `shortcut`, nicht über `autoid`.** `adressen.zahlbedid`
   ist CHAR(10) und enthält «01», «02», «05» … — also das Kürzel.
2. **Die Kürzel sind Strings mit führender Null.** «00» ist ein gültiger Wert
   (60 Tage netto), nicht «leer». In JavaScript nie über `parseInt` verarbeiten:
   `parseInt('00') || standard` liefert den Standard statt 60 Tage.
3. **`skonto1` ist FLOAT und krumm gespeichert**: 3 % steht als
   `2.9999999329447746`, 2 % als `1.9999999552965164`, 4 % als
   `3.999999910593033`. Beim Import **auf zwei Stellen runden**, sonst zeigt
   GEMA «2.9999999 %».
4. Ein Eintrag (`autoid` 14, «10 Tage 3%, 30 Tage netto») hat ein **leeres
   Kürzel** und ist darum von keiner Adresse referenzierbar — vermutlich eine
   Leiche. Beim Import ignorieren, aber nicht stillschweigend: melden.

### Noch zu klären

1. **Format von `sigmonteur` / `sigcustomer`** (LONGTEXT) — Base64-PNG oder SVG?
   Entscheidet, ob die Unterschriften auf Offerten und Rapporten übernommen
   werden können.

2. **Stichproben für die seltenen `postyp`-Werte** 16, 15, 13, 22, 25, 18, 28
   (zusammen 1,1 % der Positionen) — je fünf Zeilen genügen.

3. **`artikel.Calculation`** ist LONGBLOB, vermutlich serialisiertes
   Delphi-Format. `calcdata` (38 396 Zeilen) führt die Kalkulation relational
   und ist die bessere Quelle — der Blob wird voraussichtlich nicht gebraucht.

---

## 6a. Entscheidungen des Auftraggebers (2026-09-07)

**Fibu-Anbindung Sesam bleibt vorerst bestehen**, die Umsetzung der
Schnittstelle ist noch offen. Daraus folgt für die Migration:

> **Schlüsselfelder mitnehmen, Schnittstelle später bauen.** `pk_debi`,
> `pk_kredi`, `sesam_pk_nr`, `sesam_op_nr`, `abacbelegnr`, die Kontonummern aus
> `abt` (`ekonto`, `akkonto`, `bkkonto`, `ckkonto`, `lkkonto`, `dkkonto`) und
> `kostenst.sesamcode` wandern als Textfelder an Kunde und Beleg mit.

Die Asymmetrie ist der Grund: eine Schnittstelle lässt sich jederzeit nachbauen,
die Zuordnung von 6 627 Kunden zu ihren Sesam-Personenkonten nicht. Das
Mitnehmen kostet fast nichts, das Weglassen wäre teuer und kaum reparabel.

Die Schnittstelle selbst wäre ein einseitiger Export von Buchungssätzen
(Belegnummer, Datum, Konto, Gegenkonto, Betrag, MwSt-Code, Kostenstelle,
Personenkonto). Technisch überschaubar; die Risiken liegen in der
Kontierungslogik (falscher MwSt-Code = falsche ESTV-Abrechnung) und in der
Idempotenz (ein «übergeben»-Kennzeichen je Beleg, sonst driftet die
Debitorenbuchhaltung von der Fakturierung weg). Unbekannt ist Sesams
Importformat — das steht in deren Dokumentation.

**Historie: falls migriert wird, dann vollständig.** Technisch unkritisch:
die 873 636 Positionen verteilen sich auf rund **16 600 Belege** (Aufträge
tragen keine), das sind 16 600 Datensätze zu je etwa 10 KB. GEMAs Schwelle für
Sonderbehandlung liegt bei 300 KB je Datensatz. Die 7,4 GB der Altdatenbank
sind fast vollständig der `lvdata`-Blob, der draussen bleibt.

**Ob überhaupt migriert wird, ist offen.** Die Analyse behält ihren Wert auch
dann: sie beziffert, was der Wechsel kostet, und dokumentiert die
Datenlandschaft des Altsystems.

---

## 7. Was für eine saubere Übernahme noch fehlt

### 7.1 Neue Importer-Sektionen

`gema_erp_import.js` hat heute fünf Sektionen und holt bei den Belegen nur die
Kopfdaten. Es fehlen:

| Sektion | Quelle | Umfang | Bemerkung |
|---|---|---|---|
| **Stammdaten** | `paymentterm`, `mwst`, `kostenst`, `abt`, `arbeiter` | 265 Zeilen | Voraussetzung für alles Weitere |
| **Positionen** | `lvposition` + `nlvposition`/`nlvprice` | 873 636 | beide Modelle lesen, an die Belege hängen |
| **Zahlungen** | `rechnungen.zahlungsdatum` / `.zahlungsbetrag` | 10 328 | ersetzt den Stichtag-Behelf |
| **Kreditoren** | `kreditoren` + `kredzut` | 27 044 | inkl. Freigabe-/Kontrollvermerke |
| **Artikelstamm** | `abarticle` + `abchapter`/`absheet`/`abtitle`/`abline` | 15 888 | → `erpkat:` |
| **Bezugspersonen** | `zuhand` + `contact` + `contactkrit` | ~54 000 Zuordnungen | → `objekt.bezugspersonen[]` |
| **Termine** | `termin` | 7 000, davon etliche bis 2027-07 | → `einsatz:` (pm_einsatzplan) |
| **Anlagen** | `services` + `apparate` + `komponenten` | 394 Anlagen, **184 mit künftiger Revision** | → `svanl:` (sv_service) |
| **Stunden** | `nstunden` + `stunden` (+ `hours`) | 91 586 Tageszeilen | → `std:` (pm_stunden) |

**Die drei zuletzt genannten entsprechen den Modulen «Termine», «Anlagen» und
«Stunden» in der Modulleiste des Altsystems** und waren im ersten Wurf nicht
abgedeckt. Zwei davon sind operativ kritisch, unabhängig von der Frage, wie
viel Historie übernommen wird:

- **Termine reichen bis 28. Juli 2027.** Das ist die geplante Arbeit der
  nächsten Monate, nicht bloss Dokumentation. 4 887 hängen an einem Auftrag,
  1 605 sind Abwesenheiten, 1 950 stammen aus Serien.
- **184 von 394 Anlagen haben eine Revision in der Zukunft** (bis 2037). Das
  ist der aktive Wartungskalender — der einzige Bestand hier, dessen Verlust
  unmittelbar Umsatz kostet.

**`hours` ist die dritte Stunden-Generation und weitgehend redundant**: sie
deckt nur 2025-12 bis 2026-09 ab, und 5 183 ihrer 5 212 Einträge haben am
selben Tag bereits einen `nstunden`-Eintrag. Sie darf trotzdem mitgelesen
werden — der Importer dedupliziert über Mitarbeiter · Datum · Auftrag und
meldet, wenn zwei Quellen für denselben Schlüssel verschiedene Stunden
liefern. Damit gehen die 29 fehlenden Tage nicht verloren und nichts zählt
doppelt.

**Kriterien sind kein eigenes Modul**, sondern die Rolle einer Person
(`krit`, 32 Einträge: Bewohner 7 040 · Besteller 5 839 · Eigentümer 3 441 ·
Mieter 3 354 · Bauherr · Architekt · Verwalter · «Schlüssel bei» …). Sie
wandern als Adresstyp mit den Bezugspersonen mit. Zwei Auffälligkeiten:
«Kontakt» existiert doppelt (1 480 und 320 Zuordnungen), und elf Kriterien
haben null Zuordnungen — darunter vier «Programm …»-Einträge, die auf
geplante Serviceprogramme hindeuten.

Nicht migriert: `terminsmscontact` (leer), `stdtot`/`spesen` (Wochentotale und
Spesen — GEMA rechnet die Totale selbst).

**Korrektur zu `arbueber`:** hier stand, die Salden müssten von Hand gesetzt
werden. Das war zu kurz gegriffen — die Tabelle ist in Betrieb (Zeilen in
jedem Jahr 2016–2026, davon 41 auf 26 Mitarbeitende allein 2026) und
`arbeiter.ferien` ist bei allen 46 Aktiven NULL, das Guthaben steht also
ausschliesslich hier. Sie hat einen eigenen Abschnitt bekommen (8.13).

### 7.2 Felder, die in GEMA zu ergänzen sind

Klein, aber ohne sie geht Information verloren:

- **Position**: `verschnitt`, `zeit_faktor` — die übrige Kalkulation
  (`leitfaden_zeit`, `ansatz`, `einkaufs_rabatt`, Materialquelle) hat in GEMA
  bereits ihre Entsprechung.
- **Position**: NPK-Herkunft (`SChapter`/`sbuchnr`/`SPos`) als Textfeld, damit
  nachvollziehbar bleibt, woher eine Position stammt.
- **Beleg und Kunde**: die Fibu-Schlüssel als Textfelder — `pk_debi`,
  `pk_kredi`, `sesam_pk_nr`, `sesam_op_nr`, `abacbelegnr`, `kostenst_id`.
- **Kunde**: `stdrabatt`, `stdskonto`, `eBillID`, `Rechnung_Email`.

### 7.3 Zwei Punkte, die leicht vergessen gehen

1. **Belegnummern fortführen.** GEMA muss oberhalb der höchsten bestehenden
   Offert-, Auftrags- und Rechnungsnummer weiterzählen, sonst kollidieren neue
   Belege mit importierten. Vor dem Import je Nummernkreis das Maximum
   ermitteln und den Startwert setzen.

2. **Anhänge liegen im Dateisystem, nicht in der Datenbank.** Zwölf Tabellen
   führen eine Spalte `lkdir` (dazu `lkmobiledir`): `adressen`, `arbeiter`,
   `kreditoren`, `obj`, `offerten`, `orders`, `rapporte`, `rechnungen`,
   `services`, `spesen`, `stdtot`, `license`. Jeder Datensatz zeigt damit auf
   einen Ordner auf einem Netzlaufwerk. Diese Dokumente — Pläne, Belege,
   Korrespondenz — sind ein **eigener Migrationsstrang** (nach GemaStorage,
   Bucket `gema-fotos`, Pfadmuster `<bereich>/<orgId>/…`) und in den Zahlen
   dieser Analyse nirgends enthalten.

### 7.4 Kleinigkeiten zu klären

- Format von `sigmonteur` / `sigcustomer` (Base64-PNG oder SVG?)
- Bedeutung der sieben seltenen `postyp`-Werte (1,1 % der Positionen)
- Die `companydata`-Regel an drei Kunden im ERP-UI bestätigen

### 7.5 Die eine echte Entscheidung: NPK-Katalog

88 % der Positionen tragen einen NPK-Bezug — Offerten entstehen also aus dem
Normpositionen-Katalog. GEMA hat die **Rechenlogik** dafür bereits
(Kalkulationsmodelle je NPK-Kapitel, «Leitfadenzeit × Verkaufsansatz»,
Materialquelle «aus dem NPK»), aber nicht den **Katalog zum Anklicken**.

Das lizenzierte CRB/SSIV-Material darf nicht aus dem Altsystem mitwandern. Für
neue Offerten aus dem Katalog braucht es eine eigene CRB-Lizenz und einen
Import über **SIA 451** — das Format, das `pm_crbx` bereits liest.

Ohne diesen Schritt funktioniert der **Rückblick vollständig** (alle
importierten Belege inklusive Positionen, NPK-Nummern und Kalkulation), und
neue Belege entstehen aus Vorlagen und dem eigenen Artikelstamm. Das ist
arbeitsfähig, aber eine Umstellung.

**Leitfrage für die Entscheidung:** Wie oft entsteht eine Offerte aus dem
Katalog statt aus einer Vorlage? Ist das der Regelfall, gehört der
Katalog-Import ins Migrationsprojekt. Ist es die Ausnahme, kann er warten.

---

## 8. Export-Abfragen für den Importer

`gema_erp_import.js` liest CSV und XLSX, kein SQL. Der Weg ist je Abschnitt:
`SELECT` → CSV → Import-Assistent in `pm_erp` («Migration»). Die Spaltennamen
unten sind so gewählt, dass die automatische Zuordnung greift.

**CSV statt XLSX exportieren**, wo Kürzel mit führender Null vorkommen — Excel
macht aus «01» die Zahl 1 und aus «00» eine 0. Der Importer meldet das zwar,
aber der Umweg kostet einen Durchgang.

Reihenfolge einhalten (Abschnitt 5): Stammdaten → Adressen/Objekte → Belege →
Positionen/Zahlungen → Kreditoren.

### 8.0 Die vier Grundexporte

Die Abfragen für Objekte, Offerten, Aufträge und Rechnungen — die Spaltennamen
sind gegen `erkenneMapping` geprüft, alle Pflichtfelder werden erkannt. Der
Adress-Export steht vollständig in 8.7.

**Objekte** (4 173) — die Bezugspersonen kommen separat über 8.12:

```sql
SELECT o.id, o.strasse, o.strasse2, o.plz, o.ort, o.egid, o.egrid,
       o.knummer, o.co_knummer, o.ei_knummer, o.korr_name,
       o.objekt1, o.objekt2, o.objmemo AS notiz,
       o.extref1 AS ref1, o.extref2 AS ref2,
       TRIM(CONCAT(COALESCE(mad.vorname,''),' ',COALESCE(mad.name1,''))) AS monteur_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name
FROM obj o
LEFT JOIN arbeiter ma ON ma.id = o.monteur_id  LEFT JOIN adressen mad ON mad.id = ma.adr_id
LEFT JOIN arbeiter sa ON sa.id = o.sachb_id    LEFT JOIN adressen sad ON sad.id = sa.adr_id;
```

**Offerten** (6 321):

```sql
SELECT o.id, o.offert_nr, o.datum, o.rdatum, o.betrmemo,
       st.typ_text AS status_text, ty.typ_text AS offerttyp_text,
       o.obetrag, o.mwstbetrag, o.tostunden,
       o.knummer AS kundennummer, o.name1, o.korr_name, o.anschrift, o.banrede,
       o.strasse, o.strasse2, o.plz, o.ort, o.egid, o.egrid,
       o.zahlbedid, o.bemerkung, o.wohnung, o.wohn_standort,
       o.extref2 AS ref2, ab.name1 AS abt_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name
FROM offerten o
LEFT JOIN offstatus st ON st.id = o.status
LEFT JOIN offtyp    ty ON ty.id = o.offerttyp
LEFT JOIN abt       ab ON ab.id = o.abt_id
LEFT JOIN arbeiter  sa ON sa.id = o.sachb_id  LEFT JOIN adressen sad ON sad.id = sa.adr_id;
```

**Aufträge** (9 723) — inklusive Nachkalkulations-Schnappschuss (siehe 3.4):

```sql
SELECT r.id, r.rapport_nr, r.best_datum, r.betrifft, r.arbeit,
       ast.typ_text AS astatus_text, rst.typ_text AS rstatus_text,
       o.offert_nr, re.nr AS rechnung_nr, r.bemerkung,
       r.name1, r.korr_name, r.anschrift, r.telefon,
       r.strasse, r.strasse2, r.plz, r.ort, r.egid, r.egrid,
       r.schlussel, r.schlu_tel, r.besteller, r.best_tel,
       r.wohnung, r.wohn_standort, r.wohn_tel, ab.name1 AS abt_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name,
       JSON_OBJECT('nkrnbh',r.nkrnbh,'nkrmat',r.nkrmat,'nkrfaktor',r.nkrfaktor,
                   'nkbez',r.nkbez,'nkofftot',r.nkofftot,'nkoffmat',r.nkoffmat,
                   'nkoffnbh',r.nkoffnbh,'nkoffph',r.nkoffph,'nkfaktor',r.nkfaktor,
                   'nkgewp',r.nkgewp,'nkwstup',r.nkwstup,'nkwmatp',r.nkwmatp,
                   'nkspesen',r.nkspesen) AS nachkalk
FROM rapporte r
LEFT JOIN arbstatus  ast ON ast.id = r.astatus
LEFT JOIN rechstatus rst ON rst.id = r.rstatus
LEFT JOIN offerten   o   ON o.id   = r.offerte_id
LEFT JOIN rechnungen re  ON re.rapport_id = r.id
LEFT JOIN abt        ab  ON ab.id  = r.abt_id
LEFT JOIN arbeiter   sa  ON sa.id  = r.sachb_id  LEFT JOIN adressen sad ON sad.id = sa.adr_id;
```

> Der Join auf `rechnungen` kann einen Auftrag vervielfachen, wenn mehrere
> Rechnungen daran hängen (Akonto + Schluss). Das ist gewollt — der Importer
> erkennt den Auftrag an `rapport_nr` und ergänzt nur; wer es sauberer mag,
> nimmt `re.nr` heraus und lässt die Verknüpfung über den Rechnungs-Export
> laufen, der die Auftragsnummer ohnehin mitführt.

**Rechnungen** (10 328) — ersetzt 8.8, die Fibu-Spalten sind hier schon drin:

```sql
SELECT r.id, r.nr, r.rapport_nr, r.datum, r.betrifft, r.arbeit,
       ty.typ_text  AS typ_text,
       ast.typ_text AS astatus_text,
       ds.typ_text  AS debistatus_text,
       r.rbetrag, r.mwstbetrag,
       r.name1, r.korr_name, r.anschrift, r.adr_id,
       r.strasse, r.strasse2, r.plz, r.ort, r.egid, r.egrid,
       r.zahlbedid, r.ausgef, r.belegnr, r.opdebi, r.faelligdatum,
       r.bemerkung, r.wohnung, r.besteller, r.wohn_standort,
       r.post_info_date AS postinfodate, r.print_info AS printinfo,
       r.kostenst_id AS kostenstid, r.extref1, r.extref2,
       ab.name1 AS abt_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name
FROM rechnungen r
LEFT JOIN rechtyp     ty  ON ty.id  = r.typ
LEFT JOIN rechastatus ast ON ast.id = r.astatus
LEFT JOIN debistatus  ds  ON ds.id  = r.debistatus
LEFT JOIN abt         ab  ON ab.id  = r.abt_id
LEFT JOIN arbeiter    sa  ON sa.id  = r.sachb_id  LEFT JOIN adressen sad ON sad.id = sa.adr_id;
```

> **Die ESR-Referenz ist keine Spalte.** `rechnungen` führt nur `esr_bankid`
> und `esr_price`; die 27-stellige Referenz baut das Altsystem beim Druck aus
> Bank-ID und Belegnummer. GEMA erzeugt sie beim Nachdruck ebenso selbst
> (Mod10). Wer eine bestehende Referenz erhalten will, muss sie im Export
> zusammensetzen — der Importer prüft sie dann und übernimmt nur gültige.

### 8.1 Zahlungsbedingungen

```sql
SELECT shortcut, description, days_netto, days1, skonto1, fibucode
FROM paymentterm ORDER BY shortcut;
```

### 8.2 Eigener Artikelstamm

```sql
SELECT c.text AS katalog, a.guid, a.artref, a.text, a.unit, a.price, a.dim,
       a.mat_price, a.einkaufs_rabatt, a.verschnitt, a.leitfaden_zeit, a.ansatz
FROM abarticle a
LEFT JOIN abchapter c ON c.guid = a.chapterguid
ORDER BY c.text, a.sort;
```

### 8.3 Positionen (`lvposition` — 632 008 Zeilen)

Die Belegnummer wird mitgeliefert, weil der Importer daran anknüpft. Weil
`module_id` 2 auf `offerten` und 4 auf `rechnungen` zeigt, braucht es zwei
Zweige:

```sql
SELECT 2 AS module_id, o.offert_nr AS nr, p.autoid AS sort, p.postyp,
       p.SPos, p.text, p.qty, p.unit, p.price, p.total, p.dim,
       p.SChapter, p.sbuchnr,
       p.leitfaden_zeit, p.zeit_faktor, p.ansatz,
       p.mat_price, p.mat_faktor, p.einkaufs_rabatt, p.verschnitt
FROM lvposition p JOIN offerten o ON o.id = p.item_id
WHERE p.module_id = 2
UNION ALL
SELECT 4, r.nr, p.autoid, p.postyp,
       p.SPos, p.text, p.qty, p.unit, p.price, p.total, p.dim,
       p.SChapter, p.sbuchnr,
       p.leitfaden_zeit, p.zeit_faktor, p.ansatz,
       p.mat_price, p.mat_faktor, p.einkaufs_rabatt, p.verschnitt
FROM lvposition p JOIN rechnungen r ON r.id = p.item_id
WHERE p.module_id = 4
ORDER BY 1, 2, 3;
```

> **In Jahresscheiben exportieren.** Der Import läuft im Browser; ab etwa
> 50 000 Zeilen wird er sehr langsam und kann am Arbeitsspeicher scheitern.
> Der Assistent warnt davor, aber besser gleich schneiden — etwa mit
> `AND YEAR(o.datum) = 2024` je Zweig.

### 8.4 Positionen aus dem `nlv`-Modell — entfällt

Der Abgleich in Abschnitt 3.6 hat gezeigt, dass 99,7 % dieser Belege auch in
`lvposition` stehen. Der Zweig wird **nicht** exportiert.

Die 30 Belege, die es nur dort gibt, findet diese Abfrage — sie behalten beim
Import die Sammelposition und lassen sich bei Bedarf von Hand nacherfassen:

```sql
SELECT n.module_id, n.item_id,
       CASE n.module_id WHEN 2 THEN 'Offerte' WHEN 4 THEN 'Rechnung' END art
FROM nlv n
WHERE NOT EXISTS (SELECT 1 FROM lvposition p
                   WHERE p.module_id = n.module_id AND p.item_id = n.item_id)
ORDER BY 1, 2;
```

### 8.5 Zahlungen

```sql
SELECT nr, zahlungsdatum, zahlungsbetrag
FROM rechnungen
WHERE zahlungsbetrag IS NOT NULL AND zahlungsbetrag <> 0;
```

### 8.6 Kreditoren

```sql
SELECT k.id, k.nr, k.name1, k.belegnr, k.datum, k.faelligdatum,
       k.betrag, k.mwstbetrag, k.restbetrag, k.kredistatustext,
       k.gkonto, k.kostenst_id, k.iban, k.esr_nr, k.sesam_op_nr, k.bemerkung,
       (SELECT r.rapport_nr FROM kredzut z
          JOIN rapporte r ON r.id = z.rapport_id
         WHERE z.kred_id = k.id ORDER BY z.id LIMIT 1) AS rapport_nr,
       (SELECT COUNT(*) FROM kredzut z WHERE z.kred_id = k.id) AS zuteilungen
FROM kreditoren k;
```

> **259 von 14 287 Kreditoren sind auf mehrere Aufträge verteilt** (1,8 %; bis
> zu zehn Zuteilungen). GEMA führt einen Kreditor mit genau einem Auftrag —
> der Export nimmt darum den ersten. Die Spalte `zuteilungen` macht sichtbar,
> wo eine Aufteilung verloren geht; diese Belege sind nach dem Import von Hand
> zu prüfen.

### 8.7 Adressen — die Zusatzfelder

Der bestehende Adress-Export wird um Konditionen und Fibu-Schlüssel ergänzt.
`adressen.password` und `adrkre.igh_password` bleiben **draussen**:

```sql
SELECT a.oknummer AS knummer, a.name1 AS firma, a.anrede, a.vorname,
       a.name2 AS nachname, a.zuhand AS kontakt,
       a.strasse, a.strasse2, a.plz, a.ort, a.land,
       a.tel1 AS telefon, a.natel, a.email, a.bemerkungen,
       a.zahlbedid, a.stdrabatt, a.stdskonto,
       a.pk_debi, a.pk_kredi, a.eBillID, a.Rechnung_Email
FROM adressen a;
```

> Vor diesem Export den `companydata`-Overlay klären (Abschnitt 6): bei
> `zahlbedid` ist die Basisspalte bei 6 061 von 6 627 Adressen leer und der
> gültige Wert steht im Overlay. Der Export muss ihn also mitnehmen —
> `COALESCE(overlay, a.zahlbedid)`.

### 8.8 Rechnungen — die Fibu-Schlüssel

Zum bestehenden Rechnungs-Export kommen drei Spalten dazu:

```sql
SELECT r.nr, r.belegnr, r.abacbelegnr, r.opdebi, r.kostenst_id, r.zahlbedid,
       ds.typ_text AS debistatus, ast.typ_text AS astatustext
FROM rechnungen r
LEFT JOIN debistatus  ds  ON ds.id  = r.debistatus
LEFT JOIN rechastatus ast ON ast.id = r.astatus;
```

**`debistatus` ist der Zahlungsstand und gehört zwingend in den Export.**
Das Altsystem führt drei Statusfelder, und nur dieses sagt, ob kassiert wurde:

| Spalte | Nachschlagetabelle | Bedeutung |
|---|---|---|
| `typ` | `rechtyp` | Schluss- / Akonto- / Teilrechnung / Gutschrift |
| `astatus` | `rechastatus` | In Bearbeitung … Kontrolliert … Versandt |
| **`debistatus`** | **`debistatus`** | **Bezahlt (7 738) · Offen (1 986) · In Buchhaltung geschrieben (961) · Storniert · Kulanz · Garantie** |

Er bestimmt in GEMA den Belegstatus; der Bearbeitungsstand bleibt Vermerk.
«Kulanz» und «Garantie» (11 Belege) sind kein Zahlungsstand, sondern ein
Verzichtsgrund — sie entstehen als «gestellt» und werden gemeldet.

> **`rechnungen.zahlungsdatum` und `.zahlungsbetrag` sind durchgehend leer.**
> Über alle 7 738 bezahlten Rechnungen ergibt `SUM(zahlungsbetrag > 0)` NULL.
> Die Spalten existieren, werden aber nicht gefüllt — die Zahlungs-Sektion
> (8.5) bleibt darum ohne Wirkung, solange sich das nicht ändert. Der
> Zahlungsstand kommt allein aus `debistatus`. Das korrigiert die frühere
> Annahme, die Datenbank führe die Zahlungsinformation vollständig.

`belegnr` ist die **Fibu**-Belegnummer, nicht die Rechnungsnummer — der
Importer hält die beiden auseinander (`nr` wird zuerst zugeordnet).

---

### 8.9 Termine

```sql
SELECT t.guid, t.datum, t.von60, t.bis60, t.arbeit, t.absenz, t.arbtyp,
       t.stunden, t.location, t.serie_id, t.private_text,
       TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name,
       r.rapport_nr
FROM termin t
LEFT JOIN arbeiter a  ON a.id  = t.arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
LEFT JOIN rapporte r  ON r.id  = t.rapp_id
ORDER BY t.datum;
```

> **`von60`/`bis60`, nicht `von`/`bis`.** Die Tabelle führt zwei Zeitpaare, und
> die naheliegend benannten sind die falschen: `von60`/`bis60` tragen die
> Uhrzeit im Klartext (gemessen '07:00' … '9:45'), `von`/`bis` dagegen
> Dezimalzahlen (1.00 … 19.50). Aus einer «19.50» liesse sich weder 19:30 noch
> 19:50 belegen — der Importer deutet eine nackte Zahl deshalb NIE als Uhrzeit,
> sondern legt sie als `importZeitRoh` ab und meldet die Zeilen. Betroffen
> wären 6 924 der 7 000 Termine.

> **Zuerst die künftigen exportieren** (`WHERE t.datum >= CURDATE()`) — das ist
> die geplante Arbeit und der Teil, der beim Wechsel wirklich fehlen würde.
> Die Historie kann danach folgen.

Nicht übernommen: `timefrom`/`timeuntil` (bei allen 10 301 Rapportzeilen 0) und
`mehrtaegig` (durchweg 0 — es gibt im Altbestand keinen mehrtägigen Termin,
weshalb die feste Dauer von einem Tag im Importer korrekt ist).

### 8.10 Anlagen (Service)

**Massgebend ist die Komponente, nicht die Anlage.** Am Bestand gemessen:
`komponenten` führt 421 Geräte mit 228 künftigen Revisionen, `services` nur
394 mit 184 — und bei 36 von 369 Paaren weichen die beiden Ebenen voneinander
ab. Das gesperrte Rechenfeld sitzt ebenfalls im Komponenten-Formular. 378 der
379 Anlagen haben genau eine Komponente, eine hat 43; der Export ist deshalb
1:1 mit einer Ausnahme, die zu 43 GEMA-Anlagen wird.

```sql
SELECT k.id AS kom_id, k.kom_name, k.kom_sernr, k.kom_standort,
       k.kom_inst_datum, k.kom_garantie,
       k.kom_last_rev, k.kom_next_rev, k.kom_rev_int, k.kom_rev_toleranz,
       k.kom_calc_with_basis, k.kom_rev_basis, k.kom_rev_kosten,
       s.ser_app_fabrikaservapp, s.ser_app_typ, s.ser_vertragsnr,
       s.ser_strasse, s.ser_plz, s.ser_ort, s.ser_bemerkungen,
       ak.app_beschr AS kategorie, ab.name1 AS abt_name
FROM komponenten k
LEFT JOIN services s  ON s.id  = k.kom_ser_id
LEFT JOIN appkat   ak ON ak.id = s.ser_kat_id
LEFT JOIN abt      ab ON ab.id = s.ser_abt_id
WHERE COALESCE(s.ser_storniert,0) = 0
ORDER BY k.kom_next_rev;
```

Zwei Befunde aus der Verifikation:

- **Das nächste Revisionsdatum wird gerechnet, nicht gesetzt.** Im Formular ist
  es gesperrt, und 410 von 410 vergleichbaren Geräten stimmen exakt auf
  «letzte Revision + Intervall» (MySQL-Monatsarithmetik, im Importer als
  `addMonate` nachgebaut). GEMA rechnet es also selbst; der Wert des
  Altsystems bleibt nur als Vermerk am Datensatz.
- **Es gibt einen zweiten Modus**, «Revisionsbasis»: der Termin ankert an
  einem festen Datum, statt mit der Ausführung mitzuwandern. GEMA kennt ihn
  nicht. Betroffen sind **2 von 421** Geräten — sie werden im Bericht benannt
  und tragen den Alt-Termin sichtbar, statt still ein falsches Datum zu
  bekommen.

### 8.11 Stunden

**Die drei Tabellen sind keine Generationen, sondern drei Stufen desselben
Ablaufs** (Auskunft des Betriebs, den Daten nicht anzusehen):

1. **`termin.stunden`** — die Annahme aus der Disposition.
2. **`hours`** — was der Monteur auf dem Handy erfasst, mit dem Termin als
   Vorlage; er korrigiert dort bei Bedarf und trägt seine Spesen ein
   (`hrs_termin_id`, `hrs_spesen`, `hrs_comment`). Läuft erst seit 2025-12,
   weil die App neu ist.
3. **`nstunden` / `stunden`** — der Stand im Stundenmodul, den der
   Abteilungsleiter korrigiert, wenn etwas falsch erfasst wurde.

Für den Import folgt daraus: **eine Abweichung zwischen Stufe 2 und 3 ist kein
Konflikt, sondern die Korrektur.** Der freigegebene Wert gewinnt immer. Die
Spalte `quelle` sagt dem Importer, welche Stufe eine Zeile trägt.

> **`arbeiter` führt keinen Namen.** Die Tabelle hat nur ein Kürzel — und das
> auch nur bei 42 von 222 Personen. Der Klarname steht in `adressen`, verlinkt
> über `arbeiter.adr_id`. Ein Export über `kuerzel` liefert «MEI», und der
> Import fände dazu keinen GEMA-Benutzer: alle 91 586 Zeilen landeten ohne
> Person. Der Join über `adressen` ist deshalb Pflicht, hier und bei Terminen,
> Objekten und Belegen.

```sql
-- Datei 1: der freigegebene Stand (Hauptbestand, 2016 bis heute)
SELECT TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name,
       n.datum, n.stunden, n.rappnr,
       ty.beschr AS arbtyp, ab.kurz AS absenz,
       'freigegeben' AS quelle
FROM nstunden n
LEFT JOIN arbeiter a  ON a.id  = n.arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
LEFT JOIN arbtyp   ty ON ty.id = n.arbtyp
LEFT JOIN absenz   ab ON ab.id = n.absenz
WHERE n.stunden <> 0
ORDER BY n.datum;

-- Datei 2: die mobile Erfassung — bringt Spesen, Kommentar und den
-- Termin-Bezug mit, den Datei 1 nicht kennt
SELECT TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name,
       DATE(h.hrs_datetime) AS datum,
       h.hrs_length AS stunden, h.hrs_rapportnr AS rappnr,
       h.hrs_description AS arbtyp, h.hrs_spesen, h.hrs_comment,
       h.hrs_terminguid, 'erfasst' AS quelle
FROM hours h
LEFT JOIN arbeiter a  ON a.id  = h.hrs_arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
WHERE COALESCE(h.hrs_deleted,0) = 0 AND h.hrs_length <> 0;
```

**Vor dem Import prüfen**, ob die Namen überhaupt treffen — sonst merkt man es
erst an 91 586 personenlosen Zeilen:

```sql
SELECT TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS name,
       a.kuerzel, COUNT(n.autoid) stunden_zeilen
FROM arbeiter a
LEFT JOIN adressen ad ON ad.id = a.adr_id
LEFT JOIN nstunden n  ON n.arb_id = a.id
GROUP BY a.id, name, a.kuerzel
HAVING stunden_zeilen > 0 ORDER BY stunden_zeilen DESC;
```

Beide Dateien dürfen in beliebiger Reihenfolge eingelesen werden — die Stufe
entscheidet, nicht der Zeitpunkt des Imports. Korrigiert der freigegebene Wert
den erfassten, bleibt der ursprüngliche als `importErfasst` am Eintrag sichtbar
und wird im Bericht gezählt. Nur wenn zwei Zeilen **derselben** Stufe für Tag
und Auftrag verschiedene Stunden liefern, gibt es keine Regel — dann meldet der
Importer das, statt zu raten.

Über `hrs_terminguid` bleibt die Kette Disposition → Zeit erhalten: ist der
Termin importiert, trägt der Zeiteintrag dessen `einsatzId`. Dafür müssen die
Termine **vor** den Stunden eingelesen werden (so steht es in der Reihenfolge).

> Die Mitarbeitenden müssen in GEMA **vorher** angelegt sein — der Import
> ordnet sie über den Namen zu. Was er nicht findet, wird gemeldet: die Zeit
> ist dann erfasst, aber ohne Person.

### 8.12 Bezugspersonen mit ihrer Rolle

Die Personen hängen über `contact` an Objekt und Beleg, die Rolle liefert
`contactkrit` → `krit`:

```sql
SELECT o.id AS obj_id, o.strasse, o.plz, o.ort,
       z.zuhanden, z.vorname, z.tel1, z.natel, z.email,
       c.wohnung, c.bemerkungen, k.kriterium
FROM contact c
JOIN obj    o ON o.id = c.item_id AND c.module_id = 1
JOIN zuhand z ON z.id = c.zuhand_id
LEFT JOIN contactkrit ck ON ck.contact_id = c.autoid
LEFT JOIN krit        k  ON k.id = ck.krit_id
ORDER BY o.id;
```

**`module_id = 1` sind die Objekte — bestätigt**: alle 9 138 Zeilen treffen
`obj`, also 100 %. Dieselbe Gegenprobe klärt die übrigen Werte gleich mit:

| `module_id` | Zeilen | Ziel |
|---|---|---|
| 0 | 1 459 | Adressen (99,5 % Treffer) |
| **1** | **9 138** | **Objekte (100 %)** |
| 2 | 7 706 | Offerten |
| 3 | 17 450 | Aufträge (100 %) |
| 4 | 17 171 | Rechnungen |
| 6 | 662 | Anlagen |

Damit ist der polymorphe Schlüssel des Altsystems vollständig entschlüsselt —
er gilt genauso für `lvposition`, `contactinfos` und `task`.

---

### 8.13 Ferien- und Überzeitüberträge

Im Altsystem die Maske **«Stunden- und Ferienübertrag»**. Sie rechnet vom
letzten Übertrag bis zum Vortag des eingegebenen Datums und schreibt das
Ergebnis als neue Zeile fort:

```
Ferienguthaben am 01.01.2026            248.75
− bezogene Ferien bis 06.09.2026        176.00
= Feriensaldo                            72.75
Stundenübertrag am 01.01.2026             0.00
+ geleistete Überzeit                    15.25
= Stundensaldo                           15.25
```

**Jede Zeile ist ein Saldo auf einen Stichtag, kein Zuwachs.** Mehrere Zeilen
je Person sind die Geschichte des Kontos, nicht Summanden — wer sie addiert,
bekommt Unsinn. Stichtage sind meist der 1. Januar, aber nicht immer
(im Bestand u.a. 31.10.2025, 31.12.2022, 01.09.2021).

| Spalte | Maske | Anmerkung |
|---|---|---|
| `datum` | Datierung auf | der Stichtag |
| `totarbeit` | Stundenübertrag (+/−h) | darf negativ sein — Minusstunden |
| `totferien` | Ferienguthaben (h) | **in Stunden**, nicht in Tagen |
| `ausbezst` | Ausbezahlte Überstunden (h) | |
| `zus_stunden` | Zuschlägestunden | im Bestand durchweg 0 |
| `bemerkung` | Bemerkungen | trägt die Begründung, z.B. «Ferienkürzung da <3 volle Monate», «Ferien ausbezahlt, da Austritt», «Topf A=52h(100%)/Topf B» |

`saldo` und `totspesen` sind seit 2020 NULL und werden nicht übernommen.

```sql
SELECT u.id, u.datum, u.totarbeit, u.totferien, u.ausbezst,
       u.zus_stunden, u.bemerkung,
       TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name
FROM arbueber u
LEFT JOIN arbeiter a  ON a.id  = u.arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
WHERE u.totarbeit IS NOT NULL OR u.totferien IS NOT NULL
ORDER BY arb_name, u.datum;
```

**Warum das nicht weggelassen werden darf:** GEMA rechnet die Jahresbilanz aus
den Tagesrapporten (`stdJahresAuswertung`). Die Jahre vor der Migration liegen
dort nicht, also stünde jede Mitarbeiterin am ersten Tag auf null — ein
Ferienguthaben von 248.75 h wäre schlicht weg. Der Import legt die Überträge
darum als eigene Datensätze im Stunden-Pool ab (`typ:'uebertrag'`, neben den
Auszahlungen, die dort schon so liegen), mit dem vollen Verlauf statt nur dem
letzten Stand.

**Wie GEMA damit rechnet.** `stdJahresAuswertung` nimmt den Übertrag als
`opts.uebertrag` entgegen und verwendet für das Jahr seines Stichtags dessen
Guthaben statt des gerechneten Jahresanspruchs. Das ist der springende Punkt:

> Das Guthaben der Übertragsmaske **enthält den Anspruch der neuen Periode
> bereits** (im Altsystem der Knopf «Ferienguthaben berechnen»). Wer den
> Jahresanspruch zusätzlich addiert, gibt jeder Person die Ferien doppelt.

Am Bestand nachgerechnet: 68.50 h Rest per 31.10.2025 + 200 h neuer Anspruch
− 19.75 h bezogen = **248.75 h per 01.01.2026** — genau der gebuchte Wert.

Umgerechnet wird über das Tagessoll des Mitarbeiters (`wochenSoll/5`, also
inklusive Pensum, aber **ohne** Vorholzeit — die erhöht das Arbeitssoll, nicht
den Wert eines Ferientages). 200 h bei 8 h/Tag = 25 Tage; bei 80 % Pensum sind
es 160 h bei 6.4 h/Tag = ebenfalls 25 Tage.

**Der Anspruch selbst ist in GEMA schon vollständig abgebildet** und muss nicht
aus dem Altsystem kommen (dort steht er ohnehin nirgends — `arbeiter.ferien` ist
bei allen 46 Aktiven NULL): `stdFerienAnspruch` rechnet ihn pro rata nach
Eintritt und Austritt, `stdParamsFuerMitarbeiter` skaliert das Tagessoll auf das
Pensum. Zu prüfen ist nur, ob das Wochensoll der Firma zum GAV-Wert passt, damit
25 Tage tatsächlich 200 h ergeben.

**Fortschreibung.** Damit das Guthaben auch nach der Migration nicht jedes Jahr
verfällt, legt `stUebertragErfassen` in den Jahres-Salden den nächsten Übertrag
an: Ferienrest + Anspruch der neuen Periode → Startguthaben auf den 1. Januar,
Überzeitsaldo mit. Fehlt für ein Jahr ein Übertrag, obwohl ein älterer besteht,
wird das in der Tabelle gemeldet statt still auf null gesetzt.

Ein Punkt bleibt bewusst offen: **Stichtage, die nicht der 1. Januar sind**,
mischen im GEMA-Jahr zwei Perioden. Der Import übernimmt sie mit ihrem Datum,
die Ferien werden tagesgenau ab dem Stichtag gezählt, die Überzeit erst ab der
Folgewoche (das Wochensoll kommt aus dem Kalender, eine angebrochene Woche
zählte sonst voll) — beides wird ausgewiesen statt kaschiert.

---

### 8.14 Nachschlagetabellen — die Abfrage hinter 6.0

Am 2026-09-07 gelaufen; die Ergebnisse stehen in 6.0. Hier zur
Wiederholbarkeit — sie liest nur und zählt, wie oft jeder Wert benutzt wird.

```sql
SELECT '=== A Auftragsstatus (arbstatus) ===' AS x;
SELECT s.id, s.typ_text, COUNT(r.id) AS auftraege
FROM arbstatus s LEFT JOIN rapporte r ON r.astatus = s.id
GROUP BY s.id, s.typ_text ORDER BY auftraege DESC;

SELECT '=== B Offertstatus (offstatus) ===' AS x;
SELECT s.id, s.typ_text, COUNT(o.id) AS offerten
FROM offstatus s LEFT JOIN offerten o ON o.status = s.id
GROUP BY s.id, s.typ_text ORDER BY offerten DESC;

SELECT '=== C Rechnungsart (rechtyp) ===' AS x;
SELECT t.id, t.typ_text, COUNT(r.id) AS rechnungen
FROM rechtyp t LEFT JOIN rechnungen r ON r.typ = t.id
GROUP BY t.id, t.typ_text ORDER BY rechnungen DESC;

SELECT '=== D Absenzarten (absenz) ===' AS x;
SELECT a.id, a.kurz, a.beschr, a.paid AS bezahlt, a.social,
       (SELECT COUNT(*) FROM termin t WHERE t.absenz = a.id)        AS termine,
       (SELECT COUNT(*) FROM hours h WHERE h.hrs_absenz_id = a.id)  AS handy
FROM absenz a ORDER BY termine DESC;

SELECT '=== E Arbeitsarten (arbtyp) ===' AS x;
SELECT a.id, a.kurz, a.beschr, a.bkp_nr,
       (SELECT COUNT(*) FROM termin t WHERE t.arbtyp = a.id) AS termine
FROM arbtyp a ORDER BY termine DESC;
```

`absenz.paid` sieht aus wie «bezahlt ja/nein», ist es aber nicht — siehe 6.0.
Beide Bit-Spalten werden mit `+0` abgefragt, sonst kommen sie als `\0`/`\1`.

---

## 9. Datenschutz

Der produktive Bestand enthält Kundennamen, Adressen, Beträge sowie
Personaldaten in `arbeiter` (AHV-Nummer, Geburtsdatum, Zivilstand, Kinderzahl,
Lohnkonto, Bankverbindung). Für die Migration gilt:

- Nur die Felder exportieren, die GEMA tatsächlich braucht — `arbeiter` liefert
  Name, Kürzel, Abteilung, Ansatz; **nicht** AHV, Lohn, Bank, Zivilstand.
- `adrkre.password` / `igh_password` nie exportieren.
- Auszüge nicht ins Repo (`.gitignore` deckt `erp_alt/`, `*.db`, `*.mdb` u.a. ab).
- Bearbeitungsverzeichnis nach Art. 12 DSG nachführen, wenn die Daten in eine
  neue Umgebung wechseln.

---

## 10. Datenvolumen — was der Bestand in Supabase und im Browser bedeutet

Ein Positions-Datensatz aus der echten Normalisierung gemessen: **300 Bytes**
JSON (NPK-Nummer, Bezeichnung, Menge, Einheit, EP und `importKalk`). Daraus
folgt der Rest.

### Zeilen in `gema_data`

GEMA legt **eine Row je Datensatz** an — Positionen und Zahlungen aber NICHT
einzeln, sie liegen als Array im Beleg. Der Bestand ergibt darum:

| Collection | Rows | Ø Grösse | Total |
|---|---|---|---|
| `erpdok:` (Offerten + Aufträge + Rechnungen) | 26 372 | s. u. | **~230 MB** |
| `std:` (Tagesrapporte + Überträge) | ~50 000 | ~800 B | ~40 MB |
| `erpkat:` (Artikel) | 15 888 | ~300 B | ~5 MB |
| `erpkred:` | 12 310 | ~700 B | ~9 MB |
| `erpkunde:` (Adressen) | 6 627 | ~800 B | ~5 MB |
| `einsatz:` (Termine) | 6 739 | ~600 B | ~4 MB |
| `objekt:` (inkl. Bezugspersonen) | 4 173 | ~2 KB | ~8 MB |
| `svanl:` | 406 | ~800 B | <1 MB |
| **Summe** | **~122 000** | | **~300 MB** |

Die 632 008 Positionen verteilen sich auf rund 9 700 Belege — im Schnitt **65
Positionen und damit ~20 KB pro Beleg**. Belege ohne Positionen bleiben bei
~1.5 KB.

Postgres komprimiert JSONB über 2 KB (TOAST), real dürften daraus 120–200 MB
werden. Für die Wahl des Plans heisst das: **Free (500 MB) ist zu knapp, Pro
(8 GB) reicht mit grossem Abstand.**

### Der Haken liegt nicht bei Supabase, sondern im Browser

`bindCollection` zieht eine Collection **vollständig** in den Cache, und
`getCached()` liefert das ganze Array. Mit allen Positionen bedeutet das rund
**230 MB `erpdok:` im Arbeitsspeicher des Browsers** — auf dem Desktop
grenzwertig, auf einem iPhone nicht tragbar. Dazu kommt der Import selbst: er
läuft im Browser und warnt ab 50 000 Zeilen; eine CSV mit 632 008
Positionszeilen wäre rund 100 MB.

Drei Konsequenzen, keine davon dramatisch:

1. **Positionen in Jahresscheiben exportieren** (`WHERE YEAR(datum) = 2024` am
   Beleg-Join), nicht als eine Datei.
2. **Positionen nur für die jüngeren Jahre importieren.** Der Kopf-Import legt
   je Beleg eine **Sammelposition mit dem Gesamtbetrag** an (`importSammel`) —
   ältere Belege zeigen damit den richtigen Betrag und die richtige Adresse,
   nur eben ohne Einzelzeilen. Für den Rückblick auf 2015 reicht das meist;
   der Positions-Import lässt sich später jederzeit nachholen, weil er genau
   diese Sammelposition ersetzt und ein echtes LV nie anfasst.
3. **Option «Positionen aus der Offerte übernehmen» bewusst setzen.** Sie ist
   im Assistenten standardmässig an und kopiert das LV der Offerte in den
   Auftrag — das verdoppelt den Positionsbestand auf bis zu 460 MB. Für die
   Migration einer Historie gehört sie ausgeschaltet; die Offerte trägt die
   Positionen bereits und der Auftrag ist mit ihr verknüpft.

Mit Punkt 2 und 3 landet der produktive Bestand bei realistisch **60–100 MB** —
und die Historie bleibt vollständig, nur eben auf Belegebene statt auf
Positionsebene.
