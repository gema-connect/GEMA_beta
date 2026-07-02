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

| Medium | LU-Medium-ID | Leitungsnetz | Zielmodule |
|--------|--------------|-------------|------------|
| **Trinkwasser (kalt)** | `kw` (Alias `trinkwasser`) | Trinkwassernetz | Druckerhöhung (l/s) |
| **Enthärtetes Wasser** | `bw` (Alias `enthaertet`) | Trinkwassernetz | Enthärtungsanlage (l/s + Härtegrade) — Apparate die NUR enthärtetes Wasser brauchen |
| **Enthärtetes Wasser für Osmose** | `ow` (Alias `osmose`) | Trinkwassernetz | Osmoseberechnung (l/s) → Enthärtungsanlage (Permeat + Konzentrat) |
| **Regenwasser** | `gw` (Alias `regenwasser`) | Separates Leitungsnetz | Eigene Pumpe/Druckerhöhung (l/s) |

**Fachliche Regel (Doppelzählungs-Schutz):** Osmosewasser wird IMMER vorenthärtet — der `ow`-Volumenstrom ist automatisch auch Enthärtungs-Volumenstrom, fliesst aber **nur über das Osmose-Ergebnis** (Permeat + Konzentrat via `GemaOsmose.getResults`) in die Enthärtungsanlage, nie direkt. `bw` und `ow` sind getrennte LU-Medien: `GemaLU.getByMedium(objektId,'enthaertet')` liefert nur bw-Verbraucher, `getByMedium(objektId,'osmose')` nur ow-Verbraucher. Früher zeigten beide Aliase auf dasselbe Medium → derselbe Bedarf zählte in der Enthärtung doppelt.

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
- **Admin-Zugriff**: GEMA-Admin kann alle Lieferanten-Daten einsehen und Lieferanten deaktivieren (z.B. bei Zahlungsverzug). Deaktivierter Lieferant (`status:'inaktiv'`): alle Schreib-Aktionen im Dashboard sind blockiert (`_liefBlockedInaktiv()`), nicht nur ein Banner — inkl. Mitarbeiter-Einladung, Rollen-Zuweisung und Mitarbeiter-Deaktivierung (Invite-Button wird ausgeblendet).
- **Offertanfragen**: Lieferant sieht eingehende Anfragen aus Berechnungen der Planer
- **User↔Lieferant-Verknüpfung**: `user.lieferantId` verknüpft den eingeloggten Auth-User eindeutig mit dem GemaProdukte-Lieferant-Datensatz. `findMyLieferant()` bevorzugt dieses Feld; die alte Heuristik (E-Mail/Org/Firma) bleibt nur Fallback und **self-healt** (schreibt `lieferantId` beim ersten Treffer via `GemaAuth.linkUserToLieferant`). `GemaAuth.inviteLieferant(opts)` akzeptiert `opts.lieferantId` und setzt das Feld direkt beim Anlegen (Aufrufer: `_liefInviteUser` im Dashboard, `GemaOfferRequest._submit`). Mitarbeiter-Einladung (`_liefInviteUser`) startet mit `role_lieferant_intern` (Least Privilege — Admin weist Unterrolle zu). Firmenprofil-Edit nur für `_liefIsAdmin()`; Mitarbeiter-Verwaltung nur für Org-Admin **derselben** Lieferanten-Org.
- **Kategorie-IDs (KRITISCH)**: `LIEF_KATEGORIEN` (Firmenprofil-Kategorien) und `KATEGORIEN` (Produkt-Schemas/Matching) nutzen DIESELBEN IDs — `hebeanlage` und `thermische_solaranlage` (nicht mehr `abwasserhebeanlage`/`solaranlage`). Für Altdaten gibt es `GemaProdukte.normKatId(id)` (Alias-Map), genutzt in `getLieferantenByKategorie` und im Kategorien-Filter von `gema_offer_request.js`.

### Verifizierung

1. GEMA erfasst Anlagen vor (Basisdaten)
2. Lieferant loggt sich ein, prüft/ergänzt seine Anlagendaten
3. Lieferant bestätigt die Korrektheit der Daten
4. Anlage erhält den **"Verifiziert"-Badge** ✓
5. Nicht-verifizierte Anlagen werden als "Nicht verifiziert" markiert

### Offertanfrage-Workflow (End-to-End)

1. **Planer** sendet aus einem Berechnungsmodul (Enthärtung, Osmose, Druckerhöhung …) eine Offertanfrage. **KRITISCH — Payload-Regel**: `berechnungswerte` enthält IMMER die **berechneten Projektwerte** (z.B. `_enthaertungBerechnungswerte()` / `_osmoseBerechnungswerte()`), NIE die Datenblatt-Werte der gewählten Anlage — die gewählte Anlage geht separat via `produktId`/`produktName` mit. (Früherer Bug: `d.nenndurchfluss` etc. aus dem Produkt wurde als «Berechnung» mitgeschickt.)
2. `GemaProdukte.createOffertanfrage()` **reichert `projekt` aus dem GEMA-Objekt an** (Name, `nummer`, `adresse` aus `strasse/plz/ort`) — der Lieferant hat keinen Zugriff auf fremde Org-Objekte, alles Nötige muss im OA-Record stehen. Danach speichern (per-Record `oa:`) und **Lieferant benachrichtigen** (`offertanfrage_neu`): bevorzugt alle User mit passender `user.lieferantId`, Fallback Lieferanten-Org (nie `org_default`).
3. **Lieferant** prüft die Anfrage im Dashboard: Anfragen-Karte und Beantworten-Modal zeigen **Projekt (mit Adresse), berechneten Bedarf (`_oaBwRowsHtml`, Label-Map `_OA_BW_LABELS`) und die vom Planer gewählte Anlage inkl. Kennwerten** (`_oaAnlageSpecsHtml` — löst `produktId` im eigenen Katalog auf, zeigt Allgemein-+Leistungsdaten-Felder) nebeneinander zur **Gegenprüfung**. Die angefragte Anlage ist im Antwort-Dropdown vorausgewählt. Die Offerte erstellt der Lieferant extern (ERP/SAP) und hängt sie an: Preis, Nachricht, optional **Offerte als PDF**. Das PDF wird via `GemaStorage.uploadDataUrl` in den Bucket `gema-fotos` (Pfad `offerten/<lieferantId>`) ausgelagert → `antwort.pdfUrl`; Base64-Fallback (`antwort.pdfDataUrl`) nur bei Upload-Fehler und ≤ 2.5 MB. Max. 10 MB.
4. `beantworteOffertanfrage()` **benachrichtigt den Planer** (`offertanfrage_beantwortet`, Link `pm_objekte.html?tab=offerten&objekt=…`) und legt die Vormerkung fürs Objekt an. Ablehnung analog (`offertanfrage_abgelehnt`).
5. **Postfach des Planers**: der «📨 Offerten»-Tab im Berechnungsmodul (`gema_offerten_tab.js`, objektbezogen, PDF klickbar) UND der zentrale **Offerten-Tab in `pm_objekte.html`** (alle Anfragen der Org über alle Berechnungen, Filter pro Objekt, Deep-Link `?tab=offerten[&objekt=ID]`, Direktlink zurück ins Berechnungsmodul).

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
| **Spengler** | Dachinspektion + PM + Werkzeug | Erstellt Dachberichte (sp_dachbericht), Zugang zu Objekten + Werkzeug-Read |
| **Abteilungsleiter** | Berechnungen + PM + Werkzeuge | Prüft Berechnungen, sieht alle Projekte der Abteilung, Werkzeug-Leserechte |
| **Unternehmer** | Ausschreibungen + Offerten | CRBX-Preise ausfüllen (langfristig in GEMA, kurzfristig Datei-Upload), Offertvergleich einsehen |
| **Bauherrschaft** | Projektübersicht + Kosten | Projektstatus, Kostenkontrolle, Terminplan, Freigaben (Read-only) |
| **Architekt** | Projektübersicht + Koordination | Terminplanung, Sitzungsprotokolle, Dokumentation |
| **Behörde** | Bewilligungen + Hygiene | W12-Prüfungen, Bewilligungsstatus, Inspektion (Read-only) |
| **Lieferant** | Eigenes Dashboard | Vollzugang Lieferant (Legacy/Org-Admin-Level): Produktpflege, Verifizierung, Offertanfragen, Werkzeug-Prüfungen quittieren |
| **Lieferant · Admin** (`role_lieferant_admin`) | Eigenes Dashboard | Wie Lieferant + vergibt die Unterrollen an Team (Mitarbeiter-Tab) |
| **Lieferant · Produktpflege** (`role_lieferant_produkte`) | Eigenes Dashboard | NUR Produktdaten erfassen/bearbeiten (kein Verifizieren, keine Offerten) |
| **Lieferant · Verifizierung** (`role_lieferant_verify`) | Eigenes Dashboard | NUR Produkte verifizieren (Qualitätskontrolle) |
| **Lieferant · Offerten** (`role_lieferant_offerten`) | Eigenes Dashboard | NUR Offertanfragen beantworten/ablehnen |
| **Lieferant · Intern** (`role_lieferant_intern`) | Eigenes Dashboard | Nur Lesen (Betrachter) |
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
| `sp_` | Spenglerei | `sp_dachbericht.html` |
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
- **Garagist-Modul**: `sys_garagist_dashboard.html` mit 4 Tabs (Übersicht, Anstehend, Service-Historie, Werkstatt-Profil). Login-Redirect für `role_garagist`. Werkstatt-Team-Sicht (`garagistUserId` ∈ Garagisten derselben Org), Quick-Actions: `?service=ID` (Service-Modal in `if_fahrzeug.html`), «✏ km» (km-Update), «🏭 Einbuchen / ✓ Ausbuchen» (Garage-Status, mit Reparatur-Doku bei offenen Defekten). Daten per-Record via GemaSync, Aktionen geloggt + notifiziert.

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

### Dialoge (KRITISCH — kein nativer Browser-Dialog mehr)

**Vorgabe**: Für alle neuen Stellen die `GemaDialog`-API statt der nativen Browser-Dialoge nutzen.

```javascript
// ✗ Nicht mehr nutzen:
if (confirm('Wirklich löschen?')) { ... }
alert('Fehler');
var x = prompt('Wert:');

// ✓ Stattdessen:
GemaDialog.confirm({
  title: 'Löschen',
  message: 'Datensatz wirklich löschen?',
  confirmLabel: 'Löschen',
  danger: true
}).then(function(ok){
  if(!ok) return;
  // ...
});

GemaDialog.alert({ title: 'Fehler', message: 'Datei zu gross.' });

GemaDialog.prompt({
  title: 'Wert eingeben',
  placeholder: 'z.B. 85',
  defaultValue: ''
}).then(function(val){
  if(val === null) return;  // User hat abgebrochen
  // ...
});
```

`window.alert` ist global überschrieben — bestehende `alert(...)`-Aufrufe zeigen automatisch den GEMA-Dialog. `window.confirm` und `window.prompt` bleiben nativ (sync-Pattern), neue Stellen sollen aber GemaDialog nutzen.

**Bei Lösch-Dialogen IMMER `danger:true`** — der Confirm-Button wird dann rot, was Konsistenz herstellt.

`gema_dialog.js` muss auf der Seite eingebunden sein (siehe Helper-Tabelle).

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
- `GemaObjekte.ready` – Promise, resolved nach dem ersten Cloud-Pull (per-Record)
- `GemaObjekte.reload()` – erneut frisch aus der Cloud laden (per-Record)
- `GemaObjekte.persistBlob(blob)` – vollen Stand speichern (mit Löschungen; nur pm_objekte als autoritativer Editor)
- `GemaObjekte.upsertObjekt(obj)` – ADD-ONLY ein Objekt hinzufügen/aktualisieren (Quick-Add; kein Delete-Risiko)
- Storage: per-Record in der Cloud (`objekt:`/`bet:`), lokaler Blob `gema_objekte_v1` bleibt als Lese-Cache; `activeObjektId` nur lokal (`gema_active_objekt_v1`). Siehe „Migrierte Module".

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

**Offerten-Tab (pm_objekte.html):** vierter Tab «📨 Offerten» — zentrales Postfach für alle Offertanfragen/Lieferanten-Offerten der Org (Quelle: `GemaProdukte.getOffertanfragen()`, sichtbar wenn `projekt.objektId` zu einem Org-Objekt gehört oder man selbst Absender ist). Tabelle mit Status, Brutto-Preis, klickbarem Offerten-PDF und Direktlink ins Berechnungsmodul (`OA_KAT_MAP`). Deep-Link `pm_objekte.html?tab=offerten[&objekt=ID]` — wird von den `offertanfrage_beantwortet`-Notifikationen verwendet. `gema_produktkatalog_api.js` ist dafür in pm_objekte.html eingebunden.

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

### DM-Sans „l" wird zu dick im PDF-Export (Optical-Sizing)

**Symptom**: Im HTML/Print-PDF (Schaden-/Dachbericht) erscheint das kleine „l" (und ähnliche dünne Glyphen) **fetter/dicker** als der Rest — v.a. in Listen/Fliesstext.

**Ursache**: `gema_schaden_pdf.js` / `gema_dachbericht_pdf.js` setzten im Body `font-optical-sizing:none`. Das zwingt die **DM-Sans-Variable-Font** auf ihre Default-Optical-Size (kräftigere Striche, für Display gedacht) → bei kleinem Fliesstext (10.5pt) wirken die Striche zu schwer.

**Fix**: `font-optical-sizing:auto;font-variation-settings:"opsz" 14;` im Body-CSS (statt `none`). `opsz 14` = Text-Optische-Grösse → saubere, gleichmässige Striche. **In BEIDEN PDF-Helfern gleich halten** (Schaden + Dach), da das Problem in beiden auftritt.

### Orphaned </div>-Tags

Bei Batch-Migrationen können verwaiste `</div>`-Tags entstehen (z.B. wenn `g-ph`-Elemente entfernt werden). Diese verursachen, dass Content ausserhalb des `.g-page`-Containers rendert und die max-width-Begrenzung verliert.

**Prüfung**: Sicherstellen, dass jedes öffnende `<div>` ein schliessendes `</div>` hat und umgekehrt.

### "← Alle Module"-Links

Diese Nav-Links wurden entfernt. Nicht wieder einfügen.

### Hero-Layout in Modulen: `<div class="hero-title">` statt `<h1>`/`<p>`

