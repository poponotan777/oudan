"use client";
// ============================================================
// オウダン トップ(v25)
//   ホーム … カテゴリ(親→子)/今日の還元率/いま見ておきたいもの/セールの予定/最近見た商品
//   検索  … 3サイトをまとめて検索。ポイント込みの実質価格で比べる
//   気になる … ハートを押した商品(端末の中だけに保存。ログイン不要)
//   設定  … あなたのポイント(還元率を自動計算)/各サイトのよく使うページ
// ============================================================
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { searchRakutenClient } from "../lib/rakutenClient";
import { mergeOffers } from "../lib/merge";
import { unitPriceLabel } from "../lib/unitPrice";
import { loadStatus, saveStatus, ratesForPrice } from "../lib/status";
import { AMAZON_AFFILIATE_ON } from "../lib/featureFlags";
import { loadCatalog, augmentProduct } from "../lib/catalog";
import { withKeepa } from "../lib/keepaClient";
import { statsFor, storeStats, statsLabel, productPath, STORE_META, effectivePrice, displayName } from "../lib/priceView";
import { painsForProduct, displayCatch } from "../lib/pains";
import { CATEGORIES } from "../lib/categories";
import { loadFavorites, onFavoritesChange, removeFavorite } from "../lib/favorites";
import { TodayStrip, SaleCalendarList, StatusForm } from "./components/SaleStatus";
import PriceCompare, { MiniCompare } from "./components/PriceCompare";
import TopPicks from "./components/TopPicks";
import Heart from "./components/Heart";
import InstallCard from "./components/InstallCard";
import ShareCard from "./components/ShareCard";
import Feed from "./components/Feed";
import Reco from "./components/Reco";
import BuyBox from "./components/BuyBox";
import { cardsFor } from "../lib/cards";
import { SiteHeader, SiteFooter } from "./components/SiteChrome";

// 楽天のsort値: standard(標準)/+itemPrice(安い)/-itemPrice(高い)/-reviewCount/-reviewAverage
const RAKUTEN_SORT = { cheap: "+itemPrice", high: "-itemPrice", rating: "-reviewAverage", reviews: "-reviewCount", popular: "standard" };
const num = (n) => Math.round(Number(n)).toLocaleString("ja-JP");

// カテゴリ別の妥当な最低価格(これ未満は無関係な小物・部品とみなし、検索の段階で除く)
function getJunkFloor(kw) {
  if (/シャンプー|トリートメント|コンディショナー|化粧水|乳液|美容液|洗剤|柔軟剤|プロテイン|サプリ|家電|ドライヤー|時計|バッグ|靴/.test(kw)) return 200;
  if (/電池|文具|ペン|ノート|靴下|マスク|ティッシュ/.test(kw)) return 30;
  return 50;
}
const HIGH_SORT_MAX = 300000; // 高い順のときの上限(誤登録の高額品を除く)
const NOISE_WORDS = /ふるさと納税|宿泊券|宿泊|旅行券|チケット|粘度計|業務用.*(浄水器|機器)/;
const pkeyOf = (p) => p?.db?.pkey || p?.pkey || p?.key || p?.jan || null;

const STORE_LINKS = [
  { store: "rakuten", links: [
    ["注文履歴", "https://order.my.rakuten.co.jp/"], ["ポイント", "https://point.rakuten.co.jp/"],
    ["クーポン", "https://coupon.rakuten.co.jp/"], ["5と0のつく日", "https://event.rakuten.co.jp/campaign/point/50days/"],
    ["キャンペーン", "https://event.rakuten.co.jp/campaign/point/"], ["返品・ヘルプ", "https://ichiba.faq.rakuten.net/"],
  ] },
  { store: "yahoo", links: [
    ["注文履歴", "https://odhistory.shopping.yahoo.co.jp/order-history/list"], ["PayPayポイント", "https://points.yahoo.co.jp/"],
    ["クーポン", "https://shopping.yahoo.co.jp/coupon/"], ["5のつく日", "https://shopping.yahoo.co.jp/campaign/5day/"],
    ["ズバトク", "https://toku.yahoo.co.jp/"], ["返品・ヘルプ", "https://support.yahoo-net.jp/PccShopping/s/"],
  ] },
  { store: "amazon", links: [
    ["注文履歴", "https://www.amazon.co.jp/gp/css/order-history"], ["ポイント", "https://www.amazon.co.jp/mypoints"],
    ["クーポン", "https://www.amazon.co.jp/coupons"], ["タイムセール", "https://www.amazon.co.jp/deals"],
    ["返品・交換", "https://www.amazon.co.jp/gp/css/returns/homepage.html"], ["ヘルプ", "https://www.amazon.co.jp/gp/help/customer/display.html"],
  ] },
];

