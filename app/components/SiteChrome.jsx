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
  ["make", "紹介を作る", "/make"],
  ["settings", "設定", "/?v=settings"],
];
const ICON = {
  home: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z" />,
  fav: <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.7 3.4 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />,
  make: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><path d="m6.5 16 4-4.5 3 3 2-2 2.5 3.5" /><circle cx="15.5" cy="9" r="1.4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" /></>,
};
function NavIcon({ k }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[k]}</svg>;
}

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
          <Nav view={view} onNav={onNav} favN={favN} className="o-nav" />
        </div>
        <form className="o-search" onSubmit={submit} role="search">
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="商品名で探す(例:シャンプー、モバイルバッテリー)" enterKeyHint="search" aria-label="商品名" />
          <button type="submit">探す</button>
        </form>
        {lede && <p className="o-lede">楽天・Yahoo!ショッピング・Amazonの値段を、あなたのポイント込みで比べます</p>}
      </div>
      <Nav view={view} onNav={onNav} favN={favN} className="o-tabbar" />
    </header>
  );
}

// ナビ:パソコンはヘッダーの右、スマホは画面の下に固定(大きく押しやすく)
function Nav({ view, onNav, favN, className }) {
  return (
    <nav className={className} aria-label="メニュー">
      {NAV.map(([k, label, href]) => {
        const inner = (
          <>
            <span className="ic"><NavIcon k={k} />{k === "fav" && favN > 0 && <span className="o-badge-n">{favN}</span>}</span>
            <span className="lb">{label}</span>
          </>
        );
        const cur = view === k ? "page" : undefined;
        return onNav && k !== "make"
          ? <button key={k} aria-current={cur} onClick={() => onNav(k)}>{inner}</button>
          : <a key={k} href={href} aria-current={cur}>{inner}</a>;
      })}
    </nav>
  );
}

const CREDITS = [
  '<!-- Rakuten Web Services Attribution Snippet FROM HERE -->',
  '<a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a>',
  '<!-- Rakuten Web Services Attribution Snippet TO HERE -->',
  '<br>',
  '<!-- Begin Yahoo! JAPAN Web Services Attribution Snippet -->',
  '<span style="margin:15px 15px 15px 15px"><a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a></span>',
  '<!-- End Yahoo! JAPAN Web Services Attribution Snippet -->',
].join("");

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
      {/* APIのクレジット表示(楽天ウェブサービス・Yahoo!デベロッパーネットワークの規定のHTMLをそのまま使う。色などは変えない) */}
      <div className="o-credit" dangerouslySetInnerHTML={{ __html: CREDITS }} />
    </footer>
  );
}
