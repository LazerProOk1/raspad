import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "./GameState";
import { StateManager } from "./StateManager";

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

describe("StateManager", () => {
  const manager = StateManager.getInstance();

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

  it("starts with correct initial state", () => {
    expect(manager.getState()).toEqual(createInitialState());
  });

  it("increments corruption by 25 up to 100 when minigames are completed", () => {
    manager.completeMiniGame("archive");
    expect(manager.getState().corruptionLevel).toBe(25);

    manager.completeMiniGame("weapon");
    expect(manager.getState().corruptionLevel).toBe(50);

    manager.completeMiniGame("radio");
    expect(manager.getState().corruptionLevel).toBe(75);

    manager.completeMiniGame("photo");
    expect(manager.getState().corruptionLevel).toBe(100);
  });

  it("does not duplicate inventory items", () => {
    manager.addToInventory("pistol");
    manager.addToInventory("pistol");
    manager.addToInventory("ammo");

    expect(manager.getState().inventory).toEqual(["pistol", "ammo"]);
  });

  it("persists and restores state via save/load round-trip", () => {
    manager.completeMiniGame("archive");
    manager.addToInventory("military_doc");
    manager.setChoice("choice1", "A");
    manager.setState({ currentScene: "rooms" });
    const expected = manager.getState();

    manager.save();

    manager.setState(createInitialState());
    expect(manager.getState()).toEqual(createInitialState());

    manager.load();
    expect(manager.getState()).toEqual(expected);
  });
});
