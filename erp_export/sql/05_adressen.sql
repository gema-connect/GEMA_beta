-- GEMA ERP-Migration — Export «05_adressen»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1085) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT a.id AS knummer, a.oknummer AS kundennr_alt,
       a.name1 AS firma, a.anrede, a.vorname,
       a.name2 AS nachname, a.zuhand AS kontakt,
       a.strasse, a.strasse2, a.plz, a.ort, a.land,
       a.tel1 AS telefon, a.natel, a.email, a.bemerkungen,
       COALESCE(NULLIF(cz.cmd_string,''), NULLIF(a.zahlbedid,'')) AS zahlbedid,
       a.stdrabatt, a.stdskonto,
       COALESCE(NULLIF(cp.cmd_string,''), NULLIF(a.pk_debi,''))   AS pk_debi,
       a.pk_kredi, a.eBillID, a.Rechnung_Email, a.lkdir AS ordner
FROM adressen a
LEFT JOIN companydata cz ON cz.cmd_tablename = 'adressen' AND cz.cmd_item_id = a.id AND cz.cmd_fieldname = 'zahlbedid'
LEFT JOIN companydata cp ON cp.cmd_tablename = 'adressen' AND cp.cmd_item_id = a.id AND cp.cmd_fieldname = 'pk_debi';
