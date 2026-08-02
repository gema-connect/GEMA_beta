-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Card — Kontrolle NACH gema_card_v1.sql
-- ═══════════════════════════════════════════════════════════════════════
-- AUSFÜHREN: Supabase-Dashboard → SQL Editor → New query → dieses Skript
-- einfügen → Run. Es ändert NICHTS (nur Lesen).
--
-- Erwartet: 4 Zeilen, alle mit «ok». Jede andere Meldung zeigt genau, was
-- fehlt bzw. falsch konfiguriert ist.
-- ═══════════════════════════════════════════════════════════════════════

with tab as (
  select unnest(array['card_profiles','project_participants','card_contacts',
                      'card_reports','card_events']) as t
)
select
  '1 · Tabellen (5 Stück, RLS aktiv)'                as pruefung,
  case when count(*) filter (where c.relname is null) > 0
         then 'FEHLT: ' || string_agg(tab.t, ', ') filter (where c.relname is null)
       when count(*) filter (where not c.relrowsecurity) > 0
         then 'RLS AUS bei: ' || string_agg(tab.t, ', ') filter (where not c.relrowsecurity)
       else 'ok — alle 5 vorhanden, RLS aktiv' end   as ergebnis
from tab
left join pg_class c on c.relname = tab.t
     and c.relnamespace = 'public'::regnamespace

union all
-- Es darf KEINE Policy geben: der Zugriff läuft ausschliesslich über die
-- Netlify-Functions mit dem Service-Key. Eine Policy hier wäre ein Leck.
select '2 · Policies (müssen 0 sein)',
       case when count(*) = 0 then 'ok — keine'
            else 'ACHTUNG: ' || count(*) || ' Policy(s) vorhanden' end
from pg_policies
where schemaname = 'public'
  and (tablename like 'card_%' or tablename = 'project_participants')

union all
select '3 · Bilder-Bucket card-photos',
       case when not exists (select 1 from storage.buckets where id = 'card-photos')
              then 'FEHLT — siehe CLAUDE.md, Abschnitt «GEMA Card», Fallback-Anleitung'
            when (select public from storage.buckets where id = 'card-photos')
              then 'ACHTUNG: ist ÖFFENTLICH — muss privat sein'
            else 'ok — privat' end

union all
select '4 · Rechte für service_role',
       case when count(*) >= 5 then 'ok — ' || count(*) || ' Tabellen'
            else 'unvollständig: nur ' || count(*) || ' von 5' end
from information_schema.role_table_grants
where grantee = 'service_role' and table_schema = 'public'
  and privilege_type = 'SELECT'
  and (table_name like 'card_%' or table_name = 'project_participants')

order by 1;
