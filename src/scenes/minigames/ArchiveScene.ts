import Phaser from "phaser";
import archiveDocuments from "../../data/archive_documents.json";
import { StateManager } from "../../state/StateManager";
import type { ArchiveDocumentContent, ArchiveFolderId } from "../../types";
import { bindSceneResize } from "../utils/resize";

interface FolderView {
  id: ArchiveFolderId;
  x: number;
  y: number;
  width: number;
  height: number;
  sortedCount: number;
}

interface DocumentCard {
  data: ArchiveDocumentContent;
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  titleText: Phaser.GameObjects.Text;
  bodyText: Phaser.GameObjects.Text;
  startX: number;
  startY: number;
  sorted: boolean;
  fakeStamp?: Phaser.GameObjects.Text;
}

interface WhisperLayer {
  primary: OscillatorNode;
  secondary: OscillatorNode;
  gain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

const FOLDER_LABELS: Record<ArchiveFolderId, string> = {
  SECRET: "СЕКРЕТНО",
  CLASSIFIED: "ДСП",
  DESTROY: "УНИЧТОЖИТЬ"
};

export class ArchiveScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();
  private readonly cards: DocumentCard[] = [];
  private readonly folderIds: ArchiveFolderId[] = ["SECRET", "CLASSIFIED", "DESTROY"];
  private readonly folders = new Map<ArchiveFolderId, FolderView>();
  private sortedCount = 0;
  private modalOpen = false;
  private corruptionLevel = 0;
  private distortionEvent?: Phaser.Time.TimerEvent;
  private whisperLayer?: WhisperLayer;
  private whisperDriftEvent?: Phaser.Time.TimerEvent;

  public constructor() {
    super("ArchiveScene");
  }

  public create(): void {
    bindSceneResize(this);
    const state = this.stateManager.getState();
    this.corruptionLevel = state.corruptionLevel;
    this.stateManager.setState({ currentScene: "minigame" });

    this.input.dragDistanceThreshold = 8;
    this.input.dragTimeThreshold = 80;

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor("#162216");
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x2d2118, 1);
    this.add.rectangle(width * 0.5, height * 0.5, width - 42, height - 42, 0x3f2c1e, 0.95);
    this.add.rectangle(width * 0.5, height * 0.5, width - 72, height - 180, 0x4f3827, 0.8);

    this.add
      .text(width * 0.5, 28, "АРХИВ: СОРТИРОВКА ДОКУМЕНТОВ", {
        color: "#d4c9ab",
        fontFamily: "'Special Elite', serif",
        fontSize: "30px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width * 0.5, 66, "Перетащите каждый лист в нужную папку.", {
        color: "#baa67f",
        fontFamily: "'Special Elite', serif",
        fontSize: "22px"
      })
      .setOrigin(0.5, 0);

    this.createFolders();
    this.createDocumentCards();
    this.bindDragEvents();

