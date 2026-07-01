import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  BestResponse,
  DailyResponse,
  DailyScoreResponse,
  InitResponse,
  LeaderboardResponse,
  ProgressResponse,
  ScoreResponse,
  ShareResponse,
  ChaseTarget,
  SubmitWordResponse,
  ChallengeInfo,
  CreateChallengeResponse,
  ChallengeScoreResponse,
} from '../../shared/api';
import { unlockedIds, type AchStats } from '../../shared/achievements';
import { validateWord } from '../../shared/words';

export const api = new Hono();

// Global leaderboard sorted set (scoped per app installation / subreddit).
const LB = 'leaderboard:global';
const STREAK_LB = 'leaderboard:streak'; // each member's longest streak ever

async function bestFor(username: string | null): Promise<number> {
  if (!username) return 0;
  const score = await redis.zScore(LB, username);
  return score ? Math.round(score) : 0;
}

// Lifetime total — every run's score is added here (cumulative, never resets).
async function lifetimeFor(username: string | null): Promise<number> {
  if (!username) return 0;
  const raw = await redis.get(`lifetime:${username}`);
  return raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
}

// Raise the global best (if higher) AND add the run to the lifetime total.
async function recordRun(username: string, score: number): Promise<{ best: number; lifetime: number }> {
  const prev = (await redis.zScore(LB, username)) ?? 0;
  if (score > prev) await redis.zAdd(LB, { member: username, score });
  const lifetime = score > 0 ? await redis.incrBy(`lifetime:${username}`, score) : await lifetimeFor(username);
  return { best: Math.round(Math.max(prev, score)), lifetime };
}

// The member ranked one spot ABOVE you on a board — your next target to pass.
// `rank` is 1-based, highest-first. Returns null if you're #1 or unranked.
async function chaseAbove(board: string, rank: number | null): Promise<ChaseTarget> {
  if (rank == null || rank <= 1) return null;
  const idx = rank - 2; // 0-based index (reverse order) of the member one rank up
  const rows = await redis.zRange(board, idx, idx, { reverse: true, by: 'rank' });
  const r = rows[0];
  return r ? { username: r.member, score: Math.round(r.score) } : null;
}

// Recompute unlocked badges from current stats, persist them, and report which are
// newly unlocked (so the run-end screen can celebrate them once).
async function syncAchievements(
  username: string,
  stats: AchStats,
): Promise<{ unlocked: string[]; newly: string[] }> {
  const unlocked = unlockedIds(stats);
  const raw = await redis.get(`ach:${username}`);
  let prev: string[] = [];
  if (raw) {
    try {
      prev = JSON.parse(raw) as string[];
    } catch {
      prev = [];
    }
  }
  const prevSet = new Set(prev);
  const newly = unlocked.filter((id) => !prevSet.has(id));
  if (newly.length > 0 || prev.length !== unlocked.length) {
    await redis.set(`ach:${username}`, JSON.stringify(unlocked));
  }
  return { unlocked, newly };
}

// Who am I + my best + lifetime + unlocked badges (called once on load).
api.get('/init', async (c) => {
  const username = (await reddit.getCurrentUsername()) ?? null;
  const best = await bestFor(username);
  const lifetime = await lifetimeFor(username);
  let achievements: string[] = [];
  if (username) {
    const streak = await getStreak(username);
    achievements = (await syncAchievements(username, { best, lifetime, streak })).unlocked;
  }
  return c.json<InitResponse>({
    type: 'init',
    username,
    best,
    lifetime,
    achievements,
    postId: context.postId ?? null,
    challenge: await challengeFor(context.postId ?? null),
  });
});

// Top 10, highest first.
api.get('/leaderboard', async (c) => {
  const rows = await redis.zRange(LB, 0, 9, { reverse: true, by: 'rank' });
  return c.json<LeaderboardResponse>({
    entries: rows.map((r) => ({ username: r.member, score: Math.round(r.score) })),
  });
});

