# GEMA – Projektkonventionen für Claude Code

GEMA ist eine webbasierte Applikationssuite für Sanitäringenieurwesen und Bauprojektmanagement, gehostet auf Netlify (Schweiz). Die Suite umfasst Berechnungsmodule, Projektmanagement-Tools und Hygiene-Management.

**Vision**: GEMA wird DER Marktplatz für die Baustelle — startend mit Gebäudetechnik. Alle am Bau Beteiligten (Bauherrschaft, Architekt, Sanitärplaner, Unternehmer, Behörden, Lieferanten) loggen sich täglich ein und arbeiten auf einer gemeinsamen Plattform.

---

## Kernprinzip: Daten einmal erfassen, überall verknüpfen

Das wichtigste Architekturprinzip von GEMA: **Jeder Wert wird nur einmal eingegeben.** Alle abhängigen Module beziehen ihre Daten automatisch aus der Quelle. Der Benutzer kann übernommene Werte im Zielmodul anpassen, aber die Ersterfassung passiert nur einmal.

Beispiel: Ein Verbraucher wird in der LU-Zusammenstellung erfasst mit seinem Medium (Osmosewasser). Daraus fliesst automatisch der l/s-Wert in die Osmoseberechnung. Aus der Osmoseberechnung fliessen Permeat und Konzentrat in die Enthärtungsanlage. Der Planer muss diese Werte nie manuell übertragen — sie sind vorausgefüllt und editierbar.

---

## Datenfluss: Berechnungsmodule

### Zentrales Modul: LU-Zusammenstellung

Die LU-Zusammenstellung (Leitungsführung/Verbraucher-Zusammenstellung) ist die **zentrale Datenquelle** für alle verknüpften Berechnungen. Hier werden alle Verbraucher eines Projekts erfasst.

Integriert: **W3 Diagramm 1** (Spitzenvolumenstrom nach SVGW W3) — ist Teil der LU, kein separates Modul.

### Vier Medien-Netze

Jeder Verbraucher in der LU hat ein zugeordnetes Medium:

| Medium | Leitungsnetz | Zielmodule |
|--------|-------------|------------|
| **Trinkwasser (kalt)** | Trinkwassernetz | Druckerhöhung (l/s) |
| **Enthärtetes Wasser** | Trinkwassernetz | Enthärtungsanlage (l/s + Härtegrade) |
| **Osmosewasser** | Trinkwassernetz | Osmoseberechnung (l/s) → Enthärtungsanlage (Permeat + Konzentrat) |
| **Regenwasser** | Separates Leitungsnetz | Eigene Pumpe/Druckerhöhung (l/s) |

### Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────┐
│          LU-Zusammenstellung (+ W3 Diagramm 1)      │
│                                                       │
│  Verbraucher erfassen:                                │
│  ┌──────────┬────────────┬──────────┬──────────────┐ │
│  │ Name     │ Medium     │ l/s      │ Härtegrad    │ │
│  ├──────────┼────────────┼──────────┼──────────────┤ │
│  │ WC 1     │ Regenwasser│ 0.1      │ —            │ │
│  │ Lavabo   │ Trinkwasser│ 0.1      │ —            │ │
│  │ Labor    │ Osmose     │ 0.5      │ —            │ │
│  │ Dusche   │ Enthärtet  │ 0.15     │ 15°fH       │ │
│  └──────────┴────────────┴──────────┴──────────────┘ │
└──────────┬──────────┬──────────────┬─────────────────┘
           │          │              │
     ┌─────┘    ┌─────┘        ┌─────┘
     ▼          ▼              ▼
┌─────────┐ ┌──────────┐  ┌────────────────┐
│Druck-   │ │Osmose-   │  │Regenwasser-    │
│erhöhung │ │berechnung│  │Druckerhöhung   │
│         │ │          │  │(eigene Pumpe)  │
│ l/s aus │ │ l/s aus  │  │ l/s aus LU     │
│ LU      │ │ LU       │  │ (nur Regen-    │
│         │ │          │  │  verbraucher)  │
└─────────┘ │          │  └────────────────┘
            │  Ergebnis:
            │  Permeat + Konzentrat
            │          │
            └────┬─────┘
                 ▼
         ┌──────────────┐
         │Enthärtungs-  │
         │anlage        │
         │              │
         │ Eingänge:    │
         │ • Permeat    │ ← aus Osmoseberechnung
         │ • Konzentrat │ ← aus Osmoseberechnung
         │ • Verbraucher│ ← aus LU (mit Härtegraden)
         │   nach       │
         │   Härtegrad  │
         └──────────────┘
```

### Unabhängige Module

Folgende Module arbeiten eigenständig und beziehen keine Daten aus der LU:
- Warmwasserberechnung
- Zirkulationsberechnung
- Abwasserhebeanlage
- Niederschlagswasser
- Alle weiteren sb_-Module ohne LU-Bezug

### Daten-Synchronisation: Regeln

1. **Quelle → Ziel**: Werte fliessen automatisch, sind im Zielmodul aber editierbar
2. **Änderungen an der Quelle**: Aktualisieren das Zielmodul (mit Hinweis an den Benutzer)
3. **Manuelle Überschreibung im Ziel**: Wird markiert und nicht mehr automatisch überschrieben
4. **Alle Verknüpfungen sind objektspezifisch**: Daten fliessen nur innerhalb desselben Projekts/Objekts

---

## Lieferanten-System

### Übersicht

Lieferanten sind ein zentraler Bestandteil von GEMA. Nach einer Berechnung (z.B. Enthärtungsanlage) kann der Planer direkt eine passende Anlage aus dem Lieferanten-Katalog auswählen und optional eine Offertanfrage an den Lieferanten senden.

### Workflow für den Planer

```
Berechnung abgeschlossen (z.B. Enthärtung: 2.5 l/s, 15°fH)
        │
        ▼
┌─────────────────────────────────┐
│  Anlagen-Auswahl                │
│                                  │
│  Passende Anlagen werden         │
│  angezeigt basierend auf         │
│  Berechnungsergebnis             │
│                                  │
│  [Premium-Lieferanten oben]      │
│  [Verifizierte Anlagen ✓]       │
│                                  │
│  → Anlage auswählen & speichern  │
│    (ohne Offertanfrage)          │
│                                  │
│  → ODER: Offertanfrage senden   │
│    an Lieferant                  │
└─────────────────────────────────┘
        │
        ▼  (bei Offertanfrage)