    if (this.corruptionLevel >= 50) {
      this.enableHorrorEscalation();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupAudio());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupAudio());
  }

  private createFolders(): void {
    const { width, height } = this.scale;
    const folderWidth = 265;
    const folderHeight = 126;
    const y = height - 92;
    const positions = [width * 0.24, width * 0.5, width * 0.76];
    this.folderIds.forEach((folderId, index) => {
      const x = positions[index];
      const bg = this.add
        .rectangle(x, y, folderWidth, folderHeight, 0x2f2518, 0.98)
        .setStrokeStyle(3, 0x8f7144, 1);
      const tab = this.add.rectangle(x, y - folderHeight * 0.5 - 14, 150, 30, 0x4b3922, 1);
      this.add
        .text(x, tab.y - 1, FOLDER_LABELS[folderId], {
          color: "#e2d1b2",
          fontFamily: "'Special Elite', serif",
          fontSize: "23px",
          fontStyle: "bold"
        })
        .setOrigin(0.5);

      bg.setDepth(1);
      tab.setDepth(1);

      this.folders.set(folderId, {
        id: folderId,
        x,
        y,
        width: folderWidth,
        height: folderHeight,
        sortedCount: 0
      });
    });
  }

  private createDocumentCards(): void {
    const inputDocs = this.prepareDocuments();
    const positions = this.generateStartPositions(inputDocs.length);

    inputDocs.forEach((doc, index) => {
      const pos = positions[index];
      const cardWidth = 188;
      const cardHeight = 136;

      const background = this.add
        .rectangle(0, 0, cardWidth, cardHeight, 0xe7d9b5, 1)
        .setStrokeStyle(2, 0xb69863, 1);
      const titleText = this.add
        .text(-cardWidth * 0.5 + 10, -cardHeight * 0.5 + 10, doc.title, {
          color: "#241d12",
          fontFamily: "'Special Elite', serif",
          fontSize: "15px",
          fontStyle: "bold",
          wordWrap: { width: cardWidth - 20, useAdvancedWrap: true }
        })
        .setOrigin(0, 0);
      const bodyText = this.add
        .text(-cardWidth * 0.5 + 10, -8, doc.body, {
          color: "#2e2719",
          fontFamily: "'Special Elite', serif",
          fontSize: "12px",
          lineSpacing: 4,
          wordWrap: { width: cardWidth - 20, useAdvancedWrap: true }
        })
        .setOrigin(0, 0);

      const container = this.add.container(pos.x, pos.y, [background, titleText, bodyText]);
      container.setSize(cardWidth, cardHeight);
      container.setInteractive(new Phaser.Geom.Rectangle(-cardWidth * 0.5, -cardHeight * 0.5, cardWidth, cardHeight), Phaser.Geom.Rectangle.Contains);
      this.input.setDraggable(container);

      if (doc.special === true) {
        const pin = this.add.circle(cardWidth * 0.5 - 14, -cardHeight * 0.5 + 14, 6, 0x8e1b1b, 1);
        container.add(pin);
      }

      container.setDepth(4 + index);

      this.cards.push({
        data: doc,
        container,
        background,
        titleText,
        bodyText,
        startX: pos.x,
        startY: pos.y,
        sorted: false
      });
    });
  }

  private prepareDocuments(): ArchiveDocumentContent[] {
    const parsed = archiveDocuments as ArchiveDocumentContent[];
    const cloned = parsed.map((entry) => ({ ...entry }));
    const special = cloned.find((entry) => entry.title === "Приказ о строительстве концлагеря №42");
    if (special !== undefined) {
      special.special = true;
    } else {
      cloned.unshift({
        id: "camp_order_42_fallback",
        title: "Приказ о строительстве концлагеря №42",
        body: "Экстренный приказ об инженерных работах и охране периметра.",
        target: "SECRET",
        special: true
      });
    }
    return cloned.slice(0, 12);
  }

  private generateStartPositions(count: number): Phaser.Math.Vector2[] {
    const { width, height } = this.scale;
    const points: Phaser.Math.Vector2[] = [];
    let attempts = 0;

    while (points.length < count && attempts < count * 80) {
      attempts += 1;
      const x = Phaser.Math.Between(130, width - 130);
      const y = Phaser.Math.Between(120, Math.floor(height * 0.57));
      const candidate = new Phaser.Math.Vector2(x, y);
      const tooClose = points.some((point) => Phaser.Math.Distance.Between(point.x, point.y, candidate.x, candidate.y) < 120);
      if (!tooClose) {
        points.push(candidate);
      }
    }

    while (points.length < count) {
      const fallbackX = 140 + (points.length % 6) * 170;
      const fallbackY = 130 + Math.floor(points.length / 6) * 150;
      points.push(new Phaser.Math.Vector2(fallbackX, fallbackY));
    }

    return points;
  }

  private bindDragEvents(): void {
    this.input.on(
      "dragstart",
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void => {
        const card = this.findCard(gameObject);
        if (card === undefined || card.sorted || this.modalOpen) {
          return;
        }
        card.container.setDepth(1000);
        this.tweens.killTweensOf(card.container);
        card.container.setScale(1.04);
      }
    );

    this.input.on(
      "drag",
      (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number): void => {
        const card = this.findCard(gameObject);
        if (card === undefined || card.sorted || this.modalOpen) {
          return;
        }
        card.container.setPosition(dragX, dragY);
      }
    );

    this.input.on(
      "dragend",
      (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject): void => {
        const card = this.findCard(gameObject);
        if (card === undefined || card.sorted || this.modalOpen) {
          return;
        }

        const folder = this.detectFolder(pointer.x, pointer.y);
        if (folder === undefined) {
          this.returnCard(card, false);
          return;
        }

        if (folder.id === card.data.target) {
          this.commitCardToFolder(card, folder);
        } else {
          this.returnCard(card, true);
        }
      }
    );
  }

  private detectFolder(x: number, y: number): FolderView | undefined {
    for (const folder of this.folders.values()) {
      const bounds = new Phaser.Geom.Rectangle(
        folder.x - folder.width * 0.5,
        folder.y - folder.height * 0.5,
        folder.width,
        folder.height
      );
      if (Phaser.Geom.Rectangle.Contains(bounds, x, y)) {
        return folder;
      }
    }
    return undefined;
  }

  private findCard(gameObject: Phaser.GameObjects.GameObject): DocumentCard | undefined {
    const container = gameObject as Phaser.GameObjects.Container;
    return this.cards.find((card) => card.container === container);
  }

  private commitCardToFolder(card: DocumentCard, folder: FolderView): void {
    card.sorted = true;
    card.container.disableInteractive();
    card.background.setFillStyle(0xd2c092, 1);

    const localIndex = folder.sortedCount;
    folder.sortedCount += 1;
    this.sortedCount += 1;

    const cols = 4;
    const row = Math.floor(localIndex / cols);
    const col = localIndex % cols;
    const targetX = folder.x - folder.width * 0.33 + col * 44;
    const targetY = folder.y - folder.height * 0.18 + row * 25;

    this.playFeedbackTone("correct");
    this.tweens.add({
      targets: card.container,
      x: targetX,
      y: targetY,
      scaleX: 0.86,
      scaleY: 0.86,
      duration: 170,
      ease: "Back.Out",
      onComplete: () => {
        card.container.setDepth(60 + localIndex);
      }
    });

    if (this.sortedCount >= this.cards.length) {
      this.time.delayedCall(220, () => this.showChoiceModal());
    }
  }

  private returnCard(card: DocumentCard, wrongFolder: boolean): void {
    this.playFeedbackTone("wrong");
    if (wrongFolder) {
      this.cameras.main.flash(110, 110, 0, 0);
    }

    this.tweens.add({
      targets: card.container,
      x: card.startX,
      y: card.startY,
      scaleX: 1,
      scaleY: 1,
      angle: Phaser.Math.Between(-4, 4),
      duration: 240,
      ease: "Back.Out",
      onComplete: () => {
        card.container.angle = 0;
        card.container.setDepth(10);
      }
    });
  }

  private showChoiceModal(): void {
    if (this.modalOpen) {
      return;
    }
    this.modalOpen = true;

    const { width, height } = this.scale;
    const overlay = this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x020202, 0.9);
    overlay.setDepth(3000);
    overlay.setInteractive();
    overlay.on("pointerdown", () => undefined);

    const panel = this.add
      .rectangle(width * 0.5, height * 0.5, Math.min(840, width - 90), Math.min(460, height - 120), 0x1e1510, 0.97)
      .setStrokeStyle(2, 0x7d5c32, 1)
      .setDepth(3001);

    const title = this.add
      .text(width * 0.5, panel.y - panel.height * 0.5 + 42, "Архив закрыт. Что сделать с компроматом?", {
        color: "#e2d3b0",
        fontFamily: "'Special Elite', serif",
        fontSize: "34px",
        align: "center",
        wordWrap: { width: panel.width - 80 }
      })
      .setOrigin(0.5, 0)
      .setDepth(3002);

    const buttonA = this.createChoiceButton(
      width * 0.5,
      height * 0.5 - 46,
      "A: Засекретить компрометирующие документы",
      "Военные отчёты будут скрыты и использованы как защита режима.",
      () => this.completeWithChoice("A")
    );
    const buttonB = this.createChoiceButton(
      width * 0.5,
      height * 0.5 + 76,
      "B: Оставить их на виду",
      "Документы останутся в открытом доступе и станут уликой против вас.",
      () => this.completeWithChoice("B")
    );
    buttonA.disableInteractive().setAlpha(0.55);
    buttonB.disableInteractive().setAlpha(0.55);
    this.time.delayedCall(1000, () => {
      buttonA.setInteractive(new Phaser.Geom.Rectangle(-350, -49, 700, 98), Phaser.Geom.Rectangle.Contains);
      buttonB.setInteractive(new Phaser.Geom.Rectangle(-350, -49, 700, 98), Phaser.Geom.Rectangle.Contains);
      buttonA.setAlpha(1);
      buttonB.setAlpha(1);
    });

    buttonA.setDepth(3002);
    buttonB.setDepth(3002);
    title.setDepth(3002);
    panel.setDepth(3001);
    overlay.setDepth(3000);
  }

  private createChoiceButton(
    x: number,
    y: number,
    label: string,
    consequence: string,
    handler: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, 0, 700, 98, 0x2f2318, 0.98)
      .setStrokeStyle(2, 0x8f6d3f, 1);
    const text = this.add
      .text(0, -18, label, {
        color: "#f0e1bf",
        fontFamily: "'Special Elite', serif",
        fontSize: "26px",
        align: "center",
        wordWrap: { width: 660 }
      })
      .setOrigin(0.5);
    const consequenceText = this.add
      .text(0, 20, consequence, {
        color: "#c7b08a",
        fontFamily: "'Special Elite', serif",
        fontSize: "16px",
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 660 }
      })
      .setOrigin(0.5);

    const button = this.add.container(x, y, [bg, text, consequenceText]);
    button.setSize(700, 98);
    button.setInteractive(new Phaser.Geom.Rectangle(-350, -49, 700, 98), Phaser.Geom.Rectangle.Contains);
    button.on("pointerover", () => bg.setFillStyle(0x3d2e21, 1));
    button.on("pointerout", () => bg.setFillStyle(0x2f2318, 0.98));
    button.on("pointerdown", handler);
    return button;
  }

  private completeWithChoice(choice: "A" | "B"): void {
    if (choice === "A") {
      this.stateManager.addToInventory("military_doc");
      this.stateManager.setChoice("choice1", "A");
    } else {
      this.stateManager.addToInventory("guilt_doc");
      this.stateManager.setChoice("choice1", "B");
    }

    this.stateManager.completeMiniGame("archive");
    this.stateManager.setState({ currentScene: "minigame" });
    this.stateManager.save();

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("WeaponScene");
    });
    this.cameras.main.fadeOut(320, 0, 0, 0);
  }

  private enableHorrorEscalation(): void {
    this.add.rectangle(this.scale.width * 0.5, this.scale.height * 0.5, this.scale.width, this.scale.height, 0x6b0c0c, 0.15);
    this.add
      .text(this.scale.width - 22, 18, "ПОРОГ КОРРУПЦИИ: АКТИВЕН", {
        color: "#b86a6a",
        fontFamily: "'Special Elite', serif",
        fontSize: "16px"
      })
      .setOrigin(1, 0);

    this.injectFakeStamp();
    this.startWhisperAudio();

    this.distortionEvent = this.time.addEvent({
      delay: 620,
      loop: true,
      callback: () => {
        this.cards.forEach((card) => {
          if (card.sorted) {
            return;
          }
          card.titleText.setText(this.distortText(card.data.title, 0.16));
          card.bodyText.setText(this.distortText(card.data.body, 0.1));
          card.container.setRotation(Phaser.Math.FloatBetween(-0.01, 0.01));
        });
      }
    });
  }

  private injectFakeStamp(): void {
    const unsorted = this.cards.filter((card) => !card.sorted);
    if (unsorted.length === 0) {
      return;
    }

    const card = Phaser.Utils.Array.GetRandom(unsorted);
    const decoyTargets = this.folderIds.filter((entry) => entry !== card.data.target);
    const decoy = Phaser.Utils.Array.GetRandom(decoyTargets);
    const stamp = this.add
      .text(0, 16, FOLDER_LABELS[decoy], {
        color: "#7f0000",
        fontFamily: "'Special Elite', serif",
        fontSize: "24px",
        fontStyle: "bold"
      })
      .setOrigin(0.5)
      .setRotation(-0.25)
      .setAlpha(0.72);
    card.container.add(stamp);
    card.fakeStamp = stamp;
  }

  private distortText(input: string, chance: number): string {
    const alphabet = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
    let output = "";
    for (const char of input) {
      if (char === " " || char === "\n" || Math.random() > chance) {
        output += char;
      } else {
        output += alphabet.charAt(Phaser.Math.Between(0, alphabet.length - 1));
      }
    }
    return output;
  }

  private startWhisperAudio(): void {
    const context = this.getAudioContext();
    if (context === undefined) {
      return;
    }

    void context.resume().catch(() => undefined);

    const gain = context.createGain();
    gain.gain.value = 0.001;
    gain.connect(context.destination);

    const primary = context.createOscillator();
    primary.type = "sawtooth";
    primary.frequency.value = 184;
    primary.connect(gain);

    const secondary = context.createOscillator();
    secondary.type = "triangle";
    secondary.frequency.value = 229;
    secondary.connect(gain);

    const lfo = context.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.16;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.0024;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    primary.start();
    secondary.start();
    lfo.start();

    this.whisperLayer = { primary, secondary, gain, lfo, lfoGain };
    this.whisperDriftEvent = this.time.addEvent({
      delay: 900,
      loop: true,
      callback: () => {
        const now = context.currentTime;
        primary.frequency.setTargetAtTime(160 + Math.random() * 90, now, 0.25);
        secondary.frequency.setTargetAtTime(210 + Math.random() * 110, now, 0.25);
      }
    });
  }

  private cleanupAudio(): void {
    this.distortionEvent?.remove(false);
    this.whisperDriftEvent?.remove(false);

    if (this.whisperLayer !== undefined) {
      const { primary, secondary, lfo, gain } = this.whisperLayer;
      try {
        const context = gain.context;
        gain.gain.cancelScheduledValues(context.currentTime);
        gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.2);
        primary.stop(context.currentTime + 0.25);
        secondary.stop(context.currentTime + 0.25);
        lfo.stop(context.currentTime + 0.25);
      } catch {
        // Ignore shutdown races.
      }
      this.whisperLayer = undefined;
    }
  }

  private playFeedbackTone(kind: "correct" | "wrong"): void {
    const context = this.getAudioContext();
    if (context === undefined) {
      return;
    }
    void context.resume().catch(() => undefined);

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "correct" ? "triangle" : "square";
    oscillator.frequency.value = kind === "correct" ? 760 : 170;

    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(context.destination);

    const now = context.currentTime;
    gain.gain.exponentialRampToValueAtTime(kind === "correct" ? 0.06 : 0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "correct" ? 0.16 : 0.22));
    oscillator.start(now);
    oscillator.stop(now + (kind === "correct" ? 0.18 : 0.24));
  }

  private getAudioContext(): AudioContext | undefined {
    const soundManager = this.sound as unknown as { context?: BaseAudioContext };
    const context = soundManager.context;
    if (context instanceof AudioContext) {
      return context;
    }
    return undefined;
  }
}

