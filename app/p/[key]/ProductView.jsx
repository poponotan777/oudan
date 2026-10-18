"use client";
// 商品ページの中身(v25)。実質価格は端末に保存した「あなたのポイント」で出すのでブラウザ側で描画する
import { useEffect, useState } from "react";
import PriceCompare from "../../components/PriceCompare";
import Heart from "../../components/Heart";
import ShareCard from "../../components/ShareCard";
import { SiteHeader, SiteFooter } from "../../components/SiteChrome";
import { painsForProduct, displayCatch } from "../../../lib/pains";
import { STORE_ORDER, productPath, displayName } from "../../../lib/priceView";
import { loadStatus, ratesForPrice } from "../../../lib/status";

const num = (n) => Math.round(Number(n)).toLocaleString("ja-JP");

export default function ProductView({ product, offers, related: rel0 }) {
  const related = (rel0 || []).filter((r) => r.pkey !== product.pkey);
  const [rates, setRates] = useState({ rakuten: 1, yahoo: 1, amazon: 1 });
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

  return (
    <div>
      <SiteHeader lede={false} />
      <main className="o-wrap o-main">
        <div className="o-box">
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
          {desc && <p className="o-desc">{desc}</p>}
        </div>

        <PriceCompare name={product.name} offers={[]} dbOffers={offers} rates={rates} />
        <p className="o-note" style={{ marginTop: 4 }}>
          実質価格は「設定」のあなたのポイントで出しています。<a className="o-link" href="/?v=settings">設定を変える</a>
        </p>

        {pains.length > 0 && (
          <section>
            <h2 className="o-h2">こんな人に</h2>
            <ul className="o-pains">
              {pains.map((p) => <li key={p.key}><b>{p.pain}</b><span>{p.benefit}</span></li>)}
            </ul>
          </section>
        )}

        <ShareCard pkey={product.pkey} name={product.name} offers={offers} />

        <p style={{ marginTop: 14 }}>
          <a className="o-link" href={`/?q=${encodeURIComponent(product.name.slice(0, 30))}`} style={{ fontSize: 13 }}>似た商品を探す</a>
        </p>

        {related && related.length > 0 && (
          <section>
            <h2 className="o-h2">{product.genre ? `${product.genre}の人気商品` : "人気の商品"}</h2>
            <div className="o-pgrid">
              {related.map((r) => (
                <a key={r.pkey} href={productPath(r.pkey)} className="o-tile">
                  {r.image ? <img className="o-tile-img" src={r.image} alt="" loading="lazy" /> : <div className="o-tile-img" />}
                  <Heart item={{ pkey: r.pkey, name: r.name, image: r.image, inDb: true }} />
                  <div className="o-tile-name">{displayName(r.name)}</div>
                  {r.price != null && <div className="o-num price">¥{num(r.price)}</div>}
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
