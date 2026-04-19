# GEMA Brainstorm — Ideen für später

> Punkte aus dem Umsetzungsplan `GEMA_Umsetzungsplan_ClaudeCode.md`, die für später zurückgestellt wurden. Mit vollem Kontext dokumentiert.

---

## P01 — W3-Leitungsdimensionierung fehlt komplett 🔴🔴

**Priorität:** KRITISCH

**Beschreibung:**
Das meistgenutzte Berechnungstool jedes Sanitärplaners. Strangschema, Durchflüsse zuweisen, Leitungen berechnen nach SVGW W3/E3. Ohne das ist GEMA für den Alltag nicht einsetzbar.

**Personas:** Marco, Reto, Sandra, Luca

**Tech-Kontext:**
- Neues Modul unter `sb_`-Präfix (z.B. `sb_w3_dimensionierung.html`)
- Integration mit bestehender LU-Zusammenstellung (Datenfluss: Verbraucher → Leitungsstränge)
- Norm: SVGW W3/E3:2024, Kap. 5.2
- Vermutlich grösstes Modul im System
- Tabellenwerke und Kennlinien aus der Norm müssen digitalisiert werden

**Offene Fragen für die Umsetzung später:**
- Eingabemodus: Tabellarisch (wie LU) oder visuelles Strangschema (Drag&Drop)?
- Material-Auswahl: Kunststoff / Verbund / Kupfer / Edelstahl
- Berechnungsansatz: Druckverlust-iterativ oder Tabellen-basiert?
- Verknüpfung mit sb_druckerhoehung.html und sb_druckverlust.html
- Rohrleitungs-Stammdaten: Eigenes Modul oder Lieferanten-Katalog?

---

## P13 — Zeitersparnis beweisen (Vorher/Nachher) 🟡

**Priorität:** Marketing-Aufgabe, später

Konkrete Vorher/Nachher-Vergleiche auf der Startseite fehlen. Nur generische Formulierungen.

**Umzusetzen:** Sektion auf sys_preise.html oder sys_login.html mit konkreten Zahlen:
- «Enthärtungsberechnung: Excel 25 Min → GEMA 3 Min»
- «Offertvergleich: Manuell 2h → GEMA 15 Min»
- «PDF-Report: Word-Vorlage 45 Min → GEMA 1 Klick»

Idealerweise mit echten Messungen aus Pilotprojekten.

---

## P14 — Echte Daten statt Demo ✅ (bereits vorhanden)

Echte Schweizer Hersteller als Demo-Daten: BWT, Geberit, Nussbaum, GF JRG, Viega, KWC, Similor. Mit SVGW-Nummern, Druckbereichen, Zulassungen. Realistisch.

---

## P15 — Filter im Lieferanten-Dashboard 🟡

**Priorität:** MITTEL, später

Aktuell nur Produktkategorie + Status als Filter. Fehlen:
- Region / Kanton
- SVGW-Zertifizierung (Feld `svgw:true` existiert in Daten, wird aber nicht gefiltert)
- Preissegment
- KTI-Zertifizierung

---

## P16 — Ausschreibungs-Vorlagen ✅ (Engine vorhanden)

Die Vorlagen-Engine ist vollständig: «Aus Vorlage erstellen»-Dropdown, «Vorlagen-Bibliothek»-Modal, «Als Vorlage speichern». Nutzer erstellen ihre eigenen Vorlagen. Keine vordefinierten Templates (EFH, MFH etc.), aber die Infrastruktur ist da.

---

## P12 — Pricing / Trial auf Startseite ✅ (bereits vorhanden + verbessert)

**Status:** Fertig

- `sys_preise.html` öffentlich zugänglich (3 Pakete, Addons, Team-Rabatte, Bildungslizenz)
- `GemaAuth` unterstützt `testphase`-Abo mit 30 Tagen
- Nach Ablauf: Login-Light-Modus (kein PDF-Export, Copy-Schutz, Upgrade-Banner)
- **Ergänzt:** prominenter grüner CTA-Link «🎁 Kostenlos testen — 30 Tage voller Zugang» auf `sys_login.html` über dem Login-Formular

---

## P11 — Offertvergleich mit Excel/PDF-Rücklauf 🔴 (umfangreich, später)

**Priorität:** HOCH

Unternehmer schicken Offerten als Excel oder PDF zurück — nicht über GEMA. System muss damit umgehen können.

**Aktueller Stand:**
- ✓ HTML-Inputs akzeptieren .xlsx/.xls/.pdf
- ✓ Metadaten werden gespeichert (pdfName, Datum, Uploader)
- ✗ Keine PDF-Binary-Speicherung (pdfDataUrl-Feld bleibt leer)
- ✗ Kein Excel-Parser (SheetJS nicht eingebunden)
- ✗ Kein Auto-Matching Excel-Positionen ↔ CRBX

**3 Ausbaustufen (wähle bei Umsetzung):**

