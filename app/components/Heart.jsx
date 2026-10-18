"use client";
// 気になる(ハート)ボタン。端末の中だけに保存
import { useEffect, useState } from "react";
import { isFavorite, toggleFavorite, onFavoritesChange } from "../../lib/favorites";

export default function Heart({ item, className = "o-heart", style, label = false }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isFavorite(item?.pkey));
    return onFavoritesChange(() => setOn(isFavorite(item?.pkey)));
  }, [item?.pkey]);
  if (!item?.pkey) return null;
  const icon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.7 3.4 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
  const click = (e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item); };
  if (label) {
    return (
      <button type="button" className="o-btn" aria-pressed={on} onClick={click} style={style}>
        <span style={{ width: 18, height: 18, display: "inline-grid" }} className={on ? "o-heart-on" : ""}>{icon}</span>
        {on ? "気になるに入れました" : "気になるに入れる"}
      </button>
    );
  }
  return (
    <button type="button" className={className} aria-pressed={on} aria-label={on ? "気になるから外す" : "気になるに入れる"} onClick={click} style={style}>
      {icon}
    </button>
  );
}
