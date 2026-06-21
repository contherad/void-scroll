// MiniGame.tsx — "Push the Core": the checkpoint task uses the SAME mechanic as the
// scroll — repeated swipes against rising resistance, alternating thumbs (only the
// first touch drives; lift it before the next). A constant force pulls the core back
// to centre, so you must keep swiping TOWARD each ring to push it out and hold it
// there. Tapping/holding does nothing — only strokes move it. Clear the rings to win.

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { sfxTick, sfxThunk, buzz } from '../lib/sfx';

const STEPS = 4;
const CORE_R = 16;
const TARGET_R = 30; // how close (to the ring centre) counts as "on" it
const TARGET_DIST = 0.32; // ring distance from centre, as a fraction of the field
const K = 0.006; // resistance: the further out, the less each swipe moves it
const GAIN = 0.95; // swipe px -> core px (before resistance)
const RETURN = 0.975; // per-frame pull back toward centre (the force you fight)
const CHARGE_MS = 520; // time held inside the ring to lock it
const TIME_MS = 22000;

let seenIntro = false;

type Vec = { x: number; y: number };

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function MiniGame({ onDone }: { onDone: (success: boolean) => void }) {
  const [phase, setPhase] = useState<'intro' | 'play'>(seenIntro ? 'play' : 'intro');
  const fieldRef = useRef<HTMLDivElement>(null);

  // --- sim refs (positions are RELATIVE TO CENTRE) ---
  const sizeRef = useRef({ w: 300, h: 360 });
  const coreRef = useRef<Vec>({ x: 0, y: 0 });
  const targetRef = useRef<Vec>({ x: 0, y: -100 });
  const chargeRef = useRef(0);
  const stepRef = useRef(0);
  const lastAngleRef = useRef(0);
  const ptrs = useRef<Map<number, Vec>>(new Map());
  const activeId = useRef<number | null>(null);
  const doneRef = useRef(false);
  const startRef = useRef(0);

  // --- render mirror (in field px) ---
  const [corePx, setCorePx] = useState<Vec>({ x: 150, y: 180 });
  const [targetPx, setTargetPx] = useState<Vec>({ x: 150, y: 80 });
  const [charge, setCharge] = useState(0);
  const [step, setStep] = useState(0);
  const [timeLeft, setTimeLeft] = useState(1);

  const finish = (ok: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(ok);
  };

  // Refs only — painting happens in the rAF loop (no setState in the effect body).
  const placeWaypoint = () => {
    const { w, h } = sizeRef.current;
    const dist = Math.min(w, h) * TARGET_DIST;
    let a = rand(0, Math.PI * 2);
    // keep consecutive rings in clearly different directions
    if (Math.abs(a - lastAngleRef.current) < 1.2) a += 1.2;
    lastAngleRef.current = a;
    targetRef.current = { x: Math.cos(a) * dist, y: Math.sin(a) * dist };
    chargeRef.current = 0;
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const el = fieldRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
    }
    coreRef.current = { x: 0, y: 0 };
    stepRef.current = 0;
    placeWaypoint();
    startRef.current = performance.now();

    let raf = 0;
    const loop = () => {
      const frac = 1 - (performance.now() - startRef.current) / TIME_MS;
      if (frac <= 0) {
        setTimeLeft(0);
        finish(false);
        return;
      }
      const P = coreRef.current;
      const T = targetRef.current;
      const { w, h } = sizeRef.current;
      // The force: pull the core back toward centre every frame.
      P.x *= RETURN;
      P.y *= RETURN;

      const inside = Math.hypot(P.x - T.x, P.y - T.y) < TARGET_R;
      const before = chargeRef.current;
      chargeRef.current = inside
        ? Math.min(1, chargeRef.current + 16 / CHARGE_MS)
        : Math.max(0, chargeRef.current - 16 / (CHARGE_MS * 1.3));
      if (inside && Math.floor(chargeRef.current * 4) > Math.floor(before * 4)) sfxTick();

      setCorePx({ x: w / 2 + P.x, y: h / 2 + P.y });
      setTargetPx({ x: w / 2 + T.x, y: h / 2 + T.y });
      setCharge(chargeRef.current);
      setTimeLeft(frac);

      if (chargeRef.current >= 1) {
        sfxThunk();
        buzz(22);
        const next = stepRef.current + 1;
        if (next >= STEPS) {
          finish(true);
          return;
        }
        stepRef.current = next;
        setStep(next);
        placeWaypoint();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Alternating-thumb model: only the FIRST touch drives; a second is tracked but
  // can't push until the first lifts (no plant-and-pump) — same as the main scroll.
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
    if (e.pointerId !== activeId.current) return; // only the active touch pushes
    const P = coreRef.current;
    const resist = 1 / (1 + K * Math.hypot(P.x, P.y)); // harder the further out
    P.x += dx * resist * GAIN;
    P.y += dy * resist * GAIN;
    const { w, h } = sizeRef.current;
    const mx = w / 2 - CORE_R;
    const my = h / 2 - CORE_R;
    P.x = Math.max(-mx, Math.min(mx, P.x));
    P.y = Math.max(-my, Math.min(my, P.y));
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
          Same as the scroll: <strong>swipe</strong> to push the core, <strong>alternating
          thumbs</strong> — and it gets harder the further out it goes. A force keeps pulling it
          back to centre.
        </p>
        <p className="mini__intro-text">
          Keep swiping <strong>toward each ring</strong> to hold the core inside until it locks. Clear
          all {STEPS} before the timer. You keep your depth either way.
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
    <div className="mini" role="dialog" aria-label="Push the core minigame">
      <div className="mini__time">
        <div className="mini__time-bar" style={{ width: `${timeLeft * 100}%` }} />
      </div>
      <div className="mini__head">◆ PUSH THE CORE</div>
      <div className="mini__sub">
        swipe toward the ring · alternate thumbs · {step + 1}/{STEPS}
      </div>

      <div
        ref={fieldRef}
        className="mini__field"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="mini__origin" />
        <div className="mini__ring" style={{ left: `${targetPx.x}px`, top: `${targetPx.y}px` }}>
          <div
            className="mini__ring-fill"
            style={{ transform: `translate(-50%, -50%) scale(${charge})` }}
          />
        </div>
        <div
          className={'mini__node' + (charge > 0 ? ' is-charging' : '')}
          style={{ left: `${corePx.x}px`, top: `${corePx.y}px` }}
        />
      </div>

      <div className="mini__dots">
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={'mini__dot' + (i < step ? ' is-done' : '')} />
        ))}
      </div>
      <button className="mini__skip" onClick={() => finish(false)}>
        skip ✕
      </button>
    </div>
  );
}
