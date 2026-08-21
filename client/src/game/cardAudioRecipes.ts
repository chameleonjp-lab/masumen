/** Signal Relay Tactical: one procedural audio signature for every audited card. */
import type { CardVfxId } from "./cardVisuals";

export interface CardSoundRecipe {
  wave: OscillatorType;
  notes: readonly number[];
  rhythm: number;
  duration: number;
  volume: number;
  noise?: { duration: number; volume: number; delay?: number };
}

export const CARD_SOUND_RECIPES: Record<CardVfxId, CardSoundRecipe> = {
  rapid: { wave: "square", notes: [760, 880, 1020], rhythm: 0.045, duration: 0.09, volume: 0.026 },
  lance: { wave: "sawtooth", notes: [220, 440, 660], rhythm: 0.035, duration: 0.23, volume: 0.045, noise: { duration: 0.1, volume: 0.018 } },
  seeker: { wave: "sine", notes: [460, 690, 920], rhythm: 0.055, duration: 0.14, volume: 0.03 },
  triplet: { wave: "square", notes: [520, 520, 760], rhythm: 0.075, duration: 0.1, volume: 0.025 },
  wide: { wave: "triangle", notes: [310, 420, 540], rhythm: 0.04, duration: 0.16, volume: 0.035 },
  column: { wave: "triangle", notes: [680, 480, 280], rhythm: 0.065, duration: 0.18, volume: 0.04, noise: { duration: 0.08, volume: 0.016, delay: 0.1 } },
  cross: { wave: "sine", notes: [360, 540, 720, 540], rhythm: 0.035, duration: 0.16, volume: 0.032 },
  fan: { wave: "sine", notes: [440, 520, 600], rhythm: 0.025, duration: 0.13, volume: 0.03 },
  ember: { wave: "sawtooth", notes: [150, 210, 290], rhythm: 0.05, duration: 0.19, volume: 0.04, noise: { duration: 0.16, volume: 0.035 } },
  fireline: { wave: "sawtooth", notes: [130, 180, 240, 300], rhythm: 0.04, duration: 0.16, volume: 0.034, noise: { duration: 0.2, volume: 0.038 } },
  frost: { wave: "sine", notes: [780, 660, 540], rhythm: 0.06, duration: 0.22, volume: 0.03 },
  icewall: { wave: "triangle", notes: [540, 620, 700], rhythm: 0.075, duration: 0.24, volume: 0.032 },
  volt: { wave: "square", notes: [980, 1440, 1120], rhythm: 0.035, duration: 0.08, volume: 0.025 },
  thunderline: { wave: "square", notes: [1280, 860, 520], rhythm: 0.055, duration: 0.12, volume: 0.035, noise: { duration: 0.06, volume: 0.014 } },
  root: { wave: "triangle", notes: [300, 240, 190], rhythm: 0.075, duration: 0.24, volume: 0.033 },
  web: { wave: "triangle", notes: [250, 310, 250, 190], rhythm: 0.045, duration: 0.18, volume: 0.028 },
  slash: { wave: "sawtooth", notes: [880, 440], rhythm: 0.045, duration: 0.16, volume: 0.042, noise: { duration: 0.07, volume: 0.018 } },
  sweep: { wave: "sawtooth", notes: [940, 680, 410], rhythm: 0.035, duration: 0.22, volume: 0.043, noise: { duration: 0.11, volume: 0.022 } },
  dashslash: { wave: "sawtooth", notes: [520, 820, 1180], rhythm: 0.03, duration: 0.19, volume: 0.047, noise: { duration: 0.1, volume: 0.024 } },
  gridcut: { wave: "square", notes: [760, 420, 980, 540], rhythm: 0.028, duration: 0.15, volume: 0.036 },
  moonblade: { wave: "sine", notes: [1040, 780, 520], rhythm: 0.055, duration: 0.3, volume: 0.045, noise: { duration: 0.12, volume: 0.016 } },
  timer: { wave: "square", notes: [280, 280, 560], rhythm: 0.12, duration: 0.09, volume: 0.03, noise: { duration: 0.16, volume: 0.035, delay: 0.19 } },
  watchmine: { wave: "square", notes: [480, 640, 480], rhythm: 0.1, duration: 0.1, volume: 0.027 },
  turret: { wave: "triangle", notes: [190, 260, 380], rhythm: 0.06, duration: 0.19, volume: 0.04, noise: { duration: 0.07, volume: 0.02 } },
  stake: { wave: "triangle", notes: [210, 160], rhythm: 0.065, duration: 0.25, volume: 0.042, noise: { duration: 0.1, volume: 0.02 } },
  breakpillar: { wave: "sawtooth", notes: [110, 82, 62], rhythm: 0.055, duration: 0.3, volume: 0.055, noise: { duration: 0.15, volume: 0.045 } },
  block: { wave: "sine", notes: [320, 400, 320], rhythm: 0.055, duration: 0.18, volume: 0.033 },
  toxic: { wave: "triangle", notes: [180, 220, 170], rhythm: 0.07, duration: 0.28, volume: 0.035, noise: { duration: 0.2, volume: 0.02 } },
  sanctum: { wave: "sine", notes: [500, 660, 820], rhythm: 0.06, duration: 0.22, volume: 0.03 },
  crack: { wave: "sawtooth", notes: [240, 170, 120], rhythm: 0.055, duration: 0.22, volume: 0.04, noise: { duration: 0.1, volume: 0.021 } },
  rush: { wave: "sine", notes: [330, 660, 990], rhythm: 0.04, duration: 0.18, volume: 0.04 },
  sector: { wave: "sine", notes: [430, 570, 710, 850], rhythm: 0.035, duration: 0.12, volume: 0.027 },
  gravity: { wave: "sine", notes: [700, 520, 340, 170], rhythm: 0.055, duration: 0.23, volume: 0.038 },
  gustwall: { wave: "triangle", notes: [620, 510, 620, 760], rhythm: 0.035, duration: 0.16, volume: 0.03 },
  hole: { wave: "sine", notes: [300, 220, 140], rhythm: 0.085, duration: 0.34, volume: 0.042 },
  prism: { wave: "sine", notes: [620, 780, 940], rhythm: 0.045, duration: 0.19, volume: 0.03 },
  phase: { wave: "sine", notes: [920, 1040, 780, 920], rhythm: 0.03, duration: 0.13, volume: 0.028 },
  return: { wave: "square", notes: [760, 980, 760], rhythm: 0.045, duration: 0.12, volume: 0.032, noise: { duration: 0.05, volume: 0.012 } },
  substitute: { wave: "sine", notes: [380, 480, 580], rhythm: 0.07, duration: 0.25, volume: 0.03 },
  magguard: { wave: "square", notes: [440, 660, 880, 660], rhythm: 0.035, duration: 0.11, volume: 0.026 },
  premonition: { wave: "sine", notes: [760, 920, 1120], rhythm: 0.08, duration: 0.17, volume: 0.03 },
  rectify: { wave: "sine", notes: [520, 660, 780], rhythm: 0.06, duration: 0.2, volume: 0.03 },
  repair: { wave: "triangle", notes: [390, 520, 650, 780], rhythm: 0.045, duration: 0.16, volume: 0.029 },
  fastsync: { wave: "sine", notes: [640, 760, 880, 1000], rhythm: 0.025, duration: 0.11, volume: 0.027 },
  stamp: { wave: "square", notes: [340, 340, 680], rhythm: 0.07, duration: 0.16, volume: 0.036, noise: { duration: 0.07, volume: 0.018, delay: 0.13 } },
  reroute: { wave: "triangle", notes: [460, 580, 460, 700], rhythm: 0.04, duration: 0.15, volume: 0.03 },
  meteor: { wave: "sawtooth", notes: [120, 180, 280, 440], rhythm: 0.06, duration: 0.28, volume: 0.055, noise: { duration: 0.22, volume: 0.045, delay: 0.12 } },
  dream: { wave: "sine", notes: [260, 390, 520, 780], rhythm: 0.07, duration: 0.32, volume: 0.045 },
  sanctuary: { wave: "sine", notes: [480, 640, 800, 960], rhythm: 0.06, duration: 0.3, volume: 0.04 },
  overdrive: { wave: "square", notes: [220, 440, 880, 1320], rhythm: 0.045, duration: 0.25, volume: 0.055, noise: { duration: 0.2, volume: 0.04 } },
};

export function getCardSoundRecipe(id: string): CardSoundRecipe | undefined {
  return CARD_SOUND_RECIPES[id as CardVfxId];
}

export function missingCardSoundIds(cardIds: string[]): string[] {
  return cardIds.filter((id) => !(id in CARD_SOUND_RECIPES));
}
