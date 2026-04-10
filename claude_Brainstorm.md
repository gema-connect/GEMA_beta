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

### Unterprojekte / Etappen (Parent-Child-Baumstruktur)
**Quelle:** Persona-Test #25
**Datum:** 2026-04-10
**Status:** Entschieden — Parent-Child-Baumstruktur

Grosse Bauvorhaben (z.B. Spital, Areal-Entwicklung) laufen in mehreren Etappen über Jahre. Jede Etappe ist ein eigenständiges Teilprojekt mit eigenen Berechnungen, Ausschreibungen und Kosten, gehört aber zum selben Oberprojekt.

**Entscheidung:**
- In `pm_objekte.html` neues Feld `parentObjektId` (optional).
- Dashboard zeigt Objekte als Baum mit Einrückung (Parent → Kind → Enkelkind).
- Berechnungen und Ausschreibungen laufen pro Sub-Objekt (nutzen die bestehende `objektId`-Logik).
- Kosten-Rollup: Parent-Objekt zeigt aggregierte Summen aller Kinder.
- Navigation: Breadcrumb im Objekt-Header "Spital Musterhausen › Etappe 2 Rohbau".

**Offene Fragen:**
- Wie tief soll die Baumhierarchie gehen? (Empfehlung: max. 3 Ebenen)
- Kopier-Funktion: neues Sub-Objekt mit Vorlage aus Geschwister-Objekt übernehmen?
- Wie werden Beteiligte vererbt — Parent → Kind automatisch, oder pro Ebene separat?

---

### CRBX-Import — keine Freitext-Positionen
**Quelle:** Persona-Test #26
**Datum:** 2026-04-10
**Status:** Entschieden — keine Umsetzung nötig

NPK-Positionen werden in GEMA **nicht manuell angepasst** und es werden **keine freien Positionen hinzugefügt**. Die einzelnen NPK-Positionen kommen ausschliesslich über die `.crbx`-Schnittstelle (SIA 451 .e1s, Satztypen A/B/C/G/Z) in das System. GEMA ist NPK-read-only — die Stammdatenhoheit liegt bei CRB.

**Konsequenz:** Kein Freitext-Editor in `pm_ausschreibung.html`. Der Planer arbeitet mit dem importierten Positionsbaum, ohne die Möglichkeit, daneben eigene Zeilen einzufügen. Anpassungen erfolgen ausserhalb von GEMA im CRBX-Workflow und werden dann erneut importiert.

---

### Gleichzeitiges Arbeiten an einer Ausschreibung (Co-Working)
**Quelle:** Persona-Test #27
**Datum:** 2026-04-10
**Status:** Offen — Brainstorm, später entscheiden

Zwei Planer wollen parallel an derselben Ausschreibung arbeiten (z.B. einer füllt Sanitärapparate aus, der andere Rohre). Aktuell überschreibt der letzte Speichervorgang alle älteren Änderungen.

**Mögliche Lösungen:**
- **Polling + Zeilen-Sperre**: Alle 5s pollt der Client den Server nach Änderungen. Beim Edit einer Zeile wird sie für andere User gesperrt (mit Timeout). Bei Konflikt Warnhinweis "XY bearbeitet diese Zeile gerade".
- **Supabase Realtime**: Echte Live-Subscriptions, Live-Cursors ähnlich Google Docs, sofortige Updates. Technisch anspruchsvoller, aber UX deutlich besser.
- **Check-out / Check-in**: Planer "reserviert" einen Positionsblock (z.B. ganze Gruppe), andere sehen "in Bearbeitung durch XY".

**Offene Fragen:**
- Wie oft kommt paralleles Arbeiten in der Praxis wirklich vor? (Persona-Feedback einholen)
- Reicht Sperre auf Gruppen-Ebene (Block) oder muss es pro Zeile sein?
- Supabase Realtime kostet — lohnt sich das für die erwartete Nutzung?
- Wie wird Offline-Arbeit gehandhabt (PWA-Kontext)?

---

### Vorlagen-Bibliothek für Ausschreibungen (persönlich + unternehmensweit)
**Quelle:** Persona-Test #28
**Datum:** 2026-04-10
**Status:** Entschieden — zwei Ebenen mit Kennzeichnung

Planer haben oft Standard-Positionslisten, die sie immer wieder verwenden (z.B. "EFH-Neubau Basisausstattung"). Diese sollen als Vorlagen gespeichert und schnell in neue Ausschreibungen geladen werden können.

**Entscheidung:**
Zwei Vorlagen-Ebenen mit klarer visueller Kennzeichnung:

1. **Persönliche Vorlagen** (pro User)
   - Nur für den eingeloggten User sichtbar
   - Badge/Label: "Persönlich" oder User-Icon
   - Gespeichert unter User-ID

