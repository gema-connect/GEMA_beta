-- GEMA ERP-Migration — Export «14_termine»
-- GENERIERT aus KONZEPT_ERP_Migration_Altsystem.md (Zeile 1137) durch scripts/erp_export_gen.mjs.
-- Nicht von Hand ändern: im Konzept ändern und den Generator laufen lassen.
-- Liest nur. Läuft gegen die lokale Kopie des Altsystems (erp_export/export.ps1).

SELECT t.guid, t.datum, t.von60, t.bis60, t.arbeit,
       ab.beschr AS absenz, ty.beschr AS arbtyp,
       t.stunden, t.location, t.serie_id, t.private_text,
       TRIM(CONCAT(COALESCE(ad.vorname,''),' ',COALESCE(ad.name1,''))) AS arb_name,
       r.rapport_nr
FROM termin t
LEFT JOIN arbeiter a  ON a.id  = t.arb_id
LEFT JOIN adressen ad ON ad.id = a.adr_id
LEFT JOIN rapporte r  ON r.id  = t.rapp_id
LEFT JOIN absenz   ab ON ab.id = t.absenz
LEFT JOIN arbtyp   ty ON ty.id = t.arbtyp
ORDER BY t.datum;
