-- GEMA ERP-Migration — Export «04_objekte»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 873) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT o.id, o.strasse, o.strasse2, o.plz, o.ort, o.egid, o.egrid,
       o.knummer, o.co_knummer, o.ei_knummer, o.korr_name,
       o.objekt1, o.objekt2, o.objmemo AS notiz,
       o.extref1 AS ref1, o.extref2 AS ref2, o.lkdir AS ordner,
       TRIM(CONCAT(COALESCE(mad.vorname,''),' ',COALESCE(mad.name1,''))) AS monteur_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name
FROM obj o
LEFT JOIN arbeiter ma ON ma.id = o.monteur_id  LEFT JOIN adressen mad ON mad.id = ma.adr_id
LEFT JOIN arbeiter sa ON sa.id = o.sachb_id    LEFT JOIN adressen sad ON sad.id = sa.adr_id;
