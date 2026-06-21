# Void Scroll — Hackathon Readiness Review

> Honest gap analysis against [HACKATHON.md](./HACKATHON.md). Date: 2026-06-20
> (~25 days to deadline).

## TL;DR

We have a **strong, novel core mechanic** and good feel. But we are **not yet
meeting the contest requirements**, and the gaps are the ones that decide the
contest, not cosmetic:

1. **It does not run on Devvit.** It's a standalone Vite app. Devvit Web is a hard
   requirement and the submission *is* a Reddit interactive post. **#1 priority.**
2. **No retention hook.** The award is literally "keep people coming back day after
   day." We have levels + endless, but **no daily content, no live leaderboard, no
   streaks** — nothing that makes you return tomorrow. This is the headline prize.
3. **No real backend.** The leaderboard is an in-memory mock that resets on reload.

Estimate: ~**35%** of the way to a competitive submission. The mechanic is the
strong 35%; the platform + hook are the missing 65%.

## Submission checklist

| Requirement | Status |
|---|---|
| Built on **Devvit Web** | ❌ Standalone Vite app |
| Runs as an **Interactive Post** | ❌ |
| **App listing** on developer.reddit.com | ❌ |
| **Demo post** in a subreddit | ❌ |
| **Redis-backed** persistence | ❌ Mock in-memory |
| Web tech (React/TS) | ✅ Devvit-compatible |
| Mobile-first / fits viewport | 🟡 390px frame; untested on real devices |
| Self-explanatory (no tutorial needed) | 🟡 Idle hints; needs a clearer first-run |

## Scorecard vs. judging criteria

| Criterion | Now | Why |
|---|---|---|
| **Delightful UX** | 6/10 | Core feel is good; lacks sound, haptics, juice, polish pass |
| **Polish** | 5/10 | Clean prototype, but no backend, no live leaderboard, untested on device — not launch-ready |
| **Reddit-y** | 3/10 | **Risk:** the `r/void` + upvote chrome is borderline "on-the-nose" Reddit theming; no community/UGC angle yet |
| **Hook-y** (the $15k criterion) | 3/10 | **Weakest + most important.** No daily content, no live leaderboard, no streaks/return reason |
| Phaser | N/A | Not using Phaser (optional; only for the $5k Phaser award) |

### Sub-awards
- **Retention mechanisms** ($3k): not built — no daily/recurring content.
- **User contributions** ($3k): not built — no UGC.
- **Phaser** ($5k): not applicable (deliberately not using Phaser).

## Two strategic risks to fix early

1. **On-the-nose Reddit theming.** Cards literally show `r/void`, upvotes, and
   comments. The brief explicitly warns against making the game *about* Reddit
   chrome. **Recommendation:** keep the social-**feed** concept (it's the hook —
   "the doomscroll you can finally beat / send the feed to the void") but make the
   card content **generic & relatable** (thoughts, one-liners, community
   submissions) and drop the literal subreddit/karma UI. That's Reddit-y *in
   spirit* (the universal scrolling experience) without being about Reddit.
2. **The mechanic ≠ the hook.** A score-chase alone won't bring people back. The
   retention has to come from the **meta loop** (daily + leaderboard + UGC), which
   is exactly what the top prize rewards.

## Roadmap to primetime (prioritized)

### P0 — Get it on the platform (gating; nothing else counts without this)
- Scaffold a Devvit Web project (`npm create devvit@latest`, Node 22). Interactive
  — needs a Reddit dev account + a test subreddit you moderate.
- Restructure into `src/client/` (our current app drops in) + `src/server/`.
- `src/server/index.ts`: `POST /api/score`, `GET /api/leaderboard`,
  `GET /api/user-best`, `GET /api/daily` backed by Redis sorted sets.
- Swap `lib/api.ts` mock bodies for `fetch('/api/...')` (signatures already match).
- Deploy, create the experience post, verify it runs in the iframe on mobile.

### P1 — Build the hook (the actual top prize)
- **Live global leaderboard** + personal best + your rank (Redis `zAdd`/`zRange`).
- **Daily Descent** — one seeded daily run everyone shares, with its own daily
  leaderboard and a "come back tomorrow for a new descent" beat. This is the single
  most important feature for the contest.
- **Streaks** — consecutive days played; small reward/flair for keeping it alive.

### P2 — Identity + Reddit-y (de-AI-slop, de-on-the-nose)
- Name, logo, color/voice; make the first 3 seconds self-explanatory.
- Reframe card content to generic/relatable; drop literal subreddit chrome.
- **UGC angle** ($3k sub-award + community): let users **submit the cards** that
  others scroll (e.g. "the post you can't stop scrolling past"), or post their
  score to a comment thread. Fresh daily community content = retention + UGC + R-y
  in one stroke.

### P3 — Polish to launch quality
- Sound + haptics + juice (milestones, near-misses, leaderboard rank-ups).
- Real mobile-device testing; guaranteed viewport fit; reduced-motion option.
- Settle the "can't bank progress across falls" harshness (`RETURN_MS`).

### P4 — Submit
- App listing on developer.reddit.com + public demo post in the subreddit.
- (Optional) developer feedback survey for the Best Feedback prize.

## What we should NOT do
- Don't chase the Phaser award — it would mean a rewrite for a smaller prize.
- Don't keep polishing feel before the Devvit port + daily loop exist; those are
  what the contest scores.
