// Shared API types (client <-> server).

export type InitResponse = {
  type: 'init';
  username: string | null;
  best: number;
  postId: string | null;
};

export type LeaderboardEntry = { username: string; score: number };
export type LeaderboardResponse = { entries: LeaderboardEntry[] };
export type BestResponse = { best: number };
export type ScoreResponse = { best: number; rank: number | null };

// Daily Descent: one shared seeded run per day, with its own board + streaks.
export type DailyResponse = {
  date: string; // UTC YYYY-MM-DD
  seed: number; // deterministic per-day seed (feed order)
  entries: LeaderboardEntry[];
  best: number; // your best today
  rank: number | null; // your rank today
  streak: number; // consecutive days played
};
export type DailyScoreResponse = { best: number; rank: number | null; streak: number };

// Campaign progress: highest unlocked level (1..6, where 6 = Endless).
export type ProgressResponse = { unlocked: number };

// Share a run as a comment on the post.
export type ShareResponse = { ok: boolean };
