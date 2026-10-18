"use client";
// おすすめ:似た商品と、その商品を見る人が次に見そうな商品(/api/reco)
import { useEffect, useState } from "react";
import Rail from "./Rail";

export default function Reco({ keys, mode = "product" }) {
  const [d, setD] = useState(null);
  const k = (keys || []).filter(Boolean).slice(0, 3).join(",");
  useEffect(() => {
    if (!k) return;
    let alive = true;
    fetch(`/api/reco?k=${encodeURIComponent(k)}`).then((r) => r.json()).then((x) => { if (alive) setD(x); }).catch(() => {});
    return () => { alive = false; };
  }, [k]);
  if (!d) return null;
  if (mode === "home") {
    const groups = [...(d.similar?.length ? [{ id: "sim", label: d.simLabel || "似た商品", items: d.similar }] : []), ...(d.groups || [])];
    if (!groups.length) return null;
    return (
      <>
        <h2 className="o-h2">あなたへのおすすめ<small>最近見た商品から</small></h2>
        {groups.slice(0, 4).map((g) => (
          <div key={g.id} className="o-reco-group">
            <div className="o-reco-label">{g.label}</div>
            <Rail items={g.items} />
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      {d.similar?.length > 0 && <Rail title="似た商品" sub={d.simLabel ? `ほかの${d.simLabel}` : "同じジャンル"} items={d.similar} />}
      {d.groups?.length > 0 && (
        <section>
          <h2 className="o-h2">この商品を見た人に<small>いっしょに使うもの・よく見られているもの</small></h2>
          {d.groups.map((g) => (
            <div key={g.id} className="o-reco-group">
              <div className="o-reco-label">{g.label}</div>
              <Rail items={g.items} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
