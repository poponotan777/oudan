-- ============================================================
-- オウダン用テーブル作成SQL
-- Supabaseダッシュボード左メニュー「SQL Editor」に
-- このファイルの中身を全部貼り付けて「Run」を1回押すだけ
-- ============================================================

-- 欲しいものリスト(ユーザーごと)
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  jan text not null,
  name text not null,
  image text,
  created_at timestamptz not null default now(),
  unique (user_id, jan)
);

alter table public.wishlists enable row level security;

-- 自分の行だけ読み書きできる
create policy "wishlists_select_own" on public.wishlists
  for select using (auth.uid() = user_id);
create policy "wishlists_insert_own" on public.wishlists
  for insert with check (auth.uid() = user_id);
create policy "wishlists_delete_own" on public.wishlists
  for delete using (auth.uid() = user_id);

-- 価格履歴(全ユーザー共通・毎日cronが記録)
create table if not exists public.price_history (
  id bigint generated always as identity primary key,
  jan text not null,
  store text not null,
  price integer not null,
  recorded_at date not null default current_date,
  unique (jan, store, recorded_at)
);

alter table public.price_history enable row level security;

-- 誰でも閲覧可(書き込みはサーバーの秘密キー経由のみ)
create policy "price_history_read_all" on public.price_history
  for select using (true);

-- 検索を速くするインデックス
create index if not exists idx_price_history_jan on public.price_history (jan, recorded_at);
create index if not exists idx_wishlists_jan on public.wishlists (jan);
