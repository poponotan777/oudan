import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writePriceRows } from "../../../lib/priceSlot";

// 検索便乗記録: 検索結果の価格を価格履歴に書き込む
// v10: 正午(JST)境目の半日枠で1商品×1モールにつき1日2レコード。
// 同じ枠に複数回記録が来た場合はその枠の最安値を保持する(record_price_min)。
export async function POST(request) {
  try {
    const { items } = await request.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ recorded: 0 });
    }
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY
    );
    const rows = [];
    const seen = new Set();
    // 上限は安全弁として2000(1リクエストで送られる現実的な最大を十分カバー)
    for (const it of items.slice(0, 2000)) {
      // 検証: JANは8〜13桁の数字、価格は常識的な範囲のみ受け付ける
      if (!it || typeof it.jan !== "string") continue;
      const validKey = /^\d{8,13}$/.test(it.jan) || /^[rya]:[\w\-:%.\/]{1,120}$/.test(it.jan);
      if (!validKey) continue;
      if (!["rakuten", "yahoo", "amazon"].includes(it.store)) continue;
      const price = Math.round(Number(it.price));
      if (!Number.isFinite(price) || price < 10 || price > 5000000) continue;
      const key = `${it.jan}:${it.store}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ jan: it.jan, store: it.store, price });
    }
    if (rows.length === 0) return NextResponse.json({ recorded: 0 });
    const n = await writePriceRows(admin, rows);
    return NextResponse.json({ recorded: n ? rows.length : 0 });
  } catch {
    return NextResponse.json({ recorded: 0 });
  }
}
