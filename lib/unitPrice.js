// ============================================================
// 商品名から容量・数量を抽出して単価を計算する
// 例: 「シャンプー 480ml」→ 1mlあたり◯円
//     「トイレットペーパー 12ロール×4パック」→ 1ロールあたり◯円
// ============================================================

const UNIT_DEFS = [
  { re: /(\d+(?:\.\d+)?)\s*(?:ml|mL|ML|ミリリットル)/, unit: "ml", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:l|L|リットル)(?![a-zA-Z])/, unit: "ml", factor: 1000 },
  { re: /(\d+(?:\.\d+)?)\s*(?:kg|KG|キログラム)/, unit: "g", factor: 1000 },
  { re: /(\d+(?:\.\d+)?)\s*(?:g|G|グラム)(?![a-zA-Z])/, unit: "g", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:枚)/, unit: "枚", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:ロール)/, unit: "ロール", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:錠|粒)/, unit: "錠", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:包|袋)/, unit: "包", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:回分)/, unit: "回分", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:本)/, unit: "本", factor: 1 },
  { re: /(\d+(?:\.\d+)?)\s*(?:個)/, unit: "個", factor: 1 },
];

// 「×3」「x2個セット」「3個セット」などの倍数を検出。
// さらに「1L 15本」「500ml 24本入」のように、単位容量のあとに
// 本数だけが書かれている形も倍数として拾う(容量違いの誤判定を防ぐため)。
// ※ 最初にマッチした1つだけを使う。同じ数字を二重に掛けないため。
function detectMultiplier(name) {
  const m =
    name.match(/[×x✕]\s*(\d+)/) ||
    name.match(/(\d+)\s*(?:個セット|本セット|袋セット|パック|セット)/) ||
    name.match(/(\d+)\s*(?:本|個|袋|箱|缶|ロール|枚|包|パック|ケース)\s*(?:入り|入)?/);
  return m ? parseInt(m[1], 10) : 1;
}

// 商品名から {amount, unit} を抽出。見つからなければ null
export function parseQuantity(name) {
  if (!name) return null;
  for (const def of UNIT_DEFS) {
    const m = name.match(def.re);
    if (m) {
      const base = parseFloat(m[1]) * def.factor;
      // 二重カウント防止: 「2本セット」の「2本」が数量と倍数の両方に
      // マッチしてしまうため、数量にマッチした部分を除いた残りから倍数を探す
      const rest = name.replace(m[0], " ");
      const mult = detectMultiplier(rest);
      return { amount: base * mult, unit: def.unit };
    }
  }
  return null;
}

// 価格と商品名から単価文字列を返す(例: "1mlあたり1.3円")
export function unitPriceLabel(price, name) {
  const q = parseQuantity(name);
  if (!q || q.amount <= 0) return null;
  const per = price / q.amount;
  const shown =
    per >= 10 ? Math.round(per) : Math.round(per * 100) / 100;
  return { label: `1${q.unit}あたり ${shown}円`, per, unit: q.unit, amount: q.amount };
}

// ============================================================
// ロット数(何個セットか)— v28
//   同じJANでも「1個」と「3個セット」は値段が3倍違う。比べるときは必ずそろえる
//   商品名から「×3」「3個セット」「24本入」「セット(2袋)」などを読む。書いていなければ 1
// ============================================================
const Z2H = (s) => String(s || "")
  .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  .replace(/[ＸｘX✕✖＊*]/g, (c) => (c === "X" ? "X" : "×"));
const NOT_COUNT = "(?![\\d.])(?!\\s*(?:ml|mL|ML|l|L|g|G|kg|cm|mm|m|mAh|W|V|GB|TB|インチ|号|枚入|ロール|錠|粒|回|日|年|ヶ月|か月|mg|％|%))";
// 後読み (?<! ) が使えない古いブラウザ(iOS 16.3以前など)でも読み込めるよう、文字列から作る
function mkRe(src) {
  try { return new RegExp(src); } catch { return new RegExp(src.replace(/\(\?<[!=][^)]*\)/g, "")); }
}
const NUM = "(?<![\\d.])(\\d{1,3})";
const LOT_RES = [
  `(?:×|(?<![A-Za-z0-9])x)\\s*(\\d{1,3})${NOT_COUNT}\\s*(?:個|本|袋|箱|缶|パック|セット|ケース|点|組|コ)?`,
  `${NUM}\\s*(?:個|本|袋|箱|缶|パック|点|コ|組)?\\s*セット`,
  `セット\\s*[(（]?\\s*${NUM}\\s*(?:個|本|袋|箱|缶|パック)`,
  `${NUM}\\s*(?:個|本|袋|箱|缶|パック|コ)\\s*(?:入り|入|組)`,
  `${NUM}\\s*(?:個|本|袋|箱|缶)?\\s*パック`,
  `${NUM}\\s*(?:個|本|袋|箱|缶|パック)\\s*(?:まとめ買い|ケース)`,
  `(?:まとめ買い|ケース)\\s*[(（]?\\s*${NUM}\\s*(?:個|本|袋|箱|缶|パック)`,
].map(mkRe);
export function lotCount(name) {
  const s = Z2H(name);
  for (const re of LOT_RES) {
    const m = s.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 200) return n;
    }
  }
  return 1;
}
// 2つの商品名のロットが同じか。数が違っても、中身の総量(ml・g・個…)が同じなら同じとみなす
export function lotCompatible(a, b) {
  const la = lotCount(a), lb = lotCount(b);
  if (la === lb) return true;
  const qa = parseQuantity(Z2H(a)), qb = parseQuantity(Z2H(b));
  if (qa && qb && qa.unit === qb.unit && qa.amount > 0 && qb.amount > 0) {
    const r = qa.amount / qb.amount;
    if (r >= 0.9 && r <= 1.1) return true;
  }
  return false;
}
// JANを商品キーにするとき、セット品は別のキーにする(例:4901301000001x3)
export function janKey(jan, name) {
  const n = lotCount(name);
  return n > 1 ? `${jan}x${n}` : jan;
}
