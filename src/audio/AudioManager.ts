import Phaser from "phaser";
import { Howl, Howler } from "howler";
import audioConfig from "../data/audio.json";
import { StateManager } from "../state/StateManager";
import type { CorruptionLevel } from "../types";
import type { AudioContent, RoomId } from "../types/content";

interface CorruptionAudioProfile {
  ambientVolume: number;
  ambientRate: number;
  whisperVolume: number;
  pressureVolume: number;
  roomVolume: number;
  pulseEnabled: boolean;
  spikeEnabled: boolean;
}

const profiles: Record<CorruptionLevel, CorruptionAudioProfile> = {
  0: {
    ambientVolume: 0.2,
    ambientRate: 0.8,
    whisperVolume: 0,
    pressureVolume: 0,
    roomVolume: 0.18,
    pulseEnabled: false,
    spikeEnabled: false
  },
  25: {
    ambientVolume: 0.3,
    ambientRate: 0.85,
    whisperVolume: 0,
    pressureVolume: 0,
    roomVolume: 0.2,
    pulseEnabled: true,
    spikeEnabled: false
  },
  50: {
    ambientVolume: 0.45,
    ambientRate: 0.9,
    whisperVolume: 0.1,
    pressureVolume: 0,
    roomVolume: 0.23,
    pulseEnabled: true,
    spikeEnabled: false
  },
  75: {
    ambientVolume: 0.6,
    ambientRate: 0.94,
    whisperVolume: 0.3,
    pressureVolume: 0,
    roomVolume: 0.26,
    pulseEnabled: true,
    spikeEnabled: true
  },
  100: {
    ambientVolume: 0.8,
    ambientRate: 0.76,
    whisperVolume: 0.5,
    pressureVolume: 0.46,
    roomVolume: 0.3,
    pulseEnabled: true,
    spikeEnabled: true
  }
};

export class AudioManager {
  private static instance: AudioManager | null = null;

  private readonly stateManager: StateManager;
  private readonly config = audioConfig as AudioContent;
  private readonly sounds = new Map<string, Howl>();
  private readonly playingOneShot = new Set<string>();

  private currentCorruption: CorruptionLevel = 0;
  private currentRoomId: string | null = null;
  private currentRoomSoundId: string | null = null;
  private roomFadeMs = 420;
  private started = false;
  private unlocked = false;
  private stopStateSubscription?: () => void;
  private pulseTimer?: ReturnType<typeof setTimeout>;
  private spikeTimer?: ReturnType<typeof setTimeout>;
  private easterEggPromise?: Promise<void>;

  public static getInstance(stateManager?: StateManager): AudioManager {
    if (AudioManager.instance === null) {
      AudioManager.instance = new AudioManager(stateManager ?? StateManager.getInstance());
    }
    return AudioManager.instance;
  }

  private constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.preloadSounds();
    this.setupAutoplayFallback();

