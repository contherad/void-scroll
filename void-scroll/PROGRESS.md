# Void Scroll — Production Iteration Log

Autonomous `/loop`: iterate the game toward production-ready within the hackathon
rules. Work happens in this Devvit project (`void-scroll`). Each pass must keep
type-check + lint + build green (`npm run type-check && npm run lint && npm run build`).

## Direction (from the user)
- Drop the fake Reddit posts. "Reddit-y" = human-first/community/creativity, NOT
  about Reddit/karma/subreddits/Snoo. Use characters / icons / words instead.
- Add captivating *layers* on top of the scroll, keeping the core mechanic.
- Make it production-ready.

## Feedback to address
1. Add layers/multitasking (split-screen with asymmetric thumbs, tap-while-scroll).
2. Secret phrase: tap specially-styled words/glyphs while scrolling to build a phrase.
3. Slingshot tie-in: a built phrase references a tile farther down; completing it lets
   you slingshot/skip forward to it.
4. Touch bug: planting one finger and pumping the other must NOT work — you have to
   lift the first touch point before another can swipe. ✅ FIXED (active-pointer).
5. Scoring/status bar inconsistency (cleared at 1500 vs 1507). ✅ clear now reports
   the exact target; bar tracks live score with no CSS lag.

## Done
- ✅ Touch bug: only the first touch drives; a 2nd finger is held (keeps aloft) but
  can't climb until the 1st lifts, then must move to take over. (`useSwipePhysics`)
- ✅ Level clear reports the exact target (no overshoot). (`App` Game)
- ✅ De-Reddit-theme: feed is now drifting **glyph + word tiles** (no subreddit/
  karma/upvote chrome). (`levels.ts`, `SwipeCard.tsx`, `styles.css`)
- ✅ Earlier: Devvit port, Redis leaderboard, Daily Descent + streaks.

- ✅ **Secret phrase (#2)**: feed carries glowing LETTER tiles at deterministic
      indices (FIRST=8, STEP=5). Tap them while scrolling (hit-test on the surface;
      a quick no-move pointer = tap, so one thumb climbs while another taps) to
      spell the run's phrase, shown lighting up in the HUD. (`lib/phrase.ts`,
      `SwipeCard`, `HUD`, `App` Game)
- ✅ **Slingshot skip (#3, auto)**: completing the phrase fires `boost(560)` — a
      forward skip — plus a "✦ PHRASE — SKIP! ✦" cheer. (re-added `boost()` to hook)

- ✅ **Polish & first-run clarity**: frame fills the iframe (max 480px); endless
      headline is the monotonic `best` (steadier points); idle "how to play" block +
      level-1 coachmark; collected-letter pop; `prefers-reduced-motion` guard.
      (`styles.css`, `HUD`, `App`)

- ✅ **UX completeness**: ✕ quit button on levels → menu (no dead-end); post-run
      leaderboard empty-state; QUIT action wired; full flow verified end-to-end with
      exits on every screen; logged-out/empty-board degrade gracefully.

- ✅ **Audio + haptics juice**: `lib/sfx.ts` procedural Web Audio (tick/thunk/
      sting/swell, no assets) + best-effort `navigator.vibrate`; unlock on first
      pointer-down; mute toggle (🔊/🔇), default muted for reduced-motion.

- ✅ **Balance & feel QA**: phrases shortened to 4–5 letters (completable on deep
      runs); each collected letter now gives a +70px skip so tapping pays off in
      every mode; HUD phrase row only shows after the first collect. Verified:
      L1=0 letters, L2–L5=1–3, endless completes. (`phrase.ts`, `App`, `HUD`)

- ✅ **Hardening / QA read-through**: verified daily/streak UTC logic, rank math,
      active-pointer handoff, client↔server daily-seed match (same FNV-1a/UTC),
      graceful error/logged-out paths, no debug leftovers. Fixed: collect side-
      effects now dedupe via a ref (no double-fire on same-frame double tap).

- ✅ **Submission-readiness & docs**: removed example cruft (Example-form menu item
      → latent 404, `forms` config/route/file); kept onAppInstall auto-post + mod
      menu; wrote a real game README with a submission checklist. Gates green.

## Round 2 (user feedback — 4 asks)
- ✅ **#1 Finite-feed completion**: campaign levels are now a finite stack of
  `items` tiles; the level ends the instant the LAST tile leaves the top (SwipeCard
  measures that distance from live geometry → `onMeasure`). Pacing 7/12/18/27/42
  strokes. Transition reframed to "✦ feed cleared ✦". (`levels.ts`, `SwipeCard`,
  `App`, `LevelTransition`)
- ✅ **#2 Floating bonus orbs**: ⚡ rush (+340) / 💠 spark (+150) drift in and out;
  tap for a forward surge + sting. (`hooks/useBonusOrbs.ts`, `App`, `styles.css`)
- ✅ **#3 Meaningful words**: phrase pool is now evocative human words (BREATHE,
  RELEASE, UNWIND, WONDER, ESCAPE, …). (`phrase.ts`)