`gema_responsive.css` setzt im `@media(max-width:640px)` Block grosszuegige Hero-Padding-Werte (`28-40px`) und grosse Schriftgroessen (`.hero h1 { font-size: clamp(22px, 7vw, 30px) }`) — gedacht fuer den prominenten Hero auf `index.html`. Modul-Seiten brauchen einen **kompakten** Hero (14px padding, 17px Titel).

**Wenn ein Modul `<h1>` und `<p>` im Hero verwendet**, schlagen die `gema_responsive.css`-Regeln durch — der Modul-Hero wird ungewollt gross. Auch `!important` im inline-style hilft nur teilweise, weil Browser-default `margin-block: 0.67em` auf `<h1>` und `1em` auf `<p>` zusaetzlich die Box aufpolstern.

**Korrektes Modul-Hero-Markup** (Pattern aus `if_werkzeug.html`):

```html
<div class="hero">
  <div class="hero-in">
    <div class="hero-left">
      <div class="hero-ic">🔧</div>
      <div>
        <div class="hero-title">Modul-Titel</div>
        <div class="hero-sub">Untertitel · Beschreibung</div>
      </div>
    </div>
    <div class="hero-pills"><!-- optional --></div>
  </div>
</div>
```

Klassen: `.hero-in` (Wrapper), `.hero-left` (Icon + Text), `.hero-ic` (Icon), `.hero-title` (Titel), `.hero-sub` (Untertitel). Damit greifen die `<h1>`/`<p>`-Regeln aus `gema_responsive.css` nicht.

**`gema_responsive.css` schraenkt sich seit v47 selbst ein** auf `.hero:has(> .hero-inner)` (= nur Homepage). Bei aelteren Browsern ohne `:has()`-Support wird die Regel komplett ignoriert — ebenfalls Modul-sicher.

### `<link rel="stylesheet">` laedt NACH `<style>` — Cascade beachten

In den GEMA-HTML-Dateien wird `gema_responsive.css` typischerweise direkt nach dem inline `<style>`-Block eingebunden:

```html
<style>
  /* module-spezifische Regeln */
  @media (max-width: 640px) {
    .hero { padding: 14px 16px; }
  }
</style>
<link rel="stylesheet" href="gema_responsive.css"/>
```

Bei **gleicher Spezifitaet** gewinnt im Cascade die **spaeter geladene** Regel — d.h. `gema_responsive.css` ueberschreibt inline-styles. Wer also lokal Hero/Nav-Werte setzen will, muss entweder `!important` verwenden ODER (besser) eine spezifischere Selektor-Kombination wahlen ODER (am besten) das HTML-Markup so anpassen, dass die globalen Regeln gar nicht erst greifen (siehe Hero-Markup oben).

### Berechnungsmodule haengen weiss beim Laden (BEHOBEN durch Entfernung des Block-Patterns)

**Frueher**: `gema_auth.js` injizierte beim Init ein `<style id="_gaBlock">body{visibility:hidden!important}</style>`, damit der Modul-Inhalt waehrend des Permission-Checks nicht aufblitzt. Am Ende der Auth-Logik rief `_unblock()` das Style-Element wieder weg.

**Bug**: Wenn IRGENDEIN Code-Pfad `_unblock()` uebersprungen hat (JS-Exception, async-Race-Condition, Edge-Case beim Login-Redirect, blockierender Promise, async Cloud-Bootstrap), blieb der `body` permanent unsichtbar — **weisser Bildschirm in ALLEN Modulen**, vor allem in Berechnungsmodulen (sb_*, sa_*).

**Versuchter Schutz (zu schwach)**: try/catch um Init-Block + `setTimeout(_unblock, 4000)` Safety-Net. Hat den Bug nicht zuverlaessig behoben — entweder griff der Timeout auf bestimmten Geraeten nicht, oder der User wartete ohnehin nicht 4 Sekunden auf das Auto-Unblock.

**Endgueltige Loesung**: Das gesamte `<style id="_gaBlock">`-Pattern wurde **komplett entfernt**. Beim Login-Redirect oder Access-Denied blitzt fuer ~30ms der Modul-Inhalt auf, bevor `_redirectLogin` bzw. der "Kein Zugriff"-Screen rendert — das ist akzeptabel. Ein kurzer FOUC ist allemal besser als ein permanenter weisser Bildschirm.

**`_unblock()` ist noch im Code** als No-Op (entfernt das `_gaBlock`-Element falls vorhanden) — Backward-Compat fuer extern injiziertes Blocking, im Standardfall passiert dort nichts mehr.

**Nicht wieder einbauen!** Wenn man Anti-FOUC braucht, lieber ein **leichtes Overlay** mit Loader-Spinner einblenden, das durch einen kurzen Timer (max. 500ms) wieder weg ist — kein body-Level visibility:hidden.

### Doppelte CSS-Regelbloecke aus alten Media-Queries

Wenn ein Media-Query entfernt wurde, blieben in einigen Modulen die innerhalb der `@media`-Klammer eingerueckten Regeln stehen — also als globale Regeln. Diese kollidieren dann mit den gleichen Regeln weiter oben im Stylesheet (gleiche Spezifitaet, spaetere gewinnt, Werte oft abweichend).

**Beispiel-Symptom**: Header-Hoehe wird auf 72px gesetzt (Z. 38), funktioniert aber nicht — weil weiter unten (Z. 414) noch ein zweiter Block `.g-nav-inner{height:52px}` aus einem ehemaligen Media-Query steht.

**Pruefung**: `grep -n 'g-nav-inner\|hero-mark\|kritische-klasse' if_modul.html` — wenn die Klasse mehrfach auftaucht, beide Stellen auf konsistente Werte pruefen.

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
| `internKennung` | Eigene betriebsinterne Bezeichnung/Nummerierung (optional, z.B. «WZ-014»). Badge (Karte/Tabelle/Detail), QR-Info, Volltextsuche, Etiketten-Beschriftung |
| `supplier`, `supplierId` | Lieferant/Grosshändler (Freitext + verknüpfte Lieferant-ID aus GemaAuth) |
| `kaufbeleg:{rechnungsNr,betrag,bestellNr,lieferdatum,datei:{name,type,dataUrl}}` | Kaufbeleg mit optionalem Datei-Upload (Base64, max 2 MB) |
| `hasService`/`serviceInterval`/`lastService` | Wartungsintervall (Monate) + letzter Service |
| `hasElec`/`elecInterval`/`lastElec`/`elecHistory[]` | Elektroprüfung NIV |
| `hasLeiter`/`leiterInterval`/`lastLeiter`/`leiterHistory[]` | Leiterprüfung EKAS (nur Kategorie `leiter`) |
| `zugewiesenAn:{userId,name,seit}` | Aktuell zugewiesene Person (Magaziner setzt das) |
| `berichte:[{id,typ,datum,autorUserId,autorName,titel,beschreibung,...}]` | Defekt- und Prüfberichte als Historie |
| `pruefAnfrage:{lieferantId,lieferantFirma,typ,wunschtermin,bemerkung,angefordertAm,angefordertVon,status}` | Aktive Prüfungs-Anfrage an einen Lieferanten (`typ`: servicepruefung/elektropruefung/leiterpruefung) |
| `ersatzAnfragen:[{id,lieferantId,lieferantFirma,typ,nachricht,status,erstelltAm,antwort?,...}]` | Ersatz-/Nachfolger-Anfragen an Lieferanten; `antwort` = Offerte des Lieferanten (preis, nachricht, pdfUrl/pdfDataUrl) |
| `reparatur:{offen,lieferantId,lieferantFirma,defektBerichtId,termin,bemerkung,gestartetAm,abgeschlossenAm?}` | Vom Lieferanten eröffnete Reparatur (koppelt `lifecycleStatus:'in_reparatur'`) |

### Koffer (Werkzeug-Sets, if_werkzeug.html)

Ein **Koffer** bündelt mehrere Werkzeuge (z.B. Bohrhammer + Akku + Ladegerät) und ist ein **normaler Tool-Datensatz** mit Kategorie `koffer` (`_wzIsKoffer(t)` = `cat==='koffer' || istKoffer===true`) und geordneter Inhaltsliste `kofferInhalt:[toolId,…]`. Dadurch erbt er QR-Code (`?scan=<id>` für den Kofferdeckel), Etikette, Suche und Ausleihe-Historie vom bestehenden System.

- **Erstellen**: «🧰 Koffer»-Toolbar-Button (nur Magaziner/Admin) → `openNeuerKoffer()` → kompakter Dialog → öffnet direkt den Inhalt-Editor.
- **Inhalt/Reihenfolge** (`openKofferInhalt`): Teile hinzufügen per Suche ODER per **📷 QR-Sammelscan / 📡 NFC-Sammelscan** (`_wzKofferScanQR` — Scan-Schleife, Scanner öffnet nach jedem Treffer erneut, beenden via Abbrechen; `_wzKofferScanNFC` — kontinuierlicher NDEFReader-Loop, Android Chrome; Validierung + nicht-blockierendes Feedback-Pill in `_wzKofferAddFromScan`). Ein Werkzeug kann nur in EINEM Koffer sein (`_wzKofferOf`); entfernen, ↑↓-Reihenfolge. Berechtigung `_wzCanEditKoffer(k)`: Magaziner/Admin ODER der **zugeteilte Monteur** (`zugewiesenAn.userId === me`, typ user) — einzige Ausnahme vom Monteur-Editier-Verbot, nur für SEINE Koffer. **Hinweis**: `gema_qr_scanner.js` exportiert `GemaQR` (Overlay z-index 12000, damit der Scanner ÜBER `_wzShowModal` liegt) — der frühere Aufruf `GemaQRScanner` in der Sammel-Ausleihe war ein toter Verweis (behoben).
- **Ausleihen** (`_wzKofferAusleihe`, Hook in `_wzOpenAusleihe`/`_wzLendToSelf`): Checkliste mit allen Standard-Teilen **vorausgewählt**; bereits einzeln ausgeliehene Teile sind abgewählt+gesperrt («bereits ausgeliehen an X»). Alle angehakten Teile werden mit `ausgeliehenAn={…, viaKoffer:<kofferId>}` an dieselbe Person ausgeliehen. Einzel-Ausleihe von Koffer-Teilen bleibt möglich.
- **Rückgabe** (`_wzKofferRueckgabe`, Hook in `_wzReturnTool`): Vollständigkeitskontrolle — alle via Koffer ausgeliehenen Teile vorausgewählt; **abgewählte (fehlende) Teile bleiben einzeln ausgeliehen** (`viaKoffer` wird entfernt) und der Magaziner bekommt `werkzeug_koffer_fehlteil` (Notify, role+org).
- `deleteTool` räumt gelöschte IDs aus allen `kofferInhalt`-Listen. Karten zeigen «🧰 N Teile + Inhalt-Button» (Koffer) bzw. «🧰 Im Koffer <Name>» (Teil).

### QR-Code & Etiketten (if_werkzeug.html)

Werkzeug hat **dasselbe Etiketten-System wie das Trocknungs-Modul** (siehe Abschnitt «Etiketten-System (komplett)» unter Trocknungsgeräte für die vollständige Logik) — portiert mit `_wz`-Prefix:
- QR-Dialog mit Umschalter **«QR-Code | Etikette»** (`setQrMode`); `_wzCurrentQRTool` wird in `openQR` gesetzt. QR-URL = `?scan=<id>`.
- Etikette **49×23mm Querformat**, festes Layout (QR rechts über volle Höhe, links Logo oben + interne Bezeichnung darunter). Beschriftung = `internKennung || name`. Logo = `org.logo` (via `GemaAuth.getCurrentOrg()`), sonst GEMA-Fallback, für jsPDF zu PNG gerastert. Helper analog Trocknung: `_wzComputeEtikette`, `_wzDrawEtikette`, `_wzEnsureLabelLogo`, `_wzBuildEtikettePreview`, `_wzFitText`, `_wzGetQrDataUrl`/`_wzRenderQrDataUrl`, jsPDF via `_wzEnsureJsPDF`.
- **Einzel-Export**: `downloadEtikettePDF()` → `Etikette_<slug>.pdf`.
- **Sammelexport (Mehrfachauswahl)**: integriert in den **bestehenden** Bulk-Modus (`_wzToggleBulkMode`, `_wzBulkSelected`). Die Bulk-Leiste (`_wzRenderBulkBar`) hat für **Magaziner/Admin** (`_wzCanBulkLabel()`) zusätzlich **«☑ Alle markieren»** (`_wzBulkSelectAllVisible` — alle aktuell gefilterten via `_wzLastFilteredIds`, toggelt zu «☐ Auswahl aufheben») und **«🏷 Etiketten»** (`_wzExportEtikettenBulk` → ein PDF mit je einer 49×23mm-Seite pro markiertem Werkzeug, `Etiketten_<N>_Stueck.pdf`). Status/Person-zuweisen bleiben wie gehabt für alle Editoren. Manuelle Checkbox-Auswahl pro Werkzeug ist Karten-Ansicht; «Alle markieren» + Export funktionieren filterbasiert auch in der Tabellenansicht.

### Berechtigungs-Helper (if_werkzeug.html)

Zentrale Funktionen, die alle UI-Buttons und Aktionen abfragen:

```javascript
_wzCanEdit()         // Admin oder Magaziner: erfassen, ändern, löschen
_wzCanAssign()       // wie _wzCanEdit: Personen zuweisen
_wzCanReportDefect() // alle eingeloggten User: Defekt melden
_wzCanLendSelf()     // Admin/Magaziner/Monteur: selbst ausleihen
_wzCanReturnTool(t)  // siehe Regeln unten
```

**Monteur ist HARD-LOCKED**: Selbst wenn ein Admin in `sys_admin.html` der Monteur-Rolle `write` oder `admin` aktiviert, gibt `_wzCanEdit()` für Monteur **immer false** zurück — Edit-Rechte gibt's nur über Admin- oder Magaziner-Rolle.

**Was der Monteur in if_werkzeug.html darf**:
- Eigene Werkzeuge sehen (`t.zugewiesenAn.userId === me` ODER `t.ausgeliehenAn.userId === me`)
- Fremde Werkzeuge scannen (QR/NFC) → Scan-Detail-Ansicht mit Aktionen
- Werkzeug **auf sich selbst** ausleihen (`_wzLendToSelf`) — ohne Personen-Picker, ein Klick
- Defekt melden (alle Werkzeuge — eigene und fremde)
- Werkzeug zurückgeben (siehe Regeln)

