// トップの「いま見ておきたいもの」(v28)
//   お得・急上昇・定番の3つ。それぞれ 楽天・Yahoo!・Amazon から50件ずつ選び、交互に並べる(最大150件)
//   (1つのサイトに偏らないように)。DB(自動取得の結果)だけを使い、30分ごとに作り直す
import { NextResponse } from "next/server";
import { publicDb } from "../../../lib/supabaseServer";
import { loadCatalog } from "../../../lib/catalog";
import { STORE_ORDER, STORE_META, statsFor, statsLabel, lotSuspects } from "../../../lib/priceView";

export const revalidate = 1800;
const PER_STORE = 50;

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// サイトごとの候補(商品キーの順番つき)
async function candidates(sb, store) {
  const out = { deal: [], trend: [], recommend: [] };
  // お得:90日で安い順位の値段(rank90 が小さい)から、中央値より8%以上安いものを、安くなった割合の大きい順に
  {
    const { data } = await sb.from("offers").select("pkey, price, median90, rank90")
      .eq("store", store).gte("days", 7).gt("median90", 0).gte("price", 300).gte("updated_at", daysAgo(2))
      .order("rank90", { ascending: true }).limit(400);
    out.deal = (data || []).filter((o) => o.price <= o.median90 * 0.92)
      .map((o) => ({ pkey: o.pkey, score: (o.median90 - o.price) / o.median90 }))
      .sort((a, b) => b.score - a.score).slice(0, PER_STORE * 2);
  }
  // 急上昇:そのサイトのランキングで順位が上がったもの
  {
    const { data } = await sb.from("offers").select("pkey, trend")
      .eq("store", store).gt("trend", 0).gte("updated_at", daysAgo(2))
      .order("trend", { ascending: false }).limit(PER_STORE * 2);
    out.trend = (data || []).map((o) => ({ pkey: o.pkey, score: o.trend }));
  }
  // 定番:そのサイトのランキング上位で、評価★4以上・レビュー30件以上(有名ブランドを優先)
  {
    const { data } = await sb.from("offers").select("pkey, rank, review_avg, review_count")
      .eq("store", store).not("rank", "is", null).gte("review_avg", 4).gte("review_count", 30).gte("updated_at", daysAgo(3))
      .order("rank", { ascending: true }).limit(PER_STORE * 3);
    out.recommend = (data || []).map((o) => ({ pkey: o.pkey, score: o.rank }));
  }
  return out;
}

export async function GET() {
  const sb = publicDb();
  let per;
  try {
    per = await Promise.all(STORE_ORDER.map((s) => candidates(sb, s)));
  } catch {
    return NextResponse.json({ recommend: [], deal: [], trend: [], error: "not_ready" });
  }
  const keys = [...new Set(per.flatMap((p) => [...p.deal, ...p.trend, ...p.recommend].map((x) => x.pkey)))];
  // loadCatalog は1回300件までなので分けて読む
  const cat = new Map();
  for (let i = 0; i < keys.length; i += 300) {
    const m = await loadCatalog(sb, keys.slice(i, i + 300)).catch(() => new Map());
    for (const [k, v] of m) cat.set(k, v);
  }

  const build = (pkey, kind, src) => {
    const e = cat.get(pkey);
    if (!e || !e.product) return null;
    if (kind === "recommend" && !e.product.is_brand && e.product.pop == null) return null;
    const offers = {};
    let best = null;
    const sus = lotSuspects(e.offers);
    for (const s of STORE_ORDER) {
      const o = e.offers[s];
      if (!o) continue;
      offers[s] = { price: o.price, point_rate: o.point_rate, sale_label: o.sale_label };
      if (sus.has(s)) continue;
      if (!best || o.price < best.o.price) best = { s, o };
    }
    if (!best) return null;
    const focus = kind === "deal" && e.offers[src] && !sus.has(src) ? { s: src, o: e.offers[src] } : best;
    const st = statsFor(focus.o.price, focus.o);
    const lab = statsLabel(st);
    return {
      pkey: e.pkey,
      name: e.product.name,
      image: e.product.image || null,
      brand: e.product.brand,
      offers,
      stores: Object.keys(offers).length,
      src,
      badge: kind === "deal" ? `${STORE_META[focus.s].short}で${lab.main}` : kind === "trend" ? `${STORE_META[src].short}で順位が急上昇` : `${STORE_META[src].short}の売れ筋`,
      sub: st && st.days >= 7 ? lab.sub : "",
    };
  };

  // サイトごとに50件ずつ作り、楽天→Yahoo!→Amazon の順に1件ずつ交互に並べる
  const pick = (kind) => {
    const seen = new Set();
    const lists = STORE_ORDER.map((s, i) => {
      const l = [];
      for (const c of per[i][kind]) {
        if (l.length >= PER_STORE) break;
        const it = build(c.pkey, kind, s);
        if (it && !l.some((x) => x.pkey === it.pkey)) l.push(it);
      }
      return l;
    });
    const out = [];
    for (let i = 0; i < PER_STORE; i++) {
      for (const l of lists) {
        const it = l[i];
        if (it && !seen.has(it.pkey)) { seen.add(it.pkey); out.push(it); }
      }
    }
    return out;
  };

  return NextResponse.json({
    deal: pick("deal"),
    trend: pick("trend"),
    recommend: pick("recommend"),
    updatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=600" } });
}
