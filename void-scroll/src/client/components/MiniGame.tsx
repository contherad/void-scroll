// MiniGame.tsx — "Steady the Core": a checkpoint task that reuses the void's
// resistance feel as a 2D steering puzzle. Drag the core orb into each waypoint and
// HOLD it there — but a current (a constant force) drifts it off course, and the
// core carries momentum, so you have to steer against the pull. The current changes
// direction every waypoint. Clear all of them before the timer to win a slingshot.

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { sfxTick, sfxThunk, buzz } from '../lib/sfx';

const STEPS = 5;
const PAD = 46; // keep waypoints off the edges
const TARGET_R = 32; // how close counts as "on" the waypoint
const CORE_R = 15;
const CHARGE_MS = 460; // how long you must hold it steady to lock a waypoint
const GRAB = 0.045; // spring strength toward your finger
const DAMP = 0.87; // inertia (closer to 1 = more glide / harder)
const WIND = 0.4; // constant drift force (px/frame^2)
const STEADY_V = 3.0; // core must be slower than this (px/frame) inside the ring to charge
const TIME_MS = 24000;

let seenIntro = false;

type Vec = { x: number; y: number };

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function MiniGame({ onDone }: { onDone: (success: boolean) => void }) {
  const [phase, setPhase] = useState<'intro' | 'play'>(seenIntro ? 'play' : 'intro');
  const fieldRef = useRef<HTMLDivElement>(null);

  // --- simulation refs (mutated every frame, no re-render) ---
  const sizeRef = useRef({ w: 300, h: 360 });
  const coreRef = useRef<Vec>({ x: 150, y: 180 });
  const velRef = useRef<Vec>({ x: 0, y: 0 });
  const windRef = useRef<Vec>({ x: 0, y: 0 });
  const targetRef = useRef<Vec>({ x: 150, y: 90 });
  const chargeRef = useRef(0);
  const stepRef = useRef(0);
  const fingerRef = useRef<Vec | null>(null);
  const ptrs = useRef<Set<number>>(new Set());
  const activeId = useRef<number | null>(null);
  const doneRef = useRef(false);
  const startRef = useRef(0);

  // --- render mirror ---
  const [core, setCore] = useState<Vec>({ x: 150, y: 180 });
  const [target, setTarget] = useState<Vec>({ x: 150, y: 90 });
  const [windAngle, setWindAngle] = useState(0);
  const [charge, setCharge] = useState(0);
  const [step, setStep] = useState(0);
  const [timeLeft, setTimeLeft] = useState(1);

  const finish = (ok: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(ok);
  };

  // Refs only — painting happens in the rAF loop (never setState in the effect body).
  const placeWaypoint = () => {
    const { w, h } = sizeRef.current;
    let tx = w / 2;
    let ty = h / 2;
    for (let i = 0; i < 12; i++) {
      tx = rand(PAD, w - PAD);
      ty = rand(PAD, h - PAD);
      if (Math.hypot(tx - coreRef.current.x, ty - coreRef.current.y) > Math.min(w, h) * 0.42) break;
    }
    targetRef.current = { x: tx, y: ty };
    const a = rand(0, Math.PI * 2); // a fresh current direction each waypoint
    windRef.current = { x: Math.cos(a) * WIND, y: Math.sin(a) * WIND };
    chargeRef.current = 0;
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const el = fieldRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      coreRef.current = { x: r.width / 2, y: r.height / 2 };
      velRef.current = { x: 0, y: 0 };
    }
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
      const C = coreRef.current;
      const V = velRef.current;
      const w = windRef.current;
      const sz = sizeRef.current;
      let ax = w.x;
      let ay = w.y;
      if (fingerRef.current && activeId.current !== null) {
        ax += (fingerRef.current.x - C.x) * GRAB;
        ay += (fingerRef.current.y - C.y) * GRAB;
      }
      V.x = (V.x + ax) * DAMP;
      V.y = (V.y + ay) * DAMP;
      C.x += V.x;
      C.y += V.y;
      // soft walls
      if (C.x < CORE_R) {
        C.x = CORE_R;
        V.x *= -0.4;
      } else if (C.x > sz.w - CORE_R) {
        C.x = sz.w - CORE_R;
        V.x *= -0.4;
      }
      if (C.y < CORE_R) {
        C.y = CORE_R;
        V.y *= -0.4;
      } else if (C.y > sz.h - CORE_R) {
        C.y = sz.h - CORE_R;
        V.y *= -0.4;
      }
      const T = targetRef.current;
      const speed = Math.hypot(V.x, V.y);
      // Charge only while it's inside AND steadied — you must counter the current,
      // not just blow through the ring.
      const charging = Math.hypot(C.x - T.x, C.y - T.y) < TARGET_R && speed < STEADY_V;
      const before = chargeRef.current;
      chargeRef.current = charging
        ? Math.min(1, chargeRef.current + 16 / CHARGE_MS)
        : Math.max(0, chargeRef.current - 16 / (CHARGE_MS * 1.4));
      if (charging && Math.floor(chargeRef.current * 4) > Math.floor(before * 4)) sfxTick();

      setCore({ x: C.x, y: C.y });
      setTarget({ x: T.x, y: T.y });
      setWindAngle((Math.atan2(w.y, w.x) * 180) / Math.PI);
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

  const fieldPos = (e: React.PointerEvent): Vec | null => {
    const el = fieldRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    ptrs.current.add(e.pointerId);
    if (activeId.current === null) activeId.current = e.pointerId;
    if (e.pointerId === activeId.current) fingerRef.current = fieldPos(e);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId !== activeId.current) return;
    fingerRef.current = fieldPos(e);
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (e.pointerId === activeId.current) {
      const next = ptrs.current.values().next();
      activeId.current = next.done ? null : next.value; // hand off to the other thumb
      if (activeId.current === null) fingerRef.current = null;
    }
  };

  if (phase === 'intro') {
    return (
      <div className="mini mini--intro" role="dialog" aria-label="Checkpoint mini-game">
        <div className="mini__badge">◆</div>
        <div className="mini__head">CHECKPOINT</div>
        <p className="mini__intro-text">
          Drag the <strong>core</strong> into each ring and <strong>hold it steady</strong> until it
          locks — but a <strong>current</strong> keeps pushing it off course, and the core carries
          momentum. Steer against the pull.
        </p>
        <p className="mini__intro-text">
          Lock all <strong>{STEPS} rings</strong> before the timer to launch deep. You keep your
          depth either way.
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
    <div className="mini" role="dialog" aria-label="Steady the core minigame">
      <div className="mini__time">
        <div className="mini__time-bar" style={{ width: `${timeLeft * 100}%` }} />
      </div>
      <div className="mini__head">◆ STEADY THE CORE</div>
      <div className="mini__sub">
        hold the core in the ring · {step + 1}/{STEPS}
      </div>

      <div
        ref={fieldRef}
        className="mini__field"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="mini__wind">
          <span className="mini__wind-arrow" style={{ transform: `rotate(${windAngle}deg)` }}>
            ➤
          </span>
          <span className="mini__wind-label">current</span>
        </div>
        <div className="mini__ring" style={{ left: `${target.x}px`, top: `${target.y}px` }}>
          <div
            className="mini__ring-fill"
            style={{ transform: `translate(-50%, -50%) scale(${charge})` }}
          />
        </div>
        <div
          className={'mini__node' + (charge > 0 ? ' is-charging' : '')}
          style={{ left: `${core.x}px`, top: `${core.y}px` }}
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
