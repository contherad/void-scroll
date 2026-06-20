// SwipeCard.tsx — The full-area swipe surface + the scrolling feed of cards.
//
// Instead of a single card that vanishes off-screen (no sense of motion), this
// renders a feed: the hero card at the top with more posts stacked below, all
// scrolled up by the live distance. Cards recycle from a shared pool as you climb
// and ride back down when the feed falls to the middle — so there is always
// content moving past to show exactly how hard you are pushing.

import { useEffect, useRef, useState } from 'react';
import type { CardContent } from '../lib/levels';
import { SLOT } from '../lib/feed';

interface Props {
  distance: number; // px scrolled into the void (>= 0)
  hero: CardContent; // level's featured card (feed slot 0)
  pool: CardContent[]; // recycled posts for the rest of the feed
  tint?: string; // void-background tint for an active event (e.g. 'surge')
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function cardAt(index: number, hero: CardContent, pool: CardContent[]): CardContent {
  if (index === 0) return hero;
  return pool[(index - 1) % pool.length];
}

export function SwipeCard({ distance, hero, pool, tint, handlers }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The hero card rests ~40% down the screen; the feed flows below it.
  const middle = height * 0.4;

  // Only render the cards currently near the viewport (simple windowing).
  const start = Math.max(0, Math.floor((distance - middle) / SLOT) - 1);
  const count = Math.ceil(height / SLOT) + 3;

  const cards = [];
  for (let i = start; i < start + count; i++) {
    const y = middle + i * SLOT - distance; // scrolls up as distance grows
    const card = cardAt(i, hero, pool);
    cards.push(
      <article key={i} className="post-card" style={{ transform: `translate3d(0, ${y}px, 0)` }}>
        <div className="post-card__meta">
          <span className="post-card__avatar" />
          <span className="post-card__subreddit">{card.subreddit}</span>
          <span className="post-card__dot">·</span>
          <span className="post-card__author">{card.author}</span>
        </div>
        <h2 className="post-card__title">{card.title}</h2>
        {card.body && <p className="post-card__body">{card.body}</p>}
        <div className="post-card__actions">
          <span className="post-card__vote">▲ {formatCount(card.upvotes)}</span>
          <span className="post-card__comments">💬 {formatCount(card.comments)}</span>
          <span className="post-card__share">↗ Share</span>
        </div>
      </article>,
    );
  }

  return (
    <div
      ref={surfaceRef}
      className={'swipe-surface' + (tint ? ` swipe-surface--${tint}` : '')}
      {...handlers}
      role="application"
      aria-label="Swipe up to push the feed into the void"
    >
      {cards}
    </div>
  );
}
