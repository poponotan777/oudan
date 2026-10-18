// 紹介ページ(/s/{code})と、その画像で共通の読み出し
import { publicDb, ensureAffiliate } from "./supabaseServer";
import { loadCatalog } from "./catalog";
import { STORE_ORDER } from "./priceView";
import { inflateRawSync } from "node:zlib";
import { decodeShare } from "./share";

export async function loadShare(code) {
  const data = await decodeShare(code, (b) => new Uint8Array(inflateRawSync(Buffer.from(b), { maxOutputLength: 20000 })));
  if (!data) return null;
  const cat = await loadCatalog(publicDb(), data.i.map((x) => x.k)).catch(() => new Map());
  const items = data.i.map((x) => {
    const e = cat.get(x.k);
    if (!e?.product) return null;
    const offers = {};
    for (const s of STORE_ORDER) {
      const o = e.offers?.[s];
      if (o) offers[s] = { ...o, url: ensureAffiliate(s, o.url) };
    }
    return {
      pkey: e.pkey,
      name: e.product.name,
      brand: e.product.brand,
      genre: e.product.genre,
      image: e.product.image && !/media-amazon/.test(e.product.image) ? e.product.image : null,
      head: x.h,
      comment: x.c,
      offers,
    };
  }).filter(Boolean);
  if (!items.length) return null;
  return { ...data, items };
}
