// physics.ts — Pure functions for the Void Scroll resistance mechanic.
//
// Model:
//   - `distance` is how far the feed sits from the middle, in px (>= 0). The
//     score is simply this distance — LINEAR, so it climbs at a steady, readable
//     rate (no lurching) and every swipe is worth a consistent amount.
//   - resistance(distance) = 1 / (1 + k * distance)  -> ~1 at the middle, -> 0 the
//     higher you go, so each bit of finger travel buys a little less as you climb.
//   - Releasing (all fingers up) eases the feed back to the middle (in the hook).
//
// Pure / side-effect free; the hook owns the mutable state and animation.

export function getResistance(distance: number, k: number): number {
  return 1 / (1 + k * Math.max(0, distance));
}

/**
 * Distance the feed moves for one swipe delta (px), scaled by current resistance.
 * `rawDeltaUp` is positive swiping up and negative pulling down, so the result
 * follows the thumb both ways.
 */
export function swipeGain(distance: number, rawDeltaUp: number, k: number): number {
  return rawDeltaUp * getResistance(distance, k);
}
