"use client";
// ホーム画面・デスクトップに追加する案内(端末ごとにやり方が違うので、出し分ける)
import { useEffect, useState } from "react";
import { installState, promptInstall, onInstallChange, initInstall, markInstallDone } from "../../lib/install";

export default function InstallCard({ compact = false }) {
  const [st, setSt] = useState({ kind: "none" });
  const [done, setDone] = useState(false);
  useEffect(() => {
    initInstall();
    const up = () => setSt(installState());
    up();
    return onInstallChange(up);
  }, []);
  if (st.kind === "none" || st.kind === "installed" || done) return null;

  const icon = (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#ffd84d" />
      <path d="M12 20h16M20 12v16" stroke="#1f2350" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
  let body;
  if (st.kind === "prompt") {
    body = (
      <>
        <div style={{ flex: 1 }}>
          <b>オウダンをアプリのように使う</b>
          <p>{compact ? "ホーム画面・デスクトップから1タップで開けます。" : "ホーム画面やデスクトップに置いておくと、1タップで開けます。"}</p>
        </div>
        <button className="o-btn tag" onClick={async () => { if (await promptInstall()) setDone(true); }}>追加する</button>
      </>
    );
  } else if (st.kind === "ios") {
    body = (
      <div style={{ flex: 1 }}>
        <b>ホーム画面に追加する</b>
        <p>Safariの下にある共有ボタン(四角から矢印が出ているマーク)を押して、「ホーム画面に追加」を選んでください。</p>
      </div>
    );
  } else if (st.kind === "android") {
    body = (
      <div style={{ flex: 1 }}>
        <b>ホーム画面に追加する</b>
        <p>Chromeの右上のメニュー(︙)から「ホーム画面に追加」または「アプリをインストール」を選んでください。</p>
      </div>
    );
  } else {
    body = (
      <div style={{ flex: 1 }}>
        <b>デスクトップに追加する</b>
        <p>ChromeやEdgeのアドレス欄の右にある「インストール」のマーク、またはメニューの「アプリとして開く/インストール」から追加できます。</p>
      </div>
    );
  }
  const close = (
    <button className="o-install-close" aria-label="この案内を閉じる(もう出しません)" title="追加した・使わない場合は閉じてください" onClick={markInstallDone}>×</button>
  );
  return <div className="o-install">{icon}{body}{close}</div>;
}