api.get('/user-best', async (c) => {
  const username = (await reddit.getCurrentUsername()) ?? null;
  return c.json<BestResponse>({ best: await bestFor(username) });
});

// Submit a run — only ever raises your best — and return your rank.
api.post('/score', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) {
    return c.json({ status: 'error', message: 'must be logged in to score' }, 400);
  }

  const body = await c.req.json<{ score?: number; level?: number }>();
  const score = Math.max(0, Math.round(body.score ?? 0));

  const { best, lifetime } = await recordRun(username, score);
  const streak = await getStreak(username);
  const { newly } = await syncAchievements(username, { best, lifetime, streak });

  // zRank is 0-based ascending (lowest first); convert to 1-based highest-first.
  const card = await redis.zCard(LB);
  const rankAsc = await redis.zRank(LB, username);
  const rank = rankAsc == null ? null : card - rankAsc;
  const chase = await chaseAbove(LB, rank);

  return c.json<ScoreResponse>({ best, rank, lifetime, newAchievements: newly, chase });
});

// ------------------------------------------------------------------------ Share

api.post('/share', async (c) => {
  const username = await reddit.getCurrentUsername();
  const postId = context.postId;
  if (!username || !postId) return c.json<ShareResponse>({ ok: false }, 400);

  const body = await c.req.json<{ score?: number; mode?: string; zone?: string }>();
  const score = Math.max(0, Math.round(body.score ?? 0));
  const where = body.mode === 'daily' ? "today's Daily Descent" : 'the void';
  const zone = typeof body.zone === 'string' && body.zone ? `**${body.zone}** — ` : '';
  const text = `🌑 I reached ${zone}**${score.toLocaleString()}** in ${where} (Void Scroll). How deep can you go?`;

  try {
    await reddit.submitComment({ id: postId, text });
    return c.json<ShareResponse>({ ok: true });
  } catch (error) {
    console.error(`Share failed: ${error}`);
    return c.json<ShareResponse>({ ok: false }, 400);
  }
});

// ------------------------------------------------------------- Campaign progress

const MAX_LEVEL = 6; // 1..5 campaign + 6 = Endless

function clampLevel(n: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(n)));
}

api.get('/progress', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) return c.json<ProgressResponse>({ unlocked: 1 });
  const raw = await redis.get(`progress:${username}`);
  const unlocked = raw ? clampLevel(parseInt(raw, 10)) : 1;
  return c.json<ProgressResponse>({ unlocked });
});

api.post('/progress', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) return c.json<ProgressResponse>({ unlocked: 1 });
  const body = await c.req.json<{ cleared?: number }>();
  const cleared = clampLevel(body.cleared ?? 1);
  const raw = await redis.get(`progress:${username}`);
  const current = raw ? clampLevel(parseInt(raw, 10)) : 1;
  const unlocked = Math.max(current, clampLevel(cleared + 1));
  await redis.set(`progress:${username}`, String(unlocked));
  return c.json<ProgressResponse>({ unlocked });
});

// ----------------------------------------------------------------- Daily Descent

