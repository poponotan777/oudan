-- ============================================================
-- v34:自動取得の最初の「DB容量の確認」が時間切れで失敗する(statement timeout)のを直す
--   SQL Editor で1回実行。何度流しても安全です。
--   件数を数え上げる(count(*))のをやめ、Postgres が持っている見積もりの件数を使う(一瞬で終わる)
-- ============================================================
create or replace function public.db_usage()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'products', (select greatest(c.reltuples, 0)::bigint from pg_class c where c.oid = 'public.products'::regclass),
    'offers',   (select greatest(c.reltuples, 0)::bigint from pg_class c where c.oid = 'public.offers'::regclass),
    'queue',    (select greatest(c.reltuples, 0)::bigint from pg_class c where c.oid = 'public.fill_queue'::regclass),
    'estimated', true,
    'tables', (
      select jsonb_object_agg(c.relname, pg_total_relation_size(c.oid))
        from pg_class c join pg_namespace s on s.oid = c.relnamespace
       where s.nspname = 'public' and c.relkind = 'r'
    )
  );
$$;
revoke execute on function public.db_usage() from public, anon, authenticated;
grant  execute on function public.db_usage() to service_role;

select public.db_usage() -> 'db_bytes' as "DB容量(バイト)";
