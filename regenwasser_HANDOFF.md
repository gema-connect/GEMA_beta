# HANDOFF: Regenwasser- / Starkniederschlagsmodul

**Ziel:** Bemessungsniederschläge (Wiederkehrwerte) als eigener Datenpool in GEMA, automatische Zuweisung über die Objektadresse, Auswahl aus den drei nächstgelegenen Gitterpunkten.

**Status:** Konzept. Noch kein Code, noch keine Tabelle.
**Erstellt:** Juli 2026
**Verwandte Dokumente:** `KONZEPT_Inspiration.md`, `CLAUDE.md`

---

## 0. Wichtigster Hinweis vorab

Das Datenformat des Quelldatensatzes ist **nicht bekannt**. Schritt 1 ist ein reiner Erkundungsschritt. Baue **nichts**, bevor du das Format verifiziert hast. Der Import-Code darf nicht auf einer Annahme über das Format basieren.

Ebenfalls: **hydromaps.ch nicht scrapen.** Das ist nur das Visualisierungs-Frontend. Es gibt keine öffentliche, dokumentierte API, und die internen Tile-Endpoints sind weder stabil noch für diesen Zweck lizenziert. Die Daten kommen von MeteoSchweiz.

---

## 1. Datenquelle

### Was wir brauchen

MeteoSchweiz, Karte **B04 «Extreme Punktniederschläge»** (publiziert 2026, ersetzt HADES-Tafel 2.4 aus den 1990er-Jahren).

Eigenschaften laut MeteoSchweiz:

- Wiederkehrwerte auf einem **1-km-Raster**, flächendeckend Schweiz + grenznahes Ausland
- **10 Dauerstufen** von 2 Minuten bis 72 Stunden
- Mehrere Wiederkehrperioden (T2 … T100+)
- **Inklusive Unsicherheitsangaben** (Konfidenzintervalle, Bayes'sche Schätzung)
- Die 2- und 5-Minuten-Werte sind aus der Extremwertanalyse des 10-Minuten-Niederschlags **extrapoliert**

Der 5-Minuten-Wert bei 5 Jahren Wiederkehrperiode entspricht der Regenspende **r(5,5)** für die Dachentwässerung. Das ist der zentrale Wert für dieses Modul.

### Einstiegspunkte für die Recherche

- MeteoSchweiz Extremwertanalysen: `https://www.meteoschweiz.admin.ch/klima/klima-der-schweiz/rekorde-und-extreme/extremwertanalysen.html`
- MeteoSchweiz Open Data (OGD): `https://www.meteoschweiz.admin.ch/service-und-publikationen/service/open-data.html`
- OGD-Doku: `https://opendatadocs.meteoswiss.ch/`
- STAC-API der Bundes-Geodateninfrastruktur: `https://data.geo.admin.ch/api/stac/v1/collections` — prüfen, ob eine Collection `ch.meteoschweiz.*` den B04-Datensatz enthält
- STAC-Browser: `https://data.geo.admin.ch/browser/`

### Schritt 1 — Format ermitteln (Aufgabe an dich)

1. STAC-Collections durchsuchen nach Starkniederschlag / Wiederkehrwerten.
2. Falls nicht in STAC: MeteoSchweiz-Downloadseite prüfen.
3. **Dokumentiere** in `regenwasser_QUELLE.md`:
   - Exakte Download-URL
   - Dateiformat (erwartbar: NetCDF, GeoTIFF, ASCII-Grid oder CSV)
   - Koordinatensystem (vermutlich LV95 / EPSG:2056)
   - Feldnamen für Dauerstufen und Wiederkehrperioden
   - Wie die Unsicherheitsangaben abgelegt sind
   - Versionskennung des Datensatzes (Datum, Versionsnummer, ETag)
   - Lizenztext im Original-Wortlaut
4. **Erst dann** den Importer schreiben.

Der Importer bekommt eine Format-Weiche (`netcdf` / `geotiff` / `csv`), damit ein Formatwechsel bei einem späteren Release nicht das ganze Skript sprengt.

### Lizenz

Open Data von MeteoSchweiz darf uneingeschränkt weiterverwendet werden; bei Wiedergabe oder Weiterverbreitung ist die Quelle anzugeben (**«Quelle: MeteoSchweiz»**). Kommerzielle Nutzung in GEMA ist damit gedeckt.

Prüfe trotzdem den konkreten Lizenztext des B04-Datensatzes und übernimm ihn wörtlich in `regenwasser_QUELLE.md`. Wenn er von der allgemeinen OGD-Regel abweicht: melden, nicht selber entscheiden.

---

## 2. Datenmodell

PostGIS wird gebraucht. Auf Supabase:

```sql
create extension if not exists postgis with schema extensions;
```

### Tabellen

```sql
-- Versionsverwaltung des Datensatzes
create table public.nb_datensatz (
  id            text primary key,          -- z.B. 'MCH_B04_2026'
  quelle        text not null,             -- 'MeteoSchweiz'
  bezeichnung   text not null,             -- 'Extreme Punktniederschläge (Karte B04)'
  version       text,
  veroeffentlicht date,
  download_url  text not null,
  etag          text,                      -- für den Versionsvergleich
  pruefsumme    text,                      -- SHA-256 der Quelldatei
  lizenz        text not null,
  importiert_am timestamptz not null default now(),
  aktiv         boolean not null default false
);

-- Gitterpunkte, ein Datensatz pro Punkt pro Version
create table public.nb_gitterpunkt (
  id           bigserial primary key,
  datensatz_id text not null references public.nb_datensatz(id),
  geom         geometry(Point, 4326) not null,
  x_lv95       numeric,
  y_lv95       numeric,
  hoehe_m      integer,
  werte        jsonb not null,
  unsicherheit jsonb
);

create index nb_gitterpunkt_geom_idx
  on public.nb_gitterpunkt using gist ((geom::geography));
create index nb_gitterpunkt_datensatz_idx
  on public.nb_gitterpunkt (datensatz_id);
```

### Struktur von `werte`

```json
{
  "5min":  { "T2": 6.2, "T5": 7.9, "T10": 9.1, "T20": 10.4, "T50": 12.2, "T100": 13.6 },
  "10min": { "T2": 9.8, "T5": 12.4, "...": "..." },
  "1h":    { "...": "..." },
  "24h":   { "...": "..." }
}
```

Einheit: **mm** (Niederschlagshöhe). Nicht l/(s·ha). Die Umrechnung passiert erst in der Berechnung, siehe Abschnitt 5.

Bei `unsicherheit` dieselbe Struktur, aber mit `{"p2_5": …, "p97_5": …}` je Kombination.

### GRANT nicht vergessen

Seit der Supabase-Änderung von Mai 2026 brauchen neue Tabellen im `public`-Schema explizite GRANT-Statements, sonst sind sie über supabase-js / PostgREST nicht erreichbar:

```sql
grant select on public.nb_datensatz   to anon, authenticated;
grant select on public.nb_gitterpunkt to anon, authenticated;
```

Nur `select`. Geschrieben wird ausschliesslich über den Import (Service-Role).

### RLS

Aktuell haben alle RLS-Policies in GEMA `qual = true`. Das bleibt hier vorerst so — die Daten sind ohnehin öffentlich. Aber:

```sql
alter table public.nb_datensatz enable row level security;
alter table public.nb_gitterpunkt enable row level security;

create policy "nb_datensatz_read" on public.nb_datensatz
  for select using (true);
create policy "nb_gitterpunkt_read" on public.nb_gitterpunkt
  for select using (true);
```

Kommentar in der Migration hinterlassen, dass echte Durchsetzung erst nach der Supabase-Auth-Migration (Phase 2) greift.

---

## 3. Abfrage der drei nächsten Gitterpunkte

Als `SECURITY DEFINER` RPC, wie beim Inspirationskatalog:

```sql
create or replace function public.nb_naechste_punkte(
  p_lon numeric,
  p_lat numeric,
  p_limit integer default 3
)
returns table (
  gitterpunkt_id bigint,
  distanz_m      numeric,
  x_lv95         numeric,
  y_lv95         numeric,
  hoehe_m        integer,
  werte          jsonb,
  unsicherheit   jsonb,
  datensatz_id   text
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    g.id,
    round(st_distance(
      g.geom::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    )::numeric, 1),
    g.x_lv95, g.y_lv95, g.hoehe_m, g.werte, g.unsicherheit, g.datensatz_id
  from public.nb_gitterpunkt g
  join public.nb_datensatz d on d.id = g.datensatz_id
  where d.aktiv = true
  order by g.geom::geography <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
  limit least(greatest(p_limit, 1), 10);
$$;

grant execute on function public.nb_naechste_punkte(numeric, numeric, integer)
  to anon, authenticated;
```

Der `<->` Operator auf `geography` nutzt den GiST-Index. Bei ~60'000 Punkten sind das wenige Millisekunden.

**Sanity-Check nach dem Import:** In einem 1-km-Raster darf der nächstgelegene Punkt nie weiter als ca. 710 m entfernt sein (halbe Diagonale). Ist er es doch, stimmt die Koordinatentransformation nicht. Baue das als Test.

---

## 4. Adresse → Koordinate (swisstopo SearchServer)

### Endpoint

```
https://api3.geo.admin.ch/rest/services/api/SearchServer
  ?searchText=<urlencoded>
  &type=locations
  &origins=address
  &sr=2056
  &limit=5
```

Kein API-Key, keine Registrierung.

### ⚠️ Vor dem Bauen verifizieren

Ich bin mir bei der genauen Response-Struktur **nicht sicher**. Insbesondere: ob `attrs.x` / `attrs.y` in LV95 Nord/Ost oder Ost/Nord liegen, und ob `attrs.lat` / `attrs.lon` zuverlässig WGS84 sind. Das ist eine bekannte Stolperfalle bei geo.admin.ch.

Mach zuerst einen echten Call:

```bash
curl -s 'https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Horburgstrasse%2096%204057%20Basel&type=locations&origins=address&sr=2056&limit=3' | jq
```

Dann gegen einen bekannten Punkt prüfen. Horburgstrasse 96, 4057 Basel muss ungefähr bei 47.57 N / 7.59 E landen. Wenn dein Resultat in der Nordsee liegt, hast du Nord und Ost vertauscht.

**Erst wenn das verifiziert ist**, den Parser schreiben. Kommentiere im Code, welche Felder du empirisch bestätigt hast.

### Wrapper

```
gema/js/geocoding.js
```

Exportiert:

```js
// -> [{ label, lon, lat, x_lv95, y_lv95, quelle: 'swisstopo' }, ...]
async function adresseSuchen(text, limit = 5)

// -> { lon, lat, ... } | null   (erster Treffer, oder null)
async function adresseAufloesen(text)
```

Anforderungen:

- **Debounce 300 ms** bei Tipp-Suche. Kein Call pro Tastendruck.
- Client-seitiger Cache (`Map`) pro Session. Dieselbe Adresse wird in einem Projekt oft mehrfach gesucht.
- Bei HTTP-Fehler oder Timeout (5 s): sauberer Fehler, kein stiller Fallback auf falsche Koordinaten.
- **Manuelle Eingabe muss immer möglich bleiben.** Wenn die Adresse nicht gefunden wird, darf der Nutzer Koordinaten direkt eintippen. Ein Modul, das ohne Internet nicht rechnet, ist im Baustellenkontext nutzlos.
- Quellenangabe im UI: «Adresssuche: swisstopo (geo.admin.ch)».

---

## 5. Modul `sa_regenwasser.html`

> **Prefix prüfen.** `sa_` (Sanitär) ist meine Annahme, weil Dachentwässerung zur Entwässerung gehört. Falls in `CLAUDE.md` eine andere Zuordnung steht, gilt die. Nicht raten — nachschauen.

### Ablauf im UI

1. **Objektadresse** eingeben (Autocomplete via SearchServer). Oder Koordinaten manuell.
2. Modul ruft `nb_naechste_punkte(lon, lat, 3)` auf.
3. Anzeige der drei Punkte: Distanz in m, Höhe ü. M., der massgebende Wert, Unsicherheitsspanne.
4. **Vorselektiert ist der nächstgelegene Punkt.** Nicht der höchste, nicht der tiefste.
5. Nutzer kann abweichen — dann erscheint ein **Pflichtfeld «Begründung»**.
6. Berechnung.
7. Ergebnis mit vollständiger Herkunftsangabe (siehe Abschnitt 7).

### Warum nicht frei wählbar

Wenn der Nutzer aus drei Punkten frei picken kann, pickt er den tiefsten und dimensioniert zu knapp. Das Modul muss den Default setzen und die Abweichung protokollieren. Der begründete Ausnahmefall bleibt möglich — er wird nur sichtbar.

### Umrechnung mm → Regenspende

```
r [l/(s·ha)] = h [mm] × 10000 / t [s]
```

Für die 5-Minuten-Dauerstufe (t = 300 s): `r = h × 33.33`.

Plausibilisierung: 9 mm in 5 Minuten ergibt 300 l/(s·ha) — der in der Schweiz gebräuchliche Richtwert. Passt die Grössenordnung nicht, stimmt die Einheit im Quelldatensatz nicht.

> **Normbezug:** Welche Dauerstufe und welche Wiederkehrperiode für welchen Anwendungsfall massgebend ist (Dachentwässerung, Notentwässerung, Retention, Versickerung), steht in SN EN 12056-3 bzw. SIA 271 / VSA-Richtlinien. **Das ist eine fachliche Festlegung, keine Programmierentscheidung.** Hardcode nichts. Leg die Zuordnung in eine Konfigurationstabelle im Code, dokumentiere sie sichtbar, und markiere sie mit `// TODO: fachliche Bestätigung Robin` bis sie geprüft ist.

### GEMA-Konventionen

- Numerische Inputs: `type="text" inputmode="decimal" onblur="fixLeadingZero(this)"`
- Nav: `.g-nav-*` Klassen, volle Breite, `height: 52px`, `padding: 0 24px`, Logo als vollständiges Inline-SVG mit `height="28"`
- Feedback-Button vorhanden. **Kein** Settings-Button (kein Hauptmodul), **kein** Admin-Button.
- Dateiname ohne Umlaute. Echte Umlaute (ä, ö, ü) überall im sichtbaren Text und in erzeugten Dokumenten — nie ae/oe/ue.
- Admin-Check, falls überhaupt nötig: `GemaAuth.getCurrentUser().roleIds.indexOf('role_admin') >= 0`. Nicht `u.isAdmin`, das Feld existiert nicht.

---

## 6. Halbjährlicher Versionsabgleich

**Kein automatischer Import.** Der Job prüft nur, ob eine neue Version existiert, und meldet.

### Begründung

Die B04-Karten ersetzen Grundlagen aus den 1990er-Jahren. Zwischen zwei Versionen liegen rund 30 Jahre. Ein Auto-Import würde:

- praktisch nie etwas tun,
- und im seltenen Fall, wo er etwas tut, **rückwirkend die Grundlage bereits erstellter Bemessungen verändern**.

Für eine Dimensionierung muss im Streitfall nachweisbar sein, mit welcher Datengrundlage gerechnet wurde. Deshalb: neue Version = neuer `datensatz_id`, alte Zeilen bleiben liegen, alte Berechnungen behalten ihren Verweis.

### Implementierung

```
gema/scripts/nb_versionscheck.js
```

Ablauf:

1. `HEAD`-Request auf die Download-URL, ETag und `Last-Modified` lesen. Falls STAC: die Collection-Metadaten abfragen.
2. Vergleich mit `nb_datensatz.etag` des aktiven Datensatzes.
3. Bei Abweichung: Datei laden, SHA-256 bilden, gegen `pruefsumme` vergleichen (ETags ändern sich manchmal ohne Inhaltsänderung).
4. Bei echter Änderung: **Benachrichtigung an Robin.** E-Mail via Resend, Betreff `[GEMA] Neue Version Starkniederschlagsdaten verfügbar`. Inhalt: alte und neue Versionskennung, Download-URL, Datum.
5. **Ende.** Kein Import, kein Umschalten von `aktiv`.

Der Import einer neuen Version ist ein bewusster, manueller Schritt mit Diff-Report (wie viele Punkte, wie stark weichen die Werte ab).

Trigger: GitHub Action oder Supabase Cron, `0 6 1 1,7 *` (1. Januar und 1. Juli, 06:00). Ein Fehlschlag darf nicht still verschluckt werden — bei Exception ebenfalls Mail.

---

## 7. Quellenangaben — überall

Das ist Lizenzpflicht, nicht Kosmetik. Sichtbar an **jedem** dieser Orte:

| Ort | Text |
|---|---|
| Modul-Footer | `Datengrundlage: Extreme Punktniederschläge (Karte B04). Quelle: MeteoSchweiz. Stand: {datensatz.veroeffentlicht}` |
| Neben dem Gitterpunkt-Selektor | `Quelle: MeteoSchweiz` |
| Adress-Autocomplete | `Adresssuche: swisstopo (geo.admin.ch)` |
| PDF-/Druck-Output | Vollständiger Block: Quelle, Datensatzbezeichnung, `datensatz_id`, Veröffentlichungsdatum, Abrufdatum, gewählter Gitterpunkt mit Koordinaten und Distanz |
| Berechnungsprotokoll (DB) | `datensatz_id`, `gitterpunkt_id`, Distanz, ob vom Default abgewichen wurde, Begründung |
| `regenwasser_QUELLE.md` | Lizenztext im Original-Wortlaut |

Im PDF-Output ist die Quellenangabe **nicht kleingedruckt**. Sie gehört zum Nachweis.

Jede gespeicherte Berechnung persistiert `datensatz_id` und `gitterpunkt_id`. Ohne die beiden Felder ist die Berechnung nicht reproduzierbar und damit wertlos.

---

## 8. Reihenfolge

1. Format ermitteln, `regenwasser_QUELLE.md` schreiben. **Danach stoppen und Robin fragen**, falls das Format überrascht (z.B. Registrierung nötig, oder Lizenz weicht von OGD ab).
2. SQL-Migration (Tabellen, Indizes, GRANTs, RLS, RPC).
3. Importer mit Format-Weiche. Trockenlauf mit einem Kanton, dann Vollimport.
4. Sanity-Check: nächster Punkt ≤ ~710 m für 20 Zufallsadressen in verschiedenen Landesteilen.
5. `geocoding.js` — Response-Struktur zuerst per curl verifizieren.
6. `sa_regenwasser.html`.
7. `nb_versionscheck.js` + Cron.
8. Quellenangaben durchgängig prüfen.

---

## 9. Definition of Done

- [ ] `regenwasser_QUELLE.md` dokumentiert Format, URL, Lizenz (Originalwortlaut), Versionskennung
- [ ] Import läuft reproduzierbar durch, Punktanzahl plausibel (Grössenordnung 50'000–70'000)
- [ ] `nb_naechste_punkte()` liefert bei 20 Testadressen quer durch die Schweiz drei Punkte, keiner weiter als 1.6 km
- [ ] Adresssuche funktioniert; manuelle Koordinateneingabe funktioniert ohne Netz
- [ ] Abweichung vom Default-Gitterpunkt erzwingt eine Begründung
- [ ] r(5,5) für Basel liegt in plausibler Grössenordnung (Kontrolle: rund 300 l/(s·ha), ± regionale Abweichung)
- [ ] Quellenangabe an allen sechs Orten aus Abschnitt 7
- [ ] Versionscheck-Job schickt bei simulierter Änderung eine Mail und importiert **nicht**
- [ ] GRANT-Statements gesetzt, Zugriff über supabase-js verifiziert

---

## 10. Offene Punkte für Robin

1. **Dauerstufe und Wiederkehrperiode je Anwendungsfall.** Dachentwässerung, Notentwässerung, Retention, Versickerung — je nach Norm unterschiedlich. Muss fachlich festgelegt werden, bevor das Modul rechnet.
2. **Unsicherheitsspanne im Angebot anzeigen — ja oder nein?** Fachlich sauber, aber gegenüber Kunden erklärungsbedürftig. Mein Vorschlag: im PDF ja, im Kurzangebot nein.
3. **Modul-Prefix** (`sa_` vs. anderer) bestätigen.
4. Soll das Modul auch die **Dachfläche** aus einer Objekt-/Projektzuordnung ziehen, oder wird sie immer manuell erfasst?
