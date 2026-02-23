import Phaser from "phaser";
import { Howl } from "howler";
import { StateManager } from "../../state/StateManager";
import { bindSceneResize } from "../utils/resize";

interface RadioAudioLayer {
  context: AudioContext;
  masterGain: GainNode;
  signalOscillator: OscillatorNode;
  signalGain: GainNode;
  noiseSource: AudioBufferSourceNode;
  noiseGain: GainNode;
  voiceGain?: GainNode;
  voiceSource?: AudioBufferSourceNode;
}

export class RadioScene extends Phaser.Scene {
  private readonly stateManager = StateManager.getInstance();
  private readonly minFrequency = 87.0;
  private readonly maxFrequency = 108.0;
  private readonly targetFrequency = 87.3;
  private readonly targetTolerance = 0.2;
  private readonly meterDurationSeconds = 90;
  private readonly trackPadding = 120;
  private readonly sliderY = 420;
  private trackStartX = 0;
  private trackEndX = 0;
  private trackWidth = 0;
  private desiredFrequency = 97.2;
  private actualFrequency = 97.2;
  private driftOffset = 0;
  private driftVelocity = 0;
  private successProgress = 0;
  private targetCenter = 96;
  private targetGoal = 96;
  private targetWidth = 1.2;
  private sceneStartTime = 0;
  private choiceMade = false;
  private modalOpen = false;
  private minigameCompleted = false;
  private dragActive = false;
  private eggHoldStart: number | null = null;
  private eggTriggered = false;
  private corruptionLevel = 0;
  private voicesActive = false;
  private silenceSpikeActive = false;
  private choicePromptShown = false;

  private frequencyText!: Phaser.GameObjects.Text;
  private driftText!: Phaser.GameObjects.Text;
  private meterFill!: Phaser.GameObjects.Rectangle;
  private targetBand!: Phaser.GameObjects.Rectangle;
  private handle!: Phaser.GameObjects.Arc;
  private actualNeedle!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private blackoutOverlay?: Phaser.GameObjects.Rectangle;

  private targetMoveEvent?: Phaser.Time.TimerEvent;
  private silenceSpikeEvent?: Phaser.Time.TimerEvent;
  private corruptionSpikeEvent?: Phaser.Time.TimerEvent;
  private wifeSinging?: Howl;
  private audioLayer?: RadioAudioLayer;

  public constructor() {
    super("RadioScene");
  }

  public create(): void {
    bindSceneResize(this);
    const state = this.stateManager.getState();
    this.corruptionLevel = state.corruptionLevel;
    this.choiceMade = state.choices.choice2 !== undefined;
    this.stateManager.setState({ currentScene: "minigame" });

    const { width, height } = this.scale;
    this.trackStartX = this.trackPadding;
    this.trackEndX = width - this.trackPadding;
    this.trackWidth = this.trackEndX - this.trackStartX;
    this.sceneStartTime = this.time.now;
    this.desiredFrequency = Phaser.Math.Clamp(this.desiredFrequency, this.minFrequency, this.maxFrequency);
    this.targetCenter = Phaser.Math.Between(900, 1040) / 10;
    this.targetGoal = this.targetCenter;

    this.cameras.main.setBackgroundColor("#0b1112");
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x0c1315, 1);
    this.add.rectangle(width * 0.5, height * 0.5, width - 60, height - 70, 0x1a2224, 0.92);
    this.add.rectangle(width * 0.5, 170, width - 150, 170, 0x12191b, 0.95).setStrokeStyle(2, 0x2e3d40, 1);
    this.add.rectangle(width * 0.5, this.sliderY, width - 150, 130, 0x11181a, 0.95).setStrokeStyle(2, 0x2e3d40, 1);
    this.add.rectangle(width * 0.5, 575, width - 150, 130, 0x0f1618, 0.95).setStrokeStyle(2, 0x2e3d40, 1);

