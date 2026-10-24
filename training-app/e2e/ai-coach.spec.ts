import { test, expect } from "@playwright/test";

test("ボタン1回で実際のクリップボードに相談文をコピーできる", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByTestId("welcome-name").fill("コピーテスト");
  await page.getByTestId("welcome-submit").click();
  await page.getByTestId("prefs-skip").click();
  await page.getByTestId("ai-coach-link").click();
  await page.getByRole("button", { name: "AIに送るプロンプトをコピー" }).click();
  await expect(page.getByRole("region", { name: "AIへ送るプロンプト" }).getByRole("status")).toContainText("コピーしました");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("training-coach-policy");
  expect(text).toContain("minSessionsAtWeight");
  expect(text).not.toContain("コピーテスト");
  await expect(page.getByLabel("手動でコピーする相談文")).toHaveCount(0);
});

test("コピーと取り込みだけの画面で相談文を自動作成し、希望はAIへ質問する", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-name").fill("AI相談テスト");
  await page.getByTestId("welcome-submit").click();
  await page.getByTestId("prefs-skip").click();
  await page.getByTestId("ai-coach-link").click();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(1);
  // 実ブラウザのクリップボード拒否時の経路を使い、相談文の実内容も確認する。
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: async () => { throw new Error("synthetic clipboard denial"); },
  } }));
  await page.getByRole("button", { name: "AIに送るプロンプトをコピー" }).click();
  const text = await page.getByLabel("手動でコピーする相談文").inputValue();
  expect(text).toContain("このチャットで");
  expect(text).toContain("一乗寺店");
  expect(text).toContain("requiredSuccesses");
  expect(text).not.toContain("AI相談テスト");
  expect(text).not.toContain("今日の条件");
  await page.goto("/settings");
  await page.getByRole("link", { name: "AIにメニューを相談（方針を相談・反映）" }).click();
  await expect(page.getByRole("button", { name: "AIに送るプロンプトをコピー" })).toBeVisible();
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
  await expect(page.getByRole("region", { name: "AIで決めた方針を取り込む" }).getByRole("alert")).toContainText("返却形式");
  const policy = JSON.stringify({ format: "training-coach-policy", version: 1, summary: "胸を先に、バイクは省いて継続する", preferences: {
    timeLimitMin: 60, cardio: "walk", warmupBike: "no", progressionMode: "cautious", progression: { requiredSuccesses: 3, minSessionsAtWeight: 4, maxIncreasePercent: 5, strategy: "reps_first", repRange: { min: 8, max: 12 } },
    exerciseOrder: ["chest_press"], exerciseRules: [{ exerciseId: "chest_press", sets: 2, reps: 11, restSec: 90 }],
  }, goals: { favoriteExerciseIds: ["chest_press"] } });
  await input.fill(policy);
  await page.getByRole("button", { name: "変更内容を確認" }).click();
  await expect(page.getByTestId("ai-policy-preview")).toContainText("チェストプレス");
  await expect(page.getByTestId("ai-policy-preview")).toContainText("3回連続達成");
  await page.reload(); // 確認だけでは保存されない
  await expect(page.getByRole("button", { name: "直前の取り込みを元に戻す" })).toHaveCount(0);
  const apply = async () => {
    await input.fill(policy);
    await page.getByRole("button", { name: "変更内容を確認" }).click();
    await page.getByRole("button", { name: "この方針を次回以降に反映" }).click();
    await expect(page.getByRole("region", { name: "AIで決めた方針を取り込む" }).getByRole("status")).toContainText("方針を保存しました");
  };
  await apply();
  await page.reload();
  await expect(page.getByText("胸を先に、バイクは省いて継続する", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "直前の取り込みを元に戻す" }).click();
  await expect(page.getByRole("region", { name: "AIで決めた方針を取り込む" }).getByRole("status")).toContainText("取り込み前の方針に戻しました");
  await apply();
  await page.goto("/start");
  await expect(page.getByRole("radio", { name: "60分", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "ウォーキングのみ", exact: true })).toBeChecked();
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