### Zuweisungs-Typen (`zugewiesenAn`)

Neu eingeführt: `zugewiesenAn.typ`. Zwei Varianten im Zuweisungs-Modal (Tabs):

```javascript
// User-Zuweisung (Hauptnutzer, verantwortlich):
{ typ:'user', userId, name, seit }

// Platz-Zuweisung (z.B. „Lager Halle B"):
{ typ:'platz', platz:'Lager Halle B', name:'Lager Halle B', seit }
```

Bei `typ:'user'` muss der **Hauptnutzer** die Rückgabe persönlich machen. Bei `typ:'platz'` kann **jeder Monteur** das Werkzeug selbstständig ausleihen und zurückbringen. Legacy-Daten ohne `typ` werden als `user` interpretiert (Backward-Compat).

### Rückgabe-Regeln (`_wzCanReturnTool`)

```
- Admin/Magaziner:        immer
- Selbst ausgeliehen:     ja, ausser org.settings.werkzeug.requireMagazinerReturn=true
- Eigene User-Zuweisung:  ja, ausser requireMagazinerReturn=true
- Platz-Zuweisung:        ja wenn aktuell selbst ausgeliehen, ausser requireMagazinerReturn=true
- requireMagazinerReturn: setzt alles auf „nur Magaziner darf"
```

### Org-Setting `requireMagazinerReturn`

In `org.settings.werkzeug.requireMagazinerReturn` (bool). UI: Werkzeug-Toolbar → „⚙️ Einstellungen" (nur Admin/Magaziner sichtbar). Wenn aktiv: Monteur kann Werkzeuge nicht selbstständig zurückgeben — Magaziner muss physisch entgegennehmen und im System bestätigen.

### Berichts-System

`t.berichte[]` enthält drei Bericht-Typen, zusammen in einer Liste:

- **`typ:'defekt'`**: Defektmeldung mit `titel`, `beschreibung`, `schweregrad` (`leicht`/`mittel`/`schwer`/`ausser_betrieb`), `erledigt`, `erledigtAm`. Erfassung via `openDefektMelden(toolId)`. Magaziner markiert Defekte als erledigt via `_wzDefektErledigt`. Optional `lieferantAntwort` = Offerte des Lieferanten (siehe «Lieferanten-Reaktion»).
- **`typ:'reparatur'`**: Vom Lieferanten via Dashboard erzeugte Einträge «Reparatur eröffnet» / «Reparatur abgeschlossen» (`vonLieferant:true`).
- **`typ:'pruefbericht'`**: Prüfbericht mit `ergebnis`, `fehlendeTeile[]`, `naechstePruefung`. Erfassung via `openPruefbericht(toolId)`. Synchronisiert gleichzeitig `lastService`/`lastElec`/`lastLeiter`, damit `worstDays()` weiterläuft.

Die komplette Historie ist via `openBerichte(toolId)` einsehbar (alle Rollen). Defekt-Banner auf der Karte: solange ein Defekt nicht erledigt ist, erscheint „⚠ Defekt offen".

### Personen-Zuweisung

`openZuweisung(toolId)` (nur Magaziner/Admin) zeigt einen Dropdown aller Monteur-, Unternehmer- und Magaziner-User der **eigenen Organisation** (gefiltert via `orgId`). Nach Auswahl wird `t.zugewiesenAn` gesetzt und eine Notifikation an den zugewiesenen User gepusht (`werkzeug_zuweisung`).

### Lieferanten-Prüfungs-Workflow (Phase 3)

Drei-stufiger Workflow zwischen Magaziner und externem Prüf-Lieferanten:

1. **Anfordern** — `openPruefAnfordern(toolId)` (nur Magaziner/Admin). Dropdown der `role_lieferant`/`role_pruefer`-User, **gefiltert nach Prüf-Kategorie** (`lieferantKategorien`: `elektropruefung` für Elektro-Geräte, `leiterpruefung` für Leitern, sonst `servicepruefung`) — Elektriker sehen nur Elektro-Aufträge etc. Speichert `t.pruefAnfrage = {…, typ:'<pruefKat>', status:'angefordert'}` (das Feld `typ` sagt dem Lieferanten-Dashboard, WELCHE Prüfung verlangt ist; Altdaten ohne `typ` werden per Heuristik abgeleitet) und pusht `werkzeug_pruefung_anfrage` an den Lieferanten mit Link `if_werkzeug.html?pruef_lief=TOOL_ID`.
2. **Quittieren** — `_wzPruefLiefQuittieren(toolId)` in if_werkzeug ODER `_dwzQuittieren` im Lieferanten-Dashboard. Status → `quittiert`, Notifikation zurück an den Magaziner.
3. **Bericht einreichen** — `_wzPruefLiefBerichtEinreichen(toolId)` ODER `_dwzSubmitPruefbericht` im Dashboard. Erzeugt einen `typ:'pruefbericht'`-Eintrag in `t.berichte[]` mit `vonLieferant:true`, aktualisiert `lastService`/`lastElec`/`lastLeiter`, setzt Status auf `erledigt` und benachrichtigt den Magaziner mit `typ:'erfolg'` (bei Bestanden) oder `typ:'warnung'` (bei Mängeln).

Status-Banner auf der Karte: 🟠 Angefordert → 🔵 Quittiert → 🟢 Erledigt.

**Cross-Org-Zugriff (KRITISCH)**: `load()` filtert auf die eigene Org, lädt aber für User mit `role_lieferant*`/`role_pruefer` zusätzlich die Fremd-Org-Werkzeuge, an denen sie beauftragt sind (`_wzIsBeauftragt`: `pruefAnfrage.lieferantId`, `supplierId` oder `ersatzAnfragen[].lieferantId` ∈ `_wzMyLiefUserIds()`) — analog Garagist im Fahrzeugmodul. `save()` schliesst diese Fremd-Tools per ID aus dem `others`-Erhalt aus (sonst Duplikate). `_wzMyLiefUserIds()` = eigene User-ID + alle User desselben `user.lieferantId` (Team-Sichtbarkeit). Ohne diesen Pfad liefen die Deep-Links (`?pruef_lief=…`) für externe Partner ins Leere.

### Lieferanten-Reaktion: Offerte & Reparatur (Dashboard als Arbeitsplatz)

Der **Werkzeuge-Tab in `sys_lieferant_dashboard.html`** ist der Arbeitsvorrat des externen Lieferanten/Prüfers (Deep-Link `?tab=werkzeuge` aus den Notifikationen). Datenquelle: voller Multi-Tenant-Pool via `GemaSync.bindCollection('werkzeugmanagement','gema_werkzeug','tool:','id')` beim Init (cross-org!); Einzel-Saves via `GemaSync.saveRecord` (`_dwzSaveTool` — bewusst KEIN persistCollection, damit ein unvollständiger Cache nie fremde Records löscht). Matching überall team-tolerant via `_dwzMyIds()`.

Sektionen: **📋 Prüfaufträge** (Prüftyp, Auftraggeber-Org, Wunschtermin; Aktionen Quittieren + Prüfbericht-Modal), **🔧 Meine Werkzeuge** (alle verknüpften Werkzeuge mit Auftraggeber), **⏰ Fällige Prüfungen** (`_dwzNextDue` aus Intervallen), **⚠ Defektmeldungen**, **🔄 Ersatzanfragen**, **🏢 Meine Auftraggeber** (Mandate).

Reaktion auf Defekt-/Ersatzmeldung:
- **📄 Offerte senden** (`_dwzOpenOfferte`): Preis, Nachricht, PDF-Upload (GemaStorage `offerten/<lieferantId>/werkzeug`, Fallback Base64 ≤ 2.5 MB). Gespeichert als `b.lieferantAntwort = {preis, nachricht, pdfName, pdfUrl|pdfDataUrl, ts, von}` (Defekt) bzw. `a.antwort = {…, beantwortetAm, beantwortetVon}` + `a.status='beantwortet'` (Ersatzanfrage). Notifikation `werkzeug_offerte_lieferant` an `role_magaziner` + Org des Werkzeugs.
- **🔧 Reparatur eröffnen** (`_dwzOpenReparatur`): setzt `t.lifecycleStatus='in_reparatur'` + `t.reparatur = {offen:true, lieferantId, lieferantFirma, defektBerichtId, termin, bemerkung, gestartetAm}` + `typ:'reparatur'`-Eintrag in `t.berichte[]`. **Reparatur abschliessen** setzt zurück auf `aktiv` (`reparatur.offen=false`) — der Defekt bleibt offen, der Magaziner prüft und markiert ihn selbst als erledigt. Notifikationen `werkzeug_reparatur` (info/erfolg).

Der Magaziner sieht alles im **Berichte-Modal** von if_werkzeug: `typ:'reparatur'`-Einträge (🔧), die Lieferanten-Offerte unter dem Defekt (`b.lieferantAntwort`, PDF klickbar) und eine Ersatzanfragen-Sektion mit Antworten/Offerten.

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

**Garagist-Rechte**: Feld-Whitelist `_FZ_GARAGIST_EDITABLE_FIELDS` (km, Service-Intervalle/-Daten, MFK, Reifen, Notizen); kein Erfassen/Löschen. km-Update via Formular, `_fzQuickKmEdit` (NFC/Detail) oder Garagisten-Dashboard.

**Garage-Einbuchen (Werkstatt-Status)**: `_fzGarageToggle/_fzGarageEinbuchen/_fzGarageAusbuchen` (+ «🏭 Garage»-Button im View-Modal) — Einbuchen setzt den bestehenden Status `service` («Im Service») + `v.garage = {eingebuchtAm, eingebuchtVonName, werkstatt, grund, ausgebuchtAm?}`; Ausbuchen zurück auf `aktiv`. Notifikation `fahrzeug_garage` an `role_magaziner` + Fahrzeug-Org. Gleiche Buttons im Garagisten-Dashboard (`_dashGarageEin/_dashGarageAus`).

**Defekt beheben = Reparatur dokumentieren (User-Vorgabe)**: `_fzResolveAllDefects` öffnet die **Reparatur-Doku** (`_fzOpenReparaturDoku`): Pflichtfeld «Was war das Problem / was wurde gemacht?», optional km/Kosten → erzeugt einen `serviceHistorie`-Eintrag (Art `reparatur`), markiert alle offenen Defekt-Events als behoben (`resolvedNote`) und benachrichtigt die Magaziner (`fahrzeug_service_erledigt`). Das Garage-**Ausbuchen** verlangt bei offenen Defekten zuerst dieselbe Doku (Dashboard: `_dashOpenRepDoku`).

**Garagisten-Dashboard (sys_garagist_dashboard.html)**: liest den Pool via `GemaSync.getCached('gema_vehicles')` + frischer Pull via `bindCollection` beim Start; Einzel-Saves via `GemaSync.saveRecord` (`_dashSaveVehicle` — vorher roher Blob-Write an der per-Record-Pipeline vorbei). Loggt km-Update/Garage/Reparatur ins zentrale Aktivitätslog (Org des Fahrzeugs).

**Zentrale Log-Abdeckung**: `_fzActLog` zusätzlich bei Defekt melden, Defekt behoben, Kosten, Reifen, km-Update, Fahrer-Zuweisung, Ausleihe/Rückgabe, Garage ein/aus, Reparatur (vorher nur erfasst/geändert/gelöscht/Garagist-Zuweisung/Service). `persist()` im Garagist-Zweig schliesst geladene Fahrzeuge per ID aus dem Erhalt aus (keine Duplikate bei Werkstatt-Team-Sicht). Alle `role_magaziner`-Notifikationen setzen `empfaengerOrgId` (Matching-Regel Rolle+Org).

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
- **Phasen sind jederzeit bearbeitbar**: Alle vier Phasen-Akkordeons (Erfasst / Analyse / Trocknung / Abschluss) lassen sich aufklappen und editieren, unabhängig vom aktuellen `s.phase`-Stand. Phase-Wechsel via `sdAdvancePhase` läuft ohne `confirm()`-Dialog. Status-Badge (Aktiv / Abgeschlossen / Ausstehend) bleibt rein visuell. **Abgeschlossene Phase wieder öffnen**: Akkordeon-Header einer „Abgeschlossen"-Phase hat (für `canEdit`) einen „↩ Aktiv"-Button → `sdReopenPhase(id,key)` setzt `s.phase` zurück und löscht die Abschluss-Marker dieser + späterer Phasen (Fehlklick-Korrektur).
- **Massnahmen inline editierbar**: Jede Massnahme der Zustandsanalyse ist ein `<textarea>` (`sdUpdateMn` onblur, speichert ohne Re-Render); „+ Massnahme" (`sdAddMnInline`) fügt eine leere Massnahme hinzu und fokussiert sie. Massnahme-Schema: `{id, beschreibung}` (alte String-Form wird beim Edit normalisiert).
- **Export-Phasen-Default** (`sdOpenPhasePicker`): alle Phasen BIS UND MIT der aktuellen `s.phase` sind vorausgewählt (nicht nur die aktive).
- **Geräte-Picker**: `devAddModal` zeigt oben eine Auswahl aller verfügbaren Trocknungsgeräte der eigenen Org (gelesen direkt aus `gema_trocknung_v1`). Klick befüllt Name + kW automatisch und speichert `tgDeviceId` als Verknüpfung. Beim Speichern wird das Gerät in `if_trocknung.html` auf Status `im_einsatz` gesetzt (Cross-Modul-Update via `gema-trocknung-updated` Event); beim Entfernen wird es wieder freigegeben mit Einsatz-Historien-Eintrag inkl. kWh-Berechnung.

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
- Pro Messpunkt: Messungen über Zeit (Datum, Wert in **Digits**, Foto-Beleg)
- **Schneller Erfassungs-Workflow**: Klick auf „+ Messung" öffnet sofort die Kamera (synchron im User-Gesture-Kontext, wichtig für iOS Safari). Nach dem Foto wird der Cursor automatisch ins Wert-Feld gesetzt — `inputmode="decimal"` öffnet die numerische Tastatur. Foto ist **optional**: User kann den Kamera-Dialog abbrechen und nur den Wert eintragen. Datum default = heute. Foto-Beleg gespeichert in `m.foto` als Base64; in der Tabelle erscheint ein 36×36-Thumbnail (Klick öffnet die Lightbox).
- Datenmodell: `{id, datum, wert, einheit:'Digits', foto:dataUrl}`
- Ansicht umschaltbar: Tabelle (mit Beleg-Spalte) oder Canvas-Liniendiagramm (reines Canvas, keine Library)
- Geräte-Tracking: Name, Raum/Zone, kW, Zählerstand Start/Ende → kWh-Berechnung. Picker im devAddModal verlinkt auf `gema_trocknung_v1` (siehe oben).
- Geräte-Darstellung umschaltbar **Tabelle ↔ Kacheln** (`sdToggleDevView`, Pref in `gema_sd_devview`). Default: Kacheln auf ≤1024px (iPad/Mobile — kein horizontales Scrollen), Tabelle auf Desktop. Kachel-Render: `_sdGeraeteCardsHtml` (gleiche Felder + editierbare Ende-/Datum-Inputs wie die Tabelle, 2-spaltiges `.dev-card-grid`).

