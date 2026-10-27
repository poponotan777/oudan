-- ============================================================
-- v35:Query Performance で遅かった問い合わせの対策(SQL Editor で1回実行。何度流しても安全)
--   ・自動取得(service_role)の時間切れを8秒→60秒に
--     (価格の書き込み record_offers が最大7.99秒・補完の予約 enqueue_missing が最大7.8秒で、
--      8秒を超えるとその回の500件がまとめて失敗していた)
--     サイトを見る人(anon)の時間切れは今のまま
--   ・トップの「急上昇」「定番」を探す索引
-- ============================================================

alter role service_role set statement_timeout = '60s';
notify pgrst, 'reload config';

-- 急上昇:offers の store ごとに trend の大きい順
create index if not exists offers_trend_idx on public.offers (store, trend desc) where trend > 0;
-- 定番:offers の store ごとに売れ筋順位の順
create index if not exists offers_rank_idx on public.offers (store, rank) where rank is not null;

-- v32 の索引(商品名の部分一致)がまだなら作る
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);

analyze public.offers;
analyze public.products;

select rolname, rolconfig from pg_roles where rolname = 'service_role';
