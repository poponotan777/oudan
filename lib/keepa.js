// ============================================================
// Keepa(keepa.com)の値段の記録を、オウダンの「90日の記録」と同じ形にする(v31)
//   ・Keepa API 規約 第18条7項:取得したデータの保存・加工、値段の記録・グラフ・統計の表示は可
//     (データそのものを配る・まとめて取り出せるAPIにするのは不可 → keepa_hist は公開キーで読めない)
//   ・Amazonアソシエイトの「価格トラッキング機能」(ポリシー (y))は別途合意が必要。
//     合意が取れてから GitHub Secrets に KEEPA_KEY を入れると動き出す(入れるまでは何もしない)
//   画面・自動取得の両方から使う(外部ライブラリなし)
// ============================================================

// Keepaの時刻(2011-01-01からの分)→ UNIXミリ秒
export const keepaMs = (km) => (Number(km) + 21564000) * 60000;

const DAY = 86400000;
const JST = 9 * 3600 * 1000;
const jstDayStart = (ms) => Math.floor((ms + JST) / DAY) * DAY - JST;
const isoDay = (ms) => new Date(ms + JST).toISOString().slice(0, 10);

// csv の1本 → [[ms, 価格]](-1 = 出品なし)
//   step=2 は [時刻, 価格, …]、step=3 は [時刻, 価格, 送料, …](カートの値段など _SHIPPING の種類)
export function keepaSeries(arr, step = 2) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i + step - 1 < arr.length; i += step) {
    const t = keepaMs(arr[i]);
    const p = Number(arr[i + 1]);
    const ship = step === 3 ? Number(arr[i + 2]) : 0;
    out.push([t, p > 0 ? p + (ship > 0 ? ship : 0) : -1]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// 値段の動き → 日ごと(日本時間)の最安値。直近 days 日分。記録の無い日は null
//   その日の始まりの時点で付いていた値段も、その日の値段として数える
export function dailyMins(series, days = 92, now = Date.now()) {
  if (!series.length) return { hist_start: null, hist: null };
  const today = jstDayStart(now);
  const first = today - (days - 1) * DAY;
  const hist = [];
  let j = 0;
  let cur = -1; // その日の始まりの時点の値段
  while (j < series.length && series[j][0] <= first) { cur = series[j][1]; j++; }
  for (let d = first; d <= today; d += DAY) {
    const end = d + DAY;
    let m = cur > 0 ? cur : Infinity;
    while (j < series.length && series[j][0] < end) {
      cur = series[j][1];
      if (cur > 0 && cur < m) m = cur;
      j++;
    }
    hist.push(Number.isFinite(m) ? m : null);
  }
  const lead = hist.findIndex((v) => v != null);
  if (lead < 0) return { hist_start: null, hist: null };
  return { hist_start: isoDay(first + lead * DAY), hist: hist.slice(lead) };
}

// 日ごとの最安値 → 中央値など(DBの record_offers と同じ計算)
export function histStats(hist, hist_start) {
  const vals = (hist || []).filter((v) => v != null).map(Number);
  if (!vals.length) return { days: 0, median90: null, min90: null, max90: null, distinct90: null, min_day: null };
  const s = [...vals].sort((a, b) => a - b);
  const mid = s.length / 2;
  const median = s.length % 2 ? s[Math.floor(mid)] : Math.round((s[mid - 1] + s[mid]) / 2);
  let minIdx = -1;
  hist.forEach((v, i) => { if (v != null && Number(v) === s[0]) minIdx = i; }); // 同じ値段なら新しい日
  const start = hist_start ? Date.parse(hist_start + "T00:00:00Z") : null;
  return {
    days: s.length,
    median90: median,
    min90: s[0],
    max90: s[s.length - 1],
    distinct90: new Set(s).size,
    min_day: start != null && minIdx >= 0 ? new Date(start + minIdx * DAY).toISOString().slice(0, 10) : null,
  };
}

// Keepaの商品1件 → keepa_hist の1行
//   カートの値段(BUY_BOX_SHIPPING = csv[18])があればそれ、なければ新品の最安(NEW = csv[1])
export function keepaRow(p, { now = Date.now(), days = 92 } = {}) {
  const csv = Array.isArray(p?.csv) ? p.csv : [];
  let ptype = "buybox";
  let series = keepaSeries(csv[18], 3);
  if (!series.some((x) => x[1] > 0)) { ptype = "new"; series = keepaSeries(csv[1], 2); }
  const { hist_start, hist } = dailyMins(series, days, now);
  return { asin: String(p?.asin || ""), ptype: hist ? ptype : null, hist_start, hist, ...histStats(hist, hist_start), fetched_at: new Date(now).toISOString() };
}

// Amazonの価格行に Keepa の記録をのせる(今の値段は Creators API のまま)
//   withHist = true のときだけ日ごとの配列も付ける(商品ページのグラフ用)。それ以外は統計だけ
export function applyKeepa(offer, k, { withHist = false } = {}) {
  if (!offer || !k || !(k.days > 0) || !Array.isArray(k.hist)) return offer;
  const price = Number(offer.price);
  const uniq = [...new Set(k.hist.filter((v) => v != null).map(Number))];
  return {
    ...offer,
    hist: withHist ? k.hist : null,
    hist_start: withHist ? k.hist_start : null,
    days: k.days,
    median90: k.median90,
    min90: k.min90,
    max90: k.max90,
    distinct90: k.distinct90,
    rank90: price > 0 ? uniq.filter((v) => v < price).length + 1 : null,
    min_day: k.min_day,
    hist_src: "keepa",
  };
}

// 出典の表示(Keepa規約18条7項では任意。分かりやすさのために出す)
export const KEEPA_CREDIT = "Amazonの値段の記録はKeepaのデータをもとに作成";
export const KEEPA_URL = "https://keepa.com/";
