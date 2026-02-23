import Phaser from "phaser";
import introDocument from "../data/intro_document.json";
import { StateManager } from "../state/StateManager";
import type { IntroDocumentContent } from "../types/content";
import { bindSceneResize } from "./utils/resize";

export class IntroDocScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();
  private readonly documentContent = introDocument as IntroDocumentContent;
  private paperContainer!: Phaser.GameObjects.Container;
  private frontText!: Phaser.GameObjects.Text;
  private backText!: Phaser.GameObjects.Text;
  private continueButton!: Phaser.GameObjects.Container;
  private continueLabel!: Phaser.GameObjects.Text;
  private scrollHint!: Phaser.GameObjects.Text;
  private isBackSide = false;
  private isFlipping = false;
  private continueUnlocked = false;
  private scrollY = 0;
  private maxScroll = 0;
  private frontTextBaseY = 0;
  private docBounds!: Phaser.Geom.Rectangle;

  public constructor() {
    super("IntroDocScene");
  }

  public create(): void {
    bindSceneResize(this);
    const { width, height } = this.scale;
    const paperWidth = Math.min(920, width - 120);
    const paperHeight = Math.min(640, height - 120);
    const paperX = width * 0.5;
    const paperY = height * 0.5;

    this.cameras.main.setBackgroundColor("#040704");
    this.add.rectangle(paperX, paperY, width, height, 0x1a3a1a, 0.28);

    this.docBounds = new Phaser.Geom.Rectangle(
      paperX - paperWidth * 0.5,
      paperY - paperHeight * 0.5,
      paperWidth,
      paperHeight
    );

    const paper = this.add
      .rectangle(0, 0, paperWidth, paperHeight, 0xe3d4af, 1)
      .setStrokeStyle(2, 0xb59a65, 1);
    const paperInset = this.add
      .rectangle(0, 0, paperWidth - 18, paperHeight - 18, 0xe8dbbc, 0.4)
      .setStrokeStyle(1, 0xc8b07b, 0.35);
    const grain = this.add.graphics();

    for (let index = 0; index < 500; index += 1) {
      grain.fillStyle(0x8c7a52, Phaser.Math.FloatBetween(0.02, 0.08));
      grain.fillCircle(
        Phaser.Math.FloatBetween(-paperWidth * 0.48, paperWidth * 0.48),
        Phaser.Math.FloatBetween(-paperHeight * 0.48, paperHeight * 0.48),
        Phaser.Math.FloatBetween(0.5, 1.8)
      );
    }

    this.paperContainer = this.add.container(paperX, paperY, [paper, paperInset, grain]);

    const contentTopX = -paperWidth * 0.5 + 56;
    this.frontTextBaseY = -paperHeight * 0.5 + 56;
    const textWidth = paperWidth - 132;
    const viewportX = -paperWidth * 0.5 + 46;
    const viewportY = -paperHeight * 0.5 + 46;
    const viewportWidth = paperWidth - 92;
    const viewportHeight = paperHeight - 168;

    const frontTextValue = this.createFrontText();
    this.frontText = this.add.text(contentTopX, this.frontTextBaseY, frontTextValue, {
      color: "#2b2518",
      fontFamily: "'Courier Prime', serif",
      fontSize: "26px",
      lineSpacing: 14,
      wordWrap: { width: textWidth }
    });
    this.backText = this.add
      .text(0, 0, this.documentContent.hidden_text, {
        color: "#2a2316",
        fontFamily: "'Courier Prime', serif",
        fontSize: "56px",
        fontStyle: "italic"
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.maxScroll = Math.max(0, this.frontText.height - viewportHeight);
    this.paperContainer.add([this.frontText, this.backText]);

    const maskGraphic = this.add.graphics({
      x: paperX + viewportX,
      y: paperY + viewportY
    });
    maskGraphic.visible = false;
    maskGraphic.fillRect(0, 0, viewportWidth, viewportHeight);
    const textMask = maskGraphic.createGeometryMask();
    this.frontText.setMask(textMask);
    this.backText.setMask(textMask);

    this.scrollHint = this.add
      .text(paperX, paperY + paperHeight * 0.5 - 48, "Прокрутите документ. Нажмите на лист, чтобы перевернуть.", {
        color: "#4c4129",
        fontFamily: "'Courier Prime', serif",
        fontSize: "20px"
      })
      .setOrigin(0.5);

    const hitArea = this.add.rectangle(paperX, paperY, paperWidth, paperHeight, 0x000000, 0);
    hitArea.setInteractive(
      new Phaser.Geom.Rectangle(-paperWidth * 0.5, -paperHeight * 0.5, paperWidth, paperHeight),
      Phaser.Geom.Rectangle.Contains
    );
    if (hitArea.input !== null) {
      hitArea.input.cursor = "pointer";
    }
    hitArea.on("pointerdown", (): void => {
      this.flipDocument();
    });

    this.continueButton = this.createContinueButton(paperX, paperY + paperHeight * 0.5 + 34);
    this.continueButton.setVisible(false);

    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _dx: number, dy: number): void => {
        if (this.isBackSide || this.isFlipping || !Phaser.Geom.Rectangle.Contains(this.docBounds, pointer.x, pointer.y)) {
          return;
        }

        const next = Phaser.Math.Clamp(this.scrollY + dy * 0.5, 0, this.maxScroll);
        if (next === this.scrollY) {
          return;
        }

        this.scrollY = next;
        this.frontText.setY(this.frontTextBaseY - this.scrollY);
        if (this.maxScroll <= 2 || this.scrollY >= this.maxScroll - 2) {
          this.unlockContinue();
        }
      }
    );

    this.time.delayedCall(30000, () => {
      this.unlockContinue();
    });
  }

  private createFrontText(): string {
    const orderLines = this.documentContent.orders
      .map((line, index) => `${index + 1}. ${line}`)
      .join("\n\n");

    return [
      this.documentContent.title.toUpperCase(),
      "",
      `Декрет № ${this.documentContent.decreeNumber}`,
      `Дата: ${this.documentContent.date}`,
      "",
      `Отправитель: ${this.documentContent.issuer}`,
      `Получатель: ${this.documentContent.recipient}`,
      "",
      "ПРЕДПИСАНИЯ:",
      orderLines,
      "",
      this.documentContent.officialStampText,
      "",
      this.documentContent.signatureLine
    ].join("\n");
  }

  private flipDocument(): void {
    if (this.isFlipping) {
      return;
    }

    this.isFlipping = true;
    this.tweens.add({
      targets: this.paperContainer,
      scaleX: 0,
      duration: 140,
      ease: "Sine.easeIn",
      onComplete: (): void => {
        this.isBackSide = !this.isBackSide;
        this.frontText.setVisible(!this.isBackSide);
        this.backText.setVisible(this.isBackSide);
        this.scrollHint.setText(
          this.isBackSide
            ? "Оборот документа. Нажмите на лист, чтобы вернуть лицевую сторону."
            : "Прокрутите документ. Нажмите на лист, чтобы перевернуть."
        );
        this.tweens.add({
          targets: this.paperContainer,
          scaleX: 1,
          duration: 140,
          ease: "Sine.easeOut",
          onComplete: (): void => {
            this.isFlipping = false;
          }
        });
      }
    });
  }

  private createContinueButton(x: number, y: number): Phaser.GameObjects.Container {
    const buttonBackground = this.add
      .rectangle(0, 0, 250, 58, 0x223724, 0.96)
      .setStrokeStyle(2, 0x5a8f5d, 1);
    this.continueLabel = this.add
      .text(0, 0, "Продолжить", {
        color: "#d8ecd6",
        fontFamily: "'Courier Prime', serif",
        fontSize: "30px"
      })
      .setOrigin(0.5);

    const button = this.add.container(x, y, [buttonBackground, this.continueLabel]);
    button.setSize(250, 58);
    button.setInteractive(new Phaser.Geom.Rectangle(-125, -29, 250, 58), Phaser.Geom.Rectangle.Contains);
    button.on("pointerover", (): void => {
      buttonBackground.setFillStyle(0x2b472d, 1);
    });
    button.on("pointerout", (): void => {
      buttonBackground.setFillStyle(0x223724, 0.96);
    });
    button.on("pointerdown", (): void => {
      this.onContinue();
    });

    return button;
  }

  private unlockContinue(): void {
    if (this.continueUnlocked) {
      return;
    }

    this.continueUnlocked = true;
    this.scrollHint.setText("Документ зарегистрирован. Выберите «Продолжить».");
    this.continueButton.setVisible(true);
    this.continueButton.setAlpha(0);
    this.tweens.add({
      targets: this.continueButton,
      alpha: 1,
      duration: 220,
      ease: "Sine.easeOut"
    });
  }

  private onContinue(): void {
    if (!this.continueUnlocked) {
      return;
    }

    this.stateManager.setState({ currentScene: "rooms" });
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("RoomsScene");
    });
    this.cameras.main.fadeOut(300, 0, 0, 0);
  }
}