function dayKey(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function seedFromDate(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function rankIn(board: string, username: string): Promise<number | null> {
  const card = await redis.zCard(board);
  const rankAsc = await redis.zRank(board, username);
  return rankAsc == null ? null : card - rankAsc;
}

async function getStreak(username: string): Promise<number> {
  const raw = await redis.get(`streak:${username}`);
  if (!raw) return 0;
  try {
    const s = JSON.parse(raw) as { count: number; last: string };
    return s.last === dayKey(0) || s.last === dayKey(-1) ? s.count : 0;
  } catch {
    return 0;
  }
}

async function bumpStreak(username: string): Promise<number> {
  const key = `streak:${username}`;
  const today = dayKey(0);
  const raw = await redis.get(key);
  let s: { count: number; last: string } = { count: 0, last: '' };
  if (raw) {
    try {
      s = JSON.parse(raw);
    } catch {
      /* reset */
    }
  }
  if (s.last === today) return s.count; // already counted today
  const count = s.last === dayKey(-1) ? s.count + 1 : 1;
  await redis.set(key, JSON.stringify({ count, last: today }));
  // Record longest-streak-ever on the streak leaderboard.
  const prevBest = (await redis.zScore(STREAK_LB, username)) ?? 0;
  if (count > prevBest) await redis.zAdd(STREAK_LB, { member: username, score: count });
  return count;
}

// Longest-streak leaderboard (top 10, highest first).
api.get('/streak-leaderboard', async (c) => {
  const rows = await redis.zRange(STREAK_LB, 0, 9, { reverse: true, by: 'rank' });
  return c.json<LeaderboardResponse>({
    entries: rows.map((r) => ({ username: r.member, score: Math.round(r.score) })),
  });
});

// --------------------------------------------------- Community-authored Daily word
const WORD_QUEUE = 'word:queue'; // sorted set: score = submit time, member = {word,author}

type WordEntry = { word: string; author: string };

function parseWordEntry(raw: string | undefined): WordEntry | null {
  if (!raw) return null;
  try {
    const e = JSON.parse(raw) as WordEntry;
    return e && typeof e.word === 'string' ? e : null;
  } catch {
    return null;
  }
}

// Today's community word: the same for everyone (picked once, then cached for the day).
// Words are served in submission order, cycling — so every submission eventually
// headlines a daily. Returns null when no submissions exist yet (caller falls back).
async function dailyWord(date: string): Promise<WordEntry | null> {
  const cacheKey = `daily-word:${date}`;
  const cached = parseWordEntry(await redis.get(cacheKey));
  if (cached) return cached;

  const n = await redis.zCard(WORD_QUEUE);
  if (n === 0) return null;
  const cursorRaw = await redis.get('word:cursor');
  const cursor = cursorRaw ? Math.max(0, parseInt(cursorRaw, 10) || 0) : 0;
  const idx = cursor % n;
  const rows = await redis.zRange(WORD_QUEUE, idx, idx, { by: 'rank' }); // ascending = oldest-first
  const entry = parseWordEntry(rows[0]?.member);
  if (!entry) return null;
  await redis.set('word:cursor', String(cursor + 1));
  await redis.set(cacheKey, JSON.stringify(entry));
  await redis.expire(cacheKey, 60 * 60 * 24 * 3);
  return entry;
}

// ----------------------------------------- Live leaderboard COMMENT on the post
// An app-owned, stickied comment that shows today's top descents and refreshes as
// scores arrive — so the post shows live community activity right in the feed.

function buildDailyComment(
  date: string,
  top: { username: string; score: number }[],
  word: string | null,
  author: string | null,
): string {
  const head = word
    ? `Today's word: **${word}**${author ? ` — sent by u/${author}` : ''}`
    : `Spell the word, ride the depths.`;
  const rows = top.length
    ? top.map((e, i) => `${i + 1}. **u/${e.username}** — ${e.score.toLocaleString()}`).join('\n')
    : `_Be the first to descend today._`;
  return [
    `## 🌌 Void Scroll — Daily Descent · ${date}`,
    head,
    '',
    rows,
    '',
    `*Open the post above ↑ and swipe — how deep can you send the feed into the void?*`,
    `^(Auto-updated leaderboard · new descent every day)`,
  ].join('\n');
}

async function updateDailyComment(postId: string): Promise<void> {
  const date = dayKey(0);
  const board = `daily:${date}`;
  const rows = await redis.zRange(board, 0, 4, { reverse: true, by: 'rank' });
  const top = rows.map((r) => ({ username: r.member, score: Math.round(r.score) }));
  const w = await dailyWord(date);
  const text = buildDailyComment(date, top, w?.word ?? null, w?.author ?? null);

  const key = `lb-comment:${postId}`;
  const stored = await redis.get(key);
  if (stored) {
    const existing = await reddit.getCommentById(stored as `t1_${string}`).catch(() => null);
    if (existing) {
      await existing.edit({ text, runAs: 'APP' });
      return;
    }
  }
  const comment = await reddit.submitComment({
    id: postId as `t3_${string}`,
    text,
    runAs: 'APP',
  });
  await redis.set(key, comment.id);
  await comment.distinguish(true).catch(() => {}); // sticky to the top (best-effort)
}

// --------------------------------------------------- Player-created Challenges (UGC)
async function challengeFor(postId: string | null): Promise<ChallengeInfo | null> {
  if (!postId) return null;
  const raw = await redis.get(`challenge:${postId}`);
  if (!raw) return null;
  try {
    const ch = JSON.parse(raw) as ChallengeInfo;
    return ch && typeof ch.seed === 'number' ? ch : null;
  } catch {
    return null;
  }
}

// Turn a run into a new Challenge POST others can play + beat (drives the feed).
api.post('/create-challenge', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) {
    return c.json<CreateChallengeResponse>({ ok: false, reason: 'Log in to post a challenge' }, 400);
  }
  const body = await c.req.json<{ score?: number; seed?: number; word?: string }>();
  const target = Math.max(0, Math.round(body.score ?? 0));
  const seed = Math.floor(body.seed ?? 0) >>> 0;
  if (target <= 0 || !seed) {
    return c.json<CreateChallengeResponse>({ ok: false, reason: 'Play a run first' }, 400);
  }

  const cooldown = `challenge:cooldown:${username}`;
  if (await redis.get(cooldown)) {
    return c.json<CreateChallengeResponse>({ ok: false, reason: 'One challenge every few minutes' }, 429);
  }

  const word = typeof body.word === 'string' && body.word ? body.word : null;
  let url: string;
  try {
    const post = await reddit.submitCustomPost({
      title: `Void Scroll Challenge · beat ${target.toLocaleString()} — by u/${username}`,
    });
    const info: ChallengeInfo = { creator: username, seed, target, word };
    await redis.set(`challenge:${post.id}`, JSON.stringify(info));
    url = post.url;
  } catch (error) {
    console.error(`create-challenge failed: ${error}`);
    return c.json<CreateChallengeResponse>({ ok: false, reason: 'Could not create the post' }, 500);
  }

  await redis.set(cooldown, '1');
  await redis.expire(cooldown, 5 * 60);
  return c.json<CreateChallengeResponse>({ ok: true, url });
});

