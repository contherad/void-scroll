// feed.ts — Shared geometry for the scrolling card feed.
// A feed card at index i sits at the middle when distance === i * SLOT.

export const SLOT = 160; // px between card tops (card height + gap)

/** Today's deterministic seed (UTC date) — matches the server's daily seed. */
export function dateSeed(date = new Date()): number {
  const s = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic shuffle (mulberry32 + Fisher–Yates) — same seed, same order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = items.slice();
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
