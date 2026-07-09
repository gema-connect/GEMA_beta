-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Regenwasser / Starkniederschlag v1 — ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- Entfernt den PostGIS-Datenpool aus gema_regenwasser_v1.sql vollstaendig.
-- ACHTUNG: loescht alle importierten Gitterpunkte + Datensatz-Versionen.
-- Die PostGIS-Extension bleibt (koennte von anderen Objekten genutzt sein).
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.nb_naechste_punkte(numeric, numeric, integer);
-- Trigger geht mit der Tabelle; die Trigger-Funktion separat entfernen:
drop function if exists public.nb_set_geom();

drop policy if exists nb_gitterpunkt_read on public.nb_gitterpunkt;
drop policy if exists nb_datensatz_read   on public.nb_datensatz;

-- nb_gitterpunkt zuerst (FK auf nb_datensatz)
drop table if exists public.nb_gitterpunkt;
drop table if exists public.nb_datensatz;

-- Hinweis: 'drop extension if exists postgis' hier bewusst NICHT — die
-- Extension kann von anderen Tabellen/Funktionen gebraucht werden.
