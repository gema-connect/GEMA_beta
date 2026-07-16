-- ═══════════════════════════════════════════════════════════════════════
-- GEMA — RLS-Status prüfen (ist gema_rls_v1.sql aktiv?)
-- ═══════════════════════════════════════════════════════════════════════
-- AUSFÜHREN: Supabase-Dashboard → SQL Editor → New query → dieses Skript
-- einfügen → Run. Es ändert NICHTS (nur Lesen). Es erscheinen ZWEI
-- Ergebnis-Tabellen:
--   1) «Verdikt» — eine Zeile pro Prüfung mit ✅/❌/⚠ und Hinweis.
--   2) «Rohdaten» — die tatsächlichen Policies zum Nachschauen.
--
-- WICHTIG: Dieses Skript prüft die Policy-Definitionen (als Admin/Service
-- lesbar). Der endgültige Beweis, dass der öffentliche anon-Key wirklich
-- gesperrt ist, ist der REST-Test aus der Klickanleitung
-- (ANLEITUNG_Pilot_Sicherheit.md, Abschnitt A2). Beide zusammen = sicher.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) VERDIKT ──────────────────────────────────────────────────────────
with meta as (
  select
    exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'gema_data') as exists_tbl,
    (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'gema_data') as rls_on
),
pol as (
  select policyname, cmd, roles, coalesce(qual,'') as qual, coalesce(with_check,'') as wc
  from pg_policies where schemaname = 'public' and tablename = 'gema_data'
),
spol as (
  select policyname, cmd, roles
  from pg_policies where schemaname = 'storage' and tablename = 'objects'
),
checks as (
  select 0 as ord,
    'Tabelle public.gema_data existiert' as pruefung,
    case when (select exists_tbl from meta) then 'JA ✅' else 'NEIN ❌' end as ergebnis,
    'muss JA sein' as soll,
    case when (select exists_tbl from meta) then 'ok'
         else 'Falsches Projekt? gema_data nicht gefunden.' end as hinweis

  union all
  select 1,
    'RLS auf gema_data aktiv',
    case when (select rls_on from meta) then 'JA ✅' else 'NEIN ❌' end,
    'muss JA sein',
    case when (select rls_on from meta) then 'ok'
         else '⛔ DB ist OHNE LOGIN les-/löschbar → gema_rls_v1.sql SOFORT ausführen!' end

  union all
  select 2,
    'v1-Policies vorhanden (select/insert/update/delete)',
    (select count(*)::text from pol
       where policyname in ('gema_auth_select','gema_auth_insert','gema_auth_update','gema_auth_delete'))
      || ' / 4',
    '4 / 4',
    case when (select count(*) from pol
                 where policyname in ('gema_auth_select','gema_auth_insert','gema_auth_update','gema_auth_delete')) = 4
         then 'ok' else 'gema_rls_v1.sql fehlt oder ist nur teilweise eingespielt' end

  union all
  select 3,
    'Keine anon/public-Policy auf gema_data',
    case when exists (select 1 from pol where roles && array['anon','public']::name[])
         then 'GEFUNDEN ❌' else 'keine ✅' end,
    'keine',
    case when exists (select 1 from pol where roles && array['anon','public']::name[])
         then '⛔ Policy für anon/public gefunden → anon-Key hätte Zugriff. Entfernen!'
         else 'ok (nur authenticated)' end

  union all
  select 4,
    'Passwort-Hashes geschützt (cred:-Ausschluss im SELECT)',
    case when exists (select 1 from pol where cmd in ('SELECT','ALL') and qual ilike '%cred:%')
         then 'JA ✅' else 'PRÜFEN ⚠' end,
    'SELECT schliesst cred: aus',
    case when exists (select 1 from pol where cmd in ('SELECT','ALL') and qual ilike '%cred:%')
         then 'ok' else 'SELECT-Policy sollte "data_key not like cred:%" enthalten' end

  union all
  select 5,
    'Storage: Upload nur für authenticated',
    case when exists (select 1 from spol where policyname = 'gema_fotos_upload_auth')
         then 'JA ✅' else 'FEHLT ⚠' end,
    'Policy gema_fotos_upload_auth',
    case when exists (select 1 from spol where policyname = 'gema_fotos_upload_auth')
         then 'ok' else 'Storage-Teil von gema_rls_v1.sql noch nicht eingespielt' end

  union all
  select 6,
    'Storage: kein anon-Schreibzugriff (Upload/Update/Delete)',
    case when exists (select 1 from spol
                        where roles && array['anon','public']::name[]
                          and cmd in ('INSERT','UPDATE','DELETE','ALL'))
         then 'anon SCHREIBT ❌' else 'keine ✅' end,
    'nur Lesen für anon',
    case when exists (select 1 from spol
                        where roles && array['anon','public']::name[]
                          and cmd in ('INSERT','UPDATE','DELETE','ALL'))
         then '⛔ anon kann Dateien hochladen/ändern → alte anon-Upload-Policy entfernen'
         else 'ok (anon nur lesen)' end

  union all
  select 7,
    'v2 Org-Scoping aktiv? (nur Info — optional)',
    case when exists (select 1 from pol where (qual || wc) ilike '%jwt%')
         then 'JA (v2 aktiv)' else 'nein (nur v1)' end,
    'optional',
    'nein = v1 aktiv (ok). ja = per-Org-Scoping bereits eingespielt.'
)
select
  pruefung   as "Prüfung",
  ergebnis   as "Ergebnis",
  soll       as "Soll",
  hinweis    as "Hinweis / nächster Schritt"
from checks
order by ord;

-- ── 2) ROHDATEN (die tatsächlichen Policies zum Nachschauen) ────────────
select
  schemaname || '.' || tablename as "Tabelle",
  policyname                     as "Policy",
  cmd                            as "Für",
  roles                          as "Rollen",
  coalesce(qual,'')              as "USING (Lesen/Bedingung)",
  coalesce(with_check,'')        as "WITH CHECK (Schreiben)"
from pg_policies
where (schemaname = 'public'  and tablename = 'gema_data')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
