import Phaser from "phaser";
import grainFragmentShader from "../shaders/grain.glsl?raw";
import type { CorruptionLevel, GameState } from "../types";
import { StateManager } from "./StateManager";

const PIPELINE_KEY = "RaspadCorruptionGrainPipeline";
const TRANSITION_MS = 600;

interface VisualProfile {
  tintRgb: [number, number, number];
  grain: number;
  vignette: number;
  hue: number;
  flickerHz: number;
  pulseVignette: number;
  frameScale: number;
}

const profileByLevel: Record<CorruptionLevel, VisualProfile> = {
  0: {
    tintRgb: [0x1a, 0x3a, 0x1a],
    grain: 0.02,
    vignette: 0.0,
    hue: 0,
    flickerHz: 0,
    pulseVignette: 0,
    frameScale: 1
  },
  25: {
    tintRgb: [0x2a, 0x3a, 0x1a],
    grain: 0.05,
    vignette: 0.06,
    hue: -5,
    flickerHz: 0.1,
    pulseVignette: 0,
    frameScale: 1
  },
  50: {
    tintRgb: [0x3a, 0x3a, 0x0a],
    grain: 0.12,
    vignette: 0.12,
    hue: -15,
    flickerHz: 0.3,
    pulseVignette: 0,
    frameScale: 1
  },
  75: {
    tintRgb: [0x5a, 0x2a, 0x0a],
    grain: 0.22,
    vignette: 0.26,
    hue: -35,
    flickerHz: 0.3,
    pulseVignette: 1,
    frameScale: 1
  },
  100: {
    tintRgb: [0x8b, 0x00, 0x00],
    grain: 0.35,
    vignette: 0.38,
    hue: -60,
    flickerHz: 0.3,
    pulseVignette: 1,
    frameScale: 1.06
  }
};

const grainUniforms = {
  time: 0,
  intensity: 0.02,
  flickerHz: 0
};

class CorruptionGrainPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  public constructor(game: Phaser.Game) {
    super({
      game,
      renderTarget: true,
      fragShader: grainFragmentShader
    });
  }

  public onPreRender(): void {
    this.set1f("uTime", grainUniforms.time);
    this.set1f("uIntensity", grainUniforms.intensity);
    this.set1f("uFlickerHz", grainUniforms.flickerHz);
  }
}

export class CorruptionManager {
  private static active: CorruptionManager | null = null;
  private readonly stateManager: StateManager;
  private readonly pipelinedCameras = new WeakSet<Phaser.Cameras.Scene2D.Camera>();
  private stopStateSubscription?: () => void;
  private rootStyle?: CSSStyleDeclaration;
  private tintOverlay?: HTMLDivElement;
  private vignetteOverlay?: HTMLDivElement;
  private currentLevel: CorruptionLevel = 0;
  private disturbanceTimerId?: number;
  private cursorReleaseTimerId?: number;

  private fromVisual = { ...profileByLevel[0] };
  private targetVisual = { ...profileByLevel[0] };
  private currentVisual = { ...profileByLevel[0] };
  private transitionStart = 0;
  private transitionEnd = 0;
  private lastAnimationSignature = "";

  public constructor(private readonly game: Phaser.Game, stateManager?: StateManager) {
    this.stateManager = stateManager ?? StateManager.getInstance();
    CorruptionManager.active = this;
  }

  public static getActive(): CorruptionManager | null {
    return CorruptionManager.active;
  }

  public start(): void {
    this.ensureCssScaffold();
    this.registerPipeline();

    this.stopStateSubscription = this.stateManager.subscribe((state) => {
      this.onStateChange(state);
    });

    this.game.events.on(Phaser.Core.Events.POST_STEP, this.handlePostStep, this);
    this.game.events.once(Phaser.Core.Events.DESTROY, this.destroy, this);
  }

