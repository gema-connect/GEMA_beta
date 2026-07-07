# HANDOFF: Lieferanten-System & Monetarisierungs-Grundlagen (Ist-Zustand)

**Zweck:** Faktenbasis für ein Monetarisierungskonzept (Transaktionsgebühren + bezahlte Platzierungen für Lieferanten). Dieses Dokument beschreibt ausschliesslich den **Ist-Zustand** des Codes und benennt Lücken — es enthält bewusst **keine Lösungsvorschläge**.

**Stand:** 07.07.2026, Branch `main` (Commit `9003d5a`). Zeilenangaben beziehen sich auf diesen Stand und können driften; Funktions- und Feldnamen sind der stabile Anker.

**Lesehilfe:** GEMA hat **keine relationalen Fachtabellen** in Supabase. Es existiert genau **eine** Datentabelle (`gema_data`); alle «Tabellen» im fachlichen Sinn sind logische Collections aus JSON-Records, adressiert über `module_key` + `data_key`-Prefix. Wo unten von «Collection» die Rede ist, ist das gemeint.

---

## 0. Wichtigste Befunde (Kurzfassung)

1. **Es gibt bereits ein Lieferanten-Abo-Datenmodell** (`lief.abo`: typ basis/premium/enterprise, `jahrespreis` 1200/3600/0, `zahlungsart`, `letzteZahlung`, `mahnungen`) und ein Premium-Platzierungs-Modell (`lief.premium`: aktiv, sortPriority, badge) — beides rein **manuell durch den GEMA-Admin** in `sys_lieferanten.html` gepflegt, ohne Zahlungs-/Rechnungs-Records, ohne Automatik.
2. **Der einzige modulübergreifend wandernde Transaktionsbetrag ist `oa.antwort.bruttoPreis`** (Lieferanten-Antwort auf eine Offertanfrage). Er fliesst in Vormerkung → BKP-Position (`pos.offerte.bruttoPreis`) und ins ERP (`positionen[].ep` via `oaId`, Nachkalkulation `ekMaterial`).
3. **Ein Bestell-Schritt existiert nirgends** (kein Record-Typ, kein Flow). Der Ausschreibungs-Flow endet mit dem Zuschlag und einem Übertrag in die Kostenkontrolle (localStorage); der OA-Flow endet mit der beantworteten Offerte.
4. **Alle Beträge und Zeitstempel entstehen clientseitig** (Browser-Uhr, `_lm` im JSON). Es gibt keine serverseitige Autorität, keine DB-Zeitspalte, kein append-only Log.
5. **RLS-Stand (GEMA Secure v1):** `authenticated` darf ALLE Records lesen/schreiben (ausser `cred:%` und `module_key='auth'`). **Per-Org-Trennung existiert nur im Client** — auf DB-Ebene kann jeder eingeloggte User fremde OA-Preise, Abos und Einreichungen lesen und ändern. Per-Org-RLS ist als «Stufe 2» dokumentiert, nicht gebaut.
6. **Kein Zefix-/Handelsregister-Flow.** `lief.uid` ist ein unvalidiertes Freitextfeld, nur vom Admin pflegbar (0 Treffer für «zefix»/«handelsregister» im Repo).
7. **Verifizierung = Selbstbestätigung des Lieferanten** (Status `nicht_verifiziert` → `verifiziert` per Checkbox, kein Admin-Review). Jede Datenänderung setzt zurück auf `entwurf`.
8. **Premium-Platzierung ist nur teilweise verdrahtet:** Das Anlagenwahl-Widget listet alle Produkte einer Kategorie **ohne** die score-basierte `matchFn` und sortiert nur die Lieferanten-Pills (`sortWithStamm`). Der `org.abo`-Pfad in `isLieferantPremium` wird nirgends beschrieben (dormant). Favoriten/Büro-Stamm/Vormerkungen sind **nur lokal** (kein Cloud-Sync).
9. **Marketing-Preise existieren doppelt und inkonsistent:** `sys_preise.html` (statisch: Lieferant Basis CHF 149/Mt., Premium CHF 399/Mt.) vs. Datenmodell `lief.abo.jahrespreis` (1200/3600 CHF/Jahr) vs. drittes Abo-Modell in `pm_ausschreibungsunterlagen.html` (`me.abo`, Installateur-Basic CHF 95). `selectPlan()` auf der Preisseite ist ein `alert()`-Stub.
10. **Tracking-Substrat heute:** GemaNotify-Events (in-App, löschbar), Aktivitätslog (nur Infrastruktur-Module + Lieferanten-/Garagisten-Dashboard, client-schreibbar), `produkt.log` (per Record, 50 Einträge). Kein Billing, kein Metering, keine Analytics, keine Impression-Zählung.

---

## 1. Lieferanten-System

### 1.1 Physisches Datenmodell (Supabase)

| Objekt | Details |
|---|---|
| Tabelle **`gema_data`** | Einzige Datentabelle. Genutzte Spalten: `module_key` (Text), `data_key` (Text, Format `<prefix><id>`), `payload` (JSONB mit `{data: <Record>, _lm: <ISO-Client-Timestamp>}`). Upsert per `on_conflict=module_key,data_key` + `Prefer: resolution=merge-duplicates` (`gema_sync.js:229ff`). **Keine** Server-Zeitspalte im Zugriff, kein serverseitiges `order=`. |
| Storage-Bucket **`gema-fotos`** | Public-Read. Lieferanten-relevante Pfade: `offerten/<lieferantId>` (Offerten-PDFs), `offerten/<lieferantId>/werkzeug`, `produkte/<lieferantId>` (Produktbilder), `armaturen/<lieferantId>` (Diagramme). Upload via `gema_storage.js` (max. 12 MB, `data:image/*` + `data:application/pdf`). |
| Auth-Function | `netlify/functions/gema-auth.js` — siehe Abschnitt 5.2. |

localStorage dient als Sync-Cache (Pool-Keys unten); In-Memory-Spiegel als Fallback. Schreibweg: `GemaSync.persistCollection` (Diff) bzw. `saveRecord`, mit Offline-Outbox `gema_sync_outbox_v1`.

### 1.2 Logische Collections mit Lieferanten-Bezug

| Collection | module_key | Prefix | localStorage-Pool | Cloud-synct? |
|---|---|---|---|---|
| Lieferanten | `produktkatalog` | `lieferant:` | `gema_pk_lief_pool_v1` | ja |
| Produkte | `produktkatalog` | `produkt:` | `gema_pk_prod_pool_v1` | ja |
| Offertanfragen | `produktkatalog` | `oa:` | `gema_pk_oa_pool_v1` | ja |
| Armaturen-Katalog | `armaturen` | `arm:` | `gema_armaturen_pool_v1` | ja (GEMA-Default-Seed bleibt lokal) |
| Vormerkungen (OA→Ausschreibung) | — | — | `gema_offert_vormerkungen_v1` | **nein, nur lokal** |
| Persönliche Favoriten | — | — | `gema_lieferanten_favs_v1` (`{userId:[liefId]}`) | **nein, nur lokal** |
| Büro-Stammlieferanten | — | — | `gema_lieferanten_orgstamm_v1` (`{orgId:[liefId]}`) | **nein, nur lokal** |
| Auth: Users/Orgs/Rollen | `auth` | `user:` / `org:` / `role:` | `gema_users_v1` etc. | ja (Writes nur via Function) |
| Ausschreibungs-Pools | `ausschreibung` | `aus:` `ausbet:` `ausanf:` `ausvrt:` `ausein:` `ausna:` `ausmk:` | `gema_aus*_pool_v1` | ja |
| Werkzeuge (Lieferant beauftragt) | `werkzeugmanagement` | `tool:` | `gema_werkzeug` | ja |

### 1.3 Record «Lieferant» (`lieferant:`, `gema_produktkatalog_api.js` → `createLieferant`, Z. 1414–1457)