    this.add
      .text(width * 0.5, 24, "РАДИОУЗЕЛ: УДЕРЖАНИЕ ЧАСТОТЫ", {
        color: "#d8e0e1",
        fontFamily: "'Special Elite', serif",
        fontSize: "32px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width * 0.5, 80, "Удерживайте сигнал в зелёной зоне под помехами.", {
        color: "#8ea0a3",
        fontFamily: "'Special Elite', serif",
        fontSize: "22px"
      })
      .setOrigin(0.5, 0);

    this.frequencyText = this.add
      .text(width * 0.5, 128, "", {
        color: "#d7f0d9",
        fontFamily: "'Special Elite', serif",
        fontSize: "44px",
        fontStyle: "bold"
      })
      .setOrigin(0.5, 0);

    this.driftText = this.add
      .text(width * 0.5, 178, "", {
        color: "#a9b8ba",
        fontFamily: "'Special Elite', serif",
        fontSize: "18px"
      })
      .setOrigin(0.5, 0);

    const track = this.add
      .rectangle(width * 0.5, this.sliderY, this.trackWidth, 16, 0x3f4a4d, 1)
      .setStrokeStyle(2, 0x657377, 1);
    track.setInteractive(
      new Phaser.Geom.Rectangle(this.trackStartX, this.sliderY - 26, this.trackWidth, 52),
      Phaser.Geom.Rectangle.Contains
    );

    this.targetBand = this.add.rectangle(this.trackStartX, this.sliderY, 24, 24, 0x3e8f48, 0.88);
    this.actualNeedle = this.add.rectangle(this.trackStartX, this.sliderY, 5, 42, 0xe0d29a, 1);
    this.handle = this.add.circle(this.trackStartX, this.sliderY, 16, 0x96adb2, 1).setStrokeStyle(2, 0xeaf0f1, 1);
    this.handle.setInteractive(new Phaser.Geom.Circle(0, 0, 16), Phaser.Geom.Circle.Contains);
    if (this.handle.input !== null) {
      this.handle.input.cursor = "pointer";
    }

    this.add
      .text(this.trackStartX, this.sliderY + 34, `${this.minFrequency.toFixed(1)} МГц`, {
        color: "#809094",
        fontFamily: "'Special Elite', serif",
        fontSize: "16px"
      })
      .setOrigin(0, 0);
    this.add
      .text(this.trackEndX, this.sliderY + 34, `${this.maxFrequency.toFixed(1)} МГц`, {
        color: "#809094",
        fontFamily: "'Special Elite', serif",
        fontSize: "16px"
      })
      .setOrigin(1, 0);

    const meterBg = this.add.rectangle(width * 0.5, 575, this.trackWidth, 26, 0x2c3538, 1).setStrokeStyle(2, 0x56686c, 1);
    meterBg.setOrigin(0.5);
    this.meterFill = this.add.rectangle(this.trackStartX, 575, 0, 22, 0x4ba35a, 1).setOrigin(0, 0.5);

    this.statusText = this.add
      .text(width * 0.5, 610, "Удерживайте сигнал в зелёной зоне.", {
        color: "#adbbbd",
        fontFamily: "'Special Elite', serif",
        fontSize: "20px"
      })
      .setOrigin(0.5, 0);

    this.setupInput(track);
    this.setupTargetMotion();
    this.setupAudioBed();

