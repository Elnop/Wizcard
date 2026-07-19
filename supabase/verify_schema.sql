-- =============================================================================
-- verify_schema.sql — Audit lecture seule du schéma d'une DB (local ou prod).
--
-- BUT : détecter une dérive d'une DB par rapport à l'état attendu défini par
-- l'intégralité de supabase/migrations/*. Utile en local après un changement de
-- schéma, et en prod (susceptible d'avoir des migrations de retard, cf.
-- project_prod_migration_workflow). Le script dit EXACTEMENT quels objets
-- manquent — sans rien corriger.
--
-- USAGE :
--   • Local : `npm run sb:verify` (exécute ce fichier via le conteneur Supabase,
--     exit code ≠ 0 s'il y a au moins un FAIL).
--   • Prod  : colle ce fichier entier dans le SQL editor prod et exécute.
-- Il ne fait AUCUNE écriture (pas de DDL/DML sur les tables métier ; la seule
-- table créée est TEMPORAIRE, détruite en fin de session). Ré-exécutable.
--
-- SORTIE : une grille (status, category, object, detail). Les FAIL remontent en
-- haut. La dernière ligne est un résumé « N passed / M failed ».
--
-- ROBUSTESSE : les helpers renvoient false (→ FAIL) plutôt que d'ÉCHOUER si un
-- schéma/relation attendu est absent. Aucune transaction englobante : un objet
-- manquant ne peut pas avorter le rapport entier.
--
-- RÉFÉRENCE : état attendu = migrations rejouées jusqu'à 20260714120000
-- (profile_field_constraints : nickname/description CHECK, incluse). MàJ 2026-07-14.
-- =============================================================================

-- Pas de transaction englobante : on veut qu'un objet manquant produise un FAIL,
-- pas un abort du rapport entier. La table de rapport est temporaire (détruite en
-- fin de session) ; on la recrée à chaque exécution.
drop table if exists _verify;
create temporary table _verify (
  ord       serial,
  status    text,
  category  text,
  object    text,
  detail    text
);

-- Helper : enregistre PASS si `cond` est vrai, sinon FAIL avec `detail`.
create or replace function pg_temp.chk(
  category text, object text, cond boolean, detail text default ''
) returns void language plpgsql as $$
begin
  insert into _verify(status, category, object, detail)
  values (case when cond then 'PASS' else 'FAIL' end, category, object,
          case when cond then '' else detail end);
end;
$$;

-- Helpers de présence (catalogues système ; robustes aux faux négatifs de
-- to_regproc, cf. project_prod_migration_workflow).
create or replace function pg_temp.has_table(t text) returns boolean language sql stable as $$
  select exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname=t and c.relkind in ('r','p'));
$$;
create or replace function pg_temp.has_view(v text) returns boolean language sql stable as $$
  select exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname=v and c.relkind='v');
$$;
create or replace function pg_temp.has_col(t text, col text) returns boolean language sql stable as $$
  select exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name=t and column_name=col);
$$;
create or replace function pg_temp.col_type(t text, col text) returns text language sql stable as $$
  select data_type from information_schema.columns
  where table_schema='public' and table_name=t and column_name=col;
$$;
create or replace function pg_temp.col_default(t text, col text) returns text language sql stable as $$
  select column_default from information_schema.columns
  where table_schema='public' and table_name=t and column_name=col;
$$;
create or replace function pg_temp.rls_on(t text) returns boolean language sql stable as $$
  select coalesce((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relname=t), false);
$$;
create or replace function pg_temp.has_policy(schema_ text, t text, p text) returns boolean language sql stable as $$
  select exists (select 1 from pg_policies where schemaname=schema_ and tablename=t and policyname=p);
$$;
create or replace function pg_temp.has_func(fn text, args text) returns boolean language sql stable as $$
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname=fn
                   and pg_get_function_identity_arguments(p.oid)=args);
