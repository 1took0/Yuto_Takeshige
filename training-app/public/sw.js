/* トレーニングコーチ Service Worker
 * - ハッシュ付き静的アセット(/_next/static)はキャッシュ優先
 * - ページ遷移はネットワーク優先、失敗時はキャッシュ → /offline
 * - 記録データは IndexedDB に保存されるため SW はアプリシェルの配信のみ担当
 */
const VERSION = "v1";
const SHELL_CACHE = `tc-shell-${VERSION}`;
const ASSET_CACHE = `tc-assets-${VERSION}`;
const PRECACHE_URLS = ["/", "/workout", "/history", "/analytics", "/settings", "/timer", "/coach", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(new Request(u, { cache: "reload" })))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("tc-") && k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API はキャッシュしない

  // ハッシュ付き静的アセット：キャッシュ優先
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // ページ遷移：ネットワーク優先、失敗時はキャッシュ
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(new Request(url.pathname), res.clone());
          return res;
        } catch {
          const hit = (await cache.match(url.pathname)) || (await cache.match("/"));
          return hit || (await cache.match("/offline")) || new Response("オフラインです", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  // それ以外（RSC ペイロードなど）：ネットワーク優先、失敗時キャッシュ
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error("offline");
      }
    })(),
  );
});