    if (this.corruptionLevel >= 75) {
      this.setupSilenceSpikes();
    }
    if (this.corruptionLevel === 100) {
      this.setupCorruptionNoiseSpikes();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  public update(time: number, delta: number): void {
    const dt = delta / 1000;

    this.updateTargetBand();
    this.updateInterference(dt, time);
    this.updateSuccessMeter(dt);
    this.updateEasterEggTimer(time);
    this.updateUiText();
  }

  private setupInput(track: Phaser.GameObjects.Rectangle): void {
    const onPointerSet = (pointer: Phaser.Input.Pointer): void => {
      if (this.modalOpen || this.minigameCompleted) {
        return;
      }
      this.dragActive = true;
      this.desiredFrequency = this.xToFrequency(pointer.worldX);
    };

    track.on("pointerdown", (pointer: Phaser.Input.Pointer) => onPointerSet(pointer));
    this.handle.on("pointerdown", (pointer: Phaser.Input.Pointer) => onPointerSet(pointer));

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !this.dragActive || this.modalOpen || this.minigameCompleted) {
        return;
      }
      this.desiredFrequency = this.xToFrequency(pointer.worldX);
    });

    this.input.on("pointerup", () => {
      this.dragActive = false;
    });
    this.input.on("gameout", () => {
      this.dragActive = false;
    });
  }

  private setupTargetMotion(): void {
    this.targetMoveEvent = this.time.addEvent({
      delay: 2200,
      loop: true,
      callback: () => {
        this.targetGoal = Phaser.Math.Between(880, 1070) / 10;
      }
    });
  }

  private updateTargetBand(): void {
    this.targetCenter = Phaser.Math.Linear(this.targetCenter, this.targetGoal, 0.014);
    const minCenter = this.minFrequency + this.targetWidth * 0.5 + 0.05;
    const maxCenter = this.maxFrequency - this.targetWidth * 0.5 - 0.05;
    this.targetCenter = Phaser.Math.Clamp(this.targetCenter, minCenter, maxCenter);
    const bandWidthPx = (this.targetWidth / (this.maxFrequency - this.minFrequency)) * this.trackWidth;
    this.targetBand.width = Math.max(20, bandWidthPx);
    this.targetBand.x = this.frequencyToX(this.targetCenter);
  }

  private updateInterference(dt: number, time: number): void {
    if (this.minigameCompleted) {
      return;
    }

    const elapsed = (time - this.sceneStartTime) / 1000;
    const corruptionMultiplier = this.corruptionLevel === 100 ? 2 : 1;
    const force = (0.36 + elapsed * 0.024) * corruptionMultiplier;
    const direction = this.driftOffset === 0 ? (Math.random() > 0.5 ? 1 : -1) : Math.sign(this.driftOffset);

    this.driftVelocity += direction * force * dt;
    this.driftVelocity += Phaser.Math.FloatBetween(-0.11, 0.11) * dt;
    this.driftVelocity *= 0.992;
    this.driftOffset += this.driftVelocity * dt;
    this.driftOffset = Phaser.Math.Clamp(this.driftOffset, -3.6, 3.6);

    this.actualFrequency = Phaser.Math.Clamp(
      this.desiredFrequency + this.driftOffset,
      this.minFrequency,
      this.maxFrequency
    );

    if (this.actualFrequency === this.minFrequency || this.actualFrequency === this.maxFrequency) {
      this.driftVelocity *= -0.42;
      this.driftOffset = this.actualFrequency - this.desiredFrequency;
    }

    this.handle.x = this.frequencyToX(this.desiredFrequency);
    this.actualNeedle.x = this.frequencyToX(this.actualFrequency);
  }

  private updateSuccessMeter(dt: number): void {
    if (this.modalOpen || this.minigameCompleted) {
      return;
    }

    const inZone = Math.abs(this.actualFrequency - this.targetCenter) <= this.targetWidth * 0.5;
    if (inZone) {
      this.successProgress = Phaser.Math.Clamp(this.successProgress + dt / this.meterDurationSeconds, 0, 1);
    }

    this.meterFill.width = this.trackWidth * this.successProgress;

    if (this.successProgress >= 0.5 && !this.choicePromptShown && !this.choiceMade) {
      this.choicePromptShown = true;
      this.showChoiceModal();
    }

    if (this.successProgress >= 0.5 && !this.voicesActive) {
      this.startVoiceLayer();
    }

    if (this.successProgress >= 1) {
      this.completeRadioScene();
    }
  }

  private updateEasterEggTimer(time: number): void {
    if (this.eggTriggered || this.minigameCompleted || this.modalOpen) {
      return;
    }

    if (Math.abs(this.actualFrequency - this.targetFrequency) <= this.targetTolerance) {
      if (this.eggHoldStart === null) {
        this.eggHoldStart = time;
      } else if (time - this.eggHoldStart >= 3000) {
        this.triggerEasterEgg();
      }
    } else {
      this.eggHoldStart = null;
    }
  }

  private triggerEasterEgg(): void {
    this.eggTriggered = true;
    this.eggHoldStart = null;
    this.statusText.setText("Частота 87.3 МГц удержана. Слышно далёкое пение...");

    if (this.audioLayer !== undefined) {
      this.audioLayer.masterGain.gain.setTargetAtTime(0.2, this.audioLayer.context.currentTime, 0.08);
    }

    this.wifeSinging = new Howl({
      src: ["/audio/wife_singing.mp3"],
      html5: true,
      volume: 0.38
    });
    this.wifeSinging.play();

    this.time.delayedCall(30000, () => {
      this.wifeSinging?.stop();
      if (this.audioLayer !== undefined) {
        this.audioLayer.masterGain.gain.setTargetAtTime(1, this.audioLayer.context.currentTime, 0.1);
      }
      if (!this.minigameCompleted) {
        this.statusText.setText("Удерживайте сигнал в зелёной зоне.");
      }
    });
  }

  private showChoiceModal(): void {
    this.modalOpen = true;
    const { width, height } = this.scale;

    const overlay = this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x000000, 0.9);
    overlay.setDepth(2000);
    overlay.setInteractive();
    overlay.on("pointerdown", () => undefined);

    const panel = this.add
      .rectangle(width * 0.5, height * 0.5, Math.min(width - 90, 860), 330, 0x1a1d1f, 0.98)
      .setStrokeStyle(2, 0x4f6469, 1)
      .setDepth(2001);

    const title = this.add
      .text(width * 0.5, panel.y - 132, "Канал найден. Какой диапазон закрепить?", {
        color: "#d5dfe1",
        fontFamily: "'Special Elite', serif",
        fontSize: "32px",
        align: "center"
      })
      .setOrigin(0.5, 0)
      .setDepth(2002);

    const optionA = this.createModalButton(
      width * 0.5,
      height * 0.5 - 40,
      "A: Настроить военный канал",
      "Эвакуация приоритетов короны и служебных семей.",
      () => {
        this.stateManager.setChoice("choice2", "A");
        this.stateManager.addToInventory("evac_data");
        closeModal();
      }
    );
    const optionB = this.createModalButton(
      width * 0.5,
      height * 0.5 + 78,
      "B: Настроить гражданский канал",
      "Сводки о потерях и остатках эвакуационных колонн.",
      () => {
        this.stateManager.setChoice("choice2", "B");
        this.stateManager.addToInventory("loss_data");
        closeModal();
      }
    );
    optionA.disableInteractive().setAlpha(0.55);
    optionB.disableInteractive().setAlpha(0.55);
    this.time.delayedCall(1000, () => {
      optionA.setInteractive(new Phaser.Geom.Rectangle(-350, -49, 700, 98), Phaser.Geom.Rectangle.Contains);
      optionB.setInteractive(new Phaser.Geom.Rectangle(-350, -49, 700, 98), Phaser.Geom.Rectangle.Contains);
      optionA.setAlpha(1);
      optionB.setAlpha(1);
    });

    const closeModal = (): void => {
      if (!this.modalOpen) {
        return;
      }
      this.choiceMade = true;
      this.modalOpen = false;
      this.stateManager.save();
      overlay.destroy();
      panel.destroy();
      title.destroy();
      optionA.destroy();
      optionB.destroy();
      this.statusText.setText("Выбор канала зафиксирован. Доведите заполнение шкалы до 100%.");
    };
  }

  private createModalButton(
    x: number,
    y: number,
    text: string,
    consequence: string,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, 0, 700, 98, 0x243033, 0.96)
      .setStrokeStyle(2, 0x607a80, 1);
    const label = this.add
      .text(0, -18, text, {
        color: "#ecf2f3",
        fontFamily: "'Special Elite', serif",
        fontSize: "26px"
      })
      .setOrigin(0.5);
    const effect = this.add
      .text(0, 20, consequence, {
        color: "#b5cad0",
        fontFamily: "'Special Elite', serif",
        fontSize: "16px",
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: 650 }
      })
      .setOrigin(0.5);

    const container = this.add.container(x, y, [bg, label, effect]);
    container.setDepth(2002);
    container.setSize(700, 98);
    container.setInteractive(new Phaser.Geom.Rectangle(-350, -49, 700, 98), Phaser.Geom.Rectangle.Contains);
    container.on("pointerover", () => bg.setFillStyle(0x314144, 1));
    container.on("pointerout", () => bg.setFillStyle(0x243033, 0.96));
    container.on("pointerdown", onClick);
    return container;
  }

  private completeRadioScene(): void {
    if (this.minigameCompleted || !this.choiceMade) {
      return;
    }
    this.minigameCompleted = true;
    this.statusText.setText("Сигнал стабилизирован.");

    this.stateManager.completeMiniGame("radio");
    this.stateManager.save();

    this.time.delayedCall(500, () => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("PhotoScene");
      });
      this.cameras.main.fadeOut(320, 0, 0, 0);
    });
  }

  private updateUiText(): void {
    this.frequencyText.setText(`${this.actualFrequency.toFixed(2)} МГц`);
    this.driftText.setText(
      `Дрейф: ${this.driftOffset >= 0 ? "+" : ""}${this.driftOffset.toFixed(2)} МГц | Заполнение: ${(this.successProgress * 100).toFixed(1)}%`
    );

    if (!this.modalOpen && !this.minigameCompleted) {
      const inZone = Math.abs(this.actualFrequency - this.targetCenter) <= this.targetWidth * 0.5;
      if (inZone) {
        this.statusText.setColor("#9fd7a6");
        this.statusText.setText("Сигнал в зоне. Удерживайте.");
      } else if (!this.eggTriggered) {
        this.statusText.setColor("#adbbbd");
        this.statusText.setText("Удерживайте сигнал в зелёной зоне.");
      }
    }
  }

  private setupAudioBed(): void {
    const context = this.getAudioContext();
    if (context === undefined) {
      return;
    }

    void context.resume().catch(() => undefined);

    const masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);

    const signalOscillator = context.createOscillator();
    signalOscillator.type = "sine";
    signalOscillator.frequency.value = 190;
    const signalGain = context.createGain();
    signalGain.gain.value = 0.02;
    signalOscillator.connect(signalGain);
    signalGain.connect(masterGain);
    signalOscillator.start();

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 2200;
    noiseFilter.Q.value = 0.9;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.028;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start();

    this.audioLayer = {
      context,
      masterGain,
      signalOscillator,
      signalGain,
      noiseSource,
      noiseGain
    };
  }

  private startVoiceLayer(): void {
    if (this.audioLayer === undefined || this.voicesActive) {
      return;
    }
    this.voicesActive = true;

    void this.loadReversedBuffer("/audio/npc_voices.mp3")
      .then((buffer) => {
        if (this.audioLayer === undefined || this.minigameCompleted) {
          return;
        }
        const source = this.audioLayer.context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.audioLayer.context.createGain();
        gain.gain.value = 0.018;
        source.connect(gain);
        gain.connect(this.audioLayer.masterGain);
        source.start();
        this.audioLayer.voiceSource = source;
        this.audioLayer.voiceGain = gain;
      })
      .catch(() => {
        // Optional layer; continue without it.
      });
  }

  private setupSilenceSpikes(): void {
    this.silenceSpikeEvent = this.time.addEvent({
      delay: 12000,
      loop: true,
      callback: () => {
        if (this.audioLayer === undefined || this.silenceSpikeActive || this.successProgress < 0.75) {
          return;
        }
        this.silenceSpikeActive = true;
        const now = this.audioLayer.context.currentTime;
        this.audioLayer.masterGain.gain.setValueAtTime(this.audioLayer.masterGain.gain.value, now);
        this.audioLayer.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.01);

        if (this.blackoutOverlay === undefined) {
          this.blackoutOverlay = this.add
            .rectangle(this.scale.width * 0.5, this.scale.height * 0.5, this.scale.width, this.scale.height, 0x000000, 0)
            .setDepth(2500);
        }
        this.blackoutOverlay.setAlpha(0.42);

        this.time.delayedCall(100, () => {
          if (this.audioLayer !== undefined) {
            this.audioLayer.masterGain.gain.linearRampToValueAtTime(1, this.audioLayer.context.currentTime + 0.03);
          }
          this.blackoutOverlay?.setAlpha(0);
          this.silenceSpikeActive = false;
        });
      }
    });
  }

  private setupCorruptionNoiseSpikes(): void {
    this.corruptionSpikeEvent = this.time.addEvent({
      delay: 5200,
      loop: true,
      callback: () => {
        if (this.audioLayer === undefined || this.minigameCompleted) {
          return;
        }
        const now = this.audioLayer.context.currentTime;
        this.audioLayer.noiseGain.gain.cancelScheduledValues(now);
        this.audioLayer.noiseGain.gain.setValueAtTime(this.audioLayer.noiseGain.gain.value, now);
        this.audioLayer.noiseGain.gain.linearRampToValueAtTime(0.1, now + 0.08);
        this.audioLayer.noiseGain.gain.linearRampToValueAtTime(0.028, now + 0.3);

        this.cameras.main.shake(130, 0.0022, true);
      }
    });
  }

  private async loadReversedBuffer(path: string): Promise<AudioBuffer> {
    if (this.audioLayer === undefined) {
      throw new Error("Audio layer unavailable");
    }
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await this.audioLayer.context.decodeAudioData(arrayBuffer.slice(0));
    const reversed = this.audioLayer.context.createBuffer(
      decoded.numberOfChannels,
      decoded.length,
      decoded.sampleRate
    );

    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const sourceData = decoded.getChannelData(channel);
      const targetData = reversed.getChannelData(channel);
      for (let index = 0; index < sourceData.length; index += 1) {
        targetData[index] = sourceData[sourceData.length - 1 - index];
      }
    }

    return reversed;
  }

  private frequencyToX(value: number): number {
    const t = (value - this.minFrequency) / (this.maxFrequency - this.minFrequency);
    return this.trackStartX + Phaser.Math.Clamp(t, 0, 1) * this.trackWidth;
  }

  private xToFrequency(x: number): number {
    const t = Phaser.Math.Clamp((x - this.trackStartX) / this.trackWidth, 0, 1);
    return this.minFrequency + t * (this.maxFrequency - this.minFrequency);
  }

  private getAudioContext(): AudioContext | undefined {
    const soundManager = this.sound as unknown as { context?: BaseAudioContext };
    const context = soundManager.context;
    if (context instanceof AudioContext) {
      return context;
    }
    return undefined;
  }

  private cleanup(): void {
    this.targetMoveEvent?.remove(false);
    this.silenceSpikeEvent?.remove(false);
    this.corruptionSpikeEvent?.remove(false);
    this.wifeSinging?.stop();
    this.wifeSinging?.unload();

    if (this.audioLayer !== undefined) {
      try {
        const now = this.audioLayer.context.currentTime;
        this.audioLayer.signalGain.gain.setTargetAtTime(0.0001, now, 0.05);
        this.audioLayer.noiseGain.gain.setTargetAtTime(0.0001, now, 0.05);
        this.audioLayer.voiceGain?.gain.setTargetAtTime(0.0001, now, 0.05);
        this.audioLayer.signalOscillator.stop(now + 0.2);
        this.audioLayer.noiseSource.stop(now + 0.2);
        this.audioLayer.voiceSource?.stop(now + 0.2);
      } catch {
        // Ignore shutdown races.
      }
    }
  }
}

