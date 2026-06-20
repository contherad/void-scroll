// levels.ts — Level configuration: resistance constants, targets, card content.
//
// `target` is the score (= distance in px) needed to clear the level. Score is
// LINEAR in distance, so it reads steadily. You must reach the target while the
// feed is aloft (the progress bar tracks your live score and falls when you let
// go). Tuned for roughly 6 → 11 → 18 → 28 → 43 strokes across L1–L5.

export interface LevelConfig {
  level: number;
  k: number; // resistance constant (operates on pixels) — higher = climbs slower
  target: number; // score needed to clear the level (Infinity for endless)
  label: string;
  card: CardContent; // the "hero" card for this level (top of the feed)
}

export interface CardContent {
  subreddit: string;
  author: string;
  title: string;
  body: string;
  upvotes: number;
  comments: number;
}

export const ENDLESS_LEVEL = 6;

export const LEVELS: LevelConfig[] = [
  {
    level: 1,
    k: 0.0012,
    target: 1000,
    label: 'Easy',
    card: {
      subreddit: 'r/void',
      author: 'u/firstlight',
      title: 'TIL the void scrolls back.',
      body: 'Barely resists at first. Push it up.',
      upvotes: 12,
      comments: 3,
    },
  },
  {
    level: 2,
    k: 0.0012,
    target: 1500,
    label: 'Medium',
    card: {
      subreddit: 'r/void',
      author: 'u/driftwood',
      title: 'It is getting heavier up here.',
      body: 'Each push buys a little less.',
      upvotes: 148,
      comments: 27,
    },
  },
  {
    level: 3,
    k: 0.0012,
    target: 2000,
    label: 'Hard',
    card: {
      subreddit: 'r/void',
      author: 'u/longhaul',
      title: 'The feed does not want to move.',
      body: 'Use both thumbs. Never let it land.',
      upvotes: 2304,
      comments: 411,
    },
  },
  {
    level: 4,
    k: 0.0012,
    target: 2700,
    label: 'Very Hard',
    card: {
      subreddit: 'r/void',
      author: 'u/eventhorizon',
      title: 'Resistance is winning.',
      body: 'It crawls. Keep the ratchet going.',
      upvotes: 9821,
      comments: 1203,
    },
  },
  {
    level: 5,
    k: 0.0012,
    target: 3500,
    label: 'Brutal',
    card: {
      subreddit: 'r/void',
      author: 'u/nofloor',
      title: 'Almost nothing moves it now.',
      body: 'One last wall before the dark.',
      upvotes: 44012,
      comments: 7788,
    },
  },
  {
    level: 6,
    k: 0.0012,
    target: Infinity,
    label: 'Endless',
    card: {
      subreddit: 'r/void',
      author: 'u/—',
      title: 'Send it to the void.',
      body: 'No floor. No ceiling. How deep?',
      upvotes: 0,
      comments: 0,
    },
  },
];

// Shared pool of posts that fill the scrolling feed beneath the hero card, so
// there is always content rising from the bottom — visible proof of how far you
// are pushing even after the hero card has left the screen.
export const FEED_CARDS: CardContent[] = [
  { subreddit: 'r/deepscroll', author: 'u/thumbwar', title: 'My thumbs are cramping and I regret nothing.', body: 'Worth it.', upvotes: 842, comments: 56 },
  { subreddit: 'r/theclimb', author: 'u/ladders', title: 'Pro tip: alternate hands so it never falls.', body: 'Left, right, left, right.', upvotes: 1503, comments: 98 },
  { subreddit: 'r/nofloor', author: 'u/abyssal', title: 'How far down does this even go?', body: 'Asking for a friend.', upvotes: 377, comments: 41 },
  { subreddit: 'r/void', author: 'u/quietpixel', title: 'It pushes back harder the deeper you get.', body: 'Physics, apparently.', upvotes: 6620, comments: 233 },
  { subreddit: 'r/showerthoughts', author: 'u/midnight', title: 'Scrolling up is just falling, but optimistic.', body: '', upvotes: 23104, comments: 1890 },
  { subreddit: 'r/deepscroll', author: 'u/comet', title: 'Lost my whole run because I let go for a second.', body: 'Devastating.', upvotes: 991, comments: 144 },
  { subreddit: 'r/theclimb', author: 'u/summitfever', title: 'Just hit a new personal best. Hands shaking.', body: 'GG.', upvotes: 4488, comments: 302 },
  { subreddit: 'r/void', author: 'u/nullspace', title: 'There is no bottom. I checked.', body: 'Keep going.', upvotes: 1777, comments: 88 },
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
  return LEVELS[idx];
}

export function isEndless(level: number): boolean {
  return level >= ENDLESS_LEVEL;
}
