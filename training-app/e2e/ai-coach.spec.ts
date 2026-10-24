import { test, expect } from "@playwright/test";

test("AI相談を保存・再表示し、確認済みの相談文をダウンロードできる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-name").fill("AI相談テスト");
  await page.getByTestId("welcome-submit").click();
  await page.getByTestId("prefs-skip").click();
  await page.getByTestId("ai-coach-link").click();
  const request = page.getByLabel("相談したいこと・理想のメニュー");
  await request.fill("普段は30分で、好みの順番を相談したい");
  await page.getByRole("button", { name: "希望をこの端末に保存" }).click();
  await expect(page.getByRole("status").filter({ hasText: "希望をこの端末に保存しました" })).toBeVisible();
  await page.reload();
  await expect(request).toHaveValue("普段は30分で、好みの順番を相談したい");
  await page.getByRole("button", { name: "相談文を作成" }).click();
  const preview = page.getByLabel("コピーする相談文");
  await expect(preview).toContainText("普段は30分で、好みの順番を相談したい");
  expect(await preview.inputValue()).toContain("training-coach-policy");
  expect(await preview.inputValue()).not.toContain("今日の条件");
  expect(await preview.inputValue()).not.toContain("AI相談テスト");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "テキストを保存" }).click();
  expect((await download).suggestedFilename()).toMatch(/^training-ai-\d{4}-\d{2}-\d{2}\.txt$/);
  await page.getByLabel("店舗の実名を含める").check();
  await expect(preview).toHaveCount(0);
  await page.getByRole("button", { name: "相談文を作成" }).click();
  await expect(preview).toBeVisible();
  await page.getByRole("link", { name: "方針を使って次のメニューを作る" }).click();
  await expect(page).toHaveURL(/\/start/);
  await page.goto("/settings");
  await page.getByRole("link", { name: "AIにメニューを相談（方針を相談・反映）" }).click();
  await expect(request).toHaveValue("普段は30分で、好みの順番を相談したい");
});

test("会話の返却文を確認・保存・取り消しでき、継続する方針で次のメニューを作る", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-name").fill("方針テスト");
  await page.getByTestId("welcome-submit").click();
  await page.getByTestId("prefs-skip").click();
  await page.getByTestId("ai-coach-link").click();
  const input = page.getByLabel("AIからの方針の返却文");
  await input.fill("方針を変えてください");
  await page.getByRole("button", { name: "変更内容を確認" }).click();
  await expect(page.getByRole("alert")).toContainText("返却形式");
  const policy = JSON.stringify({ format: "training-coach-policy", version: 1, summary: "胸を先に、バイクは省いて継続する", preferences: {
    timeLimitMin: 60, cardio: "walk", warmupBike: "no", progressionMode: "cautious",
    exerciseOrder: ["chest_press"], exerciseRules: [{ exerciseId: "chest_press", sets: 2, reps: 11, restSec: 90 }],
  }, goals: { favoriteExerciseIds: ["chest_press"] } });
  await input.fill(policy);
  await page.getByRole("button", { name: "変更内容を確認" }).click();
  await expect(page.getByTestId("ai-policy-preview")).toContainText("チェストプレス");
  await page.reload(); // 確認だけでは保存されない
  await expect(page.getByRole("button", { name: "直前の取り込みを元に戻す" })).toHaveCount(0);
  const apply = async () => {
    await input.fill(policy);
    await page.getByRole("button", { name: "変更内容を確認" }).click();
    await page.getByRole("button", { name: "この方針を次回以降に反映" }).click();
    await expect(page.getByRole("status")).toContainText("方針を保存しました");
  };
  await apply();
  await page.reload();
  await expect(page.getByText("胸を先に、バイクは省いて継続する", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "直前の取り込みを元に戻す" }).click();
  await expect(page.getByRole("status")).toContainText("取り込み前の方針に戻しました");
  await apply();
  await page.getByRole("link", { name: "方針を使って次のメニューを作る" }).click();
  await expect(page.getByRole("radio", { name: "60分", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "ウォーキング", exact: true })).toBeChecked();
  await page.getByTestId("generate").click();
  const first = page.getByTestId("exercise-card").first();
  await expect(first).toHaveAttribute("data-exercise-id", "chest_press");
  await expect(first.getByTestId("set-row")).toHaveCount(2);
  await expect(first.getByLabel("目標回数", { exact: true }).first()).toHaveValue("11");
  // ブラウザ上の保存結果でも新しい計画と有酸素を確認する。
  const workout = await page.evaluate(async () => new Promise<{ cardio: { machine: string }[]; exercises: { restSec: number }[] }>((resolve, reject) => {
    const open = indexedDB.open("training-coach");
    open.onsuccess = () => {
      const db = open.result; const request = db.transaction("workouts").objectStore("workouts").getAll();
      request.onsuccess = () => { db.close(); resolve(request.result.find((w) => w.status === "active")); };
      request.onerror = () => reject(request.error);
    };
    open.onerror = () => reject(open.error);
  }));
  expect(workout.exercises[0].restSec).toBe(90);
  expect(workout.cardio.some((c) => c.machine === "bike")).toBe(false);
  expect(workout.cardio.some((c) => c.machine === "treadmill")).toBe(true);
});
