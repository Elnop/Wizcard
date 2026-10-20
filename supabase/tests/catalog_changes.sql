-- Replays the I/O matrix of story 3.1 (catalog change journal) against the triggers
-- of 20261020120000_create_catalog_changes.sql, on throwaway rows inside a
-- transaction that is ROLLED BACK. Fails with `raise exception` on the first gap.
-- Every count is restricted to the test ids, so a concurrent seed committing journal
-- rows cannot make it fail.
--
--   docker exec -i supabase_db_scute_swarm psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/catalog_changes.sql

begin;

do $$
declare
  d1 constant uuid := '00000000-0000-4000-8000-0000000000d1';
  p1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  p2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  n int;
  r record;

  -- Journal rows written for the test ids since the last checkpoint.
  base bigint := 0;
begin
  select coalesce(max(id), 0) into base from public.catalog_changes;

  -- ---------------------------------------------------------------------------
  -- New definition / new print -> 1 `added` row each; face INSERTs log nothing.
  -- ---------------------------------------------------------------------------
  insert into public.card_definitions (oracle_id, name, oracle_text, legalities, edhrec_rank)
  values (d1, 'Test Card', 'Flying', '{"standard":"legal"}', 100);
  insert into public.card_definition_faces (oracle_id, face_index, name, oracle_text)
  values (d1, 0, 'Front', 'Flying'), (d1, 1, 'Back', 'Vigilance');
  insert into public.card_prints (id, oracle_id, set, collector_number, lang, image_status, printed_text)
  values (p1, d1, 'zzt', '1', 'en', 'lowres', null);
  insert into public.card_print_faces (print_id, face_index, printed_name, image_uris)
  values (p1, 0, 'Front', '{"normal":"a"}'), (p1, 1, 'Back', '{"normal":"b"}');

  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 2 then raise exception 'inserts: expected 2 rows, got %', n; end if;
  if not exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
                 and entity = 'definition' and change = 'added' and oracle_id = d1
                 and print_id is null and field is null) then
    raise exception 'inserts: missing definition added row';
  end if;
  if not exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
                 and entity = 'print' and change = 'added' and print_id = p1 and oracle_id = d1
                 and field is null) then
    raise exception 'inserts: missing print added row';
  end if;
  select max(id) into base from public.catalog_changes;

  -- ---------------------------------------------------------------------------
  -- Identical upserts (the seed's ON CONFLICT DO UPDATE) -> 0 rows.
  -- ---------------------------------------------------------------------------
  insert into public.card_definitions (oracle_id, name, oracle_text, legalities, edhrec_rank)
  values (d1, 'Test Card', 'Flying', '{"standard":"legal"}', 100)
  on conflict (oracle_id) do update set
    name = excluded.name, oracle_text = excluded.oracle_text,
    legalities = excluded.legalities, edhrec_rank = excluded.edhrec_rank;
  insert into public.card_definition_faces (oracle_id, face_index, name, oracle_text)
  values (d1, 0, 'Front', 'Flying'), (d1, 1, 'Back', 'Vigilance')
  on conflict (oracle_id, face_index) do update set
    name = excluded.name, oracle_text = excluded.oracle_text;
  insert into public.card_prints (id, oracle_id, set, collector_number, lang, image_status, printed_text)
  values (p1, d1, 'zzt', '1', 'en', 'lowres', null)
  on conflict (id) do update set
    oracle_id = excluded.oracle_id, set = excluded.set,
    collector_number = excluded.collector_number, lang = excluded.lang,
    image_status = excluded.image_status, printed_text = excluded.printed_text;
  insert into public.card_print_faces (print_id, face_index, printed_name, image_uris)
  values (p1, 0, 'Front', '{"normal":"a"}'), (p1, 1, 'Back', '{"normal":"b"}')
  on conflict (print_id, face_index) do update set
    printed_name = excluded.printed_name, image_uris = excluded.image_uris;
  -- Only updated_at moves -> still nothing.
  update public.card_prints set updated_at = updated_at + interval '1 day' where id = p1;

  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 0 then raise exception 'identical upsert: expected 0 rows, got %', n; end if;

  -- ---------------------------------------------------------------------------
  -- Only edhrec_rank changes -> 0 rows.
  -- ---------------------------------------------------------------------------
  update public.card_definitions set edhrec_rank = 42 where oracle_id = d1;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 0 then raise exception 'edhrec_rank only: expected 0 rows, got %', n; end if;

  -- ---------------------------------------------------------------------------
  -- Print fields changed -> 1 `updated` row per field with old/new values.
  -- ---------------------------------------------------------------------------
  update public.card_prints
  set image_status = 'highres_scan', printed_text = 'Vol'
  where id = p1;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 2 then raise exception 'print update: expected 2 rows, got %', n; end if;
  if not exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
                 and entity = 'print' and change = 'updated' and print_id = p1 and oracle_id = d1
                 and field = 'image_status'
                 and old_value = '"lowres"' and new_value = '"highres_scan"') then
    raise exception 'print update: bad image_status row';
  end if;
  if not exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
                 and entity = 'print' and field = 'printed_text'
                 and old_value = 'null' and new_value = '"Vol"') then
    raise exception 'print update: bad printed_text row';
  end if;
  select max(id) into base from public.catalog_changes;

  -- ---------------------------------------------------------------------------
  -- Oracle / legalities changed (+ edhrec_rank in the same UPDATE) -> 2 rows.
  -- ---------------------------------------------------------------------------
  update public.card_definitions
  set oracle_text = 'Flying, haste', legalities = '{"standard":"banned"}', edhrec_rank = 7
  where oracle_id = d1;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 2 then raise exception 'definition update: expected 2 rows, got %', n; end if;
  if exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1) and field = 'edhrec_rank') then
    raise exception 'definition update: edhrec_rank must not be journaled';
  end if;
  if not exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
                 and entity = 'definition' and change = 'updated' and oracle_id = d1
                 and print_id is null and field = 'legalities'
                 and old_value = '{"standard":"legal"}' and new_value = '{"standard":"banned"}') then
    raise exception 'definition update: bad legalities row';
  end if;
  select max(id) into base from public.catalog_changes;

  -- Definition face changed -> 1 row with oracle_id + face_index.
  update public.card_definition_faces set oracle_text = 'Vigilance, trample'
  where oracle_id = d1 and face_index = 1;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 1 then raise exception 'definition face update: expected 1 row, got %', n; end if;
  if not exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
                 and entity = 'definition_face' and change = 'updated'
                 and oracle_id = d1 and face_index = 1 and field = 'oracle_text'
                 and old_value = '"Vigilance"' and new_value = '"Vigilance, trample"') then
    raise exception 'definition face update: bad row';
  end if;
  select max(id) into base from public.catalog_changes;

  -- ---------------------------------------------------------------------------
  -- Print face modified through an upsert -> 1 row per field (print_id, face_index).
  -- ---------------------------------------------------------------------------
  insert into public.card_print_faces (print_id, face_index, printed_name, image_uris)
  values (p1, 0, 'Front', '{"normal":"a2"}'), (p1, 1, 'Back', '{"normal":"b"}')
  on conflict (print_id, face_index) do update set
    printed_name = excluded.printed_name, image_uris = excluded.image_uris;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 1 then raise exception 'print face upsert: expected 1 row, got %', n; end if;
  if not exists (select 1 from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
                 and entity = 'print_face' and change = 'updated'
                 and print_id = p1 and face_index = 0 and field = 'image_uris'
                 and old_value = '{"normal":"a"}' and new_value = '{"normal":"a2"}') then
    raise exception 'print face upsert: bad row';
  end if;
  select max(id) into base from public.catalog_changes;

  -- ---------------------------------------------------------------------------
  -- Faces gone from an existing print (2 -> 0) -> 1 `removed` row per face.
  -- ---------------------------------------------------------------------------
  delete from public.card_print_faces where print_id = p1 and face_index >= 0;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 2 then raise exception 'face removal: expected 2 rows, got %', n; end if;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1)
    and entity = 'print_face' and change = 'removed' and print_id = p1
    and old_value is not null;
  if n <> 2 then raise exception 'face removal: expected 2 print_face removed rows, got %', n; end if;
  select max(id) into base from public.catalog_changes;

  -- ---------------------------------------------------------------------------
  -- Print removed (drift) -> 1 `removed` row with the full row; cascaded faces silent.
  -- ---------------------------------------------------------------------------
  insert into public.card_prints (id, oracle_id, set, collector_number, lang, printed_name)
  values (p2, d1, 'zzt', '2', 'fr', 'Carte test');
  insert into public.card_print_faces (print_id, face_index, printed_name)
  values (p2, 0, 'Recto'), (p2, 1, 'Verso');
  select max(id) into base from public.catalog_changes; -- skip p2's `added` row

  delete from public.card_prints where id = p2;
  select count(*) into n from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if n <> 1 then raise exception 'print removal: expected 1 row, got %', n; end if;
  select * into r from public.catalog_changes where id > base and (print_id in (p1, p2) or oracle_id = d1);
  if r.entity <> 'print' or r.change <> 'removed' or r.print_id <> p2 or r.oracle_id <> d1
     or r.field is not null or r.new_value is not null
     or r.old_value->>'id' <> p2::text or r.old_value->>'printed_name' <> 'Carte test'
     or r.old_value->>'collector_number' <> '2' then
    raise exception 'print removal: bad row %', row_to_json(r);
  end if;

  raise notice 'catalog_changes: all I/O matrix scenarios passed';
end;
$$;

rollback;
