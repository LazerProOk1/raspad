import Phaser from "phaser";
import { Howl } from "howler";
import { StateManager } from "../../state/StateManager";
import { bindSceneResize } from "../utils/resize";

type PartId = "frame" | "slide" | "barrel" | "magazine" | "ammo";

interface PartDefinition {
  id: PartId;
  label: string;
  width: number;
  height: number;
  color: number;
}

interface PartCard {
  definition: PartDefinition;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  labelText: Phaser.GameObjects.Text;
  startX: number;
  startY: number;
  assembled: boolean;
}

interface SlotView {
  id: PartId;
  x: number;
  y: number;
  width: number;
  height: number;
  marker: Phaser.GameObjects.Rectangle;
  labelText: Phaser.GameObjects.Text;
}

const PART_ORDER: ReadonlyArray<PartId> = ["frame", "slide", "barrel", "magazine", "ammo"];
const PART_LABELS_RU: Record<PartId, string> = {
  frame: "РАМА",
  slide: "ЗАТВОР",
  barrel: "СТВОЛ",
  magazine: "МАГАЗИН",
  ammo: "ПАТРОНЫ"
};
const IDLE_SHOT_KEY = "raspad2_weapon_idle_shot_played";

export class WeaponScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();
  private readonly parts = new Map<PartId, PartCard>();
  private readonly slots = new Map<PartId, SlotView>();
  private uiLayer!: Phaser.GameObjects.Container;
  private assemblyBounds!: Phaser.Geom.Rectangle;
  private handSprite!: Phaser.GameObjects.Container;
  private assembledCount = 0;
  private activeDrag = false;
  private interactionTime = 0;
  private hoverStartTime: number | null = null;
  private idleShotPlayed = false;
  private minigameCompleted = false;
  private corruptionLevel = 0;
  private tremorEvent?: Phaser.Time.TimerEvent;
  private dropoutEvent?: Phaser.Time.TimerEvent;
  private dropoutOverlay?: Phaser.GameObjects.Rectangle;
  private distantShot?: Howl;

  public constructor() {
    super("WeaponScene");
  }

  public create(): void {
    bindSceneResize(this);
    const state = this.stateManager.getState();
    this.corruptionLevel = state.corruptionLevel;
    this.stateManager.setState({ currentScene: "minigame" });
    this.interactionTime = this.time.now;

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#131313");
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x1a1a1a, 1);
    this.add.rectangle(width * 0.5, height * 0.5, width - 50, height - 60, 0x232323, 0.94);
    this.add.rectangle(width * 0.34, height * 0.5, width * 0.62, height * 0.72, 0x2f2a24, 0.9);
    this.add.rectangle(width * 0.78, height * 0.5, width * 0.34, height * 0.78, 0x161616, 0.95);

    this.uiLayer = this.add.container(0, 0);

    const header = this.add
      .text(width * 0.5, 22, "ОРУЖЕЙНАЯ: СБОРКА ПИСТОЛЕТА", {
        color: "#d5d5d5",
        fontFamily: "'Special Elite', serif",
        fontSize: "32px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);
    const subheader = this.add
      .text(width * 0.5, 66, "Перетащите детали в правильном порядке: рама -> затвор -> ствол -> магазин -> патроны", {
        color: "#9d9d9d",
        fontFamily: "'Special Elite', serif",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);
    this.uiLayer.add([header, subheader]);

    this.createAssemblySlots();
    this.createPartCards();
    this.createHandSprite();
    this.bindDragEvents();
    this.loadIdleShotFlag();

    if (this.corruptionLevel >= 50) {
      this.enableCorruptionEffects();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  public update(time: number): void {
    this.updateHandSpritePosition();
    this.updateIdleHoverTrigger(time);
  }

  private createAssemblySlots(): void {
    const { width, height } = this.scale;
    const slotWidth = 232;
    const slotHeight = 72;
    const startY = height * 0.24;
    const spacing = 94;
    const x = width * 0.79;

    this.assemblyBounds = new Phaser.Geom.Rectangle(
      width * 0.62,
      height * 0.16,
      width * 0.33,
      height * 0.72
    );

    PART_ORDER.forEach((partId, index) => {
      const y = startY + index * spacing;
      const marker = this.add
        .rectangle(x, y, slotWidth, slotHeight, 0x2a2a2a, 0.8)
        .setStrokeStyle(2, 0x666666, 1);
      const labelText = this.add
        .text(x, y, `${index + 1}. ${PART_LABELS_RU[partId]}`, {
          color: "#7e7e7e",
          fontFamily: "'Special Elite', serif",
          fontSize: "24px"
        })
        .setOrigin(0.5);

      this.uiLayer.add([marker, labelText]);
      this.slots.set(partId, { id: partId, x, y, width: slotWidth, height: slotHeight, marker, labelText });
    });
  }

  private createPartCards(): void {
    const { width, height } = this.scale;
    const defs: PartDefinition[] = [
      { id: "frame", label: "РАМА", width: 190, height: 62, color: 0x7d7469 },
      { id: "slide", label: "ЗАТВОР", width: 190, height: 52, color: 0x9b9184 },
      { id: "barrel", label: "СТВОЛ", width: 150, height: 42, color: 0x8a7f74 },
      { id: "magazine", label: "МАГАЗИН", width: 96, height: 56, color: 0x6b6358 },
      { id: "ammo", label: "ПАТРОНЫ", width: 112, height: 48, color: 0x8f6f43 }
    ];

    const scatterBounds = new Phaser.Geom.Rectangle(70, 130, width * 0.52, height * 0.62);
    defs.forEach((definition, index) => {
      const pos = this.findScatterPosition(scatterBounds, index);
      const background = this.add
        .rectangle(0, 0, definition.width, definition.height, definition.color, 1)
        .setStrokeStyle(2, 0x2a2520, 1);
      const labelText = this.add
        .text(0, 0, definition.label, {
          color: "#121212",
          fontFamily: "'Special Elite', serif",
          fontSize: "22px",
          fontStyle: "bold"
        })
        .setOrigin(0.5);
      const container = this.add.container(pos.x, pos.y, [background, labelText]);
      container.setSize(definition.width, definition.height);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-definition.width * 0.5, -definition.height * 0.5, definition.width, definition.height),
        Phaser.Geom.Rectangle.Contains
      );
      this.input.setDraggable(container);
      container.setDepth(20 + index);

      this.parts.set(definition.id, {
        definition,
        container,
        background,
        labelText,
        startX: pos.x,
        startY: pos.y,
        assembled: false
      });
    });
  }

  private createHandSprite(): void {
    const palm = this.add.rectangle(0, 0, 20, 24, 0xe2d0b8, 0.85).setStrokeStyle(1, 0x7d6954, 1);
    const finger1 = this.add.rectangle(-7, -15, 5, 14, 0xe2d0b8, 0.85).setStrokeStyle(1, 0x7d6954, 1);
    const finger2 = this.add.rectangle(-1, -17, 5, 17, 0xe2d0b8, 0.85).setStrokeStyle(1, 0x7d6954, 1);
    const finger3 = this.add.rectangle(5, -15, 5, 14, 0xe2d0b8, 0.85).setStrokeStyle(1, 0x7d6954, 1);
    const thumb = this.add.rectangle(12, -5, 8, 5, 0xe2d0b8, 0.85).setStrokeStyle(1, 0x7d6954, 1);
    this.handSprite = this.add.container(90, 90, [palm, finger1, finger2, finger3, thumb]);
    this.handSprite.setDepth(2000);
    this.handSprite.setAlpha(0.38);
  }

  private bindDragEvents(): void {
    this.input.on(
      "dragstart",
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void => {
        const part = this.findPartByObject(gameObject);
        if (part === undefined || part.assembled || this.minigameCompleted) {
          return;
        }
        this.activeDrag = true;
        this.markInteraction();
        part.container.setDepth(1000);
        part.container.setScale(1.05);
      }
    );

    this.input.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number): void => {
        const part = this.findPartByObject(gameObject);
        if (part === undefined || part.assembled || this.minigameCompleted) {
          return;
        }
        part.container.setPosition(dragX, dragY);
      }
    );

    this.input.on(
      "dragend",
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void => {
        const part = this.findPartByObject(gameObject);
        this.activeDrag = false;
        if (part === undefined || part.assembled || this.minigameCompleted) {
          return;
        }

        const expectedId = PART_ORDER[this.assembledCount];
        const expectedSlot = this.slots.get(expectedId);
        if (expectedSlot === undefined) {
          this.returnPart(part, true);
          return;
        }

        const distance = Phaser.Math.Distance.Between(
          part.container.x,
          part.container.y,
          expectedSlot.x,
          expectedSlot.y
        );
        const closeEnough = distance <= Math.max(expectedSlot.width, expectedSlot.height) * 0.55;

        if (part.definition.id === expectedId && closeEnough) {
          this.commitPart(part, expectedSlot);
        } else {
          this.returnPart(part, true);
        }
      }
    );

    this.input.on("pointerdown", () => this.markInteraction());
  }

  private findPartByObject(gameObject: Phaser.GameObjects.GameObject): PartCard | undefined {
    const container = gameObject as Phaser.GameObjects.Container;
    for (const part of this.parts.values()) {
      if (part.container === container) {
        return part;
      }
    }
    return undefined;
  }

  private commitPart(part: PartCard, slot: SlotView): void {
    part.assembled = true;
    part.container.disableInteractive();
    part.background.setFillStyle(0x535353, 1);
    slot.marker.setStrokeStyle(2, 0xa88d62, 1);
    slot.labelText.setColor("#c8b695");

    this.tweens.add({
      targets: part.container,
      x: slot.x,
      y: slot.y,
      scaleX: 1,
      scaleY: 1,
      duration: 170,
      ease: "Sine.easeOut",
      onComplete: () => {
        part.container.setDepth(600 + this.assembledCount);
      }
    });

    this.assembledCount += 1;
    this.markInteraction();

    if (this.assembledCount >= PART_ORDER.length) {
      this.completeMinigameAfterPause();
    }
  }

  private returnPart(part: PartCard, wrongOrder: boolean): void {
    if (wrongOrder) {
      this.triggerScreenTremor(0.0032, 100);
    }

    this.tweens.add({
      targets: part.container,
      x: part.startX,
      y: part.startY,
      scaleX: 1,
      scaleY: 1,
      angle: Phaser.Math.Between(-5, 5),
      duration: 200,
      ease: "Back.Out",
      onComplete: () => {
        part.container.setDepth(50);
        part.container.angle = 0;
      }
    });

    this.markInteraction();
  }

  private completeMinigameAfterPause(): void {
    if (this.minigameCompleted) {
      return;
    }
    this.minigameCompleted = true;

    this.add
      .text(this.scale.width * 0.5, this.scale.height - 38, "Сборка завершена", {
        color: "#d7c9ad",
        fontFamily: "'Special Elite', serif",
        fontSize: "30px"
      })
      .setOrigin(0.5, 1);

    this.time.delayedCall(650, () => {
      this.stateManager.addToInventory("pistol");
      this.stateManager.addToInventory("ammo");
      this.stateManager.completeMiniGame("weapon");
      this.stateManager.save();

      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("RadioScene");
      });
      this.cameras.main.fadeOut(320, 0, 0, 0);
    });
  }

  private enableCorruptionEffects(): void {
    this.tremorEvent = this.time.addEvent({
      delay: 8000,
      loop: true,
      callback: () => {
        this.triggerInterfaceTremor();
      }
    });

    if (this.corruptionLevel >= 75) {
      this.dropoutOverlay = this.add
        .rectangle(this.scale.width * 0.5, this.scale.height * 0.5, this.scale.width, this.scale.height, 0x000000, 0)
        .setDepth(3000);

      this.dropoutEvent = this.time.addEvent({
        delay: 15000,
        loop: true,
        callback: () => {
          if (this.dropoutOverlay === undefined) {
            return;
          }
          this.dropoutOverlay.setAlpha(1);
          this.time.delayedCall(200, () => {
            this.dropoutOverlay?.setAlpha(0);
          });
        }
      });
    }
  }

  private triggerInterfaceTremor(): void {
    if (this.minigameCompleted) {
      return;
    }
    this.tweens.add({
      targets: this.uiLayer,
      x: Phaser.Math.Between(-2, 2),
      y: Phaser.Math.Between(-2, 2),
      duration: 90,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.uiLayer.setPosition(0, 0);
      }
    });
  }

  private triggerScreenTremor(intensity: number, duration: number): void {
    this.cameras.main.shake(duration, intensity, true);
  }

  private updateHandSpritePosition(): void {
    const pointer = this.input.activePointer;
    const baseX = pointer.worldX + 18;
    const baseY = pointer.worldY + 20;
    const intensity =
      this.corruptionLevel >= 75 ? 3.8 :
      this.corruptionLevel >= 50 ? 2.1 :
      0.7;

    const jitterX = Phaser.Math.FloatBetween(-intensity, intensity);
    const jitterY = Phaser.Math.FloatBetween(-intensity, intensity);
    this.handSprite.x = Phaser.Math.Linear(this.handSprite.x, baseX + jitterX, 0.35);
    this.handSprite.y = Phaser.Math.Linear(this.handSprite.y, baseY + jitterY, 0.35);
  }

  private updateIdleHoverTrigger(time: number): void {
    if (this.idleShotPlayed || this.minigameCompleted) {
      return;
    }
    if (this.assembledCount === 0) {
      this.hoverStartTime = null;
      return;
    }

    const pointer = this.input.activePointer;
    const hoveringAssembly = Phaser.Geom.Rectangle.Contains(this.assemblyBounds, pointer.worldX, pointer.worldY);
    if (!hoveringAssembly || this.activeDrag) {
      this.hoverStartTime = null;
      return;
    }

    if (this.hoverStartTime === null) {
      this.hoverStartTime = Math.max(time, this.interactionTime);
      return;
    }

    if (time - this.hoverStartTime >= 30000) {
      this.playDistantShot();
      this.idleShotPlayed = true;
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(IDLE_SHOT_KEY, "1");
      }
    }
  }

  private playDistantShot(): void {
    this.distantShot = new Howl({
      src: ["/audio/distant_shot.mp3"],
      volume: 0.12,
      rate: 0.88,
      html5: true
    });
    this.distantShot.play();
  }

  private markInteraction(): void {
    this.interactionTime = this.time.now;
    this.hoverStartTime = null;
  }

  private findScatterPosition(bounds: Phaser.Geom.Rectangle, index: number): Phaser.Math.Vector2 {
    const columns = 2;
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellWidth = bounds.width / columns;
    const cellHeight = bounds.height / 3;
    const baseX = bounds.x + cellWidth * (col + 0.5);
    const baseY = bounds.y + cellHeight * (row + 0.5);
    return new Phaser.Math.Vector2(
      baseX + Phaser.Math.Between(-34, 34),
      baseY + Phaser.Math.Between(-36, 36)
    );
  }

  private loadIdleShotFlag(): void {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    this.idleShotPlayed = sessionStorage.getItem(IDLE_SHOT_KEY) === "1";
  }

  private cleanup(): void {
    this.tremorEvent?.remove(false);
    this.dropoutEvent?.remove(false);
    this.distantShot?.stop();
    this.distantShot?.unload();
  }
}


