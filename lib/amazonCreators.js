// ============================================================
// Amazon Creators API(旧PA-APIの後継)呼び出しモジュール
//
// 状態管理:
// - 環境変数 AMAZON_ENABLED が "true" のときだけ動作
// - 資格エラー(AssociateNotEligible / 403)の場合は空配列を返し、
//   アプリ全体は楽天+Yahoo!で正常動作を続ける
//
// 必要な環境変数:
//   AMAZON_ENABLED=true
//   AMAZON_CLIENT_ID=(Creators APIのCredential ID)
//   AMAZON_CLIENT_SECRET=(Creators APIのCredential Secret)
//   AMAZON_PARTNER_TAG=popo-kaiteki-22
//   AMAZON_TOKEN_URL=(既定: https://api.amazon.com/auth/o2/token)
//   AMAZON_API_ENDPOINT=(Creators APIのエンドポイントURL。
//     アソシエイトのCreators APIドキュメント「Using cURL」記載の
//     日本(FE)向けURLを設定。資格取得後に一緒に確認して設定します)
//
// ※エンドポイントURLとリクエスト形式はAmazonのドキュメント更新で
//   変わる可能性があるため、有効化時に公式Docsと突き合わせて
//   最終調整する前提の「仕込みコード」です。
// ============================================================

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60000) return cachedToken;

  const tokenUrl = process.env.AMAZON_TOKEN_URL || "https://api.amazon.com/auth/o2/token";
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMAZON_CLIENT_ID,
      client_secret: process.env.AMAZON_CLIENT_SECRET,
      scope: process.env.AMAZON_SCOPE || "creatorsapi::default",
    }),
  });
  if (!res.ok) {
    console.error("Amazon token error:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

const DEFAULT_ENDPOINT = "https://creatorsapi.amazon/catalog/v1/searchItems";

export function amazonEnabled() {
  return (
    process.env.AMAZON_ENABLED === "true" &&
    !!process.env.AMAZON_CLIENT_ID &&
    !!process.env.AMAZON_CLIENT_SECRET
  );
}

export async function searchAmazon(keyword, hits = 10) {
  if (!amazonEnabled()) return { items: [], status: "disabled" };

  try {
    const token = await getAccessToken();
    if (!token) return { items: [], status: "auth_error" };

    const endpoint = process.env.AMAZON_API_ENDPOINT || DEFAULT_ENDPOINT;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-marketplace": "www.amazon.co.jp",
      },
      body: JSON.stringify({
        // Creators APIはcamelCaseパラメータ
        applicationId: process.env.AMAZON_APPLICATION_ID || "",
        keywords: keyword,
        partnerTag: process.env.AMAZON_PARTNER_TAG,
        partnerType: "Associates",
        marketplace: "www.amazon.co.jp",
        itemCount: hits,
        resources: [
          "itemInfo.title",
          "itemInfo.externalIds",
          "offersV2.listings.price",
          "images.primary.medium",
          "customerReviews.count",
          "customerReviews.starRating",
        ],
      }),
    });

    if (res.status === 403) {
      // 資格未達(AssociateNotEligible)。件数が貯まれば自動で通るようになる
      return { items: [], status: "not_eligible" };
    }
    if (!res.ok) {
      console.error("Amazon API error:", res.status);
      return { items: [], status: "error" };
    }

    const data = await res.json();
    const rawItems = data.searchResult?.items || data.SearchResult?.Items || data.items || data.Items || [];
    const items = rawItems.map((it) => ({
      store: "amazon",
      name: it.itemInfo?.title?.displayValue || it.ItemInfo?.Title?.DisplayValue || "",
      price:
        it.offersV2?.listings?.[0]?.price?.money?.amount ??
        it.OffersV2?.Listings?.[0]?.Price?.Money?.Amount ??
        null,
      shipping: null,
      url: it.detailPageURL || it.DetailPageURL,
      image: it.images?.primary?.medium?.url || it.Images?.Primary?.Medium?.URL || null,
      rating: it.customerReviews?.starRating?.value || it.CustomerReviews?.StarRating?.Value || 0,
      reviews: it.customerReviews?.count || it.CustomerReviews?.Count || 0,
      shop: "Amazon.co.jp",
      jan: it.itemInfo?.externalIds?.eans?.displayValues?.[0] || it.ItemInfo?.ExternalIds?.EANs?.DisplayValues?.[0] || null,
    }));
    return { items: items.filter((i) => i.price != null), status: "ok" };
  } catch (e) {
    console.error("Amazon fetch failed:", e);
    return { items: [], status: "error" };
  }
}
