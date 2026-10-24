import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TrainingDB, setDb } from "@/lib/db";
import { getSettings } from "@/lib/db/repo";
import { AiCoachImport } from "./AiCoachImport";

let database: TrainingDB;
beforeEach(() => { database = new TrainingDB(`ai-import-ui-${crypto.randomUUID()}`); setDb(database); });
afterEach(async () => { cleanup(); await database.delete(); });
const payload = JSON.stringify({ format: "training-coach-policy", version: 1, summary: "普段は歩行を入れる", preferences: { cardio: "walk" } });

it("確認・保存を分け、編集で確認を無効にし、直前の保存を戻せる", async () => {
  const initial = await getSettings(); const onApplied = vi.fn();
  render(<AiCoachImport onApplied={onApplied} />);
  const input = screen.getByLabelText("AIからの方針の返却文");
  fireEvent.change(input, { target: { value: payload } });
  fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
  await screen.findByTestId("ai-policy-preview");
  expect((await getSettings()).preferences).toEqual(initial.preferences);
  fireEvent.change(input, { target: { value: `${payload}\n` } });
  expect(screen.queryByTestId("ai-policy-preview")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
  fireEvent.click(await screen.findByRole("button", { name: "この方針を次回以降に反映" }));
  await screen.findByText("方針を保存しました。次回以降の自動メニューに反映します。");
  expect((await getSettings()).preferences?.cardio).toBe("walk");
  expect(onApplied).toHaveBeenCalledOnce();
  fireEvent.click(await screen.findByRole("button", { name: "直前の取り込みを元に戻す" }));
  await screen.findByText("直前の取り込み前の方針に戻しました。");
  await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(2));
  expect((await getSettings()).preferences).toEqual(initial.preferences);
});

it("自然文だけでは保存できず、形式の修正を案内する", async () => {
  const initial = await getSettings();
  render(<AiCoachImport onApplied={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("AIからの方針の返却文"), { target: { value: "毎週重量を増やして" } });
  fireEvent.click(screen.getByRole("button", { name: "変更内容を確認" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("training-coach-policy");
  expect(screen.queryByRole("button", { name: "この方針を次回以降に反映" })).not.toBeInTheDocument();
  expect((await getSettings()).preferences).toEqual(initial.preferences);
});
