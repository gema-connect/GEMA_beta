# GEMA Hygiene-Modul — Nachbau-Spezifikation für vanilla HTML/CSS/JS

> **Zweck:** Dieses Dokument beschreibt das komplette System `gema-connect`
> („Hygiene – Water Quality Management") so präzise, dass es im `gema`-Projekt
> mit **vanilla HTML, CSS und JavaScript** (Frontend) nachgebaut werden kann.
> Es ist aus einer vollständigen Analyse des Quellcodes abgeleitet
> (Prisma-Schema, alle Routen, Services, Auth, Workflows, Validierung).
>
> **Wichtige Grundsatz-Anmerkung:** Vanilla HTML/JS deckt nur das **Frontend** ab.
> Datenbank, Login/Sessions, Berechtigungen und der Proben-Workflow sind
> **Server-Logik** und brauchen zwingend ein Backend (egal ob PHP, Node,
> Python, …). Diese Spezifikation ist deshalb zweigeteilt:
> - Kapitel 4–17: **Fachliche Spezifikation** (backend-sprachneutral — gilt immer)
> - Kapitel 18–20: **Umsetzungsleitfaden** speziell für vanilla HTML/JS

---

## 1. Systemüberblick

**Domäne:** Legionellen-/Trinkwasserhygiene-Management (Schweizer Kontext:
Datumsformat `dd.mm.yyyy`, Locale `de-CH`, Kanton/PLZ, Sprachen DE > EN > FR > IT).

**Fachliche Hierarchie:**

```
Organisation (Kunde)
└── Standort (Site)          – optional
    └── Gebäude (Building)   – kann auch direkt am Kunden hängen
        └── Raum (Room)
            └── Probenahmestelle (SamplingPoint)
                └── Probe (Sample)
```

**Vier Portale** (getrennte Bereiche mit eigener Navigation, gleiche Codebasis):

| Portal | Wer | Kernaufgaben |
|---|---|---|
| **Admin** | Plattform-Betreiber | Kunden/Labore/Contractor anlegen, Referenzdaten, User-Verwaltung, Aktivitäts-Feed |
| **Customer** | Gebäudebetreiber | Portfolio (Sites/Gebäude/Räume/Messstellen) pflegen, Proben einsehen, Sanierung steuern |
| **Laboratory** | Labor | Proben entnehmen, Messwerte erfassen, zur Analyse einreichen |
| **Contractor** | Externer Dienstleister | Sanierungspläne erstellen, Sanierungsarbeiten ausführen |

**Kern-Wertschöpfung:** Automatische Terminierung von Wasserproben nach
Intervallen, Laborauswertung gegen Legionellen-Grenzwerte und — bei positivem
Befund — ein mehrstufiger **Sanierungs-Workflow** (Plan → Ausführung →
Freigabe → Nachprobe) mit interner oder externer Delegation.

---

## 2. Architektur-Zielbild für den Vanilla-Nachbau

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ Frontend: vanilla HTML/CSS/JS│  HTTP  │ Backend (Sprache frei wählbar)│
│ - Multi-Page-App (MPA)       │ ─────► │ - REST-API (JSON)             │
│ - fetch() gegen REST-API     │ ◄───── │ - Session-Cookie-Auth         │
│ - Rendering per JS-Templates │        │ - Workflow-/Permission-Logik  │
└─────────────────────────────┘        │ - PostgreSQL/MySQL            │
                                        │ - Datei-Speicher (S3/Disk)    │
                                        │ - Scheduler (Cron)            │
                                        └──────────────────────────────┘
```

Regeln:
- **Alle** Geschäftslogik, Validierung und Berechtigungsprüfung läuft im
  Backend. Das Frontend validiert nur zusätzlich für UX.
- Session per **httpOnly-Cookie** (niemals Token in localStorage).
- Das Frontend bekommt Daten ausschließlich über die REST-API (Kapitel 16).

---

## 3. Glossar / feste Begriffswerte

Diese Enum-Werte sind wörtlich zu übernehmen (auch in der DB):

| Enum | Werte |
|---|---|
| `UserRole` | `SuperAdmin`, `Admin`, `Support`, `User` (Default `User`) |
| `OrganizationType` | `Admin`, `Customer`, `Laboratory`, `Contractor` |
| `SampleWorkflowStatus` | `SCHEDULED`, `SAMPLE_TAKEN`, `PLANER_NOTIFIED`, `COMPLETED` |
| `SampleResult` | `POSITIVE`, `NEGATIVE`, `PENDING` (Default `PENDING`) |
| `AssignmentMode` | `INTERNAL`, `EXTERNAL` |
| `Interval` | `HALF_YEAR`, `ONE_YEAR`, `TWO_YEARS`, `THREE_YEARS`, `FOUR_YEARS`, `FIVE_YEARS` |
| `AddressType` | `laboratory`, `contractor`, `site`, `building`, `customer` |
| `NotificationType` | `Notification`, `Email` |
| Member-Rollen (pro Org) | `owner`, `admin`, `member` |
| Invitation-Status | `pending` (+ `accepted`/`canceled`/`rejected` intern) |

---

## 4. Datenmodell (vollständig)

Referenzimplementierung: PostgreSQL. IDs sind UUIDs (Strings). Alle Tabellen
haben `created_at` und `updated_at` (Timestamps). Die Feldnamen unten sind
1:1 aus dem Original übernommen (camelCase → snake_case nach Belieben).

### 4.1 Auth & Benutzer

```sql
-- Benutzer
user (
  id            TEXT PK,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT false,
  phone_number  TEXT NULL,
  image         TEXT NULL,
  role          TEXT DEFAULT 'User',        -- UserRole-Enum
  two_factor_enabled BOOLEAN DEFAULT false,
  banned        BOOLEAN DEFAULT false,
  ban_reason    TEXT NULL, ban_expires TIMESTAMP NULL,
  is_deactivated BOOLEAN DEFAULT false
)

-- Session (Cookie-basiert)
session (
  id TEXT PK, token TEXT UNIQUE, expires_at TIMESTAMP,
  ip_address TEXT NULL, user_agent TEXT NULL,
  role TEXT NULL, impersonated_by TEXT NULL,
  active_organization_id TEXT NULL,
  user_id TEXT FK→user ON DELETE CASCADE
)

-- Login-Provider (E-Mail/Passwort + Microsoft SSO)
account (
  id TEXT PK, account_id TEXT, provider_id TEXT,
  access_token TEXT NULL, refresh_token TEXT NULL, id_token TEXT NULL,
  access_token_expires_at TIMESTAMP NULL, refresh_token_expires_at TIMESTAMP NULL,
  scope TEXT NULL,
  password TEXT NULL,           -- Passwort-HASH (bcrypt/argon2!)
  user_id TEXT FK→user ON DELETE CASCADE
)

-- Einmal-Tokens (E-Mail-Verifikation etc.)
verification ( id TEXT PK, identifier TEXT, value TEXT, expires_at TIMESTAMP )

-- 2FA (TOTP)
two_factor (
  id TEXT PK,
  secret TEXT,                  -- TOTP-Secret
  backup_codes TEXT,            -- verschlüsselt/gehasht ablegen
  user_id TEXT FK→user ON DELETE CASCADE
)
```

### 4.2 Organisationen & Mitgliedschaft

```sql
organization (
  id TEXT PK, name TEXT NOT NULL,
  slug TEXT UNIQUE NULL,                 -- URL-Teil, z.B. /customer/{slug}
  logo TEXT NULL, metadata TEXT NULL,
  organization_type TEXT NULL,           -- Admin|Customer|Laboratory|Contractor
  is_deactivated BOOLEAN DEFAULT false
)

member (
  id TEXT PK,
  role TEXT NOT NULL,                    -- owner|admin|member
  is_notification BOOLEAN DEFAULT false,
  organization_id TEXT FK→organization CASCADE,
  user_id TEXT FK→user CASCADE,
  -- Fachliche Spezialisierungen (nur Customer-Kontext relevant):
  is_planer   BOOLEAN DEFAULT false,     -- darf Sanierungspläne erstellen/freigeben
  is_sanitaer BOOLEAN DEFAULT false,
  is_techniker BOOLEAN DEFAULT false,    -- führt Sanierungsarbeiten aus
  UNIQUE (user_id, organization_id)      -- max. 1 Mitgliedschaft pro Org
)

invitation (
  id TEXT PK, email TEXT, role TEXT,
  status TEXT,                           -- 'pending' | ...
  expires_at TIMESTAMP,
  inviter_id TEXT FK→user CASCADE,
  organization_id TEXT FK→organization CASCADE,
  is_planer BOOLEAN DEFAULT false,
  is_sanitaer BOOLEAN DEFAULT false,
  is_techniker BOOLEAN DEFAULT false
)
```

### 4.3 Mandanten-Detailtabellen (1:1 an Organization)

```sql
customer (
  id TEXT PK,
  organization_id TEXT UNIQUE FK→organization CASCADE,
  laboratory_id TEXT NULL FK→laboratory,          -- Default-Labor
  planer_contractor_id TEXT NULL FK→contractor,    -- Default-Planer (extern)
  technician_contractor_id TEXT NULL FK→contractor,-- Default-Techniker (extern)
  planer_assignment_mode     TEXT DEFAULT 'INTERNAL',  -- INTERNAL|EXTERNAL
  technician_assignment_mode TEXT DEFAULT 'INTERNAL',
  industry TEXT NULL, website TEXT NULL, notes TEXT NULL,
  phone_number TEXT NULL, email TEXT NULL,
  default_interval TEXT DEFAULT 'ONE_YEAR'
)

laboratory (
  id TEXT PK, organization_id TEXT UNIQUE FK→organization CASCADE,
  phone_number TEXT NULL, email TEXT NULL, industry TEXT NULL,
  website TEXT NULL, notes TEXT NULL,
  notification_email TEXT NULL, notification_preferences JSON NULL,
  auto_acknowledge BOOLEAN DEFAULT false
)

contractor (
  id TEXT PK, organization_id TEXT UNIQUE FK→organization CASCADE,
  phone_number TEXT NULL, email TEXT NULL, industry TEXT NULL,
  website TEXT NULL, notes TEXT NULL
)
```

### 4.4 Adressen (polymorph, eine Tabelle)

```sql
address (
  id TEXT PK,
  street_name TEXT, street_number TEXT, postal_code TEXT,
  canton TEXT, country_code CHAR(2),
  address_type TEXT,                      -- Diskriminator (AddressType)
  -- genau EINES der folgenden gesetzt, jeweils UNIQUE:
  laboratory_id TEXT NULL UNIQUE, contractor_id TEXT NULL UNIQUE,
  site_id TEXT NULL UNIQUE, building_id TEXT NULL UNIQUE,
  customer_id TEXT NULL UNIQUE
)
```

### 4.5 Portfolio-Hierarchie

```sql
site (
  id TEXT PK, name TEXT,
  customer_id TEXT FK→customer CASCADE,
  laboratory_id TEXT NULL FK→laboratory,           -- Labor-Override
  planer_contractor_id TEXT NULL FK→contractor,    -- Contractor-Overrides
  technician_contractor_id TEXT NULL FK→contractor
)

building (
  id TEXT PK, name TEXT,
  customer_id TEXT NULL FK→customer CASCADE,       -- ENTWEDER direkt am Kunden…
  site_id TEXT NULL FK→site CASCADE,               -- …ODER an einem Standort
  laboratory_id TEXT NULL FK→laboratory,
  planer_contractor_id TEXT NULL, technician_contractor_id TEXT NULL,
  building_type_id TEXT NULL FK→building_type,
  override_interval TEXT NULL,                     -- Interval-Enum
  override_legionella_threshold INT NULL
)

room (
  id TEXT PK, name TEXT, floor TEXT,
  name_internal TEXT NULL,
  building_id TEXT FK→building,
  room_category_id TEXT NULL FK→room_category,
  override_interval TEXT NULL,
  override_legionella_threshold INT NULL
)

sampling_point (
  id TEXT PK,
  medium_id TEXT NULL FK→medium_type,
  sampling_point_type_id TEXT NULL FK→sampling_point_type,
  interval TEXT DEFAULT 'ONE_YEAR',
  legionella_threshold INT DEFAULT 1000,           -- KBE/L, materialisiert
  room_id TEXT FK→room,
  start_date TIMESTAMP NULL DEFAULT now(),
  next_sample_date TIMESTAMP NULL                  -- berechnet, s. Kap. 10.2
)
```

**Wichtig — Ownership-Regel für Sicherheit:** Ein Gebäude gehört einem Kunden
entweder direkt (`customer_id`) oder über den Standort (`site.customer_id`).
Jede Abfrage muss beides prüfen:
`WHERE building.customer_id = :cid OR site.customer_id = :cid`.

### 4.6 Referenzdaten (mehrsprachig, vom Admin gepflegt)

Vier strukturgleiche Tabellen: `medium_type`, `sampling_point_type`,
`building_type`, `room_category`:

```sql
<referenz-tabelle> (
  id TEXT PK,
  code TEXT UNIQUE,          -- medium/sampling_point_type: /^[A-Z][A-Z0-9_]*$/
                             -- building_type/room_category: /^[a-z][a-z0-9_]*$/
  name_de TEXT NOT NULL, name_en TEXT NOT NULL,
  name_fr TEXT NULL, name_it TEXT NULL,
  is_active BOOLEAN DEFAULT true
)
-- building_type zusätzlich: default_interval TEXT NULL,
--                           default_legionella_threshold INT NULL
-- room_category zusätzlich: building_type_id FK→building_type (Pflicht),
--                           default_interval, default_legionella_threshold
```

Bekannte Codes mit Spezialverhalten:
- `medium_type.code`: `WARMWASSER` (rot), `KALTWASSER` (blau), `ZIRKULATION` (violett)
- `sampling_point_type.code`: `DUSCHE`, `BADEWANNE` → lösen bei Probenplanung
  eine „Schlauchwechsel"-Benachrichtigung an interne Techniker aus (Kap. 13)

### 4.7 Probe (Sample) — das zentrale Workflow-Objekt

```sql
sample (
  id TEXT PK,
  status TEXT DEFAULT 'SCHEDULED',        -- SampleWorkflowStatus
  scheduled_date TIMESTAMP NOT NULL,      -- geplanter Entnahmetermin
  sampling_point_id TEXT FK→sampling_point,

  -- Zuweisung
  assigned_laboratory_id TEXT NULL FK→laboratory,
  assigned_user_id TEXT NULL FK→user,     -- Labormitarbeiter

  -- Workflow-Timestamps
  sample_taken_at TIMESTAMP NULL,
  submitted_for_testing_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,

  -- Entnahme-Metadaten
  taken_by_user_id TEXT NULL FK→user,
  tested_by_user_id TEXT NULL FK→user,
  withdrawal_schema TEXT NULL,            -- Entnahmeschema (Pflicht bei Entnahme)
  collection_temperature TEXT NULL,       -- Pflicht bei Entnahme
  receipt_temperature TEXT NULL,          -- Pflicht vor Analyse
  sample_date TIMESTAMP NULL, sample_entrance TIMESTAMP NULL,
  report_date TIMESTAMP NULL, lab_internal_number TEXT NULL,

  -- Labor-Messwerte (alle INT, KBE/L; NULL bis Analyse)
  aerobic_mesophilic_bacteria INT NULL,
  escherichia_coli INT NULL,
  enterococci INT NULL,
  total_legionella INT NULL,
  legionella_pneumophila_sg1 INT NULL,
  legionella_pneumophila_sg2_14 INT NULL,
  legionella_pneumophila_other INT NULL,
  legionella_spp_excl_pneumophila INT NULL,

  -- Ergebnis
  result TEXT DEFAULT 'PENDING',          -- SampleResult
  result_notes TEXT NULL, laboratory_notes TEXT NULL,
  special_instructions TEXT NULL,

  -- Dateien (JSON-Array: {filename,path,uploadedAt,uploadedBy,size,mimeType})
  sample_files JSON NULL,

  -- ===== Sanierung (Remediation) =====
  remediation_required BOOLEAN DEFAULT false,
  remediation_notes TEXT NULL,
  plan_mode TEXT NULL,                    -- AssignmentMode (Snapshot)
  work_mode TEXT NULL,
  planer_notified_at TIMESTAMP NULL,
  plan_created_at TIMESTAMP NULL,
  work_execution_notified_at TIMESTAMP NULL,
  work_completed_at TIMESTAMP NULL,
  remediation_plan_text TEXT NULL,
  remediation_plan_files JSON NULL,

  -- Contractor-Snapshots zum Zeitpunkt des positiven Befunds
  assigned_planer_contractor_id TEXT NULL FK→contractor,
  assigned_technician_contractor_id TEXT NULL FK→contractor,

  -- Freigabe
  planner_approved_at TIMESTAMP NULL,
  planner_approved_by TEXT NULL FK→user,
  follow_up_sample_scheduled_at TIMESTAMP NULL,

  -- Delegations-Tracking (wer hat was tatsächlich gemacht)
  plan_creation_delegated_to_external BOOLEAN DEFAULT false,
  plan_created_by_contractor_id TEXT NULL, plan_created_by_member_id TEXT NULL,
  plan_created_by_user_id TEXT NULL,
  work_execution_delegated_to_external BOOLEAN DEFAULT false,
  work_executed_by_contractor_id TEXT NULL, work_executed_by_member_id TEXT NULL,
  work_executed_by_user_id TEXT NULL,

  -- Nachproben-Kette
  parent_sample_id TEXT NULL FK→sample ON DELETE SET NULL,
  is_retake_sample BOOLEAN DEFAULT false
)
```

### 4.8 Logs & Benachrichtigungen

```sql
sample_log ( id PK, sample_id FK→sample CASCADE, text TEXT, created_at )

notification (
  id PK, user_id FK→user,
  text TEXT, description TEXT NULL,
  is_read BOOLEAN DEFAULT false,
  type TEXT NULL,                -- Notification|Email
  link TEXT NULL                 -- Deep-Link ins Portal
)

audit_log (
  id PK, action TEXT,            -- AuditAction-Enum (s.u.)
  user_id TEXT NULL, sample_id TEXT NULL, sampling_point_id TEXT NULL,
  organization_id TEXT NULL,
  resource_type TEXT NULL, resource_id TEXT NULL,
  details JSON NULL, ip_address TEXT NULL, user_agent TEXT NULL,
  created_at
)
```

`AuditAction`-Werte: `CREATE, UPDATE, DELETE, LOGIN, LOGIN_FAILED, LOGOUT,
PASSWORD_CHANGE, PASSWORD_RESET, TWO_FACTOR_ENABLED, TWO_FACTOR_DISABLED,
PERMISSION_CHANGE, FILE_UPLOAD, FILE_DOWNLOAD, FILE_DELETE, EXPORT,
INVITATION_SENT, INVITATION_ACCEPTED, SAMPLE_CREATED, SAMPLE_RESULT`.

---

## 5. Rollen & Berechtigungen

### 5.1 Zwei Rollenebenen

**Ebene 1 — Globale User-Rolle** (`user.role`):
- `SuperAdmin`, `Admin`, `Support` = potenzielle Plattform-Team-Mitglieder
- `User` = normaler Mandanten-Nutzer (Default bei Registrierung)
- **Plattform-Team gilt nur**, wenn Rolle ∈ {SuperAdmin, Admin, Support}
  **UND** der User Mitglied der Organisation mit `slug = 'admin'` ist.
  Beides prüfen! (`isPlatformTeamMember`)
- Plattform-Admin (für User-/Org-Verwaltung): Rolle ∈ {SuperAdmin, Admin}
  UND Mitglied der Admin-Org.
- **Plattform-Team umgeht alle Mandanten-Prüfungen** (Vollzugriff überall).

**Ebene 2 — Rolle pro Organisation** (`member.role`): `owner`, `admin`, `member`
plus orthogonale fachliche Flags `is_planer` / `is_sanitaer` / `is_techniker`.

### 5.2 Permission-Matrix

Permission-Bereiche: `portfolio`, `sampling`, `organization`, `member`, `invitation`.

| Member-Rolle | portfolio | sampling | member/invitation |
|---|---|---|---|
| `member` | read | create, read, update | – |
| `admin` | create, update | create, read, update | verwalten (invite/update/remove) |
| `owner` | create, read, update, delete | create, read, update | voll |

Merkregeln:
- **Niemand** darf Proben löschen (`sampling: delete` existiert nicht).
- Nur `owner` darf Portfolio-Objekte löschen.
- Plattform-Team: immer `canCreate/canView/canUpdate/canDelete = true`.

### 5.3 Standard-Prüfablauf (jede geschützte Backend-Operation)

```
1. Session gültig?                        → sonst 401
2. User im Plattform-Team?               → ja: Zugriff gewähren (fertig)
3. Ist User Member der Ziel-Organisation? → sonst 403
4. Hat die Member-Rolle die nötige Aktion
   im geforderten Bereich (Matrix 5.2)?  → sonst 403
```

Zusätzlich bei jedem Datenzugriff: **Ownership in der Query erzwingen**
(z. B. Sample → SamplingPoint → Room → Building → [Customer|Site→Customer]
muss zur Organisation des Users gehören).

---

## 6. Authentifizierung

### 6.1 Verfahren
- **E-Mail + Passwort** (Passwort-Hash in `account.password`)
- Optional: **Microsoft SSO** (OAuth, tenant `common`) — kann in Phase 1 entfallen
- **2FA ist obligatorisch**: TOTP (Issuer „GEMA Connect") + Backup-Codes.
  Eingeloggte User ohne aktivierte 2FA werden auf die 2FA-Einrichtung
  umgeleitet (Ausnahmen: Auth-Seiten selbst, statische Assets).
- Session-Cookie, Gültigkeit **1 Tag** (86400 s), httpOnly.

### 6.2 Flows

**Registrierung:** E-Mail, Name, Passwort, AGB-Checkbox → User mit Rolle
`User` → optional Telefonnummer (Schweizer Format
`/^(\+41|0041|0)\s*([1-9]\d{1,2})\s*(\d{3})\s*(\d{2})\s*(\d{2})$/`)
→ zwingend weiter zur 2FA-Einrichtung.

**2FA-Einrichtung (3 Schritte):**
1. Passwort bestätigen → Server generiert TOTP-Secret + Backup-Codes
2. QR-Code anzeigen (TOTP-URI; QR clientseitig rendern, z. B. `qrcode`-JS-Lib,
   Breite 200 px) — Secret zusätzlich als Klartext anzeigbar
3. TOTP-Code verifizieren → Backup-Codes **einmalig** anzeigen
   (Original: über kurzlebiges httpOnly-Cookie `pending_backup_codes`,
   10 Min TTL, nach Anzeige gelöscht)

**Login:** E-Mail/Passwort → bei unbekanntem oder deaktiviertem User 401
(vor Passwortprüfung blocken) → wenn 2FA aktiv: TOTP-Seite (mit
„Gerät vertrauen"-Checkbox und Backup-Code-Alternative) → danach Redirect.

**Post-Login-Weiche** (zentrale Route, Original `/hygiene/redirect`):
```
keine Session            → /sign-in
2FA nicht aktiviert      → /setup-two-factor
Plattform-Team           → Admin-Portal
sonst: erste Mitgliedschaft laden und nach organization_type routen:
  Customer   → /customer/{slug}
  Laboratory → /laboratory/{slug}
  Contractor → /contractor/{slug}
  keine Org  → /access-denied?reason=no-tenant
```

### 6.3 Sicherheits-Middleware (Backend, jede Anfrage)

- **CSRF/Origin-Check:** Bei `POST/PUT/PATCH/DELETE` mit `Origin`-Header muss
  dieser exakt der eigenen Frontend-URL entsprechen, sonst 403.
- **Security-Header:** `Cache-Control: private, no-store`,
  `Strict-Transport-Security` (1 Jahr), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, restriktive
  `Permissions-Policy`.
- **Admin-Guard:** Admin-Seiten/-APIs nur für Plattform-Team (sonst 403 bzw.
  Redirect auf Access-Denied).

### 6.4 Einladungs-Flow

1. Org-Admin lädt per E-Mail ein → `invitation`-Datensatz (`status='pending'`,
   `expires_at`), bei Customer-Teams zusätzlich Flags Planer/Sanitär/Techniker.
   E-Mail mit Link `{BASE_URL}/invitation/{invitationId}?email={email}`.
   Audit: `INVITATION_SENT`.
2. Aufruf des Links: ohne Session → Login/Registrierung mit `redirectTo`;
   E-Mail der Session muss der Einladungs-E-Mail entsprechen (sonst Access-Denied).
3. Annahme: `member`-Datensatz anlegen, Spezialisierungs-Flags von der
   Invitation übernehmen. Audit: `INVITATION_ACCEPTED`.
4. **Sonderfälle:**
   - Einladung in die Admin-Org: globale `user.role` auf `Admin` setzen,
     dann Logout erzwingen (neue Rolle greift erst nach Neu-Login).
   - **2. Mitglied einer Customer-Org** bekommt automatisch
     `is_planer = is_sanitaer = is_techniker = true`.

---

## 7. Seitenstruktur / Screens (vollständiges Inventar)

Jede Zeile = eine HTML-Seite im Vanilla-Nachbau. „Daten" = was die Seite per
API lädt; „Aktionen" = welche Schreiboperationen sie auslöst.

### 7.1 Auth & Einstieg

| Seite | Daten | Aktionen |
|---|---|---|
| `/sign-in` | – | Login (E-Mail/Passwort), Weiterleitung zu 2FA |
| `/sign-up` | – | Registrierung, Telefonnummer nacherfassen |
| `/setup-two-factor` | User | 2FA aktivieren (Passwort → QR → Verify) |
| `/backup-codes` | Codes (einmalig) | – |
| `/two-factor` | – | TOTP verifizieren, Backup-Code einlösen |
| `/` und `/redirect` | – | nur Weiterleitungslogik (Kap. 6.2) |
| `/access-denied` | `reason`-Query | – |
| `/invitation/{id}` | Einladung + Org-Name | Einladung annehmen |
| `/apps` | – (statisch) | Modul-Launcher mit Kacheln, Suche, Status-Filter |

### 7.2 Admin-Portal

Gemeinsames Layout: Nutzer, Benachrichtigungs-Glocke, Org-Logo.

| Seite | Daten | Aktionen |
|---|---|---|
| `/admin` (Dashboard) | KPIs (Kap. 14) + letzte 5 Aktivitäten | – |
| `/admin/activity` | Aktivitäts-Feed, Limit 10/25/50/100 (Default 25) | – |
| `/admin/admin` | Alle User (mit Orgs, letzter Session), alle Orgs (mit Zählern), Typ-Statistik | User deaktivieren/aktivieren, Org deaktivieren/aktivieren (nur Plattform-Admin) |
| `/admin/team` | Mitglieder + offene Einladungen der Admin-Org | Admin einladen, Member entfernen, Rolle ändern |
| `/admin/customers` | Kundenliste | – |
| `/admin/customers/create` | Formular | Kunde anlegen: Org (+slug) + Customer + optionale Rechnungsadresse + Logo-Upload |
| `/admin/laboratories` (+`/create`) | Laborliste | Labor anlegen (analog) |
| `/admin/contractors` (+`/create`) | Contractor-Liste | Contractor anlegen (analog) |
| `/admin/building-types` | Gebäudetypen + Raumkategorien | je: anlegen, bearbeiten, aktiv/inaktiv schalten |
| `/admin/reference-data` | Medientypen + Messstellen-Typen | je: anlegen, bearbeiten, aktiv/inaktiv |

### 7.3 Customer-Portal (`/customer/{slug}/…`)

Layout lädt: Organisation (Typ Customer, nicht deaktiviert), Customer-Datensatz,
Notifications, Logo. Fremde/ungültige Slugs → Access-Denied.

| Seite | Daten | Aktionen |
|---|---|---|
| `/` (Dashboard) | KPIs + 12-Monats-Charts (Ergebnis-Trend, Legionellen-Trend) | – |
| `/portfolio` | Sites mit Gebäuden + freistehende Gebäude, CRUD-Permissions | – |
| `/portfolio/create` | Referenzdaten, Labore, Contractors | Standort anlegen (erfordert Default-Labor!), Gebäude anlegen (Typ, Overrides, Site-Zuordnung) |
| `/sites/{siteId}` | Site + Adresse + Gebäude, Verbindungen | Site bearbeiten; Planer-/Techniker-Contractor verbinden/trennen |
| `/buildings/{buildingId}` | Gebäude + Räume + Messstellen, Referenzdaten, Raumkategorien, effektive Defaults | Raum anlegen/bearbeiten; Messstelle anlegen/bearbeiten; Gebäude bearbeiten; Contractor verbinden/trennen |
| `/rooms/{roomId}` | Raum + Messstellen + Proben-Statistik | – |
| `/sampling-points` | Alle Messstellen (gruppiert, mit Statistik) | Messstelle anlegen, Raum anlegen |
| `/sampling-points/{id}` | Messstelle + Proben, Ø/Max-Legionellen, letztes/nächstes Datum | **Manuelle historische Probe erfassen** (Kap. 10.4) |
| `/samples` | Probenliste, Filter über Query (`status`, Spezialfilter) | – |
| `/samples/{sampleId}` | Probendetail + effektive Zuständigkeiten + Sanierungsstand | Sanierungsplan erstellen; Plan-Erstellung delegieren; Arbeit delegieren; Abschluss melden; **Freigabe + Nachprobe planen** |
| `/samples/history/{sampleId}` | Probe + verwandte Proben (Retake-Kette) + SampleLog-Timeline | – |
| `/settings` | Stammdaten, Logo, Default-Intervall, Labor-/Contractor-Verbindungen, Zuweisungsmodi, interne Planer/Techniker | Stammdaten/Logo/Intervall ändern; Labor verbinden/trennen; Contractor verbinden/trennen (bei EXTERNAL-Modus blockiert); Zuweisungsmodi INTERNAL↔EXTERNAL |
| `/team` | Mitglieder + Einladungen | Einladen (mit Planer/Sanitär/Techniker-Flags), Rolle+Flags ändern, entfernen |

### 7.4 Laboratory-Portal (`/laboratory/{slug}/…`)

| Seite | Daten | Aktionen |
|---|---|---|
| `/` (Dashboard) | Kunden-/Gebäude-/Messstellen-Zahlen, offene/erledigte/überfällige Proben | – |
| `/samples` | Alle dem Labor zugewiesenen Proben + Labor-Mitglieder | Probe einem Mitarbeiter zuweisen |
| `/samples/{sampleId}` | Probendetail (nur wenn dem Labor zugewiesen, sonst 403); QR-Code der Proben-URL (280 px, als PNG downloadbar) | **Probe entnommen** melden; **Messwerte erfassen**; **zur Analyse einreichen** (mit Datei-Upload) |
| `/history` | Abgeschlossene Proben des Labors (Sortierung: Einreichung absteigend) | – |
| `/personal` | Meine zugewiesenen Proben + kürzlich erledigte + Statistik | – |
| `/settings` | Stammdaten + Adresse + Logo | bearbeiten |
| `/team` | Mitglieder + Einladungen | einladen/ändern/entfernen |

### 7.5 Contractor-Portal (`/contractor/{slug}/…`)

| Seite | Daten | Aktionen |
|---|---|---|
| `/` (Dashboard) | Kunden-/Objekt-Zahlen, aktive/erledigte Sanierungen | – |
| `/remediation` | Offene Sanierungsfälle (als Planer- oder Techniker-Contractor zugewiesen) | – |
| `/remediation/{sampleId}` | Sanierungsdetail + Rollen-Flags (bin ich Planer/Techniker/Freigeber?) | Plan erstellen (als externer Planer); Abschluss melden; delegieren; freigeben + Nachprobe |
| `/history` | Abgeschlossene Sanierungen (`work_completed_at` gesetzt) | – |
| `/sampling` | (Platzhalter/Arbeitsbereich) | – |
| `/settings`, `/team` | analog Labor | analog |

---

## 8. Proben-Workflow — Zustandsautomat

```
                              createUpcomingSamples (System/Cron)
                                        │
                                        ▼
                                 ┌────────────┐
                                 │ SCHEDULED  │  result=PENDING
                                 └─────┬──────┘
                 Labor: sampleTaken()  │  Pflicht: collectionTemperature,
                                       │           withdrawalSchema
                                       ▼
                                ┌──────────────┐
                                │ SAMPLE_TAKEN │ ◄─┐ Labor: updateSample()
                                └─────┬────────┘   │ (Messwerte, kein
                Labor: submitFor      │            │  Statuswechsel)
                Testing() ────────────┤────────────┘
                                      │  Auswertung: max(Legionellen) vs Threshold
                     ┌────────────────┴────────────────┐
        max > threshold                        max ≤ threshold
                     ▼                                  ▼
            ┌──────────────────┐              ┌────────────┐
            │ PLANER_NOTIFIED  │              │ COMPLETED  │ result=NEGATIVE
            │ result=POSITIVE  │              └────────────┘ completedAt=now
            │ remediation      │                    ▲        nextSampleDate
            │ Required=true    │                    │        neu berechnen
            └─────┬────────────┘                    │
                  │  gesamter Sanierungs-Workflow   │
                  │  läuft in DIESEM Status ab      │
                  │  (nur Timestamps ändern sich)   │
                  ▼                                 │
   Planer: approveRemediationAndScheduleFollowUp() ┘
   → status=COMPLETED + NEUE Probe (SCHEDULED, isRetake=true)
```

### 8.1 Übergänge im Detail

| Von → Nach | Auslöser | Vorbedingungen | Gesetzte Felder |
|---|---|---|---|
| – → SCHEDULED | System (Kap. 10.2) | nextSampleDate im 30-Tage-Fenster; noch kein Sample für (samplingPointId, scheduledDate) | status, scheduledDate, assignedLaboratoryId; Log „Sample scheduled - {Labor}" |
| SCHEDULED → SAMPLE_TAKEN | Labor | collectionTemperature + withdrawalSchema gesetzt; sampleTakenAt noch NULL | status, sampleTakenAt=now, takenByUserId; Log „Sample taken" |
| (SAMPLE_TAKEN, kein Wechsel) | Labor `updateSample` | status==SAMPLE_TAKEN | alle Labordaten/Messwerte |
| SAMPLE_TAKEN → PLANER_NOTIFIED | Labor `submitForTesting` | alle Pflichtwerte (s. 8.2); max > threshold | result=POSITIVE, remediationRequired=true, planMode (vom Kunden), planerNotifiedAt=now, ggf. assignedPlanerContractorId; testedByUserId, submittedForTestingAt=now, reportDate=now |
| SAMPLE_TAKEN → COMPLETED | Labor `submitForTesting` | max ≤ threshold | result=NEGATIVE, completedAt=now; **nextSampleDate der Messstelle neu berechnen**; Log „Sample completed" |
| PLANER_NOTIFIED → COMPLETED | Planer (Freigabe) | workCompletedAt gesetzt, plannerApprovedAt NULL | plannerApprovedAt/By, followUpSampleScheduledAt=now; **neue Nachprobe anlegen** |
| – → COMPLETED (direkt) | Customer, manuelle Nacherfassung | – | s. Kap. 10.4 |

### 8.2 Auswertungslogik (Herzstück!)

Pflichtfelder vor Einreichung (sonst 400): `sampleEntrance`,
`collectionTemperature`, `receiptTemperature`, `withdrawalSchema`,
`aerobicMesophilicBacteria`, `escherichiaColi`, `enterococci`,
`totalLegionella`, `legionellaPneumophilaSG1`, `legionellaPneumophilaSG2_14`,
`legionellaPneumophilaOther`, `legionellaSppExclPneumophila`.
(`labInternalNumber` optional.)

```js
const values = [totalLegionella, sg1, sg2_14, other, sppExcl].filter(v => v != null);
const maxLegionella = values.length ? Math.max(...values) : 0;
const threshold = samplingPoint.legionellaThreshold;   // KBE/L
const result = maxLegionella > threshold ? 'POSITIVE' : 'NEGATIVE';  // strikt >
```

- Temperaturen sind Pflichtfelder, fließen aber **nicht** in die Entscheidung ein.
- Audit-Log `SAMPLE_RESULT` mit `{maxLegionella, threshold, decision, result}`.

---

## 9. Sanierungs-Workflow (Remediation)

Läuft komplett im Status `PLANER_NOTIFIED`; Fortschritt = Timestamps.

### 9.1 Zuständigkeits-Auflösung

**Modus** (`planMode` für Planung+Freigabe, `workMode` für Ausführung):
kommt **ausschließlich vom Kunden** (`planer_assignment_mode` /
`technician_assignment_mode`, Default `INTERNAL`) — Site/Building überschreiben
den Modus nicht.

**Contractor** (wenn EXTERNAL): Priorität **Building → Site → Customer**
(erster gesetzter Wert gewinnt). Wird beim positiven Befund als Snapshot am
Sample gespeichert (`assigned_planer/technician_contractor_id`).

**Interne Verantwortliche** (wenn INTERNAL): Members der Kunden-Org mit
`is_planer = true` (Planung/Freigabe) bzw. `is_techniker = true` (Ausführung).

### 9.2 Ablauf

```
Positiver Befund
  └─ Schritt 0: Planer benachrichtigen (planerNotifiedAt)
       INTERNAL → alle internen Planer | EXTERNAL → Planer-Contractor-Org

  ├─ optional: delegatePlanCreation  (nur solange planCreatedAt NULL)
  │    kippt planMode INTERNAL↔EXTERNAL; EXTERNAL erfordert konfigurierten
  │    Planer-Contractor
  │
  └─ Schritt 1: createRemediationPlan (Planer)
       Bedingungen: result=POSITIVE, remediationRequired=true,
                    Plan-Text ≥ 10 Zeichen; Dateien optional
       setzt: remediationPlanText/Files, planCreatedAt=now,
              workMode (vom Kunden), workExecutionNotifiedAt=now,
              ggf. assignedTechnicianContractorId,
              planCreatedBy{User,Member|Contractor}
       benachrichtigt sofort die Ausführenden
       (KEINE separate Plan-Freigabe — Plan → direkt Arbeitsauftrag)

  ├─ optional: delegateWorkExecution (erst nach Plan, solange
  │    workCompletedAt NULL) — kippt workMode analog
  │
  └─ Schritt 2: submitRemediationCompletion (Techniker)
       Bedingungen: planCreatedAt gesetzt, workCompletedAt NULL;
       INTERNAL → User muss is_techniker in der Kunden-Org sein (403 sonst)
       EXTERNAL → User muss Member der Techniker-Contractor-Org sein
       setzt: workCompletedAt=now, Notes angehängt, workExecutedBy…
       benachrichtigt den Planer (Freigabe steht aus)

  └─ Schritt 3: approveRemediationAndScheduleFollowUp (Planer!)
       Freigabe nutzt planMode — „wer geplant hat, gibt frei"
       Bedingungen: scheduledDate (für Nachprobe) Pflicht,
                    workCompletedAt gesetzt, plannerApprovedAt NULL
       setzt: status=COMPLETED, plannerApprovedAt/By,
              followUpSampleScheduledAt=now
       erzeugt NEUE Probe: status=SCHEDULED, gleicher SamplingPoint,
              Labor vom Eltern-Sample, parentSampleId, isRetakeSample=true,
              specialInstructions='Follow-up sample after remediation …'
```

**Definition „aktive Sanierung":** `remediation_required = true` UND
`planner_approved_at IS NULL`.

**Listen-Regel:** Die Kunden-Probenliste blendet Eltern-Proben aus, die
Kind-Proben haben (nur die jeweils neueste Probe der Kette anzeigen).

---

## 10. Probenplanung & Intervalle

### 10.1 Intervall → Monate

`HALF_YEAR=6, ONE_YEAR=12, TWO_YEARS=24, THREE_YEARS=36, FOUR_YEARS=48, FIVE_YEARS=60`

### 10.2 Nächstes Probendatum

```js
function calculateNextSampleDate(startDate, lastSampleDate, interval) {
  const base = lastSampleDate ?? startDate;
  return addMonths(base, monthsOf(interval));   // Monats-Arithmetik (setMonth)
}
```
Aktualisiert wird `next_sample_date` bei: Anlage/Bearbeitung der Messstelle,
negativem Abschluss einer Probe, und (bedingt) manueller Nacherfassung.

### 10.3 Automatische Probenerzeugung (Scheduler — Pflichtbestandteil!)

Periodischer Job (im Original ein geschützter HTTP-Endpoint, extern
getriggert — beim Nachbau: **echter Cron-Job einplanen**):

```
für alle sampling_points mit next_sample_date zwischen now und now+30 Tage:
  1. Idempotenz: existiert schon ein Sample mit (samplingPointId,
     scheduledDate == nextSampleDate)? → überspringen
  2. Labor auflösen: building.laboratory_id → site.laboratory_id → NULL
  3. Sample anlegen: SCHEDULED, scheduledDate=nextSampleDate,
     assignedLaboratoryId; Log „Sample scheduled - {Labor}"
  4. Wenn sampling_point_type.code ∈ {DUSCHE, BADEWANNE}:
     interne Techniker benachrichtigen („Schlauchwechsel", Link zur Probe)
```

Zusätzlich: Beim **Anlegen** einer Messstelle sofort dieselbe Logik einmalig
für diese Messstelle ausführen (falls nextSampleDate im 30-Tage-Fenster).

### 10.4 Manuelle historische Nacherfassung (Customer)

Erzeugt eine Probe **direkt als COMPLETED** (kein Workflow, keine Notifications):
- `completedAt = sampleTakenAt = sampleDate = scheduledDate =` eingegebenes Datum
- `takenByUserId = testedByUserId =` aktueller User; `remediationRequired=false`
- **Abweichende Auswertung:** `totalLegionella` wird als **Summe** der vier
  Subspezies **berechnet**; `max = Math.max(total, …subspezies)`;
  POSITIVE falls `max > threshold`
- `next_sample_date` nur aktualisieren, wenn diese Probe die **jüngste**
  abgeschlossene Probe der Messstelle ist
- Audit: `CREATE` mit `{type:'manual_historical_entry', …}`

---

## 11. Vererbungsregeln (Intervall & Grenzwert)

Effektiver Wert = erster gesetzter Wert dieser Kette (wichtig für Vorbelegung
der Formulare; am SamplingPoint wird der Wert dann **materialisiert** gespeichert):

**Intervall:**
`room.override → roomCategory.default → building.override → buildingType.default → customer.default_interval`

**Legionellen-Grenzwert:**
`room.override → roomCategory.default → building.override → buildingType.default → **1000** (Systemdefault)`

Die UI zeigt zusätzlich die **Herkunft** an
(`room | roomCategory | building | buildingType | customer/system`).

---

## 12. Validierungsregeln (Backend + Frontend)

| Formular | Regeln |
|---|---|
| Standort/Gebäude anlegen | `name`, `streetName`, `streetNumber`, `postalCode`, `canton` je nicht leer; Threshold-Override: Int oder leer |
| Raum | `name`, `floor` Pflicht; `overrideInterval` Pflicht; `overrideLegionellaThreshold` Pflicht und **> 0** |
| Messstelle | `roomId`, `interval`, `startDate` Pflicht; `legionellaThreshold` Pflicht und **> 0** |
| Kunde/Labor/Contractor anlegen | `organizationName`, `organizationSlug`, `email` (E-Mail-Format), `phoneNumber` Pflicht; `postalCode` min. 4; `canton` **genau 2 Zeichen**; `countryCode` 2 Zeichen (Default `CH`); Website als URL oder leer |
| Stammdaten ändern | `phoneNumber` im **E.164**-Format; Website URL |
| Team einladen | E-Mail; Rolle ∈ {'', owner, admin, member}; Customer: + 3 Bool-Flags |
| Referenzdaten (Medium/Messstellen-Typ) | `code` Regex `/^[A-Z][A-Z0-9_]*$/`; `nameDE`, `nameEN` Pflicht |
| Gebäudetyp/Raumkategorie | `code` Regex `/^[a-z][a-z0-9_]*$/`; Raumkategorie braucht `buildingTypeId` |
| Sanierungsplan | Text **min. 10 Zeichen** |
| Freigabe | `scheduledDate` (Nachprobe) Pflicht |
| Registrierung Telefon | Schweizer Regex (Kap. 6.2) |

---

## 13. Benachrichtigungen (In-App)

Modell: `notification(userId, text, description, link, isRead)`.
Anzeige: Glocke im Header, Liste der letzten 20, „alle als gelesen markieren".

| Trigger | Empfänger | Link |
|---|---|---|
| Probe geplant für DUSCHE/BADEWANNE | interne Techniker der Kunden-Org | `/samples/{id}` |
| Positiver Befund (planMode INTERNAL) | interne Planer | `/samples/{id}` |
| Positiver Befund (EXTERNAL) | **alle** Member der Planer-Contractor-Org | `/samples/{id}` |
| Plan erstellt (workMode INTERNAL) | interne Techniker | `/samples/{id}` |
| Plan erstellt (EXTERNAL) | Techniker-Contractor-Org | `/remediation/{id}` |
| Plan-/Arbeits-Delegation | jeweils Zielgruppe (Contractor-Org bzw. interne Planer+Techniker) | `/remediation/…` bzw. `/samples/…` |
| Arbeit abgeschlossen | Planer (intern) bzw. Planer-Contractor-Org | s.o. |

Konvention: `/samples/{id}` = Kunden-Sicht, `/remediation/{id}` = Contractor-Sicht.
**Keine** Notifications bei: Entnahme, Messwert-Update, negativem Ergebnis,
manueller Erfassung, finaler Freigabe.

**E-Mail:** Im Original nur für Einladungen (+ Support-Formular) genutzt;
Versand über Microsoft Graph API. Für den Nachbau reicht ein beliebiger
SMTP-Versand; einzige Pflicht-E-Mail: **Einladungs-Mail** mit Annahme-Link.

---

## 14. Dashboards & KPIs

**Admin:** Gesamt-Messstellen (+Monatswachstum in %), Organisationen (ohne
Admin-Typ), User (+neue diesen Monat), Standorte; monatliche Registrierungen
(6 Monate); Messstellen-Wachstum (6 Monate); Messstellen nach Typ (mit
Prozent, 1 Nachkommastelle); Top-5-Kunden nach Messstellen; Aktivitäts-Feed
(gemischt aus neuen Usern/Gebäuden/Messstellen/Proben/Orgs/Members,
zeitlich absteigend).

**Customer:** Objektzahlen, Proben-Status-Zähler, 12-Monats-Trends
(Ergebnisse, Legionellen-Werte). *Hinweis: Im Original sind die Chart-Daten
noch Mock — beim Nachbau echte Aggregation über `sample` bauen.*

**Labor:** verbundene Kunden, Gebäude, Messstellen; offene / erledigte /
**überfällige** Proben (überfällig = `scheduledDate < heute` und nicht
abgeschlossen).

**Contractor:** verbundene Kunden/Objekte; aktive Sanierungen
(`remediationRequired ∧ ¬plannerApproved`), erledigte Sanierungen.

---

## 15. UI-Regeln (Badges, Formate, Farben)

### 15.1 Status-/Ergebnis-Anzeige

| Wert | Darstellung |
|---|---|
| SCHEDULED | Outline-Badge „Geplant" |
| SAMPLE_TAKEN | Badge „Entnommen" |
| PLANER_NOTIFIED | Badge „In Sanierung" |
| COMPLETED | Badge „Abgeschlossen" |
| PENDING / kein Ergebnis | Outline „Ausstehend" |
| POSITIVE | Rot (destructive) |
| NEGATIVE | Grün (success) |

### 15.2 Legionellen-Ampel (KBE/L)

| Wert | Label | Farbe |
|---|---|---|
| `== 0` | sauber | grün |
| `< 100` | niedrig | blau |
| `< 1000` | moderat | amber |
| `>= 1000` | hoch | rot |

### 15.3 Fälligkeits-Dringlichkeit (Tage bis Termin)

`daysUntilDue = ceil((termin@00:00 − heute@00:00) / 86400000)`

| Tage | Label |
|---|---|
| `< 0` | überfällig (rot) |
| `≤ 7` | bald fällig |
| `≤ 30` | anstehend |
| `> 30` | geplant |

### 15.4 Medium-Farben
`WARMWASSER` rot · `KALTWASSER` blau · `ZIRKULATION` violett · sonst grau.

### 15.5 Datumsformate (Locale de-CH)
- Standard: `dd.mm.yyyy` (z. B. `25.12.2024`); leer → „nicht verfügbar"
- Mit Zeit: `dd.mm.yyyy, HH:mm`
- Relativ: <1 min „gerade eben", <60 min „vor X min", <24 h „vor X Std",
  <7 Tage „vor X Tagen", sonst Datum
- Chart-Achsen: `MM.YY`
- Initialen: erste Buchstaben je Wort, uppercase, max. 2; leer → `??`

### 15.6 Mehrsprachigkeit
Referenzdaten haben `name_de/en/fr/it`; Anzeige nach aktueller Sprache,
FR/IT fallen auf DE zurück, sonst EN. UI-Texte über
Übersetzungs-JSONs (DE/EN/FR/IT), Priorität DE.

---

## 16. REST-API des Backends (Mindestumfang)

Das Original mischt Form-Actions und REST; für den Vanilla-Nachbau wird
**alles** zu REST-Endpunkten. Namensschema-Vorschlag (angelehnt ans Original):

### Auth
```
POST /api/auth/sign-up            {name, email, password}
POST /api/auth/sign-in            {email, password}      → ggf. {twoFactorRequired}
POST /api/auth/two-factor/enable  {password}             → {totpUri, backupCodes}
POST /api/auth/two-factor/verify  {code, trustDevice}
POST /api/auth/two-factor/backup  {code}
POST /api/auth/sign-out
GET  /api/auth/session                                    → User + aktive Org
```

### Bestehende Elysia-Endpunkte (übernehmen)
```
GET  /api/health
GET  /api/notifications              (letzte 20 des Users)
POST /api/notifications/mark-all-read
GET  /api/sampling                   (Scheduler-Trigger; NUR Plattform-Team)
GET  /api/files/logo/{slug}          (Logo, Cache 1h, probiert png/jpg/jpeg/svg/webp)
GET  /api/files/samples/{sampleId}/{fileKey}
     → Zugriff nur: Kunden-Org, zugewiesenes Labor, Planer-/Techniker-
       Contractor-Org oder Plattform-Team (sonst 403); Audit FILE_DOWNLOAD
POST /api/support                    (Support-Formular → E-Mail; im Original
                                      OHNE Auth und mit hartkodierter
                                      Empfängeradresse — beim Nachbau: Auth
                                      verlangen + Empfänger konfigurierbar!)
```

### Fachliche Endpunkte (aus den Form-Actions abgeleitet, Auswahl)
```
Portfolio:   GET/POST /api/customers/{id}/sites | /buildings | /rooms
             GET/PATCH /api/sites/{id} | /buildings/{id} | /rooms/{id}
             POST /api/{sites|buildings}/{id}/contractors/{planer|technician}
             DELETE dito (verbinden/trennen)
Messstellen: GET/POST /api/sampling-points, GET/PATCH /api/sampling-points/{id}
             POST /api/sampling-points/{id}/manual-sample
Proben:      GET /api/customers/{id}/samples?status=…
             GET /api/samples/{id}, GET /api/samples/{id}/history
Labor:       POST /api/samples/{id}/assign        {userId}
             POST /api/samples/{id}/taken          {collectionTemperature, withdrawalSchema}
             PATCH /api/samples/{id}/lab-values    {alle Messwerte…}
             POST /api/samples/{id}/submit-testing (+ multipart Dateien)
Sanierung:   POST /api/samples/{id}/remediation/plan        {text, files[]}
             POST /api/samples/{id}/remediation/delegate-plan {toExternal:bool}
             POST /api/samples/{id}/remediation/delegate-work {toExternal:bool}
             POST /api/samples/{id}/remediation/complete     {notes}
             POST /api/samples/{id}/remediation/approve      {scheduledDate, notes}
Team:        GET/POST /api/orgs/{id}/members, /invitations; PATCH/DELETE member
Admin:       GET/POST /api/admin/customers|laboratories|contractors
             GET/POST/PATCH /api/admin/building-types|room-categories|
                            medium-types|sampling-point-types
             POST /api/admin/users/{id}/toggle-deactivation
             POST /api/admin/orgs/{id}/toggle-deactivation
Einladung:   GET /api/invitations/{id}, POST /api/invitations/{id}/accept
```

Jeder Endpunkt implementiert den Prüfablauf aus Kap. 5.3.

---

## 17. Datei-Handling

- **Sample-/Sanierungs-Dateien:** max. **10 MB**; erlaubt: PDF, JPEG/JPG, PNG,
  DOC, DOCX. Ablage-Schlüssel:
  `samples/{sampleId}/{unterordner}/{timestamp}-{bereinigter-name}`
  (Dateiname: alles außer `[a-zA-Z0-9.-]` → `_`).
  Im Original **AES-256 pro Datei verschlüsselt** (SSE-C, Schlüssel in
  Metadaten). Beim Nachbau mindestens: Ablage **außerhalb** des Web-Roots,
  Auslieferung nur über den autorisierten Endpunkt.
- **Logos:** max. **5 MB**; PNG, JPEG, SVG, WebP; Schlüssel `logo/{slug}.{ext}`;
  Slug gegen Path-Traversal bereinigen.
- Metadaten pro Datei: `{filename, path/key, uploadedAt, uploadedBy, size, mimeType}`
  als JSON am Sample (`sample_files` bzw. `remediation_plan_files`).
- Jeder Up-/Download → Audit (`FILE_UPLOAD` / `FILE_DOWNLOAD` mit IP/UA).

---

## 18. Umsetzungsleitfaden vanilla HTML/CSS/JS

### 18.1 Projektstruktur (Vorschlag)

```
gema/
├── public/                      # vom Webserver ausgeliefert
│   ├── index.html               # Weiche (Kap. 6.2, per JS + /api/auth/session)
│   ├── auth/  sign-in.html, sign-up.html, two-factor.html, setup-2fa.html
│   ├── admin/     …eine HTML-Datei pro Screen (Kap. 7.2)
│   ├── customer/  …(Kap. 7.3; IDs per Query-String: building.html?id=…)
│   ├── laboratory/ …(Kap. 7.4)
│   ├── contractor/ …(Kap. 7.5)
│   ├── css/  base.css, components.css   (Badges, Cards, Tabellen, Dialoge)
│   └── js/
│       ├── api.js          # fetch-Wrapper (credentials:'include', Fehler→Toast)
│       ├── session.js      # Session laden, Guard, Redirect-Weiche
│       ├── i18n.js         # messages/de.json laden, t('key') Helper
│       ├── format.js       # formatDate, daysUntilDue, initials (Kap. 15)
│       ├── badges.js       # Status/Ergebnis/Legionellen/Urgency (Kap. 15)
│       ├── components/     # renderTable(), openDialog(), toast(), bell()
│       └── pages/          # 1 JS-Modul pro Seite (lädt Daten, rendert, bindet Events)
└── server/                  # Backend (Sprache frei — Spez. Kap. 4–17)
```

### 18.2 Muster statt Framework

Da kein Framework-State existiert, konsequent dieses Muster pro Seite:

```js
// pages/customer-samples.js
import { api } from '../api.js';
import { requireOrgAccess } from '../session.js';
import { statusBadge, resultBadge } from '../badges.js';

const { org } = await requireOrgAccess('Customer');   // Guard + Kontext
const params = new URLSearchParams(location.search);

async function load() {
  const samples = await api.get(`/customers/${org.customerId}/samples`, {
    status: params.get('status') ?? ''
  });
  render(samples);
}
function render(samples) {
  const tbody = document.querySelector('#samples tbody');
  tbody.replaceChildren(...samples.map(rowEl));   // niemals innerHTML mit Daten!
}
load();
```

Verbindliche Regeln:
1. **Kein `innerHTML` mit Nutzdaten** (XSS!) — `textContent` /
   `createElement` / `<template>`-Klonen verwenden.
2. Nach jeder Schreiboperation: **neu laden** (`load()`), kein manuelles
   State-Patchen — das ersetzt die Framework-Reaktivität und vermeidet Drift.
3. Jeder `fetch` mit `credentials: 'include'`; 401 → zur Login-Seite,
   403 → Access-Denied-Seite.
4. Formulare: `submit`-Handler, `FormData`, Client-Validierung (Kap. 12) nur
   als UX — der Server validiert nochmal und liefert Fehler als
   `{field: message}`-JSON, die neben den Feldern angezeigt werden.
5. Wiederkehrende UI (Badge, Dialog, Tabelle, Notification-Glocke,
   Breadcrumbs) als kleine Render-Funktionen in `components/` — einmal
   schreiben, überall verwenden.
6. QR-Codes clientseitig mit einer Standalone-JS-Bibliothek (z. B. `qrcode`),
   für: 2FA-Setup (TOTP-URI, 200 px) und Labor-Probendetail
   (Proben-URL, 280 px, PNG-Download `sample-{id}-qr.png`).
7. Charts: entweder kleine Standalone-Lib oder handgezeichnetes SVG
   (Balken/Linie reichen für die Dashboards).

### 18.3 Was im Vanilla-Nachbau bewusst wegfallen kann (Phase 1)

- Microsoft SSO (E-Mail/Passwort reicht zunächst)
- Drag-and-Drop, Skeleton-Loader, Animationen
- FR/IT-Übersetzungen (Struktur DE/EN vorbereiten)
- Datei-Verschlüsselung SSE-C (aber: Dateien nie öffentlich ausliefern!)
- `/apps`-Modul-Launcher (falls gema eine eigene Startseite hat)

### 18.4 Bekannte Schwächen des Originals — beim Nachbau besser machen

1. `POST /api/support` ist **unauthentifiziert** und hat eine hartkodierte
   private Empfänger-E-Mail → Auth verlangen, Empfänger als Config.
2. Customer-Dashboard-Charts sind **Mock-Daten** → echte Aggregation bauen.
3. Passwort-Reset ist im Original nur TODO → einplanen.
4. Bei der Registrierung wird das Passwort base64-codiert per URL an die
   2FA-Seite gereicht → stattdessen serverseitig kurzlebiges Setup-Token.
5. Cron ist als Paket vorhanden, aber nie verdrahtet (Trigger nur manuell
   über den API-Endpunkt) → echten Cron-Job einrichten.

---

## 19. Umsetzungs-Reihenfolge (Phasenplan)

| Phase | Inhalt | Ergebnis |
|---|---|---|
| 1 | DB-Schema (Kap. 4) + Auth (Login, Session, 2FA) + Post-Login-Weiche | Login bis leeres Portal |
| 2 | Admin-Portal: Orgs anlegen (Kunde/Labor/Contractor), Referenzdaten, Einladungen | Mandanten existieren |
| 3 | Customer-Portfolio: Sites → Gebäude → Räume → Messstellen inkl. Vererbung (Kap. 11) | Stammdaten pflegbar |
| 4 | Scheduler + Proben-Workflow SCHEDULED→…→COMPLETED inkl. Labor-Portal + Auswertung (Kap. 8, 10) | Kernprozess läuft |
| 5 | Sanierungs-Workflow + Contractor-Portal + Delegation + Nachproben (Kap. 9) | Vollständiger Kreislauf |
| 6 | Benachrichtigungen, Dashboards, Dateien, Audit-Log, manuelle Nacherfassung | Feature-komplett |
| 7 | Härtung: Security-Header, Origin-Check, Rate-Limits, Tests | Produktionsreif |

**Aufwands-Warnhinweis:** Das Original umfasst ~280 UI-Komponenten und
~150 TS-Module auf einem Full-Stack-Framework. In vanilla HTML/JS entfällt
die Framework-Hilfe (Reaktivität, Routing, Form-Handling, Typsicherheit) —
realistisch ist der Nachbau ein **Projekt von mehreren Monaten**, wobei
Phase 4+5 (Workflow) der fachlich kritischste Teil ist. Diese Spezifikation
ist bewusst so geschrieben, dass die Kapitel 4–17 auch für einen späteren
Umstieg auf einen anderen Stack unverändert gültig bleiben.

---

## 20. Abnahme-Checkliste (Fachlichkeit korrekt?)

- [ ] Probe mit `max(Legionellen) > Threshold` wird POSITIVE, `==` bleibt NEGATIVE (strikt größer!)
- [ ] Threshold-Vererbung Room→RoomCategory→Building→BuildingType→1000 stimmt inkl. Herkunftsanzeige
- [ ] Scheduler erzeugt keine Duplikate (Idempotenz über samplingPointId+scheduledDate)
- [ ] Labor-Auflösung Building→Site→NULL; Contractor-Auflösung Building→Site→Customer
- [ ] AssignmentMode kommt NUR vom Kunden, nie von Site/Building
- [ ] Sanierung: Plan erst ab POSITIVE; Arbeit erst ab Plan; Freigabe erst ab Arbeit; Freigeber = Planer-Seite (planMode)
- [ ] Delegation nur solange der jeweilige Schritt noch offen ist
- [ ] Freigabe erzeugt Nachprobe mit parentSampleId + isRetakeSample
- [ ] Kunden-Probenliste zeigt Eltern-Proben mit Kindern nicht an
- [ ] 2. Mitglied einer Customer-Org erhält automatisch alle drei Fach-Flags
- [ ] 2FA wird auf allen geschützten Seiten erzwungen
- [ ] Plattform-Team = Rolle UND Mitgliedschaft in Admin-Org (beides!)
- [ ] Niemand kann Proben löschen; nur Owner löscht Portfolio-Objekte
- [ ] Ownership-Check `building.customer_id OR site.customer_id` in jeder Query
- [ ] Datei-Downloads nur für berechtigte Organisationen + Audit-Log
- [ ] DUSCHE/BADEWANNE lösen Schlauchwechsel-Benachrichtigung aus
- [ ] Manuelle Nacherfassung: totalLegionella = Summe der Subspezies
