// useBonusOrbs.ts — Floating bonus objects that drift in and out of view. Tap one
// for a forward surge. Spawns on a loose timer while active; each orb auto-expires.

import { useEffect, useRef, useState } from 'react';

export type OrbKind = 'rush' | 'spark';

export interface Orb {
  id: number;
  kind: OrbKind;
  xPct: number; // horizontal position (% of surface)
  yPct: number; // vertical position (% of surface)
}

export const ORB_LIFETIME = 3600; // ms an orb stays before drifting away
export const ORB_BOOST: Record<OrbKind, number> = { rush: 340, spark: 150 };

export function useBonusOrbs(active: boolean): {
  orbs: Orb[];
  remove: (id: number) => void;
} {
  const [orbs, setOrbs] = useState<Orb[]>([]);
  const idRef = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return; // `active` is constant per mount in this game
    let cancelled = false;
    const schedule = () => {
      const wait = 4000 + Math.random() * 3500;
      timer.current = window.setTimeout(() => {
        if (cancelled) return;
        const id = ++idRef.current;
        const kind: OrbKind = Math.random() < 0.4 ? 'rush' : 'spark';
        const xPct = 15 + Math.random() * 70;
        const yPct = 28 + Math.random() * 44;
        setOrbs((o) => [...o, { id, kind, xPct, yPct }]);
        window.setTimeout(() => {
          if (!cancelled) setOrbs((o) => o.filter((x) => x.id !== id));
        }, ORB_LIFETIME);
        schedule();
      }, wait);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active]);

  const remove = (id: number) => setOrbs((o) => o.filter((x) => x.id !== id));
  return { orbs, remove };
}
