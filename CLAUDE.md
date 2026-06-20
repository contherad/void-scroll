# CLAUDE.md — Void Scroll (Reddit Hackathon Game)

## Project Overview

**Game name:** Void Scroll (working title)  
**Hackathon:** Reddit's Games with a Hook — Devpost  
**Deadline:** July 15, 2026 @ 6:00 PM PDT  
**Prize pool:** $40,000  

This is a mobile-first Reddit game built on the Devvit platform. The core mechanic: a card sits on screen and the player swipes it upward. Movement resistance increases logarithmically as the card travels further off-screen — like trying to scroll content that doesn't want to go. Levels increase resistance. Endless mode tracks a global high score leaderboard across all Reddit users.

---

## Core Mechanic

The player sees a card (think a Reddit post card). They swipe up on it. The card moves upward. The further off-screen it travels, the more resistance builds — each swipe moves it less and less. The goal is to get it as far as possible.

**Physics model:**
- Distance is tracked in pixels from initial card center
- Resistance multiplier = `1 / (1 + k * distance)` where `k` is a per-level constant
- Velocity carries over between swipes (momentum), decaying over ~300ms
- A "burst" mechanic: if swipe velocity exceeds a threshold, briefly reduce resistance (escape velocity feel)
- Score = total distance traveled (integer, displayed as a large number)

**Level progression:**
- Level 1–5: increasing `k` values (gentle to firm resistance)
- Level 6+: Endless mode — `k` maxes out, score just keeps climbing
- Between levels: brief animation, display score, show what's coming

---

## Tech Stack

