-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Secure v2 — ROLLBACK auf v1 (Org-Scoping zuruecknehmen)
-- ═══════════════════════════════════════════════════════════════════════
-- Stellt die breiten v1-Policies wieder her (RLS BLEIBT aktiv, anon bleibt
-- ausgesperrt). Nutzen, falls das Org-Scoping aus gema_rls_v2_orgscope.sql
-- eine legitime Nutzung blockiert. NICHT gema_rls_rollback.sql verwenden —
-- das schaltet RLS komplett ab (unsicher).
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists gema_auth_select on public.gema_data;
drop policy if exists gema_auth_insert on public.gema_data;
drop policy if exists gema_auth_update on public.gema_data;
drop policy if exists gema_auth_delete on public.gema_data;

-- v1 wiederherstellen (identisch zu gema_rls_v1.sql, Schritt 2/3):
create policy gema_auth_select on public.gema_data
  for select to authenticated
  using ( data_key not like 'cred:%' );

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
