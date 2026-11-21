// @ts-check
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CATALOG,
  clampActivityTarget,
  getActivityById,
  getActivityCatalog,
} from "../catalog.js";

describe("ai/pose/catalog", () => {
  it("contains all 7 required activities with every catalog field", () => {
    const catalog = getActivityCatalog();
    const ids = catalog.map((item) => item.id);
    expect(ids).toEqual([
      "catch_the_stars",
      "squats",
      "jumping_jacks",
      "freeze_dance",
      "tree_balance",
      "eskista",
      "floor_is_lava",
    ]);

    for (const item of catalog) {
      expect(typeof item.labelKey).toBe("string");
      expect(item.minTarget).toBeGreaterThan(0);
      expect(item.defaultTarget).toBeGreaterThanOrEqual(item.minTarget);
      expect(item.defaultTarget).toBeLessThanOrEqual(item.maxTarget);
      expect(item.durationSec).toBeGreaterThan(0);
      expect(item.supportsKeyboard).toBe(true);
      expect(typeof item.repsMeaning).toBe("string");
      expect(item.minSecPerRep).toBeGreaterThan(0);
    }
  });

  it("matches exact target ranges specified for each game", () => {
    expect(getActivityById("squats")).toMatchObject({ minTarget: 5, maxTarget: 15 });
    expect(getActivityById("jumping_jacks")).toMatchObject({ minTarget: 10, maxTarget: 30 });
    expect(getActivityById("freeze_dance")).toMatchObject({ minTarget: 3, maxTarget: 8 });
    expect(getActivityById("tree_balance")).toMatchObject({ minTarget: 5, maxTarget: 30 });
    expect(getActivityById("eskista")).toMatchObject({ minTarget: 10, maxTarget: 60 });
    expect(getActivityById("floor_is_lava")).toMatchObject({ durationSec: 60 });
  });

  it("returns defensive copies and clamps targets safely", () => {
    const first = getActivityCatalog();
    first[0].defaultTarget = 999;
    expect(ACTIVITY_CATALOG[0].defaultTarget).not.toBe(999);

    const squats = getActivityById("squats");
    expect(squats).not.toBeNull();
    expect(clampActivityTarget(/** @type {any} */ (squats), 2)).toBe(5);
    expect(clampActivityTarget(/** @type {any} */ (squats), 99)).toBe(15);
    expect(clampActivityTarget(/** @type {any} */ (squats), undefined)).toBe(10);
    expect(getActivityById("unknown_game")).toBeNull();
  });
});
