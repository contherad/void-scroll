import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LeaderboardResponse } from '../shared/api';

// The inline card shown in the feed. Tapping expands into the 'game' entrypoint.
export const Splash = () => {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    void fetch('/api/leaderboard')
      .then((r) => (r.ok ? (r.json() as Promise<LeaderboardResponse>) : null))
      .then((d) => {
        const first = d?.entries?.[0];
        if (first) setTop(first.score);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        minHeight: '100vh',
        padding: 24,
        textAlign: 'center',
        background: 'radial-gradient(120% 80% at 50% 120%, #16161c 0%, #0d0d0d 60%)',
        color: '#e8e8e8',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: 2,
          background: 'linear-gradient(180deg, #fff, #9aa7d6)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        VOID&nbsp;SCROLL
      </div>
      <p style={{ margin: 0, maxWidth: 280, color: '#8a8a8a', lineHeight: 1.4 }}>
        The feed pushes back. Keep it aloft with two thumbs and see how deep you can go.
      </p>
      {top != null && (
        <div style={{ fontFamily: 'ui-monospace, monospace', color: '#6b8afd' }}>
          Deepest so far: {top.toLocaleString()}
        </div>
      )}
      <button
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        style={{
          marginTop: 6,
          appearance: 'none',
          border: 'none',
          background: '#ff4500',
          color: '#fff',
          fontSize: 17,
          fontWeight: 700,
          padding: '14px 32px',
          borderRadius: 999,
          cursor: 'pointer',
        }}
      >
        Tap to descend
      </button>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>,
);
