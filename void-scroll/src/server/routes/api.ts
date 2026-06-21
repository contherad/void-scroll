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
} from '../../shared/api';

export const api = new Hono();

// Global leaderboard sorted set (scoped per app installation / subreddit).
const LB = 'leaderboard:global';

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

// Who am I + my best + lifetime (called once on load).
api.get('/init', async (c) => {
  const username = (await reddit.getCurrentUsername()) ?? null;
  return c.json<InitResponse>({
    type: 'init',
    username,
    best: await bestFor(username),
    lifetime: await lifetimeFor(username),
    postId: context.postId ?? null,
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

  // zRank is 0-based ascending (lowest first); convert to 1-based highest-first.
  const card = await redis.zCard(LB);
  const rankAsc = await redis.zRank(LB, username);
  const rank = rankAsc == null ? null : card - rankAsc;

  return c.json<ScoreResponse>({ best, rank, lifetime });
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
  return count;
}

// Today's shared run: seed (feed order), daily board, your best/rank, your streak.
api.get('/daily', async (c) => {
  const date = dayKey(0);
  const board = `daily:${date}`;
  const username = (await reddit.getCurrentUsername()) ?? null;
  const rows = await redis.zRange(board, 0, 9, { reverse: true, by: 'rank' });
  const best = username ? Math.round((await redis.zScore(board, username)) ?? 0) : 0;
  const rank = username ? await rankIn(board, username) : null;
  const streak = username ? await getStreak(username) : 0;
  return c.json<DailyResponse>({
    date,
    seed: seedFromDate(date),
    entries: rows.map((r) => ({ username: r.member, score: Math.round(r.score) })),
    best,
    rank,
    streak,
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
  const { lifetime } = await recordRun(username, score);

  return c.json<DailyScoreResponse>({ best, rank, streak, lifetime });
});
