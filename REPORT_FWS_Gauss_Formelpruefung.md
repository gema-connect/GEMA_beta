# Formelprüfung «Warmwasser_FWS_nach_Gauss.xlsx» + Integrationsentscheid

**Datum:** 2026-07-07 · **Geprüfte Vorlage:** `Warmwasser_FWS_nach_Gauss.xlsx` (8 Blätter, Beispiel 50 Whg à 60 m²)
**Ergebnis:** Methodik grundsätzlich sauber, aber **4 echte Fehler / tote Eingaben** und mehrere Schwächen —
darunter eine **Unterdimensionierung bei grossen Gebäuden** (ab ca. 150 Wohnungen). Details unten.

---

## 1 · Entscheid: Integration ins bestehende FWS-Modul (kein separates Modul)

Die Gauss-Berechnung wurde als **Abschnitt «5 · Statistische Bemessung nach Gauss (Duschprofil)»**
in `sa_frischwasserstation.html` integriert (per Toggle aktivierbar, Default aus). Die bisherige
Leistungs-Sektion wurde zu Abschnitt 6. Begründung:

- **Kernprinzip «Daten einmal erfassen»**: Wohnungen (Abschnitt 2, neu mit Fläche ANF),
  Mischstrom pro Dusche, Mischkreuz (T_WW/T_KW/T_Misch) und Zusatzlasten (Gastro/Spez,
  Abschnitte 3+4) existieren im Modul bereits — die Gauss-Methode konsumiert sie direkt,
  nichts wird doppelt erfasst.
- **Gleiche Zielgrösse, gleiches Bauteil**: Beide Methoden liefern den sekundärseitigen
  Spitzenvolumenstrom + die FWS-Leistung. Zwei Module hiessen zwei Anlagenwahl-/Offertanfrage-Flows
  für dieselbe Produktkategorie `frischwasserstation`.
- **Die Vorlage selbst** deklariert sich als «Statistische Plausibilisierung, keine Normbemessung
  nach SVGW/SIA» (Blatt 08) — also Ergänzung/Gegenprobe zur empirischen Methode, kein Ersatz.
- **Methodenvergleich auf einer Seite** ist der eigentliche Mehrwert: Die Gauss-Sektion zeigt die
  Differenz zur empirischen Bemessung an; per «→ Als gewählten Volumenstrom übernehmen» fliesst
  das Gauss-Ergebnis in Abschnitt 6 (dort gilt weiterhin max(berechnet, gewählt)).

---

## 2 · Methodik der Vorlage (geprüft, korrekt)

| Baustein | Formel | Befund |
|---|---|---|
| Personen nach SIA | `nP = (3.3 − 2/(1+(ANF/100)³))·nWhg` | ✓ korrekt, identisch mit sb_warmwasser/hz_heizlast |
| Tagesprofil | 4 Gauss-Glocken `w·exp(−0.5·((t−c)/σ)²)`, normiert auf Duschvorgänge/Tag | ✓ Normierung korrekt |
| Aktive Duschen | gleitende Summe der Duschstarts über die Duschdauer → λ(t) | ✓ methodisch sauber (Mₜ/D/∞-Warteschlange: aktive Duschen ~ Poisson(λ)) |
| Mischkreuz | `fWW = (T_Misch−T_KW)/(T_WW−T_KW)`, `qWW = qMisch·fWW` | ✓ korrekt |
| FWS-Leistung | `P = q·4.186·ΔT/60` [kW] | ✓ einheitenrichtig (1 l ≈ 1 kg) |
| Primärvolumenstrom | `qPrim = P·60/(4.186·ΔT_prim)` | ✓ korrekt |
| Pufferspitzen | `E = q·t·1.163·ΔT/1000` [kWh] | ✓ korrekt (1.163 Wh/kg·K) |
| Poisson-Schwellwerte | IF-Treppen in Spalten J/K | Schwellwerte selbst = exakte Quantil-Übergänge (nachgerechnet: 0.3554→0.36, 0.8177→0.82, 1.3663→1.37 …), **aber Zuordnung verschoben, siehe F3** |
| Quellen | REUWS/WRF v2 (0.69 Duschen/P·d), SVES/gfs 2024 (7.7 min), MaP Time-of-Day | plausibel dokumentiert |

