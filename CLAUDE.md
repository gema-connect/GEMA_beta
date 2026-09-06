# GEMA – Projektkonventionen für Claude Code

GEMA ist eine webbasierte Applikationssuite für Gebäudetechnik und Bauprojektmanagement (Netlify + Supabase, Vanilla JS, keine Frameworks). **Vision**: DER Marktplatz für die Baustelle — Bauherrschaft, Planer, Unternehmer, Lieferanten, Behörden arbeiten auf einer Plattform.

> **Detail-Nachschlagewerk**: `CLAUDE_ARCHIV.md` enthält die Langfassung mit vollständiger Feedback-Historie und Begründungen. Dort gezielt nachschlagen (grep), wenn hier ein Detail fehlt — NIE als Ganzes lesen.

---

## 1. Kernprinzip: Daten einmal erfassen, überall verknüpfen

Jeder Wert wird **einmal** eingegeben; abhängige Module beziehen ihn automatisch, der Planer kann ihn im Zielmodul anpassen.

Regeln für Verknüpfungen:
1. Quelle → Ziel automatisch, im Ziel **editierbar**.
2. Manuelle Überschreibung wird markiert und nicht mehr automatisch überschrieben (Herkunfts-Chip «auto» ⇄ «eigene Eingabe» + «↺ auto», Muster `sb_saugpumpe`).
3. Alle Verknüpfungen sind **objektspezifisch** (nur innerhalb desselben Projekts).
4. Cross-Modul-Reads sind **defensiv** (leerer Pool → leere Liste), Cross-Modul-Writes **ADD-ONLY** (nie persistCollection auf fremde Pools).

### Datenfluss Berechnungen

**LU-Zusammenstellung (`sb_lu_tabelle`, inkl. W3 Diagramm 1)** ist die zentrale Datenquelle. Fünf Medien-Netze:

| Medium | LU-ID | Ziel |
|---|---|---|
| Trinkwasser kalt | `kw` | Druckerhöhung |
| Enthärtetes Wasser | `bw` | Enthärtungsanlage |
| Osmose (vorenthärtet) | `ow` | Osmoseberechnung → Enthärtung (Permeat+Konzentrat) |
| Regenwasser | `gw` | eigene Pumpe |
| Grauwasser | `grau` | eigene Auswertung |

- **`gw` = Regenwasser** (hiess historisch fälschlich «Grauwasser»; ID bleibt aus Bestandsschutz, Label korrigiert). Grauwasser ist `grau`.
- **Doppelzählungs-Schutz (KRITISCH)**: Osmosewasser ist immer vorenthärtet — `ow` fliesst **nur über `GemaOsmose.getResults`** (Permeat+Konzentrat) in die Enthärtung, nie direkt. `getByMedium(oid,'enthaertet')` liefert nur `bw`, `'osmose'` nur `ow`.
- Kette LU → Osmose → Enthärtung: E2E-Guard `scripts/kette_e2e_test.mjs`.

**Unabhängige Module** (kein LU-Bezug): Warmwasser, Zirkulation, Abwasserhebeanlage, Niederschlag, übrige sb_-Module.

**Werte-Verknüpfungen dokumentieren**: `gema_verknuepfung.js` (🔗-Knopf in jeder Berechnung, nur `role_admin`) — Zielfelder anklicken, Quelle wählen, Markdown-Export für Claude Code. Katalog `gema_werte_katalog.js` ist **generiert** (`node scripts/werte_katalog_gen.mjs` nach jedem neuen Feld — sonst failt `scripts/verknuepfung_test.mjs`).

---

## 2. Kanon — Regeln, die überall gelten (KRITISCH)

Diese Muster gelten modulübergreifend. Sie sind die häufigsten Fehlerquellen; sie stehen hier einmal statt pro Modul.

