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

### Fünf Medien-Netze

Jeder Verbraucher in der LU hat ein zugeordnetes Medium:

| Medium | LU-Medium-ID | Leitungsnetz | Zielmodule |
|--------|--------------|-------------|------------|
| **Trinkwasser (kalt)** | `kw` (Alias `trinkwasser`) | Trinkwassernetz | Druckerhöhung (l/s) |
| **Enthärtetes Wasser** | `bw` (Alias `enthaertet`) | Trinkwassernetz | Enthärtungsanlage (l/s + Härtegrade) — Apparate die NUR enthärtetes Wasser brauchen |
| **Enthärtetes Wasser für Osmose** | `ow` (Alias `osmose`) | Trinkwassernetz | Osmoseberechnung (l/s) → Enthärtungsanlage (Permeat + Konzentrat) |
| **Regenwasser (RW)** | `gw` (Alias `regenwasser`) | Separates Leitungsnetz | Eigene Pumpe/Druckerhöhung (l/s) |
| **Grauwasser (GW)** | `grau` (Alias `grauwasser`) | Separates Leitungsnetz | Eigene Auswertung (l/s) — Feedback 17.07. |

**Label-Fix 07/2026 (KRITISCH):** `gw` hiess historisch fälschlich «Grauwasser (GW)», meinte aber IMMER das Regenwasser-Netz. Die ID bleibt `gw` (Bestandsschutz gespeicherter Daten), Label/Kürzel sind auf «Regenwasser (RW)» korrigiert (sb_lu_tabelle MEDIA + gema_lu_api MEDIA; `_loadAdminData` verwirft gespeicherte Admin-Overrides mit dem alten Default-Label, bewusste eigene Umbenennungen bleiben). Grauwasser ist seither ein EIGENES Medium `grau`; der frühere API-Alias `'grau'→gw` ist entfernt (`'regen'→gw` bleibt).

**Zusammenstellung nach Leitungsnetz (Feedback 14.07./17.07.):** In `sb_lu_tabelle` zählen Apparate auf einem alternativen Leitungsnetz (`NETZ_ZU_MEDIUM`: enthaertet→bw, osmose→ow, regenwasser→gw, grauwasser→grau) mit ihrem LU-Total im JEWEILIGEN Medium (eigene W3-Auswertung je Medium inkl. Einzelapparat-Regel, Max-LU-Buttons) — nicht mehr in KW/WW/ND. Die Apparate-Tabelle hat dafür eine eigene **«Netz»-Spalte** zwischen ND und Total (LU-Wert in Netzfarbe statt nur Striche; Feedback 17.07.), die Ergebnis-Hauptwerte listen alle Medien mit Beitrag; die Apparate-Zeile zeigt hinten «N LU · RW»-Chips statt irreführender KW/WW-Werte. Die Enthärtungs-Verbrauchertabelle (sa_enthaertung) führt bis zu 10 Zeilen (A–J, G–J via «＋ Verbraucher»), E (Dauerverbraucher) + F (Gegenosmoseanlage) laufen OHNE LU direkt über l/s, jede Zeile hat eine «+ manuell [l/s]»-Zuschlagsspalte (1:1 addiert) und eine berechnete Spalte «über Enthärter [l/s]» (Verschnitt-anteilig); Härte V unter HW,min ist zulässig, wird aber gewarnt.

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

**Produktions-Seed mit realen Herstellerdaten**: `supabase/gema_lieferanten_seed_v1.sql` (im Supabase-SQL-Editor ausführen; Rollback daneben) legt 14 reale Lieferanten (BWT, Grünbeck, Grundfos, Wilo, KSB, Nussbaum, Geberit, GF JRG, Oventrop, Taconova, Flamco, IMI, GWF, Resideo), 27 Produkte über 10 Kategorien und 5 Armaturen-Records (kvs/ζ) an — ALLE bewusst `nicht_verifiziert` (Testbasis für den Verifizierungs-Workflow). IDs mit festen Präfixen `lief_seed_`/`prod_seed_`/`arm_seed_`; `ON CONFLICT DO NOTHING` (Re-Run überschreibt NIE — auch nicht inzwischen Verifiziertes). Quelle/Generator: `scripts/lieferanten_seed_gen.mjs` (validiert gegen die Live-KATEGORIEN-Schemata + SQL-Roundtrip; Daten dort ändern, dann neu generieren); E2E-Test `scripts/lieferanten_seed_test.mjs` (27 Checks: Import-Validierung, Kataloge, matchFn, Armaturen-Δp, Dashboard-Admin-Vorschau). **Chat-Recherche-Workflow**: `--prompt` erzeugt `scripts/lieferanten_seed_prompt.md` (Recherche-Auftrag für Claude-Chat mit ALLEN Kategorie-Feld-IDs aus den Live-Schemata — Antwortformat ist EIN JSON-Codeblock); `--import <daten.json>` validiert das Chat-JSON (Feld-IDs, Select-Optionen, Zahlentypen, Lieferant-Keys) und schreibt `supabase/gema_lieferanten_seed_import_<name>.sql` (deterministische IDs → Re-Import idempotent; Status automatisch nicht_verifiziert).

### Offertanfrage-Workflow (End-to-End)

1. **Planer** sendet aus einem Berechnungsmodul (Enthärtung, Osmose, Druckerhöhung …) eine Offertanfrage. **KRITISCH — Payload-Regel**: `berechnungswerte` enthält IMMER die **berechneten Projektwerte** (z.B. `_enthaertungBerechnungswerte()` / `_osmoseBerechnungswerte()`), NIE die Datenblatt-Werte der gewählten Anlage — die gewählte Anlage geht separat via `produktId`/`produktName` mit. (Früherer Bug: `d.nenndurchfluss` etc. aus dem Produkt wurde als «Berechnung» mitgeschickt.)
2. `GemaProdukte.createOffertanfrage()` **reichert `projekt` aus dem GEMA-Objekt an** (Name, `nummer`, `adresse` aus `strasse/plz/ort`) — der Lieferant hat keinen Zugriff auf fremde Org-Objekte, alles Nötige muss im OA-Record stehen. Danach speichern (per-Record `oa:`) und **Lieferant benachrichtigen** (`offertanfrage_neu`): bevorzugt alle User mit passender `user.lieferantId`, Fallback Lieferanten-Org (nie `org_default`).
3. **Lieferant** prüft die Anfrage im Dashboard: Anfragen-Karte und Beantworten-Modal zeigen **Projekt (mit Adresse), berechneten Bedarf (`_oaBwRowsHtml`, Label-Map `_OA_BW_LABELS`) und die vom Planer gewählte Anlage inkl. Kennwerten** (`_oaAnlageSpecsHtml` — löst `produktId` im eigenen Katalog auf, zeigt Allgemein-+Leistungsdaten-Felder) nebeneinander zur **Gegenprüfung**. Die angefragte Anlage ist im Antwort-Dropdown vorausgewählt. Die Offerte erstellt der Lieferant extern (ERP/SAP) und hängt sie an: Preis, Nachricht, optional **Offerte als PDF**. Das PDF wird via `GemaStorage.uploadDataUrl` in den Bucket `gema-fotos` (Pfad `offerten/<lieferantId>`) ausgelagert → `antwort.pdfUrl`; Base64-Fallback (`antwort.pdfDataUrl`) nur bei Upload-Fehler und ≤ 2.5 MB. Max. 10 MB.
4. `beantworteOffertanfrage()` **benachrichtigt den Planer** (`offertanfrage_beantwortet`, Link `pm_objekte.html?tab=offerten&objekt=…`) und legt die Vormerkung fürs Objekt an. Ablehnung analog (`offertanfrage_abgelehnt`). **KRITISCH — Vormerkungen sind Cross-Gerät ABGELEITET**: Der lokale Vormerkungs-Store (`gema_offert_vormerkungen_v1`, NUR localStorage) entsteht beim Beantworten auf dem Gerät des LIEFERANTEN und erreicht den Planer nie. `GemaProdukte.getVormerkungen(objektId)` leitet Vormerkungen deshalb zusätzlich aus den **beantworteten OAs** ab (die sind per-Record cloud-synct; deterministische id `vm_oa_<oaId>`, bkpCode aus `OA_BKP_MAP`); ein lokaler Record mit derselben `offertanfrageId` gewinnt. `markVormerkungUebernommen('vm_oa_…')` legt lokal einen uebernommen-Tombstone an.
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

## Abo- & Preissystem (GemaAbo)

Preispolitik nach Rollen (Preisblatt Robin 07/2026; Schema + offene Fragen/Annahmen A1–A4 in `KONZEPT_Abos_Preise.md`). Drei Bausteine: **`gema_abo_api.js`** (`window.GemaAbo`), Preisseite **`sys_preise.html`** (komplett neu, datengetrieben — der alte statische Starter/Professional/Enterprise-Entwurf wurde ersetzt) und Admin-Modul **`sys_abos.html`** («Abos & Preise», verlinkt als Tab in sys_admin).

- **Preismodell**: Gratis-Nutzer (CHF 0, voller Funktionsumfang, **Token-Budget** 500/Monat) · **Planer** S/H/L (Person CHF 10 «Nur S/H/L»; Firma Grundabo I–V: 50/2, 100/5, 165/10, 250/15, 350/20 Nutzer — «H/L/S + Admin») · **Zusatz-Gewerk +20%** des Firmen-Abopreises je weiteres Gewerk (Modus umschaltbar: pro_gewerk/alle_pauschal/rabatt) · **Zusatz-Nutzer über dem Stufen-Limit proportional zum Abo** (`cfg.zusatzNutzer`: Preis/Nutzer = Abopreis inkl. Gewerke ÷ inkl. Nutzer × Faktor%, Default 100 — z.B. Grundabo III 165/10 → CHF 16.50; gilt für Firmen- + Installateur-Abos, abschaltbar) · **Architekten** wie Planer, aber «Nur PM» bzw. «PM + Anfragen», ohne Gewerke · **Studenten** (`rollen.studenten`, nur Person: CHF 0, `verifizierung:true` → Bestellung startet IMMER als «angefragt», GEMA prüft Ausbildungsnachweis und aktiviert; aktive Lizenz = wie Bezahl-Abo ohne Token-Limit) · **Installateure Zusatz-Abo** I–IIII (100/10, 250/25, 450/45, 600/60 Nutzer; Add-on und/oder standalone, umschaltbar) · **Hersteller transaktionsbasiert** (Offertanfrage 1% / Ausschreibung 3% / Bestellung 6%, Registrierung gratis; Modell umschaltbar auf «nur bei Bestellung, Satz nach Herkunftskanal») — **öffentlich NICHT beziffert**: die Preisseite zeigt «Konditionen auf Anfrage» mit Kontakt-Button (`hersteller.oeffentlichAnzeigen:false`, Toggle im Admin). Pro Stufe zusätzlich Speicher (GB) + Serveranfragen/Tag. Übergreifend: MwSt 8.1%, Jahresrabatt 10%, Trial 14 Tage, Kündigungs-/Zahlungsfrist 30 Tage, Promo-Codes, Token-Zukaufpakete — ALLES im Admin einstellbar (`ABO_DEFAULT_CFG` sind nur Startwerte; `aboDeepMerge` legt die gespeicherte Config über die Defaults, neue Felder erscheinen automatisch).
- **Storage (moduleKey `abos`)**: Config `abocfg:main` (EIN Record, Cache `gema_abo_cfg_v1`, stale-while-revalidate) · Abos `abosub:` → `gema_abo_sub_pool_v1` (deterministische IDs: `sub_<orgId>_grund`, `sub_<orgId>_inst`, `sub_user_<userId>` — Re-Bestellung überschreibt statt dupliziert; Verlauf-Array als Audit) · Token-Ledger `abotok:` → `gema_abo_tok_pool_v1` (ein Record pro User+Monat `tok_<userId>_<YYYY-MM>` bzw. `_gesamt` bei einmaliger Gutschrift). **Pools sind org-übergreifend → NUR `GemaSync.saveRecord`, NIE persistCollection.**
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (DOM-frei, Node-Tests 29+22+15 grün): `aboPreis(cfg,planId,{zusatzGewerke,zusatzNutzer,zahlweise,promo})` (Rappenrundung 0.05, MwSt, Jahres-/Promo-Rabatt, `proNutzer`/`nutzerZusatz` proportional), `aboPlanIndex/aboPlanById`, `aboPromoFind`, `aboHerstellerGebuehr(cfg,vorgang,betrag,kanal)` (beide Modelle), `aboTokenStatus`, `aboAktionKosten`, `aboNutzerLimit` (Summe maxNutzer aktiver Abos einer Org **plus `sub.zusatzNutzer`**), `aboDeepMerge`, `aboRound5`, `aboMonatKey`; **Modul-Matrix**: `aboModulSpalten` (Spalten dynamisch aus cfg.rollen: gratis, `<gruppe>_person`, `<gruppe>_firma`, installateur — Person-/Firma-Spalte nur wenn die Gruppe sie hat, Studenten haben z.B. nur Person), `aboModulDefault` (Default-Regeln je Spalte: Gratis=alles, Studenten=alles, Planer-Person=Berechnungs-Kategorien+objekte, Planer-Firma=Vollzugang, Architekt=Projektmanagement, Installateur=Werkzeug/Baustelle — neue Module sind damit automatisch sinnvoll vorbelegt), `aboModulMatrix(cfg,module)` (gespeicherte Zellen aus `cfg.module.zuweisung` gewinnen über Defaults; nur Abweichungen werden gespeichert), `aboEinzelModulPreis(cfg,modulKey,opts)`.
- **Modul-Matrix & Einzelmodule (cfg.module)**: `zuweisung[modulKey]={<spalteId>:bool}` definiert, welche GEMA-Module (aus `GemaAuth.getModules()`) in welchem Abo enthalten sind; `einzelPreise[modulKey]=CHF/Mt` macht ein Modul **abseits der Abos einzeln buchbar** (0/fehlend = nicht buchbar). Einzelmodul-Bestellung: planId `modul_<key>` → Sub-Record `sub_<orgId>_mod_<key>` mit `typ:'modul'`+`modulKey` — zählt NICHT als Grundabo (`getEffective` ignoriert modul-Subs; Token-Budget bleibt für Gratis-Nutzer bestehen). `GemaAbo.hatModul(modulKey,user)` prüft Zugriff über die Matrix-Spalten ALLER aktiven Abos der Org (Person + Firma + Installateur) plus direkt gebuchte Einzelmodule, Fallback Gratis-Spalte — Definition/Vorbereitung; das harte per-Org-Gating ist der separate, geplante Schritt «Modul-Freischaltung pro Kunde».
- **Public API**: `getConfig()/saveConfig(cfg)` · `preis/planById/planIndex/promoFind/herstellerGebuehr/nutzerLimitForOrg/fmtChf` · **Module**: `getModules/modulSpalten/moduleMatrix/einzelModulPreis/einzelModule/hatModul` + `spaltenFuer(cfg)/matrixFuer(cfg)` (explizite Config — für den Admin-Editor mit Arbeitskopie) · `getSubs/getSubsForOrg/getSubForUser/getEffective(user)` (Person-Abo → Org-Abo → gratis; Einzelmodul-Subs zählen nicht) · `isPaying` · `bestellen(opts)` (deterministische Sub-ID, `modul_<key>`-planIds für Einzelmodule, Status: neu+Trial→`trial`, Rechnung→`aktiv`, Karte→`angefragt` solange Stripe aus; Notify `abo_bestellung` an role_admin) · `setStatus(subId,status,grund)` (Admin; Notify `abo_status` an Besteller) · **Tokens**: `getTokenStatus(user)` (`{unbegrenzt:true}` für Bezahl-Abos bei Geltung `nur_gratis`), `charge(aktionId,anzahl)` (Promise `{ok,rest,ueberzogen}` — `ok:false` bei hartem Limit; Warn-Notify `abo_tokens_knapp` ab Schwelle, 1×/Monat-Lock `gema_abo_warn_lock_v1`), `topupKaufen(paketId,zahlung)`, `getTokenLedger()` · `startStripeCheckout(payload)`.
- **Token-Integration in Module (Muster)**: vor der Aktion `GemaAbo.charge('pdf_export').then(r=>{ if(!r.ok){ GemaDialog.alert({title:'Token-Budget aufgebraucht', message:'…sys_preise.html…'}); return; } … })` — Aktions-IDs = `tokenAktionen[].id` aus der Config (berechnung_neu, pdf_export, ki_text, ki_dokument, offertanfrage, ausschreibung, bestellung, upload_datei, speicher_mb, sync_100). Verdrahtung in die einzelnen Module folgt schrittweise — API/Buchführung/Admin stehen.
- **sys_preise.html** (in `_isLoginOnly` — jeder eingeloggte User; **Kachel-Design, kompakt**): **Rollen-Navigation als Apple-Segmented-Control** («Für Planer / Installateure / Architekten / Studenten», gleitender `.rn-thumb`, Reihenfolge hart codiert, weitere cfg.rollen-Gruppen werden angehängt) über einer **animierten Kachel-Bühne** — Wechsel Apple-mässig dezent (Höhen-Transition auf `.abo-viewport`, Stage gleitet richtungsabhängig raus/rein mit `cubic-bezier(.32,.72,0,1)`, Kacheln staggern mit `tileIn`-Delay, `prefers-reduced-motion` respektiert). Pro Tab **hochformatige Kacheln nebeneinander** (`.tilerow`, horizontal scrollbar auf Mobile): Person-Kachel + alle Firmen-Stufen (bzw. Installateur-Stufen; Studenten = eine Gratis-Kachel), je mit Nutzer-Pill, Preis, «+ CHF x je weiterer Nutzer»-Hinweis (aus `p.proNutzer`), Limits und CTA; `beliebt:true`-Stufen tragen den «Beliebteste Wahl»-Badge; Gewerk-Chips (nur Planer) über der Kachelreihe mit Live-Preis; gemeinsame Features + 🧩-Modul-Zähler als Zeile darunter. Dazu Gratis-Strip, **Einzelmodul-** (nur Module mit `einzelPreis>0`), **Hersteller-Sektion «Konditionen auf Anfrage»** (Kontakt-Button → Feedback; Prozente nur bei `oeffentlichAnzeigen:true`), Token-Sektion; Monat/Jahr-Toggle; «Mein Abo»-Banner. **Checkout-Modal** (Promo-Code, **Zusatz-Nutzer-Stepper** mit proportionalem Preis, Zahlungsart Karte/Rechnung — bei CHF 0 ausgeblendet, Verifizierungs-Hinweis + «Kostenlos beantragen» bei Studenten) → `GemaAbo.bestellen`. Karte bei `stripe.enabled` → `startStripeCheckout` (Redirect), sonst Hinweis «vorbereitet» + Bestellung als `angefragt`.
- **sys_abos.html** (NUR role_admin — nicht in FILE_MAP → `_detectModuleKey()`='sys_abos' hat keine Rollen-Permission, Admins passieren via `_isAdmin`; zusätzlich In-Page-Guard, defensiv weil gema_auth bei fehlender Permission den Body ersetzt): 6 Tabs — **Abonnenten** (KPIs aktiv/trial/angefragt/MRR, Statuswechsel aktivieren/sperren/beenden mit Grund + Verlauf, «＋ Abo manuell zuweisen» für Orgs inkl. Einzelmodulen), **Pläne & Preise** (Person-/Stufen-Editoren pro Gruppe inkl. Studenten, Zusatz-Gewerk-Modus+%, **Zusatz-Nutzer-Karte** aktiv+Faktor%, Installateur-Verfügbarkeit), **🧩 Module** (Matrix ALLE Module × Abo-Spalten mit Spalten-Toggle «alle ⇄» + Einzelpreis-Spalte; nur Abweichungen von den Default-Regeln werden gespeichert), **Tokens** (Budget/Reset/Geltung/Limit-Verhalten/Warnschwelle, Aktions- und Paket-Tabellen, Verbrauchs-Übersicht des Monats), **Hersteller** (Modell, %-Sätze, Gebühren-Rechner, Toggle «Konditionen öffentlich anzeigen» — aus = Preisseite zeigt «auf Anfrage»), **Abrechnung & Zahlung** (MwSt/Jahresrabatt/Trial/Fristen, Stripe-Toggle+Publishable-Key, Promo-Codes). Arbeitskopie + Save-Bar «Speichern & veröffentlichen» → `saveConfig` (wirkt sofort auf die Preisseite). Deep-Link `?tab=…`.
- **Stripe (VORBEREITET, nicht aktiv)**: `netlify/functions/stripe-checkout.js` + Redirect `/api/stripe-checkout` — erstellt eine Checkout-Session (Env `STRIPE_SECRET_KEY`, optional `STRIPE_PRICE_MAP` planId→priceId für echte recurring Subscriptions; ohne Key → 501). Offen: `stripe-webhook.js` (checkout.session.completed → Abo serverseitig aktivieren). Bis zur Aktivierung laufen Karten-Bestellungen als «angefragt» und werden manuell/per Rechnung abgewickelt.
- Registriert: sw.js (v238: sys_abos.html + gema_abo_api.js), gema_recent (Labels), gema_notify (3 Keys), sys_admin (Tab-Link «💳 Abos & Preise ↗»). `sys_abos` bewusst NICHT in MODULES/FILE_MAP (Admin-only via Fallback-Key).

---

## Rollen & Zugangssystem

Jede Rolle hat ein eigenes Login mit rollenspezifischer Ansicht.

### Rollen×Modul-Matrix-Test (Drift-Guard) — `scripts/rolematrix_test.mjs`

Playwright-Test, der die komplette Zugriffsmatrix absichert und **stillen Rollen-Drift** abfängt (jedes neue Modul erscheint automatisch in der Matrix, weil der Test `GemaAuth.getModules()/getRoles()` live aus der App liest). Vier Schichten: **Layer A** Struktur-Invarianten (keine verwaisten Permission-Keys, alle FILE_MAP-Ziele echt, kein write-/admin-ohne-read), **Layer A2** `can(read/write/admin)` für ALLE 29 Rollen × alle Module → Vergleich gegen `scripts/rolematrix_golden.json` (jede Rechteänderung failt bewusst, bis das Golden neu erzeugt wird), **Layer B** echte Navigation (Kein-Zugriff-Screen wo nötig, Modul lädt wo erlaubt), **Layer C** Hard-Locks (Monteur Werkzeug/Fahrzeug trotz write-Grant, Studenten-Gating mit/ohne Klassen-Cache). Ausführen: `CHROME=<chromium> node scripts/rolematrix_test.mjs` aus einem Ordner mit `playwright-core` (ESM sucht `node_modules` aufwärts). **Golden nach bewusster Rechteänderung neu erzeugen**: Datei löschen, Test einmal laufen lassen. Der Test fand den `_fzCanEdit`-Reihenfolge-Bug (siehe if_fahrzeug-Abschnitt).

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
| **Immobilienverwalter** (`role_immoverwalter`) | Immobilienverwaltung + Spülmanager | Verwaltet Liegenschaften/Wohnungen/Mietverhältnisse (iv_immobilien, r/w/a), vergibt Handwerker-Aufträge an GEMA-Betriebe, meldet Leerwohnungen (startet Spülregime). spuelmanager r/w für die Leerstand-Spülprotokolle. Org-Kategorie `immobilien` bietet die Rolle im User-Modal an |
| **Monteur** | Read-only auf Werkzeuge + Schadensberichte | Geräte einsehen, Defekte melden, Schadensmessungen + Fotos erfassen — keine Edit-Rechte auf Werkzeuge |
| **Prüfer** | Werkzeug-/Fahrzeug-Prüfungen | Quittiert Prüfungs-Aufträge, lädt Prüfberichte hoch |
| **Dozent** (`role_dozent`) | Klassen + Prüfungen (admin) + alle Berechnungsmodule | Führt Klassen (ab_klassen), schaltet Berechnungsmodule pro Klasse frei, stellt Lernmittel bereit, erstellt/korrigiert Prüfungen (ab_pruefungen). Landing: index.html |
| **Studierende** (`role_student`) | NUR Klassen-Portal + Prüfungen (read) | Treten per Klassencode bei, sehen Lernmittel + freigeschaltete Module (harte Sperre via `_studentModAllowed`), lösen Prüfungen im Runner (ab_pruefung_live). Landing: ab_klassen.html (Redirect von allen Hub-Seiten) |
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
- **Vormerkungen**: `beantworteOffertanfrage()` (Produktkatalog) legt pro Objekt eine Vormerkung an — beim Planer kommen sie **abgeleitet aus den beantworteten OAs** an (siehe Offertanfrage-Workflow Punkt 4; der lokale Store des Lieferanten-Geräts erreicht den Planer nie). `_renderVormerkungen` in der BKP-Checkliste filtert zuerst Vormerkungen weg, deren `offertanfrageId` bereits in einer Position des Objekts steckt (`pos.offerte.offertanfrageId`, cloud-synct — sonst Geister-Vormerkungen auf Zweitgeräten), matcht dann über die Modul-Verknüpfung (`lieferungTyp`, Reverse-Map Kategorie→MODUL_MAP-Key), dann über `bkpCode`, und setzt die Offerte automatisch in die Position ein.
- **GemaBest.bind() beim Boot (KRITISCH)**: Die Gewinner-Bestell-Sektion (`_bstWinnerSektion` in `idet`) liest Status-Badges + Nummernkreis aus dem Pool-Cache `gema_best_pool_v1` — der Boot bindet den Pool deshalb explizit (fire-and-forget, re-rendert `idet` falls offen). Ohne Bind war der Cache auf frischen Geräten leer: fehlende «✓ BST-…»-Badges (Doppelbestellungs-Risiko) und `nextNr()`-Kollisionen. Gleiches Muster in pm_revisionsunterlagen (Sammel-Quelle «Bestellungen»).
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
| `iv_` | Immobilienverwaltung | `iv_immobilien.html` |
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
- **Netzschema mit Temperaturverlauf** (`#zkSchemaCard`, eigener Script-Block → `window._zkSchemaDraw({res,rows,tww,dtzul,hEff})` geguardet am Ende von `zkRenderCalc`; Drift-Guard `scripts/berechnungs_schema_test.mjs`): dynamisches Inline-SVG des Strangbaums — WW-Erwärmer + RV + Zirkulationspumpe links, Teilstrecken orthogonal als Baum (DFS-Layout, innere Knoten mittig über den Kindern), **Leitungsfarbe = mittlere RL-Temperatur** (rot warm → blau kalt, Skala aus den echten H/L-Werten, Legende mit Gradient), Fliessrichtungs-Pfeile zur Pumpe, je End-TS Drosselventil-Symbol + Strang-Chip (KV, T am Ventil, Δp; rot bei dpDr<0), **massgebender Strang dick + ★**, unverbundene TS werden im Hinweis gemeldet. TS-Labels klickbar → Tabellenzeile pulsiert (`data-zkziel="ts|nr"`), Kopf-Chips → Eingabefelder. NUR literale Hex-/rgb-Farben (GemaPDF-Regel).
- **Persistenz**: Parameter via GemaAutoSave (`zirkulation`); TS-Zeilen als JSON im hidden `#zk_rows`-Textarea (Restore über autosave-`change`-Event, `_zkInternal`-Guard gegen Loops).
- **Anlagenwahl + Offertanfrage**: `GemaAnlagenwahl.init({kategorie:'zirkulationspumpe'})` — neue Produktkategorie `KATEGORIEN.zirkulationspumpe` (Förderhöhe mbar + Volumenstrom l/h + Medientemp, matchFn) + `LIEF_KATEGORIEN`-Eintrag. Berechnungswerte-Payload: `volumenstrom` (l/h), `foerderhoehe` (mbar), `tempRl`, `waermeverlust` (W) — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `zirkulation`, FILE_MAP `sb_zirkulation`), sb_index (Warmwasser), sw.js.

### Druckverlust Kaltwasser (sb_druckverlust.html) — kompakte Teilstrecken-Liste (Feedback 16.07.2026)

Umbau nach Sandro-Feedback (`scripts/druckverlust_feedback_test.mjs` 26 Checks): (1) **Teilstrecken starten eingeklappt** (Excel-Listen-Optik, `_tsOpenMap` nur UI) — die Kopfzeile trägt die wichtigen Werte **Q / v / Δp TS als Chips** (`.hd-res`/`.hd-val`), ▸ klappt Formstücke + volle Ergebnis-Zeile auf. (2) **Feld-Reihenfolge**: TS-Nr · Rohrsystem · Dimension · **Leitungstyp** · Länge · Anzahl LU · gr. LU · +Q. (3) **gr. LU als Select nur 3/5** (Default 3, Altwerte bleiben als Zusatz-Option). (4) **v-Ampel pro Leitungstyp**: über dem Grenzwert rot, ab 90 % orange, darunter grün (Ausstoss 4.0: ≥4.01 rot · 3.60–4.00 orange · <3.60 grün); `has-error`-Karte nutzt denselben Grenzwert (vorher hart v>2). (5) **Neue TS übernimmt die letzte Wahl** (sysId/dimDn/flowMode/leitungstyp/grLU; Länge/LU bleiben Default). (6) **Medium-Select** im Parameter-Balken (Standard Wasser, «weitere folgen» deaktiviert — Vorbereitung; `state.medium`, Stoffwerte weiterhin `waterProps`). **Feedback 17.07.**: (7) Aufgeklappte Ergebnis-Zeile OHNE Q/v-Duplikate (stehen bereits als Kopf-Chips) — dafür ist **«Δp ζ»** (Einzelwiderstände) immer sichtbar (Tooltip erklärt ζΣ + äq. Länge). (8) **Δp-Einheiten-Umschalter kPa ⇄ bar** (`#dpUnitSeg` in der Toolbar, `state.dpUnit` persistiert; ALLE Δp-Anzeigen inkl. Kopf-Chip laufen über `dpFmt()`/`dpU()`, bar mit 3 Nachkommastellen).

### Umkehrosmose — 24-h-Tankoptimierung (sa_osmose.html, Sektion 3)

1:1-Erweiterung nach Excel «Berechnung_Gegenosmose.xlsm», Blatt 2 «Bedarf-Tankoptimierung» (Node-Test 29/29 inkl. Excel-Zellketten-Parität; Playwright-Smoke 28/28). Greift beim **Offline-Betrieb mit Reinwassertank**. **Feedback 16.07.2026**: Sektion 1 = Verbraucher, Sektion 2 = Grunddaten Anlage (getauscht — zuerst der Bedarf); Verbrauchertabelle mit read-only Spalte **«Tagesbedarf [l/Tag]»** (`.c-tagesbedarf`, in recalc nachgeführt) + `Σ Total`-Fusszeile (`#consumerTotal`); VA-Hint «Aus Datenblatt Anlage — Leistung bei 10 °C Wassertemperatur»:
- **Sichtbarkeit automatisch** (User-Entscheid): Sektion erscheint bei Daten; das 24-h-Profil wird aktiv, sobald der Tank zwingend ist (V̇B ≥ VA) ODER eine Tankgrösse erfasst ist — sonst nur Online-Hinweis. Dazu die zwei Excel-Checks in der Ergebnis-Karte: **«Reinwassertank zwingend»** (AC49: V̇B ≥ VA) und **«Online-Anlage möglich»** (AC51: VA·t ≥ VB,d und VA > V̇B).
- **Bedarfsprofil**: eine Zeile pro Verbraucher der Haupttabelle (Key = Name — Stundenwerte überleben LU-Reloads), 24 Stundenfelder in Litern gegen das Tages-Soll (l/h × h/d); Status «✓ / zu viel / offen: X l». **Produktionsprofil**: 24 Stundenfelder gegen VA (Feld-Warnung > VA) und «Differenz zu vergeben» = ΣProduktion − VA×Laufzeit (Excel W23). **Auto-Verteilen** (User-Entscheid): ⇆ je Zeile verteilt Soll ab Startstunde über die Betriebszeit, Produktion analog VA×Laufzeit ab Startstunde (`osmVerteil24`, Bruchteilstunde in der letzten Stunde, zirkulär über Mitternacht) — alles manuell übersteuerbar.
- **Tanksimulation KORRIGIERT** (User-Entscheid): Füllstand(h) = Startfüllung + kumProduktion − kumBedarf, **jede Stunde zählt** — die Vorlage liess die Produktion 00–01 aus dem Füllstand fallen (D26=D23); mit prod[0]=0 ist GEMA zellidentisch mit der Excel-Kette (Zeilen 14/15/26/27/16 im Test nachgebaut). Startfüllung um 00:00 = **optimierte Tankgrösse** (Input). Warnzellen wie Vorlage: rot < 50 l Reserve («zu wenig»), amber > Tankgrösse («zu viel», Überlauf). `osmTankMin` = 50 + max. kumuliertes Defizit → «min. erforderlich»-Hint + «↧ Vorschlag übernehmen»; «→ als gewählte Tankgrösse übernehmen» schreibt in `#tankSelected` (Excel: nur Anzeige N82). Canvas-Füllstandskurve (24 h, Tank-/Reserve-Linien, literale Hex-Farben).
- **Tagesablauf-Simulation (Tank-SVG, animiert)**: unter der Füllstandskurve — Reinwassertank mit Wasserstand im Grössenverhältnis (Marker Tankgrösse/Reserve 50 l/gewählte Grösse), Zulauf «Osmose-Anlage +x l/h» / Ablauf «Verbraucher −x l/h» je Stunde aktiv/abgeblendet, Uhr + ☀️/🌙, Status-Pill (i.O. / Reserve unterschritten rot / Tank läuft über amber, Wasser färbt mit). Play/Pause (`otSimToggle`, 24 h ≈ 15 s, rAF) + Stunden-Slider (`otSimScrub`; **Range-Input bewusst OHNE id** — AutoSave würde die Abspielposition sonst persistieren). **Muster**: Gerüst einmal pro Datenstand (`otSimBuild`, Signatur-Cache), pro Frame nur Attribute (`otSimApply` via `data-sim`-Attribute — kein innerHTML-Rebuild im rAF); Interpolation `osmSimLevel(startTank,fuellstand,t)` in der ENGINE (Stand um 00:00 = Startfüllung, linear zwischen den Stundenwerten). Test-Hooks `window._otSimHooks`; Suite `scripts/osmose_tanksim_smoke_test.mjs` (25 Checks).
- Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block (DOM-frei): `osmVerteil24/osmTankProfil/osmTankMin/osmSimLevel`. Persistenz: JSON im hidden `#os_tankopt`-Textarea (AutoSave `osmose`, Muster `#zk_rows` + Snapshot-Fallback `otSnapshotLoad` wie bgLoadFromSnapshot). Tests: `scripts/osmose_tankopt_test.mjs` + `scripts/osmose_tankopt_smoke_test.mjs`; Kette LU→Osmose→Enthärtung unverändert (kette_e2e 17/17 — GemaOsmose.save unangetastet).

### Enthärtungsanlage — Multistrang (sa_enthaertung.html)

Erweiterung nach Excel «Enthaertung_23_Straenge_Berechnung_V2.1.xlsx» (Node-Test `scripts/enthaertung_multistrang_test.mjs` 42/42 gegen die Excel-Cached-Werte inkl. I17-Zellkette; Playwright `scripts/enthaertung_multistrang_smoke_test.mjs` 47/47). Drei User-Entscheide (07/2026): **Zeilen-Dropdown** (Strang-Zuordnung pro Verbraucher-Zeile, Muster Niederschlag-Stränge), **HW pro Strang** (Excel-treu), **Gesamt-Gleichzeitigkeit immer aktiv**.
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (DOM-frei): `enthW3(lu,maxLu)` (W3 Diagramm 1) + `enthMultistrang({hr, straenge:[{luSum,maxLu,sp,hw,tb}]})` — alles in mmol/l. Je Strang: `Q_W3 = W3(ΣLU)`, `Q_D = Q_W3 + Direktlasten`, `f = (HR−HW)/HR`, `V'E = Q_D·f`, `Umgehung = Q_D−V'E`, `CB = TB·(HR−HW)/1000`. **Gesamt (Excel I17)**: `Q_W3,ges = W3(Σ LU ALLER Stränge)` (Gleichzeitigkeit über alles), `V'E,total = f_mix·Q_W3,ges + Σ(Direkt·f_s)` mit `f_mix = Σ(Q_D,s·f_s)/Σ(Q_D,s)` über die LU-führenden Stränge; `veSum` = konservative Summe (informativ ausgewiesen, Ergebnis-Zeile «ohne Gesamt-Gleichzeitigkeit»). Gilt IMMER — auch ohne definierte Stränge (jede Zeile = impliziter Einzelstrang; per-Zeile-Werte bleiben identisch, nur das Total wird durch die W3-Skalierung wirtschaftlicher als die frühere Zeilensumme).
- **UI**: Strang-Spalte (Dropdown mit «＋ Neuer Strang …») in der Verbrauchertabelle; Karte «Zusammenstellung nach Strängen» (`esRenderZus`, Fokus-Erhalt beim Re-Render) mit Name/HW-Feld [°fH]/🗑 + KPI-Chips (LU Σ, Q W3, Direkt, QD, V'E, Umgehung, Tagesbedarf, CB) + «Ohne Strang»-Ausweis. Zeilen im Strang: Härte-V-Feld gesperrt (`.v-strang`, Titel zeigt Strang-HW; HW-Vorbelegung = kleinste Zeilen-Härte), «über Enthärter»-Zelle zeigt «→ Strangname». Neue Ergebnis-Zeilen: Gesamt-QD (`#qd_ges`), Umgehung total (`#umg_total`), konservative Summe (`#ve_sum_info`); `#ve_total_ls` = massgebender V'E (Anlagenwahl/OA unverändert daran).
- **Persistenz**: `#enth_straenge` (hidden Textarea, zk_rows-Muster) `{str:[{id,name,hw}],zu:{A:'1'},seq}` via AutoSave `enthaertungsanlage`; change-Listener + Snapshot-Fallback (`_esSnapshotLoad` 700/1800/3500 ms) + **Sync-Check in recalc()** (AutoSave-`_clear()` beim Objektwechsel feuert keine Events — Textarea vs. `_esApplied` Abgleich).
- **Anlagenschema** (`#enthSchemaCard`, eigener Script-Block → `window._enthSchemaDraw(d)` geguardet aus recalc): dynamisches Inline-SVG nach der Vorlage-Zeichnung — Rohwasser (2 Absperrventile) → Enthärter-Behälter unter der Leitung (Fall-/Steigleitung) → grüner Weichwasser-Verteiler → Strang-Riser mit Ventil, Umgehungs-Sammelleitung (amber gestrichelt) mit **Aufhärteventil + Mischpunkt pro Strang** (nur bei Umgehung > 0), Strang-Boxen mit Name/LU/QD/HW-Chip; Stranganzahl dynamisch (implizite Zeilen als Sammel-Riser «Verbraucher»), Chips klickbar (`data-esziel` → Scroll+Fokus+`.es-puls`), Legende, NUR literale Hex-Farben (GemaPDF-Regel).

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

Komplett NEU nach Excel-Vorlage «WarmwasserGesamt385_251125_v3.xlsm» (SIA 385/1+2:2025; ersetzt die alte Version; gleicher Aufbau/Validierung wie sb_zirkulation/sa_frischwasserstation — Playwright: Grobauslegung gegen Excel-Cached-Werte, Feinplanung gegen unabhängig berechnete Formelwerte). 5 Tabs:
1. **Grobauslegung**: Nutzungseinheiten (`WW_GROB_NUTZUNG`, 14 SIA-Normwerte l/d) → Tagesbedarf à 60 °C; `Q'W = V·ΔT·cp/3600`; Personenzahl-Rechner `nP = (3.3−2/(1+(ANF/100)³))·nWhg`.
2. **Verlustzahl ϛIS**: Speicherverluste `0.11·√V(+Stutzen)`, Leitungsverluste (konv. 0.12 / RaR+WHB 0.15 kWh/m·d), Hilfsenergie Pumpe `(5+0.16·L)·24·10⁻³` (Grenzwert `8+0.2·L`), WHB `⅔·Q`, WP `2Q/(3·COP)`, Ausstoss (15/20/25 % der Speicherverluste) → `ϛIS = (ΣVerluste+2.5·ΣHilfsenergie)/Q'W·100`, Grenzwert 50 %. **ϛIS = Verlustzahl-Input der Frischwasserstation.**
3. **Feinplanung**: Bedarf mit σ (`WW_FEIN_NUTZUNG` = dieselbe Tabelle wie FWS); **Stundenspitzen** je Zeile mit Profil-Auswahl — Wohnbau per Formel `kWh/d·(0.09+0.66/√n+1.98/n)`, andere fix (`WW_SPITZE_PROFIL`: Hotel 12.5 / Altersheim 19.3 / Spital 14 / Studentenheim 6.6 / Büro 20 / Restaurant 13.5 %) → Σ = Spitzendeckungsvolumen; Wohnungs-/Heizlast-Rechner (`WW_HEIZLAST_TYPEN` W/m², Fläche/0.85); Leitungsverluste je Aussen-ø (`WW_ROHR_FAKTOR`·ΔT — gleiche Faktoren wie Zirkulations-Vordimensionierung); Ausstosswärmeverluste über Entnahme-Matrix (`WW_ENTNAHME`: Kategorie×Ausstosszeit, Wohnungen: Entnahmen = Ø-Belegung·5+2).
4. **Speicher & Leistung**: `QW,gen,out` = Ausstoss+Leitungen+Bedarf+Speicherverluste; Ladezeit bei Vorrangschaltung; Steuervolumen `(V/100)·(100−Spitzenanteil%)/Ladungen`; Bereitschafts-/Speichervolumen ·fsto(1.25); effektives Steuervolumen-Override (aus Speicheroptimierung); Umsatz-Check (>1 sonst «Speicher zu gross»-Warnung). **Speicherschema** (`#wwSpSchemaCard`, eigener Script-Block → `window._wwSpSchemaDraw(d)` geguardet aus wwRenderCalc; Node-Test `scripts/warmwasser_speicherschema_test.mjs` 20/20 + Playwright `warmwasser_speicherschema_smoke_test.mjs` 31/31): dynamisches Inline-SVG nach User-Vorlage — Behälter mit Zonen **im Grössenverhältnis der berechneten Volumen** (oben→unten: Spitzendeckungsvolumen blau, Steuervolumen grün, Misch- & Reservevolumen violett = fsto-Zuschlag, in der Vorlage unbenannt), Bereitschafts-Klammer (= pk+ctrl), Fühler Ein/Fühler an den Zonengrenzen (kollisionsfreie Label-Positionen), Warmwasserausgang/Kaltwassereingang-Blockpfeile, Wärmeerzeuger-Box mit Ladung, %-Anteile in den Zonen, Ladezeit-/Umsatz-Chips (i.O./zu gross), alle Boxen klickbar (`data-wwziel` → Scroll+Fokus+Puls). **Umschalter «1 Speicher ⇄ 2 in Serie»** (Engine `wwSpZonen(vpk,vctrl,vmisch,anzahl)` im `/*ENGINE-START*/`-Block): zwei gleich grosse Behälter verhalten sich wie EIN hoher Speicher — Speicher 1 (WW-seitig, «Bereitschaft») nimmt die oberen Zonen, Überlauf läuft in Speicher 2 («Vorwärmung»), Serie-Verbindung «vorgewärmt» (KW → Sp2 → Sp1 → WW); Zustand im hidden Input `#ww_sp_anzahl` (AutoSave-persistiert, change-Listener für den Restore-Pfad). Zonen-Leaderlinien werden HINTER die Behälter gelegt (nach `</defs>` eingefügt — opake Zonenfüllungen decken Kreuzungen im Serie-Modus ab). NUR literale Hex-Farben (GemaPDF-Regel).
5. **Summenlinien-Diagramm (VSSH Handbuch 5, Blatt 2.2.8–2.2.13)**: Tagesgang-Profile als Stundenwerte in % des Tagesbedarfs (Diagrammstart 05:00, `WW_SL_PROFILE`: Wohnbauten Mo–Do/Fr/Sa/So, Altersheime, Cafés/Restaurants, Stadt-/Passantenhotels, Touristenhotels, Spitäler — Σ je 100 %, gegen die VSSH-Σ%-Zeilen verifiziert). **Direkt aus der Berechnung gespeist**: Tagesbedarf auto (Feinplanung ③ → Grobauslegung ①, override manuell), Ladeleistung aus Tab ④ (override), ΔT Default 50 K. Lademodus «durchgehend» oder «Ladefenster/Sperrzeiten» (3 Fenster als statische `wwsl_*`-Inputs mit `type="time"`, Mitternacht-Wrap unterstützt — je nach Modus erscheinen andere Punkte/Bereiche). **Engine im `/*ENGINE-START*/`-Block** (Node-Test 44/44, reproduziert das VSSH-Lösungsbeispiel 2.2.12 Touristenhotel exakt: 38 % = 1'330 l, Sperrzeit-Bedarfe 38/23.6 %, Spitze 20.5 % = 717.5 l, 32 kW → 550 l/h): `wwSlSegmente` (Fenster→gemergte Diagramm-Segmente), `wwSlArrays`, **`wwSlMinSpeicher`** (erforderliches Mindest-Speichervolumen = grösster Bedarfsüberschuss über jede Zeitspanne — Kadane über den verdoppelten Tag statt zeichnerischer Konstruktion, liefert kritische Spanne voll→leer), **`wwSlSim`** (eingeschwungener Speicher-Tagesgang, 4 Iterationen; Ladelinie = Verbrauch + Speicherinhalt → ergibt exakt das klassische Bild mit Ladegeraden und Plateaus; erkennt Unterdeckung bei zu kleinem Anzeige-Speicher), `wwSlSpitze`. **Canvas-Rendering ohne Library** (sauber beschriftet + farbig, besser als die Hand-Vorlage): Bedarfs-Summenlinie navy, Ladelinie orange, Stundenbalken blau + Spitzenstunde amber mit %-Label, Ladefenster grüne Bänder mit ▲EIN/▼AUS (nur echte Schaltpunkte, nicht Diagrammränder), 100 %-Linie grün gestrichelt mit Liter-Angabe, Speicher-Doppelpfeil + Entlade-Schattierung violett mit Punkten «Speicher voll/leer», Unterdeckung rot, doppelte Y-Achse % + Liter, HTML-Legende. Ablesewerte-Karte: Ladekapazität/Tag mit deckt-Badge, Mindest-Ladeleistung, erforderl. Speichervolumen (min.), kritische Entladung, Spitzendeckungsvolumen, Bedarf je Sperrzeit, Ladung je Fenster (Simulation), Vergleich mit eff. SIA-Speicher aus Tab ④. Redraw-Hook am Ende von `wwRenderCalc` + Tab-Klick/Resize/verzögert nach AutoSave-Restore. **Tagesablauf-Simulation Speicher** (Karte unter dem Diagramm, `window._wwSimSync` aus wwSlUpdate): animierter Behälter mit **Warm-Schicht von oben** (Speicherinhalt aus `wwSlSim`, eingeschwungener Tag) über Kaltwasser, Uhrzeit-Mapping ab 05:00 (Diagrammstart), Verbrauchs-/Lade-Pfeile je 5-min-Schritt (Ladefenster «bereit/AUS»), Status-Pill (Versorgung i.O. / fast leer / **Unterdeckung** aus `unmetSegs`), Play/Pause + Slider (Range **ohne id** — AutoSave), Gerüst-einmal/Attribute-pro-Frame-Muster wie die Osmose-Tanksimulation. **`simData()`-Fallback (KRITISCH)**: ist das erforderliche Mindest-Speichervolumen 0 (durchgehende Ladung deckt alles → `_wwslData.cap` 0), nimmt die Simulation den effektiven SIA-Speicher aus Tab ④ als Anzeige-Kapazität und rechnet `wwSlSim` dafür separat (Signatur-Cache). Test-Hooks `window._wwSimHooks`; Suite `scripts/warmwasser_tagessim_smoke_test.mjs` (20 Checks).
- **Feedback 17.07.2026 (18 Punkte, alle umgesetzt)**: **Tab ①**: Personenzahl-Rechner als Mehrzeilen-Wohnungstypen-Tabelle VOR der Bedarfstabelle (State `wwState.grobWhg`, Personen summiert, «⬇ Als Anzahl übernehmen» schreibt in die erste P-Zeile bzw. legt eine MFH-Zeile an; `wwGrobPersUebernehmen`), ANF-Vermerk (`.ww-vermerk`), **θKW/θWW-Eingaben statt Δθgen-Direkteingabe** (Differenz berechnet, Defaults 10/60 = 50 K wie vorher). **Tab ② heisst «Verlustzahl»** und ist in FÜNF separate Karten 2.1–2.5 gegliedert; die SIA-Werte 1.5 (Annahme-Verlustzahl) / 0.12 / 0.15 kWh/(m·d) sind **Fixwerte** (Read-only-Zeilen mit `.ww-fix-tag`, in wwCalc Konstanten — die alten Inputs `ww_annahmeVz`/`ww_qKonv`/`ww_qRar` existieren nicht mehr); Karte 2.5 zeigt das **Kuchendiagramm der Verluste** (`wwPieRender`, Inline-SVG, Komponenten exakt aus der ϛIS-Formel: Speicher / warmgehaltene Leitungen / Ausstoss / Hilfsenergie ×2.5). **Tab ③**: Karte «Auswahl aus der Grobauslegung» (`#wwGrobEcho`, Chips + Differenz zur Feinplanung) und **farbige Summenlinien der Nutzungseinheiten** (`wwFeinSlDraw` im Tab-⑤-Block NACH ENGINE-END; Mapping Spitzen-Profil→VSSH-Tagesgang `WW_FEINSL_MAP`, Büro/Studentenheim fallen auf Wohnbau Mo–Do zurück, Σ-Total gestrichelt) unter der Bedarfstabelle; Wohnungstabelle mit **Wohnungsgrössen-Badge** (`wwZimmerKat`: <47.5→1–1.5 Zi · <72.5→2–2.5 · <95→3–3.5 · <120→4–4.5 · ≥120→5+) + ANF-Vermerk; **Heizlast als erweiterte Matrix** (`WW_HEIZLAST_MATRIX`, Tabelle Robin 17.07.: 9 Nutzungen × 7 Bauperioden/Standards von Altbau ungedämmt bis Passivhaus, zwei Selects `ww_heizKat`/`ww_heizStd` ersetzen die alte 6-Zeilen-Liste; Passivhaus-Werte mit `stern:true` zeigen den *-Vermerk der Quelltabelle 1:1) mit «Abschätzung»-Badge; **θWW/θR statt ΔT-Direkteingabe** (Defaults 60/20 = 40 K); **Rohr-an-Rohr mit getrennten VL-/RL-ø** (RL-Auswahl ab 12 mm: 12/15/16/18/20/22/25/28/32/35/42/54; `wwRarTab`: Σ beider ø → nächstgrösserer Wert der Rohrtabelle, Anzeige «Σ ø 37 mm → Tabellenwert 42 mm»); Ausstoss zeigt die **Wohnungen als eigene Read-only-Tabelle** (`#wwAusstossWohnBody`, Entnahmen = Ø-Belegung·5+2, Total-Zeile) vor den weiteren Nutzungseinheiten; darunter **Verlustzahl Feinplanung + Kuchendiagramm** (wie Grobauslegung). **Tab ④**: `fsto` mit **anwählbaren Bauart-Kacheln** (eigene SVG-Zeichnungen statt Excel-Bilder — Datenschutz; Stehend 1.25 / Liegend 1.5, Klick setzt den Wert, manueller Wert deaktiviert die Kacheln — `wwFstoSet`/`wwFstoSync`).
- Persistenz: AutoSave `warmwasser_sia385` + 5 dynamische Tabellen (`grob`, `grobWhg`, `whg`, `fein`, `ausstoss`) als JSON im hidden `#ww_rows`-Textarea; die Summenlinien-Parameter (`wwsl_*`) sind statische Inputs/Selects und werden von AutoSave automatisch erfasst. Keine Anlagenwahl (wie bisher — keine Speicher-Produktkategorie).

### Druckanstieg bei Temperaturänderung (sb_druckanstieg.html)

1:1-Umsetzung der Excel «SP_Druckanstieg_aufgrund_Volumenänderung» (Blatt Statisch_Dynamisch; per Playwright gegen die Excel-Cached-Werte validiert). Statischer Überdruck in der abgesperrten Trinkwasser-Installation bei Erwärmung — 7 Schritte auf einer Seite (Kaltwasser-Gruppe in sb_index):
1. Vordruck p1 → 2. Höhendruck `pHgeo = 0.0981·hv` → 3. Fülltemperatur/Maximaltemperatur mit Wasser-Dichte-Näherungsfunktion (`SP_DICHTE`: Polynom 5. Grades / (1+b·t); Dichten sind Anzeige, die Rechnung läuft über β) → 4. Volumenausdehnung: Rohr-ø-Select aus `SP_ROHRE` (CNS Nussbaum, di = da−2·Wandstärke), `v0 = (di²·π/4)·l`, `ΔV = v0·β·ΔT` (β editierbar, Default 0.21·10⁻³ 1/K wie Excel) → 5. Druckanstieg: Rohrausdehnung `ΔV_Rohr = v0·3·α·ΔT` (α Default 16.5·10⁻⁶), `Δp = (ΔV_eff/v0)·K` mit Bulkmodul K Default 22000 bar (2.2 GPa) → 6. Gesamtdruck tiefste Stelle `pÜmax = p1+pHgeo+Δp` mit **Warnbox > 10 bar** («Massnahmen treffen») → 7. Ansprechdruck Sicherheitsventil `pSV = (p1+pHgeo)·(1+Schliessdruck)`, Faktor Default 0.3.
- Kernaussage (aus der Excel übernommen, als Hinweis im UI): die Installationslänge ist irrelevant — nur ΔT ist massgebend (ΔV/v0 kürzt das Volumen heraus).
- Persistenz: reine Input-Felder via GemaAutoSave (`druckanstieg`), keine dynamischen Tabellen.
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.sicherheitsventil`** (Ansprechdruck bar + Abblaseleistung + Anschluss; matchFn scored Nähe zum berechneten pSV) + `LIEF_KATEGORIEN`-Eintrag + bkpMap `254.0`. Payload: `ansprechdruck`, `ruhedruck`, `gesamtdruck`, `druckanstieg`, `rohrDa` — Projektwerte, nie Datenblatt-Werte.
- Registriert in gema_auth (MODULES `druckanstieg`, FILE_MAP `sb_druckanstieg`), sb_index (Kaltwasser, «8 Module» + ALL_MODULES), sw.js.

### Saugpumpe – maximale Saughöhe (sb_saugpumpe.html)

1:1-Umsetzung der Excel «Saugpumpe.xlsx» (Blatt Berechnung_Saughöhe; Node-Test `scripts/saugpumpe_engine_test.mjs` 44 Fälle gegen Excel-Cached-Werte + unabhängig berechnete Formelwerte, Playwright-Smoke `scripts/saugpumpe_smoke_test.mjs` 23 Checks). Kaltwasser-Gruppe auf sb_index — 6 Schritte auf einer Seite (Layout wie sb_druckanstieg):
1. Luftdruck aus Höhenlage: `pLuft = 101'325·((288 − 0.0065·h)/288)^5.255` (barometrische Höhenformel) → 2. Dichte Wasser `ρ = 1006 − (0.26·T + 0.0022·T²)` (Näherung, gültig 10–200 °C) → 3. Theoretisch maximale Saughöhe `Hb = pLuft/(ρ·9.81)` (~10.3 m auf Meereshöhe) → 4. Druckverlust Saugleitung pf [Pa] → `Hf = pf/(ρ·9.81)` → 5. NPSH-Wert des Herstellers [m] + Sicherheitszuschlag Hs (Default 0.5 m) → 6. Verdampfungsdruck pv [Pa] → `Hv = pv/(ρ·9.81)`.
- **pv-Automatik**: leeres pv-Feld = Tafelwert bei T aus `SG_DAMPFDRUCK` (Wasserdampftafel Haar/Gallagher/Kell NBS/NRC, Springer 1988 — 35 Stützpunkte 0.01–99.6 °C, linear interpoliert; als Referenz-Karte mit Stützpunkt-Markierung im UI); manuelle Eingabe überschreibt IMMER (auch 0 — Unterscheidung `pv:null` = auto vs. `pv:0` = manuell in `sgCalc`).
- **Ergebnis**: `hmax = Hb − Hf − NPSH − Hs − Hv` — muss positiv sein (sonst rote Warnbox «Saugbetrieb nicht möglich» + KPI bad); KPIs hmax / Hb / Summe Abzüge. `npshBudget = Hb − Hf − Hs − Hv` (= hmax + NPSH) ist der Projektwert fürs Anlagen-Matching.
- Persistenz: reine Input-Felder via GemaAutoSave (`saugpumpe`), keine dynamischen Tabellen. Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block (DOM-frei, Node-testbar).
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.saugpumpe`** (NPSH Pflicht, max. Saughöhe/Fördermenge/Förderhöhe/Motorleistung; matchFn scored die Reserve `npshVerfuegbar − npsh`) + `LIEF_KATEGORIEN` + bkpMap `253.4` + MODUL_MAP + OA_KAT_MAP + `_OA_BW_LABELS` (`saughoeheMax`/`npshVerfuegbar`/`wasserTemp`; `hoehe` wiederverwendet). Payload: `saughoeheMax`, `npshVerfuegbar`, `wasserTemp`, `hoehe` — Projektwerte, nie Datenblatt-Werte.
- **Anlagenschema Höhen-Budget** (`#sgSchemaCard`, eigener Script-Block → `window._sgSchemaDraw(r)` geguardet aus `sgRecalc`; Drift-Guard `scripts/berechnungs_schema_test.mjs`): Inline-SVG mit **Schnittbild** (Becken/Wasserspiegel, Saugleitung mit Fussventil, Pumpe auf Höhe hmax, grünes/rotes Massband) und **Budget-Balken** im selben Massstab — Hb als Rahmen, Abzüge Hf/NPSH/Hs/Hv als Segmente von oben, Rest = grünes hmax-Segment; hmax ≤ 0 → gestrichelter «Defizit»-Rahmen unter der Null-Linie + «Saugbetrieb nicht möglich». Chips + Legendenzeilen klickbar (`data-sgziel` → Eingabefeld mit `.sg-puls`). NUR literale Hex-Farben.
- Registriert in gema_auth (MODULES `saugpumpe`, FILE_MAP `sb_saugpumpe`), sb_index (Kaltwasser «9 Module», Hero 26), sw.js (v266), gema_recent. Rollen-Golden (`scripts/rolematrix_golden.json`) regeneriert — 74 Module.

### Höhen-Übernahme ab Karte (gema_hoehe.js — Druckdispositiv, Saugpumpe, Gas)

Wiederverwendbares Widget: ermittelt die **Terrainhöhe [m ü.M.] am Projektstandort** über den offiziellen swisstopo-Höhendienst und schreibt sie per «→ Übernehmen» ins Modul-Feld. Kein API-Key, CORS offen — derselbe api3.geo.admin.ch-Host wie das bestehende Adress-Autocomplete.
- **Ablauf**: Objektadresse (Auto-Prefill aus dem aktiven Objekt, nur solange nichts erfasst/getippt) bzw. Adresssuche (GemaAdresse-Autocomplete) → SearchServer-Geocoding (WGS84) → `ghWgs84ToLV95` (identische swisstopo-Näherungsformeln wie `rkWGS84toLV95` in sb_niederschlag) → `GET /rest/services/height?easting&northing&sr=2056` → Höhe. **swissALTI3D ist ein GELÄNDE-Modell ohne Gebäude** — der geocodierte Punkt liegt aber oft auf der Gebäudemitte; deshalb ist der Punkt korrigierbar.
- **Karte**: Mini-Ausschnitt (Luftbild swissimage, Zoom 18, nur Anzeige — Muster rk-Karte) + Vollbild-Modal (eine geteilte Instanz, z-index 12000, ESC/Backdrop): Marker ziehen ODER Karte anklicken → Höhe wird neu abgefragt (AbortController), Segment «🛰 Luftbild ⇄ 🗺 Karte» (pixelkarte-farbe hilft z.B. beim Orientieren), Verschiebung > 1.5 m ⇒ Badge «📌 Punkt manuell korrigiert» (persistiert). Leaflet 1.9.4 wird lazy von cdnjs geladen; ohne CDN/offline degradiert die Karte zum Platzhalter — **die Höhenermittlung/Übernahme funktioniert ohne Karte weiter**, API-Fehler zeigen eine klare Meldung (manuelle Eingabe bleibt).
- **Persistenz (KRITISCH — Muster #zk_rows + bgLoadFromSnapshot)**: Zustand als JSON im Hidden-Input `<stateId>` → GemaAutoSave speichert ihn pro Objekt; Reload stellt OHNE erneuten API-Call wieder her (offline-fest). Die Modul-Init-Blöcke attachen **synchron** (Script steht nach dem Container) — das Hidden-Input muss existieren, BEVOR GemaAutoSave beim DOMContentLoaded restored; zusätzlich liest `restoreFromInput` als Fallback direkt aus dem AutoSave-Snapshot (`gema_<autosaveModul>[__<objektId>]`, via `opts.autosaveModul`). Im Druck erscheint statt der Karte eine Dokumentations-Zeile (Quelle swissALTI3D + LV95 + Korrektur-Vermerk).
- **Integrationen**: `sb_druckdispositiv` (`#ddHoehe`→`hVerteilbatterie`, Strassenniveau als Basis Reservoir↔Verteilbatterie; Reservoir-Höhe bleibt bewusst manuell — User-Entscheid) · `sb_saugpumpe` (`#sgHoehe`→`sg_h` Höhenlage) · `sb_druckverlust_medizinalgas` (`#mgHoehe`→`mg_luft`, **mode:'mbar'** rechnet die Höhe über die barometrische Höhenformel in Luftdruck um — `ghLuftdruckMbar(400)=966` = alter Modul-Default) · `sb_druckverlust_erdgas` (`#egHoehe`→`eg_luft`, informativ). Alle 4 binden `gema_adresse.js` + `gema_hoehe.js` ein.
- Engine im `/*ENGINE-START*/`-Block (DOM-frei): `ghWgs84ToLV95/ghLuftdruckMbar/ghDistM/ghFmtCoord/ghInCH`. Tests: `scripts/hoehe_engine_test.mjs` (27 — Bern-Anker ±1.5 m, Konsistenz mit RK-Engine, mbar-Referenzen 540 m→950) + `scripts/hoehe_smoke_test.mjs` (21, API gemockt: Prefill/Übernahme/Korrektur/Reload-Persistenz/Fehlerfall). Test-Hooks `window._ghHooks`. sw.js cached `gema_hoehe.js`.

### Druckschema im Druckdispositiv (sb_druckdispositiv.html)

Live-SVG-Szene «Versorgung → Wasserzähler → Installation» (Karte 📊 vor den Ergebnissen; Grafik-Entscheid Variante 3, 07/2026) — zeichnet sich bei jedem `recalc()` neu aus den echten Modulwerten, beide Modi:
- **Reservoir-Modus**: Terrain mit Reservoir, Δh-Massband (`Δh x m → y bar`), Chips für Schwankung/Δp-Hauszuleitung; passt die Höhendifferenz nicht in die Szene, wird ein **Massstab-Bruch** gezeichnet und in `#ddSchemaNote` ausgewiesen (kleine Δh «massstäblich gezeichnet», negatives Δh = Warnhinweis). **Netz-Modus**: Netzanschluss-Symbol mit Chip-Spalte darüber (Versorgungsdruck/Höhengewinn/Schwankung/Δp-HZ).
- **Gebäudeschnitt**: Geschossraster aus `hHoechste` (`n = round(h/2.8)` geklemmt 1..8, oberste Linie = exakte Höhe) mit «+x,x m · Ruhe y bar» je Ebene (basis − h·0.0981), Steigleitung, Zapfstelle oben, Fliessdruck-Kasten über dem Dach + Δp-Installation-Chip darunter, tiefste Stelle mit Ruhedruck; Stationen WZ/NB/DM erscheinen nur mit Werten (DM-Chip: `DM → x bar` bei Einstelldruck, sonst `Δp DM −x bar`).
- **Norm-Farben synchron zu den Ergebnis-Karten** (Fliessdruck < 1 «Zu tief» rot / < 1.5 «Gemäss Norm» grün / ≥ 1.5 «Erhöht» amber; Ruhedruck > 5 rot), Werte folgen der Einheiten-Umschaltung (bar/kPa/mbar/Pa). **Chips sind klickbar** (`data-ziel` → scrollt zum Eingabefeld, fokussiert, `.dd-puls`-Feedback).
- **Technik (KRITISCH)**: Szene liegt in einem eigenen Script-Block → `window._ddSchemaDraw(d)` wird am Ende von `recalc()` geguardet aufgerufen (Cross-Block-Scope-Regel); recalc hoisted dafür `hResV/hVertV/pv/hGewinnM/schwBar/dvHZ/dvWZ`. NUR literale Hex-Farben im SVG (kein `var()` — GemaPDF/html2canvas rastert sonst falsch); Inline-SVG druckt scharf mit. Drift-Guard: `scripts/druckdispo_schema_test.mjs` (Playwright, 31 Checks: Werte/Farben/Konsistenz mit `#out-fliessdruck`, Chip-Klick, Einheiten, Massstab-Logik, Netz-Modus, optionale Stationen).

### Anlagenschema in der Druckerhöhung (sb_druckerhoehung.html)

Live-SVG «Zulauf → DEA → Gebäude» pro Tab (Feedback 16.07.: «grafische Darstellung mit den Werten») — Muster `_ddSchemaDraw` aus sb_druckdispositiv: eigener Script-Block, `window._deSchemaDraw(mode, payload)` geguardet am Ende von `paintVFD`/`paintVes` aufgerufen, NUR literale Hex-Farben. Szene: Zulauf mit Vordruck-Box + Absperrventil → Grundrahmen mit Pumpensymbolen (VFD: 2 Pumpen mit «~f»-Frequenzumrichter-Badges; Windkessel: 1–3 Pumpen nach `np` + **Druckwindkessel** mit Luft-/Wasser-Zonen, Membranlinie, VN/VB-Chips) → Druckboxen (VFD: Nachdruck pN + Sollwertdruck pE + pU-Chip; Vessel: Einschalt-/Ausschaltdruck + pSi/pS-Chips) → Gebäude mit Geschossraster aus `h` (`n = round(h/2.8)` geklemmt 1..8, Etagen-Höhenlabels), Δh-Massband, Steigleitung, Fliessdruck-Box über dem Dach; Δp-Leitungen/Sonstige-Chips an der Verteilleitung; Förderhöhe-H₁-Box + K-Chip in Statusfarbe (`p.status` ok/warn/bad). **Chips sind klickbar** (`data-deziel` → Scroll+Fokus+`.de-puls` aufs Eingabefeld); Einheiten folgen der bar/kPa- und l/s-/m³/h-Umschaltung (Schema nutzt die globalen `fmt/toDispP/toDispQ/state` — top-level im Haupt-Script = global). Initialzeichnung mit Platzhalter-Payload beim Block-Load.

### Ausdehnungsgefäss & Sicherheitsventil (hz_ausdehnungsgefaess.html) — erste Heizungsberechnung

1:1-Umsetzung der Excel «Auslegung_Ausdehnungsgefässe_HE301_01_Var2.xlsm» (SWKI HE301-01, Betriebstemperatur < 100 °C; per Playwright gegen die Excel-Cached-Werte validiert). **Neues Präfix `hz_` (Heizungsberechnungen)**. **Kachel-Platzierung (Feedback 07/2026)**: Die hz_-Kacheln leben auf der **Hauptseite** (index.html, Kategorie «Heizung & Wärmeerzeugung», `data-module`-Attribute fürs Permission-Gating) — NICHT mehr auf sb_index; sb_index führt nur noch die Sanitär-Gruppen + **Gas als letzte Gruppe** (Hero 25 Module/5 Kategorien). Drift-Guard: `scripts/niederschlag_feedback_test.mjs`.
- **VBA-UDFs der Excel repliziert**: `Dichte_Wasser(t)` (identisches Polynom wie sb_druckanstieg), `X_Zuschlagsfaktor(FN)` (≥150 kW→1.5, ≤10 kW→3.0, sonst `(150−FN)·0.010714+1.5`), `spez_Volumen(Art,ΔT)` dm³/kW (Radiatoren `1200·ΔT⁻¹·⁰⁹`, Flachrohrrad `440·ΔT⁻⁰·⁹⁵`, Heizwände `195·ΔT⁻⁰·⁸`, Konvektoren `400·ΔT⁻⁰·⁹⁷`, FBH `200·ΔT⁻⁰·⁸⁷`, Lüftung `75·ΔT⁻⁰·⁶³`).
- **Ablauf**: p0 = hst/10+Überlagerung, pfin = pSV/1.3 (pSV als Select 3–10 barü — die DGH-Tabelle matcht exakt); Ausdehnungsfaktor je Teil `e = ρmin/ρ(qm)−1` für Wärmeerzeuger, Speicher und **dynamische Heizgruppen-Tabelle** (eff. Wasserinhalt als Override, sonst Abschätzung über spez_Volumen; **Vex der Gruppen nutzt den WE-Zuschlagsfaktor**, wie Excel `$C$32`); `VN,min = Vex,tot·(Pfin+1)/(Pfin−Po)` → Gefässvorschlag aus SU/SD-Reihe (`HE_GEFAESSE` 18–800 l, Typ + Gefässdruck PS z.B. «SU 800.3»), Fülldruck, P·V ≥ 3000-Pflicht-Check; **Sicherheitsventil DGH**: Nennweite aus Abblaseleistungs-Tabelle (`HE_SV`, DN 15–32 je pSV), Schliessdruck/Druckmittelbeiwert/Verdampfungsenthalpie-Polynome, engster Querschnitt d0,ber/d0,eff, theoretische Abblaseleistung.
- Warnungen: pfin ≤ p0 (SV-Druck zu klein für Anlagehöhe), VN,min > 800 l (Parallelgefässe), Leistung über DN-32-Kapazität.
- Persistenz: Parameter via GemaAutoSave (`ausdehnungsgefaess`), Heizgruppen als JSON im hidden `#he_rows`-Textarea (Pattern `#zk_rows`).
- Anlagenwahl + Offertanfrage: **neue Produktkategorie `KATEGORIEN.ausdehnungsgefaess`** (Nennvolumen + zul. Betriebsdruck PS + Bauart, matchFn auf VN ≥ VN,min) + `LIEF_KATEGORIEN` + bkpMap `242.0`. Payload: `vnMin`, `nennvolumen` (Vorschlag), `vordruck`, `enddruck`, `gefaessdruck`, `anlageinhalt`, `ausdehnungsvolumen` — Projektwerte, nie Datenblatt-Werte.
- **Anlagenschema «ein Gefäss, drei Zustände»** (`#heSchemaCard`, eigener Script-Block → `window._heSchemaDraw({hst,pueb,tmin,…_heLast})` geguardet aus `heRecalc`; Drift-Guard `scripts/berechnungs_schema_test.mjs`): Inline-SVG mit drei Membran-Gefässen im Grössenverhältnis des gewählten VN — ① Vordruck p0 (nur Gas, Membran oben), ② gefüllt kalt mit Wasservorlage VWr beim Fülldruck, ③ Betrieb warm mit VWr+Vex bei Enddruck ≤ pfin; Wasser oben (Anlagenanschluss), Gaspolster unten, hst-Massband, SV-Chip, Ergebnis-Chips (VN,min/Vex/VWr/P·V-Pflicht). **Aufheiz-Slider** (Range bewusst OHNE id — AutoSave) morpht Zustand ②→③, Druck via Boyle-Interpolation mit exakten Endpunkten Fülldruck→pfin (`_heSimSet`, Geometrie in `window._heSimGeo`). Guards: pfin ≤ p0 bzw. VN,min > 800 → Warnhinweis statt Schema. Chips klickbar (`data-heziel`), NUR literale Hex-Farben.
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

Mollier-h,x-Diagramm nach der Seven-Air-Vorlage (950 mbar / 540 m ü.M.). **Neues Präfix `lt_` (Lüftungsberechnungen)**; die Kachel lebt seit Feedback 07/2026 auf der **Hauptseite** (index.html, Kategorie «Lüftung & Klimatisierung», neben dem «Kälte»-Platzhalter) — nicht mehr auf sb_index. KEIN Excel — Formeln sind Standard-Psychrometrie (per Playwright gegen Tabellen-Referenzwerte + Round-Trips validiert):
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

### Regenwasser / Starkniederschlag — MeteoSchweiz B04 (sb_niederschlag.html)

Das bestehende Modul «Niederschlagsanfall» (Regenspende r(D,T) → Dachwasser/Umgebung/Notentwässerung) hat neben der bisherigen **SN-592000-Stationswahl** (Dropdown ~71 HADES-Stationen, `DATA.regenspende` in l/(s·m²)) eine **zweite Datenquelle: MeteoSchweiz-Punktdaten** (Karte B04, «Extreme Punktniederschläge», HADES-Sektion B4, 1-km-Raster). Umsetzung nach `regenwasser_HANDOFF.md`; Datenquelle über Adresse → nächste 3 Gitterpunkte (User-Entscheid: **beide Werte wählbar** — SN 592000 ODER Punktdaten). **Status: Format verifiziert (v3.0), Import-Werkzeuge bereit** — der Datenpool wird via `scripts/nb_extract.py` (NetCDF → NDJSON) + `scripts/nb_import.mjs` (→ Supabase, Service-Key) befüllt; solange leer, zeigt das Modul den Reminder. Alle Format-Fakten in `regenwasser_QUELLE.md`.

- **Quellformat (verifiziert aus den NetCDF-Dateien)**: NetCDF CF-1.8, **eine Datei pro Dauerstufe** (`…_5minutesum.nc`, `…_10minutesum.nc`), Gitter 370×265 (63'185 Landzellen), CRS CH1903+/LV95 + 2D-`lon`/`lat` (WGS84) pro Zelle, Variablen `X2…X300` = Wiederkehrwerte in **mm** (`_FillValue -99.9`), Dimension `probability=[0.025,0.5,0.975]` (Index 1 = zentral). Basel r(5,5)=9.90 mm→0.033 l/(s·m²) ≈ Stationswert. Importer: `nb_extract.py` (scipy) zieht die zentrale Schätzung → `{lon,lat,x,y,werte:{"5min":{T2..T300},"10min":{...}}}`; `nb_import.mjs` legt `nb_datensatz` an, batcht per PostgREST-REST (Service-Key umgeht RLS), schaltet aktiv, Sanity-Check Basel <710 m.

- **PostGIS-Pool** (`supabase/gema_regenwasser_v1.sql` + Rollback, **manuell im Supabase-SQL-Editor auszuführen**): `nb_datensatz` (versionierte Datensätze, genau einer `aktiv`) + `nb_gitterpunkt` (`geom` Point/4326, GiST-Index über `geography`, `werte`/`unsicherheit` als **jsonb in mm**) + GRANTs (`select` für anon/authenticated) + RLS (qual=true, wie GEMA-Standard) + RPC **`nb_naechste_punkte(p_lon,p_lat,p_limit)`** (SECURITY DEFINER, `<->`-Nearest-Neighbour, nur `aktiv`-Datensatz). **Werte-Kontrakt**: `werte = { "5min":{"T2":..,"T5":..}, "10min":{...}, "1h":{...} }` in mm — der Importer bildet das (noch unverifizierte) Quellformat darauf ab.
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** in sb_niederschlag (Node-testbar, 28 Fälle): `NB_MAP` (r(D,T) → B04-Dauerstufe/Wiederkehrperiode, **`// TODO: fachliche Bestätigung Robin`** für die Norm-Zuordnung je Anwendungsfall nach SN 592000/SIA 271/VSA), `nbMmToLsm2(h,dauerMin)` (**r[l/(s·m²)] = h/t**, da 1 mm = 1 l/m²; landet Basel r(5,5) bei 0.034 = Stationswert), `nbGridpointToRegenspende(werte)` → `{r5.5,…,r10.100}`, `nbInCH(lon,lat)` (WGS84-Bounding-Box-Sanity-Check gegen vertauschte Koordinaten), `nbNearestId`/`nbIsAbweichung`.
- **Integration (minimal-invasiv)**: Ein gewählter Gitterpunkt wird als **synthetischer Standort `__MCH__`** eingespeist — `getRegenspende(location,rwert)` liest bei `location==='__MCH__'` aus `window._nbValues`, `recalcRow` nimmt `window._nbActiveKey` statt der Stationswahl. Die bestehende SN-592000-Rechnung bleibt unangetastet. **KRITISCH**: `recalcAll()` summiert nur — für den Vollrecompute bei Quellenwechsel exponiert die Haupt-IIFE `window.recalcRowsAll()` (rechnet ALLE Zeilen neu + summiert); das B04-Wiring liegt in einem separaten Script-Block ausserhalb der IIFE und greift nur über diese window-Hooks.
- **UI**: Segment-Toggle «Standort (SN 592000)» ↔ «Punktdaten MeteoSchweiz» in der Standardwerte-Karte. MeteoSchweiz-Panel = Adress-Autocomplete (**`GemaAdresse.attach` auf `#nbAdr`**, swisstopo, liefert lon/lat — kein separater Geocoder, WGS84 umgeht die LV95-x/y-Falle) + manuelle Koordinaten-Eingabe (immer möglich, offline-fest) → 3 Gitterpunkt-Karten (Distanz/Höhe/LV95/r(5,5)), **Default = nächstgelegener** Punkt, Abweichung erzwingt **Pflicht-Begründung** (`nbBegrChanged` wendet erst mit Begründung an). Quellen-Note (MeteoSchweiz B04 + swisstopo) für den PDF-Screenshot. **Empty-State/Reminder**: leerer RPC (404/[]) → gelber Hinweis mit Verweis auf `regenwasser_QUELLE.md` (der In-UI-Reminder, wie Robin die Quelldaten liefert). RPC-Client via `GemaSync.SB_URL`/`SB_KEY`/`getAuthToken()`. Persistenz in `state.defaults.nb` (offline-fest: gespeicherte Werte, kein Re-RPC beim Reload). Test-Hooks `window._nbHooks`.
- **Übersichtskarte (rk-, Leaflet 1.9.4 via cdnjs)**: Nach dem Laden der Gitterpunkte erscheint unter den Punktekarten eine **Mini-Karte** (200 px, swisstopo Landeskarte grau `ch.swisstopo.pixelkarte-grau`, ALLE Interaktionen deaktiviert — Klick-Overlay «Karte öffnen ⤢» → **Vollbild-Modal** mit interaktiver Karte, eine Instanz wiederverwendet, ESC/X/Backdrop, `maxBounds` Schweiz). Marker NUR `L.divIcon`: Projekt-Pin (Akzentfarbe `--accent`), Rasterpunkte 1–3 nach Distanz nummeriert, **gewählter Punkt mit Akzent-Ring** (kein IDW — das Modul nutzt EINEN Punkt, daher keine Gewichtsanzeige); gestrichelte Distanzlinien mit permanenten Tooltips im Modal (m/km-Logik), Popups/Legende zeigen `r(5,5) … l/(s·m²)` (Original-Einheit), LV95 im CH-Format mit Apostroph. **Nur Anzeige** — kein Standort-Setzen per Klick. Koordinaten: RPC liefert `x_lv95`/`y_lv95` bereits (keine SQL-Änderung nötig); Client-Konvertierung `rkToWGS84` (Auto-Erkennung LV95/LV03/WGS84, swisstopo-Näherungsformeln, Testvektor Bern) im `/*RK-ENGINE-START*/`-Block (Node-testbar). **Druck**: Checkbox «Übersichtskarte im Bericht anzeigen» (Default an, `gema_regenkarte_print_v1`) → **statisches Bild** via WMTS-Kachel-Stitching auf Canvas (1200×800, Marker/Linien/Attribution nachgezeichnet, `crossOrigin:'anonymous'`), **vorab generiert** (onbeforeprint kann nicht auf async warten); `@media print` blendet Live-Karte aus, `body.rk-printing`-Wrap um `GemaPDF.export` deckt den html2canvas-Pfad ab; Tainted-Canvas-Fallback druckt die Mini-Karte direkt (`rk-print-fb`). Anbindung minimal-invasiv über `window._rkUpdate`/`_rkHide`-Hooks in `nbRenderPoints`/`nbShowEmpty`/`nbSetSource`; Daten via `_nbHooks.state()`. Ohne Leaflet/Netz: grauer Platzhalter, Berechnung unverändert. Tests: `scripts/regenkarte_engine_test.mjs` (25 Fälle) + Playwright-Smoke (34 Fälle, RPC/Kacheln gemockt). Test-Hooks `window._rkHooks`.
- **Projekt-Autoübernahme (Feedback 07/2026, `scripts/niederschlag_feedback_test.mjs` 31 Checks)**: (1) **SN 592000**: `NB_STATION_COORDS` (Ortskoordinaten aller 70 SMA-Stationen, nur für die Wahl — Werte bleiben Normwerte) + `_nbAutoStation()` — Projektadresse wird via swisstopo geocodet (`window._nbGeocode`, programmatisch — GemaAdresse exportiert nur attach) und die **nächste Station automatisch gewählt**, mit Hinweis `#nbStationAuto` (Distanz km). Greift NUR solange keine manuelle Wahl: `change` am Select setzt `_nbLocManuell` (persistiert in `defaults.locationManuell`), Auto nur bei Init-Default oder letzter Auto-Wahl (`defaults.locationAuto`) — bewusste Alt-Wahlen werden NIE überschrieben. (2) **MeteoSchweiz**: `_nbPrefillFromProjekt()` befüllt `#nbAdr` aus dem aktiven Objekt und lädt die Gitterpunkte automatisch (nur wenn nichts geladen/getippt). Trigger: Boot (init +900 ms), Objektwechsel (`_apply`), `gema-objekte-loaded`, Quellenwechsel. (3) **Punktkarten + Karten-Popups/Legende zeigen r(5,5) UND r(10,5)**. (4) **Marker-Kanon**: Projekt-Pin gross + ROT (#dc2626), Rasterpunkte GEFÜLLT navy (gewählt rot), Distanzlinien rot 3 px — Live-Karte, Legende UND Druck-Canvas identisch (die alten weissen Kreise/grüner Pin waren auf der grauen swisstopo-Karte fast unsichtbar). (5) **Art-Spalte**: `select.warType` mit `min-width:78px` + Voll-Label-Tooltip (Auto-Table-Layout quetschte den Kurzcode unter den Dropdown-Pfeil).
- **Stränge (Feedback 07/2026, `scripts/niederschlag_straenge_test.mjs` 27 Checks)**: Jede Fläche (Dach + Umgebung) kann per **Zeilen-Dropdown einem Strang** zugewiesen werden — «＋ Neuer Strang …» legt automatisch nach Leitungstyp nummeriert an (WAR-R 1, WAR-S 1 …, umbenennbar; User-Entscheid). Neue Karte **«Zusammenstellung nach Strängen»** (`renderStraenge`, vor der SS-Sektion): pro Strang die Flächen-Liste + Total m²/Q, «Ohne Strang»-Ausweis. **SS-Kopplung (echte Kopplung, User-Entscheid)**: pro Strang ein Schlammsammler wählbar → der SS übernimmt die Strang-Flächen automatisch in seine Auslegung (`ssEffNrs` = manuelle Chips ∪ `ssStrangNrs`; DN folgt, mehrere Stränge pro SS möglich). Strang-Chips im SS zeigen 🔗 und sind nicht abwählbar (Guard — Zuordnung im Strang ändern), manuelle Chips bleiben unabhängig. **Persistenz**: `state.straenge` + `state.ss` + `row.strang` in getState/setState — die SS-Karten (`ssState`) wurden vorher GAR NICHT gespeichert (gingen beim Reload verloren, jetzt behoben); setState restauriert Stränge + SS VOR den Zeilen (Dropdown-Optionen). Test-Hooks `window._strHooks`.
- **Noch offen**: Vollimport durch Robin ausführen (SQL-Migration + `nb_import.mjs` mit Service-Key), Lizenztext der Produktseite wörtlich in `regenwasser_QUELLE.md`, fachliche Norm-Zuordnung Dauerstufe/Wiederkehrperiode je Anwendungsfall bestätigen (`// TODO`), optional Unsicherheitsband + weitere Dauerstufen, halbjährlicher Versionscheck-Job (meldet nur — kein Auto-Import). Dachfläche bleibt **manuell** (User-Entscheid).

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

### Navigationslogik (Breadcrumbs) — Nav-Kanon (Drift-Guard: `scripts/nav_uniform_test.mjs`)

Alle 85 Seiten mit `.g-nav` folgen EINEM Kanon; der Test prüft ihn statisch (Markup) + gerendert (Playwright, `CHROME=<chromium> node scripts/nav_uniform_test.mjs`):
- **Logo**: exakt EINE Markup-Variante (volles GEMA-SVG aus index.html, `height="28"` im `<div class="g-nav-mark">`-Wrapper), href IMMER `index.html` (auch sys_garagist_dashboard — der Rollen-Redirect fängt Garagisten ab). Gerendert wird das Logo global 40px hoch (gema_responsive.css `!important`). Neue Seiten: Logo-Block 1:1 aus index.html kopieren.
- **Breadcrumb-Labels je Ziel (verbindlich)**: `sb_index.html` ⇒ «Sanitärberechnungen» (nur noch sa_/sb_) · hz_-Module ⇒ `index.html#hei` «Heizung & Wärmeerzeugung» · lt_-Module ⇒ `index.html#lueft` «Lüftung & Klimatisierung» (Feedback 07/2026: Heizungs-/Lüftungs-Kacheln leben auf der Hauptseite, nicht mehr auf sb_index) · `pm_ausschreibung.html` ⇒ «Planung & Management» · `ab_index.html` ⇒ «Ausbildung» · Brandschutz ⇒ `index.html#brand` «Brandschutz & Sprinkler» (es gibt KEIN br_index.html — der frühere Link war tot). Markup: `a.bc-cat` + `span.bc-sep ›` + `span.bc-cur`. Kein redundanter «GEMA»-Crumb (Logo verlinkt bereits index), keine «← …»-Links.
- **Buttons**: Feedback IMMER `<button class="gema-feedback-btn no-print" onclick="…GemaFeedback.start()">🔴 Feedback</button>` (auf JEDER Seite, auch Dashboards); Aktions-Buttons `g-nav-btn no-print`. Die METRIKEN (Höhe 34px, Padding, Font 12.5px, Radius 8px; Tablet 30px) erzwingt gema_responsive.css zentral mit `!important` — per-Seite-CSS bestimmt nur noch Farben (`:where()`-Defaults füllen Lücken, `.g-nav-btn.primary` behält Akzente, Feedback-Rot #dc2626 ist zentral fixiert). Keine per-Seite Höhen/Paddings für Nav-Buttons mehr einführen.

### Hauptmodul-Design (index.html / Übersichtsseiten)

Hero im `index.html`-Stil:
- Dunkler Gradient: `#0f172a → #1e3a5f → #0c4a2e`
- Grid-Overlay, Radial-Gradients
- `border-radius: 20px`, `padding: 48px`
- Zweispaltig: links Eyebrow-Pill + grosser Titel (`clamp(28px, 42px)`) + Beschreibung + Stats-Zeile; rechts Badge-Karten (Normen + CH Hosting)
- Effektive Modulzählung (nicht "16+")

### Modul-Kacheln: Stichpunkte + gleiche Höhen (Kachel-Kanon, User-Vorgabe 07/2026)

Gilt auf ALLEN Übersichtsseiten mit Modul-Kacheln (index.html, sb_index.html, ab_index.html, pm_ausschreibung.html):
- **Beschreibung = GENAU 3 Stichpunkte**, kein Fliesstext: `<div class="mod-desc"><ul class="mod-pts"><li>…</li>×3</ul></div>` (sb_index: `<ul class="mod-pts">` ersetzt das frühere `<p>` direkt). Stichpunkte sind kurze Funktions-Fragmente (Normen/Kennwerte nennen, kein Marketing, kein Punkt am Ende); `<sub>`-HTML für Formelzeichen erlaubt. Auch «Bald»-Platzhalter-Kacheln folgen dem Muster.
- **Gleiche Höhen**: `@media (min-width:641px){ .mod-grid{grid-auto-rows:1fr} }` (Mobile einspaltig bewusst ohne Streckung) + `.mod-title{min-height:2.4em}` (2 Titelzeilen reserviert — 1-zeilige Titel bekommen denselben Raum) + bestehendes flex-column/`flex:1`/Footer-unten. `.mod-pts li::before` = kleines Quadrat in `currentColor` mit Opacity.
- Die index-Suche filtert über den Kachel-Text — Stichpunkte bleiben durchsuchbar (Playwright-Check «QR-Rechnung → ERP-Kachel»).
- Neue Kacheln: IMMER 3 Stichpunkte im `mod-pts`-Muster anlegen, nie wieder Fliesstext-`mod-desc`.
- **Phone ≤640px: Kacheln werden ZEILEN (User-Vorgabe 07/2026, zentral in gema_responsive.css — kein per-Seite-Markup)**: eine schlanke Zeile pro Modul (Icon + Titel + Fav-Stern/Pfeil, ~54px statt ~180px); `.mod-desc`/`.mod-pts`, Badges und Norm-Chips sind per CSS ausgeblendet, bleiben aber im DOM (Suche filtert weiter). Technik: `display:contents` auf den Wrappern (`.mod-card-top`/`.mod-footer` bzw. `.mod-top`), `order` stellt Icon → Titel → Stern → Pfeil sicher; deckt BEIDE Markup-Varianten ab (`.mod-card` auf index/ab_index/pm_ausschreibung, `.mod` + `h3` auf sb_index). Nur der Fav-Stern (`.fav-btn` in `.mod-badges`) und bei `.disabled`-Kacheln der «Bald»-Badge bleiben sichtbar. Drift-Guard: `scripts/mobile_kompakt_test.mjs` (26 Checks inkl. Desktop-Gegenprobe).

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
- `GemaObjekte.upsertObjekt(obj)` – ADD-ONLY ein Objekt hinzufügen/aktualisieren (Quick-Add; kein Delete-Risiko). **Bounded-Retry (3×, 5s):** ein fehlgeschlagener `saveRecord` wird nachgezogen, damit ein lokal angelegtes Objekt nicht als «nur lokal»-Geist strandet.
- **`GemaObjekte.displayName(o, opts?)` – KANONISCHE Objekt-Beschriftung für ALLE Dropdowns/Anzeigen (KRITISCH):** liefert je nach per-User-Einstellung die **Bezeichnung** (`o.name`) ODER die **Adresse** (`objektAdresse(o)` = `Strasse, PLZ Ort`); leere Primärquelle fällt auf die andere zurück (dann `o.nummer`/`o.id`). `opts.modus` übersteuert die Einstellung, `opts.withNummer` stellt `o.nummer · ` voran. **Jedes neue Objekt-Dropdown/‑Label MUSS `GemaObjekte.displayName(o)` nutzen** (nie mehr `o.name` direkt) — sonst folgt es der Anzeige-Einstellung nicht. Der Metadaten-Autofill (`onObjektSelect` → Bearbeiter/Strasse/…) bleibt davon unberührt (nutzt weiterhin die echten Felder).
- **Anzeige-Einstellung (Bezeichnung ⇄ Adresse), per User + cross-device:** `getAnzeigeModus()` (`'name'`|`'adresse'`, Default `name`), `setAnzeigeModus(modus)` (schreibt `user.profile.objektAnzeige` via `GemaAuth.updateProfile` + synchroner localStorage-Cache `gema_obj_anzeige_v1` für den Dropdown-Render + feuert `gema-obj-anzeige-changed`), `refreshAnzeigeModus()` (Cache neu aus dem Profil lesen), `objektAdresse(o)`. UI: Select «Objekt-Anzeige» in `sys_profil.html` (Einstellungen-Karte). Test `scripts/objekt_anzeige_test.mjs` (22 Checks). Beim Modus-Wechsel Optionen NEU aufbauen (Filter-Dropdowns dürfen nicht auf `options.length<=1` guarden — sonst bleiben Alt-Labels stehen).
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

**URL-Parameter `?objekt=ID`:** setzt beim Seitenaufruf automatisch das aktive Objekt (globaler Handler in `gema_objekte_api.js` → `setActiveId`). Wird vom Berechnungen-Tab in pm_objekte.html + den Workspace-Eimer-Kacheln genutzt, damit der Planer direkt in der richtigen Zuordnung landet.

**Universeller Objekt-Preselect bei Modul-Sprüngen (07/2026):** Springt man in ein Modul mit eigenem Objekt-Filter-Dropdown und es gibt ein Kontext-Objekt (`?objekt=<id>` bzw. das aktive Objekt), wird dieses Objekt **automatisch vorgewählt** — nicht «Alle Projekte». Muster (aus pm_planablage `_objFilterInit` portiert nach pm_erp/pm_regierapport/pm_revisionsunterlagen/pm_behoerden_formulare): beim Boot + nach dem Cloud-Load + bei `gema-objekte-loaded` die Filter-Variable aus `?objekt=` → `GemaObjekte.getActiveId()` setzen — NUR wenn das Objekt in der sichtbaren Liste existiert und der User den Filter nicht selbst angefasst hat (`_xxTouched`-Guard; `onchange` setzt das Flag). Berechnungsmodule mit `metaObjektDropdown` folgen bereits über `GemaObjekte.getActiveId()`.

**Offerten-Tab (pm_objekte.html):** vierter Tab «📨 Offerten» — zentrales Postfach für alle Offertanfragen/Lieferanten-Offerten der Org (Quelle: `GemaProdukte.getOffertanfragen()`, sichtbar wenn `projekt.objektId` zu einem Org-Objekt gehört oder man selbst Absender ist). Tabelle mit Status, Brutto-Preis, klickbarem Offerten-PDF und Direktlink ins Berechnungsmodul (`OA_KAT_MAP`). **KRITISCH — `OA_KAT_MAP` muss JEDE Anlagenwahl-Kategorie enthalten** (sonst OA ohne Label/Backlink im Postfach); ebenso braucht jeder neue Berechnungswerte-Payload-Key ein Label in `_OA_BW_LABELS` (sys_lieferant_dashboard.html) und jedes Modul mit Anlagenwahl die Einbindung von `gema_offerten_tab.js` (injiziert den 📨-Tab in `.g-page`). Stand: alle 19 Anlagenwahl-Module abgedeckt (Audit-Muster: Kategorien aus `GemaAnlagenwahl.init` gegen KATEGORIEN/MODUL_MAP/OA_KAT_MAP/bkpMap abgleichen). Deep-Link `pm_objekte.html?tab=offerten[&objekt=ID]` — wird von den `offertanfrage_beantwortet`-Notifikationen verwendet. `gema_produktkatalog_api.js` ist dafür in pm_objekte.html eingebunden.

**Objekt-Löschung mit Daten-Check (pm_objekte.html, 07/2026):** `deleteObjektById` scannt VOR dem Bestätigungs-Dialog, ob und wo Daten für das Objekt gespeichert wurden (`_objDatenScan`, Test `scripts/objekt_loeschen_datencheck_test.mjs` 54 Checks). Zwei Klassen, beide werden im Dialog pro Modul aufgelistet (GemaDialog.confirm mit `html:true`):
- **Objekt-eigene Modul-Stände** (per-Objekt-Muster `<base>__<objektId>[@phase]` — GemaAutoSave-Snapshots, _GemaDB-Blobs wie Abnahme/Terminplan/VKF, Anlagenwahl `gema_aw_chosen_*`): via Cloud-Query `data_key=like.*__<oid>*` (exakter JS-Nachfilter — `_` ist SQL-LIKE-Wildcard!) + localStorage-Scan gefunden und beim Bestätigen **MITGELÖSCHT**: `GemaSync.deleteRecord(module_key, data_key)` pro Row (module_key kommt aus dem Scan — nie raten), alle `__<oid>`-localStorage-Keys, Berechnungs-Index-Einträge (`GemaObjekte.removeBerechnung`). Confirm-Button heisst dann «Objekt + Daten löschen».
- **Verknüpfte Datensätze anderer Module** (per-Record-Pools mit `objektId`-Feld: Schadensberichte, Regierapporte, ERP, Ausschreibungen, Bestellungen, Einsätze, OAs via `projekt.objektId` …): via Cloud-Queries `payload->data->>objektId=eq.<oid>` + `payload->data->projekt->>objektId=eq.<oid>` gezählt (Offline-Fallback: lokale Pool-Caches). Bewusst **NICHT mitgelöscht** (eigenständige Prozesse mit fremden/Cross-Org-Beteiligten — ERP-Rechnungen, beantwortete OAs etc.) — der Dialog weist sie als «bleiben erhalten, verlieren den Projekt-Bezug» aus. `notify`/`objekte`-Rows sind vom Listing ausgeschlossen (`_DEL_REF_SKIP`).
- Label-Auflösung `_delModulInfo`: MODUL_MAP → `_DEL_ALIAS` (abweichende _GemaDB-module_keys wie `abnahme`/`hebeanlage`/`thermische_solar`) → VKF-/aw_chosen-Muster → GemaAuth.getModules → prettifizierter Basis-Key. Cloud unerreichbar → amber Hinweis «Liste evtl. unvollständig», lokale Löschung läuft trotzdem. Test-Hooks `window._objDelHooks`.
- **Geist-tolerantes Löschen + Wartungs-Panel «🧹 Aufräumen» (07/2026, Test `scripts/objekt_ghost_cleanup_test.mjs` 27 Checks):** Test-/Alt-Objekte erscheinen manchmal in Dropdowns, fehlen aber in der Objektliste — Ursachen: (a) ein Workspace-Eimer (`gema_workspace_v1`, `obj_ws_*`) legt sie beim Öffnen immer wieder an (`_wsEnsureObjekt`), (b) sie liegen nur lokal (Cloud-Save schlug fehl). Zwei Bausteine: (1) **`deleteObjektById` ist Ghost-tolerant** — ein Objekt, das nicht in `_mem` liegt, wird aus `getAllUnfiltered()` aufgelöst bzw. mit Stub weiterbearbeitet (statt «nicht gefunden» abzubrechen); nach dem Bestätigen räumt **`_objScrubEverywhere(id, betIds)`** hart auf: `GemaSync.deleteRecord('objekte','objekt:'+id)` + je `bet:`-Row (persistBlob-Diff greift bei nicht-`_mem`-Ghosts nicht), Pool-Caches `gema_objpool_v1`/`gema_betpool_v1` (`_objArrRemove`) und **entkoppelt referenzierende Workspace-Eimer** (`bucket.objektId=null` — bricht den Resurrection-Loop). (2) **Wartungs-Panel** (Toolbar-Button «🧹 Aufräumen», `_objWartungOpen`) zeigt die **UNION** aus `getAllUnfiltered()` (org-scoped, alle Status) und `_objWorkspaceRefs()` (Workspace-referenzierte IDs) mit Herkunfts-Badges: «nicht in Liste», «nur lokal» (aus dem nachgeladenen Cloud-ID-Set `_objWartungCloudIds` via `_delSbFetch(objekt:*)` → `inCloud===false`), «🗂 Workspace-Eimer», Status; Direkt-Löschen pro Zeile über `deleteObjektById`. Hooks `_objDelHooks.{scrub,wartungRows,wsRefs}`.

**Zuordnungs-Pill:** `gema_objekte_api.js` injiziert automatisch einen Status-Chip in die `.project-bar`:
- 📋 «Zugeordnet zu: <Objekt>» (grün) wenn Objekt aktiv
- ⚠ «Nicht zugeordnet — bitte Projekt wählen» (amber) sonst

Geplant: `gema_lu_api.js` für den Datenfluss aus der LU-Zusammenstellung:
- `GemaLU.getVerbraucher(objektId)` – alle Verbraucher eines Projekts
- `GemaLU.getByMedium(objektId, medium)` – Verbraucher gefiltert nach Medium
- `GemaLU.getSpitzenvolumenstrom(objektId, medium)` – berechneter l/s-Wert

---

## Feedback & PDF-Systeme

### gema_feedback.js (v4)

- Annotation-Overlay nach Screenshot-Snip mit **4 Werkzeugen wie in PDF-Programmen** (Toolbar oben, aktives Werkzeug rot): ✏️ Stift (Freihand), ↗ Pfeil (gefüllte Spitze am Endpunkt), ▭ Rechteck, T Text (Inline-Input direkt an der Klickposition — Enter übernimmt, ESC bricht nur das Input ab, Blur committet; Text mit weissem Halo für Lesbarkeit)
- **Vektor-Shape-Modell** (`_annotShapes`): jede Form ist ein Objekt, Drag zeigt Live-Vorschau, Undo entfernt genau das letzte Objekt (kein Pixel-Undo); Mini-Drags < 6 px werden verworfen. Merge in den Screenshot erst bei «Fertig». Maus + Touch
- **Wichtig**: Frisches Canvas bei jedem Öffnen erstellen (kein `getBoundingClientRect()`-Caching); Overlay ist flex-column (Toolbar darf umbrechen)
- localStorage-Fallback; Test-Hooks `window._gfbHooks` (openAnnotation/setTool/shapes/undo/finish)
- **Markdown-Export-Status-Dialog (sys_beta.html)**: Nach dem Export (💾 Download UND 📋 Kopieren) fragt `openExMarkDialog` pro exportiertem OFFENEN Punkt per Checkbox (vorausgewählt, gruppiert nach Modul, «Alle abwählen»-Toggle, Live-Zähler), ob er auf `cStatus='bearbeitung'` gesetzt werden soll — ersetzt die frühere stille Auto-Mark-Checkbox. «Erledigt» wird nie zurückgestuft, «bearbeitung» nicht erneut gelistet. Drift-Guard: `scripts/feedback_tools_test.mjs` (33 Checks, Annotation + Dialog)
- **Feedback-Board (sys_beta.html, Feedback 17.07.2026)**: Feedback-Punkte pro Modul als **eingeklapptes Voll-Breite-Panel** unter der Modul-Zeile (`buildPanelRow` → `tr.fbp-row` mit colspan 5, Toggle `toggleFbPanel`; die frühere enge Kommentar-Box IN der Tabellenzelle ist weg, `toggleCommentBox('cb-<id>')` bleibt Legacy-Alias). Karten-Layout (`.fb-card`) mit **grossen Screenshots** (max. 380px statt 160px, Klick → Lightbox `fbLightbox` mit ESC/Klick-Schliessen) und **Mehrfachauswahl**: Checkbox pro Punkt (`_fbSel` Key `modId|src|idx`) + «☑ Alle markieren» pro Modul, modulübergreifend kombinierbar → fixe **Bulk-Leiste unten** (`fbBulkStatus`) setzt den Status aller markierten Punkte gemeinsam (offen/bearbeitung/erledigt; Feedback-Arrays pro Modul EINMAL geparst/gespeichert, manuelle Kommentare via autoSave). Löschen verwirft die Auswahl des Moduls (`fbSelDropModule` — Index-Shift). Filter/Suche: Panels folgen der Modul-Zeile, die Volltextsuche findet auch Feedback-Text im Panel. Drift-Guard: `scripts/beta_feedback_board_test.mjs` (25 Checks)

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

### GEMA-Logo blitzt kurz auf, bevor das Firmenlogo erscheint (Pre-Paint-Fix)

**Symptom**: Auf einer frisch ladenden Seite sah man ganz kurz das GEMA-Logo, bevor `_swapLogo` es gegen das hinterlegte Firmenlogo tauschte (FOUC beim Seitenwechsel).

**Ursache**: Das GEMA-SVG steht statisch im Nav-Markup (`.g-nav-mark`) und wird gezeichnet, bevor `_swapLogo(userOrg)` (läuft erst bei `DOMContentLoaded`) es durch das `<img>` mit `org.logo` ersetzt.

**Fix (`gema_auth.js`, gilt für alle Seiten zentral)**: `_navLogoPrepaint()` läuft **synchron im `<head>`** (gema_auth.js ist ein blockierendes `<script>` vor dem Body → vor dem Nav-Paint). Es liest den Pre-Paint-Cache `gema_nav_logo_v1` (`{orgId, src, ratio, name, hideName}`, von `_cacheNavLogo` beim letzten erfolgreichen `_swapLogo` geschrieben) und injiziert — nur wenn der Cache zur Org des eingeloggten Users passt (**orgId-Guard** gegen fremdes Logo nach User-/Org-Wechsel) — ein `<style id="_gaNavLogo">`, das `.g-nav-mark svg{display:none}` setzt und das Firmenlogo als `.g-nav-mark::before`-Hintergrund rendert. So erscheint auf jeder Folgeseite sofort das richtige Logo (nur die allererste Seite nach dem Login blitzt einmalig, weil der Cache noch fehlt). `_swapLogo` entfernt den Pre-Paint-Style, bevor es das echte `<img>` einsetzt (gleiches Bild → kein Doppel-Logo), und **self-heilt**: hat die Org kein Logo, werden Cache + Pre-Paint-Style gelöscht und das GEMA-SVG wieder sichtbar; `logout()` leert den Cache. Test: `scripts/navlogo_prepaint_test.mjs` (16 Checks: Pre-Paint aktiv, Cache-Schreiben, Cross-Org-Guard, Self-Heal — Pre-Swap-Zustand via zuerst registriertem DOMContentLoaded-Listener gemessen).

### DM-Sans „l" wird zu dick im PDF-Export (Optical-Sizing)

**Symptom**: Im HTML/Print-PDF (Schaden-/Dachbericht) erscheint das kleine „l" (und ähnliche dünne Glyphen) **fetter/dicker** als der Rest — v.a. in Listen/Fliesstext.

**Ursache**: `gema_schaden_pdf.js` / `gema_dachbericht_pdf.js` setzten im Body `font-optical-sizing:none`. Das zwingt die **DM-Sans-Variable-Font** auf ihre Default-Optical-Size (kräftigere Striche, für Display gedacht) → bei kleinem Fliesstext (10.5pt) wirken die Striche zu schwer.

**Fix**: `font-optical-sizing:auto;font-variation-settings:"opsz" 14;` im Body-CSS (statt `none`). `opsz 14` = Text-Optische-Grösse → saubere, gleichmässige Striche. **Kanon gilt für JEDES Druckfenster, das DM Sans lädt** (Fonts-Link im `document.write`) — aktuell: gema_schaden_pdf, gema_dachbericht_pdf, gema_revision_pdf (Kanon liegt im REPORT_CSS), pm_stunden (Monatsblatt), pm_bestellungen (Bestellschein), ab_pruefungen (Prüfungs-PDF), if_wareneingang (Etiketten). Druckfenster OHNE Fonts-Link drucken im System-Fallback und sind nicht betroffen; jsPDF nutzt Standardfonts (latin1). **Drift-Guard: `node scripts/pdf_opsz_test.mjs`** — failt bei jedem neuen DM-Sans-Druckfenster ohne Kanon und bei jedem `font-optical-sizing:none` im Repo.

### Cross-Modul-Write brach still: IIFE-Scope über Script-Block-Grenzen + try/catch (sa_osmose, BEHOBEN)

**Symptom**: Die Kette LU→Osmose→Enthärtung war am mittleren Glied tot — `sa_enthaertung`/`sb_grobauslegung` bekamen NIE Permeat+Konzentrat, obwohl die Osmose-Berechnung im UI korrekt lief.

**Ursache (zwei Schichten)**: (1) `recalc()` (Script-Block 1, top-level) referenzierte `_prevObjektId`, das nur in der Meta-IIFE von Script-Block 2 deklariert ist → **ReferenceError bei jedem recalc**, verschluckt vom umgebenden try/catch → `GemaOsmose.save` lief nie. Der Inline-`onclick="_prefillFromLU(_prevObjektId)"` des «↻ LU-Daten laden»-Buttons war aus demselben Grund tot (inline onclick löst global auf, die Funktion war IIFE-lokal). (2) Selbst wenn save lief: `gema_osmose_api._write` schrieb bei vorhandenem `_GemaDB` NUR via `_GemaDB.save` — das legt den Wert in den SEITENLOKALEN Cache (+ Cloud nur, wenn die Seite `_GemaDB.init` aufgerufen hat; sa_osmose tut das nicht). Die Zielseite las `_GemaDB.c` (leer) → localStorage (nie beschrieben).

**Fix/Regeln**: `GemaOsmose.save` liest den Objekt-Bezug scope-sicher aus dem `#metaObjektDropdown` (leeres Dropdown = bewusst kein Objekt → kein Save); der Button ruft `window._osmoseLuReload()` (in der IIFE exponiert). `gema_osmose_api._write` schreibt **IMMER zuerst localStorage** (der Lesekanal der Zielmodule), `_GemaDB.save` nur zusätzlich. **Merkregeln**: Inline-onclick-Handler und Code in anderen Script-Blöcken erreichen NUR window-exponierte Namen; ein grossflächiges try/catch um Cross-Modul-Writes verschluckt solche ReferenceErrors lautlos — Objekt-IDs für Cross-Modul-Saves immer aus DOM/GemaObjekte auflösen statt aus fremden Block-Scopes. E2E-Absicherung: `scripts/kette_e2e_test.mjs` (17 Checks: LU→Osmose→Enthärtung inkl. Doppelzählungs-Schutz, Vormerkung-Ableitung, Boot pm_ausschreibungsunterlagen/pm_revisionsunterlagen).

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

### Funktion NIE per zweiter `function`-Deklaration im selben Scope wrappen (setTab-Rekursion, BEHOBEN)

**Symptom (pm_abnahme)**: Die Tab-Buttons Mängelliste/Prüfliste/Pläne (und «Zur Mängelliste →») taten NICHTS — jeder Klick warf `RangeError: Maximum call stack size exceeded`.

**Ursache**: Die Pläne-Tab-Erweiterung wrappte `setTab` per `var _origSetTab=setTab; function setTab(t){_origSetTab(t);…}` im SELBEN IIFE-Scope wie das originale `function setTab`. Function-Declarations werden gehoisted, die zweite gewinnt für den GANZEN Scope — `_origSetTab` zeigte damit auf den Wrapper selbst → Endlos-Rekursion bei jedem Aufruf.

**Regel**: Zum Wrappen entweder (a) die Logik direkt in die Original-Funktion integrieren (so gelöst — `if(t==='plaene')_planRenderList()` in setTab), oder (b) per **Zuweisung** wrappen (`recalcAll = function(){…}` nach `const _orig=recalcAll` — Muster sb_niederschlag; Zuweisungen laufen in Code-Reihenfolge, keine Hoisting-Falle), oder (c) `window.x`-Property wrappen. NIE eine zweite `function NAME(){}`-Deklaration desselben Namens im selben Scope. Drift-Guard: `scripts/abnahme_tabs_test.mjs` (17 Checks — alle 4 Tabs + Sprung-Button, pageerror-Überwachung).

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

Anlagenregister + Wartungsverträge + automatische Serviceaufträge — schliesst den Kreis «Anlage geliefert → Anlage gewartet → Wartung verrechnet». **Neues Präfix `sv_`**, moduleKey `service`, cat Hygiene (Kachel in «Hygiene & Betrieb»). **Ersetzt das alte `hy_inspektion.html` («Inspektion & Wartung», moduleKey `inspektion_wartung`, einfaches Anlagen-Inventar) — dieses wurde 07/2026 komplett entfernt** (Datei + alle Registrierungen: gema_auth MODULES/FILE_MAP + Rollen-Permissions, index.html-Kachel, sw.js, sys_workspace, gema_recent, sys_beta-Feedbackboard, sys_unternehmen-Preiskategorie, Rollen-Golden regeneriert → 75 Module). Die `_delModulInfo`-Labels (`inspektion`/`inspektion_wartung`) in pm_objekte bleiben bewusst — sie beschriften evtl. noch vorhandene Altdaten (`gema_inspektion__<oid>`) beim Objekt-Löschen.

- **Pools (per-Record)**: Anlage `svanl:`→`gema_sv_anlagen_pool_v1` (`{name,kategorie,hersteller,modell,serienNr,standort,objektId/objektName,produktId?,quelleOaId?,lieferantFirma?,inbetriebnahme,garantieBis,intervallMonate,letzteWartung,status,vertragId?,notizen}`) · Vertrag `svvtr:`→`gema_sv_vertraege_pool_v1` (`{titel,kundeText,objektId,anlagenIds[],pauschaleNetto,startDatum,status}`) · Serviceauftrag `svauf:`→`gema_sv_auftraege_pool_v1` (`{anlageId,anlageName,objektId/Name,vertragId?,faelligAm,status offen|eingeplant|erledigt|verrechnet,erledigtAm/Von,rapport,einsatzId?,rechnungId?}`).
- **Engine** (`/*ENGINE-START*/`, Node-testbar): `svAddMonths` (mit Monatsende-Klemme), `svNextWartung` (Basis: letzteWartung → Inbetriebnahme → Erfassungsdatum; ohne Intervall null), `svDaysUntil/svUrgency` (überfällig/≤7 fällig/≤30 bald), `svGarantieAktiv`, **`svScanFaellig`** (Seitenstart-Scan: Anlagen mit Wartung ≤30 Tage → offener Serviceauftrag; idempotent über (anlageId,faelligAm), offener/eingeplanter Auftrag blockiert Duplikate), `svNextReNr` (ERP-Nummernkreis RE-Jahr-NNN repliziert).
- **Import aus Offertanfragen**: «⬇ Aus Offertanfragen» listet beantwortete OAs (`GemaProdukte.getOffertanfragen`) → Anlage mit Produkt/Lieferant/Projekt vorbefüllt (`quelleOaId` verhindert Doppel-Übernahme, Intervall-Default 12 Monate).
- **Cross-Modul-Writes** (ADD-ONLY via `xPoolAdd` — getCached→push→saveRecord mit fremdem moduleKey, nie persistCollection): «📅 Einsatz» schreibt einen Einsatz (`typ:'frei'`, Titel «🛠 Service: …», `serviceAuftragId`) in `gema_einsatz_pool_v1` + `einsatz_geplant` an den Monteur; «💰 Rechnung» erzeugt einen ERP-Rechnungs-Entwurf (`erpdok:` in `gema_erp_dok_pool_v1`, Position mit Rapport-Text, EP 0 zum Ergänzen bzw. Vertragspauschale, **`sachbearbeiter` = Ersteller**) und verlinkt `auftrag.rechnungId` (Status `verrechnet`), Dialog bietet Sprung zu `pm_erp.html?doc=…`.
- **Einsatzplan-Verknüpfung (07/2026, `scripts/service_einsatz_verknuepfung_test.mjs` 20 Checks)**: Die Anlage trägt **`schluessel:{code,info}`** (🔑-Felder im Formular) und **`bereichId`** (Arbeitsbereich-Select aus `org.settings.arbeitsbereiche`, nur sichtbar wenn definiert; `svBereiche`/`svBesListe`/`svAnlSchluessel`/`svKeyBoxHtml`). «📅 Einsatz planen» zeigt die Schlüssel-Box + **Besonderheiten-Toggle-Chips** (Liste `org.settings.einsatzplan.besonderheiten`) und übergibt beim Speichern **Schlüssel-Snapshot, `bereichId` und `besonderheiten`** auf den Einsatz — Kalender-Karte in Bereichsfarbe, Pills + 🔑-Box beim Monteur; Notify nennt die Besonderheiten, NIE den Code. `epSchluessel` in pm_einsatzplan liest dafür das **eigene `ev.schluessel`-Feld ZUERST** (Service-Einsätze haben keinen ERP-Auftrag), dann den Auftrag-Lookup. Anlagen-Karte zeigt 🔑 + Bereich-Farbpunkt; das Wartungs-Doku-Modal (QR-Scan vor Ort, `#dok_key`) zeigt die Schlüssel-Box ebenfalls.
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

### Autocomplete-Vorschläge: Werkzeug vs. Koffer getrennt + Standorte (if_werkzeug.html)

- **Werkzeug-Erfassung** (`_wzGetKatalogEntries` für `f_name`/`f_brand`/`f_model`): eigene Geräte fliessen NUR ohne Koffer ein (`_wzIsKoffer`-Skip) — Koffer-Bezeichnungen gehören nicht in die Werkzeug-Vorschläge. **Koffer-Dialog** (`openKofferForm`): `kofName` schlägt spiegelbildlich NUR andere Koffer vor (eigener Koffer beim Bearbeiten ausgeschlossen, Hint «N Teile»).
- **Standort-Vorschläge überall** (`_wzStandortSuggestions`): zentrale Quelle = Standort-Notizen der Werkzeuge (`t.notes`, Koffer-Notizen ausgenommen — Freitext) + alle Platz-Zuweisungen (`zugewiesenAn.typ==='platz'`, auch von Koffern), case-insensitive dedupliziert. Angebunden an `f_notes` (Formular), `zuwPlatz` (Zuweisungs-Modal), `kofPlatz` (Koffer-Dialog), `be_v_notes`/`be_v_zuwPlatz` (Sammel-Bearbeitung).
- **`_wzInitAC` ist re-init-sicher** (`data-ac-for`-Dedup: alter Drop desselben Feldes wird abgeräumt) — nötig für die dynamischen Dialoge, deren Inputs bei jedem Öffnen neu entstehen. **`.ac-drop` z-index 11500**: über `_wzShowModal` (10500), unter QR-Scanner (12000)/GemaDialog (12800); Scroll-Listener mit `capture:true` (Overlay-Scroll bubbelt nicht).

### QR-Code & Etiketten (if_werkzeug.html)

**Hero-Kamera-Scan (nur Touch-Geräte)**: `#wzHeroScan` («📷 Scannen») im Hero-Header öffnet `_wzScanWithCamera()` (In-App-Kamera via GemaQR) — sichtbar nur bei `matchMedia('(hover: none) and (pointer: coarse)')` (iPhone/Tablet). Hintergrund: Die System-Kamera öffnet den QR-Link jedes Mal in einem neuen Tab samt Neu-Anmeldung; der In-App-Scan bleibt in der laufenden Session. Alle Rollen (auch Monteur).

**Scan-Routing, Verloren-Status & Aktivitäten pro Werkzeug (07/2026, `scripts/werkzeug_scan_detail_test.mjs` 40 Checks)**:
- **Scan-Routing `_wzScanOpen(id)`** (Kamera-Scan UND `?scan=`-Deep-Link): Magaziner/Admin landen bei NICHT-Koffern **direkt in der Detailansicht** (`openViewTool`) statt in der Scan-Ansicht; Koffer behalten die Scan-Ansicht (Vollständigkeitskontrolle/Rückgabe ist dort die Hauptfunktion), Monteure den Selbst-Ausleihe-Flow (`_wzScanAusleihe`).
- **«Aktionen»-Block im Detail-Modal** (`#vm_actions_grid` am Ende von `vm_body`): 🔄 Ausleihen an … / 👷 Zuweisen / ↩ Zurück ins Lager (bei Ausleihe) für `_wzCanEdit()` (bei ausstehender Einbuchung ausgeblendet), 🚨 Defekt melden (alle), 📝 Berichte, 🔲 QR/Etikette, 📋 Aktivitäten, ❓ Verloren/✅ Wieder gefunden — alle Aktionen ohne Umweg über die Geräteliste (Buttons schliessen das Modal via `closeView()` und öffnen den jeweiligen Dialog). Kopf-Badges zeigen Lifecycle + SN + aktuellen Ausleiher.
- **Verloren-Status**: `lifecycleStatus:'verloren'` (+`verlorenAm`) via `_wzMarkVerloren` (GemaDialog danger-Confirm, nur Magaziner/Admin) / zurück via `_wzMarkGefunden`. Ausleihe/Zuweisung bleiben BEWUSST stehen (Nachverfolgung «zuletzt bei X»); rotes Karten-Band, bleibt in der Standard-Sicht sichtbar (nicht Archiv — nur ausgemustert/verkauft sind archiviert); Formular-/Bulk-Select, PDF-Statusmap und Scan-Quick-Buttons kennen den Wert; Koffer-Kandidaten-Suche schliesst verlorene aus. Aktivitätenlog-Aktionen `verloren`/`gefunden`.
- **Aktivitäten pro Werkzeug**: `_wzToolActLog(id)` öffnet `GemaActivityLog.openModal({modul,titel,recordId,recordName})` — das zentrale Modal gefiltert auf EINEN Datensatz (Anzeige + CSV; `recordName` als Fallback-Match für Alt-Einträge ohne `modulRecordId`). Buttons: Detail-Modal-Aktionen + Scan-Ansicht («📋 Aktivitäten dieses Werkzeugs»), nur `_wzCanEdit()`.
- **Koffer-Scan-Teileliste**: jede Position zeigt eine zweite Zeile mit **Typ (Kategorie), Hersteller/Modell und SN** (`typZeile` in `_wzScanAusleihe`); unter «✓ Kontrolle bestätigen» erklärt ein Hinweis, dass der Button die Kontrolle nur DOKUMENTIERT (wer/wann/Ergebnis + Fehlteil-Meldung an den Magaziner) — reines Anschauen braucht keinen Klick.

Werkzeug hat **dasselbe Etiketten-System wie das Trocknungs-Modul** (siehe Abschnitt «Etiketten-System (komplett)» unter Trocknungsgeräte für die vollständige Logik) — portiert mit `_wz`-Prefix:
- QR-Dialog mit Umschalter **«QR-Code | Etikette»** (`setQrMode`); `_wzCurrentQRTool` wird in `openQR` gesetzt. QR-URL = `?scan=<id>`.
- Etikette **49×23mm Querformat**, festes Layout (QR rechts über volle Höhe, links Logo oben + interne Bezeichnung darunter). Beschriftung = `internKennung || name`. Logo = `org.logo` (via `GemaAuth.getCurrentOrg()`), sonst GEMA-Fallback, für jsPDF zu PNG gerastert. Helper analog Trocknung: `_wzComputeEtikette`, `_wzDrawEtikette`, `_wzEnsureLabelLogo`, `_wzBuildEtikettePreview`, `_wzFitText`, `_wzGetQrDataUrl`/`_wzRenderQrDataUrl`, jsPDF via `_wzEnsureJsPDF`.
- **Maximal-Skalierung (User-Vorgabe)**: Der Haupttext füllt die verfügbare Fläche — `_wzComputeEtikette` startet mit `maxFont = Resthöhe als 1 Zeile` (gedeckelt 46pt statt fix 12pt); eine kurze Kennung wie «3» wird riesig, langer Text schrumpft. `_wzFitText` prüft dabei Höhe UND Breite (einzelne lange Wörter wie «WZ-0140» liefen bei grossen Fonts sonst über den Rand).
- **Name optional mitdrucken** (`org.settings.werkzeug.etiketteName`: `'nie'` Default | `'immer'` | `'fragen'`, ⚙️-Einstellungen Sektion «Etiketten», gilt für Werkzeuge UND Koffer): `_wzComputeEtikette(text, logo, subText)` reserviert für den Namen eine kleine Zweitzeile (max 6pt, bis 2 Zeilen) unter der maximal skalierten Kennung; `_wzEtiketteSubText(t, withName)` liefert den Namen nur, wenn eine Kennung existiert (sonst ist der Name bereits Haupttext). Einzel-Druck: Checkbox `#wzLblName` im Etiketten-Dialog (pro Werkzeug in `openQR` nach der Einstellung vorbelegt, bei fehlender Kennung versteckt); Sammelexport: `'fragen'` → einmal pro Export GemaDialog («Mit Name»/«Nur Kennung»). Test-Hooks `window._wzEtikHooks`.
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

**Monteur ist HARD-LOCKED (analog if_werkzeug)**: `_fzCanEdit()` gibt für `role_monteur` IMMER false zurück, auch wenn ein Admin der Rolle `write` auf fahrzeugmanagement vergibt ODER der Monteur zusätzlich Org-Admin ist — Edit-Rechte nur über Admin-/Magaziner-/Garagist-Rolle. **KRITISCH — Reihenfolge**: der `if(_fzIsMonteur())return false;`-Check MUSS die ERSTE Zeile in `_fzCanEdit()` sein (wie `_wzCanEdit` in if_werkzeug). Stand er nach dem `_fzCanSettings()`-Kurzschluss (Org-Admin) bzw. dem `GemaAuth.can('admin')`-Pfad, rutschte ein Monteur mit admin-Grant/Org-Admin-Status durch (vom Rollen-Matrix-Test gefunden, siehe `scripts/rolematrix_test.mjs`). Was der Monteur darf: **Defekt melden** (`_fzCanReportDefect`, alle User), **auf sich selbst ausleihen** (`_fzCanLend` = Editoren + Monteur; `_fzOpenAusleihe` zeigt Monteuren nur sich selbst im Picker, bei fremder Ausleihe blockiert; `_fzSaveAusleihe` hat Hard-Guards gegen Fremd-Ausleihe/-Aufhebung) und **eigene Ausleihe zurückgeben** (`_fzCanReturn` matcht `ausgeliehenAn.userId`). Gesperrt + geguardet: `openModal(edit)`, `saveVehicle`, `openZuweisung`/`saveZuweisung` (**`_fzCanAssign()` = nur Magaziner/Admin, auch nicht Garagist**), `openKosten`/`saveKosten`, Garage-Toggle, km-Quick-Edit. UI folgt: Karten-/Zeilen-Klick öffnet für Nicht-Editoren `openViewFzg` statt des Edit-Formulars, 👤 Zuweisen/✎-Buttons nur für Berechtigte, View-Footer (✏️/💰/🏭 via `vm_editBtn`/`vm_kostenBtn`/`vm_garageBtn`) nur für Editoren — der 🔧-Defekt-Button bleibt für alle. Test-Hooks: `window._fzPermHooks`.

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

### Bereichs-Struktur (Fotos/Messpunkte/Geräte je betroffenem Bereich, KRITISCH)

**User-Vorgabe**: Fotos, Messpunkte und Geräte werden **immer direkt einem betroffenen Bereich** zugeordnet (kein Dropdown) — die Bereiche (= betroffene Räume `s.raeume[]`) werden erfasst, und **innerhalb** jeder Bereichskarte werden Fotos + Referenz-Messpunkt (Analyse) bzw. Messungen + Geräte + Fotos (Trocknung) + Fotos (Abschluss) direkt erfasst.

- **Datenmodell rein ADDITIV (keine Migration, Bestandsschutz)**: Items tragen ein optionales `raum`-Feld (`foto.raum`/`mp.raum`; Geräte hatten `g.raum` bereits). Bestehende Berichte ohne das Feld bleiben **byte-identisch** — nicht zugeordnete Alt-Items erscheinen im **«Ohne Bereich»-Bucket** und werden dort **voll** angezeigt (komplette Messreihe / Foto, nichts versteckt). Zuordnung passiert nur, wenn der User es selbst tut. Drift-Guard `scripts/schadensbericht_messpunkte_test.mjs` (35 Checks, inkl. Boot- + Save-Roundtrip-Byte-Vergleich).
- **Zentraler Renderer `sdRenderBereiche(s, phase, canEdit, canMeas)`**: `_sdAreaNames(s)` = `raeume` ∪ referenzierte `item.raum` (abgeleitete Bereiche aus Altbestand verschwinden nie). Pro Bereich eine `.sd-area`-Karte (Drop-Target) mit den phasenspezifischen Unterblöcken (`_sdPhotoStrip`, `_sdMpBlock` mit `_sdMpCardHtml`, `_sdDevBlock` mit `_sdDevCardOne`). Add-Buttons hängen **in** der Bereichskarte und übergeben den `areaIdx` → neue Items sind IMMER einem Bereich zugeordnet (bei 0 Bereichen erscheint ein «+ Bereich»-Hinweis statt Add-Buttons). Neue Bereiche via `sdErfAddRaum`.
- **Zuordnung nicht zugeordneter Items**: Drag & Drop (Desktop, `sdDragStart`/`sdDropOnArea`) **und** Auswahl-Fallback «→ in Bereich …» (`_sdMoveSelHtml`/`sdMoveSelChanged`, Touch/alle Geräte) → beide rufen `sdAssignItemToArea(schadenId, kind, phase, idx, area)`, das NUR das `raum`-Feld setzt (additiv). Handles über Array-Index (Arrays reordern beim Render nicht).
- **Geräte-QR-Zuweisung je Bereich (User-Vorgabe)**: «📷 Gerät scannen & zuweisen» pro Bereich → `sdScanDevForArea(id, areaIdx)` öffnet das Geräte-Modal (Bereich vorbelegt) und startet **sofort** den QR/NFC-Scan (`_sdScanForDev`, GemaNFC mit QR-Fallback). Nach dem Scan füllt `_sdHandleScanPayload` Name/kW + den **aktuellen Zählerstand** (`_sdGetAktuellerStand`) vor — der Monteur prüft kurz gegen und bestätigt mit «Hinzufügen» (oder passt an). `+ Gerät manuell` bleibt als Fallback.
- **Gesamtübersicht (Trocknung)**: zusätzlich zu den Bereichs-Karten eine kompakte Aggregat-Sektion «📊 Gesamtübersicht» (Total kWh aller Geräte + kombiniertes Messpunkt-Trend-Diagramm via `_sdRenderTrendChart`).
- Die alten flachen Renderer (`sdRenderPhotoSection`, `sdRenderMesspunkteAusgangslage`, `_sdGeraeteCardsHtml`) wurden entfernt bzw. sind Alt-Helfer — Fotos/Messpunkte/Geräte laufen ausschliesslich über `sdRenderBereiche`.

### Foto-System

- Base64, max 1600px Resize, max 2MB, JPEG-Komprimierung (0.82, Fallback 0.5)
- `capture="environment"` für Kamera auf Mobile
- Pro Foto: Kommentar-Dialog + Checkbox «Im Bericht anzeigen»
- Fotos sind phasenspezifisch (Analyse, Trocknung, Abschluss) UND **bereichsspezifisch** (`foto.raum`, siehe «Bereichs-Struktur») — `sdTriggerPhotoUpload(schadenId, phase, raumIdx)` / `sdStorePhoto(…, raum)` setzen `foto.raum` additiv
- Lightbox-Ansicht bei Klick
- Delete-Buttons auf Touch-Geräten immer sichtbar (kein Hover)
- **KRITISCH — dynamischer File-Input MUSS im DOM hängen (iOS-GC-Bug, BEHOBEN)**: `sdTriggerPhotoUpload` erzeugte den Input früher detached (nur lokale Variable) — WebKit garbage-collected solche Inputs, während die Kamera offen ist → das `change`-Event feuerte NIE und das Foto war nach «Verwenden» still weg (trat v.a. bei mehreren Fotos hintereinander auf, weil die Bildverarbeitung des vorherigen Fotos GC-Druck erzeugt). Jetzt: Input unsichtbar in `document.body` + globale Referenz `_sdPhotoInput`, Cleanup im change-Handler; `FileReader`/`Image` haben `onerror`-Meldungen (kein stilles Verwerfen mehr). Dasselbe Muster gilt für JEDEN neuen dynamisch erzeugten File-Input.

### Messwert-System (Trocknung)

- Messpunkte definieren (z.B. „Wand links Bad")
- Pro Messpunkt: Messungen über Zeit (Datum, Wert in **Digits**, Foto-Beleg)
- **Schneller Erfassungs-Workflow**: Klick auf „+ Messung" öffnet sofort die Kamera (synchron im User-Gesture-Kontext, wichtig für iOS Safari). Nach dem Foto wird der Cursor automatisch ins Wert-Feld gesetzt — `inputmode="decimal"` öffnet die numerische Tastatur. Foto ist **optional**: User kann den Kamera-Dialog abbrechen und nur den Wert eintragen. Datum default = heute. Foto-Beleg gespeichert in `m.foto` als Base64; in der Tabelle erscheint ein 36×36-Thumbnail (Klick öffnet die Lightbox).
- Datenmodell: `{id, datum, wert, einheit:'Digits', foto:dataUrl, referenz?:true}`
- **Ausgangslage/Referenz bereits in der Analyse-Phase** (je Bereich, siehe «Bereichs-Struktur»): In jeder Bereichskarte der Analyse werden Messpunkte + Referenzmessung (Ausgangswert VOR Trocknungsstart) mit demselben Kamera-Flow erfasst. **KEIN zweiter Speicherort**: liest/schreibt `s.trocknung.messpunkte` wie die Trocknungsphase — bestehende Berichte bleiben byte-identisch; `referenz:true` wird NUR gesetzt, wenn die Checkbox `#messReferenz` angehakt ist (Alt-Messungen ohne das Feld rendern unverändert). «+ Messpunkt» aus der Analyse (`sdOpenMpAdd(id,'analyse',areaIdx)`) kettet nach dem Anlegen synchron in die Referenzmessung (`sdOpenMessAdd(sid,mpId,true)` — bleibt im User-Gesture-Stack für die iOS-Kamera, Checkbox vorbelegt). Messwert-Tabelle zeigt ein `Referenz`-Badge (`.sd-ref-pill`); in Phase `trocknung` trägt jeder Messpunkt ohne reguläre Messung die Pill «⏳ Erste Messung ausstehend» (`.sd-first-pill`) — die erste echte Messung erfolgt beim Trocknungsstart (`sdAdvancePhase` setzt `gestartetAm` auch, wenn `s.trocknung` schon durch die Analyse-Erfassung existiert). Exporte markieren Referenz-Zeilen mit «(Referenz)» (jsPDF/Word/Vorlage-PDF); `gema_schaden_pdf.js` zeigt in der Analyse-Sektion zusätzlich die Tabelle «Messpunkte — Ausgangslage (Referenz)» — NUR wenn Referenzmessungen existieren (Alt-Berichte-Export unverändert).
- Ansicht je Messpunkt umschaltbar: Tabelle (mit Beleg-Spalte) oder Canvas-Liniendiagramm (`chart_<mpId>`, reines Canvas, keine Library)
- Geräte-Tracking: Name, Bereich/Raum, kW, Zählerstand Start/Ende → kWh-Berechnung. Zuweisung je Bereich via QR-Scan (siehe «Bereichs-Struktur»); Picker im devAddModal verlinkt auf `gema_trocknung_v1`.
- Geräte werden als Kacheln je Bereich gerendert (`_sdDevCardOne`, 2-spaltiges `.dev-card-grid`). **Trocknungs-Tage pro Gerät IMMER ab Start gerechnet** (`sdGeraetTage(g,tr)`: Start = `eingesetztAm` → Einsatz → **Trocknungs-Start der Phase** → id-Timestamp; Ende = `entferntAm`/`zurueckAm` → **Trocknungs-Ende** → heute). **«Start am» UND «Ende am» sind pro Gerät manuell überschreibbar** (Date-Inputs, provisorische Defaults kursiv; `sdUpdateDevStartDate`/`sdUpdateDevEndDate`, leer = zurück auf den Phasen-Default); gema_schaden_pdf rechnet die Geräte-Tage-Spalte mit denselben per-Gerät-Daten. **KRITISCH — Datumsfelder speichern bei `change`, rendern aber erst bei `blur` (`sdDevDateBlur`)**: die Felder sind vorbefüllt, darum feuert das native Datumsfeld bei jeder getippten Stelle sofort `change` — ein sofortiges Re-Render riss den Fokus aus dem Feld (Tag getippt → Monat/Jahr nicht mehr tippbar). Gilt als Muster für ALLE vorbefüllten `type="date"`-Inputs mit Re-Render-Handlern. **Tage-Kanon (KRITISCH — Tag-INKLUSIV)**: `sdDaysBetween` zählt Start- UND End-Tag mit (10.07.–15.07. = 6 Tage, gleicher Tag = 1); `gema_schaden_pdf.js` spiegelt das mit eigenen `daysBetween/geraetStart/geraetTage` (inkl. Einsatz-/dev_-Fallbacks und «bis heute» bei laufenden Geräten) — der Vorlage-Export zählte früher nur die Differenz und wich damit um 1 Tag von der Berichtserfassung ab (bei Laufzeit-Geräten auch Stunden/kWh). Beide Seiten slicen ISO-Timestamps auf das Datum. Drift-Guard: `node scripts/schaden_tage_konsistenz_test.mjs` (19 Checks — extrahiert die Helfer aus BEIDEN Dateien und vergleicht Datumspaare, Fallback-Ketten, Laufzeit-Stunden/kWh). **Manuell erfasste Geräte sind per ✏️ editierbar** (`sdOpenDevEdit` — derselbe Dialog im Edit-Modus: Scan/Picker ausgeblendet, Felder vorbefüllt; Zähler-Ende, Datumsfelder und `tgDeviceId` bleiben beim Speichern erhalten). QR-verknüpfte Geräte bewusst ohne ✏️ — deren Stammdaten kommen aus der Geräteverwaltung. **Zähler-Typ `laufzeit`** (Geräte ohne Zähler, z.B. Ventilatoren): Stunden = `stundenTotal` (manuell) ODER Tage (per-Gerät-Daten) × `stundenProTag`; kWh = Stunden × kW (`sdComputeHours/sdComputeKwh` mit tr-Kontext, laufzeit-Branch auch in gema_schaden_pdf). Karte zeigt editierbare «h total»/«h/Tag»-Felder (`sdUpdateDevLaufzeit`, blur-getriggert).
- **Massnahmen-UX (User-Vorgabe)**: Der «+ Massnahme»-Button steht **unter** der Liste (Mobile: kein Hochscrollen). Neue Massnahmen werden **synchron** ans Listen-Ende angehängt (`_sdMnRowHtml` in `#mnList_<sid>`, kein Voll-Render) und sofort fokussiert + in die Sicht gescrollt — nur so öffnet iOS Safari die Tastatur direkt (Fokus muss im User-Gesture-Stack bleiben).

### Export — PDF

`sdExportPdf(id)` rendert einen mehrseitigen Versicherungs-tauglichen Bericht via jsPDF (lazy CDN-Load):

- **Cover (Seite 1)**: Firmen-Logo aus `org.logo` (32×32 mm), Briefkopf rechts (Name, Adresse, Tel, Mail), darunter SCHADENSBERICHT-Header, Schadentitel groß, farbige Typ-Pille + Phase-Pille nebeneinander, Stammdaten-Box (Objekt, Bearbeiter, Erfasst, Schaden-ID, Räume), eingerahmte Versicherungs-Box mit Police-Nr. / Schaden-Nr. / Kontakt.
- **Seite 2 — TOC**: Inhaltsverzeichnis mit Phasen und Seitenzahlen. Wird _nachträglich_ befüllt (Section-Tracking via `sectionsTOC[]`), nachdem alle Inhalts-Seiten gerendert sind.
- **Inhalts-Seiten**: Jede Phase als farbiges Section-Band über Voll-Breite (Phasen-Farbe), darunter `drawParagraph`, `drawTable` mit Zebra-Streifen (Geräte: Name/Raum/kW/h/kWh/Status + Summen-Zeile; Messpunkte: Datum/Wert/Δ/Trend + min/max-Header), `drawPhotoGallery` 2 pro Zeile (User-Vorgabe 07/2026 — grössere Fotos) mit Rahmen und Caption.
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

**Bildschirm-Vorschau zeigt Seiten als A4-Blätter — IMMER (GemaPrintA4-Muster)**: Cover und jede `report-section` sind eigene 210×297mm-Blätter mit Box-Shadow auf grauer Bühne; `.content` trägt `width:210mm;max-width:calc(100vw − 24px)` — auf schmalen Fenstern schrumpft das Blatt proportional, bleibt aber ein Blatt. Der frühere ≤820px-Umbau (width:100 %, min-height:auto) zerstörte den A4-Look bereits im 900px-Druckfenster bei Windows-Skalierung 125 % (≈720 CSS-px); erst ≤560px (echte Phones) wird die A4-Proportion aufgegeben (Blatt-Optik bleibt). **Fotos IMMER 2-spaltig** (User-Vorgabe — der cols-3-Umbruch ab 5 Fotos ist entfernt). Im Print fallen die Schatten weg und der Browser fügt physische Seiten automatisch ein.

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

- **Erfassen (Monteur)**: Objekt-Anbindung wie Berechnungen (aktives Objekt vorausgewählt), Arbeitsbeschrieb, **Stunden** (Kategorie-Chips aus Org-Stammansätzen, 0.25-h-Stepper, Name optional), **Material** (frei ODER via Katalog-Picker aus GemaProdukte über alle Kategorien — Bezeichnung/`produktId`/`lieferantFirma` werden übernommen) und **📷 Fotos der Arbeit** (`r.fotos[] = {url|dataUrl, ts}` — additiv; Kamera-Aufnahme mit Resize 1600px + GemaStorage-Auslagerung `regierapport/<orgId>`, Editor-Thumbnails mit Lightbox, Fotos erscheinen im Rapport-PDF 2-spaltig). Rapporte entstehen auch **direkt aus der Stundenerfassung** (pm_stunden «Material gebraucht?»-Dialog, `quelle:{typ:'stunden'}` — siehe Stundenerfassung). **Monteure sehen NIE Preise** (`.preis-inp` nur für `_rrCanPrice()`).
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

EIN integriertes Modul (User-Entscheid — kein Modul-Trio) mit Tabs Offerten/Aufträge/Rechnungen/Kunden + ⚙️-Einstellungen. Kern ist die verknüpfte **Dokument-Kette**: Offerte (Entwurf → **Versendet**) → Auftrag → Akonto-/Teil-/Schlussrechnung. **Kein «Angenommen»-Zwischenschritt (07/2026)** — aus einer versendeten Offerte wird direkt der Auftrag erstellt (`erpZuAuftrag` aus Footer/Kontextmenü); der Status `angenommen` bleibt nur für Altdaten kompatibel (Stepper/Footer behandeln ihn wie `versendet`). Mobile-tauglich (gleiche UI-Muster wie pm_regierapport).

### Datenmodell & Storage

Per-Record in der Cloud, moduleKey `erp`: Dokumente `erpdok:` → `gema_erp_dok_pool_v1`, Kunden `erpkunde:` → `gema_erp_kunden_pool_v1`, Kreditoren `erpkred:` → `gema_erp_kred_pool_v1` (bindCollection beim Boot + Sofort-Render aus Cache; Einzel-Saves via saveRecord; der Boot bindet zusätzlich `gema_std_pool_v1` für die Stunden-Übersicht). Dokument: `{id, typ:'offerte'|'auftrag'|'rechnung', nr, orgId, objektId/objektName, kundeId, kundeSnapshot{firma,kontakt,strasse,plz,ort,email}, zustellSnapshot?, bereichId, datum, gueltigBis|frist, status, positionen[], rabattPct, mwstPct, einleitung, schlusstext, verknuepfung:{offerteId?,auftragId?}, rechnungsArt:'einzel'|'akonto'|'teil'|'schluss', zahlungen[{datum,betrag}], erstelltVon}`.

**Zustelladresse vs. Rechnungsempfänger (07/2026, `scripts/erp_zustelladresse_test.mjs` 16 Checks)**: Der **Kunde (`kundeSnapshot`) ist IMMER Rechnungsempfänger & Zahler** — der QR-Zahlteil (`erpQrPayload`) lautet unverändert auf ihn. Optional pro Dokument: **abweichende Zustelladresse `zustellSnapshot`** `{firma,kontakt,strasse,plz,ort}` (Modal `erpZustellOpen` mit Kundenstamm-Prefill; Button/blaue Box in den Grunddaten), z.B. Verwaltung, Architekt, c/o oder Postfach. Wirkung im PDF: **Fensteradresse = Zustelladresse** (sonst Kunde), zusätzlich Meta-Zeile «Rechnungsempfänger:» (Rechnung) bzw. «Auftraggeber:» (Offerte/AB) mit dem Kunden — der Zahler bleibt im Dokument ausgewiesen. `erpZuAuftrag`/`_erpNeueRechnung` vererben die Zustelladresse (Kopie, pro Dokument änder-/entfernbar); Vorlagen speichern sie bewusst NICHT (dokument-spezifisch).

**Arbeitsbereiche (`org.settings.arbeitsbereiche = [{id,name,farbe}]`, TOP-LEVEL — geteilt mit dem Einsatzplan)**: individuell benannte Bereiche mit Farbe (z.B. Sanitär, Sanitärservice, Heizung). Editor-Zeilen (`abRowHtml`/`abRowAdd`/`abRowsCollect`, Farb-Input + Name, Slug-IDs via `abSlug` — **IDs bleiben beim Umbenennen stabil** über `data-id`) stehen in den ⚙️-Einstellungen von **pm_erp UND pm_einsatzplan** (Helper in beiden Dateien dupliziert: `abListe/abById/abTint/abChipHtml`). Die Offerte trägt `bereichId` (Select in den Grunddaten — nur sichtbar, wenn Bereiche definiert sind); `erpZuAuftrag` und `_erpNeueRechnung` **vererben** den Bereich, die Karten zeigen den Farb-Chip. Test: `scripts/arbeitsbereiche_test.mjs` (30 Checks, ERP→Einsatzplan-Kette). Nummernkreise pro Typ+Jahr: `OF-2026-001` / `AU-` / `RE-` (max+1 aus dem Pool). Einstellungen in `org.settings.erp` (mwstPct 8.1, fristTage 30, iban, qrIban, Absender, Standard-Schlusstexte).

### Positionen (gemeinsamer Editor aller Dokumenttypen)

`{id, art:'frei'|'titel'|'regie'|'oa'|'akonto'|'abzug'|'rabatt'|'zuschlag', bez, menge, einheit, ep, rabattPct?, produktId?, lieferantFirma?, regieRapportId?, oaId?}`. **Rabatt-/Zuschlags-POSITIONEN (07/2026, `scripts/erp_rabatt_vorlagen_test.mjs` 21 Checks)**: `art:'rabatt'|'zuschlag'` mit `{bez (frei benennbar), modus:'pct'|'chf', wert}` — Engine `erpAufschlagBetrag(p, kapBasis)`: Prozent vom **Kapitel-Zwischentotal** (Positionssumme seit dem letzten Titel bis zur Zeile; ohne Titel = alle Positionen darüber) ODER Pauschal-CHF, Rabatt negativ; mehrere Zeilen im Kapitel rechnen alle auf derselben Positions-Basis (keine Verkettung). `erpDocTotals` führt dafür `kapBasis` mit (Titel setzt zurück) — Editor («auf CHF x»-Basisanzeige, %/CHF-Select, Buttons «− Rabatt»/«+ Zuschlag») und PDF (Zeile mit «x % auf Zwischentotal CHF y»-Vermerk, Kapitelsumme inkl. Rabatt/Zuschlag → BKP-Rollup folgt) müssen dieselbe kapBasis-Mechanik spiegeln. Teilrechnungs-Auswahl übernimmt Rabatt-/Zuschlagszeilen bewusst NICHT.

**Editor-Layout (07/2026)**: Der Editor-Kopf trägt die **kompakte Aktionsleiste OBEN** (`#edFt`, ehem. Footer — kleine, einheitliche Buttons, horizontal scrollbar; `.ov-ft .btn` zwingt Höhe/Padding/Font zentral). Rechts steht ein **dauerhafter Quellen-Sidebar** (`#edSide`, nur bei `erpEditable()` sichtbar; auf ≤920px eine per «🧰 Quellen» ein-/ausblendbare Schublade) mit 5 Werkzeugen (`SIDE_TOOLS`, `erpSideRender/erpSideTool/erpSideBody`; letztes Werkzeug in `gema_erp_side_v1` gespeichert) — **KEIN separater Dialog**, alles öffnet in der Sidebar:
- **📦 Kataloge** (`erpSideKat/erpKatRender`): Suchleiste oben + aufklappbare Gruppen (`erpKatGrpToggle`, Auf-Zustand persistiert) — GEMA-Produktkatalog je Kategorie **und die DataSelect-Online-Lieferantenkataloge integriert** (je Anbieter eine Gruppe mit Inline-Suche `erpDsSearch(anbId)` → Ergebnis-`.side-art`-Zeilen; «＋ Lieferant hinterlegen» `erpDsAddAnbieter`)
- **🧱 BKP-Titel** (`erpSideBkp`, siehe «BKP-Titel»)
- **⭐ Eigene** (`erpSideEig/erpEigRender`): eigene Artikel-Kataloge (CRUD)
- **📝 Regie** / **🏷 Offerten** (`erpSideList`, aus `erpPickLoad`): ausgewiesene Regierapporte bzw. beantwortete Lieferanten-Offerten
- **📝 Regierapporte**: `regieRapportId`; beim **Rechnung stellen** wird `r.verrechnetIn=<RechnungsNr>` in den Regie-Pool zurückgeschrieben (Cross-Modul-Write via GemaSync.saveRecord). **🏷 Lieferanten-Offerten**: `antwort.bruttoPreis` als EP.

**Artikel einfügen — «markieren + Enter» (07/2026)**: Artikel-Zeilen sind `.side-art` (`erpArtRow`, Template in `_artMap`): **Klick markiert** (`erpArtSel`, dezenter Blau-Rahmen), **Enter/Doppelklick** (`erpArtGoEl`→`erpArtGo`) öffnet den **Stückzahl-Dialog** (`erpQtyAsk`, Fokus direkt aufs Mengenfeld, Enter fügt ein) → die Position wird DIREKT ÜBER der aktuell markierten Positionszeile eingefügt (`_erpInsertPos`). Enter im Sidebar-Suchfeld (`erpArtSearchEnter`) nimmt bei genau einem sichtbaren Treffer diesen.
Summenblock: Zwischentotal → (Kapitel-Rabatte in den Positionen) → **Schlussrabatte/-zuschläge** → Netto → MwSt → **Rappenrundung auf 0.05** (`erpRound5`).

**Feedback 19.07.2026 (`scripts/erp_feedback3_test.mjs` 21 Checks)**: (1) **Dokumentliste standardmässig als Liste** — `_erpDocView` ('liste' Default | 'karten', in `gema_erp_docview_v1` persistiert), Umschalter `.viewseg` in der Toolbar; Listenzeilen `.drow` (Nr/Titel/Meta/Datum/Betrag/Status) statt `.card`; nur Dokument-Tabs (Kunden/Erfolg/Kreditoren behalten Karten). (2) **IGH-Einfügen → Fokus zurück ins Suchfeld** (`erpArtGo`: nach dem Insert `dsq_<anbId>.focus()+select()` auf Desktop — direkt weitertippbar; Mobile schliesst die Leiste wie bisher). (3) **Ausführungs-Dialog Tastatur** — `erpVarAsk` öffnet das Modal ZUERST, dann rendert+fokussiert es die Option (vorher schlug `focus()` auf dem versteckten Modal fehl); ↑/↓ wählt, Enter bestätigt (`erpVarKey`). (4) **Undo/Redo** (`erpUndo`/`erpRedo`, ↶/↷ in `#edFt`, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) — History-Stack über `erpDocSig(cur)` (debounced 800ms in `erpTouch`, coalesct einen Tippvorgang zu einem Schritt; `_erpHistReset` beim echten Öffnen, NICHT beim Undo-Re-Render via `_erpHistRestoring`-Guard); im Feld greift die native Text-Undo (Guard `_erpInField`). (5) **Seitenwechsel-Vorschau** — `_erpPredictBreaks` (debounced) misst die Beschrieb-Höhe bei A4-Spaltenbreite, paginiert mit break-inside-Semantik und markiert Positionen, die auf eine neue Seite fallen, mit `pos-pbtop` (gestrichelte Linie + «✂ Seite»); Positionen werden im PDF NIE getrennt (`table.pos tbody tr{break-inside:avoid}`, Bildzeile via `tr.hasimg{break-after:avoid}`).

**Rich-Text im Positionsbeschrieb (07/2026, `scripts/erp_richtext_test.mjs` 28 Checks)**: Das bez-Feld einer Leistungsposition (nicht Titel/Rabatt) öffnet per Doppelklick einen **contenteditable-Editor mit Toolbar** (`inpRich`) — **Fett/Kursiv/Unterstrichen** (`execCommand`), **Schriftgrösse** + **Textfarbe** (via `erpRichWrapStyle` = Span-Wrap, zuverlässiger als `execCommand('foreColor')`). `bez` wird als **sanitisiertes HTML** gespeichert und überall via **`erpRichSanitize`** gerendert (Editor-Anzeige + PDF-Positionszeile): Whitelist `b/strong/i/em/u/s/span[style:color|background-color|font-size|font-weight|font-style|text-decoration]`, `rgb(...)` erlaubt, `url()/expression()/javascript:/<script>/onclick` etc. werden entfernt bzw. der Rest escaped (`_erpSafeStyle`, `_erpRichNode`). Reiner Text (auch mit legitimem «<») nimmt den escape-Schnellpfad (`_ERP_RICH_RE`), sodass z.B. «Rohr <DN20>» erhalten bleibt; `erpBezPlain` liefert die Tag-freie Fassung (Eigen-Artikel-Liste). **Selektions-/Feld-Guards** (`_erpInField` inkl. `isContentEditable`): Delete/Ctrl+Enter im Rich-Editor lösen KEIN Positions-Löschen/Seitenumbruch aus; Multi-Select-Markieren erzeugt KEINE native Text-Markierung (`.pos td{user-select:none}`, im Edit `user-select:text`). **Zahlenfelder (Menge/EP) bleiben normale `<input>`.** DataSelect-Ausführung/Farbe steht auf **eigener Zeile fett** (`bez = esc(langBase)+'<br><strong>'+esc(lab)+'</strong>'`).

**Werte per Doppelklick bearbeiten (07/2026, `scripts/erp_positionen_test.mjs` 28 Checks)**: Positionswerte/-texte werden als **Anzeige-Zellen `.pcell`** gerendert und erst per **Doppelklick** (`erpCellEdit(id,field)` → `_editCell`) zum Bearbeiten geöffnet (Input/Select/**Rich-Editor** mit `data-edit`, Auto-Fokus); Klick woanders (`onblur`→`erpCellCommit`) bzw. Enter schliesst, Escape bricht ab. `erpCellSet(id,field,val)` schreibt id-basiert. **Klick auf die Zeile markiert** (`erpPosRowClick`→`erpPosSelClick`, Einzelklick = SETZEN ohne Toggle — sonst höbe der Doppelklick die Markierung auf); markierte Zeilen bekommen einen **dezent-blauen Hintergrund** (`.pos-sel td{background:#e7effe}`, KEINE box-shadow-Trennstriche mehr). Selektion aktualisiert nur die Klassen (`erpApplySelClasses`, kein voller Re-Render — sonst würde der Doppelklick verschluckt). **⠿-Griff** (`cells[0]`) bleibt für Drag&Drop + Markieren; **Shift** = Bereich, **Ctrl/Cmd** = einzelne umschalten. **Delete-Taste** (`document`-keydown, nur bei offenem+editierbarem Editor, Auswahl vorhanden und Fokus NICHT in Input/Select/Textarea) löscht die Auswahl (`erpPosDeleteSelected`). **Drag&Drop** über den Griff (`erpPosDragStart/Over/Drop`, id-basiert, vor die Zielzeile; Touch nutzt das Kontextmenü ⬆️⬇️). **Einfügen respektiert die Markierung** (`_erpInsertPos`): bei GENAU einer markierten Zeile DIREKT darüber, sonst ans Ende. Positions-Kontextmenü zusätzlich «Neue Position darüber/darunter» + «N markierte löschen». Auswahl + `_editCell` werden bei jedem vollen Editor-Rebuild (`erpOpenEditor`) und beim Öffnen/Schliessen zurückgesetzt.

**Sperren/Entsperren (07/2026)**: `erpNaturalEditable(d)` = natürlich editierbar (Offerte nur Entwurf — **versendet ist gesperrt**; Auftrag solange nicht abgeschlossen; Rechnung nur Entwurf). `erpEditable()` = natürlich editierbar ODER **transient entsperrt** (`cur._unlocked`); `erpLocked()` = berechtigt aber gesperrt und nicht entsperrt → Banner + «🔓 Entsperren»-Button (`erpEntsperren`) im Editor-Kopf und in der oberen Aktionsleiste. `_unlocked` wird NIE gespeichert (in `erpPersistCur` gestrippt) — beim erneuten Öffnen ist das Dokument wieder gesperrt.

**Auto-Speichern mit Status-Indikator (07/2026, `scripts/erp_autosave_test.mjs` 10 Checks) — gleich wie die Berichte**: Offerte/Auftrag/Rechnung speichern sich AUTOMATISCH, es gibt **keinen manuellen «💾 Speichern»-Button** mehr. Jede Änderung an Positionen/Zellen läuft durch den Chokepoint `erpRenderPos()` → `erpTouch()` (Signatur-Diff `erpDocSig`, `_unlocked` ausgenommen — reines Öffnen einer Zellbearbeitung oder des Editors speichert NICHT), die Grunddaten-Handler (Titel/Objekt/Datum/Frist/Bereich/Schlüssel/Aushang/Sachbearbeiter/Kunde/Zustelladresse) rufen `erpTouch()` bzw. `erpSaveCur(true)` direkt. `erpTouch` plant einen **debounced Save** (1.2 s, `erpScheduleSave`); Statuswechsel/Ketten-Sprünge und Tests speichern **sofort** (`erpSaveCur`→`erpPersistCur`). `erpPersistCur` schreibt cur SYNCHRON lokal (durable) via **`poolSaveP`** (gibt die Cloud-Promise zurück; `poolSave` = Fire-and-forget-Wrapper) und treibt den **OneDrive-Style-Indikator unten rechts** (`#saveStatus`/`erpSaveSetStatus`, gleiche CSS-Klassen `.save-status` wie if_trocknung: pending → saving → saved [blendet nach 2 s aus] / error). `erpCloseEditor` + `beforeunload`/`pagehide`/`visibilitychange` rufen `erpFlushSave` (ausstehende Änderung sofort sichern). **KRITISCH**: `erpSaveCur(true)` bleibt synchron-lokal + strippt `_unlocked` vor dem Serialisieren (Tests lesen den Pool direkt danach). Der Cloud-Push nutzt weiterhin `GemaSync.saveRecord` (per-Record, KEINE Outbox wie die Berichte) — der lokale Write ist immer durable, ein fehlgeschlagener Cloud-Push zeigt «Lokal gesichert — Cloud-Sync ausstehend» und wird beim nächsten Save/online nachgezogen.

**Feedback 18.07.2026 (Editor-UX, `scripts/erp_feedback2_test.mjs` 23 Checks)**: (1) **Grunddaten eingeklappt** (`_erpGrunddatenOffen`, `#secGrund`/`erpGrunddatenToggle`): neue Offerte startet mit sichtbaren Grunddaten (erfassen), danach ausblendbar; bestehende Dokumente öffnen eingeklappt. Toggle-Button «📋 Grunddaten anpassen/ausblenden» oben in `#edFt` (nur `editable`); gesperrte Dokumente zeigen die Grunddaten IMMER (read-only, kein Toggle). Reines Umschalten ändert `cur` nicht → kein Save. (2) **Verstellbare Seitenleiste** (`#edSideRs`-Ziehgriff links, `erpBindSideResize`): Breite via CSS-Var `--erp-side-w` (260–680 px), in `gema_erp_side_v1.width` persistiert; nur Desktop (Mobile-Drawer unberührt, Griff `display:none` ≤920px). (3) **Manuelle Seitenumbrüche** `art:'seitenumbruch'` via **Ctrl/Cmd+Enter** (dokument-weiter keydown, gleiche Guards wie Delete) + Kontextmenü «Seitenumbruch darüber»: im Editor eine gestrichelte Trennerzeile, im PDF `<tr class="pgbrk">` mit `page-break-before:always`; zählt 0 (`erpDocTotals`/Teilrechnung/Vorlage überspringen ihn). (4) **PDF-Layout**: Zusammenstellung/Zusammenfassung jetzt volle Breite (`width:100%` statt `max-width:480px`), Positionstabelle `table.pos{table-layout:fixed}` + mm-Spaltenbreiten (Bezeichnung flext) + `word-break:break-word` → lange Texte umbrechen, nie horizontaler Scroll (auch im Editor: `table.pos` ohne `min-width`, `.pcell.bezflex/.titeltxt` umbrechen). (5) **Quelle/Lieferant nicht im PDF**: der `lieferantFirma`-Zusatz hinter der Bezeichnung ist aus dem Druck entfernt (Editor-Badge bleibt).

**DataSelect-Integration im Editor (Feedback 18.07.)**: (a) **Einheiten-Mapping** `_mapEinheit`/`_DS_EINHEIT` (Proxy + Client): IGH/UN-ECE-Codes → GEMA-Einheiten (`PCE`→`Stk`, `MTQ`→`m³`, `LTR`→`l` …); `EINHEITEN` um `m³`/`Paar` erweitert, der Editor-Select bewahrt einen unbekannten Altwert als Zusatz-Option. (b) **Kurz-/Langtext pro Lieferant** (`org.settings.dataselect.anbieter[i].textLang`, Default `lang`): Proxy liefert `bezeichnungLang` (ausführliche `Produktbeschreibung`, AF/AFZ-Zeile abgeschnitten) zusätzlich zum Kurz-`bezeichnung` (Produktname); `_dsRenderGrouped`/`_dsBez` fügt je Modus den langen oder kurzen Text ein; Umschalter «Text in Offerte: Kurz/Ausführlich» im Lieferanten-Gruppenkopf (`erpDsSetTextLang`→`GemaDataSelect.setTextLang`). (c) **Lieferant hinzufügen = EIN Dialog** `#erpAnbModal` (`erpDsAddAnbieter`/`erpAnbNameInput`/`erpAnbSave`): Name-Feld mit Datalist bekannter IGH-Mitglieder (Seed nur dokumentierte IDs → füllt die ID automatisch) + ID-Feld, statt zweier `prompt`. (d) **Keine Emojis** an Artikel-/Gruppen-Zeilen (`erpArtRow`/`_dsGroupRow`/GEMA-Katalog) und keine Lieferanten-**ID**/Deko-Emoji im Gruppenkopf; **Ausführungs-Dialog ohne Preis**. (e) **IGH-Fotos**: das `bexio`-Format (CSV) hat **keine Bildspalte** → mit dieser Datenquelle kommen keine Fotos; der Client ist bereit, sobald ein bild-fähiges Format (`DATASELECT_FORMAT_BILD`) eine `bildUrl` liefert. Bis dahin: 📷-Handupload pro Position.

**Schlussrabatte/-zuschläge (`doc.schluss=[{id,art:'rabatt'|'zuschlag',bez,modus:'pct'|'chf',wert}]`)**: beliebig viele, je % oder pauschal CHF, ALLE auf DERSELBEN Basis = Netto-Total nach Positionen (`zwischen − legacy-rabattPct`; keine Verkettung, wie die Kapitel-Rabatte), **zusätzlich** zu den Kapitel-Rabatt-Positionen. `erpDocTotals` liefert `schluss:[{s,betrag}]`+`schlussTotal`; Summenblock rendert je Zeile (bez/%↔CHF/wert + Betrag), Buttons «− Schlussrabatt»/«＋ Zuschlag»; PDF weist sie unter dem Zwischentotal aus. Der **alte einzelne Dokument-Rabatt `rabattPct`** wird beim Öffnen (`erpOpenEditor`) einmalig in eine `schluss`-Zeile migriert (`rabattPct→0`); `erpDocTotals` rechnet `rabattPct` für noch nicht geöffnete Altdokumente weiter. Kette: `erpZuAuftrag` kopiert `schluss` (Offerte→Auftrag); die **Schlussrechnung** übernimmt `schluss` (Akonto/Teil bewusst nicht); Vorlagen speichern/übernehmen `schluss`.

**BKP-Titel (07/2026, `scripts/erp_bkp_titel_test.mjs` 25 Checks)**: Titelzeilen tragen optional `bkp` (Nummer) und werden **nach Ebene eingerückt wie die BKP-Checkliste im Ausschreibungsmodul** (`bkpEbene`: 1-stellig=0 · 2-stellig=1 · 3-stellig=2 · mit Punkt (254.0)=3; BKP-Nr + Text als Anzeige-Zellen `.pcell.bkp`/`.pcell.titeltxt`, per Doppelklick anpassbar, die Einrückung folgt der Nummer). Das **BKP-Titel-Werkzeug in der Sidebar** (`erpSideBkp`, `erpBkpOpen`=Kompatibilitäts-Wrapper auf `erpSideTool('bkp')`) rendert den kompletten Standard-BKP (`gema_bkp_katalog.js`, 349 Einträge) als **Baum** (`erpBkpTree`/`erpBkpNodeHtml`) — **bis zur 2-stelligen Nummer zugeklappt** (`erpBkpOpenSet`: Default = alle ebene-0 offen; Auf-/Zuklappen `erpBkpNodeToggle` wird in `gema_erp_side_v1.bkpOpen` gespeichert), Suche = flache Trefferliste (`.bkp-item`). Gewählte Nummern werden in Baumreihenfolge als Titelzeilen eingefügt (lexikografische Sortierung der IDs = BKP-Reihenfolge; über der markierten Zeile bzw. am Ende). PDF: BKP-Nummer statt Kapitel-Buchstabe als `grpltr` (eingerückt); **Zusammenfassung mit Teilbaum-Rollup** — Ober-Titel zeigen die Summe ihres Teilbaums (bkp-Präfix-Match), Buchstaben-Kapitel ohne bkp bleiben Direktsummen (Buchstaben-Index zählt nur bkp-lose Gruppen), das Gesamttotal rechnet unabhängig über die Positionen (kein Doppelzählen). Vorlagen behalten `bkp`.

### Kette & Fakturierung

- `erpZuAuftrag()`: kopiert Positionen, verknüpft beidseitig (`verknuepfung.offerteId`/`auftragId`)
- **Akonto**: GemaDialog-Prompt (CHF oder `30%` der Auftrags-Nettosumme) → Rechnung mit einer `art:'akonto'`-Position
- **Teilrechnung**: Modal mit Positions-Checkboxen + anpassbaren Mengen
- **Schlussrechnung** (`erpSchlussPositionen`, Regel 07/2026): alle Auftragspositionen (= Offert-/Auftragsbetrag) + automatische **Abzugszeilen** (`art:'abzug'`, negativer EP) **NUR für bereits GESTELLTE Akontorechnungen** (`rechnungsArt==='akonto' && status==='gestellt'`) — der Restbetrag ergibt sich automatisch; Netto-Abzug VOR MwSt (CH-Praxis). **Teilrechnungen gelten NICHT als Akonto und werden bewusst NICHT abgezogen** (eigenständige Rechnungen), Entwurfs-Akonti zählen erst nach dem Stellen
- `erpAuftragFakt(docs,auftragId)`: Auftragssumme / verrechnet / Rest / % — als Fortschrittsbalken im Auftrag und auf der Karte
- Rechnung: entwurf → gestellt (sperrt Editor, Frist gesetzt) → bezahlt (Zahlungen kumulieren, Teilzahlungen) | storniert; **überfällig** wird berechnet (`erpRechnungAnzeigeStatus`: gestellt + Frist überschritten + nicht gedeckt)
- **Standardtexte & MwSt zentral (User-Entscheid 07/2026)**: `org.settings.erp` führt pro Dokumenttyp Einleitung + Schlusstext (`txtOfferteIntro/txtOfferte/txtAuftragIntro/txtAuftrag/txtRechnungIntro/txtRechnung`) plus EIN gemeinsames **Kleingedrucktes** `txtKonditionen` (Zahlungskonditionen/Teuerungsklausel, unten auf Seite 1). **Vorgabetexte ab Werk (`ERP_TXT_DEFAULTS`, `scripts/erp_stdtexte_test.mjs` 13 Checks)**: `erpSettings()` liefert für jedes leere/unkonfigurierte Textfeld den Standardtext (`s.txtX||ERP_TXT_DEFAULTS.txtX`) — so tragen Offerte/Rechnung/Auftrag von Anfang an einen sinnvollen Text, ohne dass jemand die Einstellungen öffnen muss. Der ⚙️-Dialog zeigt die (vorgefüllten) Texte editierbar + Button «↺ Standardtexte einsetzen» (`erpTxtDefaults`); ein geleertes Feld fällt wieder auf den Default zurück, eigener Text wird respektiert. Intro/Outro/Konditionen rendern `white-space:pre-wrap` (Zeilenumbrüche der Defaults/Admin-Texte bleiben). Neue Dokumente STEMPELN Texte + `mwstPct` beim Erstellen (erpNeu/erpZuAuftrag/_erpNeueRechnung) — im Dokument-Editor sind Einleitung/Schlusstext/MwSt bewusst NICHT mehr sichtbar (nur Hinweis auf ⚙️); bestehende Dokumente behalten ihre gespeicherten Werte im PDF.

### Swiss QR-Rechnung

**Mehrseitiger Aufbau (alle 3 Dokumenttypen, Layout nach Muster-Offerte «Jäggi Vollmer» 07/2026)**: Das Druckfenster rendert **direkt als A4-Blätter** (graue Bühne, jede Sektion ein `.sheet`; Druck setzt die Blätter zurück, @page übernimmt). Seite 1 = **Titelblatt**: Absender-Block oben links (mehrzeilig), Logo rechts, **Empfänger rechts in CH-Fensterposition** + Projekt/Objekt-Kontext links, Zeile «Ort, Datum / Kürzel» (Kürzel = Initialen `erstelltVon`), Dokumenttitel, Meta-Zeilen (Nr./Gültig bis/Zahlbar bis/Auftrag), **Titelbalken** (`d.titel` zwischen Linien), Einleitung, Zeile «Total inkl. X % MwSt.: Fr. Y» (unterstrichen), Schlusstext + Grussformel «Mit freundlichen Grüssen», Kleingedrucktes (`txtKonditionen`) am Blattende — **komplett schwarz, nur das Logo farbig** (User-Vorgabe 1:1) → ab Seite 2 **Positionen im Detail** (Titel-Gruppen = **Kapitel A, B, C …** mit `grpltr`-Spalte, schlichte schwarze Linien statt Farbbalken) → **Zusammenfassung** (Kapitel-Zeilen + Total/Mehrwertsteuer mit Basis/Gesamttotal; Schlusstext ist aufs Titelblatt gewandert) → bei Rechnungen zuletzt das **QR-Blatt** (`.qrpage`: Betrag-Box mit Rechnungsbetrag/Frist/Referenz, Hinweis «alles im QR-Code — nichts von Hand ausfüllen», Zahlteil+Empfangsschein via `margin-top:auto` am Blattende). Sektionstrennung via `.pb` (Bildschirm gestrichelte Linie, Druck `page-break-before:always`); `thead{display:table-header-group}` wiederholt den Tabellenkopf bei mehrseitigen Positionslisten. **Druck-Kopf-/Fusszeile via `@page`-Margin-Boxes** (`@top-right` = «Nr | Datum — Seite N» via `counter(page)`, `@bottom-left/-center/-right` Firma/Kontakt/MwSt-Nr, CSS-escaped Strings) — `position:fixed` mit `bottom` kollidiert im Druck auf Folgeseiten mit dem Seitenanfang; die frühere `.foot`-Bildschirm-Div ist entfallen (A4-Blätter).

**Briefkopf & Branding (alle 3 Dokumenttypen)**: Absender-Block oben LINKS (Firma + Adresse + Tel/Mail/Web aus `org.settings.erp`), **Logo oben RECHTS** (`org.logoVector||org.logo`, max 18×62 mm, `object-position:right top`; ohne Logo Wortmarke in Akzentfarbe), darunter Empfänger-Adresse links + Dokument-Meta rechts (Datum, Gültig-/Zahlbar-bis, Auftrag, Projekt als Label/Wert-Zeilen). **Akzentfarbe aus `org.settings.pdfFarben.primary`** (`erpBrand()` mit denselben Kontrastschutz-Helfern wie Schaden-/Dachbericht: `_erpDarkenForWhiteBg` ≥ 4.5:1 gegen Weiss + `_erpLightTint` für Flächen; Fallback ERP-Blau `#1d4ed8`) — färbt H1, Tabellen-Header, Titel-Zeilen, Summenzeile, Fusslinie. **Fusszeile auf jeder Seite** (`position:fixed`, im Druck via `bottom:-16mm` in den 24-mm-@page-Rand geschoben): Firma·Adresse | Tel·Mail·Web | MwSt-Nr (+IBAN nur bei Rechnung) — Felder `tel/email/web/mwstNr` in den ⚙️-ERP-Einstellungen, nur gefüllte erscheinen. **KRITISCH**: Die Fusszeile wird im `document.write`-String VOR dem Dokument-Body eingefügt — Markup NACH dem externen QR-Script-Tag kann beim Parsen verloren gehen.

Rechnung-PDF (Print-Fenster, A4, Briefkopf mit `org.logoVector||org.logo`) enthält bei hinterlegter IBAN den Zahlteil mit Empfangsschein: SPC-Payload v2.0 (`erpQrPayload`, 31 Zeilen, Adresstyp K). Mit **QR-IBAN** → Referenztyp `QRR` mit 27-stelliger Referenz aus der Rechnungsnummer (**Mod10-rekursiv-Prüfziffer**, `erpMod10` — validiert gegen bekanntes ESR-Beispiel), sonst `NON`. QR-Code-Rendering via qrcodejs-CDN im Print-Fenster (Schweizer-Kreuz-Overlay; offline Fallback-Hinweis). Engine (`erpDocTotals`/`erpAuftragFakt`/`erpSchlussPositionen`/`erpMod10`/`erpQrReferenz`/`erpQrPayload`) liegt im `/*ENGINE-START*/`-Block — Node-testbar.

### DataSelect-Lieferantenkatalog (Artikel inkl. Bild, gema_dataselect.js)

Artikel eines IGH-Lieferanten aus **dataselect.ch** (DataExpert®) direkt in eine Offerte/Rechnung einfügen — mit Bezeichnung, Preis, Einheit, EAN und **Produktbild** (07/2026, Node-Test `scripts/dataselect_norm_test.mjs` 33, Playwright `scripts/dataselect_test.mjs` 28).
- **JWT-gated Netlify-Proxy `netlify/functions/dataselect.js`** (Redirect `/api/dataselect`, Review-S3-Muster `requireAuth`): der Browser kann dataselect.ch wegen CORS nicht direkt rufen, und Zugangsdaten bleiben serverseitig. **Fixe Ziel-Host** (`DATASELECT_BASE`, Default `https://www.dataselect.ch/api/Artikel/Get`) → keine SSRF-Fläche; Params `anbieter`(=id_anbieter, Pflicht, 1–7 Ziffern)/`artnr`/`bez`(=Bez)/`ean`(=EAN, mind. eines)/`sprache`(de/fr/it)/`preisbuch`(=preisbuch_nr) + **`bilder`** + **`format`**. Optionaler `DATASELECT_API_KEY` (falls der Vertrag einen Token verlangt) → als `Authorization: Bearer` ODER, mit `DATASELECT_KEY_PARAM`, als Query-Param. 404 → leere Liste, 401/403 → klare Meldung («Zugang/Token prüfen»), **Nicht-JSON (HTML/XML)** → Hinweis auf ein JSON-Format (siehe unten), 9s-Timeout.
- **`format` = Ziel-Export-Format (KRITISCH, Feedback 18.07.2026 — debim statt bexio)**: Der DataExpert-Parameter `format` wählt das **Ziel-System-Exportformat**, NICHT JSON-vs-XML als Transport. **Default ist jetzt `debim` (DataExpert-BIM, XML)** — es liefert pro Artikel Kurz-/Langtext, Einheit, Preis, EAN UND eine **Bild-URL** (`<LinkAdr><Name Bez="Bild IGH" Ext="png">URL</Name>`), damit IGH-Produktfotos in die Positionen fliessen (User-Wunsch «anstatt bexio»). Das entgegen der früheren Annahme leichtgewichtige debim referenziert Bilder als URL (kein Base64-Inline). **`bexio` (CSV, ohne Bild) bleibt Fallback** — der Parser erkennt beide Formate automatisch. Pro Modus konfigurierbar: `DATASELECT_FORMAT_SUCHE` / `DATASELECT_FORMAT_BILD`, Default beide `debim`.
- **Antwort-Parsing: JSON → debim-XML → CSV (KRITISCH)**: Der Proxy versucht zuerst `JSON.parse` (BOM/Whitespace weg); scheitert das, **parst er debim-XML** (`_parseDebimXml`: pro `<Artikel ArtNr="…">` per Regex `TKurz`→produktname, `TLang`→produktbeschreibung, `Menge ISO`→einheit, `_debimBild` zieht die Bild-URL aus `<LinkAdr>` (Ext=png/jpg/… bzw. Bez «Bild» — HTML-/PDF-Links werden übersprungen); `_xmlUnescape` löst `&lt;/&gt;/&quot;/&amp;`/numerische Refs auf; `_cleanLang` entfernt Inline-Tags wie `<sub>` und **erhält Zeilenumbrüche**; `null` wenn kein `<Artikel>`); danach **CSV** (`_parseCsv`: Delimiter-Sniffing `;`/`,`/`\t`, Quote-/`""`-Escape → `{header,rows}`). **debim-Hülle ohne Artikel bzw. Nur-Kopfzeile-CSV = 0 Treffer** (leere Liste, kein Fehler). Erst wenn alles scheitert kommt die «kein verwertbares Format»-Meldung. `_normArtikel` mappt heuristisch: debim-Roh (`produktcode`/`produktname`/`produktbeschreibung`/`einheit`/`verkaufspreis`/`ean`/`bild`/`ausfuehrung`) UND bexio-CSV-Spalten (`Produktcode`→artnr, `Produktname`→bezeichnung, `Produktbeschreibung`→bezeichnungLang, **`Verkaufspreis`→preis**, `Einheit`, `Hauptgruppe`→serie). Der Kurztext wird via `_stripHtml` einzeilig, der Langtext (`bezeichnungLang`) mehrzeilig gehalten.
- **debim-Ausführungen/Farben (KRITISCH — anders als bexio)**: In debim liegt EIN `<Artikel ArtNr="1313116">` mit ALLEN Ausführungen in `<PreisEig>`: `<AFZ AFNr="143" Txt="Pergamon"><AFZNr Txt="Gleitschutz Antislip" Preis="1222" EAN="…">183</AFZNr>…</AFZ>` (Farbe × Oberfläche, je eigener Preis+EAN — KEIN `<Pr>` wie beim Einzelprodukt). `_debimVarianten(body,artnr)` expandiert das zu je einem Varianten-Artikel mit **Voll-Code `ArtNr/AFNr/AFZNr-Suffix`** (z.B. `1313116/143/183` — wie das bexio-Produktcode-Format, damit die Client-Gruppierung `_dsBaseCode` [Teil vor dem ersten `/`] alle Ausführungen unter `1313116` gruppiert) + `ausfuehrung`-Label «Farbe · Oberfläche». `_normArtikel` bevorzugt dieses vorgegebene `raw.ausfuehrung` vor der bexio-AF:/AFZ:-Extraktion aus der Beschreibung. Das Artikel-Bild (`<LinkAdr>`) gilt für alle Ausführungen. Ohne `<AFZ>` = Einzelprodukt → `<Pr Preis/EAN>`-Pfad. So erscheint im ERP-Editor wieder EIN gruppierter Eintrag «N Ausführungen» → Ausführungs-Dialog VOR der Stückzahl (Node-Test deckt die AFZ/AFZNr-Expansion ab).
- **Bilder verzögert laden (Performance, 07/2026)**: Die **Suche liefert die Bild-URL** (leichter String — debim referenziert Bilder als URL, nicht inline), das Frontend zeigt in der Trefferliste aber KEIN Thumbnail (nur `🖼`-Hinweis + `hatBild`). Der Proxy entfernt im Suchmodus schwere Inline-Bilder (`data:`-URIs/Base64) aus dem Payload; HTTP-URLs bleiben. **Erst beim Einfügen einer Position** wird die Bild-URL des Artikels (`_dsBild`) via `erpDsLoadImage(urlHint)` verwendet — im Browser auf **~340 px verkleinert + JPEG-komprimiert** (`erpDsShrink`, Qualität 0.72) → wenige Bytes, Anzeige ~4×4 cm; ohne CORS (getaintetes Canvas) Fallback auf die Roh-URL. Fehlt beim Suchtreffer eine URL, lädt `erpDsLoadImage` den Einzelartikel `bilder=1` nach. Der Insert bleibt sofort, das Bild «poppt» asynchron nach.
- **Schema-Robustheit (KRITISCH)**: Das exakte Feldschema ist format-/vertrags-/versionsabhängig. `_normArtikel`/`_extractArray` bilden darum **heuristisch** über viele plausible Feldnamen (bexio-CSV: `Produktcode`, `Produktname`/`Produktbeschreibung`, `Verkaufspreis`/`Einkaufspreis`, `Einheit`, `Währung`, `Hauptgruppe`; bexio-JSON: `intern_code/code`, `intern_name`, `sale_price/default_price`; debim/generisch: ArtNr/articleNumber, Bezeichnung/Bez(+Bez2), Bruttopreis/listPrice, VPE/unit, Bilder[]/images[{url}]/data:-URL, Container `{Artikel:[…]}`/`{data:[…]}`/Array/CSV-Rows) auf `{artnr,bezeichnung,ean,preis,waehrung,einheit,hersteller,serie,bildUrl}` ab; Schweizer/deutsche Preisformate (`1'234.50`/`1.234,50`) via `_num`. Weicht eine reale Antwort ab → Kandidatenlisten in beiden Dateien ergänzen. Exporte `_normArtikel/_extractArray/_num/_pick/_bild/_parseCsv/_stripHtml` fürs Node-Testing (`scripts/dataselect_norm_test.mjs`, inkl. bexio-CSV-Roundtrip).
- **Client `gema_dataselect.js`** (`GemaDataSelect`): `search({anbieter,artnr?,bez?,ean?,sprache?,preisbuch?,bilder?})` (JWT via `_authHeaders`, robustes `_parse` gegen HTML-Antworten; `bilder:1` = Detail-Abruf MIT Bild), `anbieter()` (aus `org.settings.dataselect.anbieter`, Default-Seed **Geberit 1900** als dokumentiertes Beispiel — keine erfundenen IDs), `addAnbieter(id,name)` (org-weit via `updateOrgSettings` → per-Record Cloud-Sync, **bleibt gespeichert**), `normArtikel` (Client-Fallback inkl. `hatBild`, Node-testbar), `fmtPreis`.
- **ERP-Integration (pm_erp)**: **in die «Kataloge»-Seitenleiste integriert** (kein separater Dialog). **IGH-Lieferantenkataloge stehen ZUOBERST** (`#ighList`, «🔎 IGH-Lieferantenkataloge (DataSelect)»), darunter der GEMA-Produktkatalog. EINE gemeinsame Suchleiste oben (`#katSuche` → `erpKatFilter`, Zustand in `gema_erp_side_v1.katQ`): filtert **leichtgewichtig** (Show/Hide, kein Re-Render) die IGH-Lieferanten nach **ID oder Name** (`data-dskey`/`data-dsname`) UND die GEMA-Artikel (`data-sn`); ohne Suche werden **alle** Lieferanten angezeigt (Auf-/Zu-Zustand aus `katOpen` wiederhergestellt), bei aktiver Suche Treffer automatisch aufgeklappt. Pro Lieferant Inline-Suche `erpDsSearch(anbId)` (Zahl-artige Eingabe → `artnr`, sonst `bez`; Sprache de) → Ergebnis-`.side-art`-Zeilen mit Artnr/Preis (ohne Thumbnail). «＋ Lieferant hinterlegen» (`erpDsAddAnbieter`, IGH-Mitglieder-ID; nimmt ID/Name aus der aktuellen Suche vor, öffnet den neuen Lieferanten nach dem Speichern, bleibt gespeichert). Markieren + Enter/Doppelklick → Stückzahl-Dialog → Position `{art:'frei', bez, menge, einheit, ep:preis, produktId:'ds:<artnr>', dsArtnr, lieferantFirma, bildUrl|bildDataUrl}` über der markierten Zeile — das Bild rendert im Positions-Editor und wandert über die bestehende Positionsbild-Logik (`tr.bildrow`) ins Druck-PDF. Externe Bild-URL wird direkt gespeichert (data:-URL als `bildDataUrl`).
- **Ausführungs-Gruppierung (07/2026, `scripts/dataselect_varianten_test.mjs` 16 Checks)**: Viele Grosshändler-Artikel (z.B. Sanitas Troesch) sind dasselbe Produkt in verschiedener **Ausführung** (AF = Farbe/Oberfläche): der `Produktcode` trägt einen Basiscode + Ausführungs-Suffix (`6130#1313116/143/183`, `…/153/0`, `…/133/183`), die `Produktbeschreibung` hat eine `AF:`/`AFZ:`-Zeile. Der Proxy zieht die Ausführung heraus (`_afAusfuehrung` → Feld `ausfuehrung`, «Pergamon · Gleitschutz Antislip»). Das Frontend gruppiert Suchtreffer nach **Basiscode** (`_dsBaseCode` = Produktcode vor dem ersten `/`; `_dsRenderGrouped`): mehrere Ausführungen erscheinen als **EIN Eintrag** («N Ausführungen» + Preisspanne, Basisname via `_dsCommonBase` = längster gemeinsamer Präfix), Duplikate (gleicher Code) werden zusammengefasst. Aktivieren (Enter/Doppelklick, Gruppen-Zeile `data-dsgroup`) öffnet den **Ausführungs-Dialog `#erpVarModal`** (`erpVarAsk`/`erpVarPick`/`erpVarConfirm`, Liste `.ev-opt` mit Label+Preis, Pfeiltasten/Enter) VOR der Stückzahl → gewählte Variante fliesst durch `erpArtGo` (Menge → Einfügen, Bild-Nachladen); die Position trägt Basisname «— Ausführung», den Ausführungs-`dsArtnr` und -Preis. Einzelartikel (kein Suffix/nur eine Variante) fügen wie bisher direkt ein. Transiente Hinweise `_afLabel`/`_ds*` werden vor dem Speichern gestrippt.
- **Kein IGH-Vertrag nötig, um GEMA zu nutzen (optionaler Add-on-Charakter)**: DataSelect/DataExpert (IGH) ist ein B2B-Dienst — ob und in welchem Format ein Lieferant Artikel liefert, hängt davon ab, ob er seinen Katalog für den Bezüger freigegeben hat (Datenbezug/Vertrag). Ohne Zugang kommt i.d.R. eine Zugang-verweigert-/Login-Antwort statt Artikel; **GEMA bleibt voll nutzbar** (GEMA-Produktkatalog, eigene Artikel, Regie, Offerten). Der Picker meldet den Fehler und lässt die übrigen Positions-Quellen unberührt.
- **Diagnose «🔍 Rohantwort prüfen» (07/2026, `scripts/dataselect_debug_test.mjs` 10 Checks)**: Pro IGH-Lieferant in der Sidebar ein Link, der die **rohe** Antwort von dataselect.ch abruft und im Dialog zeigt — HTTP-Status, Content-Type, **erkanntes Format** (JSON/debim-XML mit Artikelzahl/CSV/HTML/leer), JSON-parsebar, Länge, **erste ~2500 Zeichen** + die abgefragte URL (Token redigiert) — mit Deutung (403 = Vertrag nötig · debim/CSV wird unterstützt · JSON ✓ · Netzwerkfehler). So sieht man ohne IGH-Wissen, WAS ein Lieferant zurückgibt. Proxy: `?debug=1` (JWT-gated, Key nie im `triedUrl`), optional `&format=<x>` zum Testen anderer Zielformate; Client `GemaDataSelect.debug({anbieter,artnr?|bez?,format?})`; UI `erpDsDebug`/`erpDsDebugFormat` (Dialog via `GemaDialog.alert({html:true})` — neuer opt-in `html`-Flag im geteilten Dialog, Aufrufer escapt selbst).
- Registriert: sw.js (CACHE_FILES), Script-Include in pm_erp, netlify.toml (`/api/dataselect`). ENV (Netlify, alle optional): `DATASELECT_BASE`, `DATASELECT_API_KEY`, `DATASELECT_KEY_PARAM`, `DATASELECT_FORMAT_SUCHE` (Default `debim`), `DATASELECT_FORMAT_BILD` (Default `debim`). Ohne Deploy/Key läuft das Modul weiter (Picker meldet den Fehler, restliche Positions-Quellen unberührt). Node-Test `scripts/dataselect_norm_test.mjs` (89 Checks inkl. debim-XML-Parsing + `_xmlUnescape` + `_debimBild`).

### Positionsbilder, eigene Kataloge & Vorlagen

- **Positionsbilder**: Jede Detailposition kann ein Bild tragen (`p.bildUrl` via `GemaStorage.uploadDataUrl` Pfad `erp/<orgId>`, Base64-Fallback `p.bildDataUrl`; Resize max 900px JPEG). Editor: 📷-Button pro Zeile, **Bild ohne Rahmen ~4×4 cm** schon bei der Erfassung sichtbar (max 150px, `object-fit:contain`) mit Lightbox + Entfernen. PDF: Bildzeile (`tr.bildrow`, **max 40×40 mm, kein Rahmen**) direkt unter der Position, `tr.hasimg td{border-bottom:none}` hält Bild+Text optisch zusammen, `page-break-inside:avoid`. **PDF-Cover-Logo** 3mm hoch (`.kopf-r{margin-top:-3mm}` → Abstand oben = rechts 15mm) + `@page:first{@top-right{content:none}}` (Titelblatt ohne Laufzeile).
- **Eigene Artikel-Kataloge (org-weit)**: per-Record `erpkat:` → `gema_erp_kat_pool_v1`. Katalog `{id, orgId, name, artikel:[{id,bez,einheit,ep,bildUrl?,bildDataUrl?}]}`. Modal «⭐ Eigene Artikel» im Positions-Editor: Katalog-CRUD (GemaDialog), Artikel erfassen/bearbeiten/löschen, Klick = Position einfügen (`eigenArtikelId`, Quelle-Badge «⭐ Eigen», Bild wandert mit), **«⬇ Aus aktuellem Dokument übernehmen»** (Positions-Checkliste, dedupe per Bezeichnung).
- **Dokument-Vorlagen (org-weit, auch für Rechnungen)**: per-Record `erpvorl:` → `gema_erp_vorl_pool_v1`. Vorlage `{id, orgId, name, typ, rechnungsArt?, titel, einleitung, schlusstext, rabattPct, mwstPct, positionen[]}` — beim Speichern werden Akonto-/Abzugszeilen entfernt und Regie-/OA-Positionen zu `art:'frei'` ohne `regieRapportId`/`oaId` gekappt (dokument-spezifisch); **Titel-`bkp` und Rabatt-/Zuschlagszeilen (`modus`/`wert`) bleiben erhalten**; bei `typ:'rechnung'` wird `rechnungsArt` mitgespeichert (→ **Akonto-Standardvorlage**). Modal «📑 Vorlagen» im Editor-Footer (alle Typen inkl. Rechnung): aktuelles Dokument speichern (GemaDialog.prompt) + Liste mit Einfügen/Löschen — **passende Vorlagen zuerst** (gleicher typ, bei Rechnungen zusätzlich gleiche rechnungsArt; Akonto/Teil/Schluss-Badge). **Einfügen**: leeres Dokument → Positionen komplett übernehmen (Rabatt/MwSt mit), sonst anhängen; **mitgebrachte Einleitung/Schlusstext ERSETZEN die gestempelten Standardtexte** (so wirkt die Akonto-Standardvorlage auch auf eine bereits erzeugte Akontorechnung), Titel nur füllen wenn leer. Immer neue Positions-IDs.

### Rechtsklick-Kontextmenü (Karten + Positions-Editor)

Wenig Klicks statt vieler Buttons (`scripts/erp_kontextmenu_test.mjs` 47 Checks): `erpCtxShow(e,items)` baut `#erpCtxMenu` (position:fixed, z-index 2000, Viewport-geklemmt; schliesst bei Klick/Escape/Scroll/Resize). Zwei Anwender:
- **Dokument-Karten** (`erpDocCtx`, `oncontextmenu` auf `.card` in Liste + Erfolg-Tab): statusabhängige Aktionen — Offerte: versendet/abgelehnt markieren (`erpCtxStatus` direkt am Pool, ohne Editor), «Auftrag erstellen» (aus versendet/angenommen ohne Auftrag — kein «Angenommen»-Schritt mehr), «Duplizieren» (`erpDuplizieren`: Kopie als Entwurf mit neuer Nr, Regie-/OA-Verknüpfungen + Kette/Zahlungen gekappt); Auftrag: Akonto-/Teil-/Schlussrechnung erstellen, in Arbeit, abschliessen; Rechnung: stellen/Zahlung/stornieren (via `erpOpen(id)` + bestehende cur-Funktionen); immer Öffnen + PDF, Löschen nur Entwurf.
- **Positions-Editor** (`erpPosCtx`, `oncontextmenu` auf allen `<tr>` in `erpRenderPos`): Kopieren/Ausschneiden/Einfügen (unterhalb)/Duplizieren/Hoch/Runter/Löschen + Gruppe **«Unterhalb einfügen»** mit Rabatt/Zuschlag jeweils in % ODER pauschal CHF (`erpPosInsertAufschlag(i,art,modus)` — legt die Aufschlagszeile mit vorgewähltem Modus direkt unter der Zeile an, Modus bleibt in der Zeile umschaltbar). **Session-Clipboard `_posClip` funktioniert dokumentübergreifend**; `_posClipCopy` vergibt neue IDs und kappt `regieRapportId`/`oaId` (kein Doppel-Verrechnen). Read-only-Dokumente zeigen nur Kopieren. **Guard (KRITISCH)**: Rechtsklick in INPUT/SELECT/TEXTAREA lässt das NATIVE Menü durch (Text kopieren) — `erpPosCtx` returnt bei Feld-Targets. Hinweis «Rechtsklick: Kopieren / Einfügen / Verschieben» im posHint nur bei `(hover:hover)`.

### Nachkalkulation & Projekterfolg (Tab «📈 Erfolg»)

Soll-Ist-Vergleich pro Auftrag, nur für `erpCanEdit()`-Rollen sichtbar (Preise/DB). Engine-Funktion `erpNachkalk(auftrag,docs,rapporte,einsaetze,oas,kostenFaktorPct)` im `/*ENGINE-START*/`-Block (Node-testbar):
- **Soll**: Auftragssumme netto + Fakturierungsstand via `erpAuftragFakt` (verrechnet/Rest/%, Fortschrittsbalken).
- **Ist Regie**: ausgewiesene Regierapporte mit `r.objektId === auftrag.objektId` (Σ std×ansatz + Σ menge×ep), gesplittet verrechnet (`r.verrechnetIn`) / unverrechnet, + Stunden-Summe.
- **Ist Material**: Positionen mit `oaId` — EK = `oa.antwort.bruttoPreis` der Lieferanten-Offerte, VK = menge×ep×(1−rabatt%).
- **Einsatzplanung**: Σ `dauerTage` der Einsätze mit `e.auftragId === auftrag.id` (geplante Manntage) — dafür bindet der Init zusätzlich `gema_einsatz_pool_v1`.
- **DB-Schätzung** nur wenn `org.settings.erp.kostenFaktorPct` > 0 (⚙️-Feld «Kostensatz % vom Verkaufsansatz»): Kosten = Regie×Faktor + EK-Material → Deckungsbeitrag CHF + % (im UI klar als Schätzung markiert; ohne Faktor KPI-Hinweis «Kostensatz in ⚙️ setzen»).
- **Hinweis-Badges** (`hinweise[].code`): `unverrechnet` (amber, offene Regie CHF), `ueberverrechnet` (blau, über Auftragssumme fakturiert), `nachtrag` (rot, Regie übersteigt Auftrag → Nachtrag prüfen).
- UI: KPI-Zeile (laufende Aufträge, Volumen, unverrechnete Regie org-weit, Ø DB), Karten laufende zuerst, Klick → Auftrag; Objekt-Filter + Suche wie andere Tabs, kein «＋ Neu»; Deep-Link `?tab=erfolg`.

### Sachbearbeiter (verantwortliche Person)

Jedes Dokument trägt `sachbearbeiter:{userId,name}` (07/2026, `scripts/erp_sachbearbeiter_test.mjs` 17 Checks): **Default = Ersteller** beim Erstellen (Offerte ODER Direkt-Auftrag), die Kette vererbt ihn (`erpSbNeu(quelle)` in erpZuAuftrag/_erpNeueRechnung; Duplizieren setzt den Duplizierenden). Resolver **`erpSb(d)`** fällt bei Altdaten ohne Feld auf `erstelltVon` zurück — ALLE Anzeigen/Filter laufen darüber. Editor: Dropdown «Sachbearbeiter» in den Grunddaten (Org-User, `erpSbWahl`); Toolbar: Filter «Alle Sachbearbeiter» (datengetrieben aus den Dokumenten, erscheint ab 2 Personen, wirkt auf Liste + Erfolg-Tab, Suche findet auch den SB-Namen); Karten zeigen 👔; **PDF-Kürzel** («Basel, 13.07.2026 / RJ») folgt dem Sachbearbeiter. **Einsatzplan**: `epVerantwortlich(ev)` — beim Auftrags-Einsatz live vom ERP-Auftrag (sachbearbeiter→erstelltVon-Fallback, `_epErpPool`-Lookup mit Org-Guard), bei freien Einsätzen der Einplaner (`ev.erstelltVon`); angezeigt als «👔 Verantwortlich» in Meine Woche, Tages-Modal, Einsatz-Modal (`#evKeyInfo`) und auf den Sidebar-Auftragskarten — der Monteur weiss, wen er fragen muss.

### Kreditorenmanagement (Tab «💳 Kreditoren»)

Lieferantenrechnungen erfassen → Auftrag zuteilen → **Freigabe durch den SACHBEARBEITER des Auftrags** → bezahlt (07/2026, `scripts/erp_kreditoren_test.mjs` 52 Checks). Pool `erpkred:` → `gema_erp_kred_pool_v1` (org-intern, poolSave/poolRead wie DOK_POOL). Record: `{id, orgId, lieferant, rechnungsNr, betrag, datum, faelligBis, beschrieb, auftragId, auftragNr, freigeber:{userId,name} (Snapshot), beleg:{name, url|dataUrl, mime}, status, entscheid:{von,am,grund}, bezahlt:{am,von}, erstelltVon, verlauf[] (Cap 60)}`.
- **Statusmaschine** (Engine `erpKredNext(status,aktion)`, DOM-frei): offen —freigeben→ freigegeben —bezahlen→ bezahlt; **zurückweisen aus offen UND freigegeben** (Fehlfreigabe korrigierbar, solange nicht bezahlt; Pflicht-Grund via GemaDialog.prompt); zurückgewiesen —wiedervorlegen→ offen. Ungültig = null. Dazu `erpKredSummen(list)` (offen/freigegeben/bezahlt je N+CHF, totalChf ohne zurückgewiesene).
- **Freigeber wird LIVE aufgelöst** (`erpKredFreigeber`: Auftrag → `erpSb(auftrag)` — folgt einem SB-Wechsel am Auftrag; `k.freigeber` ist nur Anzeige-Fallback). Guard `erpKredDarfEntscheiden`: nur der aufgelöste Freigeber oder role_admin entscheidet; **ohne Auftrag-Zuteilung darf jede berechtigte Person freigeben** (Hinweis auf der Karte). Editierbar nur in offen/zurückgewiesen (`erpKredEditable`).
- **Beleg (PDF oder Foto)**: Upload → GemaStorage `erp/<orgId>/kreditoren` (Bilder resized 1600px, PDF ≤ 8 MB roh; Base64-Fallback nur ≤ ~2.5 MB, sonst klare Fehlermeldung). File-Input im DOM (iOS-GC-Muster). **Doppelklick auf Karte/Übersichts-Zeile öffnet den Beleg im separaten Fenster** (`_erpBelegWindow`: Kopfzeile Lieferant/Nr/Betrag + Druckknopf, PDF als iframe, Bild als img; Einzelklick = Edit-Modal, um 260 ms verzögert damit der Doppelklick ihn abfängt — `erpKredCardClick/Dbl`); zusätzlich 📎-Buttons für Touch.
- **UI**: Tab «💳 Kreditoren» (nur `erpCanEdit`, Badge = offene) mit KPI-Zeile (Zur Freigabe N+CHF · Zur Freigabe bei mir · Freigegeben-zu-zahlen · Bezahlt), Status-Filter + Suche, Karten sortiert offen→freigegeben→zurückgewiesen→bezahlt; **«🔔 zur Freigabe bei dir»-Panel** wenn offene Kreditoren beim eingeloggten SB liegen; Freigeben/Zurückweisen/Bezahlt/Erneut-vorlegen direkt auf der Karte. Kreditor-Modal mit Lieferanten-Datalist (eigene Historie), Auftrag-Select (zeigt den Freigeber als Hint), Verlauf. Auftrag-Kontextmenü: «💳 Kreditor erfassen» (Auftrag vorausgewählt). Deep-Link `?tab=kreditoren&kred=<id>` (Ziel der Notifys).
- **Übersicht im Auftrag-/Rechnungs-Editor** (`erpAuftragUebersichtHtml`, Sektion «📊 Stunden & Kreditoren» nach den Positionen — Rechnung löst den Auftrag via `verknuepfung.auftragId`): **alle Stunden inkl. Datum** (Person, von–bis mit Pausen-Vermerk, Dauer h, Tätigkeit + Total) über die Kette Stundenerfassung → Einsatzplan → Auftrag (Engine `erpAuftragStunden(auftragId,einsaetze,tage)`: Zeiteinträge mit `einsatzId` auf einen Einsatz mit diesem `auftragId`; Über-Mitternacht +24 h, Pause abgezogen, typ-Records übersprungen) **und separat alle Kreditoren des Auftrags** (Datum/Lieferant/Nr/Status/Beleg/Betrag, Doppelklick → Beleg, Total ohne zurückgewiesene, ＋-Button mit vorausgewähltem Auftrag). Boot bindet dafür zusätzlich `gema_std_pool_v1` (stundenerfassung). Die Erfolg-Karte weist Kreditoren als eigene Zeile aus (Anzeige, fliesst NICHT in die DB-Schätzung — EK-Material aus OAs könnte sonst doppelt zählen).
- **Notifys** (neue Gruppe `erp` in gema_notify_ui MODUL_LABELS + MODUL_ZUGRIFF `{mods:['erp']}` — Gating-Test auf 25 Gruppen nachgeführt): `kreditor_freigabe` an den Freigeber (bei Erfassung/Auftragswechsel/Wiedervorlage, nie an sich selbst), `kreditor_entscheid` an den Erfasser (freigegeben typ erfolg / zurückgewiesen typ warnung mit Grund).

### Kunden & Rechte

Kundenstamm pro Org (Tab 👥) mit **Schnellübernahme aus Objekt-Beteiligten** (`GemaObjekte.getBeteiligte` → 1-Klick-Befüllung). `kundeSnapshot` wird ins Dokument denormalisiert (Adresse fürs PDF/QR stabil). **Beteiligte direkt im Editor (Feedback 19.07.2026, `scripts/erp_einsatz_auftrag_test.mjs`)**: Die Objekt-Wahl in den Grunddaten (`erpObjektWahl`) blendet unter dem Kunde-Feld die **Beteiligten des Objekts** als 1-Klick-Rechnungsempfänger ein (`erpRenderObjBet` → Box `#erpObjBet`, `erpBetAlsKunde(i)` legt bei Bedarf einen Kunden an bzw. wiederverwendet einen bestehenden gleicher Firma) — ohne Umweg über den «＋ Kunde»-Dialog. Eine neue Offerte mit aktivem Objekt zeigt die Box sofort beim Öffnen. Rechte: `erpCanEdit` = Planer-Rollen/Admin/AL ODER **Matrix-basiert `can('write','erp')`** — `role_unternehmer` hat erp r/w **ab Werk** (Installateur-Betriebe offerieren selbst; Permission-Backfill zieht es in Bestands-Installationen nach, Rollen-Golden regeneriert inkl. Layer-B «Unternehmer → ERP offen»); MODULES-Key `erp` (cat Projektmanagement, Planer via `_allPerms`), FILE_MAP `pm_erp`. Deep-Links `?doc=<id>` und `?tab=offerte|auftrag|rechnung|kunden`. index.html PM («13 Module»), sw.js v169.

## Einsatzplan (pm_einsatzplan.html)

Kalender zur Monteur-Einplanung — Aufträge aus dem ERP-Modul per **Drag & Drop** (oder Antippen auf iPad) direkt auf die Plantafel ziehen. Mobile-tauglich (gleiche UI-Muster wie pm_regierapport/pm_erp).

- **Storage per-Record**: moduleKey `einsatzplan`, prefix `einsatz:`, Pool-Cache `gema_einsatz_pool_v1` (bindCollection beim Boot, Einzel-Saves via `GemaSync.saveRecord`, Org-Scoping über `e.orgId`). Einsatz-Record: `{id, orgId, typ:'auftrag'|'frei'|'ferien', auftragId, auftragNr, kunde, titel, objektId, objektName, monteurUserId, monteurName, datum, dauerTage, slot:'ganz'|'vm'|'nm', zeitVon, zeitBis, notiz, erstelltVon}`.
- **3 umschaltbare Ansichten** (`_view`): **Woche** = Stunden-Plantafel (siehe «Stunden-Tafel»), **Monat** = 42-Zellen-Grid mit Tages-Modal (`epDayOpen`), **Meine Woche** = Karten-Liste des eingeloggten Monteurs mit Notiz + Deep-Link «📝 Regierapport erfassen» (`pm_regierapport.html?objekt=…`). Monteure ohne Planungsrecht landen automatisch in «Meine Woche».
- **Stunden-Tafel (Feedback 19.07.2026, `scripts/einsatzplan_stundenplan_test.mjs` 35 Checks)**: Die Wochen-Plantafel plant im **Stundenraster, Zeit läuft von links nach rechts** — jede Person×Tag-Zelle ist eine Timeline (`epTlCellHtml`: `.tl` mit `--hn`-Stundenraster als CSS-Gradient, Events `.tl-ev` absolut positioniert aus `epEvHours` [Slot-Altdaten: ganz/VM/NM → Fenster/Hälften], Überlappungen stapeln in Spuren + ⚠), Tagesköpfe mit Stunden-Ticks (`.th-scale`), **rote Jetzt-Linie** am heutigen Tag (`epNowFrac`, minütlich nachgeführt ohne Re-Render). **Outlook-Muster**: Zeit per Klicken–Halten–Ziehen direkt in der Zelle aufziehen (`epTlDown`/document-mousemove/-up, `.tl-selbox` mit Live-Zeitanzeige, Stunden-Snap) → beim Loslassen öffnet der Einsatz-Dialog mit der Zeit vorbefüllt (`epNeuZeit`, Typ Auftrag → Auftrag zuweisen, Auftragstext wird als Titel übernommen); Klick ohne Ziehen = 1-h-Termin; der nachlaufende click ist via `_tlDone` unterdrückt (Touch läuft über die Kompatibilitäts-Mausevents). Engine-Helfer `epHmToH`/`epHToHm`/`epEvHours`/`epNowFrac`. Arbeitszeit-Fenster `tagVon`/`tagBis` (Default 06–18) in den ⚙️-Einstellungen.
- **Auftrags-Pool rechts (statt Sidebar «Offene Aufträge»)**: zeigt nur noch **NICHT eingeplante** Aufträge (`!a._geplant`; Fusszeile «✓ N bereits eingeplant»); **Abteilungs-Filter** über die Arbeitsbereiche (`#epPoolFilter`, inkl. «– ohne Abteilung –»), **pro Gerät gespeichert** (`gema_ep_poolfilter_v1` — beim nächsten Öffnen gleich). KRITISCH: ein (noch) unbekannter Bereich (Org-Settings erst nach dem Cloud-Pull da, oder gelöscht) wird nur fürs RENDERN wie «Alle» behandelt — die gespeicherte Wahl wird NIE zurückgesetzt. Drop/Tap erzeugt den Einsatz mit Auftrag-Daten (`epNeuAusAuftrag(a,monteurId,datum,vonH?)` — mit Drop-Stunde: `zeitVon=vonH`, 8-h-Standarddauer ans Fenster geklemmt; ohne: ganztags wie bisher).
- **DnD + Tap-Fallback**: HTML5-DnD (`epBindDnD`, dataTransfer `ev:<id>` / `job:<id>` → `epDropOn(data,monteurId,datum,vonH)` — die Drop-X-Position bestimmt die Startstunde via `epTdHour`; Einsatz-Move behält die Dauer); auf Touch Karte antippen → Move-Modus (`epJobTap`/`epEvStartMove`, `#movebar`) → Ziel-Zelle antippen (`epCellClick(event,…)`).
- **Raster** in den ⚙️-Einstellungen (`org.settings.einsatzplan = {raster:'halbtag'|'zeit', wochenende, userIds, tagVon, tagBis}`): **Default jetzt `zeit`** (von–bis-Felder; explizit gespeichertes `halbtag` bleibt — der Dialog zeigt die Zeitfelder aber IMMER, sobald der Einsatz Zeiten trägt). `userIds` definiert die einplanbaren Personen (Default: alle `role_monteur`+`role_spengler` der Org). Sa/So-Spalten optional.
- **«Freier Termin» (ehem. Typ «Einsatz», `TYPEN.frei`)**: ein Einsatz ohne Auftrag hat bewusst **weder Auftrag noch Objekt** — das separate Projekt/Objekt-Feld ist aus dem Dialog entfernt (beim Auftrag kommt das Objekt aus dem Auftrag und steht im Auswahl-Chip). Bestehende Einsätze mit Objekt (Service-Termine aus sv_service, typ frei) behalten ihre `objektId` beim Speichern und zeigen sie read-only in `#evKeyInfo` (🏗-Zeile; `#evKeyInfo` liegt jetzt AUSSERHALB von `evAuftragWrap`, damit die 🔑-Box der Service-Einsätze sichtbar bleibt).
- **Konflikt-Warnung**: `epOverlap(a,b)` (Zeitfenster-Schnitt bzw. Slot-Kollision — `ganz` kollidiert mit allem) markiert Doppelbelegungen mit ⚠; mehrtägige Einsätze via `dauerTage` (`epCovers`).
- **Notifikation** `einsatz_geplant` (gema_notify.js) an den Monteur bei Einplanung UND Verschiebung (`epNotify`, nie an sich selbst), Link mit Deep-Link `pm_einsatzplan.html?d=YYYY-MM-DD` (Init springt zur Woche/zum Monat des Datums).
- **Auftrag-Einsatz (Feedback 19.07.2026, `scripts/erp_einsatz_auftrag_test.mjs`)**: Neuer Einsatz startet als **Typ «Auftrag»** (`epNeu` Default `typ:'auftrag'`). Die Auftrag-Auswahl ist eine **Such-Maske** (Modal `#aufModal`, kein Dropdown mehr): `epAufOpen`→`epAufRender(q)` listet die offenen Aufträge **sortiert nach `erstelltAm` (neueste zuerst)**, Filter über Nr/Titel/Kunde/Strasse/PLZ/Ort/objektName; `epAufPick(id)` übernimmt Auftrag + verknüpftes Objekt/Bereich (getippter Titel bleibt via `epEvCollect`), `epAufPickRender` zeigt den gewählten Auftrag als Chip mit «Ändern». `epAuftragById` löst live aus dem ERP-Pool auf; der alte `ev_auftrag`-Select + `epEvAuftragChanged` sind entfernt (`epEvSave` liest `curEv.auftragId`).
- **Arbeitsbereiche + Garantie (07/2026, `scripts/arbeitsbereiche_test.mjs` 30 Checks)**: Einsätze tragen `bereichId` (vererbt vom ERP-Auftrag via `epNeuAusAuftrag`/`epAufPick`; Bereichsliste `org.settings.arbeitsbereiche`, Editor auch im Einsatzplan-⚙️ — siehe ERP-Abschnitt «Arbeitsbereiche»). Kalender-Karten in ALLEN Sichten (Woche/Monat/Tages-Modal/Meine Woche) rendern in der Bereichsfarbe (`abEvStyle`: Tint-Hintergrund + farbiger Rand; Monat mit Inset-Farbstreifen), Sidebar-Aufträge zeigen den Chip. Dazu **`garantie:true`-Flag** pro Einsatz (🛡-Checkbox im Modal «Garantiearbeit — Garantie / Eigenverschulden», 🛡-Badge in allen Sichten) und die **Jahres-Auswertung «🛡 Garantie»** (eigener View-Tab NUR für `epCanPlan` — enthält Beträge; ‹ › navigiert Jahre, `periodLbl` = «Garantiearbeiten JJJJ»): `epGarantieAuswertung(einsaetze,tage,rapporte,jahr)` — **Stunden** = Zeiteinträge der Stundenerfassung mit `eintrag.einsatzId` auf einen Garantie-Einsatz (Über-Mitternacht-Regel wie `stdEintragMin`), **Material** = Σ Menge×EP der via `eintrag.rapportId` verknüpften Regierapporte (pro Einsatz UND im Total über die Rapport-Vereinigung dedupliziert). KPI-Zeile, Tabelle (Klick öffnet den Einsatz), CSV-Export (Semikolon+BOM). Der View bindet Stunden- + Regie-Pool lazy nach (`_epGarBound`, GemaBest.bind-Muster).
- **Besonderheiten + Schlüssel/Zutritt (07/2026, `scripts/einsatzplan_besonderheiten_test.mjs` 23 Checks)**: `org.settings.einsatzplan.besonderheiten = [{id:'bs_<slug>', ic, label}]` — frei definierbare Monteur-Hinweise («📦 Material im Lager bereit», «🪜 Grosse Leiter mitnehmen» …), Editor im ⚙️ (Icon+Label-Zeilen, «↺ Beispiele einfügen» = `BS_VORLAGEN`, IDs bleiben beim Umbenennen stabil via `data-id`). Pro Einsatz Mehrfachauswahl (`ev.besonderheiten=[ids]`, Toggle-Chips im Modal) — **gut sichtbar in allen Sichten**: Icons mit Tooltip in Woche/Monat (`bsIconsHtml`/`bsIconsText`), volle amber Pills in Tages-Modal + «Meine Woche» (`bsChipsHtml`) und in der pm_stunden-Karte «Geplante Einsätze» (`stBesChips` liest dieselbe Settings-Liste); Notify-Text nennt die Besonderheiten. Dazu trägt der **ERP-Auftrag `schluessel:{code,info}`** (🔑-Sektion «Schlüssel / Zutritt» in den Auftrag-Grunddaten von pm_erp — Schlüsselcode/Tresor-Code + «wo/bei wem abholen»; nur typ auftrag): der Einsatz zeigt Code + Abholort **live vom Auftrag** (`epSchluessel` via ERP-Pool-Lookup mit Org-Guard + 1.5s-Memo `_epErpMemo`; Pool wird beim Boot für ALLE gebunden — auch Monteure) als 🔑-Box in «Meine Woche», Tages-Modal und im Einsatz-Modal (`#evKeyInfo`), Woche/Monat markieren mit 🔑. **Der Schlüsselcode geht NIE in Notify-Records** (nur Besonderheiten-Labels).
- **Rechte**: Planen = Planer-Rollen/Admin/Abteilungsleiter/Magaziner (`epCanPlan`); Monteur/Spengler read-only (`einsatzplan` read in DEFAULT_ROLES, Magaziner write). MODULES-Key `einsatzplan` (cat Projektmanagement), FILE_MAP `pm_einsatzplan`. index.html PM («14 Module»), sw.js v170.

## Aushang — Mieter-Mitteilung drucken (gema_aushang.js: pm_erp · pm_einsatzplan · sv_service)

Druckbarer A4-Aushang fürs Treppenhaus (v.a. Mehrfamilienhäuser): Wasserabstellung, Stromabschaltung, Heizungsunterbruch, Boiler-/Filterservice (07/2026, `scripts/aushang_test.mjs` 39 Checks). Geteilter Helper `gema_aushang.js` (`GemaAushang`, selbst-injizierter Dialog z-index 11000 — über den Modul-Modals, unter GemaDialog):
- **Vorlagen**: 6 Defaults (`wasser`/`strom`/`heizung`/`boiler`/`filter`/`allgemein`) mit Titel + inhaltlichem Text; `vorlagen()` = Defaults überlagert von `org.settings.aushang.vorlagen` (gleiche id → Org-Version gewinnt, neue ids angehängt). **«💾 Als Vorlage speichern»** im Dialog: gewählte Vorlage org-weit überschreiben ODER (via Abbrechen im Confirm) neue Vorlage anlegen (GemaDialog.prompt, Slug-ID). Vorlagen-Wechsel im Dialog ersetzt Titel + Text (Zeit/Zusatz bleiben).
- **Pflichtfelder**: Datum + **Zeit von–bis** (steht gross auf dem Aushang; ohne → Inline-Fehlermeldung, kein Druck). Optional: bis-Datum (mehrtägig → «jeweils von … bis … Uhr»), Liegenschaft, Zusatzinfos (gelbe «❗ Bitte beachten»-Box), Kontakt (Prefill aus `org.settings.erp` Name+Tel).
- **Druckfenster**: A4-Poster (grosse Datum/Zeit-Box mit langem deutschem Datum inkl. Wochentag, Titel 33pt, Firmenlogo `org.logoVector||logo`, Akzent aus `org.settings.pdfFarben` mit Kontrastschutz — Helfer dupliziert, standalone), DM Sans mit **opsz-14-Kanon** (pdf_opsz_test-konform), Grussformel + «Aushang erstellt am». `onSave(data)` läuft bei jedem Druck — der Aufrufer persistiert am tragenden Record.
- **pm_erp (Auftrag)**: 📌-Box in den Auftrag-Grunddaten — Checkbox **«Aushang nötig»** + Vorlage-Select + «🖨 Aushang erstellen» (`erpAushangOpen`, Daten in `auftrag.aushang={noetig,vorlageId,daten}`).
- **pm_einsatzplan (Termin — Haupt-Flow)**: `epNeuAusAuftrag` eines geflaggten Auftrags → **GemaDialog-Erinnerung «📌 Aushang nötig — jetzt erstellen?»** → Dialog mit Termin-Datum (+bis bei dauerTage>1) und Termin-Zeiten vorbefüllt. Einsatz-Modal: `#evAushang`-Block (Badge «Aushang nötig», «✓ erstellt am», Druck-Button; alle Einsätze ausser ferien/neu). `epAushangInfo(ev)` liest `ev.aushang` ZUERST (Service-Einsätze), dann den Auftrag; Daten am Einsatz gespeichert. **KRITISCH — der Termin ist die Quelle fürs Datum**: gespeicherte Aushang-Daten werden beim Öffnen mit dem aktuellen `ev.datum` überschrieben (verschobener Termin druckt nie das alte Datum).
- **sv_service (wiederkehrend)**: Anlage trägt `aushang:{noetig,vorlageId}` (Checkbox + Vorlage im Anlage-Formular, Default-Vorlage boiler — «für MFH; EFH meist bilateral»); Plan-Modal zeigt den Hinweis, **nach `svPlanSave` Prompt** → `svAushangOpen(aufId)` (Datum aus dem geplanten Einsatz, sonst Fälligkeit; Daten in `auf.aushang` → Nachdruck via **📌-Button in der Serviceauftrag-Zeile**). Der erzeugte Einsatz trägt `aushang:{noetig,vorlageId}` — Badge/Button erscheinen auch im Einsatzplan.
- Registriert: sw.js (v316, CACHE_FILES), Script-Include in pm_erp/pm_einsatzplan/sv_service. Kein eigenes Modul-Permission-Gating (läuft in den Host-Modulen), kein Notify-Event.

## Terminplan (pm_terminplan.html)

Bauzeitenplan mit frappe-gantt 0.6.1 (CDN) + eigener Header-/Grid-Overlay-Zeichnung, Terminliste und gebrandetem jsPDF-Export. Sidebar (Projekt, Quick-Add, Plan verschieben) + 3 Tabs (Terminplan/Terminliste/Einstellungen).

- **Storage per-Objekt via `_GemaDB` (KRITISCH)**: moduleKey `terminplan`, Basis-Key `terminplan.webapp.v2`, pro Objekt `…__<objektId>[@phase]` (`GemaObjekte.storageKey`). Der Init MUSS `[BASE, aktiver-Objekt-Key]` laden — `_GemaDB.init` holt NUR die angefragten data_keys (früher wurde nur der Basis-Key geladen → bei aktivem Objekt las `loadState()` ins Leere, obwohl `saveState()` in den per-Objekt-Key schrieb: Plan wirkte nach jedem Reload leer, Daten lagen unsichtbar in der Cloud). Der **Objekt-Dropdown wechselt den Plan** (`_tpSwitchStorage`: `GemaObjekte.setActiveId` → neuer Key → `loadFromModule`-Nachladen → hydrate+render; «Freies Objekt» = Basis-Key); Listener auf `gema-objekt-changed` zieht externe Wechsel nach. Einmalige Migration: Basis-Plan mit `state.objektId === aktives Objekt` wird auf den per-Objekt-Key kopiert.
- **Gantt-Viewport OHNE CSS-Transform (KRITISCH)**: Früher wurde der SVG per `translate(…) scale(…)` verschoben — der Offset war in unskalierten Einheiten (Ansicht begann am falschen Datum) und der uniforme Scale verzog die Y-Positionen (Bars sassen neben ihren Zeilen). Jetzt: `Gantt.prototype.update_view_scale` ist gepatcht (`_tpPatchGantt`) und respektiert `options.gema_column_width` — frappe überschreibt `column_width` sonst hart (Day=38). Auto-Fit `_tpColumnWidth()` = Containerbreite/Fenster-Tage × Zoom-Faktor (Fenster 1 Wo…Ganzes Projekt; Zoom Auto/150…50 %); damit rechnen Bars, Grid UND Drag&Drop nativ in derselben Skala. Fenster-Start = `scrollLeft` auf **frappes eigenem Scroll-Container** `.gantt-container` (`_tpScroller()` — der äussere `#ganttChartArea` scrollt nie!); auch der Vertikal-Sync zur Task-Liste hängt dort. Zeilenraster 38 px (`bar_height:24 + padding:14` = `.gtl-row`-Höhe). Eigener Header (`applyHolidayShading`, headerH 50): Monat/KW/Tagesnummern mit **Dichte-Ausdünnung** (Tagesnummern erst ab cw≥13, sonst nur montags); frappes native Today-Spalte ist per CSS ausgeblendet (unser Overlay zeichnet sie mit Padding-Offset selbst). Die frühere «Ansicht Woche/Monat»-Auswahl ist entfernt (war mit dem Tages-Overlay inkonsistent) — die Dichte passt sich über Fenster/Zoom stufenlos an.
- **Erledigt-Flag `t.done`**: `taskStatus` liefert `done` VOR der Überfällig-Prüfung (vorher blieben vergangene Termine für immer «Überfällig»); Toggle ✓ in der Terminliste, Checkbox im Edit-Modal (bei Meilenstein ausgeblendet), Stats-Pill «Erledigt», Gantt-Bar abgeschwächt + durchgestrichen, Statistik zählt done nicht als überfällig/laufend.
- **Gebrandeter PDF-Export** (`exportPDF`, async): Header-Band in Firmenfarbe mit weissem **Logo-Chip** (`org.logoVector||org.logo`, Canvas-Raster als JPEG — PNG bettete jsPDF unkomprimiert ein, ~2 MB), Sekundärfarbe als Akzentstreifen; `_tpPdfBrand()` mit denselben Kontrastschutz-Helfern wie gema_schaden_pdf (`_tpDarkenForWhiteBg` ≥ 4.5:1, `_tpMixWhite`-Tint für Zebra/Bemerkung); ohne Branding GEMA-Blau, ohne Logo kein Chip. Tabelle mit **Status-Spalte** (farbig), CH-Datumsformat überall, Fusszeile (Org · Terminplan · Seite) auf allen Seiten. **jsPDF-Standardfonts sind latin1** — ◆/●/⚠/✓ enden als «%Æ»-Müll: Meilensteine werden als Rauten GEZEICHNET, Status als Klartext. Monatslabel nur wenn das Monats-Segment breit genug ist (sonst überlappten «Jun/Jul» am Chartanfang).
- **Layout-Fixes**: `.app-shell` rechnet mit der globalen 72px-Nav (+ Safe-Area, `100dvh`-Variante) statt 52px; Mobile ≤900px öffnet die Sidebar als Overlay (`mobile-open` + `#sbBackdrop`) — der Toggle schaltete früher nur `collapsed` (auf dem Handy wirkungslos, Sidebar war unerreichbar). Eindeutige PDF-Button-IDs (`btnPDF`/`btnPDFSettings`/`navBtnPDF`, früher doppeltes `id="btnPDF"`). JSON-Import erhält ALLE Felder (projektName/contractors/bemerkung/projectEnd gingen im Roundtrip verloren); Unternehmer sind Strings (Normalisierung in `loadState`). ICS/Export-Dateinamen via `getProjectName()`.

## Goodel – Terminabstimmung (pm_goodel.html)

Doodle-artige Terminabstimmung fürs Team (Umfrage mit Datums-/Zeit-Optionen + Ort, Ja/Vielleicht/Nein pro Teilnehmer, Favorit = meiste Ja-Stimmen).

- **Storage per-Record + Org-Scoping (KRITISCH)**: moduleKey `goodel`, prefix `goodel:`, ein Record pro Umfrage mit `orgId` — Sicht auf die eigene Org gefiltert, Einzel-Saves via `GemaSync.saveRecord`/`deleteRecord` (nie das ganze Array). Früher lag ALLES in EINEM globalen Blob `gema_goodel_v1` ohne orgId: jede Organisation sah die Umfragen aller anderen und überschrieb sie beim Speichern (Last-Write-Wins). **Cache-Key = alter Blob-Key `gema_goodel_v1`** — `bindCollection('goodel','gema_goodel_v1','goodel:','id')` findet so die Legacy-Blob-Row und splittet sie automatisch in Records (orgId-lose Alt-Umfragen bleiben defensiv für alle sichtbar, bis der nächste Save sie der eigenen Org stempelt). Boot: Stale-while-revalidate (sofort aus Cache rendern, Spinner nur bei leerem Cache).
- **Record**: `{id, orgId, title, desc, ort, created, erstelltVon:{userId,name}, options:[{date,time}] (chronologisch sortiert), participants:[{id,name,userId?,votes:['ja'|'nein'|'maybe'|null]}]}`. Ersteller im Karten-Footer.
- **Abstimmen**: Name wird vom eingeloggten User vorbefüllt; hat er bereits geantwortet, öffnet «Abstimmen» automatisch den **Edit-Modus** seiner Antwort (Hinweis-Banner) — zusätzlich ✏️ pro Teilnehmer-Zeile (vorher gab es KEINEN Weg, eine Stimme zu ändern). Duplikat-Namen-Check nur für wirklich neue Namen.
- **`gema-read-ok` auf allen Lösch-Buttons (KRITISCH)**: `gema_auth._applyUI` versteckt für Nicht-Admins pauschal `button[onclick*="Delete"]` — das traf hier Löschen UND Abbrechen/✕ der beiden Bestätigungs-Modals (race-abhängig, je nachdem ob der Sweep vor/nach dem Rendern lief). Goodel gated Erstellen/Löschen selbst über `GemaAuth.can('write','goodel')`, darum tragen 🗑/✕/Abbrechen/Löschen die Ausnahme-Klasse.
- **XSS-Härtung**: `esc()` escapt auch `"` und `'` — Teilnehmernamen landen in onclick-/HTML-Attributen (ein Name wie «O'Brien» brach vorher das Attribut). Modal-Öffner erhalten nur noch IDs, Namen werden per Lookup aufgelöst. Leere Stimm-Zellen heissen `vote-btn leer` (nicht `empty` — Kollision mit der globalen Empty-State-Klasse blies die Zellen zu 80px-Blöcken auf).
- **Notifikationen NUR an Betroffene (User-Vorgabe)**: Das Create-Modal hat eine Einladungs-Checkliste der Org-User (`poll.eingeladen[]`) — `goodel_neu` geht als Einzel-Push (`empfaengerUserId`) NUR an die Ausgewählten, nie org-weit; `goodel_abgestimmt` an den Ersteller bei neuer Antwort. Deep-Link `pm_goodel.html?poll=<id>` scrollt zur Karte + Puls-Highlight.
- **Externer Freigabe-Link (Muster Revisionsunterlagen)**: 🔗-Teilen-Modal (canWrite) erzeugt `poll.freigabe={token(48 hex),aktiv,erstelltAm}`; Widerruf löscht den Token (alter Link endgültig tot). Öffentlicher Viewer **`sys_goodel_ansicht.html?t=<token>`** (KEIN gema_auth/gema_sync — NICHT in FILE_MAP/sw.js) über **`netlify/functions/goodel-share.js`** (Service-Key; Redirect `/api/goodel-share`): GET liefert GENAU die eine Umfrage serverseitig sanitisiert (keine orgId/userIds/Token/Einladungsliste/extSecrets), POST trägt die Abstimmung des Externen ein — neuer Teilnehmer `{extern:true, extSecret}`, das Secret geht einmalig an den Browser (localStorage `gema_goodel_ext_v1`) und erlaubt NUR das Bearbeiten der eigenen Antwort; Duplikat-Name 409, Teilnehmer-Cap 200, Ersteller-Notify wird als `notif:`-Row direkt geschrieben (Muster form-watch-cron). Externe Teilnehmer tragen intern den Badge «extern».
- Registriert: gema_auth (MODULES `goodel` cat Projektmanagement, FILE_MAP `pm_goodel`→`goodel` — vorher fälschlich auf `kostenkontrolle` gemappt; rw für Architekt/Unternehmer/Bauherrschaft/Monteur/Spengler/Magaziner, Planer via `_allPerms` + Permission-Backfill), gema_notify (2 Keys), index.html (`data-module="goodel"`), netlify.toml (`/api/goodel-share`), sw.js. Tests: `scripts/goodel_share_test.mjs` (24 Function-Fälle: Sanitize/Secret-Edit/Duplikat/Limits) + Playwright (40 Modul- und 15 Viewer-Checks).

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
- **Monteur-Flow («Meine Woche») mit 3 Unteransichten (Feedback 07/2026, `scripts/stunden_app_test.mjs` 39 Checks)**: Umschalter **Tag / Woche / Monat** (`_wkMode`; Handy ≤640px default Tag — App-Gefühl, Desktop Woche). **Tagesansicht**: ein Tag gross (‹ › + Heute), Karte **«📅 Geplante Einsätze»** aus dem Einsatzplan mit «＋ Zeit»-Direktübernahme (`stEinNeuVonEinsatz` → Eintrag-Modal mit vorgewähltem Einsatz), schlanke Wochen-Bilanz + Einreichen-Button. **Monats-Kalender** (`stRenderMonat`): 7×n-Grid mit erfassten Stunden (grün), Absenz-Icons, 📅-Einsatz-Marker, Status-Icons (📤/✅/↩), Monats-Summe; **Tap auf einen Tag → Tagesansicht dieses Tags** (`stKalPick`). Wochenansicht unverändert (Tages-Karten via geteiltem Renderer `stTagKarte`). Eintrag-Modal mit **Einsatzplan-Übernahme** (eigene Einsätze des Tages aus `gema_einsatz_pool_v1` → Objekt+Tätigkeit vorbefüllt), Spesen-Zeile pro Tag (🍽 Mittag auswärts, 🚗 km). **«📤 Woche einreichen»** sperrt die Tage (Status eingereicht) + `stunden_eingereicht` an role_planer+Org.
- **Stunden → Regierapport-Brücke (User-Entscheide 07/2026: Rapport PRO Zeiteintrag, Frage nach JEDEM neuen Eintrag mit Projekt, Material aus ERP-Auftrag sonst Offerte, Foto prominent ohne Zwang)**: Nach dem Speichern eines NEUEN Eintrags mit Projekt öffnet der Dialog **«Material gebraucht? Ja/Nein»** (`stRrStart`; «✕ Kein Rapport» überspringt — Zeiterfassung und Regierapport bleiben parallel eigenständig). Ja → Checkbox-Liste der Positionen aus dem **ERP-Auftrag des Projekts, sonst der ERP-Offerte** (`stRrMatQuelle` liest `gema_erp_dok_pool_v1`; Titel/Abzug/Akonto/Regie-Zeilen ausgelassen, dedupliziert; Menge editierbar, EP wandert unsichtbar mit für die spätere Ausweisung) + freie Zeilen; Beschrieb aus der Tätigkeit vorbefüllt; **📷-Foto-Button** (Kamera, Resize 1600px, `GemaStorage.uploadDataUrl('regierapport/<orgId>')`, Base64-Fallback; iOS-GC-Muster: File-Input im DOM). `stRrSave` erzeugt den Regierapport als **Entwurf im Regie-Pool** (ADD-ONLY `GemaSync.saveRecord('regierapport','regie:…')`, Nummernkreis R-NNN, `quelle:{typ:'stunden',eintragId}`, Stunden-Zeile mit Default-Kategorie aus `org.settings.regie.ansaetze`); der Zeiteintrag trägt `rapportId`/`rapportNr` → 📝✓-Button öffnet den Rapport (`pm_regierapport.html?rr=…`), 📝 ohne Verknüpfung startet den Dialog manuell (auch für Alt-Einträge). Bearbeiten eines Eintrags erhält die Rapport-Verknüpfung.
- **GAV-Parameter auch für Org-Admins**: `stCanSettings()` = `stCanApprove()` ODER `stIsOrgAdmin()` (User in `org.admins`) — Geschäftsführung ohne Planer-Rolle kann die Parameter pflegen (Button + Guards in `stOpenSettings`/`stSetSave`).
- **Regeln & Automatik (07/2026, alles org-einstellbar mit rückwärtskompatiblen Defaults; Node-Test `scripts/stunden_engine_test.mjs` 112 + Playwright `scripts/stunden_regeln_smoke_test.mjs` 85 Checks)**: (1) **km-Spesen ausblendbar** (`kmAktiv:false` → kein km-Feld in der Tageserfassung, keine km-Spalte in der Auswertung; Altwerte bleiben sichtbar/zählen weiter, CSV-Spalten bleiben stabil). (2) **Feiertags-Generator** im ⚙️-Modal: `stdOstern` (Gauss/Butcher) + `STD_FEIERTAG_DEFS` (14 CH-Feiertage, Checkbox-Auswahl kantonal, gespeichert als `feiertagAutoSel`, Default = NW-CH) → «＋ Feiertage einfügen» generiert `stdFeiertageJahr(jahr,ids)` dedupliziert in die Feiertagsliste. (3) **Absenz-Regeln pro Typ** (`absenzRegeln[typ] = {fuelltAuf, keineVorholzeit}`, Auflösung `stdAbsenzRegel` mit Defaults `STD_ABSENZ_REGEL_DEFAULTS`): `fuelltAuf` = Gutschrift füllt genau die Lücke zum Tagessoll (z.B. «halbtags krank + gearbeitet = nie mehr als Tagessoll»), `keineVorholzeit` = der Tag zählt höchstens bis zum Tagessoll (Kappung). **Neue Absenz-Typen `schule` (🎓 Berufsschule) + `uek` (ÜK)** starten mit BEIDEN Regeln aktiv — ob Lehrlinge an Schul-/ÜK-Tagen Vorholzeit schreiben dürfen, steuert die Org über das «keine Vorholzeit»-Häkchen; alle Alt-Typen starten OHNE Regeln (Bestandsschutz). (4) **`maxTagessoll`** (org-weit): an Werktagen zählt nie mehr als das Tagessoll — deaktiviert die Vorholzeit (stdParams nullt `vorholProWocheH`; stOpenSettings zeigt darum den ROH-Wert), Sa/So-Arbeit zählt weiter (zuschlagsrelevant). **Kappungs-Mechanik**: `stdTagAbzugH` (Soll-Gutschrift, regel-/stunden-aware) + `stdTagCapH` (Tages-Kappung) → `stdWochen-/stdMonatsAuswertung` liefern zusätzlich `istRoh`/`gekappt`; `ist` = angerechnete Zeit. Kappung wird in Σ Woche/Freigabe/PDF als «Über Tagessoll — nicht angerechnet» ausgewiesen, nie still verworfen. (5) **Auto-Kompensation** (`autoKompensation:true`): früher Feierabend → `stAutoKomp` ergänzt beim Eintrag-Speichern/-Löschen die Lücke bis zum Tagessoll als Absenz `{typ:'kompensation', stunden:gap, quelle:'auto'}` (stunden-basiert — `absenz.stunden` übersteuert überall anteil×Tagessoll, auch beim Topf-A-Jahresbezug) und führt sie nach bzw. entfernt sie; NUR an Werktagen mit ≥1 Zeiteintrag, manuelle Absenzen werden NIE angetastet — via «🌴 Absenz» auf z.B. Ferien änderbar (Speichern entfernt `quelle:'auto'` → Automatik dauerhaft übersteuert). (6) **Kontroll-Indikatoren** (`indikatoren:{maxH,maxPct,minH,minPct}`, 0 = aus): `stdIndikatoren` liefert Badges — über der Grenze rot ⚠, unter der Grenze amber ▼; angezeigt in der **Freigabe (alle)** und der «Σ Woche»-Karte des Mitarbeiters (nur rot — das Min-Kriterium wäre unter der Woche immer an). (7) **Ferienantrag → allgemeiner Absenz-Antrag**: `fa_typ`-Select (`FA_TYPEN`: ferien/kompensation/militaer/schule/uek + beantragbare eigene Typen; Krank/Unfall werden direkt erfasst), Record-Feld `absenzTyp` (Legacy ohne Feld = ferien), Genehmigung trägt Absenzen des Typs (`quelle:'antrag'`) + Einsatzplan-Eintrag (`FA_EP_TITEL`, typ bleibt `ferien`) automatisch ein — der Mitarbeiter muss nichts nachtragen; nur `absenzTyp==='ferien'`-Anträge belasten den Feriensaldo, Kompensations-Anträge zeigen in Vorschau/Freigabe den Topf-A-Saldo (`stTopfASaldo`). Eventkeys unverändert `ferien_antrag`/`ferien_entscheid`. (8) **Eigene Absenz-Typen (Admin)**: `eigeneAbsenzen[] = {id:'ea_<slug>', name, ic, fuelltAuf, keineVorholzeit, beantragbar, maxTageProJahr:null|Zahl, nurUserIds:null|[userId]}` — Editor in den ⚙️-Einstellungen (Icon/Name/Kriterien/👥-Personenauswahl pro Zeile; `nurUserIds` null = für alle, sonst nur für die angehakten Personen im Absenz-Modal/Antrag wählbar). Kriterien = dieselben Regel-Flags; `stdAbsenzRegel` liest sie direkt von der Definition. **Anzeige IMMER über den Resolver `stdAbsenzDef(p,typ)`** (Built-in → eigener Typ → 📌-Altdaten-Fallback) — alle Renderer (Tages-Karte, Monats-Kalender, Freigabe, Anträge, PDF) laufen darüber, gelöschte/eingeschränkte Typen bleiben in alten Tagen lesbar und IDs bleiben beim Speichern stabil (`stEaSlug` nur für neue Zeilen, Umlaute→ae/oe/ue). (9) **Einrichtungs-Assistent (Wizard)**: Das ⚙️-Modal ist in 10 `.set-sec`-Sektionen gegliedert (Arbeitszeit/Zuschläge/Spesen/Feiertage/Töpfe/Regeln/Eigene/Indikatoren/Mitarbeiter/Zusammenfassung); der Assistent (`stSetMode(true)`, Button «🧭 Assistent» im Footer) zeigt dieselben DOM-Felder Schritt für Schritt (Schritt-Leiste `#setWizBar` mit Fortschritts-Dots, Zurück/Weiter, «≡ Liste» zurück zur Vollansicht, letzter Schritt = live berechnete Zusammenfassung + Speichern) — EIN Formular, EIN `stSetSave`-Pfad, kein Feld-Duplikat. **Erst-Einrichtung** (Org ohne `settings.stunden`) startet automatisch im Assistenten. (10) **Jahres-Limits pro Absenz-Typ** (z.B. «Pflege Angehörige → 3 Tage/Jahr»): `maxTageProJahr` auf eigenen Typen bzw. `absenzRegeln[typ].maxTageProJahr` für Built-ins (Limit-Spalte in beiden Editoren; ferien/kompensation/brueckentag via `STD_ABSENZ_LIMIT_AUSGENOMMEN` ausgenommen — sie haben eigene Konten). Engine: `stdAbsenzLimit(p,typ)` + `stdAbsenzBezogen(tage,typ,jahr,p)` (½-Tage = 0.5, stunden-basierte Absenzen = stunden/Tagessoll). Verhalten: Das Absenz-Modal zeigt den Stand (bezogen/Rest) im Hint und STOPPT die Selbst-Erfassung über dem Limit (`stAbsSave`-Guard; Reduzieren/Umbuchen bleibt immer möglich); Antrags-Vorschau + Freigabe-Karte zeigen den Limit-Stand mit roter Warnung bei Überschreitung — die Genehmigung durch die PL bleibt möglich (PL entscheidet, wie beim Feriensaldo). (11) **Feedback 17.07.2026** (Playwright `scripts/stunden_feedback_test.mjs` 27 Checks): **Znüni bezahlt/unbezahlt** (`pauseBezahlt`, Default true = Bestandsschutz; false → `stdTagStunden(tag,p)` zieht `bezahltePauseMin` pro Arbeitstag mit ≥1 Eintrag automatisch ab — Tages-Badge «− X′ Znüni», `ein_pauseHint` erklärt beide Modi, Wizard-Zusammenfassung nennt den Zustand; alle stdTagStunden-Aufrufer übergeben p, ohne p Altverhalten). **Brückentage als `[{datum,name}]`** (stdParams migriert Altdaten-Strings; Zeilen-Editor `stBrueckRowHtml/stBrueckAdd` mit `type="date"` + Bezeichnungs-Textfeld statt Freitext-Textarea; `stdBrueckentag(p,datum)` liefert den Eintrag — Badge/Absenz-Default zeigen die Bezeichnung). **Betriebsferien-Editor** analog (`stBfRowHtml/stBfAdd`: Von/Bis-Datumsfelder + Bezeichnung; Save tauscht von>bis, verwirft Leerzeilen — Format `{von,bis,label}` unverändert). **Einheiten-Boxen `.inpu`** (Muster `.g-inp-group`) hinter allen freistehenden Zahlenfeldern des ⚙️-Modals (h/Woche, Min., Tage/Jahr, %, CHF/Tag, CHF/km, % vom Soll). **Eigene-Absenzen-Editor als Karten** (`.s-ea-row`/`.s-ea-opts`: Zeile 1 Icon+Name+✕, Zeile 2 BESCHRIFTETE Checkboxen «füllt bis Tagessoll / keine Vorholzeit / beantragbar» + Limit mit «Tage/Jahr» + 👥 — Klassennamen/`data-id` unverändert, Save-Collector + Tests laufen weiter). **Wizard-Bar einzeilig** (`.wt` ellipsis/nowrap, Dots `flex-wrap:nowrap`, ≤480px ohne Dots; `#setModal .modal` 720px). **Mitarbeiter-Ausschluss**: «Std»-Haken pro Zeile (`.s-mit-erf`) → `mitarbeiter[uid].ohneErfassung:true` für Kader ohne Stundenerfassung — Zeile gedimmt ans Listenende sortiert, Stammdaten bleiben erhalten (Auswertungs-Listen sind ohnehin datengetrieben, kein weiterer Filter nötig).
- **Freigabe (Planer/AL/Admin, `stCanApprove`)**: eingereichte Wochen gruppiert nach User+KW mit Tages-Detail und Zuschlags-/Spesen-Summen → **Genehmigen** oder **Zurückweisen mit Grund** (GemaDialog.prompt; Tage wieder editierbar, Grund als 💬-Badge beim Monteur) + `stunden_entscheid` an den Monteur (Deep-Link `?d=<wochenstart>`).
- **Auswertungen (4 Unteransichten, Segmented Control `_ausMode`; Approver sehen die ganze Org, Monteure nur sich; jede Sicht mit eigenem CSV — Builder `stCsv*Rows()` getrennt vom Download `stCsvDownload`, testbar)**: **📅 Monat** = bisherige Lohnbüro-Tabelle pro Mitarbeiter (Ist/Soll/Saldo/Üst/**Topf A/Topf B**/Sa/So/Nacht/Zuschlag-Zeitwert/Mittage/km/Spesen CHF + Status; CSV inkl. Töpfe + Jahres-Salden-Spalten; km-Spalte folgt `kmAktiv`; Ist-Spalte markiert Kappung mit `*`). **📈 Jahr** (`stRenderAusJahr`, Engine `stdJahresMonatswerte`) = Jahr-+Mitarbeiter-Select, KPI-Zeile, **Canvas-Balkendiagramm Ist vs. Soll** (`stAusJahrChartDraw`, literale Hex-Farben, Redraw-Hook am Ende von `stRender`), 12-Monats-Tabelle mit kumuliertem Saldo — **Monate ohne Erfassung zählen NICHT ins Soll** («— keine Erfassung —», kein Phantom-Minus vor Eintritt) — und darunter die Karte **«💰 Jahres-Salden»** (`stRenderJahresSalden`: Topf-A-Saldo, Topf B offen/ausbezahlt, Vorhol-Saldo, Ferien Anspruch/bezogen/Rest pro-rata, Krank-Tage + Auszahlungs-Button — von der Monat-Sicht hierher gezogen). **🌴 Absenzen** (`stRenderAusAbsenzen`, Engine `stdAbsenzTageProTyp`) = Matrix Mitarbeiter × Absenz-Typ in Tagen (½ = 0.5, stunden-basierte = stunden/Tagessoll; Spalten = genutzte + limitierte Typen inkl. eigener und Altdaten-Typen via Resolver), Typen mit Jahres-Limit zeigen «bezogen / max.» (rot = überschritten), Total-Zeile/-Spalte. **🏗 Projekte** (`stRenderAusProjekte`, Engine `stdProjektStunden`) = Stunden pro Objekt (Zeitraum Monat ⇄ Jahr) mit %-Balken und Mitarbeiter-Aufschlüsselung, Sammel-Zeile «Ohne Projekt»; kaufmännische Nachkalkulation bleibt im ERP («📈 Erfolg»).
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

## Revisionsunterlagen (pm_revisionsunterlagen.html)

Übergabedossier zum Projektabschluss — sammelt automatisch die Unterlagen aller im Projekt verbauten Produkte in eine anpassbare Kapitelstruktur, fordert fehlende beim Lieferanten an und exportiert als gebrandetes PDF bzw. per QR-Freigabe für die Bauherrschaft. Umsetzung nach `KONZEPT_Revisionsunterlagen.md` (Analyse zweier Kunden-Wartungsanleitungen). Kategorie Projektmanagement.

- **Produkt-Dokumente (Fundament, teils vorbestehend)**: `produkt.dokumente[]` in gema_produktkatalog_api.js. **Kanonische Typen `GemaProdukte.DOK_TYPEN` + `normDokTyp()`** (Alias-Map `DOK_TYP_ALIAS` für Altdaten `anleitung/montage/konformitaet/bild`; genutzt wie `normKatId`). Dok-Uploads laufen über `addDokument`/`removeDokument` (**NIE `updateProdukt`** — das würde die Verifizierung zurücksetzen) und nach GemaStorage (`produkte/<lieferantId>/doks`, Feld `dok.url`), Base64 nur Fallback ≤ 2.5 MB. Beide Pflege-UIs (sys_lieferant_dashboard «Dokumente & Datenblätter» mit Typ-Select + Revisions-Set-Zeile; sys_produktkatalog `DOC_TYPEN`-Gruppierung via `normDokTyp`) auf das Enum umgestellt.
- **Pools (moduleKey `revisionsunterlagen`)**: Dossier `revd:`→`gema_rev_pool_v1` (org-intern; Einträge tragen **nur Storage-URLs, nie Base64 im Record**) · Vorlagen `revv:`→`gema_rev_vorl_pool_v1` (org-intern) · Unterlagen-Anfragen `reva:`→`gema_rev_anfr_pool_v1` (**cross-org**, nur `saveRecord`, nie persistCollection — Muster GemaBest). Event `gema-revision-changed`; Boot-Muster Stale-while-revalidate (`_revCloudLoaded`).
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (Node-testbar, 24 Fälle grün): `REV_DEFAULT_VORLAGEN` (default_sanitaer/heizung/lueftung/allgemein — HLKS), `REV_WARTUNG_KATALOG` (A/B/C-Checklisten je Gewerk), `REV_TEXTBAUSTEINE` (TBDV/LMG/W3 + Abwesenheiten), `REV_PFLICHT_DOKTYPEN`, `REV_BW_LABELS`; Funktionen `revNeuesDossier`, `revDeckblattVorschlag`, `revProdukteSammeln` (5 Quellen, dedup produktId/Name), `revSammeln` (autoQuellen-Registry → Einträge, DOM-frei via ctx-Accessoren), `revMergeAddOnly` (ADD-ONLY: manuell/ausgeblendet unangetastet, Platzhalter `fehlend`→`ok` bei Doc-Eintreffen, entfallene Quelle markieren statt löschen), `revKapitelRenummerieren`, `revVollstaendigkeit`, `revTokenNeu` (48 hex), `revSanitizeForShare`.
- **Gewerk-Enum wiederverwendet** aus pm_abnahme (`AB_GEWERKE`: sanitaer/heizung/lueftung/elektro/spenglerei/allgemein). Ein Dossier pro Objekt+Gewerk. Kapitel: flache Zwei-Ebenen-Liste (`ebene 1|2`, `nr` generiert), Einträge diskriminiert über `typ` (dokument/produktdok/text/tabelle/verweis/platzhalter); `autoQuellen` je Kapitel steuert das Sammeln.
- **Sammel-Quellen** (`_buildSammelCtx`): Bestellungen (`GemaBest.getForOrg`), beantwortete Offertanfragen (`GemaProdukte.getOffertanfragen`), Vormerkungen, gewählte Anlagen (`gema_aw_chosen_<kat>__<objektId>` alle Phasen), Ausschreibungs-Positionen (`gema_aus_pool_v1`), Beteiligte, Berechnungs-Index, Abnahme-Blobs, Service-Anlagen. «↻ Aus GEMA aktualisieren» ist bewusste User-Aktion (kein Auto-Merge bei Events).
- **Anfrage-Workflow**: Vollständigkeits-Matrix (Produkte × Pflicht-Dok-Typen) → «anfordern» bündelt pro Lieferant+Produkt einen `reva:`-Record → Notify `revision_unterlagen_anfrage` (Empfänger via `user.lieferantId`, Fallback Lieferanten-Org). **Lieferanten-Dashboard-Tab «📑 Revisionsanfragen»** (`?tab=revision`, für Anlagen- UND Produktlieferant, Badge `revBadge`, cross-org bind): Upload lädt aufs **Produkt** (profitiert allen Projekten) bzw. bei freien Produkten an die Anfrage; «Erledigt/Ablehnen» → Notify `revision_unterlagen_erhalten` an den Anforderer; Platzhalter lösen sich beim nächsten «↻» auf.
- **Export/Freigabe**: `gema_revision_pdf.js`. **(1) `exportPrint`** (Struktur-PDF via window.print, Muster gema_schaden_pdf — Branding `org.settings.pdfFarben` + `org.logoVector||logo`, Kontrastschutz-Helfer dupliziert, @page-Margin-Boxen, Cover/TOC/Kapitel, Anhänge als klickbare Beilagen, optionaler Cover-QR). **(2) `exportKomplett(dossier,{onProgress})`** = EIN PDF inkl. **zusammengeführter Lieferanten-PDFs**: Struktur-Seiten via jsPDF+autotable (lazy CDN 2.5.1/3.8.2) → `output('arraybuffer')` → pdf-lib (lazy CDN 1.17.1) `copyPages` für PDF-Anhänge, `embedPng/Jpg` als Seite für Bilder; Fetch mit `/sb`-Proxy-Fallback für Storage-URLs, nicht-ladbare/verschlüsselte Anhänge landen auf einer «Nicht eingebettete Beilagen»-Hinweisseite, Seitennummern gestempelt, Blob-Download. Button «🧩 Komplett-PDF» mit Fortschritts-Dialog; ohne Internet (CDN) klare Fehlermeldung + Rückfall auf «📄 PDF». **Freigabe/QR**: `dossier.freigabe.token` (48 hex) → öffentlicher Viewer `sys_revision_ansicht.html?t=<token>` (**KEIN gema_auth.js/gema_sync — NICHT in FILE_MAP/sw.js**) über `netlify/functions/rev-share.js` (Service-Key, ENV `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`; findet das Dossier via `payload->data->freigabe->>token`, sanitisiert serverseitig: kein Token/keine userIds/keine dataUrl/keine ausgeblendeten Einträge, lädt Org-Branding nach). Token erneuerbar/widerrufbar; «Übergabe vermerken» → Status `uebergeben`.
- **Trigger**: pm_objekte Statuswechsel → `abgeschlossen` (`_objRevisionAbschluss`) fragt per GemaDialog nach Dossier-Erstellung + pusht `revision_projektabschluss` (role_planer + Org); pm_ausschreibungsunterlagen Hinweis-Karten `_revHintKarte` (Gewinner in `idet`) + Planer-Karte in `pvga` nach Vergabe.
- Rechte: `GemaAuth.can('write','revisionsunterlagen')` — Planer/Admin/Abteilungsleiter via `_allPerms`, `role_unternehmer` r/w, `role_bauherrschaft`/`role_architekt` read. Registriert: gema_auth (MODULES `revisionsunterlagen`, FILE_MAP `pm_revisionsunterlagen`), gema_notify (4 Keys), index.html (PM, 17 Module), sw.js (v232), gema_recent. Test-Hooks `window._revHooks`.

## Behörden & Formulare (pm_behoerden_formulare.html)

Behörden-/Amtsformulare (PDF) einmal zentral erfassen und pro Projekt ausfüllen. **Vorlagen-Pool + Instanz pro Objekt** (User-Entscheid): ein Formular wird beim Erfassen KI-analysiert und landet objektunabhängig im **Pool** (wiederverwendbar). Für ein konkretes Projekt erzeugt «Für Projekt ausfüllen» eine **Instanz** (kopiert das Feld-Schema, befüllt Objekt-/Beteiligtendaten). **Split-Ansicht**: links das vorbefüllte Original-PDF (interaktiv), rechts die Zuordnungsliste. Kategorie Projektmanagement.

- **Pools (moduleKey `behoerden_formulare`)**: **Pool-Definitionen** `bformdef:`→`gema_bformdef_pool_v1` (objektunabhängig, wiederverwendbar: `{id,orgId,name,behoerde,sourceUrl,pdf:{name,url,dataUrl},acro,felder:[{id,name,label,typ,options,gemaMap,zuordnung}],sourceHash/Changed/…}`) · **Objekt-Instanzen** `bform:`→`gema_bform_pool_v1` (`{…,defId,objektId,objektName,titel,status,felder:[{…,wert,manuell}]}`) · Büro-Vorlagen `bformv:`→`gema_bform_vorl_pool_v1`. Alle Blanko-PDFs tragen nur die Storage-URL, Base64 nur Fallback ≤ 2.5 MB. `getDefs()`=Pool (orgId), `getInstances()`=ausgefüllte (orgId+objektId). Event `gema-bform-changed`; Boot Stale-while-revalidate (`_cloudLoaded`, zwei `bindCollection`). Einzel-Saves via `GemaSync.saveRecord`.
- **Zuordnungsfeld-Flag `zuordnung` (KRITISCH)**: `bfMergeFields` setzt `zuordnung:!!ai.gemaMap` — nur Felder, denen die KI eine GEMA-Quelle vorgeschlagen hat (Beteiligten-/Objektbezug), erscheinen **rechts** in der Zuordnungsliste (`bfZuordnungsFelder`). Übrige Felder (interne Behörden-Kürzel etc.) werden **links direkt im PDF** ausgefüllt, tauchen rechts nicht auf. `bfVollstaendigkeit` zählt NUR Zuordnungsfelder. Ein Feld ist im Detail per «⇄ als Zuordnungsfeld» / «✕ aus Zuordnung» beidseitig umschaltbar (`fieldZuordnung`).
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (Node-testbar, 39 Fälle grün): `BF_SOURCES` (gemaMap-Katalog gruppiert Objekt/Bauherr/Architekt/Planer/Unternehmer/Eigene Firma/Sonstiges) + `BF_ROLLE_MAP` (gemaMap-Präfix → Beteiligten-Rolle); `bfResolveMap(key,ctx)` löst einen gemaMap-Schlüssel gegen `{objekt,beteiligte,org,user,heute}` auf (Beteiligte via Rollen-Match, org.telefon/email aus `org.settings.erp`); `bfAutoFill(felder,ctx)` (nur nicht-manuelle Felder, überschreibt nie mit leerem Resolve); `bfMergeFields(acroFields,aiFelder)` (AcroForm-Feldname+Typ+Options sind autoritativ, Label+gemaMap+zuordnung von der KI per Namensmatch; flaches PDF = nur KI-Felder); `bfZuordnungsFelder`, `bfVollstaendigkeit`, `bfMapLabel`.
- **Split-View (Detail)**: `renderLeft()` rendert das PDF via **pdf.js** (lazy CDN) Seite für Seite auf Canvas und legt pro AcroForm-Widget (`getAnnotations` → `convertToViewportRectangle`) ein interaktives Overlay (`_bindOverlay`) — Textfelder als `<input>`, **Checkboxen klickbar** (toggeln `_truthy`), Dropdowns als `<select>`; Eingaben setzen `manuell:true` und spiegeln nach rechts (`_syncRight`). `renderRight()` zeigt nur die Zuordnungsfelder (gemaMap-Select + Wert-Input). **Bidirektionale Umrahmung**: `selField(id,from)` → `_frameLeft`/`_frameRight` (`.hi`-Klasse + `scrollIntoView`) — Klick links umrahmt+scrollt rechts und umgekehrt. **Fallback**: schlägt pdf.js fehl (offline/kein AcroForm), rendert `leftFallback()` alle Felder als editierbare Liste (Umrahmung/Toggle bleiben funktionsfähig).
- **KI-Feldanalyse**: `netlify/functions/claude-formfields.js` (erzwungenes Tool-Use `formular_analysieren`, Modell `claude-haiku-4-5` per Env übersteuerbar) → `{behoerde, felder:[{name,label,typ,gemaMap}]}`. `gemaMap` ist auf die erlaubten `GEMA_KEYS` enum-beschränkt. Client `GemaClaude.analyzeForm({fileBase64?,mediaType?,filename?,fieldNames?,text?})`. Bevorzugt werden die clientseitig via **pdf-lib** (`bfReadAcro`) gelesenen AcroForm-Feldnamen mitgeschickt (genauer + billiger); flaches PDF → KI liest die sichtbaren Beschriftungen. Ohne KI (offline/nicht deployed) werden AcroForm-Felder trotzdem ohne Zuordnung angelegt.
- **Ausfüllen/Export** (nur Instanz): AcroForm-PDFs werden mit **pdf-lib** direkt befüllt (`bfFillPdf`: `getTextField/getCheckBox/getDropdown/getRadioGroup`, `updateFieldAppearances`, Blob-Download) → offizielles Behörden-PDF. Immer verfügbar: «📄 Datenblatt» (gebrandetes Print-Fenster mit Label/Wert-Tabelle) als Fallback für flache/gescannte PDFs. Original-PDF-Bytes via `_origBytes` (Storage-URL mit `/sb`-Proxy-Fallback bzw. dataUrl). «↻ Aus Projekt neu befüllen» wendet alle gemaMaps auf nicht-manuelle Felder an.
- **Watcher (auf der Pool-Definition)**: `sourceUrl` pro Definition. `netlify/functions/form-watch.js` (GET `?url=` → SHA-256-Hash + ETag/Last-Modified/Size, server-seitig gegen CORS, SSRF-Guard blockt interne Hosts). Detail-Sektion der Definition «🔎 Prüfen» bzw. Liste «🔎 Alle prüfen»: setzt beim ersten Mal die Baseline (`sourceHash`), danach `sourceChanged=true` bei Abweichung + Notify `behoerde_formular_geaendert` an `role_admin` (Deep-Link `?d=<defId>`). **Automatik**: geplante Function `form-watch-cron.js` (`[functions."form-watch-cron"] schedule="@daily"` in netlify.toml, Service-Key) prüft täglich ALLE `bformdef:`-URLs server-seitig, markiert geänderte Records und schreibt die Admin-Notifikation direkt als `notif:`-Row (auch ohne dass jemand das Modul öffnet). Ohne Service-Key = No-Op.
- **Deep-Links**: `?d=<defId>` öffnet eine Pool-Definition (Watcher/Zuordnung), `?f=<instanzId>` eine ausgefüllte Instanz.
- Rechte: `GemaAuth.can('write','behoerden_formulare')` — Planer/Admin/Abteilungsleiter via `_allPerms`, `role_architekt` r/w (Baugesuche). Registriert: gema_auth (MODULES `behoerden_formulare`, FILE_MAP `pm_behoerden_formulare`), gema_notify (`behoerde_formular_geaendert`), index.html (PM, 18 Module), sw.js (v234), gema_recent, netlify.toml (Redirects `/api/claude-formfields`, `/api/form-watch` + Cron-Schedule). ENV: `ANTHROPIC_API_KEY` (KI), `SUPABASE_SERVICE_KEY` (Cron). Test-Hooks `window._bfHooks`. Nutzt die CDN-Dependencies pdf-lib 1.17.1 + pdf.js 3.11.174 (lazy).

## Pläne & Flächen (pm_plaene.html)

Pläne einlesen nach `KONZEPT_Plaene.md`: Grundriss-/Schnitt-PDFs hochladen → strukturierte Flächenauswertung pro Geschoss/Raum (Netto beheizt/unbeheizt, BGF, EBF SIA 416/1, Gebäudehülle, Dämmfläche). **Kernprinzip: Die KI liefert NUR Semantik + Seed-Punkte (Raumlabels, Bemassungen, Geschosshöhen) — die Geometrie entsteht deterministisch im Browser** (Flood-Fill → Moore-Kontur → Douglas-Peucker → Orthogonalisieren → Shoelace). Nichts fliesst ohne Freigabe in Summen (erkannt → geprüft → freigegeben). Kategorie Projektmanagement.

- **Storage (bewusste Abweichung vom Konzept, dokumentiert)**: per-Record via GemaSync (moduleKey `plaene`) statt der SQL-Tabellen des Konzepts — Projekt `plnprj:`→`gema_pln_prj_pool_v1` (`{bezeichnung, dokumente:[{id,name,url,seiten}], geschosshoehen:[{geschossIndex,bezeichnung,lichteM,konstruktionM,quelle}], dachneigung, dachform, fensterM2, tuerenM2, ebfFaktor}`) · Seite `plnseite:`→`gema_pln_seiten_pool_v1` (`{projektId, dokumentId, dateiname, url, seitennummer, plantyp, geschoss, geschossIndex, massstab, mmProPixel, kalibQuelle, kalibBestaetigt, renderW/H, flaechen:[…], analyse, lokal}`). Flächen sind IN der Seite eingebettet (`{raumNummer, raumName, kategorie beheizt|unbeheizt|aussen|kontur, nutzung, polygon[[x,y]…] in Canvas-px, seed, angeschrieben, flaecheM2, umfangM, quelle ki|gemessen, konfidenz, status erkannt|geprueft|freigegeben, warn ok|pruefen|fehler}`). PDF → `GemaStorage.uploadDataUrl` Pfad `plaene/<orgId>` (Fallback: nur Session-lokal mit Hinweis, Flächen bleiben). **In-Memory-Arbeitskopie `_plMem` (KRITISCH)**: `plCached()` memoisiert die geparsten Pool-Arrays — `plFl()`/`plSeite()` geben Objekte derselben Instanz zurück, Mutation + `plSaveSeite()` arbeiten darauf (ohne Memo verlor jeder frische JSON-Parse die Änderungen); Boot leert `_plMem` nach dem Cloud-Pull — dabei legt `_plPreBootApply()` das **PreBoot-Journal** (`_plPreBoot`: alle `plSaveRec`/`plDelRec` bis Boot-Ende) wieder über den frischen Cache. Ohne das Journal verschwanden Projekt+Seiten still, wenn der User im Boot-Fenster (laufender `bindCollection`-GET) ein Projekt anlegte und sofort einen Plan hochlud: der Cloud-Snapshot war älter als diese Writes und überschrieb den Cache («Plan wurde nicht importiert»-Bug). Der Boot überschreibt zudem NIE eine bereits gesetzte `PL.projektId` (Auto-Wahl/`?p=` nur bei leerer Wahl) und navigiert nicht von einer offenen Seite weg; `plUploadOne` hat einen Null-Guard auf `plPrj()` (klare Meldung statt TypeError).
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (DOM-frei, Node-Test 67 grün): `plShoelace`/`plPerimeter`/`plPointInPoly`, `plDP` (Douglas-Peucker), `plOrtho` (Kanten ±5° achsparallel ausrichten), `plBinarize` (Schwellwert 150), `plDilate` + **`plErode`** (Rand zählt als Wand) — zusammen **morphologisches Closing**: Türlücken bis knapp 2× «Türschluss» (UI-Feld, max. 40 px — echte Türöffnungen ohne Türblatt sind am 1500-px-Bitmap ~60 px) werden geschlossen, die Wandstärke und damit die Raumfläche bleiben unverfälscht (nur-Dilate hätte die Fläche um Umfang×r verkleinert) · `plFlood` (Scanline, meldet `leck` bei Randberührung), `plContour` (Moore), `plSanity` (Abweichung zur angeschriebenen Fläche > 5 % → `pruefen` gelb, > 25 % ODER > 60 % der Seitenfläche → `fehler` rot, kein Wert), `plMedian` · **`plProj`/`plSnap`** (Vektor-Snapping) · **`plFensterMass`/`plFensterSummen`** (§8, s.u.) · **CAD**: `plBezierPts`, `plThin`, `plSkelPolylines`, `plOrthoOpen`, `plDxf` (siehe «CAD-Export»).
- **Viewer**: pdf.js (lazy cdnjs 3.11.174) rendert die Seite auf `#plCanvas` (2600 px längste Kante, `renderW/H` fixiert — alle Polygon-Koordinaten sind Canvas-px), SVG-Overlay teilt die Transformation (ein `#plStage`-translate/scale). Werkzeuge: 🖐 Auswahl/Pan (Polygon wählen, Vertices ziehen, Alt-Klick löscht Ecke, Doppelklick auf Kante fügt Ecke ein, Delete löscht Fläche), ✏️ Zeichnen (Klicks = Ecken, Doppelklick/Enter schliesst), 🪄 Füllen (Klick in Raum → `plFloodPolygon` auf max-1500-px-Graustufen-Bitmap, Cache `PL.bmp` pro Dilate-Wert), 🪟 Fenster (zwei Klicks = Öffnungs-Endpunkte), 📏 Kalibrieren (zwei Punkte + bekannte Distanz). PDF-Ladefehler (offline) → Fehlerbild, aber Sidebar rendert die gespeicherten Flächen trotzdem (`plAllRender` im catch).
- **Vektor-Snapping (Phase 5, nur Vektor-PDFs)**: `plExtractVecSegs(page,viewport)` liest nach dem Render die pdf.js-Operator-Liste (`constructPath`-Mini-Ops moveTo/lineTo/rectangle, Kurven nur als Endpunkt; `save`/`restore`/`transform`-Stack auf `viewport.transform`, unbekannter Mini-Op bricht den Pfad ab) → Liniensegmente in Canvas-px (Cap 30'000, < 1.5 px verworfen). **≥ 40 Segmente ⇒ Vektorplan** (`PL.vecSegs`, ⌖-Badge in der Plan-Karte; Scans bleiben null — Snapping entfällt ersatzlos). `plFloodPolygon` snappt danach automatisch (Toleranz 3 Bitmap-px), pro Fläche gibt es «⌖ Einrasten» (`plFlSnapVec`, Toleranz 6). Nur Session-Memory, nie persistiert. E2E-validiert gegen echtes pdf.js: Ecken < 0.75 px auf den PDF-Linien.
- **Fenster & Aussentüren (Konzept §8)**: `s.fenster[] = {id, p1, p2 (Canvas-px), typ fenster|tuer, hoeheM (Override), status erkannt|freigegeben, quelle ki|manuell, nutzung}` — aus der KI-Analyse (Grundriss-Pass liefert `fenster:[{p1,p2,typ,nutzung}]` normalisiert, Dedupe über Endpunkt-Nähe) ODER manuell (🪟-Werkzeug). **Breite über die Seiten-Kalibrierung**, Höhe: Override am Fenster → Projekt-Default (`p.fensterHoeheM`/`p.tuerHoeheM` + `…Quelle` — der Schnitt-Pass liefert optional `fenster_hoehe_m`, manuelle Eingabe wird nie überschrieben) → **Annahme 1.40 m / Tür 2.10 m, immer mit ⚠ geflaggt**. Eigene Sidebar-Karte «🪟 Fenster & Aussentüren» (Typ/Höhe/Freigeben/Löschen pro Eintrag, Standardhöhen-Felder mit Quellen-Badge); SVG zeichnet die Öffnungen als Linien mit Breiten-Label. **Nur freigegebene zählen**; in der Hülle gilt: manueller Override (`p.fensterM2`/`tuerenM2` > 0) gewinnt, sonst Auto-Summe `plFensterSummen` (Quelle + ⚠-Annahme werden in der Dämmflächen-Zeile ausgewiesen; nicht kalibrierte Seiten und offene Einträge als Warnhinweis).
- **Kalibrierung (Pflicht, kein stiller Default)**: ohne `kalibBestaetigt` sind alle `flaecheM2` null und die Auswertung gesperrt. Quellen: manuell (Zwei-Punkt) oder KI-Bemassungsketten (Median der konsistenten Kandidaten, Ausreisser > 10 % verworfen) — IMMER mit Bestätigungs-Dialog (`plCalibConfirm`, zeigt mm/px + Kontrollrechnung). Reset via `plKalibReset`.
- **KI-Analyse (`netlify/functions/claude-plan.js`, Redirect `/api/claude-plan`)**: erzwungenes Tool-Use, **zwei Modi** — `grundriss` (Pass 1: plantyp, geschoss/-index, massstab, `bemassungen:[{wert_mm,p1,p2}]` normalisiert 0..1, `raeume:[{nummer,name,angeschriebene_flaeche_m2,label_position,typ,nutzung,konfidenz}]`, `fenster:[{p1,p2,typ,nutzung}]` — Öffnungen in Aussenwänden) und `schnitt` (Pass 3: `geschosse:[{bezeichnung,geschoss_index,lichte_hoehe_m,konstruktionsstaerke_m}]`, dachneigung_grad, dachform, kniestock_m, `fenster_hoehe_m`). Modell Default `claude-sonnet-5` (Plan-Lesen ist anspruchsvolle Vision; wenige, gecachte Aufrufe), Env `ANTHROPIC_PLAN_MODEL`. Client `GemaClaude.analyzePlan({imageBase64,mediaType,text,modus})` — Canvas wird auf 1568 px skaliert (JPEG 0.85), PDF-Textlayer als Kontext mitgegeben. `plApplyGrundriss` legt NUR Seeds + Fenster-Linien an (Duplikat-Schutz über Raumnummer/Name bzw. Endpunkt-Nähe), Kalibriervorschlag aus Bemassungen; `plApplySchnitt` schreibt Geschosshöhen + Fensterhöhe ins Projekt (Match über bezeichnung/geschoss_index). **Ergebnis idempotent gecacht** (`s.analyse`) — «Neu analysieren» nur nach Confirm; «🪄 Polygone aus Seeds» füllt alle offenen Seeds. Ohne Function/Key: klare Meldung, Modul läuft manuell weiter.
- **Anonymisierung vor dem KI-Aufruf (KRITISCH, Datenschutz)**: Kundennamen/-adressen verlassen GEMA nicht. `plAnalyzeRun` baut einen `GemaClaude.createRedactor([prj.bezeichnung])` — passende Stellen werden **im Planbild geschwärzt** (schwarze Rechtecke über die pdf.js-Textitem-Positionen `PL.textItems`, in `plOpenSeite` mit Canvas-Koordinaten erfasst) und **im Textlayer durch `[NAME_n]`/`[ADRESSE_n]` ersetzt**; die KI-Antwort wird via `restore()` wieder mit den echten Werten befüllt (VOR dem Cachen in `s.analyse`; `res._anonymisiert` = Zähler, wird im Ergebnis-Dialog als «🔒 N Kundenangaben anonymisiert» ausgewiesen). Reine Zahlen/Masse werden NIE geschwärzt (Bemassungen sind Analyse-Input); Grenze: gescannte Pläne ohne Text-Ebene können im Bild nicht selektiv geschwärzt werden (best-effort, dokumentiert).
- **Auswertung (nur freigegebene Flächen)**: Σ beheizt/unbeheizt/Aussenräume netto · BGF aus Kategorie `kontur` (Aussenkontur pro Geschoss) · **EBF** = BGF beheizter Geschosse, Fallback Netto × `ebfFaktor` (Default 1.2, klar als ⚠ Annahme markiert) · **Hülle**: Fassade = Σ Kontur-Umfang × Geschosshöhe (lichte + Konstruktion, aus Schnitt-Analyse oder manueller Tabelle — fehlende Höhen werden benannt), Dach = BGF oberstes Geschoss / cos(Neigung), Boden = BGF unterstes Geschoss, **Dämmfläche** = Fassade + Dach + Boden − Fenster − Türen (automatisch aus den erfassten Öffnungen, manueller Override gewinnt — siehe «Fenster & Aussentüren»). Export CSV (Excel, Semikolon+BOM) + JSON via überschreibbarem `plDownload`.
- **CAD-Export (📐 DXF, `plCadOpen`/`plCadRun`/`plCadBuild`)**: PDF/Scan → CAD. **Bewusst DXF statt DWG** (DWG = geschlossenes Autodesk-Format, im Browser nicht zuverlässig schreibbar; DXF R12 ASCII öffnet in jedem CAD und wird dort per «Speichern als» zu DWG — der Hinweis steht im Modal). Zwei Pfade: **Vektor-PDF** = `PL.vecSegs` 1:1 als LINEs (nahezu verlustfrei; `plExtractVecSegs` tesselliert Bezier-Kurven mit 12 Segmenten — verbessert auch das Snapping) · **Scan/Raster** = Mittellinien-Vektorisierung `plBinarize` → **`plThin`** (Zhang-Suen-Skelett) → **`plSkelPolylines`** (Pfadverfolgung; Diagonalnachbarn zählen NUR ohne orthogonalen Umweg — sonst erzeugt jede L-Ecke eine künstliche Verzweigung) → `plDP` → optional `plOrthoOpen` (Achsen ±2.5°) + Mindestlängen-Filter (Default 150 mm, filtert Scan-Rauschen); OCR-Textboxen (`PL.textItems`) werden vor der Skelettierung maskiert und stattdessen als TEXT-Entities exportiert. **Einheiten**: mit Kalibrierung Millimeter, Modell 1:1 (`$INSUNITS=4`); ohne → Pixel mit ⚠. **Layer**: PLAN, TEXT, GEMA_RAEUME/GEMA_KONTUR (geschlossene Polylinien + m²-Label auf GEMA_TEXT, 200 mm Schrift), GEMA_FENSTER/GEMA_TUEREN. Writer **`plDxf(build)`** in der Engine (HEADER/TABLES-LAYER/ENTITIES: LINE, POLYLINE+VERTEX+SEQEND, TEXT; CRLF, EXTMIN/EXTMAX). E2E-verifiziert: Vektor-Wandkante < 1.5 mm exakt, Raumfläche aus dem DXF zurückgerechnet 51.5 m², Scan-Mittellinien ± ~5 mm an den Wandachsen.
- Rechte: Planer/Admin/Abteilungsleiter via `_allPerms`, `role_architekt` r/w (`plaene`). Registriert: gema_auth (MODULES `plaene` cat Projektmanagement, FILE_MAP `pm_plaene`), index.html (PM, 19 Module), sw.js (v241), gema_recent, netlify.toml. KEIN GemaNotify-Event (org-intern). Boot-Guard: `plPrjSel` fehlt (Kein-Zugriff-Body) → Init bricht ab. Tests: Node-Engine 67 + Redactor-Unit 26 (Anonymisierung inkl. Negativfälle: Bemassungen/«Bad»/«1:50» nie geschwärzt) + Playwright-Smoke 51 (Seeding, Summen/EBF/Hülle exakt, Freigabe, Sanity-Ampel, KI-Apply gemockt inkl. Fenster, Override-Logik, Snap, Anonymisierungs-Roundtrip mit Payload-Prüfung, CSV, Zugriff Admin/Architekt/Monteur, index-Kachel) + Fill-E2E 7 (synthetischer Grundriss auf Canvas: Closing schliesst 18-px-Tür, Fläche px-genau, Türleck → 60-%-Guard) + Vektor-E2E 8 (echtes pdf.js lokal, synthetisches Vektor-PDF mit Doppellinien-Wänden + Türblatt: Upload → Render → Segment-Extraktion < 1 px → Fill 51.5 m² exakt → Snap < 0.75 px) + CAD-E2E 12 (Vektor-DXF: Wandkante mm-exakt, Raumfläche aus DXF 51.5 m², Fenster-Layer; Scan-DXF: Wand-Mittellinien ±5 mm, Achsen-Ausrichtung, DXF-Struktur).

## Plandialog (pm_planablage.html)

Plan-/Dokumentenablage mit PDF-Markierungen (Acrobat-Stil) und Pendenzenliste — Austauschort für Architekt/Unternehmer/Monteur/Projektleiter. **Heisst im UI «Plandialog»** (User-Vorgabe 07/2026 — Modul-Key/Dateiname bleiben `planablage`/`pm_planablage`, Muster Hygienemanagement). moduleKey `planablage`, cat Projektmanagement (Kachel index.html «20 Module»).

- **Pools (moduleKey `planablage`, PreBoot-Journal-Muster wie if_arbeitskleider)**: Dokument `pabd:`→`gema_pab_dok_pool_v1` (`{id, orgId, objektId/objektName, name, kategorie plan|dokument|foto|sonstiges, datei:{name,url,size,mime}, freigaben:[{email,recht:'lesen'|'bearbeiten'}], kommentare:[{von,text,am}], hochgeladenVon/-Am}`) · Annotationen `paba:`→`gema_pab_annot_pool_v1` (**ein Record pro Dokument**, `{id:<dokId>, orgId, seiten:{'<seitenNr>':[shapes]}, aktualisiertAm}`) · Pendenz `pabp:`→`gema_pab_pend_pool_v1` (`{id, orgId, status offen|erledigt|geprueft, titel, beschrieb, objektId, dokId, seite, pin:{x,y}, prioritaet hoch|mittel|niedrig, fotos[], zustaendig:{userId,name,email}, kommentare[], erstelltVon/-Am, erledigtVon/-Am}`). Alle Writes NUR `GemaSync.saveRecord` (Freigaben/Pendenzen sind cross-org).
- **Binär-Upload direkt nach Supabase Storage** (`pabUploadBinary`): XHR-POST auf `SB_URL/storage/v1/object/gema-fotos/planablage/<orgId>/…` (Authorization Bearer Token, `x-upsert`, echter Binary-Body — KEIN Base64, darum auch grosse Pläne/DWG/ZIP) mit Upload-Fortschrittsbalken; Record trägt nur die public-URL. HTTP 413/»exceeded«-Antwort → Dialog «Datei zu gross» mit Supabase-Hinweis. **Supabase-Limits (Stand 07/2026)**: Free-Plan max. 50 MB pro Datei (Dashboard-Default) und 1 GB Storage total; Pro-Plan 100 GB inkl., per-Datei-Limit im Dashboard bis 50 GB erhöhbar — der Hinweis steht auch im Upload-Modal.
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (DOM-frei, Node-Test 57 Fälle): `pabNormMail` · `pabKannLesen(dok,user,modulRead)` (eigene Org+read ODER E-Mail in `freigaben` — Match auch über `username`) · `pabKannBearbeiten(dok,user,modulWrite)` (eigene Org+write ODER Freigabe `recht:'bearbeiten'`; «lesen»-Freigabe darf NICHT markieren) · `pabPendUebergang(status,aktion)` (offen —erledigen→ erledigt —pruefen→ geprueft; zurueckweisen ← erledigt/geprueft → offen; ungültig = null, Muster GemaBest) · `pabFmtSize` · **Gewerk-Layer**: `PAB_LAYER` (7 feste Layer sanitaer/heizung/lueftung/klima/elektro/spenglerei/allgemein; Standardfarben User-Vorgabe: Sanitär grün, Heizung rot, Lüftung blau, Klima violett, Elektro amber, Allgemein grau, Spenglerei cyan), `pabLayerById` (Fallback allgemein — Altdaten ohne `layer`-Feld), `pabGewerkVonText` (Org-Kategorie/Beteiligten-Rolle → Layer), `pabLayerSicht(dok,user)` (null = alle [Eigentümer-Org/«alle»-Freigabe] | Array erlaubter Layer — Default eigenes Gewerk + Allgemein, eigenes Gewerk IMMER enthalten), `pabShapeFarbe(shape,mehrereLayer)`.
- **Gewerk-Layer (User-Entscheid 07/2026)**: Jede Markierung + Pendenz liegt auf einem Gewerk-Layer (`s.layer`/`p.layer`, Altdaten = allgemein). Zeichen-Layer: eigene Org wählt per Select in der Viewer-Toolbar (Default aus der Org-Kategorie via `myGewerk()`), Externe zeichnen fix auf ihrem Freigabe-Gewerk. **Farbregel**: Farbe bleibt frei wählbar — sind aber MEHRERE Layer gleichzeitig sichtbar (`_pvMulti` = >1 Layer mit Shapes auf der Seite), wechselt die Darstellung auf die Gewerkfarbe (Zuordnung erkennbar). **🗂-Layer-Panel** (alle Rollen): pro erlaubtem Layer ein-/ausblenden mit Zähler; **👁-Master-Toggle** (alle Rollen, auch nur-Lesen): blendet ALLE Markierungen + Pins aus (sauberer Plan). **KRITISCH — Render-Filter, nie Load-Filter**: `PV.shapes` lädt IMMER alle Layer, gefiltert wird nur beim Zeichnen (`drawShapes`/`pinsSvg` via `layerSichtbar`) — sonst löschte der Autosave eines Externen die für ihn unsichtbaren Layer aus dem `paba:`-Record (Smoke-Test deckt das ab). Externe selektieren/löschen nur EIGENE Shapes (Guard in onDown + `pabDelSel`).
- **PDF-Viewer + Markierungen**: Vollbild-Viewer (pdf.js 3.11.174 lazy von cdnjs, Canvas + SVG-Overlay teilen die Transformation). 8 Werkzeuge: 🖐 Auswahl, ➜ Pfeil (gefüllte Spitze), ▭ Rechteck, ◯ Kreis/Ellipse, T Text (weisser Halo), ✏️ Freihand, 💬 Callout (Textbox mit Pfeil auf die geklickte Stelle), 📍 Pendenz-Pin; 5 Farben. **Shapes sind auf die Seitengrösse normiert (0..1)** — zoom-/geräteunabhängig; jede Form trägt `von.userId` (Undo entfernt das letzte EIGENE Shape, Auswahl+Delete via Hand-Werkzeug). Autosave debounced 900 ms in den `paba:`-Record (Statuschip «✓ gespeichert»). Ohne pdf.js/offline: Fehlerbild im Canvas, Download-Link bleibt. Nicht-PDFs haben keinen Viewer (nur Download).
- **Freigaben pro Beteiligtem (cross-org, E-Mail-Match — Regierapport-Muster)**: Modal listet die Objekt-Beteiligten (aus `gema_betpool_v1`) + freie E-Mail-Adressen; pro Person Recht «kein Zugriff / 👁 lesen / ✏️ bearbeiten» + **Gewerk** (ihr Zeichen-Layer, Vorschlag aus Rolle/Firma via `pabGewerkVonText`) + **Layer-Sicht** («Eigenes + Allgemein» Default / «Alle Layer» [Architekt/Bauleitung] / «Auswahl …» mit Gewerk-Chips → `f.layers = 'alle' | [ids]`, Default-Feld fehlt). Sichtbarkeit: eigene Org via Modul-Permission (sieht IMMER alle Layer), Externe via `freigaben`-E-Mail (Login-E-Mail bzw. username). Neu Freigegebene mit GEMA-Konto erhalten `plan_dokument_freigegeben` (Deep-Link `?d=<dokId>`). Kommentare am Dokument stehen allen Lesern offen.
- **Pendenzenliste (ergänzend zum SIA-Abnahmeprotokoll)**: Pendenz mit Titel/Beschrieb/Priorität/**Gewerk-Layer**/Fotos (resize 1600px JPEG → GemaStorage `planablage/<orgId>/pendenzen`, Base64-Fallback)/Zuständig (Org-User-Select ODER externe E-Mail) und **Plan-Pin**: im Viewer Werkzeug 📍 → Klick auf die Stelle → Pendenz-Modal mit vorbelegtem `{dokId, seite, pin, layer}`. Pins erscheinen nummeriert im Overlay (rot=offen, amber=erledigt, grün=geprüft; Klick auf Pin → Erledigen-Dialog), gefiltert nach Layer-Sichtbarkeit. **Externe sehen über den Plan-Bezug nur Pendenzen ihrer freigegebenen Layer** (der Elektriker sieht Sanitär-Pendenzen NICHT); ihnen zugewiesene oder von ihnen erfasste Pendenzen bleiben IMMER sichtbar. **Statusmaschine im UI**: «✓ Erledigt» steht JEDEM eingeloggten Leser offen (Monteur arbeitet ab, wird als `erledigtVon` gestempelt), «✔ Geprüft»/«↺ Zurückweisen» (Prompt-Grund als Kommentar) nur Verwaltenden (write + eigene Org — Guard in `pabPendAktion` VOR der Statusmaschine). Notifys `plan_pendenz_zugewiesen` (typ aktion, bei Zuweisungs-Änderung) / `plan_pendenz_erledigt` (typ erfolg, an Ersteller). Deep-Link `?p=<pendId>` (Pendenzen-Tab + Scroll/Highlight).
- **Änderungslog (`rec.log[]`, wandert mit dem Record — cross-org sichtbar)**: pro Dokument (hochgeladen mit Dateiname/Grösse · Freigaben als Diff «freigegeben/Recht geändert/entzogen» inkl. Fallback «Gewerk/Layer-Sicht angepasst» · Kommentar · **Markierungen: EIN Eintrag pro Viewer-Session** mit geänderten Seiten — `PV.chg` sammelt via queueAnnot, geloggt beim `pabViewerClose`, nie pro Autosave-Flush) und pro Pendenz (erfasst/geändert/zugewiesen/erledigt [auch via Plan-Pin]/geprüft/zurückgewiesen mit Grund). `pabLog(rec,aktion,text)` mutiert nur — der Aufrufer speichert; Cap 200 Einträge. **🕘-Verlauf-Modal** (`pabLogOpen('dok'|'pend', id)`, Buttons auf Dokument-/Pendenz-Karte + Viewer-Toolbar, alle Leser): Einträge neueste zuerst mit Aktions-Pill/Autor/Datum+Zeit; Legacy-Records ohne Log zeigen synthetische Einträge aus hochgeladenAm/erstelltAm/erledigtAm (nur Anzeige, kein Write).
- **Objekt-Vorauswahl (07/2026, `scripts/workspace_plandialog_objekt_test.mjs` 15 Checks)**: `_objFilterInit()` setzt den Objekt-Filter beim Boot aus `?objekt=<id>` (z.B. Workspace-Eimer-Kacheln), sonst aus dem aktiven GEMA-Objekt — nur wenn das Objekt in der sichtbaren Liste existiert; eine manuelle Filter-Wahl (`_objFilterTouched` in `pabObjChanged`) wird NIE überschrieben; Retry nach `GemaObjekte.ready` (frisches Gerät). **`renderToolbar` synct `#pabObjFilter.value` mit `_objFilter`** — vorher zeigte das Dropdown «Alle Projekte», obwohl gefiltert wurde.
- Rechte: Planer/Admin/AL via `_allPerms`; `role_architekt`/`role_unternehmer` r/w; `role_monteur`/`role_spengler`/`role_bauherrschaft` read (+ Pendenzen erledigen). Registriert: gema_auth (MODULES `planablage`, FILE_MAP `pm_planablage`), gema_notify (3 `plan_*`-Keys), gema_notify_ui (MODUL_LABELS «📐 Plandialog» + MODUL_ZUGRIFF), index.html (PM, 20 Module), sw.js (v282), gema_recent. Drift-Guards nachgeführt: notify_prefs_gating (24 Gruppen, Monteur 15), rolematrix_golden regeneriert (76 Module) + 3 Layer-B-Tupel. Tests: `scripts/planablage_engine_test.mjs` (Node, 64) + `scripts/planablage_smoke_test.mjs` (Playwright, 80 — Boot/Karten/Freigaben-Roundtrip inkl. Gewerk+Layer-Sicht, Änderungslog (hochgeladen/Freigabe-Diff/Kommentar/Markierungs-Session/Pendenz-Statuskette + Verlauf-Modal), Viewer mit pdf.js-Stub: Rechteck→normierte Koordinaten→Autosave→Undo, Multi-Layer-Farbwechsel, Layer-Panel/👁, Extern-Filter + Autosave-Integrität über unsichtbare Layer, Pin→Pendenz, Monteur-Gating + Statusmaschine + Notifys, Cross-Org lesen/bearbeiten/nichts, Upload-Mock inkl. 413-LIMIT, Deep-Link, Kein-Zugriff). Test-Hooks `window._pabHooks`.

## Prüfliste / Begehung (pm_pruefliste.html)

Begehungs-/Inspektionsmodul: Fachperson prüft je Objekt mehrere **Anlagen** anhand von **Prüfpunkten**, ergänzt fehlende Punkte in wenigen Klicks und exportiert einen bepunkteten Bericht. Kategorie Projektmanagement (MODULES-Key `pruefliste`, FILE_MAP `pm_pruefliste`). Umsetzung nach dem «Individuelle Prüfpunkte + Standardliste»-Beschrieb (2 Ebenen: **global + firmeneigen**). Rechte: Begehungen erfassen = Planer-Rollen/AL/Admin (`GemaAuth.can('write','pruefliste')`, alle via `_allPerms`); Standardlisten-Freigabe = AL/Admin/Org-Admin (org-Ebene) bzw. `role_admin` (GEMA-globale Ebene).

- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (DOM-frei, Node-Test `scripts/pruefliste_engine_test.mjs` 56 Fälle): `PR_ANTWORTTYPEN` (6 Typen: ja_nein_nb [Default], vorhanden_nb, zustand, auffaellig, zahl, text — jede Option trägt eine Default-Bewertung), `PR_BEWERTUNGEN` (gut/mässig/schlecht/nicht_bewertet), `prAutoBewertung` (Antwort→Bewertung, überschreibbar; Beispiel «Nein→schlecht»), `prAntwortLabel`, `prBegehungBewertung` (Zähler + Gesamt-Ampel: schlecht>0 dominiert), `prNorm`/`prAehnlichkeit`/`prFindeAehnliche` (Duplikat-Erkennung, Jaccard+Teilstring, Schwelle 0.6), `prEffektivePunkte` (Merge global+org+objekt, org gewinnt bei Namensgleichheit, Overrides blenden globale aus, Vorschläge/Inaktive gefiltert, nach Reihenfolge sortiert), `PR_ANLAGENARTEN_DEFAULT` (9 Anlagenarten, org-erweiterbar via `org.settings.pruefliste.anlagenarten`), `PR_DEFAULT_KATALOG`/`prDefaultRecords` (GEMA-Basisliste als globaler Seed, stabile ids `prstd_def_<i>` — nie auto-Cloud-Push; ein globaler Cloud-Record gleicher id überschreibt den Default, Muster Armaturen-Katalog).
- **Pools (moduleKey `pruefliste`, Journal-Muster if_arbeitskleider — PreBoot-Journal + stale-while-revalidate; alle Writes NUR `GemaSync.saveRecord`)**: Standardpunkte `prstd:`→`gema_pr_std_pool_v1` (`{scope:'global'|'org', orgId, bezeichnung, anlagenart, untergruppe, antworttyp, pflicht, standardbewertung, empfehlung, aktiv, reihenfolge, status:'aktiv'|'vorschlag'|'abgelehnt', vorschlagVon, vorschlagFuer, ersteller, version, log[]}` — global cross-org lesbar) · Org-Deaktivierungs-Overrides `prov:`→`gema_pr_ovr_pool_v1` (Firma blendet globalen Punkt für sich aus) · Objekt-Prüfpunkte `probj:`→`gema_pr_obj_pool_v1` (dauerhaft je Objekt, wiederkehrende Begehungen) · Begehungen `prbeg:`→`gema_pr_beg_pool_v1` (Nr `BEG-JJJJ-NNN`, `anlagen:[{anlagenart,name,standort,punkte:[…]}]`; jeder Punkt trägt einen **Snapshot** der Definition → abgeschlossene Berichte bleiben unverändert; Fotos via `GemaStorage.uploadDataUrl('pruefliste/<orgId>')`, Base64-Fallback).
- **UI — 2 Tabs**: **Begehungen** (Liste/KPI/Filter/Karten → Vollbild-Editor: Objekt/Datum/Prüfer, Anlagenart-Chips laden per Klick die effektiven Prüfpunkte, grosse Antwort-Buttons [1 Klick = Antwort + Auto-Bewertung + Empfehlung-Vorbelegung bei negativ], Bewertungs-Chip/Bemerkung/Foto/Empfehlung im 📝-Aufklapper, Bewertungs-KPI, Abschliessen/Wieder-öffnen). **Prüfpunkte** (nur `_prCanManage`: Standardliste global+org mit CRUD/Aktiv-Inaktiv/Reihenfolge/🕘-Änderungsprotokoll — global nur Super-Admin, Org-Manager kann globale Punkte für die Firma ausblenden; **Vorschläge**-Freigabe [freigeben/bearbeiten/ablehnen/Anlagenart ändern/Standardempfehlung ergänzen]; **Anlagenarten**-Editor). **«＋ Prüfpunkt ergänzen»** (in der Begehung): Bezeichnung/Anlagenart/Untergruppe/Antworttyp/Empfehlung + **Live-Duplikat-Hinweis** («ähnlicher Prüfpunkt vorhanden» → bestehenden verwenden ODER trotzdem erfassen) + **Verwendung** (nur Begehung | für Objekt speichern | Firmen- bzw. GEMA-Standardliste vorschlagen); der Punkt ist sofort in der aktuellen Anlage verfügbar.
- **Bericht** (Print-Fenster A4, `GemaPrintA4`, org-Logo `logoVector||logo`, opsz-14-Kanon): pro Anlage Tabelle mit Prüfpunkt/Antwort/Bewertung/Bemerkung+Empfehlung/Fotos; individuell ergänzte Punkte gleich dargestellt, optionaler interner «ergänzt»-Marker (Dialog, für Kundenberichte i.d.R. aus).
- **Notifikationen** `pruefliste_vorschlag` (an Approver: AL+Org bzw. `role_admin` bei global), `pruefliste_freigegeben`/`pruefliste_abgelehnt` (an Ersteller). Registriert: gema_auth (MODULES `pruefliste`, FILE_MAP), gema_notify (3 Keys), gema_notify_ui (MODUL_LABELS «📋 Prüfliste» + MODUL_ZUGRIFF `{mods:['pruefliste']}`), index.html (PM-Kachel), sw.js (v339), gema_recent, sys_workspace. Drift-Guards nachgeführt: rolematrix_golden (77 Module), notify_prefs_gating (26 Gruppen). Tests: `scripts/pruefliste_engine_test.mjs` (56) + `scripts/pruefliste_smoke_test.mjs` (28 — Boot/Tabs, Begehung+Anlage+Antwort, Ergänzen+Duplikat, Vorschlag→Freigabe, Bericht-HTML, Anlagenarten, Kein-Zugriff Monteur). Test-Hooks `window._prHooks`.

## Abnahmeprotokolle SIA 118 (pm_abnahme.html) — Teilnehmer, Freigabe & Monteur-Mängelliste

Bestehendes SIA-118-Modul (mehrere Protokolle pro Objekt im per-Objekt-Blob `gema_abnahme_sia_v1__<objektId>` via `_GemaDB`, Mangel-/Plan-Pin-Fotos nach GemaStorage ausgelagert, 4 Unterschriften-Pads). Dazu drei Workflow-Bausteine:

- **Teilnehmer & Gewerk (Karte im Abnahme-Tab)**: `state.gewerk` (`sanitaer|heizung|lueftung|elektro|spenglerei|allgemein`, Vorschlag aus Arbeitsgattung-Text bzw. Org-Kategorie) + `state.teilnehmer[]` aus den Objekt-Beteiligten. **Vorauswahl über `abRelevant(b,gewerk)`**: Bauherrschaft/Architekt/eigener Planer immer dabei, Behörden nie vorgewählt; Unternehmer/Weitere über **BKP-Codes des Beteiligten** (`AB_GEWERK_BKP`: sanitaer=25*, heizung=242/243, lueftung=244, elektro=23*, spenglerei=221/222/224) bzw. Text-Heuristik auf Firma/Funktion/Notizen — der Elektriker ist bei einer Sanitär-Abnahme NICHT vorgewählt. Manuelles An-/Abwählen setzt `_manuell` (übersteht Gewerk-Wechsel nicht — Wechsel baut neu auf).
- **Freigabe pro Teilnehmer**: «✍ vor Ort» (Unterschriften-Pads unten) ODER «📧 Digital anfragen». Digitale Anfragen liegen **per-Record in der Cloud** (moduleKey `abnahme`, `abfrg:` → `gema_abnahme_frg_pool_v1`) mit denormalisiertem Kontext (Objektname, Arbeitsgattung, Ergebnis, offene Mängel) — **cross-org via `empfaengerEmail`-Match** (Regierapport-Muster). Der Empfänger sieht die Anfrage im Panel «Meine Freigaben» (`#abTasks`, oben auf der Seite) und gibt frei/lehnt ab (GemaDialog, Ablehnung mit Begründung); Status/Kommentar erscheinen beim Teilnehmer im Protokoll (`abSyncFreigaben`). Notifikationen `abnahme_freigabe_anfrage`/`abnahme_freigabe_entscheid`.
- **Monteur-Mängelliste**: «📋 An Monteur übergeben» (Mängel-Tab) kopiert alle OFFENEN Mängel (inkl. Fotos) als Checkliste in einen per-Record-Auftrag (`abml:` → `gema_abnahme_ml_pool_v1`; `{monteurUserId, verantwortlich, status:'offen'|'abgearbeitet'|'freigegeben'|'erneute_abnahme', items:[{itemId, status, fixFotos[], kommentar}]}`). Der Monteur (role_monteur/role_spengler, `abnahme_sia` read) arbeitet sie im `#abTasks`-Panel ab: abhaken, **📷 Foto-Beweis** (GemaStorage `abnahme/<orgId>`, Base64-Fallback), Kommentar; «Alle abgearbeitet» erst möglich, wenn nichts mehr offen ist → `abnahme_maengel_abgearbeitet` an den Verantwortlichen. Dieser sieht die Karte «Zur Kontrolle»: einzelne Punkte **zurückweisen** (mit Grund → Liste zurück an Monteur) oder **«✅ Freigeben & ins Protokoll übernehmen»** (`abMlFreigeben` — schreibt `erledigt` = Datum/Monteur + Beweisfotos in die Protokoll-Mängel; **KRITISCH**: beim aktiven Protokoll in den LIVE-`state` schreiben, nicht in den `protocols[]`-Snapshot) oder **«📋 Erneute Abnahme vor Ort»** (Status-Marker, neues Protokoll manuell).
- Debug-/Test-Hooks: `window._abState/_abCreateItem/_abRender/_abPoolRead/_abPoolSave/_abRenderTeilnehmer/_abRenderTasks/_abActiveProtoId`.

## Schule: Klassen, Lernmittel & Prüfungen (ab_klassen / ab_pruefungen / ab_pruefung_live + gema_schule_api.js)

Dozenten-/Klassen-Modul für Schulen (HF Gebäudetechnik etc.), modelliert nach den Kaltwasser-Modulprüfungs-Vorlagen (Fragen- + Berechnungsteil mit Lösungen und Punkten). Schulen sind **Organisationen mit Org-Kategorie `schule`** (KATEGORIE_ROLLEN → nur `role_dozent`/`role_student` zuweisbar). Der Dozent führt Klassen wie in Teams: Studierende per Klassencode, Berechnungsmodule pro Klasse freischalten, Lernmittel teilen, Prüfungen komplett in GEMA (Pool → Planen → Durchführen mit Countdown → Korrigieren → Veröffentlichen).

- **Storage (moduleKey `schule`, alle Writes NUR `GemaSync.saveRecord` — Pools global)**: Klasse `sklasse:`→`gema_schule_klassen_pool_v1` (`{name, lehrgang, code, dozentIds[], studentIds[], module[] (Berechnungs-Keys), archiviert}`) · Lernmittel `smat:`→`gema_schule_mat_pool_v1` (Datei via GemaStorage `schule/<orgId>/lernmittel` ODER Link) · Pool-Aufgabe `saufg:`→`gema_schule_aufg_pool_v1` (schulweit; `privat:true` = nur Ersteller; `zuletztVerwendetAm/-In` + `geaendertAm` auf jeder Karte sichtbar) · Prüfung `spruef:`→`gema_schule_pruef_pool_v1` (**OHNE Lösungen**) · Lösungen `spruefl:`→`gema_schule_loes_pool_v1` · Abgaben `sabg:` (id `abg_<pruefId>__<uid>`) — **nie global gebunden**: Dozent lädt pro Prüfung via Prefix `sabg:abg_<pruefId>__`, Studierende nur den eigenen Record.
- **Lösungs-Split (KRITISCH)**: `schuleSplitPruefung` strippt `loesung`/`loesungBilder`, `antwortFelder[].loesung/toleranzPct` und `mcOptionen[].korrekt` aus dem öffentlichen Prüfungs-Record; die Lösungen liegen im separaten `spruefl:`-Record, den **nur Dozenten-Seiten binden** (`GemaSchule.bind({loesungen:true})`). Studierende laden die Musterlösung erst nach Publish (+Option `loesungNachPublish`) via `loadLoesungMem` **nur in den Speicher** (nie localStorage). `savePruefung` splittet automatisch, `pruefungFull` merged für Dozenten.
- **Aufgaben-Typen**: `freitext` · `mc` (Optionen mit korrekt-Flags, `mcMehrfach`; Auto-Punkte `(richtig−falsch)/korrekt`, halbpunkt-gerundet) · `berechnung` (**Tools pro Aufgabe**: `tools[]` = Berechnungsmodul-Keys, öffnen im Runner in neuem Tab; Zahlen-Antwortfelder mit Lösungswert + Toleranz-% → Auto-Vorkorrektur `schuleWertOk`; Rechenweg-Text). Alle Typen: Bilder/Datenblätter (`bilder[]`), `uploadErlaubt` (Fotos/PDF der Studierenden), Musterlösung + Lösungsbilder, Punkte. Prüfungs-Aufgaben sind **Kopien** (`poolId`-Referenz) — «Anpassen & Einfügen» ändert nie das Pool-Original; «Aufschalten» stempelt `zuletztVerwendetAm/-In` am Pool-Item (`touchAufgabenVerwendet`).
- **Planung**: `startAm`/`endeAm`/`toleranzMin`, `mischen` (deterministischer Shuffle Seed `pruefId|userId`, bei MC auch Optionen), `nachAbgabeEinsehen` (sehen Studierende ihre Abgabe nach Ablauf?), `loesungNachPublish`, `rundung` (`zehntel`/`halb`; Note = 5·P/Pmax+1 geklemmt 1–6, `noteManuell`-Override pro Abgabe). **Verlängerungen** `{uid:{zusatzMin, startAm?, endeAm?}}` = Nachteilsausgleich + individuelle Nachschreibe-Fenster (`schuleFenster` löst pro User auf). Status `entwurf`→`geplant` («Aufschalten» → Notify an Klasse); laufend/toleranz/beendet sind berechnet (`schulePruefPhase`).
- **Serverzeit (KRITISCH — nie Gerätezeit für Prüfungen)**: `GemaSchule.syncZeit()` bestimmt den Offset zur Serverzeit aus dem **HTTP-`Date`-Header** der Cloud (Kandidaten: `GemaSync.SB_URL` und Same-Origin-Proxy `/sb/rest/v1/` — dort CORS-frei lesbar und nie im SW-Cache; mehrere Messungen, kleinste RTT gewinnt, +500 ms Sekunden-Mitte). ALLE Prüfungs-Zeitentscheide (Countdown, Phasen, `verspaetet`, Auto-Abgabe, Zeitstempel via `_now()`) laufen über **`S.jetzt()`/`S.jetztIso()`** statt `Date.now()`. Sync: bei `bind()`, erzwungen beim Prüfungsstart, alle 5 min im Runner; **parallele Aufrufer hängen sich an die laufende Messung** (`_zeitInflight` — sonst entschied der Deep-Link-Check mit ungesyncter Zeit); Boot von ab_pruefung_live wartet auf `syncZeit()` VOR Gruppierung/Deep-Link. Fehlschlag → letzter bekannter Offset bzw. Gerätezeit + Banner «Serverzeit nicht abgeglichen» im Runner. Smoke-Test deckt verstellte Uhr (+2 h) ab.
- **Runner (ab_pruefung_live)**: Countdown runterzählend bis Ende (amber <10 min, rot <2 min), danach Toleranz-Banner bis Toleranz-Ende → **Auto-Abgabe** (`verspaetet`+`autoAbgabe`); manuelle Abgabe in der Toleranzzeit = `verspaetet`. **Autosave local-first**: eigener Spiegel `gema_schule_abg_local_v1` (neuerer Stand gewinnt beim Laden — übersteht Netzausfall/Reload), Cloud-Push debounced 1.4 s + 20-s-Intervall, bei Fehler dirty-Retry. Beim Start werden die Prüfungs-Tools via `addExamTools` bis Toleranz-Ende in den Gating-Cache geschrieben. Abgabe pusht `schule_abgabe_eingegangen` an `pruef.erstelltVon`.
- **Live-Monitor**: Dozent pollt Abgaben alle 12 s (nicht gestartet/✍ in Arbeit + Fortschritt/✓ abgegeben, letzte Aktivität).
- **Korrektur**: `korGradeList` = eingereichte Abgaben + nach Prüfungsende auch **nie abgegebene Autosave-Stände** (Browser zu = trotzdem korrigierbar; eigene Test-Abgabe des Dozenten ausgeschlossen). Pro Aufgabe: Antwort vs. eingeblendete Musterlösung, Auto-Punkte-Vorschlag (⚡-Button), Punkte (geklemmt 0..max) + Kommentar, **Text-Zeilen per Klick markieren** (`markierteZeilen`), **Bild-Annotation** (Stift/Pfeil/Marker/Text-Canvas → merged JPEG → GemaStorage `schule/<orgId>/korrektur`, Studierende sehen die annotierte Version). «📣 Resultate veröffentlichen» (manuell, mit Warnung bei offenen Punkten) → `publiziertAm` + Notify; zurückziehbar.
- **PDF-Export** (Print-Fenster, A4): Deckblatt im Layout der Prüfungs-Vorlage (Inhalt/Zeit/Hilfsmittel, Ort/Datum/Lehrgang, Punkte-/Noten-Tabelle, Notenschlüssel-Fussnote, Korrektor, Regeln) + Aufgaben — wahlweise **leer** (Antwortflächen) oder **mit Lösungen** (grüne Boxen, ☑-MC).
- **Klassencode-Registrierung**: Code 6 Zeichen ohne I/L/O/0/1 (`schuleCodeNeu`), Einladungslink `sys_login.html?klasse=<CODE>`. sys_login: eigener View «🎓 Mit Klassencode registrieren» (Live-Lookup `class_info`) → Function-Action **`register_student`** (legt `role_student`-User in der Schul-Org an, cred:-Record, trägt in `klasse.studentIds` ein, schreibt `schule_klasse_beitritt`-Notif an die Dozenten, liefert JWT); bestehende Konten werden per Passwort-Verify NUR der Klasse hinzugefügt (kein Org-/Rollen-Wechsel). Legacy-Fallback ohne Function client-seitig. Eingeloggte User: «Klasse beitreten (Code)» in ab_klassen bzw. sessionStorage-Stash `gema_klasse_join` aus dem Login-Deep-Link.
- **Studenten-Gating (KRITISCH — harte Sperre)**: `role_student` hat KEINE Berechnungs-Permissions. gema_auth.js prüft additiv `_studentModAllowed`: Cache `gema_student_mods_v1` (`{userId, mods[] aus Klassen, exams:{key:untilTs}, ts}`; geschrieben von `GemaSchule.refreshStudentMods` in ab_klassen/ab_pruefung_live bzw. `addExamTools` beim Prüfungsstart). Greift in `can()` (read+write — index/sb_index zeigen genau die freigeschalteten Kacheln) UND im Init-Gating; **fail-closed**: ohne Cache-Treffer «Kein Zugriff» (Studierenden-Variante mit Link zu ab_klassen) + async Nachprüfung gegen den Klassen-Pool → bei Treffer `location.reload()`. Erlaubte Kategorien = `CALC_CATS` (Sanitär-/Heizungs-/Lüftungsberechnungen + Brandschutz), exponiert via `GemaAuth.getCalcCats()`; Key→Datei-Auflösung via `GemaAuth.getFileMap()`.
- **Redirects**: `role_dozent` → index.html (freies Arbeiten, keine Hub-Bounces), `role_student` → ab_klassen.html (hartes Portal — von index/sb_index etc. dorthin umgeleitet). ab_pruefungen.html leitet Nicht-Editoren (`!can('write','pruefungen')`) auf ab_pruefung_live.html um.
- **Erinnerungs-Scan**: `GemaSchule.scanErinnerungen()` beim Seitenstart (Studierende) — Prüfungen mit Start < 24 h → `schule_pruefung_erinnerung`, Tages-Lock `gema_schule_notif_lock_v1`.
- Registriert: gema_auth (MODULES `klassen` + `pruefungen` cat Ausbildung, FILE_MAP `ab_klassen`/`ab_pruefungen`/`ab_pruefung_live`, Rollen + Org-Kategorie `schule` 🎓 + Migration `gema_auth_schule_v1`), gema_notify (6 `schule_*`-Keys), netlify/functions/gema-auth.js (`register_student`/`class_info` + `putModuleRecord`/`loadModuleCollection`), index.html (Ausbildung, 4 Module), ab_index.html (Sektion «Höhere Fachschule»), sw.js (v244), gema_recent. Tests: `scripts/schule_engine_test.mjs` (76 Fälle: Noten/Shuffle/Fenster+Verlängerungen/MC/Toleranz/**Split-Leak-Schutz**) + Playwright-Smoke-Muster (37 Fälle: Rollen-Sichten, harte Sperre, Runner inkl. Autosave/Abgabe, Redirects; localStorage-Seeding, externe Hosts geblockt) + `scripts/schule_syntax_check.mjs`.

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

**Dialoge folgen dem Zähler-Typ des GERÄTS (Feedback 07/2026, `scripts/trocknung_zaehler_test.mjs` 48 Checks)**: Eingabemaske, Einsetzen- und Rücknahme-Dialog blenden das Zählerstand-Feld bei `'kein'` KOMPLETT aus (Rücknahme zeigt stattdessen den Hinweis «Kein Zähler — Stromverbrauch wird im Schadensbericht über die Laufzeit erfasst», Rücknahme ohne Pflicht-Eingabe möglich) und wechseln bei `'kwh'` alle Labels auf kWh (`e_zaehlerStart_label`/`r_zaehlerEnde_label`/`f_aktuellerStand_label`; die Info-Box lässt bei kwh die Leistungs-Zeile weg — der Direktzähler multipliziert NIE mit kW). Detail-Modal + Inventar-PDF zeigen Zähler-Typ und Stände mit der richtigen Einheit. **KRITISCH — Cross-Block-Scope-Falle**: der Modul-Code lebt in einer IIFE; die Inline-`onchange`-Handler des Formulars (`_tgUpdateKwVisibility`/`_tgUpdateZaehlerstandLabel`/`_tgPrefillFromTyp`/`_tgClearFieldErrors`) MÜSSEN window-exponiert sein — ohne die Exporte war der Zähler-Typ-Wechsel im Formular seit jeher tot (Feld blieb bei «kein» sichtbar).

**Bericht-Mapping «kein Zähler» → Laufzeit (sd_schadensbericht)**: `_sdDefaultZaehlerTyp` mappt ein TG-Gerät mit `zaehlerTyp:'kein'` UND `kw > 0` beim Übernehmen (Picker/QR-Scan) automatisch auf den Bericht-Typ **`'laufzeit'`** — die Stunden-Erfassung (h total bzw. Tage × h/Tag → kWh = h × kW) erscheint von selbst; Messgeräte (kw 0) bleiben `'kein'`. `_sdReleaseTgDevice(tgId, geraet, tr)` schreibt bei Laufzeit-Geräten Betriebsstunden + kWh aus der Bericht-Erfassung in die TG-Historie (`hist.zaehlerTyp:'laufzeit'`, vorher null).

**Typ-Prefill + Duplizieren (if_trocknung)**: Typ-Auswahl bei der NEUERFASSUNG übernimmt Marke/Modell/kW/Zähler-Typ/Service-Einstellungen vom zuletzt erfassten Gerät desselben Typs (`_tgPrefillFromTyp` — nur leere Felder, bereits Getipptes bleibt; Hint `#f_typ_prefill_hint` nennt das Quell-Gerät). **📋-Duplizieren** (Karte + Tabelle, `openDuplicate`): öffnet die Erfassung als neues Gerät mit allen kopierbaren Werten — interne Kennung, Serien-Nr. und Zählerstand bleiben bewusst leer (Anwendungsfall: mehrere identische Geräte, nur noch Zählerstand/Kennung ergänzen).

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

- **Storage: per-Record in der Cloud** (moduleKey `wareneingang`): Lieferungen `we:` → `gema_we_pool_v1` (**Positionen eingebettet** als Array — eine Lieferung = ein Record; kein zweiter Pool/Join), Lieferanten-Spalten-Mappings `wemap:` → `gema_we_map_pool_v1`, Grosshändler-Offerten `weoff:` → `gema_weoff_pool_v1` (Offerten-Split, s.u.). Einzel-Saves via `GemaSync.saveRecord` (NIE `persistCollection` — Pool global über alle Orgs, wie GemaBest/Werkzeug-Dashboard), `bindCollection` beim Boot, Org-Scoping über `l.orgId`. Einstellungen in `org.settings.wareneingang` (`{projektModus,labelW,labelH,showArtikel,numberLabels,standardObjektId,lager:{name,strasse,plz,ort},splitRegeln}`).
- **Lieferung-Record**: `{id,orgId,erstelltVon/Name,importDatum,lieferantFirma,bestellnummer,bestelldatum,notiz,positionen:[{id,sortindex,artikelNr,bezeichnung,menge,eingegangenMenge,status,projekt:{objektId,name,strasse,plz,ort}}],status,updatedAt}`. Status berechnet: Position `offen`→`teilweise`→`eingegangen` (aus menge/eingegangenMenge), Lieferung `offen`→`teilweise`→`komplett`. **Positionen/Produkte sind KOMPLETT frei** (Freitext Bezeichnung+Art-Nr) — kein Produkt-/Lieferantenkatalog. Die `projekt`-Zuordnung ist entweder ein referenziertes GEMA-Objekt (`objektId` gesetzt) ODER eine freie Adresse (`objektId:''`).
- **Projektquelle konfigurierbar (User-Entscheid `org.settings.wareneingang.projektModus`)**: `beides` (Default, flexibel — GEMA-Objekt referenzieren ODER freie Adresse) | `gema` (nur GEMA-Objekt-Stammdaten referenzieren) | `frei` (nur freie/unabhängige Adressen, kein GEMA-Bezug). Helper `projModus()`/`gemaObjekteAn()`/`freieAdrAn()` steuern Import-Zuordnung, Schnell-Etikette (GEMA-Dropdown nur wenn erlaubt) und Standardprojekt. **Lieferanten sind frei** (Freitext + Autocomplete NUR aus der eigenen Modul-Historie via `lieferantHistory()`, NICHT aus `GemaProdukte`); Mappings sind daher pro **Lieferant-Name** gekeyt (`lieferantKey` = normalisierter Firmenname, case-insensitive, Legacy-Firma-Match).
- **5 Tabs**: **Übersicht** (Sammelpool mit KPI-Filter-Chips, Suche, Lieferant-/Projekt-/Sortier-Filter; Detail-Modal mit **Wareneingangsmodus**: pro Position eingegangene Menge / «＋1» / «✓ voll», Teilmengen/Backorder, «✓ Alles eingegangen», Etiketten-Nachdruck; **erfasste Lieferungen bearbeitbar** — ✏️ direkt auf der Karte ODER «✏️ Bearbeiten» im Detail-Modal). **🔀 Offerten** (Grosshändler-Offerten-Split, s.u.). **Import** (3-Schritt-Wizard). **Schnell-Etikette** (manuelle Einzel-Etikette mit Live-Vorschau + optionaler Projekt-Übernahme, nur wenn GEMA-Modus aktiv). **Einstellungen** (Projektquelle-Modus, Etiketten-Format, Standardprojekt/Lager, Mapping-Liste, Split-Regeln).
- **Offerten-Split (Tab «🔀 Offerten»)**: Grosshändler-Offerte importieren (gleicher Extraktions-Wizard wie der Import — `IMP.modus='offerte'`, KI/PDF/Tabelle; das Original-PDF wird als `IMP.origPdfB64` mitgeführt und via GemaStorage `wareneingang/<orgId>/offerten` ausgelagert, Base64-Fallback ≤ 2.5 MB, sonst nur Session-lokal `_offPdfMem`). Jede Position wird gegen die **Split-Regeln** klassifiziert (`org.settings.wareneingang.splitRegeln = [{muster, ziel:'lager'|'lieferant', lieferant}]`, Substring case-insensitive auf ArtNr+Bezeichnung, **erste passende Regel gewinnt**; Editor in ⚙️ Einstellungen): Bezug `grosshaendler` | `lager` (haben wir am Lager — wird nicht bestellt) | `lieferant` (beziehen wir bei X). Auto-Zuweisungen (`bezugQuelle:'regel'/'auto'`) werden bei jedem Review-Render + via «⚙ Regeln neu anwenden» neu bewertet, **manuelle (`'manuell'`) nie überschrieben**. Aktionen im Detail: **📄 Anpassungs-PDF** — pdf.js lokalisiert die Textzeilen der entfallenden Positionen im Original (`offMatchZeilen`: ArtNr-Match, Fallback Bezeichnungs-Anfang; pdf.js-`transform[4/5]` und pdf-lib teilen denselben PDF-User-Space, Ursprung unten links — per Node-Test bewiesen), pdf-lib zeichnet rote Streichlinien + hängt IMMER ein **Beiblatt** «folgende Positionen entfallen» an (Fallback für Scans ohne Textebene — nicht lokalisierte Positionen werden dort ausgewiesen); **🛒 Bestell-Listen** (`offListenText`: Druckfenster mit einer Gruppe je Ziel-Lieferant + Lager-Kommissionierliste + Grosshändler-Rest, leere Gruppen entfallen); **⬇ AB importieren** (öffnet den Import-Wizard mit vorverknüpfter Offerte). **AB-Abgleich**: Lieferungen tragen optional `offerteId` (Select «Gehört zu Offerte» in Schritt 3); `offAbdeckung` matcht Offerten- gegen Lieferungs-Positionen per normalisierter ArtNr (Fallback Bezeichnung) → Status je Position offen/bestellt/eingegangen (Lager gilt als gedeckt, `erledigt`-Flag für manuell Bestelltes), Offerten-Status offen/teilweise/bestellt/komplett. Deep-Link `?off=<id>`.
- **Lieferung bearbeiten (`weEditLief`/`renderLiefEdit`, Arbeitskopie `LEDIT`)**: Kopfdaten (Lieferant mit Historie-Datalist, Bestell-Nr, Bestelldatum, Notiz) + Positions-Tabelle (`Pos-Nr | Menge | Art-Nr | Bezeichnung | Projekt/Adresse`) — Zeilen editierbar/löschbar/hinzufügbar. `weLEditSave` schreibt zurück (verwirft leere Positionen, **erhält `eingegangenMenge`** und klemmt sie auf die neue Menge, Status/Lieferung-Status neu berechnet; `bulkProjObj` bleibt UI-State, wird NIE in den Record kopiert). «Abbrechen» (`weEditCancel`) kehrt ohne Speichern ins Detail-Modal zurück; «🗑 Lieferung löschen» im Editor. Nur `canEdit()`.
- **Projekt-Schnellzuweisung (Edit-Dialog UND Wizard-Step-3, identisches Muster)**: Kopfzeile «Projekt / Lieferadresse für ganze Lieferung» (`weLEditBulkPick`/`weImpBulkPick` → «aktuelles Projekt»-Slot `bulkProjObj`) + «⤓ Auf alle Zeilen anwenden» (`weLEditApplyBulk`/`weImpApplyBulkProj`); zusätzlich hat **jede Zeile einen ⤓-Button** (`weLEditAssign(i)`/`weImpAssignRow(i)`), der das oben gewählte Projekt dieser einen Position zuweist — Flow «Projekt einmal wählen, drei Positionen je 1 Klick». **Der Zeilen-Picker zieht den Slot nach** (`weLEditProj`/`weImpRowProj` setzen `bulkProjObj` auf das gepickte Projekt), damit ⤓ direkt weiterverteilen kann.
- **Modal in 2 Ebenen (KRITISCH)**: `#weModalHost` (Ebene 1: Detail-/Bearbeiten-Dialog, `showModal`) + `#weModalHost2` (Ebene 2: Projekt-/Adress-Picker und Neues-Projekt-Formular, `showModalTop`, z-index 9500) — der Picker legt sich ÜBER den aufrufenden Dialog, statt ihn zu ersetzen (User-Vorgabe: Dialog bleibt im Hintergrund offen, gleiche UX wie im Import-Wizard). `weCloseModal()` schliesst immer die OBERSTE offene Ebene — alle bestehenden ✕/Abbrechen-Handler bleiben unverändert gültig. GemaDialog (12800) liegt weiterhin über allem; gema_scroll entsperrt erst, wenn kein `.modal-bg` mehr sichtbar ist (2 Ebenen safe).
- **Import-Wizard**: (1) Quelle & Lieferant — **Extraktion: «🤖 KI-Analyse» steht zuerst und ist Default** (`newImp().quelle='ki'`), dann «Tabelle einfügen»/«PDF». Lieferant **komplett frei** (kein Katalog): bereits erfasste Lieferanten erscheinen als **Dropdown** (`#impLiefSelect` aus `lieferantHistory()`), neue via Freitext (`weImpLiefPick`/`weImpLiefType` halten Dropdown+Feld synchron); der Name bestimmt das Spalten-Mapping. (2) Extraktion — **HTML-Einfügen** fängt das `paste`-Event ab (`clipboardData.getData('text/html')` → `DOMParser` → Kandidaten-`<table>` mit den meisten Datenzeilen; Fallback text/plain mit Tab/2-Space-Split); **PDF** via **pdf.js** (lazy von cdnjs, `window.pdfjsLib`), Textitems mit x/y → Zeilen nach y clustern → Spalten nach x-Lücken clustern; **KI-Analyse** (siehe eigener Punkt). **Mapping-Assistent** bei fehlendem Mapping: extrahiertes Raster + Spalten-Zuordnung (**Pos-Nr**/Art-Nr/Bezeichnung/Menge/Kopfzeilen-Skip) mit Heuristik-Vorschlag (`guessCols`: Header-Keywords inkl. «Pos», längste Textspalte, Ganzzahl-Spalte), gespeichert pro Lieferant-Name+Quelle (`saveMapping`). Beim nächsten Import automatisch. **PDF speichert x-Bänder** (`colsToBands` → `applyPdfBands`, stabiler als Spaltenindizes), HTML Spaltenindizes (`applyGridMapping`). (3) **Review-Grid** (immer editierbar, Pflicht-Kontrolle weil PDF/KI fehleranfällig): `Pos-Nr | Menge | Art-Nr | Bezeichnung | Projekt/Adresse` + editierbares Lieferant-Feld im Kopf (KI kann ihn setzen; Pflicht beim Import), Zeilen editierbar/löschbar/manuell ergänzbar, Menge 0 rot markiert. **Pos-Nr** = die laufende Positionsnummer aus dem Dokument (`pos.posNr`), damit der Lagerist gegen den Lieferschein prüfen kann (auch im Wareneingang-Detail-Modal sichtbar). **Projekt-/Adress-Picker** (`weOpenProjektPicker`, adaptiert an `projektModus`: GEMA-Objekt-Liste + «＋ Neues GEMA-Objekt» und/oder freies Adressformular, plus «📦 Lager»-Quick) je Zeile UND «für ganze Lieferung» → «⤓ auf alle Zeilen»; **neues GEMA-Objekt inline** (`GemaObjekte.upsertObjekt`, ADD-ONLY, mit `GemaAdresse`-Autocomplete); Bestell-Nr/Datum + Duplikat-Warnung (gleiche Bestell-Nr + Lieferant); «Importieren» bzw. «Importieren & Etiketten drucken».
- **Lager-Positionen (Pool ja, Etikette nein)**: Positionen mit Projekt = «📦 Lager» (`lagerProjekt()` trägt `istLager:true`; `isLagerProj(p)` erkennt es, inkl. Legacy-Fallback ohne Flag) werden **importiert und im Wareneingang kontrolliert**, aber **NICHT als Etikette gedruckt** — `labelsFromLief` überspringt sie, `wePrintPos` blockt, «Importieren & Etiketten drucken» meldet «nur Lager-Positionen». Im Review-Grid + Detail-Modal 📦-Marker.
- **Freie Adresse = Bezeichnung**: Der Freie-Adresse-Picker hat KEIN separates Namensfeld mehr — `name` = Strasse (sonst Ort), also die Adresse selbst (`wePickFrei`). **Adress-Autocomplete** (`GemaAdresse.attach` in Picker/Neues-Objekt/Schnell-Etikette) schreibt PLZ+Ort in **eigene Felder** und ins Strassenfeld **nur Strasse+Nr** (onSelect überschreibt den vollen Anzeige-String zurück auf `r.strasse`).
- **KI-Analyse (Alternative zum Parsing, `quelle:'ki'`)**: Claude analysiert Rechnung/Lieferschein/Auftragsbestätigung als **PDF, Foto ODER Text** und extrahiert Positionen (`bezeichnung/artikelNr/menge`) + Kopfdaten (`lieferant/bestellnummer/bestelldatum`) — auch bei **gescannten Belegen ohne Text-Ebene** und **ohne Spalten-Mapping**. **Nur echte Sanitärartikel** — Nebenkosten (Fracht/Versand/Porto, Verpackung, «Paket klein»/Kleinpaket, Mindermengenzuschlag, Gebühren, Rabatt/MwSt, Summenzeilen) werden per System-Prompt + Tool-Schema herausgefiltert. Serverseitiger Proxy `netlify/functions/claude-extract.js` (Env `ANTHROPIC_API_KEY`, Modell `claude-haiku-4-5`, per `ANTHROPIC_EXTRACT_MODEL` übersteuerbar) mit **erzwungenem Tool-Use** (`tool_choice`) → immer valides JSON gegen das Schema; Dokument/Bild-Block VOR dem Instruktions-Text. Client: `GemaClaude.extractPositions({text?,fileBase64?,mediaType?,filename?})`. Datei ≤ ~3 MB (Netlify-Sync-Limit), sonst Text einfügen. **Text-vor-Datei + Parallel-Chunking gegen Netlify-504 (KRITISCH)**: `_kiIngestFile` extrahiert bei PDFs die Textebene clientseitig (pdf.js, `_kiPdfTextExtract` — zeilenweise via y-Cluster, liefert `{text,pages[]}`) nach `IMP.kiPdfText`/`kiPdfPages`. `kiAnalysePlan(imp,txt)` entscheidet: Scan/Bild = EIN Datei-Call; Text (≥200 Zeichen, manuell eingefügter Text hat Vorrang) wird via `kiTextChunks` an **Seitengrenzen in ~7k-Chunks** gepackt und **parallel** analysiert (`weImpKiAnalyze` mit Teil-Zähler; `kiMergeResults` konkateniert Positionen OHNE Dedup — dieselbe ArtNr kann legitim mehrfach vorkommen — Kopfdaten first-non-empty; Teilausfall wird per Toast ausgewiesen, nie verschwiegen). Hintergrund: Netlify bricht synchrone Functions nach ~10 s ab (HTTP-504-HTML-Seite) — weder die Vision-Analyse eines mehrseitigen PDFs noch EIN Text-Call über einen 23-Seiten-Auftrag (34k Zeichen, 46 Positionen) passt da rein; 6 parallele ~6k-Calls à 3–6 s schon. Überlange Einzelseiten splittet `kiTextChunks` an Zeilengrenzen (nie stille Kürzung). In `if_wareneingang.html`: `renderStep2KI` (Datei-Upload PDF/Bild + Textfeld + «Analysieren»), `weImpKiAnalyze`/`kiApplyResult` (menge gerundet, Datum via `parseDateLoose` → ISO, Kopfdaten füllen nur leere Felder), **`kiArtNrRepair` (KRITISCH — abgeschnittene Artikelnummern)**: Grosshändler-Nummern bestehen aus mehreren Blöcken («3612 272.000.000») — die KI liess den führenden Sortimentsblock teils weg. `kiApplyResult` prüft deshalb jede extrahierte Nummer deterministisch gegen den Roh-Text (`kiText`/`kiPdfText`) und stellt einen unmittelbar davorstehenden Ziffernblock (3–6 Stellen, Trenner « » oder «.») wieder voran — konservativ: kein Preis-/Dezimal-Kontext davor, Block ≠ Pos-Nr/Menge der Zeile, Nummer kommt im Text NIE ohne den Block vor, und der Block erscheint ≥2× als Nummern-Präfix (laufende Pos-Nummern sind einmalig und kommen nie durch) bzw. steckt schon in einer voll extrahierten Nummer. Toast weist die Anzahl vervollständigter Nummern aus; zusätzlich verlangt der claude-extract-Prompt die Artikel-Nr explizit VOLLSTÄNDIG inkl. aller führenden Blöcke. Suite: `scripts/wareneingang_artnr_test.mjs` (12 Checks inkl. Mengen-/Pos-Nr-/Preis-Fallen), `weImpToKi` (Fallback-Button in den Parsing-Fehler-Warnboxen — reused das bereits gewählte PDF via `IMP.kiPendingFile`). **Graceful Degradation**: Function 404/500 → Warnbox mit Rückfall auf Tabelle/PDF/manuell, Modul bleibt nutzbar. **Lieferant im KI-Modus in Schritt 1 optional** (Claude erkennt ihn meist); Pflicht erst beim Import (Schritt 3). Inline-`IMP.*`-Mutations laufen über den globalen Setter `window.weImpSet(key,val,dupCheck?)` (IMP lebt in der IIFE → sonst «IMP is not defined» im oninput-Kontext).
- **Etiketten — Druck via HTML + `window.print()`** (KEIN ZPL, kein jsPDF, keine PDF-Datei): eigenes Druckfenster (`window.open`+`document.write`) mit `@page{size:<W>mm <H>mm;margin:0}`, eine `.lbl`-Seite je Etikette (`page-break-after:always`), **Menge = Anzahl Etiketten** (durchnummeriert «1 / N»). **Adress-Layout (User-Vorgabe)**: **Strasse+Nr dominant** (`.lb-addr`, gross), **Ort klein** darunter (`.lb-city`), **KEINE PLZ** auf der Etikette; bei GEMA-Objekten steht der Projektname als kleiner Eyebrow, bei freien Adressen nicht (Name = Adresse). Strasse wird **nur für den Druck** zu «Str.» gekürzt (`abbrevStrasse`, Daten bleiben unverändert). **Nie abschneiden** — der ganze Adressblock (`.lb-addrwrap` inkl. Strasse/Ort/Artikel) wird per JS **auto-gefittet** (Strassen-Schrift verkleinern bis alles passt — im Druckfenster `fitScript` UND in der WYSIWYG-Live-Vorschau `renderPreview`, gleiches Markup `labelInner`). Optional Artikel (Bezeichnung+Nr, **max. 1 Zeile** — `.lb-art` nowrap+ellipsis, «man weiss dann schon was es ist»; klippt statt umzubrechen, drückt so auch nie die Strassen-Schrift kleiner) + Fusszeile (nur Datum·Index — **der Lieferant erscheint bewusst NICHT auf der Etikette**, User-Vorgabe). **Kein Barcode/QR** (User-Entscheid — maximale Fläche für die Adresse). **Etiketten-Format** default **49 × 23 mm** (wie Werkzeug-Etiketten `_WZ_ETIK`, Zebra ZD421), in den Einstellungen frei änderbar (`labelW`/`labelH` mm) — diese eine Zahl steuert `@page` und das Layout. Druck-Hinweis im Fenster: 100 % / «tatsächliche Grösse», Ränder «keine».
- **Rechte**: Schreiben via `GemaAuth.can('write','wareneingang')` (`canEdit()`) — respektiert die Permission-Matrix. `role_lagerist` (NEU) hat wareneingang r/w/a + objekte r/w; Planer-Rollen/Abteilungsleiter/Admin automatisch via `_allPerms` (Projektleiter = Zielperson); Magaziner/Monteur etc. standardmässig KEIN Zugriff (nur per Admin-UI zuweisbar). Seitenzugang wird von `gema_auth.js` über `FILE_MAP` (`if_wareneingang`→`wareneingang`) automatisch erzwungen («Kein Zugriff»-Screen ohne read).
- Test-Hooks: `window._weHooks` (`settings/liefStatus/posStatus/extractHtmlGrid/extractTextGrid/guessCols/applyGridMapping/pdfItemsToGrid/applyPdfBands/mkPos/projModus/gemaObjekteAn/freieAdrAn/defaultProjekt/lieferantKey/findMapping/saveMapping/kiApplyResult/parseDateLoose/newImp/getImp/setImp/lagerProjekt/isLagerProj/abbrevStrasse/labelsFromLief/labelInner/lieferantHistory/getLEdit/liefById` + Offerten-Split: `offerten/offById/offKlassifiziere/offGruppen/offAbdeckung/offStatus/offMatchZeilen/offListenText/offBeiblattLines/normArt/dataUrlBytes`). Offerten-Split-Suite: `scripts/wareneingang_offerten_test.mjs` (Playwright, 28 Checks: Regeln/Klassifizierung, Wizard im Offerten-Modus, manueller Override vs. «Regeln neu anwenden», Bestell-Listen-Gruppierung, Beiblatt + Streich-Matching, AB-Verknüpfung/Abdeckung, Einstellungs-Editor). Playwright-Smoke (localStorage-Seeding Lagerist vs. Monteur, externe Hosts geblockt): Zugriff/4 Tabs/Etiketten-Auto-Fit/HTML-+Text-Grid-Extraktion+Spalten-Heuristik/«Kein Zugriff» für Monteur; plus Projektmodus-Suite (beides/gema/frei); plus KI-Suite (KI-Quelle, Lieferant optional in Schritt 1, `renderStep2KI`, gemocktes `extractPositions`, Datum-Parsing/menge-Rundung, Import-Guard); plus Feature-Suite (KI zuerst+Default, Lieferant-Dropdown aus Historie, posNr durch guessCols/applyGridMapping/KI/Review-Grid, `isLagerProj`+`labelsFromLief` überspringt Lager, freie Adresse `name`=Strasse ohne Namensfeld, `abbrevStrasse` + `labelInner` Strasse-gross/Ort-klein/keine-PLZ/Eyebrow-Logik); plus Edit-Suite (Karten-✏️, `weEditLief`→`LEDIT`, Kopfdaten+Positionen ändern/hinzufügen, Save erhält+klemmt `eingegangenMenge`+Status, Abbrechen verwirft).
- Registriert: gema_auth (MODULES `wareneingang` cat Infrastruktur, FILE_MAP `if_wareneingang`, **neue Rolle `role_lagerist`** + Migration `gema_auth_lagerist_v1`, KATEGORIE_ROLLEN in allen Gebäudetechnik-Kategorien), index.html (Infrastruktur-Kachel `data-module="wareneingang"`), sw.js (v219 — inkl. `gema_claude.js`), gema_recent (PAGE_LABELS). Kein GemaNotify-Event (rein org-intern). KI-Analyse via `netlify/functions/claude-extract.js` (Env `ANTHROPIC_API_KEY`; ohne Key/Deploy funktioniert das Modul mit Parsing/manuell weiter).

---

## Arbeitskleider (if_arbeitskleider.html)

Kleiderbudget-Verwaltung pro Mitarbeiter (Infrastruktur): Budget mit einstellbarer Zeitachse, Artikel-Katalog mit Preisen/Grössen, Bezüge «buchen» + freie Einträge mit Quittungs-Beleg, Saldo-Übersicht (wer hat wie viel offen) und revisionssicheres Log.

- **Pools (moduleKey `arbeitskleider`)**: Artikel `akart:` → `gema_ak_artikel_pool_v1` (`{name, kategorie (AK_KATS: tshirt/pullover/jacke/hose/shorts/schuhe/muetze/handschuhe/zubehoer/sonstiges), preis, groessen[], aktiv}`) · Bezüge `akbez:` → `gema_ak_bezug_pool_v1` (`{userId/userName, typ:'artikel'|'frei', artikelId?, artikelName, kategorie, groesse?, menge, preis, total, datum, bemerkung, beleg?{name,url|dataUrl}, erfasstVon:{userId,name}, storniert?:{am,von,grund}, ts}`). Einzel-Saves via `GemaSync.saveRecord`; **PreBoot-Journal (KRITISCH, Muster pm_plaene `_plPreBoot`)**: `saveRec`/`delRec` journalen bis zum Abschluss des bindCollection-Pulls und legen sich danach wieder über den Cache — sonst wischte der (ältere) Cloud-Snapshot einen im Boot-Fenster erfassten Artikel/Bezug still weg (vom Smoke-Test gefunden). Das Spinner-Race (6 s) ist davon getrennt: das Journal wendet erst an, wenn der Bind WIRKLICH fertig ist.
- **Einstellungen `org.settings.arbeitskleider`** (⚙️-Tab, `GemaAuth.updateOrgSettings`): `{budget (Standard CHF/Periode), periode:'jahr'|'halbjahr'|'quartal', startMonat 1–12, kumulierbar, budgetAb (Kumulations-Anker), mitarbeiterSicht, budgets:{userId:{betrag?, ab?}}, kategorien:null|[{id,label,icon}]}`. **Budget-Modell = Standard + Ausnahmen** (Override pro Person; `betrag:0` ist gültig = kein Budget; `ab` = Eintrittsdatum, kappt die Kumulation). **`mitarbeiterSicht`-Toggle** (User-Entscheid, Variante 1 ⇄ 3): an = Mitarbeitende sehen eigenen Saldo + eigene Bezüge (read-only, kein Selbst-Buchen), aus = Modul zeigt Mitarbeitenden einen Deaktiviert-Hinweis (reine Lagerverwaltung).
- **Kategorien pro Org anpassbar** (⚙️-Karte «🏷 Kategorien»): Zeilen-Editor (Icon + Label + 🗑, Reihenfolge = Anzeige-Reihenfolge, «＋ Kategorie»/«↺ Standard wiederherstellen»); gespeichert als `cfg.kategorien` (`null` = Standard-Katalog `AK_KATS`; Speichern normalisiert auf null, wenn die Liste dem Standard entspricht). Engine: `akKats(cfg)` = wirksame Liste (ungültige Einträge übersprungen, leer → Standard), `akKat(id, kats?)`. **Umbenennen behält die Kategorie-ID** (`data-kat-id` an der Editor-Zeile — bestehende Artikel/Bezüge folgen automatisch); neue Kategorien bekommen eine Slug-ID aus dem Label (ae/oe/ue, `katSlug` mit Eindeutigkeits-Suffix). **Altdaten-Schutz (KRITISCH)**: gelöschte Kategorien löschen NIE Artikel — Katalog zeigt sie unter «bisherige Kategorie»-Karten (`katOf(id)`: wirksame Liste → AK_KATS-Standard-Label → `{id,label:id,icon:'🏷'}`), Artikel-Form/Bezug-Dialog bieten den Altwert als «(bisherig)»-Option bzw. Leftover-Optgroup weiter an.
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (DOM-frei, Node-Test 56 Fälle): `akParams` (Defaults-Merge), `akPeriodeVon` (Periode zum Datum, verankert am Startmonat — Geschäftsjahr April, Quartal über den Jahreswechsel etc.), `akPeriodeLabel`/`akNaechstePeriode`, `akBudgetFor`, `akAnker` (spätestes von `budgetAb`/User-`ab`; ohne Anker keine Historie), **`akSaldo`** → `{periode, budget, uebertrag, verfuegbar, verbraucht, rest, negativ}` (Storno/fremde User/Vorperioden ausgeschlossen; kumulierbar = Σ(budget−verbraucht) über alle abgeschlossenen Perioden ab Anker — auch negativ, Überzug wandert mit), `akFmtChf` (CHF-Format mit Apostroph-Tausendern).
- **Überschreitung erlaubt mit Warnung** (User-Entscheid): Live-Vorschau «Rest nach Bezug» im Erfassen-Dialog wird bei Unterdeckung rot + Warntext, der Bezug wird trotzdem erfasst; Karten/KPI («Überzogen») weisen negative Salden rot aus.
- **Bezug erfassen** (nur Manager = `role_admin`/`role_magaziner`/`can('admin','arbeitskleider')` — Monteur ist über den Manager-Guard ausgeschlossen): Person-Select → Segment «Aus Katalog» (Artikel-Select mit Preis-Vorbefüllung, Grössen-Chips wenn der Artikel `groessen` trägt — dann Pflicht) ODER «Freier Eintrag» (z.B. Schuhe mit Quittung: Bezeichnung + Kategorie + **Beleg-Upload**: Bild resized max 1600px JPEG bzw. PDF ≤ 8 MB → `GemaStorage.uploadDataUrl('arbeitskleider/<orgId>')`, Base64-Fallback ≤ 2.5 MB); Menge-Stepper, Preis editierbar, Datum, Bemerkung. Notify `kleider_bezug` an den Mitarbeiter (Erfassen typ info, Storno typ warnung; nie an sich selbst, nur bei aktiver Mitarbeiter-Sicht).
- **Storno statt Löschen**: `storniert:{am,von,grund}` (GemaDialog.prompt) — der Eintrag bleibt im Log sichtbar (durchgestrichen + Badge), zählt aber nicht mehr ans Budget. Artikel-Löschen lässt Bezüge unangetastet (Name/Preis sind in den Bezug denormalisiert).
- **Log-Tab**: Filter Person + Zeitraum (aktuelle Periode/alle), CSV-Export (Semikolon + BOM). Deep-Link `?tab=uebersicht|katalog|log|einstellungen`.
- Registriert: gema_auth (MODULES `arbeitskleider` cat Infrastruktur, FILE_MAP `if_arbeitskleider`; **Magaziner r/w/a**, Monteur/Spengler read, Planer via `_allPerms` + Permission-Backfill), gema_notify (`kleider_bezug`), gema_notify_ui (MODUL_LABELS «👕 Arbeitskleider» + MODUL_ZUGRIFF `{mods:['arbeitskleider']}` — Drift-Guard-Zählwerte in `notify_prefs_gating_test` auf 23/14 nachgeführt), index.html (Infrastruktur, 4 Module), sw.js, gema_recent. Rollen-Golden regeneriert (75 Module). Tests: `scripts/arbeitskleider_engine_test.mjs` (Node, 66 — inkl. akKats-Fälle) + `scripts/arbeitskleider_smoke_test.mjs` (Playwright, 50 — Manager-CRUD/Bezug/Überschreitung/Storno/Einstellungen, Kategorien-Editor umbenennen/ergänzen/löschen + Altdaten-Schutz, Monteur-Eigensicht, Sicht-Toggle aus, Kein-Zugriff; PostgREST-Mock liefert geseedete Pools im Row-Format). Test-Hooks `window._akHooks`.

## Immobilienverwaltung (iv_immobilien.html)

Verwaltungs-Modul für Immobilienverwaltungen (neues Präfix `iv_`, MODULES-Key `immobilien`, cat `Immobilien`, eigene index.html-Kategorie «Immobilien» `#immo`): Liegenschaften → Wohnungen → Mietverhältnisse, Handwerker-Aufträge mit direkter GEMA-Anbindung und Leerwohnungs-Workflow mit automatischem Spülregime.

- **Pools (moduleKey `immobilien`, alle Writes NUR `GemaSync.saveRecord` — Aufträge sind cross-org)**: Liegenschaft `imlg:`→`gema_im_lg_pool_v1` (`{name,strasse,plz,ort,baujahr,hauswart,hauswartTel,bemerkung}`) · Wohnung `imwhg:`→`gema_im_whg_pool_v1` (`{liegenschaftId,bez,stockwerk,zimmer,flaecheM2,nettomiete,nebenkosten,status:'vermietet'|'leer',leerstand:null|{seit,intervalTage,spuelObjId}}`) · Mietverhältnis `immv:`→`gema_im_mv_pool_v1` (`{wohnungId,mieter,tel,email,beginn,ende(''=unbefristet),nettomiete,nebenkosten,kaution,status}`) · Handwerker-Auftrag `imauf:`→`gema_im_auf_pool_v1` (`{nr,orgId,liegenschaftName/wohnungBez/adresse DENORMALISIERT,titel,beschreibung,kategorie,prioritaet,termin,handwerker:{typ:'gema'|'extern',userId,name,firma,email,tel},status,bericht,verlauf[]}`). Nummernkreis `HW-<Jahr>-NNN` pro Verwalter-Org (`ivNextNr`). Dazu Mieter-Stamm `immieter:`→`gema_im_mieter_pool_v1` (`{name,tel,email,bemerkung}` — MV referenzieren via `mieterId`), Mietzahlungen `imzahl:`→`gema_im_zahl_pool_v1` (**deterministische ID `z_<mvId>_<YYYY-MM>`** = ein Record pro MV+Monat, Muster Token-Ledger; nur bezahlte Monate haben einen Record, `betrag` = Soll-Snapshot) und NK-Abrechnungen `imnk:`→`gema_im_nk_pool_v1` (`{liegenschaftId,jahr,schluessel:'flaeche'|'gleich',positionen:[{bez,betrag,auftragId?}]}`).
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block** (DOM-frei, `scripts/immobilien_engine_test.mjs` 44 Fälle): `ivAufNext` (Status-Maschine offen→beauftragt→in_arbeit→erledigt, ablehnen/zurueckziehen; ungültig=null, Muster GemaBest), `ivNextNr`, `ivScopeAuftraege` (Verwalter=eigene Org; Handwerker=zugewiesene via `handwerker.userId`-Match, Fallback E-Mail case-insensitive), `ivMvAktiv/ivMvAuslaufend`, `ivLeerQuote/ivKpis` (Mietzins-Soll = netto+NK nur AKTIVER MV), `ivAddDays`, `ivSpuelDue` (nie gespült = sofort fällig — Logik wie hy_spuelmanager). Dazu `ivRound5` (Rappenrundung 0.05), `ivTageImMonat/ivUeberlappTage`, **`ivSollZeilen`** (Mietzins-Soll pro Monat, TAGESGENAU pro-rata bei Ein-/Auszug — massgebend beginn/ende, nicht der Status), `ivZahlId`, **`ivNkAbrechnung`** (NK-Verteilung nach Wohnfläche/pro-Wohnung → pro MV tagesgenau, Akonto = NK×12×Tage/Jahrestage, Leerstandstage separat zulasten Verwaltung), `ivAufKostenJahr` (erledigte Aufträge mit Kosten fürs NK-Jahr).
- **Leerwohnung → Spülregime (KRITISCH — Kern-Feature)**: «🏠 Leerstand» auf der Wohnungskarte → Modal (seit-Datum, Intervall Default 7 Tage, Spülstellen-Liste Default Küche/Bad/WC, Checkbox aktiv). Legt Spülobjekt `typ:'leerstand'` + Spülstellen DIREKT in die Spülmanager-Pools (`xPoolAdd` → localStorage + `GemaSync.saveRecord('spuelmanager','spobj:'/'spst:',…)` — Muster hy_legionellen), verlinkt `wohnung.leerstand.spuelObjId`, pusht `spuel_aktiviert` an role_monteur+Org. **«✓ Wieder vermietet»** (bzw. Status-Wechsel im Formular oder MV-Erfassung auf leerer Wohnung) beendet das Spülobjekt (`aktiv:false,beendetAm` via `ivSpuelObjUpdate` — Einzel-Record-Update, Protokoll bleibt) und bietet direkt die MV-Erfassung an. MV-Beenden ohne Folge-MV bietet umgekehrt den Leerstand-Flow an (seit = Mietende+1). Fälligkeits-Badges («🚿 N Spülung(en) fällig») auf den Wohnungskarten + Übersicht lesen die SP-Pools — der Boot **bindet die Spülmanager-Pools mit** (Muster GemaBest.bind, sonst auf Zweitgeräten leer).
- **Handwerker-Aufträge**: Auftrag pro Liegenschaft(+optional Wohnung) mit Gewerk/Priorität/Wunschtermin. Handwerker-Segment **«🔗 GEMA-Betrieb»** (Dropdown ALLER aktiven `role_unternehmer`-User GEMA-weit, Label = Org-Name, Muster `_fzGemaGaragen`) ODER **«Extern»** (Freitext — Verwalter pflegt Status selbst, `ivDarfHandwerkerAktion` erlaubt das nur bei `typ!=='gema'`). «Beauftragen» → Notify `immo_auftrag_neu` an `handwerker.userId` (Deep-Link `iv_immobilien.html?auf=<id>`). Der GEMA-Handwerker sieht seine Aufträge cross-org im Panel **`#ivTasks` «Meine Handwerker-Aufträge»** (reiner Handwerker: keine Verwalter-Tabs): Annehmen → `in_arbeit`, «✓ Erledigt» mit Pflicht-Arbeitsbericht, Ablehnen mit Grund — jeweils `immo_auftrag_status` an `erstelltVonUserId`. Verwalter kann beauftragte/abgelehnte Aufträge zurückziehen (wieder offen) und offene/abgelehnte löschen; 💬-Rückfrage via GemaChat (Kontext-Chip auf den Auftrag). **Offerte & Kosten**: Der GEMA-Handwerker kann bei beauftragt/in_arbeit eine Offerte einreichen (`a.offerte={betrag,nachricht}` → Notify `immo_auftrag_offerte` an den Verwalter, Anzeige als Box im Detail); beim Erledigen optional den **Rechnungsbetrag** angeben (`a.kosten`, Rappenrundung), der Verwalter kann ihn bei erledigten Aufträgen nacherfassen/ändern («💰 Kosten») — Kosten fliessen über die Übernahme in die NK-Abrechnung.
- **Mieter-Stamm & Mietzins-Kontrolle**: Tab «👥 Mieter & Verträge» — Kontaktdaten einmal erfassen; `ivMvSave` verknüpft den Stamm automatisch (Select-Übernahme, sonst Name-Match case-insensitive, sonst **Auto-Anlage** — der Stamm wächst von selbst, Löschen nur ohne Verträge). Tab «💰 Mietzins»: Monats-Navigation, Soll-Zeilen aus `ivSollZeilen` (Teilmonate als `x/y Tage`-Badge), «✓ Bezahlt» legt den `imzahl:`-Record an (Soll als Beleg-Snapshot), «↺ Wieder öffnen» löscht ihn; KPIs Soll/Bezahlt/Offen + CSV-Export (Semikolon+BOM); Übersichts-KPI «Mieten offen (Monat)».
- **Nebenkosten-Jahresabrechnung** («📊 NK-Abrechnung» auf der Liegenschafts-Karte): Abrechnungen pro Liegenschaft+Jahr, Positionen-Editor mit Live-Ergebnis (`ivNkRecalc`), Verteilschlüssel Wohnfläche/pro Wohnung, **«🔧 Handwerker-Kosten übernehmen»** zieht erledigte Aufträge mit erfassten Kosten des Jahres als Positionen (`auftragId` als Dedupe-Anker — zweite Übernahme meldet «Nichts zu übernehmen»), Print-Fenster A4 (Kosten + tagesgenaue Verteilung + Salden Nachzahlung/Guthaben + Leerstands-Ausweis).
- **Rechte**: `ivIsVerwalter()` = role_admin/role_immoverwalter/Planer-Rollen/AL (Rollen-Liste — NICHT role_unternehmer, der hat `immobilien` r/w nur für Statuswechsel an seinen Aufträgen + Panel). Neue Rolle **`role_immoverwalter`** (immobilien r/w/a + spuelmanager r/w), Migration `gema_auth_immo_v1`; `spCanEdit` in hy_spuelmanager um role_immoverwalter erweitert; KATEGORIE_ROLLEN `immobilien` → [role_immoverwalter, role_bauherrschaft]. Boot-Guard `#ivTabs` (Kein-Zugriff-Body). **Robustheit (KRITISCH)**: `ivRender()` kapselt Tabs/Buttons/Tasks/Inhalt einzeln in try/catch (Fehlerbox statt leerer Seite — Muster Lieferanten-Dashboard); Handwerker OHNE offene Aufträge sehen im `#ivTasks`-Panel ein Startbild mit Hinweis + «Zuletzt erledigt» statt nur des Headers (vorher blieb für role_unternehmer die Seite komplett leer).
- Registriert: gema_auth (MODULES `immobilien` cat Immobilien, FILE_MAP `iv_immobilien`, role_unternehmer +immobilien r/w — Golden `scripts/rolematrix_golden.json` regeneriert), gema_notify (`immo_auftrag_neu`/`immo_auftrag_status`/`immo_auftrag_offerte`), index.html (neue Kategorie «Immobilien» + Filter-Button `data-filter="immo"`), sw.js (v257), gema_recent. Tests: `scripts/immobilien_engine_test.mjs` (Node, 69) + `scripts/immobilien_smoke_test.mjs` (Playwright, 44 Checks: CRUD, Leerstand→Spülpools lokal+Cloud, Cross-Org-Roundtrip Verwalterin↔Handwerker mit Notifys, Wiedervermietung beendet Spülobjekt, hy_spuelmanager-Sicht, Kein-Zugriff Monteur, Auto-Mieterstamm, Mietzins-Toggle mit deterministischer Record-ID, Offerte+Kosten-Roundtrip, NK-Übernahme+Dedupe+Print; In-Memory-PostgREST-Mock für echten Zwei-Kontexte-Sync).

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

`erfasst`, `geaendert`, `geloescht`, `zuweisung`, `ausleihe`, `rueckgabe`, `einsatz`, `einsatz_ende`, `pruefung`, `service`, `pruefanfrage`, `defekt`, `defekt_erledigt`, `ersatzanfrage`, `km_update`, `kosten`, `reifen`, `offerte`, `reparatur`, `garage_ein`, `garage_aus`, `verloren`, `gefunden`. Jede mit farbiger Pill im Modal.

**Org-Regel (KRITISCH bei Cross-Org-Aktionen):** `log()` akzeptiert `opts.orgId` — der Eintrag gehört zur Org des DATENSATZES (Werkzeug/Fahrzeug), nicht zur Org des Bearbeiters. Externe Lieferanten/Prüfer/Garagisten loggen so ins Log der Auftraggeber-Org (Wrapper `_wzActLog`/`_fzActLog` übergeben `tool.orgId`/`v.orgId`; Dashboards nutzen `_dwzLog`/`_dashLog`). Geloggt wird auch aus `sys_lieferant_dashboard.html` (Quittieren, Prüfbericht, Offerte, Reparatur) und `sys_garagist_dashboard.html` (km-Update, Garage ein/aus, Reparatur-Doku) — beide laden `gema_aktivitaetslog.js`.

### Public API

```javascript
GemaActivityLog.bootstrap()                        // Promise — beim Seitenstart
GemaActivityLog.log({modul, modulRecordId,
  modulRecordName, aktion, beschreibung, details}) // fire-and-forget
GemaActivityLog.getAll(orgId?)                     // Array, neueste zuerst
GemaActivityLog.getForModul(modul, orgId?)         // gefiltert pro Modul
GemaActivityLog.openModal({modul, titel?, recordId?, recordName?}) // einheitliches Modal; mit recordId nur EIN Datensatz
```

### Modul-Integration

Jedes der drei Module hat:
- Lokalen Wrapper `_wzActLog` / `_fzActLog` / `_tgActLog` — fire-and-forget mit Modul-Stempel
- Toolbar-Button `btnWzActLog` / `btnFzActLog` / `btnTgActLog` — Sichtbarkeit gated auf Magaziner/Admin
- Logging-Aufrufe an Save/Delete, Zuweisung, Ausleihe/Rückgabe, Einsatz/Einsatz-Ende, Defekt/Defekt-erledigt, Prüfungen, Anfragen

### UI (`openModal`)

Tabellen-Modal mit fünf Spalten (Datum, Aktion-Pill, Datensatz, Beschreibung, User), Suchfeld (Datensatz/User/Beschreibung), Aktion-Filter-Dropdown und CSV-Export-Button. Auto-Refresh via `gema-activitylog-changed`-Event.

---

## Kontext-Chat (GemaChat, gema_chat.js)

GEMA-weiter Direkt-Chat zwischen Benutzern (Beteiligte, Lieferanten, Team) im **WhatsApp-Layout** — 💬-Button in der Nav (neben der Glocke, Ungelesen-Badge grün) → rechtes Panel (Mobile Vollbild): Chat-Liste → Thread mit Bubbles (eigene grün rechts, fremde weiss links), Tag-Trennern, Zeit + Lesehäkchen (✓✓ blau, wenn ALLE Gegenseiten gelesen haben), **Anzeigebild aus dem GEMA-Profil** (`user.avatar` via sys_profil, Initialen-Fallback in Rollenfarbe), Absender-Name + Rolle über fremden Bubbles. Eingebunden auf allen 82 Seiten mit `gema_notify_ui.js` (direkt danach); `gema_mobile_menu.js` verschiebt `.gc-btn` auf Mobile neben den Hamburger (wie die Glocke).

- **Kernidee — Kontext-Bezug**: `GemaChat.start({userId?|userIds?|email?|lieferantId?, kontext?, text?})` startet/öffnet einen Chat MIT Bezug: `kontext = {typ (offertanfrage|ausschreibung|bestellung|objekt|frei), refId, label, url, urlExtern?}`. Der Bezug erscheint als klickbarer Chip im Thread-Kopf und in der Liste — beide Seiten wissen sofort, worum es geht. `url` = Deep-Link für den Starter, `urlExtern` für die Gegenseite (z.B. Planer → pm_objekte, Lieferant → Dashboard); der Chip löst rollenrichtig auf (`erstelltVon` = url, sonst urlExtern). **Thread-Wiederverwendung**: gleicher Teilnehmerkreis + gleiche `refId` (`key` = sortierte userIds + refId) → derselbe Thread; ohne Kontext `|direkt`. Threads entstehen als Draft und werden erst mit der ersten Nachricht gespeichert. `lieferantId` löst ALLE aktiven User mit `user.lieferantId` auf (Team-Chat); `email` matcht profile.email/username; kein Treffer → GemaDialog-Hinweis «kein GEMA-Login».
- **Storage (moduleKey `chat`, ALLES cross-org → NUR `saveRecord`, NIE persistCollection)**: Thread `chat:` → `gema_chat_threads_pool_v1` (`{id,key,teilnehmerIds,teilnehmer:[{userId,name,firma,rolle}],kontext,erstelltVon,letzte:{text,von,vonName,ts},updatedAt}`) · Nachricht `chatmsg:<threadId>_<msgId>` — **pro Thread via `loadCollection`-Prefix-Filter** geladen (kein globaler Bind) + lokaler LRU-Cache `gema_chat_msgcache_v1` (100 Msgs/Thread, 30 Threads) · Lesestand `chatread:cr_<threadId>_<uid>` → `gema_chat_read_pool_v1` (**ein Record pro User+Thread — keine Schreibkonflikte**; Thread-Update schreibt nur der Sender). Ungelesen = `letzte.von !== ich && letzte.ts > mein Lesestand`. Polling: Meta 45 s + visibilitychange, offener Thread 10 s; eigene Nachrichten offline mit 🕓-Pending (lokal gecacht, Server-Merge ersetzt).
- **Benachrichtigung**: `chat_nachricht` an alle anderen Teilnehmer, gedrosselt 1×/30 min pro Thread+Empfänger (`gema_chat_notif_lock_v1`); Link = kontext-URL + `?chat=<threadId>`. **Deep-Link (KRITISCH)**: `?chat=` wird beim Script-Parse in sessionStorage gestasht (TTL 25 s) UND der Rollen-Redirect in gema_auth (`_isLoginOnly`-Zweig) reicht den `chat`-Parameter explizit an `roleDest` weiter — sonst verpuffte der Klick auf die Benachrichtigung auf index.html (Redirect → sys_workspace verwarf die Query, bevor gema_chat.js parste). Panel-Schliessen räumt den Stash ab.
- **Integrationen («💬 Rückfrage»)**: gema_offerten_tab.js (Planer → Lieferanten-Team, Bezug OA) · sys_lieferant_dashboard (OA-Karte → `a.absenderId`, Bestellungs-Karte → `bestellerUserId`) · pm_objekte Beteiligte-Tabelle (💬 bei E-Mail, Bezug Objekt) · pm_ausschreibungsunterlagen (idet: Unternehmer → `a.erstelltVonUserId`; pvgl Offertvergleich: Chips «Rückfrage zur Offerte» pro Bieter via `bet.userId`; Kontext-URL `?a=<id>` funktioniert für BEIDE Rollen) · pm_bestellungen Detail-Footer (→ Lieferanten-Team). Muster für neue Module: kleiner Wrapper, der `GemaChat.start` mit typ/refId/label/url(+urlExtern) aufruft — hinter `typeof GemaChat!=='undefined'` guarden.
- Kein eigenes Modul-Permission-Gating (nav-level, jeder eingeloggte User); sys_login bootet nicht (kein User). Tests: Node-Pure 18 (threadKey/Zeit/threadUnread/linkify) + Playwright chat_smoke 34 (Kontext-Start, Bubbles/Trenner/Häkchen, Zwei-User-Roundtrip mit Badge→Lesen→Antwort, Notify+Throttle+Link, Deep-Link über Rollen-Redirect, Picker, Beteiligten-Chat in pm_objekte).

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
| `kreditor_freigabe` | erp | on |
| `kreditor_entscheid` | erp | on |
| `regie_eingereicht` | regierapport | on |
| `regie_freigegeben` | regierapport | on |
| `regie_abgelehnt` | regierapport | on |
| `einsatz_geplant` | einsatzplan | on |
| `goodel_neu` | goodel | on |
| `goodel_abgestimmt` | goodel | on |
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
| `immo_auftrag_neu` | immobilien | on |
| `immo_auftrag_status` | immobilien | on |
| `immo_auftrag_offerte` | immobilien | on |
| `kleider_bezug` | arbeitskleider | on |
| `service_faellig` | service | on |
| `service_erledigt` | service | on |
| `stunden_eingereicht` | stundenerfassung | on |
| `stunden_entscheid` | stundenerfassung | on |
| `stunden_topfb` | stundenerfassung | on |
| `stunden_auszahlung` | stundenerfassung | on |
| `ferien_antrag` | stundenerfassung | on |
| `ferien_entscheid` | stundenerfassung | on |
| `revision_unterlagen_anfrage` | revisionsunterlagen | on |
| `revision_unterlagen_erhalten` | revisionsunterlagen | on |
| `revision_projektabschluss` | revisionsunterlagen | on |
| `revision_freigabe_erstellt` | revisionsunterlagen | off |
| `behoerde_formular_geaendert` | behoerden_formulare | on |
| `plan_dokument_freigegeben` | planablage | on |
| `plan_pendenz_zugewiesen` | planablage | on |
| `plan_pendenz_erledigt` | planablage | on |
| `abo_bestellung` | abos | on |
| `abo_status` | abos | on |
| `abo_tokens_knapp` | abos | on |
| `chat_nachricht` | chat | on |
| `schule_pruefung_geplant` | schule | on |
| `schule_pruefung_erinnerung` | schule | on |
| `schule_abgabe_eingegangen` | schule | on |
| `schule_resultate_publiziert` | schule | on |
| `schule_lernmittel_neu` | schule | on |
| `schule_klasse_beitritt` | schule | on |
| `pruefliste_vorschlag` | pruefliste | on |
| `pruefliste_freigegeben` | pruefliste | on |
| `pruefliste_abgelehnt` | pruefliste | on |

**Neue Module fügen ihre Event-Keys hier hinzu**, sonst greift kein Preferences-Filter.

### Einstellungs-Gating nach Modul-Zugriff (KRITISCH)

Das ⚙-Einstellungs-Panel der Glocke zeigt NUR Gruppen von Modulen, die das Konto nutzen kann — keine Einstellungen für Module ohne Zugriff (ein Garagist sieht z.B. nur Fahrzeug + Abos + Chat statt aller ~22 Gruppen). Logik in `gema_notify_ui.js`:
- **`MODUL_ZUGRIFF`** mappt jede EVENT_KEYS-Gruppe auf `{mods:[gema_auth-Modul-Keys — read genügt], roles:[Rollen-Präfixe für Cross-Org-Flüsse ohne Modul-Permission], immer:true}`. Beispiele: `werkzeug → werkzeugmanagement` + roles Lieferanten/Prüfer (Dashboard-Werkzeuge-Tab ist `_isLoginOnly`, nicht modul-gegated); `ausschreibung` + roles Architekt/Bauherrschaft (Vergabeantrag); `abos`/`chat` = `immer` (kontoweit). **Neue Event-Key-Gruppen MÜSSEN hier ergänzt werden** — Fallback für unbekannte Gruppen: existiert der Gruppen-Key als gema_auth-Modul, gilt dessen read-Permission, sonst sichtbar (fail-open, kein stilles Verstecken).
- **Selbstheilend**: Wer bereits Notifikationen einer Gruppe ERHALTEN hat, sieht deren Einstellungen immer (deckt E-Mail-Match-/lieferantId-Zustellung ab, z.B. externer Freigeber). `role_admin` sieht alles. Wurden Gruppen ausgeblendet, zeigt das Panel die Hinweiszeile «nur Module mit Zugriff».
- **Gleiches Prinzip in sys_profil.html**: Die Ausschreibungs-Einstellungen (Karte «Standard BKP-Auswahl» `#cardBkpDefaults` + Toggle «Dynamische BKP-Nummerierung» `#rowDynBKP`) sind nur mit `can('read','ausschreibungsunterlagen')` sichtbar.
- **Drift-Guard: `scripts/notify_prefs_gating_test.mjs`** (Layer 1 liest EVENT_KEYS/MODUL_ZUGRIFF/MODUL_LABELS live aus der App — failt bei jeder neuen Gruppe ohne Zuordnung/Label und bei mods-Tippfehlern; Layer 2 prüft die Sichtbarkeits-Matrix für Admin/Planer/Monteur/Garagist/Student/Lieferant/Bauherrschaft, Selbstheilung und das sys_profil-Gating). Hinweis: «objekte» ist KEINE Laufzeit-Gruppe (kommt nur in Demo-Seeds vor) — es gibt 22 echte Gruppen.

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

GemaNotify.getForCurrentUser();   // sortiert nach ts, neuste zuerst — FILTERT nach den Einstellungen des Users
GemaNotify.getForCurrentUser({includeDisabled:true}); // ohne Prefs-Filter (nur ⚙-Panel-Selbstheilung)
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

**Empfänger-Routing**: Mindestens eines von `empfaengerUserId`, `empfaengerRoleId` oder `empfaengerOrgId` setzen. **Preferences-Filter (zweistufig, KRITISCH)**: (1) Erstell-Filter in `push()` greift NUR bei persönlich adressierten Meldungen (`eventKey` + `empfaengerUserId` gesetzt, User hat das Event deaktiviert → Notifikation wird gar nicht erst erstellt). (2) **Anzeige-Filter in `getForCurrentUser()`** — Rollen-/Org-adressierte Pushes (z.B. `werkzeug_pruefung_faellig` an `role_magaziner`+Org) haben MEHRERE Empfänger mit unterschiedlichen Einstellungen und können beim Erstellen nicht gefiltert werden; deshalb filtert jeder Empfänger beim Anzeigen nach seinen eigenen Prefs (deaktivierter eventKey → Meldung unsichtbar in Panel/Glocke/Toasts, `getUnreadCount` zählt sie nicht). Bug bis 07/2026: dieser Anzeige-Filter fehlte — Rollen-Meldungen umgingen die Einstellungen komplett. `{includeDisabled:true}` liefert ungefiltert und wird NUR von der ⚙-Panel-Selbstheilung genutzt (sonst verschwände eine deaktivierte Gruppe aus dem Panel und wäre nie wieder aktivierbar). Test: `scripts/notify_prefs_filter_test.mjs` (12 Checks).

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
- **Module Grid**: SVG-Icon-Tiles mit Status-Dot (offen/berechnet), Hover-Gradient, Entfernen. **Kachel-hrefs tragen das Eimer-Objekt als `?objekt=<id>`** (07/2026) — das Zielmodul startet garantiert auf dem Workspace-Objekt (gema_objekte_api setzt es als aktives Objekt; Module mit eigenem Objekt-Filter wie der Plandialog wählen es direkt vor), auch beim Öffnen in einem neuen Tab
- **Notes Panel** (360px): Amber-Design, Seiten-Tabs, Contenteditable mit Checklist-Toggle, Admin-Hierarchie-Baum
- **Activity Feed**: Farbige Avatars mit Palette
- **Beteiligte**: Aufklappbar mit Chevron-Rotation
- **Toast**: Animierte Pill (2.2s auto-dismiss)
- **Responsive**: Notes unter Content bei ≤1024px, Hamburger-Drawer bei ≤720px

### Modul-Katalog (MODULES/MODULE_CATS) — bei jedem neuen Modul nachführen (KRITISCH)

Der Eimer-Modul-Picker speist sich aus dem statischen Katalog `MODULES` + `MODULE_CATS` in sys_workspace.html (07/2026 komplett nachgeführt: 65 Module in 11 Kategorien — Sanitär inkl. aller sa_/sb_-Module, Gas, Heizung, Lüftung, Brandschutz, komplettes PM inkl. ERP/Einsatzplan/Stunden/Regie/Bestellungen/Revision/Behörden/Pläne/Plandialog/Goodel, Hygiene & Betrieb, Schadensdokumentation, Spenglerei, Infrastruktur inkl. Wareneingang/Arbeitskleider, Immobilien). Regeln: `id` = Datei-Basename (wie GemaAuth.FILE_MAP), `href` = `<id>.html`, Icon aus dem lokalen `ICONS`-Set. **Picker/Vorlagen-Editor/Suche filtern nach Modul-Permission** (`_wsModAllowed`: FILE_MAP → `GemaAuth.can('read', key)`; Dateien ohne FILE_MAP-Eintrag — Hub-Seiten — bleiben sichtbar); bereits in Eimern liegende Module rendern unabhängig davon weiter. Drift-Guard: `scripts/workspace_module_test.mjs` (74 Checks — statisch: jede href-Datei existiert, jede id in FILE_MAP, Pflicht-Modulliste; Browser: Picker-Inhalt, Kachel-Add, Permission-Filter). Test-Hook `window._wsModulesHook`. **Neue Module: MODULES + ggf. `_WS_STATUS_CFG` ergänzen, sonst failt der Test bewusst nicht — die Pflicht-Liste im Test miterweitern.**

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
- **KRITISCH**: Neue direkte Supabase-Fetches IMMER mit `(GemaSync.getAuthToken() || SB_KEY)` als Bearer bauen; user:/org:/role:-Writes NIE direkt, sondern über GemaSync (Interception). Admin-Konten aus GEMA erstellen funktioniert unverändert (läuft über die Function). Nicht abgedeckt (Stufe 2): per-Org-RLS der Cross-Org-Collections (uid-Containment), private Storage-Reads, Stripe-Webhook.
- **Token-lose Session ≠ leere Cloud (KRITISCH, Praxisfall 17.07. «es zeigt mir keine Daten mehr an»)**: Eine Session OHNE `token` (Anmeldung aus der Zeit vor Secure v1, oder Token nach einem 401 entfernt) liest mit dem anon-Key — unter aktivem RLS kommt dann **HTTP 200 + leer** zurück (kein 401, kein Redirect): alle per-Record-Pools wirken leer, und `bindCollection` hätte die gefüllten lokalen Caches mit `[]` überschrieben. Dreistufiger Schutz in gema_sync.js: (1) **Auto-Logout** — `_tokenlessBootCheck()` (Seitenstart +1.2 s) prüft die gema-auth-Function via `?action=diag`; antwortet sie (Status ≠ 404 → Secure aktiv), räumt `_autoLogout()` die Session und leitet mit «Sitzung abgelaufen» zu `sys_login.html?r=…` (wie beim 401). **Loop-Bremse**: max. 1 Auto-Logout pro 10 min (`gema_sync_relogin_ts_v1`) und NIE bei Function-404 (Legacy-Modus ohne Function würde sonst endlos kreisen) — dann stattdessen (2) der amber Banner `_showRelogin()` («Sitzung ohne gültiges Anmelde-Token — Neu anmelden», `#gema-sync-relogin-banner`, nie auf sys_login). (3) `bindCollection`-Guard: eine LEERE Collection-Antwort einer token-losen Session leert einen GEFÜLLTEN Cache NIE. Leerer Cache (frisches Gerät) + gültige Tokens verhalten sich wie bisher; Writes sind ohnehin sicher (RLS lehnt ab → Outbox). Test-Harness: `seed()` in `scripts/rolematrix_harness.mjs` liefert Sessions mit Fake-JWT (`opts.tokenlos:true` für den Negativfall); Suiten mit eigenem Session-Seeding brauchen ebenfalls ein Token, sonst loggt der Boot-Check sie mitten im Test aus. Drift-Guard: `scripts/sync_tokenless_guard_test.mjs` (18 Checks inkl. Loop-Bremse + Legacy-404).

### Secure v2 — Härtung nach Sicherheits-Review (07/2026, `SECURITY_REVIEW_2026-07.md`)

Umsetzung der Review-Befunde S2–S7 + S1-Register-Drossel (Branch `claude/security-measures-review-5y6047`):
- **Geteiltes `netlify/functions/_jwt.js`** (`requireAuth(event)` → Claims|null, HS256 gegen `GEMA_JWT_SECRET`, fail-closed). **Alle KI-Proxies** (`claude-rewrite/extract/formfields/plan`) und **`form-watch`** sind jetzt JWT-gegated (kein offener, kostenpflichtiger Anthropic-Proxy mehr) — Clients senden `Authorization: Bearer` (`gema_claude.js._authHeaders`, `pm_behoerden_formulare`, `gema_abo_api.startStripeCheckout`). **Neue Netlify-Function, die kostenpflichtige/externe Aktionen macht: IMMER `requireAuth` am Handler-Anfang.**
- **SSRF (`form-watch.js` + `form-watch-cron.js`)**: `_safeUrl` löst den Hostnamen per DNS auf und prüft JEDE IP gegen private/link-local/multicast-Bereiche (schlägt Dezimal-/Hex-IPs, IPv6, DNS-Rebinding); Redirects werden `manual` verfolgt und jedes Ziel erneut geprüft. Neue serverseitige URL-Fetches nach diesem Muster bauen.
- **`gema-auth.js`**: Selbst-Update in `persist_auth` auf Feld-Whitelist `{name,profile,avatar,einstellungen,password}` beschränkt — alle übrigen Felder kommen aus dem DB-Stand (kein Self-Grant von `abo`/`planerPremium`/`lieferantId`/`gastZugaenge`). **`register` hat eine fail-open IP-Sliding-Window-Drossel** (`GEMA_REG_MAX_PER_HOUR`, Default 8; `throttle:reg:<ip>`-Records im auth-Modul; Studierenden-Registrierung nicht betroffen).
- **`stripe-checkout.js`** (weiterhin inaktiv bis Go-Live): Auth-Gate, `client_reference_id`/Metadata aus dem Token, **client-gewählter Betrag wird nicht mehr verrechnet** (Preis nur via `STRIPE_PRICE_MAP`; ad-hoc-Betrag nur mit `STRIPE_ALLOW_ADHOC=1`).
- **`goodel-share.js`**: `extSecret`-Vergleich timing-safe (`crypto.timingSafeEqual`).
- **XSS (S4)**: Der kanonische Voll-Escaper (`String(s==null?'':s).replace(/[&<>"']/g,…)`) ist jetzt in allen früher schwachen Escapern (`esc`/`E`/`_esc`/`esc2` in pm_besprechung, pm_crbx, ab_quiz, if_werkzeug, if_fahrzeug, sys_workspace, hy_inspektion, gema_offerten_tab, pm_ausschreibungsunterlagen, sys_lieferant_dashboard); rohe Sinks (Objekt-Namen/Adressen, `pdfDataUrl`-hrefs, `<option>`-Labels) sind gewrappt. **Neue Escaper IMMER `&<>"'` abdecken** (siehe Code-Patterns).
- **Per-Org-RLS (S1a)**: `supabase/gema_rls_v2_orgscope.sql` (+ `gema_rls_v2_rollback.sql`) scopt NUR 10 eindeutig single-org-Collections (erp, schadensbericht, dachbericht, plaene, behoerden_formulare, einsatzplan, stundenerfassung, arbeitskleider, goodel, schnellausschreibung) auf `auth.jwt()->>'org'`; alle anderen bleiben wie v1. **Manueller, collection-weise getesteter Rollout durch den Betreiber** (Pre-Flight-Audit + Zwei-Org-Test im Skript) — Collections mit legitimen Cross-Org-Pfaden (objekte/Gast, regierapport/Freigeber, abnahme, immobilien/Handwerker, planablage/Freigaben, legionellen/Labor) sind bewusst ausgelassen.
- **Pilot-Härtung (Selbst-Registrierung + Login-Drossel)**: Selbst-Registrierung ist standardmässig AUS — `actionRegister`/`actionRegisterStudent` hinter `GEMA_REGISTRATION_OPEN`/`GEMA_STUDENT_REGISTRATION_OPEN` (Default 0 → 403); `sys_login.html` blendet die Registrier-Einstiege aus (`REGISTRATION_OPEN=false` + Admin-Hinweis). Einladungs-Aktivierung (`?invite=`) + Admin-Anlage unberührt. Konten legt der Admin an (auch für Externe). `actionLogin` hat eine Brute-Force-Drossel pro IP+Benutzername (nur Fehlversuche zählen, Erfolg leert den User-Zähler; FAIL-OPEN, gehashte Keys; Env `GEMA_LOGIN_MAX_IP`/`_MAX_USER`/`_WINDOW_MIN`). Alle Throttle-Records liegen gehasht im auth-Modul (`throttle:<ns>:<sha>`). **Reine Zugangs-/Ablauf-Änderung, kein Datenverlust.** E-Mail-Verifikation bewusst zurückgestellt (kein Mailversand vorhanden — bei Einladungs-only ist der Invite-Token der Nachweis). Konsolen-Schritte (Edge-Access via Netlify/Cloudflare, RLS v1 verifizieren, RLS v2 ausrollen) siehe `SECURITY_REVIEW_2026-07.md` › «Pilot-Betrieb».

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
| Immobilien-Liegenschaften | `immobilien` | `imlg:` | `gema_im_lg_pool_v1` |
| Immobilien-Wohnungen | `immobilien` | `imwhg:` | `gema_im_whg_pool_v1` |
| Immobilien-Mietverhältnisse | `immobilien` | `immv:` | `gema_im_mv_pool_v1` |
| Immobilien-Handwerkeraufträge | `immobilien` | `imauf:` | `gema_im_auf_pool_v1` |
| Immobilien-Mieterstamm | `immobilien` | `immieter:` | `gema_im_mieter_pool_v1` |
| Immobilien-Mietzahlungen | `immobilien` | `imzahl:` | `gema_im_zahl_pool_v1` |
| Immobilien-NK-Abrechnungen | `immobilien` | `imnk:` | `gema_im_nk_pool_v1` |
| Arbeitskleider-Artikel | `arbeitskleider` | `akart:` | `gema_ak_artikel_pool_v1` |
| Arbeitskleider-Bezüge | `arbeitskleider` | `akbez:` | `gema_ak_bezug_pool_v1` |
| Goodel-Umfragen | `goodel` | `goodel:` | `gema_goodel_v1` (Cache-Key = alter Blob-Key, für die Auto-Migration) |
| Armaturen-Katalog | `armaturen` | `arm:` | `gema_armaturen_pool_v1` |
| Bestellungen (Anlagen) | `bestellungen` | `best:` | `gema_best_pool_v1` |
| Revisions-Dossiers | `revisionsunterlagen` | `revd:` | `gema_rev_pool_v1` |
| Revisions-Kapitelvorlagen | `revisionsunterlagen` | `revv:` | `gema_rev_vorl_pool_v1` |
| Revisions-Unterlagenanfragen | `revisionsunterlagen` | `reva:` | `gema_rev_anfr_pool_v1` |
| Behörden-Formulare | `behoerden_formulare` | `bform:` | `gema_bform_pool_v1` |
| Behörden-Formular-Vorlagen | `behoerden_formulare` | `bformv:` | `gema_bform_vorl_pool_v1` |
| Plan-Projekte | `plaene` | `plnprj:` | `gema_pln_prj_pool_v1` |
| Plan-Seiten (+ Flächen) | `plaene` | `plnseite:` | `gema_pln_seiten_pool_v1` |
| Planablage-Dokumente | `planablage` | `pabd:` | `gema_pab_dok_pool_v1` |
| Planablage-Annotationen | `planablage` | `paba:` (ein Record pro Dokument, id = dokId) | `gema_pab_annot_pool_v1` |
| Planablage-Pendenzen | `planablage` | `pabp:` | `gema_pab_pend_pool_v1` |
| Abo-Preiskonfiguration | `abos` | `abocfg:` (EIN Record `abocfg:main`) | `gema_abo_cfg_v1` |
| Abonnemente | `abos` | `abosub:` | `gema_abo_sub_pool_v1` |
| Token-Ledger | `abos` | `abotok:` | `gema_abo_tok_pool_v1` |
| Chat-Threads | `chat` | `chat:` | `gema_chat_threads_pool_v1` |
| Chat-Lesestand | `chat` | `chatread:` | `gema_chat_read_pool_v1` |
| Chat-Nachrichten | `chat` | `chatmsg:<threadId>_` (pro Thread via loadCollection) | `gema_chat_msgcache_v1` (LRU) |
| Klassen (Schule) | `schule` | `sklasse:` | `gema_schule_klassen_pool_v1` |
| Lernmittel | `schule` | `smat:` | `gema_schule_mat_pool_v1` |
| Aufgaben-Pool | `schule` | `saufg:` | `gema_schule_aufg_pool_v1` |
| Prüfungen (ohne Lösungen) | `schule` | `spruef:` | `gema_schule_pruef_pool_v1` |
| Prüfungs-Lösungen (nur Dozenten-Seiten) | `schule` | `spruefl:` | `gema_schule_loes_pool_v1` |
| Prüfungs-Abgaben | `schule` | `sabg:abg_<pruefId>__<uid>` (pro Prüfung/eigener Record via loadCollection/loadRecord — nie global gebunden) | `gema_schule_abg_local_v1` (nur eigene, Offline-Spiegel) |
| Prüfliste-Standardpunkte (global+org) | `pruefliste` | `prstd:` | `gema_pr_std_pool_v1` |
| Prüfliste-Org-Overrides | `pruefliste` | `prov:` | `gema_pr_ovr_pool_v1` |
| Prüfliste-Objektpunkte | `pruefliste` | `probj:` | `gema_pr_obj_pool_v1` |
| Prüfliste-Begehungen | `pruefliste` | `prbeg:` | `gema_pr_beg_pool_v1` |
| Favoriten (Übersichtsseite) | `favoriten` | `fav_<userId>` (EIN Record pro User via loadRecord/saveRecord) | `gema_favourites_<userId>` |

**Favoriten der Modulübersicht (index.html) — pro User + Cloud-synchron:** Die Stern-Favoriten der Kacheln (`toggleFav`) liegen jetzt **pro User** in der Cloud (moduleKey `favoriten`, `fav_<userId>` via `GemaSync.saveRecord`/`loadRecord`) — damit hat der User seine Favoriten auf allen Geräten. Gerätelokaler Cache `gema_favourites_<userId>` (Stale-while-revalidate: sofort aus Cache rendern, dann `_favCloudPull()` beim Start → **Cloud gewinnt**, bei Abweichung Neu-Render der Sterne + Fav-Sektion). Der alte geräteweite Key `gema_favourites` ist die einmalige **Migrations-Quelle** (wird beim ersten Start ohne per-User-Cache übernommen und hochgeladen). Kein GemaNotify-Event. Test-Hooks `window._favHooks`; Test `scripts/favoriten_sync_test.mjs` (19 Checks: Zwei-Geräte-Sync, Entfernen, Cross-User-Isolation, Migration — In-Memory-PostgREST-Mock über mehrere Kontexte).

**Produktkatalog (gema_produktkatalog_api.js) — Migration & Besonderheiten:** Produkte/Lieferanten/Offertanfragen liegen jetzt per-Record in der Cloud (vorher: ein Blob pro Key `gema_produktkatalog_v1`/`gema_lieferanten_v1`/`gema_offertanfragen_v1` via `_GemaDB.saveToModule` → Last-Write-Wins, das Produkte konkurrierender Lieferanten überschreiben konnte). Die lokalen Blobs (`{produkte,log}` etc.) bleiben als Lese-Cache, alle bestehenden Getter (`getProdukte`, `getAllLieferanten`, …) laufen unverändert. `loadFromSupabase()` macht jetzt den Per-Record-Pull (mit einmaliger Legacy-Blob-Migration) und feuert `gema-produkte-loaded`; `save()` macht Diff-Saves per `GemaSync.persistCollection`. Neu: **`GemaProdukte.ready`** (Promise, resolved nach dem ersten Cloud-Pull) — Demo-Seeding (`seedDemoData`/`seedDemoLieferanten`) wartet darauf, sonst würden auf frischen Geräten Demo-Daten in die Cloud gepusht. Der `log` in `_data.log` wird nicht mehr cloud-synct (nur lokal). Fallback auf den alten `_GemaDB`-Blob, falls `gema_sync.js` nicht geladen ist.

**Objekte (pm_objekte) — Migration & Besonderheiten:** Objekte/Beteiligte liegen jetzt per-Record in der Cloud (vorher: ein Blob `gema_objekte_v1` mit Last-Write-Wins → Objekte von Kollegen erschienen nie / wurden beim Speichern gegenseitig gelöscht). Die zentrale Sync-Logik steckt komplett in `gema_objekte_api.js`:
- `_pullFromCloud()` lädt bei **jedem** Seitenstart objekte (`objekt:`) + beteiligte (`bet:`) frisch via `GemaSync.bindCollection`, baut daraus den lokalen Blob `gema_objekte_v1` (unverändertes Schema `{objekte, beteiligte, activeObjektId}`, damit alle bestehenden Leser weiterlaufen) und feuert das Event `gema-objekte-loaded`.
- Legacy-Migration: ist die Per-Record-Cloud leer, wird der alte Blob (Cloud-Row `module_key=objekte,data_key=gema_objekte_v1` ODER localStorage) einmalig aufgesplittet und per-Record hochgeschrieben (idempotent per `id`).
- **`activeObjektId` ist reine Geräte-UI** und wird NUR lokal gehalten (`gema_active_objekt_v1`), nie in die Cloud — sonst überschreibt die Objekt-Auswahl eines Users die der anderen.
- Schreiber: `GemaObjekte.persistBlob(blob)` (voller Stand, mit Löschungen — nur `pm_objekte.html`, der autoritative Editor) bzw. **`GemaObjekte.upsertObjekt(obj)`** (ADD-ONLY, kein Diff/Delete — für Quick-Add aus `sp_dachbericht.html`, `sd_schadensbericht.html`, `sys_workspace.html`; verhindert, dass ein noch nicht fertig geladener lokaler Stand fremde Objekte aus der Cloud löscht).
- Bericht-Module rendern bei `gema-objekte-loaded` neu (sonst bliebe „Objekt nicht gefunden" stehen, bis der Cloud-Pull durch ist).

### Storage-Audit der _GemaDB-Blob-Module (abgeschlossen) — Regeln für per-Objekt-Keys

Die verbliebenen `_GemaDB`-Module (Blob pro data_key, KEINE Multi-Tenant-Pools) wurden auditiert und gehärtet. Die drei Bug-Klassen und ihre verbindlichen Regeln:

1. **Init-Key-Regel (KRITISCH)**: `_GemaDB.init(modul, dataKeys)` lädt NUR die angefragten Keys. Module mit per-Objekt-Storage (`BASE__<objektId>`) MÜSSEN beim Boot `[...new Set([BASE, GemaObjekte.storageKey(BASE)])]` laden — sonst liest die Seite bei aktivem Objekt ins Leere, obwohl dorthin gespeichert wird (Daten „weg", liegen aber in der Cloud). Umgesetzt in: pm_abnahme, pm_besprechung, hy_w12, hy_inspektion, pm_kostenkontrolle, pm_terminplan, sb_apparateliste, sa_fettabscheider, sa_solaranlage, sa_abwasserhebeanlage, sa_oelabscheider, pm_baustelle (hatte GAR keinen init — Saves waren No-Ops).
2. **Objektwechsel zur Laufzeit → `_GemaDB.ensure([neuerKey])`**: neue API in gema_db.js — lädt fehlende data_keys des aktuellen Moduls in den Cache nach (bereits gecachte werden NIE überschrieben). Muster in `onObjektSelect`: `GemaObjekte.setActiveId(sel.value||'')` → `_sk` NEU berechnen (`GemaObjekte.storageKey(BASE)`) → `_GemaDB.ensure([_sk]).then(load+calc)`. Ohne das schreibt persist() weiter in den Key des Boot-Objekts (Daten landen im falschen Projekt). Umgesetzt in: sb_apparateliste, sa_fettabscheider, sa_solaranlage, sa_abwasserhebeanlage, sb_du_zusammenstellung, sb_laengenausdehnung, sb_niederschlag, sb_vonroll. **Kein eingefrorener Alias** (`const SK = _sk` — sb_vonroll-Falle): `_sk` wird beim Wechsel neu zugewiesen, ein const-Alias liesse Save/Load im Boot-Key hängen. Liegt der Loader in der Haupt-IIFE (Meta-IIFE kommt nicht ran — `loadLocal is not defined` war ein SEIT JE stiller Boot-Fehler in niederschlag/vonroll), exponiert die Haupt-IIFE `window._objReload` (stiller Reload des aktuellen `_sk`, ohne Toast/Flash).
3. **Globale Blobs org-/user-scopen**: `el_angaben` (per-Objekt umgebaut), `ab_sephir`/`ab_berufsschule` (Org-Key `BASE+'__org_'+orgId`, flacher Key bleibt Lese-Fallback für Altdaten), `ab_quiz` (dreigeteilt: officialQ = Admin-Blob, NUR Admin-Aktionen schreiben ihn; **Community-Fragen per-Record** `quizq:<id>` via `GemaSync.saveRecord` — moduleKey `quiz`, Cache-Key = alter Blob-Key `gema_quiz_community_v1` → bindCollection migriert automatisch; **Scores pro User** `gema_quiz_scores_v1__user_<uid>`). Der alte `saveState()` schrieb bei JEDER Aktion alle drei Blobs — zwei gleichzeitige Nutzer überschrieben sich gegenseitig. sys_beta bindet fürs Review-Panel den `quizq:`-Pool direkt (der frühere Cross-Modul-Read via `_GemaDB.init` fand die Quiz-Rows nie).

Bewusst NICHT umgestellt (geprüft, ok): sb_grobauslegung (kein Objekt-Dropdown → statischer Boot-Key korrekt), sb_ausstosszeiten/sb_druckdispositiv (GemaAutoSave übernimmt die per-Objekt-Persistenz), sys_beta-Statusboard (admin-internes Tool, Single-Writer). Verifikation: Playwright-Smoke (33 Checks — Objektwechsel/ensure/Save-Ziel, Legacy-Migration quizq:, Org-Scoping, per-User-Scores; Muster im Repo-Verlauf) + Boot-Smoke aller 20 angefassten Seiten.

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

Auf ≤640px zeigen ALLE Hero-Varianten nur Emoji-Icon + Titel (User-Vorgabe 07/2026): `.gema-hero` (Berechnungsmodule — `.gema-hero-norm`, `.gema-hero-sub`, `#gemaDataflowPill` ausgeblendet), **`.hero > .hero-in`** (if_/pm_-Module — `.hero-sub`, `.hero-pills`, `.hero-pill`, `.hero-badge`, `.hero-stats` ausgeblendet, Padding 10px) und die **Hub-Heroes** (`.hero:has(> .hero-inner)` auf index/sb_index/ab_index/pm_ausschreibung — Eyebrow, Beschrieb, Badges UND Stats-Zeile weg, nur der Titel). Die `.project-bar` ist zweispaltig kompakt (Objekt volle Breite, Bearbeiter/Datum/SIA-Phase halbbreit). Damit beginnt der Inhalt im ersten Screen. Desktop/Tablet unverändert. Drift-Guard: `scripts/mobile_kompakt_test.mjs`.

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
| `gema_aktivitaetslog.js` | **Aktivitätenlog** für Infrastruktur-Module. `GemaActivityLog.log({modul,modulRecordId,modulRecordName,aktion,beschreibung,details})` pusht einen Eintrag; `getForModul(modul, orgId?)` liefert die gefilterte Historie. Cloud-First via `gema_sync.js` (Collection `gema_aktivitaetslog_v1`, moduleKey `aktivitaetslog`, prefix `log:`). `openModal({modul,titel,recordId?,recordName?})` zeigt das einheitliche Tabellen-Modal mit Suche, Aktion-Filter und CSV-Export — mit `recordId` gefiltert auf EINEN Datensatz (per-Werkzeug-Historie). |
| `gema_abo_api.js` | **Abo-, Preis- & Token-System** (`window.GemaAbo`). Preiskonfiguration `abocfg:main`, Abos `abosub:*`, Token-Ledger `abotok:*` (moduleKey `abos`). Preis-Engine (Zusatz-Gewerk, Jahres-/Promo-Rabatt, MwSt, Rappenrundung), `charge(aktionId)` für Token-Verbrauch, `bestellen()/setStatus()`, Stripe-Checkout-Client (vorbereitet). Konsumenten: sys_preise, sys_abos. Siehe «Abo- & Preissystem». |
| `gema_anlagenwahl.js` | Anlagenauswahl-Widget für Berechnungen |
| `gema_avatar.js` | Profilbild-Upload + Renderer. `GemaAvatar.render(user, size, opts)` liefert HTML mit `<img>` oder Initialen-Fallback. `compress(file)` resized auf 256×256 JPEG. Avatar als Base64 unter `user.avatar` |
| `gema_armaturen_api.js` | **Armaturen-Katalog** (ζ + kvs pro Dimension, Druckverlustdiagramm, Lieferanten-CRUD). `getDp(id,dn,{Q_ls,v_ms,rho})` (kvs bevorzugt: `Δp=(Q/kvs)²·100 kPa`, sonst `ζ·ρ/2·v²`), `computeSelectionDp(sel,ctx)` für Berechnungsmodule, `curvePoints(id,dn,opts)` für generierte Kennlinien, `upsertArmatur`/`deleteArmatur` (Defaults via Tombstone). Cloud per-Record (`arm:`), Defaults bleiben lokaler Seed. |
| `gema_armaturen_picker.js` | **Armaturen-Auswahl-Widget** für Berechnungsmodule: Katalog mit Zähler + ζ/kvs pro aktueller Dimension, manuelle Einträge (Name + Δp, Einheit kPa/Pa/mbar), Diagramm-Overlay (Lieferanten-Upload oder generierte Δp-Q-Kurve mit Betriebspunkt), `drawCurve(canvas,…)` für PDF-Sektionen. Modi `multi` und `kvs-single` (Zirkulations-Regulierventil). |
| `gema_auth.js` | Auth, Rollen, Orgs, Permissions, Cloud-Recovery |
| `gema_aushang.js` | **Aushang (Mieter-Mitteilung, A4-Poster)** — `GemaAushang.open({vorlageId?,gespeichert?,datum?,datumBis?,von?,bis?,objektName?,onSave})` öffnet den Dialog (Vorlage/Titel/Text/Zusatz/Kontakt, Pflicht Datum + Zeit von–bis), `print(data)` das Druckfenster, `vorlagen()` die wirksame Liste (6 Defaults: Wasser/Strom/Heizung/Boiler/Filter/Allgemein, überlagert von `org.settings.aushang.vorlagen` — «💾 Als Vorlage speichern» überschreibt/ergänzt org-weit). Siehe Abschnitt «Aushang (Mieter-Mitteilung)». Konsumenten: pm_erp, pm_einsatzplan, sv_service |
| `gema_autosave.js` | Auto-Save in Berechnungsmodulen |
| `gema_chat.js` | **GEMA-weiter Kontext-Chat** (`window.GemaChat`, WhatsApp-Layout). `start({userId?|email?|lieferantId?, kontext:{typ,refId,label,url,urlExtern?}, text?})` startet einen Chat mit klickbarem Bezug-Chip (Ausschreibung/Offertanfrage/Bestellung/Objekt); Threads per-Record cross-org (`chat:`/`chatread:`, Nachrichten `chatmsg:<threadId>_` via Prefix-loadCollection — NIE persistCollection), Anzeigebild aus dem Profil, Notify `chat_nachricht` (30-min-Throttle) mit `?chat=`-Deep-Link. Siehe Abschnitt «Kontext-Chat». |
| `gema_bestellungen_api.js` | **Bestellprozess für Anlagen** (`window.GemaBest`): per-Record-Pool `best:`, Nummernkreis `BST-JJJJ-NNN` pro Org, Status-Übergänge `create/bestaetigen/ablehnen/geliefertMelden/empfangBestaetigen/stornieren` (je mit Verlauf + Notifikation), `bind()`/`getForOrg()`/`getForLieferant()`, `badgeHtml`/`fmtChf`. Konsumenten: pm_bestellungen, pm_ausschreibungsunterlagen (Gewinner-Sektion), sys_lieferant_dashboard (🛒-Tab). |
| `gema_bkp_katalog.js` | **Standard-BKP-Katalog (CRB Baukostenplan)** als geteilte Referenz: `window.GemaBKP = {KOMPLETT, flat(), level(id), byId(id)}` — 349 Einträge, 1:1 aus `BKP_KOMPLETT` (pm_ausschreibungsunterlagen) generiert, reduziert auf `{id,titel,kinder}` (die Ausschreibungs-Metadaten modulKey/istLieferung/lizenz bleiben dort). Ebene aus der Nummer: 1-stellig=0 · 2-stellig=1 · 3-stellig=2 · mit Punkt (254.0)=3. Konsument: pm_erp (BKP-Titel in Offerten). |
| `gema_revision_pdf.js` | **Revisionsunterlagen HTML/Print-Export** für das Übergabedossier. `GemaRevisionPDF.exportPrint(dossier, {org,user,objektName,objektAdresse,shareUrl})` — Muster gema_schaden_pdf: Branding `org.settings.pdfFarben` + `org.logoVector||org.logo` (Fallback GEMA-SVG), Kontrastschutz-Helfer dupliziert, @page-Margin-Boxen, Cover/TOC/Kapitel, Dokument-Anhänge als klickbare Beilagen, optionaler Cover-QR (qrcodejs im Print-Fenster). Konsument: pm_revisionsunterlagen. |
| `gema_coachmarks.js` | Onboarding-Touren |
| `gema_db.js` | Legacy Storage-Layer (`_GemaDB`). Cloud-First, aber Blob-pro-Modulkey. Neue Module nutzen stattdessen `gema_sync.js`. **`_GemaDB.ensure(dataKeys)`**: lädt fehlende Keys des aktuellen Moduls zur Laufzeit in den Cache nach (für per-Objekt-Keys beim Objektwechsel — siehe «Storage-Audit der _GemaDB-Blob-Module»). |
| `gema_sync.js` | **Cloud-First Per-Record-Sync.** Single source of truth Supabase, eine Row pro Datensatz, Diff-Saves, Offline-Banner. `bindCollection`/`persistCollection` als Modul-Helper. Siehe „Cloud-First Storage-Architektur". |
| `gema_dialog.js` | Eigene Alert/Confirm/Prompt-Dialoge im GEMA-Style. `window.alert` global ueberschrieben. `GemaDialog.confirm({title,message,danger}).then(ok=>…)` und `GemaDialog.prompt(...)` als Promise-API. `window.confirm` bleibt nativ (sync), neue Stellen sollen GemaDialog nutzen. **`opts.html:true`** = `message` ist bereits fertiges HTML (vom Aufrufer selbst escaped, wird NICHT erneut escaped) — für formatierte Dialoge (z.B. Diagnose-Ausgaben) |
| `gema_feedback.js` | Feedback-Overlay mit Annotation |
| `gema_hoehe.js` | **Höhen-Übernahme ab Karte (swisstopo)** — `GemaHoehe.attach({container, stateId, autosaveModul, mode:'m'\|'mbar', applyLabel, onApply})`. Adresse → Geocoding (SearchServer) → LV95 → Höhendienst `api3.geo.admin.ch/rest/services/height` (swissALTI3D) → m ü.M.; gezoomte Luftbild-Mini-Karte + Vollbild-Modal mit verschiebbarem Punkt (jede Verschiebung fragt die Höhe neu ab), «Übernehmen» schreibt ins Modul-Feld. Siehe Abschnitt «Höhen-Übernahme ab Karte». |
| `gema_lu_api.js` | LU-Zusammenstellung Cross-Modul-API |
| `gema_mobile_menu.js` | Hamburger-Menü auf Mobile (v2, iOS-Feel): Sektionen Navigation (Startseite/Projekte, permission-guarded) · Zuletzt verwendet (via `GemaRecent`) · Aktionen (Seiten-Buttons, ohne Chevron) · Verwaltung (admin) · Konto (Einstellungen/Feedback/Abmelden); tappbarer User-Block → sys_profil; Footer «Als App installieren» (wenn GemaPWA bereit); Swipe-nach-rechts schliesst; Body-Lock via GemaScroll. **Verschiebt Notify-Glocke (`.gn-btn`) UND Chat-Button (`.gc-btn`) auf Mobile NEBEN den Hamburger** (Klasse `gn-btn--nav`) statt sie mit `.g-nav-right` zu verstecken — Badges bleiben sichtbar; Desktop-Resize stellt sie zurück |
| `gema_notify.js` | Notifikations-Engine |
| `gema_notify_ui.js` | Glocke + Toast-UI. Benachrichtigungs-Einstellungen (⚙ in der Glocke) **nach Modul gruppiert** (`MODUL_LABELS`-Map + GemaAuth-Fallback, Gruppen alphabetisch, Events je Gruppe sortiert) mit ✕-Button, ESC und Backdrop-Klick zum Schliessen — **und nach Modul-Zugriff GEFILTERT** (`MODUL_ZUGRIFF`, siehe «Einstellungs-Gating nach Modul-Zugriff»). Neue EVENT_KEYS-`modul`-Werte in `MODUL_LABELS` UND `MODUL_ZUGRIFF` ergänzen (Drift-Guard `scripts/notify_prefs_gating_test.mjs`) |
| `gema_objekte_api.js` | Objekte/Projekte Cross-Modul-API |
| `gema_offer_request.js` | Externe Offertanfragen |
| `gema_offerten_tab.js` | Offerten-Tab in Berechnungsmodulen |
| `gema_pdf.js` | PDF-Export via html2canvas |
| `gema_print_a4.js` | **A4-Blatt-Vorschau für Druckfenster**: `GemaPrintA4.apply(win)` nach `w.document.close()` legt den Fenster-Inhalt auf ein weisses A4-Blatt auf grauer Bühne (nur Bildschirm; Druck unverändert — @page-Regeln gelten, `position:fixed`-Bedienleisten bleiben draussen). Verdrahtet in pm_regierapport, pm_bestellungen (Bestellschein), pm_stunden (Monatsblatt), iv_immobilien (NK-Abrechnung), ab_pruefungen, pm_behoerden_formulare (Datenblatt), if_wareneingang (Bestell-Listen — NICHT Etiketten, eigene @page-Grösse); pm_erp rendert seine Blätter selbst (`.sheet` pro Sektion). NIE auf Etiketten-Fenster anwenden. |
| `gema_schaden_pdf.js` | **Schadensbericht HTML/Print-Export** nach `vorlagen/bericht_wasserschaden_vorlage.html`. `GemaSchadenPDF.exportPrint(schaden, {org,user,objektName,objektAdresse})` öffnet neues Fenster mit A4-Layout (window.print()). Logo-Branch: `org.logoVector || org.logo` wenn vorhanden, sonst eingebettetes GEMA-SVG. Filtert `f.imBericht !== false`. |
| `gema_dachbericht_pdf.js` | **Dachbericht HTML/Print-Export** für Spenglerei. `GemaDachberichtPDF.exportPrint(bericht, {org,user,objektName,objektAdresse,templates})` — gleicher Pattern wie Schaden-PDF. Bilder-Grid mit 4/6-Seitenfüllung in 6er-Chunks. |
| `gema_claude.js` | **Claude-API-Client** für Texthilfe. Ruft `/.netlify/functions/claude-rewrite`. Modi: `rewrite`/`bulletpointsToText`/`fix`/`shorten`/`expand`. Eingesetzt in `sp_dachbericht.html` für KI-gestützte Textüberarbeitung. **Dazu `extractPositions({text?,fileBase64?,mediaType?,filename?})`** → `/.netlify/functions/claude-extract` für die Dokument-Analyse im Wareneingang (Rechnung/Lieferschein/Auftragsbestätigung → strukturierte Positionen). **Und `analyzeForm({fileBase64?,mediaType?,filename?,fieldNames?,text?})`** → `/.netlify/functions/claude-formfields` für die Formularfeld-Analyse in «Behörden & Formulare» (erkennt Felder + schlägt GEMA-Zuordnung vor). **Und `analyzePlan({imageBase64,mediaType?,text?,modus:'grundriss'\|'schnitt'})`** → `/.netlify/functions/claude-plan` für die Plan-Analyse in «Pläne & Flächen» (Raum-Seeds/Bemassungen bzw. Geschosshöhen). **Und `createRedactor(extraTerms?)` (Anonymisierung, KRITISCH)**: Kundennamen/-adressen (Quellen: Objekt-Stammdaten + Beteiligte aus dem `gema_objekte_v1`-Cache + generische Strasse-Nr-/PLZ-Ort-Muster) → `redactText()` ersetzt durch `[NAME_n]`/`[ADRESSE_n]`, `matchesTerm()` für Bild-Schwärzung (reine Zahlen/Masse NIE), `restore()` setzt sie in der Antwort tief wieder ein. Die Text-Modi (`rewrite`/`fix`/…) anonymisieren automatisch (Opt-out `opts.anonymize===false`); der Server-Prompt von claude-rewrite ist angewiesen, die Platzhalter exakt zu erhalten. pm_plaene nutzt zusätzlich die Bild-Schwärzung. **Antwort-Parsing zentral via `_parseJson` (KRITISCH)**: Die Functions antworten IMMER mit JSON — kommt HTML/Text zurück (Plattform-Payload-Limit VOR der Function, Firewall-/Virenscanner-Blockseite, Deploy ohne Functions), wird daraus eine klare Meldung mit HTTP-Status statt des kryptischen «Unexpected token '<' … is not valid JSON»; **504 = Netlify-Function-Timeout (~10 s)** wird als Zeitüberschreitung mit Handlungs-Hinweisen erklärt (Gegenmassnahme im Wareneingang: Text-vor-Datei via `kiAnalyseOpts`). Client-Datei-Caps MÜSSEN dem Function-Limit entsprechen (`MAX_B64` 4.5 Mio Base64-Zeichen ≈ 3.3 MB Rohdatei — der frühere 4.2-MB-Cap im Wareneingang liess Bodies durch, die Netlifys 6-MB-Limit rissen → HTML-Fehlerseite). |
| `gema_produktkatalog_api.js` | Produkte + Stammlieferanten + Favoriten |
| `gema_push.js` | Web-Push-Vorbereitung (Service-Worker) |
| `gema_pwa.js` | PWA-Install-Helper (`beforeinstallprompt`-Capture, `GemaPWA.install()`) |
| `gema_qr_scanner.js` | QR-Code-Scanner (`GemaQR.scan(cb)`) |
| `gema_nfc_scanner.js` | Web-NFC-Reader mit automatischem QR-Fallback. `GemaNFC.scan({mode:'auto',onScan})` nutzt `NDEFReader` wenn verfügbar, sonst `GemaQR`. `GemaNFC.parseTgUrl(payload)` extrahiert Geräte-ID aus URL oder Direkt-String. iPhone-Hinweis automatisch eingeblendet (kein Browser-NFC, aber Hintergrund-Scan öffnet URL). |
| `gema_recent.js` | Tracking + Anzeige zuletzt genutzter Module. `PAGE_LABELS` = vollständige Map ALLER Seiten (aus `<title>` generiert — bei neuen Seiten ergänzen!); Public API `window.GemaRecent {list, label, currentKey}` fürs Mobile-Menü |
| `gema_responsive.css` | Globale Responsive-/Layout-Regeln (Mobile + Tablet) |
| `gema_schule_api.js` | **Schul-Modul-API** (`window.GemaSchule`): 5 per-Record-Pools (Klassen/Lernmittel/Aufgaben/Prüfungen/Lösungen, moduleKey `schule`) + Abgaben-Handling (eigener Offline-Spiegel), Engine im `/*ENGINE-START*/`-Block (Note CH-Formel, seeded Shuffle, Zeitfenster inkl. Verlängerungen, MC-/Zahlenfeld-Autokorrektur, **Lösungs-Split** `schuleSplitPruefung`/`mergePruefung`), Studenten-Gating-Cache (`refreshStudentMods`/`addExamTools` → `gema_student_mods_v1`), Datei-Upload (Bilder/PDF → GemaStorage `schule/<orgId>/…`), Klassen-Notifys, Erinnerungs-Scan. Konsumenten: ab_klassen, ab_pruefungen, ab_pruefung_live. |
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