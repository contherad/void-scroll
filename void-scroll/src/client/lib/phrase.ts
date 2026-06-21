// phrase.ts — The "secret phrase" layer. Certain feed tiles carry a letter; tap
// them while scrolling to build the run's phrase. Completing it triggers a skip
// (a forward slingshot). Placement + phrase are deterministic per seed, so a
// given day's descent is the same puzzle for everyone.

// Evocative, human words — the kind you'd want to scroll toward. 4–5 letters so a
// phrase can still be completed on a deep run despite the wide, jittered spacing.
const PHRASES = [
  'DRIFT',
  'QUIET',
  'FLOAT',
  'DREAM',
  'STILL',
  'LETGO',
  'CALM',
  'FREE',
  'DUSK',
  'WAVE',
  'MIST',
  'GLOW',
];

const FIRST_INDEX = 8; // first letter tile sits this far down the feed
const MIN_GAP = 13; // letter tiles are 13–20 slots apart (jittered) — sparse + unpredictable
const MAX_GAP = 20;
const SLOT_COUNT = 90; // how many letter slots we lay out (word repeats deep down)

/** The word for a given run-seed + word number (endless cycles through words). */
export function wordAt(seed: number, wordIndex: number): string {
  return PHRASES[(((seed >>> 0) + wordIndex * 0x9e3779b1) >>> 0) % PHRASES.length]!;
}

export function phraseFor(seed: number): string {
  return wordAt(seed, 0);
}

// A small seeded PRNG so a given (phrase, seed) lays the letters out identically
// for everyone — but with irregular gaps you can't just count to.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Map of feed-index -> letter order. Slots are sparse + jittered, and the word
 * REPEATS down the feed (order = slot # mod length), so any letter you miss keeps
 * coming back around on a later pass (collected ones just show dim). Deterministic
 * per (phrase, seed).
 */
export function letterSlots(
  phrase: string,
  seed: number,
  startIndex = FIRST_INDEX,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!phrase) return map;
  const rand = mulberry32(seed);
  let idx = startIndex;
  for (let j = 0; j < SLOT_COUNT; j++) {
    map.set(idx, j % phrase.length);
    idx += MIN_GAP + Math.floor(rand() * (MAX_GAP - MIN_GAP + 1));
  }
  return map;
}
