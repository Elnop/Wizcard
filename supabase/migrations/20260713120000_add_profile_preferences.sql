-- Add typed preference columns to profiles (no jsonb). Each has a default so
-- existing rows backfill automatically. `is_public` gates profile visibility.

alter table public.profiles
  add column if not exists language text not null default 'fr',
  add column if not exists price_currency text not null default 'eur',
  add column if not exists show_prices boolean not null default true,
  add column if not exists theme_preference text not null default 'system',
  add column if not exists is_public boolean not null default true;

-- Value constraints (idempotent: drop-if-exists then add).
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles
  add constraint profiles_language_check check (language in ('en', 'fr'));

alter table public.profiles drop constraint if exists profiles_price_currency_check;
alter table public.profiles
  add constraint profiles_price_currency_check check (price_currency in ('eur', 'usd'));

alter table public.profiles drop constraint if exists profiles_theme_preference_check;
alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark', 'system'));

-- Visibility-aware SELECT policy: owner always sees own row; others only if public.
drop policy if exists "Public can view profiles" on public.profiles;
drop policy if exists "Visible profiles are viewable" on public.profiles;
create policy "Visible profiles are viewable"
  on public.profiles for select
  to anon, authenticated
  using (is_public or auth.uid() = id);