$$;
create or replace function pg_temp.has_trigger(schema_ text, t text, tg text) returns boolean language sql stable as $$
  select exists (select 1 from information_schema.triggers
                 where event_object_schema=schema_ and event_object_table=t and trigger_name=tg);
$$;
create or replace function pg_temp.has_index(t text, idx text) returns boolean language sql stable as $$
  select exists (select 1 from pg_indexes where schemaname='public' and tablename=t and indexname=idx);
$$;
-- storage.buckets peut être absent (schéma storage non provisionné) : on protège
-- la lecture pour renvoyer false plutôt qu'échouer.
create or replace function pg_temp.has_bucket(b text) returns boolean language plpgsql stable as $$
begin
  return exists (select 1 from storage.buckets where id=b);
exception when undefined_table or invalid_schema_name then
  return false;
end;
$$;
-- ::regclass échoue si la table est absente → on protège pour renvoyer false.
create or replace function pg_temp.has_check(t text, con text) returns boolean language plpgsql stable as $$
begin
  return exists (select 1 from pg_constraint
                 where conrelid = ('public.'||t)::regclass and conname=con and contype='c');
exception when undefined_table then
  return false;
end;
$$;
-- Un grant COLONNE existe-t-il ? (utilisé pour les assertions de sécurité.)
create or replace function pg_temp.has_col_grant(t text, grantee_ text, priv text, col text) returns boolean language sql stable as $$
  select exists (select 1 from information_schema.column_privileges
                 where table_schema='public' and table_name=t
                   and grantee=grantee_ and privilege_type=priv and column_name=col);
$$;

-- =============================================================================
-- 1. TABLES
-- =============================================================================
select pg_temp.chk('table', 'public.'||t, pg_temp.has_table(t), 'table absente')
from unnest(array[
  'decks','cards','deck_folders','profiles',
  'custom_cards','custom_card_sources','user_usage','email_change_requests'
]) t;

