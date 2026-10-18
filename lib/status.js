// ============================================================
// あなたのステータス(v25)— 端末内(localStorage)だけに保存。サーバーには送らない
//
//  「ポイント還元率の設定」と「ステータス」を1つにまとめた。
//  使っているサービス・払い方にチェックを入れるだけで、各サイトの還元率(%)を自動で出す。
//  それでも合わないときは、サイトごとに「自分で入力」で上書きできる。
//
//  調べた内容(2026年10月時点・各社の公式/まとめ記事より。変わることがある):
//   楽天SPU:基本1倍+楽天カード+2倍(通常1+特典1)/楽天モバイル+4/キャリア決済+2/Turbo・ひかり+2/
//            楽天トラベル+1/楽天銀行(引落+0.3・給与+0.2)/証券 投信+0.5・米国株+0.5/ウォレット+0.5/
//            でんき+0.5/ブックス+0.5/Kobo+0.5/ラクマ+0.5/Fashion+0.5/ビューティ+0.5/Pasha+0.5/Kドリームス+0.5
//            5と0のつく日:楽天カード+エントリーで+1倍/買い回り:1店舗ごとに+1倍(最大10店舗)
//   Yahoo!:ストア1%/LINE連携+4%/LYPプレミアム+2%(どちらもPayPay系の支払い)/PayPayカード1%/
//            5のつく日+4%(PayPay系・エントリー)
//   Amazon:商品ごとのポイント+Amazon Mastercard(プライム2%・それ以外1.5%)
//  各特典には月の上限がある。ここで出す数字は「目安」。
// ============================================================

import { dailyEvents, upcomingSales } from "./saleCalendar";

const KEY = "oudanStatus";

export const RAKUTEN_RANKS = [
  ["regular", "レギュラー"], ["silver", "シルバー"], ["gold", "ゴールド"], ["platinum", "プラチナ"], ["diamond", "ダイヤモンド"],
];
export const YAHOO_RANKS = [["none", "なし・わからない"], ["silver", "シルバー"], ["gold", "ゴールド"]];

// 楽天SPU(上乗せ倍率)
export const SPU_ITEMS = [
  { id: "mobile", label: "楽天モバイル", add: 4 },
  { id: "carrier", label: "モバイルキャリア決済", add: 2, note: "月2,000円以上" },
  { id: "hikari", label: "楽天ひかり・Turbo", add: 2 },
  { id: "travel", label: "楽天トラベル", add: 1, note: "月5,000円以上" },
  { id: "bank_debit", label: "楽天銀行で引き落とし", add: 0.3 },
  { id: "bank_salary", label: "楽天銀行で給与受取", add: 0.2 },
  { id: "sec_fund", label: "楽天証券 投資信託", add: 0.5, note: "ポイント投資 月3万円以上" },
  { id: "sec_us", label: "楽天証券 米国株", add: 0.5, note: "ポイント投資 月3万円以上" },
  { id: "wallet", label: "楽天ウォレット", add: 0.5 },
  { id: "denki", label: "楽天でんき", add: 0.5 },
  { id: "books", label: "楽天ブックス", add: 0.5, note: "月1回3,000円以上" },
  { id: "kobo", label: "楽天Kobo", add: 0.5, note: "月1回3,000円以上" },
  { id: "rakuma", label: "楽天ラクマ", add: 0.5 },
  { id: "fashion", label: "Rakuten Fashion", add: 0.5 },
  { id: "beauty", label: "楽天ビューティ", add: 0.5 },
  { id: "pasha", label: "Rakuten Pasha", add: 0.5 },
  { id: "kdreams", label: "楽天Kドリームス", add: 0.5 },
];

export const PAY_OPTIONS = {
  rakuten: [
    ["rakuten_card", "楽天カード"],
    ["rakuten_premium", "楽天プレミアムカード"],
    ["other", "ほかのクレジットカード"],
    ["none", "カード以外(銀行振込・代引きなど)"],
  ],
  yahoo: [
    ["paypay_card", "PayPayカード"],
    ["paypay", "PayPay残高・PayPayクレジット"],
    ["other", "ほかのクレジットカード"],
    ["none", "カード以外"],
  ],
  amazon: [
    ["amazon_mc", "Amazon Mastercard"],
    ["other", "ほかのクレジットカード"],
    ["none", "カード以外(Amazonギフトカードなど)"],
  ],
};

export const DEFAULT_STATUS = {
  v: 2,
  set: false,            // 一度でも保存したか
  applyToPrice: true,    // 今日のセール分を実質価格に含める
  otherCardRate: 1,      // 「ほかのクレジットカード」の還元率(%)
  rakuten: { pay: "other", spu: {}, override: "", rank: "regular", shops: 1 },
  yahoo: { pay: "other", line: false, lyp: false, override: "", rank: "none" },
  amazon: { pay: "other", prime: false, override: "" },
};

