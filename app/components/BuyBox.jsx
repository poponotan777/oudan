"use client";
// 商品ページのいちばん上:どこで買うと安いか・いまは買い時か・すぐ買えるボタン
//   煽らない:ここに出す数字は、オウダンが記録した値段とセールの予定からだけ作る
import { STORE_ORDER, STORE_META, effectivePrice, statsFor, fmtTime, fmtDay } from "../../lib/priceView";
import { upcomingSales, daysUntil } from "../../lib/saleCalendar";

const num = (n) => Math.round(Number(n)).toLocaleString("ja-JP");

// 買い時の目安(90日の記録の中で、いまの値段がどのあたりか)
export function verdict(st) {
  if (!st || st.days < 7) return { tone: "none", word: "記録を集めています", why: "値段の記録が7日分たまると、買い時の目安を出します。" };
  const d = st.diffPct;
  if (st.isLowest) return { tone: "best", word: "買い時", why: `${st.days}日の記録でいちばん安い値段です。` };
  if (d <= -5 || (st.rank <= 2 && d < 0)) return { tone: "good", word: "買い時", why: `ふだん(中央値)より${Math.abs(d).toFixed(0)}%安く、${st.days}日で${st.rank}番目に安い値段です。` };
  if (d <= -1) return { tone: "ok", word: "やや安い", why: `ふだんより${Math.abs(d).toFixed(1)}%安い値段です。` };
  if (d < 1) return { tone: "flat", word: "ふだんの値段", why: "急ぎでなければ、セールを待つのも手です。" };
  return { tone: "high", word: "いまは高め", why: `ふだんより${d.toFixed(0)}%高い値段です。値下がりを待つのがおすすめです。` };
}

export default function BuyBox({ offers, rates, name, onBuy }) {
  const list = STORE_ORDER.filter((s) => offers?.[s]?.price > 0).map((s) => ({ s, o: offers[s], eff: effectivePrice(s, offers[s], rates) }));
  if (!list.length) return null;
  const best = [...list].sort((a, b) => a.eff - b.eff)[0];
  const worst = [...list].sort((a, b) => b.eff - a.eff)[0];
  const st = statsFor(best.o.price, best.o);
  const v = verdict(st);
  const ok = st && st.days >= 7;
  const off = ok && st.diffPct <= -1 ? Math.round(-st.diffPct) : 0;
  const gain = ok && st.median > best.o.price ? st.median - best.o.price : 0;
  const save = list.length >= 2 ? worst.eff - best.eff : 0;
  // 90日の中での位置(左=最安、右=最高)
  const vals = (best.o.hist || []).filter((x) => x != null).map(Number);
  const lo = vals.length ? Math.min(...vals) : null, hi = vals.length ? Math.max(...vals) : null;
  const pos = lo != null && hi > lo ? Math.min(1, Math.max(0, (best.o.price - lo) / (hi - lo))) : null;
  // もうすぐのセール(10日以内)
  const now = new Date();
  const soon = upcomingSales(now, [], 10).filter((e) => !e.live).slice(0, 1)[0];
  const live = upcomingSales(now, [], 1).filter((e) => e.live && e.store === best.s)[0];

  return (
    <div className="o-buy">
      <div className="o-bigprice">
        {Math.round(best.eff) < Math.round(best.o.price) ? (
          <>
            <div className="who">ポイント込みなら<span className={`o-store ${best.s}`}>{STORE_META[best.s].short}</span>がいちばん安い</div>
            <div className="amt o-num"><span className="pre">実質</span><span className="yen">¥</span>{num(best.eff)}</div>
            <div className="eff">支払う金額 <b className="o-num">¥{num(best.o.price)}</b>(ポイント約¥{num(best.o.price - best.eff)}分を引いた額)</div>
          </>
        ) : (
          <>
            <div className="who"><span className={`o-store ${best.s}`}>{STORE_META[best.s].short}</span>がいちばん安い</div>
            <div className="amt o-num"><span className="yen">¥</span>{num(best.o.price)}</div>
          </>
        )}
        {(off > 0 || st?.isLowest) && (
          <div className="deals">
            {off > 0 && <span className="o-off">ふだんより<b className="o-num">{off}%</b>安い</span>}
            {gain > 0 && <span className="o-gain"><b className="o-num">¥{num(gain)}</b>おトク</span>}
            {st?.isLowest && st.days >= 7 && <span className="o-low">{st.days}日でいちばん安い</span>}
          </div>
        )}
      </div>
      <div className={`o-verdict ${v.tone}`}>
        <div className="o-verdict-top">
          <span className="o-verdict-word">{v.word}</span>
          <span className="o-verdict-why">{v.why}</span>
        </div>
        {pos != null && (
          <div className="o-meter" aria-label={`90日の最安¥${num(lo)}、最高¥${num(hi)}の中で、いまは¥${num(best.o.price)}`}>
            <div className="bar"><span className="pin" style={{ left: `${pos * 100}%` }} /></div>
            <div className="ends"><span>最安 ¥{num(lo)}</span><span>最高 ¥{num(hi)}</span></div>
          </div>
        )}
      </div>
      {best.o.url && (
        <a className={`o-buy-cta ${best.s}`} href={best.o.url} target="_blank" rel="noopener noreferrer sponsored" onClick={() => onBuy?.(best.s, best.o)}>
          {STORE_META[best.s].short}でいちばん安く買う
          <span className="o-num">¥{num(best.o.price)}</span>
        </a>
      )}
      <ul className="o-buy-facts">
        {save >= 10 && <li>ほかのサイトで買うより、ポイント込みで<b>¥{num(save)}</b>安くなります</li>}
        {best.o.sale_until && <li className="hot">{best.o.sale_label || "セール"}は<b>{fmtTime(best.o.sale_until)}まで</b></li>}
        {live && <li className="hot">{STORE_META[live.store].short}で<b>{live.name}</b>開催中{live.end ? `(${fmtDay(live.end)}まで)` : ""}。エントリーを忘れずに</li>}
        {soon && v.tone !== "best" && v.tone !== "good" && (
          <li>あと<b>{Math.max(1, daysUntil(soon.start, now))}日</b>で{STORE_META[soon.store].short}の{soon.name}。ポイント狙いなら待つのも手です</li>
        )}
      </ul>
    </div>
  );
}
