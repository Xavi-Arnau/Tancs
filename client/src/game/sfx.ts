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

/** Fills a mono AudioBuffer with white noise of the given duration — shared by every
 * noise-burst-based sound below instead of each one re-deriving the same buffer setup. */
function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
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
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, durationSec);

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

/** A shorter, brighter noise burst than playImpact() — used for Air Strike's individual bomb
 * impacts. Bombs can release only a few ticks apart, so playImpact()'s longer 350ms decay
 * would overlap several bombs into one mushy wash; this one's short enough that a rapid
 * sequence of them still reads as distinct hits. */
export function playBombImpact(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const durationSec = 0.18;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, durationSec);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(250, now + durationSec);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + durationSec);
}

/** A simple droning "propeller engine" texture — two slightly-detuned low sawtooth oscillators
 * through a lowpass filter, faded in/held/faded out over the whole given duration. Used for
 * Air Strike's plane while it's crossing the map; scheduled once up front for its entire pass
 * (the duration is already known synchronously from airstrikeFlight.totalTicks), so there's no
 * separate "stop" call to manage later. */
export function playEngineDrone(durationSec: number): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (durationSec <= 0) return;

  const now = ctx.currentTime;
  const fadeSec = Math.min(0.4, durationSec / 4);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + fadeSec);
  gain.gain.setValueAtTime(0.12, now + Math.max(fadeSec, durationSec - fadeSec));
  gain.gain.linearRampToValueAtTime(0, now + durationSec);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 500;
  filter.connect(gain);
  gain.connect(ctx.destination);

  for (const freq of [90, 94]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + durationSec);
  }
}

/** A quiet, quick blip for each bomb releasing from the plane — deliberately understated (short,
 * low volume) so it sits under the engine drone as a subtle cue rather than competing with it. */
export function playBombRelease(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(900, now);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

/** A crackling "body" bed plus several quick overlapping bright pops — a burning tick. */
export function playCrackle(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const bedDurationSec = 0.4;
  const bed = ctx.createBufferSource();
  bed.buffer = createNoiseBuffer(ctx, bedDurationSec);
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "bandpass";
  bedFilter.frequency.value = 2200;
  bedFilter.Q.value = 0.7;
  const bedGain = ctx.createGain();
  bedGain.gain.setValueAtTime(0.0001, now);
  bedGain.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
  bedGain.gain.exponentialRampToValueAtTime(0.0001, now + bedDurationSec);
  bed.connect(bedFilter);
  bedFilter.connect(bedGain);
  bedGain.connect(ctx.destination);
  bed.start(now);
  bed.stop(now + bedDurationSec);

  for (let i = 0; i < 8; i++) {
    const start = now + Math.random() * 0.35;
    const durationSec = 0.004 + Math.random() * 0.006;
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, durationSec);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2000 + Math.random() * 2500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25 + Math.random() * 0.15, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + durationSec);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(start);
    noise.stop(start + durationSec);
  }
}

/** A condensed fizzing burst (tremolo-modulated bandpassed noise) ending in a quick upward
 * "plip" — a hazard-zone damage tick, whether lava or acid; the two are only distinguished at
 * zone-creation time. */
export function playSizzle(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const fizzDurationSec = 0.14;
  const fizzPeak = 0.24;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, fizzDurationSec);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1;
  filter.frequency.value = 2000;
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 50;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = fizzPeak * 0.35;
  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(fizzPeak, now + Math.min(0.08, fizzDurationSec * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.001, now + fizzDurationSec);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  lfo.start(now);
  lfo.stop(now + fizzDurationSec);
  noise.start(now);
  noise.stop(now + fizzDurationSec);

  const plipStart = now + fizzDurationSec * 0.7;
  const plipDurationSec = 0.06;
  const plip = ctx.createOscillator();
  plip.type = "sine";
  plip.frequency.setValueAtTime(900, plipStart);
  plip.frequency.exponentialRampToValueAtTime(1800, plipStart + plipDurationSec);
  const plipGain = ctx.createGain();
  plipGain.gain.setValueAtTime(0.001, plipStart);
  plipGain.gain.exponentialRampToValueAtTime(0.16, plipStart + 0.01);
  plipGain.gain.exponentialRampToValueAtTime(0.001, plipStart + plipDurationSec);
  plip.connect(plipGain);
  plipGain.connect(ctx.destination);
  plip.start(plipStart);
  plip.stop(plipStart + plipDurationSec);
}