-- =============================================================================
-- 2. COLONNES (exhaustif — nom + type). Source : dump DB locale à jour.
-- =============================================================================
-- format : table | colonne | type_attendu (information_schema.data_type)
with expected(t, col, typ) as (
  values
    -- decks
    ('decks','id','uuid'),('decks','owner_id','uuid'),('decks','name','text'),
    ('decks','format','text'),('decks','description','text'),
    ('decks','created_at','timestamp with time zone'),('decks','updated_at','timestamp with time zone'),
    ('decks','folder_id','uuid'),('decks','cover_art_url','text'),
    -- cards
    ('cards','id','uuid'),('cards','owner_id','uuid'),('cards','scryfall_id','text'),
    ('cards','date_added','timestamp with time zone'),('cards','is_foil','boolean'),
    ('cards','foil_type','text'),('cards','condition','text'),('cards','language','text'),
    ('cards','purchase_price','text'),('cards','alter','boolean'),('cards','proxy','boolean'),
    ('cards','tags','ARRAY'),('cards','for_trade','boolean'),('cards','deck_id','uuid'),
    ('cards','wishlist','boolean'),('cards','created_at','timestamp with time zone'),
    -- deck_folders
    ('deck_folders','id','uuid'),('deck_folders','owner_id','uuid'),('deck_folders','parent_id','uuid'),
    ('deck_folders','name','text'),('deck_folders','position','integer'),
    ('deck_folders','created_at','timestamp with time zone'),('deck_folders','updated_at','timestamp with time zone'),
    -- profiles
    ('profiles','id','uuid'),('profiles','nickname','text'),('profiles','description','text'),
    ('profiles','avatar_url','text'),('profiles','created_at','timestamp with time zone'),
    ('profiles','updated_at','timestamp with time zone'),
    ('profiles','language','text'),('profiles','price_currency','text'),
    ('profiles','show_prices','boolean'),('profiles','theme_preference','text'),
    ('profiles','is_public','boolean'),('profiles','ignored_tags','ARRAY'),
    -- user_usage
    ('user_usage','owner_id','uuid'),('user_usage','deck_count','integer'),('user_usage','card_count','integer'),
    -- custom_card_sources
    ('custom_card_sources','id','text'),('custom_card_sources','name','text'),
    ('custom_card_sources','description','text'),('custom_card_sources','provider','text'),
    ('custom_card_sources','external_link','text'),('custom_card_sources','drive_folder_id','text'),
    ('custom_card_sources','tags','ARRAY'),('custom_card_sources','card_count','integer'),
    ('custom_card_sources','last_synced_at','timestamp with time zone'),
    ('custom_card_sources','created_at','timestamp with time zone'),
    -- custom_cards
    ('custom_cards','id','text'),('custom_cards','source_id','text'),('custom_cards','name','text'),
    ('custom_cards','raw_name','text'),('custom_cards','image_storage_path','text'),
    ('custom_cards','image_drive_url','text'),('custom_cards','artist','text'),
    ('custom_cards','tags','ARRAY'),('custom_cards','is_public','boolean'),
    ('custom_cards','created_by','uuid'),('custom_cards','created_at','timestamp with time zone'),
    ('custom_cards','oracle_id','text'),('custom_cards','enriched_at','timestamp with time zone'),
    ('custom_cards','set_code','text'),('custom_cards','collector_number','text'),
    ('custom_cards','source_type','text'),('custom_cards','card_type','text'),
    ('custom_cards','language','text'),('custom_cards','colors','ARRAY'),
    ('custom_cards','color_identity','ARRAY'),('custom_cards','cmc','numeric'),
    ('custom_cards','type_line','text'),('custom_cards','mana_cost','text'),
    ('custom_cards','oracle_text','text'),('custom_cards','rarity','text'),
    ('custom_cards','set_name','text'),('custom_cards','display_name','text'),
    ('custom_cards','image_hash','text'),('custom_cards','drive_folder_path','text'),
    -- email_change_requests
    ('email_change_requests','id','uuid'),('email_change_requests','user_id','uuid'),
    ('email_change_requests','token_hash','text'),('email_change_requests','expires_at','timestamp with time zone'),
    ('email_change_requests','used_at','timestamp with time zone'),
    ('email_change_requests','created_at','timestamp with time zone')
)
select pg_temp.chk(
  'column', e.t||'.'||e.col,
  pg_temp.has_col(e.t, e.col) and pg_temp.col_type(e.t, e.col) is not distinct from e.typ,
  case
    when not pg_temp.has_col(e.t, e.col) then 'colonne absente'
    else 'type '||coalesce(pg_temp.col_type(e.t,e.col),'?')||' ≠ attendu '||e.typ
  end
)
from expected e;

