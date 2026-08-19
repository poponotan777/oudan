"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { searchRakutenClient } from "../lib/rakutenClient";
import { mergeOffers } from "../lib/merge";
import { unitPriceLabel } from "../lib/unitPrice";
import { todayDeals, upcomingBigSales, nextFiveZeroDay } from "../lib/sales";
import { targetReachability, suggestTarget } from "../lib/priceStats";
import { PREFS, shippingHint, CARD_PRESETS, AGE_BANDS, GENDERS, loadProfile, saveProfile } from "../lib/profile";

const STORES = {
  rakuten: { name: "楽天市場", short: "楽天", color: "#BF0000" },
  yahoo: { name: "Yahoo!ショッピング", short: "Yahoo!", color: "#FF0033" },
  amazon: { name: "Amazon", short: "Amazon", color: "#232F3E" },
};

const AMAZON_TAG = "popo-kaiteki-22";
// 楽天のsort値: standard(標準)/+itemPrice(安い)/-itemPrice(高い)/-reviewCount/-reviewAverage
const RAKUTEN_SORT = { cheap: "+itemPrice", high: "-itemPrice", rating: "-reviewAverage", reviews: "-reviewCount", popular: "standard" };
const yen = (n) => "¥" + Math.round(Number(n)).toLocaleString("ja-JP");

// カテゴリ別の妥当な最低価格(これ未満は無関係な小物・部品とみなす)。
// 検索APIに直接渡してジャンクを取得段階で除外する
function getJunkFloor(kw) {
  if (/シャンプー|トリートメント|コンディショナー|化粧水|乳液|美容液|洗剤|柔軟剤|プロテイン|サプリ|家電|ドライヤー|時計|バッグ|靴/.test(kw)) return 200;
  if (/電池|文具|ペン|ノート|靴下|マスク|ティッシュ/.test(kw)) return 30;
  return 50;
}
// 高い順のときの上限(誤登録の4700万円等を除外)。宿泊券等は別途NGワードで除外
const HIGH_SORT_MAX = 300000;

// カテゴリ辞書(タイル・候補チップのパーソナライズに使用)
const CATEGORY_ICONS = {
  "シャンプー": "🧴", "洗剤": "🧼", "歯磨き粉": "🪥", "化粧水": "💧",
  "米": "🍚", "コーヒー": "☕", "トイレットペーパー": "🧻", "サプリメント": "💊",
  "プロテイン": "🥤", "柔軟剤": "🌸", "ボディソープ": "🛁", "マスク": "😷",
  "ティッシュ": "🤧", "おむつ": "👶", "ドッグフード": "🐶", "キャットフード": "🐱",
  "電池": "🔋", "水": "🚰", "紅茶": "🫖", "トリートメント": "✨",
};
const DEFAULT_CATS = ["シャンプー", "洗剤", "歯磨き粉", "化粧水", "米", "コーヒー", "トイレットペーパー", "サプリメント"];

// 閲覧履歴・検索履歴からユーザーの興味カテゴリを推定して並べる
function personalCategories(viewHistory, searchHistory, count) {
  const score = {};
  const texts = [
    ...(searchHistory || []),
    ...(viewHistory || []).map((v) => v.name || ""),
  ];
  for (const t of texts) {
    for (const cat of Object.keys(CATEGORY_ICONS)) {
      if (t.includes(cat)) score[cat] = (score[cat] || 0) + 1;
    }
  }
  const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
  const rest = DEFAULT_CATS.filter((c) => !ranked.includes(c));
  return [...ranked, ...rest].slice(0, count);
}
// 検索キーワードと無関係に混入しがちなノイズ(高額系)
const NOISE_WORDS = /ふるさと納税|宿泊券|宿泊|旅行券|チケット|粘度計|業務用.*(浄水器|機器)/;

// ---- ポイント設定(実質価格) ----
const DEFAULT_RATES = { rakuten: 1, yahoo: 1, amazon: 1 };
function loadRates() {
  try {
    const s = localStorage.getItem("pointRates");
    return s ? { ...DEFAULT_RATES, ...JSON.parse(s) } : DEFAULT_RATES;
  } catch {
    return DEFAULT_RATES;
  }
}
function effectivePrice(offer, rates) {
  const rate = (rates[offer.store] ?? 0) / 100;
  return offer.price * (1 - rate);
}

// ------------------------------------------------------------
// 価格推移グラフ(v10)
// ・グラフ専用の配色(バッジ等のブランド色とは別)。楽天とYahoo!の赤被りを解消。
//   楽天=赤 / Yahoo!=青 / Amazon=黄色寄りのオレンジ
// ・縦軸=価格(円)・横軸=日付のラベルつき
// ・期間切替: 1週間/1か月/3か月/6か月
// ・正午境目の半日枠(slot 0=午前/1=午後)に対応。同日2点を時系列に並べる
// ------------------------------------------------------------
const CHART_COLORS = { rakuten: "#BF0000", yahoo: "#1D6FE0", amazon: "#E8890C" };
const CHART_RANGES = [["7", "1週間"], ["30", "1か月"], ["90", "3か月"], ["180", "6か月"]];

