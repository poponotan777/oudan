// ============================================================
// 紹介ページ(/s/{code})の中身を URL に入れる(v26)
//   ・DBには保存しない(ログインも保存もいらない。荒らしの心配がない)
//   ・中身は JSON → 圧縮(deflate-raw)→ base64url。先頭1文字で形式を表す
//       z… 圧縮あり / j… 圧縮なし(古いブラウザ)
//   ・読むときは必ず sanitize() を通す(長さ・種類・文字を制限)
// ============================================================

export const TEMPLATES = [
  { id: "pick", label: "1商品をしっかり紹介", max: 1, desc: "商品1つ+おすすめポイント3つ" },
  { id: "ranking", label: "ランキング", max: 6, desc: "1位〜6位" },
  { id: "lineup", label: "◯選", max: 6, desc: "順位なしで並べる" },
  { id: "compare", label: "比較表", max: 6, desc: "3サイトの値段を表で" },
];
export const LIMITS = { title: 40, sub: 50, by: 20, head: 18, comment: 140, point: 28, points: 3 };

const clean = (s, n) => String(s ?? "")
  .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, n);
const isKey = (k) => typeof k === "string" && k.length >= 3 && k.length <= 140;

// 画面や画像に出す前に、必ずここを通す
export function sanitize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const tp = TEMPLATES.some((t) => t.id === r.tp) ? r.tp : "lineup";
  const max = TEMPLATES.find((t) => t.id === tp).max;
  const items = (Array.isArray(r.i) ? r.i : [])
    .filter((x) => x && isKey(x.k))
    .slice(0, max)
    .map((x) => ({ k: x.k, h: clean(x.h, LIMITS.head), c: clean(x.c, LIMITS.comment) }));
  return {
    v: 1,
    tp,
    t: clean(r.t, LIMITS.title),
    s: clean(r.s, LIMITS.sub),
    by: clean(r.by, LIMITS.by),
    p: (Array.isArray(r.p) ? r.p : []).map((x) => clean(x, LIMITS.point)).filter(Boolean).slice(0, LIMITS.points),
    i: items,
  };
}

// ---------- base64url ----------
function toB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  const b = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b, "base64"));
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ブラウザで作る
export async function encodeShare(data) {
  const json = new TextEncoder().encode(JSON.stringify(sanitize(data)));
  if (typeof CompressionStream === "function") {
    try {
      const cs = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer());
      return "z" + toB64url(buf);
    } catch {}
  }
  return "j" + toB64url(json);
}

// 読む(壊れていたら null)。inflate を渡さなければブラウザの DecompressionStream を使う
//   サーバーでは lib/shareData.js が node:zlib の inflateRawSync を渡す
export async function decodeShare(code, inflate) {
  try {
    const c = String(code || "");
    if (c.length < 4 || c.length > 6000) return null;
    let bytes = fromB64url(c.slice(1));
    if (c[0] === "z") {
      if (inflate) bytes = inflate(bytes);
      else {
        const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        bytes = new Uint8Array(await new Response(ds).arrayBuffer());
      }
    } else if (c[0] !== "j") return null;
    if (bytes.length > 20000) return null;
    const data = sanitize(JSON.parse(new TextDecoder().decode(bytes)));
    return data.i.length ? data : null;
  } catch {
    return null;
  }
}

export const sharePath = (code) => `/s/${code}`;

// 各サイトの「素の商品URL」(アフィリエイトの人が自分のリンクを作るとき用)
//   楽天:hb.afl の pc= / Yahoo!:バリューコマースの vc_url= / Amazon:tag を外した /dp/ASIN
export function plainUrl(store, url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (store === "rakuten" && /afl\.rakuten\.co\.jp$/.test(u.hostname)) return u.searchParams.get("pc") || u.searchParams.get("m") || null;
    if (store === "yahoo" && /valuecommerce\.com$/.test(u.hostname)) return u.searchParams.get("vc_url") || null;
    if (store === "amazon") {
      const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
      return m ? `https://www.amazon.co.jp/dp/${m[1]}` : `${u.origin}${u.pathname}`;
    }
    return url;
  } catch {
    return null;
  }
}
