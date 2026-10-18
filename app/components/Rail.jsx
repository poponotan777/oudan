"use client";
// 商品カードの横スライダー(スマホは指で、パソコンは ‹ › ボタンでも動かせる)
import { useRef } from "react";
import ProductCard from "./ProductCard";

export default function Rail({ title, sub, items, children }) {
  const ref = useRef(null);
  if (!items?.length && !children) return null;
  const go = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section>
      {title && <h2 className="o-h2">{title}{sub && <small>{sub}</small>}</h2>}
      <div className="o-slider">
        <button className="o-slide-btn prev" aria-label="前へ" onClick={() => go(-1)}>‹</button>
        <button className="o-slide-btn next" aria-label="次へ" onClick={() => go(1)}>›</button>
        <div className="o-strip o-rail" ref={ref}>
          {children || items.map((c) => <ProductCard key={c.pkey} c={c} />)}
        </div>
      </div>
    </section>
  );
}
