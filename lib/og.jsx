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
  const FIXED = "0123456789¥,.%・〜()?…位選楽天Yahoo!Amazon最安時点の価格変動しますPR#oudanvercelappオウダンどこがいちばん安いふだんより3か月で最安値サイト比較のおすすめ画像なしTOP比較商品";
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
// 全角=1文字分、半角英数=0.56文字分として、幅 width・lines 行に収まるように切る(あふれたら …)
export function fit(text, fontSize, width, lines = 1) {
  const per = width / fontSize;
  let w = 0, line = 1, out = "";
  for (const ch of String(text || "").replace(/\s+/g, " ").trim()) {
    const cw = /[\x20-\x7E]/.test(ch) ? 0.56 : 1;
    if (w + cw > per) {
      if (line >= lines) return out.replace(/\s+$/, "") + "…";
      line++; w = 0;
    }
    w += cw; out += ch;
  }
  return out;
}
const clip = (s, n) => (String(s || "").length > n ? String(s).slice(0, n - 1) + "…" : String(s || ""));
// 決まった高さの箱(はみ出しても次の部品に重ならない)
function Box({ h, w, children, style }) {
  const st = { display: "flex", height: h, overflow: "hidden", flexShrink: 0, ...style };
  if (w != null) st.width = w;
  return <div style={st}>{children}</div>;
}

// ---------- 共通パーツ ----------
function ImgBox({ src, size, radius = 16 }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, background: "#fff", border: `3px solid ${C.line}`, borderRadius: radius, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {src ? <img src={src} width={size - 16} height={size - 16} style={{ objectFit: "contain" }} /> : <div style={{ fontSize: Math.max(14, size * 0.11), color: C.gray, display: "flex" }}>画像なし</div>}
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
      <div style={{ display: "flex", color: C.tag }}>オウダン</div>
      <div style={{ display: "flex", marginLeft: 14, opacity: 0.85 }}>oudan.vercel.app</div>
      <div style={{ display: "flex", marginLeft: 20, opacity: 0.85 }}>{date ? `${date}時点の価格(変動します)` : "価格は変動します"}</div>
      <div style={{ display: "flex", marginLeft: "auto", border: "2px solid #fff", borderRadius: 6, padding: "0 10px", fontSize: 16 }}>PR</div>
    </div>
  );
}

// 3サイトの値段(縦に3行・高さ固定)
function PriceRows({ prices, fs, rowH, width }) {
  const best = cheapestOf(prices);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width }}>
      {STORES.map(([s, label]) => {
        const on = s === best;
        return (
          <Box key={s} h={rowH} style={{ alignItems: "center", justifyContent: "space-between", padding: "0 10px", borderRadius: 8, background: on ? C.tag : C.bg }}>
            <div style={{ display: "flex", fontSize: fs * 0.7, color: on ? C.ink : C[s] }}>{label}{on ? " 最安" : ""}</div>
            <div style={{ display: "flex", fontSize: fs, color: prices?.[s] != null ? C.ink : C.gray }}>{yen(prices?.[s])}</div>
          </Box>
        );
      })}
    </div>
  );
}

