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