  public destroy(): void {
    this.stopStateSubscription?.();
    this.stopStateSubscription = undefined;
    this.game.events.off(Phaser.Core.Events.POST_STEP, this.handlePostStep, this);
    this.clearDisturbanceLoop();
    if (typeof document !== "undefined") {
      document.body.classList.remove("corruption-text-unstable");
      document.body.style.cursor = "";
    }
    if (CorruptionManager.active === this) {
      CorruptionManager.active = null;
    }
  }

  public apply(level?: CorruptionLevel): void {
    const resolved = level ?? this.stateManager.getState().corruptionLevel;
    this.onStateChange({
      ...this.stateManager.getState(),
      corruptionLevel: resolved
    });
  }

  private onStateChange(state: Readonly<GameState>): void {
    const target = profileByLevel[state.corruptionLevel];
    this.currentLevel = state.corruptionLevel;
    this.fromVisual = { ...this.currentVisual };
    this.targetVisual = { ...target };
    const now = this.game.loop.time;
    this.transitionStart = now;
    this.transitionEnd = now + TRANSITION_MS;
    this.scheduleDisturbanceLoop();
  }

  private handlePostStep(time: number): void {
    this.attachPipelineToActiveCameras();
    this.interpolateVisual(time);
    this.applyVisuals(time);
  }

  private interpolateVisual(time: number): void {
    if (this.transitionEnd <= this.transitionStart) {
      this.currentVisual = { ...this.targetVisual };
      return;
    }

    const t = Phaser.Math.Clamp((time - this.transitionStart) / (this.transitionEnd - this.transitionStart), 0, 1);
    const eased = Phaser.Math.Easing.Cubic.InOut(t);
    this.currentVisual = {
      tintRgb: [
        Math.round(Phaser.Math.Linear(this.fromVisual.tintRgb[0], this.targetVisual.tintRgb[0], eased)),
        Math.round(Phaser.Math.Linear(this.fromVisual.tintRgb[1], this.targetVisual.tintRgb[1], eased)),
        Math.round(Phaser.Math.Linear(this.fromVisual.tintRgb[2], this.targetVisual.tintRgb[2], eased))
      ],
      grain: Phaser.Math.Linear(this.fromVisual.grain, this.targetVisual.grain, eased),
      vignette: Phaser.Math.Linear(this.fromVisual.vignette, this.targetVisual.vignette, eased),
      hue: Phaser.Math.Linear(this.fromVisual.hue, this.targetVisual.hue, eased),
      flickerHz: Phaser.Math.Linear(this.fromVisual.flickerHz, this.targetVisual.flickerHz, eased),
      pulseVignette: Phaser.Math.Linear(this.fromVisual.pulseVignette, this.targetVisual.pulseVignette, eased),
      frameScale: Phaser.Math.Linear(this.fromVisual.frameScale, this.targetVisual.frameScale, eased)
    };
  }

  private applyVisuals(time: number): void {
    if (this.rootStyle === undefined || this.tintOverlay === undefined || this.vignetteOverlay === undefined) {
      return;
    }

    const [r, g, b] = this.currentVisual.tintRgb;
    this.rootStyle.setProperty("--corruption-tint", `rgb(${r}, ${g}, ${b})`);
    this.rootStyle.setProperty("--corruption-grain", this.currentVisual.grain.toFixed(3));
    this.rootStyle.setProperty("--corruption-vignette", this.currentVisual.vignette.toFixed(3));
    this.rootStyle.setProperty("--corruption-hue", `${this.currentVisual.hue.toFixed(2)}deg`);
    this.rootStyle.setProperty("--corruption-frame-scale", this.currentVisual.frameScale.toFixed(3));
    this.rootStyle.setProperty("--corruption-flicker-period", `${Math.max(0.2, 1 / Math.max(this.currentVisual.flickerHz, 0.01)).toFixed(2)}s`);

    this.tintOverlay.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    this.tintOverlay.style.opacity = Phaser.Math.Clamp(0.18 + this.currentVisual.grain * 0.16, 0.16, 0.36).toFixed(3);
    this.vignetteOverlay.style.opacity = Phaser.Math.Clamp(this.currentVisual.vignette + this.currentVisual.grain * 0.12, 0, 0.6).toFixed(3);
    if (typeof document !== "undefined") {
      document.body.classList.toggle("corruption-text-unstable", this.currentLevel >= 100);
    }

    const animationParts: string[] = [];
    if (this.currentVisual.flickerHz > 0.01) {
      animationParts.push(`corruptionFlicker var(--corruption-flicker-period) steps(1,end) infinite`);
    }
    if (this.currentVisual.pulseVignette > 0.05) {
      animationParts.push(`corruptionPulse 2.8s ease-in-out infinite`);
    }

    const animationSignature = animationParts.join(", ");
    if (animationSignature !== this.lastAnimationSignature) {
      this.vignetteOverlay.style.animation = animationSignature;
      this.lastAnimationSignature = animationSignature;
    }

    grainUniforms.time = time / 1000;
    grainUniforms.intensity = this.currentVisual.grain;
    grainUniforms.flickerHz = this.currentVisual.flickerHz;
  }

