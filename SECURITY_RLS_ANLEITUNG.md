# GEMA Secure v1 — RLS aktivieren (Schritt-für-Schritt)

**Stand:** 2026-07-07 · **Aufwand:** ~20 Minuten · **Rollback:** 1 SQL-Skript (Schritt 8)

## Warum das Ganze?

Bisher steckt der Supabase-**anon-Key** im Frontend-Code und die Tabelle `gema_data`
hat **kein Row Level Security**. Folge: Jeder, der den Key aus dem JavaScript liest
(F12 genügt), kann die komplette Datenbank lesen und schreiben — alle Firmen, alle
Projekte, alle Benutzer inklusive Passwort-Hashes. Ausserdem hashte GEMA Passwörter
mit einem trivialen Algorithmus (djb2), der in Sekunden geknackt ist.

**GEMA Secure v1** behebt das:

| Baustein | Was er tut |
|---|---|
| Netlify Function `gema-auth` | Prüft Logins **server-seitig**, stellt ein Supabase-JWT aus, führt alle Benutzer-/Firmen-/Rollen-Änderungen mit Berechtigungsprüfung aus |
| RLS-Policies (`supabase/gema_rls_v1.sql`) | anon-Key wird nutzlos; nur eingeloggte User (gültiges JWT) lesen/schreiben Daten; Auth-Daten schreibt nur noch die Function |
| `cred:`-Records | Passwörter liegen als **scrypt-Hashes** in Datensätzen, für die es keine einzige Policy gibt → nur der Service-Key (Function) kommt heran. Bestehende User werden **beim ersten Login automatisch migriert** — niemand muss sein Passwort zurücksetzen |
| Client (bereits deployed) | Sendet nach dem Login das JWT bei jedem Request; ohne Function läuft alles im Kompatibilitätsmodus wie bisher |

**Wichtig:** Die Code-Änderungen sind abwärtskompatibel. Solange du Schritt 5 (SQL)
nicht ausführst, läuft GEMA exakt wie heute — du kannst die Schritte 1–4 also gefahrlos
vorbereiten und testen.

---

## Schritt 1 — Schlüssel aus Supabase holen

