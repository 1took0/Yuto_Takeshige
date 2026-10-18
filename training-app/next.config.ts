import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // このアプリはほぼ全てクライアント側（IndexedDB）で動くため、
  // Cache Components / Partial Prefetching は使わずシンプルな構成にする。
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Service Worker は常に最新を取得させる
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