| Feld | Inhalt |
|---|---|
| `id` | `lief_<ts>_<rand>` (Client-generiert) |
| `orgId` | Verknüpfung zur GemaAuth-Org (Default `org_default`) |
| `firma`, `rechtsform`, `uid`, `branche[]`, `kontaktPerson`, `kontaktPersonen[]`, `email`, `telefon`, `website`, `adresse{strasse,plz,ort,kanton,land}`, `logo`, `beschreibung` | Stammdaten. `uid` = CHE-Nummer als **freier Text ohne Validierung** |
| `status` | `'aktiv'` \| `'inaktiv'` — Umschaltung nur in `sys_lieferanten.html` via `deactivateLieferant(id, grund)` / `activateLieferant(id)`; `deaktiviertAm/Von/Grund` werden mitgeschrieben. `'inaktiv'` blockt im Dashboard **alle** Schreibaktionen (`_liefBlockedInaktiv()`, ~25 Aufrufstellen) |
| `abo` | siehe 1.4 |
| `premium` | siehe 1.4 |
| `lieferantKategorien[]` | Selbstzuordnung aus `LIEF_KATEGORIEN` (siehe 1.8) |
| `erstelltAm/Von`, `letzterLogin`, `produkteCount`, `verifizierteCount` | Metadaten; Counts via `_refreshLieferantCounts` |

**Verknüpfung User ↔ Lieferant:** `user.lieferantId` (GemaAuth-User-Feld). Gesetzt bei Einladung (`inviteLieferant`), explizitem `linkUserToLieferant` oder Self-Healing im Dashboard. `findMyLieferant()` (Dashboard): 1. `user.lieferantId`, 2. Heuristik E-Mail → Org-ID → Firmenname → Org-Name, 3. Admin-Vorschau `?lief=<id>`. `_liefAutoProvision()` legt bei Lieferanten-Rolle ohne Datensatz automatisch ein Profil aus der eigenen Org an (Produktlieferant startet mit `['werkzeuge']`).

### 1.4 Abo-/Premium-Felder — und die drei getrennten Abo-Modelle

**`lief.abo`** (Default in `createLieferant`, editiert nur in `sys_lieferanten.html` → `saveAbo()`):

| Feld | Werte / Default |
|---|---|
| `typ` | `'basis'` \| `'premium'` \| `'enterprise'` (Default `basis`) |
| `status` | `'testphase'` (Default) \| `'aktiv'` \| `'abgelaufen'` \| `'gekuendigt'` |
| `startDatum`, `endDatum`, `testphaseEnde` | Datumsfelder (Testphase Default +30 Tage) |
| `zahlungsart` | `'rechnung'` (im UI nicht editierbar) |
| `jahrespreis` | abgeleitet aus `typ`: basis **1200**, premium **3600**, enterprise **0** |
| `letzteZahlung` | Datum, manuell |
| `mahnungen` | Zähler 0–10, manuell — **löst keine Automatik aus** |

**`lief.premium`** (editiert in `sys_lieferanten.html` → `savePremium()`): `{aktiv:bool, platzierung:'top'|'none', sortPriority:Number, badge:String (Default 'Premium-Partner'), kategorien:[]}`.

**Abgrenzung — es existieren DREI unabhängige Abo-Modelle:**

| Modell | Feldpfad | Gepflegt in | Zweck |
|---|---|---|---|
| Lieferanten-Abo | `lief.abo` / `lief.premium` | `sys_lieferanten.html` (Admin) | Lieferanten-Monetarisierung (dieses Dokument) |
| User-Abo («Login-Light») | `user.abo{typ:'light'|'testphase'|'premium', testphaseEnde}` + `user.kontotyp` | `gema_auth.js` (`upgradeAbo`, Aktivierung), Function | Planer-Zugangsstufen; `isLoginLight` gated Copy/PDF |
| Ausschreibungs-Teilnehmer-Abo | `me.abo{typ:'gratis'|'basic', aktiv, gewerke[]}` | `pm_ausschreibungsunterlagen.html` (Z. 5198–5305), Konstanten `ABOS_UN`/`ABOS_LF` (Z. 673–682, Installateur-Basic CHF 95, Lieferant gratis) | Marktplatz-/Nettoanfragen-Gating im Ausschreibungsmodul |

**Dormanter Pfad:** `isLieferantPremium(lief)` prüft `lief.premium.aktiv` **oder** `org.abo.typ==='premium'` — ein `org.abo` wird aber **nirgends geschrieben** (in `gema_auth.js` existiert nur `org.lizenzen {typ:'pool', maxUser, aktiveUser, aboStart, aboEnde, gewerke}`). `isPlanerPremium(user)` prüft `user.planerPremium===true` oder `user.abo.typ==='premium'`; `planerPremium` wird ebenfalls nirgends gesetzt.

### 1.5 Record «Produkt» (`produkt:`) + Verifizierungs-Flow

Felder (`createProdukt`, Z. 1322–1348): `id, kategorie, lieferantId, lieferantFirma, daten{<kategorie-spezifische Felder>}, dokumente[{id,name,typ,format,sprache,datum,groesse,hochgeladenVon,dataUrl}], status, quelle('lieferant'|'admin'), erstelltVon/Am, geaendertVon/Am, verifiziertVon/Am, log[]`.

**Verifizierungs-Flow (zweistufig, ohne Admin-Review):**

| Status | Bedeutung |
|---|---|
| `entwurf` | Lieferant arbeitet daran / nach Änderung zurückgesetzt |
| `nicht_verifiziert` | **Admin hat vorerfasst** (`quelle:'admin'`), Lieferant hat noch nicht bestätigt |
| `verifiziert` | Lieferant hat per Checkbox bestätigt (`verifyProd()` → `setStatus(id,'verifiziert')`, schreibt `verifiziertVon/Am`). **Sofort wirksam, kein Review-Gate** |

`updateProdukt` setzt jede Änderung eines verifizierten Produkts zurück auf `entwurf` (Re-Verifizierung nötig). Verifizieren dürfen nur Anlagenlieferanten (`_liefCanVerify`: `role_admin`/`role_lieferant`/`role_lieferant_admin`/`role_lieferant_verify`) — Produktlieferanten haben keine Verifizierungs-Unterrolle. `produkt.log[]` (per Record, max. 50, cloud-synct) protokolliert erstellt/geändert/Status/Dokumente; der Top-Level-`_data.log` ist vestigial (wird nie beschrieben, nicht synct).

**Zefix:** Keine Anbindung. Repo-weit 0 Treffer für «zefix»/«handelsregister». UID-Erfassung nur im Admin-Editor (`sys_lieferanten.html`, `edUid`); im Self-Service-Firmenprofil des Dashboards ist `uid` **nicht** enthalten.

### 1.6 Record «Offertanfrage» (`oa:`)

`createOffertanfrage(opts)` (Z. 1688–1741):

| Feld | Inhalt |
|---|---|
| `id` | `oa_<ts>_<rand>` |
| `absenderId/Name/Rolle/Firma` | Planer-Seite (`absenderRolle`: `'planer'`\|`'unternehmer'`) |
| `lieferantId`, `lieferantFirma` | Empfänger |
| `produktId`, `produktName` | gewählte Anlage (leer bei externer Planungsanfrage) |
| `kategorie` | KATEGORIEN-ID |
| `berechnungswerte` | **Projektwerte** aus der Berechnung (Payload-Keys → Label-Map `_OA_BW_LABELS` im Dashboard, 67 Keys) |
| `projekt` | `{name, ort, objektId, nummer, adresse}` — beim Erstellen aus dem GEMA-Objekt **denormalisiert** (Lieferant hat keinen Zugriff auf fremde Org-Objekte) |
| `nachricht`, `status`, `frist`, `erstelltAm` | `status`: `'offen'` → `'beantwortet'` \| `'abgelehnt'` \| `'abgelaufen'` (Ablauf clientseitig beim Lesen berechnet: `frist < today`) |
| `antwort` | `null` → bei Antwort: `{nachricht, pdfName, pdfUrl, pdfDataUrl, produktId, bruttoPreis:Number, beantwortetAm, beantwortetVon}` — **`bruttoPreis` ist DER Transaktionsbetrag des OA-Flows** |

Bei Beantwortung entsteht zusätzlich eine **Vormerkung** (`gema_offert_vormerkungen_v1`, nur lokal): `{id, objektId, lieferantId/Firma, produktId/Name, kategorie, modulKey, bkpCode (aus interner bkpMap), bruttoPreis, offertanfrageId, status:'vorgemerkt', uebernommenAm}`.

