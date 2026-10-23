// オウダンのDBから商品を探す(v29)/api/dbsearch?q=キーワード
//   自動取得で記録済みの商品は、楽天・Yahoo!のAPIを使わずにここから出す(3サイトの値段・90日の記録つき)
//   同じキーワードは30分ほど使い回す(CDNのキャッシュ)
import { NextResponse } from "next/server";
import { publicDb } from "../../../lib/supabaseServer";
import { loadCatalog, offerFromDb } from "../../../lib/catalog";
import { STORE_ORDER } from "../../../lib/priceView";

const LIMIT = 60;

export async function GET(req) {
  const q = String(new URL(req.url).searchParams.get("q") || "").trim().slice(0, 60);
  if (!q) return NextResponse.json({ items: [] });
  const words = q.replace(/[%_,()*]/g, " ").split(/\s+/).filter(Boolean).slice(0, 4);
  const sb = publicDb();
  let rows = [];
  try {
    let qb = sb.from("products").select("pkey").is("merged_into", null).not("pop", "is", null);
    for (const w of words) qb = qb.ilike("name", `%${w}%`);
    const { data } = await qb.order("pop", { ascending: true }).limit(LIMIT);
    rows = data || [];
    // 売れ筋の記録がない商品も、足りなければ足す
    if (rows.length < LIMIT) {
      let q2 = sb.from("products").select("pkey").is("merged_into", null).is("pop", null);
      for (const w of words) q2 = q2.ilike("name", `%${w}%`);
      const { data: more } = await q2.order("last_seen", { ascending: false }).limit(LIMIT - rows.length);
      rows = [...rows, ...(more || [])];
    }
  } catch {}
  const keys = rows.map((r) => r.pkey);
  const cat = keys.length ? await loadCatalog(sb, keys).catch(() => new Map()) : new Map();
  const items = [];
  keys.forEach((k, i) => {
    const e = cat.get(k);
    if (!e?.product) return;
    const offers = STORE_ORDER.filter((s) => e.offers[s]?.price > 0).map((s) => offerFromDb(s, e.offers[s], e.product));
    if (!offers.length) return;
    offers.sort((a, b) => a.price - b.price);
    const rated = offers.filter((o) => o.reviews > 0);
    const reviews = rated.reduce((s, o) => s + o.reviews, 0);
    items.push({
      key: e.pkey,
      pkey: e.pkey,
      jan: e.product.jan || null,
      name: e.product.name,
      image: e.product.image || offers[0].image,
      offers,
      bestPrice: offers[0].price,
      bestStore: offers[0].store,
      rating: reviews ? Math.round((rated.reduce((s, o) => s + o.rating * o.reviews, 0) / reviews) * 10) / 10 : 0,
      reviews,
      seq: i,
      fromDb: true,
      db: e,
    });
  });
  return NextResponse.json({ q, items }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" } });
}
