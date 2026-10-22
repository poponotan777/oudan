// ============================================================
// OGP画像(1200×630)の部品(v21)
//   ・日本語フォント:Google Fonts から必要な文字だけ取得 → 失敗したら同梱フォント(assets/fonts)
//   ・商品画像は先に読み込んで埋め込む(失敗しても画像なしで描く)
//   ・楽天の規約(商品画像に文字を重ねない)に合わせ、文字はすべて画像の「外」に置く
//   ・Amazonの商品画像は加工・保存できないため使わない(代わりにアイコン)
//   ・価格は必ず3サイト(楽天・Yahoo!・Amazon)を並べ、最安を強調する
// ============================================================

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };

// サイトと同じ「元気な青+値札の黄色」
const C = {
  ink: "#1F2350", sub: "#4A4E78", bg: "#F1F4FF", card: "#FFFFFF", line: "#DDE3FA",
  blue: "#2346FF", violet: "#6A3DFF", tag: "#FFD84D", tagDeep: "#F2B705", red: "#E8452C", mint: "#1E9E62",
  rakuten: "#BF0000", yahoo: "#E60033", amazon: "#232F3E", gray: "#B8BED6",
};
const GRAD = `linear-gradient(110deg, ${C.blue} 0%, ${C.violet} 100%)`;
const STORES = [["rakuten", "楽天"], ["yahoo", "Yahoo!"], ["amazon", "Amazon"]];
const yen = (n) => (n == null ? "—" : "¥" + Math.round(n).toLocaleString("ja-JP"));
const num = (n) => (n == null ? "—" : Math.round(n).toLocaleString("ja-JP"));

// ---------- フォント ----------
let localFont = null;
async function loadLocalFont() {
  if (!localFont) localFont = await readFile(join(process.cwd(), "assets/fonts/NotoSansJP-Bold-subset.ttf"));
  return localFont;
}
async function loadGoogleFont(text) {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const css = await (await fetch(url, { signal: ctrl.signal })).text();
    const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!m) return null;
    const res = await fetch(m[1], { signal: ctrl.signal });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
export async function ogFonts(text) {
  const FIXED = "0123456789¥,.%・〜()?…位選楽天Yahoo!Amazon最安時点の価格変動しますPR#oudanvercelappオウダンどこがいちばん安いふだんより3か月で最安値サイト比較のおすすめ画像なしTOP比較商品。変わることがあり、購入時は各表示適用されます";
  const uniq = [...new Set(String(text || "") + FIXED)].join("");
  let data = process.env.OG_FONT_LOCAL_ONLY ? null : await loadGoogleFont(uniq);
  if (!data) data = await loadLocalFont();
  return [{ name: "NotoJP", data, weight: 700, style: "normal" }];
}

