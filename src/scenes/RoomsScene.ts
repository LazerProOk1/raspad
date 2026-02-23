import Phaser from "phaser";
import { AudioManager } from "../audio/AudioManager";
import itemsData from "../data/items.json";
import { AtmosphereManager } from "../effects/AtmosphereManager";
import { StateManager } from "../state/StateManager";
import type { CorruptionLevel, GameState, ItemContent, MiniGameId, RewardId } from "../types";
import { bindSceneResize } from "./utils/resize";

type RoomId = "cabinet" | "bedroom" | "reception" | "corridor";
type ChoiceAction = "close" | "inspect";

interface RoomHotspotConfig {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  itemId?: RewardId;
  triggersMiniGame?: MiniGameId;
  customDescription?: string;
  isDiary?: boolean;
}

interface RoomHotspotRuntime {
  config: RoomHotspotConfig;
  zone: Phaser.GameObjects.Rectangle;
  ring: Phaser.GameObjects.Arc;
  pulseTween?: Phaser.Tweens.Tween;
}

interface RoomView {
  id: RoomId;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Container;
  mid: Phaser.GameObjects.Container;
  front: Phaser.GameObjects.Container;
  hotspots: RoomHotspotRuntime[];
}

const ROOM_ORDER: RoomId[] = ["cabinet", "bedroom", "reception", "corridor"];
const MINIGAME_ORDER: MiniGameId[] = ["archive", "weapon", "radio", "photo"];
const MINIGAME_SCENES: Record<MiniGameId, string> = {
  archive: "ArchiveScene",
  weapon: "WeaponScene",
  radio: "RadioScene",
  photo: "PhotoScene"
};

const ROOM_TITLES: Record<RoomId, string> = {
  cabinet: "Кабинет губернатора",
  bedroom: "Спальня",
  reception: "Приёмная",
  corridor: "Коридор"
};

const ROOM_DESCRIPTIONS: Record<RoomId, string> = {
  cabinet: "Тяжёлый стол, пыльные папки и окно на пустыню в сумерках.",
  bedroom: "Ночная тишина, радио на тумбе и чемодан без надежды на отъезд.",
  reception: "Официальные кресла, портрет королевы и стена семейных снимков.",
  corridor: "Дверь к выходу, мутное зеркало и глухой металлический запах."
};

const MINIGAME_LABELS: Record<MiniGameId, string> = {
  archive: "архив",
  weapon: "оружейная",
  radio: "радиоузел",
  photo: "фотоархив"
};

const DIARY_ENTRIES = [
  "Запись I. Служба казалась чистой формой долга. Я подписывал бумаги, не читая фамилии.",
  "Запись II. Сомнения пришли поздно. В отчётах стало больше печатей, чем людей.",
  "Запись III. Последние часы. Я больше не различаю приказ и вину."
];

