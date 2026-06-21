// Leaderboard.tsx — Post-run results: your score + rank, any badge unlocks, and
// three browsable boards (All-time depth / Today / Longest streak) behind tabs.

import { useState } from 'react';
import { isCurrentUser, type ScoreEntry } from '../lib/api';
import { achievementById, type AchievementDef } from '../../shared/achievements';

export interface LbBoard {
  id: string;
  label: string;
  entries: ScoreEntry[];
  unit: 'depth' | 'days';
}

interface Props {
  finalScore: number;
  rank: number | null;
  loading: boolean;
  boards: LbBoard[];
  defaultTab: string;
  onPlayAgain: () => void;
  title?: string;
  rankNoun?: string; // "the void" (global) or "today's descent" (daily)
  streak?: number | null;
  footnote?: string | undefined; // e.g. "New descent in ~7h"
  playAgainLabel?: string;
  onShare?: (() => void) | undefined;
  shareState?: 'idle' | 'sharing' | 'done' | 'failed';
  newAchievements?: string[];
}

const SHARE_LABEL: Record<NonNullable<Props['shareState']>, string> = {
  idle: '📣 Brag in comments',
  sharing: 'Sharing…',
  done: '✓ Shared to comments',
  failed: '✗ Couldn’t share — try again',
};

function fmt(score: number, unit: 'depth' | 'days'): string {
  return unit === 'days' ? `🔥 ${score}` : score.toLocaleString();
}

export function Leaderboard({
  finalScore,
  rank,
  loading,
  boards,
  defaultTab,
  onPlayAgain,
  title = 'Run complete',
  rankNoun = 'the void',
  streak = null,
  footnote,
  playAgainLabel = 'Play again',
  onShare,
  shareState = 'idle',
  newAchievements = [],
}: Props) {
  const [tab, setTab] = useState(defaultTab);
  const active = boards.find((b) => b.id === tab) ?? boards[0];
  const unlocked = newAchievements
    .map(achievementById)
    .filter((a): a is AchievementDef => a != null);

  return (
    <div className="overlay">
      <div className="overlay__panel overlay__panel--wide">
        <div className="overlay__eyebrow">{title}</div>
        <div className="overlay__score">{finalScore.toLocaleString()}</div>
        {rank !== null && (
          <div className="overlay__rank">
            You ranked <strong>#{rank}</strong> in {rankNoun}
          </div>
        )}
        {streak !== null && streak > 0 && (
          <div className="overlay__streak">🔥 {streak}-day streak</div>
        )}

        {unlocked.length > 0 && (
          <div className="unlocked">
            <div className="unlocked__title">★ Badge{unlocked.length > 1 ? 's' : ''} unlocked</div>
            {unlocked.map((a) => (
              <div className="unlocked__row" key={a.id}>
                <span className="unlocked__icon">{a.icon}</span>
                <span className="unlocked__name">{a.title}</span>
                <span className="unlocked__desc">{a.desc}</span>
              </div>
            ))}
          </div>
        )}

        <div className="lbtabs">
          {boards.map((b) => (
            <button
              key={b.id}
              className={'lbtabs__tab' + (b.id === active?.id ? ' is-active' : '')}
              onClick={() => setTab(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="leaderboard">
          {loading ? (
            <div className="leaderboard__loading">Reading the void…</div>
          ) : !active || active.entries.length === 0 ? (
            <div className="leaderboard__loading">No scores yet — you just set the bar.</div>
          ) : (
            active.entries.map((entry, i) => (
              <div
                key={`${entry.username}-${i}`}
                className={
                  'leaderboard__row' + (isCurrentUser(entry) ? ' leaderboard__row--you' : '')
                }
              >
                <span className="leaderboard__rank">{i + 1}</span>
                <span className="leaderboard__name">{entry.username}</span>
                <span className="leaderboard__score">{fmt(entry.score, active.unit)}</span>
              </div>
            ))
          )}
        </div>

        {footnote && <div className="overlay__footnote">{footnote}</div>}

        {onShare && (
          <button
            className="btn btn--share"
            onClick={onShare}
            disabled={shareState === 'sharing' || shareState === 'done'}
          >
            {SHARE_LABEL[shareState]}
          </button>
        )}

        <button className="btn btn--primary" onClick={onPlayAgain}>
          {playAgainLabel}
        </button>
      </div>
    </div>
  );
}
