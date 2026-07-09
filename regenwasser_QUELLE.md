# regenwasser_QUELLE.md — Quelldatensatz Starkniederschlag

**Status: ✅ Format verifiziert (v3.0). Import-Werkzeuge bereit.**

> Pflicht-Output von Schritt 1 des Handoffs (`regenwasser_HANDOFF.md`). Alle
> Angaben unten sind aus den echten NetCDF-Dateien ausgelesen (nicht geraten).

---

## 1. Datensatz

| Feld | Wert (verifiziert) |
|---|---|
| Produkt | **Extreme Punktniederschläge** — Hydrologischer Atlas der Schweiz, **Sektion B4** |
| Quelle / Institution | MeteoSchweiz (Bundesamt für Meteorologie und Klimatologie) / BAFU |
| Referenz | Fukutome, S., Alouini, S. & Frei, C. (2025). Extreme Point Precipitation. Hydrological Atlas of Switzerland, https://hydromaps.ch, Section B4. |
| Version | **v3.0** (Datei erzeugt 2025-09-17) |
| Format | **NetCDF** (klassisch/NetCDF-3, CF-1.8), **eine Datei pro Dauerstufe** (`…_5minutesum.nc`, `…_10minutesum.nc`, …) |
| Gitter | 370 (E) × 265 (N) = 98'050 Zellen, davon **63'185 gültige Landzellen**; 1-km-Raster |
| Koordinatensystem | CH1903+/LV95 (EPSG:2056); **zusätzlich 2D-Felder `lon`/`lat` in WGS84 pro Zelle** → kein Umbau nötig |
| Wiederkehr-Variablen | `X2, X5, X10, X20, X30, X50, X100, X200, X300` = Wiederkehrwerte T2…T300, **Einheit mm**, `_FillValue = -99.9` |
| Unsicherheit | Dimension `probability = [0.025, 0.5, 0.975]` → Index **1 = zentrale Schätzung** (importiert), Index 0/2 = Konfidenzband p2.5/p97.5 (im Produkt vorhanden, aktuell nicht importiert) |
| Plausibilität | Basel r(5,5): 5min/X5 zentral = **9.90 mm → 0.033 l/(s·m²)** (≈ SN-592000-Stationswert 0.034 ✓) |
| Lizenz | MeteoSchweiz OpenData: freie Weiterverwendung, bei Wiedergabe «**Quelle: MeteoSchweiz**». |

> ⚠️ Den **konkreten** Lizenztext der Produktseite (unter dem Download) bei
> Gelegenheit noch wörtlich hier ergänzen. Weicht er von der allgemeinen
> OGD-Regel ab → melden, nicht selbst entscheiden.

**Werte-Kontrakt** (`nb_gitterpunkt.werte`, jsonb, mm):
`{ "5min": {"T2":..,"T5":..,…,"T300":..}, "10min": {…} }`. Der Extractor bildet
das NetCDF exakt darauf ab. Weitere Dauerstufen (15min…72h) später gleich ergänzbar.

---

## 2. Datenquelle / Netzzugang

Nicht in der geo.admin.ch-**STAC-OGD-API** (dort nur Klima-*Normwerte* und
*Hagel*-Wiederkehrwerte). Bezug über die MeteoSchweiz-Produktseite
«Extremwertanalysen» → Download-Button liefert die `.nc`-Dateien pro Dauerstufe:
<https://www.meteoschweiz.admin.ch/klima/klima-der-schweiz/rekorde-und-extreme/extremwertanalysen.html>

`hydromaps.ch` ist nur die Visualisierung — nicht anzapfen.

---

## 3. Import — so wird der Pool befüllt (einmal pro Version)

**Voraussetzung:** die beiden Dateien `…_5minutesum.nc` und `…_10minutesum.nc`.

**Schritt A — SQL-Migration** (einmalig, im Supabase-SQL-Editor):
`supabase/gema_regenwasser_v1.sql` einfügen → Run. Legt Tabellen, Index,
RLS und die RPC `nb_naechste_punkte` an.

**Schritt B — Extrakt erzeugen** (aus den NetCDF-Dateien → kompakte NDJSON):
```bash
pip install scipy
python scripts/nb_extract.py <5minutesum.nc> <10minutesum.nc> --out nb_b04_v3.ndjson.gz
```
→ `nb_b04_v3.ndjson.gz` (~3.4 MB, 63'185 Gitterpunkte). Der fertige Extrakt für
v3.0 wurde bereits erzeugt und kann alternativ direkt verwendet werden.

**Schritt C — nach Supabase laden** (Service-Key nötig — NUR lokal setzen, nie ins Repo):
```bash
SUPABASE_SERVICE_KEY=eyJ...service... node scripts/nb_import.mjs nb_b04_v3.ndjson.gz
```
Der Importer legt den Datensatz `MCH_B04_v3.0` an, lädt alle Punkte in Batches,
schaltet die Version aktiv und macht am Ende den **Sanity-Check** (nächster Punkt
zu Basel < 710 m). Danach ist die Datenquelle «Punktdaten MeteoSchweiz» im Modul
`sb_niederschlag.html` scharf.

Neue Version später: dieselben Schritte mit den neuen `.nc` — der Importer legt
einen neuen `datensatz_id` an und schaltet ihn aktiv; die alten Zeilen bleiben
liegen (bereits erstellte Bemessungen behalten ihre Grundlage).

---

## 4. Data Model (angelegt, format-verifiziert)

`supabase/gema_regenwasser_v1.sql`: `nb_datensatz` (Versionen) + `nb_gitterpunkt`
(`lon`/`lat` → `geom` via Trigger, GiST-Index über `geography`, `werte` jsonb in
mm) + RLS + RPC `nb_naechste_punkte(lon,lat,limit)`. `hoehe_m` bleibt NULL (im
B04-Produkt nicht enthalten).

## 5. Noch offen

- Lizenztext der Produktseite wörtlich ergänzen (Abschnitt 1).
- Fachliche Norm-Zuordnung Dauerstufe/Wiederkehrperiode je Anwendungsfall
  (Dachentwässerung/Notentwässerung/Retention/Versickerung) nach SN 592000 /
  SIA 271 / VSA — im Modul als `// TODO: fachliche Bestätigung Robin` markiert.
- Optional: Unsicherheitsband (p2.5/p97.5) mitimportieren, wenn im Angebot/PDF gewünscht.
- Optional: weitere Dauerstufen (15min…72h) laden.
- Halbjährlicher Versionscheck-Job (`nb_versionscheck`) — meldet nur, kein Auto-Import.
