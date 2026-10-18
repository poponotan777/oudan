"use client";
// ============================================================
// セールカレンダーと「あなたのポイント」(v25)
//   TodayStrip       … ホーム:今日の各サイトの還元率(目安)
//   SaleCalendarList … 開催中・これからのセール
//   StatusForm       … 設定:使っているサービス・払い方から還元率を自動で出す(端末内だけに保存)
// ============================================================

import { useState } from "react";
import { upcomingSales, fmtRange, CONFIDENCE_LABEL, daysUntil } from "../../lib/saleCalendar";
import { todayRates, baseRates, RAKUTEN_RANKS, YAHOO_RANKS, SPU_ITEMS, PAY_OPTIONS } from "../../lib/status";
import { STORE_META } from "../../lib/priceView";

const r1 = (x) => Math.round(x * 10) / 10;

export function TodayStrip({ status, sheetEvents, onEdit }) {
  const t = todayRates(status, {}, new Date(), sheetEvents);
  return (
    <section>
      <h2 className="o-h2" style={{ display: "flex", alignItems: "baseline" }}>
        今日のあなたの還元率
        <button onClick={onEdit} className="o-link" style={{ marginLeft: "auto", fontSize: 12.5, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {status?.set ? "設定を変える" : "自分に合わせる"}
        </button>
      </h2>
      <div className="o-rates">
        {["rakuten", "yahoo", "amazon"].map((s) => (
          <div key={s} className={`o-rate ${s}`}>
            <div className="o-rate-name">{STORE_META[s].short}</div>
            <div className="o-num o-rate-pct">{r1(t[s].pct)}<span>%</span></div>
            <div className="o-rate-lines">
              {t[s].lines.map((l, i) => <div key={i}>{l}</div>)}
              {t[s].events.filter((e) => e.url && e.entry).slice(0, 1).map((e) => (
                <a key={e.name} href={e.url} target="_blank" rel="noopener noreferrer">エントリーする</a>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!status?.set && (
        <p className="o-note" style={{ margin: "8px 0 0" }}>
          楽天カードや楽天モバイル、PayPay払いなどを選ぶと、自分の還元率で実質価格を出します。
        </p>
      )}
    </section>
  );
}

export function SaleCalendarList({ sheetEvents, loaded, max = 2 }) {
  const [all, setAll] = useState(false);
  if (!loaded) return null;
  const now = new Date();
  const list = upcomingSales(now, sheetEvents, 75);
  if (list.length === 0) return null;
  const shown = all ? list : list.slice(0, max);
  return (
    <section>
      <h2 className="o-h2">セールの予定</h2>
      <div className="o-sales">
        {shown.map((e, i) => {
          const endIn = e.end ? daysUntil(e.end, now) : null;
          const startIn = daysUntil(e.start, now);
          const tier = e.live ? (endIn === 0 ? "today" : endIn === 1 ? "tomorrow" : "live") : "soon";
          const when = { today: "今日まで", tomorrow: "明日まで", live: "開催中", soon: startIn <= 0 ? "まもなく" : `あと${startIn}日` }[tier];
          const conf = CONFIDENCE_LABEL[e.confidence] || CONFIDENCE_LABEL.predicted;
          const body = (
            <>
              <div className="o-sale-top">
                <span className={`o-store ${e.store}`}>{STORE_META[e.store]?.short || e.store}</span>
                <span className="o-sale-when">{when}</span>
                {e.confidence !== "confirmed" && <span className="o-mark flat">{conf.text}</span>}
                {e.primeOnly && <span className="o-mark flat">プライム会員向け</span>}
              </div>
              <div className="o-sale-name">{e.name}</div>
              <div className="o-sale-period">{e.fromSheet && e.period_text ? e.period_text : fmtRange(e)}</div>
              {e.note && <div className="o-sale-note">{e.note}</div>}
            </>
          );
          return e.url
            ? <a key={i} href={e.url} target="_blank" rel="noopener noreferrer sponsored" className={`o-sale ${tier}`}>{body}</a>
            : <div key={i} className={`o-sale ${tier}`}>{body}</div>;
        })}
      </div>
      {list.length > max && (
        <button className="o-btn block" style={{ marginTop: 8 }} onClick={() => setAll((v) => !v)}>
          {all ? "閉じる" : `ほかのセールも見る(${list.length - max}件)`}
        </button>
      )}
      <p className="o-note" style={{ marginTop: 6 }}>
        「予想」は例年の日程から出した目安、「毎年同じ日程」は毎回同じ日時に開かれているものです。正式な日程は各サイトで確かめてください。
      </p>
    </section>
  );
}

// ---------- 設定:あなたのポイント ----------
export function StatusForm({ status, onSave }) {
  const [s, setS] = useState(status);
  const [msg, setMsg] = useState("");
  const set = (store, k, v) => setS((p) => ({ ...p, [store]: { ...p[store], [k]: v } }));
  const setSpu = (id, v) => setS((p) => ({ ...p, rakuten: { ...p.rakuten, spu: { ...(p.rakuten.spu || {}), [id]: v } } }));
  const save = () => { onSave(s); setMsg("保存しました。実質価格に反映しています"); setTimeout(() => setMsg(""), 3000); };
  const b = baseRates(s);
  const usesOther = s.rakuten.pay === "other" || s.yahoo.pay === "other" || s.amazon.pay === "other";

  const Override = ({ store, unit = "%" }) => {
    const on = s[store].override !== "" && s[store].override != null;
    return (
      <div className="o-field">
        <label className="o-check" style={{ padding: 0 }}>
          <input type="checkbox" checked={on} onChange={(e) => set(store, "override", e.target.checked ? String(store === "rakuten" ? b.rakuten.spu : b[store].pct) : "")} />
          自分で入力する
        </label>
        {on && (
          <>
            <input type="number" min="0" max="50" step="0.5" value={s[store].override}
              onChange={(e) => set(store, "override", e.target.value)} style={{ width: 90 }} />
            {unit}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="o-form">
      <h2 className="o-h2" style={{ marginTop: 0 }}>あなたのポイント</h2>
      <p className="o-note" style={{ marginTop: 0 }}>
        使っているものにチェックを入れるだけで、各サイトの還元率を計算します。5と0のつく日・5のつく日・買い回りは、その日になると自動で足します。この端末の中だけに保存します。
      </p>

      <h3><span className="o-store rakuten">楽天</span>楽天市場</h3>
      <div className="o-field">
        支払い
        <select value={s.rakuten.pay} onChange={(e) => set("rakuten", "pay", e.target.value)}>
          {PAY_OPTIONS.rakuten.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="o-spu">
        {SPU_ITEMS.map((it) => (
          <label key={it.id} className="o-check">
            <input type="checkbox" checked={!!s.rakuten.spu?.[it.id]} onChange={(e) => setSpu(it.id, e.target.checked)} />
            <span>{it.label}<small>+{it.add}倍</small></span>
          </label>
        ))}
      </div>
      <div className="o-result">SPU <span className="o-num">{b.rakuten.spu}</span>倍<span className="o-note" style={{ marginLeft: "auto" }}>楽天市場のトップに出る数字と比べてください</span></div>
      <Override store="rakuten" unit="倍" />
      <div className="o-field">
        会員ランク
        <select value={s.rakuten.rank} onChange={(e) => set("rakuten", "rank", e.target.value)}>
          {RAKUTEN_RANKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="o-field">
        お買い物マラソン・スーパーSALEで買い回る店舗数
        <input type="number" min="1" max="10" step="1" value={s.rakuten.shops} onChange={(e) => set("rakuten", "shops", parseInt(e.target.value, 10) || 1)} style={{ width: 70 }} />
        店舗
      </div>

      <h3><span className="o-store yahoo">Yahoo!</span>Yahoo!ショッピング</h3>
      <div className="o-field">
        支払い
        <select value={s.yahoo.pay} onChange={(e) => set("yahoo", "pay", e.target.value)}>
          {PAY_OPTIONS.yahoo.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <label className="o-check"><input type="checkbox" checked={!!s.yahoo.line} onChange={(e) => set("yahoo", "line", e.target.checked)} /><span>LINEアカウントと連携している<small>+4%(PayPay系の支払いのとき)</small></span></label>
      <label className="o-check"><input type="checkbox" checked={!!s.yahoo.lyp} onChange={(e) => set("yahoo", "lyp", e.target.checked)} /><span>LYPプレミアム会員<small>+2%(PayPay系の支払いのとき)</small></span></label>
      <div className="o-result">ふだん <span className="o-num">{b.yahoo.pct}</span>%</div>
      <Override store="yahoo" />
      <div className="o-field">
        ヤフショランク
        <select value={s.yahoo.rank} onChange={(e) => set("yahoo", "rank", e.target.value)}>
          {YAHOO_RANKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <h3><span className="o-store amazon">Amazon</span>Amazon</h3>
      <div className="o-field">
        支払い
        <select value={s.amazon.pay} onChange={(e) => set("amazon", "pay", e.target.value)}>
          {PAY_OPTIONS.amazon.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <label className="o-check"><input type="checkbox" checked={!!s.amazon.prime} onChange={(e) => set("amazon", "prime", e.target.checked)} /><span>プライム会員<small>Amazon Mastercardが2%に</small></span></label>
      <div className="o-result">ふだん <span className="o-num">{b.amazon.pct}</span>%<span className="o-note" style={{ marginLeft: "auto" }}>商品ごとのAmazonポイントは別に足します</span></div>
      <Override store="amazon" />

      {usesOther && (
        <>
          <h3>ほかのクレジットカード</h3>
          <div className="o-field">
            還元率
            <input type="number" min="0" max="10" step="0.1" value={s.otherCardRate} onChange={(e) => setS((p) => ({ ...p, otherCardRate: e.target.value === "" ? "" : Number(e.target.value) }))} style={{ width: 80 }} />
            %
          </div>
        </>
      )}

      <label className="o-check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={s.applyToPrice !== false} onChange={(e) => setS((p) => ({ ...p, applyToPrice: e.target.checked }))} />
        <span>今日のキャンペーン分も実質価格に入れる</span>
      </label>

      <button className="o-btn solid block" style={{ marginTop: 10 }} onClick={save}>保存する</button>
      {msg && <p style={{ fontSize: 13, color: "var(--wakaba)", fontWeight: 700, margin: "8px 0 0" }}>{msg}</p>}
      <p className="o-note" style={{ marginTop: 10 }}>
        どの特典にも月の上限やエントリーがあります。ここの数字は目安なので、大きな買い物の前は各サイトの画面で確かめてください。(2026年10月時点の条件)
      </p>
    </div>
  );
}
