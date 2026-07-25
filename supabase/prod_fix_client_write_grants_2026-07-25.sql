-- =============================================================================
-- WIZCARD — Correctif PROD : retirer les privilèges d'ÉCRITURE indus de
-- anon/authenticated (à coller dans l'éditeur SQL prod).
-- Généré 2026-07-25, après l'audit verify_schema.sql qui a remonté 13 FAIL.
--
-- CONSTAT (audit prod du 2026-07-25) :
--   • anon ET authenticated ont INSERT/UPDATE/DELETE sur les 6 tables du
--     catalogue (card_definitions, card_prints, card_definition_faces,
--     card_print_faces, card_parts, card_sets).
--   • anon a INSERT/UPDATE/DELETE sur public.decks.
--
-- CAUSE : ce n'est PAS une migration. Aucune migration n'accorde ces droits
-- (vérifié : seuls decks/card_entries/deck_folders/profiles/
-- email_change_requests reçoivent des écritures, et uniquement à
-- `authenticated`). C'est la DEFAULT ACL du bootstrap Supabase self-hosted :
--   default_acl(r) = {anon=arwdDxtm/supabase_admin, authenticated=arwdDxtm/...}
-- où a=INSERT, w=UPDATE, d=DELETE. Toute table créée par la suite hérite donc
-- de droits d'écriture pour les rôles clients. Cf. project_table_grants_drift.
--
-- EXPLOITABILITÉ VÉRIFIÉE : nulle aujourd'hui — la RLS bloque. Sondes réelles
-- passées avec la clé anon sur la prod :
--   INSERT card_definitions  → 42501 "violates row-level security policy"
--   DELETE card_sets         → 0 ligne supprimée (1047 avant / 1047 après)
--   UPDATE card_sets         → 0 ligne modifiée ("lea" intact)
-- Les tables du catalogue n'ont QUE des policies SELECT : sans policy
-- INSERT/UPDATE/DELETE, la RLS filtre tout. Le privilège table est donc une
-- porte ouverte derrière un mur fermé.
--
-- POURQUOI CORRIGER QUAND MÊME : défense en profondeur. Le jour où quelqu'un
-- ajoute une policy permissive (ou désactive la RLS sur une table du catalogue
-- pour déboguer), l'écriture devient immédiatement possible pour n'importe quel
-- visiteur anonyme. Le modèle voulu est « catalogue en lecture seule pour le
-- client, écriture par le seed via service_role uniquement ».
--
-- SÛRETÉ : REVOKE uniquement. Aucune donnée touchée, aucun DDL de structure.
-- Idempotent (REVOKE d'un droit absent est un no-op). Transactionnel.
-- Ne retire RIEN à service_role (le seed continue de fonctionner) ni les
-- écritures légitimes de `authenticated` sur decks/card_entries/deck_folders/
-- profiles/email_change_requests.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Catalogue Scryfall : lecture seule pour les rôles clients.
--    On révoque sur anon ET authenticated ; le SELECT est conservé.
-- -----------------------------------------------------------------------------
-- On révoque INSERT/UPDATE/DELETE (les 3 privilèges que l'audit signale) ET
-- TRUNCATE. Ce dernier mérite une explication : TRUNCATE **contourne la RLS**
-- (vérifié : 3 lignes → 0 en tant qu'anon, RLS activée), contrairement à
-- DELETE qui est filtré par les policies. C'est donc le seul de la liste qui
-- serait réellement destructeur si un vecteur d'exécution existait.
--
-- REFERENCES et TRIGGER sont volontairement CONSERVÉS : ils sont présents en
-- local (état de référence), inoffensifs ici, et les révoquer créerait un écart
-- local↔prod que rien ne justifie.
revoke insert, update, delete, truncate
  on public.card_definitions,
     public.card_prints,
     public.card_definition_faces,
     public.card_print_faces,
     public.card_parts,
     public.card_sets
  from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) decks : anon ne doit jamais écrire (authenticated garde ses droits, posés
--    explicitement par 20260724120003_restore_decks_write_grants).
--
-- NB : le TRUNCATE d'anon est également révoqué ici. C'est un DURCISSEMENT
-- volontaire au-delà de l'état local (où anon possède TRUNCATE sur decks, par
-- héritage de la même default ACL). Motif : TRUNCATE contourne la RLS et
-- viderait les 1 961 decks d'un coup. anon n'en a aucun usage légitime.
-- Pour rester strictement aligné sur le local, retirer `truncate` ci-dessous.
-- -----------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.decks from anon;

-- -----------------------------------------------------------------------------
-- 3) Tarir la source : la DEFAULT ACL. Sans ça, la prochaine table créée en
--    prod héritera à nouveau de droits d'écriture pour anon/authenticated.
--
--    ⚠️ ALTER DEFAULT PRIVILEGES ne s'applique qu'aux objets créés PAR le rôle
--    cité dans FOR ROLE. La default ACL observée est posée par `supabase_admin`
--    ET par `postgres` : on neutralise les deux. Si l'un des rôles n'existe pas
--    sur ce cluster, la commande échoue → le bloc DO l'ignore proprement.
-- -----------------------------------------------------------------------------
do $$
declare
  r text;
begin
  foreach r in array array['supabase_admin','postgres']
  loop
    begin
      execute format(
        'alter default privileges for role %I in schema public '
        'revoke insert, update, delete, truncate on tables from anon, authenticated',
        r
      );
    exception when undefined_object or insufficient_privilege then
      raise notice 'default privileges non modifiées pour le rôle % (absent ou droits insuffisants)', r;
    end;
  end loop;
end
$$;

commit;

-- =============================================================================
-- APRÈS un COMMIT réussi — contrôle read-only (doit renvoyer 0 ligne) :
--
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee in ('anon','authenticated')
--     and privilege_type in ('INSERT','UPDATE','DELETE')
--     and (
--       table_name in ('card_definitions','card_prints','card_definition_faces',
--                      'card_print_faces','card_parts','card_sets')
--       or (table_name = 'decks' and grantee = 'anon')
--     )
--   order by table_name, grantee, privilege_type;
--
-- Puis relancer verify_schema.sql : les 13 FAIL doivent disparaître.
-- Attendu : « N passed / 0 failed ».
-- =============================================================================
