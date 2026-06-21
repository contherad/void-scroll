// Leaderboard.tsx — Post-run board (global all-time, or the daily descent board).

import { isCurrentUser, type ScoreEntry } from '../lib/api';
import { achievementById, type AchievementDef } from '../../shared/achievements';

interface Props {
  entries: ScoreEntry[];
  finalScore: number;
  rank: number | null;
  loading: boolean;
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

export function Leaderboard({
  entries,
  finalScore,
  rank,
  loading,
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

        <div className="leaderboard">
          {loading ? (
            <div className="leaderboard__loading">Reading the void…</div>
          ) : entries.length === 0 ? (
            <div className="leaderboard__loading">No scores yet — you just set the bar.</div>
          ) : (
            entries.map((entry, i) => (
              <div
                key={`${entry.username}-${i}`}
                className={
                  'leaderboard__row' + (isCurrentUser(entry) ? ' leaderboard__row--you' : '')
                }
              >
                <span className="leaderboard__rank">{i + 1}</span>
                <span className="leaderboard__name">{entry.username}</span>
                <span className="leaderboard__score">{entry.score.toLocaleString()}</span>
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
