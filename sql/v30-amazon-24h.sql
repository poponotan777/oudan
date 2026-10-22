-- ============================================================
-- v30:Amazonのデータは24時間まで(Amazonアソシエイト・プログラム・ポリシー「本ライセンス」2(h))
--   1回だけ実行してください(以後は自動取得が毎回、古いAmazonの行を消します)
-- ============================================================

-- 24時間より前に取ったAmazonの価格行を消す
delete from public.offers where store = 'amazon' and updated_at < now() - interval '24 hours';

-- Amazonの90日の記録を消す
update public.offers
   set hist = null, hist_start = null, days = null, median90 = null, min90 = null, rank90 = null, distinct90 = null
 where store = 'amazon';

-- Amazonの画像URLを商品の画像にしているものを消す(Amazonの価格行が無い商品)
update public.products p
   set image = null
 where p.image like '%amazon%'
   and not exists (select 1 from public.offers o where o.pkey = p.pkey and o.store = 'amazon');

-- 商品まとめの「作成時の価格」からAmazonを消す
update public.collection_items set prices = prices - 'amazon' where prices ? 'amazon';

select count(*) as "残っているAmazonの価格行(24時間以内)" from public.offers where store = 'amazon';
