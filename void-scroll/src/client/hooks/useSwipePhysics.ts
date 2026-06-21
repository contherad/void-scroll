// useSwipePhysics.ts — All Void Scroll physics state, isolated in one hook.
//
// The score IS the feed's current distance from the middle (px), linear so it
// reads steadily. Swipe up and it rises against resistance; pull down and it
// falls. Let go and — once the LAST finger lifts — it eases back to the middle,
// dragging the score down to 0 with it.
//
// Multi-touch handoff: every active pointer moves the feed by its OWN delta, so
// two thumbs can ratchet it up with no jump and no reset (press the next before
// lifting the last). `gainMultiplier` lets endless events scale every swipe.
//
// `best` is the high-water mark for the run (survives the fall) — the endless
// leaderboard number.

import type * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { swipeGain } from '../lib/physics';

interface PointerState {
  lastY: number;
}

interface SwipePhysics {
  /** Current distance from the middle (px) — the live score. */
  score: number;
  /** Highest score reached this run (survives the fall). Endless leaderboard. */
  best: number;
  /** Visual translateY for the feed, in px (negative = up). */
  visualY: number;
  isDragging: boolean;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  /** Instantly jump the feed forward by `px` (e.g. a bonus orb). */
  boost: (px: number) => void;
  /** Slingshot to a NEW record: max(current, best) + px. Always raises best. */
  slingshot: (px: number) => void;
  /** Freeze the feed in place (no fall) until the next grab — e.g. while a mini-game is open. */
  hold: () => void;
  reset: () => void;
}

const RETURN_MS = 450; // how long the feed takes to fall back to the middle

