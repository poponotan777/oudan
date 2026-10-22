// ============================================================
// Keepa から Amazon の値段の記録を取る(v31)
//   ・GitHub Secrets に KEEPA_KEY が無い間は何もしない
//     (Amazonアソシエイト・ポリシー (y)「価格トラッキング機能」の別途合意が取れてから入れる)
//   ・対象:24時間以内に Creators API で値段を取れた Amazon の商品(売れ筋の順)
//     記録が無いか、KEEPA_REFRESH_HOURS(既定72時間)より古いものだけ取り直す
//   ・Keepa のトークン(1分ごとに補充・1時間で失効)の残りを見ながら、1回100件ずつ
//     1商品 = 1トークン+カートの値段の記録(buybox)2トークン = 3トークン
//   ・キーはURLに入るので、URLはログに出さない
// ============================================================

import { log, rest, sleep } from "./core.js";
import { keepaRow } from "../lib/keepa.js";

const KEY = process.env.KEEPA_KEY || "";
const BUYBOX = process.env.KEEPA_BUYBOX !== "0";              // 0 にすると新品の最安だけ(1トークン)
const COST = BUYBOX ? 3 : 1;
const REFRESH_H = Number(process.env.KEEPA_REFRESH_HOURS || 72);
const MAX_ASINS = Number(process.env.KEEPA_MAX || 3000);       // 1回の実行で見る商品の上限
const API = process.env.KEEPA_API_BASE || "https://api.keepa.com"; // テスト用に差し替えできる

const isAsin = (s) => typeof s === "string" && /^[A-Z0-9]{10}$/.test(s);
const inList = (keys) => "in.(" + keys.map((k) => `"${k}"`).join(",") + ")";

async function keepaGet(path, params) {
  const q = new URLSearchParams({ key: KEY, ...params }).toString();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60000);
    const res = await fetch(`${API}/${path}?${q}`, { signal: ctrl.signal });
    clearTimeout(t);
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: String(e).replace(KEY, "***").slice(0, 200) };
  }
}

// 取り直しが必要な ASIN(売れ筋の順)
async function targets() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const rows = [];
  for (let off = 0; off < MAX_ASINS; off += 1000) {
    const part = await rest(`offers?select=code&store=eq.amazon&updated_at=gte.${encodeURIComponent(since)}&order=rank.asc.nullslast&limit=1000&offset=${off}`) || [];
    rows.push(...part);
    if (part.length < 1000) break;
  }
  const asins = [...new Set(rows.map((r) => r.code).filter(isAsin))].slice(0, MAX_ASINS);
  const fresh = new Set();
  const cut = Date.now() - REFRESH_H * 3600 * 1000;
  for (let i = 0; i < asins.length; i += 150) {
    const got = await rest(`keepa_hist?select=asin,fetched_at&asin=${encodeURIComponent(inList(asins.slice(i, i + 150)))}`) || [];
    for (const r of got) if (Date.parse(r.fetched_at) > cut) fresh.add(r.asin);
  }
  return asins.filter((a) => !fresh.has(a));
}

export async function runKeepa({ clock, dryRun }) {
  const st = { store: "keepa", requests: 0, written: 0, errors: 0, note: "" };
  if (!KEY) { st.note = "KEEPA_KEY 未設定のためスキップ"; return st; }

  let todo;
  try { todo = await targets(); } catch (e) { st.errors++; st.note = "対象の読み出しに失敗"; log("[Keepa] 対象の読み出しに失敗", String(e).slice(0, 200)); return st; }
  if (!todo.length) { st.note = "取り直しが必要な商品なし"; return st; }

  // 残りトークン(この問い合わせはトークンを使わない)
  const tk = await keepaGet("token", {});
  st.requests++;
  if (!tk.ok || !tk.json) { st.errors++; st.note = `トークン確認に失敗(HTTP ${tk.status})`; log(`[Keepa] トークン確認に失敗 HTTP ${tk.status}`); return st; }
  let left = Number(tk.json.tokensLeft) || 0;
  let rate = Number(tk.json.refillRate) || 1;
  log(`[Keepa] 対象 ${todo.length}件 / 残りトークン ${left}(毎分 ${rate} 補充)`);

  let i = 0;
  while (i < todo.length) {
    if (clock.nearlyOut(60000)) { st.note = "時間切れ"; break; }
    let n = Math.min(100, todo.length - i, Math.floor(left / COST));
    if (n < 1) {
      // トークンが貯まるまで待つ(最大で100件分 or 残り時間まで)
      const need = Math.min(100, todo.length - i) * COST - left;
      const wait = Math.min(Math.ceil(need / rate) * 60000, clock.left() - 90000);
      if (wait <= 0) { st.note = "トークン待ちで時間切れ"; break; }
      await sleep(Math.max(60000, wait));
      left += Math.floor(Math.max(60000, wait) / 60000) * rate;
      continue;
    }
    const part = todo.slice(i, i + n);
    const r = await keepaGet("product", { domain: "5", asin: part.join(","), days: "92", ...(BUYBOX ? { buybox: "1" } : {}) });
    st.requests++;
    if (r.json && r.json.tokensLeft != null) left = Number(r.json.tokensLeft);
    if (r.json && r.json.refillRate) rate = Number(r.json.refillRate);
    if (r.status === 429) { left = 0; continue; }             // トークン不足 → 待って同じ分をもう一度
    if (!r.ok || !Array.isArray(r.json?.products)) {
      st.errors++;
      log(`[Keepa] HTTP ${r.status} ${r.error || ""}`);
      if (r.status === 401 || r.status === 402 || r.status === 403) { st.note = `キーまたは契約を確認してください(HTTP ${r.status})`; break; }
      i += n; continue;
    }
    const now = Date.now();
    const got = new Map(r.json.products.map((p) => [p.asin, keepaRow(p, { now })]));
    // Keepaに無かった商品も「確認した」として残す(しばらく取り直さない)
    const rows = part.map((a) => got.get(a) || { asin: a, ptype: null, hist_start: null, hist: null, days: 0, median90: null, min90: null, max90: null, distinct90: null, min_day: null, fetched_at: new Date(now).toISOString() });
    if (!dryRun) {
      try {
        await rest("keepa_hist?on_conflict=asin", { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
      } catch (e) { st.errors++; log("[Keepa] 書き込み失敗", String(e).slice(0, 200)); }
    }
    st.written += rows.filter((x) => x.days > 0).length;
    i += n;
  }
  if (!st.note) st.note = `記録あり ${st.written}件 / 確認 ${Math.min(i, todo.length)}件`;
  log(`[Keepa] ${st.note}`);
  return st;
}
