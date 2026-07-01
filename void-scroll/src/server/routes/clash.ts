// clash.ts (server) — Void Clash realtime relay. Devvit has no client→client send,
// so clients POST their state/shots here and the server rebroadcasts to everyone on
// the post's channel via realtime.send. Stateless + best-effort: a dropped packet
// just means a slightly stale rival dot, never a broken run.
//
// Requires `permissions.realtime: true` in devvit.json (see README / deploy notes).

import { Hono } from 'hono';
import { context, realtime } from '@devvit/web/server';
import type { ClashMsg } from '../../shared/clash';

export const clash = new Hono();

const clampInt = (n: unknown, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, Math.round(typeof n === 'number' && Number.isFinite(n) ? n : 0)));

// Broadcast my latest position/arsenal to the void (called ~2×/sec by each client).
clash.post('/state', async (c) => {
  const postId = context.postId;
  const userId = context.userId;
  if (!postId || !userId) return c.json({ ok: false });
  const body = await c.req.json<{ depth?: number; ammo?: number; shields?: number; name?: string }>();
  const name = typeof body.name === 'string' && body.name ? body.name.slice(0, 24) : 'rival';
  const msg: ClashMsg = {
    t: 'state',
    id: userId,
    name,
    depth: clampInt(body.depth, 0, 100_000_000),
    ammo: clampInt(body.ammo, 0, 9),
    shields: clampInt(body.shields, 0, 9),
  };
  await realtime.send(postId, msg);
  return c.json({ ok: true });
});

// I fired at `target` — tell everyone; the target's client applies the hit.
clash.post('/fire', async (c) => {
  const postId = context.postId;
  const userId = context.userId;
  if (!postId || !userId) return c.json({ ok: false });
  const body = await c.req.json<{ target?: string }>();
  if (!body.target || typeof body.target !== 'string') return c.json({ ok: false });
  const msg: ClashMsg = { t: 'fire', from: userId, target: body.target.slice(0, 64) };
  await realtime.send(postId, msg);
  return c.json({ ok: true });
});

// I left the void — fade my dot on everyone else's screen.
clash.post('/leave', async (c) => {
  const postId = context.postId;
  const userId = context.userId;
  if (postId && userId) {
    const msg: ClashMsg = { t: 'leave', id: userId };
    await realtime.send(postId, msg).catch(() => {});
  }
  return c.json({ ok: true });
});