const num = (v, d = 0) => (v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : d);
const r1 = (x) => Math.round(x * 10) / 10;

// 古い形(v20のステータス・「ポイント還元率の設定」)から引き継ぐ
function migrate(s, oldRates) {
  const out = { ...DEFAULT_STATUS, rakuten: { ...DEFAULT_STATUS.rakuten }, yahoo: { ...DEFAULT_STATUS.yahoo }, amazon: { ...DEFAULT_STATUS.amazon } };
  if (s && s.v === 2) {
    return {
      ...out, ...s,
      rakuten: { ...out.rakuten, ...(s.rakuten || {}), spu: { ...(s.rakuten?.spu || {}) } },
      yahoo: { ...out.yahoo, ...(s.yahoo || {}) },
      amazon: { ...out.amazon, ...(s.amazon || {}) },
    };
  }
  if (s && s.rakuten) {
    out.set = !!s.set;
    out.applyToPrice = s.applyToPrice !== false;
    out.rakuten.pay = s.rakuten.card ? "rakuten_card" : "other";
    if (num(s.rakuten.spu, 1) > 1) out.rakuten.override = String(s.rakuten.spu);
    out.rakuten.rank = s.rakuten.rank || "regular";
    out.rakuten.shops = s.rakuten.shops || 1;
    out.yahoo.pay = s.yahoo?.paypay ? "paypay" : "other";
    if (num(s.yahoo?.base, 1) !== 1) out.yahoo.override = String(s.yahoo.base);
    out.yahoo.rank = s.yahoo?.rank || "none";
    out.amazon.prime = !!s.amazon?.prime;
    if (num(s.amazon?.base, 1) !== 1) out.amazon.override = String(s.amazon.base);
    return out;
  }
  if (oldRates) {
    for (const st of ["rakuten", "yahoo", "amazon"]) {
      if (num(oldRates[st], 1) !== 1) out[st].override = String(oldRates[st]);
    }
  }
  return out;
}

export function loadStatus() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    let old = null;
    try { old = JSON.parse(localStorage.getItem("pointRates") || "null"); } catch {}
    return migrate(s, old);
  } catch {
    return migrate(null, null);
  }
}

export function saveStatus(st) {
  const v = { ...st, v: 2, set: true };
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
  return v;
}

const YAHOO_PAYPAY = (pay) => pay === "paypay_card" || pay === "paypay";
const RAKUTEN_CARD = (pay) => pay === "rakuten_card" || pay === "rakuten_premium";

// ふだんの日の還元率(%)と内訳 — キャンペーンを含まない
export function baseRates(status) {
  const st = migrate(status, null);
  const other = num(st.otherCardRate, 1);
  const out = {};

  // 楽天
  {
    const lines = [];
    let spu = 1;
    if (RAKUTEN_CARD(st.rakuten.pay)) spu += 2;
    for (const it of SPU_ITEMS) if (st.rakuten.spu?.[it.id]) spu += it.add;
    spu = r1(spu);
    let pct;
    if (st.rakuten.override !== "" && st.rakuten.override != null) {
      pct = num(st.rakuten.override, spu);
      lines.push(`SPU ${pct}倍(自分で入力)`);
    } else {
      pct = spu;
      lines.push(`SPU ${spu}倍`);
    }
    if (st.rakuten.pay === "other" && other > 0) { pct += other; lines.push(`カードの還元 ${other}%`); }
    out.rakuten = { pct: r1(pct), spu: st.rakuten.override !== "" && st.rakuten.override != null ? num(st.rakuten.override, spu) : spu, lines };
  }

  // Yahoo!
  {
    const lines = [];
    let auto = 1;
    const parts = ["ストア1%"];
    if (YAHOO_PAYPAY(st.yahoo.pay)) {
      if (st.yahoo.line) { auto += 4; parts.push("LINE連携+4%"); }
      if (st.yahoo.lyp) { auto += 2; parts.push("LYPプレミアム+2%"); }
    }
    if (st.yahoo.pay === "paypay_card") { auto += 1; parts.push("PayPayカード1%"); }
    if (st.yahoo.pay === "other" && other > 0) { auto += other; parts.push(`カード${other}%`); }
    let pct = auto;
    if (st.yahoo.override !== "" && st.yahoo.override != null) { pct = num(st.yahoo.override, auto); lines.push(`${pct}%(自分で入力)`); }
    else lines.push(parts.join("+"));
    out.yahoo = { pct: r1(pct), lines };
  }

  // Amazon(商品ごとのポイントは別に足す)
  {
    const lines = [];
    let auto = 0;
    if (st.amazon.pay === "amazon_mc") { auto = st.amazon.prime ? 2 : 1.5; lines.push(`Amazon Mastercard ${auto}%`); }
    else if (st.amazon.pay === "other" && other > 0) { auto = other; lines.push(`カード${other}%`); }
    let pct = auto;
    if (st.amazon.override !== "" && st.amazon.override != null) { pct = num(st.amazon.override, auto); lines.length = 0; lines.push(`${pct}%(自分で入力)`); }
    lines.push("+商品ごとのAmazonポイント");
    out.amazon = { pct: r1(pct), lines };
  }
  return out;
}

