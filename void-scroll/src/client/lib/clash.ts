// clash.ts — Void Clash core model: racers, pickups, tunables, and the dumb bot AI.
//
// The design goal (user's words): "bots are just dumb real users." So a bot is the
// SAME `Racer` struct a human gets, and it collects/fires/gets-hit through the exact
// same paths — the game renders one merged list and can't tell them apart. Real
// players arrive over realtime and slot into the same list (see hooks/useClash.ts).

// ---- Tunables (easy to balance) --------------------------------------------
export const KNOCKBACK = 1000; // depth lost when a shot lands (and you have no shield)
export const FIRE_COOLDOWN = 1000; // ms between your shots
export const AMMO_CAP = 3; // max offensive rounds you can hold
export const SHIELD_CAP = 2; // max shields (each blocks one incoming hit)
export const TARGET_RACERS = 6; // fill the void to this many racers (including you)

// A rival within this many depth-px of you is "on screen": rendered as a tappable
// avatar and a valid target. Anyone further shows only as a tick on the depth rail.
export const SCREEN_HALF = 460;

export const SELF_ID = 'self';

export type PickupKind = 'ammo' | 'shield';

// One racer in the void — you, a bot, or (later) a real player off the wire.
export interface Racer {
  id: string; // 'self' | 'bot:<name>' | a real player's id
  name: string; // display username (no u/ prefix)
  depth: number; // current depth (same units as your score)
  isBot: boolean;
  isSelf: boolean;
  ammo: number;
  shields: number;
  glyph: string; // avatar face
  hue: number; // avatar colour (0..360)
  firedAt: number; // ms of last shot fired (muzzle FX)
  hitAt: number; // ms of last hit taken (flash)
  deflectAt: number; // ms of last shield deflect (FX)
  gone: boolean; // real player who dropped off the wire (fade out)
}

// ---- Avatars ---------------------------------------------------------------
const GLYPHS = ['◈', '❂', '✵', '❖', '◆', '✸', '❄', '✦', '⬡', '❉', '✹', '◐'];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic avatar (glyph + hue) from an id, so a racer always looks the same. */
export function avatarFor(id: string): { glyph: string; hue: number } {
  const h = hashString(id);
  return { glyph: GLYPHS[h % GLYPHS.length]!, hue: h % 360 };
}

// ---- Bot identities --------------------------------------------------------
// Reddit-plausible handles so a filled room reads as real people, never "Bot 3".
const NAME_STEMS = [
  'nyx', 'kael', 'mara', 'orbit', 'moth', 'vesper', 'quill', 'echo', 'rune', 'sable',
  'lumen', 'onyx', 'wren', 'cove', 'dusk', 'flint', 'ivo', 'juno', 'koi', 'lark',
  'mire', 'nova', 'pike', 'reef', 'silt', 'tide', 'umbra', 'vale', 'wisp', 'zephyr',
];
const NAME_TAILS = ['', '', '_', '_v', '_x', '99', '_falls', '42', 'ish', '_void', '7', '_hg'];

/** A stable, human-looking username for a bot slot index (seeded so it's varied). */
export function botName(index: number): string {
  const seed = hashString(`bot:${index}:${Math.floor(Math.random() * 1e6)}`);
  const stem = NAME_STEMS[seed % NAME_STEMS.length]!;
  const tail = NAME_TAILS[(seed >> 8) % NAME_TAILS.length]!;
  return stem + tail;
}

// ---- Bot brain (kept out of Racer so it never serializes over the wire) -----
export interface BotBrain {
  speed: number; // baseline climb, depth-px per second
  aggression: number; // 0..1 chance it takes a shot when able
  resting: boolean; // briefly "let go" (human pause) — slips a little
  restUntil: number;
  nextRest: number;
  nextPickup: number;
  nextFire: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function makeBotBrain(now: number): BotBrain {
  return {
    speed: rand(130, 380),
    aggression: rand(0.35, 0.9),
    resting: false,
    restUntil: 0,
    nextRest: now + rand(2500, 6000),
    nextPickup: now + rand(2000, 5000),
    nextFire: now + rand(2500, 6000),
  };
}

/** Spawn a bot near the pack so the room feels alive from the first frame. */
export function makeBot(index: number, startDepth: number): { racer: Racer; brain: BotBrain } {
  const name = botName(index);
  const id = `bot:${index}:${name}`;
  const av = avatarFor(id);
  return {
    racer: {
      id,
      name,
      depth: Math.max(0, startDepth + rand(-500, 500)),
      isBot: true,
      isSelf: false,
      ammo: Math.random() < 0.5 ? 1 : 0,
      shields: Math.random() < 0.3 ? 1 : 0,
      glyph: av.glyph,
      hue: av.hue,
      firedAt: 0,
      hitAt: 0,
      deflectAt: 0,
      gone: false,
    },
    brain: makeBotBrain(0),
  };
}

export interface BotStepCtx {
  now: number; // ms clock (performance.now)
  dt: number; // seconds since last step
  targets: { id: string; depth: number }[]; // everyone else (self included), for targeting
}

export interface BotStepResult {
  fireAt?: string; // id this bot chose to shoot this step
}

/**
 * Advance one bot by `dt`. Mutates `racer` (depth/ammo/shields/firedAt) and `brain`;
 * returns a fire action when it decides to shoot. Deliberately dumb: climb with
 * jitter, occasionally rest (slip), pick up ammo/shields on a timer, and shoot a
 * rival that's on screen. Same fire path a human uses, so hits on YOU come through
 * identically to a real player's shot.
 */
export function stepBot(racer: Racer, brain: BotBrain, ctx: BotStepCtx): BotStepResult {
  const { now, dt } = ctx;

  // Rest/climb toggle — short human-like pauses where it slips backward a touch.
  if (brain.resting) {
    if (now >= brain.restUntil) {
      brain.resting = false;
      brain.nextRest = now + rand(2500, 6500);
    }
  } else if (now >= brain.nextRest) {
    brain.resting = true;
    brain.restUntil = now + rand(300, 1100);
  }

  if (brain.resting) {
    racer.depth = Math.max(0, racer.depth - brain.speed * 0.4 * dt);
  } else {
    racer.depth += brain.speed * (0.75 + Math.random() * 0.5) * dt;
  }

  // Collect a pickup every few seconds (respecting caps).
  if (now >= brain.nextPickup) {
    brain.nextPickup = now + rand(3500, 8000);
    if (Math.random() < 0.55 && racer.ammo < AMMO_CAP) racer.ammo++;
    else if (racer.shields < SHIELD_CAP) racer.shields++;
  }

  // Take a shot at an on-screen rival.
  let fireAt: string | undefined;
  if (now >= brain.nextFire && racer.ammo > 0) {
    brain.nextFire = now + FIRE_COOLDOWN + rand(700, 2400);
    const inRange = ctx.targets.filter(
      (t) => t.id !== racer.id && Math.abs(t.depth - racer.depth) <= SCREEN_HALF,
    );
    if (inRange.length > 0 && Math.random() < brain.aggression) {
      const pick = inRange[Math.floor(Math.random() * inRange.length)]!;
      racer.ammo--;
      racer.firedAt = now;
      fireAt = pick.id;
    }
  }

  return fireAt ? { fireAt } : {};
}
