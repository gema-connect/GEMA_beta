#!/usr/bin/env python3
"""
nb_extract.py — B04-NetCDF (MeteoSchweiz «Extreme Punktniederschläge») → NDJSON.gz

Liest die pro Dauerstufe gelieferten NetCDF-Dateien der HADES-Sektion B4
(«Extreme point precipitation», Fukutome/Alouini/Frei 2025) und schreibt eine
kompakte, zeilenweise JSON-Datei mit einem Gitterpunkt pro Zeile — Eingabe für
scripts/nb_import.mjs (Supabase-Import).

Format je Zeile:
  {"lon":..,"lat":..,"x":<E lv95>,"y":<N lv95>,
   "werte":{"5min":{"T2":mm,..,"T300":mm},"10min":{...}}}
Einheit: mm (Niederschlagshoehe). Zentrale Schätzung (probability index 1 = 0.5).

Quelle: MeteoSchweiz — Extreme Punktniederschläge (HADES B4). Bei Weitergabe:
«Quelle: MeteoSchweiz».

Nutzung:
  pip install scipy
  python nb_extract.py <5min.nc> <10min.nc> [--out nb_b04_v3.ndjson.gz]

Die Dauerstufen-Zuordnung ist auf 5min/10min ausgelegt (die vom GEMA-Modul
sb_niederschlag genutzten r5.*/r10.*-Werte). Weitere Dauerstufen später ergänzbar.
"""
import sys, json, gzip, argparse
import numpy as np
from scipy.io import netcdf_file

FILL = -99.9
CENTRAL = 1          # probability = [0.025, 0.5, 0.975] → Index 1 = zentraler Wert
RETURN_PERIODS = [2, 5, 10, 20, 30, 50, 100, 200, 300]

def load_central(path):
    f = netcdf_file(path, 'r', mmap=False)
    lon = f.variables['lon'][:]; lat = f.variables['lat'][:]
    E = f.variables['E'][:]; N = f.variables['N'][:]
    bands = {t: f.variables['X%d' % t][0][CENTRAL] for t in RETURN_PERIODS}
    return f, lon, lat, E, N, bands

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('nc5'); ap.add_argument('nc10')
    ap.add_argument('--out', default='nb_b04_v3.ndjson.gz')
    a = ap.parse_args()

    f5, lon, lat, E, N, d5 = load_central(a.nc5)
    f10, lon2, lat2, E2, N2, d10 = load_central(a.nc10)
    assert lon.shape == lon2.shape, 'Gitter der beiden Dateien stimmt nicht ueberein'
    Nn, Ne = lon.shape
    valid = (d5[5] != FILL) & np.isfinite(d5[5]) & np.isfinite(lon) & np.isfinite(lat)

    cnt = 0
    with gzip.open(a.out, 'wt', encoding='utf-8') as out:
        for n in range(Nn):
            for e in range(Ne):
                if not valid[n, e]:
                    continue
                w = {
                    "5min":  {("T%d" % t): round(float(d5[t][n, e]), 2)  for t in RETURN_PERIODS},
                    "10min": {("T%d" % t): round(float(d10[t][n, e]), 2) for t in RETURN_PERIODS},
                }
                rec = {"lon": round(float(lon[n, e]), 4), "lat": round(float(lat[n, e]), 4),
                       "x": int(round(float(E[e]))), "y": int(round(float(N[n]))), "werte": w}
                out.write(json.dumps(rec, separators=(',', ':'), ensure_ascii=False) + "\n")
                cnt += 1
    f5.close(); f10.close()
    print("geschrieben: %s — %d Gitterpunkte" % (a.out, cnt))

if __name__ == '__main__':
    main()
