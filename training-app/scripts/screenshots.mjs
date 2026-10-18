// 画面確認用スクリーンショット（iPhone サイズ）
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = process.env.OUT_DIR ?? "screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ ...devices["iPhone 14"], colorScheme: process.env.DARK ? "dark" : "light" });
const page = await ctx.newPage();
const suffix = process.env.DARK ? "-dark" : "";

await page.goto(`${base}/`);
await page.waitForSelector('[data-testid="start"]');
await page.screenshot({ path: `${out}/01-home${suffix}.png`, fullPage: true });
await page.click('[data-testid="start"]');
await page.waitForSelector('[data-testid="generate"]');
await page.click('role=radio[name="あり"] >> nth=0');
await page.screenshot({ path: `${out}/02-intake${suffix}.png`, fullPage: true });
await page.click('[data-testid="generate"]');
await page.waitForSelector('[data-testid="progress"]');
// 1セット目を完了にして休憩タイマーを表示
await page.click('role=button[name=/セット1を完了にする/] >> nth=0');
await page.screenshot({ path: `${out}/03-workout${suffix}.png`, fullPage: false });
await page.screenshot({ path: `${out}/03-workout-full${suffix}.png`, fullPage: true });
await page.click('text=フォーム >> nth=0');
await page.screenshot({ path: `${out}/04-form-info${suffix}.png`, fullPage: false });
// 有酸素カードまでスクロール
const cardio = page.locator('[data-testid="cardio-card"]').last();
await cardio.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/05-cardio${suffix}.png`, fullPage: false });
await page.goto(`${base}/timer/treadmill`);
await page.waitForSelector('[data-testid="timer-main"]');
await page.click('text=ラン 12km/h 3分×4');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/06-timer${suffix}.png`, fullPage: false });
await page.goto(`${base}/history`);
await page.waitForSelector('[data-testid="history-item"]');
await page.screenshot({ path: `${out}/07-history${suffix}.png`, fullPage: false });
await page.click('[data-testid="history-item"] >> nth=0');
await page.waitForSelector('[data-testid="detail-exercise"]');
await page.screenshot({ path: `${out}/08-detail${suffix}.png`, fullPage: true });
await page.goto(`${base}/analytics`);
await page.waitForSelector('text=種目ごとの重量推移');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/09-analytics${suffix}.png`, fullPage: true });
await page.goto(`${base}/settings`);
await page.waitForSelector('text=店舗の器具');
await page.screenshot({ path: `${out}/10-settings${suffix}.png`, fullPage: true });
await page.goto(`${base}/coach`);
await page.waitForSelector('text=AIコーチ');
await page.screenshot({ path: `${out}/11-coach${suffix}.png`, fullPage: false });
await browser.close();
console.log("screenshots written to", out);
