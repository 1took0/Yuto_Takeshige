import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrainingDB, setDb } from "@/lib/db";
import { getSettings, listAllWorkouts, updateSettings } from "@/lib/db/repo";
import { AiCoachExport } from "./AiCoachExport";

let db: TrainingDB;
beforeEach(() => {
  db = new TrainingDB(`ai-coach-ui-${crypto.randomUUID()}`);
  setDb(db);
});
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await db.delete(); });

it("希望は明示的に保存し、出力オプションの変更時には古い相談文を消す", async () => {
  await updateSettings({ profile: { userId: "private-user", displayName: "秘密氏名", shareToken: "secret-token", createdAt: "now" } });
  const original = await getSettings();
  render(<AiCoachExport />);
  const request = await screen.findByLabelText("相談したいこと・理想のメニュー");
  fireEvent.change(request, { target: { value: "時間に合った順番を提案して" } });
  expect((await getSettings()).aiCoachRequest).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "希望をこの端末に保存" }));
  await screen.findByText("希望をこの端末に保存しました。次回のAI相談にも使えます。");
  expect((await getSettings()).aiCoachRequest).toBe("時間に合った順番を提案して");
  fireEvent.click(screen.getByRole("button", { name: "相談文を作成" }));
  const preview = await screen.findByLabelText("コピーする相談文");
  expect((preview as HTMLTextAreaElement).value).toContain("時間に合った順番を提案して");
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  fireEvent.click(screen.getByRole("button", { name: "相談文をコピー" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  expect(writeText.mock.calls[0][0]).not.toContain("secret-token");
  fireEvent.click(screen.getByLabelText("店舗の実名を含める"));
  expect(screen.queryByLabelText("コピーする相談文")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "相談文をコピー" })).not.toBeInTheDocument();
  const after = await getSettings();
  expect(after.profile).toEqual(original.profile);
  expect(after.goals).toEqual(original.goals);
  expect(after.preferences).toEqual(original.preferences);
  expect(await listAllWorkouts()).toEqual([]);
});

it("クリップボードが拒否されても手動コピー用の文章を選択できる", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  render(<AiCoachExport />);
  fireEvent.click(await screen.findByRole("button", { name: "相談文を作成" }));
  const preview = await screen.findByLabelText("コピーする相談文") as HTMLTextAreaElement;
  fireEvent.click(screen.getByRole("button", { name: "相談文をコピー" }));
  await screen.findByText(/自動コピーできませんでした/);
  expect(preview).toHaveFocus();
  expect(preview.selectionStart).toBe(0);
  expect(preview.selectionEnd).toBe(preview.value.length);
});
