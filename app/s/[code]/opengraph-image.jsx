// 紹介ページの画像(1200×630)。テンプレートごとに描き分ける
import { ImageResponse } from "next/og";
import { loadShare } from "../../../lib/shareData";
import { CollectionOG, PickOG, ogFonts, imageData, OG_SIZE, jstStamp, rangeStamp } from "../../../lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;
export const alt = "オウダンの紹介画像";

import { trustedOffers } from "../../../lib/priceView";
const pricesOf = (it) => { const t = trustedOffers(it.offers); return Object.fromEntries(["rakuten", "yahoo", "amazon"].map((s) => [s, t[s]?.price ?? null])); };

export default async function Image({ params }) {
  const { code } = await params;
  const d = await loadShare(code).catch(() => null);
  let date = jstStamp();
  if (!d) {
    const fonts = await ogFonts("紹介ページが見つかりません");
    return new ImageResponse(<CollectionOG data={{ title: "紹介ページが見つかりません", template: "lineup", date, items: [] }} />, { ...OG_SIZE, fonts });
  }
  date = rangeStamp(d.items.flatMap((it) => Object.values(trustedOffers(it.offers)).map((o) => o.updated_at)).filter(Boolean));
  if (d.tp === "pick") {
    const it = d.items[0];
    const data = { title: d.t || it.head || "", by: d.by, date, points: d.p, item: { name: it.name, head: it.head, image: await imageData(it.image), prices: pricesOf(it) } };
    const fonts = await ogFonts([data.title, data.by, it.name, ...d.p, "おすすめのおすすめ"].join(""));
    return new ImageResponse(<PickOG data={data} />, { ...OG_SIZE, fonts });
  }
  const items = await Promise.all(d.items.slice(0, 6).map(async (it) => ({ name: it.name, head: it.head, prices: pricesOf(it), image: await imageData(it.image) })));
  const data = { title: d.t || "おすすめ", subtitle: d.s, by: d.by, template: d.tp, date, items };
  const fonts = await ogFonts([data.title, data.subtitle, data.by, "のおすすめ", ...items.map((i) => i.name + i.head)].join(""));
  return new ImageResponse(<CollectionOG data={data} />, { ...OG_SIZE, fonts });
}
