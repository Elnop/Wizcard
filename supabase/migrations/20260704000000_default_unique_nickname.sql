-- Give every profile a unique, auto-generated default nickname of the form
-- `wizard_<6-hex>` derived from the user id, with a case-insensitive unique
-- index enforcing uniqueness (also prevents two users editing to the same name).

-- 1. Case-insensitive unique index. Partial (nickname is not null) so the
--    column can still hold null transiently and multiple nulls never collide.
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(nickname))
  where nickname is not null;

-- 2. Deterministic base name from a uuid: `wizard_` + first 6 hex of md5.
create function public.default_nickname_base(uid uuid)
  returns text
  language sql
  immutable
as $$
  select 'wizard_' || substr(md5(uid::text), 1, 6);
$$;

-- 3. Collision-safe generator: start from the deterministic base, and on the
--    rare clash extend the hash (7, 8, ... hex chars) until free. Bounded loop.
create function public.generate_unique_nickname(uid uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  candidate text;
  hexlen int := 6;
begin
  loop
    candidate := 'wizard_' || substr(md5(uid::text), 1, hexlen);
    exit when not exists (
      select 1 from public.profiles where lower(nickname) = lower(candidate)
    );
    hexlen := hexlen + 1;
    -- md5 is 32 hex chars; if somehow exhausted, fall back to a random suffix.
    if hexlen > 32 then
      candidate := 'wizard_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (
        select 1 from public.profiles where lower(nickname) = lower(candidate)
      );
    end if;
  end loop;
  return candidate;
end;
$$;

-- 4. Replace the signup trigger so new profiles get a generated nickname.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
    values (new.id, public.generate_unique_nickname(new.id))
    on conflict (id) do nothing;
  return new;
end;
$$;

-- 5. Backfill existing profiles that have no nickname yet.
update public.profiles
  set nickname = public.generate_unique_nickname(id)
  where nickname is null;
