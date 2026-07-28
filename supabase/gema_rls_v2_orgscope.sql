-- ═══════════════════════════════════════════════════════════════════════
-- GEMA Secure v2 — Per-Org-Scoping fuer eindeutig org-eigene Collections
-- ═══════════════════════════════════════════════════════════════════════
-- Baut auf gema_rls_v1.sql auf (Review-Befund S1). v1 laesst jeden
-- eingeloggten User JEDE Modul-Zeile JEDER Organisation lesen, aendern
-- UND loeschen (z.B. «alle ERP-Daten aller Firmen loeschen»). v2 scopt
-- die unten gelisteten, eindeutig EINER Org gehoerenden Collections auf
-- die Org des JWT (`auth.jwt()->>'org'`) — fuer SELECT, INSERT, UPDATE
-- und DELETE.
--
-- ⚠️  NICHT BLIND AUSFUEHREN. Diese Migration ist bewusst konservativ:
--     sie aendert das Verhalten NUR fuer die Collections in `_orgscoped`
--     (alle anderen bleiben exakt wie in v1 — kein Regressionsrisiko).
--     Trotzdem gilt: die org-gescopten Collections MUESSEN einer Org
--     gehoeren UND duerfen KEINEN legitimen org-uebergreifenden Zugriff
--     haben. Vor dem Ausfuehren:
--       1) Schritt 0 (Audit) laufen lassen — findet Records OHNE orgId
--          (die wuerden nach dem Scoping unsichtbar) und listet die
--          Org-Verteilung. Bei null-orgId-Treffern ZUERST bereinigen.
--       2) Mit ZWEI Test-Orgs pruefen: Org A darf Records von Org B in
--          den gescopten Collections NICHT mehr sehen/aendern/loeschen;
--          eigene Org unveraendert nutzbar.
--     Rollback: supabase/gema_rls_v2_rollback.sql (stellt v1 wieder her).
--
-- BEWUSST NICHT gescopt (bleiben org-uebergreifend — dokumentierte
-- Cross-Org-Flows, ein Scoping wuerde sie brechen):
--   auth              – user:/org:/role: (Writes nur via Service-Function),
--                       cred: hat gar keine Policy
--   chat, notify      – teilnehmer-/empfaenger-basiert ueber Orgs hinweg
--   produktkatalog    – Lieferanten fuer alle Planer sichtbar
--   ausschreibung     – Planer↔Unternehmer↔Lieferant↔Architekt (ownerOrgId)
--   bestellungen      – Besteller-Org ↔ Lieferant-Org
--   werkzeugmanagement, fahrzeugmanagement, trocknungsgeraete
--                     – externe Pruefer/Lieferanten/Garagisten (cross-org)
--   schule            – Klassen org-uebergreifend
--   armaturen         – geteilter Katalog
--   revisionsunterlagen – Unterlagen-Anfragen an fremde Lieferanten
--   planablage        – Freigaben an externe Beteiligte (E-Mail-Match)
--   aktivitaetslog    – Fremd-Org-Logging durch externe Partner
--   abos, favoriten   – abo admin-weit / favoriten pro User (kein orgId)
--   objekte           – Gastzugang liest fremde Org-Objekte (getGastOrgs)
--   regierapport      – Architekt/BH-Freigeber liest/schreibt cross-org
--   abnahme           – digitale Freigabe + Monteur-Mängelliste cross-org
--   immobilien        – Handwerker-Aufträge cross-org (handwerker.userId)
--   legionellen       – Labor/Sanierer als externe Partner (E-Mail-Match)
--   terminplan        – Blob-Storage pro Objekt, KEIN orgId im payload
--   spuelmanager, service – konservativ ausgelassen (Cross-Modul-Writes)
-- Diese wandern spaeter hinter feinere Policies (uid-Containment) bzw.
-- Service-Key-Functions — separater Schritt, NICHT hier.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Schritt 0: PRE-FLIGHT-AUDIT (nur lesen, aendert nichts) ─────────────
-- (a) Records OHNE orgId in den zu scopenden Collections → nach dem
--     Scoping unsichtbar. MUSS leer sein, sonst zuerst bereinigen:
--
--   select module_key, count(*) as ohne_orgid
--     from public.gema_data
--    where module_key in ('erp','schadensbericht','dachbericht','plaene',
--          'behoerden_formulare','einsatzplan','stundenerfassung',
--          'arbeitskleider','goodel','schnellausschreibung')
--      and data_key not like 'cred:%'
--      and coalesce(payload->'data'->>'orgId','') = ''
--    group by module_key;
--
-- (b) Org-Verteilung zur Kontrolle:
--   select module_key, payload->'data'->>'orgId' as org, count(*)
--     from public.gema_data
--    where module_key in ('erp','schadensbericht','dachbericht','plaene',
--          'behoerden_formulare','einsatzplan','stundenerfassung',
--          'arbeitskleider','goodel','schnellausschreibung')
--    group by 1,2 order by 1,2;
--
-- (c) BEREINIGUNG von orgId-losen Altbestaenden (Praxisfall 28.07.2026):
--     sd_schadensbericht schrieb Records bis 07/2026 OHNE orgId-Feld —
--     unter v2 ist so ein Record unsichtbar UND jeder Write darauf wird
--     mit 403 «row-level security» abgelehnt. Die App stempelt seither
--     selbst nach (sdSaveNew/_sdStampOrg + RLS-Heilung in gema_sync);
--     bereits in der Cloud liegende orgId-lose Rows brauchen EINMALIG
--     diesen Stempel (Ziel-Org einsetzen — bei einer Ein-Firmen-
--     Installation die einzige echte Org):
--
--   update public.gema_data
--      set payload = jsonb_set(payload, '{data,orgId}', to_jsonb('org_XXX'::text), true)
--    where module_key in ('erp','schadensbericht','dachbericht','plaene',
--          'behoerden_formulare','einsatzplan','stundenerfassung',
--          'arbeitskleider','goodel','schnellausschreibung')
--      and data_key not like 'cred:%'
--      and coalesce(payload->'data'->>'orgId','') = '';

