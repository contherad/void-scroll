// api.ts — Client-side data access.
//
// In the Devvit Web build these functions call the server routes defined in
// src/server/index.ts, which are backed by a Redis sorted set:
//
//   POST /api/score        { score, level }
//   GET  /api/leaderboard  -> [{ username, score }]
//   GET  /api/user-best    -> { score }
//
// For this standalone prototype there is no server, so we use an in-memory mock
// seeded with placeholder scores. NOTE: per the Devvit constraints we do NOT use
// localStorage (it does not work inside Reddit's iframe), so the mock resets on
// reload — that is expected for the prototype. Swap the bodies below for `fetch`
// calls when wiring up the real server.

export interface ScoreEntry {
  username: string;
  score: number;
}

const MOCK_USERNAME = 'u/you';

// Seeded leaderboard so the board feels alive in the prototype.
let board: ScoreEntry[] = [
  { username: 'u/eventhorizon', score: 18420 },
  { username: 'u/singularity', score: 15330 },
  { username: 'u/darkmatter', score: 12890 },
  { username: 'u/nofloor', score: 11250 },
  { username: 'u/driftwood', score: 9870 },
  { username: 'u/longhaul', score: 8110 },
  { username: 'u/stargrazer', score: 6640 },
  { username: 'u/firstlight', score: 4205 },
  { username: 'u/lurker99', score: 2980 },
  { username: 'u/newbie', score: 1240 },
];

let userBest = 0;

// Simulate a little network latency so transitions feel real.
function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** POST /api/score — submit a run. Returns the user's (possibly new) best. */
export async function submitScore(score: number, _level: number): Promise<{ best: number; rank: number }> {
  if (score > userBest) userBest = score;

  // Upsert the user's best into the board.
  board = board.filter((e) => e.username !== MOCK_USERNAME);
  board.push({ username: MOCK_USERNAME, score: userBest });
  board.sort((a, b) => b.score - a.score);

  const rank = board.findIndex((e) => e.username === MOCK_USERNAME) + 1;
  return delay({ best: userBest, rank });
}

/** GET /api/leaderboard — top 10, highest first. */
export async function getLeaderboard(limit = 10): Promise<ScoreEntry[]> {
  return delay(board.slice(0, limit).map((e) => ({ ...e })));
}

/** GET /api/user-best — the current user's personal best. */
export async function getUserBest(): Promise<number> {
  return delay(userBest);
}

/** Identify the current user's row in a board (for highlighting). */
export function isCurrentUser(entry: ScoreEntry): boolean {
  return entry.username === MOCK_USERNAME;
}