┌─────────────────────────────────┐
│  Lieferanten-Dashboard           │
│                                  │
│  Neue Offertanfrage!             │
│  Projekt: Neubau Musterstrasse   │
│  Berechnung: Enthärtung 2.5 l/s │
│  Planer: Ingenieurbüro XY       │
│                                  │
│  → Offerte erstellen & senden    │
└─────────────────────────────────┘
```

### Lieferanten-Zugang & Dashboard

- **Eigenes Login**: Jeder Lieferant hat ein eigenes Konto mit Dashboard
- **Produktpflege**: Lieferant erfasst und pflegt seine Produkte selbst
- **Produktkategorien**: Anlagen (Osmose, Enthärtung, Druckerhöhung, Pumpen etc.), Armaturen, Rohre, Zubehör
- **Admin-Zugriff**: GEMA-Admin kann alle Lieferanten-Daten einsehen und Lieferanten deaktivieren (z.B. bei Zahlungsverzug)
- **Offertanfragen**: Lieferant sieht eingehende Anfragen aus Berechnungen der Planer

### Verifizierung

1. GEMA erfasst Anlagen vor (Basisdaten)
2. Lieferant loggt sich ein, prüft/ergänzt seine Anlagendaten
3. Lieferant bestätigt die Korrektheit der Daten
4. Anlage erhält den **"Verifiziert"-Badge** ✓
5. Nicht-verifizierte Anlagen werden als "Nicht verifiziert" markiert

### Monetarisierung

**Basis-Zugang (kostenpflichtig)**:
- Lieferant zahlt, um Zugang zum System zu erhalten
- Eigene Produkte/Anlagen erfassen und pflegen
- Technische Daten verifizieren
- Offertanfragen empfangen und beantworten

**Premium-Platzierung (zusätzliche Verträge)**:
- Bevorzugte Position in der Anlagen-Auswahl (immer oben)
- Empfehlungen/Hervorhebung bei passenden Berechnungen
- Erweiterte Sichtbarkeit im Katalog
- Weitere Premium-Features (nach Vereinbarung)

**Admin-Kontrolle**:
- Lieferant kann bei Zahlungsverzug deaktiviert werden
- Deaktivierter Lieferant: Produkte nicht mehr sichtbar, keine Offertanfragen

---

## Rollen & Zugangssystem

Jede Rolle hat ein eigenes Login mit rollenspezifischer Ansicht.

### Rollenübersicht

| Rolle | Sicht | Hauptfunktionen |
|-------|-------|----------------|
| **Sanitärplaner** | Vollzugang Berechnungen + PM | Berechnungen erstellen, Projekte verwalten, Ausschreibungen, Offertanfragen |
| **Heizungsplaner** | Vollzugang Berechnungen + PM | Wie Sanitärplaner, Gewerk: HLKK |
| **Lüftungsplaner** | Vollzugang Berechnungen + PM | Wie Sanitärplaner, Gewerk: Lüftung |
| **Elektroplaner** | Vollzugang Berechnungen + PM | Wie Sanitärplaner, Gewerk: Elektro |
| **Abteilungsleiter** | Berechnungen + PM + Werkzeuge | Prüft Berechnungen, sieht alle Projekte der Abteilung, Werkzeug-Leserechte |
| **Unternehmer** | Ausschreibungen + Offerten | CRBX-Preise ausfüllen (langfristig in GEMA, kurzfristig Datei-Upload), Offertvergleich einsehen |
| **Bauherrschaft** | Projektübersicht + Kosten | Projektstatus, Kostenkontrolle, Terminplan, Freigaben (Read-only) |
| **Architekt** | Projektübersicht + Koordination | Terminplanung, Sitzungsprotokolle, Dokumentation |
| **Behörde** | Bewilligungen + Hygiene | W12-Prüfungen, Bewilligungsstatus, Inspektion (Read-only) |
| **Lieferant** | Eigenes Dashboard | Produktpflege, Verifizierung, Offertanfragen beantworten, Werkzeug-Prüfungen quittieren |
| **Garagist** | Eigenes Konto, externe Werkstatt | Pflegt zugewiesene Fahrzeuge: km-Stand, Service-Historie, MFK, Reifen, Defekte. Sieht Kaufbelege/Tankkarten nicht; Versicherungsdaten nur bei Freigabe pro Fahrzeug. Kein Erfassen neuer Fahrzeuge. |
| **Magaziner** | Werkzeug-/Fahrzeuglager der eigenen Org | Geräte erfassen + verwalten, Berichte schreiben, Personen zuweisen, Prüfungen bei Lieferanten anfordern |
| **Monteur** | Read-only auf Werkzeuge + Schadensberichte | Geräte einsehen, Defekte melden, Schadensmessungen + Fotos erfassen — keine Edit-Rechte auf Werkzeuge |
| **Prüfer** | Werkzeug-/Fahrzeug-Prüfungen | Quittiert Prüfungs-Aufträge, lädt Prüfberichte hoch |
| **Admin** | Alles | Benutzer verwalten, Lieferanten aktivieren/deaktivieren, System konfigurieren |

### CRBX-Workflow (Ausschreibung)

**Kurzfristig (Datei-basiert)**:
1. Planer lädt CRBX/E1S-Datei hoch
2. Planer verteilt an Unternehmer
3. Unternehmer füllt Preise aus (extern)
4. Unternehmer lädt ausgefüllte Datei zurück
5. Offertvergleich mit 0-Positions-Erkennung

**Langfristig (In-GEMA)**:
1. Planer erstellt Ausschreibung in GEMA
2. Unternehmer füllt Preise direkt in GEMA aus
3. Automatischer Offertvergleich
4. Alles in einem System, keine Dateien mehr nötig

CRBX = ZIP mit SIA 451 .e1s Datei (Festbreiten-Format, Satztypen A/B/C/G/Z).

---

## Projektstruktur

### Dateinamen-Konventionen

Kategorie-Präfix + Kleinschreibung. **Keine Umlaute in Dateinamen** (ä→ae, ö→oe, ü→ue). Displaynamen in Titeln und Breadcrumbs behalten echte Umlaute.

| Präfix | Bereich | Beispiel |
|--------|---------|---------|
| `sb_` | Sanitärberechnungen | `sb_druckerhoehung.html` |
| `pm_` | Projektmanagement | `pm_ausschreibung.html` |
| `sa_` | Sanitäranlagen | `sa_enthaertung.html` |
| `el_` | Elektro | `el_index.html` |
| `hy_` | Hygiene | `hy_w12.html` |
| `br_` | Brandschutz | `br_index.html` |
| `if_` | Infrastruktur (Werkzeug, Fahrzeug, Lager) | `if_werkzeug.html`, `if_fahrzeug.html` |
| `sd_` | Schadensdokumentation | `sd_schadensbericht.html` |
| `ab_` | Ausbildung | `ab_index.html` |
| `sys_` | System | `sys_settings.html` |

Hauptseite: `index.html`. Hub-Seiten: `sb_index.html`, `pm_ausschreibung.html`, `ab_index.html`.

### Modulübersicht

- **16 Sanitärberechnungs-Module** (sb_): Inkl. LU-Zusammenstellung, Druckerhöhung, Osmose, Enthärtung etc.
- **Projektmanagement-Module** (pm_): Objekte, Terminplanung, Sitzungsprotokolle, Kostenkontrolle, Ausschreibung
- **Hygiene-Module** (hy_): W12 Selbstkontrolle (SVGW)
- **Infrastruktur-Module** (if_): Werkzeugmanagement, Fahrzeugmanagement, Trocknungsgeräte (siehe Abschnitte weiter unten)
- **Schadensdokumentation** (sd_): Schadensberichte (siehe Abschnitt „Schadensdokumentation" weiter unten). Trocknungsgeräte (if_trocknung.html) liefert automatisch Gerätedaten via `GemaTrocknung`-API.
- **Zentrale Module**: `index.html` (Hauptnavigation / Modulübersicht), `pm_objekte.html` (Projektverwaltung)
- **Lieferanten-Modul**: `sys_lieferant_dashboard.html` mit 6 Tabs (Übersicht, Produkte, Anfragen, Rohrsysteme, Werkzeuge, Firmenprofil)
- **Garagist-Modul**: `sys_garagist_dashboard.html` mit 4 Tabs (Übersicht, Anstehend, Service-Historie, Werkstatt-Profil). Login-Redirect für `role_garagist`. Zeigt nur Fahrzeuge, deren `garagistUserId === me.id`, mit Quick-Action `?service=ID` zurück nach `if_fahrzeug.html`, die das Service-Modal direkt öffnet.

---

## Design-System

### Schriften & Layout

- **Schrift**: DM Sans (kein DM Mono)
- **Max-Width**: `1100px` für `.g-page`
- **Navigation**: Full-width (kein max-width), `height: 52px`, `padding: 0 24px`

### Navigation (.g-nav-*)

Einheitliche Klassen für alle Module:

```html
<nav class="g-nav">
  <a class="g-nav-logo" href="index.html">
    <!-- Vollständiges SVG: Icon + GEMA-Text, height="28" -->
  </a>
  <div class="g-nav-actions">
    <button class="g-nav-btn" id="feedbackBtn">Feedback</button>
    <!-- ⚙️ Einstellungen: NUR auf Hauptseiten (index, sb_index, pm_ausschreibung, ab_index) -->
    <!-- 👥 Admin: NUR auf index.html, class="gema-admin-only" -->
  </div>
