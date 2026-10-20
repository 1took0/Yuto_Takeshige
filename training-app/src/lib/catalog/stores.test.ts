import { describe, expect, it } from "vitest";
import { setCustomStores, shortNameOf, storeName, workoutStoreName } from "./stores";
import { storeColor } from "@/components/analytics/chartTheme";

describe("stores", () => {
  it("短い名前", () => {
    expect(shortNameOf("LifeFit 北白川店")).toBe("北白川");
    expect(shortNameOf("lifefit出町柳店")).toBe("出町柳");
    expect(shortNameOf("市営ジム")).toBe("市営ジム");
  });
  it("他の人が追加した店舗の記録は記録時の名前で表示", () => {
    setCustomStores([]);
    expect(workoutStoreName({ storeId: "custom-zzz", storeLabel: "LifeFit 西院店" }, true)).toBe("西院");
    expect(workoutStoreName({ storeId: "custom-zzz" })).toBe("その他の店舗");
    expect(workoutStoreName({ storeId: "ichijoji" }, true)).toBe("一乗寺");
  });
  it("追加店舗は追加順に固定の色。標準店舗の色は変わらない", () => {
    setCustomStores([
      { id: "custom-a", name: "A", shortName: "A", custom: true },
      { id: "custom-b", name: "B", shortName: "B", custom: true },
    ]);
    expect(storeName("custom-b")).toBe("B");
    expect(storeColor("ichijoji", false)).toBe("#2a78d6");
    // 追加した店舗の色は id から決まる（店舗を消しても変わらず、他の人の端末でも同じ）
    const a = storeColor("custom-a", false);
    expect(a).toMatch(/^#[0-9a-f]{6}$/);
    expect(a).not.toBe("#2a78d6");
    setCustomStores([{ id: "custom-a", name: "A", shortName: "A", custom: true }]);
    expect(storeColor("custom-a", false)).toBe(a);
    expect(storeColor("custom-unknown", false)).toMatch(/^#[0-9a-f]{6}$/);
    setCustomStores([]);
  });
});