---

## 3 · Fehler und Befunde

### F1 — `#NAME?`-Fehler in 01_Eingaben (kosmetisch)
`F13` (`=((T_Dusche-T_KW)/(T_WW-T_KW))`) und `F14` (`=qMisch×fWW60`) sind als Formeln erfasste
Dokumentations-Texte → werten zu `#NAME?` aus. Ohne Einfluss aufs Ergebnis.

### F2 — «Bemessungsquantil» (C15 = 0.95) ist ein toter Input (echter Fehler)
Der Eingabewert wird **nirgends referenziert**. Blatt 04 nimmt `MAX(q95; q99; qMindest; qMix)` —
da q99 ≥ q95 immer gilt, entscheidet faktisch **immer das 99-%-Quantil**, egal was eingegeben wird.
**GEMA-Fix:** Quantil ist wählbar (95/99 %) und wirksam; Default 99 % (repliziert das
Vorlage-Verhalten).

### F3 — Poisson-Treppen liefern Quantil + 1 (systematisch, dokumentationswidrig)
Die IF-Treppen geben durchgängig **einen Wert mehr** als das exakte Poisson-Quantil zurück
(Bandgrenzen = exakte Übergangspunkte, Zuordnung um eins verschoben; zusätzlich Untergrenze 2 Duschen).
Beispiel der Vorlage: λ = 1.49 → exaktes 99-%-Quantil = **5** Duschen, Vorlage liefert **6** (→ 32 statt
26.7 l/min, +20 %). Entspricht der Lesart «P(X **≥** k) ≤ 1 %» statt der üblichen «P(X **>** k) ≤ 1 %» —
vertretbar als Sicherheitsphilosophie, aber nicht als «Poisson 95 %/99 %» beschriftet und **kumuliert
mit Reservefaktor 1.1 und Mindestgleichzeitigkeit** zu Dreifach-Marge.
**GEMA-Fix:** exaktes Quantil implementiert; Select «Sicherheitszuschlag: Quantil + 1 Dusche (wie
Vorlage) | exaktes Quantil», Default = wie Vorlage → Out-of-the-box identische Ergebnisse.

### F4 — Treppen-Kappung bei 9/10 Duschen → Unterdimensionierung bei grossen Gebäuden (kritisch)
Die IF-Treppen enden bei 9 (95 %) bzw. 10 (99 %) Duschen. Ab λ ≈ 4.7 liegt das echte Quantil darüber:

| λ (Spitze) | ≈ Gebäudegrösse (à 60 m²) | exakt q95 | Vorlage | exakt q99 | Vorlage |
|---|---|---|---|---|---|
| 4.0 | ~135 Whg | 8 | 9 ✓ | 9 | 10 ✓ |
| 6.0 | ~200 Whg | 10 | **9 ⚠** | 12 | **10 ⚠** |
| 8.0 | ~270 Whg | 13 | **9 ⚠** | 15 | **10 ⚠** |
| 10.0 | ~335 Whg | 15 | **9 ⚠** | 18 | **10 ⚠** |

Bei 270 Wohnungen fehlen der Vorlage 5 von 15 Duschen (−33 % Volumenstrom) — nur die
Mindestgleichzeitigkeit (Whg/10 = 27 Duschen) rettet das Ergebnis dort zufällig.
**GEMA-Fix:** exakte Quantilberechnung ohne Kappung, gültig für beliebige Gebäudegrössen.

### F5 — «Duschdauer» (C8 = 7.7 min) ist ebenfalls ein toter Input (echter Fehler)
Das Aktiv-Fenster der gleitenden Summe ist **hart als 8 Zellen** kodiert (`SUM(H416:H423)`).
Ändert man die Duschdauer auf z.B. 12 min, ändert sich **nichts** am Ergebnis.
**GEMA-Fix:** Fenster = round(Duschdauer), dynamisch.