1. **Minimal** (kleiner Sprint): PDF als Base64 speichern + Vorschau-Link. User trägt Preise manuell in GEMA nach. → Grundlage für P11.
2. **Mittel** (mittlerer Sprint): + Excel-Upload mit SheetJS, Tabellen-Preview, manuelles Spalten-Mapping (Pos.Nr., Preis).
3. **Gross** (Sprint): + Auto-Matching: Excel-Zeilen werden über Pos.Nr./NPK mit CRBX-Positionen gematcht, Preise automatisch übernommen.

**Implementation-Notizen:**
- SheetJS (xlsx.js) CDN einbinden
- PDF via `FileReader.readAsDataURL()` → Base64 in `offerte.pdfDataUrl`
- Supabase Storage wäre robuster als Base64-in-JSON (grosse Dateien)
- Matching-Heuristik: 1) Pos.Nr. exakt, 2) NPK+Menge, 3) Fuzzy-Text

---

## P10 — Follow-up: Ausreisser-Erkennung auch in pm_ausschreibungsunterlagen 🟡

**Status:** Teil-Follow-up

Die Ausreisser-Erkennung (Median + ±30%/±50%-Markierung) ist in `pm_crbx.html` umgesetzt. Die gleiche Visualisierung sollte analog auch in `pm_ausschreibungsunterlagen.html` im Offertvergleich-Tab eingebaut werden (aktuell nur 0-Pos + günstigste).

Die relevante Stelle ist bei `.ov-z` / `.ov-ch` im Vergleichs-Renderer.

---

## P09 — CRBX/E1S Import & Export ✅ (bereits vollständig)

**Status:** Komplett implementiert

- `pm_crbx.html` (standalone): Import ZIP → SIA 451 Parser → Positionen → Preiseintrag → Export `.crbx`-ZIP
- 5 Tabs: Import / Leistungsverzeichnis / Offerten / Offertvergleich / Zusammenfassung
- Satztypen A/B/C/G/Z unterstützt (parseE1S, parseG, writeE1S)
- Integration in `pm_ausschreibungsunterlagen.html` als CRBX-Abgleich-Tab
- Kleine Lücke: Menu-Link zu `pm_crbx.html` nicht prominent sichtbar — User wollte nicht ergänzen

---

## P06 — PDF-Export mit Projektkopf ✅ (bereits vollständig)

**Status:** Komplett fertig

