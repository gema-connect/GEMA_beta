-- GEMA ERP-Migration — Export «13_anlagen»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1192) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT k.id AS kom_id, k.kom_name, k.kom_sernr, k.kom_standort,
       k.kom_inst_datum, k.kom_garantie,
       k.kom_last_rev, k.kom_next_rev, k.kom_rev_int, k.kom_rev_toleranz,
       k.kom_calc_with_basis, k.kom_rev_basis, k.kom_rev_kosten,
       s.ser_app_fabrikaservapp, s.ser_app_typ, s.ser_vertragsnr,
       s.ser_strasse, s.ser_plz, s.ser_ort, s.ser_bemerkungen,
       ak.app_beschr AS kategorie, ab.name1 AS abt_name
FROM komponenten k
LEFT JOIN services s  ON s.id  = k.kom_ser_id
LEFT JOIN appkat   ak ON ak.id = s.ser_kat_id
LEFT JOIN abt      ab ON ab.id = s.ser_abt_id
WHERE COALESCE(s.ser_storniert,0) = 0
ORDER BY k.kom_next_rev;
