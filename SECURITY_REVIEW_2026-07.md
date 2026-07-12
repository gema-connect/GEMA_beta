# Sicherheits-Review GEMA — Befunde & Umsetzungsplan

**Datum:** 2026-07-12
**Zweck:** Vollständige Befundliste eines Sicherheits-Reviews (Netlify-Functions, Supabase-RLS, Client-Auth, XSS) mit konkreten, umsetzbaren Fixes. Diese Datei ist als Arbeitsvorlage für eine spätere Umsetzung (z.B. mit Opus) gedacht — jeder Befund enthält Datei/Zeile, Angriffspfad, den nötigen Fix (mit Code) und eine Verifikation.

**Methodik:** Alle Netlify-Functions und die RLS-Policy wurden vollständig gelesen. Die XSS-Fläche wurde über alle Module gesweept; jede `esc()`/`E()`/`_esc()`-Funktion wurde direkt gelesen und die Sink-Kontexte verifiziert. Die mit **BESTÄTIGT** markierten Zeilen wurden einzeln geprüft; die restlichen XSS-Sinks stammen aus einem zeilengenauen Sweep und sollten bei der Umsetzung kurz gegengeprüft werden (der empfohlene Muster-Fix deckt sie ohnehin ab).

**Wichtige Kalibrierung XSS:** In *allen* schwachen Escapern wird `<` escaped → man kann **keine neuen Tags** öffnen. Ausnutzbar ist:
- **Attribut-Injektion** (`" onmouseover=…`, `autofocus onfocus=…`) wenn der Escaper `"` nicht escaped und der Wert in einem doppelt-gequoteten Attribut steht;
- **JS-String-Ausbruch** (`');alert(1)//`) wenn der Escaper `'` nicht escaped und der Wert in einem einfach-gequoteten `onclick`-Argument steht;
- **volle Tag-Injektion** (`<img src=x onerror=…>`, zero-click) nur bei den **komplett roh** interpolierten Stellen (gar kein Escaper).

**Prioritätenlegende:** 🔴 Kritisch · 🟠 Hoch · 🟡 Mittel · 🟢 Niedrig/latent

---

## ⚠️ ZUERST VERIFIZIEREN (bevor irgendetwas anderes)

**Ist die RLS überhaupt deployed?** Der Supabase-Anon-Key steht fest im Client (`gema_db.js`, `gema_sync.js`). Ist `supabase/gema_rls_v1.sql` **nicht** im Supabase-SQL-Editor ausgeführt, ist die gesamte Datenbank **öffentlich les- und schreibbar** — ohne Login.

Prüfen (eines von beiden):
- Supabase-Dashboard → Authentication → Policies → Tabelle `gema_data`: existieren die Policies `gema_auth_select/insert/update/delete`?
- Mit dem Anon-Key: `GET https://<projekt>.supabase.co/rest/v1/gema_data?select=data_key&limit=1` (Header `apikey`+`Authorization: Bearer <anon>`). Kommen Zeilen zurück → **RLS ist AUS** → sofort einspielen. Kommt `[]` → RLS ist aktiv.

Solange dieser Punkt offen ist, sind alle folgenden Befunde nachrangig.

---

## 🔴 S1 — RLS trennt Organisationen nicht (Lesen, Schreiben UND Löschen cross-org)

**Dateien:** `supabase/gema_rls_v1.sql`, `netlify/functions/gema-auth.js` (`actionRegister`), `gema_sync.js`

**Befund:** Die RLS-Policies erlauben `authenticated` pauschal:
- `SELECT`: alles ausser `data_key like 'cred:%'`
- `INSERT/UPDATE/DELETE`: alles mit `module_key <> 'auth'` und nicht `cred:%`

Es gibt **kein Org-Scoping**. Jeder eingeloggte User (JWT-Rolle `authenticated`) kann damit **jede** Modul-Zeile **jeder** Organisation lesen, ändern und löschen — ERP-Rechnungen, Bestellungen, Objekte, Chat-Nachrichten, Schadenberichte, Token-Ledger, Preise.

