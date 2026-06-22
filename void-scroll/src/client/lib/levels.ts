// levels.ts — Level configuration: resistance constants, feed length, card content.
//
// A campaign level is a FINITE stack of `items` tiles. It completes the moment the
// last tile scrolls off the top of the screen (computed from geometry in SwipeCard,
// so completion lines up exactly with the feed emptying). Score is linear distance.
// Endless has Infinity items (recycles forever).

export interface LevelConfig {
  level: number;
  k: number; // resistance constant (operates on pixels) — higher = climbs slower
  items: number; // tiles to clear; level ends when the last one leaves (Infinity = endless)
  label: string;
  card: CardContent; // the "hero" card for this level (top of the feed)
}

// A tile that drifts past in the feed: an icon/symbol + a short evocative word.
// (No fake posts/karma — just calm, human glyphs falling into the void.)
export interface CardContent {
  glyph: string;
  word: string;
}

export const ENDLESS_LEVEL = 6;

export const LEVELS: LevelConfig[] = [
  { level: 1, k: 0.0012, items: 10, label: 'Easy', card: { glyph: '🌑', word: 'drift' } },
  { level: 2, k: 0.0012, items: 16, label: 'Medium', card: { glyph: '🌫️', word: 'deeper' } },
  { level: 3, k: 0.0012, items: 22, label: 'Hard', card: { glyph: '🪐', word: 'further' } },
  { level: 4, k: 0.0012, items: 30, label: 'Very Hard', card: { glyph: '🕳️', word: 'down' } },
  { level: 5, k: 0.0012, items: 40, label: 'Brutal', card: { glyph: '✦', word: 'below' } },
  { level: 6, k: 0.0012, items: Infinity, label: 'Endless', card: { glyph: '∞', word: 'the void' } },
];

// Shared pool of tiles that fill the scrolling feed beneath the hero tile, so
// there is always something drifting past — visible proof of how far you are
// pushing even after the hero tile has left the screen.
export const FEED_CARDS: CardContent[] = [
  { glyph: '·', word: 'hush' },
  { glyph: '☾', word: 'fall' },
  { glyph: '✧', word: 'echo' },
  { glyph: '◦', word: 'dust' },
  { glyph: '✦', word: 'deep' },
  { glyph: '⋆', word: 'calm' },
  { glyph: '◌', word: 'sink' },
  { glyph: '○', word: 'glow' },
  { glyph: '✺', word: 'far' },
  { glyph: '❍', word: 'lull' },
  { glyph: '◓', word: 'mist' },
  { glyph: '∴', word: 'slow' },
  { glyph: '⊙', word: 'dim' },
  { glyph: '✷', word: 'let go' },
];

// Endless milestones — a transient cheer fires the first time your best crosses
// each value. Must stay sorted ascending.
export interface Milestone {
  value: number;
  message: string;
}

export const MILESTONES: Milestone[] = [
  { value: 1000, message: 'Whoa — 1,000!' },
  { value: 2500, message: '2,500! Picking up speed' },
  { value: 5000, message: '5,000! Into the deep' },
  { value: 10000, message: '10,000! No floor in sight' },
  { value: 20000, message: '20,000! The abyss' },
  { value: 35000, message: '35,000! Legendary' },
  { value: 50000, message: '50,000! Are you okay?' },
  { value: 75000, message: '75,000! Unreal' },
  { value: 100000, message: '100,000! Void god 🫥' },
];

/** A named depth band for the endless/daily HUD — gives the descent a sense of place. */
export function depthZone(score: number): string {
  if (score < 1500) return 'The Surface';
  if (score < 4000) return 'The Shallows';
  if (score < 8000) return 'The Drift';
  if (score < 14000) return 'The Deep';
  if (score < 22000) return 'The Abyss';
  return 'The Void';
}

/** The highest milestone whose value has been reached, or null. */
export function highestMilestone(score: number): Milestone | null {
  let hit: Milestone | null = null;
  for (const m of MILESTONES) {
    if (score >= m.value) hit = m;
    else break;
  }
  return hit;
}

export function getLevel(level: number): LevelConfig {
  const idx = Math.min(Math.max(level, 1), LEVELS.length) - 1;
  return LEVELS[idx]!;
}

export function isEndless(level: number): boolean {
  return level >= ENDLESS_LEVEL;
}
