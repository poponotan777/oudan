"use client";
import { useEffect } from "react";
import { initInstall } from "../../lib/install";

// service worker を登録して、「ホーム画面に追加」できる状態にする
export default function InstallSW() {
  useEffect(() => {
    initInstall();
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
