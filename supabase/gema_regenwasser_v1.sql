-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Regenwasser / Starkniederschlag v1 — PostGIS-Datenpool
-- ═══════════════════════════════════════════════════════════════════════
-- AUSFUEHREN: Supabase Dashboard → SQL Editor → dieses Skript einfuegen →
-- Run. Danach den Importer laufen lassen (fuellt nb_gitterpunkt) und den
-- Ziel-Datensatz auf aktiv=true setzen. Rollback:
-- supabase/gema_regenwasser_rollback.sql.
--
-- Grundlage: HANDOFF regenwasser_HANDOFF.md (Abschnitte 2 + 3).
-- Datenquelle: MeteoSchweiz, Karte B04 «Extreme Punktniederschläge»
-- (1-km-Raster, 10 Dauerstufen, mehrere Wiederkehrperioden, mit
-- Unsicherheitsangaben). Einheit der Werte: mm (Niederschlagshoehe) —
-- NICHT l/(s·ha). Die Umrechnung passiert erst in der Berechnung.
--
-- Format-unabhaengig: der Importer mappt das Quellformat (NetCDF/GeoTIFF/
-- CSV) auf die jsonb-Spalten werte/unsicherheit — diese Migration legt nur
-- die Struktur an und ist damit unabhaengig vom noch zu verifizierenden
-- Quellformat (siehe regenwasser_QUELLE.md).
--
-- HINWEIS RLS: Wie alle GEMA-Policies aktuell qual=true (Daten sind
-- oeffentlich). Echte Durchsetzung greift erst nach der Supabase-Auth-
-- Migration (Phase 2, siehe SECURITY_RLS_ANLEITUNG.md).
-- ═══════════════════════════════════════════════════════════════════════

-- 0) PostGIS
create extension if not exists postgis with schema extensions;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Tabellen
-- ═══════════════════════════════════════════════════════════════════════

-- Versionsverwaltung des Datensatzes. Eine neue MeteoSchweiz-Version =
-- neuer Datensatz (neue id), alte Zeilen bleiben liegen → bereits
-- erstellte Bemessungen behalten ihre Grundlage (siehe HANDOFF Abschnitt 6).
create table if not exists public.nb_datensatz (
  id            text primary key,          -- z.B. 'MCH_B04_2026'
  quelle        text not null,             -- 'MeteoSchweiz'
  bezeichnung   text not null,             -- 'Extreme Punktniederschläge (Karte B04)'
  version       text,
  veroeffentlicht date,
  download_url  text not null,
  etag          text,                      -- fuer den Versionsvergleich (HEAD)
  pruefsumme    text,                      -- SHA-256 der Quelldatei
  lizenz        text not null,
  importiert_am timestamptz not null default now(),
  aktiv         boolean not null default false
);

comment on table public.nb_datensatz is
  'Versionierte Starkniederschlags-Datensaetze (MeteoSchweiz B04). Genau ein Datensatz sollte aktiv=true sein.';