### Export — PDF

`sdExportPdf(id)` rendert einen mehrseitigen Versicherungs-tauglichen Bericht via jsPDF (lazy CDN-Load):

- **Cover (Seite 1)**: Firmen-Logo aus `org.logo` (32×32 mm), Briefkopf rechts (Name, Adresse, Tel, Mail), darunter SCHADENSBERICHT-Header, Schadentitel groß, farbige Typ-Pille + Phase-Pille nebeneinander, Stammdaten-Box (Objekt, Bearbeiter, Erfasst, Schaden-ID, Räume), eingerahmte Versicherungs-Box mit Police-Nr. / Schaden-Nr. / Kontakt.
- **Seite 2 — TOC**: Inhaltsverzeichnis mit Phasen und Seitenzahlen. Wird _nachträglich_ befüllt (Section-Tracking via `sectionsTOC[]`), nachdem alle Inhalts-Seiten gerendert sind.
- **Inhalts-Seiten**: Jede Phase als farbiges Section-Band über Voll-Breite (Phasen-Farbe), darunter `drawParagraph`, `drawTable` mit Zebra-Streifen (Geräte: Name/Raum/kW/h/kWh/Status + Summen-Zeile; Messpunkte: Datum/Wert/Δ/Trend + min/max-Header), `drawPhotoGallery` 3 pro Zeile mit Rahmen und Caption.
- **Header (alle Inhalts-Seiten)**: kleines Logo (14×14) links, Firmenname, „Schadensbericht · Titel" rechts, Trennlinie.
- **Footer (alle Inhalts-Seiten)**: Firma + Adresse links, „PDF erstellt: …" mittig, „Seite X / Y" rechts, Trennlinie.
- **Statt Emojis**: farbige Buchstaben-Pillen (W/S/R/L/Rü/X) — jsPDF kann Emojis nicht rendern.
- Helper-Konstanten: `_PDF_TYP_INFO`, `_PDF_PHASE_INFO` für Farben+Labels.

### Export — PDF (Vorlage, HTML/Print via gema_schaden_pdf.js)

**Neuer Render-Weg** parallel zum alten jsPDF. Layout 1:1 nach `vorlagen/bericht_wasserschaden_vorlage.html` (Vorlage-Referenz im Repo, nicht editieren). Helper `gema_schaden_pdf.js` exponiert `GemaSchadenPDF.exportPrint(schaden, opts)` — öffnet ein neues Fenster mit DM-Sans-A4-Layout, der User klickt im Browser-Druckdialog auf «Als PDF speichern».

**Aufrufer**: `sdExportHtmlPrint(id)` in `sd_schadensbericht.html`. Öffnet zuerst eine **Phasen-Auswahl** (`sdOpenPhasePicker` — Toggle-Buttons Erfassung/Analyse/Trocknung/Abschluss, Default = aktuell aktive `s.phase`, kein Dropdown), übergibt die gewählten Keys als `opts.phases` und sammelt `org`/`user`/`objektName`/`objektAdresse`. In `gema_schaden_pdf.js` filtert `_sectionsHtml(s, opts)` die Inhalts-Sektionen nach `opts.phases` (Deckblatt immer; «erfasst» = nur Deckblatt) und nummeriert die sichtbaren Sektionen fortlaufend neu («Phase X von Y»). Button «📄 PDF (Vorlage)» neben dem alten PDF-Button — beide bleiben verfügbar. **Massnahmen** können String ODER `{beschreibung}`-Objekt sein → werden vor dem Render auf Text normalisiert (sonst «[object Object]»).

A4 **Hochformat** erzwungen: beide `@page`-Regeln `size:A4 portrait`, jsPDF `orientation:'portrait'`.

**Logo-Branch**: Wenn `org.logo` (Base64-data-URL aus `sys_unternehmen.html`) gesetzt ist → Firmen-Logo oben links auf dem Deckblatt. Sonst → eingebettetes GEMA-Inline-SVG. Damit zeigen User ohne hochgeladenes Logo automatisch das GEMA-Branding.

**Firmenfarben-Branding (`org.settings.pdfFarben`)**: Die Org kann in `sys_unternehmen.html` → Firmendaten → «Berichts-Farben (PDF)» eine **Primärfarbe** (Pflicht) und optional eine **Sekundärfarbe** wählen (gespeichert als `org.settings.pdfFarben = {primary, secondary?}` via `GemaAuth.updateOrgSettings`). Beide PDF-Helfer (`gema_schaden_pdf.js` + `gema_dachbericht_pdf.js`) leiten daraus per `_brandRootCss(org)` ein `:root{}`-Override ab, das NACH dem statischen `REPORT_CSS` in den `<style>` gehängt wird (spätere Regel gewinnt → überschreibt `--accent`/`--accent-deep`/`--forest`). Ohne `pdfFarben` bleibt das GEMA-Default (Navy/Forest bzw. Cyan). **Rollen** (User-Entscheid): Primär = Hauptakzent (Überschriften, Abschnittsnummern, Labels, Aufzählungspunkte, KPI-Werte, Trennstriche, Tabellen-Summen, erster Diagramm-Ton via `_curAccent`); Sekundär = Verlauf-Tail der Cover-Bar (`--forest`). Ohne Sekundärfarbe = dunklerer Ton der Primärfarbe.

**Fliesstext IMMER schwarz (User-Vorgabe)**: `.block-body`, `.note` (Schaden) und `.mn-text` (Dach) stehen fest auf `#000` — Fliesstext wird NIE von Brandfarben eingefärbt, auch nicht im Default-Branding. Brandfarben betreffen nur Akzente (Labels, Überschriften, Linien, Flächen). Zusätzlich leitet `_brandRootCss` auch `--tint-blue` als sehr hellen Ton der Primärfarbe ab (`_lightTint`, ~92% Weiss-Mischung) — damit passt z.B. der Hintergrund der Tabellen-Summenzeile zur Marke statt hellblau zu bleiben.

**KRITISCH — Kontrastschutz (kein Text in heller Farbe)**: `--accent` wird für Text/Linien AUF Weiss UND als Fläche UNTER weisser Schrift verwendet. Eine Firmenfarbe wird deshalb NIE 1:1 als Textfarbe genutzt, sondern über `_darkenForWhiteBg(hex, 4.5)` Richtung Schwarz skaliert (Hue bleibt erhalten), bis der WCAG-Kontrast gegen Weiss ≥ 4.5:1 ist. Da der Kontrast **symmetrisch** ist, ist die so gewonnene Farbe gleichzeitig als dunkler Text auf Weiss UND als Flächenfarbe mit weisser Schrift lesbar. Beispiel: Gelb `#f5c518` → dunkles Gold `#8d710e`; reines Gelb `#ffff00` → Olivgold `#797900`. Der Farb-Picker in `sys_unternehmen.html` zeigt dieselbe Abdunkel-Logik als Live-Vorschau (`_fbDarken`), damit der User sofort sieht, wie eine helle Farbe als lesbarer Textton erscheint. Die Helper (`_hexToRgb`/`_relLum`/`_contrastVsWhite`/`_darkenForWhiteBg`/`_brandRootCss`) sind in beiden PDF-Helfern dupliziert (standalone IIFEs).

**Inhalt** (auto-skipping bei leeren Sektionen):
- Cover: laufender Header/Footer mit Org-Name (oder «GEMA»), Cover-Bar (Navy → Forest), Brand-Block (Logo), Schadentitel + Eyebrow, Status-Pill, Meta-Grid (Objekt/Adresse/Bearbeiter/Schadentyp/Erfasst am/Räume), KPI-Strip (Trocknungsdauer/Geräte/Energie/Messpunkte) — KPIs nur wenn Trocknung Daten hat
- Sektion 1 «Zustandsanalyse»: Leckortung / Schadenausmass / Massnahmen-Liste + Fotos
- Sektion 2 «Trocknung»: Facts-Row (Start/Ende/Dauer/Energie), Geräte-Tabelle (Std/Tag berechnet aus zählerTyp), Zusammenfassung pro Raum mit Total-Zeile, **auto-skalierter Inline-SVG-Chart** (Messpunkt-Trend) + Messwert-Tabellen mit Differenz/Trend-Spalte, Notizen, Fotos
- Sektion 3 «Abschluss»: Zusammenfassung / Instandstellung / Weitere Schäden + Fotos + Unterschriften-Zeile

**Foto-Filter**: respektiert `f.imBericht !== false` — ausgeschlossene Fotos erscheinen nicht im Export (siehe «Foto-im-Bericht pro Bild umschaltbar» weiter oben).

**Diagramm**: auto-Skala basierend auf min/max Wert (±10% Padding, auf 5 gerundet), max 5 X-Labels, bis zu 5 Serien mit unterschiedlichen Farben/Dash-Patterns. Bei nur einem Messpunkt komplett ausgeblendet.

**Print-Toolbar**: oben rechts (nur Bildschirm, im Druck via `.no-print` weg) — «Drucken / Als PDF speichern» + «Schliessen»-Button.

**Kopf-/Fusszeile auf jeder Druckseite via `@page` margin-boxes**: Chrome/Edge rendern beim Drucken `@page { @top-left @top-right @bottom-left @bottom-right }` als feste Header/Footer auf jeder Seite. Der CSS-`content` wird beim Build dynamisch zusammengesetzt (Org-Name + Berichttitel + Datum als Strings einescaped, `counter(page)` / `counter(pages)` als CSS-Counter). Layout: oben links Org-Name, oben rechts «Schadensbericht · Titel», unten links «Org-Name · Erstellt Datum», unten rechts «Seite X von Y». Im Bildschirm haben die A4-Blätter keinen Header/Footer (zu wenig Platz neben den Sektionsblöcken) — die Print-Vorschau im Browser zeigt die @page-Boxen.

**Sachbearbeiter**: wird im Erfassungs-Modal (`sdOpenNew`) per Dropdown gewählt (`#f_sachbearbeiter`). Default = aktuell eingeloggter User. Auswahl alle aktiven User der eigenen Org (`GemaAuth.getUsers().filter orgId`). Speichert in `s.erstelltVon = {userId, name}` — wird im Cover unter «Sachbearbeiter» angezeigt.

**Bildschirm-Vorschau zeigt Seiten als A4-Blätter**: Cover und jede `report-section` sind in der Vorschau eigene 210×297mm-Blätter mit Box-Shadow auf grauem Hintergrund — der User sieht die Sektion-Grenzen, statt eines fortlaufenden Stroms. Im Print fallen die Schatten weg und der Browser fügt physische Seiten automatisch ein.

**Saubere Seitenumbrüche im Druck**: Subhead + Tabelle werden über einen `.tbl-block`-Wrapper mit `break-inside:avoid` zusammengehalten — der Tabellen-Header steht nicht alleine am Seitenende. Genauso `.photo-group` (Foto-Head + Grid bei ≤6 Fotos), `.chart-card`, `.note`, `.block` und einzelne `.tbl`-Zeilen. `display:table-header-group` auf `.tbl thead` wiederholt den Header bei einer Tabelle, die doch noch übers Seitenende läuft.

**Unterschriften-Block entfernt** im Standard-Export (Bearbeiter / Ort/Datum). CSS-Klassen `.sign-row` / `.sign-line` bleiben für externe Aufrufer als Backward-Compat.

### Export — Word

`sdExportWord(id)` baut HTML mit Word-XML-Namespace als `.doc`. Nutzt gemeinsame Funktion `sdBuildReportHtml(s)`. Einfacher als das PDF, dafür in Word vollständig editierbar.

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

## Spenglerei – Dachinspektion (sp_dachbericht.html)

Modul für Spengler zur Erstellung von Dach-Inspektionsberichten auf der Baustelle. Workflow ähnlich Schadensbericht (sd_schadensbericht.html), aber mit Spengler-spezifischer Struktur: Dachübersicht → Kapitel pro Seite (Strasse/Hof/Garten) → Unterkapitel (Einfassungen, Rinnen, Lukarnen etc.) → Massnahmen. PDF-Export im GEMA-Vorlagen-Stil mit Org-Logo bzw. GEMA-Fallback.

### Datenmodell

Storage-Key: `gema_dachbericht_v1` (Cloud-First via `gema_sync.js`, moduleKey `dachbericht`, prefix `dach:`).

```
{
  id, titel, objektId, phase: 'erfassung'|'inspektion'|'abschluss',
  erstelltAm, erstelltVon{userId,name}, orgId,
  dachuebersicht: {
    dachtyp, dachtypKombi[],     // bei 'kombination' zwei Dachformen
    dachtypText,                 // editierbarer Standardtext aus Template
    ziegelart, ziegelartText,
    bild: {dataUrl,kommentar},   // grosses Übersichtsbild
    bemerkung
  },
  kapitel: [
    { id, name,                   // Strassenseite/Hofseite/...
      einleitung,                 // freier Text, Claude-überarbeitbar
      bildGross: {dataUrl,kommentar},
      bilder: [{dataUrl,kommentar}], // Auto-Grid 1/2/4/6
      checkliste: ['Einfassungen','Rinnen',...],
      unterkapitel: [{id, typ, label, text, bilder:[]}]
    }
  ],
  nachbaranschluesse: {text, bilder:[]},
  massnahmen: [{id, titel, beschreibung, empfehlung, prioritaet:'niedrig'|'mittel'|'hoch'}]
}
```

### Templates (Org-Level)

