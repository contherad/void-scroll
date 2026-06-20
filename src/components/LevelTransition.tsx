// LevelTransition.tsx — Brief between-level overlay: score, what's next.

import type { LevelConfig } from '../lib/levels';

interface Props {
  cleared: LevelConfig;
  next: LevelConfig;
  score: number;
  onContinue: () => void;
}

export function LevelTransition({ cleared, next, score, onContinue }: Props) {
  const endlessNext = next.target === Infinity;

  return (
    <div className="overlay">
      <div className="overlay__panel">
        <div className="overlay__eyebrow">Level {cleared.level} cleared</div>
        <div className="overlay__score">{score.toLocaleString()}</div>
        <div className="overlay__next">
          {endlessNext ? (
            <>
              Next: <strong>Endless</strong> — no target, just distance.
            </>
          ) : (
            <>
              Next: Level {next.level} · <strong>{next.label}</strong>
            </>
          )}
        </div>
        <button className="btn btn--primary" onClick={onContinue}>
          {endlessNext ? 'Enter the void' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
