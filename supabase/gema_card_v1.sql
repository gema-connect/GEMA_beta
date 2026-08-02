-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Card v1 — Kartenprofile, Beteiligte, Kontaktbuch, Meldungen, Events
-- ═══════════════════════════════════════════════════════════════════════
-- AUSFUEHREN: Supabase Dashboard → SQL Editor → dieses Skript einfuegen
-- → Run. Rollback: supabase/gema_card_rollback.sql.
--
-- Referenz: UMSETZUNG_GEMA_Card.md §3. Diese Datei weicht in EINEM Punkt
-- bewusst vom Konzept ab — siehe «Zugriffsmodell» unten.
--
-- ───────────────────────────────────────────────────────────────────────
-- ZUGRIFFSMODELL (WICHTIG — bewusste Abweichung vom Konzept-SQL)
-- ───────────────────────────────────────────────────────────────────────
-- Das Konzept schlug `grant select on card_profiles to anon` vor. Das
-- wuerde die beiden Kern-Sicherheitsregeln des Konzepts selbst brechen:
--
--   Regel 6  «Oeffentlicher Endpoint = harte Feld-Whitelist serverseitig.
--             Niemals select * durchreichen.»
--   §8       «Enumeration: kein Verzeichnis, keine Suche fuer anon.»
--
-- Mit einem anon-SELECT-Grant koennte JEDER im Internet direkt
-- `/rest/v1/card_profiles?select=*` aufrufen und damit
--   • saemtliche Profile auf einmal auslesen (= Verzeichnis, Enumeration
--     ohne Slug-Kenntnis, Rate-Limit der Function komplett umgangen) und
--   • auch die als NICHT oeffentlich markierten Felder sehen
--     (Privatnummer, Privatadresse) — die Feld-Whitelist in
--     card-public.js waere wirkungslos, weil sie einfach umgangen wird.
-- Dasselbe gilt abgeschwaecht fuer `authenticated`: jeder eingeloggte
-- GEMA-Nutzer koennte die Privatfelder aller Karten abziehen.
--
-- Deshalb: KEINE Grants fuer anon/authenticated auf diesen Tabellen. Der
-- gesamte Zugriff laeuft ueber die Netlify-Functions mit dem Service-Key
-- (card-public / card-vcard / card-photo / card-api / card-claim /
-- card-invite / card-report). Das ist exakt das Muster, mit dem GEMA die
-- cred:-Records schuetzt und mit dem rev-share.js / goodel-share.js
-- oeffentliche Einzel-Freigaben ausliefern.
--
-- Folge: RLS ist aktiviert und es gibt bewusst KEINE einzige Policy →
-- ohne Service-Key kommt niemand an die Daten. Das ist fail-closed und
-- braucht spaeter, nach der Supabase-Auth-Migration, nur das Hinzufuegen
-- von auth.uid()-Policies (die Spalten sind dafuer vorbereitet).
--
-- Der Service-Key umgeht zwar RLS, NICHT aber die Tabellen-Privilegien.
-- Seit Mai 2026 erben neue Tabellen im public-Schema die Default-
-- Privilegien nicht mehr zuverlaessig → die service_role-Grants unten
-- sind PFLICHT, sonst antwortet PostgREST mit 401/permission denied.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- 1) Kartenprofile (auch Schattenprofile mit user_id IS NULL)
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.card_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,                       -- NULL = Schattenprofil
  slug          text unique not null,       -- 10 Zeichen base58, random
  display_name  text not null,
  first_name    text,
  last_name     text,
  company       text,
  company_uid   text,                       -- CHE-Nummer aus Zefix
  role_title    text,
  phone         text,
  phone_office  text,
  email         text,
  website       text,
  address       text,
  zip           text,
  city          text,
  photo_path    text,                       -- Storage-Pfad Anzeigebild (512px), NIE Base64
  -- Kleine Zweitfassung (240px, ~15 KB) fuer das PHOTO-Feld der vCard.
  -- GEMA-Functions haben KEINE npm-Dependencies (kein sharp/jimp), es kann
  -- also serverseitig nicht verkleinert werden — beide Fassungen entstehen
  -- beim Upload clientseitig per Canvas (UMSETZUNG_GEMA_Card.md §3 sieht
  -- das Canvas-Resize bereits vor, hier nur mit zwei Zielgroessen).
  photo_vcard_path text,
  fields_public jsonb not null default '{"company":true,"role_title":true,"phone":true,"email":true,"website":false,"address":false}'::jsonb,
  field_origin  jsonb not null default '{}'::jsonb,   -- {"company":"org","phone":"personal"}
  claim_token   text unique,                -- nur bei Schattenprofilen
  claimed_at    timestamptz,
  created_by    text,                       -- User-ID, der das Schattenprofil anlegte
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists card_profiles_user_id_idx on public.card_profiles (user_id);
-- Dedupe-Index: «gleiche Mail = dieselbe Person» (Konzept §6.4/§6.5).
create index if not exists card_profiles_email_idx   on public.card_profiles (lower(email));

