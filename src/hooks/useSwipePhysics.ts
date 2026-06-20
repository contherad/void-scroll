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
  reset: () => void;
}

const RETURN_MS = 450; // how long the feed takes to fall back to the middle

export function useSwipePhysics(k: number, gainMultiplier = 1): SwipePhysics {
  const distanceRef = useRef(0); // current distance from the middle (px, >=0) = score
  const bestRef = useRef(0); // high-water mark for the run
  const kRef = useRef(k);
  const gainMultRef = useRef(gainMultiplier); // endless events scale every swipe
  const rafRef = useRef<number | null>(null); // fall-back animation
  const pointersRef = useRef<Map<number, PointerState>>(new Map()); // all fingers down

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
      pointersRef.current.set(e.pointerId, { lastY: e.clientY });
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setIsDragging(true);
    },
    [cancelReturn],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = pointersRef.current.get(e.pointerId);
      if (!p) return;
      // Each finger drives the feed by its own delta — no jump on handoff.
      const deltaUp = p.lastY - e.clientY; // positive = swiped up
      p.lastY = e.clientY;
      const gain = swipeGain(distanceRef.current, deltaUp, kRef.current) * gainMultRef.current;
      distanceRef.current = Math.max(0, distanceRef.current + gain);
      paint();
    },
    [paint],
  );

  // Let the feed fall back to the middle; the score rides down to 0 with it.
  const startReturn = useCallback(() => {
    cancelReturn();
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
  }, [cancelReturn, paint]);

  const endPointer = useCallback(
    (e: React.PointerEvent) => {
      const p = pointersRef.current.get(e.pointerId);
      if (!p) return;
      pointersRef.current.delete(e.pointerId);
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      if (pointersRef.current.size === 0) {
        setIsDragging(false);
        startReturn(); // last finger up — fall back to the middle
      }
      // Otherwise a thumb is still holding it up: keep climbing, no jump, no reset.
    },
    [startReturn],
  );

  const reset = useCallback(() => {
    cancelReturn();
    distanceRef.current = 0;
    bestRef.current = 0;
    pointersRef.current.clear();
    setScore(0);
    setBest(0);
    setVisualY(0);
    setIsDragging(false);
  }, [cancelReturn]);

  useEffect(() => () => cancelReturn(), [cancelReturn]);

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
    reset,
  };
}