- ✅ **#4 Better home menu**: hero title, stat chips (best / 🔥streak), Play + Daily
  actions, how-to, "Deepest descents" board. (`App` IdleScreen, `styles.css`)

## Round 3 (user feedback)
- ✅ Launch button fires on **pointer-down** (no longer needs both fingers lifted).
- ✅ Tapping letters no longer **jolts the feed** (removed the per-letter boost).
- ✅ **Ambient particle** background (translucent surface so it shows through).
- ✅ **"LAUNCHED" always raises your score** — `slingshot()` jumps from your best.
- ✅ **Letters spread out + jittered** (6–11 tiles apart, seeded) — was every-5.
- ✅ Copy fixed: "swipe up, **alternating fingers**" (not "two thumbs").
- ✅ **Home-screen skeletons** + reserved space — no more layout jump on load.
- ✅ **Saved progression + level map**: server persists each user's unlocked level
  (`progress:{user}`); "Play" → a level-select map; quitting returns to the map.
  (`server/api.ts`, `lib/api.ts`, `App` LevelMap, `styles.css`)

## Round 4 (user feedback)
- ✅ **Orbs now tappable while scrolling**: switched `onClick` → `onPointerDown`
  (+stopPropagation) like the launch button; added a "⚡ RUSH +N" pickup toast so
  the effect is unmistakable. (`App` Game)
- ✅ **Depth zones** in endless/daily HUD (The Surface → Shallows → Drift → Deep →
  Abyss → Void) for a sense of place on long descents. (`levels.ts depthZone`, `HUD`)

## Round 5 (user feedback + share)
- ✅ **Share to comments**: post-run "📣 Brag in comments" posts your result as a
  comment on the post (community/virality). `POST /api/share` → `reddit.submitComment`,
  graceful on failure. (`server/api.ts`, `lib/api.ts`, `Leaderboard`)
- ✅ **Orb/launch jitter fixed**: `boost`/`slingshot` now **glide** smoothly
  (easeOut ~0.3s) instead of teleporting; glide owns the feed briefly, grabbing
  interrupts it, falls/resets cancel it. (`useSwipePhysics`)
- ✅ **Re-climb progression**: endless HUD now shows a "toward your best" bar —
  "now N · X to your best" while climbing back, "deepest yet" (green) at a record.
  (`HUD`, `styles.css`)

