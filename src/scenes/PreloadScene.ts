import Phaser from "phaser";
import { bindSceneResize } from "./utils/resize";

export class PreloadScene extends Phaser.Scene {
  public constructor() {
    super("PreloadScene");
  }

  public create(): void {
    bindSceneResize(this);
    console.info("PreloadScene loaded");
    this.scene.start("IntroDocScene");
  }
}
