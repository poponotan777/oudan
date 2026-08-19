"use client";
// ============================================================
// 発売日カレンダー: 楽天ブックスAPI(ゲーム・書籍)から
// 発売予定商品を取得する。エンドポイントは新旧2系統を順に試す
// (楽天API刷新の過渡期のため。両方失敗したら空を返す)
// ============================================================

// ブックス系APIの新パスは /services/api/ 形式(市場APIの /ichibams/api/ とは異なる)
const CANDIDATES = (path) => [
  `https://openapi.rakuten.co.jp/services/api/${path}`,
  `https://openapi.rakuten.co.jp/booksms/api/${path}`,
];

async function fetchBooks(path, params) {
  const qs = new URLSearchParams({
    applicationId: process.env.NEXT_PUBLIC_RAKUTEN_APP_ID,
    accessKey: process.env.NEXT_PUBLIC_RAKUTEN_ACCESS_KEY,
    affiliateId: process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID || "",
    format: "json",
    hits: "20",
    ...params,
  });
  let lastError = "";
  for (const base of CANDIDATES(path)) {
    // 一時的な失敗に備えて各候補2回まで試す
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${base}?${qs}`);
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          break; // 同じURLでの再試行は無意味なので次の候補へ
        }
        const data = await res.json();
        if (data.Items) return { items: data.Items, error: null };
        if (data.error) { lastError = data.error_description || data.error; break; }
      } catch (e) {
        lastError = "接続エラー";
        await new Promise((ok) => setTimeout(ok, 700));
      }
    }
  }
  return { items: [], error: lastError };
}

// 複数ページをまとめて取得(発売日降順は遠い未来から返るため、深めに読む)
async function fetchBooksPages(path, params, pages = 4) {
  const all = [];
  let lastError = null;
  for (let p = 1; p <= pages; p++) {
    const res = await fetchBooks(path, { ...params, page: String(p) });
    if (res.error) lastError = res.error;
    all.push(...res.items);
    if (res.items.length === 0 && p > 1) break;
  }
  return { items: all, error: all.length ? null : lastError };
}

function mapItem(it, kind) {
  const item = it.Item || it;
  return {
    kind,
    title: item.title || "",
    salesDate: item.salesDate || "",
    price: item.itemPrice || item.listPrice || null,
    url: item.affiliateUrl || item.itemUrl || "",
    image: (item.mediumImageUrl || item.mediumImageUrls?.[0] || "").replace("?_ex=120x120", "?_ex=200x200") || null,
    maker: item.hardware || item.publisherName || item.label || "",
  };
}

// 発売予定(近日発売)のゲーム・漫画を取得
// "2026年08月07日" "2026年08月上旬頃" などの日付文字列をDateに変換
function parseSalesDate(str) {
  const m = str.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = m[3] ? parseInt(m[3], 10) : 28; // 日不明なら月末寄り
  return new Date(y, mo - 1, d);
}

export async function fetchUpcomingReleases() {
  // まずサーバープロキシ経由(CORSの影響を受けない)。失敗時のみブラウザから直呼び
  let games = { items: [], error: null };
  let comics = { items: [], error: null };
  try {
    const res = await fetch("/api/releases");
    if (res.ok) {
      const data = await res.json();
      games = { items: data.games || [], error: data.error };
      comics = { items: data.comics || [], error: data.error };
    } else {
      games.error = comics.error = `proxy HTTP ${res.status}`;
    }
  } catch {
    games.error = comics.error = "proxy接続エラー";
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const limit = new Date(now.getTime() + 90 * 86400000); // 今後90日以内のみ
  const items = [
    ...games.items.map((i) => mapItem(i, "game")),
    ...comics.items.map((i) => mapItem(i, "comic")),
  ]
    .filter((i) => i.title && i.salesDate)
    .map((i) => {
      const d = parseSalesDate(i.salesDate);
      return { ...i, date: d, daysLeft: d ? Math.ceil((d - now) / 86400000) : null };
    })
    // 発売済み(7日前まで)〜90日以内。3099年などの仮日付は自動的に除外される
    .filter((i) => i.date && i.daysLeft >= -7 && i.date <= limit)
    .sort((a, b) => a.date - b.date);
  const fetchError = games.error || comics.error;
  return {
    items,
    error: items.length ? null : (fetchError || "period_empty"),
  };
}
