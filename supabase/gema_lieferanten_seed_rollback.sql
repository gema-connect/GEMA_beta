-- Rollback für gema_lieferanten_seed_v1.sql — entfernt NUR die Seed-Records
-- (erkennbar an den festen ID-Präfixen lief_seed_/prod_seed_/arm_seed_).
delete from public.gema_data where module_key = 'produktkatalog' and (data_key like 'lieferant:lief_seed_%' or data_key like 'produkt:prod_seed_%');
delete from public.gema_data where module_key = 'armaturen' and data_key like 'arm:arm_seed_%';
