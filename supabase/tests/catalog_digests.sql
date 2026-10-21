-- Replays the contract of publish_catalog_digest() (story 3.3, migration
-- 20261022120000_create_catalog_digests.sql) inside a transaction that is ROLLED
-- BACK. Fails with `raise exception` on the first gap. Runs as service_role, the
-- only role allowed to execute the function.
--
--   docker exec -i supabase_db_scute_swarm psql -U postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/catalog_digests.sql

begin;

-- The marker may already exist (a real digest ran): start from it.
create temporary table _t_base on commit drop as
  select coalesce(max(last_change_id), 0) as change_id,
         max(last_migration_recorded_at) as migration_at
  from public.catalog_digests;
grant select on _t_base to service_role;

set local role service_role;

do $$
declare
  b_change bigint;
  b_mig    timestamptz;
  m1       timestamptz;
  v_slug   text;
  v_slug2  text;
  v_art    uuid;
  n        int;
  failed   boolean;
begin
  select change_id, migration_at into b_change, b_mig from _t_base;
  m1 := coalesce(b_mig, '2000-01-01'::timestamptz) + interval '1 second';

  -- ---------------------------------------------------------------------------
  -- Stale window: the caller's marker differs from the stored one -> raises.
  -- ---------------------------------------------------------------------------
  failed := false;
  begin
    perform public.publish_catalog_digest(
      'zz-test-digest', 't', 't', 'b', 'b',
      b_change + 1000, b_mig, b_change + 2000, m1);
  exception when others then
    failed := sqlerrm like '%stale window%';
  end;
  if not failed then raise exception 'stale window: expected an exception'; end if;

  -- ---------------------------------------------------------------------------
  -- Null titles -> null return, no article, marker advanced.
  -- ---------------------------------------------------------------------------
  select count(*) into n from public.articles;
  v_slug := public.publish_catalog_digest(
    null, null, null, null, null, b_change, b_mig, b_change + 10, m1);
  if v_slug is not null then raise exception 'null titles: expected null, got %', v_slug; end if;
  if (select count(*) from public.articles) <> n then
    raise exception 'null titles: an article was inserted';
  end if;
  if (select max(last_change_id) from public.catalog_digests) <> b_change + 10
     or (select max(last_migration_recorded_at) from public.catalog_digests) <> m1 then
    raise exception 'null titles: marker not advanced';
  end if;
  if exists (select 1 from public.catalog_digests
             where last_change_id = b_change + 10 and article_id is not null) then
    raise exception 'null titles: marker row has an article';
  end if;

  -- ---------------------------------------------------------------------------
  -- Marker going backwards (change id, then migration) -> raises.
  -- ---------------------------------------------------------------------------
  failed := false;
  begin
    perform public.publish_catalog_digest(
      null, null, null, null, null, b_change + 10, m1, b_change + 5, m1);
  exception when others then
    failed := sqlerrm like '%backwards%';
  end;
  if not failed then raise exception 'backwards (change id): expected an exception'; end if;

  failed := false;
  begin
    perform public.publish_catalog_digest(
      null, null, null, null, null, b_change + 10, m1, b_change + 10, m1 - interval '1 day');
  exception when others then
    failed := sqlerrm like '%backwards%';
  end;
  if not failed then raise exception 'backwards (migration): expected an exception'; end if;

  -- ---------------------------------------------------------------------------
  -- Same slug twice -> slug, then slug-2; each with its marker row.
  -- ---------------------------------------------------------------------------
  v_slug := public.publish_catalog_digest(
    'zz-test-digest', 'Titre', 'Title', 'Corps', 'Body', b_change + 10, m1, b_change + 20, m1);
  if v_slug is distinct from 'zz-test-digest' then
    raise exception 'slug: expected zz-test-digest, got %', v_slug;
  end if;
  v_slug2 := public.publish_catalog_digest(
    'zz-test-digest', 'Titre', 'Title', 'Corps', 'Body', b_change + 20, m1, b_change + 30, m1);
  if v_slug2 is distinct from 'zz-test-digest-2' then
    raise exception 'slug: expected zz-test-digest-2, got %', v_slug2;
  end if;
  select a.id into v_art from public.articles a
  where a.slug = 'zz-test-digest' and a.category = 'catalogue' and a.source = 'catalog-digest';
  if v_art is null then raise exception 'article: row missing or wrong category/source'; end if;
  if not exists (select 1 from public.catalog_digests
                 where article_id = v_art and last_change_id = b_change + 20) then
    raise exception 'article: marker row not linked to the article';
  end if;
end;
$$;

-- Deleting an article (service_role can) keeps its marker row, article_id -> null.
reset role;
do $$
declare
  v_art   uuid;
  v_max   bigint;
begin
  select id into v_art from public.articles where slug = 'zz-test-digest';
  select max(last_change_id) into v_max from public.catalog_digests;
  delete from public.articles where id = v_art;
  if exists (select 1 from public.catalog_digests where article_id = v_art) then
    raise exception 'delete: article_id not set to null';
  end if;
  if (select max(last_change_id) from public.catalog_digests) <> v_max then
    raise exception 'delete: marker rewound';
  end if;
  raise notice 'catalog_digests: all checks passed';
end;
$$;

rollback;
