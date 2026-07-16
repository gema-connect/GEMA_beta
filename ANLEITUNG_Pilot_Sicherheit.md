# GEMA — Klickanleitung Pilot-Absicherung

Schritt-für-Schritt für die Konsolen-Aufgaben, die **nicht** im Code stecken. Reihenfolge = Wichtigkeit. Plane ~30–45 Min. ein.

Kurz zum Verständnis: Der Code-Teil (Selbst-Registrierung aus, Login-Drossel, alle S2–S7-Fixes) ist bereits umgesetzt. Hier geht es um die drei Dinge, die du in **Supabase** und **Netlify** selbst klicken musst:

- **A/B — Supabase RLS** (das Fundament: sonst ist die DB ohne Login offen)
- **C — Netlify Env-Variablen** (Login/Functions/Registrierung)
- **D — Edge-Zugangskontrolle** (der grosse Hebel für den geschlossenen Pilot)
- **E — RLS v2** (später, gestaffelt)

---

## A — Prüfen, ob `gema_rls_v1.sql` aktiv ist

### A1) Der schnelle Katalog-Check (empfohlen, 1 Minute)

1. **supabase.com** öffnen → einloggen → dein GEMA-Projekt anklicken.
2. Links in der Seitenleiste **SQL Editor** (Icon `</>`).
3. Oben **`+ New query`**.
4. Den kompletten Inhalt von **`supabase/gema_rls_check.sql`** (aus diesem Repo) hineinkopieren.
5. Unten rechts **`Run`** (oder `Strg/Cmd + Enter`).
6. Es erscheinen **zwei Ergebnis-Tabellen**. Die obere ist das Verdikt. Lies die Spalte **«Ergebnis»**:

| Was du siehst | Bedeutung |
|---|---|
| Zeile «RLS auf gema_data aktiv» = **JA ✅** und «v1-Policies» = **4 / 4** | ✅ v1 ist aktiv. Weiter zu **C**. |
| «RLS auf gema_data aktiv» = **NEIN ❌** | ⛔ **Die DB ist ohne Login les-/löschbar.** Sofort **B** ausführen. |
| «Keine anon/public-Policy» = **GEFUNDEN ❌** | ⛔ Es gibt eine Policy, die dem anon-Key Zugriff gibt → in der unteren Rohdaten-Tabelle die Zeile mit `anon`/`public` suchen und diese Policy löschen (bzw. **B** neu einspielen). |
| «Storage: Upload… FEHLT ⚠» oder «anon SCHREIBT ❌» | Der Storage-Teil von v1 fehlt bzw. anon darf noch hochladen → **B** ausführen. |
| «Tabelle … existiert = NEIN ❌» | Du bist im **falschen Projekt**. Richtiges Supabase-Projekt wählen. |

> Das Skript ändert nichts (nur Lesen). Es wurde gegen PostgreSQL 16 (Supabases Engine) getestet.

### A2) Der Beweis-Test mit dem echten anon-Key (2 Minuten, optional aber ehrlich)

Der Katalog-Check liest die Policy-Definitionen. Der **endgültige** Beweis, dass ein Fremder ohne Login nichts sieht, ist ein direkter API-Aufruf mit dem öffentlichen anon-Key:

1. Den anon-Key hast du im Repo in `gema_sync.js` (Zeile ~22, `SB_KEY`), die Projekt-URL in Zeile ~21 (`SB_URL`).
2. In einem Terminal (Werte einsetzen):
   ```
   curl "https://<DEIN-PROJEKT>.supabase.co/rest/v1/gema_data?select=data_key&limit=1" \
     -H "apikey: <ANON-KEY>" -H "Authorization: Bearer <ANON-KEY>"
   ```
   - Antwort **`[]`** (leer) oder ein Auth-Fehler → ✅ **RLS ist aktiv**, anon kommt nicht dran.
   - Kommen **Datenzeilen** zurück → ⛔ **RLS ist AUS** → **B**.
3. (Kein Terminal? Die gleiche URL im Browser öffnet nur einen GET; für den sauberen Test mit Headern ist curl/Postman besser. Alternativ genügt der Katalog-Check A1.)

---

## B — `gema_rls_v1.sql` einspielen (nur falls A ergab: nicht aktiv)

