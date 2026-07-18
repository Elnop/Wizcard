-- Derive a new profile's nickname from OAuth provider metadata (e.g. Google
-- full_name) instead of the generic wizard_<hex>. Normalized in SQL so the
-- trigger stays the single, atomic profile-creation path. Falls back to
-- wizard_<hex> when no usable name is present. Idempotent.

-- Pin to public so normalize_oauth_nickname's `search_path = public` always
-- resolves unaccent(), regardless of platform extension-schema conventions.
create extension if not exists unaccent with schema public;

-- Normalize a raw display name into a nickname candidate that satisfies the
-- profiles_nickname_valid CHECK (posix alnum + dot/underscore/hyphen/space,
-- 3..30 chars, not reserved). Returns null when no valid candidate remains.
create or replace function public.normalize_oauth_nickname(raw text)
  returns text
  language plpgsql
  -- STABLE (not IMMUTABLE): unaccent() is only STABLE in stock Postgres, and its
  -- result can change if the unaccent dictionary is reconfigured per session.
  -- Only ever called inside the handle_new_user trigger body — never in an index
  -- or generated column — so STABLE is correct and sufficient.
  stable
as $$
declare
  candidate text;
begin
  if raw is null then
    return null;
  end if;
  -- ASCII-fold accents, then keep only charset-legal characters.
  candidate := unaccent(raw);
  candidate := regexp_replace(candidate, '[^[:alnum:]._ -]', '', 'g');
  -- Collapse whitespace runs and trim.
  candidate := btrim(regexp_replace(candidate, '\s+', ' ', 'g'));
  -- Enforce max length (truncate), then re-trim in case truncation left a space.
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

-- Collision-safe generator from an arbitrary text base: return base as-is if
-- free, else append _2, _3, ... until free (bounded), respecting the 30-char cap.
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
    -- Keep total length <= 30 by trimming the base to make room for the suffix.
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

-- Rewrite the signup trigger: prefer a nickname derived from provider metadata
-- (Google full_name -> name -> email local-part), else the wizard_<hex> base.
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
