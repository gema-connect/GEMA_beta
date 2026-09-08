-- GEMA ERP-Migration — Export «10_positionen»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 990) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT 2 AS module_id, o.offert_nr AS nr, p.autoid AS sort, p.postyp,
       p.SPos, p.text, p.qty, p.unit, p.price, p.total, p.dim,
       p.SChapter, p.sbuchnr,
       p.leitfaden_zeit, p.zeit_faktor, p.ansatz,
       p.mat_price, p.mat_faktor, p.einkaufs_rabatt, p.verschnitt
FROM lvposition p JOIN offerten o ON o.id = p.item_id
WHERE p.module_id = 2 AND COALESCE(YEAR(o.datum), 0) = {{JAHR}}
UNION ALL
SELECT 4, r.nr, p.autoid, p.postyp,
       p.SPos, p.text, p.qty, p.unit, p.price, p.total, p.dim,
       p.SChapter, p.sbuchnr,
       p.leitfaden_zeit, p.zeit_faktor, p.ansatz,
       p.mat_price, p.mat_faktor, p.einkaufs_rabatt, p.verschnitt
FROM lvposition p JOIN rechnungen r ON r.id = p.item_id
WHERE p.module_id = 4 AND COALESCE(YEAR(r.datum), 0) = {{JAHR}}
ORDER BY module_id, nr, sort;