-- ── Schritt 1: v1-Policies durch org-bewusste v2-Policies ersetzen ──────
-- (RLS bleibt aktiv; die Namen sind dieselben wie in v1 → sauberer Ersatz.)

drop policy if exists gema_auth_select on public.gema_data;
drop policy if exists gema_auth_insert on public.gema_data;
drop policy if exists gema_auth_update on public.gema_data;
drop policy if exists gema_auth_delete on public.gema_data;

-- Hilfsausdruck: eine Collection ist NUR dann org-gescopt, wenn ihr
-- module_key in der Liste steht. Sonst gilt die breite v1-Regel weiter.
-- (Postgres hat kein "constant array" in Policies → die Liste steht
--  inline in jeder Policy; beim Aendern ALLE VIER anpassen.)

create policy gema_auth_select on public.gema_data
  for select to authenticated
  using (
    data_key not like 'cred:%'
    and (
      module_key <> all (array['erp','schadensbericht','dachbericht','plaene',
        'behoerden_formulare','einsatzplan','stundenerfassung','arbeitskleider',
        'goodel','schnellausschreibung'])
      or payload->'data'->>'orgId' = auth.jwt()->>'org'
    )
  );

create policy gema_auth_insert on public.gema_data
  for insert to authenticated
  with check (
    module_key <> 'auth' and data_key not like 'cred:%'
    and (
      module_key <> all (array['erp','schadensbericht','dachbericht','plaene',
        'behoerden_formulare','einsatzplan','stundenerfassung','arbeitskleider',
        'goodel','schnellausschreibung'])
      or payload->'data'->>'orgId' = auth.jwt()->>'org'
    )
  );

create policy gema_auth_update on public.gema_data
  for update to authenticated
  using (
    module_key <> 'auth' and data_key not like 'cred:%'
    and (
      module_key <> all (array['erp','schadensbericht','dachbericht','plaene',
        'behoerden_formulare','einsatzplan','stundenerfassung','arbeitskleider',
        'goodel','schnellausschreibung'])
      or payload->'data'->>'orgId' = auth.jwt()->>'org'
    )
  )
  with check (
    module_key <> 'auth' and data_key not like 'cred:%'
    and (
      module_key <> all (array['erp','schadensbericht','dachbericht','plaene',
        'behoerden_formulare','einsatzplan','stundenerfassung','arbeitskleider',
        'goodel','schnellausschreibung'])
      or payload->'data'->>'orgId' = auth.jwt()->>'org'
    )
  );

create policy gema_auth_delete on public.gema_data
  for delete to authenticated
  using (
    module_key <> 'auth' and data_key not like 'cred:%'
    and (
      module_key <> all (array['erp','schadensbericht','dachbericht','plaene',
        'behoerden_formulare','einsatzplan','stundenerfassung','arbeitskleider',
        'goodel','schnellausschreibung'])
      or payload->'data'->>'orgId' = auth.jwt()->>'org'
    )
  );

-- ── Schritt 2: VERIFIKATION (nach dem Ausfuehren, mit zwei Test-Orgs) ───
-- Als User von Org A (echtes App-Login → JWT):
--   • eigene ERP-Dokumente lesen/anlegen/aendern  → muss gehen
--   • ein ERP-Dokument von Org B per REST lesen    → 0 Zeilen
--   • ein ERP-Dokument von Org B loeschen (DELETE) → 0 rows / Fehler
--   • Cross-Org-Module (Chat/Ausschreibung/Bestellung/Lieferant-Sicht)
--     unveraendert nutzbar (nicht gescopt).
-- Bei Problemen sofort Rollback (gema_rls_v2_rollback.sql).