> ⚠️ **Reihenfolge-Falle:** RLS sperrt den anon-Key aus. Ab dann funktioniert Login/Datenzugriff NUR über die `gema-auth`-Function mit gültigem JWT. Stelle **zuerst** sicher, dass die Function deployed ist und ihre Env-Variablen gesetzt sind (**Abschnitt C**) — sonst sperrst du dich selbst aus. Details: `SECURITY_RLS_ANLEITUNG.md`.

1. Supabase → **SQL Editor** → **`+ New query`**.
2. Inhalt von **`supabase/gema_rls_v1.sql`** hineinkopieren → **`Run`**.
3. Erwartete Ausgabe: mehrere `CREATE POLICY` / `ALTER TABLE` ohne Fehler.
4. **A1 erneut ausführen** → jetzt muss alles ✅ / 4·4 sein.
5. In der App testen: aus-/einloggen, ein Objekt öffnen. Läuft alles → fertig.

**Falls du dich aussperrst** (nichts lädt mehr, Login klemmt): `supabase/gema_rls_rollback.sql` im SQL Editor ausführen — das schaltet RLS wieder ab (unsicher, aber sofort funktionsfähig), dann C sauber nachziehen und B erneut.

---

## C — Netlify: Env-Variablen

1. **app.netlify.com** → dein GEMA-Site anklicken.
2. **Site configuration** (oben) → links **Environment variables**.
3. Prüfen, dass diese **drei** existieren (für Login/Functions/KI zwingend):
   - `SUPABASE_SERVICE_KEY` — der **service_role**-Key (Supabase → Project Settings → API → `service_role`, `Reveal`).
   - `GEMA_JWT_SECRET` — das JWT-Secret (Supabase → Project Settings → API → JWT Settings → `JWT Secret`). **Ohne Punkte, beginnt NICHT mit `eyJ`** — sonst ist es der falsche Wert.
   - `ANTHROPIC_API_KEY` — für die KI-Funktionen (`sk-ant-…`).
4. **Registrierung bleibt automatisch geschlossen** — du musst dafür **nichts** setzen (Default = zu). Neue Konten legst du im Admin an bzw. per Einladung.
5. Optional (nur wenn du später etwas ändern willst) — pro Variable **`Add a variable`**:
   | Variable | Wert | Wirkung |
   |---|---|---|
   | `GEMA_REGISTRATION_OPEN` | `1` | Selbst-Registrierung neuer Firmen wieder erlauben (dann auch `REGISTRATION_OPEN=true` in `sys_login.html` setzen) |
   | `GEMA_STUDENT_REGISTRATION_OPEN` | `1` | Klassencode-Registrierung (Schulen) erlauben |
   | `GEMA_LOGIN_MAX_USER` | z.B. `8` | erlaubte Fehl-Logins pro Benutzer / Fenster |
   | `GEMA_LOGIN_MAX_IP` | z.B. `20` | erlaubte Fehl-Logins pro IP / Fenster |
   | `GEMA_LOGIN_WINDOW_MIN` | z.B. `15` | Fenstergrösse (Minuten) |
6. **Wichtig:** Env-Änderungen greifen erst nach einem **Redeploy**. Netlify → **Deploys** → **`Trigger deploy` → `Deploy site`**.

---

## D — Edge-Zugangskontrolle (der grosse Hebel für den Pilot)

Ziel: Während des Pilots erreicht **niemand ausser deinen Leuten** überhaupt die Seite/API. Zwei Wege — wähle einen.

> **Entscheidend für beide:** Externe Partner bekommen von dir ein **admin-erstelltes Login**. Damit sie die GEMA-Anmeldung überhaupt erreichen, müssen sie **auch die Edge-Wand passieren** — d.h. ihre E-Mail muss auf der Allowlist (Weg 2) stehen bzw. sie brauchen das Site-Passwort (Weg 1). Plane das mit ein.

### Weg 1 — Netlify Passwortschutz (am einfachsten, ein gemeinsames Passwort)
Voraussetzung: Netlify-Plan mit «Password protection» (Pro). 
1. Netlify → Site → **Site configuration** → **Access & security** (bzw. **Visitor access**).
2. **Password protection** → **Set password** → ein starkes Passwort setzen → speichern.
3. Ab jetzt fragt die ganze Site (inkl. Unterseiten) nach diesem Passwort. Gib es nur deinem Pilot-Kreis.
- ➕ Sehr schnell. ➖ Ein geteiltes Passwort für alle; keine pro-Person-Kontrolle; Weitergabe schwer widerrufbar.

