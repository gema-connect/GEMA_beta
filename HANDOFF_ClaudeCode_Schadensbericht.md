# HANDOFF — Schadensbericht: Layout-Umstellung auf HTML-Vorlage

## 1 · Was ist das hier

`bericht_wasserschaden_vorlage.html` ist die **freigegebene Layout-Referenz**
für den PDF-Export des Wasserschaden-Moduls. Der Inhalt der Datei sind
Beispieldaten (Fall „Bad 2.OG"). Massgeblich sind **Struktur, CSS und
Komponenten** — nicht die Beispieltexte.

## 2 · Ziel der Integration

Der aktuelle PDF-Export zeichnet jedes Element programmatisch mit **jsPDF**
über Koordinaten. Das wird durch den HTML-Weg ersetzt: Das Layout entsteht
aus HTML/CSS, das PDF wird daraus **gerendert**. Vorteil: gleichmässige
Abstände, sicheres Fotoraster und Seitenumbrüche entstehen durch CSS statt
durch manuelle Mathematik.

**Wichtig:** Die Datenbeschaffung bleibt unverändert. Es wird **nur die
Layout-/Render-Schicht** ausgetauscht — keine Änderung an Supabase-Queries,
Datenmodell oder Modul-Logik.

## 3 · Render-Weg — bitte zuerst klären

Zwei taugliche Wege; beide nutzen exakt dieses HTML/CSS:

| Weg | Vorteil | Nachteil |
|-----|---------|----------|
| **Puppeteer** (Netlify-Function, `puppeteer-core` + `@sparticuz/chromium`) | Echter Ein-Klick-Download, **Seitenzahlen** „Seite X / Y" über `footerTemplate` möglich | Neue Function, Fotos müssen an die Function übergeben werden |
| **window.print()** | Keine neue Infrastruktur, Fotos sind im Browser schon geladen | Druckdialog des Nutzers; **keine** gestylten Seitenzahlen im Dokument |

**Empfehlung:** Puppeteer, weil der Bericht von Seitenzahlen in der Fusszeile
profitiert. `window.print()` ist der valide Sofort-Weg ohne Infrastruktur.
Reines `html2canvas`/`html2pdf` **nicht** verwenden — das rastert den Text
(unscharf, grosse Dateien, nicht markierbar).

Hinweis Seitenzahl: Die Fusszeile in der Vorlage enthält bewusst **keine**
Seitenzahl, da reines Druck-CSS in Chromium kein `counter(page)` rendert.
Bei Puppeteer die Seitenzahl über `footerTemplate` mit `pageNumber` /
`totalPages` einsetzen.

## 4 · Daten-Mapping

Alle dynamischen Stellen sind im HTML mit Kommentaren markiert:
`<!-- DYNAMIC: … -->` für Einzelwerte, `<!-- LOOP: … -->` für Wiederholungen.

| Stelle im HTML | Datenquelle |
|----------------|-------------|
| `cover-title`, laufender Header | Berichttitel |
| `status` (Pill + Punkt) | Phasen-/Bearbeitungsstatus |
| Meta-Raster: Objekt | **lesbarer** Objektname — nicht die interne ID (`obj_…`) |
| Meta-Raster: Adresse | Objektadresse; falls leer → ganzes Feld ausblenden, nicht „—" zeigen |
| Meta-Raster: Bearbeiter / Erfasst am / Räume | entsprechende Felder |
| `kpi-strip` (4 Kacheln) | berechnet: Trocknungsdauer, Geräteanzahl, Energie total, Anzahl Messpunkte |
| `sec-date` je Sektion | Phasen-Abschlussdatum |
| `block-body` (Leckortung, Schadenausmass, Massnahmen, Zusammenfassung, Instandstellung, Folgekosten) | Freitextfelder; Massnahmen als `<li>`-Liste |
| `facts-row` Trocknung | Start / Ende / Dauer / Energie |
| Tabellen Geräte & Summe pro Raum | Geräteliste; `tr.sum` = Total-Zeile |
| Messwert-Tabellen | Messpunkte mit Messungen |
| `note` | Notizfeld; bei leerem Feld Box weglassen |

## 5 · Foto-Loop

Pro Foto-Block (`Analyse-`, `Trocknungs-`, `Abschluss-Fotos`):

- `ph-count` = Anzahl Fotos. Block komplett weglassen, wenn keine Fotos.
- Pro Foto ein `.photo` mit `.photo-frame` → darin `<img>` einsetzen; der
  Platzhalter (`.ph-mark`-SVG) entfällt dann. `object-fit:cover` ist gesetzt.
- `.photo-cap`: `<b>` = laufende Nummer (01, 02 …), danach die Bildunterschrift.
- Grid ist 2-spaltig. Bei vielen Fotos `class="photos cols-3"` für 3 Spalten.
- `.photo` hat `break-inside:avoid` — Foto und Caption bleiben zusammen.

Fotos für Puppeteer am besten als Data-URI (Base64) oder absolute URL
einbetten, damit die Function sie ohne Session laden kann.

## 6 · Diagramm „Messpunkt-Trend"

Das Diagramm ist **Inline-SVG** (vektorscharf im PDF, keine Lib nötig).
Aus den Messwerten generieren:

- Y-Skala in der Vorlage 30–90, Plotfläche `y` 40–240. Bei abweichenden
  Wertebereichen Skala + Gitterlinien + Y-Labels dynamisch anpassen.
- X gleichmässig über die Messdaten verteilen (`x` 70–640).
- Eine `polyline` + Punktgruppe pro Messpunkt; Legende entsprechend.
- Wenn nur ein Messdatum vorliegt: Diagramm weglassen und nur die
  Messwert-Tabellen zeigen (eine Linie aus einem Punkt ist nicht aussagekräftig).

## 7 · Seitenumbruch-Regeln (bereits im CSS)

- `.report-section` → `page-break-before:always` (jede Phase neue Seite).
- `.cover` → `page-break-after:always`.
- `break-inside:avoid` auf `.photo`, `table`, `.note`, `.block`, `.chart-card`,
  `.sign-row` — diese Elemente nicht über Seiten trennen.
- Laufende Kopf-/Fusszeile via `position:fixed`; `.page-body`-Padding hält den
  Text frei. Bei Puppeteer stattdessen `headerTemplate`/`footerTemplate`
  nutzen und die `.doc-header`/`.doc-footer` im DOM ausblenden.

## 8 · Nicht ändern

- Keine Supabase-/Datenmodell-Änderungen.
- Akzentfarbe: **ausschliesslich** `--accent` (#1e3a5f). Keine zusätzlichen
  Sektionsfarben einführen — die alten bunten Balken (orange/blau/grün)
  sind bewusst entfernt.
- CSS-Variablen im `:root` als einzige Stelle für Farb-/Tonwerte verwenden.

## 9 · Repo-Ablage

- Vorlage nach `vorlagen/bericht_wasserschaden_vorlage.html`.
- Render-Code: bei Puppeteer als Netlify-Function unter `netlify/functions/`.

## 10 · Stil-Regeln

- In allen Dateien und im erzeugten Bericht **echte Umlaute** (ä, ö, ü) —
  nicht ae/oe/ue.
- Schrift: DM Sans (GEMA-Designsystem).
- Logo: Platzhalter `.brand-mark` durch das offizielle GEMA-SVG ersetzen.
