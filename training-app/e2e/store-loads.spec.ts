import { test, expect } from "@playwright/test";
import type { Workout } from "../src/lib/types";

test("店舗の基準と他店舗の参考を分け、調整値を再表示・保存できる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-name").fill("店舗別テスト");
  await page.getByTestId("welcome-submit").click();
  await page.getByTestId("prefs-skip").click();
  const records: Workout[] = ["ichijoji", "higashiyama-nijo"].map((storeId, i) => {
    const date = new Date(Date.now() - (5 - i) * 86400000).toISOString().slice(0, 10);
    return { id: `synthetic-${i}`, storeId, trainingDate: date, startedAt: `${date}T10:00:00Z`, createdAt: date, updatedAt: date, status: "completed", source: "app",
      exercises: [{ id: `ex-${i}`, exerciseId: "chest_press", name: "チェストプレス", primary: ["chest"], restSec: 60, status: "done",
        sets: [0, 1].map((n) => ({ id: `set-${i}-${n}`, weight: i ? 100 : 50, reps: 12, plannedReps: 12, completed: true, excluded: false })) }], cardio: [] };
  });
  await page.evaluate(async (records) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("training-coach");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("workouts", "readwrite");
        for (const record of records) tx.objectStore("workouts").put(record);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, records);
  await page.goto("/start");
  await page.getByTestId("generate").click();
  const card = page.getByTestId("exercise-card").filter({ has: page.getByRole("heading", { name: /チェストプレス/ }) }).first();
  await expect(card).toBeVisible();
  if (!await card.getByTestId("other-store-reference").isVisible()) await card.locator("header").click();
  await expect(card).toContainText("この店舗の基準");
  await expect(card.getByTestId("other-store-reference")).toContainText("100 kg");
  const row = card.getByTestId("set-row").last();
  await expect(row.getByLabel("重量", { exact: true })).toHaveValue("50");
  await row.getByLabel("重量", { exact: true }).fill("32.5");
  await row.getByLabel("重量", { exact: true }).press("Enter");
  await row.getByRole("button", { name: /を完了にする/ }).click();
  await page.reload();
  if (!await card.getByTestId("other-store-reference").isVisible()) await card.locator("header").click();
  await expect(row.getByLabel("重量", { exact: true })).toHaveValue("32.5");
  await expect(card.getByTestId("other-store-reference")).toContainText("100 kg");
  await page.getByTestId("finish").click();
  await page.getByTestId("finish-confirm").click();
  await expect(page).toHaveURL(/\/history\//);
});