Notifikationen aus der API: `offertanfrage_neu` (an User mit passender `lieferantId`, Fallback Lieferanten-Org), `offertanfrage_beantwortet` / `offertanfrage_abgelehnt` (an Absender, Deep-Link `pm_objekte.html?tab=offerten`).

### 1.7 Armaturen-Katalog (`arm:`, `gema_armaturen_api.js`)

Rechenwerte-Katalog für Druckverlustberechnungen (getrennt vom Produktkatalog, keine Offert-Kette): `{id, typ, name, hersteller, serie, status('verifiziert'|'nicht_verifiziert'), zeta{DN:ζ}, kvs{DN:kvs}, zetaDefault, diagramm, lieferantId?}`. GEMA-Default-Seed bleibt lokal; Lieferanten-Records per `upsertArmatur`; Default-Löschung via Tombstone `{deleted:true}`. `getForLieferant` matcht `lieferantId` **oder** Herstellernamen (String). Keine Preisfelder.

### 1.8 Kategorien-Registry

- **`KATEGORIEN`** (23 Einträge): Produkt-Schemas mit `felder[]`; 19 davon mit `matchFn(produkt, berechnung) → Score 0–100`; ohne matchFn: `rohrsystem, armaturen, formstuecke, werkzeuge`. BKP-Codes liegen **nicht** am Kategorie-Objekt, sondern in der lokalen `bkpMap` von `beantworteOffertanfrage` (z.B. enthaertung 253.0, druckerhoehung 253.4, waermeerzeuger 242.0). Quirk: Registry-Property `KATEGORIEN.formstücke` (mit ü), aber `id:'formstuecke'`.
- **`LIEF_KATEGORIEN`** (23 Einträge, Gruppen anlagen/infrastruktur/material): Selbstzuordnung im Firmenprofil. Enthält 4 IDs ohne Registry-Pendant (`elektropruefung, leiterpruefung, servicepruefung, fahrzeuge`) und `rohrsysteme` ≠ Registry-`rohrsystem`.
- **`normKatId`** (Alias-Map `abwasserhebeanlage→hebeanlage`, `solaranlage→thermische_solaranlage`) für Altdaten.
- `daten.listenpreis` existiert als Katalog-Feld (Feldgruppe «Bestellung»: listenpreis/lieferzeit/garantie) — reine Metadaten, kein Bestellvorgang.

### 1.9 Rollen & Berechtigungen (gema_auth.js)

| roleId | Modul-Permissions (read/write) |
|---|---|
| `role_lieferant` (Legacy «Anlagenlieferant», Vollzugang) | `ausschreibungsunterlagen` r/w, `produktkatalog` r/w |
| `role_lieferant_admin` | wie oben |
| `role_lieferant_produkte` | `produktkatalog` r/w |
| `role_lieferant_verify` | `produktkatalog` r/w |
| `role_lieferant_offerten` | `ausschreibungsunterlagen` r/w, `produktkatalog` r/w |
| `role_lieferant_intern` | `produktkatalog` r-only |
| `role_produktlieferant_admin/_produkte/_offerten` | `produktkatalog` r/w |
| `role_produktlieferant_intern` | `produktkatalog` r-only |
| `role_leiterpruefer` | `werkzeugmanagement` r/w |
| (`role_pruefer`) | `werkzeugmanagement` + `fahrzeugmanagement` r/w |

- Kein `role_produktlieferant` ohne Suffix. Keine Lieferanten-Rolle hat `admin`-Flag oder das Modul `lieferantenverwaltung` (nur `role_admin`).
- **Feinberechtigungen im Dashboard prüfen roleIds direkt** (nicht Modul-Permissions): `_liefIsAdmin`, `_liefCanEditProdukte`, `_liefCanVerify` (nur Anlagen), `_liefCanOfferten`, `_liefIsAnlagenLief`/`_liefIsProduktLief` (Prefix-Match), `_liefBlockedInaktiv`.
- **Org-Kategorien-Kopplung:** `KATEGORIE_ROLLEN` — Org-Kategorie `lieferant` → nur `role_lieferant*` + `role_pruefer` zuweisbar; `produktlieferant` → `role_produktlieferant*` + `role_leiterpruefer` + `role_pruefer`. `getAssignableRoleIdsForOrg` (nie `role_admin`). Kategorien `lieferant` ↔ `gebaeudetechnik` schliessen sich gegenseitig aus.
- **Einladung:** `inviteLieferant(opts)` legt User mit `kontotyp:'login_light'`, `abo:{typ:'light'}`, `roleIds` Default `['role_lieferant']`, `lieferantId` und Einladungs-Token an; kein E-Mail-Duplikat-Check. `ensureOrgForFirma` legt bei Bedarf eine Org (`kategorie:'lieferant'`, `autoCreated`) an. Server-seitig erlaubt `INVITE_ROLE_PREFIXES` (Function) Nicht-Admins das Anlegen von Partner-Usern: `role_lieferant, role_produktlieferant, role_pruefer, role_leiterpruefer, role_garagist, role_unternehmer, role_architekt, role_bauherrschaft`.
- Login-Redirect: `role_lieferant*`/`role_produktlieferant*`/`role_pruefer`/`role_leiterpruefer` → `sys_lieferant_dashboard.html`.

### 1.10 Dashboard-Funktionen (sys_lieferant_dashboard.html)

Tabs dynamisch nach Typ (`setupTabs`): Übersicht (immer) · Meine Produkte (`isLief`) · Offertanfragen + Rohrsysteme & Armaturen (nur Anlagenlieferant) · 🔧 Werkzeuge (Lieferant/Prüfer) · 👥 Mitarbeiter · Firmenprofil (immer). Admin erzwingt Voll-Ansicht.

| Bereich | Funktionen (Ist) |
|---|---|
| Übersicht | KPIs (Produkte total/verifiziert/entwurf, Anfragen offen/total), Abo-Anzeige (`lief.abo.typ/status`), «★ Premium»-Badge |
| Meine Produkte | CRUD (`openProdEditor`/`saveProd`/`delProd`), dynamische Felder aus `KATEGORIEN[].felder`, Bild-Upload (`GemaStorage`, Resize 800px), Dokumente (Datenblatt/Montage/Zertifikat/Konformität, ≤5 MB), Verifizieren-Workflow (`renderPeWorkflow`/`verifyProd`). Reiner Produktlieferant sieht nur Kategorie `werkzeuge` |
| Offertanfragen | Karten mit Projekt (denormalisiert), berechnetem Bedarf (`_OA_BW_LABELS`), gewählter Anlage (Gegenprüfung, `_oaAnlageSpecsHtml`); Beantworten-Modal: Produkt-Dropdown (Auto-Preis aus `listenpreis`), **Brutto-Preis (CHF)**, Nachricht, PDF-Upload (≤10 MB → Storage, Base64-Fallback ≤2.5 MB); Ablehnen mit Grund |
| Rohrsysteme & Armaturen | Anzeige eigener `rohrsystem`/`formstuecke`-Produkte; Armaturen-CRUD (`_armOpen`/`_armSave`/`_armDelete`), ζ/kvs pro DN, Diagramm-Upload, Verifizieren (nur `_liefCanVerify`) |
| Werkzeuge | Arbeitsvorrat cross-org (Pool-Bind auf `gema_werkzeug`, Team via `_dwzMyIds`): Prüfaufträge quittieren + Prüfbericht einreichen, Defekt-Offerten (`b.lieferantAntwort{preis,…}`), Ersatz-Offerten (`a.antwort{preis,…}`), Reparatur eröffnen/abschliessen, **Direkteinbuchung beim Kunden** (`einbuchung.status:'vorgeschlagen'`), Mandate |
| Mitarbeiter | Einladung (`inviteLieferant`, Start-Rolle `*_intern`), Rollenzuweisung nur typ-passende Rollen, Deaktivieren — alles nur Org-Admin derselben Org |
| Firmenprofil | `firma, rechtsform, kontaktPerson, email, telefon, website, adresse, beschreibung, lieferantKategorien` — nur `_liefIsAdmin()`; **`uid` nicht editierbar** |

