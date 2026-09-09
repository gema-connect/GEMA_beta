# GEMA – ERP-Migration: Export aus der LOKALEN KOPIE des Altsystems (OF 4000, MySQL 5.7)
#
# Erzeugt je Abfrage in .\sql\ eine Tab-getrennte UTF-8-Datei (.tsv) für den
# Import-Assistenten in pm_erp («Migration», Knopf «Dateien wählen» – alle
# .tsv auf einmal). Der Assistent erkennt den Abschnitt am Dateinamen und
# sortiert selbst in die richtige Reihenfolge.
#
# Liest NUR. Läuft gegen die Kopie unter $Data (Ordner Data + bin vom Server
# kopiert), nie gegen den Live-Server. Der Server wird auf 127.0.0.1:$Port
# gestartet und am Ende wieder beendet.
#
# Aufruf (PowerShell, im Ordner erp_export):
#     powershell -ExecutionPolicy Bypass -File .\export.ps1
# Optional:  -Bin 'C:\OF_SQLDaten\bin' -Data 'C:\OF_SQLDaten\Data' -Out 'D:\gema_export'
#
# Die SQL-Dateien sind GENERIERT (node scripts/erp_export_gen.mjs) aus dem
# Konzept KONZEPT_ERP_Migration_Altsystem.md, Kapitel 8 – dort stehen die
# Herleitungen. Abfragen mit dem Platzhalter {{JAHR}} laufen je Jahr (die
# Jahresliste liefert die gleichnamige .jahre.sql), damit keine Datei den
# Browser überfordert.
#
# -PositionenAb 2023  exportiert Positionen nur für Belege ab diesem Jahr
# (ältere Belege behalten im Import ihre Sammelposition mit dem Betrag —
# Konzept Kapitel 10: das Volumen im Browser hängt fast nur an den
# Positionen). Ohne Angabe: alle Jahre.
param(
  [string]$Bin  = 'C:\OF_SQLDaten\bin',
  [string]$Data = 'C:\OF_SQLDaten\Data',
  [string]$Db   = 'dbof',
  [int]$Port    = 3307,
  [int]$PositionenAb = 0,
  [string]$Out  = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'gema_export')
)
$ErrorActionPreference = 'Stop'
$sqlDir = Join-Path $PSScriptRoot 'sql'
if (-not (Test-Path $sqlDir)) { throw "Ordner fehlt: $sqlDir (SQL-Dateien mit node scripts/erp_export_gen.mjs erzeugen)" }
foreach ($exe in 'mysqld.exe','mysql.exe','mysqladmin.exe') {
  if (-not (Test-Path (Join-Path $Bin $exe))) { throw "Nicht gefunden: $(Join-Path $Bin $exe) – Parameter -Bin prüfen" }
}
if (-not (Test-Path $Data)) { throw "Datenordner fehlt: $Data – Parameter -Data prüfen" }
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$mysqld = Join-Path $Bin 'mysqld.exe'
$mysql  = Join-Path $Bin 'mysql.exe'
$admin  = Join-Path $Bin 'mysqladmin.exe'
$log    = Join-Path $Out '_protokoll.txt'
$utf8   = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($log, "GEMA-Export $(Get-Date -Format 'yyyy-MM-dd HH:mm')  Kopie: $Data`r`n", $utf8)
function Protokoll([string]$zeile) {
  Write-Host $zeile
  [System.IO.File]::AppendAllText($log, $zeile + "`r`n", $utf8)
}

# ── 1) Server auf der Kopie starten ─────────────────────────────────────
$srvArgs = @("--datadir=$Data", "--port=$Port", '--bind-address=127.0.0.1', '--skip-grant-tables', '--console', '--innodb_page_size=32768')
$srv = Start-Process $mysqld -PassThru -NoNewWindow -ArgumentList $srvArgs -RedirectStandardError (Join-Path $Out '_mysqld.log')
$bereit = $false
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep 2
  & $admin -h 127.0.0.1 -P $Port -u root ping *> $null
  if ($LASTEXITCODE -eq 0) { $bereit = $true; break }
}
if (-not $bereit) {
  if (-not $srv.HasExited) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
  throw "mysqld antwortet nicht auf Port $Port – siehe $(Join-Path $Out '_mysqld.log')"
}
Protokoll "Server läuft (PID $($srv.Id))."

