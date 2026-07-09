# regenwasser_QUELLE.md — Quelldatensatz Starkniederschlag

**Status: ⚠️ RECHERCHE OFFEN — Format noch NICHT verifiziert.**

> Dieses Dokument ist der Pflicht-Output von Schritt 1 des Handoffs
> (`regenwasser_HANDOFF.md`, Abschnitt 1). Es muss mit **verifizierten**
> Fakten gefüllt werden, **bevor** der Importer geschrieben wird. Der
> Importer darf nicht auf Annahmen basieren.

---

## 📥 So lieferst du (Robin) mir die Angaben — dann baue ich den Importer

Ich brauche genau **eines** davon:

1. **Die Quelldatei selbst** (NetCDF / GeoTIFF / ASCII-Grid / CSV) — in die
   Session hochladen oder den direkten Download-Link nennen. Ich lese Format,
   Feldnamen, CRS und Punktanzahl dann direkt heraus.
2. **ODER die JSON-Ausgabe der beiden `curl`-Befehle** aus Abschnitt 1
   (STAC-Collection + ein SearchServer-Treffer) — reinkopieren genügt.
3. **ODER die ausgefüllte Tabelle** aus Abschnitt 2 (Download-URL, Format,
   CRS, Feldnamen Dauerstufen/Wiederkehrperioden, Unsicherheits-Ablage,
   Versionskennung, Lizenztext im Original).

Sobald das da ist: ich schreibe den Importer mit Format-Weiche, fülle diese
Datei mit den verifizierten Fakten und mache den Vollimport (Sanity-Check
≤ 710 m). **Wo im Produkt an dich erinnert wird:** im Modul
`sb_niederschlag.html` → Datenquelle «Punktdaten MeteoSchweiz». Solange der
Pool leer ist, zeigt das Panel dort einen gelben Hinweis, der genau auf
diese Datei verweist.

**Der Werte-Kontrakt für den Import** steht fest (die SQL + das Modul rechnen
schon damit): `nb_gitterpunkt.werte` = jsonb der Form
`{ "5min": {"T2":.., "T5":.., ...}, "10min": {...}, "1h": {...} }`, Werte in
**mm**. Der Importer muss das Quellformat nur auf diese Form abbilden.

---

## 0. Warum noch offen

Die für Schritt 1 nötigen Hosts sind aus der aktuellen Ausführungsumgebung
**nicht erreichbar** (die Netzwerk-Policy beantwortet den CONNECT mit
HTTP 403):

- `data.geo.admin.ch` (STAC-API) — blockiert
- `api3.geo.admin.ch` (swisstopo SearchServer) — blockiert
- `www.meteoschweiz.admin.ch` (OGD-Downloadseite) — blockiert

Damit lässt sich das Quellformat hier weder abrufen noch verifizieren. Die
Recherche muss aus einer Umgebung mit Zugang zu diesen Hosts (bzw. einer
Netzwerk-Policy, die `*.admin.ch` erlaubt) nachgeholt werden — **oder Robin
liefert die Quelldatei / die Formatangaben direkt.**

`hydromaps.ch` wird bewusst **nicht** angezapft (nur Visualisierungs-Frontend,
keine dokumentierte/lizenzierte API — siehe Handoff Abschnitt 0).

---

## 1. Auszuführende Schritte (sobald Netzzugang besteht)

### a) STAC-Collections nach dem B04-Datensatz durchsuchen

```bash
# Alle MeteoSchweiz-Collections auflisten
curl -s 'https://data.geo.admin.ch/api/stac/v1/collections?limit=200' \
  | jq -r '.collections[] | select(.id|test("meteoschweiz|meteoswiss";"i")) | .id + " | " + (.title//"")'

# Kandidaten nach Starkniederschlag / Wiederkehrwert filtern
curl -s 'https://data.geo.admin.ch/api/stac/v1/collections?limit=200' \
  | jq -r '.collections[] | select((.id+" "+(.title//"")+" "+(.description//""))|test("niederschlag|punktniederschl|starkniederschl|b04|precip|return period|wiederkehr";"i")) | .id'
```