- **Platform:** Devvit Web (Reddit's developer platform)
- **Frontend:** React + TypeScript, Vite
- **Backend:** `@devvit/web/server` (Node.js, hosted by Reddit)
- **Storage:** Redis via `@devvit/redis` (for leaderboard, user scores, daily card state)
- **Gestures:** Raw pointer events / touch events (no external gesture library needed)
- **Styling:** CSS modules or plain CSS — keep it minimal, mobile-first

Do NOT use Phaser. Do NOT add unnecessary dependencies. The mechanic is simple enough for plain React + pointer events.

---

## Project Structure

```
void-scroll/
├── devvit.yaml              # App name (max 16 chars), version, permissions
├── package.json
├── tsconfig.json
├── src/
│   ├── main.tsx             # Devvit entry point — registers the experience post
│   ├── server/
│   │   └── index.ts         # Server entry point — API routes for scores, leaderboard
│   └── client/
│       ├── index.html
│       ├── main.tsx         # React app entry
│       ├── App.tsx          # Root component, handles game state machine
│       ├── components/
│       │   ├── SwipeCard.tsx        # The draggable card + physics
│       │   ├── HUD.tsx              # Score display, level indicator
│       │   ├── LevelTransition.tsx  # Between-level animation
│       │   ├── Leaderboard.tsx      # Top scores pulled from Redis
│       │   └── DailyChallenge.tsx   # Daily card variant (stretch goal)
│       ├── hooks/
│       │   └── useSwipePhysics.ts   # All physics logic isolated here
│       └── lib/
│           ├── physics.ts           # Pure functions: resistance curve, velocity decay
│           ├── levels.ts            # Level config: k values, thresholds, card content
│           └── api.ts               # Client-side calls to /api/* server routes
```

---

## Devvit Setup Notes

**Node 22 is required.** Verify with `node -v` before starting. The templates will not work correctly on older versions.

1. Scaffold the project: `npm create devvit@latest --template=react`
   - This uses the official Reddit template at https://github.com/reddit/devvit-template-react
   - Go through the installation wizard — you will need a Reddit account connected to Reddit Developers
   - Copy the command from the success page into your terminal
2. Create a subreddit for testing (you must be moderator)
3. App name in `devvit.yaml` must be 0–16 characters, lowercase, no spaces
4. Dev server: `npm run dev` — then navigate to your subreddit
5. Create a test post: go to subreddit → three dots → "Make my experience post"
6. Build: `npm run build` — builds both client and server projects
7. The experience renders inside an interactive post iframe — treat the viewport as a fixed mobile screen (~390px wide, ~600px tall)

**Alternative: vibe-coding template**
Reddit also offers `npm create devvit@latest --template=vibe-coding`, which comes pre-configured for AI-assisted development with a Devvit MCP server (Cursor integration included). If Claude Code is being used as the primary dev agent, this template may be a better starting point. See https://github.com/reddit/devvit-template-vibe-coding.

**Important Devvit constraints:**
- No `localStorage` or `sessionStorage` — all persistence goes through Redis on the server
- No external fetch from the client — use server-side API routes for any data
- The app runs inside Reddit's iframe — assume mobile viewport always
- `context.postId` and `context.userId` are available server-side for per-user/per-post state

---

## Server API Routes

Define these in `src/server/index.ts`:

```
POST /api/score          — Submit a score { userId, score, level }
GET  /api/leaderboard    — Return top 10 scores [{ username, score }]
GET  /api/daily          — Return today's daily card config (seed, resistance preset)
GET  /api/user-best      — Return the current user's personal best
```

Use Redis sorted sets for the leaderboard:
```ts
await redis.zAdd('leaderboard:global', { score: numericScore, member: username });
const top10 = await redis.zRange('leaderboard:global', 0, 9, { rev: true });
```

---

## Physics Implementation

All physics lives in `src/client/hooks/useSwipePhysics.ts`. Keep it a single hook that returns `{ cardY, onPointerDown, onPointerMove, onPointerUp, score, velocity }`.

```ts
// Resistance curve — the core of the game
function getResistance(distancePx: number, k: number): number {
  return 1 / (1 + k * distancePx);
}

// Apply to a swipe delta
function applySwipe(currentY: number, rawDelta: number, k: number): number {
  const distance = Math.max(0, -currentY); // how far off-screen
  const resistance = getResistance(distance, k);
  return currentY - rawDelta * resistance;
}
```

Velocity carry-over: track pointer velocity on `pointerup`, apply a decaying animation (requestAnimationFrame loop) for ~300ms after release so the card coasts upward briefly.

Burst threshold: if pointer velocity > 800px/s, multiply next 150ms of movement by 1.5x (feels like a "flick").

---

## Level Config (`src/client/lib/levels.ts`)

```ts
export const LEVELS = [
  { level: 1, k: 0.001, targetDistance: 500,   label: "Easy" },
  { level: 2, k: 0.003, targetDistance: 800,   label: "Medium" },
  { level: 3, k: 0.006, targetDistance: 1200,  label: "Hard" },
  { level: 4, k: 0.010, targetDistance: 1800,  label: "Very Hard" },
  { level: 5, k: 0.015, targetDistance: 2500,  label: "Brutal" },
  { level: 6, k: 0.020, targetDistance: Infinity, label: "Endless" },
];
```

In Endless mode, score continues climbing. This is the leaderboard mode.

---

## Card Content

The "card" being scrolled should look like a Reddit post card — title text, upvote count, subreddit label. In early versions, use static placeholder content. Stretch goal: pull a real post from the current subreddit using `@devvit/reddit` server-side, inject it as the card content for the day.

Frame it as: "Send this post to the void." The card has a Reddit post aesthetic. This gives it Reddit identity without being meta about Reddit itself.

---

## Game State Machine

```
IDLE → PLAYING → LEVEL_COMPLETE → PLAYING (next level)
                               → ENDLESS (level 6+)
PLAYING → GAME_OVER (if player gives up / timer runs out — TBD)
ENDLESS → SUBMIT_SCORE → LEADERBOARD
```

Manage this in `App.tsx` with a `useReducer`.

---

## UI / Visual Direction

- Dark background — near black (`#0d0d0d`)
- Card: white/light gray, rounded corners, drop shadow
- Score: large monospace number, top center
- Leaderboard: minimal table, username + score
- No gradients, no heavy animation outside the card physics
- Must feel good at 390px wide — test on mobile viewport constantly
- Resistance should be *felt*, not just shown — do not add a visible "resistance meter" unless playtesting demands it

---

## Build Order

1. **Scaffold Devvit Web project** using official React template: `npm create devvit@latest --template=react` (requires Node 22)
2. **Get it deployed and running** on your test subreddit before writing any game logic
3. **Build `useSwipePhysics` hook** in isolation — test in a plain Vite app first if needed
4. **Wire physics into `SwipeCard` component** — get the card moving on screen
5. **Add score tracking and HUD**
6. **Add level progression and transitions**
7. **Add server-side leaderboard** (Redis sorted set)
8. **Add Endless mode + score submission**
9. **Polish: card content, visual design, mobile feel**
10. **Daily challenge card** (stretch — only if time allows)

Do not skip step 2. Devvit platform quirks will surface early and you want them out of the way before the game logic gets complex.

---

## Key References

- Devvit docs: https://developers.reddit.com/docs
- Devvit Web overview: https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview
- Game building guide: https://developers.reddit.com/docs/guides/best-practices/community_games
- Launch guide: https://developers.reddit.com/docs/guides/launch/launch-guide
- Devvit Discord (live support + office hours): https://discord.gg/ZJQ3fmQVrm
- Hackathon page: https://redditgameswithahook.devpost.com
- Submission requires: app listing on developer.reddit.com + demo post link in your subreddit

---

## What NOT to Do

- Do not use Phaser unless explicitly asked
- Do not add a tutorial — the mechanic must be self-evident
- Do not theme the game around Reddit karma, Snoo, or subreddits explicitly
- Do not make a leaderboard the first thing you build — physics feel comes first
- Do not use `localStorage` — it does not work in Devvit's iframe
- Do not fetch from external APIs client-side — route everything through the server
- Do not over-engineer the card content early — placeholder text is fine for v1
