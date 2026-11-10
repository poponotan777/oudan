-- ============================================================
-- v37:DBの容量を減らす(無料枠500MBに近づいているため)
--   ■ 手順1:このファイルを丸ごと SQL Editor に貼って Run(1〜2分かかることがあります)
--     ・商品の上限を15万→11万件に、値段がどのサイトにも無い商品・見つからない補完予約を消す
--     ・すぐに1回掃除して、表ごとの大きさを表示
--   ■ 手順2:いちばん下の「VACUUM FULL」の行を、1行ずつ新しい画面に貼って Run
--     (消した行の跡を詰めて、容量を実際に減らす。1つ数十秒〜数分。その間その表への書き込みは待たされます)
-- ============================================================

create or replace function public.prune_catalog()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d1 integer := 0; d2 integer := 0; d3 integer := 0; dlow integer := 0; dcap integer := 0;
  today date := (now() at time zone 'Asia/Tokyo')::date;
  cap integer := 110000;   -- v37:15万→11万(無料枠500MBに収めるため)
  total integer;
  has_ci boolean := to_regclass('public.collection_items') is not null;
begin
  drop table if exists _gone;
  create temp table _gone (pkey text primary key) on commit drop;

  -- ① 45日見かけなかった商品(まとめに入っているものは除く)
  insert into _gone
  select p.pkey from public.products p
   where p.merged_into is null and p.last_seen < today - 45
     and (not has_ci or not exists (select 1 from public.collection_items ci where ci.product_key = p.pkey))
  on conflict do nothing;

  -- ② ランキング下位だけの商品:圏外になって3日たったら削除
  insert into _gone
  select p.pkey from public.products p
   where p.merged_into is null
     and not p.is_brand
     and p.pop is null
     and p.last_seen < today - 3
     and (p.top_day is null or p.top_day < today - 30)
     and (select count(*) from public.offers o where o.pkey = p.pkey) <= 1
     and (not has_ci or not exists (select 1 from public.collection_items ci where ci.product_key = p.pkey))
  on conflict do nothing;
  get diagnostics dlow = row_count;

  -- ④ v37:どのサイトにも値段が無いまま7日たった商品(画面に出せない)
  insert into _gone
  select p.pkey from public.products p
   where p.merged_into is null and not p.is_brand
     and p.last_seen < today - 7
     and not exists (select 1 from public.offers o where o.pkey = p.pkey)
     and (not has_ci or not exists (select 1 from public.collection_items ci where ci.product_key = p.pkey))
  on conflict do nothing;

  -- ③ 安全装置:それでも15万件を超えていたら、価値の低い古いものから削除
  select count(*) into total from public.products where merged_into is null;
  total := total - (select count(*) from _gone);
  if total > cap then
    insert into _gone
    select p.pkey from public.products p
     where p.merged_into is null and not p.is_brand
       and not exists (select 1 from _gone g where g.pkey = p.pkey)
       and (not has_ci or not exists (select 1 from public.collection_items ci where ci.product_key = p.pkey))
     order by (p.top_day is not null) asc, p.pop desc nulls first, p.last_seen asc
     limit total - cap
    on conflict do nothing;
    get diagnostics dcap = row_count;
  end if;

  delete from public.offers o using _gone g where o.pkey = g.pkey;
  get diagnostics d1 = row_count;
  delete from public.products p using _gone g where p.pkey = g.pkey;
  get diagnostics d2 = row_count;
  -- 統合先が消えた転送用の行も消す
  delete from public.products p
   where p.merged_into is not null
     and not exists (select 1 from public.products t where t.pkey = p.merged_into);
  delete from public.fill_queue q where not exists (select 1 from public.products p where p.pkey = q.pkey);
  -- v37:何度探しても見つからない予約は消す(5回以上)
  delete from public.fill_queue q where q.tries >= 5;
  delete from public.collect_runs where started_at < now() - interval '30 days';
  get diagnostics d3 = row_count;
  return format('商品削除:%s(うち下位の圏外:%s・上限超え:%s) / 価格行削除:%s / 実行記録削除:%s', d2, dlow, dcap, d1, d3);
end $$;

revoke execute on function public.prune_catalog() from public, anon, authenticated;
grant  execute on function public.prune_catalog() to service_role;

-- 今すぐ1回掃除
select public.prune_catalog() as "掃除の結果";

-- 表ごとの大きさ(手順2の前後で比べる)
select c.relname as "名前", pg_size_pretty(pg_total_relation_size(c.oid)) as "大きさ(索引込み)"
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc limit 10;

-- ============================================================
-- ■ 手順2(1行ずつ実行。トランザクションの中では動かないため)
-- vacuum full public.offers;
-- vacuum full public.products;
-- vacuum full public.fill_queue;
-- vacuum full public.collect_runs;
-- select pg_size_pretty(pg_database_size(current_database())) as "DB容量";
-- ============================================================
