// clash.ts (shared) — the Void Clash realtime wire protocol, used by both the
// server (broadcasts via realtime.send) and the client (receives via
// connectRealtime). Kept dependency-free so it's safe in every build target.
//
// The channel is the post id (context.postId) — already an allowed channel name
// ([a-zA-Z0-9_], the t3_ id qualifies). Every player in a post shares one void.

export type ClashMsg =
  | {
      t: 'state';
      id: string; // sender's stable user id (context.userId) — unspoofable
      name: string; // display username
      depth: number;
      ammo: number;
      shields: number;
    }
  | { t: 'fire'; from: string; target: string } // `from` shot at `target` (both user ids / 'self')
  | { t: 'leave'; id: string };
