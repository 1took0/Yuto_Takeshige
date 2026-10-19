import { test, expect, type Browser, type Page } from "@playwright/test";
import { devices } from "@playwright/test";

/**
 * 複数人での利用と記録共有
 * - 新しい利用者は空の状態から始まる（作成者の履歴は入らない）
 * - 共有をオンにした人の記録だけが「みんな」に表示される
 * - 共有をオフにするとサーバー上の記録が消える
 */
async function newUser(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  return ctx.newPage();
}

async function onboard(page: Page, name: string, opts: { importSeed?: boolean; share?: boolean }) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByTestId("welcome-name").fill(name);
  if (opts.share) await page.getByTestId("welcome-share").check();
  await page.getByTestId("welcome-submit").click();
  await expect(page.getByRole("heading", { name: "トレーニングコーチ" })).toBeVisible();
  if (opts.importSeed) {
    await page.goto("/restore");
    await page.getByTestId("restore-code").fill("e2e-owner");
    await page.getByTestId("restore-submit").click();
    await expect(page.getByText("12件の記録を取り込みました")).toBeVisible();
  }
}

test("新しい利用者は空の履歴から始まり、目標を設定できる", async ({ browser }) => {
  const page = await newUser(browser);
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByTestId("welcome-name").fill("ハナコ");
  await page.getByRole("button", { name: "筋力向上" }).click();
  await page.getByRole("radio", { name: "右が弱い" }).click();
  await page.getByTestId("welcome-submit").click();
  await expect(page.getByRole("heading", { name: "トレーニングコーチ" })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByText("記録がありません")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: "右が弱い" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "筋力向上" })).toHaveAttribute("aria-pressed", "true");
  await page.context().close();
});

test("共有した人の記録だけが「みんな」に表示され、やめると消える", async ({ browser }) => {
  const stamp = Date.now().toString(36);
  const nameA = `A-${stamp}`;
  const nameB = `B-${stamp}`;
  const nameC = `C-${stamp}`;

  // A：作成者の履歴を取り込み、共有オン
  const a = await newUser(browser);
  await onboard(a, nameA, { importSeed: true, share: true });
  await a.goto("/settings");
  await expect(a.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");

  // C：共有しない
  const c = await newUser(browser);
  await onboard(c, nameC, { importSeed: true, share: false });

  // B：共有オフのまま「みんな」を見る → A は見え、C は見えない
  const b = await newUser(browser);
  await onboard(b, nameB, { share: false });
  await b.goto("/community");
  const userA = b.getByTestId("community-user").filter({ hasText: nameA });
  await expect(userA).toBeVisible();
  await expect(userA).toContainText("12回");
  await expect(b.getByTestId("community-user").filter({ hasText: nameC })).toHaveCount(0);
  await expect(b.getByTestId("community-user").filter({ hasText: nameB })).toHaveCount(0);

  // A の記録の詳細が見られる（10/16 東山二条）
  await userA.click();
  await expect(b.getByRole("heading", { name: `${nameA} さんの記録` })).toBeVisible();
  await expect(b.getByTestId("user-workout").first()).toContainText("10/16");
  await expect(b.getByTestId("detail-exercise").first()).toBeVisible();

  // B が共有をオンにすると表示される
  await b.goto("/settings");
  await b.getByTestId("share-toggle").click();
  await expect(b.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "true");
  await b.goto("/community");
  await expect(b.getByTestId("community-user").filter({ hasText: nameB })).toContainText("（あなた）");

  // A が共有をやめると、B から見えなくなる
  await a.goto("/settings");
  await a.getByTestId("share-toggle").click();
  await a.getByRole("button", { name: "共有をやめる" }).click();
  await expect(a.getByTestId("share-toggle")).toHaveAttribute("aria-checked", "false");
  await b.reload();
  await expect(b.getByTestId("community-user").filter({ hasText: nameB })).toBeVisible();
  await expect(b.getByTestId("community-user").filter({ hasText: nameA })).toHaveCount(0);

  // B がトレーニングを保存すると自動で共有される
  await b.goto("/start");
  // 記録の無い新しい利用者は、最初に希望のヒアリングがある（ここではスキップ）
  await b.getByTestId("prefs-skip").click();
  await b.getByRole("radio", { name: "30分" }).click();
  await b.getByTestId("generate").click();
  await b.getByTestId("exercise-card").first().getByRole("button", { name: /セット1を完了にする/ }).click();
  await b.getByTestId("finish").click();
  await b.getByTestId("finish-confirm").click();
  await expect(b).toHaveURL(/\/history\//);
  await expect
    .poll(
      async () => {
        await b.goto("/community");
        return b.getByTestId("community-user").filter({ hasText: nameB }).textContent();
      },
      { timeout: 15_000 },
    )
    .toContain("1回");
  await expect(b.getByTestId("feed-item").filter({ hasText: nameB }).first().getByTestId("feed-durations")).toContainText("合計");

  for (const p of [a, b, c]) await p.context().close();
});
