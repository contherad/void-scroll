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
const GAIN = 0.4; // px-of-correct-swipe -> fill units
const MAX_STEP = 80; // cap a single pointer-move so a glitch can't jump the bar
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

// Show the how-to-play card only the first time the player ever opens a gate
// (per session). After that, drop straight into the task.
let seenIntro = false;

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
  const [phase, setPhase] = useState<'intro' | 'play'>(seenIntro ? 'play' : 'intro');
  const [seq] = useState<Dir[]>(randomSeq);
  const [step, setStep] = useState(0);
  const [fill, setFill] = useState(0);
  const [timeLeft, setTimeLeft] = useState(1); // 1 -> 0
  const fillRef = useRef(0);
  const stepRef = useRef(0);
  const doneRef = useRef(false);

  // Per-pointer tracking + a single active touch (alternating-thumb handoff with
  // no jump) — same model as the main scroll, so the fill never leaps on handoff.
  const ptrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const activeId = useRef<number | null>(null);

  const finish = (success: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(success);
  };

  // Countdown — only while actually playing; lose if it empties.
  useEffect(() => {
    if (phase !== 'play') return;
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
  }, [phase]);

  const dir = seq[step]!;

  const onDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeId.current === null) activeId.current = e.pointerId;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX; // keep every finger current so a handoff doesn't jump
    p.y = e.clientY;
    if (e.pointerId !== activeId.current) return; // only the active touch fills
    const v = VEC[seq[stepRef.current]!];
    let proj = dx * v.x + dy * v.y; // movement along the required direction
    if (proj <= 0) return; // wrong way doesn't help (or hurt)
    if (proj > MAX_STEP) proj = MAX_STEP;
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
    } else if (Math.floor(fillRef.current / 20) > Math.floor(before / 20)) {
      sfxTick(); // a chirp every ~20%
    }
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (e.pointerId === activeId.current) {
      const nextKey = ptrs.current.keys().next();
      activeId.current = nextKey.done ? null : nextKey.value; // promote the other thumb
    }
  };

  if (phase === 'intro') {
    return (
      <div className="mini mini--intro" role="dialog" aria-label="Checkpoint mini-game">
        <div className="mini__badge">◆</div>
        <div className="mini__head">CHECKPOINT</div>
        <p className="mini__intro-text">
          A node needs stabilizing. An arrow points a direction — <strong>swipe that way</strong>{' '}
          to charge it, pushing against the same resistance as the scroll.
        </p>
        <p className="mini__intro-text">
          Fill <strong>{STEPS} nodes</strong> before the timer runs out to launch deep. You keep
          your depth either way.
        </p>
        <button
          className="btn btn--primary"
          onClick={() => {
            seenIntro = true;
            setPhase('play');
          }}
        >
          Begin →
        </button>
        <button className="mini__skip" onClick={() => finish(false)}>
          skip ✕
        </button>
      </div>
    );
  }

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
