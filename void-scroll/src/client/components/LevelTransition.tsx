// LevelTransition.tsx — Brief between-level overlay: score, what's next.

import type { LevelConfig } from '../lib/levels';

interface Props {
  cleared: LevelConfig;
  next: LevelConfig;
  onContinue: () => void;
}

export function LevelTransition({ cleared, next, onContinue }: Props) {
  const endlessNext = next.items === Infinity;

  return (
    <div className="overlay">
      <div className="overlay__panel">
        <div className="overlay__eyebrow">Level {cleared.level} · {cleared.label}</div>
        <div className="overlay__cleared">✦ feed cleared ✦</div>
        <div className="overlay__next">
          {endlessNext ? (
            <>
              Next: <strong>Endless</strong> — no end, just the void (and a secret word).
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
