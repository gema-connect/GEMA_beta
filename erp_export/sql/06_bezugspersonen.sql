-- GEMA ERP-Migration — Export «06_bezugspersonen»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1333) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT o.id AS obj_id, o.strasse, o.plz, o.ort,
       z.zuhanden, z.vorname, z.tel1, z.natel, z.email,
       c.wohnung, c.bemerkungen, k.kriterium
FROM contact c
JOIN obj    o ON o.id = c.item_id AND c.module_id = 1
JOIN zuhand z ON z.id = c.zuhand_id
LEFT JOIN contactkrit ck ON ck.contact_id = c.autoid
LEFT JOIN krit        k  ON k.id = ck.krit_id
ORDER BY o.id;
