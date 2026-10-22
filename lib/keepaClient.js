// ブラウザで読んだ商品(loadCatalog の結果)に、Amazonの記録の統計(Keepa)を足す(v31)
//   記録が無い・通信できないときは、そのまま返す
export async function withKeepa(map) {
  const need = [];
  for (const [k, e] of map || []) if (e?.offers?.amazon && e.offers.amazon.days == null) need.push(k);
  if (!need.length) return map;
  try {
    const r = await fetch(`/api/keepa?k=${encodeURIComponent(need.slice(0, 60).join("|"))}`);
    const { stats } = await r.json();
    for (const [k, e] of map) {
      const s = stats?.[k];
      if (s && e.offers?.amazon) e.offers = { ...e.offers, amazon: { ...e.offers.amazon, ...s } };
    }
  } catch {}
  return map;
}
