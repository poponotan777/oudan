// トップの「いま見ておきたいもの」(v28.2)
//   お得・急上昇・定番の3つ。それぞれ 楽天・Yahoo!・Amazon から50件ずつ選び、交互に並べる(最大150件)
//   (1つのサイトに偏らないように)。DB(自動取得の結果)だけを使い、30分ごとに作り直す
//   50件に届かないサイトがあれば、条件を少しゆるめて足し、それでも足りなければほかのサイトで埋める
import { NextResponse } from "next/server";
import { publicDb } from "../../../lib/supabaseServer";
import { loadCatalog } from "../../../lib/catalog";
import { STORE_ORDER, STORE_META, statsFor, statsLabel, lotSuspects } from "../../../lib/priceView";

export const revalidate = 1800;
const PER_STORE = 50;
const WANT = 150; // 1サイトあたりの候補(ほかのサイトの穴埋めにも使う)

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

// サイトごとの候補(商品キーの順番つき)
//   ・Amazon はレビュー数がAPIで取れないため、定番は「売れ筋順位+有名ブランド」でも選ぶ
//   ・お得は記録7日以上・8%以上安い → 足りなければ記録3日以上・5%以上安い
async function candidates(sb, store) {
  const out = { deal: [], trend: [], recommend: [] };
  const seen = { deal: new Set(), trend: new Set(), recommend: new Set() };
  const push = (k, list) => {
    for (const x of list) if (!seen[k].has(x.pkey) && out[k].length < WANT) { seen[k].add(x.pkey); out[k].push(x); }
  };
  // お得
  for (const [minDays, ratio] of [[7, 0.92], [3, 0.95]]) {
    if (out.deal.length >= WANT) break;
    const { data } = await sb.from("offers").select("pkey, price, median90, rank90, days")
      .eq("store", store).gte("days", minDays).gt("median90", 0).gte("price", 300).gte("updated_at", daysAgo(2))
      .order("rank90", { ascending: true }).limit(1000);
    push("deal", (data || []).filter((o) => o.price <= o.median90 * ratio)
      .map((o) => ({ pkey: o.pkey, score: (o.median90 - o.price) / o.median90 }))
      .sort((a, b) => b.score - a.score));
  }
  // 急上昇
  {
    const { data } = await sb.from("offers").select("pkey, trend")
      .eq("store", store).gt("trend", 0).gte("updated_at", daysAgo(2))
      .order("trend", { ascending: false }).limit(WANT);
    push("trend", (data || []).map((o) => ({ pkey: o.pkey, score: o.trend })));
  }
  // 定番:売れ筋上位で★4以上・レビュー30件以上 → 足りなければ売れ筋上位の有名ブランド
  {
    const { data } = await sb.from("offers").select("pkey, rank")
      .eq("store", store).not("rank", "is", null).gte("review_avg", 4).gte("review_count", 30).gte("updated_at", daysAgo(3))
      .order("rank", { ascending: true }).limit(WANT);
    push("recommend", (data || []).map((o) => ({ pkey: o.pkey, score: o.rank, rated: true })));
  }
  if (out.recommend.length < WANT) {
    const { data } = await sb.from("offers").select("pkey, rank")
      .eq("store", store).not("rank", "is", null).gte("updated_at", daysAgo(3))
      .order("rank", { ascending: true }).limit(WANT * 2);
    push("recommend", (data || []).map((o) => ({ pkey: o.pkey, score: o.rank, rated: false })));
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

  const build = (pkey, kind, src, c = {}) => {
    const e = cat.get(pkey);
    if (!e || !e.product) return null;
    // 定番でレビュー条件を使わなかったものは、有名ブランドだけ
    if (kind === "recommend" && !c.rated && !e.product.is_brand) return null;
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
    const short = STORE_META[src].short;
    let badge;
    if (kind === "deal") {
      badge = st && st.days < 7 && st.diffPct < 0
        ? `${STORE_META[focus.s].short}でふだんより${Math.round(-st.diffPct)}%安い(記録${st.days}日)`
        : `${STORE_META[focus.s].short}で${lab.main}`;
    } else if (kind === "trend") badge = `${short}で順位が急上昇`;
    else badge = `${short}の売れ筋`;
    return {
      pkey: e.pkey,
      name: e.product.name,
      image: e.product.image || null,
      brand: e.product.brand,
      offers,
      stores: Object.keys(offers).length,
      src,
      badge,
      sub: st && st.days >= 7 ? lab.sub : "",
    };
  };

  // サイトごとに50件ずつ作り、楽天→Yahoo!→Amazon の順に1件ずつ交互に並べる。
  // 50件に届かないサイトがあれば、ほかのサイトの51件目以降で埋めて、合計150件に近づける
  const pick = (kind) => {
    const lists = STORE_ORDER.map((s, i) => {
      const l = [];
      for (const c of per[i][kind]) {
        if (l.length >= WANT) break;
        const it = build(c.pkey, kind, s, c);
        if (it && !l.some((x) => x.pkey === it.pkey)) l.push(it);
      }
      return l;
    });
    const seen = new Set();
    const out = [];
    const take = (it) => { if (it && !seen.has(it.pkey) && out.length < PER_STORE * 3) { seen.add(it.pkey); out.push(it); } };
    for (let i = 0; i < PER_STORE; i++) for (const l of lists) take(l[i]);
    for (let i = PER_STORE; i < WANT; i++) for (const l of lists) take(l[i]);
    return out;
  };

  return NextResponse.json({
    deal: pick("deal"),
    trend: pick("trend"),
    recommend: pick("recommend"),
    updatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=600" } });
}
