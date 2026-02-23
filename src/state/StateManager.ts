import { createInitialState } from "./GameState";
import type {
  ChoiceOption,
  CorruptionLevel,
  EndingId,
  GameState,
  MiniGameId,
  RewardId
} from "../types";

const SAVE_KEY = "raspad2_save_v1";
const DEV_PREFIX = "raspad2_dev_";
const DEV_SAVE_KEY = `${DEV_PREFIX}state_v1`;
const CORRUPTION_STEPS: ReadonlyArray<CorruptionLevel> = [0, 25, 50, 75, 100];
const MINI_GAMES: ReadonlyArray<MiniGameId> = ["archive", "weapon", "radio", "photo"];
const REWARDS: ReadonlyArray<RewardId> = [
  "military_doc",
  "guilt_doc",
  "pistol",
  "ammo",
  "evac_data",
  "loss_data",
  "family_items"
];
const ENDINGS: ReadonlyArray<EndingId> = ["wife", "will", "crown"];
const SCENES: ReadonlyArray<GameState["currentScene"]> = [
  "intro",
  "rooms",
  "minigame",
  "final_doc",
  "ending"
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCorruptionLevel = (value: unknown): value is CorruptionLevel =>
  CORRUPTION_STEPS.includes(value as CorruptionLevel);

const isMiniGame = (value: unknown): value is MiniGameId =>
  MINI_GAMES.includes(value as MiniGameId);

const isReward = (value: unknown): value is RewardId => REWARDS.includes(value as RewardId);

const isChoiceOption = (value: unknown): value is ChoiceOption => value === "A" || value === "B";

const isEnding = (value: unknown): value is EndingId => ENDINGS.includes(value as EndingId);

const isScene = (value: unknown): value is GameState["currentScene"] =>
  SCENES.includes(value as GameState["currentScene"]);

const isArrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);

const hasNoDuplicates = (values: readonly string[]): boolean => new Set(values).size === values.length;

const isGameState = (value: unknown): value is GameState => {
  if (!isRecord(value)) {
    return false;
  }

  const choices = value.choices;
  const flags = value.flags;

  if (!isCorruptionLevel(value.corruptionLevel)) {
    return false;
  }
  if (!isArrayOf(value.completedMiniGames, isMiniGame) || !hasNoDuplicates(value.completedMiniGames)) {
    return false;
  }
  if (!isRecord(choices)) {
    return false;
  }
  if (choices.choice1 !== undefined && !isChoiceOption(choices.choice1)) {
    return false;
  }
  if (choices.choice2 !== undefined && !isChoiceOption(choices.choice2)) {
    return false;
  }
  if (!isArrayOf(value.inventory, isReward) || !hasNoDuplicates(value.inventory)) {
    return false;
  }
  if (!isRecord(flags) || typeof flags.devMode !== "boolean") {
    return false;
  }
  if (flags.forcedEnding !== undefined && !isEnding(flags.forcedEnding)) {
    return false;
  }
  if (!isScene(value.currentScene)) {
    return false;
  }

  return true;
};

export class StateManager {
  private static instance: StateManager | null = null;
  private state: GameState;
  private readonly listeners = new Set<(state: Readonly<GameState>) => void>();

  private constructor() {
    this.state = createInitialState();
  }

  public static getInstance(): StateManager {
    if (StateManager.instance === null) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  public getState(): Readonly<GameState> {
    return structuredClone(this.state) as Readonly<GameState>;
  }

  public subscribe(listener: (state: Readonly<GameState>) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setState(patch: Partial<GameState>): void {
    this.state = {
      ...this.state,
      ...patch,
      completedMiniGames: patch.completedMiniGames
        ? [...patch.completedMiniGames]
        : [...this.state.completedMiniGames],
      inventory: patch.inventory ? [...patch.inventory] : [...this.state.inventory],
      choices: patch.choices ? { ...patch.choices } : { ...this.state.choices },
      flags: patch.flags ? { ...patch.flags } : { ...this.state.flags }
    };
    this.emitChange();
  }

  public addToInventory(reward: RewardId): void {
    if (this.state.inventory.includes(reward)) {
      return;
    }

    this.setState({
      inventory: [...this.state.inventory, reward]
    });
  }

  public removeFromInventory(reward: RewardId): void {
    if (!this.state.inventory.includes(reward)) {
      return;
    }
    this.setState({
      inventory: this.state.inventory.filter((entry) => entry !== reward)
    });
  }

  public completeMiniGame(id: MiniGameId): void {
    if (this.state.completedMiniGames.includes(id)) {
      return;
    }

    const nextCorruption = Math.min(this.state.corruptionLevel + 25, 100) as CorruptionLevel;
    this.setState({
      completedMiniGames: [...this.state.completedMiniGames, id],
      corruptionLevel: nextCorruption
    });
  }

  public setChoice(key: "choice1" | "choice2", val: ChoiceOption): void {
    this.setState({
      choices: {
        ...this.state.choices,
        [key]: val
      }
    });
  }

  public save(): void {
    if (this.state.flags.devMode) {
      this.saveDev();
      return;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    }
  }

  public load(): void {
    if (typeof localStorage === "undefined") {
      return;
    }

    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isGameState(parsed)) {
        this.state = {
          ...parsed,
          completedMiniGames: [...parsed.completedMiniGames],
          inventory: [...parsed.inventory],
          choices: { ...parsed.choices },
          flags: { ...parsed.flags }
        };
      } else {
        this.state = createInitialState();
      }
    } catch {
      this.state = createInitialState();
    }
    this.emitChange();
  }

  public saveDev(): void {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.setItem(DEV_SAVE_KEY, JSON.stringify(this.state));
  }

  public loadDev(): void {
    if (typeof sessionStorage === "undefined") {
      return;
    }

    const raw = sessionStorage.getItem(DEV_SAVE_KEY);
    if (raw === null) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isGameState(parsed)) {
        this.state = {
          ...parsed,
          completedMiniGames: [...parsed.completedMiniGames],
          inventory: [...parsed.inventory],
          choices: { ...parsed.choices },
          flags: { ...parsed.flags }
        };
      }
    } catch {
      // Ignore malformed dev state.
    }
    this.emitChange();
  }

  public resetDev(): void {
    if (typeof sessionStorage === "undefined") {
      return;
    }

    const keysToClear: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key !== null && key.startsWith(DEV_PREFIX)) {
        keysToClear.push(key);
      }
    }

    for (const key of keysToClear) {
      sessionStorage.removeItem(key);
    }
  }

  private emitChange(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
