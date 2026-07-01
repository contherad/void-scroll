// useClash.ts — the live Void Clash simulation. Owns one merged list of racers
// (you + bots + any real players off the wire) and resolves combat identically for
// all of them, so bots are literally "dumb real users." Bots-only works with no
// network; a realtime transport (`net`) plugs into the SAME paths for real PvP.
//
// Coordinate note: a racer's `depth` is in the same units as your score. "On screen"
// / targetable means within SCREEN_HALF depth-px of you (see clash.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AMMO_CAP,
  FIRE_COOLDOWN,
  KNOCKBACK,
  SCREEN_HALF,
  SHIELD_CAP,
  SELF_ID,
  TARGET_RACERS,
  avatarFor,
  makeBot,
  stepBot,
  type BotBrain,
  type PickupKind,
  type Racer,
} from '../lib/clash';

const STALE_MS = 4500; // drop a real racer we haven't heard from in this long
const PUBLISH_MS = 550; // how often we broadcast our own state
const TICK_MS = 33; // sim/paint cadence (~30fps) — smooth enough, cheap enough

export interface ClashNet {
  selfId: string;
  publish: (depth: number, ammo: number, shields: number) => void;
  fireReal: (targetId: string) => void;
}

export interface Pickup {
  id: number;
  kind: PickupKind;
  xPct: number;
  yPct: number;
}

// A remote player's latest snapshot (from the realtime channel).
export interface RemoteState {
  id: string;
  name: string;
  depth: number;
  ammo: number;
  shields: number;
}

export type ClashEvent =
  | { kind: 'hit-them'; name: string }
  | { kind: 'hit-you'; name: string }
  | { kind: 'deflect-you'; name: string }
  | { kind: 'deflect-them'; name: string }
  | { kind: 'pickup'; pickup: PickupKind }
  | { kind: 'no-ammo' }
  | { kind: 'cooldown' }
  | { kind: 'out-of-range' };

export interface UseClash {
  racers: Racer[]; // includes you (id === 'self')
  clock: number; // last sim-tick timestamp (performance.now domain) — for pure FX timing
  ammo: number;
  shields: number;
  pickups: Pickup[];
  collect: (pickupId: number) => void;
  fireAt: (targetId: string) => void;
  event: { seq: number; event: ClashEvent } | null;
  // Feed realtime events in (Phase F wires these to connectRealtime).
  ingestState: (s: RemoteState) => void;
  ingestFire: (fromId: string, targetId: string) => void;
  ingestLeave: (id: string) => void;
}

interface Options {
  active: boolean;
  selfName: string;
  selfDepth: number; // live from physics.score
  onSelfHit: () => void; // App applies physics.knockback(KNOCKBACK)
  onSelfDeflect: () => void; // App plays a deflect cue
  net?: ClashNet | undefined;
}

const now = () => performance.now();

