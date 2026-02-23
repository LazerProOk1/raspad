import Phaser from "phaser";
import { CorruptionManager } from "../state/CorruptionManager";
import { StateManager } from "../state/StateManager";
import type { ChoiceOption, CorruptionLevel, EndingId, MiniGameId, RewardId } from "../types";

const VALID_CORRUPTION: CorruptionLevel[] = [0, 25, 50, 75, 100];
const VALID_CHOICES: ChoiceOption[] = ["A", "B"];
const VALID_ENDINGS: EndingId[] = ["wife", "will", "crown"];
const VALID_REWARDS: RewardId[] = [
  "military_doc",
  "guilt_doc",
  "pistol",
  "ammo",
  "evac_data",
  "loss_data",
  "family_items"
];
const VALID_GOTO: MiniGameId[] = ["archive", "weapon", "radio", "photo"];
const GOTO_SCENE_MAP: Record<MiniGameId, string> = {
  archive: "ArchiveScene",
  weapon: "WeaponScene",
  radio: "RadioScene",
  photo: "PhotoScene"
};

export class DevConsole {
  private readonly stateManager: StateManager;
  private readonly corruptionManager: CorruptionManager | null;
  private panel?: HTMLDivElement;
  private logContainer?: HTMLDivElement;
  private input?: HTMLInputElement;
  private visible = false;

  public constructor(private readonly game: Phaser.Game, stateManager?: StateManager) {
    this.stateManager = stateManager ?? StateManager.getInstance();
    this.corruptionManager = CorruptionManager.getActive();
  }

  public attach(): void {
    this.ensureDom();
    window.addEventListener("keydown", this.handleGlobalKeyDown);
    this.writeLog("DevConsole ready. Press F10 to toggle.");
  }

  public detach(): void {
    window.removeEventListener("keydown", this.handleGlobalKeyDown);
    this.panel?.remove();
    this.panel = undefined;
    this.logContainer = undefined;
    this.input = undefined;
  }

