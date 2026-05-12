# SESSION_HANDOFF.md

Stand: 2026-05-12, Branch `claude/create-pull-request-tvQxe` (alle PRs in `main` gemerged).
Letzte Commits: `9d5ec3c` (Logo-Link-Fix), `a42929e` (Workspace-Permission).

## 1. Aktueller Task

Kein offener Task. Letzte abgeschlossene Aktion: **Workspace-Bar in `index.html` nur zeigen wenn `GemaAuth.can('read','workspace')`** (PR #62 gemerged).

User-Workflow in dieser Session war iteratives Testen → Bug-Reports → Fix-pro-PR. Jeder Fix wurde als eigener PR durchs GitHub-MCP gemerged. Branch ist im Sync mit `main`.

## 2. Geänderte / Neue Dateien

### Neue Helper-JS-Module (alle in `sw.js` CACHE_FILES drin)
| Datei | Status | Zweck |
|---|---|---|
| `gema_pwa.js` | fertig | `beforeinstallprompt`-Capture + `GemaPWA.install()` |
| `gema_avatar.js` | fertig | Profilbild: Compress (256×256 JPEG q=0.82) + `GemaAvatar.render(user,size,opts)` |
| `gema_adresse.js` | fertig | swisstopo Adress-Autocomplete, `data-gema-adresse`-Auto-Init |
| `gema_dialog.js` | fertig | Eigene Alert/Confirm/Prompt + `window.alert` global überschrieben |

### Modifizierte Dateien

| Datei | Status | Wichtigste Änderungen |
|---|---|---|
| `gema_auth.js` | fertig | **KRITISCH**: `_initDefaults` pusht KEINE Defaults mehr nach Supabase (war Bug, hat Cloud-Daten überschrieben). Backup-Snapshots `auth_bak/<key>__bak_YYYYMMDD_HH`. `restoreFromCloud()`, `listBackups()`, `restoreFromBackup()`, `_isOnlyDefaults()`. Demo-Migrationen entfernt. |
| `gema_scroll.js` | fertig | Body-Scroll-Lock-Helper (`GemaScroll.lock/unlock/reset`) + MutationObserver-Auto-Hook für `.modal-bg` (z-index-agnostisch) |
| `gema_responsive.css` | fertig | `body.gema-modal-open`, `.gema-dlg-*`, `.gema-adr-drop`, `.gema-adr-item` |
| `gema_mobile_menu.js` | fertig | Avatar inline (kein Helper-Load nötig) |
| `gema_notify.js` | fertig | Event-Key `trockner_defekt` registriert |
| `if_werkzeug.html` | fertig | Multi-Tenant Storage (`_wzReadAllRaw/_wzWriteAllRaw`), Defektmeldungs-System, Lieferanten-Prüfworkflow, **Monteur Hard-Lock** + Self-Lend + Platz-Zuweisung + Org-Setting `requireMagazinerReturn`. Edit-Button im View-Modal nur für `_wzCanEdit()`. |
| `if_fahrzeug.html` | fertig | Multi-Tenant (mit Garagist-Sonderfall `garagistUserId` cross-org) |
| `if_trocknung.html` | fertig | Defektmeldung analog Werkzeug, **Messgerät-Kategorie** mit `noKw:true`. Korrekte `_GemaDB.c[]` + `_GemaDB.save()` (war Bug mit non-existenter `setItem`/`getItem`). |
| `sd_schadensbericht.html` | fertig | PDF-Export komplett überarbeitet (Cover/TOC/Tabellen/Footer/Logo), Messung in Digits + Foto-Beleg, Kamera direkt beim "+Messung", Neues-Objekt-Inline-Modal, Trocknungsgeräte-Picker, Phasen jederzeit editierbar (kein confirm), `.modal-bg z-index:700` (über `.detail-overlay:600`). |
| `sys_admin.html` | fertig | Modal-Scroll-Fix mobile, Kategorien-Liste einspaltig, User/Org-Liste responsive, Adresse mit Auto-Suche, Avatar via `GemaAvatar.render`, Cloud-Recovery-Karte |
| `sys_unternehmen.html` | fertig | Adress-Suche auf `gema_adresse.js` umgestellt (eigene ~85 Zeilen entfernt) |
| `sys_login.html` | fertig | Registrierungs-Wizard mit Adress-Suche |
| `sys_profil.html` | fertig | „Allgemein"-Karte mit PWA-Install + Profilbild-Upload (Klick auf Avatar) |
| `sys_workspace.html` | fertig | PWA-Install unter Einstellungen → Allgemein |
| `pm_objekte.html` | fertig | Team-Bubbles mit Profilbildern, `deleteObjekt/deleteBet` via GemaDialog |
| `index.html` | fertig | PWA-Banner nutzt GemaPWA, **Workspace-Bar nur bei `can('read','workspace')`** |
| `sw.js` | fertig | Cache v8 → **v14**. Alle neuen Helper-JS in CACHE_FILES |
| `CLAUDE.md` | fertig | Multi-Tenant, Cloud-Recovery, PDF, Messwert-System, GemaDialog-Vorgabe, Werkzeug-Monteur-Regeln, Trocknung-Messgerät, Adresse-Helper, Avatar-Helper, Batch-Checklist erweitert (Punkte 16–18) |

## 3. Architektur-Entscheidungen

### Storage / Persistenz

- **`_GemaDB` API**: `_GemaDB.save(key, jsonString)` zum Schreiben, `_GemaDB.c[key]` zum Lesen. **Es gibt KEIN `setItem`/`getItem`** — wurde in `if_trocknung.html` falsch verwendet, hat saveDevice still abbrechen lassen.
- **Multi-Tenant Storage** (Werkzeug + Fahrzeug + Trocknung): einer Storage-Pool über alle Orgs, jeder Datensatz hat `orgId`, beim Save werden fremde Orgs erhalten:
  ```js
  function save() {
    var all = readRaw();
    var others = all.filter(function(x){ return x.orgId && x.orgId !== me.orgId; });
    writeRaw(others.concat(mine));
  }
  ```
- **Migration für Legacy ohne `orgId`**: beim ersten Load der ersten gefundenen `orgId` zugewiesen (oder eigene Org), `_wzWriteAllRaw(all)` schreibt zurück.

### Auth / Cloud-Recovery

- **KRITISCHER FIX**: `_initDefaults` ruft NICHT mehr `_syncToSupabase(DEFAULTS)` auf. Vorher: Cache-Clear → DEFAULTS lokal → Push zu Supabase → echte Cloud-Daten gelöscht.
- **Backup-Snapshots** in `auth_bak/<base>__bak_<YYYYMMDD_HH>` pro Stunde, Lock via `gema_auth_bak_lock_*`.
- **Auto-Reload**: `_initDefaults` setzt Flag `_autoRestoreNeeded`. Wenn Sync mehr Daten zurückgibt als nur Defaults, `location.reload()` einmal (gegen Loop: `sessionStorage.gema_auth_auto_reloaded`).

### UI-Patterns

- **`window.alert` global überschrieben** durch `GemaDialog.alert(...)` (kein Return → transparent). `window.confirm`/`prompt` **bleiben nativ** (sync-Pattern würde brechen). Neue Stellen sollen `GemaDialog.confirm({...}).then(ok=>...)` nutzen.
- **Body-Scroll-Lock**: `position:fixed; top:-scrollY; width:100%` (iOS-Safari-tauglich, `overflow:hidden` allein reicht dort nicht). Auto-Hook via MutationObserver auf `.modal-bg`.
- **Modal-Schema** in sd_schadensbericht: `.modal-bg z-index:700` über `.detail-overlay:600`. Sonst wären Sub-Modals unsichtbar.
- **Avatar in Mobile-Menu**: **inline** statt via GemaAvatar — damit JEDE Seite ohne extra Helper-Load das Bild zeigt.

### Werkzeug-Berechtigungen

- **Monteur HARD-LOCKED**: `_wzCanEdit()` returnt für `_wzIsMonteur()===true` **immer false**, unabhängig von `GemaAuth.can('write','werkzeugmanagement')`. Auch wenn Admin write aktiviert.
- **Zuweisungs-Typen** (`zugewiesenAn.typ`): `'user'` (Hauptnutzer muss Rückgabe machen) vs `'platz'` (jeder Monteur darf). Legacy ohne `typ` = `user`.
- **Rückgabe** geregelt via `_wzCanReturnTool(t)`: Admin/Magaziner immer; Selbst-Ausgeliehen ja außer `org.settings.werkzeug.requireMagazinerReturn===true`; Platz wenn selbst ausgeliehen; sonst nein.

### PDF (sd_schadensbericht)

- **jsPDF lazy CDN-Load**, kein Bundle.
- **Cover (Seite 1)**: org.logo 32×32mm + Briefkopf, Titel, Typ+Phase-Pillen, Stammdaten-Box, Versicherungs-Box.
- **TOC (Seite 2)**: nachträglich gefüllt via `sectionsTOC.push({label, pageNum: doc.internal.getCurrentPageInfo().pageNumber})` während Rendering, dann `setPage(2)` und Liste schreiben.
- **Statt Emojis**: farbige Buchstaben-Pillen (W/S/R/L/Rü/X) — jsPDF kann Emojis nicht rendern.
- **Bewusst weggelassen** (User-Wunsch): Wasserzeichen, Unterschriftenblock, kWh-Kostenrechner, Anhang-Seite, Emojis, DM Sans.

### Verworfene Ansätze

- **`window.confirm` global überschreiben**: würde `if(!confirm())`-Pattern in ~50 bestehenden Stellen brechen. Stattdessen: native bleibt, Migration der wichtigsten Lösch-Stellen manuell durchgeführt (~15 Stellen).
- **Voice-to-Text mit Claude API**: technische Analyse gemacht (Antwort in Session), aber nicht umgesetzt. Bräuchte Netlify Functions als Backend für Whisper + Claude. Datenschutz-Klärung nötig (CH-DSG).
- **`alert()`-Pflicht-Foto bei Messung**: erst war Foto Pflicht, dann optional gemacht — User wollte schnellen Workflow.

## 4. Offene Punkte (priorisiert)

1. **`role_unternehmer` Workspace-Zugriff**: aktuell sieht Unternehmer keinen Workspace-Button. Falls gewünscht: `'workspace'` in der `_somePerms`-Liste in `gema_auth.js:199` ergänzen.
2. **Restliche ~50 `confirm()`-Aufrufe migrieren** auf GemaDialog (Module: `pm_terminplan`, `pm_ausschreibung*`, `pm_abnahme`, `pm_baustelle`, `hy_w12`, `hy_inspektion`, `hy_spuelmanager`, `ab_*`, `el_angaben`). Pattern wie in PR #57.
3. **Voice-to-Text** (falls Backend gebaut wird): siehe Analyse in Session — Netlify Function `/api/voice-to-text` mit Whisper + Claude Haiku, ~5–10 CHF/Monat bei 1000 Einträgen.
4. **PDF: Foto-Belege bei Messungen** ins PDF einbetten (aktuell nur in App-Tabelle als 36×36 Thumbnail). User hatte's nicht verlangt, wäre aber konsequent.
5. **`pm_objekte.html` Adress-Logik** auf `gema_adresse.js` umstellen (aktuell noch eigene Implementierung, da Module-Logik stark verwoben).
6. **Werkzeug-Inventur-Confirm**, **NFC-Sperren-Confirm in if_fahrzeug**, **deleteSchaden auf Tabellenansicht-Buttons** — weitere `confirm()`-Stellen für Migration.

## 5. Konventionen aus dieser Session

### Datenstrukturen

```js
// Werkzeug-Zuweisung
zugewiesenAn = { typ:'user',  userId, name, seit }           // Hauptnutzer
zugewiesenAn = { typ:'platz', platz, name, seit }            // Standort

// Messung im Schadensbericht
{ id, datum, wert, einheit:'Digits', foto: dataUrl|null }

// User-Avatar
user.avatar = 'data:image/jpeg;base64,...'                    // optional, 256×256 q=0.82
```

### Storage-Keys

- `gema_werkzeug` — Tools-Pool aller Orgs
- `gema_vehicles` — Vehicles-Pool aller Orgs
- `gema_trocknung_v1` — Trocknungsgeräte-Pool
- `gema_objekte_v1` — Objekte (Schema: `{liste:[...], aktivId}`)
- `gema_schadensbericht_v1` — Schadensberichte
- `gema_orgs_v1`, `gema_users_v1` — Auth
- `gema_auth_bak/...` — Versionierte Auth-Backups (Supabase)
- `org.settings.werkzeug.requireMagazinerReturn` — bool, Org-Setting

### Helper-Pattern für neue Dialoge

```js
GemaDialog.confirm({
  title:'Löschen',
  message:'Datensatz wirklich löschen?',
  confirmLabel:'Löschen',
  danger:true       // → roter Button (Konvention für ALLE Lösch-Dialoge)
}).then(function(ok){
  if(!ok) return;
  // ...
});
```

### Adress-Felder

```html
<input data-gema-adresse
       data-target-strasse="myStrasse"
       data-target-plz="myPlz"
       data-target-ort="myOrt"
       data-target-kanton="myKanton">    <!-- optional -->
```

Auto-Init via `gema_adresse.js` (DOMContentLoaded). Auch programmatisch: `GemaAdresse.attach(input, opts)` und `GemaAdresse.setDisplayValue(input, {strasse, plz, ort})` für Edit-Mode.

### Service-Worker

- Cache-Version aktuell **`gema-v14`**.
- **Bei jeder JS-Datei-Änderung** Version hochziehen, sonst greifen die Clients auf den alten Cache.
- Neue JS-Datei → in `CACHE_FILES`-Array eintragen.

## 6. Bekannte Probleme

- **Auth-Cloud-Daten möglicherweise verloren** für User, die VOR dem Fix Cache geleert haben. Lokal werden nur DEFAULTS angezeigt, Supabase enthält ggf. auch nur DEFAULTS (wurde vom Bug überschrieben). Lösung: Neuanlage. Ab jetzt durch Backup-Snapshots geschützt — 48 h Historie.
- **PDF-Logo SVG**: `_drawLogo` skippt SVG-Logos still (jsPDF kann das nicht direkt). Nur PNG/JPEG aus `org.logo` funktionieren.
- **`role_unternehmer` Workspace**: sieht keinen Button, kann ggf. nicht zugreifen — bewusst so gelassen, aber sollte verifiziert werden.
- **`gema_pwa_dismissed`-Flag**: wenn User Banner einmal weggeklickt hat, bleibt er weg, auch nach Update. Reset via `localStorage.removeItem('gema_pwa_dismissed')`.

### Reproduktions-relevante Bugs

| Bug | Status | Reproduktion |
|---|---|---|
| `saveDevice` schweigt | gefixt | War `_GemaDB.setItem` (existiert nicht) |
| Maßnahmen-Modal unsichtbar | gefixt | `.modal-bg z-index:500` lag unter `.detail-overlay:600` |
| Massnahme/Schaden hinter Mobile Browser-Bar | gefixt | `safe-area-inset-bottom` Padding |
| Monteur mit `write` darf alles | gefixt | `_wzCanEdit()` HARD-LOCK für Monteur |
| Self-Lend für eigenes Werkzeug | gefixt | Drei Render-Pfade (Card, Modal, Scan) |

## 7. Kritische Code-Snippets

### `_GemaDB`-API korrekt nutzen

```js
// LESEN: aus dem Cache
var raw = (typeof _GemaDB !== 'undefined' && _GemaDB.c)
          ? _GemaDB.c[KEY] : null;
if(raw == null) try { raw = localStorage.getItem(KEY); } catch(e) {}
var data = raw ? JSON.parse(raw) : [];

// SCHREIBEN: save() + localStorage als Doppel
function persist(data) {
  var json = JSON.stringify(data);
  if(typeof _GemaDB !== 'undefined' && _GemaDB.save) _GemaDB.save(KEY, json);
  try { localStorage.setItem(KEY, json); } catch(e) {}
}
```

### Multi-Tenant Save-Pattern

```js
function save() {
  var u = getCurrentUser();
  var orgId = u && u.orgId || '';
  var all = readAllRaw();              // gesamter Pool
  var others = all.filter(function(x){
    return x.orgId && x.orgId !== orgId;
  });
  // Eigene Items mit orgId stempeln
  mine.forEach(function(x){ if(!x.orgId) x.orgId = orgId; });
  writeAllRaw(others.concat(mine));
}
```

### Auth-Recovery

```js
// In Browser-Console testen:
GemaAuth.restoreFromCloud({overwrite:false}).then(console.log)
GemaAuth.listBackups('orgs').then(console.log)
GemaAuth.restoreFromBackup('orgs', 'gema_orgs_v1__bak_20260512_14', {overwrite:true})
```

### Werkzeug-Berechtigung

```js
_wzCanEdit()         // FALSE für Monteur, egal was GemaAuth sagt
_wzCanLendSelf()     // Admin/Magaziner/Monteur dürfen sich selbst ausleihen
_wzCanReturnTool(t)  // Differenzierte Logik, siehe CLAUDE.md
_wzRequireMagazinerReturn()  // Org-Setting-Check
```

### PDF-Helper-Konstanten

```js
_PDF_TYP_INFO = {                       // in sd_schadensbericht.html
  wasserschaden:   { kuerzel:'W',  label:'Wasserschaden',   color:[37,99,235] },
  schimmel:        { kuerzel:'S',  label:'Schimmelschaden', color:[22,163,74] },
  // ...
};
_PDF_PHASE_INFO = {
  erfasst:    { label:'Erfasst',         color:[107,114,128] },
  analyse:    { label:'Zustandsanalyse', color:[217,119,6]   },
  // ...
};
```

### Workspace-Permission-Check

```js
// index.html, vor Bar-Einblendung:
var canWorkspace = (typeof GemaAuth !== 'undefined'
                    && typeof GemaAuth.can === 'function'
                    && GemaAuth.can('read', 'workspace'));
if(!canWorkspace) return;
document.getElementById('wsBar').style.display = 'flex';
```

---

## Git-State

```
Branch: claude/create-pull-request-tvQxe
HEAD:   a13f7b0 (synced with main via PR #62)
Letzte PRs:
  #62 fix(workspace): Workspace-Bar nur fuer User mit Berechtigung sichtbar
  #61 fix(nav): Logo-Link in Schadensbericht + Lieferanten
  #60 fix(werkzeug): Edit-Button Self-Lend Hauptnutzer
  #59 fix(werkzeug): Monteur eingeschraenkt + Platz-Zuweisung
  #58 docs(claude.md): GemaDialog als Vorgabe
  #57 feat(dialog): eigene Alert/Confirm/Prompt
  #56 fix(schadensbericht): + Neues Objekt Inline-Dialog
  #55 feat(schadensbericht-pdf): Cover, TOC, Tabellen, Footer
  #54 feat(schadensbericht): Mess-Erfassung Kamera direkt
  ...
```

Alle PRs squash-gemerged, Branch ist im Sync.
