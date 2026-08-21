/** Signal Relay Tactical sound design: procedural Web Audio avoids persistent assets and resets cleanly every run. */
import { getCardSoundRecipe } from "./cardAudioRecipes";
import type { CardFamily, CardStatus, CardTier } from "./types";

type AudioContextWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

export class CardAudio {
  private context: AudioContext | null = null;
  private enabled = true;
  private volume = 0.7;
  private lastSoundAt = 0;

  public setEnabled(enabled: boolean): void { this.enabled = enabled; if (enabled) this.unlock(); }
  public setVolume(volume: number): void { this.volume = Math.max(0, Math.min(1, volume)); }
  public unlock = (): void => {
    if (!this.enabled) return;
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as AudioContextWithWebkit).webkitAudioContext;
      if (!Ctor) return;
      this.context = new Ctor();
    }
    if (this.context.state === "suspended") void this.context.resume();
  };
  public playCard(cardId: string, family: CardFamily, tier: CardTier, status?: CardStatus): void {
    if (!this.permit()) return;
    const recipe = getCardSoundRecipe(cardId);
    if (recipe) {
      recipe.notes.forEach((note, index) => this.tone(note, recipe.duration, recipe.wave, recipe.volume, index * recipe.rhythm));
      if (recipe.noise) this.noise(recipe.noise.duration, recipe.noise.volume, recipe.noise.delay ?? 0);
      return;
    }
    if (tier === "mega") { this.tone(220, 0.42, "sine", 0.07); this.tone(330, 0.36, "triangle", 0.06, 0.08); this.tone(440, 0.3, "sine", 0.05, 0.16); return; }
    if (status === "burn") { this.noise(0.2, 0.04); this.tone(110, 0.22, "sawtooth", 0.035); return; }
    if (status === "stun") { this.tone(880, 0.11, "square", 0.035); this.tone(1260, 0.09, "square", 0.02, 0.08); return; }
    if (status === "root" || status === "slow") { this.tone(330, 0.26, "triangle", 0.04); this.tone(190, 0.34, "sine", 0.025, 0.06); return; }
    if (status === "barrier" || status === "invincible" || status === "recover" || status === "boost" || status === "gauge") { this.tone(380, 0.18, "sine", 0.04); this.tone(570, 0.24, "sine", 0.03, 0.05); return; }
    if (family === "近接") { this.noise(0.08, 0.035); this.tone(620, 0.1, "sawtooth", 0.025); return; }
    if (family === "範囲" || family === "設置" || family === "地形") { this.tone(180, 0.22, "triangle", 0.05); this.noise(0.13, 0.025); return; }
    if (family === "反撃") { this.tone(520, 0.22, "sine", 0.045); this.tone(280, 0.26, "triangle", 0.035, 0.04); return; }
    this.tone(720, 0.09, "square", 0.035); this.tone(990, 0.07, "sine", 0.018, 0.05);
  }
  public playCounter(): void { if (!this.permit(true)) return; this.tone(180, 0.12, "square", 0.06); this.tone(740, 0.24, "sine", 0.05, 0.06); this.tone(1110, 0.2, "sine", 0.035, 0.12); }
  public playDeleted(id: string): void {
    if (!this.permit(true)) return;
    if (id === "bulwark") { this.tone(92, 0.42, "sawtooth", 0.07); this.noise(0.28, 0.055); return; }
    if (id === "scanner") { this.tone(1080, 0.2, "sine", 0.035); this.tone(540, 0.26, "triangle", 0.03, 0.08); return; }
    if (id === "razor") { this.noise(0.12, 0.05); this.tone(680, 0.16, "square", 0.04); return; }
    if (id === "mortar") { this.tone(74, 0.52, "sawtooth", 0.085); this.noise(0.36, 0.07); return; }
    this.tone(920, 0.3, "sine", 0.04); this.tone(470, 0.4, "triangle", 0.045, 0.06); this.noise(0.2, 0.035);
  }
  public dispose(): void { this.context?.close(); this.context = null; }

  private permit(force = false): boolean {
    if (!this.enabled) return false;
    this.unlock();
    if (!this.context || this.context.state !== "running") return false;
    const now = performance.now(); if (!force && now - this.lastSoundAt < 38) return false; this.lastSoundAt = now; return true;
  }
  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, delay = 0): void {
    if (!this.context) return;
    const now = this.context.currentTime + delay; const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * 0.62), now + duration);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(volume * this.volume, now + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination); oscillator.start(now); oscillator.stop(now + duration + 0.02);
  }
  private noise(duration: number, volume: number, delay = 0): void {
    if (!this.context) return;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration)); const buffer = this.context.createBuffer(1, frames, this.context.sampleRate); const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    const source = this.context.createBufferSource(); const gain = this.context.createGain(); const now = this.context.currentTime + delay;
    source.buffer = buffer; gain.gain.setValueAtTime(volume * this.volume, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); source.connect(gain).connect(this.context.destination); source.start(now); source.stop(now + duration);
  }
}