</nav>
```

### Navigationslogik (Breadcrumbs)

- **Sanitärberechnungen (16 Module)**: GEMA-Logo → `index.html`, Breadcrumb "Sanitärberechnungen" → `sb_index.html`
- **Nicht-Sanitär-Module**: Logo → `index.html` (nur Logo-Link)

### Hauptmodul-Design (index.html / Übersichtsseiten)

Hero im `index.html`-Stil:
- Dunkler Gradient: `#0f172a → #1e3a5f → #0c4a2e`
- Grid-Overlay, Radial-Gradients
- `border-radius: 20px`, `padding: 48px`
- Zweispaltig: links Eyebrow-Pill + grosser Titel (`clamp(28px, 42px)`) + Beschreibung + Stats-Zeile; rechts Badge-Karten (Normen + CH Hosting)
- Effektive Modulzählung (nicht "16+")

---

## Code-Patterns

### Numerische Inputs (KRITISCH)

Alle numerischen Eingabefelder verwenden dieses Pattern:

```html
<input type="text" inputmode="decimal" onblur="fixLeadingZero(this)" placeholder="0.0">
```

Die `fixLeadingZero`-Funktion ist global in einem eigenen `<script>`-Tag:

```javascript
function fixLeadingZero(el) {
  let v = el.value.trim();
  if (v === '') return;
  if (/^\./.test(v)) v = '0' + v;
  if (/^-\./.test(v)) v = '-0' + v.slice(1);
  el.value = String(parseFloat(v));
}
```

**Niemals** `type="number"` verwenden!

### Placeholder-Farbe

```css
::placeholder { color: #cbd5e1; }
```

### GemaDB-Guards (KRITISCH)

Jeder Zugriff auf die Datenbank muss mit einem typeof-Check geschützt sein:

```javascript
if (typeof _GemaDB !== 'undefined') {
  // DB-Operationen hier
}
```

### In-Memory Fallback

Falls keine DB-Verbindung besteht, nutzen Module einen universellen In-Memory-Store:

```javascript
const _memStore = {};
```

### IIFE-Syntax

Korrekte Syntax für IIFEs:

```javascript
(function() {
  // Modul-Code
})();
```

**Nicht**: `(function() { ... }());` (doppelte Klammer am Ende vermeiden)

### Admin-Check

```javascript
const u = GemaAuth.getCurrentUser();
const isAdmin = u && u.roleIds && u.roleIds.indexOf('role_admin') >= 0;
```

**Niemals** `u.isAdmin` verwenden — das Property existiert nicht!

---

## Objekt-spezifisches Storage-Pattern

Storage-Keys verwenden das Format: `BASE_KEY + '__' + objektId`

### Kritische Initialisierungsreihenfolge

```
resetAll() → loadMeta() → populateObjektDropdown() → loadLocal(true)
```

Auto-Save/Load bei Objektwechsel.

### Combo-Widget (Projektfeld)

- Dropdown aus Stammdaten
- `[+]`-Icon verlinkt zu `pm_objekte.html`
- "Freies Objekt"-Toggle: rechts ausgerichtet via `margin-left: auto` auf `.obj-combo-toggle`
- Bearbeiter/Datum-Felder: `border: 1.5px solid`, `padding: 7px 10px`, `height: auto`

---

## Cross-Modul API

`gema_objekte_api.js` stellt bereit:
- `GemaObjekte.getAll()` – alle Objekte (gefiltert nach Org)
- `GemaObjekte.getActive()` / `getActiveId()` – aktives Objekt
- `GemaObjekte.setActiveId(id)` – aktives Objekt wechseln (feuert `gema-objekt-changed`)
- `GemaObjekte.getBeteiligte()` – Beteiligte des aktiven Objekts
- `GemaObjekte.storageKey(baseKey)` – Phasen-aware Storage-Key: `baseKey__objektId[@phase]`

**Team-Zuweisung (P08):** drei Rollen pro Objekt — Projektleiter, Abteilungsleiter (Prüfer), Team-Mitglieder
- `Objekt.projektLeiterId`, `Objekt.abteilungsLeiterId`, `Objekt.teamUserIds[]` — User-IDs der eigenen Org
- `GemaObjekte.getAssignedUserIds(obj)` — alle zugewiesenen User-IDs (dedupliziert)
- `GemaObjekte.isAssignedToCurrentUser(obj)` — prüft ob aktueller User zugewiesen ist
- `GemaObjekte.canEditTeam(obj)` — nur Projektleiter + Admins dürfen Team ändern (bzw. Ersteller vor erster Zuweisung)
- UI: In `pm_objekte.html` Filter «Meine / Büro» in der Toolbar, Initialen-Bubbles (max 3 + «+X») auf Objekt-Card
- «Meine Projekte»: Objekte wo ich Projektleiter, Abteilungsleiter oder im Team bin

**Berechnungs-Index (P04):** automatische Registrierung aller Berechnungen pro Projekt
- `GemaObjekte.registerBerechnung({modul, objektId?, titel?, storageKey?})` – wird von `gema_autosave.js` bei jedem Save aufgerufen
- `GemaObjekte.getBerechnungenForObjekt(objektId)` – alle Einträge pro Projekt
- `GemaObjekte.getBerechnungenForCurrentOrg()` – Org-weit (wird in pm_objekte.html im Tab «Berechnungen» angezeigt)
- Storage: `gema_berechnungen_index_v1` (Array von `{key, modul, objektId, titel, orgId, createdAt, lastModified, ...}`)
- Empfänger-Filter: `orgId` → Team-Sichtbarkeit innerhalb der Organisation

**URL-Parameter `?objekt=ID`:** setzt beim Seitenaufruf automatisch das aktive Objekt. Wird vom Berechnungen-Tab in pm_objekte.html genutzt, damit der Planer direkt in der richtigen Zuordnung landet.

**Zuordnungs-Pill:** `gema_objekte_api.js` injiziert automatisch einen Status-Chip in die `.project-bar`:
- 📋 «Zugeordnet zu: <Objekt>» (grün) wenn Objekt aktiv
- ⚠ «Nicht zugeordnet — bitte Projekt wählen» (amber) sonst

Geplant: `gema_lu_api.js` für den Datenfluss aus der LU-Zusammenstellung:
- `GemaLU.getVerbraucher(objektId)` – alle Verbraucher eines Projekts
- `GemaLU.getByMedium(objektId, medium)` – Verbraucher gefiltert nach Medium
- `GemaLU.getSpitzenvolumenstrom(objektId, medium)` – berechneter l/s-Wert

---

## Feedback & PDF-Systeme

### gema_feedback.js (v3)

- Roter Stift-Annotation-Overlay nach Screenshot-Snip
- Maus/Touch-Zeichnung, Undo/Clear/Skip/Done
- **Wichtig**: Frisches Canvas bei jedem Öffnen erstellen (kein `getBoundingClientRect()`-Caching)
- localStorage-Fallback

### gema_pdf.js (v2)

- Screenshots via html2canvas (Buttons/Nav ausblenden)
- Automatische A4-Seitenumbrüche
- "Seite X/Y"-Seitennummern

---

## Häufige Fehlerquellen

### Orphaned </div>-Tags

Bei Batch-Migrationen können verwaiste `</div>`-Tags entstehen (z.B. wenn `g-ph`-Elemente entfernt werden). Diese verursachen, dass Content ausserhalb des `.g-page`-Containers rendert und die max-width-Begrenzung verliert.

**Prüfung**: Sicherstellen, dass jedes öffnende `<div>` ein schliessendes `</div>` hat und umgekehrt.

### "← Alle Module"-Links

Diese Nav-Links wurden entfernt. Nicht wieder einfügen.

---

## W12-Modul (hy_w12.html)

Selbstkontrolle nach SVGW W12:
- 17 GVP-Module (A–R), 216 Prüfpunkte
- 5 Tabs: GVP-Checkliste, Risikomanagement (HACCP), Massnahmen, Systembewertung, Aktivitätslog
- Storage-Key: `gema_w12_v1`
- Aktivitätslog nutzt `GemaAuth.getCurrentUser()` für Benutzernamen

