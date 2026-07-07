-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Secure v1 — NOTFALL-ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════
-- Stellt den Zustand VOR gema_rls_v1.sql wieder her: RLS aus, damit der
-- anon-Key wieder vollen Zugriff hat (unsicher, aber funktionsfaehig).
-- Die App laeuft danach sofort wieder wie frueher — auch ohne Function.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.gema_data disable row level security;

drop policy if exists gema_auth_select  on public.gema_data;
drop policy if exists gema_auth_insert  on public.gema_data;
drop policy if exists gema_auth_update  on public.gema_data;
drop policy if exists gema_auth_delete  on public.gema_data;

-- Storage: Upload wieder fuer anon erlauben (wie vor Secure v1)
drop policy if exists gema_fotos_upload_auth on storage.objects;
drop policy if exists gema_fotos_upload_anon on storage.objects;
create policy gema_fotos_upload_anon on storage.objects
  for insert to anon, authenticated
  with check ( bucket_id = 'gema-fotos' );
