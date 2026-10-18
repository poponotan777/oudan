"use client";
// ============================================================
// 3サイト価格比較(v25)
//   どこで価格を出すときも、楽天・Yahoo!・Amazon の3行を必ず出す。
//   いちばん安い(実質)サイトは値札で見せる。
//   各行:今の価格/実質/90日の中央値との差/3か月で何番目/90日の最安とその日/セール/購入ボタン
// ============================================================

import {
  STORE_ORDER, STORE_META, yen, statsFor, statsLabel, effectivePrice, extraPointPct,
  fmtTime, fmtDay, searchUrl,
} from "../../lib/priceView";

const num = (n) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("ja-JP"));

// offers: 画面の店舗価格の配列(検索・DB由来が混ざってよい)/ dbOffers: {store: DBの行(hist付き)}
export function buildRows({ offers = [], dbOffers = {} }) {
  const rows = {};
  for (const s of STORE_ORDER) {
    const live = offers.filter((o) => o.store === s && o.price > 0).sort((a, b) => a.price - b.price)[0] || null;
    const db = dbOffers?.[s] || null;
    const base = live || (db ? { ...db, store: s, fromDb: true } : null);
    if (!base) { rows[s] = null; continue; }
    rows[s] = {
      ...base,
      point_rate: base.point_rate ?? db?.point_rate ?? null,
      sale_label: base.sale_label ?? db?.sale_label ?? null,
      sale_until: base.sale_until ?? db?.sale_until ?? null,
      updated_at: base.fromDb ? (base.updated_at || db?.updated_at) : null,
      stats: statsFor(base.price, db),
    };
  }
  return rows;
}

export function bestOf(rows, rates) {
  let best = null;
  for (const s of STORE_ORDER) {
    const o = rows[s];
    if (!o) continue;
    const e = effectivePrice(s, o, rates);
    if (e != null && (!best || e < best.eff)) best = { store: s, eff: e, o };
  }
  return best;
}

export function PriceTag({ price, store, eff, small = false, onWhite = false }) {
  const withPoints = eff != null && Math.round(eff) < Math.round(price);
  return (
    <span className={`o-pricetag${small ? " small" : ""}${onWhite ? " on-white" : ""}`}>
      <span className="who">{withPoints ? `ポイント込みなら${STORE_META[store]?.short}がいちばん安い` : `${STORE_META[store]?.short}がいちばん安い`}</span>
      <span><span className="yen">¥</span><span className="o-num">{num(withPoints ? eff : price)}</span></span>
      {withPoints && <span className="who" style={{ fontWeight: 700 }}>価格¥{num(price)}</span>}
    </span>
  );
}

export default function PriceCompare({ name, offers, dbOffers, rates, onBuy, title = "3サイトの値段" }) {
  const rows = buildRows({ offers, dbOffers });
  const best = bestOf(rows, rates);
  const order = [...STORE_ORDER].sort((a, b) => {
    const ea = rows[a] ? effectivePrice(a, rows[a], rates) : Infinity;
    const eb = rows[b] ? effectivePrice(b, rows[b], rates) : Infinity;
    return ea - eb;
  });

  return (
    <section>
      {title && <h3 className="o-h2" style={{ marginTop: 20 }}>{title}</h3>}
      {best && <div style={{ marginBottom: 10 }}><PriceTag price={best.o.price} store={best.store} eff={best.eff} onWhite /></div>}
      <div className="o-cmp">
        {order.map((s) => {
          const meta = STORE_META[s];
          const o = rows[s];
          if (!o) {
            return (
              <div key={s} className="o-cmp-row missing">
                <div className="o-cmp-top">
                  <span className={`o-store ${s}`}>{meta.short}</span>
                  <span className="o-cmp-meta">まだ見つかっていません。次の自動取得で探します</span>
                  <a className="o-cmp-buy ghost" href={searchUrl(s, name)} target="_blank" rel="noopener noreferrer sponsored">{meta.short}で探す</a>
                </div>
              </div>
            );
          }
          const eff = effectivePrice(s, o, rates);
          const isBest = best && best.store === s;
          const lab = statsLabel(o.stats);
          const extra = extraPointPct(s, o);
          const st = o.stats;
          return (
            <div key={s} className={`o-cmp-row${isBest ? " best" : ""}`}>
              <div className="o-cmp-top">
                <div style={{ minWidth: 0 }}>
                  <span className={`o-store ${s}`}>{meta.short}</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
                    <span className="o-num o-cmp-price">¥{num(o.price)}</span>
                    {eff !== o.price && <span className="o-cmp-eff">実質 ¥{num(eff)}</span>}
                    {extra > 0 && <span className="o-mark hot">+{Math.round(extra * 10) / 10}%還元</span>}
                  </div>
                  <div className="o-cmp-meta">
                    {[o.shop, o.updated_at ? `${fmtTime(o.updated_at)}の価格` : "いまの価格"].filter(Boolean).join("/")}
                  </div>
                </div>
                {o.url && (
                  <a className={`o-cmp-buy ${s}`} href={o.url} target="_blank" rel="noopener noreferrer sponsored" onClick={() => onBuy?.(s, o)}>
                    {meta.short}で見る
                  </a>
                )}
              </div>
              <div className="o-cmp-marks">
                {lab.tone === "none"
                  ? <span className="o-mark flat">{lab.main}</span>
                  : <span className={`o-mark ${lab.tone === "good" ? "good" : lab.tone === "bad" ? "bad" : "flat"}`}>{lab.main}</span>}
                {lab.sub && <span className={`o-mark ${st?.isLowest ? "good" : "flat"}`}>{lab.sub}</span>}
                {st && st.days >= 7 && (
                  <span className="o-cmp-meta">
                    90日の最安 ¥{num(st.min)}{st.minDay ? `(${fmtDay(st.minDay)})` : ""}/ふだん ¥{num(st.median)}
                  </span>
                )}
                {o.sale_label && (
                  <span className="o-mark hot">{o.sale_label}{o.sale_until ? ` ${fmtTime(o.sale_until)}まで` : ""}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="o-note" style={{ marginTop: 8 }}>
        「ふだん」は90日の中央値。オウダンが毎日記録した各サイトの価格から出した目安です。価格は変わることがあるので、買う前に各サイトで確かめてください。【PR】購入リンクはアフィリエイトリンクです。
      </p>
    </section>
  );
}

// 検索結果カードなどに出す小さな3サイト表示
export function MiniCompare({ offers, dbOffers, rates }) {
  const rows = buildRows({ offers, dbOffers });
  const best = bestOf(rows, rates);
  return (
    <div className="o-mini">
      {STORE_ORDER.map((s) => {
        const o = rows[s];
        const meta = STORE_META[s];
        const on = best && best.store === s;
        return (
          <div key={s} className={on ? "best" : o ? "" : "none"}>
            <div className={`s s-${s}`}>{meta.short}{on ? " 最安" : ""}</div>
            <div className="p o-num">{o ? `¥${num(o.price)}` : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}
