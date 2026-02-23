export type CorruptionLevel = 0 | 25 | 50 | 75 | 100;
export type ChoiceOption = "A" | "B";
export type MiniGameId = "archive" | "weapon" | "radio" | "photo";
export type RewardId =
  | "military_doc"
  | "guilt_doc"
  | "pistol"
  | "ammo"
  | "evac_data"
  | "loss_data"
  | "family_items";
export type EndingId = "wife" | "will" | "crown";
export type { GameState } from "../state/GameState";
export type {
  ArchiveDocumentContent,
  ArchiveFolderId,
  AudioClipContent,
  AudioContent,
  EndingContent,
  IntroDocumentContent,
  ItemContent,
  PhotoDifferenceContent,
  PhotoDifferencesContent,
  RoomContent,
  RoomId,
  RoomItemPlacement
} from "./content";
