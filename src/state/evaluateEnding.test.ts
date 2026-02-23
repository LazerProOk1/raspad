import { describe, expect, it } from "vitest";
import type { GameState } from "./GameState";
import { createInitialState } from "./GameState";
import { evaluateEnding } from "./evaluateEnding";

const makeState = (overrides: Partial<GameState>): GameState => ({
  ...createInitialState(),
  ...overrides,
  choices: {
    ...createInitialState().choices,
    ...(overrides.choices ?? {})
  },
  flags: {
    ...createInitialState().flags,
    ...(overrides.flags ?? {})
  },
  completedMiniGames: overrides.completedMiniGames
    ? [...overrides.completedMiniGames]
    : [...createInitialState().completedMiniGames],
  inventory: overrides.inventory ? [...overrides.inventory] : [...createInitialState().inventory]
});

describe("evaluateEnding", () => {
  it("returns crown for crown happy path", () => {
    const state = makeState({
      choices: { choice1: "A", choice2: "A" },
      inventory: ["military_doc", "evac_data"]
    });

    expect(evaluateEnding(state)).toBe("crown");
  });

  it("returns will for will happy path", () => {
    const state = makeState({
      choices: { choice1: "B", choice2: "B" },
      inventory: ["pistol", "ammo", "guilt_doc"]
    });

    expect(evaluateEnding(state)).toBe("will");
  });

  it("returns wife for wife happy path fallback", () => {
    const state = makeState({
      choices: { choice1: "A", choice2: "B" },
      inventory: ["family_items"]
    });

    expect(evaluateEnding(state)).toBe("wife");
  });

  it("crown fails when evac_data is missing", () => {
    const state = makeState({
      choices: { choice1: "A", choice2: "A" },
      inventory: ["military_doc"]
    });

    expect(evaluateEnding(state)).toBe("wife");
  });

  it("crown fails when choice2 is not A", () => {
    const state = makeState({
      choices: { choice1: "A", choice2: "B" },
      inventory: ["military_doc", "evac_data"]
    });

    expect(evaluateEnding(state)).toBe("wife");
  });

  it("will fails when ammo is missing", () => {
    const state = makeState({
      choices: { choice1: "B", choice2: "B" },
      inventory: ["pistol", "guilt_doc"]
    });

    expect(evaluateEnding(state)).toBe("wife");
  });

  it("falls back to wife (not crown) when crown conditions are not met", () => {
    const state = makeState({
      choices: { choice1: "B", choice2: "A" },
      inventory: ["military_doc", "evac_data"]
    });

    expect(evaluateEnding(state)).toBe("wife");
  });

  it("returns wife for empty inventory", () => {
    const state = makeState({
      choices: { choice1: "A", choice2: "A" },
      inventory: []
    });

    expect(evaluateEnding(state)).toBe("wife");
  });
});
