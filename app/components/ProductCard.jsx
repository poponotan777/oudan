"use client";
// 商品カード(画像・お買い得感・いちばん安い値段)。一覧や関連商品で使う
import Heart from "./Heart";
import { productPath, STORE_META, displayName, atLabel } from "../../lib/priceView";

const num = (n) => Math.round(Number(n)).toLocaleString("ja-JP");

export default function ProductCard({ c }) {
  return (
    <a href={productPath(c.pkey)} className="o-tile">
      {c.image ? <img className="o-tile-img" src={c.image} alt="" loading="lazy" /> : <div className="o-tile-img" />}
      <Heart item={{ pkey: c.pkey, name: c.name, image: c.image, price: c.price, store: c.store, inDb: true }} />
      <div className="o-tile-name">{displayName(c.name)}</div>
      <div className="deal">
        {c.off > 0 && <span className="off">{c.off}%安</span>}
        <span className="o-num price">¥{num(c.price)}</span>
      </div>
      <div className="was">
        <span className={`s-${c.store}`} style={{ fontWeight: 900 }}>{STORE_META[c.store]?.short}</span>
        {c.lowest ? <b style={{ color: "var(--wakaba)", marginLeft: 6 }}>3か月で最安</b> : c.median && c.off > 0 ? <span style={{ marginLeft: 6 }}>ふだん¥{num(c.median)}</span> : null}
        {c.stores >= 2 && <span style={{ marginLeft: 6 }}>{c.stores}サイト比較</span>}
      </div>
      {c.store === "amazon" && c.at && <div className="at">{atLabel(c.at)}の価格</div>}
    </a>
  );
}
