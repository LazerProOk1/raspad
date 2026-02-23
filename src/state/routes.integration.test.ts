import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "./GameState";
import { StateManager } from "./StateManager";
import { evaluateEnding } from "./evaluateEnding";
import type { ChoiceOption, RewardId } from "../types";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  public get length(): number {
    return this.store.size;
  }

  public clear(): void {
    this.store.clear();
  }

  public getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  public key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const manager = StateManager.getInstance();

const runRoute = (choice1: ChoiceOption, choice2: ChoiceOption) => {
  manager.setState(createInitialState());

  if (choice1 === "A") {
    manager.addToInventory("military_doc");
  } else {
    manager.addToInventory("guilt_doc");
  }
  manager.setChoice("choice1", choice1);
  manager.completeMiniGame("archive");

  manager.addToInventory("pistol");
  manager.addToInventory("ammo");
  manager.completeMiniGame("weapon");

  if (choice2 === "A") {
    manager.addToInventory("evac_data");
  } else {
    manager.addToInventory("loss_data");
  }
  manager.setChoice("choice2", choice2);
  manager.completeMiniGame("radio");

  manager.addToInventory("family_items");
  manager.completeMiniGame("photo");

  return manager.getState();
};

const assertInventoryContains = (stateInventory: RewardId[], expected: RewardId[]): void => {
  expect(stateInventory).toEqual(expect.arrayContaining(expected));
};

describe("integration routes", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
      writable: true
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: new MemoryStorage(),
      writable: true
    });
    manager.setState(createInitialState());
  });

  it("CROWN route: archive(A) -> weapon -> radio(A) -> photo", () => {
    const state = runRoute("A", "A");

    expect(evaluateEnding(state)).toBe("crown");
    assertInventoryContains(state.inventory, ["military_doc", "evac_data", "pistol", "ammo", "family_items"]);
    expect(state.corruptionLevel).toBe(100);
  });

  it("WILL route: archive(B) -> weapon -> radio(B) -> photo", () => {
    const state = runRoute("B", "B");

    expect(evaluateEnding(state)).toBe("will");
    assertInventoryContains(state.inventory, ["guilt_doc", "loss_data", "pistol", "ammo", "family_items"]);
    expect(state.corruptionLevel).toBe(100);
  });

  it("WIFE route fallback: archive(A) -> weapon -> radio(B) -> photo", () => {
    const state = runRoute("A", "B");

    expect(evaluateEnding(state)).toBe("wife");
    expect(state.corruptionLevel).toBe(100);
  });

  it("/force ending overrides evaluateEnding result", () => {
    const state = runRoute("A", "A");
    expect(evaluateEnding(state)).toBe("crown");

    manager.setState({
      flags: {
        ...state.flags,
        forcedEnding: "will"
      }
    });
    const forcedState = manager.getState();

    const finalDocEnding = forcedState.flags.forcedEnding ?? evaluateEnding(forcedState);
    expect(evaluateEnding(forcedState)).toBe("crown");
    expect(finalDocEnding).toBe("will");
  });

  it("dev save keys never appear in localStorage", () => {
    manager.setState({
      flags: {
        devMode: true
      }
    });
    manager.addToInventory("pistol");
    manager.save();

    const localKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? "");
    expect(localKeys.some((key) => key.startsWith("raspad2_dev_"))).toBe(false);
    expect(localStorage.getItem("raspad2_save_v1")).toBeNull();
    expect(sessionStorage.getItem("raspad2_dev_state_v1")).not.toBeNull();
  });

  it("inventory deduplication prevents duplicates during route simulation", () => {
    manager.addToInventory("pistol");
    manager.addToInventory("pistol");
    manager.addToInventory("ammo");
    manager.addToInventory("ammo");

    expect(manager.getState().inventory).toEqual(["pistol", "ammo"]);
  });
});
