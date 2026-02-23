import Phaser from "phaser";
import photoDifferences from "../../data/photo_differences.json";
import { StateManager } from "../../state/StateManager";
import type { PhotoDifferenceContent, PhotoDifferencesContent } from "../../types";
import { bindSceneResize } from "../utils/resize";

interface DifferenceState {
  data: PhotoDifferenceContent;
  found: boolean;
}

export class PhotoScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();
  private readonly differences: DifferenceState[] = [];
  private leftBounds!: Phaser.Geom.Rectangle;
  private rightBounds!: Phaser.Geom.Rectangle;
  private blurLeftBounds!: Phaser.Geom.Rectangle;
  private blurRightBounds!: Phaser.Geom.Rectangle;
  private timerRemaining = 180;
  private hintCount = 3;
  private completionTriggered = false;
  private corruptionLevel = 0;
  private timerText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private hintButton!: Phaser.GameObjects.Container;
  private toneInvertOverlay?: Phaser.GameObjects.Rectangle;
  private deadFrameOverlay?: Phaser.GameObjects.Container;
  private faceEvent?: Phaser.Time.TimerEvent;
  private toneInvertEvent?: Phaser.Time.TimerEvent;

  public constructor() {
    super("PhotoScene");
  }

  public create(): void {
    bindSceneResize(this);
    const state = this.stateManager.getState();
    this.corruptionLevel = state.corruptionLevel;
    this.stateManager.setState({ currentScene: "minigame" });

    const parsed = photoDifferences as PhotoDifferencesContent;
    this.differences.push(...parsed.differences.map((entry) => ({ data: entry, found: false })));

    const { width, height } = this.scale;
    const stacked = width < 900;
    const photoWidth = stacked ? Math.min(width - 90, 720) : Math.min((width - 140) * 0.5, 620);
    const photoHeight = stacked ? Math.min((height - 270) * 0.5, 320) : Math.min(height - 250, 460);

    this.leftBounds = stacked
      ? new Phaser.Geom.Rectangle((width - photoWidth) * 0.5, 130, photoWidth, photoHeight)
      : new Phaser.Geom.Rectangle(50, 130, photoWidth, photoHeight);
    this.rightBounds = stacked
      ? new Phaser.Geom.Rectangle((width - photoWidth) * 0.5, this.leftBounds.bottom + 24, photoWidth, photoHeight)
      : new Phaser.Geom.Rectangle(width - photoWidth - 50, 130, photoWidth, photoHeight);

    this.cameras.main.setBackgroundColor("#131818");
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x101515, 1);
    this.add.rectangle(width * 0.5, height * 0.5, width - 40, height - 50, 0x1d2626, 0.92);

    this.add
      .text(width * 0.5, 22, "ФОТОАРХИВ: НАЙДИТЕ РАЗЛИЧИЯ", {
        color: "#dde5e3",
        fontFamily: "'Special Elite', serif",
        fontSize: "32px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);
    this.add
      .text(width * 0.5, 62, "Отмечайте различия касанием или кликом.", {
        color: "#9caaa8",
        fontFamily: "'Special Elite', serif",
        fontSize: "20px"
      })
      .setOrigin(0.5, 0);

    this.drawPhotoPanel(this.leftBounds, "left");
    this.drawPhotoPanel(this.rightBounds, "right");

    this.blurLeftBounds = this.getBlurBounds(this.leftBounds);
    this.blurRightBounds = this.getBlurBounds(this.rightBounds);

    this.timerText = this.add
      .text(56, height - 104, "03:00", {
        color: "#e6c8c8",
        fontFamily: "'Special Elite', serif",
        fontSize: "42px",
        fontStyle: "bold"
      })
      .setOrigin(0, 0.5);

    this.progressText = this.add
      .text(56, height - 58, "Найдено: 0 / 6", {
        color: "#d7e2df",
        fontFamily: "'Special Elite', serif",
        fontSize: "28px"
      })
      .setOrigin(0, 0.5);

    this.hintText = this.add
      .text(width - 380, height - 58, "Подсказки: 3", {
        color: "#d4ddd9",
        fontFamily: "'Special Elite', serif",
        fontSize: "28px"
      })
      .setOrigin(0, 0.5);

    this.statusText = this.add
      .text(width * 0.5, height - 110, "Найдите все 6 различий или дождитесь окончания таймера.", {
        color: "#9eb0ae",
        fontFamily: "'Special Elite', serif",
        fontSize: "20px"
      })
      .setOrigin(0.5, 0.5);

    this.hintButton = this.createHintButton(width - 196, height - 106);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.completionTriggered) {
          return;
        }
        this.timerRemaining = Math.max(0, this.timerRemaining - 1);
        this.updateHud();
        if (this.timerRemaining <= 0) {
          this.completeScene();
        }
      }
    });

    if (this.corruptionLevel >= 75) {
      this.faceEvent = this.time.addEvent({
        delay: 20000,
        loop: true,
        callback: () => this.triggerFaceDeformationAndDeadFrame()
      });
    }

    if (this.corruptionLevel >= 100) {
      this.toneInvertOverlay = this.add
        .rectangle(width * 0.5, height * 0.5, width, height, 0xffffff, 0)
        .setBlendMode(Phaser.BlendModes.DIFFERENCE)
        .setDepth(2200);
      this.toneInvertEvent = this.time.addEvent({
        delay: 15000,
        loop: true,
        callback: () => this.triggerToneInvertFlash()
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  private drawPhotoPanel(bounds: Phaser.Geom.Rectangle, side: "left" | "right"): void {
    this.add
      .rectangle(bounds.centerX, bounds.centerY, bounds.width, bounds.height, 0xd8ccb0, 1)
      .setStrokeStyle(3, 0x8f7a52, 1);
    this.add.rectangle(bounds.centerX, bounds.centerY, bounds.width - 14, bounds.height - 14, 0x6a6153, 0.54);

    const content = this.add.graphics();
    content.fillStyle(0x4a5757, 0.35);
    content.fillRect(bounds.x + 12, bounds.y + 12, bounds.width - 24, bounds.height - 24);
    content.fillStyle(0x2f3f3e, 0.55);
    content.fillRect(bounds.x + 22, bounds.y + bounds.height * 0.55, bounds.width - 44, bounds.height * 0.33);

    // Subtle camp silhouette in "photo 5" background.
    for (let i = 0; i < 8; i += 1) {
      const fenceX = bounds.x + bounds.width * 0.56 + i * 14;
      content.lineStyle(1, 0x202826, 0.32);
      content.lineBetween(fenceX, bounds.y + bounds.height * 0.34, fenceX, bounds.y + bounds.height * 0.83);
    }
    content.lineStyle(2, 0x1d2321, 0.32);
    content.lineBetween(bounds.x + bounds.width * 0.53, bounds.y + bounds.height * 0.38, bounds.x + bounds.width * 0.83, bounds.y + bounds.height * 0.38);

    this.drawFamilyFaces(bounds, side);
    this.drawDifferenceVisuals(bounds, side);
    this.drawBlurredPhotoThree(bounds);
  }

  private drawFamilyFaces(bounds: Phaser.Geom.Rectangle, side: "left" | "right"): void {
    const graphics = this.add.graphics();
    const shift = side === "right" ? 4 : 0;
    graphics.fillStyle(0x8d7c66, 0.88);
    graphics.fillEllipse(bounds.x + bounds.width * 0.33 + shift, bounds.y + bounds.height * 0.36, 94, 108);
    graphics.fillEllipse(bounds.x + bounds.width * 0.58 - shift, bounds.y + bounds.height * 0.34, 88, 102);
    graphics.fillStyle(0x5b4d3c, 0.94);
    graphics.fillRect(bounds.x + bounds.width * 0.24, bounds.y + bounds.height * 0.48, 130, 136);
    graphics.fillRect(bounds.x + bounds.width * 0.52, bounds.y + bounds.height * 0.46, 118, 144);
  }

  private drawDifferenceVisuals(bounds: Phaser.Geom.Rectangle, side: "left" | "right"): void {
    const g = this.add.graphics();
    const points = this.differences.map((diff) => this.toWorldPoint(bounds, diff.data.x, diff.data.y));

    // 1 collar pin
    g.fillStyle(side === "left" ? 0xc5b16a : 0x7a6a3b, 0.95);
    g.fillCircle(points[0].x, points[0].y, side === "left" ? 6 : 3);
    // 2 window crack
    g.lineStyle(2, side === "left" ? 0x9ca7a4 : 0x2b3231, 0.9);
    g.lineBetween(points[1].x - 8, points[1].y - 8, points[1].x + (side === "left" ? 10 : 4), points[1].y + 11);
    // 3 cup
    g.fillStyle(side === "left" ? 0x8b7a65 : 0x9f8b73, 0.95);
    g.fillRect(points[2].x - 9, points[2].y - 10, side === "left" ? 18 : 13, 16);
    // 4 medal strip
    g.fillStyle(side === "left" ? 0x8a1d1d : 0x5e2a2a, 0.9);
    g.fillRect(points[3].x - 4, points[3].y - 15, 8, side === "left" ? 24 : 14);
    // 5 sleeve button
    g.fillStyle(side === "left" ? 0xd8c78a : 0x5d4c2f, 0.95);
    g.fillCircle(points[4].x, points[4].y, side === "left" ? 5 : 2);
    // 6 clock hand
    g.lineStyle(2, 0x25231f, 0.9);
    g.lineBetween(points[5].x, points[5].y, points[5].x + (side === "left" ? 12 : 3), points[5].y - (side === "left" ? 6 : 13));
  }

  private drawBlurredPhotoThree(bounds: Phaser.Geom.Rectangle): void {
    const blur = this.getBlurBounds(bounds);
    const frame = this.add.rectangle(blur.centerX, blur.centerY, blur.width, blur.height, 0xa29982, 0.64).setStrokeStyle(2, 0x625742, 0.7);
    frame.setDepth(30);

    const cloud = this.add.graphics();
    cloud.setDepth(31);
    for (let i = 0; i < 36; i += 1) {
      cloud.fillStyle(0x564f43, Phaser.Math.FloatBetween(0.12, 0.28));
      cloud.fillEllipse(
        Phaser.Math.FloatBetween(blur.x + 4, blur.right - 4),
        Phaser.Math.FloatBetween(blur.y + 4, blur.bottom - 4),
        Phaser.Math.FloatBetween(10, 26),
        Phaser.Math.FloatBetween(10, 26)
      );
    }
  }

  private getBlurBounds(bounds: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      bounds.x + bounds.width * 0.74,
      bounds.y + bounds.height * 0.05,
      bounds.width * 0.21,
      bounds.height * 0.22
    );
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.completionTriggered) {
      return;
    }

    const hitLeft = Phaser.Geom.Rectangle.Contains(this.leftBounds, pointer.worldX, pointer.worldY);
    const hitRight = Phaser.Geom.Rectangle.Contains(this.rightBounds, pointer.worldX, pointer.worldY);
    if (!hitLeft && !hitRight) {
      return;
    }

    const activeBounds = hitLeft ? this.leftBounds : this.rightBounds;
    const blurBounds = hitLeft ? this.blurLeftBounds : this.blurRightBounds;
    if (Phaser.Geom.Rectangle.Contains(blurBounds, pointer.worldX, pointer.worldY)) {
      this.statusText.setText("Фрагмент №3 размыт и недоступен для проверки.");
      this.statusText.setColor("#9b9491");
      return;
    }

    const nx = Phaser.Math.Clamp((pointer.worldX - activeBounds.x) / activeBounds.width, 0, 1);
    const ny = Phaser.Math.Clamp((pointer.worldY - activeBounds.y) / activeBounds.height, 0, 1);
    const match = this.findDifference(nx, ny);
    if (match !== undefined) {
      this.markDifferenceFound(match);
    } else {
      this.applyWrongClickPenalty();
    }
  }

  private findDifference(nx: number, ny: number): DifferenceState | undefined {
    return this.differences.find((entry) => {
      if (entry.found) {
        return false;
      }
      const dx = nx - entry.data.x;
      const dy = ny - entry.data.y;
      return Math.sqrt(dx * dx + dy * dy) <= entry.data.radius;
    });
  }

  private markDifferenceFound(diff: DifferenceState): void {
    diff.found = true;
    this.drawFoundMarker(this.leftBounds, diff.data, 0x86f3ae);
    this.drawFoundMarker(this.rightBounds, diff.data, 0x86f3ae);
    this.updateHud();

    this.statusText.setColor("#b5f0c2");
    this.statusText.setText(`Найдено различие: ${this.getFoundCount()} / ${this.differences.length}`);

    if (this.getFoundCount() >= this.differences.length) {
      this.completeScene();
    }
  }

  private drawFoundMarker(bounds: Phaser.Geom.Rectangle, diff: PhotoDifferenceContent, color: number): void {
    const point = this.toWorldPoint(bounds, diff.x, diff.y);
    const radius = Math.max(12, diff.radius * Math.min(bounds.width, bounds.height));
    const ring = this.add.circle(point.x, point.y, radius, color, 0.16).setStrokeStyle(3, color, 1);
    ring.setDepth(100);
    this.tweens.add({
      targets: ring,
      alpha: 0.85,
      duration: 160,
      yoyo: true,
      repeat: 1
    });
  }

  private applyWrongClickPenalty(): void {
    this.timerRemaining = Math.max(0, this.timerRemaining - 10);
    this.updateHud();
    this.cameras.main.flash(110, 220, 28, 28);
    this.statusText.setColor("#f0a0a0");
    this.statusText.setText("Неверная отметка. Потеряно 10 секунд.");
    if (this.timerRemaining <= 0) {
      this.completeScene();
    }
  }

  private createHintButton(x: number, y: number): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 250, 58, 0x2d3939, 0.96).setStrokeStyle(2, 0x6f8787, 1);
    const label = this.add
      .text(0, 0, "Использовать подсказку", {
        color: "#dde9e7",
        fontFamily: "'Special Elite', serif",
        fontSize: "24px"
      })
      .setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    container.setSize(250, 58);
    container.setInteractive(new Phaser.Geom.Rectangle(-125, -29, 250, 58), Phaser.Geom.Rectangle.Contains);
    container.on("pointerover", () => bg.setFillStyle(0x3b4a4a, 1));
    container.on("pointerout", () => bg.setFillStyle(0x2d3939, 0.96));
    container.on("pointerdown", () => this.useHint());
    return container;
  }

  private useHint(): void {
    if (this.completionTriggered || this.hintCount <= 0) {
      return;
    }
    const available = this.differences.filter((entry) => !entry.found);
    if (available.length === 0) {
      return;
    }

    this.hintCount -= 1;
    this.updateHud();
    const selected = Phaser.Utils.Array.GetRandom(available);
    this.statusText.setColor("#d9e7a8");
    this.statusText.setText("Подсказка активна на 2 секунды.");

    const showHint = (bounds: Phaser.Geom.Rectangle): Phaser.GameObjects.Arc => {
      const point = this.toWorldPoint(bounds, selected.data.x, selected.data.y);
      const radius = Math.max(12, selected.data.radius * Math.min(bounds.width, bounds.height));
      return this.add.circle(point.x, point.y, radius, 0xfff183, 0.12).setStrokeStyle(3, 0xfff183, 1);
    };

    const leftMarker = showHint(this.leftBounds);
    const rightMarker = showHint(this.rightBounds);
    leftMarker.setDepth(130);
    rightMarker.setDepth(130);

    this.tweens.add({
      targets: [leftMarker, rightMarker],
      alpha: 0.85,
      duration: 220,
      yoyo: true,
      repeat: 4
    });

    this.time.delayedCall(2000, () => {
      leftMarker.destroy();
      rightMarker.destroy();
    });
  }

  private triggerFaceDeformationAndDeadFrame(): void {
    if (this.completionTriggered) {
      return;
    }

    const target = Phaser.Utils.Array.GetRandom([this.leftBounds, this.rightBounds]);
    const deform = this.add.graphics();
    deform.setDepth(2100);
    deform.fillStyle(0x2d0101, 0.33);
    const x = Phaser.Math.FloatBetween(target.x + 70, target.right - 70);
    const y = Phaser.Math.FloatBetween(target.y + 80, target.bottom - 80);
    deform.fillEllipse(x, y, Phaser.Math.Between(80, 160), Phaser.Math.Between(46, 90));
    deform.fillStyle(0xc2b4a2, 0.2);
    deform.fillEllipse(x + 12, y - 8, Phaser.Math.Between(26, 52), Phaser.Math.Between(18, 32));
    this.time.delayedCall(200, () => deform.destroy());

    this.showDeadFrame();
  }

  private showDeadFrame(): void {
    const { width, height } = this.scale;
    if (this.deadFrameOverlay !== undefined) {
      this.deadFrameOverlay.destroy();
    }

    const layer = this.add.container(0, 0);
    layer.setDepth(2150);
    const blackout = this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x000000, 1);
    const fakePhoto = this.add.rectangle(width * 0.5, height * 0.5, width * 0.58, height * 0.52, 0x4f4740, 0.95).setStrokeStyle(2, 0x928472, 1);
    const caption = this.add
      .text(width * 0.5, height * 0.5 + fakePhoto.height * 0.5 + 12, "чужой кадр", {
        color: "#a29b94",
        fontFamily: "'Special Elite', serif",
        fontSize: "20px"
      })
      .setOrigin(0.5, 0);
    layer.add([blackout, fakePhoto, caption]);
    this.deadFrameOverlay = layer;

    this.time.delayedCall(130, () => {
      layer.destroy();
      if (this.deadFrameOverlay === layer) {
        this.deadFrameOverlay = undefined;
      }
    });
  }

  private triggerToneInvertFlash(): void {
    if (this.toneInvertOverlay === undefined || this.completionTriggered) {
      return;
    }
    this.toneInvertOverlay.setAlpha(0.86);
    this.time.delayedCall(100, () => {
      this.toneInvertOverlay?.setAlpha(0);
    });
  }

  private completeScene(): void {
    if (this.completionTriggered) {
      return;
    }
    this.completionTriggered = true;
    this.hintButton.disableInteractive();

    this.stateManager.addToInventory("family_items");
    this.stateManager.completeMiniGame("photo");
    this.stateManager.save();

    const found = this.getFoundCount();
    this.statusText.setColor("#d8ddd5");
    this.statusText.setText(
      found >= this.differences.length
        ? "Все различия найдены. Архив закрывается."
        : `Время вышло. Найдено ${found} из ${this.differences.length}.`
    );

    this.time.delayedCall(850, () => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("FinalDocScene");
      });
      this.cameras.main.fadeOut(320, 0, 0, 0);
    });
  }

  private updateHud(): void {
    const minutes = Math.floor(this.timerRemaining / 60);
    const seconds = this.timerRemaining % 60;
    this.timerText.setText(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
    this.progressText.setText(`Найдено: ${this.getFoundCount()} / ${this.differences.length}`);
    this.hintText.setText(`Подсказки: ${this.hintCount}`);
  }

  private getFoundCount(): number {
    return this.differences.filter((entry) => entry.found).length;
  }

  private toWorldPoint(bounds: Phaser.Geom.Rectangle, nx: number, ny: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(bounds.x + bounds.width * nx, bounds.y + bounds.height * ny);
  }

  private cleanup(): void {
    this.faceEvent?.remove(false);
    this.toneInvertEvent?.remove(false);
    this.deadFrameOverlay?.destroy();
  }
}

