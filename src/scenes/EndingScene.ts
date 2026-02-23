import Phaser from "phaser";
import { createInitialState } from "../state/GameState";
import { StateManager } from "../state/StateManager";
import { bindSceneResize } from "./utils/resize";

export class EndingScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();

  public constructor() {
    super("EndingScene");
  }

  public create(): void {
    bindSceneResize(this);
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#000000");
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x000000, 1);

    this.add
      .text(
        width * 0.5,
        height * 0.4,
        "Мы — команда проекта — не хотим жить в таком мире.\nДавайте вместе не допустим Распада!",
        {
          color: "#f2f2f2",
          fontFamily: "'Special Elite', serif",
          fontSize: "40px",
          align: "center",
          lineSpacing: 16,
          wordWrap: { width: Math.min(960, width - 100) }
        }
      )
      .setOrigin(0.5);

    const playAgain = this.createButton(width * 0.5, height * 0.7, "Играть снова", () =>
      this.resetAndRestart()
    );
    const otherEnding = this.createButton(width * 0.5, height * 0.8, "Другая концовка", () =>
      this.resetAndRestart()
    );

    playAgain.setAlpha(0);
    otherEnding.setAlpha(0);

    this.cameras.main.fadeIn(2000, 0, 0, 0);
    this.tweens.add({
      targets: [playAgain, otherEnding],
      alpha: 1,
      duration: 2000,
      ease: "Sine.easeInOut"
    });
  }

  private createButton(
    x: number,
    y: number,
    labelText: string,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, 0, 320, 62, 0x101010, 0.96)
      .setStrokeStyle(2, 0x3f3f3f, 1);
    const label = this.add
      .text(0, 0, labelText, {
        color: "#f0f0f0",
        fontFamily: "'Special Elite', serif",
        fontSize: "32px"
      })
      .setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label]);
    container.setSize(320, 62);
    container.setInteractive(new Phaser.Geom.Rectangle(-160, -31, 320, 62), Phaser.Geom.Rectangle.Contains);
    container.on("pointerover", () => bg.setFillStyle(0x1f1f1f, 1));
    container.on("pointerout", () => bg.setFillStyle(0x101010, 0.96));
    container.on("pointerdown", onClick);
    return container;
  }

  private resetAndRestart(): void {
    this.stateManager.setState(createInitialState());
    this.stateManager.save();
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("IntroDocScene");
    });
    this.cameras.main.fadeOut(350, 0, 0, 0);
  }
}