---

## Werkzeug- & Fahrzeugmanagement (if_-Module)

Zwei Module: `if_werkzeug.html` und `if_fahrzeug.html`. Verwalten den Bestand an Geräten, Maschinen und Fahrzeugen einer Organisation inklusive Prüfungs-, Wartungs- und Defektzyklen.

### Multi-Tenant-Storage (KRITISCH)

Werkzeug und Fahrzeug teilen sich **einen** Storage-Pool (`gema_werkzeug` bzw. `gema_vehicles`) über alle Organisationen hinweg. Jeder Datensatz trägt eine `orgId` und der Loader filtert auf `u.orgId`. Beim Speichern werden fremde Orgs aus dem Storage gelesen und unverändert wieder zurückgeschrieben — sonst würde Org A die Datensätze von Org B überschreiben.

**Werkzeug** (`if_werkzeug.html:1455`):
- `_wzReadAllRaw()` / `_wzWriteAllRaw()` — gesamter Pool
- `load()` filtert auf `u.orgId`, `save()` ersetzt nur eigene
- Migration: `tools` ohne `orgId` werden beim ersten Load der ersten gefundenen `orgId` (oder eigener Org) zugewiesen
- `submitForm()` setzt `tool.orgId = existing.orgId || u.orgId`

**Fahrzeug** (`if_fahrzeug.html:782`):
- `_fzReadAllRaw()` / `_fzWriteAllRaw()` / `_fzLoadVehicles()`
- **Sonderfall Garagist**: User mit `role_garagist` sehen nur Fahrzeuge mit `v.garagistUserId === u.id` — cross-org gewollt (eine Werkstatt betreut Kunden mehrerer Firmen). `persist()` schreibt für Garagisten nur seine eigenen Fahrzeuge zurück.
- Sonst: Filter auf `v.orgId === u.orgId`
- Migration analog Werkzeug
- `saveVehicle()` setzt `data.orgId = me.orgId` (beim Edit aus `vehicles[idx].orgId` erhalten)

**Self-Service Onboarding**: `sys_login.html` → 3-Step Wizard legt eine neue Org plus Admin-User an. Damit kann sich ein neues Unternehmen direkt registrieren und sieht ausschliesslich seine eigenen Werkzeuge/Fahrzeuge — keine Admin-Aktion nötig.

### Tool-Schema (if_werkzeug.html)

Storage-Key: `gema_werkzeug` via `_GemaDB`. Felder pro Werkzeug:

| Feld | Zweck |
|------|------|
| `id`, `name`, `cat`, `brand`, `model`, `bought`, `warranty`, `serial`, `notes` | Stammdaten |
| `supplier`, `supplierId` | Lieferant/Grosshändler (Freitext + verknüpfte Lieferant-ID aus GemaAuth) |
| `kaufbeleg:{rechnungsNr,betrag,bestellNr,lieferdatum,datei:{name,type,dataUrl}}` | Kaufbeleg mit optionalem Datei-Upload (Base64, max 2 MB) |
| `hasService`/`serviceInterval`/`lastService` | Wartungsintervall (Monate) + letzter Service |
| `hasElec`/`elecInterval`/`lastElec`/`elecHistory[]` | Elektroprüfung NIV |
| `hasLeiter`/`leiterInterval`/`lastLeiter`/`leiterHistory[]` | Leiterprüfung EKAS (nur Kategorie `leiter`) |
| `zugewiesenAn:{userId,name,seit}` | Aktuell zugewiesene Person (Magaziner setzt das) |
| `berichte:[{id,typ,datum,autorUserId,autorName,titel,beschreibung,...}]` | Defekt- und Prüfberichte als Historie |
| `pruefAnfrage:{lieferantId,lieferantFirma,wunschtermin,bemerkung,angefordertAm,angefordertVon,status}` | Aktive Prüfungs-Anfrage an einen Lieferanten |
| `ersatzAnfragen:[{id,lieferantId,lieferantFirma,typ,nachricht,status,erstelltAm,...}]` | Ersatz-/Nachfolger-Anfragen an Lieferanten |

### Berechtigungs-Helper (if_werkzeug.html)

Drei zentrale Funktionen, die alle UI-Buttons und Aktionen abfragen:

```javascript
_wzCanEdit()         // Admin oder Magaziner: erfassen, ändern, löschen
_wzCanAssign()       // wie _wzCanEdit: Personen zuweisen
_wzCanReportDefect() // alle eingeloggten User: Defekt melden
```

**Monteur**: sieht Geräte, kann nur Defekte melden — kein Edit, kein Delete, kein „+ Neu"-Button. Die Logik wird in den Render-Funktionen `renderCard` / `renderRow` und im `DOMContentLoaded`-Block enforced.

### Berichts-System

`t.berichte[]` enthält zwei Bericht-Typen, zusammen in einer Liste:

- **`typ:'defekt'`**: Defektmeldung mit `titel`, `beschreibung`, `schweregrad` (`leicht`/`mittel`/`schwer`/`ausser_betrieb`), `erledigt`, `erledigtAm`. Erfassung via `openDefektMelden(toolId)`. Magaziner markiert Defekte als erledigt via `_wzDefektErledigt`.
- **`typ:'pruefbericht'`**: Prüfbericht mit `ergebnis`, `fehlendeTeile[]`, `naechstePruefung`. Erfassung via `openPruefbericht(toolId)`. Synchronisiert gleichzeitig `lastService`/`lastElec`/`lastLeiter`, damit `worstDays()` weiterläuft.

Die komplette Historie ist via `openBerichte(toolId)` einsehbar (alle Rollen). Defekt-Banner auf der Karte: solange ein Defekt nicht erledigt ist, erscheint „⚠ Defekt offen".

### Personen-Zuweisung

`openZuweisung(toolId)` (nur Magaziner/Admin) zeigt einen Dropdown aller Monteur-, Unternehmer- und Magaziner-User der **eigenen Organisation** (gefiltert via `orgId`). Nach Auswahl wird `t.zugewiesenAn` gesetzt und eine Notifikation an den zugewiesenen User gepusht (`werkzeug_zuweisung`).

### Lieferanten-Prüfungs-Workflow (Phase 3)

Drei-stufiger Workflow zwischen Magaziner und externem Prüf-Lieferanten:

1. **Anfordern** — `openPruefAnfordern(toolId)` (nur Magaziner/Admin). Dropdown aller `role_lieferant`-User, Wunschtermin, Bemerkung. Speichert `t.pruefAnfrage = {…, status:'angefordert'}` und pusht `werkzeug_pruefung_anfrage` an den Lieferanten mit Link `if_werkzeug.html?pruef_lief=TOOL_ID`.
2. **Quittieren** — `_wzPruefLiefQuittieren(toolId)`. Lieferant öffnet die Notifikation → die Lieferanten-Ansicht `openPruefLiefAnsicht(toolId)` öffnet sich → Klick auf „✓ Auftrag quittieren" → Status wechselt auf `quittiert`, Notifikation zurück an den Magaziner.
3. **Bericht einreichen** — `_wzPruefLiefBerichtEinreichen(toolId)`. Lieferant trägt Datum, Ergebnis, Bemerkungen, nächste Prüfung ein. Erzeugt einen `typ:'pruefbericht'`-Eintrag in `t.berichte[]` mit `vonLieferant:true`, aktualisiert `lastService`/`lastElec`/`lastLeiter`, setzt Status auf `erledigt` und benachrichtigt den Magaziner mit `typ:'erfolg'` (bei Bestanden) oder `typ:'warnung'` (bei Mängeln).

Status-Banner auf der Karte: 🟠 Angefordert → 🔵 Quittiert → 🟢 Erledigt.

### Fälligkeits-Scan

