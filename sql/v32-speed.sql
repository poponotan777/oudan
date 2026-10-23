-- ============================================================
-- v32:おすすめ・検索を速くする(SQL Editor で1回実行。何度流しても安全)
--   1. 商品名の部分一致(「シャンプー」を含む…)を速くする索引(pg_trgm)
--      → 「あなたへのおすすめ」「似た商品」「DBから探す」が速くなる
--   2. トップの「お得」を探す索引
--   3. 種類ごとの人気商品を、自動取得のたびに作っておく表(concept_picks)
--      → 画面はこの表を1行読むだけ(これまでは毎回、全商品から名前で探していた)
-- ============================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;   -- Supabase の標準の置き場所
create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);

-- トップの「お得」探し(記録3日以上の行だけ、何番目に安いか順)を速くする
create index if not exists offers_deal_rank_idx on public.offers (store, rank90) where days >= 3 and median90 > 0;

create table if not exists public.concept_picks (
  id          text primary key,           -- lib/reco.js の種類の id(shampoo など)
  pkeys       text[] not null default '{}',
  updated_at  timestamptz not null default now()
);
alter table public.concept_picks enable row level security;
drop policy if exists concept_picks_read on public.concept_picks;
create policy concept_picks_read on public.concept_picks for select using (true);
grant select on public.concept_picks to anon, authenticated;
grant all on public.concept_picks to service_role;

select count(*) as "作っておいた種類(自動取得の後に100前後になります)" from public.concept_picks;