function PriceChart({ history, liveOffers }) {
  const [range, setRange] = useState("30");
  if (!history || history.length < 2) {
    return (
      <p style={{ fontSize: 11.5, color: "#64748B", margin: "8px 0" }}>
        価格データを記録中です。リストに登録した翌日から推移が表示されます。
      </p>
    );
  }
  const since = new Date(Date.now() - parseInt(range, 10) * 86400000).toISOString().slice(0, 10);
  let rows = history.filter((h) => h.recorded_at >= since);

  // 現在のライブ価格を「表示上の最終点」として合成する(DBには保存しない)。
  // 記録は半日枠のスナップショットなので、閲覧時点の価格を足すことで
  // 「グラフは昨日まで・価格欄は今」というズレを無くす。
  // ローカル時刻(日本のユーザー=JST)で今日の日付と枠を出す
  const nowD = new Date();
  const todayStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
  const nowSlot = nowD.getHours() < 12 ? 0 : 1;
  const liveRows = (liveOffers || [])
    .filter((o) => o && Number.isFinite(o.price) && ["rakuten", "yahoo", "amazon"].includes(o.store))
    .map((o) => ({ store: o.store, price: o.price, recorded_at: todayStr, slot: nowSlot, live: true }));
  if (liveRows.length) {
    // 同じ枠にDB記録がある場合はライブ値を優先(重複点を作らない)
    const liveStores = new Set(liveRows.map((r) => r.store));
    rows = [
      ...rows.filter((h) => !(h.recorded_at === todayStr && (h.slot || 0) === nowSlot && liveStores.has(h.store))),
      ...liveRows,
    ];
  }
  const rangeChips = (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      {CHART_RANGES.map(([days, label]) => (
        <button
          key={days}
          onClick={() => setRange(days)}
          style={{
            fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
            border: range === days ? "1.5px solid #16324F" : "1px solid #CBD5E1",
            background: range === days ? "#16324F" : "#fff",
            color: range === days ? "#fff" : "#475569", cursor: "pointer",
          }}
        >{label}</button>
      ))}
    </div>
  );
  if (rows.length < 2) {
    return (
      <div>
        {rangeChips}
        <p style={{ fontSize: 11.5, color: "#64748B", margin: "8px 0" }}>この期間の記録はまだ2件未満です。期間を広げてみてください。</p>
      </div>
    );
  }
  // 時系列キー: 日付+半日枠(slot未設定の旧データは午前扱い)
  const tkey = (h) => `${h.recorded_at}:${h.slot || 0}`;
  const keys = [...new Set(rows.map(tkey))].sort();
  const prices = rows.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const stores = [...new Set(rows.map((h) => h.store))];
  // 描画領域: 左に価格ラベル、下に日付ラベルの余白を確保
  const W = 340, H = 130, L = 46, R = 8, T = 8, B = 22;
  const x = (k) => L + (keys.indexOf(k) / Math.max(keys.length - 1, 1)) * (W - L - R);
  const y = (p) => (max === min ? (T + (H - T - B) / 2) : T + (1 - (p - min) / (max - min)) * (H - T - B));
  // 縦軸の目盛り: 最安/中間/最高の3本
  const mid = Math.round((min + max) / 2);
  const yTicks = max === min ? [min] : [min, mid, max];
  // 横軸の目盛り: 最初/中間/最後の日付(月/日)
  const md = (k) => `${parseInt(k.slice(5, 7), 10)}/${parseInt(k.slice(8, 10), 10)}`;
  const xTickKeys = keys.length >= 3 ? [keys[0], keys[Math.floor(keys.length / 2)], keys[keys.length - 1]] : keys;
  return (
    <div>
      {rangeChips}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 380 }}>
        {/* 横グリッド線+価格ラベル(円) */}
        {yTicks.map((p) => (
          <g key={p}>
            <line x1={L} y1={y(p)} x2={W - R} y2={y(p)} stroke="#E2E8F0" strokeWidth="1" />
            <text x={L - 4} y={y(p) + 3.5} textAnchor="end" fontSize="9" fill="#64748B">{p.toLocaleString()}円</text>
          </g>
        ))}
        {/* 日付ラベル(月/日。半日枠は午前・午後の2点が同日に並ぶ) */}
        {xTickKeys.map((k) => (
          <text key={k} x={x(k)} y={H - 8} textAnchor="middle" fontSize="9" fill="#64748B">{md(k)}</text>
        ))}
        {/* 折れ線(モール別) */}
        {stores.map((s) => (
          <polyline
            key={s}
            points={rows
              .filter((h) => h.store === s)
              .sort((a, b) => tkey(a).localeCompare(tkey(b)))
              .map((h) => `${x(tkey(h))},${y(h.price)}`)
              .join(" ")}
            fill="none"
            stroke={CHART_COLORS[s] || "#888"}
            strokeWidth="2"
          />
        ))}
        {/* 現在価格の点(●): 閲覧時点のライブ価格 */}
        {rows.filter((h) => h.live).map((h) => (
          <circle key={`live-${h.store}`} cx={x(tkey(h))} cy={y(h.price)} r="3.5" fill={CHART_COLORS[h.store] || "#888"} stroke="#fff" strokeWidth="1.2" />
        ))}
      </svg>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#475569", flexWrap: "wrap" }}>
        <span>縦軸: 価格(円) / 横軸: 日付(1日1点=その日の最安)</span>
        {rows.some((h) => h.live) && <span>● = 現在価格(閲覧時点)</span>}
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#475569", marginTop: 2 }}>
        <span>この期間の最安 {yen(min)}</span>
        <span>最高 {yen(max)}</span>
        {stores.map((s) => (
          <span key={s} style={{ color: CHART_COLORS[s], fontWeight: 700 }}>― {STORES[s]?.short}</span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 商品詳細
// ------------------------------------------------------------
function Detail({ product, onBack, user, inList, onToggleList, rates, onBuyClick, purchasedInfo, onEarnReview, onLinkJan, viewHistory, onOpenRelated, backLabel, profile }) {
  const [history, setHistory] = useState(null);
  // 指値アラート(この価格になったら買いたい)
  const [alertPrice, setAlertPrice] = useState("");
  const [savedAlert, setSavedAlert] = useState(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const [related, setRelated] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [revForm, setRevForm] = useState({ quality: 0, usability: 0, cospa: 0, comment: "" });
  const [revMsg, setRevMsg] = useState("");
  const [revEditing, setRevEditing] = useState(false); // 投稿済みレビューの編集モード
  const pkey = product.key || product.jan;

  // 設定済みの指値を読み込む
  useEffect(() => {
    if (!user || !pkey) { setSavedAlert(null); return; }
    supabase
      .from("price_alerts")
      .select("id, target_price")
      .eq("user_id", user.id)
      .eq("jan", pkey)
      .maybeSingle()
      .then(({ data }) => {
        setSavedAlert(data || null);
        if (data) setAlertPrice(String(data.target_price));
      });
  }, [user, pkey]);

  const saveAlert = async () => {
    if (!user) { setAlertMsg("指値の設定にはログインが必要です"); return; }
    const t = Math.round(Number(alertPrice));
    if (!Number.isFinite(t) || t <= 0) { setAlertMsg("金額を入力してください"); return; }
    const { error } = await supabase.from("price_alerts").upsert(
      { user_id: user.id, jan: pkey, product_name: product.name, image: product.image, target_price: t },
      { onConflict: "user_id,jan" }
    );
    if (error) { setAlertMsg("保存に失敗しました: " + error.message); return; }
    setSavedAlert({ target_price: t });
    setAlertMsg("設定しました。この価格以下になったらリストで目立つように表示されます");
  };

  const removeAlert = async () => {
    if (!user || !pkey) return;
    await supabase.from("price_alerts").delete().eq("user_id", user.id).eq("jan", pkey);
    setSavedAlert(null);
    setAlertPrice("");
    setAlertMsg("指値を解除しました");
  };

  const loadReviews = useCallback(() => {
    if (!pkey) return;
    supabase
      .from("reviews")
      .select("user_id, quality, usability, cospa, comment, created_at")
      .eq("jan", pkey)
      .order("created_at", { ascending: false })
      .then(({ data }) => setReviews(data || []));
  }, [pkey]);
  useEffect(loadReviews, [loadReviews]);

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;

  // 価格履歴の統計(底値判定・欺瞞検知・異常価格の共通データ)
  const histStats = (() => {
    if (!history || history.length < 3) return null;
    const prices = [...history.map((h) => h.price)].sort((a, b) => a - b);
    const days = new Set(history.map((h) => h.recorded_at)).size;
    return {
      min: prices[0],
      max: prices[prices.length - 1],
      median: prices[Math.floor(prices.length / 2)],
      count: prices.length,
      days,
      flat: prices[0] === prices[prices.length - 1], // 全記録が同価格=変動なし
      percentile: (p) => Math.round((prices.filter((x) => x <= p).length / prices.length) * 100),
    };
  })();

  const submitReview = async () => {
    if (!user || !pkey) return;
    if (!revForm.quality || !revForm.usability || !revForm.cospa) {
      setRevMsg("3つの星をすべて選んでください");
      return;
    }
    const isEdit = !!myReview; // 既存レビューの編集ならポイントの増減はしない
    const { error } = await supabase.from("reviews").upsert(
      {
        user_id: user.id,
        jan: pkey,
        product_name: product.name,
        quality: revForm.quality,
        usability: revForm.usability,
        cospa: revForm.cospa,
        comment: revForm.comment.trim() || null,
      },
      { onConflict: "user_id,jan" }
    );
    if (error) {
      setRevMsg(isEdit ? "更新に失敗しました: " + error.message : "投稿に失敗しました: " + error.message);
    } else {
      setRevMsg(isEdit ? "レビューを更新しました" : "");
      setRevEditing(false);
      loadReviews();
      // ポイント付与は初回投稿のみ(編集では増減なし)
      if (!isEdit) onEarnReview?.(pkey);
    }
  };

  useEffect(() => {
    if (!pkey) return;
    // 6か月分を一度に取得し、グラフ側の期間切替はクライアントで絞り込む
    const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("price_history")
      .select("store, price, recorded_at, slot")
      .eq("jan", pkey)
      .gte("recorded_at", since)
      .order("recorded_at")
      .then(({ data }) => setHistory(data || []));
  }, [pkey]);

  // 関連商品(この商品に関連する商品): 商品名から代表カテゴリ語を抜き、同カテゴリの人気商品を取得
  useEffect(() => {
    const CATS = ["シャンプー","コンディショナー","トリートメント","洗剤","柔軟剤","ボディソープ","ハンドソープ","歯磨き","歯ブラシ","化粧水","乳液","美容液","日焼け止め","プロテイン","サプリ","おむつ","おしりふき","猫","犬","コーヒー","紅茶","マスク","ティッシュ","トイレットペーパー","オイル","米","水","洗顔"];
    const name = product?.name || "";
    const cat = CATS.find((c) => name.includes(c));
    const kw = cat || name.split(/[\s　]/)[0];
    if (!kw) return;
    let alive = true;
    searchRakutenClient(kw, 12, 1, "standard")
      .then((items) => {
        if (!alive) return;
        const pk = product.key || product.jan;
        const list = (items || [])
          .filter((it) => it.image && (it.code ? "r:" + it.code : "") !== pk)
          .map((it) => ({ key: it.code ? "r:" + it.code : null, jan: it.jan, name: it.name, image: it.image, price: it.price }))
          .slice(0, 10);
        setRelated(list);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [pkey]);

  const sorted = [...product.offers].sort(
    (a, b) => effectivePrice(a, rates) - effectivePrice(b, rates)
  );
  const amazonSearchUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(
    product.jan || product.name.slice(0, 40)
  )}&tag=${AMAZON_TAG}`;
  const hasAmazonOffer = product.offers.some((o) => o.store === "amazon");

  return (
    <div>
      <button onClick={() => window.history.back()} style={{ ...btnGhost, fontSize: 13, fontWeight: 700, padding: "8px 0" }}>← {backLabel || "検索結果に戻る"}</button>
      {purchasedInfo && (
        <div style={{ background: "#ECFDF5", border: "1.5px solid #059669", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: "#065F46", lineHeight: 1.5 }}>
          ✓ この商品は {new Date(purchasedInfo.clicked_at).toLocaleDateString("ja-JP")} に
          {STORES[purchasedInfo.store]?.name}で購入済みです。二重購入にご注意ください。
        </div>
      )}
      <div style={card}>
        <div style={{ display: "flex", gap: 14 }}>
          {product.image && (
            <img src={product.image} alt="" style={{ width: 120, height: 120, objectFit: "contain", borderRadius: 12, background: "#EAF3F0" }} />
          )}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.45, margin: 0 }}>{product.name}</h2>
            {product.reviews > 0 && (
              <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 4 }}>
                ★{product.rating}({product.reviews.toLocaleString()}件)
              </div>
            )}
            {product.jan && <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 2 }}>JAN: {product.jan}</div>}
          </div>
        </div>

        {/* 3モール統合レビュー(各モールの評価をレビュー数で加重平均) */}
        {(() => {
          const rated = product.offers.filter((o) => o.rating > 0 && o.reviews > 0);
          if (rated.length === 0) return null;
          const totalReviews = rated.reduce((s, o) => s + o.reviews, 0);
          const weightedAvg = rated.reduce((s, o) => s + o.rating * o.reviews, 0) / totalReviews;
          const full = Math.round(weightedAvg);
          return (
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#16324F", marginBottom: 8 }}>横断レビュー(各モール統合)</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: "#16324F", lineHeight: 1 }}>{weightedAvg.toFixed(2)}</span>
                <div>
                  <div style={{ fontSize: 16, color: "#F59E0B", letterSpacing: -1 }}>
                    {"★".repeat(full)}{"☆".repeat(Math.max(0, 5 - full))}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>{totalReviews.toLocaleString()}件の総合評価</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {rated.sort((a, b) => b.reviews - a.reviews).map((o, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: STORES[o.store]?.color || "#64748B", borderRadius: 4, padding: "1px 6px", minWidth: 44, textAlign: "center" }}>
                      {STORES[o.store]?.short || o.store}
                    </span>
                    <span style={{ color: "#F59E0B", letterSpacing: -1.5, fontSize: 12 }}>
                      {"★".repeat(Math.round(o.rating))}{"☆".repeat(Math.max(0, 5 - Math.round(o.rating)))}
                    </span>
                    <span style={{ fontWeight: 700, color: "#334155" }}>{o.rating.toFixed(1)}</span>
                    <span style={{ color: "#94A3B8" }}>({o.reviews.toLocaleString()}件)</span>
                    {o.url && (
                      <a href={o.url} target="_blank" rel="noopener noreferrer sponsored"
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: "#2563EB", textDecoration: "none", whiteSpace: "nowrap" }}>
                        レビューを読む ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8, lineHeight: 1.5 }}>
                ※ 各モールの評価をレビュー件数で加重平均した独自の総合スコアです。
                レビュー本文は「レビューを読む」から各モールのページでご覧いただけます
                (モールのAPIはレビュー本文を提供していないため)。
              </div>
            </div>
          );
        })()}

        {inList ? (
          <button
            onClick={() => { if (window.confirm("この商品をお気に入りリストから削除しますか?")) onToggleList("watch"); }}
            style={{ ...btnGhost, border: "1px solid #CBD5E1", borderRadius: 10, padding: "8px 14px", marginTop: 12, color: "#BF0000", fontWeight: 700 }}
          >
            🗑️ リスト登録済み(タップで削除)
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => onToggleList("watch")}
              style={{ flex: 1, border: "1.5px solid #16324F", background: "#fff", color: "#16324F", borderRadius: 10, padding: "10px 8px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
            >
              👀 気になるに追加
            </button>
            <button
              onClick={() => onToggleList("rotation")}
              style={{ flex: 1, border: "none", background: "#10B981", color: "#fff", borderRadius: 10, padding: "10px 8px", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}
            >
              🔁 定期購入に追加
            </button>
          </div>
        )}
        {!user && (
          <p style={{ fontSize: 11, color: "#64748B", margin: "6px 0 0" }}>※ リスト・履歴機能はログイン(無料)が必要です</p>
        )}

        <h3 style={sectionTitle}>店舗別価格比較(実質価格順)</h3>
        {(() => {
          const rated = product.offers.filter((o) => o.rating > 0 && o.reviews >= 3);
          if (rated.length >= 2) {
            const rs = rated.map((o) => o.rating);
            const gap = Math.max(...rs) - Math.min(...rs);
            if (gap >= 1.0) {
              return (
                <div style={{ background: "#FCF3E3", border: "1px solid #F59E0B", borderRadius: 10, padding: "9px 12px", marginBottom: 10, fontSize: 11.5, color: "#92670C", lineHeight: 1.6 }}>
                  ⚠ この商品はモールによって評価に差があります(
                  {rated.map((o) => `${STORES[o.store]?.short}★${o.rating}`).join(" / ")}
                  )。レビューは参考程度にご覧ください。
                </div>
              );
            }
          }
          return null;
        })()}
        {sorted.map((o, i) => {
          const s = STORES[o.store];
          const eff = effectivePrice(o, rates);
          const unit = unitPriceLabel(o.price, product.name);
          return (
            <div key={o.store} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, marginBottom: 8, border: i === 0 ? `1.5px solid ${s.color}` : "1px solid #E2E8F0", background: i === 0 ? "#F0FDF6" : "#F5FAF8" }}>
              <div style={{ width: 70 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: s.color }}>{s.short}</div>
                {i === 0 && (
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: s.color, borderRadius: 3, padding: "1px 5px" }}>実質最安</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{yen(o.price)}</div>
                <div style={{ fontSize: 10.5, color: "#059669", fontWeight: 700 }}>
                  実質 {yen(eff)}(ポイント{rates[o.store] ?? 0}%換算)
                </div>
                <div style={{ fontSize: 10.5, color: "#64748B" }}>
                  {o.shipping === 0 ? "送料無料" : "送料は店舗で確認"}
                  {unit ? ` ・ ${unit.label}` : ""}
                </div>
              </div>
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={() => onBuyClick(product, o, product.offers.length > 1 ? Math.max(...product.offers.map((x) => x.price)) - o.price : 0)}
                style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: s.color, borderRadius: 8, padding: "9px 14px", textDecoration: "none", whiteSpace: "nowrap" }}
              >
                {s.short}で購入
              </a>
            </div>
          );
        })}

        {!hasAmazonOffer && (
          <a
            href={amazonSearchUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => onBuyClick(product, { store: "amazon", price: null, name: product.name })}
            style={{ display: "block", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#232F3E", border: "1.5px solid #232F3E", borderRadius: 10, padding: "10px 14px", textDecoration: "none", marginTop: 4 }}
          >
            Amazonでこの商品を探す →
          </a>
        )}

        {/* お住まいの地域による送料の目安(端末内の設定のみを使用) */}
        {(() => {
          const hint = shippingHint(profile?.pref);
          if (!hint || hint.extra === "標準") return null;
          return (
            <div style={{ fontSize: 11.5, color: "#92670C", background: "#FCF3E3", border: "1px solid #F59E0B", borderRadius: 10, padding: "8px 12px", marginTop: 10, lineHeight: 1.6 }}>
              🚚 {profile.pref}への配送: 送料が{hint.extra}傾向です。{hint.note}
            </div>
          );
        })()}

        {/* SNS共有: 事実(最安・値下がり)を軸にした文言。ステマ規制に配慮しPR表記を含める */}
        <div style={{ marginTop: 10 }}>
          <button
            onClick={async () => {
              const best = product.offers?.[0];
              const lines = [
                `【${product.name.slice(0, 40)}】`,
                best ? `いま最安 ${yen(best.price)}(${STORES[best.store]?.short})` : "",
                histStats && histStats.min === best?.price ? "📉 記録の中で最安値を更新中" : "",
                "楽天・Yahoo!・Amazonをポイント込みの実質価格で比較 → オウダン",
                typeof window !== "undefined" ? window.location.origin : "",
                "#オウダン #節約 #日用品 #PR",
              ].filter(Boolean);
              const text = lines.join("\n");
              try {
                if (navigator.share) {
                  await navigator.share({ title: "オウダン", text });
                } else {
                  await navigator.clipboard.writeText(text);
                  setShareMsg("共有用のテキストをコピーしました");
                  setTimeout(() => setShareMsg(""), 3000);
                }
              } catch {}
            }}
            style={{ ...btnGhost, border: "1px solid #CBD5E1", borderRadius: 10, padding: "9px 14px", fontSize: 12.5, fontWeight: 700 }}
          >
            📣 この価格を共有する
          </button>
          {shareMsg && <span style={{ fontSize: 11.5, color: "#059669", fontWeight: 700, marginLeft: 8 }}>{shareMsg}</span>}
        </div>

        {pkey && (
          <>
            <h3 style={sectionTitle}>価格推移{product.jan ? "" : "(このモール内)"}</h3>
            {histStats && (() => {
              const cur = Math.min(...product.offers.map((o) => o.price));
              const pct = histStats.percentile(cur);
              return (
                <>
                  {histStats.flat || histStats.days < 4 ? (
                    <div style={{ fontSize: 11.5, color: "#64748B", marginBottom: 8 }}>
                      ℹ 価格の変動はまだ記録されていません(記録{histStats.days}日分)。しばらく追跡すると買い時が分かります。
                    </div>
                  ) : pct <= 10 ? (
                    <div style={{ background: "#ECFDF5", border: "1.5px solid #059669", borderRadius: 10, padding: "9px 12px", marginBottom: 8, fontSize: 12.5, fontWeight: 800, color: "#065F46" }}>
                      🟢 買い時です。現在価格は記録の中で安い方から{Math.max(pct, 1)}%(過去{histStats.days}日間)
                    </div>
                  ) : pct >= 70 ? (
                    <div style={{ background: "#FFF7E6", border: "1.5px solid #F59E0B", borderRadius: 10, padding: "9px 12px", marginBottom: 8, fontSize: 12, fontWeight: 700, color: "#92670C", lineHeight: 1.6 }}>
                      🟡 今は高めです(記録の中で高い方から{100 - pct}%)。過去最安は {yen(histStats.min)}。
                      ♡お気に入りに入れて値下がりを待つのも手です。
                    </div>
                  ) : Math.abs(cur - histStats.median) / histStats.median < 0.03 ? (
                    <div style={{ fontSize: 11.5, color: "#64748B", marginBottom: 8 }}>
                      ℹ 現在価格は普段の価格帯です。「セール」表示があっても、記録上の通常価格(中央値 {yen(histStats.median)})とほぼ同じです。
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#475569", marginBottom: 6, flexWrap: "wrap" }}>
                    <span>📊 過去{histStats.days}日</span>
                    <span>最安 <b>{yen(histStats.min)}</b></span>
                    <span>中央値 <b>{yen(histStats.median)}</b></span>
                    <span>最高 <b>{yen(histStats.max)}</b></span>
                  </div>
                </>
              );
            })()}
            <PriceChart history={history} liveOffers={product.offers} />

            {/* 指値アラート: 株の指値のように「この価格なら買いたい」を設定する。
                過去の記録から、その価格がどれくらいの頻度で出ているかを示す */}
            {pkey && (() => {
              const t = Math.round(Number(alertPrice));
              const reach = Number.isFinite(t) && t > 0 ? targetReachability(history, t) : null;
              const sug = suggestTarget(history);
              const toneColor = { rare: "#B0483C", sometimes: "#92670C", often: "#065F46", always: "#065F46" };
              return (
                <div style={{ border: "1.5px solid #CBD5E1", borderRadius: 12, padding: 14, marginTop: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>🎯 この価格になったら買いたい(指値)</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      value={alertPrice}
                      onChange={(e) => { setAlertPrice(e.target.value.replace(/[^\d]/g, "")); setAlertMsg(""); }}
                      inputMode="numeric"
                      placeholder="希望価格"
                      style={{ width: 120, boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 10px", fontSize: 16, outline: "none" }}
                    />
                    <span style={{ fontSize: 12, color: "#64748B" }}>円以下になったら</span>
                    <button onClick={saveAlert}
                      style={{ background: "#16324F", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                      {savedAlert ? "更新する" : "設定する"}
                    </button>
                    {savedAlert && (
                      <button onClick={removeAlert}
                        style={{ background: "#fff", color: "#B0483C", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        解除
                      </button>
                    )}
                  </div>
                  {sug && !alertPrice && (
                    <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 6 }}>
                      目安: <button onClick={() => setAlertPrice(String(sug))} style={{ background: "none", border: "none", color: "#16324F", fontWeight: 800, cursor: "pointer", padding: 0, fontSize: 11.5, textDecoration: "underline" }}>{yen(sug)}</button> あたりが狙い目です(記録の下位25%)
                    </div>
                  )}
                  {reach && (
                    <div style={{ fontSize: 11.5, marginTop: 8, fontWeight: 700, color: toneColor[reach.tone] }}>
                      {reach.tone === "rare" ? "🔴" : reach.tone === "sometimes" ? "🟡" : "🟢"} {reach.label}
                      <span style={{ color: "#64748B", fontWeight: 400 }}>
                        {" "}— 記録{reach.days}日中{reach.hitDays}日
                        {reach.lastHit ? ` / 直近は${reach.lastHit.slice(5).replace("-", "/")}` : ""}
                      </span>
                    </div>
                  )}
                  {alertMsg && <div style={{ fontSize: 11.5, color: "#065F46", fontWeight: 700, marginTop: 6 }}>{alertMsg}</div>}
                  <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 8, lineHeight: 1.6 }}>
                    到達しやすさは、オウダンが記録した価格(1日1回・その日の最安)から計算した目安です。記録のない期間の値動きは反映されません。
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {pkey && (
          <>
            <h3 style={sectionTitle}>オウダンレビュー(商品そのものだけの評価)</h3>
            <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 10px", lineHeight: 1.6 }}>
              配送や梱包など店舗への評価は含まない、購入者による商品だけのレビューです。
            </p>

            {reviews.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
                  {[
                    ["品質", "quality"],
                    ["使いやすさ", "usability"],
                    ["コスパ", "cospa"],
                  ].map(([label, key]) => {
                    const avg = reviews.reduce((s, r) => s + r[key], 0) / reviews.length;
                    return (
                      <div key={key} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10.5, color: "#64748B", fontWeight: 700 }}>{label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#F59E0B" }}>★{avg.toFixed(1)}</div>
                      </div>
                    );
                  })}
                  <div style={{ alignSelf: "center", fontSize: 11, color: "#64748B" }}>{reviews.length}件</div>
                </div>
                {reviews.filter((r) => r.comment).slice(0, 5).map((r, i) => (
                  <div key={i} style={{ background: "#F5FAF8", borderRadius: 10, padding: "9px 12px", marginBottom: 6, fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
                    {r.comment}
                    <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6 }}>
                      {new Date(r.created_at).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <p style={{ fontSize: 12, color: "#94A3B8" }}>まだレビューがありません。最初の投稿者になりませんか?</p>
            )}

            {/* 投稿フォーム: 購入済みユーザーのみ。未投稿=新規投稿 / 投稿済み=編集モード時に表示 */}
            {user && purchasedInfo && (!myReview || revEditing) && (
              <div style={{ border: "1.5px dashed #CBD5E1", borderRadius: 12, padding: 14, marginTop: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>
                  {myReview ? "レビューを編集する" : <>レビューを書く <span style={{ color: "#059669" }}>(+50pt)</span></>}
                </div>
                {[
                  ["品質", "quality"],
                  ["使いやすさ", "usability"],
                  ["コスパ", "cospa"],
                ].map(([label, key]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 76, fontSize: 12, fontWeight: 700 }}>{label}</span>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setRevForm({ ...revForm, [key]: n })}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0, color: revForm[key] >= n ? "#F59E0B" : "#CBD5E1" }}>
                        ★
                      </button>
                    ))}
                  </div>
                ))}
                <textarea
                  value={revForm.comment}
                  onChange={(e) => setRevForm({ ...revForm, comment: e.target.value })}
                  placeholder="商品そのものについてのコメント(任意)。配送・梱包・店舗対応については書かないでください"
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", resize: "vertical" }}
                />
                <button onClick={submitReview}
                  style={{ width: "100%", marginTop: 8, background: "#16324F", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>
                  {myReview ? "この内容で更新する" : "投稿して +50pt もらう"}
                </button>
                {myReview && (
                  <button onClick={() => { setRevEditing(false); setRevMsg(""); }}
                    style={{ width: "100%", marginTop: 6, background: "#fff", color: "#64748B", border: "1px solid #CBD5E1", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    キャンセル
                  </button>
                )}
                {revMsg && <p style={{ fontSize: 11.5, color: "#B0483C", margin: "6px 0 0" }}>{revMsg}</p>}
                <p style={{ fontSize: 10, color: "#94A3B8", margin: "8px 0 0", lineHeight: 1.6 }}>
                  {myReview
                    ? "編集してもポイントの増減はありません。"
                    : "投稿するとアプリ内ポイントが付与されます。レビューは購入済みの方のみ投稿できます。"}
                </p>
              </div>
            )}
            {user && purchasedInfo && myReview && !revEditing && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: "#059669", fontWeight: 700 }}>✓ この商品のレビューを投稿済みです</span>
                <button
                  onClick={() => {
                    // 既存の内容をフォームに読み込んでから編集モードへ
                    setRevForm({
                      quality: myReview.quality || 0,
                      usability: myReview.usability || 0,
                      cospa: myReview.cospa || 0,
                      comment: myReview.comment || "",
                    });
                    setRevMsg("");
                    setRevEditing(true);
                  }}
                  style={{ fontSize: 11.5, fontWeight: 800, background: "#fff", color: "#16324F", border: "1px solid #CBD5E1", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}
                >
                  ✏️ レビューを編集する
                </button>
              </div>
            )}
            {user && !purchasedInfo && (
              <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                ※ レビューは購入履歴で「購入した?」を押した商品のみ投稿できます
              </p>
            )}
          </>
        )}

        <p style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 14, lineHeight: 1.6 }}>
          【PR】購入リンクにはアフィリエイトリンクが含まれます。価格・実質価格は取得時点の概算です。
          ポイント還元率は設定タブで自分の条件に変更できます。実際の価格・送料・付与ポイントは各ストアでご確認ください。
        </p>

        {!product.jan && pkey && user && (
          <button
            onClick={() => {
              const jan = window.prompt("この商品のJANコード(バーコードの8〜13桁の数字)が分かれば入力してください。名寄せの精度向上に使われます(+5pt)");
              if (jan && /^\d{8,13}$/.test(jan.trim())) onLinkJan?.(pkey, jan.trim());
              else if (jan) alert("8〜13桁の数字を入力してください");
            }}
            style={{ ...btnGhost, border: "1px dashed #CBD5E1", borderRadius: 10, padding: "8px 14px", marginTop: 4 }}
          >
            🔗 この商品のJANコードを知っている(+5pt)
          </button>
        )}

        <ProductStrip
          title="この商品に関連する商品"
          subtitle="同じカテゴリの人気商品"
          items={related}
          onOpen={onOpenRelated}
        />
        {viewHistory && viewHistory.length > 1 && (
          <ProductStrip
            title="最近見た商品"
            items={viewHistory.filter((v) => v.key !== pkey)}
            onOpen={onOpenRelated}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// メイン
// ------------------------------------------------------------
// 横スクロールの商品帯(閲覧履歴・これも見てます・関連商品で共用)
function ProductStrip({ title, items, onOpen, subtitle }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#16324F", marginBottom: 2 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8 }}>{subtitle}</div>}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {items.map((it, i) => (
          <button
            key={(it.key || it.jan || i) + "_" + i}
            onClick={() => onOpen(it)}
            style={{ flex: "0 0 auto", width: 116, background: "#fff", border: "1px solid #DDE9E4", borderRadius: 12, padding: 8, cursor: "pointer", textAlign: "left" }}
          >
            {it.image ? (
              <img src={it.image} alt="" style={{ width: "100%", height: 96, objectFit: "contain", borderRadius: 8, background: "#EAF3F0" }} />
            ) : (
              <div style={{ width: "100%", height: 96, borderRadius: 8, background: "#EAF3F0" }} />
            )}
            <div style={{ fontSize: 11, lineHeight: 1.35, color: "#334155", marginTop: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", height: 30 }}>
              {it.name}
            </div>
            {it.price != null && (
              <div style={{ fontSize: 13, fontWeight: 800, color: "#16324F", marginTop: 3 }}>¥{Math.round(it.price).toLocaleString("ja-JP")}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [rawOffers, setRawOffers] = useState([]);
  const [searchPage, setSearchPage] = useState(1);
  const [lastQuery, setLastQuery] = useState("");
  const [mallFilter, setMallFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [viewHistory, setViewHistory] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [sort, setSort] = useState("popular");
  const [user, setUser] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [wishlistPrices, setWishlistPrices] = useState({});
  // 検索結果の各商品の14日価格統計(min=最安, med=中央値)。買い時/高めバッジ用
  const [searchStats, setSearchStats] = useState({});
  const [listTab, setListTab] = useState("watch");
  const [historyRows, setHistoryRows] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [histQuery, setHistQuery] = useState("");
  // 詳細を開けなかった商品のキー(取り扱い終了など)。リストでグレー表示に使う
  const [unopenable, setUnopenable] = useState([]);
  // 値下がり通知のうち、開いた時のライブ価格が記録より高かった(=値下がりが終わった
  // 可能性がある)もののキー。通知カードをグレー表示にして注意書きを出す
  const [staleAlerts, setStaleAlerts] = useState([]);
  const [view, setView] = useState("home"); // home | search | list | history | mypage
  const [saleEvents, setSaleEvents] = useState([]);
  const [saleLoaded, setSaleLoaded] = useState(false);
  const [saleModal, setSaleModal] = useState(null);
  const [upcomingModal, setUpcomingModal] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [saleHeat, setSaleHeat] = useState(null);
  const [recommend, setRecommend] = useState([]);
  const [dropAlerts, setDropAlerts] = useState([]);
  const [releaseFilter, setReleaseFilter] = useState("all");
  const [rakutenRec, setRakutenRec] = useState([]);
  const [recKeyword, setRecKeyword] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [rates, setRates] = useState(DEFAULT_RATES);
  // プロフィール(都道府県/年代/性別/カード券種)は端末内のみに保存
  const [profile, setProfile] = useState({});
  // 指値アラート(自分の設定一覧)。リストで「指値到達」を光らせるのに使う
  const [myAlerts, setMyAlerts] = useState([]);
  const [amazonStatus, setAmazonStatus] = useState("disabled");

  // ブラウザの戻るで、詳細→一覧、一覧→ホーム を段階的に戻す(サイト外に出ない)
  useEffect(() => {
    const onPop = () => {
      setSelected((cur) => {
        if (cur) return null; // 詳細を開いていたら閉じるだけ
        return cur;
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    try {
      const vh = localStorage.getItem("viewHistory");
      if (vh) setViewHistory(JSON.parse(vh).slice(0, 30));
      const sh = localStorage.getItem("searchHistory");
      if (sh) setSearchHistory(JSON.parse(sh).slice(0, 20));
      const uo = localStorage.getItem("unopenableKeys");
      if (uo) setUnopenable(JSON.parse(uo));
      const sa = localStorage.getItem("staleAlertKeys");
      if (sa) setStaleAlerts(JSON.parse(sa));
    } catch {}
    setRates(loadRates());
    setProfile(loadProfile());
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user);
      } else {
        try {
          const { data: anon } = await supabase.auth.signInAnonymously();
          setUser(anon?.user || null);
        } catch {
          setUser(null);
        }
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    // セール確定日程とピックアップを読み込み
    supabase.from("sale_events").select("name, store, start_date, end_date, status, period_text, summary, url")
      .then(({ data }) => { setSaleEvents(data || []); setSaleLoaded(true); })
      .catch(() => setSaleLoaded(true));
    fetch("/api/pickup").then((r) => r.json()).then((d) => { setPickup(d.picks || []); setRecommend(d.recommend || []); setSaleHeat(d.heat || null); }).catch(() => setPickup([]));
    // 楽天おすすめ: 購入履歴があればそのカテゴリ、無ければ定番にフォールバック
    (async () => {
      try {
        const kw = await pickRecommendKeyword();
        const items = await searchRakutenClient(kw, 20, 1, "-reviewCount");
        setRakutenRec(
          items
            .filter((i) => i.image && i.reviews >= 20)
            .sort((a, b) => (b.rating * Math.log10(b.reviews + 1)) - (a.rating * Math.log10(a.reviews + 1)))
            .slice(0, 4)
        );
        setRecKeyword(kw);
      } catch {}
    })();
    return () => sub.subscription.unsubscribe();
  }, []);

  // おすすめキーワード選定: 直近の購入商品名から代表語を抽出。無ければ定番から日替わり
  const pickRecommendKeyword = async () => {
    const DEFAULTS = ["シャンプー", "洗剤", "トイレットペーパー", "プロテイン", "柔軟剤", "ボディソープ"];
    try {
      const { data } = await supabase
        .from("purchases")
        .select("name, clicked_at")
        .order("clicked_at", { ascending: false })
        .limit(20);
      if (data && data.length) {
        // 商品名から日用品カテゴリ語を拾う
        const CATS = ["シャンプー","コンディショナー","トリートメント","洗剤","柔軟剤","ボディソープ","ハンドソープ","歯磨き","化粧水","乳液","日焼け止め","プロテイン","サプリ","おむつ","猫","犬","コーヒー","マスク","ティッシュ","トイレットペーパー"];
        for (const row of data) {
          const hit = CATS.find((c) => row.name && row.name.includes(c));
          if (hit) return hit;
        }
      }
    } catch {}
    return DEFAULTS[new Date().getDate() % DEFAULTS.length];
  };

  // 追跡リスト: この商品を毎日かならず更新する対象にする/外す
  const toggleTrack = async (w) => {
    if (!user) return;
    const next = !w.track;
    const { error } = await supabase
      .from("wishlists")
      .update({ track: next })
      .eq("jan", w.jan)
      .eq("user_id", user.id);
    if (error) {
      alert("追跡設定の変更に失敗しました: " + error.message + "\n(sql/supabase-v12.sql の実行が必要かもしれません)");
      return;
    }
    setWishlist((prev) => prev.map((x) => (x.jan === w.jan ? { ...x, track: next } : x)));
  };

  // プロフィールの1項目を更新(端末内にのみ保存)
  const setProfileField = (key, value) => {
    setProfile((prev) => saveProfile({ ...prev, [key]: value }));
  };

  // カード券種を選ぶと、その券種の一般的な還元率を還元率設定に反映する
  const applyCardPreset = (id) => {
    const preset = CARD_PRESETS.find((c) => c.id === id);
    setProfileField("card", id);
    if (preset) saveRates({ ...rates, ...preset.rates });
  };

  const saveRates = (next) => {
    setRates(next);
    try { localStorage.setItem("pointRates", JSON.stringify(next)); } catch {}
  };

  // 検索結果の商品の14日価格統計を取得(買い時/今は高めバッジ用)。
  // 履歴が無い商品はバッジ無し。キーは最大200件・100件ずつに分けて取得
  useEffect(() => {
    const products = results?.products || [];
    if (products.length === 0) { setSearchStats({}); return; }
    const keys = [...new Set(products.map((p) => p.key || p.jan).filter((k) => k && (/^\d{8,13}$/.test(k) || /^[rya]:/.test(k))))].slice(0, 200);
    if (keys.length === 0) { setSearchStats({}); return; }
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    let alive = true;
    (async () => {
      const byKey = {};
      for (let i = 0; i < keys.length; i += 100) {
        const { data } = await supabase
          .from("price_history")
          .select("jan, price")
          .in("jan", keys.slice(i, i + 100))
          .gte("recorded_at", since);
        for (const r of data || []) (byKey[r.jan] = byKey[r.jan] || []).push(r.price);
      }
      if (!alive) return;
      const stats = {};
      for (const [k, prices] of Object.entries(byKey)) {
        if (prices.length < 2) continue; // 記録1件では判定しない
        prices.sort((a, b) => a - b);
        stats[k] = { min: prices[0], med: prices[Math.floor(prices.length / 2)], n: prices.length };
      }
      setSearchStats(stats);
    })();
    return () => { alive = false; };
  }, [results]);

  const loadWishlist = useCallback(() => {
    if (!user) return setWishlist([]);
    // 指値アラートも合わせて読み込む(リストで到達バッジを出すため)
    supabase.from("price_alerts").select("jan, target_price").eq("user_id", user.id)
      .then(({ data }) => setMyAlerts(data || []));
    supabase.from("wishlists").select("jan, name, image, created_at, list_type, base_price, added_at, track").order("created_at", { ascending: false })
      .then(async ({ data }) => {
        const rows = data || [];
        setWishlist(rows);
        // 各商品の最新最安値を価格履歴から取得(直近14日)
        if (rows.length) {
          const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
          const { data: hist } = await supabase
            .from("price_history")
            .select("jan, price, recorded_at")
            .in("jan", rows.map((w) => w.jan))
            .gte("recorded_at", since)
            .order("recorded_at", { ascending: false });
          // latest: 最新日の価格 / min14: 直近14日の最安(買い時判定用)
          const latest = {};
          const min14 = {};
          for (const h of hist || []) {
            if (!(h.jan in latest)) latest[h.jan] = h.price; // 日付降順の先頭=最新
            if (!(h.jan in min14) || h.price < min14[h.jan]) min14[h.jan] = h.price;
          }
          setWishlistPrices({ latest, min14 });
        }
      });
  }, [user]);
  useEffect(loadWishlist, [loadWishlist]);

  // お気に入り商品の値下がり検知(擬似通知)
  useEffect(() => {
    if (wishlist.length === 0) { setDropAlerts([]); return; }
    const keys = wishlist.map((w) => w.jan);
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("price_history")
      .select("jan, store, price, recorded_at")
      .in("jan", keys)
      .gte("recorded_at", since)
      .order("recorded_at")
      .then(({ data }) => {
        const byKey = {};
        for (const r of data || []) {
          (byKey[r.jan] = byKey[r.jan] || []).push(r);
        }
        const alerts = [];
        for (const [key, rowsAll] of Object.entries(byKey)) {
          // 外れ値フィルタ: 名寄せで別商品(お試し1包・付属品など)の価格が
          // 混入することがあるため、この商品の記録の中央値から大きく外れた
          // 価格(中央値の30%未満 or 5倍超)は判定から除外する
          const allPrices = rowsAll.map((r) => r.price).sort((a, b) => a - b);
          const med = allPrices[Math.floor(allPrices.length / 2)];
          const rows = rowsAll.filter((r) => r.price >= med * 0.3 && r.price <= med * 5);
          const dates = [...new Set(rows.map((r) => r.recorded_at))].sort();
          if (dates.length < 2) continue;
          const latest = Math.min(...rows.filter((r) => r.recorded_at === dates[dates.length - 1]).map((r) => r.price));
          const prev = Math.min(...rows.filter((r) => r.recorded_at !== dates[dates.length - 1]).map((r) => r.price));
          if (latest < prev * 0.97) {
            const w = wishlist.find((x) => x.jan === key);
            alerts.push({ key, name: w?.name || key, image: w?.image, latest, prev, drop: Math.round(((prev - latest) / prev) * 100), listType: w?.list_type || "watch" });
          }
        }
        // 気になる/定期購入の2セクションに分けて表示するため、各リスト最大4件まで
        const sorted = alerts.sort((a, b) => b.drop - a.drop);
        setDropAlerts([
          ...sorted.filter((a) => a.listType === "watch").slice(0, 4),
          ...sorted.filter((a) => a.listType === "rotation").slice(0, 4),
        ]);
      });
  }, [wishlist]);

  // 値下がり通知のバックグラウンド検証:
  // 通知に出す商品(最大8件)だけを、ホーム表示中に1件ずつライブ価格と照合し、
  // 値下がりが終わっていたものを順次グレー化する(タップ前に分かるように)。
  // ・全リストの一括更新はYahoo!の1分30リクエスト制限で数分かかるため行わない
  // ・レート制限を守って1件2.2秒間隔(8件でも約18秒、裏で進む)
  // ・結果は30分キャッシュし、再訪時の無駄な通信をしない
  useEffect(() => {
    if (dropAlerts.length === 0) return;
    let alive = true;
    const CACHE_MS = 30 * 60 * 1000;
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem("alertVerifyCache2") || "{}"); } catch {}
    const now = Date.now();
    // キャッシュ済みの判定を先に反映
    for (const a of dropAlerts) {
      if (cache[a.key] && now - cache[a.key].t < CACHE_MS) markStale(a.key, cache[a.key].stale);
    }
    const targets = dropAlerts.filter((a) => !(cache[a.key] && now - cache[a.key].t < CACHE_MS));
    if (targets.length === 0) return;
    (async () => {
      for (const a of targets) {
        if (!alive) return;
        try {
          const q = /^\d{8,13}$/.test(a.key) ? a.key : a.name;
          const [yRes, rOffers] = await Promise.all([
            fetch(`/api/search?q=${encodeURIComponent(q)}&hits=10`).then((r) => r.json()).catch(() => ({ offers: [] })),
            searchRakutenClient(q, 10, 1).catch(() => []),
          ]);
          const products = mergeOffers([...(yRes.offers || []), ...rOffers]);
          const match = products.find((p) => (p.key || p.jan) === a.key);
          if (match && match.offers?.length) {
            const liveMin = Math.min(...match.offers.map((o) => o.price));
            // 「値下がりが続いているか」を元の判定式で再評価する。
            // 値下がり後価格を基準にすると、3%値下がりを5%の閾値で見るような
            // 取りこぼしが起きるため、値下がり前価格(prev)に戻ったかで判定する
            const stale = liveMin >= a.prev * 0.97;
            markStale(a.key, stale);
            cache[a.key] = { t: Date.now(), stale };
            try { localStorage.setItem("alertVerifyCache2", JSON.stringify(cache)); } catch {}
          }
          // 見つからなかった場合は判定保留(検索の一時的なゆらぎの可能性が
          // あるため、グレー化はタップ時の確認に任せる)
        } catch {}
        // レート制限(Yahoo!30/分)を守る
        await new Promise((ok) => setTimeout(ok, 2200));
      }
    })();
    return () => { alive = false; };
  }, [dropAlerts]);

  const loadHistory = useCallback(() => {
    if (!user) return setHistoryRows([]);
    supabase.from("purchases").select("id, jan, name, store, price, purchased, clicked_at, savings")
      .order("clicked_at", { ascending: false }).limit(100)
      .then(({ data }) => setHistoryRows(data || []));
  }, [user]);
  useEffect(loadHistory, [loadHistory]);

  const loadLedger = useCallback(() => {
    if (!user) return setLedger([]);
    supabase.from("points").select("amount, reason_key, label, created_at")
      .order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setLedger(data || []));
  }, [user]);
  useEffect(loadLedger, [loadLedger]);

  const pointBalance = ledger.reduce((s, r) => s + r.amount, 0);
  const rank =
    pointBalance >= 500 ? "🏆 節約の達人" :
    pointBalance >= 200 ? "🥈 オウダン常連" :
    pointBalance >= 50 ? "🥉 節約ビギナー" : "🌱 はじめの一歩";

  // reason_keyの一意制約により、同じ行動には二重付与されない
  const awardPoints = async (reasonKey, amount, label) => {
    if (!user) return false;
    const { error } = await supabase.from("points").insert({
      user_id: user.id, amount, reason_key: reasonKey, label,
    });
    if (!error) loadLedger();
    return !error;
  };

  const todayKey = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  const checkedInToday = ledger.some((r) => r.reason_key === `daily:${todayKey()}`);
  const dailyCheckin = async () => {
    const ok = await awardPoints(`daily:${todayKey()}`, 5, "毎日の価格チェック");
    if (!ok) alert("本日のチェックインは獲得済みです");
  };

  const doSearch = async (q, sortOverride) => {
    const kw = (q ?? query).trim();
    if (!kw) return;
    // サーバー(各モールAPI)に並べ替えを渡し、カタログ全体からの並びを取得する。
    // これにより「安い順=全体の安い順の1ページ目から」が実現する。
    const useSort = sortOverride || sort || "popular";
    setLoading(true);
    setSelected(null);
    setView("search");
    setSearchPage(1);
    // 検索履歴に記録(候補チップ・カテゴリタイルのパーソナライズに使用)
    setSearchHistory((prev) => {
      const next = [kw, ...prev.filter((x) => x !== kw)].slice(0, 20);
      try { localStorage.setItem("searchHistory", JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      const floor = getJunkFloor(kw);
      const ceil = useSort === "high" ? HIGH_SORT_MAX : null;
      const [yahooRes, rakutenOffers, amazonRes] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(kw)}&sort=${useSort}&min=${floor}${ceil ? `&max=${ceil}` : ""}`).then((r) => r.json()).catch(() => ({ offers: [] })),
        searchRakutenClient(kw, 30, 1, RAKUTEN_SORT[useSort] || "standard", floor, ceil),
        fetch(`/api/amazon/search?q=${encodeURIComponent(kw)}`).then((r) => r.json()).catch(() => ({ items: [], status: "error" })),
      ]);
      setLastQuery(kw);
      setAmazonStatus(amazonRes.status || "disabled");
      // 取得順を保持するseqを付与(Yahoo偶数・楽天奇数で1件ずつ交互に混ざる)
      const yOffers = (yahooRes.offers || []).map((o, i) => ({ ...o, seq: i * 2 }));
      const rOffers = rakutenOffers.map((o, i) => ({ ...o, seq: i * 2 + 1 }));
      const aOffers = (amazonRes.items || []).map((o, i) => ({ ...o, seq: 100000 + i }));
      const all = [...yOffers, ...rOffers, ...aOffers];
      setRawOffers(all);
      // モール横断で名寄せ(表示順はseq/価格で後段が決める)
      const products = mergeOffers(all).slice(0, 500);
      setResults({ query: kw, products, sortKey: useSort });
      try {
        const items = products.flatMap((p) =>
          (p.key || p.jan) ? p.offers.map((o) => ({ jan: p.key || p.jan, store: o.store, price: o.price })) : []
        );
        if (items.length) {
          fetch("/api/record-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          });
        }
      } catch {}
    } catch {
      setResults({ error: true, products: [] });
    }
    setLoading(false);
  };

  // さらに読み込む: 次ページを楽天+Yahoo!から取得して累積マージ
  const loadMore = async () => {
    if (!results?.query || loadingMore) return;
    setLoadingMore(true);
    const next = searchPage + 1;
    try {
      const floor2 = getJunkFloor(results.query);
      const ceil2 = sort === "high" ? HIGH_SORT_MAX : null;
      const [yahooRes, rakutenOffers] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(results.query)}&page=${next}&sort=${sort}&min=${floor2}${ceil2 ? `&max=${ceil2}` : ""}`).then((r) => r.json()).catch(() => ({ offers: [] })),
        searchRakutenClient(results.query, 30, next, RAKUTEN_SORT[sort] || "standard", floor2, ceil2).catch(() => []),
      ]);
      // 追加ページは既存より必ず後ろのseq(=先頭が入れ替わらない)
      const base = next * 100000;
      const yNew = (yahooRes.offers || []).map((o, i) => ({ ...o, seq: base + i * 2 }));
      const rNew = rakutenOffers.map((o, i) => ({ ...o, seq: base + i * 2 + 1 }));
      const all = [...rawOffers, ...yNew, ...rNew];
      setRawOffers(all);
      setSearchPage(next);
      // サーバーが返した順序を維持(再ソートしない)
      const products = mergeOffers(all).slice(0, 500);
      setResults({ query: results.query, products, sortKey: sort });
      try {
        const items = products.flatMap((p) =>
          (p.key || p.jan) ? p.offers.map((o) => ({ jan: p.key || p.jan, store: o.store, price: o.price })) : []
        );
        if (items.length) {
          fetch("/api/record-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          });
        }
      } catch {}
    } catch {}
    setLoadingMore(false);
  };

  // 購入ボタンのクリックを記録(ログイン時のみ)
  const logBuyClick = async (product, offer, savings = 0) => {
    // 将来のレコメンド用にクリックを匿名で蓄積(ログイン不要・失敗は無視)
    try {
      supabase.from("activity_log").insert({
        user_id: user?.id || null,
        product_key: product.key || product.jan,
        product_name: product.name,
        action: "click",
      });
    } catch {}
    if (!user) return;
    try {
      await supabase.from("purchases").insert({
        user_id: user.id,
        jan: product.key || product.jan,
        name: product.name,
        store: offer.store,
        price: offer.price,
        savings: Math.max(0, Math.round(savings)),
      });
      loadHistory();
    } catch {}
  };

  const togglePurchased = async (row) => {
    await supabase.from("purchases").update({ purchased: !row.purchased }).eq("id", row.id);
    if (!row.purchased) {
      await awardPoints(`purchase:${row.id}`, 10, "購入報告");
    }
    loadHistory();
  };
  const deleteHistoryRow = async (row) => {
    await supabase.from("purchases").delete().eq("id", row.id);
    loadHistory();
  };

  // 未確認(「購入した?」のまま)の履歴をまとめて削除。
  // 購入ボタンを押したが実際には買わなかった記録の掃除用。購入済みは消さない。
  const deletePendingHistory = async () => {
    const pending = historyRows.filter((r) => !r.purchased);
    if (pending.length === 0) return;
    if (!window.confirm(`未確認の履歴 ${pending.length}件を削除します。よろしいですか?\n(「✓購入済み」の履歴は削除されません)`)) return;
    await supabase.from("purchases").delete().in("id", pending.map((r) => r.id));
    loadHistory();
  };

  // 未確認の履歴をまとめて「購入済み」にする
  const markAllPurchased = async () => {
    const pending = historyRows.filter((r) => !r.purchased);
    if (pending.length === 0) return;
    if (!window.confirm(`未確認の履歴 ${pending.length}件をすべて「購入済み」にします。よろしいですか?`)) return;
    await supabase.from("purchases").update({ purchased: true }).in("id", pending.map((r) => r.id));
    loadHistory();
  };

  const toggleList = async (product, listType = "watch") => {
    if (!user) return;
    const key = product.key || product.jan;
    if (!key) { alert("この商品は商品コードが取得できないため、リスト登録に対応していません"); return; }
    const exists = wishlist.some((w) => w.jan === key);
    if (exists) {
      await supabase.from("wishlists").delete().eq("jan", key);
    } else {
      const basePrice = product.offers ? Math.min(...product.offers.map((o) => o.price)) : null;
      await supabase.from("wishlists").insert({
        user_id: user.id, jan: key, name: product.name, image: product.image,
        list_type: listType, base_price: basePrice,
      });
    }
    loadWishlist();
  };

  // ホーム商品(ピックアップ/おすすめ)を直接リストに追加
  const addHomeToList = async (p, storeKey, listType = "watch") => {
    if (!user) return;
    const key = p.jan || (p.code ? (storeKey === "rakuten" ? "r:" : storeKey === "yahoo" ? "y:" : "a:") + p.code : null);
    if (!key) { alert("この商品はコードが取得できないため登録できません"); return; }
    if (wishlist.some((w) => w.jan === key)) { alert("すでにリストにあります"); return; }
    await supabase.from("wishlists").insert({
      user_id: user.id, jan: key, name: p.name, image: p.image,
      list_type: listType, base_price: p.price || null,
    });
    loadWishlist();
  };

  // リスト種別を変更(気になる↔定期購入)
  const setListType = async (key, listType) => {
    if (!user) return;
    const { error } = await supabase
      .from("wishlists")
      .update({ list_type: listType })
      .eq("jan", key)
      .eq("user_id", user.id);
    if (error) {
      alert("移動に失敗しました: " + error.message + "\n(Supabaseでwishlistsの更新ポリシーが必要かもしれません)");
      return;
    }
    // 楽観的更新: 即座に画面へ反映してから再取得
    setWishlist((prev) => prev.map((w) => (w.jan === key ? { ...w, list_type: listType } : w)));
    loadWishlist();
  };

  // 商品詳細を開く共通処理(閲覧履歴に記録)
  const openProduct = (p) => {
    if (!p) return;
    window.history.pushState({ detail: true }, "");
    setSelected(p);
    window.scrollTo(0, 0);
    const key = p.key || p.jan;
    if (!key) return;
    setViewHistory((prev) => {
      const entry = { key, name: p.name, image: p.image, price: p.offers ? Math.min(...p.offers.map((o) => o.price)) : null, store: p.offers?.[0]?.store, at: Date.now() };
      const next = [entry, ...prev.filter((x) => x.key !== key)].slice(0, 30);
      try { localStorage.setItem("viewHistory", JSON.stringify(next)); } catch {}
      return next;
    });
    // 将来のレコメンド用に閲覧を匿名で蓄積(失敗は無視)
    try {
      supabase.from("activity_log").insert({
        user_id: user?.id || null,
        product_key: key,
        product_name: p.name,
        action: "view",
      });
    } catch {}
  };

  // リスト/履歴/最近見た商品から直接詳細を開く(その商品だけ再取得)。
  // タブは切り替えないので、詳細を閉じると開いた元のタブ(リスト/履歴)に戻る。
  // 取り扱いが終了した等でどのモールにも見つからない商品は開けないため、
  // そのキーを記録してリスト上でグレー表示にする(次回以降は一目で分かる)。
  const openFromList = async (w) => {
    setLoading(true);
    const key = w.jan;
    try {
      const q = /^\d{8,13}$/.test(w.jan) ? w.jan : w.name;
      const [yahooRes, rakutenOffers] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ offers: [] })),
        searchRakutenClient(q).catch(() => []),
      ]);
      const products = mergeOffers([...(yahooRes.offers || []), ...rakutenOffers]);
      // JAN/キーが一致する商品を優先、無ければ先頭
      const match = products.find((p) => (p.key || p.jan) === w.jan) || products[0];
      if (match) {
        setResults({ query: w.name, products });
        openProduct(match);
        if (key) {
          markOpenable(key, true); // 開けたのでグレー解除
          // 値下がり通知の鮮度チェック: ライブ最安が記録の値下がり価格より
          // 5%以上高ければ「値下がりは終わった可能性」として通知をグレー化。
          // 逆に維持されていればグレー解除(復活)
          const alertRow = dropAlerts.find((a) => a.key === key);
          if (alertRow && match.offers?.length) {
            const liveMin = Math.min(...match.offers.map((o) => o.price));
            // 値下がり前価格に戻っていたら通知は古い(上と同じ判定式)
            markStale(key, liveMin >= alertRow.prev * 0.97);
          }
        }
      } else {
        setResults({ query: q, products });
        setSelected(null);
        if (key) markOpenable(key, false);
        alert("この商品は現在どのモールでも見つからないため、詳細を開けません。\n(取り扱い終了・商品名の変更などが考えられます)");
      }
    } catch {
      alert("商品の取得に失敗しました。時間をおいて試してください。");
    }
    setLoading(false);
  };

  // 開ける/開けないの記録(localStorageに保存し、次回起動時も維持)
  const markOpenable = (key, ok) => {
    setUnopenable((prev) => {
      const next = ok ? prev.filter((k) => k !== key) : (prev.includes(key) ? prev : [...prev, key]);
      try { localStorage.setItem("unopenableKeys", JSON.stringify(next.slice(-300))); } catch {}
      return next;
    });
  };

  // 値下がり通知の鮮度: ライブ価格が記録より明らかに高ければ「古い通知」として記録
  const markStale = (key, isStale) => {
    setStaleAlerts((prev) => {
      const next = isStale ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key);
      try { localStorage.setItem("staleAlertKeys", JSON.stringify(next.slice(-300))); } catch {}
      return next;
    });
  };

  const resetPassword = async () => {
    if (!email.includes("@")) return setAuthMsg("メールアドレスを入力してから押してください");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
    });
    setAuthMsg(error ? "送信に失敗しました: " + error.message : "再設定用のメールを送りました。メールのリンクから戻ったら、マイページでパスワードを設定してください。");
  };

  const signInWithPassword = async () => {
    if (!email.includes("@") || password.length < 6)
      return setAuthMsg("メールアドレスと6文字以上のパスワードを入力してください");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMsg("ログインできませんでした: " + (error.message === "Invalid login credentials" ? "メールまたはパスワードが違います(未登録の場合は「新規登録」を押してください)" : error.message));
    } else {
      setAuthMsg("");
      setPassword("");
    }
  };

  const signUpWithPassword = async () => {
    if (!email.includes("@") || password.length < 6)
      return setAuthMsg("メールアドレスと6文字以上のパスワードを入力してください");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
    });
    setAuthMsg(error ? "登録に失敗しました: " + error.message : "確認メールを送りました。メール内のリンクを開くと登録完了です。");
  };

  const updatePassword = async () => {
    if (newPassword.length < 6) return setPwMsg("6文字以上で入力してください");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwMsg(error ? "変更に失敗しました: " + error.message : "パスワードを設定しました。次回からパスワードでログインできます。");
    if (!error) setNewPassword("");
  };

  // 異常値の除外: 全商品の最安値の中央値を基準に、極端に安い/高いものを弾く
  //   - 中央値の20%未満 = セット売りの1個単価や誤登録・部品などの可能性
  //   - 中央値の5倍超 = まとめ買い・業務用ロット・別物の可能性
  const filteredProducts = (() => {
    if (!results?.products) return [];
    const floor = getJunkFloor(results.query || "");
    const queryHasNoise = NOISE_WORDS.test(results.query || "");
    return results.products.filter((p) => {
      const min = Math.min(...p.offers.map((o) => o.price));
      if (!Number.isFinite(min) || min < floor) return false;
      // 検索語自体がノイズ語でない限り、宿泊券・ふるさと納税等の混入を除外
      if (!queryHasNoise && NOISE_WORDS.test(p.name || "")) return false;
      return true;
    });
  })();

  // モール絞り込み・評価絞り込みを適用
  const chipFiltered = filteredProducts.filter((p) => {
    if (mallFilter !== "all" && !p.offers.some((o) => o.store === mallFilter)) return false;
    if (ratingFilter && !(p.rating >= 4)) return false;
    return true;
  });

  // 並び順: サーバーが各モールをソート済みだが、名寄せでモール順に固まるため、
  // 名寄せ後のグループを選択中のソートキーで並べ直す(全体からの正しい並び)。
  // 価格系はグループ最安値、評価系はグループ代表値を使う。単価は別途下で処理。
  const applySort = (list, key) => {
    const arr = [...list];
    const minP = (p) => Math.min(...p.offers.map((o) => o.price));
    // 価格系: 各モールがソート済みの列を価格でマージ(=正しい全体順。追加読込でも先頭は不変)
    if (key === "cheap") return arr.sort((a, b) => minP(a) - minP(b));
    if (key === "high") return arr.sort((a, b) => minP(b) - minP(a));
    // 人気・評価・レビュー系: サーバーが返した順序(seq)をそのまま維持する。
    // クライアントで独自に再計算すると、追加読み込みのたびに先頭が入れ替わるため
    return arr.sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity));
  };

  // 並び順はサーバー取得+名寄せ後にソートキーで全体を並べ替える。
  // 「単価が安い順」のみ専用計算。
  const sorted = results?.products
    ? (sort === "unit"
        ? [...chipFiltered].sort((a, b) => {
            const ua = unitPriceLabel(Math.min(...a.offers.map((o) => o.price)), a.name)?.per ?? Infinity;
            const ub = unitPriceLabel(Math.min(...b.offers.map((o) => o.price)), b.name)?.per ?? Infinity;
            return ua - ub;
          })
        : applySort(chipFiltered, sort))
    : [];

  const purchasedOnly = historyRows.filter((r) => r.purchased);
  const totalSavings = purchasedOnly.reduce((s2, r) => s2 + (r.savings || 0), 0);
  // JAN → 最新の購入記録(検索結果・詳細に「購入済み」バッジを出すため)
  const purchasedMap = {};
  for (const r of historyRows) {
    if (r.purchased && r.jan && !purchasedMap[r.jan]) purchasedMap[r.jan] = r;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F0F6F4", fontFamily: "'Hiragino Sans','Noto Sans JP',-apple-system,sans-serif", color: "#16324F" }}>
      <header style={{ background: "#16324F", padding: "14px 16px 0", position: "sticky", top: 0, zIndex: 10 }}>
        <div className="oud-wrap">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>オウダン</span>
            <span style={{ color: "#A8C3D9", fontSize: 10.5, fontWeight: 600 }}>
              実質価格で比べる横断検索
              {amazonStatus === "ok" && " ・ Amazon対応中"}
            </span>
          </div>
          <div className="oud-search" style={{ display: "flex", gap: 8 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              placeholder="商品名・キーワード(例:シャンプー)"
              style={{ flex: 1, border: "none", borderRadius: 10, padding: "11px 14px", fontSize: 16, outline: "none" }}
            />
            <button onClick={() => doSearch()} style={{ background: "#10B981", color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
              検索
            </button>
          </div>
          {/* タブ */}
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {[
              ["home", "ホーム"],
              ["search", "検索"],
              ["list", `リスト(${wishlist.length})`],
              ["history", "履歴"],
              ["mypage", "マイページ"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setView(key); setSelected(null); }}
                style={{
                  flex: 1, background: "none", border: "none", cursor: "pointer",
                  padding: "8px 0", fontSize: 12, fontWeight: 700,
                  color: view === key ? "#34D399" : "#A8C3D9",
                  borderBottom: view === key ? "2.5px solid #34D399" : "2.5px solid transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="oud-wrap" style={{ padding: "16px 16px 48px" }}>
        {user && !user.is_anonymous && (
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
            <span>ログイン中: {user.email}</span>
            <button onClick={() => supabase.auth.signOut()} style={btnGhost}>ログアウト</button>
          </div>
        )}

        {/* ===== ホームタブ ===== */}
        {view === "home" && !selected && (
          <div>
            {/* カテゴリから探す(購買導線) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 18 }}>
              {personalCategories(viewHistory, searchHistory, 8).map((kw) => [CATEGORY_ICONS[kw] || "🛒", kw]).map(([icon, kw]) => (
                <button key={kw} onClick={() => { setQuery(kw); doSearch(kw); }}
                  style={{ background: "#fff", border: "1px solid #DDE9E4", borderRadius: 12, padding: "12px 4px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "#334155", textAlign: "center", lineHeight: 1.2 }}>{kw}</span>
                </button>
              ))}
            </div>

            {(() => {
              const deals = todayDeals();
              const next50 = nextFiveZeroDay();
              // シート由来イベントを「開催中→今後開催」の順に、開始日でソート
              const norm = (t) => (t || "").replace(/[\s\u3000]/g, "");
              const isLiveStatus = (e) => norm(e.status).includes("開催中");
              const live = saleEvents.filter(isLiveStatus);
              const upcoming = saleEvents.filter((e) => !isLiveStatus(e));
              const sortByDate = (a, b) => (a.start_date || "").localeCompare(b.start_date || "");
              // 開催中は「終了が近い順」に並べる。
              //  ・これから終了(0,1,2…日)= 近い順に上へ
              //  ・終了日不明/無期限 = その下
              //  ・終了日が過ぎた古いデータ = 最下部
              // 同じ残日数のときは開始日順で安定させる。
              const dLive = (e) => {
                const d = daysUntilEnd(e);
                if (d == null) return 100000;
                if (d < 0) return 200000 + Math.abs(d);
                return d;
              };
              live.sort((a, b) => {
                const da = dLive(a), db = dLive(b);
                if (da !== db) return da - db;
                return sortByDate(a, b);
              });
              upcoming.sort(sortByDate);
              const ordered = [...live, ...upcoming];
              // 読み込み完了後、シートが空のときだけ従来の自動予測にフォールバック。
              // 読み込み前は予測を出さない(古い告知のチラつき防止)
              const bigs = (saleLoaded && ordered.length === 0) ? upcomingBigSales(new Date(), saleEvents) : [];

              // 終了日までの残日数を判定(本日終了/明日終了で色を変える)
              function daysUntilEnd(ev) {
                const t = ev.period_text || "";
                const SEP = /[〜～\-–—]/g;
                // 「開始日〜」のように区切りの後ろに日付が無い=無期限 → 終了日不明(null)
                let lastSepIdx = -1, sm;
                while ((sm = SEP.exec(t)) !== null) lastSepIdx = sm.index;
                const openEnded = lastSepIdx >= 0 && !/(\d{1,2})月(\d{1,2})日/.test(t.slice(lastSepIdx + 1));

                // period_text から終了日(最後の日付)を推定。
                // 「2026年7月20日〜7月23日」のように後半の年が省略される形に対応するため、
                // 年なしの日付は直前に出た年(無ければ今年)を引き継ぐ。
                let fromText = null;
                if (!openEnded && t) {
                  const re = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g;
                  let ly = new Date().getFullYear(), m, last = null;
                  while ((m = re.exec(t)) !== null) {
                    const y = m[1] ? parseInt(m[1], 10) : ly;
                    if (m[1]) ly = y;
                    last = `${y}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
                  }
                  fromText = last;
                }
                // end_date列(取り込み時に入る値)。旧バージョンの取り込みでは開始日が
                // 入っている場合があるため、期間テキスト由来の終了日と「遅い方」を採用して
                // 自己修復する(YYYY-MM-DDは辞書順比較で日付の大小と一致する)。
                const fromCol = ev.end_date ? String(ev.end_date).slice(0, 10) : null;

                let endStr = null;
                if (openEnded) endStr = null; // 無期限は判定不能
                else if (fromText && fromCol) endStr = fromText > fromCol ? fromText : fromCol;
                else endStr = fromText || fromCol;

                if (!endStr) return null;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const end = new Date(endStr); end.setHours(0, 0, 0, 0);
                if (isNaN(end)) return null;
                return Math.round((end - today) / 86400000);
              };
              const LiveCard = ({ ev }) => {
                const d = daysUntilEnd(ev);
                // 3段階の目立ち方:
                //  本日終了(d===0) … 最も目立たせる(太枠+赤い影+大きめ文字+⏰)
                //  明日終了(d===1) … そこそこ目立たせる(やや太枠+淡い影+⏳)
                //  通常の開催中    … 控えめ(細枠・影なし・文字も小さめでトーンダウン)
                //  ※dがマイナス(終了日が過ぎている/終了日不明のnull)は通常扱い
                const tier = d === 0 ? "today" : d === 1 ? "tomorrow" : "normal";
                const theme = tier === "today"
                  ? {
                      bg: "#FEE2E2", border: "#DC2626", borderW: 2.5, text: "#991B1B",
                      badge: "#DC2626", badgeText: "⏰ 本日終了", badgeSize: 11, nameSize: 15.5,
                      pad: "14px 16px", mb: 12,
                      shadow: "0 0 0 3px rgba(220,38,38,0.14), 0 6px 16px rgba(220,38,38,0.28)",
                    }
                  : tier === "tomorrow"
                  ? {
                      bg: "#FFF7ED", border: "#EA580C", borderW: 2, text: "#9A3412",
                      badge: "#EA580C", badgeText: "⏳ 明日終了", badgeSize: 10, nameSize: 13.5,
                      pad: "12px 14px", mb: 9,
                      shadow: "0 2px 8px rgba(234,88,12,0.18)",
                    }
                  : {
                      // 通常はトーンダウン: 淡い枠・淡い背景・影なし
                      bg: "#FEF6F6", border: "#F0B4B4", borderW: 1, text: "#9B4B4B",
                      badge: "#CE6B6B", badgeText: "開催中", badgeSize: 9, nameSize: 12.5,
                      pad: "9px 13px", mb: 7,
                      shadow: "none",
                    };
                const style = {
                  display: "block", textDecoration: "none",
                  background: theme.bg, border: `${theme.borderW}px solid ${theme.border}`,
                  borderRadius: 12, padding: theme.pad, marginBottom: theme.mb,
                  boxShadow: theme.shadow,
                };
                const inner = (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: STORES[ev.store]?.color || "#64748B", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>
                        {STORES[ev.store]?.short || ev.store}
                      </span>
                      <span style={{ fontSize: theme.badgeSize, fontWeight: 800, color: "#fff", background: theme.badge, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{theme.badgeText}</span>
                      {ev.url && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#64748B", whiteSpace: "nowrap" }}>会場 ↗</span>}
                    </div>
                    <div style={{ fontSize: theme.nameSize, fontWeight: 800, color: theme.text, marginBottom: 3, lineHeight: 1.4 }}>{ev.name}</div>
                    {ev.period_text && <div style={{ fontSize: 11, color: "#475569" }}>🗓 {ev.period_text}</div>}
                    {ev.summary && <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5, marginTop: 2 }}>{ev.summary}</div>}
                  </>
                );
                return ev.url ? (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer sponsored" style={style}>{inner}</a>
                ) : (<div style={style}>{inner}</div>);
              };
              // 今後開催: タップでポップアップ(概要を隠してコンパクトに)
              const UpcomingChip = ({ ev }) => (
                <button
                  onClick={() => setSaleModal(ev)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
                    background: "#EFF6FF", border: "1.5px solid #93C5FD", borderRadius: 12,
                    padding: "9px 13px", marginBottom: 8, cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: STORES[ev.store]?.color || "#64748B", borderRadius: 4, padding: "1px 6px" }}>
                    {STORES[ev.store]?.short || ev.store}
                  </span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: "#1D4ED8", background: "#DBEAFE", borderRadius: 4, padding: "1px 6px" }}>今後開催</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#1E3A8A", flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{ev.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B" }}>詳細 ›</span>
                </button>
              );

              return (
                <div style={{ marginBottom: 16 }}>
                  {live.length > 0 && (
                    <>
                      <h2 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>🔥 開催中のセール</h2>
                      {live.map((ev, i) => <LiveCard key={"l" + i} ev={ev} />)}
                    </>
                  )}
                  {upcoming.length > 0 && (
                    <button
                      onClick={() => setUpcomingModal(upcoming)}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                        background: "#EFF6FF", border: "1.5px solid #93C5FD", borderRadius: 12,
                        padding: "12px 14px", marginTop: live.length ? 12 : 0, marginBottom: 8, cursor: "pointer" }}>
                      <span style={{ fontSize: 18 }}>📅</span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#1E3A8A", flex: 1 }}>
                        今後のセール {upcoming.length}件を見る
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8" }}>一覧 ›</span>
                    </button>
                  )}
                  {bigs.map((b, i) => {
                    const style = {
                      display: "block",
                      background: b.status === "live" ? "#FDECEC" : "#EFF6FF",
                      border: `1.5px solid ${b.status === "live" ? "#BF0000" : "#F59E0B"}`,
                      borderRadius: 12, padding: "10px 14px", marginBottom: 8,
                      fontSize: 12.5, fontWeight: 800,
                      color: b.status === "live" ? "#8F1D1D" : "#92670C",
                      textDecoration: "none",
                    };
                    return b.url ? (
                      <a key={"b" + i} href={b.url} target="_blank" rel="noopener noreferrer sponsored" style={style}>
                        {b.label} <span style={{ float: "right", fontWeight: 700 }}>会場を見る ↗</span>
                      </a>
                    ) : (<div key={"b" + i} style={style}>{b.label}</div>);
                  })}
                  {/* 定期セール(5と0のつく日など)は常に自動表示 */}
                  {deals.length > 0 ? (
                    deals.map((d, i) => (
                      <div key={"d" + i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #DDE9E4", borderRadius: 12, padding: "9px 13px", marginBottom: 6 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: (STORES[d.store]?.color || "#64748B"), borderRadius: 4, padding: "2px 7px" }}>
                          {(STORES[d.store]?.short || d.store)}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>本日: {d.label}</span>
                      </div>
                    ))
                  ) : null}
                </div>
              );
            })()}

            {/* 値引き強度(公式APIの実測データから自動判定) */}
            {saleHeat && saleHeat.count >= 6 && saleHeat.avgDiscount >= 15 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FDECEC", border: "1px solid #F0B4B4", borderRadius: 12, padding: "9px 13px", marginBottom: 16, fontSize: 12, fontWeight: 700, color: "#8F1D1D" }}>
                🔥 本日は値引きが多め(検出{saleHeat.count}件・平均{saleHeat.avgDiscount}%OFF・最大{saleHeat.maxDiscount}%OFF)。ピックアップをチェック
              </div>
            )}

            {/* 注目商品: 追跡中(📌)の商品のうち、直近で動きが大きいもの。
                指値に到達したものを最優先で表示する */}
            {(() => {
              const tracked = wishlist.filter((w) => w.track);
              if (tracked.length === 0) return null;
              const rows = tracked.map((w) => {
                const cur = wishlistPrices.latest?.[w.jan] ?? null;
                const base = w.base_price || null;
                const al = myAlerts.find((a) => a.jan === w.jan);
                const hitAlert = al && cur != null && cur <= al.target_price;
                const pct = base && cur != null ? Math.round(((cur - base) / base) * 100) : null;
                return { w, cur, base, pct, al, hitAlert };
              }).filter((r) => r.hitAlert || (r.pct != null && Math.abs(r.pct) >= 3));
              if (rows.length === 0) return null;
              rows.sort((a, b) => (b.hitAlert ? 1 : 0) - (a.hitAlert ? 1 : 0) || (a.pct ?? 0) - (b.pct ?? 0));
              return (
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>📌 注目商品(追跡中の値動き)</h2>
                  {rows.slice(0, 6).map(({ w, cur, pct, al, hitAlert }) => (
                    <div
                      key={w.jan}
                      onClick={() => openFromList(w)}
                      role="button"
                      style={{ ...card, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", border: hitAlert ? "2px solid #DC2626" : "1px solid #E2E8F0" }}
                    >
                      {w.image && <img src={w.image} alt="" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 8, background: "#EAF3F0" }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{w.name}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: hitAlert ? "#DC2626" : pct < 0 ? "#059669" : "#64748B" }}>
                          {cur != null ? yen(cur) : "価格取得中"}
                          {pct != null && pct !== 0 && <span>{" "}{pct < 0 ? "▼" : "▲"}{Math.abs(pct)}%(登録時比)</span>}
                          {hitAlert && <span style={{ marginLeft: 6 }}>🎯 指値{yen(al.target_price)}に到達</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* お気に入りが値下がり中(擬似通知): 気になる/定期購入の2セクション */}
            {dropAlerts.length > 0 && [
              ["watch", "👀 気になっている商品が値下がり中", "#10B981", "#059669"],
              ["rotation", "🔁 定期購入している商品が値下がり中", "#0EA5E9", "#0369A1"],
            ].map(([lt, title, border, priceColor]) => {
              const items = dropAlerts.filter((a) => (a.listType || "watch") === lt);
              if (items.length === 0) return null;
              return (
                <div key={lt} style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>{title}</h2>
                  {items.map((a) => {
                    const stale = staleAlerts.includes(a.key);
                    return (
                    <div
                      key={a.key}
                      onClick={() => openFromList({ jan: a.key, name: a.name, image: a.image })}
                      role="button"
                      title="商品詳細を開く"
                      style={{ ...card, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", border: `1.5px solid ${stale ? "#CBD5E1" : border}`, ...(stale ? { opacity: 0.55, filter: "grayscale(0.8)", background: "#F1F5F9" } : null) }}
                    >
                      {a.image && <img src={a.image} alt="" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, background: "#EAF3F0" }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{a.name}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: stale ? "#64748B" : priceColor }}>
                          {yen(a.prev)} → {yen(a.latest)}({a.drop}%値下がり)
                        </div>
                        {stale && (
                          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>
                            ⏳ 確認時は価格が戻っていました(記録とのタイムラグ)。タップで最新を確認できます
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 800, background: stale ? "#94A3B8" : border, color: "#fff", borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>
                        今すぐ見る
                      </span>
                    </div>
                    );
                  })}
                </div>
              );
            })}

            {/* そろそろ切れる頃 */}
            {(() => {
              const now = Date.now();
              // 同じ商品を2回以上買っていれば、その間隔から「切れる頃」を個別予測
              const byKey = {};
              for (const r of purchasedOnly) {
                if (r.jan) (byKey[r.jan] = byKey[r.jan] || []).push(new Date(r.clicked_at).getTime());
              }
              const cycleOf = (key) => {
                const ts = (byKey[key] || []).sort((a, b) => a - b);
                if (ts.length < 2) return 30 * 86400000;
                let sum = 0;
                for (let i = 1; i < ts.length; i++) sum += ts[i] - ts[i - 1];
                return Math.max(sum / (ts.length - 1), 7 * 86400000);
              };
              const seen = new Set();
              const running_out = purchasedOnly.filter((r) => {
                if (r.jan && seen.has(r.jan)) return false;
                if (r.jan) seen.add(r.jan);
                return now - new Date(r.clicked_at).getTime() > cycleOf(r.jan);
              }).slice(0, 3);
              if (running_out.length === 0) return null;
              return (
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>🔄 そろそろ切れる頃かも</h2>
                  {running_out.map((r) => (
                    <div key={r.id} style={{ ...card, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{r.name}</div>
                        <div style={{ fontSize: 10.5, color: "#64748B" }}>
                          {new Date(r.clicked_at).toLocaleDateString("ja-JP")} に{STORES[r.store]?.short}で購入(
                          {Math.floor((now - new Date(r.clicked_at).getTime()) / 86400000)}日前)
                        </div>
                      </div>
                      <button onClick={() => doSearch(r.jan || r.name)} style={{ fontSize: 11.5, fontWeight: 800, background: "#16324F", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                        今の最安値
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 本日のピックアップ */}
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 8px" }}>🏷 本日の値下げピックアップ</h2>
            {pickup === null ? (
              <p style={{ fontSize: 12.5, color: "#64748B" }}>読み込み中…</p>
            ) : pickup.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "#64748B" }}>本日は大きな値引き商品が見つかりませんでした。検索タブから実質価格で比較してみてください。</p>
            ) : (
              <div className="oud-grid">
              {pickup.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer sponsored"
                  onClick={() => logBuyClick({ jan: p.jan, name: p.name }, { store: p.store, price: p.price }, p.originalPrice ? p.originalPrice - p.price : 0)}
                  style={{ ...card, position: "relative", display: "flex", gap: 12, marginBottom: 8, padding: 12, textDecoration: "none", color: "#16324F", alignItems: "center" }}>
                  {user && (
                    <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); addHomeToList(p, p.store); }}
                      style={{ position: "absolute", top: 8, right: 10, fontSize: 18, color: wishlist.some((w) => w.jan === p.jan) ? "#E11D48" : "#CBD5E1", cursor: "pointer", zIndex: 2 }}
                      title="お気に入りに追加">{wishlist.some((w) => w.jan === p.jan) ? "♥" : "♡"}</span>
                  )}
                  {p.image ? (
                    <img src={p.image} alt="" style={{ width: 84, height: 84, objectFit: "contain", borderRadius: 8, background: "#EAF3F0", flexShrink: 0 }} />
                  ) : <div style={{ width: 84, height: 84, borderRadius: 8, background: "#EAF3F0", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: "#B0483C", borderRadius: 4, padding: "1px 6px" }}>{p.discount}%OFF</span>
                      {p.lowestEver && (
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: "#059669", borderRadius: 4, padding: "1px 6px" }}>過去最安圏</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{yen(p.price)}</span>
                      {p.originalPrice && <s style={{ fontSize: 11, color: "#94A3B8" }}>{yen(p.originalPrice)}</s>}
                      <span style={{ fontSize: 10, fontWeight: 700, color: (STORES[p.store]?.color || "#64748B") }}>{(STORES[p.store]?.short || p.store)}</span>
                    </div>
                  </div>
                </a>
              ))}
              </div>
            )}
            {/* 楽天の人気商品 */}
            {rakutenRec.length > 0 && (
              <>
                <h2 style={{ fontSize: 14, fontWeight: 800, margin: "18px 0 8px" }}>
                  <span style={{ color: "#BF0000" }}>楽天</span>のおすすめ
                  {recKeyword && <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>(「{recKeyword}」の人気商品)</span>}
                </h2>
                <div className="oud-grid4">
                  {rakutenRec.map((p, i) => (
                    <a key={"rr" + i} href={p.url} target="_blank" rel="noopener noreferrer sponsored"
                      onClick={() => logBuyClick({ jan: p.code ? "r:" + p.code : null, name: p.name }, { store: "rakuten", price: p.price })}
                      style={{ ...card, position: "relative", padding: 10, textDecoration: "none", color: "#16324F" }}>
                      {user && (
                        <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); addHomeToList(p, "rakuten"); }}
                          style={{ position: "absolute", top: 6, right: 8, fontSize: 17, color: wishlist.some((w) => w.jan === (p.code ? "r:" + p.code : "")) ? "#E11D48" : "#CBD5E1", cursor: "pointer", zIndex: 2, background: "rgba(255,255,255,.85)", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="お気に入りに追加">{wishlist.some((w) => w.jan === (p.code ? "r:" + p.code : "")) ? "♥" : "♡"}</span>
                      )}
                      <img src={p.image} alt="" style={{ width: "100%", height: 110, objectFit: "contain", borderRadius: 8, background: "#EAF3F0" }} />
                      <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, marginTop: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{yen(p.price)}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#BF0000" }}>楽天</span>
                      </div>
                      {p.reviews > 0 && <div style={{ fontSize: 10, color: "#64748B" }}>★{p.rating}({p.reviews.toLocaleString()})</div>}
                    </a>
                  ))}
                </div>
              </>
            )}

            {/* Amazonの売れ筋への導線(API開通までのつなぎ) */}
            <a
              href={"https://www.amazon.co.jp/gp/bestsellers/hpc?tag=popo-kaiteki-22"}
              target="_blank" rel="noopener noreferrer sponsored"
              style={{ display: "block", textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "#16324F", border: "1.5px solid #16324F", borderRadius: 12, padding: "12px 14px", textDecoration: "none", margin: "16px 0 4px" }}
            >
              Amazonの売れ筋ランキング(日用品)を見る →
            </a>

            {/* おすすめ商品 */}
            {recommend.length > 0 && (
              <>
                <h2 style={{ fontSize: 14, fontWeight: 800, margin: "18px 0 8px" }}>⭐ <span style={{ color: "#FF0033" }}>Yahoo!</span>で人気の定番商品</h2>
                <div className="oud-grid4">
                  {recommend.map((p, i) => (
                    <a key={"r" + i} href={p.url} target="_blank" rel="noopener noreferrer sponsored"
                      onClick={() => logBuyClick({ jan: p.jan, name: p.name }, { store: p.store, price: p.price })}
                      style={{ ...card, position: "relative", padding: 10, textDecoration: "none", color: "#16324F" }}>
                      {user && (
                        <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); addHomeToList(p, p.store); }}
                          style={{ position: "absolute", top: 6, right: 8, fontSize: 17, color: wishlist.some((w) => w.jan === p.jan) ? "#E11D48" : "#CBD5E1", cursor: "pointer", zIndex: 2, background: "rgba(255,255,255,.85)", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="お気に入りに追加">{wishlist.some((w) => w.jan === p.jan) ? "♥" : "♡"}</span>
                      )}
                      {p.image ? (
                        <img src={p.image} alt="" style={{ width: "100%", height: 110, objectFit: "contain", borderRadius: 8, background: "#EAF3F0" }} />
                      ) : <div style={{ width: "100%", height: 110, borderRadius: 8, background: "#EAF3F0" }} />}
                      <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.35, marginTop: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 800 }}>{yen(p.price)}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: (STORES[p.store]?.color || "#64748B") }}>{(STORES[p.store]?.short || p.store)}</span>
                      </div>
                      {p.reviews > 0 && <div style={{ fontSize: 10, color: "#64748B" }}>★{p.rating}({p.reviews.toLocaleString()})</div>}
                    </a>
                  ))}
                </div>
              </>
            )}
            <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 10 }}>【PR】ピックアップ・おすすめのリンクにはアフィリエイトリンクが含まれます。</p>
          </div>
        )}

        {/* ===== マイページタブ ===== */}
        {view === "mypage" && !selected && (
          <div>
            {/* ポイントカード */}
            <div style={{ ...card, background: "#16324F", border: "none", color: "#fff", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#A8C3D9", fontWeight: 700 }}>オウダンポイント</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: "#34D399" }}>{pointBalance.toLocaleString()}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#34D399" }}>pt</span>
                <span style={{ fontSize: 12, color: "#A8C3D9", marginLeft: "auto" }}>{rank}</span>
              </div>
              <button
                onClick={dailyCheckin}
                disabled={!user || checkedInToday}
                style={{
                  width: "100%", marginTop: 12, border: "none", borderRadius: 10, padding: "11px 0",
                  fontSize: 13, fontWeight: 800, cursor: user && !checkedInToday ? "pointer" : "default",
                  background: checkedInToday ? "#1F3B57" : "#10B981",
                  color: checkedInToday ? "#94A3B8" : "#fff",
                }}
              >
                {checkedInToday ? "✓ 本日のチェックイン獲得済み" : "毎日チェックインで +5pt"}
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, padding: "10px 12px", background: "#1F3B57", borderRadius: 10 }}>
                <span style={{ fontSize: 11.5, color: "#A8C3D9", fontWeight: 700 }}>💰 オウダンでの節約総額</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#34D399" }}>{yen(totalSavings)}</span>
              </div>
              <p style={{ fontSize: 10.5, color: "#A8C3D9", margin: "10px 0 0", lineHeight: 1.6 }}>
                貯め方: レビュー投稿 +50pt / 購入報告 +10pt / 毎日チェックイン +5pt。
                貯めたポイントの使い道(特典・交換)は順次追加予定です。
              </p>
            </div>

            {/* モール別ショートカット */}
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "18px 0 4px" }}>各モールのよく使うページ</h2>
            <p style={{ fontSize: 11.5, color: "#64748B", margin: "0 0 10px" }}>
              「注文どこ?」「返品したい」に迷ったらここから。各モールのページが開きます(ログインは各モールで)。
            </p>
            {[
              {
                store: "rakuten",
                links: [
                  ["注文履歴", "https://order.my.rakuten.co.jp/"],
                  ["ポイント残高", "https://point.rakuten.co.jp/"],
                  ["返品・キャンセル/ヘルプ", "https://ichiba.faq.rakuten.net/"],
                ],
              },
              {
                store: "yahoo",
                links: [
                  ["注文履歴", "https://odhistory.shopping.yahoo.co.jp/order-history/list"],
                  ["PayPayポイント残高", "https://points.yahoo.co.jp/"],
                  ["返品・キャンセル/ヘルプ", "https://support.yahoo-net.jp/PccShopping/s/"],
                ],
              },
              {
                store: "amazon",
                links: [
                  ["注文履歴", "https://www.amazon.co.jp/gp/css/order-history"],
                  ["ポイント残高", "https://www.amazon.co.jp/mypoints"],
                  ["返品・交換", "https://www.amazon.co.jp/gp/css/returns/homepage.html"],
                  ["ヘルプ", "https://www.amazon.co.jp/gp/help/customer/display.html"],
                ],
              },
            ].map(({ store, links }) => (
              <div key={store} style={{ ...card, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: (STORES[store]?.color || "#64748B"), marginBottom: 8 }}>
                  {STORES[store].name}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {links.map(([label, url]) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, fontWeight: 700, color: "#16324F", background: "#EAF3F0", border: "1px solid #CBD5E1", borderRadius: 999, padding: "7px 13px", textDecoration: "none" }}>
                      {label} ↗
                    </a>
                  ))}
                </div>
              </div>
            ))}

            {/* クーポン・キャンペーン */}
            <h2 style={{ fontSize: 15, fontWeight: 800, margin: "18px 0 4px" }}>クーポン・エントリー必須キャンペーン</h2>
            <p style={{ fontSize: 11.5, color: "#64748B", margin: "0 0 10px" }}>
              エントリーやクーポン取得を忘れるとポイントが付きません。買う前にここでチェック。
            </p>
            {[
              {
                store: "rakuten",
                links: [
                  ["クーポン一覧", "https://coupon.rakuten.co.jp/"],
                  ["5と0のつく日エントリー", "https://event.rakuten.co.jp/campaign/point/50days/"],
                  ["開催中キャンペーン", "https://event.rakuten.co.jp/campaign/point/"],
                ],
              },
              {
                store: "yahoo",
                links: [
                  ["クーポン一覧", "https://shopping.yahoo.co.jp/coupon/"],
                  ["5のつく日キャンペーン", "https://shopping.yahoo.co.jp/campaign/5day/"],
                  ["ズバトク(開催中特典)", "https://toku.yahoo.co.jp/"],
                ],
              },
              {
                store: "amazon",
                links: [
                  ["クーポン", "https://www.amazon.co.jp/coupons"],
                  ["タイムセール", "https://www.amazon.co.jp/deals"],
                  ["ポイントアップキャンペーン", "https://www.amazon.co.jp/events"],
                ],
              },
            ].map(({ store, links }) => (
              <div key={"c-" + store} style={{ ...card, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: (STORES[store]?.color || "#64748B"), marginBottom: 8 }}>
                  {STORES[store].name}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {links.map(([label, url]) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, fontWeight: 700, color: "#065F46", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 999, padding: "7px 13px", textDecoration: "none" }}>
                      🎫 {label} ↗
                    </a>
                  ))}
                </div>
              </div>
            ))}

            {/* ポイント履歴 */}
            {user && ledger.length > 0 && (
              <>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: "18px 0 8px" }}>ポイント履歴</h2>
                {ledger.slice(0, 10).map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "7px 4px", borderBottom: "1px solid #E2E8F0" }}>
                    <span style={{ color: "#475569" }}>{r.label}</span>
                    <span style={{ fontWeight: 800, color: "#059669" }}>+{r.amount}pt</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ===== プロフィール設定(端末内にのみ保存) ===== */}
        {view === "mypage" && !selected && (
          <div style={{ ...card, marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 0 }}>あなたの条件(この端末にのみ保存)</h2>
            <p style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.7, margin: "0 0 12px" }}>
              ここで設定した内容は<b>この端末の中だけに保存</b>され、オウダンのサーバーには送信されません。
              ブラウザのデータを消せばいつでも削除できます。
            </p>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 5 }}>お住まいの都道府県</div>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 5 }}>送料が高くなりやすい地域の注意を出します。</div>
              <select
                value={profile.pref || ""}
                onChange={(e) => setProfileField("pref", e.target.value)}
                style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 10px", fontSize: 16, background: "#fff", maxWidth: 200 }}
              >
                <option value="">未設定</option>
                {PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {profile.pref && shippingHint(profile.pref) && (
                <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 6 }}>
                  送料の傾向: <b>{shippingHint(profile.pref).extra}</b> — {shippingHint(profile.pref).note}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 5 }}>お持ちのカード(券種のみ)</div>
              <div style={{ fontSize: 11, color: "#B0483C", fontWeight: 700, marginBottom: 5 }}>
                ⚠ カード番号は入力しないでください。オウダンは番号を扱いません。
              </div>
              <select
                value={profile.card || ""}
                onChange={(e) => applyCardPreset(e.target.value)}
                style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 10px", fontSize: 16, background: "#fff", maxWidth: 280 }}
              >
                <option value="">未設定</option>
                {CARD_PRESETS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 5 }}>
                選ぶと下の還元率が目安の値に切り替わります。実際の条件に合わせて手動で調整できます。
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 5 }}>年代(任意)</div>
                <select
                  value={profile.age || ""}
                  onChange={(e) => setProfileField("age", e.target.value)}
                  style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 10px", fontSize: 16, background: "#fff" }}
                >
                  <option value="">未設定</option>
                  {AGE_BANDS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 5 }}>性別(任意)</div>
                <select
                  value={profile.gender || ""}
                  onChange={(e) => setProfileField("gender", e.target.value)}
                  style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 10px", fontSize: 16, background: "#fff" }}
                >
                  <option value="">未設定</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: "#94A3B8", marginTop: 10, lineHeight: 1.6 }}>
              年代・性別はおすすめ表示の参考にのみ使います。未設定でもすべての機能が利用できます。
            </div>
            <a href="/privacy" style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, color: "#16324F", marginTop: 10 }}>
              プライバシーポリシーを読む ↗
            </a>
          </div>
        )}

        {/* ===== 設定セクション(マイページ内) ===== */}
        {view === "mypage" && !selected && (
          <div style={card}>
            <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 0 }}>ポイント還元率の設定</h2>
            <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
              あなたの各モールのポイント還元率(%)を入力すると、全商品の比較が
              「実質価格(価格−ポイント分)」で並び替わります。
              例: 楽天SPUが7倍なら「7」、PayPayステップ合計5%なら「5」。
            </p>
            {Object.keys(STORES).map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ width: 90, fontSize: 13, fontWeight: 700, color: (STORES[s]?.color || "#64748B") }}>{STORES[s].name}</span>
                <input
                  type="number" min="0" max="50" step="0.5"
                  value={rates[s] ?? 0}
                  onChange={(e) => saveRates({ ...rates, [s]: parseFloat(e.target.value) || 0 })}
                  style={{ width: 80, border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 10px", fontSize: 16 }}
                />
                <span style={{ fontSize: 12.5, color: "#64748B" }}>%</span>
              </div>
            ))}
            <p style={{ fontSize: 10.5, color: "#94A3B8", lineHeight: 1.6 }}>
              設定はこの端末に保存されます。SPUやキャンペーンの実際の付与率・上限は各モールでご確認ください。
            </p>

            {user && (
              <>
                {user.is_anonymous && (
                  <>
                    <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 24 }}>データの引き継ぎ設定</h2>
                    <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
                      いまは登録なしで利用中です(データはこの端末のブラウザに保存)。
                      機種変更やPC・スマホ間の連携をしたい場合だけ、メールとパスワードを設定してください。
                    </p>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" type="email"
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "9px 12px", fontSize: 16, outline: "none", marginBottom: 8 }} />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード(6文字以上)" type="password"
                      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "9px 12px", fontSize: 16, outline: "none", marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={async () => {
                          if (!email.includes("@") || password.length < 6) return setAuthMsg("メールと6文字以上のパスワードを入力してください");
                          const { error } = await supabase.auth.updateUser({ email, password });
                          setAuthMsg(error ? "設定に失敗しました: " + error.message : "確認メールを送りました。リンクを開くと引き継ぎ完了です。");
                        }}
                        style={{ flex: 1, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                        この端末のデータを引き継ぎ登録
                      </button>
                      <button onClick={signInWithPassword}
                        style={{ flex: 1, background: "#fff", color: "#16324F", border: "1.5px solid #16324F", borderRadius: 8, padding: "10px 0", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                        既存アカウントでログイン
                      </button>
                    </div>
                    {authMsg && <p style={{ fontSize: 11.5, color: "#92670C", margin: "8px 0 0" }}>{authMsg}</p>}
                  </>
                )}
                <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 24 }}>パスワードの設定・変更</h2>
                <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
                  メールリンクで登録した方も、ここでパスワードを設定すると
                  次回から「メール+パスワード」でログインできます。
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新しいパスワード(6文字以上)" type="password"
                    style={{ flex: 1, border: "1px solid #CBD5E1", borderRadius: 8, padding: "9px 12px", fontSize: 16, outline: "none" }} />
                  <button onClick={updatePassword} style={{ background: "#16324F", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    保存
                  </button>
                </div>
                {pwMsg && <p style={{ fontSize: 11.5, color: "#059669", margin: "8px 0 0" }}>{pwMsg}</p>}
              </>
            )}
          </div>
        )}

        {/* ===== 購入履歴タブ ===== */}
        {view === "history" && !selected && (
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800 }}>購入履歴</h2>
            <input
              value={histQuery}
              onChange={(e) => setHistQuery(e.target.value)}
              placeholder="🔍 前に買ったあの商品を検索(例: シャンプー)"
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 10, padding: "10px 12px", fontSize: 16, outline: "none", marginBottom: 10 }}
            />

            {/* 一括操作: 未確認(「購入した?」のまま)の履歴に対して */}
            {historyRows.some((r) => !r.purchased) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <button
                  onClick={markAllPurchased}
                  style={{ fontSize: 11.5, fontWeight: 800, background: "#059669", color: "#fff", border: "none", borderRadius: 999, padding: "7px 12px", cursor: "pointer" }}
                >
                  ✓ 未確認{historyRows.filter((r) => !r.purchased).length}件をすべて購入済みに
                </button>
                <button
                  onClick={deletePendingHistory}
                  style={{ fontSize: 11.5, fontWeight: 800, background: "#fff", color: "#B91C1C", border: "1px solid #FCA5A5", borderRadius: 999, padding: "7px 12px", cursor: "pointer" }}
                >
                  🗑 未確認{historyRows.filter((r) => !r.purchased).length}件をまとめて削除
                </button>
              </div>
            )}
            {purchasedOnly.length >= 2 && !histQuery && (() => {
              // 月別支出(直近6ヶ月の家計簿ライト)
              const byMonth = {};
              for (const r of purchasedOnly) {
                const d = new Date(r.clicked_at);
                const k = `${d.getFullYear()}/${d.getMonth() + 1}`;
                byMonth[k] = (byMonth[k] || 0) + (r.price || 0);
              }
              const months = Object.entries(byMonth).slice(0, 6);
              const maxV = Math.max(...months.map(([, v]) => v), 1);
              return (
                <div style={{ ...card, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>📒 月別のネットショッピング支出</div>
                  {months.map(([m, v]) => (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 62, fontSize: 11, color: "#64748B" }}>{m}</span>
                      <div style={{ flex: 1, height: 14, background: "#EAF3F0", borderRadius: 7 }}>
                        <div style={{ width: `${(v / maxV) * 100}%`, height: "100%", background: "#10B981", borderRadius: 7 }} />
                      </div>
                      <span style={{ width: 70, fontSize: 11.5, fontWeight: 700, textAlign: "right" }}>{yen(v)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            {purchasedOnly.length > 0 && (
              <div style={{ fontSize: 12, color: "#059669", fontWeight: 700, marginBottom: 8 }}>
                購入済み {purchasedOnly.length}件 / 合計 {yen(purchasedOnly.reduce((s, r) => s + (r.price || 0), 0))}
                {(() => {
                  const now = new Date();
                  const thisMonth = purchasedOnly.filter((r) => {
                    const d = new Date(r.clicked_at);
                    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
                  });
                  const sum = thisMonth.reduce((s, r) => s + (r.price || 0), 0);
                  return sum > 0 ? ` ・ 今月 ${thisMonth.length}件 ${yen(sum)}` : "";
                })()}
              </div>
            )}
            {historyRows.length === 0 ? (
              <div style={{ ...card, padding: 16, marginBottom: 10, background: "#F5FAF8" }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 10 }}>📘 購入履歴を残すと、こんなことができます</div>
                {[
                  ["🔁", "二重購入を防止", "「あれ、これ前も買ったっけ?」を防ぎます。購入済み商品には検索結果でも印が付きます"],
                  ["🔔", "そろそろ切れる頃の通知", "消耗品の購入間隔を学習し、ホームで「そろそろ無くなる頃」を教えます"],
                  ["💰", "節約額が貯まる", "最安店で買うたびに「他店との差額」が節約総額として積み上がります"],
                  ["📒", "ネット日用品の家計簿", "月別の支出が自動でグラフに。レシートの出ないネット購入分を可視化"],
                  ["🔍", "あの時の商品を再発見", "「前に買ったあのシャンプー」を名前で検索して、すぐ買い直せます"],
                  ["⭐", "レビューで+50pt", "購入した商品にはレビューが書け、ポイントが貯まります"],
                ].map(([icon, title, desc]) => (
                  <div key={title} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>
                      <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: "#059669", fontWeight: 700, marginTop: 6, lineHeight: 1.6 }}>
                  使い方はかんたん: 検索して購入ボタンを押すと自動で記録 → 実際に買ったら「購入した?」をタップするだけ。
                </div>
              </div>
            ) : (
              historyRows.filter((r) => !histQuery || r.name.toLowerCase().includes(histQuery.toLowerCase())).map((r) => (
                <div key={r.id} style={{ ...card, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    onClick={() => openFromList({ jan: r.jan, name: r.name })}
                    style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                    title="商品詳細を開く"
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {r.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#64748B", marginTop: 2 }}>
                      <span style={{ color: STORES[r.store]?.color || "#64748B", fontWeight: 700 }}>{STORES[r.store]?.short || "その他"}</span>
                      {r.price ? ` ・ ${yen(r.price)}` : ""} ・ {new Date(r.clicked_at).toLocaleDateString("ja-JP")}
                    </div>
                  </div>
                  <button
                    onClick={() => togglePurchased(r)}
                    style={{
                      fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "6px 10px", cursor: "pointer",
                      border: r.purchased ? "none" : "1px solid #CBD5E1",
                      background: r.purchased ? "#059669" : "#fff",
                      color: r.purchased ? "#fff" : "#64748B",
                    }}
                  >
                    {r.purchased ? "✓ 購入済み" : "購入した?"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== リストタブ ===== */}
        {view === "list" && !selected && (
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 800 }}>お気に入りリスト</h2>
            {wishlist.length === 0 ? (
              <p style={{ fontSize: 13, color: "#64748B" }}>
                商品詳細の「♡ お気に入りに追加」から登録すると、毎日の価格推移が記録されます。
              </p>
            ) : (
              <>
                {(() => {
                  // 「次の買い時(◯日後が5と0のつく日)」の予告バナーは非表示。
                  // 当日が「5と0のつく日」のときだけ案内を出す。
                  const n = nextFiveZeroDay();
                  return n ? null : (
                    <div style={{ fontSize: 12, color: "#065F46", background: "#ECFDF5", border: "1px solid #059669", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontWeight: 700 }}>
                      💡 本日は「5と0のつく日」。リストの商品を買うなら今日がお得です
                    </div>
                  );
                })()}
                {/* リスト種別タブ */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {[["watch", "👀 気になる"], ["rotation", "🔁 定期購入"]].map(([k, label]) => {
                    const count = wishlist.filter((w) => (w.list_type || "watch") === k).length;
                    return (
                      <button key={k} onClick={() => setListTab(k)}
                        style={{ flex: 1, fontSize: 12.5, fontWeight: 800, borderRadius: 10, padding: "9px 0", cursor: "pointer",
                          background: listTab === k ? "#16324F" : "#fff",
                          color: listTab === k ? "#fff" : "#16324F",
                          border: "1.5px solid #16324F" }}>
                        {label}({count})
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 10px", lineHeight: 1.6 }}>
                  {listTab === "watch"
                    ? "気になる商品の価格をウォッチ。値下がりするとホームで通知します。"
                    : "定期的に買う消耗品。買うと購入間隔を学習し「そろそろ切れる頃」を予測します。"}
                </p>
                {wishlist.filter((w) => (w.list_type || "watch") === listTab).map((w) => {
                  const cur = wishlistPrices.latest?.[w.jan];
                  const low14 = wishlistPrices.min14?.[w.jan];
                  const base = w.base_price;
                  const diff = cur && base ? cur - base : null;
                  const diffPct = diff && base ? Math.round((diff / base) * 100) : null;
                  // 買い時判定: 登録時より安い、または直近14日の最安値圏
                  const isBuyTime = cur != null && ((base && cur < base) || (low14 != null && cur <= low14));
                  return (
                    <button
                      key={w.jan}
                      onClick={() => openFromList(w)}
                      title={unopenable.includes(w.jan) ? "この商品は現在どのモールでも見つからないため、詳細を開けません" : undefined}
                      style={{ ...card, display: "flex", gap: 12, alignItems: "center", padding: 12, marginBottom: 8, width: "100%", textAlign: "left", cursor: "pointer", ...(unopenable.includes(w.jan) ? { opacity: 0.5, filter: "grayscale(1)", background: "#F1F5F9" } : null) }}
                    >
                      {w.image ? (
                        <img src={w.image} alt="" style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 8, background: "#EAF3F0", flexShrink: 0 }} />
                      ) : <div style={{ width: 64, height: 64, borderRadius: 8, background: "#EAF3F0", flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{w.name}</div>
                        {cur ? (
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 800 }}>{yen(cur)}</span>
                            {diff !== null && diff !== 0 && (
                              <span style={{ fontSize: 11.5, fontWeight: 800, color: diff < 0 ? "#059669" : "#B0483C" }}>
                                {diff < 0 ? "▼" : "▲"} {yen(Math.abs(diff))}({diff < 0 ? "" : "+"}{diffPct}%)
                              </span>
                            )}
                            {diff === 0 && <span style={{ fontSize: 11, color: "#64748B" }}>登録時と同じ</span>}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>価格データ蓄積中…タップで最新価格</div>
                        )}
                        {base && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>登録時: {yen(base)}</div>}
                        {unopenable.includes(w.jan) && (
                          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, color: "#64748B", background: "#E2E8F0", borderRadius: 5, padding: "2px 7px", marginTop: 4 }}>
                            詳細を開けません(取り扱い終了の可能性)
                          </span>
                        )}
                        {isBuyTime && base && cur < base && (
                          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, color: "#065F46", background: "#D1FAE5", border: "1px solid #10B981", borderRadius: 5, padding: "2px 7px", marginTop: 4, marginRight: 4 }}>
                            🟢 買い時(登録時より安い)
                          </span>
                        )}
                        {isBuyTime && low14 != null && cur <= low14 && (
                          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, color: "#155E75", background: "#CFFAFE", border: "1px solid #06B6D4", borderRadius: 5, padding: "2px 7px", marginTop: 4 }}>
                            🔵 買い時(14日で最安圏)
                          </span>
                        )}
                        {(() => {
                          // 指値に到達したら最も強く知らせる
                          const al = myAlerts.find((a) => a.jan === w.jan);
                          if (!al || cur == null || cur > al.target_price) return null;
                          return (
                            <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 5, padding: "2px 7px", marginTop: 4, marginLeft: 4 }}>
                              🎯 指値{yen(al.target_price)}に到達
                            </span>
                          );
                        })()}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setListType(w.jan, listTab === "watch" ? "rotation" : "watch");
                          }}
                          style={{ fontSize: 15, cursor: "pointer", border: "1px solid #CBD5E1", borderRadius: 6, padding: "3px 6px", whiteSpace: "nowrap" }}
                          title={listTab === "watch" ? "定期購入に移動" : "気になるに移動"}
                        >{listTab === "watch" ? "🔁定期へ" : "👀気になるへ"}</span>
                        <span
                          onClick={(e) => { e.stopPropagation(); toggleTrack(w); }}
                          style={{ fontSize: 11, fontWeight: 800, cursor: "pointer", borderRadius: 6, padding: "3px 6px", whiteSpace: "nowrap", border: w.track ? "none" : "1px solid #CBD5E1", background: w.track ? "#16324F" : "#fff", color: w.track ? "#fff" : "#64748B" }}
                          title="毎日かならず価格を更新します"
                        >{w.track ? "📌 追跡中" : "📌 追跡"}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`「${w.name.slice(0, 30)}」をリストから削除しますか?`)) {
                              toggleList({ key: w.jan, jan: /^\d{8,13}$/.test(w.jan) ? w.jan : null, name: w.name });
                            }
                          }}
                          style={{ fontSize: 17, cursor: "pointer" }}
                          title="削除"
                        >🗑️</span>
                      </div>
                    </button>
                  );
                })}
                {wishlist.filter((w) => (w.list_type || "watch") === listTab).length === 0 && (
                  <p style={{ fontSize: 12.5, color: "#94A3B8", textAlign: "center", padding: "24px 0" }}>
                    {listTab === "watch" ? "気になる商品はまだありません" : "定期購入の商品はまだありません"}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== 検索タブ ===== */}
        {/* 商品詳細はどのタブからでも開ける。閉じると開いた元のタブ(検索/リスト/履歴)に戻る */}
        {selected && (
          <Detail
            product={selected}
            onBack={() => setSelected(null)}
            backLabel={view === "list" ? "リストに戻る" : view === "history" ? "購入履歴に戻る" : view === "home" ? "ホームに戻る" : "検索結果に戻る"}
            profile={profile}
            user={user}
            inList={wishlist.some((w) => w.jan === (selected.key || selected.jan))}
            onToggleList={(listType) => toggleList(selected, listType)}
            rates={rates}
            onBuyClick={logBuyClick}
            purchasedInfo={(selected.key || selected.jan) ? purchasedMap[selected.key || selected.jan] : null}
            onEarnReview={(jan) => awardPoints(`review:${jan}`, 50, "レビュー投稿")}
            viewHistory={viewHistory}
            onOpenRelated={(it) => openFromList({ jan: it.key || it.jan, name: it.name, image: it.image })}
            onLinkJan={async (key, jan) => {
              await supabase.from("product_links").insert({ user_id: user.id, product_key: key, jan });
              awardPoints(`link:${key}`, 5, "名寄せ協力");
              alert("ありがとうございます!確認後、価格履歴の統合に活用されます(+5pt)");
            }}
          />
        )}

        {view === "search" && !selected && (
          loading ? (
            <p style={{ textAlign: "center", color: "#64748B", fontSize: 13, padding: 40 }}>各モールを検索中…</p>
          ) : results ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, color: "#64748B" }}>「{results.query}」 {sorted.length}件</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSort(v);
                    // 単価順以外はサーバーに並べ替えを投げ、カタログ全体からの並びを取り直す
                    if (v !== "unit" && results?.query) {
                      doSearch(results.query, v);
                    }
                  }}
                  style={{ fontSize: 12, border: "1px solid #CBD5E1", borderRadius: 8, padding: "6px 8px", background: "#fff", maxWidth: 180 }}
                >
                  <optgroup label="価格で並べる">
                    <option value="cheap">安い順(実質価格)</option>
                    <option value="high">高い順</option>
                    <option value="unit">単価が安い順(1mlあたり)</option>
                  </optgroup>
                  <optgroup label="人気・評価で並べる">
                    <option value="popular">人気順(売れ筋)</option>
                    <option value="reviews">レビュー件数が多い順</option>
                    <option value="rating">評価が高い順</option>
                  </optgroup>
                </select>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                {[["all", "すべて"], ["rakuten", "楽天"], ["yahoo", "Yahoo!"], ["amazon", "Amazon"]].map(([k, label]) => (
                  <button key={k} onClick={() => setMallFilter(k)}
                    style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 16, padding: "5px 13px", cursor: "pointer",
                      background: mallFilter === k ? "#16324F" : "#fff",
                      color: mallFilter === k ? "#fff" : "#475569",
                      border: `1px solid ${mallFilter === k ? "#16324F" : "#CBD5E1"}` }}>
                    {label}
                  </button>
                ))}
                <button onClick={() => setRatingFilter((v) => !v)}
                  style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 16, padding: "5px 13px", cursor: "pointer",
                    background: ratingFilter ? "#F59E0B" : "#fff",
                    color: ratingFilter ? "#fff" : "#475569",
                    border: `1px solid ${ratingFilter ? "#F59E0B" : "#CBD5E1"}` }}>
                  ★4以上
                </button>
              </div>
              <div className="oud-grid">
              {sorted.map((p, i) => {
                const bestOffer = [...p.offers].sort((a, b) => effectivePrice(a, rates) - effectivePrice(b, rates))[0];
                const s = STORES[bestOffer.store];
                const eff = effectivePrice(bestOffer, rates);
                const unit = unitPriceLabel(bestOffer.price, p.name);
                const pk = p.key || p.jan;
                const bought = pk ? purchasedMap[pk] : null;
                // 14日価格統計による判定(記録2件以上ある商品のみ)
                const st = pk ? searchStats[pk] : null;
                const isLow14 = st && bestOffer.price <= st.min * 1.02;    // 14日最安圏
                const isHigh14 = st && !isLow14 && bestOffer.price >= st.med; // 中央値以上=高め
                // リスト内商品: 登録時価格との比較(バッジとは別のステータス)
                const wl = pk ? wishlist.find((w) => w.jan === pk) : null;
                const basePct = wl?.base_price ? Math.round(((bestOffer.price - wl.base_price) / wl.base_price) * 100) : null;
                return (
                  <button key={p.key || p.jan || i} onClick={() => openProduct(p)} style={{ ...card, position: "relative", display: "flex", gap: 12, width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 10, opacity: bought ? 0.75 : 1 }}>
                    {p.image ? (
                      <img src={p.image} alt="" style={{ width: 96, height: 96, objectFit: "contain", borderRadius: 10, background: "#EAF3F0", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 96, height: 96, borderRadius: 10, background: "#EAF3F0", flexShrink: 0 }} />
                    )}
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleList(p); }}
                      title="お気に入りに追加"
                      style={{ position: "absolute", top: 10, right: 12, fontSize: 20, lineHeight: 1, cursor: "pointer", color: wishlist.some((w) => w.jan === (p.key || p.jan)) ? "#E11D48" : "#CBD5E1", zIndex: 2 }}
                    >
                      {wishlist.some((w) => w.jan === (p.key || p.jan)) ? "♥" : "♡"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 22 }}>
                      {bought && (
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: "#059669", borderRadius: 4, padding: "2px 7px", display: "inline-block", marginBottom: 3 }}>
                          ✓ {STORES[bought.store]?.short}で購入済み({new Date(bought.clicked_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })})
                        </div>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {p.name}
                      </div>
                      {p.reviews > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                          <span style={{ fontSize: 12, color: "#F59E0B", letterSpacing: -1 }}>
                            {"★".repeat(Math.round(p.rating))}{"☆".repeat(Math.max(0, 5 - Math.round(p.rating)))}
                          </span>
                          <span style={{ fontSize: 10.5, color: "#64748B" }}>{p.rating.toFixed(1)}({p.reviews.toLocaleString()})</span>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5 }}>{yen(bestOffer.price)}</span>
                        <span style={{ fontSize: 11, color: "#059669", fontWeight: 700 }}>実質 {yen(eff)}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: s.color, border: `1px solid ${s.color}`, borderRadius: 4, padding: "1px 5px" }}>
                          {s.short}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                        {isLow14 && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#155E75", background: "#CFFAFE", border: "1px solid #06B6D4", borderRadius: 4, padding: "2px 6px" }}>
                            🔵 買い時(14日で最安圏)
                          </span>
                        )}
                        {isHigh14 && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#92400E", background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 4, padding: "2px 6px" }}>
                            🟡 今は高め(14日中央値以上)
                          </span>
                        )}
                        {basePct !== null && basePct < 0 && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#065F46", background: "#D1FAE5", border: "1px solid #10B981", borderRadius: 4, padding: "2px 6px" }}>
                            🟢 登録時より{Math.abs(basePct)}%安い
                          </span>
                        )}
                        {basePct !== null && basePct > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 4, padding: "2px 6px" }}>
                            登録時より+{basePct}%
                          </span>
                        )}
                        {p.offers.length > 1 && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#0F766E", background: "#CCFBF1", borderRadius: 4, padding: "2px 6px" }}>
                            {p.offers.length}店舗の最安
                          </span>
                        )}
                        {unit && (
                          <span style={{ fontSize: 10, color: "#64748B", background: "#F1F5F9", borderRadius: 4, padding: "2px 6px" }}>{unit.label}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              </div>
              {searchPage < 9 && sorted.length >= 15 && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{ width: "100%", marginTop: 12, background: "#fff", color: "#16324F", border: "1.5px solid #16324F", borderRadius: 12, padding: "13px 0", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
                >
                  {loadingMore ? "読み込み中…" : `さらに商品を読み込む(現在${sorted.length}件・最大500件)`}
                </button>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "48px 16px" }}>
              <p style={{ fontSize: 14, color: "#475569", fontWeight: 600 }}>
                キーワード検索で、各モールの
                <br />
                「ポイント込みの実質価格」を比較できます
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                {[...new Set([...searchHistory.slice(0, 3), ...personalCategories(viewHistory, searchHistory, 6)])].slice(0, 6).map((w) => (
                  <button key={w} onClick={() => { setQuery(w); doSearch(w); }} style={{ fontSize: 12.5, fontWeight: 600, background: "#fff", border: "1px solid #CBD5E1", borderRadius: 999, padding: "7px 14px", cursor: "pointer" }}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {/* 最近見た商品(ホーム・検索・リストの下部に共通表示。詳細表示中は出さない) */}
        {!selected && ["home", "list", "search"].includes(view) && viewHistory.length > 0 && (
          <ProductStrip
            title="最近見た商品"
            subtitle="タップでもう一度チェック"
            items={viewHistory}
            onOpen={(it) => openFromList({ jan: it.key, name: it.name, image: it.image })}
          />
        )}
      </main>

      {/* セール詳細ポップアップ */}
      {saleModal && (
        <div
          onClick={() => setSaleModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 20, maxWidth: 420, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: STORES[saleModal.store]?.color || "#64748B", borderRadius: 4, padding: "2px 8px" }}>
                {STORES[saleModal.store]?.short || saleModal.store}
              </span>
              {saleModal.status && (
                <span style={{ fontSize: 11, fontWeight: 800, color: "#1D4ED8", background: "#DBEAFE", borderRadius: 4, padding: "2px 8px" }}>{saleModal.status}</span>
              )}
              <button onClick={() => setSaleModal(null)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, color: "#94A3B8", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 10px", color: "#16324F" }}>{saleModal.name}</h3>
            {saleModal.period_text && (
              <div style={{ fontSize: 13, color: "#334155", marginBottom: 8 }}>🗓 開催期間: {saleModal.period_text}</div>
            )}
            {saleModal.summary && (
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, marginBottom: 14 }}>{saleModal.summary}</p>
            )}
            {saleModal.url ? (
              <a href={saleModal.url} target="_blank" rel="noopener noreferrer sponsored"
                style={{ display: "block", textAlign: "center", background: "#10B981", color: "#fff", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>
                セール会場を見る ↗
              </a>
            ) : (
              <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center" }}>会場URLは登録されていません</div>
            )}
          </div>
        </div>
      )}

      {/* 今後のセール一覧ポップアップ */}
      {upcomingModal && (
        <div
          onClick={() => setUpcomingModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 20, maxWidth: 460, width: "100%", maxHeight: "82vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "#16324F" }}>📅 今後のセール({upcomingModal.length}件)</h3>
              <button onClick={() => setUpcomingModal(null)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 24, color: "#94A3B8", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {upcomingModal.map((ev, i) => (
                <div key={i} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: STORES[ev.store]?.color || "#64748B", borderRadius: 4, padding: "2px 7px" }}>
                      {STORES[ev.store]?.short || ev.store}
                    </span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: "#1D4ED8", background: "#DBEAFE", borderRadius: 4, padding: "2px 7px" }}>今後開催</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1E3A8A", marginBottom: 4 }}>{ev.name}</div>
                  {ev.period_text && <div style={{ fontSize: 12, color: "#475569", marginBottom: 3 }}>🗓 {ev.period_text}</div>}
                  {ev.summary && <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>{ev.summary}</div>}
                  {ev.url && (
                    <a href={ev.url} target="_blank" rel="noopener noreferrer sponsored"
                      style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 700, color: "#10B981", textDecoration: "none" }}>
                      セール会場を見る ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* フッター: プライバシーポリシーへの導線(公開前に必須) */}
      <footer style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid #DDE9E4", textAlign: "center" }}>
        <a href="/collections" style={{ fontSize: 11.5, color: "#64748B", textDecoration: "none", marginRight: 14 }}>商品まとめを作る</a>
        <a href="/privacy" style={{ fontSize: 11.5, color: "#64748B", textDecoration: "none" }}>プライバシーポリシー</a>
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6, lineHeight: 1.6 }}>
          【PR】本サイトは楽天アフィリエイト・バリューコマース・Amazonアソシエイトを利用しています。
        </div>
      </footer>
    </div>
  );
}
const card = { background: "#fff", border: "1px solid #DDE9E4", borderRadius: 14, padding: 16 };
const btnGhost = { background: "none", border: "none", color: "#64748B", fontSize: 12, cursor: "pointer", padding: "4px 0" };
const sectionTitle = { fontSize: 12, fontWeight: 700, color: "#64748B", letterSpacing: 1.5, margin: "20px 0 10px" };
