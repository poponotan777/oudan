// ============================================================
// アフィリエイトリンクの差し替え(v13 / コレクション共有用)
//
// 方針:
//  ・既定では運営(オウダン)のアフィリエイトIDを使う
//  ・コレクションの作成者が自分のIDを登録している場合は、そのIDに差し替える
//    → 紹介した本人に成果が入る
//  ・IDが未登録の項目だけ運営IDにフォールバックする(部分的な差し替えも可)
//
// 注意: 各モールの規約上、リンクは「自然な導線」で提示すること。
//       不自然なクリック誘導は3モールとも規約違反になる。
// ============================================================

// 楽天: itemUrl / affiliateUrl の中のアフィリエイトIDを差し替える。
// 楽天のアフィリンクは https://hb.afl.rakuten.co.jp/hgc/<affiliateId>/?pc=<encoded item url>
// の形。作成者IDがある場合は、素の商品URLから作り直すのが最も確実。
export function rakutenLink(rawUrl, affiliateId) {
  if (!rawUrl) return rawUrl;
  // 既にアフィリンクの場合は、中の実URL(pc=)を取り出して素のURLに戻す
  let target = rawUrl;
  try {
    const u = new URL(rawUrl);
    if (/hb\.afl\.rakuten\.co\.jp/.test(u.hostname)) {
      const pc = u.searchParams.get("pc");
      if (pc) target = pc;
    }
  } catch {
    return rawUrl;
  }
  if (!affiliateId) return target; // IDが無ければ素のURL(成果なし)
  return `https://hb.afl.rakuten.co.jp/hgc/${affiliateId}/?pc=${encodeURIComponent(target)}`;
}

// Yahoo!: バリューコマースのリファラルURLで包む。
// 既にVCリンクなら中のvc_urlを取り出してから作り直す。
export function yahooLink(rawUrl, sid, pid) {
  if (!rawUrl) return rawUrl;
  let target = rawUrl;
  try {
    const u = new URL(rawUrl);
    if (/valuecommerce\.com/.test(u.hostname)) {
      const vc = u.searchParams.get("vc_url");
      if (vc) target = vc;
    }
  } catch {
    return rawUrl;
  }
  if (!sid || !pid) return target;
  return `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${sid}&pid=${pid}&vc_url=${encodeURIComponent(target)}`;
}

// Amazon: タグを差し替える(既存のtagパラメータは除去してから付け直す)
export function amazonLink(rawUrl, tag) {
  if (!rawUrl) return rawUrl;
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete("tag");
    if (tag) u.searchParams.set("tag", tag);
    return u.toString();
  } catch {
    return rawUrl;
  }
}

// 1商品ぶんのリンクを、使うアフィリエイト設定に応じて組み立てる。
// aff: { rakuten_affiliate_id, vc_sid, vc_pid, amazon_tag } (作成者の設定)
// fallback: 同じ形の運営既定値
export function buildItemLink(item, aff, fallback) {
  const pick = (k) => (aff && aff[k]) || (fallback && fallback[k]) || null;
  const url = item.url || "";
  if (item.store === "rakuten") return rakutenLink(url, pick("rakuten_affiliate_id"));
  if (item.store === "yahoo") return yahooLink(url, pick("vc_sid"), pick("vc_pid"));
  if (item.store === "amazon") return amazonLink(url, pick("amazon_tag"));
  return url;
}

// 共有URL用の短いslugを作る
export function makeSlug() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