// Submit a run against the challenge this post hosts.
api.post('/challenge-score', async (c) => {
  const username = await reddit.getCurrentUsername();
  const postId = context.postId ?? null;
  const ch = await challengeFor(postId);
  if (!ch || !postId) return c.json({ status: 'error', message: 'not a challenge' }, 400);
  if (!username) return c.json({ status: 'error', message: 'must be logged in' }, 400);

  const body = await c.req.json<{ score?: number }>();
  const score = Math.max(0, Math.round(body.score ?? 0));
  const board = `challenge-board:${postId}`;
  const prev = (await redis.zScore(board, username)) ?? 0;
  if (score > prev) await redis.zAdd(board, { member: username, score });
  const best = Math.round(Math.max(prev, score));
  const rank = await rankIn(board, username);
  const rows = await redis.zRange(board, 0, 9, { reverse: true, by: 'rank' });

  // A challenge run still counts toward your global best + lifetime + badges.
  const { best: globalBest, lifetime } = await recordRun(username, score);
  await syncAchievements(username, { best: globalBest, lifetime, streak: await getStreak(username) });

  return c.json<ChallengeScoreResponse>({
    rank,
    target: ch.target,
    beat: best >= ch.target,
    entries: rows.map((r) => ({ username: r.member, score: Math.round(r.score) })),
  });
});

