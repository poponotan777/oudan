// 画面(ブラウザ)で読んだ商品に、Amazonの記録の統計(Keepa)を足すためのAPI(v31)
//   /api/keepa?k=商品キー|商品キー…(60件まで)
//   返すのは画面に出す統計(中央値・最安・何番目など)だけ。日ごとの記録の配列は返さない
//   (Keepa規約18条7項:データそのものを取り出せる形にしない)。記録がまだ無い間は空を返す
import { NextResponse } from "next/server";
import { publicDb } from "../../../lib/supabaseServer";
import { loadCatalog } from "../../../lib/catalog";
import { keepaReady } from "../../../lib/keepaServer";

const FIELDS = ["days", "median90", "min90", "max90", "distinct90", "rank90", "min_day", "hist_src"];

export async function GET(req) {
  const keys = String(new URL(req.url).searchParams.get("k") || "").split("|").filter(Boolean).slice(0, 60);
  const stats = {};
  if (keys.length && (await keepaReady())) {
    const cat = await loadCatalog(publicDb(), keys).catch(() => new Map());
    for (const [k, e] of cat) {
      const a = e.offers?.amazon;
      if (a?.hist_src === "keepa") stats[k] = Object.fromEntries(FIELDS.map((f) => [f, a[f] ?? null]));
    }
  }
  return NextResponse.json({ stats }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" } });
}
