// MiniGame.tsx — "Stabilize the Core": a short, Among-Us-style task that reuses
// Void Scroll's resistance mechanic but in FOUR directions. Each step shows a
// direction; swipe that way to fill the core against rising resistance. Clear all
// steps before the timer runs out to win a big slingshot back in the descent.

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { sfxTick, sfxThunk, buzz } from '../lib/sfx';

const STEPS = 4;
const TARGET = 100; // fill units per step
const K = 0.014; // resistance constant — fill gets harder as it nears full
const GAIN = 0.42; // px-of-correct-swipe -> fill units
const TIME_MS = 16000;

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const ARROW: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };
const VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function randomSeq(): Dir[] {
  // No two adjacent steps the same — keeps you changing direction.
  const out: Dir[] = [];
  for (let i = 0; i < STEPS; i++) {
    let d = DIRS[Math.floor(Math.random() * 4)]!;
    while (i > 0 && d === out[i - 1]) d = DIRS[Math.floor(Math.random() * 4)]!;
    out.push(d);
  }
  return out;
}

export function MiniGame({ onDone }: { onDone: (success: boolean) => void }) {
  const [seq] = useState<Dir[]>(randomSeq);
  const [step, setStep] = useState(0);
  const [fill, setFill] = useState(0);
  const [timeLeft, setTimeLeft] = useState(1); // 1 -> 0
  const fillRef = useRef(0);
  const stepRef = useRef(0);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const doneRef = useRef(false);

  const finish = (success: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(success);
  };

  // Countdown — lose if it empties.
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const frac = 1 - (performance.now() - start) / TIME_MS;
      if (frac <= 0) {
        setTimeLeft(0);
        finish(false);
        return;
      }
      setTimeLeft(frac);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dir = seq[step]!;

  const onDown = (e: React.PointerEvent) => {
    lastRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const l = lastRef.current;
    if (!l) return;
    const dx = e.clientX - l.x;
    const dy = e.clientY - l.y;
    lastRef.current = { x: e.clientX, y: e.clientY };
    const v = VEC[seq[stepRef.current]!];
    const proj = dx * v.x + dy * v.y; // movement along the required direction
    if (proj <= 0) return; // wrong way doesn't help (or hurt)
    const resist = 1 / (1 + K * fillRef.current);
    const before = fillRef.current;
    fillRef.current = Math.min(TARGET, fillRef.current + proj * resist * GAIN);
    setFill(fillRef.current);
    if (fillRef.current >= TARGET) {
      sfxThunk();
      buzz(22);
      const next = stepRef.current + 1;
      if (next >= STEPS) {
        finish(true);
        return;
      }
      stepRef.current = next;
      fillRef.current = 0;
      setStep(next);
      setFill(0);
      lastRef.current = null;
    } else if (Math.floor(fillRef.current / 20) > Math.floor(before / 20)) {
      sfxTick(); // a chirp every ~20%
    }
  };
  const onUp = () => {
    lastRef.current = null;
  };

  return (
    <div className="mini" role="dialog" aria-label="Stabilize the core minigame">
      <div className="mini__time">
        <div className="mini__time-bar" style={{ width: `${timeLeft * 100}%` }} />
      </div>
      <div className="mini__head">◆ STABILIZE THE CORE</div>
      <div className="mini__sub">
        swipe <strong>{dir}</strong> · step {step + 1}/{STEPS}
      </div>

      <div
        className="mini__field"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className={`mini__arrow mini__arrow--${dir}`}>{ARROW[dir]}</div>
        <div
          className="mini__core"
          style={{
            background: `conic-gradient(#6b8afd ${fill}%, rgba(255,255,255,0.06) 0)`,
          }}
        >
          <span className="mini__core-pct">{Math.round(fill)}%</span>
        </div>
      </div>

      <div className="mini__dots">
        {seq.map((_, i) => (
          <span key={i} className={'mini__dot' + (i < step ? ' is-done' : '')} />
        ))}
      </div>
      <button className="mini__skip" onClick={() => finish(false)}>
        skip ✕
      </button>
    </div>
  );
}
