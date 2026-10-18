// 楽天の商品検索(v29)/api/rakuten?keyword=…&page=…&sort=…&min=…&max=…
//   サーバーから呼び、同じ条件の結果は30分ほど使い回す(CDNのキャッシュ)。
//   楽天のWebアプリ型は登録したサイトの Origin/Referer で認証するので、それを名乗る(自動取得と同じ)
import { NextResponse } from "next/server";
import { RAKUTEN_ITEM_SEARCH_URL } from "../../../lib/rakutenEndpoint";
import { SITE } from "../../../lib/supabaseServer";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const keyword = String(sp.get("keyword") || "").trim().slice(0, 80);
  if (!keyword) return NextResponse.json({ ok: false, items: [] }, { status: 400 });
  const appId = process.env.RAKUTEN_SERVER_APP_ID || process.env.RAKUTEN_APP_ID || process.env.NEXT_PUBLIC_RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_SERVER_ACCESS_KEY || process.env.RAKUTEN_ACCESS_KEY || process.env.NEXT_PUBLIC_RAKUTEN_ACCESS_KEY;
  if (!appId) return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  const params = new URLSearchParams({
    applicationId: appId,
    accessKey: accessKey || "",
    affiliateId: process.env.RAKUTEN_AFFILIATE_ID || process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID || "",
    keyword,
    hits: String(Math.min(30, Math.max(1, parseInt(sp.get("hits") || "30", 10) || 30))),
    page: String(Math.min(30, Math.max(1, parseInt(sp.get("page") || "1", 10) || 1))),
    sort: sp.get("sort") || "standard",
    formatVersion: "2",
    format: "json",
  });
  const min = parseInt(sp.get("min") || "0", 10);
  const max = parseInt(sp.get("max") || "0", 10);
  if (min > 0) params.set("minPrice", String(min));
  if (max > 0) params.set("maxPrice", String(max));
  try {
    const r = await fetch(`${RAKUTEN_ITEM_SEARCH_URL}?${params}`, {
      headers: { Origin: SITE, Referer: SITE + "/" },
      cache: "no-store",
    });
    if (!r.ok) {
      // 失敗はキャッシュしない(ブラウザが直接楽天を呼んで補う)
      return NextResponse.json({ ok: false, status: r.status, items: [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const data = await r.json();
    return NextResponse.json({ ok: true, items: data.Items || [] }, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ ok: false, items: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
