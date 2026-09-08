-- GEMA ERP-Migration — Export «10_positionen.jahre»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1017) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT DISTINCT COALESCE(YEAR(o.datum), 0) AS jahr
FROM lvposition p JOIN offerten o ON o.id = p.item_id WHERE p.module_id = 2
UNION
SELECT DISTINCT COALESCE(YEAR(r.datum), 0)
FROM lvposition p JOIN rechnungen r ON r.id = p.item_id WHERE p.module_id = 4
ORDER BY jahr;
