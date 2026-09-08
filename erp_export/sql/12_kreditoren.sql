-- GEMA ERP-Migration — Export «12_kreditoren»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1054) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT k.id, k.nr, k.name1, k.belegnr, k.datum, k.faelligdatum,
       k.betrag, k.mwstbetrag, k.restbetrag, k.kredistatustext,
       k.gkonto, k.kostenst_id, k.iban, k.esr_nr, k.sesam_op_nr, k.bemerkung,
       (SELECT r.rapport_nr FROM kredzut z
          JOIN rapporte r ON r.id = z.rapport_id
         WHERE z.kred_id = k.id ORDER BY z.id LIMIT 1) AS rapport_nr,
       (SELECT COUNT(*) FROM kredzut z WHERE z.kred_id = k.id) AS zuteilungen
FROM kreditoren k;