### F6 — Tagesrand-Effekte (gering)
(a) Das gleitende Fenster ist am Tagesanfang abgeschnitten (Zeile 3 summiert 1 Zelle statt 8) —
eine um 23:58 gestartete Dusche «verschwindet» um 00:00. (b) Die Nacht-Glocke (Zentrum 01:00,
σ 70 min) verliert ihren Vor-Mitternacht-Ast. **GEMA:** (a) korrigiert (Fenster läuft zirkulär über
Mitternacht — reiner Rechenartefakt); (b) bewusst wie Vorlage belassen (Modellentscheid des
Erstellers, Gewichte werden ohnehin normiert). Auswirkung auf die Bemessung: keine (Spitze liegt am Morgen).

### F7 — Intervallvergleich (Blatt 06) ist keine Berechnung
Die Werte für 5/15/60 min sind **fixe Faktoren** (×0.98/×0.92/×0.86) auf den 1-min-Wert — keine
echte Glättung des Profils. **GEMA-Fix:** echte gleitende Mittelwerte über das Tagesprofil
(beim Beispiel: 7.93/7.93/7.91/7.62 statt 7.93/7.78/7.30/6.82 — die Vorlage überzeichnet die Glättung).

### F8 — Temperatur-Inkonsistenz im Zapfstellenmix (Blatt 03)
Der Mix rechnet WW-Anteile mit **T_WW = 60 °C** (Zeilenwerte), die Hauptberechnung mit
**T_WW = 55 °C** (C12). Dusch- und Mix-Volumenströme werden dann auf unterschiedlicher
Temperaturbasis verglichen (`MAX(...)`). In GEMA entfällt das: Zusatzlasten kommen aus den
Abschnitten 3+4 auf einheitlicher Stationsbasis.

### F9 — Kleinigkeiten (ohne Ergebnis-Einfluss)
cp-Inkonsistenz 4.186 vs. 1.163 (=4.1868/3.6, Differenz 0.02 %); `SUM(B27:F33)`/`SUM(J27:O33)`
laufen über leere Spalten; Personenformel liefert bei fehlender Fläche 1.3 P/Whg (GEMA warnt in
diesem Fall explizit und bietet den Personen-Override).

---

## 4 · Validierung

- **Node-Test gegen Excel-Cached-Werte (29/29 bestanden):** Personenformel, alle 1440
  Profilzeilen (Gewichte, Duschstarts exakt; aktive Duschen ab Minute 7 exakt — Minuten 0–6 weichen
  wegen des zirkulären Fensters bewusst ab), Poisson-Treppen J/K über alle 1440 Zeilen (identisch
  ausser in den Rundungslücken der auf 2 Dezimalen gerundeten Excel-Schwellwerte — dort ist GEMA
  exakter), komplettes Blatt 04 (λmax, Quantile, Bemessung 35.2 l/min, Leistung 110.5104 kW),
  Blatt 05 (Primärvolumenstrom 63.36 l/min, alle 6 Pufferspitzen), Zapfstellenmix-Formel.
- **Playwright-Browser-Test (19/19 bestanden):** Excel-Beispiel im UI nachgestellt →
  identische Ergebnisse (35.2 l/min · 110.5 kW · 63.4 l/min), Umschalten auf exaktes Quantil
  (29.3 l/min), Übernehmen-Button, Chart-Rendering, Toggle, keine JS-Fehler.

## 5 · Umsetzung in GEMA (Kurzreferenz)

- `sa_frischwasserstation.html`: neuer Abschnitt 5 (Toggle), Engine im
  `/*ENGINE-START*/…/*ENGINE-END*/`-Block (DOM-frei, Node-testbar), Canvas-Tagesprofil,
  Puffer-/Intervalltabellen; Abschnitt 2 neu mit Spalten «Fläche ANF» + «Personen (SIA)».
- Anlagenwahl-Payload: `zapfleistung` nutzt jetzt den **massgebenden** Volumenstrom
  (inkl. Override/Gauss) statt nur des empirischen Totals — vorher floss der Override in die
  Leistung, aber nicht in die Zapfleistung ein (Inkonsistenz behoben).
- Defaults = Vorlage (0.69 · 7.7 min · Quantil 99 % · +1 Dusche · Reserve 1.1 · Whg/10 ·
  Profil 0.55/420/60, 0.18/720/90, 0.22/1200/70, 0.05/60/70).
