// ============================================================
// 種類ごとの人気商品を作っておく(v32)
//   「あなたへのおすすめ」「似た商品」「この商品を見た人に」は、種類(lib/reco.js)ごとの人気商品を出す。
//   これまでは画面を開くたびに全商品から名前で探していて遅く、混んでいると空になることもあった。
//   自動取得の最後に1回だけ探して concept_picks に入れ、サイトのCDNも温めておく
// ============================================================
import { log, rest, sleep } from "./core.js";
import { CONCEPTS } from "../lib/reco.js";

const N = 30;
const clean = (w) => String(w).replace(/[,()%_*]/g, "").replace(/\s+/g, "*");

export async function buildConcepts({ dryRun = false, minutes = 6 } = {}) {
  const end = Date.now() + minutes * 60000;
  let done = 0, failed = 0;
  const rows = [];
  for (const c of CONCEPTS) {
    if (Date.now() > end) break;
    const or = "(" + c.q.map((w) => `name.ilike.*${clean(w)}*`).join(",") + ")";
    try {
      const got = await rest(`products?select=pkey&merged_into=is.null&pop=not.is.null&or=${encodeURIComponent(or)}&order=pop.asc&limit=${N}`) || [];
      rows.push({ id: c.id, pkeys: got.map((r) => r.pkey), updated_at: new Date().toISOString() });
      done++;
    } catch (e) {
      failed++;
      log(`[おすすめ] ${c.id} の読み出しに失敗`, String(e).slice(0, 120));
    }
  }
  if (!dryRun && rows.length) {
    try {
      await rest("concept_picks?on_conflict=id", { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
    } catch (e) { log("[おすすめ] 保存に失敗(v32のSQLを実行しましたか?)", String(e).slice(0, 160)); return { done: 0, failed: rows.length }; }
  }
  // サイトのCDNを温める(最初に見る人も待たないように)
  const site = (process.env.SITE_ORIGIN || "").replace(/\/$/, "");
  let warmed = 0;
  if (site && !dryRun) {
    const ids = rows.filter((r) => r.pkeys.length).map((r) => r.id);
    for (let i = 0; i < ids.length && Date.now() < end + 120000; i += 4) {
      await Promise.all(ids.slice(i, i + 4).map((id) =>
        fetch(`${site}/api/concept?id=${id}&n=12`).then((r) => { if (r.ok) warmed++; }).catch(() => {})));
      await sleep(200);
    }
  }
  log(`[おすすめ] 種類ごとの人気商品 ${done}件(失敗 ${failed}件)・CDN ${warmed}件`);
  return { done, failed, warmed };
}
