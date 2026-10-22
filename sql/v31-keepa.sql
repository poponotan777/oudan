-- ============================================================
-- v31:Keepaの記録の置き場所+Amazonの行に記録を作らない(SQL Editor で1回実行)
--   何度流しても安全です。KEEPA_KEY を入れるまでは、表は空のまま何もしません。
--
--   ■ keepa_hist(ASINごとに、日ごとの最安値の90日分+統計)
--     ・公開キー(サイト・Xツール)からは読めない(Keepa規約18条7項:第三者がプログラムで取り出せる形にしない)
--     ・サーバー(Vercel の SUPABASE_SECRET_KEY)と自動取得だけが読み書きする
--     ・Keepaを解約したら60日以内に消す(Keepa規約18条8項)→ いちばん下の「解約したとき」を実行
-- ============================================================

create table if not exists public.keepa_hist (
  asin        text primary key,          -- Amazonの商品番号(offers.code と同じ)
  ptype       text,                      -- buybox(カートの値段)/ new(新品の最安)
  hist_start  date,
  hist        integer[],                 -- 日ごとの最安値(日本時間)。記録の無い日は null
  days        smallint not null default 0,
  median90    integer,
  min90       integer,
  max90       integer,
  distinct90  smallint,
  min_day     date,
  fetched_at  timestamptz not null default now()
);
create index if not exists keepa_hist_fetched_idx on public.keepa_hist (fetched_at);

alter table public.keepa_hist enable row level security;
-- 読み書きの決まり(policy)は作らない = 公開キーでは読めない
revoke all on public.keepa_hist from anon, authenticated;
grant all on public.keepa_hist to service_role;

-- トップの「お得」用:今のAmazonの値段(24時間以内)が、Keepaの記録の中央値より安い商品
create or replace function public.keepa_deals(_min_days integer default 7, _ratio numeric default 0.92, _limit integer default 300)
returns table (pkey text, price integer, median90 integer, days smallint)
language sql
stable
security definer
set search_path = public
as $$
  select o.pkey, o.price, k.median90, k.days
    from public.offers o
    join public.keepa_hist k on k.asin = o.code
    join public.products p on p.pkey = o.pkey
   where o.store = 'amazon'
     and o.updated_at > now() - interval '24 hours'
     and o.price >= 300
     and p.merged_into is null
     and k.days >= _min_days and k.median90 > 0
     and o.price <= k.median90 * _ratio
   order by (k.median90 - o.price)::numeric / k.median90 desc
   limit greatest(1, least(_limit, 1000))
$$;
revoke execute on function public.keepa_deals(integer, numeric, integer) from public, anon, authenticated;
grant  execute on function public.keepa_deals(integer, numeric, integer) to service_role;

-- ------------------------------------------------------------
-- Amazonの価格行には90日の記録を作らない(Amazonのデータは24時間まで)
--   これまでは record_offers が1日分の記録を作り、自動取得の最後に毎回まとめて消していた
--   (Amazonの全行を書き直すのでDBの読み書きが多かった)。書き込むときに空にする
-- ------------------------------------------------------------
create or replace function public.offers_amazon_nohist()
returns trigger
language plpgsql
as $$
begin
  new.hist := null; new.hist_start := null; new.days := null;
  new.median90 := null; new.min90 := null; new.rank90 := null; new.distinct90 := null;
  return new;
end $$;

drop trigger if exists offers_amazon_nohist on public.offers;
create trigger offers_amazon_nohist
  before insert or update on public.offers
  for each row when (new.store = 'amazon')
  execute function public.offers_amazon_nohist();

-- 残っている分を一度だけ空にする
update public.offers
   set hist = null
 where store = 'amazon' and (hist is not null or median90 is not null or days is not null);

select
  (select count(*) from public.keepa_hist) as "Keepaの記録(キーを入れるまでは0)",
  (select count(*) from public.offers where store = 'amazon' and hist is not null) as "Amazonの行に残った記録(0ならOK)";

-- ============================================================
-- ■ Keepaを解約したとき(60日以内に実行。Keepa規約18条8項)
--   1. GitHub の Settings → Secrets から KEEPA_KEY を消す
--   2. 下の1行の先頭の「-- 」を外して実行
-- truncate table public.keepa_hist;
-- ============================================================