export function useSwipePhysics(k: number, gainMultiplier = 1): SwipePhysics {
  const distanceRef = useRef(0); // current distance from the middle (px, >=0) = score
  const bestRef = useRef(0); // high-water mark for the run
  const kRef = useRef(k);
  const gainMultRef = useRef(gainMultiplier); // endless events scale every swipe
  const rafRef = useRef<number | null>(null); // fall-back animation
  const glideRef = useRef<number | null>(null); // smooth boost/slingshot animation
  const glidingRef = useRef(false); // true while a glide owns the feed
  const holdRef = useRef(false); // freeze the feed (no fall) until the next grab — e.g. mini-game
  const pointersRef = useRef<Map<number, PointerState>>(new Map()); // all fingers down
  const activeRef = useRef<number | null>(null); // the ONE touch that drives the feed

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [visualY, setVisualY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    kRef.current = k;
  }, [k]);
  useEffect(() => {
    gainMultRef.current = gainMultiplier;
  }, [gainMultiplier]);

  const cancelReturn = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const cancelGlide = useCallback(() => {
    if (glideRef.current !== null) {
      cancelAnimationFrame(glideRef.current);
      glideRef.current = null;
    }
    glidingRef.current = false;
  }, []);

  // Mirror the live distance into React state (score + visual position).
  const paint = useCallback(() => {
    const d = distanceRef.current;
    setScore(Math.round(d));
    setVisualY(-d);
    if (d > bestRef.current) {
      bestRef.current = d;
      setBest(Math.round(d));
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      cancelReturn(); // a new finger before it lands holds the current distance
      cancelGlide(); // grabbing the surface interrupts a glide and takes control
      holdRef.current = false; // grabbing ends any post-mini-game hold
      pointersRef.current.set(e.pointerId, { lastY: e.clientY });
      // Only the FIRST finger down drives. A second finger is held (keeps it
      // aloft) but cannot swipe until the first is lifted — no plant-and-pump.
      if (activeRef.current === null) activeRef.current = e.pointerId;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
    },
    [cancelReturn, cancelGlide],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = pointersRef.current.get(e.pointerId);
      if (!p) return;
      const deltaUp = p.lastY - e.clientY; // positive = swiped up
      p.lastY = e.clientY; // keep every finger's position current (no jump when promoted)
      if (e.pointerId !== activeRef.current) return; // only the active touch climbs
      if (glidingRef.current) return; // a glide owns the feed briefly
      const gain = swipeGain(distanceRef.current, deltaUp, kRef.current) * gainMultRef.current;
      distanceRef.current = Math.max(0, distanceRef.current + gain);
      paint();
    },
    [paint],
  );

  // Let the feed fall back to the middle; the score rides down to 0 with it.
  const startReturn = useCallback(() => {
    cancelReturn();
    cancelGlide();
    const start = distanceRef.current;
    if (start <= 0) {
      distanceRef.current = 0;
      paint();
      return;
    }
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / RETURN_MS);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      distanceRef.current = start * (1 - eased);
      paint();
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        distanceRef.current = 0;
        paint();
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [cancelReturn, cancelGlide, paint]);

  const endPointer = useCallback(
    (e: React.PointerEvent) => {
      const p = pointersRef.current.get(e.pointerId);
      if (!p) return;
      pointersRef.current.delete(e.pointerId);
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      if (activeRef.current === e.pointerId) {
        // The driver lifted: hand control to a remaining finger, but it must
        // actually swipe to climb again (you removed the first touch point).
        const next = pointersRef.current.keys().next().value;
        activeRef.current = next ?? null;
      }
      if (pointersRef.current.size === 0) {
        setIsDragging(false);
        startReturn(); // last finger up — fall back to the middle
      }
    },
    [startReturn],
  );

  // Smoothly glide the feed to a target distance (no jerky teleport). While a
  // glide runs it owns the feed; swipes are ignored until it finishes (~0.3s).
  const glide = useCallback(
    (targetPx: number, dur: number) => {
      cancelReturn();
      cancelGlide();
      const start = distanceRef.current;
      const target = Math.max(0, targetPx);
      if (Math.abs(target - start) < 1) {
        distanceRef.current = target;
        paint();
        return;
      }
      const t0 = performance.now();
      glidingRef.current = true;
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / dur);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        distanceRef.current = start + (target - start) * eased;
        paint();
        if (t < 1) {
          glideRef.current = requestAnimationFrame(step);
        } else {
          distanceRef.current = target;
          paint();
          glideRef.current = null;
          glidingRef.current = false;
          // Nothing holding it → fall back, UNLESS we're holding (post-mini-game):
          // the feed parks at the reward height until the player grabs to resume.
          if (!holdRef.current && pointersRef.current.size === 0) startReturn();
        }
      };
      glideRef.current = requestAnimationFrame(step);
    },
    [cancelReturn, cancelGlide, paint, startReturn],
  );

  // Bonus orb: glide forward. Slingshot: glide to a new record (always raises best).
  const boost = useCallback((px: number) => glide(distanceRef.current + px, 260), [glide]);
  const slingshot = useCallback(
    (px: number) => glide(Math.max(distanceRef.current, bestRef.current) + px, 340),
    [glide],
  );

  // Freeze the feed in place (no fall) until the next grab — used while the
  // mini-game is open so it doesn't cost you your height. Clears lingering fingers.
  const hold = useCallback(() => {
    cancelReturn();
    cancelGlide();
    pointersRef.current.clear();
    activeRef.current = null;
    holdRef.current = true;
    setIsDragging(false);
  }, [cancelReturn, cancelGlide]);

  const reset = useCallback(() => {
    cancelReturn();
    cancelGlide();
    distanceRef.current = 0;
    bestRef.current = 0;
    pointersRef.current.clear();
    activeRef.current = null;
    holdRef.current = false;
    setScore(0);
    setBest(0);
    setVisualY(0);
    setIsDragging(false);
  }, [cancelReturn, cancelGlide]);

  useEffect(
    () => () => {
      cancelReturn();
      cancelGlide();
    },
    [cancelReturn, cancelGlide],
  );

  return {
    score,
    best,
    visualY,
    isDragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
    },
    boost,
    slingshot,
    hold,
    reset,
  };
}