**Verschärfung — öffentlich, nicht nur Insider:**
- `actionRegister` (gema-auth.js) ist **ohne Authentifizierung** aufrufbar (`case 'register'` läuft ohne `claims`). Jeder legt Org+Admin an und erhält ein gültiges `authenticated`-JWT (`mintToken`, `role:'authenticated'`).
- Der Client sendet dieses JWT als PostgREST-Bearer (`gema_sync.js:143` `'Authorization': 'Bearer ' + (tok || SB_KEY)`). Damit greift die `to authenticated`-Policy → volle DB-Rechte.

**Angriffspfad (konkret):** registrieren → JWT → `DELETE /rest/v1/gema_data?module_key=eq.erp` löscht **alle ERP-Daten aller Firmen**. Analog `objekte`, `bestellungen`, `schadensbericht` etc. Das ist Integritäts-/Verfügbarkeitsrisiko (nicht nur Daten-Exposition).

**Status:** In `CLAUDE.md` als «Stufe 2 / geplant» notiert (per-Org-RLS nicht gebaut). Der Schreib-/Lösch-Aspekt über Orgs hinweg + der Signup-Verstärker machen es zum grössten Geschäftsrisiko.

### Fix (Design-Aufgabe — braucht echte Planung, nicht nur ein SQL-Snippet)

Das JWT trägt bereits `org` (`gema-auth.js` `mintToken`: `org: String(user.orgId||'')`). Grundидее: Policies pro Collection auf `payload->'data'->>'orgId' = auth.jwt()->>'org'` scopen.

**Problem:** Nicht alle Collections sind org-gescopet — einige sind **bewusst cross-org** und würden brechen:
- `chat` (Threads zwischen Orgs), `notify` (empfänger-basiert), `produktkatalog` (Lieferanten für alle Planer sichtbar), `ausschreibung` (Planer↔Unternehmer↔Lieferant↔Architekt), `bestellungen` (Besteller-Org ↔ Lieferant-Org), `werkzeugmanagement` (externe Prüfer/Lieferanten), `schule` (Klassen-basiert, org-übergreifend), `armaturen` (geteilter Katalog), `goodel`/`revisionsunterlagen` (externe Freigabe via Service-Key-Function).

**Empfohlene Umsetzung (gestuft):**

1. **JWT-Claim nutzbar machen** — sicherstellen, dass `auth.jwt()->>'org'` in Policies verfügbar ist (ist es, da HS256 mit `org`-Claim signiert).