// ---------- 商品画像(先に読み込んで埋め込む) ----------
export async function imageData(url) {
  if (!url || /media-amazon|images-amazon|ssl-images-amazon/.test(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!/image\/(jpeg|jpg|png|gif)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1500000) return null;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- 文字を枠に収める ----------
// 楽天などの商品名に入っている &amp; などを元の文字に戻す
export function decodeEntities(t) {
  return String(t || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
// 文字の幅(全角=1)。半角は字によって幅が違うので、少し広めに見積もる
const cw = (ch) => (/[A-Z0-9]/.test(ch) ? 0.66 : /[a-z]/.test(ch) ? 0.58 : /[\x20-\x7E]/.test(ch) ? 0.45 : /[｡-ﾟ]/.test(ch) ? 0.55 : 1);
// 幅 width・lines 行に収まるように切る(あふれたら …)。実際の折り返しより少し手前で切る
export function fit(text, fontSize, width, lines = 1) {
  const per = (width / fontSize) * 0.94;
  let w = 0, line = 1, out = "";
  const src = decodeEntities(text).replace(/\s+/g, " ").trim();
  for (const ch of src) {
    const c = cw(ch);
    if (w + c > per) {
      if (line >= lines) return out.replace(/\s+$/, "") + "…";
      line++; w = 0;
    }
    w += c; out += ch;
  }
  return out;
}
const clip = (s, n) => { const t = decodeEntities(s); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
// 決まった高さの箱(はみ出しても次の部品に重ならない)
function Box({ h, w, children, style }) {
  const st = { display: "flex", height: h, overflow: "hidden", flexShrink: 0, ...style };
  if (w != null) st.width = w;
  return <div style={st}>{children}</div>;
}

// ---------- 飾り ----------
const SHADOW = "0 10px 24px rgba(35,70,255,0.16)";
const BG = "linear-gradient(160deg, #EAF0FF 0%, #F6F2FF 55%, #FFF6D6 100%)";
const MEDAL = [
  { bg: "linear-gradient(135deg, #FFE27A 0%, #F2B705 55%, #C98A00 100%)", ring: "#F2B705", fg: "#5A3B00" },
  { bg: "linear-gradient(135deg, #F4F6FA 0%, #C3C9D6 55%, #8F97A8 100%)", ring: "#AEB5C4", fg: "#2F3646" },
  { bg: "linear-gradient(135deg, #F7C99A 0%, #D18A45 55%, #9C5B1E 100%)", ring: "#C9813F", fg: "#3F2306" },
];
// ヘッダーの奥の丸い光(にぎやかさ)
function Glows() {
  return (
    <>
      <div style={{ position: "absolute", display: "flex", width: 340, height: 340, borderRadius: 170, background: "rgba(255,255,255,0.10)", top: -170, right: 120 }} />
      <div style={{ position: "absolute", display: "flex", width: 200, height: 200, borderRadius: 100, background: "rgba(255,216,77,0.22)", top: -60, right: -40 }} />
      <div style={{ position: "absolute", display: "flex", width: 120, height: 120, borderRadius: 60, background: "rgba(255,255,255,0.08)", bottom: -70, left: 380 }} />
    </>
  );
}

// ---------- 共通パーツ ----------
function ImgBox({ src, size, radius = 16 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, background: "#fff", borderRadius: radius, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: "inset 0 0 0 2px #E3E8FB" }}>
      {src ? <img src={src} width={size - 14} height={size - 14} style={{ objectFit: "contain" }} /> : <div style={{ fontSize: Math.max(13, size * 0.11), color: C.gray, display: "flex" }}>画像なし</div>}
    </div>
  );
}
function cheapestOf(prices) {
  let best = null;
  for (const [s] of STORES) if (prices?.[s] != null && (best == null || prices[s] < prices[best])) best = s;
  return best;
}
function Footer({ date }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 40px", height: 44, background: C.ink, color: "#fff", fontSize: 18, flexShrink: 0 }}>
      <div style={{ display: "flex", color: C.tag, fontSize: 20 }}>オウダン</div>
      <div style={{ display: "flex", marginLeft: 16, opacity: 0.9, fontSize: 16 }}>{date ? `${date}時点の価格。変わることがあり、購入時は各サイトの表示価格が適用されます` : "価格は変わることがあり、購入時は各サイトの表示価格が適用されます"}</div>
      <div style={{ display: "flex", marginLeft: "auto", border: "2px solid #fff", borderRadius: 6, padding: "0 10px", fontSize: 16 }}>PR</div>
    </div>
  );
}

// 3サイトの値段(縦に3行・高さ固定)。最安は金色の札
function PriceRows({ prices, fs, rowH, width }) {
  const best = cheapestOf(prices);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width }}>
      {STORES.map(([s, label]) => {
        const on = s === best;
        return (
          <Box key={s} h={rowH} style={{ alignItems: "center", justifyContent: "space-between", padding: "0 10px", borderRadius: 9, ...(on ? { backgroundImage: "linear-gradient(90deg, #FFE680 0%, #FFD84D 100%)", boxShadow: "0 3px 0 #E0A800" } : { background: "#F3F5FD" }) }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: fs * 0.68, color: on ? C.ink : C[s] }}>
              {label}
              {on && <div style={{ display: "flex", marginLeft: 6, fontSize: fs * 0.56, color: "#fff", background: C.ink, borderRadius: 5, padding: "0 6px" }}>最安</div>}
            </div>
            <div style={{ display: "flex", fontSize: fs, color: prices?.[s] != null ? C.ink : C.gray }}>{yen(prices?.[s])}</div>
          </Box>
        );
      })}
    </div>
  );
}