-- ───────────────────────────────────────────────────────────────────────
-- 2) Projektbeteiligte
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.project_participants (
  project_id  text not null,
  profile_id  uuid not null references public.card_profiles(id) on delete cascade,
  role        text not null,                       -- architekt|bauherr|pl|monteur|lieferant|planer|sonstige
  status      text not null default 'invited',     -- invited|active|removed
  org_id      text,                                -- Org des einladenden Projekts (Scoping)
  invited_by  text,
  invited_at  timestamptz not null default now(),
  reminded_at timestamptz,
  primary key (project_id, profile_id)
);
create index if not exists project_participants_profile_idx on public.project_participants (profile_id);

-- ───────────────────────────────────────────────────────────────────────
-- 3) Kontaktbuch (nur GEMA-User)
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.card_contacts (
  owner_user_id text not null,
  profile_id    uuid not null references public.card_profiles(id) on delete cascade,
  note          text,
  created_at    timestamptz not null default now(),
  primary key (owner_user_id, profile_id)
);

-- ───────────────────────────────────────────────────────────────────────
-- 4) Meldungen «Daten nicht aktuell»
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.card_reports (
  id            bigint generated always as identity primary key,
  profile_slug  text not null,
  reason        text not null,   -- firma_gewechselt|nummer_falsch|mail_falsch|person_unbekannt|sonstiges
  detail        text,
  reporter_mail text,            -- optional, fuer Rueckmeldung «wurde aktualisiert»
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists card_reports_slug_idx on public.card_reports (profile_slug) where resolved_at is null;

-- ───────────────────────────────────────────────────────────────────────
-- 5) Events / Funnel  (nDSG: keine IP/UA im Klartext — nur ua_hash)
-- ───────────────────────────────────────────────────────────────────────
create table if not exists public.card_events (
  id           bigint generated always as identity primary key,
  profile_slug text,
  event        text not null,   -- scan|view|vcard|contact_saved|claim_start|claim_done|invite_sent|join_project|report
  project_id   text,
  ref_user     text,
  ua_hash      text,
  created_at   timestamptz not null default now()
);
create index if not exists card_events_slug_idx    on public.card_events (profile_slug, created_at desc);
create index if not exists card_events_created_idx on public.card_events (created_at desc);

-- ───────────────────────────────────────────────────────────────────────
-- 6) RLS: aktiv, aber BEWUSST OHNE Policies → nur der Service-Key kommt
--    heran (siehe Zugriffsmodell oben). Idempotent.
-- ───────────────────────────────────────────────────────────────────────
alter table public.card_profiles       enable row level security;
alter table public.project_participants enable row level security;
alter table public.card_contacts       enable row level security;
alter table public.card_reports        enable row level security;
alter table public.card_events         enable row level security;

-- Falls eine fruehere Fassung dieses Skripts Policies angelegt hat:
drop policy if exists card_profiles_anon_select on public.card_profiles;
drop policy if exists card_profiles_auth_all    on public.card_profiles;
drop policy if exists card_events_anon_insert   on public.card_events;
drop policy if exists card_reports_anon_insert  on public.card_reports;

-- ───────────────────────────────────────────────────────────────────────
-- 7) GRANTs — NUR service_role. anon/authenticated bekommen bewusst NICHTS.
-- ───────────────────────────────────────────────────────────────────────
grant all on public.card_profiles       to service_role;
grant all on public.project_participants to service_role;
grant all on public.card_contacts       to service_role;
grant all on public.card_reports        to service_role;
grant all on public.card_events         to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Sicherheitsnetz: sollte eine frühere Fassung Rechte vergeben haben,
-- werden sie hier wieder entzogen.
revoke all on public.card_profiles        from anon, authenticated;
revoke all on public.project_participants from anon, authenticated;
revoke all on public.card_contacts        from anon, authenticated;
revoke all on public.card_reports         from anon, authenticated;
revoke all on public.card_events          from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────
-- 8) updated_at automatisch nachfuehren (die vCard nutzt es als REV —
--    Adressbuecher erkennen daran die neuere Version).
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.card_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists card_profiles_touch on public.card_profiles;
create trigger card_profiles_touch before update on public.card_profiles
  for each row execute function public.card_touch_updated_at();

-- ───────────────────────────────────────────────────────────────────────
-- 9) Storage-Bucket fuer Profilbilder (privat — Auslieferung ausschliesslich
--    ueber card-photo.js mit dem Service-Key).
--    Falls «duplicate key» erscheint, existiert der Bucket bereits.
-- ───────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('card-photos', 'card-photos', false)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- Pruefen (sollte 5 Tabellen mit rowsecurity = true und 0 Policies zeigen):
--   select tablename, rowsecurity from pg_tables
--     where schemaname='public' and tablename like 'card_%'
--        or schemaname='public' and tablename='project_participants';
--   select tablename, policyname from pg_policies
--     where schemaname='public' and (tablename like 'card_%' or tablename='project_participants');
-- ═══════════════════════════════════════════════════════════════════════
