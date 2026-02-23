import Phaser from "phaser";
import { TextGlitch } from "./TextGlitch";

export const corruptText = (text: string, intensity: number): string =>
  text
    .split("")
    .map((char) => {
      if (char === char.toLowerCase() && Math.random() < intensity * 0.05) {
        return char.toUpperCase();
      }
      if (char === char.toUpperCase() && Math.random() < intensity * 0.03) {
        return char.toLowerCase();
      }
      return char;
    })
    .join("");

export class AtmosphereManager {
  private readonly trackedTexts: Array<{ target: Phaser.GameObjects.Text; original: string }> = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly corruptionLevel: number
  ) {
    this.startRandomEvents();
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroy());
  }

  public registerText(target: Phaser.GameObjects.Text): void {
    this.trackedTexts.push({ target, original: target.text });
  }

  private startRandomEvents(): void {
    this.scheduleRandomGlitch();
    this.scheduleFlicker();
    this.scheduleCapitalErrors();
  }

  private scheduleRandomGlitch(): void {
    const delay = Phaser.Math.Between(5000, 20000);
    const timer = this.scene.time.delayedCall(delay, () => {
      if (this.corruptionLevel >= 25) {
        this.scene.cameras.main.shake(200, 0.003);
      }
      if (this.corruptionLevel >= 50) {
        TextGlitch.screenGlitch(this.scene);
      }
      this.scheduleRandomGlitch();
    });
    this.timers.push(timer);
  }

  private scheduleFlicker(): void {
    const delay = Phaser.Math.Between(8000, 28000);
    const timer = this.scene.time.delayedCall(delay, () => {
      this.scene.tweens.add({
        targets: this.scene.cameras.main,
        alpha: 0,
        duration: 50,
        yoyo: true,
        repeat: 1 + Phaser.Math.Between(0, 2)
      });
      this.scheduleFlicker();
    });
    this.timers.push(timer);
  }

  private scheduleCapitalErrors(): void {
    const delay = Phaser.Math.Between(9000, 18000);
    const timer = this.scene.time.delayedCall(delay, () => {
      if (this.corruptionLevel >= 50) {
        const intensity = this.corruptionLevel / 100;
        this.trackedTexts.forEach(({ target, original }) => {
          if (!target.active) {
            return;
          }
          target.setText(corruptText(original, intensity));
        });
        this.scene.time.delayedCall(200, () => {
          this.trackedTexts.forEach(({ target, original }) => {
            if (target.active) {
              target.setText(original);
            }
          });
        });
      }
      this.scheduleCapitalErrors();
    });
    this.timers.push(timer);
  }

  public destroy(): void {
    this.timers.forEach((timer) => timer.remove(false));
    this.timers.length = 0;
    this.trackedTexts.length = 0;
  }
}