function Header({ title, subtitle, kicker, by, kind }) {
  const tfs = title.length > 22 ? 42 : 50;
  return (
    <div style={{ display: "flex", position: "relative", overflow: "hidden", flexDirection: "column", backgroundImage: GRAD, padding: "20px 40px 18px", color: "#fff", flexShrink: 0 }}>
      <Glows />
      <div style={{ display: "flex", alignItems: "center", gap: 12, height: 34 }}>
        {kicker && <div style={{ display: "flex", background: C.tag, color: C.ink, fontSize: 22, padding: "2px 14px", borderRadius: 8, boxShadow: "0 3px 0 #E0A800" }}>{kicker}</div>}
        {kind && <div style={{ display: "flex", fontSize: 20, border: "2px solid rgba(255,255,255,0.7)", borderRadius: 8, padding: "0 10px" }}>{kind}</div>}
        {by && <div style={{ display: "flex", fontSize: 20 }}>{clip(by, 20)}のおすすめ</div>}
        <div style={{ display: "flex", marginLeft: "auto", fontSize: 19, opacity: 0.92 }}>楽天・Yahoo!・Amazon 3サイト比較</div>
      </div>
      <Box h={Math.round(tfs * 1.3)} style={{ fontSize: tfs, marginTop: 6, textShadow: "0 3px 0 rgba(20,20,80,0.25)" }}>{fit(title, tfs, 1120, 1)}</Box>
      {subtitle && <Box h={30} style={{ fontSize: 22, opacity: 0.95, marginTop: 2 }}>{fit(subtitle, 22, 1120, 1)}</Box>}
    </div>
  );
}

