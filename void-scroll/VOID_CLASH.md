# Void Clash — live multiplayer mode

A live, drop-in PvP layer on the descent: race other players down the same void and
fight with collectible **ammo** and **shields**. Real players when present, seamless
**bots** to fill the void otherwise — bots run the exact same code path as humans, so
you can't tell them apart and real PvP is always exercised.

## How it plays
- **Menu → ⚔ Void Clash · live.**
- Descend as normal. A left **rail** shows every racer's depth (deepest wins); rivals
  within one screen render as tappable **avatars**.
- **🔩 Ammo** / **🛡 Shield** pickups drift in — tap to collect (caps 3 / 2).
- **Tap a rival** (with ammo, ~1s cooldown) to fire. A hit **knocks them back 1,000
  depth** — unless they have a shield, which absorbs it ("deflected").
- Bots collect, fire, get hit, and deflect through the same resolution you do.

## Architecture
| Piece | File | Notes |
|---|---|---|
| Racer model, bot AI, tunables | `src/client/lib/clash.ts` | `KNOCKBACK`, caps, `stepBot()` |
| Sim (merged racers + combat) | `src/client/hooks/useClash.ts` | bots + real in one list; `net` seam |
| Arena overlay (avatars/rail/FX) | `src/client/components/ClashArena.tsx` | |
| Knockback | `src/client/hooks/useSwipePhysics.ts` | `knockback(px)` |
| Wire-up + mode | `src/client/App.tsx` | `ClashGame`, menu button |
| Wire protocol | `src/shared/clash.ts` | `ClashMsg` (state/fire/leave) |
| Realtime relay (server) | `src/server/routes/clash.ts` | `realtime.send` on the post channel |
| Realtime transport (client) | `src/client/lib/clashNet.ts` | `connectRealtime`, dynamic-imported |

**Netcode:** Devvit has no client→client send, so each client POSTs its state (~2×/s)
and shots to the server relay, which rebroadcasts on the post's channel (`context.postId`).
Client-reported / best-effort — fine for a casual race; the canonical leaderboard score is
still validated server-side on submit. Bot fill = `TARGET_RACERS − 1 − liveRemotes`, so
bots retire as real players arrive.

## ⚠️ Deploy step — required for real multiplayer
Realtime is **off by default** and must be enabled in `devvit.json`. This project
currently has **no `permissions` block**, so add one — but verify carefully, because a
`permissions` block may be exhaustive (unlisted perms default to `false`, which could
disable the working Redis leaderboard / comments):

1. Add `"permissions": { "realtime": true }` and deploy to `void_scroll_dev`.
2. **Confirm the leaderboard + auto-updating comment still work.** If they broke, the
   block is exhaustive → also add `"redis": true` and the `"reddit"` grant the app uses
   (comments/custom posts run as `APP`), then redeploy.

Bots-only mode needs none of this and works today (incl. the standalone web build,
where the Devvit host is absent and the transport no-ops).

## Testing real PvP
Needs a Devvit deploy (can't be exercised locally): `npm run deploy`, open the game post
in **two** browsers/accounts, and confirm each sees the other's dot move and that a shot
knocks the target back 1,000 (or deflects on a shield).

## Not done (MVP scope)
- **Redis presence** — roster is derived from channel traffic, not a heartbeat set; good
  enough to size bot fill, but there's no server-authoritative "who's live" list.
- **Server authority / anti-cheat** — positions are client-reported.