Im [Supabase Dashboard](https://supabase.com/dashboard) dein Projekt öffnen:

1. **Settings → API → Project API keys**: den **`service_role`-Key** kopieren
   (⚠ niemals in den Frontend-Code — nur als Netlify-Umgebungsvariable!).
   Alternativ funktioniert auch ein **neuer «Secret key»** (`sb_secret_…`)
   aus dem Bereich «API Keys» — die Function erkennt beide Formate.
   NICHT geeignet: der `anon`/`public`-Key und `sb_publishable_…`.
2. **Settings → API → JWT Settings** (bzw. neu: **Settings → JWT Keys → «Legacy
   JWT Secret»**): das **JWT Secret** kopieren.
   ⚠ **Verwechslungsgefahr:** Das JWT-Secret ist eine zufällige Zeichenkette
   **ohne Punkte** und beginnt **nicht** mit `eyJ`. Alles, was mit `eyJhbGciOi…`
   beginnt, ist ein API-**Key** (anon/service_role) und gehört NICHT in
   `GEMA_JWT_SECRET` — Netlify bricht den Build sonst mit «Exposed secrets
   detected: GEMA_JWT_SECRET» ab, weil der anon-Key öffentlich im Client-JS liegt.

## Schritt 2 — Netlify-Umgebungsvariablen setzen

Netlify Dashboard → deine Site → **Site configuration → Environment variables** → je
**Add a variable**:

| Key | Wert |
|---|---|
| `SUPABASE_SERVICE_KEY` | der service_role-Key aus Schritt 1 |
| `GEMA_JWT_SECRET` | das JWT Secret aus Schritt 1 |

(`ANTHROPIC_API_KEY` hast du dort schon; `SUPABASE_URL` ist optional — die Function
kennt die Projekt-URL als Default.)

## Schritt 3 — Deployen

Diesen Branch mergen/pushen wie gewohnt → Netlify baut und deployed die neue Function
`/.netlify/functions/gema-auth` zusammen mit dem angepassten Frontend.

## Schritt 4 — Function testen (RLS noch AUS!)

1. GEMA öffnen → **abmelden → neu anmelden**.
2. In den DevTools (F12 → Application → Local Storage) nachsehen: der Eintrag
   `gema_session_v1` muss jetzt ein Feld **`token`** enthalten (langer JWT-String).
   → Damit ist die Function aktiv und der Login läuft server-seitig.
3. Kurz durchklicken: Modul öffnen, etwas speichern, in `sys_admin.html` einen
   Test-User anlegen — alles muss normal funktionieren.

**Erst wenn das klappt, weiter zu Schritt 5.** (Ohne Token würde Schritt 5 alle
Clients aussperren.)

## Schritt 5 — RLS scharf schalten

Supabase Dashboard → **SQL Editor** → Inhalt von **`supabase/gema_rls_v1.sql`**
einfügen → **Run**. Ab jetzt:

- anon-Key: kein Lese-/Schreibzugriff mehr auf `gema_data`
- eingeloggte User (JWT): lesen alles ausser `cred:`, schreiben Modul-Daten
- `user:`/`org:`/`role:`: schreibt nur noch die Function (mit Rechteprüfung)
- Storage-Uploads (`gema-fotos`): nur noch eingeloggt

## Schritt 6 — Verifizieren

1. **Privates Browserfenster** (kein Login): `https://<projekt>.supabase.co/rest/v1/gema_data?select=data_key&limit=1`
   mit dem anon-Key als `apikey`-Header aufrufen (oder einfach im alten, nicht
   eingeloggten Tab die App öffnen) → es dürfen **keine Daten** mehr kommen (`[]`).
2. Normal einloggen → Module, Speichern, Objekte, Fotos-Upload: alles funktioniert.
3. `sys_admin.html`: Test-User anlegen, Passwort setzen, wieder löschen → funktioniert
   (läuft über die Function).

## Schritt 7 — Alle Geräte einmal neu anmelden

Bestehende Sitzungen haben noch kein Token. Jedes Gerät muss sich **einmal ab- und
neu anmelden** (die App zeigt sonst leere Listen bzw. «Sitzung abgelaufen»). Beim
ersten Login wird das Passwort automatisch auf scrypt migriert.

### Angemeldet bleiben — gleitendes Sitzungsfenster

Mit Häkchen **«Angemeldet bleiben»** beim Login bleibt man **dauerhaft**
angemeldet: Der Client erneuert das Sitzungs-Token automatisch im Hintergrund
(frühestens nach 24 h Token-Alter, gedrosselt). Neu anmelden muss sich nur,
wer GEMA **länger als die Token-Laufzeit gar nicht öffnet** — Standard 30 Tage.

- Fenster vergrössern: Netlify-Env-Variable **`GEMA_TOKEN_DAYS`** setzen
  (z.B. `90`) und neu deployen.
- Sicherheit: Das einzelne Token bleibt kurzlebig; **deaktivierte Konten
  erhalten beim Refresh kein neues Token** mehr und fallen so automatisch
  aus der Dauersitzung. Ohne Häkchen gilt wie bisher 1 Tag ohne Verlängerung.

### Troubleshooting: «Passwörter funktionieren nicht mehr»

**Erste Hilfe, falls niemand mehr reinkommt und RLS schon aktiv ist:**
SQL Editor → `supabase/gema_rls_rollback.sql` ausführen → alle Logins
funktionieren sofort wieder im alten Modus. Danach in Ruhe die Ursache
beheben und RLS erneut aktivieren.

**Diagnose in 10 Sekunden:** Im Browser öffnen:
`https://<deine-site>/.netlify/functions/gema-auth?action=diag`
Die Antwort zeigt ohne Geheimwerte, was falsch ist:

| Anzeige | Bedeutung / Fix |
|---|---|
| `serviceKey: FEHLT` / `jwtSecret: FEHLT` | Env-Variablen setzen (Schritt 2) + neu deployen |
| `jwtSecret: VERDAECHTIG (eyJ…)` | Dort steckt ein API-Key statt des JWT-Secrets (Schritt 1.2) |
| `datenbank: FEHLER …` | Service-Key falsch (z.B. anon-Key) — Schritt 1.1; Logins schlagen deshalb fehl |
| `datenbank: lesbar — 0 Benutzer` | Key liest nichts — falsches Projekt oder falscher Key |
| alles ok | Problem liegt woanders — Login-Seite zeigt seit v200 die echte Server-Fehlermeldung statt «Falsche E-Mail oder Passwort» |

Hinweis: Ein Function-Defekt blockiert Logins nur noch, solange RLS aktiv
ist — ohne RLS weicht der Client bei Server-Fehlern (ausser «falsches
Passwort») automatisch auf den Legacy-Login aus.

### Troubleshooting: Netlify-Build scheitert mit «Exposed secrets detected»

Netlify scannt Builds auf Secrets, sobald Secret-Env-Variablen gesetzt sind. Der
**Supabase anon-Key** im Client-JS sieht für den Scanner wie ein Secret aus, ist
aber der by design öffentliche Browser-Key — er ist in `netlify.toml` über
`SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` gezielt gesafelistet (echte Secrets
werden weiterhin gescannt).

Scheitert der Build TROTZDEM: Im Deploy-Log den Abschnitt «Exposed secrets
detected» aufklappen und nachsehen, WELCHE Variable gefunden wurde — in beiden
Fällen wurde versehentlich der **anon-Key** als Wert eingefügt (er ist der
einzige Supabase-Wert, der legitim im Client-Code liegt und darum gefunden wird):

- **`GEMA_JWT_SECRET` gefunden** → dort steckt der anon-Key statt des
  JWT-Secrets. Richtigen Wert holen: Settings → API → JWT Settings bzw.
  Settings → JWT Keys → «Legacy JWT Secret» (zufällige Zeichenkette ohne
  Punkte, beginnt nicht mit `eyJ`).
- **`SUPABASE_SERVICE_KEY` gefunden** → dort steckt der anon-Key statt des
  service_role-Keys. Richtigen Wert holen: Settings → API, Zeile
  **`service_role`**.

Nach der Korrektur: Deploys → «Trigger deploy» → «Clear cache and deploy site».
Mit falschen Werten funktioniert Secure v1 ohnehin nicht (Supabase würde die
signierten Tokens ablehnen).

## Schritt 8 — Rollback (falls etwas klemmt)

SQL Editor → Inhalt von **`supabase/gema_rls_rollback.sql`** ausführen → RLS ist aus,
GEMA läuft sofort wieder im alten Modus (auch ohne Function). Kein Datenverlust.

---

## Deine Frage: Kann ich als Admin weiterhin direkt aus GEMA Accounts erstellen?

**Ja — genau wie bisher, an denselben Stellen.** `sys_admin.html` (Benutzer anlegen,
Rollen zuweisen, Passwörter setzen, deaktivieren), die Selbstregistrierung auf der
Login-Seite, Mitarbeiter-Einladungen im Lieferanten-Dashboard und Partner-Einladungen
(Lieferant/Prüfer/Garagist …) funktionieren unverändert. Der Unterschied ist nur, WO
die Schreiboperation ausgeführt wird: nicht mehr direkt vom Browser in die Datenbank,
sondern über die `gema-auth`-Function, die deine Admin-Berechtigung **server-seitig
gegen den echten Datenbankstand** prüft und erst dann mit dem Service-Key schreibt.
Vorteile nebenbei: Passwörter neuer User landen sofort als scrypt-Hash im geschützten
`cred:`-Record, und niemand kann sich mehr per Browser-Konsole selbst zum Admin machen.

**Berechtigungsmodell der Function (v1):**

| Wer | Darf |
|---|---|
| GEMA-Admin (`role_admin`) | Alles: User/Orgs/Rollen anlegen, ändern, löschen |
| Org-Admin (in `org.admins` oder `role_lieferant_admin`/`role_produktlieferant_admin`) | User der **eigenen** Org anlegen/ändern (nie `role_admin` vergeben), eigene Org-Daten ändern |
| Jeder eingeloggte User | Eigenes Profil ändern (Rollen/Org/Status bleiben fix), Partner in fremde Org einladen — aber nur mit Partner-Rollen (Lieferant, Prüfer, Leiternprüfer, Garagist, Unternehmer, Architekt, Bauherrschaft) |
| Nicht eingeloggt | Nur Selbstregistrierung (neue Org + eigener User) und Einladungs-Aktivierung |

## Was Secure v1 bewusst NOCH NICHT macht (Stufe 2)

- **Org-Scoping der Modul-Daten:** Eingeloggte User können auf DB-Ebene weiterhin
  Daten anderer Orgs lesen/schreiben (wie heute schon unter Insidern) — die
  Org-Trennung macht der Client. Grund: GEMA hat viele gewollte Cross-Org-Flüsse
  (Offertanfragen, Ausschreibungen, Prüfaufträge, Freigaben). Eine saubere
  per-Modul-Policy-Matrix ist der nächste Ausbauschritt.
- **Storage-Lesen:** Foto-URLs bleiben öffentlich (zufällige Pfade). Wer das
  einschränken will: Bucket auf privat + signierte URLs.
- **Rate-Limiting** der Function (Brute-Force-Bremse) — Netlify bietet dafür
  Edge-Rate-Limits; bei Bedarf nachrüsten.
