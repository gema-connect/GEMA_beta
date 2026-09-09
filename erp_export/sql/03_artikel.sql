-- GEMA ERP-Migration — Export «03_artikel»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 982) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT c.text AS katalog, a.guid, a.artref, a.text, a.unit, a.price, a.dim,
       a.mat_price, a.einkaufs_rabatt, a.verschnitt, a.leitfaden_zeit, a.ansatz
FROM abarticle a
LEFT JOIN abchapter c ON c.guid = a.chapterguid
ORDER BY c.text, a.sort;
