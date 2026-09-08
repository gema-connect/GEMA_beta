-- GEMA ERP-Migration — Export «02_mitarbeiter»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1530) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT a.id, ad.name1, ad.vorname, a.kuerzel,
       COALESCE(NULLIF(a.email_internal,''), ad.email) AS email,
       ad.tel1, ad.natel, ab.name1 AS abt_name,
       a.monteur+0 AS monteur, a.sachbearb+0 AS sachbearb,
       a.eintritt, a.austritt,
       NULLIF(COALESCE(a.sollmo,0)+COALESCE(a.solldi,0)+COALESCE(a.sollmi,0)
         +COALESCE(a.solldo,0)+COALESCE(a.sollfr,0), 0) AS wochensoll,
       a.ferien AS ferientage, a.ansatz1
FROM arbeiter a
LEFT JOIN adressen ad ON ad.id = a.adr_id
LEFT JOIN abt      ab ON ab.id = a.abt_id
ORDER BY ad.name1, ad.vorname;
