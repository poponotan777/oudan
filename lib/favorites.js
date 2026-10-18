// 「気になる」リスト — この端末の中(localStorage)だけに保存。ログインは要らない
const KEY = "oudanFavorites";
const subs = new Set();

export function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch {}
  subs.forEach((f) => f(list));
  return list;
}
export function isFavorite(pkey) {
  return !!pkey && loadFavorites().some((x) => x.pkey === pkey);
}
// item: { pkey, name, image, price, store }
export function toggleFavorite(item) {
  if (!item?.pkey) return loadFavorites();
  const list = loadFavorites();
  const i = list.findIndex((x) => x.pkey === item.pkey);
  if (i >= 0) { list.splice(i, 1); return save(list); }
  return save([{ ...item, at: Date.now() }, ...list]);
}
export function removeFavorite(pkey) {
  return save(loadFavorites().filter((x) => x.pkey !== pkey));
}
export function onFavoritesChange(f) {
  subs.add(f);
  const onStorage = (e) => { if (e.key === KEY) f(loadFavorites()); };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => { subs.delete(f); if (typeof window !== "undefined") window.removeEventListener("storage", onStorage); };
}
