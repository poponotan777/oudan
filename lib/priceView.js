// ============================================================
// 価格の見せ方(v19)— 画面・商品ページ・まとめで共通
//
//   ・3サイト(楽天・Yahoo!・Amazon)を必ず並べる
//   ・各サイトで「90日の中央値より何%安いか」「3か月で何番目に安いか」「今いくらか」
//   ・DBの offers 行(hist = 日ごとの最安値の配列)から計算する
// ============================================================

export const STORE_ORDER = ["rakuten", "yahoo", "amazon"];

export const STORE_META = {
  rakuten: { name: "楽天市場", short: "楽天", color: "#BF0000" },
  yahoo: { name: "Yahoo!ショッピング", short: "Yahoo!", color: "#FF0033" },
  amazon: { name: "Amazon", short: "Amazon", color: "#232F3E" },
};

export const yen = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : "¥" + Math.round(Number(n)).toLocaleString("ja-JP"));

// hist(日ごとの最安値の配列)を [{price, recorded_at, store}] に戻す
export function histRows(offer, store) {
  if (!offer || !Array.isArray(offer.hist) || !offer.hist_start) return [];
  const start = new Date(offer.hist_start + "T00:00:00Z").getTime();
  const out = [];
  offer.hist.forEach((p, i) => {
    if (p == null) return;
    out.push({
      price: Number(p),
      recorded_at: new Date(start + i * 86400000).toISOString().slice(0, 10),
      store: store || offer.store,
    });
  });
  return out;
}

// ある価格が、記録の中でどのくらい安いか
//   days     … 記録がある日数
//   median   … 中央値
//   min      … 最安値
//   rank     … 今の価格は何番目に安いか(1 = 最安)。同じ価格は同じ順位
//   distinct … 出てきた価格の種類
//   diffPct  … 中央値との差(マイナス=安い)
export function statsFor(price, offer) {
  const vals = (offer && Array.isArray(offer.hist) ? offer.hist : []).filter((v) => v != null).map(Number);
  if (!(price > 0) || vals.length === 0) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  const uniq = [...new Set(sorted)];
  const rank = uniq.filter((v) => v < price).length + 1;
  // いちばん安かった日(同じ値段が何度もあれば、いちばん最近の日)
  let minDay = null;
  if (offer.hist_start && Array.isArray(offer.hist)) {
    const start = new Date(offer.hist_start + "T00:00:00Z").getTime();
    offer.hist.forEach((v, i) => { if (v != null && Number(v) === sorted[0]) minDay = new Date(start + i * 86400000); });
  }
  return {
    days: vals.length,
    median,
    min: sorted[0],
    minDay,
    rank,
    distinct: uniq.length,
    diffPct: median > 0 ? Math.round(((price - median) / median) * 1000) / 10 : 0,
    isLowest: price <= sorted[0],
  };
}

// 統計を短い文にする(画面のバッジ・ツイート共通)
export const MIN_DAYS = 7; // これ未満の記録は「集計中」
export function statsLabel(st) {
  if (!st) return { tone: "none", main: "記録なし", sub: "" };
  if (st.days < MIN_DAYS) return { tone: "none", main: `記録${st.days}日分(集計中)`, sub: "" };
  const rankText = st.isLowest ? "3か月で最安値" : `3か月で${st.rank}番目に安い`;
  const diff = st.diffPct;
  if (diff <= -1) return { tone: "good", main: `中央値より${Math.abs(diff).toFixed(diff > -10 ? 1 : 0)}%安い`, sub: rankText };
  if (diff >= 1) return { tone: "bad", main: `中央値より${diff.toFixed(diff < 10 ? 1 : 0)}%高い`, sub: rankText };
  return { tone: "flat", main: "いつもの価格", sub: rankText };
}

// 実質価格:ユーザーの還元率(%)+その商品のポイント上乗せ(%)
//   楽天の pointRate は「倍」(1倍=1%が通常分)なので、上乗せは pointRate-1
//   Yahoo!・Amazon の point_rate は自動取得で「%」に直して保存している
export function extraPointPct(store, offer) {
  const r = Number(offer?.point_rate) || 0;
  if (!(r > 0)) return 0;
  if (store === "rakuten") return Math.max(0, r - 1);
  return r;
}
export function effectivePrice(store, offer, rates) {
  if (!offer || !(offer.price > 0)) return null;
  const pct = (Number(rates?.[store]) || 0) + extraPointPct(store, offer);
  return Math.round(offer.price * (1 - pct / 100));
}