2. **Unternehmensweite Vorlagen** (pro Büro/Organisation)
   - Für alle User derselben Organisation sichtbar
   - Badge/Label: "Büro-Vorlage" oder Organisations-Icon
   - Gespeichert unter Organisations-ID
   - Bearbeitungsrecht: Admin oder Vorlagen-Owner

**UI-Konzept:**
- In `pm_ausschreibung.html` Button "Als Vorlage speichern" mit Auswahl der Ebene (persönlich / Büro).
- Neue Ausschreibung → Dialog "Vorlage wählen" mit zwei Tabs oder kombinierter Liste mit Badges.
- Suche/Filter nach Vorlagenname und Gebäudetyp.

**Offene Fragen:**
- Darf jeder User Büro-Vorlagen erstellen oder nur bestimmte Rollen (Admin, Senior-Planer)?
- Versionierung: Wenn eine Büro-Vorlage aktualisiert wird, bleiben alte Ausschreibungen unverändert?
- Verbindung mit #16 (Gebäudetyp-Vorlagen): Beide Systeme zusammenlegen oder getrennt?
- CRBX-Kontext (siehe #26): Vorlagen enthalten NPK-Positionsreferenzen, nicht die Positionen selbst — beim Laden werden sie per Schnittstelle gezogen.

---

### Guided Mode / Onboarding für Einsteiger
**Quelle:** Persona-Test #29
**Datum:** 2026-04-10
**Status:** Teilweise umgesetzt (Coachmarks + Offertvergleich-Erklärungen)

Dreiteilig:

**#29a Kontextuelle Coachmarks pro Seite — umgesetzt**
- Wiederverwendbares Modul `gema_coachmarks.js` mit Spotlight-Overlay, Tooltip-Karten, Pfeilen, Schritt-Dots, Keyboard-Navigation (Enter/Arrows/ESC) und Persistenz pro Seiten-Key (`gema_coachmarks_done_<key>` in localStorage).
- Eingebunden auf drei Schlüsselseiten mit je 4–6 Schritten:
  - `index.html`: Modulsuche, Projektmanagement, Sanitär-Berechnungen
  - `pm_objekte.html`: Objekte vs. Beteiligte, neues Objekt anlegen, Suche & Filter, Feedback-Button
  - `pm_ausschreibungsunterlagen.html`: kompletter Workflow tab-für-tab (Ausschreibungen → BKP → Verteilen → Vergleich → Vergabe)
- API: `GemaCoachmarks.init(pageKey, steps, {delay, force})`, `.restart()`, `.isDone()`, `.markDone()`.

**#29b Typische Positionen vorschlagen — übersprungen**
- Überlappt stark mit #16 (Gebäudetyp-Vorlagen, noch offen) und #28 (Vorlagen-Bibliothek, umgesetzt). Wird über die bestehende Vorlagen-Bibliothek abgedeckt.

**#29c Offertvergleich mit Erklärungen — umgesetzt (Inline-Info-Icons)**
- Neue CSS-Klasse `.gcm-info` für ℹ-Icons mit CSS-Tooltip (hover/focus).
- Erklärungs-Legende `.gcm-legend` oben im Vergleich: erklärt Grün/Rot-Markierung, Kartellrecht-Hinweis, Verweis auf die Info-Icons.
- Info-Icons an: Brutto, MwSt 8.1%, Netto inkl., jeder aktive Abzug. Tooltips erklären Berechnungsbasis und Kaskadierung.
- Helper-Funktion `infoIcon(tip)` für konsistente Tooltips, HTML-safe encoding der Tips.

**Offene Folgepunkte:**
- Coachmarks auf weiteren Modulen ergänzen (sb_ Module, Lieferanten-Dashboard, W12).
- „? Onboarding wiederholen"-Link in den Nav-Bar (ruft `GemaCoachmarks.restart(pageKey, steps)`).
- Info-Icons auch im CRBX-Vergleich und Vergabeantrag (aktuell nur Haupt-Offertvergleich).
- Tutorial-Slide (Variante 3 aus der Entscheidung) als Ergänzung bei komplexen Features.

---

### Verzicht auf PDF-Versand aus GEMA
**Quelle:** Persona-Test #30
**Datum:** 2026-04-10
**Status:** Entschieden — nicht umsetzen (Grundsatzentscheidung)

Die Persona forderte einen Direkt-Versand von Ausschreibungen als PDF per Mail.

**Entscheidung:** Ausschreibungs-Versand läuft ausschliesslich über den GEMA-internen Workflow. Ziel: Unternehmer, Bauherrschaft und Architekten sollen GEMA täglich nutzen — der «Marktplatz für die Baustelle»-Vision entsprechend. PDF-Export kann bleiben (für Archiv/Papier), aber es gibt keine eingebaute Mail-Versand-Funktion für Ausschreibungen.

**Bestehende Touchpoints (geprüft, kein Handlungsbedarf):**
- `pm_objekte.html:809` — `mailto:`-Link als Kontakt-Link (öffnet leeren Mail-Client). Kein Ausschreibungs-Versand, bleibt.
- `pm_terminplan.html:2227` — Jour-fixe Serientermin-Export als ICS mit `mailto:`-Entwurf. Nicht Ausschreibung, bleibt.
- Kein eingebauter PDF→Mail-Flow in `pm_ausschreibungsunterlagen.html` gefunden.

**Konsequenz für zukünftige Module:** Wo immer ein Verteil-/Versand-Touchpoint entsteht, soll GEMA den Empfänger einladen, sich einzuloggen und direkt im System zu arbeiten — statt Dateien per Mail herumzuschicken.

---

### Stammlieferanten: Favoriten + Büro-Stamm (kombiniert)
**Quelle:** Persona-Test #31
**Datum:** 2026-04-10
**Status:** Umgesetzt

Zwei Ebenen kombiniert:

1. **Persönliche Favoriten** (pro User)
   - Stern-Icon ⭐ auf jeder Lieferanten-Karte togglet
   - Gespeichert in `gema_lieferanten_favs_v1` als `{ [userId]: [liefId, …] }`
   - Nur für den eingeloggten User sichtbar

2. **Büro-Stammlieferanten** (pro Organisation)
   - Haus-Icon 🏢 auf jeder Karte togglet — nur für Admin/Planer-Rollen sichtbar
   - Gespeichert in `gema_lieferanten_orgstamm_v1` als `{ [orgId]: [liefId, …] }`
   - Für alle User derselben Organisation sichtbar
   - Berechtigungsprüfung via `GemaProdukte.canEditOrgStamm()` (Admin oder Planer)

**Sortierung** (über `GemaProdukte.sortWithStamm()`):
1. Persönliche Favoriten (alphabetisch)
2. Büro-Stamm (alphabetisch)
3. Rest (alphabetisch)

**UI in `sys_lieferanten.html`:**
- Neuer Stamm-Filter: «Alle / ⭐ Meine Favoriten / 🏢 Büro-Stamm» mit Count-Badges
- Stern- und Haus-Toggles auf jeder Zeile (Haus nur für Admin/Planer)
- Farbige Badges in der Zeile: ⭐ Favorit (gelb) / 🏢 Büro-Stamm (cyan)
- Sortierung wird automatisch angewendet

**Offen für später:** API-Integration im Ausschreibungs-Verteilen-Flow (`pm_ausschreibungsunterlagen.html`), damit Stammlieferanten auch dort oben erscheinen.

---

### Produkt-Vergleichskorb (Side-by-Side)
**Quelle:** Persona-Test #32
**Datum:** 2026-04-10
**Status:** Umgesetzt (sys_produktkatalog.html)

**Modul `gema_vergleich.js`:**
- Globaler Korb: `gema_vergleich_korb_v1` als `{ [kategorie]: [produktId, …] }`, max. 4 Produkte pro Kategorie (ältester fällt raus bei Überschreitung)
- API: `add(id, kat)`, `remove(id, kat)`, `toggle(id, kat)`, `has(id, kat)`, `count(kat)`, `countAll()`, `clear(kat)`, `open(kat)`, `onChange(cb)`
- **Sticky Badge** unten rechts, erscheint sobald Korb ≥ 1 Produkt enthält: zeigt Total-Count, Klick öffnet Modal, ✕ leert den Korb
- **Vergleichsmodal** mit Side-by-Side-Tabelle: Kopfzeile zeigt Produkt-Name/Lieferant/Entfernen-Button, Zeilen sind nach `kategorie.felder.gruppe` gruppiert, abweichende Werte werden gelb hervorgehoben, gleiche Werte sind neutral
- Tabelle wird dynamisch aus `GemaProdukte.KATEGORIEN[kat].felder` gebaut — funktioniert automatisch mit allen bestehenden und neuen Kategorien

**Integration in `sys_produktkatalog.html`:**
- Button «⚖ Vergleichen» auf jeder Produktzeile
- Aktiv-Zustand mit gefüllter Farbe, wenn im Korb
- Vergleich pro Kategorie — wenn der User die Kategorie wechselt, ist der Korb dieser Kategorie persistent (Multi-Kategorie-Korb im Hintergrund)

**Offen für später:** Vergleichs-Button auch im Lieferanten-Detail-Tab «Produkte» (`sys_lieferanten.html` → `renderProdukteListe`).

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
