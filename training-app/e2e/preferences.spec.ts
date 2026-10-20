import { test, expect, devices } from "@playwright/test";

/**
 * メニューの希望
 * - 初めてのトレーニングで希望を質問し、メニューに反映する
 * - その後に「トレーニングを調整」で選んだ希望も、以降のメニュー作成に反映する
 */
test("初回ヒアリングの希望と「トレーニングを調整」で選んだ希望がメニューに反映される", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByTestId("welcome-name").fill("ジロウ");
  await page.getByTestId("welcome-submit").click();

  // パスワード・はじめにの後に、続けてヒアリングが出る（スキップもできる）
  await expect(page).toHaveURL(/\/hearing/);
  await expect(page.getByRole("heading", { name: "はじめてのヒアリング" })).toBeVisible();
  await expect(page.getByTestId("prefs-skip")).toBeVisible();
  await page.getByRole("radio", { name: "はじめて" }).click();
  await page.getByRole("radiogroup", { name: "1回のトレーニング時間" }).getByRole("radio", { name: "60分" }).click();
  await page.getByRole("radiogroup", { name: "有酸素運動の希望" }).getByRole("radio", { name: "なし" }).click();
  await page.getByTestId("prefs-wish").fill("レッグプレスはやりたくない");
  await expect(page.getByTestId("prefs-wish-preview")).toContainText("レッグプレスは自動作成で選ばない");
  // 2ページ目：これまでに行っていた種目（ベンチプレス 60kg×8回）
  await page.getByTestId("prefs-next").click();
  await expect(page.getByTestId("prefs-page2")).toBeVisible();
  await expect(page.getByTestId("prefs-past-skip")).toBeVisible();
  await page.getByTestId("prefs-past-search").fill("ベンチプレス");
  await page.getByTestId("past-ex-option").filter({ hasText: /^ベンチプレス/ }).first().click();
  const chosen = page.getByTestId("past-ex-chosen");
  await expect(chosen).toHaveCount(1);
  await chosen.getByRole("textbox", { name: /の重量$/ }).fill("60");
  await chosen.getByRole("textbox", { name: /の回数$/ }).fill("8");
  await page.getByTestId("prefs-submit").click();
  await expect(page.getByRole("heading", { name: "トレーニングコーチ" })).toBeVisible();

  // 初めてのトレーニング：ヒアリングは済んでいるので、今日のコンディションから。希望が初期値になっている
  await page.getByTestId("start").click();
  await expect(page.getByRole("heading", { name: "今日のコンディション" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "有酸素" }).getByRole("radio", { name: "なし" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radiogroup", { name: "時間" }).getByRole("radio", { name: "60分" })).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
  const cards = page.getByTestId("exercise-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeLessThanOrEqual(6);
  await expect(cards.filter({ hasText: "レッグプレス" })).toHaveCount(0);
  // 以前行っていた種目はメニューに入り、その重量を参考に少し軽めから
  const bench = cards.filter({ has: page.getByRole("heading", { name: "ベンチプレス", exact: true }) });
  await expect(bench).toHaveCount(1);
  await expect(bench).toContainText("55 kg");
  await expect(page.getByTestId("cardio-card").filter({ hasText: "トレッドミル" })).toHaveCount(0);

  // 「トレーニングを調整」の「今後この種目は外したい」を選ぶ → 今日のメニューからも外れ、設定に残る
  await page.goto("/");
  await page.getByTestId("adjust-dislike").click();
  // 以前行っていたベンチプレスが胸の枠に入っているので、それを外す
  await page.getByTestId("adjust-step").getByRole("button", { name: "ベンチプレス", exact: true }).click();
  await expect(page.getByTestId("adjust-reply")).toContainText("次回以降のメニューに反映します");
  await page.goto("/workout");
  await expect(page.getByTestId("exercise-card").filter({ has: page.getByRole("heading", { name: "ベンチプレス", exact: true }) })).toHaveCount(0);
  await page.goto("/settings#preferences");
  await expect(page.getByTestId("prefs-summary")).toContainText("やりたくない種目：レッグプレス・ベンチプレス");
  await expect(page.getByTestId("prefs-summary")).toContainText("経験：はじめて");
  // 設定画面からヒアリング結果を編集できる
  await page.getByTestId("prefs-edit").click();
  await expect(page.getByRole("heading", { name: "ヒアリング結果の編集" })).toBeVisible();
  await page.getByRole("radio", { name: "半年未満" }).click();
  await page.getByRole("radiogroup", { name: "有酸素運動の希望" }).getByRole("radio", { name: "ウォーキング" }).click();
  await page.getByTestId("prefs-next").click();
  // 2ページ目に以前の答えが残っている
  await expect(page.getByTestId("past-ex-chosen")).toHaveCount(1);
  await page.getByTestId("prefs-submit").click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByTestId("prefs-summary")).toContainText("経験：半年未満");
  await expect(page.getByTestId("prefs-summary")).toContainText("有酸素：ウォーキング");

  // 2回目以降はヒアリングなしで今日のコンディションから
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "今日のコンディション" })).toBeVisible();
  await ctx.close();
});
