-- Enforce nickname/description rules at the DB layer as the ultimate backstop,
-- mirroring src/lib/profile/validation.ts. Idempotent: drop-then-add so it can be
-- re-run in the prod migration workflow. The case-insensitive unique index
-- (profiles_nickname_lower_key) already enforces uniqueness and is left untouched.

alter table public.profiles drop constraint if exists profiles_nickname_valid;
alter table public.profiles drop constraint if exists profiles_description_len;

alter table public.profiles
  add constraint profiles_nickname_valid check (
    nickname is null or (
      char_length(nickname) between 3 and 30
      -- Unicode letters/digits + dot, underscore, hyphen, space. \p classes need
      -- the case-insensitive-free posix path; use an explicit unicode-aware regex.
      and nickname ~ '^[[:alnum:]._ -]+$'
      and lower(nickname) not in (
        'admin','api','settings','login','logout','signup','users','wizard','null','undefined'
      )
    )
  ),
  add constraint profiles_description_len check (
    description is null or char_length(description) <= 500
  );