### 1.11 Admin-Verwaltung

- **`sys_lieferanten.html`** (Modul `lieferantenverwaltung`, in DEFAULT_ROLES nur bei `role_admin`; **kein In-Page-Permission-Guard** — Schutz nur über Link-Sichtbarkeit): CRM der Lieferanten-Datensätze. KPIs (Total/Aktiv/Premium/Testphase/offene Anfragen), Filter (Status/Abo/Kanton/Kategorie/SIA-Phase), CRUD inkl. `uid`, **Abo-Editor** (`saveAbo`), **Premium-Editor** (`savePremium`), Deaktivieren/Reaktivieren mit Grund, Löschen (Produkte bleiben), read-only Produkt- und Anfragen-Listen. Favoriten (alle User) / Büro-Stamm (`canEditOrgStamm`: role_admin ∨ role_planer ∨ Org-Admin).
- **`sys_admin.html`**: verwaltet nur GemaAuth (User/Orgs/Rollen) — kein `GemaProdukte`-Zugriff. Lieferanten-Bezug: Org-Kategorien setzen (mit `lieferant`↔`gebaeudetechnik`-Locking), Rollen-Checkboxen gefiltert nach Org-Kategorie (`_renderUserRoleCheckboxes`), User (de)aktivieren.

---

## 2. Touchpoints: Wo Lieferanten/Hersteller/Produkte heute sichtbar sind

### 2.1 Helper-Matrix (wer bindet was ein)

Helper: **PK** `gema_produktkatalog_api.js` · **OR** `gema_offer_request.js` · **OT** `gema_offerten_tab.js` · **AW** `gema_anlagenwahl.js` · **ARM** `gema_armaturen_api.js`+`gema_armaturen_picker.js`.

19 Berechnungsseiten mit PK+OR+OT: 16 davon mit AW-Widget, `sa_enthaertung`/`sa_osmose` mit eigener Inline-Katalog-UI, `sb_druckverlust` nur ARM. `hz_heizungsleitungen` und `sb_zirkulation` haben zusätzlich ARM.

### 2.2 Berechnungsmodule mit Produktauswahl (Datei → Kategorie)

| Datei | Kategorie | Einbindung |
|---|---|---|
| sb_druckerhoehung.html | `druckerhoehung` | AW-Widget |
| sb_zirkulation.html | `zirkulationspumpe` | AW + Armaturen-Picker (kvs) |
| sb_druckanstieg.html | `sicherheitsventil` | AW |
| sb_fluessiggas.html | `fluessiggasanlage` | AW |
| sa_frischwasserstation.html | `frischwasserstation` | AW |
| sa_fettabscheider.html | `fettabscheider` | AW |
| sa_oelabscheider.html | `oelabscheider` | AW |
| sa_schlammsammler.html | `schlammsammler` | AW |
| sa_abwasserhebeanlage.html | `hebeanlage` | AW (+ «🏭 Produktdaten»-Button für Lieferanten) |
| sa_solaranlage.html | `thermische_solaranlage` | AW |
| hz_ausdehnungsgefaess.html | `ausdehnungsgefaess` | AW |
| hz_heizungsleitungen.html | `heizungspumpe` | AW + Armaturen-Picker |
| hz_waermegruppen.html | `waermeerzeuger` | AW |
| hz_heizlast.html | `waermeerzeuger` | AW |
| lt_hx_diagramm.html | `lueftungsgeraet` | AW |
| br_gasloeschung.html | `gasloeschanlage` | AW |
| sa_enthaertung.html | `enthaertung` | eigene Katalog-UI (`uebernehmeAnlage`, Key `gema_enthaertung_anlage`), Premium-Hervorhebung, OA |
| sa_osmose.html | `osmose` | eigene Katalog-UI (Key `gema_osmose_anlage`), OA |
| sb_druckverlust.html | — | nur Armaturen-Katalog (ζ/kvs, Hersteller-Diagramme) |

### 2.3 Weitere Seiten