// ---------- まとめ(ランキング・◯選・比較表) ----------
//  data: { title, subtitle, by, template, date, items: [{ name, head, image, prices }] }
export function CollectionOG({ data }) {
  const items = (data.items || []).slice(0, 6);
  const n = Math.max(1, items.length);
  const tpl = data.template || "ranking";
  const kicker = tpl === "ranking" ? `TOP${n}` : tpl === "lineup" ? `${n}選` : "比較";
  const kind = tpl === "ranking" ? "ランキング" : tpl === "lineup" ? "おすすめ" : "3サイト最安比較";
  const title = data.title || "おすすめ";
  const headerH = 20 + 34 + 6 + Math.round((title.length > 22 ? 42 : 50) * 1.3) + (data.subtitle ? 32 : 0) + 18;
  const bodyH = 630 - 44 - headerH;

  let body;
  if (tpl === "compare") {
    const headH = 36;
    const pad = 14;
    const rowH = Math.floor((bodyH - 28 - headH - pad) / n);
    const img = Math.min(rowH - 10, 86);
    const fs = rowH >= 80 ? 21 : rowH >= 60 ? 18 : 15;
    const colW = 150;
    const tableW = 1200 - 72;
    const nameW = tableW - pad * 2 - (img + 14) - colW * 3 - 24;
    const lines = rowH >= 56 ? 2 : 1;
    body = (
      <div style={{ display: "flex", padding: "14px 36px", height: bodyH }}>
        <div style={{ display: "flex", flexDirection: "column", width: tableW, background: "#fff", borderRadius: 20, boxShadow: SHADOW, padding: `6px ${pad}px ${pad}px`, overflow: "hidden" }}>
          <Box h={headH} style={{ alignItems: "center", fontSize: 18, color: C.sub }}>
            <div style={{ display: "flex", width: img + 14 + nameW + 24 }}>商品</div>
            {STORES.map(([s, l]) => (
              <div key={s} style={{ display: "flex", width: colW, justifyContent: "center" }}>
                <div style={{ display: "flex", color: "#fff", background: C[s], borderRadius: 6, padding: "0 10px", fontSize: 16 }}>{l}</div>
              </div>
            ))}
          </Box>
          {items.map((it, i) => {
            const best = cheapestOf(it.prices);
            const subFs = Math.round(fs * 0.78);
            return (
              <Box key={i} h={rowH} style={{ alignItems: "center", borderTop: `2px solid ${C.line}` }}>
                <div style={{ display: "flex", width: img + 14 }}><ImgBox src={it.image} size={img} radius={10} /></div>
                <div style={{ display: "flex", flexDirection: "column", width: nameW, marginRight: 24, justifyContent: "center" }}>
                  {it.head ? (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <Box h={Math.round(fs * 1.3) + 2} style={{ fontSize: fs, color: C.blue }}>{fit(it.head, fs, nameW, 1)}</Box>
                      <Box h={Math.round(subFs * 1.35) + 2} style={{ fontSize: subFs, color: C.sub }}>{fit(it.name, subFs, nameW, 1)}</Box>
                    </div>
                  ) : (
                    <Box h={Math.round(fs * 1.3) * lines + 4} style={{ fontSize: fs, color: C.ink, lineHeight: 1.3 }}>{fit(it.name, fs, nameW, lines)}</Box>
                  )}
                </div>
                {STORES.map(([s]) => (
                  <div key={s} style={{ display: "flex", width: colW, justifyContent: "center" }}>
                    <div style={{ display: "flex", fontSize: fs + 3, padding: "3px 10px", borderRadius: 9, color: it.prices?.[s] == null ? C.gray : C.ink, ...(s === best ? { background: C.tag, boxShadow: "0 3px 0 #E0A800" } : {}) }}>
                      {yen(it.prices?.[s])}
                    </div>
                  </div>
                ))}
              </Box>
            );
          })}
        </div>
      </div>
    );
  } else {
    const gap = 14;
    const cardW = Math.floor((1200 - 72 - gap * (n - 1)) / n);
    const innerW = cardW - 24;
    const cardH = bodyH - 28;
    // 上から:順位・画像・ひとこと(1行)・商品名(2行)・値段(3行)。高さはすべて固定
    const priceFs = n <= 2 ? 26 : n === 3 ? 23 : n === 4 ? 20 : 17;
    const rowH = Math.round(priceFs * 1.45);
    const priceH = rowH * 3 + 8 + 3;
    const headFs = n <= 3 ? 22 : n === 4 ? 19 : 16;
    const nameFs = n <= 3 ? 17 : n === 4 ? 15 : 13;
    const headH = items.some((x) => x.head) ? Math.round(headFs * 1.35) + 2 : 0;
    const nameH = Math.round(nameFs * 1.35) * 2 + 6;
    const badgeH = tpl === "ranking" ? 38 : 30;
    const fixed = badgeH + 8 + headH + nameH + priceH + 8 * 3 + 24;
    const img = Math.max(60, Math.min(innerW, cardH - fixed));
    body = (
      <div style={{ display: "flex", padding: "14px 36px", gap, height: bodyH }}>
        {items.map((it, i) => {
          const m = tpl === "ranking" ? MEDAL[i] : null;
          return (
            <div key={i} style={{ display: "flex", position: "relative", flexDirection: "column", alignItems: "center", width: cardW, height: cardH, background: C.card, borderRadius: 20, padding: 12, boxShadow: SHADOW, border: m && i === 0 ? `4px solid ${m.ring}` : "4px solid transparent" }}>
              <Box h={badgeH} w={innerW} style={{ alignItems: "center", gap: 8 }}>
                {tpl === "ranking" ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 74, height: 38, borderRadius: 19, backgroundImage: m ? m.bg : GRAD, color: m ? m.fg : "#fff", fontSize: 22, boxShadow: "0 3px 0 rgba(0,0,0,0.15)" }}>
                    <div style={{ display: "flex", fontSize: 26 }}>{i + 1}</div><div style={{ display: "flex", fontSize: 17, marginLeft: 1 }}>位</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 15, backgroundImage: GRAD, color: "#fff", fontSize: 17 }}>{i + 1}</div>
                )}
                {tpl === "ranking" && i === 0 && innerW >= 250 && <div style={{ display: "flex", fontSize: 15, color: "#8A5A00", background: "#FFF1BF", borderRadius: 6, padding: "1px 8px" }}>いちばんのおすすめ</div>}
              </Box>
              <div style={{ display: "flex", marginTop: 8 }}><ImgBox src={it.image} size={img} radius={14} /></div>
              {headH > 0 && <Box h={headH} w={innerW} style={{ fontSize: headFs, color: C.blue, marginTop: 8 }}>{it.head ? fit(it.head, headFs, innerW, 1) : ""}</Box>}
              <Box h={nameH} w={innerW} style={{ fontSize: nameFs, color: C.ink, lineHeight: 1.35, marginTop: headH ? 2 : 8 }}>{fit(it.name, nameFs, innerW, 2)}</Box>
              <div style={{ display: "flex", marginTop: "auto" }}><PriceRows prices={it.prices} fs={priceFs} rowH={rowH} width={innerW} /></div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", backgroundImage: BG, fontFamily: "NotoJP" }}>
      <Header title={title} subtitle={data.subtitle || ""} kicker={kicker} kind={kind} by={data.by || ""} />
      {body}
      <Footer date={data.date} />
    </div>
  );
}

