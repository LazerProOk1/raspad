import Phaser from "phaser";
import endings from "../data/endings.json";
import { evaluateEnding } from "../state/evaluateEnding";
import { StateManager } from "../state/StateManager";
import type { EndingContent } from "../types";
import { bindSceneResize } from "./utils/resize";

export class FinalDocScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();
  private continueUnlocked = false;
  private continueButton!: Phaser.GameObjects.Container;
  private bodyText!: Phaser.GameObjects.Text;
  private bodyBaseY = 0;
  private scrollY = 0;
  private maxScroll = 0;

  public constructor() {
    super("FinalDocScene");
  }

  public create(): void {
    bindSceneResize(this);
    const state = this.stateManager.getState();
    const endingId = state.flags.forcedEnding ?? evaluateEnding(state);
    const endingContent = this.getEndingContent(endingId);
    this.stateManager.setState({ currentScene: "final_doc", corruptionLevel: 100 });

    const { width, height } = this.scale;
    const pageWidth = Math.min(980, width - 100);
    const pageHeight = Math.min(660, height - 100);
    const pageX = width * 0.5;
    const pageY = height * 0.5;

    this.cameras.main.setBackgroundColor("#110000");
    this.cameras.main.setZoom(1.06);

    this.add.rectangle(pageX, pageY, width, height, 0x8b0000, 0.23);
    this.add.rectangle(pageX, pageY, width, height, 0x240000, 0.55);
    this.add.rectangle(pageX, pageY, pageWidth + 24, pageHeight + 24, 0x430a0a, 0.92);

    const paper = this.add
      .rectangle(pageX, pageY, pageWidth, pageHeight, 0xe7dbc1, 1)
      .setStrokeStyle(2, 0xb39b70, 1);

    const masthead = this.add
      .text(pageX, pageY - pageHeight * 0.5 + 46, "СТОЛИЧНЫЙ ВЕСТНИК", {
        color: "#15120e",
        fontFamily: "'Courier Prime', serif",
        fontSize: "52px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);

    this.add
      .text(pageX, masthead.y + 58, `СРОЧНЫЙ ВЫПУСК / ${endingContent.id.toUpperCase()}`, {
        color: "#2b2419",
        fontFamily: "'Courier Prime', serif",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);

    this.add.line(pageX, masthead.y + 90, -pageWidth * 0.43, 0, pageWidth * 0.43, 0, 0x8f7a50, 1);

    const articleX = pageX - pageWidth * 0.5 + 72;
    const articleY = masthead.y + 112;
    const articleWidth = pageWidth - 144;
    const viewportHeight = pageHeight - 235;

    const headline = this.add.text(articleX, articleY, endingContent.newsHeadline, {
      color: "#16120d",
      fontFamily: "'Courier Prime', serif",
      fontSize: "40px",
      fontStyle: "bold",
      wordWrap: { width: articleWidth }
    });

    this.bodyBaseY = headline.y + headline.height + 26;
    this.bodyText = this.add.text(articleX, this.bodyBaseY, endingContent.newsBody, {
      color: "#211a11",
      fontFamily: "'Courier Prime', serif",
      fontSize: "30px",
      lineSpacing: 12,
      wordWrap: { width: articleWidth }
    });

    const maskGraphic = this.add.graphics({ x: articleX, y: this.bodyBaseY });
    maskGraphic.visible = false;
    maskGraphic.fillRect(0, 0, articleWidth, viewportHeight - headline.height - 26);
    const contentMask = maskGraphic.createGeometryMask();
    this.bodyText.setMask(contentMask);

    this.maxScroll = Math.max(0, this.bodyText.height - (viewportHeight - headline.height - 26));

    const pageBounds = new Phaser.Geom.Rectangle(
      pageX - pageWidth * 0.5,
      pageY - pageHeight * 0.5,
      pageWidth,
      pageHeight
    );

    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number): void => {
        if (!Phaser.Geom.Rectangle.Contains(pageBounds, pointer.x, pointer.y)) {
          return;
        }
        const next = Phaser.Math.Clamp(this.scrollY + dy * 0.5, 0, this.maxScroll);
        if (next === this.scrollY) {
          return;
        }
        this.scrollY = next;
        this.bodyText.setY(this.bodyBaseY - this.scrollY);
        if (this.scrollY >= this.maxScroll - 2 || this.maxScroll <= 2) {
          this.unlockContinue();
        }
      }
    );

    const hint = this.add
      .text(pageX, pageY + pageHeight * 0.5 - 90, "Прокрутите до конца или подождите, чтобы продолжить.", {
        color: "#5c482d",
        fontFamily: "'Courier Prime', serif",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0)
      .setDepth(2);

    this.continueButton = this.createContinueButton(pageX, pageY + pageHeight * 0.5 + 38);
    this.continueButton.setDepth(3);
    this.continueButton.setVisible(false);

    paper.setDepth(1);
    masthead.setDepth(2);
    headline.setDepth(2);
    this.bodyText.setDepth(2);
    hint.setDepth(2);

    this.time.delayedCall(8000, () => this.unlockContinue());
  }

  private getEndingContent(id: EndingContent["id"]): EndingContent {
    const records = endings as EndingContent[];
    const selected = records.find((entry) => entry.id === id);
    if (selected !== undefined) {
      return selected;
    }
    return records.find((entry) => entry.id === "wife") ?? records[0];
  }

  private createContinueButton(x: number, y: number): Phaser.GameObjects.Container {
    const background = this.add
      .rectangle(0, 0, 300, 60, 0x3b0f0f, 0.95)
      .setStrokeStyle(2, 0xa03a3a, 1);
    const label = this.add
      .text(0, 0, "К эпилогу", {
        color: "#f6d3d3",
        fontFamily: "'Courier Prime', serif",
        fontSize: "30px"
      })
      .setOrigin(0.5);

    const button = this.add.container(x, y, [background, label]);
    button.setSize(300, 60);
    button.setInteractive(new Phaser.Geom.Rectangle(-150, -30, 300, 60), Phaser.Geom.Rectangle.Contains);
    button.on("pointerover", () => background.setFillStyle(0x522020, 1));
    button.on("pointerout", () => background.setFillStyle(0x3b0f0f, 0.95));
    button.on("pointerdown", () => this.goToEnding());

    return button;
  }

  private unlockContinue(): void {
    if (this.continueUnlocked) {
      return;
    }
    this.continueUnlocked = true;
    this.continueButton.setVisible(true);
    this.continueButton.setAlpha(0);
    this.tweens.add({
      targets: this.continueButton,
      alpha: 1,
      duration: 220,
      ease: "Sine.easeOut"
    });
  }

  private goToEnding(): void {
    if (!this.continueUnlocked) {
      return;
    }
    this.stateManager.setState({ currentScene: "ending" });
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("EndingScene");
    });
    this.cameras.main.fadeOut(350, 0, 0, 0);
  }
}


