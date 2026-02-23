export interface GameState {
  corruptionLevel: 0 | 25 | 50 | 75 | 100;
  completedMiniGames: Array<"archive" | "weapon" | "radio" | "photo">;
  choices: { choice1?: "A" | "B"; choice2?: "A" | "B" };
  inventory: Array<
    | "military_doc"
    | "guilt_doc"
    | "pistol"
    | "ammo"
    | "evac_data"
    | "loss_data"
    | "family_items"
  >;
  flags: { devMode: boolean; forcedEnding?: "wife" | "will" | "crown" };
  currentScene: "intro" | "rooms" | "minigame" | "final_doc" | "ending";
}

export const createInitialState = (): GameState => ({
  corruptionLevel: 0,
  completedMiniGames: [],
  choices: {},
  inventory: [],
  flags: { devMode: false },
  currentScene: "intro"
});
