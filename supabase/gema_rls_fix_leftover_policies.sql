-- ═══════════════════════════════════════════════════════════════════════
-- GEMA — Alt-Policies entfernen, die die RLS aushebeln (DRINGEND)
-- ═══════════════════════════════════════════════════════════════════════
-- Der RLS-Check (gema_rls_check.sql) hat ergeben: auf public.gema_data
-- liegen NEBEN den v1-Policies zwei alte «alles erlaubt»-Policies
-- (gema_anon_all / gema_auth_all mit USING true). Weil RLS-Policies
-- ODER-verknüpft sind, machen sie die restriktiven v1-Policies WIRKUNGSLOS
-- → der öffentliche anon-Key kann die ganze DB lesen/ändern/löschen.
-- Gleiches beim Storage: alte anon/public-UPLOAD-Policies.
--
-- Dieses Skript LÖSCHT nur diese Alt-Policies. Die v1-Policies
-- (gema_auth_select/insert/update/delete, gema_fotos_upload_auth,
-- öffentliches Lesen von gema-fotos) bleiben unangetastet → danach greift
-- v1 wie vorgesehen: anon kommt an gema_data NICHT mehr heran, eingeloggte
-- User nur nach den v1-Regeln, Storage-Upload nur eingeloggt, Foto-Lesen
-- bleibt öffentlich.
--
-- ⚠️ REIHENFOLGE (sonst sperrst du dich/die App aus):
--   1) ZUERST sicherstellen, dass die gema-auth-Function deployed ist und
--      GEMA_JWT_SECRET + SUPABASE_SERVICE_KEY in Netlify gesetzt sind
--      (Login stellt dann ein JWT aus → eingeloggte User = «authenticated»).
--      Test: einloggen; im Browser localStorage 'gema_session_v1' → hat ein
--      'token'-Feld. Erst wenn das klappt, weiter.
--   2) Dieses Skript ausführen.
--   3) SOFORT die App testen: einloggen, ein Objekt öffnen, etwas speichern.
--   4) gema_rls_check.sql erneut laufen lassen → alles ✅.
--
-- ROLLBACK (falls die App danach klemmt): siehe unten, Abschnitt am Ende.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) gema_data: die «alles erlaubt»-Alt-Policies entfernen ────────────
drop policy if exists gema_anon_all on public.gema_data;   -- anon: ALLES → weg
drop policy if exists gema_auth_all on public.gema_data;   -- authenticated: ALLES → weg (v1 ist strenger & bleibt)

-- ── 2) Storage: alte anon/public-UPLOAD-Policies entfernen ──────────────
--     (Öffentliches LESEN von gema-fotos bleibt bewusst bestehen —
--      Foto-URLs in Berichten/PDFs; die Pfade sind zufällig «unlisted».)
drop policy if exists "GEMA anon upload gema-fotos" on storage.objects;
drop policy if exists "GEMA upload gema-fotos"      on storage.objects;
drop policy if exists "gema-fotos qzkv2s_0"         on storage.objects;

-- ── 3) Kontrolle: was bleibt übrig? ─────────────────────────────────────
-- Erwartung public.gema_data: NUR noch gema_auth_select/insert/update/delete
-- Erwartung storage.objects (gema-fotos): gema_fotos_upload_auth (INSERT,
--   authenticated) + öffentliche SELECT-Policies. KEINE anon/public INSERT.
select
  schemaname || '.' || tablename as "Tabelle",
  policyname                     as "Policy",
  cmd                            as "Für",
  roles                          as "Rollen"
from pg_policies
where (schemaname = 'public'  and tablename = 'gema_data')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (NUR im Notfall, wenn nach dem Löschen nichts mehr lädt —
-- z.B. weil ein Client-Pfad doch noch den anon-Key statt des JWT nutzt).
-- Stellt den vorherigen (unsicheren!) Zustand für gema_data wieder her,
-- damit die App sofort wieder läuft, während du die Ursache suchst:
--
--   create policy gema_anon_all on public.gema_data
--     for all to anon using (true) with check (true);
--
-- Danach die Ursache beheben (Login muss ein JWT liefern) und dieses
-- Fix-Skript erneut ausführen. Die Storage-Upload-Policies NICHT
-- wiederherstellen (anon-Upload ist nie nötig).
-- ═══════════════════════════════════════════════════════════════════════
