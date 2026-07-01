# Void Scroll — Plan to Win

A prize-focused plan built from `HACKATHON.md`, game-retention psychology, and where the
game stands today. Goal: win the prizes we can realistically win and avoid the traps the
brief calls out.

## Prizes we're targeting
1. **Best App with a Hook — $15,000** (primary). Judged on Delightful UX, Polish,
   Reddit-y, Hook-y.
2. **Best Use of Retention Mechanisms — $3,000** ("daily/recurring content that drives
   growth via the feed"). We're a natural contender.
3. **Best Use of User Contributions — $3,000** ("UGC — comments, posts, drawings,
   puzzles, levels — that drives engagement"). Currently our biggest GAP and biggest
   opportunity.

**Not pursuing:** Best Use of Phaser ($5k) — we don't use Phaser; rebuilding now is high
risk and the $15k prize does not require it. Spend that energy on the three above.

## The one fact that should drive every decision
Judging is **primarily the public demo post** — "community play via the demo link,"
"understandable purely by interacting." So **the POST itself must be instantly
compelling, teach the mechanic in ~10 seconds with no reading, and show live community
activity in-feed.** A great game behind a confusing/static post loses. This reframes our
priorities: it's not just "more features," it's "make the post a living, social object."

## Honest standing vs. the judging criteria
| Criterion | Status | Note |
|---|---|---|
| Hook-y | **Strong** | Daily+streaks, 3 leaderboards, badges+nudges, rival chase, PB. Our moat. |
| Polish | Good | Juice/audio/mobile in. Risk = first-run clarity inside the iframe. |
| Reddit-y | **Medium** | We use comments (share) but are light on community/UGC. |
| Delightful UX | Good (validate) | The mechanic must *feel* great and be self-evident on a phone. |
| UGC | **Weak** | A whole $3k award unaddressed. |

## Strategy in one line
Convert our **retention strength into community/UGC strength**. The same moves that add
UGC also raise *Reddit-y*, drive *feed growth* (retention award), and make the *post feel
alive* (main prize). UGC is the single highest-leverage area.

## Game psychology → our coverage → what to add
- **Variable-ratio reward** (orbs/gate/random words): have — keep.
- **Goal-gradient** (next-badge nudge): have.
- **Loss aversion / streaks**: have a streak; ADD *stakes* — a "your N-day streak resets
  in Xh" warning + an earnable **streak-freeze** token. Loss aversion is one of the
  strongest return drivers and is low effort.
- **Social comparison** (leaderboards, rival chase): have — but **surface it ON the
  post**, not just in-game.
- **Status / identity**: badges — ADD **authorship status** ("your word is today's
  descent, played by 312 people").
- **FOMO / scarcity** (daily): have — ADD **anticipation** ("next descent in Xh" + a
  teaser) and **rotating daily modifiers** so each day is visibly fresh.
- **Completionism (Zeigarnik)**: badges — make the collection feel finishable.
- **Mastery / flow**: mechanic + mini-game — keep tuning the difficulty curve.

## Roadmap (priority order)

### P0 — Make the POST a living, social object (table stakes for judging)
- **Self-explanatory first 10s.** First interaction must teach "swipe up against
  resistance, it falls back" without reading. Validate on a real phone.
- **Live leaderboard on the post.** App maintains an auto-updated pinned comment (or post
  preview) showing today's top descents + play count, so the post shows community
  activity *in the feed* before anyone opens it. Social proof + feed engagement.
- **Splash that sells the hook** ("How deep can you send the feed?").

### P1 — UGC layer (opens the $3k award; our biggest differentiator)
- **1a. Community-authored Daily word** *(small, high ROI).* Players submit a 4–8 letter
  word; each day's Daily Descent secret phrase is a community submission, attributed
  ("Today's word: DRIFT — sent by u/alice"). The author returns to see their word
  featured + how the community did → status + a strong re-visit cue. Profanity filter +
  a small moderation/auto-pick queue.
- **1b. Player-created Challenge descents** *(larger, the heart of the award).* A player
  sets a custom seed / target ("beat my 8,432") and spins up a **Challenge post** in the
  sub; others play it; a per-post leaderboard; the creator sees attempts. This is
  user-generated *levels/posts* that **drive feed growth** — hits the UGC AND retention
  awards at once. Devvit `submitPost` + per-`postId` Redis keys (the menu already creates
  posts, so this is feasible).
- **1c. Comments as content.** Score share exists; add "upvote the best runs" so the
  comment thread becomes a curated highlight reel.

### P2 — Retention deepening (Retention award + Hook-y)
- **Streak stakes + freeze token** (loss aversion).
- **Anticipation**: post-run "next descent in Xh" + tomorrow's modifier teaser.
- **Rotating daily modifiers** (e.g., Low-Gravity, Surge Day, Mirror) — fresh content
  each day, named so it's shareable.
- **Weekly community goal**: a collective depth target the whole sub pushes toward →
  community dynamic + recurring feed reason.

### P3 — Polish & identity
- Mobile feel pass; keep reduced-motion respect.
- Reinforce the unique identity: the resistance scroll = "fight the doomscroll / send the
  feed to the void." Lean into that framing in splash + share text — it's a genuinely
  novel mechanic and a built-in anti-"common idea" story.
- Devvit Rules compliance + submission checklist (app listing + demo post).

## Recommended first move
Build **P0 live-leaderboard-on-the-post** together with **P1a community Daily word**.
Together they make the post feel alive and community-authored — hitting Reddit-y + UGC +
retention in one modest push — and they're the highest leverage per unit of effort. Then
tackle **P1b Challenge posts** as the marquee UGC feature for the $3k award.

## What I need from you
- Green-light the UGC direction (1a now, 1b as the big bet?).
- A test subreddit where we can validate the demo-post experience end-to-end.