# ── 2) Eine Abfrage → eine Datei ────────────────────────────────────────
# Die Umleitung läuft über cmd.exe, damit die Bytes von mysql.exe UNVERÄNDERT
# in die Datei gehen (UTF-8 ohne BOM). Über die PowerShell-Pipeline würde die
# Ausgabe erst mit der Konsolen-Codepage dekodiert und dann neu kodiert –
# Umlaute wären Glückssache. --batch: Tab-getrennt, Kopfzeile, NULL als Wort,
# Sonderzeichen escapt – genau das, was der Importer bei .tsv erwartet.
$ergebnis = @()
function Abfrage([string]$sqlFile, [string]$outFile, [string]$anzeige) {
  $errFile = "$outFile.err"
  $cmd = "`"$mysql`" --batch --default-character-set=utf8 -h 127.0.0.1 -P $Port -u root $Db < `"$sqlFile`" > `"$outFile`" 2> `"$errFile`""
  & cmd.exe /c $cmd
  $code = $LASTEXITCODE
  $zeilen = 0
  if (Test-Path $outFile) {
    $n = 0
    foreach ($z in [System.IO.File]::ReadLines($outFile)) { $n++ }
    $zeilen = [Math]::Max(0, $n - 1)   # Kopfzeile abziehen
  }
  $fehler = ''
  if (Test-Path $errFile) {
    $fehler = ([System.IO.File]::ReadAllText($errFile)).Trim()
    if ($fehler -eq '') { Remove-Item $errFile -ErrorAction SilentlyContinue }
  }
  $groesse = 0
  if (Test-Path $outFile) { $groesse = (Get-Item $outFile).Length }
  $status = 'ok'
  if ($code -ne 0 -or $fehler -ne '') { $status = 'FEHLER' }
  elseif ($zeilen -eq 0) { $status = 'leer' }
  $script:ergebnis += [pscustomobject]@{ Datei = $anzeige; Zeilen = $zeilen; MB = [Math]::Round($groesse / 1MB, 1); Status = $status }
  Protokoll ("{0,-34} {1,9:N0} Zeilen {2,7:N1} MB  {3}" -f $anzeige, $zeilen, ($groesse / 1MB), $status)
  if ($fehler -ne '') { Protokoll "    $fehler" }
  if ($status -eq 'leer') { Remove-Item $outFile -ErrorAction SilentlyContinue }
  return $status
}

try {
  $dateien = Get-ChildItem $sqlDir -Filter '*.sql' |
    Where-Object { $_.Name -notlike '*.jahre.sql' -and $_.Name -notlike '_*' } |
    Sort-Object Name
  if ($dateien.Count -eq 0) { throw "Keine SQL-Dateien in $sqlDir" }
  foreach ($f in $dateien) {
    $name = $f.BaseName
    $sql = [System.IO.File]::ReadAllText($f.FullName)
    if ($sql -match '\{\{JAHR\}\}') {
      # Jahresscheiben: erst die Jahresliste, dann je Jahr eine Datei.
      $jf = Join-Path $sqlDir "$name.jahre.sql"
      if (-not (Test-Path $jf)) { throw "Zu $($f.Name) fehlt die Jahresliste $name.jahre.sql" }
      $jt = Join-Path $Out "_$name.jahre.tsv"
      $st = Abfrage $jf $jt "$name (Jahresliste)"
      if ($st -eq 'FEHLER') { continue }
      $jahre = @()
      if (Test-Path $jt) {
        $jahre = [System.IO.File]::ReadLines($jt) | Select-Object -Skip 1 | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' }
        Remove-Item $jt -ErrorAction SilentlyContinue
      }
      if ($jahre.Count -eq 0) { Protokoll "    $name : keine Jahre gefunden – nichts exportiert"; continue }
      if ($PositionenAb -gt 0) {
        $alle = @($jahre)
        $jahre = @($alle | Where-Object { [int]$_ -ge $PositionenAb })
        $weg = @($alle | Where-Object { [int]$_ -lt $PositionenAb })
        Protokoll ("    {0}: -PositionenAb {1} – {2} Jahr(e) exportiert, {3} ausgelassen ({4})" -f $name, $PositionenAb, $jahre.Count, $weg.Count, ($weg -join ', '))
      }
      foreach ($j in $jahre) {
        $tmpSql = Join-Path $Out "_$name.$j.sql"
        [System.IO.File]::WriteAllText($tmpSql, ($sql -replace '\{\{JAHR\}\}', $j), $utf8)
        $suffix = $j
        if ($j -eq '0') { $suffix = 'ohne_datum' }
        Abfrage $tmpSql (Join-Path $Out ("{0}_{1}.tsv" -f $name, $suffix)) ("{0}_{1}" -f $name, $suffix) | Out-Null
        Remove-Item $tmpSql -ErrorAction SilentlyContinue
      }
    } else {
      Abfrage $f.FullName (Join-Path $Out "$name.tsv") $name | Out-Null
    }
  }
}
finally {
  # ── 3) Server wieder beenden ───────────────────────────────────────────
  & $admin -h 127.0.0.1 -P $Port -u root shutdown *> $null
  Start-Sleep 2
  if (-not $srv.HasExited) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
  Protokoll "Server beendet."
}

# ── 4) Zusammenfassung ──────────────────────────────────────────────────
$fehl = @($ergebnis | Where-Object { $_.Status -eq 'FEHLER' })
Protokoll ''
Protokoll ("{0} Dateien in {1}" -f @($ergebnis | Where-Object { $_.Status -eq 'ok' }).Count, $Out)
if ($fehl.Count -gt 0) {
  Protokoll ("{0} Abfrage(n) mit FEHLER – siehe .err-Dateien: {1}" -f $fehl.Count, (($fehl | ForEach-Object { $_.Datei }) -join ', '))
  exit 1
}
Protokoll 'Fertig. Als Nächstes: pm_erp → Migration → alle .tsv-Dateien auf einmal wählen.'