`_wzScanFaelligkeiten()` läuft einmal pro Sitzung im `DOMContentLoaded` (nur wenn `_wzCanEdit()` true ist). Für jedes Werkzeug ermittelt `_wzNextPruefung(t)` den frühesten fälligen Prüftermin über alle aktiven Prüfungen (Service / Elektro / Leiter). Je nach Restzeit wird eine Schwelle bestimmt:

| Schwelle | Kriterium | Notifikations-Typ |
|----------|----------|-------------------|
| `overdue` | Tage < 0 | `warnung` |
| `d1` | 0 ≤ Tage ≤ 1 | `warnung` |
| `d7` | 2 ≤ Tage ≤ 7 | `aktion` |
| `d30` | 8 ≤ Tage ≤ 30 | `aktion` |

Notifikation wird via `GemaNotify.push({eventKey:'werkzeug_pruefung_faellig', empfaengerRoleId:'role_magaziner', empfaengerOrgId:user.orgId, …})` an alle Magaziner der eigenen Org gesendet. **Deduplizierung**: localStorage-Lock `gema_werkzeug_notif_lock_v1` mit Schlüssel `tool:schwelle = heute`. Verhindert mehrfache Notifikationen pro Tag und Schwelle.

### Lieferanten-Anbindung im Werkzeug

Jedes Werkzeug kann über `supplier` + `supplierId` mit einem Lieferanten-Account verknüpft werden. Das Autocomplete-Feld sucht in:
1. Bestehenden Geräten (eigene Org)
2. GemaAuth-Users mit `role_lieferant`

**Basiskatalog**: `WERKZEUG_KATALOG` (~100 Einträge) liefert Vorschläge für Bezeichnung, Hersteller und Modell. Toggle «Basiskatalog anzeigen» steuert, ob Katalog-Einträge in den Vorschlägen erscheinen. Kreuzfilterung: Hersteller filtert Modell, Modell-Auswahl füllt Hersteller + Kategorie aus.

**Defektmeldung an Lieferant**: Separater Button «An Lieferant melden» pro offenem Defekt (nicht automatisch). Setzt `b.anLieferantGemeldet` und pusht `werkzeug_defekt_lieferant`-Notifikation an den verknüpften Lieferanten.

**Ersatz-/Nachfolger-Anfrage**: Button «🔄 Ersatz» erscheint auf Karten mit offenem Defekt. Modal mit Lieferanten-Auswahl, Typ (Ersatz/Nachfolger/Alternative), Nachricht. Gespeichert in `t.ersatzAnfragen[]`, Notifikation via `werkzeug_ersatz_anfrage`.

**Kaufbeleg**: Aufklappbare Sektion im Formular. Felder: Rechnungs-Nr., Betrag, Bestell-Nr., Lieferdatum + optionaler Datei-Upload (PDF/Bild, Base64, max 2 MB). Anzeige im View-Modal mit Beleg-Vorschau.

**Dashboard-Integration**: `sys_lieferant_dashboard.html` — Werkzeuge-Tab ist für `role_lieferant` UND `role_pruefer` sichtbar. Zeigt Defektmeldungen und Ersatzanfragen, die an den eingeloggten Lieferanten gerichtet sind.

### Fahrzeugmanagement (if_fahrzeug.html)

Eigenständiges Modul mit ähnlicher Struktur (Liste, QR-Code-Generierung mit SVG-Download, Service-Intervalle). Schreib-Zugriff: `role_magaziner`, `role_pruefer`. Nicht alle Werkzeug-Features (Berichte, Zuweisung, Lieferanten-Workflow) sind im Fahrzeug-Modul gespiegelt — bei Bedarf gleicher Pattern wie if_werkzeug.html anwenden.

---

## Schadensdokumentation (sd_schadensbericht.html)

Modul zur Dokumentation von Wasserschäden, Schimmelschäden, Rohrbrüchen etc. — von der Schadensmeldung über Leckortung und Trocknung bis zum Abschlussbericht für die Versicherung.

### Architektur-Entscheide

