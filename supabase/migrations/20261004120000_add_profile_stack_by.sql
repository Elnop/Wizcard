-- Per-list card stacking preference (collection / wishlist / deck owner view).
-- '{}' = stack by card name (historical behaviour); criteria add copy
-- properties that split stacks; '{copy}' alone = no stacking.
alter table public.profiles
  add column if not exists collection_stack_by text[] not null default '{}'::text[],
  add column if not exists wishlist_stack_by   text[] not null default '{}'::text[],
  add column if not exists deck_stack_by       text[] not null default '{}'::text[];

alter table public.profiles drop constraint if exists profiles_collection_stack_by_check;
alter table public.profiles
  add constraint profiles_collection_stack_by_check check (
    collection_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(collection_stack_by)) or collection_stack_by = array['copy']::text[])
  );

alter table public.profiles drop constraint if exists profiles_wishlist_stack_by_check;
alter table public.profiles
  add constraint profiles_wishlist_stack_by_check check (
    wishlist_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(wishlist_stack_by)) or wishlist_stack_by = array['copy']::text[])
  );

alter table public.profiles drop constraint if exists profiles_deck_stack_by_check;
alter table public.profiles
  add constraint profiles_deck_stack_by_check check (
    deck_stack_by <@ array['print','finish','condition','language','flags','copy']::text[]
    and (not ('copy' = any(deck_stack_by)) or deck_stack_by = array['copy']::text[])
  );
