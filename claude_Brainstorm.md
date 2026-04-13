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

### Coachmarks im Lieferanten-Dashboard
**Quelle:** Persona-Test #34
**Datum:** 2026-04-10
**Status:** Umgesetzt

Wiederverwendung des bestehenden `gema_coachmarks.js`-Moduls (siehe #29) in `sys_lieferanten.html`. Zwei separate Walkthroughs:

**Haupt-Walkthrough** (`sys_lieferanten`, 5 Steps) — beim ersten Besuch der Liste:
1. **KPI-Übersicht** (Total, Aktiv, Premium, Testphase, Offene Anfragen)
2. **Stamm-Filter** ⭐ Favoriten / 🏢 Büro-Stamm (Verweis auf #31)
3. **Filter nach Kategorie, Region, SIA-Phase** (SIA-Phase → typische Lieferanten-Kategorien)
4. **Neuer-Lieferant-Button** (CRUD)
5. **Stern/Haus-Toggle** auf jeder Zeile — rollenspezifischer Text (Admin/Planer sehen Büro-Stamm-Hinweis, andere nicht)

**Editor-Walkthrough** (`sys_lieferanten_editor`, 4 Steps) — beim ersten Öffnen eines Lieferanten im Detail:
1. Tab «Profil» — Grunddaten, Adresse, Kontakt
2. Tab «Abo & Premium» — Monetarisierung
3. Tab «Produkte» — verknüpfte Produkte
4. Tab «Offertanfragen» — eingehende Anfragen

Realisiert via Monkey-Patching der globalen `openLieferant()`-Funktion: Beim ersten Öffnen wird der Editor-Coach mit 400ms Delay gestartet (warten bis Overlay-Animation fertig ist). Ein Flag `_editorCoachDone` verhindert wiederholtes Auslösen in derselben Session.

---

### Materiallisten-Export aus Ausschreibung
**Quelle:** Persona-Test #35
**Datum:** 2026-04-10
**Status:** Übersprungen — wird später priorisiert

Nach der Ausschreibung eine Materialliste generieren und als Anfrage an Lieferanten senden. Nicht jetzt umgesetzt.

---

### BKP-Strukturierung im Offertvergleich
**Quelle:** Persona-Test #36
**Datum:** 2026-04-10
**Status:** Bereits vorhanden

Ein BKP-strukturierter Preisvergleich existiert bereits in `pm_ausschreibungsunterlagen.html` über die Funktion `_renderBKPVergleich()` im Vergabeantrag-View (siehe `VIEWS.pvga`, Zeile ~2548). Die 3-stellige BKP-Gruppierung mit Summen pro Gruppe ist im Vergabeantrag sichtbar.

**Offen für später:** Diese BKP-Struktur-Logik optional auch als Toggle im normalen Offertvergleich (`VIEWS.pvgl`) anbieten, nicht nur im Vergabeantrag.

---

### Preislisten-Upload pro Lieferant
**Quelle:** Persona-Test #37
**Datum:** 2026-04-10
**Status:** Offen — Brainstorm, passt besser zum späteren Lieferanten-Self-Service

Lieferanten sollen Excel/PDF-Preislisten mit Gültigkeitsdatum hochladen können. Zwei diskutierte Varianten:

**Variante A — Upload im Lieferanten-Editor** (Admin/Planer lädt hoch):
- Neuer Tab «Preislisten» in `sys_lieferanten.html`
- Upload Excel/PDF mit Gültigkeitsdatum (von/bis) und Notiz
- Mehrere Versionen pro Lieferant, ältere automatisch archiviert
- Speicherung als Array `l.preislisten[]` im Lieferanten-Objekt

**Variante B — Pro Produkt** (granularer, mehr Pflegeaufwand):
- Preislisten werden pro Produkt im Produktkatalog-Detail hinterlegt
- Ein Produkt hat mehrere Preislisten-Versionen mit Datum

**Entscheidung:** Vorerst nur als Idee festhalten. Das Feature gehört in den grösseren Kontext des **Supplier Portals** (siehe #39), wo Lieferanten ihre Daten selbst pflegen. Vor dem Portal ist ein Upload-Flow im Lieferanten-Editor technisch einfach (Variante A), aber inhaltlich fragwürdig — der Admin/Planer müsste fremde Preislisten pflegen.

**Offene Fragen:**
- Welches Dateiformat hat Priorität? Excel (strukturiert, parsebar) oder PDF (flexibler, aber statisch)?
- Soll GEMA Preise aus Excel parsen und in die Datenbank übernehmen (automatisch)?
- Versionierung: sichtbar alle Versionen oder nur die aktuelle?
- Verbindung mit #40 (Preisentwicklung/Historik): beide Features zusammenlegen?

---

### Datenblätter beim Produkt hinterlegen
**Quelle:** Persona-Test #38
**Datum:** 2026-04-10
**Status:** Umgesetzt

Erweiterung des bestehenden Dokument-Systems in `sys_produktkatalog.html`:

- **Neuer Typ «Montageanleitung»** zusätzlich zu Datenblatt, Zertifikat, Schema, Bild
- **Sprach-Feld** (DE/FR/IT/EN) pro Dokument, wird als Flag-Tag angezeigt
- **Dateigrössen-Limit** von 5 MB → **10 MB** erhöht
- **Gruppierte Anzeige**: Dokumente werden nach Typ gruppiert dargestellt — Datenblätter zuerst, dann Anleitungen, Zertifikate, Schemata, Bilder. Jede Gruppe mit Icon und Count-Anzeige
- **Dateigrösse** wird pro Dokument angezeigt (B/KB/MB-formatiert)
- **Icons & Badges** klarer: 📄 Datenblatt, 📘 Anleitung, 🏅 Zertifikat, 📐 Schema, 🖼 Bild
- **Empty-State** verbessert mit Icon und erklärendem Text

API-Erweiterung in `gema_produktkatalog_api.js`: `sprache`-Feld im Dokument-Objekt. Backwards-compatible — bestehende Dokumente ohne `sprache` zeigen einfach kein Sprach-Tag.

**Offen für später:** Automatisches Parsen der Sprache aus PDF-Metadaten, Datenblätter beim Produkt-Import (CSV/JSON) automatisch verlinken.

---

### Supplier Portal (Lieferanten-Self-Service)
**Quelle:** Persona-Test #39
**Datum:** 2026-04-10
**Status:** Offen — Brainstorm, grosses Feature für später

Lieferanten sollen ihre Produkte, Preise und Datenblätter eigenständig pflegen können, statt dass der GEMA-Admin alles manuell erfasst.

**Präferierte Variante — Eigene Login-Ansicht mit Rollen-Gate:**

Eigener Menüpunkt «Lieferanten-Bereich» mit Auth-Gate:
- Lieferant loggt sich mit seiner Lieferanten-E-Mail ein
- Sieht nur seine eigenen Produkte
- Kann sie bearbeiten, verifizieren, Datenblätter hochladen
- Kann Offertanfragen beantworten
- Admin-User sehen alles (wie bisher in `sys_lieferanten.html`)

**Technische Skizze:**
- Neue Rolle `role_lieferant` (evtl. schon vorhanden via `GemaAuth`)
- Filterung in `GemaProdukte.getProdukte()` via `lieferantId === currentUser.lieferantId`
- Eigene Seite `sys_supplier_portal.html` mit eingeschränkter Navigation
- Verifizierungs-Flow: Bestätigen-Button setzt `status = 'verifiziert'`, löst Log-Eintrag und Activity-Benachrichtigung aus
- Datenblatt-Upload nutzt bereits vorhandene API (#38)

**Offene Fragen:**
- Wie läuft der Lieferanten-Onboarding-Flow ab? Einladung per Mail-Link vom Admin? Self-Registration?
- Wer darf Lieferanten-User anlegen (Admin only oder auch Planer aus seinem Büro)?
- Rechtemodell: Darf ein Lieferant mehrere Mitarbeitende einladen (Org-Struktur auch für Lieferanten)?
- Preis-Sichtbarkeit: Sind vom Lieferanten gepflegte Preise für alle Planer sichtbar, oder nur nach expliziter Freigabe?
- Verbindung mit #37 (Preislisten-Upload), #38 (Datenblätter), #40 (Preishistorik)

**Abhängigkeiten:** Braucht eine saubere Auth-Rollen-Trennung, isolierte Produkt-Ownership, einen klaren Verifizierungs-Workflow. Eigenes Mini-Projekt.

---

### Preisentwicklung / Historik pro Produkt
**Quelle:** Persona-Test #40
**Datum:** 2026-04-10
**Status:** Verworfen — nicht umsetzen

Die Persona wünschte historische Preisdaten für Trendanalyse. **Entscheidung: Nicht umsetzen.** Preise sind in GEMA ohnehin nicht die zentrale Datenquelle — der Fokus liegt auf Berechnungen, Ausschreibungen und Produkt-Technik. Preisentwicklung und Trendanalyse sind ein separates Business-Intelligence-Thema, das ausserhalb des Kernfokus liegt.

---

### Undo / Eingabe-History bei Berechnungen
**Quelle:** Persona-Test #41
**Datum:** 2026-04-10
**Status:** Umgesetzt (Modul + 1 Integration)

**Neues Modul `gema_undo.js`:**
- In-Memory Undo/Redo-Stack pro Modul-Key (max. 50 Einträge, konfigurierbar)
- **Keyboard-Shortcuts**: Cmd/Ctrl+Z (Undo), Cmd/Ctrl+Shift+Z und Cmd/Ctrl+Y (Redo). In editierbaren Elementen (Input/Textarea/contenteditable) bleibt das Browser-Default-Verhalten erhalten — nur ausserhalb greift GemaUndo
- **Auto-Attach**: `GemaUndo.attachTo(inputs)` hängt sich per focus/change/blur an Input-Felder, nimmt beim focus den alten Wert auf und erstellt bei Änderung automatisch einen Undo-Eintrag mit Label «Feldname: alterWert → neuerWert»
- **Manuelles API**: `record(label, oldValue, newValue, applyFn)` für komplexere Snapshots (z.B. ganze Arrays / Objekte), `applyFn(value)` wird bei Undo/Redo ausgeführt
- **Optional History-Panel**: `showPanel()` zeigt einen kleinen Panel unten links mit Liste aller Einträge, Undo/Redo/Clear-Buttons und aktueller Position
- **Toast**: Rückgängig-Aktionen werden per Mini-Toast unten am Screen quittiert (integriert sich mit `window.toast()` falls vorhanden)

**Integration:** Beispielhaft in `sb_laengenausdehnung.html` eingebunden. Alle numerischen Inputs (`inputmode="decimal"`) werden auto-attached, und ein Intervall re-attacht dynamisch hinzugefügte Felder (idempotent durch `_gemaUndoAttached`-Flag pro Element).

**Persistenz:** Bewusst in-memory — Undo ist ein Session-Feature. Beim Seitenwechsel wird der Stack geleert. Für persistente Versionshistorie wäre ein anderes Pattern (Server-seitige Events, Operational Transform) nötig, das hier nicht erforderlich ist.

**Offene Folgepunkte:** Undo in weiteren sb_-Modulen einbauen (via dasselbe Pattern: `gema_undo.js` einbinden + `GemaUndo.init() + attachTo()` im DOMContentLoaded).

---

### Service-Worker Push-Benachrichtigungen (echte Pushes auch offline)
**Quelle:** Nutzer-Feedback nach Einbau Notifikations-System
**Datum:** 2026-04-13
**Status:** Offen — aktuelles System (Glocke + Toast im offenen Tab) reicht für Phase 1

Das aktuelle `gema_notify.js`/`gema_notify_ui.js` zeigt Benachrichtigungen **nur, solange GEMA im Browser offen ist** (Polling 30s + Cross-Tab via storage-Event). Für kritische Events (Offertfrist läuft ab, Vergabe-Entscheid, W12-Prüfung fällig) wäre ein echter Push sinnvoll, der auch dann greift, wenn die App geschlossen oder das Handy im Standby ist.

**Was nötig ist:**
1. **VAPID-Keys** generieren (einmalig, ~1 Minute). Platzhalter steht schon in `gema_push.js` (`VAPID_PUBLIC_KEY=''`).
2. **Backend-Endpoint** (Netlify Function oder Supabase Edge Function, ~50 Zeilen mit `web-push`-Library), der Pushes serverseitig an die registrierten Endpoints versendet. Rein clientseitig ist das nicht möglich — der Browser kann keine Pushes an andere Geräte schicken.
3. **Subscription-Storage** auf dem Server (Supabase-Tabelle `push_subscriptions`: userId, endpoint, keys, createdAt). localStorage reicht nicht, weil der Backend-Sender die Endpoints kennen muss.
4. **Service Worker erweitern**: In `sw.js` den `push`-Event-Listener ergänzen (`self.addEventListener('push', ...)`) — zeigt die Benachrichtigung mit `self.registration.showNotification()` + `notificationclick`-Listener für Navigation zum Zielmodul.
5. **Opt-in-UI**: Button "Push-Benachrichtigungen aktivieren" in den Settings (z. B. neben dem Abo-Preferences-Dialog). Einmalig pro Gerät, Browser fragt `Notification.requestPermission()` ab.
6. **Integration in `GemaNotify.push()`**: Wenn ein User Pushes aktiviert hat, parallel zum localStorage-Eintrag einen Server-Call absetzen, der den Push an den registrierten Endpoint schickt.

**Plattform-Hinweise:**
- **Desktop** (Chrome, Firefox, Edge, Safari ab macOS 13): Funktioniert überall.
- **Android**: Funktioniert in Chrome, Firefox, Samsung Internet — auch ohne PWA-Install.
- **iOS Safari**: Erst ab iOS 16.4 (März 2023) und **nur wenn GEMA als PWA zum Homescreen hinzugefügt** ist. Im normalen Safari-Tab kein Push.

**Kosten:**
- Push-Services (Google FCM, Mozilla autopush, Apple APNs) sind kostenlos.
- Backend: Netlify Functions / Supabase Edge Functions haben ein kostenloses Kontingent, das für den Anfang ausreicht.
- Einziger "Kostenpunkt": Einmaliges VAPID-Keypair generieren und sicher im Backend speichern.

**Zwischenschritt als Teil A (ohne Backend):**
Web-`Notification`-API direkt aus `gema_notify_ui.js` aufrufen, wenn der User Permissions erteilt hat. Das zeigt native OS-Popups, solange GEMA im Tab offen ist — ohne Server, ohne Service Worker. Deckt nicht den "App geschlossen"-Fall, ist aber ein nützlicher Mittelweg und in ~20 Zeilen umsetzbar.

**Entscheidung nötig:**
- Wollen wir ein Backend (Supabase oder Netlify Functions)? Das ist der erste Schritt, um echte Pushes zu ermöglichen.
- Welche Events sollen Push-tauglich werden (nicht alle, sonst nervt es)? Vorschlag: `ausschreibung_einladung` + `ausschreibung_vergabe` als "aktion" — den Rest (Offerte eingereicht, CRBX bestätigt) nur als lokale Glocke.

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