- **Objekt-Zuordnung**: Jeder Schaden wird zwingend einem bestehenden GEMA-Objekt zugeordnet (mit Schnell-Anlage-Button zu `pm_objekte.html`)
- **Trockner-Zuordnung**: Trocknungsgeräte werden pro Raum/Zone im Schadensprojekt zugeordnet (z.B. „Trockner A im Bad, Ventilator B im Flur")
- **Stromberechnung**: Nur kWh berechnen (Zählerstand-Differenz × kW), kein Preis — Planer setzt Kosten manuell
- **Messwert-Darstellung**: User wählt zwischen Tabellen-Ansicht und Canvas-Liniendiagramm (Toggle)
- **Dashboard**: Volle Info-Karten im Werkzeug-Stil (Status-Bar, Typ-Icon, Phase-Badge, Foto-Zähler)
- **Rollen**: Sanitärplaner (read+write), Monteur (Messungen + Fotos), Admin (alles)
- **Phasenaufteilung**: Phase 1 = sd_schadensbericht.html (Berichte + manuelles Geräte-Tracking), Phase 2 = if_trocknung.html (separates Gerätemanagement)

### Phasen-Workflow

```
Erfasst → Zustandsanalyse → Trocknung → Abschluss
   │            │                │            │
   │    Leckortung,        Messpunkte,   Zusammenfassung,
   │    Massnahmen,        Geräte (kWh), Instandstellung,
   │    Fotos              Messwerte,    finaler Export
   │                       Fotos
   │
   Schadentyp, Objekt (zwingend),
   Versicherung, Räume
```

### Schadentypen

| Typ | Icon | Key |
|-----|------|-----|
| Wasserschaden | 💧 | `wasserschaden` |
| Schimmelschaden | 🦠 | `schimmel` |
| Rohrbruch | 🔧 | `rohrbruch` |
| Leitungsschaden | ⚡ | `leitungsschaden` |
| Rückstau | 🌊 | `rueckstau` |
| Sonstiges | 📋 | `sonstiges` |

### Datenmodell

Storage-Key: `gema_schadensbericht_v1`

Jeder Schaden hat: `id`, `typ`, `titel`, `objektId` (zwingend), `phase`, `beschreibung`, `ursache`, `raeume[]`, `versicherung{name,policeNr,schadenNr,kontakt}`, `erstelltAm`, `erstelltVon{userId,name}`.

Drei Unter-Objekte pro Schaden:
- `zustandsanalyse{leckortung, schadenausmass, massnahmen[], fotos[], abgeschlossenAm}`
- `trocknung{gestartetAm, beendetAm, messpunkte[{name, messungen[{datum,wert}]}], geraete[{name,raum,kw,zaehlerStart,zaehlerEnde}], fotos[], notizen}`
- `abschluss{zusammenfassung, instandstellung, weitereSchaeden, fotos[], abgeschlossenAm}`

### Berechtigungs-Helper

```javascript
_sdCanEdit()     // Admin, Planer (alle Gewerke): voller Zugriff
_sdCanMeasure()  // wie _sdCanEdit + Monteur: Fotos + Messwerte erfassen
```

**gema_auth.js-Integration**:
- `schadensbericht` in MODULES-Array (Kategorie `Schadensdokumentation`)
- `sd_schadensbericht` in FILE_MAP → `schadensbericht`
- Monteur-Rolle: `schadensbericht: {read:true, write:true, admin:false}` (kann Messungen + Fotos erfassen)
- Planer-Rollen: automatisch via `_allPerms(true,true,false)`

### Dashboard (Hauptansicht)

- **KPI-Zeile**: 4 Stat-Cards (Total, In Analyse, In Trocknung, Abgeschlossen) — klickbar als Filter
- **Karten-Grid**: `repeat(auto-fill, minmax(360px, 1fr))` — Status-Bar (rot/amber/grün/blau), Typ-Icon, Titel, Adresse, Phase-Badge, Foto-Zähler
- **Toolbar**: Suche, "+ Neuer Schaden", Karten/Tabellen-Toggle, mobile Suchbutton
- **Tabellenansicht**: Horizontal scrollbar auf Mobile

### Detail-Ansicht

Full-Screen-Overlay (`position:fixed`) mit 4-Phasen-Timeline und aufklappbaren Accordion-Sektionen pro Phase. Aktive Phase ist offen, abgeschlossene Phasen zeigen Summary, zukünftige sind ausgegraut.

### Foto-System

- Base64, max 1600px Resize, max 2MB, JPEG-Komprimierung (0.82, Fallback 0.5)
- `capture="environment"` für Kamera auf Mobile
- Pro Foto: Kommentar-Dialog + Checkbox «Im Bericht anzeigen»
- Fotos sind phasenspezifisch (Analyse, Trocknung, Abschluss)
- Lightbox-Ansicht bei Klick
- Delete-Buttons auf Touch-Geräten immer sichtbar (kein Hover)

### Messwert-System (Trocknung)

- Messpunkte definieren (z.B. „Wand links Bad")
- Pro Messpunkt: Messungen über Zeit (Datum, Wert in %)
- Ansicht umschaltbar: Tabelle oder Canvas-Liniendiagramm (reines Canvas, keine Library)
- Geräte-Tracking (Phase 1 — manuell): Name, Raum/Zone, kW, Zählerstand Start/Ende → kWh-Berechnung
- Geräte-Tabelle mit horizontalem Scroll-Wrapper auf Mobile

### Export

- **PDF**: via GemaPDF/html2canvas, GEMA-Branding, Fotos eingebettet
- **Word**: HTML mit Word-XML-Namespace als .doc, editierbar
- Beide nutzen gemeinsame Funktion `sdBuildReportHtml(s)`

### Responsive Design

| Breakpoint | Gerät | Anpassungen |
|-----------|-------|-------------|
| `≤1024px` | iPad/Tablet | Stats 2-spaltig, Detail volle Breite, kompaktere Tabellen |
| `≤640px` | Smartphone | Vertikale Timeline, Bottom-Sheet-Modals, 48px Input-Höhe, Touch-Buttons ≥44px, gestackte Formfelder, mobile Toolbar |
| `≤380px` | iPhone SE | Weitere Komprimierung, kleinere Stats/Icons |
| `safe-area-inset` | iPhone Notch | Padding für Notch und Home-Bar |
| `hover:none + pointer:coarse` | Touch | Active-States statt Hover-Transforms, immer sichtbare Delete-Buttons |

### Modulübersicht-Integration

- **index.html**: Eigene Kategorie «Schadensdokumentation» (`data-cat="schaden"`) mit rotem Farbschema, zwischen Infrastruktur und Ausbildung. Trocknungsgeräte sind dort als Modul-Kachel platziert (nicht in der Infrastruktur-Kategorie, um Doppelbenennung zu vermeiden)
- **sw.js**: Beide Module im Cache-Array (`CACHE_FILES`), SW-Version hochgezogen bei Änderungen

---

## Trocknungsgeräte (if_trocknung.html)

Phase 2 der Schadensdokumentation — separates Gerätemanagement für Trocknungsgeräte. Gleiche Architektur wie if_werkzeug.html.

### Gerätetypen

| Typ | Icon | Key | Farbe |
|-----|------|-----|-------|
| Bautrockner | 🌡️ | `bautrockner` | #dc2626 |
| Ventilator | 🌀 | `ventilator` | #2563eb |
| Luftentfeuchter | 💨 | `luftentfeuchter` | #7c3aed |
| Infrarotheizung | ☀️ | `infrarot` | #d97706 |

### Status

| Status | Key | Farbe |
|--------|-----|-------|
| Verfügbar | `verfuegbar` | grün |
| Im Einsatz | `im_einsatz` | amber |
| In Wartung | `in_wartung` | blau |
| Defekt | `defekt` | rot |

### Datenmodell

Storage-Key: `gema_trocknung_v1`

```
{
  id, name, typ, marke, modell, serienNr, kw, notes, orgId,
  status: 'verfuegbar'|'im_einsatz'|'in_wartung'|'defekt',
  hasService, serviceInterval, lastService,
  
  einsatz: null | {
    schadenId, schadenTitel, objektId, objektName,
    raum,              // Raum/Zone (z.B. "Bad EG")
    eingesetztAm, eingesetztVon:{userId,name},
    zaehlerStart       // Stunden
  },
  
  einsatzHistorie: [{
    ...einsatz, zaehlerEnde, zurueckAm, kwhTotal, betriebsstunden
  }]
}
```

### Einsatz-Workflow

1. **Einsetzen**: Schadensprojekt auswählen (aus `gema_schadensbericht_v1`, nur aktive Fälle), Raum/Zone, Zählerstand Start → Status wechselt auf `im_einsatz`
2. **Zurücknehmen**: Zählerstand Ende eingeben → Auto-Berechnung kWh = (Ende − Start) × kW → Einsatz wird in `einsatzHistorie` verschoben → Status zurück auf `verfuegbar`

### QR-Code

- QR-Generierung pro Gerät als SVG (inline QR-Library)
- SVG-Download + PNG-Download
- URL: `if_trocknung.html?id=DEVICE_ID` — öffnet automatisch Detail

### Cross-Module API (GemaTrocknung)

```javascript
window.GemaTrocknung = {
  getForSchaden(schadenId),        // aktive Geräte eines Schadens
  getHistoryForSchaden(schadenId), // abgeschlossene Einsätze mit kWh
  getAllDevices()                  // alle Geräte
};
```

Datenfluss: sd_schadensbericht.html kann über `GemaTrocknung.getForSchaden()` die aktuell zugewiesenen Geräte und deren kWh-Werte automatisch in den Bericht übernehmen.

### Berechtigungs-Helper

```javascript
_tgCanEdit()         // Admin, Magaziner, Planer (alle Gewerke)
_tgCanAssign()       // wie _tgCanEdit
_tgCanReportDefect() // jeder eingeloggte User (inkl. Monteur)
_tgHasOpenDefekt(d)  // true, wenn d.berichte einen offenen Defekt enthält
```

**gema_auth.js-Integration**:
- `trocknungsgeraete` in MODULES-Array (Kategorie `Infrastruktur`)
- `if_trocknung` in FILE_MAP → `trocknungsgeraete`
- Magaziner: read+write+admin
- Monteur: read-only (kann via `_tgCanReportDefect` Defekte melden, analog zu if_werkzeug)
- Planer/Admin: automatisch via `_allPerms`

### Defektmeldungen (analog if_werkzeug.html)

`d.berichte[]` pro Gerät — Einträge mit `typ:'defekt'`:
```
{ id, typ:'defekt', datum, autorUserId, autorName,
  titel, beschreibung, schweregrad, erledigt, erledigtAm }
```

- **`schweregrad`**: `leicht` / `mittel` / `schwer` / `ausser_betrieb`. Bei `schwer`/`ausser_betrieb` setzt `saveDefekt` automatisch `d.status='defekt'` (sofern nicht im Einsatz). Erledigt-Markierung durch Magaziner setzt Status zurück auf `verfuegbar`, falls keine offenen schweren Defekte mehr bestehen.
- **UI**: Defekt-Banner („⚠ Defekt offen") auf der Karte, „⚠ Defekt"-Button in Karte / Tabelle / Detail-Footer (alle eingeloggten User), „📝 Berichte (N)"-Button bei vorhandenen Berichten.
- **Berichte-Modal** (`openBerichte(id)`): Liste aller Defekte chronologisch (neueste zuerst), Schweregrad-Pill, Erledigt-Status. Magaziner/Admin sehen „✓ Als erledigt markieren"-Button (`_tgDefektErledigt`).
- **Notifikation**: `GemaNotify.push({ eventKey:'trockner_defekt', empfaengerRoleId:'role_magaziner', empfaengerOrgId:user.orgId, … })` an alle Magaziner der eigenen Org.
- **Event-Key**: `trockner_defekt` in `gema_notify.js` registriert (defaultOn:true).

---

## Notifikations-System (GemaNotify)

Zentrales Modul `gema_notify.js` für In-App-Benachrichtigungen. Glocke + Toast-Anzeige via `gema_notify_ui.js`, automatisch in alle Seiten injiziert (in `.g-nav-actions` oder `.g-nav-right`).

### EVENT_KEYS (gema_notify.js)

| Event-Key | Modul | Default |
|-----------|-------|---------|
| `ausschreibung_einladung` | ausschreibung | on |
| `ausschreibung_offerte_neu` | ausschreibung | on |
| `ausschreibung_vergabe` | ausschreibung | on |
| `ausschreibung_crbx_bestaetigt` | ausschreibung | off |
| `werkzeug_defekt` | werkzeug | on |
| `werkzeug_zuweisung` | werkzeug | on |
| `werkzeug_pruefung_faellig` | werkzeug | on |
| `werkzeug_pruefung_anfrage` | werkzeug | on |
| `werkzeug_defekt_lieferant` | werkzeug | on |
| `werkzeug_ersatz_anfrage` | werkzeug | on |
| `fahrzeug_service_faellig` | fahrzeug | on |
| `fahrzeug_service_erledigt` | fahrzeug | on |
| `fahrzeug_garagist_zugewiesen` | fahrzeug | on |
| `lu_updated` | lu | off |
| `schaden_neu` | schadensbericht | on |
| `schaden_phase_geaendert` | schadensbericht | on |
| `trockner_zurueckgegeben` | trocknung | on |
| `trockner_defekt` | trocknung | on |

**Neue Module fügen ihre Event-Keys hier hinzu**, sonst greift kein Preferences-Filter.

### Public API

```javascript
GemaNotify.push({
  eventKey, empfaengerUserId, empfaengerRoleId, empfaengerOrgId,
  modul, typ:'info'|'aktion'|'erfolg'|'warnung',
  titel, text, link, objektId
});

GemaNotify.getForCurrentUser();   // sortiert nach ts, neuste zuerst
GemaNotify.getUnreadCount();
GemaNotify.markRead(id);
GemaNotify.markAllRead();
GemaNotify.remove(id);
GemaNotify.clearForCurrentUser();
GemaNotify.getPrefs();            // pro User, in 'gema_notify_prefs_v1'
GemaNotify.setPref(eventKey, enabled);
GemaNotify.isEventEnabled(eventKey);
GemaNotify.onChange(fn);
```

**Empfänger-Routing**: Mindestens eines von `empfaengerUserId`, `empfaengerRoleId` oder `empfaengerOrgId` setzen. **Preferences-Filter**: Wenn `eventKey` und `empfaengerUserId` gesetzt sind und der User das Event deaktiviert hat, wird die Notifikation gar nicht erst erstellt.

---

## Onboarding & Coachmarks

`gema_coachmarks.js` — zentrale API für geführte Touren auf einzelnen Seiten.

```javascript
GemaCoachmarks.init('seitenkey_v1', [
  {selector:'#cssElement', titel:'…', text:'…', position:'bottom'},
  …
]);
```

Speichert „abgeschlossen"-Status pro Seite in localStorage-Key `gema_coachmarks_done_<pageKey>`. Rendert Spotlight-Overlay + Card mit Weiter/Zurück/Skip. Coachmarks gibt es in: Lieferanten-Dashboard, Offertvergleich, einzelnen Berechnungsmodulen.

---

## Undo-System

`gema_undo.js` — In-Memory-Undo-Stack pro Modul.

```javascript
GemaUndo.init('moduleKey', {maxHistory:50});
GemaUndo.record('Aktion-Label', oldValue, newValue, function applyFn(value){ /* setzt value */ });
GemaUndo.undo();
GemaUndo.redo();
GemaUndo.canUndo();
GemaUndo.getHistory();
GemaUndo.showPanel();
```

Stack ist nicht persistiert — bei Reload weg. Nur für Same-Session-Korrekturen.

---

## Stammlieferanten-Sortierung (Premium-Tier)

`gema_produktkatalog_api.js` enthält `sortWithStamm(lieferanten)`. Die Reihenfolge hängt davon ab, ob der aktuelle Planer eine **Premium-Lizenz** hat:

**Planer ohne Premium (Standard-Lizenz):**
Keine Favoriten/Stamm-Auflösung — Lieferanten bezahlen für Sichtbarkeit:
1. **Premium-Lieferanten** (via Org-Abo, `GemaProdukte.isLieferantPremium()`)
2. **Verifizierte** Lieferanten
3. Alle anderen Lieferanten

**Planer mit Premium-Lizenz (`GemaProdukte.isPlanerPremium()`):**
Volle Flexibilität — bezahlt für eigene Ordnung:
1. **Persönliche Favoriten** (`getFavoriten()` / `toggleFavorit(id)`)
2. **Büro-Stammlieferanten** (`getOrgStamm()` / Admin setzt)
3. **Premium-Lieferanten**
4. **Verifizierte**
5. Alle anderen

**Commercial-Logik:** Lieferanten kaufen Premium-Platzierung (Org-Abo `typ: 'premium'`). Planer können mit Premium-Lizenz eigene Favoriten/Stammlieferanten pflegen — diese überschreiben die kommerzielle Reihenfolge.

**API:**
- `isPlanerPremium(user?)` — prüft `user.planerPremium === true` oder `user.abo.typ === 'premium'`
- `isLieferantPremium(lief)` — Legacy-Flag `lief.premium.aktiv` ODER Org-Abo des Lieferanten
- `getFavoriten()`, `isFavorit(id)`, `toggleFavorit(id)`
- `getOrgStamm()`, `toggleOrgStamm(id)` (nur Admin)

**Auto-Scroll nach Berechnung:** `GemaAnlagenwahl.scrollToResults(containerId)` scrollt smooth zur Anlagenauswahl + kurzer Box-Shadow-Puls. Wird vom Modul beim ersten validen Berechnungsergebnis aufgerufen.

---

## Parent-Child-Objekte (pm_objekte.html)

Objekte können hierarchisch sein: ein Hauptobjekt (z.B. „Überbauung Sonnenhalde") hat mehrere Unterobjekte (Haus A, Haus B, Tiefgarage). Feld `parentObjektId` auf dem Unter-Objekt zeigt auf den Parent. Helper-Funktion `getDescendantIds(parentId, pool)` liefert alle direkt + transitiv zugeordneten Unter-Objekte für Aggregationen (Kostenroll-up, Ausschreibungs-Filter, etc.).

---

## Externe Offerten-Anfragen

`gema_offer_request.js` — Helper, mit dem aus einem Berechnungsmodul (z.B. Enthärtung) heraus eine Offertanfrage an einen Lieferanten gesendet werden kann. Ergänzt den bestehenden Produktkatalog-Flow um den Fall „Lieferant ist nicht in GEMA, soll aber per E-Mail eingeladen werden". Eingebaut in mehreren `sa_`/`sb_`-Modulen via Switch im bestehenden Offertdialog.

---

## Workspace (sys_workspace.html)

Eigenständiges Modul — erreichbar über den «Workspace öffnen»-Link auf der Modulübersicht (`index.html`).

### Konzept

Ein **Eimer** ist ein flexibler Arbeitsraum, der Module, Notizen und Team-Mitglieder gruppiert. Vier Typen:
- **Bauprojekt** — reales Objekt mit Adresse und Bauherr
- **Übung** — Sandbox zum Lernen und Testen (z.B. FHNW)
- **Privat** — persönlicher Arbeitsraum
- **Team/Geteilt** — geteilter Eimer mit mehreren Mitgliedern

### Storage

- **Key**: `gema_workspace_v1` (localStorage + `_GemaDB`-Guard)
- **Datenmodell** pro Eimer:
  ```
  { id, name, type, shared, members[], modules[{mod,status}],
    activity[{who,text,when}], beteiligte[{role,name,org}],
    notes[{id,title,body}], createdAt }
  ```

### Features

- **Tab-Bar**: Browser-Style Tabs mit Gradient-Strip, mehrere Eimer gleichzeitig offen
- **Sidebar**: User-Block, Org-Switcher Pills, Bucket-Rows mit Avatar-Cluster, Gradient-Pill für offene Tabs
- **Modal-System**: Neuer Eimer (Name + 4-Typ-Grid), Modul-Picker (14 Module), Eimer-Picker, Löschen-Bestätigung
- **Empty State**: 3 Quick-Create Cards mit Gradient-Text Hero
- **Content Header**: Editierbarer Titel (contenteditable), Meta-Zeile, Einladen/Teilen-Buttons
- **Module Grid**: SVG-Icon-Tiles mit Status-Dot (offen/berechnet), Hover-Gradient, Entfernen
- **Notes Panel** (360px): Amber-Design, Seiten-Tabs, Contenteditable mit Checklist-Toggle, Admin-Hierarchie-Baum
- **Activity Feed**: Farbige Avatars mit Palette
- **Beteiligte**: Aufklappbar mit Chevron-Rotation
- **Toast**: Animierte Pill (2.2s auto-dismiss)
- **Responsive**: Notes unter Content bei ≤1024px, Hamburger-Drawer bei ≤720px

### Design Tokens (abweichend vom Hauptsystem)

Der Workspace verwendet ein eigenes Token-Set aus dem React-Design-Handoff:
- `--gradient: linear-gradient(135deg, #0f172a, #1e3a5f, #0c4a2e)` — Brand-Gradient
- `--r-card: 20px` / `--r-sm: 12px` — Karten- und Control-Radien
- 3 Shadow-Stufen (`--shadow-1/2/3`)
- 21 SVG Icons (Lucide-Style) als `icon(name, size, strokeWidth)` Funktion

### Design-Referenzdateien

Im Repo liegen die React-Designdateien als Referenz (nicht für Produktion):
- `app.jsx` — Handoff-Dokument mit vollständiger Spezifikation
- `content.jsx`, `data.jsx`, `icons.jsx`, `modals.jsx`, `notes.jsx`, `sidebar.jsx`, `styles.css`, `tabs.jsx` — React-Komponenten
- `tweaks-panel.jsx` — Design-Time Tweaks (nur für Prototyp)

---

## PWA & Service-Worker

`manifest.json` + `sw.js` — GEMA ist eine installierbare Progressive Web App. Service-Worker cached die wichtigsten HTML-Module und Assets (`/icon-192.svg`, `/icon-512.svg`, `/manifest.json`) für Offline-Erstaufruf. Beim Update einer Seite muss der Cache invalidiert werden — bei Bedarf SW-Version in `sw.js` hochziehen.

---

## Helper-Module Übersicht (gema_*.js)

| Datei | Zweck |
|-------|-------|
| `gema_anlagenwahl.js` | Anlagenauswahl-Widget für Berechnungen |
| `gema_armaturen_api.js` | Armaturen-Stammdaten |
| `gema_auth.js` | Auth, Rollen, Orgs, Permissions |
| `gema_autosave.js` | Auto-Save in Berechnungsmodulen |
| `gema_coachmarks.js` | Onboarding-Touren |
| `gema_db.js` | Storage-Layer (`_GemaDB`) |
| `gema_feedback.js` | Feedback-Overlay mit Annotation |
| `gema_lu_api.js` | LU-Zusammenstellung Cross-Modul-API |
| `gema_mobile_menu.js` | Hamburger-Menü auf Mobile |
| `gema_notify.js` | Notifikations-Engine |
| `gema_notify_ui.js` | Glocke + Toast-UI |
| `gema_objekte_api.js` | Objekte/Projekte Cross-Modul-API |
| `gema_offer_request.js` | Externe Offertanfragen |
| `gema_offerten_tab.js` | Offerten-Tab in Berechnungsmodulen |
| `gema_pdf.js` | PDF-Export via html2canvas |
| `gema_produktkatalog_api.js` | Produkte + Stammlieferanten + Favoriten |
| `gema_push.js` | Web-Push-Vorbereitung (Service-Worker) |
| `gema_qr_scanner.js` | QR-Code-Scanner |
| `gema_recent.js` | Tracking + Anzeige zuletzt genutzter Module |
| `gema_responsive.css` | Globale Responsive-/Layout-Regeln (Mobile + Tablet) |
| `gema_scroll.js` | Scroll-Helper |
| `gema_undo.js` | Undo/Redo |
| `gema_varianten.js` | Varianten-Vergleich (Berechnungen) |
| `gema_vergleich.js` | Produkt-/Offert-Vergleich |
| `gema_wasserdaten.js` | Wasserhärte/Trinkwasserdaten |

---

## Konvention: CLAUDE.md aktuell halten

**Bei jedem grösseren Feature oder Architektur-Entscheid: CLAUDE.md aktualisieren.** Diese Datei ist die Wissensbasis, mit der jede neue Claude-Code-Session startet — wenn sie veraltet ist, „vergisst" die nächste Session, was schon da ist und wie es aufgebaut ist.

Was gehört rein:
- **Neue Module**: kurze Beschreibung, Storage-Key, wichtigste Funktionen
- **Neue Rollen**: in der Rollen-Tabelle ergänzen
- **Neue Dateien-Präfixe**: in der Präfix-Tabelle ergänzen
- **Neue Datenflüsse / Cross-Modul-APIs**: im Diagramm erweitern
- **Neue Code-Patterns**: im Abschnitt „Code-Patterns" festhalten
- **Neue Helpers** (`gema_*.js`): in der Helper-Tabelle ergänzen
- **Neue Event-Keys** (GemaNotify): in der Event-Key-Tabelle ergänzen
- **Neue Konventionen / Fehlerquellen**: am Ende der jeweiligen Liste

Was **nicht** rein muss:
- Kleine Bugfixes, Style-Tweaks, Copy-Korrekturen
- Interne Variable-Renames ohne Auswirkung auf andere Module
- Konkrete Ticket-Nummern oder Personennamen

**Faustregel**: Wenn ein Mitarbeiter (oder Claude in einer neuen Session) das Feature nur durch Lesen der CLAUDE.md verstehen können soll, dann muss es rein. Wenn nur der Code reicht, dann nicht.

---

## Beim Erstellen von Dokumenten und Dateien

- **Immer echte Umlaute** (ä, ö, ü) in Texten, Titeln, Beschreibungen verwenden
- Nur Dateinamen verwenden ae/oe/ue (siehe oben)

---

## Batch-Änderungen Checkliste

Wenn Änderungen über mehrere Module ausgerollt werden:

1. ☐ DM Sans (kein DM Mono)?
2. ☐ max-width: 1100px auf .g-page?
3. ☐ Keine "← Alle Module"-Links?
4. ☐ Inputs: `type="text" inputmode="decimal"` mit `fixLeadingZero`?
5. ☐ Placeholder-Farbe `#cbd5e1`?
6. ☐ Alle GemaDB-Aufrufe mit `typeof _GemaDB`-Guard?
7. ☐ IIFE-Syntax korrekt (keine doppelten Klammern)?
8. ☐ In-Memory-Fallback (`_memStore`) vorhanden?
9. ☐ Keine orphaned `</div>`-Tags?
10. ☐ Navigation: .g-nav-* Klassen, full-width, height 52px?
11. ☐ Logo: vollständiges SVG mit height="28"?
12. ☐ Feedback-Button auf allen Seiten?
13. ☐ Bei rollenabhängigen UIs: Permission-Check via Helper-Funktion (z.B. `_wzCanEdit()`), nicht direkt `u.roleIds.indexOf(...)` in der Render-Funktion?
14. ☐ Bei neuen Notifikationen: Event-Key in `gema_notify.js` registriert?
15. ☐ Bei neuen Modulen / Rollen / Helpers: CLAUDE.md aktualisiert?