// ------------------------------------------------------------
// 小さな部品
// ------------------------------------------------------------
function Strip({ title, items, onOpen }) {
  const ref = useRef(null);
  if (!items || items.length === 0) return null;
  const go = (d) => ref.current?.scrollBy({ left: d * (ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section>
      <h2 className="o-h2">{title}</h2>
      <div className="o-slider">
      <button className="o-slide-btn prev" aria-label="前へ" onClick={() => go(-1)}>‹</button>
      <button className="o-slide-btn next" aria-label="次へ" onClick={() => go(1)}>›</button>
      <div className="o-strip" ref={ref}>
        {items.map((it, i) => (
          <button key={(it.key || it.pkey || i) + "_" + i} className="o-tile" onClick={() => onOpen(it)}>
            {it.image ? <img className="o-tile-img" src={it.image} alt="" loading="lazy" /> : <div className="o-tile-img" />}
            <div className="o-tile-name">{displayName(it.name)}</div>
            {it.price != null && <div className="o-num price">¥{num(it.price)}</div>}
          </button>
        ))}
      </div>
      </div>
    </section>
  );
}

function Categories({ onPick }) {
  const [open, setOpen] = useState(null);
  const cur = CATEGORIES.find((c) => c.id === open);
  return (
    <section className="o-hero-cats" aria-label="カテゴリから探す">
      <div className="o-cats">
        {CATEGORIES.map((c) => (
          <button key={c.id} className="o-cat" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
            <span className="o-cat-icon" style={{ background: c.tint }} aria-hidden="true">{c.icon}</span>
            <span className="o-cat-name">{c.name.split("・").map((t, i, all) => <span key={i}>{t}{i < all.length - 1 ? <>・<wbr /></> : null}</span>)}</span>
          </button>
        ))}
      </div>
      {cur && (
        <div className="o-subcats">
          <span className="o-subcats-title">{cur.name}</span>
          {cur.kids.map((k) => (
            <button key={k} className="o-chip" onClick={() => onPick(k)}>{k}</button>
          ))}
          <button className="o-chip" onClick={() => onPick(cur.name.split("・")[0])} style={{ background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }}>{cur.name}をすべて</button>
        </div>
      )}
    </section>
  );
}

function Stars({ v }) {
  const f = Math.round(v);
  return <span className="stars" aria-label={`5点中${v.toFixed(1)}点`}>{"★".repeat(f)}{"☆".repeat(Math.max(0, 5 - f))}</span>;
}

// ------------------------------------------------------------
// 商品詳細(検索結果から開いたとき)
// ------------------------------------------------------------
function Detail({ product, rates, viewHistory, onOpenRelated }) {
  const [related, setRelated] = useState([]);
  const key0 = product.key || product.jan;
  const [db, setDb] = useState(product.db || null);
  const pkey = db?.pkey || key0;

  useEffect(() => {
    if (product.db) { setDb(product.db); return; }
    if (!key0) return;
    let alive = true;
    loadCatalog(supabase, [key0]).then(withKeepa).then((m) => { if (alive) setDb(m.get(key0) || null); }).catch(() => {});
    return () => { alive = false; };
  }, [key0, product.db]);

  // 同じ種類の人気商品(商品名から代表的な言葉を抜いて楽天で探す)
  useEffect(() => {
    const CATS = ["シャンプー","コンディショナー","トリートメント","洗剤","柔軟剤","ボディソープ","ハンドソープ","歯磨き","歯ブラシ","化粧水","乳液","美容液","日焼け止め","プロテイン","サプリ","おむつ","おしりふき","キャットフード","ドッグフード","コーヒー","紅茶","マスク","ティッシュ","トイレットペーパー","米","水","洗顔","イヤホン","モバイルバッテリー","充電器","ドライヤー"];
    const name = product?.name || "";
    const kw = CATS.find((c) => name.includes(c)) || name.split(/[\s　]/)[0];
    if (!kw) return;
    let alive = true;
    searchRakutenClient(kw, 12, 1, "standard").then((items) => {
      if (!alive) return;
      setRelated((items || [])
        .filter((it) => it.image && (it.code ? "r:" + it.code : "") !== key0)
        .map((it) => ({ key: it.code ? "r:" + it.code : null, jan: it.jan, name: it.name, image: it.image, price: it.price }))
        .slice(0, 10));
    }).catch(() => {});
    return () => { alive = false; };
  }, [key0]);

  const rated = product.offers.filter((o) => o.rating > 0 && o.reviews > 0);
  const totalReviews = rated.reduce((s, o) => s + o.reviews, 0);
  const avg = totalReviews ? rated.reduce((s, o) => s + o.rating * o.reviews, 0) / totalReviews : 0;
  const rs = rated.filter((o) => o.reviews >= 3).map((o) => o.rating);
  const split = rs.length >= 2 && Math.max(...rs) - Math.min(...rs) >= 1;
  const pains = painsForProduct(db?.product || { name: product.name });
  const desc = displayCatch(db?.product?.catch);
  const cheapest = [...product.offers].sort((a, b) => a.price - b.price)[0];

  return (
    <div>
      <button className="o-back" onClick={() => window.history.back()}>‹ 戻る</button>
      <div className="o-box">
        <div className="o-detail-head">
          {product.image ? <img src={product.image} alt="" /> : <div className="ph" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            {db?.product?.brand && <div className="o-detail-brand">{db.product.brand}</div>}
            <h1>{displayName(product.name)}</h1>
            {product.jan && <div className="o-detail-meta">JAN {product.jan}</div>}
            <div style={{ marginTop: 10 }}>
              <Heart label item={{ pkey, name: product.name, image: product.image, price: cheapest?.price, store: cheapest?.store, inDb: !!db }} />
            </div>
          </div>
        </div>
        {desc && <p className="o-desc">{desc}</p>}
      </div>

      {db && <div className="o-box" style={{ marginTop: 12 }}><BuyBox offers={db.offers} rates={rates} name={product.name} /></div>}
      <PriceCompare name={product.name} offers={product.offers} dbOffers={db?.offers} rates={rates} showTag={!db} />
      {db && <Reco items={[{ pkey: db.pkey, name: product.name, genre: db.product?.genre }]} />}

      {totalReviews > 0 && (
        <section>
          <h2 className="o-h2">レビュー<small>3サイトの評価を件数で重みづけした平均</small></h2>
          <div className="o-box">
            <div className="o-review">
              <span className="o-num avg">{avg.toFixed(2)}</span>
              <div><Stars v={avg} /><div className="o-note" style={{ margin: 0 }}>{totalReviews.toLocaleString()}件</div></div>
            </div>
            <div className="o-review-rows">
              {[...rated].sort((a, b) => b.reviews - a.reviews).map((o, i) => (
                <div key={i}>
                  <span className={`o-store ${o.store}`}>{STORE_META[o.store]?.short}</span>
                  <span className="o-num" style={{ fontSize: 15 }}>{o.rating.toFixed(1)}</span>
                  <span className="o-note" style={{ margin: 0 }}>{o.reviews.toLocaleString()}件</span>
                  {o.url && <a className="o-link" href={o.url} target="_blank" rel="noopener noreferrer sponsored">レビューを読む</a>}
                </div>
              ))}
            </div>
            {split && <p className="o-note" style={{ marginBottom: 0 }}>サイトによって評価に1点以上の差があります。レビューの中身も見てから決めるのがおすすめです。</p>}
          </div>
        </section>
      )}

      {pains.length > 0 && (
        <section>
          <h2 className="o-h2">こんな人に</h2>
          <ul className="o-pains">
            {pains.map((p) => <li key={p.key}><b>{p.pain}</b><span>{p.benefit}</span></li>)}
          </ul>
        </section>
      )}

      {db && <ShareCard pkey={pkey} name={product.name} offers={db.offers} />}
      {db && (
        <p style={{ marginTop: 10 }}>
          <a className="o-link" href={productPath(pkey)} style={{ fontSize: 13 }}>この商品のページを開く</a>
        </p>
      )}

      <Strip title="同じ種類の人気商品" items={related} onOpen={onOpenRelated} />
      {viewHistory?.length > 1 && <Strip title="最近見た商品" items={viewHistory.filter((v) => v.key !== key0)} onOpen={onOpenRelated} />}
    </div>
  );
}

// 気になるの「いまの値段」を読む(DBにある商品だけ)
function FavNow({ favs, onLoad }) {
  const keys = favs.filter((f) => f.inDb).map((f) => f.pkey).slice(0, 100).join("|");
  useEffect(() => {
    if (!keys) return;
    let alive = true;
    cardsFor(supabase, keys.split("|")).then((cards) => {
      if (!alive) return;
      const m = {};
      for (const c of cards) m[c.pkey] = c;
      onLoad(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, [keys]);
  return null;
}

// ------------------------------------------------------------
// 検索結果の1件
// ------------------------------------------------------------
function ResultItem({ p, rates, onOpen }) {
  const best = [...p.offers].sort((a, b) => effectivePrice(a.store, a, rates) - effectivePrice(b.store, b, rates))[0];
  const eff = effectivePrice(best.store, best, rates);
  const unit = unitPriceLabel(best.price, p.name);
  const st = storeStats(best.store, best.price, p.db?.offers || {});
  const lab = statsLabel(st);
  const pkey = pkeyOf(p);
  return (
    <div className="o-item" role="button" tabIndex={0} onClick={() => onOpen(p)} onKeyDown={(e) => e.key === "Enter" && onOpen(p)}>
      {p.image ? <img className="o-item-img" src={p.image} alt="" loading="lazy" /> : <div className="o-item-img" />}
      <Heart item={{ pkey, name: p.name, image: p.image, price: best.price, store: best.store, inDb: !!p.db }} />
      <div className="o-item-body">
        <div className="o-item-name">{displayName(p.name)}</div>
        {p.reviews > 0 && <div className="o-item-sub">★{p.rating.toFixed(1)}({p.reviews.toLocaleString()}件)</div>}
        <div className="o-item-price">
          <span className={`o-store ${best.store}`}>{STORE_META[best.store].short}</span>
          <span className="o-num">¥{num(best.price)}</span>
          {Math.round(eff) !== Math.round(best.price) && <span className="eff">実質¥{num(eff)}</span>}
        </div>
        <MiniCompare offers={p.offers} dbOffers={p.db?.offers} rates={rates} />
        <div className="o-item-marks">
          {st && st.days >= 7 && lab.tone === "good" && <span className="o-mark good">{lab.main}</span>}
          {st && st.days >= 7 && st.isLowest && <span className="o-mark good">3か月でいちばん安い</span>}
          {st && st.days >= 7 && lab.tone === "bad" && <span className="o-mark bad">{lab.main}</span>}
          {unit && <span className="o-mark flat">{unit.label}</span>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// メイン
// ------------------------------------------------------------
export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [rawOffers, setRawOffers] = useState([]);
  const [dbProducts, setDbProducts] = useState([]); // オウダンのDBから見つかった商品(v29)
  const [searchPage, setSearchPage] = useState(1);
  const [mallFilter, setMallFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [viewHistory, setViewHistory] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [sort, setSort] = useState("popular");
  const [catalog, setCatalog] = useState(() => new Map());
  const [view, setView] = useState("home"); // home | search | fav | settings
  const [saleEvents, setSaleEvents] = useState([]);
  const [saleLoaded, setSaleLoaded] = useState(false);
  const [status, setStatus] = useState(null);
  const [favs, setFavs] = useState([]);
  const [favNow, setFavNow] = useState({}); // pkey → いまのカード(値段)

  // ブラウザの「戻る」で詳細を閉じる(サイトの外には出ない)
  useEffect(() => {
    const onPop = () => setSelected(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    try {
      const vh = localStorage.getItem("viewHistory");
      if (vh) setViewHistory(JSON.parse(vh).slice(0, 30));
      const sh = localStorage.getItem("searchHistory");
      if (sh) setSearchHistory(JSON.parse(sh).slice(0, 20));
    } catch {}
    setStatus(loadStatus());
    setFavs(loadFavorites());
    const off = onFavoritesChange((l) => setFavs([...l]));
    // 「/?q=キーワード」で来たら検索、「/?v=fav」「/?v=settings」ならそのタブを開く
    try {
      const sp = new URLSearchParams(window.location.search);
      const q0 = sp.get("q");
      const v0 = sp.get("v");
      if (q0) { setQuery(q0); setTimeout(() => doSearch(q0), 0); }
      else if (v0 === "fav" || v0 === "settings") setView(v0);
    } catch {}
    supabase.from("sale_events").select("name, store, start_date, end_date, status, period_text, summary, url")
      .then(({ data }) => { setSaleEvents(data || []); setSaleLoaded(true); })
      .catch(() => setSaleLoaded(true));
    return off;
  }, []);

  // 検索結果の商品に、DBにある3サイトの価格と90日の記録を付ける
  useEffect(() => {
    const products = results?.products || [];
    const keys = [...new Set(products.map((p) => p.key || p.jan).filter(Boolean))].slice(0, 300);
    if (keys.length === 0) { setCatalog(new Map()); return; }
    let alive = true;
    loadCatalog(supabase, keys).then(withKeepa).then((m) => { if (alive) setCatalog(m); }).catch(() => {});
    return () => { alive = false; };
  }, [results]);

  const nav = (v) => {
    setSelected(null);
    setView(v);
    try { window.history.replaceState(null, "", v === "home" ? "/" : `/?v=${v}`); } catch {}
    window.scrollTo(0, 0);
  };

  // DBの商品を先に、APIで見つかった商品をその後ろに(同じ商品は1つに)
  const withDb = (dbItems, apiProducts) => {
    const dbKeys = new Set(dbItems.flatMap((p) => [p.pkey, p.jan].filter(Boolean)));
    const rest = apiProducts.filter((p) => !dbKeys.has(p.key) && !dbKeys.has(p.jan)).map((p) => ({ ...p, seq: (p.seq ?? 0) + 1000 }));
    return [...dbItems, ...rest];
  };

  const doSearch = async (q, sortOverride) => {
    const kw = (q ?? query).trim();
    if (!kw) return;
    const useSort = sortOverride || sort || "popular";
    setQuery(kw);
    setLoading(true);
    setSelected(null);
    setView("search");
    setSearchPage(1);
    window.scrollTo(0, 0);
    setSearchHistory((prev) => {
      const next = [kw, ...prev.filter((x) => x !== kw)].slice(0, 20);
      try { localStorage.setItem("searchHistory", JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      const floor = getJunkFloor(kw);
      const ceil = useSort === "high" ? HIGH_SORT_MAX : null;
      // v29:まずオウダンのDBから探す。売れている順で24件以上あれば、楽天・Yahoo!のAPIは使わない
      //      (「もっと見る」を押したら、APIで続きを探す)
      const dbRes = await fetch(`/api/dbsearch?q=${encodeURIComponent(kw.replace(/\s+/g, " "))}`).then((r) => r.json()).catch(() => ({ items: [] }));
      const dbItems = dbRes.items || [];
      setDbProducts(dbItems);
      if (useSort === "popular" && dbItems.length >= 24) {
        setRawOffers([]);
        setSearchPage(0);
        setResults({ query: kw, products: dbItems, sortKey: useSort, fromDb: true });
        setLoading(false);
        return;
      }
      const [yahooRes, rakutenOffers, amazonRes] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(kw)}&sort=${useSort}&min=${floor}${ceil ? `&max=${ceil}` : ""}`).then((r) => r.json()).catch(() => ({ offers: [] })),
        searchRakutenClient(kw, 30, 1, RAKUTEN_SORT[useSort] || "standard", floor, ceil),
        AMAZON_AFFILIATE_ON
          ? fetch(`/api/amazon/search?q=${encodeURIComponent(kw)}`).then((r) => r.json()).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);
      // 取得順(seq):Yahoo!と楽天を1件ずつ交互に
      const yOffers = (yahooRes.offers || []).map((o, i) => ({ ...o, seq: i * 2 }));
      const rOffers = rakutenOffers.map((o, i) => ({ ...o, seq: i * 2 + 1 }));
      const aOffers = (amazonRes.items || []).map((o, i) => ({ ...o, seq: 100000 + i }));
      const all = [...yOffers, ...rOffers, ...aOffers];
      setRawOffers(all);
      const products = withDb(dbItems, mergeOffers(all)).slice(0, 500);
      setResults({ query: kw, products, sortKey: useSort });
    } catch {
      setResults({ query: kw, error: true, products: [] });
    }
    setLoading(false);
  };

  const loadMore = async () => {
    if (!results?.query || loadingMore) return;
    setLoadingMore(true);
    const next = searchPage + 1;
    try {
      const floor = getJunkFloor(results.query);
      const ceil = sort === "high" ? HIGH_SORT_MAX : null;
      const [yahooRes, rakutenOffers] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(results.query)}&page=${next}&sort=${sort}&min=${floor}${ceil ? `&max=${ceil}` : ""}`).then((r) => r.json()).catch(() => ({ offers: [] })),
        searchRakutenClient(results.query, 30, next, RAKUTEN_SORT[sort] || "standard", floor, ceil).catch(() => []),
      ]);
      const base = next * 100000; // 追加分は必ず後ろに並ぶ
      const all = [
        ...rawOffers,
        ...(yahooRes.offers || []).map((o, i) => ({ ...o, seq: base + i * 2 })),
        ...rakutenOffers.map((o, i) => ({ ...o, seq: base + i * 2 + 1 })),
      ];
      setRawOffers(all);
      setSearchPage(next);
      const products = withDb(dbProducts, mergeOffers(all)).slice(0, 500);
      setResults({ query: results.query, products, sortKey: sort });
    } catch {}
    setLoadingMore(false);
  };

  const openProduct = (p) => {
    if (!p) return;
    const pk = pkeyOf(p);
    window.history.pushState({ detail: true }, "", pk ? productPath(pk) : undefined);
    setSelected(p);
    window.scrollTo(0, 0);
    const key = p.key || p.jan;
    if (!key) return;
    setViewHistory((prev) => {
      const entry = { key: p.db?.pkey || key, name: p.name, image: p.image, price: p.offers ? Math.min(...p.offers.map((o) => o.price)) : null, store: p.offers?.[0]?.store, inDb: !!p.db, at: Date.now() };
      const next = [entry, ...prev.filter((x) => x.key !== key)].slice(0, 30);
      try { localStorage.setItem("viewHistory", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // 最近見た商品・関連商品・気になるから開く(その商品だけ探し直す)
  const [openMsg, setOpenMsg] = useState("");
  const openFromList = async (w) => {
    setLoading(true);
    setOpenMsg("");
    try {
      const q = /^\d{8,13}$/.test(w.jan || "") ? w.jan : w.name;
      const [yahooRes, rakutenOffers] = await Promise.all([
        fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ offers: [] })),
        searchRakutenClient(q).catch(() => []),
      ]);
      const products = mergeOffers([...(yahooRes.offers || []), ...rakutenOffers]);
      const match = products.find((p) => (p.key || p.jan) === w.jan) || products[0];
      setResults({ query: w.name, products });
      if (match) { setView("search"); openProduct(match); }
      else { setView("search"); setOpenMsg("この商品はいまどのサイトでも見つかりません。販売が終わったか、商品名が変わった可能性があります。"); }
    } catch {
      setOpenMsg("商品を読み込めませんでした。時間をおいてもう一度試してください。");
    }
    setLoading(false);
  };
  const openSaved = (it) => {
    const k = it.pkey || it.key;
    if (it.inDb && k) { window.location.href = productPath(k); return; }
    openFromList({ jan: k, name: it.name, image: it.image });
  };

  // 異常値・無関係な商品を除く
  const filteredProducts = (() => {
    if (!results?.products) return [];
    const floor = getJunkFloor(results.query || "");
    const queryHasNoise = NOISE_WORDS.test(results.query || "");
    return results.products.map((p) => augmentProduct(p, catalog.get(p.key || p.jan))).filter((p) => {
      const min = Math.min(...p.offers.map((o) => o.price));
      if (!Number.isFinite(min) || min < floor) return false;
      if (!queryHasNoise && NOISE_WORDS.test(p.name || "")) return false;
      return true;
    });
  })();
  const chipFiltered = filteredProducts.filter((p) => {
    if (mallFilter !== "all" && !p.offers.some((o) => o.store === mallFilter)) return false;
    if (ratingFilter && !(p.rating >= 4)) return false;
    return true;
  });
  const minP = (p) => Math.min(...p.offers.map((o) => o.price));
  const sorted = !results?.products ? [] : [...chipFiltered].sort((a, b) => {
    if (sort === "unit") {
      return (unitPriceLabel(minP(a), a.name)?.per ?? Infinity) - (unitPriceLabel(minP(b), b.name)?.per ?? Infinity);
    }
    if (sort === "cheap") return minP(a) - minP(b);
    if (sort === "high") return minP(b) - minP(a);
    return (a.seq ?? Infinity) - (b.seq ?? Infinity); // 人気・評価順は各サイトが返した順のまま
  });

  const effRates = status ? ratesForPrice(status, {}, new Date(), saleEvents) : { rakuten: 1, yahoo: 1, amazon: 1 };
  const goSettings = () => nav("settings");

  return (
    <div>
      <SiteHeader view={selected ? null : view} onNav={nav} query={query} setQuery={setQuery} onSearch={(q) => doSearch(q)} lede={view === "home" && !selected} />

      <main className="o-wrap o-main">
        {selected && (
          <Detail product={selected} rates={effRates} viewHistory={viewHistory}
            onOpenRelated={(it) => openFromList({ jan: it.key || it.jan, name: it.name, image: it.image })} />
        )}

        {/* ===== ホーム ===== */}
        {view === "home" && !selected && (
          <>
            <InstallCard />
            <Categories onPick={(k) => doSearch(k)} />
            <TodayStrip status={status} sheetEvents={saleEvents} onEdit={goSettings} />
            <SaleCalendarList sheetEvents={saleEvents} loaded={saleLoaded} />
            <TopPicks rates={effRates} />
            <Reco mode="home" items={viewHistory.slice(0, 3).map((v) => ({ pkey: v.key, name: v.name }))} />
            <Feed />
            <Strip title="最近見た商品" items={viewHistory} onOpen={(it) => openFromList({ jan: it.key, name: it.name, image: it.image })} />
            
          </>
        )}

        {/* ===== 検索 ===== */}
        {view === "search" && !selected && (
          loading ? (
            <div className="o-empty"><p>楽天・Yahoo!・Amazonを探しています</p></div>
          ) : openMsg ? (
            <div className="o-empty"><p>{openMsg}</p></div>
          ) : results ? (
            <>
              <div className="o-toolbar">
                <span className="o-count">「<b>{results.query}</b>」{sorted.length}件</span>
                <select value={sort} aria-label="並び順" onChange={(e) => {
                  const v = e.target.value;
                  setSort(v);
                  if (v !== "unit" && results?.query) doSearch(results.query, v);
                }}>
                  <option value="popular">売れている順</option>
                  <option value="cheap">安い順</option>
                  <option value="unit">1mlあたり・1個あたりが安い順</option>
                  <option value="high">高い順</option>
                  <option value="reviews">レビューが多い順</option>
                  <option value="rating">評価が高い順</option>
                </select>
              </div>
              {results.fromDb && searchPage === 0 && (
                <p className="o-note" style={{ margin: "0 0 8px" }}>オウダンが毎日記録している商品から表示しています(3サイトの値段つき)。「もっと見る」で各サイトからも探します。</p>
              )}
              <div className="o-row-scroll" style={{ marginBottom: 12 }}>
                {[["all", "すべて"], ["rakuten", "楽天"], ["yahoo", "Yahoo!"], ["amazon", "Amazon"]].map(([k, label]) => (
                  <button key={k} className="o-chip" aria-pressed={mallFilter === k} onClick={() => setMallFilter(k)}>{label}</button>
                ))}
                <button className="o-chip" aria-pressed={ratingFilter} onClick={() => setRatingFilter((v) => !v)}>★4以上</button>
              </div>
              {results.error ? (
                <div className="o-empty"><p>検索できませんでした。通信の状態を確かめて、もう一度探してください。</p></div>
              ) : sorted.length === 0 ? (
                <div className="o-empty"><p>見つかりませんでした。言葉を短くするか、ブランド名で探してみてください。</p></div>
              ) : (
                <div className="o-grid">
                  {sorted.map((p, i) => <ResultItem key={p.key || p.jan || i} p={p} rates={effRates} onOpen={openProduct} />)}
                </div>
              )}
              {searchPage < 9 && sorted.length >= 15 && (
                <button className="o-btn block" style={{ marginTop: 12 }} onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "読み込んでいます" : "もっと見る"}
                </button>
              )}
              <p className="o-note" style={{ marginTop: 12 }}>【PR】購入リンクはアフィリエイトリンクです。実質価格は「設定」のポイントと今日のキャンペーンで出した目安です。</p>
            </>
          ) : (
            <div className="o-empty">
              <p>探したい商品の名前を入れてください</p>
              <div className="o-row-scroll" style={{ justifyContent: "center", flexWrap: "wrap" }}>
                {[...new Set([...searchHistory.slice(0, 4), "シャンプー", "洗濯洗剤", "モバイルバッテリー", "コーヒー"])].slice(0, 6).map((w) => (
                  <button key={w} className="o-chip" onClick={() => doSearch(w)}>{w}</button>
                ))}
              </div>
            </div>
          )
        )}

        {/* ===== 気になる ===== */}
        {view === "fav" && !selected && (
          <section>
            <FavNow favs={favs} onLoad={setFavNow} />
            <h2 className="o-h2" style={{ marginTop: 4 }}>気になる<small>{favs.length}件・この端末の中だけに保存</small></h2>
            {favs.length === 0 ? (
              <div className="o-box o-empty">
                <p>商品の写真の右上にあるハートを押すと、ここに集まります。ログインはいりません。</p>
                <button className="o-btn solid" onClick={() => nav("home")}>商品を見に行く</button>
              </div>
            ) : (
              <div className="o-pgrid">
                {favs.map((f) => (
                  <div key={f.pkey} className="o-tile" role="button" tabIndex={0} style={{ cursor: "pointer" }}
                    onClick={() => openSaved(f)} onKeyDown={(e) => e.key === "Enter" && openSaved(f)}>
                    {f.image ? <img className="o-tile-img" src={f.image} alt="" loading="lazy" /> : <div className="o-tile-img" />}
                    <Heart item={f} />
                    <div className="o-tile-name">{displayName(f.name)}</div>
                    {(() => {
                      const now = favNow[f.pkey];
                      const p = now?.price ?? f.price;
                      const st = now?.store ?? f.store;
                      const diff = now && f.price ? now.price - f.price : 0;
                      return (
                        <>
                          {p != null && (
                            <div className="deal">
                              {now?.off > 0 && <span className="off">{now.off}%安</span>}
                              <span className="o-num price">¥{num(p)}</span>
                              {st && <span className={`s-${st}`} style={{ fontWeight: 900, fontSize: 12 }}>{STORE_META[st]?.short}</span>}
                            </div>
                          )}
                          {diff < 0 && <div className="o-fav-diff down">入れたときより¥{num(-diff)}安い</div>}
                          {diff > 0 && <div className="o-fav-diff up">入れたときより¥{num(diff)}高い</div>}
                          {!now && f.price != null && <div className="o-note" style={{ margin: "2px 0 0" }}>入れたときの値段</div>}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
            {favs.length > 0 && (
              <p className="o-note" style={{ marginTop: 10 }}>
                ブラウザのデータを消すと、このリストも消えます。別のスマホやパソコンとは共有されません。
                <button className="o-link" style={{ background: "none", border: "none", padding: 0, marginLeft: 8, fontSize: 11.5, cursor: "pointer" }}
                  onClick={() => { if (window.confirm("気になるリストをすべて消しますか?")) favs.forEach((f) => removeFavorite(f.pkey)); }}>
                  すべて消す
                </button>
              </p>
            )}
          </section>
        )}

        {/* ===== 設定 ===== */}
        {view === "settings" && !selected && status && (
          <>
            <div className="o-box" style={{ marginTop: 4 }}>
              <StatusForm status={status} onSave={(st) => setStatus(saveStatus({ ...st, set: true }))} />
            </div>
            <InstallCard compact />
            <h2 className="o-h2">各サイトのよく使うページ</h2>
            <div className="o-box">
              {STORE_LINKS.map(({ store, links }) => (
                <div key={store} className="o-store-block">
                  <span className={`o-store ${store}`}>{STORE_META[store].short}</span>
                  <div className="o-links">
                    {links.map(([label, url]) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}
                  </div>
                </div>
              ))}
            </div>
            <p className="o-note" style={{ marginTop: 10 }}>
              エントリーが必要なキャンペーンは、買う前にエントリーしておかないとポイントが付きません。
              オウダンはログインや会員登録をしません。設定と気になるリストは、この端末の中にだけ保存します。
              <a className="o-link" href="/privacy" style={{ marginLeft: 6 }}>プライバシーポリシー</a>
            </p>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
