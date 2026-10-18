"use client";
import { useEffect, useState } from "react";
import PriceCompare from "../../components/PriceCompare";
import Heart from "../../components/Heart";
import { SiteHeader, SiteFooter } from "../../components/SiteChrome";
import { productPath, displayName } from "../../../lib/priceView";
import { loadStatus, ratesForPrice } from "../../../lib/status";

const KICK = { ranking: (i) => `${i + 1}位`, lineup: (i) => `${i + 1}`, compare: (i) => `${i + 1}`, pick: () => "" };

export default function ShareView({ d, code }) {
  const [rates, setRates] = useState({ rakuten: 1, yahoo: 1, amazon: 1 });
  useEffect(() => { setRates(ratesForPrice(loadStatus(), {}, new Date(), [])); }, []);
  return (
    <div>
      <SiteHeader lede={false} />
      <main className="o-wrap o-main">
        <div className="o-share-hero">
          {d.by && <div className="o-share-by">{d.by}のおすすめ</div>}
          <h1>{d.t || d.items[0].head || displayName(d.items[0].name)}</h1>
          {d.s && <p>{d.s}</p>}
        </div>
        {d.tp === "pick" && d.p.length > 0 && (
          <ol className="o-points">
            {d.p.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        )}
        {d.items.map((it, i) => (
          <article key={it.pkey + i} className="o-share-item">
            <div className="o-detail-head">
              {it.image ? <img src={it.image} alt="" /> : <div className="ph" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                {d.tp !== "pick" && <span className={`o-rank${d.tp === "ranking" && i < 3 ? ` r${i + 1}` : ""}`}>{KICK[d.tp](i)}</span>}
                {it.head && <div className="o-share-head">{it.head}</div>}
                <h2 className="o-share-name">{displayName(it.name)}</h2>
                {it.renamed && <div className="o-note" style={{ margin: "2px 0 0" }}>商品名:{displayName(it.fullName)}</div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <Heart label item={{ pkey: it.pkey, name: it.name, image: it.image, inDb: true }} />
                </div>
              </div>
            </div>
            {it.comment && <p className="o-share-comment">{it.comment}</p>}
            <PriceCompare name={it.name} offers={[]} dbOffers={it.offers} rates={rates} title="" note={false} />
            <a className="o-link" href={productPath(it.pkey)} style={{ fontSize: 13, display: "inline-block", marginTop: 8 }}>この商品の値段の動きを見る</a>
          </article>
        ))}
        <div className="o-box" style={{ marginTop: 20 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700 }}>このページは、オウダンを使っている人が作った紹介です。</p>
          <p className="o-note" style={{ margin: "0 0 12px" }}>文章は作った人のものです。「ふだん」は90日の中央値で、オウダンが毎日記録した値段から出した目安です。値段はこのページを開いたときの最新で、購入リンクはオウダンのアフィリエイトリンク【PR】です。</p>
          <a className="o-btn solid" href={`/make?from=${encodeURIComponent(code)}`}>自分でも紹介画像を作る</a>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