Pro Org in `org.spengler_templates` gespeichert. Admin pflegt sie über das «⚙ Vorlagen»-Modal direkt in `sp_dachbericht.html`. Default-Templates kommen aus `DEFAULT_TEMPLATES` im Modul (Schweizer Hochdeutsch, keine ß) und werden gemergt wenn Org-Templates leer sind.

| Template-Liste | Inhalt |
|---|---|
| `dachtypen` | Flachdach, Satteldach, Walmdach, Pultdach, Mansarddach, Kombination — mit Standardtext pro Eintrag |
| `ziegelarten` | Biber, Flach-/Falzziegel, Eternit, Blech, Bitumen, Folie, Gründach — mit Standardtext |
| `seitenBezeichnungen` | Strassenseite, Hofseite, Gartenseite, Himmelsrichtungen — Dropdown-Optionen für Kapitel-Namen |
| `unterkapitelTypen` | Einfassungen, Dachfenster, Antennen, Lukarnen, Rinnen, Abflussrohre, Kamine, Lüftung, Schneefänge, Blitzableiter, Solar, Sicherung — mit Standardtext |
| `checklisteItems` | Strings für die Checkliste pro Kapitel |

### Claude-AI-Integration (Texthilfe)

`gema_claude.js` Browser-Helper ruft die Netlify-Function `/.netlify/functions/claude-rewrite`. Die Function hält den Anthropic API-Key serverseitig (Env-Var `ANTHROPIC_API_KEY` in Netlify-Settings) — sonst läge er im Frontend.

5 Modi:
- `rewrite` — Stichpunkte/Notizen zu sauberem Berichtstext
- `bulletpoints` — explizit Stichpunkte → Fliesstext
- `fix` — Rechtschreib- und Grammatikkorrektur
- `shorten` — kürzen
- `expand` — ausführlicher machen

Wird via `claudeRow()` in jedem Textfeld als Button-Reihe angezeigt («✨ KI-Verbessern», «📝 Stichpunkte → Text», «🔤 Rechtschreibung», «▸ Kürzer», «◂▸ Ausführlicher»). Modell: `claude-haiku-4-5-20251001` (schnell + günstig für Textüberarbeitung).

**Wenn Function nicht deployed**: `claudeAction` zeigt einen Alert, das Modul funktioniert ohne Claude weiter — der User kann Text manuell schreiben.

### PDF-Export (gema_dachbericht_pdf.js)

`GemaDachberichtPDF.exportPrint(bericht, {org,user,objektName,objektAdresse,templates})` — öffnet neues Fenster mit A4-Layout, User klickt im Druckdialog auf «Als PDF speichern». Logo-Branch wie Schadensbericht (org.logo vs. eingebettetes GEMA-SVG). **Firmenfarben-Branding identisch** zum Schadensbericht: `_brandRootCss(org)` leitet `--accent`/`--forest` aus `org.settings.pdfFarben` ab, mit demselben Kontrastschutz (`_darkenForWhiteBg`, ≥ 4.5:1 gegen Weiss). Siehe Schadensbericht-Vorlage-Abschnitt für Details.

**Bilder-Grid-Regel (User-Anforderung):**
- 1 Bild → volle Breite
- 2 Bilder → 1×2 Grid
- 3-4 Bilder → 2×2 Grid (4 füllen die Seite)
- 5-6 Bilder → 3×2 Grid (6 füllen die Seite)
- mehr als 6 → in 6er-Chunks, jeder neue Chunk mit `page-break-before:always`

`gridHtml(bilder)` chunkt die Liste und setzt zwischen den Chunks einen Seitenumbruch.

**Aufbau:** Cover (Org/GEMA-Logo, Titel, Metadaten) → Dachübersicht (Dachtyp + Eindeckung + Bild) → Kapitel (jedes ein eigener Section, Großbild + Einleitung + Bilder-Grid + Checkliste + Unterkapitel) → Nachbaranschlüsse → Maßnahmen (sortiert nach Priorität, farblich kodiert hoch/mittel/niedrig).

### Berechtigungen

Neue Rolle `role_spengler` (Spengler) in `gema_auth.js` — Read+Write+Admin auf `dachbericht`, plus Werkzeug-Read und Objekte. Planer-Rollen (`role_planer` etc.) und Admin haben automatisch Read+Write via `_allPerms`.

### Dateien

| Datei | Zweck |
|---|---|
| `sp_dachbericht.html` | Hauptmodul (~1100 Zeilen) — Dashboard, Erfassungs-Modal, Detail-Ansicht mit 5 Akkordeon-Sektionen, Templates-Editor |
| `gema_dachbericht_pdf.js` | HTML/Print-Export-Helper im GEMA-Vorlagen-Stil |
| `gema_claude.js` | Browser-Helper für Anthropic-Proxy-Function |
| `netlify/functions/claude-rewrite.js` | Server-Proxy für Anthropic API (Env: `ANTHROPIC_API_KEY`) |
| `netlify.toml` | Netlify-Konfiguration (functions-Dir, Redirect) |

### Deployment-Hinweis

Nach Deploy: In Netlify-Settings unter Environment Variables `ANTHROPIC_API_KEY` setzen (sk-ant-...). Ohne Key gibt die Function HTTP 500 zurück, das Modul funktioniert aber weiter (KI-Buttons zeigen Fehlermeldung, User kann Texte manuell schreiben).

---

## Trocknungsgeräte (if_trocknung.html)

Phase 2 der Schadensdokumentation — separates Gerätemanagement für Trocknungsgeräte. Gleiche Architektur wie if_werkzeug.html.

### Gerätetypen

| Typ | Icon | Key | Farbe |
|-----|------|-----|-------|
| Bautrockner | 🌡️ | `bautrockner` | #dc2626 |
| Adsorptionsentfeuchter | 🌫️ | `adsorption` | #0891b2 |
| Unterdruckverfahren | 🌪️ | `unterdruck` | #475569 |
| Ventilator | 🌀 | `ventilator` | #2563eb |
| Luftentfeuchter | 💨 | `luftentfeuchter` | #7c3aed |
| Infrarotheizung | ☀️ | `infrarot` | #d97706 |
| Messgerät (kein kW) | 📊 | `messgeraet` | #16a34a |

Messgeräte (Feuchtemessgerät, CM-Gerät, Datenlogger, Wärmebildkamera, etc.) sind Diagnose-Hilfsmittel und tragen das Flag `noKw:true` in `GERAETE_TYPEN`. Im Erfassungs-Modal wird das Leistungs-Feld (kW) ausgeblendet, beim Einsetzen entfällt der Zählerstand-Start, beim Zurücknehmen die kWh-Berechnung. Der Einsatz-Workflow (Schadensprojekt + Raum) funktioniert ansonsten identisch.

### Zähler-Typ (`zaehlerTyp`)

Jedes Gerät hat einen Zähler-Typ — drei Werte:

| Wert | Bedeutung | kWh-Berechnung |
|------|-----------|----------------|
| `kein` | Kein Verbrauchszähler | — |
| `stunden` | Klassischer Stunden-Zähler | `(Ende − Start) × kW` |
| `kwh` | Direkter kWh-Verbrauchszähler | `Ende − Start` |

Default-Logik (Helper `_tgDefaultZaehlerTyp(typ)` in `if_trocknung.html`, `_sdDefaultZaehlerTyp(dev)` in `sd_schadensbericht.html`): `typ === 'messgeraet'` → `'kein'`, sonst `'stunden'`. **Lazy-Migration** — alte Geräte ohne Feld werden beim Lesen wie `'stunden'` behandelt; beim ersten Edit-Save persistiert das Feld.

### Aktueller Zählerstand (`aktuellerZaehlerstand`)

Jedes Gerät führt seinen letzten bekannten Zählerstand mit. Helper:
`_tgGetAktuellerStand(d)` (if_trocknung), `_sdGetAktuellerStand(dev)` (sd_schadensbericht) — beide mit Fallback auf den letzten Wert aus `einsatzHistorie[].zaehlerEnde`, damit alte Datensätze ohne Feld trotzdem einen sinnvollen Default liefern.

Aktualisierungs-Pfade:
- `if_trocknung.html` → `saveDevice`: Pflege des Initialstands beim Erfassen (neues Feld im Modal, optional).
- `if_trocknung.html` → `saveEinsatz`: setzt den Stand auf `e_zaehlerStart` (falls User beim Einsetzen korrigiert).
- `if_trocknung.html` → `saveReturn`: setzt den Stand auf `r_zaehlerEnde` nach Einsatz-Abschluss.
- `sd_schadensbericht.html` → `sdUpdateDevEnd`: schreibt den eingegebenen Endstand zurück via `_sdUpdateTgAktuellerStand` (Cross-Modul). Nur wenn `g.tgDeviceId` gesetzt und der neue Stand ≥ alter Stand (Schutz vor versehentlichem Rückwärts-Drehen).

Verwendungen:
- `if_trocknung.html` → `openEinsatz`: `e_zaehlerStart` wird mit aktuellem Stand vorbefüllt.
- `sd_schadensbericht.html` → Picker-Click + NFC-Scan: `devStart` wird mit aktuellem Stand vorbefüllt. Monteur prüft, korrigiert ggf., bestätigt.

`sd_schadensbericht.html` exponiert zentrale Helper `sdComputeKwh(g)` und `sdComputeHours(g)`, die den Zähler-Typ respektieren — alle Live-Tabellen, PDF/Word-Exports und Cross-Modul-Historie (`_sdReleaseTgDevice` schreibt `hist.zaehlerTyp` und entweder `kwhTotal` direkt oder `betriebsstunden`+`kwhTotal`) gehen über diese Helper.

### NFC-Scan beim Hinzufügen im Schadensbericht

`sd_schadensbericht.html` devAddModal hat einen „📡 NFC-Tag scannen"-Button. Der Helper `gema_nfc_scanner.js` (`GemaNFC.scan({mode:'auto'})`) nutzt Web-NFC bei Android Chrome, sonst Fallback auf `GemaQR.scan()` (Kamera + html5-qrcode). Bei iPhone Safari (kein In-Browser-NFC) blendet der Helper einen Hinweis ein, dass der Tag auch direkt ans Handy gehalten werden kann (Hintergrund-Scan öffnet die geschriebene URL `if_trocknung.html?id=tg_xxx`).

Nach erfolgreichem Scan: ID aus URL/Payload extrahieren, im verfügbaren Geräte-Pool suchen, Felder vorbefüllen, Picker-Karte visuell hervorheben, Vibration, Cursor springt automatisch ins Zählerstand-Feld. Bei `zaehlerTyp='kein'` (z.B. Messgeräte) entfällt die Zählerstand-Eingabe.

### Status

| Status | Key | Farbe |
|--------|-----|-------|
| Verfügbar | `verfuegbar` | grün |
| Im Einsatz | `im_einsatz` | amber |
| In Wartung | `in_wartung` | blau |
| Defekt | `defekt` | rot |

### Datenmodell

Storage-Key: `gema_trocknung_v1`

**Speichern mit Status-Anzeige (wie Dachbericht):** `saveAll()` ruft `scheduleSave(true)` → `_doSave()` → `_tgPersist()` (per-Record `GemaSync.persistCollection` mit expliziter Baseline aus `getCached`). Der OneDrive-Style-Indikator unten rechts (`#saveStatus`, `_tgSaveSetStatus`) zeigt `pending → saving → saved` (blendet nach 2s aus) bzw. `error` (statt der frueheren blockierenden «Offline»-Dialogbox). State-Maschine: `_tgSavePending`/`_tgSaveInFlight` mit Retry bei Fehler; `flushSave()` + keepalive-Save auf `beforeunload`/`pagehide`/`visibilitychange`. `_tgBuildFullSet()` erhaelt fremde Orgs.

```
{
  id, name, typ, marke, modell, serienNr, kw, notes, orgId,
  zaehlerTyp: 'kein'|'stunden'|'kwh',
  aktuellerZaehlerstand: number|null,  // letzter bekannter Zaehlerstand (Stunden oder kWh)
  status: 'verfuegbar'|'im_einsatz'|'in_wartung'|'defekt',
  hasService, serviceInterval, lastService,
  
  einsatz: null | {
    schadenId, schadenTitel, objektId, objektName,
    raum,              // Raum/Zone (z.B. "Bad EG")
    eingesetztAm, eingesetztVon:{userId,name},
    zaehlerStart       // Stunden ODER kWh, je nach zaehlerTyp
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

- QR-Generierung pro Gerät als SVG (inline QR-Library, `correctLevel M`, 190×190)
- SVG-Download + PNG-Download
- URL: `if_trocknung.html?id=DEVICE_ID` — öffnet automatisch Detail
- QR-Dialog mit Umschalter **«QR-Code | Etikette»** (`setQrMode('qr'|'label')`) — schaltet zwischen `#qrViewQr` (Canvas + Info + SVG/PNG/NFC) und `#qrViewLabel` (Etiketten-Vorschau + PDF) um. Beim Öffnen via `openQR(id)` wird `_currentQRDevice` gesetzt und immer auf den QR-Modus zurückgestellt.

### Interne Kennung (`d.internKennung`)

Eigene betriebsinterne Bezeichnung/Nummerierung pro Gerät (z.B. «TR-07»), **optional**. Erfassbar im Geräte-Dialog (`#f_intern`). Sichtbar als 🏷-Badge auf Karte, hinter dem Namen in der Tabelle, als Zeile in der Detail-Ansicht, in der QR-Info und im Inventar-PDF; in die Volltextsuche (`renderList`-Haystack) aufgenommen. Lazy — alte Geräte ohne Feld zeigen «—».

### Etiketten-System (komplett)

Druckfertige Geräte-Etikette **49 × 23 mm Querformat** als PDF (jsPDF, mm-genau, eine Seite pro Etikette). Erreichbar als Einzel-Etikette im QR-Dialog und als Sammelexport aus der Übersicht.

**Format & Geometrie** — `_TG_ETIK = {LW:49, LH:23, PAD:1.6, GAP:1.4}` (mm). Festes Layout (keine A/B-Varianten mehr):
- **QR-Code rechts** über die volle Höhe: `qr = LH−2·PAD = 19.8mm`, Position `qrX = LW−PAD−qr = 27.6`, `qrY = PAD = 1.6`.
- **Linke Spalte** (`colX = PAD = 1.6`, `colW = qrX−GAP−PAD = 24.6mm`, Höhe `colH = 19.8`):
  - **Logo oben**, Band-Höhe `min(8, colH·0.46) = 8mm`. Logo wird seitenverhältnistreu in das Band eingepasst (höhen- oder breitenbegrenzt je nach `ratio`), links­bündig, vertikal zentriert.
  - **Bezeichnung darunter** (Gap 1mm): vertikal+horizontal zentriert, automatisch eingepasst (`_tgFitText`, max 12pt, min 5.5pt, **bis 2 Zeilen** Wortumbruch). Ohne Logo bekommt der Text die volle Spaltenhöhe.

