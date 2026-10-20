import { test, expect, type Page } from "@playwright/test";

/**
 * E2E：トレーニング開始 → メニュー作成 → セット編集 → 再読み込みで復元 → 終了・保存 → 履歴
 */
/** 初回設定（はじめに）を完了する */
async function onboard(page: Page, opts: { name?: string; importSeed?: boolean; share?: boolean } = {}) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByTestId("welcome-name").fill(opts.name ?? "テスト");
  if (opts.share) await page.getByTestId("welcome-share").check();
  await page.getByTestId("welcome-submit").click();
  // 初めての人は続けてヒアリングが出る（ここではスキップ）
  await expect(page.getByRole("heading", { name: "はじめてのヒアリング" })).toBeVisible();
  await page.getByTestId("prefs-skip").click();
  await expect(page.getByRole("heading", { name: "トレーニングコーチ" })).toBeVisible();
  if (opts.importSeed ?? true) await restoreOwner(page);
}

/** 作成者の過去記録を復元コードで取り込む */
async function restoreOwner(page: Page) {
  await page.goto("/restore");
  await page.getByTestId("restore-code").fill("e2e-owner");
  await page.getByTestId("restore-submit").click();
  await expect(page.getByText("12件の記録を取り込みました")).toBeVisible();
  await expect(page).toHaveURL(/\/history/);
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
  await page.getByRole("alertdialog").getByRole("button", { name: "キャンセル", exact: true }).click();
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

test("トレーニングを調整：選択肢から選ぶ（「ジムに来た」は無い）。「残り時間が少ない → 20分」でメニュー短縮", async ({ page }) => {
  await page.goto("/");
  // 自由入力の欄も「ジムに来た」も無い（トレーニング開始ボタンと同じなので）
  await expect(page.getByTestId("adjust-presets").locator("input, textarea")).toHaveCount(0);
  await expect(page.getByTestId("adjust-start")).toHaveCount(0);
  await expect(page.getByText("コーチに相談")).toHaveCount(0);
  await page.getByTestId("start").click();
  await expect(page.getByRole("heading", { name: "今日のコンディション" })).toBeVisible();
  await page.getByRole("radio", { name: "90分" }).click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
  const before = await page.getByTestId("exercise-card").count();
  await page.getByRole("button", { name: /トレーニングを調整/ }).click();
  await page.getByTestId("adjust-time").click();
  await page.getByTestId("adjust-step").getByRole("button", { name: "20分", exact: true }).click();
  await expect(page.getByTestId("adjust-reply")).toContainText("残り20分");
  const after = await page.getByTestId("exercise-card").count();
  expect(after).toBeLessThan(before);
});

test("トレーニングを調整の選択肢：疲れている部位・久しぶり・マシンが使えない", async ({ page }) => {
  await startWorkout(page);
  await page.getByRole("button", { name: /トレーニングを調整/ }).click();
  // 疲れている部位 → 脚 → 負荷を下げる
  await page.getByTestId("adjust-fatigue").click();
  await page.getByTestId("adjust-step").getByRole("button", { name: "脚", exact: true }).click();
  await page.getByTestId("adjust-fatigue-apply").click();
  await expect(page.getByTestId("adjust-reply")).toContainText("脚の疲労を考慮");
  // 久しぶりだった → 1〜2か月ぶり
  await page.getByTestId("adjust-comeback").click();
  await page.getByTestId("adjust-step").getByRole("button", { name: "1〜2か月ぶり" }).click();
  await expect(page.getByTestId("adjust-reply")).toContainText("ぶり");
  // マシンが使えない → 種目を選ぶと置き換わる
  await page.getByTestId("adjust-no_machine").click();
  const first = page.getByTestId("adjust-step").getByRole("button").nth(1);
  const name = (await first.textContent())!.trim();
  await first.click();
  await expect(page.getByTestId("adjust-reply")).toContainText(name);
});

test("タイマー：選んでもすぐには始まらず、スタート→一時停止→再開、再読み込みで復元", async ({ page }) => {
  await page.goto("/timer/countdown");
  await expect(page.getByTestId("timer-main")).toBeVisible();
  await page.getByRole("button", { name: "1分30秒" }).click();
  await page.getByTestId("timer-set").click();
  // セットしただけでは動かない
  await expect(page.getByTestId("timer-toggle")).toContainText("スタート");
  await expect(page.getByTestId("segment-remaining")).toHaveText("01:30");
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("segment-remaining")).toHaveText("01:30");
  await page.getByTestId("timer-toggle").click();
  await expect(page.getByTestId("timer-toggle")).toContainText("一時停止");
  await page.waitForTimeout(1500);
  await page.getByTestId("timer-toggle").click(); // 一時停止
  const paused = await page.getByTestId("segment-remaining").textContent();
  await page.waitForTimeout(1200);
  expect(await page.getByTestId("segment-remaining").textContent()).toBe(paused);
  await page.getByTestId("timer-toggle").click(); // 再開
  await page.waitForTimeout(1200);
  expect(await page.getByTestId("segment-remaining").textContent()).not.toBe(paused);
  // 再読み込み後も動作中のまま復元される
  await page.reload();
  await expect(page.getByTestId("timer-toggle")).toContainText("一時停止");
  const r1 = await page.getByTestId("segment-remaining").textContent();
  await page.waitForTimeout(1200);
  expect(await page.getByTestId("segment-remaining").textContent()).not.toBe(r1);
  await page.getByTestId("timer-reset").click();
  await expect(page.getByTestId("timer-toggle")).toContainText("スタート");
});

