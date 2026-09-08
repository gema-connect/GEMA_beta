-- GEMA ERP-Migration — Export «07_offerten»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 888) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT o.id, o.offert_nr, o.datum, o.rdatum, o.betrmemo,
       st.typ_text AS status_text, ty.typ_text AS offerttyp_text,
       o.obetrag, o.mwstbetrag, o.tostunden,
       o.knummer AS kundennummer, o.name1, o.korr_name, o.anschrift, o.banrede,
       o.strasse, o.strasse2, o.plz, o.ort, o.egid, o.egrid,
       o.zahlbedid, o.bemerkung, o.wohnung, o.wohn_standort,
       o.extref2 AS ref2, o.lkdir AS ordner, o.lkmobiledir AS ordner_kat,
       ab.name1 AS abt_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name
FROM offerten o
LEFT JOIN offstatus st ON st.id = o.status
LEFT JOIN offtyp    ty ON ty.id = o.offerttyp
LEFT JOIN abt       ab ON ab.id = o.abt_id
LEFT JOIN arbeiter  sa ON sa.id = o.sachb_id  LEFT JOIN adressen sad ON sad.id = sa.adr_id;
