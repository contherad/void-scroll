# Void Scroll — Prototype

A mobile-first card-swipe game. A feed of Reddit-style posts sits on screen and
you scroll it up into the void. The score *is* how far you've pushed the feed, so
it rises as you swipe and falls as you ease off. The moment you let go it eases
back to the middle and the score rides down to zero — so you have to keep pressing
up with your thumbs to hold your distance. **Use two thumbs and hand off** (press
the next before lifting the last) to ratchet up without it ever falling, like
native scrolling. Resistance rises the further out you are, so the higher you
climb the harder it pushes back. Your run's best clears levels and feeds a global
leaderboard.

This is a **standalone, playable prototype** of the core mechanic, built with
Vite + React + TypeScript. It is structured to drop straight into a Devvit Web
project (see [Porting to Devvit](#porting-to-devvit)).

## Run it

```bash
npm install
npm run dev      # open http://localhost:5173
```

Best experienced in a mobile viewport — open dev tools, toggle device toolbar,
pick any phone (the app renders in a fixed 390px frame to mimic Reddit's
experience-post iframe). Swipe up anywhere on the screen; the feed scrolls and
new posts rise from the bottom so you can feel how far you're pushing. **It falls
back to the middle when you let go (score with it) — ratchet with two thumbs to
hold it up and keep climbing.** On desktop, the mouse is a single "thumb."

```bash
npm run build    # typecheck + production bundle (dist/)
```

## How it plays

- **Goal:** scroll the feed as deep into the void as you can. Score = how far
  you've pushed it (linear, so it reads steadily): up when you swipe, down when
  you ease off, back to 0 once it settles in the middle. Keep swiping to stay aloft.
- **Two-thumb ratchet:** while any finger is down the feed never falls, so press
  the next thumb before lifting the last to climb continuously with no jump.
- **Levels 1–5** targets **1,000 → 1,500 → 2,000 → 2,700 → 3,500** (= distance in
  px). The progress bar tracks your **live** score, so it drops back when you let
  the feed fall — you clear only by reaching the target *while aloft*. ~6 → 11 →
  17 → 28 → 43 thumb-strokes.
- **Level 6 = Endless** — no target; **milestone cheers** pop as your best crosses
  1k, 2.5k, 5k, … and **void events** fire: ⚡Surge (free-scroll), 🌑Drag (push
  hard), 🔥Frenzy (double gains). The leaderboard run; hit **End run** to submit.

## Architecture (matches CLAUDE.md spec)

```
src/
├── main.tsx                  React entry
├── App.tsx                   Game state machine (useReducer): idle→playing→transition→leaderboard
├── styles.css                Dark, mobile-first
├── components/
│   ├── SwipeCard.tsx         Full-area swipe surface + the scrolling, windowed card feed
│   ├── HUD.tsx               Live score, best, level, target progress
│   ├── LevelTransition.tsx   Between-level overlay
│   ├── MilestoneToast.tsx    Endless milestone pop
│   ├── EventBanner.tsx       Active void-event banner (endless)
│   └── Leaderboard.tsx       Top-10 board with your rank
├── hooks/
│   ├── useSwipePhysics.ts    Physics: multi-pointer handoff, fall-back, events gain hook
│   └── useVoidEvents.ts      Timed endless events → k / gain multipliers
└── lib/
    ├── physics.ts            Pure: resistance curve, swipe gain (unit-tested)
    ├── levels.ts             k, targets, hero cards, feed pool, milestones
    ├── feed.ts               Feed geometry (SLOT)
    └── api.ts                Leaderboard data access (mock; see below)
```

### The mechanic (`lib/physics.ts`, `hooks/useSwipePhysics.ts`)

```
score             = distance the feed is pushed from the middle (px) — LINEAR, reads steadily
resistance(dist)  = 1 / (1 + k * dist)            // ~1 at the middle, →0 the higher you go
swipeGain         = rawDelta * resistance         // rawDelta signed: up adds, down subtracts
multi-touch       = every active pointer moves the feed by its OWN delta (no jump on handoff)
release (last up) = feed eases back to the middle (~450ms); score rides down to 0
progress bar      = live score / target (drops when you fall) — clear by reaching target while aloft
best              = high-water mark for the run (survives the fall) → endless leaderboard
```

The feed (`SwipeCard.tsx`) is windowed: it renders only the ~9 cards near the
viewport, positioned by the live distance, recycling a shared post pool — so it
stays cheap no matter how deep you scroll.

## Porting to Devvit

This prototype is intentionally Devvit-shaped. To move it into a Devvit Web app
(`npm create devvit@latest --template=react`, Node 22):

1. Move `src/` under `src/client/` (it already matches the template's client
   layout: `App.tsx`, `components/`, `hooks/`, `lib/`).
2. Add `src/server/index.ts` with the four routes and a Redis sorted set:
   ```ts
   await redis.zAdd('leaderboard:global', { score, member: username });
   const top10 = await redis.zRange('leaderboard:global', 0, 9, { rev: true });
   ```
   Routes: `POST /api/score`, `GET /api/leaderboard`, `GET /api/user-best`,
   `GET /api/daily`.
3. Replace the **bodies** of the functions in `lib/api.ts` with `fetch('/api/...')`
   calls — the function signatures already match the server contract, so no
   component changes are needed. (The prototype uses an in-memory mock and,
   per Devvit constraints, **no `localStorage`**, so the board resets on reload.)
4. `devvit.yaml`: app name ≤ 16 chars, lowercase (e.g. `voidscroll`).

## Notes / next steps

- Difficulty = strokes to reach the target. While a finger is down the feed never
  falls, so you ratchet up against rising resistance; higher `k` means each stroke
  buys less. Levels are tuned to ≈ 6 / 11 / 17 / 28 / 43 strokes (L1–L5). The dials
  — targets & `k` (`lib/levels.ts`), the ~450ms fall `RETURN_MS`
  (`hooks/useSwipePhysics.ts`), feed `SLOT` height (`lib/feed.ts`) — are tunable.
  Worth playtesting the fall speed: it sets how forgiving the two-thumb handoff
  window is, and since you can't bank progress across falls it also sets how harsh
  the later levels feel.
- Stretch goal from the spec — **Daily challenge** card pulled from the live
  subreddit via `@devvit/reddit` — is not in the prototype (`GET /api/daily` is
  stubbed in the porting plan).
