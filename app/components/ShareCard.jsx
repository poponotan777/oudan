"use client";
// 画像つきで紹介する(OGP画像)
//   この商品のURLをXやLINEに貼ると、3サイトの価格が入った画像のカードが出る。
//   ここではその画像を先に見せて、そのまま投稿・リンクのコピー・画像の保存ができるようにする。
import { useState } from "react";
import { productPath, STORE_ORDER, STORE_META, yen } from "../../lib/priceView";

export default function ShareCard({ pkey, name, offers = {} }) {
  const [msg, setMsg] = useState("");
  const [imgOk, setImgOk] = useState(true);
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
  const canNative = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <section>
      <h2 className="o-h2">画像つきで紹介する</h2>
      <div className="o-box o-share">
        {imgOk
          ? <img src={img} alt={`${name}の3サイト価格比較の画像`} loading="lazy" onError={() => setImgOk(false)} />
          : <div className="o-note">画像を作れませんでした。リンクだけでも紹介できます。</div>}
        <p className="o-note" style={{ margin: 0 }}>
          このページのリンクをXやLINEに貼ると、上の画像が自動で付きます。価格は1時間ごとに新しくなります。
        </p>
        <div className="o-share-btns">
          <a className="o-btn x" target="_blank" rel="noopener noreferrer"
            href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}>Xに投稿する</a>
          <a className="o-btn" target="_blank" rel="noopener noreferrer"
            href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`}>LINEで送る</a>
          <button className="o-btn" onClick={copy}>リンクをコピー</button>
          {imgOk && <a className="o-btn" href={img} download={`oudan-${String(pkey).replace(/[^a-z0-9_-]/gi, "_")}.png`}>画像を保存</a>}
          {canNative && <button className="o-btn" onClick={native}>ほかのアプリ</button>}
        </div>
        {msg && <span style={{ fontSize: 12.5, color: "var(--wakaba)", fontWeight: 700 }}>{msg}</span>}
      </div>
    </section>
  );
}
