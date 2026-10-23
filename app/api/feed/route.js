// ホームの商品一覧(v26)
//   kind=drop … ふだん(90日の中央値)より安くなっている商品(安くなった割合の大きい順)
//   kind=pop  … よく売れている商品(各サイトのランキングから)
//   kind=genre&g=… … そのジャンルのよく売れている商品
//   page=0,1,2… で24件ずつ。30分ごとに作り直す
import { NextResponse } from "next/server";
import { publicDb } from "../../../lib/supabaseServer";
import { cardsFor } from "../../../lib/cards";

export const revalidate = 1800;
const PER = 24;

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const kind = ["drop", "pop", "genre"].includes(sp.get("kind")) ? sp.get("kind") : "pop";
  const page = Math.max(0, Math.min(20, parseInt(sp.get("page") || "0", 10) || 0));
  const sb = publicDb();
  let keys = [];
  try {
    if (kind === "drop") {
      const { data } = await sb.rpc("top_picks", { _n: 60 });
      keys = [...new Set((data || []).filter((r) => r.kind === "deal").map((r) => r.pkey))].slice(page * PER, page * PER + PER);
    } else {
      let q = sb.from("products").select("pkey").is("merged_into", null).not("pop", "is", null);
      if (kind === "genre") {
        const g = String(sp.get("g") || "").replace(/[%_,()]/g, "").slice(0, 30);
        if (g) q = q.ilike("genre", `%${g}%`);
      }
      const { data } = await q.order("pop", { ascending: true }).range(page * PER, page * PER + PER - 1);
      keys = (data || []).map((r) => r.pkey);
    }
  } catch {}
  const items = keys.length ? await cardsFor(sb, keys) : [];
  // お買い得のときは、安くなった割合の大きい順
  if (kind === "drop") items.sort((a, b) => b.off - a.off);
  return NextResponse.json({ kind, page, items, more: keys.length === PER }, {
    headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=86400" },
  });
}
