// Keepaの記録(keepa_hist)をサーバーだけで読む(v31)
//   keepa_hist は公開キーでは読めない設定(Keepa規約18条7項:第三者がプログラムで取り出せる形にしない)。
//   Vercel の SUPABASE_SECRET_KEY で読み、画面に出す統計・グラフだけを返す。
//   ブラウザで呼ばれたとき・キーが無いとき・表がまだ無いときは、何もしない(空を返す)
import { createClient } from "@supabase/supabase-js";

let cli = null;
function db() {
  if (typeof window !== "undefined") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  // Next のデータキャッシュに長く残らないよう、10分で読み直す(記録が入ったらすぐ出るように)
  if (!cli) cli = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, o = {}) => fetch(u, { ...o, next: { revalidate: 600 } }) },
  });
  return cli;
}

// 記録が1件でもあるか(10分ごとに確かめる)。無い間は、ほかの読み出しも全部飛ばす
let has = { at: 0, v: false };
export async function keepaReady() {
  const c = db();
  if (!c) return false;
  if (Date.now() - has.at < 10 * 60 * 1000) return has.v;
  let v = false;
  try {
    const { data, error } = await c.from("keepa_hist").select("asin").gt("days", 0).limit(1);
    v = !error && (data || []).length > 0;
  } catch {}
  has = { at: Date.now(), v };
  return v;
}

// ASIN の一覧 → Map(ASIN → 記録)
export async function keepaRows(asins) {
  const out = new Map();
  const list = [...new Set((asins || []).filter((a) => typeof a === "string" && /^[A-Z0-9]{10}$/.test(a)))];
  if (!list.length || !(await keepaReady())) return out;
  const c = db();
  for (let i = 0; i < list.length; i += 100) {
    try {
      const { data } = await c.from("keepa_hist")
        .select("asin, hist_start, hist, days, median90, min90, max90, distinct90, min_day")
        .in("asin", list.slice(i, i + 100)).gt("days", 0);
      for (const r of data || []) out.set(r.asin, r);
    } catch {}
  }
  return out;
}

// トップの「お得」用:今のAmazonの値段が、Keepaの記録の中央値より ratio 以下の商品
export async function keepaDeals(minDays, ratio, limit = 300) {
  if (!(await keepaReady())) return [];
  try {
    const { data } = await db().rpc("keepa_deals", { _min_days: minDays, _ratio: ratio, _limit: limit });
    return data || [];
  } catch { return []; }
}
