# Devvit Web Port — Playbook

Grounded in the **current** official template (`reddit/devvit-template-react`,
`@devvit/web` **0.12.24**, React 19, Node ≥22.2) as of 2026-06. Verify versions
when you scaffold — the template moves.

## How the template is shaped (what we're porting into)

```
devvit.json            # config (schema v1): post entrypoints + server entry + menu/triggers
vite.config.ts         # plugins: react(), tailwind(), devvit()  — devvit() builds client+server
package.json           # @devvit/web, @devvit/start, hono, @hono/node-server, devvit, react 19
src/
  client/   game.html + game.tsx (the game), splash.html + splash.tsx (feed preview), global.ts, index.css
  server/   index.ts (Hono app), routes/api.ts, routes/menu.ts, core/post.ts
  shared/   api.ts (types shared by client + server)
tools/      tsconfig.{base,client,server,shared,vite}.json
```

- The client calls the server with **relative `fetch('/api/...')`** paths.
- The server gets `context` (postId), `redis`, and `reddit` from `@devvit/web/server`.
- Two post entrypoints: **splash** (the inline card shown in the feed) and **game**.

## Step 0 — Decide the repo strategy

**Recommended:** scaffold a fresh Devvit app (guarantees correct config/versions),
then copy our `src/components`, `src/hooks`, `src/lib`, `src/styles.css` into its
`src/client/`. Keep *this* repo as the standalone playable demo (GitHub Pages) for
quick feedback; the Devvit project becomes the submission. (One-codebase-in-place
conversion is possible but the version-specific tsconfig refs + devvit() plugin
make a clean scaffold lower-risk.)

## Step 1 — Scaffold (INTERACTIVE — you must run these)

Needs a Reddit account enabled for the Developer Platform, and Node 22.

```
node -v                       # must be >= 22.2
npm create devvit@latest      # pick the React (Devvit Web) template; name <=16 chars, lowercase e.g. voidscroll
cd voidscroll
npm run login                 # opens browser → authorize
```

Create a **test subreddit** you moderate (e.g. r/voidscroll_dev), then:

```
npm run dev                   # devvit playtest — point it at your test subreddit
```

In the subreddit: ••• menu → "Create a new post" (the template's menu action) to
get a live experience post. Confirm it renders in the post iframe on mobile.

> If you'd rather, run these with `! <command>` in this chat so the output lands
> here and I can react to anything that differs from this playbook.

## Step 2 — Move the game in

Copy from this repo into the scaffold's `src/client/`:

- `src/components/*` → `src/client/components/`
- `src/hooks/useSwipePhysics.ts`, `useVoidEvents.ts` → `src/client/hooks/`
- `src/lib/physics.ts`, `levels.ts`, `feed.ts` → `src/client/lib/`
- `src/styles.css` → import it from `game.tsx` (or merge into `index.css`)

Make `src/client/game.tsx` mount our `App`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';      // move our App.tsx here too
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
```

Keep `App.tsx` as-is **except** `lib/api.ts` (replaced below). Our 390px `.phone`
frame can relax to fill the iframe — the post viewport is already mobile-sized.

## Step 3 — Server routes (`src/server/routes/api.ts`)

Redis sorted set for the global leaderboard; per-user best is that member's score.

```ts
import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';

export const api = new Hono();

const LB = 'leaderboard:global';

// who am I + my best (called on load)
api.get('/init', async (c) => {
  const username = (await reddit.getCurrentUsername()) ?? null;
  const best = username ? ((await redis.zScore(LB, username)) ?? 0) : 0;
  return c.json({ username, best, postId: context.postId ?? null });
});

// top N, highest first
api.get('/leaderboard', async (c) => {
  const rows = await redis.zRange(LB, 0, 9, { rev: true }); // -> [{ member, score }]
  return c.json({ entries: rows.map((r) => ({ username: r.member, score: r.score })) });
});

// submit a run; only raises your best
api.post('/score', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) return c.json({ error: 'must be logged in' }, 400);
  const { score } = await c.req.json<{ score: number; level?: number }>();
  const prev = (await redis.zScore(LB, username)) ?? 0;
  if (score > prev) await redis.zAdd(LB, { member: username, score });
  const best = Math.max(prev, score);
  const rank = await redis.zRevRank(LB, username); // 0-based, may be null
  return c.json({ best, rank: rank == null ? null : rank + 1 });
});

api.get('/user-best', async (c) => {
  const username = (await reddit.getCurrentUsername()) ?? null;
  const best = username ? ((await redis.zScore(LB, username)) ?? 0) : 0;
  return c.json({ best });
});
```

Mount it (the template's `src/server/index.ts` already does `app.route('/api', api)`).

> ⚠️ Verify the exact `@devvit/redis` method names/return shapes against the
> installed types — `zAdd({score, member})` and `zRange(key, 0, 9, {rev:true})`
> are from our CLAUDE.md reference; `zScore`/`zRevRank` are standard but confirm
> they exist in 0.12.x (if `zRevRank` is missing, derive rank from a `zRange`).

## Step 4 — Client API (`src/client/lib/api.ts`, replaces the mock)

Signatures already match what `App.tsx` calls, so no component changes.

```ts
export interface ScoreEntry { username: string; score: number; }

let currentUser: string | null = null;

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

export async function init(): Promise<{ username: string | null; best: number }> {
  const data = await jget<{ username: string | null; best: number }>('/api/init');
  currentUser = data.username;
  return data;
}

export async function getLeaderboard(limit = 10): Promise<ScoreEntry[]> {
  const { entries } = await jget<{ entries: ScoreEntry[] }>('/api/leaderboard');
  return entries.slice(0, limit);
}

export async function getUserBest(): Promise<number> {
  return (await jget<{ best: number }>('/api/user-best')).best;
}

export async function submitScore(score: number, level: number): Promise<{ best: number; rank: number | null }> {
  const r = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, level }),
  });
  if (!r.ok) throw new Error('score failed');
  return r.json();
}

export function isCurrentUser(entry: ScoreEntry): boolean {
  return currentUser != null && entry.username === currentUser;
}
```

Call `init()` once on load (e.g. in `IdleScreen`) so `isCurrentUser` can highlight
your row. (Optionally add a `shared/api.ts` with these types shared server↔client.)

## Step 5 — Splash (feed preview)

`src/client/splash.tsx` is the inline card shown in the feed before tapping in.
Make it a one-screen "VOID SCROLL — tap to descend" with the current top score —
this is the first thing redditors see, so it matters for the hook.

## Step 6 — Ship

```
npm run dev        # playtest in your test sub
npm run deploy     # type-check + lint + devvit upload
```

Create the experience post, verify on mobile, then for submission: the app listing
on developer.reddit.com + the public demo post link.

## Risks / watch-list
- **React 18 → 19**: our code is plain hooks; should run on 19, but build on the
  scaffold's version rather than pinning ours.
- **No `localStorage`** anywhere (already true in our code) — all state via Redis.
- **Logged-out users**: `getCurrentUsername()` can be null — don't write them to
  the board; still let them play + see scores.
- **Redis API drift**: confirm sorted-set method signatures (see Step 3 note).
- **Daily Descent / streaks / UGC** (the actual hook, P1) come *after* this port —
  they need these same server routes + a `daily:{date}` sorted set and a seed.
