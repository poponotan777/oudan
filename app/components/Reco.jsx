"use client";
// おすすめ(v30):似た商品と、その商品を見る人が次に見そうな商品
//   種類の判定はブラウザで行い(lib/reco.js)、種類ごとの人気商品は /api/concept から取る。
//   /api/concept は種類ごとに1時間CDNに置かれるので、2人目以降はすぐ表示される
import { useEffect, useState } from "react";
import Rail from "./Rail";
import { conceptsOf, relatedConcepts, CONCEPT_BY_ID } from "../../lib/reco";

const cache = new Map();
async function loadConcept(params) {
  const k = new URLSearchParams(params).toString();
  if (!cache.has(k)) cache.set(k, fetch(`/api/concept?${k}`).then((r) => r.json()).catch(() => ({ items: [] })));
  return cache.get(k);
}

// items: [{ pkey, name, genre }](前ほど重く見る)
export default function Reco({ items, mode = "product" }) {
  const [d, setD] = useState(null);
  const sig = (items || []).slice(0, 3).map((x) => x.pkey).join(",");
  useEffect(() => {
    const list = (items || []).filter((x) => x && x.name).slice(0, 3);
    if (!list.length) return;
    let alive = true;
    const exclude = new Set(list.map((x) => x.pkey));
    const concepts = [];
    for (const x of list) for (const c of conceptsOf(x.name, x.genre)) if (!concepts.includes(c)) concepts.push(c);
    const main = concepts[0];
    const rel = relatedConcepts(concepts.slice(0, 3), 4);
    const pick = (res) => (res.items || []).filter((c) => !exclude.has(c.pkey)).slice(0, 12);
    (async () => {
      // 似た商品(同じ種類。種類が分からなければ同じジャンル)
      const simP = main ? loadConcept({ id: main, n: 12 }) : list[0].genre ? loadConcept({ genre: list[0].genre, n: 12 }) : Promise.resolve({ items: [] });
      const sim = await simP;
      if (!alive) return;
      const similar = pick(sim);
      similar.forEach((c) => exclude.add(c.pkey));
      setD({ similar, simLabel: main ? CONCEPT_BY_ID[main].label : "", groups: [] });
      // 関連する種類(順に出していく)
      const groups = [];
      await Promise.all(rel.map(async (id, i) => {
        const r = await loadConcept({ id, n: 8 });
        const its = pick(r).slice(0, 8);
        if (its.length) groups[i] = { id, label: CONCEPT_BY_ID[id].label, items: its };
      }));
      if (alive) setD((p) => ({ ...(p || {}), groups: groups.filter(Boolean) }));
    })();
    return () => { alive = false; };
  }, [sig]);
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
