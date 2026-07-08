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

### Zwei Lieferanten-Typen (KRITISCH)

- **Anlagenlieferant** (`role_lieferant*`): liefert Anlagen für die Berechnungsmodule (Enthärtung, Druckerhöhung, Osmose …) — mit Verifizierungs-Workflow. Dashboard-Tabs: Übersicht, Meine Produkte, Offertanfragen, 🛒 Bestellungen, Rohrsysteme, Werkzeuge, Mitarbeiter, Firmenprofil.
- **Produktlieferant** (`role_produktlieferant_admin/_produkte/_offerten/_intern`): liefert Werkzeuge/Maschinen fürs Werkzeugmanagement — KEINE Verifizierungs-Unterrolle. Dashboard = Werkzeug-Sicht: Übersicht, Meine Produkte (nur Kategorie `werkzeuge` für reine Produktlieferanten), 🔧 Werkzeuge, Mitarbeiter, Firmenprofil (keine Anlagen-Offertanfragen/Rohrsysteme).
- **Leiternprüfer** (`role_leiterpruefer`): EKAS-Leiterprüfungen — erscheint in `openPruefAnfordern` NUR bei `pruefKat='leiterpruefung'` (reiner Leiternprüfer). Kombinierbar mit Produktlieferant-Rollen auf demselben Account. `_wzInvitePruefer` vergibt bei Leiter-Werkzeugen automatisch `role_leiterpruefer` statt `role_pruefer`.
- **Rollen-Checks**: Dashboard-Helper `_liefIsAnlagenLief()`/`_liefIsProduktLief()`; `_liefIsAdmin`/`_liefCanEditProdukte`/`_liefCanOfferten` decken beide Typen ab, `_liefCanVerify` nur Anlagen. Partner-Checks in if_werkzeug (`_wzIsBeauftragt`, cross-org load, Prüf-Dropdown, Supplier-Autocomplete) prüfen BEIDE Prefixe (`role_lieferant`, `role_produktlieferant`) + `role_pruefer`/`role_leiterpruefer`. Mitarbeiter-Einladung im Dashboard startet typ-abhängig (`role_produktlieferant_intern` bzw. `role_lieferant_intern`); Rollen-Zuweisung bietet nur die Rollen des eigenen Typs an (+ Leiternprüfer bei Produktlieferanten).
- **Labels folgen den DEFAULTS**: `_mergeWithDefaults` in gema_auth.js normalisiert Name+Farbe aller `role_(lieferant|produktlieferant|leiterpruefer)*`-Records beim Cloud-Load — Umbenennungen (z.B. «Lieferant» → «Anlagenlieferant») greifen so auch für bestehende Cloud-Installationen, ohne Cloud-Write.
- **Firmen-Kategorie → Mitarbeiter-Rollen (KRITISCH, strikt gekoppelt)**: `KATEGORIE_ROLLEN` in gema_auth.js + `GemaAuth.getAssignableRoleIdsForOrg(orgId)` (null = keine Einschränkung; `role_admin` NIE enthalten — nur Super-Admin vergibt sie). Org-Kategorien der Gruppe Lieferant: `lieferant` («Anlagenlieferant / Hersteller») und `produktlieferant` («Produktlieferant (Werkzeuge)»); dazu `garagist`. Das User-Modal in `sys_admin.html` (`_renderUserRoleCheckboxes`) zeigt NUR die zur gewählten Firma passenden Rollen (Lieferanten-Firma → keine Planer-Rollen und umgekehrt), rendert bei Org-Wechsel im Modal neu; bereits zugewiesene, unpassende Rollen (Altdaten) bleiben sichtbar + abwählbar mit ⚠-Marker — kein stiller Rechteverlust. Migration `gema_auth_orgcats_lieftypen_v1` zieht die neuen Kategorien in bestehende Installationen nach.
- **Dashboard-Transparenz**: `#navFirma` zeigt neben der Firma den erkannten Typ («🏭 Anlagenlieferant», «🔧 Produktlieferant», «🪜 Leiternprüfer», «👁 Admin-Ansicht (alle Tabs)» — ein role_admin-Konto erzwingt IMMER die Voll-Ansicht!) und «🔒 nur Lesen» bei Intern-Rollen. **Robustheit (KRITISCH)**: `setupTabs()` läuft VOR `renderAll()` (Renderer greifen auf Tab-Elemente wie `#oaBadge` zu — beim Produktlieferanten existiert der Offertanfragen-Tab nicht; der ungeguardete Zugriff riss früher das ganze Dashboard ab: keine Tabs, nichts klickbar). `renderAll()` kapselt jeden Sektions-Renderer einzeln in try/catch. Browser-Smoke-Test für die Rollen-Sichten: Playwright-Script (localStorage-Seeding, externe Hosts geblockt) — Muster im Repo-Verlauf (#163).

### Lieferanten-Zugang & Dashboard

- **Eigenes Login**: Jeder Lieferant hat ein eigenes Konto mit Dashboard
- **Produktpflege**: Lieferant erfasst und pflegt seine Produkte selbst
- **Produktkategorien**: Anlagen (Osmose, Enthärtung, Druckerhöhung, Pumpen etc.), Armaturen, Rohre, Zubehör
- **Admin-Zugriff**: GEMA-Admin kann alle Lieferanten-Daten einsehen und Lieferanten deaktivieren (z.B. bei Zahlungsverzug). Deaktivierter Lieferant (`status:'inaktiv'`): alle Schreib-Aktionen im Dashboard sind blockiert (`_liefBlockedInaktiv()`), nicht nur ein Banner — inkl. Mitarbeiter-Einladung, Rollen-Zuweisung und Mitarbeiter-Deaktivierung (Invite-Button wird ausgeblendet).
- **Offertanfragen**: Lieferant sieht eingehende Anfragen aus Berechnungen der Planer
- **User↔Lieferant-Verknüpfung**: `user.lieferantId` verknüpft den eingeloggten Auth-User eindeutig mit dem GemaProdukte-Lieferant-Datensatz. `findMyLieferant()` bevorzugt dieses Feld; die Heuristik (E-Mail/Org/Firma/**Org-Name**, normalisiert case-insensitive) bleibt Fallback und **self-healt** (schreibt `lieferantId` beim ersten Treffer via `GemaAuth.linkUserToLieferant`). **Init wartet auf den Cloud-Pull**: findet der erste (Cache-)Lauf nichts, sucht `init()` nach `GemaProdukte.ready` erneut (Ladehinweis statt sofort «Kein Profil»). **Auto-Provisionierung** (`_liefAutoProvision`): hat der User eine Lieferanten-Rolle (Anlagen ODER Produkt) und existiert auch nach dem Pull kein passender Datensatz, wird das Lieferanten-Profil automatisch aus der eigenen Org angelegt (`createLieferant` mit Org-Name/Adresse, Produktlieferant startet mit `lieferantKategorien:['werkzeuge']`) und verknüpft — Voraussetzung: User ist einer echten Org zugeteilt (nicht `org_default`). `GemaAuth.inviteLieferant(opts)` akzeptiert `opts.lieferantId` und setzt das Feld direkt beim Anlegen (Aufrufer: `_liefInviteUser` im Dashboard, `GemaOfferRequest._submit`). Mitarbeiter-Einladung (`_liefInviteUser`) startet mit `role_lieferant_intern` (Least Privilege — Admin weist Unterrolle zu). Firmenprofil-Edit nur für `_liefIsAdmin()`; Mitarbeiter-Verwaltung nur für Org-Admin **derselben** Lieferanten-Org.
- **Kategorie-IDs (KRITISCH)**: `LIEF_KATEGORIEN` (Firmenprofil-Kategorien) und `KATEGORIEN` (Produkt-Schemas/Matching) nutzen DIESELBEN IDs — `hebeanlage` und `thermische_solaranlage` (nicht mehr `abwasserhebeanlage`/`solaranlage`). Für Altdaten gibt es `GemaProdukte.normKatId(id)` (Alias-Map), genutzt in `getLieferantenByKategorie` und im Kategorien-Filter von `gema_offer_request.js`.

### Armaturen-/Rohr-Katalog (Druckverlust-Daten, gema_armaturen_api.js)

Der **Anlagenlieferant** pflegt im Dashboard-Tab «Rohrsysteme & Armaturen» einen eigenen Armaturen-Katalog für die Druckverlustberechnungen (getrennt vom GemaProdukte-Produktkatalog — hier geht es um Rechenwerte, nicht um Offerten):
- **Datenmodell pro Armatur**: `{id, typ, name, hersteller, serie, lieferantId, status, zeta:{dn:ζ}, kvs:{dn:kvs}, zetaDefault, diagramm:{url|dataUrl,name}}`. **ζ und/oder kvs pro Dimension** — die Berechnung bevorzugt kvs (`Δp = (Q[m³/h]/kvs)²·100` kPa, Datenblatt-üblich), sonst ζ (`Δp = ζ·ρ/2·v²`). DN-Lookup extrahiert die erste Zahl («22x1.2» → 22, «DN 20» → 20).
- **Dashboard-CRUD** (`_armOpen`/`_armSave`/`_armDelete` in sys_lieferant_dashboard.html): Erfassen/Bearbeiten mit Dimensions-Zeilen (DN | ζ | kvs), Diagramm-Upload (Bild → `GemaStorage.uploadDataUrl` Pfad `armaturen/<lieferantId>`, Base64-Fallback), Verifizieren (nur `_liefCanVerify`), Löschen. Rechte via `_liefCanEditProdukte`, `_liefBlockedInaktiv`-Guard.
- **Storage**: per-Record in der Cloud (moduleKey `armaturen`, prefix `arm:`, Pool `gema_armaturen_pool_v1`); der GEMA-Default-Katalog bleibt lokaler Seed (nie auto-gepusht), Pool-Records überschreiben Defaults gleicher id, Default-Löschung via Tombstone `{deleted:true}`.
- **Nutzung in Berechnungen** (`gema_armaturen_picker.js`):
  - **Druckverlust KW (sb_druckverlust.html)**: «🔧 Armaturen & manuell» pro Teilstrecke → Picker mit Katalog + **manuellen Einträgen (Name + Δp kPa)**. ζ-basierte Armaturen fliessen in ζΣ; **kvs-Armaturen + manuelle als direkter `dp_arm`** in `calcRow` (dimensionsabhängig automatisch, folgt der gewählten Dimension). Sektion «📈 Druckverlustdiagramme der gewählten Armaturen» unter der Total-Bar (Upload-Bild bzw. generierte Kennlinie mit Betriebspunkt) — sichtbar im UI und damit **im GemaPDF-Export angehängt** (ausblendbar).
  - **Heizungsleitungen (hz_heizungsleitungen.html)**: 🔧-Button neben «Hersteller [Pa]» je TS → Picker (unit Pa), Summe (kvs+manuell direkt, ζ über v der TS) wird ins bestehende `he`-Feld geschrieben; Auswahl in `r.arm` gespeichert.
  - **Zirkulation (sb_zirkulation.html)**: «🔧 Katalog» neben dem Kvs-Feld → Picker-Modus `kvs-single` (ohne Dimension: pro Armatur DN-kvs-Buttons) schreibt den kvs des Regulierventils in `zk_kvs`.

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

### Modul-Freischaltung pro Kunde (GEPLANT, noch nicht gebaut)

Kunden sollen NICHT alle Module bekommen (v.a. ERP und Stundenerfassung werden zurückgehalten). Heute läuft der Zugriff NUR über globale Rollen-Permissions (`GemaAuth.can` → `role.permissions[modulKey]`) — Rollen sind org-übergreifend, ein per-Kunde-Gating existiert nicht. **Entscheid (User)**: Später kommt eine Modul-Freischaltung pro Organisation (Org-Level-Check zusätzlich zur Rolle, Default = alles frei); das ERP bleibt dabei EIN Modul (kein Tab-Split Offerte/Rechnung). Die Berechnungs-/PM-Module funktionieren eigenständig — Cross-Modul-Verknüpfungen sind defensive Reads (leere Pools → leere Listen) bzw. ADD-ONLY-Writes; einzige harte Basis-Abhängigkeit: `objekte` (Objekt-Bezug von Abnahme, Berechnungen etc.).

### Rollenübersicht

| Rolle | Sicht | Hauptfunktionen |
|-------|-------|----------------|
| **Sanitärplaner** | Vollzugang Berechnungen + PM | Berechnungen erstellen, Projekte verwalten, Ausschreibungen, Offertanfragen |
| **Heizungsplaner** | Vollzugang Berechnungen + PM | Wie Sanitärplaner, Gewerk: HLKK |
| **Lüftungsplaner** | Vollzugang Berechnungen + PM | Wie Sanitärplaner, Gewerk: Lüftung |
| **Elektroplaner** | Vollzugang Berechnungen + PM | Wie Sanitärplaner, Gewerk: Elektro |
| **Spengler** | Dachinspektion + PM + Werkzeug | Erstellt Dachberichte (sp_dachbericht), Zugang zu Objekten + Werkzeug-Read |
| **Abteilungsleiter** | Berechnungen + PM + Werkzeuge | Prüft Berechnungen, sieht alle Projekte der Abteilung, Werkzeug-Leserechte |
| **Unternehmer** | Ausschreibungen + Offerten + Bestellungen | CRBX-Preise ausfüllen (langfristig in GEMA, kurzfristig Datei-Upload), Offertvergleich einsehen; nach Zuschlag Anlagen direkt beim Lieferanten bestellen (pm_bestellungen) |
| **Bauherrschaft** | Projektübersicht + Kosten | Projektstatus, Kostenkontrolle, Terminplan, Freigaben (Read-only) |
| **Architekt** | Projektübersicht + Koordination | Terminplanung, Sitzungsprotokolle, Dokumentation |
| **Behörde** | Bewilligungen + Hygiene | W12-Prüfungen, Bewilligungsstatus, Inspektion (Read-only) |
| **Anlagenlieferant** (`role_lieferant`, Legacy) | Eigenes Dashboard | Liefert Anlagen für Berechnungsmodule (Enthärtung, Druckerhöhung, Osmose …). Vollzugang (Org-Admin-Level): Produktpflege, Verifizierung, Offertanfragen, Werkzeug-Prüfungen quittieren |
| **Anlagenlieferant · Admin** (`role_lieferant_admin`) | Eigenes Dashboard | Wie Anlagenlieferant + vergibt die Unterrollen an Team (Mitarbeiter-Tab) |
| **Anlagenlieferant · Produktpflege** (`role_lieferant_produkte`) | Eigenes Dashboard | NUR Produktdaten erfassen/bearbeiten (kein Verifizieren, keine Offerten) |
| **Anlagenlieferant · Verifizierung** (`role_lieferant_verify`) | Eigenes Dashboard | NUR Produkte verifizieren (Qualitätskontrolle) — gibt es NUR beim Anlagenlieferanten |
| **Anlagenlieferant · Offerten** (`role_lieferant_offerten`) | Eigenes Dashboard | NUR Offertanfragen beantworten/ablehnen |
| **Anlagenlieferant · Intern** (`role_lieferant_intern`) | Eigenes Dashboard | Nur Lesen (Betrachter) |
| **Produktlieferant · Admin** (`role_produktlieferant_admin`) | Eigenes Dashboard (Werkzeug-Sicht) | Liefert Werkzeuge/Maschinen fürs Werkzeugmanagement (KEINE Verifizierung). Admin-Level + vergibt Unterrollen |
| **Produktlieferant · Produktpflege** (`role_produktlieferant_produkte`) | Eigenes Dashboard (Werkzeug-Sicht) | NUR Werkzeug-Produktdaten erfassen/bearbeiten |
| **Produktlieferant · Offerten** (`role_produktlieferant_offerten`) | Eigenes Dashboard (Werkzeug-Sicht) | NUR Werkzeug-Offerten (Defekt/Ersatz) beantworten |
| **Produktlieferant · Intern** (`role_produktlieferant_intern`) | Eigenes Dashboard (Werkzeug-Sicht) | Nur Lesen (Betrachter) |
| **Leiternprüfer** (`role_leiterpruefer`) | Werkzeug-Prüfaufträge | EKAS-Leiterprüfungen quittieren + Prüfberichte hochladen. Kombinierbar mit Produktlieferant-Rollen (derselbe Account liefert Werkzeuge UND prüft Leitern) |
| **Garagist** | Eigenes Konto, externe Werkstatt | Pflegt zugewiesene Fahrzeuge: km-Stand, Service-Historie, MFK, Reifen, Defekte. Sieht Kaufbelege/Tankkarten nicht; Versicherungsdaten nur bei Freigabe pro Fahrzeug. Kein Erfassen neuer Fahrzeuge. |
| **Magaziner** | Werkzeug-/Fahrzeuglager der eigenen Org | Geräte erfassen + verwalten, Berichte schreiben, Personen zuweisen, Prüfungen bei Lieferanten anfordern |
| **Lagerist** (`role_lagerist`) | Wareneingang der eigenen Org | Bestellte Sanitärapparate importieren (HTML/PDF), Wareneingang kontrollieren (Teilmengen/Backorder), Regal-Etiketten drucken. Sieht Projekte (Objekte) zum Zuordnen der Lieferadresse. Zielperson im Alltag laut Handoff ist der Projektleiter — die Planer-Rollen erhalten den Zugriff automatisch über `_allPerms`. |
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

### Ausschreibung & Vergabe (pm_ausschreibungsunterlagen.html) — Workflow-Verdrahtung

Zentrales Modul für den kompletten Ausschreibungs-Workflow (Planer ↔ Unternehmer ↔ Lieferant ↔ Architekt/BH). **Storage: per-Record in der Cloud** (moduleKey `ausschreibung`, 7 Collections — siehe Tabelle «Migrierte Module»: `aus:`/`ausbet:`/`ausanf:`/`ausvrt:`/`ausein:`/`ausna:`/`ausmk:`). Der alte Blob `gema_ausschreibung_v4` bleibt NUR lokal als UI-State-Cache (currentRole/activeAusId/Log/Filter) und einmalige Migrations-Quelle — er wird NICHT mehr per `_GemaDB.put` in die Cloud geschrieben (Last-Write-Wins-Falle). Dazu per-Objekt-BKP `gema_ausschreibung_bkp__<objektId>` (nur noch Fallback: `ldBKP` überschreibt NIE eine Ausschreibung, die bereits Lose trägt) + Vorlagen `gema_ausschreibung_vorlagen_v1`. Hub: `pm_ausschreibung.html` (verlinkt auch `pm_crbx.html`, den eigenständigen SIA-451-Offertvergleich mit eigenem Store `gema_crbx_v1`).

- **Pool-Architektur (KRITISCH)**: `S` hält immer die GESCOPTE Sicht des eingeloggten Users; `_poolMem` die vollen (globalen) Pools. `ld()` scoped via `_scopePools()` (Planer: `a.orgId === user.orgId`, Beteiligte via `ownerOrgId` = Org des erfassenden Planers — NICHT `orgId`, das ist die Org der Partner-Firma; Unternehmer: nur eigene Anfragen/Verteilungen/**Einreichungen** — Preise anderer Bieter bleiben unsichtbar; Lieferant: eigene Netto-Anfragen + aktive Marktplatz-Ausschreibungen; Architekt/BH: nur Ausschreibungen mit Vergabeantrag) und merkt sich die sichtbaren IDs in `S._vis`. `sv()` merged die S-Arrays via `_mergePoolsFromS()` zurück (im Scope fehlende = gelöscht → Cloud-Delete) und pusht debounced (1.2s) via `GemaSync.persistCollection`. **Guard**: `_mergePoolsFromS` läuft erst, wenn `S._vis` gesetzt ist (erstes Pool-Scoping) — sonst überschreibt der Blob-Altstand frisch geladene/migrierte Pool-Records; `ld()` verwirft ein aus dem Blob restauriertes `_vis`. Nach dem Cloud-Pull ruft der Init `switchRole()` erneut auf (Beteiligten-Bindung sah vorher keine Pool-Daten).
- **Migration**: `_ausMigrateLegacyBlob()` splittet den alten Blob einmalig in die Pools (nur wenn Cloud-Pools leer), setzt fehlende `orgId`/`erstelltVonUserId`/`ownerOrgId` auf den migrierenden User und löscht die alte Cloud-Blob-Row. **Demo-Seeds (aus-demo-*, inst-*, lief-*, arch-1, anf-1/2) werden übersprungen und von `_stripDemo()` bei jedem Load gefiltert** — der Produktivbetrieb startet ohne Demo-Daten, das State-Literal ist leer.

- **Rollen-Sichten**: `_mapAuthRoleToCurrent()` mappt GemaAuth-Rollen auf interne Sichten — Planer-Rollen/Admin → `planer`, `role_unternehmer` → `installateur`, `role_lieferant*`/`role_produktlieferant*` (Prefix-Match!) → `lieferant`, `role_architekt`/`role_bauherrschaft` → `architekt`. **KRITISCH — Identitäts-Bindung**: `switchRole()` bindet Unternehmer/Lieferant/Architekt via `_findMyBeteiligter()` an IHREN `S.beteiligte`-Eintrag (userId-Match, Fallback E-Mail-Match mit Self-Healing der `userId`). Eingeloggte User ohne eigenen Eintrag bekommen eine LEERE Sicht — NIE auf den ersten fremden Beteiligten zurückfallen (Datenleck).
- **MODUL_MAP (KRITISCH)**: Mapping `lieferungTyp` → `{modul, label, kategorie, autosaveKey}`. `kategorie` MUSS eine `KATEGORIEN`-ID aus gema_produktkatalog_api.js sein (z.B. `zirkulationspumpe`, nicht `zirkulation`), `autosaveKey` der GemaAutoSave-Modulname (Storage `gema_<autosaveKey>__<objektId>`). Alle 16 Berechnungsmodule mit Anlagenwahl sind gemappt (inkl. hz_/lt_/sb_druckanstieg/sb_fluessiggas). Im BKP-Baum tragen die Lieferung-Positionen (auch HLKK 242/243/244, 342/344) `modulKey`/`modulUrl`; der Planer kann das Mapping pro Position im Lieferung-Dialog überschreiben (`liefChangeModul`).
- **Lieferung-Dialog** (`openLieferungDialog`): zeigt Berechnungs-Stand via `readCalcData()` (liest den echten AutoSave-Key des Moduls, per-Objekt/phase-aware) + beantwortete Offertanfragen des Produktkatalogs — gefiltert auf `oa.projekt.objektId === a.objektId`, Status liegt auf `oa.status` (NICHT `oa.antwort.status`); Antwort-Felder heissen `antwort.bruttoPreis/pdfName/pdfUrl/pdfDataUrl/beantwortetAm`. «Offerte anfragen» läuft über `GemaOfferRequest.open()` (Lieferanten-Auswahl/-Einladung + Notifikation; `gema_offer_request.js` ist eingebunden) und verlinkt die OA via `onSuccess` mit der Position.
- **Vormerkungen**: `beantworteOffertanfrage()` (Produktkatalog) legt pro Objekt eine Vormerkung an; `_renderVormerkungen` in der BKP-Checkliste matcht zuerst über die Modul-Verknüpfung (`lieferungTyp`, Reverse-Map Kategorie→MODUL_MAP-Key), dann über `bkpCode`, und setzt die Offerte automatisch in die Position ein.
- **Brücke Checkliste → Offert-Formular (KRITISCH)**: Die BKP-Checkliste lebt in `a.lose[].positionen`, das Preis-Formular des Unternehmers (`idet`) + Vergleich/Vergabe lesen `a.bkp[].unterpositionen`. `syncBkpFromLose(a)` materialisiert beim Verteilen (`vtl`) und beim Rendern von `idet` die angehakten Positionen ADD-ONLY als Unterpositionen (id `los_<bkp>`).
- **Bestätigungs-Kette + Notifikationen** (alle Links mit Deep-Link `?a=<ausId>`, wird im Init ausgewertet und öffnet rollengerecht pbkp/idet/avga): Interesse-Anfrage → `ausschreibung_einladung` an Unternehmer; Antwort des Unternehmers → `ausschreibung_interesse` an den Absender (`anf.vonUserId`); Verteilen → `ausschreibung_einladung` («Unterlagen erhalten»); Offerte eingereicht → `ausschreibung_offerte_neu` an `a.erstelltVonUserId` (Fallback role_planer + `a.orgId` — Rolle+Org matchen bei GemaNotify BEIDE); CRBX bestätigt → `ausschreibung_crbx_bestaetigt` (Default aus); Vergabeantrag einreichen/genehmigen/ablehnen → `ausschreibung_vergabeantrag` (Empfänger-Auflösung via Objekt-Beteiligte-E-Mail → User, Fallback role_architekt); Zuschlag/Absage → `ausschreibung_vergabe`.
- **Freigabe-Logik**: Nur CRBX-Ausschreibungen brauchen den CRBX-Abgleich (`crbx_geprueft`); funktionale zeigen im Verteilen-Tab stattdessen den Stand der BKP-Checkliste (kein toter Verweis auf den deaktivierten CRBX-Tab).
- **Schnellausschreibung (pm_schnellausschreibung.html)**: eigener per-Record-Pool (`sa:` → `gema_sa_pool_v1`, moduleKey `schnellausschreibung`), Records mit `orgId`/`erstelltVonUserId` + Org-Scoping; einmalige Migration des alten localStorage-Stands. Einladen (`addUN`) und Vergabe (`doVergabe`) pushen `ausschreibung_einladung` bzw. `ausschreibung_vergabe` (Zuschlag + Absagen ohne Preise) an den via E-Mail aufgelösten GEMA-User (`_saFindUser`); Deep-Link `?sa=<id>` öffnet das Detail.

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
| `hz_` | Heizungsberechnungen | `hz_ausdehnungsgefaess.html` |
| `lt_` | Lüftungsberechnungen | `lt_hx_diagramm.html` |
| `br_` | Brandschutz | `br_index.html` |
| `if_` | Infrastruktur (Werkzeug, Fahrzeug, Lager) | `if_werkzeug.html`, `if_fahrzeug.html` |
| `sd_` | Schadensdokumentation | `sd_schadensbericht.html` |
| `sv_` | Service & Wartung | `sv_service.html` |
| `sp_` | Spenglerei | `sp_dachbericht.html` |
| `ab_` | Ausbildung | `ab_index.html` |
| `sys_` | System | `sys_settings.html` |

Hauptseite: `index.html`. Hub-Seiten: `sb_index.html`, `pm_ausschreibung.html`, `ab_index.html`.

### Modulübersicht

- **17 Sanitärberechnungs-Module** (sb_): Inkl. LU-Zusammenstellung, Druckerhöhung, Zirkulationsberechnung, Osmose, Enthärtung etc.

### Zirkulationsberechnung (sb_zirkulation.html)

1:1-Umsetzung der Excel-Vorlage «Zirkulationsberechnung_neu.xlsm» (Teilstrecken-Verfahren, per Playwright-Test auf 4 Nachkommastellen gegen die Original-Excel validiert):
- **Teilstrecken-Netz**: dynamische Tabelle, jede TS mit Länge, bis zu 2 angeschlossenen TS (Baum), Art (`kon.` = VL+RL getrennt / `RaR` = Rohr-an-Rohr), Einbauort (Keller n.b./Räume b./Schacht/ESH kalt → Umgebungstemperatur), ø VL (Aussen-ø für Dämm-Auslegung), DN RL (Rohrtabellen-Lookup), Werkstoff (Kupfer/PE-X/Edelstahl/PVC 16), Dämmstärken auto (MuKEn-Tabelle nach λ ≤/> 0.031) mit «opt.»-Override.
- **Engine** (`zkCalc`): W/m-Verlust über U-Wert-Formel `2π/(ln((r+s)/r)/λ + 1/(8·(r+s)))` mit Norm-ΔT 1000/24 (wie Excel); ΣQ bottom-up übers Netz; Temperaturen top-down (`H`=T_RL Anfang, `I`=Rest-ΔT gegen `tref` 60 °C, `K`=Anteil, `L`=T_Ende); Massenstrom `J=ΣQ/(1.163·I)`; v/R aus den 11 Original-Rohrtabellen (`ZK_PIPES`, Lookup «nächstgrössere Zeile» wie Excel MATCH+1); RaR-Verluste über BM/BN-Tabelle (erste TS temperaturabhängig via AV-Formel → 3 Durchläufe).
- **Strang-Auswertung automatisch**: jede End-TS = ein Strang (Pfad zur Pumpe); Δp = ΣR·l + Einzelwiderstände% + Regulierventil `(m/Kvs)²/1000` + RV; höchster Strang = erforderliche Förderhöhe; Drosselventil-KV je Strang `m·√(1000/Δp_Drossel)` gegen «Förderhöhe Pumpe eff.».
- **Persistenz**: Parameter via GemaAutoSave (`zirkulation`); TS-Zeilen als JSON im hidden `#zk_rows`-Textarea (Restore über autosave-`change`-Event, `_zkInternal`-Guard gegen Loops).
- **Anlagenwahl + Offertanfrage**: `GemaAnlagenwahl.init({kategorie:'zirkulationspumpe'})` — neue Produktkategorie `KATEGORIEN.zirkulationspumpe` (Förderhöhe mbar + Volumenstrom l/h + Medientemp, matchFn) + `LIEF_KATEGORIEN`-Eintrag. Berechnungswerte-Payload: `volumenstrom` (l/h), `foerderhoehe` (mbar), `tempRl`, `waermeverlust` (W) — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `zirkulation`, FILE_MAP `sb_zirkulation`), sb_index (Warmwasser), sw.js.

### Frischwasserstation (sa_frischwasserstation.html)

Komplett NEU nach Excel-Vorlage «Frischwasserstation.xlsm» (ersetzt die alte Berechnung; gleicher Aufbau/Validierungs-Ansatz wie sb_zirkulation, per Playwright gegen die Original-Excel geprüft):
1. **Nutzwarmwasserbedarf** (SIA 385/2): Nutzungseinheiten-Tabelle (`FW_NUTZUNG`, 28 Einträge mit `avg`+`σ` Normliter/d) — `V = n>10 ? avg+2σ/√n : avg+2σ`; Verlustzahl % (aus sb_warmwasser) → Tagesbedarf à 60 °C.
2. **Spitzenvolumenstrom Wohnungsbau**: Duschen/Badewannen je Wohnungstyp, l/min pro Armatur, Druck-Umrechnungshelfer `v·√(p₂/p₁)`, Gleichzeitigkeits-Vorschlag (`FW_GZ`-Stufen nach Anzahl, «Wohnungen 30–35 %») + gewählter Wert; **Mischkreuz** (WW/KW/MW → WW-Anteil `(MW−KW)/(WW−KW)`).
3./4. **Gastroanlage + Spezielle Anlage**: Geräte-Zeilen (Katalog `FW_GERAETE` als datalist, l/min@1.5 bar auto), Checkbox «gleichz.» → gewählter Volumenstrom = Σ markierte (manuelle Gleichzeitigkeit wie Excel).
5. **Statistische Bemessung nach Gauss (Duschprofil)** — Abschnitt 5, per Toggle (`#fwg_on`), nach Vorlage «Warmwasser_FWS_nach_Gauss.xlsx» (Node-Test 29/29 gegen Excel-Cached-Werte + Playwright 19/19; Formelprüfungs-Befunde in `REPORT_FWS_Gauss_Formelpruefung.md`): 1-min-Tagesprofil aus 4 Gauss-Glocken (Morgen/Mittag/Abend/Nacht, editierbar im `<details>`), Duschstarts = normierte Gewichte × Duschvorgänge/Tag (= Personen × 0.69 nach REUWS/WRF; Personen SIA-Normbelegung aus der Whg-Tabelle in Abschnitt 2, die dafür neu die Spalte **Fläche ANF** + Personen-Anzeige trägt — `fwgPersProWhg`, gleiche Formel wie sb_warmwasser), aktive Duschen λ(t) = gleitende Summe über round(Duschdauer 7.7 min), **zirkulär über Mitternacht**; Bemessungs-Duschenzahl = **exaktes Poisson-Quantil** (95/99 % wählbar) — die Excel-IF-Treppen lieferten Quantil+1 und kappten bei 9/10 Duschen (Unterdimensionierung ab ~150 Whg); Select «Quantil + 1 Dusche (wie Vorlage)» ist Default und repliziert die Excel exakt (Beispiel: 35.2 l/min / 110.5 kW). Massgebend = MAX(Quantil; Mindestgleichzeitigkeit Whg/10; Zusatzlasten = Gastro+Spez aus Abschn. 3+4) × Reservefaktor; qWW je Dusche = Mischstrom (Abschn. 2) × Mischkreuz-WW-Anteil. Dazu Primärvolumenstrom (`P·60/(4.186·ΔTprim)`), Pufferspitzen (kWh, 1–60 min), **echter** Intervallvergleich (gleitende Mittelwerte statt der erfundenen Excel-Faktoren 0.98/0.92/0.86) und Canvas-Tagesprofil (Erwartung, Quantil-Stufen, Bemessungslinie). Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block (DOM-frei, Node-testbar). «→ Übernehmen» schreibt qBem in den Override `fw_vGewaehlt` von Abschnitt 6.
6. **Leistung**: `P = ṁ·cp·ΔT` mit Dichte aus `FW_DICHTE` (0–100 °C, floor-LOOKUP), massgebender Volumenstrom = max(berechnet, Override), minus Zirkulationsabzug (`ṁ_zirk·cp·ΔT_zirk`, Warnung T_Zirk < 52 °C).
- Persistenz: Parameter via GemaAutoSave (`frischwasserstation`), die 4 dynamischen Tabellen als JSON im hidden `#fw_rows`-Textarea (Pattern wie `#zk_rows`); die Gauss-Parameter sind statische Inputs (`fwg_*`, von AutoSave erfasst; Quantil/Zuschlag als Selects, damit der Objektwechsel-Clear auf den Default zurückfällt), Whg-Zeilen tragen zusätzlich `anf`.
- Anlagenwahl/Offertanfrage: Kategorie `frischwasserstation` (bestehend), Payload `leistung` (kW netto), `zapfleistung` (l/min — **massgebender** Volumenstrom `vMass` inkl. Override/Gauss; vorher inkonsistent nur das empirische Total), `tagesbedarf`, `wwTemp` — Projektwerte, nie Datenblatt-Werte.

### Warmwasser SIA 385 (sb_warmwasser.html)

Komplett NEU nach Excel-Vorlage «WarmwasserGesamt385_251125_v3.xlsm» (SIA 385/1+2:2025; ersetzt die alte Version; gleicher Aufbau/Validierung wie sb_zirkulation/sa_frischwasserstation — Playwright: Grobauslegung gegen Excel-Cached-Werte, Feinplanung gegen unabhängig berechnete Formelwerte). 4 Tabs:
1. **Grobauslegung**: Nutzungseinheiten (`WW_GROB_NUTZUNG`, 14 SIA-Normwerte l/d) → Tagesbedarf à 60 °C; `Q'W = V·ΔT·cp/3600`; Personenzahl-Rechner `nP = (3.3−2/(1+(ANF/100)³))·nWhg`.
2. **Verlustzahl ϛIS**: Speicherverluste `0.11·√V(+Stutzen)`, Leitungsverluste (konv. 0.12 / RaR+WHB 0.15 kWh/m·d), Hilfsenergie Pumpe `(5+0.16·L)·24·10⁻³` (Grenzwert `8+0.2·L`), WHB `⅔·Q`, WP `2Q/(3·COP)`, Ausstoss (15/20/25 % der Speicherverluste) → `ϛIS = (ΣVerluste+2.5·ΣHilfsenergie)/Q'W·100`, Grenzwert 50 %. **ϛIS = Verlustzahl-Input der Frischwasserstation.**
3. **Feinplanung**: Bedarf mit σ (`WW_FEIN_NUTZUNG` = dieselbe Tabelle wie FWS); **Stundenspitzen** je Zeile mit Profil-Auswahl — Wohnbau per Formel `kWh/d·(0.09+0.66/√n+1.98/n)`, andere fix (`WW_SPITZE_PROFIL`: Hotel 12.5 / Altersheim 19.3 / Spital 14 / Studentenheim 6.6 / Büro 20 / Restaurant 13.5 %) → Σ = Spitzendeckungsvolumen; Wohnungs-/Heizlast-Rechner (`WW_HEIZLAST_TYPEN` W/m², Fläche/0.85); Leitungsverluste je Aussen-ø (`WW_ROHR_FAKTOR`·ΔT — gleiche Faktoren wie Zirkulations-Vordimensionierung); Ausstosswärmeverluste über Entnahme-Matrix (`WW_ENTNAHME`: Kategorie×Ausstosszeit, Wohnungen: Entnahmen = Ø-Belegung·5+2).
4. **Speicher & Leistung**: `QW,gen,out` = Ausstoss+Leitungen+Bedarf+Speicherverluste; Ladezeit bei Vorrangschaltung; Steuervolumen `(V/100)·(100−Spitzenanteil%)/Ladungen`; Bereitschafts-/Speichervolumen ·fsto(1.25); effektives Steuervolumen-Override (aus Speicheroptimierung); Umsatz-Check (>1 sonst «Speicher zu gross»-Warnung).
- Persistenz: AutoSave `warmwasser_sia385` + 4 dynamische Tabellen als JSON im hidden `#ww_rows`-Textarea. Keine Anlagenwahl (wie bisher — keine Speicher-Produktkategorie).

### Druckanstieg bei Temperaturänderung (sb_druckanstieg.html)

1:1-Umsetzung der Excel «SP_Druckanstieg_aufgrund_Volumenänderung» (Blatt Statisch_Dynamisch; per Playwright gegen die Excel-Cached-Werte validiert). Statischer Überdruck in der abgesperrten Trinkwasser-Installation bei Erwärmung — 7 Schritte auf einer Seite (Kaltwasser-Gruppe in sb_index):
1. Vordruck p1 → 2. Höhendruck `pHgeo = 0.0981·hv` → 3. Fülltemperatur/Maximaltemperatur mit Wasser-Dichte-Näherungsfunktion (`SP_DICHTE`: Polynom 5. Grades / (1+b·t); Dichten sind Anzeige, die Rechnung läuft über β) → 4. Volumenausdehnung: Rohr-ø-Select aus `SP_ROHRE` (CNS Nussbaum, di = da−2·Wandstärke), `v0 = (di²·π/4)·l`, `ΔV = v0·β·ΔT` (β editierbar, Default 0.21·10⁻³ 1/K wie Excel) → 5. Druckanstieg: Rohrausdehnung `ΔV_Rohr = v0·3·α·ΔT` (α Default 16.5·10⁻⁶), `Δp = (ΔV_eff/v0)·K` mit Bulkmodul K Default 22000 bar (2.2 GPa) → 6. Gesamtdruck tiefste Stelle `pÜmax = p1+pHgeo+Δp` mit **Warnbox > 10 bar** («Massnahmen treffen») → 7. Ansprechdruck Sicherheitsventil `pSV = (p1+pHgeo)·(1+Schliessdruck)`, Faktor Default 0.3.
- Kernaussage (aus der Excel übernommen, als Hinweis im UI): die Installationslänge ist irrelevant — nur ΔT ist massgebend (ΔV/v0 kürzt das Volumen heraus).
- Persistenz: reine Input-Felder via GemaAutoSave (`druckanstieg`), keine dynamischen Tabellen.
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.sicherheitsventil`** (Ansprechdruck bar + Abblaseleistung + Anschluss; matchFn scored Nähe zum berechneten pSV) + `LIEF_KATEGORIEN`-Eintrag + bkpMap `254.0`. Payload: `ansprechdruck`, `ruhedruck`, `gesamtdruck`, `druckanstieg`, `rohrDa` — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `druckanstieg`, FILE_MAP `sb_druckanstieg`), sb_index (Kaltwasser, «8 Module» + ALL_MODULES), sw.js.

### Ausdehnungsgefäss & Sicherheitsventil (hz_ausdehnungsgefaess.html) — erste Heizungsberechnung

1:1-Umsetzung der Excel «Auslegung_Ausdehnungsgefässe_HE301_01_Var2.xlsm» (SWKI HE301-01, Betriebstemperatur < 100 °C; per Playwright gegen die Excel-Cached-Werte validiert). **Neues Präfix `hz_` (Heizungsberechnungen) + neue Gruppe «Heizung» auf sb_index** (cat-icon.hz/mod.hz orange, eigener Jump-Link).
- **VBA-UDFs der Excel repliziert**: `Dichte_Wasser(t)` (identisches Polynom wie sb_druckanstieg), `X_Zuschlagsfaktor(FN)` (≥150 kW→1.5, ≤10 kW→3.0, sonst `(150−FN)·0.010714+1.5`), `spez_Volumen(Art,ΔT)` dm³/kW (Radiatoren `1200·ΔT⁻¹·⁰⁹`, Flachrohrrad `440·ΔT⁻⁰·⁹⁵`, Heizwände `195·ΔT⁻⁰·⁸`, Konvektoren `400·ΔT⁻⁰·⁹⁷`, FBH `200·ΔT⁻⁰·⁸⁷`, Lüftung `75·ΔT⁻⁰·⁶³`).
- **Ablauf**: p0 = hst/10+Überlagerung, pfin = pSV/1.3 (pSV als Select 3–10 barü — die DGH-Tabelle matcht exakt); Ausdehnungsfaktor je Teil `e = ρmin/ρ(qm)−1` für Wärmeerzeuger, Speicher und **dynamische Heizgruppen-Tabelle** (eff. Wasserinhalt als Override, sonst Abschätzung über spez_Volumen; **Vex der Gruppen nutzt den WE-Zuschlagsfaktor**, wie Excel `$C$32`); `VN,min = Vex,tot·(Pfin+1)/(Pfin−Po)` → Gefässvorschlag aus SU/SD-Reihe (`HE_GEFAESSE` 18–800 l, Typ + Gefässdruck PS z.B. «SU 800.3»), Fülldruck, P·V ≥ 3000-Pflicht-Check; **Sicherheitsventil DGH**: Nennweite aus Abblaseleistungs-Tabelle (`HE_SV`, DN 15–32 je pSV), Schliessdruck/Druckmittelbeiwert/Verdampfungsenthalpie-Polynome, engster Querschnitt d0,ber/d0,eff, theoretische Abblaseleistung.
- Warnungen: pfin ≤ p0 (SV-Druck zu klein für Anlagehöhe), VN,min > 800 l (Parallelgefässe), Leistung über DN-32-Kapazität.
- Persistenz: Parameter via GemaAutoSave (`ausdehnungsgefaess`), Heizgruppen als JSON im hidden `#he_rows`-Textarea (Pattern `#zk_rows`).
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.ausdehnungsgefaess`** (Nennvolumen + zul. Betriebsdruck PS + Bauart, matchFn auf VN ≥ VN,min) + `LIEF_KATEGORIEN` + bkpMap `242.0`. Payload: `vnMin`, `nennvolumen` (Vorschlag), `vordruck`, `enddruck`, `gefaessdruck`, `anlageinhalt`, `ausdehnungsvolumen` — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `ausdehnungsgefaess`, cat **Heizungsberechnungen**, FILE_MAP `hz_ausdehnungsgefaess`), sb_index (Gruppe Heizung), sw.js.
- **Permission-Backfill (KRITISCH, gilt für ALLE neuen Module)**: `_mergeWithDefaults` in gema_auth.js ergänzt bei Rollen mit Default-Pendant **fehlende** Modul-Permission-Keys aus den DEFAULT_ROLES (idempotent, kein Cloud-Write, vorhandene Einträge werden nie überschrieben) — sonst zeigten neue Module bei bestehenden Cloud-Installationen «Kein Zugriff», weil die Cloud-Rolle den neuen Key nicht kennt.

### Dimensionierung Heizungsleitungen (hz_heizungsleitungen.html)

1:1-Umsetzung der Excel «Dimensionierung_Heizungsleitungen.xlsm» (per Playwright gegen die Excel-Cached-Werte des Beispielprojekts validiert). 4 Tabs analog der Blattstruktur:
1. **Strang-Teilstrecken**: Temperaturen VL/RL + Medium-Select (Wasser / Antifrogen N 20/27/34 % — Stoffwerte cp/ρ/ν als Polynome der Mitteltemperatur, `HL_MEDIEN` exakt aus dem Daten-Blatt); dynamische TS-Tabelle (Material Stahl/CNS/Kunststoff → DN-Select aus `HL_ROHRE`; CNS-«DN» = Aussen-ø). Hydraulik je TS: `ṁ = P·3.6/(cp·ΔT)`, v, **R = (Re/10⁵)/(di/1000)·(v²/2)·ρ** — die Excel setzt λ = Re·10⁻⁵ in die Darcy-Formel ein (bewusste Vereinfachung des Erstellers, exakt repliziert); Total = R·L + Hersteller-Pa + Zuschlag·R·L (UI in %, Excel-Bruch); Warnung R > 100 Pa/m rot.
2. **Stränge & Ventile**: Strang = Kommaliste von TS-Nummern → DV/ṁ/P/L-Summen (Excel summiert auch die Massenströme der seriellen TS — repliziert). Grösster Strang = **Referenz**; übrige: Δp Ventil = maxDV − DV, `KV = 0.01·ṁ/√Δp[Pa]` (Formel der propagierten Excel-Zeilen; Zeile 9 hatte eine nicht nachgezogene Alt-Variante — vereinheitlicht), **Einstellung in Umdrehungen** via KV-Tabelle `HL_VENTIL_KV` (0.5–4 Umdr. × DN 10–50; STAD-IMI und Oventrop HydroCom V haben in der Excel identische Tabellen → EIN Abschnitt). Kein Treffer → Badge «DN zu klein».
3. **Verteilleitung**: TS-Tabelle mit bis zu 4 Lasten [W] je Abschnitt (Q = Σ), gleiche Hydraulik.
4. **Heizgruppen & Ergebnis**: Gruppe = Kommaliste von Verteil-TS → Pumpen-Duty (Σ Pa → mbar/kPa; Σ kg/h → l/s / m³/h; Σ W → kW). Massgebende Gruppe (max Δp) in KPIs.
- Persistenz: Parameter via GemaAutoSave (`heizungsleitungen`), die 4 dynamischen Tabellen als EIN JSON (`hlState={ts,str,vts,grp}`) im hidden `#hl_rows`-Textarea.
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.heizungspumpe`** (Förderhöhe kPa + Volumenstrom m³/h + Medientemp, matchFn wie Zirkulationspumpe) + `LIEF_KATEGORIEN` + bkpMap `243.0`. Payload = massgebende Heizgruppe: `foerderhoehe` (kPa), `volumenstrom` (m³/h), `leistung` (kW), `vlTemp` — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `heizungsleitungen`, cat Heizungsberechnungen, FILE_MAP `hz_heizungsleitungen`), sb_index (Heizung, «2 Module»), sw.js.

### Wärmegruppen & Wärmeerzeugerleistung (hz_waermegruppen.html)

1:1-Umsetzung der Excel «Dimensionierung_Waermegruppe_WW_Berechnung_mit_Verlustzuschlag.xlsx» (SIA 384/1+2; per Playwright gegen die Excel-Cached-Werte validiert). 4 Tabs:
1. **Raumliste**: Räume mit Heizlast [W] (inkl. allfälligem Zuschlag direkt erfassen, z.B. `10900·1.15`) + Zuordnung Abgabesystem/Wärmegruppe/Gebäudeteil (Freitext + datalists aus dem Auswahllisten-Blatt).
2. **Wärmegruppen**: pro Zeile eine Gruppe je Abgabesystem — Fläche + Leistung als SUMIFS über die Raumliste (**Matching exakt auf System UND Gruppe UND Gebäudeteil**, Hinweis bei 0 kW); separate Tabelle «Verbundene Systeme» (Lufterhitzer → ΦAS); «Total pro Abgabesystem» dynamisch über alle vorkommenden Systeme (die Excel-Vorlage listete nur 4 fixe — gleiche Formeln, vollständig).
3. **Wassererwärmung**: `Q = m·c·ΔT/3600` (c=4.187), **`P = Q·(1+Verlustzuschlag)/Ladezeit`** → ΦW.
4. **Wärmeerzeuger SIA 384/1**: `Φgen,out = (ΦHL,b − Φg,b) + Φoff + ΦW + ΦAS`; ΦHL,b-Input (0 = auto aus Total Abgabesysteme), Sperrzeit-Input (Excel hardcodierte 6 h) → `Φoff = ΦHL,b·24/(24−toff) − ΦHL,b`; Kontrolle + Differenz.
- Persistenz: AutoSave `waermegruppen` + 4 dynamische Tabellen als EIN JSON (`wgState={raeume,gruppen,verbunden,ww}`) im hidden `#wg_rows`-Textarea.
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.waermeerzeuger`** (Heizleistung kW + Bauart WP/Kessel + COP/max. VL; matchFn auf Heizleistung ≥ Φgen,out, ideal ≤ 1.5×) + `LIEF_KATEGORIEN` + bkpMap `242.0`. Payload: `leistungGenOut`, `heizlast`, `warmwasser`, `sperrzuschlag` — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `waermegruppen`, cat Heizungsberechnungen, FILE_MAP `hz_waermegruppen`), sb_index (Heizung, «3 Module»), sw.js.

### Heizlast aus Jahresenergieverbrauch (hz_heizlast.html)

1:1-Umsetzung der Excel «Heizlastbestimmung V6.1 2023» (Gabathuler; Sanierungs-Tool — Kesselleistung aus Abrechnungsperioden; per Playwright validiert: Zwischenwerte gegen Excel-Cached, Endresultate gegen unabhängige Formelwerte, weil die Beispiel-Cached-Werte #DIV/0! sind). 4 Tabs:
1. **Gebäude & Warmwasser**: Kategorie (Miete/Eigentum/EFH) × Standard → WW-Verbrauch/Person (`HZL_VERBRAUCH` 35–55 dm³/P·d); Bauweise → Cwirk (`HZL_BAUWEISE`); Wohnungstypen-Tabelle: `Pers/WE = 3.3−2/(1+(F/100)³)` (+Override), `kWh/a·P = INT(ROUND(F·(1+z%)·gz·21.226/50))·50` (**Zeile-1-Formel inkl. Gleichzeitigkeitsfaktor für ALLE Zeilen — Excel-Zeilen 2–4 hatten gz vergessen**), QWW, `EBF = Fläche·WE/(ANF/EBF)` + Nebenräume·b-Faktor.
2. **Klima & Verbrauch**: **36 SMA-Klimastationen inline** (`HZL_STATIONEN`: müM, ta, tam, HGT 2011–2022, b/m50/m90); `ta,Geb = ta,St+ROUND(−0.005·Δh)`; `fcor = 1+(9.4−tam)·0.06`; `QH,li = (EFH?16:13+15·Ath/AE)·fcor`; **Perioden-Tabelle**: Tag-im-Jahr → HGT-%-Saisonpolynom (3 Äste, gerundet), QWW-Anteil über Tage, `QH100 = QH/(D%/100)` (Jahreswechsel: +100; >365 d: ·365/Tage); Ø nur über Perioden mit QH100 > 0. Effizienzklasse A+–G (`HZL_EFFKLASSEN`, 100·qh/QH,li).
3. **Heizleistung**: Hauptmethode Hottinger — Methode `A wenn 55·h·müM⁻⁰·³⁸⁵ ≥ qh sonst B`; `A: (qh/(h·müM^0.215))^0.6 · B: 0.4+qh/((5.3·h)+0.035·müM)` W/m²K; ·Faktor Ath/AE ·ΔT → W/m² → kW; WW-Zuschlag (EFH 2 / sonst 3 W/m²); Wiederaufheizfaktor `((24/(24−Sperr))−1)·0.5+1`; **3 Vergleichsmethoden** (Hottinger HGT-korrigiert mit f_HGT-Polynom; Betriebstundenkoeffizient `27·ln(qh)−32` bzw. Höhenvariante; SIA 384/1 b/m50/m90-Werte).
4. **WW-Speicher & Heizkurve**: Speicherauslegung (tz = Cwirk·ΔqRH/spez. Leistung, Ladungen, Steuer-/Spitzen-/Bereitschaftsvolumen ·(1+z%), Boilervorrang-Check) + **neue Betriebstemperaturen nach Sanierung** (Steilheit, log. Übertemperatur, `ÜTneu = (Pneu/Palt)^(1/n)·ÜTalt`, JVL/JRL neu — WP-Tauglichkeit).
- Persistenz: AutoSave `heizlast_verbrauch` + 2 dynamische Tabellen (`hzlState={whg,per}`) im hidden `#zl_rows`; Perioden-Daten als `<input type="date">`.
- Anlagenwahl + Offertanfrage: BESTEHENDE Kategorie `waermeerzeuger` (Payload: `leistungGenOut` = Total Kessel, `heizlast`, `warmwasser`, `qh100` — Projektwerte).
- Registriert in gema_auth (MODULES `heizlast_verbrauch`, FILE_MAP `hz_heizlast`), sb_index (Heizung, «4 Module»), sw.js.

### h,x-Diagramm für feuchte Luft (lt_hx_diagramm.html) — erste Lüftungsberechnung

Mollier-h,x-Diagramm nach der Seven-Air-Vorlage (950 mbar / 540 m ü.M.). **Neues Präfix `lt_` (Lüftungsberechnungen) + neue Gruppe «Lüftung» auf sb_index** (cat-icon.lt/mod.lt sky-blue, Jump-Link). KEIN Excel — Formeln sind Standard-Psychrometrie (per Playwright gegen Tabellen-Referenzwerte + Round-Trips validiert):
- **Formeln**: barometrische Höhenformel `p = 101325·(1−0.0065·H/288.15)^5.255` (540 m → 950 mbar wie PDF-Titel); Magnus (WMO/DIN) `ps = 611.2·e^(17.62t/(243.12+t))` Wasser bzw. `22.46/272.62` Eis; `x = 0.622·pD/(p−pD)`; `h = 1.006·t + x·(2501+1.86·t)`; Taupunkt = inverse Magnus; Feuchtkugel über adiabate Sättigung (Bisektion); ρ feuchte Luft.
- **Luftzustände** (dynamische Tabelle, `#hx_rows`): je Punkt Kombination zweier bekannter Grössen (`t+φ`, `t+x`, `t+h`, `t+Taupunkt`, `t+Feuchtkugel`, `x+φ`, `x+h`, `h+φ`) → ALLE übrigen berechnet (t, φ, x, h, Td, Twb, ρ, pD); Kombis ohne geschlossene Lösung per Bisektion; φ > 100 % = Nebelgebiet rot markiert.
- **Canvas-Diagramm** (kein Library): Isothermen horizontal, φ-Kurven 10–100 % (Sättigungslinie fett), h-Isolinien alle 5 kJ/kg im ungesättigten Bereich, Punkte farbig mit Label, Prozesslinie mit Pfeilen in Tabellenreihenfolge; Achsen auto-erweiternd (Default x 0–20 g/kg, t −15…40 °C).
- **Prozess-Auswertung** (bei Volumenstrom > 0): je Abschnitt `ṁ = V̇·ρ(Start)/3600`, `P = ṁ·Δh` (+ = Heizen), `Wasser = ṁ·Δx·3600` (+ = Befeuchten); KPIs Σ Heiz-/Kühlleistung, Be-/Entfeuchtung.
- Persistenz: AutoSave `hx_diagramm` + Punkte-Tabelle im hidden `#hx_rows`.
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.lueftungsgeraet`** (Monobloc: Volumenstrom, WRG-Typ/Rückwärmzahl, Heiz-/Kühlregister, Befeuchter, SFP; matchFn auf Volumenstrom ≥ Bedarf ideal ≤ 1.6×) + `LIEF_KATEGORIEN` + bkpMap `244.0`. Payload: `volumenstrom`, `heizleistung`, `kuehlleistung`, `befeuchtung`, `hoehe` — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `hx_diagramm`, cat **Lüftungsberechnungen**, FILE_MAP `lt_hx_diagramm`), sb_index (Gruppe Lüftung, Hero 27 Module/6 Kategorien), sw.js.

### Flüssiggas LPG (sb_fluessiggas.html) — erste Gas-Berechnung

1:1-Umsetzung der Excel «12.39_LPGBer.Vorlage_2023.12_V1.2» (Leitfaden L1 03'2024 Arbeitskreis LPG, EKAS 6517, Suva 66060; Node+Playwright gegen unabhängig berechnete Formelwerte validiert — die Vorlage enthält keine Beispieldaten). **Neue Gruppe «Gas» auf sb_index** (User-Wunsch «neuer Titel in den Sanitärberechnungen»; cat-icon.gs/mod.gs violett #7c3aed, Jump-Link 🛢️, Hero 28 Module/7 Kategorien) — Präfix bleibt `sb_`, gema_auth-cat Sanitärberechnungen. 4 Tabs:
1. **Gasgeräte & Massenstrom**: dynamische Geräte-Tabelle — Katalog `GS_GERAETE` (38 Geräte Tab. 13/14 mit **gerundeten** Tabellen-ṁ, Bauart A/B/C/AB/A*) ODER freies Gerät (ṁ = kW/12.87, Hi Propan). Pro Zeile «Teil %?»-Checkbox: Teil-Verbraucher gehen über Diagramm 1 in die Spitzenlast, sonst 100 %-Dauerlast. **Spitzenmassenstrom ṁs**: wie im Excel manuell aus Diagramm 1 abgelesen (Original-Bild eingebettet: `vorlagen/lpg_diagramm1.jpg`) — zusätzlich kalibrierte Log-Log-Näherung als Vorschlag (`gsSpitzeNaeherung`: `u=ln(ṁA/ṁg)/ln(500/ṁg)`, `ṁs=ṁg·(50/ṁg)^(u^1.045)`; Blatt-Beispiel 7.5/1.5→3.75 ✓); Ablese-Input überschreibt. Total = Σ100 % + ṁs.
2. **Rampen-/Tankgrösse**: V1 (eine Rampe für Total; Tab.-15-Lookup `GS_FLASCHEN` 10.5/33-35 kg × Temp −15…+15 °C × Entnahmezeit ½h…dauernd → n = ROUNDUP, Rampe = **2 × n** Betrieb+Reserve); V2 (getrennt Grundlast + Spitze, Summe aufgerundet); V3 (Tank `GS_TANKS` Tab. 17 überflur, **unterflur = 90 %**, Check `Unterflur/Total < 1 → «ist zu klein!»` wie Excel). «Meine Behälterwahl» (V1/2/3) steuert die Wechsel-Rechnung.
3. **Jahresverbrauch**: Geräte-Zeilen gespiegelt aus Tab ① — Katalog-Zeilen mit Haken «über Tab. 16» zählen NICHT (Doppelzählungs-Schutz), **freie Zeilen zählen immer** (wie Excel); kg/a = Anzahl·ṁ·h/d·d/a. + Tab.-16-Block (`GS_TAB16` kg pro Person/Jahr × Personen). Behälterwechsel/Jahr = ROUNDUP(Total/(n·Flascheninhalt)) bzw. Tankbefüllungen = ROUNDUP(Total/Füllmenge 700–12'700 kg).
4. **Frischluftöffnungen**: Raum/Standort-Blöcke (dynamisch) mit Geräte-Zeilen (Bauart je Zeile, «eingerechnet»-Toggle nur Bauart A). Raum-Modus: A → «Bitte Tabelle 20 beachten» (Tab. 20 als Info-Tabelle im UI); B → ΣkW·10 cm²; C → (ΣkW·2+100)·0.4 cm²; immer obere+untere Öffnung, mind. 100 cm².
- Persistenz: Parameter via GemaAutoSave (`fluessiggas`), Geräte+Räume als EIN JSON (`gsState={ger,fr}`) im hidden `#gs_rows`-Textarea.
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.fluessiggasanlage`** (Flaschenrampe/Tank/Verdampfer; Verdampfungsleistung kg/h Pflicht, matchFn ≥ Total-Massenstrom ideal ≤ 2×) + `LIEF_KATEGORIEN` + bkpMap `252.0`. Payload: `totalMassenstrom`, `grundlast`, `spitzenmassenstrom`, `jahresverbrauch` — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `fluessiggas`, cat Sanitärberechnungen, FILE_MAP `sb_fluessiggas`), sb_index (**neue Gruppe Gas**), sw.js.

### Druckverlust Erdgas (sb_druckverlust_erdgas.html) — zweite Gas-Berechnung

1:1-Umsetzung der Excel «Druckverlustberechnung Erdgas» Vers. 3 (E. Hähni, 1997/2016; RC4-verschlüsselte .xls — Formeln aus BIFF-Shared-Formulas + VBA-Modulen extrahiert; Node-Test validiert die Engine gegen die Excel-Cached-Werte des Beispiels «Aufgabe Schule» auf < 1e-9 relativ). 4 Tabs:
1. **Grundlagen & Vordimensionierung**: Gasdaten (HiB/Wsn/Temperatur/Drücke informativ; Rechnung läuft über ρ Default 0.75 kg/m³ und ν Default 11.41237·10⁻⁶ m²/s — in der Excel eine editierbare Konstante, KEINE Formel), Druckvorgaben (max. zul. Δp, Zähler-Δp), Vordimensionierung `d = [0.04·V̇²·ρ·L·(1+EW%) / (1.624·10⁻⁶·(Δpmax−ΔpZähler))]^(1/5)` mm + nächstgrössere Dimension je Material.
2. **Teilstrecken & Druckverlust**: dynamische TS-Tabelle — V̇A + V̇K → V̇A max; Material/Dimension aus `EG_ROHRE` (T_Dimensionen: Stahl verzinkt k=0.15, Cu/CrNi k=0.0015, PE S5/S8 k=0.25, Guss DN40–65 k=0.03 / ab DN80 k=0.01 mm — Rauhigkeit pro Dimension); `v = V̇/3600/(π/4·d²)`, `Re = v·d/ν`, **λ nach VBA `Lambdawertberechnung`** (Branch-Reihenfolge exakt: laminar 64/Re bei Re≤2320 → rauh `1/(2·lg(3.71·d/k))²` bei Re·k/d>1300 → Übergang `0.0055·(1+(20000·k/d+10⁶/Re)^⅓)` bei 65≤Re·k/d≤1300 → Blasius `0.3164/Re^0.25` bei Re<10⁵ → `0.0032+0.221·Re^−0.237` bei Re<10⁶), `R = λ/d·ρ/200·v²` mbar/m, Δpζ, ΔpApp (Zähler als eigene Zeile ohne Dimension), **Δp-Kumulation wie Excel: `P = (ΔpTS==0 ? 0 : Pprev+ΔpTS)`** + expliziter «↺ neuer Strang»-Toggle; KPI max. Δp vs. zulässig mit rot-Warnung.
3. **Spitzenvolumenstrom Haushalt**: Apparate-Katalog (`EG_GERAETE` aus AWerte) → Σ AW + GAW-Stufe (auto = nächsthöhere Stufe zum grössten Einzel-Anschlusswert); **VBA `Spitzenvolumenstrom(GAW, AW)`**: 24 Potenz-Stufen `AW^e·f` (GAW 1.0–10, je AW-Limit), Grösstwerte-Ast `AW^1.0563·0.067774` bei AW>580, Kontrollabfrage cap auf AW. Plus Küchen-Tabelle 3–100 Küchen (nächsthöherer Tabellenwert).
4. **ζ-Werte (Referenz)**: Formstücke + Armaturen aus V_RW (inkl. Gaszähler-Anschluss ζ=2 bis DN25 / ζ=4 ab DN25).
- Persistenz: Parameter via GemaAutoSave (`druckverlust_erdgas`), TS-+Geräte-Zeilen als EIN JSON (`egState={ts,ger}`) im hidden `#eg_rows`-Textarea (Pattern `#gs_rows`).
- Engine im Block `/*ENGINE-START*/…/*ENGINE-END*/` (DOM-frei) — Node-Tests können sie direkt evaluieren.
- KEINE Anlagenwahl/Offertanfrage (kein passendes Produktkatalog-Sortiment — wie sb_warmwasser).
- Registriert in gema_auth (MODULES `druckverlust_erdgas`, FILE_MAP `sb_druckverlust_erdgas`), sb_index (Gruppe Gas, «2 Module», Hero 29 Module), sw.js.

### Druckverlust Medizinalgase (sb_druckverlust_medizinalgas.html) — dritte Gas-Berechnung

1:1-Umsetzung der Excel «Druckverluste_Medizinalgas.xlsm» (openpyxl-Formel-Extraktion + olevba; VBA `Lambdawertberechnung`/`Reynoldszahl`/`Strömungsart` IDENTISCH mit der Erdgas-Vorlage → gleiche λ-Branch-Logik. Node-Test: Stoffwerte gegen Excel-Cached-Werte des Beispiels, Teilstrecken gegen unabhängig berechnete Formelwerte — die Beispiel-TS-Zeilen im xlsm sind leer). 3 Tabs:
1. **Anlagedaten & Stoffwerte**: Medium-Select (`MG_MEDIEN`: Erdgas/Druckluft/Sauerstoff/CO₂/Vacuum/Lachgas/Acetylen mit Rs + η), **Temperatur als Zeilen-Select** (`MG_TEMP`, 97 Zeilen −20…100 °C mit Sättigungsdampfdruck ps — **Excel-Quirk**: T_Medium!B4/C4 VLOOKUPen über die Zeilen-Nr., nicht über °C; der Select bildet die Zeilen-Semantik ab, t+ps kommen immer paarweise aus derselben Zeile), Luftdruck (Default 966 mbar), Überdruck im Rohr (Vakuum = negativ, z.B. −300), Sättigungsgrad %, optional max. zul. Δp. Stoffwerte: `ρN = 101325/Rs/273.15`, `ρB = (Luft+Über−ps·s%)·100/Rs/(t+273.15)`, `ν = η/ρB`.
2. **Teilstrecken & Druckverlust**: `VN = AW·ED%·ϕ%·(1+Z%)` m³N/h → Betriebsvolumenstrom über `VN·(ρN/ρB)`; 14 Rohrmaterial-Tabellen (`MG_ROHRE` aus T_Dimensionen: Cu k=0.01, CrNi k=0.0015, Stahl verzinkt **k=0.8**, Mepla 0.005, PE S8 0.007, Guss DN-abhängig …); v/Re/λ/Strömungsart wie Erdgas; `R = λ/d·ρB/200·v²`; Einzelwiderstände `ζ·ρB/200·v² + äqRL·R` — **äq. Rohrlänge leer → Default l·0.5** (Vorlage `=E·0.5`); + konst. Δp; Δp-Kumulation `S = (R==0 ? 0 : Sprev+R)` + «↺ neuer Strang»-Toggle; KPI gegen max. zul. Δp.
3. **ζ-Werte (Referenz)**: Formstücke + Armaturen der Vorlage.
- Persistenz: Parameter via GemaAutoSave (`druckverlust_medizinalgas`), TS-Zeilen als JSON (`mgState={ts}`) im hidden `#mg_rows`-Textarea; Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block.
- **Persist-Guard (gilt für eg_/mg_)**: Init ruft nach dem Default-Seeding sofort `Persist()` auf und der Restore-Handler fällt bei leerem `ts` auf eine Default-Zeile zurück — sonst friert der AutoSave-Snapshot beim Objektwechsel (läuft VOR der ersten Eingabe) eine leere Tabelle ein.
- KEINE Anlagenwahl/Offertanfrage (wie Erdgas). Registriert in gema_auth (MODULES `druckverlust_medizinalgas`, FILE_MAP `sb_druckverlust_medizinalgas`), sb_index (Gruppe Gas, «3 Module», Hero 30 Module), sw.js (v164).
### VKF-Formulare Sprinkleranlagen (br_vkf_formulare.html + br_vkf_formular.html)

Hub (`br_vkf_formulare.html`) mit 9 Formular-Karten; der Renderer `br_vkf_formular.html?form=<key>` baut die Formulare aus Definitionen (`FORMS`, geteilte Sektions-Templates `S_GEBAEUDE`/`S_KONTAKT`/`S_UNTERSCHRIFT`/`S_VERTEILER` — **identische Feld-IDs über alle Formulare**). AutoSave pro Formular+Objekt (`gema_vkf_<form>__<objektId>[@phase]`). **Vorbefüllung (`runVorbefuellung`, füllt NUR leere Felder, läuft verzögert 600/1800/3500 ms nach dem AutoSave-Restore + bei Objektwahl + via «↻ Aus Objekt übernehmen»-Button):** (1) Objekt-Stammdaten (Name/Strasse/PLZ-Ort/**`o.kanton`**) + Beteiligte (Bauherrschaft→eig, Sanitärplaner→planer, Unternehmer→errichter, Architekt/GP→vert); Objekt-Kanton belegt Behörden-/Inspektions-Kanton vor. (2) **«Allgemeine Daten» als Basis**: leere Felder aus dem Snapshot `gema_vkf_allgemeine_daten__<oid>` desselben Objekts (meta*/unt*/verteiler ausgenommen). (3) User/Org-Defaults: Bearbeiter + Unterschrift-Person = User, Unterschrift-Ort = Org-Adresse, Datum = heute, Fachfirma Planung = eigene Org als Fallback. Kataloge `REF.behoerden`/`REF.fachstellen` haben **genau 1 Eintrag pro Kanton** → `_fillKatalogSelect` wählt automatisch vor und **erhält eine bestehende Auswahl** (der AutoSave-Restore feuert das Kanton-onchange — ohne Erhalt ging die gespeicherte Behörde beim Reload verloren).

### Gaslöschanlagen N2 / Novec 1230 (br_gasloeschung.html) — erste Brandschutz-Berechnung

1:1-Umsetzung der beiden Quick-Tools «N2_300barKDT_Berechnung» und «Novec_1230_Berechnung_CAG» (Ch. Maag, ISO 14520; N2-Formeln aus dem offenen xlsx-Quicktool, Novec-Formeln per BIFF-Parser aus dem xlt extrahiert; Node-Test 45/45 gegen die Excel-Cached-Werte BEIDER Vorlagen). Kategorie **Brandschutz** (br_-Präfix, index.html-Kategorie «Brandschutz & Sprinkler»). 3 Tabs:
1. **Stickstoff N2 300 bar**: Auslegungskonzentration % → `S = 0.79968+0.00293·T`, `Q = ln(100/(100−C))·V/S`, ISO-Höhenkorrektur (>1000 m: `5.3788e-9·h²−1.1975e-4·h+1`); Raumvolumen aus 3 Bereichen (Raum/Kabelboden/Hohldecke) je mit Objekt-Abzug, Volumenbestätigung übersteuerbar; VdS-Zuschlag → Qmin; Flaschen 80 l (24.9 kg) / 140 l (43.5 kg) → `nFl = ROUNDUP(Qmin/Füllung)`, Qg; `Q60 = QgDes·0.95`, Kontrolle Qg ≥ Q60+10 %; **Druckentlastung** `A = 83.53·1.304·(F.F.·Q60)/√P/10000·0.6` mit **Flow-Factor-Kurve** (13 Original-Stützpunkte aus dem Chart-XML, Canvas mit Betriebspunkt, Auto-Interpolation als Vorschlag + Ablese-Override); Düsen-Näherung `ROUNDUP(Fläche/30)` je Bereich (Objekte in voller Raumhöhe reduzieren die Fläche); `O₂ = 20.8·e^(−Q·S/V)` nach 60 s und nach Entleerung (Warnung < 10 %); Nachflutungs-Flaschen.
2. **Novec 1230** (FK-5-1-12, ISO 14520-5): `S = 0.0664+0.000274·T`, `Q = C/(100−C)·V/S`; max. Füllfaktor (Default 0.8 kg/l) + freie Flaschengrösse → nFl, tatsächlicher Füllfaktor (Warnung > max); `O₂ = 20.8·e^(−Qg·S/V)`; **Entlastung** `A = (Qg/10)·S/√P·√((1−c·1.15)+c·14.47)` (Flutung 10 s); **Rohrvolumen-Helfer** (Dampfrohre schwere Baureihe, `V = di²·π/4·L/1000` l) mit Verhältnis Rohrnetz/Flaschenvolumen als Füllfaktor-Abschätzhilfe.
3. **Raumübersicht**: dynamische Projekt-Tabelle (Geschoss/Raum/H/Fläche→Volumen/Löschmittel/Flaschen/Düsen/Entlastung/O₂/…) — Zeilen manuell oder per «⬇ Ergebnis übernehmen» aus Tab ①/② (nach Vorlage «Auslegung_Gaslöschung»).
- **Bewusst NICHT übernommen** (User-Entscheid): die interne Preiskalkulation «Kalkulation_Intern_CAG_Stickstoff» (firmenspezifische Einkaufspreise + Projekt-Checklisten).
- Persistenz: AutoSave `gasloeschung` + dynamische Tabellen (`bgState={ue,rv}`) im hidden `#bg_rows` (Persist-Guard wie eg_/mg_). **Zusätzlich `bgLoadFromSnapshot()`** (500/1500/3500 ms verzögert): liest `bg_rows` DIREKT aus dem AutoSave-Snapshot (`gema_gasloeschung__<oid>[@phase]`), solange der Nutzer nichts geändert hat (`_bgTouched`) — die `_restore`-Event-Kette allein ist timing-anfällig (Event auf dem hidden Textarea kann verloren gehen → Tabellen blieben leer).
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.gasloeschanlage`** (Löschmittel-Select, Flaschengrösse/-anzahl, max. Raumvolumen, VdS/ISO-Flags; matchFn auf Löschmittel + Volumen) + `LIEF_KATEGORIEN` + bkpMap `256.0` (Brandschutz Sanitär) + MODUL_MAP-Eintrag `gasloeschanlage`. Payload: `loeschmittel`, `raumvolumen`, `konzentration`, `gasmenge` (Qg), `flaschen`, `flaschengroesse` — Projektwerte, nie Datenblatt-Werte. Berechnungswerte folgen dem aktiven Tab (N2/Novec).
- Registriert in gema_auth (MODULES `gasloeschung`, cat Brandschutz, FILE_MAP `br_gasloeschung`), index.html (Brandschutz «2 Module»), sw.js (v167). Breadcrumb: «Brandschutz & Sprinkler» ohne sb_index-Link (Nicht-Sanitär-Modul).

- **Projektmanagement-Module** (pm_): Objekte, Terminplanung, Sitzungsprotokolle, Kostenkontrolle, Ausschreibung
- **Hygiene-Module** (hy_): W12 Selbstkontrolle (SVGW)
- **Infrastruktur-Module** (if_): Werkzeugmanagement, Fahrzeugmanagement, Trocknungsgeräte (siehe Abschnitte weiter unten)
- **Schadensdokumentation** (sd_): Schadensberichte (siehe Abschnitt „Schadensdokumentation" weiter unten). Trocknungsgeräte (if_trocknung.html) liefert automatisch Gerätedaten via `GemaTrocknung`-API.
- **Zentrale Module**: `index.html` (Hauptnavigation / Modulübersicht), `pm_objekte.html` (Projektverwaltung)
- **Lieferanten-Modul**: `sys_lieferant_dashboard.html` mit Tabs Übersicht, Produkte, Anfragen, 🛒 Bestellungen, Rohrsysteme, Werkzeuge, Mitarbeiter, Firmenprofil
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

Freistehende numerische Eingabefelder (ausserhalb von Tabellenzellen) tragen IMMER eine angeschlossene Einheits-Box — entweder `.g-inp-group` + `.g-inp` + `.g-inp-unit` (Referenz: sa_enthaertung) oder das `.fg`/`.fg-inp`/`.fg-unit`-Zeilenmuster der neueren Module; die Einheit steht in der Box, nicht im Label. Zentrale Ergebnis-Zeilen tragen `.frml`-Formel-Chips (inline im Label), Teilstrecken-Tabellen eine `.frml-block`-Legende darunter — die Formeln müssen dem Code entsprechen. Sichtbare UI-Texte referenzieren NIE die Excel-Arbeitsvorlagen («Excel-Vorlage», «wie Vorlage», Zellbezüge wie «(AB26)») — fachliche Quellen (Normen, Leitfäden, Hersteller) bleiben; JS-Kommentare mit Zellbezügen sind ok (Entwickler-Nachverfolgbarkeit).

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

**Offerten-Tab (pm_objekte.html):** vierter Tab «📨 Offerten» — zentrales Postfach für alle Offertanfragen/Lieferanten-Offerten der Org (Quelle: `GemaProdukte.getOffertanfragen()`, sichtbar wenn `projekt.objektId` zu einem Org-Objekt gehört oder man selbst Absender ist). Tabelle mit Status, Brutto-Preis, klickbarem Offerten-PDF und Direktlink ins Berechnungsmodul (`OA_KAT_MAP`). **KRITISCH — `OA_KAT_MAP` muss JEDE Anlagenwahl-Kategorie enthalten** (sonst OA ohne Label/Backlink im Postfach); ebenso braucht jeder neue Berechnungswerte-Payload-Key ein Label in `_OA_BW_LABELS` (sys_lieferant_dashboard.html) und jedes Modul mit Anlagenwahl die Einbindung von `gema_offerten_tab.js` (injiziert den 📨-Tab in `.g-page`). Stand: alle 19 Anlagenwahl-Module abgedeckt (Audit-Muster: Kategorien aus `GemaAnlagenwahl.init` gegen KATEGORIEN/MODUL_MAP/OA_KAT_MAP/bkpMap abgleichen). Deep-Link `pm_objekte.html?tab=offerten[&objekt=ID]` — wird von den `offertanfrage_beantwortet`-Notifikationen verwendet. `gema_produktkatalog_api.js` ist dafür in pm_objekte.html eingebunden.

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

### Admin-User-Switcher (Impersonation) — Guard nicht entfernen (KRITISCH)

Das Benutzerwechsel-Dropdown oben rechts (`_injectBadge`/`GemaAuth._switchUser` in gema_auth.js) ist NUR für `role_admin` gedacht. **`_switchUser` hat einen Berechtigungs-Guard** (`_sessionUserIsAdmin() || _adminOriginIsAdmin()`): ohne ihn konnte jeder eingeloggte User per Konsole `GemaAuth._switchUser('<admin-id>')` die Session passwortlos auf einen Admin umschreiben. Der Impersonations-Marker `_gemaAdminOrigin` zählt nur, wenn er auf einen ECHTEN Admin zeigt (sonst wird er abgeräumt); `logout()` löscht ihn. Rückkehr zum Ursprungs-Admin räumt den Marker in `_switchUser` selbst ab (nicht vorher löschen — der Guard braucht ihn für den Rückweg). Grundsatz: Client-seitig ist das Defense-in-Depth — die Session liegt im localStorage und ist von technisch versierten Nutzern fälschbar; echte Autorisierung braucht serverseitige Checks (Supabase RLS), siehe «Modul-Freischaltung pro Kunde».

### Fremde Firma erscheint oben links / im Lieferanten-Dashboard («bwt aqua»-Bug, BEHOBEN)

**Symptom**: Nav-Logo/Brand oben links oder das Lieferanten-Dashboard zeigt eine FREMDE Firma, obwohl der eingeloggte User gar nicht dort Mitglied ist.

**Ursache (zwei Stellen, beide entfernt)**: (1) `gema_auth.js` — `userOrg`/`getCurrentOrg()` hatten einen `||orgs[0]`-Fallback: war die `user.orgId` nicht auflösbar, wurde stillschweigend die ERSTE Org im Pool ins Nav-Branding (`_swapLogo`) gesetzt. (2) `sys_lieferant_dashboard.html` — `findMyLieferant()` fiel bei fehlender Zuordnung blind auf den ersten aktiven Lieferanten zurück (Datenleck: fremde Produkte/Anfragen sichtbar).

**Jetzt**: Ohne auflösbare Org bleibt das GEMA-Logo; ohne Lieferanten-Zuordnung zeigt das Dashboard «Kein Lieferanten-Profil gefunden». GEMA-Admins bekommen eine **explizite Vorschau** mit Firmen-Auswahl (`?lief=<id>`, amber Banner «👁 Admin-Vorschau») statt stillschweigend `all[0]`. **Keine `||orgs[0]` / `all[0]`-Fallbacks wieder einbauen!**

### DM-Sans „l" wird zu dick im PDF-Export (Optical-Sizing)

**Symptom**: Im HTML/Print-PDF (Schaden-/Dachbericht) erscheint das kleine „l" (und ähnliche dünne Glyphen) **fetter/dicker** als der Rest — v.a. in Listen/Fliesstext.

**Ursache**: `gema_schaden_pdf.js` / `gema_dachbericht_pdf.js` setzten im Body `font-optical-sizing:none`. Das zwingt die **DM-Sans-Variable-Font** auf ihre Default-Optical-Size (kräftigere Striche, für Display gedacht) → bei kleinem Fliesstext (10.5pt) wirken die Striche zu schwer.

**Fix**: `font-optical-sizing:auto;font-variation-settings:"opsz" 14;` im Body-CSS (statt `none`). `opsz 14` = Text-Optische-Grösse → saubere, gleichmässige Striche. **In BEIDEN PDF-Helfern gleich halten** (Schaden + Dach), da das Problem in beiden auftritt.

### Orphaned </div>-Tags

Bei Batch-Migrationen können verwaiste `</div>`-Tags entstehen (z.B. wenn `g-ph`-Elemente entfernt werden). Diese verursachen, dass Content ausserhalb des `.g-page`-Containers rendert und die max-width-Begrenzung verliert.

**Prüfung**: Sicherstellen, dass jedes öffnende `<div>` ein schliessendes `</div>` hat und umgekehrt.

### "← Alle Module"-Links

Diese Nav-Links wurden entfernt. Nicht wieder einfügen.

### Sticky-Leisten unter der Nav: Offset IMMER `calc(72px + env(safe-area-inset-top, 0px))`

Die `.g-nav` ist global 72px hoch (gema_responsive.css, `!important`) **plus Safe-Area-Inset** in der installierten PWA. Jede weitere sticky Leiste darunter (Filter-Bar, Suchleiste, Tab-Bars) MUSS ihren `top`-Wert darauf aufbauen — fixe Pixelwerte aus alten Nav-Höhen (56/46px) lassen die Leiste unter der Nav verschwinden bzw. frei über dem Inhalt schweben (Suchleisten-Bug auf index.html). Muster: erste Leiste `top: calc(72px + env(safe-area-inset-top, 0px))`, zweite `calc(72px + <Höhe der ersten> + env(…))`; Sprungziele (`scroll-margin-top`) auf die Stapelhöhe abstimmen. Auf dem Phone (≤640px) ist die index-Suchleiste bewusst `position: static` (scrollt mit, iOS-Muster) — nicht wieder sticky machen, sonst frisst der gepinnte Stapel den halben Screen.

### Nav-Badge zeigt EINE Rolle + «+N»

`_injectBadge` (gema_auth.js) zeigt bei Mehrfach-Rollen nur die erste Rolle plus `+N` (volle Liste im `title`-Tooltip; Mobile-Menü zeigt ebenfalls nur die Hauptrolle). Nicht auf die komma-separierte Vollliste zurückbauen — sie sprengt die Nav auf dem Smartphone. Text-Spalte hat Ellipsis-Caps (Desktop 230px inline, Phone 38vw via gema_responsive.css `!important`).

### Hero-Layout in Modulen: `<div class="hero-title">` statt `<h1>`/`<p>`

`gema_responsive.css` stylt im `@media(max-width:640px)` Block die Hub-Heroes (`.hero:has(> .hero-inner)`, d.h. index.html & Co.) — seit dem Kompakt-Umbau ebenfalls schlank: 16px Padding, `h1` 19px, Eyebrow/Beschreibung/`hero-badges` ausgeblendet, nur Titel + kleine Stats-Zeile (User-Vorgabe «wie die anderen» — kein voller Screen Hero auf dem Phone). Modul-Seiten brauchen einen **kompakten** Hero (14px padding, 17px Titel) mit eigenem Markup.

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

## Legionellen-Management (hy_legionellen.html)

**Heisst im UI «Hygienemanagement»** (User-Vorgabe — Modul-Key/Dateiname bleiben `legionellen`/`hy_legionellen`). Umsetzung der Spez. `GEMAVANILLAREBUILDSPEC.md` (main-Branch; Nachbau von «gema-connect / Hygiene – Water Quality Management») **integriert in die GEMA-Umgebung**: GemaAuth statt eigenem Login (2FA bewusst zurückgestellt), GemaSync-per-Record statt eigener DB/REST, GemaNotify statt eigener Notifications, **externe Partner (Labor/Sanierer) via E-Mail-Match cross-org** (Regierapport-Muster) statt eigener Portale, **Fälligkeits-Scan beim Seitenstart** statt Cron.

- **Hierarchie/Pools (moduleKey `legionellen`)**: Standort `hysite:`→`gema_hy_sites_pool_v1` · Gebäude `hygeb:`→`gema_hy_geb_pool_v1` (optional `siteId`, `objektId`-Verknüpfung zu GEMA-Objekten, Typ + Overrides + Labor-Override) · Raum `hyraum:`→`gema_hy_raum_pool_v1` · Messstelle `hyps:`→`gema_hy_ps_pool_v1` (Medium WARMWASSER/KALTWASSER/ZIRKULATION, Typ inkl. DUSCHE/BADEWANNE-Schlauch-Flag, materialisiertes `interval`+`threshold`, `nextSampleDate`) · Probe `hyprobe:`→`gema_hy_proben_pool_v1` (Status/Messwerte/Sanierung/Log denormalisiert inkl. `psLabelSnapshot`/`laborEmail`).
- **Vererbung (Kap. 11)**: `hyEffektiv(raum,geb,default)` — Raum-Override → Raumkategorie → Gebäude-Override → Gebäudetyp → Firmen-Standard bzw. 1000 KBE/L, mit **Herkunfts-Anzeige** im Messstellen-Formular; am PS materialisiert.
- **Proben-Workflow (Kap. 8)**: SCHEDULED → SAMPLE_TAKEN (Pflicht: Entnahme-Temp + Entnahmeschema) → Einreichen mit 12 Pflichtfeldern (`hyPflichtFehlt`) → **`hyAuswertung`: max(Legionellen-Werte) STRIKT > Grenzwert = POSITIVE** → COMPLETED (negativ, `nextSampleDate` neu) oder PLANER_NOTIFIED (Sanierung). **Proben löscht niemand.** Manuelle Nacherfassung (Kap. 10.4): direkt COMPLETED, **totalLegionella = SUMME der 4 Subspezies**, `nextSampleDate` nur wenn jüngste Probe.
- **Scheduler (Kap. 10.3)**: `hyScanFaellig` beim Seitenstart + nach PS-Save — 30-Tage-Fenster, idempotent über (psId, scheduledDate); Labor-Auflösung Gebäude→Standort→Firmen-Standard (`hyLaborFor`); DUSCHE/BADEWANNE → `hy_schlauchwechsel` an role_monteur (Tages-Lock `gema_hy_notif_lock_v1`).
- **Sanierung (Kap. 9)**: läuft in PLANER_NOTIFIED über Timestamps. planMode/workMode NUR aus Org-Settings (`org.settings.legionellen`, INTERNAL/EXTERNAL); Contractor-Auflösung Gebäude→Standort→Settings (`hyContractorFor`), Snapshot am Sample (`sanPlanerEmail`/`sanTechnikerEmail`). Plan ≥ 10 Zeichen → benachrichtigt sofort Ausführende (keine separate Plan-Freigabe) · Delegation nur solange Schritt offen · Ausführung intern = role_monteur/planer, extern = E-Mail-Match · **Freigabe (Planer-Seite!) mit Pflicht-Nachprobendatum → Eltern COMPLETED + neue Probe SCHEDULED mit `parentSampleId`+`isRetake`** (Labor vom Eltern-Sample). Probenliste blendet Eltern mit Kindern aus (`hyOhneEltern`).
- **UI (Kap. 15)**: Status-/Ergebnis-Badges, Legionellen-Ampel (0 sauber / <100 niedrig / <1000 moderat / ≥1000 hoch), Fälligkeits-Dringlichkeit (überfällig/bald/anstehend/geplant), Medium-Farben, `dd.mm.yyyy`. Views: Übersicht (KPIs) / Portfolio (Baum) / Proben (Filter-Chips) / Sanierung (Schritt-Karten); `#hyTasks` oben = Panels «Meine Labor-Proben» + «Meine Sanierungsaufträge» für externe Partner.
- **Engine im `/*ENGINE-START*/`-Block** (Node-testbar): Referenzdaten, `hyMonate/hyAddMonths/hyNextDate/hyEffektiv/hyAuswertung/hyManuellAuswertung/hyPflichtFehlt/hyAmpel/hyDaysUntil/hyUrgency/hyScanFaellig/hyLaborFor/hyContractorFor/hySanAktiv/hyOhneEltern`.
- Registriert: gema_auth (MODULES `legionellen` cat Hygiene, FILE_MAP `hy_legionellen`; Planer via `_allPerms`, Monteur read+write (Ausführung), Unternehmer read+write (externe Partner), Behörde read), gema_notify (6 `hy_*`-Keys), index.html (ersetzt die deaktivierte «Hygienemanagement»-Platzhalter-Kachel), sw.js.

## Spülmanager (hy_spuelmanager.html) — komplett überarbeitet

Spülregimes mit QR-Start-Timer und lückenloser Doku. **Komplett neu** (der alte Blob-Prototyp `gema_spuel_*` per Objekt wurde ersetzt; keine Migration — Altstand war Prototyp). Drei Typen (`SP_TYPEN`): **Legionellen-Massnahme** (Empfehlung alle 3 Tage, aus dem Hygienemanagement aktivierbar), **Baustelle mit Wasser am Netz** (alle 3 Tage), **Leerstand** (Intervall frei, Vorschlag 7 Tage).

- **Pools (moduleKey `spuelmanager`)**: Spülobjekt `spobj:`→`gema_sp_obj_pool_v1` (`{typ, name, objektId?, intervalTage, spuelDauerSek (Default 180 s), aktiv, quelleText/quelleProbeId, beendetAm?}`) · Spülstelle `spst:`→`gema_sp_stellen_pool_v1` (`{spObjId, name, medium, dauerSek?-Override, letzteSpuelung}`) · Spülvorgang `splog:`→`gema_sp_log_pool_v1` (`{stelleId, gestartetAm/beendetAm, dauerSoll/IstSek, abweichung, viaQr, userName, bemerkung}`).
- **QR pro Spülstelle**: URL `hy_spuelmanager.html?scan=<stelleId>` (qrcodejs-CDN, Etiketten-Druck A6) — Scan öffnet direkt den **Vollbild-Spül-Timer**: Countdown mit Soll-Dauer (`spDauerFor`: Stelle-Override → Objekt → 180 s), bei Ablauf Vibration + «Fertig — dokumentieren»; vorzeitiges Beenden verlangt einen Grund (`abweichung:true`, Badge «verkürzt»). Jeder Vorgang schreibt einen Log-Record + `stelle.letzteSpuelung`.
- **Fälligkeit** (`spStatus`): nie gespült = sofort fällig; sonst letzteSpuelung + intervalTage → ok/faellig/ueberfaellig. Dashboard-KPIs + Liste «Jetzt fällige Spülstellen»; Scan beim Seitenstart pusht `spuel_faellig` an role_monteur (1×/Tag-Lock `gema_sp_notif_lock_v1`). Objekte sind **beendbar/reaktivierbar** (Baustelle übergeben, Wohnung vermietet — Protokoll bleibt).
- **Kopplung Hygienemanagement**: Auf der Sanierungs-Karte in `hy_legionellen.html` gibt es «🚿 Massnahme ‹Spülen› (alle 3 Tage)» (`hySpuelAktivieren`) — legt Spülobjekt (typ legionellen, Herkunft = Befund) + Spülstelle aus der Messstelle DIREKT in die Spülmanager-Pools (gleiche localStorage-Keys + `GemaSync.saveRecord('spuelmanager',…)`), verlinkt `probe.spuelObjId` und benachrichtigt die Monteure (`spuel_aktiviert`). Umgekehrt exponiert der Spülmanager `window.GemaSpuel.aktivierenFuerMassnahme(opts)`.
- **Protokoll**: revisionssicher, CSV-Export; `spCanFlush` = jede eingeloggte Person (Monteur/Hauswart spült), CRUD via `spCanEdit` (Planer/Admin/AL/Magaziner/Unternehmer). Engine (`SP_TYPEN/spStatus/spNextDue/spDauerFor/spMMSS/spAddDays`) im `/*ENGINE-START*/`-Block, Node-testbar.
- Rollen: Monteur/Unternehmer/Magaziner read+write (`spuelmanager`); Event-Keys `spuel_faellig`/`spuel_aktiviert`.

## Service & Wartung mit Anlagenregister (sv_service.html)

Anlagenregister + Wartungsverträge + automatische Serviceaufträge — schliesst den Kreis «Anlage geliefert → Anlage gewartet → Wartung verrechnet». **Neues Präfix `sv_`**, moduleKey `service`, cat Hygiene (Kachel in «Hygiene & Betrieb»; das ältere `hy_inspektion.html` bleibt als einfaches Inventar-Tool unangetastet).

- **Pools (per-Record)**: Anlage `svanl:`→`gema_sv_anlagen_pool_v1` (`{name,kategorie,hersteller,modell,serienNr,standort,objektId/objektName,produktId?,quelleOaId?,lieferantFirma?,inbetriebnahme,garantieBis,intervallMonate,letzteWartung,status,vertragId?,notizen}`) · Vertrag `svvtr:`→`gema_sv_vertraege_pool_v1` (`{titel,kundeText,objektId,anlagenIds[],pauschaleNetto,startDatum,status}`) · Serviceauftrag `svauf:`→`gema_sv_auftraege_pool_v1` (`{anlageId,anlageName,objektId/Name,vertragId?,faelligAm,status offen|eingeplant|erledigt|verrechnet,erledigtAm/Von,rapport,einsatzId?,rechnungId?}`).
- **Engine** (`/*ENGINE-START*/`, Node-testbar): `svAddMonths` (mit Monatsende-Klemme), `svNextWartung` (Basis: letzteWartung → Inbetriebnahme → Erfassungsdatum; ohne Intervall null), `svDaysUntil/svUrgency` (überfällig/≤7 fällig/≤30 bald), `svGarantieAktiv`, **`svScanFaellig`** (Seitenstart-Scan: Anlagen mit Wartung ≤30 Tage → offener Serviceauftrag; idempotent über (anlageId,faelligAm), offener/eingeplanter Auftrag blockiert Duplikate), `svNextReNr` (ERP-Nummernkreis RE-Jahr-NNN repliziert).
- **Import aus Offertanfragen**: «⬇ Aus Offertanfragen» listet beantwortete OAs (`GemaProdukte.getOffertanfragen`) → Anlage mit Produkt/Lieferant/Projekt vorbefüllt (`quelleOaId` verhindert Doppel-Übernahme, Intervall-Default 12 Monate).
- **Cross-Modul-Writes** (ADD-ONLY via `xPoolAdd` — getCached→push→saveRecord mit fremdem moduleKey, nie persistCollection): «📅 Einsatz» schreibt einen Einsatz (`typ:'frei'`, Titel «🛠 Service: …», `serviceAuftragId`) in `gema_einsatz_pool_v1` + `einsatz_geplant` an den Monteur; «💰 Rechnung» erzeugt einen ERP-Rechnungs-Entwurf (`erpdok:` in `gema_erp_dok_pool_v1`, Position mit Rapport-Text, EP 0 zum Ergänzen bzw. Vertragspauschale) und verlinkt `auftrag.rechnungId` (Status `verrechnet`), Dialog bietet Sprung zu `pm_erp.html?doc=…`.
- **Wartung dokumentieren** (`svDokuOpen/svDokuSave`, Rechte `svCanWork` = Edit-Rollen + Monteur/Spengler): Pflicht Datum + Rapport → `anlage.letzteWartung`, Auftrag `erledigt` (ohne offenen Auftrag wird ein erledigter als Doku angelegt), Notify `service_erledigt` an role_planer+Org. **QR pro Anlage** (`?scan=<id>`, qrcodejs, A6-Etikette) öffnet direkt dieses Modal.
- **Fälligkeits-Scan beim Seitenstart** (`svScanUndRender`): legt Aufträge an + `service_faellig` an role_planer+Org (Tages-Lock `gema_sv_notif_lock_v1`).
- Rechte: `svCanEdit` = Planer-Rollen/Admin/AL/Magaziner (CRUD, Verträge, Einsatz, Rechnung); Monteur/Spengler dokumentieren Wartungen. Registriert: gema_auth (MODULES `service` cat Hygiene, FILE_MAP `sv_service`, Monteur/Magaziner rw), gema_notify (`service_faellig`/`service_erledigt`), index.html (Hygiene & Betrieb, 6 Module), sw.js.

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
| `bildUrl` | Produktbild-URL aus dem Lieferanten-Katalog (GemaStorage-URL oder Base64). Karte/Detail-Modal zeigen das Bild statt des Kategorie-Emojis |
| `katalogProduktId` | Verknüpfung zum GemaProdukte-Katalogprodukt (Kategorie `werkzeuge`) |
| `einbuchung:{status,lieferantId,lieferantFirma,eingebuchtAm,bemerkung,akzeptiertAm?,akzeptiertVon?}` | Direkteinbuchung durch Lieferant (`status`: `vorgeschlagen`→`akzeptiert`; Ablehnung löscht den Datensatz). Siehe «Werkzeug-Produktkatalog & Direkteinbuchung» |

### Werkzeug-Produktkatalog & Direkteinbuchung (Lieferant)

**Katalog**: `KATEGORIEN.werkzeuge` in `gema_produktkatalog_api.js` — Produkt-Schema für Werkzeuge/Maschinen/Leitern mit `werkzeugKategorie`-Select (Klartext-Labels, Map auf CATS-Keys via `_WZ_PRODKAT_MAP` in if_werkzeug bzw. `_DWZ_WZKAT_MAP` im Dashboard) und **Feldtyp `bild`** (Produktbild). Der Dashboard-Produkteditor (`renderPeFelder`) rendert `typ:'bild'` als Datei-Upload mit Vorschau: `_pePickBild` resized auf max 800px JPEG → `GemaStorage.uploadDataUrl(dataUrl,'produkte/<lieferantId>')` → URL im hidden `data-fid`-Input; Base64-Fallback bei Upload-Fehler. Produktliste im Dashboard zeigt Thumbnail.

**Bild beim Unternehmer**: `_wzGetKatalogEntries()` in if_werkzeug mischt zusätzlich `GemaProdukte.getProdukte('werkzeuge',{nurFreigegeben:true})` ins Autocomplete (`src:'lieferant'`, Hint «🏷 Firma»). Bei Auswahl merkt `_wzApplyKatalogPick(e)` den Pick (`window._wzKatalogPick`), befüllt Lieferant-Feld (+`f_supplierId` via `user.lieferantId`-Match) und `submitForm` mergt `bildUrl` + `katalogProduktId` aufs neue Werkzeug (nur wenn Name/Modell noch zum Pick passen). Karte (`renderCard`), Detail-Modal (`vm_icon`) und Lieferanten-Dashboard zeigen `t.bildUrl` als `<img>` statt Emoji.

**Direkteinbuchung** (Einbuchungsaufwand liegt beim Lieferanten):
1. **Lieferant** → Werkzeuge-Tab → «📥 Bei Kunde einbuchen» (`_dwzOpenEinbuchen`). Kundenkreis = NUR **verknüpfte Auftraggeber** (`_dwzKundenOrgs()`: Orgs mit Werkzeugen, die via `supplierId`/`pruefAnfrage`/`ersatzAnfragen` auf `_dwzMyIds()` zeigen). Produkt aus eigenem Katalog vorausfüllbar (`_dwzEbProduktChanged`: Bezeichnung/Hersteller/Modell/Bild; NIV-Empfehlung → `hasElec`/`elecInterval`, Garantie-Monate → `warranty`).
2. `_dwzEinbuchenSave` erzeugt den Tool-Datensatz mit `orgId=<Kunde>`, `einbuchung:{status:'vorgeschlagen',…}` — Save per `GemaSync.saveRecord` (Einzel-Record, kein persistCollection), `_dwzLog('erfasst')`, Notifikation `werkzeug_einbuchung` an `role_magaziner`+Kunden-Org mit Link `if_werkzeug.html?view=<id>`.
3. **Unternehmer** (Magaziner/Admin) sieht das Werkzeug **im Bestand mit Ausstehend-Banner** (Karte, Tabellen-Pill, Detail-Modal-Box) mit «✓ Akzeptieren / ✕ Ablehnen». Solange `_wzIsPendingEinbuchung(t)` (status `vorgeschlagen`): **Ausleihe + Zuweisung gesperrt** (Buttons ausgeblendet + Hard-Guards in `_wzOpenAusleihe`/`_wzLendToSelf`/`openZuweisung`).
4. `_wzEinbuchungAkzeptieren`: status→`akzeptiert` + `akzeptiertAm/Von`, Log, Notify `werkzeug_einbuchung` (typ `erfolg`) an `einbuchung.lieferantId`. `_wzEinbuchungAblehnen`: GemaDialog.prompt für optionalen Grund, **löscht den Datensatz**, Log `geloescht`, Notify (typ `warnung`, mit Grund) an den Lieferanten. Lieferanten-Dashboard zeigt bei eigenen Werkzeugen den Badge «📥 Einbuchung ausstehend».

`gema_produktkatalog_api.js` ist dafür in `if_werkzeug.html` eingebunden.

### Koffer (Werkzeug-Sets, if_werkzeug.html)

Ein **Koffer** bündelt mehrere Werkzeuge (z.B. Bohrhammer + Akku + Ladegerät) und ist ein **normaler Tool-Datensatz** mit Kategorie `koffer` (`_wzIsKoffer(t)` = `cat==='koffer' || istKoffer===true`) und geordneter Inhaltsliste `kofferInhalt:[toolId,…]`. Dadurch erbt er QR-Code (`?scan=<id>` für den Kofferdeckel), Etikette, Suche und Ausleihe-Historie vom bestehenden System.

- **Erstellen/Bearbeiten — eigener Dialog (`openKofferForm`)**: «🧰 Koffer»-Toolbar-Button (nur Magaziner/Admin) bzw. ✏️ auf der Karte/im Inhalt-Editor. Felder: Bezeichnung*, interne Kennung, **Direkt-Zuteilung** (Person-Select ODER «📍 Platz…»-Freitext; Log + `werkzeug_zuweisung`-Notify wie im Zuweisungs-Dialog, nur bei Änderung), Notizen — **KEIN Kaufdatum/Kategorie-Zwang**. `editTool()` routet Koffer hierher (das grosse Werkzeug-Formular verlangt Kaufdatum und liesse sich für Koffer nicht speichern). Erstellen öffnet anschliessend direkt den Inhalt-Editor.
- **Inhalt/Reihenfolge** (`openKofferInhalt`): Teile hinzufügen per Suche ODER per **📷 QR-Sammelscan / 📡 NFC-Sammelscan** (`_wzKofferScanQR` — Scan-Schleife, Scanner öffnet nach jedem Treffer erneut, beenden via Abbrechen; `_wzKofferScanNFC` — kontinuierlicher NDEFReader-Loop, Android Chrome; Validierung + nicht-blockierendes Feedback-Pill in `_wzKofferAddFromScan`). **Scan-Generation (KRITISCH, `_wzScanGen`/`_wzScanNewSession`)**: JEDER Scan-Start (Koffer-QR/NFC, Sammel-Ausleihe, Prüf-Modal, Kamera-Einzelscan) holt eine neue Generation; Re-Arm-Timeouts und NFC-Handler alter Generationen sind tot. Ohne das lief die Schleife des VORHERIGEN Koffers weiter (setTimeout-Re-Arm bzw. nie entfernter NDEFReader-Listener) — der nächste Scan landete im falschen Koffer. `_wzKofferInhaltClose()` (Schliessen-Button des Inhalt-Editors) beendet die Scan-Session mit. Flankierend räumt `GemaQR.scan()` eine offene Vorgänger-Session immer ab (ein Overlay/eine Kamera) und liefert pro Session höchstens EINEN Decode (html5-qrcode feuert bei fps 10 sonst mehrfach). **NFC-Muster (KRITISCH — Chrome-Hänger auf Android/Samsung)**: NFC-LESEN läuft pro Seite über genau EINEN persistenten `NDEFReader` mit EINEM `scan()`-Aufruf (`_wzNfcListen`; gleiches Muster in `gema_nfc_scanner.js`) — Sessions tauschen nur den aktiven Handler, NIE pro Session einen neuen Reader starten oder per abort() beenden (wiederholte scan()/abort()-Zyklen wedgen den Chrome-NFC-Stack; `NDEFReader` hat auch KEIN `.stop()`). NFC-SCHREIBEN in if_werkzeug läuft als **write-on-detect** (`_wzWriteNFC`/`_wzMakeNFCReadOnly`): Es wird NIE ein write() armiert, das auf einen Tag wartet — der persistente Lese-Reader meldet per reading-Event, WANN ein Tag wirklich anliegt (feuert auch bei gesperrten Tags), erst DANN wird genau EINMAL auf den anwesenden Tag geschrieben (Web-NFC-Muster «write on tap»; Ergebnis ok/gesperrt kommt in ms). Der ewig hängige Schreibauftrag war der Auslöser des Samsung-Freezes: gesperrter/inkompatibler Tag im Feld bei armiertem write() → Redetect-/Retry-Sturm in Chrome. Trägt der Tag bereits die URL dieses Werkzeugs, wird ohne Auto-Sperren gar nicht geschrieben (`write_skip`). Pro Seite max. EINE Schreib-/Sperr-Session: `_wzNfcAbortOp()` beendet sie komplett (AbortController via `_wzNfcCancelWrite` + Timer/Button/Status via cancelFn) und läuft in jedem `_wzScanNewSession`, beim Öffnen/Schliessen des QR-Dialogs und im Freeze-Watchdog; der 📡-Button ist «✕ Abbrechen»-Toggle. Flankierend: EIN wiederverwendeter Writer-Reader (`_wzNfcWriter` — kein Instanz-Churn; nach Sperr-Vorgängen verworfen), **45-s-Timeout** (`window._WZ_NFC_TIMEOUT_MS`, Test-Hook), 5-s-Hinweis «Tag kurz WEGNEHMEN und erneut anhalten» (`_WZ_NFC_HINT_MS` — liegt der Tag SCHON am Gerät, feuert kein neues reading-Event), Abkühlpause zwischen Operationen (`_WZ_NFC_COOLDOWN_MS`), Freeze-Watchdog (1-s-Herzschlag; >4 s Main-Thread-Stillstand → Auto-Abort + Recovery-Anleitung) und ein persistentes **NFC-Ereignis-Log** `gema_wz_nfclog_v1` + Build-Marker `_WZ_NFC_BUILD` (🩺-Diagnose-Panel im QR-Dialog: Umgebung/Berechtigung/Log, «📋 Log kopieren»; ein beim Freeze abgebrochener Vorgang wird beim nächsten Seitenstart erkannt und angezeigt). `if_fahrzeug`/`if_trocknung` schreiben noch im alten Muster (armiertes write() mit Timeout) — bei NFC-Problemen dort auf write-on-detect nachziehen. `NotAllowedError` beim Schreiben heisst meist «Tag ist gesperrt», NICHT «Berechtigung verweigert» — die Meldungen erklären das (gesperrte Tags sind irreversibel nur lesbar; Ausweg bei klemmendem NFC: Android-NFC aus/ein). **Org-Einstellung `org.settings.werkzeug.nfcLockOnWrite`** (⚙️-Werkzeug-Einstellungen, Sektion «NFC-Tags»): kettet nach jedem erfolgreichen write() automatisch `makeReadOnly` an (gleicher AbortController + Timeout deckt beide Phasen, Tag bleibt dafür am Gerät); nur für `_wzCanEdit()`-User wirksam, Teil-Fehler werden als «Geschrieben, aber Sperren fehlgeschlagen» ausgewiesen. Ein Werkzeug kann nur in EINEM Koffer sein (`_wzKofferOf`); entfernen, ↑↓-Reihenfolge. Berechtigung `_wzCanEditKoffer(k)`: Magaziner/Admin ODER der **zugeteilte Monteur** (`zugewiesenAn.userId === me`, typ user) — einzige Ausnahme vom Monteur-Editier-Verbot, nur für SEINE Koffer. **Hinweis**: `gema_qr_scanner.js` exportiert `GemaQR` (Overlay z-index 12000, damit der Scanner ÜBER `_wzShowModal` liegt) — der frühere Aufruf `GemaQRScanner` in der Sammel-Ausleihe war ein toter Verweis (behoben).
- **Ausleihen** (`_wzKofferAusleihe`, Hook in `_wzOpenAusleihe`/`_wzLendToSelf`): Checkliste mit allen Standard-Teilen **vorausgewählt**; bereits einzeln ausgeliehene Teile sind abgewählt+gesperrt («bereits ausgeliehen an X»). Alle angehakten Teile werden mit `ausgeliehenAn={…, viaKoffer:<kofferId>}` an dieselbe Person ausgeliehen. Einzel-Ausleihe von Koffer-Teilen bleibt möglich.
- **Rückgabe** (`_wzKofferRueckgabe`, Hook in `_wzReturnTool`): Vollständigkeitskontrolle — alle via Koffer ausgeliehenen Teile vorausgewählt; **abgewählte (fehlende) Teile bleiben einzeln ausgeliehen** (`viaKoffer` wird entfernt) und der Magaziner bekommt `werkzeug_koffer_fehlteil` (Notify, role+org).
- **Scan-Sektion `#kofCtrlSection` (kontextabhängig, `_wzScanAusleihe` bei `_wzIsKoffer`)**: Scan des Koffer-QR (`?scan=<id>`) öffnet die Scan-Ansicht mit einer Teilliste; `_wzKofferKontrolleSave(kofferId)` verzweigt am **Ausleih-Status des Koffers** (`kofRet = !!koffer.ausgeliehenAn`):
  - **Koffer im Lager → reine Vollständigkeitskontrolle**: listet ALLE `kofferInhalt`-Teile **vorausgewählt** (abwählen = physisch nicht gesehen). Schreibt `koffer.letzteKofferKontrolle = {am,von,vonId,geprueft,fehlend:[{id,name}],vollstaendig}`, loggt (`_wzActLog('pruefung',…)`), meldet Fehlteile an role_magaziner (`werkzeug_koffer_fehlteil`). Ändert KEINEN Ausleih-/Zuweisungs-Status (nur Doku); die letzte Kontrolle erscheint beim nächsten Scan als Hinweis.
  - **Koffer ausgeliehen → Rückgabe & Prüfung**: listet **nur die mit dem Koffer ausgeliehenen Teile** (`ausgeliehenAn.viaKoffer === kofferId`) vorausgewählt (Titel «🧰 Koffer zurückgeben & prüfen», Button «✓ Zurückgeben» nur bei `_wzCanReturnTool`). Bestätigen bucht den Koffer aus (`delete koffer.ausgeliehenAn`), angehakte Teile zurück ins Lager (`delete it.ausgeliehenAn`), **abgewählte (fehlende) bleiben einzeln ausgeliehen** (`delete it.ausgeliehenAn.viaKoffer`), meldet Fehlteile an role_magaziner und benachrichtigt den Ausleiher (`werkzeug_zuweisung`). Gleiche Logik wie `_wzKofferRueckgabe`, nur direkt aus dem Scan.
- `deleteTool` räumt gelöschte IDs aus allen `kofferInhalt`-Listen. Karten zeigen «🧰 N Teile + Inhalt-Button» (Koffer) bzw. «🧰 Im Koffer <Name>» (Teil).

### QR-Code & Etiketten (if_werkzeug.html)

Werkzeug hat **dasselbe Etiketten-System wie das Trocknungs-Modul** (siehe Abschnitt «Etiketten-System (komplett)» unter Trocknungsgeräte für die vollständige Logik) — portiert mit `_wz`-Prefix:
- QR-Dialog mit Umschalter **«QR-Code | Etikette»** (`setQrMode`); `_wzCurrentQRTool` wird in `openQR` gesetzt. QR-URL = `?scan=<id>`.
- Etikette **49×23mm Querformat**, festes Layout (QR rechts über volle Höhe, links Logo oben + interne Bezeichnung darunter). Beschriftung = `internKennung || name`. Logo = `org.logo` (via `GemaAuth.getCurrentOrg()`), sonst GEMA-Fallback, für jsPDF zu PNG gerastert. Helper analog Trocknung: `_wzComputeEtikette`, `_wzDrawEtikette`, `_wzEnsureLabelLogo`, `_wzBuildEtikettePreview`, `_wzFitText`, `_wzGetQrDataUrl`/`_wzRenderQrDataUrl`, jsPDF via `_wzEnsureJsPDF`.
- **Einzel-Export**: `downloadEtikettePDF()` → `Etikette_<slug>.pdf`.
- **Sammelexport (Mehrfachauswahl)**: integriert in den **bestehenden** Bulk-Modus (`_wzToggleBulkMode`, `_wzBulkSelected`). Die Bulk-Leiste (`_wzRenderBulkBar`) hat für **Magaziner/Admin** (`_wzCanBulkLabel()`) zusätzlich **«☑ Alle markieren»** (`_wzBulkSelectAllVisible` — alle aktuell gefilterten via `_wzLastFilteredIds`, toggelt zu «☐ Auswahl aufheben») und **«🏷 Etiketten»** (`_wzExportEtikettenBulk` → ein PDF mit je einer 49×23mm-Seite pro markiertem Werkzeug, `Etiketten_<N>_Stueck.pdf`). Status/Person-zuweisen bleiben wie gehabt für alle Editoren. Manuelle Checkbox-Auswahl pro Werkzeug ist Karten-Ansicht; «Alle markieren» + Export funktionieren filterbasiert auch in der Tabellenansicht.
- **Sammel-Bearbeitung («✏️ Bearbeiten», `_wzBulkEdit`, nur `_wzCanEdit`)**: EIN Dialog für beliebige Kriterien der Auswahl — jede Zeile hat eine «ändern»-Checkbox, NUR angehakte Felder werden angewendet (Kategorie/Hersteller/Modell/Lieferant/Notizen/Zuweisung Person-Platz-Entfernen/Status/Kaufdatum/Garantie/Service-Elektro-Leiter-Prüfung mit Intervall). Vor dem Anwenden fasst `GemaDialog.confirm` alle Änderungen als Liste zusammen. Koffer werden übersprungen (Hinweis im Dialog); Zuweisung überspringt Werkzeuge mit ausstehender Einbuchung, erhält das seit-Datum bei gleichem Hauptnutzer und pusht EINE Sammel-Notifikation («N Werkzeuge zugewiesen») statt einer pro Gerät; pro Werkzeug ein Aktivitätslog-Eintrag. **KRITISCH — `.gema-dlg-bg` z-index 12800**: GemaDialog liegt zuoberst (über `_wzShowModal` 10500, Safe-Area-Streifen 10500, QR-Scanner 12000) — mit dem alten 9500 verschwanden Bestätigungen/Alerts aus dynamischen Modals unsichtbar HINTER dem aufrufenden Dialog.

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

**Etikette (49×23mm)**: Der QR-Dialog (`openFzgQR` → `#fzgQrModal`) hat den Umschalter **«🔲 QR-Code | 🏷 Etikette»** (`setFzgQrMode`) — Port des Etiketten-Systems aus if_trocknung mit `_fzEt*`-/`_fz*`-Helpern (`_fzComputeEtikette`, `_fzDrawEtikette`, `_fzEnsureLabelLogo`, `_fzBuildEtikettePreview`, `downloadFzgEtikettePDF`; inkl. **Logo-Druckoptimierung** `_fzMonochromeForLabel`, siehe Trocknung-Abschnitt). Beschriftung = `Kennzeichen · interne Nr` (Fallback Modell), QR-URL = `?view=<id>` (identisch mit Modal-QR/bestehenden Tags), QR im PDF als Vektor.

**Garage-Einbuchen (Werkstatt-Status)**: `_fzGarageToggle/_fzGarageEinbuchen/_fzGarageAusbuchen` (+ «🏭 Garage»-Button im View-Modal) — Einbuchen setzt den bestehenden Status `service` («Im Service») + `v.garageStatus = {eingebuchtAm, eingebuchtVonName, werkstatt, grund, ausgebuchtAm?}`; Ausbuchen zurück auf `aktiv`. Notifikation `fahrzeug_garage` an `role_magaziner` + Fahrzeug-Org. Gleiche Buttons im Garagisten-Dashboard (`_dashGarageEin/_dashGarageAus`). **KRITISCH — Feld-Trennung**: `v.garage` ist der Garage-NAME (String, aus dem Formular), `v.garageStatus` das Einbuchungs-Objekt. Früher überschrieb das Einbuchen `v.garage` mit dem Objekt (Name weg, «[object Object]» in Listen); alle Schreib-Pfade migrieren Legacy-Objekte in `v.garage` lazy nach `v.garageStatus`, String-Leser sind mit `typeof`-Guards abgesichert.

**Garagenwahl (Formular «Garage / Werkstatt», `fGarage`)**: Das Dropdown zeigt zwei Gruppen — **«🔗 GEMA-Garagen (aktiv)»** (`_fzGemaGaragen()`: alle aktiven `role_garagist`-Accounts GEMA-weit, Label = Werkstatt-Org, bei mehreren Usern derselben Org + Kontaktname; Option-Value `gema:<userId>`) und **«Eigene Garagen (ohne Funktion)»** (org-weite Freitext-Liste aus `org.settings.fahrzeug.garagen` + Namen aus Fahrzeugen). Auswahl einer GEMA-Garage setzt via `_fzGarageChange` automatisch den Werkstatt-Zugang (`fGaragistUserId`-Select → `v.garagistUserId` beim Speichern, inkl. bestehender Notifikation/Log) und zeigt den Hint `#fGarageHint`; gespeichert wird als `v.garage` der Werkstatt-Name (String). **Nur in diese Richtung**: Wechsel auf eine eigene Garage entzieht einen bestehenden Zugang NICHT automatisch (kein versehentlicher Rechte-Entzug — Abschnitt «Werkstatt-Zugang» bleibt autoritativ). Beim Edit gewinnt die `gema:`-Vorauswahl, wenn `v.garagistUserId` auf einen aktiven Garagisten zeigt (`_fzPopulateGarageDropdown(selected, garagistUserId)`); `fGarage` darf danach NICHT mehr per `$f` mit dem Namens-String überschrieben werden.

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

**Logo-Branch**: Wenn `org.logoVector` (SVG) oder `org.logo` (JPEG-Raster, Upload in `sys_admin.html`) gesetzt ist → Firmen-Logo oben links auf dem Deckblatt (Vektor bevorzugt, druckt gestochen scharf). Sonst → eingebettetes GEMA-Inline-SVG. Damit zeigen User ohne hochgeladenes Logo automatisch das GEMA-Branding.

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

## Regierapporte (pm_regierapport.html)

Mobile-first Modul (iPad/iPhone-optimiert: grosse Touch-Ziele, Vollbild-Editor, Bottom-Sheet-Modals, safe-area) für Regiearbeiten auf der Baustelle — vom Monteur-Rapport bis zur bepreisten Zusammenstellung.

### Workflow & Status

```
Entwurf → Eingereicht → Freigegeben → Ausgewiesen
(Monteur)  (Monteur)     (Architekt/BL) (Projektleiter)
              ↘ Zurückgewiesen (mit Grund, zurück an Ersteller)
```

- **Erfassen (Monteur)**: Objekt-Anbindung wie Berechnungen (aktives Objekt vorausgewählt), Arbeitsbeschrieb, **Stunden** (Kategorie-Chips aus Org-Stammansätzen, 0.25-h-Stepper, Name optional) und **Material** (frei ODER via Katalog-Picker aus GemaProdukte über alle Kategorien — Bezeichnung/`produktId`/`lieferantFirma` werden übernommen). **Monteure sehen NIE Preise** (`.preis-inp` nur für `_rrCanPrice()`).
- **Einreichen**: GemaDialog fragt die Freigeber-E-Mail (Vorschlag = Architekt/Bauleitungs-Beteiligter des Objekts via `GemaObjekte.getBeteiligte`); Objektname/-adresse werden in den Record **denormalisiert** (Architekt fremder Org hat keinen Zugriff auf die Org-Objekte). Notifikationen `regie_eingereicht` an `role_planer`+Org sowie an den per E-Mail aufgelösten Freigeber-User.
- **Freigabe**: ✍️ **Unterschrift vor Ort** (Canvas-Signatur-Pad, Retina, Pointer-Events; PNG als `freigabe.signaturDataUrl` im Record) ODER **digitale Freigabe/Zurückweisung** durch role_architekt/role_bauherrschaft bzw. den zugewiesenen Freigeber (`freigeber.email`-Match, cross-org). Nach Freigabe ist der Rapport für den Monteur gesperrt.
- **Ausweisen (nur `_rrCanPrice()` = Planer/Admin/Abteilungsleiter)**: Ansätze pro Stundenzeile (Vorbefüllung aus Org-Stammansätzen `org.settings.regie.ansaetze`, Default-Kategorien Servicemonteur/Monteur/Hilfsmonteur/Lehrling/Bauleitung — Einstellungs-Modal ⚙️) + Material-EPs → Rapport-Total; Status `ausgewiesen`.
- **Zusammenstellung** (pro Objekt, nur PL): Tabelle aller Rapporte mit Zwischentotal der ausgewiesenen, Zuschlag/Rabatt/MwSt (Parameter lokal je Objekt in `gema_regie_zus_v1`) → **Endsumme Regiearbeiten**; PDF-Export.
- **PDF**: Einzelrapport (ohne/mit Preisen) und Gesamt-Zusammenstellung als Print-Fenster (A4, «Als PDF sichern» auf iPad) inkl. Freigabevermerk + Unterschrift-Bild.

### Storage & Scope

Per-Record in der Cloud: moduleKey `regierapport`, prefix `regie:`, Pool-Cache `gema_regie_pool_v1` (bindCollection beim Boot mit Sofort-Render aus Cache, Einzel-Saves via `GemaSync.saveRecord`). Sichtbarkeit: Planer = ganze Org · Monteur/Spengler = nur eigene Rapporte · Architekt/Bauherrschaft = eigene Org ODER ihnen zugewiesene (`freigeber.email` = eigene E-Mail, cross-org). Deep-Link `?rr=<id>` (aus den Notifikationen).

### Rollen & Registrierung

MODULES-Key `regierapport` (cat Projektmanagement), FILE_MAP `pm_regierapport`. DEFAULT_ROLES: Monteur/Spengler read+write (+ Monteur `objekte` read für die Objekt-Auswahl), Architekt/Bauherrschaft read+write (Freigabe), Planer via `_allPerms`. Event-Keys `regie_eingereicht`/`regie_freigegeben`/`regie_abgelehnt` in gema_notify.js. index.html PM-Kategorie («12 Module»), sw.js v168.

## ERP: Offerten · Aufträge · Rechnungen (pm_erp.html)

EIN integriertes Modul (User-Entscheid — kein Modul-Trio) mit Tabs Offerten/Aufträge/Rechnungen/Kunden + ⚙️-Einstellungen. Kern ist die verknüpfte **Dokument-Kette**: Offerte → (angenommen) → Auftrag → Akonto-/Teil-/Schlussrechnung. Mobile-tauglich (gleiche UI-Muster wie pm_regierapport).

### Datenmodell & Storage

Per-Record in der Cloud, moduleKey `erp`: Dokumente `erpdok:` → `gema_erp_dok_pool_v1`, Kunden `erpkunde:` → `gema_erp_kunden_pool_v1` (bindCollection beim Boot + Sofort-Render aus Cache; Einzel-Saves via saveRecord). Dokument: `{id, typ:'offerte'|'auftrag'|'rechnung', nr, orgId, objektId/objektName, kundeId, kundeSnapshot{firma,kontakt,strasse,plz,ort,email}, datum, gueltigBis|frist, status, positionen[], rabattPct, mwstPct, einleitung, schlusstext, verknuepfung:{offerteId?,auftragId?}, rechnungsArt:'einzel'|'akonto'|'teil'|'schluss', zahlungen[{datum,betrag}], erstelltVon}`. Nummernkreise pro Typ+Jahr: `OF-2026-001` / `AU-` / `RE-` (max+1 aus dem Pool). Einstellungen in `org.settings.erp` (mwstPct 8.1, fristTage 30, iban, qrIban, Absender, Standard-Schlusstexte).

### Positionen (gemeinsamer Editor aller Dokumenttypen)

`{id, art:'frei'|'titel'|'regie'|'oa'|'akonto'|'abzug', bez, menge, einheit, ep, rabattPct?, produktId?, lieferantFirma?, regieRapportId?, oaId?}`. Quellen-Buttons:
- **📦 Katalog**: GemaProdukte über alle Kategorien (Volltextsuche), übernimmt produktId+Lieferant
- **📝 Regierapporte**: ausgewiesene, unverrechnete Rapporte (`gema_regie_pool_v1`, objektgefiltert) als Pauschalposition mit `regieRapportId`; beim **Rechnung stellen** wird `r.verrechnetIn=<RechnungsNr>` in den Regie-Pool zurückgeschrieben (Cross-Modul-Write via GemaSync.saveRecord)
- **🏷 Lieferanten-Offerten**: beantwortete Offertanfragen (`GemaProdukte.getOffertanfragen`, objektgefiltert) mit `antwort.bruttoPreis` als EP
Summenblock: Zwischentotal → Zeilen-/Dokumentrabatt → Netto → MwSt → **Rappenrundung auf 0.05** (`erpRound5`).

### Kette & Fakturierung

- `erpZuAuftrag()`: kopiert Positionen, verknüpft beidseitig (`verknuepfung.offerteId`/`auftragId`)
- **Akonto**: GemaDialog-Prompt (CHF oder `30%` der Auftrags-Nettosumme) → Rechnung mit einer `art:'akonto'`-Position
- **Teilrechnung**: Modal mit Positions-Checkboxen + anpassbaren Mengen
- **Schlussrechnung** (`erpSchlussPositionen`): alle Auftragspositionen + automatische **Abzugszeilen** (`art:'abzug'`, negativer EP) je bereits gestellter, nicht stornierter Rechnung — Netto-Abzug VOR MwSt (CH-Praxis)
- `erpAuftragFakt(docs,auftragId)`: Auftragssumme / verrechnet / Rest / % — als Fortschrittsbalken im Auftrag und auf der Karte
- Rechnung: entwurf → gestellt (sperrt Editor, Frist gesetzt) → bezahlt (Zahlungen kumulieren, Teilzahlungen) | storniert; **überfällig** wird berechnet (`erpRechnungAnzeigeStatus`: gestellt + Frist überschritten + nicht gedeckt)

### Swiss QR-Rechnung

**Mehrseitiger Aufbau (alle 3 Dokumenttypen)**: Seite 1 = **Titelblatt** (`.cover`: Briefkopf, Empfänger, Meta, grosser Dokumenttitel, Einleitung, Betrag-Kachel `.cover-total` mit Offert-/Auftragssumme bzw. Rechnungsbetrag — KEINE Positionstabelle) → ab Seite 2 **Positionen im Detail** → **Zusammenstellung** (Zusammenzug pro `art:'titel'`-Gruppe + Zwischentotal/Rabatt/Netto/MwSt/Total + Schlusstext) → bei Rechnungen zuletzt das **QR-Blatt** (`.qrpage`: Betrag-Box mit Rechnungsbetrag/Frist/Referenz, Hinweis «alles im QR-Code — nichts von Hand ausfüllen», Zahlteil+Empfangsschein via `margin-top:auto` am Blattende). Sektionstrennung via `.pb` (Bildschirm gestrichelte Linie, Druck `page-break-before:always`); `thead{display:table-header-group}` wiederholt den Tabellenkopf bei mehrseitigen Positionslisten. **Druck-Fusszeile via `@page`-Margin-Boxes** (`@bottom-left/-center/-right`, CSS-escaped Strings) — `position:fixed` mit `bottom` kollidiert im Druck auf Folgeseiten mit dem Seitenanfang; die `.foot`-Div bleibt nur für die Bildschirm-Vorschau.

**Briefkopf & Branding (alle 3 Dokumenttypen)**: Absender-Block oben LINKS (Firma + Adresse + Tel/Mail/Web aus `org.settings.erp`), **Logo oben RECHTS** (`org.logoVector||org.logo`, max 18×62 mm, `object-position:right top`; ohne Logo Wortmarke in Akzentfarbe), darunter Empfänger-Adresse links + Dokument-Meta rechts (Datum, Gültig-/Zahlbar-bis, Auftrag, Projekt als Label/Wert-Zeilen). **Akzentfarbe aus `org.settings.pdfFarben.primary`** (`erpBrand()` mit denselben Kontrastschutz-Helfern wie Schaden-/Dachbericht: `_erpDarkenForWhiteBg` ≥ 4.5:1 gegen Weiss + `_erpLightTint` für Flächen; Fallback ERP-Blau `#1d4ed8`) — färbt H1, Tabellen-Header, Titel-Zeilen, Summenzeile, Fusslinie. **Fusszeile auf jeder Seite** (`position:fixed`, im Druck via `bottom:-16mm` in den 24-mm-@page-Rand geschoben): Firma·Adresse | Tel·Mail·Web | MwSt-Nr (+IBAN nur bei Rechnung) — Felder `tel/email/web/mwstNr` in den ⚙️-ERP-Einstellungen, nur gefüllte erscheinen. **KRITISCH**: Die Fusszeile wird im `document.write`-String VOR dem Dokument-Body eingefügt — Markup NACH dem externen QR-Script-Tag kann beim Parsen verloren gehen.

Rechnung-PDF (Print-Fenster, A4, Briefkopf mit `org.logoVector||org.logo`) enthält bei hinterlegter IBAN den Zahlteil mit Empfangsschein: SPC-Payload v2.0 (`erpQrPayload`, 31 Zeilen, Adresstyp K). Mit **QR-IBAN** → Referenztyp `QRR` mit 27-stelliger Referenz aus der Rechnungsnummer (**Mod10-rekursiv-Prüfziffer**, `erpMod10` — validiert gegen bekanntes ESR-Beispiel), sonst `NON`. QR-Code-Rendering via qrcodejs-CDN im Print-Fenster (Schweizer-Kreuz-Overlay; offline Fallback-Hinweis). Engine (`erpDocTotals`/`erpAuftragFakt`/`erpSchlussPositionen`/`erpMod10`/`erpQrReferenz`/`erpQrPayload`) liegt im `/*ENGINE-START*/`-Block — Node-testbar.

### Positionsbilder, eigene Kataloge & Vorlagen

- **Positionsbilder**: Jede Detailposition kann ein Bild tragen (`p.bildUrl` via `GemaStorage.uploadDataUrl` Pfad `erp/<orgId>`, Base64-Fallback `p.bildDataUrl`; Resize max 900px JPEG). Editor: 📷-Button pro Zeile, Thumbnail mit Lightbox + Entfernen. PDF: Bildzeile (`tr.bildrow`, max 34×72 mm) direkt unter der Position, `tr.hasimg td{border-bottom:none}` hält Bild+Text optisch zusammen, `page-break-inside:avoid`.
- **Eigene Artikel-Kataloge (org-weit)**: per-Record `erpkat:` → `gema_erp_kat_pool_v1`. Katalog `{id, orgId, name, artikel:[{id,bez,einheit,ep,bildUrl?,bildDataUrl?}]}`. Modal «⭐ Eigene Artikel» im Positions-Editor: Katalog-CRUD (GemaDialog), Artikel erfassen/bearbeiten/löschen, Klick = Position einfügen (`eigenArtikelId`, Quelle-Badge «⭐ Eigen», Bild wandert mit), **«⬇ Aus aktuellem Dokument übernehmen»** (Positions-Checkliste, dedupe per Bezeichnung).
- **Dokument-Vorlagen (org-weit)**: per-Record `erpvorl:` → `gema_erp_vorl_pool_v1`. Vorlage `{id, orgId, name, typ, titel, einleitung, schlusstext, rabattPct, mwstPct, positionen[]}` — beim Speichern werden Akonto-/Abzugszeilen entfernt und Regie-/OA-Positionen zu `art:'frei'` ohne `regieRapportId`/`oaId` gekappt (dokument-spezifisch). Modal «📑 Vorlagen» im Editor-Footer: aktuelles Dokument speichern (GemaDialog.prompt) + Liste mit Einfügen/Löschen. **Einfügen**: leeres Dokument → komplett übernehmen (Texte nur wenn leer, Rabatt/MwSt mit); sonst Positionen anhängen. Immer neue Positions-IDs.

### Nachkalkulation & Projekterfolg (Tab «📈 Erfolg»)

Soll-Ist-Vergleich pro Auftrag, nur für `erpCanEdit()`-Rollen sichtbar (Preise/DB). Engine-Funktion `erpNachkalk(auftrag,docs,rapporte,einsaetze,oas,kostenFaktorPct)` im `/*ENGINE-START*/`-Block (Node-testbar):
- **Soll**: Auftragssumme netto + Fakturierungsstand via `erpAuftragFakt` (verrechnet/Rest/%, Fortschrittsbalken).
- **Ist Regie**: ausgewiesene Regierapporte mit `r.objektId === auftrag.objektId` (Σ std×ansatz + Σ menge×ep), gesplittet verrechnet (`r.verrechnetIn`) / unverrechnet, + Stunden-Summe.
- **Ist Material**: Positionen mit `oaId` — EK = `oa.antwort.bruttoPreis` der Lieferanten-Offerte, VK = menge×ep×(1−rabatt%).
- **Einsatzplanung**: Σ `dauerTage` der Einsätze mit `e.auftragId === auftrag.id` (geplante Manntage) — dafür bindet der Init zusätzlich `gema_einsatz_pool_v1`.
- **DB-Schätzung** nur wenn `org.settings.erp.kostenFaktorPct` > 0 (⚙️-Feld «Kostensatz % vom Verkaufsansatz»): Kosten = Regie×Faktor + EK-Material → Deckungsbeitrag CHF + % (im UI klar als Schätzung markiert; ohne Faktor KPI-Hinweis «Kostensatz in ⚙️ setzen»).
- **Hinweis-Badges** (`hinweise[].code`): `unverrechnet` (amber, offene Regie CHF), `ueberverrechnet` (blau, über Auftragssumme fakturiert), `nachtrag` (rot, Regie übersteigt Auftrag → Nachtrag prüfen).
- UI: KPI-Zeile (laufende Aufträge, Volumen, unverrechnete Regie org-weit, Ø DB), Karten laufende zuerst, Klick → Auftrag; Objekt-Filter + Suche wie andere Tabs, kein «＋ Neu»; Deep-Link `?tab=erfolg`.

### Kunden & Rechte

Kundenstamm pro Org (Tab 👥) mit **Schnellübernahme aus Objekt-Beteiligten** (`GemaObjekte.getBeteiligte` → 1-Klick-Befüllung). `kundeSnapshot` wird ins Dokument denormalisiert (Adresse fürs PDF/QR stabil). Rechte: nur Planer-Rollen/Admin/Abteilungsleiter (`erpCanEdit`); MODULES-Key `erp` (cat Projektmanagement, Planer via `_allPerms`), FILE_MAP `pm_erp`. Deep-Links `?doc=<id>` und `?tab=offerte|auftrag|rechnung|kunden`. index.html PM («13 Module»), sw.js v169.

## Einsatzplan (pm_einsatzplan.html)

Kalender zur Monteur-Einplanung — Aufträge aus dem ERP-Modul per **Drag & Drop** (oder Antippen auf iPad) direkt auf die Plantafel ziehen. Mobile-tauglich (gleiche UI-Muster wie pm_regierapport/pm_erp).

- **Storage per-Record**: moduleKey `einsatzplan`, prefix `einsatz:`, Pool-Cache `gema_einsatz_pool_v1` (bindCollection beim Boot, Einzel-Saves via `GemaSync.saveRecord`, Org-Scoping über `e.orgId`). Einsatz-Record: `{id, orgId, typ:'auftrag'|'frei'|'ferien', auftragId, auftragNr, kunde, titel, objektId, objektName, monteurUserId, monteurName, datum, dauerTage, slot:'ganz'|'vm'|'nm', zeitVon, zeitBis, notiz, erstelltVon}`.
- **3 umschaltbare Ansichten** (`_view`): **Woche** = Plantafel (Zeilen = Personen, Spalten = Mo–Fr bzw. Mo–So, Zellen `data-cell="userId|datum"`), **Monat** = 42-Zellen-Grid mit Tages-Modal (`epDayOpen`), **Meine Woche** = Karten-Liste des eingeloggten Monteurs mit Notiz + Deep-Link «📝 Regierapport erfassen» (`pm_regierapport.html?objekt=…`). Monteure ohne Planungsrecht landen automatisch in «Meine Woche».
- **Sidebar «Offene Aufträge»**: liest den ERP-Pool (`gema_erp_dok_pool_v1`, `typ='auftrag'`, Status ≠ abgeschlossen) direkt via `GemaSync.getCached`; eingeplante Aufträge tragen den Badge «✓ eingeplant» (`a._geplant`). Drop/Tap auf eine Zelle erzeugt den Einsatz mit übernommenen Auftrag-Daten (`epNeuAusAuftrag`: Nr/Kunde/Objekt).
- **DnD + Tap-Fallback**: HTML5-DnD (`epBindDnD`, dataTransfer `ev:<id>` / `job:<id>` → `epDropOn(data,monteurId,datum)`); auf Touch stattdessen Karte antippen → Move-Modus (`epJobTap`/`epEvStartMove`, fixierte `#movebar` unten) → Ziel-Zelle antippen (`epCellClick`).
- **Raster umschaltbar** in den ⚙️-Einstellungen (`org.settings.einsatzplan = {raster:'halbtag'|'zeit', wochenende, userIds}` via `GemaAuth.updateOrgSettings`): Halbtag = Ganztag/VM/NM-Chips, Zeit = von–bis-`type="time"`-Felder. `userIds` definiert die einplanbaren Personen (Default: alle `role_monteur`+`role_spengler` der Org, beliebige Org-User zuschaltbar). Sa/So-Spalten optional.
- **Konflikt-Warnung**: `epOverlap(a,b)` (Zeitfenster-Schnitt bzw. Slot-Kollision — `ganz` kollidiert mit allem) markiert Doppelbelegungen mit ⚠; mehrtägige Einsätze via `dauerTage` (`epCovers`).
- **Notifikation** `einsatz_geplant` (gema_notify.js) an den Monteur bei Einplanung UND Verschiebung (`epNotify`, nie an sich selbst), Link mit Deep-Link `pm_einsatzplan.html?d=YYYY-MM-DD` (Init springt zur Woche/zum Monat des Datums).
- **Rechte**: Planen = Planer-Rollen/Admin/Abteilungsleiter/Magaziner (`epCanPlan`); Monteur/Spengler read-only (`einsatzplan` read in DEFAULT_ROLES, Magaziner write). MODULES-Key `einsatzplan` (cat Projektmanagement), FILE_MAP `pm_einsatzplan`. index.html PM («14 Module»), sw.js v170.

## Stundenerfassung GAV (pm_stunden.html)

Mobile-first Arbeitszeiterfassung für Monteure (Handy-Format, grosse Touch-Ziele) mit GAV-konformen Zuschlägen und Freigabe-Workflow. **Zuschlags-/Spesen-Defaults in Anlehnung an den GAV der Gebäudetechnikbranche (suissetec), Region Nordwestschweiz** — alle Werte pro Org überschreibbar (`org.settings.stunden`, ⚙️-Modal mit explizitem Prüf-Hinweis; verbindlich ist immer der GAV-Text).

- **Storage per-Record**: moduleKey `stundenerfassung`, prefix `std:`, Pool `gema_std_pool_v1`. EIN Record pro User+Tag: `{id,orgId,userId,userName,datum,eintraege:[{id,von,bis,pauseMin,objektId/objektName,taetigkeit,einsatzId?}],absenz?:{typ,anteil:1|0.5},spesen:{mittag,km},status offen|eingereicht|genehmigt|zurueck,eingereichtAm?,entscheid:{von,am,grund}}`. Zusätzlich **Topf-B-Auszahlungs-Records im selben Pool** (`{id,typ:'auszahlung',orgId,userId,userName,datum,jahr,stunden,von,vonUserId}`) — alle Tages-Leser filtern `!t.typ` (`orgTage`/`meineTage`/`stTagFor`), Accessor `stAuszahlungen(userId,jahr)`.
- **Engine** (`/*ENGINE-START*/`, Node-testbar): `STD_DEFAULTS` (40-h-Woche, Zuschläge Überstunden 25 % / Samstag 25 % / Sonn-+Feiertag 100 % / Nacht 50 %, Nachtfenster 23–06 Uhr, bezahlte Znüni-Pause 15 Min. als Info, Mittag CHF 18, km CHF 0.70, Ferien 25 Tage, Feiertagsliste) · `stdParams` (Org-Merge) · `stdEintragMin` (über Mitternacht: bis ≤ von → +24 h) · `stdNachtMin` (Fenster-Überlappung, Pause zählt zur Tagzeit) · `stdTagTyp` (werktag/samstag/sonntag/feiertag) · `stdWochenStart/stdWochenSoll` (Feiertage Mo–Fr reduzieren Soll) · **`stdWochenAuswertung`** (Ist/Soll/Saldo, Überstunden = max(0, Ist−SollEff), Sa-/So-/Nacht-Stunden, **Zuschläge als Zeitwert** Σ h×%, Spesen CHF) · `stdMonatSoll/stdMonatsAuswertung` (Überstunden/Töpfe GAV-konform pro Woche ermittelt, Absenzen mindern das Monatssoll). Neu dazu: `STD_ABSENZ` (ferien/krank/unfall/militaer/kompensation/brueckentag) · `stdWochenAktivTage/stdWochenSollEff` (SollEff = aktive Tage × Tagessoll **inkl. Vorholzeit**; Feiertage UND Absenz-Anteile an Werktagen reduzieren) · `stdFerienAnspruch` (**pro-rata bei unterjährigem Ein-/Austritt**, auf halbe Tage gerundet) · **`stdJahresAuswertung`** (kumulierte Töpfe, Vorhol-Konto, Feriensaldo, Krank-Tage).
- **Überstunden-Töpfe (User-Regel)**: Mehrstunden über (Wochensoll + Vorholzeit) → **Topf A** (Kompensation) bis `topfGrenzeH` (Default 5 h/Woche), darüber **Topf B** (auszahlungspflichtig). `stTopfBCheck` benachrichtigt bei Grenzüberschreitung SOFORT role_planer+role_abteilungsleiter (`stunden_topfb`, Lock `gema_std_topfb_lock_v1` 1× pro User+Woche). Topf-A-Bezug via Absenz «Kompensation», Topf-B-Auszahlung erfasst der Approver in den Jahres-Salden (`stAuszahlung`, GemaDialog.prompt mit offenem Saldo vorbefüllt, `stunden_auszahlung` an den Mitarbeiter).
- **Vorholzeit & Brückentage**: `vorholProWocheH` erhöht das Wochensoll und füllt das Vorhol-Konto (anteilig pro aktivem Tag); org-weite `brueckentage`-Liste (Badge auf der Tages-Karte, Absenz-Modal schlägt «Brückentag» vor). Absenz «Brückentag» bezieht vom Vorhol-Konto (Basis-Tagessoll, ohne Vorhol-Anteil).
- **Absenzen**: Tages-Karte «🌴 Absenz»-Button → Modal (Typ + ganzer/halber Tag + Wirkungs-Hint); Absenz-Tage sind einreichbar/freigebbar wie Arbeitstage (`stTagHatDaten` = Einträge ODER Absenz), erscheinen in Freigabe-Zeilen und im PDF.
- **Mitarbeiter-Stammdaten** in `org.settings.stunden.mitarbeiter[userId] = {eintritt,austritt,ferienTage?,pensum?,topfGrenzeH?}` (⚙️-Modal, Tabelle aller Org-User) — Basis für den Pro-rata-Ferienanspruch; leer = ganzes Jahr / Standard-Anspruch / Vollzeit.
- **Reduzierte Pensen (Prozent-Modell)**: nur `pensum` in % eingeben (z.B. 80) — `stdParamsFuerMitarbeiter(p,mi)` (Engine) skaliert Wochensoll, Vorholzeit und Topf-A-Grenze; damit skalieren SollEff/Monatssoll, Absenz-Gutschriften und Konto-Bezüge (Kompensation/Brückentag) automatisch. **Ferientage bleiben in Tagen** (ein Ferientag = reduziertes Tagessoll). Topf-A-Grenze: Default = Org-Grenze × Pensum, pro Mitarbeiter via `topfGrenzeH` individuell überschreibbar. UI-Helper `stParamsFor(userId)` — ALLE per-User-Berechnungen (Woche/Freigabe/Auswertung/Jahres-Salden/CSV/PDF/Topf-B-Check/Feriensaldo) laufen über die skalierten Parameter; Pensum ≠ 100 % wird in Wochen-Karte, Freigabe, Auswertung und PDF ausgewiesen.
- **Ferienanträge mit Freigabe**: Records `{typ:'ferienantrag',von,bis,tage,bemerkung,status beantragt|genehmigt|abgelehnt,entscheid}` im selben Pool. Monteur beantragt über die Karte «🌴 Meine Ferien» (Werktage-Rechner + Saldo-Vorschau, Antrag zurückziehbar) → `ferien_antrag` an role_planer+role_abteilungsleiter (Deep-Link `?tab=freigabe`). Freigabe-Tab zeigt pro Antrag den Saldo des Mitarbeiters und eine **Konflikt-Übersicht** (`stFerienKonflikte`: andere Anträge + Ferien-Absenzen im Zeitraum, pro User dedupliziert). **Genehmigung trägt automatisch ein**: Ferien-Absenz pro Werktag (`quelle:'antrag'`, nie bestehende Absenzen überschreiben) UND ein Einsatzplan-Kalender-Eintrag (`stFerienInEinsatzplan`, ADD-ONLY Cross-Modul-Write in `gema_einsatz_pool_v1`, typ `ferien`, `ferienAntragId`); `ferien_entscheid` an den Mitarbeiter.
- **Feriensaldo-Aufschlüsselung in Tagen** (`stFerienDetail`/`stdFerienSaldoDetail`): Anspruch (pro-rata) − bezogen (eingetragene Ferien) − offen beantragt − **Betriebsferien-Reserve** = verfügbar; Vorhol-Konto separat in Tagen umgerechnet. Sichtbar für den Monteur in der Ferien-Karte, in den Jahres-Salden (Spalte «verfügbar» mit Tooltip) und im PDF-Monatsblatt.
- **Betriebsferien**: org-weite Zeiträume `org.settings.stunden.betriebsferien = [{von,bis,label}]` (⚙️-Modal, eine Zeile «von bis Label»). Werktage darin zählen als Reserve im Saldo (`stdBetriebsferienTage`, begrenzt auf Anstellungszeit, gebuchte Tage ausgenommen); `stBetriebsferienScan` beim Seitenstart trägt begonnene Zeiträume automatisch als Ferien-Absenz des eingeloggten Users ein (`quelle:'betriebsferien'`, idempotent, überschreibt weder Absenzen noch Arbeitstage).
- **Monteur-Flow («Meine Woche»)**: KW-Navigation, 7 Tages-Karten (Sa/So/Feiertag-Badges), Eintrag-Modal mit **Einsatzplan-Übernahme** (eigene Einsätze des Tages aus `gema_einsatz_pool_v1` → Objekt+Tätigkeit vorbefüllt), Spesen-Zeile pro Tag (🍽 Mittag auswärts, 🚗 km), 📝-Link pro Eintrag zu `pm_regierapport.html?objekt=…`. **«📤 Woche einreichen»** sperrt die Tage (Status eingereicht) + `stunden_eingereicht` an role_planer+Org.
- **Freigabe (Planer/AL/Admin, `stCanApprove`)**: eingereichte Wochen gruppiert nach User+KW mit Tages-Detail und Zuschlags-/Spesen-Summen → **Genehmigen** oder **Zurückweisen mit Grund** (GemaDialog.prompt; Tage wieder editierbar, Grund als 💬-Badge beim Monteur) + `stunden_entscheid` an den Monteur (Deep-Link `?d=<wochenstart>`).
- **Auswertung**: Monats-Picker, Tabelle pro Mitarbeiter (Ist/Soll/Saldo/Üst/**Topf A/Topf B**/Sa/So/Nacht/Zuschlag-Zeitwert/Mittage/km/Spesen CHF + Status) — Approver sehen die ganze Org, Monteure nur sich; **CSV-Export fürs Lohnbüro** (Semikolon, BOM, inkl. Töpfe + Jahres-Salden-Spalten). Darunter Karte **«💰 Jahres-Salden»** (`stRenderJahresSalden`): Topf-A-Saldo, Topf B offen/ausbezahlt, Vorhol-Saldo, Ferien Anspruch/bezogen/Rest (pro-rata), Krank-Tage + Auszahlungs-Button (Approver).
- **PDF-Monatsblatt pro Mitarbeiter** (`stPdf`, Button in der Auswertungs-Tabelle; Monteur nur eigenes): Print-Fenster A4 (Muster Regierapport) mit allen Tagen (Einträge/Absenzen/Status), Zuschlags-Zusammenzug inkl. Topf-Split, Spesen-Detail pro Tag, Jahres-Stand (Töpfe/Vorhol/Ferien) und Unterschriftszeilen — Grundlage für den Lohnlauf.
- Registriert: gema_auth (MODULES `stundenerfassung` cat Projektmanagement, FILE_MAP `pm_stunden`, Monteur/Spengler/Magaziner rw, Planer via `_allPerms`), gema_notify (`stunden_eingereicht`/`stunden_entscheid`/`stunden_topfb`/`stunden_auszahlung`/`ferien_antrag`/`ferien_entscheid`), index.html (PM, 15 Module), sw.js.

## Bestellungen für Anlagen (pm_bestellungen.html + gema_bestellungen_api.js)

Kompletter Bestellprozess nach dem Ausschreibungs-Zuschlag (User-Entscheid: NUR der Gewinner-Unternehmer bestellt; voller Lebenszyklus; eigenes Modul + Integrationen; druckbarer Bestellschein):

- **Storage per-Record**: moduleKey `bestellungen`, prefix `best:`, Pool `gema_best_pool_v1`. Record: `{id, nr, orgId (Besteller-Org), bestellerUserId/Name/Firma/Email/Tel, lieferantId, lieferantFirma, produktId, produktName, kategorie, menge, einheit, preis, total, quelle:{typ:'ausschreibung', ausId, ausName, posKey (losId|bkp|titel), bkpCode, posTitel, offertanfrageId}, objektId, objektName, lieferadresse, wunschtermin, bemerkung, status, bestelltAm, antwort, geliefert, empfangen, storno, verlauf[]}`. Nummernkreis pro Besteller-Org+Jahr: `BST-2026-001` (`GemaBest.nextNr`).
- **Status-Flow** (`GemaBest`-API, zentrale Übergänge mit Verlauf + Notifikation): `offen` → `bestaetigt` (Lieferant: `antwort{liefertermin, abNr, nachricht, pdfName/pdfUrl/pdfDataUrl, beantwortetAm/Von}`) → `geliefert` (`geliefert{am,von,nachricht}`) + Wareneingangs-Marker `empfangen{am,von}` (Besteller); `offen` → `abgelehnt` (Grund in `antwort.nachricht`); `offen|bestaetigt` → `storniert` (`storno{am,von,grund}`, Besteller). Ungültige Übergänge geben `null` zurück. Einzel-Saves via `GemaSync.saveRecord` (NIE persistCollection — globaler Pool über alle Orgs, wie Werkzeug im Dashboard); Event `gema-bestellungen-changed`.
- **Auslöser — Bestell-Sektion in pm_ausschreibungsunterlagen** (`_bstWinnerSektion` in `VIEWS.idet`, nur wenn `a.vergabe.winnerId === me.id` und Status `vergeben`): listet alle angehakten Lieferungs-Positionen (`istLieferung`) über alle Lose; Vorbefüllung aus `pos.offerte` (Lieferant fix, Produktname, `bruttoPreis`); ohne Offerte Lieferanten-Select aus `GemaProdukte.getAllLieferanten()` (aktive). Dialog `mBestellen` (`bstOpenDialog`/`bstSubmit`): Menge/Einheit/Preis, Lieferadresse (vorbefüllt aus `a.objekt`+`region`), Wunschtermin, Bemerkung. Bereits bestellte Positionen zeigen Badge `✓ BST-… · Status` (Lookup über `quelle.ausId`+`posKey`, storniert/abgelehnt erlauben Neu-Bestellung); Kategorie aus `MODUL_MAP[lieferungTyp].kategorie`.
- **pm_bestellungen.html** (Besteller-Übersicht, Org-Scope `b.orgId===u.orgId`): KPI-Zeile, Status-Filter-Chips, Suche, Karten-Grid, Detail-Modal mit Verlauf/AB-PDF; Aktionen (nur `GemaAuth.can('write','bestellungen')`): «✓ Wareneingang bestätigen» (geliefert), «⊘ Stornieren» (offen/bestätigt, GemaDialog mit Grund); **Bestellschein-Print** `bstPrint(id)` (A4-Print-Fenster: Besteller-Briefkopf + `org.logoVector||logo`, Lieferant, Positionstabelle, Total, Lieferadresse, Termine). Deep-Link `?b=<id>` öffnet das Detail (Ziel der Besteller-Notifikationen).
- **Lieferanten-Dashboard**: neuer Tab «🛒 Bestellungen» (nur Anlagenlieferant, Badge `bestBadge` = offene; Deep-Link `?tab=bestellungen` — Ziel der Lieferanten-Notifikationen). `GemaBest.bind()` beim Init (cross-org Pull, Bestellungen kommen von fremden Unternehmer-Orgs). Karten mit Besteller/Projekt/Lieferadresse/Betrag/Wunschtermin; Aktionen via `_liefCanOfferten` + `_liefBlockedInaktiv`: «✓ Bestätigen» (Modal `bestAnswerOverlay`: Liefertermin [vorbefüllt = Wunschtermin], AB-Nr, Nachricht, AB-PDF ≤10 MB → GemaStorage Pfad `bestellungen/<lieferantId>`, Base64-Fallback ≤2.5 MB), «✕ Ablehnen» (GemaDialog.prompt Grund), «📦 Als geliefert melden».
- **Notifikationen** (Empfänger-Auflösung wie Offertanfragen: Lieferant über `user.lieferantId`-Match, Fallback Lieferanten-Org; Besteller direkt via `bestellerUserId`): `bestellung_neu`/`bestellung_storniert` an Lieferant, `bestellung_bestaetigt`/`bestellung_abgelehnt`/`bestellung_geliefert` an Besteller, `bestellung_empfangen` an Lieferant.
- Registriert: gema_auth (MODULES `bestellungen` cat Projektmanagement, FILE_MAP `pm_bestellungen`, **role_unternehmer r/w**, Planer via `_allPerms` + Permission-Backfill), gema_notify (6 Keys), index.html (PM, 16 Module), sw.js (v214), gema_recent. Playwright: bestellungen_test 30/30 (Gewinner-Sektion + Dialog-Vorbefüllung, Statusmaschine inkl. ungültiger Übergänge, Notifys, Deep-Links, Bestellschein, Dashboard-Flow).

## Abnahmeprotokolle SIA 118 (pm_abnahme.html) — Teilnehmer, Freigabe & Monteur-Mängelliste

Bestehendes SIA-118-Modul (mehrere Protokolle pro Objekt im per-Objekt-Blob `gema_abnahme_sia_v1__<objektId>` via `_GemaDB`, Mangel-/Plan-Pin-Fotos nach GemaStorage ausgelagert, 4 Unterschriften-Pads). Dazu drei Workflow-Bausteine:

- **Teilnehmer & Gewerk (Karte im Abnahme-Tab)**: `state.gewerk` (`sanitaer|heizung|lueftung|elektro|spenglerei|allgemein`, Vorschlag aus Arbeitsgattung-Text bzw. Org-Kategorie) + `state.teilnehmer[]` aus den Objekt-Beteiligten. **Vorauswahl über `abRelevant(b,gewerk)`**: Bauherrschaft/Architekt/eigener Planer immer dabei, Behörden nie vorgewählt; Unternehmer/Weitere über **BKP-Codes des Beteiligten** (`AB_GEWERK_BKP`: sanitaer=25*, heizung=242/243, lueftung=244, elektro=23*, spenglerei=221/222/224) bzw. Text-Heuristik auf Firma/Funktion/Notizen — der Elektriker ist bei einer Sanitär-Abnahme NICHT vorgewählt. Manuelles An-/Abwählen setzt `_manuell` (übersteht Gewerk-Wechsel nicht — Wechsel baut neu auf).
- **Freigabe pro Teilnehmer**: «✍ vor Ort» (Unterschriften-Pads unten) ODER «📧 Digital anfragen». Digitale Anfragen liegen **per-Record in der Cloud** (moduleKey `abnahme`, `abfrg:` → `gema_abnahme_frg_pool_v1`) mit denormalisiertem Kontext (Objektname, Arbeitsgattung, Ergebnis, offene Mängel) — **cross-org via `empfaengerEmail`-Match** (Regierapport-Muster). Der Empfänger sieht die Anfrage im Panel «Meine Freigaben» (`#abTasks`, oben auf der Seite) und gibt frei/lehnt ab (GemaDialog, Ablehnung mit Begründung); Status/Kommentar erscheinen beim Teilnehmer im Protokoll (`abSyncFreigaben`). Notifikationen `abnahme_freigabe_anfrage`/`abnahme_freigabe_entscheid`.
- **Monteur-Mängelliste**: «📋 An Monteur übergeben» (Mängel-Tab) kopiert alle OFFENEN Mängel (inkl. Fotos) als Checkliste in einen per-Record-Auftrag (`abml:` → `gema_abnahme_ml_pool_v1`; `{monteurUserId, verantwortlich, status:'offen'|'abgearbeitet'|'freigegeben'|'erneute_abnahme', items:[{itemId, status, fixFotos[], kommentar}]}`). Der Monteur (role_monteur/role_spengler, `abnahme_sia` read) arbeitet sie im `#abTasks`-Panel ab: abhaken, **📷 Foto-Beweis** (GemaStorage `abnahme/<orgId>`, Base64-Fallback), Kommentar; «Alle abgearbeitet» erst möglich, wenn nichts mehr offen ist → `abnahme_maengel_abgearbeitet` an den Verantwortlichen. Dieser sieht die Karte «Zur Kontrolle»: einzelne Punkte **zurückweisen** (mit Grund → Liste zurück an Monteur) oder **«✅ Freigeben & ins Protokoll übernehmen»** (`abMlFreigeben` — schreibt `erledigt` = Datum/Monteur + Beweisfotos in die Protokoll-Mängel; **KRITISCH**: beim aktiven Protokoll in den LIVE-`state` schreiben, nicht in den `protocols[]`-Snapshot) oder **«📋 Erneute Abnahme vor Ort»** (Status-Marker, neues Protokoll manuell).
- Debug-/Test-Hooks: `window._abState/_abCreateItem/_abRender/_abPoolRead/_abPoolSave/_abRenderTeilnehmer/_abRenderTasks/_abActiveProtoId`.

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
| `gema_claude.js` | Browser-Helper für Anthropic-Proxy-Functions (Text: `rewrite`/`fix`/…; Dokument-Analyse: `extractPositions`) |
| `netlify/functions/claude-rewrite.js` | Server-Proxy für Anthropic API — Textüberarbeitung (Env: `ANTHROPIC_API_KEY`) |
| `netlify/functions/claude-extract.js` | Server-Proxy für Anthropic API — Dokument-Analyse Wareneingang (PDF/Foto/Text → Positionen, erzwungenes Tool-Use; Env: `ANTHROPIC_API_KEY`, opt. `ANTHROPIC_EXTRACT_MODEL`) |
| `netlify.toml` | Netlify-Konfiguration (functions-Dir, Redirects) |

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
4. **`org.logoVector` (SVG-Original) bevorzugen**: Der Logo-Upload in `sys_admin.html` (`handleOrgLogoUpload`) speichert seit dem SVG-Support ZWEI Felder — `org.logo` = IMMER ein JPEG-Raster (max 1000px, ≤200 KB; für jsPDF `addImage`, Nav, Legacy-Konsumenten) und `org.logoVector` = das unveränderte SVG als data-URL (nur bei SVG-Upload; width/height werden aus der viewBox injiziert, falls sie fehlen — sonst liefert Firefox `naturalWidth 0`). Alle Etiketten-Logo-Helper (`_tgGetOrgLogoSrc`/`_wzGetOrgLogoSrc`/`_fzEtOrgLogoSrc`) und die Print-PDF-Helfer (`brandHtml` in `gema_schaden_pdf.js`/`gema_dachbericht_pdf.js`) lesen `logoVector || logo`. **Hintergrund**: Ein JPEG-Raster (früher sogar nur 400px) zerlegt kleine, dünne Logo-Schriftzüge (Taglines) nach dem 1-Bit-Schwellwert in Fragmente («wird nur teilweise gedruckt») — ein SVG rastert bei 1400px verlustfrei und bleibt auf der Etikette gestochen scharf. Physikalische Grenze bleibt: eine Tagline im ~8mm-Logoband ist ~0.7mm hoch (≈8 Punkte bei 300dpi).

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
| `_tgLabelLogoSrc()` | `org.logoVector` || `org.logo` || GEMA-Fallback |
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

## Wareneingang (if_wareneingang.html)

Lager-/Logistikmodul (Präfix `if_`, cat **Infrastruktur**): bestellte Sanitärapparate verschiedener Lieferanten importieren, den **Wareneingang kontrollieren** (was ist angekommen, was fehlt) und **Regal-Etiketten** mit der Projekt-Adresse drucken. Zielperson im Alltag ist der Projektleiter — der Ablauf muss schnell und fehlerarm sein. Umsetzung nach dem Wareneingang-Handoff, **an die GEMA-Architektur angepasst** (per-Record-Sync statt eigener Supabase-Tabellen). **Bewusst flexibel/unabhängig** (User-Entscheid): Projekte können GEMA-Objekt-Stammdaten (`GemaObjekte`) referenzieren ODER frei erfasst werden (konfigurierbar, siehe `projektModus`); Lieferanten + Produkte sind KOMPLETT frei (kein `GemaProdukte`-Katalog).

- **Storage: per-Record in der Cloud** (moduleKey `wareneingang`): Lieferungen `we:` → `gema_we_pool_v1` (**Positionen eingebettet** als Array — eine Lieferung = ein Record; kein zweiter Pool/Join), Lieferanten-Spalten-Mappings `wemap:` → `gema_we_map_pool_v1`. Einzel-Saves via `GemaSync.saveRecord` (NIE `persistCollection` — Pool global über alle Orgs, wie GemaBest/Werkzeug-Dashboard), `bindCollection` beim Boot, Org-Scoping über `l.orgId`. Einstellungen in `org.settings.wareneingang` (`{projektModus,labelW,labelH,showArtikel,numberLabels,standardObjektId,lager:{name,strasse,plz,ort}}`).
- **Lieferung-Record**: `{id,orgId,erstelltVon/Name,importDatum,lieferantFirma,bestellnummer,bestelldatum,notiz,positionen:[{id,sortindex,artikelNr,bezeichnung,menge,eingegangenMenge,status,projekt:{objektId,name,strasse,plz,ort}}],status,updatedAt}`. Status berechnet: Position `offen`→`teilweise`→`eingegangen` (aus menge/eingegangenMenge), Lieferung `offen`→`teilweise`→`komplett`. **Positionen/Produkte sind KOMPLETT frei** (Freitext Bezeichnung+Art-Nr) — kein Produkt-/Lieferantenkatalog. Die `projekt`-Zuordnung ist entweder ein referenziertes GEMA-Objekt (`objektId` gesetzt) ODER eine freie Adresse (`objektId:''`).
- **Projektquelle konfigurierbar (User-Entscheid `org.settings.wareneingang.projektModus`)**: `beides` (Default, flexibel — GEMA-Objekt referenzieren ODER freie Adresse) | `gema` (nur GEMA-Objekt-Stammdaten referenzieren) | `frei` (nur freie/unabhängige Adressen, kein GEMA-Bezug). Helper `projModus()`/`gemaObjekteAn()`/`freieAdrAn()` steuern Import-Zuordnung, Schnell-Etikette (GEMA-Dropdown nur wenn erlaubt) und Standardprojekt. **Lieferanten sind frei** (Freitext + Autocomplete NUR aus der eigenen Modul-Historie via `lieferantHistory()`, NICHT aus `GemaProdukte`); Mappings sind daher pro **Lieferant-Name** gekeyt (`lieferantKey` = normalisierter Firmenname, case-insensitive, Legacy-Firma-Match).
- **4 Tabs**: **Übersicht** (Sammelpool mit KPI-Filter-Chips, Suche, Lieferant-/Projekt-/Sortier-Filter; Detail-Modal mit **Wareneingangsmodus**: pro Position eingegangene Menge / «＋1» / «✓ voll», Teilmengen/Backorder, «✓ Alles eingegangen», Etiketten-Nachdruck; **erfasste Lieferungen bearbeitbar** — ✏️ direkt auf der Karte ODER «✏️ Bearbeiten» im Detail-Modal). **Import** (3-Schritt-Wizard). **Schnell-Etikette** (manuelle Einzel-Etikette mit Live-Vorschau + optionaler Projekt-Übernahme, nur wenn GEMA-Modus aktiv). **Einstellungen** (Projektquelle-Modus, Etiketten-Format, Standardprojekt/Lager, Mapping-Liste).
- **Lieferung bearbeiten (`weEditLief`/`renderLiefEdit`, Arbeitskopie `LEDIT`)**: Kopfdaten (Lieferant mit Historie-Datalist, Bestell-Nr, Bestelldatum, Notiz) + Positions-Tabelle (`Pos-Nr | Menge | Art-Nr | Bezeichnung | Projekt/Adresse`) — Zeilen editierbar/löschbar/hinzufügbar, Projekt-Picker je Zeile + «auf alle Zeilen». `weLEditSave` schreibt zurück (verwirft leere Positionen, **erhält `eingegangenMenge`** und klemmt sie auf die neue Menge, Status/Lieferung-Status neu berechnet). «Abbrechen» (`weEditCancel`) kehrt ohne Speichern ins Detail-Modal zurück; «🗑 Lieferung löschen» im Editor. Nur `canEdit()`.
- **Modal in 2 Ebenen (KRITISCH)**: `#weModalHost` (Ebene 1: Detail-/Bearbeiten-Dialog, `showModal`) + `#weModalHost2` (Ebene 2: Projekt-/Adress-Picker und Neues-Projekt-Formular, `showModalTop`, z-index 9500) — der Picker legt sich ÜBER den aufrufenden Dialog, statt ihn zu ersetzen (User-Vorgabe: Dialog bleibt im Hintergrund offen, gleiche UX wie im Import-Wizard). `weCloseModal()` schliesst immer die OBERSTE offene Ebene — alle bestehenden ✕/Abbrechen-Handler bleiben unverändert gültig. GemaDialog (12800) liegt weiterhin über allem; gema_scroll entsperrt erst, wenn kein `.modal-bg` mehr sichtbar ist (2 Ebenen safe).
- **Import-Wizard**: (1) Quelle & Lieferant — **Extraktion: «🤖 KI-Analyse» steht zuerst und ist Default** (`newImp().quelle='ki'`), dann «Tabelle einfügen»/«PDF». Lieferant **komplett frei** (kein Katalog): bereits erfasste Lieferanten erscheinen als **Dropdown** (`#impLiefSelect` aus `lieferantHistory()`), neue via Freitext (`weImpLiefPick`/`weImpLiefType` halten Dropdown+Feld synchron); der Name bestimmt das Spalten-Mapping. (2) Extraktion — **HTML-Einfügen** fängt das `paste`-Event ab (`clipboardData.getData('text/html')` → `DOMParser` → Kandidaten-`<table>` mit den meisten Datenzeilen; Fallback text/plain mit Tab/2-Space-Split); **PDF** via **pdf.js** (lazy von cdnjs, `window.pdfjsLib`), Textitems mit x/y → Zeilen nach y clustern → Spalten nach x-Lücken clustern; **KI-Analyse** (siehe eigener Punkt). **Mapping-Assistent** bei fehlendem Mapping: extrahiertes Raster + Spalten-Zuordnung (**Pos-Nr**/Art-Nr/Bezeichnung/Menge/Kopfzeilen-Skip) mit Heuristik-Vorschlag (`guessCols`: Header-Keywords inkl. «Pos», längste Textspalte, Ganzzahl-Spalte), gespeichert pro Lieferant-Name+Quelle (`saveMapping`). Beim nächsten Import automatisch. **PDF speichert x-Bänder** (`colsToBands` → `applyPdfBands`, stabiler als Spaltenindizes), HTML Spaltenindizes (`applyGridMapping`). (3) **Review-Grid** (immer editierbar, Pflicht-Kontrolle weil PDF/KI fehleranfällig): `Pos-Nr | Menge | Art-Nr | Bezeichnung | Projekt/Adresse` + editierbares Lieferant-Feld im Kopf (KI kann ihn setzen; Pflicht beim Import), Zeilen editierbar/löschbar/manuell ergänzbar, Menge 0 rot markiert. **Pos-Nr** = die laufende Positionsnummer aus dem Dokument (`pos.posNr`), damit der Lagerist gegen den Lieferschein prüfen kann (auch im Wareneingang-Detail-Modal sichtbar). **Projekt-/Adress-Picker** (`weOpenProjektPicker`, adaptiert an `projektModus`: GEMA-Objekt-Liste + «＋ Neues GEMA-Objekt» und/oder freies Adressformular, plus «📦 Lager»-Quick) je Zeile UND «für ganze Lieferung» → «⤓ auf alle Zeilen»; **neues GEMA-Objekt inline** (`GemaObjekte.upsertObjekt`, ADD-ONLY, mit `GemaAdresse`-Autocomplete); Bestell-Nr/Datum + Duplikat-Warnung (gleiche Bestell-Nr + Lieferant); «Importieren» bzw. «Importieren & Etiketten drucken».
- **Lager-Positionen (Pool ja, Etikette nein)**: Positionen mit Projekt = «📦 Lager» (`lagerProjekt()` trägt `istLager:true`; `isLagerProj(p)` erkennt es, inkl. Legacy-Fallback ohne Flag) werden **importiert und im Wareneingang kontrolliert**, aber **NICHT als Etikette gedruckt** — `labelsFromLief` überspringt sie, `wePrintPos` blockt, «Importieren & Etiketten drucken» meldet «nur Lager-Positionen». Im Review-Grid + Detail-Modal 📦-Marker.
- **Freie Adresse = Bezeichnung**: Der Freie-Adresse-Picker hat KEIN separates Namensfeld mehr — `name` = Strasse (sonst Ort), also die Adresse selbst (`wePickFrei`). **Adress-Autocomplete** (`GemaAdresse.attach` in Picker/Neues-Objekt/Schnell-Etikette) schreibt PLZ+Ort in **eigene Felder** und ins Strassenfeld **nur Strasse+Nr** (onSelect überschreibt den vollen Anzeige-String zurück auf `r.strasse`).
- **KI-Analyse (Alternative zum Parsing, `quelle:'ki'`)**: Claude analysiert Rechnung/Lieferschein/Auftragsbestätigung als **PDF, Foto ODER Text** und extrahiert Positionen (`bezeichnung/artikelNr/menge`) + Kopfdaten (`lieferant/bestellnummer/bestelldatum`) — auch bei **gescannten Belegen ohne Text-Ebene** und **ohne Spalten-Mapping**. **Nur echte Sanitärartikel** — Nebenkosten (Fracht/Versand/Porto, Verpackung, «Paket klein»/Kleinpaket, Mindermengenzuschlag, Gebühren, Rabatt/MwSt, Summenzeilen) werden per System-Prompt + Tool-Schema herausgefiltert. Serverseitiger Proxy `netlify/functions/claude-extract.js` (Env `ANTHROPIC_API_KEY`, Modell `claude-haiku-4-5`, per `ANTHROPIC_EXTRACT_MODEL` übersteuerbar) mit **erzwungenem Tool-Use** (`tool_choice`) → immer valides JSON gegen das Schema; Dokument/Bild-Block VOR dem Instruktions-Text. Client: `GemaClaude.extractPositions({text?,fileBase64?,mediaType?,filename?})`. Datei ≤ ~3 MB (Netlify-Sync-Limit), sonst Text einfügen. In `if_wareneingang.html`: `renderStep2KI` (Datei-Upload PDF/Bild + Textfeld + «Analysieren»), `weImpKiAnalyze`/`kiApplyResult` (menge gerundet, Datum via `parseDateLoose` → ISO, Kopfdaten füllen nur leere Felder), `weImpToKi` (Fallback-Button in den Parsing-Fehler-Warnboxen — reused das bereits gewählte PDF via `IMP.kiPendingFile`). **Graceful Degradation**: Function 404/500 → Warnbox mit Rückfall auf Tabelle/PDF/manuell, Modul bleibt nutzbar. **Lieferant im KI-Modus in Schritt 1 optional** (Claude erkennt ihn meist); Pflicht erst beim Import (Schritt 3). Inline-`IMP.*`-Mutations laufen über den globalen Setter `window.weImpSet(key,val,dupCheck?)` (IMP lebt in der IIFE → sonst «IMP is not defined» im oninput-Kontext).
- **Etiketten — Druck via HTML + `window.print()`** (KEIN ZPL, kein jsPDF, keine PDF-Datei): eigenes Druckfenster (`window.open`+`document.write`) mit `@page{size:<W>mm <H>mm;margin:0}`, eine `.lbl`-Seite je Etikette (`page-break-after:always`), **Menge = Anzahl Etiketten** (durchnummeriert «1 / N»). **Adress-Layout (User-Vorgabe)**: **Strasse+Nr dominant** (`.lb-addr`, gross), **Ort klein** darunter (`.lb-city`), **KEINE PLZ** auf der Etikette; bei GEMA-Objekten steht der Projektname als kleiner Eyebrow, bei freien Adressen nicht (Name = Adresse). Strasse wird **nur für den Druck** zu «Str.» gekürzt (`abbrevStrasse`, Daten bleiben unverändert). **Nie abschneiden** — der ganze Adressblock (`.lb-addrwrap` inkl. Strasse/Ort/Artikel) wird per JS **auto-gefittet** (Strassen-Schrift verkleinern bis alles passt — im Druckfenster `fitScript` UND in der WYSIWYG-Live-Vorschau `renderPreview`, gleiches Markup `labelInner`). Optional Artikel (Bezeichnung+Nr, **max. 1 Zeile** — `.lb-art` nowrap+ellipsis, «man weiss dann schon was es ist»; klippt statt umzubrechen, drückt so auch nie die Strassen-Schrift kleiner) + Fusszeile (nur Datum·Index — **der Lieferant erscheint bewusst NICHT auf der Etikette**, User-Vorgabe). **Kein Barcode/QR** (User-Entscheid — maximale Fläche für die Adresse). **Etiketten-Format** default **49 × 23 mm** (wie Werkzeug-Etiketten `_WZ_ETIK`, Zebra ZD421), in den Einstellungen frei änderbar (`labelW`/`labelH` mm) — diese eine Zahl steuert `@page` und das Layout. Druck-Hinweis im Fenster: 100 % / «tatsächliche Grösse», Ränder «keine».
- **Rechte**: Schreiben via `GemaAuth.can('write','wareneingang')` (`canEdit()`) — respektiert die Permission-Matrix. `role_lagerist` (NEU) hat wareneingang r/w/a + objekte r/w; Planer-Rollen/Abteilungsleiter/Admin automatisch via `_allPerms` (Projektleiter = Zielperson); Magaziner/Monteur etc. standardmässig KEIN Zugriff (nur per Admin-UI zuweisbar). Seitenzugang wird von `gema_auth.js` über `FILE_MAP` (`if_wareneingang`→`wareneingang`) automatisch erzwungen («Kein Zugriff»-Screen ohne read).
- Test-Hooks: `window._weHooks` (`settings/liefStatus/posStatus/extractHtmlGrid/extractTextGrid/guessCols/applyGridMapping/pdfItemsToGrid/applyPdfBands/mkPos/projModus/gemaObjekteAn/freieAdrAn/defaultProjekt/lieferantKey/findMapping/saveMapping/kiApplyResult/parseDateLoose/newImp/getImp/setImp/lagerProjekt/isLagerProj/abbrevStrasse/labelsFromLief/labelInner/lieferantHistory/getLEdit/liefById`). Playwright-Smoke (localStorage-Seeding Lagerist vs. Monteur, externe Hosts geblockt): Zugriff/4 Tabs/Etiketten-Auto-Fit/HTML-+Text-Grid-Extraktion+Spalten-Heuristik/«Kein Zugriff» für Monteur; plus Projektmodus-Suite (beides/gema/frei); plus KI-Suite (KI-Quelle, Lieferant optional in Schritt 1, `renderStep2KI`, gemocktes `extractPositions`, Datum-Parsing/menge-Rundung, Import-Guard); plus Feature-Suite (KI zuerst+Default, Lieferant-Dropdown aus Historie, posNr durch guessCols/applyGridMapping/KI/Review-Grid, `isLagerProj`+`labelsFromLief` überspringt Lager, freie Adresse `name`=Strasse ohne Namensfeld, `abbrevStrasse` + `labelInner` Strasse-gross/Ort-klein/keine-PLZ/Eyebrow-Logik); plus Edit-Suite (Karten-✏️, `weEditLief`→`LEDIT`, Kopfdaten+Positionen ändern/hinzufügen, Save erhält+klemmt `eingegangenMenge`+Status, Abbrechen verwirft).
- Registriert: gema_auth (MODULES `wareneingang` cat Infrastruktur, FILE_MAP `if_wareneingang`, **neue Rolle `role_lagerist`** + Migration `gema_auth_lagerist_v1`, KATEGORIE_ROLLEN in allen Gebäudetechnik-Kategorien), index.html (Infrastruktur-Kachel `data-module="wareneingang"`), sw.js (v219 — inkl. `gema_claude.js`), gema_recent (PAGE_LABELS). Kein GemaNotify-Event (rein org-intern). KI-Analyse via `netlify/functions/claude-extract.js` (Env `ANTHROPIC_API_KEY`; ohne Key/Deploy funktioniert das Modul mit Parsing/manuell weiter).

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
| `ausschreibung_interesse` | ausschreibung | on |
| `ausschreibung_vergabeantrag` | ausschreibung | on |
| `werkzeug_defekt` | werkzeug | on |
| `werkzeug_zuweisung` | werkzeug | on |
| `werkzeug_pruefung_faellig` | werkzeug | on |
| `werkzeug_pruefung_anfrage` | werkzeug | on |
| `werkzeug_defekt_lieferant` | werkzeug | on |
| `werkzeug_ersatz_anfrage` | werkzeug | on |
| `werkzeug_offerte_lieferant` | werkzeug | on |
| `werkzeug_reparatur` | werkzeug | on |
| `werkzeug_koffer_fehlteil` | werkzeug | on |
| `werkzeug_einbuchung` | werkzeug | on |
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
| `bestellung_neu` | bestellungen | on |
| `bestellung_bestaetigt` | bestellungen | on |
| `bestellung_abgelehnt` | bestellungen | on |
| `bestellung_geliefert` | bestellungen | on |
| `bestellung_empfangen` | bestellungen | on |
| `bestellung_storniert` | bestellungen | on |
| `regie_eingereicht` | regierapport | on |
| `regie_freigegeben` | regierapport | on |
| `regie_abgelehnt` | regierapport | on |
| `einsatz_geplant` | einsatzplan | on |
| `abnahme_freigabe_anfrage` | abnahme | on |
| `abnahme_freigabe_entscheid` | abnahme | on |
| `abnahme_maengel_zugewiesen` | abnahme | on |
| `abnahme_maengel_abgearbeitet` | abnahme | on |
| `hy_schlauchwechsel` | legionellen | on |
| `hy_labor_probe` | legionellen | on |
| `hy_befund_positiv` | legionellen | on |
| `hy_plan_erstellt` | legionellen | on |
| `hy_sanierung_delegiert` | legionellen | on |
| `hy_arbeit_abgeschlossen` | legionellen | on |
| `spuel_faellig` | spuelmanager | on |
| `spuel_aktiviert` | spuelmanager | on |
| `service_faellig` | service | on |
| `service_erledigt` | service | on |
| `stunden_eingereicht` | stundenerfassung | on |
| `stunden_entscheid` | stundenerfassung | on |
| `stunden_topfb` | stundenerfassung | on |
| `stunden_auszahlung` | stundenerfassung | on |
| `ferien_antrag` | stundenerfassung | on |
| `ferien_entscheid` | stundenerfassung | on |

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

### Modul-Status & KPIs (Verknüpfungen, KRITISCH bei Modul-Umbauten)

Der Auto-Status der Modul-Tiles (`_wsAutoStatus`, Config `_WS_STATUS_CFG`) liest die **echten GemaAutoSave-Basis-Keys** (`gema_<autosaveName>__<objektId>` — z.B. `gema_enthaertungsanlage`, `gema_warmwasser_sia385`, `gema_niederschlagsanfall`, `gema_lu_tabelle`), die gewählte Anlage (`gema_<x>_anlage` bzw. `gema_aw_chosen_<kategorie>` von GemaAnlagenwahl) und den **Offertanfrage-Status über die echte OA-Kette** (`GemaProdukte.getOffertanfragen()` nach `objektId`+`kategorie` → «Offerte angefragt»/«Offerte erhalten»; `gema_produktkatalog_api.js` ist dafür eingebunden). «berechnet» kommt aus dem Berechnungs-Index (P04). Status-Erkennung ist eine **generische Heuristik über den flachen AutoSave-Snapshot** — KEINE modul-spezifischen Feld-IDs mehr (die alten waren nach den Modul-Neubauten alle tot). KPI-Pools (`gema_werkzeug`, `gema_vehicles`, `gema_trocknung_v1`) werden via `GemaSync.getCached` gelesen und **immer auf die eigene Org gefiltert** (`pool:true` in MODULE_KPIS). Wird ein Modul umgebaut (neuer AutoSave-Name), MUSS `_WS_STATUS_CFG` nachgezogen werden. Test-Hooks: `window._wsAutoStatusHook/_wsKpiHook`.

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

## GEMA Secure v1 — Server-Auth + RLS (gema-auth Function)

Sicherheits-Schicht über der Cloud-Architektur (Details + Setup: `SECURITY_RLS_ANLEITUNG.md`; SQL: `supabase/gema_rls_v1.sql` + Rollback):
- **Netlify Function `netlify/functions/gema-auth.js`** (ENV: `SUPABASE_SERVICE_KEY`, `GEMA_JWT_SECRET`): `login` prüft Zugangsdaten server-seitig (scrypt-`cred:`-Records; Legacy-djb2 wird beim ersten Login lazy migriert und aus dem user-Payload gestrippt) und stellt ein Supabase-kompatibles JWT aus (HS256, role=authenticated, Claims uid/org/adm, 30 Tage). `register` (Onboarding), `activate` (Einladung via `einladung.token`), `persist_auth` (ALLE user:/org:/role:-Writes mit server-seitiger Rechteprüfung: GEMA-Admin alles; Org-Admin eigene Org ohne role_admin-Vergabe; Selbst-Update ohne Rollen/Org/Status-Änderung; Partner-Einladungen cross-org nur mit INVITE_ROLE_PREFIXES; Deletes nur Admin, löscht `cred:` mit).
- **RLS (`gema_rls_v1.sql`)**: keine anon-Policies (anon-Key nutzlos); authenticated liest alles ausser `cred:%`, schreibt nur `module_key <> 'auth'`; Storage-Upload nur authenticated. `cred:`-Records haben KEINE Policy → nur Service-Key.
- **Client**: `gema_sync.js` sendet `Authorization: Bearer <JWT || anon>` (Token aus `gema_session_v1.token`), **fängt Auth-Collection-Writes ab** (`_routeAuthWrite` → Function; Fallback direkt, solange Function 404 = Kompatibilitätsmodus) und behandelt 401 (Token weg → Login-Redirect, einmalig). gema_autosave/gema_db/gema_objekte_api/gema_storage nutzen das Token via `GemaSync.getAuthToken()`. `gema_auth.js`: `loginAsync` Function-first (401 = falsche Daten, KEIN Legacy-Fallback; 404/Netz = Legacy), `getToken()`, `activateInvitationAsync`; **die Post-Login-Collection-Pulls blockieren den Login max. 2.5s** (`Promise.race`-Timeout — hängende Cloud-Reads machten den Login sonst beliebig langsam; Pulls laufen im Hintergrund fertig, Zielseite pullt beim Boot erneut); **Empty-Read-Guard**: leere Cloud-Antwort überschreibt nie einen gefüllten users/orgs/roles-Cache (RLS ohne Token liefert [] mit HTTP 200). sys_login: Registrierung + Aktivierung Function-first mit Legacy-Fallback.
- **Gleitendes Sitzungsfenster**: `_maybeRefreshToken()` in gema_auth.js (läuft bei jedem Seitenstart, Drossel 1×/6h, erst ab 24h Token-Alter) tauscht das JWT via Function-Action `refresh` gegen ein frisches — «Angemeldet bleiben» hält damit dauerhaft, solange GEMA mind. 1× pro Token-Laufzeit (`GEMA_TOKEN_DAYS`, Default 30 Tage) geöffnet wird; Session `remember:false` (Login ohne Häkchen) refresht nie (1 Tag). Deaktivierte Konten bekommen beim Refresh 401 (weiche Revocation); `session.expires` folgt dem Token-Exp.
- **KRITISCH**: Neue direkte Supabase-Fetches IMMER mit `(GemaSync.getAuthToken() || SB_KEY)` als Bearer bauen; user:/org:/role:-Writes NIE direkt, sondern über GemaSync (Interception). Admin-Konten aus GEMA erstellen funktioniert unverändert (läuft über die Function). Nicht abgedeckt (Stufe 2): per-Org-RLS der Modul-Daten, private Storage-Reads, Function-Rate-Limiting.

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

**Reachability / Offline-Erkennung (Punkt E):** `_lastReachable` wird **nicht** mehr bei jedem einzelnen Fehler auf offline gesetzt. Ein **HTTP 4xx** (ausser 408/429) — typisch **413 Payload zu gross** bei bildlastigen Records — ist KEIN Verbindungsproblem und schaltet NICHT auf offline. Echte Netz-/Server-Fehler (fetch wirft, 5xx, 408, 429) schalten erst nach **zwei Fehlern in Folge** auf offline. Damit erscheint das «Offline»-Banner nicht mehr fälschlich bei bestehendem Internet. **Die aktive Probe (`_probeOnce`) folgt DERSELBEN Klassifikation** — früher schaltete sie bei JEDER nicht-OK-Antwort sofort auf offline: ein **401 wegen abgelaufenem Session-Token** (typisch auf einem lange unbenutzten Zweit-PC; Auslöser z.B. das `online`-Event nach WLAN-Reconnect/Aufwachen) zeigte so fälschlich «Offline» trotz Internet. Jetzt gilt: jede HTTP-Antwort = Server erreichbar; nur Probe-Throw (wirklich unerreichbar) bzw. 5xx/408/429 (Streak-Regel) schalten offline. **401 löst auf ALLEN Pfaden `_handle401` aus** (auch `loadCollection`/`loadRecord`/Probe, nicht mehr nur Writes): totes Token wird aus der Session entfernt + Login-Redirect «Sitzung abgelaufen» — statt leerer Pools + falschem Offline-Banner. **Das Banner selbst ist diagnostizierbar + selbstheilend**: «↻ Erneut pruefen»-Button (manuelle Probe), «Details»-Selbsttest (prüft Supabase UND Netlify-Function getrennt — erkennt den Fall «Internet ok, aber supabase.co von diesem Gerät blockiert» durch Firewall/Werbeblocker/DNS; der Login läuft same-origin über die Function und funktioniert dann trotzdem) und Auto-Reprobe alle 20s solange das Banner steht.

**Same-Origin-Proxy-Fallback (KRITISCH — Geräte mit blockiertem supabase.co):** netlify.toml proxied `/sb/*` → Supabase (status 200, Header werden weitergereicht). Wirft der direkte Weg in der Probe (`_probeOnce`), testet sie automatisch den jeweils ANDEREN Weg (direkt ⇄ `location.origin+'/sb'`) und schaltet um (`_setProxy`, Flag `gema_sb_proxy_v1` in localStorage — überlebt Reloads; Rückschaltung sobald der direkte Weg wieder antwortet). Als Ausweichweg zählen nur PostgREST-typische Antworten (2xx/400/401/403/406) — **404 heisst «Proxy-Route nicht deployed»**, 5xx «Server krank». Probe-Fetches haben 6s-AbortController-Timeout. **`GemaSync.SB_URL` ist ein GETTER** (via `Object.defineProperty`) und liefert immer die aktive Basis — gema_auth/gema_storage folgen automatisch; gema_autosave/gema_objekte_api/gema_db lesen zur Laufzeit via lokalem `_sbBase()` (`GemaSync.SB_URL || eigene Konstante`). **Neue Supabase-Fetches: NIE die URL-Konstante direkt verwenden, immer `_sbBase()` bzw. `GemaSync.SB_URL` zur Laufzeit.** sw.js behandelt `/sb/`-Pfade wie supabase.co (immer Netzwerk, nie Cache).

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
| Ausschreibungen | `ausschreibung` | `aus:` | `gema_aus_pool_v1` |
| Ausschreibungs-Beteiligte | `ausschreibung` | `ausbet:` | `gema_ausbet_pool_v1` |
| Interesse-Anfragen | `ausschreibung` | `ausanf:` | `gema_ausanf_pool_v1` |
| Verteilungen | `ausschreibung` | `ausvrt:` | `gema_ausvrt_pool_v1` |
| Offert-Einreichungen | `ausschreibung` | `ausein:` | `gema_ausein_pool_v1` |
| Netto-Anfragen | `ausschreibung` | `ausna:` | `gema_ausna_pool_v1` |
| Marktplatz-Offerten | `ausschreibung` | `ausmk:` | `gema_ausmk_pool_v1` |
| Schnellausschreibungen | `schnellausschreibung` | `sa:` | `gema_sa_pool_v1` |
| Armaturen-Katalog | `armaturen` | `arm:` | `gema_armaturen_pool_v1` |
| Bestellungen (Anlagen) | `bestellungen` | `best:` | `gema_best_pool_v1` |

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

### Safe-Area / Statusleiste (KRITISCH — Notch, Dynamic Island, installierte App)

Als installierte PWA (display:standalone) + `viewport-fit=cover` liegt die Seite HINTER der System-Statusleiste — ohne Gegenmassnahme ragte die Nav in Uhrzeit/Frontkamera. Das Safe-Area-System (validiert per Playwright + CDP `Emulation.setSafeAreaInsetsOverride`):

- **Alle 77 Seiten** tragen im `<head>` nach dem Viewport-Meta die vier PWA-Metas (`mobile-web-app-capable`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent` → weisse Statusleisten-Schrift, `apple-mobile-web-app-title`). **Bei neuen Seiten mitgeben.**
- **`gema_responsive.css` Abschnitt 13**: (1) `html::before` = fixer Streifen in theme-color `#0f172a` über die Inset-Höhe, z-index 10500, IMMER zuoberst am Viewport — schützt die weisse Statusleisten-Schrift auch, wenn die Nav wegscrollt oder eine Seite keine `.g-nav` hat (`body::before` ist auf sys_login belegt → deshalb `html`). (2) `.g-nav` bekommt den Inset als `padding-top`, Höhe wächst per `calc(72px + env(safe-area-inset-top))`. Browser/Desktop: `env() = 0` → alles unsichtbar. Landscape-Insets links/rechts liegen als Padding auf dem `body`.
- **Fixed-top-Elemente padden sich selbst um den Inset**: Offline-Banner (gema_sync.js), Notify-Panel/Toasts (gema_notify_ui.js, `top:calc(56px/66px + env(…))`), Feedback-Overlay (gema_feedback.js); GemaDialog + Mobile-Menü waren schon safe-area-aware. **Jedes NEUE `position:fixed`-Element mit top-Bezug braucht `env(safe-area-inset-top)`** (unten analog `safe-area-inset-bottom`, vgl. Abschnitt 8 act-bar/footer-bar).
- **`overflow-x: clip` statt `hidden` auf html/body (NIE zurückdrehen!)**: `overflow-x:hidden` erzwingt per Spec `overflow-y:auto` → html/body werden Scroll-Container → **`position:sticky` klebte auf KEINER Seite mehr** (die Nav scrollte weg, obwohl sie «immer sichtbar» sein soll). `clip` klippt horizontal identisch, erzeugt aber keinen Scroll-Container. Die `hidden`-Zeile davor bleibt als Fallback für sehr alte Browser stehen.

### Kompakter Modul-Kopf auf Phone (gema_responsive.css Abschnitt 16)

Auf ≤640px zeigt der Modul-Hero nur Icon + Titel (`.gema-hero-norm`, `.gema-hero-sub` und `#gemaDataflowPill` sind ausgeblendet — Norm-Badge/Untertitel sind Desktop-Kontext); die `.project-bar` ist zweispaltig kompakt (Objekt volle Breite, Bearbeiter/Datum/SIA-Phase halbbreit). Damit beginnt die erste Berechnungs-Karte bei ~400px statt ~700px — die Berechnung ist ohne Scrollen im ersten Screen. Desktop/Tablet unverändert.

### iOS-Feel auf Touch-Geräten (gema_responsive.css Abschnitt 14)

GEMA soll sich installiert wie eine native App anfühlen: global `-webkit-tap-highlight-color: transparent` (Feedback über `:active`-Zustände statt grauem Blitz), `touch-action: manipulation` auf allen Bedienelementen (kein Doppeltipp-Zoom-Delay), UI-Controls (Buttons/Chips/Tabs/Nav) auf coarse Pointern nicht selektierbar + ohne Long-Press-Callout, einheitliches Press-Feedback (`scale(0.96)`); Inhalte (Inputs/Tabellen/Resultate) bleiben selektierbar. Inputs stehen global auf ≥16px (kein iOS-Fokus-Zoom, Abschnitt 1). Desktop-Verhalten unverändert (alles hinter `@media (hover:none) and (pointer:coarse)` bzw. wirkungslos ohne Touch).

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
| `gema_armaturen_api.js` | **Armaturen-Katalog** (ζ + kvs pro Dimension, Druckverlustdiagramm, Lieferanten-CRUD). `getDp(id,dn,{Q_ls,v_ms,rho})` (kvs bevorzugt: `Δp=(Q/kvs)²·100 kPa`, sonst `ζ·ρ/2·v²`), `computeSelectionDp(sel,ctx)` für Berechnungsmodule, `curvePoints(id,dn,opts)` für generierte Kennlinien, `upsertArmatur`/`deleteArmatur` (Defaults via Tombstone). Cloud per-Record (`arm:`), Defaults bleiben lokaler Seed. |
| `gema_armaturen_picker.js` | **Armaturen-Auswahl-Widget** für Berechnungsmodule: Katalog mit Zähler + ζ/kvs pro aktueller Dimension, manuelle Einträge (Name + Δp, Einheit kPa/Pa/mbar), Diagramm-Overlay (Lieferanten-Upload oder generierte Δp-Q-Kurve mit Betriebspunkt), `drawCurve(canvas,…)` für PDF-Sektionen. Modi `multi` und `kvs-single` (Zirkulations-Regulierventil). |
| `gema_auth.js` | Auth, Rollen, Orgs, Permissions, Cloud-Recovery |
| `gema_autosave.js` | Auto-Save in Berechnungsmodulen |
| `gema_bestellungen_api.js` | **Bestellprozess für Anlagen** (`window.GemaBest`): per-Record-Pool `best:`, Nummernkreis `BST-JJJJ-NNN` pro Org, Status-Übergänge `create/bestaetigen/ablehnen/geliefertMelden/empfangBestaetigen/stornieren` (je mit Verlauf + Notifikation), `bind()`/`getForOrg()`/`getForLieferant()`, `badgeHtml`/`fmtChf`. Konsumenten: pm_bestellungen, pm_ausschreibungsunterlagen (Gewinner-Sektion), sys_lieferant_dashboard (🛒-Tab). |
| `gema_coachmarks.js` | Onboarding-Touren |
| `gema_db.js` | Legacy Storage-Layer (`_GemaDB`). Cloud-First, aber Blob-pro-Modulkey. Neue Module nutzen stattdessen `gema_sync.js`. |
| `gema_sync.js` | **Cloud-First Per-Record-Sync.** Single source of truth Supabase, eine Row pro Datensatz, Diff-Saves, Offline-Banner. `bindCollection`/`persistCollection` als Modul-Helper. Siehe „Cloud-First Storage-Architektur". |
| `gema_dialog.js` | Eigene Alert/Confirm/Prompt-Dialoge im GEMA-Style. `window.alert` global ueberschrieben. `GemaDialog.confirm({title,message,danger}).then(ok=>…)` und `GemaDialog.prompt(...)` als Promise-API. `window.confirm` bleibt nativ (sync), neue Stellen sollen GemaDialog nutzen |
| `gema_feedback.js` | Feedback-Overlay mit Annotation |
| `gema_lu_api.js` | LU-Zusammenstellung Cross-Modul-API |
| `gema_mobile_menu.js` | Hamburger-Menü auf Mobile (v2, iOS-Feel): Sektionen Navigation (Startseite/Projekte, permission-guarded) · Zuletzt verwendet (via `GemaRecent`) · Aktionen (Seiten-Buttons, ohne Chevron) · Verwaltung (admin) · Konto (Einstellungen/Feedback/Abmelden); tappbarer User-Block → sys_profil; Footer «Als App installieren» (wenn GemaPWA bereit); Swipe-nach-rechts schliesst; Body-Lock via GemaScroll. **Verschiebt die Notify-Glocke (`.gn-btn`) auf Mobile NEBEN den Hamburger** (Klasse `gn-btn--nav`) statt sie mit `.g-nav-right` zu verstecken — Badge bleibt sichtbar; Desktop-Resize stellt sie zurück |
| `gema_notify.js` | Notifikations-Engine |
| `gema_notify_ui.js` | Glocke + Toast-UI |
| `gema_objekte_api.js` | Objekte/Projekte Cross-Modul-API |
| `gema_offer_request.js` | Externe Offertanfragen |
| `gema_offerten_tab.js` | Offerten-Tab in Berechnungsmodulen |
| `gema_pdf.js` | PDF-Export via html2canvas |
| `gema_schaden_pdf.js` | **Schadensbericht HTML/Print-Export** nach `vorlagen/bericht_wasserschaden_vorlage.html`. `GemaSchadenPDF.exportPrint(schaden, {org,user,objektName,objektAdresse})` öffnet neues Fenster mit A4-Layout (window.print()). Logo-Branch: `org.logoVector || org.logo` wenn vorhanden, sonst eingebettetes GEMA-SVG. Filtert `f.imBericht !== false`. |
| `gema_dachbericht_pdf.js` | **Dachbericht HTML/Print-Export** für Spenglerei. `GemaDachberichtPDF.exportPrint(bericht, {org,user,objektName,objektAdresse,templates})` — gleicher Pattern wie Schaden-PDF. Bilder-Grid mit 4/6-Seitenfüllung in 6er-Chunks. |
| `gema_claude.js` | **Claude-API-Client** für Texthilfe. Ruft `/.netlify/functions/claude-rewrite`. Modi: `rewrite`/`bulletpointsToText`/`fix`/`shorten`/`expand`. Eingesetzt in `sp_dachbericht.html` für KI-gestützte Textüberarbeitung. **Dazu `extractPositions({text?,fileBase64?,mediaType?,filename?})`** → `/.netlify/functions/claude-extract` für die Dokument-Analyse im Wareneingang (Rechnung/Lieferschein/Auftragsbestätigung → strukturierte Positionen). |
| `gema_produktkatalog_api.js` | Produkte + Stammlieferanten + Favoriten |
| `gema_push.js` | Web-Push-Vorbereitung (Service-Worker) |
| `gema_pwa.js` | PWA-Install-Helper (`beforeinstallprompt`-Capture, `GemaPWA.install()`) |
| `gema_qr_scanner.js` | QR-Code-Scanner (`GemaQR.scan(cb)`) |
| `gema_nfc_scanner.js` | Web-NFC-Reader mit automatischem QR-Fallback. `GemaNFC.scan({mode:'auto',onScan})` nutzt `NDEFReader` wenn verfügbar, sonst `GemaQR`. `GemaNFC.parseTgUrl(payload)` extrahiert Geräte-ID aus URL oder Direkt-String. iPhone-Hinweis automatisch eingeblendet (kein Browser-NFC, aber Hintergrund-Scan öffnet URL). |
| `gema_recent.js` | Tracking + Anzeige zuletzt genutzter Module. `PAGE_LABELS` = vollständige Map ALLER Seiten (aus `<title>` generiert — bei neuen Seiten ergänzen!); Public API `window.GemaRecent {list, label, currentKey}` fürs Mobile-Menü |
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
19. ☐ Freistehende Zahlen-Inputs mit angeschlossener Einheits-Box (`.g-inp-group`/`.fg-unit`)?
20. ☐ Zentrale Resultate mit `.frml`-Formel-Chips / Tabellen mit `.frml-block`-Legende?
21. ☐ Keine sichtbaren Excel-/Vorlage-Verweise oder Zellbezüge im UI-Text?