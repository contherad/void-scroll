// Leaderboard.tsx — Top scores pulled from the (mock) leaderboard API.

import { isCurrentUser, type ScoreEntry } from '../lib/api';

interface Props {
  entries: ScoreEntry[];
  finalScore: number;
  rank: number | null;
  loading: boolean;
  onPlayAgain: () => void;
}

export function Leaderboard({ entries, finalScore, rank, loading, onPlayAgain }: Props) {
  return (
    <div className="overlay">
      <div className="overlay__panel overlay__panel--wide">
        <div className="overlay__eyebrow">Run complete</div>
        <div className="overlay__score">{finalScore.toLocaleString()}</div>
        {rank !== null && (
          <div className="overlay__rank">
            You ranked <strong>#{rank}</strong> in the void
          </div>
        )}

        <div className="leaderboard">
          {loading ? (
            <div className="leaderboard__loading">Reading the void…</div>
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

        <button className="btn btn--primary" onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </div>
  );
}
