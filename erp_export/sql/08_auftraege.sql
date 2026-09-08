-- GEMA ERP-Migration — Export «08_auftraege»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 907) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT r.id, r.rapport_nr, r.best_datum, r.betrifft, r.arbeit,
       ast.typ_text AS astatus_text, rst.typ_text AS rstatus_text,
       o.offert_nr, re.nr AS rechnung_nr, r.bemerkung,
       r.name1, r.korr_name, r.anschrift, r.telefon,
       r.strasse, r.strasse2, r.plz, r.ort, r.egid, r.egrid,
       r.schlussel, r.schlu_tel, r.besteller, r.best_tel,
       r.wohnung, r.wohn_standort, r.wohn_tel, r.lkdir AS ordner,
       ab.name1 AS abt_name,
       TRIM(CONCAT(COALESCE(sad.vorname,''),' ',COALESCE(sad.name1,''))) AS sachb_name,
       JSON_OBJECT('nkrnbh',r.nkrnbh,'nkrmat',r.nkrmat,'nkrfaktor',r.nkrfaktor,
                   'nkbez',r.nkbez,'nkofftot',r.nkofftot,'nkoffmat',r.nkoffmat,
                   'nkoffnbh',r.nkoffnbh,'nkoffph',r.nkoffph,'nkfaktor',r.nkfaktor,
                   'nkgewp',r.nkgewp,'nkwstup',r.nkwstup,'nkwmatp',r.nkwmatp,
                   'nkspesen',r.nkspesen) AS nachkalk
FROM rapporte r
LEFT JOIN arbstatus  ast ON ast.id = r.astatus
LEFT JOIN rechstatus rst ON rst.id = r.rstatus
LEFT JOIN offerten   o   ON o.id   = r.offerte_id
LEFT JOIN rechnungen re  ON re.rapport_id = r.id
LEFT JOIN abt        ab  ON ab.id  = r.abt_id
LEFT JOIN arbeiter   sa  ON sa.id  = r.sachb_id  LEFT JOIN adressen sad ON sad.id = sa.adr_id;
