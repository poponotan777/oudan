import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writePriceRows } from "../../../lib/priceSlot";

// ホーム画面「本日のピックアップ」
// Yahoo!検索から値引き率の高い日用品を抽出し、
// 自前の価格履歴と照合して「過去最安圏」も判定する
export const revalidate = 1800; // 30分キャッシュ

const KEYWORDS = ["シャンプー", "洗剤", "トイレットペーパー", "柔軟剤", "ハミガキ"];

function vcAffiliateUrl(targetUrl) {
  const sid = process.env.VC_SID;
  const pid = process.env.VC_PID;
  if (!sid || !pid) return targetUrl;
  return `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${sid}&pid=${pid}&vc_url=${encodeURIComponent(targetUrl)}`;
}

export async function GET() {
  const picks = [];
  const recommendPool = [];
  for (const kw of KEYWORDS) {
    try {
      const params = new URLSearchParams({
        appid: process.env.YAHOO_CLIENT_ID,
        query: kw,
        results: "20",
        sort: "-review_count",
      });
      const res = await fetch(
        `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`,
        { next: { revalidate: 1800 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      let recCount = 0;
      for (const h of data.hits || []) {
        // レビュー数上位をおすすめ候補に(キーワードごとに2件まで)
        if (recCount < 2 && h.image?.medium && (h.review?.count || 0) >= 50) {
          recommendPool.push({
            store: "yahoo",
            name: h.name,
            price: h.price,
            url: vcAffiliateUrl(h.url),
            image: h.image.medium,
            rating: h.review?.rate || 0,
            reviews: h.review?.count || 0,
            jan: h.janCode || null,
          });
          recCount++;
        }
        const def = h.priceLabel?.defaultPrice;
        const now = h.price;
        const discount = def && def > now ? Math.round(((def - now) / def) * 100) : 0;
        if (discount >= 10) {
          picks.push({
            store: "yahoo",
            name: h.name,
            price: now,
            originalPrice: def,
            discount,
            url: vcAffiliateUrl(h.url),
            image: h.image?.medium || null,
            rating: h.review?.rate || 0,
            reviews: h.review?.count || 0,
            jan: h.janCode || null,
            keyword: kw,
          });
        }
      }
    } catch {
      // 1キーワードの失敗で全体を止めない
    }
  }

  // 値引き率順に上位を採用
  picks.sort((a, b) => b.discount - a.discount);
  const top = picks.slice(0, 12);

  // 価格履歴と照合して「過去最安圏」を付与
  try {
    const jans = top.map((p) => p.jan).filter(Boolean);
    if (jans.length && process.env.SUPABASE_SECRET_KEY) {
      const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
      const { data: hist } = await admin
        .from("price_history")
        .select("jan, price")
        .in("jan", jans);
      const minByJan = {};
      for (const r of hist || []) {
        if (!(r.jan in minByJan) || r.price < minByJan[r.jan]) minByJan[r.jan] = r.price;
      }
      for (const p of top) {
        if (p.jan && p.jan in minByJan && p.price <= minByJan[p.jan] * 1.02) {
          p.lowestEver = true;
        }
      }
    }
  } catch {}

  // おすすめ: レビュー数順に上位8件(JAN重複除去)
  const seen = new Set();
  const recommend = recommendPool
    .sort((a, b) => b.reviews - a.reviews)
    .filter((p) => {
      const key = p.jan || p.name.slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  // ピックアップ便乗記録: 取得した価格を履歴に書き込む(ゼロコスト)
  try {
    if (process.env.SUPABASE_SECRET_KEY) {
      const admin2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
      const rows = [];
      const seen2 = new Set();
      for (const p of [...picks, ...recommendPool]) {
        if (!p.jan || seen2.has(p.jan)) continue;
        seen2.add(p.jan);
        rows.push({ jan: p.jan, store: "yahoo", price: p.price });
      }
      if (rows.length) {
        await writePriceRows(admin2, rows);
      }
    }
  } catch {}

  // 値引き強度: 本日どれくらいセールが盛んかの実測指標(公式APIデータのみ使用)
  const heat = {
    count: picks.length,
    avgDiscount: picks.length ? Math.round(picks.reduce((s, x) => s + x.discount, 0) / picks.length) : 0,
    maxDiscount: picks.length ? Math.max(...picks.map((x) => x.discount)) : 0,
  };

  return NextResponse.json({ picks: top, recommend, heat, generatedAt: new Date().toISOString() });
}
