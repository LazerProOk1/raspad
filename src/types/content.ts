import type { EndingId, MiniGameId, RewardId } from "./index";

export interface IntroDocumentContent {
  title: string;
  decreeNumber: string;
  date: string;
  issuer: string;
  recipient: string;
  orders: string[];
  officialStampText: string;
  signatureLine: string;
  hidden_text: string;
}

export interface ItemContent {
  id: RewardId;
  name: string;
  shortDesc: string;
  longDesc: string;
  foundIn: MiniGameId;
}

export type RoomId = "cabinet" | "bedroom" | "reception" | "corridor";

export interface RoomItemPlacement {
  itemId: RewardId;
  position: string;
  triggersMiniGame: MiniGameId;
}

export interface RoomContent {
  id: RoomId;
  name: string;
  description: string;
  items: RoomItemPlacement[];
}

export interface EndingContent {
  id: EndingId;
  newsHeadline: string;
  newsBody: string;
  musicCue: string;
}

export type ArchiveFolderId = "SECRET" | "CLASSIFIED" | "DESTROY";

export interface ArchiveDocumentContent {
  id: string;
  title: string;
  body: string;
  target: ArchiveFolderId;
  special?: boolean;
}

export interface PhotoDifferenceContent {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface PhotoDifferencesContent {
  differences: PhotoDifferenceContent[];
}

export interface AudioClipContent {
  id: string;
  src: string;
  loop: boolean;
}

export interface AudioContent {
  clips: AudioClipContent[];
  rooms: Partial<Record<RoomId, string>>;
}