## Round 6 (user feedback)
- ✅ **Letters cycle back + much sparser**: reworked placement (`letterSlots`) —
  the word REPEATS down the feed (order = slot# mod len), so any uncollected letter
  reappears on a later pass (collected ones show dim). Gaps widened 13–20 tiles
  (~2,000–2,900px, was 6–11). (`phrase.ts`, `SwipeCard`, `App`)

## Round 7 (user feedback)
- ✅ **Multiple words in endless**: completing a word launches you and the NEXT word
  appears ahead (`wordAt` sequence; new `letterSlots` laid out past the slingshot
  landing). HUD shows the live word always + a ✦N completed-words count. (`phrase.ts`,
  `App` Game, `HUD`)
- ✅ **"Best isn't updating" fixed**: Daily runs only fed the daily board — now a
  daily run also raises your **global best** + leaderboard (server `recordRun`).
- ✅ **Lifetime total**: server `lifetime:{user}` adds every run's score (cumulative);
  `/init` returns it; shown as a 3rd idle stat chip. (`server/api.ts`, `lib/api.ts`, `App`)
- ✅ **Particle parallax**: ambient motes now actually move — rise + sway with
  per-mote speed/size (parallax) and fade in/out; no longer killed by reduced-motion
  (just gently slowed). (`App` Particles, `styles.css`)

## Round 8 (user feedback)
- ✅ **Checkpoint mini-game**: collect 4 orbs → a pulsing **◆ CHECKPOINT** gate
  appears; tap it to enter **"Stabilize the Core"** — an Among-Us-style task that
  reuses the resistance mechanic in **4 directions** (swipe the shown way to fill the
  core against rising resistance, 4 steps, beat the timer). Win → a big slingshot
  (+1800 from best). (`components/MiniGame.tsx`, `App` Game, `styles.css`)
- ✅ **Toast overlap fixed**: cheers/bonuses now live in a lower **toast stack**
  (column) so they never cover the status bar or collected-letter row, and multiple
  stack instead of piling on one spot. (`App`, `styles.css`)
- ✅ **Random word order**: a free endless run now uses a fresh random seed, so the
  word sequence differs every play; Daily stays date-seeded (shared). (`App` Game)

## Round 9 (user feedback)
- ✅ **Mini-game no longer resets you to 0**: new `physics.hold()` freezes the feed
  while the gate is open; a win slingshots and **parks** at the reward until you grab
  (glide skips auto-fall while held). (`useSwipePhysics`, `App`)
- ✅ **Gate is tappable mid-scroll** again (`onPointerDown` + stopPropagation).
- ✅ **Mini-game intro + entry animation**: first-time how-to card ("Begin →") + a
  scale/fade-in; countdown only runs once playing. (`MiniGame`)
- ✅ **Mini-game jumpiness fixed**: per-pointer active-touch model (alternating-thumb
  handoff, no leap) + per-move cap. (`MiniGame`)
- ✅ **Gate = orb PATTERN**: collect a random sequence (length 5–9, mixed ⚡/💠) IN
  ORDER; a wrong kind resets it (shake + ✗). Re-rolls each gate. Shown as a HUD pip
  strip. (`App`, `HUD`)
- ✅ **Vertical depth gauge**: progress moved off the top to a right-edge bar that
  fills top→down (endless = toward best, campaign = toward clear); the event banner
  moved into the bottom toast stack — fixes the "Surge…" / progress-bar overlap.
  (`HUD`, `App`, `EventBanner`, `styles.css`)

## Round 10 (user feedback)
- ✅ **Mini-game redesigned** from a 4-direction fill to a **2D steering task**
  ("Steady the Core"): drag a core orb (momentum) into each of 5 waypoint rings and
  hold it steady to charge it, while a **current** (constant force) drifts it off
  course and **changes direction every waypoint**. Charge only builds when the core
  is inside AND slow (must counter the force, not blow through). Continuous physics
  sim (spring-to-finger + wind + damping), per-pointer steering. (`MiniGame`, `styles.css`)

## Round 11 (user feedback)
- ✅ **Mini-game now uses the REAL mechanic**: rebuilt "Push the Core" so it's the
  scroll's own feel — **repeated swipes against rising resistance, alternating thumbs**
  (active-pointer: only the first touch drives, lift before the next), and a constant
  **force pulls the core back to centre**. Tapping/holding does nothing now; you must
  keep swiping TOWARD each ring to push the core out (harder the further it goes) and
  hold it inside until it locks. 4 rings, fresh direction each. (`MiniGame`, `styles.css`)

## Round 12 (autonomous /loop — retention research → improvement)
Research: the biggest retention gap was **persistent cross-session goals**. Added an
**Achievements / Badges system** (9 badges: depth tiers mirroring the zones, lifetime,
streak). Shared rule defs (`shared/achievements.ts`) so client + server agree; server
persists the unlocked set (`ach:{user}`) and detects newly-unlocked on every submit;
menu shows a badge grid (X/9, locked = dim + ???); run-end shows a "Badge unlocked"
banner. Gives non-leaders their own ladder + completionist pull + a "next badge" chase.
Verified: gates green + unlock-logic smoke test (thresholds, cumulative tiers, newly =
now−prev). (`shared/achievements.ts`, `server/api.ts`, `lib/api.ts`, `App`, `Leaderboard`)

## Post-loop tweak (user feedback)
- ✅ Phrase-complete is now a **deliberate launch**, not an auto-skip: completing
  the word arms a pulsing **"TAP TO LAUNCH ⏫"** prompt; tapping it fires the
  slingshot (`boost(560)` + whoosh + "⏫ LAUNCHED"). Clear cause→effect, matches
  the original #3 idea. (`App` Game, `styles.css`)

## Status: feature-complete & production-ready — autonomous loop wound down
All five feedback items resolved; Reddit-post theming gone (glyph/word tiles); the
hook (Daily Descent + streaks + leaderboard + secret-phrase multitasking + skip)
is built; app hardened + documented. Every pass kept type-check + lint + build green.

Deliberately NOT done (with reasons):
- **#1 split-screen asymmetry** — conflicts with the #4 fix (single-active-pointer:
  only one touch may drive). The "tap while you scroll" multitasking from #1 is
  delivered by the secret-phrase layer instead.
- **#3 full manual slingshot gesture** — the auto-skip on phrase-complete is clean;
  a manual charge/flick risks the jank that made the earlier slingshot feel bad.

Parked ideas if more is wanted: personal-best "ghost" line to chase in endless;
user-submitted daily phrases (UGC sub-award); cosmetic depth-zone themes.
