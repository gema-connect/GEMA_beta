-- GEMA ERP-Migration — Export «09_rechnungen»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 940) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT r.id, r.nr, r.rapport_nr, r.datum, r.betrifft, r.arbeit,
       ty.typ_text  AS typ_text,
       ast.typ_text AS astatus_text,
       ds.typ_text  AS debistatus_text,
       r.rbetrag, r.mwstbetrag,
       r.name1, r.korr_name, r.anschrift, r.adr_id,
       r.strasse, r.strasse2, r.plz, r.ort, r.egid, r.egrid,
       r.zahlbedid, r.ausgef, r.belegnr, r.opdebi, r.faelligdatum,
       r.bemerkung, r.wohnung, r.besteller, r.wohn_standort,
       r.post_info_date AS postinfodate, r.print_info AS printinfo,
       r.kostenst_id AS kostenstid, r.extref1, r.extref2, r.lkdir AS ordner,
       ab.name1 AS abt_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name
FROM rechnungen r
LEFT JOIN rechtyp     ty  ON ty.id  = r.typ
LEFT JOIN rechastatus ast ON ast.id = r.astatus
LEFT JOIN debistatus  ds  ON ds.id  = r.debistatus
LEFT JOIN abt         ab  ON ab.id  = r.abt_id
LEFT JOIN arbeiter    sa  ON sa.id  = r.sachb_id  LEFT JOIN adressen sad ON sad.id = sa.adr_id;