    this.stopStateSubscription = this.stateManager.subscribe((state) => {
      this.applyCorruptionProfile(state.corruptionLevel);
    });
  }

  public stop(): void {
    this.clearPulseScheduler();
    this.clearSpikeScheduler();
    this.stopStateSubscription?.();
    this.stopStateSubscription = undefined;

    for (const sound of this.sounds.values()) {
      sound.stop();
      sound.unload();
    }
    this.sounds.clear();
    this.started = false;
  }

  public playOnce(id: string): void {
    const sound = this.getSound(id);
    if (sound === undefined) {
      return;
    }

    if (this.playingOneShot.has(id)) {
      sound.stop();
      this.playingOneShot.delete(id);
    }

    this.playingOneShot.add(id);
    const playbackId = sound.play();
    sound.once("end", () => {
      this.playingOneShot.delete(id);
    }, playbackId);
    sound.once("stop", () => {
      this.playingOneShot.delete(id);
    }, playbackId);
  }

  public playEasterEgg(id: string, duration: number): Promise<void> {
    if (this.easterEggPromise !== undefined) {
      return this.easterEggPromise;
    }

    const sound = this.getSound(id);
    if (sound === undefined) {
      return Promise.resolve();
    }

    this.easterEggPromise = new Promise<void>((resolve) => {
      const layersToDuck = ["ambient_base", "whisper_layer", "pressure_layer"];
      if (this.currentRoomSoundId !== null) {
        layersToDuck.push(this.currentRoomSoundId);
      }

      const previousVolumes = new Map<string, number>();
      layersToDuck.forEach((layerId) => {
        const layer = this.getSound(layerId);
        if (layer !== undefined) {
          previousVolumes.set(layerId, layer.volume());
          layer.fade(layer.volume(), layer.volume() * 0.35, 260);
        }
      });

      const playbackId = sound.play();
      const cleanup = (): void => {
        layersToDuck.forEach((layerId) => {
          const layer = this.getSound(layerId);
          const previous = previousVolumes.get(layerId);
          if (layer !== undefined && previous !== undefined) {
            layer.fade(layer.volume(), previous, 360);
          }
        });
        sound.stop(playbackId);
        this.easterEggPromise = undefined;
        resolve();
      };

      setTimeout(cleanup, Math.max(100, duration));
    });

    return this.easterEggPromise;
  }

  public crossfadeRoom(roomId: string): void {
    if (this.currentRoomId === roomId) {
      return;
    }

    const roomMap = this.config.rooms;
    const targetSoundId = roomMap[roomId as RoomId];
    if (targetSoundId === undefined) {
      this.fadeOutCurrentRoom();
      this.currentRoomId = roomId;
      return;
    }

    const previousSoundId = this.currentRoomSoundId;
    this.currentRoomId = roomId;
    this.currentRoomSoundId = targetSoundId;

    const targetSound = this.getSound(targetSoundId);
    if (targetSound === undefined) {
      return;
    }

    const profile = profiles[this.currentCorruption];
    const targetVolume = profile.roomVolume;
    if (!targetSound.playing()) {
      targetSound.volume(0);
      targetSound.play();
    }
    targetSound.fade(targetSound.volume(), targetVolume, this.roomFadeMs);

    if (previousSoundId !== null && previousSoundId !== targetSoundId) {
      const previous = this.getSound(previousSoundId);
      if (previous !== undefined && previous.playing()) {
        previous.fade(previous.volume(), 0, this.roomFadeMs);
        const previousRef = previous;
        setTimeout(() => {
          if (previousRef.volume() <= 0.01) {
            previousRef.stop();
          }
        }, this.roomFadeMs + 25);
      }
    }
  }

  private preloadSounds(): void {
    for (const clip of this.config.clips) {
      const howl = new Howl({
        src: [clip.src],
        loop: clip.loop,
        html5: true,
        volume: 0
      });
      this.sounds.set(clip.id, howl);
    }
  }

  private applyCorruptionProfile(level: CorruptionLevel): void {
    this.currentCorruption = level;
    const profile = profiles[level];
    const ambient = this.getSound("ambient_base");
    const whispers = this.getSound("whisper_layer");
    const pressure = this.getSound("pressure_layer");

    if (ambient !== undefined) {
      this.ensureLoopRunning(ambient);
      ambient.rate(profile.ambientRate);
      ambient.fade(ambient.volume(), profile.ambientVolume, 320);
    }

    if (whispers !== undefined) {
      this.ensureLoopRunning(whispers);
      whispers.fade(whispers.volume(), profile.whisperVolume, 360);
      if (profile.whisperVolume <= 0.001) {
        setTimeout(() => {
          if (whispers.volume() <= 0.001) {
            whispers.stop();
          }
        }, 420);
      }
    }

    if (pressure !== undefined) {
      if (profile.pressureVolume > 0.001) {
        this.ensureLoopRunning(pressure);
        pressure.fade(pressure.volume(), profile.pressureVolume, 420);
      } else if (pressure.playing()) {
        pressure.fade(pressure.volume(), 0, 420);
        setTimeout(() => {
          if (pressure.volume() <= 0.001) {
            pressure.stop();
          }
        }, 460);
      }
    }

    if (this.currentRoomSoundId !== null) {
      const room = this.getSound(this.currentRoomSoundId);
      if (room !== undefined && room.playing()) {
        room.fade(room.volume(), profile.roomVolume, 280);
      }
    }

    if (profile.pulseEnabled) {
      this.startPulseScheduler();
    } else {
      this.clearPulseScheduler();
    }

    if (profile.spikeEnabled) {
      this.startSpikeScheduler();
    } else {
      this.clearSpikeScheduler();
    }
  }

  private ensureLoopRunning(sound: Howl): void {
    if (!this.unlocked) {
      return;
    }
    if (!sound.playing()) {
      sound.play();
    }
  }

  private fadeOutCurrentRoom(): void {
    if (this.currentRoomSoundId === null) {
      return;
    }
    const current = this.getSound(this.currentRoomSoundId);
    if (current !== undefined && current.playing()) {
      current.fade(current.volume(), 0, this.roomFadeMs);
      const ref = current;
      setTimeout(() => {
        if (ref.volume() <= 0.01) {
          ref.stop();
        }
      }, this.roomFadeMs + 25);
    }
    this.currentRoomSoundId = null;
  }

  private setupAutoplayFallback(): void {
    if (typeof window === "undefined") {
      this.unlocked = true;
      return;
    }

    const unlock = (): void => {
      if (this.unlocked) {
        return;
      }
      this.unlocked = true;
      void Howler.ctx.resume().catch(() => undefined);
      this.applyCorruptionProfile(this.currentCorruption);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { passive: true, once: true });
    window.addEventListener("touchstart", unlock, { passive: true, once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  private startPulseScheduler(): void {
    if (this.pulseTimer !== undefined) {
      return;
    }
    const schedule = (): void => {
      this.playOnce("low_pulse");
      this.pulseTimer = setTimeout(schedule, Phaser.Math.Between(10000, 18000));
    };
    this.pulseTimer = setTimeout(schedule, Phaser.Math.Between(6000, 12000));
  }

  private clearPulseScheduler(): void {
    if (this.pulseTimer !== undefined) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = undefined;
    }
  }

  private startSpikeScheduler(): void {
    if (this.spikeTimer !== undefined) {
      return;
    }
    const schedule = (): void => {
      this.playOnce("harsh_noise_spike");
      this.spikeTimer = setTimeout(schedule, Phaser.Math.Between(8000, 15000));
    };
    this.spikeTimer = setTimeout(schedule, Phaser.Math.Between(7000, 11000));
  }

  private clearSpikeScheduler(): void {
    if (this.spikeTimer !== undefined) {
      clearTimeout(this.spikeTimer);
      this.spikeTimer = undefined;
    }
  }

  private getSound(id: string): Howl | undefined {
    return this.sounds.get(id);
  }
}