-- Gitterpunkte, ein Datensatz pro Punkt pro Version (~63'000 Punkte pro Version).
-- Der Import liefert lon/lat (WGS84, aus den 2D-lon/lat-Feldern des B04-NetCDF);
-- geom wird per Trigger daraus gebaut (kein Geometrie-Handling im Importer nötig).
create table if not exists public.nb_gitterpunkt (
  id           bigserial primary key,
  datensatz_id text not null references public.nb_datensatz(id) on delete cascade,
  lon          numeric not null,           -- WGS84 Laenge (E)
  lat          numeric not null,           -- WGS84 Breite (N)
  geom         geometry(Point, 4326),      -- per Trigger aus lon/lat
  x_lv95       numeric,                    -- Ost (LV95 / EPSG:2056)
  y_lv95       numeric,                    -- Nord (LV95 / EPSG:2056)
  hoehe_m      integer,                    -- im B04-Produkt nicht enthalten → NULL
  werte        jsonb not null,             -- { "5min": {"T2":..,"T5":..}, "10min": {...} } in mm
  unsicherheit jsonb                       -- optional, gleiche Struktur, je Kombi {"p2_5":..,"p97_5":..}
);

comment on column public.nb_gitterpunkt.werte is
  'Niederschlagshoehe in mm je Dauerstufe/Wiederkehrperiode. Umrechnung in Regenspende erst in der Berechnung: r[l/(s·ha)] = h[mm] × 10000 / t[s].';

-- geom aus lon/lat setzen (search_path deckt beide PostGIS-Schema-Platzierungen ab).
create or replace function public.nb_set_geom() returns trigger
  language plpgsql
  set search_path = public, extensions
as $$
begin
  new.geom := st_setsrid(st_makepoint(new.lon, new.lat), 4326);
  return new;
end;
$$;

drop trigger if exists nb_geom_trg on public.nb_gitterpunkt;
create trigger nb_geom_trg before insert or update of lon, lat
  on public.nb_gitterpunkt for each row execute function public.nb_set_geom();

-- Geograpie-Index fuer die Nearest-Neighbour-Suche (<-> Operator).
create index if not exists nb_gitterpunkt_geom_idx
  on public.nb_gitterpunkt using gist ((geom::geography));
create index if not exists nb_gitterpunkt_datensatz_idx
  on public.nb_gitterpunkt (datensatz_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 2) GRANTs (seit Supabase-Aenderung 05/2026 zwingend, sonst ueber
--    PostgREST/supabase-js unerreichbar). Nur Lesen — geschrieben wird
--    ausschliesslich ueber den Import mit der Service-Role.
-- ═══════════════════════════════════════════════════════════════════════
grant select on public.nb_datensatz   to anon, authenticated;
grant select on public.nb_gitterpunkt to anon, authenticated;
grant usage, select on sequence public.nb_gitterpunkt_id_seq to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) RLS (vorerst qual=true — Daten sind oeffentlich; echte Durchsetzung
--    erst nach der Auth-Migration Phase 2)
-- ═══════════════════════════════════════════════════════════════════════
alter table public.nb_datensatz   enable row level security;
alter table public.nb_gitterpunkt enable row level security;

drop policy if exists nb_datensatz_read   on public.nb_datensatz;
drop policy if exists nb_gitterpunkt_read  on public.nb_gitterpunkt;

create policy nb_datensatz_read on public.nb_datensatz
  for select using (true);
create policy nb_gitterpunkt_read on public.nb_gitterpunkt
  for select using (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 4) RPC: die drei (bis zehn) naechstgelegenen Gitterpunkte zu einer
--    WGS84-Koordinate. SECURITY DEFINER wie beim Inspirationskatalog.
--    Nutzt den GiST-Index ueber den <-> Operator → wenige ms bei ~60k
--    Punkten.
--
--    SANITY-CHECK nach dem Import (HANDOFF Abschnitt 3): in einem
--    1-km-Raster darf der naechste Punkt nie weiter als ~710 m (halbe
--    Diagonale) entfernt sein. Ist er es doch, stimmt die
--    Koordinatentransformation im Importer nicht.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.nb_naechste_punkte(
  p_lon numeric,
  p_lat numeric,
  p_limit integer default 3
)
returns table (
  gitterpunkt_id bigint,
  distanz_m      numeric,
  x_lv95         numeric,
  y_lv95         numeric,
  hoehe_m        integer,
  werte          jsonb,
  unsicherheit   jsonb,
  datensatz_id   text
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    g.id,
    round(st_distance(
      g.geom::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    )::numeric, 1),
    g.x_lv95, g.y_lv95, g.hoehe_m, g.werte, g.unsicherheit, g.datensatz_id
  from public.nb_gitterpunkt g
  join public.nb_datensatz d on d.id = g.datensatz_id
  where d.aktiv = true
  order by g.geom::geography <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
  limit least(greatest(p_limit, 1), 10);
$$;

grant execute on function public.nb_naechste_punkte(numeric, numeric, integer)
  to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Fertig. Naechste Schritte:
--   1. Importer (Format-Weiche netcdf/geotiff/csv) fuellt nb_gitterpunkt.
--   2. Ziel-Datensatz auf aktiv=true setzen (genau einen):
--        update public.nb_datensatz set aktiv=false;
--        update public.nb_datensatz set aktiv=true where id='MCH_B04_2026';
--   3. Sanity-Check (20 Zufallsadressen quer durch die Schweiz):
--        select distanz_m from public.nb_naechste_punkte(7.59, 47.57, 1); -- Basel < 710 m
-- ═══════════════════════════════════════════════════════════════════════
