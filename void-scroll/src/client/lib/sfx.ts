// sfx.ts — Tiny procedural sound + haptics. No audio assets: every sound is a
// short Web Audio envelope synthesized on the fly. Best-effort and fully
// optional — if the browser blocks audio it just stays silent. Muted by default
// for prefers-reduced-motion users; a toggle flips it.

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let muted =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call inside a user gesture (first pointer down) to unlock audio. */
export function unlockAudio(): void {
  getCtx();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (m) stopAmbient();
  else startAmbient();
}
export function isMuted(): boolean {
  return muted;
}

function blip(
  freqStart: number,
  freqEnd: number,
  dur: number,
  type: OscillatorType,
  peak = 0.16,
  delay = 0,
): void {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, t0);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfxTick(): void {
  blip(740, 920, 0.07, 'triangle', 0.1); // collect a letter
}
export function sfxThunk(): void {
  blip(210, 120, 0.24, 'sine', 0.22); // level cleared
}
export function sfxSting(): void {
  blip(520, 660, 0.1, 'triangle', 0.13); // milestone
  blip(780, 990, 0.12, 'triangle', 0.12, 0.09);
}
export function sfxSwell(): void {
  // phrase complete — a quick rising arpeggio
  [523, 659, 784, 1047].forEach((f, i) => blip(f, f, 0.16, 'triangle', 0.12, i * 0.07));
}

export function buzz(pattern: number | number[]): void {
  try {
    if (!muted && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* haptics unsupported / blocked — ignore */
  }
}

// --- Ambient bed -----------------------------------------------------------
// A slow, evolving open-fifth drone (A2·E3·A3·E4) synthesized from sine voices,
// each "breathing" on its own slow LFO, under a drifting low-pass — calm, spacious,
// non-intrusive. No audio assets. Starts silent on a suspended context and fades in
// once audio is unlocked by the first gesture.

let ambient: { stop: () => void } | null = null;

export function startAmbient(): void {
  if (muted || ambient) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;

  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.08, now + 5); // gentle swell-in

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 680;
  filter.Q.value = 0.5;
  master.connect(filter).connect(c.destination);

  const oscs: OscillatorNode[] = [];
  const voices = [110, 164.81, 220, 329.63]; // A2 · E3 · A3 · E4 — open fifths, neutral/calm
  voices.forEach((freq, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = (i - 1.5) * 5; // slight spread = soft chorus

    const vg = c.createGain();
    const base = 0.3;
    vg.gain.value = base;
    const lfo = c.createOscillator(); // each voice breathes at its own slow rate
    lfo.type = 'sine';
    lfo.frequency.value = 0.045 + i * 0.02;
    const lfoG = c.createGain();
    lfoG.gain.value = base * 0.6;
    lfo.connect(lfoG).connect(vg.gain);

    osc.connect(vg).connect(master);
    osc.start(now);
    lfo.start(now);
    oscs.push(osc, lfo);
  });

  // slow filter drift for evolution
  const fLfo = c.createOscillator();
  fLfo.type = 'sine';
  fLfo.frequency.value = 0.028;
  const fLfoG = c.createGain();
  fLfoG.gain.value = 320;
  fLfo.connect(fLfoG).connect(filter.frequency);
  fLfo.start(now);
  oscs.push(fLfo);

  ambient = {
    stop: () => {
      const t = c.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0.0001, t + 1.4); // fade out
      } catch {
        /* ignore */
      }
      oscs.forEach((o) => {
        try {
          o.stop(t + 1.5);
        } catch {
          /* already stopped */
        }
      });
    },
  };
}

export function stopAmbient(): void {
  if (ambient) {
    ambient.stop();
    ambient = null;
  }
}
