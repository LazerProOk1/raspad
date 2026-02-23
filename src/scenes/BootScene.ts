import Phaser from "phaser";
import { bindSceneResize } from "./utils/resize";

export class BootScene extends Phaser.Scene {
  public constructor() {
    super("boot");
  }

  public create(): void {
    bindSceneResize(this);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, "Распад Игра 2", {
        color: "#d8d8d8",
        fontSize: "36px"
      })
      .setOrigin(0.5);
  }
}