/** A filtered-noise whoosh handing off into the same crackling texture as playCrackle() —
 * something just caught fire. */
export function playIgnite(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const whooshDurationSec = 0.18;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, whooshDurationSec);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.exponentialRampToValueAtTime(3000, now + whooshDurationSec);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + whooshDurationSec);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + whooshDurationSec);

  // Starts just before the whoosh fades out, so the fire "catches" rather than the two sounds
  // reading as separate events.
  const crackleStart = now + whooshDurationSec - 0.03;
  const bedDurationSec = 0.4;
  const bed = ctx.createBufferSource();
  bed.buffer = createNoiseBuffer(ctx, bedDurationSec);
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "bandpass";
  bedFilter.frequency.value = 2200;
  bedFilter.Q.value = 0.7;
  const bedGain = ctx.createGain();
  bedGain.gain.setValueAtTime(0.0001, crackleStart);
  bedGain.gain.exponentialRampToValueAtTime(0.05, crackleStart + 0.05);
  bedGain.gain.exponentialRampToValueAtTime(0.0001, crackleStart + bedDurationSec);
  bed.connect(bedFilter);
  bedFilter.connect(bedGain);
  bedGain.connect(ctx.destination);
  bed.start(crackleStart);
  bed.stop(crackleStart + bedDurationSec);

  for (let i = 0; i < 8; i++) {
    const start = crackleStart + Math.random() * 0.35;
    const durationSec = 0.004 + Math.random() * 0.006;
    const popNoise = ctx.createBufferSource();
    popNoise.buffer = createNoiseBuffer(ctx, durationSec);
    const popFilter = ctx.createBiquadFilter();
    popFilter.type = "highpass";
    popFilter.frequency.value = 2000 + Math.random() * 2500;
    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.25 + Math.random() * 0.15, start);
    popGain.gain.exponentialRampToValueAtTime(0.001, start + durationSec);
    popNoise.connect(popFilter);
    popFilter.connect(popGain);
    popGain.connect(ctx.destination);
    popNoise.start(start);
    popNoise.stop(start + durationSec);
  }
}

/** A sharp hiss transient decaying into a lower fizzing tail — something just got corroded. */
export function playCorrodeHiss(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const transientDurationSec = 0.08;
  const transient = ctx.createBufferSource();
  transient.buffer = createNoiseBuffer(ctx, transientDurationSec);
  const transientFilter = ctx.createBiquadFilter();
  transientFilter.type = "highpass";
  transientFilter.frequency.value = 3000;
  const transientGain = ctx.createGain();
  transientGain.gain.setValueAtTime(0.3, now);
  transientGain.gain.exponentialRampToValueAtTime(0.001, now + transientDurationSec);
  transient.connect(transientFilter);
  transientFilter.connect(transientGain);
  transientGain.connect(ctx.destination);
  transient.start(now);
  transient.stop(now + transientDurationSec);

  const tailStart = now + transientDurationSec;
  const tailDurationSec = 0.3;
  const tail = ctx.createBufferSource();
  tail.buffer = createNoiseBuffer(ctx, tailDurationSec);
  const tailFilter = ctx.createBiquadFilter();
  tailFilter.type = "bandpass";
  tailFilter.frequency.value = 2000;
  tailFilter.Q.value = 2;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(0.15, tailStart);
  tailGain.gain.exponentialRampToValueAtTime(0.001, tailStart + tailDurationSec);
  tail.connect(tailFilter);
  tailFilter.connect(tailGain);
  tailGain.connect(ctx.destination);
  tail.start(tailStart);
  tail.stop(tailStart + tailDurationSec);
}

/** A swelling bandpassed-noise "pour" as the crater fills, with a burst of the crackle texture
 * layered partway through for the glowing-hot surface — a lava pool forming. */
export function playLavaForm(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const durationSec = 0.5;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, durationSec);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1;
  filter.frequency.setValueAtTime(150, now);
  filter.frequency.exponentialRampToValueAtTime(900, now + durationSec * 0.8);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + durationSec * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + durationSec);

  const crackleStart = now + durationSec * 0.35;
  const crackleSpread = durationSec * 0.5;
  for (let i = 0; i < 7; i++) {
    const start = crackleStart + Math.random() * crackleSpread;
    const popDurationSec = 0.004 + Math.random() * 0.006;
    const popNoise = ctx.createBufferSource();
    popNoise.buffer = createNoiseBuffer(ctx, popDurationSec);
    const popFilter = ctx.createBiquadFilter();
    popFilter.type = "highpass";
    popFilter.frequency.value = 2000 + Math.random() * 2500;
    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.25 + Math.random() * 0.15, start);
    popGain.gain.exponentialRampToValueAtTime(0.001, start + popDurationSec);
    popNoise.connect(popFilter);
    popFilter.connect(popGain);
    popGain.connect(ctx.destination);
    popNoise.start(start);
    popNoise.stop(start + popDurationSec);
  }
}

