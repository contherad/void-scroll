# Void Scroll

A mobile-first Reddit game built on **Devvit Web** for Reddit's *Games with a Hook*
hackathon. The feed pushes back: swipe a stream of drifting glyphs up into the void
against rising resistance, and **keep it aloft** — let go and it falls. How deep can
you go?

## The hook

- **Daily Descent** — one shared, seeded run per day with its own leaderboard. A
  fresh challenge every day + a **streak** you don't want to break = a reason to
  come back.
- **Global leaderboard** — your deepest run, ranked across the community (Redis).
- **Secret phrase** — tappable glowing letter-tiles are scattered down the feed;
  **tap them while you scroll** to spell the day's word. Each letter skips you
  forward; completing it triggers a big slingshot skip. Pure multitasking.

## How to play

- **Swipe up** anywhere to descend. The feed resists more the deeper you go, and
  **falls back to the middle the moment you let go** — so keep pressing up. Use
  **two thumbs**, alternating (lift one before the other drives), to ratchet
  continuously.
- **Tap the glowing letters** as they pass to build the secret phrase.
- **Levels 1–5** have depth targets; **Endless** + **Daily** feed the leaderboards.

## Tech

Devvit Web · React 19 · Hono (server) · Redis (leaderboards/streaks) · Vite ·
TypeScript. No external assets — sound is synthesized (Web Audio), visuals are CSS.

```
src/
  client/   App + components, hooks (physics, events), lib (levels, feed, phrase, sfx, api)
  server/   Hono API (init / leaderboard / score / user-best / daily / daily-score) + Redis
  shared/   API types shared client↔server
```

## Develop

> Node ≥ 22.2 required.

- `npm run login` — authenticate the Devvit CLI
- `npm run dev` — playtest live on your test subreddit (`devvit playtest`)
- `npm run type-check` / `npm run lint` / `npm run build`
- `npm run deploy` — type-check + lint + upload
- `npm run launch` — deploy + publish for review

Create a game post from the subreddit's **•••** menu → "Create a Void Scroll post"
(the app also auto-creates one on install).

## Hackathon submission checklist

- [ ] `npm run deploy` succeeds (type-check + lint + upload all green)
- [ ] App listing live on developer.reddit.com
- [ ] A public **demo post** running the game in your subreddit (judging plays this)
- [ ] Verified on **mobile** — fits the post iframe, swipe + tap both feel good
- [ ] First-run is self-explanatory (idle "how to play" + level-1 coachmark)
- [ ] (Optional) Developer Platform feedback survey for the Best Feedback prize
