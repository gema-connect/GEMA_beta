-- GEMA ERP-Migration — Export «15_stunden_freigegeben»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1249) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name,
       n.datum, n.stunden, n.rappnr,
       ty.beschr AS arbtyp, ab.beschr AS absenz,
       'freigegeben' AS quelle
FROM nstunden n
LEFT JOIN arbeiter a  ON a.id  = n.arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
LEFT JOIN arbtyp   ty ON ty.id = n.arbtyp
LEFT JOIN absenz   ab ON ab.id = n.absenz
WHERE n.stunden <> 0
ORDER BY n.datum;
