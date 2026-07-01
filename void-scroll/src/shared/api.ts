// Shared API types (client <-> server).

// A player-created Challenge: a fixed-seed run others try to beat. When the game
// loads inside a Challenge post, init returns this and the app drops into that run.
export type ChallengeInfo = {
  creator: string;
  seed: number;
  target: number; // the creator's score to beat
  word: string | null; // the creator's headline word (the phrase you spell)
};

export type InitResponse = {
  type: 'init';
  username: string | null;
  best: number;
  lifetime: number;
  achievements: string[]; // ids of unlocked badges
  postId: string | null;
  challenge: ChallengeInfo | null; // non-null when this post IS a challenge
};

export type CreateChallengeResponse = { ok: true; url: string } | { ok: false; reason: string };

export type ChallengeScoreResponse = {
  rank: number | null;
  target: number;
  beat: boolean;
  entries: LeaderboardEntry[];
};

export type LeaderboardEntry = { username: string; score: number };
export type LeaderboardResponse = { entries: LeaderboardEntry[] };
export type BestResponse = { best: number };

// The player ranked one spot above you — the next person to beat. null if you're #1.
export type ChaseTarget = { username: string; score: number } | null;

export type ScoreResponse = {
  best: number;
  rank: number | null;
  lifetime: number;
  newAchievements: string[]; // badges unlocked by THIS run
  chase: ChaseTarget;
};

// Daily Descent: one shared seeded run per day, with its own board + streaks.
export type DailyResponse = {
  date: string; // UTC YYYY-MM-DD
  seed: number; // deterministic per-day seed (feed order)
  entries: LeaderboardEntry[];
  best: number; // your best today
  rank: number | null; // your rank today
  streak: number; // consecutive days played
  word: string | null; // today's community-authored secret word (null = no submissions yet)
  wordAuthor: string | null; // who sent it
};

// Submitting a word for the Daily Descent. `today` = it claimed today's open slot
// (you're the first), otherwise it's queued for an upcoming descent.
export type SubmitWordResponse =
  | { ok: true; word: string; queued: number; today: boolean }
  | { ok: false; reason: string };
export type DailyScoreResponse = {
  best: number;
  rank: number | null;
  streak: number;
  lifetime: number;
  newAchievements: string[];
  chase: ChaseTarget;
};

// Campaign progress: highest unlocked level (1..6, where 6 = Endless).
export type ProgressResponse = { unlocked: number };

// Share a run as a comment on the post.
export type ShareResponse = { ok: boolean };
