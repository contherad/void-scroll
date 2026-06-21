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
