import { createClient } from "@supabase/supabase-js";
import { buildItemLink } from "../../../lib/affiliate";

export const revalidate = 300;

// 運営の既定アフィリエイト設定(作成者が自分のIDを登録していない場合に使う)
const FALLBACK_AFF = {
  rakuten_affiliate_id: process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID || null,
  vc_sid: process.env.VC_SID || null,
  vc_pid: process.env.VC_PID || null,
  amazon_tag: process.env.AMAZON_TAG || "popo-kaiteki-22",
};

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

async function loadCollection(slug) {
  const sb = db();
  const { data: col } = await sb
    .from("collections")
    .select("id, slug, title, description, is_public, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!col || !col.is_public) return null;
  const { data: items } = await sb
    .from("collection_items")
    .select("position, product_key, name, image, price, store, url, comment")
    .eq("collection_id", col.id)
    .order("position");
  // 作成者のアフィリエイト設定(未登録なら運営のIDにフォールバック)
  let aff = null;
  try {
    const { data } = await sb.rpc("collection_affiliate", { _slug: slug });
    aff = Array.isArray(data) ? data[0] : data;
  } catch {}
  return { col, items: items || [], aff };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await loadCollection(slug);
  if (!data) return { title: "見つかりません | オウダン" };
  return {
    title: `${data.col.title} | オウダン`,
    description: data.col.description || "オウダンで作った商品まとめ",
    openGraph: {
      title: data.col.title,
      description: data.col.description || "オウダンで作った商品まとめ",
      images: data.items.filter((i) => i.image).slice(0, 4).map((i) => ({ url: i.image })),
    },
  };
}

const yen = (n) => "¥" + Math.round(Number(n)).toLocaleString("ja-JP");
const STORE_LABEL = { rakuten: "楽天", yahoo: "Yahoo!", amazon: "Amazon" };
const STORE_COLOR = { rakuten: "#BF0000", yahoo: "#FF0033", amazon: "#232F3E" };

export default async function CollectionPage({ params }) {
  const { slug } = await params;
  const data = await loadCollection(slug);

  if (!data) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 18 }}>このまとめは見つかりませんでした</h1>
        <p style={{ fontSize: 13, color: "#64748B" }}>削除されたか、非公開に設定されています。</p>
        <a href="/" style={{ fontSize: 13, fontWeight: 700, color: "#16324F" }}>← オウダンで商品を探す</a>
      </div>
    );
  }

  const { col, items, aff } = data;
  // 3列グリッド。9枚なら3×3になる
  const cols = items.length <= 4 ? 2 : 3;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 14px 50px" }}>
      <header style={{ marginBottom: 16 }}>
        <a href="/" style={{ fontSize: 12, fontWeight: 800, color: "#16324F", textDecoration: "none" }}>
          オウダン <span style={{ fontWeight: 400, color: "#64748B" }}>実質価格で比べる横断検索</span>
        </a>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "10px 0 4px", lineHeight: 1.4 }}>{col.title}</h1>
        {col.description && (
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, margin: 0 }}>{col.description}</p>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
        {items.map((it, i) => {
          const href = buildItemLink(it, aff, FALLBACK_AFF);
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              style={{
                display: "block", textDecoration: "none", color: "inherit",
                background: "#fff", border: "1px solid #DDE9E4", borderRadius: 12, overflow: "hidden",
              }}
            >
              <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#EAF3F0" }}>
                {it.image ? (
                  <img src={it.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 11, color: "#94A3B8" }}>画像なし</div>
                )}
                {it.store && (
                  <span style={{
                    position: "absolute", left: 6, top: 6, fontSize: 9, fontWeight: 800, color: "#fff",
                    background: STORE_COLOR[it.store] || "#64748B", borderRadius: 4, padding: "2px 6px",
                  }}>{STORE_LABEL[it.store] || it.store}</span>
                )}
              </div>
              <div style={{ padding: "7px 8px 9px" }}>
                <div style={{
                  fontSize: 11, fontWeight: 600, lineHeight: 1.4, height: "2.8em", overflow: "hidden",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>{it.name}</div>
                {it.price ? (
                  <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 3 }}>{yen(it.price)}</div>
                ) : null}
                {it.comment && (
                  <div style={{ fontSize: 10.5, color: "#64748B", marginTop: 3, lineHeight: 1.5 }}>{it.comment}</div>
                )}
              </div>
            </a>
          );
        })}
      </div>

      <div style={{ marginTop: 20, textAlign: "center" }}>
        <a href="/" style={{
          display: "inline-block", fontSize: 13, fontWeight: 800, color: "#fff", background: "#10B981",
          borderRadius: 10, padding: "11px 22px", textDecoration: "none",
        }}>
          オウダンで最安値を比べる →
        </a>
      </div>

      <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 20, lineHeight: 1.7, textAlign: "center" }}>
        【PR】このページのリンクにはアフィリエイトリンクが含まれます。価格は保存時点のもので、現在の価格と異なる場合があります。
        最新の価格・送料・在庫は各ストアでご確認ください。
      </p>
      <p style={{ textAlign: "center", marginTop: 10 }}>
        <a href="/privacy" style={{ fontSize: 11, color: "#64748B" }}>プライバシーポリシー</a>
      </p>
    </div>
  );
}