export class RoomsScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();
  private readonly audioManager = AudioManager.getInstance();
  private readonly itemById = new Map<RewardId, ItemContent>();

  private currentRoomIndex = 0;
  private activeRoom?: RoomView;
  private roomTitleText?: Phaser.GameObjects.Text;
  private roomDescText?: Phaser.GameObjects.Text;
  private leftNav?: Phaser.GameObjects.Container;
  private rightNav?: Phaser.GameObjects.Container;

  private tooltipBg?: Phaser.GameObjects.Rectangle;
  private tooltipText?: Phaser.GameObjects.Text;
  private tooltipVisible = false;

  private detailOverlay?: Phaser.GameObjects.Container;
  private inventoryWidget?: Phaser.GameObjects.Container;
  private inventoryIconBg?: Phaser.GameObjects.Arc;
  private inventoryBodyText?: Phaser.GameObjects.Text;
  private inventoryCountText?: Phaser.GameObjects.Text;
  private inventoryPanel?: Phaser.GameObjects.Container;
  private inventoryExpanded = false;
  private lastInventoryCount = 0;
  private inventoryCorruptionBlink?: Phaser.Tweens.Tween;

  private progressBg?: Phaser.GameObjects.Rectangle;
  private progressFill?: Phaser.GameObjects.Rectangle;
  private progressLabel?: Phaser.GameObjects.Text;

  private inTransition = false;
  private highlightColor = 0x3da14d;
  private atmosphere?: AtmosphereManager;
  private unsubscribeState?: () => void;

  public constructor() {
    super("RoomsScene");
  }

  public create(): void {
    bindSceneResize(this);
    this.cameras.main.setBackgroundColor("#0f1512");

    const state = this.stateManager.getState();
    this.stateManager.setState({ currentScene: "rooms" });
    this.stateManager.save();
    this.highlightColor = this.getCorruptionHighlightColor(state.corruptionLevel);

    (itemsData as ItemContent[]).forEach((item) => this.itemById.set(item.id, item));

    this.createHeader();
    this.createTooltip();
    this.createNavigationButtons();
    this.createInventoryWidget();
    this.createProgressBar();
    this.showRoom(this.currentRoomIndex, 0, true);

    this.atmosphere = new AtmosphereManager(this, state.corruptionLevel);
    if (this.roomTitleText !== undefined) {
      this.atmosphere.registerText(this.roomTitleText);
    }

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.updateParallax(pointer);
      this.updateTooltipPosition(pointer);
    });

    this.scale.on("resize", this.onResize, this);

    this.unsubscribeState = this.stateManager.subscribe((nextState) => {
      this.highlightColor = this.getCorruptionHighlightColor(nextState.corruptionLevel);
      this.applyHighlightColor();
      this.refreshInventory(nextState);
      this.refreshProgress(nextState);
      this.updateInventoryCorruptionBlink(nextState.corruptionLevel);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private createHeader(): void {
    const { width } = this.scale;

    this.roomTitleText = this.add
      .text(width * 0.5, 16, "", {
        color: "#d4ddd3",
        fontFamily: "'Special Elite', serif",
        fontSize: "34px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0)
      .setDepth(1200);

    this.roomDescText = this.add
      .text(width * 0.5, 58, "", {
        color: "#9fb0a3",
        fontFamily: "'Special Elite', serif",
        fontSize: "20px"
      })
      .setOrigin(0.5, 0)
      .setDepth(1200);
  }

  private createTooltip(): void {
    this.tooltipBg = this.add
      .rectangle(0, 0, 100, 38, 0x000000, 0.82)
      .setDepth(3000)
      .setVisible(false);
    this.tooltipText = this.add
      .text(0, 0, "", {
        color: "#8aff8a",
        fontFamily: "'Special Elite', serif",
        fontSize: "14px"
      })
      .setDepth(3001)
      .setVisible(false);
  }

  private createNavigationButtons(): void {
    const makeButton = (direction: -1 | 1): Phaser.GameObjects.Container => {
      const x = direction < 0 ? 76 : this.scale.width - 76;
      const y = this.scale.height * 0.5;

      const bg = this.add
        .rectangle(0, 0, 112, 112, 0x1f2b22, 0.9)
        .setStrokeStyle(2, 0x4a6b53, 1);
      const label = this.add
        .text(0, 0, direction < 0 ? "‹" : "›", {
          color: "#d0e0d3",
          fontFamily: "'Special Elite', serif",
          fontSize: "58px"
        })
        .setOrigin(0.5);

      const button = this.add.container(x, y, [bg, label]).setDepth(1300);
      button.setSize(112, 112);
      button.setInteractive(new Phaser.Geom.Rectangle(-56, -56, 112, 112), Phaser.Geom.Rectangle.Contains);

      button.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        bg.setFillStyle(0x2d3d31, 0.95);
        const targetIdx = Phaser.Math.Clamp(this.currentRoomIndex + direction, 0, ROOM_ORDER.length - 1);
        const targetRoom = ROOM_ORDER[targetIdx];
        const hint =
          direction < 0
            ? `← Предыдущая комната: ${ROOM_TITLES[targetRoom]}`
            : `Следующая комната: ${ROOM_TITLES[targetRoom]} →`;
        this.showTooltip(hint, pointer);
      });
      button.on("pointerout", () => {
        bg.setFillStyle(0x1f2b22, 0.9);
        this.hideTooltip();
      });
      button.on("pointerdown", () => this.navigateRooms(direction));

      return button;
    };

    this.leftNav = makeButton(-1);
    this.rightNav = makeButton(1);
    this.updateNavState();
  }

  private createInventoryWidget(): void {
    const { width, height } = this.scale;

    this.inventoryIconBg = this.add
      .circle(0, 0, 36, 0x25352a, 0.95)
      .setStrokeStyle(3, 0x5b8768, 1);
    const iconLabel = this.add
      .text(0, 0, "И", {
        color: "#d8ecd8",
        fontFamily: "'Special Elite', serif",
        fontSize: "30px",
        fontStyle: "bold"
      })
      .setOrigin(0.5);
    this.inventoryCountText = this.add
      .text(0, 30, "0", {
        color: "#bad3bd",
        fontFamily: "'Special Elite', serif",
        fontSize: "14px"
      })
      .setOrigin(0.5, 0);

    this.inventoryWidget = this.add.container(width - 58, height - 66, [
      this.inventoryIconBg,
      iconLabel,
      this.inventoryCountText
    ]);
    this.inventoryWidget.setDepth(1400);
    this.inventoryWidget.setSize(74, 74);
    this.inventoryWidget.setInteractive(new Phaser.Geom.Rectangle(-37, -37, 74, 74), Phaser.Geom.Rectangle.Contains);
    this.inventoryWidget.on("pointerover", (pointer: Phaser.Input.Pointer) => this.showTooltip("Инвентарь", pointer));
    this.inventoryWidget.on("pointerout", () => this.hideTooltip());
    this.inventoryWidget.on("pointerdown", () => {
      this.inventoryExpanded = !this.inventoryExpanded;
      this.inventoryPanel?.setVisible(this.inventoryExpanded);
    });

    const panelBg = this.add
      .rectangle(0, 0, 360, 260, 0x121a14, 0.96)
      .setStrokeStyle(2, 0x4a6b53, 1);
    const title = this.add
      .text(-165, -108, "Инвентарь", {
        color: "#d8e6d9",
        fontFamily: "'Special Elite', serif",
        fontSize: "28px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0);
    this.inventoryBodyText = this.add
      .text(-165, -66, "Пусто", {
        color: "#9fb2a2",
        fontFamily: "'Special Elite', serif",
        fontSize: "20px",
        lineSpacing: 8,
        wordWrap: { width: 330 }
      })
      .setOrigin(0, 0);

    this.inventoryPanel = this.add.container(width - 220, height - 210, [panelBg, title, this.inventoryBodyText]);
    this.inventoryPanel.setDepth(1400);
    this.inventoryPanel.setVisible(false);
  }

  private createProgressBar(): void {
    const { width, height } = this.scale;
    this.progressBg = this.add.rectangle(width * 0.5, height - 14, width * 0.7, 8, 0x1a1a1a, 0.9).setDepth(1400);
    this.progressFill = this.add.rectangle(
      width * 0.5 - (width * 0.7) * 0.5,
      height - 14,
      0,
      8,
      0x576c5b,
      0.96
    );
    this.progressFill.setOrigin(0, 0.5).setDepth(1401);
    this.progressLabel = this.add
      .text(width * 0.5, height - 34, "Прогресс: 0/4", {
        color: "#8f9e91",
        fontFamily: "'Special Elite', serif",
        fontSize: "14px"
      })
      .setOrigin(0.5)
      .setDepth(1401);
  }

  private showRoom(index: number, direction: -1 | 0 | 1, immediate = false): void {
    const roomId = ROOM_ORDER[index];
    const next = this.buildRoom(roomId);
    const { width } = this.scale;
    next.root.x = direction === 0 ? 0 : direction * width;
    next.root.setDepth(10);

    this.roomTitleText?.setText(ROOM_TITLES[roomId]);
    this.roomDescText?.setText(ROOM_DESCRIPTIONS[roomId]);
    this.audioManager.crossfadeRoom(roomId);

    if (immediate || this.activeRoom === undefined) {
      this.activeRoom?.root.destroy();
      this.activeRoom = next;
      this.currentRoomIndex = index;
      this.updateNavState();
      return;
    }

    const previous = this.activeRoom;
    const outX = -direction * width;
    this.inTransition = true;
    this.destroyDetailOverlay();
    this.hideTooltip();

    this.tweens.add({
      targets: previous.root,
      x: outX,
      duration: 400,
      ease: "Sine.easeInOut"
    });
    this.tweens.add({
      targets: next.root,
      x: 0,
      duration: 400,
      ease: "Sine.easeInOut",
      onComplete: () => {
        previous.root.destroy();
        this.activeRoom = next;
        this.currentRoomIndex = index;
        this.inTransition = false;
        this.updateNavState();
      }
    });
  }

  private buildRoom(roomId: RoomId): RoomView {
    const root = this.add.container(0, 0);
    const bg = this.add.container(0, 0);
    const mid = this.add.container(0, 0);
    const front = this.add.container(0, 0);
    root.add([bg, mid, front]);

    const hotspots: RoomHotspotRuntime[] = [];
    if (roomId === "cabinet") {
      this.drawCabinet(bg, mid, front, hotspots);
    } else if (roomId === "bedroom") {
      this.drawBedroom(bg, mid, front, hotspots);
    } else if (roomId === "reception") {
      this.drawReception(bg, mid, front, hotspots);
    } else {
      this.drawCorridor(bg, mid, front, hotspots);
    }

    return { id: roomId, root, bg, mid, front, hotspots };
  }

  private drawCabinet(
    bg: Phaser.GameObjects.Container,
    mid: Phaser.GameObjects.Container,
    front: Phaser.GameObjects.Container,
    hotspots: RoomHotspotRuntime[]
  ): void {
    const { width, height } = this.scale;
    bg.add(this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x2f261b, 1));
    bg.add(this.add.rectangle(width * 0.78, height * 0.36, 260, 190, 0x18303d, 0.8).setStrokeStyle(2, 0x8a7a52, 1));
    bg.add(this.add.rectangle(width * 0.78, height * 0.43, 240, 80, 0xb16c40, 0.23));

    mid.add(this.add.rectangle(width * 0.42, height * 0.68, 640, 220, 0x5c452f, 1).setStrokeStyle(2, 0x2e2317, 1));
    mid.add(this.add.rectangle(width * 0.66, height * 0.65, 98, 116, 0x3b2f20, 1).setStrokeStyle(2, 0x8f7e59, 1));

    hotspots.push(
      this.createHotspot(front, {
        id: "doc_pile",
        label: "Стол. На нём лежат документы. [НАЖМИТЕ]",
        x: width * 0.52,
        y: height * 0.61,
        width: 170,
        height: 90,
        itemId: "military_doc",
        triggersMiniGame: "archive"
      }),
      this.createHotspot(front, {
        id: "desk_lamp",
        label: "Настольная лампа",
        x: width * 0.35,
        y: height * 0.49,
        width: 90,
        height: 120,
        itemId: "guilt_doc"
      }),
      this.createHotspot(front, {
        id: "safe",
        label: "Сейф",
        x: width * 0.66,
        y: height * 0.65,
        width: 104,
        height: 120,
        itemId: "ammo"
      }),
      this.createHotspot(front, {
        id: "window",
        label: "Окно в пустыню",
        x: width * 0.78,
        y: height * 0.36,
        width: 260,
        height: 190,
        itemId: "evac_data"
      })
    );
  }

  private drawBedroom(
    bg: Phaser.GameObjects.Container,
    mid: Phaser.GameObjects.Container,
    front: Phaser.GameObjects.Container,
    hotspots: RoomHotspotRuntime[]
  ): void {
    const { width, height } = this.scale;
    bg.add(this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x292227, 1));
    mid.add(this.add.rectangle(width * 0.36, height * 0.68, 440, 190, 0x5b4d58, 1).setStrokeStyle(2, 0x302832, 1));
    mid.add(this.add.rectangle(width * 0.52, height * 0.53, 78, 102, 0x4f4049, 1));
    mid.add(this.add.rectangle(width * 0.72, height * 0.57, 174, 250, 0x40353f, 1).setStrokeStyle(2, 0x6d5d6d, 1));

    hotspots.push(
      this.createHotspot(front, {
        id: "radio_nightstand",
        label: "Радио на тумбе",
        x: width * 0.52,
        y: height * 0.5,
        width: 94,
        height: 72,
        itemId: "loss_data",
        triggersMiniGame: "radio"
      }),
      this.createHotspot(front, {
        id: "bed_frame",
        label: "Кровать",
        x: width * 0.36,
        y: height * 0.68,
        width: 430,
        height: 180,
        itemId: "family_items"
      }),
      this.createHotspot(front, {
        id: "wardrobe",
        label: "Шкаф",
        x: width * 0.72,
        y: height * 0.57,
        width: 170,
        height: 240,
        itemId: "pistol"
      })
    );
  }

  private drawReception(
    bg: Phaser.GameObjects.Container,
    mid: Phaser.GameObjects.Container,
    front: Phaser.GameObjects.Container,
    hotspots: RoomHotspotRuntime[]
  ): void {
    const { width, height } = this.scale;
    bg.add(this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x322622, 1));
    mid.add(this.add.rectangle(width * 0.5, 250, 210, 260, 0x5f4a37, 1).setStrokeStyle(4, 0xb0905b, 1));
    mid.add(this.add.rectangle(width * 0.84, height * 0.51, 220, 250, 0x3f3026, 1).setStrokeStyle(2, 0x847059, 1));
    mid.add(this.add.rectangle(width * 0.5, height * 0.7, 520, 128, 0x6b5647, 1));

    hotspots.push(
      this.createHotspot(front, {
        id: "photo_wall",
        label: "Стена фотографий",
        x: width * 0.84,
        y: height * 0.51,
        width: 220,
        height: 250,
        itemId: "family_items",
        triggersMiniGame: "photo"
      }),
      this.createHotspot(front, {
        id: "portrait",
        label: "Портрет королевы Виктории XVI",
        x: width * 0.5,
        y: 250,
        width: 210,
        height: 260,
        customDescription: "За рамой шуршит бумага. Дневник спрятан в подкладке.",
        isDiary: true
      }),
      this.createHotspot(front, {
        id: "chairs",
        label: "Формальные кресла",
        x: width * 0.5,
        y: height * 0.7,
        width: 520,
        height: 128,
        itemId: "guilt_doc"
      })
    );
  }

  private drawCorridor(
    bg: Phaser.GameObjects.Container,
    mid: Phaser.GameObjects.Container,
    front: Phaser.GameObjects.Container,
    hotspots: RoomHotspotRuntime[]
  ): void {
    const { width, height } = this.scale;
    bg.add(this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x222629, 1));
    mid.add(this.add.rectangle(width * 0.5, height * 0.52, 222, 360, 0x394247, 1).setStrokeStyle(3, 0x73828b, 1));
    mid.add(this.add.rectangle(width * 0.31, height * 0.56, 140, 214, 0x3f484d, 1).setStrokeStyle(2, 0x88939b, 0.8));
    mid.add(this.add.rectangle(width * 0.74, height * 0.59, 126, 204, 0x2d3439, 1).setStrokeStyle(2, 0x666f74, 1));

    hotspots.push(
      this.createHotspot(front, {
        id: "locked_drawer",
        label: "Запертый ящик",
        x: width * 0.5,
        y: height * 0.61,
        width: 120,
        height: 88,
        itemId: "pistol",
        triggersMiniGame: "weapon"
      }),
      this.createHotspot(front, {
        id: "mirror",
        label: "Зеркало",
        x: width * 0.31,
        y: height * 0.56,
        width: 140,
        height: 214,
        itemId: "loss_data"
      }),
      this.createHotspot(front, {
        id: "coat_rack",
        label: "Стойка для плащей",
        x: width * 0.74,
        y: height * 0.59,
        width: 126,
        height: 204,
        itemId: "ammo"
      }),
      this.createHotspot(front, {
        id: "exit_door",
        label: "Дверь к выходу",
        x: width * 0.5,
        y: height * 0.52,
        width: 222,
        height: 350,
        customDescription: "Замки готовы, но на улице уже не безопаснее."
      })
    );
  }

  private createHotspot(parent: Phaser.GameObjects.Container, config: RoomHotspotConfig): RoomHotspotRuntime {
    const zone = this.add
      .rectangle(config.x, config.y, config.width, config.height, 0xffffff, 0.001)
      .setDepth(60)
      .setInteractive(
        new Phaser.Geom.Rectangle(-config.width * 0.5, -config.height * 0.5, config.width, config.height),
        Phaser.Geom.Rectangle.Contains
      );
    if (zone.input !== null) {
      zone.input.cursor = "pointer";
    }

    const ring = this.add
      .circle(config.x, config.y, Math.max(config.width, config.height) * 0.38, this.highlightColor, 0.12)
      .setStrokeStyle(2, this.highlightColor, 1)
      .setVisible(false)
      .setDepth(61);

    const runtime: RoomHotspotRuntime = { config, zone, ring };
    zone.on("pointerover", (pointer: Phaser.Input.Pointer) => {
      this.activateHotspot(runtime);
      this.showTooltip(config.label, pointer);
    });
    zone.on("pointerout", () => {
      this.deactivateHotspot(runtime);
      this.hideTooltip();
    });
    zone.on("pointerdown", () => {
      if (!this.inTransition) {
        this.openDetailOverlay(runtime);
      }
    });

    parent.add([zone, ring]);
    return runtime;
  }

  private activateHotspot(hotspot: RoomHotspotRuntime): void {
    if (this.inTransition) {
      return;
    }
    hotspot.ring.setVisible(true);
    hotspot.pulseTween?.stop();
    hotspot.pulseTween = this.tweens.add({
      targets: hotspot.ring,
      scaleX: 1.2,
      scaleY: 1.2,
      alpha: 0.75,
      duration: 520,
      yoyo: true,
      repeat: -1
    });
  }

  private deactivateHotspot(hotspot: RoomHotspotRuntime): void {
    hotspot.pulseTween?.stop();
    hotspot.pulseTween = undefined;
    hotspot.ring.setVisible(false);
    hotspot.ring.setScale(1);
    hotspot.ring.setAlpha(1);
  }

  private openDetailOverlay(hotspot: RoomHotspotRuntime): void {
    this.destroyDetailOverlay();
    this.hideTooltip();
    const { width, height } = this.scale;

    const overlay = this.add.container(0, 0).setDepth(2500);
    const blocker = this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x000000, 0.76).setInteractive();
    blocker.on("pointerdown", () => undefined);

    const panel = this.add
      .rectangle(width * 0.5, height * 0.5, Math.min(width - 90, 860), Math.min(height - 110, 540), 0x151a16, 0.98)
      .setStrokeStyle(2, 0x53755c, 1);
    const title = this.add
      .text(width * 0.5, panel.y - panel.height * 0.5 + 34, hotspot.config.label, {
        color: "#d8e8d8",
        fontFamily: "'Special Elite', serif",
        fontSize: "32px",
        align: "center",
        wordWrap: { width: panel.width - 80 }
      })
      .setOrigin(0.5, 0);

    const body = this.add
      .text(width * 0.5, title.y + 58, this.resolveDescription(hotspot.config), {
        color: "#a6b6a8",
        fontFamily: "'Special Elite', serif",
        fontSize: "22px",
        lineSpacing: 10,
        align: "left",
        wordWrap: { width: panel.width - 96 }
      })
      .setOrigin(0.5, 0);

    const closeBtn = this.createOverlayButton(width * 0.5 - 180, panel.y + panel.height * 0.5 - 50, "Закрыть", "close", () =>
      this.destroyDetailOverlay()
    );
    const actionLabel = hotspot.config.isDiary ? "Открыть дневник" : "Изучить подробно";
    const actionBtn = this.createOverlayButton(
      width * 0.5 + 180,
      panel.y + panel.height * 0.5 - 50,
      actionLabel,
      "inspect",
      () => this.handleOverlayAction(hotspot, body)
    );

    overlay.add([blocker, panel, title, body, closeBtn, actionBtn]);
    this.detailOverlay = overlay;
  }

  private handleOverlayAction(hotspot: RoomHotspotRuntime, bodyText: Phaser.GameObjects.Text): void {
    if (hotspot.config.isDiary) {
      this.openDiaryEntries(bodyText);
      return;
    }
    if (hotspot.config.triggersMiniGame === undefined) {
      bodyText.setText("Нечего извлекать. Предмет остаётся на месте.");
      return;
    }

    if (!this.canAccess(hotspot.config.triggersMiniGame)) {
      bodyText.setText(this.getAccessMessage(hotspot.config.triggersMiniGame));
      return;
    }

    this.startMinigame(hotspot.config.triggersMiniGame);
  }

  private openDiaryEntries(target: Phaser.GameObjects.Text): void {
    let index = 0;
    target.setText(DIARY_ENTRIES[index]);

    const { width, height } = this.scale;
    const prev = this.createOverlayButton(width * 0.5 - 120, height * 0.5 + 180, "←", "inspect", () => {
      index = (index - 1 + DIARY_ENTRIES.length) % DIARY_ENTRIES.length;
      target.setText(DIARY_ENTRIES[index]);
    });
    const next = this.createOverlayButton(width * 0.5 + 120, height * 0.5 + 180, "→", "inspect", () => {
      index = (index + 1) % DIARY_ENTRIES.length;
      target.setText(DIARY_ENTRIES[index]);
    });
    this.detailOverlay?.add([prev, next]);
  }

  private createOverlayButton(
    x: number,
    y: number,
    label: string,
    kind: ChoiceAction,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const width = kind === "inspect" ? 250 : 220;
    const bg = this.add.rectangle(0, 0, width, 58, 0x243129, 0.96).setStrokeStyle(2, 0x5b7f64, 1);
    const text = this.add
      .text(0, 0, label, {
        color: "#d8ead8",
        fontFamily: "'Special Elite', serif",
        fontSize: "24px"
      })
      .setOrigin(0.5);
    const button = this.add.container(x, y, [bg, text]).setDepth(2510);
    button.setSize(width, 58);
    button.setInteractive(new Phaser.Geom.Rectangle(-width * 0.5, -29, width, 58), Phaser.Geom.Rectangle.Contains);
    button.on("pointerover", () => bg.setFillStyle(0x334338, 1));
    button.on("pointerout", () => bg.setFillStyle(0x243129, 0.96));
    button.on("pointerdown", onClick);
    return button;
  }

  private resolveDescription(config: RoomHotspotConfig): string {
    const corruption = this.stateManager.getState().corruptionLevel;
    if (config.customDescription !== undefined) {
      return corruption >= 75 ? `${config.customDescription}\n\n~~Ничего не изменится.~~` : config.customDescription;
    }
    if (config.itemId !== undefined) {
      const item = this.itemById.get(config.itemId);
      if (item !== undefined) {
        const base = `${item.shortDesc}\n\n${item.longDesc}`;
        return corruption >= 75 ? `${base}\n\n~~Слишком поздно исправлять.~~` : base;
      }
    }
    return corruption >= 75 ? "Ничего существенного не обнаружено.\n\n~~И не будет.~~" : "Ничего существенного не обнаружено.";
  }

  private canAccess(minigame: MiniGameId): boolean {
    const idx = MINIGAME_ORDER.indexOf(minigame);
    if (idx <= 0) {
      return true;
    }
    const prev = MINIGAME_ORDER[idx - 1];
    return this.stateManager.getState().completedMiniGames.includes(prev);
  }

  private getAccessMessage(minigame: MiniGameId): string {
    if (minigame === "weapon") {
      return "Сначала разберитесь с документами в кабинете.";
    }
    if (minigame === "radio") {
      return "Сначала завершите работу в оружейной.";
    }
    if (minigame === "photo") {
      return "Сначала стабилизируйте радиоканал в спальне.";
    }
    return `Сначала откройте ${MINIGAME_LABELS.archive}.`;
  }

  private startMinigame(target: MiniGameId): void {
    this.destroyDetailOverlay();
    this.stateManager.setState({ currentScene: "minigame" });
    this.stateManager.save();
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(MINIGAME_SCENES[target]);
    });
    this.cameras.main.fadeOut(300, 0, 0, 0);
  }

  private navigateRooms(delta: -1 | 1): void {
    if (this.inTransition) {
      return;
    }
    const next = Phaser.Math.Clamp(this.currentRoomIndex + delta, 0, ROOM_ORDER.length - 1);
    if (next === this.currentRoomIndex) {
      return;
    }
    this.showRoom(next, delta);
  }

  private updateNavState(): void {
    if (this.leftNav !== undefined) {
      const enabled = this.currentRoomIndex > 0 && !this.inTransition;
      this.leftNav.setAlpha(enabled ? 1 : 0.4);
      if (enabled) {
        this.leftNav.setInteractive(new Phaser.Geom.Rectangle(-56, -56, 112, 112), Phaser.Geom.Rectangle.Contains);
      } else {
        this.leftNav.disableInteractive();
      }
    }
    if (this.rightNav !== undefined) {
      const enabled = this.currentRoomIndex < ROOM_ORDER.length - 1 && !this.inTransition;
      this.rightNav.setAlpha(enabled ? 1 : 0.4);
      if (enabled) {
        this.rightNav.setInteractive(new Phaser.Geom.Rectangle(-56, -56, 112, 112), Phaser.Geom.Rectangle.Contains);
      } else {
        this.rightNav.disableInteractive();
      }
    }
  }

  private updateParallax(pointer: Phaser.Input.Pointer): void {
    if (this.activeRoom === undefined || this.inTransition) {
      return;
    }
    const nx = pointer.worldX / this.scale.width - 0.5;
    const ny = pointer.worldY / this.scale.height - 0.5;
    this.activeRoom.bg.x = nx * 10;
    this.activeRoom.bg.y = ny * 6;
    this.activeRoom.mid.x = nx * 22;
    this.activeRoom.mid.y = ny * 10;
    this.activeRoom.front.x = nx * 34;
    this.activeRoom.front.y = ny * 14;
  }

  private showTooltip(text: string, pointer?: Phaser.Input.Pointer): void {
    if (this.tooltipBg === undefined || this.tooltipText === undefined) {
      return;
    }
    this.tooltipText.setText(text);
    this.tooltipBg.setSize(this.tooltipText.width + 16, 34);
    this.tooltipBg.setVisible(true);
    this.tooltipText.setVisible(true);
    this.tooltipVisible = true;
    this.updateTooltipPosition(pointer ?? this.input.activePointer);
  }

  private updateTooltipPosition(pointer: Phaser.Input.Pointer): void {
    if (!this.tooltipVisible || this.tooltipBg === undefined || this.tooltipText === undefined) {
      return;
    }
    const x = Phaser.Math.Clamp(pointer.worldX + 14, 20, this.scale.width - this.tooltipBg.width * 0.5 - 8);
    const y = Phaser.Math.Clamp(pointer.worldY - 26, 20, this.scale.height - 20);
    this.tooltipBg.setPosition(x + this.tooltipBg.width * 0.5 - 8, y + 2);
    this.tooltipText.setPosition(x, y - 8);
  }

  private hideTooltip(): void {
    this.tooltipVisible = false;
    this.tooltipBg?.setVisible(false);
    this.tooltipText?.setVisible(false);
  }

  private applyHighlightColor(): void {
    if (this.activeRoom === undefined) {
      return;
    }
    for (const hotspot of this.activeRoom.hotspots) {
      hotspot.ring.setFillStyle(this.highlightColor, 0.12);
      hotspot.ring.setStrokeStyle(2, this.highlightColor, 1);
    }
  }

  private refreshInventory(state: Readonly<GameState>): void {
    const names = state.inventory.map((id) => this.itemById.get(id)?.name ?? id);
    this.inventoryBodyText?.setText(names.length > 0 ? names.join("\n") : "Пусто");
    this.inventoryCountText?.setText(String(names.length));

    if (names.length > this.lastInventoryCount && this.inventoryIconBg !== undefined) {
      this.tweens.add({
        targets: this.inventoryIconBg,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 180,
        yoyo: true,
        repeat: 2
      });
      this.tweens.addCounter({
        from: 1,
        to: 0,
        duration: 1100,
        onUpdate: (tween) => {
          const v = tween.getValue();
          this.inventoryIconBg?.setStrokeStyle(3, 0xb52a2a, v);
        },
        onComplete: () => {
          this.inventoryIconBg?.setStrokeStyle(3, 0x5b8768, 1);
        }
      });
    }

    this.lastInventoryCount = names.length;
  }

  private refreshProgress(state: Readonly<GameState>): void {
    const total = MINIGAME_ORDER.length;
    const current = state.completedMiniGames.length;
    const ratio = Phaser.Math.Clamp(current / total, 0, 1);
    const width = this.scale.width * 0.7;
    this.progressFill?.setSize(width * ratio, 8);
    this.progressLabel?.setText(`Прогресс: ${current}/${total}`);
  }

  private updateInventoryCorruptionBlink(level: CorruptionLevel): void {
    if (this.inventoryIconBg === undefined) {
      return;
    }
    if (level >= 75) {
      if (this.inventoryCorruptionBlink !== undefined) {
        return;
      }
      this.inventoryCorruptionBlink = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 600,
        repeat: -1,
        yoyo: true,
        onUpdate: (tween) => {
          const value = tween.getValue();
          this.inventoryIconBg?.setStrokeStyle(3, 0xb51f1f, 0.45 + value * 0.55);
        }
      });
      return;
    }

    this.inventoryCorruptionBlink?.stop();
    this.inventoryCorruptionBlink = undefined;
    this.inventoryIconBg.setStrokeStyle(3, 0x5b8768, 1);
  }

  private getCorruptionHighlightColor(level: CorruptionLevel): number {
    switch (level) {
      case 0:
        return 0x3ba34a;
      case 25:
        return 0x70a044;
      case 50:
        return 0x9d912d;
      case 75:
        return 0xbf6a2c;
      case 100:
        return 0xcf2c2c;
      default:
        return 0x3ba34a;
    }
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.roomTitleText?.setPosition(gameSize.width * 0.5, 16);
    this.roomDescText?.setPosition(gameSize.width * 0.5, 58);

    if (this.leftNav !== undefined) {
      this.leftNav.setPosition(76, gameSize.height * 0.5);
    }
    if (this.rightNav !== undefined) {
      this.rightNav.setPosition(gameSize.width - 76, gameSize.height * 0.5);
    }

    this.inventoryWidget?.setPosition(gameSize.width - 58, gameSize.height - 66);
    this.inventoryPanel?.setPosition(gameSize.width - 220, gameSize.height - 210);
    this.progressBg?.setPosition(gameSize.width * 0.5, gameSize.height - 14).setSize(gameSize.width * 0.7, 8);
    this.progressFill?.setPosition(gameSize.width * 0.5 - (gameSize.width * 0.7) * 0.5, gameSize.height - 14);
    this.progressLabel?.setPosition(gameSize.width * 0.5, gameSize.height - 34);

    this.showRoom(this.currentRoomIndex, 0, true);
    this.refreshProgress(this.stateManager.getState());
  }

  private destroyDetailOverlay(): void {
    this.detailOverlay?.destroy();
    this.detailOverlay = undefined;
  }

  private cleanup(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.scale.off("resize", this.onResize, this);
    this.destroyDetailOverlay();
    this.hideTooltip();
    this.atmosphere?.destroy();
    this.atmosphere = undefined;
    this.inventoryCorruptionBlink?.stop();
    this.inventoryCorruptionBlink = undefined;
  }
}