### Eingaben & Fokus
- **Numerische Inputs IMMER** `<input type="text" inputmode="decimal" onblur="fixLeadingZero(this)">`. **Nie `type="number"`.** `fixLeadingZero` normalisiert Komma→Punkt und führende Punkte.
- **Fokus-Regel**: `input`-Handler dürfen NIE die ganze Liste/Tabelle neu bauen (`innerHTML`) — sonst verliert das Feld nach dem ersten Zeichen den Fokus («10» wird «1»). Nur die betroffenen Zellen nachzeichnen (Muster `paintCells` in `sb_lu_tabelle`, `wePaintPos` im Wareneingang). Rendert eine Funktion die Liste doch neu, muss sie das aktive Feld + Cursorposition + ROHEN Eingabetext retten (Muster `render()` in `sb_druckverlust`).
- **Vorbefüllte `type="date"`-Felder**: speichern bei `change`, rendern erst bei `blur` — sonst reisst jede getippte Ziffer den Segment-Cursor zurück. Ein Datumsfeld, in dem gerade getippt wird, NIE programmatisch beschreiben (`el===document.activeElement`-Guard).
- **`isTrusted`-Guard**: Einheiten-Umschalter, Auto-Ableitungen und Standard-Übernahmen dürfen nur bei **echter Benutzeraktion** umrechnen/lösen (`ev.isTrusted`). AutoSave-Restore und Tab-Wechsel feuern synthetische Events — ohne Guard rechnet jeder Reload die Werte erneut um (3 bar → 300 → 30'000).
- **Freistehende Zahlenfelder** tragen eine angeschlossene Einheiten-Box (`.g-inp-group`/`.g-inp-unit` oder `.fg`/`.fg-unit`); die Einheit steht in der Box, nie im Label. Höhe/Bündigkeit erzwingt `gema_responsive.css` Abschnitt 18 zentral.
- **Kein `text-transform:uppercase`** an Einheiten/Formelzeichen («l/s»→«L/S», η→Η). Formelzeichen in Labels brauchen den `.sym`-Wrapper.

### Speichern
- **`_GemaDB.put` existiert NICHT** — jeder Aufruf war ein stiller No-Op. API: `init/ensure/save/remove/loadFromModule/saveToModule`.
- **Init-Key-Regel**: `_GemaDB.init(modul, keys)` lädt NUR die angefragten Keys. Per-Objekt-Module MÜSSEN `[BASE, GemaObjekte.storageKey(BASE)]` laden.
- **Objektwechsel zur Laufzeit** → `_GemaDB.ensure([neuerKey])`, Schlüssel NEU berechnen. **Kein eingefrorener Alias** (`const SK = _sk`) — sonst schreibt das Modul weiter in den Boot-Key. Liegt der Loader in einer anderen IIFE: `window._objReload` exponieren.
- **Debounce braucht drei Ausstiege**: `beforeunload` **+ `pagehide` + `visibilitychange`** (iOS/PWA überspringen beforeunload). Gilt für gema_db, gema_autosave und jedes Modul mit eigenem Debounce.
- **Cross-org Pools NUR `saveRecord`/`deleteRecord`**, nie `persistCollection` (das difft gegen den lokalen Cache und löscht fremde Records).
- **EMPTY-READ-GUARD**: Eine leere Cloud-Antwort ist **kein Beweis** für «gibt es nicht» (Offline, RLS-Ablehnung, noch nicht geladen liefern HTTP 200 + []). Nie einen gefüllten Cache mit `[]` überschreiben, nie daraus eine Löschung ableiten.
- **PreBoot-Journal**: Writes zwischen `bind()`-Start und Abschluss des Cloud-Pulls journalen und danach wieder über den Cache legen — sonst wischt der ältere Cloud-Snapshot einen im Boot-Fenster erfassten Datensatz weg (Muster `_plPreBoot` in pm_plaene, gema_schule_api, if_arbeitskleider).
- **Denormalisierte Namen**: existiert der Datensatz noch, gewinnt der Live-Lookup (`GemaObjekte.displayName`), der gespeicherte Schnappschuss ist nur Fallback.
- **Objekt-Anzeige**: Dropdowns/Labels IMMER über `GemaObjekte.displayName(o)` (folgt der Firmen-/Nutzer-Einstellung Bezeichnung ⇄ Adresse). Anzeige-Lookups bestehender Records über `getById`/`getAllUnfiltered` (`getAll` filtert auf `status==='aktiv'` und ist nur für Auswahl-Dropdowns); Fallback bei fehlendem Objekt «⚠ Objekt nicht gefunden», NIE die rohe ID.

### Anzeigen & Melden
- **No-silent-caps**: Was gedeckelt, übersprungen, nicht geladen oder nicht zugeordnet wird, wird **benannt** — nie stillschweigend weggelassen. Ein Wert, der bekannt ist, wird beziffert («0.00 kWh/d»), ein unbekannter als «—» ausgewiesen.
- **Fehlende Angabe nie raten**: kein erfundener Normwert, kein Standardwert ohne Beleg; stattdessen Hinweis + freie Eingabe (Muster `pending:true` bei Kemper-Kennlinien).
- **Ehrliche Fehlermeldungen**: `r.status !== 200` ist nie dasselbe wie ein Netzfehler. «Bitte Internetverbindung prüfen» nur bei echtem fetch-Reject.
- **Sichtbarkeit MESSEN, nicht am Markup ablesen** (`getComputedStyle`/`elementFromPoint`). Elemente, deren Layout irgendwo per `!important` erzwungen wird, lassen sich NICHT per Inline-`display:none` verstecken (Nav-Buttons → `.gnav-weg`; gefilterte Kacheln → `data-perm-hidden` in gema_responsive.css).
- **Escaper decken `&<>"'` ab** (Werte landen in Attributen/onclick). Fremd-HTML wird mit `DOMParser` geparst, nie mit `innerHTML` (ein losgelöstes `<div>` lädt `<img src=x>` und feuert `onerror`).

### Struktur & Scope
- **Cross-Block-Scope**: Inline-`onclick` und Code in anderen `<script>`-Blöcken erreichen NUR window-exponierte Namen. Ein grossflächiges try/catch verschluckt solche ReferenceErrors lautlos.
- **IIFE-Module** (`if_fahrzeug`, `pm_objekte`, `sb_apparateliste`, `if_trocknung`, …): Zustand und Helfer sind von aussen unerreichbar → Test-Hooks an `window` (`_fzPermHooks`, `_wsHooks`, …); Inline-Handler dürfen NIE direkt auf IIFE-Variablen schreiben.
- **Nie eine zweite `function NAME(){}`-Deklaration** im selben Scope zum Wrappen (Hoisting → Endlos-Rekursion). Wrappen per Zuweisung oder `window.x`.
- **Engine im `/*ENGINE-START*/…/*ENGINE-END*/`-Block**: DOM-freie Rechenlogik, per Regex extrahierbar → Node-Tests ohne Browser.
- **Dynamische File-Inputs müssen im DOM hängen** (iOS-GC räumt losgelöste Inputs weg, `change` feuert nie). Zentrales Sicherheitsnetz in `gema_auth.js` (Patch auf `HTMLInputElement.prototype.click`), neue Dialoge hängen ihn trotzdem selbst ein.
- **Datei-Filter nie über `file.type` allein** — iOS liefert Mediathek-Fotos oft ohne MIME-Typ; leerer Typ heisst «unbekannt», nicht «kein Bild».
- **Snapshot-Fallback**: `GemaAutoSave` restauriert beim Seitenstart NUR mit gewähltem Objekt. Module mit Basis-Key-Betrieb brauchen einen `<präfix>SnapshotLoad` (700/1800/3500 ms, `_touched` via `isTrusted`), sonst geht ohne Projektbezug jeder Reload verloren.
- **SVG/Canvas in Berichten: NUR literale Hex-/rgb-Farben** — html2canvas/GemaPDF rastern `var()` falsch.
- **Absolute Flex-Container mit %-Kindern brauchen explizite Breite** (`right:0`), sonst kollabieren die Kinder auf 0.
- **IDs bleiben beim Umbenennen stabil** (`data-id` an Editor-Zeilen: Arbeitsbereiche, Kategorien, Zahlungsbedingungen, Rollen) — sonst verlieren alle Referenzen ihre Zuordnung.
- **Zugewiesene/gespeicherte Werte nie still verlieren**: nicht darstellbare Auswahl als **⚠-Option** rendern (abwählbar), Save-Guard behält den gespeicherten Wert, wenn das Select ihn gar nicht anbieten konnte.

### Dialoge
`GemaDialog` statt nativer Dialoge (`gema_dialog.js` einbinden). `confirm({danger:true})` für Löschungen, `focusCancel:true` = Vorauswahl «Nein», `html:true` = Aufrufer escapt selbst. `window.alert` ist global überschrieben.

### Drift-Guards
Jede grössere Fachänderung bekommt ein Guard-Script in `scripts/` (Node für Engines, Playwright für UI). Regeln: **Absicht prüfen, nicht Wortlaut** (ein wortwörtlich gepinnter Ausdruck blockiert die nächste Änderung); Geometrie **messen** (`getBoundingClientRect`), nicht aus viewBox rechnen; **Gegenprobe** fahren (ohne Fix müssen Checks rot werden); neues Feedback darf altes bewusst übersteuern — den betroffenen Check dann invertieren und kommentieren. Ausführen: `CHROME=<chromium> node scripts/<test>.mjs`.

---

## 3. Storage & Sync (`gema_sync.js`) — Cloud-First

**Single source of truth ist Supabase.** Pro Datensatz eine Row in `gema_data` (`data_key='<prefix><id>'`), Saves per Diff. localStorage ist sekundärer Cache und wird beim Bootstrap vom Cloud-Stand überschrieben.

**API**: `bindCollection(moduleKey, storageKey, prefix, idField)` (Boot: Cloud→Cache, migriert Alt-Blob) · `persistCollection(...)` (Diff-Save) · `saveRecord/saveRecords/deleteRecord` · `loadCollection/loadRecord` · `getCached(storageKey)` · `getAuthToken()` · `SB_URL` (**Getter** — Proxy-Fallback) · `flushOutbox/pendingCount/pendingInfo` · `cacheReady` · `prefetchNow`.

**Verbindliche Regeln:**
- Collection-Caches IMMER über `getCached()` lesen, nie `localStorage.getItem` (iOS-Quota).
- Supabase-Fetches IMMER mit `(GemaSync.getAuthToken() || SB_KEY)` und `GemaSync.SB_URL` **zur Laufzeit** (Same-Origin-Proxy `/sb` schaltet automatisch um, wenn supabase.co blockiert ist).
- `user:`/`org:`/`role:`-Writes laufen NIE direkt, sondern über die `gema-auth`-Function (GemaSync interceptet).
- **Verlustfrei**: local-first + persistente Outbox. Jeder fehlgeschlagene Push (offline/413/5xx) wird eingereiht, automatisch nachgesendet und überlagert bis dahin den Cloud-Stand beim Laden. `opts.noQueue` unterdrückt das (nutzt persistCollection intern); `moduleKey==='auth'` wird nie eingereiht. Last-Write-Wins bleibt die bewusste Design-Grenze.
- **Offline-Erkennung**: Ein einzelner fehlgeschlagener Write beweist keine tote Leitung — erst eine billige Gegenprobe (`_probeOnce`) entscheidet. 4xx (ausser 408/429) schaltet nie auf offline. Banner unterscheidet «lokal gesichert, Verbindung ok» (teal) von «offline» (amber), hat ✕-Snooze und Selbsttest.
- **401 → `_handle401`** auf allen Pfaden (Token weg, Login-Redirect). Eine **token-lose Session** liest unter RLS leer (HTTP 200 + []) → Auto-Logout bzw. Re-Login-Banner; `bindCollection` leert dann nie einen gefüllten Cache.
- **Gift-Record**: Batch-Fehler fällt auf Einzel-Sends zurück; >300 KB-Records mit Base64 werden automatisch nach GemaStorage ausgelagert (`_shrinkRecordData`), RLS-403 ohne `orgId` heilt durch Nachstempeln der eigenen Org. **Jedes Modul einer org-gescopten Collection MUSS `orgId` auf jeden Record stempeln.**

**Loading-Kanon (Boot jedes Moduls):**
```js
try { load(); renderList(); } catch(e){}            // 1) SOFORT aus Cache
if (window.GemaSync) await Promise.race([bind, timeout]).catch(function(){});
_xxCloudLoaded = true;                               // auch im Fehlerpfad!
load(); renderList();                                // 2) mit frischen Daten
GemaSync.cacheReady.then(function(){ if(!_xxCloudLoaded){ load(); renderList(); } });
```
- `_xxCloudLoaded` steuert die Ladeanzeige: Empty-State erst NACH dem ersten Pull; solange bei leerem Cache geladen wird, **Skeleton** (`.gema-sk*` in gema_responsive.css Abschnitt 19) statt erfundener Zahlen. Gefüllter Cache rendert sofort echte Daten (kein Skelett).
- **Kein `GemaAuth.restoreFromCloud()` in Modul-Boots** (doppelte Pulls).
- Delta-Sync, IndexedDB-Warm-Cache und Hintergrund-Prefetch stecken zentral in gema_sync — Module brauchen dafür nichts zu tun. `loadCollection` paginiert (PostgREST deckelt bei 1000; Supabase-«Max Rows» nie unter 1000 senken).

**Per-Objekt-Keys**: `GemaObjekte.storageKey(base)` → `base__<objektId>[@phase]`. Der Schlüssel darf zwischen zwei Besuchen NICHT wechseln — `?objekt=` wird synchron angewendet, `getActiveId()` fällt auf den Geräte-Key zurück, `_healActive` fasst eine leere Objektliste nicht an.

**SIA-Phasen**: `PHASES`-ids sind STABIL (`vorprojekt/bauprojekt/ausschreibung/ausfuehrung` — sie stehen in Storage-Keys), nur Labels wurden korrigiert. `?phase=<id>&eingefroren=1` = seitenlokaler Override + Nur-Lesen-Modus (`_frozenUiApply`, AutoSave blockt hart).

**Aktive Collections** (moduleKey → prefixes): `auth` (org:/user:/role:) · `objekte` (objekt:/bet:) · `werkzeugmanagement` (tool:/inv:) · `fahrzeugmanagement` (vehicle:) · `trocknungsgeraete` (device:) · `schadensbericht` (schaden:) · `dachbericht` (dach:) · `produktkatalog` (produkt:/lieferant:/oa:) · `ausschreibung` (aus:/ausbet:/ausanf:/ausvrt:/ausein:/ausna:/ausmk:) · `schnellausschreibung` (sa:) · `erp` (erpdok:/erpkunde:/erpkred:/erpkat:/erpvorl:) · `bestellungen` (best:) · `einsatzplan` (einsatz:) · `stundenerfassung` (std:) · `regierapport` (regie:/regiezus:) · `immobilien` (imlg:/imwhg:/immv:/imauf:/immieter:/imzahl:/imnk:) · `arbeitskleider` (akart:/akbez:) · `abnahme` (abproto:/abfrg:/abml:) · `goodel` (goodel:) · `armaturen` (arm:) · `revisionsunterlagen` (revd:/revv:/reva:) · `behoerden_formulare` (bform:/bformv:) · `plaene` (plnprj:/plnseite:) · `planablage` (pabd:/paba:/pabp:) · `abos` (abocfg:/abosub:/abotok:) · `chat` (chat:/chatread:/chatmsg:/chatprefs:) · `schule` (sklasse:/smat:/smatan:/saufg:/spruef:/spruefl:/sabg:) · `pruefliste` (prstd:/prov:/probj:/prbeg:) · `spuelmanager` (spobj:/spst:/splog:) · `legionellen` (hysite:/hygeb:/hyraum:/hyps:/hyprobe:) · `service` (svanl:/svvtr:/svauf:) · `workspace` (ws:/wstpl:) · `favoriten` · `aktivitaetslog` (log:) · `notify` (notif:/nprefs:) · `berechnungsindex` (bidx:) · `anlagenwahl` (aw:) · `verknuepfungen` (vk:) · `lebensdauer` (ldkat:) · `machbarkeitsstudie` (mbs:) · `zustandsanalyse` (za:) · `wareneingang` (we:/wemap:/weoff:) · `quiz` (quizq:) · `editlock` (lock:).

---

## 4. Auth, Rollen & Sicherheit

### Server-Auth (Secure v1/v2)
- **`netlify/functions/gema-auth.js`** (ENV `SUPABASE_SERVICE_KEY`, `GEMA_JWT_SECRET`): `login` (scrypt-`cred:`-Records) stellt ein Supabase-kompatibles JWT aus; `register`/`activate`/`register_student`/`class_info`; `persist_auth` prüft Rechte serverseitig.
- **Kein Client-Login, kein Default-Admin.** `GemaAuth.login`/`activateInvitation` (synchron) existieren nicht mehr; ohne erreichbare Function gibt es eine klare Fehlermeldung statt eines Fallbacks. `_hash` (djb2) ist nur noch Transportformat für Passwortänderungen.
- **Selbst-Update-Whitelist** in `persist_auth`: `{name,profile,avatar,einstellungen,password}` + `roleIds` **nur für Org-Admins** (nie `role_admin`; `orgId`/`active`/`abo`/`planerPremium`/`lieferantId`/`gastZugaenge` bleiben eingefroren). Nicht freigegebene Felder werden still eingefroren (kein 403 — veraltete Client-Caches senden legitim mit).
- **RLS**: `supabase/gema_rls_v1.sql` (keine anon-Policies; `cred:` nur Service-Key) + optional `gema_rls_v2_orgscope.sql` (10 single-org-Collections auf JWT-org gescopt, manueller Rollout).
- Selbst-Registrierung hinter `GEMA_REGISTRATION_OPEN` / `GEMA_STUDENT_REGISTRATION_OPEN` (Client-Flags in `sys_login.html` spiegeln das). Login-/Register-/Klassencode-Drosseln pro IP (fail-open, gehashte `throttle:`-Records).
- **Sitzung eröffnen IMMER über `GemaAuth.adoptSession(user, {token,...})`** + `warmCaches()` — nie `localStorage.setItem('gema_session_v1',…)` von Hand (der Boot-Check prüft den Benutzer synchron gegen den lokalen Cache und wirft sonst zurück auf den Login). Landing über `GemaAuth.getLandingPage(user)`.
- **Neue Function mit kostenpflichtiger/externer Aktion: IMMER `requireAuth` aus `_jwt.js`.** Serverseitige URL-Fetches nach dem `_safeUrl`-Muster (DNS-Auflösung + IP-Prüfung + manuelle Redirects).

### Rollen
`GemaAuth.can(recht, modulKey)` ist der Gate. `_allPerms` gibt Planer-Rollen/Admin/Abteilungsleiter automatisch jedes neue Modul; `_mergeWithDefaults` backfillt fehlende Permission-Keys bestehender Cloud-Rollen (**sonst zeigt ein neues Modul dort «Kein Zugriff»**).

| Rolle(n) | Kurz |
|---|---|
| Sanitär-/Heizungs-/Lüftungs-/Elektroplaner | Vollzugang Berechnungen + PM |
| Abteilungsleiter | wie Planer + Freigaben |
| Spengler | Dachbericht, PM, Werkzeug-Read |
| Monteur | Read-only Werkzeug/Fahrzeug, Defekte melden, Stunden, Rapporte |
| Unternehmer | Ausschreibung, Offerten, Bestellungen, ERP r/w |
| Bauherrschaft / Architekt / Behörde | Projektsicht, Freigaben, Bewilligungen |
| `role_lieferant*` (Anlagenlieferant: Admin/Produkte/Verify/Offerten/Intern) | Dashboard-Modul + Berechnungen des Sortiments |
| `role_produktlieferant*` (Werkzeuge, KEINE Verifizierung) | Dashboard mit Werkzeug-Sicht |
| `role_pruefer` / `role_leiterpruefer` | Prüfaufträge quittieren, Prüfberichte |
| Garagist | eigenes Dashboard, Fahrzeug-Whitelist |
| Magaziner / Lagerist | Werkzeug-/Fahrzeuglager bzw. Wareneingang |
| Immobilienverwalter | iv_immobilien + Spülmanager |
| Dozent / Studierende | Klassen, Lernmittel, Prüfungen (Studierende hart gegated) |
| `role_free` | GEMA Card gratis (Objekte read-only = Upsell) |
| Admin | alles |

**Rollen-Regeln:**
- **Hard-Locks schlagen die Matrix**: `_wzCanEdit`/`_fzCanEdit` geben für `role_monteur` IMMER false — der Monteur-Check MUSS die ERSTE Zeile sein (sonst rutscht ein Org-Admin/admin-Grant durch). Externe Partner (`_wzIsNurExtern`) dürfen nur ihre Auftragsarbeit; pro Gerät entscheidet `_wzCanEditTool(t)`.
- **Preis-Sichtbarkeit** (`_fzCanSeePreise`) folgt demselben Kanon: Monteur-Lock als erste Zeile, CSV entfernt die Spalten statt sie zu leeren.
- **Firmen-Kategorie → zuweisbare Rollen**: `GemaAuth.getAssignableRoleIdsForOrg(orgId)` (rollen-getrieben über `role.kategorien`, Default aus `KATEGORIE_ROLLEN`; `null` = unbeschränkt, `role_admin` nie eingeschränkt). Ist UI-Komfort, keine Rechtegrenze.
- **Impersonation**: `GemaAuth._switchUser` hat einen Admin-Guard — nie entfernen.
- **`_KONTO_SEITEN`** (sys_profil/sys_preise/sys_beta/sys_unternehmen/sys_admin) sind vom Rollen-Redirect ausgenommen; sie guarden sich selbst.
- **Nav-Knöpfe folgen dem Guard IHRER Zielseite** und werden per `.gnav-weg` versteckt (fail-closed im Markup starten).

---

## 5. Design & Navigation

- **DM Sans** (kein DM Mono), `.g-page` max-width **1100px**, Nav full-width.
- **Nav-Kanon** (Drift-Guard `scripts/nav_uniform_test.mjs`): genau EINE Logo-Variante (volles GEMA-SVG, `height="28"`, href `index.html`), Breadcrumb `a.bc-cat › span.bc-cur` mit festen Labels (`sb_index`→«Sanitärberechnungen», `index.html#hei`→«Heizung & Wärmeerzeugung», `#lueft`, `#brand`, `pm_ausschreibung`→«Planung & Management», `ab_index`→«Ausbildung»). Kein «GEMA»-Crumb, keine «← …»-Links. Feedback-Knopf auf JEDER Seite (`GemaFeedback.init(...)` im DOMContentLoaded ist Pflicht — ohne init tut der Knopf nichts). Nav-Metriken erzwingt `gema_responsive.css` zentral.
- **Im Workspace-Eimer** ersetzt `_eimerPfad()` den Breadcrumb durch «Eimer › Modul» (Kontext aus `gema_ws_ctx_v1`, vom Workspace gesetzt — Module lösen Eimer nie selbst auf).
- **Modul-Kacheln**: genau 3 Stichpunkte (`ul.mod-pts`), gleiche Höhen (`grid-auto-rows:1fr` + `.mod-title{min-height:2.4em}`). Permission-Filter setzt `data-perm-hidden`; «Bald»-Ausblicke sind **opt-in** über `data-soon-fuer="<modulKey>"` (+ `data-soon-recht`), alles andere ohne `data-module` wird ausgeblendet (Admin sieht die Roadmap).
- **Hero in Modulen**: `.hero-in/.hero-left/.hero-ic/.hero-title/.hero-sub` — NIE `<h1>`/`<p>` (sonst greifen die Hub-Regeln aus gema_responsive.css). Auf ≤640px zeigen alle Heroes nur Icon + Titel.
- **Sticky-Leisten** unter der Nav: `top: calc(72px + env(safe-area-inset-top, 0px))`, weitere gestapelt.
- **`overflow-x: clip` statt `hidden`** auf html/body (hidden erzeugt einen Scroll-Container → sticky funktioniert nirgends mehr).
- **Safe-Area**: PWA-Metas im `<head>` jeder Seite, `html::before` als Statusleisten-Streifen, jedes neue `position:fixed`-Element mit top/bottom-Bezug braucht `env(safe-area-inset-*)`.
- **Datumsfelder** laufen nie über: zentral in `gema_responsive.css` Abschnitt 17 (Struktur global, WebKit-Innenleben nur auf Touch).
- **Sektionen**: `gema_sektion.js` macht jede Karte einklappbar (Pfeil ganz rechts, Kopf-Bedienelemente verschwinden mit dem Inhalt), vereinheitlicht Sektionsnummern (auch mehrstellige «3.3» via `.gsek-nr--lang`). **Fold-Zustand ist Geräte-UI** (localStorage), NIE im AutoSave-Snapshot; `@media print` zeigt alles. Zur Laufzeit steht die Nummer im Chip → Browser-Guards nie auf den exakten String «1. Titel» prüfen.
- **Design-Referenz «GEMA Native»**: `gema-native.css`/`gema-native.js`/`gema-native-screens.html` (iOS-Komponenten, alle Selektoren `.gn `-gescoped wegen Namenskollision mit der Notify-Glocke).

---

## 6. Querschnitts-Systeme

### Print & PDF
- **Berechnungsmodule: `gema_print.js`** (`GemaPrint.open`) — A4-Vorschau mit echtem Text, JS-Paginierung, Kopf/Fuss auf jedem Blatt (Logo links, Projekt+Titel mittig in Markenfarbe, «Seite X / Y»), Karten-Nummern 01…, Fortsetzungs-Marken, Tabellen-Teilung. Draussen: Hero, Projektleiste, alle Knöpfe (auch ✕). Leere Sektionen erscheinen als «— keine Angaben». Kein separater Drucken-Knopf mehr.
- **Übrige Module: `gema_pdf.js`** (html2canvas/jsPDF) bzw. eigene Print-Fenster (`gema_schaden_pdf.js`, `gema_dachbericht_pdf.js`, `gema_revision_pdf.js`).
- **Branding**: `org.settings.pdfFarben.primary` (+ optional secondary) mit **Kontrastschutz** — Richtung Schwarz skalieren bis WCAG ≥ 4.5:1 gegen Weiss; derselbe Ton taugt dann als Text auf Weiss UND als Fläche unter weisser Schrift. Logo `org.logoVector || org.logo` (SVG bevorzugt), Seitenverhältnis erhalten. Fliesstext IMMER schwarz.
- **Druckfenster-Regeln**: Inline-Scripts ans **Dokumentende** (ein ladender Fonts-`<link>` blockiert nachfolgende Scripts und `document.close()` verwirft den Rest); `GemaPrintA4.apply()` wartet auf `readyState`; keine externen Handler ausser Inline; jsPDF-Standardfonts sind **latin1** (☐/☒/Ω/Emoji werden zu Müll → zeichnen oder umschreiben); `font-optical-sizing:auto` + `"opsz" 14` (Drift-Guard `scripts/pdf_opsz_test.mjs`); jedes Modul braucht einen **eigenen** `document.title` (= PDF-Dateiname).
- **Nie Inline-Markup in einen `document.write`-String einfügen** (String-Regeln: kein roher Umbruch, `</script>` beendet den Block).

### Fotos & Storage
- **`gema_storage.js`**: `uploadDataUrl(dataUrl, pfad)` (Bilder/PDF, verifiziert öffentliche Erreichbarkeit) · **`uploadFile(file, pfad, {onProgress,maxMb})`** für grosse Dateien (kein Base64-Umweg, XHR-Fortschritt) · `collectFiles/confirmDelete/deleteFiles/zipDownload/zipTexte/urlKandidaten/fetchDataUrl`. Bucket `gema-fotos` (public + anon-INSERT).
- **Kanon: erst Bucket, dann Record.** Im Record steht nur die URL; Base64 nur als Fallback ≤ 2.5 MB, darüber wird das Fehlen GEMELDET.
- **Upload-Pfade IMMER `<bereich>/<orgId>/…`** — nur so kann `netlify/functions/storage-delete.js` (Service-Key, Org-Grenze) sie beim Löschen aufräumen.
- **Offline-Foto-Warteschlange `gema_fotoqueue.js`**: `scope(name)` → `put/get/src/srcStr/wartet/materialize/upload/auto`. Record trägt `{pendingId}`, Bild liegt in IndexedDB (localStorage-Quota reicht für ~4 Fotos). Runner: Pool EINMAL pro Lauf lesen, dirty Records einzeln speichern. Verdrahtet in sd_schadensbericht, sp_dachbericht, pm_abnahme, pm_regierapport, pm_stunden, pm_planablage, pm_machbarkeitsstudie, pm_zustandsanalyse (pm_pruefliste hat eine eigene, gleichwertige IDB).
- **Gesplittete Foto-Kachel** (📷 Kamera `capture` / 🖼 Mediathek `multiple`) — der Container selbst ist nicht klickbar. Mehrfachauswahl mit Folge-Dialog läuft **seriell** (sonst überschreibt das letzte Bild die Dialoge der vorherigen).

### Benachrichtigungen & Chat
- **`gema_notify.js`**: `push({eventKey, empfaengerUserId|RoleId|OrgId, modul, typ, titel, text, link})`. Neue Events in `EVENT_KEYS` eintragen (sonst greift kein Prefs-Filter), Gruppe zusätzlich in `gema_notify_ui.js` → `MODUL_LABELS` **und** `MODUL_ZUGRIFF` (Drift-Guard `scripts/notify_prefs_gating_test.mjs`).
- Rolle **und** Org gesetzt = beide müssen passen. Zweistufiger Prefs-Filter (Erstellen bei persönlichen, Anzeigen bei Rollen-/Org-Meldungen). Cloud-Sync mit serverseitigem Empfänger-Vorfilter + 60-Tage-Retention.
- **`gema_chat.js`**: `start({userId|email|lieferantId, kontext:{typ,refId,label,url,urlExtern}})` = Direkt-Chat mit klickbarem Bezug; `ensureGruppe({gruppeId,...})` = Gruppen-Thread mit **stabiler** ID (nie `start()` dafür — dessen Key hängt an den userIds). Nachrichten per Thread-Prefix, Lesestand ein Record pro User+Thread.

### Feedback
`gema_feedback.js`: Snip mit **gemessener Kalibrierung** (zwei Marken im Bild statt Annahme), Annotation (Stift/Pfeil/Rechteck/Text, 5 Farben), `startWithImage(dataUrl)` für eigene Druckfenster. Erfasst IMMER nur den **Viewport** (`_captureViewport`) — bei opakem Vollbild-Overlay dessen Element; nie `x/y` mit negativem `scrollX/Y` kombinieren; vor programmatischem Scrollen (auch im Klon) `scroll-behavior:auto` erzwingen; same-origin-iframes werden nachkomponiert.
**Zustellung**: Outbox `gema_feedback_outbox_v1` (nichts geht verloren), Screenshot in den Bucket, ehrliche Meldung («⏳ Noch nicht übermittelt»). Board in `sys_beta.html`: Panels je Modul, Ampel-Zähler, Mehrfachauswahl, **Export-Freigabe «Feedback umsetzen»** (Admin-Feedback ist automatisch freigegeben, bewusste Wahl gewinnt immer), Markdown-Export mit eingebetteten Screenshots, 🧹-Aufräumen (nur `erledigt` + Alter, nie undatierbare).

### Weitere geteilte Systeme
- **`gema_berechnungs_tabs.js`**: mehrere Berechnungen pro Objekt, null Konfiguration (Script-Tag nach `gema_autosave.js`). Aktiver Tab im DOM, inaktive als Feld-Schnappschüsse; `_GemaDB`-Blobs via `blobLesen/blobSetzen` + `window._objReload`. Tab-Buttons heissen `.gbt-tab` (nie `.g-tab`). Ohne Tabs: lt_hx_diagramm, sb_druckverlust (eigene Varianten), br_vkf_formular, sb_vonroll, sa_oelabscheider.
- **`gema_editlock.js`**: nicht-blockierender Banner bei gleichzeitiger Bearbeitung. Lock gilt IMMER genau EINEM Datensatz und entsteht erst bei der ersten echten Eingabe (`isTrusted`) — nie an einer Liste, nie an einem Modul-Key. `noQueue:true` auf allen Lock-Calls.
- **`gema_anlagenwahl.js`**: Anlagenauswahl + Offertanfrage. **Payload-Regel: `berechnungswerte` = berechnete PROJEKTwerte, nie Datenblattwerte** der gewählten Anlage (die geht via `produktId`/`produktName` mit). Gewählte Anlage wird per-Record gespiegelt (`aw:`). Pumpenkennlinien via `gema_pumpenkennlinie.js` (lazy).
- **`gema_aktivitaetslog.js`**: `log({modul,modulRecordId,aktion,beschreibung,orgId})` — **orgId = Org des DATENSATZES**, nicht des Bearbeiters (Cross-Org-Aktionen). `openModal({recordId,onClose})`; **`onClose` ist Pflicht, wenn aus einem Dialog geöffnet** (das Modal lebt per appendChild/removeChild und löst keinen Scroll-Lock-Check aus).
- **`gema_scroll.js`**: Body-Lock für Modals (Auto-Hook auf `.modal-bg`, Attribut-Mutationen). Klasse/Style dynamisch erzeugter Modals NACH dem Einhängen setzen.
- **`gema_hoehe.js`**: Terrainhöhe ab swisstopo-Karte (Druckdispositiv, Saugpumpe, Gas — mbar-Modus für Medizinalgas).
- **`gema_adresse.js`**: Adress-Autocomplete mit Zerlegung (Strasse/Nr/PLZ/Ort), zweistufige Suche, Client-Filter, nichts fällt still weg. **Einzige Adress-Suche im Repo** — Module rendern nur.
- **`gema_zefix.js`**: Handelsregister am Firma-Feld. `GemaZefix.firma({firma, strasse, plz, ort})` ist der empfohlene Einzeiler; Quellen-Kaskade (LINDAS Open Data → Zefix REST), `?selftest=1` diagnostiziert. Ohne Quelle bleibt das Feld tippbar.
- **`gema_dataselect.js`**: IGH-Lieferantenkataloge (DataExpert), Proxy `/api/dataselect`, Format `debim` (XML, mit Bild-URL), Ausführungs-Gruppierung. Ohne Vertrag läuft GEMA normal weiter.
- **`gema_claude.js`** + KI-Proxies (alle JWT-gegated): `rewrite/fix/shorten/expand` (Text) · `extractPositions` (Wareneingang) · `analyzeForm` (Behördenformulare) · `analyzePlan` (Pläne) · `extractBeleg` (Fahrzeug-Belege) · `checkOfferPdf` (Ausschreibung). **`createRedactor()` anonymisiert Kundennamen/-adressen vor dem Versand** und stellt sie in der Antwort wieder her (Text-Modi automatisch). Netlify bricht Functions nach ~10 s ab → Text-vor-Datei + Chunking/Parallelisierung; Client-Cap `MAX_B64` 4.5 Mio Zeichen.

---

## 7. Modul-Inventar

Dateipräfixe: `sb_` Sanitärberechnung · `sa_` Sanitäranlage · `hz_` Heizung · `lt_` Lüftung · `el_` Elektro · `br_` Brandschutz · `hy_` Hygiene · `sv_` Service · `sp_` Spenglerei · `sd_` Schadensdoku · `if_` Infrastruktur · `iv_` Immobilien · `pm_` Projektmanagement · `ab_` Ausbildung · `sys_` System. **Keine Umlaute in Dateinamen** (ae/oe/ue), Displaynamen mit echten Umlauten.

Registrierung eines NEUEN Moduls (Reihenfolge): `gema_auth.js` (MODULES + FILE_MAP + ggf. Rollen) → Hub-/index-Kachel → `sw.js` (Version hochzählen) → `gema_recent.js` (PAGE_LABELS) → `sys_workspace.html` (MODULES + `_WS_STATUS_CFG`) → `scripts/workspace_module_test.mjs`-Pflichtliste → Rollen-Golden neu erzeugen → Drift-Guards grün.

### Sanitärberechnungen (`sb_`/`sa_`)

| Modul | Kern / Fallen |
|---|---|
| `sb_lu_tabelle` | Zentrale LU + W3. Eigene Spalten je Netz (KW/WW/ND/EW/OW/RW/GW), Total-Fusszeile, Spezial-/Dauerzeilen mit Einheitenwahl (l/s·l/min·l/h, gespeichert wird der EINGEGEBENE Wert), `MED_COLORS` = EINE Farbpalette, Reduktions-Balken (Zuschläge magenta — nie eine Medium-Farbe), Hausanschluss über die GESAMT-LU (identisch in `GemaLU.getHausanschluss`). `paintCells` ist die einzige Stelle, die Zellen+Select-Farbe setzt. |
| `sb_druckverlust` | Teilstrecken eingeklappt mit Kopf-Chips, v-Ampel je Leitungstyp, Rohrsystem global (Haken «gemischt»), Sammel-Systeme (`MERGED_SYSTEMS`, k pro Dimension), Formstück-Karten mit ζ, Optimierungs-Vorschlag, Schema oben. Legacy-Dimensionen NIE löschen (`legacy:true`). |
| `sb_zirkulation` | Teilstrecken-Netz, `zkCalc` (Excel-treu), thermostatische Regulierventile mit KV(T)-Kennlinie **pro Strang**, RV-Karte, Netzschema von unten nach oben mit **längenproportionaler Höhe**, Kopfzeile trägt die Auswahlfelder (Werte nur im Detail), `zkPaintRowSelects` statt Voll-Render. |
| `sb_warmwasser` | SIA 385, 5 Mappen, Speicherschema (Zonen im Grössenverhältnis, Zeitraffer), Summenlinien (VSSH), Speicheroptimierung 24 h, Typ-Stundenprofile (SI-1991-Profile sind um 5 h rotiert), Verlustzahl-Ampel. Kapitel 1.1–6.x fortlaufend nummeriert. |
| `sb_du_zusammenstellung` | EN 12056-2, Reduktionsübersicht, variable Zeilen mit freiem Namen, eigener K-Wert, `totals` im Save-Payload (Konsument: Grundleitungen). |
| `sb_grundleitungen` | Leitungsbaum bis HSK, Engine mit Prandtl-Colebrook + Teilfüllung, Retention, SVG-Schema mit ⊞-Hinzufügen + Vollbild, Kreisprofil-Karte, Verknüpfungen zu DU + Niederschlag. Zustand als JSON in `#gl_rows` + Seed-Merker. |
| `sb_kreisprofil` | Excel-1:1, Rohrreihen, `kp_abzug` (Inliner, beidseitig) speist die GANZE Kette, Höhen- **und** Flächen-Füllgrad getrennt ausgewiesen (0.7 h/D ≈ 0.748 A/Av; Faktor 0.84 bleibt). |
| `sb_ausstosszeiten` | SIA 385/2, mehrere Situationen, Hydraulik je Abschnitt, Anlagetyp-Schemata (rot warmgehalten / orange Ausstoss). |
| `sb_druckdispositiv` | Live-Schema Versorgung→WZ→Installation, Geschosse im 2.8-m-Raster, Bedarfs-Hinweise (Druckerhöhung/Druckminderer), Übernahmen aus LU/Katalog/Enthärtung, Inline-Teilstrecken-Rechner. |
| `sb_druckerhoehung` | VFD + Windkessel, Anlagenschema, Inline-Zwischenergebnisse (`data-demirror`), Kennlinien-Wertetabelle. |
| `sb_saugpumpe` | max. Saughöhe, pv-Automatik (Tafel), Saugleitungs-Rechner (ohne LU), Dampfdruck-Kurve, NPSH aus Katalog, Höhen-Budget-Schema. |
| `sb_druckanstieg` | Druckanstieg bei Erwärmung, Rohrsystem aus `gema_rohrsysteme.js`, Kategorie `sicherheitsventil`. |
| `sb_mischkreuz` | Mischungskreuz, l/s Standard, kein stiller Deckel bei ungültiger Spanne. |
| `sb_niederschlag` | SN 592000 + MeteoSchweiz-Punktdaten (PostGIS `nb_naechste_punkte`), Stränge mit SS-Kopplung, Leaflet-Karte + Druck-Canvas, Auto-Station aus Projektadresse. |
| `sb_regenwasserrechner` | AWEL 2022, Ψa-Nachweis, Retention Versickerung/Einleitung, SVG + Bemessungsdiagramme. |
| `sb_regenwasser_luzern` | Stadt Luzern, Kolmationsgrad, `rlRounddown` (NIE kaufmännisch), C_äquiv, integrierte Beispiele. |
| `sb_apparateliste` | Raum-Wizard inline (kein Overlay), Status-Chips vorhanden/bauseits/nicht, Apparate-Details (Mass/Armatur/IV/Accessoire), `AP_IV` geteilt. Reihenfolge des `FIXTURES`-Arrays nie ändern (index-basiert). |
| `sb_vonroll` | Gussrohr-Verschränkungen, «N = 1,5°» ist die NEIGUNG, Druck-Eigenheiten 1:1 übernommen. |
| `sb_fluessiggas` / `sb_druckverlust_erdgas` / `sb_druckverlust_medizinalgas` | Gas-Gruppe; λ nach VBA-Branch-Reihenfolge, Δp-Kumulation mit «neuer Strang»-Toggle, Persist-Guard beim Init. |
| `sa_enthaertung` | Multistrang (Excel-treu), Gesamt-Gleichzeitigkeit immer aktiv, Härte-Einheit umschaltbar (`getHaerte`/`ehFmt`), Strang-Karten unter ihren Zeilen, Salzvorrat, Anlagenschema mit Verschneidung. |
| `sa_osmose` | 24-h-Tankoptimierung (Excel-treu), Tanksimulation, Doppelanlage in Serie (`φ_ges = φ₁·φ₂`), Konzentrat-Rückführung, Sektion nie ausblenden (Leerzustand erklären). |
| `sa_frischwasserstation` | Nutzwarmwasser + Gauss-Duschprofil (exaktes Poisson-Quantil), Kaskade + Pufferspeicher, 🔥-Kennzeichnung heizungsseitiger Werte, EIN Anlagenschema. |
| `sa_abwasserhebeanlage` | EN 12056-4, Schachtmasse m/cm (SI gespeichert), Schacht-Schema mit Schaltbirnen, Volumen-Automatik (Richtwerte, keine Normwerte erfunden), Dimensions-Untergrenze sperrt kleinere Optionen. |
| `sa_schlammsammler` | Einzelauslegung + geteilte Skizze `gema_schlammsammler_skizze.js` (auch in sb_niederschlag). |
| weitere `sa_` | Fettabscheider, Ölabscheider, Solaranlage (per-Objekt `_GemaDB`, Init-Key-Regel beachten). |

### Heizung / Lüftung / Elektro / Brandschutz

| Modul | Kern |
|---|---|
| `hz_ausdehnungsgefaess` | SWKI HE301-01, VBA-UDFs repliziert, DGH-Sicherheitsventil, Schema «ein Gefäss, drei Zustände». |
| `hz_heizungsleitungen` | 4 Tabs, R nach Excel-Vereinfachung (λ = Re·10⁻⁵), Ventil-KV-Tabellen, Strang-Schema. |
| `hz_waermegruppen` | SIA 384, SUMIFS-Matching exakt auf System+Gruppe+Gebäudeteil, Sperrzeit-Zuschlag. |
| `hz_heizlast` | Heizlast aus Jahresverbrauch (Gabathuler), 36 SMA-Stationen, 3 Vergleichsmethoden. |
| `hz_waermepumpe` | JAZ nach WPesti (BIN-Methode, SIA 384/3), WP-Datenbank `gema_wpesti_daten.js` (generiert), Kennfeld-Erweiterung N19/N20, Anlagenschema. |
| `lt_hx_diagramm` | Mollier h,x, Canvas ohne Library, 6 Auslegungen (Mischen/Erhitzer/Kühler/WRG/Befeuchtung/Ventilator), mehrere Anlagen pro Objekt, Klimastationen. |
| `el_*` | Eigener Baukasten: `gema_elektro.js` (Fachdaten, κ(t), Querschnitts-/Sicherungsreihen, Iz-Tabellen, Motor-/PV-Daten), `el_base.css`, Generator `scripts/el_geruest_gen.mjs`, gemeinsamer Guard `scripts/elektro_basis_test.mjs`. Module: spannungsfall, belastbarkeit, kurzschluss, potenzialausgleich, leistungsbedarf, beleuchtung, photovoltaik, poe (Gerüst). Namensraum je Modul (`sf`/`bl`/`kz`/`pa`/`lb`/`bt`/`pv`). **Kurzschluss: I_k max mit κ₂₀ + c_max, I_k min mit κ(warm) + c_min; Z_T immer über die Netz-Aussenleiterspannung.** Keine gG-Kennlinien erfunden. |
| `br_gasloeschung` | N2 + Novec (ISO 14520), Flow-Factor-Kurve, Raumübersicht; Einheit steht in der Box, nicht im Optionstext. |
| `br_brandlast` | BSR 14-15, Kabel-Brandlast je Laufmeter; cr-Kabel werden gesperrt (nicht weggerechnet), fehlende CPR-Klasse = «mit Vorbehalt». |
| `br_vkf_formulare` / `br_vkf_formular` | VKF-Sprinkler-Formulare aus Definitionen, Vorbefüllung aus Objekt + «Allgemeine Daten», Katalog-Selects erhalten bestehende Auswahl. |

### Projektmanagement (`pm_`)

| Modul | Kern / Fallen |
|---|---|
| `pm_objekte` | Objekte/Beteiligte, Parent-Child, Team-Zuweisung, Karten-/Listenansicht mit konfigurierbaren Spalten, Offerten-Tab, Wartungs-Panel «🧹 Aufräumen». **Org-Sichtbarkeit über `GemaObjekte.effektiveOrgId`** (orgId → Org des Erstellers → herrenlos = nur Ersteller/Team/Admin). Löschen scannt abhängige Daten und löscht per-Objekt-Stände mit (verknüpfte Records anderer Module bleiben, werden aber benannt). |
| `pm_ausschreibungsunterlagen` | Kompletter Workflow (BKP-Checkliste → Verteilen → Offerten → Vergabe → Abgebot). 7 per-Record-Collections, `S` = gescopte Sicht, `_scopePools`/`_mergePoolsFromS` mit `_vis`-Guard. Identitäts-Bindung über `_findMyBeteiligter` (nie auf fremde Beteiligte zurückfallen). `MODUL_MAP` (lieferungTyp → Modul/Kategorie/autosaveKey), Kapitel-Rabatte `_upArt/_upBetrag/bkpGroupTotal`, Versionierung ab erstem Versand, Dokumentensatz-Druck, KI-Offert-Gegencheck. Neue BKP-Nummer immer gegen `OA_BKP_MAP` prüfen. |
| `pm_erp` | Offerte→Auftrag→Rechnung, Positions-Editor (Rich-Text, Kalkulation, BKP-Titel, DataSelect, eigene Kataloge, Vorlagen), Swiss QR (Mod10, importierte ESR-Referenz gewinnt), Kreditoren mit Freigabe durch den Sachbearbeiter, Nachkalkulation, **Migration** aus dem Altsystem (`gema_erp_import.js`, 5 Abschnitte, idempotent). Positionsspalten konfigurierbar (`ERP_POSCOLS`, `erpPosColsPdf` filtert Editor-Chrome). WYSIWYG-Umbrüche: Bezeichnungsspalte exakt 94 mm + `box-sizing:border-box`. Auto-Save mit Status-Indikator; `_acked`-Signatur-Diff. |
| `pm_einsatzplan` («Termine») | Stunden-Plantafel (Zeit horizontal), Drag&Drop + Tap, Arbeitsbereiche (Farbe, Foto-/Abschlusspflicht), Besonderheiten + Schlüssel/Zutritt (Code nie in Notify), Gruppen-Filter, Folgetermin-Pool, Ist-Rückmeldung aus der Stundenerfassung (Zahlen nur für Planer). |
| `pm_stunden` | GAV-Zeiterfassung (Zuschläge, Töpfe A/B, Vorholzeit, Absenzen mit Regeln, Ferienanträge, Betriebsferien, Pensum-Skalierung). **Freigabe pro TAG** mit drei Gates: Material-Frage, Foto-Pflicht, Abschluss-Rückmeldung. Geplante Termine werden ohne Klick mit Planzeit übernommen; «nicht stattgefunden» ist von der Zeiterfassung unabhängig. |
| `pm_regierapport` | Mobile-first, Status-Kette bis «ausgewiesen», Unterschrift-Pad, Preise nur für `_rrCanPrice`, PDF einzeln + Zusammenstellung. |
| `pm_bestellungen` | Nach Zuschlag bestellt NUR der Gewinner. `GemaBest`-Statusmaschine, Bestellschein-Print, Lieferanten-Tab 🛒. |
| `pm_abnahme` | SIA 118, mehrere Protokolle pro Objekt (`abproto:` mit `scopeKey`), Checkliste Installationswände, Teilnehmer/Freigaben cross-org, Monteur-Mängellisten (auch extern per E-Mail; Abarbeiter sieht NUR Mängel + Projektangaben). Scope-Regel: `_abScopeKey()` bei jedem Wechsel neu, Protokoll trägt `_scope`. PDF im Brand-Stil, Unterschriften auf Seite 1. |
| `pm_pruefliste` | Begehungen mit Standardliste (global + org + objekt), Vorschläge/Freigabe, Bauteil-Felder einzeln wählbar, Zustand NIE automatisch aus der Antwort, «nicht vorhanden/nicht beurteilbar» = Zustand entfällt, Foto-Queue, gebrandeter Bericht (Bilder direkt unter ihrem Punkt). |
| `pm_planablage` («Plandialog») | PDF-Viewer mit Markierungen (normiert 0..1), Gewerk-Layer (Render-Filter, nie Load-Filter), Pendenzen mit Plan-Pin, Freigaben cross-org, Änderungslog, Binär-Upload direkt nach Storage. Pinch/Strg+Rad-Zoom, Modal-z-index über dem Vollbild. |
| `pm_plaene` | Pläne einlesen: KI liefert nur Semantik + Seeds, Geometrie deterministisch im Browser (Flood-Fill→Kontur→DP→Ortho→Shoelace). Kalibrierung Pflicht, Vektor-Snapping, Fenster/Türen, DXF-Export (R12), Anonymisierung vor KI. |
| `pm_terminplan` | Wochenraster als Standard + frappe-gantt, Balken nur auf Arbeitstagen, Drag verschiebt ohne Dauer-Änderung, gebrandetes PDF. |
| `pm_revisionsunterlagen` | Übergabedossier, Auto-Sammlung aus 9 Quellen (ADD-ONLY-Merge), Unterlagen-Anfragen an Lieferanten, Komplett-PDF (pdf-lib merge), QR-Freigabe via `rev-share.js`. |
| `pm_behoerden_formulare` | Pool-Definition + Objekt-Instanz, KI-Feldanalyse, Split-View PDF/Zuordnung, AcroForm-Befüllung (pdf-lib), Watcher + Cron. |
| `pm_goodel` | Terminabstimmung, org-gescopt, externer Freigabe-Link (`goodel-share.js`), Lösch-Buttons brauchen `gema-read-ok`. |
| `pm_wirtschaftlichkeit` | Varianten-Kostenvergleich (Annuität/Mittelwert), Rückzahlfrist mit korrigiertem Zins (Excel-Bug dokumentiert), Amortisations-Diagramm. |
| `pm_machbarkeitsstudie` / `pm_zustandsanalyse` | Vollbild-Studien nach S+P-Vorlage: Kapitel mit Standardtexten, eigene Feldtypen (jeder braucht UI **und** Bericht-Zweig in `_bFeld`), Material mit Lebensdauer-Ampel, Foto-Queue, Print + Word. |
| `pm_lebensdauer` | Katalog (`gema_lebensdauer_api.js`, ~253 Einträge, MV/HEV) + Ampel-Rechner; Org-Overrides via `basisId`. |
| `pm_wareneingang` → siehe `if_wareneingang` | |
| weitere | `pm_ausschreibung` (Hub), `pm_crbx` (SIA-451-Offertvergleich, org-gescopt), `pm_schnellausschreibung`, `pm_besprechung`, `pm_kostenkontrolle`, `pm_baustelle`. |

### Infrastruktur / Immobilien / Hygiene / Service

| Modul | Kern |
|---|---|
| `if_werkzeug` | Multi-Tenant-Pool (orgId-Filter, fremde Orgs beim Save erhalten). Koffer (`kofferInhalt`, Kontrolle/Rückgabe, Bündelung in der Liste), QR/NFC (write-on-detect!), Etiketten 49×23 mm (1-Bit-Monochrom fürs Thermodruck), Sammelerfassung/-bearbeitung/-ausleihe, Prüfnachweis Elektro (`gema_pruefwerte.js` geteilt mit dem Lieferanten-Dashboard), Audit-PDF, CSV-Vollexport, Direkteinbuchung durch Lieferanten, Prüfmodus «liegt das Richtige am richtigen Ort». |
| `if_fahrzeug` | Analog; Garagist cross-org (Feld-Whitelist), Garage ein/aus, Reparatur-Doku, Beleg-Import mit Claude (Flotten-Kontext nur kennzeichen/modell/nr), Preis-Sichtbarkeit als eine Wahrheit. |
| `if_trocknung` | Trocknungsgeräte + Einsätze, Zähler-Typ (kein/stunden/kwh), aktueller Zählerstand, Etiketten, `GemaTrocknung`-API. **Abgleich mit sd_schadensbericht in beide Richtungen** (`_sdSyncTgEinsatz`, Empty-Read-Guard, nie fremdes Gerät stehlen). |
| `if_wareneingang` | Bestellte Apparate importieren (HTML/PDF/KI), Wareneingang kontrollieren, Regal-Etiketten (Adresse dominant, kein Barcode). Projektmodus konfigurierbar, Lager-Positionen ohne Etikette, Offerten-Split mit Anpassungs-PDF. |
| `if_arbeitskleider` | Budget mit Periode + Kumulation, Katalog, freie Einträge mit Beleg, Storno statt Löschen, Mitarbeiter-Sicht abschaltbar. |
| `iv_immobilien` | Liegenschaften/Wohnungen/Mietverhältnisse, Handwerker-Aufträge (GEMA-Betrieb oder extern), **Leerwohnung startet Spülregime** (schreibt direkt in die Spülmanager-Pools), Mietzins-Kontrolle (deterministische `z_<mvId>_<YYYY-MM>`), NK-Abrechnung tagesgenau. |
| `hy_legionellen` («Hygienemanagement») | Standort→Gebäude→Raum→Messstelle→Probe, Vererbung mit Herkunftsanzeige, Probenworkflow, Sanierung mit Freigabe + Nachprobe, Scheduler beim Seitenstart. |
| `hy_spuelmanager` | Spülobjekte/-stellen/-vorgänge, QR-Timer mit Countdown, Fälligkeit, Kopplung zu Legionellen + Immobilien. |
| `hy_w12` | SVGW W12 Selbstkontrolle, 17 GVP-Module. |
| `sv_service` | Anlagenregister + Wartungsverträge + Serviceaufträge, Import aus Offertanfragen, Cross-Modul-Writes (Einsatz, ERP-Rechnung), QR-Wartungsdoku, Schlüssel/Bereich an den Termin. |
| `sd_schadensbericht` | Phasen Erfasst→Analyse→Trocknung→Abschluss, **Bereichs-Struktur** (Fotos/Messpunkte/Geräte je Bereich, `raum` additiv), Geräte-Tage TAG-INKLUSIV (identisch in `gema_schaden_pdf.js`), Messwerte mit Foto-Beleg, Bereich-Trocknung abschliessbar, Print + jsPDF + Word. |
| `sp_dachbericht` | Kapitel/Unterkapitel mit Org-Templates, Rich-Text-Felder (`gema_richtext.js`), Claude-Texthilfe, Bilder-Grid 1/2/4/6 mit Seitenumbruch. |

### System & Ausbildung

| Modul | Kern |
|---|---|
| `sys_workspace` | Eimer (Bauprojekt/Übung/Privat/Team/Lerngruppe) mit Modulen, Notizen, Beteiligten, Aktivität. Tabs pro **Benutzer** (`ws_tabs_<userId>`), `bucketSichtbar(id)` statt `buckets.find`, `_canSeeBucket` an JEDER Render-Stelle (Pool ist cross-org). Auto-Eimer (Klasse/Übung/Rolle) sind fail-closed und tragen `autoTyp`; Org-Wahl über die Kürzel-Pills, private Eimer je Org ausblendbar. SIA-Phasen-Wechsel friert die alte Phase als Ordner ein und kopiert Daten nur in leere Ziel-Keys. |
| `sys_admin` | Benutzer/Orgs/Rollen, Rollen-Filter nach Firmen-Kategorie (⚠-Marker für Altdaten), Lieferanten-Zuordnung (**nur GEMA-Admin**), Logo-Upload (SVG + JPEG-Raster). Saves warten auf die Server-Antwort und melden den echten Grund. |
| `sys_lieferant_dashboard` | Normales Modul im Workspace (Embed-Modus `?embed=1`), Tabs folgen den Kategorien, Produktkatalog + Excel-Import, Offert-Antwort mit mehreren PDFs/Varianten, Bestellungen, Werkzeuge, Revisionsanfragen, Armaturen, Pumpenkennlinien-Import. `setupTabs()` VOR `renderAll()`, jeder Renderer in try/catch. Berechnungen des eigenen Sortiments via `LIEF_KAT_MODUL` (additiv, fail-closed, Empty-Read-Guard). |
| `sys_produktkatalog` / `sys_lieferanten` | GEMA-Admin-Sicht auf Produkte/Lieferanten; Kategorie-IDs sind geteilt (`normKatId` für Altdaten). |
| `sys_preise` / `sys_abos` | Abo- & Preissystem (`gema_abo_api.js`): Pläne, Zusatz-Gewerke/Nutzer, Tokens, Modul-Matrix, Hersteller-Gebühren, Stripe vorbereitet (inaktiv). |
| `sys_card*` / `sys_kontakte` | GEMA Card: Slug gehört der Person, vCard IMMER zur Laufzeit gebaut, öffentliche Endpoints mit harter Feld-Whitelist, eigene Tabellen (`gema_card_v1.sql`) ohne anon-Policies, ein QR-Modus (URL), Funnel. |
| `sys_beta` | Feedback-Board + Statusboard (siehe Feedback). |
| `sys_login` / `sys_profil` / `sys_unternehmen` | Login/Registrierung (Flags!), Profil (Avatar, App-Ansicht, Prüfqualifikation, Objekt-Anzeige), Firmendaten (Logo, PDF-Farben, Objekt-Anzeige-Standard, Gäste). |
| `ab_klassen` / `ab_pruefungen` / `ab_pruefung_live` | Schule: Klassen mit Code, Lernmittel (+Markierungen pro Person), Aufgaben-Pool, Prüfungen mit **Lösungs-Split** (`spruef:` ohne Lösungen, `spruefl:` nur Dozenten), Runner mit Serverzeit + Autosave, Korrektur mit Bild-Annotation, Studenten-Gating (`_studentModAllowed`, fail-closed). |
| `ab_quiz` / `ab_sephir` / `ab_berufsschule` | Community-Fragen per-Record, Scores pro User, Org-gescopte Blobs. |

---

## 8. Häufige Fehlerquellen (Kurzliste)

1. **Verwaiste `</div>`** nach Batch-Migrationen → Content fällt aus `.g-page`.
2. **`<h1>`/`<p>` im Modul-Hero** → globale Hub-Regeln greifen.
3. **Doppelte CSS-Blöcke** aus entfernten Media-Queries → widersprüchliche Werte.
4. **Verwendete Klassen ohne Regel** (`.tbl`, `.frm-row`) → Browser-Default; bei Darstellungs-Feedback ZUERST prüfen, ob die Klasse überhaupt existiert, und mit `getComputedStyle` messen.
5. **`display:flex` ohne `flex-wrap`** in schmalen Karten; `<select>` ohne `max-width` walzt die Zeile.
6. **`gema_responsive.css` fehlt** auf einer neuen Seite → Mobile-Menü fällt in den Textfluss. Einbau: NACH dem eigenen `<style>`.
7. **`.fg input{width:100%}`** ohne `flex:1 1 auto;min-width:0` drückt die Einheiten-Box aus der Zeile.
8. **Wirksame Schriftgrösse ≠ deklarierte**: `gema_responsive.css` erzwingt global 16px in Feldern (iOS-Zoom) — Feldbreiten dagegen auslegen.
9. **Bearbeiter-Feld**: `gema_meta_*`-Caches sind gerätelokal ohne User-Bezug; Guard in `gema_objekte_api.js` löscht bei Benutzerwechsel nur `b`.
10. **Kein `||orgs[0]` / `all[0]`-Fallback** bei Org-/Lieferanten-Auflösung (fremde Firma erscheint).
11. **Service-Worker**: Function-/API-/`/sb/`-Antworten NIE cachen; HTML/JS/CSS laufen stale-while-revalidate (Änderung erscheint beim zweiten Laden).
12. **Modal-Schichtung**: neue Overlays gegen bestehende z-index prüfen (Scan 10000, `_wzModalOverlay` 10500/nativ 10700, AC-Drop 11500, QR 12000, GemaDialog 12800). Hebt der Native-Modus eine Schicht an, müssen alle darüberliegenden mit.

---

## 9. Tests

Node-Guards laufen ohne Browser (`node scripts/<x>_test.mjs`), Playwright-Guards mit `CHROME=<chromium>`. Wichtigste übergreifende:

- `scripts/rolematrix_test.mjs` + `rolematrix_golden.json` — Rollen×Modul-Matrix (Golden nach bewusster Rechteänderung neu erzeugen: Datei löschen, Test laufen lassen; oder `scripts/auth_node_harness.mjs`).
- `nav_uniform_test` (Nav-Kanon) · `workspace_module_test` (Modul-Registrierung) · `notify_prefs_gating_test` (Notify-Gruppen) · `verknuepfung_test` (Werte-Katalog aktuell) · `elektro_basis_test` (el_-Baukasten) · `pdf_opsz_test` · `mobile_kompakt_test` · `datumsfelder_test` · `scroll_stabilitaet_test` · `sync_outbox_test` / `sync_offline_meldung_test` / `sync_tokenless_guard_test` / `loading_perf_test` · `kette_e2e_test` · `kein_default_admin_test` · `storage_delete_test` · `fotoqueue_offline_test`.
- Feedback-Runden haben eigene Guards (`scripts/feedback_<JJJJMMTT>*_test.mjs`).
- **Test-Fallen**: Session-Seeds brauchen Benutzer im `gema_users_v1`-Cache **und** ein Token (sonst Auto-Logout); native Ansicht nur mit Profil-Flag + `gema_native_view_v1`; Coachmark-Done-Flags seeden, sonst fängt der Backdrop Klicks; IIFE-Module über `window._*Hooks` bzw. das gerenderte DOM prüfen; `node --check` funktioniert nicht auf HTML (Script-Blöcke einzeln extrahieren).

---

## 10. Arbeitsweise

**Sprache**: Schweizer Hochdeutsch, kein ß, echte Umlaute in Texten. Sichtbare UI-Texte referenzieren NIE Excel-Vorlagen oder Zellbezüge (JS-Kommentare dürfen es).

**Checkliste bei Batch-Änderungen**: DM Sans · `.g-page` 1100px · Inputs `type="text" inputmode="decimal"` + `fixLeadingZero` · Einheiten-Box · Placeholder `#cbd5e1` · GemaDB-Guards · IIFE-Syntax · keine verwaisten `</div>` · Nav-Kanon + Feedback-Knopf (mit `init`) · GemaDialog statt nativ · `isTrusted`-Guard bei Umschaltern · Fokus-Regel · literale Hex in SVG · `gema_berechnungs_tabs.js` in neuen Berechnungen · Drift-Guard grün.

**CLAUDE.md pflegen**: Neue Module/Rollen/Präfixe/Cross-Modul-APIs/Helper/Konventionen gehören hier rein — **in ein bis drei Zeilen**. Feedback-Historie, Begründungen und Detailherleitungen gehören NICHT hierher (Git-Historie bzw. `CLAUDE_ARCHIV.md`). Faustregel: Wenn eine neue Session das Feature nur durch Lesen dieser Datei verstehen können soll, muss es rein; reicht der Code, dann nicht. Diese Datei wird bei JEDEM Sessionstart geladen — jede Zeile kostet Kontext.
