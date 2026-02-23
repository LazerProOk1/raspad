import Phaser from "phaser";

export class TextGlitch {
  private static readonly GLITCH_CHARS = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯabcdef01█▓▒░▌▐";

  public static apply(textObject: Phaser.GameObjects.Text, intensity = 0.1): void {
    const original = textObject.text;
    const chars = original.split("");

    const intervalId = window.setInterval(() => {
      if (!textObject.active) {
        window.clearInterval(intervalId);
        return;
      }

      if (Math.random() > 0.85) {
        const glitched = chars
          .map((char) => {
            if (char === " " || char === "\n") {
              return char;
            }
            if (Math.random() < intensity) {
              return this.GLITCH_CHARS[Math.floor(Math.random() * this.GLITCH_CHARS.length)];
            }
            return char;
          })
          .join("");

        textObject.setText(glitched);
        window.setTimeout(() => {
          if (textObject.active) {
            textObject.setText(original);
          }
        }, 80 + Math.random() * 120);
      }
    }, 2000 + Math.random() * 3000);
  }

  public static screenGlitch(scene: Phaser.Scene): void {
    const overlay = scene.add
      .rectangle(
        scene.scale.width * 0.5,
        scene.scale.height * 0.5,
        scene.scale.width,
        scene.scale.height,
        0x00ff00,
        0.05
      )
      .setDepth(9999);

    for (let index = 0; index < 3; index += 1) {
      const y = Math.random() * scene.scale.height;
      const h = 5 + Math.random() * 30;
      const strip = scene.add
        .rectangle(scene.scale.width * 0.5, y, scene.scale.width, h, 0xffffff, 0.1)
        .setDepth(9999);

      scene.tweens.add({
        targets: strip,
        x: strip.x + (Math.random() - 0.5) * 40,
        duration: 100,
        yoyo: true,
        onComplete: () => strip.destroy()
      });
    }

    scene.time.delayedCall(200, () => overlay.destroy());
  }
}
