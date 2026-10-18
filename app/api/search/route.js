import { NextResponse } from "next/server";
import { searchYahooRaw } from "../../../lib/stores";

// Yahoo!検索(サーバー経由)。楽天はブラウザから直接呼ぶため、ここではYahoo!のみ。
// page: 1〜9(通常30件、クローラーはhits=50で叩いてリクエスト数を節約)。

export async function GET(request) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const page = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("page") || "1", 10), 1), 9);
  const hits = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("hits") || "30", 10), 1), 50);
  const sortKey = request.nextUrl.searchParams.get("sort") || "";
  const YAHOO_SORT = {
    cheap: "+price", high: "-price", rating: "-review_rate",
    reviews: "-review_count", popular: "-sold",
  };
  if (!q) {
    return NextResponse.json({ error: "検索キーワードを指定してください" }, { status: 400 });
  }
  const minP = parseInt(request.nextUrl.searchParams.get("min") || "0", 10) || null;
  const maxP = parseInt(request.nextUrl.searchParams.get("max") || "0", 10) || null;
  const r = await searchYahooRaw(q, hits, null, (page - 1) * hits + 1, YAHOO_SORT[sortKey] || null, minP, maxP)
    .catch(() => ({ ok: false, status: 0, offers: [] }));
  // rateLimited: クローラーが「本当に0件」と「一時的な失敗」を区別してリトライするための印
  // v29:同じ条件の結果は30分ほど使い回す(CDNのキャッシュ)。失敗したときはキャッシュしない
  return NextResponse.json({ query: q, page, offers: r.offers, rateLimited: !r.ok }, {
    headers: { "Cache-Control": r.ok ? "public, s-maxage=1800, stale-while-revalidate=600" : "no-store" },
  });
}