-- Défauts des colonnes de préférence profiles (20260713120000_add_profile_preferences).
with expected_default(t, col, dflt) as (
  values
    ('profiles','language','''fr''::text'),
    ('profiles','price_currency','''eur''::text'),
    ('profiles','show_prices','true'),
    ('profiles','theme_preference','''system''::text'),
    ('profiles','is_public','true')
)
select pg_temp.chk(
  'column-default', e.t||'.'||e.col,
  pg_temp.col_default(e.t, e.col) is not distinct from e.dflt,
  'défaut '||coalesce(pg_temp.col_default(e.t,e.col),'∅')||' ≠ attendu '||e.dflt
)
from expected_default e;

-- =============================================================================
-- 3. RLS activé sur toutes les tables métier
-- =============================================================================
select pg_temp.chk('rls', 'public.'||t, pg_temp.rls_on(t), 'row level security désactivé')
from unnest(array[
  'decks','cards','deck_folders','profiles',
  'custom_cards','custom_card_sources','user_usage'
]) t;

-- =============================================================================
-- 4. POLICIES (par nom). Inclut les policies publiques de partage.
-- =============================================================================
with pol(t, p) as (
  values
    -- decks
    ('decks','Users can view their own decks'),('decks','Users can insert their own decks'),
    ('decks','Users can update their own decks'),('decks','Users can delete their own decks'),
    ('decks','Public can view all decks'),
    -- cards
    ('cards','Users can view their own cards'),('cards','Users can insert their own cards'),
    ('cards','Users can update their own cards'),('cards','Users can delete their own cards'),
    ('cards','Public can view deck cards'),
    -- deck_folders
    ('deck_folders','Users can view their own folders'),('deck_folders','Users can insert their own folders'),
    ('deck_folders','Users can update their own folders'),('deck_folders','Users can delete their own folders'),
    ('deck_folders','Public can view all deck folders'),
    -- profiles
    ('profiles','Visible profiles are viewable'),('profiles','Users can insert own profile'),
    ('profiles','Users can update own profile'),
    -- user_usage
    ('user_usage','Users can view their own usage'),
    -- custom_card_sources
    ('custom_card_sources','public read custom_card_sources'),
    ('custom_card_sources','service role write custom_card_sources'),
    -- custom_cards
    ('custom_cards','read custom_cards'),('custom_cards','service role write custom_cards'),
    ('custom_cards','user insert own custom_cards'),('custom_cards','user update own custom_cards'),
    ('custom_cards','user delete own custom_cards')
)
select pg_temp.chk('policy', p.t||' :: '||p.p, pg_temp.has_policy('public', p.t, p.p), 'policy absente')
from pol p;

-- Policies sur storage.objects (buckets avatars + custom-cards + user folders)
select pg_temp.chk('policy', 'storage.objects :: '||p, pg_temp.has_policy('storage','objects',p), 'policy absente')
from unnest(array[
  'public read avatars bucket','users write own avatar',
  'public read custom-cards bucket','service role write custom-cards bucket',
  'user manage own storage objects','user upload to own folder'
]) p;

-- SÉCURITÉ : "Public can view collection cards" a été RÉINTRODUITE (20260713130000)
-- pour porter le filtre de confidentialité, MAIS la protection prix ne repose plus
-- sur son absence — elle repose sur les grants colonne (cf. assertion « anon cannot
-- SELECT cards.purchase_price » plus bas). Cette policy DOIT désormais exister ET
-- filtrer par la visibilité du profil propriétaire.
select pg_temp.chk(
  'security', 'cards collection read is privacy-gated',
  exists (select 1 from pg_policies
          where schemaname='public' and tablename='cards'
            and policyname='Public can view collection cards'
            and qual ilike '%profile_is_public%'),
  'policy "Public can view collection cards" absente ou ne filtre pas par profile_is_public'
);

-- SÉCURITÉ : les lectures publiques decks / deck_folders / deck-cards doivent
-- toutes être filtrées par la visibilité du profil propriétaire (20260713130000).
select pg_temp.chk(
  'security', 'decks public read is privacy-gated',
  exists (select 1 from pg_policies
          where schemaname='public' and tablename='decks'
            and policyname='Public can view all decks'
            and qual ilike '%profile_is_public%'),
  'policy "Public can view all decks" ne filtre pas par profile_is_public'
);
select pg_temp.chk(
  'security', 'deck_folders public read is privacy-gated',
  exists (select 1 from pg_policies
          where schemaname='public' and tablename='deck_folders'
            and policyname='Public can view all deck folders'
            and qual ilike '%profile_is_public%'),
  'policy "Public can view all deck folders" ne filtre pas par profile_is_public'
);
select pg_temp.chk(
  'security', 'deck cards public read is privacy-gated',
  exists (select 1 from pg_policies
          where schemaname='public' and tablename='cards'
            and policyname='Public can view deck cards'
            and qual ilike '%profile_is_public%'),
  'policy "Public can view deck cards" ne filtre pas par profile_is_public'
);

-- Le helper de visibilité doit exister (SECURITY DEFINER, utilisé par les policies).
select pg_temp.chk(
  'security', 'function public.profile_is_public(uuid)',
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='profile_is_public'),
  'fonction profile_is_public absente'
);

-- SÉCURITÉ : la policy SELECT sur profiles doit filtrer par is_public (remplace
-- l'ancienne "Public can view profiles" using(true), cf. 20260713120000).
select pg_temp.chk(
  'security', 'profiles select visibility',
  exists (select 1 from pg_policies
          where schemaname='public' and tablename='profiles'
            and cmd='SELECT' and qual ilike '%is_public%'),
  'la policy SELECT profiles ne filtre pas par is_public'
);
select pg_temp.chk(
  'security', 'profiles :: no "Public can view profiles"',
  not pg_temp.has_policy('public','profiles','Public can view profiles'),
  'ancienne policy sur-permissive TOUJOURS PRÉSENTE → fuite de profils privés'
);

-- SÉCURITÉ : email_change_requests est service-role only — RLS activée mais
-- AUCUNE policy (jamais accédée depuis le client, cf. 20260713140000).
select pg_temp.chk(
  'security', 'email_change_requests :: RLS enabled, no policy',
  exists (select 1 from pg_class where relname='email_change_requests' and relrowsecurity)
    and not exists (select 1 from pg_policies where tablename='email_change_requests'),
  'table doit avoir RLS activée et AUCUNE policy (service-role only)'
);

-- =============================================================================
-- 5. VUE public_collection_cards (existe, sans purchase_price, security_invoker)
-- =============================================================================
select pg_temp.chk('view', 'public.public_collection_cards',
  pg_temp.has_view('public_collection_cards'), 'vue absente');
select pg_temp.chk('security', 'public_collection_cards omits purchase_price',
  pg_temp.has_view('public_collection_cards')
    and not pg_temp.has_col('public_collection_cards','purchase_price'),
  'la vue expose purchase_price');
select pg_temp.chk('view', 'public_collection_cards security_invoker=true',
  coalesce((select option_value='true' from pg_class c
    join pg_namespace n on n.oid=c.relnamespace,
    lateral pg_options_to_table(c.reloptions)
    where n.nspname='public' and c.relname='public_collection_cards'
      and option_name='security_invoker'), false),
  'security_invoker non activé → la vue peut bypasser la RLS');

-- =============================================================================
-- 6. FONCTIONS (nom + signature identité)
-- =============================================================================
with fn(name, args) as (
  values
    ('default_nickname_base','uid uuid'),
    ('generate_unique_nickname','uid uuid'),
    ('generate_unique_nickname','base text'),
    ('normalize_oauth_nickname','raw text'),
    ('handle_new_user',''),
    ('count_distinct_public_cards','owner uuid'),
    ('recompute_user_usage','uid uuid'),
    ('trg_decks_usage',''),('trg_cards_usage',''),
    ('trg_decks_limit',''),('trg_cards_limit','')
)
select pg_temp.chk('function', fn.name||'('||fn.args||')',
  pg_temp.has_func(fn.name, fn.args), 'fonction absente')
from fn;

-- =============================================================================
-- 7. TRIGGERS
-- =============================================================================
with tg(schema_, t, name) as (
  values
    ('auth','users','on_auth_user_created'),
    ('public','decks','decks_limit_before'),
    ('public','decks','decks_usage_after'),
    ('public','cards','cards_limit_before'),
    ('public','cards','cards_usage_after')
)
select pg_temp.chk('trigger', tg.schema_||'.'||tg.t||' :: '||tg.name,
  pg_temp.has_trigger(tg.schema_, tg.t, tg.name), 'trigger absent')
from tg;

-- =============================================================================
-- 8. STORAGE BUCKETS
-- =============================================================================
select pg_temp.chk('bucket', b, pg_temp.has_bucket(b), 'bucket absent')
from unnest(array['avatars','custom-cards']) b;

-- =============================================================================
-- 9. CHECK CONSTRAINTS (valeurs autorisées : format, condition, foil, etc.)
-- =============================================================================
with con(t, name) as (
  values
    ('decks','decks_format_check'),
    ('cards','cards_condition_check'),('cards','cards_foil_type_check'),
    ('cards','cards_owner_or_deck'),
    ('custom_cards','custom_cards_card_type_check'),
    ('custom_cards','custom_cards_source_type_check'),
    ('profiles','profiles_language_check'),
    ('profiles','profiles_price_currency_check'),
    ('profiles','profiles_theme_preference_check'),
    -- 20260714120000_profile_field_constraints : nickname/description
    ('profiles','profiles_nickname_valid'),
    ('profiles','profiles_description_len')
)
select pg_temp.chk('check', con.t||' :: '||con.name,
  pg_temp.has_check(con.t, con.name), 'contrainte CHECK absente')
from con;

-- =============================================================================
-- 10. INDEX critiques (perf quotas/collection + recherche custom_cards)
-- =============================================================================
with idx(t, name) as (
  values
    ('cards','cards_owner_created_at_idx'),   -- fenêtre rate-limit
    ('cards','cards_deck_id_idx'),            -- deck cards
    ('cards','collections_pkey'),
    ('decks','decks_owner_id_idx'),('decks','decks_folder_id_idx'),
    ('deck_folders','deck_folders_owner_id_idx'),('deck_folders','deck_folders_parent_id_idx'),
    ('profiles','profiles_nickname_lower_key'),
    ('user_usage','user_usage_pkey'),
    ('custom_cards','custom_cards_source_id_idx'),('custom_cards','custom_cards_name_idx'),
    ('custom_cards','custom_cards_image_hash_source_idx')
)
select pg_temp.chk('index', idx.t||' :: '||idx.name,
  pg_temp.has_index(idx.t, idx.name), 'index absent')
from idx;

-- Index sur email_change_requests.token_hash (recherche du token en clair
-- hashé, cf. 20260713140000) : vérifié par indexdef plutôt que par nom exact.
select pg_temp.chk('index', 'email_change_requests.token_hash',
  exists (select 1 from pg_indexes where tablename='email_change_requests'
          and indexdef ilike '%token_hash%'),
  'index token_hash absent');

-- =============================================================================
-- 11. SÉCURITÉ — grants colonne sensibles sur cards
--   (a) anon NE DOIT PAS pouvoir SELECT purchase_price  (fix fuite de prix)
--   (b) anon/authenticated NE DOIVENT PAS pouvoir INSERT created_at
--       (sinon le rate-limit devient contournable)
-- =============================================================================
select pg_temp.chk('security', 'anon cannot SELECT cards.purchase_price',
  not pg_temp.has_col_grant('cards','anon','SELECT','purchase_price'),
  'anon peut lire purchase_price → fuite de prix');
select pg_temp.chk('security', 'anon cannot INSERT cards.created_at',
  not pg_temp.has_col_grant('cards','anon','INSERT','created_at'),
  'anon peut écrire created_at → rate-limit contournable');
select pg_temp.chk('security', 'authenticated cannot INSERT cards.created_at',
  not pg_temp.has_col_grant('cards','authenticated','INSERT','created_at'),
  'authenticated peut écrire created_at → rate-limit contournable');
-- Contre-preuve : l'owner (authenticated) DOIT garder SELECT purchase_price.
select pg_temp.chk('security', 'authenticated CAN SELECT cards.purchase_price',
  pg_temp.has_col_grant('cards','authenticated','SELECT','purchase_price'),
  'owner ne peut plus lire ses propres prix (grant trop restreint)');

-- =============================================================================
-- RÉSUMÉ + RAPPORT
-- =============================================================================
insert into _verify(status, category, object, detail)
select
  case when count(*) filter (where status='FAIL') = 0 then 'PASS' else 'FAIL' end,
  'SUMMARY',
  count(*) filter (where status='PASS')||' passed / '||count(*) filter (where status='FAIL')||' failed',
  case when count(*) filter (where status='FAIL') = 0
       then 'Schéma conforme aux migrations ✔'
       else 'Objets manquants ou dérive détectée — voir les lignes FAIL ci-dessus' end
from _verify;

-- FAIL d'abord, puis SUMMARY en toute fin.
select status, category, object, detail
from _verify
order by
  (status='FAIL') desc,
  (category='SUMMARY') asc,
  category, ord;
