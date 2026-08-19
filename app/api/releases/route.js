import { NextResponse } from "next/server";

// 発売日カレンダー用プロキシ(サーバー経由でCORS回避)
// 公式ドキュメント準拠: https://openapi.rakuten.co.jp/services/api/BooksGame/Search/20170404
// 必須: applicationId + accessKey
export const revalidate = 1800;

async function fetchBooks(path, params, pages) {
  const all = [];
  let lastError = null;
  for (let p = 1; p <= pages; p++) {
    const qs = new URLSearchParams({
      applicationId: process.env.RAKUTEN_SERVER_APP_ID || process.env.NEXT_PUBLIC_RAKUTEN_APP_ID,
      accessKey: process.env.RAKUTEN_SERVER_ACCESS_KEY || process.env.NEXT_PUBLIC_RAKUTEN_ACCESS_KEY,
      affiliateId: process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID || "",
      format: "json",
      formatVersion: "2",
      hits: "30",
      page: String(p),
      ...params,
    });
    const url = `https://openapi.rakuten.co.jp/services/api/${path}?${qs}`;
    try {
      const res = await fetch(url, { next: { revalidate: 1800 } });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // 404(該当なし)は正常終了扱い、それ以外は中断
        if (res.status === 404) break;
        break;
      }
      const data = await res.json();
      if (data.error) {
        lastError = `${data.error}: ${data.error_description || ""}`;
        break;
      }
      const items = data.Items || data.items || [];
      all.push(...items);
      if (items.length === 0) break;
    } catch (e) {
      lastError = "fetch_failed";
      break;
    }
  }
  return { items: all, error: all.length ? null : lastError };
}

export async function GET() {
  // booksGenreId=006 がゲームのルート。漫画は書籍(001)配下のコミック(001001)
  const [games, comics] = await Promise.all([
    fetchBooks("BooksGame/Search/20170404", { sort: "-releaseDate", booksGenreId: "006" }, 4),
    fetchBooks("BooksBook/Search/20170404", { sort: "-releaseDate", booksGenreId: "001001" }, 5),
  ]);
  return NextResponse.json({
    games: games.items,
    comics: comics.items,
    error: (games.items.length + comics.items.length) === 0 ? (games.error || comics.error || "no_data") : null,
  });
}