  private ensureDom(): void {
    if (this.panel !== undefined) {
      return;
    }

    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.inset = "0";
    panel.style.zIndex = "20000";
    panel.style.display = "none";
    panel.style.background = "rgba(2, 3, 3, 0.88)";
    panel.style.color = "#9ff0a7";
    panel.style.fontFamily = "Consolas, Menlo, monospace";
    panel.style.padding = "16px";
    panel.style.boxSizing = "border-box";
    panel.style.backdropFilter = "blur(2px)";

    const shell = document.createElement("div");
    shell.style.width = "min(980px, 100%)";
    shell.style.height = "min(560px, 100%)";
    shell.style.margin = "0 auto";
    shell.style.border = "1px solid #224128";
    shell.style.background = "rgba(8, 12, 8, 0.95)";
    shell.style.display = "flex";
    shell.style.flexDirection = "column";

    const header = document.createElement("div");
    header.textContent = "RASPAD DEV CONSOLE";
    header.style.padding = "10px 12px";
    header.style.borderBottom = "1px solid #224128";
    header.style.color = "#d8f5db";
    header.style.fontWeight = "bold";

    const logContainer = document.createElement("div");
    logContainer.style.flex = "1";
    logContainer.style.padding = "12px";
    logContainer.style.overflowY = "auto";
    logContainer.style.whiteSpace = "pre-wrap";
    logContainer.style.fontSize = "13px";
    logContainer.style.lineHeight = "1.4";

    const inputRow = document.createElement("div");
    inputRow.style.display = "flex";
    inputRow.style.alignItems = "center";
    inputRow.style.padding = "10px 12px";
    inputRow.style.borderTop = "1px solid #224128";

    const prompt = document.createElement("span");
    prompt.textContent = ">";
    prompt.style.marginRight = "10px";
    prompt.style.color = "#74d17e";

    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "/set corruption 50";
    input.style.flex = "1";
    input.style.border = "1px solid #2a5631";
    input.style.outline = "none";
    input.style.padding = "9px 10px";
    input.style.background = "#0d130d";
    input.style.color = "#d5f2d8";
    input.style.fontFamily = "Consolas, Menlo, monospace";
    input.style.fontSize = "14px";

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const command = input.value.trim();
        input.value = "";
        if (command.length > 0) {
          this.execute(command);
        }
      }
    });

    inputRow.append(prompt, input);
    shell.append(header, logContainer, inputRow);
    panel.appendChild(shell);
    document.body.appendChild(panel);

    this.panel = panel;
    this.logContainer = logContainer;
    this.input = input;
  }

  private execute(command: string): void {
    this.writeLog(`> ${command}`);
    const parts = command.split(/\s+/);
    if (parts[0] === "/set") {
      this.handleSet(parts);
      return;
    }
    if (parts[0] === "/give") {
      this.handleGive(parts);
      return;
    }
    if (parts[0] === "/remove") {
      this.handleRemove(parts);
      return;
    }
    if (parts[0] === "/goto") {
      this.handleGoto(parts);
      return;
    }
    if (parts[0] === "/force") {
      this.handleForce(parts);
      return;
    }
    if (parts[0] === "/state") {
      this.handleState(parts);
      return;
    }
    this.writeLog("Unknown command.");
  }

  private handleSet(parts: string[]): void {
    if (parts[1] === "corruption") {
      const value = Number(parts[2]) as CorruptionLevel;
      if (!VALID_CORRUPTION.includes(value)) {
        this.writeLog("Usage: /set corruption <0|25|50|75|100>");
        return;
      }
      this.stateManager.setState({ corruptionLevel: value });
      this.corruptionManager?.apply(value);
      this.stateManager.saveDev();
      this.writeLog(`Corruption set to ${value}`);
      return;
    }

    if (parts[1] === "choice1" || parts[1] === "choice2") {
      const key = parts[1];
      const value = parts[2] as ChoiceOption;
      if (!VALID_CHOICES.includes(value)) {
        this.writeLog(`Usage: /set ${key} <A|B>`);
        return;
      }
      this.stateManager.setChoice(key, value);
      this.stateManager.saveDev();
      this.writeLog(`${key} set to ${value}`);
      return;
    }

    this.writeLog("Unknown /set target.");
  }

  private handleGive(parts: string[]): void {
    const reward = parts[1] as RewardId;
    if (!VALID_REWARDS.includes(reward)) {
      this.writeLog("Usage: /give <rewardId>");
      return;
    }
    this.stateManager.addToInventory(reward);
    this.stateManager.saveDev();
    this.writeLog(`Added reward: ${reward}`);
  }

  private handleRemove(parts: string[]): void {
    const reward = parts[1] as RewardId;
    if (!VALID_REWARDS.includes(reward)) {
      this.writeLog("Usage: /remove <rewardId>");
      return;
    }
    this.stateManager.removeFromInventory(reward);
    this.stateManager.saveDev();
    this.writeLog(`Removed reward: ${reward}`);
  }

  private handleGoto(parts: string[]): void {
    const target = parts[1] as MiniGameId;
    if (!VALID_GOTO.includes(target)) {
      this.writeLog("Usage: /goto <archive|weapon|radio|photo>");
      return;
    }
    this.stateManager.setState({ currentScene: "minigame" });
    this.stateManager.saveDev();
    this.game.scene.start(GOTO_SCENE_MAP[target]);
    this.writeLog(`Started ${GOTO_SCENE_MAP[target]}`);
  }

  private handleForce(parts: string[]): void {
    if (parts[1] !== "ending") {
      this.writeLog("Usage: /force ending <wife|will|crown>");
      return;
    }
    const ending = parts[2] as EndingId;
    if (!VALID_ENDINGS.includes(ending)) {
      this.writeLog("Usage: /force ending <wife|will|crown>");
      return;
    }
    const state = this.stateManager.getState();
    this.stateManager.setState({
      flags: {
        ...state.flags,
        forcedEnding: ending
      },
      currentScene: "final_doc"
    });
    this.stateManager.saveDev();
    this.game.scene.start("FinalDocScene");
    this.writeLog(`Forced ending: ${ending}`);
  }

  private handleState(parts: string[]): void {
    if (parts[1] === "dump") {
      const state = this.stateManager.getState();
      const serialized = JSON.stringify(state, null, 2);
      console.log(serialized);
      this.writeLog(serialized);
      return;
    }

    if (parts[1] === "reset") {
      this.stateManager.resetDev();
      this.writeLog("Dev storage keys cleared.");
      return;
    }

    this.writeLog("Usage: /state dump | /state reset");
  }

  private setVisible(nextVisible: boolean): void {
    if (this.panel === undefined) {
      return;
    }
    this.visible = nextVisible;
    this.panel.style.display = this.visible ? "block" : "none";
    if (this.visible) {
      this.input?.focus();
    }
  }

  private writeLog(message: string): void {
    if (this.logContainer === undefined) {
      return;
    }
    const line = document.createElement("div");
    line.textContent = message;
    this.logContainer.appendChild(line);
    while (this.logContainer.childElementCount > 220) {
      this.logContainer.removeChild(this.logContainer.firstElementChild as ChildNode);
    }
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  private readonly handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "F10") {
      event.preventDefault();
      this.setVisible(!this.visible);
    }
    if (event.key === "Escape" && this.visible) {
      this.setVisible(false);
    }
  };
}