**Beschriftung** — `_tgEtiketteText(d)` = `d.internKennung` (getrimmt) wenn gesetzt, sonst **Fallback auf den Gerätenamen** `d.name`.

**Firmenlogo** — `_tgLabelLogoSrc()` = `org.logo` der eingeloggten Org (Base64-DataURL via `GemaAuth.getCurrentUser()`+`getOrgs()`), sonst eingebettetes **GEMA-Logo** (`_TG_GEMA_LOGO_DATAURL`, URL-encoded SVG der Nav-Wortmarke in Navy `#0f172a`, intrinsische Grösse 1660×700 für scharfe Rasterung). jsPDF kann kein SVG einbetten → `_tgRasterizeImage(src)` lädt die Quelle in ein `Image` und zeichnet sie auf ein Canvas. Liefert `{dataUrl(PNG), ratio}`. `_tgEnsureLabelLogo()` cached das Ergebnis pro Quelle (`_tgLogoCache`).

**KRITISCH — Logo-Druckoptimierung für 300dpi-Thermo-Etikettendrucker** (`_tgRasterizeImage` + `_tgMonochromeForLabel`, identisch als `_wzRasterizeImage`/`_wzMonochromeForLabel` in if_werkzeug):
1. **Immer hochauflösend rastern** (lange Kante 1400px, bicubic `imageSmoothingQuality:'high'`) — auch kleine hochgeladene Raster-Logos. Früher wurden Raster-Quellen nie hochskaliert; der Drucker-RIP zog das kleine Bild dann selbst grob auf die ~8mm-Logobox → Pixelklötze («Logo in sehr schlechter Qualität»).
2. **1-Bit-Schwellwert-Konvertierung** (auf Weiss alpha-kompositieren → Luminanz < 176 ⇒ reines Schwarz, sonst reines Weiss): Thermo-Etikettendrucker drucken NUR Schwarz — Graustufen und Anti-Aliasing-Kanten werden vom Treiber **gedithert** (fleckiger, «unsauberer» Druck; betraf auch das navy-farbene GEMA-Logo). Harter Schwellwert nach dem HQ-Upscale ergibt gestochen scharfe Kanten. **Fallback für sehr helle Logos**: bleibt nach dem Schwellwert < 1.5% Schwarzanteil, wird mit Schwellwert 235 erneut konvertiert (Silhouette statt leerem Band). Farbige Logos erscheinen auf der Etikette bewusst schwarz-weiss.
3. Die Live-Vorschau nutzt dieselbe Pipeline (WYSIWYG). QR wird weiterhin als **Vektor** gezeichnet, Text als PDF-Font — beide sind druckscharf. Bei tainted Canvas (externe URL) bleibt die Konvertierung aus (try/catch).

**Live-Vorschau** — `_tgBuildEtikettePreview()` rendert dasselbe Layout als HTML in `#qrLabelPreview` (Massstab `PX = 6.4 px/mm`), inkl. Logo-`<img>` und QR-`<img>`. Async (wartet auf Logo); bricht ab, wenn das Gerät inzwischen gewechselt hat.

**Layout-Konsistenz** — Vorschau und PDF nutzen exakt dasselbe Spec aus `_tgComputeEtikette(text, logo)`. Textbreiten-Messung via `_tgEtiketteW10(text)` (jsPDF `getTextWidth` bei 10pt, mit Zeichen-Schätzung als Fallback, solange jsPDF noch nicht geladen ist), Wortumbruch via `_tgWrapText(text, maxW, fontPt)`.

**QR-Quelle (Druck = Vektor, scharf + scanbar)** — `_tgQrForUrl(url)` baut pro Gerät einen QR offscreen und liefert `{modules, dataUrl}` (modules = 2D-Bool-Matrix aus `qr._oQRCode.modules`). Einzel- **und** Sammelexport nutzen dieselbe Funktion (URL = `?id=<deviceId>`). Im PDF wird der QR als **Vektor** gezeichnet (`_tgDrawQrVector` — dunkle Module als horizontale Run-Rechtecke via `doc.rect(...,'F')`), NICHT als gerastertes PNG → auf kleinen Etiketten gestochen scharf und zuverlässig scanbar. PNG-`dataUrl` nur als Fallback, falls die Modul-Matrix fehlt. Die Live-Vorschau (Bildschirm) nutzt weiterhin das Modal-Canvas-PNG (`_tgGetQrDataUrl`).

**Zeichenkern** — `_tgDrawEtikette(doc, spec, qr, logo)` (`qr = {modules, dataUrl}`) zeichnet **eine** Etikette auf die aktuelle jsPDF-Seite (Vektor-QR + Logo + vertikal zentrierter Text). Wird von Einzel- **und** Sammelexport geteilt.

**Helper-Übersicht:**

| Helper | Zweck |
|--------|------|
| `_TG_ETIK` | Geometrie-Konstanten (mm) |
| `_TG_GEMA_LOGO_SVG` / `_TG_GEMA_LOGO_DATAURL` | GEMA-Fallback-Logo (SVG → DataURL) |
| `_tgGetOrgLogoSrc()` | `org.logo` der eigenen Org oder `''` |
| `_tgLabelLogoSrc()` | `org.logo` || GEMA-Fallback |
| `_tgRasterizeImage(src)` | Bildquelle → `{dataUrl(PNG), ratio}`, immer 1400px lange Kante + 1-Bit-Schwellwert (siehe «Logo-Druckoptimierung») |
| `_tgMonochromeForLabel(ctx,w,h)` | Canvas → reines Schwarz/Weiss (Thermodrucker-Dithering vermeiden) |
| `_tgEnsureLabelLogo()` | Logo rastern + cachen (Promise) |
| `_tgEtiketteW10(text)` | Textbreite @10pt (mm), jsPDF oder Schätzung |
| `_tgWrapText(text, maxW, fontPt)` | Wortumbruch |
| `_tgFitText(text, boxW, boxH, maxFont, minFont)` | Schrift einpassen, max 2 Zeilen → `{font, lines, lineH}` |
| `_tgComputeEtikette(text, logo)` | Festes Layout-Spec (alle mm-Koordinaten) |
| `_tgEtiketteText(d)` | interne Kennung || Gerätename |
| `_tgGetQrDataUrl()` | Modal-Canvas → PNG |
| `_tgQrForUrl(url)` | Offscreen-QR → `{modules, dataUrl}` |
| `_tgDrawQrVector(doc, modules, x, y, size)` | QR als Vektor-Rechtecke auf die Seite zeichnen |
| `_tgDrawEtikette(doc, spec, qrData, logo)` | Eine Etikette auf die aktuelle Seite zeichnen |
| `_tgBuildEtikettePreview()` | HTML-Live-Vorschau |
| `downloadEtikettePDF()` | Einzel-Export → `Etikette_<slug>.pdf` |

**Einzel-Export** — `downloadEtikettePDF()` (Button im Etiketten-Modus): jsPDF `{unit:'mm', format:[49,23], orientation:'landscape'}`, eine Seite, Dateiname `Etikette_<slug>.pdf`.

**Sammelexport (Mehrfachauswahl)** — nur **Magaziner + Admin** via `_tgCanBulkLabel()` (= `_tgCanSeeActLog()`):
- **Checkboxen** auf jeder Karte (oben rechts, `.tg-sel-box`) und in jeder Tabellenzeile (zusätzliche erste Spalte, Header `#tgSelTh`) — nur im Auswahl-Modus gerendert.
- **Auswahl-Leiste** `#tgSelBar` über der Liste (nur Magaziner/Admin): **«☑ Alle markieren»** (`tgSelectAllVisible` — markiert genau die aktuell **gefilterten/sichtbaren** Geräte aus `_tgLastFilteredIds`, toggelt zu «☐ Auswahl aufheben»), **«Auswahl leeren»** (`tgClearSel`), **Zähler** `#tgSelCount`, **«🏷 Etiketten als PDF»** (`exportEtikettenBulk`, deaktiviert bei 0).
- **State**: `_tgSelected` (id→true), `_tgLastFilteredIds` (in `renderList` gesetzt). Toggle pro Checkbox: `tgToggleSel(id, checked, el)` (aktualisiert Set + Karten/Zeilen-Highlight `.tg-row-sel` + Leiste ohne Re-Render); Bulk-Aktionen rendern neu (`renderList`). `_tgUpdateSelBar()` aktualisiert Zähler/Buttons/Sichtbarkeit; `_tgSelectedIds()`/`_tgSelectedCount()` schneiden die Auswahl gegen vorhandene Geräte. Beim Löschen eines Geräts wird die ID aus `_tgSelected` entfernt.
- **Export** = **ein** PDF mit **je einer 49×23mm-Seite pro markiertem Gerät** (erste Seite beim Erzeugen des Docs, weitere via `doc.addPage([49,23],'landscape')`), Dateiname `Etiketten_<N>_Stueck.pdf`.

**jsPDF** wird lazy via `_tgEnsureJsPDF()` (CDN) geladen; Einzel-, Sammel- und Inventar-Export teilen sich diese Funktion.

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

## Aktivitätenlog (gema_aktivitaetslog.js)

Modul-übergreifender Aktivitätenlog für die Infrastruktur-Module **Werkzeug**, **Fahrzeug** und **Trocknungsgeräte**. Eingebunden in `if_werkzeug.html`, `if_fahrzeug.html` und `if_trocknung.html`.

### Sichtbarkeit

Toolbar-Button **„📋 Aktivitäten"** — nur sichtbar für `role_admin` und `role_magaziner`. Andere Rollen sehen den Button nicht (Planer/Monteur/Garagist haben keinen Zugriff auf den Log).

### Storage (Cloud-First via gema_sync.js)

- **storageKey**: `gema_aktivitaetslog_v1` (lokaler sync-Cache, soft-cap 2000 Einträge)
- **moduleKey**: `aktivitaetslog`
- **Prefix**: `log:` → eine Cloud-Row pro Eintrag (`log:log_<ts>_<rand>`)
- **Bootstrap**: jedes Modul ruft `GemaActivityLog.bootstrap()` im DOMContentLoaded → lädt Records aus Cloud in den localStorage-Cache

### Eintrag-Schema

```
{
  id, ts,                        // 'log_<ts>_<rand>', ISO-Timestamp
  orgId,                         // Org-Filter
  modul,                         // 'werkzeug'|'fahrzeug'|'trocknung'
  modulRecordId, modulRecordName,// Verknüpfung zum Datensatz
  aktion,                        // siehe AKTION_LABEL-Tabelle unten
  beschreibung,                  // Freitext (kurz)
  userId, userName,              // wer hat die Aktion ausgelöst
  details                        // optional, Aktion-spezifisch
}
```

### Aktion-Typen (`aktion`)

`erfasst`, `geaendert`, `geloescht`, `zuweisung`, `ausleihe`, `rueckgabe`, `einsatz`, `einsatz_ende`, `pruefung`, `service`, `pruefanfrage`, `defekt`, `defekt_erledigt`, `ersatzanfrage`, `km_update`, `kosten`, `reifen`, `offerte`, `reparatur`, `garage_ein`, `garage_aus`. Jede mit farbiger Pill im Modal.

**Org-Regel (KRITISCH bei Cross-Org-Aktionen):** `log()` akzeptiert `opts.orgId` — der Eintrag gehört zur Org des DATENSATZES (Werkzeug/Fahrzeug), nicht zur Org des Bearbeiters. Externe Lieferanten/Prüfer/Garagisten loggen so ins Log der Auftraggeber-Org (Wrapper `_wzActLog`/`_fzActLog` übergeben `tool.orgId`/`v.orgId`; Dashboards nutzen `_dwzLog`/`_dashLog`). Geloggt wird auch aus `sys_lieferant_dashboard.html` (Quittieren, Prüfbericht, Offerte, Reparatur) und `sys_garagist_dashboard.html` (km-Update, Garage ein/aus, Reparatur-Doku) — beide laden `gema_aktivitaetslog.js`.

### Public API

```javascript
GemaActivityLog.bootstrap()                        // Promise — beim Seitenstart
GemaActivityLog.log({modul, modulRecordId,
  modulRecordName, aktion, beschreibung, details}) // fire-and-forget
GemaActivityLog.getAll(orgId?)                     // Array, neueste zuerst
GemaActivityLog.getForModul(modul, orgId?)         // gefiltert pro Modul
GemaActivityLog.openModal({modul, titel?})         // einheitliches Modal
```

### Modul-Integration

Jedes der drei Module hat:
- Lokalen Wrapper `_wzActLog` / `_fzActLog` / `_tgActLog` — fire-and-forget mit Modul-Stempel
- Toolbar-Button `btnWzActLog` / `btnFzActLog` / `btnTgActLog` — Sichtbarkeit gated auf Magaziner/Admin
- Logging-Aufrufe an Save/Delete, Zuweisung, Ausleihe/Rückgabe, Einsatz/Einsatz-Ende, Defekt/Defekt-erledigt, Prüfungen, Anfragen

### UI (`openModal`)

Tabellen-Modal mit fünf Spalten (Datum, Aktion-Pill, Datensatz, Beschreibung, User), Suchfeld (Datensatz/User/Beschreibung), Aktion-Filter-Dropdown und CSV-Export-Button. Auto-Refresh via `gema-activitylog-changed`-Event.

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
| `werkzeug_offerte_lieferant` | werkzeug | on |
| `werkzeug_reparatur` | werkzeug | on |
| `werkzeug_koffer_fehlteil` | werkzeug | on |
| `fahrzeug_service_faellig` | fahrzeug | on |
| `fahrzeug_service_erledigt` | fahrzeug | on |
| `fahrzeug_garagist_zugewiesen` | fahrzeug | on |
| `fahrzeug_garage` | fahrzeug | on |
| `lu_updated` | lu | off |
| `schaden_neu` | schadensbericht | on |
| `schaden_phase_geaendert` | schadensbericht | on |
| `trockner_zurueckgegeben` | trocknung | on |
| `trockner_defekt` | trocknung | on |
| `offertanfrage_neu` | produktkatalog | on |
| `offertanfrage_beantwortet` | produktkatalog | on |
| `offertanfrage_abgelehnt` | produktkatalog | on |

