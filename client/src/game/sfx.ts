const MUTE_STORAGE_KEY = "tancs.muted";

let audioCtx: AudioContext | null = null;

/** Lazily creates the single shared AudioContext — browsers require a user gesture before
 * audio can play, so this is only ever called from inside a click handler / animation that
 * started from one (firing a shot). */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // localStorage unavailable — mute preference just won't persist across reloads.
  }
}

/** A short frequency sweep + fast decay — a simple "pew" for a shot launching. */
export function playLaunch(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(680, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

/** A short burst of filtered noise + fast decay — a "thud/boom" for an impact. */
export function playImpact(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const durationSec = 0.35;
  const bufferSize = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(500, now);
  filter.frequency.exponentialRampToValueAtTime(100, now + durationSec);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + durationSec);
}