/** A sharp chemical hiss onset followed by a few quick upward-chirping pops — an acid pool
 * forming, distinct from lava's heavier pour. */
export function playAcidForm(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const hissDurationSec = 0.15;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, hissDurationSec);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + hissDurationSec);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + hissDurationSec);

  for (let i = 0; i < 4; i++) {
    const start = now + 0.1 + i * 0.05 + Math.random() * 0.02;
    const popDurationSec = 0.05;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(700 + Math.random() * 300, start);
    osc.frequency.exponentialRampToValueAtTime(1600 + Math.random() * 400, start + popDurationSec);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.001, start);
    oscGain.gain.exponentialRampToValueAtTime(0.16, start + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(0.001, start + popDurationSec);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + popDurationSec);
  }
}

/** A short low thump — nodding to the heart shape with a single soft pulse — immediately
 * followed by a burst of the same crackle texture as playCrackle(): Love Is Pain's carrier
 * bursting into its heart-shaped flame pattern. */
export function playHeartBloom(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const pulseDurationSec = 0.16;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + pulseDurationSec);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + pulseDurationSec);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + pulseDurationSec);

  const crackleStart = now + pulseDurationSec * 0.6;
  const bedDurationSec = 0.32;
  const bed = ctx.createBufferSource();
  bed.buffer = createNoiseBuffer(ctx, bedDurationSec);
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "bandpass";
  bedFilter.frequency.value = 2200;
  bedFilter.Q.value = 0.7;
  const bedGain = ctx.createGain();
  bedGain.gain.setValueAtTime(0.0001, crackleStart);
  bedGain.gain.exponentialRampToValueAtTime(0.05, crackleStart + 0.05);
  bedGain.gain.exponentialRampToValueAtTime(0.0001, crackleStart + bedDurationSec);
  bed.connect(bedFilter);
  bedFilter.connect(bedGain);
  bedGain.connect(ctx.destination);
  bed.start(crackleStart);
  bed.stop(crackleStart + bedDurationSec);

  for (let i = 0; i < 6; i++) {
    const start = crackleStart + Math.random() * 0.3;
    const durationSec = 0.004 + Math.random() * 0.006;
    const popNoise = ctx.createBufferSource();
    popNoise.buffer = createNoiseBuffer(ctx, durationSec);
    const popFilter = ctx.createBiquadFilter();
    popFilter.type = "highpass";
    popFilter.frequency.value = 2000 + Math.random() * 2500;
    const popGain = ctx.createGain();
    popGain.gain.setValueAtTime(0.25 + Math.random() * 0.15, start);
    popGain.gain.exponentialRampToValueAtTime(0.001, start + durationSec);
    popNoise.connect(popFilter);
    popFilter.connect(popGain);
    popGain.connect(ctx.destination);
    popNoise.start(start);
    popNoise.stop(start + durationSec);
  }
}

/** A soft rising whoosh with a gentle attack — a balloon inflating and lifting off, quieter and
 * slower than playLaunch()'s sharp "pew" since this is a calm repositioning, not an attack. */
export function playBalloonLaunch(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const durationSec = 0.5;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + durationSec);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.14, now + durationSec * 0.4);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec);

  // A brief breathy noise puff under the tone, for the sense of air filling the envelope.
  const puffDurationSec = 0.3;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, puffDurationSec);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.08, now + 0.15);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + puffDurationSec);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + puffDurationSec);
}

/** A soft, low-pitched landing thump — a quieter, duller reuse of playImpact()'s shape,
 * since a balloon settling back onto the ground isn't meaningfully different from any other
 * soft landing, just calmer than an explosive impact. */
export function playBalloonLand(): void {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const durationSec = 0.3;
  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, durationSec);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(350, now);
  filter.frequency.exponentialRampToValueAtTime(80, now + durationSec);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.28, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + durationSec);
}
