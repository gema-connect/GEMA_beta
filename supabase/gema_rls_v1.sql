-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Secure v1 — Row Level Security fuer gema_data + Storage
-- ═══════════════════════════════════════════════════════════════════════
-- AUSFUEHREN: Supabase Dashboard → SQL Editor → dieses Skript einfuegen
-- → Run. VORHER die Netlify Function deployen und Env-Variablen setzen
-- (Reihenfolge siehe SECURITY_RLS_ANLEITUNG.md) — sonst sperrt ihr euch
-- aus. Rollback: supabase/gema_rls_rollback.sql.
--
-- Wirkung:
--  • anon-Key (im Frontend sichtbar) kann NICHTS mehr lesen oder
--    schreiben — es gibt keine anon-Policies.
--  • Eingeloggte User (JWT aus der gema-auth-Function, role=authenticated)
--    lesen alles AUSSER cred:-Records (Passwort-Hashes) und schreiben
--    alle Modul-Daten — aber NICHT die Auth-Collection (user:/org:/role:).
--  • Auth-Collection-Writes laufen ausschliesslich ueber die Netlify
--    Function (Service-Key, umgeht RLS, prueft Berechtigungen serverseitig).
--  • cred:-Records: keine einzige Policy → nur der Service-Key kommt heran.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) RLS aktivieren (ab jetzt gilt: keine Policy = kein Zugriff)
alter table public.gema_data enable row level security;

-- Idempotenz: alte Versionen dieser Policies entfernen
drop policy if exists gema_auth_select  on public.gema_data;
drop policy if exists gema_auth_insert  on public.gema_data;
drop policy if exists gema_auth_update  on public.gema_data;
drop policy if exists gema_auth_delete  on public.gema_data;

-- 2) Lesen: eingeloggte User sehen alles ausser Zugangsdaten (cred:)
create policy gema_auth_select on public.gema_data
  for select to authenticated
  using ( data_key not like 'cred:%' );

-- 3) Schreiben: Modul-Daten ja, Auth-Collection (module_key='auth') nein.
--    (user:/org:/role:/cred: schreibt nur die gema-auth-Function mit dem
--    Service-Key — der Service-Key umgeht RLS per Definition.)
create policy gema_auth_insert on public.gema_data
  for insert to authenticated
  with check ( module_key <> 'auth' and data_key not like 'cred:%' );

create policy gema_auth_update on public.gema_data
  for update to authenticated
  using      ( module_key <> 'auth' and data_key not like 'cred:%' )
  with check ( module_key <> 'auth' and data_key not like 'cred:%' );

create policy gema_auth_delete on public.gema_data
  for delete to authenticated
  using ( module_key <> 'auth' and data_key not like 'cred:%' );

-- ═══════════════════════════════════════════════════════════════════════
-- 4) Storage-Bucket gema-fotos: Upload nur noch fuer eingeloggte User.
--    Oeffentliches LESEN bleibt (Foto-URLs in Berichten/PDFs) — die Pfade
--    sind zufaellig («unlisted»). Wer auch das Lesen einschraenken will:
--    Bucket auf «private» stellen und signierte URLs verwenden (Stufe 2).
-- ═══════════════════════════════════════════════════════════════════════
-- Bestehende anon-Upload-Policies auf dem Bucket entfernen. Die Namen
-- koennen abweichen — alle INSERT-Policies fuer anon auf storage.objects
-- anzeigen lassen:
--   select policyname from pg_policies
--    where schemaname='storage' and tablename='objects';
-- und die eigene anon-INSERT-Policy hier eintragen:
-- drop policy if exists "<name der bisherigen anon insert policy>" on storage.objects;

drop policy if exists gema_fotos_upload_auth on storage.objects;
create policy gema_fotos_upload_auth on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'gema-fotos' );

-- Oeffentliches Lesen sicherstellen (falls der Bucket «public» ist, ist
-- das bereits gegeben; diese Policy schadet nicht):
drop policy if exists gema_fotos_read_public on storage.objects;
create policy gema_fotos_read_public on storage.objects
  for select to anon, authenticated
  using ( bucket_id = 'gema-fotos' );
