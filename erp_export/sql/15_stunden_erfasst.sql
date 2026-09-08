-- GEMA ERP-Migration — Export «15_stunden_erfasst»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1267) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name,
       DATE(h.hrs_datetime) AS datum,
       ROUND(h.hrs_length/3600, 2) AS stunden,     -- hrs_length ist in SEKUNDEN
       h.hrs_rapportnr AS rappnr,
       h.hrs_description AS arbtyp, h.hrs_spesen, h.hrs_comment,
       ab.beschr AS absenz,
       h.hrs_terminguid, 'erfasst' AS quelle
FROM hours h
LEFT JOIN arbeiter a  ON a.id  = h.hrs_arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
LEFT JOIN absenz   ab ON ab.id = h.hrs_absenz_id
WHERE COALESCE(h.hrs_deleted,0) = 0 AND h.hrs_length <> 0;
