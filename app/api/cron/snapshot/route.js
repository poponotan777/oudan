import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lowestByJan } from "../../../../lib/stores";
import { writePriceRows } from "../../../../lib/priceSlot";

// 毎日 朝6時(JST) に Vercel Cron から呼ばれる。
// 全ユーザーの欲しいものリストにあるJANコードの最安値を記録する。
export async function GET(request) {
  // Vercel Cron 以外からの実行を防ぐ
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );

  // リストに登録されている重複なしのJAN一覧。
  // 「追跡中(track)」の商品と、指値アラートが設定されている商品を先頭に置く。
  // 途中でタイムアウトしても、ユーザーが特に見たい商品は必ず更新されるようにする。
  const { data: rows, error } = await admin.from("wishlists").select("jan, track");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 指値が設定されている商品も優先(price_alertsが未作成の環境では無視)
  let alertJans = new Set();
  try {
    const { data: al } = await admin.from("price_alerts").select("jan");
    alertJans = new Set((al || []).map((a) => a.jan));
  } catch {}

  const valid = (j) => j && /^\d{8,13}$/.test(j);
  const priority = [];
  const normal = [];
  const seen = new Set();
  for (const r of rows || []) {
    if (!valid(r.jan) || seen.has(r.jan)) continue;
    seen.add(r.jan);
    (r.track || alertJans.has(r.jan) ? priority : normal).push(r.jan);
  }
  const jans = [...priority, ...normal];
  let recorded = 0;

  for (const jan of jans) {
    try {
      const lows = await lowestByJan(jan);
      const rows = lows.map(({ store, price }) => ({ jan, store, price }));
      const n = await writePriceRows(admin, rows);
      recorded += n ? rows.length : 0;
      // 楽天APIのレート制限(1req/秒)を尊重
      await new Promise((r) => setTimeout(r, 1100));
    } catch {
      // 1商品の失敗で全体を止めない
    }
  }

  return NextResponse.json({ jans: jans.length, recorded });
}
