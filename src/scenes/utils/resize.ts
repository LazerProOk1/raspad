import Phaser from "phaser";

export const bindSceneResize = (
  scene: Phaser.Scene,
  redraw?: (gameSize: Phaser.Structs.Size) => void
): void => {
  const onResize = (gameSize: Phaser.Structs.Size): void => {
    scene.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    redraw?.(gameSize);
  };

  scene.scale.on("resize", onResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off("resize", onResize);
  });

  onResize(scene.scale.gameSize);
};