Wenn die Collection gefunden ist, deren Items + Assets inspizieren:

```bash
curl -s 'https://data.geo.admin.ch/api/stac/v1/collections/<COLLECTION_ID>/items?limit=1' | jq '.features[0].assets'
```

→ liefert die konkreten Asset-URLs, Media-Types (NetCDF/GeoTIFF/CSV/…) und ggf. ETag/Checksum.

### b) Falls nicht in STAC: OGD-Downloadseite

- MeteoSchweiz Extremwertanalysen: <https://www.meteoschweiz.admin.ch/klima/klima-der-schweiz/rekorde-und-extreme/extremwertanalysen.html>
- MeteoSchweiz Open Data: <https://www.meteoschweiz.admin.ch/service-und-publikationen/service/open-data.html>
- OGD-Doku: <https://opendatadocs.meteoswiss.ch/>

### c) swisstopo SearchServer verifizieren (für `gema/js/geocoding.js`)

```bash
curl -s 'https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=Horburgstrasse%2096%204057%20Basel&type=locations&origins=address&sr=2056&limit=3' | jq
```

**Kontrolle:** Horburgstrasse 96, 4057 Basel muss ~47.57 N / 7.59 E ergeben.
Prüfen, ob `attrs.lat`/`attrs.lon` zuverlässig WGS84 sind und ob
`attrs.y`/`attrs.x` in LV95 **Nord/Ost oder Ost/Nord** liegen (bekannte
Stolperfalle). Liegt das Ergebnis in der Nordsee → Nord/Ost vertauscht.
Erst nach dieser Kontrolle den Parser schreiben und im Code kommentieren,
welche Felder empirisch bestätigt sind.

---

## 2. Zu dokumentierende Fakten (Template — bitte ausfüllen)

| Feld | Wert (verifiziert) |
|---|---|
| Exakte Download-URL | _offen_ |
| Dateiformat | _offen (erwartbar NetCDF / GeoTIFF / ASCII-Grid / CSV)_ |
| Koordinatensystem | _offen (vermutlich LV95 / EPSG:2056)_ |
| Feldnamen Dauerstufen | _offen (z.B. 2min,5min,…,72h — 10 Stufen)_ |
| Feldnamen Wiederkehrperioden | _offen (z.B. T2,T5,T10,T20,T50,T100)_ |
| Ablage Unsicherheit | _offen (Konfidenzintervall p2.5/p97.5 — als eigene Bänder/Variablen?)_ |
| Versionskennung | _offen (Datum / Versionsnr. / ETag)_ |
| Punktanzahl (Plausibilität 50k–70k) | _offen_ |
| Lizenztext (Originalwortlaut) | _offen — wörtlich übernehmen_ |

**Format-Weiche des Importers:** `netcdf` / `geotiff` / `csv` — wird erst
festgelegt, wenn das Format oben bestätigt ist.

---

## 3. Lizenz

Open Data von MeteoSchweiz darf uneingeschränkt weiterverwendet werden; bei
Wiedergabe/Weiterverbreitung ist die Quelle anzugeben (**«Quelle:
MeteoSchweiz»**). Kommerzielle Nutzung in GEMA ist damit gedeckt.

⚠️ Den **konkreten** Lizenztext des B04-Datensatzes prüfen und hier wörtlich
übernehmen. Weicht er von der allgemeinen OGD-Regel ab → **melden, nicht
selber entscheiden** (Handoff Abschnitt 1).

---

## 4. Data Model (bereits angelegt, format-unabhängig)

Die SQL-Migration `supabase/gema_regenwasser_v1.sql` (+ Rollback) legt den
PostGIS-Pool bereits an: `nb_datensatz` (Versionen) + `nb_gitterpunkt`
(`werte`/`unsicherheit` als jsonb in **mm**) + GiST-Index + RLS + die RPC
`nb_naechste_punkte(lon,lat,limit)`. Diese Struktur ist unabhängig vom
Quellformat — der Importer mappt Quelle → jsonb.
