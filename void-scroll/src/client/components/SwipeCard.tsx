// SwipeCard.tsx — The full-area swipe surface + the scrolling feed of tiles.
//
// The feed is a column of drifting glyph+word tiles. Some tiles are LETTER
// targets (styled distinctly) — tapping one while you scroll collects its letter
// toward the run's secret phrase. Scroll and tap coexist on one surface: a quick
// pointer with no movement is a tap (hit-tested against the tiles); a moving
// pointer drives the scroll. So one thumb can climb while another taps.

import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { CardContent } from '../lib/levels';
import { SLOT } from '../lib/feed';
import { unlockAudio } from '../lib/sfx';

const TILE_W = 220;
const TILE_H = 132;
const TAP_MOVE = 10; // px — beyond this a gesture is a swipe, not a tap
const TAP_MS = 350; // ms — longer than this is not a tap

interface Props {
  distance: number; // px scrolled into the void (>= 0)
  hero: CardContent; // level's featured tile (feed slot 0)
  pool: CardContent[]; // recycled tiles for the rest of the feed
  items: number; // finite feed length (Infinity for endless = recycle forever)
  onMeasure?: (clearDistance: number) => void; // distance at which the last tile leaves
  phrase: string; // the run's secret phrase (letter tiles spell it out)
  letterMap: Map<number, number>; // feed-index -> letter order (word repeats, missed letters cycle)
  collected: Set<number>; // which letter orders have been tapped
  onCollect: (order: number) => void;
  markers?: FeedMarker[]; // depth lines to chase (your best, the #1 player) — endless only
  tint?: string | undefined; // void-background tint for an active event (e.g. 'surge')
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

export interface FeedMarker {
  depth: number; // distance (px) at which this line sits
  label: string;
  kind: 'best' | 'top';
}

function cardAt(index: number, hero: CardContent, pool: CardContent[]): CardContent {
  if (index === 0) return hero;
  return pool[(index - 1) % pool.length] ?? hero;
}

export function SwipeCard({
  distance,
  hero,
  pool,
  items,
  onMeasure,
  phrase,
  letterMap,
  collected,
  onCollect,
  markers,
  tint,
  handlers,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);

  // Live distance for hit-testing taps (distance changes every frame).
  const distanceRef = useRef(distance);
  useEffect(() => {
    distanceRef.current = distance;
  });

  // Per-pointer tap tracking: a quick, near-stationary pointer is a tap.
  const tapsRef = useRef<Map<number, { x: number; y: number; t: number; moved: boolean }>>(
    new Map(),
  );

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Report the distance at which the LAST finite tile clears the top of the screen,
  // so a campaign level completes exactly as the feed empties.
  useEffect(() => {
    if (!onMeasure || !Number.isFinite(items)) return;
    onMeasure(height * 0.4 + (items - 1) * SLOT + TILE_H);
  }, [height, items, onMeasure]);

  const tryCollect = (clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const middle = rect.height * 0.4;
    const d = distanceRef.current;
    const i = Math.floor((localY - middle + d) / SLOT);
    const top = middle + i * SLOT - d;
    if (localY < top || localY > top + TILE_H) return; // fell in the gap between tiles
    if (Math.abs(localX - rect.width / 2) > TILE_W / 2) return; // outside the tile width
    const order = letterMap.get(i);
    if (order !== undefined && !collected.has(order)) onCollect(order);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    unlockAudio(); // first gesture unlocks Web Audio
    tapsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
    handlers.onPointerDown(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const tp = tapsRef.current.get(e.pointerId);
    if (tp && !tp.moved && (Math.abs(e.clientX - tp.x) > TAP_MOVE || Math.abs(e.clientY - tp.y) > TAP_MOVE)) {
      tp.moved = true;
    }
    handlers.onPointerMove(e);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const tp = tapsRef.current.get(e.pointerId);
    tapsRef.current.delete(e.pointerId);
    if (tp && !tp.moved && performance.now() - tp.t < TAP_MS) {
      tryCollect(e.clientX, e.clientY);
    }
    handlers.onPointerUp(e);
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    tapsRef.current.delete(e.pointerId);
    handlers.onPointerCancel(e);
  };

  // The hero tile rests ~40% down the screen; the feed flows below it.
  const middle = height * 0.4;
  const start = Math.max(0, Math.floor((distance - middle) / SLOT) - 1);
  const count = Math.ceil(height / SLOT) + 3;

  // Depth markers (your best / the #1 player): a line at screen-Y = middle + depth -
  // distance, so it rides up the feed and you watch yourself overtake it.
  const markerEls = (markers ?? []).map((m) => {
    const y = middle + m.depth - distance;
    if (y < -10 || y > height + 10) return null; // off-screen
    return (
      <div key={m.kind} className={`feedmark feedmark--${m.kind}`} style={{ transform: `translate3d(0, ${y}px, 0)` }}>
        <span className="feedmark__label">{m.label}</span>
      </div>
    );
  });

  const tiles = [];
  for (let i = start; i < start + count; i++) {
    if (i >= items) break; // finite feed (campaign): nothing past the last tile
    const y = middle + i * SLOT - distance; // scrolls up as distance grows
    const transform = `translate3d(0, ${y}px, 0)`;
    const order = letterMap.get(i);
    if (order !== undefined) {
      const got = collected.has(order);
      tiles.push(
        <article
          key={i}
          className={'tile tile--target' + (got ? ' tile--got' : '')}
          style={{ transform }}
        >
          <span className="tile__letter">{phrase[order]}</span>
          <span className="tile__hint">{got ? 'got it' : 'tap'}</span>
        </article>,
      );
    } else {
      const card = cardAt(i, hero, pool);
      tiles.push(
        <article key={i} className="tile" style={{ transform }}>
          <span className="tile__glyph">{card.glyph}</span>
          <span className="tile__word">{card.word}</span>
        </article>,
      );
    }
  }

  return (
    <div
      ref={surfaceRef}
      className={'swipe-surface' + (tint ? ` swipe-surface--${tint}` : '')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="application"
      aria-label="Swipe up to descend; tap the glowing letters to build the phrase"
    >
      {tiles}
      {markerEls}
    </div>
  );
}
