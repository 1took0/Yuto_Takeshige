import { test, expect } from "@playwright/test";
import type { Workout } from "../src/lib/types";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-name").fill("折りたたみテスト");
  await page.getByTestId("welcome-submit").click();
  await page.getByTestId("prefs-skip").click();
  const now = new Date().toISOString();
  const workout: Workout = {
    id: "synthetic-collapse", storeId: "ichijoji", trainingDate: now.slice(0, 10),
    startedAt: now, createdAt: now, updatedAt: now, status: "active", source: "app", cardio: [],
    exercises: ["chest_press", "lat_pulldown"].map((exerciseId, i) => ({
      id: `ex-${i}`, exerciseId, name: i ? "ラットプルダウン" : "チェストプレス",
      primary: ["chest"], restSec: 0, status: "planned",
      sets: [0, 1, 2].map((n) => ({ id: `set-${i}-${n}`, weight: 20, reps: 10, completed: false, excluded: n === 2 })),
    })),
  };
  await page.evaluate(async (workout) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("training-coach");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("workouts", "readwrite");
        tx.objectStore("workouts").put(workout);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, workout);
  await page.goto("/workout");
});

test("並べ替え・手動開閉後も最後の未完了セットで折りたたみ、再編集できる", async ({ page }) => {
  const cards = page.getByTestId("exercise-card");
  const chest = cards.filter({ has: page.getByRole("heading", { name: "チェストプレス", exact: true }) });
  const lat = cards.filter({ has: page.getByRole("heading", { name: "ラットプルダウン", exact: true }) });
  await expect(chest.locator("header")).toHaveAttribute("aria-expanded", "true");
  await chest.locator("header").click();
  // 実際の長押しドラッグで、2番目の種目を先頭へ移動する。
  const from = await lat.locator("header").boundingBox();
  const to = await chest.locator("header").boundingBox();
  if (!from || !to) throw new Error("並べ替え対象が見つかりません");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 5 });
  await page.mouse.up();
  await expect(cards.first()).toHaveAttribute("data-exercise-id", "lat_pulldown");
  await lat.locator("header").click();
  // 下のセットを先に完了しても、未完了セットがある間は閉じない。
  await lat.getByRole("button", { name: "セット2を完了にする", exact: true }).click();
  await expect(lat.locator("header")).toHaveAttribute("aria-expanded", "true");
  await lat.getByRole("button", { name: "セット1を完了にする", exact: true }).click();
  await expect(lat.locator("header")).toHaveAttribute("aria-expanded", "false");
  await expect(chest.locator("header")).toHaveAttribute("aria-expanded", "false");
  // 完了済みの種目を再度開き、解除→再完了しても折りたたむ。
  await lat.locator("header").click();
  await lat.getByRole("button", { name: "セット1を未完了に戻す", exact: true }).click();
  await expect(lat.locator("header")).toHaveAttribute("aria-expanded", "true");
  await lat.getByRole("button", { name: "セット1を完了にする", exact: true }).click();
  await expect(lat.locator("header")).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(cards.first()).toHaveAttribute("data-exercise-id", "lat_pulldown");
  await expect(lat.locator("header")).toHaveAttribute("aria-expanded", "false");
  await lat.locator("header").click();
  await expect(lat.getByRole("button", { name: /を未完了に戻す/ })).toHaveCount(2);
  await expect(lat.getByLabel("重量", { exact: true }).first()).toHaveValue("20");
});

test("通常の自動折りたたみと次の種目の表示を維持する", async ({ page }) => {
  const cards = page.getByTestId("exercise-card");
  await cards.first().getByRole("button", { name: "セット1を完了にする", exact: true }).click();
  await expect(cards.first().locator("header")).toHaveAttribute("aria-expanded", "true");
  await cards.first().getByRole("button", { name: "セット2を完了にする", exact: true }).click();
  await expect(cards.first().locator("header")).toHaveAttribute("aria-expanded", "false");
  await expect(cards.last().locator("header")).toHaveAttribute("aria-expanded", "true");
});

for (const manual of [false, true]) {
  test(`セット追加・回数変更後の折りたたみ（${manual ? "手動開閉後" : "初期表示"}）`, async ({ page }) => {
    const card = page.getByTestId("exercise-card").first();
    const header = card.locator("header");
    const rows = card.getByTestId("set-row");
    if (manual) {
      await header.click();
      await header.click();
    }
    await card.getByTestId("add-set").click();
    await card.getByTestId("add-set").click();
    await expect(rows).toHaveCount(5); // 既存2セット＋除外1セット＋追加2セット
    await rows.nth(0).getByLabel("目標回数", { exact: true }).fill("12");
    await rows.nth(0).getByLabel("目標回数", { exact: true }).press("Enter");
    await rows.nth(1).getByRole("button", { name: "目標回数を1増やす", exact: true }).click();
    await rows.nth(3).getByRole("button", { name: "目標回数を1減らす", exact: true }).click();
    for (const n of [1, 2]) {
      await card.getByRole("button", { name: `セット${n}を完了にする`, exact: true }).click();
      await expect(header).toHaveAttribute("aria-expanded", "true");
    }
    // 最後の行を先に完了しても、追加した未完了セットが残っている間は閉じない。
    await rows.nth(4).getByLabel("目標回数", { exact: true }).fill("8");
    await card.getByRole("button", { name: "セット5を完了にする", exact: true }).click();
    await expect(header).toHaveAttribute("aria-expanded", "true");
    // Enterを押さず回数入力から直接チェックしても、入力確定と完了が両方反映する。
    await rows.nth(3).getByLabel("目標回数", { exact: true }).fill("7");
    await card.getByRole("button", { name: "セット4を完了にする", exact: true }).click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    // 完了後に再びセットを増やした場合も、新しい最終セットで閉じる。
    await header.click();
    await card.getByTestId("add-set").click();
    await expect(rows).toHaveCount(6);
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await rows.nth(5).getByLabel("目標回数", { exact: true }).fill("6");
    await card.getByRole("button", { name: "セット6を完了にする", exact: true }).click();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(header).toHaveAttribute("aria-expanded", "false");
    await header.click();
    await expect(rows).toHaveCount(6);
    await expect(card.getByRole("button", { name: /を未完了に戻す/ })).toHaveCount(5);
    for (const [index, value] of ["12", "11", "10", "7", "8", "6"].entries()) {
      await expect(rows.nth(index).getByLabel("目標回数", { exact: true })).toHaveValue(value);
    }
  });
}

test("集中モードと履歴編集では入力中のカードを閉じない", async ({ page }) => {
  const card = page.getByTestId("exercise-card").first();
  await card.getByRole("button", { name: "この種目に集中", exact: true }).click();
  await card.getByRole("button", { name: "セット1を完了にする", exact: true }).click();
  await card.getByRole("button", { name: "セット2を完了にする", exact: true }).click();
  await expect(card.locator("header")).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "← すべての種目を表示", exact: true }).click();
  await expect(card.locator("header")).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("finish").click();
  await page.getByTestId("finish-confirm").click();
  await expect(page).toHaveURL(/\/history\/synthetic-collapse/);
  await page.getByTestId("edit-toggle").click();
  await card.getByRole("button", { name: "セット1を未完了に戻す", exact: true }).click();
  await card.getByRole("button", { name: "セット1を完了にする", exact: true }).click();
  await expect(card.locator("header")).toHaveAttribute("aria-expanded", "true");
});
