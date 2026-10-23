"use client";
// おすすめ(v30・v32で速く):似た商品と、その商品を見る人が次に見そうな商品
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

// トップの「あなたへのおすすめ」は、前回の結果を端末に残してすぐ出す(裏で新しくする・v32)
const SAVE = "recoHome";
function loadSaved(sig) {
  try { const x = JSON.parse(localStorage.getItem(SAVE) || "null"); return x && x.sig === sig && Date.now() - x.at < 6 * 3600 * 1000 ? x.d : null; } catch { return null; }
}
function save(sig, d) {
  try { localStorage.setItem(SAVE, JSON.stringify({ sig, at: Date.now(), d })); } catch {}
}

// items: [{ pkey, name, genre }](前ほど重く見る)
export default function Reco({ items, mode = "product" }) {
  const [d, setD] = useState(null);
  const sig = (items || []).slice(0, 3).map((x) => x.pkey).join(",");
  useEffect(() => {
    const list = (items || []).filter((x) => x && x.name).slice(0, 3);
    if (!list.length) return;
    let alive = true;
    if (mode === "home") { const s0 = loadSaved(sig); setD(s0 || { loading: true, groups: [] }); }
    const concepts = [];
    for (const x of list) for (const c of conceptsOf(x.name, x.genre)) if (!concepts.includes(c)) concepts.push(c);
    const main = concepts[0];
    const rel = relatedConcepts(concepts.slice(0, 3), 4);
    (async () => {
      // 似た商品と関連する種類を、同時に読む(どれも n=12 にそろえて、商品ページとトップでCDNを共有)
      const simP = main ? loadConcept({ id: main, n: 12 }) : list[0].genre ? loadConcept({ genre: list[0].genre, n: 12 }) : Promise.resolve({ items: [] });
      const relP = rel.map((id) => loadConcept({ id, n: 12 }));
      const exclude = new Set(list.map((x) => x.pkey));
      const take = (res, max) => {
        const out = [];
        for (const c of res.items || []) { if (out.length >= max) break; if (!exclude.has(c.pkey)) { exclude.add(c.pkey); out.push(c); } }
        return out;
      };
      const sim = await simP;
      if (!alive) return;
      const similar = take(sim, 12);
      const simLabel = main ? CONCEPT_BY_ID[main].label : "";
      setD((p) => ({ similar, simLabel, groups: p?.loading ? [] : p?.groups || [] }));
      const rs = await Promise.all(relP);
      if (!alive) return;
      const groups = rel.map((id, i) => ({ id, label: CONCEPT_BY_ID[id].label, items: take(rs[i], 8) })).filter((g) => g.items.length);
      const done = { similar, simLabel, groups };
      setD(done);
      if (mode === "home") save(sig, done);
    })();
    return () => { alive = false; };
  }, [sig]);
  if (!d) return null;
  if (mode === "home") {
    if (d.loading) {
      // 読み込み中は形だけ先に出す(下の段がガタっと動かないように)
      return (
        <>
          <h2 className="o-h2">あなたへのおすすめ<small>最近見た商品から</small></h2>
          <div className="o-strip o-rail o-skel-rail" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="o-tile o-skel" />)}</div>
        </>
      );
    }
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
