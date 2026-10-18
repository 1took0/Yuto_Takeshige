import { test, expect, type Page } from "@playwright/test";

/**
 * E2E：トレーニング開始 → メニュー作成 → セット編集 → 再読み込みで復元 → 終了・保存 → 履歴
 */
/** 初回設定（はじめに）を完了する */
async function onboard(page: Page, opts: { name?: string; importSeed?: boolean; share?: boolean } = {}) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByTestId("welcome-name").fill(opts.name ?? "テスト");
  if (opts.importSeed ?? true) await page.getByTestId("welcome-import").check();
  if (opts.share) await page.getByTestId("welcome-share").check();
  await page.getByTestId("welcome-submit").click();
  await expect(page.getByRole("heading", { name: "トレーニングコーチ" })).toBeVisible();
}

async function startWorkout(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "トレーニングコーチ" })).toBeVisible();
  await page.getByTestId("start").click();
  await expect(page.getByRole("heading", { name: "今日のコンディション" })).toBeVisible();
  // 店舗：一乗寺、60分、体調4、有酸素ランニング込み（初期値のまま）
  await page.getByRole("radio", { name: "60分" }).click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // IndexedDB をクリアしてから開始
  await page.goto("/");
  await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(dbs.map((d) => new Promise<void>((res) => { if (!d.name) return res(); const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); })));
    localStorage.clear();
    sessionStorage.clear();
  });
  await onboard(page);
});

test("初期履歴が取り込まれている", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByTestId("history-item").first()).toBeVisible();
  await expect(page.getByTestId("history-item")).toHaveCount(12);
  await expect(page.getByTestId("history-item").first()).toContainText("10/16");
});

