"use client";
import { RAKUTEN_ITEM_SEARCH_URL } from "./rakutenEndpoint";
// ============================================================
// 楽天API(Webアプリケーション型)をブラウザから直接呼び出す
// Web型はブラウザの発信元(Origin)で認証するため、
// キーはNEXT_PUBLIC_として公開される設計(楽天の想定通り)
// ============================================================

// 楽天の1件 → 画面の「店舗の価格」
function toOffer(it) {
  return {
    store: "rakuten",
    name: it.itemName,
    price: it.itemPrice,
    shipping: it.postageFlag === 0 ? 0 : null,
    url: it.affiliateUrl || it.itemUrl,
    image:
      (typeof it.mediumImageUrls?.[0] === "string"
        ? it.mediumImageUrls[0]
        : it.mediumImageUrls?.[0]?.imageUrl
      )?.replace("?_ex=128x128", "?_ex=300x300") || null,
    rating: it.reviewAverage || 0,
    reviews: it.reviewCount || 0,
    shop: it.shopName,
    jan: null,
    code: it.itemCode || null,
  };
}

// v29:まずオウダンのサーバー(/api/rakuten・30分キャッシュ)に聞く。
//      同じキーワードを誰かが30分以内に探していれば、楽天APIを使わずに返る。
//      サーバーで失敗したときだけ、ブラウザから直接楽天を呼ぶ
export async function searchRakutenClient(keyword, hits = 30, page = 1, sort = null, minPrice = null, maxPrice = null) {
  const kw = String(keyword || "").trim().replace(/\s+/g, " ");
  const qs = new URLSearchParams({ keyword: kw, hits: String(hits), page: String(page), sort: sort || "standard" });
  if (minPrice) qs.set("min", String(minPrice));
  if (maxPrice) qs.set("max", String(maxPrice));
  try {
    const r = await fetch(`/api/rakuten?${qs}`);
    if (r.ok) {
      const d = await r.json();
      if (d.ok) return (d.items || []).map(toOffer);
    }
  } catch {}
  return searchRakutenDirect(kw, hits, page, sort, minPrice, maxPrice);
}

// ブラウザから直接(予備)
async function searchRakutenDirect(keyword, hits, page, sort, minPrice, maxPrice) {
  const params = new URLSearchParams({
    applicationId: process.env.NEXT_PUBLIC_RAKUTEN_APP_ID,
    accessKey: process.env.NEXT_PUBLIC_RAKUTEN_ACCESS_KEY,
    affiliateId: process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID || "",
    keyword,
    hits: String(hits),
    page: String(page),
    sort: sort || "standard",
    formatVersion: "2",
    format: "json",
  });
  if (minPrice) params.set("minPrice", String(minPrice));
  if (maxPrice) params.set("maxPrice", String(maxPrice));
  try {
    const res = await fetch(`${RAKUTEN_ITEM_SEARCH_URL}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.Items || []).map(toOffer);
  } catch {
    return [];
  }
}
