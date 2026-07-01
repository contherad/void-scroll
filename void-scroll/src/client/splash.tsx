import './index.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChallengeInfo, InitResponse, LeaderboardResponse } from '../shared/api';

const WRAP: CSSProperties = {
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
};

function cta(label: string, color: string): ReactElement {
  return (
    <button
      onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      style={{
        marginTop: 6,
        appearance: 'none',
        border: 'none',
        background: color,
        color: '#fff',
        fontSize: 17,
        fontWeight: 700,
        padding: '14px 32px',
        borderRadius: 999,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// The inline card shown in the feed. Tapping expands into the 'game' entrypoint.
// A Challenge post shows the target to beat right here, so it's enticing in-feed.
export const Splash = () => {
  const [top, setTop] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null);

  useEffect(() => {
    void fetch('/api/init')
      .then((r) => (r.ok ? (r.json() as Promise<InitResponse>) : null))
      .then((d) => {
        if (d?.challenge) setChallenge(d.challenge);
      })
      .catch(() => {});
    void fetch('/api/leaderboard')
      .then((r) => (r.ok ? (r.json() as Promise<LeaderboardResponse>) : null))
      .then((d) => {
        const first = d?.entries?.[0];
        if (first) setTop(first.score);
      })
      .catch(() => {});
  }, []);

  if (challenge) {
    return (
      <div style={WRAP}>
        <div style={{ fontSize: 13, letterSpacing: 3, color: '#ff9a9a', fontWeight: 700 }}>
          🎯 CHALLENGE · by u/{challenge.creator}
        </div>
        <div style={{ fontSize: 13, color: '#8a8a8a' }}>can you out-scroll them?</div>
        <div
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontSize: 52,
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1,
          }}
        >
          {challenge.target.toLocaleString()}
        </div>
        <div style={{ fontSize: 13, color: '#8a8a8a' }}>
          beat this depth in the void
          {challenge.word ? (
            <>
              {' · spell '}
              <strong style={{ color: '#ffd98a', letterSpacing: 1 }}>{challenge.word}</strong>
            </>
          ) : null}
        </div>
        {cta('Take the Challenge', '#d94a4a')}
      </div>
    );
  }

  return (
    <div style={WRAP}>
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
      {cta('Tap to descend', '#ff4500')}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>,
);