### Weg 2 — Cloudflare Access (empfohlen: pro-Person-Allowlist, für kleine Teams gratis)
Die Domain läuft über Cloudflare, davor eine E-Mail-Allowlist. Jeder Nutzer meldet sich am Edge mit seiner E-Mail an (Einmal-Code), erst dann sieht er GEMA.
1. **cloudflare.com** → Konto → **`Add a site`** → deine Domain eingeben → Plan **Free**.
2. Cloudflare zeigt zwei **Nameserver**. Diese bei deinem Domain-Registrar hinterlegen (ersetzt die bisherigen). *(Falls die Domain schon auf Netlify-DNS zeigt: du leitest sie neu über Cloudflare; Netlify bleibt das Hosting-Ziel per CNAME/A-Record, den Cloudflare importiert.)* Aktivierung dauert bis zu einige Stunden.
3. Sobald aktiv: linke Leiste **Zero Trust** → beim ersten Mal Team-Namen wählen (Free-Plan bis 50 Nutzer).
4. **Zero Trust** → **Access** → **Applications** → **`Add an application`** → **Self-hosted**.
   - **Application name:** z.B. „GEMA Pilot".
   - **Application domain:** deine GEMA-Domain (z.B. `app.deinefirma.ch`).
5. **`Next`** → **Policy** anlegen:
   - **Policy name:** „Pilot-Nutzer".
   - **Action:** `Allow`.
   - **Include** → Selector **`Emails`** → die E-Mail-Adressen deiner Pilot-Nutzer (intern **und** die admin-erstellten Externen) eintragen. *(Oder `Emails ending in @deinefirma.ch` für alle Internen auf einmal.)*
6. **`Next`** → **`Add application`**.
7. Testen: die GEMA-URL im Inkognito-Fenster öffnen → Cloudflare fragt nach E-Mail → Code kommt per Mail → danach erscheint die GEMA-Anmeldung. Nicht gelistete E-Mails werden abgewiesen.
- ➕ Pro-Person, sofort entziehbar, gratis, Log wer rein kam. ➖ Nutzer haben „zwei Logins" (Cloudflare + GEMA) — für einen Pilot akzeptabel.

> Die öffentlichen Freigabe-Viewer (`sys_goodel_ansicht.html`, `sys_revision_ansicht.html`) brauchst du im reinen internen Pilot nicht. Falls doch: in Cloudflare eine zweite Application NUR für diese Pfade mit `Action: Bypass` anlegen, damit externe Empfänger sie ohne Login öffnen können.

---

## E — RLS v2 (per-Org-Scoping) — später, gestaffelt

Erst sinnvoll, wenn v1 (A/B) steht und der Pilot läuft. Reduziert den Schaden, falls doch ein Konto missbraucht wird, indem 10 eindeutig org-eigene Collections auf die eigene Firma beschränkt werden.

1. **Vorab-Audit:** In `supabase/gema_rls_v2_orgscope.sql` ganz oben steht «Schritt 0» — diese `select …`-Abfragen einzeln im SQL Editor laufen lassen. Die erste MUSS **0 Zeilen** liefern (keine Records ohne `orgId`). Sonst zuerst bereinigen.
2. **Zwei-Org-Test:** Mit zwei Test-Firmen prüfen, dass Firma A die Daten von Firma B in den gescopten Modulen nicht mehr sieht/ändert, eigene aber schon.
3. **Einspielen:** `supabase/gema_rls_v2_orgscope.sql` im SQL Editor ausführen.
4. **Rollback bei Problemen:** `supabase/gema_rls_v2_rollback.sql` (stellt v1 wieder her, RLS bleibt aktiv). **Nicht** `gema_rls_rollback.sql` nehmen — das schaltet RLS komplett ab.

---

## Reihenfolge auf einen Blick
1. **C** (Netlify-Env prüfen — Function muss laufen) →
2. **A** (RLS-Status prüfen) → bei Bedarf **B** (v1 einspielen) →
3. **D** (Edge-Zugang für den Pilot) →
4. **E** (v2 später, gestaffelt).