test("メニュー作成 → セット編集 → 再読み込みで復元 → 保存", async ({ page }) => {
  await startWorkout(page);
  const cards = page.getByTestId("exercise-card");
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(4);

  // 最初の種目（開いている）でセット追加・重量編集・完了チェック
  const first = cards.first();
  const rowsBefore = await first.getByTestId("set-row").count();
  await first.getByTestId("add-set").click();
  await expect(first.getByTestId("set-row")).toHaveCount(rowsBefore + 1);

  // 1セット目の重量を +5kg（重量の＋ボタン）
  const firstRow = first.getByTestId("set-row").first();
  const weightInput = firstRow.getByLabel("重量", { exact: true });
  const before = Number(await weightInput.inputValue());
  await firstRow.getByRole("button", { name: /重量を.*増やす/ }).click();
  await expect(weightInput).toHaveValue(String(before + 5));

  // 重量を直接入力
  await weightInput.fill("42.5");
  await weightInput.press("Enter");
  await expect(weightInput).toHaveValue("42.5");

  // 完了チェック → 進捗が 1 になり休憩タイマーが出る
  await firstRow.getByRole("button", { name: /セット1を完了にする/ }).click();
  await expect(page.getByTestId("progress")).toContainText("1");
  await expect(page.getByTestId("rest-timer")).toBeVisible();
  await page.getByRole("button", { name: "休憩タイマーを閉じる" }).click();

  // 2セット目を削除（未完了なので確認なし）
  const rowsNow = await first.getByTestId("set-row").count();
  await first.getByTestId("set-row").nth(1).getByRole("button", { name: "セットを削除" }).click();
  await expect(first.getByTestId("set-row")).toHaveCount(rowsNow - 1);

  // 完了済みセットを削除 → 確認ダイアログ
  await firstRow.getByRole("button", { name: "セットを削除" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(first.getByTestId("set-row").first().getByLabel("重量", { exact: true })).toHaveValue("42.5");

  // 再読み込みしても状態が復元される
  await page.reload();
  await expect(page.getByTestId("progress")).toBeVisible();
  const restored = page.getByTestId("exercise-card").first();
  await expect(restored.getByTestId("set-row").first().getByLabel("重量", { exact: true })).toHaveValue("42.5");
  await expect(restored.getByTestId("set-row").first().getByRole("button", { name: /セット1を未完了に戻す/ })).toBeVisible();

  // ホームに「進行中」が出る
  await page.goto("/");
  await expect(page.getByTestId("resume")).toBeVisible();
  await page.getByTestId("resume").click();

  // 終了・保存
  await page.getByTestId("finish").click();
  await page.getByTestId("finish-confirm").click();
  await expect(page).toHaveURL(/\/history\/.+saved=1/);
  await expect(page.getByText("保存しました")).toBeVisible();
  await expect(page.getByTestId("detail-exercise").first()).toContainText("42.5kg");

  // 保存後に修正できる
  await page.getByTestId("edit-toggle").click();
  await expect(page.getByTestId("exercise-card").first()).toBeVisible();

  // 履歴が 13 件になっている
  await page.goto("/history");
  await expect(page.getByTestId("history-item")).toHaveCount(13);
});

test("チャットで「ジムに来た」→ヒアリング開始、「あと20分しかない」でメニュー短縮", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("coach-input").fill("ジムに来た");
  await page.getByTestId("coach-send").click();
  await expect(page.getByRole("heading", { name: "今日のコンディション" })).toBeVisible();
  await page.getByRole("radio", { name: "90分" }).click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
  const before = await page.getByTestId("exercise-card").count();
  await page.getByRole("button", { name: /コーチに相談/ }).click();
  await page.getByTestId("coach-input").fill("あと20分しかない");
  await page.getByTestId("coach-send").click();
  await expect(page.getByTestId("coach-reply")).toContainText("残り20分");
  const after = await page.getByTestId("exercise-card").count();
  expect(after).toBeLessThan(before);
});

test("タイマー：開始→一時停止→再開、再読み込みで復元", async ({ page }) => {
  await page.goto("/timer/rest");
  await expect(page.getByTestId("timer-main")).toBeVisible();
  await page.getByRole("button", { name: "90秒" }).click();
  await expect(page.getByTestId("timer-toggle")).toContainText("一時停止");
  await page.waitForTimeout(1500);
  await page.getByTestId("timer-toggle").click(); // 一時停止
  const paused = await page.getByTestId("segment-remaining").textContent();
  await page.waitForTimeout(1200);
  expect(await page.getByTestId("segment-remaining").textContent()).toBe(paused);
  await page.getByTestId("timer-toggle").click(); // 再開
  await page.waitForTimeout(1200);
  const afterResume = await page.getByTestId("segment-remaining").textContent();
  expect(afterResume).not.toBe(paused);
  // 再読み込み後も動作中のまま復元される
  await page.reload();
  await expect(page.getByTestId("timer-toggle")).toContainText("一時停止");
  const r1 = await page.getByTestId("segment-remaining").textContent();
  await page.waitForTimeout(1200);
  expect(await page.getByTestId("segment-remaining").textContent()).not.toBe(r1);
  await page.getByTestId("timer-reset").click();
  await expect(page.getByTestId("timer-toggle")).toContainText("開始");
});

test("設定：器具を「ない」にすると次回のメニューから除外される", async ({ page }) => {
  await page.goto("/settings");
  const row = page.getByTestId("equipment-row").filter({ hasText: "ペックフライマシン" });
  await row.getByRole("radio", { name: "ない" }).click();
  await expect(row.getByRole("radio", { name: "ない" })).toHaveAttribute("aria-checked", "true");
  await startWorkout(page);
  await expect(page.locator('[data-exercise-id="pec_fly"]')).toHaveCount(0);
  await expect(page.locator('[data-exercise-id="chest_press"]')).toHaveCount(1);
});

test("PWA: manifest と service worker が配信される", async ({ page, request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.ok()).toBeTruthy();
  const json = await m.json();
  expect(json.display).toBe("standalone");
  expect(json.icons.length).toBeGreaterThanOrEqual(2);
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  await page.goto("/");
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  expect(registered).toBe(true);
});

test("分析画面とダークモードが表示される", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "分析" })).toBeVisible();
  await expect(page.getByText("種目ごとの重量推移")).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "ダーク" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("店舗を追加してトレーニングし、削除後も記録に店舗名が残る", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("store-name").fill("LifeFit 北白川店");
  await page.getByTestId("store-add").click();
  await expect(page.getByTestId("store-list")).toContainText("LifeFit 北白川店");
  // 器具の設定タブに出て、選択されている
  await expect(page.locator(".chip[data-selected=true]", { hasText: "北白川" })).toBeVisible();

  await page.goto("/start");
  await page.getByRole("radio", { name: "北白川" }).click();
  await page.getByRole("radio", { name: "30分" }).click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
  await expect(page.getByText(/北白川/).first()).toBeVisible();
  await page.getByTestId("exercise-card").first().getByRole("button", { name: /セット1を完了にする/ }).click();
  await page.getByTestId("finish").click();
  await page.getByTestId("finish-confirm").click();
  await expect(page.getByText("LifeFit 北白川店").first()).toBeVisible();

  // 店舗を削除しても履歴には名前が残る
  await page.goto("/settings");
  const row = page.getByTestId("store-list").locator("li", { hasText: "LifeFit 北白川店" });
  await row.getByRole("button", { name: "削除" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("記録が 1 件");
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByTestId("store-list")).not.toContainText("北白川");
  await page.goto("/history");
  await expect(page.getByTestId("history-item").first()).toContainText("北白川");
});
