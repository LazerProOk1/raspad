import Phaser from "phaser";
import { AudioManager } from "./audio/AudioManager";
import { EndingScene } from "./scenes/EndingScene";
import { FinalDocScene } from "./scenes/FinalDocScene";
import { IntroDocScene } from "./scenes/IntroDocScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { RoomsScene } from "./scenes/RoomsScene";
import { ArchiveScene } from "./scenes/minigames/ArchiveScene";
import { PhotoScene } from "./scenes/minigames/PhotoScene";
import { RadioScene } from "./scenes/minigames/RadioScene";
import { WeaponScene } from "./scenes/minigames/WeaponScene";
import { CorruptionManager } from "./state/CorruptionManager";
import { StateManager } from "./state/StateManager";

declare global {
  interface Window {
    __DEV__?: boolean;
  }
}

if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("dev") === "1") {
    window.__DEV__ = true;
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: window.innerWidth,
  height: window.innerHeight,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  backgroundColor: "#000000",
  scene: [
    PreloadScene,
    IntroDocScene,
    RoomsScene,
    ArchiveScene,
    WeaponScene,
    RadioScene,
    PhotoScene,
    FinalDocScene,
    EndingScene
  ]
};

const game = new Phaser.Game(config);
if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  });
}

const stateManager = StateManager.getInstance();
stateManager.load();

const devEnabled = import.meta.env.DEV && window.__DEV__ === true;
if (devEnabled) {
  stateManager.loadDev();
}
stateManager.setState({
  flags: {
    ...stateManager.getState().flags,
    devMode: devEnabled
  }
});

const corruptionManager = new CorruptionManager(game, stateManager);
corruptionManager.start();

const audioManager = AudioManager.getInstance(stateManager);
audioManager.start();

if (import.meta.env.DEV && window.__DEV__ === true) {
  void import("./dev/DevConsole").then(({ DevConsole }) => {
    const devConsole = new DevConsole(game, stateManager);
    devConsole.attach();
  });
}
