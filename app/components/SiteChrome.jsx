"use client";
// ヘッダーとフッター(トップ・商品ページで共通)
import { useEffect, useState } from "react";
import { loadFavorites, onFavoritesChange } from "../../lib/favorites";
import { COLLECTIONS_ON } from "../../lib/featureFlags";

export function LogoMark({ size = 26 }) {
  // 値札のかたち(穴とひもつき)
  return (
    <svg className="o-logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 13.2 13.2 3H27a2 2 0 0 1 2 2v13.8L18.8 29a2 2 0 0 1-2.8 0L3 16a2 2 0 0 1 0-2.8z" fill="#ffd84d" />
      <circle cx="23" cy="9" r="2.6" fill="#1f2350" />
      <path d="M10.5 15.5h9M10.5 19.5h5.5" stroke="#1f2350" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const NAV = [
  ["home", "ホーム", "/"],
  ["fav", "気になる", "/?v=fav"],
  ["settings", "設定", "/?v=settings"],
];

// onNav があればボタン(トップ内の切り替え)、なければリンク(商品ページなど)
export function SiteHeader({ view, onNav, query, setQuery, onSearch, lede = true }) {
  const [favN, setFavN] = useState(0);
  const [q, setQ] = useState("");
  useEffect(() => {
    setFavN(loadFavorites().length);
    return onFavoritesChange((l) => setFavN(l.length));
  }, []);
  const val = setQuery ? query : q;
  const setVal = setQuery || setQ;
  const submit = (e) => {
    e.preventDefault();
    if (onSearch) onSearch(val);
    else if (val.trim()) window.location.href = `/?q=${encodeURIComponent(val.trim())}`;
  };
  return (
    <header className="o-header">
      <div className="o-wrap">
        <div className="o-header-row">
          {onNav
            ? <button className="o-logo" onClick={() => onNav("home")}><LogoMark /><span className="o-logo-text">オウダン</span></button>
            : <a className="o-logo" href="/"><LogoMark /><span className="o-logo-text">オウダン</span></a>}
          <nav className="o-nav" aria-label="メニュー">
            {NAV.map(([k, label, href]) => {
              const inner = <>{label}{k === "fav" && favN > 0 && <span className="o-badge-n">{favN}</span>}</>;
              return onNav
                ? <button key={k} aria-current={view === k ? "page" : undefined} onClick={() => onNav(k)}>{inner}</button>
                : <a key={k} href={href} aria-current={view === k ? "page" : undefined}>{inner}</a>;
            })}
          </nav>
        </div>
        <form className="o-search" onSubmit={submit} role="search">
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="商品名で探す(例:シャンプー、モバイルバッテリー)" enterKeyHint="search" aria-label="商品名" />
          <button type="submit">探す</button>
        </form>
        {lede && <p className="o-lede">楽天・Yahoo!ショッピング・Amazonの値段を、あなたのポイント込みで比べます</p>}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="o-footer">
      <div>
        {COLLECTIONS_ON && <a href="/c">商品まとめ</a>}
        <a href="/privacy">プライバシーポリシー</a>
      </div>
      <p style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
        【PR】オウダンは楽天アフィリエイト・バリューコマース・Amazonアソシエイトを利用しています。
        Amazonのアソシエイトとして、オウダンは適格販売により収入を得ています。
      </p>
    </footer>
  );
}
