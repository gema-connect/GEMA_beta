-- GEMA ERP-Migration — Export «16_uebertraege»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1394) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT u.id, u.datum, u.totarbeit, u.totferien, u.ausbezst,
       u.zus_stunden, u.bemerkung,
       TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name
FROM arbueber u
LEFT JOIN arbeiter a  ON a.id  = u.arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
WHERE u.totarbeit IS NOT NULL OR u.totferien IS NOT NULL
ORDER BY arb_name, u.datum;
