// SVG から PWA 用 PNG アイコンを生成する（Playwright の Chromium を利用）
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const svg = (bg, pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="${bg}"/>
  <g transform="translate(256 256) rotate(-35)">
    <rect x="-180" y="-22" width="360" height="44" rx="22" fill="#eef0f4"/>
    <rect x="-200" y="-70" width="56" height="140" rx="14" fill="#5b8cff"/>
    <rect x="144" y="-70" width="56" height="140" rx="14" fill="#5b8cff"/>
    <rect x="-140" y="-92" width="44" height="184" rx="12" fill="#eef0f4"/>
    <rect x="96" y="-92" width="44" height="184" rx="12" fill="#eef0f4"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon.svg", svg("#0f1115", false));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
async function shot(file, size, maskable) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg("#0f1115", maskable).replace('viewBox', `width="${size}" height="${size}" viewBox`)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await shot("public/icons/icon-192.png", 192, false);
await shot("public/icons/icon-512.png", 512, false);
await shot("public/icons/icon-512-maskable.png", 512, true);
await shot("public/icons/apple-touch-icon.png", 180, true);
await browser.close();
console.log("icons generated");
