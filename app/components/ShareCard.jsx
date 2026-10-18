"use client";
// 画像つきで紹介する(OGP画像)
//   この商品のURLをXやLINEに貼ると、3サイトの価格が入った画像のカードが出る。
//   ここではその画像を先に見せて、そのまま投稿・リンクのコピー・画像の保存ができるようにする。
import { useEffect, useState } from "react";
import { productPath, STORE_ORDER, STORE_META, yen } from "../../lib/priceView";

export default function ShareCard({ pkey, name, offers = {} }) {
  const [msg, setMsg] = useState("");
  const [imgOk, setImgOk] = useState(true);
  const [canNative, setCanNative] = useState(false);
  useEffect(() => { setCanNative(typeof navigator !== "undefined" && !!navigator.share); }, []);
  if (!pkey) return null;
  const path = productPath(pkey);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://oudan.vercel.app";
  const url = origin + path;
  const img = `${path}/opengraph-image`;
  const cheapest = STORE_ORDER.map((s) => offers[s] && { s, p: offers[s].price }).filter(Boolean).sort((a, b) => a.p - b.p)[0];
  const text = [
    `${String(name || "").slice(0, 40)}`,
    cheapest ? `いま${STORE_META[cheapest.s].short}がいちばん安い ${yen(cheapest.p)}` : "楽天・Yahoo!・Amazonの値段を比べました",
    "#PR",
  ].join("\n");
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); flash("リンクをコピーしました"); } catch { flash("コピーできませんでした"); }
  };
  const native = async () => {
    try { await navigator.share({ title: name, text, url }); } catch {}
  };

  return (
    <section>
      <h2 className="o-h2">この商品を紹介する</h2>
      <div className="o-box o-share-mini">
        {imgOk && (
          <a href={img} target="_blank" rel="noopener noreferrer" className="thumb" title="画像を大きく見る">
            <img src={img} alt={`${name}の3サイト価格比較の画像`} loading="lazy" onError={() => setImgOk(false)} />
          </a>
        )}
        <div className="body">
          <p className="o-note" style={{ margin: 0 }}>リンクをXやLINEに貼ると、左の画像が付きます。</p>
          <div className="o-share-btns">
            <a className="o-btn x" target="_blank" rel="noopener noreferrer"
              href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}>Xに投稿</a>
            <a className="o-btn" target="_blank" rel="noopener noreferrer"
              href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`}>LINE</a>
            <button className="o-btn" onClick={copy}>リンクをコピー</button>
            {canNative && <button className="o-btn" onClick={native}>ほか</button>}
            <a className="o-btn tag" href={`/make?k=${encodeURIComponent(pkey)}`}>説明つきの紹介画像を作る</a>
          </div>
          {msg && <span style={{ fontSize: 12.5, color: "var(--wakaba)", fontWeight: 700 }}>{msg}</span>}
        </div>
      </div>
    </section>
  );
}
