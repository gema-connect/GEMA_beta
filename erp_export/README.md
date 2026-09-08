# Export-Paket — Altsystem OF 4000 → GEMA

Erzeugt aus der **lokalen Kopie** der Altdatenbank (MySQL 5.7, Ordner `Data`
und `bin` vom Server kopiert) je Abschnitt eine Datei für den Import-Assistenten
in `pm_erp` («Migration»). Liest nur, fasst den Live-Server nie an.

## Ablauf

1. Ordner `erp_export` auf den Windows-Rechner mit der Kopie holen.
2. PowerShell öffnen, in den Ordner wechseln:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\export.ps1
   ```
   Optional: `-Bin`, `-Data`, `-Out` (Standard `C:\OF_SQLDaten\bin`,
   `C:\OF_SQLDaten\Data`, `Desktop\gema_export`) und **`-PositionenAb 2023`**
   (Positionen nur für Belege ab diesem Jahr — siehe Konzept, Kapitel 10).
3. Ergebnis: `gema_export\NN_<abschnitt>.tsv` je Abfrage, Positionen je Jahr
   (`10_positionen_2024.tsv`, …), dazu `_protokoll.txt` mit Zeilenzahl und
   Status je Datei. Fehler stehen in `<datei>.err`.
4. In GEMA: `pm_erp` → Tab «Migration» → **alle `.tsv` auf einmal** wählen.
   Der Assistent erkennt den Abschnitt am Dateinamen und importiert in der
   richtigen Reihenfolge. Ein Wiederholungslauf ergänzt nur, was fehlt.

## Was die Dateien sind

- `mysql --batch`: Tab-getrennt, Kopfzeile, UTF-8 ohne BOM. `NULL` steht als
  Wort, Tab/Zeilenumbruch/Backslash sind als `\t` `\n` `\\` escapt — der
  Importer wandelt beides zurück (nur bei Endung `.tsv`).
- Die Umleitung läuft über `cmd.exe`, damit die Bytes unverändert in die Datei
  gehen (über die PowerShell-Pipeline wären Umlaute Glückssache).

## Die SQL-Dateien sind generiert

`sql/*.sql` entstehen mit `node scripts/erp_export_gen.mjs` aus den markierten
Blöcken (`<!-- export: NN_abschnitt -->`) in `KONZEPT_ERP_Migration_Altsystem.md`,
Kapitel 8 — dort stehen Herleitung und Fallen. **Nicht von Hand ändern.**
Der Guard `node scripts/erp_export_test.mjs` prüft, dass das Generat aktuell
ist und jede Spalte jeder Abfrage vom Importer einem Feld zugeordnet wird.

## Datenschutz

Die Dateien enthalten Kunden-, Adress- und Personaldaten. Sie gehören nie ins
Repo (`.gitignore`), nur auf das Gerät, das importiert; nach dem Import
löschen. Aus `arbeiter` wird nur exportiert, was GEMA braucht (Name, Kürzel,
Abteilung, Ansatz) — keine AHV-Nummer, kein Lohn, keine Bankdaten.
