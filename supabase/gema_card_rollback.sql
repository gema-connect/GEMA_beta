-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu supabase/gema_card_v1.sql (GEMA Card)
-- ═══════════════════════════════════════════════════════════════════════
-- ACHTUNG: loescht ALLE Kartenprofile, Beteiligten-Zuordnungen,
-- Kontaktbuch-Eintraege, Meldungen und Events UNWIDERRUFLICH.
-- Vorher exportieren, falls die Daten gebraucht werden:
--   select * from public.card_profiles;
--
-- Der Storage-Bucket «card-photos» wird bewusst NICHT geloescht (er
-- koennte noch Bilder enthalten). Manuell im Dashboard entfernen, falls
-- gewuenscht: Storage → card-photos → Delete bucket.
-- ═══════════════════════════════════════════════════════════════════════

drop trigger  if exists card_profiles_touch on public.card_profiles;
drop function if exists public.card_touch_updated_at();

-- Reihenfolge wegen der Fremdschluessel auf card_profiles
drop table if exists public.card_events;
drop table if exists public.card_reports;
drop table if exists public.card_contacts;
drop table if exists public.project_participants;
drop table if exists public.card_profiles;