  private ensureCssScaffold(): void {
    if (typeof document === "undefined") {
      return;
    }

    this.rootStyle = document.documentElement.style;

    const styleId = "raspad-corruption-style";
    if (document.getElementById(styleId) === null) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        :root {
          --corruption-tint: rgb(26, 58, 26);
          --corruption-grain: 0.02;
          --corruption-vignette: 0;
          --corruption-hue: 0deg;
          --corruption-frame-scale: 1;
          --corruption-flicker-period: 10s;
        }
        #app {
          filter: hue-rotate(var(--corruption-hue));
          transform: scale(var(--corruption-frame-scale));
          transform-origin: center center;
          transition: filter ${TRANSITION_MS}ms linear, transform ${TRANSITION_MS}ms ease;
          will-change: filter, transform;
        }
        #raspad-corruption-tint,
        #raspad-corruption-vignette {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          will-change: opacity;
        }
        #raspad-corruption-tint {
          mix-blend-mode: multiply;
          background: var(--corruption-tint);
          opacity: 0.18;
        }
        #raspad-corruption-vignette {
          background: radial-gradient(circle at center, rgba(0,0,0,0) 34%, rgba(0,0,0,0.95) 100%);
          opacity: var(--corruption-vignette);
        }
        @keyframes corruptionFlicker {
          0% { opacity: calc(var(--corruption-vignette) + 0.02); }
          15% { opacity: calc(var(--corruption-vignette) + 0.16); }
          32% { opacity: calc(var(--corruption-vignette) + 0.01); }
          64% { opacity: calc(var(--corruption-vignette) + 0.20); }
          100% { opacity: calc(var(--corruption-vignette) + 0.03); }
        }
        @keyframes corruptionPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        @keyframes corruptionTextJitter {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-0.5px, 0.4px); }
          50% { transform: translate(0.6px, -0.5px); }
          75% { transform: translate(-0.4px, -0.5px); }
          100% { transform: translate(0, 0); }
        }
        .corruption-text-unstable #app canvas,
        .corruption-text-unstable #app {
          animation: corruptionTextJitter 0.14s steps(2, end) infinite;
        }
      `;
      document.head.appendChild(style);
    }

    const ensureOverlay = (id: string): HTMLDivElement => {
      const existing = document.getElementById(id);
      if (existing instanceof HTMLDivElement) {
        return existing;
      }
      const node = document.createElement("div");
      node.id = id;
      document.body.appendChild(node);
      return node;
    };

    this.tintOverlay = ensureOverlay("raspad-corruption-tint");
    this.vignetteOverlay = ensureOverlay("raspad-corruption-vignette");
  }

  private registerPipeline(): void {
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (renderer?.pipelines === undefined) {
      return;
    }
    if (renderer.pipelines.get(PIPELINE_KEY) !== null) {
      return;
    }
    renderer.pipelines.addPostPipeline(PIPELINE_KEY, CorruptionGrainPipeline);
  }

  private attachPipelineToActiveCameras(): void {
    const activeScenes = this.game.scene.getScenes(true);
    for (const scene of activeScenes) {
      for (const camera of scene.cameras.cameras) {
        if (this.pipelinedCameras.has(camera)) {
          continue;
        }
        camera.setPostPipeline(PIPELINE_KEY);
        this.pipelinedCameras.add(camera);
      }
    }
  }

  private scheduleDisturbanceLoop(): void {
    this.clearDisturbanceLoop();
    if (typeof window === "undefined" || this.currentLevel < 25) {
      return;
    }

    const scheduleNext = (): void => {
      this.runDisturbance();
      const delay =
        this.currentLevel >= 75
          ? Phaser.Math.Between(7000, 13000)
          : this.currentLevel >= 50
            ? Phaser.Math.Between(11000, 19000)
            : Phaser.Math.Between(14000, 22000);
      this.disturbanceTimerId = window.setTimeout(scheduleNext, delay);
    };

    this.disturbanceTimerId = window.setTimeout(scheduleNext, Phaser.Math.Between(3000, 7000));
  }

  private clearDisturbanceLoop(): void {
    if (typeof window === "undefined") {
      return;
    }
    if (this.disturbanceTimerId !== undefined) {
      window.clearTimeout(this.disturbanceTimerId);
      this.disturbanceTimerId = undefined;
    }
    if (this.cursorReleaseTimerId !== undefined) {
      window.clearTimeout(this.cursorReleaseTimerId);
      this.cursorReleaseTimerId = undefined;
    }
  }

  private runDisturbance(): void {
    if (this.currentLevel >= 25) {
      this.flashVignette();
      this.freezeCursorBriefly();
    }
    if (this.currentLevel >= 50) {
      this.spawnGlitchStrips();
    }
    if (this.currentLevel >= 75) {
      this.shakeCameras();
    }
  }

  private flashVignette(): void {
    if (this.vignetteOverlay === undefined) {
      return;
    }
    const previous = this.vignetteOverlay.style.opacity;
    this.vignetteOverlay.style.opacity = (Number(previous || "0.2") + 0.18).toFixed(3);
    window.setTimeout(() => {
      if (this.vignetteOverlay !== undefined) {
        this.vignetteOverlay.style.opacity = previous;
      }
    }, Phaser.Math.Between(50, 100));
  }

  private freezeCursorBriefly(): void {
    if (typeof document === "undefined") {
      return;
    }
    document.body.style.cursor = "wait";
    if (this.cursorReleaseTimerId !== undefined) {
      window.clearTimeout(this.cursorReleaseTimerId);
    }
    this.cursorReleaseTimerId = window.setTimeout(() => {
      document.body.style.cursor = "";
      this.cursorReleaseTimerId = undefined;
    }, 200);
  }

  private spawnGlitchStrips(): void {
    if (typeof document === "undefined") {
      return;
    }
    const strips = Phaser.Math.Between(1, 3);
    for (let index = 0; index < strips; index += 1) {
      const strip = document.createElement("div");
      strip.style.position = "fixed";
      strip.style.left = "0";
      strip.style.width = "100vw";
      strip.style.top = `${Phaser.Math.Between(0, 95)}vh`;
      strip.style.height = `${Phaser.Math.Between(4, 20)}px`;
      strip.style.background = "rgba(255,255,255,0.08)";
      strip.style.pointerEvents = "none";
      strip.style.zIndex = "12000";
      strip.style.transform = `translateX(${Phaser.Math.Between(-20, 20)}px)`;
      document.body.appendChild(strip);
      window.setTimeout(() => strip.remove(), 110);
    }
  }

  private shakeCameras(): void {
    const activeScenes = this.game.scene.getScenes(true);
    for (const scene of activeScenes) {
      scene.cameras.main.shake(Phaser.Math.Between(90, 160), 0.0018, true);
    }
  }
}
