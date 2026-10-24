import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrainingDB, setDb } from "@/lib/db";
import { getSettings, listAllWorkouts, updateSettings } from "@/lib/db/repo";
import { AiCoachExport } from "./AiCoachExport";

let db: TrainingDB;
beforeEach(() => { db = new TrainingDB(`ai-simple-ui-${crypto.randomUUID()}`); setDb(db); vi.stubGlobal("ClipboardItem", undefined); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); await db.delete(); });

it("希望や店舗を質問せず、1回の操作で自動選択した相談文をコピーする", async () => {
  await updateSettings({ profile: { userId: "private-user", displayName: "秘密氏名", shareToken: "secret-token", createdAt: "now" }, aiCoachRequest: "古い秘密希望" });
  const original = await getSettings();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<AiCoachExport />);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("相談したいこと・理想のメニュー")).not.toBeInTheDocument();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "AIに送るプロンプトをコピー" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  const text = writeText.mock.calls[0][0];
  for (const forbidden of ["secret-token", "秘密氏名", "古い秘密希望"]) expect(text).not.toContain(forbidden);
  expect(text).toContain("一乗寺店");
  expect(text).toContain("このチャットで");
  expect(text).toContain("requiredSuccesses");
  expect(await getSettings()).toEqual(original);
  expect(await listAllWorkouts()).toEqual([]);
});

it("拒否時だけ手動コピー欄を表示し、選択できる", async () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  render(<AiCoachExport />);
  fireEvent.click(screen.getByRole("button", { name: "AIに送るプロンプトをコピー" }));
  const output = await screen.findByLabelText("手動でコピーする相談文") as HTMLTextAreaElement;
  fireEvent.focus(output);
  expect(output.selectionStart).toBe(0);
  expect(output.selectionEnd).toBe(output.value.length);
  expect(output.value).toContain("training-coach-policy");
});

it("非同期クリップボードではクリック直後にPromise付きItemを渡す", async () => {
  let pending: Promise<Blob> | undefined;
  vi.stubGlobal("ClipboardItem", class { constructor(values: Record<string, Promise<Blob>>) { pending = values["text/plain"]; } });
  const write = vi.fn(async () => { await pending; });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
  render(<AiCoachExport />);
  fireEvent.click(screen.getByRole("button", { name: "AIに送るプロンプトをコピー" }));
  expect(write).toHaveBeenCalledOnce();
  await screen.findByText(/コピーしました。使いたいAI/);
  expect(await pending).toBeInstanceOf(Blob);
});
