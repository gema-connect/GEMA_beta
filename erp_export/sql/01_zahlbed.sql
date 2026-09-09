-- GEMA ERP-Migration — Export «01_zahlbed»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 974) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT shortcut, description, days_netto, days1, skonto1, fibucode
FROM paymentterm ORDER BY shortcut;
