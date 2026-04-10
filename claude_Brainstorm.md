# Claude Brainstorm — GEMA Ideen-Sammlung

> Diese Datei dient als Sammelstelle für Ideen, die später umgesetzt werden sollen.
> Füttere mich (Claude) einfach mit neuen Ideen und ich speichere sie hier.
> Format: Datum, Kontext, Idee, ggf. Status.

---

## 🧠 Offene Ideen

### Offertvergleich mit Excel/PDF-Rücklauf
**Quelle:** Persona-Test #11
**Datum:** 2026-04-10
**Status:** Offen

Unternehmer schicken Offerten als Excel oder handausgefülltes PDF zurück — nicht über GEMA. Das System muss damit umgehen können.

**Mögliche Lösungen:**
- Auto-Match per Upload: Planer lädt Excel/PDF des Unternehmers hoch, GEMA matched Positionen automatisch (per Pos.-Nr.) und füllt Preise in den Vergleich ein. Bei PDF: OCR oder manuelle Zuweisung.
- GEMA-eigene Excel-Vorlage: Vorlage zum Download mit Pos.-Nr., Unternehmer füllt aus, Upload, Auto-Match
- Manuell kopieren als Fallback

**Offene Fragen:**
- OCR-Qualität bei handausgefüllten PDFs?
- Wie strikt ist der Pos.-Nr. Match (ähnliche Schreibweisen)?

---

### Sanierungsmodus mit Ist/Soll-Vergleich
**Quelle:** Persona-Test #18
**Datum:** 2026-04-10
**Status:** Offen

Bei Sanierungsprojekten ist der Workflow anders als bei Neubau: Es gibt einen Ist-Zustand (bestehende Installation, Baujahr, Material) und einen Soll-Zustand (geplante Sanierung). Beide Werte müssen erfasst und verglichen werden können.

**Mögliche Lösungen:**
- Toggle "Sanierung" in `pm_objekte.html`: aktiviert zusätzliche Felder Baujahr, Bestandsmaterial, Lebensdauer, bestehende Installation
- In Berechnungen vor Eingabe: "Ist-Wert / Soll-Wert"-Modus
- Side-by-Side-Anzeige: Ist links, Soll rechts, Differenz mittig
- Verbindung mit dem neuen Variantenvergleich (`gema_varianten.js`): Ist-Variante + Soll-Variante speichern

**Offene Fragen:**
- Soll der Sanierungsmodus per-Berechnung oder global per Objekt aktiviert werden?
- Welche Module brauchen Ist/Soll-Vergleich am dringendsten? (Druckdispositiv, Druckverlust, Enthärtung?)
- Gibt es typische Sanierungs-Szenarien, die als Vorlagen hinterlegt werden könnten?

---

### Ausschreibungs-Vorlagen pro Gebäudetyp (EFH/MFH/Schule)
**Quelle:** Persona-Test #16
**Datum:** 2026-04-10
**Status:** Offen — Filterung via #15 vorerst ausreichend

Vorlagen-Bibliothek mit typischen CRBX-Positionen pro Gebäudetyp:
- EFH-Neubau: ~40 Standard-Positionen (Sanitärapparate, Rohre, Armaturen)
- MFH-Neubau: ~120 Positionen (mit Steigleitungen, Wärmedämmung, Brandabschottungen)
- Badsanierung: ~25 Positionen (Demontage + Neubau bestehender Räume)
- Schule/Öffentlich: ~80 Positionen (mit Behindertengerechtigkeit, Hygiene-Spülungen)

**Aktueller Stand:** Filterung in sys_lieferanten.html (Region/Kategorie/SIA-Phase) bietet einen ersten Schritt — Lieferanten können nach Eignung gefiltert werden. Ein vollständiges Vorlagen-System wäre der nächste Ausbauschritt.

---