// 今日の還元率(%)と、その内訳(5と0のつく日・5のつく日・買い回りなどを足す)
export function todayRates(status, _unused = {}, now = new Date(), sheetEvents = []) {
  const st = migrate(status, null);
  const base = baseRates(st);
  const daily = dailyEvents(now);
  const live = upcomingSales(now, sheetEvents, 0).filter((e) => e.live);
  const out = {};

  {
    let pct = base.rakuten.pct;
    const lines = [...base.rakuten.lines];
    for (const e of daily.filter((x) => x.store === "rakuten")) {
      if (e.key === "rakuten_5_0") {
        if (RAKUTEN_CARD(st.rakuten.pay)) { pct += 1; lines.push("5と0のつく日 +1倍(要エントリー)"); }
        else lines.push("今日は5と0のつく日(楽天カード払いで+1倍)");
      } else if (e.key === "rakuten_18") {
        const ok = ["gold", "platinum", "diamond"].includes(st.rakuten.rank);
        lines.push(ok ? "ご愛顧感謝デー:ランク特典あり(要エントリー)" : "ご愛顧感謝デー(ゴールド以上)");
      } else {
        lines.push(`${e.name}(要エントリー)`);
      }
    }
    const big = live.find((e) => e.store === "rakuten" && e.shopBonus);
    if (big) {
      const shops = Math.min(10, Math.max(1, Math.round(num(st.rakuten.shops, 1))));
      if (shops > 1) { pct += shops - 1; lines.push(`${big.name}:${shops}店舗の買い回りで+${shops - 1}倍`); }
      else lines.push(`${big.name}開催中(買い回りで最大+9倍)`);
    }
    out.rakuten = { pct: r1(pct), lines, events: [...daily.filter((x) => x.store === "rakuten"), ...live.filter((x) => x.store === "rakuten")] };
  }

  {
    let pct = base.yahoo.pct;
    const lines = [...base.yahoo.lines];
    for (const e of daily.filter((x) => x.store === "yahoo")) {
      if (e.key === "yahoo_5") {
        if (YAHOO_PAYPAY(st.yahoo.pay)) { pct += 4; lines.push("5のつく日 +4%(要エントリー)"); }
        else lines.push("今日は5のつく日(PayPay払いで+4%)");
      } else if (e.key === "yahoo_kansha") {
        lines.push(st.yahoo.rank !== "none" ? "ヤフショ感謝デー:ランク特典あり(対象ストア)" : "ヤフショ感謝デー(ランク会員向け)");
      }
    }
    const big = live.find((e) => e.store === "yahoo");
    if (big) lines.push(`${big.name}開催中(条件で+4〜7%)`);
    out.yahoo = { pct: r1(pct), lines, events: [...daily.filter((x) => x.store === "yahoo"), ...live.filter((x) => x.store === "yahoo")] };
  }

  {
    const lines = [...base.amazon.lines];
    const big = live.find((e) => e.store === "amazon");
    if (big) lines.push(big.primeOnly && !st.amazon.prime ? `${big.name}開催中(プライム会員向け)` : `${big.name}開催中`);
    out.amazon = { pct: base.amazon.pct, lines, events: live.filter((x) => x.store === "amazon") };
  }
  return out;
}

// 実質価格の計算に使う還元率(%)。applyToPrice が OFF ならふだんの値だけ
export function ratesForPrice(status, _unused = {}, now = new Date(), sheetEvents = []) {
  const st = migrate(status, null);
  if (st.applyToPrice === false) {
    const b = baseRates(st);
    return { rakuten: b.rakuten.pct, yahoo: b.yahoo.pct, amazon: b.amazon.pct };
  }
  const t = todayRates(st, {}, now, sheetEvents);
  return { rakuten: t.rakuten.pct, yahoo: t.yahoo.pct, amazon: t.amazon.pct };
}