export function useClash({
  active,
  selfName,
  selfDepth,
  onSelfHit,
  onSelfDeflect,
  net,
}: Options): UseClash {
  // --- self state (this hook owns your ammo/shields/FX; physics owns your depth) ---
  const selfDepthRef = useRef(selfDepth);
  const [ammo, setAmmo] = useState(1);
  const [shields, setShields] = useState(0);
  const ammoRef = useRef(ammo);
  const shieldsRef = useRef(shields);
  const lastFireRef = useRef(0);
  const selfFxRef = useRef({ firedAt: 0, hitAt: 0, deflectAt: 0 });

  // Latest props/callbacks mirrored into refs so the rAF loop always reads fresh
  // values without re-subscribing. Synced post-render (never write refs in render).
  const onHit = useRef(onSelfHit);
  const onDeflect = useRef(onSelfDeflect);
  const netRef = useRef(net);
  useEffect(() => {
    selfDepthRef.current = selfDepth;
    ammoRef.current = ammo;
    shieldsRef.current = shields;
    onHit.current = onSelfHit;
    onDeflect.current = onSelfDeflect;
    netRef.current = net;
  });

  // --- other racers, held in refs (the loop mutates; state is a per-tick mirror) ---
  const botsRef = useRef<Map<string, { racer: Racer; brain: BotBrain }>>(new Map());
  const remotesRef = useRef<Map<string, { racer: Racer; seen: number }>>(new Map());
  const botSeq = useRef(0);

  const [racers, setRacers] = useState<Racer[]>([]);
  const [clock, setClock] = useState(0);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const pickupsRef = useRef<Pickup[]>([]); // authoritative; state mirrors it for render
  const syncPickups = useCallback((next: Pickup[]) => {
    pickupsRef.current = next;
    setPickups(next);
  }, []);
  const [event, setEvent] = useState<{ seq: number; event: ClashEvent } | null>(null);
  const eventSeq = useRef(0);

  const emit = useCallback((e: ClashEvent) => {
    setEvent({ seq: ++eventSeq.current, event: e });
  }, []);

  // Build the current self racer from refs.
  const selfRacer = useCallback((): Racer => {
    const av = avatarFor(SELF_ID);
    const fx = selfFxRef.current;
    return {
      id: SELF_ID,
      name: selfName,
      depth: selfDepthRef.current,
      isBot: false,
      isSelf: true,
      ammo: ammoRef.current,
      shields: shieldsRef.current,
      glyph: av.glyph,
      hue: av.hue,
      firedAt: fx.firedAt,
      hitAt: fx.hitAt,
      deflectAt: fx.deflectAt,
      gone: false,
    };
  }, [selfName]);

  // Resolve a landed shot on any racer. Self is special-cased (physics owns your
  // depth, so we fire callbacks instead of mutating). Returns nothing.
  const applyHit = useCallback(
    (target: Racer, byName: string) => {
      const t = now();
      if (target.isSelf) {
        if (shieldsRef.current > 0) {
          setShields((s) => Math.max(0, s - 1));
          selfFxRef.current.deflectAt = t;
          onDeflect.current();
          emit({ kind: 'deflect-you', name: byName });
        } else {
          selfFxRef.current.hitAt = t;
          onHit.current();
          emit({ kind: 'hit-you', name: byName });
        }
        return;
      }
      if (target.shields > 0) {
        target.shields -= 1;
        target.deflectAt = t;
      } else {
        target.depth = Math.max(0, target.depth - KNOCKBACK);
        target.hitAt = t;
      }
    },
    [emit],
  );

  const findRacer = useCallback((id: string): Racer | null => {
    if (id === SELF_ID) return null; // self is resolved by the caller
    const b = botsRef.current.get(id);
    if (b) return b.racer;
    const r = remotesRef.current.get(id);
    return r ? r.racer : null;
  }, []);

  // --- YOU fire at a target you tapped ---
  const fireAt = useCallback(
    (targetId: string) => {
      if (targetId === SELF_ID) return;
      const t = now();
      if (ammoRef.current <= 0) return emit({ kind: 'no-ammo' });
      if (t - lastFireRef.current < FIRE_COOLDOWN) return emit({ kind: 'cooldown' });

      const bot = botsRef.current.get(targetId)?.racer ?? null;
      const remote = remotesRef.current.get(targetId)?.racer ?? null;
      const target = bot ?? remote;
      if (!target) return;
      if (Math.abs(target.depth - selfDepthRef.current) > SCREEN_HALF) {
        return emit({ kind: 'out-of-range' });
      }

      lastFireRef.current = t;
      selfFxRef.current.firedAt = t;
      setAmmo((a) => Math.max(0, a - 1));

      if (remote && !bot) {
        // Real player — their client applies the hit. We show the shot + our claim.
        netRef.current?.fireReal(targetId);
        emit({ kind: target.shields > 0 ? 'deflect-them' : 'hit-them', name: target.name });
      } else if (bot) {
        const deflected = bot.shields > 0;
        applyHit(bot, selfName);
        emit({ kind: deflected ? 'deflect-them' : 'hit-them', name: bot.name });
      }
    },
    [applyHit, emit, selfName],
  );

  // --- realtime ingest (Phase F) ------------------------------------------------
  const ingestState = useCallback((s: RemoteState) => {
    if (s.id === SELF_ID || s.id === netRef.current?.selfId) return;
    const existing = remotesRef.current.get(s.id);
    if (existing) {
      existing.racer.depth = s.depth;
      existing.racer.ammo = s.ammo;
      existing.racer.shields = s.shields;
      existing.racer.name = s.name;
      existing.racer.gone = false;
      existing.seen = now();
    } else {
      const av = avatarFor(s.id);
      remotesRef.current.set(s.id, {
        seen: now(),
        racer: {
          id: s.id,
          name: s.name,
          depth: s.depth,
          isBot: false,
          isSelf: false,
          ammo: s.ammo,
          shields: s.shields,
          glyph: av.glyph,
          hue: av.hue,
          firedAt: 0,
          hitAt: 0,
          deflectAt: 0,
          gone: false,
        },
      });
    }
  }, []);

  const ingestFire = useCallback(
    (fromId: string, targetId: string) => {
      const from = remotesRef.current.get(fromId)?.racer;
      if (from) from.firedAt = now();
      if (targetId === SELF_ID || targetId === netRef.current?.selfId) {
        applyHit(selfRacer(), from?.name ?? 'a rival');
      } else {
        const bot = botsRef.current.get(targetId)?.racer;
        if (bot) applyHit(bot, from?.name ?? 'a rival');
      }
    },
    [applyHit, selfRacer],
  );

  const ingestLeave = useCallback((id: string) => {
    const r = remotesRef.current.get(id);
    if (r) r.racer.gone = true;
  }, []);

  // --- pickups (ammo/shield drift in like the bonus orbs) -----------------------
  const pickupId = useRef(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (cancelled) return;
          const id = ++pickupId.current;
          const kind: PickupKind = Math.random() < 0.62 ? 'ammo' : 'shield';
          const p: Pickup = { id, kind, xPct: 16 + Math.random() * 68, yPct: 26 + Math.random() * 46 };
          syncPickups([...pickupsRef.current, p]);
          window.setTimeout(() => {
            if (!cancelled) syncPickups(pickupsRef.current.filter((x) => x.id !== id));
          }, 3400);
          schedule();
        },
        2200 + Math.random() * 2600,
      );
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, syncPickups]);

  const collect = useCallback(
    (id: number) => {
      const hit = pickupsRef.current.find((p) => p.id === id);
      if (!hit) return;
      syncPickups(pickupsRef.current.filter((p) => p.id !== id));
      if (hit.kind === 'ammo') setAmmo((a) => Math.min(AMMO_CAP, a + 1));
      else setShields((s) => Math.min(SHIELD_CAP, s + 1));
      emit({ kind: 'pickup', pickup: hit.kind });
    },
    [emit, syncPickups],
  );

  // --- the sim loop -------------------------------------------------------------
  useEffect(() => {
    if (!active) return;
    let rafHandle: number | null = null;
    let toHandle: number | null = null;
    let last = now();
    let lastPublish = 0;

    const loop = () => {
      const t = now();
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;

      // Keep the void full: spawn bots up to TARGET_RACERS minus live remotes.
      const liveRemotes = [...remotesRef.current.values()].filter((r) => !r.racer.gone).length;
      const wantBots = Math.max(0, TARGET_RACERS - 1 - liveRemotes);
      while (botsRef.current.size < wantBots) {
        const idx = ++botSeq.current;
        const b = makeBot(idx, selfDepthRef.current + 300);
        b.brain = { ...b.brain, nextRest: t + 3000, nextPickup: t + 3000, nextFire: t + 3000 };
        botsRef.current.set(b.racer.id, b);
      }
      // If humans arrived, retire surplus bots (the shallowest, least missed).
      if (botsRef.current.size > wantBots) {
        const sorted = [...botsRef.current.values()].sort((a, b) => a.racer.depth - b.racer.depth);
        for (let i = 0; i < botsRef.current.size - wantBots; i++) {
          botsRef.current.delete(sorted[i]!.racer.id);
        }
      }

      // Targets everyone can shoot at: self + all other racers.
      const targets = [
        { id: SELF_ID, depth: selfDepthRef.current },
        ...[...botsRef.current.values()].map((b) => ({ id: b.racer.id, depth: b.racer.depth })),
        ...[...remotesRef.current.values()].map((r) => ({ id: r.racer.id, depth: r.racer.depth })),
      ];

      // Step every bot; route its shots through the shared hit resolution.
      for (const { racer, brain } of botsRef.current.values()) {
        const res = stepBot(racer, brain, { now: t, dt, targets });
        if (res.fireAt) {
          if (res.fireAt === SELF_ID) applyHit(selfRacer(), racer.name);
          else {
            const victim = findRacer(res.fireAt);
            if (victim) applyHit(victim, racer.name);
          }
        }
      }

      // Expire stale remotes.
      for (const [id, r] of remotesRef.current) {
        if (t - r.seen > STALE_MS) {
          r.racer.gone = true;
          if (t - r.seen > STALE_MS * 2) remotesRef.current.delete(id);
        }
      }

      // Broadcast our own state.
      if (netRef.current && t - lastPublish > PUBLISH_MS) {
        lastPublish = t;
        netRef.current.publish(selfDepthRef.current, ammoRef.current, shieldsRef.current);
      }

      // Mirror into React for rendering.
      const list = [
        selfRacer(),
        ...[...botsRef.current.values()].map((b) => b.racer),
        ...[...remotesRef.current.values()].filter((r) => !r.racer.gone).map((r) => r.racer),
      ];
      setRacers(list);
      setClock(t);

      toHandle = window.setTimeout(() => {
        toHandle = null;
        rafHandle = requestAnimationFrame(loop);
      }, TICK_MS);
    };
    rafHandle = requestAnimationFrame(loop);
    return () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      if (toHandle !== null) clearTimeout(toHandle);
    };
  }, [active, applyHit, findRacer, selfRacer]);

  return {
    racers,
    clock,
    ammo,
    shields,
    pickups,
    collect,
    fireAt,
    event,
    ingestState,
    ingestFire,
    ingestLeave,
  };
}
