// clashNet.ts — the realtime transport for Void Clash. Bridges the Devvit channel
// to the local sim (useClash): inbound messages feed ingest*, outbound state/shots
// POST to the server relay (server/routes/clash.ts), which rebroadcasts them.
//
// `@devvit/web/client` is DYNAMICALLY imported behind a guard so the standalone
// web build (GitHub Pages, no Devvit host) never hard-depends on it — there,
// openClash() resolves to null and the game runs bots-only, exactly as before.

import type { ClashMsg } from '../../shared/clash';
import type { ClashNet, RemoteState } from '../hooks/useClash';

interface ChannelHandlers {
  onState: (s: RemoteState) => void;
  onFire: (from: string, target: string) => void;
  onLeave: (id: string) => void;
}

export interface ClashConn {
  net: ClashNet;
  close: () => void;
}

async function loadClient(): Promise<typeof import('@devvit/web/client') | null> {
  try {
    return await import('@devvit/web/client');
  } catch {
    return null; // not running inside Devvit (e.g. the static web build)
  }
}

function post(url: string, body: unknown): void {
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/**
 * Join the post's void. Returns a transport (publish/fireReal + close), or null
 * when there's no Devvit host / no post — the caller then stays bots-only.
 */
export async function openClash(
  selfName: string,
  handlers: ChannelHandlers,
): Promise<ClashConn | null> {
  const mod = await loadClient();
  if (!mod) return null;

  const postId = mod.context?.postId;
  const userId = mod.context?.userId;
  if (!postId || !userId) return null; // need a real post + identity to sync

  mod.connectRealtime<ClashMsg>({
    channel: postId,
    onMessage: (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'state') {
        handlers.onState({ id: m.id, name: m.name, depth: m.depth, ammo: m.ammo, shields: m.shields });
      } else if (m.t === 'fire') {
        handlers.onFire(m.from, m.target);
      } else if (m.t === 'leave') {
        handlers.onLeave(m.id);
      }
    },
  });

  const net: ClashNet = {
    selfId: userId,
    publish: (depth, ammo, shields) => post('/api/clash/state', { depth, ammo, shields, name: selfName }),
    fireReal: (targetId) => post('/api/clash/fire', { target: targetId }),
  };

  return {
    net,
    close: () => {
      post('/api/clash/leave', {});
      try {
        mod.disconnectRealtime(postId);
      } catch {
        /* already gone */
      }
    },
  };
}
