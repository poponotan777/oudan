"use client";
// 商品ページの中身(v27)
//   主役は「商品の画像・いちばん安い値段・どのくらいお得か」。
//   上から:画像+値段(大きく)→ 3サイト比較 → 似た商品 → この商品を見た人に
//   → どんな商品 → ジャンルの人気 → 紹介する(小さく)→ 最近見た商品
import { useEffect, useState } from "react";
import PriceCompare from "../../components/PriceCompare";
import BuyBox from "../../components/BuyBox";
import ProductCard from "../../components/ProductCard";
import Heart from "../../components/Heart";
import ShareCard from "../../components/ShareCard";
import Reco from "../../components/Reco";
import Rail from "../../components/Rail";
import { SiteHeader, SiteFooter } from "../../components/SiteChrome";
import { painsForProduct, displayCatch } from "../../../lib/pains";
import { STORE_ORDER, displayName, productPath } from "../../../lib/priceView";
import { loadStatus, ratesForPrice } from "../../../lib/status";

const num = (n) => Math.round(Number(n)).toLocaleString("ja-JP");

export default function ProductView({ product, offers, related: rel0 }) {
  const related = (rel0 || []).filter((r) => r.pkey !== product.pkey);
  const [rates, setRates] = useState({ rakuten: 1, yahoo: 1, amazon: 1 });
  const [more, setMore] = useState(false);
  const [recent, setRecent] = useState([]);
  useEffect(() => { setRates(ratesForPrice(loadStatus(), {}, new Date(), [])); }, []);

  const cheapest = STORE_ORDER.map((s) => offers[s] && { ...offers[s], store: s }).filter(Boolean).sort((a, b) => a.price - b.price)[0];

  // 最近見た商品(端末内):表示用に読み、この商品を先頭に記録する
  useEffect(() => {
    try {
      const vh = JSON.parse(localStorage.getItem("viewHistory") || "[]");
      setRecent(vh.filter((x) => x.key !== product.pkey).slice(0, 20));
      const entry = { key: product.pkey, name: product.name, image: product.image, price: cheapest?.price ?? null, store: cheapest?.store, inDb: true, at: Date.now() };
      localStorage.setItem("viewHistory", JSON.stringify([entry, ...vh.filter((x) => x.key !== product.pkey)].slice(0, 30)));
    } catch {}
  }, [product.pkey]);

  const pains = painsForProduct(product);
  const desc = displayCatch(product.catch);
  const shown = more ? related : related.slice(0, 4);

  return (
    <div>
      <SiteHeader lede={false} />
      <main className="o-wrap o-main">
        <div className="o-pv-hero">
          {product.image ? <img className="o-pv-img" src={product.image} alt={displayName(product.name)} /> : <div className="o-pv-img" />}
          <div className="o-pv-info">
            {product.brand && <div className="o-detail-brand">{product.brand}</div>}
            <h1>{displayName(product.name)}</h1>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <Heart label item={{ pkey: product.pkey, name: product.name, image: product.image, price: cheapest?.price, store: cheapest?.store, inDb: true }} />
              <span className="o-detail-meta" style={{ marginTop: 0 }}>{[product.genre, product.jan && `JAN ${product.jan}`].filter(Boolean).join("/")}</span>
            </div>
            <BuyBox offers={offers} rates={rates} name={product.name} />
          </div>
        </div>

        <PriceCompare name={product.name} offers={[]} dbOffers={offers} rates={rates} showTag={false} />
        <p className="o-note" style={{ marginTop: 4 }}>
          実質価格は「設定」のあなたのポイントで出しています。<a className="o-link" href="/?v=settings">設定を変える</a>
        </p>

        <Reco items={[{ pkey: product.pkey, name: product.name, genre: product.genre }]} />

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
            {related.length > 4 && (
              <button className="o-btn block" style={{ marginTop: 10 }} onClick={() => setMore((v) => !v)}>
                {more ? "閉じる" : `もっと見る(あと${related.length - 4}件)`}
              </button>
            )}
          </section>
        )}

        <ShareCard pkey={product.pkey} name={product.name} offers={offers} />

        {recent.length > 0 && (
          <Rail title="最近見た商品">
            {recent.map((it) => (
              <a key={it.key} href={it.inDb === false ? `/?q=${encodeURIComponent(String(it.name || "").slice(0, 30))}` : productPath(it.key)} className="o-tile">
                {it.image ? <img className="o-tile-img" src={it.image} alt="" loading="lazy" /> : <div className="o-tile-img" />}
                <div className="o-tile-name">{displayName(it.name)}</div>
                {it.price != null && <div className="o-num price">¥{num(it.price)}</div>}
              </a>
            ))}
          </Rail>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
