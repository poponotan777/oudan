// ホーム画面・デスクトップに追加(PWA)の状態を、どの画面からも使えるようにする
let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f());

export function initInstall() {
  if (typeof window === "undefined" || window.__oudanInstall) return;
  window.__oudanInstall = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export function installState() {
  if (typeof window === "undefined") return { kind: "none" };
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) return { kind: "installed" };
  if (deferred) return { kind: "prompt" };
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return { kind: "ios" };
  if (/Android/.test(ua)) return { kind: "android" };
  return { kind: "desktop" };
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null;
  notify();
  return r?.outcome === "accepted";
}

export function onInstallChange(f) { subs.add(f); return () => subs.delete(f); }
