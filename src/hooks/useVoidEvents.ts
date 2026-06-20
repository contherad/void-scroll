// useVoidEvents.ts — Timed events that keep the endless run dynamic.
//
// While active, a calm period (~7–13s) alternates with a short event (~3.5–5s):
//   Surge   — resistance drops, the feed flies (a reward window)
//   Drag    — resistance spikes, you have to fight
//   Frenzy  — every swipe counts extra
// The returned multipliers feed straight into useSwipePhysics(k, gainMultiplier).

import { useEffect, useRef, useState } from 'react';

export interface VoidEvent {
  type: 'surge' | 'drag' | 'frenzy';
  label: string;
  kMultiplier: number;
  gainMultiplier: number;
}

const POOL: VoidEvent[] = [
  { type: 'surge', label: '⚡ SURGE — the void gives way', kMultiplier: 0.25, gainMultiplier: 1 },
  { type: 'drag', label: '🌑 DRAG — it pushes back hard', kMultiplier: 2.6, gainMultiplier: 1 },
  { type: 'frenzy', label: '🔥 FRENZY — every swipe counts double', kMultiplier: 1, gainMultiplier: 1.7 },
];

export function useVoidEvents(active: boolean) {
  const [event, setEvent] = useState<VoidEvent | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setEvent(null);
      return;
    }
    let cancelled = false;
    const clear = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleCalm = () => {
      const wait = 7000 + Math.random() * 6000;
      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        const ev = POOL[Math.floor(Math.random() * POOL.length)];
        setEvent(ev);
        const dur = 3500 + Math.random() * 1500;
        timerRef.current = window.setTimeout(() => {
          if (cancelled) return;
          setEvent(null);
          scheduleCalm();
        }, dur);
      }, wait);
    };
    scheduleCalm();

    return () => {
      cancelled = true;
      clear();
    };
  }, [active]);

  return {
    event,
    kMultiplier: event?.kMultiplier ?? 1,
    gainMultiplier: event?.gainMultiplier ?? 1,
  };
}