| Datei | Zweck | Art der Einbindung |
|---|---|---|
| `sys_lieferant_dashboard.html` | Self-Service-Portal Lieferant/Prüfer | siehe 1.10 |
| `sys_produktkatalog.html` | Zentraler Katalog (Admin + Lieferant) | Produkt-CRUD/-Anzeige je Kategorie, Status-Badges, Filter Kanton/Status/**Premium**, Vergleichskorb (`GemaVergleich`) |
| `sys_lieferanten.html` | Admin-CRM inkl. Abo/Premium | siehe 1.11 |
| `sys_preise.html` | **Statische** Marketing-Preisseite | Planer-Pläne (Starter 19/Professional 39/Enterprise 49 CHF/User/Mt., Add-ons 9) **und Lieferanten-Pakete: Basis CHF 149/Mt. (bis 50 Produkte, Verifizierungs-Badge, OA empfangen), Premium CHF 399/Mt. (bevorzugte Platzierung «immer oben», Premium-Badge, Lead-Dashboard, Analytics — beworben, nicht gebaut)**. `selectPlan()` = `alert()`-Stub, kein Checkout |
| `pm_objekte.html` | Projektverwaltung | Tab «📨 Offerten» = zentrales OA-Postfach der Org (Status, `antwort.bruttoPreis`, PDF, Rücklink via `OA_KAT_MAP` — deckt alle 19 Anlagenwahl-Kategorien ab) |
| `pm_erp.html` | Offerte/Auftrag/Rechnung | Positions-Quellen «📦 Katalog» (GemaProdukte, alle Kategorien) und «🏷 Lieferanten-Offerten» (beantwortete OAs als EK-Positionen, `oaId`) |
| `pm_regierapport.html` | Regierapporte | Material-Picker aus GemaProdukte (übernimmt `produktId`, `lieferantFirma`) |
| `sv_service.html` | Anlagenregister/Service | Import «⬇ Aus Offertanfragen» (beantwortete OAs → Anlage mit `lieferantFirma`, `quelleOaId`) |
| `pm_ausschreibungsunterlagen.html` | BKP-Ausschreibung | Lieferanten-Sicht mit Tabs «⭐ Mein Abo», «🏪 Marktplatz», «📨 Anfragen» (Netto-Anfragen `ausna:`, Marktplatz-Offerten `ausmk:`); OA-Übernahme in BKP-Positionen; Anfragen via `GemaOfferRequest` |
| `if_werkzeug.html` | Werkzeugmanagement | Lieferant-Feld + `supplierId`-Autocomplete, Katalog-Autocomplete (`werkzeuge`, `nurFreigegeben`), Direkteinbuchung, Prüfanfragen, Defekt-an-Lieferant, Ersatzanfragen, Kaufbeleg (`betrag`, `bestellNr`) |
| `if_fahrzeug.html` / `if_trocknung.html` | Fahrzeuge/Trocknung | **kein** GemaProdukte-Bezug (nur statische Basiskataloge); Fahrzeug: Garagisten-Verknüpfung |
| `sys_workspace.html` | Workspace | Modul-Status liest OA-Kette (`Offerte angefragt/erhalten` je Kategorie) |
| `index.html` / `sb_index.html` | Startseiten | **keine** Katalog-/Marktplatz-Kachel; Lieferant nur textuell in ERP-Modulbeschreibung |

### 2.4 Berechnungsmodule ohne Produkteinbindung (heute keine Anlagenwahl)

`sb_lu_tabelle, sb_warmwasser (nur OA_KAT_MAP-Linkziel warmwasser_boiler), sb_grobauslegung, sb_apparateliste, sb_ausstosszeiten, sb_druckdispositiv, sb_du_zusammenstellung, sb_laengenausdehnung, sb_niederschlag, sb_vonroll, sb_druckverlust_erdgas, sb_druckverlust_medizinalgas, br_vkf_formular(e)` — dazu sämtliche pm_/hy_/sv_/sd_/sp_-Module ausser den in 2.3 genannten. (Reine Bestandsaufnahme möglicher künftiger Flächen; keine Empfehlung.)

### 2.5 Inspirationskatalog

**Nicht in GEMA_beta integriert.** Kein HTML/JS referenziert «inspiration». Die Tabellen `inspiration_kategorien`, `inspiration_punkte`, `punkt_medien` (plus CRM-Tabellen `kunden`, `ansprechpersonen`, `kunden_interessen`, `aktivitaet_log` und RPCs `get_inspiration_*`) erscheinen ausschliesslich in `HANDOFF_Sicherheits_Umbau_GEMA.md` und gehören zum dort auditierten Supabase-Projekt «jaeggivollmer» mit anderem Setup (`inject-env.js`/`env-config.js` — existiert in diesem Repo nicht). GEMA_beta nutzt das Projekt `fjhbqjvaygvhievjgdtm` mit der einzigen Tabelle `gema_data`. Eine Anbindung des Inspirationskatalogs an GEMA existiert nicht.

---

## 3. Offert- & Ausschreibungsflow

### 3.1 Produktkatalog-OA-Flow (Berechnung → Lieferanten-Offerte) — vollständig vorhanden

Anfrage (`createOffertanfrage`, 2 Auslöse-Pfade, siehe 4.4) → Lieferant beantwortet im Dashboard (`bruttoPreis`, PDF) oder lehnt ab → Planer sieht Antwort im Modul-Tab «📨 Offerten» + `pm_objekte.html`-Postfach → optional Weiterverwendung: Vormerkung → BKP-Position, ERP-Position, sv_service-Import. **Es gibt keinen Folgeschritt «Auftrag erteilen/Bestellung» am OA-Record** — `status` endet bei `beantwortet`/`abgelehnt`/`abgelaufen`; eine Annahme durch den Planer wird nirgends erfasst.

### 3.2 pm_ausschreibungsunterlagen.html (BKP) — Workflow-Schritte

7 Collections (moduleKey `ausschreibung`): `aus:` (Kopf, BKP-Baum, Lose, `vergabe{}`, `abzuege[]`), `ausbet:` (Beteiligte inkl. Regieansätzen im Profil), `ausanf:` (Interesse), `ausvrt:` (Verteilung), **`ausein:` (Einreichungen = zentrale Summen-Collection)**, `ausna:` (Netto-Anfragen), `ausmk:` (Marktplatz-Offerten).

| # | Schritt | Existiert? | Funktion / Status | Notify-Key |
|---|---|---|---|---|
| 1 | Ausschreibung anlegen (funktional/crbx) | ✅ | `createAusschreibung` → `aus.status:'entwurf'` | — |
| 2 | Beteiligte erfassen/binden | ✅ | `ausbet:`, Identitäts-Bindung `_findMyBeteiligter` | — |
| 3 | CRBX-Abgleich (nur crbx-Typ) | ✅ | `confirmCRBX` → `'crbx_geprueft'` | `ausschreibung_crbx_bestaetigt` |
| 4 | Interesse-Anfrage → Antwort | ✅ | `sendeAnfrage`/`beantworteAnfrage` (`ausanf:` `'angefragt'→'interessiert'/'abgelehnt'`) | `ausschreibung_einladung` / `ausschreibung_interesse` |
| 5 | Verteilen | ✅ | `vtl()` → `ausvrt:`, `aus.status→'aktiv'` | `ausschreibung_einladung` |
| 6 | Unternehmer füllt Preise & reicht ein | ✅ **in GEMA** (funktional/einheitspreise/global) + CRBX per Datei-Upload (`iSubC` E1S, `iSubJ` JSON) | `iSubmitFunktional` → `ausein:{total, prices{}, abzugWerte{}, globalPreis}` | `ausschreibung_offerte_neu` |
| 7 | Offertvergleich | ✅ | `VIEWS.pvgl`/`renderCRBXVergleich`; `calcNetto`/`calcAbzugDetail` (kaskadierte Abzüge + MwSt 8.1 %) | — |
| 8 | Vergabeantrag | ✅ | `submitVergabeantrag` → `vergabe.status:'eingereicht'` | `ausschreibung_vergabeantrag` |
| 9 | Genehmigung/Ablehnung (Architekt/BH) | ✅ | `approve-/rejectVergabeantrag` → `'genehmigt'/'abgelehnt'` | `ausschreibung_vergabeantrag` |
| 10 | Zuschlag/Absage | ✅ | `doVergabeZuschlag` → `aus.status:'vergeben'`; Übertrag `_uebertrageInKostenkontrolle` → `kostenkontrolle_v3` (`ko.werkvertrag[].betrag`, **localStorage-Blob**) | `ausschreibung_vergabe` |
| 11 | **Bestellung** | ❌ existiert nicht | 0 Treffer «bestell» in der Datei; kein Record-Typ, kein Flow Richtung Lieferant | — |

**Preis-Modell:** BKP-Unterpositionen (`aus:.bkp[].unterpositionen[]`) tragen **keine** Preisfelder — Preise liegen ausschliesslich pro Bieter in `ausein:.prices{}` (Key `bkpCode_upId` bzw. `npk_posNr_werkgruppe`) und `ausein:.total`. Scoping: Unternehmer sehen nur eigene Einreichungen; Lieferanten sehen nur eigene `ausna:`/`ausmk:` + aktive Ausschreibungen — **alles Client-Scoping** (`_scopePools`).

**Lieferant im Ausschreibungsmodul:** Netto-Anfragen (`ausna:{posKeys[], status 'angefragt'→'erhalten', pdfName}`) und Marktplatz-Offerten (`ausmk:{bkpCodes[], pdfName, nachricht, status 'gesendet'→'gesehen'}`) — **beide ohne strukturierte Beträge** (nur PDF). Gating über das Datei-eigene Abo-Modell (`me.abo`, `ABOS_UN`/`ABOS_LF`). Lieferanten-Offerten an BKP-Positionen: `pos.offerte.bruttoPreis` (4 Schreibpfade: `_renderVormerkungen`, `uebernehmeOA`, `saveLiefOfferte` manuell, `liefSelectMatch` ohne Preis).

**MODUL_MAP** (17 Einträge) verknüpft Lieferungspositionen mit Rechnermodul + Produktkategorie; `readCalcData` liest den AutoSave-Stand des Rechners (keine Geldbeträge).

### 3.3 pm_crbx.html — eigenständiger SIA-451-Offertvergleich

Ein localStorage/`_GemaDB`-Blob `gema_crbx_v1` (kein per-Record-Sync): LV-Import (`parseE1S`: Positionen mit `preis`, `total`), Offerten `S.offerten[]{total, rabatt, prices{key:{preis,total,menge}}}`, `calcKonditionen → {subtotal, rabattBetrag, netto, mwst, gesamttotal}`, Werkgruppen-Vergleich. **Kein Zuschlag/Vergabe-Mechanismus.**

### 3.4 pm_schnellausschreibung.html

`sa:`-Records: `{gewerke[], unternehmer[], offerten[{unternehmerId, gewerk, preis}], vergabe{winnerId,…}, status 'entwurf'→'aktiv'→'vergeben'}`. Pauschalpreis je Gewerk, Totale je Unternehmer clientseitig summiert, `doVergabe` mit Zuschlag/Absagen (`ausschreibung_vergabe`).

### 3.5 ERP-Kette (pm_erp.html) — Beträge auf Planer-Seite

`erpdok:`-Dokumente (offerte/auftrag/rechnung) mit `positionen[]{ep, menge, rabattPct, art}`, `zahlungen[]{datum,betrag}`, `erpDocTotals → {zwischen, rabatt, netto, mwst, brutto (Rappenrundung 0.05), rundung}`. Lieferanten-Bezug: `art:'oa'`-Positionen mit `ep = oa.antwort.bruttoPreis` (nur OAs `beantwortet` mit `bruttoPreis>0`); Nachkalkulation `erpNachkalk` → `ekMaterial = Σ oa.antwort.bruttoPreis`, `vkMaterial`, `dbGeschaetzt`.

### 3.6 Beträge im Datenmodell (Ankerpunkte für Prozentsätze — reine Bestandsaufnahme)

| Betrag | Feldpfad | Record (Prefix/Store) | Entsteht in | Cloud-synct? |
|---|---|---|---|---|
| Lieferanten-Offertpreis (OA) | `oa.antwort.bruttoPreis` | `oa:` | Lieferanten-Dashboard `sendOaAnswer` → `beantworteOffertanfrage` | ja |
| Vormerkung | `vm.bruttoPreis` | `gema_offert_vormerkungen_v1` | `addVormerkung` (bei OA-Antwort) | **nein (lokal)** |
| Offerte an BKP-Position | `aus:.lose[].positionen[].offerte.bruttoPreis` | `aus:` | pm_ausschreibungsunterlagen (4 Pfade, 3.2) | ja |
| Unternehmer-Offerte (BKP) | `ausein:.total`, `.globalPreis`, `.prices{}`, `.abzugWerte{}` | `ausein:` | `iSubmitFunktional`/`iSubC`/`iSubJ` | ja |
| Vergleichs-Netto | `calcAbzugDetail().netto` (MwSt 8.1 % hart codiert) | abgeleitet | Offertvergleich | — |
| Werkvertrag nach Zuschlag | `ko.werkvertrag[].betrag` | localStorage `kostenkontrolle_v3` | `_uebertrageInKostenkontrolle` | **nein (lokal)** |
| CRBX-Positionen/-Offerten | `S.lv.positions[].preis/.total`, `S.offerten[].total/.prices{}` | Blob `gema_crbx_v1` | pm_crbx | Blob via _GemaDB |
| Schnellausschreibung | `sa:.offerten[].preis` | `sa:` | `submitDemo` | ja |
| ERP-Dokumente | `erpdok:.positionen[].ep`, `.zahlungen[].betrag`, `erpDocTotals()` | `erpdok:` | pm_erp | ja |
| ERP-EK aus OA | `positionen[].ep = oa.antwort.bruttoPreis` (`oaId`) | `erpdok:` | `erpPickItems` | ja |
| Werkzeug-Ersatz-Offerte | `tool.ersatzAnfragen[].antwort.preis` | `tool:` | Dashboard `_dwzSendOfferte` | ja |
| Werkzeug-Defekt-Offerte | `tool.berichte[].lieferantAntwort.preis` | `tool:` | Dashboard `_dwzSendOfferte` | ja |
| Kaufbeleg (passiv) | `tool.kaufbeleg.betrag` (+`bestellNr`) | `tool:` / `vehicle:` | if_werkzeug/if_fahrzeug | ja |
| Produkt-Listenpreis | `produkt.daten.listenpreis` | `produkt:` | Katalogpflege | ja |
| Lieferanten-Abo (kein Transaktionsbetrag) | `lief.abo.jahrespreis` | `lieferant:` | sys_lieferanten Admin | ja |

**Drei Betrags-«Sprachen»:** (a) Ausschreibung/CRBX: `total` + `prices{}`; (b) Produktkatalog-OA: `bruttoPreis`; (c) Werkzeug-Offerten: `preis`. Keine normalisierte Transaktions-Entität; Netto-Anfragen/Marktplatz haben gar keine strukturierten Beträge (nur PDF).

### 3.7 Vorhanden vs. nur geplant

| Baustein | Status |
|---|---|
| OA-Anfrage/Antwort/Ablehnung inkl. PDF + Benachrichtigung | vorhanden |
| BKP-Ausschreibung komplett (Anfrage→Verteilen→Preise in GEMA→Vergleich→Vergabeantrag→Zuschlag) | vorhanden (funktionale Modelle in GEMA; CRBX-Preise via Datei-Upload) |
| CRBX-Preisausfüllung direkt in GEMA («langfristig» laut CLAUDE.md) | nicht vorhanden (Upload-Roundtrip) |
| Bestellung / Auftragserteilung an Lieferant | **nicht vorhanden** (kein Record, kein Flow) |
| OA-Annahme («Zuschlag» im OA-Flow) | nicht vorhanden (nur `pos.offerte`-Übernahme bzw. ERP-Position als indirekte Spur) |
| Lieferanten-Abo/Premium-Datenfelder | vorhanden (manuell, Admin) |
| Checkout/Registrierung auf Preisseite | nicht vorhanden (`selectPlan()`-Stub) |
| Lead-Dashboard/Analytics für Premium-Lieferanten (in sys_preise beworben) | nicht vorhanden |
| Modul-Freischaltung pro Org | geplant laut CLAUDE.md, nicht gebaut |

---

## 4. Datenflüsse: Berechnung → Produktvorschlag → Offerte

### 4.1 LU-Zusammenstellung als Quelle (`gema_lu_api.js`)

Storage `lu_spitzenvolumenstrom_dropdown_v3__<objektId>[@phase]` (Quelle: `sb_lu_tabelle.html`). API: `getVerbraucher`, `getByMedium`, `getSpitzenvolumenstrom` (W3-Diagramm-1-Formel: A `0.459·x^0.353` / B `0.598·x^0.257`, x=ΣLU/10), `getSummary`, `getHausanschluss`, `hasData`. Medien: `kw/ww/nd/bw/ow/gw/frei` mit Aliasen (`enthaertet→bw`, `osmose→ow`, `regenwasser→gw`).

**Schreibende Konsumenten (Prefill mit Override-Markierung):**
- `sa_enthaertung.html`: `getByMedium('enthaertet')` + Osmose-Ergebnis; Overrides in `gema_enthaertung_lu_overrides_v1__<oid>`, UI-Tags «LU ↗»/«✎ Manuell»
- `sa_osmose.html`: `getByMedium('osmose')`, l/s→l/h; Override-Tags analog
- `sb_druckerhoehung.html`: `getVerbraucher()` (KW+WW ohne ND); Felder `vfd_LU/vfd_qdv/ves_LU/ves_qdv`

Read-only-Anzeigen: `sb_grobauslegung`, `sb_druckverlust`, `sys_workspace`, `gema_dataflow.js` (Pill).

### 4.2 Osmose → Enthärtung (`gema_osmose_api.js`)

`GemaOsmose.save()` aus `sa_osmose.recalc()` → `gema_osmose_results_v1__<oid>`: `permeat_lh/ls, konzentrat_lh/ls (= weichwasser − permeat), weichwasser_lh/ls, recovery_pct, phi_factor, ts`. `sa_enthaertung` fügt daraus den Pseudo-Verbraucher «Osmose-Anlage (Permeat + Konzentrat)» ein (Doppelzählungs-Schutz: `ow` fliesst NIE direkt in die Enthärtung).

### 4.3 Produktvorschlag/-auswahl (gema_anlagenwahl.js)

- `init({container, kategorie, getBerechnungswerte, getProjekt, formatKennwerte, onAnlageUebernommen, renderChosenRows})`.
- **Produktliste:** `GemaProdukte.getTypen(kategorie, lieferantId)` — listet **alle** Serien der Kategorie. Die score-basierte `KATEGORIEN[].matchFn`/`GemaProdukte.match()` (mit Premium-Sortierung `premium.sortPriority` → verifiziert → Score) wird **vom Widget nicht aufgerufen**; sie existiert als API.
- **Sortierung/Platzierung:** nur die Lieferanten-Pills laufen durch `sortWithStamm`: ohne Planer-Premium `[Premium] → [Verifiziert] → [Rest]`; mit Planer-Premium `[Favoriten] → [Büro-Stamm] → [Premium] → [Verifiziert] → [Rest]`. Premium-Pill mit Badge/Icon (`isLieferantPremium`).
- **Badges:** Produktkarte `✓ Verifiziert` / `⚠ Nicht verifiziert`; Warnbox bei nicht verifizierten Daten.
- **Gewählte Anlage:** `gema_aw_chosen_<kategorie>__<objektId>` (`{id, lieferantFirma, serie, modell, status, daten, uebernommenAm}`); Enthärtung/Osmose speichern eigene Keys (`gema_enthaertung_anlage`, `gema_osmose_anlage`).

### 4.4 OA-Erzeugung — zwei Pfade

1. **Katalog-Direktweg** (Anlagenwahl-Dialog): `GemaProdukte.createOffertanfrage({lieferantId, produktId, produktName, kategorie, berechnungswerte, projekt, nachricht, fristTage})`.
2. **Externer Weg** (`gema_offer_request.js`): Firma-Autocomplete gefiltert nach `lieferantKategorien` (Katalog-Lieferanten via `searchLieferanten` + GemaAuth-Orgs der Kategorie `lieferant`); nicht registrierte Lieferanten → `quickCreateLieferant` + **`GemaAuth.inviteLieferant`** (User mit Login-Link entsteht im Zuge der Anfrage); dann `createOffertanfrage` mit `produktId:''`.

### 4.5 Nachgelagerte Konsumenten der OA

`gema_offerten_tab.js` (📨-Tab im Modul, objektbezogen, read-only) → `pm_objekte.html?tab=offerten` (Org-Postfach) → Vormerkung → BKP-Position (`pos.offerte`) → ERP (`art:'oa'`-Position, Nachkalkulation) → `sv_service.html` (Anlagen-Import). `sys_workspace` leitet Modul-Status aus der OA-Kette ab («Offerte angefragt/erhalten»). Berechnungs-Index (`gema_berechnungen_index_v1`, via `gema_autosave.js`/`registerBerechnung`) hält `{modul, objektId, orgId, createdAt/By, lastModified/UserId}` — keine Beträge.

### 4.6 Vergleichs-Features

`gema_vergleich.js`: Produkt-Vergleichskorb (max. 4/Kategorie, `gema_vergleich_korb_v1`, Side-by-Side aus `KATEGORIEN[].felder`). `gema_varianten.js`: Berechnungs-Varianten (Snapshots), kein Produktbezug.

---

## 5. Technische Rahmenbedingungen

### 5.1 Storage & Sync

Siehe 1.1/1.2. Ergänzend: `gema_db.js` (Legacy `_GemaDB`, Blob-pro-Key `payload:{v:…}`) wird noch von ~46 Dateien genutzt (u.a. `pm_crbx`, LU/Osmose-APIs, Kostenkontrolle); neue Module nutzen `gema_sync.js` per-Record. Diff-Saves via JSON-Stringify-Vergleich. Outbox-Flush bei Reconnect/pagehide/60s-Intervall. Service-Worker lässt Supabase-Requests network-first durch.

### 5.2 Auth — Ist-Zustand und dokumentierte Zielbilder

- **Ist:** Eigenbau `GemaAuth` (localStorage-Session `gema_session_v1`, Rollen/Permissions clientseitig) + Netlify-Function `gema-auth.js` («GEMA Secure v1»): Actions `login, register, activate, persist_auth, refresh, whoami, diag`. Login prüft scrypt-`cred:<userId>`-Records (Legacy-djb2 wird lazy migriert) und mintet ein **Supabase-kompatibles JWT** (HS256, `GEMA_JWT_SECRET`): Claims `role:'authenticated'`, `uid`, `org`, `adm`, Laufzeit `GEMA_TOKEN_DAYS` (Default 30 Tage), gleitendes Refresh-Fenster. ENV: `SUPABASE_SERVICE_KEY`, `GEMA_JWT_SECRET`, `SUPABASE_URL`, `GEMA_TOKEN_DAYS`.
- `persist_auth` prüft Schreibrechte auf `user:/org:/role:` gegen den DB-Stand (GEMA-Admin alles; Org-Admin eigene Org ohne `role_admin`; Selbst-Update ohne Rollen/Org/Status; Partner-Invites via `INVITE_ROLE_PREFIXES`; Deletes nur Admin; max. 200 Records/Call). Client-Routing: `gema_sync.js` fängt `user:/org:/role:`-Writes ab (`_routeAuthWrite`); bei 404 der Function Fallback auf Direkt-Write (Kompatibilitätsmodus).
- **Kein Supabase Auth** (keine `auth.users`): Die «authenticated»-Rolle kommt ausschliesslich aus dem selbst gemintenen JWT. Eine Migration auf echtes Supabase Auth ist im Repo nur als Zielbild in `HANDOFF_Sicherheits_Umbau_GEMA.md` («Sicherheit ausschliesslich serverseitig durch RLS und Supabase Auth») beschrieben, nicht begonnen.

### 5.3 RLS-Status (`supabase/gema_rls_v1.sql`, `SECURITY_RLS_ANLEITUNG.md`)

| Bereich | Policy |
|---|---|
| `gema_data` SELECT | `authenticated`: alles ausser `data_key like 'cred:%'` |
| `gema_data` INSERT/UPDATE/DELETE | `authenticated`: `module_key <> 'auth'` und nicht `cred:%` |
| `anon` | keine Policies (kein Zugriff) |
| `cred:%` | keine Policy → nur Service-Key (Function) |
| Storage `gema-fotos` | INSERT `authenticated`, SELECT public (`anon`+`authenticated`) |
| **Per-Org-RLS auf Moduldaten** | **nicht vorhanden** — explizit «Stufe 2 geplant»; Org-Trennung, Bieter-Preis-Geheimhaltung etc. macht nur der Client (`_scopePools`, Org-Filter in Loadern) |

Rollback-Skript vorhanden. Ebenfalls Stufe 2 (offen): privater Storage/signierte URLs, Function-Rate-Limiting.

### 5.4 Netlify Functions

`gema-auth.js` (siehe 5.2) und `claude-rewrite.js` (Anthropic-Textproxy für sp_dachbericht; nicht abrechnungsrelevant). **Keine weitere Server-Logik** — sämtliche Fach-Writes (inkl. aller Beträge) gehen direkt vom Browser in `gema_data`.

### 5.5 Vorhandene Logs/Events (Tracking-Substrat)

- **GemaNotify** (`notif:`-Records, moduleKey `notify`): Record `{id, ts, eventKey, empfaengerUserId/RoleId/OrgId, absenderUserId, modul, typ, titel, text, link, objektId, gelesen, gelesenAt}`. Matching: userId ODER Rolle ODER Org; sind Rolle+Org beide gesetzt, müssen beide passen. Lieferanten-relevante Event-Keys: `offertanfrage_neu/beantwortet/abgelehnt`, `ausschreibung_einladung/interesse/offerte_neu/vergabeantrag/vergabe/crbx_bestaetigt`, `werkzeug_pruefung_anfrage`, `werkzeug_defekt_lieferant`, `werkzeug_ersatz_anfrage`, `werkzeug_offerte_lieferant`, `werkzeug_reparatur`, `werkzeug_einbuchung`. Zustellung best-effort in-App; User kann löschen; Prefs können Events **vor Erstellung** unterdrücken (`isEventEnabled` bei `empfaengerUserId`). Nur In-App — kein E-Mail-/Push-Versand.
- **Aktivitätslog** (`log:`-Records, `gema_aktivitaetslog.js`): `{id, ts, orgId, modul('werkzeug'|'fahrzeug'|'trocknung'), modulRecordId/Name, aktion (21 Typen inkl. `offerte`, `pruefanfrage`, `ersatzanfrage`, `reparatur`), beschreibung, userId, userName, details}`. Schreibende Seiten: if_werkzeug/if_fahrzeug/if_trocknung + `sys_lieferant_dashboard.html` + `sys_garagist_dashboard.html`. **Deckt den Produktkatalog-/OA-/Ausschreibungs-Flow NICHT ab.** Lokaler Cache auf 2000 Einträge gekappt (Cloud vollständig); clientseitig schreib- und (per DB-Zugriff) löschbar.
- **`produkt.log[]`** per Produkt (max. 50, cloud-synct): erstellt/geändert/Status/Dokumente.
- **Kein** Billing-, Metering-, Analytics-, Telemetrie- oder Audit-Trail-System (repo-weite Suche `invoice|payment|zahlung|stripe|tracking|analytics`: keine Treffer im Code; `gema_recent.js` ist reine lokale Zuletzt-Liste).

### 5.6 Zeitstempel & Uhren

Alle fachlichen Timestamps (`erstelltAm`, `beantwortetAm`, `frist`, `_lm`, Aktivitätslog-`ts`, Notify-`ts`) sind **Browser-Uhrzeit**; die Function nutzt Node-Uhr, schreibt aber ebenfalls nur ins JSON. `gema_data` liefert keine serverseitige Zeitspalte im Zugriff. Fristablauf (`abgelaufen`) wird beim Lesen client-berechnet.

### 5.7 Explizit nicht vorhanden

Zahlungsanbindung (Stripe o.ä.), Rechnungs-Records für Lieferanten-Abos, Nutzungszählung/Quota (ausser `bis 50 Produkte` als Marketing-Text ohne Enforcement), Impression-/Klick-Zählung für Platzierungen, E-Mail-Versand, Webhooks, serverseitige Validierung von Fach-Writes, Idempotenz-/Duplikatschutz auf Record-Ebene (IDs client-generiert `Date.now()+rand`).

---

## 6. Offene Baustellen & Risiken (bezogen auf Tracking/Abrechnung von Anfragen, Offerten, Bestellungen)

### 6.1 Fehlende serverseitige Autorität

- Jeder Betrag (`bruttoPreis`, `ausein:.total`, ERP-`ep`, …) wird vom Browser direkt in `gema_data` geschrieben; RLS erlaubt jedem `authenticated`-User Schreiben/Lesen **aller** Nicht-Auth-Records — auch fremder Orgs. Abrechnungsrelevante Werte sind damit von jedem eingeloggten Konto les- und nachträglich veränderbar (inkl. `lief.abo`, `lief.premium`, OA-Antworten, Einreichungssummen).
- Bieter-Preis-Geheimhaltung (Ausschreibung) und Org-Trennung existieren nur im Client-Scoping.
- Client-generierte IDs und Client-Uhren: keine verlässliche Reihenfolge, keine manipulationssichere Periodisierung (Monatsabrechnung), Duplikate technisch möglich.
- Records sind mutierbar und hard-deletebar (`deleteRecord`); es gibt keinen append-only Verlauf einer OA (der `antwort`-Stand überschreibt sich, `ablehnenOffertanfrage` überschreibt `antwort` komplett).

### 6.2 Lückenhaftes Ereignis-Tracking der Geschäftsvorfälle

- Für OA-Lebenszyklen existieren nur GemaNotify-Records als Spur — löschbar, durch User-Prefs unterdrückbar (Notifikation wird dann **gar nicht erst erstellt**), ohne Zustellgarantie.
- Das Aktivitätslog deckt Produktkatalog/OA/Ausschreibung/ERP nicht ab; `_data.log` ist tot.
- Es gibt keine Zähl-/Abrechnungsereignisse für Platzierungen (Impressionen, Pill-Reihenfolge, Katalog-Aufrufe) — `sys_preise.html` bewirbt ein «Lead-Dashboard» und «Analytics», die nirgends implementiert sind.

### 6.3 Transaktionsende fehlt im Datenmodell

- **Kein Bestell-/Zuschlags-Schritt im OA-Flow:** ob eine beantwortete Offerte zum Geschäft wurde, ist nirgends als Status erfasst. Indirekte, uneinheitliche Spuren: Vormerkung `uebernommenAm` (nur lokal), `pos.offerte.bruttoPreis` in der Ausschreibung, `art:'oa'`-Position im ERP. Eine Transaktionsgebühr hätte heute keinen eindeutigen Trigger-Datenpunkt.
- BKP-Zuschlag endet in `kostenkontrolle_v3` (localStorage-Blob, nicht per-Record synct); Schnellausschreibung endet bei `vergabe.winnerId` ohne Betragsbindung an den Zuschlag (Preise liegen in `offerten[]`).
- Netto-Anfragen/Marktplatz (`ausna:`/`ausmk:`): keine strukturierten Beträge (nur PDF) — nicht bepreisbar/auswertbar.

### 6.4 Monetarisierungs-Vorarbeiten sind fragmentiert/inkonsistent

- **Drei Abo-Modelle** (lief.abo / user.abo / me.abo in der Ausschreibung) ohne gemeinsame Basis; `org.abo`- und `user.planerPremium`-Pfade dormant (werden gelesen, nie geschrieben).
- **Preis-Inkonsistenzen:** `sys_preise.html` Lieferant 149/399 CHF/Mt. vs. `lief.abo.jahrespreis` 1200/3600 CHF/Jahr vs. `ABOS_UN` Basic 95 im Ausschreibungsmodul. `selectPlan()` ist ein Stub; kein Registrierungs-/Checkout-Pfad.
- **Premium-Wirkung inkonsistent:** `match()` (mit Premium-Score) wird vom Anlagenwahl-Widget nicht genutzt; Premium wirkt dort nur auf die Lieferanten-Pill-Sortierung und Badges; `premium.kategorien`/`platzierung` werden nirgends ausgewertet. «bis 50 Produkte» (Basis-Paket) wird nicht enforced.
- Favoriten/Büro-Stamm/Vormerkungen nur lokal → Platzierungs-/Attributions-Logik ist geräteabhängig.
- Abo-Verwaltung ist rein manuell (`mahnungen` ohne Automatik, `zahlungsart` fix `rechnung`, keine Rechnungs-Records, keine Fristen-Überwachung).

### 6.5 Zustellung & Identität

- Lieferanten ohne GEMA-Login erhalten OAs nur nach `inviteLieferant` (in-App); es gibt keinen E-Mail-Versand — eine Anfrage an einen nie einloggenden Lieferanten bleibt unbeantwortet und unbemerkt.
- User↔Lieferant-Matching hat Heuristik-Fallbacks (E-Mail/Org/Firmenname) — für Abrechnung wäre die Attribution «welcher Account handelt für welchen Lieferanten» nicht in allen Altdaten-Fällen eindeutig (`user.lieferantId` erst durch Self-Healing gesetzt).
- `lief.uid` unvalidiert, kein Zefix-Abgleich → Firmenidentität für Verträge/Rechnungen nicht verifiziert.
- `sys_lieferanten.html` (inkl. Abo-/Premium-Editor) hat keinen In-Page-Permission-Guard (Schutz nur über Link-Sichtbarkeit + generelles RLS-`authenticated`).

### 6.6 Sonstige technische Punkte

- MwSt 8.1 % im Offertvergleich hart codiert; ERP nutzt konfigurierbares `mwstPct` — zwei Quellen.
- Offerten-PDFs liegen in einem **public-read** Bucket (unlisted Pfade) — vertrauliche Preise sind per URL abrufbar.
- `pm_crbx` (Blob, Last-Write-Wins) und Kostenkontrolle (`kostenkontrolle_v3`) sind nicht auf per-Record-Sync migriert — Summen dort sind nicht multi-device-konsistent.
- Function ohne Rate-Limiting; anon-Key im Client (by design, aber relevant für Missbrauchsszenarien der Stufe 2).

---

## Anhang: Datei-Wegweiser

| Thema | Datei(en) |
|---|---|
| Lieferanten/Produkte/OA-API | `gema_produktkatalog_api.js` |
| Anlagenwahl-Widget / externer OA-Dialog / Offerten-Tab | `gema_anlagenwahl.js`, `gema_offer_request.js`, `gema_offerten_tab.js` |
| Lieferanten-Dashboard / Admin-CRM / Katalog / Preise | `sys_lieferant_dashboard.html`, `sys_lieferanten.html`, `sys_produktkatalog.html`, `sys_preise.html` |
| Rollen/Orgs/Einladung | `gema_auth.js`, `sys_admin.html`, `netlify/functions/gema-auth.js` |
| Ausschreibung/CRBX/Schnellausschreibung | `pm_ausschreibungsunterlagen.html`, `pm_crbx.html`, `pm_schnellausschreibung.html`, `KONZEPT_BKP_Ausschreibung.md` |
| ERP/Regie/Service | `pm_erp.html`, `pm_regierapport.html`, `sv_service.html` |
| LU/Osmose-Datenfluss | `gema_lu_api.js`, `gema_osmose_api.js`, `sb_lu_tabelle.html` |
| Sync/RLS/Storage | `gema_sync.js`, `gema_db.js`, `gema_storage.js`, `supabase/gema_rls_v1.sql`, `SECURITY_RLS_ANLEITUNG.md` |
| Logs/Events | `gema_notify.js`, `gema_aktivitaetslog.js` |
| Sicherheits-Zielbild (separates Projekt «jaeggivollmer», inkl. `inspiration_*`) | `HANDOFF_Sicherheits_Umbau_GEMA.md` |