function Header({ title, subtitle, kicker, by }) {
  const tfs = title.length > 22 ? 40 : 48;
  return (
    <div style={{ display: "flex", flexDirection: "column", backgroundImage: GRAD, padding: "20px 40px 18px", color: "#fff", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, height: 34 }}>
        {kicker && <div style={{ display: "flex", background: C.tag, color: C.ink, fontSize: 22, padding: "2px 14px", borderRadius: 8 }}>{kicker}</div>}
        {by && <div style={{ display: "flex", fontSize: 20 }}>{clip(by, 20)}のおすすめ</div>}
        <div style={{ display: "flex", marginLeft: "auto", fontSize: 20, opacity: 0.9 }}>楽天・Yahoo!・Amazon 3サイト比較</div>
      </div>
      <Box h={Math.round(tfs * 1.3)} style={{ fontSize: tfs, marginTop: 6 }}>{fit(title, tfs, 1120, 1)}</Box>
      {subtitle && <Box h={30} style={{ fontSize: 22, opacity: 0.92, marginTop: 2 }}>{fit(subtitle, 22, 1120, 1)}</Box>}
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
  const title = data.title || "おすすめ";
  const headerH = 20 + 34 + 6 + Math.round((title.length > 22 ? 40 : 48) * 1.3) + (data.subtitle ? 32 : 0) + 18;
  const bodyH = 630 - 44 - headerH;

  let body;
  if (tpl === "compare") {
    const headH = 32;
    const rowH = Math.floor((bodyH - 24 - headH) / n);
    const img = Math.min(rowH - 12, 90);
    const fs = rowH >= 80 ? 22 : rowH >= 60 ? 19 : 16;
    const colW = 170;
    const nameW = 1200 - 72 - (img + 16) - colW * 3 - 12;
    body = (
      <div style={{ display: "flex", flexDirection: "column", padding: "12px 36px", height: bodyH }}>
        <Box h={headH} style={{ alignItems: "center", fontSize: 18, color: C.sub }}>
          <div style={{ display: "flex", width: img + 16 + nameW + 12 }}>商品</div>
          {STORES.map(([s, l]) => <div key={s} style={{ display: "flex", width: colW, justifyContent: "flex-end", color: C[s] }}>{l}</div>)}
        </Box>
        {items.map((it, i) => {
          const best = cheapestOf(it.prices);
          const lines = rowH >= 70 ? 2 : 1;
          return (
            <Box key={i} h={rowH} style={{ alignItems: "center", borderTop: `2px solid ${C.line}`, background: i % 2 ? "#F7F9FF" : "#fff" }}>
              <div style={{ display: "flex", width: img + 16, paddingLeft: 6 }}><ImgBox src={it.image} size={img} radius={10} /></div>
              <div style={{ display: "flex", flexDirection: "column", width: nameW, marginRight: 12 }}>
                {it.head && <Box h={Math.round(fs * 1.3)} style={{ fontSize: fs, color: C.ink }}>{fit(it.head, fs, nameW, 1)}</Box>}
                <Box h={Math.round(fs * 0.8 * 1.3) * (it.head ? 1 : lines)} style={{ fontSize: it.head ? fs * 0.8 : fs, color: it.head ? C.sub : C.ink, lineHeight: 1.3 }}>
                  {fit(it.name, it.head ? fs * 0.8 : fs, nameW, it.head ? 1 : lines)}
                </Box>
              </div>
              {STORES.map(([s]) => (
                <div key={s} style={{ display: "flex", width: colW, justifyContent: "flex-end" }}>
                  <div style={{ display: "flex", fontSize: fs + 4, padding: "2px 10px", borderRadius: 8, color: it.prices?.[s] == null ? C.gray : C.ink, background: s === best ? C.tag : "transparent" }}>
                    {yen(it.prices?.[s])}
                  </div>
                </div>
              ))}
            </Box>
          );
        })}
      </div>
    );
  } else {
    const gap = 14;
    const cardW = Math.floor((1200 - 72 - gap * (n - 1)) / n);
    const innerW = cardW - 20;
    const cardH = bodyH - 28;
    // 上から:順位(30)・画像・ひとこと(1行)・商品名(2行)・値段(3行)。高さはすべて固定
    const priceFs = n <= 2 ? 26 : n === 3 ? 23 : n === 4 ? 20 : 17;
    const rowH = Math.round(priceFs * 1.45);
    const priceH = rowH * 3 + 8;
    const headFs = n <= 3 ? 22 : n === 4 ? 19 : 16;
    const nameFs = n <= 3 ? 17 : n === 4 ? 15 : 13;
    const headH = items.some((x) => x.head) ? Math.round(headFs * 1.35) : 0;
    const nameLines = 2;
    const nameH = Math.round(nameFs * 1.35) * nameLines + 6;
    const fixed = 30 + 8 + headH + nameH + priceH + 8 * 3 + 20;
    const img = Math.max(60, Math.min(innerW, cardH - fixed));
    const medal = ["#E3A008", "#8F97A8", "#B7791F"];
    body = (
      <div style={{ display: "flex", padding: "14px 36px", gap, height: bodyH }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: cardW, height: cardH, background: C.card, border: `2px solid ${C.line}`, borderRadius: 18, padding: 10 }}>
            <Box h={30} w={innerW} style={{ alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: tpl === "ranking" ? 62 : 30, height: 30, borderRadius: 15, background: tpl === "ranking" ? (medal[i] || C.blue) : C.blue, color: "#fff", fontSize: 19 }}>
                {tpl === "ranking" ? `${i + 1}位` : `${i + 1}`}
              </div>
            </Box>
            <div style={{ display: "flex", marginTop: 8 }}><ImgBox src={it.image} size={img} radius={14} /></div>
            {headH > 0 && <Box h={headH} w={innerW} style={{ fontSize: headFs, color: C.blue, marginTop: 8 }}>{it.head ? fit(it.head, headFs, innerW, 1) : ""}</Box>}
            <Box h={nameH} w={innerW} style={{ fontSize: nameFs, color: C.ink, lineHeight: 1.35, marginTop: headH ? 2 : 8 }}>{fit(it.name, nameFs, innerW, nameLines)}</Box>
            <div style={{ display: "flex", marginTop: "auto" }}><PriceRows prices={it.prices} fs={priceFs} rowH={rowH} width={innerW} /></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: C.bg, fontFamily: "NotoJP" }}>
      <Header title={title} subtitle={data.subtitle || ""} kicker={kicker} by={data.by || ""} />
      {body}
      <Footer date={data.date} />
    </div>
  );
}

