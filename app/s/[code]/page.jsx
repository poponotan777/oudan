// ============================================================
// 紹介ページ(v26)/s/{code}
//   利用者が「紹介画像メーカー」(/make)で作った紹介。中身はURLに入っている(DBに保存しない)
//   価格は見たときの最新。購入リンクはオウダンのアフィリエイトID
//   利用者が書いた文章なので、検索エンジンには載せない(noindex)
// ============================================================
import { notFound } from "next/navigation";
import { loadShare } from "../../../lib/shareData";
import { SITE } from "../../../lib/supabaseServer";
import ShareView from "./ShareView";

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

const TITLE = { pick: "おすすめ", ranking: "ランキング", lineup: "おすすめ", compare: "価格比較" };

export async function generateMetadata({ params }) {
  const { code } = await params;
  const d = await loadShare(code).catch(() => null);
  if (!d) return { title: "紹介ページが見つかりません | オウダン", robots: { index: false } };
  const title = `${d.t || d.items[0].head || d.items[0].name.slice(0, 30)}|${TITLE[d.tp]}`;
  const description = d.s || d.items.map((it) => it.head || it.name.slice(0, 20)).join("・") + "。楽天・Yahoo!・Amazonの値段を比べています。";
  return {
    title: `${title} | オウダン`,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, url: `${SITE}/s/${code}`, siteName: "オウダン", type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage({ params }) {
  const { code } = await params;
  const d = await loadShare(code).catch(() => null);
  if (!d) notFound();
  return <ShareView d={d} code={code} />;
}