2. **Org-gescopte Collections** (die eindeutig einer Org gehören: `objekte`, `erp`, `regierapport`, `einsatzplan`, `stundenerfassung`, `schadensbericht`, `dachbericht`, `terminplan`, `abnahme`, `plaene`, `behoerden_formulare`, `revisionsunterlagen` (Dossiers), `goodel`, `service`, `spuelmanager`, `legionellen`, alle Berechnungs-Autosaves): pro `module_key` eine Policy, die `payload->'data'->>'orgId'` gegen den JWT-`org`-Claim prüft. Beispielmuster:

   ```sql
   -- Beispiel: nur eigene Org fuer eindeutig org-eigene Collections
   create policy gema_org_scoped_select on public.gema_data
     for select to authenticated
     using (
       data_key not like 'cred:%'
       and (
         module_key = any (array['chat','notify','produktkatalog','ausschreibung',
           'bestellungen','werkzeugmanagement','schule','armaturen','auth'])  -- cross-org: breiter
         or payload->'data'->>'orgId' = auth.jwt()->>'org'
       )
     );
   ```
   (analog für insert/update/delete, jeweils mit `with check`).

   **Achtung:** Viele Records tragen den orgId-Wert unter unterschiedlichen Pfaden (`orgId`, `ownerOrgId` bei Ausschreibung). Vor der Umstellung eine Bestandsaufnahme machen, welche Collection den orgId wo speichert (siehe „Migrierte Module"-Tabelle in CLAUDE.md), sonst sperrt die Policy legitime Reads aus. Am besten collection-weise ausrollen und je Collection testen.

3. **Cross-org Collections** bleiben zunächst breit (`to authenticated`, kein org-Filter), erhalten aber **app-level-Checks** oder wandern hinter Netlify-Functions mit Service-Key (wie `goodel-share`/`rev-share` bereits). Mittelfristig: feinere Policies (z.B. `chat`: `auth.jwt()->>'uid'` muss in `payload->data->teilnehmerIds` sein — via `jsonb`-Containment).

4. **`register` drosseln:** Rate-Limit pro IP (z.B. via Netlify-Edge oder ein einfacher In-Memory/KV-Counter) und/oder E-Mail-Verifikation, damit nicht beliebig viele `authenticated`-JWTs erzeugt werden können.

**Verifikation:** Zwei Test-Orgs anlegen, mit dem JWT von Org A versuchen, Records von Org B zu lesen/ändern/löschen → muss scheitern (403/leer). Cross-org-Flows (Lieferant sieht Offertanfrage der Planer-Org, Chat, Ausschreibung, Bestellung, Schule) müssen weiter funktionieren.

---

## 🟠 S2 — SSRF in `form-watch.js` (unauthentifiziert, Redirect-Bypass)

**Datei:** `netlify/functions/form-watch.js` (`_safeUrl` Z.19-28, `_probe` Z.30-43); geteilt mit `form-watch-cron.js`
**Endpoint:** `/api/form-watch?url=<encoded>` — **kein Auth**, jeder im Internet erreichbar.

**Befund:** `_safeUrl` blockt nur literale private IP-Muster. Umgehungen:
1. **`redirect:'follow'` (Z.34):** Die Start-URL wird validiert, aber das **Redirect-Ziel nicht erneut**. Angreifer hostet `https://evil.com/x`, das per 302 auf `http://169.254.169.254/latest/meta-data/…` (Cloud-Metadata) oder interne Hosts zeigt → Zugriff aufs interne Netz / evtl. IAM-Credentials.
2. **Nicht-literale IPs:** `http://2130706433` (= 127.0.0.1 dezimal), Oktal/Hex-Kodierungen — `u.hostname` matcht die `/^127\./`-Regex nicht.
3. **DNS-Rebinding:** ein Hostname, dessen A-Record auf `10.x`/`127.0.0.1` zeigt, besteht die reine String-Prüfung.
4. **IPv6:** nur `::1` geblockt; `fc00::/7`, `fe80::` offen.

Blind (Response liefert nur `hash`/`size`/`status`, nicht den Body), aber die Anfrage **erreicht** interne Ziele; `size`/`status` sind Orakel.

### Fix

```js
const dns = require('dns').promises;
const net = require('net');

function _isPrivateIp(ip){
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0]===10 || p[0]===127 || p[0]===0 ||
           (p[0]===192&&p[1]===168) || (p[0]===169&&p[1]===254) ||
           (p[0]===172&&p[1]>=16&&p[1]<=31) || p[0]>=224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l==='::1' || l.startsWith('fc') || l.startsWith('fd') ||
           l.startsWith('fe80') || l.startsWith('::ffff:');
  }
  return true; // unbekannt -> blocken
}

async function _resolveSafe(hostname){
  const addrs = await dns.lookup(hostname, { all:true });
  if (!addrs.length || addrs.some(a => _isPrivateIp(a.address))) return false;
  return true;
}

// _safeUrl zusaetzlich: nach der Schema-/Host-Pruefung DNS aufloesen und
// jede aufgeloeste IP gegen _isPrivateIp pruefen (await _resolveSafe(u.hostname)).

// _probe: KEIN redirect:'follow'. Stattdessen redirect:'manual', bis zu N mal
// selbst folgen und JEDE Ziel-URL erneut durch _safeUrl (inkl. DNS) schicken:
async function _probe(url){
  let cur = url;
  for (let i=0; i<4; i++){
    const r = await fetch(cur, { method:'GET', redirect:'manual', signal:ctrl.signal, headers:{'User-Agent':'GEMA-FormWatch/1.0'} });
    if (r.status>=300 && r.status<400 && r.headers.get('location')) {
      const next = new URL(r.headers.get('location'), cur).toString();
      const safe = await _safeUrlAsync(next);   // Schema + Host + DNS
      if (!safe) throw new Error('Unsicheres Redirect-Ziel');
      cur = safe; continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok:r.ok, status:r.status, hash: crypto.createHash('sha256').update(buf).digest('hex'),
             size: buf.length, etag:r.headers.get('etag')||'', lastModified:r.headers.get('last-modified')||'',
             contentType:r.headers.get('content-type')||'' };
  }
  throw new Error('Zu viele Redirects');
}
```

Zusätzlich: den Endpoint hinter ein JWT hängen (siehe S3) — Form-Watch ist eine eingeloggte Admin-Funktion, keine öffentliche.

**Verifikation:** `?url=http://2130706433/`, `?url=http://169.254.169.254/`, und eine Test-URL, die auf einen internen Host redirectet → alle müssen mit „Ungültige/nicht erlaubte URL" bzw. „Unsicheres Redirect-Ziel" abweisen. Eine echte externe Formular-URL muss weiter einen Hash liefern.

---

## 🟠 S3 — Alle `claude-*`-Proxies sind unauthentifiziert (API-Kosten-Missbrauch)

**Dateien:** `netlify/functions/claude-rewrite.js`, `claude-extract.js`, `claude-formfields.js`, `claude-plan.js`

**Befund:** Keine der vier Functions prüft ein Token; alle haben `Access-Control-Allow-Origin: *`. Jeder im Internet kann sie als **offenen Claude-Proxy** nutzen und die `ANTHROPIC_API_KEY`-Rechnung treiben. `claude-plan.js` nutzt `claude-sonnet-5` (Vision, teuer) — grösster Hebel. Keine Rate-Limits. (In CLAUDE.md als „Stufe 2: Function-Rate-Limiting" notiert.)

### Fix

Geteilten JWT-Check einführen (die Verifikations-Infrastruktur existiert in `gema-auth.js`: `verifyJwt`). Als kleines gemeinsames Modul `netlify/functions/_jwt.js`:

```js
'use strict';
const crypto = require('crypto');
const JWT_SECRET = process.env.GEMA_JWT_SECRET || '';
function b64urlToBuf(s){ return Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64'); }
function timingSafeEq(a,b){ const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function verifyJwt(token){
  try {
    const [h,p,s] = String(token||'').split('.'); if(!h||!p||!s) return null;
    const expect = crypto.createHmac('sha256',JWT_SECRET).update(h+'.'+p).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    if(!timingSafeEq(s,expect)) return null;
    const c = JSON.parse(b64urlToBuf(p).toString());
    if(!c.exp || c.exp*1000 < Date.now()) return null;
    return c;
  } catch(e){ return null; }
}
function requireAuth(event){
  const a = (event.headers && (event.headers.authorization||event.headers.Authorization)) || '';
  return verifyJwt(a.replace(/^Bearer\s+/i,''));
}
module.exports = { verifyJwt, requireAuth };
```

In jeder `claude-*.js` am Anfang des Handlers (nach OPTIONS):
```js
const { requireAuth } = require('./_jwt');
if (!requireAuth(event)) return { statusCode:401, headers:cors, body: JSON.stringify({ ok:false, error:'Nicht angemeldet' }) };
```

Client (`gema_claude.js`): den Bearer mitsenden — `headers['Authorization'] = 'Bearer ' + GemaSync.getAuthToken()`.

Optional zusätzlich: ein einfacher Per-User-Rate-Limit (z.B. via Supabase-Zähler pro `uid`+Tag). Für den ersten Wurf reicht der Auth-Gate.

**Verifikation:** Aufruf ohne/mit ungültigem Token → 401. Aufruf aus dem eingeloggten Modul (mit Token) → funktioniert. Prüfen, dass alle vier Functions + der Client-Aufruf angepasst sind.

---

## 🟡 S4 — XSS: uneinheitliche Escaper (systematisch)

**Grundursache:** Mehrere Module definieren einen lokalen `esc()`/`E()`/`_esc()`, der **nicht alle** kritischen Zeichen escaped. Verwendet werden diese teils in Attribut-/Handler-Kontext, wo `"` bzw. `'` escaped sein müssten.

### Schwache Escaper (müssen zu Voll-Escaper werden)

| Datei | Zeile | Aktuell | Fehlt |
|---|---|---|---|
| `pm_besprechung.html` | 739 | `&<>` | `" '` |
| `pm_crbx.html` | 736 | textContent-Trick | `" '` |
| `ab_quiz.html` | 865 | `&<>"` | `'` |
| `if_werkzeug.html` | 6832 | `&<>` | `" '` |
| `if_fahrzeug.html` | 2174 | textContent-Trick | `" '` |
| `sys_workspace.html` | 784 | `&<>` | `" '` |
| `hy_inspektion.html` | 1015 | `&<>` | `" '` |
| `gema_offerten_tab.js` | 22 (`_esc`) | textContent-Trick | `" '` |
| `pm_ausschreibungsunterlagen.html` | 5775 (`E`) | textContent-Trick | `" '` |
| `sys_lieferant_dashboard.html` | 474 (`E`) | `&<"` (kein `>`) | `>` `'` (niedrig — `<`+`"` reichen, aber vereinheitlichen) |

**Kanonischer Voll-Escaper** (überall gleich einsetzen):
```js
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
```
Jeweils die lokale Definition durch diese ersetzen (Name beibehalten: `esc`/`E`/`_esc`). Damit schliessen sich fast alle Attribut-/Handler-Befunde in einem Rutsch.

### Komplett rohe Sinks (brauchen zusätzlich das fehlende Escaper-Wrapping)

| Datei | Zeile(n) | Feld / Quelle | Kontext | Fix |
|---|---|---|---|---|
| `pm_ausschreibungsunterlagen.html` | **1034, 1035, 1045** | `o.name`, `o.strasse/plz/ort` (`renderObjQuickList`) | Element, **roh** — zero-click Tag-Injektion | `esc(o.name)` etc. — **BESTÄTIGT** |
| `pm_objekte.html` | **749, 750** | `objLabel(e.objektId)` (Projektname), `userName(...)` (Anzeigename) — `renderBerechnungen` | Element, **roh** — zero-click | `esc(objLabel(...))`, `esc(userName(...))`. Vorbild: gleiche Funktionen in Z.866 korrekt mit `esc()` — **BESTÄTIGT** |
| `pm_objekte.html` | 703 | `o.name`/`o.nummer` im `<option>` (`sel.innerHTML`) | `<option>`-Text, **roh** — Select-Breakout | `esc(o.name)`, `esc(o.nummer)` — **BESTÄTIGT** |
| `gema_offerten_tab.js` | **70** | `oa.antwort.pdfDataUrl` komplett roh im `href="..."` | Attribut, **roh** | `_esc(...)` + Voll-Escaper — **BESTÄTIGT** |
| `pm_objekte.html` | 857 | `oa.antwort.pdfDataUrl` roh im `href` (Z.855 nutzt korrekt `esc()`) | Attribut | `esc(...)` |

### Attribut-/Handler-Injektion (durch Voll-Escaper abgedeckt, hier zur Kontrolle)

| Datei | Zeile(n) | Feld / Quelle | Reichweite |
|---|---|---|---|
| `ab_quiz.html` | 942 | Community-Thema `'${esc(t)}'` im `onclick` (`'`-Ausbruch) | org-übergreifend (Pool) — **BESTÄTIGT** |
| `gema_offerten_tab.js` | 68 | `pdfUrl`/`pdfName` (Lieferant) im `href`/Text | Lieferant→Planer — **BESTÄTIGT** |
| `pm_ausschreibungsunterlagen.html` | 3512 | `e.firma` (Bieter) im `title="Chat mit …"` | Lieferant→Planer — **BESTÄTIGT** |
| `pm_ausschreibungsunterlagen.html` | 2849, 2522 | `off.produktName`, `ant.pdfName` (Lieferant) im `value=`/`download=` | Lieferant→Unternehmer — **BESTÄTIGT** |
| `pm_ausschreibungsunterlagen.html` | 2012, 4868 | `los.name` im `dlgConfirm('…"+E(los.name)+"…')`, `z.name` im `value=` | org |
| `pm_crbx.html` | 534, 584 | `pos.description` (importierte CRBX/E1S-Datei) im `title=` | Unternehmer→Planer — **BESTÄTIGT** |
| `if_werkzeug.html` | 2506 | `t.bildUrl` (Lieferanten-Katalog) im `<img src="…" onerror>` | Lieferant→org — **BESTÄTIGT** |
| `if_werkzeug.html` | 2508, 3178, 3502, 3504, 3508, 4550, 4554, 4562, 4566, 4567, 4912 | Werkzeug-Stammdaten (Name, Standort, Koffer, Hersteller, Lieferant, Modell, Serien-Nr, Kategorie) im `title=`/`value=` | org |
| `if_fahrzeug.html` | 1628, 1796, 1801, 1848, 1849, 1927, 2028, 2136, 2141, 2149, 2152 | Garage-/Werkstatt-/Typ-/Abteilungsnamen im `value=` (reine `<option value=>`-Fälle niedrig) | org |
| `pm_besprechung.html` | 1008, 1009, 1010, 1110 | Teilnehmer/Firma/Funktion/Traktandum im `value=` | org — **BESTÄTIGT** |
| `sys_workspace.html` | 1347, 1598, 2105, 1725 | Notiz-/Eimer-/Vorlagen-Namen im `value=`/`title=`/`onkeydown=` | org |
| `hy_inspektion.html` | 685 | `a.name` (Anlagenname) im `title=` | org |
| `if_trocknung.html` | 2140 | `data-titel`/`data-objname` auf `<option>` | niedrig (`<option>`-Attribut) |
| `ab_berufsschule.html` | 913 | `k` (Klasse) im `<option value=>` | niedrig |

**Verifikation (pro Datei):** Testwert mit `"><img src=x onerror=alert(1)>` (rohe Sinks) bzw. `" autofocus onfocus=alert(1) x="` (Attribut) bzw. `');alert(1)//` (onclick) eingeben/importieren und rendern — darf nicht feuern. Danach normale Werte prüfen (Escaping darf Anzeige nicht verfälschen — `&`/Anführungszeichen erscheinen korrekt).

**Hinweis für die Umsetzung:** Am effizientesten zuerst die 10 schwachen Escaper auf den kanonischen Voll-Escaper umstellen (schliesst die ganze untere Tabelle), dann die 5 rohen Sinks wrappen. Die `<option>`- und `data-*`-Fälle sind niedrig, aber beim Vereinheitlichen automatisch erledigt.

---

## 🟡 S5 — `persist_auth` erlaubt Selbst-Edit eigener Nicht-Rollen-Felder

**Datei:** `netlify/functions/gema-auth.js` (`actionPersistAuth`, Z.424-453, Selbst-Update-Zweig Z.430-436)

**Befund:** Der Guard friert beim Selbst-Update nur `roleIds`, `orgId` und `active` ein. Ein User kann per gecraftetem `persist_auth`-Request beliebige **andere** Felder seines eigenen `user:`-Records setzen:
- `user.planerPremium = true` → `isPlanerPremium()` (`gema_produktkatalog_api.js:1996`) → Bezahl-Feature (Favoriten/Stammlieferanten) freigeschaltet.
- `user.abo = {typ:'premium'}` bzw. `testphaseEnde` → Trial/Premium selbst verlängern.
- `user.lieferantId = '<fremde Lieferanten-ID>'` → `findMyLieferant()` (`sys_lieferant_dashboard.html:487-488`) bevorzugt dieses Feld → wer eine Lieferanten-Rolle hat, sieht damit ein **fremdes** Lieferanten-Dashboard (Produkte/Offertanfragen/Bestellungen einer anderen Firma).

**Reichweite:** Kommerzieller Bypass generell; `lieferantId` ist cross-supplier-Datenzugriff, aber konditional (User braucht bereits eine `role_lieferant*`-Rolle).

### Fix

Selbst-Updates auf eine **Feld-Whitelist** beschränken statt „alles ausser roleIds/orgId/active". In `actionPersistAuth`, Selbst-Update-Zweig:

```js
if (targetId === requester.id) {
  // Nur unkritische Profilfelder duerfen sich selbst geaendert werden.
  const SELF_EDITABLE = new Set(['name','profile','avatar','einstellungen','password']);
  const merged = Object.assign({}, existing);
  for (const k of Object.keys(data)) {
    if (SELF_EDITABLE.has(k)) merged[k] = data[k];
    // alle uebrigen Felder (roleIds, orgId, active, abo, planerPremium,
    // lieferantId, …) werden aus dem DB-Stand uebernommen, nicht vom Client.
  }
  rec.data = merged; // statt data 1:1 zu uebernehmen
}
```
(`password` bleibt in der Whitelist, damit `absorbPassword` weiter greift; `abo`/`planerPremium`/`lieferantId` nur serverseitig/durch Admin setzbar.)

**Verifikation:** Als Nicht-Admin einen `persist_auth`-Request auf den eigenen `user:`-Key mit `planerPremium:true` / `lieferantId:'fremd'` senden → das Feld darf in der DB **nicht** ankommen (aus dem Bestand übernommen). Profil-Namensänderung muss weiter funktionieren.

---

## 🟢 S6 — `stripe-checkout.js`: client-gesteuerter Betrag (latent, heute deaktiviert)

**Datei:** `netlify/functions/stripe-checkout.js` (Z.51-83)

**Befund:** Heute inaktiv (501 ohne `STRIPE_SECRET_KEY`). Bei Aktivierung: `betragRappen` kommt aus dem Client (`Math.max(0, Math.round(+body.betragRappen))`). Ohne vollständige `STRIPE_PRICE_MAP` läuft der Ad-hoc-`price_data`-Zweig → der Kunde zahlt einen **selbst gewählten** Betrag (Minimum CHF 0.50) statt des Abopreises. Zusätzlich fehlt der Webhook (`stripe-webhook.js`), der das Abo serverseitig aktiviert — die Function ist auch unauthentifiziert.

### Fix (vor Stripe-Go-Live)
1. **Preis serverseitig** bestimmen: `planId` → Betrag/Price-ID aus einer serverseitigen Tabelle (`STRIPE_PRICE_MAP` als Pflicht, oder Betrag aus der Abo-Config `GemaAbo`-Engine server-seitig nachrechnen). `betragRappen` aus dem Client **ignorieren**.
2. **Auth** ergänzen (JWT, siehe S3) — nur eingeloggte User dürfen einen Checkout starten; `client_reference_id` = `uid`/`orgId` server-seitig setzen.
3. **`stripe-webhook.js`** bauen: `checkout.session.completed` verifizieren (Stripe-Signatur) → `abosub:`-Record serverseitig auf `aktiv`.

**Verifikation:** Checkout-Aufruf mit manipuliertem `betragRappen` → Betrag muss dem serverseitig bestimmten Preis entsprechen. Erst nach diesen drei Punkten Stripe scharfschalten.

---

## 🟢 S7 — `goodel-share.js`: `extSecret`-Vergleich nicht timing-safe

**Datei:** `netlify/functions/goodel-share.js` (Z.153 `mine.extSecret !== secret`)

**Befund:** String-Vergleich statt konstante Zeit. Das Secret ist 32 Hex-Zeichen; ein Timing-Angriff über das Netz ist praktisch nicht durchführbar. Kosmetisch/Härtung.

### Fix
```js
const crypto = require('crypto');
function timingSafeEq(a,b){ const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); }
// ...
if (!mine || !mine.extSecret || !timingSafeEq(mine.extSecret, secret)) return resp(403, {...});
```

---

## ✅ Als SAUBER geprüft (kein Handlungsbedarf — spart bei der Umsetzung Zeit)

- **Öffentliche Viewer** `sys_goodel_ansicht.html`, `sys_revision_ansicht.html` (unauth, externe Inhalte — höchstes XSS-Risiko): korrekt escaped, `nl2br` escaped vor `<br>`-Einfügung, alle Attribute doppelt-gequotet.
- **`gema_chat.js`** (cross-org): Voll-Escaper (Z.45), `_linkify` matcht nur `https?://` und arbeitet auf bereits-escaptem Text.
- **`gema_notify_ui.js`**: `_esc` escaped `&<>"'`; `n.text`/`n.titel` in Element-Kontext → der Goodel-Share-Notify-Vektor (unauth Name) ist damit entschärft.
- **Auth-Function** `gema-auth.js`: scrypt-Hashes in geschützten `cred:`-Records (keine RLS-Policy → nur Service-Key), HS256-JWT (nur ein Algorithmus → keine alg-Confusion; `alg:none` wird durch Längen-/Signaturvergleich abgewiesen), Rechte werden **server-seitig aus der DB** abgeleitet (`isGemaAdmin(requester)` nach DB-Load), nicht aus dem manipulierbaren JWT-`adm`-Claim.
- **Impersonation-Guard** `_switchUser` (`gema_auth.js:1448`) vorhanden (`_sessionUserIsAdmin()||_adminOriginIsAdmin()`).
- **`rev-share.js`**: read-only, Token 48 hex, sanitisiert korrekt (kein Token/userId/dataUrl).
- Voll-escapte Module (kein XSS): `pm_objekte` Beteiligtentabelle, `pm_stunden`, `hy_w12`, `br_vkf_formular`, `hy_legionellen`, `ab_pruefungen`, `ab_pruefung_live`, `pm_regierapport`, `pm_erp`, `sb_ausstosszeiten` (nutzt korrekt `escAttr` fürs Attribut), `pm_baustelle`, sowie das geteilte Objekt-Dropdown-Pattern in den ~20 sb_/sa_/hz_-Rechenmodulen.
- **jsPDF-`doc.text(...)`-Aufrufe** (z.B. `if_werkzeug.html:5377`) rendern auf Canvas/PDF → **kein DOM, kein XSS** (nicht mit innerHTML verwechseln).

---

## Empfohlene Umsetzungsreihenfolge

1. **S1 verifizieren** (RLS deployed?) — falls aus: sofort `gema_rls_v1.sql` einspielen.
2. **S1 Kern:** per-Org-RLS (Design-Aufgabe, collection-weise ausrollen + testen) + `register` drosseln.
3. **S2** SSRF-Redirect-Bypass schliessen (klein, klar).
4. **S3** `claude-*` + `form-watch` hinter JWT (`_jwt.js`) + optional Rate-Limit.
5. **S4** kanonischer Voll-Escaper in den 10 Dateien + 5 rohe Sinks wrappen (mechanisch, gut testbar).
6. **S5** Feld-Whitelist im Selbst-Update; **S7** timing-safe.
7. **S6** erst umsetzen, wenn Stripe aktiviert werden soll.

**Regel bei der Umsetzung:** Jeder Fix mit einer kurzen Verifikation absichern (Angriffs-Testwert + Normalfall). Client-seitige Checks (S4, Teile von S1) sind Defense-in-Depth — die eigentliche Autorisierung gehört server-seitig (RLS + Functions).