test("インターバルを自由に設定して切り替わる。履歴から呼び出せる", async ({ page }) => {
  await page.goto("/timer/interval");
  const ed = page.getByTestId("interval-editor");
  for (const [label, v] of [["運動の秒数", "3"], ["休憩の秒数", "2"], ["回数", "2"], ["準備の秒数", "0"]] as const) {
    await ed.getByLabel(label, { exact: true }).fill(v);
    await ed.getByLabel(label, { exact: true }).press("Enter");
  }
  await ed.getByLabel("タイマーの名前").fill("テスト用インターバル");
  await page.getByTestId("timer-set").click();
  await expect(page.getByTestId("segment-label")).toContainText("運動 1/2");
  await expect(page.getByTestId("timer-toggle")).toContainText("スタート");
  await page.getByTestId("timer-toggle").click();
  await expect(page.getByTestId("segment-label")).toContainText("休憩 1/2", { timeout: 6000 });
  await expect(page.getByTestId("segment-label")).toContainText("運動 2/2", { timeout: 6000 });

  // 通常タイマーも1回スタートして履歴に残す
  await page.goto("/timer/countdown");
  await page.getByRole("button", { name: "5分", exact: true }).click();
  await page.getByTestId("timer-set").click();
  await page.getByTestId("timer-toggle").click();
  await page.getByTestId("timer-toggle").click();

  // 履歴：最近使ったものが上。インターバルの履歴をタップ → インターバル画面にセットされ、未スタート
  const items = page.getByTestId("timer-history-item");
  await expect(items.first()).toContainText("タイマー 05:00");
  await items.filter({ hasText: "テスト用インターバル" }).click();
  await expect(page).toHaveURL(/\/timer\/interval/);
  await expect(page.getByTestId("segment-label")).toContainText("運動 1/2");
  await expect(page.getByTestId("timer-toggle")).toContainText("スタート");
  await expect(page.getByTestId("segment-remaining")).toHaveText("00:03");
});

