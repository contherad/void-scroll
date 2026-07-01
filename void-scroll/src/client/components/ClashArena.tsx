// ClashArena.tsx — the Void Clash overlay drawn on top of the feed.
//
//   • Left rail: every racer as a dot by relative depth (deepest at the bottom),
//     with you highlighted — your at-a-glance standing.
//   • Arena: rivals within one screen of your depth become tappable avatars; tap
//     one (with ammo) to fire. Out-of-range rivals live only on the rail.
//   • Pickups: 🔩 ammo / 🛡 shield drift in — tap to collect.
//   • Arsenal: your ammo + shields, bottom-centre.
//
// FX are driven by timestamps on each Racer (firedAt/hitAt/deflectAt) compared to
// render time — the arena re-renders ~30fps from the sim, so a "recent" window is
// enough for CSS to flash them.

import { SCREEN_HALF, type Racer } from '../lib/clash';
import type { Pickup } from '../hooks/useClash';

interface Props {
  racers: Racer[];
  now: number; // sim-tick clock (performance.now domain) for FX timing — kept pure
  selfDepth: number;
  ammo: number;
  shields: number;
  pickups: Pickup[];
  onFire: (id: string) => void;
  onCollect: (id: number) => void;
}

const FX_MS = 460; // how long a fired/hit/deflect flash shows

// A rival's on-screen vertical position (%) from its depth relative to you.
function topPctFor(offset: number): number {
  const pct = 50 + (offset / SCREEN_HALF) * 32; // ±SCREEN_HALF -> 18..82
  return Math.max(15, Math.min(85, pct));
}

// Stable horizontal lane from the racer's hue, kept clear of the rail + gauge.
function leftPctFor(hue: number): number {
  return 26 + (hue / 360) * 48; // 26..74
}

export function ClashArena({ racers, now, selfDepth, ammo, shields, pickups, onFire, onCollect }: Props) {
  const t = now;
  const others = racers.filter((r) => !r.isSelf);

  // Rail range across the whole pack (you included) so the dots spread nicely.
  const depths = racers.map((r) => r.depth);
  const min = Math.min(...depths, selfDepth);
  const max = Math.max(...depths, selfDepth);
  const span = Math.max(1, max - min);
  const railTop = (d: number) => (1 - (d - min) / span) * 100; // deepest -> bottom

  const alive = racers.filter((r) => !r.gone).length;

  return (
    <div className="clash">
      {/* Standing rail */}
      <div className="clash__rail" aria-hidden="true">
        <div className="clash__rail-head">{alive}</div>
        <div className="clash__rail-track">
          {racers.map((r) => (
            <span
              key={r.id}
              className={
                'clash__pip' +
                (r.isSelf ? ' clash__pip--you' : '') +
                (r.gone ? ' clash__pip--gone' : '') +
                (t - r.hitAt < FX_MS ? ' clash__pip--hit' : '')
              }
              style={{ top: `${railTop(r.depth)}%`, ...(r.isSelf ? {} : { ['--hue' as string]: r.hue }) }}
            />
          ))}
        </div>
      </div>

      {/* On-screen rivals */}
      {others.map((r) => {
        const offset = r.depth - selfDepth;
        if (Math.abs(offset) > SCREEN_HALF) return null; // off screen -> rail only
        const fired = t - r.firedAt < FX_MS;
        const hit = t - r.hitAt < FX_MS;
        const deflected = t - r.deflectAt < FX_MS;
        return (
          <button
            key={r.id}
            className={
              'racer' +
              (r.gone ? ' racer--gone' : '') +
              (fired ? ' racer--fired' : '') +
              (hit ? ' racer--hit' : '') +
              (deflected ? ' racer--deflect' : '')
            }
            style={{
              top: `${topPctFor(offset)}%`,
              left: `${leftPctFor(r.hue)}%`,
              ['--hue' as string]: r.hue,
            }}
            onPointerDown={(e) => {
              e.stopPropagation(); // fire even while another finger is scrolling
              onFire(r.id);
            }}
            aria-label={`Fire at ${r.name}`}
          >
            {r.shields > 0 && <span className="racer__shield" />}
            <span className="racer__face">{r.glyph}</span>
            <span className="racer__name">{r.name}</span>
            {hit && <span className="racer__pop">-1000</span>}
            {deflected && <span className="racer__pop racer__pop--block">◇</span>}
          </button>
        );
      })}

      {/* Pickups */}
      {pickups.map((p) => (
        <button
          key={p.id}
          className={`pickup pickup--${p.kind}`}
          style={{ left: `${p.xPct}%`, top: `${p.yPct}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onCollect(p.id);
          }}
          aria-label={p.kind === 'ammo' ? 'Collect ammo' : 'Collect shield'}
        >
          {p.kind === 'ammo' ? '🔩' : '🛡'}
        </button>
      ))}

      {/* Arsenal */}
      <div className="arsenal">
        <span className={'arsenal__slot' + (ammo > 0 ? ' is-live' : '')}>
          🔩 <b>{ammo}</b>
        </span>
        <span className={'arsenal__slot' + (shields > 0 ? ' is-live' : '')}>
          🛡 <b>{shields}</b>
        </span>
      </div>
    </div>
  );
}
