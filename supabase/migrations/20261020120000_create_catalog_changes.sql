-- Catalog change journal (story 3.1, issue #60).
--
-- The weekly seed rewrites ~163k prints. AFTER ROW triggers on the catalog log only
-- REAL differences (row-level WHEN clause + per-key jsonb diff), one row per changed
-- field, so the "Catalogue" digest (story 3.3) can say which cards changed and how.
--
-- - Every column is tracked by default (new columns included) except `updated_at`
--   and `card_definitions.edhrec_rank` (a weekly popularity rank, not a catalog change).
-- - `added` / `removed` rows carry the identifiers; `removed` also carries the full
--   row in old_value, since the print no longer exists to be joined.
-- - No FK to the catalog: the journal outlives deleted prints.
-- - card_parts and card_sets are NOT journaled.
-- - service_role only (read); anon/authenticated have no access at all.
--
-- Idempotent: safe to re-run (prod is applied by hand in the SQL editor).
--
-- PROD ROLLOUT (see docs/guides/catalog-seed.md § Change journal):
-- - Apply this migration AND advance `deploy` together, before the next Monday
--   04:00 UTC catalog-seed run. The old seed code (delete-then-insert print faces,
--   one definition write per print) would flood the journal.
-- - The first prod seed with the new code switches ~473 oracles from last-print to
--   first-print `oldschool` legality, logging ~3,500 spurious `legalities` rows that
--   must be deleted before the first digest (story 3.3) — issue #66.

create table if not exists public.catalog_changes (
  id          bigint generated always as identity primary key,
  changed_at  timestamptz not null default now(),
  entity      text not null
              constraint catalog_changes_entity_check
              check (entity in ('print', 'print_face', 'definition', 'definition_face')),
  change      text not null
              constraint catalog_changes_change_check
              check (change in ('added', 'removed', 'updated')),
  print_id    uuid,
  oracle_id   uuid,
  face_index  smallint,
  field       text,
  old_value   jsonb,
  new_value   jsonb
);

create index if not exists catalog_changes_changed_at_idx
  on public.catalog_changes (changed_at);

-- One generic trigger function, dispatched on TG_TABLE_NAME / TG_OP.
create or replace function public.log_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old    jsonb;
  v_new    jsonb;
  v_row    jsonb;
  v_entity text;
  v_print  uuid;
  v_oracle uuid;
  v_face   smallint;
  v_key    text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  v_row := coalesce(v_new, v_old);

  case tg_table_name
    when 'card_prints' then
      v_entity := 'print';
      v_print  := (v_row->>'id')::uuid;
      v_oracle := (v_row->>'oracle_id')::uuid;
    when 'card_definitions' then
      v_entity := 'definition';
      v_oracle := (v_row->>'oracle_id')::uuid;
    when 'card_print_faces' then
      v_entity := 'print_face';
      v_print  := (v_row->>'print_id')::uuid;
      v_face   := (v_row->>'face_index')::smallint;
    when 'card_definition_faces' then
      v_entity := 'definition_face';
      v_oracle := (v_row->>'oracle_id')::uuid;
      v_face   := (v_row->>'face_index')::smallint;
    else
      raise exception 'log_catalog_change: unexpected table %', tg_table_name;
  end case;

  if tg_op = 'INSERT' then
    insert into public.catalog_changes (entity, change, print_id, oracle_id, face_index)
    values (v_entity, 'added', v_print, v_oracle, v_face);

  elsif tg_op = 'DELETE' then
    -- A face deleted by the cascade of a removed print is already covered by the
    -- print's own `removed` row: only log a face whose parent print still exists.
    if v_entity = 'print_face'
       and not exists (select 1 from public.card_prints p where p.id = v_print) then
      return null;
    end if;
    insert into public.catalog_changes (entity, change, print_id, oracle_id, face_index, old_value)
    values (v_entity, 'removed', v_print, v_oracle, v_face, v_old);

  else -- UPDATE: one row per changed key, excluding noise columns.
    for v_key in
      select key from jsonb_each(v_new)
      where key not in ('updated_at', 'edhrec_rank')
        and v_new->key is distinct from v_old->key
    loop
      insert into public.catalog_changes
        (entity, change, print_id, oracle_id, face_index, field, old_value, new_value)
      values
        (v_entity, 'updated', v_print, v_oracle, v_face, v_key, v_old->v_key, v_new->v_key);
    end loop;
  end if;

  return null;
end;
$$;

revoke execute on function public.log_catalog_change() from public, anon, authenticated;

-- Triggers. UPDATE triggers carry a whole-row WHEN so an identical upsert costs
-- almost nothing; edhrec_rank is then filtered inside the loop.
-- Face INSERTs are not journaled: they come with an already-`added` print/definition.
-- card_definitions has no DELETE trigger: the seed never deletes a definition.
drop trigger if exists card_prints_log_insert_delete on public.card_prints;
create trigger card_prints_log_insert_delete
  after insert or delete on public.card_prints
  for each row execute function public.log_catalog_change();

drop trigger if exists card_prints_log_update on public.card_prints;
create trigger card_prints_log_update
  after update on public.card_prints
  for each row when (old.* is distinct from new.*)
  execute function public.log_catalog_change();

drop trigger if exists card_definitions_log_insert on public.card_definitions;
create trigger card_definitions_log_insert
  after insert on public.card_definitions
  for each row execute function public.log_catalog_change();

drop trigger if exists card_definitions_log_update on public.card_definitions;
create trigger card_definitions_log_update
  after update on public.card_definitions
  for each row when (old.* is distinct from new.*)
  execute function public.log_catalog_change();

drop trigger if exists card_print_faces_log_update on public.card_print_faces;
create trigger card_print_faces_log_update
  after update on public.card_print_faces
  for each row when (old.* is distinct from new.*)
  execute function public.log_catalog_change();

drop trigger if exists card_print_faces_log_delete on public.card_print_faces;
create trigger card_print_faces_log_delete
  after delete on public.card_print_faces
  for each row execute function public.log_catalog_change();

drop trigger if exists card_definition_faces_log_update on public.card_definition_faces;
create trigger card_definition_faces_log_update
  after update on public.card_definition_faces
  for each row when (old.* is distinct from new.*)
  execute function public.log_catalog_change();

-- RLS on, NO policy: only roles that bypass RLS (service_role, the definer) see rows.
alter table public.catalog_changes enable row level security;

-- Explicit revokes: the prod default ACL grants anon/authenticated write (incl.
-- TRUNCATE, which bypasses RLS) on every new table and sequence.
revoke all on table public.catalog_changes from public, anon, authenticated;
revoke all on sequence public.catalog_changes_id_seq from public, anon, authenticated;

-- The digest (story 3.3) reads the journal with the service-role key. Read only:
-- the default ACL also gives service_role write access, which nothing needs (the
-- triggers write through the SECURITY DEFINER function).
grant select on table public.catalog_changes to service_role;
revoke insert, update, delete, truncate on table public.catalog_changes from service_role;