// ---------- 商品ページ(1商品・3サイト比較) ----------
//  data: { name, image, prices, date, off, lowest }
export function ProductOG({ data }) {
  const best = cheapestOf(data.prices);
  const name = fit(data.name, 34, 700, 2);
  return (
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: C.bg, fontFamily: "NotoJP" }}>
      <div style={{ display: "flex", alignItems: "center", backgroundImage: GRAD, color: "#fff", padding: "0 40px", height: 64, fontSize: 26, flexShrink: 0 }}>
        <div style={{ display: "flex" }}>どこがいちばん安い?</div>
        <div style={{ display: "flex", marginLeft: 14, fontSize: 20, opacity: 0.9 }}>楽天・Yahoo!・Amazon 3サイト比較</div>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "26px 40px 22px", gap: 34, alignItems: "center" }}>
        <div style={{ display: "flex", position: "relative" }}>
          <ImgBox src={data.image} size={360} radius={24} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 726, justifyContent: "center" }}>
          <Box h={Math.round(34 * 1.32) * 2 + 6} style={{ fontSize: 34, color: C.ink, lineHeight: 1.32 }}>{name}</Box>
          <Box h={44} style={{ gap: 10, marginTop: 10, alignItems: "center" }}>
            {data.off > 0 && <div style={{ display: "flex", background: C.red, color: "#fff", fontSize: 26, padding: "2px 14px", borderRadius: 10 }}>ふだんより{data.off}%安い</div>}
            {data.lowest && <div style={{ display: "flex", background: C.mint, color: "#fff", fontSize: 24, padding: "2px 14px", borderRadius: 10 }}>3か月で最安値</div>}
          </Box>
          {best && (
            <div style={{ display: "flex", alignItems: "center", marginTop: 14, background: C.tag, borderRadius: 18, padding: "10px 22px", height: 120, border: `4px solid ${C.tagDeep}` }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 22, color: C.ink }}>いちばん安い</div>
                <div style={{ display: "flex", fontSize: 30, color: C[best] }}>{STORES.find((x) => x[0] === best)[1]}</div>
              </div>
              <div style={{ display: "flex", marginLeft: "auto", alignItems: "baseline", color: C.ink }}>
                <div style={{ display: "flex", fontSize: 40 }}>¥</div>
                <div style={{ display: "flex", fontSize: 84, lineHeight: 1 }}>{num(data.prices[best])}</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {STORES.filter(([s]) => s !== best).map(([s, l]) => (
              <div key={s} style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderRadius: 12, background: "#fff", border: `2px solid ${C.line}` }}>
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
    <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: C.bg, fontFamily: "NotoJP" }}>
      <div style={{ display: "flex", alignItems: "center", backgroundImage: GRAD, color: "#fff", padding: "0 40px", gap: 16, height: 84, flexShrink: 0 }}>
        <div style={{ display: "flex", background: C.tag, color: C.ink, fontSize: 22, padding: "3px 14px", borderRadius: 8, flexShrink: 0 }}>{data.by ? `${clip(data.by, 14)}のおすすめ` : "おすすめ"}</div>
        <Box h={52} w={840} style={{ fontSize: 38, alignItems: "center" }}>{fit(title, 38, 840, 1)}</Box>
      </div>
      <div style={{ display: "flex", flex: 1, padding: "22px 40px 20px", gap: 30 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 320, gap: 10 }}>
          <ImgBox src={it.image} size={320} radius={22} />
          <Box h={58} w={320} style={{ fontSize: 18, color: C.sub, lineHeight: 1.4 }}>{fit(it.name, 18, 320, 2)}</Box>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 770 }}>
          {pts.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `2px solid ${C.line}`, borderRadius: 14, padding: "0 16px", height: 68, marginBottom: 10 }}>
              <div style={{ display: "flex", width: 40, height: 40, borderRadius: 20, backgroundImage: GRAD, color: "#fff", fontSize: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <Box h={40} w={680} style={{ fontSize: 28, color: C.ink, alignItems: "center" }}>{fit(p, 28, 680, 1)}</Box>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
            {STORES.map(([s, l]) => {
              const on = s === best;
              return (
                <div key={s} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "8px 16px", borderRadius: 14, background: on ? C.tag : "#fff", border: on ? `3px solid ${C.tagDeep}` : `2px solid ${C.line}` }}>
                  <div style={{ display: "flex", fontSize: 20, color: on ? C.ink : C[s] }}>{l}{on ? " いちばん安い" : ""}</div>
                  <div style={{ display: "flex", fontSize: on ? 40 : 32, color: it.prices?.[s] == null ? C.gray : C.ink }}>{yen(it.prices?.[s])}</div>
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

// 「10/17 17:05」
export function jstStamp(d = new Date()) {
  const j = new Date(new Date(d).getTime() + 9 * 3600 * 1000);
  return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}