// Submit a word for a future Daily Descent (one per user per day).
api.post('/submit-word', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) return c.json<SubmitWordResponse>({ ok: false, reason: 'Log in to submit' }, 400);

  const body = await c.req.json<{ word?: string }>();
  const check = validateWord(body.word ?? '');
  if (!check.ok) return c.json<SubmitWordResponse>({ ok: false, reason: check.reason }, 400);

  const dayGate = `word:sent:${username}:${dayKey(0)}`;
  if (await redis.get(dayGate)) {
    return c.json<SubmitWordResponse>({ ok: false, reason: 'One word per day — back tomorrow' }, 429);
  }
  await redis.set(dayGate, '1');
  await redis.expire(dayGate, 60 * 60 * 36);

  const entry = JSON.stringify({ word: check.word, author: username });
  await redis.zAdd(WORD_QUEUE, { score: Date.now(), member: entry });

  // Claim today's word if the slot is still open (first submitter of the day wins it),
  // otherwise it's queued for an upcoming descent.
  const cacheKey = `daily-word:${dayKey(0)}`;
  let today = false;
  if (!(await redis.get(cacheKey))) {
    await redis.set(cacheKey, entry);
    await redis.expire(cacheKey, 60 * 60 * 24 * 2);
    today = true;
  }

  const queued = await redis.zCard(WORD_QUEUE);
  return c.json<SubmitWordResponse>({ ok: true, word: check.word, queued, today });
});

// Today's shared run: seed (feed order), daily board, your best/rank, your streak.
api.get('/daily', async (c) => {
  const date = dayKey(0);
  const board = `daily:${date}`;
  const username = (await reddit.getCurrentUsername()) ?? null;
  const rows = await redis.zRange(board, 0, 9, { reverse: true, by: 'rank' });
  const best = username ? Math.round((await redis.zScore(board, username)) ?? 0) : 0;
  const rank = username ? await rankIn(board, username) : null;
  const streak = username ? await getStreak(username) : 0;
  const w = await dailyWord(date);
  return c.json<DailyResponse>({
    date,
    seed: seedFromDate(date),
    entries: rows.map((r) => ({ username: r.member, score: Math.round(r.score) })),
    best,
    rank,
    streak,
    word: w?.word ?? null,
    wordAuthor: w?.author ?? null,
  });
});

// Submit a daily run: raises today's best, bumps the streak.
api.post('/daily-score', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) {
    return c.json({ status: 'error', message: 'must be logged in to score' }, 400);
  }
  const date = dayKey(0);
  const board = `daily:${date}`;
  const body = await c.req.json<{ score?: number }>();
  const score = Math.max(0, Math.round(body.score ?? 0));

  const prev = (await redis.zScore(board, username)) ?? 0;
  if (score > prev) {
    await redis.zAdd(board, { member: username, score });
    await redis.expire(board, 60 * 60 * 24 * 4); // keep daily boards ~4 days
  }
  const best = Math.round(Math.max(prev, score));
  const rank = await rankIn(board, username);
  const streak = await bumpStreak(username);

  // A daily run also counts toward your global best + lifetime total.
  const { best: globalBest, lifetime } = await recordRun(username, score);
  const { newly } = await syncAchievements(username, { best: globalBest, lifetime, streak });
  const chase = await chaseAbove(board, rank);

  // Refresh the post's live leaderboard comment — immediately if this run cracked the
  // top 5, otherwise at most every ~3 min. Best-effort: never fail the score on it.
  const postId = context.postId;
  if (postId) {
    const inTop = rank != null && rank <= 5;
    const atKey = `lb-comment-at:${postId}`;
    const last = await redis.get(atKey);
    const now = Date.now();
    if (inTop || !last || now - (parseInt(last, 10) || 0) > 3 * 60 * 1000) {
      await redis.set(atKey, String(now));
      try {
        await updateDailyComment(postId);
      } catch (error) {
        console.error(`Leaderboard comment update failed: ${error}`);
      }
    }
  }

  return c.json<DailyScoreResponse>({ best, rank, streak, lifetime, newAchievements: newly, chase });
});
