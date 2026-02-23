import type { EndingId, GameState, RewardId } from "../types";

export const evaluateEnding = (state: GameState): EndingId => {
  const hasReward = (reward: RewardId): boolean => state.inventory.includes(reward);

  if (
    state.choices.choice1 === "A" &&
    state.choices.choice2 === "A" &&
    hasReward("military_doc") &&
    hasReward("evac_data")
  ) {
    return "crown";
  }

  if (
    state.choices.choice1 === "B" &&
    state.choices.choice2 === "B" &&
    hasReward("pistol") &&
    hasReward("ammo") &&
    (hasReward("guilt_doc") || hasReward("loss_data"))
  ) {
    return "will";
  }

  return "wife";
};