test("設定：器具を「ない」にすると次回のメニューから除外される", async ({ page }) => {
  await page.goto("/settings#equipment");
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
  // 左右の筋力差・部位ごとの頻度は表示しない
  await expect(page.getByText("左右の筋力差")).toHaveCount(0);
  await expect(page.getByText("部位ごとの頻度")).toHaveCount(0);
  await page.goto("/settings#display");
  await page.getByRole("button", { name: "ダーク" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("店舗を追加してトレーニングし、削除後も記録に店舗名が残る", async ({ page }) => {
  await page.goto("/settings#stores");
  await page.getByTestId("store-name").fill("LifeFit 北白川店");
  await page.getByTestId("store-add").click();
  await expect(page.getByTestId("store-list")).toContainText("LifeFit 北白川店");
  // 器具の設定を開くと、追加した店舗のタブが選択されている
  await page.getByTestId("settings-equipment").getByRole("button", { name: /店舗の器具/ }).click();
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
  await page.goto("/settings#stores");
  const row = page.getByTestId("store-list").locator("li", { hasText: "LifeFit 北白川店" });
  await row.getByRole("button", { name: "削除" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("記録が 1 件");
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByTestId("store-list")).not.toContainText("北白川");
  await page.goto("/history");
  await expect(page.getByTestId("history-item").first()).toContainText("北白川");
});

test("終了時にトレーニング時間の内訳が出て、修正でき、履歴に表示される", async ({ page }) => {
  await page.goto("/settings#goals");
  // 設定の読み込み前に押すと保存されないことがあるため、再読み込みしても残っていることを確かめてから進む
  const preferDumbbell = page.getByTestId("prefer-dumbbell");
  await expect(async () => {
    if (!(await preferDumbbell.isChecked())) await preferDumbbell.check();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(preferDumbbell).toBeChecked({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await startWorkout(page);
  await expect(page.locator('[data-exercise-id^="db_"]').first()).toBeVisible();
  await page.getByTestId("exercise-card").first().getByRole("button", { name: /セット1を完了にする/ }).click();
  await page.getByRole("button", { name: "休憩タイマーを閉じる" }).click();
  await page.getByTestId("finish").click();
  const editor = page.getByTestId("duration-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("ダンベルの時間", { exact: true }).fill("35");
  await editor.getByLabel("ダンベルの時間", { exact: true }).press("Enter");
  await editor.getByLabel("合計の時間", { exact: true }).fill("50");
  await editor.getByLabel("合計の時間", { exact: true }).press("Enter");
  await page.getByTestId("finish-confirm").click();
  await expect(page.getByTestId("durations")).toContainText("合計50分");
  await expect(page.getByTestId("durations")).toContainText("ダンベル35");
  await page.goto("/history");
  await expect(page.getByTestId("history-item").first()).toContainText("50分（ダンベル35分）");
});

test("復元コードが違うと取り込めず、初回設定に取り込み項目は無い", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/");
  await expect(p).toHaveURL(/\/welcome/);
  await expect(p.getByText("既存の履歴")).toHaveCount(0);
  await p.goto("/restore");
  await p.getByTestId("restore-code").fill("wrong");
  await p.getByTestId("restore-submit").click();
  await expect(p.getByText("復元コードが違います")).toBeVisible();
  await ctx.close();
});

test("トレーニングをキャンセルでき、有酸素の入力は合計・走行・速度だけ", async ({ page }) => {
  await startWorkout(page);
  // 休憩時間の入力欄は無い
  await expect(page.getByLabel("休憩時間")).toHaveCount(0);
  // トレッドミル：折りたたまれているので開き、実績の入力欄は「実績を入力」で出す。項目は合計・走行・速度のみ
  const tm = page.getByTestId("cardio-card").filter({ hasText: "トレッドミル" });
  await expect(tm.locator("header")).toHaveAttribute("aria-expanded", "false");
  await tm.locator("header").click();
  await expect(tm.getByLabel("合計時間", { exact: true })).toHaveCount(0);
  await tm.getByTestId("cardio-actual-open").click();
  await expect(tm.getByLabel("合計時間", { exact: true })).toBeVisible();
  await expect(tm.getByLabel("ランニング時間", { exact: true })).toBeVisible();
  await expect(tm.getByLabel("ランニング速度", { exact: true })).toBeVisible();
  await expect(tm.getByLabel("最長連続走行")).toHaveCount(0);
  await expect(tm.getByLabel("距離", { exact: true })).toHaveCount(0);
  await expect(tm.getByLabel("傾斜", { exact: true })).toHaveCount(0);
  // バイク：負荷の入力は無い
  const bike = page.getByTestId("cardio-card").filter({ hasText: "エアロバイク" });
  await expect(bike.getByLabel("負荷レベル")).toHaveCount(0);

  // キャンセル（確認ダイアログで戻ることもできる）
  await page.getByTestId("cancel-workout").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(page.getByTestId("progress")).toBeVisible();
  await page.getByTestId("cancel-workout").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "キャンセルする" }).click();
  await expect(page.getByTestId("start")).toBeVisible();
  await page.goto("/workout");
  await expect(page.getByText("進行中のトレーニングはありません")).toBeVisible();
  await page.goto("/history");
  await expect(page.getByTestId("history-item")).toHaveCount(12);
});

test("種目を自分で作り、トレーニングで使える。削除しても記録に名前が残る", async ({ page }) => {
  // 設定から作成（自動作成に含める）
  await page.goto("/settings#exercises");
  await page.getByTestId("custom-ex-new").click();
  const form = page.getByTestId("custom-ex-form");
  await form.getByTestId("custom-ex-name").fill("ケーブルクランチ");
  await form.getByRole("button", { name: "腹直筋" }).click();
  await form.getByLabel("器具").selectOption("other");
  await form.getByTestId("custom-ex-auto").check();
  await page.getByTestId("custom-ex-save").click();
  await expect(page.getByTestId("custom-ex-list")).toContainText("ケーブルクランチ");

  // 重点「腹筋・体幹」で作ると自動で入る
  await page.goto("/start");
  await page.getByRole("radio", { name: "制限なし" }).click();
  await page.getByRole("radio", { name: "腹筋・体幹" }).click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("exercise-card").filter({ hasText: "ケーブルクランチ" })).toBeVisible();

  // トレーニング中に「一覧に無い種目を作る」→ そのまま追加される
  await page.getByTestId("add-exercise").click();
  await page.getByTestId("add-sheet-create").click();
  await page.getByTestId("custom-ex-name").fill("ダンベルプルオーバー");
  await page.getByTestId("custom-ex-form").getByRole("button", { name: "広背筋" }).click();
  await page.getByTestId("custom-ex-save").click();
  const added = page.getByTestId("exercise-card").filter({ hasText: "ダンベルプルオーバー" });
  await expect(added).toBeVisible();
  await added.locator("header").click();
  await added.getByRole("button", { name: /セット1を完了にする/ }).click();
  await page.getByRole("button", { name: "休憩タイマーを閉じる" }).click();
  await page.getByTestId("finish").click();
  await page.getByTestId("finish-confirm").click();
  await expect(page.getByTestId("detail-exercise").filter({ hasText: "ダンベルプルオーバー" })).toBeVisible();
  await expect(page.getByTestId("durations")).toContainText("ダンベル");

  // 削除しても記録に名前が残る
  await page.goto("/settings#exercises");
  const row = page.getByTestId("custom-ex-list").locator("li", { hasText: "ダンベルプルオーバー" });
  await row.getByRole("button", { name: "削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByTestId("custom-ex-list")).not.toContainText("ダンベルプルオーバー");
  await page.goto("/history");
  await page.getByTestId("history-item").first().click();
  await expect(page.getByTestId("detail-exercise").filter({ hasText: "ダンベルプルオーバー" })).toBeVisible();
});

test("メニューを作らずに自分で入力して記録できる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("manual-start").click();
  await expect(page.getByRole("heading", { name: "自分でメニューを入力" })).toBeVisible();
  await page.getByTestId("manual-create").click();
  await expect(page.getByTestId("manual-empty")).toBeVisible();
  // 種目を検索して追加
  await page.getByTestId("add-exercise").click();
  await page.getByLabel("種目検索").fill("チェストプレス");
  await page.getByRole("button", { name: /^チェストプレス/ }).first().click();
  const card = page.getByTestId("exercise-card").filter({ hasText: "チェストプレス" });
  await expect(card).toBeVisible();
  // 有酸素も追加できる
  await page.getByTestId("add-cardio-treadmill").click();
  await expect(page.getByTestId("cardio-card").filter({ hasText: "トレッドミル" })).toBeVisible();
  await card.getByRole("button", { name: /セット1を完了にする/ }).click();
  await page.getByRole("button", { name: "休憩タイマーを閉じる" }).click();
  await page.getByTestId("finish").click();
  await page.getByTestId("finish-confirm").click();
  await expect(page).toHaveURL(/\/history\//);
  await expect(page.getByTestId("detail-exercise").filter({ hasText: "チェストプレス" })).toBeVisible();
});

test("種目カード：線画のゴミ箱・フォームは閉じた状態・長押しで並べ替え・有酸素も削除できる", async ({ page }) => {
  await startWorkout(page);
  const cards = page.getByTestId("exercise-card");
  const first = cards.first();
  // セット削除は線画アイコン（絵文字ではない）
  const del = first.getByRole("button", { name: "セットを削除" }).first();
  await expect(del.locator("svg")).toBeVisible();
  await expect(del).not.toContainText("🗑");
  // 「実回数」ボタンは無い
  await expect(page.getByRole("button", { name: "実回数" })).toHaveCount(0);
  // フォームは最初は閉じていて、押すと開く
  await expect(first.getByTestId("form-panel")).toHaveCount(0);
  await first.getByTestId("form-toggle").click();
  await expect(first.getByTestId("form-panel")).toBeVisible();
  await expect(first.getByLabel("種目メモ")).toBeVisible();
  // 上下の矢印と「今日はスキップ」は無い
  await expect(page.getByRole("button", { name: "今日はスキップ" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "上へ移動" })).toHaveCount(0);

  // 2番目の種目の見出しを長押しして上へ動かすと、1番目と入れ替わる
  const names = async () => (await cards.locator("h3").allTextContents()).map((t) => t.trim());
  const before = await names();
  const second = cards.nth(1).locator("header");
  await second.scrollIntoViewIfNeeded();
  const box = (await second.boundingBox())!;
  const firstBox = (await cards.first().locator("header").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - ((box.y - firstBox.y + 20) * i) / 8);
  await page.mouse.up();
  await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)]);

  // 長押しせずにすぐ動かした場合は並べ替えない（スクロール扱い）
  const now = await names();
  const b2 = (await cards.nth(1).locator("header").boundingBox())!;
  await page.mouse.move(b2.x + 20, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + 20, b2.y - 200, { steps: 5 });
  await page.mouse.up();
  expect(await names()).toEqual(now);

  // 有酸素：「今日はやらない」は無く、削除できる
  await expect(page.getByRole("button", { name: "今日はやらない" })).toHaveCount(0);
  const tm = page.getByTestId("cardio-card").filter({ hasText: "トレッドミル" });
  // 順番が来るまで折りたたまれているので開いてから
  await tm.locator("header").click();
  await tm.getByTestId("cardio-delete").click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(page.getByTestId("cardio-card").filter({ hasText: "トレッドミル" })).toHaveCount(0);
});

test("休憩タイマー：設定した時間で始まり ±10秒で調整でき、最終セットの後は出ない", async ({ page }) => {
  // 設定で休憩時間を1分にする（保存を確かめてから進む）
  await page.goto("/settings#timer");
  const oneMin = page.getByRole("radiogroup", { name: "セット間の休憩時間" }).getByRole("radio", { name: "1分" });
  await expect(async () => {
    if ((await oneMin.getAttribute("aria-checked")) !== "true") await oneMin.click();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(oneMin).toHaveAttribute("aria-checked", "true", { timeout: 2000 });
  }).toPass({ timeout: 20_000 });

  await startWorkout(page);
  const card = page.getByTestId("exercise-card").first();
  const setCount = await card.getByTestId("set-row").count();
  expect(setCount).toBeGreaterThanOrEqual(2);
  await card.getByRole("button", { name: "セット1を完了にする" }).click();
  const timer = page.getByTestId("rest-timer");
  await expect(timer).toBeVisible();
  const remaining = async () => {
    const t = (await timer.locator(".text-2xl").textContent())!.trim();
    const [m, s] = t.split(":").map(Number);
    return m * 60 + s;
  };
  const r0 = await remaining();
  expect(r0).toBeGreaterThan(50);
  expect(r0).toBeLessThanOrEqual(60);
  await timer.getByRole("button", { name: "10秒延長" }).click();
  expect(await remaining()).toBeGreaterThan(r0 + 5);
  await timer.getByRole("button", { name: "10秒短くする" }).click();
  await timer.getByRole("button", { name: "10秒短くする" }).click();
  expect(await remaining()).toBeLessThan(r0 - 5);

  // 残りのセットを終える。最終セットの後はタイマーが閉じる
  for (let i = 2; i < setCount; i++) {
    await card.getByRole("button", { name: `セット${i}を完了にする` }).click();
    await expect(timer).toBeVisible();
  }
  await card.getByRole("button", { name: `セット${setCount}を完了にする` }).click();
  await expect(timer).toHaveCount(0);
});

test("有酸素のカードも長押しで種目の間へ並べ替えられる", async ({ page }) => {
  await startWorkout(page);
  const order = async () =>
    page.locator('[data-testid="exercise-card"], [data-testid="cardio-card"]').evaluateAll((els) => els.map((el) => (el.getAttribute("data-testid") === "cardio-card" ? (el.textContent?.includes("トレッドミル") ? "TM" : "BIKE") : "EX")));
  const before = await order();
  expect(before.at(-1)).toBe("TM");
  const tm = page.getByTestId("cardio-card").filter({ hasText: "トレッドミル" }).locator("header");
  // トレッドミルを長押しして、1番目の種目の位置まで上へ動かす
  await tm.scrollIntoViewIfNeeded();
  const box = (await tm.boundingBox())!;
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.waitForTimeout(600);
  // 指を画面の上端近くまで動かして止めると、自動でスクロールしながら上へ移動する
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y0 + ((60 - y0) * i) / 10);
  await expect.poll(async () => (await order()).indexOf("TM"), { timeout: 15_000 }).toBeLessThanOrEqual(1);
  await page.mouse.up();
  const after = await order();
  expect(after.indexOf("TM")).toBeLessThanOrEqual(1);
  // 再読み込みしても並び順が残る
  await page.reload();
  await expect(page.getByTestId("progress")).toBeVisible();
  expect((await order()).indexOf("TM")).toBe(after.indexOf("TM"));
});

test("重量の刻みを店舗ごとに変えられ、全セット終えた次の回は新しい重量に挑戦の注意書きが出る", async ({ page }) => {
  await startWorkout(page);
  const lp = page.locator('[data-testid="exercise-card"][data-exercise-id="leg_press"]');
  await expect(lp).toBeVisible();
  if (!(await lp.getByTestId("form-toggle").isVisible())) await lp.locator("header").click();
  // この店舗のレッグプレスの刻みを 2.5kg にする → 重量の ± も 2.5kg 刻みになる
  await lp.getByTestId("form-toggle").click();
  await lp.getByLabel("重量の刻み", { exact: true }).fill("2.5");
  await lp.getByLabel("重量の刻み", { exact: true }).press("Tab");
  await expect(lp.getByRole("button", { name: "重量を2.5増やす" }).first()).toBeVisible();
  // 予定のセットを全部終えて保存
  const n = await lp.getByTestId("set-row").count();
  for (let i = 1; i <= n; i++) {
    await lp.getByRole("button", { name: `セット${i}を完了にする` }).click();
    const close = page.getByRole("button", { name: "休憩タイマーを閉じる" });
    if (await close.isVisible()) await close.click();
  }
  await page.getByTestId("finish").click();
  await page.getByTestId("finish-confirm").click();
  await expect(page).toHaveURL(/\/history\//);

  // 次の回：前回 50kg を全セット達成 → 2.5kg 刻みで 52.5kg に挑戦。注意書きが出る
  // 同じ日の2回目は脚が後回しになりやすいので、時間制限なしで作ってレッグプレスを入れる
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByRole("radio", { name: "制限なし" }).click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
  const next = page.locator('[data-testid="exercise-card"][data-exercise-id="leg_press"]');
  if (!(await next.getByTestId("form-toggle").isVisible())) await next.locator("header").click();
  await expect(next.getByTestId("set-notice").first()).toContainText("新しい重量に挑戦（前回 50kg → 52.5kg）");
  await expect(next.getByLabel("重量", { exact: true }).last()).toHaveValue("52.5");
});

test("設定画面は項目ごとに開閉でき、他の画面からのリンクでは該当の項目が開く", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
  // 最初はすべて閉じている
  const headers = page.locator("[data-testid^=settings-] > button[aria-expanded]");
  expect(await headers.count()).toBeGreaterThanOrEqual(10);
  for (const h of await headers.all()) await expect(h).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "ダーク" })).toHaveCount(0);
  // 押すと開き、もう一度押すと閉じる
  const display = page.getByTestId("settings-display").getByRole("button", { name: /表示/ });
  await display.click();
  await expect(page.getByRole("button", { name: "ダーク" })).toBeVisible();
  await display.click();
  await expect(page.getByRole("button", { name: "ダーク" })).toHaveCount(0);
  // ヒアリング画面の「店舗を追加・編集」からは店舗の項目が開いた状態で表示される
  await page.goto("/start");
  await page.getByRole("link", { name: "＋ 店舗を追加・編集" }).click();
  await expect(page).toHaveURL(/\/settings#stores/);
  await expect(page.getByTestId("store-name")).toBeVisible();
});

test("タイマー画面：±10秒・±30秒で調整でき、スキップ・リセット・再生はマークで表示", async ({ page }) => {
  await page.goto("/timer/interval");
  for (const name of ["10秒延長", "10秒短くする", "30秒延長", "30秒短くする"]) await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of ["次の区間へ", "リセット"]) {
    const b = page.getByRole("button", { name, exact: true });
    await expect(b.locator("svg")).toBeVisible();
    await expect(b).not.toContainText(/[⏭↺]/);
  }
  await expect(page.getByTestId("timer-toggle").locator("svg")).toBeVisible();
  await expect(page.getByTestId("timer-toggle")).not.toContainText("▶");
});

test("種目一覧の × で標準の種目を削除でき、種目の追加に出なくなる。元に戻せる", async ({ page }) => {
  await page.goto("/settings#exercises");
  const list = page.getByTestId("custom-ex-list");
  await expect(list).toContainText("ベンチプレス");
  await expect(list).toContainText("スミスマシンスクワット");
  await list.getByRole("button", { name: "ペックフライを削除" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(list.getByTestId("exercise-row").filter({ hasText: /^ペックフライ/ })).toHaveCount(0);
  await page.getByTestId("deleted-ex").locator("summary").click();
  await expect(page.getByTestId("deleted-ex")).toContainText("ペックフライ");
  // 標準から外した種目（例：デッドリフト）は最初から一覧に入っていない
  await expect(list.getByTestId("exercise-row").filter({ hasText: /^デッドリフト/ })).toHaveCount(0);
  await expect(page.getByTestId("deleted-ex")).toContainText("デッドリフト");

  // 「定期的に入れたい種目」も種目一覧にある種目だけ
  await page.goto("/settings#goals");
  const favToggle = page.getByRole("button", { name: /定期的に入れたい種目/ });
  if ((await favToggle.getAttribute("aria-expanded")) !== "true") await favToggle.click();
  const goals = page.getByTestId("goals-editor");
  await expect(goals.getByText("ベンチプレス", { exact: true })).toBeVisible();
  await expect(goals.getByText("ペックフライ", { exact: true })).toHaveCount(0);
  // 「自動メニューから除外する種目」も種目一覧と同じ
  await page.goto("/settings#excluded");
  const excluded = page.getByTestId("settings-excluded");
  await expect(excluded.getByText("ベンチプレス", { exact: true })).toBeVisible();
  await expect(excluded.getByText("ペックフライ", { exact: true })).toHaveCount(0);

  // トレーニング中の「種目を追加」にも出ない。そこからも × で削除できる
  await startWorkout(page);
  await page.getByTestId("add-exercise").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /^ペックフライ/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "ベンチプレスを一覧から削除", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "削除" }).click();
  await expect(sheet.getByRole("button", { name: "ベンチプレスを一覧から削除", exact: true })).toHaveCount(0);

  // 設定から元に戻す
  await page.goto("/settings#exercises");
  await page.getByTestId("deleted-ex").locator("summary").click();
  await page.getByTestId("deleted-ex").locator("li", { hasText: "ペックフライ" }).getByRole("button", { name: "一覧に加える" }).click();
  await expect(page.getByTestId("custom-ex-list").getByTestId("exercise-row").filter({ hasText: /^ペックフライ/ })).toHaveCount(1);
});

test("店舗の器具：重量の刻みの数字が見え、変更できる", async ({ page }) => {
  await page.goto("/settings#equipment");
  const input = page.getByLabel("チェストプレスマシンの重量の刻み", { exact: true });
  await expect(input).toHaveValue("5");
  // 刻みの初期値はどの器具も 5kg（ダンベルも）
  await expect(page.getByLabel("ダンベルの重量の刻み", { exact: true })).toHaveValue("5");
  const box = (await input.boundingBox())!;
  expect(box.width).toBeGreaterThan(40);
  // 保存が終わる前に画面を離れないよう、再読み込みしても残っていることを確かめる
  await expect(async () => {
    const field = page.getByLabel("チェストプレスマシンの重量の刻み", { exact: true });
    if ((await field.inputValue()) !== "2.5") {
      await field.fill("2.5");
      await field.press("Tab");
      await page.waitForTimeout(300);
    }
    await page.reload();
    await expect(page.getByLabel("チェストプレスマシンの重量の刻み", { exact: true })).toHaveValue("2.5", { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
});

test("バイク・トレッドミル：作られた時間・負荷をそのまま使え、カードとタイマー画面で自分で変えられる", async ({ page }) => {
  await startWorkout(page);
  const bike = page.getByTestId("cardio-card").filter({ hasText: "エアロバイク" });
  await expect(bike).toBeVisible();
  const before = Number((await bike.locator("header").textContent())!.match(/計画 (\d+)分/)![1]);

  // カード：「時間・負荷を変更」で1区間目の負荷を L18 に
  await bike.getByTestId("cardio-edit").click();
  const level = bike.getByTestId("segment-row").first().getByRole("textbox", { name: /の負荷$/ });
  await level.fill("18");
  await level.blur();
  await bike.getByTestId("cardio-edit").click();
  await expect(bike.locator("table")).toContainText("L18");

  // タイマー画面：同じ内容が入っていて、時間を1分延ばしてセットできる
  await bike.getByRole("link", { name: /タイマーを開始/ }).click();
  await expect(page).toHaveURL(/\/timer\/bike/);
  const editor = page.getByTestId("cardio-timer-editor");
  await expect(editor.getByTestId("segment-row").first().getByRole("textbox", { name: /の負荷$/ })).toHaveValue("18");
  const time = editor.getByTestId("segment-row").first().getByRole("textbox", { name: /の時間$/ });
  const mins = Number(await time.inputValue());
  await time.fill(String(mins + 1));
  await time.blur();
  await page.getByTestId("cardio-timer-set").click();
  await expect(page.getByTestId("cardio-timer-set")).toBeDisabled();

  // メニューの計画にも反映される
  await page.goto("/workout");
  await expect(page.getByTestId("cardio-card").filter({ hasText: "エアロバイク" }).locator("header")).toContainText(`計画 ${before + 1}分`);
});

test("LifeFit 以外のジムを登録し、標準店舗を表示しないにして、器具に合ったメニューが作れる", async ({ page }) => {
  // 記録の無い新しい利用者として（取り込みは使わない）
  await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    await Promise.all(dbs.map((d) => new Promise<void>((res) => { if (!d.name) return res(); const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = () => res(); })));
  });
  await onboard(page, { name: "ジムの人", importSeed: false });
  await page.goto("/settings#stores");
  await page.getByTestId("store-name").fill("市営体育館トレーニング室");
  await page.getByTestId("store-add").click();
  await expect(page.getByTestId("store-list")).toContainText("市営体育館トレーニング室");
  // 標準の3店舗を表示しないにする
  for (const name of ["LifeFit一乗寺店", "LifeFit東山二条店", "LifeFit三条大橋店"]) {
    const row = page.getByTestId("store-row").filter({ hasText: name });
    await row.getByTestId("store-hide").click();
    await expect(row.getByTestId("store-hide")).toHaveText("表示する");
  }

  // 店舗の器具：追加した店舗のタブが選ばれている。すべて「ない」にしてから、パワーラック・ベンチ・ダンベル・マットを「ある」に
  await page.getByTestId("settings-equipment").getByRole("button", { name: /店舗の器具/ }).click();
  await expect(page.locator(".chip[data-selected=true]", { hasText: "市営体育館" })).toBeVisible();
  await page.getByTestId("equipment-all-no").click();
  for (const name of ["パワーラック（バーベル）", "ベンチ", "ダンベル", "マット（自重）"]) {
    await page.getByRole("radiogroup", { name: `${name}の有無`, exact: true }).getByRole("radio", { name: "ある" }).click();
  }
  await expect(page.getByRole("radiogroup", { name: "パワーラック（バーベル）の有無" }).getByRole("radio", { name: "ある" })).toHaveAttribute("aria-checked", "true");

  // 開始前の質問：選べる店舗は追加したジムだけで、最初から選ばれている
  await page.goto("/start");
  await expect(page.getByRole("radiogroup", { name: "店舗" }).getByRole("radio")).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "市営体育館トレー…" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "制限なし" }).click();
  await page.getByRole("radiogroup", { name: "有酸素" }).getByRole("radio", { name: "ランニング込み" }).click();
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("progress")).toBeVisible();
  const cards = page.getByTestId("exercise-card");
  await expect(cards.filter({ has: page.getByRole("heading", { name: "ベンチプレス", exact: true }) })).toHaveCount(1);
  await expect(cards.filter({ hasText: "バーベルスクワット" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "レッグプレス" })).toHaveCount(0);
  // トレッドミル・バイクは「ない」なので入らない
  await expect(page.getByTestId("cardio-card")).toHaveCount(0);
});