// 「10/17 17:05」
export function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}

// サイトで探すリンク(その商品がまだ見つかっていないとき)
export function searchUrl(store, q, { amazonTag = "popo-kaiteki-22" } = {}) {
  const k = encodeURIComponent(String(q || "").slice(0, 60));
  if (store === "rakuten") return `https://search.rakuten.co.jp/search/mall/${k}/`;
  if (store === "yahoo") return `https://shopping.yahoo.co.jp/search?p=${k}`;
  return `https://www.amazon.co.jp/s?k=${k}${amazonTag ? `&tag=${amazonTag}` : ""}`;
}

// 商品キー → 商品ページのURL
export const productPath = (pkey) => `/p/${encodeURIComponent(pkey)}`;

// 「9/12」
export function fmtDay(d) {
  if (!d) return "";
  const j = new Date(new Date(d).getTime() + 9 * 3600 * 1000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`;
}

// 3サイトのうち、実質価格がいちばん安いサイト
export function bestStore(offersByStore, rates) {
  let best = null;
  for (const s of STORE_ORDER) {
    const o = offersByStore?.[s];
    const e = effectivePrice(s, o, rates);
    if (e != null && (best == null || e < best.eff)) best = { store: s, eff: e, offer: o };
  }
  return best;
}

// 表示用の商品名:先頭や途中の【送料無料】★ポイント10倍★ などの販促だけを外す(外しすぎたら元のまま)
export function displayName(name) {
  const s = String(name || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  const t = s
    .replace(/【[^】]{0,30}】|［[^］]{0,30}］|\[[^\]]{0,30}\]|＼[^／]{0,30}／|★[^★]{0,20}★|◆[^◆]{0,20}◆/g, " ")
    .replace(/(送料無料|あす楽|即納|ポイント\s*\d+\s*倍|クーポン(配布中|あり)?)/g, " ")
    .replace(/\s+/g, " ").trim();
  return t.length >= 6 ? t : s;
}

// ============================================================
// セット数(ロット)違いの疑い — v28
//   同じ商品のはずが、あるサイトだけ「3個セット」の値段で載っていると比較が壊れる。
//   値段が他のサイトの1.5倍以上なら「セット品の疑い」として、
//   いちばん安い・お得額の計算から外し、画面では注意を出す。
//   戻り値:Map(store → { kind: "set"|"gap"|"small", times })
// ============================================================
export function lotSuspects(offers) {
  const out = new Map();
  const list = STORE_ORDER.filter((s) => offers?.[s]?.price > 0).map((s) => ({ s, p: Number(offers[s].price) }));
  if (list.length < 2) return out;
  const sorted = [...list].sort((a, b) => a.p - b.p);
  const base = list.length >= 3 ? sorted[1].p : sorted[0].p; // 3サイトなら真ん中、2サイトなら安いほうが基準
  for (const x of list) {
    const r = x.p / base;
    if (r >= 1.5) {
      const k = Math.round(r);
      out.set(x.s, { kind: Math.abs(r - k) / k <= 0.12 ? "set" : "gap", times: k });
    } else if (list.length >= 3 && r <= 0.66) {
      out.set(x.s, { kind: "small", times: Math.round(1 / r) });
    }
  }
  return out;
}
// 疑いのあるサイトを外した offers
export function trustedOffers(offers) {
  const sus = lotSuspects(offers);
  if (!sus.size) return offers || {};
  const o = {};
  for (const s of STORE_ORDER) if (offers?.[s] && !sus.has(s)) o[s] = offers[s];
  return o;
}
export function suspectText(x) {
  if (!x) return "";
  if (x.kind === "set") return `ほかのサイトの約${x.times}倍の値段です。${x.times}個セットなど、数が違う商品の可能性があります`;
  if (x.kind === "small") return "ほかのサイトよりかなり安い値段です。容量が小さい・お試しサイズなど、違う商品の可能性があります";
  return "ほかのサイトと値段の差が大きいため、セット数や容量が違う可能性があります";
}

// Amazonの価格を出すときの決まった文言(Amazonアソシエイト・プログラム・ポリシー「本ライセンス」2(j))
export const AMAZON_DISCLAIMER = "Amazonの価格および在庫状況は表示された日付/時刻の時点のものであり、変更される場合があります。本商品の購入においては、購入の時点でAmazon.co.jpに表示されている価格および在庫状況に関する情報が適用されます。";
// 「10/22 20:15時点」
export function atLabel(iso) { const t = fmtTime(iso); return t ? `${t}時点` : ""; }
