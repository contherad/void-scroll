// api.ts — Client-side data access. Calls the Devvit server routes in
// src/server/routes/api.ts (Redis-backed leaderboard).

import type {
  BestResponse,
  ChaseTarget,
  ChallengeInfo,
  ChallengeScoreResponse,
  CreateChallengeResponse,
  DailyResponse,
  DailyScoreResponse,
  InitResponse,
  LeaderboardResponse,
  ProgressResponse,
  ScoreResponse,
  ShareResponse,
  SubmitWordResponse,
} from '../../shared/api';

export type {
  DailyResponse,
  ChaseTarget,
  ChallengeInfo,
  ChallengeScoreResponse,
} from '../../shared/api';

export interface ScoreEntry {
  username: string;
  score: number;
}

let currentUser: string | null = null;

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return (await r.json()) as T;
}

/** Call once on load: resolves the current user (for leaderboard highlighting). */
export async function init(): Promise<{
  username: string | null;
  best: number;
  lifetime: number;
  achievements: string[];
  challenge: ChallengeInfo | null;
}> {
  const d = await jget<InitResponse>('/api/init');
  currentUser = d.username;
  return {
    username: d.username,
    best: d.best,
    lifetime: d.lifetime,
    achievements: d.achievements,
    challenge: d.challenge,
  };
}

/** Post the current run as a Challenge others can beat. */
export async function createChallenge(
  score: number,
  seed: number,
  word: string | null,
): Promise<CreateChallengeResponse> {
  try {
    const r = await fetch('/api/create-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, seed, word }),
    });
    return (await r.json()) as CreateChallengeResponse;
  } catch {
    return { ok: false, reason: 'Network error — try again' };
  }
}

export async function submitChallengeScore(score: number): Promise<ChallengeScoreResponse> {
  const r = await fetch('/api/challenge-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score }),
  });
  if (!r.ok) throw new Error(`challenge-score -> ${r.status}`);
  return (await r.json()) as ChallengeScoreResponse;
}

/** Cumulative lifetime total + unlocked badge ids (one /init round-trip). */
export async function getMenuStats(): Promise<{ lifetime: number; achievements: string[] }> {
  const d = await jget<InitResponse>('/api/init');
  return { lifetime: d.lifetime, achievements: d.achievements };
}

export async function getLeaderboard(limit = 10): Promise<ScoreEntry[]> {
  const d = await jget<LeaderboardResponse>('/api/leaderboard');
  return d.entries.slice(0, limit);
}

export async function getUserBest(): Promise<number> {
  return (await jget<BestResponse>('/api/user-best')).best;
}

/** Longest-streak leaderboard (top streaks ever). */
export async function getStreakBoard(limit = 10): Promise<ScoreEntry[]> {
  const d = await jget<LeaderboardResponse>('/api/streak-leaderboard');
  return d.entries.slice(0, limit);
}

export async function submitScore(
  score: number,
  level: number,
): Promise<{
  best: number;
  rank: number | null;
  lifetime: number;
  newAchievements: string[];
  chase: ChaseTarget;
}> {
  const r = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, level }),
  });
  if (!r.ok) throw new Error(`score -> ${r.status}`);
  return (await r.json()) as ScoreResponse;
}

export function isCurrentUser(entry: ScoreEntry): boolean {
  return currentUser != null && entry.username === currentUser;
}

export function hasCurrentUser(): boolean {
  return currentUser != null;
}

/** The resolved Reddit username, or null if logged out / not yet initialised. */
export function currentUsername(): string | null {
  return currentUser;
}

// --- Share ---

export async function shareRun(score: number, mode: string, zone: string): Promise<boolean> {
  try {
    const r = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, mode, zone }),
    });
    if (!r.ok) return false;
    return ((await r.json()) as ShareResponse).ok;
  } catch {
    return false;
  }
}

// --- Campaign progress ---

export async function getProgress(): Promise<number> {
  return (await jget<ProgressResponse>('/api/progress')).unlocked;
}

export async function submitProgress(clearedLevel: number): Promise<number> {
  const r = await fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleared: clearedLevel }),
  });
  if (!r.ok) throw new Error(`progress -> ${r.status}`);
  return ((await r.json()) as ProgressResponse).unlocked;
}

// --- Daily Descent ---

export async function getDaily(): Promise<DailyResponse> {
  return jget<DailyResponse>('/api/daily');
}

/** Submit a word that may headline a future Daily Descent. */
export async function submitWord(word: string): Promise<SubmitWordResponse> {
  try {
    const r = await fetch('/api/submit-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    return (await r.json()) as SubmitWordResponse;
  } catch {
    return { ok: false, reason: 'Network error — try again' };
  }
}

export async function submitDailyScore(
  score: number,
): Promise<{
  best: number;
  rank: number | null;
  streak: number;
  lifetime: number;
  newAchievements: string[];
  chase: ChaseTarget;
}> {
  const r = await fetch('/api/daily-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score }),
  });
  if (!r.ok) throw new Error(`daily-score -> ${r.status}`);
  return (await r.json()) as DailyScoreResponse;
}
