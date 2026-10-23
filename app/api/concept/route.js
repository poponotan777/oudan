// 種類ごとの人気商品(v30)/api/concept?id=shampoo&n=12  または ?genre=…
//   「似た商品」「この商品を見た人に」「あなたへのおすすめ」で使う。
//   種類は100個ほどしかないので、結果を1時間CDNに置いて全員で使い回す(=表示が速い)
//   1時間を過ぎても、作り直している間は前の結果をすぐ返す(stale-while-revalidate 1日)
import { NextResponse } from "next/server";
import { publicDb } from "../../../lib/supabaseServer";
import { cardsFor } from "../../../lib/cards";
import { CONCEPT_BY_ID } from "../../../lib/reco";

const clean = (w) => String(w).replace(/[,()%_*]/g, "").replace(/\s+/g, "%");

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const n = Math.min(24, Math.max(4, parseInt(sp.get("n") || "12", 10) || 12));
  const c = CONCEPT_BY_ID[sp.get("id") || ""];
  const genre = String(sp.get("genre") || "").slice(0, 60);
  const sb = publicDb();
  let keys = [];
  // 自動取得が作っておいた一覧(v32)があれば、それを使う(1行読むだけで速い)
  if (c) {
    try {
      const { data } = await sb.from("concept_picks").select("pkeys").eq("id", c.id).maybeSingle();
      if (data?.pkeys?.length) keys = data.pkeys.slice(0, n + 6);
    } catch {}
  }
  if (!keys.length) try {
    let q = sb.from("products").select("pkey").is("merged_into", null).not("pop", "is", null);
    if (c) q = q.or(c.q.map((w) => `name.ilike.%${clean(w)}%`).join(","));
    else if (genre) q = q.eq("genre", genre);
    else return NextResponse.json({ items: [] });
    const { data } = await q.order("pop", { ascending: true }).limit(n + 6);
    keys = (data || []).map((r) => r.pkey);
  } catch {}
  const items = keys.length ? (await cardsFor(sb, keys)).slice(0, n + 4) : [];
  return NextResponse.json({ id: c?.id || null, label: c?.label || genre, items }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