**Neue Module fügen ihre Event-Keys hier hinzu**, sonst greift kein Preferences-Filter.

### Cloud-Sync (Cross-Device-Zustellung)

Notifikationen lagen früher NUR im localStorage — sie erreichten damit nie ein anderes Gerät (Planer → Lieferant funktionierte nicht). Jetzt spiegelt `gema_notify.js` jede Notifikation best-effort als eigene Cloud-Row via `gema_sync.js` (moduleKey `notify`, prefix `notif:`): `push()` → `saveRecord`, `markRead`/`markAllRead` → Update, `remove`/`clearForCurrentUser` → `deleteRecord` (nur bei persönlich adressierten — Rollen-/Org-Notifikationen haben mehrere Empfänger und werden nur lokal entfernt). Merge-Pull beim Seitenstart (2.5s verzögert), alle 60s und bei Tab-Fokus (`visibilitychange`); beim Merge gewinnt der Gelesen-Status. Ohne `gema_sync.js`/Cloud funktioniert alles lokal weiter. Demo-Seeds bleiben lokal (kein Cloud-Push).

**Matching-Regel (KRITISCH seit Cloud-Sync):** Sind `empfaengerRoleId` UND `empfaengerOrgId` gesetzt, müssen BEIDE passen (früher ODER — damit hätte z.B. ein `role_magaziner`-Push jeder Org alle Magaziner aller Orgs erreicht, sobald Notifikationen cloud-synced sind).

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

## Cloud-First Storage-Architektur (gema_sync.js)

**Single source of truth ist Supabase.** Pro Datensatz eine eigene Row in `gema_data` mit `data_key='<entity>:<id>'` (z.B. `'user:user_admin'`, `'org:org_default'`, `'tool:wz_42'`). Saves laufen über Diff: nur geänderte Records werden gepusht, nie das ganze Array. localStorage bleibt als sekundärer sync-Cache, wird aber nach jedem Cloud-Bootstrap mit dem Cloud-Stand **überschrieben** (Cloud gewinnt).

### Hintergrund — Bug-Pattern, das damit weg ist

**Vorher** (`saveOrgs` / `saveUsers`): Das gesamte Array wurde als JSON-Blob in eine einzige Supabase-Row mit `merge-duplicates` geschrieben. Folge:
1. **Org-Admin verschwindet am Tag danach**: Gerät A macht User X zum Admin → Cloud aktualisiert. Gerät B mit altem Cache (User X = nicht-Admin) macht eine Mini-Änderung → schreibt das ganze Array zurück → Admin-Status weg.
2. **Alle User plötzlich in Admin-Org**: Bei leerem localStorage schrieb `_initDefaults` `DEFAULT_USERS` (1 User: `admin@gema.ch` mit `orgId='org_default'`) lokal. Wenn vor dem async Cloud-Fetch ein Save lief, ging die Default-Liste in die Cloud → alle echten User weg.

**Jetzt**: per-Record. Gerät A speichert nur `user:userX` mit dem Admin-Flag. Andere User-Records in der Cloud sind unangetastet. Gerät B mit altem Cache hat User X immer noch nicht-Admin lokal — aber beim nächsten Bootstrap überschreibt der Cloud-Load den lokalen Cache (Cloud gewinnt). User-X-Admin bleibt.

### gema_sync.js — Public API

```javascript
GemaSync.isOnline()       // true wenn navigator.onLine UND letzte Cloud-Antwort ok
GemaSync.isReachable()    // letzte Cloud-Erreichbarkeit (ohne navigator.onLine-Check)
GemaSync.probe()          // aktiv probieren — Promise<bool>
GemaSync.onConnectivityChange(cb)

// Per-Record-Primitive
GemaSync.loadCollection(moduleKey, prefix)      // Promise<Array<{key,data,lm}>>
GemaSync.loadRecord(moduleKey, dataKey)         // Promise<{key,data,lm} | null>
GemaSync.saveRecord(moduleKey, dataKey, data)   // Promise<{ok,lm}>
GemaSync.saveRecords(moduleKey, [{key,data},..])// Batch-Upsert in einer POST
GemaSync.deleteRecord(moduleKey, dataKey)       // Hard-Delete
GemaSync.diffArrays(oldArr, newArr, idField)    // {toUpsert, toDelete}
GemaSync.saveDiff(moduleKey, prefix, oldArr, newArr, idField)  // High-Level

// Wiederverwendbarer Modul-Helper
GemaSync.bindCollection(moduleKey, storageKey, prefix, idField)
   // Beim Bootstrap: Cloud-Records laden, in localStorage[storageKey] cachen.
   // Migriert alte Blob-Row automatisch (User-Wahl: ohne Backup).
GemaSync.persistCollection(moduleKey, storageKey, prefix, idField, newArr)
   // Bei jedem Save: Diff zum Cache (getCached) → nur geänderte Records pushen.
   // Wenn offline: Reject, kein Save.
GemaSync.getCached(storageKey)
   // KANONISCHER Lese-Pfad fuer Collection-Caches: localStorage zuerst
   // (Cross-Tab-frisch), In-Memory-Spiegel als Fallback (greift, wenn der
   // localStorage-Write am Quota gescheitert ist — _writeCache entfernt den
   // Eintrag dann). Liefert immer ein Array.
```

**KONVENTION (KRITISCH): Module lesen Cloud-Collections NIE direkt via `localStorage.getItem`, sondern immer über `GemaSync.getCached(storageKey)`** (mit localStorage-Fallback nur fuer den Fall `GemaSync` nicht geladen). Hintergrund: Auf iOS-Safari ist das localStorage-Quota streng; bildlastige Collections (Dach-/Schadensberichte, Werkzeug-Kaufbelege) lassen den Cache-Write scheitern → direkter localStorage-Read liefert dann veraltete/leere Daten, obwohl die Cloud frisch geladen wurde. Der In-Memory-Spiegel in gema_sync.js haelt immer den zuletzt synchronisierten Cloud-Stand. Umgestellt sind: if_werkzeug, if_fahrzeug, if_trocknung (inkl. GemaTrocknung-API + Schadensprojekt-Picker), sd_schadensbericht, sp_dachbericht, gema_aktivitaetslog. gema_objekte_api/gema_produktkatalog_api konsumieren die bindCollection-Return-Arrays direkt (gleichwertig). gema_auth.js hat einen eigenen In-Memory-Spiegel (`_memCache` fuer Orgs/Users/Rollen).

Beim Verbindungsverlust erscheint ein orange Banner oben (`#gema-sync-offline-banner`). Sobald Cloud wieder erreichbar, verschwindet es.

### Bootstrap — Cloud-First mit Migration + Stale-while-revalidate