// ---------- 商品ページ(1商品・3サイト比較) ----------
//  data: { name, image, prices, date, off, lowest }
export function ProductOG({ data }) {
  const best = cheapestOf(data.prices);
  const name = fit(data.name, 32, 700, 2);
  return (
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", backgroundImage: BG, fontFamily: "NotoJP" }}>
      <div style={{ display: "flex", position: "relative", overflow: "hidden", alignItems: "center", backgroundImage: GRAD, color: "#fff", padding: "0 40px", height: 68, flexShrink: 0 }}>
        <Glows />
        <div style={{ display: "flex", fontSize: 30, textShadow: "0 3px 0 rgba(20,20,80,0.25)" }}>どこがいちばん安い?</div>
        <div style={{ display: "flex", marginLeft: 16, fontSize: 20, opacity: 0.92 }}>楽天・Yahoo!・Amazon 3サイト比較</div>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "22px 40px 22px", gap: 30, alignItems: "center" }}>
        <div style={{ display: "flex", padding: 14, background: "#fff", borderRadius: 30, boxShadow: SHADOW }}>
          <ImgBox src={data.image} size={350} radius={22} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 712, justifyContent: "center" }}>
          <Box h={Math.round(32 * 1.32) * 2 + 6} style={{ fontSize: 32, color: C.ink, lineHeight: 1.32 }}>{name}</Box>
          <Box h={46} style={{ gap: 10, marginTop: 10, alignItems: "center" }}>
            {data.off > 0 && <div style={{ display: "flex", background: C.red, color: "#fff", fontSize: 26, padding: "2px 16px", borderRadius: 10, boxShadow: "0 3px 0 #B52F1A" }}>ふだんより{data.off}%安い</div>}
            {data.lowest && <div style={{ display: "flex", background: C.mint, color: "#fff", fontSize: 24, padding: "2px 16px", borderRadius: 10, boxShadow: "0 3px 0 #13744A" }}>3か月で最安値</div>}
          </Box>
          {best && (
            <div style={{ display: "flex", position: "relative", alignItems: "center", marginTop: 14, backgroundImage: "linear-gradient(120deg, #FFF0A8 0%, #FFD84D 60%, #FFC633 100%)", borderRadius: 22, padding: "10px 26px", height: 132, boxShadow: "0 6px 0 #E0A800, 0 14px 28px rgba(224,168,0,0.35)" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 22, color: C.ink, background: "#fff", borderRadius: 999, padding: "0 12px", alignSelf: "flex-start" }}>いちばん安い</div>
                <div style={{ display: "flex", fontSize: 34, color: C[best], marginTop: 6 }}>{STORES.find((x) => x[0] === best)[1]}</div>
              </div>
              <div style={{ display: "flex", marginLeft: "auto", alignItems: "baseline", color: C.ink }}>
                <div style={{ display: "flex", fontSize: 42 }}>¥</div>
                <div style={{ display: "flex", fontSize: 92, lineHeight: 1 }}>{num(data.prices[best])}</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
            {STORES.filter(([s]) => s !== best).map(([s, l]) => (
              <div key={s} style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", padding: "10px 18px", borderRadius: 14, background: "#fff", boxShadow: SHADOW }}>
                <div style={{ display: "flex", fontSize: 24, color: C[s] }}>{l}</div>
                <div style={{ display: "flex", fontSize: 32, color: data.prices?.[s] == null ? C.gray : C.ink }}>{yen(data.prices?.[s])}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer date={data.date} />
    </div>
  );
}

// ---------- 1商品をしっかり紹介 ----------
//  data: { title, by, date, item: { name, image, head, prices }, points: [..] }
export function PickOG({ data }) {
  const it = data.item || {};
  const best = cheapestOf(it.prices);
  const pts = (data.points || []).slice(0, 3);
  const title = data.title || it.head || it.name || "";
  return (
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", backgroundImage: BG, fontFamily: "NotoJP" }}>
      <div style={{ display: "flex", position: "relative", overflow: "hidden", alignItems: "center", backgroundImage: GRAD, color: "#fff", padding: "0 40px", gap: 16, height: 88, flexShrink: 0 }}>
        <Glows />
        <div style={{ display: "flex", background: C.tag, color: C.ink, fontSize: 22, padding: "3px 14px", borderRadius: 8, flexShrink: 0, boxShadow: "0 3px 0 #E0A800" }}>{data.by ? `${clip(data.by, 14)}のおすすめ` : "おすすめ"}</div>
        <Box h={56} w={840} style={{ fontSize: 40, alignItems: "center", textShadow: "0 3px 0 rgba(20,20,80,0.25)" }}>{fit(title, 40, 840, 1)}</Box>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "20px 40px 20px", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 330, padding: 12, background: "#fff", borderRadius: 26, boxShadow: SHADOW, gap: 8 }}>
          <ImgBox src={it.image} size={306} radius={18} />
          <Box h={56} w={306} style={{ fontSize: 17, color: C.sub, lineHeight: 1.45 }}>{fit(it.name, 17, 306, 2)}</Box>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 762 }}>
          {pts.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", borderRadius: 16, padding: "0 16px", height: 66, marginBottom: 10, boxShadow: SHADOW }}>
              <div style={{ display: "flex", width: 42, height: 42, borderRadius: 21, backgroundImage: GRAD, color: "#fff", fontSize: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <Box h={40} w={670} style={{ fontSize: 28, color: C.ink, alignItems: "center" }}>{fit(p, 28, 670, 1)}</Box>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
            {STORES.map(([s, l]) => {
              const on = s === best;
              return (
                <div key={s} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "8px 16px", borderRadius: 16, ...(on ? { backgroundImage: "linear-gradient(120deg, #FFF0A8 0%, #FFD84D 70%)", boxShadow: "0 5px 0 #E0A800" } : { background: "#fff", boxShadow: SHADOW }) }}>
                  <div style={{ display: "flex", fontSize: 20, color: on ? C.ink : C[s] }}>{l}{on ? " いちばん安い" : ""}</div>
                  <div style={{ display: "flex", fontSize: on ? 42 : 32, color: it.prices?.[s] == null ? C.gray : C.ink }}>{yen(it.prices?.[s])}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Footer date={data.date} />
    </div>
  );
}

// 取得時刻の幅「10/22 05:10〜20:15」(画像の中の値段がいつの時点か)
export function rangeStamp(isos) {
  const ts = (isos || []).map((x) => Date.parse(x)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ts.length) return jstStamp();
  const a = jstStamp(new Date(ts[0])), b = jstStamp(new Date(ts[ts.length - 1]));
  if (a === b) return a;
  return a.split(" ")[0] === b.split(" ")[0] ? `${a}〜${b.split(" ")[1]}` : `${a}〜${b}`;
}

// 「10/17 17:05」
export function jstStamp(d = new Date()) {
  const j = new Date(new Date(d).getTime() + 9 * 3600 * 1000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}
