"use client";
// ホームの「よく売れている商品」:カテゴリで絞り込み、もっと見るで24件ずつ足していく
import { useEffect, useState } from "react";
import ProductCard from "./ProductCard";
import { CATEGORIES } from "../../lib/categories";

export default function Feed() {
  const [cat, setCat] = useState("all");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (c, p) => {
    setBusy(true);
    const g = CATEGORIES.find((x) => x.id === c)?.genre;
    const url = c === "all" ? `/api/feed?kind=pop&page=${p}` : `/api/feed?kind=genre&g=${encodeURIComponent(g || "")}&page=${p}`;
    try {
      const d = await (await fetch(url)).json();
      setItems((old) => {
        const seen = new Set(p === 0 ? [] : old.map((x) => x.pkey));
        return [...(p === 0 ? [] : old), ...(d.items || []).filter((x) => !seen.has(x.pkey))];
      });
      setMore(!!d.more);
      setPage(p);
    } catch { if (p === 0) setItems([]); setMore(false); }
    setBusy(false);
  };
  useEffect(() => { load(cat, 0); }, [cat]);

  return (
    <section>
      <h2 className="o-h2">よく売れている商品<small>3サイトの売れ筋から</small></h2>
      <div className="o-row-scroll" style={{ marginBottom: 10 }}>
        <button className="o-chip" aria-pressed={cat === "all"} onClick={() => setCat("all")}>すべて</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className="o-chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="o-box o-note">{busy ? "読み込んでいます" : "このカテゴリの商品はまだありません。毎日ふえていきます。"}</div>
      ) : (
        <div className="o-pgrid">
          {items.map((c) => <ProductCard key={c.pkey} c={c} />)}
        </div>
      )}
      {more && (
        <button className="o-btn block" style={{ marginTop: 10 }} disabled={busy} onClick={() => load(cat, page + 1)}>
          {busy ? "読み込んでいます" : "もっと見る"}
        </button>
      )}
    </section>
  );
}