**KRITISCH — Render-Reihenfolge (kein „leerer Bestand"-Flash):** Module rendern im `DOMContentLoaded` **SOFORT aus dem lokalen Cache** und aktualisieren erst danach mit dem Cloud-Stand. Nicht auf den Cloud-Pull warten, bevor irgendetwas erscheint — sonst sieht der Nutzer ~2s lang einen scheinbar leeren Bestand, der dann „aufploppt".
```js
// 1) Sofort aus Cache rendern (instant)
try { load(); renderList(); } catch(e){}
// 2) Cloud-Pull (blockiert die Anzeige NICHT)
if (window.GemaSync) await Promise.race([ bindCollection(...), timeout ]);
_xxCloudLoaded = true;          // Flag steuert die Ladeanzeige
// 3) Mit frischen Daten neu rendern
load(); renderList();
```
**Ladeanzeige-Flag** (`_xxCloudLoaded`, default false → true nach dem ersten Pull): In der Render-Funktion wird der „keine Daten"-Empty-State NUR gezeigt, wenn `_xxCloudLoaded` true ist. Solange der erste Cloud-Pull bei **leerem Cache** läuft (`!loaded && !data.length`), erscheint stattdessen eine Ladeanzeige (selbst-animierter Inline-SVG-Spinner via SMIL `<animateTransform>`, kein CSS nötig) — sonst wirkt es fälschlich wie ein leerer Bestand. Bei vorhandenem Cache (Normalfall für wiederkehrende Nutzer) rendert die Seite die zuletzt bekannten Daten ohne Spinner.

Umgesetzt in: `if_werkzeug`, `if_fahrzeug`, `if_trocknung`, `sd_schadensbericht`, `sp_dachbericht`, `pm_objekte` (`_objCloudLoaded`, Cache-Read vor `await load()`), `sys_produktkatalog` (`_pkCloudLoaded`, Flag via `gema-produkte-loaded`-Event + 6s-Fallback). Module mit IIFE-Bootstrap und `await` ganz oben (`if_fahrzeug`) wurden auf einen nicht-blockierenden `_xxCloudPromise` umgestellt, der nach dem Sofort-Render `.then()` neu rendert.

`bindCollection` macht:
1. Lädt alle Records mit Prefix aus Cloud
2. Falls 0 Records: prüft ob die alte Blob-Row noch da ist und splittet sie auf — User-Wahl „Auto-Migration ohne Backup": alte Row wird nach Aufsplittung gelöscht
3. Legt offene Outbox-Operationen über den Cloud-Stand (`_outboxApplyTo`) und schreibt das resultierende Array in `localStorage[storageKey]` als sync-Cache

### Save — per-Record-Diff (local-first + Outbox, verlustfrei)

Jedes Modul ersetzt die alte `_xxWriteAllRaw(arr)` durch:
```js
GemaSync.persistCollection(moduleKey, storageKey, prefix, 'id', arr)
  .catch(e => {/* e.queued === true → lokal gesichert, wird nachgeholt */});
```

`persistCollection` vergleicht `arr` mit dem aktuellen Cache → bestimmt geänderte/entfernte Records → pusht nur diese.

**KRITISCH — verlustfreies Speichern (kein Datenverlust mehr, auch nicht bei Offline/413/Timeout/Reload):**
1. **Local-first**: `persistCollection` schreibt den neuen Stand **IMMER zuerst** in den Cache (`_writeCache`), **bevor/unabhängig davon** ob der Cloud-Push klappt. Der neue Stand ist damit sofort dauerhaft (localStorage + In-Memory-Spiegel).
2. **Outbox**: Scheitert der Cloud-Push, werden die betroffenen Records in eine dauerhafte Warteschlange gelegt (`localStorage['gema_sync_outbox_v1']`, In-Memory-Spiegel als Fallback). `persistCollection` rejected dann mit `err.queued === true` — die Daten sind aber sicher.
3. **Automatischer Flush**: Die Outbox wird nachgesendet bei Reconnect (`_setReachable(true)`), beim `visibilitychange`/`pagehide` (keepalive-fetch, überlebt Navigation), periodisch (60s) und beim Seitenstart. Erfolgreich gepushte Records werden aus der Outbox entfernt; ein erfolgreicher Direkt-Push verwirft veraltete Outbox-Einträge desselben Records (kein Überschreiben mit Altstand).
4. **Overlay nach Reload**: `bindCollection` legt offene Outbox-Operationen über den frisch geladenen Cloud-Stand (`_outboxApplyTo`) → lokal gesicherte, noch nicht synchronisierte Einträge bleiben nach einem Reload sichtbar, bis der Flush sie hochlädt.

**Reachability / Offline-Erkennung (Punkt E):** `_lastReachable` wird **nicht** mehr bei jedem einzelnen Fehler auf offline gesetzt. Ein **HTTP 4xx** (ausser 408/429) — typisch **413 Payload zu gross** bei bildlastigen Records — ist KEIN Verbindungsproblem und schaltet NICHT auf offline. Echte Netz-/Server-Fehler (fetch wirft, 5xx, 408, 429) schalten erst nach **zwei Fehlern in Folge** auf offline. Damit erscheint das «Offline»-Banner nicht mehr fälschlich bei bestehendem Internet.

**Public API neu:** `GemaSync.flushOutbox(opts)` (manuell nachsenden), `GemaSync.pendingCount()` (Anzahl offener Operationen).

**Bild-Auslagerung in `sd_schadensbericht` (umgesetzt):** Fotos werden beim Speichern nach `GemaStorage` (Bucket `gema-fotos`) ausgelagert — `_sdUploadFotosToStorage()` läuft VOR `persistCollection` (`sdSave` → `_sdUploadFotosToStorage().then(_sdPersistSchaeden)`), ersetzt `dataUrl`→`url` bei Foto-Objekten und den String bei Messpunkt-Fotos (`m.foto`). Records bleiben dadurch klein → kein 413 / kein localStorage-Quota-Verlust mehr. Best-effort: ohne Bucket bleibt das Base64 erhalten (Fallback). Anzeige via `_sdImgSrc(f)` = `url||dataUrl`. **Exporte:** HTML/Print (`gema_schaden_pdf.js`) + Word nutzen die URL direkt im `<img>`; der **jsPDF-Export** braucht Base64 → `_sdRehydrateFotosForExport(s)` holt ausgelagerte Fotos vor dem Bauen via `fetch`→DataURL in eine temporäre `_sdRehydMap` (Foto-Objekt→DataURL, re-bloatet den Record NICHT). **Setup nötig:** Supabase-Bucket `gema-fotos` public + anon-INSERT-Policy (derselbe wie `sp_dachbericht`).

### Migrierte Module (per-Record in Cloud)

| Modul | moduleKey | data_key-Prefix | localStorage-Cache |
|-------|-----------|-----------------|--------------------|
| Auth-Orgs | `auth` | `org:`  | `gema_orgs_v1`  |
| Auth-Users | `auth` | `user:` | `gema_users_v1` |
| Auth-Roles | `auth` | `role:` | `gema_roles_v1` |
| Werkzeug | `werkzeugmanagement` | `tool:` | `gema_werkzeug` |
| Fahrzeug | `fahrzeugmanagement` | `vehicle:` | `gema_vehicles` |
| Trocknungsgeräte | `trocknungsgeraete` | `device:` | `gema_trocknung_v1` |
| Schadensbericht | `schadensbericht` | `schaden:` | `gema_schadensbericht_v1` |
| Dachbericht | `dachbericht` | `dach:` | `gema_dachbericht_v1` |
| Objekte | `objekte` | `objekt:` | `gema_objpool_v1` |
| Beteiligte | `objekte` | `bet:` | `gema_betpool_v1` |
| Produkte | `produktkatalog` | `produkt:` | `gema_pk_prod_pool_v1` |
| Lieferanten | `produktkatalog` | `lieferant:` | `gema_pk_lief_pool_v1` |
| Offertanfragen | `produktkatalog` | `oa:` | `gema_pk_oa_pool_v1` |

**Produktkatalog (gema_produktkatalog_api.js) — Migration & Besonderheiten:** Produkte/Lieferanten/Offertanfragen liegen jetzt per-Record in der Cloud (vorher: ein Blob pro Key `gema_produktkatalog_v1`/`gema_lieferanten_v1`/`gema_offertanfragen_v1` via `_GemaDB.saveToModule` → Last-Write-Wins, das Produkte konkurrierender Lieferanten überschreiben konnte). Die lokalen Blobs (`{produkte,log}` etc.) bleiben als Lese-Cache, alle bestehenden Getter (`getProdukte`, `getAllLieferanten`, …) laufen unverändert. `loadFromSupabase()` macht jetzt den Per-Record-Pull (mit einmaliger Legacy-Blob-Migration) und feuert `gema-produkte-loaded`; `save()` macht Diff-Saves per `GemaSync.persistCollection`. Neu: **`GemaProdukte.ready`** (Promise, resolved nach dem ersten Cloud-Pull) — Demo-Seeding (`seedDemoData`/`seedDemoLieferanten`) wartet darauf, sonst würden auf frischen Geräten Demo-Daten in die Cloud gepusht. Der `log` in `_data.log` wird nicht mehr cloud-synct (nur lokal). Fallback auf den alten `_GemaDB`-Blob, falls `gema_sync.js` nicht geladen ist.

**Objekte (pm_objekte) — Migration & Besonderheiten:** Objekte/Beteiligte liegen jetzt per-Record in der Cloud (vorher: ein Blob `gema_objekte_v1` mit Last-Write-Wins → Objekte von Kollegen erschienen nie / wurden beim Speichern gegenseitig gelöscht). Die zentrale Sync-Logik steckt komplett in `gema_objekte_api.js`:
- `_pullFromCloud()` lädt bei **jedem** Seitenstart objekte (`objekt:`) + beteiligte (`bet:`) frisch via `GemaSync.bindCollection`, baut daraus den lokalen Blob `gema_objekte_v1` (unverändertes Schema `{objekte, beteiligte, activeObjektId}`, damit alle bestehenden Leser weiterlaufen) und feuert das Event `gema-objekte-loaded`.
- Legacy-Migration: ist die Per-Record-Cloud leer, wird der alte Blob (Cloud-Row `module_key=objekte,data_key=gema_objekte_v1` ODER localStorage) einmalig aufgesplittet und per-Record hochgeschrieben (idempotent per `id`).
- **`activeObjektId` ist reine Geräte-UI** und wird NUR lokal gehalten (`gema_active_objekt_v1`), nie in die Cloud — sonst überschreibt die Objekt-Auswahl eines Users die der anderen.
- Schreiber: `GemaObjekte.persistBlob(blob)` (voller Stand, mit Löschungen — nur `pm_objekte.html`, der autoritative Editor) bzw. **`GemaObjekte.upsertObjekt(obj)`** (ADD-ONLY, kein Diff/Delete — für Quick-Add aus `sp_dachbericht.html`, `sd_schadensbericht.html`, `sys_workspace.html`; verhindert, dass ein noch nicht fertig geladener lokaler Stand fremde Objekte aus der Cloud löscht).
- Bericht-Module rendern bei `gema-objekte-loaded` neu (sonst bliebe „Objekt nicht gefunden" stehen, bis der Cloud-Pull durch ist).

Module noch nicht migriert (kein akuter Bug, weil keine Multi-Tenant-Pools — Daten pro User oder pro Objekt): pm_terminplan, pm_besprechung, hy_w12, ab_*, sb_*, sa_* — können in Folge-Sessions schrittweise auf den gleichen Pattern umgestellt werden.

### Login (kein Offline-Fallback)

`GemaAuth.loginAsync(...)` lädt zuerst die User-Collection aus der Cloud. Wenn Cloud unerreichbar → null (kein Login). User-Wahl: GEMA ist online-pflichtig.

### Bootstrap-Defaults (kein Demo-Daten)

`DEFAULT_ORGS` enthält **nur** `org_default` (GEMA-Org), `DEFAULT_USERS` enthält **nur** `admin@gema.ch` (Passwort: `gema2025`). DEFAULTS werden nur lokal beim allerersten Aufruf befüllt — nie nach Cloud gepusht. Sobald die Cloud antwortet, gewinnt sie und überschreibt den lokalen Cache.

### Backup-Snapshots (entfallen)

Die alten stündlichen `auth_bak`-Backups waren ein Notnagel für den jetzt behobenen Last-Write-Wins-Bug. `GemaAuth.listBackups()` und `GemaAuth.restoreFromBackup()` geben jetzt leere Stubs zurück. `GemaAuth.restoreFromCloud()` löst manuell ein Bootstrap aus.

---

## PWA & Service-Worker

`manifest.json` + `sw.js` — GEMA ist eine installierbare Progressive Web App. Service-Worker cached die wichtigsten HTML-Module und Assets (`/icon-192.svg`, `/icon-512.svg`, `/manifest.json`) für Offline-Erstaufruf. Beim Update einer Seite muss der Cache invalidiert werden — bei Bedarf SW-Version in `sw.js` hochziehen.

### Install-Helper (`gema_pwa.js`)

Globaler Singleton, der den `beforeinstallprompt`-Event abfängt (das Browser-Event feuert nur einmal — wir halten es im Speicher, damit der User die Installation jederzeit auslösen kann).

```javascript
GemaPWA.isInstalled()  // matchMedia('(display-mode:standalone)') oder iOS-standalone
GemaPWA.canPrompt()    // Browser hat einen Prompt geliefert
GemaPWA.isIOS()        // true → manueller Pfad „Teilen → Zum Home-Bildschirm"
GemaPWA.getStatus()    // 'installed' | 'ready' | 'manual_ios' | 'unavailable'
GemaPWA.install()      // Promise<{outcome: 'accepted'|'dismissed'|'unavailable'|'installed'}>
GemaPWA.onChange(fn)   // Listener bei Status-Wechsel
```

UI-Anbindung:
- **`sys_profil.html` → Karte „📱 Allgemein"**: Zentraler Install-Button mit Status-Anzeige (auch iOS-Anleitung). Ist jederzeit erreichbar — auch nachdem ein Banner abgewiesen wurde.
- **`sys_workspace.html` → Einstellungen**: gleiche Karte, damit Workspace-User ohne Umweg über das Profil installieren können.
- **`index.html`-Banner**: Kurz-Shortcut — verwendet denselben Helper, kann via „Später" dauerhaft via `gema_pwa_dismissed`-Flag ausgeblendet werden.

---

## Helper-Module Übersicht (gema_*.js)

| Datei | Zweck |
|-------|-------|
| `gema_adresse.js` | Adress-Autocomplete (swisstopo geo.admin.ch). Auto-Init via `data-gema-adresse` + `data-target-strasse/plz/ort/kanton`-Attribute, oder programmatisch via `GemaAdresse.attach(input, opts)` |
| `gema_aktivitaetslog.js` | **Aktivitätenlog** für Infrastruktur-Module. `GemaActivityLog.log({modul,modulRecordId,modulRecordName,aktion,beschreibung,details})` pusht einen Eintrag; `getForModul(modul, orgId?)` liefert die gefilterte Historie. Cloud-First via `gema_sync.js` (Collection `gema_aktivitaetslog_v1`, moduleKey `aktivitaetslog`, prefix `log:`). `openModal({modul,titel})` zeigt das einheitliche Tabellen-Modal mit Suche, Aktion-Filter und CSV-Export. |
| `gema_anlagenwahl.js` | Anlagenauswahl-Widget für Berechnungen |
| `gema_avatar.js` | Profilbild-Upload + Renderer. `GemaAvatar.render(user, size, opts)` liefert HTML mit `<img>` oder Initialen-Fallback. `compress(file)` resized auf 256×256 JPEG. Avatar als Base64 unter `user.avatar` |
| `gema_armaturen_api.js` | Armaturen-Stammdaten |
| `gema_auth.js` | Auth, Rollen, Orgs, Permissions, Cloud-Recovery |
| `gema_autosave.js` | Auto-Save in Berechnungsmodulen |
| `gema_coachmarks.js` | Onboarding-Touren |
| `gema_db.js` | Legacy Storage-Layer (`_GemaDB`). Cloud-First, aber Blob-pro-Modulkey. Neue Module nutzen stattdessen `gema_sync.js`. |
| `gema_sync.js` | **Cloud-First Per-Record-Sync.** Single source of truth Supabase, eine Row pro Datensatz, Diff-Saves, Offline-Banner. `bindCollection`/`persistCollection` als Modul-Helper. Siehe „Cloud-First Storage-Architektur". |
| `gema_dialog.js` | Eigene Alert/Confirm/Prompt-Dialoge im GEMA-Style. `window.alert` global ueberschrieben. `GemaDialog.confirm({title,message,danger}).then(ok=>…)` und `GemaDialog.prompt(...)` als Promise-API. `window.confirm` bleibt nativ (sync), neue Stellen sollen GemaDialog nutzen |
| `gema_feedback.js` | Feedback-Overlay mit Annotation |
| `gema_lu_api.js` | LU-Zusammenstellung Cross-Modul-API |
| `gema_mobile_menu.js` | Hamburger-Menü auf Mobile |
| `gema_notify.js` | Notifikations-Engine |
| `gema_notify_ui.js` | Glocke + Toast-UI |
| `gema_objekte_api.js` | Objekte/Projekte Cross-Modul-API |
| `gema_offer_request.js` | Externe Offertanfragen |
| `gema_offerten_tab.js` | Offerten-Tab in Berechnungsmodulen |
| `gema_pdf.js` | PDF-Export via html2canvas |
| `gema_schaden_pdf.js` | **Schadensbericht HTML/Print-Export** nach `vorlagen/bericht_wasserschaden_vorlage.html`. `GemaSchadenPDF.exportPrint(schaden, {org,user,objektName,objektAdresse})` öffnet neues Fenster mit A4-Layout (window.print()). Logo-Branch: `org.logo` wenn vorhanden, sonst eingebettetes GEMA-SVG. Filtert `f.imBericht !== false`. |
| `gema_dachbericht_pdf.js` | **Dachbericht HTML/Print-Export** für Spenglerei. `GemaDachberichtPDF.exportPrint(bericht, {org,user,objektName,objektAdresse,templates})` — gleicher Pattern wie Schaden-PDF. Bilder-Grid mit 4/6-Seitenfüllung in 6er-Chunks. |
| `gema_claude.js` | **Claude-API-Client** für Texthilfe. Ruft `/.netlify/functions/claude-rewrite`. Modi: `rewrite`/`bulletpointsToText`/`fix`/`shorten`/`expand`. Eingesetzt in `sp_dachbericht.html` für KI-gestützte Textüberarbeitung. |
| `gema_produktkatalog_api.js` | Produkte + Stammlieferanten + Favoriten |
| `gema_push.js` | Web-Push-Vorbereitung (Service-Worker) |
| `gema_pwa.js` | PWA-Install-Helper (`beforeinstallprompt`-Capture, `GemaPWA.install()`) |
| `gema_qr_scanner.js` | QR-Code-Scanner (`GemaQR.scan(cb)`) |
| `gema_nfc_scanner.js` | Web-NFC-Reader mit automatischem QR-Fallback. `GemaNFC.scan({mode:'auto',onScan})` nutzt `NDEFReader` wenn verfügbar, sonst `GemaQR`. `GemaNFC.parseTgUrl(payload)` extrahiert Geräte-ID aus URL oder Direkt-String. iPhone-Hinweis automatisch eingeblendet (kein Browser-NFC, aber Hintergrund-Scan öffnet URL). |
| `gema_recent.js` | Tracking + Anzeige zuletzt genutzter Module |
| `gema_responsive.css` | Globale Responsive-/Layout-Regeln (Mobile + Tablet) |
| `gema_scroll.js` | Scroll-Position-Restore + globaler Body-Scroll-Lock fuer Modals (`GemaScroll.lock/unlock`, Auto-Hook auf `.modal-bg`) |
| `gema_storage.js` | **Bild-Upload in Supabase Storage** (Bucket `gema-fotos`). `GemaStorage.uploadDataUrl(dataUrl, pathHint)` laedt ein Base64-Bild als Datei hoch, verifiziert die oeffentliche Erreichbarkeit (Image-Load) und liefert `{url, path}`; im Record steht dann nur die URL statt Base64 → kleine Records, keine Request-Groessen-/localStorage-Quota-Probleme. Reject bei fehlendem/falsch konfiguriertem Bucket → Aufrufer faellt auf Base64 zurueck. **Setup (Dashboard, einmalig):** Bucket `gema-fotos` als Public anlegen + INSERT-Policy fuer Rolle `anon`. **Akzeptiert `data:image/*` UND `data:application/pdf`** (PDF-Verifikation via HEAD/Range-fetch statt Image-Load; genutzt fuer Lieferanten-Offerten-PDFs, Pfad `offerten/<lieferantId>`). Eingesetzt in `sp_dachbericht.html`, `sd_schadensbericht.html`, `sys_lieferant_dashboard.html` (Offerten-PDF) und `pm_abnahme.html` (Mangel-Fotos + Plan-Pin-Fotos via `_abUploadFotosToStorage`; Plan-Dateien/PDFs werden NICHT ausgelagert — Helper akzeptiert nur Bilder + Canvas/pdf.js-Kopplung). Bilder werden beim Save nach Storage ausgelagert; Bild-Quelle via `url || dataUrl`, jsPDF-Export rehydriert `url`→DataURL. |
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
16. ☐ Bestätigungs-Dialoge via `GemaDialog.confirm({danger:true}).then(...)` — kein nativer `confirm(...)`?
17. ☐ Eingabe-Dialoge via `GemaDialog.prompt(...)` — kein nativer `prompt(...)`?
18. ☐ `gema_dialog.js` auf der Seite eingebunden?