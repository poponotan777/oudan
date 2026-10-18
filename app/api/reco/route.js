// おすすめ(v27)/api/reco?k=商品キー(カンマ区切りで3つまで。前ほど重く見る)
//   similar … 同じ種類の人気商品(似た商品)
//   groups  … その商品を見る人が次に見そうな種類ごとの人気商品(lib/reco.js のつながり)
import { NextResponse } from "next/server";
import { publicDb } from "../../../lib/supabaseServer";
import { cardsFor } from "../../../lib/cards";
import { conceptsOf, relatedConcepts, CONCEPT_BY_ID } from "../../../lib/reco";

export const revalidate = 3600;

const clean = (w) => String(w).replace(/[,()%_*]/g, "").replace(/\s+/g, "%");

async function topByWords(sb, words, exclude, n) {
  const or = words.map((w) => `name.ilike.%${clean(w)}%`).join(",");
  const { data } = await sb.from("products").select("pkey").is("merged_into", null).not("pop", "is", null)
    .or(or).order("pop", { ascending: true }).limit(n + exclude.size + 4);
  return (data || []).map((r) => r.pkey).filter((k) => !exclude.has(k)).slice(0, n);
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const keys = String(sp.get("k") || "").split(",").map((s) => s.trim()).filter((s) => s.length >= 3 && s.length <= 140).slice(0, 3);
  if (!keys.length) return NextResponse.json({ similar: [], groups: [] });
  const sb = publicDb();
  const { data: prods } = await sb.from("products").select("pkey, name, genre").in("pkey", keys);
  const byKey = new Map((prods || []).map((p) => [p.pkey, p]));
  const exclude = new Set(keys);
  const concepts = [];
  for (const k of keys) for (const c of conceptsOf(byKey.get(k)?.name, byKey.get(k)?.genre)) if (!concepts.includes(c)) concepts.push(c);

  let similar = [];
  let simLabel = "";
  try {
    const main = CONCEPT_BY_ID[concepts[0]];
    if (main) {
      simLabel = main.label;
      similar = await cardsFor(sb, await topByWords(sb, main.q, exclude, 12));
    } else {
      const g = byKey.get(keys[0])?.genre;
      if (g) {
        const { data } = await sb.from("products").select("pkey").eq("genre", g).is("merged_into", null).not("pop", "is", null)
          .order("pop", { ascending: true }).limit(14);
        similar = await cardsFor(sb, (data || []).map((r) => r.pkey).filter((k) => !exclude.has(k)).slice(0, 12));
      }
    }
  } catch {}
  for (const c of similar) exclude.add(c.pkey);

  const rel = relatedConcepts(concepts.slice(0, 3), 4);
  const groups = (await Promise.all(rel.map(async (id) => {
    const c = CONCEPT_BY_ID[id];
    try {
      const items = await cardsFor(sb, await topByWords(sb, c.q, exclude, 8));
      return items.length ? { id, label: c.label, items } : null;
    } catch { return null; }
  }))).filter(Boolean);

  return NextResponse.json({ concepts, simLabel, similar, groups }, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=1800" },
  });
}