**gema_pdf.js** sammelt & rendert alle 5 Pflichtfelder:
- Logo (via GemaAuth.getCurrentOrg().logo)
- Projektname (#metaProjekt)
- Datum (#metaDatum)
- Bearbeiter (#metaBearbeiter)
- Revisionsstand (#metaRevision)

In 33 HTML-Dateien eingebunden, inkl. pm_ausschreibungsunterlagen.html.

---

## P05 — Normverweis auf Berechnungsblatt ✅ (bereits ~95% umgesetzt)

**Status:** Weitgehend fertig

**Existiert bereits:**
- 20 von 21 Modulen haben Norm-Hinweis im Hero (`.gema-hero-norm` / `.hero-norm`)
- 19 Module haben `metaBearbeiter` + `metaDatum` in `.project-bar`
- `gema_pdf.js` druckt Norm + Bearbeiter + Datum automatisch in den PDF-Kopf

**Mögliche Kleinst-Verbesserungen (optional):**
- `sb_index.html` + `sb_grobauslegung.html`: Bearbeiter/Datum ergänzen (falls sinnvoll)
- Design der Norm-Pill vereinheitlichen (falls Unterschiede sichtbar)

---

## P03 — Follow-ups (Rest des Scopes aus P03-Umsetzung) 🟡

**Priorität:** Follow-up nach Phase 1

Phase 1 wurde umgesetzt: Premium-Tier-Logik, Auto-Scroll, Stammlieferanten-Sort in Legacy-Modulen (sa_enthaertung), Offerten-Tab auf allen sa_-Modulen.

**Noch offen:**

1. **sa_osmose Legacy-Migration** — gleich wie sa_enthaertung: sortWithStamm in renderAnlagenWahl, Auto-Scroll nach Berechnung
2. **sa_enthaertung + sa_osmose voll auf GemaAnlagenwahl migrieren** — Legacy-Code (#anlagenSection, #prodModal, _pkOfferteAnfragen) durch Standard-Widget ersetzen
3. **sb_-Berechnungsmodule anbinden** — diese haben aktuell KEINE Anlagenauswahl:
   - sb_druckerhoehung.html → kategorie 'druckerhoehung'
   - sb_warmwasser.html → kategorie 'warmwasser_boiler'
   - sb_niederschlag.html → kategorie 'hebeanlage' (wenn NS-Hebepumpe nötig)
   - Evtl. weitere wo Produktvorschlag Sinn macht
4. **Match-Score-Badge** — Option «✓ Ideal», «⚠ Gross», «⚠ Klein» pro Produkt (war Option 2 bei Q3, User wählte «Filter vorausgewählt»)
5. **Top-3 Empfehlungskarten** oben — als alternative UI (Option 1 bei Q3)

**Reihenfolge:** Erst (1+2) — User-Feedback sammeln ob Legacy-UX wegmuss. Dann (3) — weil das grosses Neuland ist und Produkt-Matching pro Kategorie neu aufgezogen werden muss.

---

## P02 — NPK / Textbibliothek — NICHT IM SCOPE ❌

**Priorität:** Verworfen

**Begründung User:** NPK sind vorgefertigte Positionen mit Text etc., aber GEMA macht nur den CRBX-Vergleich und keine Einzelerfassung von NPK-Positionen. Das macht der Planer wie gewohnt in seiner Branchensoftware.

**Konsequenz:**
- Keine NPK-Textbibliothek in GEMA einführen
- GEMA bleibt fokussiert auf: CRBX-Import → Preis-Ausfüllung durch Unternehmer → Offertvergleich
- Einzelpositions-Erfassung bleibt in der Branchensoftware (Messerli, ProBau, Bauad etc.)

---

## P26 — Freitext-Positionen neben Standardpositionen in Ausschreibung 🟡

**Priorität:** Mittel (v.a. für Sanierungen relevant)

**Problem:** Bei Sanierungen braucht man oft freie, projektspezifische Positionen neben den NPK-Standardpositionen. Aktuell gibt es nur BKP-Positionen aus `initBKPPositionen()` und einen «Freier Lieferant»-Eintrag, aber keine manuellen Zusatzpositionen.

**Was fehlt:**
- UI zum Einfügen einer Freitext-Position (Bezeichnung, Menge, Einheit, EP frei erfassbar)
- Freitext-Positionen müssen in Offertvergleich + CRBX-Export mitspielen
- Kennzeichnung als «Freie Position» vs. «Standard NPK»

**Aufwand:** Mittel — neuer Positionstyp in pm_ausschreibungsunterlagen.html, CRBX-Integration

---

## P27 — Gleichzeitiges Arbeiten an einer Ausschreibung 🔴

**Priorität:** Hoch langfristig, aber grosses Feature

**Problem:** Zwei Planer sollen an verschiedenen Abschnitten derselben Ausschreibung arbeiten können. Aktuell kein Realtime/Collaboration-Support.

**Was fehlt:**
- WebSocket oder Realtime-Infrastruktur (z.B. Supabase Realtime, Firebase, oder eigener WS-Server)
- Locking-Mechanismus auf Abschnitt-Ebene (nicht ganze Ausschreibung)
- «In Bearbeitung von X»-Anzeige pro Abschnitt
- Konflikterkennung und -auflösung bei gleichzeitiger Änderung

**Zwischenlösung (einfach):** Simples Document-Level-Locking: «Ausschreibung wird gerade von Max bearbeitet» — verhindert gleichzeitiges Öffnen. Kein Realtime nötig, nur localStorage/DB-basierter Lock.

**Aufwand:** Simples Locking = klein. Echtes Realtime-Collaboration = gross (Backend-Infrastruktur nötig).

---

## P29 — Guided Mode / Onboarding für Einsteiger 🟡

**Priorität:** Mittel

**Ist-Zustand:** `gema_coachmarks.js` existiert als vollständiges Onboarding-System (Spotlight-Overlay, Step-Navigation, localStorage-Tracking). In einigen Modulen bereits integriert (Lieferanten-Dashboard, Offertvergleich, einzelne Berechnungsmodule).

**Was fehlt:**
- Coachmarks auf weiteren Kernmodulen (pm_objekte.html, sb_lu_tabelle.html, Module.html)
- Geführter «Erstnutzer-Wizard»: beim allerersten Login eine übergreifende Tour über die wichtigsten Bereiche
- Kontextuelle Hilfe-Tooltips an komplexen Eingabefeldern (z.B. Härtegrad, Spitzenvolumenstrom)
- «Typische Positionen vorschlagen» bei Erstnutzung der Ausschreibung

**Aufwand:** Klein pro Modul (je 1 `GemaCoachmarks.init()`-Aufruf + Step-Definitionen). Erstnutzer-Wizard = mittel.

---

## P30 — Direkt-Versand PDF aus GEMA 🔴

**Priorität:** Hoch (aber Backend nötig)

**Problem:** Aktuell: PDF exportieren → Download → Mail-Client öffnen → Anhängen → Senden. Planer wollen: 1 Klick → PDF per Mail an Empfänger.

**Was fehlt:**
- Backend für E-Mail-Versand (SMTP oder Transactional-Mail-Service wie Resend, Postmark, SendGrid)
- Supabase Edge Function oder Netlify Function als API-Endpunkt
- UI: «Per Mail senden»-Button neben PDF-Export mit Empfänger-Eingabe
- Vorausfüllung: Empfänger aus Beteiligte-Liste des Projekts

**Zwischenlösung:** `mailto:`-Link mit vorausgefülltem Betreff + Body, User hängt PDF manuell an. Kein Backend nötig, aber UX nicht ideal.

**Aufwand:** mailto-Workaround = klein. Echter E-Mail-Versand mit Anhang = mittel (Edge Function + Mail-Provider).

---
