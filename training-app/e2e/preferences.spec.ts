import { test, expect, devices } from "@playwright/test";

/**
 * メニューの希望
 * - 初めてのトレーニングで希望を質問し、メニューに反映する
 * - その後にコーチへ伝えた希望も、以降のメニュー作成に反映する
 */
test("初回ヒアリングの希望とコーチに伝えた希望がメニューに反映される", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByTestId("welcome-name").fill("ジロウ");
  await page.getByTestId("welcome-submit").click();
  await expect(page.getByRole("heading", { name: "トレーニングコーチ" })).toBeVisible();

  // 初めてのトレーニング：先に希望を質問される
  await page.getByTestId("start").click();
  await expect(page.getByRole("heading", { name: "はじめてのヒアリング" })).toBeVisible();
  await page.getByRole("radio", { name: "はじめて" }).click();
  await page.getByRole("radiogroup", { name: "1回のトレーニング時間" }).getByRole("radio", { name: "60分" }).click();
  await page.getByRole("radiogroup", { name: "有酸素運動の希望" }).getByRole("radio", { name: "なし" }).click();
  await page.getByTestId("prefs-wish").fill("レッグプレスはやりたくない");
  await expect(page.getByTestId("prefs-wish-preview")).toContainText("レッグプレスは自動作成で選ばない");
  await page.getByTestId("prefs-submit").click();

  // 今日のコンディション：希望が初期値になっている
  await expect(page.getByRole("heading", { name: "今日のコンディション" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "有酸素" }).getByRole("radio", { name: "なし" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radiogroup", { name: "時間" }).getByRole("radio", { name: "60分" })).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
  const cards = page.getByTestId("exercise-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(6);
  await expect(cards.filter({ hasText: "レッグプレス" })).toHaveCount(0);
  await expect(page.getByTestId("cardio-card").filter({ hasText: "トレッドミル" })).toHaveCount(0);

  // コーチに今後の希望を伝える → 今日のメニューからも外れ、設定に残る
  await page.goto("/");
  await page.getByTestId("coach-input").fill("次からチェストプレスは苦手なので外して");
  await page.getByTestId("coach-send").click();
  await expect(page.getByTestId("coach-reply")).toContainText("次回以降のメニューに反映します");
  await page.goto("/workout");
  await expect(page.getByTestId("exercise-card").filter({ hasText: "チェストプレス" })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByTestId("prefs-summary")).toContainText("除外：レッグプレス・チェストプレス");

  // 2回目以降はヒアリングなしで今日のコンディションから
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "今日のコンディション" })).toBeVisible();
  await ctx.close();
});
