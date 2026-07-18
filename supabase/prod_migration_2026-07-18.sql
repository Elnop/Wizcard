-- =============================================================================
-- WIZCARD — Script de migration PROD consolidé (à coller dans l'éditeur SQL prod)
-- Généré 2026-07-18. Applique la migration manquante sur origin/deploy :
--   1) 20260718120000_oauth_nickname_from_metadata
--
-- Contexte : feature "Google OAuth sign-in". Cette migration enrichit le trigger
-- handle_new_user pour dériver le nickname d'un nouveau profil depuis les
-- métadonnées OAuth (nom Google), avec fallback wizard_<hex>.
--
-- Rendu IDEMPOTENT (rejouable) et TRANSACTIONNEL (tout ou rien).
-- Workflow : exécuter ce bloc, vérifier "COMMIT" OK, puis (voir la fin)
-- synchroniser supabase_migrations.schema_migrations et avancer la branche deploy.
--
-- ✅ SÛRETÉ DONNÉES : cette migration est du DDL de fonctions uniquement.
--    - Aucun backfill, aucun UPDATE/DELETE sur des lignes existantes.
--    - Le seul INSERT est DANS le corps du trigger handle_new_user (exécuté aux
--      futurs signups, PAS au moment de la migration). Les profils existants ne
--      sont pas touchés.
--    - Aucun audit read-only préalable requis (contrairement au CHECK du 2026-07-14).
--
-- ⚠️ La config Google (provider) et les templates email ne sont PAS ici : ce sont
--    des variables d'env GoTrue sur Coolify (voir la doc de déploiement).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Extension unaccent (ASCII-fold des accents). Épinglée au schéma public
--    pour que le search_path=public des fonctions résolve toujours unaccent().
-- -----------------------------------------------------------------------------
create extension if not exists unaccent with schema public;

-- -----------------------------------------------------------------------------
-- 2) normalize_oauth_nickname : normalise un nom d'affichage OAuth en un
--    candidat nickname valide (posix alnum + . _ - espace, 3..30, non réservé),
--    ou NULL si rien d'exploitable. STABLE (unaccent est STABLE en Postgres std).
-- -----------------------------------------------------------------------------
create or replace function public.normalize_oauth_nickname(raw text)
  returns text
  language plpgsql
  stable
as $$
declare
  candidate text;
begin
  if raw is null then
    return null;
  end if;
  candidate := unaccent(raw);
  candidate := regexp_replace(candidate, '[^[:alnum:]._ -]', '', 'g');
  candidate := btrim(regexp_replace(candidate, '\s+', ' ', 'g'));
  candidate := btrim(substr(candidate, 1, 30));
  if char_length(candidate) < 3 then
    return null;
  end if;
  if lower(candidate) in (
    'admin','api','settings','login','logout','signup','users','wizard','null','undefined'
  ) then
    return null;
  end if;
  return candidate;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) generate_unique_nickname(text) : overload à base texte. Renvoie la base
--    telle quelle si libre, sinon _2, _3, … (longueur bornée à 30 suffixe inclus).
--    Coexiste avec l'overload (uid uuid) existant sans ambiguïté.
-- -----------------------------------------------------------------------------
create or replace function public.generate_unique_nickname(base text)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  candidate text := base;
  n int := 2;
  suffix text;
begin
  loop
    exit when not exists (
      select 1 from public.profiles where lower(nickname) = lower(candidate)
    );
    suffix := '_' || n::text;
    candidate := substr(base, 1, 30 - char_length(suffix)) || suffix;
    n := n + 1;
    if n > 10000 then
      candidate := 'wizard_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (
        select 1 from public.profiles where lower(nickname) = lower(candidate)
      );
    end if;
  end loop;
  return candidate;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) handle_new_user : dérive le nickname des métadonnées OAuth
--    (full_name → name → partie locale de l'email), sinon fallback wizard_<hex>.
--    Reste l'UNIQUE point de création de profil.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  base text;
begin
  base := public.normalize_oauth_nickname(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  ));
  if base is null then
    base := public.default_nickname_base(new.id);  -- wizard_<6hex>
  end if;

  insert into public.profiles (id, nickname)
    values (new.id, public.generate_unique_nickname(base))
    on conflict (id) do nothing;
  return new;
end;
$$;

-- =============================================================================
-- 5) Synchro du registre de migrations (pour que `db push` reste aligné).
--    name = nom de fichier sans .sql (convention Supabase).
-- =============================================================================

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260718120000', 'oauth_nickname_from_metadata')
on conflict (version) do nothing;

commit;

-- =============================================================================
-- APRÈS un COMMIT réussi — vérification read-only recommandée (doit renvoyer 3) :
--
--   select count(*) from pg_proc
--   where proname in ('normalize_oauth_nickname','generate_unique_nickname','handle_new_user')
--     and pronamespace = 'public'::regnamespace
--     and (proname <> 'generate_unique_nickname' or pg_get_function_arguments(oid) = 'base text');
--   -- attendu : normalize_oauth_nickname (1) + generate_unique_nickname(base text) (1)
--   --           + handle_new_user (1) = 3
--
-- Puis, côté git, avancer la branche deploy :
--   git checkout deploy && git merge --ff-only main && git push origin deploy
-- pour que le prochain diff main..deploy reste juste.
-- =============================================================================
