"use client";
// トップの「お得・急上昇・おすすめ」(v25)— タップで商品ページ(/p/…)へ
import { useEffect, useState } from "react";
import { productPath, STORE_ORDER, STORE_META, effectivePrice } from "../../lib/priceView";
import Heart from "./Heart";

const num = (n) => Math.round(Number(n)).toLocaleString("ja-JP");

// 3サイトを縦に並べ、いちばん安い行に値札の色を付ける
function Rows({ offers, rates }) {
  const effs = STORE_ORDER.map((s) => (offers[s] ? effectivePrice(s, offers[s], rates) : null)).filter((v) => v != null);
  const best = effs.length ? Math.min(...effs) : null;
  const bestS = STORE_ORDER.find((s) => offers[s] && effectivePrice(s, offers[s], rates) === best);
  return (
    <div className="o-mini-rows">
      {STORE_ORDER.map((s) => {
        const o = offers[s];
        const on = s === bestS;
        return (
          <div key={s} className={on ? "best" : ""}>
            <span className={on ? "" : `s-${s}`} style={{ fontWeight: 900, fontSize: 11 }}>{STORE_META[s].short}</span>
            <span className="o-num" style={{ color: o ? undefined : "var(--ink-3)" }}>{o ? `¥${num(o.price)}` : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

function cheap(offers) {
  const c = STORE_ORDER.filter((s) => offers?.[s]).sort((a, b) => offers[a].price - offers[b].price)[0];
  return c ? { price: offers[c].price, store: c } : {};
}

const TABS = [
  ["deal", "お得", "いつもの値段(90日の中央値)より安くなっているもの"],
  ["trend", "急上昇", "ランキングで急に順位が上がったもの"],
  ["recommend", "定番", "有名ブランドの人気商品で、評価が★4以上のもの"],
];

export default function TopPicks({ rates }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("deal");
  const [all, setAll] = useState(false);
  useEffect(() => {
    fetch("/api/top").then((r) => r.json()).then((d) => {
      setData(d);
      if (!(d.deal || []).length) setTab((d.trend || []).length ? "trend" : "recommend");
    }).catch(() => setData({ deal: [], trend: [], recommend: [] }));
  }, []);
  const full = data?.[tab] || [];
  const SHOW = 8;
  const list = all ? full : full.slice(0, SHOW);
  const desc = TABS.find((t) => t[0] === tab)?.[2];
  return (
    <section>
      <h2 className="o-h2">いま見ておきたいもの</h2>
      <div className="o-row-scroll" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" className="o-chip" aria-pressed={tab === k} onClick={() => { setTab(k); setAll(false); }}>
            {label}{data?.[k]?.length ? <span className="o-num" style={{ marginLeft: 2 }}>{data[k].length}</span> : null}
          </button>
        ))}
      </div>
      <p className="o-note" style={{ margin: "6px 0 10px" }}>{desc}。黄色はポイント込みでいちばん安いサイトです。</p>
      {data === null ? (
        <p className="o-note">読み込んでいます</p>
      ) : list.length === 0 ? (
        <div className="o-box o-note">
          {tab === "deal"
            ? "値段の記録が7日分たまると、ここに並びます。もう少しお待ちください。"
            : "いま出せる商品がありません。毎日5時と17時ごろに更新します。"}
        </div>
      ) : (
        <div className="o-pgrid">
          {list.map((p) => (
            <a key={p.pkey} href={productPath(p.pkey)} className="o-tile">
              {p.image ? <img className="o-tile-img" src={p.image} alt="" loading="lazy" /> : <div className="o-tile-img" />}
              <Heart item={{ pkey: p.pkey, name: p.name, image: p.image, inDb: true, ...cheap(p.offers) }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                <span className={`o-mark ${tab === "trend" ? "hot" : "good"}`}>{p.badge}</span>
                {p.sub && <span className="o-mark flat">{p.sub}</span>}
              </div>
              <div className="o-tile-name">{p.name}</div>
              <Rows offers={p.offers} rates={rates} />
            </a>
          ))}
        </div>
      )}
      {full.length > SHOW && (
        <button className="o-btn block o-picks-more" onClick={() => setAll((v) => !v)}>
          {all ? "閉じる" : `もっと見る(あと${full.length - SHOW}件)`}
        </button>
      )}
    </section>
  );
}
