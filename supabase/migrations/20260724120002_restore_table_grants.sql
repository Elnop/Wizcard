-- Restore explicit table-level grants for anon/authenticated.
--
-- Contexte : plusieurs tables ne recevaient leurs privilèges que via la default
-- ACL du bootstrap Supabase (`alter default privileges … grant all on tables to
-- anon, authenticated`). Une base dont la default ACL a dérivé (rôles recréés,
-- restore partiel) crée donc des tables SANS `SELECT`, et PostgREST répond
-- 42501 « permission denied for table … » alors que les policies RLS existent
-- et sont correctes.
--
-- Les tables plus récentes (decks, card_prints, card_sets, catalogue…) ne sont
-- pas touchées parce que leur migration d'origine grantait explicitement. On
-- aligne ici les tables historiques pour que le schéma soit auto-suffisant et
-- ne dépende plus d'un état implicite du cluster.
--
-- SÉCURITÉ : le privilège table n'ouvre aucune donnée par lui-même — RLS est
-- actif (relrowsecurity = true) sur les 6 tables et les policies SELECT sont
-- déjà en place. Le grant ne fait que permettre à PostgREST d'atteindre la
-- table ; c'est la policy qui filtre les lignes.
--
-- Idempotent : `grant` est un no-op si le privilège est déjà présent.

-- 1. Tables lues par le propriétaire connecté et/ou le public via RLS.
grant select on public.profiles              to anon, authenticated;
grant select on public.deck_folders          to anon, authenticated;
grant select on public.custom_cards          to anon, authenticated;
grant select on public.custom_card_sources   to anon, authenticated;

-- 2. Tables strictement propriétaire : pas d'accès anon (aucune policy anon).
grant select on public.user_usage            to authenticated;
grant select on public.email_change_requests to authenticated;

-- 3. card_entries : le propriétaire lit toute sa ligne (prix inclus) via le
--    rôle `authenticated` + policy owner. On NE grant PAS `select` global à
--    `anon` : 20260710120000_fix_purchase_price_leak.sql l'a délibérément
--    révoqué et re-granté colonne par colonne pour que `purchase_price` ne
--    fuite pas sur les deck cards publiques. Ce grant-ci restaure uniquement
--    le privilège `authenticated` que cette migration supposait acquis.
grant select on public.card_entries to authenticated;

-- 4. Écritures : mêmes tables, mêmes rôles qu'avant la dérive. Les plafonds et
--    le rate-limit restent assurés par les triggers (trg_cards_limit) et les
--    policies WITH CHECK, pas par l'absence de privilège.
--
--    NB : on ne grant volontairement PAS `insert, update` au niveau TABLE sur
--    card_entries. 20260711120000_add_usage_quotas.sql (et le bootstrap) ont
--    révoqué le privilège table puis re-granté colonne par colonne (15 des 16
--    colonnes, purchase_price exclu). Un grant table-level écraserait cette
--    restriction et rouvrirait la fuite de prix. Le DELETE, lui, n'a pas de
--    granularité colonne et doit être rendu au propriétaire.
grant delete                 on public.card_entries          to authenticated;
grant insert, update, delete on public.deck_folders          to authenticated;
grant insert, update         on public.profiles              to authenticated;
grant insert, update, delete on public.email_change_requests to authenticated;

-- 5. Séquences éventuelles (identity/serial) pour que les INSERT aboutissent.
grant usage, select on all sequences in schema public to anon, authenticated;
