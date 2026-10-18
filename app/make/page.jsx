"use client";
// ============================================================
// 紹介画像メーカー(v26)/make
//   商品を選んで、ひとこと・使い方を書くと、テンプレートの画像(OGP)と紹介ページができる。
//   ・ログインなし。作ったものはURLの中に入る(下書きはこの端末にだけ保存)
//   ・アフィリエイトをしている人は、画像を保存して自分の投稿に使える。
//     各サイトの商品URL(アフィリエイトの付いていない素のURL)も出すので、自分のリンク作成に使える
// ============================================================
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { loadCatalog } from "../../lib/catalog";
import { loadFavorites } from "../../lib/favorites";
import { STORE_ORDER, STORE_META, displayName, yen } from "../../lib/priceView";
import { TEMPLATES, LIMITS, encodeShare, decodeShare, sharePath, plainUrl } from "../../lib/share";
import { SiteHeader, SiteFooter } from "../components/SiteChrome";

const DRAFT = "oudanMakeDraft";
const EMPTY = { tp: "lineup", t: "", s: "", by: "", p: ["", "", ""], i: [] };

function Maker() {
  const sp = useSearchParams();
  const [d, setD] = useState(EMPTY);
  const [cat, setCat] = useState(new Map()); // pkey → { product, offers }
  const [code, setCode] = useState("");
  const [imgKey, setImgKey] = useState(0);
  const [imgState, setImgState] = useState("idle");
  const [tab, setTab] = useState("fav");
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [msg, setMsg] = useState("");
  const loaded = useRef(false);
  const tpl = TEMPLATES.find((t) => t.id === d.tp);

  // はじめに:?from= / ?k= / 下書き の順で読む
  useEffect(() => {
    (async () => {
      const from = sp.get("from");
      const k = sp.get("k");
      let start = null;
      if (from) {
        const got = await decodeShare(from);
        if (got) start = { ...EMPTY, ...got, p: [...got.p, "", "", ""].slice(0, 3) };
      }
      if (!start) {
        try { const s = JSON.parse(localStorage.getItem(DRAFT) || "null"); if (s?.i) start = { ...EMPTY, ...s }; } catch {}
      }
      start = start || EMPTY;
      if (k && !start.i.some((x) => x.k === k)) {
        start = { ...start, i: [...start.i, { k, h: "", c: "" }] };
        if (start.i.length === 1) start.tp = "pick";
      }
      setD(start);
      loaded.current = true;
    })();
  }, [sp]);

  // 下書きを保存
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch {}
  }, [d]);

  // 選んだ商品の情報(名前・画像・価格)を読む
  const keys = d.i.map((x) => x.k).join("|");
  useEffect(() => {
    const need = d.i.map((x) => x.k).filter((k) => !cat.has(k));
    if (!need.length) return;
    loadCatalog(supabase, need).then((m) => setCat((old) => { const n = new Map(old); for (const [k, v] of m) n.set(k, v); return n; })).catch(() => {});
  }, [keys]);

  // 入力が止まったら、URLと画像を作り直す
  useEffect(() => {
    if (!d.i.length) { setCode(""); return; }
    const t = setTimeout(async () => {
      const c = await encodeShare({ ...d, p: d.p.filter(Boolean) });
      if (c !== code) { setCode(c); setImgState("loading"); setImgKey((n) => n + 1); }
    }, 700);
    return () => clearTimeout(t);
  }, [d]);

  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setD((p) => ({ ...p, i: p.i.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  const move = (i, dir) => setD((p) => {
    const a = [...p.i]; const j = i + dir;
    if (j < 0 || j >= a.length) return p;
    [a[i], a[j]] = [a[j], a[i]];
    return { ...p, i: a };
  });
  const remove = (i) => setD((p) => ({ ...p, i: p.i.filter((_, j) => j !== i) }));
  const add = (k) => setD((p) => {
    if (p.i.some((x) => x.k === k)) return p;
    const max = TEMPLATES.find((t) => t.id === p.tp).max;
    if (p.i.length >= max) {
      if (p.tp === "pick") return { ...p, i: [{ k, h: "", c: "" }] };
      flash(`このテンプレートは${max}商品までです`);
      return p;
    }
    return { ...p, i: [...p.i, { k, h: "", c: "" }] };
  });
  const setTpl = (id) => setD((p) => {
    const max = TEMPLATES.find((t) => t.id === id).max;
    return { ...p, tp: id, i: p.i.slice(0, max) };
  });
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  // 商品を探す(オウダンのDBから)
  const search = async (e) => {
    e?.preventDefault();
    const w = q.trim();
    if (!w) return;
    const words = w.split(/\s+/).slice(0, 3);
    let qb = supabase.from("products").select("pkey, name, image").is("merged_into", null);
    for (const x of words) qb = qb.ilike("name", `%${x.replace(/[%_,()]/g, "")}%`);
    const { data } = await qb.order("pop", { ascending: true, nullsFirst: false }).limit(30);
    setFound(data || []);
  };

  const favs = useMemo(() => (typeof window === "undefined" ? [] : loadFavorites().filter((f) => f.inDb !== false)), [tab]);
  const recent = useMemo(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("viewHistory") || "[]").map((v) => ({ pkey: v.key, name: v.name, image: v.image })); } catch { return []; }
  }, [tab]);
  const pickList = tab === "fav" ? favs : tab === "recent" ? recent : found;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://oudan.vercel.app";
  const url = code ? origin + sharePath(code) : "";
  const img = code ? `${sharePath(code)}/opengraph-image?v=${imgKey}` : "";
  const postText = [d.t || (d.i[0] && cat.get(d.i[0].k)?.product?.name?.slice(0, 30)) || "", d.by ? `${d.by}のおすすめ` : "", "#PR"].filter(Boolean).join("\n");
  const copy = async (text, done) => { try { await navigator.clipboard.writeText(text); flash(done); } catch { flash("コピーできませんでした"); } };

  // アフィリエイトの人向け:商品名と、各サイトの素の商品URL
  const plainText = d.i.map((x, n) => {
    const e = cat.get(x.k);
    if (!e) return "";
    const lines = [`${d.tp === "ranking" ? `${n + 1}位 ` : ""}${x.h ? x.h + "|" : ""}${displayName(e.product?.name || "")}`];
    for (const s of STORE_ORDER) {
      const o = e.offers?.[s];
      const u = plainUrl(s, o?.url);
      if (u) lines.push(`${STORE_META[s].short} ${yen(o.price)}:${u}`);
    }
    if (x.c) lines.push(x.c);
    return lines.join("\n");
  }).filter(Boolean).join("\n\n");

  return (
    <main className="o-wrap o-main">
      <h1 className="o-page-title">紹介画像を作る</h1>
      <p className="o-lead">商品を選んで、ひとことや使い方を書くと、3サイトの値段が入った画像と紹介ページができます。ログインはいりません。</p>

      <h2 className="o-h2">1. テンプレート</h2>
      <div className="o-tpls">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="o-tpl" aria-pressed={d.tp === t.id} onClick={() => setTpl(t.id)}>
            <b>{t.label}</b><span>{t.desc}</span>
          </button>
        ))}
      </div>

      <h2 className="o-h2">2. 商品を選ぶ<small>{d.i.length}/{tpl.max}</small></h2>
      <div className="o-box">
        <div className="o-row-scroll" style={{ marginBottom: 10 }}>
          {[["fav", "気になる"], ["recent", "最近見た"], ["search", "探す"]].map(([k, l]) => (
            <button key={k} className="o-chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === "search" && (
          <form onSubmit={search} className="o-inline-search">
            <input className="o-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="商品名(例:アタック 詰め替え)" />
            <button className="o-btn solid" type="submit">探す</button>
          </form>
        )}
        {pickList.length === 0 ? (
          <p className="o-note" style={{ margin: 0 }}>
            {tab === "fav" ? "気になるに入れた商品がここに出ます。商品のハートを押してください。" : tab === "recent" ? "見た商品がここに出ます。" : "商品名で探してください。"}
          </p>
        ) : (
          <div className="o-pick-list">
            {pickList.slice(0, 30).map((it) => {
              const on = d.i.some((x) => x.k === it.pkey);
              return (
                <button key={it.pkey} className="o-pick" aria-pressed={on} onClick={() => (on ? remove(d.i.findIndex((x) => x.k === it.pkey)) : add(it.pkey))}>
                  {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span className="ph" />}
                  <span className="n">{displayName(it.name)}</span>
                  <span className="mark">{on ? "選択中" : "追加"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <h2 className="o-h2">3. 文章を書く</h2>
      <div className="o-box o-make-form">
        <label>タイトル<small>{d.t.length}/{LIMITS.title}</small>
          <input className="o-input" maxLength={LIMITS.title} value={d.t} onChange={(e) => set("t", e.target.value)}
            placeholder={d.tp === "pick" ? "例:部屋干しのニオイがこれで消えた" : "例:乾燥の季節に買ってよかった日用品"} />
        </label>
        {d.tp !== "pick" && (
          <label>サブタイトル<small>{d.s.length}/{LIMITS.sub}</small>
            <input className="o-input" maxLength={LIMITS.sub} value={d.s} onChange={(e) => set("s", e.target.value)} placeholder="例:楽天・Yahoo!・Amazonで値段も比べました" />
          </label>
        )}
        <label>作った人の名前(なくてもよい)<small>{d.by.length}/{LIMITS.by}</small>
          <input className="o-input" maxLength={LIMITS.by} value={d.by} onChange={(e) => set("by", e.target.value)} placeholder="例:@your_account" />
        </label>
        {d.tp === "pick" && (
          <fieldset>
            <legend>おすすめポイント・使い方(画像に大きく出ます)</legend>
            {[0, 1, 2].map((n) => (
              <input key={n} className="o-input" maxLength={LIMITS.point} value={d.p[n] || ""} onChange={(e) => set("p", d.p.map((x, j) => (j === n ? e.target.value : x)))}
                placeholder={["例:詰め替えは1本で約1か月もつ", "例:部屋干しでもニオイが残らない", "例:すすぎ1回でOK、時短になる"][n]} />
            ))}
          </fieldset>
        )}
        {d.i.length === 0 && <p className="o-note" style={{ margin: 0 }}>上で商品を選ぶと、ここに商品ごとの入力欄が出ます。</p>}
        {d.i.map((x, n) => {
          const e = cat.get(x.k);
          return (
            <div key={x.k} className="o-make-item">
              <div className="top">
                {d.tp !== "pick" && <span className={`o-rank${d.tp === "ranking" && n < 3 ? ` r${n + 1}` : ""}`}>{d.tp === "ranking" ? `${n + 1}位` : n + 1}</span>}
                {e?.product?.image ? <img src={e.product.image} alt="" /> : <span className="ph" />}
                <span className="n">{e ? displayName(e.product?.name || "") : "読み込んでいます"}</span>
                <span className="ctl">
                  {d.tp !== "pick" && <><button onClick={() => move(n, -1)} aria-label="上へ">↑</button><button onClick={() => move(n, 1)} aria-label="下へ">↓</button></>}
                  <button onClick={() => remove(n)} aria-label="外す">×</button>
                </span>
              </div>
              <input className="o-input" maxLength={LIMITS.head} value={x.h} onChange={(ev) => setItem(n, "h", ev.target.value)} placeholder={`ひとこと(画像に出ます・${LIMITS.head}字まで)例:コスパ最強`} />
              <textarea className="o-input" rows={3} maxLength={LIMITS.comment} value={x.c} onChange={(ev) => setItem(n, "c", ev.target.value)}
                placeholder={`商品の説明・使い方(紹介ページに出ます・${LIMITS.comment}字まで)`} />
            </div>
          );
        })}
      </div>

      <h2 className="o-h2">4. できあがり</h2>
      {!code ? (
        <div className="o-box o-note">商品を1つ以上選ぶと、ここに画像が出ます。</div>
      ) : (
        <div className="o-box o-share">
          <div className="o-preview">
            <img key={img} src={img} alt="紹介画像のプレビュー" onLoad={() => setImgState("ok")} onError={() => setImgState("error")} />
            {imgState === "loading" && <span className="o-preview-wait">画像を作っています</span>}
          </div>
          {imgState === "error" && <p className="o-note" style={{ margin: 0 }}>画像を作れませんでした。商品を選び直してください。</p>}
          <div className="o-share-btns">
            <a className="o-btn x" target="_blank" rel="noopener noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(postText)}&url=${encodeURIComponent(url)}`}>Xに投稿する</a>
            <a className="o-btn" target="_blank" rel="noopener noreferrer" href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`}>LINEで送る</a>
            <button className="o-btn" onClick={() => copy(url, "紹介ページのリンクをコピーしました")}>リンクをコピー</button>
            <a className="o-btn" href={img} download="oudan-share.png">画像を保存</a>
            <a className="o-btn" href={sharePath(code)} target="_blank" rel="noopener noreferrer">紹介ページを開く</a>
          </div>
          <p className="o-note" style={{ margin: 0 }}>
            リンクをXやLINEに貼ると、この画像が自動で付きます。紹介ページの値段は、開いたときの最新になります。購入リンクはオウダンのアフィリエイトリンク【PR】です。
          </p>
        </div>
      )}
      {msg && <p className="o-flash" role="status">{msg}</p>}

      {code && (
        <>
          <h2 className="o-h2">アフィリエイトをしている方へ</h2>
          <div className="o-box">
            <p style={{ marginTop: 0 }}>
              画像は保存して、ご自分のブログやSNSの投稿に使えます。リンクはご自分のIDで作ってください。
              下に、各サイトの<b>アフィリエイトの付いていない商品URL</b>をまとめました。楽天アフィリエイトやもしもアフィリエイト、Amazonアソシエイトのリンク作成にそのまま貼れます。
            </p>
            <textarea className="o-input o-plain" readOnly rows={8} value={plainText} />
            <button className="o-btn solid" style={{ marginTop: 8 }} onClick={() => copy(plainText, "商品名とURLをコピーしました")}>商品名とURLをコピー</button>
            <ul className="o-rules">
              <li>投稿にはPRであることを書いてください(例:#PR #アフィリエイト)。</li>
              <li>画像の値段は作ったときのものです。画像の下に日時が入っています。値段が変わることも書いておくと安心です。</li>
              <li>Amazonの商品写真は規約のため画像に入れていません。楽天の商品写真には文字を重ねていません。</li>
            </ul>
          </div>
        </>
      )}
      <p style={{ marginTop: 16 }}>
        <button className="o-link" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13 }}
          onClick={() => { if (window.confirm("いまの内容を消して、最初から作りますか?")) { setD(EMPTY); setCode(""); } }}>最初から作り直す</button>
      </p>
    </main>
  );
}

export default function MakePage() {
  return (
    <div>
      <SiteHeader view="make" lede={false} />
      <Suspense fallback={<main className="o-wrap o-main"><p>読み込んでいます</p></main>}>
        <Maker />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
