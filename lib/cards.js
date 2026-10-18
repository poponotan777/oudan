// 商品を「カード」(画像・名前・いちばん安い値段・お買い得感)にする — サーバー側で使う
import { loadCatalog } from "./catalog";
import { STORE_ORDER, statsFor, trustedOffers } from "./priceView";

export function toCard(e) {
  if (!e?.product) return null;
  let best = null;
  const prices = {};
  const offers = trustedOffers(e.offers); // セット数違いの疑いがあるサイトは外す
  for (const s of STORE_ORDER) {
    const o = offers[s];
    if (!o || !(o.price > 0)) continue;
    prices[s] = o.price;
    if (!best || o.price < best.o.price) best = { s, o };
  }
  if (!best) return null;
  const st = statsFor(best.o.price, best.o);
  const ok = st && st.days >= 7;
  return {
    pkey: e.pkey,
    name: e.product.name,
    image: e.product.image || null,
    price: best.o.price,
    store: best.s,
    stores: Object.keys(prices).length,
    prices,
    off: ok && st.diffPct <= -1 ? Math.round(-st.diffPct) : 0,
    median: ok ? st.median : null,
    lowest: ok && st.isLowest,
    point: best.o.point_rate || null,
    sale: best.o.sale_label || null,
  };
}

export async function cardsFor(sb, keys) {
  const m = await loadCatalog(sb, keys).catch(() => new Map());
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    const c = toCard(m.get(k));
    if (c && !seen.has(c.pkey)) { seen.add(c.pkey); out.push(c); }
  }
  return out;
}
