"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { makeSlug } from "../../lib/affiliate";

const yen = (n) => "¥" + Math.round(Number(n)).toLocaleString("ja-JP");
const STORE_LABEL = { rakuten: "楽天", yahoo: "Yahoo!", amazon: "Amazon" };
const STORE_COLOR = { rakuten: "#BF0000", yahoo: "#FF0033", amazon: "#232F3E" };
const MAX_ITEMS = 12;

const card = { background: "#fff", border: "1px solid #DDE9E4", borderRadius: 14, padding: 16 };
const btn = { border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" };

export default function CollectionsPage() {
  const [user, setUser] = useState(null);
  const [collections, setCollections] = useState([]);
  const [editing, setEditing] = useState(null); // {id, slug, title, description, is_public}
  const [items, setItems] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  // 自分のアフィリエイトID(登録すると自分のまとめが自分の成果になる)
  const [aff, setAff] = useState({ rakuten_affiliate_id: "", vc_sid: "", vc_pid: "", amazon_tag: "" });
  const [affMsg, setAffMsg] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  const loadCollections = useCallback(() => {
    if (!user) return;
    supabase.from("collections").select("id, slug, title, description, is_public, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setCollections(data || []));
  }, [user]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  // 素材: お気に入りリスト + 最近見た商品(localStorage)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: wl } = await supabase.from("wishlists").select("jan, name, image").limit(60);
      let vh = [];
      try { vh = JSON.parse(localStorage.getItem("viewHistory") || "[]"); } catch {}
      const seen = new Set();
      const list = [];
      for (const w of wl || []) {
        if (seen.has(w.jan)) continue;
        seen.add(w.jan);
        list.push({ product_key: w.jan, name: w.name, image: w.image, price: null, store: null, url: null, from: "リスト" });
      }
      for (const v of vh) {
        if (!v.key || seen.has(v.key)) continue;
        seen.add(v.key);
        list.push({ product_key: v.key, name: v.name, image: v.image, price: v.price || null, store: v.store || null, url: null, from: "最近見た" });
      }
      setCandidates(list);
    })();
  }, [user]);

  // 自分のアフィリID読み込み
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles_affiliate").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setAff({
        rakuten_affiliate_id: data.rakuten_affiliate_id || "",
        vc_sid: data.vc_sid || "", vc_pid: data.vc_pid || "", amazon_tag: data.amazon_tag || "",
      }); });
  }, [user]);

  const saveAff = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles_affiliate").upsert(
      { user_id: user.id, ...aff, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setAffMsg(error ? "保存に失敗しました: " + error.message : "保存しました。あなたのまとめのリンクがあなたのIDに切り替わります");
  };

  const newCollection = () => {
    setEditing({ id: null, slug: makeSlug(), title: "", description: "", is_public: true });
    setItems([]);
    setMsg("");
  };

  const openCollection = async (c) => {
    setEditing(c);
    setMsg("");
    const { data } = await supabase.from("collection_items")
      .select("position, product_key, name, image, price, store, url, comment")
      .eq("collection_id", c.id).order("position");
    setItems(data || []);
  };

  const addItem = (cand) => {
    if (items.length >= MAX_ITEMS) { setMsg(`商品は最大${MAX_ITEMS}件までです`); return; }
    if (items.some((i) => i.product_key === cand.product_key)) return;
    setItems([...items, { ...cand, comment: "" }]);
    setMsg("");
  };

  const move = (idx, dir) => {
    const next = [...items];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setItems(next);
  };

  const save = async () => {
    if (!user) return;
    if (!editing.title.trim()) { setMsg("タイトルを入力してください"); return; }
    if (items.length === 0) { setMsg("商品を1つ以上追加してください"); return; }
    setBusy(true);
    try {
      let cid = editing.id;
      if (cid) {
        await supabase.from("collections").update({
          title: editing.title.trim(), description: editing.description?.trim() || null,
          is_public: editing.is_public, updated_at: new Date().toISOString(),
        }).eq("id", cid);
        await supabase.from("collection_items").delete().eq("collection_id", cid);
      } else {
        const { data, error } = await supabase.from("collections").insert({
          user_id: user.id, slug: editing.slug, title: editing.title.trim(),
          description: editing.description?.trim() || null, is_public: editing.is_public,
        }).select("id").single();
        if (error) throw error;
        cid = data.id;
        setEditing({ ...editing, id: cid });
      }
      const rows = items.map((it, i) => ({
        collection_id: cid, position: i, product_key: it.product_key, name: it.name,
        image: it.image || null, price: it.price || null, store: it.store || null,
        url: it.url || null, comment: it.comment?.trim() || null,
      }));
      const { error: e2 } = await supabase.from("collection_items").insert(rows);
      if (e2) throw e2;
      setMsg("保存しました");
      loadCollections();
    } catch (e) {
      setMsg("保存に失敗しました: " + (e.message || e));
    }
    setBusy(false);
  };

  const removeCollection = async (c) => {
    if (!window.confirm(`「${c.title}」を削除しますか?`)) return;
    await supabase.from("collections").delete().eq("id", c.id);
    if (editing?.id === c.id) { setEditing(null); setItems([]); }
    loadCollections();
  };

  const shareUrl = editing?.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/c/${editing.slug}` : "";

  if (!user) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 18 }}>商品まとめの作成</h1>
        <p style={{ fontSize: 13, color: "#64748B" }}>この機能を使うにはログインが必要です。</p>
        <a href="/" style={{ fontSize: 13, fontWeight: 700, color: "#16324F" }}>← オウダンに戻る</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 14px 60px" }}>
      <a href="/" style={{ fontSize: 12, fontWeight: 700, color: "#16324F", textDecoration: "none" }}>← オウダンに戻る</a>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "10px 0 4px" }}>🖼 商品まとめを作る</h1>
      <p style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.7 }}>
        お気に入りや最近見た商品を並べて、1枚のページとしてSNSで共有できます(最大{MAX_ITEMS}件)。
      </p>

      {/* 自分のアフィリエイトID */}
      <div style={{ ...card, marginTop: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 6px" }}>あなたのアフィリエイトID(任意)</h2>
        <p style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.7, margin: "0 0 10px" }}>
          登録すると、<b>あなたが作ったまとめのリンクがあなたのIDに切り替わり</b>、成果はあなたに入ります。
          未登録の場合はオウダン運営のIDが使われます。各モールのアフィリエイト規約に従ってご利用ください。
        </p>
        {[
          ["楽天アフィリエイトID", "rakuten_affiliate_id", "例: 1a2b3c4d.5e6f7g8h..."],
          ["バリューコマース sid", "vc_sid", "例: 3518269"],
          ["バリューコマース pid", "vc_pid", "例: 892657152"],
          ["Amazonアソシエイトタグ", "amazon_tag", "例: yourname-22"],
        ].map(([label, key, ph]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
            <span style={{ width: 170, fontSize: 12, fontWeight: 700 }}>{label}</span>
            <input
              value={aff[key]}
              onChange={(e) => setAff({ ...aff, [key]: e.target.value.trim() })}
              placeholder={ph}
              style={{ flex: 1, minWidth: 180, border: "1px solid #CBD5E1", borderRadius: 8, padding: "8px 10px", fontSize: 16 }}
            />
          </div>
        ))}
        <button onClick={saveAff} style={{ ...btn, background: "#16324F", color: "#fff", marginTop: 4 }}>IDを保存</button>
        {affMsg && <div style={{ fontSize: 11.5, color: "#059669", fontWeight: 700, marginTop: 8 }}>{affMsg}</div>}
      </div>

      {/* 既存のまとめ */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>作成したまとめ</h2>
          <button onClick={newCollection} style={{ ...btn, background: "#10B981", color: "#fff", padding: "8px 14px", fontSize: 12 }}>＋ 新しく作る</button>
        </div>
        {collections.length === 0 && <p style={{ fontSize: 12, color: "#64748B", margin: 0 }}>まだありません。</p>}
        {collections.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #EEF2F5" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.title}</div>
              <a href={`/c/${c.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#64748B" }}>/c/{c.slug} ↗</a>
            </div>
            <button onClick={() => openCollection(c)} style={{ ...btn, background: "#fff", color: "#16324F", border: "1px solid #CBD5E1", padding: "6px 12px", fontSize: 12 }}>編集</button>
            <button onClick={() => removeCollection(c)} style={{ ...btn, background: "#fff", color: "#B0483C", border: "1px solid #FCA5A5", padding: "6px 10px", fontSize: 12 }}>削除</button>
          </div>
        ))}
      </div>

      {/* 編集 */}
      {editing && (
        <div style={{ ...card, marginTop: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 10px" }}>{editing.id ? "まとめを編集" : "新しいまとめ"}</h2>
          <input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="タイトル(例: 買ってよかった日用品9選)"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "9px 12px", fontSize: 16, marginBottom: 8 }}
          />
          <textarea
            value={editing.description || ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="ひとこと説明(任意)"
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "9px 12px", fontSize: 14, resize: "vertical" }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, margin: "8px 0" }}>
            <input type="checkbox" checked={editing.is_public} onChange={(e) => setEditing({ ...editing, is_public: e.target.checked })} />
            公開する(URLを知っている人が見られます)
          </label>

          {/* 選んだ商品 */}
          <div style={{ fontSize: 12.5, fontWeight: 800, margin: "10px 0 6px" }}>並べる商品({items.length}/{MAX_ITEMS})</div>
          {items.length === 0 && <p style={{ fontSize: 12, color: "#64748B" }}>下の候補から選んでください。</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {items.map((it, i) => (
              <div key={it.product_key} style={{ border: "1px solid #DDE9E4", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#EAF3F0" }}>
                  {it.image && <img src={it.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />}
                </div>
                <div style={{ padding: 6 }}>
                  <div style={{ fontSize: 10, lineHeight: 1.4, height: "2.8em", overflow: "hidden" }}>{it.name}</div>
                  <input
                    value={it.comment || ""}
                    onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))}
                    placeholder="ひとこと"
                    style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 6px", fontSize: 11, marginTop: 4 }}
                  />
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <button onClick={() => move(i, -1)} style={{ ...btn, flex: 1, background: "#F1F5F9", color: "#475569", padding: "4px 0", fontSize: 11 }}>←</button>
                    <button onClick={() => move(i, 1)} style={{ ...btn, flex: 1, background: "#F1F5F9", color: "#475569", padding: "4px 0", fontSize: 11 }}>→</button>
                    <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ ...btn, background: "#FEE2E2", color: "#B0483C", padding: "4px 8px", fontSize: 11 }}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 候補 */}
          <div style={{ fontSize: 12.5, fontWeight: 800, margin: "14px 0 6px" }}>候補から追加</div>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #EEF2F5", borderRadius: 10 }}>
            {candidates.length === 0 && <p style={{ fontSize: 12, color: "#64748B", padding: 12, margin: 0 }}>リストや閲覧履歴に商品がありません。</p>}
            {candidates.map((c) => (
              <div key={c.product_key} onClick={() => addItem(c)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderBottom: "1px solid #F1F5F9", cursor: "pointer" }}>
                {c.image && <img src={c.image} alt="" style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 6, background: "#EAF3F0" }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>
                    {c.from}{c.price ? ` ・ ${yen(c.price)}` : ""}
                    {c.store ? <span style={{ color: STORE_COLOR[c.store], fontWeight: 700 }}> ・ {STORE_LABEL[c.store]}</span> : null}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: "#10B981", fontWeight: 800 }}>＋</span>
              </div>
            ))}
          </div>

          <button onClick={save} disabled={busy}
            style={{ ...btn, width: "100%", background: busy ? "#94A3B8" : "#16324F", color: "#fff", marginTop: 12 }}>
            {busy ? "保存中…" : "保存する"}
          </button>
          {msg && <div style={{ fontSize: 12, color: msg.includes("失敗") ? "#B0483C" : "#059669", fontWeight: 700, marginTop: 8 }}>{msg}</div>}

          {editing.id && (
            <div style={{ marginTop: 12, padding: 10, background: "#EAF3F0", borderRadius: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 4 }}>共有URL</div>
              <div style={{ fontSize: 11.5, wordBreak: "break-all", color: "#16324F" }}>{shareUrl}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  onClick={async () => {
                    const text = `${editing.title}\n${shareUrl}\n#オウダン #PR`;
                    try {
                      if (navigator.share) await navigator.share({ title: editing.title, text, url: shareUrl });
                      else { await navigator.clipboard.writeText(text); setMsg("共有用テキストをコピーしました"); }
                    } catch {}
                  }}
                  style={{ ...btn, background: "#10B981", color: "#fff", padding: "8px 14px", fontSize: 12 }}
                >📣 共有する</button>
                <a href={`/c/${editing.slug}`} target="_blank" rel="noopener noreferrer"
                  style={{ ...btn, background: "#fff", color: "#16324F", border: "1px solid #CBD5E1", padding: "8px 14px", fontSize: 12, textDecoration: "none" }}>
                  ページを見る ↗
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
