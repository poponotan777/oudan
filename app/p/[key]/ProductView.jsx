"use client";
// 商品ページの中身(v26)
//   主役は「どこで買うといちばん安いか」。上から:商品 → いちばん安い値段と買い時 → 3サイト比較 → 値段の動き
//   → こんな人に → 同じジャンルの商品 → 紹介する(小さく)
import { useEffect, useState } from "react";
import PriceCompare from "../../components/PriceCompare";
import PriceChart from "../../components/PriceChart";
import BuyBox from "../../components/BuyBox";
import ProductCard from "../../components/ProductCard";
import Heart from "../../components/Heart";
import ShareCard from "../../components/ShareCard";
import { SiteHeader, SiteFooter } from "../../components/SiteChrome";
import { painsForProduct, displayCatch } from "../../../lib/pains";
import { STORE_ORDER, displayName } from "../../../lib/priceView";
import { loadStatus, ratesForPrice } from "../../../lib/status";

export default function ProductView({ product, offers, related: rel0 }) {
  const related = (rel0 || []).filter((r) => r.pkey !== product.pkey);
  const [rates, setRates] = useState({ rakuten: 1, yahoo: 1, amazon: 1 });
  const [more, setMore] = useState(false);
  useEffect(() => { setRates(ratesForPrice(loadStatus(), {}, new Date(), [])); }, []);

  const cheapest = STORE_ORDER.map((s) => offers[s] && { ...offers[s], store: s }).filter(Boolean).sort((a, b) => a.price - b.price)[0];

  // 最近見た商品(端末内)に残す
  useEffect(() => {
    try {
      const vh = JSON.parse(localStorage.getItem("viewHistory") || "[]");
      const entry = { key: product.pkey, name: product.name, image: product.image, price: cheapest?.price ?? null, store: cheapest?.store, at: Date.now() };
      localStorage.setItem("viewHistory", JSON.stringify([entry, ...vh.filter((x) => x.key !== product.pkey)].slice(0, 30)));
    } catch {}
  }, [product.pkey]);

  const pains = painsForProduct(product);
  const desc = displayCatch(product.catch);
  const shown = more ? related : related.slice(0, 8);

  return (
    <div>
      <SiteHeader lede={false} />
      <main className="o-wrap o-main">
        <div className="o-pv">
          <div className="o-box o-pv-head">
            <div className="o-detail-head">
              {product.image ? <img src={product.image} alt="" /> : <div className="ph" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                {product.brand && <div className="o-detail-brand">{product.brand}</div>}
                <h1>{displayName(product.name)}</h1>
                <div className="o-detail-meta">{[product.genre, product.jan && `JAN ${product.jan}`].filter(Boolean).join("/")}</div>
                <div style={{ marginTop: 10 }}>
                  <Heart label item={{ pkey: product.pkey, name: product.name, image: product.image, price: cheapest?.price, store: cheapest?.store, inDb: true }} />
                </div>
              </div>
            </div>
            <BuyBox offers={offers} rates={rates} name={product.name} />
          </div>

          <div className="o-pv-side">
            <PriceCompare name={product.name} offers={[]} dbOffers={offers} rates={rates} showTag={false} />
            <p className="o-note" style={{ marginTop: 4 }}>
              実質価格は「設定」のあなたのポイントで出しています。<a className="o-link" href="/?v=settings">設定を変える</a>
            </p>
          </div>
        </div>

        <PriceChart offers={offers} />

        {(desc || pains.length > 0) && (
          <section>
            <h2 className="o-h2">どんな商品?</h2>
            {desc && <p className="o-desc" style={{ marginTop: 0 }}>{desc}</p>}
            {pains.length > 0 && (
              <ul className="o-pains" style={{ marginTop: 10 }}>
                {pains.map((p) => <li key={p.key}><b>{p.pain}</b><span>{p.benefit}</span></li>)}
              </ul>
            )}
          </section>
        )}

        {related.length > 0 && (
          <section>
            <h2 className="o-h2">{product.genre ? `${product.genre}の人気商品` : "人気の商品"}<small>{related.length}件</small></h2>
            <div className="o-pgrid">
              {shown.map((r) => <ProductCard key={r.pkey} c={r} />)}
            </div>
            {related.length > 8 && (
              <button className="o-btn block" style={{ marginTop: 10 }} onClick={() => setMore((v) => !v)}>
                {more ? "閉じる" : `もっと見る(あと${related.length - 8}件)`}
              </button>
            )}
          </section>
        )}

        <ShareCard pkey={product.pkey} name={product.name} offers={offers} />
        <p style={{ marginTop: 14 }}>
          <a className="o-link" href={`/?q=${encodeURIComponent(product.name.slice(0, 30))}`} style={{ fontSize: 13 }}>似た商品を探す</a>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
