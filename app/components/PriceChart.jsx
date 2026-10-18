"use client";
// 90日の値段の動き(3サイトを1枚に重ねる)。点は1日1つ(その日の最安値)
import { useState } from "react";
import { STORE_ORDER, STORE_META, histRows, fmtDay } from "../../lib/priceView";

const num = (n) => Math.round(Number(n)).toLocaleString("ja-JP");
const W = 640, H = 200, PL = 8, PR = 8, PT = 14, PB = 24;

export default function PriceChart({ offers }) {
  const [hover, setHover] = useState(null);
  const series = STORE_ORDER.map((s) => ({ s, rows: histRows(offers?.[s], s) })).filter((x) => x.rows.length >= 2);
  if (!series.length) return null;
  const all = series.flatMap((x) => x.rows);
  const t0 = Math.min(...all.map((r) => Date.parse(r.recorded_at)));
  const t1 = Math.max(...all.map((r) => Date.parse(r.recorded_at)));
  const lo = Math.min(...all.map((r) => r.price));
  const hi = Math.max(...all.map((r) => r.price));
  const span = Math.max(1, t1 - t0);
  const pad = Math.max(1, (hi - lo) * 0.12);
  const y0 = lo - pad, y1 = hi + pad;
  const X = (t) => PL + ((t - t0) / span) * (W - PL - PR);
  const Y = (p) => PT + (1 - (p - y0) / (y1 - y0)) * (H - PT - PB);
  const days = Math.round(span / 86400000) + 1;
  const minRow = all.reduce((a, b) => (b.price < a.price ? b : a));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((x - PL) / (W - PL - PR)) * span;
    const day = new Date(Math.round(t / 86400000) * 86400000).toISOString().slice(0, 10);
    const at = {};
    for (const { s, rows } of series) {
      const hit = rows.find((q) => q.recorded_at === day);
      if (hit) at[s] = hit.price;
    }
    setHover(Object.keys(at).length ? { day, at, x: X(Date.parse(day)) } : null);
  };

  return (
    <section>
      <h2 className="o-h2">値段の動き<small>{days}日分・1日ごとの最安値</small></h2>
      <div className="o-box o-chart">
        <div className="o-chart-legend">
          {series.map(({ s }) => <span key={s}><i className={`dot ${s}`} />{STORE_META[s].short}</span>)}
          <span className="o-chart-min">いちばん安かった日:<b className="o-num">¥{num(minRow.price)}</b>({fmtDay(minRow.recorded_at)}・{STORE_META[minRow.store].short})</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="3サイトの値段の動きのグラフ" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0] ? { currentTarget: e.currentTarget, clientX: e.touches[0].clientX } : e)}>
          {[0, 0.5, 1].map((f) => {
            const p = y0 + (y1 - y0) * (1 - f) ;
            const y = PT + f * (H - PT - PB);
            return <g key={f}><line x1={PL} x2={W - PR} y1={y} y2={y} className="grid" /><text x={W - PR} y={y - 3} textAnchor="end" className="ax">¥{num(p)}</text></g>;
          })}
          {series.map(({ s, rows }) => (
            <polyline key={s} className={`ln ${s}`} fill="none" points={rows.map((r) => `${X(Date.parse(r.recorded_at)).toFixed(1)},${Y(r.price).toFixed(1)}`).join(" ")} />
          ))}
          <circle cx={X(Date.parse(minRow.recorded_at))} cy={Y(minRow.price)} r="5" className="minpt" />
          <text x={PL} y={H - 6} className="ax">{fmtDay(new Date(t0))}</text>
          <text x={W - PR} y={H - 6} textAnchor="end" className="ax">{fmtDay(new Date(t1))}</text>
          {hover && <line x1={hover.x} x2={hover.x} y1={PT} y2={H - PB} className="cursor" />}
        </svg>
        {hover && (
          <div className="o-chart-tip">
            <b>{fmtDay(hover.day)}</b>
            {STORE_ORDER.filter((s) => hover.at[s] != null).map((s) => <span key={s}><i className={`dot ${s}`} />{STORE_META[s].short} ¥{num(hover.at[s])}</span>)}
          </div>
        )}
      </div>
    </section>
  );
}
